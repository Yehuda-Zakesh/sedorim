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
  "/assets/app-shell-DTIPXeU0.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"4ae1-PxHQy1jzgOQOnNPPiwXx7zRiU2I"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 19169,
    "path": "../client/assets/app-shell-DTIPXeU0.js"
  },
  "/assets/backup-DqInvt6Y.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"3e0a-t2Ewve5e86qu6Qnu1tdThbi9EEQ"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 15882,
    "path": "../client/assets/backup-DqInvt6Y.js"
  },
  "/assets/attendance-n-NGcEaJ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1cdc-ad7AvyL9gOwU44B/r54uogukHKo"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 7388,
    "path": "../client/assets/attendance-n-NGcEaJ.js"
  },
  "/assets/calendar-RFEUtHsk.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"165e-ILtrsjDk3JmuEmeZRga13dz1OXM"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 5726,
    "path": "../client/assets/calendar-RFEUtHsk.js"
  },
  "/assets/audit-COUvtoBN.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"12a8-EzQhxRK9a67im2lkmEuPEXb5ilg"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 4776,
    "path": "../client/assets/audit-COUvtoBN.js"
  },
  "/assets/calendar-check-BIWXmheu.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"13b-HCqfsAQ9EJ6S1ZH9D30Qmteb9dI"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 315,
    "path": "../client/assets/calendar-check-BIWXmheu.js"
  },
  "/assets/clock-CGLYvxg1.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"ae-ozbsJa1obcsS/rUyoF8WLoLQ4vQ"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 174,
    "path": "../client/assets/clock-CGLYvxg1.js"
  },
  "/assets/flame-BHybOgAR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1ae-qKQ6eu39Zw3yd/4gPs9oRzii96Q"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 430,
    "path": "../client/assets/flame-BHybOgAR.js"
  },
  "/assets/file-down-D0qoOXVp.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"16d-VY/6avfrC97FgvRkgrenKJXvvYA"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 365,
    "path": "../client/assets/file-down-D0qoOXVp.js"
  },
  "/assets/index-BWprav2e.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"5ecbf-iR18+vo7IaSbudc4h5b3lpq290g"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 388287,
    "path": "../client/assets/index-BWprav2e.js"
  },
  "/assets/history-P7rxMUvb.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"177d-bMaXV455EeslbyaupJcQdhbm9BA"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 6013,
    "path": "../client/assets/history-P7rxMUvb.js"
  },
  "/assets/index-YGD_PxiS.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2694-Br1uyLVOi/yIfbXZuBNy6zXik9k"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 9876,
    "path": "../client/assets/index-YGD_PxiS.js"
  },
  "/assets/insights-CJgLxQFJ.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1d0c-8yPrnn6B4stLN4nxxjlzqQQBkRc"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 7436,
    "path": "../client/assets/insights-CJgLxQFJ.js"
  },
  "/assets/hebrew-calendar-CaFQN1z-.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"8c8-cW/Z9hCG2LplfFN2iNJTDigY86s"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 2248,
    "path": "../client/assets/hebrew-calendar-CaFQN1z-.js"
  },
  "/assets/kollel-store-CramlyGR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1fda-DmklfVrWRHTM8kV6/dy+obx3Kh8"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 8154,
    "path": "../client/assets/kollel-store-CramlyGR.js"
  },
  "/assets/learning-BmmJa_YK.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1e57-Yx53bOYULkd9Y7t/IZDBCEv3TOA"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 7767,
    "path": "../client/assets/learning-BmmJa_YK.js"
  },
  "/assets/save-qjIau11y.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"151-C9IqL2G2bZgn7xPWw0C4J7PFF58"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 337,
    "path": "../client/assets/save-qjIau11y.js"
  },
  "/assets/search-DsjqMSK6.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"16e9-cQ3dqbqLiByrP/wcNk7Q58etGf4"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 5865,
    "path": "../client/assets/search-DsjqMSK6.js"
  },
  "/assets/square-CxfUVT-Q.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"194-Xhlu0Rba7KuHlUL+7Vp2tPZk1Mk"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 404,
    "path": "../client/assets/square-CxfUVT-Q.js"
  },
  "/assets/quick-D7E6zCHg.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"106b-bnI3er1wxh88yMTzJN8ICnOikl4"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 4203,
    "path": "../client/assets/quick-D7E6zCHg.js"
  },
  "/assets/settings-D6kwONfx.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"2903-rZKOcHdpL1FCLP3jDUz/+4kTbHw"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 10499,
    "path": "../client/assets/settings-D6kwONfx.js"
  },
  "/assets/statistics-DJl5Qtyw.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"14c7-bEGrDoQ6wFQzwJOABsZuyEuCVGY"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 5319,
    "path": "../client/assets/statistics-DJl5Qtyw.js"
  },
  "/assets/reports-JvAK7jP3.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"49311-vw7lcGFjfELPf/fpxzfA4VUkYcE"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 299793,
    "path": "../client/assets/reports-JvAK7jP3.js"
  },
  "/assets/rotate-ccw-DPjqgXWR.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"d2-V5cnvF2Y2gNmcW0I227b04OSrKM"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 210,
    "path": "../client/assets/rotate-ccw-DPjqgXWR.js"
  },
  "/assets/settings-store-Bodd1vGU.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"150c-SHJG/Co7gSXDe3tZrCXl26t3I70"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 5388,
    "path": "../client/assets/settings-store-Bodd1vGU.js"
  },
  "/assets/styles-DhYN8j7B.css": {
    "type": "text/css; charset=utf-8",
    "etag": '"16caa-r72pNtUMmWl8pgablVhcUk/tj60"',
    "mtime": "2026-06-15T17:21:13.941Z",
    "size": 93354,
    "path": "../client/assets/styles-DhYN8j7B.css"
  },
  "/assets/trash-2-CFnfHoYd.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"152-uQu9XdU0+Co/N7zqZ/K5JXdBcss"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 338,
    "path": "../client/assets/trash-2-CFnfHoYd.js"
  },
  "/assets/triangle-alert-DZ0492-c.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"113-52TqFEQxyYDtt50NVjYSbSf2ht8"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 275,
    "path": "../client/assets/triangle-alert-DZ0492-c.js"
  },
  "/assets/trending-down-CdMPAktD.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"bc-QF+n9ELPg06f5VwEN9ncC6rRjkI"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 188,
    "path": "../client/assets/trending-down-CdMPAktD.js"
  },
  "/assets/upload-Bw8aFVKn.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"1a8-rixveoKKCRbbNAPdsKeSHlnWwSo"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 424,
    "path": "../client/assets/upload-Bw8aFVKn.js"
  },
  "/assets/trending-up-DKgVpvgn.js": {
    "type": "text/javascript; charset=utf-8",
    "etag": '"b9-ltOQv6wrVJv/E+edHqznMEaGDJU"',
    "mtime": "2026-06-15T17:21:13.942Z",
    "size": 185,
    "path": "../client/assets/trending-up-DKgVpvgn.js"
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
