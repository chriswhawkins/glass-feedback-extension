# Glass Feedback

Annotate supported web pages with notes, freehand drawings, rectangles, and
element highlights, then export a region or full-page image to your clipboard or
downloads. Glassy is the floating liquid-glass control for this Manifest V3
Chrome extension.

**Release status:** Chrome Web Store **0.1.0**, updated **2026-09-25**. This
checkout's manifest and package are **0.2.0**, an upcoming release. The workflow
below describes current development source. See the [release checklist](docs/ROADMAP.md),
[draft Store copy](docs/STORE_LISTING.md), and [changelog](CHANGELOG.md).
[Current release readiness](docs/RELEASE_READINESS.md) records checks, browser evidence,
and remaining gates. [Historical verification](docs/VERIFICATION.md) records earlier builds.

## First use

1. In Chrome **127 or later**, open `chrome://extensions`, enable **Developer
   mode**, and choose **Load unpacked** with this repository folder.
2. Pin Glass Feedback and click its browser toolbar icon on a supported page.
   This turns it on across supported pages and tabs, including after navigation
   or a browser restart. Click the icon again to turn it off everywhere.
   Glassy opens with Camera active. Click the browser icon again to hide the UI
   and annotations; reopening preserves them in the same document.
3. For the default **Selection → Copy to clipboard**, drag on the page to draw
   a viewport region. Adjust its edges or move it, then click the region's
   **Capture** button to confirm.
4. Hover Glassy and slowly pull left or right to reveal modes. Hover a mode
   icon, then leave the menu to select it, or click the icon. Pull up or down
   from Glassy for the selected mode's options.
5. Click Glassy to activate and reveal mode choices and current tool options
   together. Press **Esc** to release the page for browsing. Tools do not time out.
   Switching to Annotate activates it immediately; annotations remain visible.

See the [user guide](docs/USER_GUIDE.md) for item editing and keyboard/touch controls.

## Two modes

| Mode | Page action | Options |
| --- | --- | --- |
| **Camera** | Selection: drag a viewport region and confirm. ✕ clears it for retry; Esc releases Camera. Full page: click anywhere to capture. | Selection / Full page; Copy PNG / Save PNG to Downloads. |
| **Annotate** | Draw a line for an arrow; hold briefly then drag for a rectangle; sketch anything else. Optionally click highlighted page elements to outline them. | Element highlighting on/off; next drawing color; notes shown/hidden on new drawings. |

Drag Glassy's main icon to reposition it. It stays where you place it; menus
fit around the viewport. Global settings and separate Note/Wand modes are hidden.

Hover an item to reveal its handle, then hover the handle to expand its toolbar.
Handles also open on click or keyboard focus. Drawing tools show/hide an associated
note, change color/opacity, and delete. Note tools offer light/dark, opacity,
and delete. Hover the opacity droplet for a slider; click to keep it open,
then click again to close. Select note text for bold, italic, and
underline. Drag regular note edges to move it; the bottom-right corner resizes it.

New notes start light at **15% glass-background opacity**. Drawings and element
highlights start blue (`#345b8c`); the initial recent colors are blue and red
(`#ff526b`). Default-color changes affect only new drawings. Each completed
drawing gesture is a separate item. Hiding a note preserves its text; deleting
the note leaves its drawing in place. Rest on a drawing to reveal nearby tools
and make it ready to grab/move.

## Capture, access, and privacy

Visible annotations are included in captures; editing controls are hidden for
export. Saved images are lossless PNG in Chrome's configured download location
(normally Downloads). Chrome's own download preferences may prompt for a location.
Clipboard copies are PNG too. If an
image clipboard write fails, the extension falls back to a download and tells
you. Keep the requesting tab active and avoid scrolling or resizing during capture.

Website content, annotations, and screenshot pixels are handled locally.
Preferences and the global on/off setting persist in `chrome.storage.local`. Annotation content clears
on reload or navigation. There are no accounts, analytics, screenshot uploads,
or remotely loaded executable code. See [the privacy policy](PRIVACY.md).

