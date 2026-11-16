begin;

-- ============================================================================
-- MIGRASI LENGKAP & IDEMPOTENT UNTUK ALUR: FIGMA MAKE -> GITHUB -> VERCEL
-- 1. Memastikan tabel pa_kv_state & kolom lengkap pa_users tersedia
-- 2. Membuka RLS Read/Write (SELECT, INSERT, UPDATE, DELETE) untuk anon & authenticated
--    agar frontend Vercel dapat menyimpan & membaca akun, hash password, dan data PA
--    lintas browser, perangkat baru, dan mode incognito secara langsung via PostgREST.
-- ============================================================================

create table if not exists public.pa_kv_state (
  state_key text primary key,
  state_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table if exists public.pa_users
  add column if not exists no text not null default '',
  add column if not exists reg_no text not null default '',
  add column if not exists bagian text not null default '',
  add column if not exists join_date text not null default '',
  add column if not exists telegram_no text not null default '',
  add column if not exists reg_no_ap1 text not null default '',
  add column if not exists reg_no_ap2 text not null default '',
  add column if not exists is_hr_unit_checker boolean not null default false,
  add column if not exists is_hr_icf_validator boolean not null default false;

alter table if exists public.pa_users drop constraint if exists pa_users_role_check;

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pa_users',
    'pa_group_rules',
    'pa_role_permissions',
    'pa_menu_configs',
    'pa_score_weights',
    'pa_module_windows',
    'pa_workflow_documents',
    'pa_workflow_events',
    'pa_open_lock_requests',
    'pa_interview_schedules',
    'pa_audit_trail',
    'pa_app_notifications',
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
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role', tbl);
      execute format('drop policy if exists %I_rw_all on public.%I', tbl, tbl);
      execute format(
        'create policy %I_rw_all on public.%I for all to anon, authenticated using (true) with check (true)',
        tbl,
        tbl
      );
    end if;
  end loop;
end;
$$;

grant usage, select, update on all sequences in schema public to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('pa-evidence', 'pa-evidence', true, 20971520)
on conflict (id) do update set
  public = true,
  file_size_limit = 20971520;

drop policy if exists pa_evidence_public_read on storage.objects;
create policy pa_evidence_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'pa-evidence');

drop policy if exists pa_evidence_public_write on storage.objects;
create policy pa_evidence_public_write
  on storage.objects for all
  to anon, authenticated
  using (bucket_id = 'pa-evidence')
  with check (bucket_id = 'pa-evidence');

commit;
