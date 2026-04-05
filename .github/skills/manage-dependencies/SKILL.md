---
name: manage-dependencies
description: "Add, update, or fix Python dependencies in the AutoBound project. Use when: adding a package, updating environment.yml, pip install, conda install, dependency conflict, version mismatch, requirements.txt update."
---

# Manage Dependencies

## When to Use
- Adding a new Python package to the project
- Resolving version conflicts between packages
- Updating environment.yml or requirements.txt
- Fixing `ModuleNotFoundError` or `ImportError`

## Dependency Files

| File | Purpose | Authority |
|---|---|---|
| `environment.yml` | Conda environment definition | **Source of truth** |
| `requirements.txt` | Pip freeze snapshot | Secondary reference |

Always edit `environment.yml` first. The `requirements.txt` is a frozen snapshot and may be outdated.

## Procedure

### Adding a New Package

1. Determine if it's a conda or pip package:
   - Check https://anaconda.org/ for conda availability
   - Most Python packages are pip-only

2. Add to `environment.yml`:
   ```yaml
   # Conda package — under dependencies:
   dependencies:
     - package-name>=X.Y

   # Pip-only package — under pip:
   dependencies:
     - pip:
       - package-name>=X.Y
   ```

3. Install immediately:
   ```bash
   pip install package-name
   # or
   conda install package-name
   ```

4. Verify import:
   ```bash
   python -c "import package_name"
   ```

### Current environment.yml Structure

```yaml
name: autobound
channels:
  - defaults
dependencies:
  - python=3.11
  - pip
  - pip:
    - customtkinter>=5.2
    - opencv-python>=4.7
    - pillow>=9.5
    - moviepy>=1.0
    - darkdetect>=0.8
    - django>=4.2
    - djangorestframework>=3.14
    # ... plus torch, torchvision, etc.
```

### Key Dependency Notes

- **opencv-python** vs **opencv-python-headless**: Desktop app needs non-headless (has GUI). Web-only could use headless.
- **torch + torch-directml**: Windows-only GPU acceleration. Not required for web app. Guarded at import time.
- **Django version**: `>=4.2` in yml. Currently installs Django 6.x which is fine.
- **Python version**: 3.11 in yml. Actual runtime may be 3.12 if base conda is newer — this works.

### Verifying After Changes

```bash
python run_test_suite.py
```
