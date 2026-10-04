import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// CUA checklist only. The old Playwright helper assumed exactly one alternate
// mode, persistent quick annotation options, and a timed appearance submenu.
// Current modes are Camera and Annotate. Reveal depends
// on pointer intent and preferences; fixed waits do not prove that interaction.
export const LAYOUT_CHECKS = [
  {
    name: "Mode list, settings branch, and directional reveal",
    steps: "Activate at 1280×800. Pull sideways for Camera/Annotate and up/down for options. Click Glassy to reveal both mode and option branches. Repeat with keyboard arrows.",
    expected: "Glassy stays where placed. Both modes are reachable, no global Settings mode appears, and all controls fit in the viewport.",
  },
  {
    name: "Toolbar drag, edges, and corners",
    steps: "Drag the primary near each edge and corner. Reveal modes/options by pull and click, then drag it back.",
    expected: "The toolbar clamps to the viewport. Mode lists and settings choose space that fits; dragging does not trigger a capture or leave controls stuck.",
  },
  {
    name: "Narrow viewport and preference combinations",
    steps: "Repeat at 360×640, then resize back to 1280×800. Open Camera/Annotate options, the color picker, and both branches on click.",
    expected: "Visible controls remain accessible without covering the primary. Long settings panels scroll within the viewport; resizing keeps the toolbar usable.",
  },
  {
    name: "Item toolbars and document anchors",
    steps: "Place associated notes, arrows, sketches, rectangles and element outlines near boundaries. Reveal color/format controls; hover opacity, click to pin, click again to close. Scroll, move and resize notes.",
    expected: "Item toolbars and popovers remain accessible. Only the selected item's appearance changes; annotations retain document positions during scrolling and resizing.",
  },
  {
    name: "Glass surface, motion, and accessibility",
    steps: "Inspect the connected glass surface and moving lens. Repeat with browser reduced motion and forced colors; use keyboard focus and Escape.",
    expected: "Surface and controls remain aligned during reveal and drag. Refraction is decorative and may degrade gracefully. Reduced motion and forced colors preserve usable controls; avoid exact animation timings or filter-string assertions.",
  },
];

export default function verifyLayout() {
  throw new Error("The legacy Playwright verifier is retired. Use LAYOUT_CHECKS with CUA; npm run checklist:layout prints the manual plan.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("CUA layout checklist — NOT RUN; no browser is opened. Record observed results separately.");
  for (const [index, item] of LAYOUT_CHECKS.entries()) {
    console.log(`\n${index + 1}. ${item.name}\nAction: ${item.steps}\nExpected: ${item.expected}`);
  }
}
