// ─── Edward David — Sample Data (Employee / Staff Portal) ────────────────────

export const EDWARD_PROFILE = {
  name: "Edward David",
  nip: "E003",
  initials: "ED",
  position: "Staf Keuangan",
  department: "Departemen Akuntansi & Keuangan",
  division: "Divisi Keuangan",
  company: "PT RSUP (Industry)",
  grade: "Grade 4",
  joinDate: "15/06/2021",
  email: "edward.david@rsup.sambu.co.id",
};

// ─── KPI Setting ──────────────────────────────────────────────────────────────

export const EDWARD_KPI_ITEMS = [
  // ── Seksi A: Objective KPI (total 20%) ────────────────────────────────────
  {
    no: "1",
    section: "A" as const,
    perspektif: "Finansial",
    kpi: "Kepatuhan Pelaporan Keuangan",
    satuan: "%",
    formula: "Nilai Akhir",
    bobot: "15%",
    definisi: "Persentase laporan keuangan yang diserahkan tepat waktu dan akurat sesuai standar PSAK",
    source: "Sistem SAP / ERP",
    baseline2025: "98%",
    target2026: "100%",
    polaritas: "Maximize" as const,
    detailFormula: "(Laporan tepat waktu & akurat / Total laporan) × 100%",
    keterangan: "Termasuk laporan bulanan, triwulanan, dan tahunan",
    monthlyTargets: { Jan:"100%", Feb:"100%", Mar:"100%", Apr:"100%", May:"100%", Jun:"100%", Jul:"100%", Aug:"100%", Sep:"100%", Oct:"100%", Nov:"100%", Dec:"100%" },
  },
  {
    no: "2",
    section: "A" as const,
    perspektif: "Finansial",
    kpi: "Efisiensi Penggunaan Anggaran Operasional",
    satuan: "%",
    formula: "Nilai Akhir",
    bobot: "5%",
    definisi: "Persentase realisasi anggaran vs rencana operasional — semakin mendekati target anggaran semakin baik",
    source: "Sistem Anggaran SAP",
    baseline2025: "93%",
    target2026: "95%",
    polaritas: "Maximize" as const,
    detailFormula: "(1 - |Realisasi - Rencana| / Rencana) × 100%",
    keterangan: "Menghitung efisiensi relatif terhadap anggaran yang disetujui",
    monthlyTargets: { Jan:"95%", Feb:"95%", Mar:"95%", Apr:"95%", May:"95%", Jun:"95%", Jul:"95%", Aug:"95%", Sep:"95%", Oct:"95%", Nov:"95%", Dec:"95%" },
  },
  // ── Seksi B: Functional KPI (total 80%) ───────────────────────────────────
  {
    no: "3",
    section: "B" as const,
    perspektif: "Proses",
    kpi: "Akurasi Jurnal Akuntansi",
    satuan: "%",
    formula: "Rata-Rata",
    bobot: "20%",
    definisi: "Persentase jurnal akuntansi yang dibukukan tanpa kesalahan material pada periode berjalan",
    source: "Sistem SAP — Modul FI",
    baseline2025: "97%",
    target2026: "99%",
    polaritas: "Maximize" as const,
    detailFormula: "((Total jurnal - Jurnal salah) / Total jurnal) × 100%",
    keterangan: "Kesalahan material adalah selisih > Rp 500.000 dari nilai seharusnya",
    monthlyTargets: { Jan:"99%", Feb:"99%", Mar:"99%", Apr:"99%", May:"99%", Jun:"99%", Jul:"99%", Aug:"99%", Sep:"99%", Oct:"99%", Nov:"99%", Dec:"99%" },
  },
  {
    no: "4",
    section: "B" as const,
    perspektif: "Proses",
    kpi: "Ketepatan Rekonsiliasi Bank Bulanan",
    satuan: "%",
    formula: "Rata-Rata",
    bobot: "20%",
    definisi: "Persentase bulan dimana rekonsiliasi bank diselesaikan tepat waktu (maks. H+5) tanpa selisih yang belum terjelaskan",
    source: "Bank Statement + Laporan SAP",
    baseline2025: "98%",
    target2026: "100%",
    polaritas: "Maximize" as const,
    detailFormula: "(Bulan rekonsiliasi selesai tepat waktu & balance / Total bulan) × 100%",
    keterangan: "H+5 = tanggal 5 bulan berikutnya",
    monthlyTargets: { Jan:"100%", Feb:"100%", Mar:"100%", Apr:"100%", May:"100%", Jun:"100%", Jul:"100%", Aug:"100%", Sep:"100%", Oct:"100%", Nov:"100%", Dec:"100%" },
  },
  {
    no: "5",
    section: "B" as const,
    perspektif: "Customer",
    kpi: "Ketepatan Waktu Penyerahan Laporan Bulanan ke Manajemen",
    satuan: "Hari",
    formula: "Rata-Rata",
    bobot: "15%",
    definisi: "Rata-rata hari penyelesaian laporan keuangan bulanan internal (dihitung dari H+1 bulan berikutnya)",
    source: "Catatan Penyerahan Laporan Manajemen",
    baseline2025: "7",
    target2026: "5",
    polaritas: "Minimize" as const,
    detailFormula: "Rata-rata (tanggal selesai - tanggal 1 bulan berikutnya)",
    keterangan: "Target: laporan diserahkan maksimal H+5 setiap bulan",
    monthlyTargets: { Jan:"5", Feb:"5", Mar:"5", Apr:"5", May:"5", Jun:"5", Jul:"5", Aug:"5", Sep:"5", Oct:"5", Nov:"5", Dec:"5" },
  },
  {
    no: "6",
    section: "B" as const,
    perspektif: "Learning & Growth",
    kpi: "Jam Pelatihan & Pengembangan Kompetensi",
    satuan: "JPL",
    formula: "Jumlah",
    bobot: "15%",
    definisi: "Total jam pelajaran (JPL) pelatihan formal yang diikuti selama tahun berjalan",
    source: "Laporan Training HR / Sertifikat Pelatihan",
    baseline2025: "32",
    target2026: "40",
    polaritas: "Maximize" as const,
    detailFormula: "Penjumlahan semua JPL pelatihan yang tercatat di sistem HR",
    keterangan: "Termasuk e-learning, webinar, pelatihan internal, dan sertifikasi eksternal",
    monthlyTargets: { Jan:"4", Feb:"3", Mar:"4", Apr:"3", May:"4", Jun:"3", Jul:"4", Aug:"3", Sep:"4", Oct:"3", Nov:"4", Dec:"3" },
  },
  {
    no: "7",
    section: "B" as const,
    perspektif: "Proses",
    kpi: "Kepatuhan SOP Internal Keuangan",
    satuan: "%",
    formula: "Nilai Akhir",
    bobot: "10%",
    definisi: "Persentase proses keuangan yang dilaksanakan sesuai Standard Operating Procedure yang berlaku",
    source: "Internal Audit / Quality Review Semester",
    baseline2025: "95%",
    target2026: "100%",
    polaritas: "Maximize" as const,
    detailFormula: "(Temuan compliant / Total temuan audit) × 100%",
    keterangan: "Dinilai berdasarkan hasil internal audit semester yang dilakukan divisi QA",
    monthlyTargets: { Jan:"100%", Feb:"100%", Mar:"100%", Apr:"100%", May:"100%", Jun:"100%", Jul:"100%", Aug:"100%", Sep:"100%", Oct:"100%", Nov:"100%", Dec:"100%" },
  },
];

