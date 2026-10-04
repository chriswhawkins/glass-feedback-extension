# Chrome Web Store copy — draft 0.2.0

Prepared for current Camera/Annotate source. Review the actual dashboard and
final package before submission. No Store upload or publication is performed.

## Name and short description

**Name:** Glass Feedback

**Short description:** Draw arrows, add notes, highlight details. Copy or save page screenshots with liquid-glass controls.

## Detailed description

A little glass. A lot of clarity.

Glass Feedback brings a small liquid-glass control, Glassy, to supported web
pages. Mark the detail, leave the thought behind it, and capture the context.

**Camera** — drag a region, adjust it, and confirm. Or choose Full page for a
scrolling screenshot. Copy a lossless PNG or save it to Chrome's Downloads.
Clear a crop to try again without leaving Camera. Enter confirms; Esc releases
the tool. Clipboard failure falls back to a download with an explanation.

**Annotate** — draw a quick line for an arrow, hold briefly then drag for a
rectangle, or sketch freely. Turn on element highlighting to click page
elements and outline them. Each drawing is its own movable item, with color,
opacity, delete, and an associated note you can show or hide.

Notes have their own light/dark, opacity, and delete controls. Select text for
bold, italic, or underline. Hover the opacity droplet for a slider; click to
keep it open and click again to close it.

Dip into Glassy and pull sideways to switch modes, or up/down for tool options.
Click Glassy to see both at once. Drag the main icon to put it where you want
it; it stays there. Tools don't time out. Press Esc to browse again.
The browser's extension icon turns Glass Feedback off across supported tabs.

Website content, notes, drawings, and screenshots are processed locally.
No accounts, analytics, or uploads to the developer. Preferences save locally;
annotations last for the current page session and clear on reload/navigation.
Export an image when you want a copy to share yourself.

Requires Chrome 127 or later. Chrome-protected pages, including the Store,
cannot host tools. Full-page screenshots stitch the vertical document:
sticky content can repeat; lazy/virtualized content may be incomplete.
Nested scrollers and horizontal overflow aren't stitched. Very large images
are limited. Drawing and targeting require a pointer; complete keyboard-only,
touch and screen-reader flows have not been established.

## Single purpose

Annotate the current page and export an image of that feedback to a clipboard
or local file. Camera, smart markup, element outlines and associated notes all
support that workflow.

## Permission justifications

| Permission | Justification |
| --- | --- |
| `activeTab` | Access after a browser-action click to activate page tools and capture the selected tab at the user's request. |
| `scripting` | Inject bundled UI into already-open supported pages when global activation changes, including a fallback if a receiver is missing. |
| `downloads` | Save user-requested PNG images to Chrome's download location, including an explained clipboard fallback. |
| `storage` | Persist activation and capture/color/annotation preferences locally; not screenshot pixels, note text or drawing geometry. |
| Host access `<all_urls>` | Restore the saved activation state and provide page tools/capture across supported sites and navigation. Only the main-frame content script is registered; Chrome's site-access controls and protected-page restrictions still apply. |

All executable extension code is bundled. Stylesheet/refraction-image loading
uses bundled assets, not remote code. External Store/repository links navigate
to those pages; they do not load executable code into the extension.

## Privacy and publisher review

[PRIVACY.md](../PRIVACY.md) describes local website-content, annotation and
screenshot handling and Limited Use. Local processing is still data handling;
non-trader status does not exempt disclosure. Google's
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
is the reference for accurate dashboard declarations. Reconcile any existing
“will not collect or use your data” claim with local use; the publisher owns
legal review, category selection and certification.

Verify the public privacy URL corresponds to the submitted build, support
contact/category/languages are correct, and the final version exceeds the
published version. Use sample content in listing media.

## Assets and upload mapping

See the [asset kit](../store-assets/0.2.0/README.md).

- Icon: 128×128 PNG.
- Current stills: three 1280×800 JPEGs without alpha.
- Small promo: 440×280 JPEG.
- Promo video: silent 1280×800 MP4 master, about 20 seconds.
- GIF: reusable preview/social asset, **not** a listing screenshot.

Google's [listing guide](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
uses a **YouTube URL** for promo video. Uploading that master to YouTube is a
separate publisher action. Stills follow
[Google's image requirements](https://developer.chrome.com/docs/webstore/images).
The recorded demo shows real UI interactions but intentionally no successful
native export; it explicitly states screenshots require the extension.

## Draft update note

New in 0.2: two directional liquid-glass modes, smart arrows/rectangles/sketches,
optional element outlines, associated notes, compact per-item tools, and
region/full-page PNG capture. Click Glassy to reveal choices together; Esc
releases the page. Tools no longer time out. Annotations remain page-session
content, and processing stays local.
