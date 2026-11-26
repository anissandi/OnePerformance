# Rencana Validasi Akses Data Tim Berbasis Rantai Approval Berkaitan (`Reg No AP1 / AP2`) & Anti-Peer Isolation

## 1. Tujuan & Ringkasan Kebijakan
Memperketat mekanisme visibilitas dan hak akses data tim pada halaman **`/summary`**, **`/monitoring/*`**, **`/calibration/team-performance`**, dan **`Appraisal Analytics`** agar:
1. **Berbasis Rantai Approval Berkaitan (Langsung & Tidak Langsung)** untuk **seluruh level jabatan termasuk `GM / VGM` dan `Director`**, kecuali role global **`Administrator` (`HR Admin`), `HR ICF`, dan `BOD`**.
   - Contoh yang didukung penuh: Jika **Manager Div** adalah `AP2` dari **Manager Dept B**, **Wakil Manager Div** adalah `AP1` dari **Manager Dept B**, dan **Manager Dept B** adalah `AP2` dari **Kepala Shift**, maka **Wakil Manager Div** maupun **Manager Div** **dapat melihat data Kepala Shift** karena terhubung dalam rantai approval tidak langsung (`Wakil Manager Div -> Manager Dept B -> Kepala Shift`).
   - Sebaliknya, karyawan lain (termasuk sesama Wakil Manager Div lain, Manager Dept lain, atau staf di Divisi/Departemen yang sama) yang **tidak memiliki hubungan approval langsung maupun tidak langsung** ke Kepala Shift **tidak dapat melihat atau mengakses** data Kepala Shift tersebut.
2. **Menutup Celah Saling Lihat Sesama Posisi / Level Setara Tanpa Bagian (Anti-Peer Guard)**:
   - Menghapus pembukaan akses otomatis yang sebelumnya hanya mengandalkan kesamaan nama `Unit Usaha`, `Divisi`, `Departemen`, atau `Bagian`.
   - Menambahkan pengaman berlapis: dua karyawan dengan **Posisi/Jabatan yang sama** atau **Level Grouping setara/lebih tinggi (`targetRank >= myRank`)** di Departemen/Divisi yang sama (termasuk ketika kolom **`Bagian` kosong / `-`**) **diblokir dari saling melihat**, **kecuali** salah satu tercatat secara eksplisit sebagai **Approver Langsung (`Reg No AP1` atau `Reg No AP2`, hop = 1)** dari yang lain.
3. **Aturan Khusus HR Checker (`HR Unit` / `isHrUnitChecker`)**:
   - Apabila seorang HR Checker **tidak memiliki hubungan Rantai Approval (Langsung maupun Tidak Langsung)** terhadap karyawan lain, maka ia **tidak dapat melihat data tim karyawan lain** di `/summary`, `/monitoring/*`, maupun `/calibration/team-performance` (hanya melihat dirinya sendiri pada modul pribadi).
   - Pada halaman **`Appraisal Analytics`**, HR Checker **tetap dapat melihat agregat count** sesuai Unit Usahanya sendiri maupun multi-unit usaha tempat ia ditugaskan sebagai HR Checker (`checkerUnits` / `canCheckerHandleCompanyUnit`).
   - Pada menu **`/approvals`** dan daftar tugas pemeriksaan di **`Dashboard`**, fungsi pemeriksaan tahap **Check** untuk pengajuan KPI & SMART Goals di unit checker-nya tetap berjalan normal tanpa terganggu.

---

