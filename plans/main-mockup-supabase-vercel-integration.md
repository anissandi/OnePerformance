# Rencana Implementasi: Integrasi Alur Proses PA-Simulasi ke Mockup Utama dengan Backend Supabase Baru, GitHub CI/CD, & Vercel

## 1. Tujuan & Prinsip Utama
1. **Mempertahankan 100% Tampilan Visual & Fitur Mockup Utama**:
   - Seluruh desain visual, tata letak (*layout*), komponen tabel, drawer, kartu, serta menu/sub-menu/fitur lain yang tidak ada di PA-Simulasi (`Analytics Dashboard`, `KPI Business`, `Calibration Setting / Verification / Adjustment / Team Performance`, `Master KPI / Appraisal Form / Managerial Skill`, `Scores Setting`, `Cycle Management`, `PA Cycle History`, `Documents`, `Data Sync`, `Audit Trail`, `Management Override`, dll.) **tetap dipertahankan tanpa perubahan desain**.
2. **Login Menggunakan Tampilan `/login` Berdasarkan User Management, Access Management, Menu Management, & Unit Usaha**:
   - Halaman `/login` (`src/app/pages/LoginPage.tsx`) mempertahankan desain aslinya (`Company Unit` + `Employee ID` + `OTP Code`), dilengkapi kemudahan memilih/melihat daftar akun aktif per `Company Unit` dari **User Management**.
   - Saat user login di `/login`:
     - Sistem memverifikasi user terhadap data **User Management** (`employeeId`, `name`, `company` / `unitId`, `division`, `department`, `position`, `role`, `groupings`, `status: "Active"`).
     - Hak akses halaman dan visibilitas menu sidebar mengikuti konfigurasi **Access Management** (`view`, `create`, `edit`, `delete`, `approve`) dan **Menu Management** untuk `role` user tersebut (`Administrator`, `BOD`, `Director`, `HR Unit`, `HR ICF`, `Supervisor`, `Employee`), serta membatasi cakupan data sesuai **Company Unit (`Unit Usaha`)** user.
     - Kelayakan modul PA pribadi karyawan mengikuti **User Groupings Scores** pada **User Management** (`Operasional`, `Ka./Wa.Ka.Seksi`, `Ka./Wa.Ka.Bagian`, `Ka./Wa.Ka.Dept`, `Ka./Wa.Ka.Div ke atas`), termasuk peran ganda **HR Unit** sebagai peserta PA pada level `Ka./Wa.Ka.Bagian` sekaligus pemeriksa (*Checker*) bagi karyawan lain di unit usahanya (tanpa *self-check*).
     - User otomatis diarahkan ke portal yang sesuai (`/employee`, `/supervisor`, `/hr`, atau `/bod`), dan `Topbar` menampilkan identitas user yang sedang login, unit usaha, notifikasi *real-time*, serta tombol pindah akun / logout ke `/login`.
3. **Menerapkan & Menyelaraskan Seluruh Alur Proses PA-Simulasi ke Mockup Utama**:
   - Menghubungkan seluruh modul penilaian dan modul terkait di Mockup Utama agar berjalan secara *end-to-end* dan saling tersinkronisasi (*sync*).
4. **Backend Supabase Baru + Integrasi GitHub & Vercel**:
   - Menyediakan skema migrasi SQL Supabase baru yang bersih dan terpadu (`supabase/migrations/202611010001_pa_unified_backend.sql`), Edge Function API terpadu (`supabase/functions/server/`), konfigurasi environment variabel Vite (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), konfigurasi SPA Vercel (`vercel.json`), serta GitHub Actions CI/CD (`.github/workflows/supabase-vercel-ci.yml`) dan panduan deployment lengkap (`DEPLOYMENT.md`).

---

## 2. Desain Alur Login, Role, Group Akses, & Unit Usaha

### A. Autentikasi pada `/login` (`src/app/pages/LoginPage.tsx` & `src/app/store/authStore.ts`)
- **Input Login (Tetap Desain Asli `/login`)**:
  - **Company Unit**: memilih unit usaha (`PT RSUP (Industry)`, `PT RSUP (Perkebunan)`, `PT Pulau Sambu (Jakarta)`, `PT Pulau Sambu (Guntung)`, `PT Pulau Sambu (Kuala Enok)`, `PT RSTM`, `PT GHS`, `ASD`).
  - **Employee ID**: mengisi ID Karyawan (mis. `E001`, `E002`, `SIM-EMP-001`, dst. — dilengkapi *helper dropdown/autocomplete* daftar karyawan aktif pada unit usaha terpilih dari `UserManagement` agar mudah diuji lintas aktor).
  - **OTP Code**: mengirim dan memverifikasi kode OTP (mendukung kode OTP simulasi/demo maupun autentikasi sesi Supabase).
