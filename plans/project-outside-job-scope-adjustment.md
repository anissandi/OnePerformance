# Rencana Penyesuaian Alur: Project Outside Job Scope (Upload Excel Sistem Eksternal oleh HR ICF / HR Unit Usaha)

## 1. Konteks & Tujuan
Data **Project Outside Job Scope** berasal dari sistem eksternal yang berisi daftar karyawan yang memiliki proyek, lalu diunggah oleh **HR ICF** atau **HR Unit Usaha** yang diberi akses. Berdasarkan instruksi, terdapat 2 fokus penyesuaian utama:

1. **Halaman `/employee`, `/supervisor`, dan `/bod` Tidak Menampilkan Section Upload Excel HR ICF & Upload HR Otomatis Masuk Approval 1 & 2**:
   - Section `"Upload Excel Project Outside Job Scope (HR ICF)"` **dihapus** dari seluruh tampilan `/employee`, `/supervisor`, dan `/bod` (`StaffMyPA.tsx`, `ProjectOutsideCombinedPage.tsx`, `supervisor/MyPerformanceAppraisal.tsx`, `employee/MyPerformanceAppraisal.tsx`, serta `/bod/monitoring/project`).
   - Karyawan, Supervisor, dan BOD hanya melihat tabel data proyek yang sudah diunggah beserta status approval dan ringkasan skor (`Final Score` tertinggi × bobot modul).
   - Pada saat **HR Unit Usaha** atau **HR ICF** mengunggah file Excel (baik di `/hr/monitoring/project` maupun di PA-Simulasi `/pa-simulasi?view=project`), data proyek masing-masing karyawan di dalam file Excel **otomatis langsung masuk ke proses Approval Level 1 & Level 2** masing-masing karyawan (`Pending-Approver 1` → `Pending-Approver 2`) tanpa perlu langkah submit manual terpisah.
2. **Penyesuaian Tabel & Tombol Template pada `/hr/monitoring/project`**:
   - Menghapus 3 kolom lama dari tabel `/hr/monitoring/project` (serta menyelaraskan tabel monitoring/appraisal supervisor):
     - ~~`Project Score`~~
     - ~~`Team Bobot`~~
     - ~~`Project Bobot`~~
   - Kolom tabel `/hr/monitoring/project` menjadi:
     `No.` | `Emp. ID` | `Employee` | `Company Unit` | `Department` | `Position` | `Project Scope` | `Role Project` | `Project Title` | `Project Detail` | `Start Date` | `Finish Date` | `Progress Status` | `Approval Status` | `Final Score`
   - Menambahkan tombol **`Download Template Excel`** pada toolbar `/hr/monitoring/project` (khusus HR, tidak tampil pada `/bod/monitoring/project`) yang disesuaikan dengan format upload dari sistem eksternal.

---

## 2. Detail Perubahan per Bagian

### A. Menghapus Section Upload Excel dari `/employee`, `/supervisor`, dan `/bod`
1. **`src/app/pages/staff/StaffMyPA.tsx` (`ProjectOutsideTab`)**:
   - Menghapus blok banner biru `"Upload Excel Project Outside Job Scope (HR ICF)"` beserta tombol `Download Template Excel`, `Upload Excel (HR ICF)`, dan `Submit ke Approval Level 1 & 2`.
   - Menampilkan tabel *read-only* berisi kolom `No`, `Project Scope`, `Role Project`, `Project Title`, `Project Detail`, `Start Date`, `Finish Date`, `Progress Status`, `Approval Status`, dan `Final Score` (dengan penanda badge **Tertinggi** pada skor maksimum), serta informasi status approval dan kontribusi nilai PA (`Final Score Tertinggi × Bobot Modul`).
   - Karena `ProjectOutsideCombinedPage.tsx` merender `ProjectOutsideTab`, halaman `/employee/measurement/project-outside` dan `/supervisor/measurement/project-outside` otomatis tidak menampilkan section upload.
2. **`src/app/pages/supervisor/MyPerformanceAppraisal.tsx` & `src/app/pages/employee/MyPerformanceAppraisal.tsx`**:
   - Menyelaraskan tab `Project Outside Job Scope` agar menampilkan tabel *read-only* dari `projectStore` (tanpa section upload) dan menghapus kolom `Project Score`, `Team Bobot`, serta `Project Bobot`.
3. **`/bod/monitoring/project` (`HRMonitoringProject` ketika `lockedUnits` terisi)**:
   - Memastikan tombol `Download Template Excel` dan `Import Excel` hanya dirender saat `!lockedUnits` (hanya di `/hr/monitoring/project`), sehingga `/bod/monitoring/project` hanya menampilkan fitur monitoring dan `Export Excel`.