// ─── KPI Tracking Data (Jan–Jun 2026) ─────────────────────────────────────────
// For each KPI: target per month + realisasi per month
// KPI 4 (Rekonsiliasi Bank) - Mar realisasi 75% → triggers RCA

export interface MonthlyKPIData {
  target: string;
  realisasi: string;
  capaian?: number; // computed
}

// [kpiNo][month] → { target, realisasi }
export const EDWARD_KPI_TRACKING: Record<string, Record<string, MonthlyKPIData>> = {
  "1": {
    Jan: { target: "100%", realisasi: "100%" },
    Feb: { target: "100%", realisasi: "100%" },
    Mar: { target: "100%", realisasi: "100%" },
    Apr: { target: "100%", realisasi: "100%" },
    May: { target: "100%", realisasi: "100%" },
    Jun: { target: "100%", realisasi: "100%" },
  },
  "2": {
    Jan: { target: "95%",  realisasi: "95%"  },
    Feb: { target: "95%",  realisasi: "96%"  },
    Mar: { target: "95%",  realisasi: "94%"  },
    Apr: { target: "95%",  realisasi: "95%"  },
    May: { target: "95%",  realisasi: "97%"  },
    Jun: { target: "95%",  realisasi: "95%"  },
  },
  "3": {
    Jan: { target: "99%",  realisasi: "99%"  },
    Feb: { target: "99%",  realisasi: "100%" },
    Mar: { target: "99%",  realisasi: "98%"  },
    Apr: { target: "99%",  realisasi: "99%"  },
    May: { target: "99%",  realisasi: "100%" },
    Jun: { target: "99%",  realisasi: "99%"  },
  },
  "4": {
    Jan: { target: "100%", realisasi: "100%" },
    Feb: { target: "100%", realisasi: "100%" },
    Mar: { target: "100%", realisasi: "75%"  }, // ← RCA triggered
    Apr: { target: "100%", realisasi: "100%" },
    May: { target: "100%", realisasi: "100%" },
    Jun: { target: "100%", realisasi: "100%" },
  },
  "5": {
    // Minimize: realisasi 4 hari < target 5 hari → capaian = 100% (lebih baik dari target)
    Jan: { target: "5", realisasi: "4" },
    Feb: { target: "5", realisasi: "5" },
    Mar: { target: "5", realisasi: "6" }, // 6 > 5 → capaian buruk
    Apr: { target: "5", realisasi: "4" },
    May: { target: "5", realisasi: "5" },
    Jun: { target: "5", realisasi: "4" },
  },
  "6": {
    // JPL pelatihan (Jumlah)
    Jan: { target: "4", realisasi: "4"  },
    Feb: { target: "3", realisasi: "3"  },
    Mar: { target: "4", realisasi: "4"  },
    Apr: { target: "3", realisasi: "3"  },
    May: { target: "4", realisasi: "4"  },
    Jun: { target: "3", realisasi: "3"  },
  },
  "7": {
    Jan: { target: "100%", realisasi: "100%" },
    Feb: { target: "100%", realisasi: "100%" },
    Mar: { target: "100%", realisasi: "100%" },
    Apr: { target: "100%", realisasi: "100%" },
    May: { target: "100%", realisasi: "100%" },
    Jun: { target: "100%", realisasi: "100%" },
  },
};

