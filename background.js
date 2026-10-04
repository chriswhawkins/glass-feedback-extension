// Service worker: toggles the in-page UI, captures the visible tab, and
// saves files. Content scripts can't call captureVisibleTab or downloads,
// so they message us here.

async function showUnavailable(tab, error) {
  try {
    await chrome.action.setPopup({
      tabId: tab.id,
      popup: `unavailable.html?reason=${encodeURIComponent(error?.message || String(error))}`,
    });
    if (typeof chrome.action.openPopup !== "function") {
      throw new Error("The page notice requires Chrome 127 or later.");
    }
    await chrome.action.openPopup({ windowId: tab.windowId });
  } catch (err) {
    console.warn("Glass Feedback: cannot open page notice.", err?.message);
  } finally {
    // A configured popup suppresses onClicked. Always restore click activation.
    try {
      await chrome.action.setPopup({ tabId: tab.id, popup: "" });
    } catch (err) {
      console.warn("Glass Feedback: cannot reset page notice.", err?.message);
    }
  }
}

async function activateTab(tab, enabled, notify = true) {
  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: "GFX_SET_ENABLED", enabled }, { frameId: 0 });
    } catch (err) {
      if (!/receiving end does not exist/i.test(err?.message || String(err))) {
        throw err;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content.js"],
      });
      response = await chrome.tabs.sendMessage(tab.id, { type: "GFX_SET_ENABLED", enabled }, { frameId: 0 });
    }
    if (response?.ok !== true) {
      throw new Error(response?.error || "The page tools did not acknowledge activation.");
    }
  } catch (err) {
    console.warn("Glass Feedback: cannot toggle on this page.", err?.message);
    if (notify) await showUnavailable(tab, err);
  }
}

let activationQueue = Promise.resolve();
chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab?.id) || tab.id < 0) return;
  // One shared setting: serialize clicks even when they come from different tabs.
  activationQueue = activationQueue.catch(() => {}).then(async () => {
    const { gfxEnabled } = await chrome.storage.local.get("gfxEnabled");
    const enabled = gfxEnabled !== true;
    await chrome.storage.local.set({ gfxEnabled: enabled });
    const tabs = await chrome.tabs.query({});
    await Promise.all([
      activateTab(tab, enabled),
      ...tabs.filter((other) => other.id !== tab.id && Number.isInteger(other.id) && other.id >= 0)
        .map((other) => activateTab(other, enabled, false)),
    ]);
  }).catch((err) => showUnavailable(tab, err));
  return activationQueue;
});

let captureQueue = Promise.resolve();
let nextCaptureAt = 0;
let capturingTab;
let captureInterrupted = false;
chrome.tabs.onActivated.addListener(({ windowId }) => {
  if (capturingTab?.windowId === windowId) captureInterrupted = true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (capturingTab?.id === tabId && (change.status === "loading" || change.url)) {
    captureInterrupted = true;
  }
});

async function requireActiveTab(tab) {
  const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active.length !== 1 || active[0].id !== tab.id) {
    throw new Error("Keep the requesting tab active while capturing.");
  }
  if (active[0].pendingUrl || (tab.url && active[0].url !== tab.url)) {
    throw new Error("The requesting page changed while capturing. Try again.");
  }
  if (captureInterrupted) throw new Error("Keep the requesting tab active and unchanged while capturing.");
}

async function captureVisible(tab) {
  const wait = nextCaptureAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  capturingTab = tab;
  captureInterrupted = false;
  try {
    await requireActiveTab(tab);
    // Chrome's quota is global to the extension, including requests from other tabs.
    nextCaptureAt = Date.now() + 550;
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    await requireActiveTab(tab);
    return dataUrl;
  } finally {
    capturingTab = undefined;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  if (!["GFX_CAPTURE_VISIBLE", "GFX_DOWNLOAD"].includes(msg.type)) return;
  if (sender?.id !== chrome.runtime.id || sender.frameId !== 0 ||
      (sender.documentLifecycle && sender.documentLifecycle !== "active")) {
    sendResponse({ ok: false, error: "request requires this extension's active main-frame content script" });
    return;
  }

  if (msg.type === "GFX_CAPTURE_VISIBLE") {
    const tab = sender.tab;
    if (!Number.isInteger(tab?.id) || tab.id < 0 ||
        !Number.isInteger(tab?.windowId) || tab.windowId < 0) {
      sendResponse({ ok: false, error: "capture requested without a tab" });
      return;
    }
    const capture = captureQueue.then(() => captureVisible(tab));
    captureQueue = capture.catch(() => {});
    capture.then(
      (dataUrl) => sendResponse({ ok: true, dataUrl }),
      (err) => sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true; // async response
  }

  if (msg.type === "GFX_DOWNLOAD") {
    const header = typeof msg.dataUrl === "string" && /^data:image\/(png|jpeg|webp);base64,/.exec(msg.dataUrl);
    const payload = header ? msg.dataUrl.slice(header[0].length) : "";
    const extension = typeof msg.filename === "string" && /\.(png|jpe?g|webp)$/i.exec(msg.filename)?.[1].toLowerCase();
    const format = extension === "jpg" || extension === "jpeg" ? "jpeg" : extension;
    if (!payload || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload) ||
        !format || header[1] !== format || (msg.saveAs !== undefined && typeof msg.saveAs !== "boolean") ||
        /[\\<>:"|?*\u0000-\u001f\u007f]/.test(msg.filename) ||
        msg.filename.split("/").some((part) => !part || part === "." || part === "..")) {
      sendResponse({ ok: false, error: "download requires matching PNG/JPEG/WebP image data and a relative filename" });
      return;
    }
    Promise.resolve()
      .then(() => chrome.downloads.download({ url: msg.dataUrl, filename: msg.filename, saveAs: msg.saveAs === true,
        conflictAction: "uniquify" }))
      .then(
        (id) => sendResponse({ ok: true, id }),
        (err) => sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true; // async response
  }
});
