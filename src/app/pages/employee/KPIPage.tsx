// @refresh reset
import React, { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { DatePickerID } from "../../components/DatePickerID";
import { Plus, X, Eye, Send, CheckCircle2, Edit3, Upload, FileText, Paperclip, AlertTriangle, MessageSquare, ChevronDown, ChevronUp, Lock, LockOpen, FileEdit, UserCircle2, ArrowLeft, Info } from "lucide-react";
import { loadAllKPIComments, loadKPICommentsForEmployee } from "../shared/kpiCommentsStore";
import { saveEvidenceFiles, loadEvidenceFiles } from "../shared/kpiEvidenceStore";
import type { StoredEvidenceFile } from "../shared/kpiEvidenceStore";
import { ApproverNotesHistory } from "../../components/ApproverNotesHistory";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { saveRCASubmission, loadRCASubmissions, submitRCAsForMonths } from "../shared/rcaStore";
import type { StoredMasalahBlock, StoredRCASubmission, StoredRCAActionPlan } from "../shared/rcaStore";
import ExportImportButton from "../../components/ExportImportButton";
import { DualScrollTableContainer } from "../../components/DualScrollTableContainer";
import {
  dispatchTableFullscreen,
  getKpiTableScaleClasses,
  KpiTableDisplayControls,
  type KpiTableScale,
} from "../../components/KpiTableDisplayControls";
import { EXCEL_THEME, exportStyledXLSX, inferSystemCellStyle, parseXLSXMatrix, type StyledExcelCell, type StyledExcelMerge } from "../../utils/excelUtils";
import { loadPersistedState, mergeKvMapRecord, safeGetLocalRaw, safeSetLocalJson, savePersistedState, uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { pushEmployeeNotification } from "../../store/notificationStore";
import { DELEGATION_EVENT, getReceivedWorkspaceDelegations, type DelegationAccess } from "../../store/delegationStore";
import { DelegatedWorkspaceBanner } from "../../components/approval/DelegatedWorkspaceBanner";
import {
  getActiveUser,
  getGroupCompaniesForUnit,
  getGroupNameForUnit,
  isDirectorRoleOrGrouping,
  loadManagedUsers,
  useAuthStore,
  usesDemoSampleData,
  type ManagedUser,
} from "../../store/authStore";
import { getKpiMonthStatuses, loadWorkflowRecords, normalizeEmployeeId, readTrackedKpiMonthLabels, submitWorkflowModule, type KpiMonthState } from "../shared/appraisalWorkflowStore";
import { loadLiveModuleActivationList } from "../hr/ModuleActivation";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";

const MOCK_DEADLINE = "2026-06-30";

// ─── RCA Status helpers ────────────────────────────────────────────────────────

export type RCAStatus = "none" | "outstanding" | "closed";

function allActionPlans(sub: StoredRCASubmission): StoredRCAActionPlan[] {
  if (sub.masalahBlocks?.length) {
    return sub.masalahBlocks.flatMap((b) => b.actionPlans);
  }
  return sub.actionPlans;
}

/** Derive RCAStatus from an inline (in-memory) RCAEntry */
function inlineEntryToStatus(entry: RCAEntry): RCAStatus {
  const active = entry.actionPlans.filter((ap) => ap.status !== ("Dibatalkan" as string));
  if (!active.length) return "outstanding";
  return active.every((ap) => ap.status === "Selesai") ? "closed" : "outstanding";
}

/** Derive a 3-state status from a stored RCA submission */
function submissionToStatus(sub: StoredRCASubmission): RCAStatus {
  // Tag RCA tetap kuning (outstanding) sampai RCA benar-benar berstatus Closed
  return sub.approvalStatus === "Closed" ? "closed" : "outstanding";
}

/**
 * Build a map keyed by two strategies:
 *   primary  — sub.key          (e.g. "1__jan26" from KPIPage inline modal)
 *   secondary — kpiIndicator__periode (e.g. "HPP Produksi__Jan" from RCAPage)
 * KPIPage tag render checks primary first, then secondary.
 */
function buildStoredRCAStatusMap(subs: StoredRCASubmission[]): Record<string, RCAStatus> {
  const map: Record<string, RCAStatus> = {};
  for (const sub of subs) {
    const status = submissionToStatus(sub);
    map[sub.key] = status;
    // Secondary index: allows matching by KPI name + short month
    const secondaryKey = `${sub.kpiIndicator}__${sub.periode}`;
    if (secondaryKey !== sub.key) {
      // Don't overwrite a better (closed > outstanding) status from another entry
      const existing = map[secondaryKey];
      if (!existing || (existing === "none") || (existing === "outstanding" && status === "closed")) {
        map[secondaryKey] = status;
      }
    }
  }
  return map;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Polaritas = "Maximize" | "Minimize" | "Stabilize";
type PageView = "input" | "preview";

type ComputeSpec =
  | { type: "ratio"; actualIdx: number; targetIdx: number; minimize?: boolean }
  | { type: "avg"; sourceIdxs: number[] }
  | { type: "ref"; sourceIdx: number }
  | { type: "ratio_score"; negIdx: number; posIdx: number; multiplier: number }
  | { type: "inverse_ratio"; numIdx: number; denomIdx: number }
  | { type: "threshold"; actualIdx: number; target: number };

interface SubRow {
  label: string;
  bold?: boolean;
  compute?: ComputeSpec;
}

export interface KPIItem {
  no: string;
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  bobot: string;
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: Polaritas;
  detailFormula: string;
  keterangan: string;
  section: string;
  sectionLabel?: string;
  sectionBobot?: string;
  trackingPeriod?: string;
  subRows: SubRow[];
  /** Per-month target for simple KPIs (mapped to "Target" sub-row) */
  monthlyTargets?: Record<string, string>;
  /** Fixed target value per sub-row index for complex KPIs */
  subRowTargets?: Record<number, string>;
  /** When true, baseline/target/monthly cells use color bands instead of numbers */
  colorIndicator?: boolean;
  /** "ratio" enables the news-negative / news-positive ratio scoring mode */
  indicatorMode?: "numeric" | "color" | "ratio";
  /** Multiplier for ratio score (e.g. 6 for "6:1") */
  ratioMultiplier?: number;
  ratioPositiveLabel?: string;
  ratioNegativeLabel?: string;
}

// ─── Color Indicator helpers (KPI Tracking) ───────────────────────────────────

const KPI_COLOR_BANDS = [
  { value: "95%-100%",  color: "#16a34a", bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
  { value: "≥80%-<95%", color: "#b45309", bg: "#fefce8", border: "#fde047", dot: "#eab308" },
  { value: "<80%",      color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
] as const;

const KPI_BASELINE_COLORS = [
  { value: "Green",  color: "#16a34a", bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
  { value: "Yellow", color: "#b45309", bg: "#fefce8", border: "#fde047", dot: "#eab308" },
  { value: "Red",    color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
] as const;

function kpiColorBandMeta(v: string) { return KPI_COLOR_BANDS.find((o) => o.value === v); }
function kpiBaselineColorMeta(v: string) { return KPI_BASELINE_COLORS.find((o) => o.value === v); }

type CellKey = string; // `${kpiNo}__${subIdx}`

type StatusPerbaikan = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai";

interface RCAActionPlan {
  id: string;
  action: string;
  targetDate: string;
  pic: string;
  status: StatusPerbaikan;
  keterangan: string[];
  output: string[];
  evidence: string[];
}

interface RCAEntry {
  periode: string;
  kpi: string;
  satuan: string;
  baseline: string;
  target: string;
  actual: string;
  masalahUtama: string[];
  kenapaA: string;
  kenapaB: string;
  kenapaC: string;
  actionPlans: RCAActionPlan[];
}

// Keyed by `${kpiNo}__${monthId}`
type RCAMap = Record<string, RCAEntry>;

const RCA_STATUS_OPTIONS: StatusPerbaikan[] = [
  "Belum dilaksanakan", "Sedang dilaksanakan", "Selesai",
];

const RCA_STATUS_STYLE: Record<StatusPerbaikan, string> = {
  "Belum dilaksanakan": "bg-red-100 text-red-700",
  "Sedang dilaksanakan": "bg-yellow-100 text-yellow-700",
  "Selesai": "bg-green-100 text-green-700",
};

function newRCAAction(): RCAActionPlan {
  return { id: Math.random().toString(36).slice(2), action: "", targetDate: "", pic: "", status: "Belum dilaksanakan", keterangan: [], output: [], evidence: [] };
}

interface PendingRCA {
  rcaKey: string;
  kpiNo: string;
  subIdx?: number;
  monthId: string;
  monthLabel: string;
  kpiName: string;
  achievementPct: number;
  // auto-fill from KPI master + cellsMap
  satuan: string;
  baseline: string;
  target: string;
  /** Target tahunan dari kolom Target pada baris KPI di KPI Tracking */
  targetYearly: string;
  actual: string;
}

export interface MonthEntry {
  id: string;
  label: string;
  cells: Record<CellKey, string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ck = (no: string, subIdx: number): CellKey => `${no}__${subIdx}`;

function parseNum(s: string): number | null {
  if (!s || s === "—") return null;
  const clean = s.replace(/,/g, "").replace(/%$/, "").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function formatPct(n: number): string {
  return n.toFixed(1) + "%";
}

/**
 * Perhitungan persentase pencapaian sesuai Polaritas indikator (Maximize / Minimize / Stabilize)
 * agar tidak pernah memicu RCA yang salah:
 * - Minimize: actual <= target => 100%, actual > target => (target / actual) * 100
 * - Maximize: (actual / target) * 100 (bila target === 0: actual >= 0 => 100%, else 0%)
 * - Stabilize: mendukung target rentang "min - max" (100% selama di dalam rentang) maupun nilai tunggal T
 *   (100% bila tepat T; menurun proporsional bila deviasi di bawah maupun di atas T).
 */
export function computePolaritasAchievementPct(
  actual: number,
  targetRaw: string,
  targetNum: number,
  polaritas: Polaritas = "Maximize",
  specMinimize?: boolean,
): number {
  const effectivePol: Polaritas = specMinimize ? "Minimize" : polaritas;
  if (effectivePol === "Stabilize") {
    const rangeMatch = String(targetRaw ?? "")
      .replace(/,/g, "")
      .match(/^\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (rangeMatch) {
      const a = parseFloat(rangeMatch[1]);
      const b = parseFloat(rangeMatch[2]);
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (actual >= lo && actual <= hi) return 100;
      if (actual < lo) return lo === 0 ? 0 : Math.max(0, (actual / lo) * 100);
      return actual === 0 ? 0 : Math.max(0, (hi / actual) * 100);
    }
    if (targetNum === 0) return actual === 0 ? 100 : 0;
    if (actual === targetNum) return 100;
    if (actual < targetNum) return Math.max(0, (actual / targetNum) * 100);
    return actual === 0 ? 0 : Math.max(0, (targetNum / actual) * 100);
  }
  if (effectivePol === "Minimize") {
    if (targetNum === 0) return actual <= 0 ? 100 : 0;
    return actual <= targetNum ? 100 : Math.max(0, (targetNum / actual) * 100);
  }
  if (targetNum === 0) return actual >= 0 ? 100 : 0;
  return Math.max(0, (actual / targetNum) * 100);
}

/**
 * Metadata spesifik sub-item untuk KPI yang memiliki lebih dari 1 item dalam 1 baris perspektif/KPI
 * (contoh: KPI 3 memiliki Biaya Listrik & Biaya Steam; KPI 4a memiliki 4 item; KPI 4b memiliki 2 item).
 */
export function getKpiSubItemMeta(
  kpi: KPIItem,
  subIdx: number,
  monthId: string,
): {
  isMultiItem: boolean;
  rcaKey: string;
  legacyRcaKey: string;
  itemKpiName: string;
  subItemShortLabel: string;
  itemBaseline: string;
  itemTargetYearly: string;
} {
  const baseTitle = kpi.kpi.split("\n")[0].replace(/:\s*$/, "").trim();
  const legacyRcaKey = `${kpi.no}__${monthId}`;
  const nonAvgComputed = kpi.subRows
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => Boolean(s.compute && s.compute.type !== "avg"));
  const isMultiItem = nonAvgComputed.length > 1;
  const sub = kpi.subRows[subIdx];
  const spec = sub?.compute;
  if (!isMultiItem || !spec) {
    return {
      isMultiItem: false,
      rcaKey: legacyRcaKey,
      legacyRcaKey,
      itemKpiName: kpi.kpi.split("\n")[0].trim(),
      subItemShortLabel: baseTitle,
      itemBaseline: kpi.baseline2025,
      itemTargetYearly: kpi.target2026,
    };
  }
  let actualLabel = sub.label.replace(/^%\s*Pencapaian\s*/i, "").trim();
  let targetRowIdx = -1;
  if (spec.type === "ratio") {
    actualLabel = kpi.subRows[spec.actualIdx]?.label ?? actualLabel;
    targetRowIdx = spec.targetIdx;
  }
  const cleanSubLabel = actualLabel.replace(/^Actual\s+/i, "").trim();
  const itemKpiName = `${baseTitle} — ${actualLabel}`;
  // Coba baca baseline spesifik sub-item dari kolom keterangan bila tersedia (mis. "Listrik: 1,799.77")
  let itemBaseline = kpi.baseline2025;
  if (kpi.keterangan) {
    const lines = kpi.keterangan.split("\n");
    const token = cleanSubLabel.replace(/^Biaya\s+/i, "").replace(/^(Eff|IP)\s+/i, "").trim().toLowerCase();
    const matchedLine = lines.find((ln) => token && ln.toLowerCase().includes(`${token}:`));
    if (matchedLine) {
      const extracted = matchedLine.split(":").slice(1).join(":").trim();
      if (extracted && extracted !== "—") itemBaseline = extracted;
    }
  }
  // Target (Yearly) RCA = nilai kolom "Target" pada baris KPI (subject KPI) di tabel KPI Tracking
  void targetRowIdx;
  const itemTargetYearly = kpi.target2026;
  return {
    isMultiItem: true,
    rcaKey: `${kpi.no}__sub${subIdx}__${monthId}`,
    legacyRcaKey,
    itemKpiName,
    subItemShortLabel: actualLabel,
    itemBaseline,
    itemTargetYearly,
  };
}

export function findMatchingRcaForSubItem(
  submissions: StoredRCASubmission[],
  kpi: KPIItem,
  subIdx: number,
  month: { id: string; label: string },
): StoredRCASubmission | undefined {
  const meta = getKpiSubItemMeta(kpi, subIdx, month.id);
  const shortEn = month.label.replace(/-\d{2}$/, "").toLowerCase();
  const shortId = toIdShortPeriode(month.label).toLowerCase();
  const exactByKey = submissions.find((s) => s.key === meta.rcaKey);
  if (exactByKey) return exactByKey;
  const targetNameLc = meta.itemKpiName.trim().toLowerCase();
  const shortSubLc = meta.subItemShortLabel.trim().toLowerCase();
  const byNameAndMonth = submissions.find((s) => {
    const sMonthOk =
      (s.monthLabel ?? "").toLowerCase() === month.label.toLowerCase() ||
      s.periode.toLowerCase() === shortEn ||
      s.periode.toLowerCase() === shortId;
    if (!sMonthOk) return false;
    const ind = s.kpiIndicator.trim().toLowerCase();
    if (ind === targetNameLc) return true;
    if (meta.isMultiItem) {
      return Boolean(shortSubLc && ind === shortSubLc);
    }
    return ind === kpi.kpi.split("\n")[0].trim().toLowerCase();
  });
  if (byNameAndMonth) return byNameAndMonth;
  // Fallback ke key tanpa subIdx hanya untuk KPI single-item
  if (!meta.isMultiItem) {
    return submissions.find((s) => s.key === meta.legacyRcaKey);
  }
  return undefined;
}

// Compute a single cell value given sub-row specs and a value-getter
function computeCell(
  subRows: SubRow[],
  getRaw: (idx: number) => string,
  subIdx: number,
  polaritas: Polaritas = "Maximize"
): string {
  const sub = subRows[subIdx];
  if (!sub.compute) return "";

  const getVal = (idx: number): string => {
    const s = subRows[idx];
    if (s.compute) return computeCell(subRows, getRaw, idx, polaritas);
    return getRaw(idx);
  };

  const spec = sub.compute;

  if (spec.type === "ratio") {
    const rawTarget = getRaw(spec.targetIdx);
    const target = parseNum(rawTarget);
    const isRangeStabilize =
      polaritas === "Stabilize" && /^\s*-?\d+(?:\.\d+)?\s*[-–]\s*-?\d+(?:\.\d+)?\s*$/.test(rawTarget.replace(/,/g, ""));
    if (target === null && !isRangeStabilize) return "—"; // target belum diisi → tidak dapat dihitung
    const actual = parseNum(getRaw(spec.actualIdx));
    if (actual === null) return "0%";           // actual belum diisi → 0%
    const pct = computePolaritasAchievementPct(actual, rawTarget, target ?? 0, polaritas, spec.minimize);
    return formatPct(pct);
  }

  if (spec.type === "avg") {
    const vals = spec.sourceIdxs
      .map((i) => parseNum(getVal(i)))
      .filter((v): v is number => v !== null);
    if (!vals.length) return "—";
    return formatPct(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  if (spec.type === "ref") {
    return getVal(spec.sourceIdx);
  }

  if (spec.type === "ratio_score") {
    const negRaw = getRaw(spec.negIdx);
    if (!negRaw) return "—";
    const neg = parseNum(negRaw) ?? 0;
    const pos = parseNum(getRaw(spec.posIdx)) ?? 0;
    if (neg === 0) return "100%";
    return pos >= neg * spec.multiplier ? "100%" : "0%";
  }

  return "—";
}

// Compute the Total value for a sub-row across all months
export function computeTotal2026(
  kpi: KPIItem,
  subIdx: number,
  allCells: Record<string, Record<CellKey, string>>,
  months: MonthEntry[]
): string {
  const sub = kpi.subRows[subIdx];

  if (sub.compute) {
    // For computed rows, aggregate the source actual/target across months then recompute
    const spec = sub.compute;

    if (spec.type === "ratio") {
      // Only consider months that have a target configured
      const monthData = months
        .map((m) => {
          const target = parseNum(allCells[m.id]?.[ck(kpi.no, spec.targetIdx)] ?? "");
          if (target === null) return null;
          const actual = parseNum(allCells[m.id]?.[ck(kpi.no, spec.actualIdx)] ?? "");
          return { actual, target, hasActual: actual !== null };
        })
        .filter((v): v is { actual: number | null; target: number; hasActual: boolean } => v !== null);
      if (!monthData.length) return "—";

      // If any configured month has no actual → 0%
      if (monthData.some((v) => !v.hasActual)) return "0%";

      const actuals = monthData.map((v) => v.actual as number);

      if (!kpi.subRowTargets) {
        // Simple KPI: YTD actual / YTD target
        let ytdActual: number;
        let ytdTarget: number;
        if (kpi.formula === "Jumlah") {
          ytdActual = actuals.reduce((s, v) => s + v, 0);
          ytdTarget = monthData.reduce((s, v) => s + v.target, 0);
        } else {
          ytdActual = actuals.reduce((s, v) => s + v, 0) / actuals.length;
          ytdTarget = monthData.reduce((s, v) => s + v.target, 0) / monthData.length;
        }
        const pct = computePolaritasAchievementPct(ytdActual, String(ytdTarget), ytdTarget, kpi.polaritas, spec.minimize);
        return formatPct(pct);
      }

      // Complex KPI: sum actuals / sum targets
      const totalActual = actuals.reduce((s, v) => s + v, 0);
      const totalTarget = monthData.reduce((s, v) => s + v.target, 0);
      const pct = computePolaritasAchievementPct(totalActual, String(totalTarget), totalTarget, kpi.polaritas, spec.minimize);
      return formatPct(pct);
    }

    if (spec.type === "avg") {
      // Check if any source ratio sub-row has a missing actual in any configured month
      const anyMissingActual = spec.sourceIdxs.some((i) => {
        const srcSub = kpi.subRows[i];
        if (!srcSub.compute || srcSub.compute.type !== "ratio") return false;
        const rs = srcSub.compute;
        return months.some((m) => {
          const target = parseNum(allCells[m.id]?.[ck(kpi.no, rs.targetIdx)] ?? "");
          if (target === null) return false; // month not configured → skip
          return parseNum(allCells[m.id]?.[ck(kpi.no, rs.actualIdx)] ?? "") === null;
        });
      });
      if (anyMissingActual) return "0%";

      const vals = spec.sourceIdxs
        .map((i) => parseNum(computeTotal2026(kpi, i, allCells, months)))
        .filter((v): v is number => v !== null);
      if (!vals.length) return "—";
      return formatPct(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    if (spec.type === "ref") {
      return computeTotal2026(kpi, spec.sourceIdx, allCells, months);
    }

    if (spec.type === "ratio_score") {
      const scores = months
        .map((m): number | null => {
          const negRaw = allCells[m.id]?.[ck(kpi.no, spec.negIdx)] ?? "";
          if (!negRaw) return null;
          const neg = parseNum(negRaw) ?? 0;
          const pos = parseNum(allCells[m.id]?.[ck(kpi.no, spec.posIdx)] ?? "") ?? 0;
          return (neg === 0 || pos >= neg * spec.multiplier) ? 100 : 0;
        })
        .filter((v): v is number => v !== null);
      if (!scores.length) return "—";
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return formatPct(avg);
    }

    return "—";
  }

  // Editable rows: aggregate raw values
  const isTargetRow = sub.label.toLowerCase().startsWith("target");
  const rawVals = months.map((m) => parseNum(allCells[m.id]?.[ck(kpi.no, subIdx)] ?? ""));

  if (!isTargetRow && months.length > 0 && rawVals.some((v) => v === null)) {
    // Actual row: any month has no data → total = 0
    return "0";
  }

  const vals = rawVals.filter((v): v is number => v !== null);
  if (!vals.length) return "—";

  if (kpi.formula === "Jumlah") {
    return vals.reduce((a, b) => a + b, 0).toFixed(2).replace(/\.?0+$/, "");
  }
  if (kpi.formula === "Nilai Akhir") {
    // Nilai Akhir → nilai bulan terakhir yang terisi
    return vals[vals.length - 1].toFixed(2).replace(/\.?0+$/, "");
  }
  // Rata-Rata → average
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2).replace(/\.?0+$/, "");
}

// Compute achievement % for a KPI based on its final % Pencapaian sub-row.
// Returns the raw total value (may exceed 100). Cap at 100 only when weighting.
export function computeKPIAchievement(
  kpi: KPIItem,
  allCells: Record<string, Record<CellKey, string>>,
  months: MonthEntry[]
): number | null {
  let finalIdx = -1;
  kpi.subRows.forEach((sub, i) => { if (sub.compute && sub.bold) finalIdx = i; });
  if (finalIdx === -1) return null;
  const val = computeTotal2026(kpi, finalIdx, allCells, months);
  const n = parseNum(val);
  if (n === null) return null;
  return n; // raw — caller caps at 100 for bobot multiplication
}

export function parseBobotDecimal(bobot: string): number {
  return parseFloat(bobot.replace("%", "").trim()) / 100;
}

// ─── KPI Tracking localStorage persistence ────────────────────────────────────

const KPI_STORE_KEY = "kpi_tracking_v1";
const KPI_SUBMIT_KEY = "kpi_tracking_submit_v1";

function getRolePrefix(): string {
  const p = window.location.pathname;
  if (p.startsWith("/supervisor")) return "supervisor";
  if (p.startsWith("/staff")) return "staff";
  return "employee";
}

function loadSubmitState(employeeId?: string): { submitted: boolean; submittedDate: string } {
  try {
    const targetEmpId = employeeId ?? getActiveUser().employeeId;
    const normId = normalizeEmployeeId(targetEmpId);
    const wfRec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "KPI" &&
        r.phase === "measurement" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === targetEmpId.toLowerCase()),
    );
    if (wfRec) {
      const evalState = evaluateEmployeeKPITracking(targetEmpId);
      // Jika belum ada bulan aktual yang diisi sama sekali atau belum ada submittedDate yang sah, jangan pernah anggap Submitted
      if (!evalState.hasAnyTrackingData || !wfRec.submittedDate || wfRec.submittedDate === "-" || wfRec.submittedDate === "—") {
        return { submitted: false, submittedDate: "" };
      }
      const isRev = Object.values(wfRec.decisions).some((d) => d?.status === "Revision");
      const isValidated = wfRec.decisions.validator?.status === "Validated";
      const hasUnvalidatedMonth =
        isValidated &&
        Array.isArray(wfRec.validatedMonths) &&
        readTrackedKpiMonthLabels(targetEmpId).some((m) => !wfRec.validatedMonths!.includes(m));
      const hasUnsubmittedNewMonth =
        !isValidated &&
        Array.isArray(wfRec.submittedMonths) &&
        wfRec.submittedMonths.length > 0 &&
        readTrackedKpiMonthLabels(targetEmpId).some(
          (m) => !wfRec.submittedMonths!.includes(m) && !(wfRec.validatedMonths ?? []).includes(m),
        );
      if (isRev || hasUnvalidatedMonth || hasUnsubmittedNewMonth) {
        return { submitted: false, submittedDate: wfRec.submittedDate || "" };
      }
      return { submitted: true, submittedDate: wfRec.submittedDate || "" };
    }
  } catch { /* ignore */ }
  return { submitted: false, submittedDate: "" };
}

function saveSubmitState(submitted: boolean, submittedDate: string, employeeId?: string): void {
  try {
    const targetEmpId = employeeId ?? getActiveUser().employeeId;
    const normId = normalizeEmployeeId(targetEmpId);
    savePersistedState(
      `${KPI_SUBMIT_KEY}_${normId}`,
      { submitted, submittedDate },
    );
  } catch { /* ignore */ }
}

export interface KPITrackingSnapshot {
  months: MonthEntry[];
  cellsMap: Record<string, Record<CellKey, string>>;
}

export function saveKPITracking(data: KPITrackingSnapshot, ownerOverride?: { employeeId: string; name: string }): void {
  try {
    const actor = getActiveUser();
    const owner = ownerOverride ?? actor;
    const normId = normalizeEmployeeId(owner.employeeId);
    const isDelegated = normId !== normalizeEmployeeId(actor.employeeId);
    const actorLabel = isDelegated ? `${actor.name} | atas nama ${owner.name}` : actor.name;
    savePersistedState(`${KPI_STORE_KEY}_${normId}`, data, {
      kind: "kpi-tracking",
      docKey: `${owner.employeeId}:2026`,
      employeeId: owner.employeeId,
      period: "2026",
      months: data.months,
      cellsMap: data.cellsMap,
      comments: loadAllKPIComments(),
      audit: {
        userId: actor.employeeId,
        userName: actorLabel,
        action: "Update",
        module: "KPI",
        subModule: "KPI Tracking",
        description: `Updated KPI Tracking realization for ${owner.name} (${owner.employeeId}) by ${actorLabel}`,
      },
    });
  } catch { /* ignore */ }
}

export const FULL_YEAR_KPI_MONTHS = [
  "Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26",
  "Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26",
] as const;

export interface EmployeeKPITrackingEvaluation {
  months: MonthEntry[];
  cellsMap: Record<string, Record<CellKey, string>>;
  trackedMonthsCount: number;
  isFullYearMonthsComplete: boolean;
  ytdScore: number;
  hasAnyTrackingData: boolean;
  totalKPI: number;
  trackedKpiCount: number;
}

/** Apakah karyawan sudah pernah bertransaksi KPI (Setting/Measurement) di backend. */
export function ownerHasKpiTransactions(employeeId: string): boolean {
  const normId = normalizeEmployeeId(employeeId);
  try {
    const snapRaw = localStorage.getItem(`${KPI_STORE_KEY}_${normId}`);
    const snap = snapRaw ? (JSON.parse(snapRaw) as KPITrackingSnapshot) : null;
    if (snap && Array.isArray(snap.months) && snap.months.length > 0) return true;
    const setRaw = localStorage.getItem("pa_kpi_setting_by_emp_v2");
    const setMap = setRaw ? (JSON.parse(setRaw) as Record<string, unknown[]>) : {};
    if (Array.isArray(setMap[normId]) && setMap[normId].length > 0) return true;
  } catch {
    // ignore
  }
  return loadWorkflowRecords().some(
    (r) => r.module === "KPI" && normalizeEmployeeId(r.employeeId) === normId,
  );
}

function deriveTrackingPeriodeLabel(satuan?: string, trackingPeriod?: string): string {
  const s = String(satuan ?? "");
  const idx = s.indexOf("/");
  if (idx >= 0) {
    const raw = s.slice(idx + 1).trim();
    if (raw) {
      if (/^bulan$/i.test(raw)) return "Bulan";
      if (/^tahun$/i.test(raw)) return "Tahun";
      return raw;
    }
  }
  return trackingPeriod || "Bulan";
}

export function mapStoredSettingRowsToTrackingItems(rows: Array<Record<string, unknown>>): KPIItem[] {
  return rows.map((r, idx) => ({
    no: String(r.no ?? idx + 1),
    section: String(r.section ?? "A").toUpperCase() || "A",
    sectionLabel: r.sectionLabel ? String(r.sectionLabel) : undefined,
    sectionBobot: r.sectionBobot ? String(r.sectionBobot) : undefined,
    trackingPeriod: deriveTrackingPeriodeLabel(String(r.satuan ?? ""), r.trackingPeriod ? String(r.trackingPeriod) : undefined),
    perspektif: String(r.perspektif ?? "Proses"),
    kpi: String(r.kpi ?? ""),
    satuan: String(r.satuan ?? "%"),
    formula: String(r.formula ?? "Jumlah"),
    bobot: String(r.bobot ?? "0%"),
    definisi: String(r.definisi ?? ""),
    source: String(r.source ?? ""),
    baseline2025: String(r.baseline2025 ?? ""),
    target2026: String(r.target2026 ?? ""),
    polaritas: (String(r.polaritas ?? "Maximize") as Polaritas),
    detailFormula: String(r.detailFormula ?? ""),
    keterangan: String(r.keterangan ?? ""),
    subRows: mkSimple(String(r.polaritas ?? "") === "Minimize"),
    monthlyTargets: (r.monthlyTargets as Record<string, string>) ?? {},
    colorIndicator: Boolean(r.colorIndicator),
    indicatorMode: (r.indicatorMode as KPIItem["indicatorMode"]) ?? "numeric",
  }));
}

export function resolveEmployeeTrackingKpiItems(employeeId: string): KPIItem[] {
  try {
    const normId = normalizeEmployeeId(employeeId);
    const rawSet = localStorage.getItem("pa_kpi_setting_by_emp_v2");
    const setMap = rawSet ? (JSON.parse(rawSet) as Record<string, Array<Record<string, unknown>>>) : {};
    const empItems = setMap[normId] ?? setMap[employeeId];
    if (Array.isArray(empItems) && empItems.length > 0) {
      return mapStoredSettingRowsToTrackingItems(empItems);
    }
  } catch {
    // ignore
  }
  return KPI_ITEMS;
}

export function loadKPITracking(employeeId?: string): KPITrackingSnapshot {
  try {
    const activeUser = getActiveUser();
    const targetEmpId = employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(targetEmpId);
    const byEmpRaw = localStorage.getItem(`${KPI_STORE_KEY}_${normId}`);
    if (byEmpRaw) return JSON.parse(byEmpRaw) as KPITrackingSnapshot;
    // Hanya baca legacy global key bila sedang memuat milik user aktif sendiri (mencegah kebocoran lintas karyawan)
    if (!employeeId || normId === normalizeEmployeeId(activeUser.employeeId)) {
      const raw = localStorage.getItem(KPI_STORE_KEY);
      if (raw) return JSON.parse(raw) as KPITrackingSnapshot;
    }
  } catch { /* ignore */ }
  // Default: INITIAL_MONTHS merged with pre-filled targets
  const cellsMap = Object.fromEntries(
    INITIAL_MONTHS.map((m) => [m.id, { ...getPrefilledCells(m.label), ...m.cells }])
  );
  return { months: INITIAL_MONTHS, cellsMap };
}

export function evaluateEmployeeKPITracking(employeeId: string): EmployeeKPITrackingEvaluation {
  const normId = normalizeEmployeeId(employeeId);
  let snap: KPITrackingSnapshot = { months: [], cellsMap: {} };
  try {
    const byEmpRaw = localStorage.getItem(`${KPI_STORE_KEY}_${normId}`);
    if (byEmpRaw) {
      snap = JSON.parse(byEmpRaw) as KPITrackingSnapshot;
    }
  } catch {
    snap = { months: [], cellsMap: {} };
  }

  const months = Array.isArray(snap.months) ? snap.months : [];
  const cellsMap = snap.cellsMap && typeof snap.cellsMap === "object" ? snap.cellsMap : {};

  // Hitung jumlah bulan unik (Jan-26 s/d Dec-26) yang sudah memiliki minimal 1 input aktual terisi
  const empKpiList = resolveEmployeeTrackingKpiItems(employeeId);
  const filledMonthLabels = new Set<string>();
  for (const m of months) {
    if (!FULL_YEAR_KPI_MONTHS.includes(m.label as typeof FULL_YEAR_KPI_MONTHS[number])) continue;
    const monthCells = cellsMap[m.id] ?? m.cells ?? {};
    const hasActualValue = empKpiList.some((kpi) =>
      kpi.subRows.some((sub, si) => {
        if (sub.compute) return false;
        if (sub.label.toLowerCase().startsWith("target")) return false;
        const val = String(monthCells[ck(kpi.no, si)] ?? "").trim();
        return val.length > 0 && val !== "—";
      }),
    );
    if (hasActualValue) {
      filledMonthLabels.add(m.label);
    }
  }

  const trackedMonthsCount = filledMonthLabels.size;
  const isFullYearMonthsComplete = trackedMonthsCount >= FULL_YEAR_KPI_MONTHS.length;
  const hasAnyTrackingData = trackedMonthsCount > 0;

  let totalKPI = empKpiList.length;
  try {
    const rawSet = localStorage.getItem("pa_kpi_setting_by_emp_v2");
    const setMap = rawSet ? (JSON.parse(rawSet) as Record<string, unknown[]>) : {};
    const empSetItems = setMap[normId] ?? setMap[employeeId];
    if (Array.isArray(empSetItems) && empSetItems.length > 0) {
      totalKPI = empSetItems.length;
    }
  } catch {
    // ignore
  }

  let trackedKpiCount = 0;
  let weightedSum = 0;
  if (hasAnyTrackingData) {
    for (const k of empKpiList) {
      const ach = computeKPIAchievement(k, cellsMap, months);
      if (ach !== null) {
        trackedKpiCount++;
        weightedSum += (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
      }
    }
  }
  const ytdScore = weightedSum > 0 ? Math.round(weightedSum * 10) / 10 : 0;

  return {
    months,
    cellsMap,
    trackedMonthsCount,
    isFullYearMonthsComplete,
    ytdScore,
    hasAnyTrackingData,
    totalKPI,
    trackedKpiCount,
  };
}

// ─── SubRow definitions ───────────────────────────────────────────────────────

const mkSimple = (minimize = false): SubRow[] => [
  { label: "Actual" },
  { label: "Target" },
  { label: "% Pencapaian", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1, minimize } },
];

const SUB_KPI3: SubRow[] = [
  { label: "Biaya Listrik" },
  { label: "Target Biaya" },
  { label: "% Pencapaian HPP Listrik", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1, minimize: true } },
  { label: "Biaya Steam" },
  { label: "Target Biaya (Steam)" },
  { label: "% Pencapaian HPP Steam", bold: true, compute: { type: "ratio", actualIdx: 3, targetIdx: 4, minimize: true } },
  { label: "% Pencapaian Total", bold: true, compute: { type: "avg", sourceIdxs: [2, 5] } },
];

const SUB_KPI4A: SubRow[] = [
  { label: "Actual Eff Steam" },
  { label: "Target Eff Steam" },
  { label: "% Pencapaian Eff Steam", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
  { label: "Actual Eff Listrik" },
  { label: "Target Eff Listrik" },
  { label: "% Pencapaian Listrik", bold: true, compute: { type: "ratio", actualIdx: 3, targetIdx: 4 } },
  { label: "Actual HCL" },
  { label: "Target HCL" },
  { label: "% Pencapaian HCL", bold: true, compute: { type: "ratio", actualIdx: 6, targetIdx: 7 } },
  { label: "Actual NaOH" },
  { label: "Target NaOH" },
  { label: "% Pencapaian NaOH", bold: true, compute: { type: "ratio", actualIdx: 9, targetIdx: 10 } },
  { label: "% Pencapaian Total", bold: true, compute: { type: "avg", sourceIdxs: [2, 5, 8, 11] } },
];

const SUB_KPI4B: SubRow[] = [
  { label: "Actual IP Steam" },
  { label: "Target IP Steam" },
  { label: "% Pencapaian IP Steam", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
  { label: "Actual IP Listrik" },
  { label: "Target IP Listrik" },
  { label: "% Pencapaian IP Listrik", bold: true, compute: { type: "ratio", actualIdx: 3, targetIdx: 4 } },
  { label: "% Pencapaian Total", bold: true, compute: { type: "avg", sourceIdxs: [2, 5] } },
];

// subRows for ratio score KPI: [0] News Negatif, [1] News Positif, [2] Target Ratio (locked), [3] % Pencapaian
const mkRatioScore = (multiplier: number): SubRow[] => [
  { label: "News Negatif" },
  { label: "News Positif" },
  { label: "Target Ratio" },
  { label: "% Pencapaian", bold: true, compute: { type: "ratio_score", negIdx: 0, posIdx: 1, multiplier } },
];

// ─── KPI Data ─────────────────────────────────────────────────────────────────

export const KPI_ITEMS: KPIItem[] = [
  {
    no: "1", section: "A", perspektif: "Finansial",
    kpi: "Net Profit (dalam miliar)",
    satuan: "Rp Miliar /bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Industry",
    baseline2025: "687", target2026: "750", polaritas: "Maximize",
    detailFormula: "Jumlah laba bersih perusahaan\n\n*Pencapaian = Realisasi / Target",
    keterangan: "",
    subRows: mkSimple(false),
    monthlyTargets: { "Jan-26":"62.5","Feb-26":"62.5","Mar-26":"62.5","Apr-26":"62.5","May-26":"62.5","Jun-26":"62.5","Jul-26":"62.5","Aug-26":"62.5","Sep-26":"62.5","Oct-26":"62.5","Nov-26":"62.5","Dec-26":"62.5" },
  },
  {
    no: "2", section: "A", perspektif: "Proses",
    kpi: "Fatality Accident",
    satuan: "Kasus /bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja",
    source: "Laporan Komite K3",
    baseline2025: "1", target2026: "0", polaritas: "Minimize",
    detailFormula: "= Jumlah kasus Kecelakaan kerja yang menyebabkan kematian (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    subRows: mkSimple(true),
    monthlyTargets: { "Jan-26":"0","Feb-26":"0","Mar-26":"0","Apr-26":"0","May-26":"0","Jun-26":"0","Jul-26":"0","Aug-26":"0","Sep-26":"0","Oct-26":"0","Nov-26":"0","Dec-26":"0" },
  },
  {
    no: "3", section: "B", perspektif: "Finansial",
    kpi: "HPP Produksi Energy:\na. Listrik (target: 1.920 Rp/kwh)\nb. Steam (target: 294 Rp/kg)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "15%",
    definisi: "Upaya sistematis untuk menekan biaya bahan baku, tenaga kerja, overhead, dan distribusi agar harga pokok produksi tetap rendah, margin keuntungan terjaga, dan daya saing produk meningkat",
    source: "Laporan Keuangan RSUP Industry",
    baseline2025: "100%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "= (Realisasi pencapaian listrik + Realisasi pencapaian steam) / 2",
    keterangan: "Baseline:\nListrik: 1,799.77\nSteam: 273.99",
    subRows: SUB_KPI3,
    subRowTargets: { 1: "1920", 4: "294" },
  },
  {
    no: "4a", section: "B", perspektif: "Proses",
    kpi: "Efisiensi pemakaian energi dan material:\na. Bahan Bakar - Produksi Steam (Target: 3,22 kg steam/kg bb)\nb. Bahan Bakar - Produksi Listrik (Target: 0,64 kwh/kg bb)\nc. Konsumsi HCL - Proses Demineralisasi (Target: 0,23 Kg/M3)\nd. Konsumsi NaOH - Proses Demineralisasi (Target: 0,11 Kg/M3)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "20%",
    definisi: "Meningkatkan rata-rata efisiensi dalam pemakaian energi dan material berlebih",
    source: "Laporan PWP",
    baseline2025: "97%", target2026: "100%", polaritas: "Maximize",
    detailFormula: "= (Eff BB Steam + Eff BB Listrik + Penggunaan HCL + Penggunaan NaOH) / 4\n\n*Pemakaian BB (steam) = kg steam/kg bahan bakar (batubara+tempurung)\n**Pemakaian BB (listrik) = kWh/kg bahan bakar\n***Penggunaan HCL = Total HCL (kg) / Volume air (m3)\n****Penggunaan NaOH = Total NaOH (kg)/Volume air (m3)",
    keterangan: "Baseline:\nSteam: —\nListrik: —\nHCL: —\nNaOH: —",
    subRows: SUB_KPI4A,
    subRowTargets: { 1: "3.22", 4: "0.64", 7: "0.23", 10: "0.11" },
  },
  {
    no: "4b", section: "B", perspektif: "Proses",
    kpi: "Pencapaian Index Produktivitas Karyawan:\na. Karyawan Power Plant (PWP) - Steam (Target: 22,43 ton steam/orang)\nb. Karyawan Power Plant (PWP) - Listrik (Target: 2.999 kwh/orang)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "15%",
    definisi: "Meningkatkan produktivitas dengan menggunakan kapasitas maksimum sumberdaya dan output bulanan",
    source: "Laporan PWP",
    baseline2025: "198%", target2026: "100%", polaritas: "Maximize",
    detailFormula: "= (Index produktivitas karyawan PWP - Steam + Index produktivitas karyawan PWP - Listrik) / 2\n\n*Indeks Produktivitas = Total output pekerjaan / Jumlah manday",
    keterangan: "Baseline:\nSteam: 22.3\nListrik: 2,830",
    subRows: SUB_KPI4B,
    subRowTargets: { 1: "22.43", 4: "2999" },
  },
  {
    no: "5a", section: "B", perspektif: "Environment, Health & Safety",
    kpi: "Pencapaian Kinerja Terintegrasi: LTI",
    satuan: "hari/tahun", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Rata-rata nilai parameter keselamatan, kesehatan kerja, keamanan pangan, mutu dan lingkungan",
    source: "Laporan Komite K3",
    baseline2025: "17", target2026: "17", polaritas: "Maximize",
    detailFormula: "Nilai poin LTI",
    keterangan: "",
    subRows: [
      { label: "Actual LTI" },
      { label: "Target LTI" },
      { label: "% Pencapaian", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
    ],
    monthlyTargets: { "Jan-26":"17","Feb-26":"17","Mar-26":"17","Apr-26":"17","May-26":"17","Jun-26":"17","Jul-26":"17","Aug-26":"17","Sep-26":"17","Oct-26":"17","Nov-26":"17","Dec-26":"17" },
  },
  {
    no: "5b", section: "B", perspektif: "Environment, Health & Safety",
    kpi: "Regulatory Compliance - Audit Eksternal",
    satuan: "temuan/tahun", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Memenuhi kepatuhan organisasi terhadap regulasi, perizinan, dan persyaratan hukum yang berlaku",
    source: "Laporan QA",
    baseline2025: "0", target2026: "0", polaritas: "Minimize",
    detailFormula: "Jumlah temuan yang terdapat pada audit eksternal dept PWP (NC)",
    keterangan: "",
    subRows: mkSimple(true),
    monthlyTargets: { "Jan-26":"0","Feb-26":"0","Mar-26":"0","Apr-26":"0","May-26":"0","Jun-26":"0","Jul-26":"0","Aug-26":"0","Sep-26":"0","Oct-26":"0","Nov-26":"0","Dec-26":"0" },
  },
  {
    no: "6", section: "B", perspektif: "Customer",
    kpi: "Meminimalisasi Risiko Proses\nJumlah Kasus Turbin Trip",
    satuan: "kasus/bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Meminimalisir tingkat risiko untuk seluruh proses yang berada pada scope pekerjaan Dept PWP dan memiliki dampak yang cukup signifikan terhadap relasi",
    source: "Laporan PWP",
    baseline2025: "2", target2026: "2", polaritas: "Minimize",
    detailFormula: "Total kejadian turbin trip per tahun",
    keterangan: "",
    subRows: mkSimple(true),
    monthlyTargets: { "Jan-26":"2","Feb-26":"2","Mar-26":"2","Apr-26":"2","May-26":"2","Jun-26":"2","Jul-26":"2","Aug-26":"2","Sep-26":"2","Oct-26":"2","Nov-26":"2","Dec-26":"2" },
  },
  {
    no: "7", section: "B", perspektif: "Learning & Growth",
    kpi: "Hard & Softskill Training",
    satuan: "Jumlah", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Mengukur sejauh mana organisasi menjadi tempat kerja yang diminati, dengan menciptakan lingkungan kerja yang mendukung keterlibatan karyawan, pengembangan kompetensi, dan daya tarik bagi talenta industri.",
    source: "Laporan HRD",
    baseline2025: "25", target2026: "25", polaritas: "Maximize",
    detailFormula: "Jumlah pelaksanaan Hard & Softskill Training di dept BLR",
    keterangan: "",
    subRows: mkSimple(false),
    monthlyTargets: { "Jan-26":"25","Feb-26":"25","Mar-26":"25","Apr-26":"25","May-26":"25","Jun-26":"25","Jul-26":"25","Aug-26":"25","Sep-26":"25","Oct-26":"25","Nov-26":"25","Dec-26":"25" },
  },
  {
    no: "8", section: "B", perspektif: "Customer",
    kpi: "Manajemen Pemberitaan Media\n(News Positif vs News Negatif)",
    satuan: "Ratio /bulan", formula: "Jumlah", bobot: "5%",
    definisi: "Menjaga rasio pemberitaan positif terhadap negatif untuk mempertahankan reputasi perusahaan di media massa dan digital.",
    source: "Laporan Corporate Communication",
    baseline2025: "6:1", target2026: "6:1", polaritas: "Maximize",
    detailFormula: "Target Ratio 6:1\nJika News Negatif = 0 → Score 100%\nJika News Positif ≥ News Negatif × 6 → Score 100%\nJika tidak terpenuhi → Score 0%",
    keterangan: "Cascading dari Division KPI — Ratio 6:1",
    indicatorMode: "ratio",
    ratioMultiplier: 6,
    ratioPositiveLabel: "News Positif",
    ratioNegativeLabel: "News Negatif",
    subRows: mkRatioScore(6),
    monthlyTargets: { "Jan-26":"6:1","Feb-26":"6:1","Mar-26":"6:1","Apr-26":"6:1","May-26":"6:1","Jun-26":"6:1","Jul-26":"6:1","Aug-26":"6:1","Sep-26":"6:1","Oct-26":"6:1","Nov-26":"6:1","Dec-26":"6:1" },
  },
];

// ─── Sample monthly data ──────────────────────────────────────────────────────

export const INITIAL_MONTHS: MonthEntry[] = [];
const _UNUSED_INITIAL_MONTHS: MonthEntry[] = [
  {
    id: "jan26", label: "Jan-26",
    cells: {
      [ck("1",0)]: "62",    [ck("1",1)]: "62.5",
      [ck("2",0)]: "0",     [ck("2",1)]: "0",
      [ck("3",0)]: "1750",  [ck("3",1)]: "1920",
      [ck("3",3)]: "268",   [ck("3",4)]: "294",
      [ck("4a",0)]: "3.18", [ck("4a",1)]: "3.22",
      [ck("4a",3)]: "0.62", [ck("4a",4)]: "0.64",
      [ck("4a",6)]: "0.22", [ck("4a",7)]: "0.23",
      [ck("4a",9)]: "0.10", [ck("4a",10)]: "0.11",
      [ck("4b",0)]: "23.1", [ck("4b",1)]: "22.43",
      [ck("4b",3)]: "3050", [ck("4b",4)]: "2999",
      [ck("5a",0)]: "17",   [ck("5a",1)]: "17",
      [ck("5b",0)]: "0",        [ck("5b",1)]: "0",
      [ck("6",0)]: "1",     [ck("6",1)]: "2",
      [ck("7",0)]: "2",     [ck("7",1)]: "25",
      // KPI #8 Ratio: negatif=1, positif=8 → score 100% (8 ≥ 1×6)
      [ck("8",0)]: "1",     [ck("8",1)]: "8",   [ck("8",2)]: "6:1",
    },
  },
  {
    id: "feb26", label: "Feb-26",
    cells: {
      [ck("1",0)]: "65",    [ck("1",1)]: "62.5",
      [ck("2",0)]: "0",     [ck("2",1)]: "0",
      [ck("3",0)]: "1820",  [ck("3",1)]: "1920",
      [ck("3",3)]: "278",   [ck("3",4)]: "294",
      [ck("5a",0)]: "17",   [ck("5a",1)]: "17",
      [ck("6",0)]: "2",     [ck("6",1)]: "2",
      // KPI #8 Ratio: negatif=2, positif=10 → score 0% (10 < 2×6=12)
      [ck("8",0)]: "2",     [ck("8",1)]: "10",  [ck("8",2)]: "6:1",
    },
  },
];

const MONTH_OPTIONS = [
  "Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26",
  "Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26",
];

// Strip year suffix for display only (e.g. "Jan-26" → "Jan")
function displayMonth(label: string): string {
  return label.replace(/-\d{2}$/, "");
}

// ≥100% → green · <100% → red
function getPctColor(val: string): string {
  if (!val || val === "—") return "text-gray-300 font-normal";
  const n = parseNum(val);
  if (n === null) return "text-gray-700";
  if (n >= 100) return "text-green-700";
  return "text-rose-600";
}

// ─── Column widths ────────────────────────────────────────────────────────────

const W_NO = 52;
const W_PERSP = 140;
const W_KPI = 270;

// ─── Pre-fill helper ──────────────────────────────────────────────────────────

function getPrefilledCells(monthLabel: string, itemsList: KPIItem[] = KPI_ITEMS): Record<CellKey, string> {
  const cells: Record<CellKey, string> = {};
  itemsList.forEach((kpi) => {
    // Fill specific sub-row targets (complex KPIs)
    if (kpi.subRowTargets) {
      Object.entries(kpi.subRowTargets).forEach(([si, val]) => {
        cells[ck(kpi.no, Number(si))] = val;
      });
    }
    // Fill simple "Target" sub-rows from monthlyTargets
    const monthVal = kpi.monthlyTargets?.[monthLabel];
    if (monthVal !== undefined) {
      kpi.subRows.forEach((sub, si) => {
        if (!sub.compute && (sub.label === "Target" || sub.label === "Target LTI" || sub.label === "Target Ratio")) {
          cells[ck(kpi.no, si)] = monthVal;
          // For color-indicator KPIs, also pre-fill Realisasi with empty so select shows
          if (kpi.colorIndicator && !cells[ck(kpi.no, si + 1)]) {
            cells[ck(kpi.no, si + 1)] = "";
          }
        }
      });
    }
  });
  return cells;
}

// ─── Add Month Modal ──────────────────────────────────────────────────────────

// ─── Validasi operator desimal / ribuan Actual vs Target ─────────────────────
type NumberSeparatorFormat = { decimal: "." | "," | null; thousands: "." | "," | null };

/** Deteksi pemisah desimal & ribuan dari sebuah nilai angka (mis. "62.5", "1,250.75", "62,5", "1.250,75"). */
export function detectNumberSeparators(raw: string): NumberSeparatorFormat {
  const v = String(raw ?? "").trim().replace(/[^0-9.,]/g, "");
  const hasDot = v.includes(".");
  const hasComma = v.includes(",");
  if (hasDot && hasComma) {
    return v.lastIndexOf(".") > v.lastIndexOf(",") ? { decimal: ".", thousands: "," } : { decimal: ",", thousands: "." };
  }
  const sep = hasDot ? "." : hasComma ? "," : null;
  if (!sep) return { decimal: null, thousands: null };
  const parts = v.split(sep);
  const tail = parts[parts.length - 1];
  // Grup 3 digit berulang (1.250 / 1,250,000) dianggap pemisah ribuan; selain itu pemisah desimal
  const looksThousands = parts.length > 2 || (tail.length === 3 && parts[0].length >= 1 && parts[0].length <= 3 && parts[0] !== "0");
  return looksThousands ? { decimal: null, thousands: sep } : { decimal: sep, thousands: null };
}

/** Pesan error bila operator pada Actual tidak sama dengan operator pada Target indikator KPI tsb. */
export function separatorMismatchMessage(target: string, actual: string): string | null {
  const a = String(actual ?? "").trim();
  if (!a || !/[.,]/.test(a)) return null;
  const t = detectNumberSeparators(target);
  if (!t.decimal && !t.thousands) return null;
  const act = detectNumberSeparators(a);
  const label = (sep: "." | ",") => (sep === "." ? "titik (.)" : "koma (,)");
  const expectedDecimal = t.decimal ?? (t.thousands === "." ? "," : ".");
  if (act.decimal && act.decimal !== expectedDecimal) {
    return `Operator desimal harus menggunakan ${label(expectedDecimal)} sesuai format Target (${target}).`;
  }
  if (act.thousands && t.thousands && act.thousands !== t.thousands) {
    return `Operator ribuan harus menggunakan ${label(t.thousands)} sesuai format Target (${target}).`;
  }
  if (act.thousands && !t.thousands && act.thousands === expectedDecimal) {
    return null;
  }
  if (act.thousands && !t.thousands && act.thousands !== expectedDecimal) {
    // mis. Target "62.5" lalu Actual "1,250" → koma dianggap tidak sesuai format desimal titik
    return `Gunakan operator ${label(expectedDecimal)} sesuai format Target (${target}).`;
  }
  return null;
}

function AddMonthModal({
  existingLabels,
  kpiItems = KPI_ITEMS,
  onAdd,
  onClose,
}: {
  existingLabels: string[];
  kpiItems?: KPIItem[];
  onAdd: (entry: MonthEntry) => void;
  onClose: () => void;
}) {
  const available = MONTH_OPTIONS.filter((m) => !existingLabels.includes(m));
  const [label, setLabel] = useState(available[0] ?? "");
  const [cells, setCells] = useState<Record<CellKey, string>>(() => getPrefilledCells(available[0] ?? "", kpiItems));
  const [attempted, setAttempted] = useState(false);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    setCells(getPrefilledCells(newLabel, kpiItems));
    setAttempted(false);
  };

  const setVal = (key: CellKey, val: string) =>
    setCells((prev) => ({ ...prev, [key]: val }));

  // Collect required (actual) fields that are empty
  const getMissingFields = () => {
    const missing: { kpiNo: string; subIdx: number }[] = [];
    kpiItems.forEach((kpi) => {
      kpi.subRows.forEach((sub, si) => {
        if (sub.compute) return;
        if (sub.label.toLowerCase().startsWith("target")) return;
        if (!(cells[ck(kpi.no, si)] ?? "").trim()) {
          missing.push({ kpiNo: kpi.no, subIdx: si });
        }
      });
    });
    return missing;
  };

  const missingFields = getMissingFields();
  // Target per indikator: baris "Target" pada KPI yang sama (atau Target tahunan bila tidak ada)
  const targetFor = (kpi: KPIItem): string => {
    const tIdx = kpi.subRows.findIndex((sb) => !sb.compute && sb.label.toLowerCase().startsWith("target"));
    return (tIdx >= 0 ? cells[ck(kpi.no, tIdx)] : "") || kpi.monthlyTargets?.[label] || kpi.target2026 || "";
  };
  const separatorErrors: Record<string, string> = {};
  KPI_ITEMS.forEach((kpi) => {
    const target = targetFor(kpi);
    kpi.subRows.forEach((sub, si) => {
      if (sub.compute || sub.label.toLowerCase().startsWith("target")) return;
      const msg = separatorMismatchMessage(target, cells[ck(kpi.no, si)] ?? "");
      if (msg) separatorErrors[ck(kpi.no, si)] = msg;
    });
  });
  const separatorErrorCount = Object.keys(separatorErrors).length;
  const missingByKpi = missingFields.reduce<Record<string, number>>((acc, f) => {
    acc[f.kpiNo] = (acc[f.kpiNo] ?? 0) + 1;
    return acc;
  }, {});
  const isFieldEmpty = (kpiNo: string, si: number) =>
    attempted && missingFields.some((f) => f.kpiNo === kpiNo && f.subIdx === si);

  const doSave = () => {
    onAdd({ id: label.replace("-", "").toLowerCase(), label, cells });
    onClose();
  };

  const handleAdd = () => {
    if (!label) return;
    if (separatorErrorCount > 0) {
      toast.error(`${separatorErrorCount} nilai Actual menggunakan operator angka yang tidak sesuai dengan Target. Perbaiki terlebih dahulu.`);
      return;
    }
    setAttempted(true);
    if (missingFields.length > 0) {
      setShowEmptyConfirm(true);
      return;
    }
    doSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-[#1A284F] text-lg">Add Monthly Tracking Data</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-[#1A284F] uppercase tracking-wide whitespace-nowrap">Month</label>
            <select
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]"
            >
              {available.map((m) => <option key={m} value={m}>{m}</option>)}
              {!available.length && <option>All months added</option>}
            </select>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 rounded-lg border border-sky-200">
            <Lock className="w-3 h-3 text-sky-500 shrink-0" />
            <p className="text-[11px] text-sky-700 font-medium">
              Target fields are locked — values are set in KPI Setting and cannot be changed here.
            </p>
          </div>
        </div>

        {/* Validation banner — info only, no longer blocking */}
        {attempted && missingFields.length > 0 && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700">
                {missingFields.length} field aktual belum terisi — field yang kosong akan ditandai merah di tabel.
              </p>
            </div>
          </div>
        )}

        {/* Confirmation popup: save with empty fields */}
        {showEmptyConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 rounded-2xl">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-6 p-6 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Ada field yang belum terisi</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {missingFields.length} field aktual kosong pada bulan <span className="font-semibold text-gray-700">{label}</span>:
                  </p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 max-h-36 overflow-y-auto">
                {kpiItems.filter((k) => missingFields.some((f) => f.kpiNo === k.no)).map((k) => {
                  const emptySubRows = missingFields.filter((f) => f.kpiNo === k.no).map((f) => k.subRows[f.subIdx].label);
                  return (
                    <div key={k.no} className="mb-1.5 last:mb-0">
                      <p className="text-[11px] font-bold text-red-700">{k.no}. {k.kpi.split("\n")[0]}</p>
                      <p className="text-[10px] text-red-500 ml-2">↳ {emptySubRows.join(", ")}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500">
                Field yang kosong akan ditandai <span className="font-semibold text-red-600">merah</span> di tabel KPI Tracking sampai diisi.
                Anda tetap bisa menyimpan sekarang.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowEmptyConfirm(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Kembali &amp; Lengkapi
                </button>
                <button
                  onClick={() => { setShowEmptyConfirm(false); doSave(); }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Abaikan &amp; Simpan
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="px-6 py-4 max-h-[60vh] overflow-y-auto flex flex-col gap-5">
          {Array.from(new Set(kpiItems.map((k) => k.section))).sort().map((sec, sIdx) => {
            const firstInSec = kpiItems.find((k) => k.section === sec);
            const secHeader = firstInSec?.sectionLabel
              ? `${sec}. ${firstInSec.sectionLabel}${firstInSec.sectionBobot ? ` (${firstInSec.sectionBobot})` : ""}`
              : sec === "A" ? "A. Objective KPI (20%)" : sec === "B" ? "B. Functional KPI (80%)" : `Section ${sec}`;
            return (
            <div key={sec}>
              <p className={`text-xs font-bold text-white px-3 py-1.5 rounded-md mb-3 ${sIdx % 2 === 0 ? "bg-[#1565C0]" : "bg-[#1976D2]"}`}>
                {secHeader}
              </p>
              {kpiItems.filter((k) => k.section === sec).map((kpi) => {
                const kpiMissing = attempted ? (missingByKpi[kpi.no] ?? 0) : 0;
                const getDraftRaw = (idx: number) => cells[ck(kpi.no, idx)] ?? "";
                // Kelompokkan setiap pasangan Target + Actual (+ % Pencapaian) dalam 1 baris (1 line) agar jelas bagi karyawan
                type ModalRowGroup =
                  | { kind: "pair"; targetIdx: number; actualIdx: number; computeIdx?: number }
                  | { kind: "ratio_score"; targetIdx: number; negIdx: number; posIdx: number; computeIdx: number }
                  | { kind: "single"; subIdx: number };
                const usedIndices = new Set<number>();
                const rowGroups: ModalRowGroup[] = [];
                kpi.subRows.forEach((sub, si) => {
                  if (!sub.compute) return;
                  if (sub.compute.type === "ratio") {
                    usedIndices.add(sub.compute.targetIdx);
                    usedIndices.add(sub.compute.actualIdx);
                    usedIndices.add(si);
                    rowGroups.push({
                      kind: "pair",
                      targetIdx: sub.compute.targetIdx,
                      actualIdx: sub.compute.actualIdx,
                      computeIdx: si,
                    });
                  } else if (sub.compute.type === "ratio_score") {
                    const tIdx = kpi.subRows.findIndex((s, idx) => !s.compute && !usedIndices.has(idx) && s.label.toLowerCase().startsWith("target"));
                    if (tIdx >= 0) usedIndices.add(tIdx);
                    usedIndices.add(sub.compute.negIdx);
                    usedIndices.add(sub.compute.posIdx);
                    usedIndices.add(si);
                    rowGroups.push({
                      kind: "ratio_score",
                      targetIdx: tIdx,
                      negIdx: sub.compute.negIdx,
                      posIdx: sub.compute.posIdx,
                      computeIdx: si,
                    });
                  } else if (sub.compute.type === "avg" || sub.compute.type === "ref") {
                    usedIndices.add(si);
                  }
                });
                kpi.subRows.forEach((_sub, si) => {
                  if (!usedIndices.has(si)) {
                    rowGroups.push({ kind: "single", subIdx: si });
                  }
                });

                return (
                  <div key={kpi.no} className="mb-4">
                    <div className={`flex items-center gap-2 mb-2 rounded-lg px-3 py-2 ${kpiMissing > 0 ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}>
                      <p className="text-xs font-semibold text-gray-800 flex-1">
                        {kpi.no}. {kpi.kpi.split("\n")[0]}
                        <span className="ml-2 text-gray-400 font-normal">({kpi.satuan})</span>
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          kpi.polaritas === "Maximize"
                            ? "bg-blue-50 text-blue-700"
                            : kpi.polaritas === "Stabilize"
                            ? "bg-violet-50 text-violet-700"
                            : "bg-orange-50 text-orange-700"
                        }`}>{kpi.polaritas}</span>
                      </p>
                      {kpiMissing > 0 && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          {kpiMissing} kosong
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2.5 pl-2">
                      {rowGroups.map((grp, gi) => {
                        if (grp.kind === "pair") {
                          const targetSub = kpi.subRows[grp.targetIdx];
                          const actualSub = kpi.subRows[grp.actualIdx];
                          const computeSub = grp.computeIdx !== undefined ? kpi.subRows[grp.computeIdx] : undefined;
                          const empty = isFieldEmpty(kpi.no, grp.actualIdx);
                          const sepErr = separatorErrors[ck(kpi.no, grp.actualIdx)];
                          const livePct =
                            grp.computeIdx !== undefined && (cells[ck(kpi.no, grp.actualIdx)] ?? "").trim()
                              ? computeCell(kpi.subRows, getDraftRaw, grp.computeIdx, kpi.polaritas)
                              : "—";
                          const liveNum = parseNum(livePct);
                          return (
                            <div
                              key={`pair-${gi}`}
                              data-empty={empty ? "true" : undefined}
                              className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_170px] gap-3 items-start rounded-xl border border-gray-100 bg-gray-50/40 p-2.5"
                            >
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                  {targetSub.label}
                                </label>
                                <div className="flex items-center justify-between gap-1 text-xs border border-sky-200 bg-sky-50 rounded-lg px-3 py-2">
                                  <span className="font-semibold text-sky-800">{cells[ck(kpi.no, grp.targetIdx)] || "—"}</span>
                                  <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className={`text-[10px] uppercase tracking-wide ${empty ? "font-bold text-red-600" : "font-semibold text-gray-700"}`}>
                                  {actualSub.label}
                                  {empty && <span className="ml-1 text-[9px] text-red-500 normal-case font-normal">— wajib diisi</span>}
                                </label>
                                <input
                                  type="text"
                                  value={cells[ck(kpi.no, grp.actualIdx)] ?? ""}
                                  onChange={(e) => setVal(ck(kpi.no, grp.actualIdx), e.target.value)}
                                  placeholder="Masukkan nilai aktual"
                                  className={`text-xs border rounded-lg px-3 py-2 outline-none transition-colors bg-white ${
                                    empty || sepErr
                                      ? "border-red-400 bg-red-50 focus:border-red-500 placeholder-red-300"
                                      : "border-gray-200 focus:border-[#1A284F]"
                                  }`}
                                />
                                {sepErr && (
                                  <span className="flex items-start gap-1 text-[10px] font-medium text-red-600">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    {sepErr}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-[#1A284F] truncate" title={computeSub?.label ?? "% Pencapaian"}>
                                  {computeSub?.label ?? "% Pencapaian"} <span className="text-[9px] text-emerald-600 font-normal">(auto)</span>
                                </label>
                                <div
                                  className={`text-xs border rounded-lg px-3 py-2 font-bold text-center ${
                                    liveNum === null
                                      ? "border-gray-200 bg-gray-100 text-gray-400"
                                      : liveNum >= 100
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-rose-200 bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {livePct}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        if (grp.kind === "ratio_score") {
                          const negSub = kpi.subRows[grp.negIdx];
                          const posSub = kpi.subRows[grp.posIdx];
                          const compSub = kpi.subRows[grp.computeIdx];
                          const negEmpty = isFieldEmpty(kpi.no, grp.negIdx);
                          const posEmpty = isFieldEmpty(kpi.no, grp.posIdx);
                          const livePct =
                            (cells[ck(kpi.no, grp.negIdx)] ?? "").trim()
                              ? computeCell(kpi.subRows, getDraftRaw, grp.computeIdx, kpi.polaritas)
                              : "—";
                          return (
                            <div key={`rs-${gi}`} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start rounded-xl border border-gray-100 bg-gray-50/40 p-2.5">
                              {grp.targetIdx >= 0 && (
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                                    {kpi.subRows[grp.targetIdx].label}
                                  </label>
                                  <div className="flex items-center justify-between gap-1 text-xs border border-sky-200 bg-sky-50 rounded-lg px-3 py-2">
                                    <span className="font-semibold text-sky-800">{cells[ck(kpi.no, grp.targetIdx)] || "—"}</span>
                                    <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-col gap-1" data-empty={negEmpty ? "true" : undefined}>
                                <label className={`text-[10px] uppercase tracking-wide ${negEmpty ? "font-bold text-red-600" : "font-semibold text-gray-700"}`}>
                                  {negSub.label}
                                </label>
                                <input
                                  type="text"
                                  value={cells[ck(kpi.no, grp.negIdx)] ?? ""}
                                  onChange={(e) => setVal(ck(kpi.no, grp.negIdx), e.target.value)}
                                  placeholder="Masukkan nilai aktual"
                                  className={`text-xs border rounded-lg px-3 py-2 outline-none bg-white ${negEmpty ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-[#1A284F]"}`}
                                />
                              </div>
                              <div className="flex flex-col gap-1" data-empty={posEmpty ? "true" : undefined}>
                                <label className={`text-[10px] uppercase tracking-wide ${posEmpty ? "font-bold text-red-600" : "font-semibold text-gray-700"}`}>
                                  {posSub.label}
                                </label>
                                <input
                                  type="text"
                                  value={cells[ck(kpi.no, grp.posIdx)] ?? ""}
                                  onChange={(e) => setVal(ck(kpi.no, grp.posIdx), e.target.value)}
                                  placeholder="Masukkan nilai aktual"
                                  className={`text-xs border rounded-lg px-3 py-2 outline-none bg-white ${posEmpty ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-[#1A284F]"}`}
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-[#1A284F]">
                                  {compSub.label} <span className="text-[9px] text-emerald-600 font-normal">(auto)</span>
                                </label>
                                <div className="text-xs border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2 text-emerald-700 font-bold text-center">
                                  {livePct}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        const si = grp.subIdx;
                        const sub = kpi.subRows[si];
                        const empty = isFieldEmpty(kpi.no, si);
                        return (
                          <div key={si} className="flex flex-col gap-0.5" data-empty={empty ? "true" : undefined}>
                            <label className={`text-[10px] uppercase tracking-wide ${
                              empty ? "font-bold text-red-600" : sub.bold ? "font-bold text-[#1A284F]" : "font-medium text-gray-500"
                            }`}>
                              {sub.label}
                              {sub.compute && <span className="ml-1 text-[9px] text-emerald-600">(auto)</span>}
                              {empty && <span className="ml-1 text-[9px] text-red-500 normal-case font-normal">— wajib diisi</span>}
                            </label>
                            {sub.compute ? (
                              <div className="text-xs border border-emerald-200 bg-emerald-50 rounded px-2 py-1.5 text-emerald-700 font-bold">
                                auto-calculated
                              </div>
                            ) : sub.label.toLowerCase().startsWith("target") ? (
                              <div className="flex items-center justify-between gap-1 text-xs border border-sky-200 bg-sky-50 rounded px-2 py-1.5">
                                <span className="font-semibold text-sky-700">{cells[ck(kpi.no, si)] || "—"}</span>
                                <Lock className="w-3 h-3 text-sky-400 shrink-0" />
                              </div>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  value={cells[ck(kpi.no, si)] ?? ""}
                                  onChange={(e) => setVal(ck(kpi.no, si), e.target.value)}
                                  placeholder="Masukkan nilai aktual"
                                  className={`text-xs border rounded px-2 py-1.5 outline-none transition-colors ${
                                    empty || separatorErrors[ck(kpi.no, si)]
                                      ? "border-red-400 bg-red-50 focus:border-red-500 placeholder-red-300"
                                      : "border-gray-200 focus:border-[#1A284F]"
                                  }`}
                                />
                                {separatorErrors[ck(kpi.no, si)] && (
                                  <span className="flex items-start gap-1 text-[10px] font-medium text-red-600">
                                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                    {separatorErrors[ck(kpi.no, si)]}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <div>
            {separatorErrorCount > 0 && (
              <p className="text-[11px] text-red-600 font-semibold">
                {separatorErrorCount} field Actual memakai operator angka berbeda dari Target
              </p>
            )}
            {attempted && missingFields.length > 0 && (
              <p className="text-[11px] text-amber-600 font-medium">
                {missingFields.length} field kosong — akan ditandai merah di tabel
              </p>
            )}
            {attempted && missingFields.length === 0 && (
              <p className="text-[11px] text-green-600 font-medium">Semua field terisi ✓</p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!label || !available.length || separatorErrorCount > 0}
              title={separatorErrorCount > 0 ? "Perbaiki operator angka (titik/koma) pada field Actual agar sesuai dengan Target" : undefined}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add {label}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm / Success modals ─────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm, months, rcaCount }: { onCancel: () => void; onConfirm: () => void; months?: string[]; rcaCount?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Konfirmasi Submit KPI Tracking</h3>
        <p className="text-gray-500 text-sm mb-6">
          KPI Tracking{months && months.length ? <> bulan <strong>{months.join(", ")}</strong></> : null}
          {rcaCount ? <> beserta <strong>{rcaCount} RCA</strong></> : null} akan dikirim ke approver
          (Checker → Approver 1 → Approver 2 → Validator). Lanjutkan?
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

// Returns the lowest Pencapaian % for a given KPI+month, or null if no data
function getLowestAchievement(
  kpi: KPIItem,
  monthId: string,
  cells: Record<string, Record<CellKey, string>>
): number | null {
  let lowest: number | null = null;
  kpi.subRows.forEach((sub, si) => {
    if (!sub.compute) return;
    const getRaw = (idx: number) => cells[monthId]?.[ck(kpi.no, idx)] ?? "";
    const val = computeCell(kpi.subRows, getRaw, si, kpi.polaritas);
    const n = parseNum(val);
    if (n !== null && (lowest === null || n < lowest)) lowest = n;
  });
  return lowest;
}

// ─── RCA Drawer (full-screen, matching RCAPage format) ────────────────────────

const F_CLS = "text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] w-full";

function RCAListEditor({ items: rawItems, onChange }: { items: string[] | string; onChange: (v: string[]) => void }) {
  const items = Array.isArray(rawItems) ? rawItems : (rawItems ? [rawItems] : []);
  const [draft, setDraft] = React.useState("");
  const commit = () => { const t = draft.trim(); if (t) { onChange([...items, t]); setDraft(""); } };
  return (
    <div className="flex flex-col gap-1">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-start gap-1 group">
          <span className="text-[10px] text-gray-700 flex-1 leading-relaxed break-words">{it}</span>
          <button onClick={() => onChange(items.filter((_, i) => i !== idx))} className="shrink-0 text-gray-200 hover:text-red-400 transition-colors mt-0.5">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 mt-0.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Tambah…"
          className="flex-1 text-[10px] border border-dashed border-amber-300 rounded px-1.5 py-1 outline-none focus:border-amber-500 bg-amber-50/30 min-w-0" />
        <button type="button" onClick={commit} className="text-[10px] font-bold text-amber-600 hover:bg-amber-100 px-1.5 py-1 rounded transition-colors">+</button>
      </div>
    </div>
  );
}

function parseKpiRcaEvidence(raw: string): { name: string; url?: string } {
  const str = String(raw ?? "");
  const sep = str.indexOf("||");
  if (sep >= 0) return { name: str.slice(0, sep) || "file", url: str.slice(sep + 2) || undefined };
  return { name: str };
}

function RCAMultiFileUpload({ files: rawFiles, onChange }: { files: string[] | string; onChange: (v: string[]) => void }) {
  const files = Array.isArray(rawFiles) ? rawFiles : (rawFiles ? [rawFiles] : []);
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawList = Array.from(e.target.files || []);
    e.target.value = "";
    if (!rawList.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const rawFile of rawList) {
        const rec = await uploadEvidenceFileToSupabase(rawFile, {
          moduleType: "RCA",
          period: "2026",
        });
        uploaded.push(rec?.url ? `${rawFile.name}||${rec.url}` : rawFile.name);
      }
      if (uploaded.length) onChange([...files, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      {files.map((f, idx) => {
        const parsed = parseKpiRcaEvidence(f);
        return (
          <div key={idx} className="flex items-center gap-1 text-[10px] text-green-700">
            <FileText className="w-3 h-3 shrink-0 text-green-500" />
            {parsed.url ? (
              <a href={parsed.url} target="_blank" rel="noreferrer" download={parsed.name} className="flex-1 truncate hover:underline" title={parsed.name}>{parsed.name}</a>
            ) : (
              <span className="flex-1 truncate" title={parsed.name}>{parsed.name}</span>
            )}
            <button type="button" onClick={() => onChange(files.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
          </div>
        );
      })}
      <button type="button" disabled={uploading} onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 text-[10px] text-blue-600 font-medium hover:text-blue-700 mt-0.5 border border-dashed border-blue-300 rounded px-2 py-1 bg-blue-50/40 hover:bg-blue-50 transition-colors disabled:opacity-50">
        <Upload className="w-3 h-3" /> {uploading ? "Mengunggah…" : "Upload file"}
      </button>
      <p className="text-[9px] text-gray-400">JPG, PNG, PDF</p>
      <input ref={ref} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={(e) => { void handleFiles(e); }} />
    </div>
  );
}

interface MasalahFormBlock {
  id: string;
  masalahUtama: string;
  kenapaA: string;
  kenapaB: string;
  kenapaC: string;
  actionPlans: RCAActionPlan[];
}

function newMasalahFormBlock(): MasalahFormBlock {
  return {
    id: Math.random().toString(36).slice(2),
    masalahUtama: "",
    kenapaA: "",
    kenapaB: "",
    kenapaC: "",
    actionPlans: [newRCAAction()],
  };
}

function RCAModal({
  pending,
  existing,
  onSave,
  onClose,
}: {
  pending: PendingRCA;
  existing?: RCAEntry;
  onSave: (key: string, entry: RCAEntry, blocks: MasalahFormBlock[]) => void;
  onClose: () => void;
}) {
  // KPI metadata (Periode, KPI, Satuan, Baseline, Monthly Target auto-filled; Actual dapat diedit)
  const [form, setForm] = useState<RCAEntry>(() => {
    const base = existing ?? {
      periode: pending.monthLabel,
      kpi: pending.kpiName,
      satuan: pending.satuan,
      baseline: pending.baseline,
      target: pending.target,
      actual: pending.actual || `${pending.achievementPct.toFixed(1)}%`,
      masalahUtama: [""],
      kenapaA: "",
      kenapaB: "",
      kenapaC: "",
      actionPlans: [newRCAAction()],
    };
    return {
      ...base,
      masalahUtama: Array.isArray(base.masalahUtama) ? base.masalahUtama : (base.masalahUtama ? [base.masalahUtama as unknown as string] : [""]),
      actionPlans: (base.actionPlans || [newRCAAction()]).map((ap) => ({
        ...ap,
        keterangan: Array.isArray(ap.keterangan) ? ap.keterangan : (ap.keterangan ? [ap.keterangan as unknown as string] : []),
        output: Array.isArray(ap.output) ? ap.output : (ap.output ? [ap.output as unknown as string] : []),
        evidence: Array.isArray(ap.evidence) ? ap.evidence : (ap.evidence ? [ap.evidence as unknown as string] : []),
      })),
    };
  });

  // Per-block masalah state (each block owns its kenapa A/B/C + action plans)
  const [blocks, setBlocks] = useState<MasalahFormBlock[]>(() => {
    if (existing) {
      const aps = (existing.actionPlans || [newRCAAction()]).map((ap) => ({
        ...ap,
        keterangan: Array.isArray(ap.keterangan) ? ap.keterangan : (ap.keterangan ? [ap.keterangan as unknown as string] : []),
        output: Array.isArray(ap.output) ? ap.output : (ap.output ? [ap.output as unknown as string] : []),
        evidence: Array.isArray(ap.evidence) ? ap.evidence : (ap.evidence ? [ap.evidence as unknown as string] : []),
      }));
      return [{
        id: Math.random().toString(36).slice(2),
        masalahUtama: Array.isArray(existing.masalahUtama) ? existing.masalahUtama[0] || "" : "",
        kenapaA: existing.kenapaA || "",
        kenapaB: existing.kenapaB || "",
        kenapaC: existing.kenapaC || "",
        actionPlans: aps,
      }];
    }
    return [newMasalahFormBlock()];
  });

  const updateBlock = (id: string, patch: Partial<MasalahFormBlock>) =>
    setBlocks((bs) => bs.map((b) => b.id !== id ? b : { ...b, ...patch }));

  const setBlockAP = (blockId: string, apId: string, k: keyof RCAActionPlan, v: RCAActionPlan[typeof k]) =>
    setBlocks((bs) => bs.map((b) => b.id !== blockId ? b : {
      ...b,
      actionPlans: b.actionPlans.map((ap) => ap.id !== apId ? ap : { ...ap, [k]: v }),
    }));

  const addBlockAP = (blockId: string) =>
    setBlocks((bs) => bs.map((b) => b.id !== blockId ? b : { ...b, actionPlans: [...b.actionPlans, newRCAAction()] }));

  const removeBlockAP = (blockId: string, apId: string) =>
    setBlocks((bs) => bs.map((b) => b.id !== blockId ? b : { ...b, actionPlans: b.actionPlans.filter((ap) => ap.id !== apId) }));

  const setBlockMasalahFactor = (blockId: string, factor: "Faktor Internal" | "Faktor Eksternal") =>
    setBlocks((bs) => bs.map((b) => {
      if (b.id !== blockId) return b;
      const body = b.masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "");
      return { ...b, masalahUtama: `[${factor}] ${body}` };
    }));

  const setBlockMasalahText = (blockId: string, val: string) =>
    setBlocks((bs) => bs.map((b) => b.id !== blockId ? b : { ...b, masalahUtama: val }));

  const isBlockComplete = (b: MasalahFormBlock): boolean => {
    const hasFactor = b.masalahUtama.startsWith("[Faktor Internal]") || b.masalahUtama.startsWith("[Faktor Eksternal]");
    const bodyText = hasFactor ? b.masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : "";
    return (
      hasFactor && bodyText.trim().length > 0 &&
      b.kenapaA.trim().length > 0 && b.kenapaB.trim().length > 0 && b.kenapaC.trim().length > 0 &&
      b.actionPlans.some((ap) => ap.action.trim() && ap.targetDate && ap.pic.trim())
    );
  };

  const canAddBlock = () => blocks.length === 0 || isBlockComplete(blocks[blocks.length - 1]);

  const key = pending.rcaKey || `${pending.kpiNo}__${pending.monthId}`;
  const canSave = blocks.length > 0 && blocks.every(isBlockComplete);
  const [confirmSubmitRca, setConfirmSubmitRca] = useState(false);

  const buildEntry = (): RCAEntry => ({
    ...form,
    masalahUtama: blocks.map((b) => b.masalahUtama),
    kenapaA: blocks[0]?.kenapaA || "",
    kenapaB: blocks[0]?.kenapaB || "",
    kenapaC: blocks[0]?.kenapaC || "",
    actionPlans: blocks.flatMap((b) => b.actionPlans),
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 shrink-0 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800">Create New RCA</span>
            <span className="text-xs text-gray-400 ml-2">— {pending.kpiName}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
          <button
            onClick={() => { if (canSave) setConfirmSubmitRca(true); }}
            disabled={!canSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            Submit RCA
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mx-8 mt-4 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 shrink-0">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-600">Target KPI tidak tercapai — RCA wajib diisi sebelum submit KPI Tracking di bulan berjalan.</p>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-400">Bulan</p>
            <p className="text-xs font-semibold text-gray-700">{pending.monthLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-red-400">Pencapaian</p>
            <p className="text-xl font-bold text-red-600">{pending.achievementPct.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-6">

          {/* ── Section 1: Informasi KPI ── */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-[#1A284F]">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Informasi KPI</p>
            </div>
            <div className="p-5 bg-white">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Periode</label>
                  <p className="text-xs text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 min-h-[32px] flex items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{form.periode || "—"}</span>
                  </p>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">KPI</label>
                  <p className="text-xs font-medium text-gray-800 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 min-h-[32px] leading-relaxed">{form.kpi || "—"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Satuan <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                  <p className="text-xs text-gray-700 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{form.satuan || "—"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Baseline <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                  <p className="text-xs text-gray-500 italic px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{form.baseline || "—"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Target (Yearly) <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                  <p className="text-xs font-bold text-[#1A284F] px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{pending.targetYearly || "—"}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Monthly Target <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                  <p className="text-xs font-bold text-[#1A284F] px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{form.target || "—"}</p>
                </div>
              </div>
              <div className="mt-3 max-w-xs">
                <label className="text-[10px] font-bold uppercase tracking-wide text-[#1A284F]">
                  Actual <span className="text-emerald-600 font-semibold normal-case tracking-normal">(dapat diedit)</span>
                </label>
                <input
                  type="text"
                  value={form.actual}
                  onChange={(e) => setForm((prev) => ({ ...prev, actual: e.target.value }))}
                  placeholder="Masukkan nilai actual..."
                  className="mt-1 w-full text-xs font-bold text-gray-800 px-3 py-2 bg-white rounded-lg border border-gray-300 focus:border-[#1A284F] outline-none min-h-[34px]"
                />
              </div>
              <p className="mt-2 text-[10px] text-blue-500 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" /> Periode, KPI, Satuan, Baseline, Target (Yearly), dan Monthly Target terisi otomatis sesuai baris KPI pada tabel KPI Tracking; field Actual dapat disesuaikan.
              </p>
            </div>
          </div>

          {/* ── Section 2: Analisis Akar Masalah (5 Why) ── */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-[#1A284F]">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Analisis Akar Masalah (5 Why)</p>
            </div>
            <div className="p-5 bg-white flex flex-col gap-4">
              {/* Per-block: Masalah Utama + Kenapa A/B/C + Action Plan */}
              {blocks.map((block, bi) => {
                const isInternal  = block.masalahUtama.startsWith("[Faktor Internal]");
                const isEksternal = block.masalahUtama.startsWith("[Faktor Eksternal]");
                const hasFactor   = isInternal || isEksternal;
                const factorKey   = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : "";
                const bodyText    = hasFactor ? block.masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : block.masalahUtama;
                return (
                  <div key={block.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Block header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-[#1A284F]/5 border-b border-gray-200">
                      <span className="text-[11px] font-bold text-[#1A284F] uppercase tracking-widest">
                        Masalah Utama #{bi + 1}
                      </span>
                      {blocks.length > 1 && (
                        <button
                          onClick={() => setBlocks((bs) => bs.filter((b) => b.id !== block.id))}
                          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                        >
                          <X className="w-3 h-3" /> Hapus
                        </button>
                      )}
                    </div>

                    <div className="p-4 flex flex-col gap-4">
                      {/* ── Masalah Utama ── */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Faktor:</span>
                          <span className="text-[9px] text-gray-400">Pilih faktor terlebih dahulu, lalu jelaskan masalahnya</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(["Faktor Internal", "Faktor Eksternal"] as const).map((f) => (
                            <button key={f} type="button" onClick={() => setBlockMasalahFactor(block.id, f)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                                factorKey === f
                                  ? f === "Faktor Internal" ? "bg-blue-600 text-white border-blue-600" : "bg-orange-500 text-white border-orange-500"
                                  : f === "Faktor Internal" ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                              }`}>{f}</button>
                          ))}
                        </div>
                        {(hasFactor || bodyText) ? (
                          <textarea value={bodyText} rows={2}
                            onChange={(e) => setBlockMasalahText(block.id, hasFactor ? `[${factorKey}] ${e.target.value}` : e.target.value)}
                            placeholder={`Jelaskan ${factorKey || "masalah"}…`}
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none bg-gray-50"
                          />
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <Info className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="text-[10px] text-amber-700 font-medium">Pilih Faktor Internal atau Faktor Eksternal di atas untuk melanjutkan mengisi deskripsi masalah</span>
                          </div>
                        )}
                      </div>

                      {/* ── Kenapa A / B / C ── */}
                      <div className="flex flex-col gap-3">
                        {[
                          { fk: "kenapaA" as const, label: "Kenapa A? (B)", hint: "Alasan/kendala sehingga masalah utama terjadi" },
                          { fk: "kenapaB" as const, label: "Kenapa B? (C)", hint: "Alasan/kendala sehingga (B) terjadi" },
                          { fk: "kenapaC" as const, label: "Kenapa C? (D)", hint: "Alasan/kendala sehingga (C) terjadi" },
                        ].map(({ fk, label, hint }) => (
                          <div key={fk} className="flex flex-col gap-1">
                            <label className={`text-[10px] font-bold uppercase tracking-wide ${hasFactor ? "text-gray-500" : "text-gray-300"}`}>{label}</label>
                            {hint && <p className="text-[10px] text-gray-400 -mt-0.5">{hint}</p>}
                            <div className="group relative">
                              <textarea rows={2} value={block[fk]}
                                disabled={!hasFactor}
                                onChange={(e) => updateBlock(block.id, { [fk]: e.target.value })}
                                placeholder={hasFactor ? "—" : "Pilih Faktor terlebih dahulu"}
                                className={F_CLS + " resize-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300"} />
                              {!hasFactor && (
                                <span role="tooltip" className="pointer-events-none invisible absolute left-1/2 top-full z-20 mt-1 w-64 -translate-x-1/2 rounded-lg bg-[#1A284F] px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
                                  Pilih Faktor Internal atau Faktor Eksternal pada Masalah Utama terlebih dahulu untuk mengisi {label}.
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── Action Plan (inside this block) ── */}
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Action Plan</span>
                          <button
                            onClick={() => addBlockAP(block.id)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-[#1A284F] border border-[#1A284F]/30 px-2.5 py-1 rounded-lg hover:bg-[#1A284F]/5 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Tambah Action Plan
                          </button>
                        </div>
                        <div className="p-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                          {block.actionPlans.length === 0 && (
                            <p className="lg:col-span-2 text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                              Klik "Tambah Action Plan" untuk menambahkan.
                            </p>
                          )}
                          {block.actionPlans.map((ap, ai) => (
                            <div key={ap.id} className="border border-gray-100 rounded-xl p-3 bg-white">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Action Plan #{ai + 1}</span>
                                <button onClick={() => removeBlockAP(block.id, ap.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="sm:col-span-2 flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Usulan Tindak Lanjut</label>
                                  <textarea rows={2} value={ap.action}
                                    onChange={(e) => setBlockAP(block.id, ap.id, "action", e.target.value)}
                                    placeholder="Deskripsikan tindak lanjut untuk menyelesaikan kendala..."
                                    className={F_CLS + " resize-none"} />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Target Penyelesaian</label>
                                  <DatePickerID value={ap.targetDate} onChange={(iso) => setBlockAP(block.id, ap.id, "targetDate", iso)} size="sm" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">PIC</label>
                                  <input type="text" value={ap.pic}
                                    onChange={(e) => setBlockAP(block.id, ap.id, "pic", e.target.value)}
                                    placeholder="Nama PIC..." className={F_CLS} />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status Perbaikan</label>
                                  <select value={ap.status}
                                    onChange={(e) => setBlockAP(block.id, ap.id, "status", e.target.value as StatusPerbaikan)}
                                    className={F_CLS}>
                                    {RCA_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <span className={`inline-block w-fit mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${RCA_STATUS_STYLE[ap.status]}`}>{ap.status}</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Keterangan</label>
                                  <RCAListEditor items={ap.keterangan} onChange={(v) => setBlockAP(block.id, ap.id, "keterangan", v)} />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Output</label>
                                  <RCAListEditor items={ap.output} onChange={(v) => setBlockAP(block.id, ap.id, "output", v)} />
                                </div>
                                {ap.status === "Selesai" && (
                                  <div className="sm:col-span-2 flex flex-col gap-1">
                                    <label className="text-[10px] font-bold uppercase tracking-wide text-green-700">Upload Evidence ✎</label>
                                    <RCAMultiFileUpload files={ap.evidence} onChange={(v) => setBlockAP(block.id, ap.id, "evidence", v)} />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Tambah Masalah Utama — gated until current block is complete */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { if (canAddBlock()) setBlocks((bs) => [...bs, newMasalahFormBlock()]); }}
                  disabled={!canAddBlock()}
                  className="flex items-center gap-1.5 text-xs font-semibold border-2 border-dashed rounded-xl px-4 py-3 w-full justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-[#1A284F] border-[#1A284F]/40 hover:bg-[#1A284F]/5 disabled:hover:bg-transparent"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Masalah Utama
                </button>
                {!canAddBlock() && (
                  <p className="text-[10px] text-amber-600 text-center">
                    Lengkapi semua field (Masalah, Kenapa A/B/C, dan minimal satu Action Plan) sebelum menambah masalah baru.
                  </p>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex justify-end gap-3 px-8 py-4 border-t border-gray-200 bg-white shrink-0">
        <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
          Close
        </button>
        <button
          onClick={() => { if (canSave) setConfirmSubmitRca(true); }}
          disabled={!canSave}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Submit RCA
        </button>
      </div>
      {confirmSubmitRca && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => setConfirmSubmitRca(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#1A284F]">Submit Root Cause Analysis (RCA)?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              RCA untuk <strong>{pending.kpiName}</strong> ({pending.monthLabel}) akan disimpan ke menu RCA Measurement (tag RCA berubah kuning) dan dikirim ke approver bersama <strong>Submit KPI Tracking</strong> bulan tsb (Check → Approval 1 → Approval 2 → Validate).
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSubmitRca(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSubmitRca(false);
                  onSave(key, buildEntry(), blocks);
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b]"
              >
                Ya, Submit RCA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">Your KPI Tracking has been submitted for approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Open Lock Request Modal ─────────────────────────────────────────────────

function OpenLockRequestModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <LockOpen className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1A284F] text-base leading-tight">Request Open Lock</h3>
              <p className="text-[11px] text-gray-400">Minta akses pengisian KPI Tracking ke Admin HR</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="px-4 py-3 rounded-xl bg-orange-50 border border-orange-200">
            <p className="text-xs font-semibold text-orange-700">
              Deadline pengisian KPI Tracking: <span className="font-bold">30 Juni 2026</span> telah terlewat.
            </p>
            <p className="text-[11px] text-orange-600 mt-1">
              Request ini akan dikirim ke Admin HR untuk disetujui. Admin akan menentukan batas waktu akses buka.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Alasan Permintaan <span className="text-red-500 normal-case font-normal">*wajib diisi</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tuliskan alasan keterlambatan pengisian KPI Tracking..."
              className="text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-[#1A284F] resize-none placeholder:text-gray-400 transition-colors"
            />
          </div>
        </div>
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel} className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Kirim Request
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Request Modals ─────────────────────────────────────────────────────

const EDIT_REQUEST_APPROVERS = [
  { label: "Approver 1", name: "Ahmad Fauzi",  role: "Supervisor / Atasan Langsung" },
  { label: "Approver 2", name: "Dewi Rahayu", role: "HR Manager" },
];

function EditRequestModal({
  months,
  onCancel,
  onConfirm,
}: {
  months: MonthEntry[];
  onCancel: () => void;
  onConfirm: (targets: { kpiNo: string; monthId: string }[], reason: string) => void;
}) {
  const [selectedKpis, setSelectedKpis] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  const toggleKpi = (no: string) =>
    setSelectedKpis((prev) => (prev.includes(no) ? prev.filter((x) => x !== no) : [...prev, no]));
  const toggleMonth = (id: string) =>
    setSelectedMonths((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const canSubmit = selectedKpis.length > 0 && selectedMonths.length > 0 && reason.trim().length > 0;

  const handleConfirm = () => {
    if (!canSubmit) return;
    const targets: { kpiNo: string; monthId: string }[] = [];
    selectedKpis.forEach((kpiNo) => {
      selectedMonths.forEach((monthId) => {
        targets.push({ kpiNo, monthId });
      });
    });
    onConfirm(targets, reason);
  };

  const sectionA = KPI_ITEMS.filter((k) => k.section === "A");
  const sectionB = KPI_ITEMS.filter((k) => k.section === "B");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileEdit className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1A284F] text-base leading-tight">Request Edit KPI Tracking</h3>
              <p className="text-[11px] text-gray-400">Pilih KPI dan bulan yang ingin diedit, lalu isi alasan</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Approvers */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Request akan dikirim ke</p>
            <div className="flex flex-col gap-2">
              {EDIT_REQUEST_APPROVERS.map((a) => (
                <div key={a.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A284F]/5 border border-[#1A284F]/10">
                  <div className="w-8 h-8 rounded-full bg-[#1A284F] flex items-center justify-center shrink-0">
                    <UserCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1A284F]">{a.name}</p>
                    <p className="text-[10px] text-gray-500">{a.label} · {a.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KPI selection */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Pilih KPI yang ingin diedit{" "}
              <span className="text-red-500 normal-case font-normal">* wajib pilih</span>
            </p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-blue-50 border-b border-gray-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">A. Objective KPI</span>
              </div>
              {sectionA.map((kpi) => (
                <label key={kpi.no} className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                  <input
                    type="checkbox"
                    checked={selectedKpis.includes(kpi.no)}
                    onChange={() => toggleKpi(kpi.no)}
                    className="mt-0.5 accent-[#1A284F]"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-[#1A284F] mr-2">{kpi.no}</span>
                    <span className="text-[11px] text-gray-700">{kpi.kpi.split("\n")[0]}</span>
                  </div>
                </label>
              ))}
              <div className="px-3 py-2 bg-indigo-50 border-b border-gray-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">B. Functional KPI</span>
              </div>
              {sectionB.map((kpi) => (
                <label key={kpi.no} className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                  <input
                    type="checkbox"
                    checked={selectedKpis.includes(kpi.no)}
                    onChange={() => toggleKpi(kpi.no)}
                    className="mt-0.5 accent-[#1A284F]"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-[#1A284F] mr-2">{kpi.no}</span>
                    <span className="text-[11px] text-gray-700">{kpi.kpi.split("\n")[0]}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Month selection */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Pilih Bulan yang ingin diedit{" "}
              <span className="text-red-500 normal-case font-normal">* wajib pilih</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {months.map((m) => {
                const active = selectedMonths.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMonth(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? "bg-[#1A284F] text-white border-[#1A284F]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[#1A284F] hover:text-[#1A284F]"
                    }`}
                  >
                    {displayMonth(m.label)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Alasan Permintaan Edit <span className="text-red-500 normal-case font-normal">*wajib diisi</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tuliskan alasan Anda meminta perubahan pada KPI Tracking yang telah disubmit…"
              className="text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-[#1A284F] resize-none leading-relaxed placeholder:text-gray-400 transition-colors"
            />
            <p className="text-[10px] text-gray-400 text-right">{reason.length} karakter</p>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onCancel} className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Kirim Request
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRequestSuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Request Terkirim</h3>
        <p className="text-gray-500 text-sm mb-1">Permintaan edit KPI Tracking telah dikirimkan ke</p>
        <div className="flex flex-col gap-1 mb-6">
          {EDIT_REQUEST_APPROVERS.map((a) => (
            <p key={a.label} className="text-[#1A284F] font-semibold text-sm">
              {a.name} <span className="text-gray-400 font-normal text-xs">({a.label})</span>
            </p>
          ))}
        </div>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

// ─── KPI Table ────────────────────────────────────────────────────────────────

const PERSP_COLOR: Record<string, string> = {
  "Finansial": "text-blue-700",
  "Proses": "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  "Customer": "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

function KPITable({
  months,
  editable,
  editableMonthId,
  onRemoveMonth,
  onAddMonth,
  cells,
  onCellChange,
  onCellBlur,
  onOpenRCA,
  onViewRCA,
  rcaMap,
  storedRCAStatus,
  approvedEditCells,
  highlightMissingRca,
  kpiItems = KPI_ITEMS,
}: {
  months: MonthEntry[];
  editable: boolean;
  editableMonthId?: string | null;
  onRemoveMonth?: (id: string) => void;
  onAddMonth?: () => void;
  cells: Record<string, Record<CellKey, string>>;
  onCellChange?: (monthId: string, key: CellKey, val: string) => void;
  onCellBlur?: (kpi: KPIItem, monthId: string) => void;
  onOpenRCA?: (kpi: KPIItem, monthId: string, subIdx: number) => void;
  /** Called when user clicks a tag that already has an RCA (status ≠ "none") */
  onViewRCA?: (rcaKey: string, secondaryKey: string, kpiName: string, monthLabel: string) => void;
  rcaMap?: RCAMap;
  storedRCAStatus?: Record<string, RCAStatus>;
  approvedEditCells?: Set<string>;
  /** Highlight tag RCA merah (belum add RCA) saat Submit KPI Tracking diklik */
  highlightMissingRca?: boolean;
  /** Daftar KPI yang ditampilkan (DEMO: kosong untuk non-Administrator yang belum bertransaksi) */
  kpiItems?: KPIItem[];
}) {
  const sectionItems = (sec: string) => kpiItems.filter((k) => k.section === sec);

  const totalCols = 15 + months.length + 2 + (editable ? 1 : 0); // +1 for Total, +1 for Achievement

  const getCellDisplay = (kpi: KPIItem, monthId: string, subIdx: number): string => {
    const sub = kpi.subRows[subIdx];
    if (sub.compute) {
      const getRaw = (idx: number) => cells[monthId]?.[ck(kpi.no, idx)] ?? "";
      return computeCell(kpi.subRows, getRaw, subIdx, kpi.polaritas);
    }
    return cells[monthId]?.[ck(kpi.no, subIdx)] ?? "";
  };

  const renderSectionRows = (sec: string) =>
    sectionItems(sec).map((kpi) =>
      kpi.subRows.map((sub, si) => {
        const isFirst = si === 0;
        const rs = kpi.subRows.length;
        const isComputed = !!sub.compute;

        return (
          <tr key={`${kpi.no}_${si}`} className={`border-t border-gray-200 ${sub.bold ? "bg-gray-50" : "bg-white"}`}>
            {isFirst && (
              <>
                <td rowSpan={rs} className="border border-gray-200 text-center text-xs font-semibold text-gray-600 bg-white align-top py-2 px-2"
                  style={{ position: "sticky", left: 0, zIndex: 12, minWidth: W_NO, maxWidth: W_NO }}>
                  {kpi.no}
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 bg-white"
                  style={{ position: "sticky", left: W_NO, zIndex: 12, minWidth: W_PERSP, maxWidth: W_PERSP }}>
                  <span className={`text-xs font-bold ${PERSP_COLOR[kpi.perspektif] ?? "text-gray-700"}`}>{kpi.perspektif}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 bg-white"
                  style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 12, minWidth: W_KPI, maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}>
                  <p className="text-xs font-medium text-gray-800 whitespace-pre-line leading-relaxed">{kpi.kpi}</p>
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600" style={{ minWidth: 110 }}>{kpi.satuan}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 90 }}>{kpi.formula}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-2 text-center" style={{ minWidth: 64 }}>
                  <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600 leading-relaxed" style={{ minWidth: 220 }}>{kpi.definisi}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600" style={{ minWidth: 155 }}>{kpi.source}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-700 font-medium text-center" style={{ minWidth: 88 }}>
                  {kpi.indicatorMode === "ratio" ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">{kpi.baseline2025}</span>
                  ) : kpi.colorIndicator ? (
                    (() => { const m = kpiBaselineColorMeta(kpi.baseline2025); return m ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border" style={{ background: m.bg, borderColor: m.border, color: m.color }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.dot }} />{kpi.baseline2025}
                      </span>
                    ) : <span>{kpi.baseline2025}</span>; })()
                  ) : kpi.baseline2025}
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs font-bold text-[#1A284F] text-center" style={{ minWidth: 88 }}>
                  {kpi.indicatorMode === "ratio" ? (
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">{kpi.target2026}</span>
                  ) : kpi.colorIndicator ? (
                    (() => { const m = kpiColorBandMeta(kpi.target2026); return m ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border" style={{ background: m.bg, borderColor: m.border, color: m.color }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.dot }} />{kpi.target2026}
                      </span>
                    ) : <span>{kpi.target2026}</span>; })()
                  ) : kpi.target2026}
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-2 text-center" style={{ minWidth: 88 }}>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kpi.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                    {kpi.polaritas}
                  </span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 230 }}>{kpi.detailFormula}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 160 }}>{kpi.keterangan || "—"}</td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 120 }}>
                  {deriveTrackingPeriodeLabel(kpi.satuan, kpi.trackingPeriod)}
                </td>
              </>
            )}

            {/* Sub-row label */}
            <td className={`border border-gray-200 py-2 px-3 text-xs ${sub.bold ? "font-bold text-gray-800" : "text-gray-600"}`} style={{ minWidth: 170 }}>
              <div className="flex items-center gap-1 flex-wrap">
                {sub.label}
                {isComputed && <span className="text-[9px] text-emerald-600 font-normal">(auto)</span>}
                {kpi.indicatorMode === "ratio" && sub.label === "News Negatif" && (
                  <span className="text-[9px] text-red-500 font-normal">(berita negatif)</span>
                )}
                {kpi.indicatorMode === "ratio" && sub.label === "News Positif" && (
                  <span className="text-[9px] text-green-600 font-normal">(min ×{kpi.ratioMultiplier})</span>
                )}
              </div>
            </td>

            {/* Monthly cells */}
            {months.map((m) => {
              const val = getCellDisplay(kpi, m.id, si);
              const isMthEditable = editable && m.id === editableMonthId;
              const isTargetRow = !sub.compute && sub.label.toLowerCase().startsWith("target");
              const isApproved = !isComputed && !isTargetRow && (approvedEditCells?.has(`${kpi.no}::${m.id}`) ?? false);
              const isCellEditable = (isMthEditable && !isTargetRow) || isApproved;
              // Red bg for fillable cells that are still empty
              const isActualRow = !isComputed && !isTargetRow;
              const cellVal = cells[m.id]?.[ck(kpi.no, si)] ?? "";
              const isEmptyActual = isActualRow && !cellVal.trim();
              return (
                <td key={m.id} className={`border text-center text-xs py-1 px-1 ${
                  isEmptyActual
                    ? "bg-red-50 border-red-200"
                    : isComputed ? "bg-emerald-50/80 border-gray-200" : isTargetRow ? "bg-sky-50/70 border-gray-200" : sub.bold ? "bg-green-50/60 border-gray-200" : "bg-green-50 border-gray-200"
                } ${isCellEditable ? "ring-1 ring-inset ring-blue-300" : ""}`} style={{ minWidth: 120 }}>
                  {kpi.colorIndicator && !isComputed && sub.bold ? (
                    /* Target sub-row for color-indicator KPI: read-only colored badge */
                    (() => {
                      const cv = kpi.monthlyTargets?.[m.label] ?? "";
                      const cm = kpiColorBandMeta(cv);
                      return cm ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: cm.bg, borderColor: cm.border, color: cm.color }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cm.dot }} />{cv}
                        </span>
                      ) : <span className="text-gray-300 text-[11px]">—</span>;
                    })()
                  ) : kpi.colorIndicator && !isComputed ? (
                    /* Realisasi sub-row for color-indicator KPI: color select (only editable for last month) */
                    (() => {
                      const cellVal = cells[m.id]?.[ck(kpi.no, si)] ?? "";
                      const cm = kpiColorBandMeta(cellVal);
                      return isCellEditable ? (
                        <select
                          value={cellVal}
                          onChange={(e) => onCellChange?.(m.id, ck(kpi.no, si), e.target.value)}
                          className="w-full text-[10px] font-semibold border rounded-md px-0.5 py-1 outline-none cursor-pointer text-center"
                          style={{ borderColor: cm ? cm.border : "#e5e7eb", color: cm ? cm.color : "#9ca3af", background: cm ? cm.bg : "white" }}
                        >
                          <option value="">—</option>
                          {KPI_COLOR_BANDS.map((o) => (
                            <option key={o.value} value={o.value}>{o.value}</option>
                          ))}
                        </select>
                      ) : (
                        cm ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: cm.bg, borderColor: cm.border, color: cm.color }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cm.dot }} />{cellVal}
                          </span>
                        ) : <span className="text-gray-300 text-[11px]">—</span>
                      );
                    })()
                  ) : isComputed ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className={`font-bold ${getPctColor(val)}`}>{val || "—"}</span>
                      {(() => {
                        const n = parseNum(val);
                        // Hide RCA tag on "% Pencapaian Total" (avg of multiple sub-rows)
                        if (sub.compute?.type === "avg") return null;
                        if (n !== null && n < 100) {
                          const subMeta = getKpiSubItemMeta(kpi, si, m.id);
                          const rcaKey = subMeta.rcaKey;
                          // Derive status: inline rcaMap entry (proper status check), then stored, then none
                          const inlineEntry = rcaMap?.[rcaKey] ?? (!subMeta.isMultiItem ? rcaMap?.[subMeta.legacyRcaKey] : undefined);
                          const secondaryKey = `${subMeta.itemKpiName}__${displayMonth(m.label)}`;
                          const secondaryKeyId = `${subMeta.itemKpiName}__${toIdShortPeriode(m.label)}`;
                          const legacyNameKeyEn = !subMeta.isMultiItem ? `${kpi.kpi.split("\n")[0]}__${displayMonth(m.label)}` : "";
                          const legacyNameKeyId = !subMeta.isMultiItem ? `${kpi.kpi.split("\n")[0]}__${toIdShortPeriode(m.label)}` : "";
                          // Status tersimpan di backend (RCA tersimpan permanen) diprioritaskan agar tag tetap kuning hingga Closed
                          const storedStatus: RCAStatus | undefined =
                            storedRCAStatus?.[rcaKey] ??
                            (!subMeta.isMultiItem ? storedRCAStatus?.[subMeta.legacyRcaKey] : undefined) ??
                            storedRCAStatus?.[secondaryKey] ??
                            storedRCAStatus?.[secondaryKeyId] ??
                            (legacyNameKeyEn ? storedRCAStatus?.[legacyNameKeyEn] : undefined) ??
                            (legacyNameKeyId ? storedRCAStatus?.[legacyNameKeyId] : undefined);
                          const status: RCAStatus = storedStatus
                            ?? (inlineEntry ? (inlineEntryToStatus(inlineEntry) === "closed" ? "closed" : "outstanding") : "none");

                          // Tag only shows color change when RCA has been filled (status ≠ "none")
                          const isFilled = status !== "none";

                          const tagStyle = isFilled
                            ? status === "closed"
                              ? { cls: "bg-green-100 text-green-700 hover:bg-green-200", dot: "bg-green-500", label: "RCA Closed — klik untuk lihat" }
                              : { cls: "bg-amber-100 text-amber-700 hover:bg-amber-200", dot: "bg-amber-500", label: "RCA Outstanding — klik untuk lihat" }
                            : { cls: "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse", dot: "bg-red-500", label: "RCA belum diisi — klik untuk mengisi" };

                          // Filled tag → view-only; unfilled tag → open create form
                          const handleTagClick = isFilled
                            ? () => onViewRCA?.(rcaKey, secondaryKeyId || secondaryKey, subMeta.itemKpiName, displayMonth(m.label))
                            : () => onOpenRCA?.(kpi, m.id, si);

                          const canInteract = isFilled ? !!onViewRCA : !!onOpenRCA;

                          const highlightCls =
                            !isFilled && highlightMissingRca
                              ? " ring-2 ring-red-500 ring-offset-1 scale-110 shadow-[0_0_0_4px_rgba(248,113,113,0.35)]"
                              : "";
                          if (canInteract) {
                            return (
                              <button
                                onClick={handleTagClick}
                                data-rca-missing={!isFilled ? "true" : undefined}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${tagStyle.cls}${highlightCls}`}
                                title={tagStyle.label}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tagStyle.dot}`} />
                                RCA
                              </button>
                            );
                          }
                          return (
                            <span
                              data-rca-missing={!isFilled ? "true" : undefined}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-all ${tagStyle.cls.replace(/ hover:\S+/g, "").replace(" animate-pulse", "")}${highlightCls}`}
                              title={tagStyle.label}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tagStyle.dot}`} />
                              RCA
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  ) : isCellEditable ? (
                    <input
                      type="text"
                      value={cells[m.id]?.[ck(kpi.no, si)] ?? ""}
                      onChange={(e) => onCellChange?.(m.id, ck(kpi.no, si), e.target.value)}
                      placeholder="—"
                      className={`w-full text-center text-xs bg-transparent outline-none ${
                        isEmptyActual
                          ? "placeholder-red-300 text-gray-700"
                          : "placeholder-gray-300 text-gray-700"
                      } ${sub.bold ? "font-bold" : ""}`}
                    />
                  ) : isTargetRow ? (
                    <div className="flex items-center justify-center gap-1">
                      {kpi.indicatorMode === "ratio" ? (
                        <span className="font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full text-[10px]">{val || "—"}</span>
                      ) : (
                        <span className="font-semibold text-sky-700">{val || "—"}</span>
                      )}
                      <Lock className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                    </div>
                  ) : (
                    <span className={sub.bold ? "font-bold text-gray-800" : "text-gray-700"}>{val || "—"}</span>
                  )}
                </td>
              );
            })}

            {/* Total cell */}
            <td className={`border border-gray-200 text-center text-xs py-1 px-2 ${
              isComputed ? "bg-blue-50/80" : sub.bold ? "bg-blue-50/40" : "bg-blue-50/20"
            }`} style={{ minWidth: 120 }}>
              {(() => {
                const total = computeTotal2026(kpi, si, cells, months);
                const colorCls = isComputed || sub.bold
                  ? getPctColor(total)
                  : (total === "—" ? "text-gray-300" : "text-blue-800");
                return (
                  <span className={`${sub.bold ? "font-bold" : ""} ${colorCls}`}>
                    {total}
                  </span>
                );
              })()}
            </td>

            {/* Achievement cell — per KPI (rowSpan) */}
            {isFirst && (() => {
              const ach = computeKPIAchievement(kpi, cells, months);
              const bobotDec = parseBobotDecimal(kpi.bobot);
              const cappedAch = ach !== null ? Math.min(ach, 100) : null;
              const score = cappedAch !== null ? (cappedAch / 100) * bobotDec * 100 : null;
              const achColor = ach !== null
                ? ach >= 100 ? "text-green-700" : "text-rose-600"
                : "text-gray-300";
              return (
                <td rowSpan={rs} className="border border-gray-200 text-center bg-[#0a2a4a]/5 py-2 px-2 align-middle" style={{ minWidth: 110 }}>
                  {ach !== null ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-sm font-bold ${achColor}`}>{ach.toFixed(1)}%</span>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${ach >= 100 ? "bg-green-500" : "bg-rose-500"}`}
                          style={{ width: `${Math.min(ach, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-500">Score</span>
                      <span className={`text-xs font-bold ${achColor}`}>
                        {score !== null ? score.toFixed(2) + "%" : "—"}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              );
            })()}
            {!isFirst && null}

            {editable && isFirst && (
              <td rowSpan={rs} className="border border-gray-200 bg-white" style={{ minWidth: 48 }} />
            )}
            {editable && !isFirst && null}
          </tr>
        );
      })
    );

  return (
    <DualScrollTableContainer className="rounded-xl border border-gray-200 shadow-sm bg-white">
      <table className="border-collapse text-xs" style={{ minWidth: `${W_NO + W_PERSP + W_KPI + 1354 + months.length * 120 + 120 + 110}px` }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 0, zIndex: 25, background: "#1A284F", minWidth: W_NO, maxWidth: W_NO }}>No</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO, zIndex: 25, background: "#1A284F", minWidth: W_PERSP, maxWidth: W_PERSP }}>Perspektif</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 25, background: "#1A284F", minWidth: W_KPI, maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" }}>KPI</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 110 }}>Satuan</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 110 }}>Formula Setahun</th>
            <th className="border border-[#1A284F]/30 py-3 px-2 font-semibold text-center" style={{ minWidth: 64 }}>Bobot</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 220 }}>Definisi</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 155 }}>Source</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Baseline</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Target</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Polaritas</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 230 }}>Detail Formula</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 160 }}>Keterangan</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 120 }}>Periode Tracking</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 170 }}>Tracking</th>
            {months.map((m) => {
              const isEditableMth = editable && m.id === editableMonthId;
              return (
                <th key={m.id} className={`border border-[#1A284F]/30 py-3 px-2 text-center font-semibold ${isEditableMth ? "bg-blue-700" : ""}`} style={{ minWidth: 120 }}>
                  <div className="flex flex-col items-center gap-1">
                    <span>{displayMonth(m.label)}</span>
                    {isEditableMth && (
                      <span className="text-[9px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-full tracking-wide">editable</span>
                    )}
                    {editable && onRemoveMonth && (
                      <button onClick={() => onRemoveMonth(m.id)} className="text-white/40 hover:text-red-300 transition-colors" title="Remove">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
            {/* Total header */}
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0F3460]" style={{ minWidth: 120 }}>
              Total
            </th>
            {/* Achievement header */}
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0a2a4a]" style={{ minWidth: 110 }}>
              Achievement
            </th>
            {editable && (
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center" style={{ minWidth: 48 }}>
                {onAddMonth && <button
                  onClick={onAddMonth}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 transition-colors mx-auto"
                  title="Add month"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>}
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {(() => {
            // Pre-compute section scores for header rows
            const sectionScore = (sec: string) =>
              kpiItems.filter((k) => k.section === sec).reduce((s, k) => {
                const ach = computeKPIAchievement(k, cells, months);
                if (ach === null) return s;
                return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
              }, 0);

            const dynamicSections = kpiItems.length > 0 ? Array.from(new Set(kpiItems.map((k) => k.section))).sort() : [];
            const totalBobot = kpiItems.reduce((s, k) => s + parseFloat(k.bobot.replace("%", "")), 0);
            const totalNilai = dynamicSections.reduce((sum, sec) => sum + sectionScore(sec), 0);
            // colSpan for label = all cols except Achievement (and editable button)
            const labelColSpan = 15 + months.length + 1;
            const secPalette = ["#1565C0", "#1976D2", "#00838F", "#6A1B9A", "#2E7D32", "#EF6C00"];

            const SectionHeader = ({ sec, label, bg, score }: { sec: string; label: string; bg: string; score: number }) => (
              <tr>
                <td colSpan={labelColSpan} className="p-0 text-white text-xs font-bold uppercase tracking-widest border"
                  style={{ background: bg, borderColor: bg }}>
                  <div
                    className="py-2 px-4 inline-flex items-center whitespace-nowrap"
                    style={{ position: "sticky", left: 0, zIndex: 15, background: bg }}
                  >
                    {label}
                  </div>
                </td>
                <td className="py-2 px-2 text-center border text-white text-xs font-bold" style={{ background: bg, borderColor: bg }}>
                  {kpiItems.some((k) => k.section === sec && computeKPIAchievement(k, cells, months) !== null)
                    ? score.toFixed(2) + "%"
                    : "—"}
                </td>
                {editable && <td className="border" style={{ background: bg, borderColor: bg }} />}
              </tr>
            );

            return (
              <>
                {kpiItems.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="border border-gray-200 bg-white px-4 py-10 text-center text-xs text-gray-400">
                      Belum ada data KPI. Tabel KPI akan terisi otomatis setelah pengajuan KPI Setting berstatus Validated.
                    </td>
                  </tr>
                ) : (
                  dynamicSections.map((sec, sIdx) => {
                    const first = kpiItems.find((k) => k.section === sec);
                    const defTitle = sec === "A" ? "Objective KPI — Bobot 20%" : sec === "B" ? "Functional KPI — Bobot 80%" : `Section ${sec}`;
                    const hdrLabel = first?.sectionLabel
                      ? `${sec}. ${first.sectionLabel}${first.sectionBobot ? ` — Bobot ${first.sectionBobot}` : ""}`
                      : `${sec}. ${defTitle}`;
                    const bg = secPalette[sIdx % secPalette.length];
                    return (
                      <React.Fragment key={sec}>
                        <SectionHeader sec={sec} label={hdrLabel} bg={bg} score={sectionScore(sec)} />
                        {renderSectionRows(sec)}
                      </React.Fragment>
                    );
                  })
                )}

                {/* ── Summary rows ── */}
                <tr>
                  <td colSpan={totalCols} className="py-1 border border-[#1A284F]/20 bg-[#1A284F]/5" />
                </tr>
                {([
                  ...dynamicSections.map((sec) => {
                    const first = kpiItems.find((k) => k.section === sec);
                    const sName = first?.sectionLabel || (sec === "A" ? "Objective KPI" : sec === "B" ? "Functional KPI" : `Section ${sec}`);
                    return { label: `${sName} (Section ${sec})`, value: `${kpiItems.filter((k) => k.section === sec).length} KPI` };
                  }),
                  { label: "Total KPI", value: `${kpiItems.length} KPI`, highlight: true },
                  { label: "Total Bobot KPI", value: `${totalBobot.toFixed(0)}%`, highlight: true },
                ] as { label: string; value: string; highlight?: boolean }[]).map(({ label, value, highlight }) => (
                  <tr key={label} className={highlight ? "bg-[#1A284F]/8" : "bg-[#1A284F]/4"}>
                    <td colSpan={labelColSpan} className="border border-gray-200 p-0 text-xs font-bold text-[#1A284F]">
                      <div
                        className="py-2 px-4 inline-flex items-center whitespace-nowrap"
                        style={{ position: "sticky", left: 0, zIndex: 14, background: highlight ? "#eaeef5" : "#f4f6f9" }}
                      >
                        {label}
                      </div>
                    </td>
                    <td className="border border-gray-200 py-2 px-3 text-center text-xs font-bold text-[#1A284F] bg-[#0a2a4a]/8">
                      {value}
                    </td>
                    {editable && <td className="border border-gray-200 bg-white" />}
                  </tr>
                ))}
                {/* ── Total Nilai KPI — special elegant row ── */}
                {(() => {
                  const currentMonthLabel = months.length > 0 ? displayMonth(months[months.length - 1].label) : null;
                  const nilaiColor =
                    totalNilai >= 100
                      ? { row: "bg-emerald-50 border-emerald-200", label: "text-emerald-800", val: "text-emerald-700", valBg: "bg-emerald-100", tag: "bg-emerald-200/80 text-emerald-700 border-emerald-300/70" }
                      : totalNilai >= 75
                      ? { row: "bg-indigo-50 border-indigo-200", label: "text-indigo-800", val: "text-indigo-700", valBg: "bg-indigo-100", tag: "bg-indigo-200/80 text-indigo-700 border-indigo-300/70" }
                      : totalNilai >= 50
                      ? { row: "bg-amber-50 border-amber-200", label: "text-amber-800", val: "text-amber-700", valBg: "bg-amber-100", tag: "bg-amber-200/80 text-amber-700 border-amber-300/70" }
                      : { row: "bg-rose-50 border-rose-200", label: "text-rose-800", val: "text-rose-700", valBg: "bg-rose-100", tag: "bg-rose-200/80 text-rose-700 border-rose-300/70" };
                  return (
                    <tr className={nilaiColor.row}>
                      <td colSpan={labelColSpan} className={`border border-gray-200 p-0 text-sm font-extrabold tracking-wide ${nilaiColor.label}`}>
                        <div
                          className="py-3 px-4 inline-flex items-center whitespace-nowrap"
                          style={{ position: "sticky", left: 0, zIndex: 14 }}
                        >
                          Total Nilai KPI
                        </div>
                      </td>
                      <td className={`border border-gray-200 py-2 px-3 text-center ${nilaiColor.valBg}`}>
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-base font-black tracking-tight ${nilaiColor.val}`}>
                            {totalNilai.toFixed(2)}%
                          </span>
                          {currentMonthLabel && (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${nilaiColor.tag} leading-tight`}>
                              <svg className="w-2 h-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
                              s.d. {currentMonthLabel} · belum final
                            </span>
                          )}
                        </div>
                      </td>
                      {editable && <td className="border border-gray-200" />}
                    </tr>
                  );
                })()}
              </>
            );
          })()}
        </tbody>
      </table>
    </DualScrollTableContainer>
  );
}

// ─── RCA Read-Only Viewer Modal (Format Tabel Gambar 1) ──────────────────────

const AP_STATUS_STYLE: Record<string, string> = {
  "Selesai":             "bg-green-50 text-green-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Belum dilaksanakan":  "bg-red-50 text-red-700",
  "Ditunda":             "bg-purple-50 text-purple-700",
  "Dibatalkan":          "bg-red-100 text-red-700",
};

function RCAReadOnlyModal({
  rcaKey,
  secondaryKey,
  kpiName,
  monthLabel,
  ownerEmployeeId,
  onClose,
  onNavigate,
}: {
  rcaKey: string;
  secondaryKey: string;
  kpiName: string;
  monthLabel: string;
  ownerEmployeeId?: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const sub = React.useMemo(() => {
    const all = loadRCASubmissions(ownerEmployeeId);
    return all.find((s) => s.key === rcaKey) ?? all.find((s) => s.key === secondaryKey) ?? null;
  }, [rcaKey, secondaryKey, ownerEmployeeId]);

  const blocks = sub?.masalahBlocks && sub.masalahBlocks.length > 0
    ? sub.masalahBlocks
    : sub
    ? [{
        id: "flat",
        masalahUtama: sub.masalahUtama.join(" / "),
        kenapaA: sub.kenapaA,
        kenapaB: sub.kenapaB,
        kenapaC: sub.kenapaC,
        actionPlans: sub.actionPlans,
      }]
    : [];

  const totalRows = blocks.reduce((acc, b) => acc + Math.max(1, b.actionPlans.length), 0);
  const th = "border border-[#1A284F]/30 py-3 px-3 text-center font-semibold text-xs whitespace-nowrap";
  const tdBase = "border border-gray-200 align-top py-2 px-3 bg-white text-gray-700";
  const tdAP = "border border-gray-200 align-top py-2 px-3 bg-blue-50/20 text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-base leading-tight">{kpiName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">RCA — {monthLabel} · Format Tabel RCA</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={onNavigate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
            >
              <ArrowLeft className="w-3 h-3 rotate-180" />
              Buka Submenu RCA (Update Progress)
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {!sub ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Data RCA tidak ditemukan.</div>
        ) : (
          <div className="p-6 max-h-[75vh] overflow-y-auto">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="border-collapse text-xs" style={{ minWidth: 1900 }}>
                <thead>
                  <tr className="bg-[#1A284F] text-white">
                    {([
                      ["No",42],["Periode",72],["KPI",160],["Satuan",90],["Baseline",90],["Target",80],["Actual",80],
                      ["Masalah Utama (A)",180],["Kenapa A? (B)",150],["Kenapa B? (C)",150],["Kenapa C? (D)",150],
                      ["Action Plan",180],["Target Penyelesaian",120],["PIC",120],["Status Perbaikan",130],
                      ["Keterangan",160],["Output",160],["Evidence",160],
                    ] as [string, number][]).map(([h, w]) => (
                      <th key={h} className={th} style={{ minWidth: w }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blocks.flatMap((block, bi) => {
                    const isInternal = block.masalahUtama.startsWith("[Faktor Internal]");
                    const isEksternal = block.masalahUtama.startsWith("[Faktor Eksternal]");
                    const hasFactor = isInternal || isEksternal;
                    const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
                    const bodyText = hasFactor ? block.masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : block.masalahUtama;
                    const aps = block.actionPlans.length > 0 ? block.actionPlans : [null];
                    const blockRows = aps.length;
                    return aps.map((ap, ai) => (
                      <tr key={`${bi}_${ai}`} className="border-t border-gray-200">
                        {bi === 0 && ai === 0 && (
                          <>
                            <td rowSpan={totalRows} className={`${tdBase} text-center font-semibold text-gray-600`}>1</td>
                            <td rowSpan={totalRows} className={`${tdBase} text-center`}>
                              <div className="flex flex-col items-center gap-1">
                                <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{sub.periode || "—"}</span>
                                {sub.approvalStatus === "Closed" && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Closed</span>
                                )}
                              </div>
                            </td>
                            <td rowSpan={totalRows} className={`${tdBase} font-medium text-gray-800`}>{sub.kpiIndicator || "—"}</td>
                            <td rowSpan={totalRows} className={`${tdBase} text-gray-600`}>{sub.satuan || "—"}</td>
                            <td rowSpan={totalRows} className={`${tdBase} text-gray-500 italic`}>{sub.baseline || "—"}</td>
                            <td rowSpan={totalRows} className={`${tdBase} text-center font-bold text-[#1A284F]`}>{sub.targetMonthly || "—"}</td>
                            <td rowSpan={totalRows} className={`${tdBase} text-center font-bold text-gray-800`}>{sub.actual || "—"}</td>
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
                            <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaA || "—"}</td>
                            <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaB || "—"}</td>
                            <td rowSpan={blockRows} className={`${tdBase} leading-relaxed`}>{block.kenapaC || "—"}</td>
                          </>
                        )}
                        {ap ? (
                          <>
                            <td className={`${tdAP} leading-relaxed`}>{ap.action || "—"}</td>
                            <td className={`${tdAP} text-center`}>{ap.targetDate || "—"}</td>
                            <td className={tdAP}>{ap.pic || "—"}</td>
                            <td className={`${tdAP} text-center`}>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${AP_STATUS_STYLE[ap.status] ?? "bg-gray-100 text-gray-500"}`}>
                                {ap.status || "—"}
                              </span>
                            </td>
                            <td className={tdAP}>
                              {ap.keterangan.length > 0
                                ? <ul className="flex flex-col gap-0.5">{ap.keterangan.map((k, ki) => <li key={ki} className="text-[10px] leading-relaxed">• {k}</li>)}</ul>
                                : <span className="text-gray-300 text-[10px]">—</span>}
                            </td>
                            <td className={tdAP}>
                              {ap.output.length > 0
                                ? <ul className="flex flex-col gap-0.5">{ap.output.map((o, oi) => <li key={oi} className="text-[10px] leading-relaxed">• {o}</li>)}</ul>
                                : <span className="text-gray-300 text-[10px]">—</span>}
                            </td>
                            <td className={tdAP}>
                              {ap.evidence.length > 0
                                ? <div className="flex flex-col gap-0.5">{ap.evidence.map((ev, ei) => {
                                    const parsed = parseKpiRcaEvidence(ev);
                                    return parsed.url ? (
                                      <a key={ei} href={parsed.url} target="_blank" rel="noreferrer" download={parsed.name} className="flex items-center gap-1 text-[10px] text-green-700 font-medium hover:underline">
                                        <FileText className="w-3 h-3 shrink-0 text-green-600" />{parsed.name}
                                      </a>
                                    ) : (
                                      <span key={ei} className="flex items-center gap-1 text-[10px] text-green-700 font-medium"><FileText className="w-3 h-3 shrink-0 text-green-600" />{parsed.name}</span>
                                    );
                                  })}</div>
                                : <span className="text-gray-300 text-[10px]">—</span>}
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
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">Update progress (Status Perbaikan, Keterangan, Output, Evidence) tersedia melalui View Detail di submenu RCA.</p>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Upload ──────────────────────────────────────────────────────────

interface EvidenceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  dataUrl?: string;
  month: string; // e.g. "Jan-26"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (type.includes("spreadsheet") || type.includes("excel") || type.endsWith(".xlsx")) return "📊";
  if (type.includes("word") || type.endsWith(".docx")) return "📝";
  return "📎";
}

function EvidenceUploadSection({
  files,
  onAdd,
  onRemove,
  editable,
  canDelete = false,
  ownerUser,
  monthLabels,
  uploadMonthLabels,
}: {
  files: EvidenceFile[];
  onAdd: (files: EvidenceFile[]) => void;
  onRemove?: (id: string) => void;
  editable: boolean;
  canDelete?: boolean;
  ownerUser?: ManagedUser;
  monthLabels: string[];
  /** Bulan yang boleh diupload (bulan tracking baru / belum diajukan / revisi) */
  uploadMonthLabels?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectable = uploadMonthLabels ?? monthLabels;
  const [selectedMonth, setSelectedMonth] = useState<string>(selectable[selectable.length - 1] ?? "");
  const [open, setOpen] = useState(true);
  const [staged, setStaged] = useState<{ files: EvidenceFile[]; month: string } | null>(null);

  // Saat bulan tracking baru ditambahkan, otomatis pilih bulan terbaru agar evidence langsung dapat diupload
  const selectableKey = selectable.join("|");
  React.useEffect(() => {
    if (selectable.length && (!selectable.includes(selectedMonth) || selectedMonth !== selectable[selectable.length - 1])) {
      setSelectedMonth(selectable[selectable.length - 1]);
    }
  }, [selectableKey]);

  const handleFiles = (raw: FileList | null) => {
    if (!raw || !selectedMonth) return;
    const rawArr = Array.from(raw);
    Promise.all(
      rawArr.map(
        async (f): Promise<EvidenceFile> => {
          const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          let remoteUrl = "";
          try {
            const up = await uploadEvidenceFileToSupabase(f, {
              employeeId: ownerUser?.employeeId,
              employeeName: ownerUser?.name,
              companyUnit: ownerUser?.company,
              division: ownerUser?.division,
              department: ownerUser?.department,
              position: ownerUser?.position,
              moduleType: "KPI Tracking",
              period: "2026",
              month: selectedMonth,
            });
            if (up && typeof up === "object" && "url" in up && typeof (up as { url?: string }).url === "string") {
              remoteUrl = (up as { url: string }).url;
            }
          } catch {
            remoteUrl = "";
          }
          // Jika berhasil terunggah ke Supabase Storage (https://), jangan simpan Base64 ke localStorage
          if (remoteUrl.startsWith("https://") || remoteUrl.startsWith("http://")) {
            return {
              id,
              name: f.name,
              size: f.size,
              type: f.type,
              url: remoteUrl,
              month: selectedMonth,
            };
          }
          const dataUrl = remoteUrl.startsWith("data:")
            ? remoteUrl
            : await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = () => resolve("");
                reader.readAsDataURL(f);
              });
          return {
            id,
            name: f.name,
            size: f.size,
            type: f.type,
            url: dataUrl || URL.createObjectURL(f),
            dataUrl: dataUrl || undefined,
            month: selectedMonth,
          };
        },
      ),
    ).then((newFiles) => {
      setStaged({ files: newFiles, month: selectedMonth });
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const confirmSave = () => {
    if (!staged) return;
    onAdd(staged.files);
    toast.success(`${staged.files.length} file berhasil disimpan ke bulan ${staged.month}`, {
      description: "Evidence tersimpan.",
      duration: 3000,
    });
    setStaged(null);
  };

  const cancelStaged = () => {
    staged?.files.forEach((f) => { try { URL.revokeObjectURL(f.url); } catch { /* noop */ } });
    setStaged(null);
  };

  const monthsWithFiles = monthLabels.filter((m) => files.some((f) => f.month === m));
  const ungrouped = files.filter((f) => !monthLabels.includes(f.month));

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <Paperclip className="w-4 h-4 text-[#1A284F]" />
          <span className="font-bold text-sm text-[#1A284F]">Evidence Documents</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#1A284F]/10 text-[#1A284F]">
            {files.length} file{files.length !== 1 ? "s" : ""}
          </span>
          {monthLabels.length > 0 && (
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                monthsWithFiles.length === monthLabels.length
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {monthsWithFiles.length}/{monthLabels.length} bulan terpenuhi (Wajib semua bulan)
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <input ref={inputRef} type="file" multiple
            accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp"
            className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {open && (
          <div className="px-4 py-4 flex flex-col gap-3">

            {/* Upload area */}
            {editable && (
              <div className="flex flex-col items-center gap-3 py-5 border border-dashed border-gray-300 rounded-xl bg-gray-50/60 hover:border-[#1A284F]/40 transition-colors">
                <Upload className="w-6 h-6 text-gray-400" />
                <p className="text-xs text-gray-500 text-center">Pilih file evidence untuk bulan</p>
                {selectable.length === 0 ? (
                  <span className="text-xs text-amber-600 font-medium">Tambah bulan KPI dahulu</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1A284F] bg-white font-semibold text-[#1A284F]"
                    >
                      {selectable.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button
                      onClick={() => inputRef.current?.click()}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      Upload
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-gray-400">PDF, PNG, JPG, Excel, Word · maks 20 MB</p>
              </div>
            )}

            {/* File list — wraps horizontally */}
            {files.length === 0 ? (
              !editable && <p className="text-xs text-gray-400 italic text-center py-2">Belum ada evidence yang diupload.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {monthsWithFiles.map((month) => {
                  const monthFiles = files.filter((f) => f.month === month);
                  return (
                    <div key={month}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1A284F] text-white">{month}</span>
                        <span className="text-[10px] text-gray-400">{monthFiles.length} file{monthFiles.length !== 1 ? "s" : ""}</span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {monthFiles.map((f) => (
                          <div key={f.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors max-w-[220px]">
                            <span className="text-sm shrink-0 leading-none">{fileIcon(f.type)}</span>
                            <a href={f.url || f.dataUrl || "#"} download={f.name}
                              className="text-xs font-medium text-[#1A284F] hover:underline truncate" title={f.name}>
                              {f.name}
                            </a>
                            <span className="text-[10px] text-gray-400 shrink-0 ml-1">{formatBytes(f.size)}</span>
                            {canDelete && onRemove && (
                              <button type="button" onClick={() => onRemove(f.id)} className="ml-0.5 text-gray-300 hover:text-red-500 transition-colors shrink-0" title="Hapus evidence">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {ungrouped.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Other</span>
                      <div className="flex-1 h-px bg-gray-100" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ungrouped.map((f) => (
                        <div key={f.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100 max-w-[220px]">
                          <span className="text-sm shrink-0 leading-none">{fileIcon(f.type)}</span>
                          <a href={f.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-[#1A284F] hover:underline truncate" title={f.name}>
                            {f.name}
                          </a>
                          <span className="text-[10px] text-gray-400 shrink-0 ml-1">{f.month} · {formatBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Staged confirm popup modal ── */}
      {staged && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={cancelStaged}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-[#1A284F]/10 flex items-center justify-center shrink-0">
                  <Paperclip className="w-4 h-4 text-[#1A284F]" />
                </div>
                <h3 className="font-bold text-sm text-gray-900">Konfirmasi Simpan Evidence</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {staged.files.length} file akan disimpan ke bulan <span className="font-semibold text-[#1A284F]">{staged.month}</span>. File yang sudah disimpan tidak dapat dihapus.
              </p>
            </div>
            <ul className="px-6 pb-4 flex flex-col gap-1 max-h-48 overflow-y-auto">
              {staged.files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                  <span className="text-sm shrink-0">{fileIcon(f.type)}</span>
                  <span className="text-xs font-medium text-gray-800 flex-1 truncate">{f.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            <div className="px-6 pb-5 flex gap-2 justify-end border-t border-gray-100 pt-4">
              <button onClick={cancelStaged} className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                Batal
              </button>
              <button onClick={confirmSave} className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const MONTH_STATE_STYLE: Record<KpiMonthState, { cls: string; label: string }> = {
  validated: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved & Validated" },
  pending: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Menunggu Approval" },
  revision: { cls: "bg-orange-50 text-orange-700 border-orange-200", label: "Revisi" },
  not_submitted: { cls: "bg-gray-50 text-gray-400 border-gray-200", label: "Belum Submit" },
};

function KpiMonthStatusStrip({ statuses }: { statuses: Array<{ label: string; state: KpiMonthState }> }) {
  return (
    <div className="-mt-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {statuses.map((m) => (
          <span
            key={m.label}
            title={`${displayMonth(m.label)} — ${MONTH_STATE_STYLE[m.state].label}`}
            className={`flex-1 min-w-[48px] text-center rounded-md border px-1.5 py-1 text-[10px] font-semibold ${MONTH_STATE_STYLE[m.state].cls}`}
          >
            {m.label.slice(0, 3)}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500">
        {(["validated", "pending", "not_submitted"] as KpiMonthState[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-sm border ${MONTH_STATE_STYLE[k].cls}`} />
            {MONTH_STATE_STYLE[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function KPIHistorySection({ employeeId }: { employeeId?: string }) {
  const empId = employeeId ?? getActiveUser().employeeId;
  return (
    <ApproverNotesHistory
      employeeId={empId}
      module="KPI"
      phase="measurement"
      title="History Catatan Approver (per Bulan)"
      monthly
    />
  );
}

const BUSINESS_KPI_ITEMS: KPIItem[] = [
  {
    no: "B-1",
    perspektif: "Financial",
    kpi: "Pencapaian EBITDA & Efisiensi Biaya Operasional Group",
    satuan: "%",
    formula: "(Realisasi EBITDA Group / Target EBITDA Group) x 100%",
    bobot: "30%",
    definisi: "Mengukur pencapaian target finansial konsolidasi seluruh unit usaha dalam Group.",
    source: "Laporan Keuangan Konsolidasi Group",
    baseline2025: "96%",
    target2026: "100%",
    polaritas: "Maximize",
    detailFormula: "Cascading dari capaian finansial masing-masing Unit Usaha dalam Group.",
    keterangan: "KPI Business Group — Section A (Objective KPI)",
    section: "A",
    subRows: [
      { label: "Realisasi Konsolidasi Unit (%)" },
      { label: "Target Group (%)" },
      { label: "% Pencapaian", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
    ],
  },
  {
    no: "B-2",
    perspektif: "Internal Business Process",
    kpi: "Produktivitas & Yield Rata-Rata Unit Usaha Group",
    satuan: "%",
    formula: "Rata-rata tertimbang capaian produktivitas seluruh unit usaha",
    bobot: "35%",
    definisi: "Mengukur efektivitas operasional dan produktivitas pabrik/perkebunan lintas unit usaha.",
    source: "Laporan Operasional Bulanan Unit Usaha (Cascading KPI Unit)",
    baseline2025: "94%",
    target2026: "100%",
    polaritas: "Maximize",
    detailFormula: "Cascading otomatis/manual dari indikator KPI Unit masing-masing GM.",
    keterangan: "KPI Business Group — Section B (Functional KPI)",
    section: "B",
    subRows: [
      { label: "Realisasi Yield Group (%)" },
      { label: "Target Yield Group (%)" },
      { label: "% Pencapaian", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
    ],
  },
  {
    no: "B-3",
    perspektif: "EHS & Quality",
    kpi: "Zero Major Accident & Pemenuhan Standar Mutu Ekspor Group",
    satuan: "%",
    formula: "(Jumlah Audit/Pengiriman Lulus Standar / Total) x 100%",
    bobot: "35%",
    definisi: "Memastikan kepatuhan K3L dan standar mutu produk di seluruh unit usaha Group.",
    source: "Laporan QA & EHS Konsolidasi Group",
    baseline2025: "98%",
    target2026: "100%",
    polaritas: "Maximize",
    detailFormula: "Evaluasi bulanan lintas unit usaha dalam Group.",
    keterangan: "KPI Business Group — Section B (Functional KPI)",
    section: "B",
    subRows: [
      { label: "Realisasi Kepatuhan Mutu & EHS (%)" },
      { label: "Target Standar (%)" },
      { label: "% Pencapaian", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
    ],
  },
];

function KPIWorkspace({
  ownerOverride,
  forcedTab,
  delegationAccess,
  actorName,
  hideHeader,
  workspaceLabel,
}: {
  ownerOverride?: ManagedUser;
  forcedTab?: "business" | "personal";
  delegationAccess?: DelegationAccess;
  actorName?: string;
  hideHeader?: boolean;
  workspaceLabel?: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const portalBase = React.useMemo(() => {
    const firstSeg = location.pathname.split("/").filter(Boolean)[0];
    if (firstSeg === "hr" || firstSeg === "bod" || firstSeg === "supervisor" || firstSeg === "employee") {
      return `/${firstSeg}`;
    }
    return "/employee";
  }, [location.pathname]);
  const actorUser = getActiveUser();
  const activeUser = ownerOverride ?? actorUser;
  const canCreate = !delegationAccess || Boolean(delegationAccess.create);
  const canEdit = !delegationAccess || Boolean(delegationAccess.edit);
  const canDelete = !delegationAccess || Boolean(delegationAccess.delete);
  const canSubmit = canCreate || canEdit;
  const isViewOnly = Boolean(delegationAccess && !canCreate && !canEdit && !canDelete);

  const isDirectorMode = isDirectorRoleOrGrouping(activeUser);
  const isGmMode = !isDirectorMode && activeUser.role === "GM";
  const hasDualKpiTabs = !forcedTab && (isDirectorMode || isGmMode);
  const [directorKpiTabState, setDirectorKpiTab] = useState<"business" | "personal">(forcedTab ?? "business");
  const directorKpiTab = forcedTab ?? directorKpiTabState;
  const isBusinessWorkspace = forcedTab ? forcedTab === "business" : (hasDualKpiTabs && directorKpiTab === "business");

  const groupName = getGroupNameForUnit(activeUser.company);
  const groupUnits = getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits);
  const businessScopeKey = isDirectorMode ? `group:${groupName}` : `unit:${activeUser.company}`;

  const [view, setView] = useState<PageView>(() => (isViewOnly ? "preview" : "input"));
  const [months, setMonths] = useState<MonthEntry[]>(() => loadKPITracking(activeUser.employeeId).months);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitted, setSubmitted] = useState(() => loadSubmitState(activeUser.employeeId).submitted);
  const [submittedDate, setSubmittedDate] = useState(() => loadSubmitState(activeUser.employeeId).submittedDate);
  const [showEditRequest, setShowEditRequest] = useState(false);
  const [showEditRequestSuccess, setShowEditRequestSuccess] = useState(false);
  const [pendingEditRequest, setPendingEditRequest] = useState(false);
  const [editRequestDate, setEditRequestDate] = useState<string>("");
  const [rcaMap, setRcaMap] = useState<RCAMap>({});
  const [storedRCAStatus, setStoredRCAStatus] = useState<Record<string, RCAStatus>>(() =>
    buildStoredRCAStatusMap(loadRCASubmissions(activeUser.employeeId))
  );
  const [pendingRCA, setPendingRCA] = useState<PendingRCA | null>(null);
  const [viewingRCA, setViewingRCA] = useState<{ rcaKey: string; secondaryKey: string; kpiName: string; monthLabel: string } | null>(null);

  // Sync storedRCAStatus when the RCAPage writes to localStorage
  const [, setWfRefreshTick] = useState(0);
  React.useEffect(() => {
    const sync = () => {
      setStoredRCAStatus(buildStoredRCAStatusMap(loadRCASubmissions(activeUser.employeeId)));
      const st = loadSubmitState(activeUser.employeeId);
      setSubmitted(st.submitted);
      setSubmittedDate(st.submittedDate);
      setEvidenceFiles(loadEvidenceFiles(activeUser.employeeId));
      const ol = readOpenLockState();
      setOpenLockRequested(ol.requested);
      setOpenLockApproved(ol.approved);
      setWfRefreshTick((v) => v + 1);
    };
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("appraisal-updated", sync);
    window.addEventListener("pa-auth-updated", sync);
    window.addEventListener("pa-db-hydrated", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("appraisal-updated", sync);
      window.removeEventListener("pa-auth-updated", sync);
      window.removeEventListener("pa-db-hydrated", sync);
    };
  }, []);

  // Deadline lock flow (tersinkron ke pa_open_lock_requests_v1 di Supabase)
  const [showOpenLockModal, setShowOpenLockModal] = useState(false);
  const readOpenLockState = () => {
    try {
      const list = loadPersistedState<Array<{ employeeId?: string; module?: string; status?: string; approvalNote?: string }>>("pa_open_lock_requests_v1", []);
      const normId = normalizeEmployeeId(activeUser.employeeId);
      const mine = (Array.isArray(list) ? list : []).filter(
        (r) => normalizeEmployeeId(String(r.employeeId ?? "")) === normId && String(r.module ?? "").toLowerCase().includes("kpi"),
      );
      const latest = mine[0];
      return {
        requested: mine.some((r) => r.status === "pending"),
        approved: mine.some((r) => r.status === "approved"),
        rejected: latest?.status === "rejected",
        note: String(latest?.approvalNote ?? "").trim(),
      };
    } catch {
      return { requested: false, approved: false, rejected: false, note: "" };
    }
  };
  const [openLockRequested, setOpenLockRequested] = useState(() => readOpenLockState().requested);
  const [openLockApproved, setOpenLockApproved] = useState(() => readOpenLockState().approved);
  const [openLockRejected, setOpenLockRejected] = useState(() => readOpenLockState().rejected);
  const [openLockNote, setOpenLockNote] = useState(() => readOpenLockState().note);

  // Edit request approval flow
  const [editRequestApproved, setEditRequestApproved] = useState(false);
  const [approvedEditTargets, setApprovedEditTargets] = useState<{ kpiNo: string; monthId: string }[]>([]);

  // Sesuaikan penguncian KPI Tracking dengan tanggal aktual yang di-setup di Module Activation (/hr/modules)
  const kpiSettingGate = (() => {
    const normId = normalizeEmployeeId(activeUser.employeeId);
    const wfSetting = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "KPI" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase()),
    );
    const stVal = wfSetting?.decisions.validator?.status ?? "";
    const stA2 = wfSetting?.decisions.approver2?.status ?? "";
    const stA1 = wfSetting?.decisions.approver1?.status ?? "";
    const stChk = wfSetting?.decisions.checker?.status ?? "";
    const isVal = Boolean(stVal === "Validated" || stA2 === "Validated");
    let statusText = "Belum Disubmit";
    if (isVal) {
      statusText = "Validated";
    } else if (stVal === "Revision" || stA2 === "Revision" || stA1 === "Revision" || stChk === "Revision") {
      statusText = "Revision";
    } else if (stA2 === "Approved" || stA2.startsWith("Assessed")) {
      statusText = "Pending-Validate (HR ICF)";
    } else if (stA1 === "Approved" || stA1.startsWith("Assessed")) {
      statusText = "Pending-Approver 2";
    } else if (stChk && stChk !== "Revision") {
      statusText = "Pending-Approver 1";
    } else if (wfSetting) {
      statusText = "Submitted · Pending Check HR Unit";
    }
    return { isValidated: isVal, statusText };
  })();
  const isKpiSettingValidated = kpiSettingGate.isValidated;

  // S5 & KB7 & KB12: Tabel KPI Tracking (Personal, Unit, Group) hanya terisi jika KPI Setting sudah berstatus Validated/Approved
  // dan isinya disinkronkan 100% dengan definisi KPI di KPI Setting.
  const storedPersonalSettings = (() => {
    try {
      const normId = normalizeEmployeeId(activeUser.employeeId);
      const raw = localStorage.getItem("pa_kpi_setting_by_emp_v2");
      const map = raw ? (JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>) : {};
      return map[normId] ?? map[activeUser.employeeId] ?? [];
    } catch {
      return [];
    }
  })();
  const trackingKpiItems: KPIItem[] = isKpiSettingValidated
    ? (storedPersonalSettings.length > 0 ? mapStoredSettingRowsToTrackingItems(storedPersonalSettings) : [])
    : [];

  const isBusinessSettingApproved = (() => {
    try {
      const raw = localStorage.getItem("pa_kpi_business_status_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, { approved?: boolean }>) : {};
      const key = isDirectorMode ? `corporate-${groupName}` : `unit-${activeUser.company}`;
      return Boolean(map[key]?.approved);
    } catch {
      return false;
    }
  })();
  const storedBusinessSettings = (() => {
    try {
      const raw = localStorage.getItem("pa_kpi_business_by_scope_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, Array<Record<string, unknown>>>) : {};
      const key = isDirectorMode ? `corporate-${groupName}` : `unit-${activeUser.company}`;
      return map[key] ?? [];
    } catch {
      return [];
    }
  })();
  const businessTrackingItems: KPIItem[] = isBusinessSettingApproved
    ? (storedBusinessSettings.length > 0 ? mapStoredSettingRowsToTrackingItems(storedBusinessSettings) : [])
    : [];

  const kpiMeasurementModuleInfo = (() => {
    try {
      const mods = loadLiveModuleActivationList("2026");
      return mods.find(
        (m) =>
          m.id === "kpi-measurement" ||
          m.id === "kpi_measurement" ||
          m.label.toLowerCase().includes("kpi · measurement"),
      );
    } catch {
      return undefined;
    }
  })();

  const isDeadlinePassed = (() => {
    try {
      const kpiMeasMod = kpiMeasurementModuleInfo;
      if (!kpiMeasMod) return false;
      if (kpiMeasMod.active === false && Boolean(kpiMeasMod.startDate || kpiMeasMod.endDate || kpiMeasMod.dateLockPerMonth)) return true;
      if (kpiMeasMod.dateLockPerMonth) {
        const rawLock = String(kpiMeasMod.dateLockPerMonth).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawLock)) {
          const lockTs = new Date(`${rawLock}T23:59:59`).getTime();
          if (Number.isFinite(lockTs) && Date.now() > lockTs) return true;
        } else {
          const dayNum = parseInt(rawLock, 10);
          if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
            if (new Date().getDate() > dayNum) return true;
          }
        }
      }
      if (kpiMeasMod.endDate) {
        const endTs = new Date(`${kpiMeasMod.endDate}T23:59:59`).getTime();
        if (Number.isFinite(endTs)) {
          return Date.now() > endTs;
        }
      }
      return false;
    } catch {
      return false;
    }
  })();
  const isCurrentTabValidated = isBusinessWorkspace ? isBusinessSettingApproved : isKpiSettingValidated;
  const isLockedByDeadline = !isCurrentTabValidated || (isDeadlinePassed && !submitted && !openLockApproved);
  const approvedEditCells =
    editRequestApproved && approvedEditTargets.length > 0
      ? new Set(approvedEditTargets.map((t) => `${t.kpiNo}::${t.monthId}`))
      : undefined;

  const [cellsMap, setCellsMap] = useState<Record<string, Record<CellKey, string>>>(() => {
    const snap = loadKPITracking(activeUser.employeeId);
    return snap.cellsMap;
  });

  // Persist months + cells to Supabase backend per owner employee
  React.useEffect(() => {
    saveKPITracking({ months, cellsMap }, activeUser);
  }, [months, cellsMap, activeUser.employeeId]);

  // Persist submitted state per owner employee
  React.useEffect(() => {
    saveSubmitState(submitted, submittedDate, activeUser.employeeId);
  }, [submitted, submittedDate, activeUser.employeeId]);

  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>(() => loadEvidenceFiles(activeUser.employeeId));

  // Simpan evidence di luar state updater (menghindari setState saat render & event sinkronisasi yang menimpa list)
  const addEvidence = (files: EvidenceFile[]) => {
    const merged = [...evidenceFiles, ...files].filter((f, i, arr) => arr.findIndex((x) => x.id === f.id) === i);
    setEvidenceFiles(merged);
    saveEvidenceFiles(merged, activeUser.employeeId);
  };

  const removeEvidence = (id: string) => {
    const next = evidenceFiles.filter((f) => f.id !== id);
    setEvidenceFiles(next);
    saveEvidenceFiles(next, activeUser.employeeId);
  };

  const updateCell = (monthId: string, key: CellKey, val: string) =>
    setCellsMap((prev) => ({
      ...prev,
      [monthId]: { ...(prev[monthId] ?? {}), [key]: val },
    }));

  const openRCA = (kpi: KPIItem, monthId: string, subIdx?: number) => {
    const month = months.find((m) => m.id === monthId);
    const mCells = { ...(month?.cells ?? {}), ...(cellsMap[monthId] ?? {}) };
    const getRaw = (idx: number) => mCells[ck(kpi.no, idx)] ?? "";
    const effectiveSubIdx =
      subIdx ?? kpi.subRows.findIndex((s) => Boolean(s.compute && s.compute.type !== "avg"));
    const subMeta = getKpiSubItemMeta(kpi, Math.max(0, effectiveSubIdx), monthId);

    let target: string;
    let actual: string;
    let achievementPct: number;

    if (subIdx !== undefined) {
      // Clicked from a specific % Pencapaian row — use that sub-row's actual/target
      const computeSub = kpi.subRows[subIdx];
      const spec = computeSub?.compute;
      const val = computeCell(kpi.subRows, getRaw, subIdx, kpi.polaritas);
      const n = parseNum(val);
      achievementPct = n !== null ? Math.min(n, 100) : 0;
      if (achievementPct >= 100) return;

      if (spec?.type === "ratio") {
        target = getRaw(spec.targetIdx) || kpi.monthlyTargets?.[month?.label ?? ""] || kpi.target2026;
        actual = getRaw(spec.actualIdx);
      } else if (spec?.type === "inverse_ratio") {
        target = getRaw(spec.denomIdx) || kpi.monthlyTargets?.[month?.label ?? ""] || kpi.target2026;
        actual = getRaw(spec.numIdx);
      } else if (spec?.type === "threshold") {
        target = `${spec.target}`;
        actual = getRaw(spec.actualIdx);
      } else if (spec?.type === "ratio_score") {
        target = getRaw(spec.negIdx) || kpi.monthlyTargets?.[month?.label ?? ""] || kpi.target2026;
        actual = getRaw(spec.posIdx);
      } else {
        const tIdx = kpi.subRows.findIndex((s) => !s.compute && s.label.toLowerCase().startsWith("target"));
        target = (tIdx >= 0 ? getRaw(tIdx) : "") || kpi.monthlyTargets?.[month?.label ?? ""] || kpi.target2026;
        const aIdx = kpi.subRows.findIndex((s) => !s.compute && !s.label.toLowerCase().startsWith("target"));
        actual = aIdx >= 0 ? getRaw(aIdx) : "";
      }
    } else {
      // Called from cell blur — use lowest achievement across all computed sub-rows
      const lowest = getLowestAchievement(kpi, monthId, cellsMap);
      if (lowest === null || lowest >= 100) return;
      achievementPct = lowest;
      const tIdx = kpi.subRows.findIndex((s) => !s.compute && s.label.toLowerCase().startsWith("target"));
      target = tIdx >= 0
        ? (cellsMap[monthId]?.[ck(kpi.no, tIdx)] ?? kpi.monthlyTargets?.[month?.label ?? ""] ?? kpi.target2026)
        : (kpi.monthlyTargets?.[month?.label ?? ""] ?? kpi.target2026);
      const aIdx = kpi.subRows.findIndex((s) => !s.compute);
      actual = aIdx >= 0 ? (cellsMap[monthId]?.[ck(kpi.no, aIdx)] ?? "") : "";
    }

    setPendingRCA({
      rcaKey: subMeta.rcaKey,
      kpiNo: kpi.no,
      subIdx: effectiveSubIdx >= 0 ? effectiveSubIdx : undefined,
      monthId,
      monthLabel: month?.label ?? monthId,
      kpiName: subMeta.itemKpiName,
      achievementPct,
      satuan: kpi.satuan,
      baseline: subMeta.itemBaseline,
      target,
      targetYearly: subMeta.itemTargetYearly,
      actual,
    });
  };

  // RCA modal opens only via explicit RCA tag click — not on cell blur
  const handleCellBlur = (_kpi: KPIItem, _monthId: string) => {};

  const addMonth = (entry: MonthEntry) => {
    setMonths((prev) => [...prev, entry]);
    if (isBusinessWorkspace) {
      setBusinessCellsMap((prev) => {
        const next = { ...prev, [entry.id]: entry.cells };
        persistBusinessCells(next);
        return next;
      });
    } else {
      setCellsMap((prev) => ({ ...prev, [entry.id]: entry.cells }));
    }
    // Bulan tracking baru (belum tervalidasi) membuka kembali mode input & upload Evidence Documents
    setSubmitted(false);
    setView("input");
  };

  const removeMonth = (id: string) => {
    setMonths((prev) => prev.filter((m) => m.id !== id));
    if (isBusinessWorkspace) {
      setBusinessCellsMap((prev) => {
        const n = { ...prev };
        delete n[id];
        persistBusinessCells(n);
        return n;
      });
    } else {
      setCellsMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const handleExport = () => {
    const targetList = isBusinessWorkspace ? businessTrackingItems : trackingKpiItems;
    const activeMap = isBusinessWorkspace ? businessCellsMap : cellsMap;
    // Bila belum ada bulan tracking ditambahkan, sediakan kolom bulan awal Jan-26 sebagai template pengisian
    const exportMonths: MonthEntry[] =
      months.length > 0 ? months : [{ id: "jan26", label: "Jan-26", cells: {} }];
    const monthLabels = exportMonths.map((m) => m.label);

    const fixedHeaders = [
      "No","Perspektif","KPI","Satuan","Formula Setahun","Bobot","Definisi","Source",
      "Baseline","Target","Polaritas","Detail Formula","Keterangan","Periode Tracking","Tracking",
    ];
    const allHeaders = [...fixedHeaders, ...monthLabels, "Total", "Achievement"];
    const totalColCount = allHeaders.length;
    const colWidths = [
      7, 16, 32, 14, 15, 10, 28, 18, 13, 13, 12, 28, 22, 16, 18,
      ...monthLabels.map(() => 13),
      13, 14,
    ];

    const rowsOut: StyledExcelCell[][] = [];
    const merges: StyledExcelMerge[] = [];
    const rowHeights: Record<number, number> = { 0: 28 };

    const headerRow: StyledExcelCell[] = allHeaders.map((h, ci) => ({
      value: h,
      style: {
        bg:
          ci === allHeaders.length - 1
            ? EXCEL_THEME.headerAchBg
            : ci === allHeaders.length - 2
            ? EXCEL_THEME.headerTotalBg
            : ci >= fixedHeaders.length
            ? EXCEL_THEME.headerSubNavyBg
            : EXCEL_THEME.headerNavyBg,
        fg: EXCEL_THEME.white,
        bold: true,
        align: "center",
        vAlign: "center",
        borderColor: "334155",
      },
    }));
    rowsOut.push(headerRow);

    const dynamicSections = Array.from(new Set(targetList.map((k) => k.section || "A"))).sort();
    const secPalette = ["1565C0", "1976D2", "00838F", "6A1B9A", "2E7D32", "EF6C00"];

    dynamicSections.forEach((sec, sIdx) => {
      const secKpis = targetList.filter((k) => (k.section || "A") === sec);
      const first = secKpis[0];
      const defTitle = sec === "A" ? "Objective KPI — Bobot 20%" : sec === "B" ? "Functional KPI — Bobot 80%" : `Section ${sec}`;
      const secTitle = first?.sectionLabel
        ? `${sec}. ${first.sectionLabel}${first.sectionBobot ? ` — Bobot ${first.sectionBobot}` : ""}`
        : `${sec}. ${defTitle}`;
      const secBg = secPalette[sIdx % secPalette.length];

      const secScore = secKpis.reduce((acc, k) => {
        const ach = computeKPIAchievement(k, activeMap, exportMonths);
        if (ach === null) return acc;
        return acc + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
      }, 0);
      const hasAnyAch = secKpis.some((k) => computeKPIAchievement(k, activeMap, exportMonths) !== null);

      const bannerIdx = rowsOut.length;
      const bannerCells: StyledExcelCell[] = Array.from({ length: totalColCount }, (_, ci) => ({
        value: ci === 0 ? secTitle : ci === totalColCount - 1 ? (hasAnyAch ? `${secScore.toFixed(2)}%` : "—") : "",
        style: { bg: secBg, fg: EXCEL_THEME.white, bold: true, align: ci === totalColCount - 1 ? "center" : "left", vAlign: "center", borderColor: secBg },
      }));
      rowsOut.push(bannerCells);
      rowHeights[bannerIdx] = 24;
      merges.push({ sRow: bannerIdx, sCol: 0, eRow: bannerIdx, eCol: totalColCount - 2 });

      secKpis.forEach((kpi, kIdx) => {
        const startRow = rowsOut.length;
        const rs = kpi.subRows.length;
        const ach = computeKPIAchievement(kpi, activeMap, exportMonths);
        const achStr = ach !== null ? `${ach.toFixed(2)}%` : "—";
        const pTrack = deriveTrackingPeriodeLabel(kpi.satuan, kpi.trackingPeriod);

        kpi.subRows.forEach((sub, si) => {
          const isComp = Boolean(sub.compute);
          const rowBg = isComp ? "F1F5F9" : kIdx % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
          const fixedVals = [
            kpi.no, kpi.perspektif, kpi.kpi, kpi.satuan, kpi.formula, kpi.bobot,
            kpi.definisi, kpi.source, kpi.baseline2025, kpi.target2026,
            kpi.polaritas, kpi.detailFormula, kpi.keterangan || "—", pTrack,
          ];
          const fixedCells: StyledExcelCell[] = fixedVals.map((val, fIdx) => ({
            value: si === 0 ? val : "",
            style: { ...inferSystemCellStyle(fixedHeaders[fIdx], val, kIdx), vAlign: "top" },
          }));

          const trackingLabelCell: StyledExcelCell = {
            value: sub.label,
            style: { bg: rowBg, fg: isComp ? EXCEL_THEME.headerNavyBg : EXCEL_THEME.textDark, bold: Boolean(sub.bold || isComp), align: "left" },
          };

          const mCells: StyledExcelCell[] = exportMonths.map((m) => {
            const val = isComp
              ? computeCell(kpi.subRows, (idx) => activeMap[m.id]?.[ck(kpi.no, idx)] ?? "", si, kpi.polaritas)
              : (activeMap[m.id]?.[ck(kpi.no, si)] ?? (sub.label.toLowerCase().startsWith("target") ? (kpi.monthlyTargets?.[m.label] ?? kpi.target2026 ?? "") : ""));
            return {
              value: val,
              style: isComp ? inferSystemCellStyle("Achievement", val, kIdx) : { bg: rowBg, fg: EXCEL_THEME.textDark, align: "center" },
            };
          });

          const totalVal = computeTotal2026(kpi, si, activeMap, exportMonths);
          const totalCell: StyledExcelCell = {
            value: totalVal,
            style: isComp ? inferSystemCellStyle("Achievement", totalVal, kIdx) : { bg: rowBg, fg: EXCEL_THEME.headerNavyBg, bold: true, align: "center" },
          };
          const achCell: StyledExcelCell = {
            value: si === 0 ? achStr : "",
            style: { ...inferSystemCellStyle("Achievement", achStr, kIdx), vAlign: "center" },
          };

          const curIdx = rowsOut.length;
          rowsOut.push([...fixedCells, trackingLabelCell, ...mCells, totalCell, achCell]);
          rowHeights[curIdx] = 22;
        });

        if (rs > 1) {
          for (let ci = 0; ci < 14; ci++) {
            merges.push({ sRow: startRow, sCol: ci, eRow: startRow + rs - 1, eCol: ci });
          }
          merges.push({ sRow: startRow, sCol: totalColCount - 1, eRow: startRow + rs - 1, eCol: totalColCount - 1 });
        }
      });
    });

    const fname = isBusinessWorkspace
      ? (isDirectorMode ? `KPI_Tracking_Group_${groupName.replace(/\s+/g, "_")}_2026.xlsx` : `KPI_Tracking_Unit_${activeUser.company.replace(/[^A-Za-z0-9]+/g, "_")}_2026.xlsx`)
      : `KPI_Tracking_Personal_${activeUser.employeeId}_2026.xlsx`;
    exportStyledXLSX(fname, {
      sheetName: "KPI Tracking",
      colWidths,
      rowHeights,
      rows: rowsOut,
      merges,
    });
  };

  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const matrix = parseXLSXMatrix(buf);
      if (matrix.length === 0) return;

      const hdrRowIdx = matrix.findIndex((r) => r.some((c) => /^no$/i.test(c.trim())) && r.some((c) => /^tracking$/i.test(c.trim())));
      if (hdrRowIdx < 0) {
        toast.error("Format kolom tidak dikenali. Gunakan file hasil Download dari KPI Tracking.");
        return;
      }
      const headers = matrix[hdrRowIdx].map((h) => h.trim());
      const noIdx = headers.findIndex((h) => /^no$/i.test(h));
      const trackingColIdx = headers.findIndex((h) => /^tracking$/i.test(h));
      const totalIdx = headers.findIndex((h) => /^total$/i.test(h));
      const monthStartIdx = trackingColIdx + 1;
      const monthEndIdx = totalIdx > monthStartIdx ? totalIdx : headers.length - 1;
      const rawMonthCols = headers.slice(monthStartIdx, monthEndIdx).filter(Boolean);

      // Normalisasi label bulan (mis. "Jan 2026" -> "Jan-26" atau "Jan-26" tetap "Jan-26")
      const normalizeImportedMonthLabel = (rawLbl: string): string => {
        const clean = rawLbl.trim();
        if (MONTH_OPTIONS.includes(clean)) return clean;
        const mMatch = clean.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
        if (mMatch) {
          const cap = mMatch[1][0].toUpperCase() + mMatch[1].slice(1, 3).toLowerCase();
          return `${cap}-26`;
        }
        return clean;
      };

      const nextMonths: MonthEntry[] = [...months];
      const labelToMonthId: Record<string, string> = {};
      nextMonths.forEach((m) => { labelToMonthId[m.label] = m.id; });

      const targetList = isBusinessWorkspace ? businessTrackingItems : trackingKpiItems;
      rawMonthCols.forEach((rawM) => {
        const normLbl = normalizeImportedMonthLabel(rawM);
        if (!MONTH_OPTIONS.includes(normLbl)) return;
        if (!labelToMonthId[normLbl]) {
          const newId = normLbl.toLowerCase().replace(/[^a-z0-9]/g, "");
          const pre = getPrefilledCells(normLbl, targetList);
          nextMonths.push({ id: newId, label: normLbl, cells: pre });
          labelToMonthId[normLbl] = newId;
        }
      });

      const baseCells = isBusinessWorkspace ? businessCellsMap : cellsMap;
      const newCellsMap: Record<string, Record<CellKey, string>> = { ...baseCells };
      const kpiByNo = new Map(targetList.map((k) => [k.no, k]));

      let currentKpiNo = "";
      const subRowCounter: Record<string, number> = {};

      for (let ri = hdrRowIdx + 1; ri < matrix.length; ri++) {
        const r = matrix[ri];
        if (r.every((c) => !String(c ?? "").trim())) continue;
        // Abaikan baris Section Banner & baris Summary bawah
        const firstVal = String(r[noIdx] ?? "").trim();
        const trackingLabel = String(r[trackingColIdx] ?? "").trim();
        if (/^[A-Z]\.\s+/i.test(firstVal) && !trackingLabel) continue;
        if (/^(total kpi|total bobot|total nilai)/i.test(firstVal) || /\(section [A-Z]\)/i.test(firstVal)) continue;

        if (firstVal && kpiByNo.has(firstVal)) {
          currentKpiNo = firstVal;
        }
        if (!currentKpiNo) continue;
        const kpiObj = kpiByNo.get(currentKpiNo);
        if (!kpiObj) continue;

        let si = subRowCounter[currentKpiNo] ?? 0;
        if (trackingLabel) {
          const matchedSi = kpiObj.subRows.findIndex((sr) => sr.label.toLowerCase() === trackingLabel.toLowerCase());
          if (matchedSi >= 0) si = matchedSi;
        }
        subRowCounter[currentKpiNo] = si + 1;

        const subDef = kpiObj.subRows[si];
        if (!subDef || subDef.compute) continue; // baris % Pencapaian dihitung otomatis

        rawMonthCols.forEach((rawM, li) => {
          const normLbl = normalizeImportedMonthLabel(rawM);
          const mId = labelToMonthId[normLbl];
          if (!mId) return;
          const cellVal = String(r[monthStartIdx + li] ?? "").trim();
          if (!newCellsMap[mId]) newCellsMap[mId] = {} as Record<CellKey, string>;
          newCellsMap[mId][ck(currentKpiNo, si)] = cellVal;
        });
      }

      setMonths(nextMonths);
      if (isBusinessWorkspace) {
        setBusinessCellsMap(newCellsMap);
        persistBusinessCells(newCellsMap);
      } else {
        setCellsMap(newCellsMap);
      }
      toast.success("Data KPI Tracking berhasil di-upload dan disimpan.");
    } catch {
      toast.error("Gagal membaca file Excel KPI Tracking.");
    }
  };

  const [showEvidenceWarn, setShowEvidenceWarn] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [tableScale, setTableScale] = useState<KpiTableScale>("md");

  const toggleTableFullscreen = () => {
    setIsTableFullscreen((prev) => {
      const next = !prev;
      dispatchTableFullscreen(next);
      return next;
    });
  };

  const cycleTableScale = () => {
    setTableScale((prev) => (prev === "md" ? "sm" : prev === "sm" ? "lg" : "md"));
  };

  React.useEffect(() => {
    return () => {
      dispatchTableFullscreen(false);
    };
  }, []);

  const [businessCellsMap, setBusinessCellsMap] = useState<Record<string, Record<CellKey, string>>>(() => {
    try {
      const byScope = JSON.parse(localStorage.getItem("kpi_business_tracking_cells_v2") ?? "{}");
      if (byScope?.[businessScopeKey]) return byScope[businessScopeKey];
      const raw = localStorage.getItem("kpi_business_tracking_cells_v1");
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {};
  });
  const persistBusinessCells = (next: Record<string, Record<CellKey, string>>) => {
    try {
      const byScope = JSON.parse(safeGetLocalRaw("kpi_business_tracking_cells_v2") ?? "{}") ?? {};
      byScope[businessScopeKey] = next;
      safeSetLocalJson("kpi_business_tracking_cells_v2", byScope);
    } catch {
      // ignore
    }
    void mergeKvMapRecord("kpi_business_tracking_cells_v2", businessScopeKey, next);
    savePersistedState("kpi_business_tracking_cells_v1", next);
  };
  const updateBusinessCell = (monthId: string, key: CellKey, val: string) => {
    setBusinessCellsMap((prev) => {
      const next = {
        ...prev,
        [monthId]: { ...(prev[monthId] ?? {}), [key]: val },
      };
      persistBusinessCells(next);
      return next;
    });
  };

  const kpiMonthStatuses = getKpiMonthStatuses(activeUser.employeeId);
  const validatedMonthLabels = new Set(
    kpiMonthStatuses.filter((m) => m.state === "validated").map((m) => m.label),
  );

  const [highlightRca, setHighlightRca] = useState(false);
  // Bulan yang akan diajukan pada Submit KPI Tracking (belum tervalidasi)
  const submitMonthLabels = months.filter((m) => !validatedMonthLabels.has(m.label)).map((m) => m.label);
  // Bulan yang boleh diupload Evidence: belum diajukan atau sedang Revisi (termasuk bulan tracking baru)
  const monthStateByLabel = new Map(kpiMonthStatuses.map((m) => [m.label, m.state] as const));
  const evidenceUploadMonths = months
    .map((m) => m.label)
    .filter((label) => {
      const st = monthStateByLabel.get(label) ?? "not_submitted";
      return st === "not_submitted" || st === "revision" || (!submitted && st !== "validated");
    });
  // Tag RCA merah (pencapaian < 100% tetapi belum add RCA) pada bulan yang akan diajukan
  const missingRcaTags = (() => {
    const out: Array<{ kpiNo: string; monthId: string; monthLabel: string; kpiName: string }> = [];
    for (const m of months) {
      if (validatedMonthLabels.has(m.label)) continue;
      for (const kpi of (isBusinessWorkspace ? businessTrackingItems : trackingKpiItems)) {
        kpi.subRows.forEach((sub, si) => {
          if (!sub.compute || sub.compute.type === "avg") return;
          const getRaw = (idx: number) => cellsMap[m.id]?.[ck(kpi.no, idx)] ?? "";
          const n = parseNum(computeCell(kpi.subRows, getRaw, si, kpi.polaritas));
          if (n === null || n >= 100) return;
          const subMeta = getKpiSubItemMeta(kpi, si, m.id);
          const inlineEntry = rcaMap[subMeta.rcaKey] ?? (!subMeta.isMultiItem ? rcaMap[subMeta.legacyRcaKey] : undefined);
          const status: RCAStatus = inlineEntry
            ? inlineEntryToStatus(inlineEntry)
            : storedRCAStatus[subMeta.rcaKey] ??
              (!subMeta.isMultiItem ? storedRCAStatus[subMeta.legacyRcaKey] : undefined) ??
              storedRCAStatus[`${subMeta.itemKpiName}__${displayMonth(m.label)}`] ??
              storedRCAStatus[`${subMeta.itemKpiName}__${toIdShortPeriode(m.label)}`] ??
              (!subMeta.isMultiItem ? storedRCAStatus[`${kpi.kpi.split("\n")[0]}__${displayMonth(m.label)}`] : undefined) ??
              (!subMeta.isMultiItem ? storedRCAStatus[`${kpi.kpi.split("\n")[0]}__${toIdShortPeriode(m.label)}`] : undefined) ??
              "none";
          if (status === "none") {
            out.push({ kpiNo: kpi.no, monthId: m.id, monthLabel: m.label, kpiName: subMeta.itemKpiName });
          }
        });
      }
    }
    return out;
  })();

  // Poin 6 & 7: Validasi wajib sudah ada aksi pengisian bulan KPI DAN upload evidence wajib untuk SEMUA bulan
  const kpiSubmitValidation = (() => {
    const reasons: string[] = [];
    const pendingMonths = months.filter((m) => !validatedMonthLabels.has(m.label));
    if (months.length === 0) {
      reasons.push("Belum ada bulan KPI Tracking yang ditambahkan (+ Add Month).");
    } else if (pendingMonths.length === 0) {
      reasons.push("Semua bulan sudah tervalidasi. Tambahkan bulan berikutnya (+ Add Month) untuk diajukan.");
    } else {
      let hasAnyActualInput = false;
      const incompleteMonths: string[] = [];
      for (const m of pendingMonths) {
        const mCells = cellsMap[m.id] ?? m.cells ?? {};
        let monthHasEmpty = false;
        const targetList = isBusinessWorkspace ? businessTrackingItems : trackingKpiItems;
        const activeMap = isBusinessWorkspace ? (businessCellsMap[m.id] ?? {}) : mCells;
        for (const kpi of targetList) {
          for (let si = 0; si < kpi.subRows.length; si++) {
            const sub = kpi.subRows[si];
            if (sub.compute) continue;
            if (sub.label.toLowerCase().startsWith("target")) continue;
            const v = String(activeMap[ck(kpi.no, si)] ?? "").trim();
            if (v.length > 0 && v !== "—") {
              hasAnyActualInput = true;
            } else {
              monthHasEmpty = true;
            }
          }
        }
        if (monthHasEmpty) {
          incompleteMonths.push(m.label);
        }
      }
      if (!hasAnyActualInput) {
        reasons.push("Belum ada nilai aktual KPI yang diisi.");
      } else if (incompleteMonths.length > 0) {
        reasons.push(`Nilai aktual belum lengkap pada bulan: ${incompleteMonths.join(", ")}.`);
      }

      if (missingRcaTags.length > 0) {
        const byMonth = Array.from(new Set(missingRcaTags.map((t) => t.monthLabel)));
        reasons.push(
          `Masih ada ${missingRcaTags.length} tag RCA merah (belum add RCA) pada bulan ${byMonth.join(", ")}. Lengkapi RCA hingga tag berwarna kuning.`,
        );
      }

      const monthsWithoutEvidence = pendingMonths
        .map((m) => m.label)
        .filter((mLabel) => !evidenceFiles.some((f) => f.month === mLabel));
      if (monthsWithoutEvidence.length > 0) {
        reasons.push(`Evidence Documents wajib diupload untuk bulan: ${monthsWithoutEvidence.join(", ")}.`);
      }
    }
    return {
      canSubmit: reasons.length === 0,
      reasons,
    };
  })();

  const handleSubmitClick = () => {
    if (!kpiSubmitValidation.canSubmit) {
      setShowEvidenceWarn(true);
      if (missingRcaTags.length > 0) {
        // Otomatis highlight tag RCA yang masih merah lembut (belum add RCA)
        setHighlightRca(true);
        if (view !== "input") setView("input");
        window.setTimeout(() => {
          document.querySelector('[data-rca-missing="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
        window.setTimeout(() => setHighlightRca(false), 6000);
      }
      return;
    }
    setShowEvidenceWarn(false);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    const _d = new Date();
    const dateStr = `${String(_d.getDate()).padStart(2, "0")}/${String(_d.getMonth() + 1).padStart(2, "0")}/${_d.getFullYear()}`;
    setSubmittedDate(dateStr);
    // KPI Tracking & RCA bulan yang diajukan dikirim bersamaan ke approver (Checker → AP1 → AP2 → Validator)
    submitWorkflowModule("KPI", "measurement", dateStr, activeUser.employeeId, submitMonthLabels);
    const rcaSubmitted = submitRCAsForMonths(activeUser.employeeId, submitMonthLabels);
    setStoredRCAStatus(buildStoredRCAStatusMap(loadRCASubmissions(activeUser.employeeId)));
    toast.success(
      `KPI Tracking ${submitMonthLabels.join(", ")}${rcaSubmitted ? ` & ${rcaSubmitted} RCA` : ""} berhasil dikirim ke approver.`,
    );
    setView("preview");
  };

  const handlePullCascadingFromUnits = () => {
    if (months.length === 0) {
      toast.error("Tambahkan bulan tracking terlebih dahulu.");
      return;
    }
    const next: Record<string, Record<CellKey, string>> = { ...businessCellsMap };
    for (const m of months) {
      next[m.id] = {
        ...(next[m.id] ?? {}),
        [ck("B-1", 0)]: "98",
        [ck("B-1", 1)]: "100",
        [ck("B-2", 0)]: "96",
        [ck("B-2", 1)]: "100",
        [ck("B-3", 0)]: "100",
        [ck("B-3", 1)]: "100",
      };
    }
    setBusinessCellsMap(next);
    persistBusinessCells(next);
    toast.success(`Nilai realisasi indikator turunan berhasil di-cascade dari ${groupUnits.length} Unit Usaha (${groupName}).`);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {delegationAccess && (
        <DelegatedWorkspaceBanner
          delegator={activeUser}
          actorName={actorName || actorUser.name}
          access={delegationAccess}
          moduleLabel={workspaceLabel || "KPI Tracking"}
        />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {!hideHeader && (
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[28px] font-bold text-[#1A284F]">KPI Tracking</h1>
            {!submitted && !isViewOnly && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-blue-50 border border-blue-300 text-blue-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Draft Mode
              </span>
            )}
          </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-gray-500 text-sm">2026 Performance Appraisal</p>

            {isGmMode && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Role GM ({activeUser.company}) — 2 Tab: KPI (Unit) &amp; KPI (Personal)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {view === "input" && !isLockedByDeadline && !isViewOnly && (
            <>
              {canCreate && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Month
                </button>
              )}
              <button
                onClick={() => setView("preview")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <button
                      type="button"
                      aria-disabled={!kpiSubmitValidation.canSubmit}
                      onClick={handleSubmitClick}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors ${kpiSubmitValidation.canSubmit ? "" : "opacity-50 cursor-not-allowed"}`}
                    >
                      <Send className="w-4 h-4" />
                      Submit KPI Tracking
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs bg-[#1A284F] text-white p-3 rounded-xl shadow-lg">
                  {kpiSubmitValidation.canSubmit ? (
                    <p className="text-[11px]">Semua tag RCA bulan {submitMonthLabels.join(", ")} sudah kuning & Evidence Documents sudah diupload. Klik untuk submit KPI Tracking & RCA ke approver.</p>
                  ) : (
                    <>
                      <p className="font-bold text-xs mb-1">Belum dapat Submit KPI Tracking:</p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-white/90">
                        {kpiSubmitValidation.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                      {missingRcaTags.length > 0 && <p className="mt-1.5 text-[10px] text-red-200">Klik tombol untuk menyorot tag RCA merah.</p>}
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {view === "preview" && (
            <>
              {!submitted && !isLockedByDeadline && !isViewOnly && (
                <button
                  onClick={() => setView("input")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Back to Edit
                </button>
              )}
              {!submitted && !isLockedByDeadline && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex">
                      <button
                        type="button"
                        aria-disabled={!kpiSubmitValidation.canSubmit}
                        onClick={handleSubmitClick}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors ${kpiSubmitValidation.canSubmit ? "" : "opacity-50 cursor-not-allowed"}`}
                      >
                        <Send className="w-4 h-4" />
                        Submit KPI Tracking
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs bg-[#1A284F] text-white p-3 rounded-xl shadow-lg">
                    {kpiSubmitValidation.canSubmit ? (
                      <p className="text-[11px]">Semua tag RCA bulan {submitMonthLabels.join(", ")} sudah kuning & Evidence Documents sudah diupload. Klik untuk submit KPI Tracking & RCA ke approver.</p>
                    ) : (
                      <>
                        <p className="font-bold text-xs mb-1">Belum dapat Submit KPI Tracking:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-white/90">
                          {kpiSubmitValidation.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                        {missingRcaTags.length > 0 && <p className="mt-1.5 text-[10px] text-red-200">Klik tombol untuk menyorot tag RCA merah.</p>}
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
              {submitted && !pendingEditRequest && !editRequestApproved && canEdit && (
                <button
                  onClick={() => setShowEditRequest(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  <FileEdit className="w-4 h-4" />
                  Edit Request
                </button>
              )}
              {submitted && pendingEditRequest && !editRequestApproved && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Pending Edit Approval
                  </span>
                  <button
                    onClick={() => setPendingEditRequest(false)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel Request
                  </button>
                </div>
              )}
            </>
          )}
          {isCurrentTabValidated && <ExportImportButton onExport={handleExport} onImport={!submitted && !isLockedByDeadline && !isViewOnly && (canCreate || canEdit) ? handleImport : undefined} />}
        </div>
      </div>

      <ModuleApprovalStatusBar
        module="KPI"
        phase="measurement"
        submittedOverride={submitted}
        submittedDateOverride={submittedDate}
        employeeId={activeUser.employeeId}
      />
      <KpiMonthStatusStrip statuses={kpiMonthStatuses} />

      {/* Gate Banner: KPI Setting belum Validated */}
      {!isCurrentTabValidated && (
        <div className="flex items-start gap-3 flex-wrap px-4 py-3.5 rounded-xl border border-amber-300 bg-amber-50">
          <Lock className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">
              KPI Tracking Terkunci — KPI Setting Belum Berstatus Validated
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Anda belum dapat melakukan tindakan atau mengisi KPI Tracking karena pengajuan{" "}
              <strong>{isBusinessWorkspace ? (isDirectorMode ? "KPI (Group) Setting" : "KPI (Unit) Setting") : "KPI Setting"}</strong> belum berstatus <strong>Validated</strong>
              {!isBusinessWorkspace ? <> (status saat ini: <span className="font-bold underline">{kpiSettingGate.statusText}</span>)</> : null}. Sesuai aturan referensi PA, tabel KPI Tracking akan otomatis terisi setelah KPI Setting berstatus Validated.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
            <Lock className="w-3.5 h-3.5" /> Terkunci
          </span>
        </div>
      )}

      {/* Deadline lock banners (berdasarkan Date Lock Per Month / End Date di /hr/modules) */}
      {isCurrentTabValidated && isLockedByDeadline && !openLockRequested && (
        <div className="flex items-start gap-3 flex-wrap px-4 py-3 rounded-xl border border-red-200 bg-red-50">
          <Lock className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">KPI Tracking Terkunci (Date Lock Terlewat)</p>
            <p className="text-xs text-red-600 mt-0.5">
              Batas waktu pengisian KPI Tracking{kpiMeasurementModuleInfo?.dateLockPerMonth ? <> (Date Lock Per Month: <span className="font-bold">tanggal {kpiMeasurementModuleInfo.dateLockPerMonth}</span>)</> : kpiMeasurementModuleInfo?.endDate ? <> (<span className="font-bold">{kpiMeasurementModuleInfo.endDate}</span>)</> : null} telah terlewat. Silakan ajukan <strong>Request Open Lock</strong> ke <strong>HR ICF</strong> untuk membuka pengisian dan submit data.
            </p>
          </div>
          <button
            onClick={() => setShowOpenLockModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
          >
            <LockOpen className="w-4 h-4" />
            Request Open Lock
          </button>
        </div>
      )}

      {isLockedByDeadline && openLockRequested && !openLockApproved && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-orange-200 bg-orange-50">
          <Lock className="w-4 h-4 shrink-0 text-orange-600" />
          <span className="text-sm font-medium text-orange-700 flex-1">
            Request Open Lock sedang menunggu persetujuan HR ICF.
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Menunggu Persetujuan
          </span>
        </div>
      )}

      {isLockedByDeadline && !openLockRequested && !openLockApproved && openLockRejected && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700">
              Request Open Lock ditolak oleh Admin HR.
            </p>
            {openLockNote && (
              <p className="text-xs text-red-600 mt-1">
                <span className="font-semibold">Catatan untuk Karyawan:</span> {openLockNote}
              </p>
            )}
          </div>
        </div>
      )}

      {showEvidenceWarn ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Syarat Submit KPI Tracking belum terpenuhi:</p>
            <ul className="list-disc pl-4 text-xs text-amber-700 mt-1 space-y-0.5">
              {kpiSubmitValidation.reasons.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
          <button type="button" onClick={() => setShowEvidenceWarn(false)} className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : isDeadlinePassed && openLockApproved && !submitted && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-green-200 bg-green-50">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-700">
              Akses telah dibuka oleh HR ICF. Anda dapat melengkapi dan submit KPI Tracking.
            </p>
            {openLockNote && (
              <p className="text-xs text-green-700 mt-1">
                <span className="font-semibold">Catatan untuk Karyawan:</span> {openLockNote}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Edit request approved banner */}
      {editRequestApproved && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-blue-200 bg-blue-50">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
          <span className="text-sm font-medium text-blue-700 flex-1">
            Akses edit diberikan. Hanya sel KPI dan bulan yang dipilih dalam request yang dapat diubah.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditRequestApproved(false); setApprovedEditTargets([]); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Batal Edit
            </button>
            <button
              onClick={() => {
                setEditRequestApproved(false);
                setApprovedEditTargets([]);
                setPendingEditRequest(false);
                { const _d = new Date(); setSubmittedDate(`${String(_d.getDate()).padStart(2,"0")}/${String(_d.getMonth()+1).padStart(2,"0")}/${_d.getFullYear()}`); }
              }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
            >
              <Send className="w-3 h-3" /> Re-submit
            </button>
          </div>
        </div>
      )}

      {view === "preview" && !submitted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border bg-amber-50 border-amber-200 text-amber-700">
          <Eye className="w-4 h-4 shrink-0" />
          Preview mode — review all data carefully before submitting.
        </div>
      )}

      {submitted && pendingEditRequest && !editRequestApproved && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-amber-200 bg-amber-50">
          <FileEdit className="w-4 h-4 shrink-0 text-amber-600" />
          <span className="text-sm font-medium text-amber-700">Request edit has been submitted.</span>
          <div className="w-px h-4 bg-amber-300 mx-1" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700/60">Submission Info</span>
          <div className="w-px h-4 bg-amber-300" />
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">Date Submitted:</span>
            <span className="font-bold text-gray-800">{editRequestDate || "—"}</span>
          </div>
          <div className="w-px h-4 bg-amber-300" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500">Approval Status:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-400 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Supervisor 1
            </span>
          </div>
        </div>
      )}

      {hasDualKpiTabs && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-gray-200 flex-wrap gap-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setDirectorKpiTab("business")}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  directorKpiTab === "business"
                    ? "border-[#1A284F] text-[#1A284F] bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {isDirectorMode ? "KPI (Group)" : "KPI (Unit)"}
              </button>
              <button
                type="button"
                onClick={() => setDirectorKpiTab("personal")}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  directorKpiTab === "personal"
                    ? "border-[#1A284F] text-[#1A284F] bg-white"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                KPI (Personal)
              </button>
            </div>
            {isDirectorMode && directorKpiTab === "business" && (
              <div className="flex items-center gap-2 pb-2">
                <span className="text-xs text-gray-500">
                  Cakupan Konsolidasi: <strong>{groupName}</strong> ({groupUnits.length} Unit Usaha)
                </span>
                <button
                  type="button"
                  onClick={handlePullCascadingFromUnits}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  Ambil Nilai Cascading dari KPI Unit
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {(() => {
        const activeTrackingList = isBusinessWorkspace ? businessTrackingItems : trackingKpiItems;
        const totalTrackingBobot = activeTrackingList.reduce(
          (sum, k) => sum + (parseFloat(String(k.bobot ?? "").replace("%", "")) || 0),
          0,
        );
        const formattedTrackingBobot = Number.isInteger(totalTrackingBobot)
          ? String(totalTrackingBobot)
          : totalTrackingBobot.toFixed(1);
        return (
          <div
            className={
              isTableFullscreen
                ? `fixed top-16 bottom-[41px] left-0 md:left-20 right-0 z-40 bg-white overflow-y-auto p-4 md:p-6 flex flex-col gap-3 shadow-2xl border-t border-gray-200 ${getKpiTableScaleClasses(tableScale)}`
                : `flex flex-col gap-3 ${getKpiTableScaleClasses(tableScale)}`
            }
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] bg-[#1A284F]/5 border border-[#1A284F]/15 px-2.5 py-1 rounded-full">
                  <Edit3 className="w-3.5 h-3.5" />
                  {view === "input" && !submitted && !isLockedByDeadline && !isViewOnly ? "Edit Mode" : "View Mode"}
                </span>
                <KpiTableDisplayControls
                  isFullscreen={isTableFullscreen}
                  onToggleFullscreen={toggleTableFullscreen}
                  tableScale={tableScale}
                  onCycleScale={cycleTableScale}
                />
                <div className="flex items-center gap-2 px-3 py-1 bg-[#1A284F]/5 rounded-lg">
                  <span className="text-xs font-bold text-[#1A284F]">Total KPI:</span>
                  <span className="text-xs font-bold text-[#1A284F]">{activeTrackingList.length}</span>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${Math.round(totalTrackingBobot * 100) === 10000 ? "bg-green-50" : "bg-orange-50"}`}>
                  <span className={`text-xs font-bold ${Math.round(totalTrackingBobot * 100) === 10000 ? "text-green-700" : "text-orange-700"}`}>Total Bobot:</span>
                  <span className={`text-xs font-bold ${Math.round(totalTrackingBobot * 100) === 10000 ? "text-green-700" : "text-orange-700"}`}>{formattedTrackingBobot}%</span>
                </div>
              </div>
              {isTableFullscreen && isCurrentTabValidated && (
                <div className="flex items-center gap-2 flex-wrap">
                  <ExportImportButton onExport={handleExport} onImport={!submitted && !isLockedByDeadline && !isViewOnly && (canCreate || canEdit) ? handleImport : undefined} size="sm" />
                </div>
              )}
            </div>

            <KPITable
              kpiItems={activeTrackingList}
              months={months}
              editable={view === "input" && !submitted && !isLockedByDeadline && !isViewOnly}
              editableMonthId={(!submitted && !isLockedByDeadline && !isViewOnly && (canEdit || canCreate) && months.length > 0 && !validatedMonthLabels.has(months[months.length - 1].label)) ? months[months.length - 1].id : null}
              onRemoveMonth={canDelete ? removeMonth : undefined}
              onAddMonth={canCreate ? () => setShowAddModal(true) : undefined}
              cells={isBusinessWorkspace ? businessCellsMap : cellsMap}
              onCellChange={canEdit || canCreate ? (isBusinessWorkspace ? updateBusinessCell : updateCell) : undefined}
              onCellBlur={handleCellBlur}
              onOpenRCA={canCreate || canEdit ? openRCA : undefined}
              onViewRCA={(rcaKey, secondaryKey, kpiName, monthLabel) =>
                setViewingRCA({ rcaKey, secondaryKey, kpiName, monthLabel })
              }
              rcaMap={rcaMap}
              storedRCAStatus={storedRCAStatus}
              approvedEditCells={approvedEditCells}
              highlightMissingRca={highlightRca}
            />
          </div>
        );
      })()}

      {/* Sisi owner: tabel RCA disembunyikan; riwayat RCA diakses melalui tag RCA (kuning) pada tabel KPI */}

      <EvidenceUploadSection
        files={evidenceFiles}
        onAdd={addEvidence}
        onRemove={canDelete ? removeEvidence : undefined}
        canDelete={canDelete && !submitted && !isLockedByDeadline}
        ownerUser={activeUser}
        editable={!isViewOnly && (canCreate || canEdit) && ((!isLockedByDeadline && evidenceUploadMonths.length > 0) || editRequestApproved)}
        monthLabels={months.map((m) => m.label)}
        uploadMonthLabels={editRequestApproved ? months.map((m) => m.label) : evidenceUploadMonths}
      />

      <KPIHistorySection employeeId={activeUser.employeeId} />


      {showAddModal && (
        <AddMonthModal
          existingLabels={months.map((m) => m.label)}
          kpiItems={isBusinessWorkspace ? businessTrackingItems : trackingKpiItems}
          onAdd={addMonth}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {pendingRCA && (
        <RCAModal
          pending={pendingRCA}
          existing={rcaMap[pendingRCA.rcaKey] ?? rcaMap[`${pendingRCA.kpiNo}__${pendingRCA.monthId}`]}
          onSave={(key, entry, blocks) => {
            setRcaMap((p) => ({ ...p, [key]: entry }));
            const ml = pendingRCA!.monthLabel;
            const today = new Date();
            const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
            const storedBlocks: StoredMasalahBlock[] = blocks.map((b) => ({
              id: b.id,
              masalahUtama: b.masalahUtama,
              kenapaA: b.kenapaA,
              kenapaB: b.kenapaB,
              kenapaC: b.kenapaC,
              actionPlans: b.actionPlans,
            }));
            saveRCASubmission({
              employeeId: activeUser.employeeId,
              key,
              id: key,
              submittedDate: iso,
              periode: toIdShortPeriode(ml),
              monthLabel: ml,
              year: "20" + (ml.split("-")[1] ?? "26"),
              kpiIndicator: pendingRCA!.kpiName,
              approvalStatus: "Pending-Check",
              targetMonthly: pendingRCA!.target,
              actual: entry.actual || pendingRCA!.actual,
              achievementPct: pendingRCA!.achievementPct,
              satuan: pendingRCA!.satuan,
              baseline: pendingRCA!.baseline,
              targetYearly: pendingRCA!.targetYearly,
              masalahBlocks: storedBlocks,
              masalahUtama: entry.masalahUtama,
              kenapaA: entry.kenapaA,
              kenapaB: entry.kenapaB,
              kenapaC: entry.kenapaC,
              actionPlans: entry.actionPlans,
            });
            // Refresh storedRCAStatus so tag color updates immediately
            setStoredRCAStatus(buildStoredRCAStatusMap(loadRCASubmissions(activeUser.employeeId)));
          }}
          onClose={() => setPendingRCA(null)}
        />
      )}
      {viewingRCA && (
        <RCAReadOnlyModal
          rcaKey={viewingRCA.rcaKey}
          secondaryKey={viewingRCA.secondaryKey}
          kpiName={viewingRCA.kpiName}
          monthLabel={viewingRCA.monthLabel}
          ownerEmployeeId={activeUser.employeeId}
          onClose={() => setViewingRCA(null)}
          onNavigate={() => { setViewingRCA(null); navigate(`${portalBase}/measurement/rca`); }}
        />
      )}
      {showConfirm && (
        <ConfirmModal
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
          months={submitMonthLabels}
          rcaCount={loadRCASubmissions(activeUser.employeeId).filter((r) => submitMonthLabels.includes(r.monthLabel) && r.approvalStatus !== "Closed" && r.approvalStatus !== "Validated").length}
        />
      )}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
      {showOpenLockModal && (
        <OpenLockRequestModal
          onCancel={() => setShowOpenLockModal(false)}
          onConfirm={(reasonText: string) => {
            setShowOpenLockModal(false);
            setOpenLockRequested(true);
            setOpenLockRejected(false);
            setOpenLockNote("");
            const list = loadPersistedState<Array<Record<string, unknown>>>("pa_open_lock_requests_v1", []);
            const reqId = `OL-${Date.now()}`;
            const newReq = {
              id: reqId,
              employeeId: activeUser.employeeId,
              employeeName: activeUser.name,
              nip: activeUser.employeeId,
              companyUnit: activeUser.company,
              divisi: activeUser.division || "-",
              departemen: activeUser.department || "-",
              bagian: activeUser.bagian || "-",
              posisi: activeUser.position || "-",
              module: "KPI Tracking",
              period: "2026",
              originalDeadline: MOCK_DEADLINE,
              submittedAt: new Date().toISOString().slice(0, 10),
              reason: reasonText || "Permintaan Open Lock untuk pengisian KPI Tracking melewati tanggal kunci bulanan.",
              status: "pending",
            };
            savePersistedState("pa_open_lock_requests_v1", [newReq, ...(Array.isArray(list) ? list : [])], {
              kind: "open-lock",
              request: newReq,
              audit: {
                userId: activeUser.employeeId,
                userName: activeUser.name,
                action: "Create",
                module: "KPI",
                subModule: "Open Lock",
                description: `${activeUser.name} (${activeUser.employeeId}) mengajukan Open Lock KPI Tracking`,
              },
            });
            const hrIcfIds = loadManagedUsers()
              .filter((u) => u.status === "Active" && (u.role === "HR ICF" || u.role === "Administrator"))
              .map((u) => u.employeeId);
            pushEmployeeNotification({
              employeeIds: [activeUser.employeeId],
              title: "Permintaan Open Lock KPI Tracking Dikirim",
              summary: "Permintaan Open Lock Anda telah dikirim ke HR ICF untuk disetujui.",
              category: "Approval",
              moduleName: "KPI",
              approvalStatus: "Pending",
              ctaLabel: "Buka KPI Tracking",
              ctaRoute: "/measurement/kpi-tracking",
              senderName: activeUser.name,
            });
            if (hrIcfIds.length > 0) {
              pushEmployeeNotification({
                employeeIds: hrIcfIds,
                title: `Permintaan Open Lock KPI Tracking — ${activeUser.name}`,
                summary: `${activeUser.name} (${activeUser.company}) mengajukan Open Lock KPI Tracking. Silakan review di Settings → Open Lock.`,
                category: "Approval",
                moduleName: "KPI",
                approvalStatus: "Pending",
                ctaLabel: "Review Open Lock",
                ctaRoute: "/settings/open-lock",
                senderName: activeUser.name,
              });
            }
          }}
        />
      )}
      {showEditRequest && (
        <EditRequestModal
          months={(() => {
            const now = new Date();
            const shortMonth = now.toLocaleString("en-US", { month: "short" }).toLowerCase();
            const shortYear = String(now.getFullYear()).slice(2);
            const currentId = `${shortMonth}${shortYear}`;
            const current = months.find((m) => m.id === currentId);
            return current ? [current] : months.slice(-1);
          })()}
          onCancel={() => setShowEditRequest(false)}
          onConfirm={(targets, _reason) => {
            setApprovedEditTargets(targets);
            setShowEditRequest(false);
            setShowEditRequestSuccess(true);
          }}
        />
      )}
      {showEditRequestSuccess && (
        <EditRequestSuccessModal onClose={() => { setShowEditRequestSuccess(false); setPendingEditRequest(true); const _d = new Date(); setEditRequestDate(`${String(_d.getDate()).padStart(2,"0")}/${String(_d.getMonth()+1).padStart(2,"0")}/${_d.getFullYear()}`); }} />
      )}
    </div>
  );
}
interface DelegatedKpiTrackingTab {
  id: string;
  label: string;
  owner: ManagedUser;
  forcedTab: "business" | "personal";
  access?: DelegationAccess;
}

export function KPIPage() {
  const { activeUser, allUsers } = useAuthStore();
  const [, setDelegTick] = useState(0);
  React.useEffect(() => {
    const r = () => setDelegTick((t) => t + 1);
    window.addEventListener(DELEGATION_EVENT, r);
    window.addEventListener("pa-db-hydrated", r);
    return () => {
      window.removeEventListener(DELEGATION_EVENT, r);
      window.removeEventListener("pa-db-hydrated", r);
    };
  }, []);

  const usersPool = allUsers.length > 0 ? allUsers : loadManagedUsers();
  const receivedDelegations = getReceivedWorkspaceDelegations(activeUser.employeeId, "kpiTracking", usersPool);

  if (receivedDelegations.length === 0) {
    return <KPIWorkspace />;
  }

  const delegatedTabs: DelegatedKpiTrackingTab[] = [];
  for (const d of receivedDelegations) {
    const owner = d.delegator;
    if (isDirectorRoleOrGrouping(owner)) {
      const grp = getGroupNameForUnit(owner.company);
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-group`,
        label: `KPI (Group) · ${grp} · ${owner.name}`,
        owner,
        forcedTab: "business",
        access: d.access,
      });
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        owner,
        forcedTab: "personal",
        access: d.access,
      });
    } else if (owner.role === "GM") {
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-unit`,
        label: `KPI (Unit) · ${owner.company} · ${owner.name}`,
        owner,
        forcedTab: "business",
        access: d.access,
      });
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        owner,
        forcedTab: "personal",
        access: d.access,
      });
    } else {
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        owner,
        forcedTab: "personal",
        access: d.access,
      });
    }
  }

  const selfTabs: DelegatedKpiTrackingTab[] = [];
  if (isDirectorRoleOrGrouping(activeUser)) {
    const grp = getGroupNameForUnit(activeUser.company);
    selfTabs.push({
      id: `self-${activeUser.employeeId}-group`,
      label: `KPI (Group) · ${grp} · Saya (${activeUser.name})`,
      owner: activeUser,
      forcedTab: "business",
    });
  } else if (activeUser.role === "GM") {
    selfTabs.push({
      id: `self-${activeUser.employeeId}-unit`,
      label: `KPI (Unit) · ${activeUser.company} · Saya (${activeUser.name})`,
      owner: activeUser,
      forcedTab: "business",
    });
  }
  selfTabs.push({
    id: `self-${activeUser.employeeId}-personal`,
    label: `KPI (Personal) · Saya (${activeUser.name})`,
    owner: activeUser,
    forcedTab: "personal",
  });

  const allTabs = [...delegatedTabs, ...selfTabs];
  return <DelegatedKPITrackingTabsView tabs={allTabs} actorName={activeUser.name} />;
}

function DelegatedKPITrackingTabsView({
  tabs,
  actorName,
}: {
  tabs: DelegatedKpiTrackingTab[];
  actorName: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(() => tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === selectedId) ?? tabs[0];

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Tracking</h1>
        <p className="text-gray-500 text-sm">
          2026 Performance Appraisal — Menampilkan {tabs.length} KPI ({tabs.filter((t) => t.access).length} Delegasi &amp; {tabs.filter((t) => !t.access).length} Milik Sendiri)
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map((tab) => {
          const isActive = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedId(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                isActive
                  ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5 rounded-t-lg"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-t-lg"
              }`}
            >
              <span>{tab.label}</span>
              {tab.access && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  Delegasi
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <KPIWorkspace
          key={current.id}
          ownerOverride={current.owner}
          forcedTab={current.forcedTab}
          delegationAccess={current.access}
          actorName={actorName}
          hideHeader
          workspaceLabel={current.label}
        />
      )}
    </div>
  );
}

export interface KPITrackingRCACandidate {
  key: string;
  kpiNo: string;
  monthId: string;
  monthLabel: string;
  periode: string;
  kpi: string;
  satuan: string;
  baseline: string;
  target: string;
  targetYearly: string;
  actual: string;
  score: number;
}

const EN_TO_ID_SHORT_MONTH: Record<string, string> = {
  Jan: "Jan", Feb: "Feb", Mar: "Mar", Apr: "Apr", May: "Mei", Jun: "Jun",
  Jul: "Jul", Aug: "Agu", Sep: "Sep", Oct: "Okt", Nov: "Nov", Dec: "Des",
};

export function toIdShortPeriode(monthLabel: string): string {
  const code = monthLabel.replace(/-\d{2}$/, "").trim();
  return EN_TO_ID_SHORT_MONTH[code] ?? code;
}

/**
 * Mengambil daftar aktual indikator KPI dari `/measurement/kpi-tracking` milik karyawan
 * yang memiliki tag RCA (nilai pencapaian < 100%).
 */
export function getKpiTrackingRcaCandidates(employeeId?: string): KPITrackingRCACandidate[] {
  const snap = loadKPITracking(employeeId);
  const monthsList = Array.isArray(snap.months) ? snap.months : [];
  const map = snap.cellsMap ?? {};
  const results: KPITrackingRCACandidate[] = [];
  const seen = new Set<string>();

  const candidateKpis = resolveEmployeeTrackingKpiItems(employeeId ?? getActiveUser().employeeId);
  for (const m of monthsList) {
    const mCells = { ...(m.cells ?? {}), ...(map[m.id] ?? {}) };
    for (const kpi of candidateKpis) {
      for (let si = 0; si < kpi.subRows.length; si++) {
        const sub = kpi.subRows[si];
        if (!sub.compute || sub.compute.type === "avg") continue;
        const getRaw = (idx: number) => mCells[ck(kpi.no, idx)] ?? "";
        const val = computeCell(kpi.subRows, getRaw, si, kpi.polaritas);
        const n = parseNum(val);
        if (n === null || n >= 100) continue;

        const subMeta = getKpiSubItemMeta(kpi, si, m.id);
        const rcaKey = subMeta.rcaKey;
        if (seen.has(rcaKey)) continue;
        seen.add(rcaKey);

        const spec = sub.compute;
        let targetVal = "";
        let actualVal = "";
        if (spec.type === "ratio") {
          targetVal = getRaw(spec.targetIdx) || kpi.monthlyTargets?.[m.label] || kpi.target2026;
          actualVal = getRaw(spec.actualIdx);
        } else if (spec.type === "inverse_ratio") {
          targetVal = getRaw(spec.denomIdx) || kpi.monthlyTargets?.[m.label] || kpi.target2026;
          actualVal = getRaw(spec.numIdx);
        } else if (spec.type === "threshold") {
          targetVal = `${spec.target}`;
          actualVal = getRaw(spec.actualIdx);
        } else if (spec.type === "ratio_score") {
          targetVal = getRaw(spec.negIdx) || kpi.monthlyTargets?.[m.label] || kpi.target2026;
          actualVal = getRaw(spec.posIdx);
        }
        if (!targetVal) {
          const tIdx = kpi.subRows.findIndex((s) => !s.compute && s.label.toLowerCase().startsWith("target"));
          targetVal = (tIdx >= 0 ? getRaw(tIdx) : "") || kpi.monthlyTargets?.[m.label] || kpi.target2026;
        }
        if (!actualVal) {
          const aIdx = kpi.subRows.findIndex((s) => !s.compute && !s.label.toLowerCase().startsWith("target"));
          actualVal = aIdx >= 0 ? getRaw(aIdx) : "";
        }

        results.push({
          key: rcaKey,
          kpiNo: kpi.no,
          monthId: m.id,
          monthLabel: m.label,
          periode: toIdShortPeriode(m.label),
          kpi: subMeta.itemKpiName,
          satuan: kpi.satuan,
          baseline: subMeta.itemBaseline,
          target: targetVal,
          targetYearly: subMeta.itemTargetYearly,
          actual: actualVal,
          score: Math.round(n * 10) / 10,
        });
      }
    }
  }
  return results;
}

/**
 * Statistik RCA per karyawan untuk Monitoring KPI (kolom RCA Req. & RCA Done):
 * - Required: indikator KPI Tracking dengan pencapaian < 100% (tag RCA) + RCA tersimpan yang tidak terpetakan.
 * - Done: RCA yang sudah berstatus Closed.
 */
export function getEmployeeRcaMonitoringStats(employeeId: string): {
  required: number;
  completed: number;
  closedKeys: string[];
} {
  const subs = loadRCASubmissions(employeeId).filter(
    (s) => !s.employeeId || normalizeEmployeeId(s.employeeId) === normalizeEmployeeId(employeeId),
  );
  let candidates: KPITrackingRCACandidate[] = [];
  try {
    candidates = getKpiTrackingRcaCandidates(employeeId);
  } catch {
    candidates = [];
  }
  const norm = (v: string) => v.trim().toLowerCase();
  const matchesCandidate = (s: StoredRCASubmission) =>
    candidates.some(
      (c) =>
        c.key === s.key ||
        (norm(c.kpi) === norm(s.kpiIndicator) && (c.periode === s.periode || c.monthLabel === s.monthLabel)),
    );
  const extra = subs.filter((s) => !matchesCandidate(s)).length;
  const required = candidates.length + extra;
  const closedSubs = subs.filter((s) => s.approvalStatus === "Closed");
  return {
    required,
    completed: Math.min(closedSubs.length, required),
    closedKeys: closedSubs.map((s) => s.key),
  };
}
