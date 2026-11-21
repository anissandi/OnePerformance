begin;

-- ============================================================================
-- MIGRASI CAKUPAN LINTAS UNIT USAHA UNTUK HR CHECKER & MULTI-SCOPE UNIT
-- Menyimpan daftar Company Unit yang diizinkan untuk fungsi Checker HR Unit
-- (`checker_units`) serta `managed_units` secara persisten di tabel `pa_users`.
-- ============================================================================

alter table if exists public.pa_users
  add column if not exists checker_units jsonb not null default '[]'::jsonb,
  add column if not exists managed_units jsonb not null default '[]'::jsonb;

commit;
