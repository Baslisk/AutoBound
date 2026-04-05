/* AutoBound Web — Canvas Annotator */

(function () {
  "use strict";

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
  const frameSlider = document.getElementById("frameSlider");
  const frameIndicator = document.getElementById("frameIndicator");

  let img = new Image();
  let scale = 1;
  let bboxes = []; // {id, x, y, w, h} in original coords for current frame
  let drawing = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  let currentFrame = 0;
  let totalFrames = FRAME_COUNT || 0;
  let loadingFrame = false;

  /* ---------- frame cache (client-side LRU) ---------- */

  var frameCacheMax = 32;
  var frameCacheMap = new Map(); // frame_number -> Image (decoded & ready)

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

  function updateFrameUI() {
    var display = totalFrames > 0 ? (currentFrame + 1) + " / " + totalFrames : "0 / 0";
    frameIndicator.textContent = "Frame " + display;
    frameSlider.value = currentFrame;

    prevFrameBtn.disabled = currentFrame <= 0;
    nextFrameBtn.disabled = totalFrames <= 0 || currentFrame >= totalFrames - 1;
  }

  /* ---------- drawing ---------- */

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (showBboxes.checked) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 2;
      ctx.font = "bold 12px Segoe UI";
      ctx.fillStyle = "#00FF00";

      for (const b of bboxes) {
        const cx = toCanvas(b.x);
        const cy = toCanvas(b.y);
        const cw = toCanvas(b.w);
        const ch = toCanvas(b.h);
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.fillText(String(b.id), cx + 3, cy + 14);
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
          bboxes.push({ id: a.id, x: a.bbox_x, y: a.bbox_y, w: a.bbox_w, h: a.bbox_h });
        }
        updateCount();
        draw();
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
    fetch("/api/frame/" + VIDEO_ID + "/" + frameNum + "/", {
      headers: headers(),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
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
      .catch(function () { if (cb) cb(null); });
  }

  function prefetchFrames(center) {
    for (var d = -3; d <= 3; d++) {
      var n = center + d;
      if (n >= 0 && n < totalFrames && !frameCacheMap.has(n)) {
        fetchFrameImage(n, null);
      }
    }
  }

  function goToFrame(frameNum) {
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

  /* ---------- mouse events ---------- */

  canvas.addEventListener("mousedown", function (e) {
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

    if (w < 3 || h < 3) { draw(); return; }

    const ox = toOriginal(x1);
    const oy = toOriginal(y1);
    const ow = toOriginal(w);
    const oh = toOriginal(h);

    fetch("/api/annotations/", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ image: VIDEO_ID, category: 1, bbox_x: ox, bbox_y: oy, bbox_w: ow, bbox_h: oh, frame_number: currentFrame }),
    })
      .then(r => r.json())
      .then(data => {
        bboxes.push({ id: data.id, x: ox, y: oy, w: ow, h: oh });
        updateCount();
        setStatus("Bounding box saved");
        draw();
      })
      .catch(() => setStatus("Error saving bbox"));
  });

  /* ---------- controls ---------- */

  showBboxes.addEventListener("change", draw);

  saveBtn.addEventListener("click", function () {
    setStatus("Annotations are auto-saved to database");
  });

  exportBtn.addEventListener("click", function () {
    fetch("/api/export/" + VIDEO_ID + "/", { headers: headers() })
      .then(r => r.json())
      .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "annotations_" + VIDEO_ID + ".json";
        a.click();
        setStatus("Exported COCO JSON");
      })
      .catch(() => setStatus("Export failed"));
  });

  clearBtn.addEventListener("click", function () {
    if (!confirm("Delete all annotations for this frame?")) return;
    Promise.all(bboxes.map(b =>
      fetch("/api/annotations/" + b.id + "/", { method: "DELETE", headers: headers() })
    )).then(() => {
      bboxes = [];
      updateCount();
      setStatus("All annotations cleared for this frame");
      draw();
    }).catch(() => setStatus("Error clearing annotations"));
  });

  importInput.addEventListener("change", function () {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      fetch("/api/import/?video_id=" + VIDEO_ID, {
        method: "POST",
        headers: headers(),
        body: reader.result,
      })
        .then(r => r.json())
        .then(data => {
          setStatus("Imported " + data.imported + " annotations");
          loadAnnotationsForFrame(currentFrame);
        })
        .catch(() => setStatus("Import failed"));
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  /* ---------- frame navigation ---------- */

  prevFrameBtn.addEventListener("click", function () {
    if (currentFrame > 0) goToFrame(currentFrame - 1);
  });

  nextFrameBtn.addEventListener("click", function () {
    if (currentFrame < totalFrames - 1) goToFrame(currentFrame + 1);
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
    if (e.key === "ArrowLeft") {
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
        bboxes.push({ id: a.id, x: a.bbox[0], y: a.bbox[1], w: a.bbox[2], h: a.bbox[3] });
      }
      updateCount();
      draw();
      setStatus("Ready — draw bounding boxes on the frame");
    };
    img.src = FRAME_URL;
  }

  init();
})();
