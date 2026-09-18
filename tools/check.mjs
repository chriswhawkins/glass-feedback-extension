import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const manifestPath = join(root, "manifest.json");

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`Invalid manifest.json: ${error.message}`);
  process.exit(1);
}

const referencedFiles = new Set([
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
  ...(manifest.content_scripts ?? []).flatMap((script) => script.css ?? []),
  ...Object.values(manifest.icons ?? {}),
  ...(manifest.web_accessible_resources ?? []).flatMap(
    (resource) => resource.resources ?? []
  ),
]);

const missing = [...referencedFiles]
  .filter(Boolean)
  .filter((file) => !existsSync(join(root, file)));

if (missing.length) {
  console.error(
    `Manifest references missing files:\n${missing
      .map((file) => `- ${file}`)
      .join("\n")}`
  );
  process.exit(1);
}

console.log(
  `Manifest OK (${relative(root, manifestPath)}; ${referencedFiles.size} referenced files)`
);
