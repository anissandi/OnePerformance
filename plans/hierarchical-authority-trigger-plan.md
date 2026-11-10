# Rencana Standarisasi Trigger Filter Kewenangan Berjenjang Berbasis `Role` + `Groupings` & Tabel `User Groupings` per Unit Usaha

## Latar Belakang & Masalah
Nama jabatan (`Position / Jabatan`) untuk level struktural yang setara dapat berbeda-beda di setiap unit usaha (contoh: di `PT RSUP (Industry)` disebut **Kepala Bagian**, sedangkan di `PT RSUP (Perkebunan)` disebut **Mandor**, **Asisten Kebun**, atau **Askep**). Apabila sistem menebak level kewenangan dari teks nama `Jabatan` (regex kata `"divisi"`, `"departemen"`, `"bagian"`, dll.), maka jabatan dengan nomenklatur khas unit usaha seperti `Mandor` tidak akan dikenali pada level kewenangan yang tepat.

---

## Solusi Arsitektur: Penentuan Level Kewenangan 100% dari `Role` + `Groupings` & Tabel `User Groupings` per Unit

### 1. Resolusi `Groupings` dari Tabel `User Groupings` per Company Unit (`resolveEffectiveUserGrouping`)
- Di `src/app/store/authStore.ts`, tambahkan fungsi `resolveEffectiveUserGrouping(user: ManagedUser): UserGrouping` yang:
  1. Memeriksa terlebih dahulu tabel **User Groupings** milik unit usaha karyawan tersebut (`pa_group_rules_by_unit_v1` di `/hr/settings/user-management/grouping`) berdasarkan pencocokan nama `position` (`rule.position.toLowerCase() === user.position.toLowerCase()`).
     - Dengan demikian, apabila di unit `PT RSUP (Perkebunan)` jabatan `Mandor` telah dipetakan ke grup `Ka./Wa.Ka.Bagian` pada tab **User Groupings**, maka setiap karyawan dengan jabatan `Mandor` di unit tersebut otomatis memiliki grouping efektif `Ka./Wa.Ka.Bagian`.
  2. Jika tidak ditemukan aturan spesifik posisi di tab User Groupings unit tersebut, gunakan nilai kolom eksplisit `user.groupings` dari hasil Import Excel / User Management (`Operasional`, `Ka./Wa.Ka.Seksi`, `Ka./Wa.Ka.Bagian`, `Ka./Wa.Ka.Dept`, `Ka./Wa.Ka.Div ke atas`).

### 2. Matriks Penentuan Level Kewenangan Berjenjang (`resolveUserAuthorityLevel`) Tanpa Tebakan Teks Nama Jabatan
Hapus seluruh pengecekan regex terhadap string `user.position` di `resolveUserAuthorityLevel(user)` dan `resolvePortalPathForRole(role)` serta ganti dengan pemetaan deterministik murni dari **`user.role`** dan **`resolveEffectiveUserGrouping(user)`**:

| Prioritas | Kondisi (`Role` & `Effective Grouping`) | Level Kewenangan (`HierarchyAuthorityLevel`) | Cakupan Data yang Dapat Dilihat (Visibility Scope) |
| :--- | :--- | :--- | :--- |
| **1** | `role === "Administrator"` atau `role === "HR ICF"` atau `role === "HR Admin"` | `admin` | Seluruh karyawan & unit usaha di sistem |
| **2** | `role === "BOD"` | `bod` | Seluruh unit usaha dalam Group BOD |
| **3** | `role === "Director"` | `director_group` | Seluruh karyawan, transaksi, monitoring & summary pada semua unit usaha dalam Group-nya (contoh: 5 PT di **RSUP Group**) |
| **4** | `role === "GM"` | `gm_unit` | Seluruh karyawan, transaksi, monitoring & summary pada **Company Unit (`company`)**-nya |
| **5** | `role === "HR Unit"` | `hr_unit` | Seluruh karyawan pada **Company Unit (`company`)**-nya (sebagai Checker unit usaha) |
| **6** | `effectiveGrouping === "Ka./Wa.Ka.Div ke atas"` | `division` | Seluruh karyawan pada semua posisi, bagian, dan departemen di dalam **Divisi (`division`)**-nya pada unit usaha tersebut |
| **7** | `effectiveGrouping === "Ka./Wa.Ka.Dept"` | `department` | Seluruh karyawan pada semua posisi dan bagian di dalam **Departemen (`department`)**-nya pada divisi & unit usaha tersebut |
| **8** | `effectiveGrouping === "Ka./Wa.Ka.Bagian"` | `bagian` | Seluruh karyawan pada semua posisi di dalam **Bagian (`bagian`)**-nya (termasuk jika nama jabatannya adalah `Mandor`, `Kepala Bagian`, `Supervisor`, dll.) |
| **9** | `effectiveGrouping === "Ka./Wa.Ka.Seksi"` | `seksi` | Seluruh karyawan pada bagian/seksi yang sama yang berada di bawahnya atau di rantai `Reg No AP1`/`AP2`-nya |
| **10** | `effectiveGrouping === "Operasional"` (tanpa bawahan `AP1`/`AP2`) | `operational` | Hanya melihat datanya sendiri |

