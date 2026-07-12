// Shared HTTP helpers + the passcode gate for the mini-app (phase-0 pattern).
// The gate is a single shared passcode (SCHEDULER_PASSCODE env). On success the
// front end holds a signed token; every function checks it. No per-person auth
// (that arrives at assimilation).
import { createHmac, timingSafeEqual } from "node:crypto";

const PASSCODE = process.env.SCHEDULER_PASSCODE || "";
const SECRET = process.env.SESSION_SECRET || PASSCODE || "dev-secret";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${mac}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [data, mac] = token.split(".");
  const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); }
  catch { return null; }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function checkPasscode(input) {
  if (!PASSCODE) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(PASSCODE);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken() {
  return sign({ role: "office", exp: Date.now() + TOKEN_TTL_MS });
}

// Wrap a handler so it 401s unless a valid token is present (Authorization: Bearer …).
export function requireAuth(handler) {
  return async (event) => {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!verifyToken(token)) return json(401, { error: "unauthorised" });
    try {
      return await handler(event);
    } catch (err) {
      // Copyable error log (mandatory feature): return a structured, copyable error.
      return json(500, {
        error: "server_error",
        message: String(err?.message || err),
        stack: process.env.NODE_ENV === "production" ? undefined : String(err?.stack || ""),
        at: new Date().toISOString(),
      });
    }
  };
}
