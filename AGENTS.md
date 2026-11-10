# Performance Appraisal-Mockup v50_GitHub

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is always running on `$PORT` (default 8443). Source changes
are reflected through hot reload.

## Key Files

- `src/main.tsx` - Browser entry point
- `vite.figma.config.ts` - Figma Make wrapper configuration
- `.mise.toml` - Toolchain versions

## Project Guidelines

Read and always follow the instructions in the [project guidelines](guidelines/Guidelines.md) unless the user requests otherwise.

---

## Aturan & Referensi Proses Sistem Performance Appraisal (PA) — End-to-End

Seluruh pengembangan dan logika bisnis pada sistem Performance Appraisal (PA) wajib mengacu pada aturan proses dari awal sampai akhir berikut ini:

### I. DATA KARYAWAN DAN APPROVAL
1. **Import Excel Data Karyawan (`/hr/settings/data-sync`)**:
   - Role **Administrator** mengimpor file Excel data karyawan ke dalam sistem PA (karena untuk tahun berjalan belum terintegrasi langsung ke database & sistem approval internal unit usaha).
   - Format kolom tabel wajib:
     `No; Reg No; ID Karyawan; Nama; Divisi; Departement; Bagian; Jabatan; Joindate; No Telegram; Corporate Email; Reg No AP1; Reg No AP2; Role; Groupings`
   - Daftar **Role** sistem: `Employee`, `Supervisor`, `GM`, `HR Unit`, `HR ICF`, `Director`, `BOD`, `Administrator`.
   - Fitur import ini ditempatkan di `/hr/settings/data-sync`.
2. **Validasi Approval Berjenjang (`Reg No AP1` & `Reg No AP2`)**:
   - Kolom tabel `Reg No AP1` dan `Reg No AP2` dari file import data karyawan digunakan sebagai validasi approval berjenjang dari masing-masing karyawan.
   - Approval tersebut merupakan approval umum (**Approval 1** & **Approval 2**).
   - Untuk approval custom seperti **Check** & **Validate**, alurnya disesuaikan dengan aturan masing-masing modul:
     - Contoh **Approval KPI**: `Submit -> Check -> Approval 1 -> Approval 2 -> Validate`
     - Contoh **Project Outside Job Scope**: `Approval 1 -> Approval 2`
3. **Koneksi API OTP Login (`No Telegram` & `Corporate Email`)**:
   - Kolom `No Telegram` dan `Corporate Email` dipersiapkan untuk koneksi API Telegram dan Email guna mendapatkan **OTP Login** berdasarkan **ID Karyawan**.
4. **Wewenang Akses Data Karyawan (Data Visibility & Scope)**:
   - **Level karyawan tanpa approver**: Hanya dapat melihat datanya sendiri.
   - **Level karyawan yang memiliki fungsi approver**: Dapat melihat datanya sendiri dan data karyawan yang berada di dalam wewenangnya, tetapi **tidak bisa** melihat data karyawan di luar wewenangnya.
5. **Setup Approval Check HR Unit Usaha**:
   - Role **Administrator** melakukan setup untuk **Approval Check HR Unit Usaha** di **User Management** (`/hr/settings/user-management`).
6. **Setup Approval Request Khusus**:
   - Role **Administrator** melakukan setup untuk approval request khusus seperti **Approval ICF**, **Approval Other**, dan **Delegation** (`/hr/settings/approval-management`).
7. **Setup Approval Validate HR ICF**:
   - Role **Administrator** melakukan setup untuk **Approval Validate HR ICF** di **User Management** (`/hr/settings/user-management`), di mana role **HR ICF memiliki hak akses/role yang sama dengan Administrator**.

### II. SETUP GROUPING
1. **Mapping User Groupings & Bobot Penilaian**:
   - Role **Administrator** melakukan setup **User Groupings** untuk memetakan karyawan sesuai dengan group modul yang diberikan & bobot penilaiannya:
     - `Operasional` (Operational)
     - `Ka./Wa.Ka.Seksi`
     - `Ka./Wa.Ka.Bagian`
     - `Ka./Wa.Ka.Dept`
     - `Ka./Wa.Ka.Div ke atas`
2. **Setup Akun BOD**:
   - Role **Administrator** melakukan setup akun **BOD** untuk akses khusus.
3. **Sinkronisasi Otomatis Access Management & Menu Management**:
   - **Access Management** (`/hr/settings/access-management`) & **Menu Management** (`/hr/settings/menu-management`) otomatis mengikuti konfigurasi yang sudah di-setup (Role User, Approval, dan Akses Modul).

### III. MODUL AKTIVASI, BOBOT NILAI, PROPORSI GRADE
1. **Aktivasi Modul (`/hr/modules`)**:
   - Role **HR ICF** melakukan setup aktivasi modul di `/hr/modules`.
   - Seluruh tampilan dan proses yang berkaitan dengan aktivasi modul otomatis mengikuti tanggal (`date`) sesuai yang di-setup (seperti di Dashboard semua user, Cycle Management, dan halaman modul terkait).
2. **Setup Bobot Penilaian (`/hr/settings/scores-calibration`)**:
   - Role **HR ICF** melakukan setup bobot penilaian di `/hr/settings/scores-calibration`.
3. **Setup HC Awal Tahun & Proporsi Grade Distribution (`/hr/calibration/setting`)**:
   - Role **HR ICF** melakukan setup **HC Awal Tahun -> Proporsi Grade Distribution** di `/hr/calibration/setting`.
   - Data karyawan yang sudah diimpor otomatis terdistribusi sesuai dengan kuota per masing-masing **Divisi**, **Departement**, dan **Bagian**.