export const EDWARD_TRACKING_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

// ─── RCA Data (triggered by KPI 4 March < 80%) ───────────────────────────────

export const EDWARD_RCA = {
  id: "rca-001",
  periode: "Mar 2026",
  kpi: "Ketepatan Rekonsiliasi Bank Bulanan",
  satuan: "%",
  target: "100%",
  actual: "75%",
  capaian: 75,
  masalahUtama: "Rekonsiliasi bank Maret tidak selesai tepat waktu akibat perubahan format laporan dari pihak bank yang tidak dikomunikasikan",
  kenapaA: "Tim keuangan tidak mendapat pemberitahuan resmi perubahan format laporan rekening koran dari Bank BCA sebelum H-3",
  kenapaB: "Koordinasi antara Account Manager Bank dan Bagian Treasury perusahaan tidak berjalan efektif — tidak ada mekanisme notifikasi perubahan sistem bank",
  kenapaC: "Belum ada SOP khusus yang mengatur kewajiban koordinasi antara pihak bank mitra dan petugas treasury untuk setiap perubahan sistem",
  status: "Approved" as const,
  submittedDate: "05/04/2026",
  actionPlans: [
    {
      id: "ap-001",
      action: "Penyusunan SOP Koordinasi Perubahan Sistem Bank dan Notifikasi",
      targetDate: "30/04/2026",
      pic: "Edward David & Kepala Bagian Treasury",
      status: "Selesai" as const,
      keterangan: "SOP telah disusun, disetujui Kepala Departemen, dan disosialisasikan ke seluruh tim keuangan",
      output: "Dokumen SOP Koordinasi Perubahan Sistem Bank — versi 1.0",
    },
    {
      id: "ap-002",
      action: "Koordinasi langsung dengan Account Manager BCA untuk membuat channel notifikasi WhatsApp resmi",
      targetDate: "15/04/2026",
      pic: "Edward David",
      status: "Selesai" as const,
      keterangan: "Group WA resmi sudah dibuat dengan Account Manager BCA, BNI, dan Mandiri. Notifikasi perubahan sistem akan dikirimkan minimal H-7",
      output: "3 group WhatsApp resmi dengan AM masing-masing bank mitra",
    },
    {
      id: "ap-003",
      action: "Evaluasi dan testing ulang template rekonsiliasi bank menggunakan format baru",
      targetDate: "25/04/2026",
      pic: "Edward David & Tim Akuntansi",
      status: "Selesai" as const,
      keterangan: "Template Excel rekonsiliasi bank sudah diperbarui mengikuti format laporan rekening koran BCA terbaru",
      output: "Template rekonsiliasi bank v2.0 — telah diuji untuk bulan April 2026",
    },
  ],
};

