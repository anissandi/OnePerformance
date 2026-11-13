# Rencana Perbaikan 8 Issue Major Hasil Trial (Appraisal Form & Project Outside Job Scope)

## Ringkasan Masalah & Akar Penyebab (Root Cause)

Berdasarkan penelusuran kode menyeluruh, seluruh 8 temuan major saling terkait pada lapisan workflow approval, isolasi penyimpanan per karyawan, kewenangan berjenjang, dan kalkulasi skor:

1. **Approval 2 Tidak Bisa Approve & Notifikasi Approver 2 Belum Muncul**:
   - Komponen `SupervisorApprovals` (`src/app/pages/supervisor/Approvals.tsx`) meng-hardcode `reviewerRole="approver1"` untuk semua user di portal `/supervisor`. Akibatnya, ketika **Approver 2** (sesuai kolom `Reg No AP2` pada data karyawan) login ke portal `/supervisor`, sistem tetap membacanya sebagai `approver1`, sehingga transaksi yang sudah di-approve oleh Approver 1 langsung dianggap selesai (masuk ke *Approval History*) dan tidak muncul di tab *Pending* Approver 2.
   - Sebaliknya, `HRApprovals` (`/hr/approvals/...`) meng-hardcode `reviewerRole="approver2"`, sehingga hanya Administrator yang bisa melakukan Approval 2.
   - Fungsi `triggerApprovalTransactionNotification` hanya mengirim notifikasi ke karyawan pemilik modul, belum mengirim notifikasi tugas tindak lanjut ke **Approver 1** (saat karyawan submit) maupun ke **Approver 2** (saat Approver 1 selesai approve).

2. **Transaksi Approval Masih Bisa Dilihat oleh Semua User Login di Unit yang Sama**:
   - Pada `SupervisorApprovals.tsx` baris 89 terdapat kondisi longgar `|| row.companyUnit === activeUser.company`, sehingga semua user yang berada di Company Unit yang sama dapat melihat transaksi approval karyawan lain walaupun bukan approver-nya.

3. **Transaksi 1 Karyawan Ter-gabung dengan Karyawan Lainnya (Storage Global)**:
   - `appraisalFormStore.ts` (`af_self_ratings_v1`, `af_approver_ratings_v1`), `AppraisalForm.tsx` (`af_self_ratings_v2`, `af_saved_forms_v2`), dan `msStore.ts` menyimpan data menggunakan satu key `localStorage` global tanpa memisahkan berdasarkan `employeeId`.
   - Selain itu, `MODULE_APPROVALS` di `StaffDashboard.tsx` dan `src/app/pages/supervisor/Dashboard.tsx` dideklarasikan sebagai konstanta di tingkat modul (di luar komponen React), sehingga hanya dihitung sekali saat aplikasi pertama kali dimuat dan tidak diperbarui saat berganti akun login.

4. **Approver Level Terendah Supervisor (di Bawah Bagian, contoh: KASHIFT / `Ka./Wa.Ka.Seksi`) Bisa Melihat Karyawan di Luar Hirarki Approval-nya**:
   - Pada `getAuthorizedSubordinates` di `src/app/store/authStore.ts` (baris 460–467), level `"seksi"` (`Ka./Wa.Ka.Seksi` seperti KASHIFT) disamakan dengan level `"bagian"` dan memiliki fallback `return sameDiv && sameDept`. Sesuai aturan `AGENTS.md` Bagian I Poin 4, kewenangan struktural berjenjang hanya sampai level **Bagian**; level di bawah Bagian (`seksi` / `operational`) yang memiliki fungsi approver **hanya boleh melihat datanya sendiri dan data karyawan yang berada di dalam hirarki `Reg No AP1` / `Reg No AP2`-nya**.

5. **Current Score di Dashboard Belum Sesuai dengan My Profile & Format Persentase (`%`)**:
   - `StaffDashboard.tsx` dan `SupervisorDashboard` (`Dashboard.tsx`) menggunakan rumus fallback tersendiri dan menampilkan angka tanpa `%`, sedangkan `ViewProfile.tsx` (`My Profile`) menghitung jumlah tertimbang modul (`totalWeighted`) sesuai bobot grouping karyawan.

