import { useEffect, useState } from "react";
import {
  Users, ChevronDown, ChevronUp, Check, CheckCircle2, X,
  Search, Filter, Eye, FileText, Download, AlertCircle,
} from "lucide-react";
import { loadFeedbackSubmissions } from "../../shared/interDepartmentFeedbackStore";

// ── Constants ──────────────────────────────────────────────────────────────────

const INDICATORS = [
  { key: "q1", label: "Apa hal terbaik yang anda lihat dari cara individu tersebut bekerja?" },
  { key: "q2", label: "Menurut Anda, apa yang perlu ditingkatkan dari individu tersebut?" },
  { key: "q3", label: "Bagaimana individu tersebut berkontribusi terhadap rekan kerja sama tim atau lintas unit?" },
  { key: "q4", label: "Tolong deskripsikan satu contoh aktivitas/diskusi ketika individu tersebut membantu anda atau tim dengan baik?" },
  { key: "q5", label: "Apa saran Anda agar individu tersebut dapat bekerja lebih efektif?" },
];
const NEGATIVE_IND = new Set(["q2", "q5"]);
const getSentiment = (key: string) => NEGATIVE_IND.has(key) ? "negative" : "positive";

const APPROVER_COLS = [
  "Aspek Perbaikan", "Rencana Pengembangan", "Tindak Lanjut",
  "Evaluasi", "Timeline Evaluasi", "Indikator Keberhasilan",
] as const;

// ── Mock data ──────────────────────────────────────────────────────────────────

interface FbEntry { id: string; division: string; companyUnit: string; answers: Record<string, string> }
interface ApproverRow { [k: string]: string | undefined; evidenceFile?: string }
interface EvaluasiEntry { note: string; file?: string }

interface EmployeeRecord {
  id: string; name: string; unit: string; division: string; department: string; position: string;
  feedbacks: FbEntry[];
  summaries: Record<string, string>;
  approver: Record<"a1" | "a2", ApproverRow[]>;
  evaluasi: Record<string, EvaluasiEntry>;
  summarySubmitted: boolean;
}