// ─── SMART Goals ─────────────────────────────────────────────────────────────

export const EDWARD_SMART_GOALS = [
  {
    id: 1,
    label: "Meningkatkan Akurasi Pelaporan Keuangan ke Level 100%",
    specific: "Mencapai tingkat akurasi laporan keuangan bulanan sebesar 100% — nol kesalahan material — melalui penerapan checklist verifikasi berlapis dan review empat mata sebelum penyerahan ke manajemen",
    measurable: "Diukur dari jumlah temuan kesalahan material (selisih > Rp 500.000) per laporan bulanan; target 0 temuan sepanjang 2026",
    attainable: "Target tercapai dengan mengimplementasikan checklist verifikasi 3-layer yang sudah disusun, memanfaatkan fitur validasi otomatis SAP FI, dan jadwal review bersama supervisor setiap tanggal 28",
    relevant: "Akurasi laporan keuangan merupakan fondasi kepercayaan manajemen terhadap data keuangan perusahaan dan memengaruhi kualitas pengambilan keputusan strategis",
    timely: "Target dicapai secara berkelanjutan setiap bulan mulai Januari 2026, dengan evaluasi progres per kuartal pada Q1 (Mar), Q2 (Jun), Q3 (Sep), dan Q4 (Des)",
    bukti: "Laporan QC bulanan, lembar checklist verifikasi bertanda tangan supervisor, dan tidak adanya temuan audit internal",
    target: "0 temuan kesalahan material sepanjang Januari–Desember 2026",
    actionPlans: [
      { id: "sg1-ap1", description: "Susun dan terapkan checklist verifikasi 3-layer sebelum submit laporan", status: "Selesai" as const, progress: 100 },
      { id: "sg1-ap2", description: "Jadwalkan sesi review bersama supervisor setiap tanggal 28 per bulan", status: "Selesai" as const, progress: 100 },
      { id: "sg1-ap3", description: "Konfigurasi validasi otomatis SAP FI untuk mendeteksi posting anomali", status: "Selesai" as const, progress: 100 },
    ],
    targetVsActual: {
      target: "0 temuan kesalahan material per bulan",
      actual: "0 temuan material Jan–Jun 2026 (6/6 bulan clean)",
      status: "Tercapai" as const,
    },
    approverScore: { a1: 88, a2: 86 },
    approverNote: "Konsisten mempertahankan akurasi tinggi. Checklist yang disusun telah diadopsi oleh seluruh tim akuntansi sebagai best practice.",
  },
  {
    id: 2,
    label: "Digitalisasi dan Otomasi Proses Rekonsiliasi Bank",
    specific: "Membangun template Excel semi-otomatis yang terintegrasi dengan ekspor data SAP FI untuk mempercepat proses rekonsiliasi bank bulanan dari rata-rata 7 hari menjadi maksimal 5 hari",
    measurable: "Diukur dari rata-rata jumlah hari penyelesaian rekonsiliasi bank per bulan; target ≤5 hari. Juga diukur dari % pengurangan waktu input manual",
    attainable: "Dapat dicapai dengan mengembangkan template Excel berbasis VBA/macro yang otomatis membaca ekspor SAP dan mencocokkan dengan data rekening koran bank",
    relevant: "Rekonsiliasi tepat waktu mendukung ketersediaan data kas yang akurat untuk keputusan likuiditas manajemen, serta mengurangi risiko kesalahan entri manual",
    timely: "Pengembangan template selesai Q1 2026 (Maret), piloting Q2, full implementation mulai Q3 2026",
    bukti: "File template rekonsiliasi v2.0, laporan waktu penyelesaian per bulan, dokumentasi pengurangan jam kerja manual",
    target: "Rata-rata penyelesaian rekonsiliasi bank ≤5 hari per bulan (Jan–Des 2026)",
    actionPlans: [
      { id: "sg2-ap1", description: "Analisis proses rekonsiliasi saat ini dan identifikasi bottleneck utama", status: "Selesai" as const, progress: 100 },
      { id: "sg2-ap2", description: "Kembangkan template Excel semi-otomatis dengan VBA untuk matching data SAP vs rekening koran", status: "Selesai" as const, progress: 100 },
      { id: "sg2-ap3", description: "Piloting template pada rekonsiliasi April 2026 dan kumpulkan feedback tim", status: "Selesai" as const, progress: 100 },
      { id: "sg2-ap4", description: "Implementasi penuh mulai Juli 2026 dan dokumentasikan panduan penggunaan", status: "Sedang dilaksanakan" as const, progress: 60 },
    ],
    targetVsActual: {
      target: "Rata-rata rekonsiliasi ≤5 hari/bulan",
      actual: "Rata-rata 4,5 hari (Jan–Jun 2026) — melampaui target",
      status: "Tercapai" as const,
    },
    approverScore: { a1: 91, a2: 89 },
    approverNote: "Inisiatif yang sangat baik. Template yang dikembangkan Edward telah menghemat ~12 jam kerja tim per bulan. Rekomendasikan untuk diperluas ke rekonsiliasi piutang.",
  },
  {
    id: 3,
    label: "Peningkatan Kompetensi Perpajakan dan Standar Akuntansi PSAK Terbaru",
    specific: "Menyelesaikan minimal 40 jam pelatihan formal di bidang perpajakan (PPh Badan, PPN) dan pembaruan PSAK (72 Revenue Recognition, 73 Leases) untuk memperkuat kualitas pelaporan keuangan sesuai standar terkini",
    measurable: "Diukur dari total jam pelatihan (JPL) yang tercatat dan tersertifikasi; target 40 JPL sepanjang 2026. Juga diukur dari hasil tes post-training (min. 80)",
    attainable: "Target tercapai melalui kombinasi e-learning IAI, webinar Brevet Pajak, dan pelatihan internal yang sudah disetujui dalam rencana pengembangan divisi",
    relevant: "Regulasi perpajakan dan standar PSAK terus berkembang. Peningkatan kompetensi ini secara langsung memengaruhi kualitas laporan keuangan dan meminimalkan risiko ketidakpatuhan",
    timely: "Distribusi pelatihan tersebar merata sepanjang tahun (3–4 JPL per bulan) dengan target milestone: 20 JPL di akhir H1 (Juni) dan 40 JPL di akhir H2 (Desember)",
    bukti: "Sertifikat pelatihan, konfirmasi kehadiran e-learning IAI, laporan training dari divisi HR, dan hasil tes post-training",
    target: "Menyelesaikan 40 JPL pelatihan formal (perpajakan & PSAK) dengan nilai post-training ≥80 sepanjang 2026",
    actionPlans: [
      { id: "sg3-ap1", description: "Daftar dan selesaikan program Brevet Pajak A & B (12 JPL) — Q1 2026", status: "Selesai" as const, progress: 100 },
      { id: "sg3-ap2", description: "Ikuti 4 sesi webinar PSAK Update (PSAK 72 & 73) via IAI — Q1-Q2 2026", status: "Selesai" as const, progress: 100 },
      { id: "sg3-ap3", description: "Ikuti pelatihan internal SAP FI Advanced (8 JPL) yang diselenggarakan IT Dept — Q2 2026", status: "Selesai" as const, progress: 100 },
      { id: "sg3-ap4", description: "Selesaikan sertifikasi ACCA Paper FA (Foundation in Accountancy) — H2 2026", status: "Sedang dilaksanakan" as const, progress: 45 },
    ],
    targetVsActual: {
      target: "40 JPL pelatihan formal sepanjang 2026",
      actual: "21 JPL tercapai di H1 (Jan–Jun 2026) — on track",
      status: "Tercapai" as const,
    },
    approverScore: { a1: 84, a2: 82 },
    approverNote: "Progress pelatihan on track. Nilai brevet pajak Edward memuaskan (87/100). Dorongan untuk juga mengambil sertifikasi akuntansi profesional di H2.",
  },
];