*(Catatan: Selain cakupan struktural pada tabel di atas, setiap pengguna yang tercatat sebagai `Reg No AP1` atau `Reg No AP2` bagi karyawan lain tetap otomatis dapat melihat seluruh bawahan langsung maupun bertingkat di rantai approval-nya).*

### 3. Sinkronisasi Otomatis Saat Import Excel (`/hr/settings/data-sync`) & Perubahan User Groupings (`/hr/settings/user-management/grouping`)
1. **Di `src/app/pages/hr/settings/DataSync.tsx`**:
   - Saat mengimpor Excel Data Karyawan, apabila kolom `Groupings` diisi pada Excel, gunakan nilai tersebut; apabila dikosongkan, cari terlebih dahulu `Jabatan` di tabel **User Groupings** milik Company Unit tujuan (`resolveGroupingForCompanyAndPosition(targetCompany, position)`).
2. **Di `src/app/pages/hr/settings/UserManagement.tsx`**:
   - Menambahkan tombol **"Sync Posisi dari Data Karyawan"** pada tab **User Groupings** (`/hr/settings/user-management/grouping`) sehingga setiap nama jabatan unik dari data karyawan yang diimpor pada unit usaha tersebut (mis. `Mandor`, `Asisten Kebun`, `Krani`, dll.) otomatis masuk ke tabel **User Groupings** unit tersebut.
   - Saat Administrator mengubah grup suatu posisi di tab **User Groupings** (mis. memetakan `Mandor` ke `Ka./Wa.Ka.Bagian`), sistem otomatis menyinkronkan properti `groupings` seluruh karyawan dengan jabatan tersebut di unit usaha terkait.

### 4. Pembaruan Dokumentasi Aturan (`AGENTS.md` & `guidelines/Guidelines.md`)
- Mencatat aturan bahwa penentuan level kewenangan berjenjang (`Direktur -> GM -> Divisi -> Departemen -> Bagian`) wajib mengacu pada kombinasi **`Role` + `Groupings` (dan tabel mapping `User Groupings` per Company Unit)**, bukan dari pencocokan teks nama `Jabatan`.

## File yang Akan Diubah
1. `src/app/store/authStore.ts` — Fungsi `resolveGroupingForCompanyAndPosition`, `resolveEffectiveUserGrouping`, `resolveUserAuthorityLevel` (bebas regex teks jabatan), `resolvePortalPathForRole`, dan `resolveUserAllowedModules`.
2. `src/app/pages/hr/settings/UserManagement.tsx` — Sinkronisasi otomatis perubahan mapping posisi di tab **User Groupings** ke `user.groupings` karyawan pada Company Unit tersebut, serta tombol sinkronisasi posisi dari daftar karyawan unit usaha ke tabel **User Groupings**.
3. `src/app/pages/hr/settings/DataSync.tsx` — Menggunakan `resolveGroupingForCompanyAndPosition` saat mengimpor Excel karyawan.
4. `AGENTS.md` & `guidelines/Guidelines.md` — Menambahkan aturan pemicu filter kewenangan berjenjang berbasis `Role` + `Groupings` & tabel `User Groupings` per unit usaha.

## Langkah Verifikasi
- Menjalankan `pnpm build` untuk memastikan kompilasi TypeScript/Vite berjalan bersih.
- Memastikan karyawan dengan nama jabatan unik unit usaha (seperti `Mandor` di `PT RSUP (Perkebunan)` yang memiliki `Groupings = "Ka./Wa.Ka.Bagian"`) otomatis mendapatkan filter kewenangan **Level Bagian** tanpa bergantung pada kata `"Bagian"` pada nama jabatannya.
