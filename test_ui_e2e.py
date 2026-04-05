import os
import tempfile
import types
import unittest
from unittest.mock import patch

import cv2
import numpy as np
import tkinter

import AutoBoundGUI as gui
from annotation_store import AnnotationStore


class TestUIEndToEnd(unittest.TestCase):
    def setUp(self):
        gui.window = gui.CTk()
        gui.window.withdraw()
        gui.info_message = tkinter.StringVar(master=gui.window, value="")
        gui.show_bboxes_var = tkinter.BooleanVar(master=gui.window, value=True)

        gui.bold10 = gui.CTkFont(family="Segoe UI", size=10, weight="bold")
        gui.bold11 = gui.CTkFont(family="Segoe UI", size=11, weight="bold")
        gui.bold12 = gui.CTkFont(family="Segoe UI", size=12, weight="bold")
        gui.bold19 = gui.CTkFont(family="Segoe UI", size=19, weight="bold")

        gui.annotation_store = AnnotationStore()
        gui.bbox_start_x = 0
        gui.bbox_start_y = 0
        gui.bbox_rect_id = None
        gui.bbox_canvas = None
        gui.bbox_photo = None
        gui.bbox_scale = 1.0
        gui.bbox_drawn_rect_ids = []
        gui.bbox_drawn_text_ids = []
        gui.current_image_id = None

        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp_dir.cleanup()
        if getattr(gui, "window", None) is not None:
            gui.window.destroy()

    def _make_test_video(self, file_name="sample.avi"):
        video_path = os.path.join(self.temp_dir.name, file_name)
        width, height = 160, 120
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        writer = cv2.VideoWriter(video_path, fourcc, 5.0, (width, height))
        if not writer.isOpened():
            self.skipTest("OpenCV video writer unavailable in this environment")

        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (0, 255, 0)
        writer.write(frame)
        writer.release()
        return video_path

    def _find_bbox_checkbox(self):
        for child in gui.window.winfo_children():
            if isinstance(child, gui.CTkCheckBox):
                text = child.cget("text")
                if text == "Show Bounding Boxes":
                    return child
        return None

    def test_open_files_loads_first_video_and_shows_bbox_checkbox(self):
        video_path = self._make_test_video()

        with patch.object(gui.filedialog, "askopenfilenames", return_value=[video_path]):
            gui.open_files_action()

        self.assertIsNotNone(gui.bbox_canvas)
        self.assertIsNotNone(gui.current_image_id)
        self.assertIn("Draw bounding boxes on the frame", gui.info_message.get())

        gui.window.update_idletasks()
        checkbox = self._find_bbox_checkbox()
        self.assertIsNotNone(checkbox)
        self.assertEqual(str(checkbox.winfo_manager()), "place")
        self.assertEqual(checkbox.cget("text"), "Show Bounding Boxes")

    def test_draw_bbox_adds_annotation(self):
        video_path = self._make_test_video()
        gui.show_frame_with_canvas(video_path)

        gui.on_bbox_mouse_press(types.SimpleNamespace(x=10, y=10))
        gui.on_bbox_mouse_drag(types.SimpleNamespace(x=90, y=70))
        gui.on_bbox_mouse_release(types.SimpleNamespace(x=90, y=70))

        self.assertEqual(len(gui.annotation_store.annotations), 1)
        self.assertEqual(len(gui.bbox_drawn_rect_ids), 1)
        self.assertEqual(len(gui.bbox_drawn_text_ids), 1)
        self.assertIn("Bounding box saved", gui.info_message.get())

    def test_toggle_checkbox_hides_and_shows_existing_bboxes(self):
        video_path = self._make_test_video()
        gui.show_frame_with_canvas(video_path)
        gui.place_bbox_toggle_checkbox()

        gui.on_bbox_mouse_press(types.SimpleNamespace(x=20, y=20))
        gui.on_bbox_mouse_release(types.SimpleNamespace(x=80, y=80))
        rect_id = gui.bbox_drawn_rect_ids[0]

        gui.show_bboxes_var.set(False)
        gui.toggle_bboxes()
        self.assertEqual(gui.bbox_canvas.itemcget(rect_id, "state"), "hidden")

        gui.show_bboxes_var.set(True)
        gui.toggle_bboxes()
        self.assertEqual(gui.bbox_canvas.itemcget(rect_id, "state"), "normal")

    def test_clear_bboxes_action_clears_memory_and_canvas(self):
        video_path = self._make_test_video()
        gui.show_frame_with_canvas(video_path)

        gui.on_bbox_mouse_press(types.SimpleNamespace(x=15, y=15))
        gui.on_bbox_mouse_release(types.SimpleNamespace(x=100, y=90))
        self.assertEqual(len(gui.annotation_store.annotations), 1)

        gui.clear_bboxes_action()

        self.assertEqual(len(gui.annotation_store.annotations), 0)
        self.assertEqual(len(gui.bbox_drawn_rect_ids), 0)
        self.assertEqual(len(gui.bbox_drawn_text_ids), 0)
        self.assertEqual(gui.info_message.get(), "All bounding boxes cleared")


if __name__ == "__main__":
    unittest.main()
