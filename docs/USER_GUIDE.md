# Using Glass Feedback 0.2

This guide describes the upcoming 0.2.0 source, not an assertion that it has
been published. The Chrome Store build may differ.

## Open and choose

Click the Chrome extension icon on a supported page. Activation persists
across supported tabs, navigation, and browser restarts; click that browser
icon again to turn it off everywhere. Existing annotations return when
reopened in the same document. Reload/navigation clears them.

Glassy starts in Camera. Pull left/right to reveal the other mode, hover it,
then leave to switch; clicking it also works. Pull up/down for the current
mode's options. Clicking Glassy activates the tool and opens both mode
choices and options together. There is no global settings menu.

Drag the main icon to position Glassy. It does not move itself.
**Esc** releases the page for browsing. Click Glassy to reactivate, or
switch to Annotate to activate immediately. **Tools do not time out.**

## Camera

Defaults: **Selection → Copy to clipboard**.

1. Drag a viewport region. Move it or resize with its handles.
2. Confirm with the centered Capture button or Enter. Arrow keys nudge the
   crop one pixel (Shift: ten). ✕ clears only the crop so you can try again.
   Esc releases Camera.
3. For a scrolling screenshot, choose **Full page** in Camera options, then
   click the page. Choose **Save PNG to Downloads** for a file instead of a copy.

Both outputs are lossless PNG. Save uses Chrome's configured download location
(normally Downloads); Chrome may prompt depending on its own preferences.
Clipboard failure falls back to a download with an explanation. Failed
exports retain the region for retry.

Keep the tab active without scrolling/resizing until capture finishes.
Visible annotations are included; editing controls are hidden.
Full-page capture stitches the vertical document at viewport width.
Sticky content can repeat, lazy/virtualized content may be incomplete, and
nested scrollers/horizontal overflow are not stitched. Changing height/scale
aborts rather than returning a partial image. Scroll position and temporary
scroll styles are restored even on failure. Outputs are limited to 16,384
pixels per dimension and 64 × 1024 × 1024 total pixels.

## Annotate

A quick line becomes an arrow. Hold briefly before dragging for a rectangle.
Other strokes stay freehand. Each completed gesture creates a separate item.

Mode options set **element highlighting on/off**, the **next drawing color**,
and whether **new drawings show an associated note**. Blue and red are the
initial recent colors. A default-color change does not recolor existing work.
With highlighting on, click a page element to outline it; dragging still draws.
Only the overlay is moved or edited, never the website element.

Rest on a drawing until its nearby toolbar appears and it is ready to grab.
Drag to move it. Its toolbar offers **show/hide note, color, opacity, delete**.
Hiding its note preserves the text. Deleting a note does not delete the drawing.

Click inside a note to type. Drag its edge to move it; resize from its
bottom-right corner. Notes start light with a 15% glass-background opacity.
Their toolbar has **light/dark, opacity, delete**, without extra drawing tools.
Select text for **bold, italic, underline**.

Hover the opacity droplet to reveal the slider. Click to keep it open; click
again to close. The note's slider extends below the note without moving its
buttons. It changes the glass background, not the text's opacity.

Ordinary notes/drawings use document coordinates: page reflow can shift the
content away. Element outlines follow their selected DOM target while it
exists, plus any dragged offset; replacement/removal can break the association.
Associated notes move with their drawings.

## Keyboard and access

Tab to Glassy or an item handle. Arrow keys reveal modes/options; Tab navigates
buttons, Enter/Space activates them. Enter confirms a crop when focus isn't
in a text field or button. Esc releases the tool.

Complete keyboard-only, screen-reader, and touch workflows still need review.
Drawing, moving, and element targeting require a pointer. Chrome blocks tools
on protected pages, including the Store and chrome:// pages; file pages
require Chrome's file-access permission. Embedded frames aren't directly
annotated by the top-document UI.

## Try before installing

Serve the repository root and open `tools/demo.html` ([setup](../README.md#local-demo)).
Use **Draw & annotate**, **Try Camera**, **Browse / Esc**, and **Clear canvas**.
Drawings, associated notes, colors and element selection use the real UI code.
Camera previews region selection but explains that screenshots/copy/download
require the extension. No mock export-success message is shown.

Demo preferences stay in this origin's localStorage; annotations clear on
reload. The silent walkthrough is recorded from the preview, not proof of
native screenshot export. For a stub-free native test use
`tools/demo.html?extension=1#playground` and activate your unpacked extension.
