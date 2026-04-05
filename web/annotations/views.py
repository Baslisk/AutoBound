import base64
import os
import tempfile

import cv2
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from PIL import Image

from .models import Annotation, Category, VideoFile

SUPPORTED_EXTENSIONS = (
    ".mp4", ".webm", ".mkv", ".flv", ".gif",
    ".m4v", ".avi", ".mov", ".qt", ".3gp", ".mpg", ".mpeg",
)


@login_required
def home(request):
    videos = VideoFile.objects.filter(uploaded_by=request.user).order_by("-uploaded_at")
    return render(request, "annotations/home.html", {
        "videos": videos,
        "supported": ", ".join(SUPPORTED_EXTENSIONS),
    })


@login_required
def upload_video(request):
    if request.method != "POST":
        return redirect("home")

    uploaded = request.FILES.get("video_file")
    if not uploaded:
        return redirect("home")

    ext = os.path.splitext(uploaded.name)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return render(request, "annotations/home.html", {
            "error": f"Unsupported format: {ext}",
            "supported": ", ".join(SUPPORTED_EXTENSIONS),
        })

    # Save uploaded file to media
    video = VideoFile(file_name=uploaded.name, width=0, height=0, uploaded_by=request.user)
    video.file.save(uploaded.name, uploaded, save=True)

    # Extract first frame
    video_path = video.file.path
    cap = cv2.VideoCapture(video_path)
    width = round(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ret, frame = cap.read()
    cap.release()

    video.width = width
    video.height = height
    video.frame_count = max(frame_count, 0)

    if ret:
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            pil_img.save(tmp, format="JPEG")
            tmp_path = tmp.name
        from django.core.files import File
        with open(tmp_path, "rb") as f:
            video.frame_image.save(f"frame_{video.pk}.jpg", File(f), save=False)
        os.unlink(tmp_path)

    video.save()

    # Ensure default category exists
    Category.objects.get_or_create(pk=1, defaults={"name": "object", "supercategory": "none"})

    return redirect("annotate", video_id=video.pk)


@login_required
def annotate(request, video_id):
    video = get_object_or_404(VideoFile, pk=video_id, uploaded_by=request.user)
    annotations = video.annotations.filter(frame_number=0)

    frame_url = video.frame_image.url if video.frame_image else ""

    return render(request, "annotations/annotate.html", {
        "video": video,
        "annotations_json": [a.to_coco_dict() for a in annotations],
        "frame_url": frame_url,
        "frame_count": video.frame_count,
    })
