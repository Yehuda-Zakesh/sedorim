import { createServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const EXCLUDE = new Set([
  "node_modules",
  ".git",
  ".lovable",
  "dist",
  ".tmp",
  "tmp",
  ".cache",
  "coverage",
  ".DS_Store",
  "Thumbs.db",
  ".env",
  ".env.local",
]);

const EXCLUDE_EXT = new Set([".zip", ".tar", ".gz", ".rar", ".7z"]);

async function walk(dir: string, zip: JSZip, basePath: string) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    if (EXCLUDE.has(entry)) continue;
    const fullPath = join(dir, entry);
    const relativePath = fullPath.slice(basePath.length + 1);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      await walk(fullPath, zip, basePath);
    } else if (s.isFile()) {
      const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
      if (EXCLUDE_EXT.has(ext)) continue;
      try {
        const content = await readFile(fullPath);
        zip.file(relativePath, content);
      } catch {
        // skip unreadable files
      }
    }
  }
}

export const generateSourceZip = createServerFn({ method: "GET" })
  .handler(async () => {
    const root = process.cwd();
    const zip = new JSZip();
    await walk(root, zip, root);
    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const base64 = Buffer.from(blob).toString("base64");
    return { base64, filename: `kollel-tracker-source_${new Date().toISOString().slice(0, 10)}.zip` };
  });
