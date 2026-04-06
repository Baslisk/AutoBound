# Skill: Manage Prediction Models

Use when: adding or changing tracker-based prediction logic, extending `prediction_engine.py`, adding multi-frame prediction, tuning the tracker priority order, or wiring the prediction API.

---

## Architecture

`prediction_engine.py` lives at the **project root** (alongside `AutoBoundGUI.py`). It is imported by:

- **Desktop**: directly in `AutoBoundGUI.py` → `from prediction_engine import predict_next_frame`
- **Web API**: in `web/annotations/api.py` → imported inside `predict_annotation()` using the `_project_root` sys.path injection already present at the top of that file

```python
# existing pattern in api.py (lines 13-16) — reuse for prediction_engine too
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from prediction_engine import predict_next_frame  # inside view function to avoid circular import
```

---

## Core Function

```python
# prediction_engine.py
def predict_next_frame(video_path: str, frame_number: int, bbox: list) -> tuple[bool, list | None]:
    """
    Track the object from `frame_number` to `frame_number + 1`.

    Args:
        video_path: Absolute path to the video file.
        frame_number: 0-based index of the frame holding the seed bbox.
        bbox: [x, y, w, h] in original pixel coordinates.

    Returns:
        (success, predicted_bbox)
        - success=True, predicted_bbox=[x, y, w, h]  on success
        - success=False, predicted_bbox=None           on failure
    """
```

Tracker priority order (first available OpenCV tracker wins):
1. **CSRT** — `cv2.TrackerCSRT_create()` — highest accuracy, default
2. **KCF** — `cv2.TrackerKCF_create()` — fast, good for rigid objects
3. **MIL** — `cv2.TrackerMIL_create()` — legacy fallback

`_create_tracker()` tries each in order, returns the first that doesn't raise `AttributeError`.

---

## Web API Endpoint

**Route**: `POST /api/predict/`  
**File**: `web/annotations/api.py` → `predict_annotation(request)`  
**Auth**: `@permission_classes([IsAuthenticated])`

Request body (JSON):
```json
{ "video_id": 1, "frame_number": 5, "annotation_id": 42 }
```

Response:
```json
{ "success": true, "predicted_bbox": [x, y, w, h], "next_frame": 6 }
```

Error responses:
- `400` — missing required fields, or annotation not found for this user/video
- `404` — video not found, or video has no file on disk

The endpoint resolves the annotation to get its bbox, calls `predict_next_frame`, and returns the result. **Saving** the predicted bbox is the frontend's responsibility (POST to `/api/annotations/`).

---

## Frontend Flow (annotator.js)

1. User clicks an annotation in the right-side panel → sets `selectedPanelAnnId` and adds `.selected-for-predict` CSS class
2. Clicking the same annotation again **deselects** it (toggle)
3. User clicks **Predict Next Frame** button → sends `{video_id, frame_number, annotation_id}` to `POST /api/predict/`
4. On success: POST predicted bbox to `/api/annotations/` for `next_frame`, navigate to `next_frame`, reload panel
5. The newly saved annotation becomes `selectedPanelAnnId` (for chained predictions)

Button state:
- Disabled while request is in-flight
- Status bar shows "Predicting…" → "Predicted bbox saved on frame N" or error message

---

## Desktop Flow (AutoBoundGUI.py)

1. User selects annotation in `CTkOptionMenu` (annotation selector, `place_annotation_selector()`)
2. Clicks **Run Prediction** button → `run_prediction_action()`
3. Resolves `selected_annotation_id` → falls back to `annotations[-1]` if none selected
4. Calls `predict_next_frame(video_path, frame_number, bbox)` directly
5. Receives `(success, predicted_bbox)` and draws it on the next frame canvas

---

## Extending to Multi-Frame Prediction

To predict N frames ahead:
```python
def predict_n_frames(video_path, start_frame, bbox, n=5):
    results = []
    current_bbox = bbox
    for i in range(n):
        success, new_bbox = predict_next_frame(video_path, start_frame + i, current_bbox)
        if not success:
            break
        results.append((start_frame + i + 1, new_bbox))
        current_bbox = new_bbox
    return results
```

Add a `steps` parameter to the web endpoint body to trigger multi-frame mode.

---

## Error Handling

- `predict_next_frame` returns `(False, None)` on any OpenCV error (no exception propagation)
- The web view wraps the import in a try/except to handle `ImportError` if OpenCV trackers are unavailable
- No retries; caller decides whether to surface the failure

---

## Relevant Files

- `prediction_engine.py` — core logic, do not change the function signature
- `web/annotations/api.py` — `predict_annotation()` view (line ~120+)
- `web/annotations/api_urls.py` — `path("predict/", ...)` route
- `web/static/js/annotator.js` — `selectedPanelAnnId`, `predictBtn` handler, panel selection
- `web/templates/annotations/annotate.html` — `<button id="predictBtn">`
- `web/static/css/style.css` — `.btn-predict`, `.ann-item.selected-for-predict`
- `AutoBoundGUI.py` — `run_prediction_action()`, `place_annotation_selector()`, `selected_annotation_id`
- `web/annotations/tests/test_api.py` — `PredictionAPITest`
