"""Prediction engine for tracking bounding boxes across video frames.

Uses OpenCV object tracking to predict where a bounding box will appear
in subsequent frames of a video.  The caller supplies a video path, a
starting frame number, and a bounding box in original-image coordinates.
The engine initialises an OpenCV tracker on that frame and updates it on
the next frame, returning the predicted bounding box.

Reference:
    https://kevinsaye.wordpress.com/2021/04/13/blurring-an-object-with-opencv-and-moviepy/
"""

import cv2


def _create_tracker():
    """Create an OpenCV object tracker using the best available algorithm.

    The function tries several tracker factories in order of preference
    (CSRT → KCF → MIL) and returns the first one that can be instantiated.
    CSRT and KCF live in ``cv2.legacy`` or require the *contrib* package,
    while MIL is always available in the base OpenCV build.

    Returns:
        A ``cv2.Tracker`` instance.

    Raises:
        RuntimeError: If no suitable tracker is found.
    """
    factories = []

    # CSRT – most accurate general-purpose tracker
    if hasattr(cv2, "TrackerCSRT_create"):
        factories.append(cv2.TrackerCSRT_create)
    if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "TrackerCSRT_create"):
        factories.append(cv2.legacy.TrackerCSRT_create)

    # KCF – fast and fairly accurate
    if hasattr(cv2, "TrackerKCF_create"):
        factories.append(cv2.TrackerKCF_create)
    if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "TrackerKCF_create"):
        factories.append(cv2.legacy.TrackerKCF_create)

    # MIL – always part of the base OpenCV package
    if hasattr(cv2, "TrackerMIL_create"):
        factories.append(cv2.TrackerMIL_create)

    for factory in factories:
        try:
            return factory()
        except Exception:
            continue

    raise RuntimeError("No suitable OpenCV tracker available")


def predict_next_frame(video_path, frame_number, bbox):
    """Track a bounding box from *frame_number* to the next frame.

    Args:
        video_path: Filesystem path to the video file.
        frame_number: Zero-based index of the frame that *bbox* belongs to.
        bbox: ``[x, y, width, height]`` in original image coordinates.

    Returns:
        A tuple ``(success, predicted_bbox)`` where *predicted_bbox* is
        ``[x, y, w, h]`` in original image coordinates when *success* is
        ``True``, or ``None`` when tracking failed.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return False, None

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if frame_number < 0 or frame_number + 1 >= total_frames:
        cap.release()
        return False, None

    # Seek to the current frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
    ret, current_frame = cap.read()
    if not ret:
        cap.release()
        return False, None

    # Initialise the tracker on the current frame
    tracker = _create_tracker()
    x, y, w, h = bbox
    tracker.init(current_frame, (int(x), int(y), int(w), int(h)))

    # Read the next frame and update the tracker
    ret, next_frame = cap.read()
    cap.release()
    if not ret:
        return False, None

    success, tracked_box = tracker.update(next_frame)
    if not success:
        return False, None

    tx, ty, tw, th = tracked_box
    predicted_bbox = [round(tx), round(ty), round(tw), round(th)]
    return True, predicted_bbox


def track_object(video_path, start_frame, bbox, max_frames=0):
    """Track a bounding box through consecutive frames starting from *start_frame*.

    Opens the video once and keeps the tracker alive across frames, which is
    significantly more efficient than calling :func:`predict_next_frame`
    repeatedly.

    Args:
        video_path: Filesystem path to the video file.
        start_frame: Zero-based index of the seed frame that *bbox* belongs to.
        bbox: ``[x, y, width, height]`` in original image coordinates.
        max_frames: Maximum number of frames to track beyond *start_frame*.
            ``0`` means track until failure or end of video.

    Returns:
        A list of dicts ``{"frame_number": int, "bbox": [x, y, w, h]}``,
        one entry per successfully tracked frame.  Returns an empty list if
        tracking fails immediately.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if start_frame < 0 or start_frame + 1 >= total_frames:
        cap.release()
        return []

    # Seek to and read the seed frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    ret, seed_frame = cap.read()
    if not ret:
        cap.release()
        return []

    # Initialise the tracker on the seed frame
    tracker = _create_tracker()
    x, y, w, h = bbox
    tracker.init(seed_frame, (int(x), int(y), int(w), int(h)))

    results = []
    frame_num = start_frame + 1
    limit = (start_frame + max_frames) if max_frames > 0 else total_frames

    while frame_num < limit:
        ret, frame = cap.read()
        if not ret:
            break

        success, tracked_box = tracker.update(frame)
        if not success:
            break

        tx, ty, tw, th = tracked_box
        results.append({
            "frame_number": frame_num,
            "bbox": [round(tx), round(ty), round(tw), round(th)],
        })
        frame_num += 1

    cap.release()
    return results
