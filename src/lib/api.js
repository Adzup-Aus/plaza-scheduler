// Front-end API client + the two mandatory mini-app features:
//   1. a copyable error log (every failed call is captured)
//   2. a runtime cost calculator (every AI generate call is tallied and costed)
// Token is held in memory only (no localStorage — not supported in this environment).

let TOKEN = null;
export function setToken(t) { TOKEN = t; }
export function hasToken() { return !!TOKEN; }

// --- error log ---
const errorLog = [];
const errorSubs = new Set();
export function subscribeErrors(fn) { errorSubs.add(fn); return () => errorSubs.delete(fn); }
export function getErrors() { return errorLog.slice(); }
function pushError(e) {
  errorLog.unshift({ ...e, at: new Date().toISOString() });
  if (errorLog.length > 100) errorLog.pop();
  errorSubs.forEach((fn) => fn(getErrors()));
}
export function clearErrors() { errorLog.length = 0; errorSubs.forEach((fn) => fn(getErrors())); }

// --- cost calculator ---
// Rough per-generation estimate: scope in + JSON out. Sonnet intro $2/$10 per M tokens
// (Stage 1B log). Assume ~1.5k in + ~0.4k out per generation as a visible estimate.
const COST = { model: "sonnet", inPerM: 2, outPerM: 10, estIn: 1500, estOut: 400 };
const cost = { generations: 0, estUsd: 0 };
const costSubs = new Set();
export function subscribeCost(fn) { costSubs.add(fn); return () => costSubs.delete(fn); }
export function getCost() { return { ...cost, perGenUsd: perGen() }; }
function perGen() { return (COST.estIn / 1e6) * COST.inPerM + (COST.estOut / 1e6) * COST.outPerM; }
function tallyGeneration() {
  cost.generations += 1;
  cost.estUsd = +(cost.generations * perGen()).toFixed(4);
  costSubs.forEach((fn) => fn(getCost()));
}

async function call(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  let res, data;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    pushError({ path, method, message: String(err?.message || err), kind: "network" });
    throw err;
  }
  if (!res.ok) {
    pushError({ path, method, status: res.status, message: data?.message || data?.error || `HTTP ${res.status}`, body: data });
    const e = new Error(data?.error || `HTTP ${res.status}`);
    e.data = data;
    throw e;
  }
  return data;
}

export const api = {
  requestCode: (email) => call("request-code", { method: "POST", body: { email } }),
  verifyCode: async (email, code, challenge) => {
    const r = await call("verify-code", { method: "POST", body: { email, code, challenge } });
    if (r.token) setToken(r.token);
    return r;
  },
  board: (from, to) => call(`board?from=${from || ""}&to=${to || ""}`),
  generate: async (payload) => { const r = await call("generate", { method: "POST", body: payload }); if (r.ok) tallyGeneration(); return r; },
  patchDay: (dayId, patch) => call("work-day", { method: "PATCH", body: { dayId, patch } }),
  patchEntry: (entryId, patch) => call("work-day", { method: "PATCH", body: { entryId, patch } }),
  addDay: (payload) => call("work-day", { method: "POST", body: payload }),
  reflowPropose: (jobId, slip) => call("reflow", { method: "POST", body: { action: "propose", jobId, slip } }),
  reflowApply: (jobId, proposal) => call("reflow", { method: "POST", body: { action: "apply", jobId, proposal } }),
};
