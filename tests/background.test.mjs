import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { PACKAGE_FILES } from "../tools/package.mjs";

const source = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const tab = { id: 7, windowId: 3 };
const sender = { id: "glass-feedback-test", frameId: 0, tab };
const missingReceiver = () => { throw new Error("Could not establish connection. Receiving end does not exist."); };

function worker(configure = () => {}) {
  const calls = [];
  let click, message, activated, updated;
  let now = 1000;
  const stored = {};
  const chrome = {
    action: {
      onClicked: { addListener: (listener) => { click = listener; } },
      setPopup: async (options) => { calls.push(["popup", options]); },
      openPopup: async (options) => { calls.push(["open", options]); },
    },
    scripting: {
      executeScript: async (options) => { calls.push(["inject", options]); },
    },
    tabs: {
      sendMessage: async (id, msg, options) => { calls.push(["toggle", id, msg, options]); return { ok: true }; },
      onActivated: { addListener: (listener) => { activated = listener; } },
      onUpdated: { addListener: (listener) => { updated = listener; } },
      query: async (options) => { calls.push(["query", options]); return [tab]; },
      captureVisibleTab: async (windowId, options) => {
        calls.push(["capture", windowId, options, now]);
        return "data:image/png;base64,capture";
      },
    },
    runtime: { id: sender.id, onMessage: { addListener: (listener) => { message = listener; } } },
    storage: { local: {
      get: async () => ({ ...stored }),
      set: async (value) => { Object.assign(stored, value); },
    } },
    downloads: {
      download: async (options) => { calls.push(["download", options]); return 42; },
    },
  };
  configure(chrome, calls);
  const context = {
    chrome,
    console: { warn: (...args) => calls.push(["warn", ...args]) },
    Date: { now: () => now },
    setTimeout: (callback, delay) => { calls.push(["wait", delay]); now += delay; callback(); },
    encodeURIComponent,
  };
  runInNewContext(source, context, { filename: "background.js" });
  return {
    calls,
    stored,
    click: (value = tab) => click(value),
    message,
    activated: (windowId = tab.windowId) => activated({ windowId }),
    updated: (change, tabId = tab.id) => updated(tabId, change),
    request: (msg, from = sender) => new Promise((resolve) => {
      const keepAlive = message(msg, from, (response) => resolve(JSON.parse(JSON.stringify(response))));
      if (keepAlive !== true) resolve(undefined);
    }),
  };
}

const values = (calls, type) => JSON.parse(JSON.stringify(calls.filter((call) => call[0] === type)));

test("rapid first clicks share one injection and preserve both toggles", async () => {
  let ready = false, injections = 0, toggles = 0;
  const w = worker((chrome) => {
    chrome.tabs.sendMessage = async () => {
      if (!ready) missingReceiver();
      toggles++;
      return { ok: true };
    };
    chrome.scripting.executeScript = async () => { injections++; ready = true; };
  });
  await Promise.all([w.click(), w.click()]);
  assert.equal(injections, 1);
  assert.equal(toggles, 2);
});

test("rapid failed clicks complete each popup lifecycle before starting another", async () => {
  const w = worker((chrome, calls) => {
    chrome.tabs.sendMessage = async () => { throw new Error("unavailable"); };
    chrome.action.openPopup = async () => {
      calls.push(["open"]);
      await Promise.resolve();
      calls.push(["opened"]);
    };
  });
  await Promise.all([w.click(), w.click()]);
  assert.deepEqual(w.calls.filter((call) => call[0] !== "warn").map((call) => call[0]),
    ["query", "popup", "open", "opened", "popup", "query", "popup", "open", "opened", "popup"]);
});

test("a content error mentioning a receiver is not mistaken for a transport failure", async () => {
  const w = worker((chrome) => {
    chrome.tabs.sendMessage = async () => ({ ok: false, error: "Receiving end does not exist in a page dependency" });
  });
  await w.click();
  assert.equal(values(w.calls, "inject").length, 0);
  assert.equal(values(w.calls, "open").length, 1);
});