## 2. Analisis Akar Masalah Saat Ini
1. **`getAuthorizedSubordinates` di `src/app/store/authStore.ts` (baris 988–1166)** masih membuka akses berbasis kesamaan atribut organisasi (`director_group`, `gm_unit`, `vgm_unit`, `hr_unit`, `division`, `department`, `bagian`, serta `hasMultiScope`) meskipun tidak ada ikatan rantai approval `Reg No AP1` / `Reg No AP2`.
2. **Celah perbandingan rank peer di `src/app/store/authStore.ts` (baris 1089 & 1094)** hanya memblokir `targetRank > myRank` (bukan `>=`) ketika string `role` berbeda tipis, sehingga rekan satu departemen dengan posisi sama atau grouping setara tanpa `Bagian` dapat saling melihat.
3. **`getEffectiveLockedUnitsForUser` di `src/app/store/authStore.ts` (baris 2275–2316)** mengunci `strictOwnUnits` ke unit sendiri tanpa menyertakan unit dari bawahan sah di rantai approval lintas unit usaha, yang dapat memotong tampilan bawahan sah lintas unit pada filter unit.
4. **`getScopedFilterOptionsForUser` di `src/app/store/authStore.ts` (baris 1365–1424)** menggabungkan `checkerPool` ke daftar opsi filter umum yang juga dipakai oleh `/summary`, sehingga dropdown filter HR Checker di `/summary` menampilkan divisi/departemen di luar rantai approval-nya.
5. **`SupervisorMonitoringManagementInterview` di `src/app/pages/supervisor/monitoring/ManagementInterviewMonitoring.tsx` (baris 777–835)** membaca seluruh `schedEntries` tanpa memfilter peserta terhadap cakupan `getAuthorizedSubordinates(activeUser)`.

---

## 3. Rancangan Perubahan Teknis per File

### A. `src/app/store/authStore.ts`
1. **Refaktor Penelusuran Rantai Approval (`getApprovalChainDistances`)**:
   - Buat helper internal ter-memoisasi `getApprovalChainDistances(user: ManagedUser, allUsers: ManagedUser[]): Map<string, number>` yang menggunakan graf ketetanggaan ketat `getApproverAdjacencyForUsers(allUsers)` (berbasis `Reg No` & `Employee ID`, fallback nama hanya jika 100% unik tunggal dan tidak bertabrakan dengan ID siapa pun, serta **tanpa** menyertakan Delegation/Take Over):
     - Menyimpan jarak hop minimum untuk setiap bawahan (`hop = 1` untuk bawahan langsung di mana `user` adalah `AP1`/`AP2` langsung; `hop >= 2` untuk bawahan tidak langsung melalui rantai berjenjang).
   - Pertahankan fungsi publik `getTransitiveApproverSubordinateIds(user, allUsers)` yang mengembalikan `Set<string>` dari kunci `getApprovalChainDistances(...)` agar kompatibel dengan pemanggil lain.
2. **Perombakan `getAuthorizedSubordinates(user, allUsers)`**:
   - **Role Global**: Hanya `isAdminOrHrIcfRole(user.role)` (`Administrator`, `HR Admin`, `HR ICF`) dan `user.role === "BOD"` yang melihat seluruh karyawan aktif (atau sesuai batasan `getRoleAllowedCompanyUnits(user.role)` jika dikonfigurasi di Access Management).
   - **Seluruh Role Lainnya (`Director`, `DirectorNonOpr`, `GM`, `VGM`, `Coordinator`, `Division`, `Departement`, `HR Unit`, `Supervisor`, `Employee`, dsb.)**:
     - Hapus seluruh fallback pembuka akses otomatis berbasis kesamaan Group / Unit Usaha / Divisi / Departemen / Bagian maupun `hasMultiScope`.
     - Seorang `target` masuk dalam hasil `getAuthorizedSubordinates(user)` **hanya jika**:
       1. `target` adalah `user` sendiri (`isSelf`), **ATAU**
       2. `hop = chainDistances.get(target.employeeId.toLowerCase())` terdefinisi (`hop >= 1`), **DAN** lolos 2 pengaman berikut:
          - **Anti-Upstream Guard (`!isUpstreamApprover`)**: `target` bukan `AP1`/`AP2` langsung dari `user` (`!doesUserMatchApproverRef(target, user.regNoAp1, allUsers) && !doesUserMatchApproverRef(target, user.regNoAp2, allUsers)`), mencegah kebocoran terbalik jika ada siklus data di Excel.
          - **Anti-Peer Guard (Sesama Posisi / Level Setara)**:
            Jika `hop > 1` (hubungan tidak langsung), periksa apakah `target` merupakan rekan sejawat/setara di lingkup yang sama:
            - `samePosition = Boolean(normOrgName(user.position) && normOrgName(user.position) === normOrgName(target.position))`
            - `sameOrHigherTier = targetRank >= myRank`
            - `sameDept = normOrgName(user.company) === normOrgName(target.company) && normOrgName(user.department) === normOrgName(target.department)`
            Apabila `(sameDept && (samePosition || sameOrHigherTier))`, blokir akses (`return false`). Apabila `hop === 1` (`user` tercatat eksplisit sebagai `Reg No AP1` atau `Reg No AP2` langsung dari `target`), tetap diizinkan sesuai kebijakan pengecualian `AP1/AP2` langsung.
   - Perbarui `userMemoKey` agar cache selalu sinkron terhadap perubahan data user & rantai `regNoAp1`/`regNoAp2`.
