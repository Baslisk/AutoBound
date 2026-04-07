from django.contrib.auth.models import User
from django.test import TestCase

from annotations.models import Annotation, Category, VideoFile


class CategoryModelTest(TestCase):
    def test_str(self):
        cat = Category.objects.create(name="person", supercategory="human")
        self.assertEqual(str(cat), "person")

    def test_default_supercategory(self):
        cat = Category.objects.create(name="car")
        self.assertEqual(cat.supercategory, "none")

    def test_default_color(self):
        cat = Category.objects.create(name="tree")
        self.assertEqual(cat.color, "#00FF00")

    def test_custom_color(self):
        cat = Category.objects.create(name="sky", color="#0000FF")
        self.assertEqual(cat.color, "#0000FF")


class VideoFileModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.video = VideoFile.objects.create(
            file_name="test.mp4", width=1920, height=1080, uploaded_by=self.user,
        )

    def test_str(self):
        self.assertEqual(str(self.video), "test.mp4")

    def test_to_coco_dict(self):
        d = self.video.to_coco_dict()
        self.assertEqual(d["file_name"], "test.mp4")
        self.assertEqual(d["width"], 1920)
        self.assertEqual(d["height"], 1080)
        self.assertEqual(d["id"], self.video.pk)

    def test_frame_count_default(self):
        self.assertEqual(self.video.frame_count, 0)

    def test_frame_count_custom(self):
        video = VideoFile.objects.create(
            file_name="clip.mp4", width=640, height=480,
            frame_count=120, uploaded_by=self.user,
        )
        self.assertEqual(video.frame_count, 120)

    def test_fps_default(self):
        self.assertEqual(self.video.fps, 30.0)

    def test_fps_custom(self):
        video = VideoFile.objects.create(
            file_name="hfr.mp4", width=1920, height=1080,
            fps=60.0, uploaded_by=self.user,
        )
        self.assertEqual(video.fps, 60.0)


class AnnotationModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="v.mp4", width=640, height=480, uploaded_by=self.user,
        )
        self.ann = Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=10, bbox_y=20, bbox_w=100, bbox_h=50,
            created_by=self.user,
        )

    def test_area(self):
        self.assertEqual(self.ann.area, 5000.0)

    def test_bbox(self):
        self.assertEqual(self.ann.bbox, [10, 20, 100, 50])

    def test_str(self):
        self.assertIn("v.mp4", str(self.ann))

    def test_to_coco_dict(self):
        d = self.ann.to_coco_dict()
        self.assertEqual(d["image_id"], self.video.pk)
        self.assertEqual(d["category_id"], self.cat.pk)
        self.assertEqual(d["bbox"], [10, 20, 100, 50])
        self.assertEqual(d["area"], 5000.0)
        self.assertEqual(d["iscrowd"], 0)
        self.assertEqual(d["frame_number"], 0)

    def test_frame_number_default(self):
        self.assertEqual(self.ann.frame_number, 0)

    def test_frame_number_custom(self):
        ann = Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=5, bbox_y=5, bbox_w=20, bbox_h=20,
            frame_number=42, created_by=self.user,
        )
        self.assertEqual(ann.frame_number, 42)
        self.assertEqual(ann.to_coco_dict()["frame_number"], 42)

    def test_iscrowd_flag(self):
        ann = Annotation.objects.create(
            image=self.video, category=self.cat,
            bbox_x=0, bbox_y=0, bbox_w=10, bbox_h=10,
            iscrowd=True, created_by=self.user,
        )
        self.assertEqual(ann.to_coco_dict()["iscrowd"], 1)
