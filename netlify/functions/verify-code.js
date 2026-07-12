// POST /api/verify-code { email, code, challenge }
// Verifies the typed code against the signed challenge; on success issues a session token.
import { json, verifyOtp, issueSession } from "./_lib/http.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }

  const { email, code, challenge } = body;
  if (!email || !code || !challenge) return json(400, { error: "email, code and challenge are required" });
  if (!verifyOtp(email, code, challenge)) {
    return json(401, { error: "bad_code", message: "That code is wrong or has expired." });
  }
  return json(200, { token: issueSession(email) });
};
