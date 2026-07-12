// POST /api/request-code { email }
// If the email is on the allowlist, generate a 6-digit code, email it via Resend,
// and return a signed challenge (which encodes the code's hash + expiry, not the code).
import { json, isEmailAllowed, issueOtpChallenge } from "./_lib/http.js";
import { sendLoginCode } from "./_lib/email.js";
import { randomInt } from "node:crypto";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return json(400, { error: "invalid_email", message: "Enter a valid email." });
  if (!isEmailAllowed(email)) {
    return json(403, { error: "not_allowed", message: "This email isn't approved for access." });
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  try {
    await sendLoginCode(email, code);
  } catch (err) {
    return json(502, { error: "email_failed", message: String(err?.message || err) });
  }

  return json(200, { ok: true, challenge: issueOtpChallenge(email, code) });
};
