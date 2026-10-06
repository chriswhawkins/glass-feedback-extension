# Changelog

## 0.2.0 — GitHub release; Chrome publication pending

- **Branding:** Glassy's rounded liquid-glass mascot now appears in extension
  icons, the Store icon and demo; in-page tool glyphs are unchanged.
- **Two modes:** Camera and Annotate, with directional liquid-glass menus.
  Click Glassy for mode choices and current-tool options together.
  Global settings, separate Note mode, and Magic Wand mode are hidden.
- **Smart markup:** quick lines become arrows; hold then drag for rectangles;
  other strokes stay sketches. Gestures are separate drawings.
  Optional element highlighting adds selectable/movable outlines.
- **Associated notes:** show/hide a drawing's note without losing its text.
  Drawings offer note, color, opacity, delete; notes offer light/dark,
  opacity, delete and selected-text bold/italic/underline.
  Opacity uses a hover-revealed, click-pinnable slider.
- **Camera:** selection or scrolling full page, PNG clipboard or Downloads.
  Centered crop controls, clear-and-retry, keyboard nudging, clipboard fallback,
  and scroll restoration. Retired format/folder defaults no longer apply.
- **Lifecycle:** activation persists across supported tabs and navigation.
  Tools do not time out; Esc releases them. Switching to Annotate activates it.
  Glassy stays where you drag it. Reload/navigation clears annotations.
- **Demo/release preparation:** draw-first playground, trial controls, real-UI
  silent walkthrough and GIF, current Store stills, refreshed guides/tests.
  All executable extension code is bundled; all-sites host access supports
  activation and capture. There are no runtime package dependencies.
  The README now documents architecture, runtime boundaries and development.
- **Public demo:** concise Glassy branding, colorful live canvases and optional
  help. GitHub Pages publishes the shared UI from main after validation.

See [release readiness](docs/RELEASE_READINESS.md) for observed checks and
remaining native/publisher gates. Nothing here asserts Store publication.

## 0.1.0 — Released

Previously published Chrome Web Store build. The development demo can differ
from the current Store version; verify the dashboard version before updating.
