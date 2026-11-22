-- Reset isi KPI Personal (Section & Sub Section) yang sudah ada pada /bod/setting/kpi/personal
-- (untuk akun BOD / Director / DirectorNonOpr / grouping Direktur / Director) satu kali agar bersih.

do $$
declare
  v_already jsonb;
  v_emp record;
  v_emp_norm text;
  v_kv jsonb;
  v_wf jsonb;
begin
  select state_value into v_already
  from public.pa_kv_state
  where state_key = 'pa_bod_personal_kpi_cleared_v1';

  if v_already = 'true'::jsonb then
    return;
  end if;

  -- 1. Hapus baris personal KPI milik BOD / Director di pa_kpi_settings & workflow KPI Setting terkait
  for v_emp in
    select employee_id
    from public.pa_users
    where role in ('BOD', 'Director', 'DirectorNonOpr')
       or lower(trim(coalesce(groupings, ''))) in ('direktur / director', 'direktur', 'director')
  loop
    delete from public.pa_kpi_settings
    where lower(trim(employee_id)) = lower(trim(v_emp.employee_id))
      and coalesce(tab, 'personal') = 'personal';

    delete from public.pa_workflow_documents
    where lower(trim(employee_id)) = lower(trim(v_emp.employee_id))
      and lower(trim(coalesce(module, ''))) = 'kpi'
      and lower(trim(coalesce(phase, 'setting'))) = 'setting';
  end loop;

  -- 2. Bersihkan entri BOD / Director pada pa_kv_state ('pa_kpi_setting_by_emp_v2' & 'appraisal_workflow_v1')
  select state_value into v_kv
  from public.pa_kv_state
  where state_key = 'pa_kpi_setting_by_emp_v2';

  if v_kv is not null and jsonb_typeof(v_kv) = 'object' then
    for v_emp in
      select employee_id
      from public.pa_users
      where role in ('BOD', 'Director', 'DirectorNonOpr')
         or lower(trim(coalesce(groupings, ''))) in ('direktur / director', 'direktur', 'director')
    loop
      v_emp_norm := regexp_replace(upper(trim(v_emp.employee_id)), '^(?:EMP-?|E)0*([0-9]+)$', 'EMP-00\1');
      v_kv := v_kv - trim(v_emp.employee_id) - upper(trim(v_emp.employee_id)) - v_emp_norm;
      -- juga hapus format EMP-NNN 3 digit standar
      if trim(v_emp.employee_id) ~* '^(?:emp-?|e)[0-9]+$' then
        v_emp_norm := 'EMP-' || lpad(regexp_replace(trim(v_emp.employee_id), '^[^0-9]+', ''), 3, '0');
        v_kv := v_kv - v_emp_norm;
      end if;
    end loop;

    update public.pa_kv_state
    set state_value = v_kv, updated_at = now()
    where state_key = 'pa_kpi_setting_by_emp_v2';
  end if;

  select state_value into v_wf
  from public.pa_kv_state
  where state_key = 'appraisal_workflow_v1';

  if v_wf is not null and jsonb_typeof(v_wf) = 'array' then
    select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_wf
    from jsonb_array_elements(v_wf) as elem
    where not (
      lower(coalesce(elem->>'module', '')) = 'kpi'
      and lower(coalesce(elem->>'phase', '')) = 'setting'
      and exists (
        select 1
        from public.pa_users u
        where (u.role in ('BOD', 'Director', 'DirectorNonOpr')
               or lower(trim(coalesce(u.groupings, ''))) in ('direktur / director', 'direktur', 'director'))
          and (
            lower(trim(coalesce(elem->>'employeeId', ''))) = lower(trim(u.employee_id))
            or regexp_replace(lower(trim(coalesce(elem->>'employeeId', ''))), '^(?:emp-?|e)0*', '')
               = regexp_replace(lower(trim(u.employee_id)), '^(?:emp-?|e)0*', '')
          )
      )
    );

    update public.pa_kv_state
    set state_value = v_wf, updated_at = now()
    where state_key = 'appraisal_workflow_v1';
  end if;

  insert into public.pa_kv_state (state_key, state_value, updated_at)
  values ('pa_bod_personal_kpi_cleared_v1', 'true'::jsonb, now())
  on conflict (state_key) do update
    set state_value = excluded.state_value,
        updated_at = excluded.updated_at;
end $$;
