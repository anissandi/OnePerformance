# Rencana Implementasi Groupings & Aturan Khusus Role Director

## Tujuan & Ringkasan Aturan
Mengimplementasikan **Groupings** dan **Hierarchy Authority Level** khusus untuk Role **`Director`** beserta aturan modul KPI (Setting & Measurement 2 tab: Business & Personal), pengecualian dari Headcount/Kalibrasi, serta fungsi Approvals, Interviewer Management Interview, dan Calibration Approval sesuai Group Unit Usahanya:

1. **Groupings & Hierarchy Authority Level Khusus `Director` (`director_group`)**:
   - Menambahkan Group bawaan **`Direktur / Director`** pada Access Management (`/hr/settings/access-management` -> Tab **Group**) dan User Management (`/hr/settings/user-management` -> Tab **User Groupings**) dengan level kewenangan **`director_group`** (*Level Direktur Group — Melihat semua data, transaksi, dan proses pada seluruh Unit Usaha dalam Group, GM, Divisi, Departemen, Bagian, All Posisi*).
   - Mendefinisikan cakupan Group Unit Usaha:
     - **RSUP Group**: `PT RSUP (Industry)`, `PT RSUP (Perkebunan)`, `PT GHS`, `PT RSTM`, `ASD`
     - **Sambu Group**: `PT Pulau Sambu (Jakarta)`, `PT Pulau Sambu (Guntung)`, `PT Pulau Sambu (Kuala Enok)`
2. **Modul KPI Setting untuk Role `Director` (2 Tab: `KPI (Business)` & `KPI (Personal)`)**:
   - Saat pengguna dengan Role `Director` (atau Grouping `Direktur / Director`) membuka **Performance Appraisal Setting → KPI**, halaman menampilkan **2 tab**:
     - **`KPI (Business)`**: Format KPI Setting Business (seperti tab `KPI (Business)` dengan dukungan cascading & validasi).
     - **`KPI (Personal)`**: Format KPI Setting Personal (seperti yang digunakan pada Supervisor / Employee, yaitu `isPersonal={true}` & `hideCascading={true}`).
3. **Modul KPI Measurement untuk Role `Director` (2 Tab: `KPI (Business)` & `KPI (Personal)`)**:
   - Saat pengguna dengan Role `Director` (atau Grouping `Direktur / Director`) membuka **Performance Appraisal Measurement → KPI Tracking**, halaman menampilkan **2 tab**:
     - **`KPI (Business)`**: Format KPI Measurement Business (tracking realisasi bulanan untuk indikator KPI Business Group yang sudah Validated, termasuk nilai cascading dari KPI Unit).
     - **`KPI (Personal)`**: Format KPI Measurement Personal (tracking realisasi bulanan KPI Personal Direktur dengan format seperti pada Supervisor / Employee).
4. **Modul Default Role `Director` & Fleksibilitas melalui Groupings**:
   - Secara default, Grouping `Direktur / Director` (dan Role `Director`) hanya memiliki modul **`KPI (Setting/Measurement)`**.
   - Modul lainnya (`SMART Goals`, `Appraisals Form`, `Project Outside Job Scope`, `Managerial Skill`, `Inter-Departement Feedback`, `Management Interview`) secara default tidak aktif untuk penilaian pribadi Direktur, namun **dapat ditambahkan kapan saja melalui konfigurasi Groupings** (di Access Management -> Tab Group atau User Management -> Tab User Groupings).
5. **Pengecualian Role `Director` dari Penilaian Kinerja Reguler (Headcount, Grade Distribution, Calibration)**:
   - Karyawan dengan Role `Director` (atau Grouping `Direktur / Director`) tidak masuk dalam perhitungan penilaian kinerja reguler sehingga dikecualikan dari:
     - **Headcount (HC)** & kuota proporsi pada **Calibration Setting** (`/hr/calibration/setting`)
     - **Grade Distribution** (Bell Curve, Target vs Actual Proportion, dan tabel distribusi pada **Analytics Dashboard** & **Performance Appraisal Summary**)
     - **Calibration Adjustment** (`/hr/calibration/adjustment`, `/bod/calibration/adjustment`), **Calibration Verification** (`/hr/calibration/verification`), dan **Team Performance** (`/supervisor/calibration/team-performance`).
