# Rencana Penyeragaman URL / Route / Path Lintas-Role Tanpa Error

## Tujuan & Konteks
Menyeragamkan dan melengkapi seluruh URL / route / path pada `src/app/routes.tsx`, `src/app/components/Sidebar.tsx`, dan `src/app/pages/hr/settings/MenuManagement.tsx` agar setiap menu dan sub-menu yang di-*allow* melalui **Access Management** maupun **User Groupings** dapat dibuka oleh role mana pun (`Administrator`, `HR ICF`, `HR Unit`, `BOD`, `Director`, `GM`, `Supervisor`, `Employee`, maupun role custom) tanpa pernah jatuh ke halaman `Placeholder` ("Coming Soon"), error rute `:tab`, atau berpindah portal secara tidak sengaja.

---

## Temuan Masalah Rute Saat Ini
1. **Rute `:tab` yang belum terdaftar pada `/employee`**:
   - `/employee/setting/kpi` menggunakan `SupervisorSettingKPIPage` yang memakai `useRouteTab` (`setting/kpi/:tab`), namun `/employee/setting/kpi/:tab` belum terdaftar di `routes.tsx` sehingga klik tab KPI pada `/employee` jatuh ke `Placeholder`.
2. **Perbedaan penamaan path `approvals` vs `appraisals` pada `/supervisor`**:
   - Di `/hr` dan `/bod` path setting approval adalah `approvals/setting` dan `approvals/management-interview`, sedangkan di `/supervisor` tertulis `appraisals/setting` dan `appraisals/management-interview`.
3. **Menu lintas-role yang belum memiliki route di semua portal (`/hr`, `/supervisor`, `/employee`, `/bod`)**:
   - Ketika suatu role diberi akses menu tambahan di **Access Management** (misalnya `Employee` diberi akses `Approvals`, `Monitoring`, `Summary`, atau `History`; atau `Administrator` diberi akses `My Performance Appraisal`, `PA Setting`, `PA Measurement`; atau `HR Unit` / `Supervisor` diberi akses `Evidence` / `Setting`), sejumlah path belum terdaftar di portal masing-masing atau harus melompat antar-portal (`/hr` <-> `/supervisor` <-> `/bod` <-> `/employee`).
4. **Ketergantungan `window.location.pathname` di beberapa komponen halaman**:
   - `FeedbackApprovalsPage.tsx` memeriksa `location.pathname.startsWith("/supervisor/")` untuk menentukan `reviewerRole`.

---

## Desain Pemetaan URL / Route Kanonik per Menu

| Menu / Sub-Menu | Path Kanonik per Portal (`/${portal}` = `/hr`, `/supervisor`, `/employee`, `/bod`) |
|---|---|
| **Analytics Dashboard** | `/hr` (index HR), `/bod` (index BOD), serta `/${portal}/analytics` |
| **Dashboard** | `/supervisor` (index Supervisor/GM/HR Unit), `/employee` (index Employee), serta `/${portal}/dashboard` & `/${portal}/dashboard/:tab` |
| **My Profile** | `/${portal}/profile` & `/${portal}/profile/:tab` |
| **My Performance Appraisal** | `/${portal}/appraisal` & `/${portal}/appraisal/:tab` |
| **Performance Appraisal Setting** | `/${portal}/setting`, `/${portal}/setting/kpi` (+ `/:tab`), `/${portal}/setting/smart-goals`, `/${portal}/setting/project`, `/${portal}/setting/management-interview` |
| **Performance Appraisal Measurement** | `/${portal}/measurement`, `/${portal}/measurement/kpi-tracking`, `/${portal}/measurement/rca`, `/${portal}/measurement/smart-goals`, `/${portal}/measurement/smart-goals-review`, `/${portal}/measurement/appraisal-form`, `/${portal}/measurement/project-outside`, `/${portal}/measurement/managerial-skill`, `/${portal}/measurement/inter-department-feedback` (+ `/:tab`), `/${portal}/measurement/management-interview` |
| **Approvals** | `/${portal}/approvals`, `/${portal}/approvals/measurement` (+ `/:tab`), `/${portal}/approvals/measurement/inter-department-feedback`, `/${portal}/approvals/setting` (+ `/:tab`), `/${portal}/approvals/management-interview`, `/${portal}/approvals/calibration`, `/${portal}/settings/kpi` (+ `/:tab`), `/${portal}/settings/open-lock` (+ `/:tab`) *(beserta alias `appraisals/*` di `/supervisor` untuk kompatibilitas)* |
| **Performance Appraisal Monitoring** | `/${portal}/monitoring/kpi`, `/${portal}/monitoring/smart-goals`, `/${portal}/monitoring/appraisal-form`, `/${portal}/monitoring/managerial-skill`, `/${portal}/monitoring/project`, `/${portal}/monitoring/management-interview`, `/${portal}/monitoring/inter-department-feedback` |
| **Performance Appraisal Summary** | `/${portal}/summary` |
| **Calibration** | `/${portal}/calibration/setting`, `/${portal}/calibration/verification`, `/${portal}/calibration/adjustment` (+ `/:tab`), `/${portal}/calibration/team-performance`, `/${portal}/calibration/management-interview` |
| **PA Cycle History** | `/${portal}/history` |
| **Documents** | `/${portal}/documents` & `/${portal}/documents/:tab` |
| **Evidence** | `/${portal}/evidence/kpi-tracking`, `/${portal}/evidence/rca`, `/${portal}/evidence/smart-goals`, `/${portal}/evidence/management-interview` |
| **Management Interview** | `/${portal}/management-interview/assessment`, `/${portal}/management-interview/invitation` |
| **Management Override** | `/${portal}/override` & `/${portal}/override/:tab` |
| **Setting** | `/${portal}/settings/master/kpi`, `/${portal}/settings/master/appraisal-form`, `/${portal}/settings/master/managerial-skill`, `/${portal}/settings/scores-calibration`, `/${portal}/modules`, `/${portal}/settings/cycle`, `/${portal}/settings/approval-management` (+ `/:tab`), `/${portal}/settings/user-management` (+ `/:tab`), `/${portal}/settings/access-management`, `/${portal}/settings/menu-management`, `/${portal}/settings/data-sync`, `/${portal}/settings/audit-trail` |

