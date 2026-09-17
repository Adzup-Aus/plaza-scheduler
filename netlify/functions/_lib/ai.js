// Plaza Works - the one place an AI call leaves this app.
//
// 17 September 2026: every AI call goes through OpenRouter, so all AI usage is
// billed and monitored in one account instead of a separate Anthropic bill.
// OpenRouter serves Anthropic's own message format at /api/v1/messages, so the
// request body and the reply shape are unchanged.
//
// Env:
//   OPENROUTER_API_KEY  preferred. Set this in Netlify before deploying.
//   ANTHROPIC_API_KEY   fallback only, so a deploy that lands before the key is
//                       set keeps working. It logs a warning when it is used.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/messages";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const MODEL_MAP = {
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "claude-sonnet-4-5-20250929": "anthropic/claude-sonnet-4.5",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-opus-4-5": "anthropic/claude-opus-4.5",
  "claude-opus-5": "anthropic/claude-opus-5",
};

export function openRouterModel(model) {
  const m = String(model || "");
  if (m.indexOf("/") !== -1) return m;
  return MODEL_MAP[m] || ("anthropic/" + m);
}

export function aiConfigured() {
  return !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function callAI(body, opts) {
  const title = (opts && opts.title) || "Plaza scheduler";
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        authorization: "Bearer " + orKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-title": title,
      },
      body: JSON.stringify({ ...body, model: openRouterModel(body.model) }),
    });
  }
  const anKey = process.env.ANTHROPIC_API_KEY;
  if (!anKey) throw new Error("No AI key set (OPENROUTER_API_KEY)");
  console.warn("[ai] OPENROUTER_API_KEY is not set, falling back to the Anthropic key. Set OPENROUTER_API_KEY in Netlify.");
  return fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": anKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
