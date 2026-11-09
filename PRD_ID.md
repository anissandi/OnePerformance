# Dokumen Kebutuhan Produk (Product Requirements Document)
## Performance Appraisal Hub — Sambu Group
### Versi Detail untuk Tim Development

| Kolom | Nilai |
|---|---|
| Versi Dokumen | 2.0 — Detail |
| Status | Draft |
| Tanggal | September 2026 |
| Produk | Performance Appraisal Hub |
| Organisasi | Sambu Group |

---

## Daftar Isi

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Tujuan & Sasaran](#2-tujuan--sasaran)
3. [Peran Pengguna & Persona](#3-peran-pengguna--persona)
4. [Arsitektur Sistem](#4-arsitektur-sistem)
5. [Autentikasi & Navigasi Shell](#5-autentikasi--navigasi-shell)
6. [Model Data & Sistem Penilaian](#6-model-data--sistem-penilaian)
7. [Alur Persetujuan](#7-alur-persetujuan)
8. [Modul Karyawan](#8-modul-karyawan)
9. [Modul Supervisor](#9-modul-supervisor)
10. [Modul HR Administrator](#10-modul-hr-administrator)
11. [Fitur & Halaman Bersama](#11-fitur--halaman-bersama)
12. [Komponen Bersama (Shared Components)](#12-komponen-bersama-shared-components)
13. [State Management & Penyimpanan Data](#13-state-management--penyimpanan-data)
14. [Kebutuhan Non-Fungsional](#14-kebutuhan-non-fungsional)
15. [Di Luar Ruang Lingkup](#15-di-luar-ruang-lingkup)

---

## 1. Ringkasan Eksekutif

**Performance Appraisal Hub** adalah aplikasi web internal Sambu Group yang mendigitalisasi dan memusatkan seluruh siklus penilaian kinerja tahunan dari ujung ke ujung (*end-to-end*). Sistem menggantikan proses manual berbasis spreadsheet dengan platform terstruktur berbasis peran yang mencakup penetapan target, pelacakan KPI, pengukuran tengah tahun, penilaian kompetensi, kalibrasi nilai, dan pelaporan akhir — di seluruh unit perusahaan, divisi, dan departemen dalam Sambu Group.

Sistem mendukung tiga peran pengguna (Karyawan, Supervisor, Administrator HR), rantai persetujuan berlapis empat langkah, dan mesin kalibrasi yang memastikan distribusi nilai akhir sesuai dengan target yang dikonfigurasi per unit bisnis.

**Teknologi:** React 18, React Router, Tailwind CSS, Recharts, Radix UI
**Warna Utama:** Navy `#1A284F` / Gold `#C69A45`
**Tahun Aktif:** 2026

---

## 2. Tujuan & Sasaran

| # | Tujuan | Ukuran Keberhasilan |
|---|---|---|
| 1 | Mendigitalisasi siklus penilaian | 100% pengajuan dilakukan melalui platform (tanpa formulir kertas) |
| 2 | Menerapkan persetujuan berlapis terstruktur | Setiap pengajuan KPI, SMART Goals, dan Formulir Penilaian melewati Check → Approver 1 → Approver 2 → Validate |
| 3 | Memungkinkan pemantauan real-time | HR dan Supervisor dapat melihat tingkat penyelesaian per unit/divisi/departemen kapan saja |
| 4 | Memastikan distribusi nilai terkalibrasi | Output nilai akhir sesuai dengan proporsi target yang dikonfigurasi per unit |
| 5 | Menyediakan jejak audit lengkap | Setiap perubahan status dicatat dengan stempel waktu, ID pengguna, dan nilai sebelum/sesudah |
| 6 | Mendukung manajemen multi-entitas | Seluruh 7–8 entitas Sambu Group dikelola dari satu platform |

---

## 3. Peran Pengguna & Persona

### 3.1 Karyawan
Staf reguler yang melengkapi komponen penilaian mereka sendiri.

**Tanggung jawab:**
- Menetapkan target KPI (fase Setting) — Seksi A: Objective KPI 20%, Seksi B: Functional KPI 80%
- Mengisi realisasi KPI bulanan dan entri RCA (fase Measurement) — wajib mengisi RCA jika capaian < 80%
- Menyusun dan mengajukan SMART Goals — minimum 3 tujuan
- Mengisi Formulir Penilaian diri (Form A 60%, Form B 25%, Form C 15%)
- Mendaftarkan Project Outside Job Scope — minimum 1 proyek
- Melihat ringkasan kinerja dan nilai akhir milik sendiri
- Mengajukan permintaan Buka Kunci jika melewati deadline modul

### 3.2 Supervisor (Portal Approver)
Manajer atau ketua tim. Menjalani proses penilaian sendiri sekaligus berperan sebagai Approver 1 untuk tim langsung.

**Tanggung jawab sebagai karyawan:** sama dengan peran Karyawan di atas
**Tanggung jawab tambahan:**
- Menyetujui/merevisi pengajuan KPI, SMART Goals, Formulir Penilaian, RCA dari tim (Approver 1)
- Mengisi penilaian Managerial Skill untuk diri sendiri (5 kompetensi, skala 1–5)
- Menjadwalkan Management Interview dengan atasan
- Meninjau dan memberikan penilaian SMART Goals anggota tim
- Memantau status penyelesaian tim di 6 modul monitoring

**Cakupan data:** dibatasi pada unit dan divisi sendiri (PT RSUP Industri / Divisi SDM dalam mock data)

### 3.3 Administrator HR
Anggota tim HR pusat dengan visibilitas seluruh sistem dan otoritas persetujuan akhir.

**Tanggung jawab:**
- Mengaktifkan/menonaktifkan 6 modul dan menetapkan jendela akses per tingkat jabatan
- Bertindak sebagai Approver 2 (final untuk KPI, SMART Goals, RCA; tunggal untuk modul lain)
- Mengelola konfigurasi kalibrasi: bobot, rentang skor, distribusi nilai, proporsi HC
- Mengelola pengguna (CRUD), peran akses, dan visibilitas menu
- Meninjau dan memproses permintaan Buka Kunci (Open Lock)
- Memantau penyelesaian seluruh sistem via Analytics Dashboard
- Mengakses Audit Trail untuk seluruh aktivitas sistem
- Mengelola Master Data (KPI, Formulir Penilaian, Managerial Skill)
- Mengelola Bukti (Evidence) yang diunggah karyawan
- Mensinkronisasi data karyawan dari sistem HRIS sumber

---

## 4. Arsitektur Sistem

### 4.1 Jenis Aplikasi
Single-Page Application (SPA). Routing sisi klien via React Router. Tidak ada server-side rendering.

### 4.2 Struktur URL Lengkap

```
/                                          → Pemilih Peran (RoleSelector)
/login                                     → Halaman Login

# Portal Karyawan
/employee                                  → Dashboard Karyawan
/employee/mid-year/kpi                     → KPI Tracking
/employee/mid-year/smart-goals             → SMART Goals
/employee/mid-year/appraisal-form          → Formulir Penilaian
/employee/mid-year/project-outside         → Project Outside Job Scope (tab gabungan)
/employee/profile                          → Lihat Profil

# Portal Supervisor
/supervisor                                → Dashboard Supervisor
/supervisor/appraisals?tab=check-in        → Persetujuan — Pengukuran
/supervisor/appraisals?tab=setting         → Persetujuan — Pengaturan
/supervisor/appraisal                      → Penilaian Kinerja Saya
/supervisor/summary                        → Ringkasan Penilaian Kinerja
/supervisor/documents                      → Dokumen
/supervisor/profile                        → Profil
/supervisor/monitoring/kpi                 → Monitoring KPI
/supervisor/monitoring/smart-goals         → Monitoring SMART Goals
/supervisor/monitoring/appraisal-form      → Monitoring Formulir Penilaian
/supervisor/monitoring/managerial-skill    → Monitoring Managerial Skill
/supervisor/monitoring/project             → Monitoring Project
/supervisor/monitoring/management-interview → Monitoring Management Interview
/supervisor/mid-year/kpi                   → KPI Tracking (diri sendiri)
/supervisor/mid-year/rca                   → RCA (diri sendiri)
/supervisor/mid-year/smart-goals-checkin   → SMART Goals Check-In
/supervisor/mid-year/appraisal-form        → Formulir Penilaian
/supervisor/mid-year/project-outside       → Project Outside Job Scope
/supervisor/mid-year/managerial-skill      → Managerial Skill
/supervisor/mid-year/management-interview  → Management Interview Setting
/supervisor/setting/kpi                    → KPI Setting
/supervisor/setting/management-interview   → Management Interview Check-In (HR)

# Portal HR Administrator
/hr                                        → Analytics Dashboard
/hr/approvals?tab=check-in                 → Persetujuan — Pengukuran
/hr/approvals?tab=setting                  → Persetujuan — Pengaturan
/hr/modules                                → Aktivasi Modul
/hr/override                               → Management Override
/hr/summary                               → Ringkasan Penilaian Kinerja
/hr/documents                              → Dokumen
/hr/profile                                → Profil
/hr/appraisals/goals                       → Goal Oversight
/hr/appraisals/mid-year                    → Mid-Year Check-In
/hr/appraisals/mid-year/:id                → Detail Mid-Year Check-In
/hr/monitoring/kpi                         → Monitoring KPI (semua unit)
/hr/monitoring/smart-goals                 → Monitoring SMART Goals
/hr/monitoring/appraisal-form              → Monitoring Formulir Penilaian
/hr/monitoring/managerial-skill            → Monitoring Managerial Skill
/hr/monitoring/project                     → Monitoring Project
/hr/monitoring/management-interview        → Monitoring Management Interview
/hr/evidence/kpi-tracking                  → Bukti KPI Tracking
/hr/evidence/rca                           → Bukti RCA
/hr/evidence/smart-goals                   → Bukti SMART Goals
/hr/evidence/management-interview          → Bukti Management Interview
/hr/calibration/setting                    → Kalibrasi Setting
/hr/calibration/adjustment                 → Penyesuaian Kalibrasi
/hr/calibration/management-interview       → Kalibrasi Management Interview
/hr/setting/kpi                            → KPI Setting (HR)
/hr/setting/open-lock                      → Buka Kunci
/hr/settings/scores-calibration            → Scores & Calibration
/hr/settings/approval-management           → Manajemen Persetujuan
/hr/settings/user-management              → Manajemen Pengguna
/hr/settings/access-management             → Manajemen Akses
/hr/settings/menu-management              → Manajemen Menu
/hr/settings/data-sync                     → Sinkronisasi Data
/hr/settings/audit-trail                   → Audit Trail
/hr/settings/master/kpi                    → Master KPI
/hr/settings/master/appraisal-form         → Master Formulir Penilaian
/hr/settings/master/managerial-skill       → Master Managerial Skill
```

### 4.3 Entitas Perusahaan yang Didukung (8 unit)

| Kode | Nama Entitas | Industri |
|---|---|---|
| RSUP-IND | PT RSUP (Industry) | Industry |
| RSUP-PKB | PT RSUP (Perkebunan) | Perkebunan |
| PS-JKT | PT Pulau Sambu (Jakarta) | Jakarta |
| PS-GTG | PT Pulau Sambu (Guntung) | Guntung |
| PS-KE | PT Pulau Sambu (Kuala Enok) | Kuala Enok |
| RSTM | PT RSTM | — |
| GHS | PT GHS | — |
| ASD | PT ASD | — |

### 4.4 Tahapan Siklus Penilaian (4 tahap)

| # | Tahap | Aktivitas | Status Contoh |
|---|---|---|---|
| 1 | **Setting** | Penetapan target KPI, SMART Goals, struktur Formulir Penilaian | Selesai (15/01/2026) |
| 2 | **Measurement** | Realisasi KPI bulanan, RCA, SMART Goals Check-In | Pending Action (deadline 30/07/2026) |
| 3 | **Evaluation** | Managerial Skill, Management Interview | Belum Mulai |
| 4 | **Dialogue** | Tinjauan akhir dan konfirmasi nilai | Belum Mulai |

---

## 5. Autentikasi & Navigasi Shell

### 5.1 Halaman Login (`/login`)

**Alur Login Dua Langkah (OTP):**

1. Pengguna memilih **Unit Perusahaan** dari dropdown (7 entitas):
   - Dropdown menampilkan kode (bold) + nama lengkap (12px abu-abu)
2. Pengguna memasukkan **ID Karyawan** (input teks)
3. Klik **"SEND OTP TELEGRAM / EMAIL"** — tombol dinonaktifkan jika ID Karyawan kosong
   - Loading state selama 800ms (label berubah jadi "MENGIRIM...")
   - Kolom OTP muncul dengan transisi CSS (max-h-0 → max-h-24) dan auto-focus
4. ID Karyawan terkunci (disabled) setelah OTP dikirim — tidak bisa diubah
5. Pengguna memasukkan **Kode OTP** (maks. 6 karakter, font-mono, tracking-widest)
6. Klik **"Login"** — dinonaktifkan jika OTP kosong — navigasi ke `/` (Pemilih Peran)

**Validasi:**
- Tombol "Send OTP" dinonaktifkan jika `!employeeId.trim()`
- Tombol "Login" dinonaktifkan jika `!otpCode.trim()`
- ID Karyawan dikunci begitu OTP terkirim

### 5.2 Pemilih Peran (`/`)

Dua kartu besar setelah login:
- **Administrator** → navigasi ke `/hr`
- **Employee** → navigasi ke `/supervisor`
- Tombol **Logout** → navigasi ke `/login`

### 5.3 Tata Letak Shell Aplikasi

```
┌─────────────────────────────────────────────────────────┐
│  TOPBAR (88px tinggi)                                    │
│  [Toggle] [Pencarian Global]    [🔔] [Profil] [EN/ID]   │
├──────────┬──────────────────────────────────────────────┤
│ SIDEBAR  │  KONTEN UTAMA (scrollable)                   │
│ (260px)  │                                              │
│ [Logo]   │                                              │
│ [Nav]    │                                              │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  FOOTER: "Copyright ©2026 Sambu Group"                  │
└─────────────────────────────────────────────────────────┘
```

### 5.4 Sidebar

| Properti | Nilai |
|---|---|
| Lebar terbuka | 260px |
| Lebar diciutkan | 0px (tersembunyi penuh) |
| Transisi | `transition-[width] duration-300 ease-in-out` |
| Latar belakang | `#F4F6FC` |
| Item aktif | Background navy `#1A284F`, teks putih |
| Tinggi header logo | 88px (sejajar Topbar) |
| Kedalaman nesting | 3 level: item → sublink → anak bersarang |

**Navigasi Supervisor (10 kelompok):**
1. Dashboard (LayoutList)
2. My Profile (UserCog)
3. Approvals (CheckSquare) → Performance Appraisal Measurement / Setting
4. Performance Appraisal Summary (LayoutList)
5. Performance Appraisal Monitoring (ClipboardCheck) → 6 sub-item
6. Performance Appraisal Setting (Target) → KPI / SMART Goals
7. Performance Appraisal Measurement (Clock) → 7 sub-item
8. Documents (BookOpen)

**Navigasi HR (8 kelompok):**
1. Analytics Dashboard (BarChart2)
2. My Profile (UserCog)
3. Approvals (CheckSquare) → 4 sub-item
4. Performance Appraisal Monitoring (ClipboardCheck) → 6 sub-item
5. Performance Appraisal Summary (LayoutList)
6. Calibration (Target) → 3 sub-item
7. Evidence (FolderOpen) → 4 sub-item
8. Documents (BookOpen)
9. Setting (Settings) → 10+ sub-item termasuk Master Data 3 sub-item bersarang

### 5.5 Topbar

| Elemen | Posisi | Peran | Keterangan |
|---|---|---|---|
| Toggle Sidebar | Paling kiri | Semua | `PanelLeftClose`/`PanelLeftOpen` icon |
| Pencarian Global | Kiri (menggantikan judul) | HR, Supervisor | Lihat §5.6 |
| Judul + Subjudul | Kiri (jika pencarian tidak ada) | Karyawan | — |
| Lonceng Notifikasi | Kanan | Semua | Badge merah unread count |
| Dropdown Profil | Kanan | Semua | Nama + inisial avatar |
| Toggle Bahasa (EN/ID) | Paling kanan | Semua | Pill navy |

### 5.6 Pencarian Global

- Tersedia untuk peran **HR** dan **Supervisor**
- Pencarian mencocokkan: label halaman, kategori, dan jalur URL (case-insensitive)
- Tampilkan hingga **8 hasil** dengan badge kategori dan sorotan teks kecocokan (`<mark>`)
- Keyboard: `↑↓` berpindah, `Enter` navigasi, `Escape` tutup
- Kategori: Main, Monitoring, Mid-Year, Appraisals, Evidence, Calibration, Settings, Master Data
- Hasil diurutkan: label yang dimulai dengan query dahulu, lalu alfabetis

### 5.7 Panel Notifikasi

- Ikon lonceng dengan badge unread count (merah, 9px bold)
- Panel slide-in dari kanan: lebar 384px (w-96), bayangan besar, rounded-2xl
- **Header panel:** ikon Bell + "Notifications" + badge count + tombol "Mark all as read" (jika ada unread)
- **Per notifikasi:**
  - Titik oranye kiri (jika belum dibaca)
  - Stempel waktu (Clock icon) — contoh: "Today, 08:00"
  - Judul (bold) + body teks multi-paragraf
  - Tombol CTA (navy, ArrowRight icon) → navigasi ke rute terkait
  - Tombol hapus (X) kanan atas — menghapus notifikasi
- **Klik badan notifikasi** → tandai sudah dibaca
- **Tipe notifikasi yang didukung:**
  - Pengingat KPI Tracking bulanan (peran Supervisor)

---

## 6. Model Data & Sistem Penilaian

### 6.1 Bobot Modul per Tingkat Jabatan

Bobot dihitung berdasarkan **tingkat jabatan karyawan**. Lima level dengan alokasi berbeda:

| Modul | Operasional | Pengawas s/d Kep. Bagian | Kepala Departemen | Kepala Divisi ke atas |
|---|---|---|---|---|
| KPI | 50% | 40% | 40% | 40% |
| SMART Goals | 20% | 15% | 15% | 10% |
| Appraisal Form | 15% | 15% | 15% | 10% |
| Project Outside Job Scope | 15% | 15% | 10% | 10% |
| Managerial Skill | — | 15% | 20% | 20% |
| Management Interview | — | — | — | 10% |
| **Total** | **100%** | **100%** | **100%** | **100%** |

*Catatan: Managerial Skill dan Management Interview hanya berlaku untuk jabatan tertentu (grade 7+).*

### 6.2 Formulir Penilaian — Bobot Sub-Form

| Form | Bobot | Jumlah Item |
|---|---|---|
| Form A (Behavioral Competency) | 60% | 12 item |
| Form B (Additional Competency) | 25% | 5 item |
| Form C (Cross-functional) | 15% | 3 item |

**Perhitungan Skor Form:**
```
RataRataForm = (RataRata_Self × 30%) + (RataRata_Atasan × 70%)
KonversiNilai = (RataRataForm / 5) × 100
SkorFinalForm = (RataRataForm / 5) × BobotForm
TotalSkorAppraisalForm = Σ SkorFinalForm (A + B + C)
```

### 6.3 Bobot Managerial Skill

- Bobot tetap: **20%** dari Appraisal Form (atau sesuai konfigurasi unit)
- 5 kompetensi: Kepemimpinan, Keselarasan Organisasi, Perencanaan Penerus, Resolusi Konflik Internal, Resolusi Konflik Eksternal
- Skala: 1–5 per kompetensi
- Penilai: diri sendiri + supervisor (Approver 1)

### 6.4 Perhitungan Capaian KPI

| Polaritas | Formula |
|---|---|
| **Maximize** | `Capaian % = (Realisasi / Target) × 100` |
| **Minimize** | `Capaian % = min(100%, (Target / Realisasi) × 100)` — jika realisasi > target |
| **Rasio Khusus (6:1)** | `Skor = 100% jika Negatif = 0 ATAU Positif ≥ Negatif × 6; selain itu 0%` |

**Kode warna capaian:**
- ≥ 95% → hijau (`text-green-700`)
- ≥ 80% dan < 95% → kuning (`text-amber-600`)
- < 80% → merah (`text-rose-600`) + **RCA wajib diisi**

### 6.5 Perhitungan Total KPI 2026

Tergantung pada **formula** yang dipilih per KPI:

| Formula | Cara Hitung Total 2026 |
|---|---|
| Nilai Akhir | Nilai bulan Desember |
| Rata-Rata | Rata-rata semua bulan yang terisi |
| Jumlah | Jumlah (sum) semua bulan yang terisi |

### 6.6 Mode Indikator KPI

| Mode | Keterangan | Input per Bulan |
|---|---|---|
| Numeric | Angka biasa | Number input |
| Color Band | Kualitatif berbasis warna | Dropdown: "95%–100%" (hijau) / "≥80%–<95%" (amber) / "<80%" (merah) |
| Ratio | Rasio positif:negatif | Dropdown: "10:1" / "6:1" / "5:1" / "4:1" / "3:1" / "2:1" |

**Aturan otomasi Color Band untuk Target 2026:**
- Formula Nilai Akhir → nilai bulan Desember
- Formula Rata-Rata → warna yang paling sering muncul
- Formula Jumlah → aturan terburuk (jika ada "<80%" → hasilnya "<80%"; jika ada "≥80%–<95%" → hasilnya itu; selain itu "95%–100%")

### 6.7 Rentang Nilai & Grade (Default)

| Skor | Grade | Label | Warna |
|---|---|---|---|
| ≥ 90 | A+ | Outstanding | Emerald (#10B981) |
| 80–89 | A | Good | Blue (#3B82F6) |
| 70–79 | B | Average | Amber (#F59E0B) |
| 60–69 | C | Below Average | Orange (#F97316) |
| 50–59 | D | Unsatisfactory | Red (#EF4444) |
| < 50 | E | Fail | Dark Red (#991B1B) |

*Rentang ini dapat dikonfigurasi per unit via halaman Scores & Calibration.*

### 6.8 Distribusi Grade Kalibrasi (Default)

| Grade | Proporsi Target |
|---|---|
| A+ | 5% |
| A | 15% |
| B | 40% |
| C | 25% |
| D | 10% |
| E | 5% |

*Dapat dikonfigurasi per unit via halaman Calibration Setting. Disimpan di `localStorage` key `calibration_submitted_units`.*

### 6.9 Skor Akhir SMART Goals oleh Approver

```
getBobotByPosition(position):
  - Kepala/Direktur → 40%
  - Manager → 35%
  - Supervisor/Leader/Koordinator → 30%
  - Default → 25%

SkorFinalSG = RataRataOverall × getBobotByPosition / 100
RataRataOverall = (RataRataA1 + RataRataA2) / 2
```

### 6.10 Kalibrasi Distribusi — Indikator Delta

Halaman Ringkasan Penilaian menampilkan deviasi distribusi aktual vs target:
- **Oranye:** aktual > target lebih dari 5 poin persentase
- **Biru:** aktual < target lebih dari 5 poin persentase
- **Hijau:** dalam rentang ±5 poin persentase dari target

---

## 7. Alur Persetujuan

### 7.1 Alur Pengajuan Standar (4 Langkah)

```
Karyawan mengajukan
        ↓ Status: "Pending"
Supervisor (Approver 1) meninjau
  ├── Setujui (KPI/SMART Goals/RCA) → Status: "Assessed-Approver 1"
  ├── Setujui (tipe lain)            → Status: "Approved"
  ├── Revisi                         → Status: "Revision" (kembali ke karyawan)
  └── Assessed                       → Status: "Assessed-Approver 1"
        ↓
HR Admin (Approver 2) meninjau
  ├── Setujui (KPI/SMART Goals/RCA) → Status: "Assessed-Approver 2"
  ├── Setujui (tipe lain)            → Status: "Approved"
  └── Revisi                         → Status: "Revision" (kembali ke karyawan)
        ↓
Validator HR (pemeriksaan akhir)
  └── Validasi → Status: "Approved" (semua tipe)
```

### 7.2 Alur Permintaan Edit

```
Karyawan mengajukan Edit Request (dengan alasan)
        ↓ Status: "Edit Request"
Supervisor (Approver 1) meninjau
  ├── Terima → Status: "EditRequest-PendingA2"
  └── Tolak  → Status: "EditRequest-Rejected"
        ↓
HR Admin (Approver 2) meninjau
  ├── Terima → Status: "EditRequest-AcceptedA2" (karyawan bisa edit ulang)
  └── Tolak  → Status: "EditRequest-Rejected"
```

### 7.3 Alur Buka Kunci (Open Lock)

```
Karyawan mengajukan Permintaan Buka Kunci
  - Alasan wajib diisi
  - Status awal: "pending"
        ↓
HR Admin meninjau di halaman Open Lock
  ├── Setujui → Status: "approved"
  │     - Isi tanggal "Buka Akses Hingga" (wajib)
  │     - Catatan Admin (opsional)
  │     - Notifikasi sukses: "Open lock disetujui. Karyawan kini dapat mengisi modul hingga tanggal yang ditentukan."
  └── Tolak  → Status: "rejected"
        - Alasan penolakan wajib diisi
        - Notifikasi sukses: "Request ditolak dan catatan alasan telah disimpan."
```

### 7.4 Definisi Status Lengkap

| Status | Keterangan | Tampilan History |
|---|---|---|
| `Pending` | Diajukan, menunggu Approver 1 | Tab Pending |
| `Edit Request` | Karyawan minta izin edit ulang | Tab Pending (amber "Review Request") |
| `Assessed-Approver 1` | Disetujui Supervisor, maju ke HR | Tampil sebagai "Pending-Approver 2" |
| `Assessed-Approver 2` | Disetujui HR Approver 2 | Tampil sebagai "Assessed" |
| `Approved` | Disetujui penuh | Tampil sebagai "Approved" |
| `Revision` | Dikembalikan ke karyawan | Tampil sebagai "Revision" |
| `EditRequest-PendingA2` | Edit Request diterima A1, menunggu HR | Tampil sebagai "Pending-Approver 2" |
| `EditRequest-AcceptedA2` | Edit Request diterima HR | Tampil sebagai "Edit Accepted" |
| `EditRequest-Rejected` | Edit Request ditolak | Tampil sebagai "Rejected" |

### 7.5 Aturan Routing Tipe Persetujuan

| Tipe | Approver 1 Menyetujui | Approver 2 Menyetujui |
|---|---|---|
| KPI | → "Assessed-Approver 1" | → "Assessed-Approver 2" |
| SMART Goals | → "Assessed-Approver 1" | → "Assessed-Approver 2" |
| RCA | → "Assessed-Approver 1" | → "Assessed-Approver 2" |
| Appraisal Form | → "Approved" langsung | → "Approved" |
| Managerial Skill | → "Approved" langsung | → "Approved" |
| Project Outside | → "Approved" langsung | → "Approved" |
| Management Interview | → "Approved" langsung | → "Approved" |

---

## 8. Modul Karyawan

### 8.1 Dashboard (`/employee`)

**Tampilan:** Linimasa 4 tahap siklus penilaian

| Tahap | Status | Tanggal |
|---|---|---|
| Performance Appraisal Setting | Completed (hijau) | 15/01/2026 |
| Performance Appraisal Measurement | Pending Action (oranye) | 30/07/2026 |
| Performance Appraisal Approval | Not Started (abu-abu) | 01/08/2026 |
| My Performance Appraisal | Not Started (abu-abu) | 01/12/2026 |

**Tombol Aksi Tahap 2 (CHECK_IN_LABELS):**
- KPI → `/employee/mid-year/kpi`
- SMART Goals → `/employee/mid-year/smart-goals`
- Appraisal Form → `/employee/mid-year/appraisal-form`
- Project Outside Job Scope → `/employee/mid-year/project-outside`

---

### 8.2 KPI Setting (`/supervisor/setting/kpi` atau ekuivalen)

**Tab KPI yang tersedia:**

| Tab ID | Label | Deskripsi |
|---|---|---|
| personal | Personal KPI | KPI individu karyawan (9 item) |
| department | Department KPI | KPI level departemen (6 item) |
| division | Division KPI | KPI level divisi (6 item) |
| corporate | Corporate KPI | KPI korporat/grup (25+ item, cascading) |
| pak-anton | KPI Pak Anton | KPI dikaskar dari atasan |
| pak-amir | KPI Pak Amir | KPI dikaskar dari atasan |

**Interface Data KPI Setting:**

| Field | Tipe | Keterangan |
|---|---|---|
| no | string | Nomor urut (bisa "1a", "2b") |
| section | "A" \| "B" | Seksi Objective (A) atau Functional (B) |
| perspektif | string | BSC Perspective |
| kpi | string | Nama KPI |
| satuan | string | Satuan ukuran |
| formula | "Jumlah" \| "Rata-Rata" \| "Nilai Akhir" | Formula agregasi |
| bobot | string | Persentase bobot |
| definisi | string | Deskripsi KPI |
| source | string | Sumber data |
| baseline2025 | string | Nilai baseline tahun sebelumnya |
| target2026 | string | Target 2026 (auto-computed atau manual) |
| polaritas | "Maximize" \| "Minimize" \| "Stabilize" | Arah gerakan yang diinginkan |
| detailFormula | string | Formula detail |
| keterangan | string | Catatan tambahan |
| monthlyTargets | Record<string, string> | Target bulanan Jan–Des |
| colorIndicator | boolean | true = mode color band |
| indicatorMode | "numeric" \| "color" \| "ratio" | Mode indikator |
| scope | string | Cakupan unit |
| trackingPeriod | string | Frekuensi pengukuran |
| coo / gmVgmIndustry / dst | string | Cascading ke role (FC/PC/CC) |

**Opsi Dropdown:**
- Perspektif: Finansial / Proses / Environment Health & Safety / Customer / Learning & Growth
- Formula: Jumlah / Rata-Rata / Nilai Akhir
- Polaritas: ↑ Maximize / ↓ Minimize
- Bobot: 5%–50% (kelipatan 5%)
- Tracking Period: Bulanan / Triwulan / Semesteran / Tahunan

**Seksi dengan Bobot (Corporate):**
- A: K3L Terintegrasi (SMK3/HSE) — 15%
- B: Finansial — 40%
- C: Produksi — 30%
- D: Be Employer of Choices — 9%
- E: Be Partner of Choices — 6%
- F: Regulatory Compliance — 0%

**Cascading Types:**
- FC (Full Cascading): semua field dapat diedit
- PC (Partial Cascading): sebagian field terkunci
- CC (Corporate Controlled): read-only, ditetapkan korporat

**Tampilan & Alur:**
- View `"input"`: tabel dapat diedit; tombol Tambah KPI, Impor, Ekspor, Preview
- View `"preview"`: tabel read-only; tombol Submit, Request Revision
- Post-submit: banner hijau terkunci

**Modal yang digunakan:**
- **EditRowModal:** edit semua field KPI termasuk tabel target bulanan
- **BobotExceededModal:** muncul jika total bobot seksi A melebihi 20% atau seksi B melebihi 80%
- **RevisionModal:** textarea alasan revisi (wajib diisi), tombol "Send Revision" dinonaktifkan jika kosong
- **ConfirmModal + SuccessModal:** standar konfirmasi dan sukses

**Validasi Bobot:**
- Seksi A (Objective KPI): maks total bobot 20%
- Seksi B (Functional KPI): maks total bobot 80%
- Saat simpan: jika total bobot seksi (termasuk item baru) melebihi batas → BobotExceededModal

---

### 8.3 KPI Tracking (`/employee/mid-year/kpi`)

**Struktur data utama:**

```typescript
interface KPIItem {
  no: string
  section: "A" | "B"
  perspektif: string
  kpi: string
  satuan: string
  formula: string
  bobot: string
  definisi: string
  source: string
  baseline2025: string
  target2026: string
  polaritas: "Maximize" | "Minimize"
  detailFormula: string
  subRows: SubRow[]
  indicatorMode?: "ratio"
  ratioMultiplier?: number
  colorIndicator?: boolean
  monthlyTargets?: Record<string, string>
}

interface SubRow {
  label: string
  bold?: boolean
  compute?: ComputeSpec
}

type ComputeSpec =
  | { type: "ratio"; deps: number[] }
  | { type: "avg"; deps: number[] }
  | { type: "ref"; refIdx: number }
  | { type: "ratio_score"; deps: number[]; altDeps?: number[] }
```

**Kolom Tabel KPI:**

*Sticky kiri:* No (52px) | Perspektif (140px) | KPI (270px)

*Kolom statis:* Satuan | Formula Setahun | Bobot (badge navy) | Definisi | Source | Baseline 2025 | Target 2026 | Polaritas | Detail Formula | Keterangan

*Kolom dinamis (per bulan yang ditambah, 120px):*
- Header: label bulan + badge "editable" jika bisa diedit
- Target sub-baris: terkunci (sky-50 bg + ikon Lock)
- Realisasi sub-baris: input teks (ring-1 ring-blue-300)
- Sub-baris komputasi: emerald-50 bg + nilai persentase berwarna + tombol RCA jika < 100%
- Mode colorIndicator: dropdown warna (pilih/badge)

*Kolom Total 2026 (120px, bg-blue-50):* Auto-computed

**Mesin Komputasi Cell (`computeCell`):**
- `ratio`: hitung persentase capaian (maks 100% untuk Minimize)
- `avg`: rata-rata sub-baris dependensi
- `ref`: salin nilai dari sub-baris lain
- `ratio_score`: varian rasio dengan set dependensi alternatif

**Warna Capaian (getPctColor):**
- ≥ 95 → `text-green-700`
- ≥ 80 → `text-amber-600`
- < 80 → `text-rose-600`

**Tombol RCA di Cell Komputasi:**
- Tampil jika capaian < 100%
- **Merah berdenyut** (`animate-pulse`): jika RCA belum diisi
- **Hijau**: jika RCA sudah diisi
- Klik → buka RCA Modal

**Manajemen Bulan:**
- Tombol "+" di header kolom paling kanan (mode editable)
- **AddMonthModal:** grid pilihan bulan Jan–Des (bulan sudah ada dikecualikan)
- Target sub-baris auto-terisi dari data KPI; dikunci (tidak bisa diubah)

**Tombol Hapus Bulan:** tombol X di header bulan (mode editable) — hapus bulan beserta datanya

**Ekspor/Impor XLSX:**
- Ekspor: semua data visible → file XLSX
- Impor: parse berdasarkan header kolom dengan regex matching

**Mode Tampilan:** `"input"` (editable) / `"preview"` (read-only) — toggle via tombol Preview

**Alur Submit:**
1. Tombol **Submit** → ConfirmModal
2. Konfirmasi → SuccessModal
3. Halaman terkunci di mode preview

**EditRequestModal (edit data yang sudah diajukan):**

| Field | Tipe | Keterangan |
|---|---|---|
| Approver section | read-only | Approver 1: Ahmad Fauzi (Supervisor); Approver 2: Dewi Rahayu (HR Manager) |
| Pilih KPI | checkbox per seksi A/B | minimal 1 dipilih |
| Pilih Bulan | pill toggle | minimal 1 dipilih |
| Alasan | textarea + counter karakter | wajib diisi |

`canSubmit = selectedKpis.length > 0 && selectedMonths.length > 0 && reason.trim().length > 0`

**OpenLockRequestModal (akses pasca-deadline):**
- Deadline ditampilkan: "30 Juni 2026"
- Field "Alasan Permintaan" (textarea, wajib)
- Tombol "Kirim Request" dinonaktifkan jika alasan kosong

**Unggah Bukti (EvidenceUploadSection):**
- Dropdown pilih bulan (default: bulan terakhir yang ditambah)
- Zona drag-and-drop (semua tipe file)
- Ikon file berdasarkan tipe: gambar/PDF/spreadsheet/Word/lainnya
- Format ukuran: B / KB / MB

---

### 8.4 Root Cause Analysis — RCA (`/employee/mid-year/rca` atau embedded)

**Interface Data:**

```typescript
interface RCAItem {
  id: string
  no: number
  periode: string         // e.g. "Jan 2026"
  kpi: string
  satuan: string
  baseline: string
  target: string
  actual: string
  masalahBlocks: MasalahBlock[]
}

interface MasalahBlock {
  id: string
  masalahUtama: string    // Masalah Utama (A) — wajib
  faktorInternal: boolean // atau Faktor Eksternal
  body: string
  kenapaA: string         // Kenapa A? (B) — wajib
  kenapaB: string         // Kenapa B? (C) — wajib
  kenapaC: string         // Kenapa C? (D) — wajib
  actionPlans: ActionPlan[]
}

interface ActionPlan {
  id: string
  action: string          // wajib
  targetDate: string      // wajib
  PIC: string             // wajib
  status: StatusPerbaikan
  keterangan?: string
  output?: string[]
  evidence?: EvidenceFile[]
}

type StatusPerbaikan =
  | "Belum dilaksanakan"
  | "Sedang dilaksanakan"
  | "Selesai"
  | "Ditunda"
  | "Dibatalkan"

type ApprovalStatus =
  | "Pending-Approver 1"
  | "Pending-Approver 2"
  | "Approved"
  | "Closed"
```

**Kartu Ringkasan (6 kartu):**
- Total Period (unik)
- Total KPI (unik)
- Total Action Plans (tidak termasuk yang Dibatalkan)
- Total Outstanding (AP yang bukan Selesai/Dibatalkan)
- Outstanding % = `(totalOutstanding / totalAPs) × 100`
- Total RCA Closed

**Warna Progress Bar RCA:**
- 0–49%: kuning (amber)
- 50–99%: biru
- 100%: hijau

**Tab Halaman:**
- "RCA (Open)" — tab dengan badge count (status Pending/Approved)
- "RCA (Closed)" — tab dengan badge count

**Filter:**
- Year: 2026 / 2025 / 2024
- Period: Jan–Des (dalam bahasa Inggris, dicocokkan ke bahasa Indonesia)
- Tombol "Clear" (X): muncul ketika filter aktif

**Kolom Tabel:**
No | Aksi | Periode (badge navy) | KPI Indicator | Target | Actual | Total APs | Outstanding APs (pill) | Progress APs % | Submitted Date | Approval Status | Last Approved Date

**Aksi per baris:**
- Tab Open: "Update Progress" (amber, hanya status Approved) / "View Detail" (abu-abu) / Delete (ikon trash, hanya tab Open)
- Tab Closed: "View Detail" (abu-abu)

**DetailDrawer (panel kanan layar penuh):**
- Bisa diedit jika status "Approved" → tombol "Update Progress" + "Save Update"
- Field yang bisa diedit saat Approved: Status Perbaikan, Keterangan, Output, Evidence (disorot amber)
- Validasi Evidence: jika status = "Selesai" dan evidence kosong → border merah + peringatan wajib

**Transisi Status:**
```
Draft → Submit → Pending-Approver 1 → Pending-Approver 2 → Approved → (Update) → Closed
```

**CreateRCADrawer (tambah baru):**
- Katalog KPI: 8 item dengan capaian < 100% (Jan–Agt) — auto-isi satuan/baseline/target/actual saat dipilih
- Tombol "Add KPI" menambah RCAInputCard baru
- Pada submit: status baru = "Pending-Approver 1"

---

### 8.5 SMART Goals (`/employee/mid-year/smart-goals`)

**Interface Data:**

```typescript
interface SmartGoal {
  id: string
  label: string           // Judul tujuan (dapat diedit)
  specific: string        // wajib untuk preview
  measurable: string      // wajib untuk preview
  attainable: string      // wajib untuk preview
  relevant: string        // wajib untuk preview
  timely: string          // wajib untuk preview
  bukti: string           // TIDAK wajib untuk preview
  target: string          // wajib untuk preview (baris disorot biru)
  actionPlans: ActionPlan[]
}
```

**Struktur Tabel:** kolom per tujuan, baris = 7 kriteria

| Baris | Wajib Isi | Tinggi |
|---|---|---|
| Specific / Spesifik | Ya | 96px |
| Measurable / Dapat Diukur | Ya | 96px |
| Attainable / Dapat Dicapai | Ya | 96px |
| Relevant / Relevan | Ya | 96px |
| Timely / Tepat Waktu | Ya | 96px |
| Bukti | Tidak | 96px |
| Target | Ya | 56px (latar biru) |

**Batasan & Validasi:**
- **Minimum 3 tujuan** — menghapus di bawah 3 memunculkan modal error "Tidak Dapat Dihapus"
- Tombol Preview dinonaktifkan sampai `allFilled`: semua tujuan memiliki Specific + Measurable + Attainable + Relevant + Timely + Target yang terisi (Bukti dikecualikan)
- Judul kolom (label tujuan) dapat diedit langsung

**Tab:**
- "Input Form": tersembunyi setelah submit
- "Results": disabled dengan titik indikator sebelum submit; titik hijau setelah submit

**Alur Submit:**
1. ConfirmModal → SuccessModal
2. `saveSubmittedGoals(goals)` dipanggil (disimpan ke store bersama)
3. Tampilan beralih ke tab Results

**Tab Results (pasca-submit):**
- Banner hijau: "menunggu review Approver"
- Badge "Pending Approval"
- Bagian "Feedback from Approver" (read-only, placeholder "belum ada")

**Ekspor XLSX:** nama file `SMART_Goals_2026.xlsx`, kolom: No, Goals, Specific, Measurable, Attainable, Relevant, Timely, Bukti, Target, Action Plans

---

### 8.6 Formulir Penilaian — Appraisal Form (`/employee/mid-year/appraisal-form`)

**Struktur Form (3 form bertahap):**

| Form | Bobot | Item | Syarat Buka |
|---|---|---|---|
| Form A | 60% | 12 | Selalu tersedia |
| Form B | 25% | 5 | Form A harus sudah disimpan |
| Form C | 15% | 3 | Form B harus sudah disimpan |

**12 Item Form A:**
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

**5 Item Form B:**
1. Sikap
2. Inisiatif
3. Kemampuan Interpersonal
4. Mampu Bekerja dalam Tim
5. Peningkatan Keterampilan secara Berkelanjutan

**3 Item Form C:**
1. Maintain inter-department relations
2. Interact across job levels
3. Maintain workplace cohesion

**Per Item:** berisi 5 indikator (skor 1–5) dengan teks deskriptor lengkap

**UI Penilaian:**
- 5 tombol berlabel 1–5; dipilih = latar navy `#1A284F`
- Tombol "Lihat Indikator Penilaian" → IndicatorModal (tabel 5 kolom skor × baris item)

**Perhitungan:**
- `avgScore = sum(rating yang dipilih) / jumlah item yang dinilai`
- Ditampilkan 2 desimal; baris "Total" menampilkan "(X%) Nilai Total" + avgScore

**Tombol Simpan:**
- Dinonaktifkan sampai `allRated`: semua item form aktif sudah dinilai
- Setelah disimpan: banner hijau dengan avgScore
- Tombol Reset: mengosongkan semua penilaian

**Tombol Submit Form (hanya muncul di Form C):**
- Dinonaktifkan sampai `allFormsSaved` (A + B + C semua sudah disimpan)
- Konfirmasi modal → sukses modal

---

### 8.7 Project Outside Job Scope

**Kategori & Scope:**

| Kategori | Scope | Bobot |
|---|---|---|
| Improvement Project | SS (Small Scale) | 15% |
| Improvement Project | QCC | 25% |
| Improvement Project | QCP | 40% |
| Corporate Event | Corporate Activity | 10% |
| Komite/Task Force | Komite | 10% |

**Field Formulir Project:**

| Field | Wajib |
|---|---|
| Kategori (pilih 1 dari 3) | Ya |
| Scope (dari SCOPE_BY_CATEGORY) | Ya |
| Nama Project | Ya |
| Deskripsi | Ya |
| Tanggal Mulai | Ya |
| Tanggal Selesai | Ya |
| Role dalam Project | Ya |
| Expected Output | Tidak |

**Kondisi Simpan:** `projectName.trim() && description.trim() && startDate && endDate`

**Kondisi Submit:** `projects.length >= 1` (minimum 1 proyek wajib)

**Statistik Ringkasan:**
- Total Projects
- Jumlah per kategori (3 kategori)
- Min. Requirement: ✓ (hijau) jika ≥ 1; ⚠ (oranye) jika 0
- Total Bobot (penjumlahan semua bobot project)

**View States:** `"input"` → `"preview"` → `"submitted"` (terkunci, banner hijau)

---

### 8.8 Project Check-In (`/employee/mid-year/project-outside` — tab Check-In)

**Check-In Status:**

| Nilai | Label | Warna |
|---|---|---|
| not_started | Belum Mulai | Abu-abu + AlertCircle |
| on_track | On Track | Hijau + CheckCircle2 |
| at_risk | Berisiko | Rose + AlertTriangle |
| completed | Selesai | Biru + CheckCircle2 |
| cancelled | Dibatalkan | Abu-abu + XCircle |

**Modal Check-In — Field:**
- Check-In Status (5 tombol toggle)
- Progress (slider 0–100, langkah 5) + ProgressBar visual
- Progress Notes (textarea)
- Actual Output (textarea)
- Note (textarea, latar amber di kartu)
- Upload Evidence (zona drag-and-drop, semua tipe file, disimpan sebagai base64)

**Tombol "Update":** hanya tampil jika status project `"submitted"` atau `"approved"`
**Project Draft:** tampil peringatan amber "submit dulu sebelum bisa diupdate"

**6 Kartu Statistik:** Total Projects | On Track | At Risk | Completed | Not Started | Avg. Progress

---

### 8.9 Penilaian Kinerja Saya (`/supervisor/appraisal`)

**Pemilih Tahun:** 2026 (In Progress – amber) / 2025 / 2024 / 2023 (Done – hijau)

**Banner Ringkasan Skor:**
- Tahun aktif: header amber "In Progress" + rincian bobot modul
- Tahun lalu: header hijau "Final Score" + skor tertimbang keseluruhan

**5 Tab Konten:**

1. **KPI** — Tabel: No | Perspektif | KPI | Satuan | Bobot | Baseline 2025 | Target 2026 | Aktual Pencapaian 2026; Seksi A (20%) dan B (80%)

2. **SMART Goals** — Accordion per tujuan; baris: Specific, Measurable, Attainable, Relevant, Timely, Bukti

3. **Appraisal Form** — 4 accordion: Managerial Skills (20%), Leadership (20%), Core Competency (30%), Management Interview (30%)

4. **RCA** — Tabel horizontal lebar dengan 18 kolom (No, Periode, KPI, Satuan, Baseline, Target, Actual, Masalah Utama A, Kenapa A/B/C → D, Action Plan, Target Penyelesaian, PIC, Status Perbaikan, Keterangan, Output); baris dengan rowspan untuk multi-AP

5. **Project Outside Job Scope** — Kartu ringkasan (Total Projects, Completed, Avg. Progress, Total Bobot) + Tabel (No, Category, Project Name, Bobot, Role, Timeline, Progress bar+%, Measurement Status)

---

## 9. Modul Supervisor

### 9.1 Dashboard Supervisor (`/supervisor`)

**Tab 1 — My Dashboard:**

**AppraisalSummaryCards (4 kartu):**
- Current Score: 80.9
- Current Grade: A
- Modules Approved: 0 dari 4
- Last Updated: 15/06/2026

**MilestoneProgress (4 tahap + progress bar):**

| Tahap | Status | Progress |
|---|---|---|
| Setting | Done | 100% |
| Measurement | On Progress | 66% |
| Performance Evaluation & Analysis | Not Started | 0% |
| Year end Performance Dialogue | Not Started | 0% |

*Nilai persentase: Not Started=0%, Submitted=33%, On Progress=66%, Done=100%*

**ModuleApprovalPopup** (buka dari kartu Modules Approved):
- 4 tab: KPI Tracking / SMART Goals / Appraisal Form / Managerial Skill
- Per tab: rantai 4 langkah (Check → Approver 1 → Approver 2 → Validate)
- Status tiap langkah: completed (hijau) / in_progress (amber) / pending (abu-abu)

---

**Tab 2 — Approval Dashboard:**

**4 Kartu Statistik:** Total Pending (navy) | Urgent (rose) | Assessments Due (amber) | Approvals Needed (hijau)

**Filter Modul (pill):** All | KPI | SMART Goals | Appraisal Form | Project | RCA

**Pencarian:** input teks (nama karyawan atau ID)

**Toggle "Urgent Only":** checkbox — sembunyikan item non-urgent

**Aturan Urgent:** 5 item tertua berdasarkan `submittedDate` secara otomatis ditandai Urgent (tidak bergantung field `urgent`)

**Interface PendingItem:**
```typescript
interface PendingItem {
  id: string
  employeeId: string
  employeeName: string
  position: string
  unit: string
  division: string
  module: "KPI" | "SMART Goals" | "Appraisal Form" | "Project" | "RCA"
  submissionType: string
  actionNeeded: "Approve" | "Complete Assessment" | "Review & Validate"
  submittedDate: string   // ISO date — digunakan untuk sorting urgency
  notes: string
  urgent: boolean         // computed: top 5 tertua
}
```

**Item Urgent:** border rose + banner rose "Urgent — Immediate Action Required"

**Tombol Aksi per Item:**
- "Approve" (navy) → `/supervisor/appraisals?tab=check-in`
- "Complete Assessment" (hijau) → `/supervisor/appraisals?tab=check-in`
- "Review & Validate" (amber) → `/supervisor/appraisals?tab=check-in`
- RCA → `/supervisor/appraisals?tab=setting`

**Grafik:**
- PieChart (Recharts): distribusi per modul
- Bar chart: rincian tindakan (Approve / Complete Assessment / Review & Validate)

---

### 9.2 Persetujuan Supervisor (`/supervisor/appraisals`)

**Tab Halaman** (berdasarkan URL `?tab=`):
- `check-in` → "Performance Appraisal Measurement"
- `setting` → "Performance Appraisal Setting"

**Sub-tab:** Pending (badge merah count) | Approval History

**Kolom Tabel (11):**
No | Aksi | Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit Perusahaan | Jenis Persetujuan | Tanggal Pengajuan | Tanggal Persetujuan

**Sortable:** semua kolom kecuali "Aksi" (klik header toggle asc/desc)
**Halaman:** 8 baris/halaman; navigasi «‹[halaman]›»
**Filter (6 multi-select):** Unit Perusahaan | Tahun | Bulan | Divisi | Departemen | Jenis Persetujuan

**Aksi per Baris (Tab Pending):**
- Status "Pending" → ikon FileCheck → buka ReviewDrawer (check-in) atau SettingApprovalDrawer (setting)
- Status "Edit Request" → tombol amber "Review Request" (FileEdit) → buka EditRequestReviewModal

**Aksi per Baris (Tab History):**
- Ikon Eye → buka drawer dalam mode readOnly
- Badge HistoryTag dengan label status

**EditRequestReviewModal:**
- Menampilkan: nama karyawan, ID, tipe persetujuan, jabatan, tanggal pengajuan, tanggal request, alasan edit (read-only)
- Tombol "Accept Request" (hijau + CheckCircle2) → status jadi "EditRequest-PendingA2"
- Tombol "Reject Request" (merah + XCircle) → status jadi "EditRequest-Rejected"
- Tombol "Cancel" → tutup modal

**Transisi Status (Supervisor sebagai Approver 1):**

| Aksi | Dari | Ke |
|---|---|---|
| Approve (KPI/SMART Goals/RCA) | Pending | Assessed-Approver 1 |
| Approve (tipe lain) | Pending | Approved |
| Revision | Pending | Revision |
| Assessed | Pending | Assessed-Approver 1 |
| Accept Edit Request | Edit Request | EditRequest-PendingA2 |
| Reject Edit Request | Edit Request | EditRequest-Rejected |

---

### 9.3 SMART Goals Check-In (`/supervisor/mid-year/smart-goals-checkin`)

**View States:** `"input"` (editable) / `"preview"` (read-only)

**AccumulationCard (header gelap):**
- Panel Tujuan: Total | Open | Closed | bar persentase
- Panel Action Plans: Total | Open | Closed | bar persentase
- Status Breakdown: Selesai / Sedang dilaksanakan / Belum dilaksanakan / Batal (count)

**Definisi "Closed":** tujuan dianggap Closed hanya jika SEMUA action plan-nya berstatus "Selesai"

**GoalSection (per tujuan, collapsible):**
- Tabel SMART (2 kolom: Kriteria | Uraian)
- ActionPlansSection:
  - Tabel horizontal: baris deskripsi AP + baris status AP
  - Mode editable: dropdown status; mode preview: badge status
  - Opsi Status AP: "-" / "Belum dilaksanakan" / "Sedang dilaksanakan" / "Selesai" / "Batal"

**Kartu Detail Kondisional (muncul per status):**
- "Belum dilaksanakan" → textarea "Kendala / Hambatan"
- "Sedang dilaksanakan" → slider progress 0–100 (langkah 5, bar warna hue) + textarea "Kendala / Hambatan"
  - Label slider: "Hampir selesai" (≥75%) / "Lebih dari setengah" (≥50%) / "Dalam proses" (≥25%) / "Baru dimulai" (<25%)
- "Selesai" → area unggah file (Paperclip + drag-drop); tampilkan nama + ukuran file + tombol hapus
- "Batal" → textarea "Alasan Action Plan Batal" (border dan latar merah)

**TargetVsActualSection:**
- Kolom: Goals | Target (read-only) | Actual (input) | Status
- Status: "" / "Tercapai" / "Tidak Tercapai"
- "Tidak Tercapai" → textarea "Alasan Tidak Tercapai" (border/latar merah)
- "Tercapai" → area unggah Evidence

**PenilaianAkhirSection (read-only):**
- Nilai/Score (placeholder dashed "Belum ada")
- Catatan Approver 1 (placeholder dashed "Belum ada")
- Catatan Approver 2 (placeholder dashed "Belum ada")

**Tipe File Diterima:** .jpg .jpeg .png .pdf .xlsx .xls

---

### 9.4 Tinjauan SMART Goals Approver (`/supervisor/monitoring/smart-goals` atau halaman khusus)

**Kartu Statistik (4):**
- Total Submissions | Pending Review | Approved | Needs Revision

**Status Persetujuan SMART Goals:** "Pending Review" / "Approved" / "Needs Revision"

**Kolom Tabel:**
Karyawan (avatar + nama + jabatan) | Unit/Divisi | Goals (count) | AP Selesai (bar mini) | Target vs Actual (badge) | Submitted | Status | Aksi

**Aksi:**
- "Pending Review" → tombol navy "Review" → DetailDrawer (editable)
- Status lain → tombol abu-abu "View" → DetailDrawer (read-only)

**DetailDrawer (panel kanan, max-w-4xl):**
- Header navy: avatar + nama + jabatan/unit + badge status + X tutup
- Chip meta: tanggal submit | total tujuan | total AP | tanggal direview
- StatusOverviewCard: Goals (Total/Open/Closed/bar%) | APs (Total/Open/Closed/bar%) | Status Breakdown
- Per-tujuan GoalReviewCard (collapsible): tabel SMART + tabel AP horizontal (deskripsi/status/catatan/evidence)
- TargetActualReadOnly: Goals/Target/Actual(karyawan)/Status&Keterangan
- Bagian Keputusan Approver:
  - Jika Pending: banner info + textarea feedback (opsional tapi direkomendasikan)
  - Jika sudah diputuskan: teks feedback dalam kotak berwarna + tanggal direview

**Footer (jika Pending):**
- Peringatan: "Tindakan tidak dapat dibatalkan setelah dikonfirmasi"
- "Request Revision" (amber + RotateCcw) + "Approve" (hijau + ThumbsUp)

**Transisi Status:**
- "Pending Review" → "Approved" (simpan feedback + reviewedDate)
- "Pending Review" → "Needs Revision" (simpan feedback + reviewedDate)

**Toast Notifikasi:**
- Approve: "SMART Goals berhasil diapprove." (hijau, 3.5 detik)
- Revision: "Permintaan revisi telah dikirim ke karyawan." (amber, 3.5 detik)

---

### 9.5 Managerial Skill Check-In (`/supervisor/mid-year/managerial-skill`)

**5 Kompetensi:**
1. Kepemimpinan
2. Keselarasan Organisasi
3. Perencanaan Penerus
4. Resolusi Konflik Internal
5. Resolusi Konflik Eksternal

**Bobot Tetap: 20%**

**Setiap Kompetensi Memiliki:**
- Nomor urut, label, deskripsi
- 5 indikator (skor 1–5: label + teks deskriptor)

**Kolom Tabel:**
No | Kepemimpinan dan Keterampilan Manajerial | Indikator Penilaian (tombol) | Evaluasi Pribadi Karyawan (tombol 1–5)

**Tombol "Lihat Indikator Penilaian"** → IndicatorModal (tabel: item × 5 kolom skor)

**Baris Total:** "(20%) Nilai Total" = jumlah semua penilaian yang dipilih

**Status Bar Bawah (sticky):**
- Belum semua dinilai: "N dari 5 kompetensi telah dinilai" + Simpan (nonaktif) + Submit Form (nonaktif)
- Semua dinilai, belum simpan: Simpan (aktif)
- Setelah simpan: banner hijau "Form berhasil disimpan. Total Nilai: X" + Submit Form (aktif, emas/gold)

**Modal:** ConfirmModal + SuccessModal standar

**Validasi Submit:** semua 5 kompetensi harus dinilai DAN form sudah disimpan

---

### 9.6 Management Interview Check-In — HR Scheduling (`/supervisor/setting/management-interview`)

**Tujuan:** HR atau supervisor membuat jadwal wawancara untuk tim

**Field Formulir:**

| Field | Wajib | Tipe |
|---|---|---|
| Company Unit | Ya | Dropdown (8 unit) |
| Employee | Tidak | Multi-select (20 karyawan) |
| Interviewer | Ya | Multi-select (10 senior staff) |
| Other User | Tidak | Multi-select (8 role support) |
| Tanggal Interview | Ya | DatePickerID |
| Waktu | Ya | Input waktu |
| Lokasi / Platform | Tidak | Teks (contoh: "Nama ruang, platform online") |
| Text Notifikasi | Tidak | Textarea 3 baris |
| Lampiran | Tidak | Upload file (PDF, JPG, PNG, Word, Excel) |

**Validasi:** valid = companyUnit terisi AND interviewers.length > 0 AND scheduledDate terisi AND scheduledTime terisi

**Kolom Tabel Jadwal:**
Company Unit | Tanggal | Waktu | Interviewer (tag, maks 2 + "+N" overflow) | Employee (count) | Other User (count) | Lokasi (terpotong) | Status | Aksi

**Status Jadwal:**
- "Scheduled" (biru)
- "Cancelled" (merah)
- "Done" (hijau)

**Aksi per Baris:**
- Eye (detail) → DetailModal (selalu tersedia)
- Pensil (edit) → buka form edit (tidak untuk Cancelled)
- Ban (batalkan) → konfirmasi cancel → status jadi "Cancelled"

**Toast:** "Jadwal berhasil disimpan" (hijau, 3 detik)

---

### 9.7 Management Interview Setting — Jadwal Pribadi (`/supervisor/mid-year/management-interview`)

**Tujuan:** Supervisor menjadwalkan wawancara *milik sendiri* dengan atasan

**Field Formulir:**

| Field | Wajib | Keterangan |
|---|---|---|
| Interviewer | Ya | Dropdown: Budi Santoso / Hendra Wijaya / Dewi Kusuma / Rizal Firmansyah |
| Tanggal Interview | Ya | DatePickerID |
| Waktu | Ya | Input waktu |
| Lokasi / Platform | Tidak | Teks |
| Catatan | Tidak | Textarea 3 baris |
| Lampiran Persiapan | Tidak | Drag-drop; maks 10MB per file |

**Tipe File Lampiran:** .pdf .doc .docx .xls .xlsx .png .jpg .jpeg .webp

**Validasi:** valid = interviewerName && scheduledDate && scheduledTime

**Kartu Profil Saya:** nama, jabatan, unit, grade — badge status (Dijadwalkan/Belum Dijadwalkan)

**Aksi:**
- Tombol "Create Schedule" (jika belum ada jadwal) → buka form baru
- Edit (border indigo) + Hapus (border rose) → di kartu jadwal yang ada
- "Simpan Jadwal" (navy, nonaktif jika tidak valid) / "Batal" (abu-abu)

**Toast:** "Jadwal berhasil disimpan" (hijau + CheckCircle2, 3 detik)

---

### 9.8 Halaman Monitoring Supervisor (6 Halaman)

Semua 6 halaman monitoring supervisor mengikuti pola yang sama:
- Header: judul modul + badge "2026" + badge "My Team"
- Subjudul: unit tim + divisi
- 4 Kartu Statistik
- Filter: input pencarian + dropdown status (beberapa tanpa dropdown status)
- Tabel utama
- Panel breakdown bawah

**Cakupan data:** hanya karyawan di tim supervisor (E002, E011 dalam mock data)

#### 9.8.1 KPI Monitoring

**4 Kartu:** Team Members | Submitted (+ "N belum selesai") | Avg. Achievement | Pending RCA

**Kolom Tabel:** Employee | Company Unit | Total KPI | Submitted (x/total) | Avg. Achievement (bar) | RCA Req. | RCA Done | Status | Last Updated

**Perspektif Breakdown (panel bawah):** bar horizontal per perspektif (Finansial/Proses/EHS/Customer/L&G)
- Warna: ≥90% hijau / ≥75% biru / ≥60% amber / <60% rose

#### 9.8.2 SMART Goals Monitoring

**Kolom khusus:** Goals (count) | Evidence (x/total) | Completion (bar) | S·M·A·R·T (5 titik berwarna)

**Titik S·M·A·R·T (ScoreDot):**
- ≥4: hijau / ≥3: biru / ≥2: amber / <2: rose

#### 9.8.3 Appraisal Form Monitoring

**4 Kartu:** Team Members | Self-Assessment Done | Supervisor Assessment Done | Avg. Final Score

**Kolom:** Self-Assessment (badge status) | Supervisor Assessment (badge status) | Self Score | Approver 1 Score | Approver 2 Score | Final Score

**ScorePill:** konversi 1–5 ke % (×20); warna: ≥90% hijau / ≥70% biru / ≥50% amber / <50% rose

**Status Assessment:** "Selesai" (hijau+CheckCircle2) / "Dalam Proses" (amber+Clock) / "Belum Mulai" (abu-abu+AlertCircle)

#### 9.8.4 Managerial Skill Monitoring

**5 Kompetensi:** Kepemimpinan / Keselarasan Organisasi / Perencanaan Penerus / Resolusi Konflik Internal / Resolusi Konflik Eksternal

**Perhitungan Skor:**
- Self Score = rata-rata selfScore > 0
- Approver 1 = rata-rata supScore (hanya jika supervisorStatus = "Selesai")
- Approver 2 = 0 (belum diimplementasikan)
- Final = (selfAvg + approver1) / 2 (hanya jika keduanya Selesai)

#### 9.8.5 Project Monitoring

**ProjectInfographics:** infografis partisipasi per unit (tingkat submission, jumlah submitted, total)

**Baris yang bisa diperluas (expandable row):** klik baris untuk lihat kartu detail per proyek (nama, kategori, scope, bobot, role, bar progress, badge status)

**MiniProgressBar:** tinggi 1.5px; 100%=hijau / ≥60%=biru / ≥30%=amber / >0%=rose / 0%=abu-abu

#### 9.8.6 Management Interview Monitoring

**2 Tab:**
- "Team Overview": tabel status interview per anggota tim
- "HR Schedules": daftar jadwal dari `interviewScheduleStore` (reaktif/live)

**Baris expandable (Status "Selesai"):** detail skor per dimensi + catatan interviewer

**Kolom HR Schedules:** Company Unit | Tanggal | Waktu | Interviewer | Participants | Lokasi | Status | Detail (Eye)

---

## 10. Modul HR Administrator

### 10.1 Analytics Dashboard (`/hr`)

**Kartu Statistik (4):**
- Total Employees: 205
- Completed Appraisals: computed
- Pending Reviews: computed
- Completion Rate: `(completed / total) × 100`, 1 desimal

**Filter:** Unit Perusahaan | Tahun (2026–2023) | Bulan

**4 Grafik:**

| Grafik | Difilter? | Keterangan |
|---|---|---|
| Bar Chart Unit Perusahaan | **TIDAK** | Selalu menampilkan semua 8 unit |
| Donut Status | Ya | Distribusi Selesai/Dalam Proses/Tertunda |
| Bar Chart Divisi | Ya | Per divisi dalam unit yang dipilih |
| Bar Chart Departemen | Ya | Per departemen |

**Tabel Division Breakdown:**
- Kolom: DIVISI | TOTAL KARYAWAN | SELESAI | DALAM PROSES | TERTUNDA | COMPLETION RATE (+ bar progres)
- Completion Rate: `(Selesai / total) × 100`, 1 desimal

**Warna Serie:** Selesai = indigo | Dalam Proses = amber | Tertunda = rose

---

### 10.2 Persetujuan HR (`/hr/approvals`)

Sama seperti Persetujuan Supervisor (§9.2) dengan perbedaan:

**Cakupan:** semua 8 unit perusahaan (tidak dibatasi unit/divisi tertentu)

**Transisi Status (HR sebagai Approver 2):**

| Aksi | Dari | Ke | Tanggal Persetujuan |
|---|---|---|---|
| Approve (KPI/SMART Goals/RCA) | Pending | Assessed-Approver 2 | TODAY |
| Approve (tipe lain) | Pending | Approved | TODAY |
| Revision | Pending | Revision | "-" |
| Assessed | Pending | Assessed-Approver 2 | TODAY |
| Accept Edit Request | Edit Request | EditRequest-AcceptedA2 | — |
| Reject Edit Request | Edit Request | EditRequest-Rejected | — |

**Data:** 24 baris check-in + 16 baris setting (injeksi data SMART Goals live dari store jika karyawan sudah submit)

---

### 10.3 Aktivasi Modul (`/hr/modules`)

**6 Modul yang Dapat Dikonfigurasi:**

| ID Modul | Label | Default Aktif | Default Start | Default End |
|---|---|---|---|---|
| kpi | KPI | Ya | 2026-01-02 | 2026-01-31 |
| smart-goals | SMART Goals | Ya | 2026-01-02 | 2026-01-31 |
| appraisal-form | Appraisal Form | Tidak | 2026-02-01 | 2026-07-31 |
| managerial-skill | Managerial Skill | Tidak | 2026-02-01 | 2026-07-31 |
| project | Project | Tidak | 2026-01-02 | 2026-07-31 |
| management-interview | Management Interview | Tidak | 2026-09-01 | 2026-11-30 |

**Field per Kartu Modul:**
- Status: Aktif (hijau) / Nonaktif (abu-abu)
- Tanggal Mulai (DatePickerID) — dinonaktifkan jika modul nonaktif
- Tanggal Selesai (DatePickerID) — dinonaktifkan jika modul nonaktif
- Aktivasi Untuk (MultiSelectDropdown) — dinonaktifkan jika modul nonaktif

**Opsi Jabatan (8 pilihan):**
Top Management / General Manager / Kepala/Wakil Kepala Divisi / Kepala/Wakil Kepala Departemen / Kepala/Wakil Kepala Bagian / Kepala/Wakil Kepala Seksi Operational / Operasional / All

**Perilaku MultiSelectDropdown:**
- Memilih "All" → hapus semua pilihan individual (dan sebaliknya)
- Memilih semua pilihan individual → otomatis beralih ke "All"
- Display: "Select positions…" (kosong) | "All Positions" | nama jabatan tunggal | "N positions selected"
- Chip jabatan terpilih ditampilkan di bawah dropdown (kecuali "All")

**Alur Aktifkan/Nonaktifkan:**
1. Klik tombol "Activate" / "Deactivate" → dialog konfirmasi
2. Dialog konfirmasi: "Apakah Anda yakin ingin {aktifkan|nonaktifkan} modul {label}?" — Batal | Konfirmasi
3. Konfirmasi → toggle state modul → 250ms delay → dialog sukses
4. Dialog sukses: ikon CheckCircle2 (emas) + judul + "The change has been applied successfully." + tombol "Done"

---

### 10.4 Management Override (`/hr/override`)

**2 Tab:** Reviewer Delegation | Audit Trail

**Tabel Kolom:** S/N | Karyawan (nama + role) | Coy./Div./Grp. | Status (selalu "Approved", hijau) | Submitted Date | Aksi

**Aksi:** tombol "Reassign" (navy, rounded-full) — placeholder, belum ada handler

---

### 10.5 Kalibrasi — Setting (`/hr/calibration/setting`)

**Mode Halaman (PageMode):**
- `edit`: mode default; dapat diedit setelah klik "Edit Settings"
- `preview`: pratinjau read-only sebelum submit
- `submitted`: terkunci setelah submit

**Panel Scores & Calibration (ScorePanel) — Tabel Bobot KPI:**

Lihat §6.1 untuk tabel bobot lengkap per tingkat jabatan.

- Mode edit: sel bobot jadi input teks (lebar 20px)
- Baris footer "Total": hitung total kolom secara dinamis (harus = 100%)

**Panel Scores & Calibration — Tabel Scoring/Grading:**

Mode read-only: Rentang Skor | Grading | Label
Mode edit: Min Score (input) | Max Score (input) | Grade (input) | Label (input) | Warna (color picker) | Tombol Delete
Tombol "+ Add Range" (mode edit)

**Panel Kalibrasi — Tabel Distribusi Grade:**
Kolom: GRADE | PROPORSI | KARYAWAN
- KARYAWAN = `Math.round(totalDivHC × proporsi% / 100)`
- Validasi: jika total proporsi ≠ 100%, sel JUMLAH proporsi jadi merah

**Panel Kalibrasi — Tabel Proporsi (hierarkis):**
- **Divisi (8 baris):** HC (input di edit mode) | Share Kuota % | A+ | A | B | C | D | E | JUMLAH
- **Departemen (16 baris):** tambah kolom DIVISI; Share Kuota turunan dari divisi induk
- **Bagian (32 baris):** tambah kolom DEPARTEMEN; Share Kuota turunan dari departemen induk

**Aturan Kaskade HC (Business Rule):**
- Set HC Divisi → distribusikan rata ke departemen → distribusikan rata ke bagian
- Set HC Departemen → dibatasi oleh HC divisi induk; distribusikan rata ke bagian
- Set HC Bagian → dibatasi oleh HC departemen induk

**Alur Submit:**
1. Edit Settings → Save Changes (aktifkan `isSaved`) → Preview (Eye icon) → Submit
2. SubmitConfirmModal: "Submit Calibration Setting" + peringatan tidak bisa diedit sampai approval selesai
3. Konfirmasi → `pageMode = "submitted"` + simpan ke `localStorage` (`calibration_submitted_units`, `calibration_submitted_at`)

**Banner Submitted (amber-50):** "Calibration setting has been submitted and is Pending Approval Management."

---

### 10.6 Kalibrasi — Penyesuaian (`/hr/calibration/adjustment`)

**Pembacaan Data:**
- Membaca dari `localStorage` key `calibration_submitted_units` dan `calibration_submitted_at`
- Banner info jika data ada: "Setting data loaded from Calibration Setting submission on {tanggal}"
- Banner peringatan jika tidak ada: "No submitted data yet. Submit from Calibration Setting first."

**220 Karyawan yang Digenerate:** deterministik berbasis seed (`h16`), tersebar di 32 Bagian

**Perhitungan Skor Akhir per Level:**

| Level | KPI | SMART Goals | Appraisal Form | Managerial Skill | Mgmt Interview | Project |
|---|---|---|---|---|---|---|
| Operasional | 50% | 20% | 15% | 0% | 0% | 15% |
| Pengawas | 40% | 15% | 15% | 15% | 0% | 15% |
| Kepala Bagian | 40% | 15% | 15% | 15% | 0% | 15% |
| Kepala Departemen | 40% | 15% | 15% | 20% | 0% | 10% |
| Kepala Divisi | 40% | 10% | 10% | 20% | 10% | 10% |

**Batas Penyesuaian Nilai:** ±5% dari nilai akhir dasar (base)
- `minFinal = base × 0.95`
- `maxFinal = base × 1.05`
- Langkah: `base × 0.01` (1% dari base)

**Tampilan Delta:**
- > 0: emerald-600
- < 0: red-500
- = 0: gray-800

**5 Filter Dropdown:** Divisi | Departemen (cascade dari Divisi) | Bagian (cascade dari Dept) | Posisi | Grade

**3 Kartu Ringkasan:**
- Total Karyawan (filtered) + "N disesuaikan"
- Distribusi Grade — Sebelum Kalibrasi
- Distribusi Grade — Setelah Kalibrasi (dengan delta)

**Kolom Tabel:**
# | Karyawan (nama+NIP+ikon Eye) | Divisi | Departemen | Bagian | Posisi | KPI (kunci) | Project (kunci) | SMART Goals | Appraisal Form | Managerial Skill | Mgmt Interview | Nilai Akhir (±5% adjuster) | Grade | Aksi

**Kolom "Aksi" (mode edit, baris yang sudah disesuaikan):**
- Textarea "Tambah komentar..."
- Area unggah evidence (border putus-putus biru)
- Tombol Reset (RotateCcw, merah) → reset penyesuaian, komentar, evidence

**Modal Detail Karyawan (Eye icon):**
- Toggle Tahun: Tahun saat ini / Tahun lalu
- Info Organisasi: Divisi, Departemen, Bagian, Posisi
- Panel Skor: Current (sebelum) + Final (setelah kalibrasi) + delta + bar + perubahan grade
- Catatan Kalibrasi: komentar (amber) + bukti (biru, gambar 64×64 thumbnail, PDF merah)
- Data Pendukung: Project · Kedisiplinan · Pelanggaran + catatan semua approver + RCA

**RCA Detail Modal (dari data pendukung):**
- Header: nama karyawan + count Open/Closed
- Tabel: # | Masalah Utama | Periode | Status (amber=Open, emerald=Closed)

**Grafik Bell Curve:**
- ComposedChart: bar Setting (navy, 30% opacity) + bar Aktual (teal, 30% opacity) + garis kurva Setting (navy putus-putus) + garis kurva Aktual (teal solid)
- Kartu samping: delta aktual vs setting per grade (±%)

---

### 10.7 Scores & Calibration (`/hr/settings/scores-calibration`)

Gabungan ScorePanel (bobot + rentang skor) dan CalibrationPanel per unit — tanpa alur preview/submit seperti CalibrationSetting.

Tindakan bar: Edit Settings / Save Changes + Cancel (tanpa tombol Preview/Submit).

---

### 10.8 Goal Oversight (`/hr/appraisals/goals`)

Tabel sederhana: S/N | Karyawan (nama+role) | Coy./Div./Grp. | Status (selalu "Approved", hijau) | Submitted Date | Aksi (tombol "View", Eye icon)

Pencarian: input + tombol "Search" (emas #C69A45)

---

### 10.9 Mid-Year Check-In (`/hr/appraisals/mid-year`)

Tabel sama dengan Goal Oversight. Aksi "View" → navigasi ke `/hr/appraisals/mid-year/{row.id}`

**Halaman Detail (`/hr/appraisals/mid-year/:id`):**

**Header:** nama karyawan, role, divisi, periode ("January to June 2026")

**Overall Progress Card:**
- Total: "5 Goals" (badge biru)
- Nilai progres: 81% (teks besar)
- Bar progres penuh (navy fill)
- 3 sub-metrik: Completed (hijau) | On Track (emas) | Needs Attention (merah)

**3 Tab:** Common Goals | Shared Goals | Individual Goals

**Kartu Tujuan per Tab (5 item):**
- Label bobot (badge abu-abu bordered)
- Chevron (tidak ada logika expand/collapse yang diimplementasikan)
- Judul tujuan + "KPI + Target" info

---

### 10.10 Open Lock — Buka Kunci (`/hr/setting/open-lock`)

**Interface Data:**

```typescript
interface OpenLockRequest {
  id: string
  employeeId: string
  employeeName: string
  nip: string
  divisi: string
  departemen: string
  bagian: string
  posisi: string
  module: "KPI Tracking" | "SMART Goals" | "Appraisal Form"
  period: string             // e.g. "Jun-2026", "Q2-2026"
  originalDeadline: string   // ISO date
  submittedAt: string        // ISO datetime
  reason: string             // alasan karyawan
  status: "pending" | "approved" | "rejected"
  approvedUntil?: string     // ISO date (saat disetujui)
  approvedAt?: string        // ISO datetime
  approvalNote?: string      // catatan admin
  rejectedAt?: string        // ISO datetime
}
```

**3 Kartu Ringkasan:** Total Request | Menunggu Approval (amber) | Disetujui (hijau)

**Banner Admin:** "Fitur ini hanya dapat diakses oleh admin HR..."

**2 Tab:** Pending (pill + count) | History (pill + count)

**Filter:**
- Cari Karyawan (nama, NIP, departemen)
- Modul (Semua / KPI Tracking / SMART Goals / Appraisal Form)
- Divisi (dari data)
- Hasil — hanya tab History (Semua / Approved / Rejected)

**Kolom Tab Pending:** # | Karyawan | Divisi/Dept | Posisi | Modul | Deadline ("Xh lalu") | Aksi (Detail + Review)
**Kolom Tab History:** + kolom Akses Hingga | Status | (hanya tombol Detail)

**ApproveModal — Tab "Approve & Set Open Date":**
- Field: "Buka Akses Hingga *" (DatePickerID, default = hari ini + 3 hari)
- Field: "Catatan Admin (opsional)" (textarea)
- Tombol "Approve & Buka Akses" — dinonaktifkan jika tanggal belum dipilih
- Validasi: `canApprove = openUntil.length > 0`

**ApproveModal — Tab "Reject":**
- Field: "Alasan Penolakan *" (textarea, wajib)
- Catatan: "Alasan penolakan akan disampaikan kepada karyawan."
- Tombol "Tolak Request" — dinonaktifkan jika alasan kosong
- Validasi: `canReject = note.trim().length > 0`

**Transisi Status:**
- `pending` → `approved` (set approvedUntil, approvedAt, approvalNote)
- `pending` → `rejected` (set rejectedAt, approvalNote)

**Toast Sukses:**
- Setujui: "Open lock disetujui. Karyawan kini dapat mengisi modul hingga tanggal yang ditentukan."
- Tolak: "Request ditolak dan catatan alasan telah disimpan."

---

### 10.11 KPI Setting HR (`/hr/setting/kpi`)

Sama seperti §8.2 (KPI Setting) dengan fitur tambahan:
- Tab Corporate KPI dengan data cascading FC/PC/CC ke 6 GM/VGM role
- KPI Korporat mencakup data Section A–F dengan scope multi-unit (RSUP Group, RSUP Perkebunan+ASD+RSTM+GHS, dll.)

---

### 10.12 Manajemen Bukti / Evidence (`/hr/evidence/*`)

**4 Tipe Evidence (sub-halaman):**

| Tipe | Ikon | Warna |
|---|---|---|
| KPI Tracking | TrendingUp | Biru |
| SMART Goals | Lightbulb | Amber |
| Management Interview | MessageSquare | Ungu |
| RCA | RefreshCw | Rose |

**Kolom Tabel (semua tipe):**
Checkbox | No | Aksi (Eye + Download) | Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit | Periode | Status | Submitted Date

**Kolom Tambahan RCA:** Periode (singkat) | KPI (nama KPI) | Progress APs % (bar)

**Filter (multi-select, semua tipe):** Tahun | Unit Perusahaan | Divisi | Departemen | Status Persetujuan

**Filter Khusus:** Bulan (hanya KPI Tracking) | Periode RCA (Jan–Des) | Progress APs % (hanya RCA)

**Status Persetujuan:**
- Approved: hijau-50, CheckCircle2
- Pending: amber-50, Clock
- Revision: orange-50, RotateCcw
- Closed (RCA): hijau-100, CheckCircle2

**Warna Bar Progress RCA:**
- 100% (atau status Closed): hijau
- ≥50%: biru
- >0%: amber
- 0%: abu-abu

**Seleksi Baris:** Set<string> berdasarkan field `no`; header checkbox memilih semua baris terfilter

**Ekspor .rar:** dinonaktifkan (abu-abu) jika tidak ada baris dipilih; aktif (navy + badge count) jika ada yang dipilih

---

### 10.13 Monitoring HR (6 Halaman)

Pola sama dengan Monitoring Supervisor (§9.8) namun cakupan data **semua unit** (bukan hanya tim sendiri).

**Perbedaan HR vs Supervisor:**
- Tidak ada badge "My Team"
- Filter unit mencakup semua 8 unit
- Data karyawan lebih banyak

---

### 10.14 Master Data — Master KPI (`/hr/settings/master/kpi`)

**7 Bagian Lookup:**

| Key | Label | Warna | Ada Deskripsi? |
|---|---|---|---|
| scope | Scope | Biru | Tidak |
| section | Section | Ungu | Tidak |
| perspektif | Perspektif | Teal | Tidak |
| satuan | Satuan | Oranye | Tidak |
| period | Period | Rose | Tidak |
| trackingPeriod | Tracking Period | Indigo | Tidak |
| cascading | Cascading | Emerald | Ya (Code + Role Name) |

**Setiap Kartu Bagian:** header (titik berwarna + label + badge count) + tombol Tambah + daftar item (hover: ikon Edit + Delete)

**ItemModal (Tambah/Edit):**
- Field "Value" (wajib, Enter untuk submit)
- Bagian Cascading: tambah field "Code/Abbreviation" + "Role Name"
- Tombol "Add" / "Update" (nonaktif jika value kosong)

**Konfirmasi Hapus:** "Delete item?" + preview nilai + Batal + "Delete" (merah)

**Integrasi:** data disimpan ke `masterKpiStore` (localStorage); dibaca oleh KPISetting saat membangun dropdown

---

### 10.15 Master Data — Master Formulir Penilaian (`/hr/settings/master/appraisal-form`)

**3 Tab Form:** A | B | C (bobot masing-masing dikonfigurasi)

**Setiap Item Form:**
- No (urut)
- Label (prefix italic bold)
- Deskripsi (teks utama)
- 5 Indikator (skor 1–5: label + teks deskriptor)

**Tombol "Edit Indikator" per Item:** buka EditModal (5 textarea indikator)

**Tombol "Tambah Item" (inline):** buka AddItemModal (validasi: deskripsi.trim().length > 0)

**Hapus Item:** nomor urut disesuaikan ulang otomatis (1, 2, 3...)

**Reset Default:** kembalikan ke data asli FORMS
**Simpan Perubahan:** toggle state "Saved ✓" (tidak ada persistensi server dalam mock)

---

### 10.16 Master Data — Master Managerial Skill (`/hr/settings/master/managerial-skill`)

Bobot tetap: **20%**

Pola sama dengan Master Formulir Penilaian (Edit/Add/Delete item dengan 5 indikator). Data diambil dari `MS_ITEMS` (diimpor dari ManagerialSkillCheckIn).

---

### 10.17 Manajemen Pengguna (`/hr/settings/user-management`)

**Tab 1 — User Management:**

**Interface User:**

```typescript
interface User {
  id: string
  name: string
  employeeId: string        // e.g. "E001"
  position: string
  company: string           // unit perusahaan
  division: string
  department: string
  grade: string             // Grade 4–9
  role: "HR Admin" | "Supervisor" | "Employee" | ""
  groupings: string         // "All Employee" | "TEAM_UNIT" | "TEAM_DIV"
  status: "Active" | "Inactive"
  lastLogin: string
  email: string
}
```

**4 Kartu Statistik:** Total Users (navy) | Active Users (hijau) | Supervisors (biru) | HR Admins (ungu)

**Filter:** Show entries (10/25/50) | Role | Company | Status | Search (nama, ID, email)

**Kolom Tabel:**
Employee (avatar+nama+ID·jabatan) | Company/Unit | Division | Dept (badge biru) | Grade | Role (badge) | Groupings (badge emerald) | Status (badge+titik) | Last Login | Aksi (Eye+Edit+Delete)

**ViewModal (read-only):** banner gradien + avatar + info + 8 field dalam grid 2 kolom

**EditModal (Tambah/Edit):**
- Input teks (2 kolom): Full Name, Employee ID, Email, Jabatan, Division, Department
- Dropdown: Company/Unit, Grade, Role (+ "— No Role —"), Groupings, Status

**DeleteModal:** tidak bisa dibatalkan — "Remove [name] (ID: [id]) from the system?" + Delete (merah)

---

**Tab 2 — User Grouping:**

**7 Kelompok (urutan hierarki):**
Operational / Pengawas/Kepala Bagian / Kepala Departemen / Kepala Divisi / General Manager / COO / Direktur

**21 Aturan Pemetaan Jabatan-ke-Kelompok (dapat dikonfigurasi)**

**Warna Badge Kelompok:**
- Operational: sky-50/sky-700
- Pengawas/Kepala Bagian: violet-50/violet-700
- Kepala Departemen: amber-50/amber-700
- Kepala Divisi: emerald-50/emerald-700
- General Manager: blue-50/blue-700
- COO: purple-50/purple-700
- Direktur: rose-50/rose-700

**Kolom Tabel:** # | Position/Jabatan | Group (badge) | Description | Aksi (Edit+Delete)

**GroupRuleModal (Tambah/Edit):** Position (wajib, input teks) + Group (dropdown + preview badge) + Description (textarea); Tambah nonaktif jika position kosong

**Aturan Bisnis:** posisi yang dipetakan ke kelompok mewarisi cakupan KPI dan pengaturan penilaian kelompok tersebut

---

### 10.18 Manajemen Akses (`/hr/settings/access-management`)

**5 Peran Bawaan:**
1. Administrator
2. Director/COO
3. GM/Coordinator
4. Supervisor
5. Employee

Dapat membuat **peran kustom** tambahan (mulai dari semua izin nonaktif).

**5 Tipe Izin:** View | Create | Edit | Delete | Approve

**Struktur Menu (17+ item dengan hierarki):**
- Analytics Dashboard
- Performance Appraisal Monitoring (6 sub-item)
- Performance Appraisal Setting (3 sub-item)
- Performance Appraisal Summary
- Approvals
- Documents
- Setting (8 sub-item termasuk Audit Trail)

**Tabel Izin:** Kolom Menu/Modul | View | Create | Edit | Delete | Approve — checkbox per sel

**Aksi Toolbar:** Expand All / Collapse All | Pencarian menu | Reset to Default (RefreshCw) | Save Changes

**SaveModal:** "This will update the permissions for all users with the [role] role across the system." + Konfirmasi

**AddAccessModal (Tambah Peran Baru):**
- Input "Role Name" (wajib, tidak boleh duplikat)
- Catatan: "Peran baru mulai dengan semua izin dinonaktifkan"
- Error duplikat: "A role with this name already exists."

**Banner Sukses Simpan:** "Saved! Permissions for [role] have been updated successfully." (hijau, inline)

---

### 10.19 Manajemen Menu (`/hr/settings/menu-management`)

**Interface MenuItem:**
```typescript
interface MenuItem {
  id: string
  label: string
  path: string
  icon: string         // nama komponen ikon
  isVisible: boolean
  order: number
  roles: string[]      // "HR Admin" | "Supervisor" | "Employee"
  children?: MenuItem[]
}
```

**7 Item Top-Level:** Analytics Dashboard | PA Monitoring | PA Setting | PA Summary | Approvals | Documents | Setting

**Kolom Tabel:** Menu Label (indentasi per kedalaman) | Path | Ikon | Roles (badge) | Order | Visibility (toggle Eye/EyeOff) | Aksi (Edit+Delete)

**Toggle Visibility (inline):** klik toggle sel visibility → ubah `isVisible` langsung

**EditMenuModal:**
- Menu Label (input)
- Path/URL (input)
- Icon Name (input) + Order (number, min 1) — dalam 2 kolom
- Visible to Roles: tombol pill toggle per role
- Toggle Visibility: ToggleRight (hijau "Visible") / ToggleLeft (abu-abu "Hidden")

**Tombol Simpan:** menetapkan `saved=true` + tampilkan "✓ Changes saved"

---

### 10.20 Sinkronisasi Data (`/hr/settings/data-sync`)

**4 Item Sync:**

| ID | Label | Deskripsi |
|---|---|---|
| all | All Data | Sync semua sekaligus |
| absensi | Data Summary Absensi | Rekap kehadiran |
| karyawan | Data Jumlah Karyawan | Headcount dan distribusi |
| pelanggaran | Data Pelanggaran | Catatan pelanggaran dan sanksi |

**Status Item:**
- `idle`: abu-abu, Clock icon, "Not synced"
- `syncing`: biru, RefreshCw (berputar) + animate-pulse, "Menyinkron..."
- `success`: hijau, CheckCircle2, "Berhasil"
- `error`: merah, AlertCircle, "Gagal"

**Perilaku Checkbox:**
- Centang "All Data" → pilih semua 4 item
- Centang semua item anak → auto-centang "All Data"
- Hapus centang salah satu anak → hapus centang "All Data"

**Tombol Sync Now:**
- Nonaktif jika tidak ada yang dipilih ATAU sedang sync
- Proses: item berpindah ke "syncing" → staggered 1.2 detik per item → "success" + timestamp

---

### 10.21 Audit Trail (`/hr/settings/audit-trail`)

**Interface Data:**
```typescript
interface AuditLog {
  id: string                    // e.g. "A001"
  timestamp: string             // "YYYY-MM-DD HH:MM:SS"
  userId: string
  userName: string
  role: string
  action: ActionType
  module: MainModule
  subModule?: string
  section?: string
  description: string
  ipAddress: string
  status: "Success" | "Failed"
  before?: string               // JSON snapshot sebelum
  after?: string                // JSON snapshot sesudah
}
```

**Tipe Aksi & Warna:**
Login (biru) | Logout (abu-abu) | Create (hijau) | Update (amber) | Delete (merah) | Approve (ungu) | Reject (oranye) | Export (cyan)

**Modul Utama:** KPI | Performance Appraisal | SMART Goals | HR Settings | System | Project | Dashboard

**Sub-Modul Kontekstual** (hanya muncul jika modul yang dipilih memiliki sub-modul):
- KPI: KPI Setting, KPI Tracking, Monitoring
- Performance Appraisal: Measurement, Appraisal Form, Approvals
- SMART Goals: SMART Goals Setting, SMART Goals Tracking
- HR Settings: User Management, Access Management, Menu Management, Approval Management, Audit Trail, Data Sync, Open Lock

**4 Kartu Statistik:** Total Logs (navy) | Successful (hijau) | Failed (merah) | Today (biru)

**Filter:**
- Show entries (10/25/50)
- Module / Sub Module (kontekstual, disabled jika tidak ada sub) / Action / Status
- Date Range toggle (From DatePickerID + To DatePickerID + tombol "Clear")
- Search (nama user, ID, deskripsi, IP address)
- Reset (RefreshCw)
- Export (Download icon)

**Dropdown Sub-Modul:** disabled jika modul yang dipilih tidak memiliki sub-modul; berubah ulang ke "All Sub Modules" saat modul utama berubah

**Kolom Tabel:** # | Timestamp | User (nama+ID·role) | Action (badge) | Module (badge navy) | Sub Module (pill biru) | Section/Table | Description (clamp 2 baris) | IP Address | Status (titik+teks) | Detail (Eye)

**DetailModal:**
- Grid 2 kolom: ID, Timestamp, IP, User, Role, Status
- Module badge + Sub Module pill + Section/Table + Action badge + Description
- Panel Before (merah-50) + After (hijau-50): JSON pre-formatted berdampingan

---

## 11. Fitur & Halaman Bersama

### 11.1 Ringkasan Penilaian Kinerja (`/hr/summary`, `/supervisor/summary`)

**193 Karyawan** (deterministik seeded, 8 unit, 8 divisi, 16 departemen, 32 bagian)

**Distribusi Grade:**
A+(11) | A(24) | B(71) | C(51) | D(22) | E(14) — total 193

**Pembatasan Peran:**
- HR: semua karyawan di semua unit
- Supervisor: hanya PT RSUP (Industry) dan PT Pulau Sambu (Jakarta)

**5 Filter:** Tahun | Unit Perusahaan | Divisi | Departemen | Jabatan

**Baris Ringkasan:**
- Total Karyawan (filtered)
- Rata-rata Skor
- Count per grade (A+ hingga E)

**Panel Distribusi Skor/Grade:**
- AreaChart bell curve: Target vs Aktual per grade (area transparan)
- BarChart: Target % vs Aktual % berdampingan per grade
- Legenda: count aktual + delta dari target per grade

**Tabel Karyawan (20 kolom):**
Employee ID | Nama Lengkap | Jabatan | Departemen | Divisi | Unit Perusahaan | Bergabung | Masa Kerja | Tanggal Persetujuan | Skor KPI | Skor SMART Goals | Skor Form A/B/C | Skor Project | Skor Managerial Skill | Skor Mgmt Interview | Skor Akhir % | Grade Akhir | Detail

**Sortable:** Nama, Jabatan, Departemen, Divisi, Unit, Tanggal Persetujuan, Skor, Grade

**DetailDrawer (panel kanan, 520px):**
- Info karyawan (9 field)
- Panel skor akhir/grade
- Kartu skor per modul dengan bar dan bobot %
- Hitung total tertimbang

**Panel Distribusi per Kelompok (4 tab):**
Per Unit Perusahaan | Per Divisi | Per Departemen | Per Jabatan

Kolom: Nama Kelompok | Total HC | A+/A/B/C/D/E count+% | Delta dari target (indikator warna)

**Indikator Delta:**
- Oranye: aktual > target + 5pp
- Biru: aktual < target - 5pp
- Hijau: dalam ±5pp

---

### 11.2 Halaman Dokumen (`/hr/documents`, `/supervisor/documents`, `/employee/documents`)

**7 Tab:** Overview | KPI | SMART Goals | Appraisal Form | Project Outside Job Scope | Managerial Skill | RCA

**Tipe Dokumen & Warna Badge:**
- Guide: navy `#1A284F`
- Template: amber
- Reference: teal
- FAQ: ungu

**Pencarian:** filter berdasarkan judul, deskripsi, judul bagian, konten bagian (case-insensitive, dalam tab aktif)

**Accordion:** bagian pertama terbuka default; toggle individual

**Konten Dokumentasi Utama:**
- **Overview:** panduan lengkap siklus penilaian, checklist quick-start
- **KPI:** panduan setting target, rumus tracking, kondisi trigger RCA (<80%)
- **SMART Goals:** panduan framework SMART, syarat minimum 3 tujuan
- **Appraisal Form:** panduan penilaian kompetensi, skala 1–5, split 30% karyawan / 70% supervisor
- **Managerial Skill:** khusus Grade 7+, 5 area kompetensi, bobot 10%
- **RCA:** metodologi 5 Why (chain A→B→C→D), trigger <80%, syarat action plan

**Skala Grade (dari dokumentasi):**

| Range Skor | Grade | Deskripsi |
|---|---|---|
| 90–100 | Istimewa | Grade 5 |
| 80–89 | Melampaui Ekspektasi | Grade 4 |
| 70–79 | Memenuhi Ekspektasi | Grade 3 |
| 60–69 | Di Bawah Ekspektasi | Grade 2 |
| < 60 | Tidak Memuaskan | Grade 1 |

---

### 11.3 Lihat Profil (`/hr/profile`, `/supervisor/profile`, `/employee/profile`)

**Data Profil Mock (pengguna saat ini):**
- Nama: Anis Sandi | ID: E001 | Jabatan: HR Strategic Specialist
- Departemen: Human Resource Department | Divisi: Divisi SDM
- Perusahaan: PT RSUP (Industry) | Tanggal Bergabung: 2019-03-15

**Pemilih Tahun:** 2026 ("In Progress" amber) | 2025 ("Done" hijau) | 2024 | 2023

**Data Skor per Tahun:**

| Tahun | Skor | Grade | Status |
|---|---|---|---|
| 2026 | 80.9 | A | in-progress |
| 2025 | 87.4 | A | final |
| 2024 | 79.2 | B | final |

**6 Modul Hasil (dengan bobot):**
KPI (40%) | SMART Goals (15%) | Appraisal Form (15%) | Project (15%) | Managerial Skill (10%) | Management Interview (5%)

**4 Kartu Statistik:** Skor/Nilai | Grade + sub-label | Modules Approved | Last Updated

**3 Tab:**
1. **Overview:** BarChart per modul + kartu hasil per modul + catatan approver
2. **Module Results:** banner status + kartu modul expandable (dengan sub-hasil BarChart)
3. **KPI Detail:** 4 kartu + tabel indikator KPI (No, KPI, Target, Capaian, Skor bar, Grade)

**ProgressRing:** SVG circle animasi (stroke-dashoffset)

---

### 11.4 Project Outside Job Scope — Halaman Gabungan

Tab container dengan 2 sub-halaman:

| Tab | Ikon | Label | Komponen |
|---|---|---|---|
| setting | Plus | Project Outside Job Scope | ProjectOutsidePage |
| checkin | FolderKanban | Project Outside Job Scope Measurement | ProjectCheckInPage |

---

## 12. Komponen Bersama (Shared Components)

### 12.1 ReviewDrawer (Komponen Drawer Persetujuan)

Drawer layar penuh untuk Approver 1 dan Approver 2 meninjau submission check-in.

**Props:** `row` (ApprovalRow) | `reviewerRole` ("approver1" | "approver2") | `onClose` | `onApprove` | `onRevision(note)` | `onAssessed` | `readOnly?`

**6 Tipe Konten:**

| Tipe | Komponen Sub |
|---|---|
| KPI | KPIReview |
| SMART Goals | SmartGoalsApproverReview |
| Appraisal Form | AppraisalFormReview |
| Managerial Skill | ManagerialSkillReview |
| Project | ProjectReview |
| RCA | RCAReviewPreview |

**Bar Atas:**
- X tutup + badge tipe + badge status
- Info karyawan: nama + jabatan/dept/div + tanggal pengajuan + label peran reviewer

**Status Badge:**
- `"Assessed-Approver 2"`: "Assessed" (hijau + CheckCircle2)
- readOnly: "Read Only" (abu-abu + Eye)
- Default: "Pending Review" (amber)

**2 Langkah (step):**
- `"review"`: tampilkan konten tipe baris
- `"revision"`: textarea catatan revisi (8 baris) + link kembali + tombol kirim

**KPIReview:**
- Toggle "View Table Format" / "View Cards"
- Cards view: kartu per KPI (top 4) dengan grid bulanan Aktual vs Target
- Table view: gunakan komponen KPITableView
- Bagian Evidence: file per bulan, tombol Download + View
- Catatan Approver: textarea berlabel approver (Approver 1: biru, Approver 2: ungu) + indikator auto-saved

**SmartGoalsApproverReview (dalam Drawer):**
- SG_StatusOverview (kartu gelap)
- GoalReviewCard per tujuan (collapsible): tabel SMART + tabel AP (deskripsi/status/catatan/evidence)
- TargetActualReadOnly (Goals/Target/Actual/Status)
- Bagian Penilaian Approver (per tujuan, 0–100%): input number/progress bar
- Komentar global (textarea)
- Ringkasan skor + Skor Akhir (hanya jika data A1 dan A2 tersedia)
- **Formula Skor Akhir SMART Goals:** `RataRataOverall × getBobotByPosition / 100`

**AppraisalFormReview:**
- 3 tab form (A/B/C)
- Kolom: No | Kompetensi | Indikator | Evaluasi Karyawan (1–5) | [Evaluasi A1 jika Approver 2] | Evaluasi Approver (1–5, editable)
- Baris Total: "Rata-Rata (maks 5.00)"
- Tombol "Next: [Form Name]" (nonaktif sampai form selesai dinilai)
- Ringkasan Rata-rata (hanya di Form C): Tabel Form/Bobot/Self/[A1]/Assessor/Aktual/Konversi/Skor Final

**Logika allFilled:**
- Managerial Skill: semua 5 item harus dinilai
- SMART Goals: 2 tujuan pertama harus dinilai
- Appraisal Form: semua 3 form (A+B+C) × semua item harus dinilai

**Footer:**
- readOnly/sudah diproses: pesan read-only dengan centang hijau
- hasAssessment (Form/Managerial Skill) + belum allFilled: petunjuk apa yang perlu dilengkapi
- !hasAssessment (KPI/SG/Project): "Review the submitted data..." + tombol "Request Revision" + "Approve"
- Tombol "Submit Assessment" (nonaktif sampai allFilled)

**Modal:**
- IndicatorModal: overlay layar penuh, tabel 5 kolom skor
- ApproveConfirmModal: ikon CheckCircle2 hijau + nama/ID karyawan + Batal + "Confirm Approve"
- SubmitConfirmModal: "Action Confirmation" + peringatan tidak bisa dibatalkan + Batal + Submit

---

### 12.2 SettingApprovalDrawer (Drawer Persetujuan Setting)

Drawer layar penuh untuk meninjau submission setting-phase.

**Props:** `row` | `onClose` | `onApprove` | `onRevision(note)` | `readOnly?`

**6 Tipe Konten:**

| Tipe | Komponen Sub |
|---|---|
| KPI | KPIContent (tabel/kartu toggle) |
| SMART Goals | SmartGoalsSettingContent (baca dari smartGoalsStore) |
| Appraisal Form | AppraisalFormSettingContent (kartu expandable) |
| Managerial Skill | ManSkillSettingContent (tabel 5 kompetensi + indikator 1–5) |
| Project Outside | ProjectContent (2 kartu proyek contoh) |
| Management Interview | InterviewContent (1 kartu jadwal contoh) |

**KPIContent:** toggle Cards/Table; Cards = kartu expandable per KPI dengan semua field; Table = format tabel lengkap 13 kolom

**SmartGoalsSettingContent:** baca data live untuk EMP002 (dari smartGoalsStore); data sample untuk ID lain

**Footer (jika tidak readOnly dan belum diproses):**
- "Request Revision" + "Approve"
- Request Revision → tampilkan textarea revisi inline + Batal + "Send Revision Request" (nonaktif jika kosong)

---

### 12.3 KPITableView (Komponen Tabel KPI)

Komponen reusable untuk menampilkan data KPI dalam format tabel dengan kolom bulanan.

**Props:** `kpiItems[]` | `months[]` | `cells` (nilai aktual per sel)

**Struktur Header:**
- 13 kolom tetap (No, Perspektif, KPI, Satuan, Formula, Bobot, Definisi, Source, Baseline, Target, Polaritas, Detail Formula, Keterangan)
- N kolom dinamis (satu per bulan)
- 1 kolom "2026 Total" (latar navy #0F3460)

**Tipe Baris:** input reguler (hijau-50) | target (sky-50) | komputasi/auto (emerald-50) | bold (hijau-50 lebih terang)

**parseNum:** hapus koma dan "%" lalu parseFloat; kembalikan null jika tidak numerik atau "—"

**Lebar Minimum Kolom:**
- No=50, Perspektif=120, KPI=200, Satuan=110, Formula=90, Bobot=64, Definisi=220, Source=155, Baseline/Target/Polaritas=88, Detail Formula=230, Keterangan=160, Sub-row=100, bulan=120, 2026 Total=120

---

### 12.4 ExportImportButton

Komponen tombol ekspor/impor XLSX yang digunakan di seluruh halaman.

**Ekspor:** kumpulkan semua data visible → file XLSX
**Impor:** parse berdasarkan header kolom menggunakan pencocokan regex

---

### 12.5 DatePickerID

Komponen date picker sesuai konvensi tanggal Indonesia.

---

### 12.6 ReviewDrawer — Modal Indikator

Overlay layar penuh menampilkan tabel: Item × 5 Kolom Skor dengan teks deskriptor lengkap. Tombol "Tutup".

---

## 13. State Management & Penyimpanan Data

### 13.1 Shared Stores (In-Memory/LocalStorage)

| Store | Fungsi | Digunakan Oleh |
|---|---|---|
| `approvalsStore` | `saveOverride(no, status, date)` / `applyOverrides(baseRows)` / `saveAssessment(...)` / `loadAssessment(...)` | Approvals.tsx (HR+Supervisor), ReviewDrawer |
| `smartGoalsStore` | `saveSubmittedGoals(goals)` / `loadSubmittedGoals()` | SMARTGoals.tsx (tulis), SettingApprovalDrawer (baca) |
| `projectStore` | `submitAll()` / `projects` / `ROLE_OPTIONS` | ProjectOutsidePage, ProjectCheckInPage |
| `interviewScheduleStore` | `saveSchedule(form)` / `clearSchedule()` / subscribe (reaktif) | ManagementInterviewSetting (tulis), ManagementInterviewMonitoring (baca) |
| `masterKpiStore` | CRUD 7 bagian lookup | MasterKPI (tulis), KPISetting (baca untuk dropdown) |

### 13.2 LocalStorage Keys

| Key | Format | Ditulis oleh | Dibaca oleh |
|---|---|---|---|
| `calibration_submitted_units` | JSON array unit | CalibrationSetting | CalibrationAdjustment, PerformanceAppraisalSummary |
| `calibration_submitted_at` | ISO timestamp | CalibrationSetting | CalibrationAdjustment |
| RCA submissions | Array RCARow | RCAPage (loadRCASubmissions, deleteRCASubmission) | RCAPage |

### 13.3 Tanggal Sistem yang Di-hardcode

**TODAY = "08/06/2026"** — digunakan di Approvals.tsx untuk cap waktu persetujuan

---

## 14. Kebutuhan Non-Fungsional

### 14.1 Kinerja
- Pemuatan halaman awal: < 3 detik pada jaringan perusahaan standar
- Navigasi antar rute: instan (SPA, tanpa muat ulang penuh)
- Animasi toggle sidebar: selesai dalam 300ms (`transition-[width] duration-300 ease-in-out`)
- Grafik Recharts: `animation={false}` pada beberapa chart untuk performa (mis. AnalyticsDashboard)

### 14.2 Kegunaan (Usability)
- Lebar layar minimum yang didukung: 1280px (laptop standar)
- Semua elemen interaktif memenuhi persyaratan kontras WCAG 2.1 AA
- Navigasi keyboard di seluruh aplikasi (pencarian, tabel, modal)
- Sidebar dapat diciutkan sepenuhnya (w-0) untuk memaksimalkan area konten
- Sticky header kolom pada tabel KPI untuk scrolling horizontal

### 14.3 Aksesibilitas
- Semua tombol hanya-ikon memiliki atribut `title`
- Input formulir memiliki label atau placeholder yang jelas
- Fokus modal terjebak saat terbuka; dikembalikan saat ditutup
- Tombol dengan state disabled diberi `cursor-not-allowed` dan `opacity-40`/`opacity-60`

### 14.4 Keamanan
- Autentikasi berbasis OTP (tanpa kata sandi statis)
- Akses rute berbasis peran: karyawan tidak dapat mengakses rute supervisor atau HR
- Cakupan data supervisor dibatasi pada unit/divisi sendiri (sisi server dalam implementasi nyata)
- Semua mutasi state dicatat ke Audit Trail dengan identitas pengguna dan IP

### 14.5 Lokalisasi
- Bahasa UI utama: **Bahasa Inggris**
- Toggle bahasa (EN/ID) tersedia di Topbar untuk lokalisasi Bahasa Indonesia (mendatang)
- Format tanggal: konvensi Indonesia melalui komponen DatePickerID
- Beberapa label UI tetap dalam Bahasa Indonesia (nama jabatan, kategori bisnis, dll.)

### 14.6 Ekspor/Impor Data

| Fitur | Halaman | Keterangan |
|---|---|---|
| Ekspor XLSX | KPI Tracking, KPI Setting, SMART Goals, SMART Goals Check-In, Kalibrasi Penyesuaian | Tombol tersedia |
| Impor XLSX | KPI Tracking, KPI Setting, SMART Goals | Header matching via regex |
| Ekspor Bukti (.rar) | Evidence Management | Membutuhkan ≥1 baris dipilih |
| Ekspor Laporan | Ringkasan Penilaian | Tombol tersedia (logika file belum diimplementasikan) |

### 14.7 Notifikasi & Umpan Balik Pengguna

**Toast Notifications** (3–3.5 detik, auto-dismiss):
- Digunakan di: ManagementInterviewCheckIn, ManagementInterviewSetting, SmartGoalsApproverReview

**Modal Konfirmasi** (sebelum aksi destruktif/ireversibel):
- Aktifkan/Nonaktifkan Modul → dialog konfirmasi + dialog sukses
- Submit Kalibrasi Setting → SubmitConfirmModal
- Submit Kalibrasi Adjustment → SubmitConfirmModal
- Hapus Pengguna → DeleteModal dengan peringatan tidak bisa dibatalkan
- Cancel Jadwal Interview → dialog konfirmasi
- Setiap aksi Setujui/Revisi di ReviewDrawer/SettingApprovalDrawer

**Banner Status** (tetap, dalam halaman):
- Hijau: pengajuan berhasil / perubahan disimpan
- Amber: mode preview / submitted menunggu approval
- Biru: mode info / instruksi

---

## 15. Di Luar Ruang Lingkup

Item berikut secara eksplisit tidak termasuk dalam versi ini (v1.0):

| Item | Catatan |
|---|---|
| Aplikasi mobile / native | Hanya web; tidak ada tata letak mobile responsif |
| Notifikasi real-time (push) | Notifikasi bersifat manual/polling; tanpa WebSocket |
| Pembuatan file XLSX aktual (ekspor) | Tombol ekspor tersedia di UI; logika pembuatan file adalah tanggung jawab backend |
| Integrasi OTP Email / Telegram | Alur OTP disimulasikan (penundaan 800ms); integrasi pengiriman nyata adalah tanggung jawab backend |
| Integrasi sistem HRIS | UI halaman Sinkronisasi Data tersedia; logika sinkronisasi aktual adalah tanggung jawab backend |
| Integrasi penggajian atau kompensasi | Grade kinerja tidak otomatis terhubung ke sistem kompensasi manapun |
| Migrasi data siklus historis | Hanya tahun penilaian saat ini (2026) dalam cakupan |
| Lokalisasi multi-bahasa penuh | Bahasa Inggris untuk v1.0; toggle Bahasa Indonesia adalah stub |
| Drag-and-drop reorder menu | Ikon GripVertical tersedia di UI MenuManagement tetapi tidak ada logika drag yang diimplementasikan |
| Approval Management (`/hr/settings/approval-management`) | Halaman placeholder; logika konfigurasi rantai approver belum diimplementasikan |
| Pembuatan laporan lanjutan | Tidak ada laporan PDF atau dashboard yang dapat dikustomisasi |
| SSO / Integrasi direktori (LDAP/AD) | Autentikasi OTP sederhana; tidak ada SSO korporat |
