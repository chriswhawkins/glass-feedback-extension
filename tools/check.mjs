import { readFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PACKAGE_FILES } from "./package.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const errors = [];
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
} catch (error) {
  console.error(`Invalid manifest.json: ${error.message}`);
  process.exit(1);
}

const iconPaths = (icons) => typeof icons === "string" ? [icons] : Object.values(icons ?? {});
const referencedFiles = new Set();
function reference(file, from = "manifest.json", relative = false) {
  if (!file || /^(?:[a-z]+:|\/\/|#)/i.test(file)) return;
  const clean = file.split(/[?#]/)[0];
  const path = posix.normalize(relative ? posix.join(dirname(from), clean) : clean);
  if (path.startsWith("../") || path.startsWith("/") || /[*\\]/.test(path)) {
    errors.push(`${from}: invalid or unsupported runtime path ${file}`);
    return;
  }
  referencedFiles.add(path);
}

reference(manifest.background?.service_worker);
reference(manifest.action?.default_popup);
reference(manifest.options_page);
reference(manifest.options_ui?.page);
reference(manifest.side_panel?.default_path);
for (const file of [
  ...iconPaths(manifest.icons),
  ...iconPaths(manifest.action?.default_icon),
  ...(manifest.content_scripts ?? []).flatMap((script) => [...(script.js ?? []), ...(script.css ?? [])]),
  ...(manifest.web_accessible_resources ?? []).flatMap((resource) => resource.resources ?? []),
  ...Object.values(manifest.chrome_url_overrides ?? {}),
]) reference(file);

if (manifest.manifest_version !== 3) errors.push("Expected Manifest V3");
if (Number(manifest.minimum_chrome_version) < 127 || !manifest.minimum_chrome_version) {
  errors.push("minimum_chrome_version must be at least 127 for action.openPopup");
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push("Invalid extension version");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.version !== manifest.version) errors.push("package.json and manifest.json versions differ");
for (const permission of ["activeTab", "scripting", "downloads", "storage"]) {
  if (!manifest.permissions?.includes(permission)) errors.push(`Missing permission: ${permission}`);
}
if (manifest.content_scripts?.length || manifest.host_permissions?.length || manifest.optional_host_permissions?.length) {
  errors.push("Use click-only activeTab injection without static scripts or host permissions");
}

// Follow static runtime references as well as manifest entries. Dynamic SVG/data
// URLs in the content script are not extension files.
for (const file of referencedFiles) {
  try {
    if (!statSync(join(root, file)).isFile()) throw new Error("not a file");
  } catch {
    errors.push(`Missing runtime file: ${file}`);
    continue;
  }
  if (/\.js$/.test(file)) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/(?:chrome\.runtime\.getURL\(\s*|popup:\s*)["'`]([^"'`$]+)/g)) {
      reference(match[1], file);
    }
    for (const match of source.matchAll(/files:\s*\[([^\]]*)\]/g)) {
      for (const literal of match[1].matchAll(/["']([^"']+)["']/g)) reference(literal[1], file);
    }
  } else if (/\.html$/.test(file)) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) reference(match[1], file, true);
  } else if (/\.css$/.test(file)) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
      reference((match[1] ?? match[2] ?? match[3]).trim(), file, true);
    }
  }
}

for (const file of referencedFiles) {
  if (!PACKAGE_FILES.includes(file)) errors.push(`Runtime file absent from ZIP allowlist: ${file}`);
}
for (const file of PACKAGE_FILES) {
  try {
    if (!statSync(join(root, file)).isFile()) throw new Error("not a file");
  } catch {
    errors.push(`Missing production file: ${file}`);
  }
}
const scripts = new Set([
  ...PACKAGE_FILES.filter((file) => /\.js$/.test(file)),
  "tools/check.mjs", "tools/package.mjs", "tools/gen-icons.mjs", "tools/gen-lensmap.mjs", "tools/verify-ui.mjs", "tools/verify-layout.mjs", "tests/background.test.mjs",
]);
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", join(root, file)], { encoding: "utf8" });
  if (result.error || result.status !== 0) errors.push(`${file}: ${result.error?.message || result.stderr.trim()}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Check OK (manifest ${manifest.version}; ${referencedFiles.size} runtime files; ${scripts.size} scripts)`);
