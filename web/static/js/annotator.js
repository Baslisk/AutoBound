/* AutoBound Web — Canvas Annotator */

(function () {
  "use strict";

  const PALETTE = [
    "#ef4444", "#f97316", "#facc15", "#22c55e",
    "#00e5ff", "#3b82f6", "#a855f7", "#ec4899",
    "#94a3b8", "#ffffff", "#f59e0b", "#10b981"
  ];

  const canvas = document.getElementById("annotationCanvas");
  const ctx = canvas.getContext("2d");
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
  const colorPalette = document.getElementById("colorPalette");
  const newCatColorOther = document.getElementById("newCatColorOther");
  const newCatSaveBtn = document.getElementById("newCatSaveBtn");
  const newCatCancelBtn = document.getElementById("newCatCancelBtn");
  const panelTabs = document.querySelectorAll(".panel-tab");
  const annotationsTab = document.getElementById("annotationsTab");
  const categoriesTab = document.getElementById("categoriesTab");

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
      for (const b of bboxes) {
        const cx = toCanvas(b.x);
        const cy = toCanvas(b.y);
        const cw = toCanvas(b.w);
        const ch = toCanvas(b.h);
        var color = getCategoryColor(b.category_id);

        if (highlightId !== null && b.id === highlightId) {
          ctx.strokeStyle = "#FFD700";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FFD700";
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        var label = getCategoryName(b.category_id);
        if (highlightId !== null && b.id === highlightId) {
          label = getCategoryName(b.category_id) + " #" + b.id;
        }
        ctx.font = "bold 12px Segoe UI";
        var textW = ctx.measureText(label).width;
        var textColor = (highlightId !== null && b.id === highlightId) ? "#FFD700" : color;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(cx, cy - 16, textW + 6, 16);
        ctx.fillStyle = textColor;
        ctx.fillText(label, cx + 3, cy - 4);
      }
    }

    if (drawing) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
      ctx.setLineDash([]);
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
          bboxes.push({ id: a.id, x: a.bbox_x, y: a.bbox_y, w: a.bbox_w, h: a.bbox_h, category_id: a.category || 1 });
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
    // Lightweight frame apply during playback (skip annotation loading)
    img = image;
    currentFrame = frameNum;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    updateFrameUI();
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

            // Highlight on canvas
            highlightId = annId;
            if (fn !== currentFrame) {
              goToFrame(fn);
            } else {
              draw();
            }
            renderAnnotationPanel();
            // Clear canvas highlight after a short delay
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

    fetch("/api/annotations/", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        image: VIDEO_ID,
        category: catId,
        bbox_x: pb.ox,
        bbox_y: pb.oy,
        bbox_w: pb.ow,
        bbox_h: pb.oh,
        frame_number: currentFrame,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        bboxes.push({ id: data.id, x: pb.ox, y: pb.oy, w: pb.ow, h: pb.oh, category_id: catId });
        updateCount();
        setStatus("Bounding box saved");
        draw();
        loadAllAnnotations();
      })
      .catch(function () { setStatus("Error saving bbox"); });
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

  function updateColorPaletteSelection(color) {
    if (!colorPalette) return;
    var swatches = colorPalette.querySelectorAll(".color-swatch");
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle("selected", swatches[i].dataset.color === color);
    }
  }

  function initColorPalette() {
    if (!colorPalette) return;
    colorPalette.innerHTML = "";
    for (var pi = 0; pi < PALETTE.length; pi++) {
      (function (color) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "color-swatch";
        btn.dataset.color = color;
        btn.style.background = color;
        btn.title = color;
        btn.addEventListener("click", function () {
          selectedColor = color;
          updateColorPaletteSelection(color);
          if (newCatColorOther) newCatColorOther.style.display = "none";
        });
        colorPalette.appendChild(btn);
      })(PALETTE[pi]);
    }
    var otherBtn = document.createElement("button");
    otherBtn.type = "button";
    otherBtn.className = "color-swatch color-other-btn";
    otherBtn.title = "Custom color\u2026";
    otherBtn.textContent = "\u2026";
    otherBtn.addEventListener("click", function () {
      if (newCatColorOther) {
        newCatColorOther.style.display = "inline-block";
        newCatColorOther.click();
      }
    });
    colorPalette.appendChild(otherBtn);
    if (newCatColorOther) {
      newCatColorOther.addEventListener("input", function () {
        selectedColor = newCatColorOther.value;
        updateColorPaletteSelection(selectedColor);
      });
    }
  }

  initColorPalette();

  function showNewCategoryModal(fromPicker) {
    if (!newCategoryModal) return;
    newCatName.value = "";
    selectedColor = getNextAutoColor();
    updateColorPaletteSelection(selectedColor);
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
    for (var i = 0; i < categories.length; i++) {
      var cat = categories[i];
      var li = document.createElement("li");
      li.className = "cat-list-item";

      var dot = document.createElement("span");
      dot.className = "cat-color-dot";
      dot.style.background = cat.color;

      var nameSpan = document.createElement("span");
      nameSpan.className = "cat-list-name";
      nameSpan.textContent = cat.name;

      li.appendChild(dot);
      li.appendChild(nameSpan);

      if (cat.id !== 1) {
        var delBtn = document.createElement("button");
        delBtn.className = "cat-list-delete";
        delBtn.textContent = "✕";
        delBtn.title = "Delete category";
        (function (catId, catName) {
          delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (!confirm("Delete category '" + catName + "'? Its annotations will be reassigned to 'object'.")) return;
            fetch("/api/categories/" + catId + "/delete/", {
              method: "DELETE",
              headers: headers(),
            })
              .then(function () {
                setStatus("Category '" + catName + "' deleted");
                refreshCategories(function () {
                  loadAnnotationsForFrame(currentFrame);
                  loadAllAnnotations();
                });
              })
              .catch(function () { setStatus("Error deleting category"); });
          });
        })(cat.id, cat.name);
        li.appendChild(delBtn);
      }

      catList.appendChild(li);
    }
  }

  /* --- panel tab switching --- */
  for (var ti = 0; ti < panelTabs.length; ti++) {
    (function (tab) {
      tab.addEventListener("click", function () {
        for (var j = 0; j < panelTabs.length; j++) panelTabs[j].classList.remove("active");
        tab.classList.add("active");
        var target = tab.getAttribute("data-tab");
        if (target === "annotations") {
          annotationsTab.classList.remove("hidden");
          categoriesTab.classList.add("hidden");
        } else {
          annotationsTab.classList.add("hidden");
          categoriesTab.classList.remove("hidden");
        }
      });
    })(panelTabs[ti]);
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
    if (!confirm("Delete all annotations for this frame?")) return;
    Promise.all(bboxes.map(b =>
      fetch("/api/annotations/" + b.id + "/", { method: "DELETE", headers: headers() })
    )).then(() => {
      bboxes = [];
      updateCount();
      setStatus("All annotations cleared for this frame");
      draw();      loadAllAnnotations();    }).catch(() => setStatus("Error clearing annotations"));
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
        bboxes.push({ id: a.id, x: a.bbox[0], y: a.bbox[1], w: a.bbox[2], h: a.bbox[3], category_id: a.category_id || 1 });
      }
      updateCount();
      draw();
      setStatus("Ready — draw bounding boxes on the frame");
      loadAllAnnotations();
      renderCategoryList();
    };
    img.src = FRAME_URL;

    // Render categories immediately (doesn't depend on image)
    renderCategoryList();
  }

  init();
})();
