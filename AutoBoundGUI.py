import os.path
import sys
import platform
import tkinter
from tkinter import Tk, Frame, Menu, StringVar, BooleanVar, Canvas
import webbrowser
import cv2
import ctypes
from ctypes import wintypes
from customtkinter import (CTk, 
                           CTkButton, 
                           CTkCheckBox,
                           CTkEntry, 
                           CTkFont, 
                           CTkImage,
                           CTkLabel, 
                           CTkOptionMenu, 
                           CTkScrollableFrame,
                           filedialog, 
                           set_appearance_mode,
                           set_default_color_theme)
from PIL import Image, ImageTk

from annotation_store import AnnotationStore

# Windows Mica effect constants and function
DWMWA_SYSTEMBACKDROP_TYPE = 38

class MICAMODE:
    DARK = 2  # DWMSBT_MAINWINDOW for Mica

def ApplyMica(hwnd, mode):
    ctypes.windll.dwmapi.DwmSetWindowAttribute(
        hwnd, 
        DWMWA_SYSTEMBACKDROP_TYPE, 
        ctypes.byref(ctypes.c_int(mode)), 
        ctypes.sizeof(ctypes.c_int())
    )

app_name     = "AutoBound"
company_name = "ADNE"
version      = "1.0"

githubme     = "https://github.com/Baslisk/AutoBound"

windows_subversion   = int(platform.version().split('.')[2])

transparent_color = "#080808"

supported_file_extensions = ['.mp4', '.MP4',
                            '.webm', '.WEBM',
                            '.mkv', '.MKV',
                            '.flv', '.FLV',
                            '.gif', '.GIF',
                            '.m4v', ',M4V',
                            '.avi', '.AVI',
                            '.mov', '.MOV',
                            '.qt', '.3gp', 
                            '.mpg', '.mpeg']

# Annotation store (COCO format) ------

annotation_store = AnnotationStore()

# Bounding box drawing state
bbox_start_x = 0
bbox_start_y = 0
bbox_rect_id = None
bbox_canvas  = None
bbox_photo   = None
bbox_scale   = 1.0
bbox_drawn_rect_ids = []
current_image_id = None

# Classes and utils -------------------

class Gpu:
    def __init__(self, index, name):
        self.name   = name
        self.index  = index

class ScrollableImagesTextFrame(CTkScrollableFrame):
    def __init__(self, master, command=None, **kwargs):
        super().__init__(master, **kwargs)
        self.grid_columnconfigure(0, weight=1)
        self.label_list  = []
        self.button_list = []
        self.file_list   = []

    def get_selected_file_list(self): 
        return self.file_list

    def add_clean_button(self):
        label = CTkLabel(self, text = "")
        button = CTkButton(self, 
                            font  = bold11,
                            text  = "CLEAN", 
                            fg_color   = "#282828",
                            text_color = "#E0E0E0",
                            image    = clear_icon,
                            compound = "left",
                            width    = 85, 
                            height   = 27,
                            corner_radius = 25)
        button.configure(command=lambda: self.clean_all_items())
        button.grid(row = len(self.button_list), column=1, pady=(0, 10), padx = 5)
        self.label_list.append(label)
        self.button_list.append(button)

    def add_item(self, text_to_show, file_element, image = None):
        label = CTkLabel(self, 
                        text  = text_to_show,
                        font  = bold11,
                        image = image, 
                        #fg_color   = "#282828",
                        text_color = "#E0E0E0",
                        compound = "left", 
                        padx     = 10,
                        pady     = 5,
                        corner_radius = 25,
                        anchor   = "center")
                        
        label.grid(row  = len(self.label_list), column = 0, 
                   pady = (3, 3), padx = (3, 3), sticky = "w")
        self.label_list.append(label)
        self.file_list.append(file_element)    

    def clean_all_items(self):
        self.label_list  = []
        self.button_list = []
        self.file_list   = []
        place_up_background()
        place_loadFile_section()

#Utils Functions ----------------------

def is_Windows11():
    if windows_subversion >= 22000: return True

def find_by_relative_path(relative_path):
    base_path = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)

def image_write(path, image_data):
    _, file_extension = os.path.splitext(path)
    r, buff = cv2.imencode(file_extension, image_data)
    buff.tofile(path)

def remove_file(name_file):
    if os.path.exists(name_file): os.remove(name_file)

def check_supported_selected_files(uploaded_file_list):
    supported_files_list = []

    for file in uploaded_file_list:
        for supported_extension in supported_file_extensions:
            if supported_extension in file:
                supported_files_list.append(file)

    return supported_files_list

