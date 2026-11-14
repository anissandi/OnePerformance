# Rencana Penyelarasan Status & Skor YTD KPI Tracking di Verification, Monitoring, Analytics, Summary, dan Calibration Adjustment

## 1. Tujuan & Aturan Bisnis yang Disepakati

Menghilangkan ketidaksinkronan status dan nilai KPI antar modul ketika pengisian **KPI Tracking** karyawan masih berjalan sebagian bulan (`< 12 bulan`) atau belum divalidasi penuh oleh HR ICF, dengan aturan terpadu berikut:

1. **Syarat Selesai Penuh KPI Tracking (`Full-Year Validated`)**:
   - KPI Tracking baru dianggap **komplit / selesai penuh** apabila:
     1. **Seluruh 12 bulan (`Jan-26` s/d `Dec-26`) telah terisi nilai realisasi aktualnya**, **DAN**
     2. **Workflow `KPI` fase `measurement` telah berstatus `Validated` oleh HR ICF** (`decisions.validator?.status === "Validated"`).
2. **Status pada `/monitoring/kpi` (HR & Supervisor)**:
   - **Kolom `KPI Measurement Status`**:
     - `Unsubmitted`: belum ada bulan tracking yang diisi dan belum pernah disubmit.
     - `Revision`: pengajuan KPI Tracking dikembalikan untuk revisi oleh Checker / Approver / Validator.
     - **`Tracking Progress`**: sudah ada progres pengisian bulan realisasi atau sudah disubmit/divalidasi untuk sebagian bulan berjalan, **tetapi belum genap 12 bulan (`< 12 bulan`)** (ditampilkan dengan badge `Tracking Progress`, dilengkapi info jumlah bulan misalnya `x/12 bln` pada tooltip/sub-info).
     - `Pending-Check` / `Pending-Approver 1` / `Pending-Approver 2` / `Pending-Validate`: seluruh 12 bulan (`Jan–Des`) sudah lengkap disubmit dan sedang dalam antrean approval akhir tahun menuju validasi HR ICF.
     - **`Validated`**: seluruh 12 bulan (`Jan–Des`) sudah lengkap **dan** telah divalidasi oleh HR ICF.
3. **Status pada `/calibration/verification` (`YearEndVerification.tsx`)**:
   - Kolom **KPI** hanya menampilkan **centang hijau (`complete`)** apabila KPI Tracking karyawan sudah **lengkap 12 bulan (`Jan–Des`) + `Validated` HR ICF** (serta untuk modul 4-tahap lainnya seperti `SMART Goals` wajib `decisions.validator?.status === "Validated"`).
   - Selama bulan tracking `< 12 bulan` (meskipun sebagian bulan sudah divalidasi) atau masih menunggu validasi HR ICF, kolom KPI menampilkan ikon **jam kuning (`pending` — belum centang hijau)**, sehingga status baris karyawan menjadi `Pending` (bukan `Complete`).
   - Jika belum ada aktivitas KPI Tracking sama sekali (`0 bulan` dan belum ada pengajuan measurement), kolom KPI berstatus **silang merah (`incomplete`)**.
4. **Status pada `Analytics Dashboard` (`AnalyticsDashboard.tsx`)**:
   - **Baris / Filter `KPI (Tracking)`**:
     - Hanya dihitung **`Completed`** apabila **12 bulan komplit + `Validated` HR ICF**.
     - Jika baru sebagian bulan (`< 12 bulan`, baik masih draft terisi maupun sudah divalidasi sebagian bulan) atau masih dalam antrean approval, dihitung sebagai **`In Progress`**.
     - Untuk modul 4-tahap lainnya (`KPI (Setting)`, `SMART Goals (Setting)`, `SMART Goals (Tracking)`), status `Completed` juga wajib mengecek `decisions.validator?.status === "Validated"`.
   - **Kartu `Completed Appraisals` (mode `All Modules`)**:
     - Karyawan hanya masuk hitungan **`Completed Appraisals`** apabila **seluruh modul Measurement wajib** sesuai `resolveUserAllowedModules(user)` (meliputi `KPI Tracking` 12 bulan + `Validated`, `SMART Goals Measurement` `Validated`, `Appraisal Form` `Approved`, `Project OJS` `Approved`, serta `Managerial Skill` `Approved` bila di-allow) telah selesai penuh.
     - Karyawan yang baru menyelesaikan tahap `Setting` atau baru mengisi sebagian bulan `KPI Tracking` masuk ke **`In Progress`**, bukan `Completed Appraisals`.
