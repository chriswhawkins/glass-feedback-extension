// Resize the selected transparent mascot into bundled extension icons.
// Developer-only dependency: ffmpeg. Run: node tools/gen-icons.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "assets/brand/glassy-mascot-v1.png");
mkdirSync(join(root, "icons"), { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", source,
    "-vf", `scale=${size}:${size}:flags=lanczos,format=rgba`,
    "-frames:v", "1", "-update", "1", join(root, `icons/icon${size}.png`),
  ], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    console.error(`Icon generation failed (install ffmpeg): ${result.error?.message || result.stderr.trim()}`);
    process.exit(1);
  }
  console.log(`wrote icons/icon${size}.png`);
}
