import React, { useEffect, useState } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import {
  FileText, Download, BookOpen, Target, TrendingUp, Lightbulb, ClipboardList, FolderKanban, Users, ChevronDown,
  ChevronUp, Info, Search, Plus, Pencil, Send, EyeOff, Trash2, Video, Paperclip, MessageSquare, Network, Layers, X,
} from "lucide-react";
import { toast } from "sonner";
import { loadPersistedState, savePersistedState, uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { isAdminOrHrIcfRole, useAuthStore } from "../../store/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocTab =
  | "Overview"
  | "KPI"
  | "RCA"
  | "SMART Goals"
  | "Appraisals Form"
  | "Managerial Skill"
  | "Project Outside Job Scope"
  | "Inter-Department Feedback"
  | "Management Interview"
  | "Other";

interface DocSection {
  title: string;
  content: string;
}

interface DocAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  kind: "file" | "video";
}

interface DocEntry {
  id: string;
  title: string;
  type: "Guide" | "Template" | "Reference" | "FAQ";
  description: string;
  sections: DocSection[];
  attachments?: DocAttachment[];
  status?: "Draft" | "Published";
  updatedAt?: string;
  updatedBy?: string;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: DocTab; icon: React.ElementType; color: string; bg: string }[] = [
  { id: "Overview",                   icon: BookOpen,      color: "text-[#1A284F]", bg: "bg-[#1A284F]/10" },
  { id: "KPI",                        icon: TrendingUp,    color: "text-blue-700",  bg: "bg-blue-50" },
  { id: "RCA",                        icon: Target,        color: "text-rose-700",  bg: "bg-rose-50" },
  { id: "SMART Goals",                icon: Lightbulb,     color: "text-amber-700", bg: "bg-amber-50" },
  { id: "Appraisals Form",            icon: ClipboardList, color: "text-green-700", bg: "bg-green-50" },
  { id: "Managerial Skill",           icon: Users,         color: "text-purple-700",bg: "bg-purple-50" },
  { id: "Project Outside Job Scope",  icon: FolderKanban,  color: "text-teal-700",  bg: "bg-teal-50" },
  { id: "Inter-Department Feedback",  icon: Network,       color: "text-indigo-700",bg: "bg-indigo-50" },
  { id: "Management Interview",       icon: MessageSquare, color: "text-cyan-700",  bg: "bg-cyan-50" },
  { id: "Other",                      icon: Layers,        color: "text-gray-700",  bg: "bg-gray-100" },
];

const DOCS_KEY = "pa_documents_v1";
type DocsMap = Partial<Record<DocTab, DocEntry[]>>;

function loadDocs(): DocsMap {
  const saved = loadPersistedState<DocsMap | null>(DOCS_KEY, null);
  if (saved && typeof saved === "object") return saved;
  // Data bawaan dianggap sudah Published
  const seed: DocsMap = {};
  for (const [k, list] of Object.entries(DEFAULT_DOCS)) seed[k as DocTab] = (list ?? []).map((d) => ({ ...d, status: "Published" }));
  return seed;
}

// ─── Document data ────────────────────────────────────────────────────────────

