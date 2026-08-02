import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "mobile-www");
const files = [
  "index.html",
  "manifest.webmanifest",
  "service-worker.js",
  "assets",
  "src"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(output, file), { recursive: true });
}

console.log("Prepared Nexus mobile web assets in mobile-www.");