- **Pemetaan Role & Portal Tujuan**:
  - `Employee` (`Operasional`) → `/employee`
  - `Supervisor` (`Ka./Wa.Ka.Seksi`, `Ka./Wa.Ka.Bagian`, `Ka./Wa.Ka.Dept`, `Ka./Wa.Ka.Div ke atas`, `GM`) → `/supervisor`
  - `HR Unit`, `HR ICF`, `Administrator` (`HR Strategic`) → `/hr` *(dengan akses menu & filter unit usaha mengikuti role: `HR Unit` terkunci pada unit usahanya dan memiliki akses pengajuan PA pribadi; `HR ICF` & `Administrator` lintas unit sesuai kewenangan)*
  - `BOD`, `Director` → `/bod`
- **Sinkronisasi dengan `UserManagement`, `AccessManagement`, & `MenuManagement`**:
  - Perubahan pada tabel user, *User Groupings Scores* (`allowedModules`), matriks izin `AccessManagement`, dan visibilitas `MenuManagement` disimpan ke store terpadu + Supabase dan langsung memengaruhi:
    - Menu sidebar (`Sidebar.tsx`) yang tampil untuk role aktif.
    - Tab/modul yang muncul pada `My Performance Appraisal`, `Performance Appraisal Setting`, dan `Performance Appraisal Measurement`.
    - Bobot modul penilaian sesuai `Scores Setting` (`scoringWeightStore.ts`).

---

## 3. Sinkronisasi Alur Proses Modul PA di Mockup Utama

Seluruh tampilan halaman di Mockup Utama tetap menggunakan komponen UI yang sudah ada, namun datanya digerakkan oleh *workflow engine* PA-Simulasi:

1. **Module Activation (`/hr/modules` — `ModuleActivation.tsx`)**:
   - Pengaturan tanggal aktif (*Start Date*, *End Date*, *Date Lock per Month*, *Backlog Months*) per unit usaha dan modul tersimpan ke Supabase & disinkronkan ke seluruh halaman pengajuan/approval.
2. **KPI Setting (`/employee/setting/kpi`, `/supervisor/setting/kpi`, `/supervisor/appraisals/setting`, `/hr/approvals/setting`)**:
   - Validasi total bobot 100%, penyimpanan draft, dan alur berjenjang **Checker (HR Unit) → Approver 1 → Approver 2 (otomatis *mirror* A1+A2 untuk Kepala Divisi) → Validator (HR Strategic/Admin)**.
   - Permintaan revisi dari tahap mana pun mengembalikan status ke `Revision-*` dan saat di-submit ulang kembali ke tahap peminta revisi.
   - Tab `Pending` pada `Approvals` hanya menampilkan dokumen yang sedang menunggu tindakan (`Validated` berpindah ke `History`).
3. **KPI Tracking & Open Lock (`/employee/measurement/kpi-tracking`, `/supervisor/measurement/kpi-tracking`, `/hr/settings/open-lock`, `/hr/evidence/kpi-tracking`, `Approvals`)**:
   - Mengambil indikator dari KPI Setting yang sudah disetujui/tervalidasi.
   - Input realisasi bulanan, unggah bukti (`Evidence`), aturan penguncian tanggal bulanan (*Date Lock*), dan pengajuan **Open Lock** yang disinkronkan langsung dengan halaman `/hr/settings/open-lock` (termasuk notifikasi penolakan/persetujuan Open Lock).
   - Saat pencapaian KPI Tracking bulanan `< 100%` dan divalidasi, sistem otomatis membuat pemicu (*trigger*) untuk modul **RCA**.
4. **RCA — Root Cause Analysis (`/employee/measurement/rca`, `/supervisor/measurement/rca`, `/hr/evidence/rca`, `Approvals`)**:
   - Terhubung dengan indikator KPI `< 100%`, pengisian masalah utama, 3 level penyebab (*Why 1–3*), *Action Plan*, PIC, target tanggal, dan *evidence* bersifat *append-only* di setiap pembaruan progres.
   - Alur 2 siklus: persetujuan rencana perbaikan (`Approved`) lalu validasi tindak lanjut hingga seluruh rencana `Selesai`/`Dibatalkan` (`Closed`), yang otomatis memperbarui status perbaikan di KPI Tracking dan halaman `/hr/evidence/rca`.
