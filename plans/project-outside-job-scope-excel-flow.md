# Rencana Implementasi: Project Outside Job Scope (Upload Excel HR ICF → Approval Level 1 & Level 2)

## 1. Tujuan & Ringkasan Alur

Menyambungkan modul **Project Outside Job Scope** ke **PA-Simulasi** sekaligus menyelaraskan **Mockup Utama** dengan alur baru berbasis unggahan file Excel oleh **HR ICF**:

1. **Unggah Excel oleh HR ICF**:
   - Di **PA-Simulasi**, peran pengunggah (**HR ICF**) dijalankan oleh akun **HR Unit** (`SIM-ACTOR-<UNIT>-HR-UNIT`, untuk karyawan di unit usahanya) dan **HR Strategic** (`SIM-ACTOR-HR-STRATEGIC`, lintas unit usaha) tanpa perlu menambah akun ke-92 baru.
   - HR ICF memilih karyawan peserta PA (atau mengunggah template Excel untuk karyawan terpilih), mengunggah file Excel (`.xlsx` / `.xls` / `.csv`), memeriksa pratinjau tabel, lalu melakukan **Submit untuk Approval**. Tersedia juga tombol **Download Template Excel** agar struktur kolom selalu sesuai standar.
2. **Struktur Tabel Excel (9 Kolom Resmi)**:
   - `No` (Nomor urut baris)
   - `Project Scope` (Cakupan proyek, mis. `SS - "Small Idea Kaizen"`, `QCC - "Small Group Activity"`, `QCP - "Cross Functional Kaizen Team"`, `Komite P2K3`, dll.)
   - `Role Project` *(mendukung header `Role Project` maupun `Roe Project` sesuai penulisan di template)*
   - `Project Title` (Judul proyek)
   - `Project Detail` (Deskripsi/detail proyek)
   - `Start Date` (Tanggal mulai)
   - `Finish Date` (Tanggal selesai)
   - `Progress Status` (Status progres, mis. `Submitted`, `In Progress`, `On Track`, `Done`, `Completed`)
   - `Final Score` (Angka skor proyek `0–100`)
3. **Alur Persetujuan (Approval Level 1 & Level 2)**:
   - Setelah HR ICF men-submit data Excel karyawan, status dokumen menjadi **`Pending-Approver 1`**.
   - **Approver 1 (Level 1)** memeriksa tabel proyek hasil unggahan HR ICF beserta nilai `Final Score` tertinggi, memberikan catatan pemeriksaan, lalu memilih **Approve / Teruskan** (menjadi `Pending-Approver 2`) atau **Minta Revisi** (kembali ke HR ICF untuk diunggah ulang/diperbaiki).
   - Untuk karyawan level **Kepala Divisi** (`mirrorSecondSlot = true`), persetujuan GM pada Approver 1 otomatis mencakup Approver 2 (`A1 + A2`) dan langsung berstatus **`Validated`**.
   - **Approver 2 (Level 2)** memeriksa dan memberikan persetujuan akhir hingga dokumen berstatus **`Validated`** (atau meminta revisi).
   - **Karyawan pemilik PA** dapat melihat tabel Project Outside Job Scope miliknya, status approval (`Pending-Approver 1`, `Pending-Approver 2`, `Validated`), nilai tertinggi, dan kontribusi skor terbobot secara *read-only* di menu **Pengajuan PA Saya → Project Outside Job Scope**.
4. **Rumus Perhitungan Skor Modul**:
   - Jika terdapat lebih dari 1 baris proyek pada tabel Excel seorang karyawan, sistem mengambil **nilai `Final Score` tertinggi (maksimum)** dari seluruh baris proyek karyawan tersebut:
     $$\text{Skor Modul Project} = \max_{i} (\text{Final Score}_i)$$
   - Skor modul kemudian dikalikan dengan **Bobot Modul Project Outside Job Scope** sesuai level jabatan karyawan (`15%` untuk Operasional, Seksi, dan Bagian; `10%` untuk Departemen dan Divisi):
     $$\text{Kontribusi PA Terbobot} = \frac{\text{Skor Modul Project} \times \text{Bobot Modul}}{100}$$

---

## 2. Desain Backend & Database PA-Simulasi