The manifest requests `activeTab`, `scripting`, `downloads`, and `storage`.
It also requests `<all_urls>` host access so the toolbar and screenshot capture
work across supported pages after activation. A main-frame content script
restores the saved on/off setting on each page; the toolbar is built only when
turned on. Chrome site-access controls must allow the extension on those sites.
The bundled stylesheet and lens image are exposed through `web_accessible_resources`.

## Known limits

- **Page access:** Chrome-protected pages, including `chrome://` pages and the
  Chrome Web Store, cannot host the tools. File pages require Chrome's separate
  file-access setting. The UI does not directly annotate inside embedded frames.
- **Full-page images:** capture scrolls and stitches the vertical document at
  roughly two frames per second. Fixed/sticky content can repeat. Lazy loading,
  virtualization can be incomplete; changing page height or capture scale
  aborts with a retry message. Nested scroll
  containers and horizontal overflow are not stitched.
- **Image size:** output is capped at 16,384 pixels per dimension and
  64 × 1024 × 1024 pixels overall. Display scaling affects these limits.
  Oversized images show an error; use a smaller region.
- **Anchors:** regular notes/drawings use document coordinates, so reflow may
  move page content away. Element outlines follow the selected DOM element while it
  exists; replacing the element can break that association.
- **Input:** region drawing, movement, and element targeting require a pointer.
  Complete keyboard-only, touch, and screen-reader flows need current browser
  verification. Clicking Glassy reveals choices without a directional hover.

## Local demo

Serve the repository root over HTTP:

```bash
python3 -m http.server 8732
```

Open `http://localhost:8732/tools/demo.html`. The demo loads the same UI code
over light, dark, illustrated, and colorful sample panels. Smart drawing,
associated notes, and element outlines are interactive. Camera explains that real screenshots,
clipboard export, and image downloads require the extension.
Chrome APIs are stubbed; preferences use the origin's `localStorage`.
The demo is not capture verification. Its Store links lead to the published build,
which may differ from this upcoming 0.2.0 preview. A real-UI walkthrough shows
the flow. Clear canvas reloads without resetting preferences.

To exercise your installed unpacked extension on the same canvases, open
`http://localhost:8732/tools/demo.html?extension=1#playground`, then click the
extension's Chrome toolbar icon. This variant loads no demo tools or API stubs.
`tools/fixture.html` is a separate, tall fixture with a strict Content Security
Policy for real activation and scrolling-capture checks.

## Development and release preparation

There are no runtime dependencies. Development scripts require Node.js 20 or
later. Existing commands are:

```bash
npm run check            # manifest, referenced files, and JavaScript syntax
npm test                 # worker and content tests with mocked browser APIs
npm run validate         # check and test together
npm run package          # builds dist/glass-feedback-0.2.0.zip
npm run generate-assets  # regenerate icons and refraction lens map
node tools/build-media.mjs # rebuild promo media from retained browser frames; needs ffmpeg
```

CI is configured to run checks, worker/content tests, and ZIP creation on pushes and
pull requests. Those checks do not establish browser behavior or Store approval.
`npm run checklist:ui` and `npm run checklist:layout` print the current manual
browser checklists from `tools/verify-ui.mjs` and `tools/verify-layout.mjs`.
They do not open a browser or establish that any check passed. Record observed
results against the final unpacked extension separately.

## Architecture and visual contract

| File | Role |
| --- | --- |
| `manifest.json` / `background.js` | On-demand activation, visible-tab capture, and downloads. |
| `content/content.js` / `content/content.css` | Modes and annotations inside an isolated Shadow DOM. |
| `assets/lens-map.png` / `icons/` | Bundled refraction map and extension icons. |
| `unavailable.*` | Explanation when Chrome prevents activation. |
| `tools/` | Demo, generators, fixture, verification scripts, and ZIP builder. |

The liquid-glass personality is part of the product: clear refraction, rim
light, grain, iridescent ink, and spring squeeze/stretch. The primary `.gfx-pill`,
mode buttons `.gfx-alternate`, and `.gfx-options` grow from one continuous
`.gfx-surface`; `.gfx-liquid` supplies the moving lens. Menus stay viewport-bound
while annotations belong to the document. The bundled lens map is inlined as
a data URI for the SVG filter. Final motion and visual quality need hands-on review.
