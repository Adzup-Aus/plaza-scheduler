// Retired: passcode login was replaced by email + one-time code
// (see request-code.js / verify-code.js). Kept as a stub so any old client
// call fails cleanly instead of 404.
import { json } from "./_lib/http.js";

export const handler = async () =>
  json(410, { error: "gone", message: "Passcode login has been replaced by email + code." });