6. **Modul Appraisal Form Masih Bisa Diubah, Disimpan, dan Di-reset Setelah Submit**:
   - Pada `src/app/pages/employee/AppraisalForm.tsx`, `handleConfirmSubmit` hanya menampilkan modal sukses tanpa mengunci status `submitted: true` untuk karyawan aktif. Tombol pilihan skor `1–5`, tombol `Reset`, `Save`, dan `Submit Form` tetap aktif setelah disubmit.

7. **Notifikasi Submit Appraisal Form Muncul Double / 3 Kali**:
   - Pada `AppraisalForm.tsx`, setiap kali karyawan menekan tombol **Save** pada tab **Form A**, **Form B**, dan **Form C**, fungsi `saveForm()` memanggil `saveAppraisalSelf()` yang di dalamnya langsung memanggil `submitWorkflowModule("Appraisal Form")`. Karena ada 3 tab (Form A, B, C), notifikasi terkirim 3 kali bahkan sebelum tombol **Submit Form** diklik.

8. **Transaksi Project Outside Job Scope yang Di-upload Admin Muncul Double dengan ID Karyawan Berbeda di Approver 1**:
   - Saat Admin meng-upload Excel Project (`importExternalProjectRows` di `projectStore.ts`), sistem membuat record di `pa_project_icf_by_emp_v1` sekaligus memanggil `submitWorkflowModule("Project", ...)`.
   - Di halaman Approvals (`SupervisorApprovals.tsx` & `HRApprovals.tsx`), daftar baris menggabungkan `applyOverrides(...)` (yang otomatis men-generate baris dari `loadWorkflowRecords()` dengan ID karyawan asli dari `ManagedUsers`) **DAN** `projectApprovalRows(...)` (yang men-generate baris kedua dari `pa_project_icf_by_emp_v1` dengan memformat ulang ID menjadi `EMP00x` dan mengambil nama dari array statis `EMPLOYEES` di `monitoringData.ts`). Akibatnya setiap karyawan muncul 2 kali dengan format ID berbeda.

---

## Rencana Implementasi Perbaikan

### 1. Perbaikan Routing & Peran Dinamis Approval 1 & Approval 2 + Notifikasi Approver 2 (Issue #1 & #2)
- **File**: `src/app/pages/shared/appraisalWorkflowStore.ts`, `src/app/pages/shared/approvalsStore.ts`, `src/app/pages/supervisor/Approvals.tsx`, `src/app/pages/hr/Approvals.tsx`, `src/app/pages/supervisor/Dashboard.tsx`, `src/app/store/notificationStore.ts`
- **Langkah**:
  1. Buat helper penentu peran reviewer per baris karyawan `resolveReviewerRoleForRow(activeUser, targetEmployeeId)`:
     - Mencocokkan `activeUser` (`regNo`, `employeeId`, `name`) terhadap `targetUser.regNoAp1` dan `targetUser.regNoAp2` dari data karyawan (`loadManagedUsers()`).
     - Jika `activeUser` adalah **AP1** dari karyawan tersebut -> `roleForRow = "approver1"`.
     - Jika `activeUser` adalah **AP2** dari karyawan tersebut -> `roleForRow = "approver2"`.
     - Jika `activeUser` adalah **Administrator / HR ICF** -> dapat bertindak pada tahap aktif (`approver1` jika AP1 belum selesai, atau `approver2` jika AP1 sudah selesai).
  2. Perbarui `workflowRowStatus(row, roleForRow)` dan `ApprovalsTable` di `SupervisorApprovals.tsx` serta `HRApprovals.tsx`:
     - Setiap baris dievaluasi menggunakan `roleForRow` milik `activeUser` terhadap karyawan pada baris tersebut (bukan lagi hardcode `"approver1"` untuk seluruh tabel di `/supervisor`).
     - Ketika Approver 1 telah menyetujui (`Approved` / `Assessed-Approver 1`), maka:
       - Bagi **Approver 1**, baris tersebut berstatus riwayat (`Pending-Approver 2` / `Assessed`) di tab **Approval History**.
       - Bagi **Approver 2** (sesuai `Reg No AP2`), baris tersebut otomatis berstatus **`Pending`** di tab **Pending** dan dapat langsung direview serta di-approve oleh Approver 2.
  3. Perketat filter visibilitas transaksi di `SupervisorApprovals.tsx`, `HRApprovals.tsx`, dan `ApprovalDashboard` (`Dashboard.tsx`):
     - Hapus kondisi `|| row.companyUnit === activeUser.company`.
     - Pastikan user yang login hanya melihat transaksi approval dari karyawan yang mana user tersebut adalah Approver berwenangnya (`ap1`, `ap2`, `checker` untuk modul KPI/SMART Goals, atau `validator`/`admin`) dan tidak menampilkan pengajuan milik dirinya sendiri.
  4. Tambahkan pengiriman notifikasi otomatis ke **Approver 1** dan **Approver 2** di `triggerApprovalTransactionNotification` (`notificationStore.ts`):
     - Saat karyawan **Submit** modul: selain notifikasi ke karyawan, sistem mencari user **Approver 1** (berdasarkan `targetUser.regNoAp1`) dan mengirimkan notifikasi *"Pengajuan {{nama_modul}} dari {{nama_karyawan}} Menunggu Approval 1 Anda"*.
     - Saat **Approver 1** melakukan **Approve / Assessed**: selain notifikasi update status ke karyawan, sistem mencari user **Approver 2** (berdasarkan `targetUser.regNoAp2`) dan mengirimkan notifikasi *"Pengajuan {{nama_modul}} dari {{nama_karyawan}} Telah Disetujui Approver 1 & Menunggu Approval 2 Anda"* lengkap dengan link CTA menuju halaman Approvals.

