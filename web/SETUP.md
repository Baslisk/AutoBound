# Database & Storage Setup Guide

This guide covers connecting AutoBound's Django web app to **PostgreSQL** and optional **S3-compatible object storage** (e.g. MinIO, AWS S3).

> The app defaults to in-memory SQLite and local file storage when no env vars are configured. Everything works out of the box for local development.

---

## Quick Start (Docker)

The repo includes a Docker Compose file that runs PostgreSQL + MinIO locally.

```bash
# Start services (PostgreSQL on :54322, MinIO S3 on :9000, MinIO console on :9001)
docker compose up -d

# Copy the pre-configured .env for Docker
cp .env.docker.example web/.env

# Apply migrations
cd web
python manage.py migrate

# Create a superuser and start the server
python manage.py createsuperuser
python manage.py runserver
```

### Stopping / resetting

```bash
# Stop containers (data preserved in volumes)
docker compose down

# Stop AND wipe all data
docker compose down -v
```

---

## Manual Setup

### 1. Provision a PostgreSQL Database

Use any PostgreSQL 14+ host — managed (e.g. AWS RDS, Railway, Render) or local.

### 2. Create an S3 Bucket (optional)

Skip this if you want media files stored on local disk.

1. Create a bucket named `autobound-media` (or your preferred name).
2. Set the bucket to **private** (authenticated access only).

### 3. Configure Environment Variables

```bash
cd web
cp .env.example .env
```

Edit `web/.env` with your values:

```env
DJANGO_SECRET_KEY=your-random-secret-key-here
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=*

# PostgreSQL
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME

# S3 storage (optional — remove or leave blank for local files)
S3_ENDPOINT_URL=http://your-s3-host:9000
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=autobound-media
```

> **Security**: `web/.env` is gitignored. Never commit real credentials.

### 4. Install Dependencies

```bash
conda env create -f environment.yml
conda activate autobound
```

Or install manually:
```bash
pip install django-environ psycopg2-binary "django-storages[s3]" boto3
```

### 5. Run Migrations

```bash
cd web
python manage.py migrate
```

### 6. Create a Superuser

```bash
python manage.py createsuperuser
```

### 7. Start the Server

```bash
python manage.py runserver
```

---

## How It Works

### Database
- When `DATABASE_URL` is set, Django connects to PostgreSQL via `django-environ`'s `env.db()` parser.
- When unset, Django falls back to in-memory SQLite (default dev behaviour).
- All queries use Django ORM — no raw SQL anywhere.

### File Storage
- When `S3_ENDPOINT_URL` is set, Django media uploads (`FileField`, `ImageField`) route to the S3-compatible endpoint using `django-storages`.
- When unset, files are stored locally in `web/media/`.
- Static files (CSS, JS) always stay local.

### Video Processing
Video analysis (frame extraction, prediction, tracking) requires local file access for OpenCV. The `get_local_video_path()` utility in `web/annotations/utils.py` transparently handles this:
- **Local storage**: returns the file path directly.
- **Remote storage**: downloads the video to a process-level temp cache on first access, then returns the cached path.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ModuleNotFoundError: environ` | Run `pip install django-environ` |
| `psycopg2` import error | Run `pip install psycopg2-binary` |
| `Migrations fail on PostgreSQL` | Check `DATABASE_URL` format — must start with `postgres://` |
| `NotImplementedError: storage doesn't have path` | Ensure code uses `get_local_video_path(video)` instead of `video.file.path` |
| `S3 access denied` | Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct |
| `Bucket not found` | Create the bucket and ensure `S3_BUCKET_NAME` matches |
