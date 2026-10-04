import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PACKAGE_FILES } from "./package.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
// An optional root checks a staged production snapshot with the same tools.
const root = process.argv[2] ? resolve(process.argv[2]) : projectRoot;
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
  if (!file || /^(?:data:|#)/i.test(file)) return;
  if (typeof file !== "string" || /^(?:[a-z]+:|\/\/)/i.test(file)) {
    errors.push(`${from}: runtime assets must be local files: ${file}`);
    return;
  }
  const clean = file.split(/[?#]/)[0];
  const path = posix.normalize(relative ? posix.join(posix.dirname(from), clean) : clean);
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
if (!/^\d+(?:\.\d+)*$/.test(manifest.minimum_chrome_version ?? "") ||
    Number(String(manifest.minimum_chrome_version).split(".")[0]) < 127) {
  errors.push("minimum_chrome_version must be at least 127 for action.openPopup");
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    manifest.version.split(".").some((part) => Number(part) > 65535) ||
    !manifest.version.split(".").some((part) => Number(part) > 0)) errors.push("Invalid extension version");
let pkg;
try {
  pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
} catch (error) {
  console.error(`Invalid package.json: ${error.message}`);
  process.exit(1);
}
if (pkg.version !== manifest.version) errors.push("package.json and manifest.json versions differ");
if (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.optionalDependencies ?? {}).length) {
  errors.push("The extension must remain free of runtime package dependencies");
}
const permissions = ["activeTab", "scripting", "downloads", "storage"];
for (const permission of permissions) {
  if (!manifest.permissions?.includes(permission)) errors.push(`Missing permission: ${permission}`);
}
for (const permission of [...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])]) {
  if (!permissions.includes(permission)) errors.push(`Unexpected permission: ${permission}`);
}
if (manifest.action?.default_popup) errors.push("A default popup suppresses click-only activation");
if (manifest.externally_connectable) errors.push("External messaging is not part of the on-demand model");
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(["<all_urls>"]) ||
    manifest.content_scripts?.length !== 1 ||
    JSON.stringify(manifest.content_scripts[0].matches) !== JSON.stringify(["<all_urls>"]) ||
    JSON.stringify(manifest.content_scripts[0].js) !== JSON.stringify(["content/content.js"]) ||
    manifest.content_scripts[0].all_frames === true || manifest.optional_host_permissions?.length) {
  errors.push("Global activation requires all-sites access and the main-frame content script");
}

// Follow static runtime references as well as manifest entries. Dynamic SVG/data
// URLs in the content script are not extension files.
function isRegularFile(file) {
  const parts = file.split("/");
  return parts.every((_, index) => {
    const entry = lstatSync(join(root, ...parts.slice(0, index + 1)));
    return index === parts.length - 1 ? entry.isFile() : entry.isDirectory();
  });
}
for (const file of referencedFiles) {
  try {
    if (!isRegularFile(file)) throw new Error("not a regular file");
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
    if (!isRegularFile(file)) throw new Error("not a regular file");
  } catch {
    errors.push(`Missing production file: ${file}`);
  }
}
const scripts = new Set([
  ...PACKAGE_FILES.filter((file) => /\.js$/.test(file)),
  ...["tools", "tests"].flatMap((directory) => readdirSync(join(projectRoot, directory))
    .filter((file) => file.endsWith(".mjs")).map((file) => `${directory}/${file}`)),
]);
for (const file of scripts) {
  const result = spawnSync(process.execPath, ["--check", join(PACKAGE_FILES.includes(file) ? root : projectRoot, file)], { encoding: "utf8" });
  if (result.error || result.status !== 0) errors.push(`${file}: ${result.error?.message || result.stderr.trim()}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Check OK (manifest ${manifest.version}; ${referencedFiles.size} runtime files; ${scripts.size} scripts)`);