### 2. Isolasi Penyimpanan Transaksi & Progress Modul per Karyawan (Issue #3)
- **File**: `src/app/pages/shared/appraisalFormStore.ts`, `src/app/pages/employee/AppraisalForm.tsx`, `src/app/pages/shared/msStore.ts`, `src/app/pages/shared/smartGoalsStore.ts`, `src/app/pages/staff/StaffDashboard.tsx`, `src/app/pages/supervisor/Dashboard.tsx`, `src/app/components/ReviewDrawer.tsx`
- **Langkah**:
  1. Ubah penyimpanan di `appraisalFormStore.ts` menjadi dictionary per karyawan (`af_self_by_emp_v2[normEmpId]` dan `af_approver_by_emp_v2[normEmpId]`).
  2. Perbarui `loadAppraisalSelf(employeeId?)`, `saveAppraisalSelf(data, options?)`, `loadAllAppraisalApprovers(employeeId?)`, dan `saveAppraisalApprover(entry, employeeId?)` agar selalu menggunakan `normalizeEmployeeId(employeeId ?? getActiveUser().employeeId)`.
  3. Di `ReviewDrawer.tsx` dan `approvalsStore.ts`: saat Approver 1 atau Approver 2 membuka drawer review atau menyimpan penilaian untuk karyawan `row.employeeId`, baca dan simpan data ke `row.employeeId` (bukan lagi hardcode `"E002"` / `"EMP-002"`).
  4. Di `StaffDashboard.tsx` dan `src/app/pages/supervisor/Dashboard.tsx`: ubah `MODULE_APPROVALS` dari konstanta statis top-level menjadi state/memo reaktif di dalam komponen yang selalu memanggil `getLiveUserModuleApprovals()` berdasarkan `activeUser` yang sedang login.

### 3. Pembatasan Kewenangan Approver Level Terendah (`Ka./Wa.Ka.Seksi` / KASHIFT) di Summary & Monitoring (Issue #4)
- **File**: `src/app/store/authStore.ts`, `src/app/pages/shared/PerformanceAppraisalSummary.tsx`, serta halaman-halaman Monitoring di `src/app/pages/supervisor/monitoring/` dan `src/app/pages/hr/monitoring/`
- **Langkah**:
  1. Di `getAuthorizedSubordinates` (`src/app/store/authStore.ts`):
     - Pisahkan `level === "seksi"` (`Ka./Wa.Ka.Seksi`, seperti posisi KASHIFT) dari `level === "bagian"`.
     - Untuk `level === "seksi"` dan `level === "operational"`: **hanya** mengembalikan data dirinya sendiri dan karyawan yang berada di dalam rantai approval `Reg No AP1` / `Reg No AP2`-nya (`transitiveSubIds`), tanpa membuka akses ke seluruh Bagian/Departemen.
     - Untuk `level === "bagian"`: wajib mencocokkan nama Bagian (`allowedBagians.has(normOrgName(target.bagian))`), tanpa fallback ke seluruh Departemen jika `bagian` berbeda/kosong.
  2. Pastikan halaman **Summary** dan seluruh halaman **Monitoring** (KPI, SMART Goals, Appraisal Form, Managerial Skill, Project, Inter-Department Feedback) memfilter daftar karyawan menggunakan `canUserAccessEmployeeData(activeUser, emp.id)`.

