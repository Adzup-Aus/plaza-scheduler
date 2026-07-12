// GET /api/board?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns every active job with its work days (positional plan) and its dated
// schedule_entries in range, for the master board (grid + timeline over one dataset).
import { json, requireAuth } from "./_lib/http.js";
import { supabase } from "./_lib/supabase.js";

export const handler = requireAuth(async (event) => {
  const q = event.queryStringParameters || {};
  const from = q.from || null;
  const to = q.to || null;

  // Active jobs = not completed/cancelled.
  const { data: jobs, error: jErr } = await supabase
    .from("jobs").select("id, job_number, job_name, client_name, suburb, address, status, quote_id")
    .not("status", "in", "(completed,cancelled)")
    .order("created_at", { ascending: true });
  if (jErr) throw jErr;

  const jobIds = (jobs || []).map((j) => j.id);
  if (!jobIds.length) return json(200, { jobs: [], days: [], entries: [], range: { from, to } });

  const { data: schedules } = await supabase
    .from("job_work_schedules").select("*").in("job_id", jobIds);
  const scheduleIds = (schedules || []).map((s) => s.id);

  let days = [];
  if (scheduleIds.length) {
    const { data: d } = await supabase
      .from("job_work_days").select("*").in("schedule_id", scheduleIds).order("sort_order");
    days = d || [];
  }

  let entriesQ = supabase.from("schedule_entries").select("*").in("job_id", jobIds);
  if (from) entriesQ = entriesQ.gte("scheduled_date", from);
  if (to) entriesQ = entriesQ.lte("scheduled_date", to);
  const { data: entries } = await entriesQ.order("scheduled_date");

  return json(200, {
    jobs: jobs || [],
    schedules: schedules || [],
    days,
    entries: entries || [],
    range: { from, to },
  });
});
