-- Audit Trail: retensi 30 hari di sisi server (Supabase).
-- 1) Index untuk query & penghapusan berdasarkan waktu.
-- 2) Fungsi purge yang menghapus log lebih dari 30 hari.
-- 3) Trigger statement-level setelah INSERT sebagai jaminan (berjalan walau pg_cron tidak tersedia).
-- 4) Jadwal harian via pg_cron bila ekstensi tersedia.

begin;

create index if not exists pa_audit_trail_created_at_idx
  on public.pa_audit_trail (created_at desc);

create or replace function public.pa_purge_audit_trail(retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.pa_audit_trail
  where created_at < now() - make_interval(days => greatest(retention_days, 1));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

grant execute on function public.pa_purge_audit_trail(integer) to anon, authenticated, service_role;

create or replace function public.pa_audit_trail_auto_purge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pa_purge_audit_trail(30);
  return null;
end;
$$;

drop trigger if exists pa_audit_trail_auto_purge_trg on public.pa_audit_trail;
create trigger pa_audit_trail_auto_purge_trg
  after insert on public.pa_audit_trail
  for each statement
  execute function public.pa_audit_trail_auto_purge();

commit;

-- Jadwal harian 01:00 WIB (18:00 UTC) bila pg_cron tersedia; diabaikan bila tidak.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'pa_audit_trail_purge_daily';
    perform cron.schedule('pa_audit_trail_purge_daily', '0 18 * * *', 'select public.pa_purge_audit_trail(30);');
  end if;
exception when others then
  raise notice 'pg_cron tidak tersedia, retensi tetap berjalan via trigger: %', sqlerrm;
end;
$$;

-- Bersihkan log lama yang sudah ada saat migrasi dijalankan.
select public.pa_purge_audit_trail(30);