### 4. Penyelarasan Perhitungan Current Score (`%`) antara Dashboard dan My Profile (Issue #5)
- **File**: `src/app/data/mockEmployees.ts`, `src/app/pages/shared/ViewProfile.tsx`, `src/app/pages/staff/StaffDashboard.tsx`, `src/app/pages/supervisor/Dashboard.tsx`
- **Langkah**:
  1. Pastikan `getLiveTransactionalEmployees()` di `mockEmployees.ts` membaca skor KPI, SMART Goals, Appraisal Form, Project Outside Job Scope, Managerial Skill, dan Management Interview per `employeeId` secara konsisten dan menghitung `totalScore` berdasarkan bobot grouping unit usaha karyawan tersebut.
  2. Gunakan sumber nilai `totalScore` yang sama antara `ViewProfile.tsx` (`My Profile`), `StaffDashboard.tsx`, dan `SupervisorDashboard` (`Dashboard.tsx`).
  3. Tampilkan nilai **Current Score** dengan satuan persentase (`{s.currentScore}%`) baik di kartu Dashboard maupun di My Profile.

### 5. Penguncian Modul Appraisal Form Setelah Submit & Perbaikan Trigger Notifikasi Tunggal (Issue #6 & #7)
- **File**: `src/app/pages/employee/AppraisalForm.tsx`, `src/app/pages/shared/appraisalFormStore.ts`
- **Langkah**:
  1. Pisahkan aksi **Save** (simpan draft bagian Form A / Form B / Form C) dari aksi **Submit Form**:
     - Saat klik tombol **Save** pada Form A, Form B, atau Form C: simpan data ke `saveAppraisalSelf(data, { submitWorkflow: false })` **tanpa** memanggil `submitWorkflowModule` dan **tanpa** memicu notifikasi.
     - Saat klik tombol **Submit Form** (setelah Form A, B, dan C tersimpan) lalu klik konfirmasi di `ConfirmModal` (`handleConfirmSubmit`): barulah panggil `saveAppraisalSelf(data, { submitWorkflow: true })` yang menandai `submitted: true` dan memanggil `submitWorkflowModule("Appraisal Form", "measurement")` tepat **1 kali** (menghasilkan 1 notifikasi).
  2. Ketika status form sudah `submitted === true` (dan workflow tidak sedang berstatus `"Revision"`):
     - Kunci seluruh tombol skor `1–5` pada Form A, Form B, dan Form C (`disabled`, `cursor-not-allowed`).
     - Sembunyikan/nonaktifkan tombol `Reset`, `Save`, dan `Submit Form` pada bottom bar, lalu tampilkan banner status terkunci: *"Appraisal Form telah disubmit dan sedang dalam proses Approval (Terkunci)"*.

### 6. Pembersihan Duplikasi & Data Dummy Project Outside Job Scope di Approver 1 (Issue #8)
- **File**: `src/app/pages/shared/approvalsStore.ts`, `src/app/store/projectStore.ts`, `src/app/pages/supervisor/monitoring/ProjectMonitoring.tsx`, `src/app/pages/hr/monitoring/ProjectMonitoring.tsx`
- **Langkah**:
  1. Di `applyOverrides` (`src/app/pages/shared/approvalsStore.ts` baris 134–169):
     - Jangan men-generate baris duplikat `CI-LIVE-...-Project` atau `CI-LIVE-...-Inter-Department Feedback` karena modul `Project` dan `Inter-Department Feedback` sudah di-supply oleh `projectApprovalRows(role)` dan `feedbackApprovalRows(role)`.
  2. Di `projectApprovalRows` (`src/app/store/projectStore.ts`):
     - Ambil data profil karyawan (Employee ID asli, Nama, Jabatan, Divisi, Departemen, Bagian, Company Unit) langsung dari `loadManagedUsers()` (data karyawan yang di-upload Admin), **bukan** dari konstanta dummy `EMPLOYEES` (`monitoringData.ts`), dan gunakan `managedUser.employeeId` asli tanpa mengubahnya menjadi `EMP00x`.
     - Abaikan/bersihkan entri dummy legacy (`EMP-002` / `E002` yang tidak ada di `loadManagedUsers()` atau berasal dari seed lama) pada `pa_project_icf_by_emp_v1` dan `pa_project_icf_excel_rows_v1`.
