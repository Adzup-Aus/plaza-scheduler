-- Plaza Works central store: Stage 3 work-schedule tables (Scheduler / mini-app 03, Task 8c)
-- Runs against the Supabase project `plaza-central` (ref wpktjjjowwiiawxlqhng, Sydney).
-- Source of truth for every column: the Plaza repo mirror
--   Reference/Plaza_Repo/shared/models/workSchedule.ts   (job_work_schedules, job_work_days,
--                                                          job_checklist_items, job_photo_requirements)
--   Reference/Plaza_Repo/shared/models/schedule.ts        (schedule_entries)
-- and Framework/Mini_Apps_Build_Guide/data-contract.md.
--
-- Safe to re-run: every statement uses IF NOT EXISTS.
--
-- Tenant rule (data-contract.md): these are Plaza EXISTING tables, so they carry NO
-- tenant_id column (they match Plaza's real schema exactly, ready to port unchanged).
--
-- Foreign-key rule (matches Stage 0): a FK is added only when the table it points at
-- already exists in plaza-central (currently: clients, jobs, and the tables created here).
-- Links to tables that do not exist yet (job_phases, activities, people,
-- quote_payment_schedules) are kept as PLAIN columns (soft links), no FK constraint,
-- exactly as Stage 0 did for jobs' cross-table links.

-- ---------------------------------------------------------------------------
-- job_work_schedules  (one row per job, UNIQUE on job_id)
-- ---------------------------------------------------------------------------
create table if not exists job_work_schedules (
  id                varchar     primary key default gen_random_uuid(),
  job_id            varchar     not null references jobs(id) on delete cascade,
  quote_id          varchar     not null,
  status            varchar(20) not null default 'draft',      -- draft | active | completed
  generated_at      timestamp   default now(),
  generation_source varchar(20) not null default 'rules',      -- rules | ai
  created_at        timestamp   default now(),
  updated_at        timestamp   default now()
);

create unique index if not exists ux_job_work_schedules_job on job_work_schedules (job_id);
create index if not exists idx_job_work_schedules_quote on job_work_schedules (quote_id);

-- ---------------------------------------------------------------------------
-- job_work_days  (one row per day in a schedule)
-- quote_payment_schedule_id is a SOFT link: quote_payment_schedules is not created yet.
-- ---------------------------------------------------------------------------
create table if not exists job_work_days (
  id                        varchar     primary key default gen_random_uuid(),
  schedule_id               varchar     not null references job_work_schedules(id) on delete cascade,
  job_id                    varchar     not null references jobs(id) on delete cascade,

  day_number                integer,
  day_type                  varchar(20) not null default 'work',    -- pre-work | work | cure
  title                     varchar(255) not null,
  trades_on_site            varchar(255),

  section_heading           varchar(255),
  stage_tag                 varchar(50),

  quote_payment_schedule_id varchar,                                 -- soft link (SET NULL semantics at assimilation)
  milestone_name            varchar(255),
  milestone_amount          decimal(10,2),
  milestone_sort_order      integer,
  is_milestone_release_day  boolean     not null default false,

  sort_order                integer     not null default 0,

  is_checked                boolean     not null default false,
  uploaded_photo_url        varchar(1000),

  submitted_at              timestamp,
  submitted_by_id           varchar,
  approved_at               timestamp,
  approved_by_id            varchar,
  milestone_snoozed_until   timestamp,

  created_at                timestamp   default now(),
  updated_at                timestamp   default now()
);

create index if not exists idx_work_days_schedule on job_work_days (schedule_id);
create index if not exists idx_work_days_job on job_work_days (job_id);
create index if not exists idx_work_days_sort on job_work_days (schedule_id, sort_order);
-- board reads pull days across a date range; day_number is the schedule position.
create index if not exists idx_work_days_day_number on job_work_days (schedule_id, day_number);

-- ---------------------------------------------------------------------------
-- job_checklist_items  (per work day)
-- ---------------------------------------------------------------------------
create table if not exists job_checklist_items (
  id           varchar     primary key default gen_random_uuid(),
  day_id       varchar     not null references job_work_days(id) on delete cascade,
  job_id       varchar     not null references jobs(id) on delete cascade,
  text         text        not null,
  visibility   varchar(20) not null default 'customer',   -- internal | customer
  is_checked   boolean     not null default false,
  checked_at   timestamp,
  checked_by_id varchar,
  source_key   varchar(500),
  is_blocking  boolean     not null default false,
  ai_generated boolean     not null default false,
  sort_order   integer     not null default 0,
  created_at   timestamp   default now(),
  updated_at   timestamp   default now()
);

create index if not exists idx_checklist_items_day on job_checklist_items (day_id);
create index if not exists idx_checklist_items_job on job_checklist_items (job_id);
create index if not exists idx_checklist_items_source_key on job_checklist_items (source_key);
create index if not exists idx_checklist_items_sort on job_checklist_items (day_id, sort_order);

-- ---------------------------------------------------------------------------
-- job_photo_requirements  (per work day)
-- ---------------------------------------------------------------------------
create table if not exists job_photo_requirements (
  id                 varchar     primary key default gen_random_uuid(),
  day_id             varchar     not null references job_work_days(id) on delete cascade,
  description        text        not null,
  is_required        boolean     not null default true,
  uploaded_photo_url varchar(1000),
  uploaded_at        timestamp,
  sort_order         integer     not null default 0,
  created_at         timestamp   default now(),
  updated_at         timestamp   default now()
);

create index if not exists idx_photo_reqs_day on job_photo_requirements (day_id);
create index if not exists idx_photo_reqs_sort on job_photo_requirements (day_id, sort_order);

-- ---------------------------------------------------------------------------
-- schedule_entries  (per-staff per-day allocation; feeds the board grid)
-- phase_id, activity_id and status_overridden_by are SOFT links: job_phases,
-- activities and people are not created in plaza-central yet. job_id keeps its FK.
-- XOR rule (job_id vs activity_id) is enforced in the app insert schema, not the DB,
-- matching Plaza (the DB allows either to be null).
-- ---------------------------------------------------------------------------
create table if not exists schedule_entries (
  id                    varchar     primary key default gen_random_uuid(),
  job_id                varchar     references jobs(id) on delete cascade,
  phase_id              varchar,                                  -- soft link (job_phases not present)
  activity_id           varchar,                                  -- soft link (activities not present)
  staff_id              varchar     not null,
  scheduled_date        date        not null,
  start_time            varchar(10),
  end_time              varchar(10),
  duration_hours        decimal(4,2) default 7.5,
  status                varchar(20) default 'pending',            -- scheduled|pending|confirmed|declined|completed|cancelled
  status_overridden_by  varchar,                                  -- soft link (people not present)
  status_overridden_at  timestamp,
  notes                 text,
  created_at            timestamp   default now(),
  updated_at            timestamp   default now()
);

create index if not exists idx_schedule_job on schedule_entries (job_id);
create index if not exists idx_schedule_phase on schedule_entries (phase_id);
create index if not exists idx_schedule_activity on schedule_entries (activity_id);
create index if not exists idx_schedule_staff on schedule_entries (staff_id);
create index if not exists idx_schedule_date on schedule_entries (scheduled_date);
create index if not exists idx_schedule_status on schedule_entries (status);
create index if not exists idx_schedule_status_override on schedule_entries (status_overridden_by);
