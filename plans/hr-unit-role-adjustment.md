# Rencana Penyesuaian Role HR Unit Usaha

## Tujuan & Konteks
Menyesuaikan perilaku login, visibilitas modul appraisal, menu **Approvals** (sebagai *Approver Checker*), serta batasan kewenangan akses Unit Usaha untuk pengguna dengan Role **`HR Unit`**:
1. **Modul Appraisal pribadi ditentukan murni oleh `User Groupings`**:
   - Contoh: Karyawan **FINA LORENZA ATIKA** (`Role: HR Unit`, `Groupings: Operasional`) saat login hanya melihat modul appraisal yang sesuai dengan group `Operasional`, yaitu:
     - `KPI (Setting/Measurement)` (termasuk `RCA` pada Measurement)
     - `SMART Goals (Setting/Measurement)`
     - `Appraisals Form`
     - `Project Outside Job Scope`
   - Modul `Managerial Skill`, `Inter-Departement Feedback`, dan `Management Interview` tidak muncul untuk group `Operasional`, dan baru muncul apabila `User Groupings` karyawan `HR Unit` tersebut mengizinkannya (mis. `Ka./Wa.Ka.Bagian`, `Ka./Wa.Ka.Dept`, atau `Ka./Wa.Ka.Div ke atas`).
2. **Menu `Approvals` Default untuk Role `HR Unit` (Approver Checker)**:
   - Role `HR Unit` secara default menampilkan menu **Approvals** (`Performance Appraisal Setting` & `Performance Appraisal Measurement`).
   - Jika `User Groupings` karyawan `HR Unit` adalah **`Operasional`**, maka di halaman **Approvals** modul yang terlihat **hanya modul Checker**:
     - `KPI` (Setting/Measurement)
     - `SMART Goals` (Setting/Measurement)
     - `RCA`
     Modul lainnya (`Appraisal Form`, `Managerial Skill`, `Project`, `Inter-Department Feedback`) disembunyikan.
   - Jika `User Groupings` karyawan `HR Unit` adalah **selain `Operasional`**, maka modul yang terlihat di halaman **Approvals** disesuaikan dengan `User Groupings`-nya (`allowedModules` dari grouping tersebut beserta modul Checker `KPI`, `SMART Goals`, `RCA`).
3. **Kewenangan Akses Terikat Filter Unit Usaha**:
   - Seluruh halaman yang diakses oleh Role `HR Unit` (`Approvals`, `Monitoring`, `Summary`, `Dashboard`, dll.) otomatis terikat dan terkunci pada filter **Unit Usaha (`activeUser.company`)** milik `HR Unit` tersebut.

---

## Rincian Implementasi Teknis

### 1. Penentuan Modul Appraisal Berdasarkan `User Groupings` (`src/app/store/authStore.ts`)
- Pada fungsi `resolveUserAllowedModules(user: ManagedUser)`:
  - Menghapus fallback khusus yang sebelumnya memaksa `user.role === "HR Unit"` dengan grouping `Operasional` menjadi `"Ka./Wa.Ka.Bagian"`.
  - Menggunakan `effectiveGrouping = resolveEffectiveUserGrouping(user)` secara konsisten untuk mengambil aturan modul dari `GROUP_RULES_BY_UNIT_KEY` (User Groupings per Unit Usaha) atau `defaultAllowedModulesForGrouping(effectiveGrouping)`.
  - Dengan demikian, `HR Unit` di group `Operasional` (seperti **FINA LORENZA ATIKA**) otomatis mendapatkan 4 modul:
    `["KPI (Setting/Measurement)", "SMART Goals (Setting/Measurement)", "Appraisals Form", "Project Outside Job Scope"]`.
- Menambahkan fungsi helper `getAllowedApprovalTypesForUser(user: ManagedUser, mode: "setting" | "checkin"): string[]`:
  - Jika `user.role === "HR Unit"`:
    - Bila `resolveEffectiveUserGrouping(user) === "Operasional"`, kembalikan tepat `["KPI", "SMART Goals", "RCA"]`.
    - Bila `resolveEffectiveUserGrouping(user) !== "Operasional"`, kembalikan daftar modul sesuai `resolveUserAllowedModules(user)` ditambah `["KPI", "SMART Goals", "RCA"]`.
  - Untuk role lain, kembalikan daftar modul standar sesuai mode (`setting` atau `checkin`).

### 2. Penyesuaian Sidebar & Default Access Management untuk `HR Unit` (`src/app/components/Sidebar.tsx` & `src/app/pages/hr/settings/AccessManagement.tsx`)
- Pada `src/app/pages/hr/settings/AccessManagement.tsx` (`DEFAULT_HR_UNIT`):
  - Menyelaraskan default permission `DEFAULT_HR_UNIT` agar sesuai peran `HR Unit` sebagai karyawan unit usaha + Approver Checker (`dashboard`, `profile`, `appraisal`, `approvals` [`approvals_pa_measurement`, `approvals_pa_setting`], `pa_monitoring`, `pa_summary`, `pa_setting`, `pa_measurement`, `history`, `documents`), tetap mengikuti perubahan jika diubah melalui Access Management.
