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

async function activateTab(tab) {
  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: "GFX_TOGGLE_UI" });
    } catch (err) {
      if (!/receiving end does not exist/i.test(err?.message || String(err))) {
        throw err;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content.js"],
      });
      response = await chrome.tabs.sendMessage(tab.id, { type: "GFX_TOGGLE_UI" });
    }
    if (response?.ok === false) {
      throw new Error(response.error || "The page tools could not open.");
    }
  } catch (err) {
    console.warn("Glass Feedback: cannot toggle on this page.", err?.message);
    await showUnavailable(tab, err);
  }
}

const activationQueues = new Map();
chrome.action.onClicked.addListener(async (tab) => {
  if (!Number.isInteger(tab.id) || tab.id < 0) return;
  // Rapid clicks must not overlap injection or reset another click's popup.
  const activation = (activationQueues.get(tab.id) || Promise.resolve())
    .then(() => activateTab(tab));
  activationQueues.set(tab.id, activation);
  try {
    await activation;
  } finally {
    if (activationQueues.get(tab.id) === activation) activationQueues.delete(tab.id);
  }
});

let captureQueue = Promise.resolve();
let nextCaptureAt = 0;

async function requireActiveTab(tab) {
  const active = await chrome.tabs.query({ active: true, windowId: tab.windowId });
  if (active.length !== 1 || active[0].id !== tab.id) {
    throw new Error("Keep the requesting tab active while capturing.");
  }
}

async function captureVisible(tab) {
  const wait = nextCaptureAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  await requireActiveTab(tab);
  // Chrome's quota is global to the extension, including requests from other tabs.
  nextCaptureAt = Date.now() + 550;
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  await requireActiveTab(tab);
  return dataUrl;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

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
    if (typeof msg.dataUrl !== "string" || typeof msg.filename !== "string") {
      sendResponse({ ok: false, error: "download requires a data URL and filename" });
      return;
    }
    chrome.downloads
      .download({ url: msg.dataUrl, filename: msg.filename, saveAs: false })
      .then(
        (id) => sendResponse({ ok: true, id }),
        (err) => sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true; // async response
  }
});
