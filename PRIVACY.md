# Privacy Policy

Glass Feedback handles website content, user-entered annotations, and screenshot
images locally in Chrome to provide page feedback and image export. The
extension does not transmit this content to the developer or a remote service,
sell it, or use it for analytics. It has no accounts, advertising, or telemetry.

This policy describes the current **0.2.0 development implementation**. The
published Store release is **0.1.0**; access and preference details below must
match the build submitted for the next update.

## Data handling and retention

| Data | Use and location | Retention |
| --- | --- | --- |
| Page elements, note text/formatting, drawings, and element outlines | Display/edit annotations in page memory; element outlines keep an in-memory reference to their selected element. | Clear on document reload/navigation. Hide/reopen preserves them in the same document. |
| Screenshot pixels | Capture, crop/stitch, and encode a PNG in memory, including page content and visible annotations. | Not saved in persistent extension storage. Exported copies have separate retention. |
| Global activation | Remember the on/off setting under `gfxEnabled` in `chrome.storage.local`. | Persist across reloads/restarts; removing the extension clears it. |
| Preferences | Remember choices under `gfxPreferences` in `chrome.storage.local`. | Persist across reloads/restarts; removing the extension clears them. |
| Exported images | Write a user-requested PNG to the clipboard or Chrome downloads. | Follow browser, operating-system, clipboard, and file settings. Uninstalling does not delete exported images. |

Preferences include capture area/output, drawing and highlight colors/recent
colors, element-highlighting and associated-note defaults. Legacy Wand, motion,
power and control-reveal values can remain in the preference object for
compatibility, although global settings and separate Wand/Note modes are hidden.
Retired file-type/folder/Save As settings are not used by the current UI.
The current tool value is also retained in the preference object. Individual
note text, formatting, theme and opacity, drawing geometry, and screenshot
pixels are not stored there. Toolbar position is not a saved preference.

Preferences use local extension storage, not `chrome.storage.sync`.
Page URLs and browsing history are not persisted by the extension.
Pasting into a note uses text from that user-initiated paste event; the
extension does not continuously read the clipboard.

## Export and page access

**Copy to clipboard** writes the PNG to the local clipboard. **Save image**
saves PNG through Chrome downloads, using Chrome's configured download location.
Chrome's own settings can prompt for a destination.
If an image clipboard write fails, the extension falls back to a download and
displays a notice. Other software may access, retain, or sync these destinations
according to the user's settings.

The 0.2.0 manifest uses `<all_urls>` host access and a main-frame content
script to restore the global on/off setting across supported pages. The UI
is built only while enabled. `activeTab` provides access following an icon
click, `scripting` activates already-open pages, `downloads` exports images,
and `storage` retains preferences and activation. Chrome restricts protected
pages; browser site-access controls can limit where the extension runs.

`<all_urls>` in `web_accessible_resources` exposes only the bundled stylesheet
and lens image; it does not grant host access. All executable extension code
is bundled. Local stylesheet/image loading does not upload content. The
visited website, Chrome, and any destination the user later shares an image
with have their own data practices.

## Local handling still requires disclosure

Local processing is data handling. Google's
[User Data FAQ, questions 2, 3, and 14](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
includes screenshots as data handling and requires accurate disclosure and a
privacy policy even for local-only processing/storage. This policy describes
local website-content and annotation handling; it does not claim a privacy
exemption or make a blanket claim that the extension never uses user data.

## Limited Use

Glass Feedback's use of information received through Chrome APIs complies with
the Chrome Web Store User Data Policy, including its
[Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
That information is used only for the disclosed page-annotation and screenshot
features. It is not sold, shared for advertising, used for credit or lending
decisions, or made available to the developer for human review. The extension
does not send it to a developer-operated server.

## Demo and contact

The repository's web demo uses browser `localStorage` for preferences and page
memory for annotations. Chrome APIs are stubbed; Camera displays an
extension-only export notice instead of taking a real page screenshot.
Following a Store/repository link opens that external site. Verify any public
demo host's logs and other data practices separately before using this policy
for that hosted site.

For privacy questions, use the
[public issue tracker](https://github.com/chriswhawkins/glass-feedback-extension/issues).
Issues are public; omit private page content and screenshots.
