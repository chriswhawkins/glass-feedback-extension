/*
 * Glass Feedback — content script.
 * Injects a Shadow-DOM floating toolbar with three tools:
 *   • select  — draw/crop a region (rest of page dims + blurs)
 *   • text    — drop resizable, themable annotation notes anchored to the page
 *   • save    — capture the selection or the full page → clipboard or download
 *
 * captureVisibleTab + downloads live in the service worker (background.js);
 * we message it for those.
 */
(() => {
  "use strict";
  if (window.__gfxInjected) return;
  window.__gfxInjected = true;

  const MARGIN = 12; // edge-pin gap
  const CLICK_SLOP = 4; // px of movement that still counts as a click
  const CAPTURE_DELAY = 520; // ms between full-page captures (~2/sec quota)
  const MAX_CANVAS = 16384; // conservative canvas dimension cap

  // ---------- tiny helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextPaint = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // Fixed-timestep so spring animations run at the SAME wall-clock speed on any
  // display refresh rate (60Hz, 120Hz ProMotion, etc.). One STEP == one legacy
  // 60fps frame of spring math; a per-animation SPEED (<1 = slower) scales how
  // much sim-time elapses per real second.
  const STEP_MS = 1000 / 60;
  const setCap = (node, id) => {
    try {
      node.setPointerCapture(id);
    } catch {}
  };
  const relCap = (node, id) => {
    try {
      node.releasePointerCapture(id);
    } catch {}
  };
  async function fetchDataUrl(url) {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function")
        node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const kid of kids) if (kid) node.append(kid);
    return node;
  }

  // ---------- icons ----------
  const ICONS = {
    // camera aperture (iris) — the inner blades are drawn by the aperture
    // controller and animate open/closed with the toolbar's state.
    aperture: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.3"/><path class="gfx-iris" d=""/></svg>`,
    lens: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><path d="M9 9.5a3 3 0 0 1 2-1.5"/></svg>`,
    select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke-dasharray="0.1 4"/><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`,
    text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V5h14v1M12 5v14M9 19h6"/></svg>`,
    save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 19h14"/></svg>`,
    contrast: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" stroke="none"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>`,
  };

  // ---------- state ----------
  const state = {
    enabled: false,
    built: false,
    collapsed: true,
    activeTool: null, // 'select' | 'text' | null
    pin: { edge: "right", perp: 120, flip: true }, // toolbar anchor (flip = open left)
    sel: null, // {left, top, w, h} in viewport CSS px
    pending: null, // armed capture awaiting a key: 'selection' | 'full' | null
  };

  // Hint text shown while a capture is armed (Space = copy, Shift+Space = save).
  const DRAW_HINT = "Drag to crop · drag again to restart";
  const CAPTURE_HINT = "Space to copy · Shift + Space to save";

  let host, shadow, root, toolbar, pill, toolsWrap, selLayer, cropEl, annoLayer;
  let placeLayer, cropHintEl, toast, liquidEl;
  let darkGlyphs = []; // [{btn, el}] dark glyph clones, clipped to the bubble
  let refractFilterReady = false;
  const btn = {}; // tool buttons

  // =====================================================================
  // BUILD
  // =====================================================================
  async function build() {
    host = el("div", { id: "gfx-host", style: "all: initial;" });
    // host itself: a positioned, zero-size anchor at the document origin so
    // absolutely-positioned notes scroll with the page.
    host.style.cssText =
      "all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
    shadow = host.attachShadow({ mode: "open" });

    // Load the stylesheet and the lens map together. The map is inlined as a
    // same-document data: URI so the SVG refraction filter is never tainted by
    // the cross-origin chrome-extension:// resource on real pages.
    const cssUrl = chrome.runtime.getURL("content/content.css");
    const mapUrl = chrome.runtime.getURL("assets/lens-map.png");
    let cssText = "";
    let mapDataUrl = "";
    try {
      [cssText, mapDataUrl] = await Promise.all([
        fetch(cssUrl).then((r) => r.text()),
        fetchDataUrl(mapUrl).catch(() => ""),
      ]);
    } catch (err) {
      console.warn("Glass Feedback: stylesheet load failed", err);
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    shadow.adoptedStyleSheets = [sheet];

    root = el("div", { class: "gfx-root" });
    shadow.append(buildSvgDefs(mapDataUrl), root);

    annoLayer = el("div", { class: "gfx-annotations" });
    selLayer = buildSelectLayer();
    placeLayer = el("div", { class: "gfx-place-layer", onpointerdown: onPlaceText });
    toolbar = buildToolbar();
    toast = el("div", { class: "gfx-toast gfx-glass" });

    root.append(annoLayer, selLayer, placeLayer, toolbar, toast);
    document.documentElement.append(host);

    applyPin();
    setCollapsed(true);
    window.addEventListener("resize", () => {
      applyPin();
      if (state.sel) renderSelection();
    });
    document.addEventListener("keydown", onKeyDown, true);
    state.built = true;
  }

  function buildSvgDefs(mapDataUrl) {
    // Liquid-glass refraction: a generated lens displacement map (clear center,
    // bend at the rim) drives feDisplacementMap to refract the backdrop like a
    // real lens. feImage fills the filter region (stretched to the element); the
    // map is inlined as a data: URI to avoid cross-origin filter taint.
    const wrap = el("div", { class: "gfx-svg-defs" });

    // Iridescent ink for the active (under-glass) glyph: a slowly rotating,
    // semi-transparent navy→violet→slate gradient. The transparency lets the
    // shifting refractive glass beneath read through the strokes, and the slow
    // rotation gives a living shimmer even at rest. Used via CSS stroke:url(#gfx-iris).
    const irisSpin = reduceMotion()
      ? ""
      : `<animateTransform attributeName="gradientTransform" type="rotate"
            values="0 .5 .5;360 .5 .5" dur="11s" repeatCount="indefinite"/>`;
    const iris = `
    <linearGradient id="gfx-iris" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#283561" stop-opacity="0.92"/>
      <stop offset="0.42" stop-color="#3d2b62" stop-opacity="0.78"/>
      <stop offset="0.72" stop-color="#272453" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#16223c" stop-opacity="0.92"/>
      ${irisSpin}
    </linearGradient>`;

    if (!mapDataUrl) {
      // No map → no refraction; base frosted blur (.gfx-glass) still applies.
      wrap.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="0" height="0"><defs>${iris}</defs></svg>`;
      return wrap;
    }
    refractFilterReady = true;
    // Chrome-only liquid glass: a pure lens. feImage supplies the displacement
    // map (clear center, bend at the rim); feDisplacementMap bends the backdrop
    // through it. No chromatic-aberration recombination — that screen-blended
    // red/blue copies and left an unbalanced magenta cast over neutral content.
    wrap.innerHTML = `
<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="0" height="0">
  <defs>
    <filter id="gfx-refract" x="-20%" y="-20%" width="140%" height="140%"
            color-interpolation-filters="sRGB">
      <feImage href="${mapDataUrl}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="52"
                         xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    ${iris}
  </defs>
</svg>`;
    return wrap;
  }

  // ---------- toolbar ----------
  function buildToolbar() {
    pill = el("div", {
      class: "gfx-pill",
      role: "button",
      tabindex: "0",
      title: "Glass Feedback",
      "aria-label": "Glass Feedback toolbar",
      "aria-expanded": "false",
      html: ICONS.aperture,
    });
    aperture.path = pill.querySelector(".gfx-iris");
    drawAperture(); // render the initial (closed) iris

    btn.select = el("button", {
      class: "gfx-btn",
      style: "--i:0",
      title: "Select region",
      "aria-label": "Select region",
      "aria-pressed": "false",
      html: ICONS.select,
      onclick: () => toggleTool("select"),
    });
    btn.text = el("button", {
      class: "gfx-btn",
      style: "--i:1",
      title: "Add text note",
      "aria-label": "Add text note",
      "aria-pressed": "false",
      html: ICONS.text,
      onclick: () => toggleTool("text"),
    });
    btn.save = el("button", {
      class: "gfx-btn",
      style: "--i:3",
      title: "Capture full page",
      "aria-label": "Capture full page",
      html: ICONS.save,
      onclick: armFullPage,
    });

    // The liquid selection bubble — a glass blob that slides between tools on
    // click. It sits ABOVE the buttons (z-index 2) so its refraction lens bends
    // the toolbar/page behind it; the crisp dark glyph is layered above it again.
    liquidEl = el("div", { class: "gfx-liquid", "aria-hidden": "true" });

    toolsWrap = el(
      "div",
      {
        class: "gfx-tools",
        role: "toolbar",
        "aria-label": "Glass Feedback tools",
        "aria-orientation": "horizontal",
      },
      liquidEl,
      btn.select,
      btn.text,
      el("div", { class: "gfx-sep", style: "--i:2" }),
      btn.save
    );

    // dark "under the glass" glyph per tool. It's a clone of the icon, hidden by
    // default and revealed only where the liquid bubble overlaps it (clip-path is
    // updated every frame in drawLiquid). This makes the black enter/leave WITH
    // the glass shape as it slides — not snap on/off via a class.
    // It lives ABOVE the bubble (sibling of liquidEl, higher z-index) so the
    // refraction lens doesn't smear it — the dark glyph stays crisp while the
    // bubble still refracts the page behind it. Each glyph is positioned over its
    // button per-frame in drawLiquid.
    darkGlyphs = [
      [btn.select, ICONS.select],
      [btn.text, ICONS.text],
      [btn.save, ICONS.save],
    ].map(([b, icon]) => {
      const g = el("span", {
        class: "gfx-glyph-dark",
        "aria-hidden": "true",
        html: icon,
      });
      toolsWrap.append(g);
      return { btn: b, el: g };
    });

    const bar = el("div", { class: "gfx-toolbar gfx-glass" }, pill, toolsWrap);

    // Only add backdrop refraction if the engine keeps url() in backdrop-filter.
    // The base .gfx-glass blur stays as the floor either way, so a dropped/failed
    // filter ref can never leave the toolbar with no frosting.
    const probe = document.createElement("div");
    probe.style.backdropFilter = "blur(1px) url(#gfx-refract)";
    if (refractFilterReady && (probe.style.backdropFilter || "").includes("url(")) {
      bar.classList.add("gfx-glass--refract");
      liquidEl.classList.add("gfx-liquid--refract");
    }

    // pill = drag handle AND expand toggle (pointer + keyboard)
    pill.addEventListener("pointerdown", startToolbarDrag);
    pill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setCollapsed(!state.collapsed);
        pillPop(0.6);
      }
    });
    return bar;
  }

  function setCollapsed(c) {
    state.collapsed = c;
    toolbar.classList.toggle("gfx-collapsed", c);
    pill.setAttribute("aria-expanded", String(!c));
    setAperture(!c); // iris opens when the tool row is open
    if (c) {
      // collapsing also exits any active tool
      setTool(null);
    }
    // re-pin after width change, then settle the liquid bubble on the active tool
    requestAnimationFrame(() => {
      applyPin();
      syncLiquid();
    });
  }

  function applyPin() {
    const { edge, perp, flip } = state.pin;
    toolbar.classList.remove(
      "gfx-edge-left",
      "gfx-edge-right",
      "gfx-edge-top",
      "gfx-edge-bottom"
    );
    toolbar.classList.add("gfx-edge-" + edge);
    // direction must be set BEFORE measuring so the pill ends up where expected
    toolbar.classList.toggle("gfx-rev", !!flip);
    const s = toolbar.style;
    s.transform = "";
    s.left = s.right = s.top = s.bottom = "";
    const rect = toolbar.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (edge === "left" || edge === "right") {
      const y = clamp(perp, MARGIN, vh - rect.height - MARGIN);
      s.top = y + "px";
      s[edge] = MARGIN + "px";
    } else {
      // top/bottom: anchor the pill's end (left when opening right, right when
      // opening left) so growing the row keeps the pill pinned in its corner.
      s[edge] = MARGIN + "px";
      const off = clamp(perp, MARGIN, vw - rect.width - MARGIN);
      s[flip ? "right" : "left"] = off + "px";
    }
  }

  // ---------- toolbar drag + click ----------
  function startToolbarDrag(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const last = { x: e.clientX, y: e.clientY };
    let moved = false;
    toolbar.classList.add("gfx-dragging");
    setCap(pill, e.pointerId);
    motion.press = true;
    wake();

    // Drag via transform only (cheap): no per-frame layout / backdrop re-sample.
    // We reconcile to edge-anchored left/top once, on drop (snapToEdge).
    const onMove = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) > CLICK_SLOP) moved = true;
      if (!moved) return;
      toolbar.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      // feed pointer velocity to the pill for jelly squash/stretch
      motion.dragging = true;
      motion.vx = ev.clientX - last.x;
      motion.vy = ev.clientY - last.y;
      last.x = ev.clientX;
      last.y = ev.clientY;
      wake();
    };
    const onUp = (ev) => {
      relCap(pill, ev.pointerId);
      pill.removeEventListener("pointermove", onMove);
      pill.removeEventListener("pointerup", onUp);
      toolbar.classList.remove("gfx-dragging");
      motion.press = false;
      motion.dragging = false;
      if (!moved) {
        setCollapsed(!state.collapsed); // tap = expand/collapse
        pillPop(0.6); // big springy pop on tap
        return;
      }
      snapToEdge();
      pillPop(0.34); // bounce on landing
    };
    pill.addEventListener("pointermove", onMove);
    pill.addEventListener("pointerup", onUp);
  }

  function snapToEdge() {
    const rect = toolbar.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const d = {
      left: rect.left,
      right: vw - rect.right,
      top: rect.top,
      bottom: vh - rect.bottom,
    };
    const edge = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
    const perp =
      edge === "left" || edge === "right" ? rect.top : rect.left;
    state.pin = { edge, perp };
    applyPin();
  }

  // ---------- pill personality (spring physics) ----------
  // The pill stays calm at rest and does NOT react to hover/proximity — the
  // glyph sits smaller inside the bubble. Personality comes from *interaction*:
  // a springy pop when tapped/dropped and a jelly squash/stretch while dragged.
  // When the tool row is open the effect is dialed way down so the bubble can't
  // crowd the tool icons. JS owns the transform so springs can overshoot.
  const motion = {
    scale: 1,
    scaleV: 0,
    vx: 0,
    vy: 0,
    press: false,
    dragging: false,
    pulse: 0,
    running: false,
  };

  const reduceMotion = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function wake() {
    if (reduceMotion()) return;
    if (!motion.running) {
      motion.running = true;
      requestAnimationFrame(tickMotion);
    }
  }

  function tickMotion() {
    // dial the whole effect down once expanded so it can't crowd the tools
    const calm = state.collapsed ? 1 : 0.4;
    let target = 1 + motion.pulse;
    if (motion.press) target = 1 - 0.14 * calm;

    // under-damped spring → bouncy overshoot
    motion.scaleV = (motion.scaleV + (target - motion.scale) * 0.22) * 0.7;
    motion.scale += motion.scaleV;

    motion.pulse *= 0.84;
    motion.vx *= 0.8;
    motion.vy *= 0.8;

    // jelly squash/stretch along the drag direction
    const sx =
      1 +
      (clamp(Math.abs(motion.vx) * 0.014, 0, 0.45) -
        clamp(Math.abs(motion.vy) * 0.008, 0, 0.25)) *
        calm;
    const sy =
      1 +
      (clamp(Math.abs(motion.vy) * 0.014, 0, 0.45) -
        clamp(Math.abs(motion.vx) * 0.008, 0, 0.25)) *
        calm;

    pill.style.transform = `scale(${(motion.scale * sx).toFixed(3)}, ${(
      motion.scale * sy
    ).toFixed(3)})`;

    const settled =
      Math.abs(target - motion.scale) < 0.001 &&
      Math.abs(motion.scaleV) < 0.001 &&
      motion.pulse < 0.001 &&
      Math.abs(motion.vx) < 0.1 &&
      Math.abs(motion.vy) < 0.1 &&
      !motion.dragging &&
      !motion.press;
    if (settled) {
      pill.style.transform = "";
      motion.scale = 1;
      motion.scaleV = 0;
      motion.running = false;
      return;
    }
    requestAnimationFrame(tickMotion);
  }

  function pillPop(amount) {
    motion.pulse += amount * (state.collapsed ? 1 : 0.4);
    wake();
  }

  // ---------- camera aperture (the pill glyph) ----------
  // A 6-blade iris that opens when the tool row opens and closes when it
  // collapses. The blade geometry is nonlinear in the open amount, so we tween
  // a single 0..1 value with a slightly springy snap and recompute the path.
  const aperture = {
    t: 0,
    tV: 0,
    target: 0,
    running: false,
    path: null,
    acc: 0,
    lastT: 0,
  };
  const APERTURE_SPEED = 0.3; // <1 = slower iris; refresh-rate independent

  function aperturePath(t) {
    const cx = 12;
    const cy = 12;
    const R = 8.6; // blade-seam outer radius
    const rMin = 1.3; // hole radius when closed
    const rMax = 6.6; // hole radius when open
    const N = 6;
    const r = rMin + (rMax - rMin) * t;
    const phi = (Math.PI / 6) * t; // up to a 30° twist as it opens
    const delta = 0.72; // tangential seam offset → spiral blades
    const step = (2 * Math.PI) / N;
    const V = [];
    for (let i = 0; i < N; i++) {
      const a = phi + i * step;
      V.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    let d =
      "M" + V.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + "Z";
    for (let i = 0; i < N; i++) {
      const a = phi + i * step;
      const wx = cx + R * Math.cos(a + delta);
      const wy = cy + R * Math.sin(a + delta);
      d += `M${V[i][0].toFixed(2)} ${V[i][1].toFixed(2)}L${wx.toFixed(
        2
      )} ${wy.toFixed(2)}`;
    }
    return d;
  }

  function drawAperture() {
    if (aperture.path)
      aperture.path.setAttribute("d", aperturePath(clamp(aperture.t, 0, 1.05)));
  }

  function setAperture(open) {
    aperture.target = open ? 1 : 0;
    if (reduceMotion()) {
      aperture.t = aperture.target;
      drawAperture();
      return;
    }
    if (!aperture.running) {
      aperture.running = true;
      aperture.acc = 0;
      aperture.lastT = performance.now();
      requestAnimationFrame(tickAperture);
    }
  }

  function stepAperture() {
    aperture.tV = (aperture.tV + (aperture.target - aperture.t) * 0.12) * 0.74;
    aperture.t += aperture.tV;
  }

  function tickAperture(now) {
    let dt = now - aperture.lastT;
    aperture.lastT = now;
    if (dt > 100) dt = 100;
    aperture.acc += dt * APERTURE_SPEED;
    let steps = 0;
    while (aperture.acc >= STEP_MS && steps < 8) {
      stepAperture();
      aperture.acc -= STEP_MS;
      steps++;
    }
    drawAperture();
    if (
      Math.abs(aperture.target - aperture.t) < 0.002 &&
      Math.abs(aperture.tV) < 0.002
    ) {
      aperture.t = aperture.target;
      drawAperture();
      aperture.running = false;
      return;
    }
    requestAnimationFrame(tickAperture);
  }

  // ---------- liquid selection bubble ----------
  // A glass blob that follows your clicks across the tool row. It's modelled as
  // two independent edges (left/right): whichever edge is *leading* (in the
  // direction of travel) is stiff and snaps fast, while the *trailing* edge is
  // soft and lags behind — so the bubble stretches horizontally and pinches
  // vertically like a slinky, then the back catches up. The first reveal grows
  // out of the main pill; deactivating retracts it back into the pill.
  const liquid = {
    left: 0,
    leftV: 0,
    right: 0,
    rightV: 0,
    targetLeft: 0,
    targetRight: 0,
    restW: 72, // resting width = a tool button (for stretch math)
    shown: 0, // 0..1 appearance
    shownV: 0,
    targetShown: 0,
    h: 1, // vertical scale (its own bouncy spring → squash/stretch)
    hV: 0,
    windup: 0, // wind-up squeeze frames remaining before a move launches
    destLeft: 0, // real destination, stashed during the wind-up
    destRight: 0,
    running: false,
    acc: 0, // fixed-timestep accumulator
    lastT: 0,
  };
  // how much sim-time passes per real second; lower = slower slide
  const LIQUID_SPEED = .75;
  const WINDUP_STEPS = 15; // ~150ms anticipation squeeze at the origin

  // center x of the main pill, expressed in toolsWrap's coordinate space (pill
  // and toolsWrap share an offsetParent: the toolbar). This is the origin the
  // bubble grows from / retracts into.
  function pillOriginX() {
    return pill.offsetLeft - toolsWrap.offsetLeft + pill.offsetWidth / 2;
  }

  function liquidTo(node) {
    if (!node) return retractLiquid();
    const destL = node.offsetLeft;
    const destR = node.offsetLeft + node.offsetWidth;
    liquid.restW = node.offsetWidth;
    liquid.targetShown = 1;

    // first reveal: emerge from the pill (no wind-up squeeze — it grows out)
    if (liquid.shown < 0.02) {
      const o = pillOriginX();
      liquid.left = liquid.right = o;
      liquid.leftV = liquid.rightV = 0;
      liquid.windup = 0;
      liquid.targetLeft = destL;
      liquid.targetRight = destR;
      liquid.hV += 0.05;
      if (reduceMotion()) return snapLiquid();
      return wakeLiquid();
    }

    if (reduceMotion()) {
      liquid.windup = 0;
      liquid.targetLeft = destL;
      liquid.targetRight = destR;
      return snapLiquid();
    }

    // ANTICIPATION: before leaving the origin, squeeze in — contract the width
    // toward the current center; volume-conservation then springs the height up
    // (tall + narrow). After WINDUP_STEPS we release toward the destination, so
    // it launches into the wide/short slinky stretch and bounces home.
    const cx = (liquid.left + liquid.right) / 2;
    const sq = Math.max(18, liquid.restW * 0.4);
    liquid.windup = WINDUP_STEPS;
    liquid.destLeft = destL;
    liquid.destRight = destR;
    liquid.targetLeft = cx - sq / 2;
    liquid.targetRight = cx + sq / 2;
    liquid.hV += 0.04;
    wakeLiquid();
  }

  function retractLiquid() {
    // collapse both edges back toward the pill origin and fade out
    const o = pillOriginX();
    liquid.windup = 0;
    liquid.targetLeft = liquid.targetRight = o;
    liquid.targetShown = 0;
    if (reduceMotion()) return snapLiquid();
    wakeLiquid();
  }

  function snapLiquid() {
    liquid.left = liquid.targetLeft;
    liquid.right = liquid.targetRight;
    liquid.leftV = liquid.rightV = 0;
    liquid.shown = liquid.targetShown;
    liquid.shownV = 0;
    liquid.h = 1;
    liquid.hV = 0;
    liquid.windup = 0;
    drawLiquid();
    liquid.running = false;
  }

  function drawLiquid() {
    const rawW = Math.max(0, liquid.right - liquid.left);
    const appear = clamp(liquid.shown, 0, 1);
    // cap the elongation so long travels stay an elegant blob (not a thin ribbon);
    // anchor the leading edge so the cap trims the trailing side.
    const maxW = liquid.restW * 2.6;
    const w = Math.min(rawW, maxW);
    const movingRight =
      (liquid.targetLeft + liquid.targetRight) / 2 >=
      (liquid.left + liquid.right) / 2;
    const leftPx =
      rawW > maxW && movingRight ? liquid.right - w : liquid.left;
    const sy = clamp(liquid.h * (0.55 + 0.45 * appear), 0.3, 1.6);

    // Clip each dark glyph to the bubble's footprint over its button (read all
    // geometry first to avoid layout thrash, then write). bl/br are the bubble's
    // left/right in toolsWrap coords — the same space as button.offsetLeft and
    // the bubble's own translateX, so a settled bubble clips exactly its button.
    const bl = leftPx;
    const br = leftPx + w;
    const boxes = darkGlyphs.map(({ btn }) => ({
      x: btn.offsetLeft,
      y: btn.offsetTop,
      w: btn.offsetWidth,
      h: btn.offsetHeight,
    }));
    const clips = boxes.map(({ x: bx, w: bw, h: bh }) => {
      if (br <= bx || bl >= bx + bw) return null; // bubble not over this tool
      const li = clamp(bl - bx, 0, bw);
      const ri = clamp(bx + bw - br, 0, bw);
      const vi = Math.max(0, (bh - bh * sy) / 2);
      return `inset(${vi.toFixed(1)}px ${ri.toFixed(1)}px ${vi.toFixed(
        1
      )}px ${li.toFixed(1)}px round 18px)`;
    });

    liquidEl.style.opacity = appear.toFixed(3);
    liquidEl.style.width = w.toFixed(2) + "px";
    liquidEl.style.transform = `translateX(${leftPx.toFixed(
      2
    )}px) scaleY(${sy.toFixed(3)})`;
    darkGlyphs.forEach((g, i) => {
      const c = clips[i];
      const b = boxes[i];
      // overlay the glyph exactly on its button (glyph is a sibling of the bubble
      // now, not a child of the button)
      g.el.style.left = b.x + "px";
      g.el.style.top = b.y + "px";
      g.el.style.width = b.w + "px";
      g.el.style.height = b.h + "px";
      g.el.style.opacity = c ? appear.toFixed(3) : "0";
      if (c) g.el.style.clipPath = c;
    });
  }

  function wakeLiquid() {
    if (!liquid.running) {
      liquid.running = true;
      liquid.acc = 0;
      liquid.lastT = performance.now();
      requestAnimationFrame(tickLiquid);
    }
  }

  // one spring iteration. Leading edge (in the travel direction) is stiff/fast;
  // trailing edge is soft/slow → the slinky stretch + lag.
  function stepLiquid() {
    const LEAD = 0.14;
    const TRAIL = 0.04;
    const DAMP = 0.84;

    // wind-up: hold at the origin and squeeze in; release toward the real
    // destination once the anticipation frames are spent.
    if (liquid.windup > 0) {
      liquid.windup--;
      if (liquid.windup === 0) {
        liquid.targetLeft = liquid.destLeft;
        liquid.targetRight = liquid.destRight;
      }
    }
    const squeezing = liquid.windup > 0;

    const center = (liquid.left + liquid.right) / 2;
    const targetCenter = (liquid.targetLeft + liquid.targetRight) / 2;
    const movingRight = targetCenter - center >= 0;
    // squeeze: both edges pull in evenly & firmly (extra-damped so it settles
    // into the squish without overshooting to a sliver). travel: leading edge
    // stiff, trailing edge soft → the slinky stretch + lag.
    const leftK = squeezing ? 0.18 : movingRight ? TRAIL : LEAD;
    const rightK = squeezing ? 0.18 : movingRight ? LEAD : TRAIL;
    const damp = squeezing ? 0.72 : DAMP;

    liquid.leftV = (liquid.leftV + (liquid.targetLeft - liquid.left) * leftK) * damp;
    liquid.left += liquid.leftV;
    liquid.rightV =
      (liquid.rightV + (liquid.targetRight - liquid.right) * rightK) * damp;
    liquid.right += liquid.rightV;

    const ds = liquid.targetShown - liquid.shown;
    liquid.shownV = (liquid.shownV + ds * 0.18) * 0.7;
    liquid.shown += liquid.shownV;

    // vertical scale: a volume-conservation spring — narrower than rest → TALLER,
    // wider than rest → shorter. Under-damped so it overshoots (bounce). This is
    // what makes the squeeze rise tall and the stretch flatten out.
    const w = Math.max(0, liquid.right - liquid.left);
    const horizStretch = clamp((w - liquid.restW) / liquid.restW, -0.65, 1.4);
    const restH = 1 - 0.6 * horizStretch;
    liquid.hV = (liquid.hV + (restH - liquid.h) * 0.14) * 0.84;
    liquid.h = clamp(liquid.h + liquid.hV, 0.4, 1.55);
  }

  function tickLiquid(now) {
    let dt = now - liquid.lastT;
    liquid.lastT = now;
    if (dt > 100) dt = 100; // ignore long stalls (tab backgrounded, etc.)
    liquid.acc += dt * LIQUID_SPEED;
    let steps = 0;
    while (liquid.acc >= STEP_MS && steps < 8) {
      stepLiquid();
      liquid.acc -= STEP_MS;
      steps++;
    }
    drawLiquid();

    const settled =
      liquid.windup === 0 &&
      Math.abs(liquid.targetLeft - liquid.left) < 0.1 &&
      Math.abs(liquid.targetRight - liquid.right) < 0.1 &&
      Math.abs(liquid.leftV) < 0.1 &&
      Math.abs(liquid.rightV) < 0.1 &&
      Math.abs(liquid.targetShown - liquid.shown) < 0.002 &&
      Math.abs(liquid.shownV) < 0.002 &&
      Math.abs(1 - liquid.h) < 0.004 &&
      Math.abs(liquid.hV) < 0.004;
    if (settled) return snapLiquid();
    requestAnimationFrame(tickLiquid);
  }

  // Where should the bubble rest right now? Active mode tool, else retract.
  function syncLiquid() {
    let target = null;
    if (!state.collapsed) {
      if (state.pending === "full") target = btn.save;
      else if (state.activeTool === "select") target = btn.select;
      else if (state.activeTool === "text") target = btn.text;
    }
    // The dark glyph follows the bubble's actual shape (clipped per-frame in
    // drawLiquid) — so we only need to point the bubble at its target here.
    if (target) liquidTo(target);
    else retractLiquid();
  }

  // ---------- tool switching ----------
  function toggleTool(name) {
    setTool(state.activeTool === name ? null : name);
  }
  function setTool(name) {
    state.activeTool = name;
    btn.select.classList.toggle("gfx-active", name === "select");
    btn.text.classList.toggle("gfx-active", name === "text");
    btn.select.setAttribute("aria-pressed", String(name === "select"));
    btn.text.setAttribute("aria-pressed", String(name === "text"));
    selLayer.classList.toggle("gfx-on", name === "select");
    placeLayer.classList.toggle("gfx-on", name === "text");
    if (name !== "select") {
      // keep existing selection visible even when leaving the tool? No —
      // hide the dimming chrome but remember the rect for saving.
      selLayer.classList.toggle("gfx-on", false);
      if (state.pending === "selection") disarmCapture();
    }
    syncLiquid();
  }

  function onKeyDown(e) {
    if (!state.enabled) return;
    // An armed capture is waiting: Space copies, Shift+Space saves to a folder.
    if (state.pending) {
      if (e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        const scope = state.pending;
        const dest = e.shiftKey ? "download" : "clipboard";
        disarmCapture();
        runSave(scope, dest);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        disarmCapture();
        return;
      }
    }
    if (e.key === "Escape" && state.activeTool) setTool(null);
  }

  // =====================================================================
  // SELECT TOOL
  // =====================================================================
  function buildSelectLayer() {
    const layer = el("div", { class: "gfx-select-layer" });
    const masks = ["top", "right", "bottom", "left"].map((k) =>
      el("div", { class: "gfx-mask", "data-m": k })
    );
    cropEl = el("div", { class: "gfx-crop", hidden: "" });
    cropHintEl = el("div", { class: "gfx-dim-hint", html: DRAW_HINT });
    cropEl.append(cropHintEl);
    const dirs = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (const dir of dirs) {
      const h = el("div", { class: "gfx-handle", "data-dir": dir });
      h.style.cssText += handlePos(dir);
      h.addEventListener("pointerdown", (e) => startResize(e, dir));
      cropEl.append(h);
    }
    layer.append(...masks, cropEl);
    layer.addEventListener("pointerdown", onSelectPointerDown);
    cropEl.addEventListener("pointerdown", startMoveCrop);
    return layer;
  }

  function handlePos(dir) {
    const map = {
      nw: "left:0;top:0;",
      n: "left:50%;top:0;",
      ne: "left:100%;top:0;",
      e: "left:100%;top:50%;",
      se: "left:100%;top:100%;",
      s: "left:50%;top:100%;",
      sw: "left:0;top:100%;",
      w: "left:0;top:50%;",
    };
    return map[dir] + "transform:translate(-50%,-50%);";
  }

  function onSelectPointerDown(e) {
    if (e.target.closest(".gfx-crop")) return; // handled by move/resize
    if (e.button !== 0) return;
    e.preventDefault();
    const ox = e.clientX;
    const oy = e.clientY;
    if (state.pending === "selection") disarmCapture(); // redrawing
    state.sel = { left: ox, top: oy, w: 0, h: 0 };
    setCap(selLayer, e.pointerId);
    const onMove = (ev) => {
      state.sel = {
        left: Math.min(ox, ev.clientX),
        top: Math.min(oy, ev.clientY),
        w: Math.abs(ev.clientX - ox),
        h: Math.abs(ev.clientY - oy),
      };
      renderSelection();
    };
    const onUp = (ev) => {
      relCap(selLayer, ev.pointerId);
      selLayer.removeEventListener("pointermove", onMove);
      selLayer.removeEventListener("pointerup", onUp);
      if (state.sel && (state.sel.w < 6 || state.sel.h < 6)) {
        state.sel = null;
        renderSelection();
      } else if (state.sel) {
        armCapture("selection"); // on drop, offer Space/Shift+Space
      }
    };
    selLayer.addEventListener("pointermove", onMove);
    selLayer.addEventListener("pointerup", onUp);
    renderSelection();
  }

  function startMoveCrop(e) {
    if (e.target.classList.contains("gfx-handle")) return;
    if (!state.sel) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, ...state.sel };
    setCap(cropEl, e.pointerId);
    const onMove = (ev) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      state.sel.left = clamp(start.left + (ev.clientX - start.x), 0, vw - start.w);
      state.sel.top = clamp(start.top + (ev.clientY - start.y), 0, vh - start.h);
      renderSelection();
    };
    const onUp = (ev) => {
      relCap(cropEl, ev.pointerId);
      cropEl.removeEventListener("pointermove", onMove);
      cropEl.removeEventListener("pointerup", onUp);
    };
    cropEl.addEventListener("pointermove", onMove);
    cropEl.addEventListener("pointerup", onUp);
  }

  function startResize(e, dir) {
    if (!state.sel) return;
    e.preventDefault();
    e.stopPropagation();
    const s = { x: e.clientX, y: e.clientY, ...state.sel };
    const handle = e.target;
    setCap(handle, e.pointerId);
    const onMove = (ev) => {
      const dx = ev.clientX - s.x;
      const dy = ev.clientY - s.y;
      let { left, top, w, h } = s;
      if (dir.includes("e")) w = s.w + dx;
      if (dir.includes("s")) h = s.h + dy;
      if (dir.includes("w")) {
        left = s.left + dx;
        w = s.w - dx;
      }
      if (dir.includes("n")) {
        top = s.top + dy;
        h = s.h - dy;
      }
      if (w < 12) w = 12;
      if (h < 12) h = 12;
      state.sel = { left, top, w, h };
      renderSelection();
    };
    const onUp = (ev) => {
      relCap(handle, ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  function renderSelection() {
    const masks = selLayer.querySelectorAll(".gfx-mask");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!state.sel || state.sel.w === 0) {
      cropEl.hidden = true;
      // full-screen dim while drawing nothing yet
      setMask(masks[0], 0, 0, vw, vh);
      setMask(masks[1], 0, 0, 0, 0);
      setMask(masks[2], 0, 0, 0, 0);
      setMask(masks[3], 0, 0, 0, 0);
      return;
    }
    const { left, top, w, h } = state.sel;
    cropEl.hidden = false;
    cropEl.style.left = left + "px";
    cropEl.style.top = top + "px";
    cropEl.style.width = w + "px";
    cropEl.style.height = h + "px";
    setMask(masks[0], 0, 0, vw, top); // top
    setMask(masks[1], left + w, top, vw - (left + w), h); // right
    setMask(masks[2], 0, top + h, vw, vh - (top + h)); // bottom
    setMask(masks[3], 0, top, left, h); // left
  }
  function setMask(node, x, y, w, h) {
    node.style.left = x + "px";
    node.style.top = y + "px";
    node.style.width = Math.max(0, w) + "px";
    node.style.height = Math.max(0, h) + "px";
  }

  // =====================================================================
  // TEXT TOOL
  // =====================================================================
  function onPlaceText(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const docLeft = e.clientX + window.scrollX;
    const docTop = e.clientY + window.scrollY;
    createNote(docLeft, docTop);
    setTool(null); // place one, then drop back so the page is usable
  }

  function createNote(docLeft, docTop, opts = {}) {
    const note = el("div", { class: "gfx-note" });
    const body = el("div", {
      class: "gfx-note-body",
      contenteditable: "true",
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": "Annotation text",
      "data-placeholder": "Type feedback…",
    });
    const themeBtn = el("button", {
      class: "gfx-note-btn",
      title: "Flip theme",
      "aria-label": "Flip note theme",
      html: ICONS.contrast,
      onclick: () => note.classList.toggle("gfx-note-light"),
    });
    const delBtn = el("button", {
      class: "gfx-note-btn",
      title: "Delete note",
      "aria-label": "Delete note",
      html: ICONS.trash,
      onclick: () => note.remove(),
    });
    const bar = el(
      "div",
      { class: "gfx-note-bar" },
      themeBtn,
      el("div", { class: "gfx-note-spacer" }),
      delBtn
    );
    note.append(bar, body);
    note.style.left = docLeft + "px";
    note.style.top = docTop + "px";
    if (opts.light) note.classList.add("gfx-note-light");
    bar.addEventListener("pointerdown", (e) => startNoteDrag(e, note));
    annoLayer.append(note);
    requestAnimationFrame(() => body.focus());
    return note;
  }

  function startNoteDrag(e, note) {
    if (e.target.closest(".gfx-note-btn")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startLeft = parseFloat(note.style.left) || 0;
    const startTop = parseFloat(note.style.top) || 0;
    const sx = e.clientX;
    const sy = e.clientY;
    const bar = e.currentTarget;
    setCap(bar, e.pointerId);
    const onMove = (ev) => {
      note.style.left = startLeft + (ev.clientX - sx) + "px";
      note.style.top = startTop + (ev.clientY - sy) + "px";
    };
    const onUp = (ev) => {
      relCap(bar, ev.pointerId);
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
  }

  // =====================================================================
  // SAVE / CAPTURE
  // =====================================================================
  // The save button always means "full page": clicking it arms a full-page
  // capture (toggle off if already armed). Both scopes finish with a keypress.
  function armFullPage() {
    if (state.pending === "full") return disarmCapture();
    disarmCapture(); // clear an armed selection so only one hint shows
    armCapture("full");
  }

  // Arm a capture and surface the Space / Shift+Space hint. A selection shows
  // the hint anchored under its crop box; full page uses the bottom toast.
  function armCapture(scope) {
    state.pending = scope;
    if (scope === "selection") {
      if (cropHintEl) cropHintEl.innerHTML = CAPTURE_HINT;
    } else {
      // Full page is armed purely by the button — a click anywhere else lets
      // the moment pass (don't trap the user until a key/Escape).
      showToast(CAPTURE_HINT, true);
      setTimeout(
        () => document.addEventListener("pointerdown", onDocClickForArm, true),
        0
      );
    }
    syncLiquid(); // bubble visits the save button while full page is armed
  }

  function onDocClickForArm(e) {
    const path = e.composedPath();
    if (path.includes(btn.save)) return; // re-click toggles via the button
    // Clicking another tool hands focus straight to it: clear the armed state
    // WITHOUT retracting first, so the bubble slides from save to the new tool
    // (rather than dismissing to the pill and then re-emerging).
    if (path.includes(btn.select) || path.includes(btn.text)) {
      clearPending();
      return;
    }
    disarmCapture(); // clicked the page → let the moment pass (bubble retracts)
  }

  // Clear the armed capture + its hint, but leave the bubble where it is.
  function clearPending() {
    if (!state.pending) return;
    if (state.pending === "selection" && cropHintEl)
      cropHintEl.innerHTML = DRAW_HINT;
    state.pending = null;
    document.removeEventListener("pointerdown", onDocClickForArm, true);
    toast.classList.remove("gfx-on");
  }

  function disarmCapture() {
    if (!state.pending) return;
    clearPending();
    syncLiquid(); // bubble returns to the active tool (or retracts to the pill)
  }

  async function runSave(scope, dest) {
    try {
      showToast("Capturing…", true);
      const canvas =
        scope === "selection"
          ? await captureSelection()
          : await captureFullPage();
      if (dest === "clipboard") {
        const ok = await canvasToClipboard(canvas);
        if (ok) showToast("Copied to clipboard");
        else {
          await canvasToDownload(canvas);
          showToast("Clipboard blocked — downloaded instead");
        }
      } else {
        await canvasToDownload(canvas);
        showToast("Saved to downloads");
      }
    } catch (err) {
      console.error("Glass Feedback capture failed:", err);
      showToast("Capture failed: " + (err?.message || err));
    }
  }

  function setCapturing(on) {
    root.classList.toggle("gfx-capturing", on);
  }

  function captureVisible() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "GFX_CAPTURE_VISIBLE" }, (resp) => {
        if (chrome.runtime.lastError)
          return reject(new Error(chrome.runtime.lastError.message));
        if (!resp || !resp.ok)
          return reject(new Error(resp?.error || "capture failed"));
        resolve(resp.dataUrl);
      });
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function captureSelection() {
    const dpr = window.devicePixelRatio || 1;
    const sel = { ...state.sel };
    setCapturing(true);
    await nextPaint();
    let img;
    try {
      img = await loadImage(await captureVisible());
    } finally {
      setCapturing(false);
    }
    const canvas = el("canvas");
    canvas.width = Math.round(sel.w * dpr);
    canvas.height = Math.round(sel.h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      img,
      Math.round(sel.left * dpr),
      Math.round(sel.top * dpr),
      Math.round(sel.w * dpr),
      Math.round(sel.h * dpr),
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas;
  }

  async function captureFullPage() {
    const dpr = window.devicePixelRatio || 1;
    const doc = document.documentElement;
    const fullH = Math.max(doc.scrollHeight, doc.clientHeight);
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const prevScrollY = window.scrollY;
    const prevScrollX = window.scrollX;

    setCapturing(true);
    await nextPaint();

    const canvas = el("canvas");
    canvas.width = Math.min(Math.round(viewW * dpr), MAX_CANVAS);
    canvas.height = Math.min(Math.round(fullH * dpr), MAX_CANVAS);
    const ctx = canvas.getContext("2d");

    try {
      let y = 0;
      let first = true;
      while (y < fullH) {
        window.scrollTo(0, y);
        await nextPaint();
        await sleep(first ? 60 : CAPTURE_DELAY);
        first = false;
        const img = await loadImage(await captureVisible());
        const actualY = window.scrollY;
        const destY = Math.round(actualY * dpr);
        if (destY >= canvas.height) break;
        ctx.drawImage(img, 0, destY);
        if (actualY + viewH >= fullH) break;
        y += viewH;
      }
    } finally {
      window.scrollTo(prevScrollX, prevScrollY);
      setCapturing(false);
    }
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("image encoding failed"))),
        "image/png"
      )
    );
  }

  async function canvasToClipboard(canvas) {
    try {
      const blob = await canvasToBlob(canvas);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch (err) {
      console.warn("clipboard write failed:", err?.message);
      return false;
    }
  }

  async function canvasToDownload(canvas) {
    const dataUrl = canvas.toDataURL("image/png");
    const filename = `glass-feedback/${stamp()}.png`;
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "GFX_DOWNLOAD", dataUrl, filename },
        (resp) => {
          if (chrome.runtime.lastError)
            return reject(new Error(chrome.runtime.lastError.message));
          if (!resp || !resp.ok)
            return reject(new Error(resp?.error || "download failed"));
          resolve(resp.id);
        }
      );
    });
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `glass-feedback_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(
      d.getDate()
    )}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  let toastTimer;
  function showToast(msg, sticky = false) {
    toast.textContent = msg;
    toast.classList.add("gfx-on");
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => toast.classList.remove("gfx-on"), 2200);
  }

  // =====================================================================
  // ENABLE / DISABLE
  // =====================================================================
  async function setEnabled(on) {
    if (on && !state.built) await build();
    state.enabled = on;
    if (host) host.style.display = on ? "block" : "none";
    if (!on) {
      setTool(null);
      disarmCapture();
    } else {
      setCollapsed(true); // show just the pill; user taps to expand
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "GFX_TOGGLE_UI") setEnabled(!state.enabled);
  });
})();
