# Mengaktifkan RCA PA-Simulasi

## Status

Kode menggunakan proyek One Performance Project (`ekzrnltjbcauihoftkiy`), endpoint
`/functions/v1/make-server-74dadec6/pa-simulation/rca`, dan pemicu resmi yang sudah
dibuat oleh KPI Tracking. Tidak memakai localStorage RCA mockup.

**Kode ini memerlukan migrasi dan redeploy sebelum dapat diuji live.**

## Penerapan oleh pemilik proyek

1. Di Supabase Dashboard, pilih **One Performance Project** dan pastikan project ref
   `ekzrnltjbcauihoftkiy`. Cadangkan data sesuai prosedur proyek.
2. Buka SQL Editor. Jalankan isi
   `supabase/migrations/202610130001_pa_simulation_rca.sql` **sekali** sesudah empat
   migrasi sebelumnya. Migrasi menambahkan tabel, bucket privat, dan RPC, tanpa
   menghapus atau mereset data KPI.
3. Dari salinan repository terbaru pada komputer yang memiliki Supabase CLI dan
   akses deploy proyek, jalankan:

   ```sh
   supabase functions deploy make-server-74dadec6 --project-ref ekzrnltjbcauihoftkiy --no-verify-jwt
   ```

   Konfigurasi entrypoint sudah ada di `supabase/config.toml`. Sertakan seluruh
   `supabase/functions/server/` dan `shared/`, bukan hanya file route RCA.
   JWT tetap diperiksa oleh `simulationContext` di setiap operasi. Jangan
   memasukkan service-role key ke frontend atau repository.
4. Buka `/pa-simulasi?view=rca` dan login akun simulasi. Jika migrasi atau deployment
   belum tersedia, halaman menampilkan kegagalan layanan; tidak memakai data palsu.

## Skenario uji live

- Karyawan melihat RCA dari pemicu KPI Tracking yang sudah `Validated`.
- Isi masalah utama, tiga tingkat penyebab, action plan, PIC, target tanggal.
  Simpan draft dan muat ulang untuk memeriksa persistensi.
- Submit rencana, lalu proses checker → A1 → A2 → validator sesuai penugasan
  dataset. Level divisi memakai mirror A1 + A2. Uji revisi dan submit ulang kembali
  ke tahap peminta.
- Setelah validasi penuh, RCA menjadi `Approved` selama masih ada rencana nonfinal.
  Jika seluruh action plan Selesai/Dibatalkan, RCA langsung menjadi `Closed`.
- Pemilik mengisi progres. Status `Selesai` wajib output dan evidence JPG/PNG/PDF
  privat (maks. 10 MB/file). Status Ditunda/Dibatalkan wajib alasan.
  Seluruh action plan boleh Dibatalkan bila disertai alasan dan lolos approval penuh.
- Setiap submit pembaruan/revisi wajib menambahkan minimal satu evidence baru
  dibanding submission sebelumnya. Evidence lama bersifat append-only: tidak dapat
  dihapus, diganti, atau hilang akibat penghapusan masalah/action plan. Jumlah file
  dapat bertambah melewati sepuluh sepanjang siklus RCA.
- Submit tindak lanjut dan ulangi pemeriksaan. Hanya validasi siklus tindak lanjut
  dengan seluruh rencana Selesai atau Dibatalkan yang menghasilkan `Closed`.
- Periksa History RCA, notifikasi in-app, serta pemicu pada KPI Tracking setelah
  Muat ulang: `improvement_status = Closed` dan `closure_validated = true`.
- Akun lain tanpa penugasan tidak dapat membaca/menyimpan/mengakses bukti; pemeriksa
  tidak boleh mengubah isi; aktor yang belum mendapat giliran tidak boleh memutuskan.
- Dua browser dengan versi dokumen berbeda harus menghasilkan konflik versi,
  bukan menimpa perubahan.
- RCA Closed tidak dapat diedit; aktual dan skor KPI tidak berubah.

## Batas cakupan

RCA menggunakan penugasan modul `rca` pada dataset simulasi. Form mengikuti konsep
RCA utama (multi-masalah, penyebab berjenjang, multi-action plan, status, output,
evidence) tanpa mencampur contoh/data lokal prototype utama. Tautan tersedia dari
halaman RCA utama dan menu PA-Simulasi.

Jadwal/Open Lock khusus RCA dan pengiriman email belum tersambung. Lock Tracking
tidak dipakai untuk menghalangi perbaikan setelah Tracking divalidasi.

## Pengujian lokal

```sh
node --experimental-strip-types --test supabase/functions/server/shared/rcaWorkflow.test.ts
pnpm build
```

Build tidak membuktikan deployment SQL atau Edge Function. Verifikasi database,
storage, auth live, dan alur multi-akun wajib dilakukan setelah penerapan.

## Pembaruan aturan evidence dan status final

Untuk proyek yang sudah menerapkan migrasi RCA, perubahan ini hanya memerlukan
redeploy Edge Function dari source terbaru; tidak ada migrasi SQL baru.
Baseline evidence submission disimpan pada JSON dokumen. Untuk dokumen lama,
server membaca baseline dari event submission historis, bukan dari draft terbaru.
