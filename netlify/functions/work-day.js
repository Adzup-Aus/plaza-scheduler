// Free-form editing over structured rows. Structure never gates; you can type anything.
//   PATCH /api/work-day  { dayId, patch:{ title?, tradesOnSite?, stageTag?, sectionHeading?, dayType? } }
//   PATCH /api/work-day  { entryId, patch:{ staffId?, scheduledDate?, startTime?, endTime?, status?, notes? } }
//   POST  /api/work-day  { scheduleId, jobId, title, ... }   // ad-hoc day
import { json, requireAuth } from "./_lib/http.js";
import { supabase } from "./_lib/supabase.js";
import { logSharedChange } from "./_lib/sharedData.js";

const DAY_FIELDS = {
  title: "title", tradesOnSite: "trades_on_site", stageTag: "stage_tag",
  sectionHeading: "section_heading", dayType: "day_type", dayNumber: "day_number",
  isMilestoneReleaseDay: "is_milestone_release_day", milestoneName: "milestone_name",
  milestoneAmount: "milestone_amount",
};
const ENTRY_FIELDS = {
  staffId: "staff_id", scheduledDate: "scheduled_date", startTime: "start_time",
  endTime: "end_time", status: "status", notes: "notes",
};

function mapPatch(patch, allow) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) if (allow[k]) out[allow[k]] = v;
  out.updated_at = new Date().toISOString();
  return out;
}

export const handler = requireAuth(async (event) => {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "bad_json" }); }

  if (event.httpMethod === "PATCH" && body.dayId) {
    const upd = mapPatch(body.patch, DAY_FIELDS);
    const { data, error } = await supabase.from("job_work_days")
      .update(upd).eq("id", body.dayId).select("*").single();
    if (error) throw error;
    await logSharedChange({ entityTable: "job_work_days", entityId: body.dayId, field: "manual_edit", newValue: JSON.stringify(body.patch).slice(0, 400) });
    return json(200, { ok: true, day: data });
  }

  if (event.httpMethod === "PATCH" && body.entryId) {
    const upd = mapPatch(body.patch, ENTRY_FIELDS);
    const { data, error } = await supabase.from("schedule_entries")
      .update(upd).eq("id", body.entryId).select("*").single();
    if (error) throw error;
    await logSharedChange({ entityTable: "schedule_entries", entityId: body.entryId, field: "manual_edit", newValue: JSON.stringify(body.patch).slice(0, 400) });
    return json(200, { ok: true, entry: data });
  }

  if (event.httpMethod === "POST") {
    const { scheduleId, jobId } = body;
    if (!scheduleId || !jobId || !body.title) return json(400, { error: "scheduleId, jobId and title required" });
    const { data, error } = await supabase.from("job_work_days").insert({
      schedule_id: scheduleId, job_id: jobId, title: body.title,
      day_type: body.dayType || "work", trades_on_site: body.tradesOnSite || null,
      stage_tag: body.stageTag || null, section_heading: body.sectionHeading || body.title,
      sort_order: body.sortOrder ?? 9999,
    }).select("*").single();
    if (error) throw error;
    if (body.scheduledDate) {
      await supabase.from("schedule_entries").insert({
        job_id: jobId, staff_id: body.staffId || "UNASSIGNED",
        scheduled_date: body.scheduledDate, status: "pending",
        notes: `${body.title} [wd:${data.sort_order}]`,
      });
    }
    await logSharedChange({ entityTable: "job_work_days", entityId: data.id, field: "created_adhoc", newValue: body.title });
    return json(200, { ok: true, day: data });
  }

  return json(405, { error: "method_not_allowed" });
});