const DATA: EmployeeRecord[] = [
  {
    id: "E002", name: "Ahmad Fauzi", unit: "PT RSUP (Industry)",
    division: "Divisi SDM", department: "Dept. Rekrutmen", position: "Staff HR",
    summarySubmitted: true,
    feedbacks: [
      {
        id: "rf1", division: "Finance & Accounting", companyUnit: "PT RSUP (Perkebunan)",
        answers: {
          q1: "Sangat proaktif dan selalu hadir dalam setiap diskusi lintas departemen dengan solusi konkret.",
          q2: "Terkadang kurang memberikan update progres secara berkala kepada anggota tim.",
          q3: "Mampu menjembatani kebutuhan tim teknis dan bisnis dengan sangat baik.",
          q4: "Pernah membantu tim kami menyelesaikan masalah laporan keuangan yang urgent di luar jam kerja.",
          q5: "Lebih sering berbagi best practice dengan tim lain agar pengetahuan tidak terpusat pada satu orang.",
        },
      },
      {
        id: "rf2", division: "Quality Management", companyUnit: "PT Pulau Sambu (Guntung)",
        answers: {
          q1: "Komunikasi yang baik dan responsif terhadap setiap permintaan antar departemen.",
          q2: "Perlu meningkatkan kemampuan delegasi tugas agar pekerjaan tidak terpusat pada dirinya.",
          q3: "Aktif berpartisipasi dalam project lintas unit dan selalu memberikan kontribusi yang terukur.",
          q4: "Membantu tim kami saat ada audit mendadak dari manajemen dengan menyediakan dokumen yang dibutuhkan.",
          q5: "Jadwalkan pertemuan rutin dengan departemen lain untuk sinkronisasi agar tidak terjadi miskomunikasi.",
        },
      },
      {
        id: "rf3", division: "Logistic / Materials", companyUnit: "PT Pulau Sambu (Jakarta)",
        answers: {
          q1: "Dedikasi tinggi dan selalu menyelesaikan pekerjaan tepat waktu meskipun dalam kondisi tekanan tinggi.",
          q2: "Perlu lebih fleksibel dalam menghadapi perubahan mendadak.",
          q3: "Berkontribusi positif dalam diskusi tim lintas departemen dengan perspektif yang konstruktif.",
          q4: "Membantu tim logistics saat ada bottleneck pengiriman dengan memberikan solusi cepat.",
          q5: "Tingkatkan kemampuan analisis data untuk mendukung pengambilan keputusan yang lebih baik.",
        },
      },
    ],
    summaries: {
      "rf1-q1": "Karyawan secara konsisten menunjukkan sikap proaktif dalam setiap diskusi lintas departemen.",
      "rf1-q2": "Perlu meningkatkan frekuensi update progres kepada anggota tim.",
      "rf1-q3": "Peran sebagai jembatan antara tim teknis dan bisnis sangat membantu kelancaran koordinasi.",
      "rf1-q4": "Kontribusi di luar jam kerja menunjukkan komitmen tinggi terhadap target tim.",
      "rf1-q5": "Akan mulai berbagi best practice secara rutin melalui sesi knowledge sharing bulanan.",
      "rf2-q1": "Responsivitas yang baik menjadi nilai tambah dalam koordinasi lintas unit.",
      "rf2-q2": "Sedang mengembangkan kemampuan delegasi dengan mengikuti coaching bersama supervisor.",
      "rf2-q3": "Partisipasi aktif dalam project lintas unit telah memberikan dampak positif yang terukur.",
      "rf2-q4": "Dukungan saat audit mendadak menunjukkan kesiapan dan profesionalisme yang tinggi.",
      "rf2-q5": "Akan menjadwalkan sync meeting bulanan dengan departemen terkait.",
      "rf3-q1": "Dedikasi dan ketepatan waktu menjadi standar kerja yang konsisten dipertahankan.",
      "rf3-q2": "Sedang mengembangkan fleksibilitas dalam menghadapi perubahan mendadak.",
      "rf3-q3": "Perspektif yang konstruktif dalam diskusi tim memperkaya proses pengambilan keputusan.",
      "rf3-q4": "Solusi cepat untuk bottleneck logistik berhasil diimplementasikan dengan sukses.",
      "rf3-q5": "Akan mengikuti pelatihan analisis data untuk meningkatkan kualitas pengambilan keputusan.",
    },
    approver: {
      a1: [
        { "Aspek Perbaikan": "Komunikasi lintas departemen", "Rencana Pengembangan": "Mengikuti pelatihan komunikasi efektif Q3 2026", "Tindak Lanjut": "Koordinasi dengan HR untuk pendaftaran pelatihan", "Evaluasi": "Evaluasi setelah 3 bulan pelaksanaan", "Timeline Evaluasi": "Oktober 2026", "Indikator Keberhasilan": "Peningkatan skor komunikasi minimal 15 poin" },
        { "Aspek Perbaikan": "Kemampuan delegasi tugas", "Rencana Pengembangan": "Coaching dengan direct supervisor setiap 2 minggu", "Tindak Lanjut": "Jadwal coaching ditetapkan mulai Agustus 2026", "Evaluasi": "Review progress delegasi di akhir Q3 2026", "Timeline Evaluasi": "September 2026", "Indikator Keberhasilan": "Minimal 3 tugas berhasil didelegasikan per bulan" },
      ],
      a2: [],
    },
    evaluasi: {
      "a1-0": { note: "Saya telah mengikuti pelatihan komunikasi efektif pada bulan September 2026. Teknik komunikasi baru sudah diterapkan dalam koordinasi lintas departemen.", file: "bukti_pelatihan_komunikasi_sept2026.pdf" },
      "a1-1": { note: "Proses coaching berjalan dengan baik. Saya sudah berhasil mendelegasikan 4 tugas per bulan kepada anggota tim, melampaui target minimal 3 tugas.", file: "laporan_delegasi_q3_2026.pdf" },
    },
  },
  {
    id: "E011", name: "Sari Dewi", unit: "PT RSUP (Industry)",
    division: "Divisi SDM", department: "Dept. Training", position: "Staff Training",
    summarySubmitted: true,
    feedbacks: [
      {
        id: "rf1", division: "Operations", companyUnit: "PT RSUP (Industry)",
        answers: {
          q1: "Sangat detail dalam menyiapkan materi pelatihan dan selalu update dengan metode terkini.",
          q2: "Kadang waktu penyelenggaraan training kurang fleksibel dengan jadwal operasional.",
          q3: "Berperan aktif dalam merancang program onboarding lintas divisi yang berdampak positif.",
          q4: "Membantu tim operasional dalam sesi training penggunaan sistem baru dengan sangat sabar.",
          q5: "Pertimbangkan jadwal training yang lebih fleksibel agar partisipasi lebih maksimal.",
        },
      },
      {
        id: "rf2", division: "Finance & Accounting", companyUnit: "PT RSUP (Perkebunan)",
        answers: {
          q1: "Sangat kompeten dan selalu siap membantu kebutuhan training antar departemen.",
          q2: "Evaluasi hasil training perlu diperkuat dengan indikator yang lebih terukur.",
          q3: "Inisiatif dalam mengembangkan modul pelatihan lintas fungsi sangat membantu peningkatan kompetensi.",
          q4: "Membantu finance team memahami SOP baru melalui sesi mini workshop yang efektif.",
          q5: "Tambahkan sesi follow-up pasca training untuk memastikan implementasi di lapangan.",
        },
      },
    ],
    summaries: {
      "rf1-q1": "Komitmen terhadap kualitas materi pelatihan terjaga dengan baik.",
      "rf1-q2": "Akan menyesuaikan jadwal training dengan kalender operasional mulai Q4 2026.",
      "rf1-q3": "Program onboarding lintas divisi telah memberikan dampak positif pada produktivitas karyawan baru.",
      "rf1-q4": "Kesabaran dalam memandu penggunaan sistem baru merupakan kekuatan yang perlu dipertahankan.",
      "rf1-q5": "Jadwal training fleksibel akan diterapkan menggunakan sistem booking mulai November 2026.",
      "rf2-q1": "Kesiapan membantu kebutuhan training lintas departemen akan terus dipertahankan.",
      "rf2-q2": "KPI evaluasi training akan diperbarui dengan indikator terukur pada Q4 2026.",
      "rf2-q3": "Pengembangan modul lintas fungsi akan diperluas ke divisi lainnya.",
      "rf2-q4": "Mini workshop terbukti efektif dan akan dijadikan format standar untuk implementasi SOP baru.",
      "rf2-q5": "Sesi follow-up 30 hari pasca training akan dimasukkan ke dalam standar program pelatihan.",
    },
    approver: {
      a1: [{ "Aspek Perbaikan": "Fleksibilitas jadwal training", "Rencana Pengembangan": "Implementasi sistem booking training online", "Tindak Lanjut": "Koordinasi dengan IT untuk pengembangan sistem", "Evaluasi": "Monitoring partisipasi training setelah sistem aktif", "Timeline Evaluasi": "November 2026", "Indikator Keberhasilan": "Peningkatan kehadiran training minimal 20%" }],
      a2: [{ "Aspek Perbaikan": "Evaluasi hasil training", "Rencana Pengembangan": "Menyusun KPI evaluasi training yang terukur", "Tindak Lanjut": "Workshop penyusunan KPI bersama tim L&D", "Evaluasi": "Review KPI baru di akhir Q4 2026", "Timeline Evaluasi": "Desember 2026", "Indikator Keberhasilan": "Tersedianya KPI evaluasi untuk setiap program training" }],
    },
    evaluasi: {
      "a1-0": { note: "Sistem booking training telah dikembangkan bersama IT dan akan diluncurkan pada November 2026. Uji coba internal menunjukkan hasil positif.", file: "prototype_booking_system.png" },
      "a2-0": { note: "KPI evaluasi training telah disusun dalam workshop L&D pada bulan Oktober 2026. Sebanyak 8 indikator baru telah ditetapkan." },
    },
  },
  {
    id: "E025", name: "Budi Santoso", unit: "PT RSUP (Industry)",
    division: "Divisi SDM", department: "Dept. Rekrutmen", position: "Senior Staff HR",
    summarySubmitted: true,
    feedbacks: [
      {
        id: "rf1", division: "Engineering", companyUnit: "PT RSTM",
        answers: { q1: "Sangat berpengalaman dalam proses rekrutmen dan selalu memberikan kandidat yang tepat sasaran.", q2: "Proses seleksi terkadang memakan waktu lebih lama dari yang dijadwalkan.", q3: "Berkolaborasi dengan baik dengan hiring manager di berbagai divisi dalam proses rekrutmen.", q4: "Membantu kami merekrut 5 engineer spesialis dalam waktu singkat untuk proyek darurat.", q5: "Optimalkan proses screening awal untuk mempercepat timeline rekrutmen." },
      },
      {
        id: "rf2", division: "Production", companyUnit: "PT GHS",
        answers: { q1: "Memiliki jaringan kandidat yang luas dan selalu siap dengan pipeline talenta yang berkualitas.", q2: "Komunikasi update status rekrutmen perlu lebih proaktif kepada hiring manager.", q3: "Aktif berbagi informasi pasar tenaga kerja yang berguna untuk perencanaan SDM.", q4: "Berhasil menemukan kandidat rare skill untuk posisi yang sulit diisi dalam waktu 3 minggu.", q5: "Tingkatkan frekuensi update status rekrutmen kepada stakeholder minimal seminggu sekali." },
      },
      {
        id: "rf3", division: "IT & Digital", companyUnit: "PT RSUP (Industry)",
        answers: { q1: "Sangat profesional dan mampu memahami kebutuhan teknis meskipun bukan dari latar IT.", q2: "Perlu lebih familiar dengan teknologi terkini agar proses rekrutmen IT lebih efektif.", q3: "Selalu berupaya memahami kebutuhan spesifik setiap divisi dalam proses rekrutmen.", q4: "Berhasil mengorganisir hiring event yang berhasil menarik 50+ kandidat IT berkualitas.", q5: "Ikuti perkembangan tren teknologi terkini agar lebih efektif dalam rekrutmen posisi teknis." },
      },
    ],
    summaries: {
      "rf1-q1": "Pengalaman rekrutmen menjadi nilai tambah yang diakui oleh berbagai divisi.",
      "rf1-q2": "Sedang menyusun SLA rekrutmen untuk memastikan timeline lebih terstruktur.",
      "rf1-q3": "Kolaborasi dengan hiring manager akan ditingkatkan melalui kick-off meeting di awal setiap proses.",
      "rf1-q4": "Keberhasilan rekrutmen engineer spesialis merupakan bukti efektivitas pendekatan targeted search.",
      "rf1-q5": "Proses screening awal akan dioptimalkan dengan penggunaan ATS yang lebih terintegrasi.",
      "rf2-q1": "Pipeline talenta akan terus dikembangkan melalui program talent scouting yang terstruktur.",
      "rf2-q2": "Akan menerapkan sistem update rekrutmen otomatis seminggu sekali kepada semua stakeholder.",
      "rf2-q3": "Sharing market intelligence akan dijadikan agenda rutin di meeting HR bulanan.",
      "rf2-q4": "Metode pencarian rare skill akan didokumentasikan sebagai best practice tim rekrutmen.",
      "rf2-q5": "Update rekrutmen mingguan akan mulai diterapkan menggunakan template standar.",
      "rf3-q1": "Pemahaman kebutuhan teknis menjadi area yang terus dikembangkan melalui kolaborasi dengan IT.",
      "rf3-q2": "Akan mengikuti program digital literacy untuk meningkatkan pemahaman tren teknologi terkini.",
      "rf3-q3": "Pendekatan yang disesuaikan per divisi terbukti meningkatkan kualitas kandidat yang dihasilkan.",
      "rf3-q4": "Hiring event akan dijadikan program tahunan dengan cakupan yang lebih luas.",
      "rf3-q5": "Rencana mengikuti kursus dasar teknologi untuk meningkatkan efektivitas rekrutmen IT.",
    },
    approver: {
      a1: [{ "Aspek Perbaikan": "Timeline rekrutmen", "Rencana Pengembangan": "Implementasi SLA rekrutmen per kategori posisi", "Tindak Lanjut": "Menyusun dokumen SLA bersama HRGA Manager", "Evaluasi": "Review SLA setelah 2 siklus rekrutmen", "Timeline Evaluasi": "Q1 2027", "Indikator Keberhasilan": "Time-to-hire turun minimal 15%" }],
      a2: [],
    },
    evaluasi: {},
  },
  {
    id: "E031", name: "Rina Wulandari", unit: "PT RSUP (Industry)",
    division: "Divisi SDM", department: "Dept. Payroll", position: "Staff Payroll",
    summarySubmitted: false,
    feedbacks: [
      {
        id: "rf1", division: "Finance & Accounting", companyUnit: "PT RSUP (Perkebunan)",
        answers: { q1: "Sangat teliti dalam pemrosesan payroll dan selalu tepat waktu dalam pelaporan.", q2: "Perlu meningkatkan kecepatan respon terhadap pertanyaan karyawan terkait slip gaji.", q3: "Berkoordinasi dengan baik dengan finance untuk rekonsiliasi data penggajian.", q4: "Membantu proses audit payroll dengan menyediakan data yang lengkap dan terorganisir.", q5: "Sediakan FAQ atau self-service portal untuk pertanyaan umum terkait payroll." },
      },
    ],
    summaries: {},
    approver: { a1: [], a2: [] },
    evaluasi: {},
  },
  {
    id: "E047", name: "Deni Kurniawan", unit: "PT RSUP (Industry)",
    division: "Divisi SDM", department: "Dept. Training", position: "Staff Training",
    summarySubmitted: false,
    feedbacks: [
      {
        id: "rf1", division: "Operations", companyUnit: "PT Pulau Sambu (Kuala Enok)",
        answers: { q1: "Kreatif dalam mengembangkan metode training yang engaging dan mudah dipahami.", q2: "Perlu lebih konsisten dalam dokumentasi materi training agar mudah diakses kembali.", q3: "Aktif membantu divisi lain dalam kebutuhan pelatihan mendadak.", q4: "Membantu kami dalam sesi emergency training saat ada perubahan SOP mendadak.", q5: "Buat library materi training digital yang dapat diakses mandiri oleh karyawan." },
      },
      {
        id: "rf2", division: "Quality Management", companyUnit: "PT GHS",
        answers: { q1: "Penguasaan materi sangat baik dan mampu menjelaskan konsep kompleks dengan sederhana.", q2: "Tindak lanjut pasca training perlu ditingkatkan untuk memastikan implementasi.", q3: "Berkontribusi dalam pengembangan modul pelatihan ISO yang digunakan lintas unit.", q4: "Memimpin sesi awareness training ISO 9001 dengan sangat efektif untuk 30+ peserta.", q5: "Lakukan assessment pasca training untuk mengukur efektivitas program." },
      },
    ],
    summaries: {},
    approver: { a1: [], a2: [] },
    evaluasi: {},
  },
];

