# Glass Feedback

A dead-simple, glassy in-browser feedback tool. Annotate any page with text
notes and capture screenshots — a cropped selection or the full page — straight
to your clipboard or a folder. Built as a Manifest V3 Chrome extension.

## Features

- **Floating glass toolbar** — a small round pill that floats over any page.
  Drag it anywhere; on release it _gently pins_ to the nearest screen edge.
  Tap it to expand into a row of tools; tap again to collapse.
- **Select tool** — drag a rectangle to crop. The rest of the page dims and
  blurs to focus the selection. The crop box can be moved and resized via 8
  handles. Drag a fresh rectangle to start over (only one selection at a time).
- **Text tool** — drop a resizable note anywhere. Notes use an eye-friendly
  dark theme (or flip to light) and stay anchored to the page position where you
  placed them, so they scroll with the content.
- **Save** — choose **Copy to clipboard** or **Download to folder**, for either
  the **Selection** (if you have one) or the **Full page**. Captures include any
  text notes that are visible.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select this `glass-feedback-extension/` folder.
4. Pin the extension, then click its toolbar icon on any normal web page to
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
npm run generate-assets  # only when changing an asset generator
```

The same check runs in GitHub Actions on every push and pull request.

The lens map is an RGBA displacement map (R = horizontal bend, G = vertical,
gray = neutral) with a clear center and refraction ramped toward the rim — that
is what gives the toolbar its real-glass lens edge. It's loaded at runtime and
inlined as a `data:` URI so the SVG filter is never tainted by a cross-origin
`chrome-extension://` reference on real pages.

## Previewing the UI without Chrome

`tools/demo.html` renders the toolbar over light, dark, and photographic regions
with the Chrome APIs stubbed. Serve it over HTTP (the lens map is fetched, so
`file://` won't work):

```bash
python3 -m http.server 8731
# open http://localhost:8731/tools/demo.html
```

## Architecture

| File                  | Role                                                                        |
| --------------------- | --------------------------------------------------------------------------- |
| `manifest.json`       | MV3 manifest, permissions, content-script + service-worker registration.    |
| `background.js`       | Service worker: toggles the UI, `captureVisibleTab`, and `downloads`.       |
| `content/content.js`  | All in-page behavior, rendered into an isolated Shadow DOM.                  |
| `content/content.css` | The glass design system + component styles (Shadow-DOM scoped).             |
| `assets/lens-map.png` | Displacement map driving the liquid-glass refraction filter.                |
| `tools/`              | Dev-only: asset generators (`gen-icons`, `gen-lensmap`) + `demo.html` harness. |

The UI lives in a Shadow DOM so host-page CSS can't leak in or out. Text notes
are absolutely positioned in document coordinates (they scroll with the page);
the toolbar and selection overlay are viewport-fixed.

## Assumptions made (open for the reconciliation round)

These were judgment calls where the spec left room. Easy to change:

1. **Enable/disable** is driven by clicking the extension's toolbar icon, which
   toggles the floating UI on the active tab. The UI starts hidden per page
   load (state is not persisted across reloads).
2. **Cropped vs. full-page** is offered explicitly in the Save menu rather than
   inferred: if a selection exists you get both "Selection" and "Full page"
   groups; otherwise just "Full page".
3. **Clipboard fallback** — if the browser blocks an image clipboard write
   (e.g. lost user-activation after a long full-page capture, or a page's
   permissions policy), it automatically falls back to a download and tells you.
4. **Note control chrome** (theme/delete buttons, drag bar, resize handle) is
   hidden in captures so only the clean note card appears.
5. **Edge pinning** snaps to the single nearest edge (left/right/top/bottom).
   When pinned right, the tool row expands leftward.

## Known limitations

- **Full-page capture** scrolls and stitches `captureVisibleTab` frames (~2/sec
  due to Chrome's quota), so tall pages take a few seconds. Pages with
  `position: fixed`/sticky headers may show that element repeated across the
  stitch, and very tall pages are clamped to a max canvas dimension. Horizontal
  overflow isn't stitched (viewport width only).
- Lazy-loaded/virtualized content may not all be captured if it renders only on
  view.

## Status

End-to-end functional and visually complete. The glass UI is implemented per the
Aave "glass for the web" technique: an SVG lens-refraction filter (`assets/lens-map.png`),
layered specular/rim shadows, grain, and design tokens — plus a liquid selection
bubble that springs between tools with an iridescent under-glass glyph.
