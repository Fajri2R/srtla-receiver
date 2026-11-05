/**
 * HTTP routes for runtime brand identity — the single source of truth for
 * every dashboard in the stack.
 *
 *   GET  /api/brand        -> current config (public, no-store)
 *   POST /api/brand        -> replace config (Bearer <SLS API key>)
 *   GET  /api/brand/asset  -> the active logo bytes (decoded / from disk / redirect)
 *   GET  /api/brand/brand.js -> shared client sync script for HLS + SRT dashboards
 *
 * Kept separate from index.js so the behaviour is testable without booting
 * the reconciler or spawning FFmpeg.
 */
import { readBrandConfig, writeBrandConfig, isBrandWriteAuthorized, DEFAULT_BRAND } from "./brand-config.js";
export { DEFAULT_BRAND };
import { readFileSync, existsSync, statSync } from "fs";
import { join, normalize } from "path";

const MAX_BODY = 800 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;

const MIME_BY_EXT = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

/** Serve the active logo so the other dashboards can point <img> at it. */
function serveBrandAsset(res, ctx) {
  const { logo } = readBrandConfig(ctx.brandPath);

  // Uploaded image: decode the data URL to real bytes with its own mime type.
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(logo);
  if (dataUrl) {
    const bytes = Buffer.from(dataUrl[2], "base64");
    if (!bytes.length || bytes.length > MAX_ASSET_BYTES) return sendJson(res, 404, { error: "Asset unavailable" });
    res.writeHead(200, {
      "Content-Type": dataUrl[1],
      "Content-Length": bytes.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    return res.end(bytes);
  }

  // Remote logo: let the browser fetch it from where it actually lives.
  if (/^https?:\/\//i.test(logo)) {
    res.writeHead(302, { Location: logo, "Cache-Control": "no-cache" });
    return res.end();
  }

  // Filesystem logo: only inside the shared assets directory.
  const assetsDir = ctx.assetsDir || "/brand/assets";
  const relative = String(logo).replace(/^\/+/, "").replace(/^assets\//, "");
  const path = join(assetsDir, normalize(relative));
  if (!path.startsWith(assetsDir) || !existsSync(path) || !statSync(path).isFile()) {
    return sendJson(res, 404, { error: "Asset not found" });
  }
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const bytes = readFileSync(path);
  res.writeHead(200, {
    "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  return res.end(bytes);
}

function serveBrandScript(res, ctx) {
  const path = ctx.brandScriptPath || join(import.meta.dirname, "brand-client.js");
  let body;
  try {
    body = readFileSync(path);
  } catch {
    return sendJson(res, 404, { error: "Script not found" });
  }
  res.writeHead(200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

export function handleBrandRoutes(req, res, ctx) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/brand/asset") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" }), true;
    serveBrandAsset(res, ctx);
    return true;
  }

  if (url.pathname === "/api/brand/brand.js") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" }), true;
    serveBrandScript(res, ctx);
    return true;
  }

  if (url.pathname !== "/api/brand") return false;

  if (req.method === "GET") {
    sendJson(res, 200, readBrandConfig(ctx.brandPath));
    return true;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  if (!isBrandWriteAuthorized(req.headers.authorization, ctx.apiKey())) {
    sendJson(res, 401, { error: "Unauthorized" });
    return true;
  }

  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > MAX_BODY) {
      tooLarge = true;
      sendJson(res, 413, { error: "Brand payload too large (max 800 KB)" });
      req.destroy();
    }
  });
  req.on("end", () => {
    if (tooLarge) return;
    let payload;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "Invalid JSON" });
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      sendJson(res, 400, { error: "Expected a JSON object" });
      return;
    }
    try {
      sendJson(res, 200, writeBrandConfig(ctx.brandPath, payload));
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
  });
  req.on("error", () => {
    if (!res.writableEnded) sendJson(res, 400, { error: "Request error" });
  });
  return true;
}