### IV. KPI BUSINESS
1. **Prasyarat Pembuatan KPI Business**:
   - KPI Business hanya bisa dibuat setelah **Bagian I, II, dan III** selesai di-setup dan wajib memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).
2. **Jenis KPI Business**:
   - KPI Business ada 2, yaitu: **KPI Group** dan **KPI Unit**.
3. **Entitas RSUP Group**:
   - `PT RSUP (Industry)`, `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD` adalah PT yang tergabung dalam **RSUP Group**.
4. **Pembuat KPI Group**:
   - Untuk **RSUP Group**, yang membuat **KPI Group**-nya adalah **Direktur Operasional** yang berada di `PT RSUP (Industry)`.
5. **Pembuat KPI Unit**:
   - Yang membuat **KPI Unit**-nya adalah masing-masing **GM** dari `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD`.
6. **Validasi KPI Group untuk Pembuatan KPI Unit & Checklist Paralel (`/hr/modules`)**:
   - **KPI Unit** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).
7. **Pengambilan & Penyesuaian Isi KPI Group oleh KPI Unit**:
   - **KPI Unit** dapat mengambil isi KPI dari **KPI Group** dan dapat disesuaikan oleh **GM** dari unit masing-masing.
8. **Otorisasi Pengisi Tracking KPI Business**:
   - Yang mengisi tracking pada **KPI Business** adalah orang yang di-*allow* atau di-setup oleh **Administrator** atau **HR ICF**.
9. **Cascading Nilai Tracking dari KPI Unit ke KPI Group**:
   - Tracking **KPI Group** memungkinkan untuk mengambil *value* dari indikator **KPI Unit** karena beberapa indikator **KPI Unit** merupakan turunan dari **KPI Group** (*CASCADING*).
10. **Auto-Create ke KPI Tracking saat Validated**:
    - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

### V. KPI INDIVIDU
1. **KPI Individu Level Direktur**:
   - **KPI Individu level Direktur** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated**.
2. **KPI Individu Level GM**:
   - **KPI Individu level GM** hanya bisa dibuat jika **KPI Unit** & **KPI Individu level Direktur** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).
3. **KPI Individu Level Divisi**:
   - **KPI Individu level Divisi** hanya bisa dibuat jika **KPI Individu level GM** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).
4. **KPI Individu Level Departemen ke Bawah**:
   - **KPI Individu level Departemen ke bawah** hanya bisa dibuat jika **KPI Individu level Divisi** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).
5. **Auto-Create ke KPI Tracking saat Validated**:
   - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

### VI. SMART GOALS
1. **Jumlah Minimal Goal RSUP Group**:
   - SMART Goals untuk **RSUP Group** adalah minimal **3 Goal**.
2. **Urutan Pembuatan & Tanggal Modul Aktivasi**:
   - SMART Goals untuk semua level dapat dibuat secara paralel atau lebih dulu dibuat dari KPI, namun tetap wajib memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).
3. **Auto-Create ke SMART Goals Measurement saat Validated**:
   - SMART Goals dengan status **Validated** otomatis ter-*create* di **Measurement -> SMART Goals** dengan format **SMART Goals Measurement**.

### VII. RCA
1. **Pemicu Kemunculan RCA**:
   - Pemicu RCA muncul berdasarkan *rule* **KPI Tracking** yang sudah dibuat.
2. **Akses Pembuatan RCA**:
   - RCA bisa langsung dibuat melalui **tag RCA di KPI Tracking** ataupun di sub-menu **RCA Measurement**.
3. **Batas Submit RCA**:
   - Batas Submit RCA sama dengan jadwal **KPI Measurement** yang di-setup di **Module Activation** (`/hr/modules`).

### VIII. APPRAISAL FORM
1. **Jadwal Pengisian Appraisal Form**:
   - **Appraisal Form** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### IX. MANAGERIAL SKILL
1. **Jadwal Pengisian Managerial Skill**:
   - **Managerial Skill** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### X. PROJECT OUTSIDE JOB SCOPE
1. **Upload/Import Data & Otomatis Masuk Approval**:
   - Data **Project Outside Job Scope** di-upload/import oleh **Administrator** atau **HR ICF** dan otomatis masuk ke proses approval.
2. **Jadwal Proses Approval**:
   - Proses approval hanya bisa dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### XI. INTER-DEPARTEMENT FEEDBACK
1. **Tanpa Bobot Nilai**:
   - **Inter-Departement Feedback** tidak memiliki bobot.
2. **Jadwal Pemilihan Pemberi Feedback & Pengisian Feedback**:
   - Pilih pemberi feedback dan pengisian feedback dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

### XII. HR UNIT USAHA
1. **Peran Ganda HR Unit sebagai Karyawan & Approval Checker**:
   - Role **HR Unit** adalah karyawan dari departemen HR dari masing-masing unit usaha yang ditunjuk sebagai **Checker**, di mana memiliki peran tambahan sebagai **Approval Checker** untuk **KPI & SMART Goals** sehingga selain modul yang diberi akses berdasarkan jabatan dan *user groupings* juga perlu ada **Menu Approval** pada login-nya.
2. **Bypass Tahap Checker untuk Pengajuan Milik HR Unit Sendiri**:
   - **HR Unit** yang ditunjuk sebagai Checker **tidak bisa melakukan Checker pada pengajuan KPI & SMART Goals-nya sendiri**, sehingga pengajuannya langsung masuk ke approval selanjutnya (**Approval 1**, dst.).
