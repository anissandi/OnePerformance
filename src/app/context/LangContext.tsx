import { createContext, useContext, useState, type ReactNode } from "react";

// ── Translation dictionary (EN → ID) ──────────────────────────────────────────
// Rules:
// • Don't translate PA module names: KPI, SMART Goals, Appraisal Form, RCA,
//   KPI Setting, KPI Tracking, Project Outside Job Scope, Management Interview,
//   Inter-Department Feedback/Comments, Managerial Skill
// • Don't translate menu/submenu labels
// • Don't translate sample data (employee names, division names, etc.)
// • Only translate: tabs, sections, card titles, table headers, buttons, tooltips,
//   drawer/modal content, tags, notifications, placeholders

const ID_DICT: Record<string, string> = {
  // ── Layout / Navigation ──────────────────────────────────────────────────────
  "Search anything...":                     "Cari sesuatu...",
  "results found":                          "hasil ditemukan",
  "No results for":                         "Tidak ada hasil untuk",
  "Notifications":                          "Notifikasi",
  "Mark all as read":                       "Tandai semua sudah dibaca",
  "No notifications":                       "Tidak ada notifikasi",
  "View Profile":                           "Lihat Profil",
  "Logout":                                 "Keluar",
  "Press":                                  "Tekan",
  "to close":                               "untuk menutup",

  // ── Analytics Dashboard ────────────────────────────────────────────────────
  "Analytics Dashboard":                    "Dasbor Analitik",
  "Track completion status and export final appraisal scores": "Pantau status penyelesaian dan ekspor skor penilaian akhir",
  "Company Unit":                           "Unit Perusahaan",
  "Year":                                   "Tahun",
  "Month":                                  "Bulan",
  "Total Employees":                        "Total Karyawan",
  "Completed Appraisals":                   "Penilaian Selesai",
  "Pending Reviews":                        "Menunggu Ulasan",
  "Completion Rate":                        "Tingkat Penyelesaian",
  "Completion Status by Company Unit":      "Status Penyelesaian per Unit Perusahaan",
  "Completion Status by Division":          "Status Penyelesaian per Divisi",
  "Completion Status by Department":        "Status Penyelesaian per Departemen",
  "Overall Status Distribution":            "Distribusi Status Keseluruhan",
  "Division Breakdown":                     "Rincian per Divisi",

  // ── Common Status Labels ───────────────────────────────────────────────────
  "Completed":                              "Selesai",
  "In Progress":                            "Sedang Berjalan",
  "Pending":                                "Menunggu",
  "Approved":                               "Disetujui",
  "Revision":                               "Revisi",
  "Draft":                                  "Draf",
  "Submitted":                              "Terkirim",
  "Not Started":                            "Belum Dimulai",
  "On Track":                               "Sesuai Target",
  "At Risk":                                "Berisiko",
  "Cancelled":                              "Dibatalkan",
  "Active":                                 "Aktif",
  "Inactive":                               "Tidak Aktif",

  // ── Common Buttons ─────────────────────────────────────────────────────────
  "Save":                                   "Simpan",
  "Cancel":                                 "Batal",
  "Submit":                                 "Kirim",
  "Edit":                                   "Ubah",
  "Delete":                                 "Hapus",
  "Add":                                    "Tambah",
  "Back":                                   "Kembali",
  "Next":                                   "Selanjutnya",
  "Close":                                  "Tutup",
  "Confirm":                                "Konfirmasi",
  "Reset":                                  "Atur Ulang",
  "Export":                                 "Ekspor",
  "Import":                                 "Impor",
  "Download":                               "Unduh",
  "Upload":                                 "Unggah",
  "Search":                                 "Cari",
  "Filter":                                 "Filter",
  "Clear":                                  "Bersihkan",
  "Apply":                                  "Terapkan",
  "Approve":                                "Setujui",
  "Reject":                                 "Tolak",
  "Send":                                   "Kirim",
  "View":                                   "Lihat",
  "Preview":                                "Pratinjau",
  "Clear filters":                          "Bersihkan filter",
  "All":                                    "Semua",

  // ── Table Headers ──────────────────────────────────────────────────────────
  "No.":                                    "No.",
  "Name":                                   "Nama",
  "Position":                               "Jabatan",
  "Department":                             "Departemen",
  "Division":                               "Divisi",
  "Status":                                 "Status",
  "Date":                                   "Tanggal",
  "Action":                                 "Aksi",
  "Actions":                                "Aksi",
  "Score":                                  "Skor",
  "Total":                                  "Total",
  "Period":                                 "Periode",
  "Type":                                   "Jenis",
  "Description":                            "Keterangan",
  "Notes":                                  "Catatan",
  "Progress":                               "Progres",
  "Target":                                 "Target",
  "Actual":                                 "Aktual",
  "Achievement":                            "Pencapaian",
  "Weight":                                 "Bobot",
  "Formula":                                "Formula",
  "Unit":                                   "Satuan",
  "Category":                               "Kategori",
  "Role":                                   "Peran",
  "Employee":                               "Karyawan",
  "Supervisor":                             "Supervisor",
  "Grade":                                  "Nilai",
  "Level":                                  "Level",

  // ── Dashboard sections ─────────────────────────────────────────────────────
  "My Appraisal Cycle":                     "Siklus Penilaian Saya",
  "Current Period":                         "Periode Berjalan",
  "Performance Summary":                    "Ringkasan Kinerja",
  "Pending Actions":                        "Tindakan Menunggu",
  "Recent Activity":                        "Aktivitas Terbaru",
  "Upcoming Deadlines":                     "Tenggat Waktu Mendatang",
  "Quick Links":                            "Tautan Cepat",
  "Overview":                               "Ikhtisar",

  // ── Tabs ────────────────────────────────────────────────────────────────────
  "History":                                "Riwayat",
  "Details":                                "Detail",
  "Summary":                                "Ringkasan",
  "Settings":                               "Pengaturan",
  "Monitoring":                             "Monitoring",

  // ── Approval page ──────────────────────────────────────────────────────────
  "Pending Approval":                       "Menunggu Persetujuan",
  "Approval History":                       "Riwayat Persetujuan",
  "Submitted Date":                         "Tanggal Pengiriman",
  "Approval Date":                          "Tanggal Persetujuan",
  "Approver":                               "Penyetuju",
  "Reason":                                 "Alasan",
  "Edit Request":                           "Permintaan Edit",
  "No pending approvals":                   "Tidak ada persetujuan yang menunggu",
  "records found":                          "data ditemukan",

  // ── Goal Oversight ─────────────────────────────────────────────────────────
  "Goal Oversight":                         "Pengawasan Tujuan",
  "All Employees":                          "Semua Karyawan",
  "All Divisions":                          "Semua Divisi",
  "All Departments":                        "Semua Departemen",
  "All Status":                             "Semua Status",
  "All Types":                              "Semua Jenis",
  "All Units":                              "Semua Unit",
  "All Months":                             "Semua Bulan",

  // ── Module Activation ─────────────────────────────────────────────────────
  "Module Activation":                      "Aktivasi Modul",
  "Activate":                               "Aktifkan",
  "Deactivate":                             "Nonaktifkan",
  "Start Date":                             "Tanggal Mulai",
  "End Date":                               "Tanggal Selesai",
  "Position Level":                         "Level Jabatan",
  "Target Positions":                       "Jabatan Target",

  // ── Calibration ───────────────────────────────────────────────────────────
  "Calibration":                            "Kalibrasi",
  "Score Range":                            "Rentang Skor",
  "Proportion":                             "Proporsi",
  "Final Score":                            "Skor Akhir",
  "Calibrated Grade":                       "Nilai Kalibrasi",
  "Override":                               "Ubah Manual",

  // ── Mid Year Check In ─────────────────────────────────────────────────────
  "Mid-Year Check-In":                      "Evaluasi Tengah Tahun",
  "Year-End Review":                        "Ulasan Akhir Tahun",
  "Check-In Date":                          "Tanggal Check-In",
  "Interviewer":                            "Pewawancara",
  "Scheduled":                              "Terjadwal",

  // ── Management Override ───────────────────────────────────────────────────
  "Management Override":                    "Perubahan oleh Manajemen",
  "Original Score":                         "Skor Asli",
  "New Score":                              "Skor Baru",
  "Override Reason":                        "Alasan Perubahan",

  // ── Monitoring ────────────────────────────────────────────────────────────
  "Last Updated":                           "Terakhir Diperbarui",
  "Evidence":                               "Bukti",
  "Upload Evidence":                        "Unggah Bukti",
  "View Evidence":                          "Lihat Bukti",
  "No data available":                      "Tidak ada data",
  "Loading...":                             "Memuat...",
  "Syncing...":                             "Menyinkronkan...",
  "Success":                                "Berhasil",
  "Failed":                                 "Gagal",
  "Error":                                  "Kesalahan",

  // ── KPI ───────────────────────────────────────────────────────────────────
  "Perspective":                            "Perspektif",
  "Indicator":                              "Indikator",
  "Baseline":                               "Baseline",
  "Monthly Target":                         "Target Bulanan",
  "Monthly Actual":                         "Aktual Bulanan",
  "Tracking Period":                        "Periode Tracking",
  "Polaritas":                              "Polaritas",
  "Maximize":                               "Maksimalkan",
  "Minimize":                               "Minimalkan",
  "Section":                                "Seksi",
  "Add Evidence":                           "Tambah Bukti",
  "RCA Required":                           "RCA Diperlukan",
  "RCA Completed":                          "RCA Selesai",
  "KPI Achievement":                        "Pencapaian KPI",

  // ── SMART Goals ───────────────────────────────────────────────────────────
  "Specific":                               "Spesifik",
  "Measurable":                             "Terukur",
  "Attainable":                             "Dapat Dicapai",
  "Relevant":                               "Relevan",
  "Timely":                                 "Tepat Waktu",
  "Goals":                                  "Tujuan",
  "Action Plans":                           "Rencana Tindakan",
  "Add Goal":                               "Tambah Tujuan",
  "Evidence of Achievement":                "Bukti Pencapaian",

  // ── Appraisal Form ────────────────────────────────────────────────────────
  "Self Assessment":                        "Penilaian Mandiri",
  "Supervisor Assessment":                  "Penilaian Supervisor",
  "Behavioral Competency":                  "Kompetensi Perilaku",
  "Functional Skills":                      "Keterampilan Fungsional",
  "Rating":                                 "Penilaian",
  "Average Score":                          "Skor Rata-rata",

  // ── Project ───────────────────────────────────────────────────────────────
  "Project Name":                           "Nama Proyek",
  "Scope":                                  "Ruang Lingkup",
  "Check-In Status":                        "Status Check-In",
  "Project Leader":                         "Pemimpin Proyek",
  "Members":                                "Anggota",
  "Add Project":                            "Tambah Proyek",
  "Project Progress":                       "Progres Proyek",

  // ── Settings ──────────────────────────────────────────────────────────────
  "User Management":                        "Manajemen Pengguna",
  "Access Management":                      "Manajemen Akses",
  "Audit Trail":                            "Audit Trail",
  "Data Sync":                              "Sinkronisasi Data",
  "Menu Management":                        "Manajemen Menu",
  "Open Lock":                              "Buka Kunci",
  "Back to Company Units":                  "Kembali ke Unit Perusahaan",

  // ── Evidence ──────────────────────────────────────────────────────────────
  "File Name":                              "Nama File",
  "File Size":                              "Ukuran File",
  "Uploaded By":                            "Diunggah Oleh",
  "Upload Date":                            "Tanggal Unggah",
  "No files uploaded":                      "Belum ada file yang diunggah",

  // ── Profile ───────────────────────────────────────────────────────────────
  "Profile":                                "Profil",
  "Personal Information":                   "Informasi Pribadi",
  "Employee ID":                            "ID Karyawan",
  "Email":                                  "Email",
  "Phone":                                  "Telepon",
  "Address":                                "Alamat",
  "Company":                                "Perusahaan",
  "Join Date":                              "Tanggal Bergabung",

  // ── Performance Appraisal Summary ─────────────────────────────────────────
  "Performance Appraisal Summary":          "Ringkasan Penilaian Kinerja",
  "Overall Score":                          "Skor Keseluruhan",
  "Module Weights":                         "Bobot Modul",
  "Weighted Score":                         "Skor Tertimbang",
  "Final Grade":                            "Nilai Akhir",
  "Outstanding":                            "Luar Biasa",
  "Good":                                   "Baik",
  "Average":                                "Cukup",
  "Below Average":                          "Di Bawah Rata-rata",
  "Unsatisfactory":                         "Tidak Memuaskan",
  "Fail":                                   "Gagal",

  // ── Drawers / Modals ──────────────────────────────────────────────────────
  "Review Details":                         "Detail Ulasan",
  "Approval Details":                       "Detail Persetujuan",
  "Add Comment":                            "Tambah Komentar",
  "Comment":                                "Komentar",
  "Feedback":                               "Umpan Balik",
  "Assessment":                             "Penilaian",
  "No comment yet":                         "Belum ada komentar",
  "Send for Approval":                      "Kirim untuk Persetujuan",
  "Approve & Continue":                     "Setujui & Lanjutkan",
  "Send Back for Revision":                 "Kembalikan untuk Revisi",

  // ── Miscellaneous ─────────────────────────────────────────────────────────
  "Home":                                   "Beranda",
  "No data":                                "Tidak ada data",
  "See all":                                "Lihat semua",
  "Show more":                              "Tampilkan lebih",
  "Show less":                              "Tampilkan lebih sedikit",
  "per page":                               "per halaman",
  "Page":                                   "Halaman",
  "of":                                     "dari",
  "rows":                                   "baris",
  "Select":                                 "Pilih",
  "Optional":                               "Opsional",
  "Required":                               "Wajib",
  "Notification":                           "Notifikasi",
  "Today":                                  "Hari Ini",
  "Yesterday":                              "Kemarin",
  "This week":                              "Minggu ini",
  "This month":                             "Bulan ini",
  "This year":                              "Tahun ini",
  "Deadline":                               "Tenggat Waktu",
  "Due":                                    "Jatuh tempo",
  "Overdue":                                "Terlambat",
};

// ── Context ───────────────────────────────────────────────────────────────────
type Lang = "EN" | "ID";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "EN",
  setLang: () => {},
  t: (en) => en,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("EN");
  const t = (en: string): string => lang === "ID" ? (ID_DICT[en] ?? en) : en;
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLanguage() {
  return useContext(LangContext);
}
