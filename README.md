# Glassy

Glassy (published in Chrome as Glass Feedback) is an extension for marking up web pages and exporting
the result as an image. It combines region/full-page screenshots with smart
drawing, element outlines, and notes attached to drawings.

The interface is built around **Glassy**, a movable liquid-glass control.
Refraction, continuous expanding surfaces, and spring-driven motion are part
of the product, not a theme layered over a conventional toolbar.

The implementation is plain JavaScript, CSS, SVG, and Canvas using
**Manifest V3**. There is no framework, backend, runtime package dependency,
or build step required to load the extension. The source version is
`0.2.0`; the [Chrome Web Store](https://chromewebstore.google.com/detail/glass-feedback/kihjocbmloocaobeiaimofhpfkaheoan)
release is managed separately.

[Try the live demo](https://chriswhawkins.github.io/glass-feedback-extension/).
For the upload ZIP and publisher steps, see [release notes](docs/UPDATE_0.2.0.md).

## Product surface

**Camera** captures a user-selected viewport region or scrolls and stitches a
full-page image. Output is PNG, written to the clipboard or Chrome's download
location. Clipboard failure falls back to a download with a visible notice.

**Annotate** interprets quick lines as arrows, hold-and-drag gestures as
rectangles, and other strokes as freehand drawings. Optional element targeting
creates outlines tied to DOM elements. Each drawing has its own color,
opacity, deletion control, and associated note. Notes support editing,
light/dark appearance, opacity, and bold/italic/underline text.

Glassy exposes modes horizontally and tool options vertically. Clicking it
reveals both branches; dragging repositions it. Esc releases the page for
normal browsing. The browser extension icon controls activation across
supported tabs. See the [user guide](docs/USER_GUIDE.md) for interaction details.

## Code organization

| Location | Responsibility |
| --- | --- |
| `manifest.json`, `background.js` | Browser integration: activation, message validation, serialized tab capture, downloads, and restricted-page notices. |
| `content/content.js` | In-page state, DOM/SVG UI, pointer gestures, annotations, liquid motion, crop selection, image composition, and export orchestration. |
| `content/content.css`, `assets/`, `icons/` | Isolated UI styles, bundled refraction map, and extension artwork. |
| `tools/` | Interactive demo, native test fixture, asset/media generators, static validation, manual browser checklists, and ZIP packaging. |
| `tests/`, `.github/workflows/validate.yml` | Node regression tests and CI checks/package creation. |

### Runtime boundaries

The main-frame content script registers message/storage listeners on supported
pages. It reads the persisted activation state and builds the UI when enabled.
A duplicate-injection guard prevents multiple instances in the same document.

The UI lives in an **open Shadow DOM** with an adopted stylesheet, hosted in a
manual popover in the browser's top layer. This separates component styling
from website CSS and lets the controls sit above ordinary page stacking contexts.
Notes and SVG drawings use document coordinates; tool menus use viewport bounds.
Element outlines retain references to their selected DOM targets.

The service worker owns APIs unavailable to content scripts. Clicking the
browser action updates the shared activation setting and notifies open tabs;
missing receivers get the bundled content script injected. Protected-page
failures use `unavailable.html` to explain the restriction.

Capture follows a message boundary: the content script requests a visible-tab
PNG with `GFX_CAPTURE_VISIBLE`; the worker validates the sender and active tab,
serializes requests, and enforces a 550 ms capture interval. The content script
crops or stitches the returned pixels using Canvas. Clipboard writes happen
there; file exports use `GFX_DOWNLOAD` through the worker.

The glass renderer combines CSS backdrop filtering, an SVG displacement filter
using `assets/lens-map.png`, and animation-frame-driven surface/lens geometry.
When changing controls, preserve the connected surface, refraction, and motion
alongside hit targets and viewport containment.

### State and persistence

`chrome.storage.local` stores `gfxEnabled` (shared activation) and
`gfxPreferences` (tool defaults and appearance preferences). Storage changes
synchronize activation across documents.

Annotation text, formatting, drawing geometry, DOM associations, and screenshot
pixels remain in page memory. Hiding/reopening preserves annotations in the
same document; reload or navigation clears them. This is an annotation/export
tool, not a persistent document editor.

## Run locally

Use **Chrome 127+**. Open `chrome://extensions`, enable Developer mode, choose
**Load unpacked**, and select this repository root. No compilation or package
installation is required. Click the extension icon on a supported page.

After runtime edits, reload the extension in Chrome and reload the target page.
Existing documents may still contain the previous content script.

For the shared-UI demo, serve the repository root:

```bash
python3 -m http.server 8732
```

Open `http://localhost:8732/tools/demo.html`. It loads the extension's actual
UI source with stubbed Chrome APIs and localStorage-backed preferences.
Annotation and crop interactions work; native screenshot/clipboard/download
operations intentionally show an extension-only explanation.

To test the installed extension without demo stubs, open
`http://localhost:8732/tools/demo.html?extension=1#playground` and activate it
from Chrome's toolbar. `tools/fixture.html` provides tall sample content with a
strict Content Security Policy for activation and scrolling-capture checks.

## Development workflow

Development scripts require **Node.js 20+**. Packaging also requires the
`zip` command. Asset regeneration requires **ffmpeg**; generated runtime
assets are committed, so ffmpeg is not needed to load or package the extension.

```bash
npm run validate        # static validation and Node regression tests
npm run package         # dist/glass-feedback-<manifest-version>.zip
npm run generate-assets # regenerate bundled icons and refraction map
```

`npm run check` and `npm test` run the validation stages independently.
Tests cover worker/content behavior with mocked browser APIs and demo/media
contracts; they do not establish native Chrome capture or visual quality.
CI runs validation and packaging on pushes and pull requests.

`npm run checklist:ui` and `npm run checklist:layout` print manual browser
plans, not automated browser results. Exercise the final unpacked build and
inspect actual exported pixels after changing capture or annotation behavior.

`tools/package.mjs` stages an explicit runtime-file allowlist, validates it,
and creates the ZIP with the manifest at its root. Demo pages, documentation,
tests, and promotional media do not enter the archive.

Promotional media is separate from runtime assets. Rebuild it with
`node tools/build-media.mjs [capture-directory]`; this requires ffmpeg and
retained real-browser capture frames. See the
[media kit](store-assets/0.2.0/README.md) for formats and provenance.

The [Glassy mascot](assets/brand/glassy-mascot-v1.png) is the branding master
used for extension icons and the demo. Its [generation record](assets/brand/glassy-mascot-v1.md)
documents provenance; it does not replace the in-page tool glyphs.

## Permissions and data handling

The manifest requests `activeTab`, `scripting`, `downloads`, `storage`, and
`<all_urls>` host access. These support browser-action activation, restoring
activation on navigation, screenshot capture, and local export. Chrome's
site-access settings still govern where the extension can run.

Only the bundled stylesheet and lens image are web-accessible resources.
Executable code is bundled; page content and screenshots are processed locally.
There are no accounts, analytics, or uploads to the developer.
See [PRIVACY.md](PRIVACY.md) for retention, export destinations, and disclosures.

## Engineering constraints

- **Page access:** Chrome-protected pages cannot host tools. File pages require
  separate file access; embedded frames are not directly annotated.
- **Capture scope:** full-page stitching covers the vertical document, not
  nested scrollers or horizontal overflow. Sticky elements can repeat;
  lazy/virtualized content may be incomplete. Tab, page-height, or scale
  changes can abort capture.
- **Output limits:** 16,384 pixels per dimension and 64 × 1024 × 1024 total
  pixels. Device scaling affects when these limits are reached.
- **Anchoring:** coordinate-based annotations do not track responsive reflow.
  Element associations depend on the selected DOM node remaining present.
- **Input coverage:** drawing and targeting require a pointer. Complete
  keyboard-only, touch, and screen-reader workflows need further verification.

## Project references

[User guide](docs/USER_GUIDE.md) · [Changelog](CHANGELOG.md) ·
[Release roadmap](docs/ROADMAP.md) · [Release evidence](docs/RELEASE_READINESS.md) ·
[Store listing copy](docs/STORE_LISTING.md)

Report reproducible problems through
[GitHub issues](https://github.com/chriswhawkins/glass-feedback-extension/issues).
Use safe sample pages; do not include private page content in public reports.