// ── Badge helpers ──────────────────────────────────────────────────────────────

function approvalStatus(rec: EmployeeRecord): "submitted" | "partial" | "unsubmitted" {
  const a1 = rec.approver.a1.length > 0;
  const a2 = rec.approver.a2.length > 0;
  if (a1 && a2) return "submitted";
  if (a1 || a2) return "partial";
  return "unsubmitted";
}

function ApprovalFeedbackBadge({ rec }: { rec: EmployeeRecord }) {
  const status = approvalStatus(rec);
  if (status === "submitted") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
      <Check className="w-3 h-3" /> Submitted
    </span>
  );
  if (status === "partial") return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
      <AlertCircle className="w-3 h-3" /> Partial Submitted
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-300 whitespace-nowrap">
      <AlertCircle className="w-3 h-3" /> Unsubmitted
    </span>
  );
}

function EvaluasiBadge({ rec }: { rec: EmployeeRecord }) {
  const totalRows = rec.approver.a1.length + rec.approver.a2.length;
  if (totalRows === 0) return <span className="text-[10px] text-gray-400 italic">—</span>;
  const filled = Object.keys(rec.evaluasi).filter(k => rec.evaluasi[k]?.note?.trim()).length;
  if (filled === totalRows) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
      <CheckCircle2 className="w-3 h-3" /> Complete
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      Partial ({filled}/{totalRows})
    </span>
  );
}