for (const error of ["Receiving end does not exist", "Could not establish connection. Receiving end does not exist.", "RECEIVING END DOES NOT EXIST."]) {
  test(`receiver error variant triggers injection: ${error}`, async () => {
    const w = worker((chrome) => {
      let count = 0;
      chrome.tabs.sendMessage = async () => { if (++count === 1) throw new Error(error); return { ok: true }; };
    });
    await w.click();
    assert.equal(values(w.calls, "inject").length, 1);
    assert.equal(values(w.calls, "open").length, 0);
  });
}

test("existing receiver toggles without injection or popup", async () => {
  const w = worker();
  await w.click();
  assert.deepEqual(values(w.calls, "toggle"), [["toggle", 7, { type: "GFX_SET_ENABLED", enabled: true }, { frameId: 0 }]]);
  assert.equal(w.calls.length, 2);
});

test("missing receiver injects the main frame, then retries toggle", async () => {
  const w = worker((chrome, calls) => {
    let count = 0;
    chrome.tabs.sendMessage = async (id, msg, options) => {
      calls.push(["toggle", id, msg, options]);
      if (++count === 1) missingReceiver();
      return { ok: true };
    };
  });
  await w.click();
  assert.deepEqual(w.calls.map((call) => call[0]), ["query", "toggle", "inject", "toggle"]);
  assert.deepEqual(values(w.calls, "inject"), [["inject", { target: { tabId: 7 }, files: ["content/content.js"] }]]);
  assert.ok(values(w.calls, "toggle").every((call) => call[3].frameId === 0));
});

test("restricted injection shows an encoded notice in the correct window and resets popup", async () => {
  const reason = "Cannot access chrome://settings/?a=<blocked>&b=1";
  const w = worker((chrome) => {
    chrome.tabs.sendMessage = async () => missingReceiver();
    chrome.scripting.executeScript = async () => { throw new Error(reason); };
  });
  await w.click();
  assert.deepEqual(values(w.calls, "popup"), [
    ["popup", { tabId: 7, popup: `unavailable.html?reason=${encodeURIComponent(reason)}` }],
    ["popup", { tabId: 7, popup: "" }],
  ]);
  assert.deepEqual(values(w.calls, "open"), [["open", { windowId: 3 }]]);
  assert.equal(w.calls.at(-1)[1].popup, "");
});

test("other messaging errors show a notice without reinjecting", async () => {
  const w = worker((chrome) => {
    chrome.tabs.sendMessage = async () => { throw new Error("The message port closed before a response was received."); };
  });
  await w.click();
  assert.equal(values(w.calls, "inject").length, 0);
  assert.equal(values(w.calls, "open").length, 1);
});

test("failure after injection also shows a notice", async () => {
  const w = worker((chrome) => { chrome.tabs.sendMessage = async () => missingReceiver(); });
  await w.click();
  assert.equal(values(w.calls, "inject").length, 1);
  assert.equal(values(w.calls, "open").length, 1);
});

for (const injected of [false, true]) {
  test(`content initialization errors show a notice (${injected ? "new" : "existing"} receiver)`, async () => {
    const w = worker((chrome) => {
      let count = 0;
      chrome.tabs.sendMessage = async () => {
        if (injected && ++count === 1) missingReceiver();
        return { ok: false, error: "Could not load the toolbar stylesheet." };
      };
    });
    await w.click();
    assert.equal(values(w.calls, "inject").length, injected ? 1 : 0);
    assert.match(values(w.calls, "popup")[0][1].popup, /Could%20not%20load/);
    assert.equal(values(w.calls, "open").length, 1);
  });
}

