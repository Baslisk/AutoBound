from django.urls import path
from rest_framework.routers import DefaultRouter

from . import api

router = DefaultRouter()
router.register(r"annotations", api.AnnotationViewSet, basename="annotation")

urlpatterns = router.urls + [
    path("export/<int:video_id>/", api.export_coco, name="api_export_coco"),
    path("import/", api.import_coco, name="api_import_coco"),
    path("frame/<int:video_id>/<int:frame_number>/", api.get_frame, name="api_get_frame"),
]
