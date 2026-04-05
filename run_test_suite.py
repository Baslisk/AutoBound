import os
import subprocess
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def run_desktop_tests() -> bool:
    """Run desktop app unit tests (root-level test_*.py files only)."""
    print("=" * 60)
    print("Desktop Tests")
    print("=" * 60)
    loader = unittest.defaultTestLoader
    # Only discover root-level test files — avoid recursing into tests/perf/
    # which contains Django-dependent tests that need Django's test runner.
    suite = unittest.TestSuite()
    for name in sorted(os.listdir(ROOT_DIR)):
        if name.startswith("test") and name.endswith(".py"):
            discovered = loader.discover(
                start_dir=ROOT_DIR, pattern=name, top_level_dir=ROOT_DIR
            )
            suite.addTests(discovered)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return result.wasSuccessful()


def run_django_tests() -> bool:
    """Run Django web app tests via manage.py test."""
    web_dir = os.path.join(ROOT_DIR, "web")
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


def run_perf_tests() -> bool:
    """Run performance benchmark tests."""
    perf_dir = os.path.join(ROOT_DIR, "tests", "perf")
    if not os.path.isdir(perf_dir):
        print("\nSkipping perf tests (tests/perf/ not found)")
        return True

    print("\n" + "=" * 60)
    print("Performance Tests (non-Django)")
    print("=" * 60)
    loader = unittest.defaultTestLoader
    suite = unittest.TestSuite()
    for name in sorted(os.listdir(perf_dir)):
        if name.startswith("test") and name.endswith(".py") and "web" not in name:
            discovered = loader.discover(
                start_dir=perf_dir, pattern=name, top_level_dir=ROOT_DIR
            )
            suite.addTests(discovered)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    non_django_ok = result.wasSuccessful()

    # Django-based perf tests run through manage.py test
    web_perf_files = [
        f for f in os.listdir(perf_dir)
        if f.startswith("test") and f.endswith(".py") and "web" in f
    ]
    if web_perf_files:
        print("\n" + "=" * 60)
        print("Performance Tests (Django)")
        print("=" * 60)
        web_dir = os.path.join(ROOT_DIR, "web")
        manage_py = os.path.join(web_dir, "manage.py")
        # Run Django perf tests via manage.py with the project root on sys.path
        env = os.environ.copy()
        env["PYTHONPATH"] = (
            ROOT_DIR + os.pathsep
            + os.path.join(ROOT_DIR, "web") + os.pathsep
            + env.get("PYTHONPATH", "")
        )
        env.setdefault("DJANGO_SETTINGS_MODULE", "autobound_web.settings")
        result = subprocess.run(
            [sys.executable, "-m", "django", "test",
             "tests.perf.test_web_frame_api", "--verbosity=2"],
            cwd=ROOT_DIR,
            env=env,
        )
        django_perf_ok = result.returncode == 0
    else:
        django_perf_ok = True

    return non_django_ok and django_perf_ok


def main() -> int:
    desktop_ok = run_desktop_tests()
    django_ok = run_django_tests()
    perf_ok = run_perf_tests()
    print("\n" + "=" * 60)
    print(f"Desktop: {'PASS' if desktop_ok else 'FAIL'}")
    print(f"Django:  {'PASS' if django_ok else 'FAIL'}")
    print(f"Perf:    {'PASS' if perf_ok else 'FAIL'}")
    print("=" * 60)
    return 0 if (desktop_ok and django_ok and perf_ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
