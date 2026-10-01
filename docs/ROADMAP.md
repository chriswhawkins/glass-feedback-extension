# v0.2 roadmap

The v0.2 implementation is ready for hands-on testing. Recorded checks are in
[VERIFICATION.md](VERIFICATION.md); this is not a claim of support for every website.

## UX release checks

- **User-invoked access:** clicking the extension icon injects through
  `activeTab` + `scripting` on supported pages; repeated clicks toggle one UI
  instance. Restricted pages give useful feedback without an uncaught error.
- **Capture:** first use defaults to Selection / Clipboard. Camera primary
  click captures with current settings; without a selection it asks for a
  region, then offers an explicit Capture button. Full page works with both
  destinations, and clipboard fallback is visible to the user.
- **Flyouts:** hover opens options after a delay; users can move into the
  flyout without it disappearing. Options open perpendicular to the toolbar,
  remain inside the viewport at all edges/corners, and reflow on resize.
- **Annotation session:** Note/Draw stays active after placement until closed
  or switched. Notes and strokes keep document-coordinate anchors through
  scrolling and viewport resize. Visibility toggles preserve annotations;
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
