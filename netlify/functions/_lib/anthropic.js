// Claude call: read an accepted quote's scope text and return the structured scope
// SIGNALS the deterministic engine needs. The model ONLY extracts what is in scope
// and may suggest friendly titles; it never decides trade order or cure gaps.
//
// Env: OPENROUTER_API_KEY (required, server-side), AI_MODEL / ANTHROPIC_MODEL (optional).
// 17 Sep 2026: the call goes through OpenRouter (see ./ai.js); same model, same
// message format, one bill.
// The exact model string is env-driven so it can be set to whatever is current
// without a code change (the daily classifier in Stage 1B uses claude-sonnet-5).
import { callAI, aiConfigured } from "./ai.js";

const MODEL = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// The shape the engine consumes. Kept in one place so the prompt and the code agree.
export const SIGNAL_KEYS = [
  "electricalRoughIn", "electricalFitOff", "showerNiche", "showerScreen",
  "showerScreenType", "bathInWetArea", "plastering", "upperStorey",
  "floorArea", "drainageNotifiable", "multiBathroom",
];

function buildPrompt(quote, job) {
  const scope = [quote?.scope_body, quote?.introduction, job?.description]
    .filter(Boolean).join("\n\n");
  return `You are a bathroom-renovation scheduling assistant for Plaza Works (Queensland).
Read the accepted quote scope below and return ONLY a JSON object of scope signals.
Do NOT decide trade order or cure times — those are fixed in code. Only report what is in scope.

Return this exact JSON shape (booleans, or the noted values):
{
  "electricalRoughIn": bool,   // new electrical points/cable runs (not a like-for-like swap)
  "electricalFitOff": bool,    // any electrical work at all (fittings/fan/GPO)
  "showerNiche": bool,         // a shower niche is in scope
  "showerScreen": bool,        // a shower screen/glass is in scope
  "showerScreenType": "fixed_panel" | "frameless" | "framed" | "semi_frameless" | null,
  "bathInWetArea": bool,       // a bath sits in the wet area
  "plastering": bool,          // plastering (not just painting) is in scope
  "upperStorey": bool,         // bathroom is first floor or above
  "floorArea": number|null,    // floor m² if stated, else null
  "drainageNotifiable": bool,  // sanitary drainage altered/relocated (notifiable work)
  "multiBathroom": bool        // more than one bathroom in scope
}

SCOPE:
${scope || "(no scope text found)"}
`;
}

export async function extractSignals(quote, job) {
  if (!aiConfigured()) {
    throw new Error("Missing OPENROUTER_API_KEY (set it in Netlify env, server-side).");
  }
  const res = await callAI({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: buildPrompt(quote, job) }],
  }, { title: "Plaza scheduler" });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI call failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data?.content?.[0]?.text || "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  const signals = JSON.parse(match[0]);
  return { signals, model: MODEL, raw: text };
}
