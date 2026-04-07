import json


class AnnotationStore:
    """Stores bounding box annotations in COCO format.

    COCO format structure:
    {
        "images": [{"id", "file_name", "width", "height"}],
        "annotations": [{"id", "image_id", "category_id", "bbox", "area", "iscrowd"}],
        "categories": [{"id", "name", "supercategory"}]
    }

    Bounding boxes use COCO convention: [x, y, width, height] where (x, y) is the
    top-left corner.
    """

    def __init__(self):
        self.images = []
        self.annotations = []
        self.categories = [{"id": 1, "name": "object", "supercategory": "none", "color": "#00e5ff"}]
        self._next_image_id = 1
        self._next_annotation_id = 1

    def add_image(self, file_name, width, height):
        """Register an image and return its assigned id."""
        image_id = self._next_image_id
        self._next_image_id += 1
        self.images.append({
            "id": image_id,
            "file_name": file_name,
            "width": int(width),
            "height": int(height),
        })
        return image_id

    def add_annotation(self, image_id, bbox, category_id=1):
        """Add a bounding box annotation for an image.

        Args:
            image_id: The id of the image this annotation belongs to.
            bbox: A list [x, y, width, height] in pixels.
            category_id: The category id (default 1).

        Returns:
            The assigned annotation id.
        """
        annotation_id = self._next_annotation_id
        self._next_annotation_id += 1
        x, y, w, h = bbox
        self.annotations.append({
            "id": annotation_id,
            "image_id": image_id,
            "category_id": int(category_id),
            "bbox": [x, y, w, h],
            "area": w * h,
            "iscrowd": 0,
            "saved": False,
        })
        return annotation_id

    def remove_annotation(self, annotation_id):
        """Remove an annotation by its id."""
        self.annotations = [
            a for a in self.annotations if a["id"] != annotation_id
        ]

    def get_annotations_for_image(self, image_id):
        """Return all annotations belonging to a given image."""
        return [a for a in self.annotations if a["image_id"] == image_id]

    def has_unsaved_annotations(self):
        """Return True if any annotation has not been saved to a file."""
        return any(not a.get("saved", False) for a in self.annotations)

    def mark_all_saved(self):
        """Mark every annotation as saved."""
        for a in self.annotations:
            a["saved"] = True

    def to_coco(self):
        """Return the full annotation data as a COCO-format dictionary."""
        # Strip the internal 'saved' flag so it does not appear in output
        clean_annotations = [
            {k: v for k, v in a.items() if k != "saved"}
            for a in self.annotations
        ]
        return {
            "images": self.images,
            "annotations": clean_annotations,
            "categories": self.categories,
        }

    def save_to_file(self, filepath):
        """Write annotations to a JSON file in COCO format.

        Args:
            filepath: Destination file path (should end with .json).
        """
        with open(filepath, "w") as f:
            json.dump(self.to_coco(), f, indent=2)
        self.mark_all_saved()

    def load_from_file(self, filepath):
        """Load annotations from a COCO JSON file.

        Replaces current images, annotations, and categories with the data
        read from *filepath*.  The internal id counters are updated so that
        future calls to ``add_image`` / ``add_annotation`` do not collide
        with the loaded ids.

        Args:
            filepath: Path to a JSON file in COCO format.

        Raises:
            FileNotFoundError: If *filepath* does not exist.
            json.JSONDecodeError: If the file is not valid JSON.
            KeyError: If required top-level keys are missing.
        """
        with open(filepath, "r") as f:
            data = json.load(f)

        self.images = data["images"]
        self.annotations = data["annotations"]
        self.categories = data.get("categories",
                                   [{"id": 1, "name": "object",
                                     "supercategory": "none"}])

        # Update counters to avoid id collisions
        if self.images:
            self._next_image_id = max(img["id"] for img in self.images) + 1
        else:
            self._next_image_id = 1

        if self.annotations:
            self._next_annotation_id = (
                max(a["id"] for a in self.annotations) + 1
            )
        else:
            self._next_annotation_id = 1

        # Loaded annotations already exist on disk, so mark them as saved
        self.mark_all_saved()

    def clear(self):
        """Remove all images and annotations."""
        self.images.clear()
        self.annotations.clear()
        self._next_image_id = 1
        self._next_annotation_id = 1
