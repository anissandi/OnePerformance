begin;

-- ============================================================================
-- 1. TABEL MASTER USER, GROUP RULES, ACCESS MANAGEMENT, & MENU MANAGEMENT
-- ============================================================================

create table if not exists public.pa_users (
  employee_id text primary key,
  name text not null,
  email text not null,
  position text not null,
  company text not null,
  unit_id text not null,
  division text not null,
  department text not null,
  grade text not null default 'Grade 5',
  role text not null check (role in ('Employee', 'Supervisor', 'HR Unit', 'HR ICF', 'Director', 'BOD', 'Administrator')),
  groupings text not null,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  last_login text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_group_rules (
  id text primary key,
  company text not null default 'DEFAULT',
  position text not null,
  group_name text not null,
  description text not null default '',
  allowed_modules jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_role_permissions (
  role text primary key,
  permissions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_menu_configs (
  id text primary key default 'default',
  menus jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_score_weights (
  company_unit text primary key,
  weights jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. TABEL AKTIVASI MODUL, WORKFLOW DOKUMEN PA, OPEN LOCK, JADWAL MI, & AUDIT
-- ============================================================================

create table if not exists public.pa_module_windows (
  unit_id text not null,
  module_id text not null,
  period text not null default '2026',
  active boolean not null default true,
  start_date text not null default '2026-01-01',
  end_date text not null default '2026-12-31',
  extra jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (unit_id, module_id, period)
);

create table if not exists public.pa_workflow_documents (
  doc_key text primary key,
  employee_id text not null,
  unit_id text not null,
  module text not null,
  phase text not null default 'measurement',
  period text not null default '2026',
  status text not null default 'Draft',
  version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_workflow_events (
  id bigint generated always as identity primary key,
  doc_key text not null,
  employee_id text not null,
  module text not null,
  phase text not null,
  period text not null default '2026',
  version integer not null,
  action text not null,
  actor_id text not null,
  stage text,
  status text not null,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pa_open_lock_requests (
  id text primary key,
  employee_id text not null,
  employee_name text not null,
  company_unit text not null default 'PT RSUP (Industry)',
  divisi text not null,
  departemen text not null,
  bagian text not null,
  posisi text not null,
  module text not null,
  period text not null,
  original_deadline text not null,
  submitted_at text not null,
  reason text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  approved_until text,
  approved_at text,
  approval_note text,
  rejected_at text,
  decided_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_interview_schedules (
  id text primary key,
  company_unit text not null,
  added_users jsonb not null default '[]'::jsonb,
  interviewers jsonb not null default '[]'::jsonb,
  other_users jsonb not null default '[]'::jsonb,
  scheduled_date text not null,
  scheduled_time text not null,
  location text not null default '',
  text_notifikasi text not null default '',
  text_lampiran text not null default '',
  status text not null default 'Scheduled' check (status in ('Scheduled', 'Cancelled', 'Done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pa_audit_trail (
  id bigint generated always as identity primary key,
  timestamp text not null,
  user_id text not null,
  user_name text not null,
  role text not null,
  action text not null,
  module text not null,
  sub_module text not null,
  description text not null,
  status text not null default 'Success',
  created_at timestamptz not null default now()
);

create table if not exists public.pa_app_notifications (
  id bigint generated always as identity primary key,
  recipient_id text not null,
  employee_id text not null,
  module text not null,
  status text not null,
  message text not null,
  link text not null default '/',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

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
    'pa_app_notifications'
  ] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('grant select on public.%I to anon, authenticated', tbl);
    execute format('grant all on public.%I to service_role', tbl);
    execute format('drop policy if exists %I_read_all on public.%I', tbl, tbl);
    execute format('create policy %I_read_all on public.%I for select to anon, authenticated using (true)', tbl, tbl);
  end loop;
end;
$$;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Seed default users synced with User Management across all 8 Company Units
insert into public.pa_users (employee_id, name, email, position, company, unit_id, division, department, grade, role, groupings, status, last_login)
values
  ('E001', 'Ahmad Fauzi',   'ahmad.fauzi@sambugroup.com',   'Kepala Departemen Produksi',     'PT Pulau Sambu (Guntung)',    'GTG',  'Divisi Produksi & Operasional', 'Produksi',    'Grade 8', 'Supervisor',    'Ka./Wa.Ka.Dept',        'Active', '2026-06-09 08:14'),
  ('E002', 'Siti Rahayu',   'siti.rahayu@sambugroup.com',   'Staff Pengembangan SDM',         'PT RSUP (Industry)',          'IND',  'Divisi Sumber Daya Manusia',    'SDM',         'Grade 5', 'Employee',      'Operasional',           'Active', '2026-06-08 13:45'),
  ('E003', 'Budi Santoso',  'budi.santoso@sambugroup.com',  'Kepala Bagian Keuangan',         'PT RSTM',                     'RSTM', 'Divisi Keuangan & Akuntansi',   'Keuangan',    'Grade 7', 'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-08 17:32'),
  ('E004', 'Diana Kusuma',  'diana.kusuma@sambugroup.com',  'Staff Pemasaran',                'PT GHS',                      'GHS',  'Divisi Pemasaran & Penjualan',  'Marketing',   'Grade 4', 'Employee',      'Operasional',           'Active', '2026-06-07 09:10'),
  ('E005', 'Eko Prasetyo',  'eko.prasetyo@sambugroup.com',  'Supervisor Teknologi Informasi', 'PT Pulau Sambu (Jakarta)',    'PSJ',  'Divisi Teknologi Informasi',    'TI',          'Grade 7', 'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 07:58'),
  ('E006', 'Fajar Hidayat', 'fajar.hidayat@sambugroup.com', 'Kepala Seksi Operasional',       'PT RSUP (Perkebunan)',        'PKB',  'Divisi Perkebunan',             'Operasional', 'Grade 6', 'Supervisor',    'Ka./Wa.Ka.Seksi',       'Active', '2026-06-06 10:30'),
  ('E007', 'Gita Permata',  'gita.permata@sambugroup.com',  'Staff Keuangan',                 'PT Pulau Sambu (Kuala Enok)', 'KEN',  'Divisi Keuangan & SDM',         'Keuangan',    'Grade 4', 'Employee',      'Operasional',           'Active', '2026-05-20 11:45'),
  ('E008', 'Hendra Wijaya', 'hendra.wijaya@sambugroup.com', 'Kepala Divisi Operasional',      'PT RSUP (Industry)',          'IND',  'Divisi Operasional',            'Operasional', 'Grade 9', 'Supervisor',    'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-09 14:22'),
  ('E009', 'Indah Lestari', 'indah.lestari@sambugroup.com', 'Staff Agronomi',                 'PT RSUP (Perkebunan)',        'PKB',  'Divisi Perkebunan',             'Agronomi',    'Grade 5', 'Employee',      'Operasional',           'Active', '2026-06-05 08:20'),
  ('E010', 'Joko Susanto',  'joko.susanto@sambugroup.com',  'Kepala Bagian Teknik',           'PT GHS',                      'GHS',  'Divisi Operasional',            'Teknik',      'Grade 7', 'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-07 16:00'),
  ('E011', 'Kartini Dewi',  'kartini.dewi@sambugroup.com',  'Staff Rekrutmen',                'PT RSUP (Industry)',          'IND',  'Divisi Sumber Daya Manusia',    'SDM',         'Grade 4', 'Employee',      'Operasional',           'Active', '2026-06-10 08:00'),
  ('E012', 'Lukman Hakim',  'lukman.hakim@sambugroup.com',  'Supervisor Quality Control',     'PT Pulau Sambu (Guntung)',    'GTG',  'Divisi Produksi & Operasional', 'QC',          'Grade 7', 'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 06:55'),
  ('E013', 'Anis Sandi',    'anis.sandi@sambugroup.com',    'HR Strategic Specialist',        'PT RSUP (Industry)',          'IND',  'Divisi Sumber Daya Manusia',    'SDM',         'Grade 6', 'Administrator', 'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:00'),
  ('E014', 'Ananta Nirmala','hr.unit.ind@sambugroup.com',   'Supervisor HR Unit',             'PT RSUP (Industry)',          'IND',  'Divisi Sumber Daya Manusia',    'SDM',         'Grade 6', 'HR Unit',       'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:15'),
  ('E015', 'Mario Sesman',  'mario.sesman@sambugroup.com',  'HR ICF Specialist',              'PT RSUP (Industry)',          'IND',  'Divisi Sumber Daya Manusia',    'SDM',         'Grade 6', 'HR ICF',        'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:20'),
  ('E016', 'Ir. Bambang Sutrisno', 'bambang.sutrisno@sambugroup.com', 'Direktur Operasional', 'PT RSUP (Industry)',          'IND',  'Direktorat Operasional',        'Direksi',     'Grade 10','Director',      'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-10 09:30'),
  ('E017', 'Surya Abimanyu','surya.abimanyu@sambugroup.com','Board of Directors',             'PT RSUP (Industry)',          'IND',  'Board of Directors',            'BOD',         'Grade 11','BOD',           'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-10 09:40'),
  ('E018', 'Wahyu Nugroho', 'wahyu.nugroho@sambugroup.com', 'Kepala Bagian Operasional',      'ASD',                         'ASD',  'Divisi Operasional',            'Operasional', 'Grade 7', 'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:50')
on conflict (employee_id) do update set
  name = excluded.name,
  position = excluded.position,
  company = excluded.company,
  unit_id = excluded.unit_id,
  division = excluded.division,
  department = excluded.department,
  role = excluded.role,
  groupings = excluded.groupings,
  status = excluded.status,
  updated_at = now();

commit;
