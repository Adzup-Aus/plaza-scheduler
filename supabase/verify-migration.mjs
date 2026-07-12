// Runs stage-0-foundation.sql then stage-3-work-schedule.sql against an in-memory
// Postgres (pglite), then does a smoke insert across all five tables to prove the
// FKs, indexes and cascades resolve. Real verification without touching plaza-central.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
// pglite has no pgcrypto (Supabase already enables it in Stage 0; gen_random_uuid is
// core in PG16). Strip only the extension line for this local run.
const run = async (f) => {
  const sql = readFileSync(new URL(f, import.meta.url), "utf8")
    .replace(/create extension if not exists pgcrypto;/i, "-- pgcrypto (skipped locally)");
  await db.exec(sql);
};

await run("./stage-0-foundation.sql");
await run("./stage-3-work-schedule.sql");
console.log("migrations applied OK");

// Smoke insert: a client, a job, a schedule, a day, a checklist item, a photo req, a schedule entry.
await db.exec(`
  insert into clients (id, first_name, last_name) values ('c1','Test','Client');
  insert into jobs (id, client_id, client_name, address, job_type) values ('j1','c1','Test Client','1 Test St','renovation');
  insert into job_work_schedules (id, job_id, quote_id, generation_source) values ('s1','j1','q1','ai');
  insert into job_work_days (id, schedule_id, job_id, day_number, day_type, title, stage_tag, sort_order, is_milestone_release_day)
    values ('d1','s1','j1',1,'work','Waterproofing','waterproofing',5,true);
  insert into job_checklist_items (id, day_id, job_id, text, is_blocking) values ('ci1','d1','j1','Puddle flanges present',true);
  insert into job_photo_requirements (id, day_id, description) values ('pr1','d1','Finished membrane photo');
  insert into schedule_entries (id, job_id, staff_id, scheduled_date, status) values ('se1','j1','staff1','2026-07-13','confirmed');
`);

const days = await db.query(`select title, stage_tag, is_milestone_release_day from job_work_days where schedule_id='s1'`);
const ci = await db.query(`select count(*)::int as n from job_checklist_items where day_id='d1'`);

// Cascade check: deleting the schedule should delete its day, checklist items, photo reqs.
await db.exec(`delete from job_work_schedules where id='s1'`);
const afterDays = await db.query(`select count(*)::int as n from job_work_days`);
const afterCi = await db.query(`select count(*)::int as n from job_checklist_items`);

console.log("day row:", days.rows[0]);
console.log("checklist items before delete:", ci.rows[0].n);
console.log("work days after schedule delete (cascade):", afterDays.rows[0].n);
console.log("checklist items after schedule delete (cascade):", afterCi.rows[0].n);

if (afterDays.rows[0].n !== 0 || afterCi.rows[0].n !== 0) {
  console.error("FAIL: cascade delete did not clean up children");
  process.exit(1);
}
console.log("ALL MIGRATION CHECKS PASSED");
