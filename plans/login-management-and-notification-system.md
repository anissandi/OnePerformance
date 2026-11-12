# Rencana Implementasi Fitur Login Management (OTP & Password) dan Sistem Notifikasi Terpadu

## Ringkasan Tujuan
Membangun dua modul utama secara *end-to-end*:
1. **Bagian A — Login Management per Unit Usaha (`/settings/user-management`), Alur Login Password & OTP Multi-Channel, Wajib Ganti Password Default, Lockout 5x Percobaan, Reset Password, & Ganti Password di Header**.
2. **Bagian B — Section Notification di `/dashboard/my` (Menggantikan Performance Appraisal Feedback), Tag `"See all Notification"` di Bell Header, Retensi 30 Hari & Aturan Clear Unread, serta Menu Setting `Notification` (`Auto Notification` & `Notification Broadcast`)**.

---

## A. Rincian Implementasi Login Management & Autentikasi

### 1. Tab `Login Management` di `/hr/settings/user-management` (`src/app/pages/hr/settings/UserManagement.tsx` & `src/app/store/loginManagementStore.ts`)
- Menambahkan tab ke-3 pada halaman User Management per Unit Usaha (`selectedCompany`): **`Login Management`** (`useRouteTab(["users", "grouping", "login"])`).
- Menyediakan konfigurasi metode login per Unit Usaha (`UnitLoginConfig`):
  - Pilihan metode:
    - **`OTP Telegram`**
    - **`OTP WhatsApp`**
    - **`OTP Email`**
    - **`Password`**
  - **Aturan Kombinasi**:
    - Metode OTP (`OTP Telegram`, `OTP WhatsApp`, `OTP Email`) dapat dipilih lebih dari 1 sekaligus (kombinasi multi-channel OTP).
    - Metode **`Password`** bersifat eksklusif (*radio behavior*): memilih **`Password`** otomatis menonaktifkan ketiga opsi OTP; memilih salah satu opsi OTP otomatis menonaktifkan **`Password`**.
  - **Kesiapan Integrasi Backend API (Telegram / WhatsApp / Email)**:
    - Menyediakan form konfigurasi endpoint/kredensial API Gateway (Telegram Bot API, WhatsApp Gateway API, Email SMTP/Webhook API) dan endpoint di `supabase/functions/server/mainAppRoutes.tsx` (`POST /pa-app/otp/send` dan `POST /pa-app/otp/verify`) untuk pengiriman OTP nyata maupun simulasi terkendali.

### 2. Penyimpanan & Verifikasi Password Tanpa Plaintext di File Source (`src/app/store/loginManagementStore.ts`)
- **Keamanan Default Password**:
  - String plaintext password default **tidak disimpan di file kode sumber maupun localStorage**.
  - Verifikasi password menggunakan fungsi hash satu arah **SHA-256** (`Web Crypto API` / fungsi hash deterministik), di mana kode hanya menyimpan nilai hash digest dari password default dan nilai hash dari password baru pengguna.
- **State Keamanan per Karyawan (`UserAuthSecurityState`)**:
  - `passwordHash?: string` (jika kosong/belum diubah atau baru di-reset, diverifikasi terhadap hash default dan `mustChangePassword = true`).
  - `mustChangePassword: boolean` (default `true` untuk pengguna yang belum pernah mengganti password default atau baru di-reset).
  - `failedAttempts: number` (counter kesalahan input password).
  - `isBlocked: boolean` (otomatis `true` ketika `failedAttempts >= 5`).

### 3. Sinkronisasi Halaman Login (`src/app/pages/LoginPage.tsx`)
- Membaca konfigurasi `Login Management` secara dinamis berdasarkan `Company Unit` yang dipilih:
  - **Mode OTP (`OTP Telegram` / `OTP WhatsApp` / `OTP Email`)**:
    - Jika lebih dari 1 metode OTP diaktifkan pada unit tersebut, menampilkan pilihan channel pengiriman OTP kepada karyawan, lalu mengirim OTP melalui backend service.
  - **Mode `Password`**:
    - Menampilkan input **Password** (dengan tombol *show/hide*) serta teks **"Lupa Password"** yang saat disorot mouse (*hover*) menampilkan tooltip:
      **`"hubungi PIC Performance Appraisal untuk reset password"`**.
    - **Validasi 5 Kali Percobaan Salah**:
      - Mencatat jumlah percobaan gagal per karyawan. Pada kegagalan ke-5, memblokir akun (`isBlocked = true`) dan menampilkan pesan:
        **`"Anda memasukkan password yang salah sebanyak 5 kali, demi keamanan, akun anda diblokir, hubungi PIC Performance Appraisal untuk reset password"`**.
    - **Halaman Wajib Ganti Password Default**:
      - Ketika karyawan login menggunakan password default (`mustChangePassword === true`), langsung menampilkan halaman/form **Ganti Password Baru** (**tanpa meminta input ulang password default**), dilengkapi link **"Lupa Password"** ber-tooltip **`"hubungi PIC Performance Appraisal untuk reset password"`**.
      - **Aturan Kombinasi Password Baru**: Minimal **8 karakter**, wajib mencakup **huruf** (`[a-zA-Z]`), **angka** (`[0-9]`), dan **simbol** (`[_#*/\-$%@!^&+=?.~]`).
      - **Popup Sukses Ganti Password**:
        - Menampilkan popup: **`"Selamat, password Anda sudah diperbaharui, pastikan anda selalu mengingat password Anda, jangan memberi tahu password anda ke siapapun"`** dengan tombol **`"Baik, Mengerti"`**.
        - Saat tombol **`"Baik, Mengerti"`** diklik, mengarahkan pengguna kembali ke tampilan Login untuk masuk dengan password barunya.