### A. Domain & Validasi (`supabase/functions/server/shared/projectWorkflow.ts`)
- **Tipe Data `ProjectExcelRow`**:
  - `no: number`
  - `projectScope: string`
  - `roleProject: string`
  - `projectTitle: string`
  - `projectDetail: string`
  - `startDate: string`
  - `finishDate: string`
  - `progressStatus: string`
  - `finalScore: number` (`0 <= finalScore <= 100`)
- **Tipe Dokumen `ProjectSimulationDocument`**:
  - `employeeId: string`
  - `period: "2026"`
  - `version: number`
  - `status: "Draft" | "Pending-Approver 1" | "Pending-Approver 2" | "Revision-Approver 1" | "Revision-Approver 2" | "Validated"`
  - `activeStage: number`
  - `revisionStage: number | null`
  - `uploadedBy: string | null` (ID akun HR ICF pengunggah)
  - `fileName: string | null`
  - `rows: ProjectExcelRow[]`
  - `stages: KpiStage[]` (`approver-1` dan `approver-2` dari `simulationAssignments` untuk `module === "project"`)
  - `mirrorSecondSlot: boolean`
  - `snapshot: { unitId: string; level: string; weights: Record<string, number> }`
  - `history: KpiDocument["history"]`
- **Fungsi Utama**:
  - `canManageProjectUpload(document, actorId, actorLevel, actorUnitId, strategic)`: mengizinkan `hr-strategic` (lintas unit) dan `hr-unit` (untuk karyawan di unit yang sama, dengan larangan meng-approve pengajuan yang diunggahnya sendiri jika suatu saat berada di rantai approver).
  - `canReadProject(document, actorId, actorLevel, actorUnitId, strategic)`: mengizinkan karyawan pemilik PA, HR Unit di unit tersebut, HR Strategic, serta Approver 1 dan Approver 2 yang ditugaskan.
  - `validateProjectRows(rows, submitting)`: memastikan minimal 1 baris proyek saat submit, seluruh 9 kolom terisi, dan `finalScore` berupa angka valid `0–100`.
  - `transitionProjectDocument(document, input)`: menangani aksi `save`, `submit` (oleh HR ICF), `advance` (Approve oleh Approver 1 / Approver 2), dan `revise` (Minta Revisi oleh Approver 1 / Approver 2 kembali ke HR ICF).
  - `calculateProjectModuleScore(document)`: menghitung `maxFinalScore` (nilai `Final Score` tertinggi dari seluruh baris) dan `weightedScore = (maxFinalScore * bobot) / 100` (resmi ketika `status === "Validated"`, serta menyediakan nilai pratinjau selama proses review).

### B. Migrasi Database (`supabase/migrations/202610180001_pa_simulation_project.sql`)
- Tabel `public.pa_sim_project_windows` (`unit_id`, `period`, `start_date`, `end_date`, `locked`, `updated_by`, `updated_at`)
- Tabel `public.pa_sim_project_documents` (`employee_id`, `period`, `version`, `document`, `updated_at`)
- Tabel `public.pa_sim_project_events` (`id`, `employee_id`, `period`, `version`, `document`, `created_at`)
- Fungsi transaksi RPC `public.pa_sim_commit_project(employee, appraisal_period, expected_version, next_document, recipients, notification_payload)` dengan pemeriksaan jadwal aktif, versi dokumen, dan pencatatan notifikasi in-app (`scope = 'project'`).
- Proteksi RLS ketat (`revoke all ... from public, anon, authenticated; grant all ... to service_role;`).

### C. Route Edge Function (`supabase/functions/server/projectRoutes.tsx`)
- Dipasang pada `/make-server-74dadec6/pa-simulation/project` di `supabase/functions/server/index.tsx`:
  - `GET /`: memuat daftar `documents` sesuai kewenangan akun, `windows` per unit, dan `scores` (`maxFinalScore` & `weightedScore`).
  - `POST /window`: HR Strategic menyimpan jadwal aktif modul Project per unit usaha.
  - `POST /:employeeId/action`: memproses `save` / `submit` (oleh HR ICF) serta `advance` / `revise` (oleh Approver 1 & Approver 2).

---

## 3. Desain Frontend PA-Simulasi & Mockup Utama

### A. Parser & Generator Template Excel (`src/app/utils/projectExcelUtils.ts`)
- Fungsi `parseProjectExcelFile(file: File): Promise<ProjectExcelRow[]>`:
  - Membaca file `.xlsx` / `.xls` / `.csv` menggunakan pustaka `xlsx`.
  - Mencocokkan 9 kolom header secara fleksibel (case-insensitive):
    1. `No`
    2. `Project Scope`
    3. `Role Project` atau `Roe Project`
    4. `Project Title`
    5. `Project Detail`
    6. `Start Date`
    7. `Finish Date`
    8. `Progress Status`
    9. `Final Score`
