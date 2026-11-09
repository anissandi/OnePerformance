import { useState } from "react";
import { useRouteTab } from "../../../utils/useRouteTab";
import { DatePickerID } from "../../../components/DatePickerID";
import { X, CheckCircle2, XCircle, LockOpen, Lock, ChevronDown, Search, Clock, AlertCircle, Filter } from "lucide-react";
import { syncToSupabase } from "../../../services/supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestStatus = "pending" | "approved" | "rejected";

interface OpenLockRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  nip: string;
  divisi: string;
  departemen: string;
  bagian: string;
  posisi: string;
  module: string;
  period: string;
  originalDeadline: string;
  submittedAt: string;
  reason: string;
  status: RequestStatus;
  approvedUntil?: string;
  approvedAt?: string;
  approvalNote?: string;
  rejectedAt?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_REQUESTS: OpenLockRequest[] = [
  // ── KPI Tracking — Pending ──
  {
    id: "ol1", employeeId: "e1", employeeName: "Ahmad Fauzi Ramadhan", nip: "2019041001",
    divisi: "Coconut Production", departemen: "Produksi Kelapa A", bagian: "Line Produksi 1",
    posisi: "Pengawas", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-02T09:14:00",
    reason: "Sistem error pada tanggal 30 Juni sehingga tidak bisa melakukan input data KPI sebelum deadline.",
    status: "pending",
  },
  {
    id: "ol4", employeeId: "e4", employeeName: "Dewi Rahayu Susanti", nip: "2021071104",
    divisi: "Logistic / Materials", departemen: "Warehouse & Inventory", bagian: "Penerimaan Barang",
    posisi: "Operasional", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-04T11:45:00",
    reason: "Keterlambatan pelaporan dari supplier sehingga data KPI tidak dapat dilengkapi tepat waktu.",
    status: "pending",
  },
  {
    id: "ol6", employeeId: "e6", employeeName: "Hendra Kusuma Putra", nip: "2017020606",
    divisi: "Utility & Supports", departemen: "Maintenance", bagian: "Pemeliharaan Mesin",
    posisi: "Kepala Bagian", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-05T07:30:00",
    reason: "Pemadaman listrik di area kantor selama 2 hari menjelang deadline.",
    status: "pending",
  },
  {
    id: "ol7", employeeId: "e7", employeeName: "Indah Permata Sari", nip: "2023031107",
    divisi: "Generals", departemen: "Teknologi Informasi", bagian: "Infrastruktur IT",
    posisi: "Operasional", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-06T13:15:00",
    reason: "Upgrade sistem ERP yang dilakukan pada akhir bulan menyebabkan modul KPI tidak dapat diakses.",
    status: "pending",
  },
  // ── SMART Goals — Pending ──
  {
    id: "ol8", employeeId: "e8", employeeName: "Fajar Nugroho Santoso", nip: "2021051208",
    divisi: "Staff Management", departemen: "Sumber Daya Manusia", bagian: "Pengembangan SDM",
    posisi: "Operasional", module: "SMART Goals", period: "Q2-2026",
    originalDeadline: "2026-06-28", submittedAt: "2026-07-03T10:00:00",
    reason: "Atasan langsung tidak tersedia untuk melakukan review dan persetujuan SMART Goals sebelum periode berakhir karena cuti.",
    status: "pending",
  },
  {
    id: "ol9", employeeId: "e9", employeeName: "Lestari Wulandari", nip: "2022021409",
    divisi: "Pineapple Production", departemen: "Produksi Nanas", bagian: "Sortir & Grading",
    posisi: "Pengawas", module: "SMART Goals", period: "Q2-2026",
    originalDeadline: "2026-06-28", submittedAt: "2026-07-04T08:45:00",
    reason: "Pergantian atasan baru pada pertengahan kuartal menyebabkan proses persetujuan SMART Goals tertunda.",
    status: "pending",
  },
  // ── Appraisal Form — Pending ──
  {
    id: "ol10", employeeId: "e10", employeeName: "Muhamad Rizki Hidayat", nip: "2020091310",
    divisi: "Quality Management", departemen: "Quality Assurance", bagian: "Audit Internal",
    posisi: "Kepala Bagian", module: "Appraisal Form", period: "Mid-Year 2026",
    originalDeadline: "2026-06-25", submittedAt: "2026-07-05T14:20:00",
    reason: "Form appraisal tidak dapat dibuka karena kendala teknis pada browser dan belum sempat dilaporkan ke IT.",
    status: "pending",
  },
  {
    id: "ol11", employeeId: "e11", employeeName: "Nurul Aini Rahmawati", nip: "2023040611",
    divisi: "Finance & Accounting", departemen: "Akuntansi", bagian: "Pelaporan Keuangan",
    posisi: "Operasional", module: "Appraisal Form", period: "Mid-Year 2026",
    originalDeadline: "2026-06-25", submittedAt: "2026-07-06T09:30:00",
    reason: "Karyawan baru bergabung pada awal Juni dan belum mendapatkan akun sistem appraisal tepat waktu.",
    status: "pending",
  },
  // ── History — KPI Tracking ──
  {
    id: "ol2", employeeId: "e2", employeeName: "Siti Nurhaliza Putri", nip: "2020081205",
    divisi: "Finance & Accounting", departemen: "Keuangan", bagian: "Anggaran & Perencanaan",
    posisi: "Operasional", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-01T14:30:00",
    reason: "Sedang dalam perjalanan dinas luar kota pada periode deadline tanpa akses sistem.",
    status: "approved",
    approvedUntil: "2026-07-10",
    approvedAt: "2026-07-01T16:00:00",
    approvalNote: "Disetujui. Harap segera isi KPI tracking sebelum tanggal 10 Juli 2026.",
  },
  {
    id: "ol3", employeeId: "e3", employeeName: "Budi Santoso", nip: "2018030303",
    divisi: "Quality Management", departemen: "Quality Control", bagian: "Lab QC",
    posisi: "Kepala Bagian", module: "KPI Tracking", period: "Jun-2026",
    originalDeadline: "2026-06-30", submittedAt: "2026-07-03T08:00:00",
    reason: "Izin sakit dengan surat dokter selama 5 hari kerja terakhir bulan Juni.",
    status: "rejected",
    rejectedAt: "2026-07-03T10:15:00",
    approvalNote: "Tidak dapat disetujui karena data sudah diproses ke periode kalkulasi.",
  },
  {
    id: "ol5", employeeId: "e5", employeeName: "Rizky Pratama Wijaya", nip: "2022051505",
    divisi: "Staff Management", departemen: "Sumber Daya Manusia", bagian: "Rekrutmen & Seleksi",
    posisi: "Pengawas", module: "KPI Tracking", period: "May-2026",
    originalDeadline: "2026-05-31", submittedAt: "2026-06-02T09:00:00",
    reason: "Lupa mengisi karena beban kerja tinggi pada akhir bulan rekrutmen batch besar.",
    status: "approved",
    approvedUntil: "2026-06-07",
    approvedAt: "2026-06-02T11:30:00",
    approvalNote: "Diberikan perpanjangan 7 hari. Tidak akan ada toleransi untuk keterlambatan berikutnya.",
  },
  // ── History — SMART Goals ──
  {
    id: "ol12", employeeId: "e12", employeeName: "Agus Setiawan", nip: "2018061212",
    divisi: "Coconut Production", departemen: "Produksi Kelapa B", bagian: "Packaging",
    posisi: "Pengawas", module: "SMART Goals", period: "Q1-2026",
    originalDeadline: "2026-03-28", submittedAt: "2026-03-30T10:00:00",
    reason: "Sakit mendadak dan dirawat inap selama 4 hari pada akhir Maret.",
    status: "approved",
    approvedUntil: "2026-04-05",
    approvedAt: "2026-03-30T14:00:00",
    approvalNote: "Disetujui dengan perpanjangan 7 hari. Lampirkan surat rawat inap saat pengisian.",
  },
  {
    id: "ol13", employeeId: "e13", employeeName: "Putri Handayani", nip: "2020120513",
    divisi: "Logistic / Materials", departemen: "Purchasing", bagian: "Pengadaan Bahan Baku",
    posisi: "Operasional", module: "SMART Goals", period: "Q1-2026",
    originalDeadline: "2026-03-28", submittedAt: "2026-03-31T11:30:00",
    reason: "Tidak mengetahui batas waktu pengisian SMART Goals karena sosialisasi tidak sampai ke bagian.",
    status: "rejected",
    rejectedAt: "2026-03-31T15:00:00",
    approvalNote: "Ditolak. Informasi deadline telah disebarkan melalui grup departemen. Harap lebih memperhatikan pengumuman resmi.",
  },
  // ── History — Appraisal Form ──
  {
    id: "ol14", employeeId: "e14", employeeName: "Rudi Hermawan", nip: "2017091414",
    divisi: "Utility & Supports", departemen: "Utilitas & Energi", bagian: "Pengelolaan Energi",
    posisi: "Kepala Departemen", module: "Appraisal Form", period: "Annual 2025",
    originalDeadline: "2025-12-26", submittedAt: "2025-12-28T08:00:00",
    reason: "Libur panjang Natal dan Tahun Baru menyebabkan tidak sempat mengisi form appraisal sebelum deadline.",
    status: "approved",
    approvedUntil: "2026-01-05",
    approvedAt: "2025-12-28T10:30:00",
    approvalNote: "Disetujui mengingat libur nasional. Batas terakhir 5 Januari 2026.",
  },
  {
    id: "ol15", employeeId: "e15", employeeName: "Sri Wahyuni", nip: "2019031015",
    divisi: "Generals", departemen: "Legal & Compliance", bagian: "Kepatuhan",
    posisi: "Operasional", module: "Appraisal Form", period: "Annual 2025",
    originalDeadline: "2025-12-26", submittedAt: "2025-12-29T13:00:00",
    reason: "Tugas luar negeri tanpa akses VPN perusahaan selama 2 minggu pada akhir Desember.",
    status: "rejected",
    rejectedAt: "2025-12-30T09:00:00",
    approvalNote: "Tidak dapat disetujui. Proses rekap appraisal tahunan sudah berjalan.",
  },
];