5. **SMART Goals Setting & Measurement (`/employee/setting/smart-goals`, `/supervisor/setting/smart-goals`, `/employee/measurement/smart-goals`, `/supervisor/measurement/smart-goals`, `/hr/evidence/smart-goals`, `Approvals`)**:
   - Wajib minimal **3 SMART Goals** dengan 7 field lengkap dan minimal 1 *Action Plan* per goal.
   - Fase *Setting*: `Checker → Approver 1 → Approver 2 → Validator`.
   - Fase *Measurement*: update progres *Action Plan*, unggah bukti (`Evidence` tersinkron ke `/hr/evidence/smart-goals`), penilaian skor 1–5 oleh **Approver 1** dan **Approver 2** (dengan *mirror* A1+A2 pada level Divisi) di `ReviewDrawer`, dan nilai akhir `(Rata-rata A1 + Rata-rata A2) / 2 × Bobot Modul`.
6. **Appraisal Form (`/employee/measurement/appraisal-form`, `/supervisor/measurement/appraisal-form`, `ReviewDrawer`)**:
   - 20 kompetensi: Form A (12 item, bobot 60%), Form B (5 item, bobot 25%), Form C (3 item, bobot 15%) beserta modal indikator 1–5.
   - Alur: `Self-Assessment → Approver 1 → Approver 2` (mirror pada level Divisi).
   - Skor gabungan: `((Avg Self + Avg A1 + Avg A2) / 3)` dikalikan bobot Form A/B/C lalu dikalikan bobot modul sesuai level jabatan.
7. **Managerial Skill (`/supervisor/measurement/managerial-skill`, `ReviewDrawer`)**:
   - Hanya aktif untuk grup level `Ka./Wa.Ka.Bagian` ke atas (termasuk HR Unit).
   - 5 kompetensi kepemimpinan skala 1–5; alur `Self-Assessment → Approver 1 → Approver 2`; skor akhir `((Self + A1 + A2) / 3 / 5 × 100) × Bobot Modul`.
8. **Inter-Department Feedback (`/employee/measurement/inter-department-feedback`, `/supervisor/measurement/inter-department-feedback`, `/supervisor/approvals/measurement/inter-department-feedback`, `/hr/approvals/measurement/inter-department-feedback`)**:
   - Sesuai *Group Rules* (`Ka./Wa.Ka.Bagian` ke atas); nominasi tepat 3 rekan lintas departemen/unit (menolak diri sendiri & departemen/seksi yang sama); pengisian 5 indikator secara anonim; 15 field kesimpulan oleh penerima; pengisian tabel 6 kolom *Follow-Up* secara berurutan oleh Approver 1 lalu Approver 2; tanpa bobot nilai.
9. **Project Outside Job Scope (`/hr/monitoring/project`, `/employee/measurement/project-outside`, `/supervisor/measurement/project-outside`, `/supervisor/monitoring/project`, `/bod/monitoring/project`, `ReviewDrawer`)**:
   - Tidak ada section upload pada `/employee`, `/supervisor`, dan `/bod`.
   - HR ICF / HR Unit Usaha mengunduh template (`Download Template Excel`) dan mengunggah file Excel sistem eksternal melalui `/hr/monitoring/project` (tanpa kolom `Project Score`, `Team Bobot`, `Project Bobot`).
   - Saat diunggah oleh HR, proyek masing-masing karyawan otomatis masuk ke proses **Approval Level 1 & Level 2** (`SupervisorApprovals` → `HRApprovals` / `ReviewDrawer`), dan nilai modul dihitung dari **`Final Score` tertinggi** × bobot modul.
10. **Management Interview (`/hr/calibration/management-interview`, `/bod/management-interview/assessment`, `/supervisor/monitoring/management-interview`, `/hr/monitoring/management-interview`, `MyPerformanceAppraisal`)**:
    - Khusus untuk grup level **`Ka./Wa.Ka.Div ke atas` (`divisi`)** (bobot 10%).
    - HR membuat jadwal interview pada `/hr/calibration/management-interview` (tersinkron ke `/hr/evidence/management-interview` & monitoring).
    - Penilai (Direktur pada grup RSUP / GM pada grup SAMBU) memberikan skor 1–5 pada 3 aspek (*Kewajaran Hasil Kinerja*, *Justifikasi & Evidence*, *Improvement & Follow Up*), memilih rekomendasi, dan mengisi catatan manajemen.
    - Nilai rata-rata para Penilai otomatis terhitung dan tampil di tab `Management Interview` pada `My Performance Appraisal`, `Management Interview Monitoring`, serta `Performance Appraisal Summary`.
11. **Sinkronisasi ke `My Performance Appraisal`, `Monitoring`, `Summary`, `Calibration`, & `Audit Trail`**:
    - Setiap perubahan status atau skor pada ke-8 modul di atas langsung memperbarui:
      - Kartu skor & tabel pada `/employee/appraisal` dan `/supervisor/appraisal`.
      - Tabel monitoring pada `/hr/monitoring/*`, `/supervisor/monitoring/*`, dan `/bod/monitoring/*`.
      - Nilai akhir & grade pada `/hr/summary`, `/supervisor/summary`, `/bod/summary`, serta halaman `Calibration` (`/hr/calibration/*`, `/supervisor/calibration/*`, `/bod/calibration/*`).
      - Log aktivitas pada `/hr/settings/audit-trail`.

