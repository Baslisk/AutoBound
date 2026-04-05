"""Benchmark OpenCV frame seeking — sequential, random, and cached.

Measures the raw cost of ``cv2.VideoCapture.set(CAP_PROP_POS_FRAMES)``
plus ``read()`` under different access patterns, both with and without
:class:`frame_cache.FrameCache`.
"""

import os
import random
import sys
import tempfile
import unittest

import cv2

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from frame_cache import FrameCache
from tests.perf.helpers import TimingResult, benchmark, make_test_video, timer_ms

# Allow overriding thresholds via env vars for CI flexibility
SEQUENTIAL_P95_MS = float(os.environ.get("PERF_SEQ_P95_MS", "100"))
RANDOM_P95_MS = float(os.environ.get("PERF_RAND_P95_MS", "200"))
CACHED_P95_MS = float(os.environ.get("PERF_CACHED_P95_MS", "5"))
FRAME_COUNT = 120
ITERATIONS = 30


class TestFrameSeekPerformance(unittest.TestCase):
    """Benchmarks for raw OpenCV seek and FrameCache seek."""

    @classmethod
    def setUpClass(cls):
        cls._tmp_dir = tempfile.TemporaryDirectory()
        cls.video_path = make_test_video(
            frame_count=FRAME_COUNT, width=640, height=480,
            tmp_dir=cls._tmp_dir.name,
        )

    @classmethod
    def tearDownClass(cls):
        cls._tmp_dir.cleanup()

    # ---- raw OpenCV benchmarks ------------------------------------

    def test_sequential_seek(self):
        """Sequential frame reads (frame 0, 1, 2, …)."""
        cap = cv2.VideoCapture(self.video_path)
        idx = [0]

        def step():
            fn = idx[0] % FRAME_COUNT
            cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
            ret, _ = cap.read()
            self.assertTrue(ret)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=5)
        cap.release()

        print(f"\n  Sequential seek: {result}")
        self.assertLessEqual(
            result.p95, SEQUENTIAL_P95_MS,
            f"Sequential p95 ({result.p95:.1f}ms) exceeds {SEQUENTIAL_P95_MS}ms",
        )

    def test_random_seek(self):
        """Random-access frame reads across the video."""
        cap = cv2.VideoCapture(self.video_path)
        targets = [random.randint(0, FRAME_COUNT - 1) for _ in range(ITERATIONS + 5)]
        idx = [0]

        def step():
            fn = targets[idx[0]]
            cap.set(cv2.CAP_PROP_POS_FRAMES, fn)
            ret, _ = cap.read()
            self.assertTrue(ret)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=5)
        cap.release()

        print(f"\n  Random seek:     {result}")
        self.assertLessEqual(
            result.p95, RANDOM_P95_MS,
            f"Random p95 ({result.p95:.1f}ms) exceeds {RANDOM_P95_MS}ms",
        )

    # ---- FrameCache benchmarks ------------------------------------

    def test_cache_miss(self):
        """First access (cold cache) should still be within random-seek budget."""
        cache = FrameCache(max_frames=32, max_captures=2)
        targets = list(range(FRAME_COUNT))
        random.shuffle(targets)
        idx = [0]

        def step():
            fn = targets[idx[0] % FRAME_COUNT]
            frame = cache.get_frame(self.video_path, fn)
            self.assertIsNotNone(frame)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=0)
        cache.clear()

        print(f"\n  Cache miss:      {result}")
        self.assertLessEqual(
            result.p95, RANDOM_P95_MS,
            f"Cache-miss p95 ({result.p95:.1f}ms) exceeds {RANDOM_P95_MS}ms",
        )

    def test_cache_hit(self):
        """Repeated access to cached frames should be sub-millisecond."""
        cache = FrameCache(max_frames=32, max_captures=2)
        # Warm the cache
        for fn in range(min(32, FRAME_COUNT)):
            cache.get_frame(self.video_path, fn)

        targets = list(range(min(32, FRAME_COUNT)))
        idx = [0]

        def step():
            fn = targets[idx[0] % len(targets)]
            frame = cache.get_frame(self.video_path, fn)
            self.assertIsNotNone(frame)
            idx[0] += 1

        result = benchmark(step, iterations=ITERATIONS, warmup=3)
        cache.clear()

        print(f"\n  Cache hit:       {result}")
        self.assertLessEqual(
            result.p95, CACHED_P95_MS,
            f"Cache-hit p95 ({result.p95:.1f}ms) exceeds {CACHED_P95_MS}ms",
        )

    def test_prefetch_populates_cache(self):
        """Prefetch should load frames asynchronously into the cache."""
        cache = FrameCache(max_frames=32, max_captures=2)
        frames_to_prefetch = list(range(5, 11))

        cache.prefetch(self.video_path, frames_to_prefetch)

        # Wait for prefetch to complete (with timeout)
        import time
        for _ in range(100):
            with cache._lock:
                all_cached = all(
                    (self.video_path, fn) in cache._frames
                    for fn in frames_to_prefetch
                )
            if all_cached:
                break
            time.sleep(0.05)

        for fn in frames_to_prefetch:
            frame = cache.get_frame(self.video_path, fn)
            self.assertIsNotNone(frame, f"Frame {fn} not cached after prefetch")

        cache.clear()

    def test_cache_eviction(self):
        """Cache should not exceed max_frames."""
        cache = FrameCache(max_frames=8, max_captures=2)
        for fn in range(20):
            cache.get_frame(self.video_path, fn)

        stats = cache.stats
        self.assertLessEqual(stats["cached_frames"], 8)
        cache.clear()


if __name__ == "__main__":
    unittest.main()
