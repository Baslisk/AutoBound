# AutoBound Project Guidelines

## Architecture

This is a hybrid desktop + web annotation tool for bounding box datasets in COCO format.

- **Desktop app**: `AutoBoundGUI.py` — CustomTkinter GUI with OpenCV video frame extraction. Data layer in `annotation_store.py`.
- **Web app**: `web/` — Django 4.2+ project (`autobound_web`) with two apps:
  - `annotations` — models (Category, VideoFile, Annotation), DRF API, HTML5 Canvas UI
  - `accounts` — user auth (login, register, logout)
- Both apps share COCO bbox format: `[x, y, width, height]`

## Code Style

- Python 3.11+. No type stubs required but keep code compatible.
- Django views use function-based views with `@login_required`.
- DRF API uses `ModelViewSet` and function-based `@api_view` endpoints.
- Desktop GUI uses CustomTkinter widgets. Windows-specific code (Mica effect, ctypes) is guarded.
- Frontend JS is vanilla (no frameworks). Canvas annotation logic is in `web/static/js/annotator.js`.

## Build and Test

```bash
# Environment setup
conda env create -f environment.yml
conda activate autobound

# Desktop app
python AutoBoundGUI.py

# Web app
cd web
python manage.py migrate
python manage.py runserver

# Run ALL tests (desktop + Django)
python run_test_suite.py

# Django tests only
cd web && python manage.py test --verbosity=2

# Playwright E2E tests (requires Node.js)
npm install
npx playwright install chromium
npm run test:e2e
```

## Database

- Default: in-memory SQLite (`:memory:`). Set `DB_PATH=db.sqlite3` env var for persistence.
- Django test runner auto-creates in-memory test DB.
- Default Category (pk=1, name="object") is auto-created on first upload or import.

## Key Conventions

- Annotations model stores bbox as four separate float fields: `bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`.
- `to_coco_dict()` methods on models produce COCO-compatible output.
- REST API at `/api/` requires session auth. Export at `/api/export/<id>/`, import at `/api/import/`.
- Desktop `AnnotationStore` tracks a `saved` flag per annotation for unsaved-changes detection.
- Video extensions supported: `.mp4, .webm, .mkv, .flv, .gif, .m4v, .avi, .mov, .qt, .3gp, .mpg, .mpeg`
