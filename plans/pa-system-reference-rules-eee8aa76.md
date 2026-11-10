# Rencana Penyimpanan Aturan & Referensi Proses Performance Appraisal (PA) di `AGENTS.md` & `guidelines/Guidelines.md`

## Tujuan
Menyimpan aturan bisnis dan referensi alur kerja (end-to-end process) sistem Performance Appraisal (PA) ke dalam `AGENTS.md` dan `guidelines/Guidelines.md` sebagai sumber kebenaran (*single source of truth*) yang selalu dibaca oleh agen sebelum merancang atau mengimplementasikan perubahan. Struktur dokumen disiapkan secara modular agar dapat terus dilengkapi dengan aturan referensi lanjutan dari pengguna.

## File yang Akan Diperbarui
1. `AGENTS.md` — Menambahkan bagian **Aturan & Referensi Proses Sistem Performance Appraisal (PA)** secara lengkap dan merujuk ke `guidelines/Guidelines.md`.
2. `guidelines/Guidelines.md` — Menyimpan dokumentasi terstruktur untuk seluruh aturan referensi proses PA dari awal hingga akhir.

## Rincian Aturan yang Disimpan (Bagian I s.d. Bagian XII)

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

### 4. Bagian IV — KPI BUSINESS (`KPI BUSINESS`)
1. **Prasyarat Pembuatan KPI Business**:
   - KPI Business hanya bisa dibuat setelah **Bagian I, II, dan III** selesai di-setup serta wajib memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).
2. **Jenis KPI Business**:
   - KPI Business terdiri dari 2 (dua) jenis, yaitu: **KPI Group** dan **KPI Unit**.
3. **Entitas RSUP Group**:
   - `PT RSUP (Industry)`, `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD` adalah perusahaan (PT) yang tergabung dalam **RSUP Group**.
4. **Pembuat KPI Group**:
   - Untuk **RSUP Group**, yang membuat **KPI Group**-nya adalah **Direktur Operasional** yang berada di `PT RSUP (Industry)`.
5. **Pembuat KPI Unit**:
   - Yang membuat **KPI Unit** adalah masing-masing **GM** dari `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD`.
6. **Ketergantungan Status Validated & Checklist Paralel (`/hr/modules`)**:
   - **KPI Unit** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated** (dilengkapi dengan **checklist validasinya di `/hr/modules`** karena khusus tahun berjalan pembuatan KPI dapat dilakukan secara paralel dan tidak harus berurutan).
7. **Cascading / Adopsi KPI Group ke KPI Unit**:
   - **KPI Unit** dapat mengambil isi KPI dari **KPI Group** dan dapat disesuaikan oleh **GM** dari unit masing-masing.
8. **Otorisasi Pengisi Tracking KPI Business**:
   - Yang mengisi tracking pada **KPI Business** adalah personel yang di-*allow* atau di-setup oleh **Administrator** atau **HR ICF**.
9. **Cascading Nilai Tracking dari KPI Unit ke KPI Group**:
   - Tracking **KPI Group** memungkinkan untuk mengambil nilai (*value*) dari indikator **KPI Unit** karena beberapa indikator **KPI Unit** merupakan turunan dari **KPI Group** (*CASCADING*).
10. **Auto-Create ke KPI Tracking saat Validated**:
    - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

### 5. Bagian V — KPI INDIVIDU (`KPI INDIVIDU`)
1. **KPI Individu Level Direktur**:
   - **KPI Individu level Direktur** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated**.
2. **KPI Individu Level GM**:
   - **KPI Individu level GM** hanya bisa dibuat jika **KPI Unit** & **KPI Individu level Direktur** sudah berstatus **Validated** (dilengkapi dengan **checklist validasinya di `/hr/modules`** karena khusus tahun berjalan pembuatan KPI dapat dilakukan secara paralel dan tidak harus berurutan).
3. **KPI Individu Level Divisi**:
   - **KPI Individu level Divisi** hanya bisa dibuat jika **KPI Individu level GM** sudah berstatus **Validated** (dilengkapi dengan **checklist validasinya di `/hr/modules`** karena khusus tahun berjalan pembuatan KPI dapat dilakukan secara paralel dan tidak harus berurutan).