6. **Menu Approvals, Interviewer Management Interview, & Calibration Approval Sesuai Group Unit Usaha**:
   - Role `Director` memiliki menu **Approvals** untuk menyetujui modul-modul karyawan yang di-setup ke role tersebut (`KPI Business`, `Performance Appraisal Measurement`, `Performance Appraisal Setting`, `Inter-Department Feedback`, `Management Interview`, dan `Calibration`).
   - Role `Director` bertindak sebagai **Interviewer / Pemberi Nilai** di **Management Interview** (`Management Interview -> Assessment` & `Approvals -> Management Interview`).
   - Role `Director` bertindak sebagai **Calibration Approval** (`/bod/approvals/calibration`) sesuai dengan **Group Unit Usahanya** (5 unit untuk Direktur RSUP Group, atau 3 unit untuk Direktur Sambu Group).

---

## Rincian Implementasi per File

### 1. `src/app/pages/hr/settings/AccessManagement.tsx` & `src/app/store/authStore.ts`
- Menambahkan `"director_group"` pada `GroupAuthorityTier` (`"Level Direktur Group (Melihat semua Unit Usaha dalam Group, GM, Divisi, Departemen, Bagian, All Posisi)"`).
- Menambahkan `"Direktur / Director"` ke dalam `BUILTIN_GROUPS` dan `BUILTIN_GROUP_DEFAULTS` dengan:
  - `authorityLevel: "director_group"`
  - `allowedModules: ["KPI (Setting/Measurement)"]`
- Pada `DEFAULT_DIRECTOR` di `AccessManagement.tsx`:
  - Mengaktifkan `pa_setting: V`, `pa_setting_kpi: VCET`, `pa_measurement: V`, `pa_measurement_kpi: VCET`, `pa_measurement_rca: VCET`, `approvals: VA`, `approvals_kpi_business: VCEA`, `approvals_kpi_business_group: VCEA`, `approvals_kpi_business_unit: VA`, `approvals_pa_measurement: VA`, `approvals_pa_setting: VA`, `approvals_mgmt_interview: VA`, `approvals_calibration: VA`, `management_interview: V`, `mgmt_interview_assessment: VCEA`.
- Pada `src/app/store/authStore.ts`:
  - Mendefinisikan `SAMBU_GROUP_COMPANIES = ["PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)"] as const`.
  - Menambahkan helper `getGroupCompaniesForUnit(company: string): string[]` yang mengembalikan daftar unit dalam `RSUP_GROUP_COMPANIES` (5 unit) atau `SAMBU_GROUP_COMPANIES` (3 unit) sesuai unit asal pengguna.
  - Menambahkan helper `isExcludedFromAppraisalCalibration(user: { role?: string; groupings?: string }): boolean` yang bernilai `true` untuk Role `Director` / `BOD` atau Grouping `Direktur / Director`.
  - Memperbarui `getAuthorizedSubordinates(user)` dan `getScopedFilterOptionsForUser(user)` untuk `level === "director_group"` agar menggunakan `getGroupCompaniesForUnit(user.company)` (mendukung penuh RSUP Group maupun Sambu Group, mencakup GM, Divisi, Departemen, Bagian, dan seluruh Posisi).

### 2. `src/app/pages/supervisor/setting/KPISetting.tsx` (2 Tab KPI Setting untuk Director)
- Mendeteksi apabila pengguna aktif adalah Role `Director` atau memiliki Grouping `Direktur / Director` (`isDirectorMode`).
- Saat `isDirectorMode === true`, menampilkan tepat **2 tab KPI Setting**:
  1. **`KPI (Business)`** (`id: "corporate"`) — dengan format KPI Setting Business (`isCorporate={true}`, `isPersonal={false}`).
  2. **`KPI (Personal)`** (`id: "personal"`) — dengan format KPI Setting Personal (`isPersonal={true}`, `isCorporate={false}`, `hideCascading={true}`, `initialItems={PERSONAL_KPI}`).