- Fungsi `downloadProjectExcelTemplate(employeeName?: string)`:
  - Mengunduh file template `.xlsx` siap pakai dengan header `No; Project Scope; Role Project; Project Title; Project Detail; Start Date; Finish Date; Progress Status; Final Score` beserta contoh baris.

### B. Halaman PA-Simulasi (`src/app/pages/simulation/SimulationProject.tsx`)
- Terhubung ke menu Sidebar `/pa-simulasi`:
  - **Grup `Pengajuan PA Saya` → `Project Outside Job Scope` (`?view=project`)**:
    - Bagi karyawan peserta PA: melihat tabel 9 kolom Project Outside Job Scope miliknya, nama file Excel yang diunggah HR ICF, rantai status approval (`Pending-Approver 1`, `Pending-Approver 2`, `Validated`), **Skor Tertinggi (`Max Final Score`)**, dan **Kontribusi PA Terbobot**.
    - Bagi akun **HR ICF (`hr-unit` & `hr-strategic`)**: menyediakan panel **Upload Excel Project Outside Job Scope (HR ICF)** di mana HR dapat memilih karyawan unitnya, mengunduh template Excel, mengunggah file Excel 9 kolom, meninjau pratinjau tabel & skor tertinggi, menyimpan draft, atau men-submit ke Approver Level 1 & Level 2.
  - **Grup `Approvals` → `Project Outside Job Scope` (`?view=approvals-project`)**:
    - Menampilkan tab filter `Pending`, `Validated`, dan `Semua` (menyembunyikan dokumen `Validated` dari tab `Pending`).
    - Approver Level 1 dan Level 2 meninjau tabel 9 kolom hasil unggahan HR ICF, melihat highlight baris dengan `Final Score` tertinggi, mengisi catatan, lalu menekan **Approve / Teruskan** atau **Minta Revisi**.
  - **Grup `Layanan & Jadwal` → `Activation · Project` (`?view=project-activation`)**:
    - HR Strategic mengatur *Start Date* dan *End Date* modul Project per unit usaha.

### C. Penyelarasan Mockup Utama (`src/app/store/projectStore.ts`, `src/app/pages/employee/ProjectOutsidePage.tsx`, `src/app/pages/staff/StaffMyPA.tsx`, `src/app/components/ReviewDrawer.tsx`)
- Menyelaraskan tabel **Project Outside Job Scope** pada Mockup Utama agar menggunakan 9 kolom standar (`No`, `Project Scope`, `Role Project`, `Project Title`, `Project Detail`, `Start Date`, `Finish Date`, `Progress Status`, `Final Score`).
- Menyediakan fitur **Upload Excel (HR ICF)** & **Download Template Excel** serta menampilkan perhitungan **Skor Modul = Nilai `Final Score` Tertinggi** × **Bobot Modul (`15%` / `10%`)** secara konsisten di halaman Project, My PA (`StaffMyPA.tsx` & `SupervisorMyPerformanceAppraisal.tsx`), dan drawer approval (`ReviewDrawer.tsx`).

---

## 4. Strategi Verifikasi
1. **Unit Tests (`supabase/functions/server/shared/projectWorkflow.test.ts`)**:
   - Menguji validasi 9 kolom Excel dan penolakan nilai `Final Score` di luar `0–100`.
   - Menguji hak akses unggah oleh HR ICF (`hr-unit` untuk unitnya dan `hr-strategic` lintas unit) serta penolakan unggah oleh karyawan biasa.
   - Menguji alur `Draft → Submit (HR ICF) → Pending-Approver 1 → Revision / Resubmit → Pending-Approver 2 → Validated` serta *mirror slot* `A1 + A2` untuk level Kepala Divisi.
   - Menguji rumus skor: mengambil nilai `Final Score` tertinggi dari multi-baris proyek (mis. baris 1 = `75`, baris 2 = `92`, baris 3 = `84` → skor modul = `92`), lalu dikalikan bobot modul (`15%` → `13.8%`, `10%` → `9.2%`).
2. **Build & Check**:
   - Menjalankan seluruh suite unit test, `pnpm build`, dan `git diff --check`.
