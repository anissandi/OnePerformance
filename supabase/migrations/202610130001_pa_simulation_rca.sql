begin;

create table public.pa_sim_rca_documents (
  trigger_id bigint primary key references public.pa_sim_kpi_rca_triggers(id),
  version integer not null check (version > 0),
  document jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.pa_sim_rca_events (
  trigger_id bigint not null references public.pa_sim_rca_documents(trigger_id),
  version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  primary key (trigger_id, version)
);
create table public.pa_sim_rca_evidence (
  id uuid primary key,
  trigger_id bigint not null references public.pa_sim_kpi_rca_triggers(id),
  file_name text not null,
  size integer not null check (size > 0 and size <= 10485760),
  content_type text not null check (content_type in ('image/jpeg','image/png','application/pdf')),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.pa_sim_rca_documents enable row level security;
alter table public.pa_sim_rca_events enable row level security;
alter table public.pa_sim_rca_evidence enable row level security;
revoke all on public.pa_sim_rca_documents, public.pa_sim_rca_events, public.pa_sim_rca_evidence from public, anon, authenticated;
grant all on public.pa_sim_rca_documents, public.pa_sim_rca_events, public.pa_sim_rca_evidence to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('pa-simulation-rca-evidence', 'pa-simulation-rca-evidence', false, 10485760, array['image/jpeg','image/png','application/pdf']);
create policy pa_sim_rca_evidence_api_only on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'pa-simulation-rca-evidence') with check (bucket_id <> 'pa-simulation-rca-evidence');

create function public.pa_sim_commit_rca(
  source_trigger bigint, expected_version integer, next_document jsonb,
  recipients text[], notification_payload jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  source public.pa_sim_kpi_rca_triggers%rowtype;
  current_version integer;
  recipient text;
begin
  -- Serialize first saves and decisions against the immutable Tracking trigger.
  select * into source from public.pa_sim_kpi_rca_triggers where id = source_trigger for update;
  if not found then raise exception 'RCA trigger unavailable'; end if;
  select version into current_version from public.pa_sim_rca_documents where trigger_id = source_trigger for update;
  if coalesce(current_version, 0) <> expected_version then raise exception 'RCA version conflict'; end if;
  if (next_document->>'version')::integer is distinct from expected_version + 1
    or (next_document->>'triggerId')::bigint is distinct from source.id
    or next_document->>'employeeId' is distinct from source.employee_id
    or next_document->>'period' is distinct from source.period
    or (next_document->>'month')::integer is distinct from source.month
    or (next_document->>'sourceVersion')::integer is distinct from source.source_version then
    raise exception 'RCA source mismatch';
  end if;
  if exists(select 1 from public.pa_sim_rca_documents where trigger_id = source_trigger and document->>'status' = 'Closed') then
    raise exception 'RCA already closed';
  end if;
  insert into public.pa_sim_rca_documents(trigger_id, version, document)
  values(source_trigger, expected_version + 1, next_document)
  on conflict (trigger_id) do update set version = excluded.version, document = excluded.document, updated_at = now();
  insert into public.pa_sim_rca_events(trigger_id, version, document)
  values(source_trigger, expected_version + 1, next_document);
  update public.pa_sim_kpi_rca_triggers set
    improvement_status = case when next_document->>'status' = 'Closed' then 'Closed'
      when next_document->>'status' = 'Approved' then 'In Progress' else 'Open' end,
    closure_validated = next_document->>'status' = 'Closed'
  where id = source_trigger;
  foreach recipient in array recipients loop
    insert into public.pa_sim_notifications(recipient_id, employee_id, period, version, channel, delivery_status, payload, scope)
    values(recipient, source.employee_id, source.period, expected_version + 1, 'in-app', 'available', notification_payload, 'rca:' || source_trigger),
      (recipient, source.employee_id, source.period, expected_version + 1, 'email', 'pending', notification_payload, 'rca:' || source_trigger);
  end loop;
end;
$$;
revoke all on function public.pa_sim_commit_rca(bigint, integer, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.pa_sim_commit_rca(bigint, integer, jsonb, text[], jsonb) to service_role;
commit;