### 4. Reset Password di Tabel User Management & Ganti Password di Header (`UserManagement.tsx` & `Topbar.tsx`)
- **Tabel User Management (`/hr/settings/user-management/users`)**:
  - Pada kolom **`Action`**, menambahkan tombol ikon **Reset Password ke Default** (`KeyRound`).
  - Jika Unit Usaha menggunakan mode login **`Password`**, tombol aktif dan saat diklik menampilkan **popup konfirmasi** untuk mereset password karyawan kembali ke default (sekaligus membuka blokir 5x percobaan salah dan menyetel `mustChangePassword = true`).
  - Jika Unit Usaha **tidak** menggunakan mode login `Password` (menggunakan OTP), tombol ikon Reset Password berada dalam kondisi **tidak aktif (`disabled`)**.
- **Header Kanan Atas (`src/app/components/Topbar.tsx`)**:
  - Pada dropdown menu Profile di kanan atas, menambahkan menu **`Ganti Password`** yang membuka modal Ganti Password (dengan validasi kombinasi huruf, angka, simbol minimal 8 karakter, serta popup konfirmasi `"Selamat, password Anda sudah diperbaharui..."`).

---

## B. Rincian Implementasi Sistem Notifikasi Terpadu

### 1. Store Notifikasi & Retensi 30 Hari (`src/app/store/notificationStore.ts`)
- Menyimpan daftar notifikasi sistem (`AppNotificationItem`) dengan properti:
  - `id`, `title`, `summary`, `body`, `category` (`"Reminder"` | `"Approval"` | `"Info"` | `"System"` | `"Calibration"` | `"Warning"`), `createdAt` (ISO timestamp), `targetEmployeeIds` / `targetUnits` / `targetDivisions` / `targetDepartments`, `channels` (`"System"` | `"Telegram"` | `"WhatsApp"` | `"Email"`), `attachments` (daftar file lampiran), `embeddedImages` (daftar gambar yang di-embed), `ctaLabel`, `ctaRoute`, `readByEmployeeIds: string[]`, dan `clearedByEmployeeIds: string[]`.
- **Auto-Clear 30 Hari**:
  - Setiap kali store dimuat, notifikasi yang berusia **lebih dari 30 hari** (`Date.now() - createdAt > 30 * 24 * 60 * 60 * 1000`) otomatis dibersihkan (*auto-clear*).
- **Aturan Proteksi Clear Notifikasi**:
  - Notifikasi yang **belum dibaca (`!isRead`) tidak dapat di-clear** (baik per item maupun lewat *Clear All*), kecuali sudah melewati 30 hari.

### 2. Section `Notification` di `/dashboard/my` & Tag `"See all Notification"` di Header (`Dashboard.tsx`, `StaffDashboard.tsx`, `Topbar.tsx`)
- **Penghapusan Section Lama**:
  - Menghapus bersih seluruh kode section `Performance Appraisal Feedback` di `/dashboard/my` (`SupervisorDashboard` & `StaffDashboard`) dan menggantinya dengan komponen **`DashboardNotificationSection`** (`id="dashboard-notification-section"`).
- **Tag `"See all Notification"` pada Icon Lonceng (`Topbar.tsx`)**:
  - Menambahkan tag/tombol **`"See all Notification"`** pada popup notifikasi di header kanan atas yang ketika diklik mengarahkan pengguna ke `/dashboard/my` dan menggulir ke section **Notification**.
