/**
 * Brand identity for the SLS dashboard (logo + label), stored per deployment.
 *
 * The repository is public, so branding must never be baked into the bundle:
 * defaults are neutral, and a deployment can override them at runtime from
 * SLS → Settings → Brand Identity. Values are persisted to a JSON file on a
 * mounted volume (gitignored), which keeps custom logos out of version control.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { dirname } from "path";
import { timingSafeEqual } from "crypto";

export const DEFAULT_BRAND = Object.freeze({
  name: "SRT LIVE",
  subtitle: "Stream Management Console",
  logo: "/brand-mark.svg",
});

const MAX_NAME = 28;
const MAX_SUBTITLE = 48;
const MAX_LOGO_LENGTH = 700000; // ~512 KB of base64 payload

const DATA_LOGO_RE = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i;
const HTTP_LOGO_RE = /^https?:\/\/[^\s"'<>\\]+$/i;
const PATH_LOGO_RE = /^\/(?!\/)[^\s"'<>\\]*$/;

/** Collapse control characters and repeated whitespace; trim to `max` chars. */
function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanLogo(value) {
  if (typeof value !== "string") return DEFAULT_BRAND.logo;
  const logo = value.trim();
  if (!logo || logo.length > MAX_LOGO_LENGTH) return DEFAULT_BRAND.logo;
  if (DATA_LOGO_RE.test(logo) || HTTP_LOGO_RE.test(logo) || PATH_LOGO_RE.test(logo)) {
    return logo;
  }
  return DEFAULT_BRAND.logo;
}

/**
 * Coerce arbitrary input into a complete, safe brand config.
 * Missing or invalid fields fall back to the neutral defaults.
 */
export function normalizeBrandConfig(input) {
  const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  return {
    name: cleanText(src.name, MAX_NAME) || DEFAULT_BRAND.name,
    subtitle: cleanText(src.subtitle, MAX_SUBTITLE) || DEFAULT_BRAND.subtitle,
    logo: cleanLogo(src.logo),
  };
}

/** Read the deployment's brand file; absent or malformed files yield defaults. */
export function readBrandConfig(path) {
  try {
    return normalizeBrandConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

/** Atomically persist a normalized brand config and return what was written. */
export function writeBrandConfig(path, input) {
  const normalized = normalizeBrandConfig(input);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
  return normalized;
}

/**
 * Branding writes reuse the existing SLS API key as the shared secret so the
 * endpoint is not open to the internet.
 */
export function isBrandWriteAuthorized(header, expectedKey) {
  const expected = String(expectedKey || "").trim();
  if (!expected || typeof header !== "string") return false;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1].trim(), "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length) return false;
  try {
    return timingSafeEqual(given, want);
  } catch {
    return false;
  }
}