for (const failure of ["missing API", "open rejected", "set rejected", "reset rejected"]) {
  test(`notice handles ${failure} without leaving an unhandled rejection`, async () => {
    const w = worker((chrome, calls) => {
      chrome.tabs.sendMessage = async () => { throw new Error("page unavailable"); };
      if (failure === "missing API") delete chrome.action.openPopup;
      if (failure === "open rejected") chrome.action.openPopup = async () => { throw new Error("window closed"); };
      if (failure === "set rejected" || failure === "reset rejected") {
        chrome.action.setPopup = async (options) => {
          calls.push(["popup", options]);
          if ((failure === "set rejected") === Boolean(options.popup)) throw new Error("tab closed");
        };
      }
    });
    await w.click();
    assert.equal(values(w.calls, "popup").at(-1)[1].popup, "");
    assert.ok(values(w.calls, "warn").length >= 2);
  });
}

test("clicks without a usable tab ID are ignored", async () => {
  const w = worker();
  for (const id of [undefined, -1, "7"]) await w.click({ id });
  await w.click(null);
  assert.equal(w.calls.length, 0);
});

test("capture validates sender IDs before calling Chrome", async () => {
  const w = worker();
  for (const from of [{}, { tab: { windowId: 3 } }, { tab: { id: 7 } }, { tab: { id: -1, windowId: 3 } }]) {
    assert.deepEqual(await w.request({ type: "GFX_CAPTURE_VISIBLE" }, { ...sender, tab: undefined, ...from }), {
      ok: false, error: "capture requested without a tab",
    });
  }
  assert.equal(w.calls.length, 0);
});

test("active sender captures its window and checks identity before and after", async () => {
  const w = worker();
  assert.deepEqual(await w.request({ type: "GFX_CAPTURE_VISIBLE" }), {
    ok: true, dataUrl: "data:image/png;base64,capture",
  });
  assert.deepEqual(w.calls.map((call) => call[0]), ["query", "capture", "query"]);
  assert.deepEqual(values(w.calls, "capture")[0].slice(0, 3), ["capture", 3, { format: "png" }]);
});

test("inactive sender is rejected without capturing another tab", async () => {
  const w = worker((chrome) => { chrome.tabs.query = async () => [{ id: 8 }]; });
  const response = await w.request({ type: "GFX_CAPTURE_VISIBLE" });
  assert.equal(response.ok, false);
  assert.match(response.error, /requesting tab active/);
  assert.equal(values(w.calls, "capture").length, 0);
});

test("tab switching during capture discards the image", async () => {
  const w = worker((chrome) => {
    let queries = 0;
    chrome.tabs.query = async () => [{ id: ++queries === 1 ? 7 : 8 }];
  });
  const response = await w.request({ type: "GFX_CAPTURE_VISIBLE" });
  assert.equal(response.ok, false);
  assert.equal(response.dataUrl, undefined);
});

test("concurrent captures are serialized and separated by 550ms", async () => {
  const w = worker();
  const responses = await Promise.all(Array.from({ length: 4 }, () => w.request({ type: "GFX_CAPTURE_VISIBLE" })));
  assert.ok(responses.every((response) => response.ok));
  const captures = values(w.calls, "capture");
  assert.equal(captures.length, 4);
  for (let i = 1; i < captures.length; i++) assert.ok(captures[i][3] - captures[i - 1][3] >= 550);
  assert.deepEqual(w.calls.filter((call) => call[0] !== "wait").map((call) => call[0]),
    Array.from({ length: 4 }, () => ["query", "capture", "query"]).flat());
});

test("queued capture rechecks activity after waiting", async () => {
  const w = worker((chrome) => {
    let queries = 0;
    chrome.tabs.query = async () => [{ id: ++queries < 3 ? 7 : 8 }];
  });
  const responses = await Promise.all([w.request({ type: "GFX_CAPTURE_VISIBLE" }), w.request({ type: "GFX_CAPTURE_VISIBLE" })]);
  assert.equal(responses[0].ok, true);
  assert.equal(responses[1].ok, false);
  assert.equal(values(w.calls, "capture").length, 1);
  assert.equal(values(w.calls, "wait").length, 1);
});