- **Fitur Section `Notification` di `/dashboard/my`**:
  - Menampilkan **15 baris notifikasi per halaman** secara ringkas, diurutkan dari **notifikasi terbaru**, dilengkapi paginasi **Previous / Next Page** untuk 15 notifikasi berikutnya.
  - **Filter Kategori**: `All`, `Reminder`, `Approval`, `Info`, `Calibration`, `Warning`, `System`.
  - **Indikator Unread & Collapse/Expand**:
    - Notifikasi yang belum dibaca memiliki **background merah soft (`bg-rose-50/80 border-rose-200`)**.
    - Saat diklik, baris notifikasi melakukan **open / collapse** untuk menampilkan isi lengkap (termasuk gambar *embedded* dan file lampiran) sekaligus menandai notifikasi sebagai **sudah dibaca**, sehingga background merah soft otomatis hilang.
  - **Clear per Notifikasi (`X`) & Clear All dengan Popup Konfirmasi**:
    - Tombol `X` pada tiap baris hanya aktif jika notifikasi sudah dibaca (`read === true`).
    - Tombol **`Clear All Read`** membuka **popup konfirmasi** sebelum membersihkan notifikasi yang sudah dibaca.

### 3. Menu `Notification` di Bawah `Setting` (`/${portal}/settings/notification` — `NotificationManagement.tsx`)
- Menambahkan menu **`Notification`** (`id: "setting_notification"`, path `/settings/notification`) tepat di bawah **`Menu Management`** pada grup menu **`Setting`** di `AccessManagement.tsx`, `MenuManagement.tsx`, `Sidebar.tsx`, dan `routes.tsx` (default diizinkan untuk `Administrator` dan `HR ICF`, serta role lain yang di-allow).
- Halaman **`NotificationManagementPage`** (`src/app/pages/hr/settings/NotificationManagement.tsx`) memiliki **2 Tab**:
  1. **Tab `Auto Notification`**:
     - Mengelola template service notifikasi otomatis dari sistem (`Reminder`, `Approval`, `Calibration`, `Warning`, `System`) berdasarkan jadwal waktu (*cron / H-7 / tanggal aktivasi modul*) atau *trigger* aksi sistem (saat pengajuan disubmit, disetujui, direvisi, atau mendekati tenggat).
     - Mendukung tambah/edit template, toggle *Active / Inactive*, dan tombol *Run / Test Trigger*.
  2. **Tab `Notification Broadcast`**:
     - Form pengiriman broadcast informasi oleh Administrator / HR ICF:
       - **Kategori Pesan**: `Reminder`, `Approval`, `Info`, `Calibration`, `Warning`, `System`.
       - **Target Penerima**: Pilihan **`All`** atau pemilihan multi-kriteria dengan **Checkbox Multi-Select** pada **Unit Usaha**, **Divisi**, dan **Departemen**.
       - **Mode Penerima (Checkbox Multi-Channel)**: `Notifikasi Sistem`, `Telegram`, `WhatsApp`, `Email`.
       - **Lampiran & Gambar Embedded**: Jika memilih `Notifikasi Sistem`, `Email`, atau `Telegram`, mendukung penambahan **file lampiran** serta **gambar yang di-embed** langsung pada isi pesan notifikasi, disertai riwayat pengiriman broadcast.

---

## Rencana Verifikasi
1. **Verifikasi Login Management & Password Flow**:
   - Buka `/hr/settings/user-management` -> Tab `Login Management`, uji pemilihan OTP multi-channel vs `Password` eksklusif.
   - Uji login dengan `Password` default -> pastikan langsung diarahkan ke halaman ganti password baru (validasi huruf + angka + simbol min. 8 karakter) -> muncul popup sukses `"Selamat, password Anda sudah diperbaharui..."` -> klik `"Baik, Mengerti"` kembali ke login.
   - Uji 5x salah password -> pastikan akun terblokir dengan pesan peringatan yang sesuai, lalu uji tombol **Reset Password** pada tabel User Management.
   - Uji fitur **Ganti Password** dari menu Profile di kanan atas header.
2. **Verifikasi Sistem Notifikasi**:
   - Klik `"See all Notification"` di icon lonceng header -> pastikan menuju section `Notification` di `/dashboard/my`.
   - Uji tampilan 15 baris per halaman, background merah soft untuk unread, klik untuk expand/baca (background merah hilang), proteksi clear untuk unread, dan popup konfirmasi clear notifikasi.
   - Buka `Setting -> Notification` (`/hr/settings/notification`) -> uji tab `Auto Notification` dan pengiriman pesan beserta gambar embed & lampiran dari tab `Notification Broadcast`.
3. **Verifikasi Build**:
   - Jalankan `pnpm build` untuk memastikan tidak ada error TypeScript atau bundle.
