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

    def test_filter_by_frame_number(self):
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=0, bbox_y=0, bbox_w=10, bbox_h=10,
            frame_number=0, created_by=self.user,
        )
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=5, bbox_y=5, bbox_w=15, bbox_h=15,
            frame_number=5, created_by=self.user,
        )
        resp = self.client.get(f"/api/annotations/?image_id={self.video.pk}&frame_number=0")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["frame_number"], 0)
        resp = self.client.get(f"/api/annotations/?image_id={self.video.pk}&frame_number=5")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["frame_number"], 5)
        resp = self.client.get(f"/api/annotations/?image_id={self.video.pk}&frame_number=99")
        self.assertEqual(len(resp.data), 0)

    def test_create_annotation_with_frame_number(self):
        resp = self.client.post("/api/annotations/", {
            "image": self.video.pk,
            "category": self.cat.pk,
            "bbox_x": 5, "bbox_y": 10, "bbox_w": 50, "bbox_h": 30,
            "frame_number": 7,
        })
        self.assertEqual(resp.status_code, 201)
        ann = Annotation.objects.get(pk=resp.data["id"])
        self.assertEqual(ann.frame_number, 7)

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

    def test_import_preserves_frame_number(self):
        coco = {
            "images": [{"id": 1, "file_name": "frames.mp4", "width": 320, "height": 240}],
            "annotations": [
                {"image_id": 1, "category_id": 1, "bbox": [1, 2, 3, 4], "frame_number": 5},
                {"image_id": 1, "category_id": 1, "bbox": [5, 6, 7, 8], "frame_number": 12},
                {"image_id": 1, "category_id": 1, "bbox": [9, 10, 11, 12]},
            ],
        }
        resp = self.client.post(
            "/api/import/",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["imported"], 3)
        video = VideoFile.objects.get(file_name="frames.mp4")
        anns = list(video.annotations.order_by("bbox_x"))
        self.assertEqual(anns[0].frame_number, 5)
        self.assertEqual(anns[1].frame_number, 12)
        self.assertEqual(anns[2].frame_number, 0)  # default

    def test_import_with_video_id(self):
        """Import scoped to an existing video via ?video_id= query param."""
        coco = {
            "images": [{"id": 99, "file_name": "other_name.mp4", "width": 100, "height": 100}],
            "annotations": [
                {"image_id": 99, "category_id": 1, "bbox": [111, 222, 30, 40]},
            ],
        }
        resp = self.client.post(
            f"/api/import/?video_id={self.video.pk}",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["imported"], 1)
        # Annotation attached to the existing video, not a new one
        ann = Annotation.objects.get(bbox_x=111, bbox_y=222)
        self.assertEqual(ann.image_id, self.video.pk)
        # No new VideoFile created for "other_name.mp4"
        self.assertFalse(VideoFile.objects.filter(file_name="other_name.mp4").exists())

    def test_import_with_invalid_video_id(self):
        coco = {
            "images": [{"id": 1, "file_name": "x.mp4", "width": 10, "height": 10}],
            "annotations": [],
        }
        resp = self.client.post(
            "/api/import/?video_id=99999",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_import_invalid_json(self):
        resp = self.client.post(
            "/api/import/",
            data="not json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_export_includes_video_metadata(self):
        """Export should include frame_count and fps in images data."""
        self.video.frame_count = 500
        self.video.fps = 24.0
        self.video.save()
        resp = self.client.get(f"/api/export/{self.video.pk}/")
        self.assertEqual(resp.status_code, 200)
        img = resp.json()["images"][0]
        self.assertEqual(img["frame_count"], 500)
        self.assertEqual(img["fps"], 24.0)

    def test_import_updates_video_metadata(self):
        """Import with video_id should update video metadata from COCO data."""
        coco = {
            "images": [{"id": 1, "file_name": "x.mp4", "width": 1920, "height": 1080,
                         "frame_count": 900, "fps": 29.97}],
            "annotations": [],
        }
        resp = self.client.post(
            f"/api/import/?video_id={self.video.pk}",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.video.refresh_from_db()
        self.assertEqual(self.video.width, 1920)
        self.assertEqual(self.video.height, 1080)
        self.assertEqual(self.video.frame_count, 900)
        self.assertAlmostEqual(self.video.fps, 29.97)

    def test_metadata_round_trip(self):
        """Export then import should preserve video metadata."""
        self.video.frame_count = 300
        self.video.fps = 60.0
        self.video.save()

        # Export
        resp = self.client.get(f"/api/export/{self.video.pk}/")
        coco = resp.json()

        # Import back (as a new video without video_id to test metadata preservation)
        # Delete the original video annotations first
        Annotation.objects.filter(image=self.video).delete()

        resp = self.client.post(
            f"/api/import/?video_id={self.video.pk}",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.video.refresh_from_db()
        self.assertEqual(self.video.frame_count, 300)
        self.assertEqual(self.video.fps, 60.0)


class ClearAnnotationsTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.other = User.objects.create_user("other", password="pass5678")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="clip.mp4", width=800, height=600, uploaded_by=self.user,
        )
        for i in range(5):
            Annotation.objects.create(
                image=self.video, category=self.cat,
                bbox_x=i, bbox_y=i, bbox_w=10, bbox_h=10,
                created_by=self.user,
            )
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")

    def test_clear_deletes_all_for_video(self):
        self.assertEqual(Annotation.objects.filter(image=self.video).count(), 5)
        resp = self.client.delete(f"/api/annotations/clear/?image_id={self.video.pk}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["deleted"], 5)
        self.assertEqual(Annotation.objects.filter(image=self.video).count(), 0)

    def test_clear_scoped_to_user(self):
        """Other user's annotations on the same video should not be deleted."""
        Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=99, bbox_y=99, bbox_w=10, bbox_h=10,
            created_by=self.other,
        )
        resp = self.client.delete(f"/api/annotations/clear/?image_id={self.video.pk}")
        self.assertEqual(resp.json()["deleted"], 5)
        # Other user's annotation survives
        self.assertEqual(Annotation.objects.filter(created_by=self.other).count(), 1)

    def test_clear_requires_image_id(self):
        resp = self.client.delete("/api/annotations/clear/")
        self.assertEqual(resp.status_code, 400)

    def test_clear_unauthenticated(self):
        self.client.logout()
        resp = self.client.delete(f"/api/annotations/clear/?image_id={self.video.pk}")
        self.assertIn(resp.status_code, [401, 403])

    def test_import_after_clear_only_has_new(self):
        """After clearing and importing, only the new annotations should exist."""
        self.assertEqual(Annotation.objects.filter(image=self.video, created_by=self.user).count(), 5)

        # Clear
        resp = self.client.delete(f"/api/annotations/clear/?image_id={self.video.pk}")
        self.assertEqual(resp.json()["deleted"], 5)

        # Import new annotations
        coco = {
            "images": [{"id": 1, "file_name": "clip.mp4", "width": 800, "height": 600}],
            "annotations": [
                {"image_id": 1, "category_id": 1, "bbox": [100, 200, 50, 60], "frame_number": 3},
                {"image_id": 1, "category_id": 1, "bbox": [300, 400, 70, 80], "frame_number": 7},
            ],
        }
        resp = self.client.post(
            f"/api/import/?video_id={self.video.pk}",
            data=json.dumps(coco),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["imported"], 2)

        # Only the 2 newly imported annotations should exist
        anns = list(Annotation.objects.filter(image=self.video, created_by=self.user).order_by("frame_number"))
        self.assertEqual(len(anns), 2)
        self.assertEqual(anns[0].frame_number, 3)
        self.assertEqual(anns[0].bbox_x, 100)
        self.assertEqual(anns[1].frame_number, 7)
        self.assertEqual(anns[1].bbox_x, 300)


class FrameAPITest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="clip.mp4", width=800, height=600,
            frame_count=100, uploaded_by=self.user,
        )
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")

    def test_get_frame_no_video_file(self):
        resp = self.client.get(f"/api/frame/{self.video.pk}/0/")
        self.assertEqual(resp.status_code, 404)

    def test_get_frame_not_found(self):
        resp = self.client.get("/api/frame/9999/0/")
        self.assertEqual(resp.status_code, 404)

    def test_get_frame_unauthenticated(self):
        self.client.logout()
        resp = self.client.get(f"/api/frame/{self.video.pk}/0/")
        self.assertIn(resp.status_code, [401, 403])


class AnnotateViewTest(TestCase):
    """Test that the annotate view passes FPS to the template context."""

    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="clip.mp4", width=800, height=600,
            frame_count=300, fps=24.0, uploaded_by=self.user,
        )
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")

    def test_annotate_context_contains_fps(self):
        resp = self.client.get(f"/annotate/{self.video.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("fps", resp.context)
        self.assertEqual(resp.context["fps"], 24.0)

    def test_annotate_context_default_fps(self):
        video = VideoFile.objects.create(
            file_name="default.mp4", width=640, height=480,
            uploaded_by=self.user,
        )
        resp = self.client.get(f"/annotate/{video.pk}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.context["fps"], 30.0)
