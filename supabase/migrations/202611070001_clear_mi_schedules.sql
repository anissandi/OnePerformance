begin;

-- ============================================================================
-- KOSONGKAN TABEL MANAGEMENT INTERVIEW UNTUK PERSIAPAN PENGGUNAAN BERSIH
-- ============================================================================

delete from public.pa_interview_schedules;
delete from public.pa_interview_assessments;
delete from public.pa_kv_state
where state_key in (
  'pa_interview_schedules_v1',
  'pa_mi_supervisor_assessments_v1',
  'pa_mi_penilai1_scores_v1',
  'pa_mi_results_by_emp_v1'
);

insert into public.pa_kv_state (state_key, state_value, updated_at)
values ('pa_mi_cleared_2026_v1', 'true'::jsonb, now())
on conflict (state_key) do update set
  state_value = 'true'::jsonb,
  updated_at = now();

commit;
