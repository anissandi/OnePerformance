begin;

-- ============================================================================
-- 1. MASTER CATALOGS, APPROVAL CONFIGS, CYCLE MANAGEMENT, & DATA SYNC
-- ============================================================================

create table if not exists public.pa_master_catalogs (
  catalog_key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_approval_configs (
  config_key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_cycle_configs (
  cycle_id text primary key default '2026',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_data_sync_logs (
  sync_id text primary key,
  label text not null,
  last_sync text,
  status text not null default 'idle',
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. TRANSAKSI 8 MODUL PENILAIAN KINERJA (PA)
-- ============================================================================

create table if not exists public.pa_kpi_business (
  id text primary key default 'corporate-2026',
  period text not null default '2026',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'Submitted',
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_kpi_settings (
  doc_key text primary key,
  employee_id text not null,
  company_unit text not null default 'PT RSUP (Industry)',
  tab text not null default 'personal',
  period text not null default '2026',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'Draft',
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_kpi_trackings (
  doc_key text primary key,
  employee_id text not null,
  period text not null default '2026',
  months jsonb not null default '[]'::jsonb,
  cells_map jsonb not null default '{}'::jsonb,
  monthly_notes jsonb not null default '{}'::jsonb,
  comments jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_rca_submissions (
  doc_key text primary key,
  employee_id text not null,
  period text not null default '2026',
  kpi_indicator text not null default '',
  periode text not null default '',
  submission jsonb not null default '{}'::jsonb,
  approval_decisions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_smart_goals (
  employee_id text not null,
  period text not null default '2026',
  goals jsonb not null default '[]'::jsonb,
  checkin_entries jsonb not null default '[]'::jsonb,
  approval_decisions jsonb not null default '[]'::jsonb,
  status text not null default 'Submitted',
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

create table if not exists public.pa_appraisal_forms (
  employee_id text not null,
  period text not null default '2026',
  self_ratings jsonb,
  approver_ratings jsonb not null default '[]'::jsonb,
  status text not null default 'Pending',
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

create table if not exists public.pa_managerial_skills (
  employee_id text not null,
  period text not null default '2026',
  self_ratings jsonb,
  approver_ratings jsonb not null default '[]'::jsonb,
  status text not null default 'Pending',
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

create table if not exists public.pa_inter_dept_feedbacks (
  submission_id text primary key,
  employee_id text not null,
  period text not null default '2026',
  submission jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_project_records (
  employee_id text not null,
  period text not null default '2026',
  file_name text not null default 'Project_ICF_2026.xlsx',
  submitted boolean not null default true,
  submitted_date text not null default '',
  rows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

create table if not exists public.pa_interview_assessments (
  employee_id text not null,
  period text not null default '2026',
  schedule_period text not null default '15–17 January 2027',
  penilai jsonb not null default '[]'::jsonb,
  penilai1_score numeric,
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

-- ============================================================================
-- 3. KALIBRASI AKHIR TAHUN, VERIFIKASI, OVERRIDE, & EVIDENCE STORAGE
-- ============================================================================

create table if not exists public.pa_management_overrides (
  override_id text primary key,
  employee_id text not null,
  module text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_calibration_settings (
  unit_id text primary key,
  unit_name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_year_end_verifications (
  period text primary key default '2026',
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_calibration_adjustments (
  adjustment_key text primary key,
  unit_name text not null,
  employee_id text not null,
  period text not null default '2026',
  proposed_score numeric,
  proposed_grade text,
  reason text not null default '',
  status text not null default 'Draft',
  bod_decision text,
  bod_note text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_evidence_files (
  id text primary key,
  employee_id text not null default 'E002',
  employee_name text not null default 'Siti Rahayu',
  company_unit text not null default 'PT RSUP (Industry)',
  division text not null default 'Divisi Sumber Daya Manusia',
  department text not null default 'SDM',
  position text not null default 'Staff Pengembangan SDM',
  module_type text not null,
  period text not null default '2026',
  month text not null default 'June',
  kpi_name text not null default '',
  file_name text not null,
  file_size bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  storage_path text not null,
  public_url text not null default '',
  approval_status text not null default 'Pending',
  submitted_date text not null default '2026-06-10',
  created_at timestamptz not null default now()
);

create table if not exists public.pa_kv_state (
  state_key text primary key,
  state_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. ROW LEVEL SECURITY & POLICIES
-- ============================================================================

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pa_master_catalogs',
    'pa_approval_configs',
    'pa_cycle_configs',
    'pa_data_sync_logs',
    'pa_kpi_business',
    'pa_kpi_settings',
    'pa_kpi_trackings',
    'pa_rca_submissions',
    'pa_smart_goals',
    'pa_appraisal_forms',
    'pa_managerial_skills',
    'pa_inter_dept_feedbacks',
    'pa_project_records',
    'pa_interview_assessments',
    'pa_management_overrides',
    'pa_calibration_settings',
    'pa_year_end_verifications',
    'pa_calibration_adjustments',
    'pa_evidence_files',
    'pa_kv_state'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('grant select on public.%I to anon, authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    execute format('drop policy if exists %I_read_all on public.%I', tbl, tbl);
    execute format('create policy %I_read_all on public.%I for select to anon, authenticated using (true)', tbl, tbl);
  end loop;
end;
$$;

-- ============================================================================
-- 5. SUPABASE STORAGE BUCKET UNTUK FILE EVIDENCE
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('pa-evidence', 'pa-evidence', true, 10485760)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760;

drop policy if exists pa_evidence_public_read on storage.objects;
create policy pa_evidence_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'pa-evidence');

drop policy if exists pa_evidence_service_write on storage.objects;
create policy pa_evidence_service_write
  on storage.objects for all
  to service_role
  using (bucket_id = 'pa-evidence')
  with check (bucket_id = 'pa-evidence');

commit;
