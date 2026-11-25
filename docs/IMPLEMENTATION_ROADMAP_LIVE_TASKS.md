# Catatan Eksekusi Tugas Terpadu (Live Production — Supabase + Backend API)

Seluruh poin di bawah wajib terhubung penuh ke backend (`api/pa-sync.js`, `supabase/functions/server/mainAppRoutes.tsx`) dan Supabase (`pa_*` tables, `pa_master_catalogs`, `pa_kv_state`, `pa-evidence` Storage), tanpa penyimpanan sementara `localStorage`-only.

---

## Batch 1 — LOGIN & CALIBRATION (6 Poin + 1 Poin Login)
- [x] **LOGIN.1**: Rename info sesi login 30 menit menjadi: `"Sesi login Anda telah berakhir karena tidak aktif di halaman One Performance, Silahkan login kembali."`
- [x] **CALIBRATION.1**: `/calibration/setting/group/:slug`:
  - Rename banner pending menjadi `"Calibration Setting (SOY) {{Group}} sudah disubmit dan sedang menunggu persetujuan Director."`
  - Tombol `Reset Status HC Awal Tahun (SOY)` dibuat **tidak aktif (disabled)** jika status sudah `Pending` (submitted) atau `Approved`.
  - Kunci penuh angka HC Awal Tahun (SOY) segera saat status `Submitted` (`Pending`) maupun `Approved` (simpan `beginningHC` / `groupSnapshot` saat submit) sehingga tidak berubah meskipun ada karyawan yang diarsipkan kemudian.
- [x] **CALIBRATION.2**: `/calibration/setting/group`: pada setiap tabel berikan warna *extra soft* berbeda pada baris (*alternating / tinted soft rows*) agar lebih hidup, serta setiap tag (filter, info) menggunakan warna-warna soft.
- [x] **CALIBRATION.3**: `/calibration/setting`: beri warna soft pada tab utama (`Group`, `Company Units`) beserta ikonnya, serta pada sub-tab di dalamnya (`HC Awal Tahun (SOY)`, `HC Akhir Tahun (EOY)`, `Summary`).
- [x] **CALIBRATION.4**: `/calibration/setting/group/:slug`, section `Perbandingan Share Quota — {{Group}} (SOY vs EOY)`: ubah filter `Level` menjadi mode **ikon berwarna** yang jika diklik memunculkan **anak filter ke samping** (tag berwarna untuk Unit Usaha saat memilih Division/Departement), dilengkapi tag **`Clear Filter`**.
- [x] **CALIBRATION.5**: `/approvals/calibration/setting`:
  - Hapus tag tombol `Grade Distribution (Bell Curve)` di bar atas karena grafik kurva sudah tampil langsung di halaman.
  - Sesuaikan warna Grade (`A+`, `A`, `B`, `C`, `D`, `E`) mengikuti standar warna Grade di `/settings/scores-calibration`.
- [x] **CALIBRATION.6**: `/approvals/calibration/setting`:
  - Pada tabel `Proporsi per Unit Usaha`, beri tag berwarna per baris `"Lihat Divisi"` yang jika diklik memunculkan tabel `Proporsi per Divisi` unit tersebut.
  - Pada tabel `Proporsi per Divisi`, beri tag berwarna per baris `"Lihat Departemen"` yang jika diklik memunculkan tabel `Proporsi per Departemen` divisi tersebut.
  - Secara default tabel `Proporsi per Divisi` & `Proporsi per Departemen` **tidak muncul** (hanya muncul saat tag diklik), dan urutkan baris dari **A–Z** untuk tabel Divisi & Departemen.

---

## Batch 2 — MASTER UNIT USAHA (`/settings/master/company`)
- [x] **MASTER_COMPANY.1**:
  - Tambahkan sub-menu **`Company`** di atas sub-menu **`KPI`** pada `/settings/master` (`Sidebar.tsx`, `Topbar.tsx`, `MenuManagement.tsx`, `AccessManagement.tsx`, `routes.tsx`).
  - Kolom tabel: `No. | Action | Company Group | ID Group | Abb.Group | Company Unit | ID Unit | Abb.Unit` (contoh: `1 | Add; Edit; Delete (icon) | Sambu Group | 1 | SG | PT Pulau Sambu (Jakarta) | 11 | PSJ`).
  - Simpan di Supabase (`pa_master_catalogs` key `master_company_units_v1` + `pa_kv_state`).
  - Jadikan sumber kebenaran dinamis (*single source of truth*) untuk daftar Group & Unit Usaha lintas modul, dan ketika terjadi perubahan nama Group / Unit Usaha pada halaman ini, otomatis propagasi pembaruan nama ke data terkait (`pa_users`, `calibration_group_settings_2026`, `calibration_hc_settings_2026`, workflow, dsb. termasuk di Supabase).

