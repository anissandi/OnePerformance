# Rencana Penyesuaian Role Director pada Management Interview & Calibration Approval

## Tujuan & Konteks
1. **Penyatuan Path Penilaian Management Interview ke `/approvals/management-interview` & Otorisasi Interviewer (Read-Only bagi Non-Interviewer)**:
   - Menggunakan satu-satunya path dan metode penilaian **Management Interview** pada **`/approvals/management-interview`** (`/${portal}/approvals/management-interview` di bawah menu **Approvals → Management Interview**, yaitu metode penilaian komponen `SupervisorMonitoringManagementInterview` di `src/app/pages/supervisor/monitoring/ManagementInterviewMonitoring.tsx`: daftar jadwal HR Schedules + `AssessmentModal` & `ParticipantTable` 3 Aspek Penilaian dengan *Lihat Indikator Penilaian*, skor 1–5, Nilai Rata-Rata, dan Komentar Management), serta menghapus menu/path `/bod/management-interview/assessment` dari **Sidebar**, **Access Management**, dan **Menu Management**.
   - Memastikan bahwa pada halaman `/approvals/management-interview` (`ManagementInterviewMonitoring.tsx`), **hanya pengguna yang ditunjuk secara eksplisit sebagai Interviewer** (`entry.interviewers`) pada jadwal tersebut yang dapat menginput dan men-submit penilaian.
   - Pengguna dengan Role yang di-*allow* membuka menu Management Interview melalui **Menu Management / Access Management** namun **tidak ditunjuk sebagai Interviewer** pada jadwal tersebut hanya memiliki akses **Read-Only (View Only)**.
2. **Setup Peran `Director` pada Calibration Approval (`Approver` vs `Mengetahui`) & Penyesuaian Tombol**:
   - Menyediakan pengaturan untuk Role **`Director`** agar dapat di-setup sebagai **`Approver`** (menyetujui / meminta revisi) atau **`Mengetahui`** (*Acknowledge*) pada **Calibration Approval**.
   - Menyesuaikan tampilan dan tombol aksi pada halaman **Calibration Approval** (`/bod/approvals/calibration` / `/${portal}/approvals/calibration`) sesuai peran Director yang login (`Approve Calibration` + `Revision` untuk **Approver**, atau tombol `Mengetahui Calibration` untuk **Mengetahui**).

---

## Rincian Implementasi Teknis

### 1. Penyatuan Path `/approvals/management-interview` & Otorisasi Interviewer (`Sidebar.tsx`, `AccessManagement.tsx`, `MenuManagement.tsx`, `routes.tsx`, `ManagementInterviewMonitoring.tsx`, `ManagementInterviewCheckIn.tsx`)
- **Standarisasi Path & Metode Penilaian ke `/approvals/management-interview`**:
  - Pada `Sidebar.tsx`, `AccessManagement.tsx` (`MENU_STRUCTURE`), dan `MenuManagement.tsx` (`INITIAL_MENUS`), menggunakan item **`approvals_mgmt_interview` (`Approvals → Management Interview`, path `/approvals/management-interview`)** sebagai satu-satunya menu penilaian Management Interview, dan menghapus item `mgmt_interview_assessment` (`/bod/management-interview/assessment`).
  - Pada `src/app/routes.tsx`, memastikan `/${portal}/approvals/management-interview` di semua portal (`/hr`, `/supervisor`, `/employee`, `/bod`) merender `SupervisorMonitoringManagementInterview` (`ManagementInterviewMonitoring.tsx`), serta mengarahkan route legacy `management-interview/assessment` ke `SupervisorMonitoringManagementInterview` agar metode penilaian yang tampil selalu menggunakan metode `/approvals/management-interview`.
- **Penunjukan Interviewer dari Data Karyawan Aktual (`src/app/pages/supervisor/ManagementInterviewCheckIn.tsx`)**:
  - Menggabungkan daftar kandidat (`ALL_EMPLOYEES`), pewawancara (`ALL_INTERVIEWERS`), dan peserta tambahan (`ALL_OTHER_USERS`) dengan data pengguna aktif dari `loadManagedUsers()` (khususnya para `Director`, `BOD`, `GM`, dan `Ka. Divisi`), sehingga saat HR membuat jadwal di `/calibration/management-interview`, nama dan ID Direktur aktual dapat dipilih sebagai Interviewer.
