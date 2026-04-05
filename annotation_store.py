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
        self.categories = [{"id": 1, "name": "object", "supercategory": "none"}]
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

    def to_coco(self):
        """Return the full annotation data as a COCO-format dictionary."""
        return {
            "images": self.images,
            "annotations": self.annotations,
            "categories": self.categories,
        }

    def save_to_file(self, filepath):
        """Write annotations to a JSON file in COCO format.

        Args:
            filepath: Destination file path (should end with .json).
        """
        with open(filepath, "w") as f:
            json.dump(self.to_coco(), f, indent=2)

    def clear(self):
        """Remove all images and annotations."""
        self.images.clear()
        self.annotations.clear()
        self._next_image_id = 1
        self._next_annotation_id = 1