---

## Batch 3 — USER MANAGEMENT (`/settings/user-management`)
- [x] **USER_MGMT.1**: `/settings/user-management/users` urutan kolom: `Checklist | No | Action | Reg No | ID Employee | Name | Division | Departement | Role | Groupings | Status | Last Login` (format `DD/MM/YYYY HH:MM` terhubung ke pencatatan waktu login di database).
- [x] **USER_MGMT.2**: Hapus tab/segmented filter status (`Active/Inactive`) lama; susun toolbar dari paling kiri: tombol **`Add User`** -> `Searching` -> filter `Role` -> `Divisi` -> `Departement` -> `Groupings` -> `Status` -> `Show xx Entries`.
- [x] **USER_MGMT.3**: Saat checklist multi-user dipilih, selain `Delete / Archive` multi, tambahkan aksi ubah **`Groupings`** dan **`Role`** secara multi (tersinkron ke `pa_users` Supabase).
- [x] **USER_MGMT.4**: `/settings/user-management/grouping`: setelah sync posisi karyawan, kolom `Position / Jabatan` hanya menampilkan `Position / Jabatan` yang benar-benar ada pada **Unit Usaha** aktif tersebut, serta tambahkan filter **`Position / Jabatan`**.

---

## Batch 4 — INTER-DEPARTMENT FEEDBACK & DELEGASI (Take Over)
- [x] **IDF.1**: `/measurement/inter-department-feedback/tasks` (dan summary catatan penerima): validasi semua field teks Pemberi Feedback maupun Penerima Feedback minimal **4 kata** (contoh: `"saya sedang menjalankan tugas"`), tolak kata berulang berurutan (`"dan dan"` ditolak; kata berulang ber tanda hubung sah seperti `"masing-masing"` diperbolehkan), tolak simbol berulang & spasi berulang dalam kata, dan blokir daftar kata kasar terlarang (`Anjing`, `Babi`, `Setan`, `Monyet`, `Memek`, `Kontol`, `Jancok`, `Itil`, `Combi`, `Laso`, `Tai`, `Fuck You`, `Ngewe`, `Ewe`, `Ewek`, `Perawan`, `Perjaka`, `OYO`, `ML`, `Perkosa`, `Diperkosa`, `Ngentot`, `Kondom`, `Binal`, `Banci`, `Bencong`, `LGBT`, `Lesbi`, `Lesby`, `Pantat`, `Payu Dara`, `Tete` / `Payudara`).
- [x] **IDF.2**: `/measurement/inter-department-feedback` Pilih Pemberi Feedback: fitur **Ganti Pemberi Feedback** jika status masih `Menunggu Feedback` maksimal **3 kali**, dengan validasi lintas organisasi:
  - Role `Coordinator`, `HR Unit`, `Supervisor`, `Employee` -> tidak boleh satu **Departemen**
  - Role `Division` -> tidak boleh satu **Divisi**
  - Role `GM`, `vGM` -> tidak boleh satu **Unit Usaha**
  - Role `Director` (`DirectorNonOpr`) -> tidak boleh satu **Group**
- [x] **DELEGASI.1**: `/approvals/delegation` & `/settings/approval-management/delegation`: tambahkan fitur **`Take Over`** (kebalikan dari delegasi: atasan mengambil alih peran approval bawahannya yang minimal ber-role/level `Supervisor` ke atas, mis. Kepala Departemen take over Kepala Bagian yang sakit sehingga approval/assessment bawahan Kepala Bagian berjalan melalui atasan tersebut; tersimpan di Supabase).

---

