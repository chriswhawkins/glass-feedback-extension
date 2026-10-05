import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// Captured JPEG sequences are real browser UI, not generated product mockups.
// See store-assets/0.2.0/README.md for capture provenance and upload mapping.
const frames = resolve(process.argv[2] || "output/playwright/release-2026-10-04");
const destination = resolve("store-assets/0.2.0");
mkdirSync(destination, { recursive: true });
const run = (args) => {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (result.error || result.status) throw result.error || new Error("ffmpeg failed");
};
const shots = [
  ["01-reveal", "Click Glassy. Modes sideways. Options up or down."],
  ["02-note", "Give your drawing a note. Adjust its glass, not your page."],
  ["05-region", "Camera: frame the detail. Adjust. Confirm."],
  ["06-demo-notice", "Preview UI. Real screenshot exports need the Chrome extension."],
];
for (const [index, [name, caption]] of shots.entries()) {
  const captionPath = join(frames, `${name}.txt`);
  writeFileSync(captionPath, caption);
  run(["-framerate", "16", "-i", join(frames, name, "%04d.jpg"), "-vf",
    `scale=1280:800,setsar=1,tpad=stop_mode=clone:stop_duration=3,` +
    `drawbox=x=0:y=720:w=iw:h=80:color=0x173c35@0.96:t=fill,` +
    `drawtext=textfile='${captionPath}':fontcolor=white:fontsize=23:x=(w-tw)/2:y=745,` +
    "fade=t=in:d=0.2,fade=t=out:st=4.8:d=0.2",
    "-t", "5", "-r", "24", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", join(frames, `scene-${index}.mp4`)]);
}
const list = join(frames, "scenes.txt");
writeFileSync(list, shots.map((_, index) => `file '${join(frames, `scene-${index}.mp4`)}'`).join("\n"));
run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", join(destination, "glassy-walkthrough.mp4")]);
run(["-framerate", "16", "-i", join(frames, "01-reveal", "%04d.jpg"), "-vf",
  "crop=390:500:875:65,scale=468:600,setsar=1,tpad=stop_mode=clone:stop_duration=1.5,split[a][b];[a]palettegen[p];[b][p]paletteuse",
  "-loop", "0", join(destination, "glassy-reveal.gif")]);
for (const [source, target] of [["01-annotate.jpg", "01-annotate-1280x800.jpg"], ["02-controls.jpg", "02-controls-1280x800.jpg"],
  ["03-camera.jpg", "03-camera-1280x800.jpg"], ["01-annotate.jpg", "preview-poster.jpg"]]) {
  run(["-i", join(frames, source), "-vf", "scale=1280:800", "-frames:v", "1", "-q:v", "2", join(destination, target)]);
}
run(["-i", join(frames, "10-small-promo.jpg"), "-vf", "scale=440:280", "-frames:v", "1", "-q:v", "2", join(destination, "small-promo-440x280.jpg")]);
console.log(`Built real-UI media in ${destination}`);