// ─── Appraisal Form — Self Assessment ────────────────────────────────────────

export const EDWARD_APPRAISAL_SELF = {
  formA: {
    saved: true,
    ratings: [4, 4, 4, 3, 4, 4, 4, 5, 4, 3, 4, 4], // 12 items
    avg: 3.92,
  },
  formB: {
    saved: true,
    ratings: [4, 4, 3, 4, 4], // 5 items
    avg: 3.8,
  },
  formC: {
    saved: true,
    ratings: [4, 4, 3], // 3 items
    avg: 3.67,
  },
};

export const EDWARD_APPRAISAL_APPROVER = {
  formA: { ratings: [4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4], avg: 4.08 },
  formB: { ratings: [4, 4, 4, 4, 4], avg: 4.0 },
  formC: { ratings: [4, 4, 4], avg: 4.0 },
};

// ─── Project Outside Job Scope ────────────────────────────────────────────────

export const EDWARD_PROJECTS = [
  {
    id: "proj-001",
    no: 1,
    category: "Improvement Project" as const,
    scope: "QCC",
    bobot: 25,
    projectName: "Implementasi Template Rekonsiliasi Bank Semi-Otomatis",
    description: "Pengembangan template Excel berbasis VBA macro yang terintegrasi dengan ekspor data SAP FI untuk mengotomasi proses pencocokan data rekening koran bank dengan buku besar perusahaan, menghemat waktu rekonsiliasi dari 7 hari menjadi 4 hari",
    startDate: "01/02/2026",
    endDate: "30/06/2026",
    role: "Lead Developer & Koordinator",
    expectedOutput: "Template rekonsiliasi bank v2.0 yang sudah teruji, panduan penggunaan, dan laporan penghematan waktu proses",
    checkInStatus: "on_track" as const,
    progressPercent: 75,
    progressNotes: "Template versi 2.0 sudah selesai dikembangkan dan berhasil diuji coba pada rekonsiliasi April–Juni 2026. Tahap terakhir adalah dokumentasi panduan pengguna dan sosialisasi ke seluruh anggota tim keuangan.",
    actualOutput: "Template Excel rekonsiliasi bank v2.0 yang terintegrasi dengan SAP FI; telah mengurangi waktu rekonsiliasi dari rata-rata 7 hari menjadi 4,5 hari per bulan",
    status: "submitted" as const,
    submittedDate: "15/03/2026",
    approvalStatus: "Approved" as const,
  },
];

