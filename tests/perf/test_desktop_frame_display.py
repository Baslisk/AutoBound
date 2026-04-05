"""Benchmark the desktop frame-display pipeline.

Measures the full path: seek → decode → colour-convert → resize → PhotoImage,
which is the bottleneck users experience when scrolling frames in the
desktop GUI.

Runs *without* spawning a real Tk window by only timing the image-processing
portion (cv2 + PIL resize).  The final ``ImageTk.PhotoImage`` step is
optionally included when a display is available.
"""

import os
import random
import sys
import tempfile
import unittest

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from frame_cache import FrameCache
from tests.perf.helpers import TimingResult, benchmark, make_test_video, timer_ms

PIPELINE_P95_MS = float(os.environ.get("PERF_PIPELINE_P95_MS", "150"))
CACHED_PIPELINE_P95_MS = float(os.environ.get("PERF_CACHED_PIPE_P95_MS", "50"))
FRAME_COUNT = 120
CANVAS_W, CANVAS_H = 600, 400
ITERATIONS = 30


class TestDesktopPipelinePerformance(unittest.TestCase):
    """Benchmark the desktop frame display pipeline."""

    @classmethod
    def setUpClass(cls):
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls.video_path = make_test_video(
            frame_count=FRAME_COUNT, width=1280, height=720,
            tmp_dir=cls._tmp_dir.name,
        )

    @classmethod
    def tearDownClass(cls):
        cls._tmp_dir.cleanup()

    @staticmethod
    def _display_pipeline(frame_bgr, canvas_w=CANVAS_W, canvas_h=CANVAS_H):
        """Replicate the desktop display pipeline (minus Tk PhotoImage)."""
        h, w = frame_bgr.shape[:2]
        scale = min(canvas_w / w, canvas_h / h, 1.0)
        display_w = int(w * scale)
        display_h = int(h * scale)

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(frame_rgb).resize(
            (display_w, display_h), Image.LANCZOS
        )
        return pil_image

    def test_uncached_sequential_pipeline(self):
        """Full pipeline: open video → seek → decode → resize (sequential)."""
        cap = cv2.VideoCapture(self.video_path)
        idx = [0]

        def step():
            fn = idx[0] % FRAME_COUNT
            cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
            ret, frame = cap.read()
            self.assertTrue(ret)
            self._display_pipeline(frame)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        cap.release()

        print(f"\n  Uncached pipeline (seq):  {result}")
        self.assertLessEqual(
            result.p95, PIPELINE_P95_MS,
            f"Uncached pipeline p95 ({result.p95:.1f}ms) exceeds {PIPELINE_P95_MS}ms",
        )

    def test_uncached_random_pipeline(self):
        """Full pipeline with random-access pattern."""
        cap = cv2.VideoCapture(self.video_path)
        targets = [random.randint(0, FRAME_COUNT - 1) for _ in range(ITERATIONS + 5)]
        idx = [0]

        def step():
            fn = targets[idx[0]]
            cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
            ret, frame = cap.read()
            self.assertTrue(ret)
            self._display_pipeline(frame)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        cap.release()

        print(f"\n  Uncached pipeline (rand): {result}")

    def test_cached_pipeline(self):
        """Pipeline with FrameCache — only colour-convert + resize on hit."""
        cache = FrameCache(max_frames=32, max_captures=2)

        # Pre-warm cache
        for fn in range(min(32, FRAME_COUNT)):
            cache.get_frame(self.video_path, fn)

        targets = list(range(min(32, FRAME_COUNT)))
        idx = [0]

        def step():
            fn = targets[idx[0] % len(targets)]
            frame = cache.get_frame(self.video_path, fn)
            self.assertIsNotNone(frame)
            self._display_pipeline(frame)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        cache.clear()

        print(f"\n  Cached pipeline:          {result}")
        self.assertLessEqual(
            result.p95, CACHED_PIPELINE_P95_MS,
            f"Cached pipeline p95 ({result.p95:.1f}ms) exceeds {CACHED_PIPELINE_P95_MS}ms",
        )


if __name__ == "__main__":
    unittest.main()
