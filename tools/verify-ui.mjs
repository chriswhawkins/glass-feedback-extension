import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// CUA checklist only: this module does not launch or drive a browser.
// The former Playwright helper targeted the removed two-mode annotation palette.
// Use the real unpacked extension on tools/fixture.html; tools/demo.html stubs
// Chrome APIs and cannot establish capture, clipboard, download, or permission results.
export const UI_CHECKS = [
  {
    name: "On-demand activation and failure notice",
    steps: "Click the native extension action on the fixture, toggle it twice, then reload and activate again. Try chrome://settings/ and a regular website.",
    expected: "One toolbar per document; saved activation restores after reload. Browser-action clicks synchronize activation across supported tabs. Restricted pages show a readable notice and later action clicks still work.",
  },
  {
    name: "Selection capture and real export",
    steps: "Use a fresh extension profile with default preferences. Drag a region, adjust it, cancel with Escape, then capture another region. Exercise clipboard copy and Save to downloads.",
    expected: "The selected pixels and annotations appear in the real image. Confirm clipboard contents or the actual PNG in Chrome's download location; a toast alone does not verify an export. A blocked clipboard reports the download fallback.",
  },
  {
    name: "Notes, drawings, and item tools",
    steps: "Choose Annotate. Draw an arrow, hold then drag a rectangle, and sketch. Rest on a drawing, open its toolbar, show its note, type/select/format text, change note theme and opacity, move both and delete the note.",
    expected: "Gestures are separate items. Drawing tools offer note/color/opacity/delete; note tools offer theme/opacity/delete. Opacity hover doesn't shift buttons or jitter; first click pins, second closes. Deleting a note leaves its drawing. Document anchors survive scrolling.",
  },
  {
    name: "Element highlights and annotation defaults",
    steps: "Click Glassy to open current options and mode choices. Turn element highlighting on, click a fixture element, add its note, move the overlay, recolor it, then draw normally. Change next-drawing color and note visibility; reload.",
    expected: "Only Camera and Annotate are listed. No global settings surface opens. Target website content is unchanged. New defaults do not modify existing drawings. Preferences persist; annotations clear on reload.",
  },
  {
    name: "Full-page capture and interruption recovery",
    steps: "Choose Camera, Full page, and Save to downloads. Start from a scrolled position, inspect the actual PNG including the fixture's final dark section, then start another capture and switch tabs during it. Also test Escape and click reactivation; wait over 30 seconds while using the tool.",
    expected: "Scroll and usable controls return after success or failure. Interrupted captures report failure without returning another tab's image. Escape disarms the tool and the primary action reactivates it.",
  },
];

export default function verifyUI() {
  throw new Error("The legacy Playwright verifier is retired. Use UI_CHECKS with CUA; npm run checklist:ui prints the manual plan.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("CUA UI checklist — NOT RUN; no browser is opened. Record observed results separately.");
  for (const [index, item] of UI_CHECKS.entries()) {
    console.log(`\n${index + 1}. ${item.name}\nAction: ${item.steps}\nExpected: ${item.expected}`);
  }
}
