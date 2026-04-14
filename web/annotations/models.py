from django.conf import settings
from django.db import models


TRACK_PALETTE = [
    "#ef4444", "#3b82f6", "#22c55e", "#f97316",
    "#a855f7", "#ec4899", "#00e5ff", "#facc15",
    "#10b981", "#94a3b8", "#f59e0b", "#ffffff",
]


class Category(models.Model):
    name = models.CharField(max_length=50)
    supercategory = models.CharField(max_length=100, default="none")
    color = models.CharField(max_length=7, default="#00FF00")

    class Meta:
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class VideoFile(models.Model):
    file_name = models.CharField(max_length=255)
    file = models.FileField(upload_to="videos/", blank=True, null=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    frame_count = models.PositiveIntegerField(default=0)
    fps = models.FloatField(default=30.0)
    frame_image = models.ImageField(upload_to="frames/", blank=True, null=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="videos",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file_name

    def to_coco_dict(self):
        return {
            "id": self.pk,
            "file_name": self.file_name,
            "width": self.width,
            "height": self.height,
            "frame_count": self.frame_count,
            "fps": self.fps,
        }


class Track(models.Model):
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#3b82f6")
    video = models.ForeignKey(
        VideoFile,
        on_delete=models.CASCADE,
        related_name="tracks",
    )
    category = models.ForeignKey(
        "Category",
        on_delete=models.SET_DEFAULT,
        default=1,
        related_name="tracks",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tracks",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.video.file_name})"

    def auto_color(self):
        idx = (self.pk or 0) % len(TRACK_PALETTE)
        return TRACK_PALETTE[idx]

    def to_coco_dict(self):
        return {
            "id": self.pk,
            "name": self.name,
            "color": self.color,
            "category_id": self.category_id,
        }


class Annotation(models.Model):
    image = models.ForeignKey(
        VideoFile,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_DEFAULT,
        default=1,
        related_name="annotations",
    )
    frame_number = models.PositiveIntegerField(default=0)
    bbox_x = models.FloatField()
    bbox_y = models.FloatField()
    bbox_w = models.FloatField()
    bbox_h = models.FloatField()
    iscrowd = models.BooleanField(default=False)
    track = models.ForeignKey(
        Track,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="annotations",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["image", "frame_number", "track"],
                condition=models.Q(track__isnull=False),
                name="unique_track_frame",
            ),
        ]

    @property
    def area(self):
        return self.bbox_w * self.bbox_h

    @property
    def bbox(self):
        return [self.bbox_x, self.bbox_y, self.bbox_w, self.bbox_h]

    def __str__(self):
        return f"Annotation {self.pk} on {self.image.file_name}"

    def to_coco_dict(self):
        d = {
            "id": self.pk,
            "image_id": self.image_id,
            "category_id": self.category_id,
            "bbox": self.bbox,
            "area": self.area,
            "iscrowd": int(self.iscrowd),
            "frame_number": self.frame_number,
        }
        if self.track_id is not None:
            d["track_id"] = self.track_id
        return d


class ExportFile(models.Model):
    video = models.ForeignKey(
        VideoFile,
        on_delete=models.CASCADE,
        related_name="export_files",
    )
    file = models.FileField(upload_to="exports/")
    file_name = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="export_files",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file_name
