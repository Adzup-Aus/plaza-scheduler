-- Plaza Works central store: Stage 0 foundation
-- Runs against the Supabase project `plaza-central` (ref wpktjjjowwiiawxlqhng, Sydney).
-- Source of truth for every column: Framework/Mini_Apps_Build_Guide/data-contract.md
-- Safe to re-run: every statement uses IF NOT EXISTS.
--
-- Scope of Stage 0: the lead-to-job spine (clients, jobs) plus the shared change log,
-- and the pgcrypto extension. App-specific tables (lead_board_items, sales_call_records,
-- quotes, work schedule, etc.) are created in the stage that first needs them.
--
-- Tenant rule (data-contract.md): Plaza's existing tables (clients, jobs) carry NO tenant
-- column. Only net-new mini-app tables get `tenant_id`. So shared_data_change_log has
-- tenant_id; clients and jobs do not.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- shared_data_change_log (net-new). One row per write to any shared fact.
-- ---------------------------------------------------------------------------
create table if not exists shared_data_change_log (
  id              varchar(36) primary key default gen_random_uuid(),
  tenant_id       varchar(40) not null default 'plaza',
  entity_table    varchar(60) not null,
  entity_id       varchar(36) not null,
  field           varchar(60),
  old_value       text,
  new_value       text,
  changed_by_app  varchar(60) not null,
  changed_by_id   varchar(36),
  event_emitted   boolean     not null default false,
  created_at      timestamp   not null default now()
);

create index if not exists idx_change_log_entity
  on shared_data_change_log (entity_table, entity_id);

-- ---------------------------------------------------------------------------
-- clients (Plaza existing table). The lead / customer identity spine.
-- Every app joins on ghl_contact_id. No tenant column (matches Plaza).
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id                     varchar primary key default gen_random_uuid(),
  first_name             varchar(100) not null,
  last_name              varchar(100) not null,
  email                  varchar(255),
  phone                  varchar(50),
  mobile_phone           varchar(50),
  phone_normalised       varchar(50),
  company                varchar(255),
  client_type            varchar(50) default 'residential',
  street_address         varchar,
  street_address_2       varchar,
  city                   varchar,
  state                  varchar,
  postal_code            varchar,
  country                varchar default 'Australia',
  portal_enabled         boolean default false,
  needs_review           boolean not null default false,
  notes                  text,
  ghl_contact_id         varchar(120) unique,
  ghl_source             varchar,
  ghl_contact_type       varchar,
  ghl_match_method       varchar,
  ghl_tags               text[] not null default '{}'::text[],
  ghl_field_sources      jsonb  not null default '{}'::jsonb,
  ghl_last_synced_at     timestamp,
  ghl_last_change_source varchar(20),
  is_active              boolean default true,
  created_at             timestamp default now(),
  updated_at             timestamp default now()
);

create index if not exists idx_clients_email on clients (email);
create index if not exists idx_clients_ghl_last_synced on clients (ghl_last_synced_at);

-- ---------------------------------------------------------------------------
-- jobs (Plaza existing table). The job spine, made from an accepted quote.
-- Cross-table links (client_id, quote_id, invoice_id, revenue_stream_id) are
-- kept as plain columns (soft links) per the data contract, no FK constraints,
-- because the tables they point at are not all created yet.
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id                              varchar primary key default gen_random_uuid(),
  job_number                      varchar,
  job_name                        varchar,
  reference_number                integer,
  client_id                       varchar,
  client_name                     varchar(255) not null,
  client_email                    varchar,
  client_phone                    varchar,
  address                         text not null,
  suburb                          varchar(100),
  job_type                        varchar(50) not null,
  revenue_stream_id               varchar,
  description                     text,
  status                          varchar(50) not null default 'pending',
  form4_submitted                 boolean not null default false,
  hwi_paid                        boolean not null default false,
  wp_certificate_received         boolean not null default false,
  electrical_certificate_received boolean not null default false,
  notes                           text,
  quote_id                        varchar,
  invoice_id                      varchar,
  payment_method                  varchar(20),
  contract_value                  decimal(12,2),
  deposit_amount                  decimal(12,2),
  escrow_funded_amount            decimal(12,2),
  deposit_paid_at                 timestamp,
  created_by_id                   varchar,
  created_at                      timestamp default now(),
  updated_at                      timestamp default now()
);

create index if not exists idx_jobs_reference_number on jobs (reference_number);
create index if not exists idx_jobs_client_id on jobs (client_id);