test("capture failure is reported and does not poison the queue or bypass quota", async () => {
  const w = worker((chrome) => {
    const capture = chrome.tabs.captureVisibleTab;
    let count = 0;
    chrome.tabs.captureVisibleTab = async (...args) => {
      const value = await capture(...args);
      if (++count === 1) throw new Error("capture failed");
      return value;
    };
  });
  assert.deepEqual(await w.request({ type: "GFX_CAPTURE_VISIBLE" }), { ok: false, error: "capture failed" });
  assert.equal((await w.request({ type: "GFX_CAPTURE_VISIBLE" })).ok, true);
  assert.equal(values(w.calls, "capture")[1][3] - values(w.calls, "capture")[0][3], 550);
});

test("query failure is returned without capturing", async () => {
  const w = worker((chrome) => { chrome.tabs.query = async () => { throw new Error("window closed"); }; });
  assert.deepEqual(await w.request({ type: "GFX_CAPTURE_VISIBLE" }), { ok: false, error: "window closed" });
  assert.equal(values(w.calls, "capture").length, 0);
});

test("download retains its success and validation contract", async () => {
  const w = worker();
  assert.equal((await w.request({ type: "GFX_DOWNLOAD" })).ok, false);
  assert.deepEqual(await w.request({ type: "GFX_DOWNLOAD", dataUrl: "data:image/png;base64,AA==", filename: "capture.png" }), { ok: true, id: 42 });
  assert.deepEqual(values(w.calls, "download"), [["download", { url: "data:image/png;base64,AA==", filename: "capture.png", saveAs: false, conflictAction: "uniquify" }]]);
});

test("download errors are returned to content", async () => {
  const w = worker((chrome) => { chrome.downloads.download = async () => { throw new Error("download denied"); }; });
  assert.deepEqual(await w.request({ type: "GFX_DOWNLOAD", dataUrl: "data:image/png;base64,AA==", filename: "capture.png" }), { ok: false, error: "download denied" });
});

test("unrelated or malformed messages are ignored", () => {
  const w = worker();
  for (const msg of [null, {}, { type: 1 }, { type: "OTHER" }]) {
    assert.equal(w.message(msg, {}, () => assert.fail("unexpected response")), undefined);
  }
  assert.equal(w.calls.length, 0);
});

test("activation requires an explicit successful main-frame acknowledgement", async () => {
  for (const response of [undefined, null, {}, { ok: false }, { ok: "true" }]) {
    const w = worker((chrome) => { chrome.tabs.sendMessage = async () => response; });
    await w.click();
    assert.equal(values(w.calls, "inject").length, 0);
    assert.equal(values(w.calls, "open").length, 1);
    assert.match(values(w.calls, "popup")[0][1].popup, /acknowledge/);
  }
});

test("privileged requests reject foreign, subframe, and inactive-document senders", async () => {
  const w = worker();
  for (const type of ["GFX_CAPTURE_VISIBLE", "GFX_DOWNLOAD"]) {
    for (const from of [null, {}, { ...sender, id: "other-extension" }, { ...sender, frameId: 2 },
      { ...sender, frameId: undefined }, { ...sender, documentLifecycle: "prerender" },
      { ...sender, documentLifecycle: "cached" }]) {
      const response = await w.request({ type, dataUrl: "data:image/png;base64,AA==", filename: "capture.png" }, from);
      assert.equal(response.ok, false);
      assert.match(response.error, /main-frame content script/);
    }
  }
  assert.equal(w.calls.length, 0);
});

test("switching away and back during capture still discards the image", async () => {
  let w;
  w = worker((chrome) => {
    const capture = chrome.tabs.captureVisibleTab;
    chrome.tabs.captureVisibleTab = async (...args) => {
      const dataUrl = await capture(...args);
      w.activated();
      w.activated();
      return dataUrl;
    };
  });
  const response = await w.request({ type: "GFX_CAPTURE_VISIBLE" });
  assert.equal(response.ok, false);
  assert.equal(response.dataUrl, undefined);
  assert.match(response.error, /active and unchanged/);
});

