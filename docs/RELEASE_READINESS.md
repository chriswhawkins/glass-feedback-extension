# 0.2.0 readiness — 2026-10-04

**Prepared, not published.** Current source has Camera and Annotate only.
Global settings, separate Note/Wand modes and timed tool deactivation are
hidden/removed. This supersedes the four-mode October 3 review and earlier
Camera-format iteration. No Chrome Store submission, YouTube upload or demo
deployment was performed.

## Checks performed

| Check | Result / scope |
| --- | --- |
| Static checks + tests | `npm run validate`: 77 pass, 0 fail/skip. Browser APIs are mocked; this is not native export evidence. Updated old test contracts for no timeout, immediate Annotate activation, two-mode click expansion, PNG/Downloads defaults. |
| Demo desktop | In-app browser, 1280×800 viewport: draw-first CTA activates Annotate and reaches canvases; a line becomes an arrow; its toolbar adds an editable associated note; current options expand together. |
| Note tools | Real note toolbar/opacity control exercised at 15%→45%; slider extends below the note. No current visual shift was observed during this interaction. Exhaustive hover-edge/click-pin testing is still a manual gate. |
| Demo Camera | Real region selection and centered crop confirmation shown; Capture gives an extension-only notice and Store link, not fake success. |
| Demo state | Trial-bar selection/status follows Glassy's own mode changes and Esc, not just demo-button clicks. This demo-only event does not alter native capture behavior. |
| Responsive page | 390×844 override, after reload: single-column content and wrapping trial controls. Measured document client/scroll width both 375 (scrollbar excluded), no horizontal overflow. This is layout evidence, not touch support. |
| Walkthrough | Generated MP4 loaded and played in the demo: paused=false, time advancing, duration 19.875 seconds, media error=null. Silent H.264, 1280×800; captions included. |
| Media tests | Demo scripts parse, referenced local files exist, current listing stills are 1280×800 JPEG and promo is 440×280; GIF loops and MP4 has fast-start metadata. |
| Runtime ZIP | Allowlisted 12 production files, manifest at root, no docs/demo/media/tests or runtime package dependencies. `unzip -t` passes. |
| Diff hygiene | `git diff --check` passes. |

## Candidate

`dist/glass-feedback-0.2.0.zip`

SHA-256:
`a860ec8bfa4fe9134b9ebb93f197024de81af3e034cc52b409c633a473dac8e4`

The archive is a **pre-release candidate**, not certified upload approval.
Rebuild after any runtime source edit. Earlier ZIP hashes do not identify it.

Current media: [asset kit](../store-assets/0.2.0/README.md).
Three JPEG listing screenshots, refreshed promo/icon, a ~20-second MP4
master and liquid-reveal GIF. Earlier Wand/Settings stills were moved into
`store-assets/0.2.0/historical/`, not deleted; do not upload them for this UI.

Raw real-UI frames and browser screenshots remain in ignored local
`output/playwright/release-2026-10-04/`. `tools/build-media.mjs` rebuilds final
media using ffmpeg; that tool is not included in the extension runtime.

## Before submitting

| Owner / gate | Next action | Budget |
| --- | --- | --- |
| Maintainer — native exports | Load/reload this exact candidate in Chrome. Inspect an actual region clipboard PNG and full-page annotated PNG download; verify crop retry, scroll restoration and output location. Old native captures are historical. | 15–20 min |
| Maintainer — tactile polish | Slow pulls, hover-and-leave switching, drawing move/delete, note show/hide/text formatting, opacity hover/pin/close, all corners and low screen height. Preview captures are not a full interaction pass. | 15 min |
| Publisher — Store | Review accurate data/permission disclosures, privacy/support URLs, category/languages, final copy/graphics. Upload candidate and separate current JPEGs; defer publication if needed. | 15 min plus Store review |
| Publisher — video/demo | Upload MP4 to YouTube to obtain the listing's video URL. Choose a demo host and review its logs/privacy before deployment. No hosting destination has been invented. | 15 min plus host setup |

All-sites host access remains intentional for saved activation across supported
pages. Protected Chrome pages remain unsupported. Full-page stitching has
document/size/virtualization limitations; notes/drawings are not saved documents.
See [guide](USER_GUIDE.md), [privacy](../PRIVACY.md), and [Store copy](STORE_LISTING.md).
This review does not establish WCAG/legal compliance, universal website support
or Chrome Store approval.
