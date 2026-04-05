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

    def test_clear_resets_annotation_counter(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [0, 0, 10, 10])
        self.store.add_annotation(img_id, [5, 5, 20, 20])
        self.store.clear()

        new_img_id = self.store.add_image("new.jpg", 50, 50)
        new_ann_id = self.store.add_annotation(new_img_id, [1, 1, 5, 5])
        self.assertEqual(new_img_id, 1)
        self.assertEqual(new_ann_id, 1)

    def test_clear_allows_full_reuse(self):
        """After clearing, the store should behave like a fresh instance."""
        img_id = self.store.add_image("old.jpg", 640, 480)
        self.store.add_annotation(img_id, [10, 10, 50, 50])
        self.store.clear()

        self.assertEqual(self.store.to_coco()["images"], [])
        self.assertEqual(self.store.to_coco()["annotations"], [])

        new_id = self.store.add_image("fresh.jpg", 320, 240)
        ann_id = self.store.add_annotation(new_id, [0, 0, 30, 30])
        self.assertEqual(len(self.store.images), 1)
        self.assertEqual(len(self.store.annotations), 1)
        self.assertEqual(new_id, 1)
        self.assertEqual(ann_id, 1)

    # ------------------------------------------------------------------
    # Load from file
    # ------------------------------------------------------------------

    def test_load_from_file_restores_data(self):
        img_id = self.store.add_image("vid.mp4", 1920, 1080)
        self.store.add_annotation(img_id, [10, 20, 30, 40])
        self.store.add_annotation(img_id, [50, 60, 70, 80])

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.store.save_to_file(tmp_path)

            new_store = AnnotationStore()
            new_store.load_from_file(tmp_path)

            self.assertEqual(len(new_store.images), 1)
            self.assertEqual(new_store.images[0]["file_name"], "vid.mp4")
            self.assertEqual(len(new_store.annotations), 2)
            self.assertEqual(new_store.annotations[0]["bbox"], [10, 20, 30, 40])
            self.assertEqual(new_store.annotations[1]["bbox"], [50, 60, 70, 80])
        finally:
            os.unlink(tmp_path)

    def test_load_from_file_updates_id_counters(self):
        img_id = self.store.add_image("img.jpg", 100, 100)
        self.store.add_annotation(img_id, [0, 0, 10, 10])

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            self.store.save_to_file(tmp_path)

            new_store = AnnotationStore()
            new_store.load_from_file(tmp_path)

            # New ids should not collide with loaded ones
            new_img_id = new_store.add_image("img2.jpg", 200, 200)
            self.assertGreater(new_img_id, img_id)

            new_ann_id = new_store.add_annotation(new_img_id, [5, 5, 15, 15])
            self.assertGreater(new_ann_id, 1)
        finally:
            os.unlink(tmp_path)

    def test_load_from_file_replaces_existing_data(self):
        self.store.add_image("old.jpg", 50, 50)

        other = AnnotationStore()
        img_id = other.add_image("new.jpg", 640, 480)
        other.add_annotation(img_id, [1, 2, 3, 4])

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            other.save_to_file(tmp_path)
            self.store.load_from_file(tmp_path)

            self.assertEqual(len(self.store.images), 1)
            self.assertEqual(self.store.images[0]["file_name"], "new.jpg")
        finally:
            os.unlink(tmp_path)

    def test_load_from_file_missing_file_raises(self):
        with self.assertRaises(FileNotFoundError):
            self.store.load_from_file("/nonexistent/path.json")

    def test_load_from_file_invalid_json_raises(self):
        with tempfile.NamedTemporaryFile(
            suffix=".json", delete=False, mode="w"
        ) as tmp:
            tmp.write("not json")
            tmp_path = tmp.name

        try:
            with self.assertRaises(json.JSONDecodeError):
                self.store.load_from_file(tmp_path)
        finally:
            os.unlink(tmp_path)

    def test_load_from_file_empty_annotations(self):
        """Loading a file with images but no annotations should work."""
        data = {
            "images": [{"id": 1, "file_name": "empty.jpg",
                         "width": 100, "height": 100}],
            "annotations": [],
            "categories": [{"id": 1, "name": "object",
                            "supercategory": "none"}],
        }
        with tempfile.NamedTemporaryFile(
            suffix=".json", delete=False, mode="w"
        ) as tmp:
            json.dump(data, tmp)
            tmp_path = tmp.name

        try:
            self.store.load_from_file(tmp_path)
            self.assertEqual(len(self.store.images), 1)
            self.assertEqual(len(self.store.annotations), 0)
            # Counter should still allow new annotations starting at 1
            ann_id = self.store.add_annotation(1, [0, 0, 5, 5])
            self.assertEqual(ann_id, 1)
        finally:
            os.unlink(tmp_path)


if __name__ == "__main__":
    unittest.main()
