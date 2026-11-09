begin;

create table public.pa_sim_identities (
  identity_id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  email text not null unique check (email like '%@pa-simulasi.example.invalid'),
  unit_id text check (unit_id in ('IND', 'PKB', 'RSTM', 'GHS', 'ASD', 'GTG', 'KEN')),
  actor_level text not null check (actor_level in (
    'operasional', 'seksi', 'bagian', 'departemen', 'divisi',
    'gm', 'direktur', 'hr-unit', 'hr-strategic', 'bod'
  )),
  appraisal_participant boolean not null,
  dataset_period text not null check (dataset_period = '2026'),
  organization jsonb not null default '{}'::jsonb
    check (jsonb_typeof(organization) = 'object'),
  created_at timestamptz not null default now(),
  check (not appraisal_participant or (
    actor_level in ('operasional', 'seksi', 'bagian', 'departemen', 'divisi')
    and unit_id is not null
  ))
);

alter table public.pa_sim_identities enable row level security;

revoke all on public.pa_sim_identities from public, anon, authenticated;
grant select on public.pa_sim_identities to authenticated;
grant select, insert, update, delete on public.pa_sim_identities to service_role;

create policy pa_sim_identity_read_self
  on public.pa_sim_identities
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

commit;