4. **KPI Individu Level Departemen ke Bawah**:
   - **KPI Individu level Departemen ke bawah** hanya bisa dibuat jika **KPI Individu level Divisi** sudah berstatus **Validated** (dilengkapi dengan **checklist validasinya di `/hr/modules`** karena khusus tahun berjalan pembuatan KPI dapat dilakukan secara paralel dan tidak harus berurutan).
5. **Auto-Create ke KPI Tracking saat Validated**:
   - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

### 6. Bagian VI — SMART GOALS (`SMART GOALS`)
1. **Jumlah Minimal Goal RSUP Group**:
   - SMART Goals untuk **RSUP Group** adalah minimal **3 Goal**.
2. **Fleksibilitas Urutan Pembuatan & Tanggal Aktivasi**:
   - SMART Goals untuk semua level dapat dibuat secara **paralel** atau **lebih dulu dibuat dari KPI**, namun tetap wajib memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).
3. **Auto-Create ke SMART Goals Measurement saat Validated**:
   - SMART Goals dengan status **Validated** otomatis ter-*create* di **Measurement -> SMART Goals** dengan format **SMART Goals Measurement**.

### 7. Bagian VII — RCA (`RCA`)
1. **Pemicu Kemunculan RCA**:
   - Pemicu RCA muncul berdasarkan *rule* **KPI Tracking** yang sudah dibuat.
2. **Akses Pembuatan RCA**:
   - RCA bisa langsung dibuat melalui **tag RCA di KPI Tracking** ataupun melalui sub-menu **RCA Measurement**.
3. **Batas Waktu Submit RCA**:
   - Batas Submit RCA sama dengan jadwal **KPI Measurement** yang di-setup di **Module Activation** (`/hr/modules`).

### 8. Bagian VIII — APPRAISAL FORM (`APPRAISAL FORM`)
1. **Jadwal Pengisian Appraisal Form**:
   - **Appraisal Form** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### 9. Bagian IX — MANAGERIAL SKILL (`MANAGERIAL SKILL`)
1. **Jadwal Pengisian Managerial Skill**:
   - **Managerial Skill** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### 10. Bagian X — PROJECT OUTSIDE JOB SCOPE (`PROJECT OUTSIDE JOB SCOPE`)
1. **Upload/Import Data & Otomatis Masuk Approval**:
   - Data **Project Outside Job Scope** di-upload/import oleh **Administrator** atau **HR ICF** dan otomatis masuk ke proses approval.
2. **Jadwal Proses Approval**:
   - Proses approval hanya bisa dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### 11. Bagian XI — INTER-DEPARTEMENT FEEDBACK (`INTER-DEPARTEMENT FEEDBACK`)
1. **Tanpa Bobot Nilai**:
   - **Inter-Departement Feedback** tidak memiliki bobot penilaian.
2. **Jadwal Pemilihan Pemberi Feedback & Pengisian Feedback**:
   - Pemilihan pemberi feedback dan pengisian feedback dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### 12. Bagian XII — HR UNIT USAHA (`HR UNIT USAHA`)
1. **Peran Ganda HR Unit sebagai Karyawan & Approval Checker**:
   - Role **HR Unit** adalah karyawan dari departemen HR dari masing-masing unit usaha yang ditunjuk sebagai **Checker**, di mana memiliki peran tambahan sebagai **Approval Checker** untuk **KPI & SMART Goals**.
   - Oleh karena itu, selain modul yang diberi akses berdasarkan **Jabatan** dan **User Groupings**, juga wajib tersedia **Menu Approval** pada login-nya.
2. **Bypass Tahap Checker untuk Pengajuan Milik HR Unit Sendiri**:
   - **HR Unit** yang ditunjuk sebagai Checker **tidak bisa melakukan Checker pada pengajuan KPI & SMART Goals miliknya sendiri**, sehingga pengajuan miliknya langsung masuk ke tahap approval selanjutnya (**Approval 1**, dst.).

## Langkah Verifikasi
- Memastikan `AGENTS.md` dan `guidelines/Guidelines.md` tersimpan rapi dengan penomoran bagian yang jelas dan siap menerima tambahan aturan referensi berikutnya dari pengguna tanpa mengubah kode fitur sebelum diinstruksikan.