- Pada `src/app/components/Sidebar.tsx`:
  - Memastikan untuk `HR Unit` (maupun role lainnya), sub-menu di bawah **My PA Setting & Measurement** / **Performance Appraisal Setting** / **Performance Appraisal Measurement** serta **Performance Appraisal Monitoring** memfilter item berdasarkan `allowedModules` dari `User Groupings` pengguna aktif:
    - `KPI` / `KPI Tracking` & `RCA` -> aktif jika `allowedModules.includes("KPI (Setting/Measurement)")`
    - `SMART Goals` -> aktif jika `allowedModules.includes("SMART Goals (Setting/Measurement)")`
    - `Appraisal Form` -> aktif jika `allowedModules.includes("Appraisals Form")`
    - `Project Outside Job Scope` -> aktif jika `allowedModules.includes("Project Outside Job Scope")`
    - `Managerial Skill` -> aktif jika `allowedModules.includes("Managerial Skill")`
    - `Inter-Department Feedback` -> aktif jika `allowedModules.includes("Inter-Departement Feedback")`
    - `Management Interview` -> aktif jika `allowedModules.includes("Management Interview")`

### 3. Filter Modul Approvals & Filter Unit Usaha untuk `HR Unit` (`src/app/pages/hr/Approvals.tsx`, `src/app/pages/supervisor/Approvals.tsx`, & Halaman Monitoring/Summary)
- Pada `src/app/pages/hr/Approvals.tsx` dan `src/app/pages/supervisor/Approvals.tsx`:
  - Menggunakan `getAllowedApprovalTypesForUser(activeUser, mainTab)` untuk menentukan:
    - Tab modul yang tampil pada `ModuleRouteNav`
    - Opsi dropdown filter `Approval Type`
    - Filter data baris tabel (`checkinData` & `settingData`) agar hanya menampilkan pengajuan dari modul yang diizinkan untuk `activeUser`.
  - Mengunci filter `Company / Unit Usaha` pada `lockedUnits` (`[activeUser.company, ...(activeUser.managedUnits ?? [])]`) ketika `activeUser.role === "HR Unit"`, serta memfilter data tabel agar hanya menampilkan karyawan dari Unit Usaha milik `HR Unit` tersebut (dan tetap menerapkan bypass Checker untuk pengajuan milik `HR Unit` sendiri).
- Pada halaman Monitoring di `/hr/monitoring/*` (`KPIMonitoring`, `SmartGoalsMonitoring`, `AppraisalFormMonitoring`, `ManagerialSkillMonitoring`, `ProjectMonitoring`, `ManagementInterviewMonitoring`):
  - Menggunakan `lockedUnits` dari `useAuthStore()` secara otomatis apabila prop `lockedUnits` tidak dikirim langsung, sehingga ketika `HR Unit` membuka halaman Monitoring, daftar karyawan dan dropdown filter Unit Usaha otomatis terkunci pada Unit Usaha miliknya (`activeUser.company`).

---

## Rencana Verifikasi
1. **Verifikasi Modul Appraisal Pribadi `HR Unit` berdasarkan `User Groupings`**:
   - Login sebagai karyawan `HR Unit` dengan `Groupings: Operasional` (contoh: FINA LORENZA ATIKA) -> pastikan modul yang muncul pada Sidebar, My Performance Appraisal, dan Dashboard hanya `KPI (Setting/Measurement)` (+ `RCA`), `SMART Goals (Setting/Measurement)`, `Appraisals Form`, dan `Project Outside Job Scope`.
   - Ubah `Groupings` ke `Ka./Wa.Ka.Bagian` -> pastikan `Managerial Skill` dan `Inter-Departement Feedback` ikut muncul.
2. **Verifikasi Menu & Modul `Approvals` pada `HR Unit`**:
   - Pastikan menu **Approvals** (`Performance Appraisal Measurement` & `Performance Appraisal Setting`) muncul secara default.
   - Saat `Groupings = Operasional`, pastikan tab dan filter modul di halaman **Approvals** hanya menampilkan `KPI`, `SMART Goals`, dan `RCA`.
   - Saat `Groupings` selain `Operasional`, pastikan tab dan filter modul di halaman **Approvals** menyesuaikan dengan `User Groupings`-nya.
3. **Verifikasi Filter Kewenangan Unit Usaha**:
   - Pastikan di `Approvals`, `Monitoring`, dan `Summary`, `HR Unit` hanya dapat memfilter dan melihat data karyawan dari Unit Usahanya sendiri.
4. **Build Verification**:
   - Jalankan `pnpm build` untuk memastikan tidak ada error TypeScript atau bundle.
