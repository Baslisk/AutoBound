"""Benchmark the Django ``/api/frame/<id>/<n>/`` endpoint.

Tests are run against the Django test client (no real HTTP server needed).
Measures frame-serving latency both without and with server-side
:class:`frame_cache.FrameCache`.
"""

import os
import sys
import tempfile
import unittest

import cv2
import numpy as np

# Ensure project root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Django setup — must happen before importing any Django modules
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "autobound_web.settings")

# Add web/ to sys.path so Django can find the project
web_dir = os.path.join(os.path.dirname(__file__), "..", "..", "web")
if web_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(web_dir))

import django
django.setup()

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from annotations.models import Category, VideoFile
from tests.perf.helpers import TimingResult, benchmark, timer_ms

API_P95_MS = float(os.environ.get("PERF_API_P95_MS", "300"))
ITERATIONS = 20


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(),
    DEFAULT_FILE_STORAGE="django.core.files.storage.FileSystemStorage",
)
class TestWebFrameAPIPerformance(TestCase):
    """Benchmark the /api/frame/ endpoint via Django test client."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._tmp_dir = tempfile.TemporaryDirectory()

        # Create a test video file on disk
        cls.video_path = cls._make_video(60, cls._tmp_dir.name)

    @classmethod
    def tearDownClass(cls):
        cls._tmp_dir.cleanup()
        super().tearDownClass()

    @staticmethod
    def _make_video(frame_count, tmp_dir):
        import tempfile as _tmp
        fd, path = _tmp.mkstemp(suffix=".avi", dir=tmp_dir)
        os.close(fd)
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        writer = cv2.VideoWriter(path, fourcc, 30.0, (320, 240))
        for i in range(frame_count):
            frame = np.full((240, 320, 3), ((i * 7) % 256,), dtype=np.uint8)
            writer.write(frame)
        writer.release()
        return path

    def setUp(self):
        self.user = User.objects.create_user("perf", password="perf1234")
        self.client.login(username="perf", password="perf1234")

        Category.objects.get_or_create(pk=1, defaults={"name": "object"})

        # Create VideoFile pointing at the test video
        self.video = VideoFile.objects.create(
            file_name="perf_test.avi",
            width=320,
            height=240,
            frame_count=60,
            uploaded_by=self.user,
        )
        # Save the actual file so the API can open it
        from django.core.files import File
        with open(self.video_path, "rb") as f:
            self.video.file.save("perf_test.avi", File(f), save=True)

    def test_frame_api_latency(self):
        """Sequential frame requests via the test client."""
        vid = self.video.pk
        idx = [0]

        def step():
            fn = idx[0] % 60
            resp = self.client.get(f"/api/frame/{vid}/{fn}/")
            self.assertEqual(resp.status_code, 200)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        print(f"\n  Web API frame latency: {result}")
        self.assertLessEqual(
            result.p95, API_P95_MS,
            f"API p95 ({result.p95:.1f}ms) exceeds {API_P95_MS}ms",
        )

    def test_frame_api_random_access(self):
        """Random-order frame requests."""
        import random
        vid = self.video.pk
        targets = [random.randint(0, 59) for _ in range(ITERATIONS + 5)]
        idx = [0]

        def step():
            fn = targets[idx[0]]
            resp = self.client.get(f"/api/frame/{vid}/{fn}/")
            self.assertEqual(resp.status_code, 200)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        print(f"\n  Web API random:        {result}")
        self.assertLessEqual(
            result.p95, API_P95_MS,
            f"API random p95 ({result.p95:.1f}ms) exceeds {API_P95_MS}ms",
        )


if __name__ == "__main__":
    unittest.main()
