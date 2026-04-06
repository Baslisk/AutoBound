import os
import tempfile
import unittest

import cv2
import numpy as np

from prediction_engine import predict_next_frame, _create_tracker


class TestCreateTracker(unittest.TestCase):
    """Verify that _create_tracker returns a usable tracker object."""

    def test_returns_tracker(self):
        tracker = _create_tracker()
        self.assertTrue(hasattr(tracker, "init"))
        self.assertTrue(hasattr(tracker, "update"))


class TestPredictNextFrame(unittest.TestCase):
    """Unit tests for predict_next_frame."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _make_test_video(self, num_frames=5, width=160, height=120,
                         file_name="test.avi"):
        """Create a small test video with a white rectangle moving right."""
        video_path = os.path.join(self.temp_dir.name, file_name)
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        writer = cv2.VideoWriter(video_path, fourcc, 10.0, (width, height))
        if not writer.isOpened():
            self.skipTest("OpenCV VideoWriter unavailable in this environment")

        for i in range(num_frames):
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            # Draw a white rectangle that shifts 5 pixels to the right each frame
            x_offset = 10 + i * 5
            cv2.rectangle(frame, (x_offset, 20), (x_offset + 40, 60),
                          (255, 255, 255), -1)
            writer.write(frame)
        writer.release()
        return video_path

    # ------------------------------------------------------------------
    # Success path
    # ------------------------------------------------------------------

    def test_predict_returns_success_and_bbox(self):
        video_path = self._make_test_video()
        bbox = [10, 20, 40, 40]
        success, predicted = predict_next_frame(video_path, 0, bbox)
        self.assertTrue(success)
        self.assertIsNotNone(predicted)
        self.assertEqual(len(predicted), 4)

    def test_predicted_bbox_values_are_ints(self):
        video_path = self._make_test_video()
        success, predicted = predict_next_frame(video_path, 0, [10, 20, 40, 40])
        self.assertTrue(success)
        for val in predicted:
            self.assertIsInstance(val, int)

    def test_predict_from_middle_frame(self):
        video_path = self._make_test_video(num_frames=10)
        success, predicted = predict_next_frame(video_path, 3, [25, 20, 40, 40])
        self.assertTrue(success)
        self.assertIsNotNone(predicted)

    # ------------------------------------------------------------------
    # Failure paths
    # ------------------------------------------------------------------

    def test_nonexistent_video_returns_failure(self):
        success, predicted = predict_next_frame("/no/such/file.avi", 0,
                                                 [10, 20, 30, 40])
        self.assertFalse(success)
        self.assertIsNone(predicted)

    def test_last_frame_returns_failure(self):
        video_path = self._make_test_video(num_frames=3)
        # Frame 2 is the last frame – no frame 3 to track to
        success, predicted = predict_next_frame(video_path, 2, [10, 20, 40, 40])
        self.assertFalse(success)
        self.assertIsNone(predicted)

    def test_negative_frame_number_returns_failure(self):
        video_path = self._make_test_video()
        success, predicted = predict_next_frame(video_path, -1, [10, 20, 40, 40])
        self.assertFalse(success)
        self.assertIsNone(predicted)

    def test_single_frame_video_returns_failure(self):
        video_path = self._make_test_video(num_frames=1)
        success, predicted = predict_next_frame(video_path, 0, [10, 20, 40, 40])
        self.assertFalse(success)
        self.assertIsNone(predicted)


if __name__ == "__main__":
    unittest.main()
