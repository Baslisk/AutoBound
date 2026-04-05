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
  const playPauseBtn = document.getElementById("playPauseBtn");
  const frameSlider = document.getElementById("frameSlider");
  const frameIndicator = document.getElementById("frameIndicator");
  const currentTimeEl = document.getElementById("currentTime");
  const remainingTimeEl = document.getElementById("remainingTime");
  const fpsSelect = document.getElementById("fpsSelect");
  const annPanel = document.getElementById("annPanel");
  const annList = document.getElementById("annList");
  const annPanelCount = document.getElementById("annPanelCount");
  const importModal = document.getElementById("importModal");
  const modalSave = document.getElementById("modalSave");
  const modalDiscard = document.getElementById("modalDiscard");
  const modalCancel = document.getElementById("modalCancel");

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
  let allAnnotations = [];  // all annotations for this video (panel data)
  let highlightId = null;   // annotation id to flash-highlight on canvas

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

        if (highlightId !== null && b.id === highlightId) {
          ctx.strokeStyle = "#FFD700";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#FFD700";
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 2;
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
        }
        ctx.strokeRect(cx, cy, cw, ch);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        ctx.font = "bold 12px Segoe UI";
        ctx.fillStyle = (highlightId !== null && b.id === highlightId) ? "#FFD700" : "#00FF00";
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
        item.className = "ann-item" + (frameNum === currentFrame && highlightId === ann.id ? " active" : "");
        item.setAttribute("data-ann-id", ann.id);
        item.setAttribute("data-frame", frameNum);

        var idSpan = document.createElement("span");
        idSpan.className = "ann-item-id";
        idSpan.textContent = "#" + ann.id;

        var bboxSpan = document.createElement("span");
        bboxSpan.className = "ann-item-bbox";
        var bbox = [Math.round(ann.bbox_x), Math.round(ann.bbox_y), Math.round(ann.bbox_w), Math.round(ann.bbox_h)];
        bboxSpan.textContent = bbox.join(", ");

        item.appendChild(idSpan);
        item.appendChild(bboxSpan);

        (function (annId, fn) {
          item.addEventListener("click", function () {
            highlightId = annId;
            if (fn !== currentFrame) {
              goToFrame(fn);
              // After frame loads, draw will pick up the highlightId
            } else {
              draw();
            }
            renderAnnotationPanel();
            // Clear highlight after a short delay
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

  /* ---------- mouse events ---------- */

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
        loadAllAnnotations();
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
        bboxes.push({ id: a.id, x: a.bbox[0], y: a.bbox[1], w: a.bbox[2], h: a.bbox[3] });
      }
      updateCount();
      draw();
      setStatus("Ready — draw bounding boxes on the frame");
      loadAllAnnotations();
    };
    img.src = FRAME_URL;
  }

  init();
})();
