begin;

-- ============================================================================
-- MIGRASI PERAN APPROVAL CALIBRATION PER UNIT USAHA (TERMASUK READ ONLY)
-- Menyimpan mapping `calibration_role_by_unit` ("approver" | "mengetahui" | "readonly" | "")
-- dan `director_calibration_role` secara persisten di tabel `pa_users`.
-- ============================================================================

alter table if exists public.pa_users
  add column if not exists calibration_role_by_unit jsonb not null default '{}'::jsonb,
  add column if not exists director_calibration_role text not null default '';

commit;
