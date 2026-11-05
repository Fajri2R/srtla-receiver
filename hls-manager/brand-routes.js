/**
 * HTTP routes for runtime brand identity.
 *
 *   GET  /api/brand   -> current config (public, no-store)
 *   POST /api/brand   -> replace config (Bearer <SLS API key>)
 *
 * Kept separate from index.js so the behaviour is testable without booting
 * the reconciler or spawning FFmpeg.
 */
import { readBrandConfig, writeBrandConfig, isBrandWriteAuthorized, DEFAULT_BRAND } from "./brand-config.js";
export { DEFAULT_BRAND };

const MAX_BODY = 800 * 1024;

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

export function handleBrandRoutes(req, res, ctx) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
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
