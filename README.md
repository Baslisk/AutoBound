# AutoBound

A tool for generating bounding box datasets with automation features.
Includes a desktop GUI (CustomTkinter) and a Django web application.

<video src="Assets/demo.mp4" autoplay loop muted width="800"></video>

## Setup

1. Clone the repository and navigate to the project directory.
2. Create the conda environment:
   ```
   conda env create -f environment.yml
   ```
3. Activate the environment:
   ```
   conda activate autobound
   ```

## Desktop App

```
python AutoBoundGUI.py
```

## Web App

The Django web app lives under `web/`. It provides user authentication,
video upload, bounding-box annotation via an HTML5 canvas, and a REST API
with COCO import/export.

### Quick Start

```bash
cd web
python manage.py migrate
python manage.py createsuperuser   # optional – create an admin account
python manage.py runserver
```

Open http://127.0.0.1:8000/ in a browser to register or log in.

### Database
6
By default the web app uses an **in-memory SQLite** database (data is lost
when the server stops). To persist data, set the `DB_PATH` environment
variable:

```bash
set DB_PATH=db.sqlite3          # Windows
export DB_PATH=db.sqlite3       # macOS / Linux
python manage.py migrate
python manage.py runserver
```

### REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/annotations/` | GET / POST | List or create annotations |
| `/api/annotations/<id>/` | GET / PUT / DELETE | Annotation detail |
| `/api/export/<video_id>/` | GET | Export COCO JSON for a video |
| `/api/import/` | POST | Import COCO JSON |

All API endpoints require session authentication.

## Run Tests

### Desktop Tests

```
python run_test_suite.py
```

### Django Tests

```bash
cd web
python manage.py test --verbosity=2
```
