# v0.2 roadmap

The v0.2 implementation is ready for hands-on testing. Recorded checks are in
[VERIFICATION.md](VERIFICATION.md); this is not a claim of support for every website.
Those recorded results precede the latest liquid-glass and annotation-palette
refinement. Browser verification of that refinement is pending.

## UX release checks

- **User-invoked access:** clicking the extension icon injects through
  `activeTab` + `scripting` on supported pages; repeated clicks toggle one UI
  instance. Restricted pages give useful feedback without an uncaught error.
- **Capture:** first use defaults to Selection / Clipboard. Camera primary
  click captures with current settings; without a selection it asks for a
  region, then offers an explicit Capture button. Full page works with both
  destinations, and clipboard fallback is visible to the user.
- **Liquid-glass surface:** restoring the original glass personality is a
  critical release gate. Primary `.gfx-pill`, mode alternative `.gfx-alternate`,
  and mode options `.gfx-options` must read as one continuously expanding
  `.gfx-surface`, with a CSS clip-path path, spring transform, and root
  `.gfx-liquid` animated lens. Delayed hover options stay reachable, remain
  inside the viewport at edges/corners, and reflow on resize. Verify the latest
  silhouette, refraction, lens motion, and spring behavior in Chrome.
- **Annotation session:** one editing mode keeps **Add notes**, **Draw**, and
  **Annotation appearance** visible after the pointer leaves. Note/Draw switches
  directly without main hover or ending the session. Hover appearance for
  240 ms or click it to reveal **Erase drawing**, **Undo last drawing**,
  **Light notes**, and **Annotation opacity** within the same palette. Escape/X
  exits. Verify persistent and expanded palettes at narrow widths, including
  quick tools after the mode bar closes. Notes and strokes keep
  document-coordinate anchors through scrolling and viewport resize.
  Visibility toggles preserve annotations;
  reload clears them. Captures include annotations without editing controls.
- **Local preferences:** only scope, destination, annotation tool, note theme/transparency,
  and stroke transparency persist in `chrome.storage.local`. Reopen/reload
  restores these choices; annotation content and screenshots never enter
  persistent extension storage. No analytics or remote upload is introduced.

## Followups after UX stabilizes

| Work | Acceptance evidence | Budget |
| --- | --- | --- |
| [Refresh docs and examples (#1)](https://github.com/chriswhawkins/glass-feedback-extension/issues/1) | Real-Chrome selection/copy and annotated full-page/download walkthroughs; screenshots match shipped controls; privacy and permissions match the final manifest | 35 minutes |
| [Expand website capture regression coverage (#2)](https://github.com/chriswhawkins/glass-feedback-extension/issues/2) | Recorded results for varied page layouts, both scopes/destinations, annotation anchors, and viewport edges; failures have reproducible steps | 50 minutes |

Budgets cover a focused first pass; fixes discovered by regression checks are
separate work.

## Capture limitations to retain in examples

Full-page capture scrolls and stitches frames, so sticky/fixed elements can
repeat. Lazy-loaded or virtualized content may be incomplete; very tall pages
are limited by canvas size. Horizontal overflow is not stitched. Examples
should identify these cases and avoid presenting them as verified support.
