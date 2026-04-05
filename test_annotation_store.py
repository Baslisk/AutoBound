import json
import os
import tempfile
import unittest

from annotation_store import AnnotationStore


class TestAnnotationStore(unittest.TestCase):

    def setUp(self):
        self.store = AnnotationStore()

    # ------------------------------------------------------------------
    # Image registration
    # ------------------------------------------------------------------

    def test_add_image_returns_incrementing_ids(self):
        id1 = self.store.add_image("img1.jpg", 800, 600)
        id2 = self.store.add_image("img2.jpg", 1920, 1080)
        self.assertEqual(id1, 1)
        self.assertEqual(id2, 2)

    def test_add_image_stores_metadata(self):
        self.store.add_image("frame.png", 640, 480)
        self.assertEqual(len(self.store.images), 1)
        img = self.store.images[0]
        self.assertEqual(img["file_name"], "frame.png")
        self.assertEqual(img["width"], 640)
        self.assertEqual(img["height"], 480)

    # ------------------------------------------------------------------
    # Annotation creation
    # ------------------------------------------------------------------

    def test_add_annotation_returns_incrementing_ids(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        a1 = self.store.add_annotation(img_id, [10, 20, 30, 40])
        a2 = self.store.add_annotation(img_id, [50, 60, 70, 80])
        self.assertEqual(a1, 1)
        self.assertEqual(a2, 2)

    def test_add_annotation_stores_bbox_and_area(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [10, 20, 30, 40])
        ann = self.store.annotations[0]
        self.assertEqual(ann["bbox"], [10, 20, 30, 40])
        self.assertEqual(ann["area"], 30 * 40)
        self.assertEqual(ann["image_id"], img_id)
        self.assertEqual(ann["category_id"], 1)
        self.assertEqual(ann["iscrowd"], 0)

    def test_add_annotation_custom_category(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [0, 0, 10, 10], category_id=5)
        self.assertEqual(self.store.annotations[0]["category_id"], 5)

    # ------------------------------------------------------------------
    # Annotation removal
    # ------------------------------------------------------------------

    def test_remove_annotation(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        a1 = self.store.add_annotation(img_id, [10, 20, 30, 40])
        a2 = self.store.add_annotation(img_id, [50, 60, 70, 80])
        self.store.remove_annotation(a1)
        self.assertEqual(len(self.store.annotations), 1)
        self.assertEqual(self.store.annotations[0]["id"], a2)

    def test_remove_nonexistent_annotation_is_noop(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [10, 20, 30, 40])
        self.store.remove_annotation(999)
        self.assertEqual(len(self.store.annotations), 1)

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def test_get_annotations_for_image(self):
        id1 = self.store.add_image("a.jpg", 100, 100)
        id2 = self.store.add_image("b.jpg", 200, 200)
        self.store.add_annotation(id1, [0, 0, 10, 10])
        self.store.add_annotation(id2, [0, 0, 20, 20])
        self.store.add_annotation(id1, [5, 5, 15, 15])

        anns = self.store.get_annotations_for_image(id1)
        self.assertEqual(len(anns), 2)
        for a in anns:
            self.assertEqual(a["image_id"], id1)

    # ------------------------------------------------------------------
    # COCO export
    # ------------------------------------------------------------------

    def test_to_coco_structure(self):
        img_id = self.store.add_image("img.jpg", 640, 480)
        self.store.add_annotation(img_id, [10, 20, 30, 40])
        coco = self.store.to_coco()

        self.assertIn("images", coco)
        self.assertIn("annotations", coco)
        self.assertIn("categories", coco)
        self.assertEqual(len(coco["images"]), 1)
        self.assertEqual(len(coco["annotations"]), 1)
        self.assertEqual(len(coco["categories"]), 1)
        self.assertEqual(coco["categories"][0]["name"], "object")

    def test_to_coco_is_valid_json_serializable(self):
        img_id = self.store.add_image("img.jpg", 640, 480)
        self.store.add_annotation(img_id, [10, 20, 30, 40])
        json_str = json.dumps(self.store.to_coco())
        parsed = json.loads(json_str)
        self.assertEqual(parsed["annotations"][0]["bbox"], [10, 20, 30, 40])

    # ------------------------------------------------------------------
    # File I/O
    # ------------------------------------------------------------------

    def test_save_to_file_creates_valid_json(self):
        img_id = self.store.add_image("video_frame.jpg", 1920, 1080)
        self.store.add_annotation(img_id, [100, 200, 300, 400])

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.store.save_to_file(tmp_path)
            with open(tmp_path, "r") as f:
                data = json.load(f)

            self.assertIn("images", data)
            self.assertIn("annotations", data)
            self.assertIn("categories", data)
            self.assertEqual(data["images"][0]["file_name"], "video_frame.jpg")
            self.assertEqual(data["annotations"][0]["bbox"], [100, 200, 300, 400])
            self.assertEqual(data["annotations"][0]["area"], 300 * 400)
        finally:
            os.unlink(tmp_path)

    def test_save_to_file_default_extension_is_json(self):
        """Verify COCO annotations are saved with .json extension."""
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.store.save_to_file(tmp_path)
            self.assertTrue(tmp_path.endswith(".json"))
        finally:
            os.unlink(tmp_path)

    # ------------------------------------------------------------------
    # Clear
    # ------------------------------------------------------------------

    def test_clear_resets_store(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [0, 0, 10, 10])
        self.store.clear()

        self.assertEqual(len(self.store.images), 0)
        self.assertEqual(len(self.store.annotations), 0)
        # Ids should reset
        new_id = self.store.add_image("new.jpg", 50, 50)
        self.assertEqual(new_id, 1)


if __name__ == "__main__":
    unittest.main()
