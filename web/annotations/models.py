from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)
    supercategory = models.CharField(max_length=100, default="none")

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
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def area(self):
        return self.bbox_w * self.bbox_h

    @property
    def bbox(self):
        return [self.bbox_x, self.bbox_y, self.bbox_w, self.bbox_h]

    def __str__(self):
        return f"Annotation {self.pk} on {self.image.file_name}"

    def to_coco_dict(self):
        return {
            "id": self.pk,
            "image_id": self.image_id,
            "category_id": self.category_id,
            "bbox": self.bbox,
            "area": self.area,
            "iscrowd": int(self.iscrowd),
            "frame_number": self.frame_number,
        }
