/*
 * Glass Feedback — on-demand, isolated in-page camera and annotation tools.
 * Preferences and activation persist; notes and strokes belong to the current document.
 */
(() => {
  "use strict";
  if (window.__gfxInjected) return;
  window.__gfxInjected = true;

  const MARGIN = 12;
  const CLOSE_DELAY = 340;
  const MAX_CANVAS = 16384;
  const MAX_PIXELS = 64 * 1024 * 1024;
  const MODES = ["camera", "annotate"];
  const MODE_LABELS = { camera: "Camera", annotate: "Annotate", note: "Note", wand: "Magic wand", settings: "Settings" };
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const viewWidth = () => document.documentElement.clientWidth || window.innerWidth;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const paint = () => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons = {
    camera: svg('<circle cx="12" cy="12" r="9.3"/><path d="M12 2.7v1.5M21.3 12h-1.5M12 21.3v-1.5M2.7 12h1.5" stroke-width="1"/><path class="gfx-aperture" d=""/>'),
    annotate: svg('<g class="gfx-pencil-body"><path d="m3.5 20.5 1.4-6.1L15.8 3.5a2 2 0 0 1 2.8 0l1.9 1.9a2 2 0 0 1 0 2.8L9.6 19.1zM4.9 14.4l4.7 4.7M13.5 5.8l4.7 4.7M7.3 16.7l8.5-8.5"/><path class="gfx-tool-accent" d="m3.5 20.5 1.1-3.8 2.7 2.7z"/><path class="gfx-tool-accent" d="m15.8 3.5 4.7 4.7"/></g>'),
    selection: svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
    full: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6m-6 5h6m-6 5h6"/>'),
    clipboard: svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H5v16h14V5h-3"/>'),
    download: svg('<path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/>'),
    text: svg('<path d="M4 6V4h16v2M12 4v16m-4 0h8"/>'),
    inline: svg('<path d="M4 4h16v7H4zM4 11v9h16v-9M8 15h8m-8 3h5"/>'),
    draw: svg('<path d="M3 18c2-7 4 5 7-4s5 7 8-3M17 4l3-2 2 3-3 2z"/>'),
    smart: svg('<path d="M3 19c3-8 5 5 8-3L20 7m-6 0h6v6M5 3v4M3 5h4"/>'),
    rectangle: svg('<rect x="4" y="5" width="16" height="14" rx="1"/>'),
    color: svg('<path d="M12 3a9 9 0 1 0 0 18h1.2a2.3 2.3 0 0 0 1.7-3.8c-.9-1-.2-2.5 1.1-2.5h1.7c2.1 0 3.3-1.4 3.3-3.5C21 6.7 17 3 12 3Z"/><circle cx="7" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/><circle cx="17.5" cy="11" r="1"/><circle cx="8.5" cy="16" r="1.5"/>'),
    erase: svg('<path d="m3 14 9-10 9 8-8 9H9zM9 8l9 8M13 21h8"/>'),
    theme: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'),
    opacity: svg('<path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12z"/><path d="M12 8v14a7 7 0 0 0 7-7c0-2-4-7-7-7z" fill="currentColor" fill-opacity=".35"/>'),
    close: svg('<path d="m6 6 12 12M6 18 18 6"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/>'),
    undo: svg('<path d="m8 3-5 5 5 5M3 8h10a7 7 0 0 1 0 14"/>'),
    settings: svg('<path d="M4 7h16M4 17h16"/><circle class="gfx-settings-top" cx="9" cy="7" r="3"/><circle class="gfx-settings-bottom" cx="15" cy="17" r="3"/>'),
    wand: svg('<g class="gfx-wand-body"><path d="m4 20 12-12 4 4L8 24z" transform="translate(0 -3)"/><path class="gfx-tool-accent" d="m13 8 4 4"/></g><g class="gfx-wand-sparks"><path d="M18 2v4m-2-2h4M5 4v4M3 6h4M20 17v4m-2-2h4"/></g>'),
    motion: svg('<path d="M3 7h12c5 0 5-5 1-5M3 12h15c5 0 5 6 1 6M3 17h7c4 0 4 5 1 5"/>'),
    snappy: svg('<path d="m13 2-8 12h6l-1 8 9-13h-6z"/>'),
    still: svg('<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>'),
    wash: svg('<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fill-opacity=".3"/>'),
    beside: svg('<rect x="2" y="6" width="8" height="12" rx="1"/><path d="M13 12h8m-3-3 3 3-3 3"/>'),
    below: svg('<rect x="6" y="2" width="12" height="8" rx="1"/><path d="M12 13v8m-3-3 3 3 3-3"/>'),
    hover: svg('<path d="m5 3 3 16 4-5 6-1zM16 4l2-2m1 6h3"/>'),
    pin: svg('<path d="m8 3 8 0-1 6 3 4H6l3-4zM12 13v8"/>'),
    compact: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    roomy: svg('<rect x="3" y="6" width="6" height="12" rx="2"/><rect x="15" y="6" width="6" height="12" rx="2"/>'),
    position: svg('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  };
  icons.markup = icons.annotate;
  icons.note = svg('<g class="gfx-note-symbol"><path d="M4 3h16v12l-5 6H4zM15 21v-6h5M8 8h8M8 12h6"/><path class="gfx-tool-accent" d="M15 21v-6h5z"/></g>');
  const prefs = {
    scope: "selection", destination: "clipboard", tool: "smart", defaultTool: "smart", notePlacement: "place",
    drawingColor: "#345b8c", recentColors: ["#345b8c", "#ff526b"], motion: "liquid",
    wandStyle: "outline", wandPlacement: "beside", wandNote: "regular", wandColor: "#345b8c", wandCapture: true,
    controls: "hover", drawingNotes: false, power: true, highlightElements: false,
  };
  const state = {
    enabled: false, armed: false, mode: "camera", editing: false, selecting: false,
    capturing: false, sel: null, captureNote: null, captureFits: true, expanded: false, preview: "camera",
    direction: "left", modeDirection: "left", x: null, y: 120, dragging: false, details: false, oneOffTool: null, oneOffOwner: null,
  };
  let host, shadow, root, toolbar, primary, alternate, flyout, bubble;
  const modeButtons = [];
  let modeOffsets = [-64, -128];
  let surface, rim, inkLayer, branchBox, branchSide, branchAnchor;
  let hint, retractHint, pointerPosition;
  let hoveredButton;
  let hoveredMode;
  let pointerWithinUI = false;
  let annoLayer, drawingLayer, inputLayer, selectionLayer, crop, captureButton, clearButton, cropSize, toast;
  let buildPromise, toggleQueue = Promise.resolve();
  let closeTimer, toastTimer, toolFeedbackTimer;
  let draggingPointer = false;
  let noteSelection;
  let selectedShape, shapeTools, shapeColors, shapeColorButton, shapeOpacity;
  const strokes = [];
  let smartShape = null;
  const drawingNotes = new Map();
  let shapeHoverTimer, shapeHoverPoint, hoveredShape;
  let wandContext = null;
  const wandMarks = new Map();
  const toolbarTimers = new WeakMap();
  let wandPreview, wandFrame;
  let idleTimer, activePointers = 0;

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
      if (typeof saved.highlightElements === "boolean") prefs.highlightElements = saved.highlightElements;
      else if (saved.defaultTool === "element") prefs.highlightElements = true;
      if (["place", "element"].includes(saved.notePlacement)) prefs.notePlacement = saved.notePlacement;
      if (typeof saved.drawingNotes === "boolean") prefs.drawingNotes = saved.drawingNotes;
      if (typeof saved.power === "boolean") prefs.power = saved.power;
      if (["liquid", "snappy", "off"].includes(saved.motion)) prefs.motion = saved.motion;
      else if (["solid", "lively", "calm"].includes(saved.motion)) prefs.motion = saved.motion === "lively" ? "liquid" : "off";
      if (["outline", "wash"].includes(saved.wandStyle)) prefs.wandStyle = saved.wandStyle;
      if (["beside", "below"].includes(saved.wandPlacement)) prefs.wandPlacement = saved.wandPlacement;
      if (["regular", "inline"].includes(saved.wandNote)) prefs.wandNote = saved.wandNote;
      if (/^#[0-9a-f]{6}$/i.test(saved.wandColor)) prefs.wandColor = saved.wandColor;
      if (typeof saved.wandCapture === "boolean") prefs.wandCapture = saved.wandCapture;
      if (["hover", "pinned"].includes(saved.controls)) prefs.controls = saved.controls;
      else if (saved.menuReveal === "pinned" || saved.toolbarReveal === "pinned") prefs.controls = "pinned";
      if (/^#[0-9a-f]{6}$/i.test(saved.drawingColor)) prefs.drawingColor = saved.drawingColor;
      if (Array.isArray(saved.recentColors)) prefs.recentColors = [...new Set([...saved.recentColors
        .filter((color) => /^#[0-9a-f]{6}$/i.test(color)).map((color) => color.toLowerCase()),
        ...prefs.recentColors])].slice(0, 2);
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
    const response = await fetch(chrome.runtime.getURL("content/content.css"), { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the toolbar stylesheet. Reload the extension and try again.");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(await response.text());
    host = el("div", { id: "gfx-host", popover: "manual" });
    shadow = host.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [sheet];
    const spin = '<animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="11s" repeatCount="indefinite"/>';
    shadow.append(el("div", { class: "gfx-svg-defs", html:
      `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>
      <linearGradient id="gfx-iris" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#283561" stop-opacity=".92"/><stop offset=".42" stop-color="#3d2b62" stop-opacity=".78"/>
      <stop offset=".72" stop-color="#272453" stop-opacity=".82"/><stop offset="1" stop-color="#16223c" stop-opacity=".92"/>${spin}</linearGradient>
      <linearGradient id="gfx-rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="white" stop-opacity=".8"/>
      <stop offset=".4" stop-color="white" stop-opacity=".25"/><stop offset=".65" stop-color="white" stop-opacity=".08"/>
      <stop offset="1" stop-color="#101722" stop-opacity=".3"/></linearGradient>
      <filter id="gfx-water-rim"><feMorphology in="SourceAlpha" operator="erode" radius=".8" result="inside"/>
      <feComposite in="SourceGraphic" in2="inside" operator="out"/></filter></defs></svg>` }));
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
        <feDisplacementMap in="SourceGraphic" in2="map" scale="52" xChannelSelector="R" yChannelSelector="G"/>
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
    shapeColors = el("div", { class: "gfx-shape-colors", "aria-label": "Drawing colors", hidden: "" });
    shapeColorButton = button("Drawing color", "color", () => {
      shapeColors.hidden = !shapeColors.hidden;
      shapeColorButton.setAttribute("aria-expanded", String(!shapeColors.hidden));
      positionShapeTools();
    }, { class: "gfx-note-btn", "aria-expanded": "false" });
    shapeTools = annotationToolbar({ label: "Selected drawing", class: "gfx-shape-tools gfx-glass", hidden: true,
      appearance: shapeColorButton,
      owner: () => wandNoteFor(selectedShape),
      addNote: () => {
        if (!selectedShape) return;
        const owner = wandNoteFor(selectedShape);
        if (owner) {
          owner.hidden = !owner.hidden;
          selectShape(selectedShape);
          return;
        }
        let note = drawingNotes.get(selectedShape);
        if (!note?.isConnected) note = addDrawingNote(selectedShape);
        else note.hidden = !note.hidden;
        selectShape(selectedShape);
      },
      remove: () => {
        if (!selectedShape) return;
        const entry = wandEntry(selectedShape);
        if (entry) {
          wandMarks.delete(entry[0]);
          entry[0].remove();
          selectedShape.remove();
          drawingNotes.delete(selectedShape);
          return selectShape(null);
        }
        const index = strokes.indexOf(selectedShape);
        if (index >= 0) strokes.splice(index, 1);
        drawingNotes.get(selectedShape)?.remove();
        drawingNotes.delete(selectedShape);
        selectedShape.remove();
        selectShape(null);
      },
      opacity: 85, onOpacity: (value) => {
        if (selectedShape?.classList.contains("gfx-wand-mark")) selectedShape.style.opacity = value / 100;
        else selectedShape?.setAttribute("opacity", value / 100);
      },
    });
    for (const [label, color] of [["Purple", "#8b8bff"], ["Red", "#ff6b7a"], ["Yellow", "#ffd166"], ["Blue", "#55c9ff"]]) {
      const swatch = el("button", { type: "button", class: "gfx-shape-color", title: label,
        "aria-label": label, onclick: () => {
          if (selectedShape?.classList.contains("gfx-wand-mark")) selectedShape.style.setProperty("--wand-color", color);
          else selectedShape?.setAttribute("stroke", color);
          prefs.recentColors = [color, ...prefs.recentColors.filter((recent) => recent !== color)].slice(0, 2);
          persist();
          shapeColorButton.style.color = color;
          shapeColors.hidden = true;
          shapeColorButton.setAttribute("aria-expanded", "false");
          positionShapeTools();
        } });
      swatch.style.setProperty("--shape-color", color);
      shapeColors.append(swatch);
    }
    shapeTools.append(shapeColors);
    shapeOpacity = shapeTools.querySelector('input[type="range"]');
    shapeTools.addEventListener("pointerenter", positionShapeTools);
    shapeTools.addEventListener("pointerleave", positionShapeTools);
    shapeTools.addEventListener("focusin", positionShapeTools);
    annoLayer.append(shapeTools);
    inputLayer = el("div", { class: "gfx-place-layer", onpointerdown: (e) => {
      if (chrome.runtime.isDemo && e.button === 0) {
        const control = document.elementsFromPoint(e.clientX, e.clientY)
          .find((node) => node !== host)?.closest("[data-demo-control]");
        if (control) {
          e.preventDefault();
          disarmTool(false);
          control.click();
          return;
        }
      }
      if (state.mode === "camera") cameraPointer(e);
      else annotatePointer(e);
    } });
    wandPreview = el("div", { class: "gfx-wand-preview", hidden: "", "aria-hidden": "true" });
    selectionLayer = buildSelection();
    surface = el("div", { class: "gfx-surface gfx-glass", "aria-hidden": "true" });
    rim = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    rim.setAttribute("class", "gfx-surface-rim");
    rim.setAttribute("aria-hidden", "true");
    rim.innerHTML = '<path fill="none" stroke="url(#gfx-rim)" stroke-width="1.2"/>';
    inkLayer = el("div", { class: "gfx-ink-layer", "aria-hidden": "true" });
    toolbar = el("div", { class: "gfx-toolbar", role: "toolbar", "aria-label": "Glass Feedback" });
    primary = button("Capture selection to clipboard", "camera", primaryAction, {
      class: "gfx-btn gfx-pill", "aria-expanded": "false",
    });
    modeButtons.length = 0;
    for (const mode of MODES.slice(1)) modeButtons.push(button(mode, mode, (e) => {
      chooseMode(e.currentTarget.dataset.mode);
      closeMenus();
    }, { class: "gfx-btn gfx-alternate", hidden: "" }));
    alternate = modeButtons[0];
    bubble = el("span", { class: "gfx-liquid", "aria-hidden": "true" });
    flyout = el("div", { class: "gfx-options", role: "group", hidden: "" });
    flyout.addEventListener("scroll", wakeGlass, { passive: true });
    toolbar.append(primary, ...modeButtons);
    toast = el("div", { class: "gfx-toast gfx-glass", role: "status", "aria-live": "polite" });
    root.append(annoLayer, inputLayer, wandPreview, selectionLayer, surface, rim, toolbar, flyout, bubble, inkLayer, toast);
    shadow.append(root);
    document.documentElement.append(host);
    for (const event of ["pointerdown", "input", "keydown", "pointerover", "pointerout", "focusin", "focusout"])
      shadow.addEventListener(event, keepToolActive, true);
    for (const event of ["pointerdown", "input", "keydown"])
      shadow.addEventListener(event, (e) => {
        if (annotationTool() !== "smart" || e.target === inputLayer || drawingLayer.contains(e.target)) return;
        smartShape = null;
        state.oneOffTool = state.oneOffOwner = null;
        syncMode();
      }, true);
    primary.addEventListener("pointerenter", enterPrimary);
    for (const node of modeButtons) {
      const hoverMode = (e) => {
        if (e.pointerType !== "touch" && !state.dragging && !state.capturing &&
            Math.hypot(glass.x - state.x, glass.y - state.y) < 2)
          hoveredMode = node.dataset.mode;
        cancelClose();
      };
      node.addEventListener("pointerenter", hoverMode);
      node.addEventListener("pointermove", hoverMode);
      node.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "touch" || state.dragging || state.capturing) return;
        state.preview = node.dataset.mode;
        const r = node.getBoundingClientRect();
        const side = r.top > window.innerHeight - r.bottom ? "up" : "down";
        suggest(node, side, () => openOptions(node,
          pointerPosition?.y < node.getBoundingClientRect().top + 28 ? "up" : "down"));
      });
      node.addEventListener("pointerleave", scheduleClose);
      node.addEventListener("keydown", (e) => {
        if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        openOptions(node, e.key === "ArrowUp" ? "up" : "down");
        flyout.querySelector("button")?.focus({ preventScroll: true });
      });
    }
    primary.addEventListener("focus", () => { if (prefs.power) openMenus(state.direction, false); });
    primary.addEventListener("keydown", (e) => {
      if (!prefs.power) return;
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        openMenus(e.key.slice(5).toLowerCase(), true);
        (alternate.hidden ? flyout.querySelector("button") : alternate)?.focus({ preventScroll: true });
      }
    });
    primary.addEventListener("pointerdown", dragToolbar);
    for (const node of [primary, ...modeButtons]) {
      node.addEventListener("pointerenter", () => moveBubble(node));
      node.addEventListener("focus", () => moveBubble(node));
    }
    for (const surface of [toolbar, flyout]) {
      surface.addEventListener("pointerenter", () => { pointerWithinUI = true; cancelClose(); wakeGlass(); });
      surface.addEventListener("pointerleave", () => { pointerWithinUI = false; scheduleClose(); wakeGlass(); });
      surface.addEventListener("focusout", () => {
        setTimeout(() => {
          if (!pointerWithinUI && !toolbar.contains(shadow.activeElement) && !flyout.contains(shadow.activeElement)) scheduleClose();
        }, 0);
      });
    }
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("selectionchange", updateNoteSelection);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.enabled) { wakeGlass(); wakeWandMarks(); }
    });
    document.addEventListener("pointermove", approachHint, { capture: true, passive: true });
    document.addEventListener("pointerout", (e) => {
      if (!e.relatedTarget) {
        wandPreview.hidden = true;
        root.classList.remove("gfx-wand-pointing");
        if (selectedShape) hoverItemToolbar(shapeTools, false);
      }
    });
    if (chrome.runtime.isDemo) window.addEventListener("gfx-demo-mode", (e) => {
      if (e.detail === "browse") return disarmTool(false);
      if (e.detail === "settings") return chooseMode("settings");
      if (MODES.includes(e.detail)) { chooseMode(e.detail); armTool(); closeMenus(); }
    });
    document.addEventListener("scroll", () => {
      positionAnnotations();
      if (state.selecting && !state.captureNote) { state.sel = null; renderSelection(); }
    }, { capture: true, passive: true });
    window.addEventListener("resize", () => {
      layout();
      positionShapeTools();
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

  // Pull toward an edge; menus make room around the user's chosen position.
  function entryDirection(e) {
    const r = primary.getBoundingClientRect();
    const edges = { left: Math.abs(e.clientX - r.left), right: Math.abs(e.clientX - r.right),
      up: Math.abs(e.clientY - r.top), down: Math.abs(e.clientY - r.bottom) };
    return Object.keys(edges).reduce((a, b) => edges[a] < edges[b] ? a : b);
  }
  function enterPrimary(e) {
    if (!prefs.power) return;
    cancelClose();
    if (state.dragging || e.pointerType === "touch") return;
    if (keepMenusOpen()) {
      pointerPosition = { x: e.clientX, y: e.clientY };
      openMenus(entryDirection(e), false);
      return;
    }
    if (state.expanded) closeMenus();
    pointerPosition = { x: e.clientX, y: e.clientY };
    state.direction = entryDirection(e);
    layout();
    suggest(primary, state.direction, () => openMenus(state.direction, false));
  }
  function suggest(anchor, side, open, box) {
    const r = box || anchor.getBoundingClientRect();
    const x = (r.left ?? r.x) + r.width / 2, y = (r.top ?? r.y) + r.height / 2;
    const [dx, dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[side];
    const reach = box ? (dx ? r.width : r.height) / 2 : 36;
    hint = { anchor, x, y, dx, dy, reach, open, progress: 0,
      intent: 0, dismissed: false, main: anchor === primary && !state.expanded,
      start: 12 };
    retractHint = null;
    glass.hint = 0;
    glass.hintV = 0;
    wakeGlass();
  }
  function approachHint(e) {
    if (!prefs.power) return;
    keepToolActive();
    const previous = pointerPosition, now = performance.now();
    pointerPosition = { x: e.clientX, y: e.clientY, time: now };
    updateWandPreview(e);
    if (!state.enabled || state.dragging || state.capturing || state.selecting || e.pointerType === "touch") return;
    wakeGlass();
    if (!hint) return;
    const elapsed = previous?.time ? Math.max(1, now - previous.time) : 16;
    const speed = previous ? Math.hypot(e.clientX - previous.x, e.clientY - previous.y) / elapsed : 0;
    const distance = Math.hypot(e.clientX - hint.x, e.clientY - hint.y);
    if (distance < 22) { hint.dismissed = false; hint.intent = 0; }
    if (hint.main && distance > 12 && distance < 42 && !hint.dismissed) {
      const x = e.clientX - hint.x, y = e.clientY - hint.y;
      const direction = Math.abs(x) > Math.abs(y) ? x > 0 ? "right" : "left" : y > 0 ? "down" : "up";
      if (state.direction !== direction) {
        state.direction = direction;
        layout();
        [hint.dx, hint.dy] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[state.direction];
      }
    } else if (!hint.main && modeButtons.includes(hint.anchor) && distance < 42 &&
        Math.abs(e.clientY - hint.y) > 12) {
      hint.dx = 0;
      hint.dy = e.clientY > hint.y ? 1 : -1;
    }
    const along = (e.clientX - hint.x) * hint.dx + (e.clientY - hint.y) * hint.dy;
    const across = Math.abs((e.clientX - hint.x) * hint.dy - (e.clientY - hint.y) * hint.dx);
    if (speed > 1.15 && distance > 30) hint.dismissed = true;
    if (hint.dismissed || across > 48 || along < -24 || along > hint.reach + 100) {
      hint.progress = 0;
      hint.intent = 0;
      if (!pointerWithinUI) scheduleClose();
      return;
    }
    cancelClose();
    const forward = previous ? (e.clientX - previous.x) * hint.dx + (e.clientY - previous.y) * hint.dy : 0;
    if (forward > .2 && speed < .85) hint.intent += Math.min(elapsed, 32);
    else if (forward < -1) hint.intent = Math.max(0, hint.intent - elapsed);
    hint.progress = clamp((along - hint.start) / 48, 0, 1);
    if (hint.main && hint.progress) {
      const pull = hint.progress * 44;
      if (state.x + Math.min(0, hint.dx * pull) < MARGIN ||
          state.x + 72 + Math.max(0, hint.dx * pull) > viewWidth() - MARGIN ||
          state.y + Math.min(0, hint.dy * pull) < MARGIN ||
          state.y + 72 + Math.max(0, hint.dy * pull) > window.innerHeight - MARGIN) layout();
    }
    if (hint.progress === 1 && hint.intent >= 100) {
      const open = hint.open;
      if (hint.main && hint.dx) glass.open = Math.max(glass.open, glass.hint * .65);
      else if (flyout.hidden && branchBox) glass.branch = glass.hint * 44 /
        (hint.dx ? branchBox.width : branchBox.height);
      hint = null;
      open();
    }
  }
  function keepMenusOpen() {
    return prefs.power && prefs.controls === "pinned" && state.enabled && !state.capturing && !state.selecting && !state.dragging;
  }
  function openMenus(direction, immediate) {
    if (!prefs.power && direction !== "up") return;
    if (state.capturing || state.dragging) return;
    cancelClose();
    state.expanded = true;
    state.direction = direction;
    hint = null;
    const pinned = keepMenusOpen();
    for (const node of modeButtons) node.hidden = !node.dataset.mode || (!pinned && (direction === "up" || direction === "down"));
    flyout.hidden = true;
    primary.setAttribute("aria-expanded", "true");
    state.preview = state.mode;
    hoveredMode = null;
    branchAnchor = primary;
    if (pinned || alternate.hidden) {
      buildOptions(state.preview);
      flyout.hidden = false;
    }
    layout();
    syncMode();
    moveBubble(primary);
  }
  function openOptions(anchor, side, mode = anchor.dataset.mode || state.mode) {
    cancelClose();
    hint = null;
    state.preview = mode;
    hoveredMode = state.preview === "settings" ? null : state.preview;
    buildOptions(state.preview);
    flyout.hidden = false;
    branchAnchor = anchor;
    branchSide = side;
    layout();
    syncMode();
    moveBubble(anchor);
  }
  function cancelClose() { clearTimeout(closeTimer); }
  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => {
      const focused = shadow.activeElement;
      if (flyout.contains(focused) && focused.matches("input, textarea, select, :focus-visible") ||
          modeButtons.includes(focused) && focused.matches(":focus-visible")) return;
      if (Math.hypot(glass.x - state.x, glass.y - state.y) > 2) return scheduleClose();
      if (hoveredMode && hoveredMode !== state.mode && hoveredMode !== "settings" && state.expanded && !state.dragging && !state.capturing) {
        chooseMode(hoveredMode);
      }
      closeMenus();
    }, CLOSE_DELAY);
  }
  function closeMenus(force = false) {
    hoveredMode = null;
    if (hint) retractHint = hint;
    hint = null;
    cancelClose();
    if (!force && keepMenusOpen()) return openMenus(state.direction, false);
    state.expanded = false;
    for (const node of modeButtons) node.hidden = true;
    state.details = false;
    state.preview = state.mode;
    flyout.hidden = true;
    primary.setAttribute("aria-expanded", "false");
    syncMode();
    layout();
    moveBubble(primary);
    refreshInk();
  }
  function moveBubble(target) {
    if (!prefs.power) return;
    if (hint && target !== hint.anchor) { hint = null; wakeGlass(); }
    if (!target || target.hidden || hoveredButton === target) return;
    hoveredButton = target;
    if (state.mode === "settings" || target.dataset.mode === "settings") glass.tuneV += .16;
    if (state.mode === "wand" || target.dataset.mode === "wand") glass.magicV += .3;
    const r = target.getBoundingClientRect();
    const dest = [r.left, r.top, r.right, r.bottom];
    if (!glass.edges) glass.edges = [...dest];
    const cx = (glass.edges[0] + glass.edges[2]) / 2;
    const cy = (glass.edges[1] + glass.edges[3]) / 2;
    glass.destination = dest;
    glass.squeeze = prefs.motion === "liquid" ? 7 : 0; // anticipate, then release the leading edge before the tail
    glass.targetEdges = [cx - 12, cy - 12, cx + 12, cy + 12];
    wakeGlass();
  }
  function layout() {
    const width = viewWidth();
    state.x = clamp(state.x ?? width - 84, MARGIN, width - 72 - MARGIN);
    state.y = clamp(state.y, MARGIN, window.innerHeight - 72 - MARGIN);
    const opposite = { left: "right", right: "left", up: "down", down: "up" };
    const modeSide = keepMenusOpen() && (state.direction === "up" || state.direction === "down") ? state.modeDirection : state.direction;
    const horizontal = modeSide === "left" || modeSide === "right";
    const choices = modeButtons.filter((node) => node.dataset.mode);
    const reach = choices.length * 64;
    const room = { left: state.x - MARGIN, right: width - state.x - 72 - MARGIN,
      up: state.y - MARGIN, down: window.innerHeight - state.y - 72 - MARGIN };
    if (!keepMenusOpen() || state.direction === "left" || state.direction === "right") state.direction = modeSide;
    if (horizontal) state.modeDirection = modeSide;
    const offset = { left: [-64, 0], right: [64, 0], up: [0, -64], down: [0, 64] }[modeSide];
    const split = horizontal && room[modeSide] < reach;
    const preferredCount = horizontal ? Math.min(choices.length, Math.floor((room[modeSide] + 8) / 56)) : 0;
    const counts = horizontal ? { [modeSide]: preferredCount, [opposite[modeSide]]: choices.length - preferredCount } : {};
    const sideCount = { left: 0, right: 0 };
    choices.forEach((node, i) => {
      const side = split && i >= preferredCount ? opposite[modeSide] : modeSide;
      if (horizontal) sideCount[side]++;
      const step = horizontal && split ? Math.min(64, (room[side] + 8) / Math.max(1, counts[side])) : 64;
      const dx = horizontal ? (side === "left" ? -1 : 1) * sideCount[side] * step : 0;
      node.style.left = clamp(state.x + 8 + dx, MARGIN, width - 56 - MARGIN) - state.x + "px";
      node.style.top = clamp(state.y + 8 + offset[1] * (i + 1), MARGIN, window.innerHeight - 56 - MARGIN) - state.y + "px";
    });
    if (horizontal) modeOffsets = choices.map((node) => parseFloat(node.style.left) - 8);
    if (!flyout.hidden) layoutOptions(branchAnchor || primary);
    if (glass.x === null || state.dragging || reducedMotion()) { glass.x = state.x; glass.y = state.y; glass.xV = glass.yV = 0; }
    positionControls();
    refreshInk();
    wakeGlass();
  }
  function positionControls() {
    const x = glass.x ?? state.x, y = glass.y ?? state.y;
    toolbar.style.left = x + "px";
    toolbar.style.top = y + "px";
    if (branchBox) {
      flyout.style.left = branchBox.x + x - state.x + "px";
      flyout.style.top = branchBox.y + y - state.y + "px";
    }
    const pull = hint || retractHint;
    if (pull?.main) { pull.x = x + 36; pull.y = y + 36; }
  }
  function layoutOptions(anchor) {
    const width = viewWidth();
    const horizontal = false;
    flyout.classList.toggle("gfx-options-row", horizontal);
    // Transform animations change visual bounds, not the final layout footprint.
    const r = { left: state.x + toolbar.clientLeft + anchor.offsetLeft,
      top: state.y + toolbar.clientTop + anchor.offsetTop };
    r.right = r.left + anchor.offsetWidth;
    r.bottom = r.top + anchor.offsetHeight;
    // Keep edge clamping from changing the menu width after its height is measured.
    flyout.style.width = Math.max(60, Math.min(172, width - MARGIN * 2)) + "px";
    // Fit the menu on the roomier side without moving its trigger.
    flyout.style.maxWidth = horizontal ? Math.max(60,
      Math.max(r.left - MARGIN, width - MARGIN - r.right)) + "px" : "";
    const above = Math.max(0, r.top - MARGIN), below = Math.max(0, window.innerHeight - r.bottom - MARGIN);
    flyout.style.maxHeight = !horizontal ? Math.max(60, Math.max(above, below)) + "px" : "";
    flyout.style.left = "0px";
    flyout.style.top = "0px";
    const size = { width: flyout.offsetWidth, height: flyout.offsetHeight };
    let x, y;
    if (horizontal) {
      const right = r.right;
      branchSide = right + size.width <= width - MARGIN ? "right" : "left";
      x = branchSide === "right" ? right : r.left - size.width;
      y = r.top - 8;
    } else {
      x = r.left + (anchor.offsetWidth - size.width) / 2;
      branchSide = anchor !== primary ? branchSide : ["up", "down"].includes(state.direction) ? state.direction
        : r.top > window.innerHeight - r.bottom ? "up" : "down";
      if ((branchSide === "up" ? above : below) < size.height &&
          (branchSide === "up" ? below > above : above > below))
        branchSide = branchSide === "up" ? "down" : "up";
      y = branchSide === "down" ? r.bottom : r.top - size.height;
    }
    flyout.style.left = clamp(x, MARGIN, width - size.width - MARGIN) + "px";
    flyout.style.top = clamp(y, MARGIN, window.innerHeight - size.height - MARGIN) + "px";
    branchBox = { x: parseFloat(flyout.style.left), y: parseFloat(flyout.style.top), ...size };
    branchAnchor = anchor;
    positionControls();
    refreshInk();
    wakeGlass();
  }
  function buildOptions(mode) {
    flyout.replaceChildren();
    flyout.dataset.mode = mode;
    flyout.setAttribute("aria-label", mode === "settings" ? "General settings" : `${MODE_LABELS[mode]} options`);
    let controls;
    const group = (label) => {
      controls = el("div", { class: "gfx-setting-controls" });
      flyout.append(el("div", { class: "gfx-setting-group", role: "group", "aria-label": label },
        el("span", { class: "gfx-setting-label" }, label), controls));
    };
    const option = (label, icon, selected, update) => {
      const node = button(label, icon, () => {
        const focused = shadow.activeElement === node;
        update();
        const restoreFocus = focused && shadow.activeElement === node && !flyout.hidden;
        if (mode === "settings") glass.tuneV += .4;
        persist();
        syncMode();
        buildOptions(mode);
        layout();
        // Keep the options under the pointer when a preview commits a new mode.
        if (restoreFocus) Array.from(flyout.querySelectorAll("button"))
          .find((button) => button.getAttribute("aria-label") === label)?.focus({ preventScroll: true });
      }, { ...(selected === null ? {} : { "aria-pressed": String(selected) }), class: "gfx-btn gfx-option" });
      if (!icons[icon]) { node.textContent = icon; node.classList.add("gfx-option-text"); }
      node.addEventListener("pointerenter", () => moveBubble(node));
      node.addEventListener("focus", () => moveBubble(node));
      controls.append(node);
      return node;
    };
    if (mode === "camera") {
      group("Capture area");
      option("Selection", "selection", prefs.scope === "selection", () => { prefs.scope = "selection"; });
      option("Full page", "full", prefs.scope === "full", () => { prefs.scope = "full"; cancelSelection(); });
      group("Copy or save");
      option("Copy to clipboard", "clipboard", prefs.destination === "clipboard", () => { prefs.destination = "clipboard"; });
      option("Save PNG to Downloads", "download", prefs.destination === "download", () => { prefs.destination = "download"; });
    } else if (mode === "settings") {
      group("Glassy");
      option("Pause Glassy", "still", null, () => { prefs.power = false; disarmTool(false); });
      group("Feel");
      option("Liquid — smooth hover flow", "motion", prefs.motion === "liquid", () => { prefs.motion = "liquid"; prefs.controls = "hover"; });
      option("Snappy — quick, visible controls", "snappy", prefs.motion === "snappy", () => { prefs.motion = "snappy"; prefs.controls = "pinned"; });
      option("No motion — still, visible controls", "still", prefs.motion === "off", () => { prefs.motion = "off"; prefs.controls = "pinned"; });
      group("Controls everywhere");
      option("Reveal menus and toolbars on hover", "hover", prefs.controls === "hover", () => { prefs.controls = "hover"; });
      option("Keep menus and toolbars visible", "pin", prefs.controls === "pinned", () => { prefs.controls = "pinned"; });
    } else if (mode === "wand" && wandMarks.has(wandContext)) {
      const note = wandContext, mark = wandMarks.get(note);
      flyout.setAttribute("aria-label", "Selected element tools");
      group("This element");
      option("Edit attached note", "text", null, () => {
        closeMenus(true);
        note.querySelector(".gfx-note-body").focus({ preventScroll: true });
      });
      option("Smart markup: arrows, hold for rectangles, or sketch", "smart", null, () => {
        startOneOff("smart", note);
        closeMenus(true);
      });
      if (prefs.wandCapture) option("Capture element, note and markup", "camera", null, () => {
        offerWandCapture(note);
        runSave();
      });
      group("Selection color");
      for (const [label, color] of [["Blue", "#345b8c"], ["Red", "#ff6b7a"], ["Yellow", "#ffd166"]]) {
        const swatch = option(label, "color", mark.highlight.style.getPropertyValue("--wand-color") === color,
          () => mark.highlight.style.setProperty("--wand-color", color));
        swatch.style.color = color;
      }
      group("Selection opacity");
      controls.append(opacityControl("Selection opacity", Math.round(Number(mark.highlight.style.opacity || 1) * 100),
        (value) => { mark.highlight.style.opacity = value / 100; }));
      group("Finish");
      option("Delete selection and note", "trash", null, () => removeNote(note));
      option("Done — keep feedback and return Glassy", "close", null, () => {
        cancelSelection();
        leaveWandContext();
      });
    } else if (mode === "wand") {
      group("Highlight");
      option("Outline", "rectangle", prefs.wandStyle === "outline", () => { prefs.wandStyle = "outline"; });
      option("Color wash", "wash", prefs.wandStyle === "wash", () => { prefs.wandStyle = "wash"; });
      controls.append(colorDefaults(mode, "wandColor"));
      group("Attached note");
      option("Regular note", "text", prefs.wandNote === "regular", () => { prefs.wandNote = "regular"; });
      option("Inline with element outline", "inline", prefs.wandNote === "inline", () => { prefs.wandNote = "inline"; });
      group("After selecting");
      option("Offer a screenshot with note and markup", "camera", prefs.wandCapture, () => { prefs.wandCapture = true; });
      option("Highlight and note only", "text", !prefs.wandCapture, () => { prefs.wandCapture = false; cancelSelection(); });
    } else if (mode === "note") {
      group("Add notes");
      option("Place note anywhere", "note", prefs.notePlacement === "place", () => { prefs.notePlacement = "place"; });
      option("Associate note with element", "selection", prefs.notePlacement === "element", () => { prefs.notePlacement = "element"; });
    } else {
      group("Highlight elements to select");
      option("Element highlighting on — click to select, drag to draw", "selection", prefs.highlightElements, () => { prefs.highlightElements = true; });
      option("Element highlighting off — drawing only", "close", !prefs.highlightElements, () => { prefs.highlightElements = false; });
      group("New drawing color");
      controls.append(colorDefaults(mode, "drawingColor"));
      group("Notes on new drawings");
      option("Show associated note by default", "note", prefs.drawingNotes, () => { prefs.drawingNotes = true; });
      option("Keep associated note hidden by default", "close", !prefs.drawingNotes, () => { prefs.drawingNotes = false; });
    }
    refreshInk();
  }
  function colorDefaults(mode, key) {
    const label = key === "wandColor" ? "highlight" : "drawing";
    const controls = el("div", { class: "gfx-setting-controls" });
    const palette = el("div", { class: "gfx-color-palette", role: "group", "aria-label": `Choose a ${label} color`, hidden: "" });
    const pick = (color) => {
      const focused = flyout.contains(shadow.activeElement);
      prefs[key] = color;
      prefs.recentColors = [color, ...prefs.recentColors.filter((recent) => recent !== color)].slice(0, 2);
      persist();
      syncMode();
      buildOptions(mode);
      layout();
      if (focused) flyout.querySelector(`button[data-color="${color}"]`)?.focus({ preventScroll: true });
    };
    const swatch = (color, name) => {
      const node = button(name, "color", () => pick(color), {
        class: "gfx-btn gfx-option", "aria-pressed": String(color === prefs[key]),
        "data-color": color,
      });
      node.innerHTML = svg(`<circle cx="12" cy="12" r="8" fill="${color}"/>`);
      node.addEventListener("pointerenter", () => moveBubble(node));
      node.addEventListener("focus", () => moveBubble(node));
      return node;
    };
    for (const color of prefs.recentColors) controls.append(swatch(color, `Use recent color ${color}`));
    const change = button(`Change ${label} color`, "color", () => {
      palette.hidden = !palette.hidden;
      change.setAttribute("aria-expanded", String(!palette.hidden));
      layout();
    }, { class: "gfx-btn gfx-option", "aria-expanded": "false" });
    change.addEventListener("pointerenter", () => moveBubble(change));
    change.addEventListener("focus", () => moveBubble(change));
    controls.append(change, palette);
    for (const [name, color] of [["Purple", "#8b8bff"], ["Red", "#ff526b"], ["Yellow", "#ffd166"],
      ["Blue", "#345b8c"], ["Green", "#55d6a0"], ["Orange", "#ff9f55"], ["White", "#ffffff"], ["Charcoal", "#242a42"]])
      palette.append(swatch(color, name));
    return controls;
  }

  // One glass body, not a collection of detached cards. Trace the union of the
  // mode capsule and its perpendicular branch, rounding both outer corners and
  // the inside of the neck. The geometry stays attached throughout expansion.
  function glassOutline(rects, left, top) {
    const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap((r) => [r.y, r.y + r.height]))].sort((a, b) => a - b);
    const filled = (x, y) => x >= 0 && y >= 0 && x < xs.length - 1 && y < ys.length - 1 &&
      rects.some((r) => (xs[x] + xs[x + 1]) / 2 >= r.x && (xs[x] + xs[x + 1]) / 2 <= r.x + r.width &&
        (ys[y] + ys[y + 1]) / 2 >= r.y && (ys[y] + ys[y + 1]) / 2 <= r.y + r.height);
    const edges = new Map();
    const edge = (a, b) => edges.set(a.join(","), b);
    for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) edge([x, y], [x + 1, y]);
      if (!filled(x + 1, y)) edge([x + 1, y], [x + 1, y + 1]);
      if (!filled(x, y + 1)) edge([x + 1, y + 1], [x, y + 1]);
      if (!filled(x - 1, y)) edge([x, y + 1], [x, y]);
    }
    const start = edges.keys().next().value, points = [];
    let key = start;
    do {
      const [x, y] = key.split(",").map(Number);
      points.push([xs[x] - left, ys[y] - top]);
      key = edges.get(key)?.join(",");
    } while (key && key !== start && points.length <= edges.size);
    const corners = points.filter((p, i) => {
      const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    return corners.map((p, i) => {
      const a = corners[(i + corners.length - 1) % corners.length], b = corners[(i + 1) % corners.length];
      const before = Math.hypot(p[0] - a[0], p[1] - a[1]), after = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const concave = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) < 0;
      const radius = Math.min(concave ? 18 : 36, before / 2, after / 2);
      const entry = [p[0] + (a[0] - p[0]) * radius / before, p[1] + (a[1] - p[1]) * radius / before];
      const exit = [p[0] + (b[0] - p[0]) * radius / after, p[1] + (b[1] - p[1]) * radius / after];
      return `${i ? "L" : "M"}${entry.join(" ")}A${radius} ${radius} 0 0 ${concave ? 0 : 1} ${exit.join(" ")}`;
    }).join("") + "Z";
  }
  function hintDroplet() {
    const pull = hint || retractHint;
    if (!pull || glass.hint < .005) return null;
    const growth = clamp(glass.hint, 0, 1);
    const room = pull.dx ? (pull.dx > 0 ? viewWidth() - pull.x : pull.x)
      : (pull.dy > 0 ? window.innerHeight - pull.y : pull.y);
    const stretch = Math.min(growth * 44, Math.max(0, room - pull.reach - 2));
    const alongRadius = 36 + stretch / 2, acrossRadius = 36 - growth * 5;
    const center = pull.reach - 36 + stretch / 2;
    const cx = pull.x + pull.dx * center, cy = pull.y + pull.dy * center;
    const rx = pull.dx ? alongRadius : acrossRadius, ry = pull.dy ? alongRadius : acrossRadius;
    const point = (along, across, left, top) =>
      `${pull.x + pull.dx * along - pull.dy * across - left} ${pull.y + pull.dy * along + pull.dx * across - top}`;
    return { bounds: { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 },
      path: (left, top) => {
        const p = (along, across) => point(along, across, left, top);
        return `M${p(center + alongRadius, 0)}A${rx} ${ry} 0 1 1 ${p(center - alongRadius, 0)}` +
          `A${rx} ${ry} 0 1 1 ${p(center + alongRadius, 0)}Z`;
      } };
  }
  const glass = {
    x: null, xV: 0, y: null, yV: 0,
    open: 0, openV: 0, branch: 0, branchV: 0, width: 62, widthV: 0, height: 62, heightV: 0,
    edges: null, edgeV: [0, 0, 0, 0], destination: null, targetEdges: null, squeeze: 0, axis: 0,
    iris: 0, irisV: 0, shutter: 0, shutterV: 0, tune: 0, tuneV: 0, magic: 0, magicV: 0, pulse: 0, pulseV: 0, hint: 0, hintV: 0,
    leanX: 0, leanXV: 0, leanY: 0, leanYV: 0, frame: 0, last: 0, acc: 0, ink: [],
  };
  function refreshInk() {
    if (!inkLayer) return;
    root.style.setProperty("--gfx-tool-color", state.mode === "wand" && !state.oneOffTool ? prefs.wandColor : prefs.drawingColor);
    const label = hoveredButton?.getAttribute("aria-label");
    const buttons = [primary, ...modeButtons, ...(flyout.hidden ? [] : flyout.querySelectorAll("button"))].filter((b) => !b.closest("[hidden]"));
    inkLayer.replaceChildren();
    glass.ink = buttons.map((button) => {
      const glyph = el("span", { class: "gfx-glyph-dark", html: button.innerHTML });
      glyph.classList.toggle("gfx-option-text", button.classList.contains("gfx-option-text"));
      glyph.classList.toggle("gfx-glyph-main", button === primary || modeButtons.includes(button));
      inkLayer.append(glyph);
      return { button, glyph };
    });
    if (hoveredButton && !buttons.includes(hoveredButton)) {
      hoveredButton = null;
      moveBubble(buttons.find((b) => b.getAttribute("aria-label") === label) || primary);
    }
  }
  function wakeGlass() {
    if (!surface || glass.frame) return;
    glass.last = performance.now();
    glass.acc = 0;
    glass.frame = requestAnimationFrame(tickGlass);
  }
  function reducedMotion() {
    return !prefs.power || prefs.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function tickGlass(now) {
    const reduced = reducedMotion();
    const snappy = prefs.motion === "snappy";
    const anchor = hoveredButton?.isConnected && !hoveredButton.hidden ? hoveredButton : primary;
    const anchorRect = anchor.getBoundingClientRect();
    const px = pointerPosition ? pointerPosition.x - anchorRect.left - anchorRect.width / 2 : 0;
    const py = pointerPosition ? pointerPosition.y - anchorRect.top - anchorRect.height / 2 : 0;
    const distance = Math.hypot(px, py);
    const awareness = reduced || state.capturing || state.selecting || state.dragging ? 0 :
      distance < 42 ? .28 : Math.max(0, 1 - (distance - 42) / 220) * 4 / Math.max(1, distance);
    const targets = { x: state.x, y: state.y,
      open: state.expanded && !alternate.hidden ? 1 : 0, branch: flyout.hidden ? 0 : 1,
      width: branchBox?.width || 62, height: branchBox?.height || 62,
      iris: state.expanded ? 1 : 0, shutter: 0,
      tune: 0, magic: 0, pulse: 0, hint: hint?.progress || 0,
      leanX: px * awareness, leanY: py * awareness };
    const spring = (key, target, k = .14, damping = .78) => {
      if (snappy) { k = .32; damping = .38; }
      glass[key + "V"] = (glass[key + "V"] + (target - glass[key]) * k) * damping;
      glass[key] += glass[key + "V"];
    };
    if (hoveredButton?.isConnected && !hoveredButton.hidden) {
      const r = hoveredButton.getBoundingClientRect();
      const leanX = reduced ? 0 : glass.leanX, leanY = reduced ? 0 : glass.leanY;
      glass.destination = [r.left + leanX, r.top + leanY, r.right + leanX, r.bottom + leanY];
      const pull = hint || retractHint;
      if (pull && pull.anchor === hoveredButton) {
        const stretch = clamp(glass.hint, 0, 1) * 44;
        if (pull.dx < 0) glass.destination[0] -= stretch;
        if (pull.dx > 0) glass.destination[2] += stretch;
        if (pull.dy < 0) glass.destination[1] -= stretch;
        if (pull.dy > 0) glass.destination[3] += stretch;
      }
    }
    if (reduced) {
      for (const [key, value] of Object.entries(targets)) { glass[key] = value; glass[key + "V"] = 0; }
      glass.edges = glass.destination && [...glass.destination];
      glass.edgeV.fill(0);
      glass.squeeze = 0;
    } else {
      glass.acc += Math.min(80, now - glass.last) * (snappy ? 1.3 : .75);
      while (glass.acc >= 1000 / 60) {
        for (const [key, value] of Object.entries(targets))
          spring(key, value, key === "iris" ? .05 : key === "x" || key === "y" ? .13 : .14,
            key === "x" || key === "y" ? .55 : .78);
        if (glass.edges && glass.destination) {
          if (glass.squeeze > 0) glass.squeeze--;
          if (!glass.squeeze) glass.targetEdges = glass.destination;
          const t = glass.targetEdges;
          const dx = (t[0] + t[2] - glass.edges[0] - glass.edges[2]) / 2;
          const dy = (t[1] + t[3] - glass.edges[1] - glass.edges[3]) / 2;
          glass.axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
          const leading = glass.axis === 0 ? dx >= 0 ? 2 : 0 : dy >= 0 ? 3 : 1;
          for (let i = 0; i < 4; i++) {
            const k = snappy ? .32 : glass.squeeze ? .18 : i % 2 !== glass.axis ? .12 : i === leading ? .14 : .04;
            glass.edgeV[i] = (glass.edgeV[i] + (t[i] - glass.edges[i]) * k) * (snappy ? .38 : glass.squeeze ? .72 : .84);
            glass.edges[i] += glass.edgeV[i];
          }
        }
        glass.acc -= 1000 / 60;
      }
    }
    glass.last = now;
    drawGlass();
    const settled = !glass.squeeze && Object.entries(targets).every(([key, t]) =>
      Math.abs(t - glass[key]) < .01 && Math.abs(glass[key + "V"]) < .01) &&
      (!glass.edges || glass.edges.every((v, i) => Math.abs(v - glass.destination[i]) < .1 && Math.abs(glass.edgeV[i]) < .1));
    if (settled || !state.enabled || document.hidden || reduced) {
      if (!hint) retractHint = null;
      glass.frame = 0;
      return;
    }
    glass.frame = requestAnimationFrame(tickGlass);
  }
  function drawGlass() {
    positionControls();
    const dx = glass.x - state.x, dy = glass.y - state.y;
    const open = clamp(glass.open, 0, 1.08);
    const body = { x: glass.x, y: glass.y, width: 72, height: 72 };
    const start = Math.min(0, ...modeOffsets), end = Math.max(0, ...modeOffsets);
    body.x += start * open;
    body.width += (end - start) * open;
    const rects = [body], amount = clamp(glass.branch, 0, 1.04);
    if (branchBox && amount > .005) {
      const b = { ...branchBox, x: branchBox.x + dx, y: branchBox.y + dy,
        width: Math.max(1, glass.width), height: Math.max(1, glass.height) };
      if (branchSide === "right" || branchSide === "left") {
        b.y += (branchBox.height - b.height) / 2;
        if (branchSide === "left") b.x += branchBox.width - b.width * amount;
        b.width *= amount;
      } else {
        b.x += (branchBox.width - b.width) / 2;
        if (branchSide === "up") b.y += branchBox.height - b.height * amount;
        b.height *= amount;
      }
      if (modeButtons.includes(branchAnchor)) {
        b.x += (parseFloat(branchAnchor.style.left) - 8) * (open - 1);
      }
      rects.push(b);
    }
    for (const r of rects) {
      const right = Math.min(viewWidth() - 2, r.x + r.width), bottom = Math.min(window.innerHeight - 2, r.y + r.height);
      r.x = Math.max(2, r.x); r.y = Math.max(2, r.y);
      r.width = Math.max(1, right - r.x); r.height = Math.max(1, bottom - r.y);
    }
    const droplet = hintDroplet(), bounds = droplet ? [...rects, droplet.bounds] : rects;
    const left = Math.min(...bounds.map((r) => r.x)), top = Math.min(...bounds.map((r) => r.y));
    const width = Math.max(...bounds.map((r) => r.x + r.width)) - left;
    const height = Math.max(...bounds.map((r) => r.y + r.height)) - top;
    const outline = (x, y) => glassOutline(rects, x, y) + (droplet ? droplet.path(x, y) : "");
    const path = outline(left, top);
    for (const node of [surface, rim]) Object.assign(node.style, {
      left: left + "px", top: top + "px", width: width + "px", height: height + "px",
    });
    surface.style.clipPath = `path("${path}")`;
    const rimPath = rim.querySelector("path");
    rimPath.setAttribute("d", path);
    rimPath.setAttribute("fill", droplet ? "url(#gfx-rim)" : "none");
    rimPath.setAttribute("stroke", droplet ? "none" : "url(#gfx-rim)");
    if (droplet) rimPath.setAttribute("filter", "url(#gfx-water-rim)");
    else rimPath.removeAttribute("filter");
    // Icons are revealed by the growing water body, never floating ahead of it.
    toolbar.style.clipPath = `path("${outline(glass.x, glass.y)}")`;
    if (branchBox) flyout.style.clipPath = `path("${outline(branchBox.x + dx, branchBox.y + dy)}")`;
    inkLayer.style.clipPath = `path("${outline(0, 0)}")`;
    primary.style.transform = `scale(${1 + glass.pulse})`;
    const iris = aperturePath(clamp(glass.iris + glass.shutter, 0, 1.05));
    shadow.querySelectorAll(".gfx-aperture").forEach((p) => p.setAttribute("d", iris));
    shadow.querySelectorAll(".gfx-settings-top").forEach((p) => p.setAttribute("cx", clamp(9 + glass.tune * 4 + glass.leanX * .25, 6, 18)));
    shadow.querySelectorAll(".gfx-settings-bottom").forEach((p) => p.setAttribute("cx", clamp(15 - glass.tune * 4 - glass.leanX * .25, 6, 18)));
    shadow.querySelectorAll(".gfx-wand-body").forEach((p) => {
      p.style.transform = `rotate(${glass.magic * 12 + glass.leanX * .6}deg)`;
    });
    if (!glass.edges || !glass.destination) return;
    let [l, t, r, b] = glass.edges;
    const restW = glass.destination[2] - glass.destination[0], restH = glass.destination[3] - glass.destination[1];
    let w = clamp(r - l, 12, restW * 2.6), h = clamp(b - t, 12, restH * 2.6);
    if (glass.axis === 0) h *= clamp(1 - .6 * (w - restW) / restW, .55, 1.4);
    else w *= clamp(1 - .6 * (h - restH) / restH, .55, 1.4);
    l = clamp((l + r - w) / 2, 2, viewWidth() - w - 2);
    t = clamp((t + b - h) / 2, 2, window.innerHeight - h - 2);
    Object.assign(bubble.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px" });
    const boxes = glass.ink.map(({ button }) => button.getBoundingClientRect());
    glass.ink.forEach(({ glyph }, i) => {
      const box = boxes[i], overlap = box.right > l && box.left < l + w && box.bottom > t && box.top < t + h;
      Object.assign(glyph.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px",
        opacity: overlap ? "1" : "0", clipPath: `inset(${Math.max(0, t - box.top)}px ${Math.max(0, box.right - l - w)}px ${Math.max(0, box.bottom - t - h)}px ${Math.max(0, l - box.left)}px round 18px)` });
    });
  }
  function aperturePath(amount) {
    const radius = 1.3 + 5.3 * amount, twist = Math.PI / 6 * amount;
    const vertices = Array.from({ length: 6 }, (_, i) => {
      const a = twist + i * Math.PI / 3;
      return [12 + radius * Math.cos(a), 12 + radius * Math.sin(a)];
    });
    return "M" + vertices.map((p) => p.join(" ")).join("L") + "Z" + vertices.map((p, i) => {
      const a = twist + i * Math.PI / 3 + .72;
      return `M${p.join(" ")}L${12 + 8.6 * Math.cos(a)} ${12 + 8.6 * Math.sin(a)}`;
    }).join("");
  }
  function chooseMode(mode) {
    if (mode === "settings") {
      return primaryAction();
    }
    if (!MODES.includes(mode)) return;
    if (mode !== "wand") leaveWandContext();
    state.oneOffTool = null;
    state.oneOffOwner = null;
    smartShape = null;
    if (mode === "annotate" && state.mode !== "annotate") prefs.tool = prefs.defaultTool;
    state.mode = mode;
    cancelSelection();
    state.preview = mode;
    if (state.armed || mode === "annotate") armTool();
    else { state.editing = false; syncMode(); }
  }
  function keepToolActive() {
    clearTimeout(idleTimer);
  }
  function armTool() {
    state.armed = state.enabled && prefs.power;
    state.editing = state.armed;
    keepToolActive();
    syncMode();
  }
  function disarmTool(notify = true) {
    clearTimeout(idleTimer);
    state.armed = state.editing = false;
    state.oneOffTool = null;
    state.oneOffOwner = null;
    smartShape = null;
    leaveWandContext();
    if (annoLayer.contains(shadow.activeElement)) shadow.activeElement.blur();
    closeMenus(true);
    cancelSelection();
    syncMode();
    if (notify) showToast(`${MODE_LABELS[state.mode]} is inactive. Click Glassy to reactivate.`);
  }
  function updateCameraCursor() {
    if (!root) return;
    const selection = prefs.scope === "selection";
    const crosshair = selection ? '<path d="M5 1v8M1 5h8"/>' : "";
    const art = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" stroke="#242a42" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 14h5l2-3h6l2 3h4v14H10z" fill="#f4f5ff" stroke="white" stroke-width="4"/>
      <path d="M10 14h5l2-3h6l2 3h4v14H10z"/><circle cx="19.5" cy="21" r="4" fill="#8b8bff"/>
      <g stroke="white" stroke-width="3.5">${crosshair}</g>${crosshair}</svg>`;
    const cursor = `url("data:image/svg+xml,${encodeURIComponent(art)}") ${selection ? "5 5, crosshair" : "19 21, pointer"}`;
    root.style.setProperty("--gfx-camera-cursor", cursor);
  }
  function annotationTool() {
    return state.oneOffTool || (state.mode === "note" ? "text" : prefs.tool);
  }
  function syncMode() {
    const tool = annotationTool();
    const settingsOpen = state.expanded && state.preview === "settings";
    primary.innerHTML = icons[settingsOpen ? "settings" : state.mode];
    const label = settingsOpen ? "General settings"
      : state.mode === "camera"
      ? `Capture ${prefs.scope === "full" ? "full page" : "selection"} to ${prefs.destination === "clipboard" ? "clipboard" : "downloads"}`
      : state.mode === "note" ? prefs.notePlacement === "element" ? "Note: select an element to attach feedback" : "Note: click anywhere to add a note"
      : prefs.highlightElements ? "Annotate: click highlighted elements to select, or drag to draw" : "Annotate: smart arrows, rectangles and sketching";
    const idle = state.enabled && !state.armed;
    primary.title = !prefs.power ? "Glassy is paused — click to wake"
      : idle ? "Click Glassy to activate and show tool options" : label;
    primary.setAttribute("aria-label", primary.title);
    primary.dataset.mode = state.mode;
    const choices = MODES.filter((mode) => mode !== state.mode);
    modeButtons.forEach((node, i) => {
      const mode = choices[i];
      node.dataset.mode = mode || "";
      node.hidden = !mode || !state.expanded || (!keepMenusOpen() && (state.direction === "up" || state.direction === "down"));
      node.innerHTML = icons[mode] || "";
      node.title = MODE_LABELS[mode] || "";
      node.setAttribute("aria-label", node.title);
    });
    root.classList.toggle("gfx-motion-off", reducedMotion());
    root.classList.toggle("gfx-snappy", prefs.motion === "snappy");
    root.classList.toggle("gfx-toolbars-pinned", prefs.controls === "pinned");
    annoLayer.querySelectorAll('[data-item-action="capture"]').forEach((control) => {
      const note = control.closest(".gfx-note") || wandNoteFor(selectedShape);
      control.hidden = !prefs.wandCapture || !wandMarks.has(note);
    });
    annoLayer.querySelectorAll(".gfx-item-tools").forEach((tools) =>
      syncMarkupTools(tools, tools.closest(".gfx-note") || wandNoteFor(selectedShape)));
    shadow.querySelectorAll(".gfx-item-grip").forEach((grip) => {
      const expanded = prefs.controls === "pinned" || grip.parentElement.classList.contains("gfx-tools-open");
      grip.setAttribute("aria-expanded", String(expanded));
      grip.tabIndex = expanded ? -1 : 0;
    });
    root.classList.toggle("gfx-wand-mode", state.mode === "annotate" && prefs.highlightElements);
    root.classList.toggle("gfx-camera-mode", state.mode === "camera");
    root.classList.toggle("gfx-idle", idle);
    root.classList.toggle("gfx-powered-off", !prefs.power);
    root.classList.toggle("gfx-settings-visible", settingsOpen);
    updateCameraCursor();
    shadow.querySelector(".gfx-svg-defs svg")[reducedMotion() ? "pauseAnimations" : "unpauseAnimations"]();
    root.classList.toggle("gfx-editing", state.editing);
    annoLayer.querySelectorAll(".gfx-note-body").forEach((body) =>
      body.setAttribute("contenteditable", String(state.editing)));
    inputLayer.dataset.tool = state.mode === "camera" ? "camera" : tool;
    wandPreview.hidden = true;
    root.classList.remove("gfx-wand-pointing");
    if (!state.editing) selectShape(null);
    else positionShapeTools();
    if (!state.editing && !state.expanded) flyout.hidden = true;
    refreshInk();
    wakeGlass();
    renderSelection();
    if (chrome.runtime.isDemo) window.dispatchEvent(new CustomEvent("gfx-demo-state", {
      detail: { mode: state.mode, armed: state.armed },
    }));
  }
  function primaryAction() {
    if (draggingPointer || state.capturing) return;
    if (!prefs.power) {
      prefs.power = true;
      persist();
      armTool();
      closeMenus(true);
      return;
    }
    armTool();
    openMenus(state.modeDirection === "left" ? "left" : "right", true);
    openOptions(primary, state.y > window.innerHeight / 2 ? "up" : "down", state.mode);
  }
  function dragToolbar(e) {
    if (e.button !== 0 || !prefs.power) return;
    let moved = false;
    const start = { x: e.clientX, y: e.clientY, left: state.x, top: state.y };
    primary.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      moved = state.dragging = true;
      keepToolActive();
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
      keepToolActive();
      draggingPointer = moved;
      if (moved && keepMenusOpen()) openMenus(state.direction, false);
      setTimeout(() => { draggingPointer = false; }, 0);
    };
    primary.addEventListener("pointermove", move);
    primary.addEventListener("pointerup", end);
    primary.addEventListener("pointercancel", end);
    primary.addEventListener("lostpointercapture", end);
  }

  // Annotations use document CSS pixels. Moving the layer on scroll also works
  // when the host is in the browser top layer above a transformed site root.
  function opacityControl(label, value, onChange) {
    let pinned = false, dismissed = false, closeTimer;
    const control = el("div", { class: "gfx-opacity-control" });
    const slider = el("input", { type: "range", min: "15", max: "100", value: String(value),
      class: "gfx-item-opacity", "aria-label": label });
    const output = el("output", { class: "gfx-opacity-value" }, `${value}%`);
    const trigger = button(label, "opacity", () => {
      pinned = !pinned;
      dismissed = !pinned;
      reveal(pinned);
    }, { class: "gfx-note-btn", "aria-expanded": "false" });
    const panel = el("div", { class: "gfx-opacity-panel", hidden: "" }, slider, output);
    const reveal = (open) => {
      clearTimeout(closeTimer);
      if (open && control.closest(".gfx-shape-tools")) {
        shapeColors.hidden = true;
        shapeColorButton.setAttribute("aria-expanded", "false");
      }
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      control.closest(".gfx-item-tools")?.classList.toggle("gfx-opacity-open", open);
      if (control.closest(".gfx-options")) layout();
      if (control.closest(".gfx-shape-tools")) positionShapeTools();
    };
    const closeAfterLeave = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (control.matches(":hover")) return;
        dismissed = false;
        if (!pinned && !control.contains(shadow.activeElement)) reveal(false);
      }, 160);
    };
    control.addEventListener("pointerenter", () => { clearTimeout(closeTimer); if (!dismissed) reveal(true); });
    control.addEventListener("pointerleave", closeAfterLeave);
    control.addEventListener("focusin", () => { if (!dismissed) reveal(true); });
    control.addEventListener("focusout", closeAfterLeave);
    slider.addEventListener("input", () => { onChange(Number(slider.value)); syncOpacityControl(slider); });
    control.append(trigger, panel);
    syncOpacityControl(slider);
    return control;
  }
  function syncOpacityControl(slider) {
    const control = slider.closest(".gfx-opacity-control");
    control.style.setProperty("--opacity-fill", `${(Number(slider.value) - 15) / 85 * 100}%`);
    control.querySelector("output").textContent = `${slider.value}%`;
    const trigger = control.querySelector("button");
    trigger.title = `${slider.getAttribute("aria-label")}: ${slider.value}%`;
    trigger.setAttribute("aria-label", trigger.title);
  }
  function annotationToolbar({ label, class: extraClass, hidden = false, appearance, addNote, remove, opacity, onOpacity, owner }) {
    const tools = el("div", { class: `gfx-item-tools ${extraClass}`, role: "toolbar", "aria-label": label,
      ...(hidden ? { hidden: "" } : {}) });
    const add = el("div", { class: "gfx-item-actions", role: "group", "aria-label": "Add annotation" },
      button("Show drawing note", "note", addNote, { class: "gfx-note-btn", "data-item-action": "note" }),
      button("Smart markup: draw a line for an arrow; hold then drag for a rectangle", "smart", () => startOneOff("smart", owner?.()),
        { class: "gfx-note-btn", "data-item-action": "smart", hidden: "" }),
      button("Add a freehand drawing", "draw", () => startOneOff("draw", owner?.()), { class: "gfx-note-btn", "data-item-action": "draw" }),
      button("Draw rectangle outline", "rectangle", () => startOneOff("rectangle", owner?.()), { class: "gfx-note-btn", "data-item-action": "rectangle" }));
    const edit = el("div", { class: "gfx-item-actions", role: "group", "aria-label": "Appearance and delete" },
      appearance,
      opacityControl(`${label === "Note tools" ? "Note" : "Drawing"} opacity`, opacity, onOpacity),
      button("Prepare element screenshot", "camera", () => offerWandCapture(owner?.()),
        { class: "gfx-note-btn", "data-item-action": "capture", hidden: "" }),
      button(label === "Note tools" ? "Delete note" : "Delete drawing", "trash", remove, { class: "gfx-note-btn", "data-item-action": "delete" }));
    const lens = el("span", { class: "gfx-item-lens", "aria-hidden": "true" });
    const grip = el("button", { type: "button", class: "gfx-item-grip", "aria-label": `Show ${label.toLowerCase()}`, "aria-expanded": "false" });
    const expand = () => {
      tools.classList.add("gfx-tools-open");
      grip.setAttribute("aria-expanded", "true");
      grip.tabIndex = -1;
      if (tools === shapeTools) positionShapeTools();
    };
    grip.addEventListener("pointerenter", expand);
    grip.addEventListener("click", expand);
    tools.addEventListener("focusin", expand);
    tools.addEventListener("pointerenter", () => { syncMarkupTools(tools, owner?.()); hoverItemToolbar(tools, true); });
    const collapse = () => {
      if (tools.contains(shadow.activeElement)) return;
      tools.classList.remove("gfx-tools-open");
      grip.setAttribute("aria-expanded", String(prefs.controls === "pinned"));
      grip.tabIndex = prefs.controls === "pinned" ? -1 : 0;
      lens.style.opacity = "0";
    };
    const highlight = (e) => {
      const target = e.target.closest("button");
      if (!target || target === grip || !tools.contains(target)) { lens.style.opacity = "0"; return; }
      const r = target.getBoundingClientRect(), t = tools.getBoundingClientRect();
      Object.assign(lens.style, { left: r.left - t.left + "px", top: r.top - t.top + "px",
        width: r.width + "px", height: r.height + "px", opacity: "1" });
    };
    tools.addEventListener("pointerover", highlight);
    tools.addEventListener("focusin", highlight);
    tools.addEventListener("pointerleave", () => { collapse(); hoverItemToolbar(tools, false); });
    tools.addEventListener("focusout", () => setTimeout(() => { if (!tools.matches(":hover")) collapse(); }, 0));
    tools.append(grip, lens,
      el("div", { class: "gfx-item-row" }, add, edit));
    return tools;
  }
  function syncMarkupTools(tools, owner) {
    if (tools === shapeTools) {
      for (const action of ["smart", "draw", "rectangle", "capture"])
        tools.querySelector(`[data-item-action="${action}"]`).hidden = true;
      tools.querySelector('[data-item-action="note"]').hidden = false;
      return;
    }
    tools.querySelector('[aria-label="Add annotation"]').hidden = true;
    tools.querySelector('[data-item-action="capture"]').hidden = true;
  }
  function hoverItemToolbar(tools, hovered) {
    clearTimeout(toolbarTimers.get(tools));
    if (hovered) tools.classList.add("gfx-owner-hover");
    else toolbarTimers.set(tools, setTimeout(() => {
      if (tools.matches(":hover") || tools.contains(shadow.activeElement)) return;
      tools.classList.remove("gfx-owner-hover", "gfx-tools-open");
      const grip = tools.querySelector(".gfx-item-grip");
      grip.setAttribute("aria-expanded", String(prefs.controls === "pinned"));
      grip.tabIndex = prefs.controls === "pinned" ? -1 : 0;
    }, 220));
  }
  function wandEntry(node) {
    return [...wandMarks].find(([, mark]) => mark.highlight === node);
  }
  function wandNoteFor(node) {
    return [...wandMarks].find(([, mark]) => mark.highlight === node || mark.strokes.includes(node))?.[0];
  }
  function leaveWandContext() {
    if (!wandContext) return;
    wandContext = null;
    root.classList.remove("gfx-wand-context");
    syncMode();
    closeMenus(true);
    selectShape(null);
    renderSelection();
  }
  function enterWandContext(note) {
    if (state.mode !== "wand" || !wandMarks.has(note) || wandContext === note) return;
    wandContext = note;
    root.classList.add("gfx-wand-context");
    const mark = wandMarks.get(note);
    selectShape(mark.highlight);
    syncMode();
    openMenus("down", false);
    renderSelection();
  }
  function offerWandCapture(note) {
    if (!wandMarks.has(note)) return;
    if (state.mode === "camera") chooseMode("note");
    if (!state.armed) armTool();
    state.captureNote = note;
    state.selecting = false;
    updateWandCapture();
  }
  function updateWandCapture() {
    if (!state.captureNote || state.capturing) return;
    const note = state.captureNote, mark = wandMarks.get(note);
    if (!mark?.target.isConnected || !note.isConnected) return cancelSelection();
    const boxes = [mark.target.getBoundingClientRect(), note.getBoundingClientRect(),
      ...mark.strokes.filter((stroke) => stroke.isConnected).map((stroke) => stroke.getBoundingClientRect())];
    const left = Math.min(...boxes.map((r) => r.left)), top = Math.min(...boxes.map((r) => r.top));
    const right = Math.max(...boxes.map((r) => r.right)), bottom = Math.max(...boxes.map((r) => r.bottom));
    state.captureFits = left >= 0 && top >= 0 && right <= viewWidth() && bottom <= window.innerHeight;
    const x = clamp(left - 20, 0, viewWidth()), y = clamp(top - 20, 0, window.innerHeight);
    const w = Math.max(0, Math.min(right + 20, viewWidth()) - x);
    const h = Math.max(0, Math.min(bottom + 20, window.innerHeight) - y);
    if (state.sel?.left === x && state.sel?.top === y && state.sel?.w === w && state.sel?.h === h) return;
    state.sel = { left: x, top: y, w, h };
    renderSelection();
  }
  function itemBounds(node) {
    if (node.classList.contains("gfx-wand-mark")) {
      const entry = wandEntry(node);
      return { x: parseFloat(node.style.left), y: parseFloat(node.style.top), width: parseFloat(node.style.width),
        height: parseFloat(node.style.height) + (entry?.[1].inline ? entry[0].offsetHeight - 2 : 0) };
    }
    const box = node.getBBox();
    return { x: box.x + Number(node.dataset.x || 0), y: box.y + Number(node.dataset.y || 0), width: box.width, height: box.height };
  }
  function wandTarget(x, y) {
    return document.elementsFromPoint(x, y).find((node) => {
      if (node === host || node === document.documentElement || node === document.body ||
        /^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 4 && rect.height > 4;
    });
  }
  function updateWandPreview(e) {
    if (!wandPreview) return;
    const ownControl = e.composedPath().some((node) => node instanceof Element &&
      node.matches(".gfx-toolbar, .gfx-options, .gfx-note, .gfx-shape-tools, .gfx-wand-mark"));
    const active = state.enabled && state.armed && state.mode === "annotate" && prefs.highlightElements && !activePointers && !state.oneOffTool &&
      !state.capturing && !state.dragging && !ownControl;
    const target = active && wandTarget(e.clientX, e.clientY);
    wandPreview.hidden = !target;
    root.classList.toggle("gfx-wand-pointing", !!target);
    if (!target) return;
    const entry = [...wandMarks].find(([, mark]) => mark.target === target || mark.target.contains(target));
    if (entry) {
      wandPreview.hidden = true;
      return;
    }
    if (selectedShape?.classList.contains("gfx-wand-mark")) hoverItemToolbar(shapeTools, false);
    const r = target.getBoundingClientRect();
    Object.assign(wandPreview.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    wandPreview.style.setProperty("--wand-color", prefs.drawingColor);
    wandPreview.dataset.style = "outline";
  }
  function positionWandMarks() {
    for (const [note, mark] of wandMarks) {
      if (!note.isConnected) { mark.highlight.remove(); wandMarks.delete(note); continue; }
      mark.highlight.hidden = !mark.target.isConnected;
      if (!mark.target.isConnected) continue;
      const r = mark.target.getBoundingClientRect();
      mark.highlight.hidden = r.width < 1 || r.height < 1;
      if (mark.highlight.hidden) continue;
      const x = r.left + window.scrollX + Number(mark.highlight.dataset.x || 0),
        y = r.top + window.scrollY + Number(mark.highlight.dataset.y || 0);
      const bounds = `${x},${y},${r.width},${r.height},${mark.dx},${mark.dy}`;
      if (bounds === mark.bounds) continue;
      mark.bounds = bounds;
      Object.assign(mark.highlight.style, { left: x + "px", top: y + "px", width: r.width + "px", height: r.height + "px" });
      if (!mark.inline) {
        note.style.left = Math.max(0, x + (mark.edgeX ? r.width : 0) + mark.dx) + "px";
        note.style.top = Math.max(0, y + (mark.edgeY ? r.height : 0) + mark.dy) + "px";
      }
    }
    if (wandContext && !state.capturing) {
      const mark = wandMarks.get(wandContext);
      if (!mark?.target.isConnected || !wandContext.isConnected) leaveWandContext();
    }
    if (selectedShape?.classList.contains("gfx-wand-mark")) positionShapeTools();
    updateWandCapture();
  }
  function followWandMarks() {
    wandFrame = 0;
    if (!state.enabled || !wandMarks.size || document.hidden) return;
    positionWandMarks();
    wandFrame = requestAnimationFrame(followWandMarks);
  }
  function wakeWandMarks() {
    if (!wandFrame && state.enabled && wandMarks.size) wandFrame = requestAnimationFrame(followWandMarks);
  }
  function removeNote(note) {
    const associated = wandMarks.get(note);
    if (associated?.asDrawing) {
      note.querySelector(".gfx-note-body").replaceChildren();
      note.hidden = true;
      if (selectedShape === associated.highlight) selectShape(selectedShape);
      return;
    }
    if (wandContext === note) leaveWandContext();
    if (state.captureNote === note) cancelSelection();
    const mark = wandMarks.get(note);
    if (selectedShape === mark?.highlight) selectShape(null);
    mark?.highlight.remove();
    wandMarks.delete(note);
    note.remove();
  }
  function addWandNote(e) {
    const target = wandTarget(e.clientX, e.clientY);
    if (!target) return showToast("Try a text block, image, button, or another page element.");
    for (const [note, mark] of wandMarks) if (mark.target === target) {
      selectShape(mark.highlight);
      return;
    }
    const r = target.getBoundingClientRect();
    const x = r.left + window.scrollX, y = r.top + window.scrollY;
    let nx = prefs.wandPlacement === "beside" ? x + r.width + 12 : x;
    let ny = prefs.wandPlacement === "below" ? y + r.height + 12 : y;
    if (prefs.wandPlacement === "beside" && nx + 220 > window.scrollX + window.innerWidth - MARGIN) {
      if (r.left >= 244) nx = x - 232;
      else { nx = x; ny = y + r.height + 12; }
    }
    ny = clamp(ny, window.scrollY + MARGIN, window.scrollY + window.innerHeight - 180 - MARGIN);
    const highlight = el("div", { class: "gfx-wand-mark", "data-style": "outline", "aria-hidden": "true" });
    highlight.style.setProperty("--wand-color", prefs.drawingColor);
    highlight.style.opacity = "0.85";
    for (const side of ["top", "right", "bottom", "left"]) highlight.append(el("span", { class: "gfx-wand-edge", "data-side": side }));
    bindDrawing(highlight);
    annoLayer.append(highlight);
    const note = createNote(nx, ny, false);
    note.hidden = !prefs.drawingNotes;
    note.classList.add("gfx-wand-note");
    const inline = false;
    if (inline) {
      highlight.dataset.note = "inline";
      note.classList.add("gfx-wand-inline");
      note.style.left = "";
      note.style.top = "";
      note.style.width = "";
      highlight.append(note);
    }
    note.querySelector(".gfx-note-body").dataset.placeholder = "Feedback on this element…";
    const edgeX = nx >= x + r.width, edgeY = ny >= y + r.height;
    wandMarks.set(note, { target, highlight, inline, edgeX, edgeY, strokes: [], asDrawing: true,
      dx: inline ? 0 : parseFloat(note.style.left) - x - (edgeX ? r.width : 0),
      dy: inline ? 0 : parseFloat(note.style.top) - y - (edgeY ? r.height : 0) });
    drawingNotes.set(highlight, note);
    syncMarkupTools(note.querySelector(".gfx-note-bar"), note);
    positionWandMarks();
    wakeWandMarks();
    selectShape(highlight);
    wandPreview.hidden = true;
    clearTimeout(toolFeedbackTimer);
    root.classList.add("gfx-using-tool");
    toolFeedbackTimer = setTimeout(() => root.classList.remove("gfx-using-tool"), 600);
    glass.pulseV += .08;
    wakeGlass();
  }
  function positionAnnotations() {
    annoLayer.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`;
    positionWandMarks();
    positionShapeTools();
  }
  function addDrawingNote(shape) {
    const box = itemBounds(shape);
    const note = createNote(box.x + box.width + 12, box.y, false);
    drawingNotes.set(shape, note);
    return note;
  }
  function bindDrawing(path) {
    path.addEventListener("pointerenter", (ev) => {
      path.classList.remove("gfx-shape-ready");
      hoverDrawing(path, ev);
    });
    path.addEventListener("pointermove", (ev) => hoverDrawing(path, ev));
    path.addEventListener("pointerleave", () => {
      if (hoveredShape === path) { hoveredShape = null; clearTimeout(shapeHoverTimer); }
      if (selectedShape === path) hoverItemToolbar(shapeTools, false);
    });
    path.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || !state.editing || state.capturing) return;
      clearTimeout(shapeHoverTimer);
      if (!path.classList.contains("gfx-shape-ready")) { ev.stopPropagation(); return annotatePointer(ev); }
      ev.preventDefault();
      ev.stopPropagation();
      selectShape(path);
      const sx = ev.clientX + window.scrollX, sy = ev.clientY + window.scrollY;
      const ox = Number(path.dataset.x || 0), oy = Number(path.dataset.y || 0);
      const note = drawingNotes.get(path);
      const nx = note ? parseFloat(note.style.left) : 0, ny = note ? parseFloat(note.style.top) : 0;
      trackPointer(path, ev, (point) => {
        path.dataset.x = ox + point.clientX + window.scrollX - sx;
        path.dataset.y = oy + point.clientY + window.scrollY - sy;
        shapeHoverPoint = { x: point.clientX + window.scrollX, y: point.clientY + window.scrollY };
        if (path.classList.contains("gfx-wand-mark")) positionWandMarks();
        else {
          path.setAttribute("transform", `translate(${path.dataset.x} ${path.dataset.y})`);
          if (note?.isConnected) {
            note.style.left = nx + Number(path.dataset.x) - ox + "px";
            note.style.top = ny + Number(path.dataset.y) - oy + "px";
          }
        }
        positionShapeTools();
      });
    });
  }
  function hoverDrawing(shape, e) {
    if (!state.editing || state.capturing || activePointers) return;
    hoveredShape = shape;
    clearTimeout(shapeHoverTimer);
    const point = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY };
    shapeHoverTimer = setTimeout(() => {
      if (hoveredShape !== shape || !shape.isConnected || !state.editing || activePointers) return;
      shapeHoverPoint = point;
      smartShape = null;
      selectShape(shape);
      shape.classList.add("gfx-shape-ready");
      shapeTools.querySelector(".gfx-item-grip").click();
      positionShapeTools();
    }, 400);
  }
  function positionShapeTools() {
    if (!selectedShape?.isConnected || !shapeTools) return;
    const box = itemBounds(selectedShape);
    const x = shapeHoverPoint ? shapeHoverPoint.x + 12 : box.x;
    const y = shapeHoverPoint ? shapeHoverPoint.y + 12 : box.y + box.height + 10;
    shapeTools.style.left = clamp(x, window.scrollX + MARGIN,
      window.scrollX + window.innerWidth - shapeTools.offsetWidth - MARGIN) + "px";
    shapeTools.style.top = clamp(y, window.scrollY + MARGIN,
      window.scrollY + window.innerHeight - Math.max(shapeTools.offsetHeight, shapeTools.scrollHeight) - MARGIN) + "px";
  }
  function selectShape(shape) {
    if (shape !== selectedShape) {
      shapeColors.hidden = true;
      shapeColorButton.setAttribute("aria-expanded", "false");
      shapeTools.classList.remove("gfx-tools-open", "gfx-owner-hover");
    }
    selectedShape?.classList.remove("gfx-shape-selected");
    selectedShape = shape;
    shapeTools.hidden = !shape;
    if (!shape) { shapeHoverPoint = null; return; }
    const wand = shape.classList.contains("gfx-wand-mark");
    if (wand && state.mode === "wand") shapeTools.hidden = true;
    syncMarkupTools(shapeTools, wandNoteFor(shape));
    shapeTools.setAttribute("aria-label", wand ? "Associated element" : "Selected drawing");
    const grip = shapeTools.querySelector(".gfx-item-grip");
    grip.setAttribute("aria-label", wand ? "Show associated element tools" : "Show drawing tools");
    const expanded = prefs.controls === "pinned" || shapeTools.classList.contains("gfx-tools-open");
    grip.setAttribute("aria-expanded", String(expanded));
    grip.tabIndex = expanded ? -1 : 0;
    for (const [control, label] of [
      [shapeTools.querySelector('[data-item-action="note"]'), "Show or hide drawing note"],
      [shapeTools.querySelector('[data-item-action="delete"]'), "Delete drawing"],
      [shapeColorButton, wand ? "Selection color" : "Drawing color"],
    ]) { control.title = label; control.setAttribute("aria-label", label); }
    shapeTools.querySelector('[data-item-action="note"]').setAttribute("aria-pressed", String(!!drawingNotes.get(shape)?.isConnected && !drawingNotes.get(shape).hidden));
    const noteToggle = shapeTools.querySelector('[data-item-action="note"]');
    const noteVisible = noteToggle.getAttribute("aria-pressed") === "true";
    noteToggle.title = noteVisible ? "Hide drawing note" : "Show drawing note";
    noteToggle.setAttribute("aria-label", noteToggle.title);
    noteToggle.innerHTML = icons.note;
    shapeColorButton.style.color = wand ? shape.style.getPropertyValue("--wand-color") : shape.getAttribute("stroke");
    shapeOpacity.value = Math.round(Number(wand ? shape.style.opacity || 1 : shape.getAttribute("opacity") || 1) * 100);
    shapeOpacity.setAttribute("aria-label", wand ? "Selection opacity" : "Drawing opacity");
    syncOpacityControl(shapeOpacity);
    hoverItemToolbar(shapeTools, true);
    shape.classList.add("gfx-shape-selected");
    positionShapeTools();
  }
  function trackPointer(node, e, move, end) {
    node.setPointerCapture(e.pointerId);
    activePointers++;
    keepToolActive();
    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      keepToolActive();
      move(ev);
    };
    const onEnd = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onEnd);
      node.removeEventListener("pointercancel", onEnd);
      node.removeEventListener("lostpointercapture", onEnd);
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
      activePointers--;
      keepToolActive();
      end?.(ev);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onEnd);
    node.addEventListener("pointercancel", onEnd);
    node.addEventListener("lostpointercapture", onEnd);
  }
  function startOneOff(tool, owner = wandNoteFor(selectedShape)) {
    shadow.activeElement?.blur();
    if (!state.editing) chooseMode("annotate");
    state.oneOffTool = tool;
    smartShape = null;
    state.oneOffOwner = wandMarks.has(owner) ? owner : null;
    if (state.oneOffOwner && prefs.wandCapture) offerWandCapture(state.oneOffOwner);
    selectShape(null);
    syncMode();
    if (tool === "smart") showToast("Draw a line for an arrow. Hold briefly, then drag for a rectangle. Each gesture creates a separate shape.");
  }
  function annotatePointer(e) {
    if (e.button !== 0 || !state.editing || state.capturing) return;
    closeMenus();
    selectShape(null);
    e.preventDefault();
    const tool = annotationTool();
    const smart = tool === "smart";
    const continuing = smart && smartShape?.isConnected;
    const ox = continuing ? Number(smartShape.dataset.x || 0) : 0;
    const oy = continuing ? Number(smartShape.dataset.y || 0) : 0;
    const x = e.clientX + window.scrollX - ox, y = e.clientY + window.scrollY - oy;
    if (tool === "text") {
      state.oneOffTool = null;
      syncMode();
      createNote(x, y);
      return;
    }
    const path = continuing ? smartShape : document.createElementNS("http://www.w3.org/2000/svg", "path");
    const prefix = continuing ? path.getAttribute("d") + " " : "";
    let rectangle = tool === "rectangle";
    const started = performance.now(), points = [[x, y]];
    let moved = false;
    if (!continuing) {
      path.setAttribute("d", `M${x} ${y} l0.1 0.1`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", prefs.drawingColor);
      path.setAttribute("stroke-width", "4");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", "0.85");
      bindDrawing(path);
      drawingLayer.append(path);
      strokes.push(path);
      wandMarks.get(state.oneOffOwner)?.strokes.push(path);
    }
    if (smart) smartShape = path;
    let d = `M${x} ${y}`;
    clearTimeout(toolFeedbackTimer);
    root.classList.add("gfx-using-tool");
    trackPointer(inputLayer, e, (ev) => {
      const ex = ev.clientX + window.scrollX - ox, ey = ev.clientY + window.scrollY - oy;
      if (smart && !moved && Math.hypot(ex - x, ey - y) > 6) {
        rectangle = performance.now() - started >= 350;
        moved = true;
      }
      if (rectangle) {
        d = `M${x} ${y}H${ex}V${ey}H${x}Z`;
      } else for (const point of ev.getCoalescedEvents?.().length ? ev.getCoalescedEvents() : [ev]) {
        const px = point.clientX + window.scrollX - ox, py = point.clientY + window.scrollY - oy;
        points.push([px, py]);
        d += ` L${px} ${py}`;
      }
      path.setAttribute("d", prefix + d);
    }, (ev) => {
      if (smart && prefs.highlightElements && !state.oneOffTool && !moved && ev.type === "pointerup") {
        path.remove();
        const index = strokes.indexOf(path);
        if (index >= 0) strokes.splice(index, 1);
        smartShape = null;
        root.classList.remove("gfx-using-tool");
        return addWandNote(e);
      }
      if (smart && !rectangle && ev.type === "pointerup") {
        const [ex, ey] = points[points.length - 1], dx = ex - x, dy = ey - y;
        const distance = Math.hypot(dx, dy);
        const length = points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0);
        const deviation = distance ? points.reduce((max, [px, py]) => Math.max(max, Math.abs(dy * (px - x) - dx * (py - y)) / distance), 0) : 0;
        if (distance >= 18 && length <= distance * 1.15 && deviation <= Math.max(5, distance * .06)) {
          const angle = Math.atan2(dy, dx), head = Math.min(16, distance * .3);
          d = `M${x} ${y}L${ex} ${ey}M${ex - head * Math.cos(angle - .5)} ${ey - head * Math.sin(angle - .5)}L${ex} ${ey}L${ex - head * Math.cos(angle + .5)} ${ey - head * Math.sin(angle + .5)}`;
        }
      }
      path.setAttribute("d", prefix + d);
      root.classList.remove("gfx-using-tool");
      smartShape = null;
      if (!smart) { state.oneOffTool = null; state.oneOffOwner = null; }
      syncMode();
      if (prefs.drawingNotes && !drawingNotes.has(path)) addDrawingNote(path);
      if (state.editing) selectShape(path);
    });
  }
  function createNote(x, y, focus = true) {
    const note = el("div", { class: "gfx-note gfx-glass" });
    note.style.left = x + "px";
    note.style.top = y + "px";
    note.style.width = Math.min(220, window.innerWidth - 24) + "px";
    note.style.setProperty("--note-opacity", 0.15);
    note.classList.add("gfx-note-light");
    const body = el("div", { class: "gfx-note-body", contenteditable: "true",
      role: "textbox", "aria-multiline": "true", "aria-label": "Annotation text",
      "data-placeholder": "Type feedback…" });
    const bar = annotationToolbar({ label: "Note tools", class: "gfx-note-bar gfx-glass",
      owner: () => note,
      addNote: () => {
        const rect = note.getBoundingClientRect();
        if (!state.editing) chooseMode("annotate");
        state.oneOffTool = null;
        syncMode();
        createNote(rect.right + window.scrollX + 12, rect.top + window.scrollY);
      },
      appearance: button("Use dark note", "theme", (e) => {
        note.classList.toggle("gfx-note-light");
        const dark = !note.classList.contains("gfx-note-light");
        e.currentTarget.setAttribute("aria-pressed", String(dark));
        e.currentTarget.title = dark ? "Use light note" : "Use dark note";
        e.currentTarget.setAttribute("aria-label", e.currentTarget.title);
      }, { class: "gfx-note-btn", "aria-pressed": "false" }),
      remove: () => removeNote(note), opacity: 15,
      onOpacity: (value) => note.style.setProperty("--note-opacity", value / 100),
    });
    syncMarkupTools(bar, note);
    const format = el("div", { class: "gfx-note-format gfx-glass", role: "toolbar",
      "aria-label": "Format selected text", hidden: "" });
    for (const [label, command, glyph] of [
      ["Bold", "bold", "B"], ["Italic", "italic", "i"], ["Underline", "underline", "U"],
    ]) {
      const control = el("button", { type: "button", class: "gfx-note-btn", title: label,
        "aria-label": label, "data-command": command, "aria-pressed": "false" }, glyph);
      control.addEventListener("pointerdown", (e) => e.preventDefault());
      control.addEventListener("click", () => {
        if (!noteSelection || !body.contains(noteSelection.commonAncestorContainer)) return;
        const selection = shadow.getSelection?.() || document.getSelection();
        body.focus({ preventScroll: true });
        selection.removeAllRanges();
        selection.addRange(noteSelection);
        document.execCommand(command, false);
        updateNoteSelection();
      });
      format.append(control);
    }
    body.addEventListener("paste", (e) => {
      e.preventDefault();
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    });
    body.addEventListener("drop", (e) => e.preventDefault());
    body.addEventListener("input", () => {
      clearTimeout(toolFeedbackTimer);
      root.classList.add("gfx-using-tool");
      toolFeedbackTimer = setTimeout(() => root.classList.remove("gfx-using-tool"), 420);
    });
    body.addEventListener("focus", () => {
      if (state.oneOffTool) { state.oneOffTool = null; state.oneOffOwner = null; syncMode(); }
      const mark = wandMarks.get(note);
      selectShape(mark ? mark.highlight : null);
    });
    body.addEventListener("keyup", updateNoteSelection);
    body.addEventListener("pointerup", () => requestAnimationFrame(updateNoteSelection));
    note.addEventListener("pointermove", (e) => {
      const bottom = note.getBoundingClientRect().bottom - e.clientY;
      note.style.setProperty("--note-approach", clamp((64 - bottom) / 44, 0, 1));
    });
    note.addEventListener("pointerleave", () => note.style.setProperty("--note-approach", 0));
    note.addEventListener("pointerdown", (e) => {
      if (wandMarks.has(note)) enterWandContext(note);
      if (note.classList.contains("gfx-wand-inline")) return;
      if (e.button !== 0 || e.target.closest("button, input, .gfx-note-body, .gfx-note-format")) return;
      const rect = note.getBoundingClientRect();
      // Leave the native bottom-right resize grip available.
      if (e.clientX > rect.right - 16 && e.clientY > rect.bottom - 16) return;
      e.preventDefault();
      const sx = e.clientX + window.scrollX, sy = e.clientY + window.scrollY;
      const left = parseFloat(note.style.left), top = parseFloat(note.style.top);
      let lastX = e.clientX;
      note.classList.add("gfx-note-dragging");
      format.hidden = true;
      trackPointer(note, e, (ev) => {
        note.style.left = Math.max(0, left + ev.clientX + window.scrollX - sx) + "px";
        note.style.top = Math.max(0, top + ev.clientY + window.scrollY - sy) + "px";
        const mark = wandMarks.get(note);
        if (mark?.target.isConnected) {
          const r = mark.target.getBoundingClientRect();
          mark.dx = parseFloat(note.style.left) - r.left - window.scrollX - (mark.edgeX ? r.width : 0) - Number(mark.highlight.dataset.x || 0);
          mark.dy = parseFloat(note.style.top) - r.top - window.scrollY - (mark.edgeY ? r.height : 0) - Number(mark.highlight.dataset.y || 0);
        }
        note.style.setProperty("--note-tilt", clamp((ev.clientX - lastX) * .15, -3, 3) + "deg");
        lastX = ev.clientX;
      }, () => {
        note.classList.remove("gfx-note-dragging");
        note.style.setProperty("--note-tilt", "0deg");
      });
    });
    note.append(body, bar, format);
    annoLayer.append(note);
    note.style.left = Math.max(window.scrollX, Math.min(x, window.scrollX + window.innerWidth - note.offsetWidth - MARGIN)) + "px";
    if (focus) body.focus({ preventScroll: true });
    return note;
  }
  function updateNoteSelection() {
    if (!annoLayer) return;
    const selection = shadow.getSelection?.() || document.getSelection();
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
    noteSelection = range?.cloneRange() || null;
    annoLayer.querySelectorAll(".gfx-note").forEach((note) => {
      const body = note.querySelector(".gfx-note-body"), format = note.querySelector(".gfx-note-format");
      const active = range && body.contains(range.startContainer) && body.contains(range.endContainer);
      format.hidden = !active;
      if (active) format.querySelectorAll("button").forEach((control) => {
        const command = control.dataset.command;
        control.setAttribute("aria-pressed", String(document.queryCommandState(command)));
      });
    });
  }

  // Selection has its own explicit capture/cancel controls and stays adjustable.
  function cameraPointer(e) {
    if (e.button !== 0 || !state.armed || state.capturing) return;
    e.preventDefault();
    closeMenus();
    if (prefs.scope === "selection") return startRegion(e);
    const x = e.clientX, y = e.clientY;
    let moved = false;
    trackPointer(inputLayer, e, (ev) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 5) moved = true;
    }, (ev) => { if (ev.type === "pointerup" && !moved) runSave(); });
  }
  function startRegion(e) {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    state.selecting = true;
    state.sel = null;
    renderSelection();
    trackPointer(selectionLayer, e, (ev) => {
      const ex = clamp(ev.clientX, 0, window.innerWidth), ey = clamp(ev.clientY, 0, window.innerHeight);
      state.sel = { left: Math.min(x, ex), top: Math.min(y, ey), w: Math.abs(ex - x), h: Math.abs(ey - y) };
      renderSelection();
    }, (ev) => {
      if (ev.type !== "pointerup" || !state.sel || state.sel.w < 6 || state.sel.h < 6) {
        cancelSelection();
        return;
      }
      renderSelection();
    });
  }
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
    captureButton = button("Capture selected region (Enter)", "camera", () => runSave(), { class: "gfx-btn" });
    clearButton = button("Clear selection and try again", "close", () => {
      cancelSelection();
      keepToolActive();
    });
    cropSize = el("span", { class: "gfx-crop-size", "aria-hidden": "true" });
    const controls = el("div", { class: "gfx-crop-actions gfx-glass", role: "toolbar", "aria-label": "Selected region" },
      cropSize, captureButton, clearButton);
    crop.append(controls);
    crop.addEventListener("pointerdown", (e) => {
      if (!state.captureNote && !e.target.closest("button, .gfx-handle")) editSelection(e, "move");
    });
    layer.addEventListener("pointerdown", (e) => {
      if (state.captureNote || e.button !== 0 || e.target.closest(".gfx-crop")) return;
      startRegion(e);
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
    inputLayer.classList.toggle("gfx-on", state.enabled && state.armed && !state.selecting && !state.capturing);
    const wand = !!state.captureNote && state.armed;
    selectionLayer.classList.toggle("gfx-on", state.selecting || wand);
    selectionLayer.classList.toggle("gfx-wand-capture", wand);
    const label = wand ? "Capture element, note and markup" : "Capture selected region (Enter)";
    captureButton.title = label;
    captureButton.setAttribute("aria-label", label);
    clearButton.title = wand ? "Dismiss screenshot frame — keep note and markup" : "Clear selection and try again";
    clearButton.setAttribute("aria-label", clearButton.title);
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
    controls.setAttribute("aria-label", wand ? "Wand screenshot" : "Selected region");
    cropSize.textContent = `${Math.round(s.w)} × ${Math.round(s.h)}`;
    const width = controls.offsetWidth, height = controls.offsetHeight;
    controls.style.left = clamp(s.left + (s.w - width) / 2, MARGIN, vw - width - MARGIN) - s.left + "px";
    const top = wand && s.top - height - 8 >= MARGIN ? s.top - height - 8
      : s.top + s.h + height + 8 <= vh - MARGIN ? s.top + s.h + 8
      : s.top - height - 8 >= MARGIN ? s.top - height - 8 : s.top + s.h - height - 8;
    controls.style.top = clamp(top, MARGIN, vh - height - MARGIN) - s.top + "px";
  }
  function cancelSelection() {
    const wasSelecting = state.selecting;
    state.selecting = false;
    state.sel = null;
    state.captureNote = null;
    renderSelection();
    if (toast) toast.classList.remove("gfx-on");
    if (wasSelecting && keepMenusOpen()) openMenus(state.direction, false);
  }
  function keyDown(e) {
    if (!state.enabled || state.capturing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      const menuWasOpen = state.expanded;
      closeMenus(true);
      if (!menuWasOpen && state.armed) disarmTool();
      return;
    }
    if (e.composedPath().some((node) => node.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName))) return;
    if (e.composedPath().some((node) => /^(BUTTON|A)$/.test(node.tagName))) return;
    if (state.selecting && state.sel && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      state.sel.left = clamp(state.sel.left + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0), 0, window.innerWidth - state.sel.w);
      state.sel.top = clamp(state.sel.top + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0), 0, window.innerHeight - state.sel.h);
      keepToolActive();
      renderSelection();
    }
    if ((state.selecting || state.captureNote) && state.sel && (e.code === "Space" || e.key === "Enter")) {
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
      scrollbar: [node.style.getPropertyValue("scrollbar-color"), node.style.getPropertyPriority("scrollbar-color")],
    }));
    styles.forEach(({ node }) => {
      node.style.setProperty("scroll-behavior", "auto", "important");
      node.style.setProperty("scroll-snap-type", "none", "important");
      node.style.setProperty("scrollbar-color", "transparent transparent", "important");
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
        if (img.width !== first.width || img.height !== first.height) throw new Error("Capture scale changed. Keep the window on the same screen and try again.");
        if (Math.max(doc.scrollHeight, document.body?.scrollHeight || 0, viewH) !== fullH) {
          throw new Error("Page height changed while capturing. Let the page finish loading, then try again or use Selection.");
        }
        const start = Math.max(covered, actual), end = Math.min(fullH, actual + viewH);
        if (actual > covered + 1 || end <= covered) throw new Error("This page cannot be scrolled for a full-page capture. Use Selection.");
        const sourceY = Math.round((start - actual) * sy);
        const destY = Math.round(start * sy), endY = Math.min(canvas.height, Math.round(end * sy));
        ctx.drawImage(img, 0, sourceY, img.width, endY - destY, 0, destY, canvas.width, endY - destY);
        covered = end;
        if (covered >= fullH) break;
        window.scrollTo({ left: previous.x, top: Math.min(covered, fullH - viewH), behavior: "instant" });
        await paint();
        await sleep(80); // The worker owns Chrome's capture quota; wait here only for page paint.
        const requestedY = window.scrollY;
        img = await visibleImage();
        if (window.scrollY !== requestedY || window.scrollX !== previous.x) {
          throw new Error("The page moved during capture. Try again.");
        }
      }
      return canvas;
    } finally {
      window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
      styles.forEach(({ node, behavior, snap, scrollbar }) => {
        for (const [key, value] of [["scroll-behavior", behavior], ["scroll-snap-type", snap], ["scrollbar-color", scrollbar]]) {
          if (value[0]) node.style.setProperty(key, ...value);
          else node.style.removeProperty(key);
        }
      });
      positionAnnotations();
      wakeWandMarks();
    }
  }
  async function runSave() {
    if (state.capturing) return;
    keepToolActive();
    if (state.captureNote) updateWandCapture();
    if (state.captureNote && !state.captureFits)
      return showToast("Bring the whole element, note and markup into view before capturing. Move the note or scroll; for a very large element, choose a smaller one.", true);
    const captureNote = state.captureNote;
    const scope = captureNote ? "selection" : prefs.scope, destination = prefs.destination, sel = state.sel && { ...state.sel };
    if (scope === "selection" && !sel) return primaryAction();
    glass.shutterV += .4;
    wakeGlass();
    if (chrome.runtime.isDemo) {
      closeMenus();
      if (!captureNote) cancelSelection();
      showToast("You're trying the web demo. Real screenshots, clipboard copy, and image downloads are available in the Chrome extension on supported pages.", true);
      toast.classList.add("gfx-demo-notice");
      toast.append(el("div", { class: "gfx-demo-actions" },
        el("a", { href: "https://chromewebstore.google.com/detail/glass-feedback/kihjocbmloocaobeiaimofhpfkaheoan",
          target: "_blank", rel: "noopener noreferrer" }, "Get the Chrome extension"),
        el("button", { type: "button", onclick: () => toast.classList.remove("gfx-on") }, "Got it")));
      return;
    }
    state.capturing = true;
    closeMenus();
    state.selecting = false;
    root.classList.add("gfx-capturing");
    primary.disabled = true;
    let exported = false;
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
      if (!copied) {
        const dataUrl = canvas.toDataURL("image/png");
        await message({ type: "GFX_DOWNLOAD", dataUrl, saveAs: false,
          filename: `glass-feedback_${new Date().toISOString().replace(/[:.]/g, "-")}.png` });
      }
      exported = true;
      showToast(copied ? "Copied to clipboard" : destination === "clipboard" ? "Clipboard blocked — image download started" : "Image download started");
    } catch (err) {
      showToast("Capture failed: " + err.message, true);
    } finally {
      root.classList.remove("gfx-capturing");
      primary.disabled = false;
      state.capturing = false;
      keepToolActive();
      state.sel = exported ? null : sel;
      if (exported) state.captureNote = null;
      if (exported && captureNote) leaveWandContext();
      state.selecting = !exported && !captureNote && scope === "selection" && !!sel;
      renderSelection();
      if (keepMenusOpen()) openMenus("down", false);
    }
  }
  function showToast(text, sticky = false) {
    clearTimeout(toastTimer);
    toast.classList.remove("gfx-demo-notice");
    toast.textContent = text;
    toast.classList.add("gfx-on");
    if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("gfx-on"), 3500);
  }
  async function setEnabled(on) {
    if (state.enabled === on) return;
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
      armTool();
      if (keepMenusOpen()) openMenus("down", false);
      else layout();
      updateCameraCursor();
      positionAnnotations();
      wakeWandMarks();
      hoveredButton = null;
      moveBubble(primary);
    } else {
      clearTimeout(idleTimer);
      state.armed = false;
      closeMenus();
      cancelSelection();
      state.editing = false;
      state.mode = "camera";
      syncMode();
      wandPreview.hidden = true;
      cancelAnimationFrame(wandFrame);
      wandFrame = 0;
      host.hidePopover();
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "GFX_TOGGLE_UI" && msg?.type !== "GFX_SET_ENABLED") return;
    if (msg.type === "GFX_SET_ENABLED" && typeof msg.enabled !== "boolean") return;
    toggleQueue = toggleQueue.catch(() => {}).then(async () => {
      while (state.capturing) await sleep(50);
      await setEnabled(msg.type === "GFX_SET_ENABLED" ? msg.enabled : !state.enabled);
      sendResponse({ ok: true, enabled: state.enabled });
    }).catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  });
  function syncActivation() {
    toggleQueue = toggleQueue.catch(() => {}).then(async () => {
      const { gfxEnabled } = await chrome.storage.local.get("gfxEnabled");
      while (state.capturing) await sleep(50);
      await setEnabled(gfxEnabled === true);
    }).catch((err) => console.warn("Glass Feedback: could not restore activation", err));
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.gfxEnabled) syncActivation();
  });
  syncActivation();
})();
