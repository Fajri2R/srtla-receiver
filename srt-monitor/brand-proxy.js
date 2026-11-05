/**
 * Brand identity proxy for the SRT Monitor dashboard.
 *
 * The HLS manager owns the runtime brand config (written from SLS → Settings →
 * Brand Identity); this module mirrors the read side on the monitor origin so
 * https://monitor.example.test can load it same-origin. Returns true when the
 * request was handled.
 */
const BRAND_PATHS = new Set(["/api/brand", "/api/brand/asset", "/api/brand/brand.js"]);

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

export function handleBrandProxy(req, res, ctx) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (!BRAND_PATHS.has(url.pathname)) return false;
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }

  const base = String(ctx.baseUrl || "").replace(/\/+$/, "");
  (async () => {
    let upstream;
    try {
      upstream = await fetch(base + url.pathname, { headers: { Accept: req.headers.accept || "*/*" }, signal: AbortSignal.timeout(4000) });
    } catch {
      sendJson(res, 502, { error: "Brand upstream unavailable" });
      return;
    }

    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    };
    if (upstream.headers.get("location")) headers.Location = upstream.headers.get("location");

    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, headers);
    res.end(bytes);
  })();
  return true;
}
