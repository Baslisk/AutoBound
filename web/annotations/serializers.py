from rest_framework import serializers

from .models import Annotation, Category, ExportFile, Track, VideoFile


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "supercategory", "color"]


class VideoFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = VideoFile
        fields = ["id", "file_name", "width", "height", "uploaded_at"]
        read_only_fields = fields


class TrackSerializer(serializers.ModelSerializer):
    annotation_count = serializers.SerializerMethodField()

    class Meta:
        model = Track
        fields = ["id", "name", "color", "video", "category", "annotation_count", "created_at"]
        read_only_fields = ["id", "annotation_count", "created_at"]

    def get_annotation_count(self, obj):
        return obj.annotations.count()


class AnnotationSerializer(serializers.ModelSerializer):
    area = serializers.FloatField(read_only=True)
    track_id = serializers.IntegerField(source="track.id", read_only=True, default=None)

    class Meta:
        model = Annotation
        fields = [
            "id", "image", "category", "bbox_x", "bbox_y",
            "bbox_w", "bbox_h", "area", "iscrowd", "frame_number",
            "track", "track_id",
        ]
        read_only_fields = ["id", "area", "track_id"]
        extra_kwargs = {
            "track": {"required": False, "allow_null": True},
        }


class ExportFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExportFile
        fields = ["id", "video", "file_name", "created_at"]
        read_only_fields = fields