test("navigation during capture is rejected and does not poison later requests", async () => {
  let w, count = 0;
  w = worker((chrome) => {
    const capture = chrome.tabs.captureVisibleTab;
    chrome.tabs.captureVisibleTab = async (...args) => {
      const dataUrl = await capture(...args);
      if (++count === 1) w.updated({ status: "loading" });
      return dataUrl;
    };
  });
  assert.equal((await w.request({ type: "GFX_CAPTURE_VISIBLE" })).ok, false);
  assert.equal((await w.request({ type: "GFX_CAPTURE_VISIBLE" })).ok, true);
});

test("unrelated window activation and other-tab updates do not cancel capture", async () => {
  let w;
  w = worker((chrome) => {
    chrome.tabs.captureVisibleTab = async () => {
      w.activated(4);
      w.updated({ status: "loading" }, 8);
      w.updated({ title: "Changed title" });
      return "data:image/png;base64,capture";
    };
  });
  assert.equal((await w.request({ type: "GFX_CAPTURE_VISIBLE" })).ok, true);
});

test("queued requests reject a different or pending page in the same tab", async () => {
  for (const current of [{ ...tab, url: "https://example.com/new" },
    { ...tab, url: "https://example.com/original", pendingUrl: "https://example.com/new" }]) {
    const w = worker((chrome) => { chrome.tabs.query = async () => [current]; });
    const response = await w.request({ type: "GFX_CAPTURE_VISIBLE" }, {
      ...sender, tab: { ...tab, url: "https://example.com/original" },
    });
    assert.equal(response.ok, false);
    assert.match(response.error, /page changed/);
    assert.equal(values(w.calls, "capture").length, 0);
  }
});

test("capture quota is shared across requesting windows", async () => {
  const otherTab = { id: 8, windowId: 4 };
  const w = worker((chrome) => {
    chrome.tabs.query = async ({ windowId }) => [windowId === 3 ? tab : otherTab];
  });
  const responses = await Promise.all([
    w.request({ type: "GFX_CAPTURE_VISIBLE" }),
    w.request({ type: "GFX_CAPTURE_VISIBLE" }, { ...sender, tab: otherTab }),
  ]);
  assert.ok(responses.every((response) => response.ok));
  const captures = values(w.calls, "capture");
  assert.deepEqual(captures.map((call) => call[1]), [3, 4]);
  assert.equal(captures[1][3] - captures[0][3], 550);
});

test("downloads accept PNG data and a relative folder without accepting arbitrary URLs or paths", async () => {
  const w = worker();
  const valid = { type: "GFX_DOWNLOAD", dataUrl: "data:image/png;base64,AA==", filename: "glass-feedback/capture.png" };
  for (const dataUrl of ["https://example.com/payload", "file:///tmp/payload", "blob:https://example.com/payload",
    "data:text/html;base64,AA==", "data:image/jpeg;base64,AA==", "data:image/png;base64,", "data:image/png;base64,a", "data:image/png;base64,<svg>"]) {
    assert.equal((await w.request({ ...valid, dataUrl })).ok, false);
  }
  for (const filename of ["", "/capture.png", "../capture.png", "folder/../capture.png", "folder/./capture.png",
    "folder//capture.png", "C:/capture.png", "folder\\capture.png", "capture.html", "bad\u0000.png"]) {
    assert.equal((await w.request({ ...valid, filename })).ok, false);
  }
  assert.equal(w.calls.length, 0);
  assert.deepEqual(await w.request(valid), { ok: true, id: 42 });
});

