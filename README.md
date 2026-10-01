# Glass Feedback

A dead-simple, glassy in-browser feedback tool. Annotate any page with text
notes and capture screenshots — a cropped selection or the full page — straight
to your clipboard or a folder. Built as a Manifest V3 Chrome extension.

The liquid-glass personality is the point of the project, not decorative polish.
Preserve the clear refractive lens, rim light, grain, iridescent ink, and spring
squeeze/stretch. Expanding controls should grow from one continuous water-drop
surface rather than appear as detached buttons or cards.

## v0.2 workflow

This describes the development version. The published Chrome Web Store release
is still v0.1.0; release checks and followups are in [the roadmap](docs/ROADMAP.md).

- **Open on demand:** click the extension icon on a supported page. v0.2 uses
  `activeTab` + `scripting` to inject the UI only after that user action. Drag the
  floating toolbar anywhere on screen. Hover the main icon for 240 ms to reveal
  the other mode, then hover either icon to reveal its options. The primary
  action, alternate mode, and options share one continuously expanding glass
  surface. Options follow your mouse-entry side and flip when necessary to stay
  on screen. Clicking the
  main icon performs the current mode's action; it does not expand the menu.
- **Capture:** the camera initially uses **Selection → Copy to clipboard**.
  Its primary click captures with the chosen settings; if Selection has no
  region, draw or adjust a region first, then click the explicit **Capture**
  button. For **Full page**, choose the scope and click the camera to capture
  using the chosen destination.
- **Choose options:** delayed hover flyouts expose scope (Selection / Full page)
  and destination (Clipboard / Download). Options open perpendicular to the
  toolbar and stay inside the viewport, including at corners and after resize.
- **Annotate:** choose **Add notes** or **Draw** to enter one editing session.
  Its palette stays visible when the pointer leaves: Add notes, Draw, and
  **Annotation appearance** remain accessible without hovering the main icon.
  Hover Annotation appearance for 240 ms or click it to expand the same palette
  with **Erase drawing**, **Undo last drawing**, **Light notes**, and
  **Annotation opacity**. Switching Note/Draw keeps the session active;
  **Escape** or **X** exits. Notes and strokes use
  document-coordinate anchors so they scroll with the page and keep their
  document positions on viewport resize. Captures include visible annotations.
- **Remember preferences:** `chrome.storage.local` retains capture scope,
  destination, annotation tool, note theme/transparency, and stroke transparency. Notes and
  drawings stay in the current page session: toggling visibility hides/restores
  them, and reloading the page clears them. Only preferences persist.

Example: open the UI, click the camera, drag a region, and click **Capture** to
copy it. For a longer review, add notes and strokes, hover the camera to choose
**Full page → Download**, then click the camera to save the annotated page.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `glass-feedback-extension/` folder.
4. Pin the extension, then click its toolbar icon on a supported web page to
   show/hide the floating UI. (It can't run on `chrome://` pages or the Chrome
   Web Store.)

Downloads land in your browser's download folder under a `glass-feedback/`
subfolder.

## Regenerating assets

Icons and the glass refraction lens map are generated with dependency-free
scripts (no npm install needed):

```bash
node tools/gen-icons.mjs     # icons/icon{16,32,48,128}.png
node tools/gen-lensmap.mjs   # assets/lens-map.png (displacement map)
```

## Development checks

This project has no runtime dependencies. Run the manifest and referenced-file
check before loading the extension or opening a pull request:

```bash
npm run check
npm test
npm run package          # creates dist/glass-feedback-0.2.0.zip
npm run generate-assets  # only when changing an asset generator
```

Checks, worker tests, and production ZIP packaging run in GitHub Actions on every
push and pull request. Packaging includes only the extension's runtime files.
Load the folder unpacked in Chrome 127 or later before publishing a new version.

See [PRIVACY.md](PRIVACY.md) for the extension's data-handling policy.

The lens map is an RGBA displacement map (R = horizontal bend, G = vertical,
gray = neutral) with a clear center and refraction ramped toward the rim — that
is what gives the toolbar its real-glass lens edge. It's loaded at runtime and
inlined as a `data:` URI so the SVG filter is never tainted by a cross-origin
`chrome-extension://` reference on real pages.

## Previewing the UI without Chrome

`tools/demo.html` renders the toolbar over light and dark regions
with the Chrome APIs stubbed. Serve it over HTTP (the lens map is fetched, so
`file://` won't work):

```bash
python3 -m http.server 8731
# open http://localhost:8731/tools/demo.html
```

## Architecture

| File                  | Role                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `manifest.json`       | MV3 manifest and permissions for user-invoked injection.                    |
| `background.js`       | Service worker: toggles the UI, `captureVisibleTab`, and `downloads`.       |
| `content/content.js`  | All in-page behavior, rendered into an isolated Shadow DOM.                  |
| `content/content.css` | The glass design system + component styles (Shadow-DOM scoped).             |
| `assets/lens-map.png` | Displacement map driving the liquid-glass refraction filter.                |
| `unavailable.*`       | Explanation popup when Chrome prevents page access or activation fails.     |
| `tools/`              | Asset generators, packaging, demo, real-capture fixture, and UI verification. |

The UI lives in a Shadow DOM so host-page CSS can't leak in or out. The toolbar
and flyouts stay viewport-bound; annotation anchors belong to the document.
The original liquid-glass personality is a critical part of the product:
refraction, rim highlights, the moving lens, and spring expansion should read
as one continuous surface. The UI contract uses `.gfx-pill` for the primary
action, `.gfx-alternate` for the other mode, and `.gfx-options` for the selected
mode's options. `.gfx-surface` supplies the single glass silhouette through a
CSS `clip-path: path(...)` and spring transform; the root's `.gfx-liquid` is the
animated lens. The latest surface and motion refinement is pending browser
verification; earlier evidence is retained in [VERIFICATION.md](docs/VERIFICATION.md).
The manifest grants `activeTab`, `scripting`, `downloads`, and `storage`, with
no automatic content-script registration. Only preferences should be stored
in local extension storage.

If Chrome blocks an image clipboard write, the current implementation falls
back to a download and tells you. Note controls are hidden in captures so only
the annotation appears. See [verification evidence](docs/VERIFICATION.md) for the
real-Chrome checks and limits of the current coverage.

## Known limitations

- **Full-page capture** scrolls and stitches `captureVisibleTab` frames (~2/sec
  due to Chrome's quota), so tall pages take a few seconds. Pages with
  `position: fixed`/sticky headers may show that element repeated across the
  stitch. Oversized captures fail with a notice rather than silently cropping:
  the maximum canvas dimension is 16,384 pixels and the pixel budget is 64 Mi.
  Horizontal
  overflow isn't stitched (viewport width only).
- Lazy-loaded/virtualized content may not all be captured if it renders only on
  view. Full-page mode captures the document's vertical scroll, not independent
  nested scroll containers. Use Selection on these pages.
- Annotations keep document coordinates, not semantic anchors to page elements.
  Scrolling and viewport resizing preserve their coordinates, but responsive
  reflow or changing page content can move the underlying element away.

## Status

v0.2 is ready for hands-on testing, not yet published to the Chrome Web Store.
The demo is useful for visual checks, but uses stubbed capture APIs. Real-Chrome
verification and remaining website coverage are documented in
[the roadmap](docs/ROADMAP.md). Updated walkthroughs follow once the UX settles.
