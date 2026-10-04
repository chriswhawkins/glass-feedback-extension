# Camera iteration — 2026-10-03

Local implementation and focused user-flow review. Nothing was committed,
pushed, deployed, submitted, or repackaged. **The previous 0.2.0 upload ZIP is
out of date.** The existing unpacked runtime folder was refreshed for local
Chrome checks; reload the extension and the page after subsequent edits.

## Goal and current flow

Make repeated screenshot selection feel lightweight without changing Glassy's
liquid surface, directional menus, or the other modes. First-use defaults stay
Selection → clipboard, with PNG as the saved format.

| Step | Health | Current-run evidence |
| --- | --- | --- |
| 1. Activate Camera | Implemented/checked | Cursor declarations now vary only by area: camera, or camera with crosshair. Browser CSS and Node assertions verify that output/folder/format do not change them. Cursor appearance at every display scale still needs a hands-on visual pass. |
| 2. Select and refine | Observed in Chrome | Centered glass bar, CSS-pixel size label, move/resize handles. Arrow-key nudging, Enter capture, and viewport clamping are covered by focused tests. |
| 3. Clear and retry | Observed in Chrome | Clicked ✕, then immediately drew another crop without reactivating Camera. Enter on the retry produced the clipboard success notice. Esc releases Camera; Space on the clear button no longer confirms the crop. Failed exports retain the crop. |
| 4. Set defaults and export | Observed subset | Real full-page JPEG and WebP saved through Save As and inspected at 2524×3150. Demo folder input persisted through reload; invalid relative paths showed an error without replacing the saved default. PNG clipboard behavior and every format/folder/Save As combination have Node coverage. |
| 5. Recover and fit | Checked | At 360×640, the options panel measured x=176…348, y=184…628, with 532px content in a 444px scrollable area. Full-page tests verify scroll/style restoration on success and failure, correct last-frame overlap, and rejection of changing height/scale. |

The Product Design audit prompted checks of retry friction, input persistence,
legibility, and overflow. The small last edits to immediate folder saving and
text-glyph sizing were verified in the shared-UI demo after the native exports;
capture/export code did not change afterward.

**Automated result:** `npm run validate`, 67 passing Node tests, no failures or
skips; `git diff --check` clean. These are VM/API tests, not browser automation.
Real Chrome checks used the installed unpacked extension on the strict-CSP
fixture at 75% zoom. Its original Full page/clipboard defaults and the user's
original Chrome tab were restored after testing. No browser permissions were
expanded.

## Accepted visual evidence

![Centered confirmation bar over a real Chrome crop](../output/playwright/camera-2026-10-03/03-region.png)

![Grouped format and folder defaults in the shared UI](../output/playwright/camera-2026-10-03/07-camera-preview.png)

The settings image is the normal rendered preview, not proof of the separate
360×640 DOM measurement. These images and the native exports were saved and
opened during this pass. The first two captures were mid-animation and are
not accepted evidence. Generated evidence stays ignored locally.

Native files: `output/playwright/camera-2026-10-03/04-full-page.jpg` and
`05-full-page.webp`. The JPEG exposed repeated scrollbar thumbs; the final
WebP verifies their removal without changing layout. Other than encoding and
that cleanup, these are not a controlled file-size benchmark.

## Capture and save decisions

Keep [`chrome.tabs.captureVisibleTab`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)
with `activeTab`: it captures the browser's visible rendered image. Compose
lossless frames locally; only encode JPEG/WebP once at the end, at 92% quality.
Clipboard uses PNG regardless of the saved format. Retain the worker's
550ms throttle because Chrome limits capture to two calls per second. The
content loop now waits only 80ms for settling instead of adding its own quota
delay; this is a timing cleanup, not a measured speed claim.

Full-page capture temporarily makes scrollbar colors transparent and restores
the exact original styles/priority in `finally`. This avoids repeated scrollbar
thumbs where the browser supports that property. Document-height or image-scale
changes fail clearly rather than returning a silently partial image. Fixed
headers, lazy/virtualized content, nested scrollers, horizontal overflow and
canvas/message-size limits remain real constraints.

The [DevTools Page capture protocol](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot)
is another full-page route. Using it through an extension requires the broader
[`debugger` permission](https://developer.chrome.com/docs/extensions/reference/api/debugger).
It was not added; an opt-in advanced path would need a separate permission and
product decision, plus testing of annotations and lazy content.

The [Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads#type-DownloadOptions)
accepts filenames relative to Chrome's Downloads location, not arbitrary
absolute default directories. Settings therefore offer a saved subfolder or
Save As on each export. Empty means the download root. Folder changes save as
you type when valid; invalid input leaves the last valid value intact. Browser
download preferences may still prompt. PNG/JPEG/WebP MIME and extensions must
match; arbitrary URLs, traversal paths and non-boolean Save As values remain
rejected. Existing filenames are uniquified instead of overwritten. Notices
say “download started,” since a download ID is not proof of disk completion.

## Suggested next Camera refinements

| Priority | Opportunity | Focused budget |
| --- | --- | --- |
| Next | A **Visible page** option: a one-frame capture without cropping or scrolling. Same simple camera cursor; scope stays explicit in settings. | 15 minutes + 10 minutes verification |
| Next | Progress and Esc cancellation during long full-page captures, with guaranteed scroll/style restoration. Currently Esc is intentionally ignored while a capture is running. | 20 minutes + 10 minutes verification |
| Follow-up | Keep fixed/sticky UI only once instead of repeating it in stitched frames; exercise safe repro pages, nested scrollers, and lazy-loading behavior first. | 30 minutes per initial site batch |

Keyboard crop creation, screen-reader announcements, touch, all edge positions,
display-scale changes, and arbitrary dynamic websites are not comprehensively
verified. This review does not establish accessibility or universal capture
compliance. It does not claim every website render is frozen while scrolling.