---

## 4. Arsitektur Backend Supabase Baru & Integrasi GitHub + Vercel

### A. Konfigurasi Client Supabase Berbasis Environment Variable (`src/app/services/supabaseClient.ts` & `utils/supabase/info.tsx`)
- Membaca konfigurasi dari environment variable standar Vite/Vercel:
  - `VITE_SUPABASE_URL` (atau konstruksi dari `VITE_SUPABASE_PROJECT_ID`)
  - `VITE_SUPABASE_ANON_KEY`
  - Tetap memiliki fallback aman agar aplikasi tidak crash saat dijalankan di preview lokal maupun di Vercel.
- Menyediakan layer sinkronisasi `paSyncService.ts` yang menghubungkan store di Mockup Utama dengan endpoint Supabase Edge Function & tabel PostgreSQL secara *real-time* (dengan *optimistic local state* + *remote persistence*).

### B. Skema Database Supabase Baru yang Terkonsolidasi (`supabase/migrations/202611010001_pa_unified_backend.sql`)
- Dirancang **100% idempotent** (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO UPDATE`) sehingga aman dijalankan pada project Supabase baru dari nol maupun melalui CI/CD:
  1. `public.pa_users` — Data lengkap user (sinkron dengan User Management & 91 identitas organisasi lintas 8 Company Unit).
  2. `public.pa_group_rules` — Aturan grup jabatan & `allowed_modules` per Company Unit.
  3. `public.pa_role_permissions` & `public.pa_menu_configs` — Matriks hak akses Access Management & visibilitas Menu Management.
  4. `public.pa_score_weights` & `public.pa_approval_configs` — Konfigurasi bobot modul & struktur approval per unit/level.
  5. `public.pa_module_windows` — Jadwal aktif (*Module Activation*) per unit usaha & modul.
  6. `public.pa_workflow_documents` & `public.pa_workflow_events` — Penyimpanan dokumen & riwayat versi terpadu untuk seluruh modul PA (KPI Setting, KPI Tracking, RCA, SMART Goals, Appraisal Form, Managerial Skill, Inter-Department Feedback, Project Outside Job Scope, Management Interview).
  7. `public.pa_open_lock_requests` — Permintaan & keputusan Open Lock.
  8. `public.pa_interview_schedules` — Jadwal Management Interview yang dibuat oleh HR.
  9. `public.pa_audit_trail` & `public.pa_notifications` — Audit trail sistem & notifikasi *in-app*.
  10. Storage Bucket `pa-evidence` — Penyimpanan file bukti KPI Tracking, RCA, SMART Goals, dan Management Interview.

### C. Integrasi Deployment GitHub & Vercel
1. **`vercel.json`**:
   - Konfigurasi build Vite (`pnpm build`, output `dist`) dan *SPA fallback rewrite* (`{ "source": "/(.*)", "destination": "/index.html" }`) agar seluruh route seperti `/login`, `/employee/*`, `/supervisor/*`, `/hr/*`, `/bod/*` tidak menghasilkan 404 saat di-refresh di Vercel.
2. **`.env.example`**:
   - Template environment variables untuk dipasang di **Vercel Project Settings → Environment Variables** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID`).
3. **`.github/workflows/deploy-supabase.yml`**:
   - GitHub Actions workflow otomatis yang:
     - Menjalankan unit test dan validasi build (`pnpm build`) pada setiap Push / Pull Request.
     - Saat push ke branch `main`, otomatis menjalankan `supabase db push` dan `supabase functions deploy` ke project Supabase baru menggunakan GitHub Secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`).
4. **`DEPLOYMENT.md`**:
   - Panduan langkah demi langkah membuat project Supabase baru, menghubungkan repository GitHub ke Supabase & Vercel, serta mengatur Environment Variables & GitHub Secrets.

---

## 5. Strategi Verifikasi & Pengujian
1. **Unit & Workflow Tests**:
   - Memastikan seluruh unit test workflow (`kpi`, `smartGoals`, `appraisalForm`, `managerialSkill`, `interDepartmentFeedback`, `project`, `managementInterview`, `rca`, `feedbackEligibility`, `trackingOpenLockNotices`) ditambah pengujian pemetaan Login/Role/Unit Usaha lulus 100%.
2. **Build & Bundle Check**:
   - Menjalankan `pnpm build` dan `git diff --check` untuk memastikan tidak ada error kompilasi TypeScript maupun masalah konfigurasi Vercel/Vite.
