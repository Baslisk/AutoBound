from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("upload/", views.upload_video, name="upload_video"),
    path("annotate/<int:video_id>/", views.annotate, name="annotate"),
]
