# Scheduler app — build record (Task 8c / mini-app 03)

**Status:** Built and verified offline; live deploy pending (Chrome plugin was
disconnected during the build and the Anthropic key is not yet placed). See `DEPLOY.md`.

## What shipped
- Migration `supabase/stage-3-work-schedule.sql`: `job_work_schedules`, `job_work_days`,
  `job_checklist_items`, `job_photo_requirements`, `schedule_entries`. Columns traced to
  the Plaza mirror (`shared/models/workSchedule.ts`, `schedule.ts`) — real names only, no
  `tenant_id` (these are Plaza-existing tables). Verified against pglite (PG16): FKs,
  indexes, cascade deletes pass.
- Deterministic engine `src/lib/scheduleEngine.js`: trade order from
  `Trade_Sequence_and_Logic.md`, cure gaps from `schedule-generation-rules.md`.
  `buildSchedule`, `reconcileRegeneration` (locks submitted days), `proposeReflow`.
  14 unit tests pass.
- AI wrapper `netlify/functions/_lib/anthropic.js`: Claude extracts scope SIGNALS only;
  it cannot reorder trades or drop cure gaps.
- API: `login`, `board`, `generate`, `work-day`, `reflow`. Passcode gate (phase-0),
  service key server-side, every shared write logs to `shared_data_change_log`.
- Front end: grid (days x jobs) + continuous-scroll timeline (shift-pan, ctrl-zoom),
  free-form cell editing, generate + reflow modals, runtime cost meter and copyable
  error log (both mandatory features). `npm run build` clean.

## Decisions recorded
- Trade-order conflict between the two framework files resolved in favour of
  `Trade_Sequence_and_Logic.md` (rough-ins before timber). Flagged in-app via
  `ORDER_SOURCE_CONFLICT`.
- Calendar dates live on `schedule_entries.scheduled_date` (job_work_days is positional).
  Day↔entry link is by a `[wd:N]` note tag — NEEDS CONFIRMATION at assimilation.
- Model string is env-driven (`ANTHROPIC_MODEL`, default `claude-sonnet-5`).

## Open (live) items
Run the migration, deploy to Netlify, set env vars (incl. Anthropic key), run the live
end-to-end test with a real accepted-quote job, then flip the schedule `status` to
`active`. Confirm milestone-release and trade days expose dates for apps 8a and 09.
