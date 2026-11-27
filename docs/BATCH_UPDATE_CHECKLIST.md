# Daftar Poin Update Sistem One Performance (Tersimpan Sebelum Eksekusi)

**Aturan Permanen Wajib (Zero-Data-Loss Rule):**
> Pastikan jika ada tambahan atau perubahan fitur, flow, proses, formula, dll pada sistem yang kita buat ini **tidak menghapus data user dan transaksinya (termasuk data draft)** yang sudah ada di database.

---

## A. FORMAT DATE
- [x] **FD-1**: Ubah semua format date pada sistem ini menjadi **`DD/MM/YYYY`**, serta pastikan support penuh pada file upload dengan format date **`DD/MM/YYYY`** (termasuk serial date Excel & konversi mundur data lama tanpa merusak data eksisting).

## B. KPI
- [x] **KPI-1**: Untuk **KPI Setting Personal** selain KPI dengan Role `Director`, `GM`, `VGM`: pada **Edit [Target] Request**:
  - **Fase 1 — Edit Request**: Request dikirim ke **1 approver** untuk mendapat izin edit target; nama yang tampil adalah user dengan role **HR ICF**.
  - **Fase 2 — Submit Target yang Diedit** (setelah disetujui -> edit target): flow approver adalah **Approver: Atasan 1 -> Atasan 2 -> GM (sesuai unit) -> Validate: HR ICF**.
- [x] **KPI-2**: Pada `/setting/kpi` (button **Add KPI**; **Preview**) & `/measurement/kpi-tracking` (button **Add Month**; **Preview**), beri warna dengan tema yang sesuai dengan button lainnya untuk **semua page KPI (Business & Personal)**.
- [x] **KPI-3**: Pada `/measurement/kpi-tracking`, ubah teks pada field bulan yang diblok dari `"Inactive · Bulan Jan Diblok (Bulan)"` menjadi **`"KPI ini di bulan {{bulan}} Anda inactive kan pada saat membuat KPI Setting."`** untuk semua KPI (**Business & Personal**).
- [x] **KPI-4**: Untuk semua **KPI Setting (Business & Personal)** di **Add New KPI** (dan Edit KPI): pada field **Indicator Mode**, jika memilih radio button **Ratio** maka muncul pop up pilihan **"Default Rasio"** dan **"Custom Ratio"**:
  - Jika pilih **Default Rasio**: sesuai dengan yang sudah ada saat ini (`10:1`, `6:1`, `5:1`, `4:1`, `3:1`, `2:1`).
  - Jika pilih **Custom Ratio**: muncul input penulisan rasio bebas (persen atau numerik), contoh persen: `2%:10%`, contoh numerik: `100:200`, dengan formula pencapaian target di KPI Tracking mengikuti formula rasio yang sudah dibuat secara proporsional.

## C. RCA
- [x] **RCA-1**: Pada **Create New RCA** drawer (baik dari tombol **Create New RCA** maupun klik **tag RCA**), jadikan field **Aktual** bersifat **read-only**.
- [x] **RCA-2**: Pada `/measurement/rca`, tabel RCA: tambahkan kolom **`Aktual Penyelesaian`** setelah kolom **`Status Perbaikan`**, yang terisi ketika owner memilih **`Selesai`** pada kolom/field `Status Perbaikan` lalu memilih tanggal selesai menggunakan pemilih tanggal (`DD/MM/YYYY`), tersimpan ke backend Supabase tanpa menghapus RCA eksisting.
- [x] **RCA-3**: Pada `/measurement/rca`, tambahkan card **`Summary Masalah Utama`** yang menampilkan ringkasan jumlah **Open** dan **Closed** dari tag **`Eksternal`** dan **`Internal`** pada kolom **Masalah Utama (A)** (contoh: `Eksternal: 1 Open | 2 Closed`, `Internal: 2 Open | 0 Closed`), serta sesuaikan juga pada `/calibration/adjustment` -> **Employee Performance Calibration Adjustment** -> tabel user -> **View Detail User Drawer** -> bagian **RCA (Root Cause Analysis)** agar menampilkan summary jumlah Open & Closed untuk tag **Eksternal** dan **Internal**.

## D. REMINDER APPROVER
- [x] **REM-1**: Pada user yang ditunjuk sebagai **Approver** (Atasan / Approver 1 / Approver 2 — **bukan** tahap Checker & Validate), jika terdapat task approval yang masih *outstanding* saat login, tampilkan **auto popup informasi saat login**:
  - Judul/isi: `"Notifikasi Pengingat | Ada {{jumlah user request}} karyawan dari tim anda yang mengirimkan permintaan persetujuan/penilaian, untuk menindaklanjuti silahkan klik {{button navigasi ke /dashboard/approval}}"`.
  - Tanpa tombol/ikon Close (`X`) dan tidak tertutup klik backdrop; hanya bisa diklik tombol navigasi menuju `/dashboard/approval`.
  - Setelah diklik menuju dashboard approval, popup tidak muncul lagi pada sesi login tersebut sampai user logout lalu login kembali (jika masih ada task outstanding).
  - Desain dengan motion lembut, gimmick elegan, dan ikon berwarna.