### 3. `src/app/pages/employee/KPIPage.tsx` (2 Tab KPI Measurement untuk Director)
- Mendeteksi apabila pengguna aktif adalah Role `Director` atau memiliki Grouping `Direktur / Director` (`isDirectorMode`).
- Saat `isDirectorMode === true`, menampilkan **2 tab KPI Measurement** di bagian atas halaman `KPI Tracking`:
  1. **`KPI (Business)`** — menampilkan tabel KPI Measurement Business (indikator KPI Business Group beserta realisasi bulanan, achievement, dan informasi cascading dari KPI Unit).
  2. **`KPI (Personal)`** — menampilkan tabel KPI Measurement Personal (format KPI Tracking Personal seperti yang digunakan pada Supervisor / Employee).

### 4. Pengecualian Role `Director` dari Headcount, Grade Distribution, & Calibration
- Pada `src/app/data/mockEmployees.ts` (`getLiveTransactionalEmployees`), `src/app/pages/hr/CalibrationSetting.tsx`, `src/app/pages/hr/CalibrationAdjustment.tsx`, `src/app/pages/hr/YearEndVerification.tsx`, `src/app/pages/bod/CalibrationApproval.tsx`, dan `src/app/pages/hr/AnalyticsDashboard.tsx`:
  - Memfilter keluar pengguna yang memenuhi `isExcludedFromAppraisalCalibration(u)` (`role === "Director"` atau `role === "BOD"` atau `groupings === "Direktur / Director"`) dari perhitungan Headcount (HC), distribusi kuota grade, Bell Curve, tabel Summary/Calibration Adjustment, dan Year-End Verification.

### 5. Penyesuaian Scope Group Unit Usaha pada `/bod/*` & `BODCalibrationApproval` (`src/app/routes.tsx`, `src/app/pages/bod/CalibrationApproval.tsx`, `src/app/pages/bod/ManagementInterviewAssessment.tsx`, `src/app/components/Sidebar.tsx`)
- Pada `src/app/routes.tsx` dan `src/app/pages/bod/CalibrationApproval.tsx`:
  - Alih-alih mengunci statis hanya ke `RSUP Group`, menggunakan `getGroupCompaniesForUnit(activeUser.company)` ketika `activeUser.role === "Director"` (sehingga Direktur RSUP Group melihat 5 unit RSUP Group, dan Direktur Sambu Group melihat 3 unit Sambu Group; sedangkan `BOD` dapat melihat seluruh 8 unit usaha).
- Pada `src/app/components/Sidebar.tsx` (portal `bod`):
  - Memastikan sub-menu di bawah `Performance Appraisal Setting` dan `Performance Appraisal Measurement` untuk Role `Director` memfilter modul berdasarkan `allowedModules` dari Groupings-nya (secara default hanya muncul `KPI` & `RCA`, dan apabila ditambahkan modul lain melalui Groupings maka otomatis ikut muncul).

---

## Rencana Verifikasi
1. **Verifikasi Groupings & Hierarchy Authority `Director`**:
   - Cek Access Management -> Tab Group dan User Management -> Tab User Groupings memiliki group `Direktur / Director` dengan authority level `director_group` dan modul default `KPI (Setting/Measurement)`.
   - Pastikan Direktur di unit RSUP Group dapat melihat seluruh 5 unit RSUP Group, dan Direktur di unit Sambu Group dapat melihat seluruh 3 unit Sambu Group.
2. **Verifikasi 2 Tab pada KPI Setting & KPI Measurement untuk `Director`**:
   - Buka `Performance Appraisal Setting -> KPI` sebagai `Director` -> pastikan muncul 2 tab: `KPI (Business)` dan `KPI (Personal)` dengan masing-masing formatnya.
   - Buka `Performance Appraisal Measurement -> KPI Tracking` sebagai `Director` -> pastikan muncul 2 tab: `KPI (Business)` dan `KPI (Personal)` dengan masing-masing formatnya.
3. **Verifikasi Pengecualian dari Headcount & Kalibrasi**:
   - Pastikan akun dengan Role `Director` tidak dihitung dalam Headcount Calibration Setting, Grade Distribution, maupun Calibration Adjustment.
4. **Verifikasi Approvals, Management Interview, & Calibration Approval**:
   - Pastikan menu Approvals, Management Interview Assessment, dan Calibration Approval aktif dan terfilter sesuai Group unit usahanya.
5. **Verifikasi Build**:
   - Jalankan `pnpm build` untuk memastikan tidak ada error TypeScript atau bundle.
