begin;

-- ============================================================================
-- MIGRASI LOGIKA APPROVER 1 & APPROVER 2 (reg_no_ap1 & reg_no_ap2) PADA pa_users:
-- 1. Bersihkan placeholder kosong ('-', '—', 'N/A', 'NA', 'NULL', 'UNDEFINED') -> ''
-- 2. Jika salah satu kosong dan satunya terisi -> jadikan Reg No yang terisi sebagai AP1 & AP2
-- 3. Jika keduanya kosong -> keduanya '' (belum ada approver)
-- ============================================================================

update public.pa_users
set
  reg_no_ap1 = case
    when upper(trim(coalesce(reg_no_ap1, ''))) in ('', '-', '—', 'N/A', 'NA', 'NULL', 'UNDEFINED') then ''
    else trim(reg_no_ap1)
  end,
  reg_no_ap2 = case
    when upper(trim(coalesce(reg_no_ap2, ''))) in ('', '-', '—', 'N/A', 'NA', 'NULL', 'UNDEFINED') then ''
    else trim(reg_no_ap2)
  end;

update public.pa_users
set
  reg_no_ap1 = case when reg_no_ap1 = '' and reg_no_ap2 <> '' then reg_no_ap2 else reg_no_ap1 end,
  reg_no_ap2 = case when reg_no_ap2 = '' and reg_no_ap1 <> '' then reg_no_ap1 else reg_no_ap2 end,
  updated_at = now()
where (reg_no_ap1 = '' and reg_no_ap2 <> '')
   or (reg_no_ap2 = '' and reg_no_ap1 <> '');

commit;
