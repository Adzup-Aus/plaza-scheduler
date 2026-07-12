// Shared HTTP helpers + auth for the mini-app.
// Auth is email + one-time code (OTP): an approved email requests a 6-digit code,
// which is emailed via Resend, then exchanged for a signed session token. The code
// is verified statelessly with a signed HMAC "challenge" (no DB table for codes).
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14-day session
const OTP_TTL_MS = 1000 * 60 * 10;             // 10-minute code

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

// ---- generic signed tokens ------------------------------------------------
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

// ---- email allowlist ------------------------------------------------------
// SCHEDULER_ALLOWED_EMAILS: comma-separated list of approved team emails.
export function isEmailAllowed(email) {
  const allow = (process.env.SCHEDULER_ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const e = normEmail(email);
  return !!e && allow.includes(e);
}
function normEmail(email) { return String(email || "").trim().toLowerCase(); }

// ---- one-time code (stateless) -------------------------------------------
function otpHash(email, code) {
  return createHmac("sha256", SECRET).update(`${normEmail(email)}:${code}`).digest("base64url");
}
// A signed challenge that binds the emailed code to the email + an expiry,
// without ever storing the code. The client returns it with the typed code.
export function issueOtpChallenge(email, code) {
  return sign({ typ: "otp", email: normEmail(email), codeHash: otpHash(email, code), exp: Date.now() + OTP_TTL_MS });
}
export function verifyOtp(email, code, challenge) {
  const p = verifyToken(challenge);          // checks signature + expiry
  if (!p || p.typ !== "otp") return false;
  if (p.email !== normEmail(email)) return false;
  const a = Buffer.from(otpHash(email, code));
  const b = Buffer.from(p.codeHash || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- session --------------------------------------------------------------
export function issueSession(email) {
  return sign({ role: "office", email: normEmail(email), exp: Date.now() + TOKEN_TTL_MS });
}

// Wrap a handler so it 401s unless a valid session token is present.
export function requireAuth(handler) {
  return async (event) => {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!verifyToken(token)) return json(401, { error: "unauthorised" });
    try {
      return await handler(event);
    } catch (err) {
      // Copyable error log (mandatory feature): structured, copyable error.
      return json(500, {
        error: "server_error",
        message: String(err?.message || err),
        stack: process.env.NODE_ENV === "production" ? undefined : String(err?.stack || ""),
        at: new Date().toISOString(),
      });
    }
  };
}