def extract_video_info(video_file):
    cap          = cv2.VideoCapture(video_file)
    width        = round(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height       = round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    num_frames   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_rate   = cap.get(cv2.CAP_PROP_FPS)
    duration     = num_frames/frame_rate
    minutes      = int(duration/60)
    seconds      = duration % 60
    video_name   = str(video_file.split("/")[-1])
    
    while(cap.isOpened()):
        ret, frame = cap.read()
        if ret == False: break
        image_write("temp.jpg", frame)
        break
    cap.release()

    video_label = ( "VIDEO" + " | " + video_name + " | " + str(width) + "x" 
                   + str(height) + " | " + str(minutes) + 'm:' 
                   + str(round(seconds)) + "s | " + str(num_frames) 
                   + "frames | " + str(round(frame_rate)) + "fps" )

    ctkimage = CTkImage(Image.open("temp.jpg"), size = (600, 300))
    
    return video_label, ctkimage

# UI Actions --------------------------

def button_function():
    print("button pressed")

def opengithub(): webbrowser.open(githubme, new=1)

def open_file():
    print("open file")

def save_file():
    print("save file")

def save_annotations_action():
    """Save all in-memory bounding box annotations to a COCO JSON file."""
    if len(annotation_store.annotations) == 0:
        info_message.set("No annotations to save")
        return

    filepath = filedialog.asksaveasfilename(
        defaultextension=".json",
        filetypes=[("COCO JSON", "*.json")],
        title="Save Annotations (COCO format)",
    )
    if filepath:
        annotation_store.save_to_file(filepath)
        info_message.set("Annotations saved to " + os.path.basename(filepath))
        print("> Saved " + str(len(annotation_store.annotations)) + " annotations to " + filepath)

def exit_app():
    exit()

def help():
    print("help!")

def open_files_action():
    info_message.set("Selecting files...")

    uploaded_files_list = list(filedialog.askopenfilenames())
    uploaded_files_counter = len(uploaded_files_list)

    supported_files_list = check_supported_selected_files(uploaded_files_list)
    supported_files_counter = len(supported_files_list)
    
    print("> Uploaded files: " + str(uploaded_files_counter) + " => Supported files: " + str(supported_files_counter))

    if supported_files_counter > 0:
        place_up_background()

        global scrollable_frame_file_list
        scrollable_frame_file_list = ScrollableImagesTextFrame(master = window, 
                                                               fg_color = transparent_color, 
                                                               bg_color = transparent_color)
        scrollable_frame_file_list.place(relx = 0.5, 
                                         rely = 0.25, 
                                         relwidth = 1.0, 
                                         relheight = 0.475, 
                                         anchor = tkinter.CENTER)
        
        #scrollable_frame_file_list.add_clean_button()

        for index in range(supported_files_counter):
            actual_file = supported_files_list[index]
            video_label, ctkimage = extract_video_info(actual_file)
            scrollable_frame_file_list.add_item(text_to_show = video_label, 
                                                image = ctkimage,
                                                file_element = actual_file)
            remove_file("temp.jpg")
    
        info_message.set("Ready  |  First video loaded for annotation")

        # Open the first video on the annotation canvas automatically
        show_frame_with_canvas(supported_files_list[0])
        place_save_annotations_button()
        place_bbox_toggle_checkbox()

    else: 
        info_message.set("Not supported files :(")

# Bounding box drawing callbacks ------

def on_bbox_mouse_press(event):
    """Record the starting corner of a new bounding box."""
    global bbox_start_x, bbox_start_y, bbox_rect_id
    bbox_start_x = event.x
    bbox_start_y = event.y
    bbox_rect_id = bbox_canvas.create_rectangle(
        bbox_start_x, bbox_start_y, bbox_start_x, bbox_start_y,
        outline="#00FF00", width=2
    )

def on_bbox_mouse_drag(event):
    """Update the rectangle as the user drags the mouse."""
    if bbox_rect_id is not None:
        bbox_canvas.coords(bbox_rect_id,
                           bbox_start_x, bbox_start_y,
                           event.x, event.y)

def on_bbox_mouse_release(event):
    """Finalize the bounding box and save it to the annotation store."""
    global bbox_rect_id, current_image_id
    if bbox_rect_id is None:
        return

    x1 = min(bbox_start_x, event.x)
    y1 = min(bbox_start_y, event.y)
    x2 = max(bbox_start_x, event.x)
    y2 = max(bbox_start_y, event.y)
    w  = x2 - x1
    h  = y2 - y1

    if w > 2 and h > 2 and current_image_id is not None:
        # Convert canvas coordinates back to original image dimensions
        inv_scale = 1.0 / bbox_scale
        orig_x = round(x1 * inv_scale)
        orig_y = round(y1 * inv_scale)
        orig_w = round(w * inv_scale)
        orig_h = round(h * inv_scale)
        annotation_store.add_annotation(current_image_id, [orig_x, orig_y, orig_w, orig_h])
        bbox_drawn_rect_ids.append(bbox_rect_id)
        count = len(annotation_store.get_annotations_for_image(current_image_id))
        info_message.set("Bounding box saved  |  Total: " + str(count))
        print("> Added bbox [" + str(orig_x) + ", " + str(orig_y) + ", " + str(orig_w) + ", " + str(orig_h) + "]")
    else:
        # Too small – remove the drawn rectangle
        bbox_canvas.delete(bbox_rect_id)

    bbox_rect_id = None

def toggle_bboxes():
    """Show or hide all drawn bounding box rectangles on the canvas."""
    if bbox_canvas is None:
        return
    state = "normal" if show_bboxes_var.get() else "hidden"
    for rect_id in bbox_drawn_rect_ids:
        bbox_canvas.itemconfigure(rect_id, state=state)

def draw_bboxes_from_store():
    """Draw all bounding boxes for the current image from the annotation store."""
    global bbox_drawn_rect_ids
    if bbox_canvas is None or current_image_id is None:
        return

    annotations = annotation_store.get_annotations_for_image(current_image_id)
    for ann in annotations:
        x, y, w, h = ann["bbox"]
        # Convert original image coordinates to canvas coordinates
        cx = x * bbox_scale
        cy = y * bbox_scale
        cw = w * bbox_scale
        ch = h * bbox_scale
        rect_id = bbox_canvas.create_rectangle(
            cx, cy, cx + cw, cy + ch,
            outline="#00FF00", width=2
        )
        bbox_drawn_rect_ids.append(rect_id)

def show_save_discard_cancel_popup(on_save, on_discard, on_cancel):
    """Show a popup asking the user to save, discard or cancel.

    Args:
        on_save: Callback invoked when the user clicks Save.
        on_discard: Callback invoked when the user clicks Discard.
        on_cancel: Callback invoked when the user clicks Cancel.
    """
    popup = tkinter.Toplevel(window)
    popup.title("Unsaved Annotations")
    popup.geometry("350x130")
    popup.resizable(False, False)
    popup.grab_set()

    msg = tkinter.Label(popup,
                        text="You have unsaved bounding boxes.\nWhat would you like to do?",
                        padx=15, pady=15)
    msg.pack()

    btn_frame = tkinter.Frame(popup)
    btn_frame.pack(pady=5)

    def _save():
        popup.destroy()
        on_save()

    def _discard():
        popup.destroy()
        on_discard()

    def _cancel():
        popup.destroy()
        on_cancel()

    tkinter.Button(btn_frame, text="Save", width=10, command=_save).pack(side=tkinter.LEFT, padx=5)
    tkinter.Button(btn_frame, text="Discard", width=10, command=_discard).pack(side=tkinter.LEFT, padx=5)
    tkinter.Button(btn_frame, text="Cancel", width=10, command=_cancel).pack(side=tkinter.LEFT, padx=5)

def _do_load_bbox():
    """Open a file dialog, load COCO annotations, and draw bounding boxes."""
    filepath = filedialog.askopenfilename(
        filetypes=[("COCO JSON", "*.json")],
        title="Load Bounding Boxes (COCO format)",
    )
    if not filepath:
        return

    try:
        annotation_store.load_from_file(filepath)
    except Exception as exc:
        info_message.set("Failed to load: " + str(exc))
        return

    info_message.set("Loaded annotations from " + os.path.basename(filepath))

    # If there are images in the loaded file, show the first one on the canvas
    if annotation_store.images:
        first_image = annotation_store.images[0]
        file_name = first_image["file_name"]

        # Try to find the video/image file in common locations
        base_dir = os.path.dirname(filepath)
        candidate = os.path.join(base_dir, file_name)

        if os.path.exists(candidate):
            show_frame_with_canvas(candidate)
            draw_bboxes_from_store()
            place_save_annotations_button()
            place_bbox_toggle_checkbox()
        elif bbox_canvas is not None and current_image_id is not None:
            # Canvas already showing a frame – just draw boxes for matching image
            draw_bboxes_from_store()
        else:
            info_message.set("Loaded " + str(len(annotation_store.annotations)) + " annotations (no matching video found)")

def load_bbox_action():
    """Load bounding boxes from a COCO JSON file.

    If there are existing annotations the user is asked whether to save, discard
    or cancel before the new file is loaded.
    """
    if len(annotation_store.annotations) > 0:
        show_save_discard_cancel_popup(
            on_save=lambda: (save_annotations_action(), _do_load_bbox()),
            on_discard=lambda: (annotation_store.clear(), _do_load_bbox()),
            on_cancel=lambda: None,
        )
    else:
        _do_load_bbox()

def show_frame_with_canvas(video_file):
    """Display the first frame of a video on a canvas for bounding box annotation."""
    global bbox_canvas, bbox_photo, current_image_id, bbox_drawn_rect_ids

    cap = cv2.VideoCapture(video_file)
    width  = round(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_name = os.path.basename(video_file)

    ret, frame = cap.read()
    cap.release()
    if not ret:
        info_message.set("Could not read video frame")
        return

    # Avoid duplicate image entries for the same file
    existing = [img for img in annotation_store.images if img["file_name"] == video_name]
    if existing:
        current_image_id = existing[0]["id"]
    else:
        current_image_id = annotation_store.add_image(video_name, width, height)

    # Scale frame to fit within canvas area
    canvas_w, canvas_h = 600, 400
    scale = min(canvas_w / width, canvas_h / height, 1.0)
    display_w = int(width * scale)
    display_h = int(height * scale)

    global bbox_scale
    bbox_scale = scale

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_image = Image.fromarray(frame_rgb).resize((display_w, display_h), Image.LANCZOS)
    bbox_photo = ImageTk.PhotoImage(pil_image)

    place_up_background()

    # Reset tracked rectangle IDs since canvas is recreated
    bbox_drawn_rect_ids = []

    bbox_canvas = Canvas(window, width=display_w, height=display_h,
                         bg="#080808", highlightthickness=0)
    bbox_canvas.place(relx=0.5, rely=0.35, anchor=tkinter.CENTER)
    bbox_canvas.create_image(0, 0, anchor=tkinter.NW, image=bbox_photo)

    bbox_canvas.bind("<ButtonPress-1>", on_bbox_mouse_press)
    bbox_canvas.bind("<B1-Motion>", on_bbox_mouse_drag)
    bbox_canvas.bind("<ButtonRelease-1>", on_bbox_mouse_release)

    info_message.set("Draw bounding boxes on the frame  |  " + video_name)

# UI Elements -------------------------

def place_menu():
    menu_bar = Menu(window)
    m1 = Menu(menu_bar, tearoff=0)
    m1.add_command(label="Open File",command=open_files_action)
    m1.add_command(label="Save File",command=save_file)
    m1.add_command(label="Save Annotations",command=save_annotations_action)
    m1.add_command(label="Load BBox",command=load_bbox_action)
    m1.add_separator()
    m1.add_command(label="Exit",command=exit_app)
    menu_bar.add_cascade(label="File",menu=m1)
    
    m2 = Menu(menu_bar, tearoff=0)
    m2.add_command(label="Light theme",command=lambda : set_appearance_mode("Light"))
    m2.add_command(label="Dark theme",command=lambda : set_appearance_mode("Dark"))
    menu_bar.add_cascade(label="Setting",menu=m2)
        
    m3 = Menu(menu_bar, tearoff=0)
    m3.add_command(label="help!",command=help)
    menu_bar.add_cascade(label="Help",menu=m3)
    
    window.config(menu=menu_bar)

def place_up_background():
    up_background = CTkLabel(master  = window, 
                            text    = "",
                            fg_color = transparent_color,
                            font     = bold12,
                            anchor   = "w")
    
    up_background.place(relx = 0.5, 
                        rely = 0.0, 
                        relwidth = 1.0,  
                        relheight = 1.0,  
                        anchor = tkinter.CENTER)

def place_button():

    # Use CTkButton instead of tkinter Button
    button = CTkButton(master=window, text="CTkButton", command=button_function)
    button.place(relx=0.5, rely=0.5, anchor=tkinter.CENTER)

def place_loadFile_section():

    text_drop = """SUPPORTED FILES

VIDEO - mp4 webm mkv flv gif avi mov mpg qt 3gp"""

    input_file_text = CTkLabel(master    = window, 
                                text     = text_drop,
                                fg_color = transparent_color,
                                bg_color = transparent_color,
                                width   = 300,
                                height  = 150,
                                font    = bold12,
                                anchor  = "center")
    
    input_file_button = CTkButton(master = window, 
                                width    = 140,
                                height   = 30,
                                text     = "SELECT FILES", 
                                font     = bold11,
                                border_spacing = 0,
                                command        = open_files_action)

    input_file_text.place(relx = 0.5, rely = 0.22,  anchor = tkinter.CENTER)
    input_file_button.place(relx = 0.5, rely = 0.4, anchor = tkinter.CENTER)

def place_app_name():
    app_name_label = CTkLabel(master     = window, 
                              text       = app_name + " " + version + " by " + company_name,
                              text_color = "#A080F0",
                              font       = bold19,
                              anchor     = "w")
    
    app_name_label.place(relx = 0.82, rely = 0.975, anchor = tkinter.CENTER)

def place_github_button():
    git_button = CTkButton(master      = window, 
                            width      = 30,
                            height     = 30,
                            fg_color   = "black",
                            text       = "", 
                            font       = bold11,
                            image      = logo_git,
                            command    = opengithub)
    git_button.place(relx = 0.045, rely = 0.61, anchor = tkinter.CENTER)

def place_save_annotations_button():
    save_btn = CTkButton(master  = window,
                         width   = 180,
                         height  = 30,
                         text    = "SAVE ANNOTATIONS",
                         font    = bold11,
                         fg_color   = "#28a745",
                         text_color = "#FFFFFF",
                         border_spacing = 0,
                         corner_radius  = 25,
                         command = save_annotations_action)
    save_btn.place(relx = 0.5, rely = 0.6, anchor = tkinter.CENTER)

def place_load_bbox_button():
    load_btn = CTkButton(master  = window,
                         width   = 140,
                         height  = 30,
                         text    = "LOAD BBOX",
                         font    = bold11,
                         fg_color   = "#007bff",
                         text_color = "#FFFFFF",
                         border_spacing = 0,
                         corner_radius  = 25,
                         command = load_bbox_action)
    load_btn.place(relx = 0.15, rely = 0.6, anchor = tkinter.CENTER)

def place_bbox_toggle_checkbox():
    bbox_toggle = CTkCheckBox(master   = window,
                              text     = "Show Bounding Boxes",
                              font     = bold11,
                              variable = show_bboxes_var,
                              command  = toggle_bboxes)
    bbox_toggle.place(relx = 0.5, rely = 0.65, anchor = tkinter.CENTER)

def place_message_label():
    message_label = CTkLabel(master  = window, 
                            textvariable = info_message,
                            height       = 25,
                            font         = bold10,
                            fg_color     = "#ffbf00",
                            text_color   = "#000000",
                            anchor       = "center",
                            corner_radius = 25)
    message_label.place(relx = 0.8, rely = 0.56, anchor = tkinter.CENTER)

def apply_windows_transparency_effect(window_root):
    window_root.wm_attributes("-transparent", transparent_color)
    hwnd = ctypes.windll.user32.GetParent(window_root.winfo_id())
    ApplyMica(hwnd, MICAMODE.DARK )


class App():
    def __init__(self, window):
        window.title('')
        width        = 650
        height       = 600
        window.geometry("650x600")
        window.minsize(width, height)

        place_menu()
        place_up_background()
        place_loadFile_section()
        #place_button()
        place_app_name()
        place_github_button()
        place_load_bbox_button()
        place_message_label()

        if is_Windows11(): apply_windows_transparency_effect(window)


if __name__ == "__main__":

    set_appearance_mode("Dark")
    set_default_color_theme("dark-blue")

    window = CTk() 

    info_message = StringVar()
    info_message.set("Hi :)")

    show_bboxes_var = BooleanVar(value=True)

    bold8  = CTkFont(family = "Segoe UI", size = 8, weight = "bold")
    bold9  = CTkFont(family = "Segoe UI", size = 9, weight = "bold")
    bold10 = CTkFont(family = "Segoe UI", size = 10, weight = "bold")
    bold11 = CTkFont(family = "Segoe UI", size = 11, weight = "bold")
    bold12 = CTkFont(family = "Segoe UI", size = 12, weight = "bold")
    bold18 = CTkFont(family = "Segoe UI", size = 19, weight = "bold")
    bold19 = CTkFont(family = "Segoe UI", size = 19, weight = "bold")
    bold20 = CTkFont(family = "Segoe UI", size = 20, weight = "bold")
    bold21 = CTkFont(family = "Segoe UI", size = 21, weight = "bold")

    global logo_git
    logo_git   = CTkImage(Image.open(find_by_relative_path("Assets" + os.sep + "github_logo.png")), size=(15, 15))

    app = App(window)
    window.update()
    window.mainloop()