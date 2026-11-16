begin;

-- ============================================================================
-- FULL READ/WRITE RLS POLICY UNTUK DIRECT POSTGREST SYNC LINTAS PERANGKAT
-- Memastikan browser/perangkat baru & Vercel dapat membaca dan menyimpan
-- pa_users, pa_kv_state (password security, login config, delegasi), dan modul PA
-- bahkan bila Edge Function belum di-deploy secara terpisah.
-- ============================================================================

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

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

drop policy if exists pa_evidence_public_write on storage.objects;
create policy pa_evidence_public_write
  on storage.objects for all
  to anon, authenticated
  using (bucket_id = 'pa-evidence')
  with check (bucket_id = 'pa-evidence');

commit;
