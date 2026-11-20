# Business Requirements Document (BRD)
## One Performance System — Performance Appraisal (PA) Sambu Group & RSUP Group

| Kolom | Nilai |
|---|---|
| Versi Dokumen | 1.0 (Baseline Live Production) |
| Status | Final untuk Rebuild & Go-Live |
| Tanggal | 20 November 2026 |
| Periode Penilaian Acuan | Siklus PA 2026 (Setting Jan 2026 → Final Score & Kalibrasi Jan 2027) |
| Repositori Sumber | GitHub `anissandi/OnePerformance` (sumber kebenaran kode) |
| Backend Sumber | Supabase (PostgreSQL + PostgREST + Storage `pa-evidence` + Edge Function `make-server-74dadec6`) |
| Hosting Frontend | Vercel (SPA Vite + Serverless `/api/pa-sync`) |
| Dokumen Terkait | `PRD_ID.md` v3.0 · `FRD_ID.md` v3.0 · `AGENTS.md` (Aturan Proses End-to-End) · `guidelines/Guidelines.md` |

---

## 0. Cara Membaca Rangkaian Dokumen (WAJIB untuk Model/Tim Rebuild)

Tiga dokumen ini adalah **satu kesatuan** dan wajib dibaca berurutan:

| Urutan | Dokumen | Menjawab Pertanyaan | Kode ID |
|---|---|---|---|
| 1 | **BRD_ID.md** (dokumen ini) | *Mengapa* sistem dibangun, *siapa* pemangku kepentingan, *aturan bisnis* apa yang tidak boleh dilanggar | `BO-xx` (Business Objective), `BR-xxx` (Business Rule) |
| 2 | **PRD_ID.md** | *Apa* produk yang dibangun: peran, portal, modul, fitur, alur pengguna, model skor, rencana rilis | `PR-xxx` |
| 3 | **FRD_ID.md** | *Bagaimana* tepatnya sistem berperilaku: algoritma, formula, state machine, skema DB, kunci state, API, validasi, kriteria uji | `FR-<MODUL>-xxx` |

**Aturan keterlacakan:** setiap `PR-xxx` merujuk ≥1 `BR-xxx`; setiap `FR-xxx` merujuk ≥1 `PR-xxx`.

**Prioritas bila terjadi konflik:**
1. Aturan Bisnis di BRD (`BR-xxx`) — tidak boleh dilanggar.
2. Spesifikasi di FRD — menggambarkan **perilaku eksisting** kode yang wajib direplikasi.
3. Deskripsi produk di PRD.

**Label penting di FRD:**
- **[EKSISTING]** — perilaku kode saat ini; rebuild **wajib** mereplikasi persis (formula, urutan status, teks pesan bila disebut).
- **[GAP-PROD]** — kekurangan sistem saat ini yang **wajib diperbaiki** sebelum Live Production (keamanan, integritas data, hardcode demo).
- **[DEMO]** — fitur khusus uji coba/trial; dipertahankan hanya bila disebut dan wajib dibatasi untuk Administrator.

---

## 1. Ringkasan Eksekutif

**One Performance System** adalah aplikasi web internal Sambu Group yang mendigitalkan seluruh siklus Performance Appraisal (PA) tahunan secara *end-to-end*: penyusunan target (KPI Business, KPI Individu, SMART Goals, Project Outside Job Scope), pengukuran berkala (KPI Tracking bulanan, Root Cause Analysis, SMART Goals Measurement), penilaian kompetensi (Appraisal Form, Managerial Skill, Inter-Department Feedback), wawancara manajemen (Management Interview), hingga kalibrasi distribusi grade (Calibration SOY & EOY) dan pelaporan nilai akhir.

Sistem menggantikan proses manual berbasis spreadsheet & email di 8 Unit Usaha yang tergabung dalam 2 Group (**RSUP Group** dan **Sambu Group**), dengan:
- Rantai persetujuan berjenjang berbasis data karyawan (`Reg No AP1` & `Reg No AP2`) ditambah tahap khusus **Check (HR Unit)** dan **Validate (HR ICF)**.
- Kewenangan akses data berjenjang otomatis berdasarkan **Role + User Groupings**, bukan nama jabatan.
- Jadwal setiap modul dikendalikan terpusat melalui **Module Activation**.
- Kalibrasi grade berbasis kuota proporsi per Unit Usaha, Divisi, Departemen, dan Bagian.

Status saat dokumen ini dibuat: sistem telah dibangun sebagai **prototipe fungsional penuh** di Figma Make, terintegrasi ke GitHub, Vercel, dan Supabase, dan sedang dalam tahap uji coba (*trial end-to-end*). Dokumen ini menjadi acuan untuk **membangun ulang (rebuild) sistem menjadi versi Live Production** menggunakan VS Code + model AI, tanpa k
