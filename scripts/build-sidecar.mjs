import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const clean = process.argv.includes("--clean");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sidecarDir = join(repoRoot, "services", "data-sidecar");
const venvDir = join(sidecarDir, ".venv-build");
const distDir = join(sidecarDir, "dist");
const buildDir = join(sidecarDir, "build");
const entry = join(sidecarDir, "main.py");
const exeName = process.platform === "win32" ? "value-copilot-sidecar.exe" : "value-copilot-sidecar";
const exePath = join(distDir, exeName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function removePath(path) {
  if (!existsSync(path)) return;
  for (let i = 0; i < 12; i += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (i === 11) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
}

function pythonInVenv() {
  return process.platform === "win32"
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

function systemPython() {
  const candidates = process.platform === "win32" ? ["python"] : ["python3", "python"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore", shell: false });
    if (result.status === 0) return candidate;
  }
  throw new Error("Python 3.10+ was not found. Install Python and make sure python/python3 is on PATH.");
}

if (!existsSync(entry)) {
  throw new Error(`Sidecar entry not found: ${entry}`);
}

if (clean) {
  removePath(venvDir);
  removePath(buildDir);
  removePath(join(distDir, "value-copilot-sidecar.exe"));
  removePath(join(distDir, "value-copilot-sidecar"));
}

mkdirSync(distDir, { recursive: true });
removePath(join(distDir, "value-copilot-sidecar.exe"));
removePath(join(distDir, "value-copilot-sidecar"));

if (!existsSync(venvDir)) {
  run(systemPython(), ["-m", "venv", venvDir]);
}

const python = pythonInVenv();
if (!existsSync(python)) {
  throw new Error(`Python venv was not created correctly: ${python}`);
}

run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
run(python, ["-m", "pip", "install", "-r", join(sidecarDir, "requirements.txt"), "pyinstaller"]);

run(
  python,
  [
    "-m",
    "PyInstaller",
    "--clean",
    "--onefile",
    "--collect-data",
    "akshare",
    "--name",
    "value-copilot-sidecar",
    "--distpath",
    distDir,
    "--workpath",
    buildDir,
    entry,
  ],
  { cwd: sidecarDir },
);

if (!existsSync(exePath)) {
  throw new Error(`Sidecar executable was not produced: ${exePath}`);
}

console.log(`Built sidecar: ${exePath}`);