5. **Tampilan Skor Berjalan (`YTD`) & Gate Validasi di `/summary` dan `/calibration/adjustment`**:
   - **Perhitungan Skor KPI Lintas Karyawan**:
     - Membuka pembacaan snapshot KPI Tracking per karyawan (`loadKPITracking(employeeId)`) beserta hidrasi tabel Supabase `pa_kpi_trackings` agar nilai realisasi KPI setiap karyawan terbaca oleh semua role berwenang (HR ICF, Administrator, Supervisor, GM, Director, BOD), tidak lagi terbatas pada `if (isSelf)`.
   - **Di `/summary` (`PerformanceAppraisalSummary.tsx`)**:
     - Jika karyawan sudah memiliki nilai realisasi berjalan (`kpiScore > 0`), tampilkan angka `%` dan grade-nya.
     - Jika statusnya belum *Full-Year Validated* (`< 12 bulan` atau belum `Validated` HR ICF), tampilkan **tag kecil `YTD`** mendampingi nilai KPI (contoh: `85%` + Grade + pill kecil `YTD`).
     - Jika belum ada nilai realisasi sama sekali (`kpiScore === 0`) namun `KPI Setting` sudah `Validated`, tetap tampilkan badge hijau lembut `Setting`.
     - Begitu 12 bulan lengkap dan `Validated` HR ICF, tag `YTD` otomatis hilang dan menampilkan nilai final KPI.
   - **Di `/calibration/adjustment` (`CalibrationAdjustment.tsx` & tampilan cerminan di `supervisor/Calibration.tsx` / `bod/CalibrationApproval.tsx`)**:
     - Tampilkan nilai berjalan KPI (`%`) pada kolom KPI dan kartu detail karyawan disertai **tag kecil `YTD`** apabila KPI karyawan tersebut belum berstatus *Full-Year Validated* (12 bulan + `Validated` HR ICF).
     - **Gate Pemrosesan Kalibrasi (`perlu Validated untuk dapat diproses di Calibration`)**:
       - Baris karyawan yang KPI-nya (atau modul wajibnya) belum berstatus **`Validated` penuh (12 bulan + Validated HR ICF)** dikunci dari penyesuaian nilai akhir (`±` tombol adjustment pada baris tersebut dinonaktifkan dengan keterangan *"Menunggu KPI Full-Year Validated"*), kecuali karyawan ditandai *Inactive / Ignored* di Verification.
       - Tombol **`Submit`** Calibration Adjustment untuk unit usaha hanya dapat diproses/dikirim apabila seluruh karyawan aktif yang dikalibrasi pada unit tersebut sudah berstatus **Validated** penuh (dengan banner informasi jelas apabila masih ada karyawan berstatus `YTD / Belum Validated`).

---

## 2. Arsitektur Data & Antarmuka Baru

### A. Helper Evaluasi Kelengkapan KPI Tracking per Karyawan (`src/app/pages/employee/KPIPage.tsx`)
Memperluas API penyimpanan/pembacaan KPI Tracking agar mendukung parameter `employeeId`:

```ts
export const FULL_YEAR_KPI_MONTHS = [
  "Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26",
  "Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26",
] as const;

export interface EmployeeKPITrackingEvaluation {
  months: MonthEntry[];
  cellsMap: Record<string, Record<string, string>>;
  trackedMonthsCount: number;       // Jumlah bulan unik (0..12) yang sudah memiliki input aktual
  isFullYearMonthsComplete: boolean; // trackedMonthsCount >= 12 (Jan-26..Dec-26 lengkap)
  ytdScore: number;                 // Skor pencapaian tertimbang (0..100) dari bulan yang sudah diisi
  hasAnyTrackingData: boolean;      // trackedMonthsCount > 0
}

export function loadKPITrackingForEmployee(employeeId?: string): KPITrackingSnapshot;
export function evaluateEmployeeKPITracking(employeeId: string): EmployeeKPITrackingEvaluation;
```

- **Cara menghitung `trackedMonthsCount`**:
  - Memeriksa `months` pada snapshot `kpi_tracking_v1_${normalizeEmployeeId(employeeId)}` (tanpa fallback ke key global milik user lain agar data antar karyawan 100% terisolasi).
  - Sebuah bulan (`Jan-26` .. `Dec-26`) dihitung terisi apabila memiliki minimal satu sel input aktual non-target yang terisi nilai valid pada `cellsMap[month.id]`.
  - Menghitung `ytdScore` menggunakan item KPI milik karyawan (dari `pa_kpi_setting_by_emp_v2[normId]` jika tersedia, atau definisi `KPI_ITEMS`) melalui `computeKPIAchievement`.

