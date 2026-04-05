import os.path
import sys
import platform
import tkinter
from tkinter import Tk, Frame, Menu, StringVar
import webbrowser
import cv2
import ctypes
from ctypes import wintypes
from customtkinter import (CTk, 
                           CTkButton,
                           CTkCheckBox,
                           CTkFrame,
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

# Bounding box tool state
bbox_tool_active  = False
bbox_start_x      = None
bbox_start_y      = None
current_rect_id   = None
bboxes            = []
annotation_canvas = None
canvas_photo      = None
bbox_checkbox     = None
toolbar_bg        = None
bbox_var          = None

MIN_BBOX_SIZE = 2  # minimum pixel width/height for a valid bounding box

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

        first_file = supported_files_list[0]
        cap = cv2.VideoCapture(first_file)
        ret, frame = cap.read()
        cap.release()

        if ret:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(frame_rgb)
            place_annotation_canvas()
            window.update_idletasks()
            show_pil_image_on_canvas(pil_image)
            ensure_toolbar_visible()

        info_message.set("Ready — " + str(supported_files_counter) + " file(s) loaded")

    else: 
        info_message.set("Not supported files :(")

def toggle_bbox_tool():
    global bbox_tool_active
    if bbox_var is not None:
        bbox_tool_active = bool(bbox_var.get())
    else:
        bbox_tool_active = not bbox_tool_active

    if annotation_canvas is not None:
        if bbox_tool_active:
            annotation_canvas.configure(cursor="crosshair")
        else:
            annotation_canvas.configure(cursor="")

def ensure_toolbar_visible():
    if toolbar_bg is not None:
        toolbar_bg.lift()
    if bbox_checkbox is not None:
        bbox_checkbox.lift()

def on_canvas_mouse_press(event):
    global bbox_start_x, bbox_start_y, current_rect_id
    if not bbox_tool_active:
        return
    bbox_start_x    = event.x
    bbox_start_y    = event.y
    current_rect_id = annotation_canvas.create_rectangle(
        bbox_start_x, bbox_start_y, event.x, event.y,
        outline="red", width=2, tags="bbox"
    )

def on_canvas_mouse_drag(event):
    if not bbox_tool_active or bbox_start_x is None or current_rect_id is None:
        return
    annotation_canvas.coords(current_rect_id, bbox_start_x, bbox_start_y, event.x, event.y)

def on_canvas_mouse_release(event):
    global bbox_start_x, bbox_start_y, current_rect_id
    if not bbox_tool_active or bbox_start_x is None:
        return
    x1 = min(bbox_start_x, event.x)
    y1 = min(bbox_start_y, event.y)
    x2 = max(bbox_start_x, event.x)
    y2 = max(bbox_start_y, event.y)
    if x2 - x1 <= MIN_BBOX_SIZE or y2 - y1 <= MIN_BBOX_SIZE:
        if current_rect_id is not None:
            annotation_canvas.delete(current_rect_id)
    else:
        bboxes.append((x1, y1, x2, y2))
    bbox_start_x    = None
    bbox_start_y    = None
    current_rect_id = None

def show_pil_image_on_canvas(pil_image):
    global canvas_photo
    if annotation_canvas is None:
        return
    window.update_idletasks()
    canvas_w = annotation_canvas.winfo_width()
    canvas_h = annotation_canvas.winfo_height()
    if canvas_w <= 1 or canvas_h <= 1:
        canvas_w = int(0.96 * window.winfo_width())
        canvas_h = int(0.83 * window.winfo_height())
    img_w, img_h = pil_image.size
    scale  = min(canvas_w / img_w, canvas_h / img_h)
    new_w  = int(img_w * scale)
    new_h  = int(img_h * scale)
    pil_image    = pil_image.resize((new_w, new_h), Image.LANCZOS)
    canvas_photo = ImageTk.PhotoImage(pil_image)
    annotation_canvas.delete("all")
    x_off = (canvas_w - new_w) // 2
    y_off = (canvas_h - new_h) // 2
    annotation_canvas.create_image(x_off, y_off, anchor="nw", image=canvas_photo)

# UI Elements -------------------------

def place_toolbar():
    global bbox_checkbox, toolbar_bg, bbox_var
    toolbar_bg = CTkLabel(master     = window,
                          text       = "",
                          fg_color   = "#1e1e1e",
                          corner_radius = 0)
    toolbar_bg.place(relx=0.0, rely=0.0, relwidth=1.0, relheight=0.075, anchor=tkinter.NW)

    bbox_var = tkinter.IntVar(value=0)
    bbox_checkbox = CTkCheckBox(master            = window,
                                text              = "Bounding Box",
                                font              = bold11,
                                variable          = bbox_var,
                                command           = toggle_bbox_tool,
                                fg_color          = "#6040D0",
                                hover_color       = "#6F53DB",
                                checkmark_color   = "#FFFFFF",
                                text_color        = "#EAEAEA",
                                corner_radius     = 8)
    bbox_checkbox.place(relx=0.015, rely=0.0375, anchor=tkinter.W)
    ensure_toolbar_visible()

def place_annotation_canvas():
    global annotation_canvas
    if annotation_canvas is not None:
        annotation_canvas.delete("all")
        bboxes.clear()
        return
    annotation_canvas = tkinter.Canvas(window,
                                       bg="#1a1a1a",
                                       highlightthickness=1,
                                       highlightbackground="#3a3a3a")
    annotation_canvas.place(relx=0.02, rely=0.09,
                             relwidth=0.96, relheight=0.83,
                             anchor=tkinter.NW)
    annotation_canvas.bind("<ButtonPress-1>",   on_canvas_mouse_press)
    annotation_canvas.bind("<B1-Motion>",        on_canvas_mouse_drag)
    annotation_canvas.bind("<ButtonRelease-1>", on_canvas_mouse_release)

def place_menu():
    menu_bar = Menu(window)
    m1 = Menu(menu_bar, tearoff=0)
    m1.add_command(label="Open File",command=open_files_action)
    m1.add_command(label="Save File",command=save_file)
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

    input_file_text.place(relx = 0.5, rely = 0.50,  anchor = tkinter.CENTER)
    input_file_button.place(relx = 0.5, rely = 0.65, anchor = tkinter.CENTER)

def place_app_name():
    app_name_label = CTkLabel(master     = window, 
                              text       = app_name + " " + version + " by " + company_name,
                              text_color = "#A080F0",
                              font       = bold19,
                              anchor     = "w")
    
    app_name_label.place(relx = 0.82, rely = 0.965, anchor = tkinter.CENTER)

def place_github_button():
    git_button = CTkButton(master      = window, 
                            width      = 30,
                            height     = 30,
                            fg_color   = "black",
                            text       = "", 
                            font       = bold11,
                            image      = logo_git,
                            command    = opengithub)
    git_button.place(relx = 0.045, rely = 0.965, anchor = tkinter.CENTER)

def place_message_label():
    message_label = CTkLabel(master  = window, 
                            textvariable = info_message,
                            height       = 25,
                            font         = bold10,
                            fg_color     = "#ffbf00",
                            text_color   = "#000000",
                            anchor       = "center",
                            corner_radius = 25)
    message_label.place(relx = 0.5, rely = 0.965, anchor = tkinter.CENTER)

def apply_windows_transparency_effect(window_root):
    window_root.wm_attributes("-transparent", transparent_color)
    hwnd = ctypes.windll.user32.GetParent(window_root.winfo_id())
    ApplyMica(hwnd, MICAMODE.DARK )


class App():
    def __init__(self, window):
        window.title('')
        width        = 900
        height       = 700
        window.geometry("900x700")
        window.minsize(width, height)

        place_menu()
        place_up_background()
        place_toolbar()
        place_loadFile_section()
        place_app_name()
        place_github_button()
        place_message_label()

        if is_Windows11(): apply_windows_transparency_effect(window)


if __name__ == "__main__":

    set_appearance_mode("Dark")
    set_default_color_theme("dark-blue")

    window = CTk() 

    info_message = StringVar()
    info_message.set("Hi :)")

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