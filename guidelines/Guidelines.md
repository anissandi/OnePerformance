# Aturan & Referensi Proses Sistem Performance Appraisal (PA)

Dokumen ini adalah acuan utama (*Single Source of Truth*) untuk alur kerja dan aturan bisnis dari awal sampai akhir pada sistem Performance Appraisal (PA).

---

## I. DATA KARYAWAN DAN APPROVAL

1. **Import Excel Data Karyawan (`/hr/settings/data-sync`)**
   - Role **Administrator** melakukan import Excel data karyawan ke dalam sistem PA.
   - Format kolom tabel wajib:
     `No; Reg No; ID Karyawan; Nama; Divisi; Departement; Bagian; Jabatan; Joindate; No Telegram; Corporate Email; Reg No AP1; Reg No AP2`
   - Fitur ini berada di `/hr/settings/data-sync` karena untuk tahun berjalan belum terintegrasi langsung ke database & sistem approval internal unit usaha.

2. **Validasi Approval Berjenjang (`Reg No AP1` & `Reg No AP2`)**
   - Kolom tabel `Reg No AP1` dan `Reg No AP2` dari file import data karyawan menjadi dasar validasi approval berjenjang untuk masing-masing karyawan.
   - Approval tersebut merupakan approval umum (**Approval 1** & **Approval 2**).
   - Untuk approval custom seperti **Check** & **Validate**, alurnya disesuaikan dengan aturan masing-masing modul:
     - **Approval KPI**: `Submit -> Check -> Approval 1 -> Approval 2 -> Validate`
     - **Project Outside Job Scope**: `Approval 1 -> Approval 2`

3. **Koneksi API OTP Login (`No Telegram` & `Corporate Email`)**
   - Kolom `No Telegram` dan `Corporate Email` dipersiapkan untuk koneksi API Telegram dan Email guna mendapatkan **OTP Login** berdasarkan **ID Karyawan**.

4. **Aturan Wewenang Akses Data Karyawan**
   - **Level karyawan tanpa approver**: Hanya dapat melihat datanya sendiri.
   - **Level karyawan yang memiliki fungsi approver**: Dapat melihat datanya sendiri dan data karyawan yang berada di dalam wewenangnya, namun **tidak bisa** melihat data karyawan di luar wewenangnya.

5. **Setup Approval Check HR Unit Usaha**
   - Role **Administrator** melakukan setup untuk **Approval Check HR Unit Usaha** di **User Management** (`/hr/settings/user-management`).

6. **Setup Approval Request Khusus**
   - Role **Administrator** melakukan setup untuk approval request khusus seperti **Approval ICF**, **Approval Other**, dan **Delegation** (`/hr/settings/approval-management`).

7. **Setup Approval Validate HR ICF**
   - Role **Administrator** melakukan setup untuk **Approval Validate HR ICF** di **User Management** (`/hr/settings/user-management`), di mana role **HR ICF sama dengan Administrator**.

---

## II. SETUP GROUPING

1. **Mapping User Groupings & Bobot Penilaian**
   - Role **Administrator** melakukan setup **User Groupings** untuk memetakan karyawan sesuai dengan group modul yang diberikan & bobot penilaiannya:
     - `Operasional` (Operational)
     - `Ka./Wa.Ka.Seksi`
     - `Ka./Wa.Ka.Bagian`
     - `Ka./Wa.Ka.Dept`
     - `Ka./Wa.Ka.Div ke atas`

2. **Setup Akun BOD**
   - Role **Administrator** melakukan setup akun **BOD** untuk akses khusus.

3. **Sinkronisasi Otomatis Access Management & Menu Management**
   - **Access Management** (`/hr/settings/access-management`) & **Menu Management** (`/hr/settings/menu-management`) otomatis mengikuti konfigurasi yang sudah di-setup (Role User, Approval, dan Akses Modul).

---

## III. MODUL AKTIVASI, BOBOT NILAI, PROPORSI GRADE

1. **Aktivasi Modul (`/hr/modules`)**
   - Role **HR ICF** melakukan setup aktivasi modul di `/hr/modules`.
   - Otomatis seluruh fitur yang berkaitan dengan aktivasi modul mengikuti tanggal (`date`) sesuai yang di-setup (seperti yang ada di Dashboard semua user, Cycle Management, dll.).

