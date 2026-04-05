---
description: "Use when editing Django views, URL routing, API endpoints, or serializers in the web/ directory. Covers login_required, DRF permissions, COCO format, and in-memory DB patterns."
applyTo: "web/**/*.py"
---

# Django Web App Conventions

## Views
- All template views use `@login_required` decorator.
- Function-based views preferred over class-based (except `RegisterView`).
- Views pass data to templates via context dict — no direct JSON in template views.

## API
- `AnnotationViewSet` scopes queryset to `request.user` — never expose other users' data.
- Standalone API endpoints use `@api_view` + `@permission_classes([IsAuthenticated])`.
- `perform_create()` sets `created_by=request.user` automatically.
- API responses use DRF `Response`, not Django `JsonResponse`.

## Models
- Bbox stored as four separate fields: `bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`.
- `Category(pk=1, name="object")` is the default — create with `get_or_create` before use.
- `to_coco_dict()` must return COCO-compatible format: `{"id", "image_id", "category_id", "bbox": [x,y,w,h], "area", "iscrowd"}`.

## Database
- Default is `:memory:` SQLite — tables created fresh each process start.
- Tests use `TEST: {"NAME": ":memory:"}` — Django test runner handles setup/teardown.
- Never assume data persists between server restarts unless `DB_PATH` is set.

## URL Patterns
- Template views: `web/annotations/urls.py` (home, upload, annotate)
- API: `web/annotations/api_urls.py` (DRF router + export/import)
- Auth: `web/accounts/urls.py` (login, logout, register)
- Root: `web/autobound_web/urls.py` (includes all above)
