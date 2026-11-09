# Rencana: Membalik Flow Inter-Department Feedback

## Tujuan

Mengubah alur Inter-Department Feedback pada mockup utama dari:

> Karyawan memilih minimal tiga karyawan dan langsung memberikan feedback kepada mereka.

menjadi:

> Karyawan memilih **tepat tiga** karyawan lintas unit/departemen sebagai pemberi feedback untuk dirinya. Ketiga karyawan terpilih menerima tugas, mengisi feedback anonim untuk karyawan yang memilih mereka, lalu feedback tersebut masuk ke Received Feedback karyawan penerima untuk proses summary dan tindak lanjut Approver 1 serta Approver 2.

Aturan yang tidak berubah:

- Lima indikator feedback dan klasifikasi positif/negatif tetap dipakai.
- Feedback bersifat anonim bagi penerima; penerima dan approver tidak melihat identitas pemberi feedback.
- Periode penerimaan dan periode approval tetap mengikuti Module Activation.
- Summary per indikator tetap wajib sebelum diteruskan.
- Tindak lanjut dilakukan berurutan oleh Approver 1 lalu Approver 2, tanpa approve/revise.
- Data local mockup tetap tersimpan di `localStorage` dan dapat direfresh antartab melalui event aplikasi.

## Batasan dan Keputusan

- Implementasi ini hanya berlaku di **mockup utama React/Vite**, bukan di `/pa-simulasi`. Modul Inter-Department Feedback belum tersambung ke backend Supabase; tidak ada migrasi, Edge Function, atau API Supabase yang diubah.
- Jumlah pemberi feedback adalah **tepat 3**, bukan minimum 3.
- Karena mockup utama belum memiliki sesi identitas karyawan yang benar-benar dinamis, halaman menggunakan **pemilih akun demo** khusus modul. Pemilih ini hanya merepresentasikan karyawan aktif dalam demonstrasi; ia tidak mengubah mekanisme login global yang ada.
- Karyawan yang sudah mengirim nominasi tidak dapat menambah, menghapus, atau mengganti tiga pemberi feedback pada periode yang sama.
- Satu karyawan dapat menjadi pemberi feedback bagi lebih dari satu penerima selama tidak ada aturan lama yang melarangnya.
- Detail organisasi pemberi (company unit, division, department) tetap boleh ditampilkan kepada penerima dan approver; nama/ID pemberi tidak boleh muncul pada received feedback, summary, approval, monitoring, atau persistence yang diekspos oleh UI penerima.

## Model Data dan Store

Refactor `src/app/pages/shared/interDepartmentFeedbackStore.ts` menjadi sumber data workflow Inter-Department Feedback yang konsisten.

1. Tambahkan tipe master data karyawan mock yang dibagi bersama:
   - `FeedbackEmployee`: id, nama, jabatan, initials, company unit, division, department, dan identifier filter.
   - Pindahkan/ekspor master data yang kini berada di `InterDepartmentFeedback.tsx`, sehingga selector, inbox, dan monitor memakai daftar yang sama.

2. Ganti model `FeedbackSubmission` yang semula hanya menyimpan received feedback statis menjadi record workflow per penerima:
   - Metadata penerima (`recipient`) dan tahun/periode.
   - Tiga `nominations`, masing-masing menyimpan metadata organisasi pemberi dan status tugas (`Pending` atau `Submitted`).
   - `feedbacks` yang hanya dibuat ketika masing-masing pemberi submit; setiap feedback memuat ID internal pemberi untuk pengaturan tugas, tetapi selector/read model untuk penerima menghilangkan nama/ID pemberi.
   - `summaries`, `summarySubmittedAt`, dan `followUps` yang sudah ada tetap dipertahankan.
   - Status terhitung: `Awaiting feedback`, `Feedback complete`, `Summary submitted`, `Assessed A1`, dan `Complete`.

3. Tambahkan fungsi store terfokus:
   - Mengambil/menyimpan seluruh workflow secara aman dari `localStorage`, dengan fallback data kosong dan event `feedback-updated`.
   - Membuat nominasi dengan validasi **tepat tiga**, unik, bukan diri sendiri, dan satu nominasi aktif per penerima/tahun.
   - Mengambil inbox tugas untuk seorang pemberi feedback.
   - Menyimpan draft jawaban pemberi dan submit jawaban hanya bila lima indikator terisi, periode receiving sedang aktif, serta tugas belum submitted.
   - Mengambil feedback yang sudah masuk milik penerima dalam bentuk anonim.
   - Menyimpan/submit summary setelah seluruh tiga feedback masuk dan semua 15 summary terisi.
   - Mengambil row approval sesuai workflow yang sudah submit summary.
   - Menyimpan follow-up approver sambil mempertahankan validasi enam field wajib dan urutan A1 → A2.

