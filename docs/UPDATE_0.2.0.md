# Glassy 0.2.0 — publisher handoff

## Upload

Use the existing Glass Feedback item in the Chrome developer dashboard.
Under **Package → Upload New Package**, upload `glass-feedback-0.2.0.zip`
from the [GitHub release](https://github.com/chriswhawkins/glass-feedback-extension/releases/tag/v0.2.0),
or `dist/glass-feedback-0.2.0.zip` locally. Do not create a new Store item.
Confirm the dashboard's published version is below 0.2.0. If 0.2.0 is already
published, a higher version is needed; don't upload this as an upgrade.

SHA-256: `2b708b6eb3776b25d1e23b7d60b508acdea2d1a5e55cdfe1ca38127b5d08bd78`.

The final demo-only pass did not change the extension runtime or this ZIP.
The manifest/listing name remains **Glass Feedback**; the demo/product branding
is **Glassy**. A Store rename is optional, not necessary for this upload.

## Listing and disclosures

Use [Store copy and permission justifications](STORE_LISTING.md). Upload the
current icon, three JPEG screenshots and small promo from the
[media kit](../store-assets/0.2.0/README.md), not its `historical` folder.
The release's separate `glass-feedback-store-assets-0.2.0.zip` contains current
graphics, GIF and MP4. Unzip it first; do not upload it as the extension package.
Video is optional and requires a YouTube URL; an MP4 isn't accepted in that field.
For the **Marquee promo tile** field, use the standalone release attachment
`marquee-promo-1400x560.jpg` (1400×560, no alpha). This is a promotional
illustration, not one of the required product screenshots.

Privacy URL: https://github.com/chriswhawkins/glass-feedback-extension/blob/main/PRIVACY.md

Demo URL: https://chriswhawkins.github.io/glass-feedback-extension/

Check category, contact/support links, data declarations and Limited Use
certification against the actual dashboard. Processing is local, but still
uses page/annotation/screenshot data; non-trader status does not remove privacy
disclosures. No new permissions or remote executable code were introduced.

## Before submitting

Region → clear → retry → clipboard passed in native Chrome on the exact
candidate. **Still manually check an annotated Full page → Save image**, inspect
the PNG, verify scroll restoration, and try opacity/hover controls near edges.
These checks were not completed on this candidate; mock tests don't establish
native capture correctness. Details: [readiness](RELEASE_READINESS.md).

Submit for review when those checks and dashboard disclosures are satisfactory.
Chrome publication/review is separate from the GitHub release and live demo.
See [Google's update instructions](https://developer.chrome.com/docs/webstore/update).

## Pasteable update note

New liquid-glass Camera and Annotate controls. Draw smart arrows, rectangles
and sketches; attach notes or highlight page elements. Copy or save region
and full-page PNG screenshots. Compact per-item color, opacity and note tools.
Tools stay active until you press Esc, and Glassy stays where you place it.
Everything is processed locally; annotations clear when the page reloads.
