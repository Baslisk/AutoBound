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

  let img = new Image();
  let scale = 1;
  let bboxes = []; // {id, x, y, w, h} in original coords
  let drawing = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;

  /* ---------- helpers ---------- */

  function setStatus(msg) { statusBar.textContent = msg; }
  function updateCount() { bboxCountEl.textContent = bboxes.length + " annotation" + (bboxes.length !== 1 ? "s" : ""); }

  function toCanvas(x) { return x * scale; }
  function toOriginal(x) { return Math.round(x / scale); }

  function headers(extra) {
    return Object.assign({ "X-CSRFToken": CSRF_TOKEN, "Content-Type": "application/json" }, extra || {});
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
      body: JSON.stringify({ image: VIDEO_ID, category: 1, bbox_x: ox, bbox_y: oy, bbox_w: ow, bbox_h: oh }),
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
    if (!confirm("Delete all annotations for this video?")) return;
    Promise.all(bboxes.map(b =>
      fetch("/api/annotations/" + b.id + "/", { method: "DELETE", headers: headers() })
    )).then(() => {
      bboxes = [];
      updateCount();
      setStatus("All annotations cleared");
      draw();
    }).catch(() => setStatus("Error clearing annotations"));
  });

  importInput.addEventListener("change", function () {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      fetch("/api/import/", {
        method: "POST",
        headers: headers(),
        body: reader.result,
      })
        .then(r => r.json())
        .then(data => {
          setStatus("Imported " + data.imported + " annotations — reloading…");
          setTimeout(() => location.reload(), 500);
        })
        .catch(() => setStatus("Import failed"));
    };
    reader.readAsText(file);
    importInput.value = "";
  });

  /* ---------- init ---------- */

  function init() {
    img.onload = function () {
      const area = canvas.parentElement;
      const maxW = area.clientWidth - 2;
      const maxH = area.clientHeight - 2;
      scale = Math.min(maxW / IMG_WIDTH, maxH / IMG_HEIGHT, 1);
      canvas.width = Math.round(IMG_WIDTH * scale);
      canvas.height = Math.round(IMG_HEIGHT * scale);

      // Load initial annotations
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
