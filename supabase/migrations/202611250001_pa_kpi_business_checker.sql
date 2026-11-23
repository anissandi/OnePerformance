begin;

-- ============================================================================
-- MIGRASI FUNGSI APPROVAL KHUSUS CHECKER KPI BUSINESS (KPI GROUP & KPI UNIT)
-- Menyimpan flag `is_kpi_business_checker` dan cakupan `kpi_business_checker_units`
-- pada tabel `public.pa_users` agar tersinkron penuh lintas perangkat & sesi.
-- ============================================================================

alter table if exists public.pa_users
  add column if not exists is_kpi_business_checker boolean not null default false,
  add column if not exists kpi_business_checker_units jsonb not null default '[]'::jsonb;

commit;
