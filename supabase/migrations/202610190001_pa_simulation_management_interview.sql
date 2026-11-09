begin;

create table public.pa_sim_management_interview_windows (
  unit_id text not null,
  period text not null check (period = '2026'),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  locked boolean not null default false,
  updated_by text not null references public.pa_sim_identities(identity_id),
  updated_at timestamptz not null default now(),
  primary key (unit_id, period)
);

create table public.pa_sim_management_interview_documents (
  employee_id text not null references public.pa_sim_identities(identity_id),
  period text not null check (period = '2026'),
  version integer not null check (version > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (employee_id, period)
);

create table public.pa_sim_management_interview_events (
  id bigint generated always as identity primary key,
  employee_id text not null,
  period text not null,
  version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique (employee_id, period, version),
  foreign key (employee_id, period) references public.pa_sim_management_interview_documents(employee_id, period)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['pa_sim_management_interview_windows', 'pa_sim_management_interview_documents', 'pa_sim_management_interview_events'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

grant usage, select on sequence public.pa_sim_management_interview_events_id_seq to service_role;

create function public.pa_sim_commit_management_interview(
  employee text, appraisal_period text, expected_version integer,
  next_document jsonb, recipients text[], notification_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  recipient text;
  activation public.pa_sim_management_interview_windows%rowtype;
begin
  select * into activation from public.pa_sim_management_interview_windows
  where unit_id = next_document->'snapshot'->>'unitId' and period = appraisal_period
  for share;
  if not found or activation.locked
    or now() < (activation.start_date::timestamp at time zone 'Asia/Jakarta')
    or now() >= ((activation.end_date + 1)::timestamp at time zone 'Asia/Jakarta') then
    raise exception 'Management Interview window closed';
  end if;
  if (next_document->>'version')::integer <> expected_version + 1
    or next_document->>'employeeId' <> employee
    or next_document->>'period' <> appraisal_period then
    raise exception 'Invalid Management Interview version';
  end if;
  if expected_version = 0 then
    insert into public.pa_sim_management_interview_documents(employee_id, period, version, document)
    values (employee, appraisal_period, 1, next_document)
    on conflict do nothing;
  else
    update public.pa_sim_management_interview_documents
    set document = next_document, version = expected_version + 1, updated_at = now()
    where employee_id = employee and period = appraisal_period and version = expected_version
      and document->>'status' <> 'Validated';
  end if;
  if not found then raise exception 'Concurrent change; reload Management Interview'; end if;
  insert into public.pa_sim_management_interview_events(employee_id, period, version, document)
  values (employee, appraisal_period, expected_version + 1, next_document);
  foreach recipient in array recipients loop
    insert into public.pa_sim_notifications(recipient_id, employee_id, period, version, channel, delivery_status, payload, scope)
    values
      (recipient, employee, appraisal_period, expected_version + 1, 'in-app', 'available', notification_payload, 'management-interview'),
      (recipient, employee, appraisal_period, expected_version + 1, 'email', 'pending', notification_payload, 'management-interview');
  end loop;
end;
$$;

revoke all on function public.pa_sim_commit_management_interview(text, text, integer, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.pa_sim_commit_management_interview(text, text, integer, jsonb, text[], jsonb) to service_role;

commit;