4. Kompatibilitas data:
   - Naikkan key storage ke versi baru atau lakukan normalisasi saat load.
   - Data/example legacy yang sebelumnya berupa received feedback langsung dinormalisasi menjadi record lengkap yang sudah berada pada tahap summary/approval, sehingga drawer approval, Year End Verification, dan tampilan demo lama tidak error.
   - Jangan menghapus key legacy sampai data valid berhasil dinormalisasi; implementasikan fallback defensif untuk JSON rusak.

## Perubahan Halaman Inter-Department Feedback

Refactor `src/app/pages/supervisor/InterDepartmentFeedback.tsx`; pecah komponen internal bila ukuran file tetap besar agar state nominasi, inbox, dan received feedback tidak saling bercampur.

### 1. Konteks karyawan demo dan navigasi tab

- Tambahkan selector **“Simulasi sebagai karyawan”** di header modul, menggunakan daftar karyawan mock bersama.
- Ubah navigasi menjadi tiga area kerja:
  1. **Pilih Pemberi Feedback**: nominasi tepat tiga pemberi untuk diri sendiri.
  2. **Tugas Feedback Saya**: daftar permintaan feedback yang ditujukan kepada karyawan aktif.
  3. **Feedback Diterima**: feedback anonim yang diterima karyawan aktif dan proses summary.
- Tampilkan badge jumlah tugas pending pada tab tugas dan status proses pada tab nominasi/received.
- Pergantian karyawan aktif harus memuat ulang status dari store, mengosongkan form transient, dan tidak pernah mencampur draft milik karyawan lain.

### 2. Nominasi pemberi feedback

- Pertahankan filter Company Unit → Division → Department dan daftar karyawan.
- Ubah seluruh copy dari “Select Employee to Give Feedback”/“Selected Recipients” menjadi “Pilih Pemberi Feedback”/“Pemberi Feedback Terpilih”.
- Exclude karyawan aktif dari pilihan dan disable karyawan yang sudah dipilih.
- Keranjang harus mengizinkan maksimal tiga orang:
  - Tombol tambah nonaktif setelah tiga pilihan.
  - Indikator berubah dari `x / min. 3` menjadi `x / 3`.
  - Tombol submit hanya aktif ketika jumlah tepat tiga.
- Ganti wizard lama yang berisi form feedback pemberi dengan dialog konfirmasi nominasi. Dialog menjelaskan bahwa ketiga orang akan menerima tugas untuk memberi feedback anonim kepada karyawan aktif dan nominasi terkunci setelah dikirim.
- Setelah submit sukses, tampilkan ringkasan read-only tiga pemberi (nama dan organisasi boleh terlihat hanya kepada nominator), tanggal nominasi, dan status masing-masing tugas (`Menunggu feedback`/`Feedback diterima`).

### 3. Tugas pemberi feedback

- Bangun inbox bagi karyawan aktif yang mengembalikan semua tugas nominasi yang belum dia submit.
- Setiap kartu tugas menampilkan penerima feedback dengan nama, jabatan, dan konteks organisasi yang cukup agar pemberi memahami subjek feedback.
- Form lima indikator adalah reuse aturan/form visual lama; form sekarang disimpan terhadap pasangan `giverId + recipientId`, bukan terhadap daftar recipients lokal.
- Pertahankan validasi seluruh lima jawaban wajib, anonymity banner, karakter count, peringatan bahwa submission tidak dapat diubah, dan guard periode receiving.
- Setelah submit:
  - Tandai tugas pemberi sebagai `Submitted`.
  - Tambahkan feedback ke record penerima dengan metadata organisasi pemberi saja untuk view penerima.
  - Perbarui badge/inbox dan status nominasi penerima lewat event store.
- Jika periode approval sudah dimulai, blok form tugas baru dengan pesan jadwal yang konsisten; tugas yang sudah disubmit tetap read-only.

### 4. Feedback diterima dan summary

- Hilangkan konstanta `RECEIVED_FEEDBACKS` dan ganti dengan feedback real dari store untuk karyawan aktif.
- Tampilkan state yang jelas:
  - Belum menominasikan tiga pemberi.
  - Menunggu 1–3 feedback, dengan progres tanpa mengungkap identitas pemberi.
  - Tiga feedback lengkap dan siap disummarize.
  - Summary sudah disubmit/read-only.
- Pertahankan tab per feedback, copy anonim, organisasi pemberi, 5 indikator, indikator positif/negatif, sequential navigation, serta keharusan mengisi semua summary.
- Tombol submit summary aktif hanya jika tiga feedback sudah submitted, 15 field summary terisi, dan jendela approval aktif.
- Saat submit, buat `FeedbackSubmission` untuk penerima aktif agar otomatis muncul di approval A1/A2 serta Year End Verification.