## Batch 5 — MANAGERIAL SKILL & HISTORY APPROVAL (ADMIN / HR ICF)
- [x] **MGR_SKILL.1**: `/measurement/managerial-skill`:
  - Formula skor akhir = `Rata-rata (Evaluasi Pribadi Karyawan, Approver 1, Approver 2) × Bobot Modul` (di mana `Bobot Modul` diambil dinamis dari `/settings/scores-calibration`).
  - Ubah label `(20%) Nilai Total` di bagian atas & bawah menjadi `({{bobot}}) Nilai Rata-Rata`.
  - Di sisi Approver, sebelum klik Submit/Assessed, tampilkan **tabel skor hasil evaluasi** dengan konsep/format seperti evaluasi Approver di modul *Appraisal Form*.
  - Di sisi Owner form Managerial Skill, kunci penuh (tidak bisa edit/ubah nilai) apabila form sudah di-submit (kecuali berstatus Revision).
- [x] **HISTORY.1**: Khusus Role **`Administrator`** & **`HR ICF`**: pada tab **`Approval History`** di `/approvals/setting` & `/approvals/measurement`, munculkan seluruh riwayat Approval/Assessment dari **semua karyawan (semua Group & Unit Usaha)**; khusus modul **Appraisal Form** & **Managerial Skill**, saat di-*View* tampilkan rincian indikator nilai yang dipilih dari **Evaluasi Pribadi Karyawan**, **Evaluasi Approver 1**, dan **Evaluasi Approver 2**.

---

## Batch 6 — KPI (8 Poin) & DRAFT DATABASE PERSISTENCE
- [x] **KPI.1**: `/measurement/kpi-tracking` `Request Edit KPI Tracking` drawer -> `Pilih Bulan yang ingin diedit`: hanya aktifkan bulan yang sudah berstatus **`Validated`** (hijau); bulan belum disubmit (abu-abu) atau masih pending approval (kuning) bersifat *read-only* dengan tooltip `"status belum submit/dalam proses approval"`.
- [x] **KPI.2**: `/setting/kpi` tombol `Edit [Target] Request`: pindahkan ke atas tabel KPI paling kanan, samakan posisi/ukuran/warna/desain dengan tombol `Edit Request` di `/measurement/kpi-tracking`, dan hanya muncul jika status KPI Setting sudah **`Validated`**.
- [x] **KPI.3**: Semua KPI Setting (`Group`, `Unit`, `Personal`): fitur pemindah urutan sub-section/item KPI ke **Atas / Bawah** (drag atau tombol panah atas/bawah, termasuk lintas section); jika perpindahan membuat total bobot section melebihi bobot section, kolom bobot item yang dipindahkan disorot **merah** agar user menyesuaikan maksimal sisa bobot section.
- [x] **KPI.4**: Lampiran KPI yang di-upload (baik di sisi Owner maupun Approver) **tidak auto-open preview/PDF**, melainkan dibuka secara manual melalui tombol **Open / Lihat**.
- [x] **KPI.5**: Setelah KPI Setting di-submit, hapus tombol **`Edit Request`** lama (beserta state/handler/alurnya) karena sudah digantikan oleh **`Edit [Target] Request`** saat Validated.
- [x] **KPI.6**: Semua KPI Setting (`Group`, `Unit`, `Personal`) modal `Add New KPI` -> tab `Sub Section`: beri tanda garis miring `"/"` di antara field `Satuan` & `Periode`, hapus opsi placeholder `-Periode-` dan default-kan ke **`Bulan`**, urutkan kedua field sesuai abjad (**A–Z**) dengan simbol **`%`** tetap paling atas pada `Satuan`.
- [x] **KPI.7**: Semua KPI Setting (`Group`, `Unit`, `Personal`) modal `Add New KPI` -> tab `Sub Section`: tampilkan tag toggle **`Active / Inactive`** per bulan secara default pada `Monthly Target` **termasuk saat `Periode Tracking = Bulan`**; jika suatu bulan di-set `Inactive`, field bulan tersebut otomatis *read-only* di KPI Tracking dan tidak memicu RCA.
- [x] **KPI.8**: Polaritas **`Stabilize`**: toleransi rentang **`±5%`** dari target tidak memicu RCA (contoh: target `150`, aktual `147` -> selisih `-2%` dalam batas `±5%` sehingga **tidak memicu RCA**), namun perhitungan `% Pencapaian` tetap menggunakan rumus normal (`147 / 150 = 98%`).
- [x] **DRAFT.1**: Pastikan seluruh penyimpanan **Draft** di KPI (Setting & Measurement), SMART Goals (Setting & Measurement), Appraisal Form, Managerial Skill, RCA, dan Inter-Department Feedback tersimpan langsung ke **database Supabase** (`pa_kpi_settings`, `pa_kpi_trackings`, `pa_smart_goals`, `pa_appraisal_forms`, `pa_managerial_skills`, `pa_kv_state`) dan dihidrasi saat pindah browser/perangkat.

