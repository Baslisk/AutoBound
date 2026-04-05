---
name: django-migrations
description: "Create, apply, troubleshoot, and merge Django database migrations for the AutoBound web app. Use when: adding model fields, changing model schema, migration conflict, makemigrations, migrate, schema change, new model, alter field, database table error, OperationalError."
---

# Django Migrations

## When to Use
- Adding or changing fields on Category, VideoFile, or Annotation models
- Creating new Django models in the annotations or accounts app
- Resolving migration conflicts after branch merges
- `OperationalError: no such table` or `no such column` errors
- After any model change before running tests or the dev server

## Project Context

- Models are in `web/annotations/models.py` and `web/accounts/models.py`
- Migrations live in `web/annotations/migrations/` and `web/accounts/migrations/`
- Database is in-memory SQLite by default (`:memory:`), file-backed with `DB_PATH` env var
- In-memory DB means migrations must re-run every server start (test runner handles this)

## Procedure

### Adding or Changing a Model Field

1. Edit the model in `web/annotations/models.py` or `web/accounts/models.py`.
2. Generate the migration:
   ```bash
   cd web
   python manage.py makemigrations
   ```
3. Review the generated migration file in `web/<app>/migrations/`.
4. Apply:
   ```bash
   python manage.py migrate
   ```
5. Run tests to verify no regressions:
   ```bash
   python manage.py test --verbosity=2
   ```

### Key Rules

- **Always provide defaults** for new fields on existing models, or use `null=True` to avoid breaking existing rows.
- **Annotation bbox fields** (`bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`) are `FloatField` — keep them consistent.
- **Category pk=1** is the default for `Annotation.category` (`default=1`). Never delete this row.
- **ForeignKey on_delete**:
  - `uploaded_by`, `created_by` → `CASCADE` (delete user = delete their data)
  - `category` → `SET_DEFAULT` (delete category = reset to default)

### Resolving Migration Conflicts

After merging branches that both created migrations:

```bash
cd web
python manage.py makemigrations --merge
python manage.py migrate
```

If the merge fails, inspect the conflicting migration files and manually resolve dependencies.

### Resetting Migrations (Development Only)

Only do this when migration history is corrupted beyond repair:

```bash
# Delete all migration files (keep __init__.py)
Get-ChildItem web/annotations/migrations/0*.py | Remove-Item
Get-ChildItem web/accounts/migrations/0*.py | Remove-Item

# Recreate from scratch
cd web
python manage.py makemigrations annotations accounts
python manage.py migrate
```

### Verifying Migration State

```bash
cd web
python manage.py showmigrations
```

All migrations should show `[X]` (applied). Any `[ ]` means unapplied — run `python manage.py migrate`.