3. **Penyesuaian `getScopedFilterOptionsForUser(user, allUsers, opts?: { includeCheckerScope?: boolean })`**:
   - Secara default (`includeCheckerScope = false`), daftar opsi filter (`units`, `divisions`, `departments`, `bagians`, `positions`) **hanya** dibangun dari `[user, ...getStrictSubordinateUsers(user, allUsers)]`, sehingga di `/summary` HR Checker yang tidak punya bawahan rantai approval tidak melihat daftar divisi/departemen unit lain.
   - Hanya ketika dipanggil dari halaman pemeriksaan `/approvals` (`includeCheckerScope: true`), `checkerPool` disertakan agar HR Checker dapat memfilter pengajuan yang sedang diperiksanya.
4. **Penyesuaian `getEffectiveLockedUnitsForUser(user, allUsers)`**:
   - Untuk user non-Admin/HR ICF/BOD, himpunan `lockedUnits` disusun dari `user.company`, `authorizedUnits` (unit usaha dari bawahan sah di rantai approval `getAuthorizedSubordinates`), serta `checkerUnits` khusus bila user adalah HR Checker — sehingga bawahan sah di rantai approval lintas unit usaha tidak pernah terpotong oleh filter unit, namun karyawan di luar rantai approval tetap tidak pernah masuk karena data dasarnya sudah dikunci oleh `getAuthorizedSubordinates`.

### B. Halaman Target Visibilitas Tim
1. **`/summary` (`src/app/pages/shared/PerformanceAppraisalSummary.tsx`)**:
   - Pastikan semua viewer non-global (`!isGlobalViewer`, termasuk `Director`, `GM`, `VGM`, `HR Unit`, `Division`, `Departement`, `Supervisor`) disaring ketat menggunakan `supervisorAllowedIds` dari `getAuthorizedSubordinates(activeUser)` (tidak ada bypass role).
   - Gunakan `getScopedFilterOptionsForUser(activeUser)` (tanpa `checkerPool`) agar dropdown filter Unit/Divisi/Departemen hanya memuat cakupan rantai approval milik user tersebut.
2. **`/monitoring/*` (`src/app/pages/hr/monitoring/monitoringData.ts` & `src/app/pages/supervisor/monitoring/ManagementInterviewMonitoring.tsx`)**:
   - Di `monitoringData.ts`: `getMonitoringEmployees()` dan `getSupervisorScopedMonitoringEmployees()` sudah bertumpu pada `getAuthorizedSubordinates(activeUser, users)` untuk semua non-`Administrator`/`HR ICF`/`BOD`; perbarui signature cache `_cachedMonSig` & `_cachedSupMonSig` agar ikut memperhitungkan revisi epoch otorisasi sehingga perubahan rantai `AP1/AP2` langsung tercermin.
   - Di `SupervisorMonitoringManagementInterview` (`src/app/pages/supervisor/monitoring/ManagementInterviewMonitoring.tsx`): filter `schedEntries` untuk viewer non-global agar hanya menampilkan jadwal interview di mana user aktif tercatat sebagai salah satu `interviewers` ATAU minimal satu peserta (`addedUsers` / `otherUsers`) berada dalam `getAuthorizedSubordinates(activeUser)`. Juga perbaiki subjudul statis `TEAM_UNIT · TEAM_DIV` menjadi unit & divisi dinamis `activeUser`.