// ─── Score Summary (for My Performance Appraisal) ────────────────────────────

// Level Operasional: KPI 50%, SMART Goals 20%, Appraisal Form 15%, Project 15%
export const EDWARD_SCORE_SUMMARY = {
  year: "2026",
  status: "In Progress" as const,
  modules: {
    kpi: {
      label: "KPI",
      weight: 50,
      currentScore: 94.2,
      approvalStatus: "Approved" as const,
    },
    smartGoals: {
      label: "SMART Goals",
      weight: 20,
      currentScore: 87.5,
      approvalStatus: "Approved" as const,
    },
    appraisalForm: {
      label: "Appraisal Form",
      weight: 15,
      currentScore: 80.2,
      approvalStatus: "Approved" as const,
    },
    project: {
      label: "Project Outside",
      weight: 15,
      currentScore: 75.0,
      approvalStatus: "Pending" as const,
    },
  },
  overallScore: null as number | null, // computed at year end
  grade: null as string | null,
};

// (50% × 94.2) + (20% × 87.5) + (15% × 80.2) + (15% × 75.0)
// = 47.1 + 17.5 + 12.03 + 11.25 = 87.88

export const EDWARD_HISTORICAL_SCORES = {
  "2025": { kpi: 89, smartGoals: 85, appraisalForm: 78, project: 70, overall: 85.3, grade: "A" },
  "2024": { kpi: 84, smartGoals: 80, appraisalForm: 76, project: 65, overall: 80.7, grade: "A" },
  "2023": { kpi: 78, smartGoals: 72, appraisalForm: 74, project: 60, overall: 75.1, grade: "B" },
};

// ─── Cycle Timeline (for Dashboard) ──────────────────────────────────────────

export const EDWARD_CYCLE = {
  setting: {
    status: "Completed" as const,
    completedDate: "20/01/2026",
    kpiSubmitted: true,
    projectRegistered: true,
  },
  measurement: {
    status: "In Progress" as const,
    dueDate: "30/07/2026",
    kpiTracking: { monthsDone: 6, monthsTotal: 12 },
    smartGoals: { submitted: true, approved: true },
    appraisalForm: { submitted: true, approved: true },
    rca: { required: 1, submitted: 1, approved: 1 },
    project: { submitted: true, approved: true },
  },
  approval: {
    status: "Not Started" as const,
    dueDate: "01/08/2026",
  },
  dialogue: {
    status: "Not Started" as const,
    dueDate: "01/12/2026",
  },
};
