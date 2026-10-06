# 0.2 release preparation

Current source: **0.2.0**, Camera + Annotate.
The latest evidence and package hash live in [release readiness](RELEASE_READINESS.md).
[October 3 review](RELEASE_REVIEW.md), [Camera review](CAMERA_REVIEW.md), and
[older verification](VERIFICATION.md) are historical—not acceptance evidence
for this build.

## Remaining gates

| Gate | Scope | Budget |
| --- | --- | --- |
| Native capture | Reload final unpacked build; inspect real region clipboard PNG and annotated full-page download; confirm scrolling restores. Demo notices are not export evidence. | 15–20 min |
| Website coverage | Repeat on dynamic/sticky/virtualized sites and a safely shareable failing URL; exercise navigation, frames, tab-switch interruption, large-output limits. | 30 min per site batch |
| Input/accessibility | Keyboard-only paths, hover/click transitions, touch, reduced motion, forced colors, narrow and corner layouts; keep personality and usability. | 25 min |
| Publisher review | Actual dashboard privacy/data categories, Limited Use certification, privacy/support URLs, category/languages, listing claims and graphics. | 15 min |
| Submission | Upload final runtime ZIP and separate stills. Promo video needs a YouTube URL; MP4 is supplied but not uploaded or published. | 10 min plus review time |

No new mode expansion is planned for this release. Keep Camera defaults
Selection/Copy, PNG exports, optional element highlighting inside Annotate,
associated notes, stable manually positioned Glassy, and the signature glass.

## Follow-ups

[Issue #1](https://github.com/chriswhawkins/glass-feedback-extension/issues/1)
tracks docs/demo/accessibility.
[Issue #2](https://github.com/chriswhawkins/glass-feedback-extension/issues/2)
tracks website capture coverage. Final evidence should include build/commit,
Chrome version, OS, viewport/scale, steps, actual exported image and limitations.

The public demo is deployed through GitHub Pages from main after validation.
See [publisher handoff](UPDATE_0.2.0.md) for its URL, ZIP and remaining native
checks. YouTube upload and Chrome submission remain publisher actions.

## Submission facts

Non-trader status does not remove privacy disclosure obligations. Local
processing is still data handling. Reconcile the dashboard with
[PRIVACY.md](../PRIVACY.md), [Store copy](STORE_LISTING.md) and the final build;
the publisher owns certification and submission.

Chrome-protected pages cannot host tools. Full-page capture stitches the
vertical document, not nested scrollers/horizontal overflow. Sticky elements
can repeat; virtualized content may be incomplete. Outputs have explicit size
limits. Annotations are page-session content, not saved documents.
