# Privacy Policy

Glass Feedback uses page content, screenshots, and annotations locally in
Chrome to provide its capture and annotation tools. It does not send that data
to the developer or a remote service, sell it, or use it for analytics.

When you use the extension, it processes the current page locally in Chrome to
draw annotations and create a screenshot. If you choose **Copy to clipboard**,
the resulting image is written to your local clipboard. If you choose
**Download to folder**, the resulting image is saved through Chrome's local
download facility. These actions may include content visible on the page and
any visible annotations you added. If Chrome blocks clipboard writing, the
current implementation falls back to a download and displays a notice.

Glass Feedback has no analytics, advertising, accounts, or remote services.
The extension loads its bundled styles and images locally; it does not upload
screenshots or annotations. The website itself may make its own network requests.

Annotations remain in the current page's memory until reload or navigation.
Toggling UI visibility hides/restores them. Screenshots are processed in memory
for capture/export; the extension does not save screenshots or annotation
content to extension storage. Exported images remain in your clipboard or
downloaded files according to your Chrome and operating-system settings. Other
applications or services may access or sync those destinations under your settings.

## v0.2 preferences and access

The v0.2 manifest uses `activeTab` and `scripting` for injection after you click
the extension icon, with `downloads` for local image export and `storage` for
local preferences. It does not register an automatic content script.

v0.2 stores only capture scope (Selection / Full page), destination
(Clipboard / Download), annotation tool (Note / Draw / Erase), note theme/transparency, and stroke transparency in
`chrome.storage.local`. These preferences persist across page reloads and
browser restarts; they are not stored in `chrome.storage.sync`. Page URLs,
browsing history, screenshot pixels, note text, and drawings are not preference
data and must not be persisted there. Removing the extension clears its local
preferences; it does not remove images you already exported.

For privacy questions, open an issue in the [public repository](https://github.com/chriswhawkins/glass-feedback-extension/issues).