test("synchronous download API errors are returned through the message contract", async () => {
  const w = worker((chrome) => { chrome.downloads.download = () => { throw new Error("invalid URL"); }; });
  assert.deepEqual(await w.request({ type: "GFX_DOWNLOAD", dataUrl: "data:image/png;base64,AA==", filename: "capture.png" }),
    { ok: false, error: "invalid URL" });
});

test("downloads accept matching image formats and honor the Save As preference", async () => {
  const w = worker();
  for (const [mime, extension] of [["png", "png"], ["jpeg", "jpg"], ["jpeg", "jpeg"], ["webp", "webp"]]) {
    const dataUrl = `data:image/${mime};base64,AA==`, filename = `screenshots/work/capture.${extension}`;
    assert.deepEqual(await w.request({ type: "GFX_DOWNLOAD", dataUrl, filename, saveAs: true }), { ok: true, id: 42 });
    assert.deepEqual(values(w.calls, "download").at(-1), ["download", { url: dataUrl, filename, saveAs: true, conflictAction: "uniquify" }]);
  }
});

test("downloads reject format/extension mismatches and non-boolean Save As values", async () => {
  const w = worker();
  for (const [mime, filename, saveAs] of [["jpeg", "capture.png", false], ["png", "capture.webp", false],
    ["webp", "capture.jpg", false], ["gif", "capture.gif", true], ["png", "capture.png", "false"]]) {
    assert.equal((await w.request({ type: "GFX_DOWNLOAD", dataUrl: `data:image/${mime};base64,AA==`, filename, saveAs })).ok, false);
  }
  assert.equal(values(w.calls, "download").length, 0);
});

test("PNG validation handles multi-megabyte screenshots without regex stack overflow", async () => {
  const w = worker();
  const dataUrl = "data:image/png;base64," + "AAAA".repeat(1024 * 1024);
  assert.deepEqual(await w.request({ type: "GFX_DOWNLOAD", dataUrl, filename: "capture.png" }), { ok: true, id: 42 });
  const invalid = await w.request({ type: "GFX_DOWNLOAD", dataUrl: dataUrl.slice(0, -1) + "?", filename: "capture.png" });
  assert.equal(invalid.ok, false);
  assert.equal(values(w.calls, "download").length, 1);
});

test("failure details render as text and remain hidden when no reason is provided", () => {
  const source = readFileSync(new URL("../unavailable.js", import.meta.url), "utf8");
  for (const reason of ["", "<img src=x onerror=alert(1)> & secret"]) {
    const detail = { hidden: true, textContent: "", set innerHTML(value) { assert.fail(`HTML written: ${value}`); } };
    runInNewContext(source, { URLSearchParams, location: { search: `?reason=${encodeURIComponent(reason)}` },
      document: { getElementById: (id) => { assert.equal(id, "reason"); return detail; } } });
    assert.equal(detail.hidden, !reason);
    assert.equal(detail.textContent, reason ? `Details: ${reason}` : "");
  }
});

function productionSnapshot(t) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const snapshot = mkdtempSync(join(tmpdir(), "glass-feedback-check-test-"));
  t.after(() => rmSync(snapshot, { recursive: true, force: true }));
  for (const file of [...PACKAGE_FILES, "package.json"]) {
    mkdirSync(dirname(join(snapshot, file)), { recursive: true });
    copyFileSync(join(root, file), join(snapshot, file));
  }
  return { root, snapshot, check: () => spawnSync(process.execPath, [join(root, "tools/check.mjs"), snapshot], { encoding: "utf8" }) };
}

test("static check accepts a staged production snapshot", (t) => {
  const { check } = productionSnapshot(t);
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Check OK/);
});

