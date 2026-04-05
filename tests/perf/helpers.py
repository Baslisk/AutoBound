"""Shared helpers for performance tests."""

import os
import statistics
import tempfile
import time
from contextlib import contextmanager

import cv2
import numpy as np


def make_test_video(frame_count=60, width=640, height=480, fps=30.0,
                    codec="MJPG", suffix=".avi", tmp_dir=None):
    """Create a synthetic video file and return its path.

    Each frame has a unique solid colour derived from its index so that
    sequential and random reads produce visibly distinct results.

    Parameters
    ----------
    frame_count : int
        Number of frames to write.
    width, height : int
        Frame dimensions.
    fps : float
        Frames per second metadata.
    codec : str
        FourCC codec string (MJPG is universally available).
    suffix : str
        File extension.
    tmp_dir : str or None
        Directory for the video file.  Uses system temp if *None*.

    Returns
    -------
    str
        Absolute path to the created video file.
    """
    fd, path = tempfile.mkstemp(suffix=suffix, dir=tmp_dir)
    os.close(fd)

    fourcc = cv2.VideoWriter_fourcc(*codec)
    writer = cv2.VideoWriter(path, fourcc, fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("OpenCV VideoWriter failed to open — codec may "
                           "be unavailable in this environment")

    for i in range(frame_count):
        # Unique colour per frame for validation
        r = (i * 7) % 256
        g = (i * 13 + 50) % 256
        b = (i * 19 + 100) % 256
        frame = np.full((height, width, 3), (b, g, r), dtype=np.uint8)
        writer.write(frame)

    writer.release()
    return path


class TimingResult:
    """Container for a series of timing measurements."""

    def __init__(self, times_ms: list[float]):
        self.times = sorted(times_ms)
        self.count = len(self.times)
        self.min = self.times[0] if self.times else 0.0
        self.max = self.times[-1] if self.times else 0.0
        self.median = statistics.median(self.times) if self.times else 0.0
        self.mean = statistics.mean(self.times) if self.times else 0.0
        self.p95 = self._percentile(0.95)

    def _percentile(self, p: float) -> float:
        if not self.times:
            return 0.0
        k = (len(self.times) - 1) * p
        f = int(k)
        c = f + 1 if f + 1 < len(self.times) else f
        return self.times[f] + (k - f) * (self.times[c] - self.times[f])

    def __repr__(self):
        return (f"TimingResult(n={self.count}, min={self.min:.1f}ms, "
                f"median={self.median:.1f}ms, p95={self.p95:.1f}ms, "
                f"max={self.max:.1f}ms)")


@contextmanager
def timer_ms():
    """Context manager that yields a mutable list; appends elapsed ms on exit.

    Usage::

        elapsed = []
        with timer_ms() as t:
            do_work()
        print(t[0], "ms")
    """
    result = []
    start = time.perf_counter()
    yield result
    result.append((time.perf_counter() - start) * 1000.0)


def benchmark(func, iterations=30, warmup=3):
    """Run *func* repeatedly and return a :class:`TimingResult`.

    Parameters
    ----------
    func : callable
        Zero-argument callable to benchmark.
    iterations : int
        Number of timed invocations.
    warmup : int
        Number of untimed invocations before measurement.
    """
    for _ in range(warmup):
        func()

    times = []
    for _ in range(iterations):
        with timer_ms() as t:
            func()
        times.append(t[0])

    return TimingResult(times)
