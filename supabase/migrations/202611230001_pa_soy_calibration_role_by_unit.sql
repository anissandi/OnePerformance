begin;

-- ============================================================================
-- MIGRASI PERAN APPROVAL SETTING (SOY) PER UNIT USAHA
-- Menyimpan mapping `soy_calibration_role_by_unit` ("approver" | "mengetahui" | "readonly" | "")
-- terpisah di samping `calibration_role_by_unit` (EOY) pada tabel `pa_users`,
-- sekaligus membersihkan key lokal sesi lama `pa_login_origin_user_v1` dari `pa_kv_state`.
-- ============================================================================

alter table if exists public.pa_users
  add column if not exists soy_calibration_role_by_unit jsonb not null default '{}'::jsonb;

delete from public.pa_kv_state where state_key = 'pa_login_origin_user_v1';

commit;
