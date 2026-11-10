# Rencana Penyimpanan Aturan & Referensi Proses Performance Appraisal (PA) di `AGENTS.md` & `guidelines/Guidelines.md`

## Tujuan
Menyimpan aturan bisnis dan referensi alur kerja (end-to-end process) sistem Performance Appraisal (PA) ke dalam `AGENTS.md` dan `guidelines/Guidelines.md` sebagai sumber kebenaran (*single source of truth*) yang selalu dibaca oleh agen sebelum merancang atau mengimplementasikan perubahan. Struktur dokumen disiapkan secara modular agar dapat terus dilengkapi dengan aturan referensi lanjutan dari pengguna.

## File yang Akan Diperbarui
1. `AGENTS.md` — Menambahkan bagian **Aturan & Referensi Proses Sistem Performance Appraisal (PA)** secara lengkap dan merujuk ke `guidelines/Guidelines.md`.
2. `guidelines/Guidelines.md` — Menyimpan dokumentasi terstruktur untuk seluruh aturan referensi proses PA dari awal hingga akhir.

## Rincian Aturan yang Disimpan (Bagian I – Setup Awal, Data Karyawan, Grouping, & Konfigurasi)

### 1. Data Karyawan dan Approval (`DATA KARYAWAN DAN APPROVAL`)
1. **Import Excel Data Karyawan (`/hr/settings/data-sync`)**:
   - Role **Administrator** mengimpor file Excel data karyawan ke dalam sistem PA (karena tahun berjalan belum terintegrasi langsung ke database & sistem approval internal unit usaha).
   - Format kolom tabel wajib:
     `No; Reg No; ID Karyawan; Nama; Divisi; Departement; Bagian; Jabatan; Joindate; No Telegram; Corporate Email; Reg No AP1; Reg No AP2`
2. **Validasi Approval Berjenjang (`Reg No AP1` & `Reg No AP2`)**:
   - Kolom `Reg No AP1` dan `Reg No AP2` menjadi dasar validasi approval umum berjenjang (**Approval 1** & **Approval 2**) bagi masing-masing karyawan.
   - Untuk approval kustom seperti **Check** & **Validate**, alur disesuaikan dengan aturan masing-masing modul:
     - Contoh **Approval KPI**: `Submit -> Check -> Approval 1 -> Approval 2 -> Validate`
     - Contoh **Project Outside Job Scope**: `Approval 1 -> Approval 2`
3. **Persiapan Integrasi OTP Login (`No Telegram` & `Corporate Email`)**:
   - Kolom `No Telegram` dan `Corporate Email` dipersiapkan untuk koneksi API Telegram dan Email guna pengiriman OTP Login berdasarkan `ID Karyawan`.
4. **Wewenang Akses Data Karyawan (Data Visibility & Authorization)**:
   - Karyawan **tanpa fungsi approver** hanya dapat melihat datanya sendiri.
   - Karyawan yang **memiliki fungsi approver** (terdaftar sebagai AP1/AP2 atau approver sah) dapat melihat datanya sendiri **dan** data karyawan yang berada di dalam wewenang approval-nya, tetapi **tidak dapat** melihat data karyawan di luar wewenangnya.
5. **Setup Approval Check HR Unit Usaha**:
   - Role **Administrator** melakukan setup penugasan **Approval Check (HR Unit Usaha)** di menu **User Management** (`/hr/settings/user-management`).
6. **Setup Approval Request Khusus**:
   - Role **Administrator** melakukan setup untuk approval request khusus meliputi **Approval ICF**, **Approval Other**, dan **Delegation** (`/hr/settings/approval-management`).
7. **Setup Approval Validate HR ICF**:
   - Role **Administrator** melakukan setup **Approval Validate (HR ICF)** di **User Management**, di mana role **HR ICF memiliki hak akses/wewenang yang setara dengan Administrator**.

### 2. Setup Grouping & Akses (`SETUP GROUPING`)
1. **Mapping User Groupings & Bobot Penilaian**:
   - Role **Administrator** melakukan setup **User Groupings** untuk memetakan karyawan sesuai grup modul yang diberikan beserta bobot penilaiannya:
     - `Operasional` (Operational)
     - `Ka./Wa.Ka.Seksi`
     - `Ka./Wa.Ka.Bagian`
     - `Ka./Wa.Ka.Dept`
     - `Ka./Wa.Ka.Div ke atas`
2. **Setup Akun BOD**:
   - Role **Administrator** melakukan setup akun **BOD** untuk akses khusus.
3. **Sinkronisasi Otomatis Access Management & Menu Management**:
   - Konfigurasi pada **Access Management** (`/hr/settings/access-management`) dan **Menu Management** (`/hr/settings/menu-management`) otomatis mengikuti setup yang telah ditetapkan (Role User, Approval, dan Akses Modul).

### 3. Modul Aktivasi, Bobot Nilai, & Proporsi Grade (`MODUL AKTIVASI, BOBOT NILAI, PROPORSI GRADE`)
1. **Aktivasi Modul (`/hr/modules`)**:
   - Role **HR ICF** melakukan setup aktivasi modul di `/hr/modules`.
   - Seluruh halaman dan fitur yang berkaitan dengan aktivasi modul (seperti status/jadwal di Dashboard semua user, Cycle Management, dan halaman transaksi modul) otomatis mengikuti tanggal periode yang telah di-setup.
2. **Setup Bobot Penilaian (`/hr/settings/scores-calibration`)**:
   - Role **HR ICF** melakukan setup bobot penilaian per grup jabatan dan modul di `/hr/settings/scores-calibration`.
3. **Setup HC Awal Tahun & Proporsi Grade Distribution (`/hr/calibration/setting`)**:
   - Role **HR ICF** melakukan setup **HC Awal Tahun** dan proporsi **Grade Distribution** di `/hr/calibration/setting`.
   - Data karyawan yang telah diimpor otomatis terdistribusi dan terhitung sesuai kuota masing-masing **Divisi**, **Departement**, dan **Bagian**.

## Langkah Verifikasi
- Memastikan `AGENTS.md` dan `guidelines/Guidelines.md` tersimpan rapi dengan penomoran bagian yang jelas dan siap menerima tambahan aturan referensi berikutnya dari pengguna tanpa mengubah kode fitur sebelum diinstruksikan.
