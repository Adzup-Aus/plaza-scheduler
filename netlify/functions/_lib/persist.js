// Persist a generated schedule to the store, and read it back for the board.
// This app owns: job_work_schedules, job_work_days, job_checklist_items,
// job_photo_requirements, schedule_entries.
//
// Calendar dates: Plaza's job_work_days is POSITIONAL (day_number/sort_order, no
// date column). Calendar dates live on schedule_entries.scheduled_date. So each
// WORK day also writes one schedule_entries row (job_id set, staff_id placeholder
// until a tradie is allocated) carrying the date. Reflow updates those dates.
//
// NEEDS CONFIRMATION (flagged, not guessed): Plaza's schedule_entries has no
// work_day_id column, so a day and its dated entry are linked by (job_id + date +
// sort order), not a hard FK. Confirm the intended link at assimilation.
import { supabase } from "./supabase.js";
import { logSharedChange } from "./sharedData.js";
import { reconcileRegeneration } from "../../../src/lib/scheduleEngine.js";

const UNASSIGNED_STAFF = "UNASSIGNED"; // placeholder until a tradie is allocated

export async function getExistingSchedule(jobId) {
  const { data: schedule } = await supabase
    .from("job_work_schedules").select("*").eq("job_id", jobId).maybeSingle();
  if (!schedule) return { schedule: null, days: [] };
  const { data: days } = await supabase
    .from("job_work_days").select("*").eq("schedule_id", schedule.id).order("sort_order");
  return { schedule, days: days || [] };
}

// Write a freshly generated plan. If a schedule already exists, preserve submitted
// days (Plaza's regeneration rule) and replace the rest.
export async function persistSchedule({ jobId, quoteId, engineDays, generationSource = "ai" }) {
  const { schedule: existing, days: existingDays } = await getExistingSchedule(jobId);

  // Reconcile against submitted days (locked). Manual pre-submission edits are
  // handled by the confirm-gate in the generate endpoint, not here.
  const existingCamel = existingDays.map((d) => ({
    sortOrder: d.sort_order, stageKey: d.stage_tag, submittedAt: d.submitted_at,
    _row: d,
  }));
  const { merged, lockedCount } = reconcileRegeneration(engineDays, existingCamel);

  // Upsert the schedule row.
  let scheduleId = existing?.id;
  if (!existing) {
    const { data, error } = await supabase.from("job_work_schedules").insert({
      job_id: jobId, quote_id: quoteId, status: "draft", generation_source: generationSource,
      generated_at: new Date().toISOString(),
    }).select("*").single();
    if (error) throw error;
    scheduleId = data.id;
  } else {
    await supabase.from("job_work_schedules")
      .update({ generation_source: generationSource, generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", scheduleId);
  }

  // Delete unlocked days (cascades checklist items + photo reqs), then reinsert.
  const lockedSortOrders = new Set(
    existingDays.filter((d) => d.submitted_at).map((d) => d.sort_order)
  );
  const toDelete = existingDays.filter((d) => !lockedSortOrders.has(d.sort_order)).map((d) => d.id);
  if (toDelete.length) {
    await supabase.from("job_work_days").delete().in("id", toDelete);
  }

  // Insert the merged (unlocked) days.
  let inserted = 0;
  for (const day of merged) {
    if (day._locked) continue; // already in DB, untouched
    const { data: dayRow, error: dErr } = await supabase.from("job_work_days").insert({
      schedule_id: scheduleId,
      job_id: jobId,
      day_number: day.dayNumber,
      day_type: day.dayType,
      title: day.title,
      trades_on_site: day.tradesOnSite || null,
      section_heading: day.sectionHeading || null,
      stage_tag: day.stageTag || null,
      quote_payment_schedule_id: day.quotePaymentScheduleId || null,
      milestone_name: day.milestoneName || null,
      milestone_amount: day.milestoneAmount ?? null,
      milestone_sort_order: day.milestoneSortOrder ?? null,
      is_milestone_release_day: !!day.isMilestoneReleaseDay,
      sort_order: day.sortOrder,
    }).select("*").single();
    if (dErr) throw dErr;
    inserted++;

    if (day.checklistItems?.length) {
      await supabase.from("job_checklist_items").insert(
        day.checklistItems.map((c) => ({
          day_id: dayRow.id, job_id: jobId, text: c.text,
          visibility: c.visibility || "internal", is_blocking: !!c.isBlocking,
          ai_generated: !!c.aiGenerated, sort_order: c.sortOrder ?? 0,
        }))
      );
    }
    if (day.photoRequirements?.length) {
      await supabase.from("job_photo_requirements").insert(
        day.photoRequirements.map((p) => ({
          day_id: dayRow.id, description: p.description,
          is_required: p.isRequired !== false, sort_order: p.sortOrder ?? 0,
        }))
      );
    }

    // Dated allocation row for the board (WORK days only; cure days carry no crew).
    if (day.dayType !== "cure" && day.scheduledDate) {
      await supabase.from("schedule_entries").insert({
        job_id: jobId, staff_id: UNASSIGNED_STAFF, scheduled_date: day.scheduledDate,
        status: "pending", notes: `${day.title} [wd:${day.sortOrder}]`,
      });
    }
  }

  await logSharedChange({
    entityTable: "job_work_schedules", entityId: scheduleId, field: "generated",
    newValue: `days=${inserted} locked=${lockedCount} source=${generationSource}`,
  });

  return { scheduleId, inserted, lockedCount };
}
