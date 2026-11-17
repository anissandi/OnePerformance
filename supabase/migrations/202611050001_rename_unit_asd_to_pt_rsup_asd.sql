begin;

-- ============================================================================
-- MIGRASI RENAME UNIT USAHA "ASD" / "RSUP ASD" -> "PT RSUP ASD" DI SELURUH TABEL
-- ============================================================================

update public.pa_users
set company = 'PT RSUP ASD', updated_at = now()
where upper(trim(company)) in ('ASD', 'RSUP ASD', 'PT. RSUP ASD', 'PT RSUP (ASD)');

update public.pa_group_rules
set
  id = regexp_replace(id, '^(ASD|RSUP ASD)::', 'PT RSUP ASD::'),
  company = 'PT RSUP ASD',
  updated_at = now()
where upper(trim(company)) in ('ASD', 'RSUP ASD');

do $$
begin
  if exists (select 1 from public.pa_score_weights where upper(trim(company_unit)) in ('ASD', 'RSUP ASD')) then
    insert into public.pa_score_weights (company_unit, weights, updated_at)
    select 'PT RSUP ASD', weights, now()
    from public.pa_score_weights
    where upper(trim(company_unit)) in ('ASD', 'RSUP ASD')
    limit 1
    on conflict (company_unit) do nothing;
    delete from public.pa_score_weights where upper(trim(company_unit)) in ('ASD', 'RSUP ASD');
  end if;
end;
$$;

update public.pa_open_lock_requests
set company_unit = 'PT RSUP ASD', updated_at = now()
where upper(trim(company_unit)) in ('ASD', 'RSUP ASD');

update public.pa_interview_schedules
set company_unit = 'PT RSUP ASD', updated_at = now()
where upper(trim(company_unit)) in ('ASD', 'RSUP ASD');

update public.pa_kpi_settings
set company_unit = 'PT RSUP ASD', updated_at = now()
where upper(trim(company_unit)) in ('ASD', 'RSUP ASD');

update public.pa_calibration_settings
set
  unit_name = 'PT RSUP ASD',
  data = jsonb_set(coalesce(data, '{}'::jsonb), '{name}', '"PT RSUP ASD"'::jsonb, true),
  updated_at = now()
where upper(trim(unit_name)) in ('ASD', 'RSUP ASD') or unit_id = '8';

update public.pa_calibration_adjustments
set unit_name = 'PT RSUP ASD', updated_at = now()
where upper(trim(unit_name)) in ('ASD', 'RSUP ASD');

update public.pa_evidence_files
set company_unit = 'PT RSUP ASD'
where upper(trim(company_unit)) in ('ASD', 'RSUP ASD');

-- Migrasi string unit "ASD" di dalam JSON pa_kv_state secara aman
update public.pa_kv_state
set
  state_value = replace(
    replace(
      replace(state_value::text, '"company":"ASD"', '"company":"PT RSUP ASD"'),
      '"name":"ASD"', '"name":"PT RSUP ASD"'
    ),
    '"unitName":"ASD"', '"unitName":"PT RSUP ASD"'
  )::jsonb,
  updated_at = now()
where state_value::text like '%"ASD"%';

commit;
