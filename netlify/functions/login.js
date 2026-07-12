// POST { passcode } -> { token }. The shared-passcode gate (phase-0 pattern).
import { json, checkPasscode, issueToken } from "./_lib/http.js";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }
  if (!checkPasscode(body.passcode)) return json(401, { error: "wrong_passcode" });
  return json(200, { token: issueToken() });
};