// ── File preview modal ─────────────────────────────────────────────────────────

function FilePreviewModal({ file, onClose }: { file: string; onClose: () => void }) {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf";
  const isImage = ["jpg", "jpeg", "png"].includes(ext);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1A284F]" />
            <p className="text-sm font-bold text-gray-900 truncate max-w-[220px]">{file}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-6 flex flex-col items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isPdf ? "bg-red-50" : isImage ? "bg-blue-50" : "bg-gray-50"}`}>
            <FileText className={`w-8 h-8 ${isPdf ? "text-red-500" : isImage ? "text-blue-500" : "text-gray-400"}`} />
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-gray-500 uppercase mb-1">{ext.toUpperCase()} File</p>
            <p className="text-sm text-gray-700 font-medium">{file}</p>
            <p className="text-xs text-gray-400 mt-1">Self-Evaluation Evidence</p>
          </div>
          <button className="flex items-center gap-2 w-full justify-center bg-[#1A284F] hover:bg-[#243869] text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors">
            <Download className="w-4 h-4" /> Download File
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Full-page detail modal ─────────────────────────────────────────────────────

function DetailModal({ rec, onClose }: { rec: EmployeeRecord; onClose: () => void }) {
  const [activeFbTab, setActiveFbTab] = useState(0);
  const [expandedApprover, setExpandedApprover] = useState<"a1" | "a2" | null>("a1");
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const posCount = INDICATORS.filter(i => !NEGATIVE_IND.has(i.key)).length;
  const negCount = INDICATORS.filter(i => NEGATIVE_IND.has(i.key)).length;
  const fb = rec.feedbacks[activeFbTab];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1A284F] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{rec.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900">{rec.name}</p>
              <p className="text-xs text-gray-400">{rec.id} · {rec.position} · {rec.department} · {rec.division}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ApprovalFeedbackBadge rec={rec} />
            <EvaluasiBadge rec={rec} />
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-6 space-y-6 pb-16">

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Feedback Received",  value: rec.feedbacks.length, color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
                { label: "Total Positive Indicators", value: rec.feedbacks.length * posCount, color: "text-green-700", bg: "bg-green-50" },
                { label: "Total Negative Indicators", value: rec.feedbacks.length * negCount, color: "text-red-600",   bg: "bg-red-50" },
                { label: "Approver Rows",      value: rec.approver.a1.length + rec.approver.a2.length, color: "text-blue-700", bg: "bg-blue-50" },
              ].map(s => (
                <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Section 1: Received Feedbacks (tab per giver) ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                <Eye className="w-4 h-4 text-[#1A284F]" />
                <h3 className="text-sm font-bold text-gray-800">Received Feedback &amp; Summary</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A284F]/10 text-[#1A284F]">
                  {rec.feedbacks.length} Feedback{rec.feedbacks.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Feedback tab bar */}
              <div className="flex gap-2 px-6 pt-4 pb-0 overflow-x-auto border-b border-gray-100">
                {rec.feedbacks.map((f, idx) => {
                  const isActive = activeFbTab === idx;
                  const fbComplete = INDICATORS.every(ind => rec.summaries[`${f.id}-${ind.key}`]?.trim());
                  return (
                    <button
                      key={f.id}
                      onClick={() => setActiveFbTab(idx)}
                      className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-px whitespace-nowrap ${
                        isActive
                          ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/4"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {fbComplete && <Check className="w-3 h-3 text-green-600" />}
                      Feedback {idx + 1}
                      <span className="font-normal text-gray-400">— {f.division} — {f.companyUnit}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active tab content */}
              {fb && (
                <div className="px-6 py-5 space-y-4">
                  {INDICATORS.map((ind, indIdx) => {
                    const sent = getSentiment(ind.key);
                    const summaryKey = `${fb.id}-${ind.key}`;
                    const sum = rec.summaries[summaryKey] ?? "";
                    return (
                      <div key={ind.key} className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#1A284F] text-white text-[11px] font-bold flex-shrink-0">
                            {indIdx + 1}
                          </span>
                          <p className="text-xs font-semibold text-gray-700 flex-1 leading-snug">{ind.label}</p>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1 ${sent === "positive" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${sent === "positive" ? "bg-green-500" : "bg-red-500"}`} />
                            {sent === "positive" ? "Positive" : "Negative"}
                          </span>
                        </div>
                        <div className="px-4 pt-3 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-3">
                            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1.5">Feedback from Employee</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{fb.answers[ind.key as keyof typeof fb.answers]}</p>
                          </div>
                          {sum ? (
                            <div className="bg-[#1A284F]/5 border border-[#1A284F]/10 rounded-lg px-4 py-3">
                              <p className="text-[9px] font-bold text-[#1A284F] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" /> Summary / Note
                              </p>
                              <p className="text-sm text-gray-700 leading-relaxed">{sum}</p>
                            </div>
                          ) : (
                            <div className="bg-red-50/50 border border-red-100 rounded-lg px-4 py-3 flex items-center">
                              <p className="text-xs text-red-500 italic">Summary not filled yet</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Section 2: Approver Follow-Up + Self-Evaluation ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
                <FileText className="w-4 h-4 text-[#1A284F]" />
                <h3 className="text-sm font-bold text-gray-800">Approver Follow-Up &amp; Self-Evaluation</h3>
              </div>
              {(["a1", "a2"] as const).map((ap) => {
                const label = ap === "a1" ? "Approver 1" : "Approver 2";
                const rows = rec.approver[ap];
                const hasRows = rows.length > 0;
                const isOpen = expandedApprover === ap;
                return (
                  <div key={ap} className="border-b border-gray-50 last:border-0">
                    <button
                      onClick={() => setExpandedApprover(isOpen ? null : ap)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A284F] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{ap === "a1" ? "A1" : "A2"}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{label} Follow-Up</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${hasRows ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                          {hasRows ? `${rows.length} row${rows.length !== 1 ? "s" : ""}` : "No data yet"}
                        </span>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {isOpen && (
                      hasRows ? (
                        <div className="overflow-x-auto pb-2">
                          <table className="w-full text-xs" style={{ minWidth: 1000 }}>
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-center px-3 py-3 font-bold text-gray-500 w-8">#</th>
                                {APPROVER_COLS.map(col => (
                                  <th key={col} className="text-left px-3 py-3 font-bold text-gray-500 whitespace-nowrap">{col}</th>
                                ))}
                                <th className="text-left px-3 py-3 font-bold text-[#1A284F] whitespace-nowrap bg-blue-50/60">Self-Evaluation Result</th>
                                <th className="text-center px-3 py-3 font-bold text-[#1A284F] whitespace-nowrap bg-blue-50/60">Self-Evaluation Evidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, ri) => {
                                const ev = rec.evaluasi[`${ap}-${ri}`];
                                return (
                                  <tr key={ri} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                                    <td className="px-3 py-3 text-center text-gray-400 font-semibold">{ri + 1}</td>
                                    {APPROVER_COLS.map(col => (
                                      <td key={col} className="px-3 py-3 align-top">
                                        <p className="text-xs text-gray-700 leading-relaxed min-w-[120px] max-w-[180px]">
                                          {row[col] ?? <span className="italic text-gray-300">—</span>}
                                        </p>
                                      </td>
                                    ))}
                                    <td className="px-3 py-3 align-top bg-blue-50/30">
                                      {ev?.note ? (
                                        <p className="text-xs text-gray-700 leading-relaxed min-w-[150px] max-w-[220px]">{ev.note}</p>
                                      ) : (
                                        <span className="text-[10px] italic text-gray-400">Not filled</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center align-middle bg-blue-50/30">
                                      {ev?.file ? (
                                        <button
                                          onClick={() => setPreviewFile(ev.file!)}
                                          className="inline-flex items-center gap-1.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg px-2.5 py-1 font-semibold max-w-[150px] truncate transition-colors"
                                          title="Click to view file"
                                        >
                                          <Eye className="w-3 h-3 flex-shrink-0" />
                                          {ev.file}
                                        </button>
                                      ) : (
                                        <span className="text-[10px] italic text-gray-400">No file</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 px-6 py-5 bg-gray-50/30">
                          <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-amber-500 text-sm font-bold">!</span>
                          </div>
                          <p className="text-sm text-gray-500">
                            No follow-up data from <span className="font-semibold text-gray-700">{label}</span> yet.
                          </p>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function SupervisorMonitoringInterDeptFeedback() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [evalFilter, setEvalFilter] = useState("All Evaluation");
  const [selected, setSelected] = useState<EmployeeRecord | null>(null);
  const [, setWorkflowVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setWorkflowVersion((current) => current + 1);
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("feedback-updated", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const workflowRecords: EmployeeRecord[] = loadFeedbackSubmissions().map((submission) => ({
    id: submission.row.employeeId, name: submission.row.name, unit: submission.row.companyUnit, division: submission.row.division,
    department: submission.row.department, position: submission.row.position, feedbacks: submission.feedbacks, summaries: submission.summaries,
    approver: { a1: submission.followUps.approver1 ?? [], a2: submission.followUps.approver2 ?? [] }, evaluasi: {}, summarySubmitted: !!submission.summarySubmittedAt,
  }));
  const records = [...DATA.filter((record) => !workflowRecords.some((workflow) => workflow.id === record.id)), ...workflowRecords];

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.unit.toLowerCase().includes(q) ||
      r.division.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.position.toLowerCase().includes(q);

    const apStatus = approvalStatus(r);
    const matchStatus =
      statusFilter === "All Status" ||
      (statusFilter === "Submitted" && apStatus === "submitted") ||
      (statusFilter === "Partial Submitted" && apStatus === "partial") ||
      (statusFilter === "Unsubmitted" && apStatus === "unsubmitted");

    const totalRows = r.approver.a1.length + r.approver.a2.length;
    const filledEv = Object.keys(r.evaluasi).filter(k => r.evaluasi[k]?.note?.trim()).length;
    const evLabel =
      totalRows === 0 ? "—"
      : filledEv === totalRows ? "Complete"
      : "Partial";
    const matchEval = evalFilter === "All Evaluation" || evalFilter === evLabel;

    return matchSearch && matchStatus && matchEval;
  });

  const submittedCount = records.filter(r => approvalStatus(r) === "submitted").length;
  const totalPos = records.reduce((sum, r) => sum + r.feedbacks.length * 3, 0);
  const totalNeg = records.reduce((sum, r) => sum + r.feedbacks.length * 2, 0);

  return (
    <div className="w-full pb-24 flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-[#1A284F]" />
          <h1 className="text-[26px] font-bold text-[#1A284F] uppercase tracking-wide">
            Inter-Department Feedback Monitoring
          </h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">My Team</span>
        </div>
        <p className="text-gray-500 text-sm">Monitor received feedback, summary, approver follow-up, and self-evaluation of your team</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees",      value: records.length,       sub: "in your team",       color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Feedback Submitted",   value: submittedCount,    sub: `of ${records.length} employees`, color: "text-green-700", bg: "bg-green-50" },
          { label: "Total Positive Ind.",  value: totalPos,          sub: "all feedbacks",      color: "text-green-700", bg: "bg-green-50/60" },
          { label: "Total Negative Ind.",  value: totalNeg,          sub: "all feedbacks",      color: "text-red-600",   bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, unit, position..."
            className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400"
          />
        </div>
        {([
          { value: statusFilter, onChange: setStatusFilter, opts: ["All Status", "Submitted", "Partial Submitted", "Unsubmitted"] },
          { value: evalFilter,   onChange: setEvalFilter,   opts: ["All Evaluation", "Complete", "Partial", "—"] },
        ] as const).map(({ value, onChange, opts }) => (
          <div key={opts[0]} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2 shadow-sm">
            <Filter className="w-3 h-3 text-gray-400 shrink-0" />
            <select value={value} onChange={e => onChange(e.target.value as never)} className="text-xs outline-none bg-transparent text-gray-600 cursor-pointer">
              {opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {(search || statusFilter !== "All Status" || evalFilter !== "All Evaluation") && (
          <button onClick={() => { setSearch(""); setStatusFilter("All Status"); setEvalFilter("All Evaluation"); }} className="text-xs text-red-500 hover:text-red-700 underline">
            Reset filters
          </button>
        )}
        <span className="text-xs text-gray-400">{filtered.length} employees</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-4 text-center w-10">No.</th>
                <th className="py-3 px-4 text-center">Action</th>
                <th className="py-3 px-4">Employee ID</th>
                <th className="py-3 px-4">Employee Name</th>
                <th className="py-3 px-4">Company Unit</th>
                <th className="py-3 px-4">Division</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Position</th>
                <th className="py-3 px-4 text-center">Feedback</th>
                <th className="py-3 px-4 text-center">Positive</th>
                <th className="py-3 px-4 text-center">Negative</th>
                <th className="py-3 px-4 text-center">Approval Feedback</th>
                <th className="py-3 px-4 text-center">Self-Evaluation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((rec, idx) => {
                const posCount = rec.feedbacks.length * INDICATORS.filter(i => !NEGATIVE_IND.has(i.key)).length;
                const negCount = rec.feedbacks.length * INDICATORS.filter(i => NEGATIVE_IND.has(i.key)).length;
                return (
                  <tr key={rec.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4 text-center text-xs font-semibold text-gray-400">{idx + 1}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelected(rec)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#1A284F] hover:bg-[#243869] rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Detail
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[11px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded">{rec.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{rec.name}</p>
                    </td>
                    <td className="py-3 px-4"><p className="text-xs text-gray-600 whitespace-nowrap">{rec.unit}</p></td>
                    <td className="py-3 px-4"><p className="text-xs text-gray-600 whitespace-nowrap">{rec.division}</p></td>
                    <td className="py-3 px-4"><p className="text-xs text-gray-600 whitespace-nowrap">{rec.department}</p></td>
                    <td className="py-3 px-4"><p className="text-xs text-gray-600 whitespace-nowrap">{rec.position}</p></td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-xs font-bold">{rec.feedbacks.length}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />{posCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{negCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center"><ApprovalFeedbackBadge rec={rec} /></td>
                    <td className="py-3 px-4 text-center"><EvaluasiBadge rec={rec} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-14 text-center text-gray-400 text-sm">No data matches the selected filters.</div>
        )}
        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          {filtered.length} of {records.length} employees shown
        </div>
      </div>

      {selected && <DetailModal rec={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
