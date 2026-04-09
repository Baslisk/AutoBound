import os
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
# Read .env file if it exists (values do NOT override real env vars)
_env_file = BASE_DIR / ".env"
if _env_file.is_file():
    environ.Env.read_env(str(_env_file), overrides=False)

SECRET_KEY = env(
    "DJANGO_SECRET_KEY",
    default="django-insecure-dev-only-change-in-production",
)

DEBUG = env.bool("DJANGO_DEBUG", default=True)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["*"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "annotations",
    "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "autobound_web.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "autobound_web.wsgi.application"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# Set DATABASE_URL env var to use PostgreSQL.
# When unset, falls back to in-memory SQLite for quick local dev.
_database_url = env("DATABASE_URL", default="")

if _database_url:
    DATABASES = {"default": env.db()}
    DATABASES["default"].setdefault("CONN_MAX_AGE", env.int("CONN_MAX_AGE", default=600))
    DATABASES["default"]["TEST"] = {"NAME": "test_autobound"}
else:
    # SQLite fallback (existing behaviour)
    _db_path = env("DB_PATH", default="file:memorydb?mode=memory&cache=shared")
    if not _db_path.startswith("file:") and _db_path != ":memory:" and not os.path.isabs(_db_path):
        _db_path = str(BASE_DIR / _db_path)

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": _db_path,
            "TEST": {"NAME": ":memory:"},
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# S3-compatible object storage — optional
# ---------------------------------------------------------------------------
# Set S3_ENDPOINT_URL to route media uploads to an S3-compatible service
# (e.g. MinIO, AWS S3, any S3 gateway).  When unset, files are stored
# locally in MEDIA_ROOT.
_s3_endpoint = env("S3_ENDPOINT_URL", default="")

if _s3_endpoint:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }
    AWS_S3_ENDPOINT_URL = _s3_endpoint
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("S3_BUCKET_NAME", default="autobound-media")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="us-east-1")
    AWS_S3_ADDRESSING_STYLE = "path"  # required for MinIO; harmless for others
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = True
    AWS_S3_FILE_OVERWRITE = False

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Auth redirects
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

# DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}
