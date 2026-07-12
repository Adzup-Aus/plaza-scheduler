# Plaza Works Scheduler (mini-app 03 / Task 8c)

Replaces the Google Sheet scheduling grid. Turns an accepted quote into a day-by-day
site plan (AI reads the scope; trade order and cure gaps are fixed in code), shown on a
master cross-job board with two co-equal views: a grid (days x jobs, like the Sheet) and
a continuous-scroll timeline with shift-scroll pan and ctrl-scroll zoom. Free-form to
edit, structured underneath. A slipped date proposes a reflow that a human accepts.

## Stack
Netlify (static React front end + Functions) + Supabase `plaza-central`. No new moving
parts beyond the shared store. Built to the Mini-App Build Principles.

## Layout
- `supabase/stage-3-work-schedule.sql` — the five schedule tables (run once, see DEPLOY.md).
- `src/lib/scheduleEngine.js` — the deterministic engine (trade order + cure gaps). The
  most valuable, most portable piece. Fully unit-tested.
- `src/lib/scheduleEngine.test.mjs` — 14 tests. Run `npm test`.
- `src/` — the React board (grid + timeline, generate, reflow, cost meter, error log).
- `netlify/functions/` — `login`, `board`, `generate`, `work-day`, `reflow` + `_lib/`.

## What it owns / reads (data-contract.md)
Owns: `job_work_schedules`, `job_work_days`, `job_checklist_items`,
`job_photo_requirements`, `schedule_entries`. Reads: the accepted quote, milestones,
trade-sequence logic. Every shared write logs to `shared_data_change_log`.

## Verified offline
- `npm test` → 14/14 pass (order, cure gaps, weekend skip, milestone linking,
  regeneration lock, reflow).
- `npm run build` → compiles clean.
- Migration SQL applied against a real Postgres engine (pglite): FKs, indexes,
  cascade deletes all pass (`node supabase/verify-migration.mjs`).

## Not yet done (needs live access — see DEPLOY.md)
Creating the tables in `plaza-central`, deploying to Netlify, setting the Anthropic key,
and the live end-to-end test with a real job.