## E. NOTIFIKASI
- [x] **NOTIF-1**: Buat **notifikasi reminder khusus untuk Approver** apabila terdapat task yang masih *outstanding* **3 hari** sejak di-request oleh bawahannya, dan **berulang otomatis setiap kelipatan 3 hari** selama approver tersebut belum melakukan aksi approval (tersinkron ke Supabase tanpa duplikasi spam di hari yang sama).
- [x] **NOTIF-2**: Perbaiki sistem **Notifikasi Realtime** agar langsung tampil seketika (*realtime*) di sisi user yang login saat submit modul untuk approval, serta di sisi approver tanpa delay ketika task yang perlu di-approve sudah tersedia (Supabase Realtime / polling ringan terarah + event sinkronisasi lintas komponen).

## F. USER MANAGEMENT (`/settings/user-management`)
- [x] **UM-1**: Perbaiki tampilan **inisial (avatar berwarna) nama user** pada saat create user baru / daftar user yang sebelumnya tidak terlihat.
- [x] **UM-2**: Validasi multi-unit usaha dalam group & akurasi Login:
  - **Reg No**: **Tidak boleh sama dalam 1 unit usaha** (blokir simpan + info error); **boleh sama jika berbeda unit usaha** (tampilkan info tag kuning).
  - **ID Karyawan (Employee ID)**: **Boleh sama dalam 1 unit usaha maupun beda unit usaha** (tampilkan info tag kuning).
  - **Login**: Ketika user login menggunakan **ID Karyawan** pada unit usaha yang dipilih dan terdapat kesamaan ID Karyawan (di unit sama/lain) atau kesamaan Reg No (di unit lain), sistem wajib mencocokkan dan mengambil data user yang tepat sesuai **unit usaha yang dipilih saat login** (dan disambiguasi Reg No / akun terkait bila ada duplikasi ID Karyawan dalam 1 unit) serta menjaga kunci database `pa_users` agar tidak saling menimpa antar-user ber-ID sama.
- [x] **UM-3**: Pada **Add User** baru (maupun Edit User), jika terdapat kesamaan **Reg No dalam 1 unit usaha yang sama**, tombol Save diblokir (tidak bisa di-save) disertai pesan informasi yang jelas.

## G. UPLOAD DATA USER (`/settings/data-sync` & `/settings/user-management`)
- [x] **DS-1**: Mode **Update / Gabung Data**: Jika upload Excel memiliki kesamaan **Reg No pada unit usaha yang sama** (dengan perbedaan data), tampilkan popup berisi tabel perbandingan:
  `"Anda memilih Mode Update / Gabung Data di Unit Usaha {{Unit Usaha}}, silahkan cek kembali sebelum gabung data, Ada perbedaan data dari Reg No: {{Reg No}} yaitu ... Jika anda klik Continue and Update, artinya anda setuju untuk update data existing karyawan dengan data terbaru (tanpa menghapus riwayat data transaksi penilaian kinerja), pilih Cancel jika anda mau menyesuaikan kembali file upload anda."`
- [x] **DS-2**: Mode **Update / Clear Transaksi**: Jika upload Excel memiliki kesamaan **Reg No pada unit usaha yang sama**, tampilkan popup berisi tabel perbedaan data dengan keterangan `(termasuk menghapus riwayat data transaksi penilaian kinerja)`. Jika klik **Continue and Update**, tampilkan tahap konfirmasi kedua dengan input ketik **`konfirmasi perbaharui data`** lalu tombol **Continue** atau **Cancel** (dan hanya membersihkan transaksi milik karyawan terdampak yang dikonfirmasi pada unit tersebut).
- [x] **DS-3**: Mode **Replace / Ganti Data**: Tampilkan popup peringatan:
  `"Anda memilih Mode: Replace / Ganti Data artinya semua data yang terkait pada Unit Usaha {{unit usaha}} ini akan digantikan dengan data baru (clean data termasuk data riwayat transaksi penilaian kinerja aktif maupun arsip). setelah konfirmasi, data tidak dapat dipulihkan sehingga pastikan kembali Mode yang anda pilih."` dengan tombol **Continue & Change Data** dan **Cancel**; jika klik **Continue & Change Data**, tampilkan field konfirmasi ketik **`konfirmasi ganti data`** lalu **Continue** atau **Cancel**.
- [x] **DS-4**: Pada button **Download Template** di `/settings/data-sync`, gunakan file template terbaru terlampir (`public/templates/Template_Upload_Karyawan.xlsx`).
- [x] **DS-5**: Pada proses upload file Excel terbaru, **abaikan sheet `"Master"`** karena hanya untuk referensi (baca sheet `"Data_Karyawan"` / sheet data karyawan).
- [x] **DS-6**: Kolom baru **`Status Karyawan`**, **`Keterangan Status Karyawan`**, dan **`Tgl Efektif`**:
  - Tambahkan ketiga kolom tersebut pada tabel **`Menampilkan {{jumlah}} karyawan terdaftar`** di `/settings/data-sync` serta simpan end-to-end ke backend (`api/pa-sync.js`, Edge Function, Supabase `pa_users` / metadata non-destruktif).
  - Di `/settings/user-management`: tambahkan kolom **`Status Karyawan`** pada tabel user dengan default kosong (`-`).
  - Di modal **Add User / Edit User** (`/settings/user-management`): tambahkan field dropdown **`Status Karyawan`** (pilihan kosong default `-`, `Karyawan Baru`, `Mutasi`, `Promosi`). Jika dipilih `Karyawan Baru` / `Mutasi` / `Promosi`, otomatis muncul field **`Keterangan Status Karyawan`** dan **`Tgl Efektif`** (`DD/MM/YYYY`). Sinkron penuh dengan hasil upload Excel.
