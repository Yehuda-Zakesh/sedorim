import { T as TSS_SERVER_FUNCTION, c as createServerFn } from "./server-CaWtMibl.mjs";
import { J as JSZip } from "../_libs/jszip.mjs";
import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import "../_libs/seroval.mjs";
import "../_libs/react.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:http";
import "node:stream";
import "node:stream/promises";
import "node:https";
import "node:http2";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/readable-stream.mjs";
import "events";
import "node:string_decoder";
import "../_libs/process-nextick-args.mjs";
import "../_libs/isarray.mjs";
import "../_libs/safe-buffer.mjs";
import "buffer";
import "../_libs/core-util-is.mjs";
import "../_libs/inherits.mjs";
import "../_libs/util-deprecate.mjs";
import "../_libs/lie.mjs";
import "../_libs/immediate.mjs";
import "../_libs/setimmediate.mjs";
import "../_libs/pako.mjs";
var createServerRpc = (serverFnMeta, splitImportFn) => {
  const url = "/_serverFn/" + serverFnMeta.id;
  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const EXCLUDE = /* @__PURE__ */ new Set(["node_modules", ".git", ".lovable", "dist", ".tmp", "tmp", ".cache", "coverage", ".DS_Store", "Thumbs.db", ".env", ".env.local"]);
const EXCLUDE_EXT = /* @__PURE__ */ new Set([".zip", ".tar", ".gz", ".rar", ".7z"]);
async function walk(dir, zip, basePath) {
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
      }
    }
  }
}
const generateSourceZip_createServerFn_handler = createServerRpc({
  id: "8b42bb4332a2cf93f09a94255696b6a6435303e98ac657d3cbe2765ef63c1cbf",
  name: "generateSourceZip",
  filename: "src/lib/download-source.functions.ts"
}, (opts) => generateSourceZip.__executeServer(opts));
const generateSourceZip = createServerFn({
  method: "GET"
}).handler(generateSourceZip_createServerFn_handler, async () => {
  const root = process.cwd();
  const zip = new JSZip();
  await walk(root, zip, root);
  const blob = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6
    }
  });
  const base64 = Buffer.from(blob).toString("base64");
  return {
    base64,
    filename: `kollel-tracker-source_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.zip`
  };
});
export {
  generateSourceZip_createServerFn_handler
};
