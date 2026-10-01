/*
 * Glass Feedback — on-demand, isolated in-page camera and annotation tools.
 * Only preferences persist; notes and strokes belong to the current document.
 */
(() => {
  "use strict";
  if (window.__gfxInjected) return;
  window.__gfxInjected = true;

  const MARGIN = 12;
  const HOVER_DELAY = 240;
  const CLOSE_DELAY = 340;
  const MAX_CANVAS = 16384;
  const MAX_PIXELS = 64 * 1024 * 1024;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const paint = () => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons = {
    camera: svg('<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>'),
    annotate: svg('<path d="m4 20 4-1L20 7l-3-3L5 16zM14 7l3 3"/>'),
    selection: svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
    full: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6m-6 5h6m-6 5h6"/>'),
    clipboard: svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H5v16h14V5h-3"/>'),
    download: svg('<path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/>'),
    text: svg('<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>'),
    draw: svg('<path d="M3 18c2-7 4 5 7-4s5 7 8-3M17 4l3-2 2 3-3 2z"/>'),
    erase: svg('<path d="m3 14 9-10 9 8-8 9H9zM9 8l9 8M13 21h8"/>'),
    theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'),
    close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'),
    undo: svg('<path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14"/>'),
  };
  const prefs = {
    scope: "selection", destination: "clipboard", tool: "text",
    light: false, noteOpacity: 0.92, strokeOpacity: 0.85,
  };
  const state = {
    enabled: false, mode: "camera", editing: false, selecting: false,
    capturing: false, sel: null, expanded: false, preview: "camera",
    direction: "left", x: null, y: 120, dragging: false,
  };
  let host, shadow, root, toolbar, primary, alternate, exit, flyout, bubble;
  let annoLayer, drawingLayer, inputLayer, selectionLayer, crop, captureButton, toast;
  let buildPromise, toggleQueue = Promise.resolve();
  let openTimer, submenuTimer, closeTimer, toastTimer;
  let draggingPointer = false;
  const strokes = [];

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }
  function button(label, icon, action, extra = {}) {
    return el("button", {
      type: "button", class: "gfx-btn", title: label, "aria-label": label,
      html: icons[icon], onclick: action, ...extra,
    });
  }
  async function loadPreferences() {
    try {
      const saved = (await chrome.storage.local.get("gfxPreferences")).gfxPreferences;
      if (!saved) return;
      if (["selection", "full"].includes(saved.scope)) prefs.scope = saved.scope;
      if (["clipboard", "download"].includes(saved.destination)) prefs.destination = saved.destination;
      if (["text", "draw", "erase"].includes(saved.tool)) prefs.tool = saved.tool;
      if (typeof saved.light === "boolean") prefs.light = saved.light;
      for (const key of ["noteOpacity", "strokeOpacity"]) {
        if (Number.isFinite(saved[key])) prefs[key] = clamp(saved[key], 0.15, 1);
      }
    } catch (err) {
      console.warn("Glass Feedback: could not read preferences", err);
    }
  }
  function persist() {
    chrome.storage.local.set({ gfxPreferences: { ...prefs } }).catch((err) =>
      showToast("Settings could not be saved: " + err.message));
  }
  async function build() {
    await loadPreferences();
    const response = await fetch(chrome.runtime.getURL("content/content.css"));
    if (!response.ok) throw new Error("Could not load the toolbar stylesheet. Reload the extension and try again.");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    host = el("div", { id: "gfx-host", popover: "manual" });
    shadow = host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [sheet];
    try {
      const response = await fetch(chrome.runtime.getURL("assets/lens-map.png"));
      if (!response.ok) throw new Error("Lens map unavailable");
      const blob = await response.blob();
      const map = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      shadow.append(el("div", { class: "gfx-svg-defs", html:
        `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>
        <filter id="gfx-refract" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
        <feImage href="${map}" preserveAspectRatio="none" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="36" xChannelSelector="R" yChannelSelector="G"/>
        </filter></defs></svg>` }));
    } catch (err) {
      // The base frosted surface remains usable if the decorative map fails.
      console.warn("Glass Feedback: refraction unavailable", err);
    }
    root = el("div", { class: "gfx-root" });
    annoLayer = el("div", { class: "gfx-annotations" });
    drawingLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawingLayer.setAttribute("class", "gfx-drawings");
    annoLayer.append(drawingLayer);
    inputLayer = el("div", { class: "gfx-place-layer", onpointerdown: annotatePointer });
    selectionLayer = buildSelection();
    toolbar = el("div", { class: "gfx-toolbar gfx-glass", role: "toolbar", "aria-label": "Glass Feedback" });
    primary = button("Capture selection to clipboard", "camera", primaryAction, {
      class: "gfx-btn gfx-pill", "aria-expanded": "false",
    });
    alternate = button("Annotate", "annotate", () => {
      chooseMode(state.mode === "camera" ? "annotate" : "camera");
      closeMenus();
    }, { class: "gfx-btn gfx-alternate", hidden: "" });
    bubble = el("span", { class: "gfx-liquid", "aria-hidden": "true" });
    exit = button("Exit annotation mode", "close", () => {
      state.editing = false;
      state.mode = "camera";
      syncMode();
      closeMenus();
    }, { class: "gfx-btn gfx-exit", hidden: "" });
    flyout = el("div", { class: "gfx-options gfx-glass", role: "group", hidden: "" });
    toolbar.append(bubble, primary, alternate, exit);
    toast = el("div", { class: "gfx-toast gfx-glass", role: "status", "aria-live": "polite" });
    root.append(annoLayer, inputLayer, selectionLayer, toolbar, flyout, toast);
    shadow.append(root);
    document.documentElement.append(host);
    primary.addEventListener("pointerenter", enterPrimary);
    alternate.addEventListener("pointerenter", () => previewMode(state.mode === "camera" ? "annotate" : "camera", alternate));
    primary.addEventListener("focus", () => openMenus(state.direction, false));
    alternate.addEventListener("focus", () => previewMode(state.mode === "camera" ? "annotate" : "camera", alternate, true));
    primary.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openMenus(state.direction, true);
        flyout.querySelector("button")?.focus();
      }
    });
    primary.addEventListener("pointerdown", dragToolbar);
    for (const surface of [toolbar, flyout]) {
      surface.addEventListener("pointerenter", cancelClose);
      surface.addEventListener("pointerleave", scheduleClose);
      surface.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!toolbar.contains(shadow.activeElement) && !flyout.contains(shadow.activeElement)) scheduleClose();
        }, 0);
      });
    }
    document.addEventListener("keydown", keyDown, true);
    window.addEventListener("scroll", () => {
      positionAnnotations();
      if (state.selecting) { state.sel = null; renderSelection(); }
    }, { passive: true });
    window.addEventListener("resize", () => {
      layout();
      if (state.sel) {
        state.sel.w = Math.min(state.sel.w, window.innerWidth);
        state.sel.h = Math.min(state.sel.h, window.innerHeight);
        state.sel.left = clamp(state.sel.left, 0, window.innerWidth - state.sel.w);
        state.sel.top = clamp(state.sel.top, 0, window.innerHeight - state.sel.h);
        renderSelection();
      }
    });
    positionAnnotations();
    syncMode();
    layout();
  }

  // Primary controls remain stationary while the hover corridor changes direction.
  function entryDirection(e) {
    const r = primary.getBoundingClientRect();
    const edges = { left: Math.abs(e.clientX - r.left), right: Math.abs(e.clientX - r.right),
      up: Math.abs(e.clientY - r.top), down: Math.abs(e.clientY - r.bottom) };
    return Object.keys(edges).reduce((a, b) => edges[a] < edges[b] ? a : b);
  }
  function enterPrimary(e) {
    cancelClose();
    if (state.dragging || e.pointerType === "touch") return;
    if (state.expanded) return previewMode(state.mode, primary);
    clearTimeout(openTimer);
    const direction = entryDirection(e);
    openTimer = setTimeout(() => openMenus(direction, false), HOVER_DELAY);
  }
  function openMenus(direction, immediate) {
    if (state.capturing || state.dragging) return;
    cancelClose();
    state.expanded = true;
    state.direction = direction;
    alternate.hidden = false;
    primary.setAttribute("aria-expanded", "true");
    layout();
    previewMode(state.mode, primary, immediate);
  }
  function previewMode(mode, anchor, immediate = false) {
    cancelClose();
    clearTimeout(submenuTimer);
    state.preview = mode;
    moveBubble(anchor);
    if (!flyout.hidden && flyout.dataset.mode === mode) return;
    flyout.hidden = true;
    const open = () => {
      if (!state.expanded) return;
      buildOptions(mode);
      flyout.hidden = false;
      layoutOptions(anchor);
    };
    if (immediate) open();
    else submenuTimer = setTimeout(open, HOVER_DELAY);
  }
  function cancelClose() { clearTimeout(closeTimer); }
  function scheduleClose() {
    clearTimeout(openTimer);
    clearTimeout(submenuTimer);
    cancelClose();
    closeTimer = setTimeout(closeMenus, CLOSE_DELAY);
  }
  function closeMenus() {
    clearTimeout(openTimer);
    clearTimeout(submenuTimer);
    cancelClose();
    state.expanded = false;
    alternate.hidden = true;
    flyout.hidden = true;
    primary.setAttribute("aria-expanded", "false");
    moveBubble(primary);
  }
  function moveBubble(target) {
    bubble.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
    primary.classList.toggle("gfx-hovered", target === primary);
    alternate.classList.toggle("gfx-hovered", target === alternate);
  }
  function layout() {
    state.x = clamp(state.x ?? window.innerWidth - 84, MARGIN, window.innerWidth - 72 - MARGIN);
    state.y = clamp(state.y, MARGIN, window.innerHeight - 72 - MARGIN);
    toolbar.style.left = state.x + "px";
    toolbar.style.top = state.y + "px";
    const room = { left: state.x - MARGIN, right: window.innerWidth - state.x - 72 - MARGIN,
      up: state.y - MARGIN, down: window.innerHeight - state.y - 72 - MARGIN };
    const opposite = { left: "right", right: "left", up: "down", down: "up" };
    if (room[state.direction] < 64) {
      state.direction = room[opposite[state.direction]] >= 64 ? opposite[state.direction]
        : Object.keys(room).reduce((a, b) => room[a] > room[b] ? a : b);
    }
    const offset = { left: [-64, 0], right: [64, 0], up: [0, -64], down: [0, 64] }[state.direction];
    alternate.style.left = clamp(state.x + 8 + offset[0], MARGIN, window.innerWidth - 56 - MARGIN) - state.x + "px";
    alternate.style.top = clamp(state.y + 8 + offset[1], MARGIN, window.innerHeight - 56 - MARGIN) - state.y + "px";
    if (!flyout.hidden) layoutOptions(state.preview === state.mode ? primary : alternate);
    moveBubble(state.preview === state.mode || !state.expanded ? primary : alternate);
  }
  function layoutOptions(anchor) {
    const horizontal = state.direction === "up" || state.direction === "down";
    flyout.classList.toggle("gfx-options-row", horizontal);
    // Transform animations change visual bounds, not the final layout footprint.
    const r = { left: toolbar.offsetLeft + toolbar.clientLeft + anchor.offsetLeft,
      top: toolbar.offsetTop + toolbar.clientTop + anchor.offsetTop };
    r.right = r.left + anchor.offsetWidth;
    r.bottom = r.top + anchor.offsetHeight;
    // Constrain the perpendicular corridor before measuring. Narrow screens
    // may need wrapped options rather than clamping a menu over its trigger.
    flyout.style.maxWidth = horizontal ? Math.max(60,
      Math.max(r.left - MARGIN - 8, window.innerWidth - MARGIN - r.right - 8)) + "px" : "";
    flyout.style.maxHeight = !horizontal ? Math.max(60,
      Math.max(r.top - MARGIN - 8, window.innerHeight - MARGIN - r.bottom - 8)) + "px" : "";
    flyout.style.left = "0px";
    flyout.style.top = "0px";
    const size = { width: flyout.offsetWidth, height: flyout.offsetHeight };
    let x, y;
    if (horizontal) {
      const right = r.right + 8;
      x = right + size.width <= window.innerWidth - MARGIN ? right : r.left - 8 - size.width;
      y = r.top;
    } else {
      x = r.left;
      const below = r.bottom + 8;
      y = below + size.height <= window.innerHeight - MARGIN ? below : r.top - 8 - size.height;
    }
    flyout.style.left = clamp(x, MARGIN, window.innerWidth - size.width - MARGIN) + "px";
    flyout.style.top = clamp(y, MARGIN, window.innerHeight - size.height - MARGIN) + "px";
  }
  function buildOptions(mode) {
    flyout.replaceChildren();
    flyout.dataset.mode = mode;
    flyout.setAttribute("aria-label", mode === "camera" ? "Camera options" : "Annotation options");
    const option = (label, icon, selected, update) => {
      const node = button(label, icon, () => {
        const focused = shadow.activeElement === node;
        chooseMode(mode);
        update();
        persist();
        syncMode();
        buildOptions(mode);
        // Keep the options under the pointer when a preview commits a new mode.
        if (focused) Array.from(flyout.querySelectorAll("button"))
          .find((button) => button.getAttribute("aria-label") === label)?.focus({ preventScroll: true });
      }, { "aria-pressed": String(selected), class: "gfx-btn gfx-option" });
      flyout.append(node);
    };
    if (mode === "camera") {
      option("Selection", "selection", prefs.scope === "selection", () => { prefs.scope = "selection"; });
      option("Full page", "full", prefs.scope === "full", () => { prefs.scope = "full"; cancelSelection(); });
      option("Copy to clipboard", "clipboard", prefs.destination === "clipboard", () => { prefs.destination = "clipboard"; });
      option("Save to downloads", "download", prefs.destination === "download", () => { prefs.destination = "download"; });
    } else {
      option("Add notes", "text", prefs.tool === "text", () => { prefs.tool = "text"; });
      option("Draw", "draw", prefs.tool === "draw", () => { prefs.tool = "draw"; });
      option("Erase drawing", "erase", prefs.tool === "erase", () => { prefs.tool = "erase"; });
      option("Light notes", "theme", prefs.light, () => {
        prefs.light = !prefs.light;
        annoLayer.querySelectorAll(".gfx-note").forEach((note) => note.classList.toggle("gfx-note-light", prefs.light));
      });
      flyout.append(button("Undo last drawing", "undo", () => {
        chooseMode("annotate");
        strokes.pop()?.remove();
      }, { class: "gfx-btn gfx-option" }));
      const opacity = el("input", {
        type: "range", min: "15", max: "100", value: String(Math.round(
          (prefs.tool === "text" ? prefs.noteOpacity : prefs.strokeOpacity) * 100)),
        "aria-label": "Annotation opacity", title: "Annotation opacity",
      });
      opacity.addEventListener("input", () => {
        const value = Number(opacity.value) / 100;
        chooseMode("annotate");
        if (prefs.tool === "text") {
          prefs.noteOpacity = value;
          annoLayer.querySelectorAll(".gfx-note").forEach((note) => {
            note.style.setProperty("--note-opacity", value);
            note.querySelector(".gfx-note-opacity").value = Math.round(value * 100);
          });
        } else {
          prefs.strokeOpacity = value;
          strokes.forEach((stroke) => stroke.setAttribute("opacity", value));
        }
      });
      opacity.addEventListener("change", persist);
      flyout.append(el("label", { class: "gfx-opacity" }, el("span", {}, "Opacity"), opacity));
    }
  }
  function chooseMode(mode) {
    state.mode = mode;
    state.editing = mode === "annotate";
    cancelSelection();
    state.preview = mode;
    syncMode();
  }
  function syncMode() {
    primary.innerHTML = icons[state.mode];
    const label = state.mode === "camera"
      ? `Capture ${prefs.scope === "full" ? "full page" : "selection"} to ${prefs.destination === "clipboard" ? "clipboard" : "downloads"}`
      : `Annotate: ${prefs.tool === "text" ? "add notes" : prefs.tool === "draw" ? "draw" : "erase drawing"}`;
    primary.title = label;
    primary.setAttribute("aria-label", label);
    alternate.innerHTML = icons[state.mode === "camera" ? "annotate" : "camera"];
    alternate.title = state.mode === "camera" ? "Annotate" : "Camera";
    alternate.setAttribute("aria-label", alternate.title);
    exit.hidden = !state.editing;
    root.classList.toggle("gfx-editing", state.editing);
    inputLayer.classList.toggle("gfx-on", state.editing);
    inputLayer.dataset.tool = prefs.tool;
    drawingLayer.classList.toggle("gfx-erasing", state.editing && prefs.tool === "erase");
    renderSelection();
  }
  function primaryAction() {
    if (draggingPointer || state.capturing) return;
    if (matchMedia("(hover: none)").matches && !state.expanded) {
      openMenus(state.direction, true);
      return;
    }
    closeMenus();
    if (state.mode === "annotate") {
      state.editing = true;
      syncMode();
      return;
    }
    if (prefs.scope === "selection" && !state.sel) {
      state.selecting = true;
      renderSelection();
      showToast("Drag a region, then click the camera to capture. Esc cancels.", true);
    } else runSave();
  }
  function dragToolbar(e) {
    if (e.button !== 0) return;
    let moved = false;
    const start = { x: e.clientX, y: e.clientY, left: state.x, top: state.y };
    primary.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = state.dragging = true;
      closeMenus();
      state.x = start.left + ev.clientX - start.x;
      state.y = start.top + ev.clientY - start.y;
      layout();
    };
    const end = () => {
      primary.removeEventListener("pointermove", move);
      primary.removeEventListener("pointerup", end);
      primary.removeEventListener("pointercancel", end);
      primary.removeEventListener("lostpointercapture", end);
      if (primary.hasPointerCapture(e.pointerId)) primary.releasePointerCapture(e.pointerId);
      state.dragging = false;
      draggingPointer = moved;
      setTimeout(() => { draggingPointer = false; }, 0);
    };
    primary.addEventListener("pointermove", move);
    primary.addEventListener("pointerup", end);
    primary.addEventListener("pointercancel", end);
    primary.addEventListener("lostpointercapture", end);
  }

  // Annotations use document CSS pixels. Moving the layer on scroll also works
  // when the host is in the browser top layer above a transformed site root.
  function positionAnnotations() {
    annoLayer.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`;
  }
  function trackPointer(node, e, move, end) {
    node.setPointerCapture(e.pointerId);
    const onMove = (ev) => { if (ev.pointerId === e.pointerId) move(ev); };
    const onEnd = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onEnd);
      node.removeEventListener("pointercancel", onEnd);
      node.removeEventListener("lostpointercapture", onEnd);
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
      end?.(ev);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onEnd);
    node.addEventListener("pointercancel", onEnd);
    node.addEventListener("lostpointercapture", onEnd);
  }
  function annotatePointer(e) {
    if (e.button !== 0 || !state.editing || state.capturing) return;
    closeMenus();
    if (prefs.tool === "erase") return;
    e.preventDefault();
    const x = e.clientX + window.scrollX, y = e.clientY + window.scrollY;
    if (prefs.tool === "text") {
      createNote(x, y);
      return;
    }
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x} ${y} l0.1 0.1`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#8b8bff");
    path.setAttribute("stroke-width", "4");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", prefs.strokeOpacity);
    let d = `M${x} ${y}`;
    path.addEventListener("pointerdown", (ev) => {
      if (!state.editing || prefs.tool !== "erase") return;
      ev.preventDefault();
      path.remove();
      const index = strokes.indexOf(path);
      if (index >= 0) strokes.splice(index, 1);
    });
    drawingLayer.append(path);
    strokes.push(path);
    trackPointer(inputLayer, e, (ev) => {
      for (const point of ev.getCoalescedEvents?.().length ? ev.getCoalescedEvents() : [ev]) {
        d += ` L${point.clientX + window.scrollX} ${point.clientY + window.scrollY}`;
      }
      path.setAttribute("d", d);
    });
  }
  function createNote(x, y) {
    const note = el("div", { class: "gfx-note" });
    note.style.left = x + "px";
    note.style.top = y + "px";
    note.style.width = Math.min(220, window.innerWidth - 24) + "px";
    note.style.setProperty("--note-opacity", prefs.noteOpacity);
    note.classList.toggle("gfx-note-light", prefs.light);
    const body = el("div", { class: "gfx-note-body", contenteditable: "plaintext-only",
      role: "textbox", "aria-multiline": "true", "aria-label": "Annotation text",
      "data-placeholder": "Type feedback…" });
    const opacity = el("input", { type: "range", min: "15", max: "100",
      value: String(Math.round(prefs.noteOpacity * 100)), class: "gfx-note-opacity",
      title: "Note opacity", "aria-label": "Note opacity" });
    opacity.addEventListener("input", () => note.style.setProperty("--note-opacity", Number(opacity.value) / 100));
    const bar = el("div", { class: "gfx-note-bar" },
      button("Flip note theme", "theme", () => note.classList.toggle("gfx-note-light"), { class: "gfx-note-btn" }),
      opacity, el("div", { class: "gfx-note-spacer" }),
      button("Delete note", "trash", () => note.remove(), { class: "gfx-note-btn" }));
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button, input")) return;
      e.preventDefault();
      const sx = e.clientX + window.scrollX, sy = e.clientY + window.scrollY;
      const left = parseFloat(note.style.left), top = parseFloat(note.style.top);
      trackPointer(bar, e, (ev) => {
        note.style.left = Math.max(0, left + ev.clientX + window.scrollX - sx) + "px";
        note.style.top = Math.max(0, top + ev.clientY + window.scrollY - sy) + "px";
      });
    });
    note.append(bar, body);
    annoLayer.append(note);
    note.style.left = Math.max(window.scrollX, Math.min(x, window.scrollX + window.innerWidth - note.offsetWidth - MARGIN)) + "px";
    body.focus({ preventScroll: true });
    return note;
  }

  // Selection has its own explicit capture/cancel controls and stays adjustable.
  function buildSelection() {
    const layer = el("div", { class: "gfx-select-layer" });
    const masks = ["top", "right", "bottom", "left"].map((side) => el("div", { class: "gfx-mask", "data-side": side }));
    crop = el("div", { class: "gfx-crop", hidden: "" });
    for (const dir of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const h = el("div", { class: "gfx-handle", "data-dir": dir });
      h.style.left = (dir.includes("w") ? 0 : dir.includes("e") ? 100 : 50) + "%";
      h.style.top = (dir.includes("n") ? 0 : dir.includes("s") ? 100 : 50) + "%";
      h.style.transform = "translate(-50%,-50%)";
      h.addEventListener("pointerdown", (e) => editSelection(e, dir));
      crop.append(h);
    }
    captureButton = button("Capture selected region", "camera", () => runSave(), { class: "gfx-btn" });
    const controls = el("div", { class: "gfx-crop-actions gfx-glass" }, captureButton,
      button("Cancel selection", "close", cancelSelection));
    crop.append(controls);
    crop.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("button, .gfx-handle")) editSelection(e, "move");
    });
    layer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".gfx-crop")) return;
      e.preventDefault();
      const x = e.clientX, y = e.clientY;
      state.sel = null;
      trackPointer(layer, e, (ev) => {
        const ex = clamp(ev.clientX, 0, window.innerWidth), ey = clamp(ev.clientY, 0, window.innerHeight);
        state.sel = { left: Math.min(x, ex), top: Math.min(y, ey), w: Math.abs(ex - x), h: Math.abs(ey - y) };
        renderSelection();
      }, () => {
        if (!state.sel || state.sel.w < 6 || state.sel.h < 6) state.sel = null;
        renderSelection();
      });
      renderSelection();
    });
    layer.append(...masks, crop);
    return layer;
  }
  function editSelection(e, dir) {
    if (e.button !== 0 || !state.sel) return;
    e.preventDefault();
    e.stopPropagation();
    const s = { ...state.sel, x: e.clientX, y: e.clientY };
    trackPointer(e.currentTarget, e, (ev) => {
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      if (dir === "move") {
        state.sel = { ...state.sel, left: clamp(s.left + dx, 0, window.innerWidth - s.w),
          top: clamp(s.top + dy, 0, window.innerHeight - s.h) };
      } else {
        let left = s.left, right = s.left + s.w, top = s.top, bottom = s.top + s.h;
        if (dir.includes("w")) left = clamp(s.left + dx, 0, right - 6);
        if (dir.includes("e")) right = clamp(right + dx, left + 6, window.innerWidth);
        if (dir.includes("n")) top = clamp(s.top + dy, 0, bottom - 6);
        if (dir.includes("s")) bottom = clamp(bottom + dy, top + 6, window.innerHeight);
        state.sel = { left, top, w: right - left, h: bottom - top };
      }
      renderSelection();
    });
  }
  function renderSelection() {
    if (!selectionLayer) return;
    selectionLayer.classList.toggle("gfx-on", state.selecting);
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = state.sel || { left: 0, top: 0, w: 0, h: 0 };
    crop.hidden = !state.sel || s.w < 6 || s.h < 6;
    Object.assign(crop.style, { left: s.left + "px", top: s.top + "px", width: s.w + "px", height: s.h + "px" });
    const rects = state.sel ? [
      [0, 0, vw, s.top], [s.left + s.w, s.top, vw - s.left - s.w, s.h],
      [0, s.top + s.h, vw, vh - s.top - s.h], [0, s.top, s.left, s.h],
    ] : [[0, 0, vw, vh], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    selectionLayer.querySelectorAll(".gfx-mask").forEach((mask, i) => {
      const [x, y, w, h] = rects[i];
      Object.assign(mask.style, { left: x + "px", top: y + "px", width: Math.max(0, w) + "px", height: Math.max(0, h) + "px" });
    });
    const controls = crop.querySelector(".gfx-crop-actions");
    controls.style.left = clamp(s.left, MARGIN, vw - 112 - MARGIN) - s.left + "px";
    controls.style.top = (s.top + s.h + 64 <= vh - MARGIN ? s.h + 8 : Math.max(8, s.h - 60)) + "px";
  }
  function cancelSelection() {
    state.selecting = false;
    state.sel = null;
    renderSelection();
    if (toast) toast.classList.remove("gfx-on");
  }
  function keyDown(e) {
    if (!state.enabled || state.capturing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenus();
      if (state.selecting) cancelSelection();
      else if (state.editing) { state.editing = false; state.mode = "camera"; syncMode(); }
      return;
    }
    if (e.composedPath().some((node) => node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName))) return;
    if (state.selecting && state.sel && (e.code === "Space" || e.key === "Enter")) {
      e.preventDefault();
      runSave();
    }
  }

  // Screenshot requests are serialized by the worker and never capture another tab.
  function message(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!response?.ok) reject(new Error(response?.error || "Extension request failed"));
        else resolve(response);
      });
    });
  }
  async function visibleImage() {
    const { dataUrl } = await message({ type: "GFX_CAPTURE_VISIBLE" });
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return img;
  }
  function canvasFor(w, h) {
    if (w > MAX_CANVAS || h > MAX_CANVAS || w * h > MAX_PIXELS) {
      throw new Error("This page is too large to capture safely. Select a smaller region.");
    }
    const canvas = el("canvas");
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }
  async function captureSelection(sel) {
    const viewport = { w: window.innerWidth, h: window.innerHeight,
      x: window.scrollX, y: window.scrollY };
    const img = await visibleImage();
    if (viewport.w !== window.innerWidth || viewport.h !== window.innerHeight ||
        viewport.x !== window.scrollX || viewport.y !== window.scrollY) {
      throw new Error("The page moved or resized during capture. Try again.");
    }
    const sx = img.width / viewport.w, sy = img.height / viewport.h;
    const canvas = canvasFor(Math.max(1, Math.round(sel.w * sx)), Math.max(1, Math.round(sel.h * sy)));
    canvas.getContext("2d").drawImage(img, Math.round(sel.left * sx), Math.round(sel.top * sy),
      canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function captureFullPage() {
    const doc = document.documentElement;
    const fullH = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight);
    const viewH = window.innerHeight, viewW = window.innerWidth;
    const previous = { x: window.scrollX, y: window.scrollY };
    const styles = [doc, document.body].filter(Boolean).map((node) => ({
      node, behavior: [node.style.getPropertyValue("scroll-behavior"), node.style.getPropertyPriority("scroll-behavior")],
      snap: [node.style.getPropertyValue("scroll-snap-type"), node.style.getPropertyPriority("scroll-snap-type")],
    }));
    styles.forEach(({ node }) => {
      node.style.setProperty("scroll-behavior", "auto", "important");
      node.style.setProperty("scroll-snap-type", "none", "important");
    });
    try {
      window.scrollTo({ left: previous.x, top: 0, behavior: "instant" });
      await paint();
      await sleep(80);
      const first = await visibleImage();
      if (window.scrollY !== 0 || window.scrollX !== previous.x) throw new Error("The page moved during capture. Try again.");
      const sx = first.width / viewW, sy = first.height / viewH;
      const canvas = canvasFor(first.width, Math.round(fullH * sy));
      const ctx = canvas.getContext("2d");
      let covered = 0, img = first;
      while (covered < fullH) {
        const actual = window.scrollY;
        if (window.innerHeight !== viewH || window.innerWidth !== viewW) throw new Error("Window resized during capture. Try again.");
        const start = Math.max(covered, actual), end = Math.min(fullH, actual + viewH);
        if (actual > covered + 1 || end <= covered) throw new Error("This page cannot be scrolled for a full-page capture. Use Selection.");
        const sourceY = Math.round((start - actual) * sy);
        const destY = Math.round(start * sy), endY = Math.min(canvas.height, Math.round(end * sy));
        ctx.drawImage(img, 0, sourceY, img.width, endY - destY, 0, destY, canvas.width, endY - destY);
        covered = end;
        if (covered >= fullH) break;
        window.scrollTo({ left: previous.x, top: Math.min(covered, fullH - viewH), behavior: "instant" });
        await paint();
        await sleep(540);
        const requestedY = window.scrollY;
        img = await visibleImage();
        if (window.scrollY !== requestedY || window.scrollX !== previous.x) {
          throw new Error("The page moved during capture. Try again.");
        }
      }
      return canvas;
    } finally {
      window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
      styles.forEach(({ node, behavior, snap }) => {
        for (const [key, value] of [["scroll-behavior", behavior], ["scroll-snap-type", snap]]) {
          if (value[0]) node.style.setProperty(key, ...value);
          else node.style.removeProperty(key);
        }
      });
      positionAnnotations();
    }
  }
  async function runSave() {
    if (state.capturing) return;
    const scope = prefs.scope, destination = prefs.destination, sel = state.sel && { ...state.sel };
    if (scope === "selection" && !sel) return primaryAction();
    state.capturing = true;
    closeMenus();
    state.selecting = false;
    root.classList.add("gfx-capturing");
    primary.disabled = true;
    try {
      await paint();
      const canvas = scope === "full" ? await captureFullPage() : await captureSelection(sel);
      let copied = false;
      if (destination === "clipboard") {
        try {
          const blob = await new Promise((resolve, reject) =>
            canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Image encoding failed")), "image/png"));
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          copied = true;
        } catch (err) {
          console.warn("Glass Feedback: clipboard unavailable", err);
        }
      }
      if (!copied) await message({ type: "GFX_DOWNLOAD", dataUrl: canvas.toDataURL("image/png"),
        filename: `glass-feedback/glass-feedback_${new Date().toISOString().replace(/[:.]/g, "-")}.png` });
      showToast(copied ? "Copied to clipboard" : destination === "clipboard" ? "Clipboard blocked — saved to downloads" : "Saved to downloads");
    } catch (err) {
      showToast("Capture failed: " + err.message, true);
    } finally {
      root.classList.remove("gfx-capturing");
      primary.disabled = false;
      state.capturing = false;
      state.sel = null;
      renderSelection();
    }
  }
  function showToast(text, sticky = false) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.add("gfx-on");
    if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("gfx-on"), 3500);
  }
  async function setEnabled(on) {
    if (!host) {
      if (!buildPromise) buildPromise = build().catch((err) => {
        host?.remove();
        host = null;
        buildPromise = null;
        throw err;
      });
      await buildPromise;
    }
    state.enabled = on;
    if (on) {
      host.showPopover();
      layout();
      positionAnnotations();
    } else {
      closeMenus();
      cancelSelection();
      state.editing = false;
      state.mode = "camera";
      syncMode();
      host.hidePopover();
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "GFX_TOGGLE_UI") return;
    toggleQueue = toggleQueue.catch(() => {}).then(async () => {
      if (state.capturing) return sendResponse({ ok: true, enabled: state.enabled });
      await setEnabled(!state.enabled);
      sendResponse({ ok: true, enabled: state.enabled });
    }).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  });
})();
