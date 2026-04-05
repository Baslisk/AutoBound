import os
import subprocess
import sys
import unittest


def run_desktop_tests() -> bool:
    """Run desktop app unit tests via unittest discovery."""
    print("=" * 60)
    print("Desktop Tests")
    print("=" * 60)
    loader = unittest.defaultTestLoader
    suite = loader.discover(start_dir=".", pattern="test*.py", top_level_dir=".")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


def run_django_tests() -> bool:
    """Run Django web app tests via manage.py test."""
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    manage_py = os.path.join(web_dir, "manage.py")
    if not os.path.exists(manage_py):
        print("\nSkipping Django tests (web/manage.py not found)")
        return True
    print("\n" + "=" * 60)
    print("Django Tests")
    print("=" * 60)
    result = subprocess.run(
        [sys.executable, manage_py, "test", "--verbosity=2"],
        cwd=web_dir,
    )
    return result.returncode == 0


def main() -> int:
    desktop_ok = run_desktop_tests()
    django_ok = run_django_tests()
    print("\n" + "=" * 60)
    print(f"Desktop: {'PASS' if desktop_ok else 'FAIL'}")
    print(f"Django:  {'PASS' if django_ok else 'FAIL'}")
    print("=" * 60)
    return 0 if (desktop_ok and django_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
