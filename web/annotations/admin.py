from django.contrib import admin

from .models import Annotation, Category, VideoFile

admin.site.register(Category)
admin.site.register(VideoFile)
admin.site.register(Annotation)