const DEFAULT_DOCS: Partial<Record<DocTab, DocEntry[]>> = {
  Overview: [
    {
      id: "ov-1",
      title: "Performance Appraisal 2026 — Complete Guide",
      type: "Guide",
      description: "End-to-end overview of the 2026 appraisal cycle: timeline, modules, weights, and approval flow.",
      sections: [
        {
          title: "What is Performance Appraisal?",
          content:
            "Penilaian Kinerja adalah proses terstruktur tahunan untuk mengukur kontribusi individu terhadap tujuan organisasi. Penilaian ini mencakup pencapaian KPI, SMART Goals, kompetensi perilaku (Formulir Penilaian), Keterampilan Manajerial (bagi supervisor), dan Proyek di Luar Lingkup Kerja.",
        },
        {
          title: "2026 Cycle Timeline",
          content:
            "• 1 Jan – 31 Jan: Penetapan Penilaian Kinerja (KPI, SMART Goals, pendaftaran Proyek)\n• 1 Feb – 31 Jul: Measurement Tengah Tahun (Tracking KPI, Formulir Penilaian, RCA, check-in Proyek)\n• 1 Agu – 31 Agu: Persetujuan Supervisor\n• 1 Sep – 30 Nov: Penilaian Akhir Tahun\n• 1 Des – 15 Des: Publikasi Hasil Penilaian",
        },
        {
          title: "Module Weights",
          content:
            "• KPI — 50%\n• SMART Goals — 20%\n• Formulir Penilaian (Kompetensi Perilaku) — 20%\n• Proyek di Luar Lingkup Kerja — 10%\n\nCatatan: Keterampilan Manajerial menggantikan sebagian bobot Formulir Penilaian bagi karyawan setingkat supervisor ke atas.",
        },
        {
          title: "Approval Flow",
          content:
            "Karyawan mengisi formulir → Supervisor langsung mereview → HR memvalidasi → Manajemen menyetujui → Hasil dipublikasikan kepada karyawan.",
        },
        {
          title: "Grading Scale",
          content:
            "• 90–100 → Istimewa (5)\n• 80–89 → Melampaui Ekspektasi (4)\n• 70–79 → Memenuhi Ekspektasi (3)\n• 60–69 → Di Bawah Ekspektasi (2)\n• < 60 → Tidak Memuaskan (1)",
        },
      ],
    },
    {
      id: "ov-2",
      title: "Quick-Start Checklist for Employees",
      type: "Reference",
      description: "Step-by-step checklist to make sure you complete every required item before each deadline.",
      sections: [
        {
          title: "Setting Phase (Jan)",
          content:
            "☐ Tinjau dan konfirmasi target KPI bersama supervisor\n☐ Tulis minimal 3 SMART Goals yang selaras dengan KPI Anda\n☐ Daftarkan minimal 1 Proyek di Luar Lingkup Kerja\n☐ Kirimkan semua item Penetapan untuk persetujuan supervisor sebelum 31 Januari",
        },
        {
          title: "Measurement Phase (Feb – Jul)",
          content:
            "☐ Perbarui realisasi KPI setiap bulan\n☐ Isi penilaian mandiri perilaku pada Formulir Penilaian\n☐ Selesaikan RCA untuk KPI yang di bawah target\n☐ Perbarui status measurement dan persentase kemajuan Proyek\n☐ Kirimkan Measurement sebelum 30 Juli",
        },
        {
          title: "Year-End Phase (Sep – Nov)",
          content:
            "☐ Konfirmasi realisasi KPI akhir\n☐ Finalisasi skor Formulir Penilaian\n☐ Konfirmasi status penyelesaian proyek\n☐ Kirimkan untuk persetujuan akhir",
        },
      ],
    },
  ],

  KPI: [
    {
      id: "kpi-1",
      title: "KPI Setting — Filling Guide",
      type: "Guide",
      description: "How to define, categorise, and submit your KPI targets correctly for the 2026 appraisal year.",
      sections: [
        {
          title: "What is a KPI?",
          content:
            "Key Performance Indicator (KPI) adalah nilai terukur yang menunjukkan seberapa efektif seorang karyawan mencapai tujuan bisnis utama. KPI dibagi menjadi dua bagian:\n• Bagian A — KPI Objektif (tingkat korporat, bobot 20%)\n• Bagian B — KPI Fungsional (tingkat departemen, bobot 80%)",
        },
        {
          title: "KPI Components You Must Fill",
          content:
            "1. Perspektif — Pilih dari: Finansial, Proses, EHS, Customer, Learning & Growth\n2. Nama KPI — Judul yang jelas dan berorientasi pada tindakan\n3. Satuan — Satuan pengukuran (contoh: %, Rp Miliar, kasus/bulan)\n4. Formula Pencapaian — Cara menghitung pencapaian (Jumlah / Rata-Rata / Nilai Akhir)\n5. Bobot — Bobot KPI ini (jumlah semua KPI harus 100%)\n6. Definisi — Definisi jelas tentang apa yang diukur KPI\n7. Sumber Data — Sumber data untuk nilai realisasi\n8. Baseline 2025 — Realisasi tahun lalu\n9. Target 2026 — Target tahun ini\n10. Polaritas — Maksimalkan (lebih tinggi = lebih baik) atau Minimalkan (lebih rendah = lebih baik)\n11. Detail Formula — Rumus perhitungan yang tepat",
        },
        {
          title: "Bobot Rules",
          content:
            "• Jumlah seluruh bobot KPI harus tepat 100%.\n• Bagian A (KPI Objektif) harus mewakili 20% secara keseluruhan.\n• Bagian B (KPI Fungsional) harus mewakili 80% secara keseluruhan.\n• Bobot KPI individu bersifat fleksibel di dalam masing-masing bagian.",
        },
        {
          title: "Common Mistakes to Avoid",
          content:
            "✗ Nama KPI yang tidak spesifik (contoh: 'Tingkatkan kinerja') — buat lebih spesifik.\n✗ Sumber data tidak ada — setiap KPI membutuhkan sumber yang dapat dilacak.\n✗ Total bobot ≠ 100% — sistem akan menolak pengiriman.\n✗ Baseline dikosongkan — isi realisasi tahun lalu meskipun nilainya nol.",
        },
        {
          title: "Submission Steps",
          content:
            "1. Klik 'Tambah KPI' untuk memasukkan setiap indikator.\n2. Tinjau semua entri dalam mode Pratinjau.\n3. Pastikan total bobot sama dengan 100%.\n4. Klik 'Submit KPI' untuk dikirim ke supervisor guna mendapatkan persetujuan.",
        },
      ],
    },
    {
      id: "kpi-2",
      title: "KPI Tracking — Measurement Guide",
      type: "Guide",
      description: "How to update monthly actuals, interpret scores, and complete your mid-year KPI measurement.",
      sections: [
        {
          title: "How to Enter Monthly Actuals",
          content:
            "Buka menu Penilaian Kinerja Measurement → Tracking KPI. Untuk setiap KPI, masukkan nilai realisasi setiap bulan. Sistem secara otomatis menghitung skor pencapaian berdasarkan formula yang Anda tetapkan saat setting.",
        },
        {
          title: "Score Calculation",
          content:
            "• KPI Maksimalkan: Skor = (Realisasi / Target) × 100\n• KPI Minimalkan: Skor = (Target / Realisasi) × 100\n• Skor dibatasi maksimal 120% untuk mencegah inflasi akibat nilai yang ekstrem.",
        },
        {
          title: "RCA Trigger",
          content:
            "Jika KPI mana pun mencapai skor di bawah 80% dari target, Anda diwajibkan untuk mengisi Root Cause Analysis (RCA) di modul RCA. Kaitkan rencana tindakan Anda dengan KPI yang bersangkutan.",
        },
      ],
    },
  ],

  "SMART Goals": [
    {
      id: "sg-1",
      title: "SMART Goals — Filling Guide",
      type: "Guide",
      description: "How to write meaningful, measurable goals using the SMART framework for performance appraisal.",
      sections: [
        {
          title: "What are SMART Goals?",
          content:
            "SMART Goals adalah tujuan pengembangan pribadi atau peningkatan yang melengkapi KPI Anda. SMART merupakan singkatan dari:\n• Specific (Spesifik) — terdefinisi dengan jelas, tidak ambigu\n• Measurable (Terukur) — memiliki indikator yang dapat dikuantifikasi\n• Attainable (Dapat Dicapai) — realistis dan dapat diraih dalam periode tersebut\n• Relevant (Relevan) — selaras dengan KPI dan tujuan tim\n• Timely (Tepat Waktu) — memiliki tenggat waktu yang jelas",
        },
        {
          title: "Number of Goals Required",
          content:
            "Setiap karyawan wajib mendaftarkan minimal 3 SMART Goals per tahun. Tujuan harus mencakup berbagai area: minimal satu peningkatan proses, satu pengembangan kompetensi, dan satu kontribusi lintas fungsi.",
        },
        {
          title: "Writing Each Component",
          content:
            "Specific: Jawab Siapa, Apa, Di mana, Kapan, Mengapa.\nMeasurable: Sertakan metrik dan nilai target (contoh: 'mengurangi tingkat kesalahan dari 5% menjadi 2%').\nAttainable: Pastikan Anda memiliki sumber daya, kewenangan, dan kemampuan untuk mencapainya.\nRelevant: Jelaskan bagaimana tujuan ini mendukung KPI atau tujuan departemen Anda.\nTimely: Tetapkan tanggal penyelesaian yang konkret dalam tahun 2026.\nBukti: Nyatakan dokumen atau artefak apa yang akan membuktikan penyelesaian.",
        },
        {
          title: "Good vs Bad Example",
          content:
            "✗ Buruk: 'Meningkatkan komunikasi tim'\n✓ Baik: 'Mengadakan pertemuan sinkronisasi tim mingguan selama 30 menit dan mencapai tingkat kehadiran ≥80% pada Desember 2026, dibuktikan dengan daftar hadir.'",
        },
      ],
    },
  ],

  "Appraisals Form": [
    {
      id: "af-1",
      title: "Appraisal Form — Behavioural Competency Guide",
      type: "Guide",
      description: "How to assess your behavioural competencies honestly and accurately in the appraisal form.",
      sections: [
        {
          title: "Purpose of the Appraisal Form",
          content:
            "Formulir Penilaian mengukur kompetensi perilaku yang tidak tertangkap oleh KPI. Formulir ini menilai bagaimana Anda bekerja, bukan hanya apa yang Anda hasilkan. Kompetensi meliputi Kepemimpinan, Kerja Tim, Komunikasi, Pemecahan Masalah, dan Integritas.",
        },
        {
          title: "Rating Scale",
          content:
            "1 — Tidak pernah menunjukkan perilaku ini\n2 — Jarang menunjukkan perilaku ini\n3 — Kadang-kadang menunjukkan perilaku ini\n4 — Sering menunjukkan perilaku ini\n5 — Selalu/konsisten menunjukkan perilaku ini",
        },
        {
          title: "Self-Assessment vs Supervisor Assessment",
          content:
            "Anda terlebih dahulu melengkapi penilaian mandiri. Supervisor langsung Anda kemudian melakukan penilaian secara independen. Skor akhir adalah rata-rata berbobot:\n• Penilaian mandiri: 30%\n• Penilaian supervisor: 70%",
        },
        {
          title: "Tips for Honest Self-Assessment",
          content:
            "• Tinjau situasi dan contoh spesifik dari tahun yang lalu.\n• Jangan terlalu merendah atau terlalu meninggikan — kalibrasi sesuai deskripsi skala penilaian.\n• Siapkan bukti (email, laporan, umpan balik) untuk setiap kompetensi guna mendukung penilaian Anda.\n• Diskusikan skor yang meragukan dengan supervisor Anda secara proaktif.",
        },
      ],
    },
  ],

  "Project Outside Job Scope": [
    {
      id: "proj-1",
      title: "Project Outside Job Scope — Registration Guide",
      type: "Guide",
      description: "How to register, describe, and submit your project for the performance appraisal cycle.",
      sections: [
        {
          title: "What Qualifies as a Project Outside Job Scope?",
          content:
            "Proyek di luar tugas harian reguler Anda yang berkontribusi pada peningkatan organisasi. Terbagi dalam tiga kategori:\n\n1. Improvement Project\n   • SS (Suggestion System) — Small Idea Kaizen — Bobot 15%\n   • QCC (Quality Control Circle) — Small Group Activity — Bobot 25%\n   • QCP (Quality Control Project) — Cross Functional Kaizen Team — Bobot 40%\n\n2. Corporate Event — Kegiatan Korporat (Event, Engagement, Budaya) — Bobot 10%\n\n3. Komite/Task Force — P2K3, Food Safety, Lean/CI, dsb. — Bobot 10%",
        },
        {
          title: "Minimum Requirement",
          content:
            "Setiap karyawan wajib mendaftarkan dan menjalankan minimal 1 proyek per tahun. Kegagalan mendaftarkan proyek akan menghasilkan nilai nol untuk modul ini (10% dari total penilaian).",
        },
        {
          title: "Required Information When Registering",
          content:
            "• Kategori & Lingkup/Jenis Proyek\n• Nama Proyek — deskriptif dan spesifik\n• Deskripsi Proyek — latar belakang, tujuan, dan cakupan\n• Tanggal Mulai & Selesai\n• Peran Anda (Ketua, Wakil Ketua, Anggota, Fasilitator, Sponsor)\n• Output yang Diharapkan — target hasil yang terukur",
        },
        {
          title: "Measurement Updates",
          content:
            "Selama fase Measurement, Anda wajib memperbarui:\n• Status Measurement: Belum Dimulai / On Track / Berisiko / Selesai / Dibatalkan\n• Persentase Kemajuan (0–100)\n• Catatan Kemajuan — apa yang sudah dilakukan, hambatan, langkah selanjutnya\n• Output Aktual — hasil terukur yang telah dicapai sejauh ini",
        },
        {
          title: "Submission Deadline",
          content:
            "Pendaftaran proyek harus dikirimkan sebelum 31 Januari 2026. Pembaruan check-in harus diselesaikan sebelum 30 Juli 2026. Pengiriman terlambat memerlukan persetujuan HR.",
        },
      ],
    },
    {
      id: "proj-2",
      title: "Project Category Reference Table",
      type: "Reference",
      description: "Quick reference for all project categories, scopes, and their respective appraisal weights.",
      sections: [
        {
          title: "Category & Weight Summary",
          content:
            "No | Kategori              | Lingkup/Jenis                                        | Bobot\n---|-----------------------|------------------------------------------------------|------\n1  | Improvement Project   | SS — Small Idea Kaizen                               | 15%\n   |                       | QCC — Small Group Activity                           | 25%\n   |                       | QCP — Cross Functional Kaizen Team                   | 40%\n2  | Corporate Event       | Kegiatan Korporat (Event, Engagement, Budaya)        | 10%\n3  | Komite/Task Force     | Komite P2K3, Food Safety, Lean/CI, Tim Gugus Tugas  | 10%\n   |                       |                                        Total          | 100%",
        },
        {
          title: "Choosing the Right Category",
          content:
            "• Jika Anda menginisiasi atau berpartisipasi dalam ide peningkatan → pilih Improvement Project.\n• Jika Anda membantu mengorganisir acara perusahaan atau kegiatan budaya → pilih Corporate Event.\n• Jika Anda bertugas dalam komite tetap atau gugus tugas → pilih Komite/Task Force.\n• Jika ragu, konsultasikan dengan HR Business Partner Anda.",
        },
      ],
    },
  ],

  "Managerial Skill": [
    {
      id: "ms-1",
      title: "Managerial Skill Assessment — Guide",
      type: "Guide",
      description: "For supervisors and managers: how to complete the managerial skill assessment module.",
      sections: [
        {
          title: "Who Must Complete This?",
          content:
            "Semua karyawan setingkat Supervisor (Grade 7 ke atas) wajib mengisi penilaian Keterampilan Manajerial selain Formulir Penilaian standar.",
        },
        {
          title: "Competency Areas Assessed",
          content:
            "1. Pengembangan Sumber Daya — pembinaan, mentoring, pengembangan kemampuan tim\n2. Pengambilan Keputusan — kualitas dan kecepatan keputusan di bawah tekanan\n3. Pemikiran Strategis — kemampuan menyelaraskan pekerjaan tim dengan arah perusahaan\n4. Manajemen Perubahan — memimpin tim melalui perubahan organisasi\n5. Manajemen Sumber Daya — penggunaan anggaran, sumber daya manusia, dan waktu secara efisien",
        },
        {
          title: "Rating and Weight",
          content:
            "Menggunakan skala 1–5 yang sama seperti Formulir Penilaian. Keterampilan Manajerial berkontribusi 10% dari total skor penilaian bagi supervisor, menggantikan 10% dari Formulir Penilaian standar.",
        },
      ],
    },
  ],

  RCA: [
    {
      id: "rca-1",
      title: "Root Cause Analysis (RCA) — Filling Guide",
      type: "Guide",
      description: "How to complete the RCA module when a KPI falls below its target threshold.",
      sections: [
        {
          title: "When is RCA Required?",
          content:
            "RCA wajib dilakukan untuk setiap KPI yang pencapaian realisasinya di bawah 80% dari target pada periode mana pun. Ketentuan ini berlaku baik saat measurement tengah tahun maupun penilaian akhir tahun.",
        },
        {
          title: "The 5-Why Structure Used",
          content:
            "Sistem menggunakan 5-Why yang disederhanakan dengan 3 tingkat:\n• A — Masalah Utama (masalah akar yang teridentifikasi)\n• B — Kenapa A? (penyebab tingkat pertama)\n• C — Kenapa B? (penyebab tingkat kedua)\n• D — Kenapa C? (akar penyebab — tindakan harus menargetkan tingkat ini)",
        },
        {
          title: "Action Plan Requirements",
          content:
            "Untuk setiap RCA, Anda wajib menambahkan minimal satu Rencana Tindakan yang berisi:\n• Deskripsi Tindakan — tindakan korektif yang spesifik\n• Target Penyelesaian — tanggal tenggat waktu\n• PIC — orang yang bertanggung jawab\n• Status Perbaikan — Belum dilaksanakan / Sedang dilaksanakan / Selesai\n• Keterangan — catatan terkini\n• Output — hasil yang diharapkan dari tindakan",
        },
        {
          title: "Common Mistakes",
          content:
            "✗ Mencantumkan gejala sebagai akar penyebab (contoh: 'target tidak tercapai' bukan merupakan akar penyebab).\n✗ Rencana tindakan yang menangani B, bukan D.\n✗ PIC ditetapkan sebagai tim, bukan individu dengan nama lengkap.\n✗ Tidak ada tanggal target pada rencana tindakan.",
        },
      ],
    },
    {
      id: "rca-2",
      title: "RCA FAQ",
      type: "FAQ",
      description: "Frequently asked questions about the RCA module.",
      sections: [
        {
          title: "Q: Do I need to do RCA for every KPI?",
          content: "Tidak. RCA hanya diperlukan untuk KPI yang pencapaiannya di bawah 80% dari target. KPI yang mencapai 80% atau lebih tidak memerlukan RCA.",
        },
        {
          title: "Q: Can I have multiple action plans per RCA?",
          content: "Ya. Anda harus menambahkan rencana tindakan sebanyak yang diperlukan untuk sepenuhnya mengatasi akar penyebab. Setiap rencana tindakan harus menangani tindakan korektif yang berbeda.",
        },
        {
          title: "Q: What happens if I don't complete RCA on time?",
          content: "RCA yang tidak lengkap untuk KPI yang terpicu akan mengakibatkan pengurangan skor KPI secara keseluruhan dan dapat menunda persetujuan penilaian Anda.",
        },
        {
          title: "Q: Who reviews my RCA?",
          content: "Supervisor langsung Anda meninjau dan memvalidasi RCA sebagai bagian dari alur persetujuan. HR juga dapat mengaudit kelengkapan RCA selama periode peninjauan.",
        },
      ],
    },
  ],
};

