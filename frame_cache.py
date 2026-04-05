"""Thread-safe LRU frame cache with background pre-fetching.

Shared between the desktop GUI and the Django web app to avoid
re-opening and re-seeking video files on every frame request.
"""

import collections
import threading

import cv2


class FrameCache:
    """LRU cache for decoded video frames backed by OpenCV VideoCapture.

    Stores raw BGR numpy arrays keyed by ``(video_path, frame_number)``.
    A small pool of open ``VideoCapture`` objects is kept so that
    sequential reads avoid re-opening the container.

    Parameters
    ----------
    max_frames : int
        Maximum number of decoded frames to keep in memory.
    max_captures : int
        Maximum number of ``VideoCapture`` instances to keep open.
    """

    def __init__(self, max_frames=32, max_captures=4):
        self._max_frames = max_frames
        self._max_captures = max_captures

        # OrderedDict used as LRU: most-recently-used at the end
        self._frames: collections.OrderedDict = collections.OrderedDict()

        # Pool of open VideoCapture handles: path -> (cap, lock)
        self._captures: collections.OrderedDict = collections.OrderedDict()

        self._lock = threading.Lock()
        self._prefetch_pool: list[threading.Thread] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_frame(self, video_path: str, frame_number: int):
        """Return the decoded BGR numpy array for the given frame.

        Returns ``None`` if the frame could not be read.
        """
        key = (video_path, frame_number)

        with self._lock:
            if key in self._frames:
                self._frames.move_to_end(key)
                return self._frames[key]

        # Cache miss — read from video (outside the lock to avoid blocking)
        frame = self._read_frame(video_path, frame_number)

        if frame is not None:
            with self._lock:
                self._frames[key] = frame
                self._frames.move_to_end(key)
                while len(self._frames) > self._max_frames:
                    self._frames.popitem(last=False)

        return frame

    def prefetch(self, video_path: str, frame_numbers: list[int]):
        """Pre-load frames in a background thread.

        Already-cached frames are skipped.  Only one prefetch batch runs
        at a time per call; previous batches are left to finish naturally.
        """
        to_fetch = []
        with self._lock:
            for fn in frame_numbers:
                if (video_path, fn) not in self._frames:
                    to_fetch.append(fn)
        if not to_fetch:
            return

        t = threading.Thread(
            target=self._prefetch_worker,
            args=(video_path, to_fetch),
            daemon=True,
        )
        t.start()

        # Housekeep finished threads
        self._prefetch_pool = [p for p in self._prefetch_pool if p.is_alive()]
        self._prefetch_pool.append(t)

    def get_frame_jpeg(self, video_path: str, frame_number: int,
                       quality: int = 85) -> bytes | None:
        """Return JPEG-encoded bytes for the given frame.

        Useful for the web API to avoid re-encoding on every request.
        """
        frame = self.get_frame(video_path, frame_number)
        if frame is None:
            return None
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            return None
        return buf.tobytes()

    def clear(self):
        """Drop all cached frames and close all open captures."""
        with self._lock:
            self._frames.clear()
            for path in list(self._captures):
                cap, cap_lock = self._captures.pop(path)
                with cap_lock:
                    cap.release()

    def evict_video(self, video_path: str):
        """Remove all cached data for a specific video."""
        with self._lock:
            keys_to_remove = [k for k in self._frames if k[0] == video_path]
            for k in keys_to_remove:
                del self._frames[k]
            if video_path in self._captures:
                cap, cap_lock = self._captures.pop(video_path)
                with cap_lock:
                    cap.release()

    @property
    def stats(self) -> dict:
        """Return cache occupancy statistics."""
        with self._lock:
            return {
                "cached_frames": len(self._frames),
                "max_frames": self._max_frames,
                "open_captures": len(self._captures),
                "max_captures": self._max_captures,
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_capture(self, video_path: str):
        """Return a ``(VideoCapture, Lock)`` pair, opening if necessary."""
        with self._lock:
            if video_path in self._captures:
                self._captures.move_to_end(video_path)
                return self._captures[video_path]

            cap = cv2.VideoCapture(video_path)
            cap_lock = threading.Lock()
            self._captures[video_path] = (cap, cap_lock)
            self._captures.move_to_end(video_path)

            # Evict oldest capture if over limit
            while len(self._captures) > self._max_captures:
                _, (old_cap, old_lock) = self._captures.popitem(last=False)
                with old_lock:
                    old_cap.release()

            return cap, cap_lock

    def _read_frame(self, video_path: str, frame_number: int):
        """Seek and decode a single frame."""
        cap, cap_lock = self._get_capture(video_path)
        with cap_lock:
            if not cap.isOpened():
                return None
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            return frame if ret else None

    def _prefetch_worker(self, video_path: str, frame_numbers: list[int]):
        """Background worker that loads a batch of frames into cache."""
        for fn in frame_numbers:
            key = (video_path, fn)
            with self._lock:
                if key in self._frames:
                    continue

            frame = self._read_frame(video_path, fn)
            if frame is not None:
                with self._lock:
                    self._frames[key] = frame
                    self._frames.move_to_end(key)
                    while len(self._frames) > self._max_frames:
                        self._frames.popitem(last=False)
