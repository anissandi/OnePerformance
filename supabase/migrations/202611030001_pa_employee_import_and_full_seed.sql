begin;

-- ============================================================================
-- PERLUASAN TABEL pa_users UNTUK FORMAT IMPORT EXCEL DATA KARYAWAN (BAGIAN I)
-- Kolom: No; Reg No; ID Karyawan; Nama; Divisi; Departement; Bagian; Jabatan;
--        Joindate; No Telegram; Corporate Email; Reg No AP1; Reg No AP2
-- ============================================================================

alter table public.pa_users
  add column if not exists no text not null default '',
  add column if not exists reg_no text not null default '',
  add column if not exists bagian text not null default '',
  add column if not exists join_date text not null default '',
  add column if not exists telegram_no text not null default '',
  add column if not exists reg_no_ap1 text not null default '',
  add column if not exists reg_no_ap2 text not null default '',
  add column if not exists is_hr_unit_checker boolean not null default false,
  add column if not exists is_hr_icf_validator boolean not null default false;

-- Update seed data karyawan dengan Reg No, Bagian, Joindate, No Telegram, Reg No AP1, dan Reg No AP2
insert into public.pa_users (
  employee_id, no, reg_no, name, email, position, company, unit_id,
  division, department, bagian, join_date, telegram_no,
  grade, role, groupings, status, last_login,
  reg_no_ap1, reg_no_ap2, is_hr_unit_checker, is_hr_icf_validator
) values
  ('E001', '1',  'REG-001', 'Ahmad Fauzi',          'ahmad.fauzi@sambugroup.com',      'Kepala Departemen Produksi',     'PT Pulau Sambu (Guntung)',    'GTG',  'Divisi Produksi & Operasional', 'Produksi',            'Proses Kelapa A',     '2016-03-15', '+628117001001', 'Grade 8',  'Supervisor',    'Ka./Wa.Ka.Dept',        'Active', '2026-06-09 08:14', 'REG-008', 'REG-016', false, false),
  ('E002', '2',  'REG-002', 'Siti Rahayu',          'siti.rahayu@sambugroup.com',      'Staff Pengembangan SDM',         'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Pengembangan SDM',    '2021-07-01', '+628117001002', 'Grade 5',  'Employee',      'Operasional',           'Active', '2026-06-08 13:45', 'REG-014', 'REG-008', false, false),
  ('E003', '3',  'REG-003', 'Budi Santoso',         'budi.santoso@sambugroup.com',     'Kepala Bagian Keuangan',         'PT RSTM',                     'RSTM', 'Finance & Accounting',          'Keuangan',            'Treasury',            '2018-01-10', '+628117001003', 'Grade 7',  'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-08 17:32', 'REG-008', 'REG-016', false, false),
  ('E004', '4',  'REG-004', 'Diana Kusuma',         'diana.kusuma@sambugroup.com',     'Staff Pemasaran',                'PT GHS',                      'GHS',  'Generals',                      'Umum & Administrasi', 'Administrasi Umum',   '2022-04-12', '+628117001004', 'Grade 4',  'Employee',      'Operasional',           'Active', '2026-06-07 09:10', 'REG-010', 'REG-008', false, false),
  ('E005', '5',  'REG-005', 'Eko Prasetyo',         'eko.prasetyo@sambugroup.com',     'Supervisor Teknologi Informasi', 'PT Pulau Sambu (Jakarta)',    'PSJ',  'Generals',                      'Teknologi Informasi', 'Infrastruktur IT',    '2019-09-01', '+628117001005', 'Grade 7',  'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 07:58', 'REG-008', 'REG-016', false, false),
  ('E006', '6',  'REG-006', 'Fajar Hidayat',        'fajar.hidayat@sambugroup.com',    'Kepala Seksi Operasional',       'PT RSUP (Perkebunan)',        'PKB',  'Coconut Production',            'Produksi Kelapa A',   'Proses Kelapa A',     '2020-02-17', '+628117001006', 'Grade 6',  'Supervisor',    'Ka./Wa.Ka.Seksi',       'Active', '2026-06-06 10:30', 'REG-008', 'REG-016', false, false),
  ('E007', '7',  'REG-007', 'Gita Permata',         'gita.permata@sambugroup.com',     'Staff Keuangan',                 'PT Pulau Sambu (Kuala Enok)', 'KEN',  'Finance & Accounting',          'Keuangan',            'Anggaran',            '2023-01-09', '+628117001007', 'Grade 4',  'Employee',      'Operasional',           'Active', '2026-05-20 11:45', 'REG-003', 'REG-008', false, false),
  ('E008', '8',  'REG-008', 'Hendra Wijaya',        'hendra.wijaya@sambugroup.com',    'Kepala Divisi Operasional',      'PT RSUP (Industry)',          'IND',  'Coconut Production',            'Produksi Kelapa A',   'Proses Kelapa A',     '2014-06-01', '+628117001008', 'Grade 9',  'Supervisor',    'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-09 14:22', 'REG-016', 'REG-017', false, false),
  ('E009', '9',  'REG-009', 'Indah Lestari',        'indah.lestari@sambugroup.com',    'Staff Agronomi',                 'PT RSUP (Perkebunan)',        'PKB',  'Coconut Production',            'Produksi Kelapa B',   'Proses Kelapa B',     '2021-11-03', '+628117001009', 'Grade 5',  'Employee',      'Operasional',           'Active', '2026-06-05 08:20', 'REG-006', 'REG-008', false, false),
  ('E010', '10', 'REG-010', 'Joko Susanto',         'joko.susanto@sambugroup.com',     'Kepala Bagian Teknik',           'PT GHS',                      'GHS',  'Utility & Supports',            'Maintenance',         'Mechanical',          '2017-08-21', '+628117001010', 'Grade 7',  'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-07 16:00', 'REG-008', 'REG-016', false, false),
  ('E011', '11', 'REG-011', 'Kartini Dewi',         'kartini.dewi@sambugroup.com',     'Staff Rekrutmen',                'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Rekrutmen & Seleksi', '2022-05-16', '+628117001011', 'Grade 4',  'Employee',      'Operasional',           'Active', '2026-06-10 08:00', 'REG-014', 'REG-008', false, false),
  ('E012', '12', 'REG-012', 'Lukman Hakim',         'lukman.hakim@sambugroup.com',     'Supervisor Quality Control',     'PT Pulau Sambu (Guntung)',    'GTG',  'Quality Management',            'Quality Control',     'Inspeksi QC',         '2018-10-15', '+628117001012', 'Grade 7',  'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 06:55', 'REG-001', 'REG-008', false, false),
  ('E013', '13', 'REG-013', 'Anis Sandi',           'anis.sandi@sambugroup.com',       'HR Strategic Specialist',        'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Pengembangan SDM',    '2017-04-03', '+628117001013', 'Grade 6',  'Administrator', 'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:00', 'REG-008', 'REG-016', false, true),
  ('E014', '14', 'REG-014', 'Ananta Nirmala',       'hr.unit.ind@sambugroup.com',      'Supervisor HR Unit',             'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Rekrutmen & Seleksi', '2018-06-11', '+628117001014', 'Grade 6',  'HR Unit',       'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:15', 'REG-008', 'REG-016', true,  false),
  ('E015', '15', 'REG-015', 'Mario Sesman',         'mario.sesman@sambugroup.com',     'HR ICF Specialist',              'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Pengembangan SDM',    '2016-11-20', '+628117001015', 'Grade 6',  'HR ICF',        'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:20', 'REG-008', 'REG-016', false, true),
  ('E016', '16', 'REG-016', 'Ir. Bambang Sutrisno', 'bambang.sutrisno@sambugroup.com', 'Direktur Operasional',           'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Pengembangan SDM',    '2012-01-05', '+628117001016', 'Grade 10', 'Director',      'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-10 09:30', 'REG-017', 'REG-017', false, false),
  ('E017', '17', 'REG-017', 'Surya Abimanyu',       'surya.abimanyu@sambugroup.com',   'Board of Directors',             'PT RSUP (Industry)',          'IND',  'Staff Management',              'Sumber Daya Manusia', 'Pengembangan SDM',    '2010-01-01', '+628117001017', 'Grade 11', 'BOD',           'Ka./Wa.Ka.Div ke atas', 'Active', '2026-06-10 09:40', '',        '',        false, false),
  ('E018', '18', 'REG-018', 'Wahyu Nugroho',        'wahyu.nugroho@sambugroup.com',    'Kepala Bagian Operasional',      'ASD',                         'ASD',  'Coconut Production',            'Produksi Kelapa A',   'Proses Kelapa A',     '2019-03-14', '+628117001018', 'Grade 7',  'Supervisor',    'Ka./Wa.Ka.Bagian',      'Active', '2026-06-10 09:50', 'REG-008', 'REG-016', false, false)
on conflict (employee_id) do update set
  no = excluded.no,
  reg_no = excluded.reg_no,
  name = excluded.name,
  email = excluded.email,
  position = excluded.position,
  company = excluded.company,
  unit_id = excluded.unit_id,
  division = excluded.division,
  department = excluded.department,
  bagian = excluded.bagian,
  join_date = excluded.join_date,
  telegram_no = excluded.telegram_no,
  grade = excluded.grade,
  role = excluded.role,
  groupings = excluded.groupings,
  status = excluded.status,
  reg_no_ap1 = excluded.reg_no_ap1,
  reg_no_ap2 = excluded.reg_no_ap2,
  is_hr_unit_checker = excluded.is_hr_unit_checker,
  is_hr_icf_validator = excluded.is_hr_icf_validator,
  updated_at = now();

commit;