### B. Hidrasi Backend Supabase untuk `pa_kpi_trackings` (`src/app/services/supabaseClient.ts`)
- Pada `fetchBootstrapFromSupabase()`: menambahkan `restSelect("pa_kpi_trackings", "select=*&order=updated_at.desc")`.
- Pada `hydrateAllStoresFromSupabase()`: memetakan setiap baris `pa_kpi_trackings` (`employee_id`, `months`, `cells_map`) ke key `kpi_tracking_v1_${normalizeEmployeeId(employee_id)}` sehingga HR ICF, Admin, dan Supervisor di perangkat/browser mana pun langsung mendapatkan data bulan tracking & skor YTD setiap karyawan dari database backend.

### C. Perluasan Model `Employee` Transaksional (`src/app/data/mockEmployees.ts`)
- Menambahkan properti metadata status KPI & validasi kalibrasi pada interface `Employee`:
  ```ts
  kpiIsYtd?: boolean;
  kpiTrackedMonths?: number;
  kpiFullyValidated?: boolean;
  isCalibrationReady?: boolean; // true jika seluruh modul wajib karyawan sudah Validated / Approved penuh
  ```
- Di `getLiveTransactionalEmployees()`:
  - Memanggil `evaluateEmployeeKPITracking(u.employeeId)` untuk **semua karyawan** (menghapus batasan `if (isSelf)`).
  - Menentukan `wfKpiMeas` (`module === "KPI" && phase === "measurement"`):
    - `kpiMeasValidated = wfKpiMeas?.decisions.validator?.status === "Validated"`
    - `kpiFullyValidated = evalKpi.isFullYearMonthsComplete && kpiMeasValidated`
    - `kpiScore = evalKpi.ytdScore > 0 ? Math.round(evalKpi.ytdScore) : extractAssessmentScore("KPI")`
    - `kpiIsYtd = kpiScore > 0 && !kpiFullyValidated`
  - Menentukan `isCalibrationReady`:
    - Mengecek seluruh modul pada `resolveUserAllowedModules(u)`:
      - Jika punya `KPI`: wajib `kpiFullyValidated === true`
      - Jika punya `SMART Goals`: wajib `SMART Goals (measurement)` berstatus `Validated`
      - Jika punya `Appraisals Form`: wajib `Appraisal Form (measurement)` berstatus `Approved` / `Assessed-Approver 2`
      - Jika punya `Project Outside Job Scope`: wajib `Project (measurement)` berstatus `Approved` / `Assessed-Approver 2`
      - Jika punya `Managerial Skill`: wajib `Managerial Skill (measurement)` berstatus `Approved` / `Assessed-Approver 2`

---

## 3. Rincian Perubahan per Halaman

### 1. `/monitoring/kpi` (`src/app/pages/hr/monitoring/KPIMonitoring.tsx` & `src/app/pages/supervisor/monitoring/KPIMonitoring.tsx`)
- Menambahkan status **`"Tracking Progress"`** ke tipe `KPIWorkflowStatus`, opsi dropdown filter status, dan peta warna badge (`bg-sky-100 text-sky-700`, ikon `Clock`).
- Memperbarui fungsi penentu `KPI Measurement Status` (`resolveKpiMeasurementStatus(empId, wfMeas)`):
  1. Jika `wfMeas` memiliki status `Revision` di tahap mana pun -> **`Revision`**.
  2. Evaluasi `evalKpi = evaluateEmployeeKPITracking(empId)`:
     - Jika `!wfMeas && !evalKpi.hasAnyTrackingData` -> **`Unsubmitted`**.
     - Jika `!evalKpi.isFullYearMonthsComplete` (`trackedMonthsCount < 12`, baik karyawan sedang mengisi bulan berjalan maupun sebagian bulan sudah pernah disubmit/divalidasi) -> **`Tracking Progress`**.
     - Jika `evalKpi.isFullYearMonthsComplete` (`12/12 bulan` lengkap):
       - Jika `!wfMeas` -> **`Tracking Progress`** (sudah isi 12 bulan tapi belum klik Submit).
       - Jika `validator === "Validated"` -> **`Validated`**.
       - Jika `approver2` selesai -> **`Pending-Validate`**.
       - Jika `approver1` selesai -> **`Pending-Approver 2`**.
       - Jika `checker` selesai -> **`Pending-Approver 1`**.
       - Selain itu -> **`Pending-Check`**.
- Memperbarui kolom `Total KPI`, `Submitted`, dan `Avg. Achievement` agar membaca jumlah KPI aktual karyawan, progres bulan (`trackedMonthsCount/12 bln`), serta `evalKpi.ytdScore`.

