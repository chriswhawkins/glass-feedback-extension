# v0.2 verification — 2026-10-01

**Historical evidence only.** This snapshot predates the four-mode interface.
Use [the 2026-10-03 release review](RELEASE_REVIEW.md) for current results and
remaining release gates; the counts below are not current acceptance claims.

## Evidence

The latest liquid-glass surface and persistent annotation palette were verified
in Chrome. Workflow and layout counts below describe the updated scripts.
Restricted-page feedback and simulated failure tests also retain the earlier
v0.2 evidence; their implementation is unchanged by this refinement.

| Check | Environment | Result |
| --- | --- | --- |
| Manifest, references, syntax, ZIP allowlist | Node, `npm run check` | Passed |
| Activation, notice lifecycle, capture quota/tab safety, download contracts | `npm test`, mocked Chrome APIs | 29 passed |
| Defaults, actual selection/clipboard, persistent Note/Draw palette, appearance expansion, notes/delete/theme/opacity, draw/erase/undo, scroll/resize anchors, X/Escape, full-page/download, capture cleanup | Unpacked extension in headed Chrome for Testing 153.0.8010.12; `tools/fixture.html`, 1280×800 CSS pixels | 31 passed |
| Four hover-entry sides, four corners, narrow camera/annotation options, containment/non-overlap, continuous surface, refraction, squeeze/travel/settle | `tools/demo.html`, Playwright, 1280×800 and 360×640 | 78 passed |
| Restricted-page notice | Native extension action on `chrome://settings` | Explanation displayed; return to regular page could activate again |
| Host CSS isolation | Demo with `!important` hide/restyle rules and transformed document root | Tools stayed visible and viewport-fixed; hide/reopen worked |
| Clipboard denial and capture failure | Demo with simulated API failures | Fallback download notice and failure cleanup passed |
| Reduced motion | Demo with reduced-motion media emulation | Lens snaps to hovered tool without spring travel |

The real full-page export was a completed 2560×4200 PNG of the 2100-CSS-pixel
fixture at device scale 2. Both notes appeared at their document positions and
editing controls were excluded. Saved preferences contained only scope,
destination, tool, theme, and opacity values. Earlier reload/reopen checks
confirmed restored camera settings and cleared annotation content.

The fixture uses smooth scrolling; capture overrides it temporarily and restores
the original scroll position. No personal page content was used.

## Latest refinement — motion acceptance

The original liquid-glass personality is critical acceptance behavior. The
primary `.gfx-pill`, alternative mode `.gfx-alternate`, and mode options
`.gfx-options` should share a continuous expanding `.gfx-surface` silhouette
with a spring-driven CSS clip-path path. The root's `.gfx-liquid` lens
should animate with the controls. Structural assertions alone cannot verify
the quality of refraction, rim highlights, continuity, or motion. Camera and
annotation surfaces were visually inspected; the lens's squeeze and settling
were measured across hover transitions. Controls are clipped to the growing
body, retaining the original refraction, rim lighting, grain, iridescent ink,
and opening camera aperture. Final aesthetic approval remains a hands-on review.

The updated browser scripts cover one persistent annotation editing session:
**Add notes**, **Draw**, and **Annotation appearance** stay accessible after
the pointer leaves. Quick tools switch directly through visible `.gfx-options`.
Hovering appearance for 240 ms or clicking it expands that same palette to
reveal **Erase drawing**, **Undo last drawing**, **Light notes**, and
**Annotation opacity**; advanced actions must reveal appearance first.
Escape and X exit editing. Camera scope and destination retain their existing
behavior.

Layout checks now include the persistent annotation palette after the mode bar
closes, direct Note/Draw switching, expanded appearance at 360×640, and resize
back to 1280×800. These checks pass. Reduced-motion snapping and host-CSS
isolation/hide/reopen were checked separately. The full-page PNG was inspected
again to confirm that the new glass body, lens, and controls stay out of exports.

## Repeating the browser checks

Serve the repository over HTTP, load it unpacked in Chrome 127+, and open
`tools/fixture.html`. Clear `gfxPreferences` in extension-local storage for the
first-use check, then click the native extension action to grant `activeTab`.
`tools/verify-ui.mjs` exports a function accepting a Playwright Page for this
setup. It exercises real capture and clipboard APIs, then reloads the page.
Reactivate after reload when checking remembered settings.

`tools/verify-layout.mjs` accepts a Page with the toolbar already visible, and
can run against the demo. The demo simulates screenshots/downloads, so its
results cannot prove capture correctness. These browser checks are not currently
run in CI; CI checks syntax, mocked worker behavior, and ZIP creation.

## Release gate and remaining coverage

Test the unpacked v0.2 UX on the websites where v0.1 failed before updating the
Store. Chrome-protected pages cannot support injection; the notice is the fix
for that case, not a bypass. Static document-coordinate anchors do not follow
elements that move because of responsive reflow or dynamic content changes.

Sticky/fixed elements can repeat in stitched captures. Independent nested
scrollers, virtualization, lazy loading, horizontal overflow, and oversized
pages are not universally supported. Oversized or unscrollable captures show
errors rather than silently returning cropped output. Broader website and
export coverage is tracked in [issue #2](https://github.com/chriswhawkins/glass-feedback-extension/issues/2).

## Store update permissions

v0.2 removes broad host permissions and automatic content-script registration.
`<all_urls>` in web-accessible resources only exposes the bundled stylesheet
and lens image; it does not grant page access.

- `activeTab`: temporary access to the page after the user clicks the extension,
  including screenshot capture.
- `scripting`: inject the bundled annotation/camera UI into that page on demand.
- `downloads`: save user-requested screenshots locally, including explicit
  fallback when clipboard export is blocked.
- `storage`: remember capture and annotation preferences in local storage only.

All executable code is packaged with the extension. No remote code, telemetry,
or screenshot upload is introduced. Update the Store's permission explanations
and privacy declarations to match this manifest when uploading v0.2.