// ─── Doc card with expandable sections ───────────────────────────────────────

const TYPE_STYLE: Record<DocEntry["type"], string> = {
  Guide:     "bg-[#1A284F] text-white",
  Template:  "bg-amber-500 text-white",
  Reference: "bg-teal-600 text-white",
  FAQ:       "bg-purple-600 text-white",
};

function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function downloadDoc(doc: DocEntry) {
  const text = [doc.title, "", doc.description, "", ...doc.sections.flatMap((s) => [`## ${s.title}`, s.content, ""])].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.title.replace(/[^\w\- ]+/g, "").trim() || "document"}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AttachmentView({ att }: { att: DocAttachment }) {
  if (att.kind === "video") {
    const emb = youtubeEmbed(att.url);
    return emb ? (
      <iframe src={emb} title={att.name} className="aspect-video w-full rounded-xl border" allowFullScreen />
    ) : (
      <a href={att.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[#1A284F] underline">
        <Video className="h-4 w-4" /> {att.name || att.url}
      </a>
    );
  }
  const isImg = att.mimeType.startsWith("image/");
  const isPdf = att.mimeType === "application/pdf";
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {isImg && <img src={att.url} alt={att.name} className="max-h-96 w-full bg-gray-50 object-contain" />}
      {isPdf && <iframe src={att.url} title={att.name} className="h-96 w-full" />}
      <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-xs">
        <span className="truncate font-medium text-gray-700">{att.name}</span>
        <a href={att.url} download={att.name} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#1A284F] hover:underline">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      </div>
    </div>
  );
}

function DocCard({ doc, canManage, onEdit, onTogglePublish, onDelete }: {
  doc: DocEntry;
  canManage: boolean;
  onEdit: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
}) {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const toggle = (i: number) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const published = doc.status !== "Draft";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${TYPE_STYLE[doc.type]}`}>{doc.type}</span>
            {canManage && (
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${published ? "bg-emerald-50 text-emerald-700" : "bg-yellow-50 text-yellow-800"}`}>
                {published ? "Published" : "Draft"}
              </span>
            )}
          </div>
          <h3 className="font-bold text-[#1A284F] text-base leading-snug">{doc.title}</h3>
          <p className="text-xs text-gray-500 leading-relaxed">{doc.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canManage && (
            <>
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"><Pencil className="w-3.5 h-3.5" /> Edit</button>
              <button onClick={onTogglePublish} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${published ? "border border-gray-200 text-gray-600 hover:bg-gray-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                {published ? <><EyeOff className="w-3.5 h-3.5" /> Unpublish</> : <><Send className="w-3.5 h-3.5" /> Publish</>}
              </button>
              <button onClick={onDelete} title="Hapus" className="rounded-lg border border-gray-200 px-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </>
          )}
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50" onClick={() => downloadDoc(doc)}>
            <Download className="w-3.5 h-3.5" /> Download
          </button>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {doc.sections.map((sec, i) => (
          <div key={i}>
            <button onClick={() => toggle(i)} className="w-full flex items-center justify-between px-6 py-3 text-left hover:bg-gray-50 transition-colors">
              <span className="text-sm font-semibold text-gray-800">{sec.title}</span>
              {openSections.has(i) ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
            </button>
            {openSections.has(i) && (
              <div className="px-6 pb-4">
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{sec.content}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      {doc.attachments && doc.attachments.length > 0 && (
        <div className="grid gap-3 border-t border-gray-100 p-5 md:grid-cols-2">
          {doc.attachments.map((a) => <AttachmentView key={a.id} att={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Editor (Add New / Edit) ─────────────────────────────────────────────────

function DocEditor({ initial, tab, onCancel, onSave }: {
  initial: DocEntry | null;
  tab: DocTab;
  onCancel: () => void;
  onSave: (doc: DocEntry, publish: boolean) => void;
}) {
  const [doc, setDoc] = useState<DocEntry>(
    () => initial ?? { id: `doc-${Date.now()}`, title: "", type: "Guide", description: "", sections: [{ title: "", content: "" }], attachments: [], status: "Draft" },
  );
  const [videoUrl, setVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<DocEntry>) => setDoc((d) => ({ ...d, ...patch }));
  const setSec = (i: number, patch: Partial<DocSection>) => set({ sections: doc.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const valid = doc.title.trim() && doc.sections.every((s) => s.title.trim());

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: DocAttachment[] = [];
    for (const f of Array.from(files)) {
      if (!/^(image\/jpe?g|image\/png|application\/pdf)$/.test(f.type)) {
        toast.error(`${f.name}: hanya JPG, PNG, atau PDF`);
        continue;
      }
      const rec = await uploadEvidenceFileToSupabase(f, { moduleType: "Documents", kpiName: tab });
      if (rec.url) added.push({ id: rec.id, name: f.name, url: rec.url, mimeType: f.type, kind: "file" });
    }
    set({ attachments: [...(doc.attachments ?? []), ...added] });
    setUploading(false);
  }

  const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1A284F]";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onCancel}>
      <div className="my-8 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#1A284F]">{initial ? "Edit Document" : "Add New Document"} · {tab}</h3>
          <button onClick={onCancel} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 md:grid-cols-[160px_1fr]">
          <label className="text-xs font-bold text-gray-500">Tag
            <select value={doc.type} onChange={(e) => set({ type: e.target.value as DocEntry["type"] })} className={input + " mt-1"}>
              {(["Guide", "Template", "Reference", "FAQ"] as const).map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-gray-500">Judul Section *
            <input value={doc.title} onChange={(e) => set({ title: e.target.value })} className={input + " mt-1"} />
          </label>
        </div>
        <label className="block text-xs font-bold text-gray-500">Note Judul Section
          <textarea value={doc.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={input + " mt-1 resize-none"} />
        </label>
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#1A284F]">Sub Section (collapsible)</p>
          {doc.sections.map((sec, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <div className="flex gap-2">
                <input value={sec.title} onChange={(e) => setSec(i, { title: e.target.value })} placeholder="Judul Sub Section *" className={input} />
                {doc.sections.length > 1 && (
                  <button onClick={() => set({ sections: doc.sections.filter((_, j) => j !== i) })} className="rounded-lg px-2 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <textarea value={sec.content} onChange={(e) => setSec(i, { content: e.target.value })} placeholder="Isi kalimat…" rows={4} className={input + " resize-y"} />
            </div>
          ))}
          <button onClick={() => set({ sections: [...doc.sections, { title: "", content: "" }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A284F]"><Plus className="h-3.5 w-3.5" /> Tambah Sub Section</button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[#1A284F]">Add Document (JPG / PNG / PDF) & Video</p>
          <div className="flex flex-wrap gap-2">
            {(doc.attachments ?? []).map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs">
                {a.kind === "video" ? <Video className="h-3 w-3" /> : <Paperclip className="h-3 w-3" />}
                <span className="max-w-[200px] truncate">{a.name}</span>
                <button onClick={() => set({ attachments: (doc.attachments ?? []).filter((x) => x.id !== a.id) })} className="text-gray-400 hover:text-red-600"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#1A284F]/40 px-3 py-2 text-xs font-semibold text-[#1A284F] hover:bg-[#1A284F]/5">
              <Paperclip className="h-3.5 w-3.5" /> {uploading ? "Mengunggah…" : "Upload File"}
              <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" className="hidden" disabled={uploading} onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Link video (YouTube / URL)" className={input + " max-w-xs"} />
            <button
              disabled={!/^https?:\/\//.test(videoUrl)}
              onClick={() => { set({ attachments: [...(doc.attachments ?? []), { id: `vid-${Date.now()}`, name: videoUrl, url: videoUrl, mimeType: "video", kind: "video" }] }); setVideoUrl(""); }}
              className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              + Add Video
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <button onClick={onCancel} className="rounded-xl border px-4 py-2 text-sm">Batal</button>
          <button disabled={!valid} onClick={() => onSave(doc, false)} className="rounded-xl border border-[#1A284F] px-4 py-2 text-sm font-semibold text-[#1A284F] disabled:opacity-40">Simpan Draft</button>
          <button disabled={!valid} onClick={() => onSave(doc, true)} className="rounded-xl bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Simpan & Publish</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useRouteTab<DocTab>(TABS.map((t) => t.id), "Overview");
  const [search, setSearch] = useState("");
  const { activeUser } = useAuthStore();
  const canManage = isAdminOrHrIcfRole(activeUser.role);
  const [docsMap, setDocsMap] = useState<DocsMap>(() => loadDocs());
  const [editing, setEditing] = useState<{ doc: DocEntry | null } | null>(null);
  useEffect(() => {
    const r = () => setDocsMap(loadDocs());
    window.addEventListener("pa-db-hydrated", r);
    return () => window.removeEventListener("pa-db-hydrated", r);
  }, []);

  function persist(next: DocsMap, desc: string) {
    setDocsMap(next);
    savePersistedState(DOCS_KEY, next, {
      kind: "master-catalog",
      catalogKey: DOCS_KEY,
      data: next,
      audit: { userId: activeUser.employeeId, userName: activeUser.name, action: "Update", module: "Documents", subModule: activeTab, description: desc },
    });
  }
  const list = docsMap[activeTab] ?? [];
  const upsert = (doc: DocEntry, desc: string) => {
    const exists = list.some((d) => d.id === doc.id);
    persist({ ...docsMap, [activeTab]: exists ? list.map((d) => (d.id === doc.id ? doc : d)) : [...list, doc] }, desc);
  };

  const docs = canManage ? list : list.filter((d) => d.status !== "Draft");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? docs.filter((d) => d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.sections.some((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)))
    : docs;

  const activeTabMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Documents</h1>
          <p className="text-gray-500 text-sm">Performance appraisal filling guides, templates, and references</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm w-72">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" />
          </div>
          {canManage && (
            <button onClick={() => setEditing({ doc: null })} className="flex items-center gap-1.5 rounded-xl bg-[#1A284F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#131d3b]">
              <Plus className="h-4 w-4" /> Add New
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>These documents are official guides for completing each module of the 2026 Performance Appraisal. Read the relevant guide before filling any section.</span>
      </div>

      <div className="flex gap-1 flex-wrap border-b border-gray-200 pb-0">
        {TABS.map(({ id, icon: Icon, color, bg }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 ${activeTab === id ? `border-[#1A284F] ${bg} ${color}` : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {id}
          </button>
        ))}
      </div>

      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl w-fit ${activeTabMeta.bg}`}>
        <activeTabMeta.icon className={`w-4 h-4 ${activeTabMeta.color}`} />
        <span className={`text-xs font-bold uppercase tracking-wide ${activeTabMeta.color}`}>
          {activeTab} — {filtered.length} document{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <FileText className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-400 mb-1">No documents found</p>
          <p className="text-xs text-gray-400">{canManage ? "Klik Add New untuk menambahkan dokumen pada tab ini." : "Try a different search term or select another tab."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filtered.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              canManage={canManage}
              onEdit={() => setEditing({ doc })}
              onTogglePublish={() => {
                const next = { ...doc, status: doc.status === "Draft" ? "Published" as const : "Draft" as const };
                upsert(next, `${next.status === "Published" ? "Publish" : "Unpublish"} document "${doc.title}"`);
                toast.success(next.status === "Published" ? "Dokumen dipublish" : "Dokumen dikembalikan ke Draft");
              }}
              onDelete={() => {
                if (!window.confirm(`Hapus dokumen "${doc.title}"?`)) return;
                persist({ ...docsMap, [activeTab]: list.filter((d) => d.id !== doc.id) }, `Delete document "${doc.title}"`);
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <DocEditor
          initial={editing.doc}
          tab={activeTab}
          onCancel={() => setEditing(null)}
          onSave={(doc, publish) => {
            const next: DocEntry = { ...doc, status: publish ? "Published" : doc.status ?? "Draft", updatedAt: new Date().toISOString(), updatedBy: activeUser.name };
            upsert(next, `${editing.doc ? "Edit" : "Add"} document "${doc.title}"${publish ? " (Published)" : ""}`);
            toast.success(publish ? "Dokumen tersimpan & dipublish" : "Dokumen tersimpan sebagai Draft");
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