## Routing dan Navigasi

1. Tambahkan rute employee:
   - `/employee/measurement/inter-department-feedback` → halaman workflow yang sama.
2. Tambahkan menu **Inter-Department Feedback** pada `employeeLinks` di bagian Performance Appraisal Measurement.
3. Pertahankan rute supervisor yang sudah ada untuk demonstrasi supervisor sebagai karyawan/participant, tanpa mengubah rute approval dan monitoring.
4. Pastikan title, breadcrumb/topbar, serta sidebar menampilkan label yang konsisten dengan flow “Pilih Pemberi Feedback”.

## Approval, Verification, dan Monitoring

1. `FeedbackApprovalsPage` dan `FeedbackApprovalDrawer`
   - Gunakan query baru dari store hanya untuk record dengan `summarySubmittedAt`.
   - Pertahankan anonymized feedback dan summary read-only bagi approver.
   - Tegakkan urutan A1 → A2 dalam UI dan store; A2 tidak dapat submit sebelum follow-up A1 selesai.
   - Tidak mengubah konten/validasi enam kolom tindak lanjut.

2. `YearEndVerification`
   - Gunakan status workflow baru:
     - Belum summary submitted → pending/incomplete sesuai status modul yang sudah berlaku.
     - Summary submitted tetapi follow-up belum lengkap → pending.
     - A1 dan A2 selesai → complete.
   - Perbarui pencocokan ID agar record nominasi/feedback tanpa summary tidak dianggap lengkap.

3. `SupervisorMonitoringInterDeptFeedback`
   - Ganti dataset hard-coded dengan selector/read model dari store, atau gabungkan data demo dengan record workflow baru.
   - Tampilkan nama penerima dan angka progres/status tanpa nama/ID pemberi feedback.
   - Detail monitor hanya menampilkan organisasi pemberi, feedback anonim, summary, dan follow-up sesuai data workflow.
   - Pertahankan UI filter, badge, serta tampilan detail yang ada sejauh tidak bertentangan dengan anonimitas.

## Kriteria Penerimaan dan Verifikasi

### Skenario functional manual

1. HR membuka Module Activation dengan konfigurasi receiving valid; user dapat menominasikan hanya setelah jendela receiving terbuka.
2. Karyawan A memilih tiga karyawan berbeda, tidak dapat memilih diri sendiri, dan tidak dapat submit dua atau empat orang.
3. Setelah A submit nominasi, tiga pemberi melihat tiga tugas yang tepat saat dipilih sebagai akun demo; A melihat status pending tanpa jawaban/nama pemberi pada received feedback.
4. Masing-masing pemberi mengisi lima indikator dan submit; penerima memperoleh feedback satu per satu dengan identitas pemberi disembunyikan, hanya organisasi ditampilkan.
5. Penerima tidak dapat submit summary sampai ketiga feedback masuk, semua 15 catatan summary terisi, dan periode approval aktif.
6. Submission summary muncul untuk A1; A2 baru dapat mengirim follow-up setelah A1 selesai; kedua follow-up tampil kembali kepada penerima.
7. Setelah A1 dan A2 selesai, Year End Verification menandai Inter-Department Feedback penerima sebagai complete.
8. Refresh halaman dan perpindahan akun mempertahankan nominasi, tugas, jawaban submitted, summary, dan follow-up.
9. Ketika jendela receiving/approval tertutup, aksi yang sesuai diblokir, sedangkan data historis tetap terbaca.

### Pemeriksaan teknis

- Jalankan formatter yang ditentukan proyek: `pnpm format`.
- Jalankan build produksi: `pnpm build`.
- Lakukan pemeriksaan manual rute `/supervisor/measurement/inter-department-feedback`, `/employee/measurement/inter-department-feedback`, rute approval supervisor/HR, monitoring supervisor, dan Year End Verification.
- Pastikan tidak ada response/API Supabase PA-Simulasi yang berubah dan tidak ada data kredensial yang ditambahkan.

## File yang Diperkirakan Berubah

- `src/app/pages/shared/interDepartmentFeedbackStore.ts`
- `src/app/pages/supervisor/InterDepartmentFeedback.tsx`
- `src/app/pages/shared/FeedbackApprovalsPage.tsx`
- `src/app/components/FeedbackApprovalDrawer.tsx`
- `src/app/pages/supervisor/monitoring/InterDepartmentFeedbackMonitoring.tsx`
- `src/app/pages/hr/YearEndVerification.tsx`
- `src/app/routes.tsx`
- `src/app/components/Sidebar.tsx`

Komponen baru dapat ditambahkan di `src/app/pages/shared/` atau `src/app/pages/supervisor/` bila pemisahan inbox/nominasi/received feedback membuat workflow lebih mudah diuji dan dipelihara.
