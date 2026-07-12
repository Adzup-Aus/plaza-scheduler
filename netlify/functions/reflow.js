// Reflow-on-approval. A date slipped; propose shifting later days while keeping cure
// gaps, and only write when a human accepts. Never silently cascades.
//   POST /api/reflow { action:"propose", jobId, slip:{ sortOrder, newDate }, blackout? }
//   POST /api/reflow { action:"apply",   jobId, proposal:[{ sortOrder, to }] }
import { json, requireAuth } from "./_lib/http.js";
import { supabase } from "./_lib/supabase.js";
import { logSharedChange } from "./_lib/sharedData.js";
import { proposeReflow } from "../../src/lib/scheduleEngine.js";

// Rebuild a day-like list (with dates) from schedule_entries for a job.
// sort_order is carried in notes as "[wd:N]" by the generator.
async function datedDays(jobId) {
  const { data: entries } = await supabase
    .from("schedule_entries").select("*").eq("job_id", jobId).order("scheduled_date");
  return (entries || []).map((e) => {
    const m = (e.notes || "").match(/\[wd:(\d+)\]/);
    return {
      entryId: e.id,
      sortOrder: m ? Number(m[1]) : 0,
      scheduledDate: e.scheduled_date,
      dayType: "work",
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export const handler = requireAuth(async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }
  const { action, jobId } = body;
  if (!jobId) return json(400, { error: "jobId required" });

  if (action === "propose") {
    if (!body.slip?.sortOrder && body.slip?.sortOrder !== 0) return json(400, { error: "slip.sortOrder required" });
    const days = await datedDays(jobId);
    const { proposal, deltaCalendarDays } = proposeReflow(days, body.slip, body.blackout || []);
    return json(200, { ok: true, proposal, deltaCalendarDays });
  }

  if (action === "apply") {
    const proposal = body.proposal || [];
    if (!proposal.length) return json(400, { error: "empty proposal" });
    const days = await datedDays(jobId);
    const bySort = new Map(days.map((d) => [d.sortOrder, d]));
    let applied = 0;
    for (const p of proposal) {
      const d = bySort.get(p.sortOrder);
      if (!d) continue;
      const { error } = await supabase.from("schedule_entries")
        .update({ scheduled_date: p.to, updated_at: new Date().toISOString() })
        .eq("id", d.entryId);
      if (error) throw error;
      applied++;
    }
    await logSharedChange({ entityTable: "schedule_entries", entityId: jobId, field: "reflow_applied", newValue: `days=${applied}` });
    return json(200, { ok: true, applied });
  }

  return json(400, { error: "unknown action" });
});
