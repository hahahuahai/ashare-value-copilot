import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const resourcesDir = join(repoRoot, "apps", "desktop", "resources");
const sourcePng = existsSync(join(resourcesDir, "icon.png"))
  ? join(resourcesDir, "icon.png")
  : join(resourcesDir, "icon-256.png");
const iconsetDir = join(resourcesDir, "icon.iconset");
const icnsPath = join(resourcesDir, "icon.icns");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

if (existsSync(icnsPath)) {
  console.log(`macOS icon already exists: ${icnsPath}`);
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.warn("Skipping macOS icon generation because this is not macOS.");
  process.exit(0);
}

if (!existsSync(sourcePng)) {
  throw new Error(`Source icon not found: ${sourcePng}`);
}

rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

const sizes = [
  ["16", "icon_16x16.png"],
  ["32", "icon_16x16@2x.png"],
  ["32", "icon_32x32.png"],
  ["64", "icon_32x32@2x.png"],
  ["128", "icon_128x128.png"],
  ["256", "icon_128x128@2x.png"],
  ["256", "icon_256x256.png"],
  ["512", "icon_256x256@2x.png"],
  ["512", "icon_512x512.png"],
  ["1024", "icon_512x512@2x.png"],
];

for (const [size, filename] of sizes) {
  run("sips", ["-z", size, size, sourcePng, "--out", join(iconsetDir, filename)]);
}

run("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);
rmSync(iconsetDir, { recursive: true, force: true });
console.log(`Generated macOS icon: ${icnsPath}`);
