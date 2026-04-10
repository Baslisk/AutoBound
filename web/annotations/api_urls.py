from django.urls import path
from rest_framework.routers import DefaultRouter

from . import api

router = DefaultRouter()
router.register(r"annotations", api.AnnotationViewSet, basename="annotation")
router.register(r"categories", api.CategoryViewSet, basename="category")

urlpatterns = [
    path("annotations/clear/", api.clear_annotations, name="api_clear_annotations"),
    path("categories/<int:category_id>/delete/", api.delete_category, name="api_delete_category"),
] + router.urls + [
    path("export/<int:video_id>/", api.export_coco, name="api_export_coco"),
    path("import/", api.import_coco, name="api_import_coco"),
    path("frame/<int:video_id>/<int:frame_number>/", api.get_frame, name="api_get_frame"),
    path("predict/", api.predict_annotation, name="api_predict"),
    path("track/", api.track_annotation, name="api_track"),
    path("exports/<int:video_id>/", api.export_files, name="api_export_files"),
    path("exports/<int:video_id>/<int:export_id>/", api.delete_export_file, name="api_delete_export_file"),
    path("exports/<int:video_id>/<int:export_id>/download/", api.download_export_file, name="api_download_export_file"),
]