const STATUS_META: Record<RequestStatus, { label: string; bg: string; color: string; border: string; dot: string }> = {
  pending:  { label: "Pending",  bg: "#fffbeb", color: "#92400e", border: "#fcd34d", dot: "#f59e0b" },
  approved: { label: "Approved", bg: "#f0fdf4", color: "#14532d", border: "#86efac", dot: "#22c55e" },
  rejected: { label: "Rejected", bg: "#fef2f2", color: "#7f1d1d", border: "#fca5a5", dot: "#ef4444" },
};

const MODULE_META: Record<string, { bg: string; color: string; border: string }> = {
  "KPI Tracking":  { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
  "SMART Goals":   { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  "Appraisal Form":{ bg: "#faf5ff", color: "#6b21a8", border: "#e9d5ff" },
};

const DIVISI_OPTIONS = [...new Set(MOCK_REQUESTS.map(r => r.divisi))].sort();
const MODULE_OPTIONS = [...new Set(MOCK_REQUESTS.map(r => r.module))];

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function daysPast(deadline: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(deadline).getTime()) / 86400000));
}

// ─── Pill Tab (matches image reference) ──────────────────────────────────────

function PillTab({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        active
          ? "bg-[#1A284F] text-white shadow-sm"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
      }`}
    >
      {label}
      <span className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-[11px] font-bold px-1.5 ${
        active ? "bg-white/20 text-white" : "bg-white text-gray-600 border border-gray-200"
      }`}>
        {count}
      </span>
    </button>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({
  request, onClose, onApprove, onReject,
}: {
  request: OpenLockRequest;
  onClose: () => void;
  onApprove: (id: string, until: string, note: string) => void;
  onReject: (id: string, note: string) => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [tab, setTab] = useState<"approve" | "reject">("approve");
  const [openUntil, setOpenUntil] = useState(defaultDate);
  const [note, setNote] = useState("");

  const canApprove = openUntil.length > 0;
  const canReject  = note.trim().length > 0;

  const mm = MODULE_META[request.module] ?? MODULE_META["KPI Tracking"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
              <LockOpen className="w-5 h-5 text-[#1A284F]" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">Open Lock Request</h2>
              <p className="text-xs text-gray-400 mt-0.5">{request.module} — {request.period}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Employee info */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#1A284F]/10 flex items-center justify-center text-sm font-black text-[#1A284F]">
                {request.employeeName.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{request.employeeName}</p>
                <p className="text-xs text-gray-400 font-mono">{request.nip}</p>
              </div>
              <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ background: mm.bg, color: mm.color, borderColor: mm.border }}>
                {request.module}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mt-1">
              <span><span className="text-gray-400">Posisi:</span> {request.posisi}</span>
              <span><span className="text-gray-400">Divisi:</span> {request.divisi}</span>
              <span><span className="text-gray-400">Bagian:</span> {request.bagian}</span>
              <span><span className="text-gray-400">Departemen:</span> {request.departemen}</span>
            </div>
          </div>

          {/* Deadline alert */}
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-red-700">Deadline Terlewati</p>
              <p className="text-red-600 mt-0.5">
                Deadline original: <span className="font-bold">{fmtDate(request.originalDeadline)}</span>
                {" — "}<span className="font-bold">{daysPast(request.originalDeadline)} hari</span> yang lalu
              </p>
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Alasan Karyawan</p>
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-800 leading-relaxed">{request.reason}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 -mt-3">Diajukan: {fmtDateTime(request.submittedAt)}</p>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-100">
            {(["approve", "reject"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  tab === t
                    ? t === "approve" ? "border-emerald-500 text-emerald-700" : "border-red-400 text-red-600"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}>
                {t === "approve" ? "Approve & Set Open Date" : "Reject"}
              </button>
            ))}
          </div>

          {tab === "approve" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Buka Akses Hingga <span className="text-red-400">*</span></label>
                <DatePickerID value={openUntil} onChange={setOpenUntil} />
                <p className="text-[10px] text-gray-400">
                  Karyawan dapat mengisi {request.module} hingga tanggal yang ditentukan.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Catatan Admin <span className="text-gray-400">(opsional)</span></label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Tambahkan catatan atau instruksi untuk karyawan..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none transition-colors"
                />
              </div>
              <button disabled={!canApprove} onClick={() => onApprove(request.id, openUntil, note)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  canApprove ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}>
                <LockOpen className="w-4 h-4" />Approve & Buka Akses
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700">Alasan Penolakan <span className="text-red-400">*</span></label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={4}
                  placeholder="Tuliskan alasan penolakan open lock request ini..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none transition-colors"
                />
                <p className="text-[10px] text-gray-400">Alasan penolakan akan disampaikan kepada karyawan.</p>
              </div>
              <button disabled={!canReject} onClick={() => onReject(request.id, note)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  canReject ? "bg-red-500 hover:bg-red-600 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}>
                <XCircle className="w-4 h-4" />Tolak Request
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ request, onClose }: { request: OpenLockRequest; onClose: () => void }) {
  const sm = STATUS_META[request.status];
  const mm = MODULE_META[request.module] ?? MODULE_META["KPI Tracking"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Detail Open Lock</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
              style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}>
              <span className="w-2 h-2 rounded-full" style={{ background: sm.dot }} />{sm.label}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
              style={{ background: mm.bg, color: mm.color, borderColor: mm.border }}>
              {request.module}
            </span>
            <span className="text-xs text-gray-400">{request.period}</span>
          </div>

          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5">
            <p className="font-semibold text-gray-900 text-sm">{request.employeeName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{request.nip}</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 mt-2">
              <span><span className="text-gray-400">Posisi:</span> {request.posisi}</span>
              <span><span className="text-gray-400">Divisi:</span> {request.divisi}</span>
              <span><span className="text-gray-400">Departemen:</span> {request.departemen}</span>
              <span><span className="text-gray-400">Bagian:</span> {request.bagian}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <p className="text-gray-400 mb-0.5">Deadline Original</p>
              <p className="font-bold text-gray-800">{fmtDate(request.originalDeadline)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2.5">
              <p className="text-gray-400 mb-0.5">Diajukan</p>
              <p className="font-bold text-gray-800">{fmtDateTime(request.submittedAt)}</p>
            </div>
            {request.status === "approved" && request.approvedUntil && (
              <>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <p className="text-emerald-600 mb-0.5">Akses Dibuka Hingga</p>
                  <p className="font-bold text-emerald-800">{fmtDate(request.approvedUntil)}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <p className="text-emerald-600 mb-0.5">Disetujui Pada</p>
                  <p className="font-bold text-emerald-800">{fmtDateTime(request.approvedAt!)}</p>
                </div>
              </>
            )}
            {request.status === "rejected" && request.rejectedAt && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 col-span-2">
                <p className="text-red-600 mb-0.5">Ditolak Pada</p>
                <p className="font-bold text-red-800">{fmtDateTime(request.rejectedAt)}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Alasan Karyawan</p>
            <div className="bg-amber-50/60 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-gray-800 leading-relaxed">{request.reason}</p>
            </div>
          </div>

          {request.approvalNote && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Catatan Admin</p>
              <div className={`rounded-xl px-4 py-3 border ${
                request.status === "approved" ? "bg-emerald-50/60 border-emerald-200" : "bg-red-50/60 border-red-200"
              }`}>
                <p className="text-sm text-gray-800 leading-relaxed">{request.approvalNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Request Table ────────────────────────────────────────────────────────────

function RequestTable({
  rows,
  showActions,
  onDetail,
  onReview,
}: {
  rows: OpenLockRequest[];
  showActions: boolean;
  onDetail: (r: OpenLockRequest) => void;
  onReview?: (r: OpenLockRequest) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
          <LockOpen className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm text-gray-400 font-medium">Tidak ada request</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth: 860 }}>
        <thead>
          <tr className="bg-[#1A284F] text-white text-xs">
            <th className="border border-gray-600 px-3 py-3 text-left font-semibold w-8">#</th>
            <th className="border border-gray-600 px-3 py-3 text-left font-semibold min-w-[160px]">Karyawan</th>
            <th className="border border-gray-600 px-3 py-3 text-left font-semibold min-w-[140px]">Divisi / Departemen</th>
            <th className="border border-gray-600 px-3 py-3 text-center font-semibold">Posisi</th>
            <th className="border border-gray-600 px-3 py-3 text-center font-semibold">Modul</th>
            <th className="border border-gray-600 px-3 py-3 text-center font-semibold">Deadline</th>
            {!showActions && (
              <th className="border border-gray-600 px-3 py-3 text-center font-semibold min-w-[110px]">Akses Hingga</th>
            )}
            {!showActions && (
              <th className="border border-gray-600 px-3 py-3 text-center font-semibold">Status</th>
            )}
            <th className="border border-gray-600 px-3 py-3 text-center font-semibold">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const sm = STATUS_META[r.status];
            const mm = MODULE_META[r.module] ?? MODULE_META["KPI Tracking"];
            return (
              <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                <td className="border border-gray-200 px-3 py-3 text-center text-gray-400 text-xs">{idx + 1}</td>
                <td className="border border-gray-200 px-3 py-3">
                  <p className="font-semibold text-gray-900 text-xs">{r.employeeName}</p>
                  <p className="text-[10px] text-gray-400 font-mono">{r.nip}</p>
                </td>
                <td className="border border-gray-200 px-3 py-3">
                  <p className="text-xs font-medium text-gray-700">{r.divisi}</p>
                  <p className="text-[10px] text-gray-400">{r.departemen}</p>
                </td>
                <td className="border border-gray-200 px-3 py-3 text-center">
                  <span className="text-xs text-gray-600">{r.posisi}</span>
                </td>
                <td className="border border-gray-200 px-3 py-3 text-center">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    style={{ background: mm.bg, color: mm.color, borderColor: mm.border }}>
                    {r.module}
                  </span>
                </td>
                <td className="border border-gray-200 px-3 py-3 text-center">
                  <p className="text-xs font-medium text-red-600">{fmtDate(r.originalDeadline)}</p>
                  <p className="text-[10px] text-red-400">{daysPast(r.originalDeadline)}h lalu</p>
                </td>
                {!showActions && (
                  <td className="border border-gray-200 px-3 py-3 text-center">
                    {r.status === "approved" && r.approvedUntil ? (
                      <p className="text-xs font-bold text-emerald-700">{fmtDate(r.approvedUntil)}</p>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                )}
                {!showActions && (
                  <td className="border border-gray-200 px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                      style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: sm.dot }} />
                      {sm.label}
                    </span>
                  </td>
                )}
                <td className="border border-gray-200 px-3 py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => onDetail(r)}
                      className="px-2.5 py-1 text-[10px] font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                      Detail
                    </button>
                    {showActions && onReview && (
                      <button onClick={() => onReview(r)}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-[#1A284F] text-white rounded-lg hover:bg-[#131d3b] transition-colors">
                        <LockOpen className="w-3 h-3" />Review
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function OpenLockPage() {
  const [requests, setRequests] = useState<OpenLockRequest[]>(MOCK_REQUESTS);
  const [activeTab, setActiveTab] = useRouteTab<"pending" | "history">(["pending", "history"], "pending");
  const [approveTarget, setApproveTarget] = useState<OpenLockRequest | null>(null);
  const [detailTarget, setDetailTarget] = useState<OpenLockRequest | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [searchQ, setSearchQ] = useState("");
  const [selDivisi, setSelDivisi] = useState("__all__");
  const [selModule, setSelModule] = useState("__all__");
  const [selHistStatus, setSelHistStatus] = useState<"all" | "approved" | "rejected">("all");

  const pendingRows  = requests.filter(r => r.status === "pending");
  const historyRows  = requests.filter(r => r.status !== "pending");

  function applyFilters(rows: OpenLockRequest[]) {
    return rows.filter(r => {
      if (selDivisi !== "__all__" && r.divisi !== selDivisi) return false;
      if (selModule !== "__all__" && r.module !== selModule) return false;
      if (activeTab === "history" && selHistStatus !== "all" && r.status !== selHistStatus) return false;
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase();
        if (!r.employeeName.toLowerCase().includes(q) && !r.nip.includes(q) && !r.departemen.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  const filteredPending = applyFilters(pendingRows);
  const filteredHistory = applyFilters(historyRows);
  const displayRows     = activeTab === "pending" ? filteredPending : filteredHistory;

  function handleApprove(id: string, until: string, note: string) {
    setRequests(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated: OpenLockRequest = {
        ...r,
        status: "approved",
        approvedUntil: until,
        approvedAt: new Date().toISOString(),
        approvalNote: note || undefined,
      };
      void syncToSupabase({
        kind: "open-lock",
        request: updated,
        audit: {
          action: "Approve",
          module: updated.module,
          subModule: "Open Lock",
          description: `Approved Open Lock for ${updated.employeeName} (${updated.module} · ${updated.period}) until ${until}`,
        },
      });
      return updated;
    }));
    setApproveTarget(null);
    setSuccess("Open lock disetujui. Karyawan kini dapat mengisi modul hingga tanggal yang ditentukan.");
  }

  function handleReject(id: string, note: string) {
    setRequests(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated: OpenLockRequest = {
        ...r,
        status: "rejected",
        rejectedAt: new Date().toISOString(),
        approvalNote: note,
      };
      void syncToSupabase({
        kind: "open-lock",
        request: updated,
        audit: {
          action: "Reject",
          module: updated.module,
          subModule: "Open Lock",
          description: `Rejected Open Lock for ${updated.employeeName} (${updated.module} · ${updated.period}): ${note}`,
        },
      });
      return updated;
    }));
    setApproveTarget(null);
    setSuccess("Request ditolak dan catatan alasan telah disimpan.");
  }

  const hasFilter = selDivisi !== "__all__" || selModule !== "__all__" || searchQ.trim().length > 0 || selHistStatus !== "all";

  return (
    <div className="w-full flex flex-col gap-6">

      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <LockOpen className="w-6 h-6 text-[#1A284F]" />
          <h1 className="text-[28px] font-bold text-[#1A284F]">Open Lock</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Approval admin untuk membuka kembali akses pengisian modul yang telah melewati deadline.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Total Request</p>
          <p className="text-3xl font-black text-[#1A284F] tabular-nums">{requests.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Menunggu Approval</p>
          </div>
          <p className="text-3xl font-black text-amber-700 tabular-nums">{pendingRows.length}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">Disetujui</p>
          </div>
          <p className="text-3xl font-black text-emerald-700 tabular-nums">{historyRows.filter(r => r.status === "approved").length}</p>
        </div>
      </div>

      {/* Admin-only banner */}
      <div className="flex items-start gap-3 px-5 py-3.5 bg-[#1A284F]/5 border border-[#1A284F]/10 rounded-xl">
        <Lock className="w-4 h-4 text-[#1A284F] shrink-0 mt-0.5" />
        <p className="text-sm text-[#1A284F]">
          <span className="font-semibold">Admin Only:</span> Fitur ini hanya dapat diakses oleh admin HR.
          Setelah disetujui, karyawan mendapat akses sementara untuk mengisi modul sesuai tanggal yang ditetapkan admin.
        </p>
      </div>

      {/* Tab + Filter card */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">

        {/* Tab bar */}
        <div className="flex items-center gap-2 px-5 pt-4 pb-4 border-b border-gray-100">
          <PillTab
            label="Pending"
            count={pendingRows.length}
            active={activeTab === "pending"}
            onClick={() => { setActiveTab("pending"); setSelHistStatus("all"); }}
          />
          <PillTab
            label="History"
            count={historyRows.length}
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 px-5 py-4 border-b border-gray-100">
          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cari Karyawan</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="Nama, NIP, atau departemen..."
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20" />
            </div>
          </div>

          {/* Module */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Modul</label>
            <div className="relative">
              <select value={selModule} onChange={e => setSelModule(e.target.value)}
                className="appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 min-w-[160px] bg-white cursor-pointer">
                <option value="__all__">Semua Modul</option>
                {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>

          {/* Divisi */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Divisi</label>
            <div className="relative">
              <select value={selDivisi} onChange={e => setSelDivisi(e.target.value)}
                className="appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 min-w-[170px] bg-white cursor-pointer">
                <option value="__all__">Semua Divisi</option>
                {DIVISI_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>

          {/* History: status sub-filter */}
          {activeTab === "history" && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hasil</label>
              <div className="relative">
                <select value={selHistStatus} onChange={e => setSelHistStatus(e.target.value as typeof selHistStatus)}
                  className="appearance-none border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 min-w-[140px] bg-white cursor-pointer">
                  <option value="all">Semua Status</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
          )}

          {hasFilter && (
            <button onClick={() => { setSearchQ(""); setSelDivisi("__all__"); setSelModule("__all__"); setSelHistStatus("all"); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors self-end">
              <X className="w-3.5 h-3.5" />Clear Filter
            </button>
          )}
        </div>

        {/* Row count */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <p className="text-xs font-semibold text-gray-500">
            {activeTab === "pending" ? "Pending" : "History"} —{" "}
            <span className="text-[#1A284F]">{displayRows.length} request</span>
          </p>
        </div>

        {/* Table */}
        <RequestTable
          rows={displayRows}
          showActions={activeTab === "pending"}
          onDetail={setDetailTarget}
          onReview={activeTab === "pending" ? setApproveTarget : undefined}
        />
      </div>

      {/* Modals */}
      {approveTarget && (
        <ApproveModal request={approveTarget} onClose={() => setApproveTarget(null)}
          onApprove={handleApprove} onReject={handleReject} />
      )}
      {detailTarget && (
        <DetailModal request={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Berhasil</h3>
            <p className="text-gray-500 text-sm mb-6">{success}</p>
            <button onClick={() => setSuccess(null)}
              className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