### 2. `/calibration/verification` (`src/app/pages/hr/YearEndVerification.tsx`)
- Memperbarui evaluasi status per modul di `currentEmployees`:
  - **Kolom `KPI`**:
    - Membaca `evalKpi = evaluateEmployeeKPITracking(employee.id)` dan `wfKpiMeas` (`module === "KPI" && phase === "measurement"`).
    - `complete` (centang hijau): **hanya** jika `evalKpi.isFullYearMonthsComplete && wfKpiMeas?.decisions.validator?.status === "Validated"`.
    - `pending` (jam kuning): jika `evalKpi.hasAnyTrackingData || Boolean(wfKpiMeas) || Boolean(wfKpiSet)` (sedang berjalan / `< 12 bulan` / belum divalidasi HR ICF).
    - `incomplete` (silang merah): jika belum ada Setting maupun Tracking sama sekali.
  - **Kolom `SMART Goals`**:
    - `complete` hanya jika `wfSgMeas?.decisions.validator?.status === "Validated"`.
    - `pending` jika baru ada `SMART Goals Setting` atau `SMART Goals Measurement` sedang berjalan.

### 3. `Analytics Dashboard` (`src/app/pages/hr/AnalyticsDashboard.tsx`)
- Pada `computeModuleStatsForUsers`:
  - Untuk `"KPI (Tracking)"`:
    - `completed++` hanya jika `evalKpi.isFullYearMonthsComplete && rec?.decisions.validator?.status === "Validated"`.
    - `inProgress++` jika `rec` ada atau `evalKpi.hasAnyTrackingData` namun belum mencapai syarat `completed`.
    - `pending++` jika belum ada aktivitas sama sekali.
  - Untuk modul 4-tahap lainnya (`"KPI (Setting)"`, `"SMART Goals (Setting)"`, `"SMART Goals (Tracking)"`):
    - `completed++` wajib `rec?.decisions.validator?.status === "Validated"`.
- Pada perhitungan kartu ringkasan atas saat filter `module === "All Modules"`:
  - Mengecek kelengkapan seluruh modul wajib pada `resolveUserAllowedModules(u)` (menggunakan aturan yang sama dengan `YearEndVerification`):
    - Jika **semua** modul wajib karyawan sudah `completed` -> `completed++` (`Completed Appraisals`).
    - Jika minimal ada 1 modul (Setting atau Measurement/Tracking) yang sudah dimulai -> `inProgress++` (`In Progress`).
    - Jika belum ada aktivitas sama sekali -> `pending++` (`Not Started / Pending`).

### 4. `/summary` (`src/app/pages/shared/PerformanceAppraisalSummary.tsx`)
- Memperbarui `ModuleCell` untuk menerima prop opsional `isYtd?: boolean`:
  - Ketika `data.score > 0`:
    - Menampilkan `{data.score}%` dan badge `{data.grade}`.
    - Jika `isYtd === true`, menampilkan badge kecil **`YTD`** (`bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-1.5 py-0.2 rounded`) tepat di samping/bawah nilai agar jelas bahwa skor tersebut adalah realisasi berjalan (*Year-to-Date*).
  - Pada modal detail karyawan (`EmployeeDetailModal` di dalam `PerformanceAppraisalSummary.tsx`), menampilkan label `YTD` yang sama pada baris modul KPI apabila `emp.kpiIsYtd` bernilai `true`.

### 5. `/calibration/adjustment` (`src/app/pages/hr/CalibrationAdjustment.tsx`, `src/app/pages/supervisor/Calibration.tsx`, `src/app/pages/bod/CalibrationApproval.tsx`)
- Menyertakan `kpiIsYtd`, `kpiFullyValidated`, dan `isCalibrationReady` dari `getLiveTransactionalEmployees()` ke objek karyawan kalibrasi.
- **Tampilan Nilai KPI + Tag Kecil `YTD`**:
  - Pada sel tabel kolom **KPI** (`CalibrationAdjustment.tsx`, `supervisor/Calibration.tsx`, `bod/CalibrationApproval.tsx`) dan pada rincian komponen skor di `AppraisalDetailCard`:
    - Menampilkan `{emp.base.kpi}%` disertai badge kecil **`YTD`** (`px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold`) apabila `emp.kpiIsYtd` bernilai `true` (atau badge `Unsubmitted` abu-abu lembut bila `emp.base.kpi === 0` & `!emp.kpiFullyValidated`).
