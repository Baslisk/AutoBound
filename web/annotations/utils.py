"""Utilities for accessing video files across local and remote storage backends."""

import atexit
import logging
import os
import tempfile

logger = logging.getLogger(__name__)

# Process-level cache: video PK → local filesystem path.
# Avoids re-downloading from remote storage on every frame request.
_local_path_cache: dict[int, str] = {}
_temp_files: list[str] = []


def _cleanup_temp_files() -> None:
    """Remove temp files created for remote-storage videos on process exit."""
    for path in _temp_files:
        try:
            os.unlink(path)
        except OSError:
            pass


atexit.register(_cleanup_temp_files)


def get_local_video_path(video) -> str:
    """Return a local filesystem path for the video's file.

    When using local storage (default Django ``FileSystemStorage``), this
    returns ``video.file.path`` directly.  When using a remote backend
    (e.g. S3 / MinIO), the file is downloaded to a temp file
    and the path is cached for the lifetime of the process.
    """
    if video.pk in _local_path_cache:
        cached = _local_path_cache[video.pk]
        if os.path.exists(cached):
            return cached
        # Cached path gone — fall through and re-download
        del _local_path_cache[video.pk]

    # Try local storage first (fast path)
    try:
        local_path = video.file.path
        if os.path.exists(local_path):
            return local_path
    except NotImplementedError:
        # Remote storage backend (S3, etc.) — download to temp file
        pass

    ext = os.path.splitext(video.file.name)[1] or ".mp4"
    fd, tmp_path = tempfile.mkstemp(suffix=ext, prefix=f"autobound_v{video.pk}_")
    try:
        with os.fdopen(fd, "wb") as tmp:
            for chunk in video.file.chunks():
                tmp.write(chunk)
    except Exception:
        os.close(fd)
        os.unlink(tmp_path)
        raise

    _local_path_cache[video.pk] = tmp_path
    _temp_files.append(tmp_path)
    logger.debug("Downloaded video %s to %s", video.pk, tmp_path)
    return tmp_path
