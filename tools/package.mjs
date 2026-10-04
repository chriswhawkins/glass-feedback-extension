import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Only these production files may enter the archive; manifest.json is at its root.
export const PACKAGE_FILES = [
  "manifest.json",
  "background.js",
  "content/content.js",
  "content/content.css",
  "assets/lens-map.png",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "unavailable.html",
  "unavailable.js",
  "unavailable.css",
].sort();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

function packageExtension() {
  run(process.execPath, ["tools/check.mjs"]);
  const outputDirectory = join(root, "dist");
  mkdirSync(outputDirectory, { recursive: true });
  // Stage beside the output so the final atomic rename works across mounts.
  const staging = mkdtempSync(join(outputDirectory, ".glass-feedback-package-"));
  try {
    const source = join(staging, "files");
    const timestamp = new Date("2000-01-01T00:00:00Z");
    for (const file of PACKAGE_FILES) {
      const target = join(source, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(root, file), target);
      chmodSync(target, 0o644);
      utimesSync(target, timestamp, timestamp);
    }
    // Validate exactly the copied runtime files; concurrent edits may happen
    // between the initial check and staging. package.json is never archived.
    copyFileSync(join(root, "package.json"), join(source, "package.json"));
    run(process.execPath, ["tools/check.mjs", source]);
    const manifest = JSON.parse(readFileSync(join(source, "manifest.json"), "utf8"));
    const output = join(outputDirectory, `glass-feedback-${manifest.version}.zip`);
    // Fixed order, permissions, timestamps, timezone, and no platform extra fields.
    run("zip", ["-X", "-q", join(staging, "production.zip"), ...PACKAGE_FILES], {
      cwd: source,
      env: { ...process.env, TZ: "UTC", ZIP: "", ZIPOPT: "" },
    });
    mkdirSync(dirname(output), { recursive: true });
    renameSync(join(staging, "production.zip"), output);
    console.log(`Production ZIP: ${output} (${PACKAGE_FILES.length} files)`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    packageExtension();
  } catch (error) {
    console.error(`Packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}