- **Validasi Pemrosesan Kalibrasi (`perlu Validated untuk dapat diproses di Calibration`)**:
  - Pada mode `editMode` di tabel `CalibrationAdjustment.tsx`:
    - Untuk karyawan yang `!emp.isCalibrationReady` (mis. KPI masih `YTD` / `< 12 bulan` atau belum `Validated` HR ICF, dan karyawan tidak berstatus *Inactive/Ignored* di Verification): tombol penyesuaian `−` / `+` pada kolom `Nilai Akhir` dinonaktifkan (`disabled`) dengan indikator kecil `Belum Validated` dan tooltip penjelas.
  - Pada aksi **`Submit`** Calibration Adjustment unit usaha:
    - Menambahkan pengecekan `unvalidatedEmployees` pada unit aktif (mengabaikan karyawan yang di-*Inactive* atau di-*Ignore* pada `loadYearEndState()`).
    - Jika masih terdapat karyawan aktif yang belum *Validated* penuh (`unvalidatedEmployees.length > 0`), tampilkan banner peringatan informatif di atas panel Calibration Adjustment (*"Terdapat {N} karyawan dengan status KPI masih YTD / modul belum Validated penuh. Seluruh modul wajib berstatus Validated sebelum Calibration Adjustment dapat disubmit."*) dan nonaktifkan tombol `Submit` hingga tervalidasi penuh (atau ditangani di Verification).

---

## 4. Edge Cases & Penanganan Risiko
- **Isolasi Data Antar Karyawan**: Menghapus fallback ke key global `kpi_tracking_v1` tanpa suffix `employeeId` ketika memuat data karyawan lain agar nilai tracking karyawan A tidak pernah bocor ke karyawan B. Untuk kompatibilitas mundur satu kali bagi akun aktif yang sebelumnya menyimpan di `kpi_tracking_v1`, migrasi hanya dilakukan jika `employeeId` cocok dengan pemilik sesi aktif.
- **Karyawan Tanpa Modul KPI di User Groupings**: Jika pada setup *User Groupings* suatu posisi tidak di-allow modul `KPI (Setting/Measurement)`, maka karyawan tersebut otomatis dianggap `na` pada kolom KPI di Verification dan tidak memblokir kesiapan kalibrasi (`isCalibrationReady`).
- **Sinkronisasi Real-Time Antar Tab/Role**: Seluruh halaman mendengarkan event `pa-db-hydrated`, `appraisal-updated`, `pa-auth-updated`, dan `storage` sehingga perubahan bulan tracking atau validasi HR ICF langsung tercermin tanpa reload manual.

---

## 5. Strategi Verifikasi
1. Menjalankan `npm run build` (`vite build --config vite.figma.config.ts`) untuk memastikan seluruh tipe TypeScript, impor lintas modul, dan bundle produksi bersih tanpa error.
2. Memverifikasi alur status pada 3 skenario data KPI karyawan:
   - **Skenario 1 (Baru KPI Setting Validated, 0 bulan Tracking)**:
     - `/monitoring/kpi`: Setting = `Validated`, Measurement = `Unsubmitted`
     - `/calibration/verification`: KPI = `pending` (jam kuning)
     - `Analytics Dashboard`: `In Progress` (bukan `Completed Appraisals`)
     - `/summary`: badge `Setting`
     - `/calibration/adjustment`: KPI `0%`, terkunci dari proses submit kalibrasi.
   - **Skenario 2 (KPI Tracking terisi 2 bulan, mis. Jan–Feb, sebagian sudah disubmit/divalidasi)**:
     - `/monitoring/kpi`: Measurement = `Tracking Progress`
     - `/calibration/verification`: KPI = `pending` (jam kuning, belum centang hijau)
     - `Analytics Dashboard`: `KPI Tracking` & `All Modules` = `In Progress`
     - `/summary` & `/calibration/adjustment`: nilai berjalan muncul dengan tag kecil **`YTD`**, dan pemrosesan kalibrasi tetap terkunci menunggu *Full-Year Validated*.
   - **Skenario 3 (KPI Tracking lengkap 12 bulan Jan–Des + Validated HR ICF)**:
     - `/monitoring/kpi`: Measurement = `Validated`
     - `/calibration/verification`: KPI = `complete` (centang hijau)
     - `Analytics Dashboard`: `KPI Tracking` = `Completed` (dan masuk `Completed Appraisals` bila modul wajib lain juga selesai)
     - `/summary` & `/calibration/adjustment`: tag `YTD` hilang, menampilkan skor final `%`, dan karyawan siap diproses/disubmit pada Calibration Adjustment.
