import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const files = [
  ["src/manifest.json", "dist/manifest.json"],
  ["src/popup.html", "dist/popup.html"]
];

await Promise.all(
  files.map(async ([from, to]) => {
    const target = resolve(to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(from), target);
  })
);