---

## Rincian Implementasi Teknis

### 1. Lengkapi Seluruh Route Lintas-Portal di `src/app/routes.tsx`
- Mendaftarkan seluruh route kanonik di atas pada keempat pohon route (`/hr`, `/supervisor`, `/employee`, `/bod`) beserta parameter `:tab`-nya, sambil mempertahankan komponen spesifik tiap role (mis. `StaffMyPA` & `EmployeeSettingKPIPage` untuk `/employee`, `BOD*` dengan `lockedUnits={BOD_UNITS}` untuk `/bod`, dan `Supervisor*` untuk `/supervisor`).
- Menjaga alias legacy seperti `/supervisor/appraisals/setting` agar tetap berfungsi.

### 2. Seragamkan Path Link Menu di `src/app/components/Sidebar.tsx` & `src/app/pages/hr/settings/MenuManagement.tsx`
- Menggunakan prefix portal aktif (`/${portal}/...`) secara konsisten untuk seluruh item menu dan sub-menu di `Sidebar.tsx` sehingga:
  - `Analytics Dashboard` -> `/hr` (pada portal HR), `/bod` (pada portal BOD), atau `/${portal}/analytics`
  - `Dashboard` -> `/supervisor` (pada portal Supervisor/GM/HR Unit), `/employee` (pada portal Employee), atau `/${portal}/dashboard`
  - Seluruh sub-menu (`Approvals`, `PA Setting`, `PA Measurement`, `PA Monitoring`, `Calibration`, `Evidence`, `Setting`, `Profile`, `History`, `Documents`) tetap berada di bawah prefix portal aktif pengguna tanpa melompat portal.
- Menyelaraskan tampilan path informasi di `MenuManagement.tsx` agar mencerminkan pola route kanonik yang digunakan semua role.

### 3. Penyesuaian `src/app/pages/shared/FeedbackApprovalsPage.tsx`
- Memastikan penentuan `role` (`approver1` vs `approver2`) di `FeedbackApprovalsPage.tsx` memeriksa prefix `/supervisor` dan `/employee` sebagai `approver1` serta `/hr` dan `/bod` sebagai `approver2`.

---

## Rencana Verifikasi
1. Verifikasi seluruh path di `Sidebar.tsx` untuk setiap role (`Administrator`, `HR ICF`, `HR Unit`, `BOD`, `Director`, `GM`, `Supervisor`, `Employee`) memiliki definisi route yang cocok di `src/app/routes.tsx` (termasuk route `:tab`).
2. Jalankan `pnpm build` untuk memastikan tidak ada error TypeScript maupun bundling.
