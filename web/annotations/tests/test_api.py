import json

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from annotations.models import Annotation, Category, VideoFile


class AnnotationAPITest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.other = User.objects.create_user("other", password="pass5678")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="clip.mp4", width=800, height=600, uploaded_by=self.user,
        )
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")

    def test_create_annotation(self):
        resp = self.client.post("/api/annotations/", {
            "image": self.video.pk,
            "category": self.cat.pk,
            "bbox_x": 5, "bbox_y": 10, "bbox_w": 50, "bbox_h": 30,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Annotation.objects.count(), 1)
        ann = Annotation.objects.first()
        self.assertEqual(ann.created_by, self.user)

    def test_list_own_annotations(self):
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=0, bbox_y=0, bbox_w=10, bbox_h=10,
            created_by=self.user,
        )
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=1, bbox_y=1, bbox_w=10, bbox_h=10,
            created_by=self.other,
        )
        resp = self.client.get("/api/annotations/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)

    def test_filter_by_image_id(self):
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=0, bbox_y=0, bbox_w=10, bbox_h=10,
            created_by=self.user,
        )
        resp = self.client.get(f"/api/annotations/?image_id={self.video.pk}")
        self.assertEqual(len(resp.data), 1)
        resp = self.client.get("/api/annotations/?image_id=9999")
        self.assertEqual(len(resp.data), 0)

    def test_delete_annotation(self):
        ann = Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=0, bbox_y=0, bbox_w=10, bbox_h=10,
            created_by=self.user,
        )
        resp = self.client.delete(f"/api/annotations/{ann.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(Annotation.objects.count(), 0)

    def test_unauthenticated_rejected(self):
        self.client.logout()
        resp = self.client.get("/api/annotations/")
        self.assertIn(resp.status_code, [401, 403])


class ExportImportCOCOTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="export.mp4", width=640, height=480, uploaded_by=self.user,
        )
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=10, bbox_y=20, bbox_w=30, bbox_h=40,
            created_by=self.user,
        )
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")

    def test_export_coco(self):
        resp = self.client.get(f"/api/export/{self.video.pk}/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("images", data)
        self.assertIn("annotations", data)
        self.assertIn("categories", data)
        self.assertEqual(data["images"][0]["file_name"], "export.mp4")
        self.assertEqual(data["annotations"][0]["bbox"], [10, 20, 30, 40])

    def test_export_not_found(self):
        resp = self.client.get("/api/export/9999/")
        self.assertEqual(resp.status_code, 404)

    def test_import_coco(self):
        coco = {
            "images": [{"id": 1, "file_name": "imported.mp4", "width": 320, "height": 240}],
            "annotations": [
                {"image_id": 1, "category_id": 1, "bbox": [5, 5, 20, 20], "iscrowd": 0},
                {"image_id": 1, "category_id": 1, "bbox": [50, 50, 10, 10], "iscrowd": 1},
            ],
        }
        resp = self.client.post(
            "/api/import/",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["imported"], 2)
        self.assertTrue(VideoFile.objects.filter(file_name="imported.mp4").exists())

    def test_import_invalid_json(self):
        resp = self.client.post(
            "/api/import/",
            data="not json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
