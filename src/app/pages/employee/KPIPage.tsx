import React, { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { DatePickerID } from "../../components/DatePickerID";
import { Plus, X, Eye, Send, CheckCircle2, Edit3, Upload, FileText, Paperclip, AlertTriangle, MessageSquare, ChevronDown, ChevronUp, Lock, LockOpen, FileEdit, UserCircle2, ArrowLeft, Info } from "lucide-react";
import { loadAllKPIComments } from "../shared/kpiCommentsStore";
import { saveEvidenceFiles, loadEvidenceFiles } from "../shared/kpiEvidenceStore";
import type { StoredEvidenceFile } from "../shared/kpiEvidenceStore";
import { loadMonthlyNotes } from "../shared/kpiMonthlyNotesStore";
import type { MonthlyNoteEntry } from "../shared/kpiMonthlyNotesStore";
import { toast } from "sonner";
import { saveRCASubmission, loadRCASubmissions } from "../shared/rcaStore";
import type { StoredMasalahBlock, StoredRCASubmission, StoredRCAActionPlan } from "../shared/rcaStore";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../utils/excelUtils";
import { uploadEvidenceFileToSupabase } from "../../services/supabaseClient";

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
  // Approval-level close takes priority
  if (sub.approvalStatus === "Closed") return "closed";
  const active = allActionPlans(sub).filter((ap) => ap.status !== "Dibatalkan");
  if (!active.length) return "outstanding";
  return active.every((ap) => ap.status === "Selesai") ? "closed" : "outstanding";
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

type Polaritas = "Maximize" | "Minimize";
type PageView = "input" | "preview";

type ComputeSpec =
  | { type: "ratio"; actualIdx: number; targetIdx: number; minimize?: boolean }
  | { type: "avg"; sourceIdxs: number[] }
  | { type: "ref"; sourceIdx: number }
  | { type: "ratio_score"; negIdx: number; posIdx: number; multiplier: number };

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
  section: "A" | "B";
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
  kpiNo: string;
  monthId: string;
  monthLabel: string;
  kpiName: string;
  achievementPct: number;
  // auto-fill from KPI master + cellsMap
  satuan: string;
  baseline: string;
  target: string;
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

// Compute a single cell value given sub-row specs and a value-getter
function computeCell(
  subRows: SubRow[],
  getRaw: (idx: number) => string,
  subIdx: number
): string {
  const sub = subRows[subIdx];
  if (!sub.compute) return "";

  const getVal = (idx: number): string => {
    const s = subRows[idx];
    if (s.compute) return computeCell(subRows, getRaw, idx);
    return getRaw(idx);
  };

  const spec = sub.compute;

  if (spec.type === "ratio") {
    const target = parseNum(getRaw(spec.targetIdx));
    if (target === null) return "—";            // target belum diisi → tidak dapat dihitung
    const actual = parseNum(getRaw(spec.actualIdx));
    if (actual === null) return "0%";           // actual belum diisi → 0%
    if (target === 0) return actual === 0 ? "100%" : "0%";
    let pct: number;
    if (spec.minimize) {
      pct = actual <= target ? 100 : (target / actual) * 100;
    } else {
      pct = (actual / target) * 100;
    }
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
        if (ytdTarget === 0) return ytdActual === 0 ? "100%" : "0%";
        let pct: number;
        if (spec.minimize) {
          pct = ytdActual <= ytdTarget ? 100 : (ytdTarget / ytdActual) * 100;
        } else {
          pct = (ytdActual / ytdTarget) * 100;
        }
        return formatPct(pct);
      }

      // Complex KPI: sum actuals / sum targets
      const totalActual = actuals.reduce((s, v) => s + v, 0);
      const totalTarget = monthData.reduce((s, v) => s + v.target, 0);
      if (totalTarget === 0) return totalActual === 0 ? "100%" : "0%";
      let pct: number;
      if (spec.minimize) {
        pct = totalActual <= totalTarget ? 100 : (totalTarget / totalActual) * 100;
      } else {
        pct = (totalActual / totalTarget) * 100;
      }
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
        .map((m) => {
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

function loadSubmitState(): { submitted: boolean; submittedDate: string } {
  try {
    const raw = localStorage.getItem(`${KPI_SUBMIT_KEY}_${getRolePrefix()}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { submitted: false, submittedDate: "" };
}

function saveSubmitState(submitted: boolean, submittedDate: string): void {
  try {
    localStorage.setItem(
      `${KPI_SUBMIT_KEY}_${getRolePrefix()}`,
      JSON.stringify({ submitted, submittedDate })
    );
  } catch { /* ignore */ }
}

export interface KPITrackingSnapshot {
  months: MonthEntry[];
  cellsMap: Record<string, Record<CellKey, string>>;
}

export function saveKPITracking(data: KPITrackingSnapshot): void {
  try { localStorage.setItem(KPI_STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function loadKPITracking(): KPITrackingSnapshot {
  try {
    const raw = localStorage.getItem(KPI_STORE_KEY);
    if (raw) return JSON.parse(raw) as KPITrackingSnapshot;
  } catch { /* ignore */ }
  // Default: INITIAL_MONTHS merged with pre-filled targets
  const cellsMap = Object.fromEntries(
    INITIAL_MONTHS.map((m) => [m.id, { ...getPrefilledCells(m.label), ...m.cells }])
  );
  return { months: INITIAL_MONTHS, cellsMap };
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
  { label: "% Pencapaian HPP Listrik", bold: true, compute: { type: "ratio", actualIdx: 0, targetIdx: 1 } },
  { label: "Biaya Steam" },
  { label: "Target Biaya (Steam)" },
  { label: "% Pencapaian HPP Steam", bold: true, compute: { type: "ratio", actualIdx: 3, targetIdx: 4 } },
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

export const INITIAL_MONTHS: MonthEntry[] = [
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

function getPrefilledCells(monthLabel: string): Record<CellKey, string> {
  const cells: Record<CellKey, string> = {};
  KPI_ITEMS.forEach((kpi) => {
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

function AddMonthModal({
  existingLabels,
  onAdd,
  onClose,
}: {
  existingLabels: string[];
  onAdd: (entry: MonthEntry) => void;
  onClose: () => void;
}) {
  const available = MONTH_OPTIONS.filter((m) => !existingLabels.includes(m));
  const [label, setLabel] = useState(available[0] ?? "");
  const [cells, setCells] = useState<Record<CellKey, string>>(() => getPrefilledCells(available[0] ?? ""));
  const [attempted, setAttempted] = useState(false);
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const handleLabelChange = (newLabel: string) => {
    setLabel(newLabel);
    setCells(getPrefilledCells(newLabel));
    setAttempted(false);
  };

  const setVal = (key: CellKey, val: string) =>
    setCells((prev) => ({ ...prev, [key]: val }));

  // Collect required (actual) fields that are empty
  const getMissingFields = () => {
    const missing: { kpiNo: string; subIdx: number }[] = [];
    KPI_ITEMS.forEach((kpi) => {
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
    setAttempted(true);
    if (missingFields.length > 0) {
      setShowEmptyConfirm(true);
      return;
    }
    doSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl">
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
                {KPI_ITEMS.filter((k) => missingFields.some((f) => f.kpiNo === k.no)).map((k) => {
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
          {["A", "B"].map((sec) => (
            <div key={sec}>
              <p className={`text-xs font-bold text-white px-3 py-1.5 rounded-md mb-3 ${sec === "A" ? "bg-[#1565C0]" : "bg-[#1976D2]"}`}>
                {sec === "A" ? "A. Objective KPI (20%)" : "B. Functional KPI (80%)"}
              </p>
              {KPI_ITEMS.filter((k) => k.section === sec).map((kpi) => {
                const kpiMissing = attempted ? (missingByKpi[kpi.no] ?? 0) : 0;
                return (
                  <div key={kpi.no} className="mb-4">
                    <div className={`flex items-center gap-2 mb-2 rounded-lg px-3 py-2 ${kpiMissing > 0 ? "bg-red-50 border border-red-200" : "bg-gray-50"}`}>
                      <p className="text-xs font-semibold text-gray-800 flex-1">
                        {kpi.no}. {kpi.kpi.split("\n")[0]}
                        <span className="ml-2 text-gray-400 font-normal">({kpi.satuan})</span>
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          kpi.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                        }`}>{kpi.polaritas}</span>
                      </p>
                      {kpiMissing > 0 && (
                        <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          {kpiMissing} kosong
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-2">
                      {kpi.subRows.map((sub, si) => {
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
                              <input
                                type="text"
                                value={cells[ck(kpi.no, si)] ?? ""}
                                onChange={(e) => setVal(ck(kpi.no, si), e.target.value)}
                                placeholder="Masukkan nilai aktual"
                                className={`text-xs border rounded px-2 py-1.5 outline-none transition-colors ${
                                  empty
                                    ? "border-red-400 bg-red-50 focus:border-red-500 placeholder-red-300"
                                    : "border-gray-200 focus:border-[#1A284F]"
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100">
          <div>
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
              disabled={!label || !available.length}
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

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">Are you sure you want to submit your KPI Tracking for approval?</p>
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
    const val = computeCell(kpi.subRows, getRaw, si);
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
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Tambah…"
          className="flex-1 text-[10px] border border-dashed border-amber-300 rounded px-1.5 py-1 outline-none focus:border-amber-500 bg-amber-50/30 min-w-0" />
        <button onClick={commit} className="text-[10px] font-bold text-amber-600 hover:bg-amber-100 px-1.5 py-1 rounded transition-colors">+</button>
      </div>
    </div>
  );
}

function RCAMultiFileUpload({ files: rawFiles, onChange }: { files: string[] | string; onChange: (v: string[]) => void }) {
  const files = Array.isArray(rawFiles) ? rawFiles : (rawFiles ? [rawFiles] : []);
  const ref = useRef<HTMLInputElement>(null);
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawList = Array.from(e.target.files || []);
    rawList.forEach((rawFile) => {
      void uploadEvidenceFileToSupabase(rawFile, {
        moduleType: "RCA",
        period: "2026",
        month: "June",
      });
    });
    const newFiles = rawList.map((f) => f.name);
    if (newFiles.length) onChange([...files, ...newFiles]);
    e.target.value = "";
  };
  return (
    <div className="flex flex-col gap-1">
      {files.map((f, idx) => (
        <div key={idx} className="flex items-center gap-1 text-[10px] text-green-700">
          <FileText className="w-3 h-3 shrink-0 text-green-500" />
          <span className="flex-1 truncate" title={f}>{f}</span>
          <button onClick={() => onChange(files.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
        </div>
      ))}
      <button onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 text-[10px] text-blue-600 font-medium hover:text-blue-700 mt-0.5 border border-dashed border-blue-300 rounded px-2 py-1 bg-blue-50/40 hover:bg-blue-50 transition-colors">
        <Upload className="w-3 h-3" /> Upload file
      </button>
      <p className="text-[9px] text-gray-400">JPG, PNG, PDF</p>
      <input ref={ref} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={handleFiles} />
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
  // KPI metadata (read-only display)
  const [form] = useState<RCAEntry>(() => {
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

  const key = `${pending.kpiNo}__${pending.monthId}`;
  const canSave = blocks.length > 0 && blocks.every(isBlockComplete);

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
            <span className="text-sm font-bold text-gray-800">Root Cause Analysis (RCA)</span>
            <span className="text-xs text-gray-400 ml-2">— {pending.kpiName}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Close
          </button>
          <button
            onClick={() => { if (canSave) { onSave(key, buildEntry(), blocks); onClose(); } }}
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
          <p className="text-xs text-red-600">Target KPI tidak tercapai — RCA wajib diisi sebelum submit KPI Tracking.</p>
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                  <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Target (Monthly) <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                  <p className="text-xs font-bold text-[#1A284F] px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{form.target || "—"}</p>
                </div>
              </div>
              <div className="mt-3 max-w-xs">
                <label className="text-[10px] font-bold uppercase tracking-wide text-blue-600">Actual <span className="text-blue-400 font-normal normal-case tracking-normal">(auto)</span></label>
                <p className="mt-1 text-xs font-bold text-gray-800 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100 min-h-[32px] flex items-center">{form.actual || "—"}</p>
              </div>
              <p className="mt-2 text-[10px] text-blue-500 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" /> Satuan, Baseline, Target, dan Actual diisi otomatis dari KPI Tracking.
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
                            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</label>
                            {hint && <p className="text-[10px] text-gray-400 -mt-0.5">{hint}</p>}
                            <textarea rows={2} value={block[fk]}
                              onChange={(e) => updateBlock(block.id, { [fk]: e.target.value })}
                              placeholder="—" className={F_CLS + " resize-none"} />
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
                        <div className="p-4 flex flex-col gap-3">
                          {block.actionPlans.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
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
          onClick={() => { if (canSave) { onSave(key, buildEntry(), blocks); onClose(); } }}
          disabled={!canSave}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Submit RCA
        </button>
      </div>
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

function OpenLockRequestModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
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
            onClick={() => reason.trim() && onConfirm()}
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
}) {
  const sectionItems = (sec: "A" | "B") => KPI_ITEMS.filter((k) => k.section === sec);

  const totalCols = 14 + months.length + 2 + (editable ? 1 : 0); // +1 for Total, +1 for Achievement

  const getCellDisplay = (kpi: KPIItem, monthId: string, subIdx: number): string => {
    const sub = kpi.subRows[subIdx];
    if (sub.compute) {
      const getRaw = (idx: number) => cells[monthId]?.[ck(kpi.no, idx)] ?? "";
      return computeCell(kpi.subRows, getRaw, subIdx);
    }
    return cells[monthId]?.[ck(kpi.no, subIdx)] ?? "";
  };

  const renderSectionRows = (sec: "A" | "B") =>
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
                  style={{ position: "sticky", left: 0, zIndex: 10, minWidth: W_NO, maxWidth: W_NO }}>
                  {kpi.no}
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 bg-white"
                  style={{ position: "sticky", left: W_NO, zIndex: 10, minWidth: W_PERSP, maxWidth: W_PERSP }}>
                  <span className={`text-xs font-bold ${PERSP_COLOR[kpi.perspektif] ?? "text-gray-700"}`}>{kpi.perspektif}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 align-top py-2 px-3 bg-white"
                  style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 10, minWidth: W_KPI, maxWidth: W_KPI }}>
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
                        const rcaKey = `${kpi.no}__${m.id}`;
                        // Hide RCA tag on "% Pencapaian Total" (avg of multiple sub-rows)
                        if (sub.compute?.type === "avg") return null;
                        if (n !== null && n < 100) {
                          // Derive status: inline rcaMap entry (proper status check), then stored, then none
                          const inlineEntry = rcaMap?.[rcaKey];
                          const secondaryKey = `${kpi.kpi.split("\n")[0]}__${displayMonth(m.label)}`;
                          const status: RCAStatus = inlineEntry
                            ? inlineEntryToStatus(inlineEntry)
                            : (storedRCAStatus?.[rcaKey] ?? storedRCAStatus?.[secondaryKey] ?? "none");

                          // Tag only shows color change when RCA has been filled (status ≠ "none")
                          const isFilled = status !== "none";

                          const tagStyle = isFilled
                            ? status === "closed"
                              ? { cls: "bg-green-100 text-green-700 hover:bg-green-200", dot: "bg-green-500", label: "RCA Closed — klik untuk lihat" }
                              : { cls: "bg-amber-100 text-amber-700 hover:bg-amber-200", dot: "bg-amber-500", label: "RCA Outstanding — klik untuk lihat" }
                            : { cls: "bg-red-100 text-red-600 hover:bg-red-200 animate-pulse", dot: "bg-red-500", label: "RCA belum diisi — klik untuk mengisi" };

                          // Filled tag → view-only; unfilled tag → open create form
                          const handleTagClick = isFilled
                            ? () => onViewRCA?.(rcaKey, secondaryKey, kpi.kpi.split("\n")[0], displayMonth(m.label))
                            : () => onOpenRCA?.(kpi, m.id, si);

                          const canInteract = isFilled ? !!onViewRCA : !!onOpenRCA;

                          if (canInteract) {
                            return (
                              <button
                                onClick={handleTagClick}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${tagStyle.cls}`}
                                title={tagStyle.label}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tagStyle.dot}`} />
                                RCA
                              </button>
                            );
                          }
                          return (
                            <span
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${tagStyle.cls.replace(/ hover:\S+/g, "").replace(" animate-pulse", "")}`}
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
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-xs" style={{ minWidth: `${W_NO + W_PERSP + W_KPI + 1354 + months.length * 120 + 120 + 110}px` }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 0, zIndex: 20, background: "#1A284F", minWidth: W_NO }}>No</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO, zIndex: 20, background: "#1A284F", minWidth: W_PERSP }}>Perspektif</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 20, background: "#1A284F", minWidth: W_KPI }}>KPI</th>
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
                    {editable && (
                      <button onClick={() => onRemoveMonth?.(m.id)} className="text-white/40 hover:text-red-300 transition-colors" title="Remove">
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
                <button
                  onClick={onAddMonth}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 transition-colors mx-auto"
                  title="Add month"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {(() => {
            // Pre-compute section scores for header rows
            const sectionScore = (sec: "A" | "B") =>
              KPI_ITEMS.filter((k) => k.section === sec).reduce((s, k) => {
                const ach = computeKPIAchievement(k, cells, months);
                if (ach === null) return s;
                return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
              }, 0);

            const scoreA = sectionScore("A");
            const scoreB = sectionScore("B");
            const totalBobot = KPI_ITEMS.reduce((s, k) => s + parseFloat(k.bobot.replace("%", "")), 0);
            const totalNilai = scoreA + scoreB;
            // colSpan for label = all cols except Achievement (and editable button)
            const labelColSpan = 14 + months.length + 1;

            const SectionHeader = ({ sec, label, bg, score }: { sec: "A" | "B"; label: string; bg: string; score: number }) => (
              <tr>
                <td colSpan={labelColSpan} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border"
                  style={{ background: bg, borderColor: bg }}>
                  {label}
                </td>
                <td className="py-2 px-2 text-center border text-white text-xs font-bold" style={{ background: bg, borderColor: bg }}>
                  {KPI_ITEMS.some((k) => k.section === sec && computeKPIAchievement(k, cells, months) !== null)
                    ? score.toFixed(2) + "%"
                    : "—"}
                </td>
                {editable && <td className="border" style={{ background: bg, borderColor: bg }} />}
              </tr>
            );

            return (
              <>
                {/* Section A */}
                <SectionHeader sec="A" label="A. Objective KPI — Bobot 20%" bg="#1565C0" score={scoreA} />
                {renderSectionRows("A")}

                {/* Section B */}
                <SectionHeader sec="B" label="B. Functional KPI — Bobot 80%" bg="#1976D2" score={scoreB} />
                {renderSectionRows("B")}

                {/* ── Summary rows ── */}
                <tr>
                  <td colSpan={totalCols} className="py-1 border border-[#1A284F]/20 bg-[#1A284F]/5" />
                </tr>
                {([
                  { label: `Objective KPI (Section A)`, value: `${KPI_ITEMS.filter((k) => k.section === "A").length} KPI` },
                  { label: `Functional KPI (Section B)`, value: `${KPI_ITEMS.filter((k) => k.section === "B").length} KPI` },
                  { label: "Total KPI", value: `${KPI_ITEMS.length} KPI`, highlight: true },
                  { label: "Total Bobot KPI", value: `${totalBobot.toFixed(0)}%`, highlight: true },
                ] as { label: string; value: string; highlight?: boolean }[]).map(({ label, value, highlight }) => (
                  <tr key={label} className={highlight ? "bg-[#1A284F]/8" : "bg-[#1A284F]/4"}>
                    <td colSpan={labelColSpan} className="border border-gray-200 py-2 px-4 text-xs font-bold text-[#1A284F]">
                      {label}
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
                      <td colSpan={labelColSpan} className={`border border-gray-200 py-3 px-4 text-sm font-extrabold tracking-wide ${nilaiColor.label}`}>
                        Total Nilai KPI
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
    </div>
  );
}

// ─── RCA Read-Only Viewer Modal ───────────────────────────────────────────────

const AP_STATUS_STYLE: Record<string, string> = {
  "Selesai":             "bg-green-100 text-green-700 border-green-200",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-700 border-amber-200",
  "Belum dilaksanakan":  "bg-red-100 text-red-700 border-red-200",
  "Ditunda":             "bg-purple-100 text-purple-700 border-purple-200",
  "Dibatalkan":          "bg-gray-100 text-gray-500 border-gray-200",
};

function RCAReadOnlyModal({
  rcaKey,
  secondaryKey,
  kpiName,
  monthLabel,
  onClose,
  onNavigate,
}: {
  rcaKey: string;
  secondaryKey: string;
  kpiName: string;
  monthLabel: string;
  onClose: () => void;
  onNavigate: () => void;
}) {
  // Load the stored submission by primary or secondary key
  const sub = React.useMemo(() => {
    const all = loadRCASubmissions();
    return all.find((s) => s.key === rcaKey) ?? all.find((s) => s.key === secondaryKey) ?? null;
  }, [rcaKey, secondaryKey]);

  const blocks = sub?.masalahBlocks ?? (sub ? [{
    id: "flat",
    masalahUtama: sub.masalahUtama.join(", "),
    kenapaA: sub.kenapaA,
    kenapaB: sub.kenapaB,
    kenapaC: sub.kenapaC,
    actionPlans: sub.actionPlans,
  }] : []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-base leading-tight">{kpiName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">RCA — {monthLabel} · Hanya Baca</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={onNavigate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
            >
              <ArrowLeft className="w-3 h-3 rotate-180" />
              Buka Submenu RCA
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {!sub ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Data RCA tidak ditemukan.</div>
        ) : (
          <div className="px-6 py-4 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
            {/* Meta info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { label: "KPI Indicator", value: sub.kpiIndicator },
                { label: "Periode", value: `${sub.periode} ${sub.year}` },
                { label: "Target", value: sub.targetMonthly || "—" },
                { label: "Aktual", value: sub.actual || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
                  <span className="font-semibold text-gray-800">{value}</span>
                </div>
              ))}
            </div>

            {/* Masalah blocks */}
            {blocks.map((block, bi) => (
              <div key={block.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-[#1A284F] px-4 py-2 text-white text-xs font-bold">
                  Masalah #{bi + 1}{block.masalahUtama ? ` — ${block.masalahUtama}` : ""}
                </div>
                <div className="px-4 py-3 flex flex-col gap-3">
                  {/* 5 Why */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    {[
                      { label: "Kenapa A (Gejala)", value: block.kenapaA },
                      { label: "Kenapa B (Penyebab)", value: block.kenapaB },
                      { label: "Kenapa C (Akar Masalah)", value: block.kenapaC },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</span>
                        <p className="text-gray-700 bg-gray-50 rounded px-2 py-1.5 border border-gray-100 leading-relaxed min-h-[2rem]">{value || "—"}</p>
                      </div>
                    ))}
                  </div>

                  {/* Action Plans table */}
                  {block.actionPlans.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="text-xs w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wide">
                            {["#", "Tindak Lanjut", "Target Selesai", "PIC", "Status"].map((h) => (
                              <th key={h} className="border border-gray-200 px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.actionPlans.map((ap, ai) => (
                            <tr key={ap.id} className="even:bg-gray-50/50">
                              <td className="border border-gray-200 px-3 py-2 text-center text-gray-500 font-medium">{ai + 1}</td>
                              <td className="border border-gray-200 px-3 py-2 text-gray-700 max-w-xs">{ap.action || "—"}</td>
                              <td className="border border-gray-200 px-3 py-2 whitespace-nowrap text-gray-600">{ap.targetDate || "—"}</td>
                              <td className="border border-gray-200 px-3 py-2 whitespace-nowrap text-gray-600">{ap.pic || "—"}</td>
                              <td className="border border-gray-200 px-3 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${AP_STATUS_STYLE[ap.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                  {ap.status || "—"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">Edit atau update RCA di submenu Performance Appraisal Measurement.</p>
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
  monthLabels,
}: {
  files: EvidenceFile[];
  onAdd: (files: EvidenceFile[]) => void;
  onRemove: (id: string) => void;
  editable: boolean;
  monthLabels: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(monthLabels[monthLabels.length - 1] ?? "");
  const [open, setOpen] = useState(true);
  const [staged, setStaged] = useState<{ files: EvidenceFile[]; month: string } | null>(null);

  React.useEffect(() => {
    if (monthLabels.length && !monthLabels.includes(selectedMonth)) {
      setSelectedMonth(monthLabels[monthLabels.length - 1]);
    }
  }, [monthLabels]);

  const handleFiles = (raw: FileList | null) => {
    if (!raw || !selectedMonth) return;
    const rawArr = Array.from(raw);
    rawArr.forEach((rawFile) => {
      void uploadEvidenceFileToSupabase(rawFile, {
        moduleType: "KPI Tracking",
        period: "2026",
        month: selectedMonth,
      });
    });
    const newFiles: EvidenceFile[] = Array.from(raw).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name, size: f.size, type: f.type,
      url: URL.createObjectURL(f),
      month: selectedMonth,
    }));
    setStaged({ files: newFiles, month: selectedMonth });
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
                {monthLabels.length === 0 ? (
                  <span className="text-xs text-amber-600 font-medium">Tambah bulan KPI dahulu</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1A284F] bg-white font-semibold text-[#1A284F]"
                    >
                      {monthLabels.map((m) => <option key={m} value={m}>{m}</option>)}
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
                            <a href={f.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-medium text-[#1A284F] hover:underline truncate" title={f.name}>
                              {f.name}
                            </a>
                            <span className="text-[10px] text-gray-400 shrink-0 ml-1">{formatBytes(f.size)}</span>
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

// ─── Approver Comments Panel ──────────────────────────────────────────────────

function ApproverCommentsPanel() {
  const [open, setOpen] = useState(true);
  const allComments = loadAllKPIComments();

  const entries = Object.entries(allComments).filter(([, c]) => c.approver1?.text || c.approver2?.text);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 bg-[#1A284F] text-white text-left"
      >
        <MessageSquare className="w-4 h-4 shrink-0" />
        <span className="font-bold text-sm flex-1">Catatan dari Approver</span>
        <span className="text-xs text-white/60 mr-2">{entries.length} KPI dengan catatan</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>

      {open && (
        <div className="flex flex-col divide-y divide-gray-100">
          {entries.map(([rowNo, comments]) => (
            <div key={rowNo} className="px-6 py-5 flex flex-col gap-3 bg-white">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">KPI Measurement</span>
                <span className="text-xs font-bold text-[#1A284F] bg-[#1A284F]/8 px-2 py-0.5 rounded">{rowNo}</span>
              </div>

              {comments.approver1?.text && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <span className="text-[11px] font-bold text-blue-700">{comments.approver1.approverLabel}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{comments.approver1.date}</span>
                  </div>
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-sm text-blue-800 leading-relaxed">{comments.approver1.text}</p>
                  </div>
                </div>
              )}

              {comments.approver2?.text && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                    <span className="text-[11px] font-bold text-purple-700">{comments.approver2.approverLabel}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{comments.approver2.date}</span>
                  </div>
                  <div className="bg-purple-50/60 border border-purple-100 rounded-xl px-4 py-3">
                    <p className="text-sm text-purple-800 leading-relaxed">{comments.approver2.text}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function KPIHistorySection({ months }: { months: MonthEntry[] }) {
  const [notesOpen, setNotesOpen] = useState(true);
  const monthlyNotes = React.useMemo(() => loadMonthlyNotes(), []);

  return (
    <div className="flex flex-col gap-4">
      {/* ── History Catatan Approver ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#1A284F]" />
            <span className="text-sm font-bold text-[#1A284F]">History Catatan Approver</span>
            <span className="text-[11px] text-gray-400 font-normal">per bulan</span>
          </div>
          {notesOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {notesOpen && (
          months.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessageSquare className="w-7 h-7 text-gray-200" />
              <p className="text-xs text-gray-400 italic">Belum ada data bulan di KPI tracking.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1A284F]/5 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F] w-24">Bulan</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F]">Catatan Approver 1</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F] border-l border-gray-200">Catatan Approver 2</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => {
                    const entry: MonthlyNoteEntry = monthlyNotes[m.id] ?? {};
                    const a1 = entry.approver1;
                    const a2 = entry.approver2;
                    return (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-[#1A284F] uppercase tracking-widest text-[10px] align-top whitespace-nowrap">
                          {displayMonth(m.label)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {a1 ? (
                            <div className="flex flex-col gap-0.5">
                              <p className="text-gray-800 leading-relaxed">{a1.text}</p>
                              <p className="text-[10px] text-gray-400">{a1.approverName} · {a1.date}</p>
                            </div>
                          ) : (
                            <span className="text-gray-300 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top border-l border-gray-100">
                          {a2 ? (
                            <div className="flex flex-col gap-0.5">
                              <p className="text-gray-800 leading-relaxed">{a2.text}</p>
                              <p className="text-[10px] text-gray-400">{a2.approverName} · {a2.date}</p>
                            </div>
                          ) : (
                            <span className="text-gray-300 italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

    </div>
  );
}

export function KPIPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<PageView>("input");
  const [months, setMonths] = useState<MonthEntry[]>(() => loadKPITracking().months);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitted, setSubmitted] = useState(() => loadSubmitState().submitted);
  const [submittedDate, setSubmittedDate] = useState(() => loadSubmitState().submittedDate);
  const [showEditRequest, setShowEditRequest] = useState(false);
  const [showEditRequestSuccess, setShowEditRequestSuccess] = useState(false);
  const [pendingEditRequest, setPendingEditRequest] = useState(false);
  const [editRequestDate, setEditRequestDate] = useState<string>("");
  const [rcaMap, setRcaMap] = useState<RCAMap>({});
  const [storedRCAStatus, setStoredRCAStatus] = useState<Record<string, RCAStatus>>(() =>
    buildStoredRCAStatusMap(loadRCASubmissions())
  );
  const [pendingRCA, setPendingRCA] = useState<PendingRCA | null>(null);
  const [viewingRCA, setViewingRCA] = useState<{ rcaKey: string; secondaryKey: string; kpiName: string; monthLabel: string } | null>(null);

  // Sync storedRCAStatus when the RCAPage writes to localStorage
  React.useEffect(() => {
    const sync = () => setStoredRCAStatus(buildStoredRCAStatusMap(loadRCASubmissions()));
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Deadline lock flow
  const [showOpenLockModal, setShowOpenLockModal] = useState(false);
  const [openLockRequested, setOpenLockRequested] = useState(false);
  const [openLockApproved, setOpenLockApproved] = useState(false);

  // Edit request approval flow
  const [editRequestApproved, setEditRequestApproved] = useState(false);
  const [approvedEditTargets, setApprovedEditTargets] = useState<{ kpiNo: string; monthId: string }[]>([]);

  const isDeadlinePassed = new Date() > new Date(MOCK_DEADLINE + "T23:59:59");
  const isLockedByDeadline = isDeadlinePassed && !submitted && !openLockApproved;
  const approvedEditCells =
    editRequestApproved && approvedEditTargets.length > 0
      ? new Set(approvedEditTargets.map((t) => `${t.kpiNo}::${t.monthId}`))
      : undefined;

  const [cellsMap, setCellsMap] = useState<Record<string, Record<CellKey, string>>>(() => {
    const snap = loadKPITracking();
    return snap.cellsMap;
  });

  // Persist months + cells to localStorage whenever they change
  React.useEffect(() => {
    saveKPITracking({ months, cellsMap });
  }, [months, cellsMap]);

  // Persist submitted state per role
  React.useEffect(() => {
    saveSubmitState(submitted, submittedDate);
  }, [submitted, submittedDate]);

  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>(() => loadEvidenceFiles());

  const addEvidence = (files: EvidenceFile[]) =>
    setEvidenceFiles((prev) => {
      const next = [...prev, ...files];
      saveEvidenceFiles(next);
      return next;
    });

  const removeEvidence = (id: string) =>
    setEvidenceFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      saveEvidenceFiles(next);
      return next;
    });

  const updateCell = (monthId: string, key: CellKey, val: string) =>
    setCellsMap((prev) => ({
      ...prev,
      [monthId]: { ...(prev[monthId] ?? {}), [key]: val },
    }));

  const openRCA = (kpi: KPIItem, monthId: string, subIdx?: number) => {
    const month = months.find((m) => m.id === monthId);

    let target: string;
    let actual: string;
    let achievementPct: number;

    if (subIdx !== undefined) {
      // Clicked from a specific % Pencapaian row — use that sub-row's actual/target
      const computeSub = kpi.subRows[subIdx];
      const spec = computeSub?.compute;
      if (spec?.type === "ratio") {
        target = cellsMap[monthId]?.[ck(kpi.no, spec.targetIdx)] ?? kpi.target2026;
        actual = cellsMap[monthId]?.[ck(kpi.no, spec.actualIdx)] ?? "";
        const getRaw = (idx: number) => cellsMap[monthId]?.[ck(kpi.no, idx)] ?? "";
        const val = computeCell(kpi.subRows, getRaw, subIdx);
        const n = parseNum(val);
        achievementPct = n !== null ? Math.min(n, 100) : 0;
      } else {
        // avg or other computed type — fallback to lowest achievement + first actual/target
        const lowest = getLowestAchievement(kpi, monthId, cellsMap);
        if (lowest === null || lowest >= 100) return;
        achievementPct = lowest;
        const tIdx = kpi.subRows.findIndex((s) => !s.compute && s.label.toLowerCase().startsWith("target"));
        target = tIdx >= 0 ? (cellsMap[monthId]?.[ck(kpi.no, tIdx)] ?? kpi.target2026) : kpi.target2026;
        const aIdx = kpi.subRows.findIndex((s) => !s.compute);
        actual = aIdx >= 0 ? (cellsMap[monthId]?.[ck(kpi.no, aIdx)] ?? "") : "";
      }
      if (achievementPct >= 100) return;
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
      kpiNo: kpi.no,
      monthId,
      monthLabel: month?.label ?? monthId,
      kpiName: kpi.kpi.split("\n")[0],
      achievementPct,
      satuan: kpi.satuan,
      baseline: kpi.baseline2025,
      target,
      actual,
    });
  };

  // RCA modal opens only via explicit RCA tag click — not on cell blur
  const handleCellBlur = (_kpi: KPIItem, _monthId: string) => {};

  const addMonth = (entry: MonthEntry) => {
    setMonths((prev) => [...prev, entry]);
    setCellsMap((prev) => ({ ...prev, [entry.id]: entry.cells }));
  };

  const removeMonth = (id: string) => {
    setMonths((prev) => prev.filter((m) => m.id !== id));
    setCellsMap((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleExport = () => {
    const monthHeaders = months.map((m) => m.label);
    const headers = ["No","Section","Perspektif","KPI","Satuan","Formula Setahun","Bobot","Polaritas","Baseline","Target", ...monthHeaders, "Total", "Achievement"];
    const rows: string[][] = [];
    KPI_ITEMS.forEach((kpi) => {
      kpi.subRows.forEach((sub, si) => {
        const monthVals = months.map((m) => {
          const sub_ = kpi.subRows[si];
          if (sub_.compute) {
            const getRaw = (idx: number) => cellsMap[m.id]?.[ck(kpi.no, idx)] ?? "";
            return computeCell(kpi.subRows, getRaw, si);
          }
          return cellsMap[m.id]?.[ck(kpi.no, si)] ?? "";
        });
        const total = computeTotal2026(kpi, si, cellsMap, months);
        rows.push([kpi.no, kpi.section, kpi.perspektif, kpi.kpi, kpi.satuan, kpi.formula, kpi.bobot, kpi.polaritas, kpi.baseline2025, kpi.target2026, ...monthVals, total]);
      });
    });
    exportXLSX("KPI_Tracking_2026.xlsx", headers, rows);
  };

  const handleImport = async (file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      // Find the fixed columns
      const noIdx = headers.findIndex((h) => /^no$/i.test(h.trim()));
      // Month headers start after "Target" and stop before "Total"
      const targetIdx = headers.findIndex((h) => /^target/i.test(h.trim()));
      const totalIdx = headers.findIndex((h) => /^total$/i.test(h.trim()));
      const monthStartIdx = targetIdx + 1;
      const monthEndIdx = totalIdx > 0 ? totalIdx : headers.length;
      const importedMonthLabels = headers.slice(monthStartIdx, monthEndIdx);
      // Build label→id map from current months state
      const labelToId: Record<string, string> = {};
      months.forEach((m) => { labelToId[m.label] = m.id; });
      // Track subRow sequence per KPI no
      const subRowCount: Record<string, number> = {};
      const newCellsMap: Record<string, Record<CellKey, string>> = { ...cellsMap };
      rows.filter((r) => r.some((c) => c.trim())).forEach((r) => {
        const kpiNo = noIdx >= 0 ? r[noIdx]?.trim() ?? "" : "";
        if (!kpiNo) return;
        const si = subRowCount[kpiNo] ?? 0;
        subRowCount[kpiNo] = si + 1;
        importedMonthLabels.forEach((label, li) => {
          const monthId = labelToId[label];
          if (!monthId) return;
          const val = r[monthStartIdx + li] ?? "";
          if (!newCellsMap[monthId]) newCellsMap[monthId] = {} as Record<CellKey, string>;
          newCellsMap[monthId][ck(kpiNo, si)] = val;
        });
      });
      setCellsMap(newCellsMap);
    } catch { /* ignore parse errors */ }
  };

  const [showEvidenceWarn, setShowEvidenceWarn] = useState(false);

  const handleSubmitClick = () => {
    if (evidenceFiles.length === 0) {
      setShowEvidenceWarn(true);
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
    { const _d = new Date(); setSubmittedDate(`${String(_d.getDate()).padStart(2,"0")}/${String(_d.getMonth()+1).padStart(2,"0")}/${_d.getFullYear()}`); }
    setView("preview");
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[28px] font-bold text-[#1A284F]">KPI Tracking</h1>
            {!submitted && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-blue-50 border border-blue-300 text-blue-600">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Draft Mode
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {view === "input" && !isLockedByDeadline && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Month
              </button>
              <button
                onClick={() => setView("preview")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={handleSubmitClick}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
              >
                <Send className="w-4 h-4" />
                Submit KPI Tracking
              </button>
            </>
          )}
          {view === "preview" && (
            <>
              {!submitted && !isLockedByDeadline && (
                <button
                  onClick={() => setView("input")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Back to Edit
                </button>
              )}
              {!submitted && !isLockedByDeadline && (
                <button
                  onClick={handleSubmitClick}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Submit KPI Tracking
                </button>
              )}
              {submitted && !pendingEditRequest && !editRequestApproved && (
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
          <ExportImportButton onExport={handleExport} onImport={handleImport} />
        </div>
      </div>

      {/* Deadline lock banners */}
      {isLockedByDeadline && !openLockRequested && (
        <div className="flex items-start gap-3 flex-wrap px-4 py-3 rounded-xl border border-red-200 bg-red-50">
          <Lock className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">KPI Tracking dikunci</p>
            <p className="text-xs text-red-600 mt-0.5">
              Deadline pengisian <span className="font-bold">30 Juni 2026</span> telah terlewat. Anda perlu meminta Open Lock ke Admin HR untuk dapat mengisi dan submit data.
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
            Request Open Lock sedang menunggu persetujuan Admin HR.
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Menunggu Persetujuan
          </span>
          <button
            onClick={() => setOpenLockApproved(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200 border border-orange-300 transition-colors"
          >
            [Demo] Simulate Admin Approval
          </button>
        </div>
      )}

      {showEvidenceWarn ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Evidence wajib diupload sebelum submit.</p>
            <p className="text-xs text-amber-700 mt-0.5">Silakan upload evidence terlebih dahulu di bagian <span className="font-bold">Evidence Documents</span> di bawah ini.</p>
          </div>
          <button type="button" onClick={() => setShowEvidenceWarn(false)} className="shrink-0 text-amber-500 hover:text-amber-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : isDeadlinePassed && openLockApproved && !submitted && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-200 bg-green-50">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            Akses telah dibuka oleh Admin HR. Anda dapat melengkapi dan submit KPI Tracking.
          </span>
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
          <button
            onClick={() => { setPendingEditRequest(false); setEditRequestApproved(true); }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300 transition-colors"
          >
            [Demo] Simulate Approval
          </button>
        </div>
      )}

      {submitted && !pendingEditRequest && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-green-200 bg-green-50">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
          <span className="text-sm font-medium text-green-700">KPI Tracking has been submitted and is pending Approver review.</span>
          <div className="w-px h-4 bg-green-300 mx-1" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-green-700/60">Submission Info</span>
          <div className="w-px h-4 bg-green-300" />
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">Date Submitted:</span>
            <span className="font-bold text-gray-800">{submittedDate || "—"}</span>
          </div>
          <div className="w-px h-4 bg-green-300" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-gray-500">Approval Status:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              HR Check
            </span>
          </div>
        </div>
      )}

      <KPITable
        months={months}
        editable={view === "input" && !submitted && !isLockedByDeadline}
        editableMonthId={(!submitted && !isLockedByDeadline && months.length > 0) ? months[months.length - 1].id : null}
        onRemoveMonth={removeMonth}
        onAddMonth={() => setShowAddModal(true)}
        cells={cellsMap}
        onCellChange={updateCell}
        onCellBlur={handleCellBlur}
        onOpenRCA={view === "input" && !submitted ? openRCA : undefined}
        onViewRCA={(rcaKey, secondaryKey, kpiName, monthLabel) =>
          setViewingRCA({ rcaKey, secondaryKey, kpiName, monthLabel })
        }
        rcaMap={rcaMap}
        storedRCAStatus={storedRCAStatus}
        approvedEditCells={approvedEditCells}
      />

      <EvidenceUploadSection
        files={evidenceFiles}
        onAdd={addEvidence}
        onRemove={removeEvidence}
        editable={(view === "input" && !submitted && !isLockedByDeadline) || editRequestApproved}
        monthLabels={months.map((m) => m.label)}
      />

      <KPIHistorySection months={months} />

      <ApproverCommentsPanel />

      {showAddModal && (
        <AddMonthModal
          existingLabels={months.map((m) => m.label)}
          onAdd={addMonth}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {pendingRCA && (
        <RCAModal
          pending={pendingRCA}
          existing={rcaMap[`${pendingRCA.kpiNo}__${pendingRCA.monthId}`]}
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
              key,
              id: key,
              submittedDate: iso,
              periode: ml.split("-")[0],
              monthLabel: ml,
              year: "20" + (ml.split("-")[1] ?? "26"),
              kpiIndicator: pendingRCA!.kpiName,
              targetMonthly: pendingRCA!.target,
              actual: pendingRCA!.actual,
              achievementPct: pendingRCA!.achievementPct,
              satuan: pendingRCA!.satuan,
              baseline: pendingRCA!.baseline,
              masalahBlocks: storedBlocks,
              masalahUtama: entry.masalahUtama,
              kenapaA: entry.kenapaA,
              kenapaB: entry.kenapaB,
              kenapaC: entry.kenapaC,
              actionPlans: entry.actionPlans,
            });
            // Refresh storedRCAStatus so tag color updates immediately
            setStoredRCAStatus(buildStoredRCAStatusMap(loadRCASubmissions()));
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
          onClose={() => setViewingRCA(null)}
          onNavigate={() => { setViewingRCA(null); navigate("/measurement/rca"); }}
        />
      )}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
      {showOpenLockModal && (
        <OpenLockRequestModal
          onCancel={() => setShowOpenLockModal(false)}
          onConfirm={() => { setShowOpenLockModal(false); setOpenLockRequested(true); }}
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
