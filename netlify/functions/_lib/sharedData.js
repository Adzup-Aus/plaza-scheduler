// App-local shared-data helpers (ESM). Every write to a shared fact appends one
// row to shared_data_change_log (data-contract.md rule). This app OWNS the schedule
// tables (job_work_schedules, job_work_days, job_checklist_items,
// job_photo_requirements, schedule_entries) and READS the rest.
import { supabase } from "./supabase.js";

export const APP_NAME = "scheduler";

export async function logSharedChange({
  entityTable, entityId, field = null, oldValue = null, newValue = null,
  changedByApp = APP_NAME, changedById = null, eventEmitted = false,
}) {
  if (!entityTable || !entityId) throw new Error("logSharedChange needs entityTable and entityId");
  const { error } = await supabase.from("shared_data_change_log").insert({
    entity_table: entityTable,
    entity_id: entityId,
    field,
    old_value: oldValue === null ? null : String(oldValue),
    new_value: newValue === null ? null : String(newValue),
    changed_by_app: changedByApp,
    changed_by_id: changedById,
    event_emitted: eventEmitted,
  });
  if (error) throw error;
}

// Read the accepted quote for a job (scope + milestones), for the generator.
export async function getAcceptedQuoteForJob(jobId) {
  const { data: job, error: jErr } = await supabase
    .from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (jErr) throw jErr;
  if (!job) return { job: null, quote: null, milestones: [] };

  let quote = null;
  if (job.quote_id) {
    const { data: q } = await supabase.from("quotes").select("*").eq("id", job.quote_id).maybeSingle();
    quote = q || null;
  }
  let milestones = [];
  if (quote) {
    const { data: ms } = await supabase
      .from("quote_payment_schedules").select("*").eq("quote_id", quote.id).order("sort_order");
    milestones = (ms || []).map((m) => ({
      id: m.id,
      name: m.name,
      sortOrder: m.sort_order,
      amount: m.calculated_amount ?? m.fixed_amount ?? null,
    }));
  }
  return { job, quote, milestones };
}
