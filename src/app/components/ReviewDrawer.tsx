// @refresh reset
import { loadAppraisalSelf } from "../pages/shared/appraisalFormStore";
import { loadMSSelfRatings } from "../pages/shared/msStore";
import { normalizeEmployeeId, workflowAlias, loadWorkflowRecords } from "../pages/shared/appraisalWorkflowStore";
import React, { useState } from "react";
import { useLanguage } from "../context/LangContext";
import {
  X, Check, RotateCcw, CheckCircle2, TrendingUp,
  ClipboardList, FolderKanban, Lightbulb, AlertTriangle,
  User, Building2, Calendar, Layers, Send, Paperclip, Download, Eye, MessageSquare, ChevronRight,
  FileText, ChevronDown, ChevronUp, Target,
} from "lucide-react";
import { FORMS, type FormItem } from "../pages/employee/AppraisalForm";
import { KPI_ITEMS, INITIAL_MONTHS, computeTotal2026 } from "../pages/employee/KPIPage";
import { SAMPLE_GOALS, ROWS } from "../pages/employee/SMARTGoals";
import { loadCheckInEntries, loadSubmittedGoals, type StoredSmartGoalEvidenceFile } from "../pages/shared/smartGoalsStore";
import { loadKPIComments, saveKPIComment, type KPIRowComments } from "../pages/shared/kpiCommentsStore";
import { loadEvidenceFiles, type StoredEvidenceFile } from "../pages/shared/kpiEvidenceStore";
import { saveAssessment, loadAssessment, loadSGAssessment } from "../pages/shared/approvalsStore";
import { loadRCASubmissions } from "../pages/shared/rcaStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../utils/dateFormat";
import { MS_ITEMS, type MSItem } from "../pages/supervisor/ManagerialSkillCheckIn";
import { KPITableView } from "./KPITableView";
import { FeedbackApprovalDrawer } from "./FeedbackApprovalDrawer";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalRow {
  no: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  type: string;
  submittedDate: string;
  approvalDate: string;
  status: string;
  reviewerRoleForRow?: ReviewerRole;
  workflowStageForRow?: "checker" | "approver1" | "approver2" | "validator";
  editRequestReason?: string;
  editRequestDate?: string;
  period?: string;
  goalsCount?: number;
  achievement?: string;
  actionPlansSummary?: string;
}

export type ReviewerRole = "approver1" | "approver2";

interface Props {
  row: ApprovalRow;
  reviewerRole: ReviewerRole;
  onClose: () => void;
  onApprove: () => void;
  onRevision: (note: string) => void;
  onAssessed: () => void;
  readOnly?: boolean;
}

// ─── RCA Review Preview ────────────────────────────────────────────────────────

type RCAStatus = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai";

interface RCAAp {
  action: string; targetDate: string; pic: string;
  status: RCAStatus; keterangan: string[]; output: string[]; evidence: string[];
}
interface RCAItem {
  no: number; periode: string; kpi: string; satuan: string; baseline: string;
  target: string; actual: string; masalahUtama: string;
  kenapaA: string; kenapaB: string; kenapaC: string;
  actionPlans: RCAAp[];
}

const STATUS_STYLE: Record<RCAStatus, string> = {
  "Belum dilaksanakan": "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai": "bg-green-50 text-green-700",
};

// Sample 1 — shown to Approver 1 (Supervisor)
const RCA_SAMPLE_1: RCAItem[] = [{
  no: 1, periode: "Jan", kpi: "Implementasi ERP System", satuan: "% /bulan",
  baseline: "0%", target: "100%", actual: "85%",
  masalahUtama: "Modul Finance dan HR belum selesai",
  kenapaA: "Tim project kekurangan tenaga ahli modul HR",
  kenapaB: "Rekruten tenaga ahli HR tertunda karena approval anggaran lambat",
  kenapaC: "Proses approval anggaran lambat karena dokumen justifikasi belum lengkap",
  actionPlans: [
    { action: "Penyusunan dokumen justifikasi kebutuhan tenaga ahli modul HR", targetDate: "2027-01-17", pic: "PM ERP & HR Manager", status: "Sedang dilaksanakan", keterangan: ["Draft awal sudah disusun, menunggu data kebutuhan SDM dari HR"], output: ["Draft dokumen justifikasi"], evidence: [] },
    { action: "Permohonan approval dokumen justifikasi kepada Direktur Keuangan", targetDate: "2027-01-18", pic: "PM ERP", status: "Belum dilaksanakan", keterangan: ["Menunggu dokumen final dari tim ERP"], output: ["Dokumen justifikasi disetujui"], evidence: [] },
    { action: "Rekrutmen tenaga ahli modul HR via vendor", targetDate: "2027-02-01", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: ["Menunggu budget approval"], output: ["Tenaga ahli modul HR tersedia"], evidence: [] },
  ],
}];

// Sample 2 — shown to Approver 2 (HR Admin)
const RCA_SAMPLE_2: RCAItem[] = [{
  no: 1, periode: "Feb", kpi: "Training Completion Rate", satuan: "%",
  baseline: "70%", target: "≥ 90%", actual: "78%",
  masalahUtama: "Peserta training banyak yang tidak hadir",
  kenapaA: "Jadwal training berbenturan dengan deadline proyek",
  kenapaB: "Koordinasi penjadwalan antara HR dan manajer departemen kurang",
  kenapaC: "Tidak ada sistem reminder otomatis dan konfirmasi kehadiran peserta",
  actionPlans: [
    { action: "Implementasi sistem reminder otomatis H-3 dan H-1", targetDate: "2027-02-28", pic: "HR Training Coordinator", status: "Sedang dilaksanakan", keterangan: ["Sistem sedang dikembangkan oleh tim IT"], output: ["Sistem reminder training aktif"], evidence: [] },
    { action: "Koordinasi jadwal training dengan manajer departemen tiap awal bulan", targetDate: "2027-03-01", pic: "HR Training", status: "Belum dilaksanakan", keterangan: [], output: ["Jadwal training bulanan dikonfirmasi"], evidence: [] },
    { action: "Buat SOP wajib konfirmasi kehadiran H-1 oleh peserta", targetDate: "2027-03-05", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: [], output: ["SOP konfirmasi kehadiran"], evidence: [] },
    { action: "Evaluasi dan laporan completion rate bulanan ke manajemen", targetDate: "2027-03-10", pic: "HR Training Coordinator", status: "Belum dilaksanakan", keterangan: [], output: ["Laporan completion rate bulanan"], evidence: [] },
  ],
}];

