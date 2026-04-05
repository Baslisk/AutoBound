---
name: fix-build-failures
description: "Diagnose and fix build failures, import errors, missing dependencies, Django migration conflicts, conda environment issues, test failures, and server startup crashes. Use when: build fails, tests fail, ImportError, ModuleNotFoundError, migration error, manage.py crashes, conda install fails, runserver fails, run_test_suite fails."
---

# Fix Build Failures

## When to Use
- `python run_test_suite.py` reports failures
- `python manage.py test` fails or crashes
- `python manage.py runserver` won't start
- `python manage.py migrate` shows errors
- `conda env create` or `conda activate` fails
- ImportError / ModuleNotFoundError at runtime
- Desktop `python AutoBoundGUI.py` crashes on launch

## Diagnosis Procedure

### Step 1: Identify the failure type

Read the full error traceback. Classify into one of these categories:

| Error Pattern | Category | Jump to |
|---|---|---|
| `ModuleNotFoundError`, `ImportError` | Missing dependency | §A |
| `django.db.utils.*Error`, `No such table` | Migration issue | §B |
| `OperationalError: no such column` | Model/migration mismatch | §B |
| `InconsistentMigrationHistory` | Migration conflict | §B |
| `AssertionError`, `FAIL:` in test output | Test failure | §C |
| `TemplateDoesNotExist` | Missing template | §D |
| `conda` errors, `ResolvePackageNotFound` | Environment issue | §E |
| `SyntaxError`, `IndentationError` | Code syntax | §F |

### Step 2: Fix by category

#### §A — Missing Dependency

1. Check if the package is in `environment.yml` (under `dependencies:` or `pip:`):
   ```bash
   grep -i <package> environment.yml
   ```
2. If missing, add it to the appropriate section in `environment.yml`.
3. Install directly:
   ```bash
   pip install <package>
   # OR
   conda install <package>
   ```
4. Verify the import works:
   ```bash
   python -c "import <module>"
   ```

**Common AutoBound dependency issues:**
- `cv2` → install `opencv-python` (not `opencv-python-headless` for desktop GUI)
- `rest_framework` → install `djangorestframework`
- `PIL` → install `pillow`
- `customtkinter` → install `customtkinter`
- `ctypes` / `wintypes` → stdlib, no install needed (Windows only)

#### §B — Migration Issues

1. Check current migration state:
   ```bash
   cd web
   python manage.py showmigrations
   ```

2. **Missing migrations** (model changed but no migration):
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

3. **Migration conflict** (two leaf nodes):
   ```bash
   python manage.py makemigrations --merge
   python manage.py migrate
   ```

4. **Corrupt state** (development only — *never* in production):
   ```bash
   # Nuclear option: delete migrations and recreate
   # First, back up any data if using DB_PATH
   rm web/annotations/migrations/0*.py
   rm web/accounts/migrations/0*.py
   python manage.py makemigrations annotations accounts
   python manage.py migrate --run-syncdb
   ```

5. **In-memory DB note:** The default `:memory:` database resets every server restart. Migrations must re-run each time. The test runner handles this automatically.

#### §C — Test Failure

1. Run the specific failing test in isolation with full output:
   ```bash
   # Django test
   cd web
   python manage.py test <app>.tests.<module>.<Class>.<method> --verbosity=2

   # Desktop test
   python -m unittest <test_file>.<Class>.<method> -v
   ```

2. Check if it's a state issue — Django tests use `TestCase` which wraps each test in a transaction. Desktop tests may share state.

3. **Common test failures in this project:**
   - API tests return 403 → user not logged in; check `self.client.login()` in setUp
   - Model tests fail on `Category(pk=1)` → default category not created; add `setUp` creation
   - Desktop GUI tests fail with Tcl errors → expected on headless systems, these are cosmetic

4. Re-run full suite to confirm fix:
   ```bash
   python run_test_suite.py
   ```

#### §D — Missing Template

1. Verify the template exists under `web/templates/`:
   ```
   web/templates/base.html
   web/templates/accounts/login.html
   web/templates/accounts/register.html
   web/templates/annotations/home.html
   web/templates/annotations/annotate.html
   ```
2. Check `TEMPLATES[0]["DIRS"]` in `web/autobound_web/settings.py` includes `BASE_DIR / "templates"`.
3. Check `APP_DIRS: True` is set.

#### §E — Conda Environment Issues

1. **ResolvePackageNotFound:** The package version may not exist for the platform. Remove the version pin from `environment.yml` or use `pip:` section instead of `dependencies:`.
2. **Environment won't activate:**
   ```bash
   conda env remove -n autobound
   conda env create -f environment.yml
   ```
3. **Version mismatch** between `environment.yml` (Python 3.11) and `requirements.txt` (3.9): The `environment.yml` is the source of truth. Do not use `requirements.txt` to create the environment.

#### §F — Syntax Errors

1. Run the file through Python's syntax check:
   ```bash
   python -m py_compile <file.py>
   ```
2. Use the editor's error diagnostics to locate the issue.
3. Common causes: missing parentheses, unmatched brackets, incorrect indentation after editing.

### Step 3: Verify the fix

Always run the full test suite after any fix:
```bash
cd <project_root>
python run_test_suite.py
```

Expected output: `Desktop: PASS` and `Django: PASS` with 58+ tests total.
