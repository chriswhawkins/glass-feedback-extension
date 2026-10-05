import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../content/content.js", import.meta.url), "utf8");

function harness(saved) {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  const calls = { sync: 0, disarm: 0, capture: 0, region: 0, menus: 0 };
  const context = vm.createContext({
    window: {}, document: {}, console: { warn() {} },
    navigator: { clipboard: { write: async () => {} } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    requestAnimationFrame(fn) { fn(); },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { onChanged: { addListener() {} }, local: { get: async () => ({ gfxPreferences: saved }) } },
    },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    calls,
  });
  // Expose state-machine seams only in this VM; production has no test hooks.
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    window.test = { prefs, state, loadPreferences, keepToolActive, armTool, chooseMode,
      primaryAction, updateCameraCursor, keyDown, renderSelectionAction: renderSelection,
      captureFullPageAction: captureFullPage,
      runSaveAction: runSave,
      cameraPointer, trackPointer, get activePointers() { return activePointers; },
      installCapture(canvas, write, download) {
        root = { classList: { add() {}, remove() {} } };
        primary = { disabled: false };
        wakeGlass = () => {};
        renderSelection = () => {};
        keepMenusOpen = () => false;
        captureSelection = async () => canvas;
        captureFullPage = async () => canvas;
        navigator.clipboard.write = write;
        chrome.runtime.sendMessage = (msg, cb) => cb(download(msg));
        showToast = (text) => { calls.notice = text; };
      },
      installSelection() {
        window.innerWidth = 800; window.innerHeight = 600;
        cropSize = { textContent: "" };
        const controls = { style: {}, offsetWidth: 198, offsetHeight: 56, setAttribute() {} };
        captureButton = clearButton = { setAttribute() {} };
        crop = { style: {}, hidden: false, querySelector: () => controls };
        selectionLayer = { classList: { toggle() {} }, querySelectorAll: () => [] };
        inputLayer.classList = { toggle() {} };
        root = { style: { setProperty: (key, value) => { calls.cursor = value; } } };
        return { controls, crop, size: cropSize };
      },
      installFullPage(change) {
        const properties = new Map([["scroll-behavior", ["smooth", ""]], ["scroll-snap-type", ["y mandatory", "important"]],
          ["scrollbar-color", ["red blue", ""]]]);
        const style = { getPropertyValue: (key) => properties.get(key)?.[0] || "",
          getPropertyPriority: (key) => properties.get(key)?.[1] || "",
          setProperty: (key, value, priority) => properties.set(key, [value, priority]), removeProperty: (key) => properties.delete(key) };
        document = { documentElement: { scrollHeight: 240, style }, body: null };
        Object.assign(window, { innerWidth: 200, innerHeight: 100, scrollX: 0, scrollY: 20,
          scrollTo: ({left, top}) => { window.scrollX = left; window.scrollY = top; } });
        setTimeout = (fn) => fn();
        calls.frames = 0; calls.draws = [];
        visibleImage = async () => {
          calls.frames++;
          if (calls.frames === 2 && change === "height") document.documentElement.scrollHeight = 340;
          if (calls.frames === 2 && change === "error") throw new Error("Tab changed");
          return { width: calls.frames === 2 && change === "scale" ? 402 : 400, height: 200 };
        };
        canvasFor = (width, height) => ({ width, height, getContext: () => ({ drawImage: (...args) => calls.draws.push(args.slice(1)) }) });
        positionAnnotations = () => {}; wakeWandMarks = () => {};
        return { properties, viewport: window };
      },
      install(node) {
        inputLayer = node;
        syncMode = () => calls.sync++;
        cancelSelection = () => { state.selecting = false; state.sel = null; };
        closeMenus = () => {};
        openMenus = () => calls.menus++;
        openOptions = (_anchor, _side, mode) => { calls.options = mode; };
        primary = {};
        disarmTool = () => { calls.disarm++; state.armed = state.editing = false; };
        runSave = () => calls.capture++;
        startRegion = () => calls.region++;
      }
    };
  })();`), context);
  const api = context.window.test;
  const node = pointerNode();
  api.install(node);
  return { api, node, calls, timers,
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
  };
}

function pointerNode() {
  const listeners = new Map();
  let captured;
  return {
    setPointerCapture(id) { captured = id; },
    hasPointerCapture(id) { return captured === id; },
    releasePointerCapture() { captured = undefined; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type, props = {}) { listeners.get(type)?.({ type, pointerId: 1, clientX: 20, clientY: 30, ...props }); },
  };
}

const pointer = () => ({ button: 0, pointerId: 1, clientX: 20, clientY: 30, preventDefault() {} });

test("page tools stay active until explicitly released", () => {
  for (const mode of ["camera", "annotate"]) {
    const h = harness();
    Object.assign(h.api.state, { enabled: true, mode });
    h.api.armTool();
    assert.equal(h.api.state.editing, true);
    h.advance(29999);
    assert.equal(h.api.state.armed, true);
    h.advance(1);
    assert.equal(h.api.state.armed, true);
    assert.equal(h.calls.disarm, 0);
  }
});

test("using a tool never creates an inactivity deadline", () => {
  const h = harness();
  h.api.state.enabled = true;
  h.api.armTool();
  h.advance(20000);
  h.api.keepToolActive();
  h.advance(29999);
  assert.equal(h.api.state.armed, true);
  h.advance(1);
  assert.equal(h.api.state.armed, true);
  assert.equal(h.timers.size, 0);
});

test("switching to Annotate activates it without another click", () => {
  const h = harness();
  h.api.state.enabled = true;
  h.api.chooseMode("annotate");
  assert.equal(h.api.state.armed, true);
  assert.equal(h.api.state.editing, true);
  h.api.armTool();
  assert.equal(h.api.state.editing, true);
  h.api.chooseMode("camera");
  assert.equal(h.api.state.armed, true);
  h.api.chooseMode("wand");
  h.api.chooseMode("note");
  assert.equal(h.api.state.mode, "camera");
});

test("clicking Glassy opens current options and modes, not global settings", () => {
  const h = harness();
  h.api.state.enabled = true;
  h.api.armTool();
  h.api.primaryAction();
  assert.equal(h.calls.menus, 1);
  assert.equal(h.calls.options, "camera");
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.state.editing, true);
});

test("inactivity never interrupts an in-progress pointer gesture or capture", () => {
  const h = harness();
  h.api.state.enabled = true;
  h.api.armTool();
  h.api.trackPointer(h.node, pointer(), () => {});
  h.advance(31000);
  assert.equal(h.api.state.armed, true);
  h.node.dispatch("pointerup");
  assert.equal(h.api.activePointers, 0);
  h.api.state.capturing = true;
  h.advance(31000);
  assert.equal(h.api.state.armed, true);
  h.api.state.capturing = false;
  h.api.keepToolActive();
  h.advance(30000);
  assert.equal(h.api.state.armed, true);
});

test("full-page camera captures only a completed click, not a drag or cancellation", () => {
  for (const action of ["click", "drag", "cancel"]) {
    const h = harness();
    Object.assign(h.api.state, { enabled: true, armed: true });
    h.api.prefs.scope = "full";
    h.api.cameraPointer(pointer());
    if (action === "drag") h.node.dispatch("pointermove", { clientX: 40 });
    h.node.dispatch(action === "cancel" ? "pointercancel" : "pointerup");
    assert.equal(h.calls.capture, action === "click" ? 1 : 0);
    assert.equal(h.api.activePointers, 0);
  }
});

test("region camera starts selection directly; idle and secondary clicks do nothing", () => {
  const h = harness();
  Object.assign(h.api.state, { enabled: true, armed: true });
  h.api.cameraPointer(pointer());
  assert.equal(h.calls.region, 1);
  h.api.cameraPointer({ ...pointer(), button: 2 });
  h.api.state.armed = false;
  h.api.cameraPointer(pointer());
  assert.equal(h.calls.region, 1);
});

test("preferences validate new modes and migrate older motion values", async () => {
  const h = harness({ defaultTool: "rectangle", motion: "solid", hiddenModes: ["wand", "settings", "bad"],
    wandNote: "inline", wandColor: "#ff526b", recentColors: ["bad", "#ff526b", "#ff526b"], toolbarReveal: "pinned" });
  await h.api.loadPreferences();
  assert.equal(h.api.prefs.defaultTool, "smart");
  assert.equal(h.api.prefs.motion, "off");
  assert.equal(h.api.prefs.wandNote, "inline");
  assert.equal(h.api.prefs.wandColor, "#ff526b");
  assert.deepEqual([...h.api.prefs.recentColors], ["#ff526b", "#345b8c"]);
});

test("retired export preferences cannot change PNG and Downloads defaults", async () => {
  const h = harness({ fileType: "webp", saveFolder: "screenshots/work", saveAs: true });
  await h.api.loadPreferences();
  assert.equal(h.api.prefs.fileType, undefined);
  assert.equal(h.api.prefs.saveFolder, undefined);
  assert.equal(h.api.prefs.saveAs, undefined);
  const invalid = harness({ fileType: "gif", saveFolder: "/tmp", saveAs: "false" });
  await invalid.api.loadPreferences();
  assert.equal(invalid.api.prefs.fileType, undefined);
  assert.equal(invalid.api.prefs.saveFolder, undefined);
  assert.equal(invalid.api.prefs.saveAs, undefined);
});

test("Camera cursor conveys area only, never clipboard, format, or folder state", () => {
  const h = harness();
  h.api.installSelection();
  h.api.updateCameraCursor();
  const selection = h.calls.cursor;
  Object.assign(h.api.prefs, { destination: "download", fileType: "jpeg", saveAs: true });
  h.api.updateCameraCursor();
  assert.equal(h.calls.cursor, selection);
  assert.match(selection, /5 5, crosshair$/);
  h.api.prefs.scope = "full";
  h.api.updateCameraCursor();
  assert.notEqual(h.calls.cursor, selection);
  assert.match(h.calls.cursor, /19 21, pointer$/);
});

test("selection toolbar is centered and clamped above or inside near viewport edges", () => {
  const h = harness();
  const { controls, size } = h.api.installSelection();
  h.api.state.sel = { left: 200, top: 100, w: 300, h: 200 };
  h.api.renderSelectionAction();
  assert.equal(controls.style.left, "51px");
  assert.equal(controls.style.top, "208px");
  assert.equal(size.textContent, "300 × 200");
  h.api.state.sel = { left: 760, top: 570, w: 40, h: 30 };
  h.api.renderSelectionAction();
  assert.equal(controls.style.left, "-170px");
  assert.equal(controls.style.top, "-64px");
  h.api.state.sel = { left: 0, top: 0, w: 800, h: 600 };
  h.api.renderSelectionAction();
  assert.equal(controls.style.top, "532px");
});

test("arrow keys nudge a crop; Space on its clear button never triggers capture", () => {
  const h = harness();
  h.api.installSelection();
  Object.assign(h.api.state, { enabled: true, armed: true, selecting: true, sel: { left: 1, top: 1, w: 100, h: 100 } });
  const key = (key, shiftKey = false, tagName = "DIV") => ({ key, code: key === " " ? "Space" : key,
    shiftKey, preventDefault() {}, composedPath: () => [{ tagName }] });
  h.api.keyDown(key("ArrowRight", true));
  assert.equal(h.api.state.sel.left, 11);
  h.api.keyDown(key("ArrowUp"));
  assert.equal(h.api.state.sel.top, 0);
  h.api.keyDown(key(" ", false, "BUTTON"));
  assert.equal(h.calls.capture, 0);
  h.api.keyDown(key("Enter"));
  assert.equal(h.calls.capture, 1);
  h.api.keyDown(key("Escape"));
  assert.equal(h.api.state.armed, false);
});

const canvas = () => ({
  toBlob(cb) { cb({ type: "image/png" }); },
  toDataURL(mime = "image/png") { return `data:${mime};base64,iVBORw0KGgo=`; },
});

test("clipboard failure downloads a PNG and reports the fallback", async () => {
  const h = harness();
  Object.assign(h.api.state, { enabled: true, armed: true, sel: { left: 1, top: 2, w: 10, h: 20 } });
  let request;
  h.api.installCapture(canvas(), async () => { throw new Error("Clipboard blocked"); }, (msg) => {
    request = msg;
    return { ok: true, id: 1 };
  });
  await h.api.runSaveAction();
  assert.equal(request.type, "GFX_DOWNLOAD");
  assert.match(request.filename, /^glass-feedback_.*\.png$/);
  assert.equal(h.calls.notice, "Clipboard blocked — image download started");
  assert.equal(h.api.state.capturing, false);
  assert.equal(h.api.state.sel, null);
});

test("a download failure releases capture state and reports the error", async () => {
  const h = harness();
  Object.assign(h.api.state, { enabled: true, armed: true });
  Object.assign(h.api.prefs, { scope: "full", destination: "download" });
  h.api.installCapture(canvas(), async () => {}, () => ({ ok: false, error: "Disk unavailable" }));
  await h.api.runSaveAction();
  assert.equal(h.calls.notice, "Capture failed: Disk unavailable");
  assert.equal(h.api.state.capturing, false);
  assert.equal(h.timers.size, 0);
});

test("successful clipboard export never downloads a duplicate", async () => {
  const h = harness();
  Object.assign(h.api.state, { enabled: true, armed: true, sel: { left: 1, top: 2, w: 10, h: 20 } });
  let writes = 0, downloads = 0;
  h.api.installCapture(canvas(), async () => { writes++; }, () => { downloads++; return { ok: true }; });
  await h.api.runSaveAction();
  assert.equal(writes, 1);
  assert.equal(downloads, 0);
  assert.equal(h.calls.notice, "Copied to clipboard");
});

test("saved images always use PNG in Downloads, ignoring retired preferences", async () => {
  for (const fileType of ["png", "jpeg", "webp"]) {
    const h = harness();
    Object.assign(h.api.state, { enabled: true, armed: true });
    Object.assign(h.api.prefs, { scope: "full", destination: "download", fileType, saveFolder: "", saveAs: true });
    let request;
    h.api.installCapture(canvas(), async () => {}, (msg) => { request = msg; return { ok: true }; });
    await h.api.runSaveAction();
    assert.ok(request.dataUrl.startsWith("data:image/png;base64,"));
    assert.ok(request.filename.endsWith(".png"));
    assert.ok(!request.filename.includes("/"));
    assert.equal(request.saveAs, false);
  }
  const h = harness();
  Object.assign(h.api.state, { enabled: true, armed: true, sel: { left: 0, top: 0, w: 10, h: 10 } });
  h.api.prefs.fileType = "jpeg";
  let item;
  h.api.installCapture(canvas(), async (items) => { item = items[0]; }, () => assert.fail("unexpected download"));
  await h.api.runSaveAction();
  assert.equal(item.data["image/png"].type, "image/png");
});

test("failed region export keeps its selection available for retry", async () => {
  const h = harness();
  const sel = { left: 1, top: 2, w: 10, h: 20 };
  Object.assign(h.api.state, { enabled: true, armed: true, selecting: true, sel });
  h.api.prefs.destination = "download";
  h.api.installCapture(canvas(), async () => {}, () => ({ ok: false, error: "Download cancelled" }));
  await h.api.runSaveAction();
  assert.equal(h.api.state.armed, true);
  assert.equal(h.api.state.selecting, true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.api.state.sel)), sel);
});

test("full-page stitching crops the last overlap and restores scroll/styles", async () => {
  const h = harness();
  const { properties, viewport } = h.api.installFullPage();
  const result = await h.api.captureFullPageAction();
  assert.equal(result.height, 480);
  assert.equal(h.calls.frames, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.draws.at(-1))), [0, 120, 400, 80, 0, 400, 400, 80]);
  assert.equal(viewport.scrollY, 20);
  assert.deepEqual(JSON.parse(JSON.stringify([...properties.entries()])), [["scroll-behavior", ["smooth", ""]], ["scroll-snap-type", ["y mandatory", "important"]],
    ["scrollbar-color", ["red blue", ""]]]);
});

test("changing page height, image scale, or capture errors never export a partial full page", async () => {
  for (const [change, error] of [["height", /Page height changed/], ["scale", /Capture scale changed/], ["error", /Tab changed/]]) {
    const h = harness();
    const { properties, viewport } = h.api.installFullPage(change);
    await assert.rejects(h.api.captureFullPageAction(), error);
    assert.deepEqual([...properties.get("scrollbar-color")], ["red blue", ""]);
    assert.equal(viewport.scrollY, 20);
    assert.equal(h.calls.frames, 2);
  }
});


function activationHarness(enabled) {
  let change, receive;
  const applied = [];
  const context = vm.createContext({
    toggleQueue: Promise.resolve(), state: { enabled: false, capturing: false },
    setEnabled: async (on) => { applied.push(on); context.state.enabled = on; },
    console, sleep: async () => {},
    chrome: {
      runtime: { onMessage: { addListener: (fn) => { receive = fn; } } },
      storage: {
        local: { get: async () => ({ gfxEnabled: enabled }) },
        onChanged: { addListener: (fn) => { change = fn; } },
      },
    },
  });
  vm.runInContext(source.slice(source.lastIndexOf("  chrome.runtime.onMessage.addListener")).replace(/\}\)\(\);\s*$/, ""), context);
  return {
    applied, settle: () => context.toggleQueue,
    change(on, area = "local", key = "gfxEnabled") { enabled = on; change({ [key]: { newValue: on } }, area); },
    request(msg) { return new Promise((resolve) => receive(msg, {}, resolve)); },
  };
}

test("new documents restore global activation, including after a browser restart", async () => {
  for (const enabled of [undefined, false, true]) {
    const h = activationHarness(enabled);
    await h.settle();
    assert.deepEqual(h.applied, [enabled === true]);
  }
});

test("storage changes synchronize open documents without reacting to preference edits", async () => {
  const h = activationHarness(true);
  await h.settle();
  h.change(false);
  await h.settle();
  assert.deepEqual(h.applied, [true, false]);
  h.change(true, "sync");
  h.change(true, "local", "gfxPreferences");
  await h.settle();
  assert.deepEqual(h.applied, [true, false]);
  h.change(true);
  await h.settle();
  assert.deepEqual(h.applied, [true, false, true]);
  const response = await h.request({ type: "GFX_SET_ENABLED", enabled: true });
  assert.equal(response.enabled, true);
});
