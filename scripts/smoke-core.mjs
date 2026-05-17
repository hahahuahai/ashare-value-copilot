import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function file(path) {
  return resolve(root, path);
}

const desktopPkg = JSON.parse(readFileSync(file("apps/desktop/package.json"), "utf-8"));
const main = readFileSync(file("apps/desktop/src/main/index.ts"), "utf-8");
const preload = readFileSync(file("apps/desktop/src/preload/index.ts"), "utf-8");
const app = readFileSync(file("apps/desktop/src/renderer/src/App.tsx"), "utf-8");
const icon = file("apps/desktop/resources/icon.icns");

check("desktop version bumped", desktopPkg.version === "0.2.6", desktopPkg.version);
check("mac icon exists", existsSync(icon) && statSync(icon).size > 10_000, icon);
check("diagnostics IPC exposed", main.includes('"get-diagnostics"') && preload.includes("getDiagnostics"));
check("watchlist refresh IPC exposed", main.includes('"refresh-watch-item"') && preload.includes("refreshWatchItem"));
check("batch report delete exposed", main.includes('"delete-reports"') && preload.includes("deleteReports"));
check("app state persistence exposed", main.includes('"save-app-state"') && preload.includes("saveAppState"));
check("renderer has diagnostics center", app.includes("诊断中心") && app.includes("openDiagnostics"));
check("renderer has data quality badge", app.includes("DataQualityBadge"));
check("renderer has watchlist refresh", app.includes("刷新全部") && app.includes("refreshWatchItem"));
check("renderer has report search and batch delete", app.includes("搜索历史") && app.includes("onDeleteSelectedReports"));

const failed = checks.filter((x) => !x.pass);
for (const item of checks) {
  const mark = item.pass ? "PASS" : "FAIL";
  console.log(`${mark} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
}

if (failed.length) {
  process.exitCode = 1;
}
