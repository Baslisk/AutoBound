# Skill: Feature Parity

Use when: adding a new feature to one app and needing to verify/add it to the other, auditing gaps, planning cross-platform work, or deciding which features are intentionally platform-specific.

---

## Canonical Feature Matrix

| Feature | Desktop (AutoBoundGUI.py) | Web (Django + annotator.js) | Notes |
|---|---|---|---|
| Draw bounding boxes | ✓ canvas (OpenCV frame + CTkCanvas) | ✓ HTML5 Canvas | Both in COCO [x,y,w,h] format |
| Save/export COCO JSON | ✓ `save_to_file()` + file dialog | ✓ `GET /api/export/<id>/` + `showSaveFilePicker` | |
| Load/import COCO JSON | ✓ `load_from_file()` + file dialog | ✓ `POST /api/import/` | |
| Import confirmation modal | ✓ tkinter messagebox | ✓ custom HTML modal (Save/Discard/Cancel) | |
| Clear annotations | ✓ clear for current frame | ✓ `DELETE /api/annotations/clear/?image_id=X` | Web bulk-deletes all frames |
| Annotation selector for prediction | ✓ CTkOptionMenu dropdown | ✓ panel item click → `selectedPanelAnnId` | Click toggles selection |
| **Predict next frame** | ✓ `run_prediction_action()` | ✓ `POST /api/predict/` + `predictBtn` | Shared `prediction_engine.py` |
| Frame playback (play/pause) | ✗ | ✓ Space bar, Play/Pause button | Desktop: deferred — large scope |
| FPS dropdown | ✓ CTkOptionMenu | ✓ `<select id="fpsSelect">` | |
| Frame slider / scrubbing | ✗ | ✓ `<input type="range" id="frameSlider">` | Desktop: deferred |
| Multi-frame annotations panel | ✗ | ✓ right-side `<aside class="ann-panel">` | Desktop: deferred |
| User login / multi-user | ✗ | ✓ `accounts` app | Intentional: desktop is single-user local |
| Database persistence | ✗ (JSON files) | ✓ SQLite via Django ORM | Intentional: desktop stores to local files |
| Frame prefetch cache | ✓ OpenCV sequential read | ✓ server `FrameCache` + client LRU Map | |

**Intentionally platform-specific features** (do not need parity):
- User auth / multi-user — desktop is always local, single-user
- Database persistence — desktop uses `AnnotationStore` + JSON files; web uses Django ORM
- Frame playback / slider — desktop deferred pending UI redesign

---

## How to Add a Feature to Both Apps

### Step 1 — Define shared data format
All annotations: COCO `[x, y, w, h]` bbox. Check both sides consistently use `bbox_x/y/w/h` float fields (web) and `"bbox": [x,y,w,h]` (COCO JSON / desktop).

### Step 2 — Desktop implementation
- **New button**: `CTkButton(master=canvas_frame, ...)` — use `place(relx=..., rely=...)` anchored to canvas
- **New control**: `CTkOptionMenu`, `CTkCheckBox`, `CTkSlider` patterns in `AutoBoundGUI.py`
- **API**: Desktop calls functions in `annotation_store.py` directly; no HTTP
- **Prediction-related**: always go through `prediction_engine.predict_next_frame()`
- **Unsaved changes**: set `store.annotations[i]["saved"] = False` when modifying; check `store.has_unsaved_annotations()` in close handler

### Step 3 — Web backend
- **New API view**: `@api_view(["POST"])` + `@permission_classes([IsAuthenticated])` in `web/annotations/api.py`
- **Route**: add to `web/annotations/api_urls.py` — put bulk/custom routes **before** `router.urls` to avoid prefix conflicts
- **Model field**: if data needs persistence, add a field to `Annotation` or `VideoFile` and run `makemigrations`
- **Serializer**: update `AnnotationSerializer` in `serializers.py` if the new field should appear in API responses

### Step 4 — Web frontend
- **New button**: add to sidebar `<div class="tool-group">` in `annotate.html` with class `btn btn-block [btn-color]` and an `id`
- **DOM ref**: add `const myBtn = document.getElementById("myBtn");` near top of `annotator.js`
- **State variable**: declare `let myState = null;` alongside other `let` variables
- **API call**: use `fetch("/api/...", { method: "POST", headers: headers(), body: JSON.stringify({...}) })`
- **Panel interaction**: extend `renderAnnotationPanel()` item generation — add data attributes and extend the click IIFE

### Step 5 — Tests
- **Desktop**: `test_annotation_store.py` for store logic; `test_ui_e2e.py` for GUI flows
- **Web**: `web/annotations/tests/test_api.py` for API tests; use `APIClient` + `.login()`; always add a test for unauthenticated access
- **Run all**: `python run_test_suite.py` from project root

---

## Desktop-Specific Patterns

```python
# CTkButton
btn = customtkinter.CTkButton(master=canvas_frame, text="My Feature", command=my_action)
btn.place(relx=0.XX, rely=0.YY, anchor="nw")

# CTkOptionMenu (selector)
menu = customtkinter.CTkOptionMenu(master=canvas_frame, values=["A","B"], command=on_select)
menu.place(relx=0.XX, rely=0.YY, anchor="nw")

# AnnotationStore
store = AnnotationStore()
store.add_annotation(image_id, category_id, bbox_x, bbox_y, bbox_w, bbox_h, frame_number)
anns = store.get_annotations_for_image(image_id, frame_number)
store.save_to_file(path)
store.load_from_file(path)
```

## Web-Specific Patterns

```python
# DRF view
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def my_view(request):
    ...
    return Response({"key": value}, status=status.HTTP_200_OK)
```

```javascript
// JS fetch with CSRF
fetch("/api/my-endpoint/", {
    method: "POST",
    headers: headers(),  // includes X-CSRFToken + Content-Type
    body: JSON.stringify({ key: value }),
})
.then(r => r.json())
.then(data => { setStatus("Done"); });
```

---

## Verification Checklist

When adding a feature with parity requirements:
- [ ] Desktop: button/control placed and connected to handler
- [ ] Desktop: `AnnotationStore` updated if data changes
- [ ] Desktop: `test_annotation_store.py` / `test_ui_e2e.py` updated
- [ ] Web backend: API view + route added
- [ ] Web frontend: button in sidebar, DOM ref, state variable, event handler
- [ ] Web frontend: status bar updates (`setStatus(...)`)
- [ ] Web CSS: new class added to `style.css` using existing CSS variables
- [ ] Web tests: `PredictionAPITest`-style test class with unauthenticated + edge case tests
- [ ] `python run_test_suite.py` passes
