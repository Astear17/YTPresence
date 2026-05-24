import { mkdir, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const distDir = resolve(appDir, "dist");
const releaseDir = resolve(appDir, "release");
const packageJson = JSON.parse(await readFile(resolve(appDir, "package.json"), "utf8"));
const version = packageJson.version ?? "0.0.0";
const zipPath = resolve(releaseDir, `YTPresence-Companion-Extension-${version}.zip`);

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });

if (process.platform === "win32") {
  run("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${distDir.replaceAll("'", "''")}\\*' -DestinationPath '${zipPath.replaceAll("'", "''")}' -Force`
  ]);
} else {
  run("zip", ["-r", zipPath, "."], { cwd: distDir });
}

console.log(`Packaged extension: ${zipPath}`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? "unknown"}`);
  }
}
