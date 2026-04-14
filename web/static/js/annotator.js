/* AutoBound Web — Canvas Annotator */

(function () {
  "use strict";

  const PALETTE = [
    "#ef4444", "#f97316", "#facc15", "#22c55e",
    "#00e5ff", "#3b82f6", "#a855f7", "#ec4899",
    "#94a3b8", "#ffffff", "#f59e0b", "#10b981"
  ];

  /* ---------- color conversion utilities ---------- */

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: s, v: v };
  }

  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    var r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function hexToHsv(hex) { var c = hexToRgb(hex); return rgbToHsv(c.r, c.g, c.b); }
  function hsvToHex(h, s, v) { var c = hsvToRgb(h, s, v); return rgbToHex(c.r, c.g, c.b); }

  function isValidHex(str) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str); }
  function cpClamp(val, lo, hi) { return Math.max(lo, Math.min(hi, val)); }

  /* ---------- reusable HSV color picker ---------- */

  function buildColorPicker(container, initialColor, onChange) {
    container.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "cp-container";

    var hsv = hexToHsv(initialColor || "#ef4444");

    // --- SV Area ---
    var svArea = document.createElement("div");
    svArea.className = "cp-sv-area";

    var whiteLayer = document.createElement("div");
    whiteLayer.className = "cp-white";
    var blackLayer = document.createElement("div");
    blackLayer.className = "cp-black";
    var svCursor = document.createElement("div");
    svCursor.className = "cp-sv-cursor";
    svArea.appendChild(whiteLayer);
    svArea.appendChild(blackLayer);
    svArea.appendChild(svCursor);

    // --- Hue Bar ---
    var hueBar = document.createElement("div");
    hueBar.className = "cp-hue-bar";
    var hueThumb = document.createElement("div");
    hueThumb.className = "cp-hue-thumb";
    hueBar.appendChild(hueThumb);

    // --- Controls ---
    var controls = document.createElement("div");
    controls.className = "cp-controls";
    var preview = document.createElement("div");
    preview.className = "cp-preview";
    var hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "cp-hex-input";
    hexInput.maxLength = 7;
    hexInput.spellcheck = false;
    controls.appendChild(preview);
    controls.appendChild(hexInput);

    // --- Swatches ---
    var swatchRow = document.createElement("div");
    swatchRow.className = "cp-swatches";
    for (var pi = 0; pi < PALETTE.length; pi++) {
      (function (color) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cp-swatch";
        btn.style.background = color;
        btn.title = color;
        btn.dataset.color = color;
        btn.addEventListener("click", function () {
          hsv = hexToHsv(color);
          updateUI();
          onChange(hsvToHex(hsv.h, hsv.s, hsv.v));
        });
        swatchRow.appendChild(btn);
      })(PALETTE[pi]);
    }

    wrap.appendChild(svArea);
    wrap.appendChild(hueBar);
    wrap.appendChild(controls);
    wrap.appendChild(swatchRow);
    container.appendChild(wrap);

    // --- Update UI ---
    function updateUI() {
      svCursor.style.left = (hsv.s * 100) + "%";
      svCursor.style.top = ((1 - hsv.v) * 100) + "%";
      svArea.style.background = hsvToHex(hsv.h, 1, 1);
      hueThumb.style.left = ((hsv.h / 360) * 100) + "%";
      hueThumb.style.background = hsvToHex(hsv.h, 1, 1);
      var hex = hsvToHex(hsv.h, hsv.s, hsv.v);
      preview.style.background = hex;
      hexInput.value = hex;
      // highlight matching swatch
      var btns = swatchRow.querySelectorAll(".cp-swatch");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].dataset.color.toLowerCase() === hex.toLowerCase());
      }
    }

    // --- SV drag ---
    function handleSV(e) {
      var rect = svArea.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var cy = e.touches ? e.touches[0].clientY : e.clientY;
      hsv.s = cpClamp((cx - rect.left) / rect.width, 0, 1);
      hsv.v = 1 - cpClamp((cy - rect.top) / rect.height, 0, 1);
      updateUI();
      onChange(hsvToHex(hsv.h, hsv.s, hsv.v));
    }
    function onSVDown(e) {
      e.preventDefault();
      handleSV(e);
      document.addEventListener("mousemove", handleSV);
      document.addEventListener("mouseup", onSVUp);
      document.addEventListener("touchmove", handleSV, { passive: false });
      document.addEventListener("touchend", onSVUp);
    }
    function onSVUp() {
      document.removeEventListener("mousemove", handleSV);
      document.removeEventListener("mouseup", onSVUp);
      document.removeEventListener("touchmove", handleSV);
      document.removeEventListener("touchend", onSVUp);
    }
    svArea.addEventListener("mousedown", onSVDown);
    svArea.addEventListener("touchstart", onSVDown, { passive: false });

    // --- Hue drag ---
    function handleHue(e) {
      var rect = hueBar.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      hsv.h = cpClamp((cx - rect.left) / rect.width, 0, 1) * 360;
      updateUI();
      onChange(hsvToHex(hsv.h, hsv.s, hsv.v));
    }
    function onHueDown(e) {
      e.preventDefault();
      handleHue(e);
      document.addEventListener("mousemove", handleHue);
      document.addEventListener("mouseup", onHueUp);
      document.addEventListener("touchmove", handleHue, { passive: false });
      document.addEventListener("touchend", onHueUp);
    }
    function onHueUp() {
      document.removeEventListener("mousemove", handleHue);
      document.removeEventListener("mouseup", onHueUp);
      document.removeEventListener("touchmove", handleHue);
      document.removeEventListener("touchend", onHueUp);
    }
    hueBar.addEventListener("mousedown", onHueDown);
    hueBar.addEventListener("touchstart", onHueDown, { passive: false });

    // --- Hex input ---
    function commitHex() {
      var val = hexInput.value.trim();
      if (!val.startsWith("#")) val = "#" + val;
      if (isValidHex(val)) {
        hsv = hexToHsv(val);
        updateUI();
        onChange(hsvToHex(hsv.h, hsv.s, hsv.v));
      } else {
        updateUI(); // reset to current
      }
    }
    hexInput.addEventListener("blur", commitHex);
    hexInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); hexInput.blur(); }
    });

    updateUI();

    return {
      setColor: function (hex) { hsv = hexToHsv(hex); updateUI(); },
      getColor: function () { return hsvToHex(hsv.h, hsv.s, hsv.v); },
      destroy: function () { container.innerHTML = ""; }
    };
  }

  const canvas = document.getElementById("annotationCanvas");
  const ctx = canvas.getContext("2d");
  const bboxOverlay = document.getElementById("bboxOverlay");

  /* ---------- Three.js + troika bbox & label renderer ---------- */

  var threeRenderer = null;
  var threeScene = null;
  var threeCamera = null;
  var lineSegments = null;
  var lineGeometry = null;
  var textPool = [];
  var TEXT_POOL_MAX = 256;
  var threeReady = false;

  function hexToRgb01(hex) {
    if (!hex || hex.length < 7) return [0, 1, 0];
    return [
      parseInt(hex.substring(1, 3), 16) / 255,
      parseInt(hex.substring(3, 5), 16) / 255,
      parseInt(hex.substring(5, 7), 16) / 255,
    ];
  }

  function initThreeScene() {
    var THREE = window.THREE;
    if (!THREE || !bboxOverlay) return;

    threeRenderer = new THREE.WebGLRenderer({
      canvas: bboxOverlay,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    threeRenderer.setClearColor(0x000000, 0);

    threeScene = new THREE.Scene();
    // Orthographic camera: x right, y DOWN (canvas coords)
    // left=0, right=w, top=0, bottom=-h maps canvas (x, y) → Three.js (x, -y)
    threeCamera = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);

    lineGeometry = new THREE.BufferGeometry();
    var lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true });
    lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    threeScene.add(lineSegments);

    // Pre-allocate troika text pool
    var TroikaText = window.TroikaText;
    if (TroikaText) {
      for (var i = 0; i < TEXT_POOL_MAX; i++) {
        var t = new TroikaText();
        t.fontSize = 11;
        t.fontWeight = "bold";
        t.font = null; // use troika default (Roboto-like)
        t.anchorX = "left";
        t.anchorY = "bottom";
        t.outlineWidth = "12%";
        t.outlineColor = 0x000000;
        t.outlineOpacity = 0.7;
        t.visible = false;
        t.renderOrder = 1;
        threeScene.add(t);
        textPool.push(t);
      }
    }

    threeReady = true;
  }

  function glSyncSize() {
    if (!threeReady) return;
    var w = canvas.width;
    var h = canvas.height;
    bboxOverlay.width = w;
    bboxOverlay.height = h;
    threeRenderer.setSize(w, h, false);
    threeCamera.right = w;
    threeCamera.bottom = -h;
    threeCamera.updateProjectionMatrix();
  }

  function glDrawBboxes(boxes, highlightBoxId, showLabels) {
    if (!threeReady) return;
    var THREE = window.THREE;
    glSyncSize();

    // --- Update line geometry ---
    var count = (boxes && boxes.length) ? boxes.length : 0;
    if (count === 0) {
      lineGeometry.setDrawRange(0, 0);
      // Hide all text
      for (var ti = 0; ti < textPool.length; ti++) textPool[ti].visible = false;
      threeRenderer.render(threeScene, threeCamera);
      return;
    }

    var positions = new Float32Array(count * 8 * 3);
    var colors = new Float32Array(count * 8 * 3);
    var pi = 0;
    var ci = 0;

    for (var i = 0; i < count; i++) {
      var b = boxes[i];
      var cx = toCanvas(b.x);
      var cy = toCanvas(b.y);
      var cw = toCanvas(b.w);
      var ch = toCanvas(b.h);
      var isHl = (highlightBoxId != null && b.id === highlightBoxId);
      var isGlow = (glowBboxId != null && b.id === glowBboxId);
      var isTrackHl = (highlightTrackId != null && b.track_id === highlightTrackId);
      var dimmed = (highlightTrackId != null && !isTrackHl && !isHl);

      // Determine color: glow > highlight > track > category
      var rgb;
      if (isGlow || isHl) {
        rgb = [1, 0.843, 0]; // gold
      } else if (isTrackHl) {
        rgb = hexToRgb01(getTrackColor(b.track_id));
      } else {
        rgb = hexToRgb01(getCategoryColor(b.category_id));
      }

      // Apply dimming for non-track bboxes when a track is highlighted
      if (dimmed) {
        rgb = [rgb[0] * 0.3, rgb[1] * 0.3, rgb[2] * 0.3];
      }

      // 4 line segments (8 vertices), y negated for Three.js
      var verts = [
        cx, -cy, 0, cx + cw, -cy, 0,
        cx + cw, -cy, 0, cx + cw, -(cy + ch), 0,
        cx + cw, -(cy + ch), 0, cx, -(cy + ch), 0,
        cx, -(cy + ch), 0, cx, -cy, 0,
      ];
      for (var v = 0; v < 24; v++) positions[pi++] = verts[v];
      for (var v = 0; v < 8; v++) {
        colors[ci++] = rgb[0];
        colors[ci++] = rgb[1];
        colors[ci++] = rgb[2];
      }
    }

    lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    lineGeometry.setDrawRange(0, count * 8);

    // --- Update troika text labels ---
    var labelCount = (showLabels && textPool.length > 0) ? Math.min(count, textPool.length) : 0;
    for (var ti = 0; ti < textPool.length; ti++) {
      if (ti < labelCount) {
        var b = boxes[ti];
        var t = textPool[ti];
        var cx = toCanvas(b.x);
        var cy = toCanvas(b.y);
        var isHl = (highlightBoxId != null && b.id === highlightBoxId);
        var isGlow = (glowBboxId != null && b.id === glowBboxId);
        var isTrackHl = (highlightTrackId != null && b.track_id === highlightTrackId);
        var dimmed = (highlightTrackId != null && !isTrackHl && !isHl && !isGlow);

        var label = getCategoryName(b.category_id);
        if (b.track_id) {
          var trackName = getTrackName(b.track_id);
          if (trackName) label = trackName + " · " + label;
        }
        if (isHl) label += " #" + b.id;

        var color;
        if (isGlow || isHl) {
          color = "#FFD700";
        } else if (isTrackHl) {
          color = getTrackColor(b.track_id);
        } else {
          color = getCategoryColor(b.category_id);
        }

        t.text = label;
        t.color = color;
        t.position.set(cx + 2, -(cy - 2), 0);
        t.visible = !dimmed;

        // Glow animation: pulse outlineWidth
        if (isGlow && glowProgress > 0) {
          var pulse = Math.sin(glowProgress * Math.PI);
          t.outlineWidth = (0.12 + 0.18 * pulse).toFixed(3);
          t.outlineColor = 0xFFD700;
        } else {
          t.outlineWidth = "12%";
          t.outlineColor = 0x000000;
        }

        t.sync();
      } else {
        textPool[ti].visible = false;
      }
    }

    threeRenderer.render(threeScene, threeCamera);
  }

  const statusBar = document.getElementById("statusBar");
  const bboxCountEl = document.getElementById("bboxCount");
  const showBboxes = document.getElementById("showBboxes");
  const saveBtn = document.getElementById("saveBtn");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const importInput = document.getElementById("importInput");
  const prevFrameBtn = document.getElementById("prevFrameBtn");
  const nextFrameBtn = document.getElementById("nextFrameBtn");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const frameSlider = document.getElementById("frameSlider");
  const frameIndicator = document.getElementById("frameIndicator");
  const currentTimeEl = document.getElementById("currentTime");
  const remainingTimeEl = document.getElementById("remainingTime");
  const fpsSelect = document.getElementById("fpsSelect");
  const annList = document.getElementById("annList");
  const annPanelCount = document.getElementById("annPanelCount");
  const importModal = document.getElementById("importModal");
  const modalSave = document.getElementById("modalSave");
  const modalDiscard = document.getElementById("modalDiscard");
  const modalCancel = document.getElementById("modalCancel");
  const predictBtn = document.getElementById("predictBtn");
  const trackBtn = document.getElementById("trackBtn");

  /* --- category UI elements --- */
  const catList = document.getElementById("catList");
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  const categoryPickerModal = document.getElementById("categoryPickerModal");
  const categoryPickerList = document.getElementById("categoryPickerList");
  const pickerAddCatBtn = document.getElementById("pickerAddCatBtn");
  const pickerCancelBtn = document.getElementById("pickerCancelBtn");
  const newCategoryModal = document.getElementById("newCategoryModal");
  const newCatName = document.getElementById("newCatName");
  const newCatColorPickerEl = document.getElementById("newCatColorPicker");
  const newCatSaveBtn = document.getElementById("newCatSaveBtn");
  const newCatCancelBtn = document.getElementById("newCatCancelBtn");
  const panelTabs = document.querySelectorAll(".panel-tab");
  const annotationsTab = document.getElementById("annotationsTab");
  const categoriesTab = document.getElementById("categoriesTab");
  const filesTab = document.getElementById("filesTab");
  const filesList = document.getElementById("filesList");
  const filesPanelCount = document.getElementById("filesPanelCount");
  const saveToStorageBtn = document.getElementById("saveToStorageBtn");

  /* --- track UI elements --- */
  const tracksTab = document.getElementById("tracksTab");
  const trackList = document.getElementById("trackList");
  const trackPanelCount = document.getElementById("trackPanelCount");
  const addTrackBtn = document.getElementById("addTrackBtn");
  const trackEmptyState = document.getElementById("trackEmptyState");
  const trackIndicator = document.getElementById("trackIndicator");
  const trackIndicatorDot = document.getElementById("trackIndicatorDot");
  const trackIndicatorName = document.getElementById("trackIndicatorName");
  const trackIndicatorClear = document.getElementById("trackIndicatorClear");
  const trackPickerModal = document.getElementById("trackPickerModal");
  const trackPickerList = document.getElementById("trackPickerList");
  const trackPickerCancelBtn = document.getElementById("trackPickerCancelBtn");
  const pickerRemoveTrackBtn = document.getElementById("pickerRemoveTrackBtn");
  const toastContainer = document.getElementById("toastContainer");

  /* --- confirm delete modal elements --- */
  const confirmDeleteModal = document.getElementById("confirmDeleteModal");
  const confirmDeleteTitle = document.getElementById("confirmDeleteTitle");
  const confirmDeleteMsg = document.getElementById("confirmDeleteMsg");
  const confirmDontAsk = document.getElementById("confirmDontAsk");
  const confirmDeleteYes = document.getElementById("confirmDeleteYes");
  const confirmDeleteNo = document.getElementById("confirmDeleteNo");

  /* --- color edit modal elements --- */
  const colorEditModal = document.getElementById("colorEditModal");
  const colorEditTitle = document.getElementById("colorEditTitle");
  const colorEditPickerEl = document.getElementById("colorEditPickerContainer");
  const colorEditSave = document.getElementById("colorEditSave");
  const colorEditCancel = document.getElementById("colorEditCancel");

  let img = new Image();
  let scale = 1;
  let bboxes = []; // {id, x, y, w, h, category_id} in original coords for current frame
  let drawing = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  let currentFrame = 0;
  let totalFrames = FRAME_COUNT || 0;
  let loadingFrame = false;
  let allAnnotations = [];  // all annotations for this video (panel data)
  let highlightId = null;   // annotation id to flash-highlight on canvas
  let selectedPanelAnnId = null; // annotation selected for prediction

  /* --- categories state --- */
  var categories = (typeof INITIAL_CATEGORIES !== "undefined") ? INITIAL_CATEGORIES.slice() : [];
  var pendingBbox = null; // {ox, oy, ow, oh} waiting for category selection
  var selectedColor = PALETTE[0]; // currently chosen color in New Category modal
  var reassignAnnId = null; // annotation id being reassigned to a new category

  /* --- tracks state --- */
  var tracks = [];
  var activeTrackId = null;
  var highlightTrackId = null;     // track whose bboxes stay highlighted
  var glowAnimationId = null;      // requestAnimationFrame handle for glow
  var glowBboxId = null;           // annotation id currently glowing
  var glowProgress = 0;            // 0..1 glow animation progress
  var expandedTracks = new Set();  // track ids that are expanded in the panel
  var trackAssignAnnId = null;     // annotation id being assigned to a track
  var expandedCategories = new Set(); // category ids expanded in panel

  /* --- confirm delete state --- */
  var skipDeleteConfirm = false;

  /* --- color edit state --- */
  var colorEditTarget = null;      // {type: "category"|"track", id: number}
  var colorEditValue = null;       // hex string

  /* ---------- playback state ---------- */
  var fps = (typeof FPS !== "undefined" && FPS > 0) ? FPS : 30;
  var playing = false;
  var playbackRAF = null;        // requestAnimationFrame handle
  var lastFrameTime = 0;         // timestamp of last frame advance
  var frameDuration = 1000 / fps; // ms between frames

  /* Set the FPS dropdown to the closest matching option */
  (function initFpsSelect() {
    var options = fpsSelect.options;
    var best = 0;
    var bestDiff = Infinity;
    for (var i = 0; i < options.length; i++) {
      var diff = Math.abs(parseFloat(options[i].value) - fps);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    if (bestDiff > 0.5) {
      var rounded = Math.round(fps * 100) / 100;
      var opt = document.createElement("option");
      opt.value = String(rounded);
      opt.textContent = rounded + " fps (native)";
      fpsSelect.insertBefore(opt, options[best]);
      fpsSelect.value = String(rounded);
    } else {
      fpsSelect.value = options[best].value;
    }
  })();

  /* ---------- frame cache (client-side LRU) ---------- */

  var frameCacheMax = 32;
  var frameCacheMap = new Map(); // frame_number -> Image (decoded & ready)
  var frameFetching = new Set(); // frame numbers currently being fetched

  function frameCacheGet(n) {
    if (!frameCacheMap.has(n)) return null;
    var img = frameCacheMap.get(n);
    // Move to end (most-recently-used)
    frameCacheMap.delete(n);
    frameCacheMap.set(n, img);
    return img;
  }

  function frameCacheSet(n, image) {
    if (frameCacheMap.has(n)) frameCacheMap.delete(n);
    frameCacheMap.set(n, image);
    // Evict oldest if over limit
    while (frameCacheMap.size > frameCacheMax) {
      var oldest = frameCacheMap.keys().next().value;
      frameCacheMap.delete(oldest);
    }
  }

  var sliderDebounceTimer = null;

  /* ---------- helpers ---------- */

  function setStatus(msg) { statusBar.textContent = msg; }
  function updateCount() { bboxCountEl.textContent = bboxes.length + " annotation" + (bboxes.length !== 1 ? "s" : ""); }

  function toCanvas(x) { return x * scale; }
  function toOriginal(x) { return Math.round(x / scale); }

  function headers(extra) {
    return Object.assign({ "X-CSRFToken": CSRF_TOKEN, "Content-Type": "application/json" }, extra || {});
  }

  function getCategoryById(id) {
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === id) return categories[i];
    }
    return null;
  }

  function getCategoryColor(catId) {
    var cat = getCategoryById(catId);
    return cat ? cat.color : "#00FF00";
  }

  function getCategoryName(catId) {
    var cat = getCategoryById(catId);
    return cat ? cat.name : "object";
  }

  function getTrackById(id) {
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].id === id) return tracks[i];
    }
    return null;
  }

  function getTrackColor(trackId) {
    var t = getTrackById(trackId);
    return t ? t.color : "#3b82f6";
  }

  function getTrackName(trackId) {
    var t = getTrackById(trackId);
    return t ? t.name : null;
  }

  function getActiveTab() {
    for (var i = 0; i < panelTabs.length; i++) {
      if (panelTabs[i].classList.contains("active")) return panelTabs[i].getAttribute("data-tab");
    }
    return "annotations";
  }

  /* ---------- toast notifications ---------- */

  function showToast(msg, type) {
    if (!toastContainer) return;
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast toast-" + type;
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.classList.add("toast-out");
      setTimeout(function () { el.remove(); }, 300);
    }, 3000);
  }

  /* ---------- confirm delete modal ---------- */

  var _confirmDeleteCb = null;

  function confirmDelete(title, message, onConfirm) {
    if (skipDeleteConfirm) {
      onConfirm();
      return;
    }
    if (!confirmDeleteModal) { onConfirm(); return; }
    confirmDeleteTitle.textContent = title;
    confirmDeleteMsg.textContent = message;
    confirmDontAsk.checked = false;
    _confirmDeleteCb = onConfirm;
    confirmDeleteModal.classList.remove("hidden");
  }

  if (confirmDeleteYes) {
    confirmDeleteYes.addEventListener("click", function () {
      if (confirmDontAsk.checked) skipDeleteConfirm = true;
      confirmDeleteModal.classList.add("hidden");
      if (_confirmDeleteCb) { _confirmDeleteCb(); _confirmDeleteCb = null; }
    });
  }
  if (confirmDeleteNo) {
    confirmDeleteNo.addEventListener("click", function () {
      confirmDeleteModal.classList.add("hidden");
      _confirmDeleteCb = null;
    });
  }

  /* ---------- color edit modal ---------- */

  var colorEditPickerInstance = null;
  function showColorEditModal(currentColor, target) {
    if (!colorEditModal) return;
    colorEditTarget = target;
    colorEditValue = currentColor || PALETTE[0];
    colorEditTitle.textContent = target.type === "track" ? "Edit Track Color" : "Edit Category Color";

    if (colorEditPickerInstance) colorEditPickerInstance.destroy();
    colorEditPickerInstance = buildColorPicker(colorEditPickerEl, colorEditValue, function (hex) {
      colorEditValue = hex;
    });

    colorEditModal.classList.remove("hidden");
  }

  function hideColorEditModal() {
    if (colorEditModal) colorEditModal.classList.add("hidden");
    colorEditTarget = null;
  }

  if (colorEditSave) {
    colorEditSave.addEventListener("click", function () {
      if (!colorEditTarget || !colorEditValue) { hideColorEditModal(); return; }
      var t = colorEditTarget;
      var url = t.type === "track" ? "/api/tracks/" + t.id + "/" : "/api/categories/" + t.id + "/";
      fetch(url, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ color: colorEditValue }),
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          if (t.type === "track") {
            for (var i = 0; i < tracks.length; i++) {
              if (tracks[i].id === t.id) { tracks[i].color = colorEditValue; break; }
            }
            renderTrackList();
            updateTrackIndicator();
          } else {
            for (var i = 0; i < categories.length; i++) {
              if (categories[i].id === t.id) { categories[i].color = colorEditValue; break; }
            }
            renderCategoryList();
          }
          draw();
          renderAnnotationPanel();
          showToast("Color updated", "success");
          hideColorEditModal();
        })
        .catch(function () { setStatus("Error updating color"); hideColorEditModal(); });
    });
  }
  if (colorEditCancel) {
    colorEditCancel.addEventListener("click", hideColorEditModal);
  }

  /* ---------- glow animation ---------- */

  function startGlowAnimation(annId) {
    if (glowAnimationId) cancelAnimationFrame(glowAnimationId);
    glowBboxId = annId;
    glowProgress = 0;
    var startTime = performance.now();
    var duration = 600;

    function tick(now) {
      glowProgress = Math.min((now - startTime) / duration, 1);
      draw();
      if (glowProgress < 1) {
        glowAnimationId = requestAnimationFrame(tick);
      } else {
        glowBboxId = null;
        glowProgress = 0;
        glowAnimationId = null;
        draw();
      }
    }
    glowAnimationId = requestAnimationFrame(tick);
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateFrameUI() {
    var display = totalFrames > 0 ? (currentFrame + 1) + " / " + totalFrames : "0 / 0";
    frameIndicator.textContent = "Frame " + display;
    frameSlider.value = currentFrame;

    prevFrameBtn.disabled = currentFrame <= 0 || playing;
    nextFrameBtn.disabled = totalFrames <= 0 || currentFrame >= totalFrames - 1 || playing;

    // Time display
    var currentSec = currentFrame / fps;
    var totalSec = totalFrames > 0 ? (totalFrames - 1) / fps : 0;
    var remainSec = totalSec - currentSec;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(currentSec);
    if (remainingTimeEl) remainingTimeEl.textContent = "-" + formatTime(remainSec);
  }

  /* ---------- drawing ---------- */

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (showBboxes.checked) {
      // Render bbox outlines + text labels via Three.js / troika overlay
      glDrawBboxes(bboxes, highlightId, true);
    } else {
      // Clear the overlay when bboxes hidden
      glDrawBboxes([], null, false);
    }

    if (drawing) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -(performance.now() / 50) % 10;
      ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      requestAnimationFrame(function () { if (drawing) draw(); });
    }
  }

  /* ---------- frame loading ---------- */

  function loadAnnotationsForFrame(frameNum) {
    fetch("/api/annotations/?image_id=" + VIDEO_ID + "&frame_number=" + frameNum, {
      headers: headers(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        bboxes = [];
        for (var i = 0; i < data.length; i++) {
          var a = data[i];
          bboxes.push({ id: a.id, x: a.bbox_x, y: a.bbox_y, w: a.bbox_w, h: a.bbox_h, category_id: a.category || 1, track_id: a.track_id || null });
        }
        updateCount();
        draw();
        renderAnnotationPanel(); // sync active frame highlight
      })
      .catch(function () { setStatus("Error loading annotations"); });
  }

  function applyFrame(image, frameNum) {
    img = image;
    currentFrame = frameNum;
    loadingFrame = false;

    var area = canvas.parentElement;
    var maxW = area.clientWidth - 2;
    var maxH = area.clientHeight - 2;
    scale = Math.min(maxW / IMG_WIDTH, maxH / IMG_HEIGHT, 1);
    canvas.width = Math.round(IMG_WIDTH * scale);
    canvas.height = Math.round(IMG_HEIGHT * scale);

    updateFrameUI();
    loadAnnotationsForFrame(frameNum);
    setStatus("Frame " + (frameNum + 1) + " of " + totalFrames);
  }

  function fetchFrameImage(frameNum, cb) {
    frameFetching.add(frameNum);
    fetch("/api/frame/" + VIDEO_ID + "/" + frameNum + "/", {
      headers: headers(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        frameFetching.delete(frameNum);
        if (data.frame) {
          var newImg = new Image();
          newImg.onload = function () {
            frameCacheSet(frameNum, newImg);
            if (cb) cb(newImg);
          };
          newImg.src = "data:image/jpeg;base64," + data.frame;

          if (data.total_frames && data.total_frames > 0) {
            totalFrames = data.total_frames;
            frameSlider.max = totalFrames - 1;
          }
        } else {
          if (cb) cb(null);
        }
      })
      .catch(function () { frameFetching.delete(frameNum); if (cb) cb(null); });
  }

  function prefetchFrames(center) {
    for (var d = -3; d <= 3; d++) {
      var n = center + d;
      if (n >= 0 && n < totalFrames && !frameCacheMap.has(n) && !frameFetching.has(n)) {
        fetchFrameImage(n, null);
      }
    }
  }

  function prefetchForPlayback(center) {
    // During playback, prefetch more frames ahead (up to 15)
    for (var d = 1; d <= 15; d++) {
      var n = center + d;
      if (n >= 0 && n < totalFrames && !frameCacheMap.has(n) && !frameFetching.has(n)) {
        fetchFrameImage(n, null);
      }
    }
  }

  /* ---------- playback ---------- */

  function applyFrameQuick(image, frameNum) {
    // Lightweight frame apply during playback — draw bboxes via Three.js (skip text labels)
    img = image;
    currentFrame = frameNum;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (showBboxes.checked && allAnnotations.length > 0) {
      var frameBboxes = getPlaybackBboxes(frameNum);
      glDrawBboxes(frameBboxes, null, false);
    } else {
      glDrawBboxes([], null, false);
    }

    updateFrameUI();
  }

  function getPlaybackBboxes(frameNum) {
    // Return bboxes for a frame during playback:
    // 1) If exact annotations exist for this frame, use them
    // 2) Otherwise, interpolate between nearest keyframes per track_id
    var exact = [];
    var byTrack = {};  // track_id -> sorted [{frame_number, bbox}]

    for (var i = 0; i < allAnnotations.length; i++) {
      var a = allAnnotations[i];
      var fn = a.frame_number || 0;
      if (fn === frameNum) {
        exact.push({ x: a.bbox_x, y: a.bbox_y, w: a.bbox_w, h: a.bbox_h, category_id: a.category || 1, track_id: a.track_id || null });
      }
      // Build track index for interpolation
      var tid = a.track_id;
      if (tid != null) {
        if (!byTrack[tid]) byTrack[tid] = [];
        byTrack[tid].push({ fn: fn, x: a.bbox_x, y: a.bbox_y, w: a.bbox_w, h: a.bbox_h, category_id: a.category || 1, track_id: tid });
      }
    }

    if (exact.length > 0) return exact;

    // Interpolate tracked annotations between keyframes
    var interpolated = [];
    var trackIds = Object.keys(byTrack);
    for (var t = 0; t < trackIds.length; t++) {
      var frames = byTrack[trackIds[t]];
      frames.sort(function (a, b) { return a.fn - b.fn; });

      // Find surrounding keyframes
      var before = null;
      var after = null;
      for (var j = 0; j < frames.length; j++) {
        if (frames[j].fn <= frameNum) before = frames[j];
        if (frames[j].fn >= frameNum && after === null) after = frames[j];
      }

      if (before && after && before.fn !== after.fn) {
        // Linear interpolation
        var ratio = (frameNum - before.fn) / (after.fn - before.fn);
        interpolated.push({
          x: before.x + (after.x - before.x) * ratio,
          y: before.y + (after.y - before.y) * ratio,
          w: before.w + (after.w - before.w) * ratio,
          h: before.h + (after.h - before.h) * ratio,
          category_id: before.category_id,
          track_id: before.track_id || null,
        });
      } else if (before && before.fn === frameNum) {
        interpolated.push({ x: before.x, y: before.y, w: before.w, h: before.h, category_id: before.category_id, track_id: before.track_id || null });
      }
    }

    return interpolated;
  }

  function playbackTick(timestamp) {
    if (!playing) return;

    var elapsed = timestamp - lastFrameTime;
    if (elapsed >= frameDuration) {
      var nextFrame = currentFrame + 1;
      if (nextFrame >= totalFrames) {
        stopPlayback();
        return;
      }

      var cached = frameCacheGet(nextFrame);
      if (cached) {
        applyFrameQuick(cached, nextFrame);
        lastFrameTime = timestamp - (elapsed - frameDuration); // account for overshoot
        // Prefetch ahead while playing
        if (nextFrame % 5 === 0) {
          prefetchForPlayback(nextFrame);
        }
      } else {
        // Frame not cached yet — prefetch and wait (skip this tick)
        prefetchForPlayback(currentFrame);
      }
    }

    playbackRAF = requestAnimationFrame(playbackTick);
  }

  function startPlayback() {
    if (totalFrames <= 1) return;
    if (currentFrame >= totalFrames - 1) {
      // If at end, restart from beginning
      currentFrame = 0;
      var cached = frameCacheGet(0);
      if (cached) applyFrame(cached, 0);
    }
    playing = true;
    lastFrameTime = performance.now();
    playPauseBtn.textContent = "⏸ Pause";
    playPauseBtn.classList.add("playing");
    frameSlider.disabled = true;
    prefetchForPlayback(currentFrame);
    playbackRAF = requestAnimationFrame(playbackTick);
  }

  function stopPlayback() {
    playing = false;
    if (playbackRAF) {
      cancelAnimationFrame(playbackRAF);
      playbackRAF = null;
    }
    playPauseBtn.textContent = "▶ Play";
    playPauseBtn.classList.remove("playing");
    frameSlider.disabled = false;
    // Reload annotations for current frame after stopping
    loadAnnotationsForFrame(currentFrame);
    updateFrameUI();
  }

  function togglePlayback() {
    if (playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function goToFrame(frameNum) {
    if (playing) stopPlayback();
    if (loadingFrame) return;
    if (frameNum < 0 || frameNum >= totalFrames) return;
    if (frameNum === currentFrame && img.complete && img.src) {
      return;
    }

    // Check client-side cache first
    var cached = frameCacheGet(frameNum);
    if (cached) {
      applyFrame(cached, frameNum);
      prefetchFrames(frameNum);
      return;
    }

    loadingFrame = true;
    setStatus("Loading frame " + (frameNum + 1) + "…");

    fetchFrameImage(frameNum, function (image) {
      if (image) {
        applyFrame(image, frameNum);
        prefetchFrames(frameNum);
      } else {
        loadingFrame = false;
        setStatus("Error loading frame");
      }
    });
  }

  /* ---------- annotations panel ---------- */

  function loadAllAnnotations(cb) {
    fetch("/api/annotations/?image_id=" + VIDEO_ID, { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        allAnnotations = data;
        renderAnnotationPanel();
        if (cb) cb();
      })
      .catch(function () { /* silent */ });
  }

  function renderAnnotationPanel() {
    if (!annList) return;
    var frag = document.createDocumentFragment();

    // Group by frame_number
    var groups = {};
    for (var i = 0; i < allAnnotations.length; i++) {
      var a = allAnnotations[i];
      var fn = a.frame_number || 0;
      if (!groups[fn]) groups[fn] = [];
      groups[fn].push(a);
    }

    var frameNums = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });

    for (var fi = 0; fi < frameNums.length; fi++) {
      var frameNum = frameNums[fi];
      var anns = groups[frameNum];

      var groupEl = document.createElement("li");
      groupEl.className = "ann-frame-group";

      var header = document.createElement("div");
      header.className = "ann-frame-header" + (frameNum === currentFrame ? " active" : "");
      header.textContent = "Frame " + (frameNum + 1) + " (" + anns.length + ")";
      groupEl.appendChild(header);

      for (var ai = 0; ai < anns.length; ai++) {
        var ann = anns[ai];
        var item = document.createElement("div");
        var itemClasses = "ann-item";
        if (frameNum === currentFrame && highlightId === ann.id) itemClasses += " active";
        if (selectedPanelAnnId === ann.id) itemClasses += " selected-for-predict";
        item.className = itemClasses;
        item.setAttribute("data-ann-id", ann.id);
        item.setAttribute("data-frame", frameNum);

        var catId = ann.category || 1;
        var catColor = getCategoryColor(catId);
        var catName = getCategoryName(catId);

        var colorDot = document.createElement("span");
        colorDot.className = "ann-item-color";
        colorDot.style.background = catColor;

        var idSpan = document.createElement("span");
        idSpan.className = "ann-item-id";
        idSpan.textContent = "#" + ann.id;

        var catSpan = document.createElement("span");
        catSpan.className = "ann-item-cat clickable-cat";
        catSpan.textContent = catName;
        catSpan.title = "Click to change category";

        var bboxSpan = document.createElement("span");
        bboxSpan.className = "ann-item-bbox";
        var bbox = [Math.round(ann.bbox_x), Math.round(ann.bbox_y), Math.round(ann.bbox_w), Math.round(ann.bbox_h)];
        bboxSpan.textContent = bbox.join(", ");

        var deleteBtn = document.createElement("button");
        deleteBtn.className = "ann-item-delete";
        deleteBtn.textContent = "✕";
        deleteBtn.title = "Delete annotation";

        item.appendChild(colorDot);
        item.appendChild(idSpan);
        item.appendChild(catSpan);
        if (ann.track_id) {
          var trackBadge = document.createElement("span");
          trackBadge.className = "ann-item-track";
          trackBadge.style.background = getTrackColor(ann.track_id);
          trackBadge.style.color = "#fff";
          trackBadge.textContent = getTrackName(ann.track_id) || "Track";
          trackBadge.title = "Click to change track";
          (function (annId) {
            trackBadge.addEventListener("click", function (e) {
              e.stopPropagation();
              trackAssignAnnId = annId;
              showTrackPicker();
            });
          })(ann.id);
          item.appendChild(trackBadge);
        } else {
          var noTrackBadge = document.createElement("span");
          noTrackBadge.className = "ann-item-track-none";
          noTrackBadge.textContent = "+ track";
          noTrackBadge.title = "Assign to a track";
          (function (annId) {
            noTrackBadge.addEventListener("click", function (e) {
              e.stopPropagation();
              trackAssignAnnId = annId;
              showTrackPicker();
            });
          })(ann.id);
          item.appendChild(noTrackBadge);
        }
        item.appendChild(bboxSpan);
        item.appendChild(deleteBtn);

        (function (annId, fn) {
          deleteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            deleteAnnotation(annId);
          });
          catSpan.addEventListener("click", function (e) {
            e.stopPropagation();
            reassignAnnId = annId;
            showCategoryPicker();
          });
          item.addEventListener("click", function () {
            // Toggle prediction selection
            selectedPanelAnnId = (selectedPanelAnnId === annId) ? null : annId;

            // Highlight on canvas with glow animation
            highlightId = annId;
            startGlowAnimation(annId);
            if (fn !== currentFrame) {
              goToFrame(fn);
            } else {
              draw();
            }
            renderAnnotationPanel();
            // Clear canvas highlight after glow finishes
            setTimeout(function () {
              if (highlightId === annId) {
                highlightId = null;
                draw();
                renderAnnotationPanel();
              }
            }, 1500);
          });
        })(ann.id, frameNum);

        groupEl.appendChild(item);
      }

      frag.appendChild(groupEl);
    }

    annList.innerHTML = "";
    annList.appendChild(frag);

    if (annPanelCount) {
      annPanelCount.textContent = allAnnotations.length;
    }
  }

  function deleteAnnotation(annId) {
    fetch("/api/annotations/" + annId + "/", {
      method: "DELETE",
      headers: headers(),
    })
      .then(function () {
        bboxes = bboxes.filter(function (b) { return b.id !== annId; });
        if (selectedPanelAnnId === annId) selectedPanelAnnId = null;
        if (highlightId === annId) highlightId = null;
        updateCount();
        draw();
        loadAllAnnotations();
        setStatus("Annotation deleted");
      })
      .catch(function () { setStatus("Error deleting annotation"); });
  }

  /* ---------- mouse events ---------- */

  function hitTestBboxes(mx, my) {
    if (!showBboxes.checked) return null;
    ctx.font = "bold 12px Segoe UI";
    for (var i = bboxes.length - 1; i >= 0; i--) {
      var b = bboxes[i];
      var cx = toCanvas(b.x), cy = toCanvas(b.y);
      var cw = toCanvas(b.w), ch = toCanvas(b.h);
      var label = getCategoryName(b.category_id);
      var textW = ctx.measureText(label).width;
      var lx = cx, ly = cy - 16, lw = textW + 6, lh = 16;
      if (mx >= lx && mx <= lx + lw && my >= ly && my <= ly + lh) {
        return { bbox: b, onLabel: true };
      }
      if (mx >= cx && mx <= cx + cw && my >= cy && my <= cy + ch) {
        return { bbox: b, onLabel: false };
      }
    }
    return null;
  }

  canvas.addEventListener("mousedown", function (e) {
    if (playing) return;
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    currentX = startX;
    currentY = startY;
  });

  canvas.addEventListener("mousemove", function (e) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    currentX = e.clientX - rect.left;
    currentY = e.clientY - rect.top;
    draw();
  });

  canvas.addEventListener("mouseup", function (e) {
    if (!drawing) return;
    drawing = false;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    let x1 = Math.min(startX, endX);
    let y1 = Math.min(startY, endY);
    let x2 = Math.max(startX, endX);
    let y2 = Math.max(startY, endY);
    let w = x2 - x1;
    let h = y2 - y1;

    if (w < 3 || h < 3) {
      var hit = hitTestBboxes(startX, startY);
      if (hit) {
        selectedPanelAnnId = hit.bbox.id;
        highlightId = hit.bbox.id;
        draw();
        renderAnnotationPanel();
        scrollToHitInPanel(hit.bbox);
        if (hit.onLabel) {
          reassignAnnId = hit.bbox.id;
          showCategoryPicker();
        }
      } else {
        selectedPanelAnnId = null;
        highlightId = null;
        draw();
        renderAnnotationPanel();
      }
      return;
    }

    const ox = toOriginal(x1);
    const oy = toOriginal(y1);
    const ow = toOriginal(w);
    const oh = toOriginal(h);

    pendingBbox = { ox: ox, oy: oy, ow: ow, oh: oh };

    // If active track is set, use that track's category automatically
    if (activeTrackId) {
      var track = getTrackById(activeTrackId);
      if (track) {
        savePendingBbox(track.category);
        return;
      }
    }
    showCategoryPicker();
  });

  /* ---------- category picker & management ---------- */

  function refreshCategories(cb) {
    fetch("/api/categories/", { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        categories = data;
        renderCategoryList();
        if (cb) cb();
      })
      .catch(function () { /* silent */ });
  }

  function showCategoryPicker() {
    if (!categoryPickerModal) return;
    categoryPickerList.innerHTML = "";
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var li = document.createElement("li");
      li.className = "cat-picker-item";

      var preview = document.createElement("span");
      preview.className = "cat-bbox-preview";
      preview.style.borderColor = cat.color;

      var nameSpan = document.createElement("span");
      nameSpan.textContent = cat.name;

      li.appendChild(preview);
      li.appendChild(nameSpan);

      (function (catId) {
        li.addEventListener("click", function () {
          hideCategoryPicker();
          if (reassignAnnId !== null) {
            reassignCategory(reassignAnnId, catId);
            reassignAnnId = null;
          } else {
            savePendingBbox(catId);
          }
        });
      })(cat.id);

      categoryPickerList.appendChild(li);
    }
    categoryPickerModal.classList.remove("hidden");
  }

  function hideCategoryPicker() {
    if (categoryPickerModal) categoryPickerModal.classList.add("hidden");
  }

  function savePendingBbox(catId) {
    if (!pendingBbox) return;
    var pb = pendingBbox;
    pendingBbox = null;

    var body = {
      image: VIDEO_ID,
      category: catId,
      bbox_x: pb.ox,
      bbox_y: pb.oy,
      bbox_w: pb.ow,
      bbox_h: pb.oh,
      frame_number: currentFrame,
    };
    if (activeTrackId) {
      body.track = activeTrackId;
    }

    fetch("/api/annotations/", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (err) { throw err; });
        return r.json();
      })
      .then(function (data) {
        bboxes.push({ id: data.id, x: pb.ox, y: pb.oy, w: pb.ow, h: pb.oh, category_id: catId, track_id: data.track_id || null });
        updateCount();
        setStatus("Bounding box saved");
        showToast("Annotation saved", "success");
        draw();
        loadAllAnnotations();
        if (activeTrackId) loadTracks(); // refresh annotation count
      })
      .catch(function (err) {
        if (err && err.track_id) {
          setStatus("Duplicate: track already has bbox on this frame");
          showToast("Track already has annotation on this frame", "error");
        } else {
          setStatus("Error saving bbox");
        }
      });
  }

  function reassignCategory(annId, newCatId) {
    fetch("/api/annotations/" + annId + "/", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ category: newCatId }),
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        for (var i = 0; i < bboxes.length; i++) {
          if (bboxes[i].id === annId) { bboxes[i].category_id = newCatId; break; }
        }
        draw();
        loadAllAnnotations();
        setStatus("Category updated");
      })
      .catch(function () { setStatus("Error updating category"); });
  }

  if (pickerCancelBtn) {
    pickerCancelBtn.addEventListener("click", function () {
      pendingBbox = null;
      reassignAnnId = null;
      hideCategoryPicker();
      draw();
    });
  }

  if (pickerAddCatBtn) {
    pickerAddCatBtn.addEventListener("click", function () {
      hideCategoryPicker();
      showNewCategoryModal(true);
    });
  }

  function getNextAutoColor() {
    var usedColors = categories.map(function (c) { return (c.color || "").toLowerCase(); });
    for (var i = 0; i < PALETTE.length; i++) {
      if (usedColors.indexOf(PALETTE[i].toLowerCase()) === -1) return PALETTE[i];
    }
    return PALETTE[0];
  }

  var newCatPickerInstance = null;

  function initColorPalette() {
    if (!newCatColorPickerEl) return;
    if (newCatPickerInstance) newCatPickerInstance.destroy();
    newCatPickerInstance = buildColorPicker(newCatColorPickerEl, selectedColor, function (hex) {
      selectedColor = hex;
    });
  }

  initColorPalette();

  function showNewCategoryModal(fromPicker) {
    if (!newCategoryModal) return;
    newCatName.value = "";
    selectedColor = getNextAutoColor();
    initColorPalette();
    newCategoryModal.classList.remove("hidden");
    newCategoryModal._fromPicker = !!fromPicker;
    newCatName.focus();
  }

  function hideNewCategoryModal() {
    if (newCategoryModal) newCategoryModal.classList.add("hidden");
  }

  function createCategory() {
    var name = newCatName.value.trim();
    if (!name) { setStatus("Category name is required"); return; }
    if (name.length > 50) { setStatus("Category name max 50 characters"); return; }
    var color = selectedColor;

    fetch("/api/categories/", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: name, color: color }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        categories.push(data);
        renderCategoryList();
        hideNewCategoryModal();
        setStatus("Category '" + name + "' created");
        if (newCategoryModal._fromPicker && pendingBbox) {
          showCategoryPicker();
        }
      })
      .catch(function () { setStatus("Error creating category"); });
  }

  if (newCatSaveBtn) {
    newCatSaveBtn.addEventListener("click", createCategory);
  }
  if (newCatCancelBtn) {
    newCatCancelBtn.addEventListener("click", function () {
      hideNewCategoryModal();
      if (newCategoryModal._fromPicker && pendingBbox) {
        showCategoryPicker();
      }
    });
  }
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", function () {
      showNewCategoryModal(false);
    });
  }

  function renderCategoryList() {
    if (!catList) return;
    catList.innerHTML = "";

    // Build map: category_id -> sorted annotations
    var catAnns = {};
    for (var ai = 0; ai < allAnnotations.length; ai++) {
      var a = allAnnotations[ai];
      var cid = a.category || 1;
      if (!catAnns[cid]) catAnns[cid] = [];
      catAnns[cid].push(a);
    }
    var cids = Object.keys(catAnns);
    for (var ci = 0; ci < cids.length; ci++) {
      catAnns[cids[ci]].sort(function (a, b) { return (a.frame_number || 0) - (b.frame_number || 0); });
    }

    for (var i = 0; i < categories.length; i++) {
      (function (cat) {
        var anns = catAnns[cat.id] || [];
        var li = document.createElement("li");
        li.className = "cat-list-item";
        li.setAttribute("data-cat-id", cat.id);

        var toggleBtn = document.createElement("button");
        toggleBtn.className = "cat-ann-toggle" + (expandedCategories.has(cat.id) ? " expanded" : "");
        toggleBtn.textContent = "▶";
        toggleBtn.title = "Expand annotations";

        var dot = document.createElement("span");
        dot.className = "cat-color-dot color-dot-editable";
        dot.style.background = cat.color;
        dot.title = "Click to change color";

        var nameSpan = document.createElement("span");
        nameSpan.className = "cat-list-name";
        nameSpan.textContent = cat.name;

        var editBtn = document.createElement("button");
        editBtn.className = "cat-edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Rename category";

        var badge = document.createElement("span");
        badge.className = "cat-badge";
        badge.textContent = anns.length + " ann";

        // Toggle expand
        toggleBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (expandedCategories.has(cat.id)) {
            expandedCategories.delete(cat.id);
          } else {
            expandedCategories.add(cat.id);
          }
          renderCategoryList();
        });

        // Color edit
        dot.addEventListener("click", function (e) {
          e.stopPropagation();
          showColorEditModal(cat.color, { type: "category", id: cat.id });
        });

        // Rename inline
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          nameSpan.style.display = "none";
          var input = document.createElement("input");
          input.type = "text";
          input.className = "cat-name-input";
          input.value = cat.name;
          input.maxLength = 50;
          li.insertBefore(input, nameSpan.nextSibling);
          input.focus();
          input.select();
          function commitRename() {
            var newName = input.value.trim();
            if (newName && newName !== cat.name) {
              fetch("/api/categories/" + cat.id + "/", {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify({ name: newName }),
              })
                .then(function (r) { return r.json(); })
                .then(function () {
                  cat.name = newName;
                  showToast("Renamed to " + newName, "success");
                  renderCategoryList();
                  draw();
                  renderAnnotationPanel();
                })
                .catch(function () { setStatus("Error renaming category"); });
            } else {
              nameSpan.style.display = "";
              input.remove();
            }
          }
          input.addEventListener("blur", commitRename);
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { input.blur(); }
            if (ev.key === "Escape") {
              input.removeEventListener("blur", commitRename);
              nameSpan.style.display = "";
              input.remove();
            }
          });
        });

        li.appendChild(toggleBtn);
        li.appendChild(dot);
        li.appendChild(nameSpan);
        li.appendChild(editBtn);
        li.appendChild(badge);

        if (cat.id !== 1) {
          var delBtn = document.createElement("button");
          delBtn.className = "cat-list-delete";
          delBtn.textContent = "✕";
          delBtn.title = "Delete category";
          delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            confirmDelete("Delete Category", "Delete '" + cat.name + "'? Its annotations will be reassigned to 'object'.", function () {
              fetch("/api/categories/" + cat.id + "/delete/", {
                method: "DELETE",
                headers: headers(),
              })
                .then(function () {
                  setStatus("Category '" + cat.name + "' deleted");
                  expandedCategories.delete(cat.id);
                  refreshCategories(function () {
                    loadAnnotationsForFrame(currentFrame);
                    loadAllAnnotations();
                  });
                })
                .catch(function () { setStatus("Error deleting category"); });
            });
          });
          li.appendChild(delBtn);
        }

        catList.appendChild(li);

        // Expandable annotation sub-list
        var subUl = document.createElement("ul");
        subUl.className = "cat-ann-list" + (expandedCategories.has(cat.id) ? " expanded" : "");
        for (var j = 0; j < anns.length; j++) {
          (function (ann) {
            var subLi = document.createElement("li");
            subLi.className = "cat-ann-item";
            subLi.setAttribute("data-ann-id", ann.id);
            if ((ann.frame_number || 0) === currentFrame && highlightId === ann.id) subLi.className += " active";

            var frameLbl = document.createElement("span");
            frameLbl.className = "cat-ann-frame";
            frameLbl.textContent = "F" + ((ann.frame_number || 0) + 1);

            var bboxLbl = document.createElement("span");
            bboxLbl.className = "cat-ann-bbox";
            bboxLbl.textContent = [Math.round(ann.bbox_x), Math.round(ann.bbox_y), Math.round(ann.bbox_w), Math.round(ann.bbox_h)].join(", ");

            subLi.appendChild(frameLbl);
            subLi.appendChild(bboxLbl);

            subLi.addEventListener("click", function (e) {
              e.stopPropagation();
              selectedPanelAnnId = ann.id;
              highlightId = ann.id;
              startGlowAnimation(ann.id);
              var fn = ann.frame_number || 0;
              if (fn !== currentFrame) {
                goToFrame(fn);
              } else {
                draw();
              }
              renderCategoryList();
              setTimeout(function () {
                if (highlightId === ann.id) {
                  highlightId = null;
                  draw();
                  renderCategoryList();
                }
              }, 1500);
            });

            subUl.appendChild(subLi);
          })(anns[j]);
        }
        catList.appendChild(subUl);
      })(categories[i]);
    }
  }

  /* --- panel tab switching --- */
  for (var ti = 0; ti < panelTabs.length; ti++) {
    (function (tab) {
      tab.addEventListener("click", function () {
        for (var j = 0; j < panelTabs.length; j++) panelTabs[j].classList.remove("active");
        tab.classList.add("active");
        var target = tab.getAttribute("data-tab");
        annotationsTab.classList.add("hidden");
        categoriesTab.classList.add("hidden");
        if (filesTab) filesTab.classList.add("hidden");
        if (tracksTab) tracksTab.classList.add("hidden");
        if (target === "annotations") {
          annotationsTab.classList.remove("hidden");
        } else if (target === "categories") {
          categoriesTab.classList.remove("hidden");
        } else if (target === "tracks" && tracksTab) {
          tracksTab.classList.remove("hidden");
          loadTracks();
        } else if (target === "files" && filesTab) {
          filesTab.classList.remove("hidden");
          loadExportFiles();
        }
      });
    })(panelTabs[ti]);
  }

  /* ---------- bbox click → scroll to panel ---------- */

  function scrollToHitInPanel(bbox) {
    var tab = getActiveTab();
    if (tab === "tracks" && bbox.track_id) {
      // Expand the track and scroll to the annotation inside it
      expandedTracks.add(bbox.track_id);
      renderTrackList();
      // Scroll to the track item first
      var trackEl = trackList.querySelector("[data-track-id='" + bbox.track_id + "']");
      if (trackEl) trackEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Then scroll to the specific annotation
      setTimeout(function () {
        var annEl = trackList.querySelector("[data-ann-id='" + bbox.id + "']");
        if (annEl) {
          annEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          annEl.classList.add("active");
          setTimeout(function () { annEl.classList.remove("active"); }, 1500);
        }
      }, 100);
    } else if (tab === "categories" && bbox.category) {
      expandedCategories.add(bbox.category);
      renderCategoryList();
      var catEl = catList.querySelector("[data-cat-id='" + bbox.category + "']");
      if (catEl) catEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTimeout(function () {
        var annEl = catList.querySelector("[data-ann-id='" + bbox.id + "']");
        if (annEl) {
          annEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          annEl.classList.add("active");
          setTimeout(function () { annEl.classList.remove("active"); }, 1500);
        }
      }, 100);
    } else if (tab === "annotations") {
      // Scroll to the annotation item in ann panel
      var el = annList.querySelector("[data-ann-id='" + bbox.id + "']");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  /* ---------- track picker (assign/edit track on annotation) ---------- */

  function showTrackPicker() {
    if (!trackPickerModal) return;
    trackPickerList.innerHTML = "";
    for (var i = 0; i < tracks.length; i++) {
      (function (tr) {
        var li = document.createElement("li");
        li.className = "track-picker-item";

        var dot = document.createElement("span");
        dot.className = "track-color-dot";
        dot.style.background = tr.color;

        var nameSpan = document.createElement("span");
        nameSpan.textContent = tr.name;

        li.appendChild(dot);
        li.appendChild(nameSpan);

        li.addEventListener("click", function () {
          hideTrackPicker();
          if (trackAssignAnnId !== null) {
            assignTrackToAnnotation(trackAssignAnnId, tr.id);
            trackAssignAnnId = null;
          }
        });

        trackPickerList.appendChild(li);
      })(tracks[i]);
    }
    if (tracks.length === 0) {
      var emptyLi = document.createElement("li");
      emptyLi.style.padding = "1rem";
      emptyLi.style.color = "var(--text-secondary)";
      emptyLi.style.textAlign = "center";
      emptyLi.textContent = "No tracks — create one in the Tracks tab first";
      trackPickerList.appendChild(emptyLi);
    }
    trackPickerModal.classList.remove("hidden");
  }

  function hideTrackPicker() {
    if (trackPickerModal) trackPickerModal.classList.add("hidden");
  }

  function assignTrackToAnnotation(annId, trackId) {
    fetch("/api/annotations/" + annId + "/", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ track: trackId }),
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        for (var i = 0; i < bboxes.length; i++) {
          if (bboxes[i].id === annId) { bboxes[i].track_id = trackId; break; }
        }
        draw();
        loadAllAnnotations(function () { loadTracks(); });
        var tName = getTrackName(trackId);
        showToast("Assigned to " + (tName || "track"), "success");
        setStatus("Track updated");
      })
      .catch(function () { setStatus("Error assigning track"); });
  }

  function removeTrackFromAnnotation(annId) {
    fetch("/api/annotations/" + annId + "/", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ track: null }),
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        for (var i = 0; i < bboxes.length; i++) {
          if (bboxes[i].id === annId) { bboxes[i].track_id = null; break; }
        }
        draw();
        loadAllAnnotations(function () { loadTracks(); });
        showToast("Track removed", "info");
        setStatus("Track removed");
      })
      .catch(function () { setStatus("Error removing track"); });
  }

  if (trackPickerCancelBtn) {
    trackPickerCancelBtn.addEventListener("click", function () {
      trackAssignAnnId = null;
      hideTrackPicker();
    });
  }

  if (pickerRemoveTrackBtn) {
    pickerRemoveTrackBtn.addEventListener("click", function () {
      if (trackAssignAnnId !== null) {
        hideTrackPicker();
        removeTrackFromAnnotation(trackAssignAnnId);
        trackAssignAnnId = null;
      }
    });
  }

  /* ---------- controls ---------- */

  showBboxes.addEventListener("change", draw);

  saveBtn.addEventListener("click", function () {
    setStatus("Annotations are auto-saved to database");
  });

  exportBtn.addEventListener("click", function () {
    fetch("/api/export/" + VIDEO_ID + "/", { headers: headers() })
      .then(r => r.json())
      .then(function (data) {
        var jsonStr = JSON.stringify(data, null, 2);
        var defaultName = "annotations_" + VIDEO_ID + ".json";

        if (typeof window.showSaveFilePicker === "function") {
          window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: "COCO JSON",
              accept: { "application/json": [".json"] },
            }],
          }).then(function (handle) {
            return handle.createWritable().then(function (writable) {
              return writable.write(jsonStr).then(function () {
                return writable.close();
              });
            });
          }).then(function () {
            setStatus("Exported COCO JSON");
          }).catch(function (err) {
            if (err.name !== "AbortError") setStatus("Export failed");
          });
        } else {
          // Fallback for browsers without File System Access API
          var blob = new Blob([jsonStr], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = defaultName;
          a.click();
          URL.revokeObjectURL(a.href);
          setStatus("Exported COCO JSON");
        }
      })
      .catch(function () { setStatus("Export failed"); });
  });

  clearBtn.addEventListener("click", function () {
    confirmDelete("Clear Annotations", "Delete all annotations for this frame?", function () {
      Promise.all(bboxes.map(b =>
        fetch("/api/annotations/" + b.id + "/", { method: "DELETE", headers: headers() })
      )).then(() => {
        bboxes = [];
        updateCount();
        setStatus("All annotations cleared for this frame");
        draw();      loadAllAnnotations();    }).catch(() => setStatus("Error clearing annotations"));
    });
  });

  importInput.addEventListener("change", function () {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      showImportModal(reader.result);
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  /* ---------- import helpers ---------- */

  function clearAllAnnotations() {
    return fetch("/api/annotations/clear/?image_id=" + VIDEO_ID, {
      method: "DELETE",
      headers: headers(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        bboxes = [];
        allAnnotations = [];
        updateCount();
        draw();
        renderAnnotationPanel();
        return data;
      });
  }

  function doImport(fileContent) {
    fetch("/api/import/?video_id=" + VIDEO_ID, {
      method: "POST",
      headers: headers(),
      body: fileContent,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setStatus("Imported " + data.imported + " annotations");
        refreshCategories();
        loadAnnotationsForFrame(currentFrame);
        loadAllAnnotations();
      })
      .catch(function () { setStatus("Import failed"); });
  }

  function exportToFile() {
    return fetch("/api/export/" + VIDEO_ID + "/", { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var jsonStr = JSON.stringify(data, null, 2);
        var defaultName = "annotations_" + VIDEO_ID + ".json";

        if (typeof window.showSaveFilePicker === "function") {
          return window.showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: "COCO JSON",
              accept: { "application/json": [".json"] },
            }],
          }).then(function (handle) {
            return handle.createWritable().then(function (writable) {
              return writable.write(jsonStr).then(function () {
                return writable.close();
              });
            });
          });
        } else {
          var blob = new Blob([jsonStr], { type: "application/json" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = defaultName;
          a.click();
          URL.revokeObjectURL(a.href);
          return Promise.resolve();
        }
      });
  }

  function hideImportModal() {
    if (importModal) importModal.classList.add("hidden");
  }

  function showImportModal(fileContent) {
    if (allAnnotations.length === 0) {
      doImport(fileContent);
      return;
    }

    importModal.classList.remove("hidden");

    modalSave.addEventListener("click", function () {
      exportToFile().then(function () {
        setStatus("Saved — now replacing annotations…");
        return clearAllAnnotations();
      }).then(function () {
        hideImportModal();
        doImport(fileContent);
      }).catch(function (err) {
        if (err.name === "AbortError") return; // user cancelled save picker — stay on modal
        hideImportModal();
        setStatus("Export failed");
      });
    }, { once: true });

    modalDiscard.addEventListener("click", function () {
      clearAllAnnotations().then(function () {
        hideImportModal();
        doImport(fileContent);
      }).catch(function () {
        hideImportModal();
        setStatus("Error clearing annotations");
      });
    }, { once: true });

    modalCancel.addEventListener("click", function () {
      hideImportModal();
    }, { once: true });
  }

  /* ---------- save to storage / export files ---------- */

  function loadExportFiles() {
    fetch("/api/exports/" + VIDEO_ID + "/", { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (files) {
        renderExportFiles(files);
      })
      .catch(function () { setStatus("Failed to load saved files"); });
  }

  function renderExportFiles(files) {
    if (!filesList) return;
    filesList.innerHTML = "";
    if (filesPanelCount) filesPanelCount.textContent = files.length;
    for (var i = 0; i < files.length; i++) {
      (function (f) {
        var li = document.createElement("li");
        li.className = "file-item";

        var nameSpan = document.createElement("span");
        nameSpan.className = "file-item-name";
        nameSpan.textContent = f.file_name;
        nameSpan.title = f.file_name;

        var dateSpan = document.createElement("span");
        dateSpan.className = "file-item-date";
        var d = new Date(f.created_at);
        dateSpan.textContent = d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});

        var actions = document.createElement("span");
        actions.className = "file-item-actions";

        var dlBtn = document.createElement("button");
        dlBtn.className = "file-action-btn";
        dlBtn.textContent = "⬇";
        dlBtn.title = "Download";
        dlBtn.addEventListener("click", function () {
          fetch("/api/exports/" + VIDEO_ID + "/" + f.id + "/download/", { headers: headers() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              var a = document.createElement("a");
              a.href = data.url;
              a.download = data.file_name;
              a.click();
            })
            .catch(function () { setStatus("Download failed"); });
        });

        var delBtn = document.createElement("button");
        delBtn.className = "file-action-btn file-delete-btn";
        delBtn.textContent = "✕";
        delBtn.title = "Delete";
        delBtn.addEventListener("click", function () {
          confirmDelete("Delete File", "Delete " + f.file_name + "?", function () {
            fetch("/api/exports/" + VIDEO_ID + "/" + f.id + "/", {
              method: "DELETE",
              headers: headers(),
            })
              .then(function () {
                loadExportFiles();
                setStatus("Deleted " + f.file_name);
              })
              .catch(function () { setStatus("Delete failed"); });
          });
        });

        actions.appendChild(dlBtn);
        actions.appendChild(delBtn);
        li.appendChild(nameSpan);
        li.appendChild(dateSpan);
        li.appendChild(actions);
        filesList.appendChild(li);
      })(files[i]);
    }
  }

  if (saveToStorageBtn) {
    saveToStorageBtn.addEventListener("click", function () {
      setStatus("Saving to storage…");
      fetch("/api/exports/" + VIDEO_ID + "/", {
        method: "POST",
        headers: headers(),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          setStatus("Saved " + data.file_name + " to storage");
          loadExportFiles();
        })
        .catch(function () { setStatus("Save to storage failed"); });
    });
  }

  /* ---------- predict ---------- */

  if (predictBtn) {
    predictBtn.addEventListener("click", function () {
      if (selectedPanelAnnId === null) {
        setStatus("Select an annotation in the panel first");
        return;
      }

      // Find the selected annotation's category
      var selectedCatId = 1;
      for (var si = 0; si < allAnnotations.length; si++) {
        if (allAnnotations[si].id === selectedPanelAnnId) {
          selectedCatId = allAnnotations[si].category || 1;
          break;
        }
      }

      setStatus("Predicting…");
      predictBtn.disabled = true;

      fetch("/api/predict/", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          video_id: VIDEO_ID,
          frame_number: currentFrame,
          annotation_id: selectedPanelAnnId,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          predictBtn.disabled = false;
          if (!data.success || !data.predicted_bbox) {
            setStatus("Prediction failed — could not track to next frame");
            return;
          }
          var bbox = data.predicted_bbox;
          var nextFrame = data.next_frame;

          // Save the predicted bbox via the existing annotations endpoint
          fetch("/api/annotations/", {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              image: VIDEO_ID,
              category: selectedCatId,
              bbox_x: bbox[0],
              bbox_y: bbox[1],
              bbox_w: bbox[2],
              bbox_h: bbox[3],
              frame_number: nextFrame,
            }),
          })
            .then(function (r) { return r.json(); })
            .then(function (savedAnn) {
              setStatus("Predicted bbox saved on frame " + (nextFrame + 1));
              selectedPanelAnnId = savedAnn.id; // auto-select the new prediction
              goToFrame(nextFrame);
              loadAllAnnotations();
            })
            .catch(function () {
              setStatus("Prediction succeeded but failed to save bbox");
            });
        })
        .catch(function () {
          predictBtn.disabled = false;
          setStatus("Prediction request failed");
        });
    });
  }

  /* ---------- track to end ---------- */

  if (trackBtn) {
    trackBtn.addEventListener("click", function () {
      if (selectedPanelAnnId === null) {
        setStatus("Select an annotation in the panel first");
        return;
      }

      // Find the selected annotation's category
      var trackCatId = 1;
      for (var si = 0; si < allAnnotations.length; si++) {
        if (allAnnotations[si].id === selectedPanelAnnId) {
          trackCatId = allAnnotations[si].category || 1;
          break;
        }
      }

      setStatus("Tracking\u2026");
      trackBtn.disabled = true;
      if (predictBtn) predictBtn.disabled = true;

      fetch("/api/track/", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          video_id: VIDEO_ID,
          start_frame: currentFrame,
          annotation_id: selectedPanelAnnId,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          trackBtn.disabled = false;
          if (predictBtn) predictBtn.disabled = false;

          var results = data.results || [];
          if (results.length === 0) {
            setStatus("Tracked 0 frames \u2014 object not found on next frame");
            return;
          }

          // Save predicted bboxes sequentially to avoid SQLite write contention
          var firstFrame = results[0].frame_number;
          var lastFrame = results[results.length - 1].frame_number;
          var saved = [];

          results.reduce(function (chain, r) {
            return chain.then(function () {
              return fetch("/api/annotations/", {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                  image: VIDEO_ID,
                  category: trackCatId,
                  bbox_x: r.bbox[0],
                  bbox_y: r.bbox[1],
                  bbox_w: r.bbox[2],
                  bbox_h: r.bbox[3],
                  frame_number: r.frame_number,
                }),
              }).then(function (resp) { return resp.json(); })
                .then(function (ann) { saved.push(ann); });
            });
          }, Promise.resolve()).then(function () {
            // Auto-select the last saved annotation for chained tracking
            if (saved.length > 0) {
              selectedPanelAnnId = saved[saved.length - 1].id;
            }
            var frameRange = firstFrame === lastFrame
              ? "frame " + (firstFrame + 1)
              : "frames " + (firstFrame + 1) + "\u2013" + (lastFrame + 1);
            setStatus("Tracked " + results.length + " frame" + (results.length !== 1 ? "s" : "") + " (" + frameRange + ")");
            goToFrame(lastFrame);
            loadAllAnnotations();
          }).catch(function () {
            setStatus("Tracked but failed to save some bboxes");
            loadAllAnnotations();
          });
        })
        .catch(function () {
          trackBtn.disabled = false;
          if (predictBtn) predictBtn.disabled = false;
          setStatus("Track request failed");
        });
    });
  }

  /* ---------- frame navigation ---------- */

  prevFrameBtn.addEventListener("click", function () {
    if (currentFrame > 0) goToFrame(currentFrame - 1);
  });

  nextFrameBtn.addEventListener("click", function () {
    if (currentFrame < totalFrames - 1) goToFrame(currentFrame + 1);
  });

  playPauseBtn.addEventListener("click", function () {
    togglePlayback();
  });

  fpsSelect.addEventListener("change", function () {
    var newFps = parseFloat(fpsSelect.value);
    if (isNaN(newFps) || newFps <= 0) return;
    fps = newFps;
    frameDuration = 1000 / fps;
    if (playing) {
      lastFrameTime = performance.now();
    }
  });

  frameSlider.addEventListener("input", function () {
    if (sliderDebounceTimer) clearTimeout(sliderDebounceTimer);
    sliderDebounceTimer = setTimeout(function () {
      var target = parseInt(frameSlider.value, 10);
      if (!isNaN(target) && target !== currentFrame) {
        goToFrame(target);
      }
    }, 100);
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePlayback();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (currentFrame > 0) goToFrame(currentFrame - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (currentFrame < totalFrames - 1) goToFrame(currentFrame + 1);
    }
  });

  /* ---------- tracks management ---------- */

  function loadTracks(cb) {
    fetch("/api/tracks/?video=" + VIDEO_ID, { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        tracks = data;
        renderTrackList();
        updateTrackIndicator();
        if (cb) cb();
      })
      .catch(function () { /* silent */ });
  }

  function renderTrackList() {
    if (!trackList) return;
    trackList.innerHTML = "";
    if (trackPanelCount) trackPanelCount.textContent = tracks.length;

    // Show/hide empty state
    if (trackEmptyState) {
      trackEmptyState.style.display = tracks.length === 0 ? "flex" : "none";
    }

    // Build a map of track_id -> sorted annotations
    var trackAnns = {};
    for (var ai = 0; ai < allAnnotations.length; ai++) {
      var a = allAnnotations[ai];
      if (a.track_id) {
        if (!trackAnns[a.track_id]) trackAnns[a.track_id] = [];
        trackAnns[a.track_id].push(a);
      }
    }
    // Sort each track's annotations by frame_number
    var tids = Object.keys(trackAnns);
    for (var ti = 0; ti < tids.length; ti++) {
      trackAnns[tids[ti]].sort(function (a, b) { return (a.frame_number || 0) - (b.frame_number || 0); });
    }

    for (var i = 0; i < tracks.length; i++) {
      (function (tr) {
        var li = document.createElement("li");
        li.className = "track-item" + (activeTrackId === tr.id ? " active" : "");
        li.setAttribute("data-track-id", tr.id);

        var toggleBtn = document.createElement("button");
        toggleBtn.className = "track-ann-toggle" + (expandedTracks.has(tr.id) ? " expanded" : "");
        toggleBtn.textContent = "▶";
        toggleBtn.title = "Expand annotations";

        var dot = document.createElement("span");
        dot.className = "track-color-dot color-dot-editable";
        dot.style.background = tr.color;
        dot.title = "Click to change color";
        dot.addEventListener("click", function (e) {
          e.stopPropagation();
          showColorEditModal(tr.color, { type: "track", id: tr.id });
        });

        var nameSpan = document.createElement("span");
        nameSpan.className = "track-item-name";
        nameSpan.textContent = tr.name;

        var editBtn = document.createElement("button");
        editBtn.className = "track-edit-btn";
        editBtn.textContent = "✎";
        editBtn.title = "Rename track";

        var badge = document.createElement("span");
        badge.className = "track-badge";
        badge.textContent = (tr.annotation_count || 0) + " ann";

        var delBtn = document.createElement("button");
        delBtn.className = "track-item-delete";
        delBtn.textContent = "✕";
        delBtn.title = "Delete track";

        // Toggle expand
        toggleBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (expandedTracks.has(tr.id)) {
            expandedTracks.delete(tr.id);
          } else {
            expandedTracks.add(tr.id);
          }
          renderTrackList();
        });

        // Rename inline
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          nameSpan.style.display = "none";
          var input = document.createElement("input");
          input.type = "text";
          input.className = "track-name-input";
          input.value = tr.name;
          input.maxLength = 100;
          li.insertBefore(input, nameSpan.nextSibling);
          input.focus();
          input.select();
          function commitRename() {
            var newName = input.value.trim();
            if (newName && newName !== tr.name) {
              fetch("/api/tracks/" + tr.id + "/", {
                method: "PATCH",
                headers: headers(),
                body: JSON.stringify({ name: newName }),
              })
                .then(function (r) { return r.json(); })
                .then(function () {
                  tr.name = newName;
                  showToast("Renamed to " + newName, "success");
                  renderTrackList();
                  updateTrackIndicator();
                  draw();
                  renderAnnotationPanel();
                })
                .catch(function () { setStatus("Error renaming track"); });
            } else {
              nameSpan.style.display = "";
              input.remove();
            }
          }
          input.addEventListener("blur", commitRename);
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") { input.blur(); }
            if (ev.key === "Escape") {
              input.removeEventListener("blur", commitRename);
              nameSpan.style.display = "";
              input.remove();
            }
          });
        });

        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          confirmDelete("Delete Track", "Delete track '" + tr.name + "'? Annotations will be unlinked.", function () {
            fetch("/api/tracks/" + tr.id + "/", {
              method: "DELETE",
              headers: headers(),
            })
              .then(function () {
                if (activeTrackId === tr.id) {
                  activeTrackId = null;
                  highlightTrackId = null;
                }
                expandedTracks.delete(tr.id);
                showToast("Track deleted", "info");
                loadTracks();
                loadAnnotationsForFrame(currentFrame);
                loadAllAnnotations();
              })
              .catch(function () { setStatus("Error deleting track"); });
          });
        });

        li.addEventListener("click", function () {
          if (activeTrackId === tr.id) {
            // Deselect
            activeTrackId = null;
            highlightTrackId = null;
          } else {
            activeTrackId = tr.id;
            highlightTrackId = tr.id;
          }
          renderTrackList();
          updateTrackIndicator();
          draw();
        });

        li.appendChild(toggleBtn);
        li.appendChild(dot);
        li.appendChild(nameSpan);
        li.appendChild(editBtn);
        li.appendChild(badge);
        li.appendChild(delBtn);
        trackList.appendChild(li);

        // Expandable annotation sub-list
        var subUl = document.createElement("ul");
        subUl.className = "track-ann-list" + (expandedTracks.has(tr.id) ? " expanded" : "");
        var anns = trackAnns[tr.id] || [];
        for (var j = 0; j < anns.length; j++) {
          (function (ann) {
            var subLi = document.createElement("li");
            subLi.className = "track-ann-item";
            subLi.setAttribute("data-ann-id", ann.id);
            if (ann.frame_number === currentFrame && highlightId === ann.id) subLi.className += " active";

            var frameLbl = document.createElement("span");
            frameLbl.className = "track-ann-frame";
            frameLbl.textContent = "F" + ((ann.frame_number || 0) + 1);

            var bboxLbl = document.createElement("span");
            bboxLbl.className = "track-ann-bbox";
            bboxLbl.textContent = [Math.round(ann.bbox_x), Math.round(ann.bbox_y), Math.round(ann.bbox_w), Math.round(ann.bbox_h)].join(", ");

            subLi.appendChild(frameLbl);
            subLi.appendChild(bboxLbl);

            subLi.addEventListener("click", function (e) {
              e.stopPropagation();
              selectedPanelAnnId = ann.id;
              highlightId = ann.id;
              startGlowAnimation(ann.id);
              var fn = ann.frame_number || 0;
              if (fn !== currentFrame) {
                goToFrame(fn);
              } else {
                draw();
              }
              renderTrackList();
              setTimeout(function () {
                if (highlightId === ann.id) {
                  highlightId = null;
                  draw();
                  renderTrackList();
                }
              }, 1500);
            });

            subUl.appendChild(subLi);
          })(anns[j]);
        }
        trackList.appendChild(subUl);
      })(tracks[i]);
    }
  }

  function updateTrackIndicator() {
    if (!trackIndicator) return;
    if (activeTrackId) {
      var tr = getTrackById(activeTrackId);
      if (tr) {
        trackIndicator.classList.remove("hidden");
        trackIndicatorDot.style.background = tr.color;
        trackIndicatorName.textContent = tr.name;
        return;
      }
    }
    trackIndicator.classList.add("hidden");
  }

  if (addTrackBtn) {
    addTrackBtn.addEventListener("click", function () {
      var name = "Track " + (tracks.length + 1);
      var colorIdx = tracks.length % PALETTE.length;
      fetch("/api/tracks/", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          name: name,
          color: PALETTE[colorIdx],
          video: VIDEO_ID,
          category: 1,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          activeTrackId = data.id;
          highlightTrackId = data.id;
          showToast("Created " + data.name, "success");
          loadTracks();
          draw();
        })
        .catch(function () { setStatus("Error creating track"); });
    });
  }

  if (trackIndicatorClear) {
    trackIndicatorClear.addEventListener("click", function () {
      activeTrackId = null;
      highlightTrackId = null;
      renderTrackList();
      updateTrackIndicator();
      draw();
    });
  }

  /* ---------- init ---------- */

  function init() {
    // Set up slider
    if (totalFrames > 0) {
      frameSlider.max = totalFrames - 1;
    }
    updateFrameUI();

    img.onload = function () {
      const area = canvas.parentElement;
      const maxW = area.clientWidth - 2;
      const maxH = area.clientHeight - 2;
      scale = Math.min(maxW / IMG_WIDTH, maxH / IMG_HEIGHT, 1);
      canvas.width = Math.round(IMG_WIDTH * scale);
      canvas.height = Math.round(IMG_HEIGHT * scale);

      // Load initial annotations (frame 0)
      for (const a of INITIAL_ANNOTATIONS) {
        bboxes.push({ id: a.id, x: a.bbox[0], y: a.bbox[1], w: a.bbox[2], h: a.bbox[3], category_id: a.category_id || 1, track_id: a.track_id || null });
      }
      updateCount();
      draw();
      setStatus("Ready — draw bounding boxes on the frame");
      loadAllAnnotations();
      loadTracks();
      renderCategoryList();
    };

    img.onerror = function () {
      // Static frame_image failed — fall back to API frame extraction
      setStatus("Loading first frame…");
      fetchFrameImage(0, function (image) {
        if (image) {
          applyFrame(image, 0);
          // Load initial annotations from server since INITIAL_ANNOTATIONS
          // may have been for frame 0 already but image was missing
          loadAnnotationsForFrame(0);
          loadAllAnnotations();
          loadTracks();
          renderCategoryList();
        } else {
          setStatus("Error: could not load video frame");
        }
      });
    };

    if (FRAME_URL) {
      img.src = FRAME_URL;
    } else {
      // No static frame URL — go directly to API fallback
      img.onerror();
    }

    // Render categories immediately (doesn't depend on image)
    renderCategoryList();

    // Load saved export files
    loadExportFiles();
  }

  function startApp() {
    initThreeScene();
    init();
  }

  if (window.THREE && window.TroikaText) {
    startApp();
  } else {
    window.addEventListener("troika-ready", startApp, { once: true });
  }
})();
