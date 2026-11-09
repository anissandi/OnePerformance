begin;

alter table public.pa_sim_notifications add column scope text not null default 'kpi-setting';
do $$
declare constraint_name text;
begin
  for constraint_name in select conname from pg_constraint
    where conrelid = 'public.pa_sim_notifications'::regclass and contype = 'u'
  loop
    execute format('alter table public.pa_sim_notifications drop constraint %I', constraint_name);
  end loop;
end;
$$;
alter table public.pa_sim_notifications add unique (recipient_id, employee_id, period, version, channel, scope);

create table public.pa_sim_tracking_windows (
  unit_id text not null,
  period text not null check (period = '2026'),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  date_lock integer not null check (date_lock between 1 and 28),
  backlog_months integer[] not null default '{}',
  backlog_end date,
  locked boolean not null default false,
  updated_by text not null references public.pa_sim_identities(identity_id),
  updated_at timestamptz not null default now(),
  check (backlog_months <@ array[1,2,3,4]),
  check ((cardinality(backlog_months) = 0 and backlog_end is null) or
    (cardinality(backlog_months) > 0 and backlog_end between start_date and end_date)),
  primary key (unit_id, period)
);
create table public.pa_sim_tracking_documents (
  employee_id text not null,
  period text not null check (period = '2026'),
  month integer not null check (month between 1 and 12),
  version integer not null check (version > 0),
  document jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, period, month),
  foreign key (employee_id, period) references public.pa_sim_kpi_documents(employee_id, period)
);
create table public.pa_sim_tracking_events (
  id bigint generated always as identity primary key,
  employee_id text not null,
  period text not null,
  month integer not null,
  version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  unique (employee_id, period, month, version),
  foreign key (employee_id, period, month) references public.pa_sim_tracking_documents(employee_id, period, month)
);
create table public.pa_sim_tracking_evidence (
  id uuid primary key,
  employee_id text not null references public.pa_sim_identities(identity_id),
  period text not null check (period = '2026'),
  month integer not null check (month between 1 and 12),
  file_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','application/pdf')),
  size bigint not null check (size > 0 and size <= 10485760),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create table public.pa_sim_kpi_open_locks (
  id uuid primary key,
  employee_id text not null references public.pa_sim_identities(identity_id),
  period text not null check (period = '2026'),
  month integer not null check (month between 1 and 12),
  scope text not null check (scope in ('submission','revision','approval')),
  requester_id text not null references public.pa_sim_identities(identity_id),
  reason text not null check (length(trim(reason)) > 0),
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  expires_on date,
  decided_by text references public.pa_sim_identities(identity_id),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'Approved' or expires_on is not null)
);
create unique index pa_sim_open_lock_pending on public.pa_sim_kpi_open_locks(employee_id, period, month, scope) where status = 'Pending';
create table public.pa_sim_kpi_rca_triggers (
  id bigint generated always as identity primary key,
  employee_id text not null,
  period text not null,
  month integer not null,
  item_id text not null,
  source_version integer not null,
  target numeric not null,
  actual numeric not null,
  achievement numeric not null check (achievement < 100),
  improvement_status text not null default 'Open',
  closure_validated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (employee_id, period, month, item_id, source_version),
  foreign key (employee_id, period, month) references public.pa_sim_tracking_documents(employee_id, period, month),
  foreign key (employee_id, period, month, source_version) references public.pa_sim_tracking_events(employee_id, period, month, version)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['pa_sim_tracking_windows','pa_sim_tracking_documents','pa_sim_tracking_events','pa_sim_tracking_evidence','pa_sim_kpi_open_locks','pa_sim_kpi_rca_triggers'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;
grant usage, select on sequence public.pa_sim_tracking_events_id_seq, public.pa_sim_kpi_rca_triggers_id_seq to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('pa-sim-kpi-evidence','pa-sim-kpi-evidence',false,10485760,array['image/jpeg','image/png','application/pdf']);
create policy pa_sim_kpi_evidence_api_only on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'pa-sim-kpi-evidence') with check (bucket_id <> 'pa-sim-kpi-evidence');

create function public.pa_sim_save_tracking_window(unit text, actor text, configuration jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not exists(select 1 from public.pa_sim_identities where identity_id = actor and actor_level = 'hr-strategic') then raise exception 'Strategic only'; end if;
  insert into public.pa_sim_tracking_windows(unit_id,period,start_date,end_date,date_lock,backlog_months,backlog_end,updated_by)
  values(unit,'2026',(configuration->>'startDate')::date,(configuration->>'endDate')::date,(configuration->>'dateLock')::integer,
    array(select value::integer from jsonb_array_elements_text(configuration->'backlogMonths')),(configuration->>'backlogEnd')::date,actor)
  on conflict (unit_id,period) do update set start_date=excluded.start_date,end_date=excluded.end_date,date_lock=excluded.date_lock,
    backlog_months=excluded.backlog_months,backlog_end=excluded.backlog_end,updated_by=excluded.updated_by,updated_at=now()
    where not pa_sim_tracking_windows.locked;
  if not found then raise exception 'Phase locked'; end if;
end;
$$;

create function public.pa_sim_commit_tracking(employee text, tracking_month integer, expected_version integer, next_document jsonb, recipients text[], notification_payload jsonb, rca_triggers jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  activation public.pa_sim_tracking_windows%rowtype;
  source public.pa_sim_kpi_documents%rowtype;
  current_document jsonb;
  action_scope text;
  today date := (now() at time zone 'Asia/Jakarta')::date;
  deadline date;
  recipient text;
  trigger_record jsonb;
begin
  select * into source from public.pa_sim_kpi_documents where employee_id = employee and period = '2026' for share;
  if not found or source.document->>'status' <> 'Validated' or source.version <> (next_document->>'settingVersion')::integer then
    raise exception 'Validated Setting required';
  end if;
  select * into activation from public.pa_sim_tracking_windows where unit_id = source.document->'snapshot'->>'unitId' and period = '2026' for share;
  if not found or activation.locked or today < activation.start_date or today < make_date(2026,tracking_month,1) then raise exception 'Phase closed'; end if;
  select document into current_document from public.pa_sim_tracking_documents where employee_id = employee and period = '2026' and month = tracking_month for update;
  if notification_payload->>'action' in ('save','submit') then
    action_scope := case when current_document->>'revisionStage' is not null then 'revision' else 'submission' end;
  else action_scope := 'approval'; end if;
  deadline := (make_date(2026,tracking_month,1) + interval '1 month')::date + activation.date_lock - 1;
  if not (
    (today <= activation.end_date and today <= deadline)
    or (today <= activation.end_date and tracking_month = any(activation.backlog_months) and today <= activation.backlog_end)
    or exists(select 1 from public.pa_sim_kpi_open_locks where employee_id = employee and period = '2026' and month = tracking_month and scope = action_scope and status = 'Approved' and expires_on >= today)
  ) then raise exception 'Open Lock required'; end if;
  if (next_document->>'version')::integer <> expected_version + 1 or next_document->>'employeeId' <> employee or (next_document->>'month')::integer <> tracking_month then raise exception 'Invalid version'; end if;
  if expected_version = 0 then
    insert into public.pa_sim_tracking_documents(employee_id,period,month,version,document) values(employee,'2026',tracking_month,1,next_document) on conflict do nothing;
  else
    update public.pa_sim_tracking_documents set document = next_document, version = expected_version + 1, updated_at = now()
    where employee_id = employee and period = '2026' and month = tracking_month and version = expected_version;
  end if;
  if not found then raise exception 'Concurrent change'; end if;
  insert into public.pa_sim_tracking_events(employee_id,period,month,version,document) values(employee,'2026',tracking_month,expected_version+1,next_document);
  if next_document->>'status' = 'Validated' then
    for trigger_record in select * from jsonb_array_elements(rca_triggers) loop
      insert into public.pa_sim_kpi_rca_triggers(employee_id,period,month,item_id,source_version,target,actual,achievement)
      values(employee,'2026',tracking_month,trigger_record->>'itemId',expected_version+1,(trigger_record->>'target')::numeric,(trigger_record->>'actual')::numeric,(trigger_record->>'achievement')::numeric);
    end loop;
  end if;
  foreach recipient in array recipients loop
    insert into public.pa_sim_notifications(recipient_id,employee_id,period,version,channel,delivery_status,payload,scope)
    values(recipient,employee,'2026',expected_version+1,'in-app','available',notification_payload,'kpi-tracking:'||tracking_month),
      (recipient,employee,'2026',expected_version+1,'email','pending',notification_payload,'kpi-tracking:'||tracking_month);
  end loop;
end;
$$;

create function public.pa_sim_commit_open_lock(request_id uuid, actor text, request_data jsonb, decision text, decision_expiry date, note text)
returns void language plpgsql security invoker set search_path = public as $$
declare
  request_record public.pa_sim_kpi_open_locks%rowtype;
  recipient text;
  recipients text[];
  payload jsonb;
  activation public.pa_sim_tracking_windows%rowtype;
  tracking jsonb;
begin
  if decision = 'request' then
    insert into public.pa_sim_kpi_open_locks(id,employee_id,period,month,scope,requester_id,reason)
    values(request_id,request_data->>'employeeId','2026',(request_data->>'month')::integer,request_data->>'scope',actor,request_data->>'reason') returning * into request_record;
    recipients := array['SIM-ACTOR-HR-STRATEGIC'];
  else
    if not exists(select 1 from public.pa_sim_identities where identity_id = actor and actor_level = 'hr-strategic') then raise exception 'Strategic only'; end if;
    if decision not in ('Approved','Rejected') or length(trim(coalesce(note,''))) = 0 then raise exception 'Decision and note required'; end if;
    if decision = 'Approved' and (decision_expiry is null or decision_expiry < (now() at time zone 'Asia/Jakarta')::date) then raise exception 'Expiry required'; end if;
    update public.pa_sim_kpi_open_locks set status=decision,expires_on=case when decision='Approved' then decision_expiry else null end,decided_by=actor,decision_note=note,decided_at=now()
    where id=request_id and status='Pending' returning * into request_record;
    if not found then raise exception 'Request already decided'; end if;
    recipients := array[request_record.requester_id];
  end if;
  select activation_window.* into activation from public.pa_sim_tracking_windows activation_window
  join public.pa_sim_kpi_documents source on source.document->'snapshot'->>'unitId' = activation_window.unit_id and source.period=activation_window.period
  where source.employee_id=request_record.employee_id and source.period='2026' for share of activation_window;
  if not found or activation.locked then raise exception 'Phase closed'; end if;
  select document into tracking from public.pa_sim_tracking_documents where employee_id=request_record.employee_id and period='2026' and month=request_record.month for share;
  if tracking->>'status'='Validated' then raise exception 'Tracking already completed'; end if;
  if request_record.requester_id = actor and decision <> 'request' then raise exception 'Cannot decide own request'; end if;
  payload := jsonb_build_object('module','Request Open Lock KPI','action',decision,'employeeId',request_record.employee_id,'period','2026','month',request_record.month,'status',request_record.status,'at',now(),'link','/pa-simulasi?view=open-lock','timezone','Asia/Jakarta');
  foreach recipient in array recipients loop
    insert into public.pa_sim_notifications(recipient_id,employee_id,period,version,channel,delivery_status,payload,scope)
    values(recipient,request_record.employee_id,'2026',case when decision='request' then 1 else 2 end,'in-app','available',payload,'kpi-open-lock:'||request_id),
      (recipient,request_record.employee_id,'2026',case when decision='request' then 1 else 2 end,'email','pending',payload,'kpi-open-lock:'||request_id);
  end loop;
end;
$$;
revoke all on function public.pa_sim_commit_tracking(text,integer,integer,jsonb,text[],jsonb,jsonb), public.pa_sim_commit_open_lock(uuid,text,jsonb,text,date,text), public.pa_sim_save_tracking_window(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.pa_sim_commit_tracking(text,integer,integer,jsonb,text[],jsonb,jsonb), public.pa_sim_commit_open_lock(uuid,text,jsonb,text,date,text), public.pa_sim_save_tracking_window(text,text,jsonb) to service_role;
commit;
