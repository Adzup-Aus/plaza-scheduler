// POST /api/generate  { jobId, startDate, cure?, confirm? }
// Reads the accepted quote, extracts scope signals with Claude, builds the schedule
// deterministically, and persists it. If a schedule already exists, requires
// confirm:true (so a regenerate never silently replaces unsubmitted human edits).
import { json, requireAuth } from "./_lib/http.js";
import { getAcceptedQuoteForJob } from "./_lib/sharedData.js";
import { extractSignals } from "./_lib/anthropic.js";
import { buildSchedule } from "../../src/lib/scheduleEngine.js";
import { getExistingSchedule, persistSchedule } from "./_lib/persist.js";

export const handler = requireAuth(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }
  const { jobId, startDate, cure, confirm } = body;
  if (!jobId || !startDate) return json(400, { error: "jobId and startDate are required" });

  const { job, quote, milestones } = getAcceptedQuoteForJob
    ? await getAcceptedQuoteForJob(jobId) : {};
  if (!job) return json(404, { error: "job_not_found" });
  if (!quote) return json(409, { error: "no_accepted_quote_linked", message: "Job has no linked quote to read scope from." });
  if (quote.status && quote.status !== "accepted") {
    return json(409, { error: "quote_not_accepted", status: quote.status });
  }

  // Guard regeneration.
  const existing = await getExistingSchedule(jobId);
  if (existing.schedule && !confirm) {
    const submitted = existing.days.filter((d) => d.submitted_at).length;
    return json(200, {
      needsConfirm: true,
      message: `A schedule already exists (${existing.days.length} days, ${submitted} submitted). Regenerating keeps submitted days and replaces the rest. Send confirm:true to proceed.`,
      existingDays: existing.days.length,
      submittedDays: submitted,
    });
  }

  const { signals, model } = await extractSignals(quote, job);
  const { days, unmatchedMilestones, orderConflict } = buildSchedule(signals, {
    startDate, milestones, cure,
  });
  const result = await persistSchedule({
    jobId, quoteId: quote.id, engineDays: days, generationSource: "ai",
  });

  return json(200, {
    ok: true,
    model,
    signals,
    scheduleId: result.scheduleId,
    daysInserted: result.inserted,
    lockedDays: result.lockedCount,
    unmatchedMilestones,
    orderConflict,
  });
});
