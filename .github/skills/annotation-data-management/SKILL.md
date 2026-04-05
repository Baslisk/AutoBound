---
name: annotation-data-management
description: "Manage annotation data flow: COCO import/export with video metadata, annotations panel sync, metadata matching, and panel rendering. Use when: import/export annotations, COCO format, metadata mismatch, panel not updating, annotations panel, click-to-jump, bbox highlighting, video metadata round-trip."
---

# Annotation Data Management

## When to Use
- Debugging COCO import/export issues (missing metadata, wrong video matching)
- Modifying the annotations panel (right-side list of all annotations)
- Changing how annotations sync between canvas, API, and panel
- Adding new metadata fields to COCO export
- Fixing click-to-jump or bbox highlighting behavior

## Architecture

### Data Flow
```
COCO JSON ←→ import_coco() / export_coco() ←→ Django Models ←→ DRF API ←→ annotator.js
                                                                              ↓
                                                              ┌───────────────┴───────────────┐
                                                              │  Canvas (current frame)       │
                                                              │  bboxes[] — frame-scoped      │
                                                              ├───────────────────────────────┤
                                                              │  Panel (all frames)           │
                                                              │  allAnnotations[] — full list │
                                                              └───────────────────────────────┘
```

### Key Variables (annotator.js)
- `bboxes[]` — annotations for the **current frame only** (used for canvas drawing)
- `allAnnotations[]` — annotations for the **entire video** (used for panel rendering)
- `highlightId` — annotation ID to flash-highlight on canvas (set on panel click, cleared after 1.5s)

### Key Functions (annotator.js)
- `loadAnnotationsForFrame(frameNum)` — fetches frame-scoped annotations, updates `bboxes[]`, redraws canvas, re-renders panel
- `loadAllAnnotations(cb)` — fetches ALL annotations for the video (no frame_number filter), updates `allAnnotations[]`, renders panel
- `renderAnnotationPanel()` — builds the panel DOM (grouped by frame), highlights active frame group
- `goToFrame(frameNum)` — navigates to a frame (checks cache, fetches if needed)
- `draw()` — redraws canvas with optional `highlightId` bbox glow

### When to Refresh Panel
Call `loadAllAnnotations()` after:
- Drawing a new bbox (mouseup → POST success)
- Clearing annotations (clearBtn click → DELETE success)
- Importing COCO JSON (importInput change → POST success)

Call `renderAnnotationPanel()` (no fetch) after:
- `loadAnnotationsForFrame()` completes (to sync active frame highlight)
- Panel item click (to update active states)

## COCO Format Extensions

### Video Metadata in Images
`VideoFile.to_coco_dict()` exports:
```json
{
  "id": 1,
  "file_name": "clip.mp4",
  "width": 1920,
  "height": 1080,
  "frame_count": 900,
  "fps": 30.0
}
```

### Import Metadata Update
When importing with `?video_id=X`, `import_coco()` updates the target video's `width`, `height`, `frame_count`, and `fps` from the COCO images data if values differ.

### Annotation with Frame Number
```json
{
  "id": 1,
  "image_id": 1,
  "category_id": 1,
  "bbox": [10, 20, 100, 50],
  "area": 5000,
  "iscrowd": 0,
  "frame_number": 42
}
```

## Panel HTML Structure
```html
<aside class="ann-panel" id="annPanel">
  <h4>Annotations <span id="annPanelCount">0</span></h4>
  <ul id="annList" class="ann-list">
    <li class="ann-frame-group">
      <div class="ann-frame-header active">Frame 1 (3)</div>
      <div class="ann-item" data-ann-id="1" data-frame="0">
        <span class="ann-item-id">#1</span>
        <span class="ann-item-bbox">10, 20, 100, 50</span>
      </div>
    </li>
  </ul>
</aside>
```

## CSS Grid Layout
The annotate page uses a 3-column grid: `260px 1fr 280px` (sidebar | canvas | panel).

## Testing Patterns

### Metadata Round-Trip Test
```python
def test_export_includes_metadata(self):
    resp = self.client.get(f"/api/export/{self.video.pk}/")
    img = resp.json()["images"][0]
    self.assertIn("fps", img)
    self.assertIn("frame_count", img)
```

### Panel Data Attributes
Panel items have `data-ann-id` and `data-frame` attributes for test hooks.

## Files
- `web/annotations/models.py` — `to_coco_dict()` with metadata
- `web/annotations/api.py` — `import_coco()` with metadata update, `export_coco()`
- `web/static/js/annotator.js` — panel logic, `loadAllAnnotations()`, `renderAnnotationPanel()`
- `web/templates/annotations/annotate.html` — panel HTML (`<aside class="ann-panel">`)
- `web/static/css/style.css` — `.ann-panel`, `.ann-item`, `.ann-frame-group` styles