- **Validasi Interviewer Terpilih vs Read-Only di `/approvals/management-interview` (`src/app/pages/supervisor/monitoring/ManagementInterviewMonitoring.tsx`)**:
  - Menambahkan fungsi `isUserAppointedInterviewer(activeUser, entry.interviewers)` yang memeriksa apakah `activeUser.name` atau `activeUser.employeeId` tercantum di dalam `entry.interviewers` pada jadwal tersebut.
  - **Jika `isAppointedInterviewer === true`**:
    - Menampilkan badge **`Interviewer Terpilih`** pada baris jadwal tersebut.
    - Tombol **`Assess`** aktif dan membuka `AssessmentModal` (`readOnly={false}`) dengan metode tabel 3 aspek penilaian (`Kewajaran Hasil Kinerja`, `Justifikasi & Evidence`, `Improvement & Follow Up`), indikator skor 1–5, tombol `Save` per participant, dan tombol `Submit`.
  - **Jika `isAppointedInterviewer === false`** (pengguna memiliki akses ke menu `/approvals/management-interview` dari Menu Management / Access Management, tetapi bukan Interviewer yang ditunjuk pada jadwal tersebut):
    - Menampilkan badge **`Read-Only`** dan tombol **`View Assessment (Read-Only)`**.
    - Membuka `AssessmentModal` dalam mode `readOnly={true}` (menampilkan tabel `ParticipantTable` 3 aspek penilaian beserta banner informasi bahwa hanya Interviewer yang ditunjuk yang dapat memberi penilaian, seluruh pilihan skor 1–5 & komentar dinonaktifkan, dan tombol `Save`/`Submit` disembunyikan).

### 2. Setup Role `Director` sebagai `Approver` atau `Mengetahui` di Calibration Approval (`authStore.ts`, `UserManagement.tsx`, `CalibrationApproval.tsx`)
- **Model Data (`src/app/store/authStore.ts`)**:
  - Menambahkan field opsional pada `ManagedUser`:
    `directorCalibrationRole?: "approver" | "mengetahui";` (default: `"approver"`).
- **Konfigurasi di User Management (`src/app/pages/hr/settings/UserManagement.tsx`)**:
  - Pada modal **Add / Edit User** (`EditModal`), di bagian *"Setup Fungsi Approval Khusus & Akses Role"*, menampilkan pengaturan **Peran Calibration Approval (Role Director)** (pilihan: **`Approver (Approve / Revision)`** atau **`Mengetahui (Acknowledge Only)`**), serta menampilkan badge `Calibration: Approver` atau `Calibration: Mengetahui` pada kolom Role di tabel User Management.
- **Penyesuaian Halaman & Tombol di `src/app/pages/bod/CalibrationApproval.tsx`**:
  - Membaca peran kalibrasi pengguna aktif (`calibrationRole = activeUser.directorCalibrationRole ?? "approver"`), serta menyediakan kontrol cepat bagi Administrator / penguji di halaman tersebut jika ingin melihat/mengubah mode peran Director (`Approver` vs `Mengetahui`).
  - **Jika `calibrationRole === "approver"`**:
    - Menampilkan badge **`Peran Calibration: Approver`** di header.
    - Pada panel aksi bawah (saat status unit `pending`), menampilkan tombol **`Revision`** dan **`Approve Calibration`**.
  - **Jika `calibrationRole === "mengetahui"`**:
    - Menampilkan badge **`Peran Calibration: Mengetahui (Acknowledge)`** di header.
    - Pada panel aksi bawah, menampilkan kartu **"Director Acknowledge (Mengetahui) — {unit.name}"** dengan tombol khusus **`Mengetahui Calibration`** (tanpa tombol `Revision` atau `Approve Calibration`).
    - Saat tombol **`Mengetahui Calibration`** diklik dan dikonfirmasi pada modal konfirmasi, menyimpan status `acknowledgedMap[selectedUnitId]` beserta nama Direktur dan waktu konfirmasi ke `localStorage` (`pa_bod_cal_acknowledged_map_v1`) & Supabase, lalu menampilkan banner konfirmasi **"Telah Diketahui oleh {activeUser.name} pada {waktu}"**.

---

## Rencana Verifikasi
1. **Verifikasi Management Interview (Interviewer Terpilih vs Read-Only)**:
   - Pastikan di Menu Management, Access Management, dan Sidebar, menu penilaian Management Interview menggunakan path tunggal `/approvals/management-interview` (di bawah grup `Approvals`).
   - Buka `/approvals/management-interview` sebagai Direktur/Role yang ditunjuk sebagai Interviewer -> pastikan tombol `Assess` aktif dan dapat mengisi skor serta klik `Submit`.
   - Buka halaman yang sama sebagai pengguna/Direktur yang di-allow di Menu Management namun tidak ditunjuk sebagai Interviewer pada jadwal tersebut -> pastikan tampil dalam mode **Read-Only** dan tidak dapat mengubah atau men-submit nilai.
2. **Verifikasi Calibration Approval (`Approver` vs `Mengetahui`)**:
   - Set Role Director di User Management sebagai `Approver` -> pastikan halaman Calibration Approval menampilkan tombol `Revision` dan `Approve Calibration`.
   - Set Role Director sebagai `Mengetahui` -> pastikan halaman Calibration Approval menyesuaikan tombol menjadi `Mengetahui Calibration` dan menyimpan status *Acknowledged* saat dikonfirmasi.
3. **Verifikasi Build**:
   - Jalankan `pnpm build` untuk memastikan tidak ada error kompilasi maupun TypeScript.
