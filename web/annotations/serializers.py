from rest_framework import serializers

from .models import Annotation, Category, VideoFile


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "supercategory"]


class VideoFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoFile
        fields = ["id", "file_name", "width", "height", "uploaded_at"]
        read_only_fields = fields


class AnnotationSerializer(serializers.ModelSerializer):
    area = serializers.FloatField(read_only=True)

    class Meta:
        model = Annotation
        fields = [
            "id", "image", "category", "bbox_x", "bbox_y",
            "bbox_w", "bbox_h", "area", "iscrowd",
        ]
        read_only_fields = ["id", "area"]