3. **`/calibration/team-performance` (`src/app/pages/supervisor/Calibration.tsx`)**:
   - `buildLiveSupervisorTeamMembers()` menggunakan `getStrictSubordinateUsers(activeUser)` (yaitu `getAuthorizedSubordinates` tanpa diri sendiri). Tambahkan listener penyegaran pada event `pa-auth-updated` dan `pa-employees-imported` agar tabel Team Performance selalu reaktif terhadap pembaruan data karyawan/approver.
4. **`Appraisal Analytics` (`src/app/pages/hr/AnalyticsDashboard.tsx`)**:
   - Untuk `isGlobalViewer` (`Administrator`, `HR ICF`, `BOD`): tetap melihat cakupan global / `globalLockedUnits`.
   - Untuk `isCheckerRole` (`role === "HR Unit"` atau `Boolean(scopeUser.isHrUnitChecker)`): tetap menggunakan `canCheckerHandleCompanyUnit(scopeUser, u.company) || authorizedIds.has(u.employeeId.toLowerCase())` sehingga HR Checker (baik 1 unit maupun multi-unit usaha di `checkerUnits`) tetap melihat agregat **count** pada `Appraisal Analytics` sesuai unit usaha checker-nya.
   - Untuk seluruh role lainnya (termasuk `Director`, `GM`, `VGM`, `Division`, `Departement`, `Supervisor`, `Employee`): `allManagedActiveUsers` murni difilter oleh `authorizedIds` dari `getAuthorizedSubordinates(scopeUser, rawUsers)` (hanya dirinya sendiri + rantai approval langsung & tidak langsung).
5. **`/approvals` (`src/app/pages/hr/Approvals.tsx` & `src/app/pages/supervisor/Approvals.tsx`)**:
   - Panggil `getScopedFilterOptionsForUser(activeUser, undefined, { includeCheckerScope: true })` agar fungsi pemeriksaan tahap **Check** oleh HR Checker tetap memiliki opsi filter unit/divisi pada halaman Approvals tanpa membocorkan data ke `/summary` atau `/monitoring`.

---

## 4. Skenario Pengujian & Verifikasi
1. **Kasus Rantai Approval Tidak Langsung (Wakil Manager Div -> Manager Dept B -> Kepala Shift)**:
   - Wakil Manager Div (`AP1` dari Manager Dept B) melihat Manager Dept B (hop 1) dan Kepala Shift (hop 2).
   - Wakil Manager Div lain / Manager Dept A di divisi yang sama yang tidak berada di rantai `AP1/AP2` Kepala Shift **tidak** melihat Kepala Shift di `/summary`, `/monitoring`, `/calibration/team-performance`, maupun `Appraisal Analytics`.
2. **Kasus Posisi Sama, Departemen Sama, Tanpa Bagian (`Bagian = ""` / `"-"`)**:
   - Dua karyawan sejawat tidak saling melihat satu sama lain (masing-masing hanya melihat dirinya sendiri + bawahannya sendiri jika ada), kecuali salah satu memang ditunjuk eksplisit sebagai `Reg No AP1` / `Reg No AP2` langsung dari rekannya.
3. **Kasus GM / VGM & Direktur**:
   - Hanya melihat karyawan yang bermuara ke rantai approval `AP1/AP2` miliknya (langsung maupun berjenjang).
4. **Kasus HR Checker (1 Unit & Multi-Unit Usaha) Tanpa Rantai Approval**:
   - `/summary` & `/monitoring/*`: hanya tampil dirinya sendiri, tidak bisa melihat karyawan lain.
   - `/calibration/team-performance`: `0` anggota tim.
   - `Appraisal Analytics`: tetap menampilkan agregat count dari unit usaha / multi-unit usaha checker-nya.
   - `/approvals`: tetap dapat memproses tahap **Check** untuk unit usaha checker-nya.
5. **Verifikasi Teknis**:
   - Jalankan `./node_modules/.bin/tsc --noEmit` (memastikan 0 error TypeScript di seluruh `src/`).
   - Jalankan `npm run build` (memastikan bundel produksi berhasil dibangun tanpa kendala).
