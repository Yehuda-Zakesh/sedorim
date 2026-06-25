globalThis.__nitro_main__ = import.meta.url;
import { N as NodeResponse, s as serve } from "./_libs/srvx.mjs";
import { d as defineHandler, H as HTTPError, t as toEventHandler, a as defineLazyEventHandler, b as H3Core } from "./_libs/h3.mjs";
import { d as decodePath, w as withLeadingSlash, a as withoutTrailingSlash, j as joinURL } from "./_libs/ufo.mjs";
import { promises } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "node:http";
import "node:stream";
import "node:stream/promises";
import "node:https";
import "node:http2";
import "./_libs/rou3.mjs";
function lazyService(loader) {
  let promise, mod;
  return {
    fetch(req) {
      if (mod) {
        return mod.fetch(req);
      }
      if (!promise) {
        promise = loader().then((_mod) => mod = _mod.default || _mod);
      }
      return promise.then((mod2) => mod2.fetch(req));
    }
  };
}
const services = {
  ["ssr"]: lazyService(() => import("./_ssr/index.mjs"))
};
globalThis.__nitro_vite_envs__ = services;
const headers = ((m) => function headersRouteRule(event) {
  for (const [key2, value] of Object.entries(m.options || {})) {
    event.res.headers.set(key2, value);
  }
});
const assets = {
  "/assets/attendance-DBp0zTM2.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1cdc-Emqx0NXxLcb+9w2AX3wfQjQPFNg"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 7388,
    "path": "../public/assets/attendance-DBp0zTM2.js"
  },
  "/assets/backup-CK9WDQJk.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"3e0a-78aeH+kxwnmeEeJKznzqmFvmOFA"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 15882,
    "path": "../public/assets/backup-CK9WDQJk.js"
  },
  "/assets/app-shell-B4OVgwIZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4ae1-F6pU4tM1YghksjjjT7yl3bE2XT8"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 19169,
    "path": "../public/assets/app-shell-B4OVgwIZ.js"
  },
  "/assets/audit-B4A9s9nU.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"12a8-Mrh9hmFkQ/HYSv53tkXKaknns38"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 4776,
    "path": "../public/assets/audit-B4A9s9nU.js"
  },
  "/assets/clock-XaYKZS-4.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"ae-ISBbmbOnYzhhAQYJ7OelBaHS0p8"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 174,
    "path": "../public/assets/clock-XaYKZS-4.js"
  },
  "/assets/calendar-check-BBZX8MgZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"13b-2aV9Tx0K0shFLgFIkNq32YhZMOc"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 315,
    "path": "../public/assets/calendar-check-BBZX8MgZ.js"
  },
  "/assets/file-down-B08rrLMH.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"16d-LEHGTiTAZ7ew+OBss3JTCovazzw"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 365,
    "path": "../public/assets/file-down-B08rrLMH.js"
  },
  "/assets/calendar-CSig9r4G.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"165e-p2XzCoqWZZPqltxP25JIjCepaZs"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 5726,
    "path": "../public/assets/calendar-CSig9r4G.js"
  },
  "/assets/flame-ClX0Jetk.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1ae-OQEzLrCdCNknY3+30J4gpPDCCHY"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 430,
    "path": "../public/assets/flame-ClX0Jetk.js"
  },
  "/assets/history-5PxTfm_w.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"177d-H+5bzGYfF2pZb74Hj4NK90IXJ/4"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 6013,
    "path": "../public/assets/history-5PxTfm_w.js"
  },
  "/assets/hebrew-calendar-CaFQN1z-.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8c8-cW/Z9hCG2LplfFN2iNJTDigY86s"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 2248,
    "path": "../public/assets/hebrew-calendar-CaFQN1z-.js"
  },
  "/assets/insights-CnRllMge.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1d0c-bWowteWmM6CHR9p5SIezKGcBu9Q"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 7436,
    "path": "../public/assets/insights-CnRllMge.js"
  },
  "/assets/quick-vBc4-wFH.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"106b-O13kJNr8RI8eH3XOSOFaLBtNnGo"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 4203,
    "path": "../public/assets/quick-vBc4-wFH.js"
  },
  "/assets/learning-BBoe6wcd.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1e57-r5PLFT1hKD9eRlY1WcWrw6koicY"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 7767,
    "path": "../public/assets/learning-BBoe6wcd.js"
  },
  "/assets/kollel-store-BmqziGWs.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"204a-813AE7yJKd8Tcar2z+oYjX/90yQ"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 8266,
    "path": "../public/assets/kollel-store-BmqziGWs.js"
  },
  "/assets/index-DWhULmb5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2694-uoniIhOBOxgXA8FdhZE7XGnacI4"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 9876,
    "path": "../public/assets/index-DWhULmb5.js"
  },
  "/assets/save-CXAk5wPs.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"151-t1wmL6ZMSMRD4BdlCbAypS8LXZM"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 337,
    "path": "../public/assets/save-CXAk5wPs.js"
  },
  "/assets/search-hTxM7492.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"16e9-4BJXx4jQFGwO0Q3N8c5VAG/jy1s"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 5865,
    "path": "../public/assets/search-hTxM7492.js"
  },
  "/assets/rotate-ccw-ocBA5uq8.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"d2-NuF6JP7BKkqD+i7sjsrSLEFOGXA"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 210,
    "path": "../public/assets/rotate-ccw-ocBA5uq8.js"
  },
  "/assets/reports-DdBIjXTh.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"49311-spYE3l4+VXuE7TWd0B0EGRSsBIM"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 299793,
    "path": "../public/assets/reports-DdBIjXTh.js"
  },
  "/assets/settings-Bv97vpAR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2903-Jwi+1cu8/Vjx+q0zEC7vZq40CPA"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 10499,
    "path": "../public/assets/settings-Bv97vpAR.js"
  },
  "/assets/settings-store-DoJFbXjq.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"150c-8w1TIzdnj0FrF4O/sTX0PgzXpFE"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 5388,
    "path": "../public/assets/settings-store-DoJFbXjq.js"
  },
  "/assets/statistics-BCLHd9p3.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14c7-Ek2k4uA2gbYNAG1exGl99wSAxfs"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 5319,
    "path": "../public/assets/statistics-BCLHd9p3.js"
  },
  "/assets/square-CN4WU2vG.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"194-4Dpt7QhT+SHh2bm9H0eU1mp/9rQ"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 404,
    "path": "../public/assets/square-CN4WU2vG.js"
  },
  "/assets/index-BiApDmfW.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"5ecbf-X9rL+7hjrTFTvymfOUlh8r8WOC8"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 388287,
    "path": "../public/assets/index-BiApDmfW.js"
  },
  "/assets/styles-DhYN8j7B.css": {
    "type": "text/css; charset=utf-8",
    "etag": '"16caa-r72pNtUMmWl8pgablVhcUk/tj60"',
    "mtime": "2026-06-25T10:37:24.842Z",
    "size": 93354,
    "path": "../public/assets/styles-DhYN8j7B.css"
  },
  "/assets/trash-2-Ds-55GME.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"152-SUi9W7duj2DKXX3sEpARJ6gTtNs"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 338,
    "path": "../public/assets/trash-2-Ds-55GME.js"
  },
  "/assets/trending-down-DG2e2FuZ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"bc-dxBpNejqYeLMhfJTuY4cX6xKS5I"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 188,
    "path": "../public/assets/trending-down-DG2e2FuZ.js"
  },
  "/assets/trending-up-CZowKsQA.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"b9-JNntE2ygez7tQqLfmi9LfRfx6f8"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 185,
    "path": "../public/assets/trending-up-CZowKsQA.js"
  },
  "/assets/triangle-alert-C_S0Stc5.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"113-ABMEnpKQCoortXsJhaJ875L2+Ok"',
    "mtime": "2026-06-25T10:37:24.848Z",
    "size": 275,
    "path": "../public/assets/triangle-alert-C_S0Stc5.js"
  },
  "/assets/upload-CGvZWict.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1a8-do9jBBNu1bMKeYuLmh1QR/7mePk"',
    "mtime": "2026-06-25T10:37:24.847Z",
    "size": 424,
    "path": "../public/assets/upload-CGvZWict.js"
  }
};
function readAsset(id) {
  const serverDir = dirname(fileURLToPath(globalThis.__nitro_main__));
  return promises.readFile(resolve(serverDir, assets[id].path));
}
const publicAssetBases = {};
function isPublicAssetURL(id = "") {
  if (assets[id]) {
    return true;
  }
  for (const base in publicAssetBases) {
    if (id.startsWith(base)) {
      return true;
    }
  }
  return false;
}
function getAsset(id) {
  return assets[id];
}
const METHODS = /* @__PURE__ */ new Set(["HEAD", "GET"]);
const EncodingMap = {
  gzip: ".gz",
  br: ".br",
  zstd: ".zst"
};
const _attSPk = defineHandler((event) => {
  if (event.req.method && !METHODS.has(event.req.method)) {
    return;
  }
  let id = decodePath(withLeadingSlash(withoutTrailingSlash(event.url.pathname)));
  let asset;
  const encodingHeader = event.req.headers.get("accept-encoding") || "";
  const encodings = [...encodingHeader.split(",").map((e) => EncodingMap[e.trim()]).filter(Boolean).sort(), ""];
  for (const encoding of encodings) {
    for (const _id of [id + encoding, joinURL(id, "index.html" + encoding)]) {
      const _asset = getAsset(_id);
      if (_asset) {
        asset = _asset;
        id = _id;
        break;
      }
    }
  }
  if (!asset) {
    if (isPublicAssetURL(id)) {
      event.res.headers.delete("Cache-Control");
      throw new HTTPError({ status: 404 });
    }
    return;
  }
  if (encodings.length > 1) {
    event.res.headers.append("Vary", "Accept-Encoding");
  }
  const ifNotMatch = event.req.headers.get("if-none-match") === asset.etag;
  if (ifNotMatch) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  const ifModifiedSinceH = event.req.headers.get("if-modified-since");
  const mtimeDate = new Date(asset.mtime);
  if (ifModifiedSinceH && asset.mtime && new Date(ifModifiedSinceH) >= mtimeDate) {
    event.res.status = 304;
    event.res.statusText = "Not Modified";
    return "";
  }
  if (asset.type) {
    event.res.headers.set("Content-Type", asset.type);
  }
  if (asset.etag && !event.res.headers.has("ETag")) {
    event.res.headers.set("ETag", asset.etag);
  }
  if (asset.mtime && !event.res.headers.has("Last-Modified")) {
    event.res.headers.set("Last-Modified", mtimeDate.toUTCString());
  }
  if (asset.encoding && !event.res.headers.has("Content-Encoding")) {
    event.res.headers.set("Content-Encoding", asset.encoding);
  }
  if (asset.size > 0 && !event.res.headers.has("Content-Length")) {
    event.res.headers.set("Content-Length", asset.size.toString());
  }
  return readAsset(id);
});
const findRouteRules = /* @__PURE__ */ (() => {
  const $0 = [{ name: "headers", route: "/assets/**", handler: headers, options: { "cache-control": "public, max-age=31536000, immutable" } }];
  return (m, p) => {
    let r = [];
    if (p.charCodeAt(p.length - 1) === 47) p = p.slice(0, -1) || "/";
    let s = p.split("/"), l = s.length;
    if (l > 1) {
      if (s[1] === "assets") {
        r.unshift({ data: $0, params: { "_": s.slice(2).join("/") } });
      }
    }
    return r;
  };
})();
const _lazy_j21Qvj = defineLazyEventHandler(() => import("./_chunks/ssr-renderer.mjs"));
const findRoute = /* @__PURE__ */ (() => {
  const data = { route: "/**", handler: _lazy_j21Qvj };
  return ((_m, p) => {
    return { data, params: { "_": p.slice(1) } };
  });
})();
const globalMiddleware = [
  toEventHandler(_attSPk)
].filter(Boolean);
const errorHandler$1 = (error, event) => {
  const res = defaultHandler(error, event);
  return new NodeResponse(typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2), res);
};
function defaultHandler(error, event) {
  const unhandled = error.unhandled ?? !HTTPError.isError(error);
  const { status = 500, statusText = "" } = unhandled ? {} : error;
  if (status === 404) {
    const url = event.url || new URL(event.req.url);
    const baseURL = "/";
    if (/^\/[^/]/.test(baseURL) && !url.pathname.startsWith(baseURL)) {
      return {
        status: 302,
        headers: new Headers({ location: `${baseURL}${url.pathname.slice(1)}${url.search}` })
      };
    }
  }
  const headers2 = new Headers(unhandled ? {} : error.headers);
  headers2.set("content-type", "application/json; charset=utf-8");
  const jsonBody = unhandled ? {
    status,
    unhandled: true
  } : typeof error.toJSON === "function" ? error.toJSON() : {
    status,
    statusText,
    message: error.message
  };
  return {
    status,
    statusText,
    headers: headers2,
    body: {
      error: true,
      ...jsonBody
    }
  };
}
const errorHandlers = [errorHandler$1];
async function errorHandler(error, event) {
  for (const handler of errorHandlers) {
    try {
      const response = await handler(error, event, { defaultHandler });
      if (response) {
        return response;
      }
    } catch (error2) {
      console.error(error2);
    }
  }
}
function createNitroApp() {
  const captureError = (error, errorCtx) => {
    if (errorCtx?.event) {
      const errors = errorCtx.event.req.context?.nitro?.errors;
      if (errors) {
        errors.push({ error, context: errorCtx });
      }
    }
  };
  const h3App = createH3App({
    onError(error, event) {
      return errorHandler(error, event);
    }
  });
  let appHandler = (req) => {
    req.context ||= {};
    req.context.nitro = req.context.nitro || { errors: [] };
    return h3App.fetch(req);
  };
  return {
    fetch: appHandler,
    h3: h3App,
    hooks: void 0,
    captureError
  };
}
function createH3App(config) {
  const h3App = new H3Core(config);
  h3App["~findRoute"] = (event) => findRoute(event.req.method, event.url.pathname);
  h3App["~middleware"].push(...globalMiddleware);
  h3App["~getMiddleware"] = (event, route) => {
    const pathname = event.url.pathname;
    const method = event.req.method;
    const middleware = [];
    const routeRules = getRouteRules(method, pathname);
    event.context.routeRules = routeRules?.routeRules;
    if (routeRules?.routeRuleMiddleware.length) {
      middleware.push(...routeRules.routeRuleMiddleware);
    }
    middleware.push(...h3App["~middleware"]);
    if (route?.data?.middleware?.length) {
      middleware.push(...route.data.middleware);
    }
    return middleware;
  };
  return h3App;
}
const APP_ID = "default";
function useNitroApp() {
  let instance = useNitroApp._instance;
  if (instance) {
    return instance;
  }
  instance = useNitroApp._instance = createNitroApp();
  globalThis.__nitro__ = globalThis.__nitro__ || {};
  globalThis.__nitro__[APP_ID] = instance;
  return instance;
}
function getRouteRules(method, pathname) {
  const m = findRouteRules(method, pathname);
  if (!m?.length) {
    return { routeRuleMiddleware: [] };
  }
  const routeRules = {};
  for (const layer of m) {
    for (const rule of layer.data) {
      const currentRule = routeRules[rule.name];
      if (currentRule) {
        if (rule.options === false) {
          delete routeRules[rule.name];
          continue;
        }
        if (typeof currentRule.options === "object" && typeof rule.options === "object") {
          currentRule.options = {
            ...currentRule.options,
            ...rule.options
          };
        } else {
          currentRule.options = rule.options;
        }
        currentRule.route = rule.route;
        currentRule.params = {
          ...currentRule.params,
          ...layer.params
        };
      } else if (rule.options !== false) {
        routeRules[rule.name] = {
          ...rule,
          params: layer.params
        };
      }
    }
  }
  const middleware = [];
  const orderedRules = Object.values(routeRules).sort((a, b) => (a.handler?.order || 0) - (b.handler?.order || 0));
  for (const rule of orderedRules) {
    if (rule.options === false || !rule.handler) {
      continue;
    }
    middleware.push(rule.handler(rule));
  }
  return {
    routeRules,
    routeRuleMiddleware: middleware
  };
}
function _captureError(error, type) {
  console.error(`[${type}]`, error);
  useNitroApp().captureError?.(error, { tags: [type] });
}
function trapUnhandledErrors() {
  process.on("unhandledRejection", (error) => _captureError(error, "unhandledRejection"));
  process.on("uncaughtException", (error) => _captureError(error, "uncaughtException"));
}
const tracingSrvxPlugins = [];
const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
const port = Number.isNaN(_parsedPort) ? 3e3 : _parsedPort;
const host = process.env.NITRO_HOST || process.env.HOST;
const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
const nitroApp = useNitroApp();
serve({
  port,
  hostname: host,
  tls: cert && key ? {
    cert,
    key
  } : void 0,
  fetch: nitroApp.fetch,
  plugins: [...tracingSrvxPlugins]
});
trapUnhandledErrors();
const nodeServer = {};
export {
  nodeServer as default
};
