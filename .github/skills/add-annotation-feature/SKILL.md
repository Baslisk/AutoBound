---
name: add-annotation-feature
description: "Add new annotation features, model fields, API endpoints, or UI controls to the AutoBound web or desktop app. Use when: new feature, add endpoint, add model field, new API route, add button, add canvas tool, extend serializer, COCO export change, new annotation type, add category."
---

# Add Annotation Feature

## When to Use
- Adding a new field to annotations (e.g., confidence score, label text, polygon)
- Adding a new API endpoint (e.g., batch delete, search, statistics)
- Adding a new UI control (button, checkbox, panel) to the web annotator
- Extending COCO import/export with new data
- Adding a new annotation category workflow

## Architecture Overview

Changes typically touch multiple layers. Use this checklist:

```
[ ] Model layer     — web/annotations/models.py
[ ] Migration       — python manage.py makemigrations
[ ] Serializer      — web/annotations/serializers.py
[ ] API view        — web/annotations/api.py
[ ] API URL         — web/annotations/api_urls.py
[ ] Web view        — web/annotations/views.py (if template data changes)
[ ] Template        — web/templates/annotations/annotate.html
[ ] JavaScript      — web/static/js/annotator.js
[ ] CSS             — web/static/css/style.css (if new UI elements)
[ ] Tests           — web/annotations/tests/test_models.py, test_api.py
[ ] COCO compat     — to_coco_dict() and import_coco() in api.py
```

Not all layers are needed for every change. A model-only change needs model + migration + serializer + tests. A UI-only change needs template + JS + CSS.

## Procedure

### Step 1: Model Change (if needed)

Edit `web/annotations/models.py`. Follow existing patterns:

```python
# New field on Annotation — always provide a default
confidence = models.FloatField(default=1.0)
```

Then generate and apply migration:
```bash
cd web
python manage.py makemigrations
python manage.py migrate
```

### Step 2: Serializer (if model changed)

Update `web/annotations/serializers.py`:
- Add the new field to `AnnotationSerializer.Meta.fields`
- Mark computed/auto fields as `read_only_fields`

### Step 3: API (if new endpoint)

Add to `web/annotations/api.py`:
- For CRUD on existing models: add to `AnnotationViewSet`
- For standalone endpoints: add `@api_view` function
- Always use `@permission_classes([IsAuthenticated])`

Register the URL in `web/annotations/api_urls.py`.

### Step 4: JavaScript (if UI change)

Edit `web/static/js/annotator.js`:
- Canvas drawing code is in `init()` → mouse event handlers
- API calls use `fetch()` with CSRF token from `window.CSRF_TOKEN`
- Coordinates convert between canvas and original image via `toCanvas()`/`toOriginal()`

### Step 5: Template (if new controls)

Edit `web/templates/annotations/annotate.html`:
- Sidebar controls are in the `.sidebar` div
- Canvas is `#annotationCanvas`
- JS variables are injected in a `<script>` block: `VIDEO_ID`, `FRAME_URL`, `INITIAL_ANNOTATIONS`, `CSRF_TOKEN`

### Step 6: Tests

Add tests for every new feature:
- **Model**: `web/annotations/tests/test_models.py` — test defaults, properties, `to_coco_dict()`
- **API**: `web/annotations/tests/test_api.py` — test CRUD, permissions, edge cases
- **Auth**: `web/accounts/tests/test_auth.py` — only if auth flow changes

### Step 7: COCO Compatibility

If the feature adds data to annotations:
1. Update `Annotation.to_coco_dict()` in models.py
2. Update `import_coco()` in api.py to handle the new field
3. Update `export_coco()` if the export structure changes
4. Ensure the desktop `AnnotationStore` (annotation_store.py) stays compatible with the COCO format

### Step 8: Verify

```bash
cd web
python manage.py test --verbosity=2
cd ..
python run_test_suite.py
```