### B. Penyesuaian `/hr/monitoring/project` & Alur Otomatis Approval 1 & 2 di Mockup Utama
1. **Penghapusan 3 Kolom (`src/app/pages/hr/monitoring/ProjectMonitoring.tsx` & `src/app/pages/supervisor/monitoring/ProjectMonitoring.tsx`)**:
   - Menghapus kolom `Project Score`, `Team Bobot`, dan `Project Bobot` dari header tabel (`<thead>`), isi baris (`<tbody>`), `SortKey`, fungsi sorting, serta CSV/Excel export.
   - Menampilkan `Final Score` langsung dari nilai `finalScore` pada data proyek karyawan (dan menandai skor tertinggi bila karyawan memiliki lebih dari 1 proyek), serta memperbarui keterangan rumus di footer tabel.
2. **Tombol `Download Template Excel` & `Import Excel` Otomatis Masuk Approval 1 & 2 (`src/app/pages/hr/monitoring/ProjectMonitoring.tsx`, `src/app/utils/projectExcelUtils.ts`, `src/app/store/projectStore.ts`)**:
   - Menambahkan tombol **`Download Template Excel`** di sebelah kiri tombol **`Import Excel`** dan **`Export Excel`** pada `/hr/monitoring/project`.
   - Format kolom Template Excel unggahan sistem eksternal:
     `No | Emp. ID | Employee | Company Unit | Department | Position | Project Scope | Role Project | Project Title | Project Detail | Start Date | Finish Date | Progress Status | Final Score`
     *(Parser `parseMonitoringProjectExcelFile` mendukung format lengkap dengan `Emp. ID` maupun format 9 kolom, serta header `Role Project` / `Roe Project`).*
   - Saat HR mengunggah file melalui **`Import Excel`** di `/hr/monitoring/project`:
     - File Excel di-parse dan dikelompokkan per karyawan (`Emp. ID`).
     - Data proyek setiap karyawan di dalam file disimpan ke `projectStore` dan **otomatis berstatus Submitted (`Pending Approval 1`)**.
     - Sistem otomatis mendaftarkan baris pengajuan modul `"Project"` ke daftar `Approvals -> Performance Appraisal Measurement` untuk **Approval Level 1** (`SupervisorApprovals.tsx`) dan **Approval Level 2** (`HRApprovals.tsx` / `BODHRApprovals`), sehingga atasan masing-masing karyawan dapat langsung melakukan review dan approval melalui `ReviewDrawer`.

### C. Penyesuaian Upload Otomatis ke Approval 1 & 2 di PA-Simulasi (`SimulationProject.tsx`, `projectRoutes.tsx`, `projectWorkflow.ts`)
1. **Tampilan Karyawan / Supervisor / GM (`/pa-simulasi?view=project`)**:
   - Untuk akun non-HR (serta saat melihat tab `Project Saya`), tidak ada section upload Excel sama sekali; hanya menampilkan tabel proyek yang telah diunggah HR dan status approval Level 1 & Level 2.
2. **Upload Excel oleh HR Unit Usaha (`hr-unit`) atau HR ICF (`hr-strategic`) Otomatis Langsung ke Approval 1 & 2**:
   - Pada mode HR ICF / HR Unit Usaha di PA-Simulasi:
     - Mendukung unggah file Excel dari sistem eksternal yang berisi data banyak karyawan sekaligus (menggunakan kolom `Emp. ID` / `Employee ID`) maupun untuk karyawan terpilih.
     - Begitu HR Unit Usaha atau HR ICF memilih/mengunggah file Excel (`Upload Excel (.xlsx / .csv)`), sistem **otomatis langsung mengeksekusi transisi `submit`** untuk setiap karyawan di dalam file Excel sehingga status dokumen masing-masing karyawan langsung berubah menjadi **`Pending-Approver 1`** (masuk ke antrean Approval Level 1 lalu Approval Level 2 masing-masing karyawan) tanpa perlu klik tombol Simpan Draft / Submit manual.
     - Menambahkan endpoint `POST /make-server-74dadec6/pa-sim/project/bulk-upload` pada `projectRoutes.tsx` dan fungsi client `bulkUploadSimulationProject()` pada `paSimulationApi.ts` untuk memproses unggahan Excel multi-karyawan sekaligus dan otomatis meneruskannya ke Approval Level 1 & Level 2 setiap karyawan.

---

## 3. Strategi Pengujian & Verifikasi
1. **Unit Test (`supabase/functions/server/shared/projectWorkflow.test.ts`)**:
   - Memverifikasi bahwa unggahan Excel oleh HR Unit Usaha (`hr-unit`) dan HR ICF (`hr-strategic`) langsung men-submit dokumen ke `Pending-Approver 1` → `Pending-Approver 2` → `Validated`.
   - Memverifikasi parser Excel untuk format multi-karyawan (`Emp. ID` + kolom proyek) serta pengambilan `Final Score` tertinggi × bobot modul.
2. **Full Test Suite & Build**:
   - Menjalankan seluruh unit test dengan `node --experimental-strip-types --test ...`, `pnpm build`, dan `git diff --check`.