2. **Setup Bobot Penilaian (`/hr/settings/scores-calibration`)**
   - Role **HR ICF** melakukan setup bobot penilaian di `/hr/settings/scores-calibration`.

3. **Setup HC Awal Tahun & Proporsi Grade Distribution (`/hr/calibration/setting`)**
   - Role **HR ICF** melakukan setup **HC Awal Tahun -> Proporsi Grade Distribution** di `/hr/calibration/setting`.
   - Otomatis data karyawan yang sudah diimpor terdistribusi sesuai dengan kuota per masing-masing **Divisi**, **Departement**, dan **Bagian**.

---

## IV. KPI BUSINESS

1. **Prasyarat Pembuatan KPI Business**
   - KPI Business hanya bisa dibuat setelah **Bagian I, II, dan III** selesai di-setup dan wajib memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).

2. **Jenis KPI Business**
   - KPI Business ada 2, yaitu: **KPI Group** & **KPI Unit**.

3. **Entitas RSUP Group**
   - `PT RSUP (Industry)`, `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD` adalah PT yang tergabung dalam **RSUP Group**.

4. **Pembuat KPI Group**
   - Untuk **RSUP Group**, yang membuat **KPI Group**-nya adalah **Direktur Operasional** yang berada di `PT RSUP (Industry)`.

5. **Pembuat KPI Unit**
   - Yang membuat **KPI Unit**-nya adalah masing-masing **GM** dari `PT RSUP (Perkebunan)`, `PT RSTM`, `PT GHS`, dan `ASD`.

6. **Validasi KPI Group untuk Pembuatan KPI Unit & Checklist Paralel (`/hr/modules`)**
   - **KPI Unit** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).

7. **Pengambilan & Penyesuaian Isi KPI Group oleh KPI Unit**
   - **KPI Unit** dapat mengambil isi KPI dari **KPI Group** dan dapat disesuaikan oleh **GM** dari unit masing-masing.

8. **Otorisasi Pengisi Tracking KPI Business**
   - **KPI Business** yang mengisi tracking-nya adalah orang yang di-*allow* atau di-setup oleh **Administrator** atau **HR ICF**.

9. **Cascading Nilai Tracking dari KPI Unit ke KPI Group**
   - Tracking **KPI Group** memungkinkan untuk mengambil *value* dari indikator **KPI Unit** karena beberapa indikator **KPI Unit** merupakan turunan dari **KPI Group** (*CASCADING*).

10. **Auto-Create ke KPI Tracking saat Validated**
    - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

---

## V. KPI INDIVIDU

1. **KPI Individu Level Direktur**
   - **KPI Individu level Direktur** hanya bisa dibuat jika **KPI Group** sudah berstatus **Validated**.

2. **KPI Individu Level GM**
   - **KPI Individu level GM** hanya bisa dibuat jika **KPI Unit** & **KPI Individu level Direktur** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).

3. **KPI Individu Level Divisi**
   - **KPI Individu level Divisi** hanya bisa dibuat jika **KPI Individu level GM** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).

4. **KPI Individu Level Departemen ke Bawah**
   - **KPI Individu level Departemen ke bawah** hanya bisa dibuat jika **KPI Individu level Divisi** sudah berstatus **Validated** (dibuatkan checklist validasinya di `/hr/modules` karena khusus tahun ini bisa membuat KPI secara paralel dan tidak harus berurutan).

5. **Auto-Create ke KPI Tracking saat Validated**
   - KPI dengan status **Validated** otomatis ter-*create* di bagian **Measurement -> KPI Tracking** dengan format Tracking.

---

## VI. SMART GOALS

1. **Jumlah Minimal Goal RSUP Group**
   - SMART Goals untuk **RSUP Group** adalah minimal **3 Goal**.

2. **Urutan Pembuatan & Tanggal Modul Aktivasi**
   - SMART Goals untuk semua level dapat dibuat secara paralel atau lebih dulu dibuat dari KPI, namun tetap memperhatikan tanggal (`date`) **Modul Aktivasi** (`/hr/modules`).

3. **Auto-Create ke SMART Goals Measurement saat Validated**
   - SMART Goals dengan status **Validated** otomatis ter-*create* di **Measurement -> SMART Goals** dengan format **SMART Goals Measurement**.

---

## VII. RCA

