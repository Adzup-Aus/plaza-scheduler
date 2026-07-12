// App-local Supabase client (ESM). Server-side only, service_role key.
// Mirrors Framework/Mini_Apps_Build_Guide/shared/supabaseClient.js but as ESM so
// this app's ESM functions can import it. The canonical shared helper is left
// untouched (staying in our lane).
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY. Set both in Netlify env (server-side, never the front end)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export { SUPABASE_URL };
