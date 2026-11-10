# Panduan Pembuatan Ulang Backend Supabase + Integrasi GitHub & Vercel

Dokumen ini menjelaskan langkah demi langkah untuk membuat project **Supabase baru dari nol**, menghubungkannya dengan **GitHub Actions CI/CD**, dan men-deploy frontend **Performance Appraisal** ke **Vercel**.

---

## 1. Membuat Project Baru di Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan klik **New Project**.
2. Isi detail project:
   - **Name**: `Performance Appraisal Sambu Group` (atau nama sesuai keinginan)
   - **Database Password**: Buat password yang kuat dan **simpan password ini** (dibutuhkan untuk CLI & GitHub Secrets).
   - **Region**: Pilih `Southeast Asia (Singapore)` (`ap-southeast-1`).
3. Setelah project selesai dibuat, buka **Project Settings → General** dan **Project Settings → API**, lalu catat 3 nilai berikut:
   - **Reference ID (`Project ID`)**: mis. `abcdefghijklmno`
   - **Project URL (`SUPABASE_URL`)**: mis. `https://abcdefghijklmno.supabase.co`
   - **Anon Public Key (`SUPABASE_ANON_KEY`)**: `eyJhbGciOiJIUzI1NiIs...`

---

## 2. Alur Deploy: Figma Make → GitHub → Supabase → Vercel

Aplikasi ini telah dilengkapi **Direct Supabase PostgREST & Storage Engine** di `src/app/services/supabaseClient.ts` sehingga berbicara langsung ke **Supabase REST API (`/rest/v1/pa_*`)** dan **Supabase Storage API (`/storage/v1/object/pa-evidence`)**:

1. Buka **Supabase Dashboard → SQL Editor**.
2. Jalankan isi file **`supabase/migrations/202611010001_pa_unified_backend.sql`**.
3. Jalankan isi file **`supabase/migrations/202611020001_pa_complete_persistence.sql`**.
4. Tekan **Push to GitHub** dari Figma Make — **Vercel** akan otomatis mem-build dan men-deploy aplikasi frontend terbaru yang langsung terhubung penuh ke tabel `pa_*` dan Storage Bucket `pa-evidence` di Supabase.

Buka terminal di **VS Code** pada folder proyek ini, lalu jalankan perintah berikut:

```bash
# 1. Login ke Supabase CLI
npx supabase login

# 2. Link ke Project ID Supabase baru Anda (masukkan Database Password saat diminta)
npx supabase link --project-ref <PROJECT_ID_BARU_ANDA>

# 3. Push seluruh skema database (12 file migrasi di supabase/migrations/, termasuk 202611010001_pa_unified_backend.sql)
npx supabase db push --remote --include-all

# 4. Deploy Edge Function server ke project Supabase baru
npx supabase functions deploy make-server-74dadec6 --project-ref <PROJECT_ID_BARU_ANDA> --no-verify-jwt
```

> **Alternatif Tanpa CLI**: Anda juga dapat membuka file `supabase/migrations/202611010001_pa_unified_backend.sql` di VS Code, menyalin seluruh isinya, dan menjalankannya langsung di **Supabase Dashboard → SQL Editor**.

---

## 3. Menghubungkan GitHub Actions untuk Auto-Deploy ke Supabase

File workflow `.github/workflows/supabase-vercel-ci.yml` sudah disiapkan di repository ini. Setiap kali Anda melakukan `git push origin main`:
1. GitHub Actions otomatis menjalankan seluruh **Unit Test (44 tests)** dan **Vite Production Build**.
2. Jika lulus, GitHub Actions otomatis menjalankan `supabase db push` dan `supabase functions deploy` ke project Supabase Anda.

### Cara Mengaktifkan GitHub Secrets:
1. Buat Personal Access Token di [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens).
2. Buka repository GitHub Anda → **Settings → Secrets and variables → Actions → New repository secret**, lalu tambahkan 3 secret berikut:
   - `SUPABASE_ACCESS_TOKEN`: Token dari Supabase Account Tokens.
   - `SUPABASE_PROJECT_ID`: Reference ID project Supabase baru Anda.
   - `SUPABASE_DB_PASSWORD`: Password database PostgreSQL project Supabase baru Anda.

---

## 4. Men-deploy Frontend ke Vercel (Terintegrasi dengan GitHub)

File `vercel.json` sudah dikonfigurasi untuk mendukung **React Router SPA** (sehingga refresh pada URL seperti `/login`, `/employee`, `/supervisor`, `/hr/monitoring/project`, `/bod` tidak akan menghasilkan `404 Not Found`).

### Langkah Setup di Vercel:
1. Buka [Vercel Dashboard](https://vercel.com/new) dan klik **Add New... → Project**.
2. Pilih repository GitHub **Performance Appraisal** Anda dan klik **Import**.
3. Pada bagian **Build and Output Settings**, Vercel akan otomatis mendeteksi dari `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `pnpm build`
   - **Output Directory**: `dist`
4. Buka bagian **Environment Variables** dan tambahkan 3 variabel berikut (sesuai `.env.example`):
   - `VITE_SUPABASE_PROJECT_ID` = `<PROJECT_ID_BARU_ANDA>`
   - `VITE_SUPABASE_URL` = `https://<PROJECT_ID_BARU_ANDA>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<ANON_PUBLIC_KEY_BARU_ANDA>`
5. Klik **Deploy**.
6. Selanjutnya, setiap kali Anda melakukan `git push` ke GitHub, **Vercel** akan otomatis men-deploy ulang frontend dan **GitHub Actions** akan otomatis men-deploy migrasi & Edge Function ke **Supabase**.
