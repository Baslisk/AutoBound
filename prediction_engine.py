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
