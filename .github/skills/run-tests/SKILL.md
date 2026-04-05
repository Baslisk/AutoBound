---
name: run-tests
description: "Run and debug the AutoBound test suite — desktop unit tests, Django tests, or the combined runner. Use when: running tests, test failure, debugging failing test, adding new test, test coverage, run_test_suite, manage.py test, unittest."
---

# Run Tests

## When to Use
- Running the full test suite to verify changes
- Investigating a test failure or writing new tests
- Verifying a bug fix or new feature

## Test Architecture

| Suite | Location | Runner | Count |
|---|---|---|---|
| Desktop: AnnotationStore | `test_annotation_store.py` | unittest | ~29 |
| Desktop: GUI E2E | `test_ui_e2e.py` | unittest | ~4 |
| Django: Models | `web/annotations/tests/test_models.py` | Django TestCase | ~8 |
| Django: API | `web/annotations/tests/test_api.py` | Django TestCase | ~10 |
| Django: Auth | `web/accounts/tests/test_auth.py` | Django TestCase | ~7 |

## Commands

### Run Everything
```bash
# From project root
python run_test_suite.py
```
Expected: `Desktop: PASS` and `Django: PASS`.

### Run Django Tests Only
```bash
cd web
python manage.py test --verbosity=2
```

### Run a Single Django Test
```bash
cd web
python manage.py test annotations.tests.test_api.AnnotationAPITest.test_create_annotation --verbosity=2
```

### Run Desktop Tests Only
```bash
# All desktop tests
python -m unittest test_annotation_store test_ui_e2e -v

# Single test
python -m unittest test_annotation_store.TestAnnotationStore.test_add_annotation_stores_bbox_and_area -v
```

## Writing New Tests

### Django Test Pattern
```python
from django.contrib.auth.models import User
from django.test import TestCase
from annotations.models import Category, VideoFile, Annotation

class MyFeatureTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("tester", password="pass1234")
        self.cat = Category.objects.create(pk=1, name="object", supercategory="none")
        self.video = VideoFile.objects.create(
            file_name="test.mp4", width=640, height=480, uploaded_by=self.user,
        )
        self.client.login(username="tester", password="pass1234")

    def test_something(self):
        # Use self.client for HTTP, direct ORM for model logic
        pass
```

### API Test Pattern (DRF)
```python
from rest_framework.test import APIClient

class MyAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.login(username="tester", password="pass1234")
```

### Where to Put Tests
- Django model tests → `web/annotations/tests/test_models.py`
- Django API tests → `web/annotations/tests/test_api.py`
- Auth tests → `web/accounts/tests/test_auth.py`
- Desktop annotation logic → `test_annotation_store.py`
- Desktop GUI tests → `test_ui_e2e.py`

## Debugging Failures

1. Run the single failing test with verbosity:
   ```bash
   python manage.py test <dotted.path> --verbosity=2
   ```
2. Check setUp creates required objects (User, Category pk=1, VideoFile).
3. For API tests, verify `self.client.login()` succeeds (returns True).
4. For 403/401 errors, check DRF permissions in `settings.py` → `REST_FRAMEWORK`.
5. GUI E2E tests may emit harmless Tcl warnings — these are expected on some systems.

## After Fixing

Always run the full suite to catch regressions:
```bash
python run_test_suite.py
```
