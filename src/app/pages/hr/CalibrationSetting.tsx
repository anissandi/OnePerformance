// @refresh reset
import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  Save, Edit2, Building2, ChevronRight, ChevronDown, ArrowLeft, Eye, Send, Layers, Lock,
  CheckCircle2, Clock, X, RefreshCw, Users, Archive, RotateCcw, Sparkles, AlertTriangle, TrendingUp, Percent,
} from "lucide-react";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import { Tooltip as UiTooltip, TooltipContent as UiTooltipContent, TooltipTrigger as UiTooltipTrigger } from "../../components/ui/tooltip";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Dot,
} from "recharts";
import { loadPersistedState, safeGetLocalRaw, savePersistedState, syncToSupabase } from "../../services/supabaseClient";
import { canonicalizeCompanyUnitName, isExcludedFromAppraisalCalibration, loadManagedUsers, useAuthStore } from "../../store/authStore";
import { archiveUsers, EOY_ARCHIVE_REASON, loadArchivedUsers } from "../../store/archiveStore";
import {
  CALIBRATION_GROUPS,
  GROUP_CALIBRATION_SETTINGS_KEY,
  getCalibrationGroupByUnitName,
  getGroupSoyApproval,
  getSoyApproval,
  loadSoyEmployeeSnapshot,
  refreshGroupSoyApprovalsFromBackend,
  resetSoyApproval,
  SOY_EVENT,
  submitGroupSoyForApproval,
  type CalibrationGroupId,
  type CalibrationGroupMeta,
  type SoyApprovalRecord,
  type SoyUnitSnapshot,
} from "../../store/calibrationSoyStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalibrationGrade = { id: string; grade: string; proporsi: string };
export type DivisionProportion = {
  id: string;
  divisi: string;
  hc: number;
  /** Override kuota manual per gradeId (permintaan Management). */
  customQuotas?: Record<string, number>;
};
export type DepartemenenProportion = {
  id: string;
  divisiId: string;
  departemen: string;
  hc: number;
  customQuotas?: Record<string, number>;
};
export type BagianProportion = {
  id: string;
  departemenenId: string;
  bagian: string;
  hc: number;
  customQuotas?: Record<string, number>;
};

export type CompanyUnit = {
  id: string;
  name: string;
  code: string;
  industry: string;
  calibrationGrades: CalibrationGrade[];
  /** Target kuota tingkat Unit Usaha hasil distribusi dari Group (`[A+, A, B, C, D, E]`) */
  unitQuotaTargets?: number[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  beginningHC?: Record<string, number>;
  beginningGrades?: CalibrationGrade[];
  beginningUnitQuotaTargets?: number[];
  beginningCustomQuotas?: Record<string, Record<string, number>>;
  yearEndUpdatedAt?: string;
  yearEndStatus?: PageMode;
};

export type CalibrationGroupSetting = {
  id: CalibrationGroupId;
  slug: string;
  name: string;
  code: string;
  industry: string;
  unitNames: string[];
  calibrationGrades: CalibrationGrade[];
  /** Override kuota manual pada tabel Proportion per Company Unit (`unitId -> gradeId -> kuota`) */
  unitCustomQuotas?: Record<string, Record<string, number>>;
  beginningGrades?: CalibrationGrade[];
  beginningUnitCustomQuotas?: Record<string, Record<string, number>>;
  yearEndUpdatedAt?: string;
  yearEndStatus?: PageMode;
};

type PageMode = "edit" | "preview" | "submitted";

// ─── Default data ─────────────────────────────────────────────────────────────

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%" },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%" },
];

const GRADE_COLORS: Record<string, string> = {
  "A+": "#10B981",
  "A":  "#3B82F6",
  "B":  "#F59E0B",
  "C":  "#EF4444",
  "D":  "#DC2626",
  "E":  "#991B1B",
};

const EXTRA_SOFT_ROW_PALETTE = [
  "bg-[#F6FAFF] hover:bg-[#EDF4FC]",
  "bg-[#F4FBF9] hover:bg-[#EBF6F3]",
  "bg-[#FFFBF4] hover:bg-[#FDF3E3]",
  "bg-[#F8F9FC] hover:bg-[#EFF2F9]",
];

const SOFT_TAG_PALETTE = [
  "bg-[#EBF2FA] text-[#2F5597] border-[#C9DCF0]",
  "bg-[#E6F3F1] text-[#1D6863] border-[#B8DDD8]",
  "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4]",
  "bg-emerald-50 text-emerald-800 border-emerald-200",
  "bg-sky-50 text-sky-800 border-sky-200",
];

const DIV_DEFS = [
  { id: "div1", divisi: "Staff Management" },
  { id: "div2", divisi: "Generals" },
  { id: "div3", divisi: "Finance & Accounting" },
  { id: "div4", divisi: "Logistic / Materials" },
  { id: "div5", divisi: "Quality Management" },
  { id: "div6", divisi: "Coconut Production" },
  { id: "div7", divisi: "Pineapple Production" },
  { id: "div8", divisi: "Utility & Supports" },
];

const DEPT_DEFS: [string, string, string][] = [
  ["dep1","div1","Sumber Daya Manusia"],["dep2","div1","Umum & Administrasi"],
  ["dep3","div2","Legal & Compliance"],["dep4","div2","Teknologi Informasi"],
  ["dep5","div3","Keuangan"],["dep6","div3","Akuntansi"],["dep7","div3","Pajak & Audit"],
  ["dep8","div4","Warehouse & Inventory"],["dep9","div4","Purchasing"],
  ["dep10","div5","Quality Control"],["dep11","div5","Quality Assurance"],
  ["dep12","div6","Produksi Kelapa A"],["dep13","div6","Produksi Kelapa B"],
  ["dep14","div7","Produksi Nanas"],["dep15","div8","Maintenance"],["dep16","div8","Utilitas & Energi"],
];

const BAGIAN_DEFS: [string, string, string][] = [
  ["bag1","dep1","Rekrutmen & Seleksi"],["bag2","dep1","Pengembangan SDM"],
  ["bag3","dep2","Administrasi Umum"],["bag4","dep2","Kearsipan"],
  ["bag5","dep3","Legal"],["bag6","dep3","Kepatuhan"],
  ["bag7","dep4","Infrastruktur IT"],["bag8","dep4","Pengembangan Sistem"],
  ["bag9","dep5","Treasury"],["bag10","dep5","Anggaran"],
  ["bag11","dep6","Akuntansi Biaya"],["bag12","dep6","Akuntansi Umum"],
  ["bag13","dep7","Pajak"],["bag14","dep7","Internal Audit"],
  ["bag15","dep8","Warehouse"],["bag16","dep8","Inventory Control"],
  ["bag17","dep9","Pengadaan Lokal"],["bag18","dep9","Pengadaan Import"],
  ["bag19","dep10","Inspeksi QC"],["bag20","dep10","Laboratorium"],
  ["bag21","dep11","Sistem Manajemen Mutu"],["bag22","dep11","Dokumentasi QA"],
  ["bag23","dep12","Proses Kelapa A"],["bag24","dep12","Packing Kelapa A"],
  ["bag25","dep13","Proses Kelapa B"],["bag26","dep13","Packing Kelapa B"],
  ["bag27","dep14","Proses Nanas"],["bag28","dep14","Packing Nanas"],
  ["bag29","dep15","Mechanical"],["bag30","dep15","Electrical"],
  ["bag31","dep16","Utilitas"],["bag32","dep16","Energi & Environment"],
];

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => ({
  id,
  name,
  code,
  industry,
  calibrationGrades: makeDefaultCalibrationGrades(),
  divisionProportions: [],
  departemenenProportions: [],
  bagianProportions: [],
});

const defaultCompanyUnits: CompanyUnit[] = [
  makeUnit("1", "PT RSUP (Industry)",          "RSUP-IND", "Industry"),
  makeUnit("2", "PT RSUP (Perkebunan)",        "RSUP-PKB", "Perkebunan"),
  makeUnit("6", "PT RSTM",                     "RSTM",     ""),
  makeUnit("7", "PT GHS",                      "GHS",      ""),
  makeUnit("8", "PT RSUP ASD",                 "RSUP-ASD", ""),
  makeUnit("3", "PT Pulau Sambu (Jakarta)",    "PS-JKT",   "Jakarta"),
  makeUnit("4", "PT Pulau Sambu (Guntung)",    "PS-GTG",   "Guntung"),
  makeUnit("5", "PT Pulau Sambu (Kuala Enok)", "PS-KE",    "Kuala Enok"),
];

const makeDefaultGroupSettings = (): CalibrationGroupSetting[] =>
  CALIBRATION_GROUPS.map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    code: g.code,
    industry: g.industry,
    unitNames: [...g.unitNames],
    calibrationGrades: makeDefaultCalibrationGrades(),
    unitCustomQuotas: {},
  }));

// ─── 2D Largest-Remainder & Management Override Allocation Engine ─────────────

