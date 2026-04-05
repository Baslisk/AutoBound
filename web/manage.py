#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'autobound_web.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc

    # Auto-migrate for in-memory databases so runserver works without a
    # separate 'migrate' step.  Both parent and reloader-child processes
    # get their own :memory: DB, so this must run every time.
    db_path = os.environ.get("DB_PATH", "")
    if not db_path and len(sys.argv) > 1 and sys.argv[1] == "runserver":
        execute_from_command_line([sys.argv[0], "migrate", "--run-syncdb", "--verbosity=0"])

    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
