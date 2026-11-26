// @refresh reset
import { loadAppraisalSelf } from "../pages/shared/appraisalFormStore";
import { SmartGoalsProgressCard } from "./SmartGoalsProgressCard";
import { loadMSSelfRatings, loadAllMSApprovers } from "../pages/shared/msStore";
import { getKpiMonthStatuses, normalizeEmployeeId, workflowAlias, loadWorkflowRecords } from "../pages/shared/appraisalWorkflowStore";
import { ApproverNotesHistory } from "./ApproverNotesHistory";
import React, { useState } from "react";
import { useLanguage } from "../context/LangContext";
import {
  X, Check, RotateCcw, CheckCircle2, TrendingUp,
  ClipboardList, FolderKanban, Lightbulb, AlertTriangle,
  User, Building2, Calendar, Layers, Send, Paperclip, Download, Eye, MessageSquare, ChevronRight,
  FileText, ChevronDown, ChevronUp, Target,
} from "lucide-react";
import { FORMS, loadMasterAppraisalForms, type FormItem } from "../pages/employee/AppraisalForm";
import { KPI_ITEMS, loadKPITracking, resolveEmployeeTrackingKpiItems, type KPIItem, type MonthEntry } from "../pages/employee/KPIPage";
import { SAMPLE_GOALS, ROWS } from "../pages/employee/SMARTGoals";
import {
  computeSmartGoalApproverScoreBounds,
  loadCheckInEntries,
  loadSubmittedGoals,
  saveGoalEvidenceInappropriateFlag,
  type StoredCheckInEntry,
  type StoredSmartGoalEvidenceFile,
} from "../pages/shared/smartGoalsStore";
import { fetchEmployeeKpiSettingsLive, fetchEmployeeKpiTrackingLive, fetchEmployeeSmartGoalsLive } from "../services/supabaseClient";
import { loadKPIComments, loadKPICommentsForEmployee, saveKPIComment } from "../pages/shared/kpiCommentsStore";
import { loadEvidenceFiles, type StoredEvidenceFile } from "../pages/shared/kpiEvidenceStore";
import { saveAssessment, loadAssessment, loadSGAssessment } from "../pages/shared/approvalsStore";
import { loadRCASubmissions, type StoredRCASubmission } from "../pages/shared/rcaStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../utils/dateFormat";
import { MS_ITEMS, loadMasterMSItems, type MSItem } from "../pages/supervisor/ManagerialSkillCheckIn";
import { KPITableView } from "./KPITableView";
import { UnifiedRCADetailTable } from "./UnifiedRCADetailTable";
import { FeedbackApprovalDrawer } from "./FeedbackApprovalDrawer";
import { getLatestEditedCellsDiffForEmployee } from "../store/kpiTrackingEditStore";
import {
  getActiveUser,
  isAdminOrHrIcfRole,
  loadManagedUsers,
  resolveEffectiveUserGrouping,
  resolveUniqueUserByApproverRef,
  type ManagedUser,
  type WorkflowStageRole,
} from "../store/authStore";
import { loadUnitScoreWeights, resolveEmployeeModuleWeightPercent, weightColumnFromGrouping } from "../pages/shared/scoringWeightStore";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalRow {
  no: string;
  employeeId: string;
  name: string;
  position: string;
  department: string;
  division: string;
  bagian?: string;
  companyUnit: string;
  type: string;
  submittedDate: string;
  approvalDate: string;
  status: string;
  reviewerRoleForRow?: ReviewerRole;
  workflowStageForRow?: "checker" | "approver1" | "approver2" | "validator";
  globalHistoryOnly?: boolean;
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
  onApprove: (note?: string) => void;
  onRevision: (note: string) => void;
  onAssessed: (note?: string) => void;
  readOnly?: boolean;
}

function resolveUserByRef(allUsers: ManagedUser[], refValue?: string): ManagedUser | undefined {
  return resolveUniqueUserByApproverRef(allUsers, refValue);
}

// ─── RCA Review Preview ────────────────────────────────────────────────────────

type RCAStatus = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Ditunda" | "Dibatalkan";

interface RCAAp {
  action: string; targetDate: string; pic: string;
  status: RCAStatus; keterangan: string[]; output: string[]; evidence: string[];
}
interface RCABlk {
  masalahUtama: string; kenapaA: string; kenapaB: string; kenapaC: string;
  actionPlans: RCAAp[];
}
interface RCAItem {
  no: number; periode: string; kpi: string; satuan: string; baseline: string;
  target: string; actual: string;
  blocks: RCABlk[];
}

const STATUS_STYLE: Record<RCAStatus, string> = {
  "Belum dilaksanakan": "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai": "bg-green-50 text-green-700",
  "Ditunda": "bg-purple-50 text-purple-700",
  "Dibatalkan": "bg-red-100 text-red-700",
};

function parseReviewMasalah(masalahUtama: string) {
  const isInternal = masalahUtama.startsWith("[Faktor Internal]");
  const isEksternal = masalahUtama.startsWith("[Faktor Eksternal]");
  const hasFactor = isInternal || isEksternal;
  const bodyText = hasFactor ? masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : masalahUtama;
  const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
  return { isInternal, bodyText, factorLabel };
}

function parseReviewEvidence(raw: string): { name: string; url?: string } {
  const str = String(raw ?? "");
  const sep = str.indexOf("||");
  if (sep >= 0) return { name: str.slice(0, sep) || "file", url: str.slice(sep + 2) || undefined };
  return { name: str };
}

function RCAReviewPreview({ employeeId }: { employeeId: string }) {
  // Hanya RCA yang sudah diajukan (bukan Draft) pada bulan yang disubmit bersama KPI Tracking
  const rcaWf = loadWorkflowRecords().find(
    (r) => r.module === "RCA" && r.phase === "measurement" && normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(employeeId),
  );
  const activeMonths = rcaWf?.submittedMonths ?? [];
  const storedSubs = loadRCASubmissions(employeeId).filter(
    (sub) => sub.approvalStatus !== "Draft" && (activeMonths.length === 0 || activeMonths.includes(sub.monthLabel)),
  );
  const data: RCAItem[] = storedSubs.map((sub, idx) => {
    const rawBlocks =
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
    return {
      no: idx + 1,
      periode: sub.periode || "—",
      kpi: sub.kpiIndicator || "—",
      satuan: sub.satuan || "—",
      baseline: sub.baseline || "—",
      target: sub.targetMonthly || "—",
      actual: sub.actual || "—",
      blocks: rawBlocks.map((blk) => ({
        masalahUtama: blk.masalahUtama || "—",
        kenapaA: blk.kenapaA || "—",
        kenapaB: blk.kenapaB || "—",
        kenapaC: blk.kenapaC || "—",
        actionPlans: (blk.actionPlans ?? []).map((ap) => ({
          action: ap.action || "—",
          targetDate: normalizeDateDDMMYYYY(ap.targetDate),
          pic: ap.pic || "—",
          status: (["Belum dilaksanakan", "Sedang dilaksanakan", "Selesai", "Ditunda", "Dibatalkan"].includes(ap.status)
            ? ap.status
            : "Belum dilaksanakan") as RCAStatus,
          keterangan: Array.isArray(ap.keterangan) ? ap.keterangan : [],
          output: Array.isArray(ap.output) ? ap.output : [],
          evidence: Array.isArray(ap.evidence) ? ap.evidence : [],
        })),
      })),
    };
  });

  const th = "border border-[#1A284F]/30 py-3 px-3 text-center font-semibold text-xs whitespace-nowrap";
  const headers: [string, number][] = [
    ["No",42],["Periode",72],["KPI",160],["Satuan",90],["Baseline",90],["Target",80],["Actual",80],
    ["Masalah Utama (A)",180],["Kenapa A? (B)",150],["Kenapa B? (C)",150],["Kenapa C? (D)",150],
    ["Action Plan",180],["Target Penyelesaian",120],["PIC",120],["Status Perbaikan",130],
    ["Keterangan",160],["Output",160],["Evidence",160],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <FileText className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <span>
          Tabel berikut menampilkan <strong>Root Cause Analysis (RCA)</strong> yang disubmit karyawan bersama KPI Tracking{activeMonths.length ? ` bulan ${activeMonths.join(", ")}` : ""}.
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
            {data.flatMap((item) => {
              const totalItemRows = item.blocks.reduce((acc, b) => acc + Math.max(1, b.actionPlans.length), 0);
              const tdBase = "border border-gray-200 align-top py-2 px-3 bg-white text-gray-700";
              const tdAP   = "border border-gray-200 align-top py-2 px-3 bg-blue-50/20 text-gray-700";
              return item.blocks.flatMap((block, bi) => {
                const { isInternal, bodyText, factorLabel } = parseReviewMasalah(block.masalahUtama);
                const aps = block.actionPlans.length > 0 ? block.actionPlans : [null];
                const blockRows = aps.length;
                return aps.map((ap, ai) => (
                  <tr key={`${item.no}_${bi}_${ai}`} className="border-t border-gray-200">
                    {bi === 0 && ai === 0 && (
                      <>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-center font-semibold text-gray-600`}>{item.no}</td>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-center`}>
                          <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode}</span>
                        </td>
                        <td rowSpan={totalItemRows} className={`${tdBase} font-medium text-gray-800`}>{item.kpi}</td>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-gray-600`}>{item.satuan}</td>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-gray-500 italic`}>{item.baseline}</td>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-center font-bold text-[#1A284F]`}>{item.target}</td>
                        <td rowSpan={totalItemRows} className={`${tdBase} text-center font-bold text-gray-800`}>{item.actual}</td>
                      </>
                    )}
                    {ai === 0 && (
                      <>
                        <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>
                          {factorLabel && (
                            <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${isInternal ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                              {factorLabel}
                            </span>
                          )}
                          <p>{bodyText || "—"}</p>
                        </td>
                        <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaA}</td>
                        <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaB}</td>
                        <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaC}</td>
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
                              {ap.evidence.map((ev, ei) => {
                                const parsed = parseReviewEvidence(ev);
                                return parsed.url ? (
                                  <a key={ei} href={parsed.url} target="_blank" rel="noreferrer" download={parsed.name} className="flex items-center gap-1 text-[10px] text-green-700 font-medium hover:underline">
                                    <FileText className="w-3 h-3 shrink-0 text-green-600" />{parsed.name}
                                  </a>
                                ) : (
                                  <span key={ei} className="flex items-center gap-1 text-[10px] text-green-700 font-medium">
                                    <FileText className="w-3 h-3 shrink-0 text-green-600" />{parsed.name}
                                  </span>
                                );
                              })}
                            </div>
                          ) : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className={`${tdAP} text-center text-gray-300`}>Belum ada action plan</td>
                    )}
                  </tr>
                ));
              });
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

function formatEvidenceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function KPIReview({ row }: { row: ApprovalRow }) {
  const [kpiItems, setKpiItems] = useState<KPIItem[]>(() => resolveEmployeeTrackingKpiItems(row.employeeId));
  const [trackingSnap, setTrackingSnap] = useState<{ months: MonthEntry[]; cellsMap: Record<string, Record<string, string>> }>(
    () => loadKPITracking(row.employeeId),
  );
  const [evidenceFiles, setEvidenceFiles] = useState<StoredEvidenceFile[]>(() => loadEvidenceFiles(row.employeeId));
  const [rcaSubmissions, setRcaSubmissions] = useState<StoredRCASubmission[]>(() => loadRCASubmissions(row.employeeId));
  const [highlightedRcaMonth, setHighlightedRcaMonth] = useState<string | null>(null);
  const [showRcaTable, setShowRcaTable] = useState<boolean>(true);
  const [previewEvFile, setPreviewEvFile] = useState<StoredEvidenceFile | null>(null);
  const [validatedEvHistoryOpen, setValidatedEvHistoryOpen] = useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;
    const refreshLocal = () => {
      if (cancelled) return;
      setKpiItems(resolveEmployeeTrackingKpiItems(row.employeeId));
      setTrackingSnap(loadKPITracking(row.employeeId));
      setEvidenceFiles(loadEvidenceFiles(row.employeeId));
      setRcaSubmissions(loadRCASubmissions(row.employeeId));
    };
    refreshLocal();
    void Promise.all([
      fetchEmployeeKpiSettingsLive(row.employeeId),
      fetchEmployeeKpiTrackingLive<MonthEntry>(row.employeeId),
    ]).then(([remoteSettings, remoteTracking]) => {
      if (cancelled) return;
      if (remoteSettings.length > 0) {
        setKpiItems(resolveEmployeeTrackingKpiItems(row.employeeId));
      }
      if (remoteTracking) {
        setTrackingSnap(remoteTracking);
      } else {
        setTrackingSnap(loadKPITracking(row.employeeId));
      }
    });
    window.addEventListener("pa-db-hydrated", refreshLocal);
    window.addEventListener("appraisal-updated", refreshLocal);
    window.addEventListener("storage", refreshLocal);
    return () => {
      cancelled = true;
      window.removeEventListener("pa-db-hydrated", refreshLocal);
      window.removeEventListener("appraisal-updated", refreshLocal);
      window.removeEventListener("storage", refreshLocal);
    };
  }, [row.employeeId]);

  const ownerMonths = trackingSnap.months;
  const ownerCellsMap = trackingSnap.cellsMap;
  const validatedMonthSet = React.useMemo(
    () => new Set(getKpiMonthStatuses(row.employeeId).filter((m) => m.state === "validated").map((m) => m.label)),
    [row.employeeId, trackingSnap],
  );
  const currentSubmissionEvidenceFiles = React.useMemo(
    () => evidenceFiles.filter((f) => !validatedMonthSet.has(f.month)),
    [evidenceFiles, validatedMonthSet],
  );
  const validatedHistoryEvidenceFiles = React.useMemo(
    () => evidenceFiles.filter((f) => validatedMonthSet.has(f.month)),
    [evidenceFiles, validatedMonthSet],
  );
  const editedCellsDiff = React.useMemo(() => {
    const normId = normalizeEmployeeId(row.employeeId);
    const wf = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "KPI" &&
        r.phase === "measurement" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === row.employeeId.toLowerCase()),
    );
    return wf?.editedCellsDiff ?? getLatestEditedCellsDiffForEmployee(row.employeeId);
  }, [row.employeeId, trackingSnap]);

  const handleClickRcaTag = (sub: StoredRCASubmission) => {
    setShowRcaTable(true);
    const targetMonth = sub.monthLabel || sub.periode || "";
    setHighlightedRcaMonth(targetMonth);
    window.setTimeout(() => {
      const rowEl = document.querySelector(`[data-rca-row-key="${CSS.escape(sub.key)}"]`);
      const bannerEl = rowEl?.closest("tbody")?.querySelector(`[data-rca-month-group]`);
      const containerEl = document.getElementById("approver-unified-rca-table");
      (rowEl ?? bannerEl ?? containerEl)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    window.setTimeout(() => {
      setHighlightedRcaMonth((curr) => (curr === targetMonth ? null : curr));
    }, 5000);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h3 className="font-bold text-[#1A284F]">KPI Tracking — 2026</h3>
        <span className="ml-auto text-xs font-medium text-gray-500">
          Bulan Disubmit:{" "}
          <strong className="text-[#1A284F]">
            {ownerMonths.length > 0 ? ownerMonths.map((m) => m.label).join(", ") : "Belum ada bulan"}
          </strong>
        </span>
      </div>

      {kpiItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 py-10 px-4 text-center text-xs text-gray-500">
          Karyawan ini belum memiliki data KPI yang dibuat pada KPI Setting.
        </div>
      ) : (
        <KPITableView
          kpiItems={kpiItems}
          months={ownerMonths}
          cells={ownerCellsMap}
          rcaSubmissions={rcaSubmissions}
          onPreviewRCA={handleClickRcaTag}
          editedCellsDiff={editedCellsDiff}
        />
      )}

      {/* ── Unified RCA Table (semua bulan termasuk bulan-bulan sebelumnya dalam 1 tabel) ── */}
      {rcaSubmissions.length > 0 && showRcaTable && (
        <UnifiedRCADetailTable
          containerId="approver-unified-rca-table"
          submissions={rcaSubmissions}
          highlightedMonth={highlightedRcaMonth}
          title="Root Cause Analysis (RCA) — Semua Bulan (Riwayat & Bulan Berjalan)"
          subtitle="Menampilkan pembaruan terakhir dari karyawan untuk bulan berjalan maupun bulan-bulan sebelumnya. Baris berstatus Close ditandai hijau lembut."
        />
      )}

      {/* ── Evidence Documents Section (Bulan Pengajuan Saat Ini) ─────────────── */}
      <div className="border-t border-gray-200 pt-5 flex flex-col gap-3 mt-2">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-[#1A284F]" />
          <h4 className="font-bold text-[#1A284F] text-sm">Evidence Documents (Bulan Pengajuan)</h4>
          {currentSubmissionEvidenceFiles.length > 0 && (
            <span className="ml-auto text-xs bg-blue-50 text-[#1A284F] border border-[#1A284F]/20 px-2 py-0.5 rounded-full font-semibold">
              {currentSubmissionEvidenceFiles.length} file{currentSubmissionEvidenceFiles.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {currentSubmissionEvidenceFiles.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-5 flex flex-col items-center gap-1">
            <Paperclip className="w-6 h-6 text-gray-300 mb-1" />
            <p className="text-xs text-gray-400 italic">
              {validatedHistoryEvidenceFiles.length > 0
                ? "Tidak ada lampiran bulan baru (dokumen bulan yang sudah Full Approved tersimpan di History Evidence Document di bawah)."
                : "Belum ada dokumen evidence yang diupload karyawan."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Group by month */}
            {Array.from(new Set(currentSubmissionEvidenceFiles.map((f) => f.month))).map((month) => {
              const monthFiles = currentSubmissionEvidenceFiles.filter((f) => f.month === month);
              return (
                <div key={month} className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-[#1A284F] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full w-fit">
                    {month}
                  </span>
                  <div className="flex flex-col gap-1.5 pl-1">
                    {monthFiles.map((file) => {
                      const fileHref = file.url || file.dataUrl || "";
                      return (
                      <div key={file.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="text-[11px] text-gray-700 flex-1 truncate font-medium">{file.name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0 mr-1">{formatEvidenceSize(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setPreviewEvFile(file)}
                          className="p-1 rounded hover:bg-blue-50 text-blue-600 hover:text-[#1A284F] transition-colors shrink-0"
                          title="Lihat Evidence"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {fileHref ? (
                          <a
                            href={fileHref}
                            download={file.name}
                            className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors shrink-0"
                            title="Download"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── History Evidence Document (Bulan Full Approved / Validated) — Default Collapse ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setValidatedEvHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-[#1e3a5f] text-white cursor-pointer"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="w-4 h-4 text-emerald-300" />
            History Evidence Document (Bulan Full Approved / Validated)
            <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
              {validatedHistoryEvidenceFiles.length} file{validatedHistoryEvidenceFiles.length !== 1 ? "s" : ""}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${validatedEvHistoryOpen ? "rotate-180" : ""}`} />
        </button>
        {validatedEvHistoryOpen && (
          <div className="p-4">
            {validatedHistoryEvidenceFiles.length === 0 ? (
              <p className="py-5 text-center text-xs text-gray-400 italic">
                Belum ada dokumen evidence pada bulan yang sudah Full Approved (Validated).
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {Array.from(new Set(validatedHistoryEvidenceFiles.map((f) => f.month))).map((month) => {
                  const monthFiles = validatedHistoryEvidenceFiles.filter((f) => f.month === month);
                  return (
                    <div key={month} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                        {month} · Validated
                      </span>
                      <div className="flex flex-col gap-1.5">
                        {monthFiles.map((file) => {
                          const fileHref = file.url || file.dataUrl || "";
                          return (
                            <div key={file.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
                              <Paperclip className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-[11px] text-gray-700 flex-1 truncate font-medium">{file.name}</span>
                              <span className="text-[10px] text-gray-400 shrink-0 mr-1">{formatEvidenceSize(file.size)}</span>
                              <button
                                type="button"
                                onClick={() => setPreviewEvFile(file)}
                                className="p-1 rounded hover:bg-blue-50 text-blue-600 hover:text-[#1A284F] transition-colors shrink-0 cursor-pointer"
                                title="Lihat Evidence"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {fileHref ? (
                                <a
                                  href={fileHref}
                                  download={file.name}
                                  className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors shrink-0"
                                  title="Download"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── History Catatan Approver (per Bulan) — Default Collapse ── */}
      <ApproverNotesHistory
        employeeId={row.employeeId}
        module="KPI"
        phase="measurement"
        title="History Catatan Approver (per Bulan)"
        monthly
        defaultOpen={false}
      />

      {/* Modal Preview Evidence KPI */}
      {previewEvFile && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPreviewEvFile(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="text-sm font-bold truncate">{previewEvFile.name}</span>
                <span className="text-xs text-white/70 shrink-0">({previewEvFile.month})</span>
              </div>
              <div className="flex items-center gap-2">
                {(previewEvFile.url || previewEvFile.dataUrl) && (
                  <a
                    href={previewEvFile.url || previewEvFile.dataUrl}
                    download={previewEvFile.name}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                )}
                <button type="button" onClick={() => setPreviewEvFile(null)} className="text-white/70 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-gray-100 flex items-center justify-center min-h-[380px]">
              {(previewEvFile.url || previewEvFile.dataUrl) ? (
                previewEvFile.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewEvFile.name) ? (
                  <img
                    src={previewEvFile.url || previewEvFile.dataUrl}
                    alt={previewEvFile.name}
                    className="max-h-[72vh] max-w-full object-contain rounded-xl shadow bg-white p-2"
                  />
                ) : previewEvFile.type === "application/pdf" || /\.pdf$/i.test(previewEvFile.name) ? (
                  <iframe
                    src={previewEvFile.url || previewEvFile.dataUrl}
                    title={previewEvFile.name}
                    className="w-full h-[72vh] rounded-xl bg-white border border-gray-200"
                  />
                ) : (
                  <div className="bg-white rounded-2xl p-8 text-center space-y-3 border border-gray-200 max-w-md">
                    <FileText className="w-12 h-12 text-[#1A284F] mx-auto" />
                    <p className="text-sm font-bold text-gray-800">{previewEvFile.name}</p>
                    <p className="text-xs text-gray-500">
                      Bulan: {previewEvFile.month} · Ukuran: {formatEvidenceSize(previewEvFile.size)}
                    </p>
                    <a
                      href={previewEvFile.url || previewEvFile.dataUrl}
                      download={previewEvFile.name}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1A284F] text-white text-xs font-semibold hover:bg-[#131d3b]"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Dokumen
                    </a>
                  </div>
                )
              ) : (
                <div className="bg-white rounded-2xl p-8 text-center space-y-2 border border-gray-200 max-w-md">
                  <FileText className="w-12 h-12 text-[#1A284F] mx-auto" />
                  <p className="text-sm font-bold text-gray-800">{previewEvFile.name}</p>
                  <p className="text-xs text-gray-500">
                    Bulan: {previewEvFile.month} · Ukuran: {formatEvidenceSize(previewEvFile.size)}
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

// ──�� SMART Goals Approver Assessment ───────────────────────────────────────────

// ─── SMART Goals Approver Review — new format ──────────────────────────────────

type SG_LocalStatus = "-" | "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Batal";
type SG_AchievementStatus = "" | "Tercapai" | "Tidak Tercapai";

interface SG_TargetActual {
  goalId: number;
  actual: string;
  achievementPct?: string;
  realizationStatus?: string;
  realizationFactor?: string;
  realizationReason?: string;
  realizationFiles?: StoredSmartGoalEvidenceFile[];
  status: SG_AchievementStatus;
  achievementFactor?: string;
  alasan: string;
  evidenceCount: number;
  inappropriateEvidence?: boolean;
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

// ── Goal Review Card ──────────────────────────────────────────────────────────

function SG_GoalCard({
  goal,
  apStatuses,
  apProgress,
  apNotes,
  apAlasanBatal,
  apEvidence,
  onPreviewFile,
  defaultOpen,
}: {
  goal: typeof SAMPLE_GOALS[0];
  apStatuses: Record<number, SG_LocalStatus>;
  apProgress: Record<number, number>;
  apNotes: Record<number, string>;
  apAlasanBatal: Record<number, string>;
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
            <span className="text-[10px] text-white/60 font-semibold">{selesaiCount}/{totalAPs} Execution Plan | Attainable</span>
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
                      {row.key === "attainable" ? (
                        goal.actionPlans && goal.actionPlans.some((ap) => ap.description?.trim()) ? (
                          <div className="flex flex-col gap-1">
                            {goal.actionPlans
                              .filter((ap) => ap.description?.trim())
                              .map((ap, apIdx) => (
                                <div key={ap.id ?? apIdx} className="flex items-start gap-1.5">
                                  <span className="font-bold text-[#1A284F] shrink-0">{apIdx + 1}.</span>
                                  <span>{ap.description}</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <span className="whitespace-pre-line">{(goal[row.key as keyof typeof goal] as string) || <span className="italic text-gray-300">—</span>}</span>
                        )
                      ) : (
                        <span className="whitespace-pre-line">{(goal[row.key as keyof typeof goal] as string) || <span className="italic text-gray-300">—</span>}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {goal.actionPlans.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1A284F]">Status Execution Plan | Attainable</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + goal.actionPlans.length * 160}px` }}>
                  <thead>
                    <tr>
                      <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-40 border-r border-white/20">Execution Plan | Attainable</th>
                      {goal.actionPlans.map((ap, idx) => (
                        <th key={ap.id} className={`bg-[#1A284F] text-white text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${idx < goal.actionPlans.length - 1 ? "border-r border-white/20" : ""}`}>Execution Plan | Attainable {idx + 1}</th>
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
                        const progPct = apProgress[ap.id] ?? 0;
                        return (
                          <td key={ap.id} className={`border-t border-gray-200 px-2 py-2 text-center align-middle ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                            <div className="flex flex-col items-center gap-1">
                              <span className={`inline-flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 font-semibold leading-tight ${SG_AP_COLOR[st]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SG_AP_DOT[st]}`} />
                                {st === "-"
                                  ? "—"
                                  : st === "Sedang dilaksanakan"
                                  ? `Sedang dilaksanakan (${progPct}%)`
                                  : st}
                              </span>
                              {st === "Sedang dilaksanakan" && (
                                <div className="w-full max-w-[130px] flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${PCT_BAR_COLOR(progPct)}`}
                                      style={{ width: `${Math.min(100, Math.max(0, progPct))}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-bold ${PCT_TEXT_COLOR(progPct)}`}>{progPct}%</span>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="bg-white">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-top"><span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Catatan</span></td>
                      {goal.actionPlans.map((ap, idx) => {
                        const st: SG_LocalStatus = apStatuses[ap.id] ?? "-";
                        const batalText = apAlasanBatal[ap.id];
                        const noteText = apNotes[ap.id];
                        return (
                          <td key={ap.id} className={`border-t border-gray-200 px-3 py-2 align-top text-[11px] leading-relaxed ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                            {st === "Batal" && batalText ? (
                              <div className="text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                                <span className="font-bold text-[10px] uppercase block text-red-500">Alasan Batal</span>
                                <span>{batalText}</span>
                              </div>
                            ) : noteText ? (
                              <span className="text-gray-700">{noteText}</span>
                            ) : (
                              <span className="italic text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
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
                                      href={f.url || f.dataUrl || FAKE_BLOB}
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

// ── Goals Realization & Achievement Status (Approval View) ───────────────────

function SG_TargetVsActual({
  goals,
  targetActuals,
  onPreviewFile,
  canToggleEvidenceInvalid,
  onToggleEvidenceInvalid,
}: {
  goals: typeof SAMPLE_GOALS;
  targetActuals: Record<number, SG_TargetActual & { files?: StoredSmartGoalEvidenceFile[] }>;
  onPreviewFile: (file: StoredSmartGoalEvidenceFile) => void;
  canToggleEvidenceInvalid?: boolean;
  onToggleEvidenceInvalid?: (goalId: number, invalid: boolean) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-3 bg-[#1A284F] gap-2">
        <TrendingUp className="w-4 h-4 text-green-300" />
        <span className="text-white text-sm font-bold flex-1">Goals Realization &amp; Achievement Status</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "1050px" }}>
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-24">Goals</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-52">Goals Specific</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-52">Realization Goals Status</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-44">Target</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-36">Aktual</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-24">% Achievement</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-64">Achievement Target Status</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal, idx) => {
              const ta = targetActuals[goal.id];
              const totalGoalEvidences = (ta?.files?.length ?? 0) + (ta?.realizationFiles?.length ?? 0);
              return (
                <tr key={goal.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="border-t border-gray-100 px-3.5 py-3 align-top"><span className="font-semibold text-[11px] text-[#1A284F]">{goal.label}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3.5 py-3 align-top"><p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{goal.specific || "—"}</p></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3.5 py-3 align-top">
                    {!ta?.realizationStatus ? (
                      <span className="text-[11px] text-gray-300 italic">—</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit ${ta.realizationStatus === "Terwujud" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ta.realizationStatus === "Terwujud" ? "bg-teal-500" : "bg-amber-500"}`} />
                          {ta.realizationStatus}
                        </span>
                        {ta.realizationFactor && (
                          <span className="inline-flex w-fit px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                            {ta.realizationFactor}
                          </span>
                        )}
                        {ta.realizationReason && (
                          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
                            {ta.realizationReason}
                          </p>
                        )}
                        {(ta.realizationFiles ?? []).length > 0 && (
                          <div className="flex flex-col gap-1 mt-0.5">
                            {(ta.realizationFiles ?? []).map((f, fi) => (
                              <div key={fi} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-teal-50 border border-teal-200 w-fit">
                                <Paperclip className="w-3 h-3 text-teal-600 shrink-0" />
                                <span className="text-[10px] text-teal-900 font-medium truncate max-w-[130px]" title={f.name}>{f.name}</span>
                                <button type="button" onClick={() => onPreviewFile(f)} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-teal-300 text-[9px] font-bold text-[#1A284F] hover:bg-teal-100">
                                  <Eye className="w-2.5 h-2.5" /> Open
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3.5 py-3 align-top"><span className="text-[11px] text-gray-500 italic leading-relaxed">{goal.target || "—"}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3.5 py-3 align-top"><span className="text-[11px] text-gray-800 font-medium">{ta?.actual || <span className="italic text-gray-300">—</span>}</span></td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3 py-3 align-top text-center">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-[#1A284F] font-bold text-[11px]">
                      {ta?.achievementPct ? `${String(ta.achievementPct).replace(/%$/, "")}%` : "—"}
                    </span>
                  </td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-3.5 py-3 align-top">
                    {!ta?.status ? (
                      <span className="text-[11px] text-gray-300 italic">Belum diisi</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit ${ta.status === "Tercapai" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ta.status === "Tercapai" ? "bg-green-500" : "bg-red-500"}`} />
                          {ta.status}
                        </span>
                        {ta.achievementFactor && (
                          <span className="inline-flex w-fit px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-bold">
                            {ta.achievementFactor}
                          </span>
                        )}
                        {ta.status === "Tidak Tercapai" && ta.alasan && (
                          <div className="bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 max-w-xs">
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-0.5">Alasan</p>
                            <p className="text-[11px] text-red-700 leading-relaxed">{ta.alasan}</p>
                          </div>
                        )}
                        {(ta.files ?? []).length > 0 && (
                          <div className="flex flex-col gap-1 mt-1">
                            {(ta.files ?? []).map((f, fi) => (
                              <div key={fi} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 w-fit">
                                <Paperclip className="w-3 h-3 text-green-600 shrink-0" />
                                <span className="text-[11px] text-green-800 font-medium truncate max-w-[130px]" title={f.name}>{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => onPreviewFile(f)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-green-300 text-[10px] font-bold text-[#1A284F] hover:bg-green-100"
                                >
                                  <Eye className="w-3 h-3" /> Open
                                </button>
                                <a
                                  href={f.url || f.dataUrl || FAKE_BLOB}
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
                        {totalGoalEvidences > 0 && (canToggleEvidenceInvalid || ta.inappropriateEvidence) && (
                          <label className={`mt-1 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold select-none ${
                            ta.inappropriateEvidence
                              ? "bg-rose-50 border-rose-300 text-rose-700"
                              : "bg-slate-50 border-slate-200 text-slate-700"
                          } ${canToggleEvidenceInvalid ? "cursor-pointer hover:border-rose-300" : "cursor-default"}`}>
                            <input
                              type="checkbox"
                              disabled={!canToggleEvidenceInvalid}
                              checked={Boolean(ta.inappropriateEvidence)}
                              onChange={(e) => onToggleEvidenceInvalid?.(goal.id, e.target.checked)}
                              className="accent-rose-600 rounded"
                            />
                            <span>Evidence Tidak Sesuai (Maks. Skor 20%)</span>
                          </label>
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
  workflowStage,
  ap1Name,
  ap2Name,
  comments,
  onComment,
  employeeId,
  rowNo,
  position,
  companyUnit,
}: {
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  reviewerRole: ReviewerRole;
  workflowStage: WorkflowStageRole;
  ap1Name: string;
  ap2Name: string;
  comments: Record<number, string>;
  onComment: (goalId: number, text: string) => void;
  employeeId?: string;
  rowNo?: string;
  position?: string;
  companyUnit?: string;
}) {
  const [previewEvidenceFile, setPreviewEvidenceFile] = useState<StoredSmartGoalEvidenceFile | null>(null);
  const [, setSgRemoteTick] = useState(0);
  React.useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    void fetchEmployeeSmartGoalsLive(employeeId).then((remote) => {
      if (!cancelled && remote) {
        setSgRemoteTick((t) => t + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);
  const live = loadSubmittedGoals(employeeId);
  const goals = live && live.length > 0 ? live : [];
  const ownerCheckInEntries = loadCheckInEntries(employeeId);

  // Bangun status Action Plan, catatan, evidence, dan Target vs Actual murni dari data owner (karyawan pemilik)
  const ownerApStatuses: Record<number, SG_LocalStatus> = {};
  const ownerApProgress: Record<number, number> = {};
  const ownerApNotes: Record<number, string> = {};
  const ownerApAlasanBatal: Record<number, string> = {};
  const ownerApEvidence: Record<number, StoredSmartGoalEvidenceFile[]> = {};
  const ownerTargetActuals: Record<number, SG_TargetActual & { files?: StoredSmartGoalEvidenceFile[] }> = {};
  const ownerCheckInByGoalId: Record<number, StoredCheckInEntry | undefined> = {};

  for (const g of goals) {
    const ci = ownerCheckInEntries.find((e) => e.goalId === g.id);
    ownerCheckInByGoalId[g.id] = ci;
    for (const ap of g.actionPlans) {
      const st = (ci?.actionPlanStatuses?.[ap.id] as SG_LocalStatus | undefined) ?? "-";
      ownerApStatuses[ap.id] = st;
      ownerApProgress[ap.id] = ci?.actionPlanProgress?.[ap.id] ?? 0;
      if (ci?.actionPlanKendala?.[ap.id]) {
        ownerApNotes[ap.id] = ci.actionPlanKendala[ap.id];
      }
      if (ci?.actionPlanAlasanBatal?.[ap.id]) {
        ownerApAlasanBatal[ap.id] = ci.actionPlanAlasanBatal[ap.id];
      }
      if (ci?.actionPlanEvidence?.[ap.id]) {
        ownerApEvidence[ap.id] = ci.actionPlanEvidence[ap.id];
      }
    }
    const files = ci?.evidenceFiles ?? [];
    const realizationFiles = ci?.realizationEvidenceFiles ?? [];
    const rawPctStr =
      ci?.achievementPct != null && Number.isFinite(Number(ci.achievementPct))
        ? String(ci.achievementPct)
        : String(ci?.achievement ?? "").replace("%", "").trim();
    ownerTargetActuals[g.id] = {
      goalId: g.id,
      actual: ci?.actual ?? "",
      achievementPct: rawPctStr,
      realizationStatus: ci?.realizationStatus ?? "",
      realizationFactor: ci?.realizationFactor ?? "",
      realizationReason: ci?.realizationReason ?? "",
      realizationFiles,
      status: (ci?.targetAchievementStatus as "Tercapai" | "Tidak Tercapai" | "") ?? "",
      achievementFactor: ci?.achievementFactor ?? "",
      alasan: ci?.alasanTidakTercapai ?? "",
      evidenceCount: files.length,
      files,
      inappropriateEvidence: Boolean(
        ci?.inappropriateEvidenceByRole?.[reviewerRole] ??
        ci?.inappropriateEvidenceByRole?.approver1 ??
        ci?.inappropriateEvidenceByRole?.approver2,
      ),
    };
  }

  const isCheckerStage = workflowStage === "checker";
  const isValidatorStage = workflowStage === "validator";

  React.useEffect(() => {
    if (submitted || isCheckerStage || isValidatorStage) return;
    for (const g of goals) {
      const ci = ownerCheckInByGoalId[g.id];
      const inv = Boolean(ci?.inappropriateEvidenceByRole?.[reviewerRole]);
      const b = computeSmartGoalApproverScoreBounds(ci, inv);
      if (b.max === 0 && assessorRatings[`sg-${g.id}`] !== 0) {
        onRate(`sg-${g.id}`, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, isCheckerStage, isValidatorStage, goals.length, reviewerRole]);

  // Load Approver 1 & Approver 2 stored assessments from workflow record
  const normEmpId = employeeId ? normalizeEmployeeId(employeeId) : "";
  const sgWfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.module === "SMART Goals" &&
      r.phase === "measurement" &&
      r.employeeId === normEmpId,
  );
  const storedA1 = rowNo ? loadSGAssessment(rowNo) : null;
  const rawA1Ratings = sgWfRec?.assessments.approver1?.ratings ?? storedA1?.ratings ?? {};
  const a1Ratings: Record<number, number> = Object.fromEntries(
    Object.entries(rawA1Ratings)
      .filter(([k]) => k.startsWith("sg-"))
      .map(([k, v]) => [Number(k.slice(3)), v]),
  );
  const a1GlobalComment =
    sgWfRec?.assessments.approver1?.comments?.["0"] ??
    sgWfRec?.decisions.approver1?.note ??
    storedA1?.globalComment ??
    "";
  const a1AssessedDate =
    sgWfRec?.decisions.approver1?.date ??
    sgWfRec?.assessments.approver1?.date ??
    storedA1?.assessedDate ??
    "—";

  const storedA2 = rowNo ? loadAssessment(rowNo, "approver2") : null;
  const rawA2Ratings = sgWfRec?.assessments.approver2?.ratings ?? storedA2?.ratings ?? {};
  const a2RatingsStored: Record<number, number> = Object.fromEntries(
    Object.entries(rawA2Ratings)
      .filter(([k]) => k.startsWith("sg-"))
      .map(([k, v]) => [Number(k.slice(3)), v]),
  );
  const a2GlobalComment =
    sgWfRec?.assessments.approver2?.comments?.["0"] ??
    sgWfRec?.decisions.approver2?.note ??
    storedA2?.comments?.["0"] ??
    "";
  const a2AssessedDate =
    sgWfRec?.decisions.approver2?.date ??
    sgWfRec?.assessments.approver2?.date ??
    storedA2?.assessedDate ??
    "—";

  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel =
    reviewerRole === "approver1"
      ? `Penilaian Approver 1 - ${ap1Name}`
      : `Penilaian Approver 2 - ${ap2Name}`;

  const filledScores = goals.map((g) => assessorRatings[`sg-${g.id}`] ?? null).filter((v): v is number => v != null);
  const totalAvg = filledScores.length > 0 ? Math.round(filledScores.reduce((s, v) => s + v, 0) / filledScores.length) : null;

  // Final Score computation (visible when both A1 & A2 data exist OR for approver2 view)
  const a2RatingsMap: Record<number, number> =
    workflowStage === "approver2"
      ? Object.fromEntries(goals.map((g) => [g.id, assessorRatings[`sg-${g.id}`] ?? a2RatingsStored[g.id] ?? 0]))
      : a2RatingsStored;
  const hasA2Data = Object.keys(a2RatingsMap).length > 0 && goals.some((g) => (a2RatingsMap[g.id] ?? 0) > 0);
  const bobot = (() => {
    const allUsers = loadManagedUsers();
    const owner = allUsers.find((u) => normalizeEmployeeId(u.employeeId) === normEmpId);
    const unit = owner?.company || companyUnit || "PT RSUP (Industry)";
    const grp = owner ? resolveEffectiveUserGrouping(owner) : "";
    const col = weightColumnFromGrouping(grp, unit);
    const rawW = loadUnitScoreWeights(unit)["SMART Goals"]?.[col];
    const parsed = rawW && rawW !== "-" ? parseFloat(String(rawW).replace("%", "").trim()) : NaN;
    return Number.isFinite(parsed) ? parsed : (position ? getBobotByPosition(position) : 20);
  })();
  const perGoalAvgRatings = goals.map((g) => {
    const r1 = a1Ratings[g.id] ?? 0;
    const r2 = a2RatingsMap[g.id] ?? 0;
    return { goalId: g.id, a1: r1, a2: r2, avg: Math.round((r1 + r2) / 2) };
  });
  const overallAvg = hasA2Data ? Math.round(perGoalAvgRatings.reduce((s, r) => s + r.avg, 0) / perGoalAvgRatings.length) : null;
  const finalScore = overallAvg != null ? Math.round(overallAvg * bobot / 100 * 10) / 10 : null; // percentage points weighted by bobot
  const showFinalScore = isValidatorStage || hasA2Data || (workflowStage === "approver2" && filledScores.length > 0);

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

      {/* 2 — Per-goal collapsible cards */}
      <div className="flex flex-col gap-3">
        {goals.map((goal, idx) => (
          <SG_GoalCard
            key={goal.id}
            goal={goal}
            apStatuses={ownerApStatuses}
            apProgress={ownerApProgress}
            apNotes={ownerApNotes}
            apAlasanBatal={ownerApAlasanBatal}
            apEvidence={ownerApEvidence}
            onPreviewFile={(file) => setPreviewEvidenceFile(file)}
            defaultOpen={idx === 0}
          />
        ))}
      </div>

      {/* Status Progress Keseluruhan — di atas Target vs Actual */}
      <SmartGoalsProgressCard
        variant="light"
        goals={goals.map((g) => ({ id: g.id, actionPlanIds: g.actionPlans.map((ap) => ap.id) }))}
        getActionPlanStatus={(_goalId, apId) => ownerApStatuses[apId as number] ?? "-"}
        getGoalStatus={(goalId) => ownerTargetActuals[goalId as number]?.status ?? ""}
        getRealizationStatus={(goalId) => ownerTargetActuals[goalId as number]?.realizationStatus ?? ""}
      />

      {!isCheckerStage && !isValidatorStage && !submitted && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Panduan Verifikasi Evidence Approver:</strong> Periksa kesesuaian setiap file evidence yang dilampirkan karyawan. Apabila lampiran evidence <strong>tidak sesuai / tidak relevan</strong>, centang <strong>&ldquo;Evidence Tidak Sesuai (Maks. Skor 20%)&rdquo;</strong> pada kolom <em>Achievement Target Status</em> agar batas maksimal nilai pada goal tersebut terkunci di <strong>20%</strong>.
          </p>
        </div>
      )}

      {/* 3 — Goals Realization & Achievement Status */}
      <SG_TargetVsActual
        goals={goals}
        targetActuals={ownerTargetActuals}
        onPreviewFile={(file) => setPreviewEvidenceFile(file)}
        canToggleEvidenceInvalid={!isCheckerStage && !isValidatorStage && !submitted && Boolean(employeeId)}
        onToggleEvidenceInvalid={(goalId, invalid) => {
          if (!employeeId) return;
          saveGoalEvidenceInappropriateFlag(employeeId, goalId, reviewerRole, invalid);
          const bounds = computeSmartGoalApproverScoreBounds(ownerCheckInByGoalId[goalId], invalid);
          const curScore = assessorRatings[`sg-${goalId}`];
          if (curScore != null && (curScore > bounds.max || curScore < bounds.min)) {
            onRate(`sg-${goalId}`, Math.min(bounds.max, Math.max(bounds.min, curScore)));
          }
          setSgRemoteTick((t) => t + 1);
        }}
      />

      {/* Section Penilaian Approver DISEMBUNYIKAN pada level Checker (HR Unit) */}
      {!isCheckerStage && (
        <>
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Penilaian Approver</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* History Penilaian Approver 1 — tampil untuk Approver 2 maupun Validator HR ICF */}
          {(workflowStage === "approver2" || isValidatorStage) && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
              Penilaian Approver 1 - {ap1Name}
            </p>
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
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <MessageSquare className="w-3.5 h-3.5" />Komentar Approver 1
            </label>
            <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-white/80 border-blue-100 text-blue-900">
              {a1GlobalComment || <span className="italic text-gray-400">Belum ada komentar dari Approver 1.</span>}
            </p>
          </div>
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

          {/* History Penilaian Approver 2 — khusus tampilan Validator HR ICF (Read-Only Subsection ke-2) */}
          {isValidatorStage && (
            <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/40 px-5 py-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">
                  Penilaian Approver 2 - {ap2Name}
                </p>
                <span className="ml-auto text-[10px] text-teal-500">Dinilai: {a2AssessedDate}</span>
              </div>
              <div className="flex flex-col gap-2 mb-1">
                {goals.map((goal, idx) => {
                  const v = a2RatingsStored[goal.id];
                  return (
                    <div key={goal.id} className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500 w-5 shrink-0 font-semibold">{idx + 1}.</span>
                      <span className="text-gray-700 flex-1 truncate">{goal.label}</span>
                      {v != null ? (
                        <>
                          <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden shrink-0">
                            <div className={`h-1.5 rounded-full ${PCT_BAR_COLOR(v)}`} style={{ width: `${v}%` }} />
                          </div>
                          <span className={`font-bold w-10 text-right shrink-0 ${PCT_TEXT_COLOR(v)}`}>{v}%</span>
                        </>
                      ) : (
                        <span className="text-gray-300 w-10 text-right shrink-0">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                  <MessageSquare className="w-3.5 h-3.5" />Komentar Approver 2
                </label>
                <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-white/80 border-teal-100 text-teal-900">
                  {a2GlobalComment || <span className="italic text-gray-400">Belum ada komentar dari Approver 2.</span>}
                </p>
              </div>
              <div className="border-t border-teal-200 pt-3 flex items-center justify-between">
                <span className="text-sm font-bold text-teal-700">Rata-Rata Approver 2</span>
                {(() => {
                  const vals = goals.map((g) => a2RatingsStored[g.id] ?? null).filter((v): v is number => v != null);
                  const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
                  return <span className={`text-2xl font-black ${avg != null ? PCT_TEXT_COLOR(avg) : "text-gray-300"}`}>{avg != null ? `${avg}%` : "—"}</span>;
                })()}
              </div>
            </div>
          )}

          {/* 5 — Penilaian Approver Aktif (Hanya untuk Approver 1 atau Approver 2, TIDAK untuk Validator / Checker) */}
          {!isValidatorStage && (
            <>
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
                const isEvInvalid = Boolean(ownerCheckInByGoalId[goal.id]?.inappropriateEvidenceByRole?.[reviewerRole]);
                const scoreBounds = computeSmartGoalApproverScoreBounds(ownerCheckInByGoalId[goal.id], isEvInvalid);
                const isOutOfBounds = ratingVal != null && (ratingVal < scoreBounds.min || ratingVal > scoreBounds.max);
                return (
                  <tr key={goal.id} className={idx % 2 === 0 ? "bg-white" : `${assessorColor === "indigo" ? "bg-indigo-50/20" : "bg-teal-50/20"}`}>
                    <td className={`border-t px-4 py-3 align-middle text-center font-bold ${assessorColor === "indigo" ? "border-indigo-50 text-indigo-400" : "border-teal-50 text-teal-400"}`}>{idx + 1}</td>
                    <td className={`border-t border-l px-4 py-3 align-middle font-semibold text-gray-700 ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>{goal.label}</td>
                    <td className={`border-t border-l px-4 py-3 align-middle text-center ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>
                      <div className="flex flex-col items-center gap-1">
                      {achieveStatus === "Tercapai" && <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-green-100 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />Tercapai</span>}
                      {achieveStatus === "Tidak Tercapai" && <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2.5 py-1 font-bold bg-red-100 text-red-600"><span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />Tidak Tercapai</span>}
                      {!achieveStatus && <span className="text-gray-300 italic">—</span>}
                      {ownerTargetActuals[goal.id]?.realizationStatus && (
                        <span className="text-[10px] font-semibold text-slate-500">
                          {ownerTargetActuals[goal.id]?.realizationStatus} · {ownerTargetActuals[goal.id]?.achievementPct || "0"}%
                        </span>
                      )}
                      </div>
                    </td>
                    <td className={`border-t border-l px-4 py-3 align-middle ${assessorColor === "indigo" ? "border-indigo-50" : "border-teal-50"}`}>
                      {submitted ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full ${PCT_BAR_COLOR(ratingVal ?? 0)}`} style={{ width: `${ratingVal ?? 0}%` }} /></div>
                          <span className={`text-sm font-bold w-12 text-right shrink-0 ${PCT_TEXT_COLOR(ratingVal ?? 0)}`}>{ratingVal ?? 0}%</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <div className={`flex items-center border-2 rounded-lg overflow-hidden ${isOutOfBounds ? "border-rose-400 bg-rose-50" : assessorColor === "indigo" ? "border-indigo-200 focus-within:border-indigo-500" : "border-teal-200 focus-within:border-teal-500"}`}>
                            <input
                              type="number"
                              min={scoreBounds.min}
                              max={scoreBounds.max}
                              disabled={scoreBounds.max === 0}
                              value={scoreBounds.max === 0 ? 0 : (ratingVal ?? "")}
                              onChange={(e) => {
                                if (scoreBounds.max === 0) {
                                  onRate(ratingKey, 0);
                                  return;
                                }
                                const raw = Number(e.target.value);
                                onRate(ratingKey, Math.min(scoreBounds.max, Math.max(0, raw)));
                              }}
                              onBlur={() => {
                                if (ratingVal != null && ratingVal < scoreBounds.min) {
                                  onRate(ratingKey, scoreBounds.min);
                                }
                              }}
                              placeholder={String(scoreBounds.min)}
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
                        <span className={`text-[10px] font-semibold ${isOutOfBounds ? "text-rose-600" : "text-slate-500"}`}>
                          Rentang nilai diizinkan: <strong>{scoreBounds.label}</strong>
                        </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className={assessorColor === "indigo" ? "bg-indigo-50/60" : "bg-teal-50/60"}>
                <td colSpan={3} className={`border-t-2 px-4 py-3 text-right text-sm font-bold ${assessorColor === "indigo" ? "border-indigo-100 text-indigo-700" : "border-teal-100 text-teal-700"}`}>
                  Rata-Rata ({filledScores.length}/{goals.length} goals dinilai)
                </td>
                <td className={`border-t-2 border-l px-4 py-3 text-right ${assessorColor === "indigo" ? "border-indigo-100" : "border-teal-100"}`}>
                  <span className={`text-xl font-black ${totalAvg != null ? PCT_TEXT_COLOR(totalAvg) : "text-gray-300"}`}>
                    {totalAvg != null ? `${totalAvg}%` : "—"}
                  </span>
                </td>
              </tr>
            </tfoot>
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

            </>
          )}

      {/* 7 — Final Score (Subsection ke-3 pada Validator HR ICF, dan muncul di Approver 2) */}
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
        </>
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
                  href={previewEvidenceFile.url || previewEvidenceFile.dataUrl || FAKE_BLOB}
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
              {(previewEvidenceFile.url || previewEvidenceFile.dataUrl) ? (
                previewEvidenceFile.type?.startsWith("image/") ||
                /\.(jpg|jpeg|png|gif|webp)$/i.test(previewEvidenceFile.name) ? (
                  <img
                    src={previewEvidenceFile.url || previewEvidenceFile.dataUrl}
                    alt={previewEvidenceFile.name}
                    className="max-h-[72vh] max-w-full object-contain rounded-xl shadow bg-white p-2"
                  />
                ) : (
                  <iframe
                    src={previewEvidenceFile.url || previewEvidenceFile.dataUrl}
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
  row, reviewerRole, assessorRatings, onRate, submitted, readOnlyView = false, assessmentSubmitted = false,
  indicatorItem, setIndicatorItem, activeForm, setActiveForm,
}: {
  row: ApprovalRow;
  reviewerRole: ReviewerRole;
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  readOnlyView?: boolean;
  assessmentSubmitted?: boolean;
  indicatorItem: FormItem | MSItem | null;
  setIndicatorItem: (item: FormItem | MSItem | null) => void;
  activeForm: "A" | "B" | "C";
  setActiveForm: (f: "A" | "B" | "C") => void;
}) {
  const formsList = loadMasterAppraisalForms();
  const readRating = (map: Record<string, number>, fId: string, itemNo: number): number | undefined =>
    map[`${fId}-${itemNo}`] ?? map[`${fId}__${itemNo}`];

  const self = loadAppraisalSelf(row.employeeId);
  const selfRatings = self ? Object.fromEntries(self.forms.flatMap((entry) => Object.entries(entry.ratings).map(([key, value]) => [key.replace("__", "-"), value]))) : {};
  const alias = workflowAlias(row.no);
  const record = alias && loadWorkflowRecords().find((item) => item.key === alias.key);
  const firstRatings = loadAssessment(row.no, "approver1")?.ratings ?? record?.assessments.approver1?.ratings ?? {};
  const secondRatings = loadAssessment(row.no, "approver2")?.ratings ?? record?.assessments.approver2?.ratings ?? {};
  const managedUsers = loadManagedUsers();
  const targetOwner = managedUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(row.employeeId) ||
      u.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase(),
  );
  const isSameAp1Ap2 = (() => {
    if (!targetOwner) return false;
    const r1 = String(targetOwner.regNoAp1 ?? "").trim().toLowerCase();
    const r2 = String(targetOwner.regNoAp2 ?? "").trim().toLowerCase();
    if (!r1 || !r2) return false;
    if (r1 === r2) return true;
    const matchUser = (ref: string) =>
      managedUsers.find(
        (u) =>
          String(u.regNo ?? "").trim().toLowerCase() === ref ||
          u.employeeId.trim().toLowerCase() === ref ||
          u.name.trim().toLowerCase() === ref,
      );
    const u1 = matchUser(r1);
    const u2 = matchUser(r2);
    return Boolean(u1 && u2 && u1.employeeId.toLowerCase() === u2.employeeId.toLowerCase());
  })();
  const form = formsList.find((f) => f.id === activeForm) ?? formsList[0] ?? FORMS[0];
  const isAdminGlobalInspector = Boolean(readOnlyView && isAdminOrHrIcfRole(getActiveUser().role));
  const showApp1 = reviewerRole === "approver2";
  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel = reviewerRole === "approver1" ? "Evaluasi Approver 1" : "Evaluasi Approver 2";

  const selfRated     = form.items.filter((i) => readRating(selfRatings, form.id, i.no) != null).length;
  const app1Rated     = form.items.filter((i) => readRating(firstRatings, form.id, i.no) != null).length;
  const assessorRated = form.items.filter((i) => readRating(assessorRatings, form.id, i.no) != null).length;

  const currentFormIndex = formsList.findIndex((f) => f.id === activeForm);
  const nextForm = formsList[currentFormIndex + 1] ?? null;
  const currentFormComplete = form.items.every((item) => readRating(assessorRatings, form.id, item.no) != null);
  const formCDef = formsList.find((f) => f.id === "C") ?? FORMS.find((f) => f.id === "C");
  const hasFormCRatings = (map: Record<string, number>) =>
    Boolean(
      formCDef &&
        formCDef.items.length > 0 &&
        formCDef.items.every((item) => readRating(map, "C", item.no) != null),
    );
  const isFormCFulfilled = hasFormCRatings(assessorRatings);
  const hasCompletedSavedFormC =
    readOnlyView &&
    (hasFormCRatings(assessorRatings) || hasFormCRatings(firstRatings) || hasFormCRatings(secondRatings));
  const shouldShowSummary = isFormCFulfilled || assessmentSubmitted || hasCompletedSavedFormC;

  const selfTotal     = selfRated > 0
    ? (form.items.reduce((s, i) => s + (readRating(selfRatings, form.id, i.no) ?? 0), 0) / selfRated).toFixed(2)
    : "—";
  const app1Total     = app1Rated > 0
    ? (form.items.reduce((s, i) => s + (readRating(firstRatings, form.id, i.no) ?? 0), 0) / app1Rated).toFixed(2)
    : "—";
  const assessorTotal = assessorRated > 0
    ? (form.items.reduce((s, i) => s + (readRating(assessorRatings, form.id, i.no) ?? 0), 0) / assessorRated).toFixed(2)
    : "—";

  // ── Average Summary (muncul ketika Form C sudah fulfill) ─────────────────────
  const formSummary = formsList.map((f) => {
    const sRated  = f.items.filter((i) => readRating(selfRatings, f.id, i.no) != null).length;
    const a1Rated = f.items.filter((i) => readRating(firstRatings, f.id, i.no) != null).length;
    const a2Rated = f.items.filter((i) => readRating(secondRatings, f.id, i.no) != null).length;
    const asRated = f.items.filter((i) => readRating(assessorRatings, f.id, i.no) != null).length;

    const selfAvg = sRated > 0
      ? f.items.reduce((s, i) => s + (readRating(selfRatings, f.id, i.no) ?? 0), 0) / sRated
      : null;
    const storedApp1Avg = a1Rated > 0
      ? f.items.reduce((s, i) => s + (readRating(firstRatings, f.id, i.no) ?? 0), 0) / a1Rated
      : null;
    const storedApp2Avg = a2Rated > 0
      ? f.items.reduce((s, i) => s + (readRating(secondRatings, f.id, i.no) ?? 0), 0) / a2Rated
      : null;
    const assessorAvg = asRated > 0
      ? f.items.reduce((s, i) => s + (readRating(assessorRatings, f.id, i.no) ?? 0), 0) / asRated
      : null;

    const evalAp1Avg =
      reviewerRole === "approver1"
        ? assessorAvg
        : storedApp1Avg ?? (isSameAp1Ap2 ? assessorAvg : null);
    // Jika AP1 == AP2, nilai Evaluasi Approver 2 otomatis sama persis dengan Evaluasi Approver 1.
    // Jika AP1 != AP2 dan masih di tahap Approver 1 (belum dinilai Approver 2), tampilkan 0 pada kolom Evaluasi Approver 2.
    const evalAp2Avg =
      reviewerRole === "approver2"
        ? assessorAvg
        : isSameAp1Ap2
          ? evalAp1Avg
          : storedApp2Avg;
    const evalAp2Display = evalAp2Avg ?? 0;

    const vals = [selfAvg, evalAp1Avg, evalAp2Avg].filter((v): v is number => v != null);
    const combinedAvg = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;

    return { form: f, selfAvg, evalAp1Avg, evalAp2Avg, evalAp2Display, combinedAvg };
  });

  // Grand average across all three forms (simple mean of form averages)
  const grandSelf = (() => {
    const valid = formSummary.filter((r) => r.selfAvg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.selfAvg!, 0) / valid.length : null;
  })();
  const grandApp1 = (() => {
    const valid = formSummary.filter((r) => r.evalAp1Avg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.evalAp1Avg!, 0) / valid.length : null;
  })();
  const grandApp2 = (() => {
    const valid = formSummary.filter((r) => r.evalAp2Avg != null);
    return valid.length > 0 ? valid.reduce((s, r) => s + r.evalAp2Avg!, 0) / valid.length : 0;
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
        {formsList.map((f) => {
          const fRatedCount = f.items.filter((it) => readRating(assessorRatings, f.id, it.no) != null).length;
          const fDone = f.items.length > 0 && fRatedCount === f.items.length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveForm(f.id as "A" | "B" | "C")}
              className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
                activeForm === f.id ? "border-[#1A284F] text-[#1A284F]" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <span>{f.tab}</span>
              <span className="text-gray-400 font-normal">({f.percentage}%)</span>
              {fDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : !submitted && fRatedCount > 0 ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                  {fRatedCount}/{f.items.length}
                </span>
              ) : null}
            </button>
          );
        })}
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
                {isAdminGlobalInspector ? (
                  <>
                    <th className="py-3 px-4 text-center font-semibold text-[#1A284F] border-r border-gray-200 w-56">
                      <div>Evaluasi Pribadi Karyawan</div>
                      <div className="flex justify-around mt-1 text-gray-400 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-indigo-700 border-r border-gray-200 w-56">
                      <div>Evaluasi Approver 1</div>
                      <div className="flex justify-around mt-1 text-indigo-300 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-teal-700 w-56">
                      <div>Evaluasi Approver 2</div>
                      <div className="flex justify-around mt-1 text-teal-300 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {form.items.map((item) => {
                const selfVal = readRating(selfRatings, form.id, item.no) ?? null;
                const ap1Val = readRating(firstRatings, form.id, item.no) ?? null;
                const ap2Val = readRating(secondRatings, form.id, item.no) ?? (isSameAp1Ap2 ? ap1Val : null);
                const assessorVal = readRating(assessorRatings, form.id, item.no) ?? null;
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
                    {isAdminGlobalInspector ? (
                      <>
                        <td className="py-3 px-4 border-r border-gray-100 align-middle">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={selfVal === n} color="navy" />
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 border-r border-gray-100 align-middle bg-indigo-50/20">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={ap1Val === n} color="indigo" />
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-middle bg-teal-50/20">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={ap2Val === n} color="teal" />
                            ))}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </tr>
                );
              })}
              {/* Total row */}
              <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                <td colSpan={3} className="py-3 px-4 text-sm text-gray-800 border-r border-gray-200 text-right">
                  Rata-Rata <span className="text-xs text-gray-400 font-normal">(maks 5.00)</span>
                </td>
                {isAdminGlobalInspector ? (
                  <>
                    <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                    <td className="py-3 px-4 text-center text-indigo-600 border-r border-gray-100">{app1Total}</td>
                    <td className="py-3 px-4 text-center text-teal-600">
                      {(() => {
                        const vals = form.items
                          .map((it) => readRating(secondRatings, form.id, it.no) ?? (isSameAp1Ap2 ? readRating(firstRatings, form.id, it.no) : undefined))
                          .filter((v): v is number => v != null);
                        return vals.length > 0 ? (vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2) : "—";
                      })()}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                    {showApp1 && <td className="py-3 px-4 text-center text-blue-600 border-r border-gray-100">{app1Total}</td>}
                    <td className={`py-3 px-4 text-center ${assessorColor === "indigo" ? "text-indigo-600 bg-indigo-50/20" : "text-teal-600 bg-teal-50/20"}`}>{assessorTotal}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {!submitted && activeForm === "C" && !isFormCFulfilled && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-xs text-indigo-800 flex items-center justify-between gap-3">
          <span>
            Lengkapi seluruh penilaian kompetensi pada <strong>Form C</strong> ({assessorRated}/{form.items.length}) untuk menampilkan <strong>Appraisal Form Summary</strong>.
          </span>
          <span className="font-bold tabular-nums text-indigo-700 shrink-0">
            {assessorRated}/{form.items.length} dinilai
          </span>
        </div>
      )}

      {/* Appraisal Form Summary — muncul otomatis begitu Form C sudah fulfill */}
      {shouldShowSummary && (
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
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-indigo-600">Evaluasi Approver 1</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-teal-600">Evaluasi Approver 2</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-amber-700 bg-amber-50/60">Aktual</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-purple-700 bg-purple-50/60">Konversi Nilai</th>
                  <th className="py-3 px-5 text-center text-green-700 bg-green-50/60">Skor Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {formSummary.map(({ form: f, selfAvg, evalAp1Avg, evalAp2Avg, evalAp2Display, combinedAvg }) => (
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
                    <td className={`py-3 px-5 text-center text-indigo-600 font-bold border-r border-gray-100 ${reviewerRole === "approver1" ? "bg-indigo-50/20" : ""}`}>
                      {evalAp1Avg != null ? evalAp1Avg.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`py-3 px-5 text-center text-teal-600 font-bold border-r border-gray-100 ${reviewerRole === "approver2" || isSameAp1Ap2 ? "bg-teal-50/20" : ""}`}>
                      {evalAp2Avg != null ? evalAp2Avg.toFixed(2) : String(evalAp2Display)}
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
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm font-black">
                      {grandApp1 != null ? grandApp1.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-teal-600 text-white text-sm font-black">
                      {formSummary.some((r) => r.evalAp2Avg != null) ? grandApp2.toFixed(2) : "0"}
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
  row, reviewerRole, assessorRatings, onRate, submitted, readOnlyView,
  indicatorItem, setIndicatorItem,
}: {
  row: ApprovalRow;
  reviewerRole: ReviewerRole;
  assessorRatings: Record<string, number>;
  onRate: (key: string, val: number) => void;
  submitted: boolean;
  readOnlyView?: boolean;
  indicatorItem: FormItem | MSItem | null;
  setIndicatorItem: (item: FormItem | MSItem | null) => void;
}) {
  const msItems = loadMasterMSItems();
  const msSelfObj = loadMSSelfRatings(row.employeeId);
  const selfRatings = msSelfObj && !msSelfObj.isDraft ? (msSelfObj.ratings ?? {}) : {};
  const alias = workflowAlias(row.no);
  const record = alias && loadWorkflowRecords().find((item) => item.key === alias.key);
  const first = loadAssessment(row.no, "approver1");
  const second = loadAssessment(row.no, "approver2");
  const msApproverList = loadAllMSApprovers(row.employeeId);
  const rawFirst = first?.ratings ?? record?.assessments.approver1?.ratings ?? {};
  const rawSecond = second?.ratings ?? record?.assessments.approver2?.ratings ?? {};
  const firstRatings: Record<number, number> =
    Object.keys(rawFirst).length > 0
      ? Object.fromEntries(Object.entries(rawFirst).map(([key, value]) => [Number(key.replace("ms-", "")), value]))
      : (msApproverList.find((e) => e.approverLevel === 1)?.ratings ?? {});
  const secondRatingsStored: Record<number, number> =
    Object.keys(rawSecond).length > 0
      ? Object.fromEntries(Object.entries(rawSecond).map(([key, value]) => [Number(key.replace("ms-", "")), value]))
      : (msApproverList.find((e) => e.approverLevel === 2)?.ratings ?? {});

  const managedUsers = loadManagedUsers();
  const targetOwner = managedUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(row.employeeId) ||
      u.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase(),
  );
  const isSameAp1Ap2 = (() => {
    if (!targetOwner) return false;
    const r1 = String(targetOwner.regNoAp1 ?? "").trim().toLowerCase();
    const r2 = String(targetOwner.regNoAp2 ?? "").trim().toLowerCase();
    return Boolean(r1 && r2 && r1 === r2);
  })();

  const isAdminGlobalInspector = Boolean(readOnlyView && isAdminOrHrIcfRole(getActiveUser().role));
  const showApp1 = reviewerRole === "approver2";
  const assessorColor = reviewerRole === "approver1" ? "indigo" : "teal";
  const assessorLabel = reviewerRole === "approver1" ? "Evaluasi Approver 1" : "Evaluasi Approver 2";

  const msCount = msItems.length || 1;
  const PERCENTAGE = resolveEmployeeModuleWeightPercent(
    targetOwner ?? { company: row.companyUnit, position: row.position },
    "Managerial Skill",
    20,
  );
  const msW = PERCENTAGE / 100;
  void msW;
  const selfRatedVals = msItems.map((i) => selfRatings[i.no]).filter((v): v is number => v != null && v > 0);
  const selfAvg5 = selfRatedVals.length > 0 ? selfRatedVals.reduce((s, v) => s + v, 0) / selfRatedVals.length : null;
  const app1RatedVals = msItems.map((i) => firstRatings[i.no]).filter((v): v is number => v != null && v > 0);
  const storedApp1Avg5 = app1RatedVals.length > 0 ? app1RatedVals.reduce((s, v) => s + v, 0) / app1RatedVals.length : null;
  const app2RatedVals = msItems.map((i) => secondRatingsStored[i.no]).filter((v): v is number => v != null && v > 0);
  const storedApp2Avg5 = app2RatedVals.length > 0 ? app2RatedVals.reduce((s, v) => s + v, 0) / app2RatedVals.length : null;

  const msAssessorRated = msItems.filter((i) => assessorRatings[`ms-${i.no}`] != null).length;
  const liveAssessorAvg5 =
    msAssessorRated > 0
      ? msItems.reduce((s, i) => s + (assessorRatings[`ms-${i.no}`] ?? 0), 0) / msAssessorRated
      : null;

  const evalAp1Avg5 =
    reviewerRole === "approver1"
      ? (liveAssessorAvg5 ?? storedApp1Avg5)
      : (storedApp1Avg5 ?? (isSameAp1Ap2 ? liveAssessorAvg5 : null));
  const evalAp2Avg5 =
    reviewerRole === "approver2"
      ? (liveAssessorAvg5 ?? storedApp2Avg5)
      : isSameAp1Ap2
      ? evalAp1Avg5
      : storedApp2Avg5;

  const selfTotal = selfAvg5 != null ? selfAvg5.toFixed(2) : "—";
  const app1Total = evalAp1Avg5 != null ? evalAp1Avg5.toFixed(2) : "—";
  const assessorTotal = msAssessorRated > 0
    ? (liveAssessorAvg5 ?? 0).toFixed(2)
    : "—";

  const activeSummaryAvgs = [selfAvg5, evalAp1Avg5, evalAp2Avg5].filter((v): v is number => v != null && v > 0);
  const combinedAvg5 = activeSummaryAvgs.length > 0 ? activeSummaryAvgs.reduce((s, v) => s + v, 0) / activeSummaryAvgs.length : null;
  const konversiPct = combinedAvg5 != null ? (combinedAvg5 / 5) * 100 : null;
  const skorFinalPct = combinedAvg5 != null ? (combinedAvg5 / 5) * PERCENTAGE : null;
  const shouldShowMsSummary = Boolean(readOnlyView || submitted || (msItems.length > 0 && msAssessorRated === msItems.length));

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
        <span className="text-xs bg-[#C69A45] text-white px-3 py-1 rounded font-semibold">({PERCENTAGE}%) Nilai Rata-Rata</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-10">No</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">Kompetensi Manajerial</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-52">Indikator Penilaian</th>
                {isAdminGlobalInspector ? (
                  <>
                    <th className="py-3 px-4 text-center font-semibold text-[#1A284F] border-r border-gray-200 w-56">
                      <div>Evaluasi Pribadi Karyawan</div>
                      <div className="flex justify-around mt-1 text-gray-400 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-indigo-700 border-r border-gray-200 w-56">
                      <div>Evaluasi Approver 1</div>
                      <div className="flex justify-around mt-1 text-indigo-300 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center font-semibold text-teal-700 w-56">
                      <div>Evaluasi Approver 2</div>
                      <div className="flex justify-around mt-1 text-teal-300 font-normal text-xs">
                        {[1,2,3,4,5].map(n => <span key={n} className="w-9 text-center">{n}</span>)}
                      </div>
                    </th>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {msItems.map((item) => {
                const selfVal     = selfRatings[item.no] ?? null;
                const app1Val     = firstRatings[item.no] ?? null;
                const app2Val     = secondRatingsStored[item.no] ?? (isSameAp1Ap2 ? app1Val : null);
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
                    {isAdminGlobalInspector ? (
                      <>
                        <td className="py-3 px-4 border-r border-gray-100 align-middle">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={selfVal === n} color="navy" />
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 border-r border-gray-100 align-middle bg-indigo-50/20">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={app1Val === n} color="indigo" />
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-middle bg-teal-50/20">
                          <div className="flex items-center justify-around">
                            {[1,2,3,4,5].map(n => (
                              <ReadOnlyScore key={n} value={n} active={app2Val === n} color="teal" />
                            ))}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
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
                      </>
                    )}
                  </tr>
                );
              })}
              <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                <td colSpan={3} className="py-3 px-4 text-sm text-gray-800 border-r border-gray-200 text-right">
                  ({PERCENTAGE}%) Nilai Rata-Rata <span className="text-xs text-gray-400 font-normal">(maks 5.00)</span>
                </td>
                {isAdminGlobalInspector ? (
                  <>
                    <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                    <td className="py-3 px-4 text-center text-indigo-600 border-r border-gray-100">{app1Total}</td>
                    <td className="py-3 px-4 text-center text-teal-600">{evalAp2Avg5 != null ? evalAp2Avg5.toFixed(2) : "—"}</td>
                  </>
                ) : (
                  <>
                    <td className="py-3 px-4 text-center text-[#1A284F] border-r border-gray-100">{selfTotal}</td>
                    {showApp1 && <td className="py-3 px-4 text-center text-blue-600 border-r border-gray-100">{app1Total}</td>}
                    <td className={`py-3 px-4 text-center ${assessorColor === "indigo" ? "text-indigo-600 bg-indigo-50/20" : "text-teal-600 bg-teal-50/20"}`}>{assessorTotal}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {!submitted && !readOnlyView && msAssessorRated < msItems.length && (
        <div className="rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-3 text-xs text-teal-800 flex items-center justify-between gap-3">
          <span>
            Lengkapi seluruh penilaian kompetensi manajerial ({msAssessorRated}/{msItems.length}) untuk menampilkan <strong>Managerial Skill Summary</strong> sebelum klik Assessed.
          </span>
          <span className="font-bold tabular-nums text-teal-700 shrink-0">
            {msAssessorRated}/{msItems.length} dinilai
          </span>
        </div>
      )}

      {/* Managerial Skill Summary — muncul otomatis saat seluruh item selesai dinilai */}
      {shouldShowMsSummary && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-[#1A284F] px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-white">Managerial Skill Summary</span>
            <span className="text-xs bg-[#C69A45] text-white px-3 py-1 rounded font-semibold">Ringkasan Penilaian</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="py-3 px-5 text-left border-r border-gray-200 w-52">Kompetensi</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200">Bobot</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200">Evaluasi Pribadi Karyawan</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-indigo-600">Evaluasi Approver 1</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-teal-600">Evaluasi Approver 2</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-amber-700 bg-amber-50/60">Aktual</th>
                  <th className="py-3 px-5 text-center border-r border-gray-200 text-purple-700 bg-purple-50/60">Konversi Nilai</th>
                  <th className="py-3 px-5 text-center text-green-700 bg-green-50/60">Skor Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50/40">
                  <td className="py-3 px-5 font-semibold text-gray-800 border-r border-gray-100">
                    Managerial Skills ({msCount} Indikator)
                  </td>
                  <td className="py-3 px-5 text-center text-gray-500 border-r border-gray-100 font-medium">{PERCENTAGE}%</td>
                  <td className="py-3 px-5 text-center text-[#1A284F] font-bold border-r border-gray-100">
                    {selfAvg5 != null ? selfAvg5.toFixed(2) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`py-3 px-5 text-center text-indigo-600 font-bold border-r border-gray-100 ${reviewerRole === "approver1" ? "bg-indigo-50/20" : ""}`}>
                    {evalAp1Avg5 != null ? evalAp1Avg5.toFixed(2) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`py-3 px-5 text-center text-teal-600 font-bold border-r border-gray-100 ${reviewerRole === "approver2" || isSameAp1Ap2 ? "bg-teal-50/20" : ""}`}>
                    {evalAp2Avg5 != null ? evalAp2Avg5.toFixed(2) : "0"}
                  </td>
                  <td className="py-3 px-5 text-center font-bold border-r border-gray-200 text-amber-700 bg-amber-50/40">
                    {combinedAvg5 != null ? combinedAvg5.toFixed(2) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-3 px-5 text-center font-bold border-r border-gray-200 text-purple-700 bg-purple-50/40">
                    {konversiPct != null ? `${konversiPct.toFixed(2)}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-3 px-5 text-center font-bold text-green-700 bg-green-50/40">
                    {skorFinalPct != null ? `${skorFinalPct.toFixed(2)}%` : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
                <tr className="bg-[#1A284F]/5 border-t-2 border-[#1A284F]/20 font-bold">
                  <td className="py-3.5 px-5 text-sm text-[#1A284F] border-r border-gray-200" colSpan={2}>
                    Skor Pencapaian
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-[#1A284F] text-white text-sm font-black">
                      {selfAvg5 != null ? selfAvg5.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-indigo-600 text-white text-sm font-black">
                      {evalAp1Avg5 != null ? evalAp1Avg5.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-100">
                    <span className="inline-block px-3 py-1 rounded-lg bg-teal-600 text-white text-sm font-black">
                      {evalAp2Avg5 != null ? evalAp2Avg5.toFixed(2) : "0"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-200 bg-amber-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-amber-500 text-white text-sm font-black">
                      {combinedAvg5 != null ? combinedAvg5.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center border-r border-gray-200 bg-purple-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-purple-600 text-white text-sm font-black">
                      {konversiPct != null ? `${konversiPct.toFixed(2)}%` : "—"}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center bg-green-50/60">
                    <span className="inline-block px-3 py-1 rounded-lg bg-green-600 text-white text-sm font-black">
                      {skorFinalPct != null ? `${skorFinalPct.toFixed(2)}%` : "—"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
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
  const masterAppraisalForms = loadMasterAppraisalForms();
  const isFullyAssessed =
    row.status === "Assessed-Approver 2" ||
    (row.type === "Appraisal Form" && row.status === "Approved");
  const activeUser = getActiveUser();
  const allUsers = loadManagedUsers();
  const normEmpId = normalizeEmployeeId(row.employeeId);
  const ownerUser = allUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normEmpId ||
      u.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase(),
  );
  const ap1User = resolveUserByRef(allUsers, ownerUser?.regNoAp1);
  const ap2User = resolveUserByRef(allUsers, ownerUser?.regNoAp2);
  const wfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.phase === "measurement" &&
      r.module === row.type &&
      r.employeeId === normEmpId,
  );
  const ap1DisplayName =
    wfRec?.decisions.approver1?.approverName || ap1User?.name || ownerUser?.regNoAp1 || "Approver 1";
  const ap2DisplayName =
    wfRec?.decisions.approver2?.approverName || ap2User?.name || ownerUser?.regNoAp2 || "Approver 2";

  const workflowStage: WorkflowStageRole = row.workflowStageForRow ?? reviewerRole;
  const isFourStepType = row.type === "KPI" || row.type === "SMART Goals" || row.type === "RCA";
  const isCheckerStage = isFourStepType && workflowStage === "checker";
  const isValidatorStage = isFourStepType && workflowStage === "validator";

  const kpiEmpComments = row.type === "KPI" ? loadKPICommentsForEmployee(row.employeeId) : {};
  const kpiRowComments = row.type === "KPI" ? loadKPIComments(row.no) : {};
  const prevA1CommentText =
    wfRec?.decisions.approver1?.note ||
    wfRec?.assessments.approver1?.comments?.["0"] ||
    kpiEmpComments.approver1?.text ||
    kpiRowComments.approver1?.text ||
    "";
  const prevA1CommentDate =
    wfRec?.decisions.approver1?.date ||
    wfRec?.assessments.approver1?.date ||
    kpiEmpComments.approver1?.date ||
    kpiRowComments.approver1?.date ||
    "—";
  const prevA2CommentText =
    wfRec?.decisions.approver2?.note ||
    wfRec?.assessments.approver2?.comments?.["0"] ||
    kpiEmpComments.approver2?.text ||
    kpiRowComments.approver2?.text ||
    "";
  const prevA2CommentDate =
    wfRec?.decisions.approver2?.date ||
    wfRec?.assessments.approver2?.date ||
    kpiEmpComments.approver2?.date ||
    kpiRowComments.approver2?.date ||
    "—";

  const [step, setStep]                     = useState<"review" | "revision">("review");
  const [revisionNote, setRevisionNote]     = useState("");
  const [assessorRatings, setAssessorRatings] = useState<Record<string, number>>(() => {
    // Saat membuka pengajuan berstatus Pending untuk dinilai, mulai dari kosong agar cache lama tidak langsung memenuhi Form C
    if (!readOnly && row.status === "Pending") {
      return {};
    }
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
    if (workflowStage === "approver1" && prevA1CommentText) return { 0: prevA1CommentText };
    if (workflowStage === "approver2" && prevA2CommentText) return { 0: prevA2CommentText };
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
  const [submitTooltipPinned, setSubmitTooltipPinned] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRevisionConfirm, setShowRevisionConfirm] = useState(false);
  const [indicatorItem, setIndicatorItem]   = useState<FormItem | MSItem | null>(null);
  const [activeForm, setActiveForm]         = useState<"A" | "B" | "C">("A");

  const hasAssessment = needsAssessment(row.type);
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
      const ciList = loadCheckInEntries(row.employeeId);
      return (
        ownerGoalsForCheck.every((g) => {
          const ci = ciList.find((e) => e.goalId === g.id);
          const inv = Boolean(ci?.inappropriateEvidenceByRole?.[reviewerRole]);
          const b = computeSmartGoalApproverScoreBounds(ci, inv);
          if (b.max === 0) return true;
          const val = assessorRatings[`sg-${g.id}`];
          return val != null && val >= b.min && val <= b.max;
        }) &&
        isApproverCommentFilled
      );
    }
    if (!hasAssessment) return isApproverCommentFilled;
    if (row.type === "Managerial Skill") {
      return MS_ITEMS.every((item) => assessorRatings[`ms-${item.no}`] != null) && isApproverCommentFilled;
    }
    // Appraisal Form: all three forms (A, B, C) must be fully assessed
    return (
      masterAppraisalForms.every((f) =>
        f.items.every((item) => (assessorRatings[`${f.id}-${item.no}`] ?? assessorRatings[`${f.id}__${item.no}`]) != null)
      ) && isApproverCommentFilled
    );
  })();

  // Per-form completion for hint text
  const formCompletion = masterAppraisalForms.reduce<Record<string, boolean>>((acc, f) => {
    acc[f.id] = f.items.every((item) => (assessorRatings[`${f.id}-${item.no}`] ?? assessorRatings[`${f.id}__${item.no}`]) != null);
    return acc;
  }, {});

  // Rincian alasan mengapa tombol Submit Assessment belum bisa disubmit (muncul di tooltip saat hover maupun klik)
  const missingSubmitAssessmentReasons = (() => {
    if (!hasAssessment || isCheckerStage || isValidatorStage) return [] as string[];
    const reasons: string[] = [];
    if (row.type === "Appraisal Form") {
      for (const f of masterAppraisalForms) {
        const missingCount = f.items.filter((item) => (assessorRatings[`${f.id}-${item.no}`] ?? assessorRatings[`${f.id}__${item.no}`]) == null).length;
        if (missingCount > 0) {
          reasons.push(`${f.tab}: ${missingCount} item evaluasi belum dinilai`);
        }
      }
    } else if (row.type === "Managerial Skill") {
      const missingCount = MS_ITEMS.filter((item) => assessorRatings[`ms-${item.no}`] == null).length;
      if (missingCount > 0) {
        reasons.push(`${missingCount} item kompetensi manajerial belum dinilai`);
      }
    } else if (row.type === "SMART Goals") {
      const ciList = loadCheckInEntries(row.employeeId);
      for (const g of ownerGoalsForCheck) {
        const ci = ciList.find((e) => e.goalId === g.id);
        const inv = Boolean(ci?.inappropriateEvidenceByRole?.[reviewerRole]);
        const b = computeSmartGoalApproverScoreBounds(ci, inv);
        if (b.max === 0) continue;
        const val = assessorRatings[`sg-${g.id}`];
        if (val == null) {
          reasons.push(`${g.label}: nilai belum diisi (${b.label})`);
        } else if (val < b.min || val > b.max) {
          reasons.push(`${g.label}: nilai ${val}% harus berada pada rentang ${b.label}`);
        }
      }
    }
    if (!isApproverCommentFilled) {
      reasons.push("Komentar & Catatan Approver belum diisi (wajib)");
    }
    return reasons;
  })();


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
    if (row.type === "KPI")             return <KPIReview row={row} />;
    if (row.type === "SMART Goals")     return (
      <SmartGoalsApproverReview
        assessorRatings={assessorRatings}
        onRate={handleRate}
        submitted={assessmentSubmitted || effectiveReadOnly}
        reviewerRole={reviewerRole}
        workflowStage={workflowStage}
        ap1Name={ap1DisplayName}
        ap2Name={ap2DisplayName}
        comments={smartComments}
        onComment={(id, text) => { if (!effectiveReadOnly) setSmartComments((prev) => ({ ...prev, [id]: text })); }}
        employeeId={row.employeeId}
        rowNo={row.no}
        position={row.position}
        companyUnit={row.companyUnit}
      />
    );
    if (row.type === "Project")          return <ProjectReview employeeId={row.employeeId} />;
    if (row.type === "Appraisal Form")   return <AppraisalFormReview {...sharedProps} readOnlyView={effectiveReadOnly} assessmentSubmitted={assessmentSubmitted} />;
    if (row.type === "Managerial Skill") return <ManagerialSkillReview {...sharedProps} readOnlyView={effectiveReadOnly} />;
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
          {isCheckerStage ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-200">
              Checker (HR Unit)
            </span>
          ) : isValidatorStage ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200">
              Validator (HR ICF)
            </span>
          ) : workflowStage === "approver1" ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
              Approver 1 ({ap1DisplayName})
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-200">
              Approver 2 ({ap2DisplayName})
            </span>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {step === "review" ? (
          <div className="px-8 py-8 space-y-6">
            {/* Riwayat Revisi jika ada */}
            {(wfRec?.revisionHistory?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-orange-800">
                  <RotateCcw className="w-4 h-4 text-orange-600" />
                  <span>Riwayat Catatan Revisi ({wfRec!.revisionHistory!.length})</span>
                </div>
                <div className="space-y-1.5">
                  {wfRec!.revisionHistory!.map((rev, idx) => (
                    <div key={idx} className="bg-white border border-orange-100 rounded-lg px-3.5 py-2 text-xs flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-gray-800">{rev.role} — {rev.approverName}: </span>
                        <span className="text-gray-700">{rev.note}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{normalizeDateDDMMYYYY(rev.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {renderContent()}

            {/* Komentar & History Komentar Approver (untuk modul selain SMART Goals, dan DISEMBUNYIKAN pada Checker HR Unit) */}
            {row.type !== "SMART Goals" && !isCheckerStage && (
              <div className="space-y-4">
                {/* History Komentar Approver 1 — tampil untuk Approver 2 dan Validator HR ICF (untuk KPI sudah tampil terkelompok per bulan di History Catatan Approver di atas) */}
                {row.type !== "KPI" && (workflowStage === "approver2" || isValidatorStage) && (
                  <div className="border border-blue-200 rounded-2xl overflow-hidden bg-blue-50/40 shadow-sm">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-blue-50 border-b border-blue-100">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-xs font-bold text-blue-800">
                          History Komentar / Catatan Approver 1 — {ap1DisplayName}
                        </span>
                      </div>
                      <span className="text-[10px] text-blue-500 font-medium">{normalizeDateDDMMYYYY(prevA1CommentDate)}</span>
                    </div>
                    <div className="p-4">
                      <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-white border-blue-100 text-gray-800">
                        {prevA1CommentText || <span className="text-gray-400 italic">Belum ada catatan dari Approver 1.</span>}
                      </p>
                    </div>
                  </div>
                )}

                {/* History Komentar Approver 2 — tampil untuk Validator HR ICF (atau saat Approver 1 melihat History setelah A2 selesai) */}
                {row.type !== "KPI" && (isValidatorStage || (workflowStage === "approver1" && effectiveReadOnly && Boolean(prevA2CommentText))) && (
                  <div className="border border-purple-200 rounded-2xl overflow-hidden bg-purple-50/40 shadow-sm">
                    <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-purple-50 border-b border-purple-100">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-xs font-bold text-purple-800">
                          History Komentar / Catatan Approver 2 — {ap2DisplayName}
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-500 font-medium">{normalizeDateDDMMYYYY(prevA2CommentDate)}</span>
                    </div>
                    <div className="p-4">
                      <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-white border-purple-100 text-gray-800">
                        {prevA2CommentText || <span className="text-gray-400 italic">Belum ada catatan dari Approver 2.</span>}
                      </p>
                    </div>
                  </div>
                )}

                {/* Input Komentar (HANYA 1 field untuk masing-masing Approver 1 / Approver 2; Validator TIDAK memiliki field input komentar) */}
                {!isValidatorStage && (
                  <div className="border border-indigo-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-2.5 flex items-center gap-2 bg-indigo-50">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="text-xs font-bold text-indigo-700">
                        Komentar &amp; Catatan {workflowStage === "approver1" ? `Approver 1 (${ap1DisplayName})` : `Approver 2 (${ap2DisplayName})`}{" "}
                        {!effectiveReadOnly && <span className="text-rose-500">* (Wajib Diisi)</span>}
                      </span>
                    </div>
                    <div className="p-4">
                      {effectiveReadOnly || assessmentSubmitted ? (
                        <p className="text-xs leading-relaxed rounded-xl px-4 py-3 border bg-indigo-50/40 border-indigo-100 text-indigo-900">
                          {(smartComments[0] || (workflowStage === "approver1" ? prevA1CommentText : prevA2CommentText)) || (
                            <span className="text-gray-400 italic">Tidak ada komentar.</span>
                          )}
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
                        {masterAppraisalForms.filter((f) => !formCompletion[f.id]).map((f) => (
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
                  <div
                    className="relative group/submit-assess"
                    onMouseLeave={() => setSubmitTooltipPinned(false)}
                  >
                    <button
                      type="button"
                      aria-disabled={!allFilled}
                      onClick={() => {
                        if (allFilled) {
                          setSubmitTooltipPinned(false);
                          setShowSubmitConfirm(true);
                          return;
                        }
                        setSubmitTooltipPinned(true);
                        if (row.type === "Appraisal Form") {
                          const firstIncompleteForm = FORMS.find((f) => !formCompletion[f.id]);
                          if (firstIncompleteForm) {
                            setActiveForm(firstIncompleteForm.id as "A" | "B" | "C");
                          } else if (!isApproverCommentFilled) {
                            document
                              .querySelector<HTMLTextAreaElement>('textarea[placeholder*="Wajib diisi"]')
                              ?.focus();
                          }
                        } else if (!isApproverCommentFilled) {
                          document
                            .querySelector<HTMLTextAreaElement>('textarea[placeholder*="Wajib diisi"]')
                            ?.focus();
                        }
                      }}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1A284F] text-white text-sm font-semibold transition-colors ${
                        allFilled ? "hover:bg-[#131d3b]" : "opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      Submit Assessment
                    </button>
                    {!allFilled && missingSubmitAssessmentReasons.length > 0 && (
                      <div
                        role="tooltip"
                        className={`pointer-events-none absolute bottom-full right-0 z-50 mb-2.5 w-80 rounded-xl bg-[#1A284F] p-3.5 text-left text-xs text-white shadow-2xl transition-all ${
                          submitTooltipPinned
                            ? "visible opacity-100 translate-y-0"
                            : "invisible opacity-0 translate-y-1 group-hover/submit-assess:visible group-hover/submit-assess:opacity-100 group-hover/submit-assess:translate-y-0 group-focus-within/submit-assess:visible group-focus-within/submit-assess:opacity-100"
                        }`}
                      >
                        <p className="font-bold text-amber-300 mb-1.5 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Belum dapat Submit Assessment:
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-[11px] text-white/90 leading-relaxed">
                          {missingSubmitAssessmentReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
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
                  const commentNote = !isCheckerStage && !isValidatorStage ? (smartComments[0] ?? "").trim() : undefined;
                  const todayStr = formatTodayDDMMYYYY();
                  if (row.type === "SMART Goals" && !isCheckerStage && !isValidatorStage) {
                    const commentsToSave = Object.fromEntries(Object.entries(smartComments).map(([k, v]) => [k, v]));
                    saveAssessment(row.no, reviewerRole, row.type, assessorRatings, commentsToSave, todayStr);
                  } else if (!isCheckerStage && !isValidatorStage && commentNote) {
                    saveAssessment(row.no, reviewerRole, row.type, assessorRatings, { "0": commentNote }, todayStr);
                    if (row.type === "KPI") {
                      saveKPIComment(row.no, reviewerRole, commentNote, activeUser.name, row.employeeId);
                    }
                  }
                  onApprove(commentNote);
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
                  const commentNote = (smartComments[0] ?? "").trim();
                  const commentsToSave: Record<string, string> = Object.fromEntries(
                    Object.entries(smartComments).map(([k, v]) => [k, v]),
                  );
                  saveAssessment(row.no, reviewerRole, row.type, assessorRatings, commentsToSave, formatTodayDDMMYYYY());
                  onAssessed(commentNote);
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
