/**
 * ide.js — IDE-like layout features for the AutoBound web app.
 *
 * Provides resizable panels, menu-bar dropdowns, panel collapse/expand,
 * keyboard shortcuts (non-conflicting with annotator.js), and status-bar
 * updates.  Loaded independently of annotator.js; safe on any page.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  Constants                                                         */
  /* ------------------------------------------------------------------ */
  var STORAGE_PREFIX = "autobound-ide-";
  var MIN_SIDEBAR_WIDTH = 180;   // px – left & right sidebars
  var MIN_MAIN_WIDTH = 200;      // px – central canvas area

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call(
      (root || document).querySelectorAll(sel)
    );
  }

  function saveToStorage(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (_) {
      /* quota exceeded or private mode – silently ignore */
    }
  }

  function loadFromStorage(key) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw === null ? null : JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  1. Resizable Panels                                               */
  /* ------------------------------------------------------------------ */
  function initResizablePanels() {
    var layout = $(".annotate-layout");
    if (!layout) return;

    var sidebar = $(".sidebar", layout);
    var rightPanel = $(".right-panel", layout);
    var handles = $$(".resize-handle", layout);
    if (!handles.length) return;

    // Helper to build the 5-column grid template
    function buildGrid(leftW, rightW) {
      return leftW + "px 4px 1fr 4px " + rightW + "px";
    }

    // Restore persisted widths
    var savedLeft = loadFromStorage("sidebar-width");
    var savedRight = loadFromStorage("right-panel-width");
    var leftW = savedLeft || (sidebar ? sidebar.offsetWidth : 240);
    var rightW = savedRight || (rightPanel ? rightPanel.offsetWidth : 260);
    if (savedLeft || savedRight) {
      if (sidebar) sidebar.style.width = leftW + "px";
      if (rightPanel) rightPanel.style.width = rightW + "px";
      layout.style.gridTemplateColumns = buildGrid(leftW, rightW);
    }

    handles.forEach(function (handle) {
      handle.addEventListener("mousedown", startDrag);
      handle.addEventListener("dblclick", handleDoubleClick);
    });

    /* ---- Drag logic ---- */
    var activeHandle = null;
    var startX = 0;
    var startLeftW = 0;
    var startRightW = 0;

    function startDrag(e) {
      e.preventDefault();
      activeHandle = e.currentTarget;
      activeHandle.classList.add("dragging");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      startX = e.clientX;
      startLeftW = sidebar ? sidebar.offsetWidth : 0;
      startRightW = rightPanel ? rightPanel.offsetWidth : 0;

      document.addEventListener("mousemove", onDrag);
      document.addEventListener("mouseup", stopDrag);
    }

    function onDrag(e) {
      if (!activeHandle) return;
      var dx = e.clientX - startX;
      var isLeftHandle = isHandleForLeft(activeHandle);
      var layoutWidth = layout.offsetWidth;

      if (isLeftHandle && sidebar) {
        var newLeft = clamp(
          startLeftW + dx,
          MIN_SIDEBAR_WIDTH,
          layoutWidth - MIN_MAIN_WIDTH - (rightPanel ? rightPanel.offsetWidth : 0) - 8
        );
        sidebar.style.width = newLeft + "px";
        layout.style.gridTemplateColumns =
          buildGrid(newLeft, rightPanel ? rightPanel.offsetWidth : 0);
      } else if (!isLeftHandle && rightPanel) {
        var newRight = clamp(
          startRightW - dx,
          MIN_SIDEBAR_WIDTH,
          layoutWidth - MIN_MAIN_WIDTH - (sidebar ? sidebar.offsetWidth : 0) - 8
        );
        rightPanel.style.width = newRight + "px";
        layout.style.gridTemplateColumns =
          buildGrid(sidebar ? sidebar.offsetWidth : 0, newRight);
      }
    }

    function stopDrag() {
      if (activeHandle) {
        activeHandle.classList.remove("dragging");
        activeHandle = null;
      }
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onDrag);
      document.removeEventListener("mouseup", stopDrag);

      // Persist current widths
      if (sidebar) saveToStorage("sidebar-width", sidebar.offsetWidth);
      if (rightPanel) saveToStorage("right-panel-width", rightPanel.offsetWidth);
    }

    function isHandleForLeft(handle) {
      // The first resize handle (immediately after .sidebar) controls the
      // left panel; the second one controls the right panel.
      var allHandles = $$(".resize-handle", layout);
      return allHandles.indexOf(handle) === 0;
    }

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }
  }

  /* ------------------------------------------------------------------ */
  /*  2. Menu Bar Dropdowns                                             */
  /* ------------------------------------------------------------------ */
  function initMenuBar() {
    var menuItems = $$(".menu-item");
    if (!menuItems.length) return;

    var openDropdown = null; // currently open .menu-dropdown

    menuItems.forEach(function (item) {
      item.addEventListener("click", function (e) {
        var dropdown = $(".menu-dropdown", item);
        if (!dropdown) return;
        e.stopPropagation();
        if (dropdown === openDropdown) {
          closeAllDropdowns();
        } else {
          closeAllDropdowns();
          dropdown.classList.add("open");
          openDropdown = dropdown;
        }
      });

      // Hover-to-switch: when one menu is already open, hovering another
      // opens it instead.
      item.addEventListener("mouseenter", function () {
        if (!openDropdown) return;
        var dropdown = $(".menu-dropdown", item);
        if (!dropdown || dropdown === openDropdown) return;
        closeAllDropdowns();
        dropdown.classList.add("open");
        openDropdown = dropdown;
      });
    });

    // Click outside closes all dropdowns
    document.addEventListener("click", function () {
      closeAllDropdowns();
    });

    // Wire up menu-dropdown-item actions
    $$(".menu-dropdown-item").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        if (el.classList.contains("disabled")) return;
        var action = el.getAttribute("data-action");
        if (action) executeMenuAction(action);
        closeAllDropdowns();
      });
    });

    function closeAllDropdowns() {
      $$(".menu-dropdown.open").forEach(function (dd) {
        dd.classList.remove("open");
      });
      openDropdown = null;
    }
  }

  /** Map data-action values to DOM interactions. */
  function executeMenuAction(action) {
    switch (action) {
      case "save":
        clickIfExists("#saveBtn");
        break;
      case "save-storage":
        clickIfExists("#saveToStorageBtn");
        break;
      case "export":
        clickIfExists("#exportBtn");
        break;
      case "import":
        clickIfExists("#importInput");
        break;
      case "clear":
        clickIfExists("#clearBtn");
        break;
      case "toggle-bboxes":
        toggleCheckbox("#showBboxes");
        break;
      case "home":
        window.location.href = "/";
        break;
      case "predict":
        clickIfExists("#predictBtn");
        break;
      case "track":
        clickIfExists("#trackBtn");
        break;
      case "toggle-left-panel":
        togglePanel(".sidebar");
        break;
      case "toggle-right-panel":
        togglePanel(".right-panel");
        break;
      default:
        break;
    }
  }

  function clickIfExists(sel) {
    var el = $(sel);
    if (el) el.click();
  }

  function toggleCheckbox(sel) {
    var el = $(sel);
    if (!el) return;
    el.checked = !el.checked;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* ------------------------------------------------------------------ */
  /*  3. Panel Collapse / Expand                                        */
  /* ------------------------------------------------------------------ */
  var collapsedPanels = {}; // key → saved width before collapse

  function handleDoubleClick(e) {
    var handle = e.currentTarget;
    var layout = $(".annotate-layout");
    if (!layout) return;

    var sidebar = $(".sidebar", layout);
    var rightPanel = $(".right-panel", layout);
    var allHandles = $$(".resize-handle", layout);
    var isLeft = allHandles.indexOf(handle) === 0;
    var panel = isLeft ? sidebar : rightPanel;
    var key = isLeft ? "sidebar" : "right-panel";

    if (!panel) return;

    if (collapsedPanels[key]) {
      // Restore
      expandPanel(panel, layout, key, isLeft);
    } else {
      // Collapse
      collapsePanel(panel, layout, key, isLeft);
    }
  }

  function collapsePanel(panel, layout, key, isLeft) {
    collapsedPanels[key] = panel.offsetWidth;
    panel.style.overflow = "hidden";
    panel.style.width = "0px";
    panel.style.minWidth = "0px";
    panel.classList.add("collapsed");

    var sidebar = $(".sidebar", layout);
    var rightPanel = $(".right-panel", layout);
    var leftW = sidebar ? sidebar.offsetWidth : 0;
    var rightW = rightPanel ? rightPanel.offsetWidth : 0;
    layout.style.gridTemplateColumns = leftW + "px 4px 1fr 4px " + rightW + "px";
  }

  function expandPanel(panel, layout, key, isLeft) {
    var savedWidth = collapsedPanels[key] || (isLeft ? 240 : 260);
    delete collapsedPanels[key];
    panel.style.width = savedWidth + "px";
    panel.style.minWidth = "";
    panel.style.overflow = "";
    panel.classList.remove("collapsed");

    var sidebar = $(".sidebar", layout);
    var rightPanel = $(".right-panel", layout);
    var leftW = sidebar ? sidebar.offsetWidth : 0;
    var rightW = rightPanel ? rightPanel.offsetWidth : 0;
    layout.style.gridTemplateColumns = leftW + "px 4px 1fr 4px " + rightW + "px";
  }

  function togglePanel(sel) {
    var layout = $(".annotate-layout");
    if (!layout) return;
    var panel = $(sel, layout);
    if (!panel) return;

    var isLeft = panel.classList.contains("sidebar");
    var key = isLeft ? "sidebar" : "right-panel";

    if (collapsedPanels[key]) {
      expandPanel(panel, layout, key, isLeft);
    } else {
      collapsePanel(panel, layout, key, isLeft);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  4. Keyboard Shortcuts                                             */
  /* ------------------------------------------------------------------ */
  function initKeyboardShortcuts() {
    document.addEventListener("keydown", function (e) {
      // Skip when typing in inputs / textareas
      var tag = (e.target.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      var ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S → save
      if (ctrl && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        clickIfExists("#saveBtn");
        return;
      }

      // Ctrl+Shift+S → save to storage
      if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        clickIfExists("#saveToStorageBtn");
        return;
      }

      // Ctrl+E → export
      if (ctrl && e.key === "e") {
        e.preventDefault();
        clickIfExists("#exportBtn");
        return;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  5. Status Bar Updates                                             */
  /* ------------------------------------------------------------------ */
  function initStatusBarWatcher() {
    var statusBar = $("#statusBar");
    var bboxCountEl = $("#bboxCount");
    if (!statusBar && !bboxCountEl) return;

    // Use a MutationObserver on the annotation list to keep the status
    // bar annotation count in sync (the authoritative data is owned by
    // annotator.js – we just mirror it in the status area if needed).
    var annList = $("#annList");
    if (!annList) return;

    var observer = new MutationObserver(function () {
      updateStatusInfo();
    });
    observer.observe(annList, { childList: true, subtree: true });

    // Also watch the frame indicator for frame count changes
    var frameIndicator = $("#frameIndicator");
    if (frameIndicator) {
      var frameObserver = new MutationObserver(function () {
        updateStatusInfo();
      });
      frameObserver.observe(frameIndicator, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    updateStatusInfo();

    function updateStatusInfo() {
      // Count annotations from the DOM list
      var annItems = $$(".ann-item", annList);
      var annCount = annItems.length;

      // Read frame info from the frame indicator (e.g. "12 / 300")
      var frameText = frameIndicator ? frameIndicator.textContent.trim() : "";
      var frameMatch = frameText.match(/(\d+)\s*\/\s*(\d+)/);
      var currentFrame = frameMatch ? frameMatch[1] : "–";
      var totalFrames = frameMatch ? frameMatch[2] : "–";

      // Update bboxCount element if it exists
      if (bboxCountEl) {
        bboxCountEl.textContent = annCount + " annotation" + (annCount !== 1 ? "s" : "");
      }

      // If there's a dedicated status-info section, update it
      var statusInfo = $(".status-info");
      if (statusInfo) {
        statusInfo.textContent =
          "Frame " + currentFrame + "/" + totalFrames +
          "  |  " + annCount + " annotation" + (annCount !== 1 ? "s" : "");
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Bootstrap                                                         */
  /* ------------------------------------------------------------------ */
  document.addEventListener("DOMContentLoaded", function () {
    initResizablePanels();
    initMenuBar();
    initKeyboardShortcuts();
    initStatusBarWatcher();
    initActivityBar();
  });

  /* ------------------------------------------------------------------ */
  /*  6. Activity Bar                                                    */
  /* ------------------------------------------------------------------ */
  function initActivityBar() {
    var activityIcons = $$(".activity-icon");
    if (!activityIcons.length) return;

    activityIcons.forEach(function (icon) {
      icon.addEventListener("click", function () {
        var panel = icon.getAttribute("data-panel");
        if (!panel) return;

        // Handle sidebar toggle (explorer icon)
        if (panel === "sidebar") {
          togglePanel(".sidebar");
          // Update active state
          activityIcons.forEach(function (i) { i.classList.remove("active"); });
          if (!collapsedPanels["sidebar"]) {
            icon.classList.add("active");
          }
          return;
        }

        // Handle right panel tabs
        var tabMap = {
          "annotations": "annotations",
          "tracks": "tracks",
          "categories": "categories",
          "files": "files"
        };
        var tabName = tabMap[panel];
        if (!tabName) return;

        // If right panel is collapsed, expand it first
        if (collapsedPanels["right-panel"]) {
          togglePanel(".right-panel");
        }

        // Click the corresponding panel tab
        var tab = $(".panel-tab[data-tab='" + tabName + "']");
        if (tab) tab.click();

        // Update active state on non-sidebar icons
        activityIcons.forEach(function (i) {
          if (i.getAttribute("data-panel") !== "sidebar") {
            i.classList.remove("active");
          }
        });
        icon.classList.add("active");
      });
    });
  }
})();
