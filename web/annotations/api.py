import base64
import json

import cv2
from django.http import JsonResponse
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Annotation, Category, VideoFile
from .serializers import AnnotationSerializer


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
        "categories": [{"id": c.pk, "name": c.name, "supercategory": c.supercategory} for c in categories],
    }
    return Response(coco)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def import_coco(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return Response({"detail": "Invalid JSON."}, status=status.HTTP_400_BAD_REQUEST)

    # Ensure default category
    Category.objects.get_or_create(pk=1, defaults={"name": "object", "supercategory": "none"})

    image_id_map = {}
    for img_data in data.get("images", []):
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
            iscrowd=bool(ann_data.get("iscrowd", 0)),
            created_by=request.user,
        )
        count += 1

    return Response({"imported": count}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_frame(request, video_id, frame_number):
    """Extract and return a specific frame from a video as a base64 JPEG."""
    try:
        video = VideoFile.objects.get(pk=video_id, uploaded_by=request.user)
    except VideoFile.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not video.file:
        return Response({"detail": "No video file."}, status=status.HTTP_404_NOT_FOUND)

    if frame_number < 0 or (video.frame_count > 0 and frame_number >= video.frame_count):
        return Response({"detail": "Frame out of range."}, status=status.HTTP_400_BAD_REQUEST)

    cap = cv2.VideoCapture(video.file.path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        return Response({"detail": "Could not read frame."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    _, buffer = cv2.imencode(".jpg", frame)
    frame_b64 = base64.b64encode(buffer).decode("utf-8")

    return Response({
        "frame": frame_b64,
        "frame_number": frame_number,
        "total_frames": video.frame_count,
    })