function parseGradePct(proporsi: string): number {
  const n = parseFloat(String(proporsi ?? "").replace("%", "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Pembagian bilangan bulat menggunakan Largest Remainder Method (Hare-Niemeyer)
 * sehingga total kuota SELALU persis sama dengan `total` tanpa selisih pembulatan.
 */
export function apportionLargestRemainder(total: number, weights: number[]): number[] {
  const len = weights.length;
  if (len === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal === 0) return new Array(len).fill(0);

  const cleanW = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const wSum = cleanW.reduce((a, b) => a + b, 0);
  if (wSum <= 0) {
    const base = Math.floor(safeTotal / len);
    const rem = safeTotal % len;
    return cleanW.map((_, i) => base + (i < rem ? 1 : 0));
  }

  const raw = cleanW.map((w) => (safeTotal * w) / wSum);
  const floored = raw.map((x) => Math.floor(x));
  const remainder = safeTotal - floored.reduce((a, b) => a + b, 0);
  const order = cleanW
    .map((w, idx) => ({ idx, frac: raw[idx] - floored[idx], w }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.idx - b.idx);

  for (let k = 0; k < remainder && k < order.length; k++) {
    floored[order[k].idx] += 1;
  }
  return floored;
}

/**
 * Alokasi matriks 2D (Baris Organisasi × Kolom Grade):
 * - Tanpa override manual (atau saat mode `autoBalanceLocked === true`):
 *   menjamin jumlah setiap baris == `rowHCs[r]` DAN jumlah setiap kolom == `colTargets[g]`
 *   sambil mengunci sel `lockedCells` permintaan Management (mis. UNS A+ = 2).
 * - Saat user sedang mengedit sel manual secara langsung (`autoBalanceLocked === false`):
 *   menampilkan nilai sel yang dikunci apa adanya di atas baseline ter-rekonsiliasi sehingga
 *   selisih baris/kolom terlihat transparan sebelum diklik Auto-Balance atau disesuaikan manual.
 */
export function allocate2DQuotaMatrix(params: {
  rowHCs: number[];
  colTargets: number[];
  gradeWeights: number[];
  gradeIds: string[];
  rowCustomQuotas: Array<Record<string, number> | undefined>;
  autoBalanceLocked?: boolean;
}): number[][] {
  const { rowHCs, colTargets, gradeWeights, gradeIds, rowCustomQuotas, autoBalanceLocked = false } = params;
  const R = rowHCs.length;
  const G = gradeIds.length;
  if (R === 0 || G === 0) return [];

  const wSum = gradeWeights.reduce((a, b) => a + b, 0) || 1;
  const ideal = rowHCs.map((hc) => gradeWeights.map((w) => (Math.max(0, hc) * w) / wSum));

  const isLocked = (r: number, g: number): boolean => {
    const cq = rowCustomQuotas[r];
    return Boolean(cq && typeof cq[gradeIds[g]] === "number" && Number.isFinite(cq[gradeIds[g]]));
  };
  const getLockedVal = (r: number, g: number): number =>
    Math.max(0, Math.round(rowCustomQuotas[r]![gradeIds[g]]));

  const anyLocked = rowCustomQuotas.some(
    (cq) => cq && Object.keys(cq).some((k) => typeof cq[k] === "number"),
  );

  // Hitung baseline otomatis yang 100% terekonsiliasi terhadap colTargets terlebih dahulu
  const baseMat: number[][] = rowHCs.map((hc) => apportionLargestRemainder(hc, gradeWeights));
  const totalHC = rowHCs.reduce((a, b) => a + Math.max(0, b), 0);
  const targetSum = colTargets.reduce((a, b) => a + Math.max(0, b), 0);

  if (totalHC === targetSum && totalHC > 0) {
    const maxIter = totalHC * 2 + 24;
    for (let iter = 0; iter < maxIter; iter++) {
      const colSums = gradeIds.map((_, g) => baseMat.reduce((s, row) => s + row[g], 0));
      const overCols = colSums.map((s, g) => (s > colTargets[g] ? g : -1)).filter((g) => g >= 0);
      const underCols = colSums.map((s, g) => (s < colTargets[g] ? g : -1)).filter((g) => g >= 0);
      if (overCols.length === 0 || underCols.length === 0) break;

      let best: { r: number; gp: number; gm: number } | null = null;
      let bestScore = -1e9;
      for (let r = 0; r < R; r++) {
        for (const gp of overCols) {
          if (baseMat[r][gp] <= 0) continue;
          for (const gm of underCols) {
            const score = (ideal[r][gm] - baseMat[r][gm]) + (baseMat[r][gp] - ideal[r][gp]);
            if (score > bestScore) {
              bestScore = score;
              best = { r, gp, gm };
            }
          }
        }
      }
      if (!best) break;
      baseMat[best.r][best.gp] -= 1;
      baseMat[best.r][best.gm] += 1;
    }
  }

  if (!anyLocked) return baseMat;

  if (!autoBalanceLocked) {
    // Tampilkan nilai override manual tepat di sel yang diedit user
    return baseMat.map((row, r) =>
      row.map((val, g) => (isLocked(r, g) ? getLockedVal(r, g) : val)),
    );
  }

  // Mode Auto-Balance: kunci nilai pilihan Management, lalu seimbangkan sisa grade di baris & kolom!
  const mat: number[][] = rowHCs.map((hc, r) => {
    const row = new Array(G).fill(0);
    let lockedSum = 0;
    const unlockedIdx: number[] = [];
    for (let g = 0; g < G; g++) {
      if (isLocked(r, g)) {
        const v = getLockedVal(r, g);
        row[g] = v;
        lockedSum += v;
      } else {
        unlockedIdx.push(g);
      }
    }
    const remHC = Math.max(0, hc - lockedSum);
    const subWeights = unlockedIdx.map((g) => gradeWeights[g]);
    const subAlloc = apportionLargestRemainder(remHC, subWeights);
    unlockedIdx.forEach((g, idx) => {
      row[g] = subAlloc[idx];
    });
    return row;
  });

  if (totalHC === targetSum && totalHC > 0) {
    const maxIter = totalHC * 3 + 32;
    for (let iter = 0; iter < maxIter; iter++) {
      const colSums = gradeIds.map((_, g) => mat.reduce((s, row) => s + row[g], 0));
      const overCols = colSums.map((s, g) => (s > colTargets[g] ? g : -1)).filter((g) => g >= 0);
      const underCols = colSums.map((s, g) => (s < colTargets[g] ? g : -1)).filter((g) => g >= 0);
      if (overCols.length === 0 || underCols.length === 0) break;

      let best: { r: number; gp: number; gm: number } | null = null;
      let bestScore = -1e9;
      for (let r = 0; r < R; r++) {
        for (const gp of overCols) {
          if (isLocked(r, gp) || mat[r][gp] <= 0) continue;
          for (const gm of underCols) {
            if (isLocked(r, gm)) continue;
            const score = (ideal[r][gm] - mat[r][gm]) + (mat[r][gp] - ideal[r][gp]);
            if (score > bestScore) {
              bestScore = score;
              best = { r, gp, gm };
            }
          }
        }
      }
      if (!best) break;
      mat[best.r][best.gp] -= 1;
      mat[best.r][best.gm] += 1;
    }
  }
  return mat;
}

export interface UnitQuotaAllocationResult {
  totalHC: number;
  totalPct: number;
  unitGradeTargets: number[];
  divMatrix: Record<string, number[]>;
  deptMatrix: Record<string, number[]>;
  bagianMatrix: Record<string, number[]>;
}

/**
 * Menghitung distribusi kuota terintegrasi dari level Unit → Division → Departemen → Bagian
 * sehingga total karyawan per grade konsisten 100% dari atas ke bawah.
 */
export function computeUnitQuotaAllocation(params: {
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  unitQuotaTargets?: number[];
}): UnitQuotaAllocationResult {
  const { calibrationGrades, divisionProportions, departemenenProportions, bagianProportions, unitQuotaTargets: explicitTargets } = params;
  const gradeIds = calibrationGrades.map((g) => g.id);
  const gradeWeights = calibrationGrades.map((g) => parseGradePct(g.proporsi));
  const totalPct = Math.round(gradeWeights.reduce((a, b) => a + b, 0) * 100) / 100;
  const totalHC = divisionProportions.reduce((s, d) => s + Math.max(0, d.hc), 0);

  const validExplicit =
    Array.isArray(explicitTargets) &&
    explicitTargets.length === calibrationGrades.length &&
    explicitTargets.reduce((a, b) => a + Math.max(0, b), 0) === totalHC
      ? explicitTargets
      : null;

  const unitGradeTargets =
    validExplicit ??
    (Math.abs(totalPct - 100) < 0.001
      ? apportionLargestRemainder(totalHC, gradeWeights)
      : gradeWeights.map((w) => Math.round((totalHC * w) / 100)));

  // Level 1: Division
  const divAlloc = allocate2DQuotaMatrix({
    rowHCs: divisionProportions.map((d) => d.hc),
    colTargets: unitGradeTargets,
    gradeWeights,
    gradeIds,
    rowCustomQuotas: divisionProportions.map((d) => d.customQuotas),
  });
  const divMatrix: Record<string, number[]> = {};
  divisionProportions.forEach((d, idx) => {
    divMatrix[d.id] = divAlloc[idx] ?? new Array(gradeIds.length).fill(0);
  });

  // Level 2: Departemen (mengacu ke kuota parent Division masing-masing)
  const deptMatrix: Record<string, number[]> = {};
  for (const div of divisionProportions) {
    const childDepts = departemenenProportions.filter((dep) => dep.divisiId === div.id);
    if (childDepts.length === 0) continue;
    const parentPool = divMatrix[div.id] ?? apportionLargestRemainder(div.hc, gradeWeights);
    const childAlloc = allocate2DQuotaMatrix({
      rowHCs: childDepts.map((dep) => dep.hc),
      colTargets: parentPool,
      gradeWeights,
      gradeIds,
      rowCustomQuotas: childDepts.map((dep) => dep.customQuotas),
    });
    childDepts.forEach((dep, idx) => {
      deptMatrix[dep.id] = childAlloc[idx] ?? new Array(gradeIds.length).fill(0);
    });
  }
  // Fallback jika ada departemen yatim tanpa parent division
  for (const dep of departemenenProportions) {
    if (!deptMatrix[dep.id]) {
      deptMatrix[dep.id] = allocate2DQuotaMatrix({
        rowHCs: [dep.hc],
        colTargets: apportionLargestRemainder(dep.hc, gradeWeights),
        gradeWeights,
        gradeIds,
        rowCustomQuotas: [dep.customQuotas],
      })[0] ?? new Array(gradeIds.length).fill(0);
    }
  }

  // Level 3: Bagian (mengacu ke kuota parent Departemen masing-masing)
  const bagianMatrix: Record<string, number[]> = {};
  for (const dep of departemenenProportions) {
    const childBags = bagianProportions.filter((b) => b.departemenenId === dep.id);
    if (childBags.length === 0) continue;
    const parentPool = deptMatrix[dep.id] ?? apportionLargestRemainder(dep.hc, gradeWeights);
    const childAlloc = allocate2DQuotaMatrix({
      rowHCs: childBags.map((b) => b.hc),
      colTargets: parentPool,
      gradeWeights,
      gradeIds,
      rowCustomQuotas: childBags.map((b) => b.customQuotas),
    });
    childBags.forEach((b, idx) => {
      bagianMatrix[b.id] = childAlloc[idx] ?? new Array(gradeIds.length).fill(0);
    });
  }
  for (const b of bagianProportions) {
    if (!bagianMatrix[b.id]) {
      bagianMatrix[b.id] = allocate2DQuotaMatrix({
        rowHCs: [b.hc],
        colTargets: apportionLargestRemainder(b.hc, gradeWeights),
        gradeWeights,
        gradeIds,
        rowCustomQuotas: [b.customQuotas],
      })[0] ?? new Array(gradeIds.length).fill(0);
    }
  }

  return { totalHC, totalPct, unitGradeTargets, divMatrix, deptMatrix, bagianMatrix };
}

export interface GroupQuotaAllocationResult {
  totalHC: number;
  totalPct: number;
  groupGradeTargets: number[];
  unitHCs: Record<string, number>;
  unitShareMap: Record<string, number>;
  unitMatrix: Record<string, number[]>;
  perUnitAlloc: Record<string, UnitQuotaAllocationResult>;
}

/**
 * Menghitung distribusi kuota terintegrasi dari level Group → Company Unit → Division → Departement (→ Bagian)
 * menggunakan Largest-Remainder & 2D Matrix Allocation sehingga kuota konsisten dari Group hingga setiap Unit Usaha.
 */
export function computeGroupQuotaAllocation(params: {
  calibrationGrades: CalibrationGrade[];
  units: CompanyUnit[];
  unitCustomQuotas?: Record<string, Record<string, number>>;
}): GroupQuotaAllocationResult {
  const { calibrationGrades, units, unitCustomQuotas } = params;
  const gradeIds = calibrationGrades.map((g) => g.id);
  const gradeWeights = calibrationGrades.map((g) => parseGradePct(g.proporsi));
  const totalPct = Math.round(gradeWeights.reduce((a, b) => a + b, 0) * 100) / 100;

  const unitHCs: Record<string, number> = {};
  const rowHCs: number[] = [];
  for (const u of units) {
    const hc = (u.divisionProportions ?? []).reduce((s, d) => s + Math.max(0, d.hc), 0);
    unitHCs[u.id] = hc;
    rowHCs.push(hc);
  }
  const totalHC = rowHCs.reduce((a, b) => a + b, 0);

  const groupGradeTargets =
    Math.abs(totalPct - 100) < 0.001
      ? apportionLargestRemainder(totalHC, gradeWeights)
      : gradeWeights.map((w) => Math.round((totalHC * w) / 100));

  const unitAlloc = allocate2DQuotaMatrix({
    rowHCs,
    colTargets: groupGradeTargets,
    gradeWeights,
    gradeIds,
    rowCustomQuotas: units.map((u) => unitCustomQuotas?.[u.id]),
  });

  const unitMatrix: Record<string, number[]> = {};
  const unitShareMap: Record<string, number> = {};
  const perUnitAlloc: Record<string, UnitQuotaAllocationResult> = {};

  units.forEach((u, idx) => {
    const hc = unitHCs[u.id] ?? 0;
    unitShareMap[u.id] = totalHC > 0 ? (hc / totalHC) * 100 : 0;
    const uTargets = unitAlloc[idx] ?? new Array(gradeIds.length).fill(0);
    unitMatrix[u.id] = uTargets;
    perUnitAlloc[u.id] = computeUnitQuotaAllocation({
      calibrationGrades,
      divisionProportions: u.divisionProportions ?? [],
      departemenenProportions: u.departemenenProportions ?? [],
      bagianProportions: u.bagianProportions ?? [],
      unitQuotaTargets: uTargets,
    });
  });

  return {
    totalHC,
    totalPct,
    groupGradeTargets,
    unitHCs,
    unitShareMap,
    unitMatrix,
    perUnitAlloc,
  };
}

export function orgSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "general";
}

export function loadCalibrationOrgOptions(companyNames?: string[]): {
  divisions: string[];
  departments: string[];
  bagians: string[];
} {
  const divSet = new Set<string>(DIV_DEFS.map((d) => d.divisi));
  const deptSet = new Set<string>(DEPT_DEFS.map(([, , name]) => name));
  const bagSet = new Set<string>(BAGIAN_DEFS.map(([, , name]) => name));

  try {
    const raw =
      localStorage.getItem("calibration_submitted_units") ??
      localStorage.getItem("calibration_hc_settings_2026");
    const savedUnits: CompanyUnit[] = raw ? JSON.parse(raw) : [];
    const baseUnits = defaultCompanyUnits.map((def) => {
      const synced = applyImportedEmployeesDistribution(def);
      const saved = savedUnits.find((s) => s.id === def.id || s.name === def.name);
      return {
        ...synced,
        divisionProportions: [
          ...(saved?.divisionProportions ?? []),
          ...synced.divisionProportions,
        ],
        departemenenProportions: [
          ...(saved?.departemenenProportions ?? []),
          ...synced.departemenenProportions,
        ],
        bagianProportions: [
          ...(saved?.bagianProportions ?? []),
          ...synced.bagianProportions,
        ],
      };
    });

    const filteredUnits =
      companyNames && companyNames.length > 0
        ? baseUnits.filter((u) => companyNames.includes(u.name))
        : baseUnits;

    for (const u of filteredUnits) {
      for (const d of u.divisionProportions) {
        if (d.divisi?.trim()) divSet.add(d.divisi.trim());
      }
      for (const dep of u.departemenenProportions) {
        if (dep.departemen?.trim()) deptSet.add(dep.departemen.trim());
      }
      for (const bag of u.bagianProportions) {
        if (bag.bagian?.trim()) bagSet.add(bag.bagian.trim());
      }
    }
  } catch {
    // ignore and use defaults
  }

  return {
    divisions: Array.from(divSet).sort(),
    departments: Array.from(deptSet).sort(),
    bagians: Array.from(bagSet).sort(),
  };
}

/**
 * Membangun daftar Divisi, Departemen, dan Bagian beserta jumlah HC secara dinamis
 * dari data karyawan aktif pada unit usaha terkait, sambil mempertahankan `customQuotas`
 * apabila jumlah HC baris organisasi tersebut tidak berubah (kecuali `resetCustomQuotas === true`).
 */
export function applyImportedEmployeesDistribution(
  unit: CompanyUnit,
  resetCustomQuotas = false,
): CompanyUnit {
  if (unit.id === "8" || unit.name.trim().toUpperCase() === "ASD" || unit.name.trim().toUpperCase() === "RSUP ASD") {
    unit = { ...unit, name: "PT RSUP ASD", code: "RSUP-ASD" };
  }
  const unitUsers = loadManagedUsers().filter(
    (u) => u.company === unit.name && u.status === "Active" && !isExcludedFromAppraisalCalibration(u),
  );
  if (unitUsers.length === 0) {
    return {
      ...unit,
      divisionProportions: [],
      departemenenProportions: [],
      bagianProportions: [],
    };
  }

  const prevDivMap = new Map((unit.divisionProportions ?? []).map((d) => [d.id, d]));
  const prevDeptMap = new Map((unit.departemenenProportions ?? []).map((d) => [d.id, d]));
  const prevBagMap = new Map((unit.bagianProportions ?? []).map((b) => [b.id, b]));

  const divMap = new Map<string, DivisionProportion>();
  const deptMap = new Map<string, DepartemenenProportion>();
  const bagianMap = new Map<string, BagianProportion>();

  for (const u of unitUsers) {
    const divName = (u.division || "Umum").trim();
    const deptName = (u.department || divName).trim();
    const bagName = (u.bagian || deptName).trim();

    const divId = `div_${orgSlug(divName)}`;
    const deptId = `dep_${orgSlug(divName)}__${orgSlug(deptName)}`;
    const bagId = `bag_${orgSlug(divName)}__${orgSlug(deptName)}__${orgSlug(bagName)}`;

    const curDiv = divMap.get(divId) ?? { id: divId, divisi: divName, hc: 0 };
    curDiv.hc += 1;
    divMap.set(divId, curDiv);

    const curDept = deptMap.get(deptId) ?? { id: deptId, divisiId: divId, departemen: deptName, hc: 0 };
    curDept.hc += 1;
    deptMap.set(deptId, curDept);

    const curBag = bagianMap.get(bagId) ?? { id: bagId, departemenenId: deptId, bagian: bagName, hc: 0 };
    curBag.hc += 1;
    bagianMap.set(bagId, curBag);
  }

  const nextDivs = Array.from(divMap.values()).map((d) => {
    const prev = prevDivMap.get(d.id);
    return !resetCustomQuotas && prev && prev.hc === d.hc && prev.customQuotas
      ? { ...d, customQuotas: prev.customQuotas }
      : d;
  });
  const nextDepts = Array.from(deptMap.values()).map((dep) => {
    const prev = prevDeptMap.get(dep.id);
    return !resetCustomQuotas && prev && prev.hc === dep.hc && prev.customQuotas
      ? { ...dep, customQuotas: prev.customQuotas }
      : dep;
  });
  const nextBags = Array.from(bagianMap.values()).map((bag) => {
    const prev = prevBagMap.get(bag.id);
    return !resetCustomQuotas && prev && prev.hc === bag.hc && prev.customQuotas
      ? { ...bag, customQuotas: prev.customQuotas }
      : bag;
  });

  return {
    ...unit,
    divisionProportions: nextDivs,
    departemenenProportions: nextDepts,
    bagianProportions: nextBags,
  };
}

// ─── Single Bell Curve Card (SOY / EOY — tanpa Target vs Actual, motion lembut) ─

export function SingleBellCurveCard({
  title = "Grade Distribution (Bell Curve)",
  subtitle = "Visualisasi kurva normal proporsi & kuota karyawan per grade",
  calibrationGrades,
  gradeCounts,
}: {
  title?: string;
  subtitle?: string;
  calibrationGrades: CalibrationGrade[];
  gradeCounts: number[];
}) {
  const totalHC = gradeCounts.reduce((a, b) => a + b, 0);
  const data = calibrationGrades.map((g, idx) => {
    const count = gradeCounts[idx] ?? 0;
    const configuredPct = parseGradePct(g.proporsi);
    const effectivePct =
      totalHC > 0 ? parseFloat(((count / totalHC) * 100).toFixed(1)) : configuredPct;
    return {
      grade: g.grade,
      pct: configuredPct > 0 && totalHC === 0 ? configuredPct : effectivePct,
      configuredPct,
      count,
    };
  });

  // Motion bertahap: kurva dimulai dari 0 lalu tumbuh ke nilai aktual setelah kontainer siap
  // (berlaku sama untuk HC Awal Tahun (SOY) maupun HC Akhir Tahun (EOY) yang dibuka melalui tab).
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    setChartReady(false);
    const t = window.setTimeout(() => setChartReady(true), 180);
    return () => window.clearTimeout(t);
  }, [title]);
  const chartData = chartReady ? data : data.map((d) => ({ ...d, pct: 0 }));

  const CustomBarShape = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (!height || height <= 0) return null;
    const fill = GRADE_COLORS[payload?.grade] ?? "#1A284F";
    return <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.22} rx={5} ry={5} />;
  };

  const CurveDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const color = GRADE_COLORS[payload?.grade] ?? "#1A284F";
    return <Dot cx={cx} cy={cy} r={5.5} fill={color} stroke="#ffffff" strokeWidth={2} />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col justify-between"
    >
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
          Total HC: {totalHC.toLocaleString()} orang
        </span>
      </div>

      <div className="p-6 flex flex-col gap-4 flex-1 justify-between">
        <div className="w-full h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 14, right: 18, left: -12, bottom: 0 }} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="grade"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                cursor={{ fill: "rgba(26,40,79,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as {
                    grade: string;
                    pct: number;
                    configuredPct: number;
                    count: number;
                  };
                  const c = GRADE_COLORS[d.grade] ?? "#1A284F";
                  return (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-3.5 py-2.5 text-xs min-w-[165px]">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                        <span className="font-bold text-gray-900">Grade {d.grade}</span>
                      </div>
                      <div className="flex justify-between gap-3 text-gray-600">
                        <span>Proporsi Target:</span>
                        <span className="font-semibold text-gray-900">{d.configuredPct}%</span>
                      </div>
                      <div className="flex justify-between gap-3 text-gray-600 mt-0.5">
                        <span>Kuota Karyawan:</span>
                        <span className="font-bold text-[#1A284F]">{d.count} orang ({d.pct}%)</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="pct"
                name="Distribusi (%)"
                shape={<CustomBarShape />}
                isAnimationActive={true}
                animationDuration={700}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="pct"
                name="Kurva Distribusi"
                stroke="#1A284F"
                strokeWidth={2.5}
                dot={<CurveDot />}
                activeDot={{ r: 6.5 }}
                isAnimationActive={true}
                animationDuration={850}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-gray-100">
          {data.map((d, di) => {
            const color = GRADE_COLORS[d.grade] ?? "#1A284F";
            return (
              <motion.div
                key={d.grade}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.35, delay: 0.25 + di * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-xl border border-gray-100 bg-gray-50/70 px-2.5 py-2 text-center transition-shadow hover:shadow-sm"
              >
                <span
                  className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold text-white"
                  style={{ background: color }}
                >
                  {d.grade}
                </span>
                <p className="text-sm font-bold text-gray-900 mt-1">{d.count}</p>
                <p className="text-[10px] text-gray-500">{d.configuredPct}%</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Comparison Bell Curve Card (Summary: SOY vs EOY) ─────────────────────────

function ComparisonBellCurveCard({
  grades,
  soyCounts,
  eoyCounts,
  hasConfirmedEoy,
}: {
  grades: CalibrationGrade[];
  soyCounts: number[];
  eoyCounts: number[];
  hasConfirmedEoy: boolean;
}) {
  const soyTotal = soyCounts.reduce((a, b) => a + b, 0);
  const eoyTotal = eoyCounts.reduce((a, b) => a + b, 0);

  const data = grades.map((g, idx) => {
    const soyHC = soyCounts[idx] ?? 0;
    const eoyHC = eoyCounts[idx] ?? 0;
    const cfgPct = parseGradePct(g.proporsi);
    const soyPct = soyTotal > 0 ? parseFloat(((soyHC / soyTotal) * 100).toFixed(1)) : cfgPct;
    const eoyPct = eoyTotal > 0 ? parseFloat(((eoyHC / eoyTotal) * 100).toFixed(1)) : cfgPct;
    return {
      grade: g.grade,
      "Awal Tahun (SOY)": soyPct,
      "Akhir Tahun (EOY)": eoyPct,
      soyHC,
      eoyHC,
    };
  });

  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    setChartReady(false);
    const t = window.setTimeout(() => setChartReady(true), 140);
    return () => window.clearTimeout(t);
  }, [soyTotal, eoyTotal]);
  const chartData = chartReady
    ? data
    : data.map((d) => ({
        ...d,
        "Awal Tahun (SOY)": 0,
        "Akhir Tahun (EOY)": 0,
      }));

  const SoyDot = (props: any) =>
    props.cx == null ? null : <Dot cx={props.cx} cy={props.cy} r={5} fill="#1A284F" stroke="#fff" strokeWidth={2} />;
  const EoyDot = (props: any) =>
    props.cx == null ? null : <Dot cx={props.cx} cy={props.cy} r={5} fill="#0D9488" stroke="#fff" strokeWidth={2} />;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      <div className="border-b bg-gray-50 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-semibold text-gray-900">
            Grade Distribution (Bell Curve) — Awal Tahun (SOY) vs Akhir Tahun (EOY)
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            Perbandingan kurva distribusi proporsi &amp; kuota karyawan antara HC Awal Tahun (SOY) dan HC Akhir Tahun (EOY).
          </p>
        </div>
        {!hasConfirmedEoy && (
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            EOY menggunakan proyeksi HC saat ini (belum Confirm Data EOY)
          </span>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 xl:grid-cols-[1fr_230px] gap-6 items-center">
        <div className="w-full h-[290px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 16, right: 20, left: -10, bottom: 0 }} barSize={24} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="grade"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, "auto"]}
              />
              <Tooltip
                cursor={{ fill: "rgba(26,40,79,0.04)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload as {
                    "Awal Tahun (SOY)": number;
                    "Akhir Tahun (EOY)": number;
                    soyHC: number;
                    eoyHC: number;
                  };
                  const color = GRADE_COLORS[String(label)] ?? "#1A284F";
                  return (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-xs min-w-[205px] space-y-1.5">
                      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                        <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                        <span className="font-bold text-gray-900">Grade {label}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#1A284F]" />
                          Awal Tahun (SOY)
                        </span>
                        <span className="font-bold text-gray-900">
                          {row["Awal Tahun (SOY)"]}% ({row.soyHC} org)
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#0D9488]" />
                          Akhir Tahun (EOY)
                        </span>
                        <span className="font-bold text-teal-700">
                          {row["Akhir Tahun (EOY)"]}% ({row.eoyHC} org)
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                iconSize={10}
                formatter={(value) => <span className="text-xs text-gray-600 font-medium">{value}</span>}
              />
              <Bar
                dataKey="Awal Tahun (SOY)"
                name="Kuota SOY (%)"
                fill="#1A284F"
                fillOpacity={0.22}
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationDuration={760}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="Akhir Tahun (EOY)"
                name="Kuota EOY (%)"
                fill="#0D9488"
                fillOpacity={0.24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={true}
                animationDuration={840}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Awal Tahun (SOY)"
                name="Kurva Awal Tahun (SOY)"
                stroke="#1A284F"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={<SoyDot />}
                activeDot={{ r: 6 }}
                isAnimationActive={true}
                animationDuration={900}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Akhir Tahun (EOY)"
                name="Kurva Akhir Tahun (EOY)"
                stroke="#0D9488"
                strokeWidth={2.5}
                dot={<EoyDot />}
                activeDot={{ r: 6 }}
                isAnimationActive={true}
                animationDuration={980}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-2">
          {data.map((d, di) => {
            const diffHC = d.eoyHC - d.soyHC;
            const color = GRADE_COLORS[d.grade] ?? "#1A284F";
            return (
              <motion.div
                key={d.grade}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ x: -2 }}
                transition={{ duration: 0.38, delay: 0.18 + di * 0.055, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 transition-shadow hover:shadow-xs"
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: color }}
                >
                  {d.grade}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">SOY → EOY</span>
                    <span
                      className={`font-bold ${
                        diffHC > 0 ? "text-emerald-600" : diffHC < 0 ? "text-rose-600" : "text-gray-400"
                      }`}
                    >
                      {diffHC > 0 ? `+${diffHC}` : diffHC === 0 ? "0" : diffHC} org
                    </span>
                  </div>
                  <p className="text-xs font-bold text-gray-800">
                    {d.soyHC} org ({d["Awal Tahun (SOY)"]}%){" "}
                    <span className="text-gray-400 font-normal">→</span>{" "}
                    {d.eoyHC} org ({d["Akhir Tahun (EOY)"]}%)
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}

// ─── Calibration Panel ────────────────────────────────────────────────────────

function CalibrationPanel({
  calibrationGrades,
  divisionProportions,
  departemenenProportions,
  bagianProportions,
  unitQuotaTargets,
  editMode,
  hideBagian = false,
  onUpdateCalibrationGrade,
  onUpdateDivisionHC,
  onUpdateDepartemenHC,
  onUpdateBagianHC,
  onUpdateDivisionQuota,
  onUpdateDepartemenQuota,
  onUpdateBagianQuota,
  onAutoBalanceLevel,
  onResetLevelQuotas,
}: {
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  unitQuotaTargets?: number[];
  editMode: boolean;
  hideBagian?: boolean;
  onUpdateCalibrationGrade: (id: string, field: keyof CalibrationGrade, value: string) => void;
  onUpdateDivisionHC: (id: string, value: number) => void;
  onUpdateDepartemenHC: (id: string, value: number) => void;
  onUpdateBagianHC: (id: string, value: number) => void;
  onUpdateDivisionQuota: (rowId: string, gradeId: string, value: number | null) => void;
  onUpdateDepartemenQuota: (rowId: string, gradeId: string, value: number | null) => void;
  onUpdateBagianQuota: (rowId: string, gradeId: string, value: number | null) => void;
  onAutoBalanceLevel: (level: "division" | "department" | "bagian") => void;
  onResetLevelQuotas: (level: "division" | "department" | "bagian") => void;
}) {
  const safeDivisions = divisionProportions ?? [];
  const safeDepts = departemenenProportions ?? [];
  const safeBagian = bagianProportions ?? [];

  const alloc = computeUnitQuotaAllocation({
    calibrationGrades,
    divisionProportions: safeDivisions,
    departemenenProportions: safeDepts,
    bagianProportions: safeBagian,
    unitQuotaTargets,
  });

  const totalDivHC = alloc.totalHC;
  const divShareMap: Record<string, number> = {};
  safeDivisions.forEach((d) => {
    divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0;
  });

  const deptShareMap: Record<string, number> = {};
  safeDepts.forEach((dept) => {
    const siblingHC = safeDepts.filter((d) => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptShareMap[dept.id] = siblingHC > 0 ? (dept.hc / siblingHC) * (divShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianShareMap: Record<string, number> = {};
  safeBagian.forEach((b) => {
    const siblingHC = safeBagian.filter((x) => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianShareMap[b.id] = siblingHC > 0 ? (b.hc / siblingHC) * (deptShareMap[b.departemenenId] ?? 0) : 0;
  });

  const fmtShare = (v: number) => (v > 0 ? `${v.toFixed(1)}%` : "0.0%");

  // Jumlah karyawan aktual pada tabel Division per grade (mengikuti hasil rekonsiliasi / override)
  const divisionGradeSums = calibrationGrades.map((_, gi) =>
    safeDivisions.reduce((s, d) => s + (alloc.divMatrix[d.id]?.[gi] ?? 0), 0),
  );
  const unitGradeCounts = alloc.unitGradeTargets;
  const totalUnitKaryawan = unitGradeCounts.reduce((a, b) => a + b, 0);

  const uniqueDivInDepts = new Set(safeDepts.map((d) => d.divisiId).filter(Boolean)).size || safeDivisions.length;
  const uniqueDeptInBagian = new Set(safeBagian.map((b) => b.departemenenId).filter(Boolean)).size || safeDepts.length;

  return (
    <div className="space-y-6">
      {/* Row 1: Grade Distribution & Calibration berdampingan dengan Grade Distribution (Bell Curve) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Grade Distribution &amp; Calibration</h3>
            <p className="text-sm text-gray-500 mt-1">
              Target proporsi kurva normal dan kuota karyawan tingkat Unit Usaha (Largest-Remainder)
            </p>
          </div>
          <div className="p-6 overflow-x-auto flex-1 flex flex-col justify-between gap-3">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1A284F] text-white">
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">GRADE</th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">PROPORSI</th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">KARYAWAN</th>
                </tr>
              </thead>
              <tbody>
                {calibrationGrades.map((grade, idx) => {
                  const karyawan = unitGradeCounts[idx] ?? 0;
                  const divSum = divisionGradeSums[idx] ?? 0;
                  const diffFromDiv = divSum - karyawan;
                  return (
                    <tr key={grade.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2.5 text-center font-semibold text-gray-900">
                        {grade.grade}
                      </td>
                      <td className="border border-gray-300 px-4 py-2.5 text-center">
                        {editMode ? (
                          <input
                            type="text"
                            value={grade.proporsi}
                            onChange={(e) => onUpdateCalibrationGrade(grade.id, "proporsi", e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center"
                          />
                        ) : (
                          <span className="text-gray-900">{grade.proporsi}</span>
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2.5 text-center bg-gray-50">
                        <span className="font-semibold text-gray-900">{karyawan.toLocaleString()}</span>
                        {diffFromDiv !== 0 && (
                          <span
                            title="Selisih total kuota manual Divisi terhadap target kurva normal Unit"
                            className="ml-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                          >
                            Div: {divSum} ({diffFromDiv > 0 ? `+${diffFromDiv}` : diffFromDiv})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[#1A284F] text-white font-semibold">
                  <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
                  <td
                    className={`border border-gray-300 px-4 py-3 text-center ${
                      Math.abs(alloc.totalPct - 100) > 0.001 && alloc.totalPct > 0 ? "text-red-300" : ""
                    }`}
                  >
                    {alloc.totalPct}%
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-center">
                    {totalUnitKaryawan.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[11px] text-gray-500 leading-relaxed">
              Kuota karyawan dihitung dengan metode <strong>Largest Remainder</strong> sehingga jumlah karyawan pada tabel Unit, Division, Departemen, dan Bagian konsisten <strong>{totalDivHC.toLocaleString()} orang</strong>.
            </p>
          </div>
        </div>

        <SingleBellCurveCard
          calibrationGrades={calibrationGrades}
          gradeCounts={divisionGradeSums.some((v, i) => v !== unitGradeCounts[i]) ? divisionGradeSums : unitGradeCounts}
        />
      </div>

      {/* Proportion per Division */}
      <ProportionTable
        title="Proportion per Division"
        subtitle="Distribusi kuota grade per Divisi (kuota per grade dapat disesuaikan di mode Edit sesuai arahan Management)"
        rows={safeDivisions.map((d) => ({
          id: d.id,
          label: d.divisi,
          hc: d.hc,
          shareKuota: fmtShare(divShareMap[d.id] ?? 0),
          calcs: alloc.divMatrix[d.id] ?? new Array(calibrationGrades.length).fill(0),
          customQuotas: d.customQuotas,
        }))}
        totalHC={totalDivHC}
        targetGradeTotals={unitGradeCounts}
        calibrationGrades={calibrationGrades}
        editMode={editMode}
        onUpdateHC={onUpdateDivisionHC}
        onUpdateQuota={onUpdateDivisionQuota}
        onAutoBalance={() => onAutoBalanceLevel("division")}
        onResetQuotas={() => onResetLevelQuotas("division")}
        primaryFooterLabel={`Jumlah Divisi: ${safeDivisions.length}`}
      />

      {/* Proportion per Departemen */}
      <ProportionTable
        title="Proportion per Departemen"
        subtitle="Share Kuota & alokasi grade diturunkan dari kuota masing-masing Divisi induknya"
        rows={safeDepts.map((dept) => {
          const parentDiv = safeDivisions.find((d) => d.id === dept.divisiId);
          return {
            id: dept.id,
            label: dept.departemen,
            parentLabel: parentDiv?.divisi,
            hc: dept.hc,
            shareKuota: fmtShare(deptShareMap[dept.id] ?? 0),
            calcs: alloc.deptMatrix[dept.id] ?? new Array(calibrationGrades.length).fill(0),
            customQuotas: dept.customQuotas,
          };
        })}
        totalHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
        targetGradeTotals={divisionGradeSums}
        calibrationGrades={calibrationGrades}
        editMode={editMode}
        onUpdateHC={onUpdateDepartemenHC}
        onUpdateQuota={onUpdateDepartemenQuota}
        onAutoBalance={() => onAutoBalanceLevel("department")}
        onResetQuotas={() => onResetLevelQuotas("department")}
        showParent
        parentHeader="DIVISI"
        parentFooterLabel={`Jumlah Divisi: ${uniqueDivInDepts}`}
        primaryFooterLabel={`Jumlah Departemen: ${safeDepts.length}`}
      />

      {/* Proportion per Bagian */}
      {!hideBagian && (
        <ProportionTable
          title="Proportion per Bagian"
          subtitle="Share Kuota & alokasi grade diturunkan dari kuota masing-masing Departemen induknya"
          rows={safeBagian.map((b) => {
            const parentDept = safeDepts.find((d) => d.id === b.departemenenId);
            return {
              id: b.id,
              label: b.bagian,
              parentLabel: parentDept?.departemen,
              hc: b.hc,
              shareKuota: fmtShare(bagianShareMap[b.id] ?? 0),
              calcs: alloc.bagianMatrix[b.id] ?? new Array(calibrationGrades.length).fill(0),
              customQuotas: b.customQuotas,
            };
          })}
          totalHC={safeBagian.reduce((s, b) => s + b.hc, 0)}
          targetGradeTotals={calibrationGrades.map((_, gi) =>
            safeDepts.reduce((s, dep) => s + (alloc.deptMatrix[dep.id]?.[gi] ?? 0), 0),
          )}
          calibrationGrades={calibrationGrades}
          editMode={editMode}
          onUpdateHC={onUpdateBagianHC}
          onUpdateQuota={onUpdateBagianQuota}
          onAutoBalance={() => onAutoBalanceLevel("bagian")}
          onResetQuotas={() => onResetLevelQuotas("bagian")}
          showParent
          parentHeader="DEPARTEMEN"
          parentFooterLabel={`Jumlah Departemen: ${uniqueDeptInBagian}`}
          primaryFooterLabel={`Jumlah Bagian: ${safeBagian.length}`}
        />
      )}
    </div>
  );
}

// ─── Proportion Table ─────────────────────────────────────────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  hc: number;
  shareKuota: string;
  calcs: number[];
  customQuotas?: Record<string, number>;
};

function ProportionTable({
  title,
  subtitle,
  rows,
  totalHC,
  targetGradeTotals,
  calibrationGrades,
  editMode,
  isConfirmedLocked = false,
  disableHcEdit = false,
  onUpdateHC,
  onUpdateQuota,
  onAutoBalance,
  onResetQuotas,
  showParent,
  parentHeader,
  parentFooterLabel,
  primaryFooterLabel,
  firstColHeader,
  selectedRowId,
  onRowClick,
}: {
  title: string;
  subtitle: string;
  rows: PropRow[];
  totalHC: number;
  targetGradeTotals: number[];
  calibrationGrades: CalibrationGrade[];
  editMode: boolean;
  isConfirmedLocked?: boolean;
  disableHcEdit?: boolean;
  onUpdateHC: (id: string, val: number) => void;
  onUpdateQuota: (rowId: string, gradeId: string, val: number | null) => void;
  onAutoBalance: () => void;
  onResetQuotas: () => void;
  showParent?: boolean;
  parentHeader?: string;
  parentFooterLabel?: string;
  primaryFooterLabel: string;
  firstColHeader?: string;
  selectedRowId?: string | null;
  onRowClick?: (rowId: string) => void;
}) {
  const gradeHeaders = calibrationGrades.map((g) => g.grade);
  const gradeTotals = calibrationGrades.map((_, i) => rows.reduce((s, r) => s + (r.calcs[i] ?? 0), 0));
  const grandTotal = rows.reduce((s, r) => s + r.calcs.reduce((a, v) => a + v, 0), 0);

  const hasAnyCustomQuota = rows.some(
    (r) => r.customQuotas && Object.keys(r.customQuotas).length > 0,
  );
  const hasRowMismatch = rows.some((r) => r.calcs.reduce((a, v) => a + v, 0) !== r.hc);
  const hasColMismatch = gradeTotals.some((tot, i) => tot !== (targetGradeTotals[i] ?? tot));

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        {((editMode && (hasAnyCustomQuota || hasRowMismatch || hasColMismatch)) || isConfirmedLocked) && (
          <div className="flex flex-wrap items-center gap-2">
            {editMode && (hasAnyCustomQuota || hasRowMismatch || hasColMismatch) && (
            <button
              type="button"
              onClick={onAutoBalance}
              title="Kunci nilai kuota yang sudah Anda ubah manual, lalu seimbangkan otomatis sisa grade & baris lain agar kembali sesuai HC dan kurva normal"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Auto-Balance Sisa Kuota
            </button>
            )}
            {(hasAnyCustomQuota || isConfirmedLocked) && (
              <button
                type="button"
                disabled={isConfirmedLocked}
                onClick={isConfirmedLocked ? undefined : onResetQuotas}
                title={
                  isConfirmedLocked
                    ? "Reset Kuota Otomatis tidak aktif karena Confirm Data telah dilakukan. Klik Cancel Confirm terlebih dahulu."
                    : "Kembalikan kuota manual ke perhitungan otomatis"
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                  isConfirmedLocked
                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                    : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                Reset Kuota Otomatis
              </button>
            )}
          </div>
        )}
      </div>

      {editMode && (hasRowMismatch || hasColMismatch) && (
        <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Penyesuaian Kuota Manual Terdeteksi</p>
            <p className="text-amber-800">
              {hasRowMismatch && "Terdapat baris yang jumlah kuota gradenya belum sama dengan HC organisasi. "}
              {hasColMismatch && "Total kuota kolom grade berbeda dari target distribusi normal induk. "}
              Anda dapat menyesuaikan sel pada baris/divisi lain secara manual atau klik <strong>Auto-Balance Sisa Kuota</strong> untuk menyeimbangkan otomatis dengan tetap mengunci angka pilihan Management.
            </p>
          </div>
        </div>
      )}

      <div className="p-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {showParent && (
                <th className="border border-gray-300 px-3 py-3 text-center font-semibold whitespace-nowrap">
                  {parentHeader}
                </th>
              )}
              <th className="border border-gray-300 px-3 py-3 text-left font-semibold">
                {firstColHeader ?? title.replace("Proportion per ", "").toUpperCase()}
              </th>
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold">HC</th>
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold whitespace-nowrap">
                Share Kuota
              </th>
              {gradeHeaders.map((g) => (
                <th key={g} className="border border-gray-300 px-3 py-3 text-center font-semibold">
                  {g}
                </th>
              ))}
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold">JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const rowTotal = row.calcs.reduce((s, v) => s + v, 0);
              const rowDiff = rowTotal - row.hc;
              const isRowSelected = Boolean(selectedRowId && selectedRowId === row.id);
              const softRowBg = EXTRA_SOFT_ROW_PALETTE[rIdx % EXTRA_SOFT_ROW_PALETTE.length];
              const softTagCls = SOFT_TAG_PALETTE[rIdx % SOFT_TAG_PALETTE.length];
              return (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.id) : undefined}
                  className={`transition-colors ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${
                    isRowSelected
                      ? "bg-[#E2EEFB] hover:bg-[#D7E7F8]"
                      : softRowBg
                  }`}
                >
                  {showParent && (
                    <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">
                      {row.parentLabel ?? "—"}
                    </td>
                  )}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900 font-medium">
                    {onRowClick ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-semibold text-[#1A284F]">
                          <Building2 className="w-4 h-4 text-[#2F5597] shrink-0" />
                          <span>{row.label}</span>
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isRowSelected
                              ? "bg-[#1A284F] text-white border-[#1A284F]"
                              : softTagCls
                          }`}
                        >
                          {isRowSelected ? "Terbuka" : "Lihat Divisi & Dept"}
                          {isRowSelected ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </span>
                      </div>
                    ) : (
                      row.label
                    )}
                  </td>
                  <td
                    className="border border-gray-300 px-3 py-2.5 text-center"
                    onClick={editMode && !disableHcEdit ? (e) => e.stopPropagation() : undefined}
                  >
                    {editMode && !disableHcEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={row.hc ?? 0}
                        onChange={(e) => onUpdateHC(row.id, Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0"
                        className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center"
                      />
                    ) : (
                      <span className="text-gray-900">{row.hc.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center bg-gray-50">
                    <span className="text-gray-700 font-medium">{row.shareKuota}</span>
                  </td>
                  {calibrationGrades.map((g, i) => {
                    const v = row.calcs[i] ?? 0;
                    const isOverridden =
                      row.customQuotas !== undefined &&
                      typeof row.customQuotas[g.id] === "number";
                    return (
                      <td
                        key={g.id}
                        className={`border border-gray-300 px-2 py-2 text-center ${
                          isOverridden ? "bg-indigo-50/80" : "bg-gray-50"
                        }`}
                        onClick={editMode ? (e) => e.stopPropagation() : undefined}
                      >
                        {editMode ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={v}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                  onUpdateQuota(row.id, g.id, null);
                                } else {
                                  onUpdateQuota(row.id, g.id, Math.max(0, Math.round(Number(raw) || 0)));
                                }
                              }}
                              className={`w-14 px-1.5 py-1 rounded border text-xs text-center font-semibold focus:outline-none focus:ring-2 ${
                                isOverridden
                                  ? "border-indigo-400 bg-white text-indigo-900 focus:ring-indigo-200"
                                  : "border-gray-200 bg-white text-gray-800 focus:ring-[#1A284F]/20"
                              }`}
                            />
                            {isOverridden && (
                              <button
                                type="button"
                                title="Hapus kunci manual sel ini"
                                onClick={() => onUpdateQuota(row.id, g.id, null)}
                                className="text-indigo-400 hover:text-rose-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span
                            className={
                              isOverridden
                                ? "inline-flex items-center gap-1 font-bold text-indigo-800"
                                : "text-gray-900"
                            }
                            title={isOverridden ? "Kuota disesuaikan manual (Management)" : undefined}
                          >
                            {v}
                            {isOverridden && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={`border border-gray-300 px-3 py-2.5 text-center font-semibold ${
                      rowDiff !== 0 ? "bg-amber-50 text-amber-800" : "text-gray-900"
                    }`}
                  >
                    <span>{rowTotal.toLocaleString()}</span>
                    {rowDiff !== 0 && (
                      <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 whitespace-nowrap">
                        {rowDiff > 0 ? `+${rowDiff}` : rowDiff} vs HC
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[#1A284F] text-white font-semibold">
              {showParent && (
                <td className="border border-gray-300 px-3 py-3 text-center whitespace-nowrap text-xs">
                  {parentFooterLabel ?? "—"}
                </td>
              )}
              <td className="border border-gray-300 px-3 py-3 text-center whitespace-nowrap text-xs">
                {primaryFooterLabel}
              </td>
              <td className="border border-gray-300 px-3 py-3 text-center">{totalHC.toLocaleString()}</td>
              <td className="border border-gray-300 px-3 py-3 text-center">
                {rows.length > 0 && totalHC > 0 ? "100%" : "0%"}
              </td>
              {gradeTotals.map((t, i) => {
                const targetT = targetGradeTotals[i] ?? t;
                const colDiff = t - targetT;
                return (
                  <td key={i} className="border border-gray-300 px-3 py-3 text-center whitespace-nowrap">
                    <span>{t.toLocaleString()}</span>
                    {colDiff !== 0 && (
                      <span
                        title={`Target distribusi induk: ${targetT} orang`}
                        className="block text-[10px] font-bold text-amber-300"
                      >
                        ({colDiff > 0 ? `+${colDiff}` : colDiff} vs {targetT})
                      </span>
                    )}
                  </td>
                );
              })}
              <td
                className={`border border-gray-300 px-3 py-3 text-center ${
                  grandTotal !== totalHC ? "text-amber-300" : ""
                }`}
              >
                {grandTotal.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Summary Comparison (SOY vs EOY) ──────────────────────────────────────────

function headcountPercentageChange(beginning: number, ending: number): string {
  if (beginning === 0) return ending === 0 ? "0.0%" : "N/A (HC awal 0)";
  const percentage = ((ending - beginning) / beginning) * 100;
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function CalibrationSummaryComparison({ unit, hideBagian = false }: { unit: CompanyUnit; hideBagian?: boolean }) {
  const [level, setLevel] = useState("division");
  const soyApproval = getSoyApproval(unit.id);
  const lockedSoySnap = soyApproval?.status === "Approved" && soyApproval.snapshot ? soyApproval.snapshot : null;
  const baseline = unit.beginningHC;
  const initialGrades = lockedSoySnap?.calibrationGrades ?? unit.beginningGrades ?? unit.calibrationGrades;

  // Susun daftar organisasi SOY yang terkunci vs EOY terkini agar perbandingan selalu akurat
  const soyDivs: DivisionProportion[] = lockedSoySnap
    ? lockedSoySnap.divisionProportions
    : unit.divisionProportions.map((d) => ({
        ...d,
        hc: baseline ? baseline[d.id] ?? 0 : d.hc,
        customQuotas: baseline ? unit.beginningCustomQuotas?.[d.id] : d.customQuotas,
      }));
  const soyDepts: DepartemenenProportion[] = lockedSoySnap
    ? lockedSoySnap.departemenenProportions
    : unit.departemenenProportions.map((dep) => ({
        ...dep,
        hc: baseline ? baseline[dep.id] ?? 0 : dep.hc,
        customQuotas: baseline ? unit.beginningCustomQuotas?.[dep.id] : dep.customQuotas,
      }));
  const soyBags: BagianProportion[] = lockedSoySnap
    ? lockedSoySnap.bagianProportions
    : unit.bagianProportions.map((b) => ({
        ...b,
        hc: baseline ? baseline[b.id] ?? 0 : b.hc,
        customQuotas: baseline ? unit.beginningCustomQuotas?.[b.id] : b.customQuotas,
      }));

  const soyHcById = new Map<string, number>();
  for (const r of [...soyDivs, ...soyDepts, ...soyBags]) {
    soyHcById.set(r.id, r.hc);
  }
  const eoyHcById = new Map<string, number>();
  for (const r of [...unit.divisionProportions, ...unit.departemenenProportions, ...unit.bagianProportions]) {
    eoyHcById.set(r.id, r.hc);
  }

  const initialHC = (item: { id: string; hc: number }) => soyHcById.get(item.id) ?? 0;

  const soyAlloc = computeUnitQuotaAllocation({
    calibrationGrades: initialGrades,
    divisionProportions: soyDivs,
    departemenenProportions: soyDepts,
    bagianProportions: soyBags,
    unitQuotaTargets: lockedSoySnap?.unitQuotaTargets ?? unit.beginningUnitQuotaTargets ?? unit.unitQuotaTargets,
  });

  const eoyAlloc = computeUnitQuotaAllocation({
    calibrationGrades: unit.calibrationGrades,
    divisionProportions: unit.divisionProportions,
    departemenenProportions: unit.departemenenProportions,
    bagianProportions: unit.bagianProportions,
    unitQuotaTargets: unit.unitQuotaTargets,
  });

  const soyGradeCounts = initialGrades.map((_, gi) =>
    soyDivs.reduce((s, d) => s + (soyAlloc.divMatrix[d.id]?.[gi] ?? 0), 0),
  );
  const eoyGradeCounts = unit.calibrationGrades.map((_, gi) =>
    unit.divisionProportions.reduce((s, d) => s + (eoyAlloc.divMatrix[d.id]?.[gi] ?? 0), 0),
  );

  // Gabungkan organisasi yang ada di SOY maupun EOY
  const unionDivs = (() => {
    const map = new Map<string, { id: string; divisi: string; hc: number }>();
    for (const d of soyDivs) map.set(d.id, { id: d.id, divisi: d.divisi, hc: eoyHcById.get(d.id) ?? 0 });
    for (const d of unit.divisionProportions) map.set(d.id, { id: d.id, divisi: d.divisi, hc: d.hc });
    return Array.from(map.values());
  })();
  const unionDepts = (() => {
    const map = new Map<string, { id: string; divisiId: string; departemen: string; hc: number }>();
    for (const d of soyDepts) map.set(d.id, { id: d.id, divisiId: d.divisiId, departemen: d.departemen, hc: eoyHcById.get(d.id) ?? 0 });
    for (const d of unit.departemenenProportions) map.set(d.id, { id: d.id, divisiId: d.divisiId, departemen: d.departemen, hc: d.hc });
    return Array.from(map.values());
  })();
  const unionBags = (() => {
    const map = new Map<string, { id: string; departemenenId: string; bagian: string; hc: number }>();
    for (const b of soyBags) map.set(b.id, { id: b.id, departemenenId: b.departemenenId, bagian: b.bagian, hc: eoyHcById.get(b.id) ?? 0 });
    for (const b of unit.bagianProportions) map.set(b.id, { id: b.id, departemenenId: b.departemenenId, bagian: b.bagian, hc: b.hc });
    return Array.from(map.values());
  })();

  function shares(initial: boolean) {
    const getHC = (item: { id: string; hc: number }) => (initial ? soyHcById.get(item.id) ?? 0 : eoyHcById.get(item.id) ?? 0);
    const total = unionDivs.reduce((sum, item) => sum + getHC(item), 0);
    const result: Record<string, number> = {};
    unionDivs.forEach((item) => {
      result[item.id] = total ? (getHC(item) / total) * 100 : 0;
    });
    unionDepts.forEach((item) => {
      const siblings = unionDepts
        .filter((entry) => entry.divisiId === item.divisiId)
        .reduce((sum, entry) => sum + getHC(entry), 0);
      result[item.id] = siblings ? (getHC(item) / siblings) * (result[item.divisiId] ?? 0) : 0;
    });
    unionBags.forEach((item) => {
      const siblings = unionBags
        .filter((entry) => entry.departemenenId === item.departemenenId)
        .reduce((sum, entry) => sum + getHC(entry), 0);
      result[item.id] = siblings ? (getHC(item) / siblings) * (result[item.departemenenId] ?? 0) : 0;
    });
    return result;
  }

  const beforeShares = shares(true);
  const afterShares = shares(false);
  const rows =
    level === "division"
      ? unionDivs.map((item) => ({ ...item, label: item.divisi }))
      : level === "department"
      ? unionDepts.map((item) => ({ ...item, label: item.departemen }))
      : unionBags.map((item) => ({ ...item, label: item.bagian }));

  const deltaColor = (value: number) =>
    value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  const signed = (value: number, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

  const gradeRows = unit.calibrationGrades.map((after, idx) => {
    const before = initialGrades.find((item) => item.id === after.id) ?? after;
    const beforePercent = parseGradePct(before.proporsi);
    const afterPercent = parseGradePct(after.proporsi);
    const beforeCount = soyGradeCounts[idx] ?? 0;
    const afterCount = eoyGradeCounts[idx] ?? 0;
    return {
      id: after.id,
      label: after.grade,
      beforePercent,
      afterPercent,
      beforeCount,
      afterCount,
    };
  });

  const gradeTotals = gradeRows.reduce(
    (total, item) => ({
      proportion: total.proportion + item.beforePercent,
      before: total.before + item.beforeCount,
      after: total.after + item.afterCount,
    }),
    { proportion: 0, before: 0, after: 0 },
  );

  const quotaTotals = rows.reduce(
    (total, item) => ({
      before: total.before + initialHC(item),
      after: total.after + item.hc,
      beforeShare: total.beforeShare + (beforeShares[item.id] ?? 0),
      afterShare: total.afterShare + (afterShares[item.id] ?? 0),
    }),
    { before: 0, after: 0, beforeShare: 0, afterShare: 0 },
  );

  return (
    <div className="space-y-6">
      <ComparisonBellCurveCard
        grades={unit.calibrationGrades}
        soyCounts={soyGradeCounts}
        eoyCounts={eoyGradeCounts}
        hasConfirmedEoy={Boolean(unit.yearEndStatus === "submitted" || baseline)}
      />

      <section className="overflow-hidden rounded-xl border border-gray-200">
        <div className="border-b bg-gray-50 p-4">
          <h4 className="font-semibold">Perbandingan Grade Distribution (SOY vs EOY)</h4>
          <p className="mt-1 text-xs text-gray-500">
            Proporsi dan kuota karyawan HC Awal Tahun (SOY) vs HC Akhir Tahun (EOY) yang telah direkonsiliasi.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1A284F] text-white">
              <tr>
                {["Grade", "Proporsi SOY", "Kuota Awal (SOY)", "Kuota Akhir (EOY)", "Selisih Karyawan"].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-3 text-left">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gradeRows.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-4 font-semibold">{item.label}</td>
                  <td className="p-4">{item.beforePercent}%</td>
                  <td className="p-4">{item.beforeCount}</td>
                  <td className="p-4">{item.afterCount}</td>
                  <td className={`p-4 font-semibold ${deltaColor(item.afterCount - item.beforeCount)}`}>
                    {signed(item.afterCount - item.beforeCount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]">
              <tr>
                <th scope="row" className="p-4 text-left">Total</th>
                <td className="p-4">{gradeTotals.proportion.toFixed(1)}%</td>
                <td className="p-4">{gradeTotals.before}</td>
                <td className="p-4">{gradeTotals.after}</td>
                <td className={`p-4 ${deltaColor(gradeTotals.after - gradeTotals.before)}`}>
                  {signed(gradeTotals.after - gradeTotals.before)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200">
        <div className="space-y-4 border-b bg-gray-50 p-4">
          <div>
            <h4 className="font-semibold">Perbandingan Share Quota (SOY vs EOY)</h4>
            <p className="mt-1 text-xs text-gray-500">
              Share quota mengikuti perhitungan hierarki setting antara HC Awal Tahun (SOY) dan HC Akhir Tahun (EOY).
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-gray-600">
              Level
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="mt-1 block rounded-lg border bg-white px-3 py-2 text-sm"
              >
                <option value="division">Division</option>
                <option value="department">Departemen</option>
                {!hideBagian && <option value="bagian">Bagian</option>}
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1A284F] text-white">
              <tr>
                {[
                  "Organisasi",
                  "HC Awal (SOY)",
                  "HC Akhir (EOY)",
                  "Selisih HC",
                  "Perubahan (%)",
                  "Share Quota SOY",
                  "Share Quota EOY",
                  "Selisih Share (%)",
                ].map((label) => (
                  <th key={label} className="whitespace-nowrap px-4 py-3 text-left">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const startHc = initialHC(item);
                return (
                  <tr key={item.id} className="border-t">
                    <td className="p-4 font-medium">{item.label}</td>
                    <td className="p-4">{startHc}</td>
                    <td className="p-4">{item.hc}</td>
                    <td className={`p-4 font-semibold ${deltaColor(item.hc - startHc)}`}>
                      {signed(item.hc - startHc)}
                    </td>
                    <td className={`p-4 font-semibold ${deltaColor(item.hc - startHc)}`}>
                      {headcountPercentageChange(startHc, item.hc)}
                    </td>
                    <td className="p-4">{(beforeShares[item.id] ?? 0).toFixed(1)}%</td>
                    <td className="p-4">{(afterShares[item.id] ?? 0).toFixed(1)}%</td>
                    <td
                      className={`p-4 font-semibold ${deltaColor(
                        (afterShares[item.id] ?? 0) - (beforeShares[item.id] ?? 0),
                      )}`}
                    >
                      {signed((afterShares[item.id] ?? 0) - (beforeShares[item.id] ?? 0), 1)}%
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    Tidak ada organisasi sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]">
              <tr>
                <th scope="row" className="p-4 text-left">Total</th>
                <td className="p-4">{quotaTotals.before}</td>
                <td className="p-4">{quotaTotals.after}</td>
                <td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>
                  {signed(quotaTotals.after - quotaTotals.before)}
                </td>
                <td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>
                  {headcountPercentageChange(quotaTotals.before, quotaTotals.after)}
                </td>
                <td className="p-4">{quotaTotals.beforeShare.toFixed(1)}%</td>
                <td className="p-4">{quotaTotals.afterShare.toFixed(1)}%</td>
                <td className={`p-4 ${deltaColor(quotaTotals.afterShare - quotaTotals.beforeShare)}`}>
                  {signed(quotaTotals.afterShare - quotaTotals.beforeShare, 1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function HeadcountSummary({ unit, hideBagian = false }: { unit: CompanyUnit; hideBagian?: boolean }) {
  const soyApproval = getSoyApproval(unit.id);
  const lockedSoySnap = soyApproval?.status === "Approved" && soyApproval.snapshot ? soyApproval.snapshot : null;
  const baseline = unit.beginningHC;
  const initialTotal = lockedSoySnap
    ? lockedSoySnap.divisionProportions.reduce((total, item) => total + item.hc, 0)
    : unit.divisionProportions.reduce((total, item) => total + (baseline?.[item.id] ?? item.hc), 0);
  const finalTotal = unit.divisionProportions.reduce((total, item) => total + item.hc, 0);
  const difference = finalTotal - initialTotal;
  const hasConfirmedEoy = Boolean(unit.yearEndStatus === "submitted" || baseline);
  const cards: Array<{ label: string; value: React.ReactNode; sub: string; tone: AnalyticsCardTone; icon: React.ReactNode }> = [
    {
      label: "HC Awal Tahun (SOY)",
      value: initialTotal,
      sub: lockedSoySnap ? "Terkunci (Approved SOY)" : "Baseline Awal Tahun",
      tone: "navy",
      icon: <Users className="w-4 h-4" />,
    },
    {
      label: "HC Akhir Tahun (EOY)",
      value: finalTotal,
      sub: hasConfirmedEoy ? "Data EOY terkonfirmasi" : "Proyeksi HC aktif saat ini",
      tone: "teal",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      label: "Selisih HC",
      value: (difference > 0 ? "+" : "") + difference,
      sub: "Perbandingan EOY vs SOY",
      tone: difference > 0 ? "emerald" : difference < 0 ? "rose" : "slate",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      label: "% Perubahan",
      value: headcountPercentageChange(initialTotal, finalTotal),
      sub: "Rasio perubahan headcount",
      tone: "plum",
      icon: <Percent className="w-4 h-4" />,
    },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, idx) => (
            <AnalyticsStatCard
              key={card.label}
              index={idx}
              compact
              tone={card.tone}
              title={card.label}
              value={card.value}
              subtitle={card.sub}
              icon={card.icon}
            />
          ))}
        </div>
        <CalibrationSummaryComparison unit={unit} hideBagian={hideBagian} />
      </div>
    </section>
  );
}

// ─── Year-End (EOY) Calibration Settings ──────────────────────────────────────

function YearEndCalibrationSettings({
  unit,
  onUpdate,
  readOnly = false,
  hideBagian = false,
}: {
  unit: CompanyUnit;
  onUpdate: (unit: CompanyUnit) => void;
  readOnly?: boolean;
  hideBagian?: boolean;
}) {
  const soyApproval = getSoyApproval(unit.id);
  const lockedSoySnap = soyApproval?.status === "Approved" && soyApproval.snapshot ? soyApproval.snapshot : null;
  const makeDraft = (): CompanyUnit =>
    JSON.parse(
      JSON.stringify({
        ...unit,
        beginningHC: undefined,
        beginningGrades: undefined,
        beginningCustomQuotas: undefined,
      }),
    );
  const [draft, setDraft] = useState<CompanyUnit>(makeDraft);
  const [mode, setMode] = useState<PageMode>(unit.yearEndStatus ?? "edit");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setDraft(makeDraft());
  }, [unit.id]);

  const baselineTotal = lockedSoySnap
    ? lockedSoySnap.divisionProportions.reduce((total, item) => total + item.hc, 0)
    : unit.divisionProportions.reduce(
        (total, item) => total + (unit.beginningHC?.[item.id] ?? item.hc),
        0,
      );

  function buildBaselineCustomQuotasSnapshot(): Record<string, Record<string, number>> {
    if (lockedSoySnap) {
      const snap: Record<string, Record<string, number>> = {};
      for (const item of [
        ...lockedSoySnap.divisionProportions,
        ...lockedSoySnap.departemenenProportions,
        ...lockedSoySnap.bagianProportions,
      ]) {
        if (item.customQuotas) snap[item.id] = { ...item.customQuotas };
      }
      return snap;
    }
    if (unit.beginningCustomQuotas) return unit.beginningCustomQuotas;
    const snap: Record<string, Record<string, number>> = {};
    for (const item of [
      ...unit.divisionProportions,
      ...unit.departemenenProportions,
      ...unit.bagianProportions,
    ]) {
      if (item.customQuotas) snap[item.id] = { ...item.customQuotas };
    }
    return snap;
  }

  function persist(status: PageMode, override?: CompanyUnit) {
    const source = override ?? draft;
    const entries = [
      ...source.divisionProportions,
      ...source.departemenenProportions,
      ...source.bagianProportions,
    ];
    if (entries.some((item) => !Number.isSafeInteger(item.hc) || item.hc < 0)) {
      toast.error("HC wajib berupa bilangan bulat minimal 0.");
      return false;
    }
    const lockedHcFromSoy = lockedSoySnap
      ? Object.fromEntries(
          [
            ...lockedSoySnap.divisionProportions,
            ...lockedSoySnap.departemenenProportions,
            ...lockedSoySnap.bagianProportions,
          ].map((item) => [item.id, item.hc]),
        )
      : null;
    onUpdate({
      ...source,
      beginningGrades:
        lockedSoySnap?.calibrationGrades?.map((g) => ({ ...g })) ??
        unit.beginningGrades ??
        (unit.beginningHC ? undefined : unit.calibrationGrades.map((grade) => ({ ...grade }))),
      beginningHC:
        lockedHcFromSoy ??
        unit.beginningHC ??
        Object.fromEntries(
          [
            ...unit.divisionProportions,
            ...unit.departemenenProportions,
            ...unit.bagianProportions,
          ].map((item) => [item.id, item.hc]),
        ),
      beginningCustomQuotas: buildBaselineCustomQuotasSnapshot(),
      yearEndUpdatedAt: new Date().toISOString(),
      yearEndStatus: status,
    });
    setDraft(source);
    if (status !== "submitted") {
      toast.success("HC Akhir Tahun (EOY) tersimpan; baseline HC Awal Tahun (SOY) tetap dipertahankan.");
    }
    return true;
  }

  function confirmYearEndData() {
    const snapshot = loadSoyEmployeeSnapshot()[unit.name] ?? [];
    const activeIds = new Set(
      loadManagedUsers()
        .filter((u) => u.company === unit.name && u.status === "Active" && !isExcludedFromAppraisalCalibration(u))
        .map((u) => u.employeeId.toLowerCase()),
    );
    const archivedIds = new Set(loadArchivedUsers().map((a) => a.user.employeeId.toLowerCase()));
    const inactiveInUnit = loadManagedUsers().filter((u) => u.company === unit.name && u.status !== "Active");
    const eliminated = [
      ...snapshot.filter((u) => !activeIds.has(u.employeeId.toLowerCase())),
      ...inactiveInUnit,
    ].filter(
      (u, i, arr) =>
        !archivedIds.has(u.employeeId.toLowerCase()) &&
        arr.findIndex((x) => x.employeeId === u.employeeId) === i,
    );
    const archivedCount = archiveUsers(eliminated, EOY_ARCHIVE_REASON, "eoy");
    const refreshed = applyImportedEmployeesDistribution(draft);
    setDraft(refreshed);
    if (!persist("submitted", refreshed)) return false;
    window.dispatchEvent(new Event("pa-employees-imported"));
    window.dispatchEvent(new Event("appraisal-updated"));
    toast.success(
      archivedCount > 0
        ? `Data HC Akhir Tahun (EOY) dikonfirmasi. ${archivedCount} karyawan diarsipkan (${EOY_ARCHIVE_REASON}); Bell Curve & HC Aktual diperbarui.`
        : "Data HC Akhir Tahun (EOY) dikonfirmasi. Bell Curve & HC Aktual diperbarui.",
    );
    return true;
  }

  if (!lockedSoySnap && !unit.beginningHC && baselineTotal === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {readOnly
          ? "Data HC Akhir Tahun (EOY) unit usaha ini akan tersedia otomatis setelah pengaturan Group diselesaikan."
          : "Lengkapi dan simpan HC Awal Tahun (SOY) terlebih dahulu sebelum mengatur HC Akhir Tahun (EOY)."}
      </p>
    );
  }

  return (
    <>
      <p className="text-sm font-medium text-gray-500">
        {readOnly
          ? "HC Akhir Tahun (EOY) · 2026 — tersinkronisasi otomatis dari konfirmasi EOY tingkat Group (Read-Only)."
          : "HC Akhir Tahun (EOY) · 2026 — format tabel dan alur sama dengan HC Awal Tahun (SOY). Baseline awal tidak berubah."}
      </p>
      <UnitDetail
        unit={draft}
        onBack={() => {}}
        onUpdate={setDraft}
        pageMode={mode}
        setPageMode={setMode}
        onShowConfirm={() => setConfirm(true)}
        embedded
        readOnly={readOnly}
        hideBagian={hideBagian}
        submitLabel="Confirm Data"
        onSave={(committed) => persist("edit", committed)}
      />
      {!readOnly && confirm && (
        <ConfirmYearEndModal
          unitName={unit.name}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            if (confirmYearEndData()) {
              setConfirm(false);
              setMode("submitted");
            }
          }}
        />
      )}
    </>
  );
}

// ─── Unit Detail (Shared for SOY & Embedded EOY) ──────────────────────────────

function deepCloneUnit(u: CompanyUnit): CompanyUnit {
  return JSON.parse(JSON.stringify(u));
}

function UnitDetail({
  unit,
  onBack,
  onUpdate,
  pageMode,
  setPageMode,
  onShowConfirm,
  embedded = false,
  readOnly = false,
  hideBagian = false,
  onSave,
  submitLabel = "Submit",
  soyApproval,
  onResetSoy,
}: {
  unit: CompanyUnit;
  onBack: () => void;
  onUpdate: (u: CompanyUnit) => void;
  pageMode: PageMode;
  setPageMode: (m: PageMode) => void;
  onShowConfirm: () => void;
  embedded?: boolean;
  readOnly?: boolean;
  hideBagian?: boolean;
  onSave?: (committed: CompanyUnit) => boolean;
  submitLabel?: "Submit" | "Confirm Data";
  soyApproval?: SoyApprovalRecord;
  onResetSoy?: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [hcTab, setHcTab] = useState("start");
  const [isSaved, setIsSaved] = useState(false);
  // Working copy selama Edit Mode agar tombol Cancel mengembalikan 100% nilai sebelum diedit
  const [workingUnit, setWorkingUnit] = useState<CompanyUnit>(() => deepCloneUnit(unit));
  const [preEditSnapshot, setPreEditSnapshot] = useState<CompanyUnit | null>(null);

  useEffect(() => {
    if (!editMode) {
      setWorkingUnit(deepCloneUnit(unit));
    }
  }, [unit, editMode]);

  const activeUnit = editMode ? workingUnit : unit;
  const isSoyApprovedLocked = Boolean(
    !embedded && (soyApproval?.status === "Approved" || soyApproval?.status === "Pending") && soyApproval.snapshot,
  );
  const isEditable = !readOnly && pageMode === "edit" && editMode && !activeUnit.beginningHC && !isSoyApprovedLocked;
  const canSubmit = isSaved || pageMode === "preview";
  const parentGroupMeta = getCalibrationGroupByUnitName(unit.name);

  const updWorking = (patch: Partial<CompanyUnit>) => {
    setWorkingUnit((prev) => ({ ...prev, ...patch }));
  };

  // Helper distribusi HC proporsional berbasis Largest Remainder (tanpa kehilangan sisa bagi Math.floor)
  const handleUpdateDivisionHC = (divId: string, newHC: number) => {
    const updDivisions = workingUnit.divisionProportions.map((d) =>
      d.id === divId ? { ...d, hc: newHC, customQuotas: undefined } : d,
    );
    const deptsInDiv = workingUnit.departemenenProportions.filter((d) => d.divisiId === divId);
    const deptWeights = deptsInDiv.map((d) => (d.hc > 0 ? d.hc : 1));
    const deptHCs = apportionLargestRemainder(newHC, deptWeights);
    const deptHcById = new Map(deptsInDiv.map((d, i) => [d.id, deptHCs[i] ?? 0]));

    const updDepts = workingUnit.departemenenProportions.map((d) =>
      deptHcById.has(d.id)
        ? { ...d, hc: deptHcById.get(d.id)!, customQuotas: undefined }
        : d,
    );

    const updBagian = workingUnit.bagianProportions.map((b) => ({ ...b }));
    for (const dep of deptsInDiv) {
      const targetDepHC = deptHcById.get(dep.id) ?? 0;
      const bags = updBagian.filter((b) => b.departemenenId === dep.id);
      const bagWeights = bags.map((b) => (b.hc > 0 ? b.hc : 1));
      const bagHCs = apportionLargestRemainder(targetDepHC, bagWeights);
      bags.forEach((bag, idx) => {
        bag.hc = bagHCs[idx] ?? 0;
        bag.customQuotas = undefined;
      });
    }
    updWorking({
      divisionProportions: updDivisions,
      departemenenProportions: updDepts,
      bagianProportions: updBagian,
    });
  };

  const handleUpdateDepartemenHC = (deptId: string, rawVal: number) => {
    const dept = workingUnit.departemenenProportions.find((d) => d.id === deptId);
    if (!dept) return;
    const parentDiv = workingUnit.divisionProportions.find((d) => d.id === dept.divisiId);
    const maxHC = parentDiv?.hc ?? Infinity;
    const newHC = Math.min(Math.max(0, rawVal), maxHC);
    const updDepts = workingUnit.departemenenProportions.map((d) =>
      d.id === deptId ? { ...d, hc: newHC, customQuotas: undefined } : d,
    );
    const bags = workingUnit.bagianProportions.filter((b) => b.departemenenId === deptId);
    const bagWeights = bags.map((b) => (b.hc > 0 ? b.hc : 1));
    const bagHCs = apportionLargestRemainder(newHC, bagWeights);
    const bagHcById = new Map(bags.map((b, i) => [b.id, bagHCs[i] ?? 0]));
    const updBagian = workingUnit.bagianProportions.map((b) =>
      bagHcById.has(b.id) ? { ...b, hc: bagHcById.get(b.id)!, customQuotas: undefined } : b,
    );
    updWorking({ departemenenProportions: updDepts, bagianProportions: updBagian });
  };

  const handleUpdateBagianHC = (bagianId: string, rawVal: number) => {
    const bagian = workingUnit.bagianProportions.find((b) => b.id === bagianId);
    if (!bagian) return;
    const parentDept = workingUnit.departemenenProportions.find((d) => d.id === bagian.departemenenId);
    const maxHC = parentDept?.hc ?? Infinity;
    const newHC = Math.min(Math.max(0, rawVal), maxHC);
    updWorking({
      bagianProportions: workingUnit.bagianProportions.map((b) =>
        b.id === bagianId ? { ...b, hc: newHC, customQuotas: undefined } : b,
      ),
    });
  };

  const patchCustomQuota = <T extends { id: string; customQuotas?: Record<string, number> }>(
    list: T[],
    rowId: string,
    gradeId: string,
    val: number | null,
  ): T[] =>
    list.map((item) => {
      if (item.id !== rowId) return item;
      const nextMap = { ...(item.customQuotas ?? {}) };
      if (val === null) {
        delete nextMap[gradeId];
      } else {
        nextMap[gradeId] = val;
      }
      return {
        ...item,
        customQuotas: Object.keys(nextMap).length > 0 ? nextMap : undefined,
      };
    });

  const handleAutoBalanceLevel = (level: "division" | "department" | "bagian") => {
    const gradeIds = workingUnit.calibrationGrades.map((g) => g.id);
    const gradeWeights = workingUnit.calibrationGrades.map((g) => parseGradePct(g.proporsi));
    const totalHC = workingUnit.divisionProportions.reduce((s, d) => s + d.hc, 0);
    const unitTargets = apportionLargestRemainder(totalHC, gradeWeights);

    if (level === "division") {
      const balanced = allocate2DQuotaMatrix({
        rowHCs: workingUnit.divisionProportions.map((d) => d.hc),
        colTargets: unitTargets,
        gradeWeights,
        gradeIds,
        rowCustomQuotas: workingUnit.divisionProportions.map((d) => d.customQuotas),
        autoBalanceLocked: true,
      });
      const nextDivs = workingUnit.divisionProportions.map((d, r) => ({
        ...d,
        customQuotas: Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[r]?.[g] ?? 0])),
      }));
      updWorking({ divisionProportions: nextDivs });
      toast.success("Kuota antar-Divisi berhasil diseimbangkan sesuai HC & kurva normal dengan tetap mengunci angka pilihan Management.");
      return;
    }

    const currentAlloc = computeUnitQuotaAllocation(workingUnit);
    if (level === "department") {
      const nextDepts = [...workingUnit.departemenenProportions];
      for (const div of workingUnit.divisionProportions) {
        const children = nextDepts.filter((dep) => dep.divisiId === div.id);
        if (!children.length) continue;
        const balanced = allocate2DQuotaMatrix({
          rowHCs: children.map((c) => c.hc),
          colTargets: currentAlloc.divMatrix[div.id] ?? apportionLargestRemainder(div.hc, gradeWeights),
          gradeWeights,
          gradeIds,
          rowCustomQuotas: children.map((c) => c.customQuotas),
          autoBalanceLocked: true,
        });
        children.forEach((child, r) => {
          const idx = nextDepts.findIndex((x) => x.id === child.id);
          if (idx >= 0) {
            nextDepts[idx] = {
              ...nextDepts[idx],
              customQuotas: Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[r]?.[g] ?? 0])),
            };
          }
        });
      }
      updWorking({ departemenenProportions: nextDepts });
      toast.success("Kuota antar-Departemen berhasil diseimbangkan mengikuti kuota Divisi induknya.");
      return;
    }

    const nextBags = [...workingUnit.bagianProportions];
    for (const dep of workingUnit.departemenenProportions) {
      const children = nextBags.filter((b) => b.departemenenId === dep.id);
      if (!children.length) continue;
      const balanced = allocate2DQuotaMatrix({
        rowHCs: children.map((c) => c.hc),
        colTargets: currentAlloc.deptMatrix[dep.id] ?? apportionLargestRemainder(dep.hc, gradeWeights),
        gradeWeights,
        gradeIds,
        rowCustomQuotas: children.map((c) => c.customQuotas),
        autoBalanceLocked: true,
      });
      children.forEach((child, r) => {
        const idx = nextBags.findIndex((x) => x.id === child.id);
        if (idx >= 0) {
          nextBags[idx] = {
            ...nextBags[idx],
            customQuotas: Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[r]?.[g] ?? 0])),
          };
        }
      });
    }
    updWorking({ bagianProportions: nextBags });
    toast.success("Kuota antar-Bagian berhasil diseimbangkan mengikuti kuota Departemen induknya.");
  };

  const handleResetLevelQuotas = (level: "division" | "department" | "bagian") => {
    if (level === "division") {
      updWorking({
        divisionProportions: workingUnit.divisionProportions.map((d) => ({ ...d, customQuotas: undefined })),
      });
    } else if (level === "department") {
      updWorking({
        departemenenProportions: workingUnit.departemenenProportions.map((d) => ({ ...d, customQuotas: undefined })),
      });
    } else {
      updWorking({
        bagianProportions: workingUnit.bagianProportions.map((b) => ({ ...b, customQuotas: undefined })),
      });
    }
    toast.success("Kuota manual dikembalikan ke perhitungan otomatis.");
  };

  const handleStartEdit = () => {
    setPreEditSnapshot(deepCloneUnit(unit));
    setWorkingUnit(deepCloneUnit(unit));
    setIsSaved(false);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    if (preEditSnapshot) {
      setWorkingUnit(deepCloneUnit(preEditSnapshot));
    } else {
      setWorkingUnit(deepCloneUnit(unit));
    }
    setPreEditSnapshot(null);
    setEditMode(false);
  };

  const handleSaveEdit = () => {
    const totalPct = workingUnit.calibrationGrades.reduce((s, g) => s + parseGradePct(g.proporsi), 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      toast.error(`Total proporsi Grade saat ini ${totalPct}%. Pastikan total proporsi tepat 100% sebelum menyimpan.`);
      return;
    }
    const committed = deepCloneUnit(workingUnit);
    if (onSave && !onSave(committed)) return;
    onUpdate(committed);
    setPreEditSnapshot(null);
    setEditMode(false);
    setIsSaved(true);
    if (!onSave) {
      toast.success(`Pengaturan HC Awal Tahun (SOY) ${committed.name} berhasil disimpan.`);
    }
  };

  const lockedSnap = isSoyApprovedLocked ? soyApproval!.snapshot : null;
  const displayCalibrationGrades = lockedSnap
    ? lockedSnap.calibrationGrades
    : activeUnit.beginningHC
    ? activeUnit.beginningGrades ?? activeUnit.calibrationGrades
    : activeUnit.calibrationGrades;
  const displayDivisions = lockedSnap
    ? lockedSnap.divisionProportions
    : activeUnit.divisionProportions.map((item) => ({
        ...item,
        hc: activeUnit.beginningHC?.[item.id] ?? item.hc,
        customQuotas: activeUnit.beginningHC
          ? activeUnit.beginningCustomQuotas?.[item.id]
          : item.customQuotas,
      }));
  const displayDepts = lockedSnap
    ? lockedSnap.departemenenProportions
    : activeUnit.departemenenProportions.map((item) => ({
        ...item,
        hc: activeUnit.beginningHC?.[item.id] ?? item.hc,
        customQuotas: activeUnit.beginningHC
          ? activeUnit.beginningCustomQuotas?.[item.id]
          : item.customQuotas,
      }));
  const displayBagian = lockedSnap
    ? lockedSnap.bagianProportions
    : activeUnit.bagianProportions.map((item) => ({
        ...item,
        hc: activeUnit.beginningHC?.[item.id] ?? item.hc,
        customQuotas: activeUnit.beginningHC
          ? activeUnit.beginningCustomQuotas?.[item.id]
          : item.customQuotas,
      }));

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Company Units
          </button>
        </div>
      )}

      {!embedded && (
        <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-[#1A284F]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{unit.name}</p>
            <p className="text-sm text-gray-500">
              {unit.industry}
              {unit.industry ? " · " : ""}
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{unit.code}</span>
              {parentGroupMeta && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-[#1A284F] bg-[#1A284F]/8 px-2 py-0.5 rounded-full">
                  <Layers className="w-3 h-3" /> {parentGroupMeta.name}
                </span>
              )}
            </p>
          </div>
          {readOnly && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 shrink-0">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Otomatis dari Setting {parentGroupMeta?.name ?? "Group"}
            </span>
          )}
        </div>
      )}

      {!embedded && soyApproval?.status === "Approved" ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">
            HC Awal Tahun (SOY) &amp; Distribusi Proporsi Grade sudah <strong>Approved</strong> oleh{" "}
            {soyApproval.decidedBy}
            {soyApproval.note ? <> — “{soyApproval.note}”</> : null}.
          </p>
        </div>
      ) : !embedded && soyApproval?.status === "Revision" ? (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-3">
          <RotateCcw className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800">
            <strong>Revisi diminta</strong> oleh {soyApproval.decidedBy}: {soyApproval.note || "-"}. Perbaiki setting lalu submit ulang.
          </p>
        </div>
      ) : pageMode === "submitted" ? (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {embedded ? (
              <>
                Data HC Akhir Tahun (EOY) sudah <strong>dikonfirmasi</strong>. Karyawan yang tereliminasi telah diarsipkan dan Bell Curve diperbarui.
              </>
            ) : (
              <>
                Calibration Setting (SOY) sudah disubmit dan <strong>menunggu Approval Calibration — Setting (SOY)</strong>. Editing dinonaktifkan sampai approval selesai.
              </>
            )}
          </p>
        </div>
      ) : null}

      <Tabs.Root value={hcTab} onValueChange={setHcTab} className="space-y-6">
        {!embedded && (
          <Tabs.List aria-label="Pengaturan Headcount" className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
            {[
              { value: "start", label: "HC Awal Tahun (SOY)", icon: Users, idle: "bg-[#EBF2FA]/70 text-[#2F5597] border-[#C9DCF0]", active: "bg-[#2F5597] text-white border-[#2F5597] shadow-xs" },
              { value: "end", label: "HC Akhir Tahun (EOY)", icon: CheckCircle2, idle: "bg-[#E6F3F1]/70 text-[#1D6863] border-[#B8DDD8]", active: "bg-[#248277] text-white border-[#248277] shadow-xs" },
              { value: "summary", label: "Summary", icon: TrendingUp, idle: "bg-[#FDF3E7]/70 text-[#9A5B13] border-[#F3CFA4]", active: "bg-[#C07A28] text-white border-[#C07A28] shadow-xs" },
            ].map((t) => {
              const IconComp = t.icon;
              const isAct = hcTab === t.value;
              return (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isAct ? t.active : `${t.idle} hover:opacity-90`
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {t.label}
              </Tabs.Trigger>
              );
            })}
          </Tabs.List>
        )}

        <Tabs.Content value="start" className="space-y-6">
          {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!embedded && (Boolean(unit.beginningHC) || pageMode === "submitted") && onResetSoy && (
              <button
                type="button"
                onClick={onResetSoy}
                className="flex items-center gap-2 px-4 py-2.5 border border-amber-300 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Status HC Awal Tahun (SOY)
              </button>
            )}
            {!isSoyApprovedLocked && !unit.beginningHC && pageMode === "edit" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const synced = applyImportedEmployeesDistribution(editMode ? workingUnit : unit, true);
                    if (editMode) {
                      setWorkingUnit(synced);
                    } else {
                      onUpdate(synced);
                    }
                    toast.success(
                      `Data karyawan ${unit.name} berhasil di-refresh dan didistribusikan ke Divisi, Departement, dan Bagian.`,
                    );
                  }}
                  className="flex items-center gap-2 px-3.5 py-2.5 border border-blue-200 bg-blue-50 text-[#1A284F] rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
                  title="Hitung otomatis HC & distribusi kuota Grade per Divisi, Departement, dan Bagian dari data karyawan terkini"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Data Karyawan
                </button>
                {editMode && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (editMode) handleSaveEdit();
                    else handleStartEdit();
                  }}
                  className="flex items-center gap-2 bg-[#1A284F] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm"
                >
                  {editMode ? (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Edit2 className="w-4 h-4" />
                      Edit Settings
                    </>
                  )}
                </button>
                {!editMode && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPageMode("preview")}
                      className="flex items-center gap-2 px-4 py-2.5 border border-[#1A284F] text-[#1A284F] rounded-xl text-sm font-medium hover:bg-[#1A284F]/5 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={!canSubmit}
                      onClick={canSubmit ? onShowConfirm : undefined}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
                        canSubmit
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      {submitLabel === "Confirm Data" ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {submitLabel}
                    </button>
                  </>
                )}
              </>
            )}
            {!isSoyApprovedLocked && !unit.beginningHC && pageMode === "preview" && (
              <>
                <button
                  type="button"
                  onClick={() => setPageMode("edit")}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={onShowConfirm}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                  {submitLabel === "Confirm Data" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {submitLabel}
                </button>
              </>
            )}
          </div>
          )}

          {!embedded && (
            <p className="text-sm font-medium text-gray-500">
              {readOnly
                ? `HC Awal Tahun (SOY) — data terisi otomatis dari pengaturan ${parentGroupMeta?.name ?? "Group"} (tanpa aksi per unit).`
                : isSoyApprovedLocked || unit.beginningHC
                ? "HC Awal Tahun (SOY) — baseline tersimpan dan read-only; perubahan HC akhir tidak menimpa data ini."
                : "Setting HC Awal Tahun (SOY) — klik Edit Settings untuk menyesuaikan proporsi grade maupun kuota per Divisi, Departemen, dan Bagian."}
            </p>
          )}

          <CalibrationPanel
            calibrationGrades={displayCalibrationGrades}
            divisionProportions={displayDivisions}
            departemenenProportions={displayDepts}
            bagianProportions={displayBagian}
            unitQuotaTargets={
              lockedSnap?.unitQuotaTargets ??
              (activeUnit.beginningHC ? activeUnit.beginningUnitQuotaTargets : undefined) ??
              activeUnit.unitQuotaTargets
            }
            editMode={isEditable}
            hideBagian={hideBagian}
            onUpdateCalibrationGrade={(id, field, value) =>
              updWorking({
                calibrationGrades: workingUnit.calibrationGrades.map((g) =>
                  g.id === id ? { ...g, [field]: value } : g,
                ),
              })
            }
            onUpdateDivisionHC={handleUpdateDivisionHC}
            onUpdateDepartemenHC={handleUpdateDepartemenHC}
            onUpdateBagianHC={handleUpdateBagianHC}
            onUpdateDivisionQuota={(rowId, gradeId, val) =>
              updWorking({
                divisionProportions: patchCustomQuota(
                  workingUnit.divisionProportions,
                  rowId,
                  gradeId,
                  val,
                ),
              })
            }
            onUpdateDepartemenQuota={(rowId, gradeId, val) =>
              updWorking({
                departemenenProportions: patchCustomQuota(
                  workingUnit.departemenenProportions,
                  rowId,
                  gradeId,
                  val,
                ),
              })
            }
            onUpdateBagianQuota={(rowId, gradeId, val) =>
              updWorking({
                bagianProportions: patchCustomQuota(
                  workingUnit.bagianProportions,
                  rowId,
                  gradeId,
                  val,
                ),
              })
            }
            onAutoBalanceLevel={handleAutoBalanceLevel}
            onResetLevelQuotas={handleResetLevelQuotas}
          />
        </Tabs.Content>

        {!embedded && (
          <Tabs.Content value="end">
            <YearEndCalibrationSettings unit={unit} onUpdate={onUpdate} readOnly={readOnly} hideBagian={hideBagian} />
          </Tabs.Content>
        )}
        {!embedded && (
          <Tabs.Content value="summary">
            <HeadcountSummary unit={unit} hideBagian={hideBagian} />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </div>
  );
}

// ─── Confirm Data (HC Akhir Tahun / EOY) Modal ────────────────────────────────

function ConfirmYearEndModal({
  unitName,
  onConfirm,
  onCancel,
}: {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Confirm Data HC Akhir Tahun (EOY)</h3>
              <p className="text-xs text-gray-500 mt-0.5">{unitName}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ul className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <li className="flex gap-2">
            <Archive className="mt-0.5 h-4 w-4 shrink-0" />
            Karyawan HC Awal Tahun (SOY) yang tidak ada lagi akan diarsipkan dengan keterangan “{EOY_ARCHIVE_REASON}”.
          </li>
          <li className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0" />
            HC Aktual pada tabel proporsi diperbarui sesuai data karyawan terkini.
          </li>
          <li className="flex gap-2">
            <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
            Jumlah aktual grade pada Bell Curve di Calibration Adjustment ikut diperbarui.
          </li>
        </ul>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Data
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Confirmation Modal ────────────────────────────────────────────────

function SubmitConfirmModal({
  targetName,
  onConfirm,
  onCancel,
}: {
  targetName?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">
                Submit Calibration Setting (SOY){targetName ? ` — ${targetName}` : ""}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                HC Awal Tahun (SOY) &amp; Distribusi Proporsi Grade dikirim ke /approvals/calibration/setting untuk disetujui Director
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs leading-relaxed text-amber-900">
          Setelah disubmit, pengaturan <strong>{targetName ?? "Group"}</strong> akan dikunci sementara menunggu persetujuan role <strong>Director</strong> pada halaman <strong>/approvals/calibration/setting</strong>, dan seluruh kuota Company Units di dalam Group akan tersinkronisasi otomatis.
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function unitToSlug(u: CompanyUnit): string {
  return u.code.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function synchronizeAllUnitsWithGroups(
  groups: CalibrationGroupSetting[],
  units: CompanyUnit[],
): CompanyUnit[] {
  const nextUnits = units.map((u) => ({ ...u }));
  for (const grp of groups) {
    const members = nextUnits.filter((u) =>
      grp.unitNames.includes(canonicalizeCompanyUnitName(u.name)),
    );
    if (members.length === 0) continue;
    const gAlloc = computeGroupQuotaAllocation({
      calibrationGrades: grp.calibrationGrades,
      units: members,
      unitCustomQuotas: grp.unitCustomQuotas,
    });
    for (const m of members) {
      const idx = nextUnits.findIndex((x) => x.id === m.id);
      if (idx < 0) continue;
      nextUnits[idx] = {
        ...nextUnits[idx],
        calibrationGrades: grp.calibrationGrades.map((g) => ({ ...g })),
        unitQuotaTargets: gAlloc.unitMatrix[m.id] ?? nextUnits[idx].unitQuotaTargets,
      };
    }
  }
  return nextUnits;
}

export function CalibrationSetting() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ mainTab?: string; entitySlug?: string }>();
  const { lockedUnits: authLockedUnits } = useAuthStore();

  // Base URL dinamis sesuai portal (/hr/calibration/setting, /bod/calibration/setting, atau /calibration/setting)
  const portalMatch = location.pathname.match(/^\/(hr|bod|supervisor|employee)(?:\/|$)/);
  const portalPrefix = portalMatch ? `/${portalMatch[1]}` : "";
  const baseSettingPath = `${portalPrefix}/calibration/setting`;

  const activeMainTab: "group" | "company-units" =
    params.mainTab === "company-units" ? "company-units" : "group";

  const [groupSettings, setGroupSettings] = useState<CalibrationGroupSetting[]>(() => {
    try {
      const saved = loadPersistedState<CalibrationGroupSetting[] | null>(GROUP_CALIBRATION_SETTINGS_KEY, null);
      if (Array.isArray(saved) && saved.length > 0) {
        return CALIBRATION_GROUPS.map((def) => {
          const found = saved.find((s) => s.id === def.id || s.slug === def.slug || s.name === def.name);
          return found
            ? {
                ...found,
                id: def.id,
                slug: def.slug,
                name: def.name,
                code: def.code,
                industry: def.industry,
                unitNames: [...def.unitNames],
              }
            : {
                id: def.id,
                slug: def.slug,
                name: def.name,
                code: def.code,
                industry: def.industry,
                unitNames: [...def.unitNames],
                calibrationGrades: makeDefaultCalibrationGrades(),
                unitCustomQuotas: {},
              };
        });
      }
    } catch {
      // ignore
    }
    return makeDefaultGroupSettings();
  });

  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(() => {
    try {
      const saved =
        safeGetLocalRaw("calibration_hc_settings_2026") ??
        safeGetLocalRaw("calibration_submitted_units");
      const base: CompanyUnit[] = saved ? JSON.parse(saved) : defaultCompanyUnits;
      // Pastikan ke-8 Company Units lengkap
      const mergedBase = defaultCompanyUnits.map((def) => {
        const existing = base.find(
          (u) => u.id === def.id || canonicalizeCompanyUnitName(u.name) === canonicalizeCompanyUnitName(def.name),
        );
        return existing ? { ...def, ...existing, id: def.id, name: def.name, code: def.code } : def;
      });
      return mergedBase.map((u) => applyImportedEmployeesDistribution(u));
    } catch {
      return defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u));
    }
  });

  useEffect(() => {
    const syncDynamicMasterUnits = () => {
      const dynLocations = getMasterCompanyLocations();
      setGroupSettings((prev) =>
        CALIBRATION_GROUPS.map((def) => {
          const found = prev.find((p) => p.id === def.id || p.slug === def.slug || p.name === def.name);
          return found
            ? { ...found, id: def.id, slug: def.slug, name: def.name, code: def.code, industry: def.industry, unitNames: [...def.unitNames] }
            : {
                id: def.id,
                slug: def.slug,
                name: def.name,
                code: def.code,
                industry: def.industry,
                unitNames: [...def.unitNames],
                calibrationGrades: makeDefaultCalibrationGrades(),
                unitCustomQuotas: {},
              };
        }),
      );
      if (dynLocations.length > 0) {
        setCompanyUnits((prev) => {
          const next = [...prev];
          let added = false;
          for (const loc of dynLocations) {
            const exists = next.some(
              (u) => canonicalizeCompanyUnitName(u.name) === canonicalizeCompanyUnitName(loc.company),
            );
            if (!exists) {
              next.push(
                applyImportedEmployeesDistribution(
                  makeUnit(loc.unitId || `u-${next.length + 1}`, loc.company, loc.code, ""),
                ),
              );
              added = true;
            }
          }
          return added ? next : prev;
        });
      }
    };
    syncDynamicMasterUnits();
    window.addEventListener(MASTER_COMPANY_UPDATED_EVENT, syncDynamicMasterUnits);
    return () => window.removeEventListener(MASTER_COMPANY_UPDATED_EVENT, syncDynamicMasterUnits);
  }, []);

  useEffect(() => {
    const onHydrated = () => {
      const savedGroups = loadPersistedState<CalibrationGroupSetting[] | null>(GROUP_CALIBRATION_SETTINGS_KEY, null);
      if (Array.isArray(savedGroups) && savedGroups.length > 0) {
        setGroupSettings((prev) =>
          CALIBRATION_GROUPS.map((def) => {
            const found = savedGroups.find((s) => s.id === def.id || s.name === def.name) ?? prev.find((p) => p.id === def.id);
            return found
              ? { ...found, id: def.id, slug: def.slug, name: def.name, code: def.code, industry: def.industry, unitNames: [...def.unitNames] }
              : makeDefaultGroupSettings().find((x) => x.id === def.id)!;
          }),
        );
      }
      const saved =
        loadPersistedState<CompanyUnit[] | null>("calibration_hc_settings_2026", null) ??
        loadPersistedState<CompanyUnit[] | null>("calibration_submitted_units", null);
      if (Array.isArray(saved) && saved.length > 0) {
        const merged = defaultCompanyUnits.map((def) => {
          const ex = saved.find((u) => u.id === def.id || canonicalizeCompanyUnitName(u.name) === canonicalizeCompanyUnitName(def.name));
          return applyImportedEmployeesDistribution(ex ? { ...def, ...ex, id: def.id, name: def.name, code: def.code } : def);
        });
        setCompanyUnits(merged);
      }
    };
    const onEmployeesImported = () => {
      setCompanyUnits((prev) => {
        const next = prev.map((u) => applyImportedEmployeesDistribution(u));
        savePersistedState("calibration_hc_settings_2026", next);
        return next;
      });
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener("pa-employees-imported", onEmployeesImported);
    window.addEventListener("pa-auth-updated", onEmployeesImported);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener("pa-employees-imported", onEmployeesImported);
      window.removeEventListener("pa-auth-updated", onEmployeesImported);
    };
  }, []);

  const [soyTick, setSoyTick] = useState(0);
  useEffect(() => {
    void refreshGroupSoyApprovalsFromBackend().then(() => setSoyTick((t) => t + 1));
    const refresh = () => setSoyTick((t) => t + 1);
    window.addEventListener(SOY_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener(SOY_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);
  void soyTick;

  // Pastikan Company Units selalu terisi otomatis dari pengaturan Group (otomatis insert sesuai Poin 8)
  const syncedCompanyUnits = useMemo(
    () => synchronizeAllUnitsWithGroups(groupSettings, companyUnits),
    [groupSettings, companyUnits],
  );

  const commitGroupAndUnits = (
    nextGroup: CalibrationGroupSetting,
    nextMemberUnits: CompanyUnit[],
    toastMessage?: string,
  ) => {
    const nextGroups = groupSettings.map((g) => (g.id === nextGroup.id ? nextGroup : g));
    const memberById = new Map(nextMemberUnits.map((u) => [u.id, u]));
    const mergedUnitsRaw = syncedCompanyUnits.map((u) => memberById.get(u.id) ?? u);
    const finalUnits = synchronizeAllUnitsWithGroups(nextGroups, mergedUnitsRaw);

    setGroupSettings(nextGroups);
    setCompanyUnits(finalUnits);

    savePersistedState(GROUP_CALIBRATION_SETTINGS_KEY, nextGroups, {
      kind: "calibration-setting",
      unitId: nextGroup.id,
      unitName: nextGroup.name,
      data: { group: nextGroup, units: finalUnits.filter((u) => nextGroup.unitNames.includes(canonicalizeCompanyUnitName(u.name))) },
      audit: {
        action: "Update",
        module: "Performance Appraisal",
        subModule: "Calibration Setting (Group)",
        description: `Updated Calibration Group Setting (${nextGroup.name}) & auto-synced member Company Units`,
      },
    });
    savePersistedState("calibration_hc_settings_2026", finalUnits);
    if (safeGetLocalRaw("calibration_submitted_units")) {
      savePersistedState("calibration_submitted_units", finalUnits);
    }
    // Sinkronkan juga masing-masing Company Unit anggota Group ke tabel pa_calibration_settings di Supabase
    for (const u of finalUnits) {
      if (!nextGroup.unitNames.includes(canonicalizeCompanyUnitName(u.name))) continue;
      void syncToSupabase({
        kind: "calibration-setting",
        unitId: u.id,
        unitName: u.name,
        data: u,
      });
    }
    if (toastMessage) toast.success(toastMessage);
  };

  const handleGroupSoySubmit = (
    committedGroup: CalibrationGroupSetting,
    committedMemberUnits: CompanyUnit[],
  ) => {
    const gAlloc = computeGroupQuotaAllocation({
      calibrationGrades: committedGroup.calibrationGrades,
      units: committedMemberUnits,
      unitCustomQuotas: committedGroup.unitCustomQuotas,
    });
    const unitsSnap: SoyUnitSnapshot[] = committedMemberUnits.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code,
      calibrationGrades: committedGroup.calibrationGrades.map((g) => ({ ...g })),
      unitQuotaTargets: gAlloc.unitMatrix[u.id] ?? [],
      divisionProportions: JSON.parse(JSON.stringify(u.divisionProportions)),
      departemenenProportions: JSON.parse(JSON.stringify(u.departemenenProportions)),
      bagianProportions: JSON.parse(JSON.stringify(u.bagianProportions)),
    }));

    // Kunci segera baseline HC Awal Tahun (SOY) pada saat Submit agar angka HC SOY tidak pernah berubah meskipun ada karyawan diarsip kemudian
    const lockedGroupOnSubmit: CalibrationGroupSetting = {
      ...committedGroup,
      beginningGrades: committedGroup.calibrationGrades.map((g) => ({ ...g })),
      beginningUnitCustomQuotas: committedGroup.unitCustomQuotas
        ? JSON.parse(JSON.stringify(committedGroup.unitCustomQuotas))
        : {},
    };
    const lockedUnitsOnSubmit: CompanyUnit[] = committedMemberUnits.map((u) => {
      const bHc: Record<string, number> = {};
      const bCq: Record<string, Record<string, number>> = {};
      for (const r of [...u.divisionProportions, ...u.departemenenProportions, ...u.bagianProportions]) {
        bHc[r.id] = r.hc;
        if (r.customQuotas) bCq[r.id] = { ...r.customQuotas };
      }
      return {
        ...u,
        beginningGrades: committedGroup.calibrationGrades.map((g) => ({ ...g })),
        beginningUnitQuotaTargets: gAlloc.unitMatrix[u.id] ?? [],
        beginningHC: bHc,
        beginningCustomQuotas: bCq,
      };
    });

    commitGroupAndUnits(lockedGroupOnSubmit, lockedUnitsOnSubmit);
    submitGroupSoyForApproval({
      id: committedGroup.id,
      slug: committedGroup.slug,
      name: committedGroup.name,
      code: committedGroup.code,
      calibrationGrades: committedGroup.calibrationGrades.map((g) => ({ ...g })),
      unitCustomQuotas: committedGroup.unitCustomQuotas ? JSON.parse(JSON.stringify(committedGroup.unitCustomQuotas)) : {},
      unitAllocatedQuotas: gAlloc.unitMatrix,
      units: unitsSnap,
    });

    const submittedAt = new Date().toISOString();
    savePersistedState("calibration_submitted_units", syncedCompanyUnits);
    savePersistedState("calibration_submitted_at", submittedAt);

    toast.success(
      `Calibration Setting (SOY) ${committedGroup.name} berhasil disubmit ke /approvals/calibration/setting untuk disetujui Director.`,
    );
  };

  const visibleGroups = useMemo(() => {
    if (authLockedUnits && authLockedUnits.length > 0) {
      const canonLocks = authLockedUnits.map(canonicalizeCompanyUnitName);
      return groupSettings.filter((g) => g.unitNames.some((u) => canonLocks.includes(canonicalizeCompanyUnitName(u))));
    }
    return groupSettings;
  }, [groupSettings, authLockedUnits]);

  const visibleCompanyUnits = useMemo(() => {
    if (authLockedUnits && authLockedUnits.length > 0) {
      const canonLocks = authLockedUnits.map(canonicalizeCompanyUnitName);
      return syncedCompanyUnits.filter((u) => canonLocks.includes(canonicalizeCompanyUnitName(u.name)));
    }
    return syncedCompanyUnits;
  }, [syncedCompanyUnits, authLockedUnits]);

  // Resolve selected Group atau selected Company Unit dari URL `:entitySlug`
  const selectedGroup = useMemo(() => {
    if (activeMainTab !== "group" || !params.entitySlug) return null;
    const slugLower = params.entitySlug.toLowerCase();
    return (
      visibleGroups.find(
        (g) => g.slug === slugLower || g.id.toLowerCase() === slugLower || g.code.toLowerCase() === slugLower,
      ) ?? null
    );
  }, [activeMainTab, params.entitySlug, visibleGroups]);

  const selectedCompanyUnit = useMemo(() => {
    if (activeMainTab !== "company-units" || !params.entitySlug) return null;
    const slugLower = params.entitySlug.toLowerCase();
    return (
      visibleCompanyUnits.find(
        (u) =>
          unitToSlug(u) === slugLower ||
          u.id.toLowerCase() === slugLower ||
          orgSlug(u.name).replace(/_/g, "-") === slugLower,
      ) ?? null
    );
  }, [activeMainTab, params.entitySlug, visibleCompanyUnits]);

  // Detail View: Group (/calibration/setting/group/:entitySlug)
  if (selectedGroup) {
    const memberUnits = syncedCompanyUnits.filter((u) =>
      selectedGroup.unitNames.includes(canonicalizeCompanyUnitName(u.name)),
    );
    const grpSoyApproval = getGroupSoyApproval(selectedGroup.id);
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
          <p className="text-sm text-gray-500">
            Pengaturan HC Awal Tahun (SOY), HC Akhir Tahun (EOY), dan Distribusi Grade berbasis Group
          </p>
        </div>
        <GroupDetail
          group={selectedGroup}
          memberUnits={memberUnits}
          soyApproval={grpSoyApproval}
          onBack={() => navigate(`${baseSettingPath}/group`)}
          onCommitGroupAndUnits={commitGroupAndUnits}
          onSubmitGroupSoy={handleGroupSoySubmit}
          onResetGroupSoy={() => {
            resetSoyApproval(selectedGroup.id);
            const resetGrp: CalibrationGroupSetting = {
              ...selectedGroup,
              beginningGrades: undefined,
              beginningUnitCustomQuotas: undefined,
              yearEndStatus: undefined,
              yearEndUpdatedAt: undefined,
            };
            const resetMembers = memberUnits.map((u) => ({
              ...u,
              beginningHC: undefined,
              beginningGrades: undefined,
              beginningUnitQuotaTargets: undefined,
              beginningCustomQuotas: undefined,
              yearEndStatus: undefined,
              yearEndUpdatedAt: undefined,
            }));
            commitGroupAndUnits(
              resetGrp,
              resetMembers,
              `Status HC Awal Tahun (SOY) ${selectedGroup.name} berhasil di-reset dan siap di-submit ulang.`,
            );
          }}
        />
      </div>
    );
  }

  // Detail View: Company Unit Read-Only (/calibration/setting/company-units/:entitySlug)
  if (selectedCompanyUnit) {
    const soyApproval = getSoyApproval(selectedCompanyUnit.id);
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
          <p className="text-sm text-gray-500">
            Rincian kuota &amp; distribusi grade unit usaha (otomatis menyesuaikan dari pengaturan Group)
          </p>
        </div>
        <UnitDetail
          unit={selectedCompanyUnit}
          onBack={() => navigate(`${baseSettingPath}/company-units`)}
          onUpdate={() => {}}
          pageMode="edit"
          setPageMode={() => {}}
          onShowConfirm={() => {}}
          readOnly
          hideBagian
          soyApproval={soyApproval}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
        <p className="text-sm text-gray-500">
          Pengaturan distribusi &amp; proporsi grade berdasarkan Group (otomatis terdistribusi ke masing-masing Company Unit)
        </p>
      </div>

      {/* Top Main Tabs: Group | Company Units (dengan warna soft pada tab & icon) */}
      <div className="flex items-center gap-2.5 border-b border-gray-200 pb-2.5 flex-wrap">
        <button
          type="button"
          onClick={() => navigate(`${baseSettingPath}/group`)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
            activeMainTab === "group"
              ? "bg-[#EBF2FA] border-[#2F5597]/40 text-[#1A284F] shadow-2xs"
              : "bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-[#EBF2FA]/60 hover:text-[#1A284F]"
          }`}
        >
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${activeMainTab === "group" ? "bg-[#2F5597] text-white" : "bg-[#EBF2FA] text-[#2F5597]"}`}>
            <Layers className="w-3.5 h-3.5" />
          </span>
          Group
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-[#C9DCF0] text-[#2F5597]">
            {visibleGroups.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`${baseSettingPath}/company-units`)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
            activeMainTab === "company-units"
              ? "bg-[#E6F3F1] border-[#248277]/40 text-[#1D6863] shadow-2xs"
              : "bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-[#E6F3F1]/60 hover:text-[#1D6863]"
          }`}
        >
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${activeMainTab === "company-units" ? "bg-[#248277] text-white" : "bg-[#E6F3F1] text-[#248277]"}`}>
            <Building2 className="w-3.5 h-3.5" />
          </span>
          Company Units
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/90 border border-[#B8DDD8] text-[#1D6863]">
            {visibleCompanyUnits.length}
          </span>
        </button>
      </div>

      {/* TAB 1: GROUP (Card RSUP Group & Sambu Group — desain sama persis dengan Company Unit) */}
      {activeMainTab === "group" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Pilih Group untuk mengatur HC Awal Tahun (SOY), HC Akhir Tahun (EOY), serta distribusi kuota per Unit Usaha, Division, dan Departement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleGroups.map((grp, idx) => {
              const groupTones: AnalyticsCardTone[] = ["navy", "teal"];
              const spec = ANALYTICS_CARD_TONES[groupTones[idx % groupTones.length]];
              const soyRec = getGroupSoyApproval(grp.id);
              const members = syncedCompanyUnits.filter((u) =>
                grp.unitNames.includes(canonicalizeCompanyUnitName(u.name)),
              );
              const groupHc =
                (soyRec?.status === "Approved" || soyRec?.status === "Pending") && soyRec.groupSnapshot?.units
                  ? soyRec.groupSnapshot.units.reduce(
                      (sum, u) => sum + u.divisionProportions.reduce((s, d) => s + d.hc, 0),
                      0,
                    )
                  : members.reduce(
                      (sum, u) => sum + u.divisionProportions.reduce((s, d) => s + d.hc, 0),
                      0,
                    );
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => navigate(`${baseSettingPath}/group/${grp.slug}`)}
                  style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                  className={`group relative overflow-hidden text-left bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-4 min-h-[132px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion cursor-pointer`}
                >
                  <div
                    className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                    style={{ backgroundColor: `${spec.accentHex}0D` }}
                  />
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-500 truncate">
                        {grp.code} · {members.length} Unit Usaha
                      </p>
                      <p className="text-base font-extrabold text-[#111827] leading-snug mt-1">{grp.name}</p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: spec.accentHex }}
                    >
                      <Layers className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-4 relative z-10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A284F] tabular-nums">
                        <Users className="w-3 h-3" /> HC: {groupHc}
                      </span>
                      {soyRec?.status === "Approved" && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-full">
                          SOY Locked
                        </span>
                      )}
                      {soyRec?.status === "Pending" && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-white/80 border border-amber-200 px-2 py-0.5 rounded-full">
                          SOY Pending
                        </span>
                      )}
                      {soyRec?.status === "Revision" && (
                        <span className="text-[10px] font-semibold text-orange-700 bg-white/80 border border-orange-200 px-2 py-0.5 rounded-full">
                          SOY Revision
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1A284F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: COMPANY UNITS (Read-Only otomatis menyesuaikan dari setting tab Group) */}
      {activeMainTab === "company-units" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-xs text-slate-600">
            <Lock className="w-4 h-4 text-[#1A284F] shrink-0" />
            <span>
              Data pada tab <strong>Company Units</strong> terisi dan menyesuaikan secara otomatis dari pengaturan tab <strong>Group</strong> (tidak memerlukan tindakan Edit atau Submit terpisah per unit usaha).
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleCompanyUnits.map((unit, idx) => {
              const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];
              const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
              const soyRec = getSoyApproval(unit.id);
              const grpMeta = getCalibrationGroupByUnitName(unit.name);
              const unitHc =
                (soyRec?.status === "Approved" || soyRec?.status === "Pending") && soyRec.snapshot
                  ? soyRec.snapshot.divisionProportions.reduce((s, d) => s + d.hc, 0)
                  : unit.beginningHC
                  ? unit.divisionProportions.reduce((s, d) => s + (unit.beginningHC?.[d.id] ?? d.hc), 0)
                  : unit.divisionProportions.reduce((s, d) => s + d.hc, 0);
              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => navigate(`${baseSettingPath}/company-units/${unitToSlug(unit)}`)}
                  style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                  className={`group relative overflow-hidden text-left bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-4 min-h-[132px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion cursor-pointer`}
                >
                  <div
                    className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                    style={{ backgroundColor: `${spec.accentHex}0D` }}
                  />
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-500 truncate">
                        {unit.code}{grpMeta ? ` · ${grpMeta.name}` : unit.industry ? ` · ${unit.industry}` : ""}
                      </p>
                      <p className="text-base font-extrabold text-[#111827] leading-snug mt-1">{unit.name}</p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: spec.accentHex }}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-4 relative z-10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A284F] tabular-nums">
                        <Users className="w-3 h-3" /> HC: {unitHc}
                      </span>
                      {soyRec?.status === "Approved" && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-full">
                          SOY Locked
                        </span>
                      )}
                      {soyRec?.status === "Pending" && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-white/80 border border-amber-200 px-2 py-0.5 rounded-full">
                          SOY Pending
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1A284F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Group-Based Calibration Panel, EOY, Summary & Detail ─────────────────────

function patchQuotaRecord<T extends { id: string; customQuotas?: Record<string, number> }>(
  list: T[],
  rowId: string,
  gradeId: string,
  val: number | null,
): T[] {
  return list.map((item) => {
    if (item.id !== rowId) return item;
    const nextMap = { ...(item.customQuotas ?? {}) };
    if (val === null) delete nextMap[gradeId];
    else nextMap[gradeId] = val;
    return { ...item, customQuotas: Object.keys(nextMap).length > 0 ? nextMap : undefined };
  });
}

function GroupCalibrationPanel({
  groupName,
  calibrationGrades,
  memberUnits,
  unitCustomQuotas,
  editMode,
  isConfirmedLocked = false,
  selectedUnitId,
  onSelectUnitId,
  onUpdateCalibrationGrade,
  onUpdateCompanyUnitQuota,
  onAutoBalanceCompanyUnits,
  onResetCompanyUnitQuotas,
  onUpdateUnitDivisionHC,
  onUpdateUnitDepartemenHC,
  onUpdateUnitDivisionQuota,
  onUpdateUnitDepartemenQuota,
  onAutoBalanceUnitLevel,
  onResetUnitLevelQuotas,
}: {
  groupName: string;
  calibrationGrades: CalibrationGrade[];
  memberUnits: CompanyUnit[];
  unitCustomQuotas?: Record<string, Record<string, number>>;
  editMode: boolean;
  isConfirmedLocked?: boolean;
  selectedUnitId: string | null;
  onSelectUnitId: (unitId: string | null) => void;
  onUpdateCalibrationGrade: (id: string, field: keyof CalibrationGrade, value: string) => void;
  onUpdateCompanyUnitQuota: (unitId: string, gradeId: string, val: number | null) => void;
  onAutoBalanceCompanyUnits: () => void;
  onResetCompanyUnitQuotas: () => void;
  onUpdateUnitDivisionHC: (unitId: string, divId: string, newHC: number) => void;
  onUpdateUnitDepartemenHC: (unitId: string, deptId: string, newHC: number) => void;
  onUpdateUnitDivisionQuota: (unitId: string, divId: string, gradeId: string, val: number | null) => void;
  onUpdateUnitDepartemenQuota: (unitId: string, deptId: string, gradeId: string, val: number | null) => void;
  onAutoBalanceUnitLevel: (unitId: string, level: "division" | "department") => void;
  onResetUnitLevelQuotas: (unitId: string, level: "division" | "department") => void;
}) {
  const groupAlloc = useMemo(
    () =>
      computeGroupQuotaAllocation({
        calibrationGrades,
        units: memberUnits,
        unitCustomQuotas,
      }),
    [calibrationGrades, memberUnits, unitCustomQuotas],
  );

  const fmtShare = (v: number) => (v > 0 ? `${v.toFixed(1)}%` : "0.0%");
  const unitGradeSums = calibrationGrades.map((_, gi) =>
    memberUnits.reduce((s, u) => s + (groupAlloc.unitMatrix[u.id]?.[gi] ?? 0), 0),
  );
  const groupGradeCounts = groupAlloc.groupGradeTargets;
  const totalGroupKaryawan = groupGradeCounts.reduce((a, b) => a + b, 0);
  // Kurva Bell Curve real-time: mencerminkan perubahan pada Grade, Company Unit, maupun Division/Departement di setiap unit secara langsung
  const liveEffectiveUnitGradeSums = calibrationGrades.map((_, gi) =>
    memberUnits.reduce((sum, u) => {
      const uAlloc = groupAlloc.perUnitAlloc[u.id];
      const hasSubCustom =
        u.divisionProportions.some((d) => d.customQuotas && Object.keys(d.customQuotas).length > 0) ||
        u.departemenenProportions.some((d) => d.customQuotas && Object.keys(d.customQuotas).length > 0);
      if (hasSubCustom && uAlloc) {
        const hasDeptCustom = u.departemenenProportions.some((d) => d.customQuotas && Object.keys(d.customQuotas).length > 0);
        if (hasDeptCustom) {
          return sum + u.departemenenProportions.reduce((ds, dep) => ds + (uAlloc.deptMatrix[dep.id]?.[gi] ?? 0), 0);
        }
        return sum + u.divisionProportions.reduce((ds, div) => ds + (uAlloc.divMatrix[div.id]?.[gi] ?? 0), 0);
      }
      return sum + (groupAlloc.unitMatrix[u.id]?.[gi] ?? 0);
    }, 0),
  );

  const activeDrillUnit = selectedUnitId
    ? memberUnits.find((u) => u.id === selectedUnitId) ?? null
    : null;
  const activeUnitAlloc = activeDrillUnit ? groupAlloc.perUnitAlloc[activeDrillUnit.id] : null;

  return (
    <div className="space-y-6">
      {/* Row 1: Grade Distribution & Calibration (Group) + Grade Distribution (Bell Curve) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">
              Grade Distribution &amp; Calibration ({groupName})
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Gabungan jumlah karyawan dari seluruh {memberUnits.length} unit usaha pada {groupName} (Largest-Remainder)
            </p>
          </div>
          <div className="p-6 overflow-x-auto flex-1 flex flex-col justify-between gap-3">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#1A284F] text-white">
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">GRADE</th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">PROPORSI</th>
                  <th className="border border-gray-300 px-4 py-3 text-center font-semibold">KARYAWAN</th>
                </tr>
              </thead>
              <tbody>
                {calibrationGrades.map((grade, idx) => {
                  const karyawan = groupGradeCounts[idx] ?? 0;
                  const uSum = unitGradeSums[idx] ?? 0;
                  const diffFromUnits = uSum - karyawan;
                  const gHex = resolveGradeColorHex(grade.grade) ?? GRADE_COLORS[grade.grade] ?? "#1A284F";
                  return (
                    <tr key={grade.id} className={EXTRA_SOFT_ROW_PALETTE[idx % EXTRA_SOFT_ROW_PALETTE.length]}>
                      <td className="border border-gray-300 px-4 py-2.5 text-center font-semibold text-gray-900">
                        <span
                          className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-md text-xs font-bold text-white"
                          style={{ backgroundColor: gHex }}
                        >
                          {grade.grade}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-4 py-2.5 text-center">
                        {editMode ? (
                          <input
                            type="text"
                            value={grade.proporsi}
                            onChange={(e) => onUpdateCalibrationGrade(grade.id, "proporsi", e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center"
                          />
                        ) : (
                          <span className="text-gray-900">{grade.proporsi}</span>
                        )}
                      </td>
                      <td className="border border-gray-300 px-4 py-2.5 text-center bg-gray-50">
                        <span className="font-semibold text-gray-900">{karyawan.toLocaleString()}</span>
                        {diffFromUnits !== 0 && (
                          <span
                            title="Selisih total kuota manual Unit Usaha terhadap target kurva normal Group"
                            className="ml-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                          >
                            Unit: {uSum} ({diffFromUnits > 0 ? `+${diffFromUnits}` : diffFromUnits})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-[#1A284F] text-white font-semibold">
                  <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
                  <td
                    className={`border border-gray-300 px-4 py-3 text-center ${
                      Math.abs(groupAlloc.totalPct - 100) > 0.001 && groupAlloc.totalPct > 0 ? "text-red-300" : ""
                    }`}
                  >
                    {groupAlloc.totalPct}%
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-center">
                    {totalGroupKaryawan.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Kuota karyawan dihitung terpusat pada level <strong>{groupName}</strong> ({groupAlloc.totalHC.toLocaleString()} orang) dan didistribusikan otomatis ke setiap Unit Usaha, Divisi, dan Departement.
            </p>
          </div>
        </div>

        <SingleBellCurveCard
          title={`Grade Distribution (Bell Curve) — ${groupName}`}
          subtitle={`Visualisasi kurva normal proporsi & kuota karyawan gabungan ${groupName}`}
          calibrationGrades={calibrationGrades}
          gradeCounts={liveEffectiveUnitGradeSums}
        />
      </div>

      {/* Row 2: Proportion per Company Unit (clickable rows -> opens Division & Departement) */}
      <ProportionTable
        title="Proportion per Company Unit"
        subtitle="Share kuota & distribusi grade per Unit Usaha berdasarkan distribusi normal Group (klik baris Unit Usaha untuk membuka & menyesuaikan proporsi Divisi & Departement)"
        firstColHeader="UNIT USAHA"
        disableHcEdit
        isConfirmedLocked={isConfirmedLocked}
        selectedRowId={selectedUnitId}
        onRowClick={(uid) => onSelectUnitId(selectedUnitId === uid ? null : uid)}
        rows={memberUnits.map((u) => ({
          id: u.id,
          label: u.name,
          hc: groupAlloc.unitHCs[u.id] ?? 0,
          shareKuota: fmtShare(groupAlloc.unitShareMap[u.id] ?? 0),
          calcs: groupAlloc.unitMatrix[u.id] ?? new Array(calibrationGrades.length).fill(0),
          customQuotas: unitCustomQuotas?.[u.id],
        }))}
        totalHC={groupAlloc.totalHC}
        targetGradeTotals={groupGradeCounts}
        calibrationGrades={calibrationGrades}
        editMode={editMode}
        onUpdateHC={() => {}}
        onUpdateQuota={onUpdateCompanyUnitQuota}
        onAutoBalance={onAutoBalanceCompanyUnits}
        onResetQuotas={onResetCompanyUnitQuotas}
        primaryFooterLabel={`Jumlah Unit Usaha: ${memberUnits.length}`}
      />

      {/* Row 3: Drilldown Proportion per Division & Proportion per Departement saat Unit Usaha diklik */}
      {activeDrillUnit && activeUnitAlloc && (() => {
        const safeDivs = activeDrillUnit.divisionProportions ?? [];
        const safeDepts = activeDrillUnit.departemenenProportions ?? [];
        const totalDivHC = activeUnitAlloc.totalHC;
        const divShareMap: Record<string, number> = {};
        safeDivs.forEach((d) => {
          divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0;
        });
        const deptShareMap: Record<string, number> = {};
        safeDepts.forEach((dept) => {
          const sibHC = safeDepts.filter((d) => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
          deptShareMap[dept.id] = sibHC > 0 ? (dept.hc / sibHC) * (divShareMap[dept.divisiId] ?? 0) : 0;
        });
        const divGradeSums = calibrationGrades.map((_, gi) =>
          safeDivs.reduce((s, d) => s + (activeUnitAlloc.divMatrix[d.id]?.[gi] ?? 0), 0),
        );
        const uniqueDivInDepts = new Set(safeDepts.map((d) => d.divisiId).filter(Boolean)).size || safeDivs.length;
        const unitTargets = groupAlloc.unitMatrix[activeDrillUnit.id] ?? activeUnitAlloc.unitGradeTargets;

        return (
          <motion.div
            key={activeDrillUnit.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border-2 border-[#2F5597]/25 bg-[#F8FAFD] p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#DCE3F2]">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A284F] text-white text-xs font-bold">
                    <Building2 className="w-3.5 h-3.5" />
                    Detail Organisasi: {activeDrillUnit.name}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E6F3F1] border border-[#B8DDD8] text-xs font-semibold text-[#1D6863]">
                    HC Unit: {totalDivHC.toLocaleString()} orang
                  </span>
                  {calibrationGrades.map((g, gi) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EBF2FA] border border-[#C9DCF0] text-[11px] font-bold text-[#2F5597]"
                    >
                      <span>{g.grade}:</span>
                      <span>{unitTargets[gi] ?? 0}</span>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Distribusi kuota <strong>Division</strong> dan <strong>Departement</strong> pada {activeDrillUnit.name} otomatis mengikuti jatah kuota unit usaha di atas{editMode ? " (dapat disesuaikan manual di bawah ini)" : ""}.
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {memberUnits.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onSelectUnitId(u.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                      u.id === activeDrillUnit.id
                        ? "bg-[#2F5597] text-white border-[#2F5597]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {u.code}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onSelectUnitId(null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-3 h-3" /> Tutup
                </button>
              </div>
            </div>

            {/* Proportion per Division */}
            <ProportionTable
              title={`Proportion per Division — ${activeDrillUnit.name}`}
              subtitle="Distribusi kuota grade per Divisi (mengikuti kuota Unit Usaha pada tabel Group)"
              firstColHeader="DIVISION"
              isConfirmedLocked={isConfirmedLocked}
              rows={safeDivs.map((d) => ({
                id: d.id,
                label: d.divisi,
                hc: d.hc,
                shareKuota: fmtShare(divShareMap[d.id] ?? 0),
                calcs: activeUnitAlloc.divMatrix[d.id] ?? new Array(calibrationGrades.length).fill(0),
                customQuotas: d.customQuotas,
              }))}
              totalHC={totalDivHC}
              targetGradeTotals={unitTargets}
              calibrationGrades={calibrationGrades}
              editMode={editMode}
              onUpdateHC={(divId, val) => onUpdateUnitDivisionHC(activeDrillUnit.id, divId, val)}
              onUpdateQuota={(divId, gradeId, val) =>
                onUpdateUnitDivisionQuota(activeDrillUnit.id, divId, gradeId, val)
              }
              onAutoBalance={() => onAutoBalanceUnitLevel(activeDrillUnit.id, "division")}
              onResetQuotas={() => onResetUnitLevelQuotas(activeDrillUnit.id, "division")}
              primaryFooterLabel={`Jumlah Divisi: ${safeDivs.length}`}
            />

            {/* Proportion per Departement (tanpa Bagian sesuai konfirmasi) */}
            <ProportionTable
              title={`Proportion per Departement — ${activeDrillUnit.name}`}
              subtitle="Share Kuota & alokasi grade diturunkan dari kuota masing-masing Divisi induknya"
              firstColHeader="DEPARTEMENT"
              isConfirmedLocked={isConfirmedLocked}
              rows={safeDepts.map((dept) => {
                const parentDiv = safeDivs.find((d) => d.id === dept.divisiId);
                return {
                  id: dept.id,
                  label: dept.departemen,
                  parentLabel: parentDiv?.divisi,
                  hc: dept.hc,
                  shareKuota: fmtShare(deptShareMap[dept.id] ?? 0),
                  calcs: activeUnitAlloc.deptMatrix[dept.id] ?? new Array(calibrationGrades.length).fill(0),
                  customQuotas: dept.customQuotas,
                };
              })}
              totalHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
              targetGradeTotals={divGradeSums}
              calibrationGrades={calibrationGrades}
              editMode={editMode}
              onUpdateHC={(deptId, val) => onUpdateUnitDepartemenHC(activeDrillUnit.id, deptId, val)}
              onUpdateQuota={(deptId, gradeId, val) =>
                onUpdateUnitDepartemenQuota(activeDrillUnit.id, deptId, gradeId, val)
              }
              onAutoBalance={() => onAutoBalanceUnitLevel(activeDrillUnit.id, "department")}
              onResetQuotas={() => onResetUnitLevelQuotas(activeDrillUnit.id, "department")}
              showParent
              parentHeader="DIVISI"
              parentFooterLabel={`Jumlah Divisi: ${uniqueDivInDepts}`}
              primaryFooterLabel={`Jumlah Departement: ${safeDepts.length}`}
            />
          </motion.div>
        );
      })()}
    </div>
  );
}

function GroupHeadcountSummary({
  group,
  memberUnits,
  soyApproval,
}: {
  group: CalibrationGroupSetting;
  memberUnits: CompanyUnit[];
  soyApproval?: SoyApprovalRecord;
}) {
  const [level, setLevel] = useState<"unit" | "division" | "department">("unit");
  const [unitFilter, setUnitFilter] = useState<string>("ALL");

  const lockedGroupSnap =
    (soyApproval?.status === "Approved" || soyApproval?.status === "Pending") && soyApproval.groupSnapshot
      ? soyApproval.groupSnapshot
      : null;

  const soyGrades = lockedGroupSnap?.calibrationGrades ?? group.beginningGrades ?? group.calibrationGrades;
  const soyUnits: CompanyUnit[] = useMemo(() => {
    if (lockedGroupSnap?.units?.length) {
      return memberUnits.map((u) => {
        const snapU = lockedGroupSnap.units.find(
          (su) => su.id === u.id || canonicalizeCompanyUnitName(su.name) === canonicalizeCompanyUnitName(u.name),
        );
        if (!snapU) return u;
        return {
          ...u,
          calibrationGrades: snapU.calibrationGrades,
          unitQuotaTargets: snapU.unitQuotaTargets,
          divisionProportions: snapU.divisionProportions,
          departemenenProportions: snapU.departemenenProportions,
          bagianProportions: snapU.bagianProportions,
        };
      });
    }
    return memberUnits.map((u) => ({
      ...u,
      divisionProportions: u.divisionProportions.map((d) => ({
        ...d,
        hc: u.beginningHC ? u.beginningHC[d.id] ?? 0 : d.hc,
        customQuotas: u.beginningHC ? u.beginningCustomQuotas?.[d.id] : d.customQuotas,
      })),
      departemenenProportions: u.departemenenProportions.map((dep) => ({
        ...dep,
        hc: u.beginningHC ? u.beginningHC[dep.id] ?? 0 : dep.hc,
        customQuotas: u.beginningHC ? u.beginningCustomQuotas?.[dep.id] : dep.customQuotas,
      })),
    }));
  }, [lockedGroupSnap, memberUnits]);

  const soyAlloc = useMemo(
    () =>
      computeGroupQuotaAllocation({
        calibrationGrades: soyGrades,
        units: soyUnits,
        unitCustomQuotas: lockedGroupSnap?.unitCustomQuotas ?? group.beginningUnitCustomQuotas ?? group.unitCustomQuotas,
      }),
    [soyGrades, soyUnits, lockedGroupSnap, group.beginningUnitCustomQuotas, group.unitCustomQuotas],
  );

  const eoyAlloc = useMemo(
    () =>
      computeGroupQuotaAllocation({
        calibrationGrades: group.calibrationGrades,
        units: memberUnits,
        unitCustomQuotas: group.unitCustomQuotas,
      }),
    [group.calibrationGrades, memberUnits, group.unitCustomQuotas],
  );

  const initialTotal = soyAlloc.totalHC;
  const finalTotal = eoyAlloc.totalHC;
  const difference = finalTotal - initialTotal;
  const hasConfirmedEoy = Boolean(
    group.yearEndStatus === "submitted" || memberUnits.some((u) => u.yearEndStatus === "submitted"),
  );

  const soyGradeCounts = soyGrades.map((_, gi) =>
    soyUnits.reduce((s, u) => s + (soyAlloc.unitMatrix[u.id]?.[gi] ?? 0), 0),
  );
  const eoyGradeCounts = group.calibrationGrades.map((_, gi) =>
    memberUnits.reduce((s, u) => s + (eoyAlloc.unitMatrix[u.id]?.[gi] ?? 0), 0),
  );

  const comparisonRows = useMemo(() => {
    if (level === "unit") {
      return memberUnits.map((u) => {
        const sHc = soyAlloc.unitHCs[u.id] ?? 0;
        const eHc = eoyAlloc.unitHCs[u.id] ?? 0;
        return {
          id: u.id,
          label: u.name,
          startHc: sHc,
          endHc: eHc,
          beforeShare: soyAlloc.unitShareMap[u.id] ?? 0,
          afterShare: eoyAlloc.unitShareMap[u.id] ?? 0,
        };
      });
    }
    const filteredUnits = unitFilter === "ALL" ? memberUnits : memberUnits.filter((u) => u.id === unitFilter);
    const totalStartScope = filteredUnits.reduce((s, u) => s + (soyAlloc.unitHCs[u.id] ?? 0), 0);
    const totalEndScope = filteredUnits.reduce((s, u) => s + (eoyAlloc.unitHCs[u.id] ?? 0), 0);
    const out: Array<{
      id: string;
      label: string;
      startHc: number;
      endHc: number;
      beforeShare: number;
      afterShare: number;
    }> = [];
    for (const u of filteredUnits) {
      const su = soyUnits.find((x) => x.id === u.id) ?? u;
      if (level === "division") {
        const divMap = new Map<string, { divisi: string; sHc: number; eHc: number }>();
        for (const d of su.divisionProportions) divMap.set(d.id, { divisi: d.divisi, sHc: d.hc, eHc: 0 });
        for (const d of u.divisionProportions) {
          const cur = divMap.get(d.id);
          divMap.set(d.id, { divisi: d.divisi, sHc: cur?.sHc ?? 0, eHc: d.hc });
        }
        for (const [did, entry] of divMap.entries()) {
          out.push({
            id: `${u.id}::${did}`,
            label: unitFilter === "ALL" ? `${entry.divisi} (${u.code})` : entry.divisi,
            startHc: entry.sHc,
            endHc: entry.eHc,
            beforeShare: totalStartScope > 0 ? (entry.sHc / totalStartScope) * 100 : 0,
            afterShare: totalEndScope > 0 ? (entry.eHc / totalEndScope) * 100 : 0,
          });
        }
      } else {
        const depMap = new Map<string, { departemen: string; sHc: number; eHc: number }>();
        for (const dep of su.departemenenProportions) depMap.set(dep.id, { departemen: dep.departemen, sHc: dep.hc, eHc: 0 });
        for (const dep of u.departemenenProportions) {
          const cur = depMap.get(dep.id);
          depMap.set(dep.id, { departemen: dep.departemen, sHc: cur?.sHc ?? 0, eHc: dep.hc });
        }
        for (const [depId, entry] of depMap.entries()) {
          out.push({
            id: `${u.id}::${depId}`,
            label: unitFilter === "ALL" ? `${entry.departemen} (${u.code})` : entry.departemen,
            startHc: entry.sHc,
            endHc: entry.eHc,
            beforeShare: totalStartScope > 0 ? (entry.sHc / totalStartScope) * 100 : 0,
            afterShare: totalEndScope > 0 ? (entry.eHc / totalEndScope) * 100 : 0,
          });
        }
      }
    }
    return out;
  }, [level, unitFilter, memberUnits, soyUnits, soyAlloc, eoyAlloc]);

  const deltaColor = (value: number) =>
    value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  const signed = (value: number, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

  const gradeRows = group.calibrationGrades.map((after, idx) => {
    const before = soyGrades.find((item) => item.id === after.id) ?? after;
    return {
      id: after.id,
      label: after.grade,
      beforePercent: parseGradePct(before.proporsi),
      beforeCount: soyGradeCounts[idx] ?? 0,
      afterCount: eoyGradeCounts[idx] ?? 0,
    };
  });
  const gradeTotals = gradeRows.reduce(
    (tot, item) => ({
      proportion: tot.proportion + item.beforePercent,
      before: tot.before + item.beforeCount,
      after: tot.after + item.afterCount,
    }),
    { proportion: 0, before: 0, after: 0 },
  );
  const quotaTotals = comparisonRows.reduce(
    (tot, r) => ({
      before: tot.before + r.startHc,
      after: tot.after + r.endHc,
      beforeShare: tot.beforeShare + r.beforeShare,
      afterShare: tot.afterShare + r.afterShare,
    }),
    { before: 0, after: 0, beforeShare: 0, afterShare: 0 },
  );

  const cards: Array<{ label: string; value: React.ReactNode; sub: string; tone: AnalyticsCardTone; icon: React.ReactNode }> = [
    {
      label: "HC Awal Tahun (SOY)",
      value: initialTotal,
      sub: lockedGroupSnap ? `Terkunci (Approved ${group.name})` : `Baseline Awal Tahun ${group.name}`,
      tone: "navy",
      icon: <Users className="w-4 h-4" />,
    },
    {
      label: "HC Akhir Tahun (EOY)",
      value: finalTotal,
      sub: hasConfirmedEoy ? "Data EOY Group terkonfirmasi" : "Proyeksi HC aktif saat ini",
      tone: "teal",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      label: "Selisih HC",
      value: (difference > 0 ? "+" : "") + difference,
      sub: "Perbandingan EOY vs SOY",
      tone: difference > 0 ? "emerald" : difference < 0 ? "rose" : "slate",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      label: "% Perubahan",
      value: headcountPercentageChange(initialTotal, finalTotal),
      sub: "Rasio perubahan headcount Group",
      tone: "plum",
      icon: <Percent className="w-4 h-4" />,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, idx) => (
            <AnalyticsStatCard
              key={card.label}
              index={idx}
              compact
              tone={card.tone}
              title={card.label}
              value={card.value}
              subtitle={card.sub}
              icon={card.icon}
            />
          ))}
        </div>

        <ComparisonBellCurveCard
          grades={group.calibrationGrades}
          soyCounts={soyGradeCounts}
          eoyCounts={eoyGradeCounts}
          hasConfirmedEoy={hasConfirmedEoy}
        />

        <section className="overflow-hidden rounded-xl border border-gray-200">
          <div className="border-b bg-gray-50 p-4">
            <h4 className="font-semibold">Perbandingan Grade Distribution — {group.name} (SOY vs EOY)</h4>
            <p className="mt-1 text-xs text-gray-500">
              Proporsi dan kuota karyawan gabungan {group.name} antara HC Awal Tahun (SOY) dan HC Akhir Tahun (EOY).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  {["Grade", "Proporsi SOY", "Kuota Awal (SOY)", "Kuota Akhir (EOY)", "Selisih Karyawan"].map((label) => (
                    <th key={label} className="whitespace-nowrap px-4 py-3 text-left">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gradeRows.map((item, rIdx) => (
                  <tr key={item.id} className={`border-t ${EXTRA_SOFT_ROW_PALETTE[rIdx % EXTRA_SOFT_ROW_PALETTE.length]}`}>
                    <td className="p-4 font-semibold">{item.label}</td>
                    <td className="p-4">{item.beforePercent}%</td>
                    <td className="p-4">{item.beforeCount}</td>
                    <td className="p-4">{item.afterCount}</td>
                    <td className={`p-4 font-semibold ${deltaColor(item.afterCount - item.beforeCount)}`}>
                      {signed(item.afterCount - item.beforeCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]">
                <tr>
                  <th scope="row" className="p-4 text-left">Total</th>
                  <td className="p-4">{gradeTotals.proportion.toFixed(1)}%</td>
                  <td className="p-4">{gradeTotals.before}</td>
                  <td className="p-4">{gradeTotals.after}</td>
                  <td className={`p-4 ${deltaColor(gradeTotals.after - gradeTotals.before)}`}>
                    {signed(gradeTotals.after - gradeTotals.before)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200">
          <div className="space-y-4 border-b bg-gray-50 p-4">
            <div>
              <h4 className="font-semibold">Perbandingan Share Quota — {group.name} (SOY vs EOY)</h4>
              <p className="mt-1 text-xs text-gray-500">
                Ringkasan perubahan HC Awal Tahun (SOY) dan HC Akhir Tahun (EOY) per Unit Usaha, Division, dan Departement.
              </p>
            </div>
            {/* CALIBRATION.4: Filter Level mode icon warna + anak filter ke samping + Clear Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { key: "unit" as const, label: "Company Unit", icon: Building2, activeCls: "bg-[#2F5597] text-white border-[#2F5597]", idleCls: "bg-[#EBF2FA] text-[#2F5597] border-[#C9DCF0] hover:bg-[#DCE8F6]", iconColor: "#2F5597" },
                { key: "division" as const, label: "Division", icon: Layers, activeCls: "bg-[#248277] text-white border-[#248277]", idleCls: "bg-[#E6F3F1] text-[#1D6863] border-[#B8DDD8] hover:bg-[#D5ECE8]", iconColor: "#248277" },
                { key: "department" as const, label: "Departement", icon: Users, activeCls: "bg-[#C07A28] text-white border-[#C07A28]", idleCls: "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4] hover:bg-[#FAE6CE]", iconColor: "#C07A28" },
              ].map((lv) => {
                const IconC = lv.icon;
                const isAct = level === lv.key;
                return (
                  <button
                    key={lv.key}
                    type="button"
                    onClick={() => {
                      setLevel(lv.key);
                      if (lv.key === "unit") setUnitFilter("ALL");
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                      isAct ? lv.activeCls : lv.idleCls
                    }`}
                  >
                    <IconC className="w-3.5 h-3.5" style={{ color: isAct ? "#FFFFFF" : lv.iconColor }} />
                    {lv.label}
                  </button>
                );
              })}

              {/* Anak filter ke samping saat memilih Division / Departement */}
              {level !== "unit" && (
                <div className="inline-flex items-center gap-1.5 flex-wrap pl-1.5 border-l-2 border-slate-200">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setUnitFilter("ALL")}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                      unitFilter === "ALL"
                        ? "bg-[#1A284F] text-white border-[#1A284F]"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/70"
                    }`}
                  >
                    Semua Unit ({group.name})
                  </button>
                  {memberUnits.map((u, uIdx) => {
                    const isSel = unitFilter === u.id;
                    const idleTone = SOFT_TAG_PALETTE[uIdx % SOFT_TAG_PALETTE.length];
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setUnitFilter(isSel ? "ALL" : u.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                          isSel ? "bg-[#2F5597] text-white border-[#2F5597]" : idleTone
                        }`}
                      >
                        <Building2 className="w-3 h-3" />
                        {u.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Clear Filter Tag */}
              {(level !== "unit" || unitFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setLevel("unit");
                    setUnitFilter("ALL");
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Clear Filter
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  {[
                    level === "unit" ? "Unit Usaha" : "Organisasi",
                    "HC Awal (SOY)",
                    "HC Akhir (EOY)",
                    "Selisih HC",
                    "Perubahan (%)",
                    "Share Quota SOY",
                    "Share Quota EOY",
                    "Selisih Share (%)",
                  ].map((label) => (
                    <th key={label} className="whitespace-nowrap px-4 py-3 text-left">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((item, rIdx) => (
                  <tr key={item.id} className={`border-t ${EXTRA_SOFT_ROW_PALETTE[rIdx % EXTRA_SOFT_ROW_PALETTE.length]}`}>
                    <td className="p-4 font-medium">{item.label}</td>
                    <td className="p-4">{item.startHc}</td>
                    <td className="p-4">{item.endHc}</td>
                    <td className={`p-4 font-semibold ${deltaColor(item.endHc - item.startHc)}`}>
                      {signed(item.endHc - item.startHc)}
                    </td>
                    <td className={`p-4 font-semibold ${deltaColor(item.endHc - item.startHc)}`}>
                      {headcountPercentageChange(item.startHc, item.endHc)}
                    </td>
                    <td className="p-4">{item.beforeShare.toFixed(1)}%</td>
                    <td className="p-4">{item.afterShare.toFixed(1)}%</td>
                    <td className={`p-4 font-semibold ${deltaColor(item.afterShare - item.beforeShare)}`}>
                      {signed(item.afterShare - item.beforeShare, 1)}%
                    </td>
                  </tr>
                ))}
                {!comparisonRows.length && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">Tidak ada organisasi sesuai filter.</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]">
                <tr>
                  <th scope="row" className="p-4 text-left">Total</th>
                  <td className="p-4">{quotaTotals.before}</td>
                  <td className="p-4">{quotaTotals.after}</td>
                  <td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>
                    {signed(quotaTotals.after - quotaTotals.before)}
                  </td>
                  <td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>
                    {headcountPercentageChange(quotaTotals.before, quotaTotals.after)}
                  </td>
                  <td className="p-4">{quotaTotals.beforeShare.toFixed(1)}%</td>
                  <td className="p-4">{quotaTotals.afterShare.toFixed(1)}%</td>
                  <td className={`p-4 ${deltaColor(quotaTotals.afterShare - quotaTotals.beforeShare)}`}>
                    {signed(quotaTotals.afterShare - quotaTotals.beforeShare, 1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function GroupDetail({
  group,
  memberUnits,
  soyApproval,
  onBack,
  onCommitGroupAndUnits,
  onSubmitGroupSoy,
  onResetGroupSoy,
}: {
  group: CalibrationGroupSetting;
  memberUnits: CompanyUnit[];
  soyApproval?: SoyApprovalRecord;
  onBack: () => void;
  onCommitGroupAndUnits: (nextGroup: CalibrationGroupSetting, nextMemberUnits: CompanyUnit[], toastMessage?: string) => void;
  onSubmitGroupSoy: (committedGroup: CalibrationGroupSetting, committedMemberUnits: CompanyUnit[]) => void;
  onResetGroupSoy: () => void;
}) {
  const [hcTab, setHcTab] = useState<"start" | "end" | "summary">("start");
  const [soyEditMode, setSoyEditMode] = useState(false);
  const [soyPageMode, setSoyPageMode] = useState<PageMode>("edit");
  const [soySaved, setSoySaved] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedSoyUnitId, setSelectedSoyUnitId] = useState<string | null>(null);

  const [eoyEditMode, setEoyEditMode] = useState(false);
  const [eoyPageMode, setEoyPageMode] = useState<PageMode>(group.yearEndStatus ?? "edit");
  const [showEoyConfirmModal, setShowEoyConfirmModal] = useState(false);
  const [selectedEoyUnitId, setSelectedEoyUnitId] = useState<string | null>(null);

  const [workingGroup, setWorkingGroup] = useState<CalibrationGroupSetting>(() => JSON.parse(JSON.stringify(group)));
  const [workingUnits, setWorkingUnits] = useState<CompanyUnit[]>(() => JSON.parse(JSON.stringify(memberUnits)));
  const [editBaselineTotalHC, setEditBaselineTotalHC] = useState<number>(() =>
    memberUnits.reduce((sum, u) => sum + u.divisionProportions.reduce((s, d) => s + d.hc, 0), 0),
  );

  useEffect(() => {
    if (!soyEditMode && !eoyEditMode) {
      setWorkingGroup(JSON.parse(JSON.stringify(group)));
      setWorkingUnits(JSON.parse(JSON.stringify(memberUnits)));
    }
  }, [group, memberUnits, soyEditMode, eoyEditMode]);

  useEffect(() => {
    setEoyPageMode(group.yearEndStatus ?? "edit");
  }, [group.id, group.yearEndStatus]);

  const isSoyApprovedLocked = Boolean(soyApproval?.status === "Approved" && soyApproval.groupSnapshot);
  const isSoyPending = Boolean(soyApproval?.status === "Pending");
  const isSoySnapshotFrozen = Boolean((isSoyApprovedLocked || isSoyPending) && soyApproval?.groupSnapshot);
  const effectiveSoyMode: PageMode = isSoyApprovedLocked || isSoyPending ? "submitted" : soyPageMode;
  const canSubmitSoy = !isSoyApprovedLocked && !isSoyPending && (soySaved || effectiveSoyMode === "preview" || memberUnits.some((u) => u.divisionProportions.length > 0));

  // Data yang ditampilkan di tab SOY: bila sudah Submitted (Pending) maupun Approved, kunci penuh dari snapshot SOY agar tidak berubah walau ada karyawan diarsip!
  const soyDisplayGrades = useMemo(() => {
    if (soyEditMode) return workingGroup.calibrationGrades;
    if (isSoySnapshotFrozen && soyApproval?.groupSnapshot) return soyApproval.groupSnapshot.calibrationGrades;
    if (group.beginningGrades) return group.beginningGrades;
    return group.calibrationGrades;
  }, [soyEditMode, workingGroup.calibrationGrades, isSoySnapshotFrozen, soyApproval, group.beginningGrades, group.calibrationGrades]);

  const soyDisplayUnitCustomQuotas = useMemo(() => {
    if (soyEditMode) return workingGroup.unitCustomQuotas;
    if (isSoySnapshotFrozen && soyApproval?.groupSnapshot) return soyApproval.groupSnapshot.unitCustomQuotas;
    if (group.beginningUnitCustomQuotas) return group.beginningUnitCustomQuotas;
    return group.unitCustomQuotas;
  }, [soyEditMode, workingGroup.unitCustomQuotas, isSoySnapshotFrozen, soyApproval, group.beginningUnitCustomQuotas, group.unitCustomQuotas]);

  const soyDisplayUnits: CompanyUnit[] = useMemo(() => {
    if (soyEditMode) return workingUnits;
    if (isSoySnapshotFrozen && soyApproval?.groupSnapshot?.units) {
      return memberUnits.map((u) => {
        const snap = soyApproval.groupSnapshot!.units.find(
          (su) => su.id === u.id || canonicalizeCompanyUnitName(su.name) === canonicalizeCompanyUnitName(u.name),
        );
        if (!snap) return u;
        return {
          ...u,
          calibrationGrades: snap.calibrationGrades,
          unitQuotaTargets: snap.unitQuotaTargets,
          divisionProportions: snap.divisionProportions,
          departemenenProportions: snap.departemenenProportions,
          bagianProportions: snap.bagianProportions,
        };
      });
    }
    return memberUnits.map((u) =>
      u.beginningHC
        ? {
            ...u,
            divisionProportions: u.divisionProportions.map((d) => ({
              ...d,
              hc: u.beginningHC?.[d.id] ?? d.hc,
              customQuotas: u.beginningCustomQuotas?.[d.id],
            })),
            departemenenProportions: u.departemenenProportions.map((dep) => ({
              ...dep,
              hc: u.beginningHC?.[dep.id] ?? dep.hc,
              customQuotas: u.beginningCustomQuotas?.[dep.id],
            })),
          }
        : u,
    );
  }, [soyEditMode, workingUnits, isSoySnapshotFrozen, soyApproval, memberUnits]);

  // Helpers mutasi workingGroup & workingUnits (digunakan bersama oleh SOY edit maupun EOY edit)
  const handleUpdateGrade = (id: string, field: keyof CalibrationGrade, val: string) => {
    setWorkingGroup((prev) => ({
      ...prev,
      calibrationGrades: prev.calibrationGrades.map((g) => (g.id === id ? { ...g, [field]: val } : g)),
    }));
  };

  const handleUpdateCompanyUnitQuota = (unitId: string, gradeId: string, val: number | null) => {
    setWorkingGroup((prev) => {
      const nextAll = { ...(prev.unitCustomQuotas ?? {}) };
      const nextUnit = { ...(nextAll[unitId] ?? {}) };
      if (val === null) delete nextUnit[gradeId];
      else nextUnit[gradeId] = val;
      if (Object.keys(nextUnit).length === 0) delete nextAll[unitId];
      else nextAll[unitId] = nextUnit;
      return { ...prev, unitCustomQuotas: nextAll };
    });
  };

  const handleAutoBalanceCompanyUnits = () => {
    const gradeIds = workingGroup.calibrationGrades.map((g) => g.id);
    const gradeWeights = workingGroup.calibrationGrades.map((g) => parseGradePct(g.proporsi));
    const rowHCs = workingUnits.map((u) => u.divisionProportions.reduce((s, d) => s + d.hc, 0));
    const totalHC = rowHCs.reduce((a, b) => a + b, 0);
    const groupTargets = apportionLargestRemainder(totalHC, gradeWeights);
    const balanced = allocate2DQuotaMatrix({
      rowHCs,
      colTargets: groupTargets,
      gradeWeights,
      gradeIds,
      rowCustomQuotas: workingUnits.map((u) => workingGroup.unitCustomQuotas?.[u.id]),
      autoBalanceLocked: true,
    });
    const nextMap: Record<string, Record<string, number>> = {};
    workingUnits.forEach((u, idx) => {
      nextMap[u.id] = Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[idx]?.[g] ?? 0]));
    });
    setWorkingGroup((prev) => ({ ...prev, unitCustomQuotas: nextMap }));
    toast.success(`Kuota antar-Unit Usaha pada ${group.name} berhasil diseimbangkan sesuai kurva normal.`);
  };

  const handleResetCompanyUnitQuotas = () => {
    setWorkingGroup((prev) => ({ ...prev, unitCustomQuotas: {} }));
    toast.success("Kuota Unit Usaha dikembalikan ke distribusi normal otomatis.");
  };

  const handleUpdateUnitDivisionHC = (unitId: string, divId: string, newHC: number) => {
    setWorkingUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const updDivs = u.divisionProportions.map((d) =>
          d.id === divId ? { ...d, hc: newHC, customQuotas: undefined } : d,
        );
        const deptsInDiv = u.departemenenProportions.filter((d) => d.divisiId === divId);
        const deptWeights = deptsInDiv.map((d) => (d.hc > 0 ? d.hc : 1));
        const deptHCs = apportionLargestRemainder(newHC, deptWeights);
        const deptHcById = new Map(deptsInDiv.map((d, i) => [d.id, deptHCs[i] ?? 0]));
        const updDepts = u.departemenenProportions.map((d) =>
          deptHcById.has(d.id) ? { ...d, hc: deptHcById.get(d.id)!, customQuotas: undefined } : d,
        );
        const updBags = u.bagianProportions.map((b) => ({ ...b }));
        for (const dep of deptsInDiv) {
          const tDepHC = deptHcById.get(dep.id) ?? 0;
          const bags = updBags.filter((b) => b.departemenenId === dep.id);
          const bagHCs = apportionLargestRemainder(tDepHC, bags.map((b) => (b.hc > 0 ? b.hc : 1)));
          bags.forEach((bag, idx) => {
            bag.hc = bagHCs[idx] ?? 0;
            bag.customQuotas = undefined;
          });
        }
        return { ...u, divisionProportions: updDivs, departemenenProportions: updDepts, bagianProportions: updBags };
      }),
    );
  };

  const handleUpdateUnitDepartemenHC = (unitId: string, deptId: string, rawVal: number) => {
    setWorkingUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const dept = u.departemenenProportions.find((d) => d.id === deptId);
        if (!dept) return u;
        const newHC = Math.max(0, rawVal);
        const updDepts = u.departemenenProportions.map((d) =>
          d.id === deptId ? { ...d, hc: newHC, customQuotas: undefined } : d,
        );
        // Sinkronkan HC Divisi induk secara real-time dari total HC seluruh Departement di bawahnya
        const newParentDivHC = updDepts
          .filter((d) => d.divisiId === dept.divisiId)
          .reduce((s, d) => s + d.hc, 0);
        const updDivs = u.divisionProportions.map((div) =>
          div.id === dept.divisiId ? { ...div, hc: newParentDivHC, customQuotas: undefined } : div,
        );
        const bags = u.bagianProportions.filter((b) => b.departemenenId === deptId);
        const bagHCs = apportionLargestRemainder(newHC, bags.map((b) => (b.hc > 0 ? b.hc : 1)));
        const bagHcById = new Map(bags.map((b, i) => [b.id, bagHCs[i] ?? 0]));
        const updBags = u.bagianProportions.map((b) =>
          bagHcById.has(b.id) ? { ...b, hc: bagHcById.get(b.id)!, customQuotas: undefined } : b,
        );
        return { ...u, divisionProportions: updDivs, departemenenProportions: updDepts, bagianProportions: updBags };
      }),
    );
  };

  const handleUpdateUnitDivisionQuota = (unitId: string, divId: string, gradeId: string, val: number | null) => {
    const gradeIds = workingGroup.calibrationGrades.map((g) => g.id);
    const gradeWeights = workingGroup.calibrationGrades.map((g) => parseGradePct(g.proporsi));
    const nextUnits = workingUnits.map((u) =>
      u.id === unitId ? { ...u, divisionProportions: patchQuotaRecord(u.divisionProportions, divId, gradeId, val) } : u,
    );
    setWorkingUnits(nextUnits);
    // Propagasikan perubahan kuota Division ke kuota Company Unit & Bell Curve secara real-time
    const targetU = nextUnits.find((u) => u.id === unitId);
    if (targetU) {
      const curAlloc = computeGroupQuotaAllocation({
        calibrationGrades: workingGroup.calibrationGrades,
        units: nextUnits,
        unitCustomQuotas: workingGroup.unitCustomQuotas,
      });
      const unitColTargets = curAlloc.unitMatrix[unitId] ?? apportionLargestRemainder(curAlloc.unitHCs[unitId] ?? 0, gradeWeights);
      const divMatrix = allocate2DQuotaMatrix({
        rowHCs: targetU.divisionProportions.map((d) => d.hc),
        colTargets: unitColTargets,
        gradeWeights,
        gradeIds,
        rowCustomQuotas: targetU.divisionProportions.map((d) => d.customQuotas),
      });
      const summedUnitQuotas = Object.fromEntries(
        gradeIds.map((gid, gi) => [gid, divMatrix.reduce((s, row) => s + (row[gi] ?? 0), 0)]),
      );
      setWorkingGroup((prev) => ({
        ...prev,
        unitCustomQuotas: { ...(prev.unitCustomQuotas ?? {}), [unitId]: summedUnitQuotas },
      }));
    }
  };

  const handleUpdateUnitDepartemenQuota = (unitId: string, deptId: string, gradeId: string, val: number | null) => {
    const gradeIds = workingGroup.calibrationGrades.map((g) => g.id);
    const gradeWeights = workingGroup.calibrationGrades.map((g) => parseGradePct(g.proporsi));
    const nextUnits = workingUnits.map((u) => {
      if (u.id !== unitId) return u;
      const updDepts = patchQuotaRecord(u.departemenenProportions, deptId, gradeId, val);
      const editedDept = updDepts.find((d) => d.id === deptId);
      if (!editedDept) return { ...u, departemenenProportions: updDepts };
      const parentDiv = u.divisionProportions.find((d) => d.id === editedDept.divisiId);
      if (!parentDiv) return { ...u, departemenenProportions: updDepts };
      const sibDepts = updDepts.filter((d) => d.divisiId === parentDiv.id);
      const divColTargets = apportionLargestRemainder(parentDiv.hc, gradeWeights);
      const deptMat = allocate2DQuotaMatrix({
        rowHCs: sibDepts.map((s) => s.hc),
        colTargets: divColTargets,
        gradeWeights,
        gradeIds,
        rowCustomQuotas: sibDepts.map((s) => s.customQuotas),
      });
      const summedDivQuotas = Object.fromEntries(
        gradeIds.map((gid, gi) => [gid, deptMat.reduce((s, r) => s + (r[gi] ?? 0), 0)]),
      );
      const updDivs = u.divisionProportions.map((d) =>
        d.id === parentDiv.id ? { ...d, customQuotas: summedDivQuotas } : d,
      );
      return { ...u, divisionProportions: updDivs, departemenenProportions: updDepts };
    });
    setWorkingUnits(nextUnits);
    const targetU = nextUnits.find((u) => u.id === unitId);
    if (targetU) {
      const curAlloc = computeGroupQuotaAllocation({
        calibrationGrades: workingGroup.calibrationGrades,
        units: nextUnits,
        unitCustomQuotas: workingGroup.unitCustomQuotas,
      });
      const unitColTargets = curAlloc.unitMatrix[unitId] ?? apportionLargestRemainder(curAlloc.unitHCs[unitId] ?? 0, gradeWeights);
      const divMatrix = allocate2DQuotaMatrix({
        rowHCs: targetU.divisionProportions.map((d) => d.hc),
        colTargets: unitColTargets,
        gradeWeights,
        gradeIds,
        rowCustomQuotas: targetU.divisionProportions.map((d) => d.customQuotas),
      });
      const summedUnitQuotas = Object.fromEntries(
        gradeIds.map((gid, gi) => [gid, divMatrix.reduce((s, row) => s + (row[gi] ?? 0), 0)]),
      );
      setWorkingGroup((prev) => ({
        ...prev,
        unitCustomQuotas: { ...(prev.unitCustomQuotas ?? {}), [unitId]: summedUnitQuotas },
      }));
    }
  };

  const handleAutoBalanceUnitLevel = (unitId: string, level: "division" | "department") => {
    const curGroupAlloc = computeGroupQuotaAllocation({
      calibrationGrades: workingGroup.calibrationGrades,
      units: workingUnits,
      unitCustomQuotas: workingGroup.unitCustomQuotas,
    });
    const gradeIds = workingGroup.calibrationGrades.map((g) => g.id);
    const gradeWeights = workingGroup.calibrationGrades.map((g) => parseGradePct(g.proporsi));
    setWorkingUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const unitTargets = curGroupAlloc.unitMatrix[u.id] ?? apportionLargestRemainder(curGroupAlloc.unitHCs[u.id] ?? 0, gradeWeights);
        if (level === "division") {
          const balanced = allocate2DQuotaMatrix({
            rowHCs: u.divisionProportions.map((d) => d.hc),
            colTargets: unitTargets,
            gradeWeights,
            gradeIds,
            rowCustomQuotas: u.divisionProportions.map((d) => d.customQuotas),
            autoBalanceLocked: true,
          });
          return {
            ...u,
            divisionProportions: u.divisionProportions.map((d, r) => ({
              ...d,
              customQuotas: Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[r]?.[g] ?? 0])),
            })),
          };
        }
        const uAlloc = curGroupAlloc.perUnitAlloc[u.id];
        const nextDepts = [...u.departemenenProportions];
        for (const div of u.divisionProportions) {
          const children = nextDepts.filter((dep) => dep.divisiId === div.id);
          if (!children.length) continue;
          const balanced = allocate2DQuotaMatrix({
            rowHCs: children.map((c) => c.hc),
            colTargets: uAlloc?.divMatrix[div.id] ?? apportionLargestRemainder(div.hc, gradeWeights),
            gradeWeights,
            gradeIds,
            rowCustomQuotas: children.map((c) => c.customQuotas),
            autoBalanceLocked: true,
          });
          children.forEach((child, r) => {
            const idx = nextDepts.findIndex((x) => x.id === child.id);
            if (idx >= 0) {
              nextDepts[idx] = {
                ...nextDepts[idx],
                customQuotas: Object.fromEntries(gradeIds.map((gid, g) => [gid, balanced[r]?.[g] ?? 0])),
              };
            }
          });
        }
        return { ...u, departemenenProportions: nextDepts };
      }),
    );
    toast.success(`Kuota ${level === "division" ? "Divisi" : "Departement"} berhasil diseimbangkan.`);
  };

  const handleResetUnitLevelQuotas = (unitId: string, level: "division" | "department") => {
    setWorkingUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        if (level === "division") {
          return { ...u, divisionProportions: u.divisionProportions.map((d) => ({ ...d, customQuotas: undefined })) };
        }
        return { ...u, departemenenProportions: u.departemenenProportions.map((d) => ({ ...d, customQuotas: undefined })) };
      }),
    );
    setWorkingGroup((prev) => {
      const nextMap = { ...(prev.unitCustomQuotas ?? {}) };
      delete nextMap[unitId];
      return { ...prev, unitCustomQuotas: nextMap };
    });
    toast.success("Kuota manual dikembalikan ke perhitungan otomatis.");
  };

  // Validasi real-time Save Changes: aktif HANYA jika jumlah total HC (& total kuota grade) sesudah diedit == sebelum diedit, dan total proporsi Grade == 100%
  const saveValidation = useMemo(() => {
    const curAlloc = computeGroupQuotaAllocation({
      calibrationGrades: workingGroup.calibrationGrades,
      units: workingUnits,
      unitCustomQuotas: workingGroup.unitCustomQuotas,
    });
    const afterTotalHC = curAlloc.totalHC;
    const allocatedUnitTotal = workingUnits.reduce(
      (sum, u) => sum + (curAlloc.unitMatrix[u.id]?.reduce((a, b) => a + b, 0) ?? 0),
      0,
    );
    let subQuotaTotalMismatchUnit: string | null = null;
    for (const u of workingUnits) {
      const uAlloc = curAlloc.perUnitAlloc[u.id];
      const uHc = curAlloc.unitHCs[u.id] ?? 0;
      if (uAlloc) {
        const divQuotaSum = u.divisionProportions.reduce(
          (s, d) => s + (uAlloc.divMatrix[d.id]?.reduce((a, b) => a + b, 0) ?? 0),
          0,
        );
        const deptQuotaSum = u.departemenenProportions.reduce(
          (s, d) => s + (uAlloc.deptMatrix[d.id]?.reduce((a, b) => a + b, 0) ?? 0),
          0,
        );
        if (divQuotaSum !== uHc || (u.departemenenProportions.length > 0 && deptQuotaSum !== uHc)) {
          subQuotaTotalMismatchUnit = u.name;
          break;
        }
      }
    }
    const totalPct = workingGroup.calibrationGrades.reduce((s, g) => s + parseGradePct(g.proporsi), 0);
    const reasons: string[] = [];
    if (afterTotalHC !== editBaselineTotalHC) {
      reasons.push(
        `Total HC sesudah diedit (${afterTotalHC.toLocaleString()} orang) belum sama dengan Total HC awal sebelum diedit (${editBaselineTotalHC.toLocaleString()} orang).`,
      );
    }
    if (allocatedUnitTotal !== editBaselineTotalHC) {
      reasons.push(
        `Total kuota distribusi Unit Usaha (${allocatedUnitTotal.toLocaleString()} orang) belum sama dengan Total HC (${editBaselineTotalHC.toLocaleString()} orang).`,
      );
    }
    if (subQuotaTotalMismatchUnit) {
      reasons.push(
        `Total kuota Division / Departement pada ${subQuotaTotalMismatchUnit} belum sama dengan HC unit tersebut.`,
      );
    }
    if (Math.abs(totalPct - 100) > 0.001) {
      reasons.push(`Total proporsi Grade saat ini ${totalPct}% (wajib tepat 100%).`);
    }
    return {
      canSave: reasons.length === 0,
      tooltipText: reasons.join(" "),
    };
  }, [workingGroup, workingUnits, editBaselineTotalHC]);

  const handleCancelConfirmGroupEoy = () => {
    const unlockedUnits = memberUnits.map((u) => ({
      ...u,
      yearEndStatus: "edit" as PageMode,
      yearEndUpdatedAt: new Date().toISOString(),
    }));
    const unlockedGroup: CalibrationGroupSetting = {
      ...group,
      yearEndStatus: "edit",
      yearEndUpdatedAt: new Date().toISOString(),
    };
    onCommitGroupAndUnits(
      unlockedGroup,
      unlockedUnits,
      `Status Confirm Data HC Akhir Tahun (EOY) ${group.name} dibatalkan. Pengaturan EOY dapat disesuaikan kembali.`,
    );
    setEoyPageMode("edit");
  };

  const handleRefreshEmployees = (targetPhase: "soy" | "eoy") => {
    const baseUnits = (targetPhase === "soy" ? (soyEditMode ? workingUnits : memberUnits) : (eoyEditMode ? workingUnits : memberUnits)).map(
      (u) => applyImportedEmployeesDistribution(u, true),
    );
    const baseGroup: CalibrationGroupSetting = {
      ...(targetPhase === "soy" ? (soyEditMode ? workingGroup : group) : (eoyEditMode ? workingGroup : group)),
      unitCustomQuotas: {},
    };
    if ((targetPhase === "soy" && soyEditMode) || (targetPhase === "eoy" && eoyEditMode)) {
      setWorkingUnits(baseUnits);
      setWorkingGroup(baseGroup);
    } else {
      onCommitGroupAndUnits(
        baseGroup,
        baseUnits,
        `Data karyawan seluruh unit pada ${group.name} berhasil di-refresh dan didistribusikan otomatis.`,
      );
    }
  };

  const handleSaveSoyChanges = () => {
    const totalPct = workingGroup.calibrationGrades.reduce((s, g) => s + parseGradePct(g.proporsi), 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      toast.error(`Total proporsi Grade saat ini ${totalPct}%. Pastikan total proporsi tepat 100% sebelum menyimpan.`);
      return;
    }
    onCommitGroupAndUnits(
      workingGroup,
      workingUnits,
      `Pengaturan HC Awal Tahun (SOY) ${group.name} disimpan & tersinkronisasi otomatis ke ${workingUnits.length} Company Units.`,
    );
    setSoyEditMode(false);
    setSoySaved(true);
  };

  const handleSaveEoyChanges = () => {
    const totalPct = workingGroup.calibrationGrades.reduce((s, g) => s + parseGradePct(g.proporsi), 0);
    if (Math.abs(totalPct - 100) > 0.001) {
      toast.error(`Total proporsi Grade saat ini ${totalPct}%. Pastikan total proporsi tepat 100% sebelum menyimpan.`);
      return;
    }
    const nextGrp: CalibrationGroupSetting = {
      ...workingGroup,
      yearEndUpdatedAt: new Date().toISOString(),
      yearEndStatus: "edit",
    };
    onCommitGroupAndUnits(
      nextGrp,
      workingUnits,
      ` Perubahan HC Akhir Tahun (EOY) ${group.name} disimpan; baseline SOY tetap terjaga.`,
    );
    setEoyEditMode(false);
  };

  const handleConfirmGroupEoy = () => {
    const snapshots = loadSoyEmployeeSnapshot();
    const allManaged = loadManagedUsers();
    const archivedIds = new Set(loadArchivedUsers().map((a) => a.user.employeeId.toLowerCase()));
    const toArchive: ReturnType<typeof loadManagedUsers> = [];

    for (const u of memberUnits) {
      const canonName = canonicalizeCompanyUnitName(u.name);
      const snapList = snapshots[canonName] ?? [];
      const activeIds = new Set(
        allManaged
          .filter((emp) => canonicalizeCompanyUnitName(emp.company) === canonName && emp.status === "Active" && !isExcludedFromAppraisalCalibration(emp))
          .map((emp) => emp.employeeId.toLowerCase()),
      );
      const inactiveInUnit = allManaged.filter(
        (emp) => canonicalizeCompanyUnitName(emp.company) === canonName && emp.status !== "Active",
      );
      for (const cand of [...snapList.filter((emp) => !activeIds.has(emp.employeeId.toLowerCase())), ...inactiveInUnit]) {
        if (!archivedIds.has(cand.employeeId.toLowerCase()) && !toArchive.some((x) => x.employeeId === cand.employeeId)) {
          toArchive.push(cand);
        }
      }
    }
    const archivedCount = archiveUsers(toArchive, EOY_ARCHIVE_REASON, "eoy");
    const refreshedUnits = memberUnits.map((u) => {
      const dist = applyImportedEmployeesDistribution(u);
      const lockedSnapUnit = soyApproval?.groupSnapshot?.units?.find(
        (su) => su.id === u.id || canonicalizeCompanyUnitName(su.name) === canonicalizeCompanyUnitName(u.name),
      );
      const lockedBeginningHC = lockedSnapUnit
        ? Object.fromEntries(
            [...lockedSnapUnit.divisionProportions, ...lockedSnapUnit.departemenenProportions, ...lockedSnapUnit.bagianProportions].map(
              (r) => [r.id, r.hc],
            ),
          )
        : u.beginningHC ??
          Object.fromEntries(
            [...u.divisionProportions, ...u.departemenenProportions, ...u.bagianProportions].map((r) => [r.id, r.hc]),
          );
      return {
        ...dist,
        beginningGrades: lockedSnapUnit?.calibrationGrades ?? u.beginningGrades ?? u.calibrationGrades,
        beginningUnitQuotaTargets: lockedSnapUnit?.unitQuotaTargets ?? u.beginningUnitQuotaTargets ?? u.unitQuotaTargets,
        beginningHC: lockedBeginningHC,
        yearEndUpdatedAt: new Date().toISOString(),
        yearEndStatus: "submitted" as PageMode,
      };
    });
    const nextGrp: CalibrationGroupSetting = {
      ...group,
      beginningGrades: soyApproval?.groupSnapshot?.calibrationGrades ?? group.beginningGrades ?? group.calibrationGrades,
      beginningUnitCustomQuotas:
        soyApproval?.groupSnapshot?.unitCustomQuotas ?? group.beginningUnitCustomQuotas ?? group.unitCustomQuotas,
      yearEndUpdatedAt: new Date().toISOString(),
      yearEndStatus: "submitted",
    };
    onCommitGroupAndUnits(nextGrp, refreshedUnits);
    setShowEoyConfirmModal(false);
    setEoyPageMode("submitted");
    window.dispatchEvent(new Event("pa-employees-imported"));
    window.dispatchEvent(new Event("appraisal-updated"));
    toast.success(
      archivedCount > 0
        ? `HC Akhir Tahun (EOY) ${group.name} dikonfirmasi. ${archivedCount} karyawan diarsipkan (${EOY_ARCHIVE_REASON}) & seluruh Company Units diperbarui.`
        : `HC Akhir Tahun (EOY) ${group.name} dikonfirmasi & seluruh Company Units diperbarui.`,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {showSubmitModal && (
        <SubmitConfirmModal
          targetName={group.name}
          onCancel={() => setShowSubmitModal(false)}
          onConfirm={() => {
            setShowSubmitModal(false);
            onSubmitGroupSoy(group, memberUnits);
            setSoyPageMode("submitted");
          }}
        />
      )}
      {showEoyConfirmModal && (
        <ConfirmYearEndModal
          unitName={`${group.name} (${memberUnits.length} Unit Usaha)`}
          onCancel={() => setShowEoyConfirmModal(false)}
          onConfirm={handleConfirmGroupEoy}
        />
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Group
        </button>
      </div>

      {/* Group Header Card */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6 text-[#1A284F]" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-lg">{group.name}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{group.code}</span>
              <span className="text-xs text-gray-400">·</span>
              {memberUnits.map((u, uIdx) => (
                <span
                  key={u.id}
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${SOFT_TAG_PALETTE[uIdx % SOFT_TAG_PALETTE.length]}`}
                >
                  {u.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status Banner SOY */}
      {soyApproval?.status === "Approved" ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">
            HC Awal Tahun (SOY) &amp; Distribusi Proporsi Grade <strong>{group.name}</strong> sudah <strong>Approved</strong> oleh{" "}
            {soyApproval.decidedBy}
            {soyApproval.note ? <> — “{soyApproval.note}”</> : null}. Data seluruh Company Units telah terkunci otomatis.
          </p>
        </div>
      ) : soyApproval?.status === "Revision" ? (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-3">
          <RotateCcw className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800">
            <strong>Revisi diminta</strong> oleh {soyApproval.decidedBy}: {soyApproval.note || "-"}. Silakan sesuaikan pengaturan {group.name} lalu klik <strong>Submit</strong> kembali.
          </p>
        </div>
      ) : isSoyPending ? (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Calibration Setting (SOY) <strong>{group.name}</strong> sudah disubmit dan sedang menunggu persetujuan <strong>Director</strong>.
          </p>
        </div>
      ) : null}

      {/* Sub-Tabs: HC Awal Tahun (SOY) | HC Akhir Tahun (EOY) | Summary */}
      <Tabs.Root value={hcTab} onValueChange={(v) => setHcTab(v as "start" | "end" | "summary")} className="space-y-6">
        <Tabs.List aria-label="Pengaturan Headcount Group" className="flex flex-wrap gap-2 border-b border-gray-200 pb-2.5">
          {[
            { value: "start", label: "HC Awal Tahun (SOY)", icon: Users, idle: "bg-[#EBF2FA]/70 text-[#2F5597] border-[#C9DCF0]", active: "bg-[#2F5597] text-white border-[#2F5597] shadow-xs" },
            { value: "end", label: "HC Akhir Tahun (EOY)", icon: CheckCircle2, idle: "bg-[#E6F3F1]/70 text-[#1D6863] border-[#B8DDD8]", active: "bg-[#248277] text-white border-[#248277] shadow-xs" },
            { value: "summary", label: "Summary", icon: TrendingUp, idle: "bg-[#FDF3E7]/70 text-[#9A5B13] border-[#F3CFA4]", active: "bg-[#C07A28] text-white border-[#C07A28] shadow-xs" },
          ].map((t) => {
            const IconComp = t.icon;
            const isAct = hcTab === t.value;
            return (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                isAct ? t.active : `${t.idle} hover:opacity-90`
              }`}
            >
              <IconComp className="w-3.5 h-3.5" />
              {t.label}
            </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* TAB 1: HC AWAL TAHUN (SOY) */}
        <Tabs.Content value="start" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500">
              {isSoyApprovedLocked
                ? `HC Awal Tahun (SOY) ${group.name} telah disetujui Director dan terkunci sebagai baseline.`
                : `Setting HC Awal Tahun (SOY) ${group.name} — klik baris Unit Usaha pada tabel Proportion per Company Unit untuk membuka & menyesuaikan Division serta Departement.`}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(isSoyApprovedLocked || isSoyPending) && (
                <button
                  type="button"
                  disabled
                  title="Tombol Reset dinonaktifkan karena status HC Awal Tahun (SOY) sudah Submitted / Approved"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 bg-slate-100 text-slate-400 rounded-lg text-[11px] font-semibold cursor-not-allowed select-none"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset Status HC Awal Tahun (SOY)
                </button>
              )}
              {!isSoyApprovedLocked && !isSoyPending && effectiveSoyMode === "edit" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleRefreshEmployees("soy")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-200 bg-blue-50 text-[#1A284F] rounded-lg text-[11px] font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh Data Karyawan
                  </button>
                  {soyEditMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkingGroup(JSON.parse(JSON.stringify(group)));
                        setWorkingUnits(JSON.parse(JSON.stringify(memberUnits)));
                        setSoyEditMode(false);
                      }}
                      className="px-2.5 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  {soyEditMode ? (
                    <UiTooltip>
                      <UiTooltipTrigger asChild>
                        <span tabIndex={0} className="inline-flex">
                          <button
                            type="button"
                            disabled={!saveValidation.canSave}
                            onClick={saveValidation.canSave ? handleSaveSoyChanges : undefined}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs ${
                              saveValidation.canSave
                                ? "bg-[#1A284F] text-white hover:bg-[#131d3b] cursor-pointer"
                                : "bg-slate-200 text-slate-400 cursor-not-allowed"
                            }`}
                          >
                            <Save className="w-3 h-3" />
                            Save Changes
                          </button>
                        </span>
                      </UiTooltipTrigger>
                      {!saveValidation.canSave && (
                        <UiTooltipContent side="top" className="max-w-xs bg-[#1A284F] text-white text-[11px] px-3 py-2 rounded-lg shadow-lg z-[80]">
                          {saveValidation.tooltipText}
                        </UiTooltipContent>
                      )}
                    </UiTooltip>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const baseHc = memberUnits.reduce((sum, u) => sum + u.divisionProportions.reduce((s, d) => s + d.hc, 0), 0);
                        setEditBaselineTotalHC(baseHc);
                        setWorkingGroup(JSON.parse(JSON.stringify(group)));
                        setWorkingUnits(JSON.parse(JSON.stringify(memberUnits)));
                        setSoyEditMode(true);
                      }}
                      className="inline-flex items-center gap-1.5 bg-[#1A284F] text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-[#131d3b] transition-colors shadow-xs cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit Settings
                    </button>
                  )}
                  {!soyEditMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSoyPageMode("preview")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-[#1A284F] text-[#1A284F] rounded-lg text-[11px] font-medium hover:bg-[#1A284F]/5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        Preview
                      </button>
                      <button
                        type="button"
                        disabled={!canSubmitSoy}
                        onClick={canSubmitSoy ? () => setShowSubmitModal(true) : undefined}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs ${
                          canSubmitSoy
                            ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        Submit
                      </button>
                    </>
                  )}
                </>
              )}
              {!isSoyApprovedLocked && !isSoyPending && effectiveSoyMode === "preview" && (
                <>
                  <button
                    type="button"
                    onClick={() => setSoyPageMode("edit")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    Submit
                  </button>
                </>
              )}
            </div>
          </div>

          <GroupCalibrationPanel
            groupName={group.name}
            calibrationGrades={soyDisplayGrades}
            memberUnits={soyDisplayUnits}
            unitCustomQuotas={soyDisplayUnitCustomQuotas}
            editMode={!isSoyApprovedLocked && !isSoyPending && effectiveSoyMode === "edit" && soyEditMode}
            selectedUnitId={selectedSoyUnitId}
            onSelectUnitId={setSelectedSoyUnitId}
            onUpdateCalibrationGrade={handleUpdateGrade}
            onUpdateCompanyUnitQuota={handleUpdateCompanyUnitQuota}
            onAutoBalanceCompanyUnits={handleAutoBalanceCompanyUnits}
            onResetCompanyUnitQuotas={handleResetCompanyUnitQuotas}
            onUpdateUnitDivisionHC={handleUpdateUnitDivisionHC}
            onUpdateUnitDepartemenHC={handleUpdateUnitDepartemenHC}
            onUpdateUnitDivisionQuota={handleUpdateUnitDivisionQuota}
            onUpdateUnitDepartemenQuota={handleUpdateUnitDepartemenQuota}
            onAutoBalanceUnitLevel={handleAutoBalanceUnitLevel}
            onResetUnitLevelQuotas={handleResetUnitLevelQuotas}
          />
        </Tabs.Content>

        {/* TAB 2: HC AKHIR TAHUN (EOY) — cukup konfirmasi perubahan data di akhir tahun (tanpa approval) */}
        <Tabs.Content value="end" className="space-y-6">
          {!isSoyApprovedLocked && !soyApproval && memberUnits.every((u) => u.divisionProportions.length === 0) ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Lengkapi dan submit HC Awal Tahun (SOY) pada {group.name} terlebih dahulu sebelum mengonfirmasi HC Akhir Tahun (EOY).
            </p>
          ) : (
            <>
              {eoyPageMode === "submitted" && (
                <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-emerald-800 font-medium">
                      Data HC Akhir Tahun (EOY) <strong>{group.name}</strong> telah dikonfirmasi (tanpa perlu approval). Baseline HC Awal Tahun (SOY) tetap terjaga.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-500">
                  HC Akhir Tahun (EOY) · {group.name} — konfirmasi perubahan data karyawan di akhir tahun (baseline SOY tidak berubah).
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {eoyPageMode === "submitted" && (
                    <button
                      type="button"
                      onClick={handleCancelConfirmGroupEoy}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Cancel Confirm
                    </button>
                  )}
                  {eoyPageMode === "edit" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRefreshEmployees("eoy")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-blue-200 bg-blue-50 text-[#1A284F] rounded-lg text-[11px] font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Refresh Data Karyawan
                      </button>
                      {eoyEditMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setWorkingGroup(JSON.parse(JSON.stringify(group)));
                            setWorkingUnits(JSON.parse(JSON.stringify(memberUnits)));
                            setEoyEditMode(false);
                          }}
                          className="px-2.5 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      {eoyEditMode ? (
                        <UiTooltip>
                          <UiTooltipTrigger asChild>
                            <span tabIndex={0} className="inline-flex">
                              <button
                                type="button"
                                disabled={!saveValidation.canSave}
                                onClick={saveValidation.canSave ? handleSaveEoyChanges : undefined}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs ${
                                  saveValidation.canSave
                                    ? "bg-[#1A284F] text-white hover:bg-[#131d3b] cursor-pointer"
                                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                }`}
                              >
                                <Save className="w-3 h-3" />
                                Save Changes
                              </button>
                            </span>
                          </UiTooltipTrigger>
                          {!saveValidation.canSave && (
                            <UiTooltipContent side="top" className="max-w-xs bg-[#1A284F] text-white text-[11px] px-3 py-2 rounded-lg shadow-lg z-[80]">
                              {saveValidation.tooltipText}
                            </UiTooltipContent>
                          )}
                        </UiTooltip>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const baseHc = memberUnits.reduce((sum, u) => sum + u.divisionProportions.reduce((s, d) => s + d.hc, 0), 0);
                            setEditBaselineTotalHC(baseHc);
                            setWorkingGroup(JSON.parse(JSON.stringify(group)));
                            setWorkingUnits(JSON.parse(JSON.stringify(memberUnits)));
                            setEoyEditMode(true);
                          }}
                          className="inline-flex items-center gap-1.5 bg-[#1A284F] text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-[#131d3b] transition-colors shadow-xs cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit Settings
                        </button>
                      )}
                      {!eoyEditMode && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEoyPageMode("preview")}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-[#1A284F] text-[#1A284F] rounded-lg text-[11px] font-medium hover:bg-[#1A284F]/5 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowEoyConfirmModal(true)}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Confirm Data
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {eoyPageMode === "preview" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEoyPageMode("edit")}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-[11px] font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        Back to Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowEoyConfirmModal(true)}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors shadow-xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Confirm Data
                      </button>
                    </>
                  )}
                </div>
              </div>

              <GroupCalibrationPanel
                groupName={group.name}
                calibrationGrades={eoyEditMode ? workingGroup.calibrationGrades : group.calibrationGrades}
                memberUnits={eoyEditMode ? workingUnits : memberUnits}
                unitCustomQuotas={eoyEditMode ? workingGroup.unitCustomQuotas : group.unitCustomQuotas}
                editMode={eoyPageMode === "edit" && eoyEditMode}
                isConfirmedLocked={eoyPageMode === "submitted"}
                selectedUnitId={selectedEoyUnitId}
                onSelectUnitId={setSelectedEoyUnitId}
                onUpdateCalibrationGrade={handleUpdateGrade}
                onUpdateCompanyUnitQuota={handleUpdateCompanyUnitQuota}
                onAutoBalanceCompanyUnits={handleAutoBalanceCompanyUnits}
                onResetCompanyUnitQuotas={handleResetCompanyUnitQuotas}
                onUpdateUnitDivisionHC={handleUpdateUnitDivisionHC}
                onUpdateUnitDepartemenHC={handleUpdateUnitDepartemenHC}
                onUpdateUnitDivisionQuota={handleUpdateUnitDivisionQuota}
                onUpdateUnitDepartemenQuota={handleUpdateUnitDepartemenQuota}
                onAutoBalanceUnitLevel={handleAutoBalanceUnitLevel}
                onResetUnitLevelQuotas={handleResetUnitLevelQuotas}
              />
            </>
          )}
        </Tabs.Content>

        {/* TAB 3: SUMMARY (SOY vs EOY) */}
        <Tabs.Content value="summary">
          <GroupHeadcountSummary group={group} memberUnits={memberUnits} soyApproval={soyApproval} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
import { getMasterCompanyLocations, MASTER_COMPANY_UPDATED_EVENT } from "./settings/masterCompanyStore";
import { resolveGradeColorHex } from "../shared/scoringWeightStore";
