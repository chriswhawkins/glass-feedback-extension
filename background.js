// Service worker: toggles the in-page UI, captures the visible tab, and
// saves files. Content scripts can't call captureVisibleTab or downloads,
// so they message us here.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "GFX_TOGGLE_UI" });
  } catch (err) {
    // Content script not present (e.g. chrome:// pages, the web store, or
    // the page loaded before the extension). Nothing we can do there.
    console.warn("Glass Feedback: cannot toggle on this page.", err?.message);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "GFX_CAPTURE_VISIBLE") {
    const windowId = sender.tab?.windowId;
    if (typeof windowId !== "number") {
      sendResponse({ ok: false, error: "capture requested without a tab" });
      return;
    }
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }).then(
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
