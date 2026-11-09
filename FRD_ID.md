# Dokumen Kebutuhan Fungsional (Functional Requirements Document)
## Performance Appraisal Hub — Sambu Group
### Versi Detail untuk Tim Development

| Kolom | Nilai |
|---|---|
| Versi Dokumen | 1.0 |
| Status | Draft |
| Tanggal | September 2026 |
| Produk | Performance Appraisal Hub |
| Organisasi | Sambu Group |
| Referensi | PRD_ID.md v2.0 |

---

## Daftar Isi

1. [Pendahuluan & Konvensi Dokumen](#1-pendahuluan--konvensi-dokumen)
2. [Gambaran Sistem](#2-gambaran-sistem)
3. [FR-AUTH — Autentikasi & Sesi](#3-fr-auth--autentikasi--sesi)
4. [FR-SHELL — Shell Aplikasi (Layout, Sidebar, Topbar)](#4-fr-shell--shell-aplikasi)
5. [FR-SEARCH — Pencarian Global](#5-fr-search--pencarian-global)
6. [FR-NOTIF — Notifikasi](#6-fr-notif--notifikasi)
7. [FR-KPIS — KPI Setting](#7-fr-kpis--kpi-setting)
8. [FR-KPIT — KPI Tracking](#8-fr-kpit--kpi-tracking)
9. [FR-RCA — Root Cause Analysis](#9-fr-rca--root-cause-analysis)
10. [FR-SG — SMART Goals](#10-fr-sg--smart-goals)
11. [FR-SGC — SMART Goals Check-In](#11-fr-sgc--smart-goals-check-in)
12. [FR-AF — Appraisal Form](#12-fr-af--appraisal-form)
13. [FR-MS — Managerial Skill](#13-fr-ms--managerial-skill)
14. [FR-MI — Management Interview](#14-fr-mi--management-interview)
15. [FR-PO — Project Outside Job Scope](#15-fr-po--project-outside-job-scope)
16. [FR-PC — Project Check-In](#16-fr-pc--project-check-in)
17. [FR-APR — Sistem Persetujuan (Approvals)](#17-fr-apr--sistem-persetujuan)
18. [FR-OL — Open Lock (Buka Kunci)](#18-fr-ol--open-lock)
19. [FR-DASH-EMP — Dashboard Karyawan](#19-fr-dash-emp--dashboard-karyawan)
20. [FR-DASH-SUP — Dashboard Supervisor](#20-fr-dash-sup--dashboard-supervisor)
21. [FR-DASH-HR — Analytics Dashboard HR](#21-fr-dash-hr--analytics-dashboard-hr)
22. [FR-MON — Modul Monitoring](#22-fr-mon--modul-monitoring)
23. [FR-CAL — Kalibrasi](#23-fr-cal--kalibrasi)
24. [FR-SUM — Ringkasan Penilaian Kinerja](#24-fr-sum--ringkasan-penilaian-kinerja)
25. [FR-EV — Manajemen Bukti (Evidence)](#25-fr-ev--manajemen-bukti)
26. [FR-MOD — Aktivasi Modul](#26-fr-mod--aktivasi-modul)
27. [FR-USR — Manajemen Pengguna](#27-fr-usr--manajemen-pengguna)
28. [FR-ACC — Manajemen Akses (RBAC)](#28-fr-acc--manajemen-akses-rbac)
29. [FR-MENU — Manajemen Menu](#29-fr-menu--manajemen-menu)
30. [FR-MASTER — Master Data](#30-fr-master--master-data)
31. [FR-SYNC — Sinkronisasi Data](#31-fr-sync--sinkronisasi-data)
32. [FR-AUDIT — Audit Trail](#32-fr-audit--audit-trail)
33. [FR-PROF — Profil Karyawan](#33-fr-prof--profil-karyawan)
34. [FR-DOC — Halaman Dokumen](#34-fr-doc--halaman-dokumen)
35. [FR-SCORE — Model Penilaian & Kalkulasi](#35-fr-score--model-penilaian--kalkulasi)
36. [Kebutuhan Data Interface](#36-kebutuhan-data-interface)
37. [Kebutuhan Non-Fungsional Teknis](#37-kebutuhan-non-fungsional-teknis)
38. [Matriks Kebutuhan × Peran](#38-matriks-kebutuhan--peran)

---

## 1. Pendahuluan & Konvensi Dokumen

### 1.1 Tujuan
Dokumen ini mendefinisikan kebutuhan fungsional lengkap untuk sistem **Performance Appraisal Hub** Sambu Group. Setiap kebutuhan fungsional (FR) menggambarkan perilaku yang harus dimiliki sistem dari sudut pandang pengguna akhir dan tim development.

### 1.2 Konvensi Penomoran

```
FR-[MODUL]-[NNN]
  │         └── Nomor urut 3 digit
  └── Kode modul (lihat §1.3)

Contoh: FR-KPIT-001 = Functional Requirement KPI Tracking nomor 1
```

### 1.3 Kode Modul

| Kode | Nama Modul |
|---|---|
| AUTH | Autentikasi & Sesi |
| SHELL | Shell Aplikasi (Layout, Sidebar, Topbar) |
| SEARCH | Pencarian Global |
| NOTIF | Notifikasi |
| KPIS | KPI Setting |
| KPIT | KPI Tracking |
| RCA | Root Cause Analysis |
| SG | SMART Goals |
| SGC | SMART Goals Check-In |
| AF | Appraisal Form |
| MS | Managerial Skill |
| MI | Management Interview |
| PO | Project Outside Job Scope |
| PC | Project Check-In |
| APR | Sistem Persetujuan |
| OL | Open Lock |
| DASH-EMP | Dashboard Karyawan |
| DASH-SUP | Dashboard Supervisor |
| DASH-HR | Analytics Dashboard HR |
| MON | Modul Monitoring |
| CAL | Kalibrasi |
| SUM | Ringkasan Penilaian |
| EV | Manajemen Bukti |
| MOD | Aktivasi Modul |
| USR | Manajemen Pengguna |
| ACC | Manajemen Akses |
| MENU | Manajemen Menu |
| MASTER | Master Data |
| SYNC | Sinkronisasi Data |
| AUDIT | Audit Trail |
| PROF | Profil Karyawan |
| DOC | Halaman Dokumen |
| SCORE | Model Penilaian & Kalkulasi |

### 1.4 Level Prioritas

| Label | Arti |
|---|---|
| **[WAJIB]** | Sistem tidak dapat berfungsi tanpanya |
| **[PENTING]** | Diperlukan untuk penggunaan normal |
| **[OPSIONAL]** | Nilai tambah; dapat ditunda ke versi berikutnya |

### 1.5 Peran yang Direferensikan

- **EMP** = Karyawan (Employee)
- **SUP** = Supervisor (Approver 1)
- **HR** = Administrator HR (Approver 2)

---

## 2. Gambaran Sistem

### 2.1 Diagram Alur Sistem Tingkat Tinggi

```
┌──────────────┐    OTP      ┌──────────────┐   Pilih Peran   ┌─────────────┐
│  Login Page  │ ─────────► │ OTP Verified │ ──────────────► │ Role Select │
└──────────────┘            └──────────────┘                  └──────┬──────┘
                                                                      │
                    ┌─────────────────────────────────────────────────┤
                    │                    │                             │
               /employee            /supervisor                     /hr
                    │                    │                             │
           ┌────────▼───┐      ┌────────▼────┐              ┌────────▼────┐
           │  Portal    │      │   Portal    │              │   Portal   │
           │ Karyawan   │      │ Supervisor  │              │ HR Admin   │
           └─────┬──────┘      └──────┬──────┘              └─────┬──────┘
                 │                    │                             │
         ┌───────▼──────┐    ┌────────▼──────┐           ┌────────▼──────┐
         │  Dashboard   │    │  Dashboard    │           │  Analytics   │
         │  4 Tahap     │    │  My+Approval  │           │  Dashboard   │
         └──────┬───────┘    └───────┬───────┘           └──────┬───────┘
                │                   │                            │
    ┌───────────▼──┐     ┌──────────▼────┐          ┌──────────▼────┐
    │ KPI Tracking │     │ Approvals      │          │ Approvals      │
    │ RCA          │     │ Monitoring x6  │          │ Monitoring x6  │
    │ SMART Goals  │     │ KPI Setting    │          │ Calibration    │
    │ Appraisal    │     │ SMART Goals CK │          │ Open Lock      │
    │ Project OJS  │     │ Managerial Sk  │          │ Settings       │
    └──────────────┘     │ Mgmt Interview │          │ Master Data    │
                         └───────────────┘          └───────────────┘
```

### 2.2 Siklus Penilaian & Tahapan

```
TAHAP 1: SETTING          TAHAP 2: MEASUREMENT        TAHAP 3: EVALUATION       TAHAP 4: DIALOGUE
(Jan-Feb 2026)            (Mar-Jul 2026)               (Agu-Okt 2026)            (Nov-Des 2026)
─────────────────────     ──────────────────────────   ──────────────────────    ─────────────────
• KPI Setting             • KPI Tracking (bulanan)     • Managerial Skill        • Kalibrasi Nilai
• SMART Goals             • RCA (jika <80%)            • Management Interview    • Penyesuaian
• Goal Setting            • SMART Goals Check-In       • Appraisal Form Final    • Dialog Akhir
• Appraisal Form Setup    • Project Check-In           • Project Final           • Penetapan Grade
• Project Registration    • Appraisal Form Draft
```

### 2.3 Rantai Persetujuan

```
KARYAWAN ──submit──► APPROVER 1 (Supervisor) ──approve──► APPROVER 2 (HR) ──validate──► SELESAI
            │                   │                               │
            │                   └──revisi──► kembali ke EMP     └──revisi──► kembali ke EMP
            │
            └──(pasca-deadline)──► Open Lock Request ──► HR Admin ──approve/reject──►
```

---

## 3. FR-AUTH — Autentikasi & Sesi

### 3.1 Halaman Login

**FR-AUTH-001** [WAJIB] Sistem HARUS menampilkan halaman login di URL `/login` yang dapat diakses tanpa autentikasi.

**FR-AUTH-002** [WAJIB] Halaman login HARUS memiliki elemen berikut dalam urutan tampilan dari atas ke bawah:
1. Logo perusahaan (kiri atas, terhubung ke `sambu_group.png.png`)
2. Judul "Welcome to Performance Appraisal Hub"
3. Sub-judul tagline (teks sekunder)
4. Dropdown pemilih unit perusahaan
5. Input teks Employee ID
6. Tombol "SEND OTP TELEGRAM / EMAIL"
7. Input OTP (tersembunyi sampai OTP berhasil dikirim)
8. Tombol "Login"
9. Teks copyright footer

**FR-AUTH-003** [WAJIB] Dropdown Unit Perusahaan HARUS menampilkan 8 opsi:
- PT RSUP (Industry) — kode: RSUP-IND
- PT RSUP (Perkebunan) — kode: RSUP-PKB
- PT Pulau Sambu (Jakarta) — kode: PS-JKT
- PT Pulau Sambu (Guntung) — kode: PS-GTG
- PT Pulau Sambu (Kuala Enok) — kode: PS-KE
- PT RSTM — kode: RSTM
- PT GHS — kode: GHS
- PT ASD — kode: ASD

*Format tiap opsi: kode singkat (bold) + nama lengkap (12px, abu-abu)*

**FR-AUTH-004** [WAJIB] Tombol "SEND OTP" HARUS dinonaktifkan (`disabled`) selama field Employee ID kosong atau hanya mengandung spasi.

**FR-AUTH-005** [WAJIB] Saat tombol "SEND OTP" diklik dengan Employee ID terisi, sistem HARUS:
1. Menampilkan label tombol berubah menjadi "MENGIRIM..." selama 800ms
2. Setelah 800ms: mengunci field Employee ID (state: `disabled`) sehingga tidak dapat diubah
3. Menampilkan field input OTP dengan transisi CSS:
   - Dari: `max-height: 0; overflow: hidden; opacity: 0`
   - Ke: `max-height: 96px; opacity: 1` (durasi 300ms)
4. Mem-focus otomatis pada field input OTP (`autoFocus`)

**FR-AUTH-006** [WAJIB] Input OTP HARUS memiliki atribut berikut:
- Tipe: text
- Panjang maksimum: 6 karakter
- Font: monospace
- Letter-spacing: `tracking-widest`
- Placeholder: "Masukkan kode OTP"

**FR-AUTH-007** [WAJIB] Tombol "Login" HARUS dinonaktifkan selama field OTP kosong atau hanya mengandung spasi.

**FR-AUTH-008** [WAJIB] Saat tombol "Login" diklik dengan OTP terisi, sistem HARUS menavigasi pengguna ke halaman Pemilih Peran (`/`).

**FR-AUTH-009** [WAJIB] Jika pengguna belum login dan mencoba mengakses URL yang dilindungi, sistem HARUS mengarahkan ke `/login`.

### 3.2 Pemilih Peran

**FR-AUTH-010** [WAJIB] Halaman Pemilih Peran di URL `/` HARUS menampilkan minimal 2 kartu pilihan:
- Kartu "Administrator" → navigasi ke `/hr`
- Kartu "Employee" → navigasi ke `/supervisor`

**FR-AUTH-011** [WAJIB] Halaman Pemilih Peran HARUS memiliki tombol "Logout" yang mengarahkan pengguna ke `/login`.

### 3.3 Sesi & Keamanan

**FR-AUTH-012** [WAJIB] Setiap rute portal (`/employee/*`, `/supervisor/*`, `/hr/*`) HARUS terlindungi dari akses tanpa autentikasi.

**FR-AUTH-013** [WAJIB] Pengguna dengan peran Karyawan TIDAK BOLEH dapat mengakses rute `/supervisor/*` atau `/hr/*`.

**FR-AUTH-014** [WAJIB] Pengguna dengan peran Supervisor TIDAK BOLEH dapat mengakses rute `/hr/*`.

---

## 4. FR-SHELL — Shell Aplikasi

### 4.1 Tata Letak Utama

**FR-SHELL-001** [WAJIB] Semua halaman portal (`/employee/*`, `/supervisor/*`, `/hr/*`) HARUS menggunakan layout yang terdiri dari:
- **Sidebar** (kiri): navigasi vertikal
- **Topbar** (atas kanan): bilah alat dan identitas
- **Area Konten Utama** (tengah kanan, scrollable): outlet router
- **Footer** (bawah kanan): copyright

**FR-SHELL-002** [WAJIB] Layout HARUS menggunakan Flexbox horizontal penuh layar (`h-screen`, `overflow-hidden`). Sidebar dan konten HARUS berbagi tinggi penuh.

**FR-SHELL-003** [WAJIB] Area konten utama HARUS dapat di-scroll secara vertikal (`overflow-y-auto`) sementara Topbar dan Sidebar tetap terlihat (tidak ikut scroll).

**FR-SHELL-004** [WAJIB] Footer HARUS menampilkan teks: "Copyright ©2026 Sambu Group" dengan posisi center, font 12px, warna abu-abu, dibatasi oleh border atas.

### 4.2 Sidebar

**FR-SHELL-005** [WAJIB] Sidebar HARUS memiliki:
- Lebar dalam kondisi terbuka: **260px**
- Lebar dalam kondisi diciutkan: **0px** (tersembunyi penuh)
- Transisi: `transition-[width] duration-300 ease-in-out`
- `overflow: hidden` agar konten tidak terlihat saat diciutkan

**FR-SHELL-006** [WAJIB] Sidebar HARUS menampilkan logo perusahaan di area header (tinggi 88px, sama dengan Topbar), sejajar dengan logo di Topbar. Logo diambil dari `sambu_group.png.png`.

**FR-SHELL-007** [WAJIB] Sidebar HARUS menampilkan item navigasi berbeda berdasarkan peran:
- Peran `"hr"` → menggunakan daftar `hrLinks`
- Peran `"supervisor"` → menggunakan daftar `supervisorLinks`

**FR-SHELL-008** [WAJIB] Item navigasi yang saat ini aktif (URL cocok) HARUS ditandai dengan:
- Background: navy `#1A284F`
- Teks: putih
- Shadow: `shadow-sm`

**FR-SHELL-009** [WAJIB] Item navigasi yang tidak aktif HARUS ditampilkan dengan:
- Teks: abu-abu (`text-gray-600`)
- Hover: background abu-abu ringan (`hover:bg-gray-100/50`) + teks lebih gelap

**FR-SHELL-010** [WAJIB] Sidebar HARUS mendukung menu bertingkat (multi-level):
- **Level 1 (Top-level):** item tunggal atau header grup yang dapat dilipat
- **Level 2 (Sub-link):** item dalam grup yang telah dibuka; indent kiri 48px
- **Level 3 (Sub-sub-link):** item dalam sub-grup; indent kiri 64px

**FR-SHELL-011** [WAJIB] Grup navigasi yang memiliki sub-link HARUS memiliki ikon Chevron di sisi kanan yang berputar 180° saat grup dibuka.

**FR-SHELL-012** [WAJIB] Saat pengguna menavigasi ke suatu rute, grup yang mengandung rute tersebut HARUS secara otomatis dibuka (auto-expand). Perilaku ini HARUS dipertahankan menggunakan `useEffect` yang merespons perubahan `location.pathname`.

**FR-SHELL-013** [WAJIB] Status terbuka/tertutup setiap grup navigasi HARUS dipertahankan dalam state lokal (`useState<Set<number>>`). Satu grup boleh dalam keadaan terbuka secara independen dari grup lain.

**FR-SHELL-014** [WAJIB] Daftar navigasi HARUS dapat di-scroll secara vertikal jika konten melebihi tinggi layar (`overflow-y-auto`).

**Daftar Lengkap Menu HR (10 grup + item tunggal):**

| # | Label | Tipe | Ikon | Rute / Sub-item |
|---|---|---|---|---|
| 1 | Analytics Dashboard | NavLink | BarChart2 | `/hr` (exact) |
| 2 | My Profile | NavLink | UserCog | `/hr/profile` |
| 3 | Approvals | Grup | CheckSquare | KPI Business, PA Measurement, PA Setting, Open Lock |
| 4 | PA Monitoring | Grup | ClipboardCheck | KPI, SMART Goals, Appraisal Form, Managerial Skill, Project, Mgmt Interview |
| 5 | PA Summary | NavLink | LayoutList | `/hr/summary` |
| 6 | Calibration | Grup | Target | Setting, Adjustment, Management Interview |
| 7 | Evidence | Grup | FolderOpen | KPI Tracking, RCA, SMART Goals, Mgmt Interview |
| 8 | Documents | NavLink | BookOpen | `/hr/documents` |
| 9 | Setting | Grup | Settings | Master (sub-grup: KPI/AF/MS), Scores Setting, Module Activation, Approval Mgmt, User Mgmt, Access Mgmt, Menu Mgmt, Data Sync, Audit Trail |

**Daftar Lengkap Menu Supervisor (8 grup + item tunggal):**

| # | Label | Tipe | Ikon | Rute / Sub-item |
|---|---|---|---|---|
| 1 | Dashboard | NavLink | ListTodo | `/supervisor` (exact) |
| 2 | My Profile | NavLink | UserCog | `/supervisor/profile` |
| 3 | My Performance Appraisal | NavLink | FileText | `/supervisor/appraisal` |
| 4 | Approvals | Grup | CheckSquare | PA Measurement, PA Setting |
| 5 | PA Summary | NavLink | LayoutList | `/supervisor/summary` |
| 6 | PA Monitoring | Grup | ClipboardCheck | KPI, SMART Goals, AF, Managerial Skill, Project, Mgmt Interview |
| 7 | PA Setting | Grup | Target | KPI, SMART Goals |
| 8 | PA Measurement | Grup | Clock | KPI Tracking, RCA, SMART Goals, AF, Project OJS, Managerial Skill, Inter-Dept Feedback |
| 9 | Documents | NavLink | BookOpen | `/supervisor/documents` |

### 4.3 Topbar

**FR-SHELL-015** [WAJIB] Topbar HARUS memiliki tinggi **88px**, lebar penuh area kanan, background putih, dan border bawah abu-abu tipis.

**FR-SHELL-016** [WAJIB] Topbar HARUS menampilkan elemen berikut dari kiri ke kanan:
1. Tombol Toggle Sidebar
2. Pencarian Global (untuk HR dan Supervisor) ATAU Judul+Subjudul (untuk Karyawan)
3. *(area tengah fleksibel — kosong)*
4. Tombol Lonceng Notifikasi
5. Tombol Profil Pengguna (inisial avatar + nama)
6. Toggle Bahasa (EN/ID)

**FR-SHELL-017** [WAJIB] Tombol Toggle Sidebar HARUS:
- Ukuran: 36×36px, rounded-full
- Ikon: `PanelLeftClose` (saat sidebar terbuka) / `PanelLeftOpen` (saat sidebar diciutkan)
- `title` atribut: "Hide sidebar" / "Show sidebar"
- Saat diklik: memanggil fungsi `onToggleSidebar` yang disediakan dari Layout

**FR-SHELL-018** [WAJIB] State `sidebarCollapsed` HARUS dikelola di komponen `AppLayout` dan diteruskan ke `Sidebar` (prop `collapsed`) dan `Topbar` (prop `sidebarCollapsed` + `onToggleSidebar`) agar keduanya tersinkron.

**FR-SHELL-019** [WAJIB] Tombol profil HARUS menampilkan inisial nama pengguna dalam lingkaran berwarna navy sebagai avatar. Inisial diambil dari 2 kata pertama nama lengkap (huruf pertama masing-masing).

**FR-SHELL-020** [WAJIB] Toggle bahasa HARUS menampilkan dua opsi: "EN" dan "ID". Opsi aktif ditampilkan dengan background navy dan teks putih. Tampilan berupa pill (rounded-full).

**FR-SHELL-021** [PENTING] Toggle bahasa HARUS mengubah bahasa antarmuka yang berlaku. Dalam versi v1.0, ini dapat berupa stub (simulasi toggle tanpa penerjemahan penuh).

---

## 5. FR-SEARCH — Pencarian Global

**FR-SEARCH-001** [WAJIB] Komponen Pencarian Global HARUS ditampilkan di Topbar hanya untuk peran **HR** dan **Supervisor**. Untuk peran Karyawan, posisi ini digantikan oleh Judul + Subjudul halaman.

**FR-SEARCH-002** [WAJIB] Komponen Pencarian Global HARUS terdiri dari:
- Ikon Search (kiri dalam input)
- Input teks dengan placeholder "Search pages, features..."
- Keyboard shortcut hint (Ctrl+K / ⌘K) di sisi kanan input

**FR-SEARCH-003** [WAJIB] Saat input terfokus atau query berubah, sistem HARUS menampilkan panel dropdown di bawah input yang berisi:
- Hasil pencarian (maks. 8 hasil) ATAU
- Teks "No results found for '[query]'" jika tidak ada kecocokan

**FR-SEARCH-004** [WAJIB] Algoritma pencarian HARUS mencocokkan string query (case-insensitive) terhadap:
- `label` halaman
- `category` halaman
- `path` URL halaman

**FR-SEARCH-005** [WAJIB] Hasil HARUS diurutkan: label yang **dimulai dengan** query didahulukan, kemudian diurutkan secara alfabetis.

**FR-SEARCH-006** [WAJIB] Setiap hasil HARUS menampilkan:
- Ikon halaman (ikon Lucide sesuai modul)
- Label halaman dengan **sorotan teks yang cocok** (tag `<mark>` atau `<span>` dengan background amber)
- Badge kategori (navy, rounded-full)
- Ikon arrow kanan (ChevronRight)

**FR-SEARCH-007** [WAJIB] Kategori yang digunakan dalam pencarian:

| Kategori | Berlaku untuk |
|---|---|
| Main | Dashboard, Profile, Summary |
| Monitoring | Semua halaman monitoring |
| Mid-Year | KPI Tracking, RCA, SMART Goals Check-In, Appraisal Form, dll. |
| Appraisals | Goal Oversight, Mid-Year Check-In |
| Evidence | Halaman Evidence (4 tipe) |
| Calibration | Calibration Setting, Adjustment, Mgmt Interview |
| Settings | User Mgmt, Access Mgmt, Menu Mgmt, Data Sync, dll. |
| Master Data | Master KPI, Master AF, Master MS |

**FR-SEARCH-008** [WAJIB] Navigasi keyboard HARUS didukung:
- `↑` / `↓`: pindah fokus antar hasil
- `Enter`: navigasi ke hasil yang sedang difokus
- `Escape`: menutup panel dropdown dan menghapus fokus

**FR-SEARCH-009** [WAJIB] Klik di luar panel dropdown HARUS menutup panel.

**FR-SEARCH-010** [WAJIB] Klik pada hasil pencarian HARUS menavigasi ke rute yang sesuai dan menutup panel.

---

## 6. FR-NOTIF — Notifikasi

**FR-NOTIF-001** [WAJIB] Ikon lonceng di Topbar HARUS menampilkan badge merah dengan angka jumlah notifikasi yang belum dibaca. Badge HARUS memiliki ukuran 9px dan teks bold putih.

**FR-NOTIF-002** [WAJIB] Badge HARUS disembunyikan jika jumlah notifikasi yang belum dibaca = 0.

**FR-NOTIF-003** [WAJIB] Saat ikon lonceng diklik, sistem HARUS menampilkan panel notifikasi slide-in dari kanan dengan spesifikasi:
- Lebar: 384px (`w-96`)
- Posisi: absolute, atas = tinggi Topbar, kanan = 16px
- Bayangan: besar (`shadow-2xl`)
- Sudut: `rounded-2xl`
- Z-index: di atas konten (z-50)

**FR-NOTIF-004** [WAJIB] Header panel notifikasi HARUS menampilkan:
- Ikon Bell + judul "Notifications"
- Badge dengan total count notifikasi
- Tombol "Mark all as read" (hanya tampil jika ada notifikasi yang belum dibaca)

**FR-NOTIF-005** [WAJIB] Setiap item notifikasi HARUS menampilkan:
- Titik oranye di sisi kiri (hanya jika belum dibaca)
- Stempel waktu (ikon Clock + teks, contoh: "Today, 08:00")
- Judul notifikasi (bold)
- Teks body (multi-paragraf diperbolehkan)
- Tombol CTA (tombol navy kecil dengan ikon ArrowRight) → navigasi ke rute terkait
- Tombol hapus (ikon X kanan atas notifikasi)

**FR-NOTIF-006** [WAJIB] Saat body notifikasi diklik, notifikasi tersebut HARUS ditandai sebagai sudah dibaca (titik oranye hilang).

**FR-NOTIF-007** [WAJIB] Tombol X pada notifikasi HARUS menghapus notifikasi tersebut dari daftar (tidak dapat dikembalikan).

**FR-NOTIF-008** [WAJIB] Tombol "Mark all as read" HARUS menandai semua notifikasi sebagai sudah dibaca sekaligus.

**FR-NOTIF-009** [PENTING] Sistem HARUS mendukung minimal tipe notifikasi berikut:
- **KPI_REMINDER**: pengingat pengisian KPI Tracking bulanan (berlaku untuk Supervisor)

**FR-NOTIF-010** [PENTING] Klik di luar panel notifikasi HARUS menutup panel.

---

## 7. FR-KPIS — KPI Setting

### 7.1 Struktur Halaman

**FR-KPIS-001** [WAJIB] Halaman KPI Setting HARUS tersedia di:
- `/supervisor/setting/kpi` (peran Supervisor)
- `/hr/setting/kpi` (peran HR)

**FR-KPIS-002** [WAJIB] Halaman HARUS menampilkan tab-tab KPI berdasarkan peran:

| Peran | Tab yang Tersedia |
|---|---|
| Supervisor | personal, department, division, corporate, pak-anton, pak-amir |
| HR | corporate (dengan cascading role) |

**FR-KPIS-003** [WAJIB] Setiap tab HARUS memiliki mode tampilan:
- **`"input"`**: mode editable — tabel dapat diubah; tombol Tambah KPI, Impor XLSX, Ekspor XLSX, Preview tersedia
- **`"preview"`**: mode read-only sebelum submit — tombol Submit, Request Revision tersedia
- **`"submitted"`**: mode terkunci setelah submit — banner hijau terkunci, tidak bisa diubah

### 7.2 Struktur Data KPI

**FR-KPIS-004** [WAJIB] Setiap item KPI HARUS menyimpan field berikut:

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| no | string | Ya | Nomor urut (contoh: "1", "1a", "2b") |
| section | "A" \| "B" | Ya | A = Objective (maks 20%), B = Functional (maks 80%) |
| perspektif | string | Ya | Dropdown dari Master KPI |
| kpi | string | Ya | Nama indikator KPI |
| satuan | string | Ya | Dropdown dari Master KPI |
| formula | string | Ya | "Jumlah" \| "Rata-Rata" \| "Nilai Akhir" |
| bobot | string | Ya | Persentase bobot (5%–50%, kelipatan 5%) |
| definisi | string | Tidak | Deskripsi KPI |
| source | string | Tidak | Sumber data |
| baseline2025 | string | Tidak | Nilai tahun sebelumnya |
| target2026 | string | Tidak | Target tahun berjalan |
| polaritas | string | Ya | "Maximize" \| "Minimize" |
| detailFormula | string | Tidak | Formula detail |
| keterangan | string | Tidak | Catatan tambahan |
| monthlyTargets | Record<string, string> | Tidak | Target per bulan (Jan–Des) |
| colorIndicator | boolean | Tidak | true = mode Color Band |
| indicatorMode | string | Tidak | "numeric" \| "color" \| "ratio" |
| scope | string | Tidak | Cakupan unit |
| trackingPeriod | string | Tidak | Frekuensi pengukuran |
| coo | string | Tidak | Nilai cascading ke role COO (hanya Corporate) |
| gmVgmIndustry | string | Tidak | Nilai cascading ke GM/VGM Industry |

### 7.3 Validasi Bobot

**FR-KPIS-005** [WAJIB] Sistem HARUS memvalidasi total bobot per seksi setiap kali data disimpan:
- Seksi **A** (Objective KPI): total bobot TIDAK BOLEH melebihi **20%**
- Seksi **B** (Functional KPI): total bobot TIDAK BOLEH melebihi **80%**

**FR-KPIS-006** [WAJIB] Jika total bobot seksi melebihi batas setelah penambahan/perubahan item, sistem HARUS menampilkan `BobotExceededModal` dengan pesan yang menjelaskan seksi mana yang bermasalah dan berapa selisihnya. Perubahan TIDAK BOLEH disimpan.

**FR-KPIS-007** [WAJIB] `BobotExceededModal` HARUS memiliki:
- Judul "Bobot Melebihi Batas"
- Teks informatif menyebut seksi (A/B), total bobot saat ini, dan batas maksimum
- Tombol "Tutup" untuk menutup modal

### 7.4 Tabel KPI

**FR-KPIS-008** [WAJIB] Tabel KPI HARUS memiliki kolom berikut (dapat di-scroll horizontal):
No | Seksi | Perspektif | KPI | Satuan | Formula | Bobot | Definisi | Source | Baseline 2025 | Target 2026 | Polaritas | Detail Formula | Keterangan

**FR-KPIS-009** [WAJIB] Dalam mode **`"input"`**, setiap sel tabel yang dapat diedit HARUS:
- Field teks: `<input>` atau `<textarea>`
- Dropdown: `<select>` dengan opsi sesuai Master KPI
- Bobot: dropdown dengan opsi 5%, 10%, 15%, ..., 50%

**FR-KPIS-010** [WAJIB] Dalam mode **`"preview"`**, tabel HARUS sepenuhnya read-only (tidak ada input aktif).

**FR-KPIS-011** [WAJIB] Tombol **"Tambah KPI"** HARUS menambahkan baris baru di bawah baris terakhir dalam seksi yang dipilih, dengan nilai default kosong kecuali `no` (auto-increment).

**FR-KPIS-012** [WAJIB] Setiap baris KPI HARUS memiliki tombol hapus (ikon trash) yang menghapus baris tersebut setelah konfirmasi.

### 7.5 Edit Row Modal

**FR-KPIS-013** [WAJIB] Klik pada baris KPI dalam mode edit HARUS membuka **`EditRowModal`** yang menampilkan semua field KPI dalam format formulir:
- Grup "Informasi Dasar": No, Seksi, Perspektif, KPI, Satuan, Formula, Bobot, Polaritas
- Grup "Detail": Definisi, Source, Baseline 2025, Target 2026, Detail Formula, Keterangan
- Grup "Target Bulanan": tabel 12 bulan (Jan–Des) dengan input per bulan
- Grup "Mode Indikator": toggle colorIndicator, pilihan indicatorMode

**FR-KPIS-014** [WAJIB] `EditRowModal` HARUS memiliki tombol "Simpan" yang menutup modal dan memperbarui data baris.

### 7.6 Impor & Ekspor

**FR-KPIS-015** [WAJIB] Tombol **"Ekspor XLSX"** HARUS mengunduh file Excel dengan nama `KPI_Setting_[TabID]_2026.xlsx` berisi semua data KPI dalam tab aktif.

**FR-KPIS-016** [WAJIB] Tombol **"Impor XLSX"** HARUS membuka dialog file (ekstensi .xlsx, .xls). Setelah file dipilih, sistem HARUS mem-parse baris data dan memperbarui tabel menggunakan pencocokan header kolom (regex matching, case-insensitive).

### 7.7 Alur Submit

**FR-KPIS-017** [WAJIB] Tombol **"Preview"** HARUS mengalihkan tampilan ke mode `"preview"`.

**FR-KPIS-018** [WAJIB] Tombol **"Submit"** (dalam mode preview) HARUS memunculkan `ConfirmModal`:
- Judul "Submit KPI Setting"
- Pesan: "Data KPI akan dikirim untuk persetujuan Approver. Pastikan semua data sudah benar."
- Tombol "Batal" + "Submit"

**FR-KPIS-019** [WAJIB] Setelah konfirmasi submit, sistem HARUS:
1. Menampilkan `SuccessModal` dengan pesan berhasil
2. Mengalihkan halaman ke mode `"submitted"`
3. Menampilkan banner hijau "KPI Setting telah berhasil diajukan dan sedang menunggu persetujuan."

**FR-KPIS-020** [WAJIB] Dalam mode `"submitted"`, TIDAK ADA tombol edit yang aktif. Banner hijau menggantikan toolbar aksi.

### 7.8 Request Revision

**FR-KPIS-021** [WAJIB] Tombol **"Request Revision"** (dalam mode preview) HARUS membuka `RevisionModal`:
- Textarea "Alasan Revisi" (wajib, min. 1 karakter)
- Penghitung karakter
- Tombol "Kirim Revisi" (dinonaktifkan jika textarea kosong)
- Tombol "Batal"

**FR-KPIS-022** [WAJIB] Pengiriman revision request HARUS mengembalikan halaman ke mode `"input"` dengan catatan revisi yang ditampilkan sebagai banner amber.

---

## 8. FR-KPIT — KPI Tracking

### 8.1 Struktur Tabel

**FR-KPIT-001** [WAJIB] Halaman KPI Tracking HARUS menampilkan tabel dengan:
- **Kolom sticky kiri** (tidak bergerak saat scroll horizontal):
  - No: lebar 52px
  - Perspektif: lebar 140px
  - KPI: lebar 270px
- **Kolom statis** (setelah kolom sticky): Satuan, Formula Setahun, Bobot (badge navy), Definisi, Source, Baseline 2025, Target 2026, Polaritas, Detail Formula, Keterangan
- **Kolom dinamis** (satu per bulan yang ditambahkan): lebar 120px masing-masing
- **Kolom Total 2026**: lebar 120px, background `bg-blue-50`, nilai auto-computed

**FR-KPIT-002** [WAJIB] Tabel KPI Tracking HARUS mendukung sub-baris per KPI. Jenis sub-baris:
- **Target** (latar `sky-50`): nilai target per bulan, DIKUNCI (tidak bisa diedit), ditandai dengan ikon Lock kecil
- **Realisasi** (latar putih): input teks yang dapat diedit (`ring-1 ring-blue-300`)
- **Komputasi/Capaian** (latar `emerald-50`): nilai persentase capaian, dihitung otomatis, berwarna sesuai capaian

**FR-KPIT-003** [WAJIB] Warna teks nilai capaian (ComputeSpec) HARUS mengikuti aturan:
- ≥ 95%: `text-green-700` (hijau)
- ≥ 80% dan < 95%: `text-amber-600` (kuning)
- < 80%: `text-rose-600` (merah)

### 8.2 Mode Color Band (colorIndicator)

**FR-KPIT-004** [WAJIB] Untuk KPI dengan `colorIndicator = true`, baris Realisasi HARUS menggunakan dropdown pilihan warna (bukan input numerik):
- "95%–100%" (background hijau-100, teks hijau-800)
- "≥80%–<95%" (background amber-100, teks amber-800)
- "<80%" (background rose-100, teks rose-800)

**FR-KPIT-005** [WAJIB] Perhitungan Total 2026 untuk mode Color Band HARUS mengikuti aturan `formula`:
- **"Nilai Akhir"**: gunakan nilai bulan Desember
- **"Rata-Rata"**: hitung warna yang paling sering muncul (modus)
- **"Jumlah"**: aturan paling buruk — jika ada "<80%" → hasilnya "<80%"; jika ada "≥80%–<95%" → hasilnya itu; selain itu "95%–100%"

### 8.3 Mode Ratio

**FR-KPIT-006** [WAJIB] Untuk KPI dengan `indicatorMode = "ratio"`, baris Realisasi HARUS menggunakan dropdown pilihan rasio:
- "10:1" / "6:1" / "5:1" / "4:1" / "3:1" / "2:1"

**FR-KPIT-007** [WAJIB] Capaian untuk mode ratio dengan `ratioMultiplier = 6` HARUS dihitung sebagai:
- `skor = 100%` jika jumlah negatif = 0 ATAU jumlah positif ≥ jumlah negatif × 6
- `skor = 0%` jika sebaliknya

### 8.4 Tombol RCA per Cell

**FR-KPIT-008** [WAJIB] Pada sub-baris komputasi (Capaian), jika nilai capaian < 100%, sistem HARUS menampilkan tombol kecil berlabel "RCA":
- **Merah berdenyut** (`animate-pulse`, background rose): jika RCA untuk bulan tersebut belum diisi
- **Hijau** (background emerald): jika RCA sudah diisi

**FR-KPIT-009** [WAJIB] Klik tombol RCA HARUS membuka `RCAModal` (inline) atau menavigasi ke halaman RCA dengan parameter bulan dan KPI yang sudah terisi.

### 8.5 Manajemen Bulan

**FR-KPIT-010** [WAJIB] Tombol **"+"** di ujung kanan header kolom HARUS membuka `AddMonthModal`.

**FR-KPIT-011** [WAJIB] `AddMonthModal` HARUS menampilkan grid 12 bulan (Jan–Des). Bulan yang sudah ditambahkan ke tabel HARUS dinonaktifkan (tidak bisa dipilih lagi).

**FR-KPIT-012** [WAJIB] Saat bulan dipilih dari modal, sistem HARUS menambahkan kolom baru di tabel dengan:
- Header: nama bulan
- Sub-baris Target: auto-terisi dari `monthlyTargets[bulan]` dalam data KPI (terkunci)
- Sub-baris Realisasi: input kosong (dapat diisi)
- Sub-baris Capaian: kosong, akan dihitung saat Realisasi diisi

**FR-KPIT-013** [WAJIB] Tombol **"×"** di header kolom bulan HARUS menghapus kolom bulan tersebut beserta semua data yang telah diisi (dengan konfirmasi singkat).

### 8.6 Impor & Ekspor

**FR-KPIT-014** [WAJIB] Ekspor XLSX HARUS menghasilkan file dengan semua data KPI yang terlihat, termasuk kolom bulan yang telah ditambahkan.

**FR-KPIT-015** [WAJIB] Impor XLSX HARUS mem-parse file dan mencocokkan data ke kolom menggunakan regex matching header (case-insensitive). Kolom yang tidak dikenal HARUS diabaikan.

### 8.7 Alur Submit

**FR-KPIT-016** [WAJIB] Tombol **"Submit"** HARUS memunculkan `ConfirmModal`. Setelah dikonfirmasi, sistem HARUS menampilkan `SuccessModal` lalu mengunci halaman dalam mode preview.

**FR-KPIT-017** [WAJIB] Dalam mode terkunci (pasca-submit), semua input HARUS menjadi read-only. Tombol tambah bulan HARUS disembunyikan.

### 8.8 Edit Request (Pasca-Submit)

**FR-KPIT-018** [WAJIB] Pengguna yang sudah submit HARUS bisa membuka `EditRequestModal` dengan field:
- **Bagian Approver** (read-only): Approver 1 (nama+jabatan) dan Approver 2 (nama+jabatan)
- **Pilih KPI** (checkbox per seksi A dan B): minimal 1 harus dipilih
- **Pilih Bulan** (pill toggle Jan–Des): minimal 1 harus dipilih
- **Alasan** (textarea + counter karakter): wajib diisi

**FR-KPIT-019** [WAJIB] Tombol "Submit Edit Request" dalam modal HARUS dinonaktifkan sampai kondisi berikut terpenuhi:
- `selectedKpis.length > 0` AND
- `selectedMonths.length > 0` AND
- `reason.trim().length > 0`

### 8.9 Open Lock Request

**FR-KPIT-020** [WAJIB] Jika pengguna melewati deadline modul, sistem HARUS menampilkan `OpenLockRequestModal` dengan:
- Informasi deadline: "30 Juni 2026"
- Textarea "Alasan Permintaan" (wajib)
- Tombol "Kirim Request" (dinonaktifkan jika alasan kosong)

### 8.10 Unggah Bukti (Evidence)

**FR-KPIT-021** [WAJIB] Bagian Evidence di bawah tabel HARUS memiliki:
- Dropdown pilih bulan (default: bulan terakhir yang ditambahkan)
- Zona drag-and-drop untuk upload file (semua tipe diterima)
- Daftar file yang diunggah: ikon sesuai tipe file + nama file + ukuran (B/KB/MB) + tombol hapus

**FR-KPIT-022** [WAJIB] Ikon file HARUS dibedakan berdasarkan ekstensi:
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` → ikon gambar
- `.pdf` → ikon PDF (merah)
- `.xlsx`, `.xls`, `.csv` → ikon spreadsheet (hijau)
- `.doc`, `.docx` → ikon Word (biru)
- Lainnya → ikon file generik

---

## 9. FR-RCA — Root Cause Analysis

### 9.1 Struktur Halaman

**FR-RCA-001** [WAJIB] Halaman RCA HARUS tersedia di:
- `/employee/mid-year/rca` (Karyawan — embedded atau terpisah)
- `/supervisor/mid-year/rca` (Supervisor)

**FR-RCA-002** [WAJIB] Halaman HARUS memiliki dua tab:
- **"RCA (Open)"**: badge count menampilkan jumlah RCA dengan status Pending atau Approved
- **"RCA (Closed)"**: badge count menampilkan jumlah RCA dengan status Closed

### 9.2 Kartu Ringkasan (6 Kartu)

**FR-RCA-003** [WAJIB] Di atas tabel, sistem HARUS menampilkan 6 kartu ringkasan:

| # | Label | Formula |
|---|---|---|
| 1 | Total Period | Jumlah periode unik yang memiliki RCA |
| 2 | Total KPI | Jumlah KPI unik yang memiliki RCA |
| 3 | Total Action Plans | Jumlah semua AP (tidak termasuk status "Dibatalkan") |
| 4 | Total Outstanding | Jumlah AP yang bukan "Selesai" dan bukan "Dibatalkan" |
| 5 | Outstanding % | `(totalOutstanding / totalAPs) × 100` (1 desimal) |
| 6 | Total RCA Closed | Jumlah RCA dengan status "Closed" |

### 9.3 Filter

**FR-RCA-004** [WAJIB] Tabel HARUS dapat difilter berdasarkan:
- **Year**: dropdown (2026 / 2025 / 2024) — dicocokkan ke field `periode`
- **Period**: dropdown (Jan–Des dalam Bahasa Inggris, dicocokkan ke nama bulan Indonesia)

**FR-RCA-005** [WAJIB] Tombol "Clear" (ikon X) HARUS muncul jika ada filter aktif, dan mereset semua filter saat diklik.

### 9.4 Kolom Tabel

**FR-RCA-006** [WAJIB] Tabel HARUS memiliki kolom berikut:

| Kolom | Keterangan |
|---|---|
| No | Nomor urut |
| Aksi | Tombol tindakan per baris |
| Periode | Badge navy (contoh: "Jan 2026") |
| KPI Indicator | Nama KPI |
| Target | Nilai target |
| Actual | Nilai aktual |
| Total APs | Jumlah action plan |
| Outstanding APs | Pill badge (jumlah AP yang belum selesai) |
| Progress APs % | Progress bar dengan persentase |
| Submitted Date | Tanggal pengajuan |
| Approval Status | Badge status |
| Last Approved Date | Tanggal persetujuan terakhir |

**FR-RCA-007** [WAJIB] Warna Progress Bar HARUS mengikuti:
- 0–49%: amber (kuning)
- 50–99%: biru
- 100%: hijau

### 9.5 Tombol Aksi per Baris

**FR-RCA-008** [WAJIB] Pada tab **"RCA (Open)"**, tombol aksi HARUS:
- Status "Approved": tombol amber "Update Progress" + tombol abu-abu "View Detail" + tombol trash merah (Hapus)
- Status lain: tombol abu-abu "View Detail" + tombol trash merah (Hapus)

**FR-RCA-009** [WAJIB] Pada tab **"RCA (Closed)"**, hanya tombol abu-abu "View Detail" yang HARUS tampil.

**FR-RCA-010** [WAJIB] Tombol Hapus HARUS memunculkan dialog konfirmasi sebelum menghapus data RCA dari penyimpanan.

### 9.6 Create RCA Drawer

**FR-RCA-011** [WAJIB] Tombol "Buat RCA Baru" HARUS membuka `CreateRCADrawer` (panel kanan layar penuh atau drawer lebar).

**FR-RCA-012** [WAJIB] `CreateRCADrawer` HARUS menampilkan katalog KPI yang memiliki capaian < 100% (auto-generated dari data KPI Tracking). Saat KPI dipilih:
- Field satuan, baseline, target, dan actual HARUS terisi otomatis
- Pengguna DAPAT memilih lebih dari satu KPI dalam satu RCA

**FR-RCA-013** [WAJIB] Untuk setiap KPI yang dipilih, sistem HARUS menyediakan formulir **5-Why** dengan struktur:
- **A (Masalah Utama)**: wajib diisi; radio button Faktor Internal / Eksternal
- **B (Kenapa A?)**: wajib diisi
- **C (Kenapa B?)**: wajib diisi
- **D (Kenapa C?)**: wajib diisi
- **Action Plans**: minimal 1; per AP: Action (wajib), Target Date (wajib), PIC (wajib), Status (wajib)

**FR-RCA-014** [WAJIB] Tombol "Tambah Blok Masalah" HARUS memungkinkan pengguna menambahkan lebih dari satu masalah utama per KPI.

**FR-RCA-015** [WAJIB] Tombol "Submit RCA" HARUS dinonaktifkan sampai semua field wajib (A, B, C, D, minimal 1 AP dengan Action+TargetDate+PIC) telah diisi.

**FR-RCA-016** [WAJIB] Saat submit berhasil, status RCA baru HARUS = **"Pending-Approver 1"** dan ditambahkan ke tab "RCA (Open)".

### 9.7 Detail Drawer

**FR-RCA-017** [WAJIB] `DetailDrawer` HARUS menampilkan semua data RCA dalam format read-only.

**FR-RCA-018** [WAJIB] Saat status RCA = **"Approved"** dan drawer dibuka melalui tombol "Update Progress":
- Field yang dapat diedit (disorot amber): Status Perbaikan, Keterangan, Output, Evidence
- Tombol "Save Update" HARUS tersedia di footer

**FR-RCA-019** [WAJIB] Validasi Evidence saat update:
- Jika Status Perbaikan = **"Selesai"** DAN kolom evidence kosong → border merah + pesan error: "Evidence wajib diunggah jika status Selesai."

**FR-RCA-020** [WAJIB] Transisi status RCA:
```
Draft → Submit → Pending-Approver 1 → Pending-Approver 2 → Approved → (Update Progress) → Closed
```

---

## 10. FR-SG — SMART Goals

### 10.1 Struktur Halaman

**FR-SG-001** [WAJIB] Halaman SMART Goals HARUS tersedia di `/employee/mid-year/smart-goals` (Karyawan) dan `/supervisor/mid-year/smart-goals` (Supervisor).

**FR-SG-002** [WAJIB] Halaman HARUS memiliki dua tab:
- **"Input Form"**: form pengisian SMART Goals (disembunyikan setelah submit)
- **"Results"**: tampilan hasil (disabled sebelum submit, aktif setelah submit)

### 10.2 Tabel SMART Goals

**FR-SG-003** [WAJIB] Tabel SMART Goals HARUS berbentuk matrix dengan:
- **Baris** = 7 kriteria (Specific, Measurable, Attainable, Relevant, Timely, Bukti, Target)
- **Kolom** = satu per tujuan (Goal 1, Goal 2, Goal 3, ...)

**FR-SG-004** [WAJIB] Header kolom (label tujuan) HARUS dapat diedit langsung (inline editable) dengan klik.

**FR-SG-005** [WAJIB] Tinggi sel:
- Baris Specific hingga Bukti: 96px (textarea)
- Baris Target: 56px (input satu baris), background biru ringan

**FR-SG-006** [WAJIB] Baris "Bukti" TIDAK wajib diisi untuk dapat melanjutkan ke preview.

**FR-SG-007** [WAJIB] Semua baris lainnya (Specific, Measurable, Attainable, Relevant, Timely, Target) WAJIB diisi per tujuan.

### 10.3 Batasan & Validasi

**FR-SG-008** [WAJIB] Sistem HARUS mempertahankan minimum **3 tujuan** setiap saat. Jika pengguna mencoba menghapus tujuan sehingga jumlah tersisa < 3, sistem HARUS menampilkan modal error "Tidak Dapat Dihapus — Minimal 3 tujuan wajib diisi."

**FR-SG-009** [WAJIB] Tombol **"Preview"** HARUS dinonaktifkan sampai kondisi `allFilled` terpenuhi:
- Setiap tujuan HARUS memiliki Specific, Measurable, Attainable, Relevant, Timely, dan Target yang terisi
- Kondisi ini diperiksa secara real-time setiap kali konten sel berubah

**FR-SG-010** [WAJIB] Tombol **"Tambah Tujuan"** HARUS menambahkan kolom baru di sisi kanan tabel dengan label default "Goal N" (N = jumlah tujuan + 1) dan semua sel kosong.

### 10.4 Alur Submit

**FR-SG-011** [WAJIB] Tombol **"Submit"** HARUS memunculkan `ConfirmModal`. Setelah dikonfirmasi:
1. Sistem HARUS memanggil `saveSubmittedGoals(goals)` untuk menyimpan ke `smartGoalsStore`
2. Sistem HARUS menampilkan `SuccessModal`
3. Tampilan HARUS beralih ke tab "Results"

**FR-SG-012** [WAJIB] Tab "Results" HARUS menampilkan:
- Banner hijau: "SMART Goals telah diajukan dan sedang menunggu review Approver."
- Badge status: "Pending Approval"
- Bagian "Feedback from Approver" (read-only, placeholder "Belum ada feedback")
- Preview tujuan dalam format read-only

**FR-SG-013** [WAJIB] Ekspor XLSX HARUS menghasilkan file `SMART_Goals_2026.xlsx` dengan kolom: No, Goals, Specific, Measurable, Attainable, Relevant, Timely, Bukti, Target, Action Plans.

---

## 11. FR-SGC — SMART Goals Check-In

### 11.1 Struktur Halaman

**FR-SGC-001** [WAJIB] Halaman SMART Goals Check-In tersedia di `/supervisor/mid-year/smart-goals-checkin`.

**FR-SGC-002** [WAJIB] Halaman memiliki dua mode: **`"input"`** (editable) dan **`"preview"`** (read-only).

### 11.2 Accumulation Card

**FR-SGC-003** [WAJIB] Bagian header HARUS menampilkan AccumulationCard (background gelap) dengan:
- **Panel Tujuan (Goals)**: Total | Open | Closed | bar persentase Closed/Total
- **Panel Action Plans**: Total | Open | Closed | bar persentase Closed/Total
- **Status Breakdown**: count per status (Selesai / Sedang dilaksanakan / Belum dilaksanakan / Batal)

**FR-SGC-004** [WAJIB] Definisi "Closed" untuk tujuan:
- Tujuan dianggap **Closed** hanya jika **SEMUA** action plan miliknya berstatus "Selesai"
- Tujuan dengan minimal satu AP yang bukan "Selesai" atau "Batal" dianggap **Open**

### 11.3 Goal Section (per tujuan)

**FR-SGC-005** [WAJIB] Setiap tujuan HARUS ditampilkan dalam GoalSection yang dapat dilipat (collapsible) dengan:
- Header: nomor tujuan + label tujuan + status (Open/Closed) + toggle chevron
- Body (saat dibuka): Tabel SMART (2 kolom: Kriteria | Uraian) + ActionPlansSection

**FR-SGC-006** [WAJIB] ActionPlansSection HARUS menampilkan tabel horizontal:
- **Baris pertama**: deskripsi action plan (read-only)
- **Baris kedua**: status action plan (dropdown dalam mode input / badge dalam mode preview)
- **Baris ketiga** (kondisional): detail tambahan sesuai status yang dipilih

**FR-SGC-007** [WAJIB] Dropdown status AP HARUS memiliki opsi:
`"-"` | `"Belum dilaksanakan"` | `"Sedang dilaksanakan"` | `"Selesai"` | `"Batal"`

**FR-SGC-008** [WAJIB] Kartu detail kondisional HARUS muncul berdasarkan status yang dipilih:

| Status | Elemen yang Ditampilkan |
|---|---|
| Belum dilaksanakan | Textarea "Kendala / Hambatan" |
| Sedang dilaksanakan | Slider progress 0–100 (langkah 5) + label dinamis + Textarea "Kendala / Hambatan" |
| Selesai | Area unggah file (Paperclip + drag-drop) + daftar file + tombol hapus per file |
| Batal | Textarea "Alasan Action Plan Batal" (border + latar merah) |

**FR-SGC-009** [WAJIB] Label slider progress HARUS berubah dinamis:
- ≥ 75%: "Hampir selesai"
- ≥ 50%: "Lebih dari setengah"
- ≥ 25%: "Dalam proses"
- < 25%: "Baru dimulai"

**FR-SGC-010** [WAJIB] Tipe file yang diterima untuk upload evidence: `.jpg`, `.jpeg`, `.png`, `.pdf`, `.xlsx`, `.xls`

### 11.4 Target vs Actual Section

**FR-SGC-011** [WAJIB] Di bawah setiap GoalSection, HARUS ada TargetVsActualSection dengan tabel:
- Kolom: Goals | Target (read-only dari data goal) | Actual (input teks) | Status

**FR-SGC-012** [WAJIB] Status HARUS dipilih dari: `""` | `"Tercapai"` | `"Tidak Tercapai"`

**FR-SGC-013** [WAJIB] Jika Status = "Tidak Tercapai": HARUS muncul textarea "Alasan Tidak Tercapai" (border dan latar merah).

**FR-SGC-014** [WAJIB] Jika Status = "Tercapai": HARUS muncul area unggah Evidence.

### 11.5 Penilaian Akhir (Read-Only)

**FR-SGC-015** [WAJIB] Bagian "Penilaian Akhir" HARUS selalu read-only, menampilkan:
- Nilai/Score: placeholder dashed "Belum ada" jika belum ada penilaian
- Catatan Approver 1: placeholder "Belum ada"
- Catatan Approver 2: placeholder "Belum ada"

---

## 12. FR-AF — Appraisal Form

### 12.1 Struktur 3 Form

**FR-AF-001** [WAJIB] Appraisal Form HARUS terdiri dari 3 form dengan sistem unlock bertahap:

| Form | Bobot | Jumlah Item | Kondisi Buka |
|---|---|---|---|
| Form A | 60% | 12 item | Selalu terbuka |
| Form B | 25% | 5 item | Form A sudah disimpan (`savedA = true`) |
| Form C | 15% | 3 item | Form B sudah disimpan (`savedB = true`) |

**FR-AF-002** [WAJIB] Indikator lock HARUS ditampilkan pada tab Form B dan Form C jika belum tersedia (ikon Lock kecil + teks "Selesaikan Form A/B terlebih dahulu").

### 12.2 Item Form A (12 Item)

**FR-AF-003** [WAJIB] Form A HARUS memiliki 12 item kompetensi berikut, masing-masing dengan 5 indikator (skor 1–5):
1. Pengetahuan Kerja
2. Produktivitas & Efisiensi
3. Kualitas Kerja
4. Keterampilan Teknis
5. Manajemen Kerja
6. Pengelolaan Waktu
7. Kemampuan Pemecahan Masalah
8. Tanggung Jawab
9. Sikap terhadap Perubahan
10. Mempelajari Keterampilan Baru
11. Partisipasi
12. Responsivitas Pelanggan

### 12.3 Item Form B (5 Item)

**FR-AF-004** [WAJIB] Form B HARUS memiliki 5 item:
1. Sikap
2. Inisiatif
3. Kemampuan Interpersonal
4. Mampu Bekerja dalam Tim
5. Peningkatan Keterampilan secara Berkelanjutan

### 12.4 Item Form C (3 Item)

**FR-AF-005** [WAJIB] Form C HARUS memiliki 3 item:
1. Maintain inter-department relations
2. Interact across job levels
3. Maintain workplace cohesion

### 12.5 UI Penilaian

**FR-AF-006** [WAJIB] Setiap item form HARUS menampilkan:
- Label item (nomor + nama)
- 5 tombol penilaian berlabel "1", "2", "3", "4", "5"
- Tombol yang dipilih: background navy `#1A284F`, teks putih
- Tombol yang tidak dipilih: background putih, border abu-abu

**FR-AF-007** [WAJIB] Tombol "Lihat Indikator Penilaian" HARUS tersedia per form yang membuka `IndicatorModal`:
- Tabel 5 kolom (skor 1–5) × N baris (satu per item)
- Tiap sel berisi teks deskriptor indikator

**FR-AF-008** [WAJIB] Baris "Total" di bawah tabel HARUS menampilkan:
- Label: "(X%) Nilai Total"
- Nilai: rata-rata semua penilaian yang telah diberikan (2 desimal)

### 12.6 Simpan & Submit

**FR-AF-009** [WAJIB] Tombol **"Simpan"** HARUS dinonaktifkan sampai `allRated`:
- Semua item dalam form aktif HARUS sudah dinilai (tidak ada yang bernilai 0)

**FR-AF-010** [WAJIB] Setelah menekan Simpan:
- Banner hijau HARUS muncul: "Form [A/B/C] berhasil disimpan. Rata-rata: X.XX"
- State `savedA`/`savedB`/`savedC` HARUS menjadi `true`

**FR-AF-011** [WAJIB] Tombol **"Reset"** HARUS mengosongkan semua penilaian dalam form aktif dengan konfirmasi terlebih dahulu.

**FR-AF-012** [WAJIB] Tombol **"Submit Form"** HARUS hanya muncul di Form C dan dinonaktifkan sampai `allFormsSaved` (savedA AND savedB AND savedC = true).

**FR-AF-013** [WAJIB] Setelah submit, halaman HARUS terkunci dalam mode read-only.

### 12.7 Perhitungan Skor

**FR-AF-014** [WAJIB] Perhitungan skor per form HARUS menggunakan rumus:
```
avgSelf = sum(rating_self) / jumlah_item
avgApprover = sum(rating_approver) / jumlah_item
avgForm = (avgSelf × 30%) + (avgApprover × 70%)
konversiNilai = (avgForm / 5) × 100
skorFinalForm = (avgForm / 5) × bobotForm%
```

**FR-AF-015** [WAJIB] Total skor Appraisal Form = `skorFinalFormA + skorFinalFormB + skorFinalFormC`

---

## 13. FR-MS — Managerial Skill

### 13.1 Struktur Halaman

**FR-MS-001** [WAJIB] Halaman Managerial Skill HARUS tersedia di `/supervisor/mid-year/managerial-skill`.

**FR-MS-002** [WAJIB] Halaman HARUS menampilkan 5 kompetensi dengan bobot tetap **20%** dari total skor:
1. Kepemimpinan
2. Keselarasan Organisasi
3. Perencanaan Penerus
4. Resolusi Konflik Internal
5. Resolusi Konflik Eksternal

### 13.2 Tabel Kompetensi

**FR-MS-003** [WAJIB] Tabel HARUS memiliki kolom:
- No (urut)
- Kepemimpinan dan Keterampilan Manajerial (label + deskripsi)
- Indikator Penilaian (tombol "Lihat Indikator")
- Evaluasi Pribadi Karyawan (5 tombol skor 1–5)

**FR-MS-004** [WAJIB] Baris Total HARUS menampilkan label "(20%) Nilai Total" dan jumlah semua penilaian yang dipilih.

**FR-MS-005** [WAJIB] Setiap kompetensi HARUS memiliki 5 indikator dengan teks deskriptor untuk skor 1–5.

### 13.3 Alur Simpan & Submit

**FR-MS-006** [WAJIB] Status bar sticky di bawah halaman HARUS menampilkan:
- Sebelum semua dinilai: "N dari 5 kompetensi telah dinilai" + tombol Simpan (nonaktif) + Submit Form (nonaktif)
- Semua dinilai, belum simpan: tombol Simpan (aktif, navy)
- Setelah simpan: banner hijau "Form berhasil disimpan. Total Nilai: X" + tombol Submit Form (aktif, emas/gold)

**FR-MS-007** [WAJIB] Tombol **"Submit Form"** HARUS dinonaktifkan sampai:
- Semua 5 kompetensi sudah dinilai (skor > 0) AND
- Form sudah disimpan (tombol Simpan sudah ditekan)

**FR-MS-008** [WAJIB] Submit HARUS melalui `ConfirmModal` → `SuccessModal`.

---

## 14. FR-MI — Management Interview

### 14.1 Jadwal Pribadi (Supervisor)

**FR-MI-001** [WAJIB] Halaman Management Interview Setting tersedia di `/supervisor/mid-year/management-interview`.

**FR-MI-002** [WAJIB] Formulir pembuatan jadwal HARUS memiliki field:

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| Interviewer | Dropdown | Ya | 4 opsi: Budi Santoso / Hendra Wijaya / Dewi Kusuma / Rizal Firmansyah |
| Tanggal Interview | DatePickerID | Ya | — |
| Waktu | Input waktu | Ya | Format HH:MM |
| Lokasi / Platform | Input teks | Tidak | Contoh: "Nama ruang, platform online" |
| Catatan | Textarea | Tidak | 3 baris |
| Lampiran Persiapan | Drag-drop | Tidak | Maks 10MB per file; .pdf .doc .docx .xls .xlsx .png .jpg .jpeg .webp |

**FR-MI-003** [WAJIB] Validasi formulir: `valid = interviewerName && scheduledDate && scheduledTime`

**FR-MI-004** [WAJIB] Tombol "Simpan Jadwal" HARUS dinonaktifkan jika tidak valid.

**FR-MI-005** [WAJIB] Kartu profil pengguna HARUS ditampilkan di atas formulir dengan badge status: "Dijadwalkan" (jika sudah ada jadwal) atau "Belum Dijadwalkan".

**FR-MI-006** [WAJIB] Setelah jadwal disimpan, kartu jadwal HARUS muncul dengan:
- Tombol Edit (border indigo) → buka form edit
- Tombol Hapus (border rose) → konfirmasi lalu hapus

**FR-MI-007** [WAJIB] Toast sukses HARUS muncul: "Jadwal berhasil disimpan" (ikon CheckCircle2 hijau, 3 detik).

### 14.2 HR Scheduling

**FR-MI-008** [WAJIB] Halaman HR Scheduling tersedia di `/supervisor/setting/management-interview`.

**FR-MI-009** [WAJIB] Formulir HR Scheduling HARUS memiliki field:

| Field | Tipe | Wajib |
|---|---|---|
| Company Unit | Dropdown (8 unit) | Ya |
| Employee | Multi-select (20 karyawan) | Tidak |
| Interviewer | Multi-select (10 senior staff) | Ya |
| Other User | Multi-select (8 role support) | Tidak |
| Tanggal Interview | DatePickerID | Ya |
| Waktu | Input waktu | Ya |
| Lokasi / Platform | Input teks | Tidak |
| Text Notifikasi | Textarea | Tidak |
| Lampiran | Upload file (.pdf .jpg .png .doc .xls) | Tidak |

**FR-MI-010** [WAJIB] Validasi: `valid = companyUnit && interviewers.length > 0 && scheduledDate && scheduledTime`

**FR-MI-011** [WAJIB] Tabel jadwal HARUS memiliki kolom: Company Unit | Tanggal | Waktu | Interviewer (maks 2 tag + "+N") | Employee (count) | Other User (count) | Lokasi | Status | Aksi

**FR-MI-012** [WAJIB] Status jadwal: "Scheduled" (biru) | "Cancelled" (merah) | "Done" (hijau)

**FR-MI-013** [WAJIB] Aksi per baris: Eye (detail) + Pensil (edit, kecuali jika Cancelled) + Ban (batalkan, konfirmasi dahulu)

**FR-MI-014** [WAJIB] Saat "Batalkan" dikonfirmasi: status jadwal berubah ke "Cancelled" dan tombol Pensil dinonaktifkan.

**FR-MI-015** [WAJIB] Jadwal yang tersimpan HARUS diteruskan ke `interviewScheduleStore` agar dapat dibaca oleh halaman Monitoring Management Interview.

---

## 15. FR-PO — Project Outside Job Scope

### 15.1 Pendaftaran Proyek

**FR-PO-001** [WAJIB] Halaman Project Outside tersedia di `/employee/mid-year/project-outside` dan `/supervisor/mid-year/project-outside` (menggunakan komponen gabungan dengan tab).

**FR-PO-002** [WAJIB] Setiap proyek HARUS memiliki field:

| Field | Wajib | Keterangan |
|---|---|---|
| Kategori | Ya | Improvement Project \| Corporate Event \| Komite/Task Force |
| Scope | Ya | Ditentukan oleh kategori (lihat §15.2) |
| Nama Project | Ya | Input teks |
| Deskripsi | Ya | Textarea |
| Tanggal Mulai | Ya | DatePickerID |
| Tanggal Selesai | Ya | DatePickerID |
| Role dalam Project | Ya | Input teks |
| Expected Output | Tidak | Textarea |

**FR-PO-003** [WAJIB] Scope HARUS dibatasi berdasarkan Kategori:

| Kategori | Opsi Scope | Bobot |
|---|---|---|
| Improvement Project | SS (Small Scale) | 15% |
| Improvement Project | QCC | 25% |
| Improvement Project | QCP | 40% |
| Corporate Event | Corporate Activity | 10% |
| Komite/Task Force | Komite | 10% |

**FR-PO-004** [WAJIB] Saat Kategori berubah, dropdown Scope HARUS direset dan menampilkan hanya opsi yang relevan.

**FR-PO-005** [WAJIB] Tombol "Simpan" proyek HARUS dinonaktifkan sampai:
`projectName.trim() && description.trim() && startDate && endDate`

### 15.2 Statistik Ringkasan

**FR-PO-006** [WAJIB] Bagian atas halaman HARUS menampilkan kartu ringkasan:
- Total Projects
- Count per kategori (Improvement Project / Corporate Event / Komite)
- Min. Requirement: ✓ hijau (jika ≥1 proyek) atau ⚠ oranye (jika 0)
- Total Bobot (penjumlahan semua bobot proyek)

### 15.3 View States & Submit

**FR-PO-007** [WAJIB] Halaman HARUS memiliki tiga view state:
- **`"input"`**: form editable + daftar proyek yang dapat diedit/hapus
- **`"preview"`**: tampilan read-only sebelum submit
- **`"submitted"`**: terkunci + banner hijau sukses

**FR-PO-008** [WAJIB] Tombol "Submit" HARUS dinonaktifkan jika `projects.length < 1`.

---

## 16. FR-PC — Project Check-In

**FR-PC-001** [WAJIB] Halaman Project Check-In HARUS menampilkan daftar proyek yang sudah didaftarkan di halaman Project Outside (dari `projectStore`).

**FR-PC-002** [WAJIB] Status check-in per proyek:

| Status | Label | Warna | Ikon |
|---|---|---|---|
| not_started | Belum Mulai | Abu-abu | AlertCircle |
| on_track | On Track | Hijau | CheckCircle2 |
| at_risk | Berisiko | Rose | AlertTriangle |
| completed | Selesai | Biru | CheckCircle2 |
| cancelled | Dibatalkan | Abu-abu | XCircle |

**FR-PC-003** [WAJIB] Tombol "Update" HARUS hanya tampil jika status proyek = `"submitted"` atau `"approved"`. Untuk proyek draft, tampilkan peringatan amber: "Submit proyek terlebih dahulu sebelum dapat diupdate."

**FR-PC-004** [WAJIB] Modal Check-In HARUS memiliki field:
- Check-In Status (5 tombol toggle dari opsi di §16.1)
- Progress (slider 0–100, langkah 5) + ProgressBar visual
- Progress Notes (textarea)
- Actual Output (textarea)
- Note (textarea, background amber)
- Upload Evidence (drag-drop, semua tipe file, disimpan sebagai base64)

**FR-PC-005** [WAJIB] 6 kartu statistik HARUS ditampilkan: Total Projects | On Track | At Risk | Completed | Not Started | Avg. Progress

---

## 17. FR-APR — Sistem Persetujuan

### 17.1 Struktur Halaman

**FR-APR-001** [WAJIB] Halaman Persetujuan HARUS tersedia di:
- `/supervisor/appraisals?tab=check-in` dan `?tab=setting` (Supervisor sebagai Approver 1)
- `/hr/approvals?tab=check-in` dan `?tab=setting` (HR sebagai Approver 2)

**FR-APR-002** [WAJIB] Setiap halaman persetujuan HARUS memiliki:
- **Sub-tab "Pending"**: badge merah dengan count pengajuan yang menunggu
- **Sub-tab "Approval History"**: riwayat semua pengajuan

### 17.2 Tabel Persetujuan

**FR-APR-003** [WAJIB] Tabel HARUS memiliki 11 kolom:
No | Aksi | Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit Perusahaan | Jenis Persetujuan | Tanggal Pengajuan | Tanggal Persetujuan

**FR-APR-004** [WAJIB] Semua kolom kecuali "Aksi" HARUS dapat diurutkan. Klik header kolom → ascending; klik lagi → descending.

**FR-APR-005** [WAJIB] Halaman HARUS menggunakan pagination: 8 baris per halaman dengan navigasi «‹[halaman]›».

**FR-APR-006** [WAJIB] Filter HARUS mencakup (multi-select dropdown):
- Unit Perusahaan
- Tahun
- Bulan
- Divisi
- Departemen
- Jenis Persetujuan

**FR-APR-007** [WAJIB] Cakupan data:
- Supervisor: hanya karyawan dalam unit dan divisi supervisor yang bersangkutan
- HR: semua karyawan di semua 8 unit perusahaan

### 17.3 Aksi per Baris (Pending)

**FR-APR-008** [WAJIB] Baris dengan status `"Pending"` HARUS menampilkan:
- Ikon FileCheck → buka **ReviewDrawer** (tab check-in) atau **SettingApprovalDrawer** (tab setting)

**FR-APR-009** [WAJIB] Baris dengan status `"Edit Request"` HARUS menampilkan:
- Tombol amber "Review Request" (ikon FileEdit) → buka **EditRequestReviewModal**

### 17.4 EditRequestReviewModal

**FR-APR-010** [WAJIB] `EditRequestReviewModal` HARUS menampilkan (read-only):
- Nama karyawan, Employee ID, Tipe Persetujuan, Jabatan, Tanggal Pengajuan, Tanggal Request, Alasan Edit

**FR-APR-011** [WAJIB] Modal HARUS memiliki 3 tombol:
- **"Accept Request"** (hijau + CheckCircle2) → status berubah ke "EditRequest-PendingA2"
- **"Reject Request"** (merah + XCircle) → status berubah ke "EditRequest-Rejected"
- **"Cancel"** → tutup modal

### 17.5 ReviewDrawer

**FR-APR-012** [WAJIB] `ReviewDrawer` HARUS menampilkan konten berbeda berdasarkan `module` baris:

| Tipe Modul | Komponen Konten |
|---|---|
| KPI | KPIReview |
| SMART Goals | SmartGoalsApproverReview |
| Appraisal Form | AppraisalFormReview |
| Managerial Skill | ManagerialSkillReview |
| Project | ProjectReview |
| RCA | RCAReviewPreview |

**FR-APR-013** [WAJIB] Header drawer HARUS menampilkan:
- Tombol X tutup
- Badge tipe modul
- Badge status
- Nama karyawan + Jabatan/Departemen/Divisi
- Tanggal pengajuan
- Label peran reviewer ("Approver 1 Review" atau "Approver 2 Review")

**FR-APR-014** [WAJIB] Footer drawer (jika tidak read-only dan belum diproses) HARUS menampilkan:
- Tombol "Request Revision" (amber)
- Tombol "Approve" (hijau) ATAU "Submit Assessment" untuk tipe yang membutuhkan penilaian

**FR-APR-015** [WAJIB] Saat "Request Revision" diklik, drawer HARUS beralih ke `step = "revision"`:
- Textarea "Catatan Revisi" (8 baris, wajib diisi minimal 1 karakter)
- Link kembali ke konten
- Tombol "Kirim Revisi" (dinonaktifkan jika textarea kosong)

**FR-APR-016** [WAJIB] Saat "Approve" diklik, sistem HARUS memunculkan `ApproveConfirmModal`:
- Ikon CheckCircle2 hijau
- Nama + ID karyawan
- Tombol "Batal" + "Confirm Approve"

### 17.6 Transisi Status Persetujuan

**FR-APR-017** [WAJIB] Transisi status HARUS mengikuti aturan berdasarkan **tipe modul** DAN **peran approver**:

| Aksi | Approver | Modul | Status Baru |
|---|---|---|---|
| Approve | A1 (Supervisor) | KPI / SMART Goals / RCA | Assessed-Approver 1 |
| Approve | A1 (Supervisor) | Appraisal Form / Project / MS / MI | Approved |
| Approve | A2 (HR) | KPI / SMART Goals / RCA | Assessed-Approver 2 |
| Approve | A2 (HR) | Appraisal Form / Project / MS / MI | Approved |
| Revision | A1 atau A2 | Semua | Revision |
| Accept Edit Request | A1 | — | EditRequest-PendingA2 |
| Accept Edit Request | A2 | — | EditRequest-AcceptedA2 |
| Reject Edit Request | A1 atau A2 | — | EditRequest-Rejected |

**FR-APR-018** [WAJIB] Semua perubahan status HARUS disimpan ke `approvalsStore` dengan stempel waktu dan ID approver.

### 17.7 SettingApprovalDrawer

**FR-APR-019** [WAJIB] `SettingApprovalDrawer` HARUS serupa dengan ReviewDrawer tetapi kontennya menampilkan data **fase Setting** (KPI Setting, SMART Goals Setting, dst.) bukan fase Measurement.

**FR-APR-020** [WAJIB] Untuk tab SMART Goals Setting: konten HARUS dibaca dari `smartGoalsStore` (live data dari pengguna yang bersangkutan) jika tersedia.

### 17.8 Bagian Catatan Approver (dalam ReviewDrawer)

**FR-APR-021** [WAJIB] Bagian "Catatan Approver" HARUS tersedia untuk setiap tipe konten dalam DrawerReview dengan:
- Label: "Catatan Approver 1" (border/latar biru) dan "Catatan Approver 2" (border/latar ungu)
- Textarea yang dapat diedit oleh approver yang relevan
- Indikator "Auto-saved" saat konten berubah

---

## 18. FR-OL — Open Lock (Buka Kunci)

**FR-OL-001** [WAJIB] Halaman Open Lock HARUS tersedia di `/hr/setting/open-lock` (hanya HR Admin).

**FR-OL-002** [WAJIB] 3 kartu ringkasan di atas halaman: Total Request (navy) | Menunggu Approval (amber) | Disetujui (hijau)

**FR-OL-003** [WAJIB] Banner admin HARUS ditampilkan: "Fitur ini hanya dapat diakses oleh admin HR..."

**FR-OL-004** [WAJIB] Dua tab: **"Pending"** (pill + count) | **"History"** (pill + count)

**FR-OL-005** [WAJIB] Filter yang tersedia:
- Input pencarian (nama, NIP, departemen)
- Dropdown Modul (Semua / KPI Tracking / SMART Goals / Appraisal Form)
- Dropdown Divisi
- Dropdown Hasil (Semua / Approved / Rejected) — **hanya di tab History**

**FR-OL-006** [WAJIB] Kolom tab Pending: # | Karyawan | Divisi/Dept | Posisi | Modul | Deadline ("Xh lalu") | Aksi (Detail + Review)
Kolom tab History: tambahkan kolom Akses Hingga | Status

**FR-OL-007** [WAJIB] Tombol "Review" HARUS membuka `ApproveModal` dengan dua tab:

**Tab "Approve & Set Open Date":**
- Field "Buka Akses Hingga *" (DatePickerID, default = hari ini + 3 hari)
- Field "Catatan Admin" (textarea, opsional)
- Tombol "Approve & Buka Akses": dinonaktifkan jika `openUntil.length === 0`

**Tab "Reject":**
- Field "Alasan Penolakan *" (textarea, wajib)
- Catatan: "Alasan penolakan akan disampaikan kepada karyawan."
- Tombol "Tolak Request": dinonaktifkan jika `note.trim().length === 0`

**FR-OL-008** [WAJIB] Setelah Approve: status → `"approved"`, set `approvedUntil`, `approvedAt`, `approvalNote`. Toast: "Open lock disetujui. Karyawan kini dapat mengisi modul hingga tanggal yang ditentukan."

**FR-OL-009** [WAJIB] Setelah Reject: status → `"rejected"`, set `rejectedAt`, `approvalNote`. Toast: "Request ditolak dan catatan alasan telah disimpan."

---

## 19. FR-DASH-EMP — Dashboard Karyawan

**FR-DASH-EMP-001** [WAJIB] Dashboard Karyawan (`/employee`) HARUS menampilkan linimasa 4 tahap siklus penilaian dengan status masing-masing.

**FR-DASH-EMP-002** [WAJIB] Setiap tahap HARUS menampilkan:
- Nomor tahap (lingkaran)
- Label tahap
- Status (Completed / Pending Action / Not Started)
- Tanggal milestone

**FR-DASH-EMP-003** [WAJIB] Warna badge status:
- Completed: hijau
- Pending Action: oranye
- Not Started: abu-abu

**FR-DASH-EMP-004** [WAJIB] Untuk tahap 2 (Pending Action), tombol aksi HARUS ditampilkan menuju setiap modul yang perlu diselesaikan:
- KPI → `/employee/mid-year/kpi`
- SMART Goals → `/employee/mid-year/smart-goals`
- Appraisal Form → `/employee/mid-year/appraisal-form`
- Project Outside Job Scope → `/employee/mid-year/project-outside`

---

## 20. FR-DASH-SUP — Dashboard Supervisor

### 20.1 Tab My Dashboard

**FR-DASH-SUP-001** [WAJIB] Tab My Dashboard HARUS menampilkan:

**AppraisalSummaryCards (4 kartu):**
- Current Score: nilai numerik dengan 1 desimal
- Current Grade: huruf grade (A+/A/B/C/D/E)
- Modules Approved: "N dari 4" (N = modul yang sudah disetujui)
- Last Updated: tanggal update terakhir

**FR-DASH-SUP-002** [WAJIB] Kartu "Modules Approved" HARUS dapat diklik → membuka `ModuleApprovalPopup`.

**FR-DASH-SUP-003** [WAJIB] `ModuleApprovalPopup` HARUS memiliki 4 tab: KPI Tracking | SMART Goals | Appraisal Form | Managerial Skill. Per tab: rantai 4 langkah (Check → Approver 1 → Approver 2 → Validate). Status tiap langkah: completed (hijau) / in_progress (amber) / pending (abu-abu).

**FR-DASH-SUP-004** [WAJIB] `MilestoneProgress` HARUS menampilkan 4 tahap dengan progress bar:

| Tahap | Status | Progress % |
|---|---|---|
| Setting | Done | 100% |
| Measurement | On Progress | 66% |
| Evaluation | Not Started | 0% |
| Dialogue | Not Started | 0% |

**FR-DASH-SUP-005** [WAJIB] Nilai progress numerik HARUS dicompute: Not Started=0%, Submitted=33%, On Progress=66%, Done=100%.

### 20.2 Tab Approval Dashboard

**FR-DASH-SUP-006** [WAJIB] Tab Approval Dashboard HARUS menampilkan 4 kartu statistik:
- Total Pending (navy)
- Urgent (rose) — 5 item tertua secara otomatis
- Assessments Due (amber)
- Approvals Needed (hijau)

**FR-DASH-SUP-007** [WAJIB] Filter modul (pill yang dapat diklik): All | KPI | SMART Goals | Appraisal Form | Project | RCA

**FR-DASH-SUP-008** [WAJIB] Input pencarian HARUS memfilter berdasarkan nama karyawan atau Employee ID.

**FR-DASH-SUP-009** [WAJIB] Toggle **"Urgent Only"** HARUS menyembunyikan item non-urgent.

**FR-DASH-SUP-010** [WAJIB] **Aturan Urgent**: 5 item dengan `submittedDate` paling lama (terlama) dari daftar yang difilter HARUS secara otomatis ditandai Urgent, terlepas dari nilai field `urgent` asli.

**FR-DASH-SUP-011** [WAJIB] Item Urgent HARUS ditampilkan dengan border rose dan banner rose: "Urgent — Immediate Action Required".

**FR-DASH-SUP-012** [WAJIB] Tombol aksi per item HARUS menavigasi ke halaman Approvals yang sesuai:
- "Approve" (navy) → `/supervisor/appraisals?tab=check-in`
- "Complete Assessment" (hijau) → `/supervisor/appraisals?tab=check-in`
- "Review & Validate" (amber) → `/supervisor/appraisals?tab=check-in`
- RCA → `/supervisor/appraisals?tab=setting`

**FR-DASH-SUP-013** [WAJIB] Dua grafik HARUS ditampilkan:
- PieChart (Recharts): distribusi pending per modul
- BarChart: rincian tindakan yang diperlukan per modul

---

## 21. FR-DASH-HR — Analytics Dashboard HR

**FR-DASH-HR-001** [WAJIB] Analytics Dashboard (`/hr`) HARUS menampilkan 4 kartu statistik:
- Total Employees: 205
- Completed Appraisals: auto-computed
- Pending Reviews: auto-computed
- Completion Rate: `(completed / total) × 100` (1 desimal)

**FR-DASH-HR-002** [WAJIB] Filter tersedia: Unit Perusahaan | Tahun (2026–2023) | Bulan. Filter HARUS memengaruhi semua grafik kecuali Bar Chart Unit Perusahaan.

**FR-DASH-HR-003** [WAJIB] **Bar Chart Unit Perusahaan** HARUS SELALU menampilkan semua 8 unit perusahaan tanpa dipengaruhi filter apapun (termasuk filter Unit Perusahaan).

**FR-DASH-HR-004** [WAJIB] 3 grafik yang difilter:
- Donut chart: distribusi Selesai/Dalam Proses/Tertunda
- Bar chart Divisi: per divisi dalam unit yang dipilih
- Bar chart Departemen: per departemen

**FR-DASH-HR-005** [WAJIB] Warna serie konsisten: Selesai = indigo | Dalam Proses = amber | Tertunda = rose

**FR-DASH-HR-006** [WAJIB] Tabel Division Breakdown HARUS memiliki kolom:
DIVISI | TOTAL KARYAWAN | SELESAI | DALAM PROSES | TERTUNDA | COMPLETION RATE (+ progress bar inline)

**FR-DASH-HR-007** [WAJIB] Completion Rate per divisi = `(Selesai / Total) × 100` (1 desimal).

---

## 22. FR-MON — Modul Monitoring

### 22.1 Pola Umum

**FR-MON-001** [WAJIB] Semua halaman monitoring (6 halaman, per peran Supervisor dan HR) HARUS mengikuti pola:
- Header: judul modul + badge tahun + badge cakupan ("My Team" untuk Supervisor)
- 4 kartu statistik
- Filter: input pencarian + dropdown status (beberapa halaman)
- Tabel utama
- Panel breakdown bawah (opsional)

**FR-MON-002** [WAJIB] Cakupan data:
- Supervisor: hanya karyawan dalam unit dan divisi supervisor (data dibatasi di sisi backend/mock)
- HR: semua karyawan di semua 8 unit

### 22.2 KPI Monitoring

**FR-MON-003** [WAJIB] 4 kartu: Team Members | Submitted (+ "N belum selesai") | Avg. Achievement | Pending RCA

**FR-MON-004** [WAJIB] Kolom tabel: Employee | Company Unit | Total KPI | Submitted (x/total) | Avg. Achievement (progress bar + %) | RCA Req. | RCA Done | Status | Last Updated

**FR-MON-005** [WAJIB] Panel Perspektif Breakdown HARUS menampilkan bar horizontal per perspektif BSC (Finansial/Proses/EHS/Customer/L&G) dengan warna:
- ≥90%: hijau / ≥75%: biru / ≥60%: amber / <60%: rose

### 22.3 SMART Goals Monitoring

**FR-MON-006** [WAJIB] Kolom tambahan: Goals (count) | Evidence (x/total) | Completion (bar) | S·M·A·R·T (5 titik berwarna)

**FR-MON-007** [WAJIB] Titik S·M·A·R·T HARUS menggunakan warna:
- ≥4: hijau / ≥3: biru / ≥2: amber / <2: rose

### 22.4 Appraisal Form Monitoring

**FR-MON-008** [WAJIB] 4 kartu: Team Members | Self-Assessment Done | Supervisor Assessment Done | Avg. Final Score

**FR-MON-009** [WAJIB] Kolom: Self-Assessment (badge status) | Supervisor Assessment (badge status) | Self Score | Approver 1 Score | Approver 2 Score | Final Score

**FR-MON-010** [WAJIB] ScorePill HARUS mengkonversi skor 1–5 ke persentase (×20) dengan warna:
- ≥90%: hijau / ≥70%: biru / ≥50%: amber / <50%: rose

**FR-MON-011** [WAJIB] Status Assessment:
- "Selesai" (hijau + CheckCircle2)
- "Dalam Proses" (amber + Clock)
- "Belum Mulai" (abu-abu + AlertCircle)

### 22.5 Managerial Skill Monitoring

**FR-MON-012** [WAJIB] 5 kompetensi HARUS dihitung skor-nya per karyawan:
- Self Score = rata-rata `selfScore` (hanya yang > 0)
- Approver 1 Score = rata-rata `supScore` (hanya jika `supervisorStatus = "Selesai"`)
- Final Score = `(selfAvg + approver1Avg) / 2` (hanya jika keduanya ada)

### 22.6 Project Monitoring

**FR-MON-013** [WAJIB] Panel infografis partisipasi HARUS menampilkan per unit: tingkat submission, jumlah submitted, total karyawan.

**FR-MON-014** [WAJIB] Baris tabel HARUS dapat diperluas (expandable row) → menampilkan kartu detail per proyek.

**FR-MON-015** [WAJIB] MiniProgressBar (tinggi 1.5px) HARUS menggunakan warna:
- 100%: hijau / ≥60%: biru / ≥30%: amber / >0%: rose / 0%: abu-abu

### 22.7 Management Interview Monitoring

**FR-MON-016** [WAJIB] Dua tab: "Team Overview" (status interview per anggota) | "HR Schedules" (data dari `interviewScheduleStore`, diperbarui secara reaktif/live)

**FR-MON-017** [WAJIB] Tab "HR Schedules" HARUS subscribe ke `interviewScheduleStore` sehingga perubahan dari halaman HR Scheduling langsung tercermin.

---

## 23. FR-CAL — Kalibrasi

### 23.1 Calibration Setting

**FR-CAL-001** [WAJIB] Halaman Calibration Setting (`/hr/calibration/setting`) HARUS memiliki 3 mode:
- **`edit`**: default; dapat diedit setelah klik "Edit Settings"
- **`preview`**: read-only sebelum submit
- **`submitted`**: terkunci setelah submit

**FR-CAL-002** [WAJIB] **Panel Bobot KPI** (ScorePanel) HARUS menampilkan tabel bobot per modul × tingkat jabatan (lihat §6.1 PRD). Dalam mode edit, sel bobot berubah menjadi input teks (lebar 20px). Baris footer "Total" HARUS menghitung total kolom secara dinamis dan HARUS = 100%.

**FR-CAL-003** [WAJIB] **Panel Scoring/Grading** HARUS menampilkan tabel rentang nilai:

*Mode read-only:* Rentang Skor | Grading | Label

*Mode edit:* Min Score (input) | Max Score (input) | Grade (input) | Label (input) | Warna (color picker) | Tombol Delete

*Tombol "+ Add Range"* HARUS tersedia dalam mode edit.

**FR-CAL-004** [WAJIB] **Panel Distribusi Grade** HARUS menampilkan tabel:
- Kolom: GRADE | PROPORSI (%) | KARYAWAN
- KARYAWAN = `Math.round(totalDivHC × proporsi% / 100)`
- Validasi: jika total proporsi ≠ 100%, sel total menjadi merah dengan pesan error

**FR-CAL-005** [WAJIB] **Panel Proporsi HC (Hierarkis)** HARUS menampilkan 3 tingkat:

*Divisi (8 baris):* HC | Share Kuota % | A+ | A | B | C | D | E | JUMLAH

*Departemen (16 baris):* + kolom DIVISI; Share Kuota turunan dari divisi induk

*Bagian (32 baris):* + kolom DEPARTEMEN; Share Kuota turunan dari departemen induk

**FR-CAL-006** [WAJIB] **Aturan Kaskade HC**:
- Set HC Divisi → distribusi rata ke departemen → distribusi rata ke bagian
- Set HC Departemen → dibatasi oleh HC divisi induk; distribusi rata ke bagian
- Set HC Bagian → dibatasi oleh HC departemen induk
- Perubahan HC di level lebih atas HARUS mengupdate level di bawahnya secara otomatis

**FR-CAL-007** [WAJIB] Alur submit:
1. "Edit Settings" → aktifkan mode edit
2. "Save Changes" → aktifkan `isSaved = true`
3. "Preview" (ikon Eye) → mode preview
4. "Submit" → `SubmitConfirmModal`
5. Konfirmasi → `pageMode = "submitted"` + simpan ke `localStorage`:
   - Key `calibration_submitted_units`: array unit yang disubmit
   - Key `calibration_submitted_at`: ISO timestamp

**FR-CAL-008** [WAJIB] `SubmitConfirmModal` HARUS menampilkan peringatan: "Data tidak dapat diedit sampai approval manajemen selesai."

**FR-CAL-009** [WAJIB] Dalam mode `submitted`, banner amber HARUS ditampilkan: "Calibration setting has been submitted and is Pending Approval Management."

### 23.2 Calibration Adjustment

**FR-CAL-010** [WAJIB] Halaman Calibration Adjustment (`/hr/calibration/adjustment`) HARUS:
1. Membaca data dari `localStorage` key `calibration_submitted_units` dan `calibration_submitted_at`
2. Menampilkan banner info jika data ada: "Setting data loaded from Calibration Setting submission on {tanggal}"
3. Menampilkan banner peringatan amber jika tidak ada: "No submitted data yet. Submit from Calibration Setting first."

**FR-CAL-011** [WAJIB] Sistem HARUS menggenerate **220 karyawan** secara deterministik (berbasis seed `h16`) yang tersebar di 32 Bagian.

**FR-CAL-012** [WAJIB] Skor akhir per karyawan HARUS dihitung menggunakan bobot sesuai tingkat jabatan:

| Level | KPI | SMART Goals | AF | MS | MI | Project |
|---|---|---|---|---|---|---|
| Operasional | 50% | 20% | 15% | 0% | 0% | 15% |
| Pengawas | 40% | 15% | 15% | 15% | 0% | 15% |
| Kepala Bagian | 40% | 15% | 15% | 15% | 0% | 15% |
| Kepala Departemen | 40% | 15% | 15% | 20% | 0% | 10% |
| Kepala Divisi | 40% | 10% | 10% | 20% | 10% | 10% |

**FR-CAL-013** [WAJIB] Batas penyesuaian nilai (adjuster) HARUS mengikuti:
- `minFinal = base × 0.95` (batas bawah, -5%)
- `maxFinal = base × 1.05` (batas atas, +5%)
- Langkah slider: `base × 0.01` (1% dari base)

**FR-CAL-014** [WAJIB] Delta penyesuaian HARUS ditampilkan dengan warna:
- > 0: `text-emerald-600`
- < 0: `text-red-500`
- = 0: `text-gray-800`

**FR-CAL-015** [WAJIB] 5 filter dropdown tersedia: Divisi | Departemen (cascade dari Divisi) | Bagian (cascade dari Dept) | Posisi | Grade

**FR-CAL-016** [WAJIB] Filter Departemen HARUS menampilkan hanya departemen yang berada di bawah divisi yang dipilih. Filter Bagian HARUS menampilkan hanya bagian di bawah departemen yang dipilih.

**FR-CAL-017** [WAJIB] 3 kartu ringkasan HARUS menampilkan:
- Total Karyawan (filtered) + "N disesuaikan"
- Distribusi Grade Sebelum Kalibrasi
- Distribusi Grade Setelah Kalibrasi (dengan delta per grade)

**FR-CAL-018** [WAJIB] Kolom tabel (20 kolom):
# | Karyawan (nama+NIP+ikon Eye) | Divisi | Departemen | Bagian | Posisi | KPI (kunci🔒) | Project (kunci🔒) | SMART Goals | Appraisal Form | Managerial Skill | Mgmt Interview | Nilai Akhir (adjuster ±5%) | Grade | Aksi (komentar + evidence)

**FR-CAL-019** [WAJIB] Kolom KPI dan Project HARUS dalam kondisi kunci (read-only, ditandai ikon Lock).

**FR-CAL-020** [WAJIB] Baris yang nilai finalnya disesuaikan HARUS menampilkan kolom Aksi dengan:
- Textarea "Tambah komentar..."
- Area unggah evidence (border putus-putus biru)
- Tombol Reset (ikon RotateCcw, merah) → reset penyesuaian, komentar, dan evidence untuk karyawan tersebut

**FR-CAL-021** [WAJIB] Modal Detail Karyawan (klik ikon Eye) HARUS menampilkan:
- Toggle Tahun: Tahun saat ini / Tahun lalu
- Info Organisasi: Divisi, Departemen, Bagian, Posisi
- Panel Skor: Current (sebelum) + Final (setelah) + delta + bar + perubahan grade
- Catatan Kalibrasi: komentar (amber) + bukti (thumbnail 64×64 untuk gambar, ikon PDF merah)
- Data Pendukung: Project · Kedisiplinan · Pelanggaran + catatan semua approver + RCA

**FR-CAL-022** [WAJIB] Grafik Bell Curve (ComposedChart) HARUS menampilkan:
- Bar Setting (navy, 30% opacity) + bar Aktual (teal, 30% opacity)
- Garis kurva Setting (navy, putus-putus) + garis kurva Aktual (teal, solid)
- Kartu samping: delta aktual vs setting per grade (±%)

---

## 24. FR-SUM — Ringkasan Penilaian Kinerja

**FR-SUM-001** [WAJIB] Halaman Summary tersedia di `/hr/summary` (HR: semua unit) dan `/supervisor/summary` (Supervisor: unit terbatas).

**FR-SUM-002** [WAJIB] 193 karyawan HARUS digenerate secara deterministik (seeded) dengan distribusi:
- A+(11) | A(24) | B(71) | C(51) | D(22) | E(14) = total 193
- Tersebar di 8 unit, 8 divisi, 16 departemen, 32 bagian

**FR-SUM-003** [WAJIB] 5 filter tersedia: Tahun | Unit Perusahaan | Divisi | Departemen | Jabatan

**FR-SUM-004** [WAJIB] Baris ringkasan di atas tabel HARUS menampilkan:
- Total Karyawan (filtered)
- Rata-rata Skor
- Count per grade (A+ hingga E)

**FR-SUM-005** [WAJIB] Panel Distribusi HARUS menampilkan:
- AreaChart bell curve: Target vs Aktual per grade
- BarChart: Target % vs Aktual % berdampingan per grade

**FR-SUM-006** [WAJIB] Tabel utama HARUS memiliki **20 kolom**: Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit | Bergabung | Masa Kerja | Tgl Persetujuan | Skor KPI | Skor SG | Skor Form A | Skor Form B | Skor Form C | Skor Project | Skor MS | Skor MI | Skor Akhir % | Grade Akhir | Aksi (Detail)

**FR-SUM-007** [WAJIB] Kolom yang dapat diurutkan: Nama, Jabatan, Departemen, Divisi, Unit, Tgl Persetujuan, Skor, Grade.

**FR-SUM-008** [WAJIB] Klik tombol Detail HARUS membuka `DetailDrawer` (panel kanan, lebar 520px) dengan:
- Info karyawan 9 field
- Panel skor akhir + grade
- Kartu skor per modul dengan progress bar + bobot %
- Total tertimbang

**FR-SUM-009** [WAJIB] Panel Distribusi per Kelompok HARUS memiliki 4 tab:
- Per Unit Perusahaan
- Per Divisi
- Per Departemen
- Per Jabatan

**FR-SUM-010** [WAJIB] Kolom per tab: Nama Kelompok | Total HC | A+/A/B/C/D/E (count+%) | Delta dari target

**FR-SUM-011** [WAJIB] Indikator Delta HARUS menggunakan warna:
- Oranye: aktual > target + 5 poin persentase
- Biru: aktual < target - 5 poin persentase
- Hijau: dalam rentang ±5 poin persentase

---

## 25. FR-EV — Manajemen Bukti (Evidence)

**FR-EV-001** [WAJIB] Empat halaman Evidence HARUS tersedia di:
- `/hr/evidence/kpi-tracking`
- `/hr/evidence/rca`
- `/hr/evidence/smart-goals`
- `/hr/evidence/management-interview`

**FR-EV-002** [WAJIB] Kolom tabel semua halaman Evidence:
Checkbox | No | Aksi (Eye + Download) | Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit | Periode | Status | Submitted Date

**FR-EV-003** [WAJIB] Kolom tambahan untuk Evidence RCA: Periode singkat | KPI (nama KPI) | Progress APs % (progress bar)

**FR-EV-004** [WAJIB] Filter tersedia (multi-select): Tahun | Unit Perusahaan | Divisi | Departemen | Status Persetujuan
Filter tambahan: Bulan (hanya KPI Tracking) | Periode RCA (hanya RCA) | Progress APs % (hanya RCA)

**FR-EV-005** [WAJIB] Status Persetujuan dan warna:
- Approved: hijau-50 background, ikon CheckCircle2
- Pending: amber-50, ikon Clock
- Revision: orange-50, ikon RotateCcw
- Closed (RCA): hijau-100, ikon CheckCircle2

**FR-EV-006** [WAJIB] Warna bar progress RCA:
- 100% atau Closed: hijau / ≥50%: biru / >0%: amber / 0%: abu-abu

**FR-EV-007** [WAJIB] Checkbox header HARUS memilih/menghapus semua baris yang sedang terfilter.

**FR-EV-008** [WAJIB] Tombol "Export .rar":
- Dinonaktifkan (abu-abu) jika tidak ada baris yang dipilih
- Aktif (navy + badge count) jika ada yang dipilih

---

## 26. FR-MOD — Aktivasi Modul

**FR-MOD-001** [WAJIB] Halaman Module Activation (`/hr/modules`) HARUS menampilkan 6 kartu modul:
KPI | SMART Goals | Appraisal Form | Managerial Skill | Project | Management Interview

**FR-MOD-002** [WAJIB] Setiap kartu HARUS memiliki:
- Indikator status: Aktif (hijau) / Nonaktif (abu-abu)
- Tanggal Mulai (DatePickerID) — dinonaktifkan jika modul nonaktif
- Tanggal Selesai (DatePickerID) — dinonaktifkan jika modul nonaktif
- "Aktivasi Untuk" (MultiSelectDropdown jabatan) — dinonaktifkan jika modul nonaktif
- Tombol "Activate" atau "Deactivate"

**FR-MOD-003** [WAJIB] Opsi jabatan (8 pilihan): Top Management | General Manager | Kepala/Wakil Kepala Divisi | Kepala/Wakil Kepala Departemen | Kepala/Wakil Kepala Bagian | Kepala/Wakil Kepala Seksi Operational | Operasional | All

**FR-MOD-004** [WAJIB] Perilaku MultiSelectDropdown:
- Memilih "All" → hapus semua pilihan individual (dan sebaliknya)
- Memilih semua 7 pilihan individual → otomatis beralih ke "All"
- Display: "Select positions…" (kosong) | "All Positions" | nama jabatan tunggal | "N positions selected"
- Chip jabatan terpilih ditampilkan di bawah dropdown (kecuali "All")

**FR-MOD-005** [WAJIB] Klik "Activate" / "Deactivate" HARUS memunculkan dialog konfirmasi:
- "Apakah Anda yakin ingin {aktifkan|nonaktifkan} modul {label}?"
- Tombol: Batal | Konfirmasi

**FR-MOD-006** [WAJIB] Setelah konfirmasi → toggle state modul → 250ms delay → dialog sukses:
- Ikon CheckCircle2 (emas)
- Judul konfirmasi
- Teks: "The change has been applied successfully."
- Tombol "Done"

---

## 27. FR-USR — Manajemen Pengguna

**FR-USR-001** [WAJIB] Halaman User Management (`/hr/settings/user-management`) HARUS memiliki 2 tab: "User Management" | "User Grouping"

### Tab 1: User Management

**FR-USR-002** [WAJIB] 4 kartu statistik: Total Users (navy) | Active Users (hijau) | Supervisors (biru) | HR Admins (ungu)

**FR-USR-003** [WAJIB] Filter: Show entries (10/25/50) | Role | Company | Status | Input pencarian (nama, ID, email)

**FR-USR-004** [WAJIB] Kolom tabel:
Employee (avatar+nama+ID·jabatan) | Company/Unit | Division | Dept (badge biru) | Grade | Role (badge) | Groupings (badge emerald) | Status (badge+titik) | Last Login | Aksi (Eye+Edit+Delete)

**FR-USR-005** [WAJIB] **ViewModal** (buka dengan Eye): banner gradien + avatar + info + 8 field dalam grid 2 kolom (read-only)

**FR-USR-006** [WAJIB] **EditModal** (Tambah/Edit) HARUS memiliki:
- Input teks (2 kolom): Full Name, Employee ID, Email, Jabatan, Division, Department
- Dropdown: Company/Unit, Grade (4–9), Role ("HR Admin"/"Supervisor"/"Employee"/"— No Role —"), Groupings, Status

**FR-USR-007** [WAJIB] **DeleteModal**: konfirmasi tidak dapat dibatalkan — "Remove [name] (ID: [id]) from the system?" + tombol Delete (merah)

### Tab 2: User Grouping

**FR-USR-008** [WAJIB] 7 kelompok jabatan (urutan hierarki):
Operational | Pengawas/Kepala Bagian | Kepala Departemen | Kepala Divisi | General Manager | COO | Direktur

**FR-USR-009** [WAJIB] **21 aturan pemetaan** jabatan ke kelompok HARUS dapat dikonfigurasi melalui **GroupRuleModal**:
- Field Position/Jabatan (wajib, input teks)
- Field Group (dropdown + preview badge warna)
- Field Description (textarea)
- Tombol Tambah: dinonaktifkan jika position kosong

**FR-USR-010** [WAJIB] Kolom tabel User Grouping: # | Position/Jabatan | Group (badge) | Description | Aksi (Edit+Delete)

---

## 28. FR-ACC — Manajemen Akses (RBAC)

**FR-ACC-001** [WAJIB] Halaman Access Management (`/hr/settings/access-management`) HARUS menampilkan 5 peran bawaan yang tidak dapat dihapus:
1. Administrator
2. Director/COO
3. GM/Coordinator
4. Supervisor
5. Employee

**FR-ACC-002** [WAJIB] HR Admin HARUS dapat membuat **peran kustom** baru. Peran baru mulai dengan semua izin dinonaktifkan.

**FR-ACC-003** [WAJIB] 5 tipe izin tersedia per menu: View | Create | Edit | Delete | Approve

**FR-ACC-004** [WAJIB] Struktur menu (hierarkis, 17+ item): semua menu dalam §4.3 Sidebar HARUS terdaftar.

**FR-ACC-005** [WAJIB] Tabel izin: Kolom Menu/Modul (indent per kedalaman) | View | Create | Edit | Delete | Approve — checkbox per sel

**FR-ACC-006** [WAJIB] Tombol toolbar: Expand All | Collapse All | Input pencarian menu | Reset to Default (RefreshCw) | Save Changes

**FR-ACC-007** [WAJIB] Saat "Save Changes" diklik, `SaveModal` HARUS muncul: "This will update the permissions for all users with the [role] role across the system." + Konfirmasi

**FR-ACC-008** [WAJIB] Setelah simpan: banner sukses inline hijau: "Saved! Permissions for [role] have been updated successfully."

**FR-ACC-009** [WAJIB] **AddAccessModal** (Tambah Peran Baru):
- Input "Role Name" (wajib, tidak boleh duplikat)
- Validasi duplikat: "A role with this name already exists."
- Catatan: "Peran baru mulai dengan semua izin dinonaktifkan"

---

## 29. FR-MENU — Manajemen Menu

**FR-MENU-001** [WAJIB] Halaman Menu Management (`/hr/settings/menu-management`) HARUS menampilkan 7 item top-level dalam tabel hierarkis.

**FR-MENU-002** [WAJIB] Kolom tabel: Menu Label (indent per kedalaman) | Path | Ikon | Roles (badge) | Order | Visibility (toggle) | Aksi (Edit+Delete)

**FR-MENU-003** [WAJIB] Toggle Visibility (inline): klik sel Visibility → ubah `isVisible` secara langsung tanpa membuka modal.

**FR-MENU-004** [WAJIB] **EditMenuModal** HARUS memiliki:
- Menu Label (input)
- Path/URL (input)
- Icon Name (input) + Order (number, min 1) — 2 kolom
- Visible to Roles: tombol pill toggle per role (HR Admin / Supervisor / Employee)
- Toggle Visibility: ToggleRight (hijau "Visible") / ToggleLeft (abu-abu "Hidden")

**FR-MENU-005** [WAJIB] Tombol Simpan HARUS menetapkan `saved = true` dan menampilkan "✓ Changes saved" tanpa menutup modal.

---

## 30. FR-MASTER — Master Data

### 30.1 Master KPI

**FR-MASTER-001** [WAJIB] Halaman Master KPI (`/hr/settings/master/kpi`) HARUS menampilkan 7 bagian lookup:

| Key | Label | Ada Deskripsi? |
|---|---|---|
| scope | Scope | Tidak |
| section | Section | Tidak |
| perspektif | Perspektif | Tidak |
| satuan | Satuan | Tidak |
| period | Period | Tidak |
| trackingPeriod | Tracking Period | Tidak |
| cascading | Cascading | Ya (Code + Role Name) |

**FR-MASTER-002** [WAJIB] Setiap kartu bagian HARUS memiliki: header (titik berwarna + label + badge count) + tombol Tambah + daftar item dengan ikon Edit dan Delete saat hover.

**FR-MASTER-003** [WAJIB] **ItemModal** (Tambah/Edit):
- Field "Value" (wajib; tekan Enter untuk submit)
- Bagian Cascading: tambah field "Code/Abbreviation" + "Role Name"
- Tombol "Add" / "Update" (dinonaktifkan jika value kosong)

**FR-MASTER-004** [WAJIB] **Konfirmasi Hapus**: "Delete item?" + preview nilai + Batal + "Delete" (merah)

**FR-MASTER-005** [WAJIB] Data Master KPI HARUS disimpan ke `masterKpiStore` dan dibaca oleh KPISetting saat membangun dropdown.

### 30.2 Master Appraisal Form

**FR-MASTER-006** [WAJIB] Halaman Master Appraisal Form (`/hr/settings/master/appraisal-form`) HARUS memiliki 3 tab: A | B | C

**FR-MASTER-007** [WAJIB] Setiap item HARUS menampilkan: No | Label (italic bold) | Deskripsi | Tombol "Edit Indikator"

**FR-MASTER-008** [WAJIB] "Edit Indikator" HARUS membuka `EditModal` dengan 5 textarea (satu per indikator skor 1–5).

**FR-MASTER-009** [WAJIB] Tombol "Tambah Item" HARUS membuka `AddItemModal` (validasi: `deskripsi.trim().length > 0`). Setelah tambah: nomor urut disesuaikan otomatis.

**FR-MASTER-010** [WAJIB] Hapus item → nomor urut disesuaikan ulang (1, 2, 3...).

**FR-MASTER-011** [WAJIB] Tombol "Reset Default" HARUS mengembalikan data ke nilai bawaan `FORMS`.

### 30.3 Master Managerial Skill

**FR-MASTER-012** [WAJIB] Halaman Master Managerial Skill (`/hr/settings/master/managerial-skill`) menggunakan pola yang sama dengan Master Appraisal Form.

**FR-MASTER-013** [WAJIB] Bobot tetap 20% HARUS ditampilkan sebagai informasi read-only.

**FR-MASTER-014** [WAJIB] Data diambil dari `MS_ITEMS` (import dari `ManagerialSkillCheckIn`).

---

## 31. FR-SYNC — Sinkronisasi Data

**FR-SYNC-001** [WAJIB] Halaman Data Sync (`/hr/settings/data-sync`) HARUS menampilkan 4 item sync:
1. All Data — sync semua sekaligus
2. Data Summary Absensi
3. Data Jumlah Karyawan
4. Data Pelanggaran

**FR-SYNC-002** [WAJIB] Status per item:
- `idle`: abu-abu, ikon Clock, "Not synced"
- `syncing`: biru, ikon RefreshCw (rotasi + `animate-pulse`), "Menyinkron..."
- `success`: hijau, ikon CheckCircle2, "Berhasil" + timestamp
- `error`: merah, ikon AlertCircle, "Gagal"

**FR-SYNC-003** [WAJIB] Perilaku checkbox:
- Centang "All Data" → centang semua 4 item
- Centang semua anak → auto-centang "All Data"
- Hapus centang satu anak → hapus centang "All Data"

**FR-SYNC-004** [WAJIB] Tombol "Sync Now" HARUS dinonaktifkan jika: tidak ada item dipilih ATAU sedang ada sync berjalan.

**FR-SYNC-005** [WAJIB] Proses sync HARUS: set item ke `syncing` → setelah 1.2 detik per item (staggered) → set ke `success` + catat timestamp. Setiap item berjalan berurutan (staggered), bukan paralel.

---

## 32. FR-AUDIT — Audit Trail

**FR-AUDIT-001** [WAJIB] Halaman Audit Trail (`/hr/settings/audit-trail`) HARUS menampilkan 4 kartu statistik:
- Total Logs (navy)
- Successful (hijau)
- Failed (merah)
- Today (biru) — log hari ini

**FR-AUDIT-002** [WAJIB] Tipe aksi dan warna badge:

| Tipe | Warna |
|---|---|
| Login | Biru |
| Logout | Abu-abu |
| Create | Hijau |
| Update | Amber |
| Delete | Merah |
| Approve | Ungu |
| Reject | Oranye |
| Export | Cyan |

**FR-AUDIT-003** [WAJIB] Filter tersedia:
- Show entries (10/25/50)
- Module (semua modul utama)
- Sub Module (kontekstual — hanya muncul jika modul yang dipilih memiliki sub-modul; dinonaktifkan jika tidak ada; reset ke "All Sub Modules" saat modul berubah)
- Action
- Status (Success/Failed)
- Date Range toggle: From (DatePickerID) + To (DatePickerID) + tombol "Clear"
- Input pencarian (nama user, ID, deskripsi, IP address)
- Tombol Reset (RefreshCw) + Tombol Export (Download)

**FR-AUDIT-004** [WAJIB] Sub-modul kontekstual:
- KPI: KPI Setting | KPI Tracking | Monitoring
- Performance Appraisal: Measurement | Appraisal Form | Approvals
- SMART Goals: SMART Goals Setting | SMART Goals Tracking
- HR Settings: User Management | Access Management | Menu Management | Approval Management | Audit Trail | Data Sync | Open Lock

**FR-AUDIT-005** [WAJIB] Kolom tabel:
# | Timestamp | User (nama+ID·role) | Action (badge) | Module (badge navy) | Sub Module (pill biru) | Section/Table | Description (clamp 2 baris) | IP Address | Status (titik+teks) | Aksi (Eye)

**FR-AUDIT-006** [WAJIB] **DetailModal** (klik Eye) HARUS menampilkan:
- Grid 2 kolom: ID, Timestamp, IP, User, Role, Status
- Module badge + Sub Module pill + Section/Table + Action badge + Description (teks penuh)
- Panel **Before** (latar merah-50) + **After** (latar hijau-50): JSON pre-formatted berdampingan
- Panel Before/After HARUS tersembunyi jika tidak ada data before/after

---

## 33. FR-PROF — Profil Karyawan

**FR-PROF-001** [WAJIB] Halaman Profil tersedia di: `/hr/profile`, `/supervisor/profile`, `/employee/profile`.

**FR-PROF-002** [WAJIB] Pemilih Tahun HARUS tersedia: 2026 ("In Progress" amber) | 2025 | 2024 | 2023 ("Done" hijau untuk tahun yang sudah selesai).

**FR-PROF-003** [WAJIB] 4 kartu statistik per tahun yang dipilih:
- Skor/Nilai: nilai numerik dengan 1 desimal
- Grade: huruf grade + sub-label (Outstanding/Good/Average/dll.)
- Modules Approved: "N dari M"
- Last Updated: tanggal

**FR-PROF-004** [WAJIB] 3 tab konten:

**Tab 1 — Overview:**
- BarChart (Recharts) per modul dengan nilai dan bobot
- Kartu hasil per modul dengan progress bar + catatan approver

**Tab 2 — Module Results:**
- Banner status (In Progress / Final)
- Kartu per modul yang dapat diperluas (expandable) menampilkan sub-hasil + BarChart internal

**Tab 3 — KPI Detail:**
- 4 kartu ringkasan KPI
- Tabel indikator KPI: No | KPI | Target | Capaian | Skor (progress bar) | Grade

**FR-PROF-005** [WAJIB] `ProgressRing` HARUS menggunakan SVG circle dengan `stroke-dashoffset` yang dianimasikan.

---

## 34. FR-DOC — Halaman Dokumen

**FR-DOC-001** [WAJIB] Halaman Dokumen tersedia di: `/hr/documents`, `/supervisor/documents`, `/employee/documents`.

**FR-DOC-002** [WAJIB] 7 tab tersedia: Overview | KPI | SMART Goals | Appraisal Form | Project Outside Job Scope | Managerial Skill | RCA

**FR-DOC-003** [WAJIB] Tipe dokumen dan warna badge:
- Guide: navy `#1A284F`
- Template: amber
- Reference: teal
- FAQ: ungu

**FR-DOC-004** [WAJIB] Input pencarian HARUS memfilter berdasarkan: judul, deskripsi, judul bagian, konten bagian (case-insensitive, dalam tab aktif).

**FR-DOC-005** [WAJIB] Accordion: bagian pertama terbuka secara default; tiap bagian dapat dibuka/tutup secara independen.

**FR-DOC-006** [WAJIB] Dokumen di setiap tab HARUS mencakup:
- **Overview**: panduan siklus penilaian, checklist quick-start
- **KPI**: panduan setting target, rumus tracking, kondisi RCA (<80%)
- **SMART Goals**: framework SMART, syarat minimum 3 tujuan
- **Appraisal Form**: penilaian kompetensi, skala 1–5, split 30%/70%
- **Managerial Skill**: untuk Grade 7+, 5 kompetensi, bobot 10%
- **RCA**: metodologi 5 Why (A→B→C→D), kondisi trigger, syarat AP

---

## 35. FR-SCORE — Model Penilaian & Kalkulasi

### 35.1 Bobot Modul per Tingkat Jabatan

**FR-SCORE-001** [WAJIB] Bobot modul HARUS dikonfigurasi per tingkat jabatan:

| Modul | Operasional | Pengawas s/d Kep. Bagian | Kepala Departemen | Kepala Divisi ke atas |
|---|---|---|---|---|
| KPI | 50% | 40% | 40% | 40% |
| SMART Goals | 20% | 15% | 15% | 10% |
| Appraisal Form | 15% | 15% | 15% | 10% |
| Project Outside | 15% | 15% | 10% | 10% |
| Managerial Skill | 0% | 15% | 20% | 20% |
| Mgmt Interview | 0% | 0% | 0% | 10% |
| **Total** | **100%** | **100%** | **100%** | **100%** |

### 35.2 Perhitungan Capaian KPI

**FR-SCORE-002** [WAJIB] Perhitungan capaian per KPI per bulan:

```javascript
// Polaritas Maximize
capaian% = (realisasi / target) × 100

// Polaritas Minimize
capaian% = min(100%, (target / realisasi) × 100)
// Jika realisasi === 0, capaian = 100%
// Jika target === 0, capaian = 0%

// Mode Ratio (contoh multiplier = 6)
skor = (negatif === 0 || positif >= negatif × 6) ? 100 : 0
```

**FR-SCORE-003** [WAJIB] Trigger RCA: capaian < **80%** untuk bulan manapun.

### 35.3 Total KPI 2026

**FR-SCORE-004** [WAJIB] Berdasarkan `formula` tiap KPI:
- **"Nilai Akhir"**: nilai capaian bulan Desember (atau bulan terakhir yang diisi)
- **"Rata-Rata"**: `sum(capaian_bulanan) / jumlah_bulan_diisi`
- **"Jumlah"**: `sum(realisasi_bulanan)` (bukan capaian %, melainkan nilai realisasi)

### 35.4 Skor Appraisal Form

**FR-SCORE-005** [WAJIB]:
```
avgSelf_X = mean(skor_self semua item Form X)
avgApprover_X = mean(skor_approver semua item Form X)
avgForm_X = (avgSelf_X × 0.30) + (avgApprover_X × 0.70)
konversi_X = (avgForm_X / 5) × 100
skorFinal_X = (avgForm_X / 5) × bobot_X%
totalAppraisalForm = skorFinal_A + skorFinal_B + skorFinal_C
```

### 35.5 Skor SMART Goals

**FR-SCORE-006** [WAJIB]:
```javascript
function getBobotByPosition(position) {
  if (contains(position, ['Kepala', 'Direktur'])) return 40;
  if (contains(position, ['Manager'])) return 35;
  if (contains(position, ['Supervisor', 'Leader', 'Koordinator'])) return 30;
  return 25;
}
avgA1 = mean(skor_A1 per tujuan)
avgA2 = mean(skor_A2 per tujuan)
overallAvg = (avgA1 + avgA2) / 2
skorFinalSG = overallAvg × getBobotByPosition(position) / 100
```

### 35.6 Skor Akhir

**FR-SCORE-007** [WAJIB]:
```
skorAkhir% = (skorKPI × bobotKPI%) +
             (skorSG × bobotSG%) +
             (skorAF × bobotAF%) +
             (skorProject × bobotProject%) +
             (skorMS × bobotMS%) +
             (skorMI × bobotMI%)
```

### 35.7 Grade

**FR-SCORE-008** [WAJIB] Grade ditentukan berdasarkan `skorAkhir%` (nilai default yang dapat dikonfigurasi per unit):

| Skor | Grade | Label |
|---|---|---|
| ≥ 90 | A+ | Outstanding |
| 80–89 | A | Good |
| 70–79 | B | Average |
| 60–69 | C | Below Average |
| 50–59 | D | Unsatisfactory |
| < 50 | E | Fail |

**FR-SCORE-009** [WAJIB] Rentang skor ini HARUS dapat dikonfigurasi per unit melalui halaman Scores & Calibration (`/hr/settings/scores-calibration`).

### 35.8 Kalibrasi Penyesuaian

**FR-SCORE-010** [WAJIB]:
```
minFinal = skorDasar × 0.95
maxFinal = skorDasar × 1.05
langkahSlider = skorDasar × 0.01
finalSetelahAdjust = max(minFinal, min(maxFinal, nilaiSlider))
```

---

## 36. Kebutuhan Data Interface

### 36.1 Model Data Pengguna (User)

```typescript
interface User {
  id: string;
  name: string;
  employeeId: string;       // e.g. "E001"
  position: string;
  company: string;          // nama entitas
  division: string;
  department: string;
  grade: string;            // "Grade 4" hingga "Grade 9"
  role: "HR Admin" | "Supervisor" | "Employee" | "";
  groupings: string;        // "All Employee" | "TEAM_UNIT" | "TEAM_DIV"
  status: "Active" | "Inactive";
  lastLogin: string;        // ISO date string
  email: string;
}
```

### 36.2 Model Data KPI Item

```typescript
interface KPIItem {
  no: string;
  section: "A" | "B";
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: "Jumlah" | "Rata-Rata" | "Nilai Akhir";
  bobot: string;            // "10%" — dengan tanda %
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: "Maximize" | "Minimize";
  detailFormula: string;
  keterangan: string;
  subRows?: SubRow[];
  indicatorMode?: "numeric" | "color" | "ratio";
  ratioMultiplier?: number;
  colorIndicator?: boolean;
  monthlyTargets?: Record<string, string>;  // key = "Jan","Feb",...
  scope?: string;
  trackingPeriod?: string;
}

type SubRow = {
  label: string;
  bold?: boolean;
  compute?: ComputeSpec;
}

type ComputeSpec =
  | { type: "ratio"; deps: number[] }
  | { type: "avg"; deps: number[] }
  | { type: "ref"; refIdx: number }
  | { type: "ratio_score"; deps: number[]; altDeps?: number[] }
```

### 36.3 Model Data RCA

```typescript
interface RCAItem {
  id: string;
  no: number;
  periode: string;            // "Jan 2026"
  kpi: string;
  satuan: string;
  baseline: string;
  target: string;
  actual: string;
  masalahBlocks: MasalahBlock[];
  submittedDate?: string;
  status: "Pending-Approver 1" | "Pending-Approver 2" | "Approved" | "Closed";
}

interface MasalahBlock {
  id: string;
  masalahUtama: string;       // A — wajib
  faktorInternal: boolean;
  body?: string;
  kenapaA: string;            // B — wajib
  kenapaB: string;            // C — wajib
  kenapaC: string;            // D — wajib
  actionPlans: ActionPlan[];
}

interface ActionPlan {
  id: string;
  action: string;             // wajib
  targetDate: string;         // wajib
  PIC: string;                // wajib
  status: StatusPerbaikan;
  keterangan?: string;
  output?: string[];
  evidence?: EvidenceFile[];
}

type StatusPerbaikan =
  | "Belum dilaksanakan"
  | "Sedang dilaksanakan"
  | "Selesai"
  | "Ditunda"
  | "Dibatalkan";
```

### 36.4 Model Data SMART Goal

```typescript
interface SmartGoal {
  id: string;
  label: string;              // judul tujuan (editable)
  specific: string;           // wajib
  measurable: string;         // wajib
  attainable: string;         // wajib
  relevant: string;           // wajib
  timely: string;             // wajib
  bukti: string;              // tidak wajib
  target: string;             // wajib
  actionPlans: SmartGoalAP[];
}

interface SmartGoalAP {
  id: string;
  description: string;
  status: SmartGoalAPStatus;
  progress?: number;          // 0–100
  kendala?: string;
  alasanBatal?: string;
  evidence?: EvidenceFile[];
}

type SmartGoalAPStatus =
  | "-"
  | "Belum dilaksanakan"
  | "Sedang dilaksanakan"
  | "Selesai"
  | "Batal";
```

### 36.5 Model Data Approval Row

```typescript
interface ApprovalRow {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  division: string;
  unit: string;
  approvalType: string;       // e.g. "KPI Tracking", "SMART Goals"
  module: "KPI" | "SMART Goals" | "Appraisal Form" | "Project" | "RCA" | "Managerial Skill";
  submittedDate: string;      // ISO date
  approvedDate: string;       // ISO date | "-"
  status: ApprovalStatus;
  notes?: string;
  urgent?: boolean;           // computed saat tampil
}

type ApprovalStatus =
  | "Pending"
  | "Edit Request"
  | "Assessed-Approver 1"
  | "Assessed-Approver 2"
  | "Approved"
  | "Revision"
  | "EditRequest-PendingA2"
  | "EditRequest-AcceptedA2"
  | "EditRequest-Rejected";
```

### 36.6 Model Data Open Lock Request

```typescript
interface OpenLockRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  nip: string;
  divisi: string;
  departemen: string;
  bagian: string;
  posisi: string;
  module: "KPI Tracking" | "SMART Goals" | "Appraisal Form";
  period: string;             // e.g. "Jun-2026"
  originalDeadline: string;   // ISO date
  submittedAt: string;        // ISO datetime
  reason: string;
  status: "pending" | "approved" | "rejected";
  approvedUntil?: string;     // ISO date
  approvedAt?: string;        // ISO datetime
  approvalNote?: string;
  rejectedAt?: string;
}
```

### 36.7 Model Data Interview Schedule

```typescript
interface InterviewSchedule {
  id: string;
  companyUnit: string;
  employees: string[];        // nama karyawan
  interviewers: string[];     // nama interviewer
  otherUsers: string[];
  scheduledDate: string;      // ISO date
  scheduledTime: string;      // "HH:MM"
  location: string;
  notificationText: string;
  attachments: EvidenceFile[];
  status: "Scheduled" | "Cancelled" | "Done";
}
```

### 36.8 Model Data Audit Log

```typescript
interface AuditLog {
  id: string;                 // "A001", "A002", ...
  timestamp: string;          // "YYYY-MM-DD HH:MM:SS"
  userId: string;
  userName: string;
  role: string;
  action: "Login"|"Logout"|"Create"|"Update"|"Delete"|"Approve"|"Reject"|"Export";
  module: string;
  subModule?: string;
  section?: string;
  description: string;
  ipAddress: string;
  status: "Success" | "Failed";
  before?: string;            // JSON stringify
  after?: string;             // JSON stringify
}
```

### 36.9 Model Data Calibration Employee

```typescript
interface CalibrationEmployee {
  id: string;
  name: string;
  nip: string;
  position: string;           // jabatan (digunakan untuk bobot)
  divisi: string;
  departemen: string;
  bagian: string;
  kpiScore: number;
  projectScore: number;
  smartGoalsScore: number;
  appraisalFormScore: number;
  managerialSkillScore: number;
  managementInterviewScore: number;
  baseScore: number;          // skor tertimbang tanpa kalibrasi
  adjustedScore: number;      // nilai final setelah penyesuaian
  grade: string;              // A+/A/B/C/D/E
  adjustment: number;         // delta ±5%
  comment: string;
  evidence: EvidenceFile[];
}
```

---

## 37. Kebutuhan Non-Fungsional Teknis

### 37.1 Teknologi Stack

| Layer | Teknologi |
|---|---|
| Framework | React 18 |
| Routing | React Router v6 (`RouterProvider`, `createBrowserRouter`) |
| Styling | Tailwind CSS (utility-first) |
| Komponen UI | Radix UI (Dialog, Accordion, Tabs) |
| Grafik | Recharts (BarChart, PieChart, AreaChart, ComposedChart) |
| Animasi | motion/react (`AnimatePresence`, transitions) |
| Ikon | Lucide React |
| Toast | Sonner |
| File Excel | XLSX library (ekspor/impor) |
| State global | In-memory module-level stores + localStorage |

### 37.2 Manajemen State

**FR-NFT-001** [WAJIB] Store bersama berikut HARUS diimplementasikan sebagai modul singleton (in-memory + localStorage):

| Store | Key localStorage | Method |
|---|---|---|
| `approvalsStore` | — (in-memory) | `saveOverride()`, `applyOverrides()`, `saveAssessment()`, `loadAssessment()` |
| `smartGoalsStore` | — (in-memory) | `saveSubmittedGoals()`, `loadSubmittedGoals()` |
| `projectStore` | — (in-memory) | `submitAll()`, `projects` (array) |
| `interviewScheduleStore` | — (in-memory, reaktif) | `saveSchedule()`, `clearSchedule()`, `subscribe()` |
| `masterKpiStore` | `master_kpi_data` | CRUD 7 bagian |

**FR-NFT-002** [WAJIB] Key localStorage yang digunakan:

| Key | Format | Dikelola oleh |
|---|---|---|
| `calibration_submitted_units` | JSON array string (nama unit) | CalibrationSetting (write), CalibrationAdjustment (read) |
| `calibration_submitted_at` | ISO timestamp string | CalibrationSetting (write), CalibrationAdjustment (read) |
| `rca_submissions` | JSON array RCAItem[] | RCAPage (read/write) |

### 37.3 Routing

**FR-NFT-003** [WAJIB] Sistem HARUS menggunakan `createBrowserRouter` dari React Router v6 dengan lazy loading per rute (`React.lazy + Suspense`).

**FR-NFT-004** [WAJIB] Layout portal HARUS menggunakan outlet pattern: satu `AppLayout` komponen membungkus semua rute portal melalui `<Outlet />`.

### 37.4 Performa Rendering

**FR-NFT-005** [PENTING] Grafik Recharts pada halaman yang menampilkan banyak data (AnalyticsDashboard, CalibrationAdjustment) HARUS menggunakan `isAnimationActive={false}` untuk meningkatkan performa rendering.

**FR-NFT-006** [PENTING] Tabel dengan >100 baris (CalibrationAdjustment: 220 karyawan) HARUS mengimplementasikan virtual scrolling atau pagination (max 50 baris per halaman).

### 37.5 Responsivitas

**FR-NFT-007** [WAJIB] Lebar layar minimum yang didukung: **1280px** (laptop standar perusahaan).

**FR-NFT-008** [WAJIB] Tabel yang memiliki banyak kolom (KPI Tracking, Calibration Adjustment) HARUS mendukung scroll horizontal (`overflow-x-auto`).

**FR-NFT-009** [WAJIB] Kolom No, Perspektif, dan KPI pada tabel KPI Tracking HARUS dalam kondisi sticky kiri (`position: sticky; left: 0; z-index: 10`).

### 37.6 Aksesibilitas

**FR-NFT-010** [WAJIB] Semua tombol yang hanya menggunakan ikon (tanpa label teks) HARUS memiliki atribut `title` atau `aria-label`.

**FR-NFT-011** [WAJIB] Semua input formulir HARUS memiliki label yang jelas (melalui `<label>` atau `aria-label`).

**FR-NFT-012** [WAJIB] Modal/drawer yang terbuka HARUS memerangkap fokus keyboard di dalamnya. Saat modal ditutup, fokus HARUS dikembalikan ke elemen yang membuka modal.

**FR-NFT-013** [WAJIB] Tombol dalam kondisi disabled HARUS menggunakan `cursor-not-allowed` dan `opacity-40` atau `opacity-60`.

### 37.7 Tanggal & Waktu

**FR-NFT-014** [WAJIB] TODAY yang digunakan dalam sistem approval HARUS menggunakan konstanta `"08/06/2026"` (format lokal Indonesia) untuk mock data.

**FR-NFT-015** [WAJIB] Semua input tanggal HARUS menggunakan komponen `DatePickerID` yang sesuai konvensi format tanggal Indonesia.

### 37.8 Umpan Balik Pengguna (User Feedback)

**FR-NFT-016** [WAJIB] Toast notification HARUS menggunakan library `sonner` dan ditampilkan selama 3–3.5 detik sebelum auto-dismiss.

**FR-NFT-017** [WAJIB] Posisi toast: pojok kanan atas atau pojok kanan bawah layar (konsisten di seluruh aplikasi).

**FR-NFT-018** [WAJIB] Setiap aksi destruktif atau ireversibel (hapus, submit, approve) HARUS melalui minimal satu dialog konfirmasi sebelum dieksekusi.

**FR-NFT-019** [WAJIB] Modal sukses HARUS ditampilkan setelah konfirmasi berhasil diproses. Modal sukses HARUS memiliki tombol "Done" / "Tutup" untuk menutupnya.

### 37.9 Warna Brand

**FR-NFT-020** [WAJIB] Warna utama brand HARUS konsisten:
- Navy: `#1A284F` — tombol utama, item aktif, header, badge
- Gold: `#C69A45` — aksi sekunder, highlight, submit final
- Background abu-abu muda sidebar: `#F4F6FC`

---

## 38. Matriks Kebutuhan × Peran

| Modul | Karyawan | Supervisor | HR Admin |
|---|---|---|---|
| FR-AUTH | ✓ | ✓ | ✓ |
| FR-SHELL | ✓ | ✓ | ✓ |
| FR-SEARCH | — | ✓ | ✓ |
| FR-NOTIF | ✓ | ✓ | ✓ |
| FR-KPIS | ✓ (sebagai input) | ✓ (approver + diri) | ✓ (corporate) |
| FR-KPIT | ✓ | ✓ | — |
| FR-RCA | ✓ | ✓ | — |
| FR-SG | ✓ | ✓ | — |
| FR-SGC | — | ✓ | — |
| FR-AF | ✓ | ✓ | — |
| FR-MS | — | ✓ | — |
| FR-MI | — | ✓ | ✓ (scheduling) |
| FR-PO | ✓ | ✓ | — |
| FR-PC | ✓ | ✓ | — |
| FR-APR | — | ✓ (A1) | ✓ (A2) |
| FR-OL | ✓ (requester) | — | ✓ (approver) |
| FR-DASH-EMP | ✓ | — | — |
| FR-DASH-SUP | — | ✓ | — |
| FR-DASH-HR | — | — | ✓ |
| FR-MON | — | ✓ (tim sendiri) | ✓ (semua) |
| FR-CAL | — | — | ✓ |
| FR-SUM | — | ✓ (terbatas) | ✓ (semua) |
| FR-EV | — | — | ✓ |
| FR-MOD | — | — | ✓ |
| FR-USR | — | — | ✓ |
| FR-ACC | — | — | ✓ |
| FR-MENU | — | — | ✓ |
| FR-MASTER | — | — | ✓ |
| FR-SYNC | — | — | ✓ |
| FR-AUDIT | — | — | ✓ |
| FR-PROF | ✓ | ✓ | ✓ |
| FR-DOC | ✓ | ✓ | ✓ |
| FR-SCORE | Membaca skor | Membaca + input | Konfigurasi |

---

*Dokumen FRD ini adalah referensi teknis yang hidup (living document) dan harus diperbarui setiap kali ada perubahan atau penambahan fitur pada sistem Performance Appraisal Hub.*

*Versi terakhir: September 2026 | Dibuat berdasarkan analisis kode sumber 43 halaman dari sistem mockup yang sudah dibangun.*
