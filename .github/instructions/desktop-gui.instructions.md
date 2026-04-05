---
description: "Use when editing the desktop GUI (AutoBoundGUI.py), annotation store, or desktop test files. Covers CustomTkinter patterns, canvas drawing, Windows Mica effect, and AnnotationStore API."
applyTo: ["AutoBoundGUI.py", "annotation_store.py", "test_annotation_store.py", "test_ui_e2e.py"]
---

# Desktop App Conventions

## GUI Framework
- Uses CustomTkinter (not standard tkinter). Widget names are prefixed with `CTk`: `CTkButton`, `CTkCheckBox`, `CTkFrame`.
- Windows 11 Mica transparency effect uses `ctypes` / `wintypes` — guarded by platform check.
- Canvas drawing uses standard tkinter `Canvas` widget (not CTk — no CTk equivalent).

## AnnotationStore (`annotation_store.py`)
- In-memory COCO format store with `images`, `annotations`, `categories` lists.
- IDs are sequential integers starting at 1, tracked by `_next_image_id` and `_next_ann_id`.
- Each annotation has a `saved` flag (not part of COCO spec) for unsaved-changes detection.
- `to_coco()` strips the `saved` flag before export.
- `clear()` resets everything including ID counters.

## Canvas Drawing
- Mouse press → drag → release creates a bounding box.
- Coordinates are scaled between canvas size and original image dimensions.
- Bboxes drawn as rectangles with `canvas.create_rectangle()`.
- Toggle visibility via `CTkCheckBox` controlling `bbox_visible` state.

## Testing
- `test_annotation_store.py`: Pure unit tests for `AnnotationStore`, no GUI dependency.
- `test_ui_e2e.py`: Creates GUI in withdrawn mode (`window.withdraw()`), simulates events.
- Tcl warnings in test output are harmless on some Windows versions.
