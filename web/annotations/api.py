import base64
import json
import os
import sys

import cv2
from django.core.files.base import ContentFile
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# Make the project-root frame_cache importable
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from frame_cache import FrameCache

from .models import Annotation, Category, ExportFile, VideoFile
from .serializers import AnnotationSerializer, CategorySerializer, ExportFileSerializer
from .utils import get_local_video_path

# Module-level shared cache instance (lives for the duration of the process)
_frame_cache = FrameCache(max_frames=64, max_captures=8)


class AnnotationViewSet(viewsets.ModelViewSet):
    serializer_class = AnnotationSerializer

    def get_queryset(self):
        qs = Annotation.objects.filter(created_by=self.request.user)
        image_id = self.request.query_params.get("image_id")
        if image_id is not None:
            qs = qs.filter(image_id=image_id)
        frame_number = self.request.query_params.get("frame_number")
        if frame_number is not None:
            qs = qs.filter(frame_number=frame_number)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    queryset = Category.objects.all()


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_category(request, category_id):
    """Delete a category and reassign its annotations to the default category."""
    if category_id == 1:
        return Response(
            {"detail": "Cannot delete the default category."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        cat = Category.objects.get(pk=category_id)
    except Category.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    default_cat, _ = Category.objects.get_or_create(
        pk=1, defaults={"name": "object", "supercategory": "none"}
    )
    Annotation.objects.filter(category=cat).update(category=default_cat)
    cat.delete()
    return Response({"detail": "Deleted."}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_coco(request, video_id):
    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    annotations = video.annotations.all()
    categories = Category.objects.all()

    coco = {
        "images": [video.to_coco_dict()],
        "annotations": [a.to_coco_dict() for a in annotations],
        "categories": [
            {"id": c.pk, "name": c.name, "supercategory": c.supercategory, "color": c.color}
            for c in categories
        ],
    }
    return Response(coco)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_coco(request):
    try:
        data = request.data if isinstance(request.data, dict) else json.loads(request.data)
    except (json.JSONDecodeError, ValueError):
        return Response({"detail": "Invalid JSON."}, status=status.HTTP_400_BAD_REQUEST)

    # Ensure default category
    Category.objects.get_or_create(pk=1, defaults={"name": "object", "supercategory": "none"})

    # Import categories from COCO data
    for cat_data in data.get("categories", []):
        cat_id = cat_data.get("id")
        if cat_id is not None:
            defaults = {"name": cat_data.get("name", "object")}
            if "supercategory" in cat_data:
                defaults["supercategory"] = cat_data["supercategory"]
            if "color" in cat_data:
                defaults["color"] = cat_data["color"]
            Category.objects.update_or_create(pk=cat_id, defaults=defaults)

    # If video_id is provided, scope all annotations to that video
    target_video_id = request.query_params.get("video_id")
    target_video = None
    if target_video_id is not None:
        try:
            target_video = VideoFile.objects.get(pk=target_video_id, uploaded_by=request.user)
        except VideoFile.DoesNotExist:
            return Response({"detail": "Video not found."}, status=status.HTTP_404_NOT_FOUND)

    image_id_map = {}
    for img_data in data.get("images", []):
        if target_video is not None:
            image_id_map[img_data["id"]] = target_video
            # Update video metadata from COCO data if present
            updated = False
            for field in ("width", "height", "frame_count", "fps"):
                val = img_data.get(field)
                if val is not None and val != getattr(target_video, field):
                    setattr(target_video, field, val)
                    updated = True
            if updated:
                target_video.save()
        else:
            video, _ = VideoFile.objects.get_or_create(
                file_name=img_data["file_name"],
                uploaded_by=request.user,
                defaults={"width": img_data.get("width", 0), "height": img_data.get("height", 0)},
            )
            image_id_map[img_data["id"]] = video

    count = 0
    for ann_data in data.get("annotations", []):
        video = image_id_map.get(ann_data.get("image_id"))
        if video is None:
            continue
        bbox = ann_data.get("bbox", [0, 0, 0, 0])
        Annotation.objects.create(
            image=video,
            category_id=ann_data.get("category_id", 1),
            bbox_x=bbox[0],
            bbox_y=bbox[1],
            bbox_w=bbox[2],
            bbox_h=bbox[3],
            frame_number=ann_data.get("frame_number", 0),
            iscrowd=bool(ann_data.get("iscrowd", 0)),
            created_by=request.user,
        )
        count += 1

    return Response({"imported": count}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def clear_annotations(request):
    image_id = request.query_params.get("image_id")
    if image_id is None:
        return Response({"detail": "image_id query param required."}, status=status.HTTP_400_BAD_REQUEST)
    deleted, _ = Annotation.objects.filter(image_id=image_id, created_by=request.user).delete()
    return Response({"deleted": deleted})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def predict_annotation(request):
    """Run object-tracking prediction from a given annotation to the next frame.

    Request body (JSON):
        video_id (int): ID of the VideoFile.
        frame_number (int): Current frame number to predict *from*.
        annotation_id (int): ID of the annotation whose bbox is the seed.

    Response body:
        success (bool): Whether tracking succeeded.
        predicted_bbox (list[float] | null): [x, y, w, h] in original coords.
        next_frame (int): frame_number + 1.
    """
    video_id = request.data.get("video_id")
    frame_number = request.data.get("frame_number")
    annotation_id = request.data.get("annotation_id")

    if video_id is None or frame_number is None or annotation_id is None:
        return Response(
            {"detail": "video_id, frame_number, and annotation_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Video not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        annotation = Annotation.objects.get(pk=annotation_id, image=video, created_by=request.user)
    except Annotation.DoesNotExist:
        return Response({"detail": "Annotation not found."}, status=status.HTTP_400_BAD_REQUEST)

    if not video.file:
        return Response({"detail": "No video file on server."}, status=status.HTTP_404_NOT_FOUND)

    from prediction_engine import predict_next_frame  # noqa: PLC0415

    bbox = [annotation.bbox_x, annotation.bbox_y, annotation.bbox_w, annotation.bbox_h]
    success, predicted_bbox = predict_next_frame(get_local_video_path(video), int(frame_number), bbox)

    return Response({
        "success": success,
        "predicted_bbox": predicted_bbox,
        "next_frame": int(frame_number) + 1,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def track_annotation(request):
    """Track an object through all subsequent frames until failure or video end.

    Request body (JSON):
        video_id (int): ID of the VideoFile.
        start_frame (int): Frame number of the seed annotation.
        annotation_id (int): ID of the annotation whose bbox is the seed.
        max_frames (int, optional): Maximum frames to track. 0 = no limit.

    Response body:
        results (list): [{"frame_number": int, "bbox": [x, y, w, h]}, ...]
        tracked_frames (int): Number of frames successfully tracked.
    """
    video_id = request.data.get("video_id")
    start_frame = request.data.get("start_frame")
    annotation_id = request.data.get("annotation_id")

    if video_id is None or start_frame is None or annotation_id is None:
        return Response(
            {"detail": "video_id, start_frame, and annotation_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    max_frames = int(request.data.get("max_frames", 0))

    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Video not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        annotation = Annotation.objects.get(pk=annotation_id, image=video, created_by=request.user)
    except Annotation.DoesNotExist:
        return Response({"detail": "Annotation not found."}, status=status.HTTP_400_BAD_REQUEST)

    if not video.file:
        return Response({"detail": "No video file on server."}, status=status.HTTP_404_NOT_FOUND)

    from prediction_engine import track_object  # noqa: PLC0415

    bbox = [annotation.bbox_x, annotation.bbox_y, annotation.bbox_w, annotation.bbox_h]
    results = track_object(get_local_video_path(video), int(start_frame), bbox, max_frames)

    return Response({
        "results": results,
        "tracked_frames": len(results),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_frame(request, video_id, frame_number):
    """Extract and return a specific frame from a video as a base64 JPEG.

    Uses a process-level :class:`FrameCache` to avoid re-opening and
    re-seeking the video on every request.  Adjacent frames are
    pre-fetched in the background so sequential scrolling is fast.
    """
    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not video.file:
        return Response({"detail": "No video file."}, status=status.HTTP_404_NOT_FOUND)

    total = video.frame_count
    if frame_number < 0 or (total > 0 and frame_number >= total):
        return Response({"detail": "Frame out of range."}, status=status.HTTP_400_BAD_REQUEST)

    video_path = get_local_video_path(video)

    # Retrieve frame via cache (handles seeking + decoding internally)
    jpeg_bytes = _frame_cache.get_frame_jpeg(video_path, frame_number)
    if jpeg_bytes is None:
        return Response({"detail": "Could not read frame."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    frame_b64 = base64.b64encode(jpeg_bytes).decode("utf-8")

    # Pre-fetch adjacent frames in background for smooth scrolling
    if total > 0:
        nearby = [fn for fn in range(max(0, frame_number - 1),
                                      min(total, frame_number + 4))
                  if fn != frame_number]
        _frame_cache.prefetch(video_path, nearby)

    return Response({
        "frame": frame_b64,
        "frame_number": frame_number,
        "total_frames": total,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def export_files(request, video_id):
    """List or create exported COCO JSON files for a video.

    GET: List all exported files for this video.
    POST: Generate a COCO JSON export and save it to storage.
    """
    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        files = video.export_files.filter(created_by=request.user).order_by("-created_at")
        serializer = ExportFileSerializer(files, many=True)
        return Response(serializer.data)

    # POST — generate COCO JSON and save to storage
    annotations = video.annotations.all()
    categories = Category.objects.all()

    coco = {
        "images": [video.to_coco_dict()],
        "annotations": [a.to_coco_dict() for a in annotations],
        "categories": [
            {"id": c.pk, "name": c.name, "supercategory": c.supercategory, "color": c.color}
            for c in categories
        ],
    }

    json_bytes = json.dumps(coco, indent=2).encode("utf-8")

    # Use custom name from request or generate default
    custom_name = request.data.get("file_name")
    if custom_name:
        if not custom_name.endswith(".json"):
            custom_name += ".json"
        file_name = custom_name
    else:
        ts = timezone.now().strftime("%Y%m%d_%H%M%S")
        base = os.path.splitext(video.file_name)[0]
        file_name = f"{base}_{ts}.json"

    export_file = ExportFile(video=video, file_name=file_name, created_by=request.user)
    export_file.file.save(file_name, ContentFile(json_bytes), save=True)

    serializer = ExportFileSerializer(export_file)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_export_file(request, video_id, export_id):
    """Delete an exported file."""
    try:
        export = ExportFile.objects.get(
            pk=export_id, video_id=video_id, created_by=request.user
        )
    except ExportFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    export.file.delete(save=False)
    export.delete()
    return Response({"detail": "Deleted."}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_export_file(request, video_id, export_id):
    """Return the URL for downloading an exported file."""
    try:
        export = ExportFile.objects.get(
            pk=export_id, video_id=video_id, created_by=request.user
        )
    except ExportFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        "url": export.file.url,
        "file_name": export.file_name,
    })