1. **Pemicu Kemunculan RCA**
   - Pemicu RCA muncul berdasarkan *rule* **KPI Tracking** yang sudah dibuat.

2. **Akses Pembuatan RCA**
   - RCA bisa langsung dibuat melalui **tag RCA di KPI Tracking** ataupun di sub-menu **RCA Measurement**.

3. **Batas Submit RCA**
   - Batas Submit RCA sama dengan jadwal **KPI Measurement** yang di-setup di **Module Activation** (`/hr/modules`).

---

## VIII. APPRAISAL FORM

1. **Jadwal Pengisian Appraisal Form**
   - **Appraisal Form** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

---

## IX. MANAGERIAL SKILL

1. **Jadwal Pengisian Managerial Skill**
   - **Managerial Skill** hanya bisa diisi berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

---

## X. PROJECT OUTSIDE JOB SCOPE

1. **Upload/Import Data & Otomatis Masuk Approval**
   - Data **Project Outside Job Scope** di-upload/import oleh **Administrator** atau **HR ICF** dan otomatis masuk ke proses approval.

2. **Jadwal Proses Approval**
   - Proses approval hanya bisa dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

---

## XI. INTER-DEPARTEMENT FEEDBACK

1. **Tanpa Bobot Nilai**
   - **Inter-Departement Feedback** tidak memiliki bobot.

2. **Jadwal Pemilihan Pemberi Feedback & Pengisian Feedback**
   - Pilih pemberi feedback dan pengisian feedback dilakukan berdasarkan tanggal (`date`) **Module Activation** yang di-setup di `/hr/modules`.

---

## XII. HR UNIT USAHA

1. **Peran Ganda HR Unit sebagai Karyawan & Approval Checker**
   - Role **HR Unit** adalah karyawan dari departemen HR dari masing-masing unit usaha yang ditunjuk sebagai **Checker**, di mana memiliki peran tambahan sebagai **Approval Checker** untuk **KPI & SMART Goals** sehingga selain modul yang diberi akses berdasarkan jabatan dan *user groupings* juga perlu ada **Menu Approval** pada login-nya.

2. **Bypass Tahap Checker untuk Pengajuan Milik HR Unit Sendiri**
   - **HR Unit** yang ditunjuk sebagai Checker **tidak bisa melakukan Checker pada pengajuan KPI & SMART Goals-nya sendiri**, sehingga pengajuannya langsung masuk ke approval selanjutnya (**Approval 1**, dst.).

<!--
System Guidelines

Use this file to provide the AI with rules and guidelines you want it to follow.
This template outlines a few examples of things you can add. You can add your own sections and format it to suit your needs

TIP: More context isn't always better. It can confuse the LLM. Try and add the most important rules you need

# General guidelines

Any general rules you want the AI to follow.
For example:

* Only use absolute positioning when necessary. Opt for responsive and well structured layouts that use flexbox and grid by default
* Refactor code as you go to keep code clean
* Keep file sizes small and put helper functions and components in their own files.

--------------

# Design system guidelines
Rules for how the AI should make generations look like your company's design system

Additionally, if you select a design system to use in the prompt box, you can reference
your design system's components, tokens, variables and components.
For example:

* Use a base font-size of 14px
* Date formats should always be in the format “Jun 10”
* The bottom toolbar should only ever have a maximum of 4 items
* Never use the floating action button with the bottom toolbar
* Chips should always come in sets of 3 or more
* Don't use a dropdown if there are 2 or fewer options

You can also create sub sections and add more specific details
For example:


## Button
The Button component is a fundamental interactive element in our design system, designed to trigger actions or navigate
users through the application. It provides visual feedback and clear affordances to enhance user experience.

### Usage
Buttons should be used for important actions that users need to take, such as form submissions, confirming choices,
or initiating processes. They communicate interactivity and should have clear, action-oriented labels.

### Variants
* Primary Button
  * Purpose : Used for the main action in a section or page
  * Visual Style : Bold, filled with the primary brand color
  * Usage : One primary button per section to guide users toward the most important action
* Secondary Button
  * Purpose : Used for alternative or supporting actions
  * Visual Style : Outlined with the primary color, transparent background
  * Usage : Can appear alongside a primary button for less important actions
* Tertiary Button
  * Purpose : Used for the least important actions
  * Visual Style : Text-only with no border, using primary color
  * Usage : For actions that should be available but not emphasized
-->