test("static check enforces the permission, Chrome-version, and dependency contracts", (t) => {
  const { snapshot, check } = productionSnapshot(t);
  const manifestFile = join(snapshot, "manifest.json"), packageFile = join(snapshot, "package.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  manifest.minimum_chrome_version = "not-a-version";
  manifest.permissions.push("tabs");
  manifest.action.default_popup = "unavailable.html";
  manifest.externally_connectable = { matches: ["https://example.com/*"] };
  writeFileSync(manifestFile, JSON.stringify(manifest));
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  pkg.dependencies = { unwanted: "1.0.0" };
  writeFileSync(packageFile, JSON.stringify(pkg));
  const result = check();
  assert.equal(result.status, 1);
  for (const expected of [/minimum_chrome_version/, /Unexpected permission: tabs/, /default popup/, /External messaging/, /runtime package dependencies/]) {
    assert.match(result.stderr, expected);
  }
});

test("static check rejects linked external runtime assets and production symlinks", (t) => {
  const { root, snapshot, check } = productionSnapshot(t);
  const html = join(snapshot, "unavailable.html");
  writeFileSync(html, readFileSync(html, "utf8") + '<script src="https://example.com/remote.js"></script>');
  const external = check();
  assert.equal(external.status, 1);
  assert.match(external.stderr, /runtime assets must be local/);
  rmSync(join(snapshot, "background.js"));
  symlinkSync(join(root, "background.js"), join(snapshot, "background.js"));
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing production file: background.js/);
});

test("legacy verification entrypoints cannot claim browser passes", async () => {
  const ui = await import("../tools/verify-ui.mjs"), layout = await import("../tools/verify-layout.mjs");
  assert.throws(() => ui.default({}), /retired.*CUA/);
  assert.throws(() => layout.default({}), /retired.*CUA/);
  assert.equal(ui.UI_CHECKS.length, 5);
  assert.equal(layout.LAYOUT_CHECKS.length, 5);
});

test("static check also rejects symlinked production directories", (t) => {
  const { root, snapshot, check } = productionSnapshot(t);
  rmSync(join(snapshot, "assets"), { recursive: true, force: true });
  symlinkSync(join(root, "assets"), join(snapshot, "assets"), "dir");
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing production file: assets\/lens-map.png/);
});

test("malformed package metadata produces a concise check failure", (t) => {
  const { snapshot, check } = productionSnapshot(t);
  writeFileSync(join(snapshot, "package.json"), "{");
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Invalid package.json:/);
  assert.doesNotMatch(result.stderr, /at ModuleJob/);
});


test("global activation persists and applies the same state to all existing tabs", async () => {
  const w = worker((chrome) => { chrome.tabs.query = async () => [tab, { id: 8 }, { id: 9 }]; });
  await w.click();
  assert.equal(w.stored.gfxEnabled, true);
  assert.deepEqual(values(w.calls, "toggle").map((call) => [call[1], call[2].enabled]), [[7, true], [8, true], [9, true]]);
  await w.click({ id: 8 });
  assert.equal(w.stored.gfxEnabled, false);
  assert.deepEqual(values(w.calls, "toggle").slice(3).map((call) => [call[1], call[2].enabled]), [[8, false], [7, false], [9, false]]);
});

test("clicks in different tabs serialize changes to the global setting", async () => {
  const w = worker();
  await Promise.all([w.click(), w.click({ id: 8 })]);
  assert.equal(w.stored.gfxEnabled, false);
});

test("a worker restart reads saved activation before toggling", async () => {
  const w = worker((chrome) => { chrome.storage.local.get = async () => ({ gfxEnabled: true }); });
  await w.click();
  assert.equal(w.stored.gfxEnabled, false);
  assert.equal(values(w.calls, "toggle")[0][2].enabled, false);
});

test("an unavailable background tab does not open an unsolicited notice", async () => {
  const w = worker((chrome) => {
    chrome.tabs.query = async () => [tab, { id: 8 }];
    chrome.tabs.sendMessage = async (id) => {
      if (id === 8) throw new Error("Cannot access a protected page");
      return { ok: true };
    };
  });
  await w.click();
  assert.equal(w.stored.gfxEnabled, true);
  assert.equal(values(w.calls, "open").length, 0);
});