---

## Batch 7 — SMART GOALS MEASUREMENT (`/measurement/smart-goals` — 18 Poin)
- [x] **SG.1**: Ubah judul section `Target vs Actual` menjadi **`Goals Realization & Achievement Status`**.
- [x] **SG.2**: Kolom tabel `Goals Realization & Achievement Status`: `Goals | Goals Specific | Realization Goals Status | Target | Aktual | % Achievement | Achievement Target Status`.
- [x] **SG.3**: `Realization Goals Status` (`Terwujud` / `Tidak Terwujud`):
  - Jika `Terwujud`: ada fitur upload evidence.
  - Jika `Tidak Terwujud`: wajib pilih alasan (`Faktor Internal` / `Faktor Eksternal`); jika `Eksternal` upload evidence **mandatory**, jika `Internal` upload evidence **opsional**.
- [x] **SG.4**: `Achievement Target Status` (`Tercapai` / `Tidak Tercapai`):
  - Jika `Tercapai`: ada fitur upload evidence.
  - Jika `Tidak Tercapai`: pilih alasan (`Faktor Internal` / `Faktor Eksternal`), upload evidence opsional + info bahwa tanpa evidence / evidence tidak sesuai maka skor maksimal pada goal ini adalah **`20%`**.
- [x] **SG.5**: Jika `Realization Goals Status = Tidak Terwujud` -> otomatis `% Achievement = 0%` dan `Achievement Target Status = Tidak Tercapai`.
- [x] **SG.6**: Jika `% Achievement = 100%` (dan `Terwujud`) -> otomatis `Achievement Target Status = Tercapai`.
- [x] **SG.7**: Jika `% Achievement < 100%` -> otomatis `Achievement Target Status = Tidak Tercapai`.
- [x] **SG.8**: `Realization Goals Status` otomatis **`Terwujud`** jika seluruh item `Execution Plan | Attainable` pada goal tersebut berstatus `Selesai`.
- [x] **SG.9**: `Realization Goals Status` otomatis **`Tidak Terwujud`** jika seluruh item `Execution Plan | Attainable` pada goal tersebut berstatus `Belum Dilaksanakan` atau `Batal`.
- [x] **SG.10**: Sesuaikan kartu **`Status Progress Keseluruhan`** mengikuti status realisasi & pencapaian baru.
- [x] **SG.11**: Sesuaikan tampilan pada seluruh tahap Approval (`Check`, `Approval 1`, `Approval 2`, `Validate`).
- [x] **SG.12–18**: Aturan rentang skor penilaian Approver per Goal + checkbox **`Evidence Tidak Sesuai`**:
  - `Tidak Terwujud` & `% Achievement = 0%` -> skor maks **`0%`** (0%).
  - `Terwujud` & `% Achievement < 30%` -> skor **`0% – 20%`** (maks `20%`).
  - `Terwujud` & `% Achievement 30%–49%`: dengan evidence sah -> **`20% – 40%`**; tanpa evidence / evidence tidak sesuai -> maks **`20%`**.
  - `Terwujud` & `% Achievement 50%–69%`: dengan evidence sah -> **`41% – 60%`**; tanpa evidence / evidence tidak sesuai -> maks **`20%`**.
  - `Terwujud` & `% Achievement 70%–90%`: dengan evidence sah -> **`61% – 80%`**; tanpa evidence / evidence tidak sesuai -> maks **`20%`**.
  - `Terwujud` & `% Achievement > 90%`: dengan evidence sah -> **`81% – 100%`**; tanpa evidence / evidence tidak sesuai -> maks **`20%`**.
  - Sediakan info & checkbox **`Evidence Tidak Sesuai`** pada kolom `Achievement Target Status` bagi Approver untuk membatasi skor maksimal `20%` bila lampiran tidak relevan.