function RCAReviewPreview({ employeeId }: { employeeId: string }) {
  const storedSubs = loadRCASubmissions(employeeId);
  const data: RCAItem[] = storedSubs.flatMap((sub, idx) => {
    const blocks =
      sub.masalahBlocks && sub.masalahBlocks.length > 0
        ? sub.masalahBlocks
        : [
            {
              id: `${sub.id}_b0`,
              masalahUtama: (sub.masalahUtama ?? []).join(" / "),
              kenapaA: sub.kenapaA ?? "",
              kenapaB: sub.kenapaB ?? "",
              kenapaC: sub.kenapaC ?? "",
              actionPlans: sub.actionPlans ?? [],
            },
          ];
    return blocks.map((blk, bi) => ({
      no: idx + bi + 1,
      periode: sub.periode || "—",
      kpi: sub.kpiIndicator || "—",
      satuan: sub.satuan || "—",
      baseline: sub.baseline || "—",
      target: sub.targetMonthly || "—",
      actual: sub.actual || "—",
      masalahUtama: blk.masalahUtama || "—",
      kenapaA: blk.kenapaA || "—",
      kenapaB: blk.kenapaB || "—",
      kenapaC: blk.kenapaC || "—",
      actionPlans: (blk.actionPlans ?? []).map((ap) => ({
        action: ap.action || "—",
        targetDate: normalizeDateDDMMYYYY(ap.targetDate),
        pic: ap.pic || "—",
        status: (["Belum dilaksanakan", "Sedang dilaksanakan", "Selesai"].includes(ap.status)
          ? ap.status
          : "Belum dilaksanakan") as RCAStatus,
        keterangan: Array.isArray(ap.keterangan) ? ap.keterangan : [],
        output: Array.isArray(ap.output) ? ap.output : [],
        evidence: Array.isArray(ap.evidence) ? ap.evidence : [],
      })),
    }));
  });

  const th = "border border-[#1A284F]/30 py-3 px-3 text-center font-semibold text-xs whitespace-nowrap";
  const headers: [string, number][] = [
    ["No",42],["Periode",72],["KPI",160],["Satuan",80],["Baseline",80],["Target",80],["Actual",80],
    ["Masalah Utama (A)",160],["Kenapa A? (B)",140],["Kenapa B? (C)",140],["Kenapa C? (D)",140],
    ["Action Plan",180],["Target Penyelesaian",110],["PIC",120],["Status Perbaikan",130],
    ["Keterangan",160],["Output",160],["Evidence",140],
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* info banner */}
      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <FileText className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Tabel berikut menampilkan <strong>Root Cause Analysis (RCA)</strong> yang disubmit karyawan.
          Tinjau akar masalah dan action plan, lalu <strong>Approve</strong> atau <strong>Request Revision</strong>.
        </span>
      </div>

      {data.length === 0 ? (
        <div className="py-14 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl bg-gray-50/40">
          Belum ada data Root Cause Analysis (RCA) yang disubmit oleh karyawan ini.
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="border-collapse text-xs" style={{ minWidth: 1900 }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {headers.map(([h, w]) => (
                <th key={h} className={th} style={{ minWidth: w }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const aps = item.actionPlans.length > 0 ? item.actionPlans : [null];
              const rs  = aps.length;
              const tdBase = "border border-gray-200 align-top py-2 px-3 bg-white text-gray-700";
              const tdAP   = "border border-gray-200 align-top py-2 px-3 bg-blue-50/20 text-gray-700";
              return aps.map((ap, i) => (
                <tr key={`${item.no}_${i}`} className="border-t border-gray-100">
                  {i === 0 && (
                    <>
                      <td rowSpan={rs} className={`${tdBase} text-center font-semibold text-gray-600`}>{item.no}</td>
                      <td rowSpan={rs} className={`${tdBase} text-center`}>
                        <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode}</span>
                      </td>
                      <td rowSpan={rs} className={`${tdBase} font-medium text-gray-800`}>{item.kpi}</td>
                      <td rowSpan={rs} className={`${tdBase}`}>{item.satuan}</td>
                      <td rowSpan={rs} className={`${tdBase} text-gray-500 italic`}>{item.baseline}</td>
                      <td rowSpan={rs} className={`${tdBase} text-center font-bold text-[#1A284F]`}>{item.target}</td>
                      <td rowSpan={rs} className={`${tdBase} text-center font-bold`}>{item.actual}</td>
                      <td rowSpan={rs} className={`${tdBase} leading-relaxed`}>{item.masalahUtama}</td>
                      <td rowSpan={rs} className={`${tdBase} leading-relaxed`}>{item.kenapaA}</td>
                      <td rowSpan={rs} className={`${tdBase} leading-relaxed`}>{item.kenapaB}</td>
                      <td rowSpan={rs} className={`${tdBase} leading-relaxed`}>{item.kenapaC}</td>
                    </>
                  )}
                  {ap ? (
                    <>
                      <td className={`${tdAP} leading-relaxed`}>{ap.action}</td>
                      <td className={`${tdAP} text-center`}>{ap.targetDate}</td>
                      <td className={`${tdAP}`}>{ap.pic}</td>
                      <td className={`${tdAP} text-center`}>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[ap.status]}`}>{ap.status}</span>
                      </td>
                      <td className={tdAP}>
                        {ap.keterangan.length > 0 ? (
                          <ul className="flex flex-col gap-0.5">
                            {ap.keterangan.map((k, ki) => <li key={ki} className="text-[10px] leading-relaxed">• {k}</li>)}
                          </ul>
                        ) : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                      <td className={tdAP}>
                        {ap.output.length > 0 ? (
                          <ul className="flex flex-col gap-0.5">
                            {ap.output.map((o, oi) => <li key={oi} className="text-[10px] leading-relaxed">• {o}</li>)}
                          </ul>
                        ) : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                      <td className={tdAP}>
                        {ap.evidence.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {ap.evidence.map((ev, ei) => (
                              <span key={ei} className="flex items-center gap-1 text-[10px] text-green-700 font-medium">
                                <FileText className="w-3 h-3 shrink-0" />{ev}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                    </>
                  ) : (
                    <td colSpan={7} className={`${tdAP} text-center text-gray-300`}>Belum ada action plan</td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ─── Indicator Modal ───────────────────────────────────────────────────────────

function IndicatorModal({ item, onClose }: { item: FormItem | MSItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Indikator Penilaian</p>
            <p className="text-sm font-bold text-gray-800 mt-0.5">
              {"label" in item ? item.label || "Indikator" : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0">
              <tr>
                <th className="bg-[#1A284F] text-white text-left py-3 px-5 font-semibold w-64 border-r border-white/20">
                  Indikator Penilaian
                </th>
                {[1, 2, 3, 4, 5].map((n) => (
                  <th key={n} className="bg-[#1A284F] text-white text-center py-3 px-4 font-semibold border-r border-white/20 last:border-r-0">
                    Nilai {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-5 px-5 align-top border-r border-gray-200 bg-gray-50">
                  <p className="font-semibold text-gray-800 mb-1">{"label" in item ? item.label || "Indikator" : ""}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{"description" in item ? item.description : ""}</p>
                </td>
                {item.indicators.map((ind) => (
                  <td key={ind.score} className="py-5 px-4 align-top text-gray-700 leading-relaxed border-r border-gray-100 last:border-r-0 text-xs">
                    {ind.text}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#1A284F] text-white rounded-lg text-sm font-semibold hover:bg-[#131d3b] transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sample data ───────────────────────────────────────────────────────────────

const APPROVER1_APPRAISAL: Record<string, number> = {
  "A-1": 3, "A-2": 2, "A-3": 2, "A-4": 3, "A-5": 3,
  "A-6": 3, "A-7": 3, "A-8": 4, "A-9": 3, "A-10": 3, "A-11": 3, "A-12": 3,
  "B-1": 3, "B-2": 3, "B-3": 3, "B-4": 3, "B-5": 3,
  "C-1": 3, "C-2": 3, "C-3": 3,
};
const APPROVER1_MS: Record<number, number> = { 1: 3, 2: 2, 3: 2, 4: 3, 5: 3 };

// Approver 1 SMART Goals fallback data (used when no stored assessment exists)
const APPROVER1_SG_RATINGS_FALLBACK: Record<number, number> = { 1: 85, 2: 70, 3: 92 };
const APPROVER1_SG_COMMENT_FALLBACK =
  "Pencapaian cukup baik secara keseluruhan. Goals 1 & 2 perlu perhatian lebih pada konsistensi monitoring. Goals 3 telah melampaui target dengan baik — pertahankan momentum ini di semester kedua.";

// ─── Sample Approver 2 data (pre-filled when status = Assessed-Approver 2) ───
const APPROVER2_APPRAISAL: Record<string, number> = {
  "A-1": 4, "A-2": 3, "A-3": 3, "A-4": 4, "A-5": 3,
  "A-6": 4, "A-7": 3, "A-8": 4, "A-9": 3, "A-10": 4, "A-11": 3, "A-12": 4,
  "B-1": 4, "B-2": 3, "B-3": 4, "B-4": 3, "B-5": 4,
  "C-1": 4, "C-2": 3, "C-3": 4,
};
const APPROVER2_MS: Record<number, number> = { 1: 4, 2: 3, 3: 3, 4: 4, 5: 4 };
const APPROVER2_SG_RATINGS_FALLBACK: Record<number, number> = { 1: 88, 2: 75, 3: 95 };
const APPROVER2_SG_COMMENT_FALLBACK = "Pencapaian keseluruhan goals sudah baik dan konsisten. Disarankan mendokumentasikan SOP monitoring sebagai acuan tim. Implementasi program pelatihan di Q3 perlu diprioritaskan agar target akhir tahun tercapai.";
const APPROVER2_KPI_COMMENT = "Data realisasi KPI telah diverifikasi dan sesuai dengan laporan bulanan. Capaian keseluruhan memenuhi ekspektasi dengan beberapa catatan untuk peningkatan di semester berikutnya.";

const SELF_RATINGS: Record<string, number> = {
  "A-1": 4, "A-2": 3, "A-3": 4, "A-4": 3, "A-5": 4,
  "A-6": 3, "A-7": 4, "A-8": 4, "A-9": 3, "A-10": 4, "A-11": 3, "A-12": 4,
  "B-1": 4, "B-2": 3, "B-3": 4, "B-4": 3, "B-5": 4,
  "C-1": 4, "C-2": 3, "C-3": 4,
};

// ─── KPI Review ────────────────────────────────────────────────────────────────

const MONTHS = INITIAL_MONTHS;
const CELLS: Record<string, Record<string, string>> = Object.fromEntries(
  MONTHS.map((m) => [m.id, m.cells])
);

function formatEvidenceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KPIReview({ row, reviewerRole, readOnly }: { row: ApprovalRow; reviewerRole: ReviewerRole; readOnly?: boolean }) {
  const kpiItems = KPI_ITEMS.slice(0, 4);
  const storeFiles: StoredEvidenceFile[] = loadEvidenceFiles();
  const ASSESSED_EVIDENCE: StoredEvidenceFile[] = [
    { id: "ae-1", month: "Jan-26", name: "Laporan_KPI_Jan2026.xlsx", size: 245000, url: "" },
    { id: "ae-2", month: "Feb-26", name: "Laporan_KPI_Feb2026.xlsx", size: 238000, url: "" },
    { id: "ae-3", month: "Mar-26", name: "Realisasi_Produksi_Q1.pdf", size: 512000, url: "" },
    { id: "ae-4", month: "Apr-26", name: "Laporan_KPI_Apr2026.xlsx", size: 251000, url: "" },
    { id: "ae-5", month: "May-26", name: "Laporan_KPI_Mei2026.xlsx", size: 263000, url: "" },
    { id: "ae-6", month: "May-26", name: "Bukti_Pencapaian_Target.pdf", size: 892000, url: "" },
  ];
  const isAssessed = row.status === "Assessed-Approver 2";
  const evidenceFiles: StoredEvidenceFile[] = isAssessed ? ASSESSED_EVIDENCE : storeFiles;
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const initialComments = loadKPIComments(row.no);
  const [myComment, setMyComment] = useState(
    isAssessed ? APPROVER2_KPI_COMMENT : (initialComments[reviewerRole]?.text ?? "")
  );

  const handleCommentChange = (text: string) => {
    if (readOnly || isAssessed) return;
    setMyComment(text);
    saveKPIComment(row.no, reviewerRole, text);
  };

  const ap1Comment = isAssessed
    ? { text: "Verifikasi data KPI telah dilakukan. Realisasi Q1 dan Q2 sesuai dengan laporan operasional. Beberapa KPI di bawah target namun masih dalam toleransi yang dapat diterima.", date: "17/05/2026" }
    : initialComments.approver1;
  const ap2Comment = reviewerRole === "approver2" ? null : initialComments.approver2;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h3 className="font-bold text-[#1A284F]">KPI Tracking — 2026</h3>
        <span className="ml-auto text-sm text-gray-400">Months: {MONTHS.map((m) => m.label).join(", ")}</span>
        <button
          onClick={() => setViewMode(viewMode === "cards" ? "table" : "cards")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {viewMode === "cards" ? "View Table Format" : "View Cards"}
        </button>
      </div>
      
      {viewMode === "cards" ? (
        <>
          {kpiItems.map((kpi) => {
            const scoreRow = kpi.subRows.find((s) => s.label === "Score" || s.label === "Score Total");
            const totalVal = scoreRow
              ? computeTotal2026(kpi, kpi.subRows.indexOf(scoreRow), CELLS, MONTHS)
              : "—";
            return (
              <div key={kpi.no} className="bg-gray-50 rounded-xl border border-gray-200 px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-[#1A284F] text-white px-2 py-0.5 rounded">{kpi.no}</span>
                      <span className="text-sm font-semibold text-[#1A284F] truncate">{kpi.kpi.split("\n")[0]}</span>
                    </div>
                    <p className="text-xs text-gray-500">{kpi.perspektif} · {kpi.satuan} · {kpi.formula}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">{totalVal}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {MONTHS.map((m) => {
                    const actual = m.cells[`${kpi.no}__0`] ?? "—";
                    const target = m.cells[`${kpi.no}__1`] ?? "—";
                    return (
                      <div key={m.id} className="text-xs text-gray-600 bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <span className="font-bold text-gray-800">{m.label}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        Actual: <span className="font-semibold">{actual}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        Target: <span className="font-semibold">{target}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-gray-400 text-center">Showing top {kpiItems.length} of {KPI_ITEMS.length} KPI items</p>
        </>
      ) : (
        <KPITableView kpiItems={kpiItems} months={MONTHS} cells={CELLS} />
      )}

      {/* ── Evidence Documents Section ───────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-5 flex flex-col gap-3 mt-2">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-[#1A284F]" />
          <h4 className="font-bold text-[#1A284F] text-sm">Evidence Documents</h4>
          {evidenceFiles.length > 0 && (
            <span className="ml-auto text-xs bg-blue-50 text-[#1A284F] border border-[#1A284F]/20 px-2 py-0.5 rounded-full font-semibold">
              {evidenceFiles.length} file{evidenceFiles.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {evidenceFiles.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-5 flex flex-col items-center gap-1">
            <Paperclip className="w-6 h-6 text-gray-300 mb-1" />
            <p className="text-xs text-gray-400 italic">No evidence documents uploaded by employee.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Group by month */}
            {Array.from(new Set(evidenceFiles.map((f) => f.month))).map((month) => {
              const monthFiles = evidenceFiles.filter((f) => f.month === month);
              return (
                <div key={month} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#1A284F] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full w-fit">
                    {month}
                  </span>
                  <div className="flex flex-col gap-1.5 pl-1">
                    {monthFiles.map((file) => (
                      <div key={file.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-[11px] text-gray-700 flex-1 truncate font-medium">{file.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 mr-1">{formatEvidenceSize(file.size)}</span>
                        {file.url ? (
                          <a
                            href={file.url}
                            download={file.name}
                            className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors shrink-0"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <span className="text-[10px] text-gray-300 shrink-0 italic">file unavailable</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Approver Comments Section ────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-5 flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#1A284F]" />
          <h4 className="font-bold text-[#1A284F] text-sm">Catatan Approver</h4>
        </div>

        {/* Approver 2 sees Approver 1's comment (read-only) */}
        {reviewerRole === "approver2" && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
              Supervisor (Approver 1)
            </p>
            {ap1Comment?.text ? (
              <div className="bg-blue-50/60 border border-blue-200 rounded-xl px-4 py-3 flex flex-col gap-1">
                <p className="text-sm text-blue-800 leading-relaxed">{ap1Comment.text}</p>
                <p className="text-[10px] text-blue-400 mt-1">{ap1Comment.date}</p>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-xs text-gray-400 italic">Belum ada catatan dari Approver 1.</p>
              </div>
            )}
          </div>
        )}

        {/* Approver 1's own input area */}
        {reviewerRole === "approver1" && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-blue-600">
              Catatan Anda (Supervisor — Approver 1)
            </label>
            <textarea
              rows={4}
              value={myComment}
              onChange={(e) => handleCommentChange(e.target.value)}
              placeholder="Tambahkan catatan atau masukan untuk karyawan dan Approver 2…"
              className="w-full text-sm border-2 border-blue-100 focus:border-blue-400 rounded-xl px-4 py-3 outline-none resize-none transition-colors placeholder-blue-200 text-gray-700"
            />
            {myComment && (
              <p className="text-[10px] text-blue-500 font-medium">✓ Catatan tersimpan otomatis</p>
            )}
          </div>
        )}

        {/* Approver 2's own input area */}
        {reviewerRole === "approver2" && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-widest text-purple-600">
              Catatan Approver 2 (HR Admin)
            </label>
            <textarea
              rows={4}
              value={myComment}
              onChange={(e) => handleCommentChange(e.target.value)}
              readOnly={readOnly || isAssessed}
              placeholder="Tambahkan catatan atau masukan untuk karyawan…"
              className={`w-full text-sm border-2 rounded-xl px-4 py-3 outline-none resize-none transition-colors text-gray-700 ${readOnly || isAssessed ? "bg-purple-50/40 border-purple-100 cursor-default" : "border-purple-100 focus:border-purple-400 placeholder-purple-200"}`}
            />
            {myComment && !(readOnly || isAssessed) && (
              <p className="text-[10px] text-purple-500 font-medium">✓ Catatan tersimpan otomatis</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──�� SMART Goals Approver Assessment ───────────────────────────────────────────

// ─── SMART Goals Approver Review — new format ──────────────────────────────────

type SG_LocalStatus = "-" | "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Batal";
type SG_AchievementStatus = "" | "Tercapai" | "Tidak Tercapai";

interface SG_TargetActual {
  goalId: number; actual: string; status: SG_AchievementStatus; alasan: string; evidenceCount: number;
}

const SG_AP_COLOR: Record<SG_LocalStatus, string> = {
  "-": "bg-gray-100 text-gray-400 border border-gray-200",
  "Belum dilaksanakan": "bg-gray-100 text-gray-500",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-700",
  "Selesai": "bg-green-100 text-green-700",
  "Batal": "bg-red-100 text-red-600",
};
const SG_AP_DOT: Record<SG_LocalStatus, string> = {
  "-": "bg-gray-300", "Belum dilaksanakan": "bg-gray-400",
  "Sedang dilaksanakan": "bg-amber-500", "Selesai": "bg-green-500", "Batal": "bg-red-500",
};

// Mock employee check-in data — AP statuses keyed by AP id
const SG_MOCK_AP: Record<number, SG_LocalStatus> = {
  1: "Selesai", 2: "Sedang dilaksanakan", 3: "Belum dilaksanakan",
  4: "Selesai", 5: "Selesai", 6: "Batal",
  7: "Selesai", 8: "Sedang dilaksanakan", 9: "Belum dilaksanakan",
};
const SG_MOCK_AP_NOTES: Record<number, string> = {
  1: "Konfigurasi load balancer selesai dan telah diuji di lingkungan staging.",
  2: "Sedang dalam tahap pengujian integrasi dengan sistem monitoring real-time.",
  4: "Laporan performa Q1 telah dikirimkan ke seluruh stakeholder terkait.",
  5: "Dashboard layanan pelanggan berhasil diluncurkan tepat waktu.",
  7: "Audit penggunaan lisensi software selesai, penghematan tercapai Rp 800jt.",
};
const SG_MOCK_AP_EVIDENCE: Record<number, { name: string; size: number }[]> = {
  1: [{ name: "bukti_loadbalancer_config.pdf", size: 234000 }],
  4: [{ name: "laporan_performa_q1.pdf", size: 512000 }, { name: "screenshot_dashboard.png", size: 187000 }],
  7: [{ name: "audit_lisensi_2026.xlsx", size: 98000 }],
};

// Mock target vs actual data keyed by goal id
const SG_MOCK_TARGET_ACTUAL: Record<number, SG_TargetActual> = {
  1: { goalId: 1, actual: "Uptime 98%", status: "Tidak Tercapai", alasan: "Terjadi 2 insiden P1 akibat kegagalan switch jaringan yang belum di-upgrade. Auto-failover mengurangi downtime namun SLA 99,9% belum tercapai.", evidenceCount: 0 },
  2: { goalId: 2, actual: "NPS 76", status: "Tidak Tercapai", alasan: "Penurunan disebabkan gangguan layanan di Q2. Program pelatihan customer service sudah dijadwalkan ulang ke Q3.", evidenceCount: 0 },
  3: { goalId: 3, actual: "Rp 1,8M penghematan biaya operasional", status: "Tercapai", alasan: "", evidenceCount: 2 },
};

// Kept for legacy use below
const SAMPLE_CHECKIN_LEGACY: Record<number, {
  realisasiPct: string; kendala: string; rencanaLanjut: string; evidence: { name: string; size: number }[];
}> = {
  1: {
    realisasiPct: "80%",
    kendala: "Kendala teknis dalam integrasi sistem monitoring digital dengan infrastruktur yang ada.",
    rencanaLanjut: "Koordinasi dengan tim IT untuk resolusi teknis dan penjadwalan ulang implementasi.",
    evidence: [{ name: "bukti_capaian_q2.pdf", size: 245120 }],
  },
  2: {
    realisasiPct: "60%",
    kendala: "Keterbatasan waktu pelatihan akibat jadwal operasional yang padat.",
    rencanaLanjut: "Mengalokasikan jadwal pelatihan pada periode libur operasional di Q3.",
    evidence: [{ name: "modul_pelatihan_draft.pdf", size: 512000 }, { name: "foto_sesi.jpg", size: 187400 }],
  },
};

const PCT_BAR_COLOR = (pct: number) =>
  pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : pct >= 30 ? "bg-amber-500" : "bg-red-400";

const PCT_TEXT_COLOR = (pct: number) =>
  pct >= 100 ? "text-green-600" : pct >= 60 ? "text-blue-600" : pct >= 30 ? "text-amber-600" : "text-red-500";

const FAKE_BLOB = URL.createObjectURL(new Blob(["[Demo file content]"], { type: "text/plain" }));

function EvidenceRow({ file, formatSize }: { file: { name: string; size: number; type?: string }; formatSize: (n: number) => string }) {
  const isPdf = file.name.endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png)$/i.test(file.name);
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
      <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <span className="text-[11px] text-gray-700 flex-1 truncate font-medium">{file.name}</span>
      <span className="text-[10px] text-gray-400 shrink-0 mr-1">{formatSize(file.size)}</span>
      {(isPdf || isImage) && (
        <a
          href={FAKE_BLOB}
          target="_blank"
          rel="noopener noreferrer"
          title="Lihat"
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-[#1A284F] transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </a>
      )}
      <a
        href={FAKE_BLOB}
        download={file.name}
        title="Unduh"
        className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-[#1A284F] transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ── Status Overview Card ──────────────────────────────────────────────────────

function SG_StatusOverview({ goals, apStatuses }: { goals: typeof SAMPLE_GOALS; apStatuses: Record<number, SG_LocalStatus> }) {
  let selesai = 0, sedang = 0, belum = 0, batal = 0, dash = 0;
  goals.forEach((g) => g.actionPlans.forEach((ap) => {
    const s = apStatuses[ap.id] ?? "-";
    if (s === "Selesai") selesai++; else if (s === "Sedang dilaksanakan") sedang++;
    else if (s === "Belum dilaksanakan") belum++; else if (s === "Batal") batal++; else dash++;
  }));
  const totalAPs = goals.reduce((s, g) => s + g.actionPlans.length, 0);
  const closedGoals = goals.filter((g) => g.actionPlans.length > 0 && g.actionPlans.every((ap) => (apStatuses[ap.id] ?? "-") === "Selesai")).length;
  const totalGoals = goals.length;
  const goalsPct = totalGoals > 0 ? Math.round((closedGoals / totalGoals) * 100) : 0;
  const apPct = totalAPs > 0 ? Math.round((selesai / totalAPs) * 100) : 0;
  const openAPs = sedang + belum + dash;

  return (
    <div className="border border-[#1A284F]/20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A284F] to-[#253660] shadow-sm">
      <div className="px-5 py-2.5 flex items-center gap-2 border-b border-white/10">
        <TrendingUp className="w-3.5 h-3.5 text-white/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Status Progress Keseluruhan</span>
      </div>
      <div className="px-5 py-4 grid grid-cols-3 gap-4 divide-x divide-white/10">
        <div className="flex flex-col gap-2 pr-4">
          <div className="flex items-center gap-1.5"><Target className="w-3 h-3 text-blue-300" /><span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Goals</span></div>
          <div className="flex items-end gap-1"><span className="text-2xl font-bold text-white leading-none">{totalGoals}</span><span className="text-xs text-white/50 mb-0.5 ml-1">Total</span></div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-white/50">Open</span><span className="font-semibold text-white">{totalGoals - closedGoals}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Closed</span><span className="font-semibold text-green-400">{closedGoals}</span></div>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1"><div className="h-full bg-green-500 rounded-full" style={{ width: `${goalsPct}%` }} /></div>
          <span className="text-[10px] text-white/40">{goalsPct}%</span>
        </div>
        <div className="flex flex-col gap-2 px-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Action Plans</span>
          <div className="flex items-end gap-1"><span className="text-2xl font-bold text-white leading-none">{totalAPs}</span><span className="text-xs text-white/50 mb-0.5 ml-1">Total</span></div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-white/50">Open</span><span className="font-semibold text-white">{openAPs}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Closed</span><span className="font-semibold text-green-400">{selesai}</span></div>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-1"><div className="h-full bg-green-500 rounded-full" style={{ width: `${apPct}%` }} /></div>
          <span className="text-[10px] text-white/40">{apPct}%</span>
        </div>
        <div className="flex flex-col gap-2 pl-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Breakdown Status</span>
          <div className="flex flex-col gap-1.5 mt-1">
            {([ ["Selesai", selesai, "bg-green-500", "text-green-400"], ["Sedang", sedang, "bg-amber-400", "text-amber-400"], ["Belum", belum, "bg-gray-400", "text-gray-400"], ["Batal", batal, "bg-red-500", "text-red-400"] ] as const).map(([label, count, dot, text]) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} /><span className="text-[11px] text-white/60">{label}</span></div>
                <span className={`text-xs font-bold ${text}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Goal Review Card ──────────────────────────────────────────────────────────

function SG_GoalCard({
  goal,
  apStatuses,
  apNotes,
  apEvidence,
  onPreviewFile,
  defaultOpen,
}: {
  goal: typeof SAMPLE_GOALS[0];
  apStatuses: Record<number, SG_LocalStatus>;
  apNotes: Record<number, string>;
  apEvidence: Record<number, StoredSmartGoalEvidenceFile[]>;
  onPreviewFile: (file: StoredSmartGoalEvidenceFile) => void;
  defaultOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(!defaultOpen);
  const selesaiCount = goal.actionPlans.filter((ap) => (apStatuses[ap.id] ?? "-") === "Selesai").length;
  const totalAPs = goal.actionPlans.length;
  const pct = totalAPs > 0 ? Math.round((selesaiCount / totalAPs) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center gap-3 px-4 py-3 bg-[#1A284F] text-left">
        <span className="text-white text-sm font-bold flex-1">{goal.label}</span>
        {totalAPs > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} /></div>
            <span className="text-[10px] text-white/60 font-semibold">{selesaiCount}/{totalAPs} AP</span>
          </div>
        )}
        {collapsed ? <ChevronDown className="w-4 h-4 text-white/60 shrink-0" /> : <ChevronUp className="w-4 h-4 text-white/60 shrink-0" />}
      </button>
      {!collapsed && (
        <div className="p-4 bg-white flex flex-col gap-4">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-36 border-r border-white/20">Kriteria</th>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide">Uraian (diisi karyawan)</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                    <td className="border-t border-gray-100 border-r border-gray-100 px-3 py-2 align-middle whitespace-nowrap">
                      <span className="font-semibold text-[11px] text-gray-700">{row.title}</span>
                    </td>
                    <td className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-700 leading-relaxed">
                      {(goal[row.key as keyof typeof goal] as string) || <span className="italic text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {goal.actionPlans.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1A284F]">Status Action Plans</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + goal.actionPlans.length * 160}px` }}>
                  <thead>
                    <tr>
                      <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-28 border-r border-white/20">Action Plans</th>
                      {goal.actionPlans.map((ap, idx) => (
                        <th key={ap.id} className={`bg-[#1A284F] text-white text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${idx < goal.actionPlans.length - 1 ? "border-r border-white/20" : ""}`}>Action Plan {idx + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-top"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Deskripsi</span></td>
                      {goal.actionPlans.map((ap, idx) => (
                        <td key={ap.id} className={`border-t border-gray-200 px-3 py-2 align-top text-[11px] text-gray-700 leading-relaxed ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                          <div className="flex items-start gap-1.5">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[9px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                            <span>{ap.description}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-middle"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</span></td>
                      {goal.actionPlans.map((ap, idx) => {
                        const st: SG_LocalStatus = apStatuses[ap.id] ?? "-";
                        return (
                          <td key={ap.id} className={`border-t border-gray-200 px-2 py-2 text-center align-middle ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                            <span className={`inline-flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 font-semibold leading-tight ${SG_AP_COLOR[st]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SG_AP_DOT[st]}`} />
                              {st === "-" ? "—" : st === "Belum dilaksanakan" ? "Belum" : st === "Sedang dilaksanakan" ? "Berjalan" : st}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-white">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-top"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Catatan</span></td>
                      {goal.actionPlans.map((ap, idx) => (
                        <td key={ap.id} className={`border-t border-gray-200 px-3 py-2 align-top text-[11px] leading-relaxed ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                          {apNotes[ap.id]
                            ? <span className="text-gray-700">{apNotes[ap.id]}</span>
                            : <span className="italic text-gray-300">—</span>}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-top"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Evidence</span></td>
                      {goal.actionPlans.map((ap, idx) => {
                        const files = apEvidence[ap.id] ?? [];
                        return (
                          <td key={ap.id} className={`border-t border-gray-200 px-2 py-2 align-top ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                            {files.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {files.map((f, fi) => (
                                  <div key={fi} className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-gray-200">
                                    <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                                    <span className="text-[10px] text-gray-700 truncate flex-1 font-medium">{f.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => onPreviewFile(f)}
                                      title="Lihat Evidence di Browser"
                                      className="p-1 rounded hover:bg-blue-50 text-blue-600 hover:text-[#1A284F]"
                                    >
                                      <Eye className="w-3 h-3" />
                                    </button>
                                    <a
                                      href={f.dataUrl || FAKE_BLOB}
                                      download={f.name}
                                      title="Download Evidence"
                                      className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-[#1A284F]"
                                    >
                                      <Download className="w-3 h-3" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="italic text-[10px] text-gray-300 px-1">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Target vs Actual read-only ────────────────────────────────────────────────

function SG_TargetVsActual({
  goals,
  targetActuals,
  onPreviewFile,
}: {
  goals: typeof SAMPLE_GOALS;
  targetActuals: Record<number, SG_TargetActual & { files?: StoredSmartGoalEvidenceFile[] }>;
  onPreviewFile: (file: StoredSmartGoalEvidenceFile) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-3 bg-[#1A284F] gap-2">
        <TrendingUp className="w-4 h-4 text-green-300" />
        <span className="text-white text-sm font-bold flex-1">Target vs Actual</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "560px" }}>
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-24">Goals</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-48">Target</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-36">Actual</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Status &amp; Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal, idx) => {
              const ta = targetActuals[goal.id];
              return (
                <tr key={goal.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="border-t border-gray-100 px-4 py-3 align-top"><span className="font-semibold text-[11px] text-gray-700">{goal.label}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top"><span className="text-[11px] text-gray-500 italic leading-relaxed">{goal.target || "—"}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top"><span className="text-[11px] text-gray-800 font-medium">{ta?.actual || <span className="italic text-gray-300">—</span>}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                    {!ta?.status ? (
                      <span className="text-[11px] text-gray-300 italic">Belum diisi</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit ${ta.status === "Tercapai" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ta.status === "Tercapai" ? "bg-green-500" : "bg-red-500"}`} />
                          {ta.status}
                        </span>
                        {ta.status === "Tidak Tercapai" && ta.alasan && (
                          <div className="bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 max-w-xs">
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-0.5">Alasan</p>
                            <p className="text-[11px] text-red-700 leading-relaxed">{ta.alasan}</p>
                          </div>
                        )}
                        {ta.status === "Tercapai" && ta.evidenceCount > 0 && (
                          <div className="flex flex-col gap-1 mt-1">
                            {(ta.files ?? []).map((f, fi) => (
                              <div key={fi} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 w-fit">
                                <Paperclip className="w-3 h-3 text-green-600 shrink-0" />
                                <span className="text-[11px] text-green-800 font-medium">{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => onPreviewFile(f)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-green-300 text-[10px] font-bold text-[#1A284F] hover:bg-green-100"
                                >
                                  <Eye className="w-3 h-3" /> Lihat di Browser
                                </button>
                                <a
                                  href={f.dataUrl || FAKE_BLOB}
                                  download={f.name}
                                  className="p-0.5 text-green-700 hover:text-green-900"
                                  title="Download"
                                >
                                  <Download className="w-3 h-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── (unused legacy) SmartGoalsSettingTable kept for type compatibility ─────────

function SmartGoalsSettingTable({ goals }: { goals: typeof SAMPLE_GOALS }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#1A284F]">
          SMART Goals Setting — Employee Submission
        </span>
        <span className="ml-auto text-xs text-gray-400">{goals.length} goal{goals.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table
          className="border-collapse w-full text-xs"
          style={{ minWidth: `${Math.max(520, 200 + goals.length * 200)}px` }}
        >
          <thead>
            <tr>
              <th className="border border-[#1A284F] bg-[#1A284F] text-white text-left py-2.5 px-3 font-bold" style={{ width: "190px" }}>
                SMART Goals
              </th>
              {goals.map((g) => (
                <th key={g.id} className="border border-[#1A284F] bg-[#1A284F] text-white text-center py-2.5 px-3 font-bold">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.key} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="border border-gray-200 align-top px-3 py-3 bg-[#1A284F]/5" style={{ width: "190px" }}>
                  <p className="font-semibold text-[#1A284F] text-[11px] mb-0.5">{row.title}</p>
                  <p className="text-gray-400 text-[10px] leading-relaxed">{row.desc}</p>
                </td>
                {goals.map((g) => (
                  <td key={g.id} className="border border-gray-200 align-top px-3 py-2.5">
                    <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[52px]">
                      {(g[row.key as keyof typeof g] as string) || <span className="text-gray-300 italic">—</span>}
                    </p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getBobotByPosition(position: string): number {
  const p = position.toLowerCase();
  if (p.includes("kepala") || p.includes("director") || p.includes("direktur")) return 40;
  if (p.includes("manager") || p.includes("manajer")) return 35;
  if (p.includes("supervisor") || p.includes("leader") || p.includes("koordinator")) return 30;
  return 25; // Staff / Analis / default
}

function SmartGoalsApproverReview({
  assessorRatings,
  onRate,
  submitted,
  reviewerRole,
  comments,
  onComment,
  employeeId,
  rowNo,
  position,
}: {
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  reviewerRole: ReviewerRole;
  comments: Record<number, string>;
  onComment: (goalId: number, text: string) => void;
  employeeId?: string;
  rowNo?: string;
  position?: string;
}) {
  const [previewEvidenceFile, setPreviewEvidenceFile] = useState<StoredSmartGoalEvidenceFile | null>(null);
  const live = loadSubmittedGoals(employeeId);
  const goals = live && live.length > 0 ? live : SAMPLE_GOALS;
  const ownerCheckInEntries = loadCheckInEntries(employeeId);

  // Bangun status Action Plan, catatan, evidence, dan Target vs Actual murni dari data owner (karyawan pemilik)
  const ownerApStatuses: Record<number, SG_LocalStatus> = {};
  const ownerApNotes: Record<number, string> = {};
  const ownerApEvidence: Record<number, StoredSmartGoalEvidenceFile[]> = {};
  const ownerTargetActuals: Record<number, SG_TargetActual & { files?: StoredSmartGoalEvidenceFile[] }> = {};

  for (const g of goals) {
    const ci = ownerCheckInEntries.find((e) => e.goalId === g.id);
    for (const ap of g.actionPlans) {
      const st = (ci?.actionPlanStatuses?.[ap.id] as SG_LocalStatus | undefined) ?? "-";
      ownerApStatuses[ap.id] = st;
      if (ci?.actionPlanKendala?.[ap.id]) {
        ownerApNotes[ap.id] = ci.actionPlanKendala[ap.id];
      }
      if (ci?.actionPlanEvidence?.[ap.id]) {
        ownerApEvidence[ap.id] = ci.actionPlanEvidence[ap.id];
      }
    }
    const files = ci?.evidenceFiles ?? [];
    ownerTargetActuals[g.id] = {
      actual: ci?.actual ?? "",
      status: (ci?.targetAchievementStatus as "Tercapai" | "Tidak Tercapai" | "") ?? "",
      alasan: ci?.alasanTidakTercapai ?? "",
      evidenceCount: files.length,
      files,
    };
  }

  // Load Approver 1 stored assessment (for Approver 2 view)
  const storedA1 = rowNo ? loadSGAssessment(rowNo) : null;
  const a1Ratings: Record<number, number> = storedA1
    ? Object.fromEntries(
        Object.entries(storedA1.ratings)
          .filter(([k]) => k.startsWith("sg-"))
          .map(([k, v]) => [Number(k.slice(3)), v])
      )
    : {};
  const a1GlobalComment = storedA1?.globalComment ?? "";
  const a1AssessedDate  = storedA1?.assessedDate  ?? "—";
  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel = reviewerRole === "approver1" ? "Penilaian Approver 1" : "Penilaian Approver 2";

  const filledScores = goals.map((g) => assessorRatings[`sg-${g.id}`] ?? null).filter((v): v is number => v != null);
  const totalAvg = filledScores.length > 0 ? Math.round(filledScores.reduce((s, v) => s + v, 0) / filledScores.length) : null;

  // Final Score computation (visible when both A1 & A2 data exist OR for approver2 view)
  const storedA2 = rowNo && reviewerRole !== "approver2" ? loadAssessment(rowNo, "approver2") : null;
  const a2RatingsStored: Record<number, number> = storedA2
    ? Object.fromEntries(
        Object.entries(storedA2.ratings)
          .filter(([k]) => k.startsWith("sg-"))
          .map(([k, v]) => [Number(k.slice(3)), v])
      )
    : (reviewerRole === "approver2" ? Object.fromEntries(goals.map((g) => [g.id, assessorRatings[`sg-${g.id}`] ?? 0])) : {});
  const a2RatingsMap: Record<number, number> = reviewerRole === "approver2"
    ? Object.fromEntries(goals.map((g) => [g.id, assessorRatings[`sg-${g.id}`] ?? 0]))
    : a2RatingsStored;
  const hasA2Data = Object.keys(a2RatingsMap).length > 0 && goals.some((g) => (a2RatingsMap[g.id] ?? 0) > 0);
  const bobot = position ? getBobotByPosition(position) : 25;
  const perGoalAvgRatings = goals.map((g) => {
    const r1 = a1Ratings[g.id] ?? 0;
    const r2 = a2RatingsMap[g.id] ?? 0;
    return { goalId: g.id, a1: r1, a2: r2, avg: Math.round((r1 + r2) / 2) };
  });
  const overallAvg = hasA2Data ? Math.round(perGoalAvgRatings.reduce((s, r) => s + r.avg, 0) / perGoalAvgRatings.length) : null;
  const finalScore = overallAvg != null ? Math.round(overallAvg * bobot / 100 * 10) / 10 : null; // percentage points weighted by bobot
  const showFinalScore = hasA2Data || (reviewerRole === "approver2" && filledScores.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-[#1A284F]">SMART Goals Measurement — 2026</h3>
        {submitted && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Assessment Submitted
          </span>
        )}
      </div>

      {/* 1 — Status Progress Overview */}
      <SG_StatusOverview goals={goals} apStatuses={ownerApStatuses} />

      {/* 2 — Per-goal collapsible cards */}
      <div className="flex flex-col gap-3">
        {goals.map((goal, idx) => (
          <SG_GoalCard
            key={goal.id}
            goal={goal}
            apStatuses={ownerApStatuses}
            apNotes={ownerApNotes}
            apEvidence={ownerApEvidence}
            onPreviewFile={(file) => setPreviewEvidenceFile(file)}
            defaultOpen={idx === 0}
          />
        ))}
      </div>

      {/* 3 — Target vs Actual */}
      <SG_TargetVsActual
        goals={goals}
        targetActuals={ownerTargetActuals}
        onPreviewFile={(file) => setPreviewEvidenceFile(file)}
      />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Penilaian Approver</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* 4 — Approver 1 summary (visible to Approver 2 only) */}
      {reviewerRole === "approver2" && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600">Penilaian Approver 1 (Supervisor)</p>
            <span className="ml-auto text-[10px] text-blue-400">Dinilai: {a1AssessedDate}</span>
          </div>
          <div className="flex flex-col gap-2 mb-1">
            {goals.map((goal, idx) => {
              const v = a1Ratings[goal.id];
              return (
                <div key={goal.id} className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500 w-5 shrink-0 font-semibold">{idx + 1}.</span>
                  <span className="text-gray-700 flex-1 truncate">{goal.label}</span>
                  {v != null ? (
                    <><div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden shrink-0"><div className={`h-1.5 rounded-full ${PCT_BAR_COLOR(v)}`} style={{ width: `${v}%` }} /></div><span className={`font-bold w-10 text-right shrink-0 ${PCT_TEXT_COLOR(v)}`}>{v}%</span></>
                  ) : <span className="text-gray-300 w-10 text-right shrink-0">—</span>}
                </div>
              );
            })}
          </div>
          {a1GlobalComment && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-blue-700"><MessageSquare className="w-3.5 h-3.5" />Komentar Approver 1</label>
              <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-blue-50/50 border-blue-100 text-blue-800">{a1GlobalComment}</p>
            </div>
          )}
          <div className="border-t border-blue-200 pt-3 flex items-center justify-between">
            <span className="text-sm font-bold text-blue-700">Rata-Rata Approver 1</span>
            {(() => {
              const vals = goals.map((g) => a1Ratings[g.id] ?? null).filter((v): v is number => v != null);
              const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
              return <span className={`text-2xl font-black ${avg != null ? PCT_TEXT_COLOR(avg) : "text-gray-300"}`}>{avg != null ? `${avg}%` : "—"}</span>;
            })()}
          </div>
        </div>
      )}

      {/* 5 — Penilaian Approver: unified table for all goals */}
      <div className={`border rounded-2xl overflow-hidden ${assessorColor === "indigo" ? "border-indigo-100" : "border-teal-100"}`}>
        <div className={`px-4 py-3 flex items-center gap-2 ${assessorColor === "indigo" ? "bg-indigo-600" : "bg-teal-600"}`}>
          <span className="text-white text-sm font-bold">{assessorLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: "520px" }}>
            <thead>
              <tr>
                <th className={`text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide border-b w-8 ${assessorColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>No</th>
                <th className={`text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide border-b border-l ${assessorColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>Goals</th>
                <th className={`text-center px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide border-b border-l w-32 ${assessorColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>Status Pencapaian</th>
                <th className={`text-center px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide border-b border-l w-48 ${assessorColor === "indigo" ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-teal-50 text-teal-700 border-teal-100"}`}>Berikan nilai berdasarkan pencapaian Goals Karyawan (%)</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal, idx) => {
                const ratingKey = `sg-${goal.id}`;
                const ratingVal = assessorRatings[ratingKey];
                const achieveStatus = ownerTargetActuals[goal.id]?.status ?? "";
                return (
                  <tr key={goal.id} className={idx % 2 === 0 ? "bg-white" : `${assessorColor === "indigo" ? "bg-indigo-50/20" : "bg-teal-50/20"}`}>
                    <td className={`border-t px-4 py-3 align-middle text-center font-bold ${assessorColor === "indigo" ? "border-indigo-50 text-indigo-400" : "border-teal-50 text-teal-400"}`}>{idx + 1}</td>
                    <td className={`border-t border-l px-4 py-3 align-middle font-semibold text-gray-700 ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>{goal.label}</td>
                    <td className={`border-t border-l px-4 py-3 align-middle text-center ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>
                      {achieveStatus === "Tercapai" && <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />Tercapai</span>}
                      {achieveStatus === "Tidak Tercapai" && <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-red-100 text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />Tidak Tercapai</span>}
                      {!achieveStatus && <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className={`border-t border-l px-4 py-3 align-middle ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>
                      {submitted ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full ${PCT_BAR_COLOR(ratingVal ?? 0)}`} style={{ width: `${ratingVal ?? 0}%` }} /></div>
                          <span className={`text-sm font-bold w-12 text-right shrink-0 ${PCT_TEXT_COLOR(ratingVal ?? 0)}`}>{ratingVal ?? 0}%</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center border-2 rounded-lg overflow-hidden ${assessorColor === "indigo" ? "border-indigo-200 focus-within:border-indigo-500" : "border-teal-200 focus-within:border-teal-500"}`}>
                            <input type="number" min={0} max={100} value={ratingVal ?? ""} onChange={(e) => onRate(ratingKey, Math.min(100, Math.max(0, Number(e.target.value))))} placeholder="0"
                              className={`text-sm font-bold text-right outline-none w-14 px-2 py-1.5 bg-white ${assessorColor === "indigo" ? "text-indigo-700" : "text-teal-700"}`} />
                            <span className={`pr-2 text-xs font-semibold ${assessorColor === "indigo" ? "text-indigo-400" : "text-teal-400"}`}>%</span>
                          </div>
                          {ratingVal != null && (
                            <div className="flex-1 flex items-center gap-1.5">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden"><div className={`h-2 rounded-full ${PCT_BAR_COLOR(ratingVal)}`} style={{ width: `${ratingVal}%` }} /></div>
                              <span className={`text-xs font-bold w-10 text-right shrink-0 ${PCT_TEXT_COLOR(ratingVal)}`}>{ratingVal}%</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global comment — one field for all goals */}
      <div className={`border rounded-2xl overflow-hidden ${assessorColor === "indigo" ? "border-indigo-100" : "border-teal-100"}`}>
        <div className={`px-4 py-2.5 flex items-center gap-2 ${assessorColor === "indigo" ? "bg-indigo-50" : "bg-teal-50"}`}>
          <MessageSquare className={`w-3.5 h-3.5 ${assessorColor === "indigo" ? "text-indigo-600" : "text-teal-600"}`} />
          <span className={`text-xs font-bold ${assessorColor === "indigo" ? "text-indigo-700" : "text-teal-700"}`}>
            Komentar &amp; Catatan Approver <span className="text-rose-500">* (Wajib Diisi)</span>
          </span>
        </div>
        <div className="p-4">
          {submitted ? (
            <p className={`text-xs leading-relaxed rounded-xl px-4 py-3 border ${assessorColor === "indigo" ? "bg-indigo-50/50 border-indigo-100 text-indigo-800" : "bg-teal-50/50 border-teal-100 text-teal-800"}`}>
              {comments[0] || <span className="text-gray-400 italic">Tidak ada komentar.</span>}
            </p>
          ) : (
            <textarea rows={4} value={comments[0] ?? ""} onChange={(e) => onComment(0, e.target.value)}
              placeholder="Tambahkan komentar atau catatan keseluruhan untuk penilaian SMART Goals ini…"
              className={`w-full text-xs border-2 rounded-xl px-3 py-2.5 outline-none resize-none transition-colors ${assessorColor === "indigo" ? "border-indigo-100 focus:border-indigo-400 placeholder-indigo-200 text-gray-700" : "border-teal-100 focus:border-teal-400 placeholder-teal-200 text-gray-700"}`}
            />
          )}
        </div>
      </div>

      {/* 6 — Total score summary */}
      <div className={`rounded-2xl border-2 px-6 py-5 flex flex-col gap-3 ${assessorColor === "indigo" ? "border-indigo-200 bg-indigo-50/40" : "border-teal-200 bg-teal-50/40"}`}>
        <p className={`text-[11px] font-bold uppercase tracking-widest ${assessorColor === "indigo" ? "text-indigo-600" : "text-teal-600"}`}>
          {reviewerRole === "approver2" ? "Penilaian Approver 2 — Ringkasan" : "Total Nilai"}
        </p>
        <div className="flex flex-col gap-2 mb-2">
          {goals.map((goal, idx) => {
            const v = assessorRatings[`sg-${goal.id}`];
            const achieveStatus = ownerTargetActuals[goal.id]?.status ?? "";
            return (
              <div key={goal.id} className="flex items-center gap-3 text-xs">
                <span className="text-gray-500 w-5 shrink-0 font-semibold">{idx + 1}.</span>
                <span className="text-gray-700 flex-1 truncate">{goal.label}</span>
                {achieveStatus === "Tercapai" && <span className="shrink-0 text-[9px] rounded-full px-2 py-0.5 font-bold bg-green-100 text-green-700">Tercapai</span>}
                {achieveStatus === "Tidak Tercapai" && <span className="shrink-0 text-[9px] rounded-full px-2 py-0.5 font-bold bg-red-100 text-red-600">Tidak Tercapai</span>}
                {v != null ? (
                  <><div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden shrink-0"><div className={`h-1.5 rounded-full ${PCT_BAR_COLOR(v)}`} style={{ width: `${v}%` }} /></div><span className={`font-bold w-10 text-right shrink-0 ${PCT_TEXT_COLOR(v)}`}>{v}%</span></>
                ) : <span className="text-gray-300 w-10 text-right shrink-0">—</span>}
              </div>
            );
          })}
        </div>
        <div className={`border-t pt-3 flex items-center justify-between ${assessorColor === "indigo" ? "border-indigo-200" : "border-teal-200"}`}>
          <span className={`text-sm font-bold ${assessorColor === "indigo" ? "text-indigo-700" : "text-teal-700"}`}>
            Rata-Rata ({filledScores.length}/{goals.length} goals dinilai)
          </span>
          <span className={`text-2xl font-black ${totalAvg != null ? PCT_TEXT_COLOR(totalAvg) : "text-gray-300"}`}>
            {totalAvg != null ? `${totalAvg}%` : "—"}
          </span>
        </div>
      </div>

      {/* 7 — Final Score (shown when A2 data available) */}
      {showFinalScore && (
        <div className="rounded-2xl bg-[#1A284F] px-6 py-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300 mb-0.5">Final Score</p>
              <p className="text-xs text-blue-200">Rata-rata A1 &amp; A2 × Bobot Jabatan ({bobot}%)</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black text-white">{finalScore != null ? `${finalScore.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-blue-300 mt-0.5">dari 100% max (×{bobot}% bobot jabatan)</p>
            </div>
          </div>

          {/* Per-goal breakdown table */}
          <div className="rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/10">
                  <th className="text-left px-3 py-2 text-blue-200 font-semibold">Goals</th>
                  <th className="text-center px-3 py-2 text-blue-200 font-semibold w-16">A1 (%)</th>
                  <th className="text-center px-3 py-2 text-blue-200 font-semibold w-16">A2 (%)</th>
                  <th className="text-center px-3 py-2 text-blue-200 font-semibold w-20">Rata-rata</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal, idx) => {
                  const row2 = perGoalAvgRatings[idx];
                  return (
                    <tr key={goal.id} className="border-t border-white/10">
                      <td className="px-3 py-2 text-blue-100 font-medium">{idx + 1}. {goal.label}</td>
                      <td className="text-center px-3 py-2 text-white font-semibold">{row2.a1 > 0 ? `${row2.a1}%` : "—"}</td>
                      <td className="text-center px-3 py-2 text-white font-semibold">{row2.a2 > 0 ? `${row2.a2}%` : "—"}</td>
                      <td className="text-center px-3 py-2">
                        <span className={`font-bold ${row2.avg >= 80 ? "text-green-300" : row2.avg >= 60 ? "text-yellow-300" : "text-red-300"}`}>
                          {row2.a1 > 0 || row2.a2 > 0 ? `${row2.avg}%` : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td colSpan={3} className="px-3 py-2.5 text-blue-200 font-bold text-right">Rata-rata Keseluruhan</td>
                  <td className="text-center px-3 py-2.5 text-white font-black text-sm">{overallAvg != null ? `${overallAvg}%` : "—"}</td>
                </tr>
                <tr className="border-t border-white/20 bg-white/10">
                  <td colSpan={3} className="px-3 py-2.5 text-blue-200 font-bold text-right">
                    Final Score ({overallAvg ?? "—"}% × {bobot}% bobot)
                  </td>
                  <td className="text-center px-3 py-2.5 text-yellow-300 font-black text-base">{finalScore != null ? `${finalScore.toFixed(1)}%` : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[10px] text-blue-300/60 text-center">Bobot jabatan "{position ?? "—"}" = {bobot}%</p>
        </div>
      )}

      {/* Modal Preview Evidence di Browser */}
      {previewEvidenceFile && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewEvidenceFile(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="text-sm font-bold truncate">{previewEvidenceFile.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewEvidenceFile.dataUrl || FAKE_BLOB}
                  download={previewEvidenceFile.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewEvidenceFile(null)}
                  className="text-white/70 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-100 flex items-center justify-center min-h-[420px]">
              {previewEvidenceFile.dataUrl ? (
                previewEvidenceFile.type?.startsWith("image/") ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(previewEvidenceFile.name) ? (
                  <img
                    src={previewEvidenceFile.dataUrl}
                    alt={previewEvidenceFile.name}
                    className="max-h-[72vh] max-w-full object-contain rounded-xl shadow bg-white p-2"
                  />
                ) : (
                  <iframe
                    src={previewEvidenceFile.dataUrl}
                    title={previewEvidenceFile.name}
                    className="w-full h-[72vh] rounded-xl bg-white border border-gray-200"
                  />
                )
              ) : (
                <div className="bg-white rounded-2xl p-8 text-center space-y-3 border border-gray-200 max-w-md">
                  <FileText className="w-12 h-12 text-[#1A284F] mx-auto" />
                  <p className="text-sm font-bold text-gray-800">{previewEvidenceFile.name}</p>
                  <p className="text-xs text-gray-500">
                    Dokumen Evidence SMART Goals siap ditampilkan atau diunduh.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Score button helpers ──────────────────────────────────────────────────────

function ReadOnlyScore({ value, active, color }: { value: number; active: boolean; color: "navy" | "blue" | "indigo" | "teal" }) {
  const activeClass: Record<string, string> = {
    navy:   "bg-[#1A284F] text-white border-[#1A284F]",
    blue:   "bg-blue-600 text-white border-blue-600",
    indigo: "bg-indigo-600 text-white border-indigo-600",
    teal:   "bg-teal-600 text-white border-teal-600",
  };
  return (
    <div className={`w-9 h-9 rounded border text-xs font-bold flex items-center justify-center transition-colors ${
      active ? activeClass[color] : "border-gray-200 text-gray-300 bg-white"
    }`}>{value}</div>
  );
}

function EditableScore({ value, selected, color, onSelect }: { value: number; selected: boolean; color: "indigo" | "teal"; onSelect: () => void }) {
  const activeClass: Record<string, string> = {
    indigo: "bg-indigo-600 text-white border-indigo-600",
    teal:   "bg-teal-600 text-white border-teal-600",
  };
  const hoverClass: Record<string, string> = {
    indigo: "border-indigo-300 text-indigo-500 hover:border-indigo-500 hover:text-indigo-700",
    teal:   "border-teal-300 text-teal-500 hover:border-teal-500 hover:text-teal-700",
  };
  return (
    <button
      onClick={onSelect}
      className={`w-9 h-9 rounded border text-xs font-bold transition-colors ${selected ? activeClass[color] : `bg-white ${hoverClass[color]}`}`}
    >{value}</button>
  );
}

// ─── Appraisal Form Review ─────────────────────────────────────────────────────

function AppraisalFormReview({
  row, reviewerRole, assessorRatings, onRate, submitted,
  indicatorItem, setIndicatorItem, activeForm, setActiveForm,
}: {
  row: ApprovalRow;
  reviewerRole: ReviewerRole;
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  indicatorItem: FormItem | MSItem | null;
  setIndicatorItem: (item: FormItem | MSItem | null) => void;
  activeForm: "A" | "B" | "C";
  setActiveForm: (f: "A" | "B" | "C") => void;
}) {
  const self = loadAppraisalSelf(row.employeeId);
  const selfRatings = self ? Object.fromEntries(self.forms.flatMap((entry) => Object.entries(entry.ratings).map(([key, value]) => [key.replace("__", "-"), value]))) : {};
  const alias = workflowAlias(row.no);
  const record = alias && loadWorkflowRecords().find((item) => item.key === alias.key);
  const firstRatings = loadAssessment(row.no, "approver1")?.ratings ?? record?.assessments.approver1?.ratings ?? {};
  const form = FORMS.find((f) => f.id === activeForm)!;
  const showApp1 = reviewerRole === "approver2";
  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel = reviewerRole === "approver1" ? "Evaluasi Approver 1" : "Evaluasi Approver 2";

  const selfRated     = form.items.filter((i) => selfRatings[`${form.id}-${i.no}`] != null).length;
  const app1Rated     = form.items.filter((i) => firstRatings[`${form.id}-${i.no}`] != null).length;
  const assessorRated = form.items.filter((i) => assessorRatings[`${form.id}-${i.no}`] != null).length;

  const currentFormIndex = FORMS.findIndex((f) => f.id === activeForm);
  const nextForm = FORMS[currentFormIndex + 1] ?? null;
  const currentFormComplete = form.items.every((item) => assessorRatings[`${form.id}-${item.no}`] != null);

  const selfTotal     = selfRated > 0
    ? (form.items.reduce((s, i) => s + (selfRatings[`${form.id}-${i.no}`] ?? 0), 0) / selfRated).toFixed(2)
    : "—";
  const app1Total     = app1Rated > 0
    ? (form.items.reduce((s, i) => s + (firstRatings[`${form.id}-${i.no}`] ?? 0), 0) / app1Rated).toFixed(2)
    : "—";
  const assessorTotal = assessorRated > 0
    ? (form.items.reduce((s, i) => s + (assessorRatings[`${form.id}-${i.no}`] ?? 0), 0) / assessorRated).toFixed(2)
    : "—";

  // ── Average Summary (shown only on Form C) ───────────────────────────────────
  const formSummary = FORMS.map((f) => {
    const sRated  = f.items.filter((i) => selfRatings[`${f.id}-${i.no}`] != null).length;
    const a1Rated = f.items.filter((i) => firstRatings[`${f.id}-${i.no}`] != null).length;
    const asRated = f.items.filter((i) => assessorRatings[`${f.id}-${i.no}`] != null).length;

    const selfAvg = sRated > 0
      ? f.items.reduce((s, i) => s + (selfRatings[`${f.id}-${i.no}`] ?? 0), 0) / sRated
      : null;
    const app1Avg = a1Rated > 0
      ? f.items.reduce((s, i) => s + (firstRatings[`${f.id}-${i.no}`] ?? 0), 0) / a1Rated
      : null;
    const assessorAvg = asRated > 0
      ? f.items.reduce((s, i) => s + (assessorRatings[`${f.id}-${i.no}`] ?? 0), 0) / asRated
      : null;

    const vals = [selfAvg, showApp1 ? app1Avg : null, assessorAvg].filter((v): v is number => v != null);
    const combinedAvg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

    return { form: f, selfAvg, app1Avg, assessorAvg, combinedAvg };
  });

  // Grand average across all three forms (simple mean of form averages)
  const grandSelf = (() => {
    const valid = formSummary.filter((r) => r.selfAvg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.selfAvg!, 0) / valid.length : null;
  })();
  const grandApp1 = (() => {
    const valid = formSummary.filter((r) => r.app1Avg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.app1Avg!, 0) / valid.length : null;
  })();
  const grandAssessor = (() => {
    const valid = formSummary.filter((r) => r.assessorAvg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.assessorAvg!, 0) / valid.length : null;
  })();
  const grandCombined = (() => {
    const valid = formSummary.filter((r) => r.combinedAvg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.combinedAvg!, 0) / valid.length : null;
  })();
  const grandSkorFinal = (() => {
    const total = formSummary.reduce((sum, { form: f, combinedAvg }) => {
      if (combinedAvg != null) {
        return sum + ((combinedAvg / 5) * f.percentage);
      }
      return sum;
    }, 0);
    return total > 0 ? total : null;
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-[#1A284F]">Appraisal Form — Review</h3>
        {submitted && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Assessment Submitted
          </span>
        )}
      </div>

      {/* Form tabs */}
      <div className="flex border-b border-gray-200">
        {FORMS.map((f) => (
          <button key={f.id} onClick={() => setActiveForm(f.id as "A" | "B" | "C")}
            className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeForm === f.id ? "border-[#1A284F] text-[#1A284F]" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {f.tab} <span className="text-gray-400 font-normal">({f.percentage}%)</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between bg-[#1A284F] text-white px-5 py-3 rounded-lg">
        <span className="text-sm font-bold">{form.sectionTitle}</span>
        <span className="text-xs bg-[#C69A45] text-white px-3 py-1 rounded font-semibold">({form.percentage}%)</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-10">No</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">Kompetensi</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-52">Indikator Penilaian</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-56">
                  <div>Evaluasi Pribadi Karyawan</div>
                  <div className="flex justify-around mt-1 text-gray-400 font-normal text-xs">
                    {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                  </div>
                </th>
                {showApp1 && (
                  <th className="py-3 px-4 text-center font-semibold text-blue-700 border-r border-gray-200 w-56">
                    <div>Evaluasi Approver 1</div>
                    <div className="flex justify-around mt-1 text-blue-300 font-normal text-xs">
                      {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                    </div>
                  </th>
                )}
                <th className={`py-3 px-4 text-center font-semibold w-56 ${assessorColor === "indigo" ? "text-indigo-700" : "text-teal-700"}`}>
                  <div>{assessorLabel}</div>
                  <div className={`flex justify-around mt-1 font-normal text-xs ${assessorColor === "indigo" ? "text-indigo-300" : "text-teal-300"}`}>
                    {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {form.items.map((item) => {
                const selfVal     = selfRatings[`${form.id}-${item.no}`] ?? null;
                const app1Val     = firstRatings[`${form.id}-${item.no}`] ?? null;
                const assessorVal = assessorRatings[`${form.id}-${item.no}`] ?? null;
                return (
                  <tr key={item.no} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-gray-400 text-center border-r border-gray-100 align-middle">{item.no}</td>
                    <td className="py-3 px-4 border-r border-gray-100 align-middle">
                      {item.label && <span className="font-bold italic text-gray-800">{item.label} </span>}
                      <span className="text-xs text-gray-600">{item.description.slice(0, 90)}…</span>
                    </td>
                    {/* Indikator Penilaian button */}
                    <td className="py-3 px-4 text-center border-r border-gray-100 align-middle">
                      <button
                        onClick={() => setIndicatorItem(item)}
                        className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-[#1A284F] hover:text-[#1A284F] transition-colors text-gray-700 whitespace-nowrap"
                      >
                        Lihat Indikator Penilaian
                      </button>
                    </td>
                    {/* Self rating — detail hidden, only average shown in total row */}
                    <td className="py-3 px-4 border-r border-gray-100 align-middle text-center text-gray-300 text-xs">—</td>
                    {/* Approver 1 — detail hidden from Approver 2, only average shown in total row */}
                    {showApp1 && (
                      <td className="py-3 px-4 border-r border-gray-100 align-middle text-center text-gray-300 text-xs">—</td>
                    )}
                    {/* Assessor editable */}
                    <td className={`py-3 px-4 align-middle ${assessorColor === "indigo" ? "bg-indigo-50/20" : "bg-teal-50/20"}`}>
                      <div className="flex items-center justify-around">
                        {[1,2,3,4,5].map(n => submitted
                          ? <ReadOnlyScore key={n} value={n} active={assessorVal === n} color={assessorColor} />
                          : <EditableScore key={n} value={n} selected={assessorVal === n} color={assessorColor} onSelect={() => onRate(`${form.id}-${item.no}`, n)} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                <td colSpan={3} className="py-3 px-4 text-sm text-gray-800 border-r border-gray-200 text-right">
                  Rata-Rata <span className="text-xs text-gray-400 font-normal">(maks 5.00)</span>
                </td>
                <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                {showApp1 && <td className="py-3 px-4 text-center text-blue-600 border-r border-gray-100">{app1Total}</td>}
                <td className={`py-3 px-4 text-center ${assessorColor === "indigo" ? "text-indigo-600 bg-indigo-50/20" : "text-teal-600 bg-teal-50/20"}`}>{assessorTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Average Summary — only on Form C */}
      {activeForm === "C" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-[#1A284F] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">Appraisal Form Summary</span>
            <span className="text-xs bg-[#C69A45] text-white px-3 py-1 rounded font-semibold">Ringkasan Penilaian</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="py-3 px-5 text-left border-r border-gray-200 w-40">Form</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200">Bobot</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200">Evaluasi Pribadi Karyawan</th>
                  {showApp1 && <th className="py-3 px-5 text-center border-r border-gray-200 text-blue-600">Evaluasi Approver 1</th>}
                  <th className={`py-3 px-5 text-center border-r border-gray-200 ${assessorColor === "indigo" ? "text-indigo-600" : "text-teal-600"}`}>{assessorLabel}</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-amber-700 bg-amber-50/60">Aktual</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-purple-700 bg-purple-50/60">Konversi Nilai</th>
                  <th className="py-3 px-5 text-center text-green-700 bg-green-50/60">Skor Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {formSummary.map(({ form: f, selfAvg, app1Avg, assessorAvg, combinedAvg }) => (
                  <tr key={f.id} className="hover:bg-gray-50/40">
                    <td className="py-3 px-5 font-semibold text-gray-800 border-r border-gray-100">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#1A284F] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{f.id}</span>
                        {f.subtitle}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-center text-gray-500 border-r border-gray-100 font-medium">{f.percentage}%</td>
                    <td className="py-3 px-5 text-center text-[#1A284F] font-bold border-r border-gray-100">
                      {selfAvg != null ? selfAvg.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    {showApp1 && (
                      <td className="py-3 px-5 text-center text-blue-600 font-bold border-r border-gray-100">
                        {app1Avg != null ? app1Avg.toFixed(2) : <span className="text-gray-300">—</span>}
                      </td>
                    )}
                    <td className={`py-3 px-5 text-center font-bold border-r border-gray-100 ${assessorColor === "indigo" ? "text-indigo-600 bg-indigo-50/20" : "text-teal-600 bg-teal-50/20"}`}>
                      {assessorAvg != null ? assessorAvg.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-5 text-center font-bold border-r border-gray-200 text-amber-700 bg-amber-50/40">
                      {combinedAvg != null ? combinedAvg.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-5 text-center font-bold border-r border-gray-200 text-purple-700 bg-purple-50/40">
                      {combinedAvg != null ? `${((combinedAvg / 5) * 100).toFixed(2)}%` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-5 text-center font-bold text-green-700 bg-green-50/40">
                      {combinedAvg != null ? `${((combinedAvg / 5) * f.percentage).toFixed(2)}%` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {/* Grand average row */}
                <tr className="bg-[#1A284F]/5 border-t-2 border-[#1A284F]/20 font-bold">
                  <td className="py-3.5 px-5 text-sm text-[#1A284F] border-r border-gray-200" colSpan={2}>
                    Skor Pencapaian
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-[#1A284F] text-white text-sm font-black">
                      {grandSelf != null ? grandSelf.toFixed(2) : "—"}
                    </span>
                  </td>
                  {showApp1 && (
                    <td className="py-3.5 px-5 text-center border-r border-gray-100">
                      <span className="inline-block px-3 py-1 rounded-lg bg-blue-600 text-white text-sm font-black">
                        {grandApp1 != null ? grandApp1.toFixed(2) : "—"}
                      </span>
                    </td>
                  )}
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className={`inline-block px-3 py-1 rounded-lg text-white text-sm font-black ${assessorColor === "indigo" ? "bg-indigo-600" : "bg-teal-600"}`}>
                      {grandAssessor != null ? grandAssessor.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-200 bg-amber-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-amber-500 text-white text-sm font-black">
                      {grandCombined != null ? grandCombined.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-200 bg-purple-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-purple-600 text-white text-sm font-black">
                      {grandCombined != null ? `${((grandCombined / 5) * 100).toFixed(2)}%` : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center bg-green-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-green-600 text-white text-sm font-black">
                      {grandSkorFinal != null ? `${grandSkorFinal.toFixed(2)}%` : "—"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Next button — only visible when not submitted and there is a next form */}
      {!submitted && nextForm && (
        <div className="flex justify-end">
          <button
            onClick={() => setActiveForm(nextForm.id)}
            disabled={!currentFormComplete}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next: {nextForm.tab}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Managerial Skill Review ───────────────────────────────────────────────────

function ManagerialSkillReview({
  row, reviewerRole, assessorRatings, onRate, submitted,
  indicatorItem, setIndicatorItem,
}: {
  row: ApprovalRow;
  reviewerRole: ReviewerRole;
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  indicatorItem: FormItem | MSItem | null;
  setIndicatorItem: (item: FormItem | MSItem | null) => void;
}) {
  const selfRatings = loadMSSelfRatings(row.employeeId)?.ratings ?? {};
  const alias = workflowAlias(row.no);
  const record = alias && loadWorkflowRecords().find((item) => item.key === alias.key);
  const first = loadAssessment(row.no, "approver1");
  const rawFirst = first?.ratings ?? record?.assessments.approver1?.ratings ?? {};
  const firstRatings: Record<number, number> = Object.fromEntries(Object.entries(rawFirst).map(([key, value]) => [Number(key.replace("ms-", "")), value]));
  const showApp1 = reviewerRole === "approver2";
  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel = reviewerRole === "approver1" ? "Evaluasi Approver 1" : "Evaluasi Approver 2";

  const msCount = MS_ITEMS.length || 1;
  const PERCENTAGE = 20;
  const msW = PERCENTAGE / 100;
  const selfTotal     = ((MS_ITEMS.reduce((s, i) => s + (selfRatings[i.no] ?? 0), 0) / msCount) * msW).toFixed(2);
  const app1Total     = ((MS_ITEMS.reduce((s, i) => s + (firstRatings[i.no] ?? 0), 0) / msCount) * msW).toFixed(2);
  const msAssessorRated = MS_ITEMS.filter((i) => assessorRatings[`ms-${i.no}`] != null).length;
  const assessorTotal = msAssessorRated > 0
    ? ((MS_ITEMS.reduce((s, i) => s + (assessorRatings[`ms-${i.no}`] ?? 0), 0) / msCount) * msW).toFixed(2)
    : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-teal-600" />
        <h3 className="font-bold text-[#1A284F]">Managerial Skill — Review</h3>
        {submitted && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Assessment Submitted
          </span>
        )}
      </div>

      <div className="flex items-center justify-between bg-[#1A284F] text-white px-5 py-3 rounded-lg">
        <span className="text-sm font-bold">KOMPETENSI MANAJERIAL</span>
        <span className="text-xs bg-[#C69A45] text-white px-3 py-1 rounded font-semibold">Managerial Skill</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-10">No</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">Kompetensi Manajerial</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-52">Indikator Penilaian</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-56">
                  <div>Evaluasi Pribadi</div>
                  <div className="flex justify-around mt-1 text-gray-400 font-normal text-xs">
                    {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                  </div>
                </th>
                {showApp1 && (
                  <th className="py-3 px-4 text-center font-semibold text-blue-700 border-r border-gray-200 w-56">
                    <div>Evaluasi Approver 1</div>
                    <div className="flex justify-around mt-1 text-blue-300 font-normal text-xs">
                      {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                    </div>
                  </th>
                )}
                <th className={`py-3 px-4 text-center font-semibold w-56 ${assessorColor === "indigo" ? "text-indigo-700" : "text-teal-700"}`}>
                  <div>{assessorLabel}</div>
                  <div className={`flex justify-around mt-1 font-normal text-xs ${assessorColor === "indigo" ? "text-indigo-300" : "text-teal-300"}`}>
                    {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MS_ITEMS.map((item) => {
                const selfVal     = selfRatings[item.no] ?? null;
                const app1Val     = firstRatings[item.no] ?? null;
                const assessorVal = assessorRatings[`ms-${item.no}`] ?? null;
                return (
                  <tr key={item.no} className="hover:bg-gray-50/50">
                    <td className="py-3 px-4 text-gray-400 text-center border-r border-gray-100 align-middle">{item.no}</td>
                    <td className="py-3 px-4 border-r border-gray-100 align-middle">
                      <span className="font-bold italic text-gray-800">{item.label} </span>
                      <span className="text-xs text-gray-600">{item.description.slice(0, 90)}…</span>
                    </td>
                    {/* Indikator Penilaian button */}
                    <td className="py-3 px-4 text-center border-r border-gray-100 align-middle">
                      <button
                        onClick={() => setIndicatorItem(item)}
                        className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-[#1A284F] hover:text-[#1A284F] transition-colors text-gray-700 whitespace-nowrap"
                      >
                        Lihat Indikator Penilaian
                      </button>
                    </td>
                    {/* Self rating — detail hidden, only average shown in total row */}
                    <td className="py-3 px-4 border-r border-gray-100 align-middle text-center text-gray-300 text-xs">—</td>
                    {showApp1 && (
                      <td className="py-3 px-4 border-r border-gray-100 align-middle text-center text-gray-300 text-xs">—</td>
                    )}
                    <td className={`py-3 px-4 align-middle ${assessorColor === "indigo" ? "bg-indigo-50/20" : "bg-teal-50/20"}`}>
                      <div className="flex items-center justify-around">
                        {[1,2,3,4,5].map(n => submitted
                          ? <ReadOnlyScore key={n} value={n} active={assessorVal === n} color={assessorColor} />
                          : <EditableScore key={n} value={n} selected={assessorVal === n} color={assessorColor} onSelect={() => onRate(`ms-${item.no}`, n)} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                <td colSpan={3} className="py-3 px-4 text-sm text-gray-800 border-r border-gray-200 text-right">
                  Rata-Rata × {PERCENTAGE}% <span className="text-xs text-gray-400 font-normal">(maks {(5 * msW).toFixed(2)})</span>
                </td>
                <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                {showApp1 && <td className="py-3 px-4 text-center text-blue-600 border-r border-gray-100">{app1Total}</td>}
                <td className={`py-3 px-4 text-center ${assessorColor === "indigo" ? "text-indigo-600 bg-indigo-50/20" : "text-teal-600 bg-teal-50/20"}`}>{assessorTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Project Review ─────────────────────────────────────────────────────────────

const SAMPLE_PROJECTS = [
  { id: 1, name: "Implementasi Sistem Monitoring KPI Digital", scope: "Divisi", progress: 75, status: "on_track", deadline: "30/11/2026", output: "Dashboard KPI real-time terintegrasi" },
  { id: 2, name: "Pelatihan Kompetensi SDM Berbasis Digital", scope: "Departemen", progress: 40, status: "at_risk", deadline: "31/08/2026", output: "Modul pelatihan & laporan evaluasi" },
];
const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  on_track:  { label: "On Track",   color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  at_risk:   { label: "At Risk",    color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
};

function ProjectReview({ employeeId }: { employeeId?: string }) {
  const { rows: excelRows, fileName } = loadIcfProjectRows(employeeId);
  const maxFinalScore = excelRows.length ? Math.max(...excelRows.map((r) => r.finalScore)) : null;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <FolderKanban className="w-4 h-4 text-purple-600" />
        <h3 className="font-bold text-[#1A284F]">Project Outside Job Scope (Upload Excel HR ICF) — 2026</h3>
        <span className="text-xs text-gray-500 ml-auto">
          {fileName} · Skor Tertinggi: <strong>{maxFinalScore ?? "—"}%</strong>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[950px] border-collapse text-xs">
          <thead className="bg-[#1A284F] text-white">
            <tr>
              {PROJECT_EXCEL_HEADERS.map((h) => (
                <th key={h} className="border border-[#1A284F]/30 px-3 py-2.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {excelRows.map((row, idx) => {
              const isHighest = maxFinalScore !== null && row.finalScore === maxFinalScore;
              return (
                <tr key={idx} className={isHighest ? "bg-emerald-50/50" : "hover:bg-gray-50"}>
                  <td className="border border-gray-200 px-3 py-2 text-center font-semibold">{row.no}</td>
                  <td className="border border-gray-200 px-3 py-2">{row.projectScope}</td>
                  <td className="border border-gray-200 px-3 py-2">{row.roleProject}</td>
                  <td className="border border-gray-200 px-3 py-2 font-semibold">{row.projectTitle}</td>
                  <td className="border border-gray-200 px-3 py-2">{row.projectDetail}</td>
                  <td className="border border-gray-200 px-3 py-2">{row.startDate}</td>
                  <td className="border border-gray-200 px-3 py-2">{row.finishDate}</td>
                  <td className="border border-gray-200 px-3 py-2 font-semibold text-blue-700">{row.progressStatus}</td>
                  <td className="border border-gray-200 px-3 py-2 font-bold text-[#1A284F]">
                    {row.finalScore}% {isHighest && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">Tertinggi</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Type badge config ─────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { color: string; icon: React.ReactNode }> = {
  "KPI":             { color: "bg-blue-50 text-blue-700 border-blue-200",      icon: <TrendingUp className="w-3.5 h-3.5" /> },
  "SMART Goals":     { color: "bg-amber-50 text-amber-700 border-amber-200",    icon: <Lightbulb className="w-3.5 h-3.5" /> },
  "Appraisal Form":  { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <ClipboardList className="w-3.5 h-3.5" /> },
  "Project":         { color: "bg-purple-50 text-purple-700 border-purple-200", icon: <FolderKanban className="w-3.5 h-3.5" /> },
  "Managerial Skill":{ color: "bg-teal-50 text-teal-700 border-teal-200",       icon: <Layers className="w-3.5 h-3.5" /> },
};

const needsAssessment = (type: string) => type === "Appraisal Form" || type === "Managerial Skill";

// ─── Main Component ────────────────────────────────────────────────────────────

export function ReviewDrawer(props: Props) {
  return props.row.type === "Inter-Department Feedback" ? <FeedbackApprovalDrawer {...props} /> : <StandardReviewDrawer {...props} />;
}

function StandardReviewDrawer({ row, reviewerRole, onClose, onApprove, onRevision, onAssessed, readOnly }: Props) {
  const { t } = useLanguage();
  const isFullyAssessed = row.status === "Assessed-Approver 2";

  const [step, setStep]                     = useState<"review" | "revision">("review");
  const [revisionNote, setRevisionNote]     = useState("");
  const [assessorRatings, setAssessorRatings] = useState<Record<string, number>>(() => {
    // Always try stored assessment first (covers History views for both A1 and A2)
    const stored = loadAssessment(row.no, reviewerRole);
    if (stored && Object.keys(stored.ratings).length > 0) return stored.ratings;
    // Fallback hardcoded data for Assessed-Approver 2 (when no stored data exists yet)
    if (isFullyAssessed) {
      if (row.type === "Managerial Skill") return Object.fromEntries(MS_ITEMS.map((i) => [`ms-${i.no}`, APPROVER2_MS[i.no]]));
      if (row.type === "Appraisal Form")   return { ...APPROVER2_APPRAISAL };
      if (row.type === "SMART Goals")      return Object.fromEntries(SAMPLE_GOALS.slice(0, 3).map((g) => [`sg-${g.id}`, APPROVER2_SG_RATINGS_FALLBACK[g.id] ?? 0]));
    }
    return {};
  });
  const [smartComments, setSmartComments]   = useState<Record<number, string>>(() => {
    const stored = loadAssessment(row.no, reviewerRole);
    if (stored?.comments && Object.keys(stored.comments).length > 0) {
      return Object.fromEntries(Object.entries(stored.comments).map(([k, v]) => [Number(k), v]));
    }
    if (isFullyAssessed && row.type === "SMART Goals") return { 0: APPROVER2_SG_COMMENT_FALLBACK };
    return {};
  });
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(() => {
    if (isFullyAssessed) return true;
    // Mark as submitted when viewing History (readOnly) and stored data exists
    if (readOnly) {
      const stored = loadAssessment(row.no, reviewerRole);
      return stored != null && Object.keys(stored.ratings).length > 0;
    }
    return false;
  });
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRevisionConfirm, setShowRevisionConfirm] = useState(false);
  const [indicatorItem, setIndicatorItem]   = useState<FormItem | MSItem | null>(null);
  const [activeForm, setActiveForm]         = useState<"A" | "B" | "C">("A");

  const hasAssessment = needsAssessment(row.type);
  const isFourStepType = row.type === "KPI" || row.type === "SMART Goals" || row.type === "RCA";
  const isCheckerStage = isFourStepType && row.workflowStageForRow === "checker";
  const isValidatorStage = isFourStepType && row.workflowStageForRow === "validator";
  const primaryApproveLabel = isCheckerStage
    ? "Tandai Checked"
    : isValidatorStage
    ? "Validate"
    : "Approve";
  const effectiveReadOnly =
    readOnly ||
    isFullyAssessed ||
    row.status === "Validated" ||
    row.status === "Checked" ||
    row.status === "Pending-Approver 1" ||
    row.status === "Pending-Approver 2" ||
    row.status === "Pending-Validate";
  const badge = TYPE_BADGE[row.type] ?? { color: "bg-gray-50 text-gray-600 border-gray-200", icon: <ClipboardList className="w-3.5 h-3.5" /> };

  const handleRate = (key: string, val: number) => setAssessorRatings((prev) => ({ ...prev, [key]: val }));

  const ownerGoalsForCheck =
    row.type === "SMART Goals"
      ? loadSubmittedGoals(row.employeeId) ?? SAMPLE_GOALS
      : [];
  const isApproverCommentFilled = Boolean((smartComments[0] ?? "").trim());

  // Check if all required items are filled across ALL forms
  const allFilled = (() => {
    if (isCheckerStage || isValidatorStage) return true;
    if (row.type === "SMART Goals") {
      return (
        ownerGoalsForCheck.every((g) => assessorRatings[`sg-${g.id}`] != null) &&
        isApproverCommentFilled
      );
    }
    if (!hasAssessment) return isApproverCommentFilled;
    if (row.type === "Managerial Skill") {
      return MS_ITEMS.every((item) => assessorRatings[`ms-${item.no}`] != null) && isApproverCommentFilled;
    }
    // Appraisal Form: all three forms (A, B, C) must be fully assessed
    return (
      FORMS.every((f) =>
      f.items.every((item) => assessorRatings[`${f.id}-${item.no}`] != null)
      ) && isApproverCommentFilled
    );
  })();

  // Per-form completion for hint text
  const formCompletion = FORMS.reduce<Record<string, boolean>>((acc, f) => {
    acc[f.id] = f.items.every((item) => assessorRatings[`${f.id}-${item.no}`] != null);
    return acc;
  }, {});



  const renderContent = () => {
    const sharedProps = {
      row,
      reviewerRole,
      assessorRatings,
      onRate: handleRate,
      submitted: assessmentSubmitted || effectiveReadOnly,
      indicatorItem,
      setIndicatorItem,
      activeForm,
      setActiveForm,
    };
    if (row.type === "KPI")             return <KPIReview row={row} reviewerRole={reviewerRole} readOnly={effectiveReadOnly} />;
    if (row.type === "SMART Goals")     return (
      <SmartGoalsApproverReview
        assessorRatings={assessorRatings}
        onRate={handleRate}
        submitted={assessmentSubmitted || effectiveReadOnly}
        reviewerRole={reviewerRole}
        comments={smartComments}
        onComment={(id, text) => { if (!effectiveReadOnly) setSmartComments((prev) => ({ ...prev, [id]: text })); }}
        employeeId={row.employeeId}
        rowNo={row.no}
        position={row.position}
      />
    );
    if (row.type === "Project")          return <ProjectReview employeeId={row.employeeId} />;
    if (row.type === "Appraisal Form")   return <AppraisalFormReview {...sharedProps} />;
    if (row.type === "Managerial Skill") return <ManagerialSkillReview {...sharedProps} />;
    if (row.type === "RCA")              return <RCAReviewPreview employeeId={row.employeeId} />;
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-gray-400">
        <ClipboardList className="w-12 h-12" />
        <p className="text-sm">Preview not available for <span className="font-semibold text-gray-600">{row.type}</span>.</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Top bar ───────────────────────────────────���─────────────────────── */}
      <div className="flex items-center gap-6 px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${badge.color}`}>
            {badge.icon} {row.type}
          </span>
          {isFullyAssessed ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              <CheckCircle2 className="w-3.5 h-3.5" /> Assessed
            </span>
          ) : effectiveReadOnly ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              <Eye className="w-3.5 h-3.5" /> Read Only
            </span>
          ) : (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              Pending Review
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-sm text-gray-700">
          <User className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="font-semibold">{row.name}</span>
          <span className="text-gray-400">({row.employeeId})</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
          <span>{row.position} · {row.department} · {row.division}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <span>Submitted: {row.submittedDate}</span>
        </div>

        <div className="ml-auto shrink-0">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
            reviewerRole === "approver1"
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-purple-50 text-purple-700 border-purple-200"
          }`}>
            {reviewerRole === "approver1" ? "Approver 1 (Supervisor)" : "Approver 2 (HR Admin)"}
          </span>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {step === "review" ? (
          <div className="px-8 py-8 space-y-6">
            {renderContent()}

            {/* Mandatory Komentar & Catatan Approver untuk modul selain SMART Goals */}
            {row.type !== "SMART Goals" && (
              <div className="border border-indigo-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                <div className="px-4 py-2.5 flex items-center gap-2 bg-indigo-50">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-700">
                    Komentar &amp; Catatan Approver <span className="text-rose-500">* (Wajib Diisi)</span>
                  </span>
                </div>
                <div className="p-4">
                  {effectiveReadOnly || assessmentSubmitted ? (
                    <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-indigo-50/40 border-indigo-100 text-indigo-900">
                      {smartComments[0] || <span className="text-gray-400 italic">Tidak ada komentar.</span>}
                    </p>
                  ) : (
                    <textarea
                      rows={3}
                      value={smartComments[0] ?? ""}
                      onChange={(e) => setSmartComments((prev) => ({ ...prev, 0: e.target.value }))}
                      placeholder={`Wajib diisi: tuliskan komentar atau catatan review untuk ${row.type} ini sebelum melakukan Submit / Approve...`}
                      className="w-full text-xs border-2 border-indigo-100 focus:border-indigo-400 rounded-xl px-3.5 py-2.5 outline-none resize-none text-gray-700"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-8 py-8 flex flex-col gap-5">
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-4">
              <RotateCcw className="w-5 h-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-orange-800">Request Revision</p>
                <p className="text-xs text-orange-700 mt-0.5">{row.type} · {row.name}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-bold text-gray-700">
                Revision Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
                placeholder="Describe what needs to be revised and why…"
                rows={8}
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none resize-none focus:border-orange-400 bg-gray-50 focus:bg-white transition-colors"
              />
              <p className="text-xs text-gray-400">This note will be sent to the employee as feedback for revision.</p>
            </div>
            <button onClick={() => setStep("review")} className="text-sm text-gray-500 hover:text-gray-700 self-start flex items-center gap-1">
              ← Back to review
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-gray-200 px-8 py-4 bg-white">
        {step === "review" ? (
          <div className="flex items-center justify-between gap-4">
            {/* Left: context hint */}
            <div className="text-sm text-gray-400">
              {effectiveReadOnly || row.status === "Approved" || row.status === "Assessed-Approver 1" ? (
                <span className="text-gray-600 font-medium flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-600" /> {isFullyAssessed ? "Assessment sudah lengkap dari semua approver — hanya bisa dilihat." : "Viewing in read-only mode — this record has already been processed."}</span>
              ) : hasAssessment && !allFilled ? (
                <span>
                  {row.type === "SMART Goals"
                    ? "Isi semua aspek penilaian (0–100%) untuk setiap goal agar Submit tersedia."
                    : row.type === "Appraisal Form"
                    ? <>
                        Complete all scores in{" "}
                        {FORMS.filter((f) => !formCompletion[f.id]).map((f) => (
                          <span key={f.id} className="font-semibold text-gray-600">{f.tab}</span>
                        )).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}
                        {" "}to enable Submit.
                      </>
                    : <>Fill in all scores in the <span className="font-semibold text-gray-600">{reviewerRole === "approver1" ? "Evaluasi Approver 1" : "Evaluasi Approver 2"}</span> column to enable Submit.</>
                  }
                </span>
              ) : !hasAssessment ? (
                <span>Review the submitted data, then approve or request revision.</span>
              ) : null}
            </div>

            {/* Right: action buttons */}
            {!effectiveReadOnly && row.status !== "Approved" && row.status !== "Validated" && row.status !== "Assessed-Approver 1" && (
              <div className="flex items-center gap-3">
                {/* Appraisal Form / Managerial Skill — only Submit Assessment, no Approve/Revision */}
                {hasAssessment && (
                  <button
                    disabled={!allFilled}
                    onClick={() => setShowSubmitConfirm(true)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    Submit Assessment
                  </button>
                )}

                {/* Approve / Revision only for non-assessment types (KPI, SMART Goals, Project) */}
                {!hasAssessment && (
                  <>
                    <button
                      onClick={() => setStep("revision")}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-orange-400 text-orange-600 text-sm font-semibold hover:bg-orange-50 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Request Revision
                    </button>
                    <button
                      onClick={() => setShowApproveConfirm(true)}
                      disabled={!allFilled}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" />
                      {primaryApproveLabel}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => setStep("review")} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              disabled={!revisionNote.trim()}
              onClick={() => setShowRevisionConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              Send Revision Request
            </button>
          </div>
        )}
      </div>

      {/* ── Indicator Modal ──────────────────────────────────────────────────── */}
      {indicatorItem && (
        <IndicatorModal item={indicatorItem} onClose={() => setIndicatorItem(null)} />
      )}

      {/* ── Approve Confirm Modal ────────────────────────────────────────────── */}
      {showApproveConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative">
            <button
              onClick={() => setShowApproveConfirm(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2 text-center">
              {isCheckerStage ? "Konfirmasi Tandai Checked" : isValidatorStage ? "Konfirmasi Validasi (Validate)" : "Confirm Approval"}
            </h3>
            <p className="text-sm text-gray-600 mb-1 text-center">
              {isCheckerStage ? "Tandai Checked pengajuan" : isValidatorStage ? "Validasi pengajuan" : "Approve"}{" "}
              <span className="font-semibold text-gray-800">{row.type}</span> submission by
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-6 text-center">{row.name} ({row.employeeId})</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowApproveConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowApproveConfirm(false);
                  // Save assessment data for SMART Goals (uses Approve path, not Submit)
                  if (row.type === "SMART Goals" && !isCheckerStage && !isValidatorStage) {
                    const commentsToSave = Object.fromEntries(Object.entries(smartComments).map(([k, v]) => [k, v]));
                    saveAssessment(row.no, reviewerRole, row.type, assessorRatings, commentsToSave, formatTodayDDMMYYYY());
                  }
                  onApprove();
                }}
                className="flex-1 py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                {isCheckerStage ? "Ya, Tandai Checked" : isValidatorStage ? "Ya, Validate" : "Confirm Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Assessment Confirm Modal ──────────────────────────────────── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative">
            <button
              onClick={() => setShowSubmitConfirm(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <h3 className="text-base font-bold text-gray-900 mb-2">Action Confirmation</h3>
            <p className="text-sm text-gray-600 mb-8">
              Are you sure you want to submit your assessment for{" "}
              <span className="font-semibold text-gray-800">{row.type}</span>?
              This action cannot be undone.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowSubmitConfirm(false);
                  // Save assessment for Appraisal Form and Managerial Skill (use Submit path)
                  const commentsToSave: Record<string, string> = Object.fromEntries(
                    Object.entries(smartComments).map(([k, v]) => [k, v]),
                  );
                  saveAssessment(row.no, reviewerRole, row.type, assessorRatings, commentsToSave, formatTodayDDMMYYYY());
                  onAssessed();
                }}
                className="flex-1 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Revision Confirm Modal ───────────────────────────────────────────── */}
      {showRevisionConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-orange-50 mx-auto mb-4">
              <RotateCcw className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Konfirmasi Permintaan Revisi</h3>
            <p className="text-sm text-gray-600 mb-6">
              Kirim permintaan revisi untuk pengajuan <strong>{row.type}</strong> milik <strong>{row.name}</strong> ({row.employeeId})?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRevisionConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowRevisionConfirm(false);
                  onRevision(revisionNote);
                }}
                className="flex-1 py-2.5 rounded-full bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
              >
                Ya, Kirim Revisi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import { loadIcfProjectRows } from "../store/projectStore";
import { PROJECT_EXCEL_HEADERS } from "../utils/projectExcelUtils";
