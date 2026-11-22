// @refresh reset
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  Save, Edit2, Building2, ChevronRight, ArrowLeft, Eye, Send,
  CheckCircle2, Clock, X, RefreshCw, Users, Archive, RotateCcw, Sparkles, AlertTriangle, TrendingUp, Percent,
} from "lucide-react";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Dot,
} from "recharts";
import { loadPersistedState, safeSetLocalRaw, savePersistedState } from "../../services/supabaseClient";
import { isExcludedFromAppraisalCalibration, loadManagedUsers, useAuthStore } from "../../store/authStore";
import { archiveUsers, EOY_ARCHIVE_REASON, loadArchivedUsers } from "../../store/archiveStore";
import {
  getSoyApproval,
  loadSoyEmployeeSnapshot,
  resetSoyApproval,
  SOY_EVENT,
  submitSoyForApproval,
  type SoyApprovalRecord,
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
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  beginningHC?: Record<string, number>;
  beginningGrades?: CalibrationGrade[];
  beginningCustomQuotas?: Record<string, Record<string, number>>;
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
  "C":  "#F97316",
  "D":  "#EF4444",
  "E":  "#991B1B",
};

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
  makeUnit("3", "PT Pulau Sambu (Jakarta)",    "PS-JKT",   "Jakarta"),
  makeUnit("4", "PT Pulau Sambu (Guntung)",    "PS-GTG",   "Guntung"),
  makeUnit("5", "PT Pulau Sambu (Kuala Enok)", "PS-KE",    "Kuala Enok"),
  makeUnit("6", "PT RSTM",                     "RSTM",     ""),
  makeUnit("7", "PT GHS",                      "GHS",      ""),
  makeUnit("8", "PT RSUP ASD",                 "RSUP-ASD", ""),
];

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
}): UnitQuotaAllocationResult {
  const { calibrationGrades, divisionProportions, departemenenProportions, bagianProportions } = params;
  const gradeIds = calibrationGrades.map((g) => g.id);
  const gradeWeights = calibrationGrades.map((g) => parseGradePct(g.proporsi));
  const totalPct = Math.round(gradeWeights.reduce((a, b) => a + b, 0) * 100) / 100;
  const totalHC = divisionProportions.reduce((s, d) => s + Math.max(0, d.hc), 0);

  const unitGradeTargets =
    Math.abs(totalPct - 100) < 0.001
      ? apportionLargestRemainder(totalHC, gradeWeights)
      : gradeWeights.map((w) => Math.round((totalHC * w) / 100));

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

function SingleBellCurveCard({
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
  editMode,
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
  editMode: boolean;
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
  onUpdateHC,
  onUpdateQuota,
  onAutoBalance,
  onResetQuotas,
  showParent,
  parentHeader,
  parentFooterLabel,
  primaryFooterLabel,
}: {
  title: string;
  subtitle: string;
  rows: PropRow[];
  totalHC: number;
  targetGradeTotals: number[];
  calibrationGrades: CalibrationGrade[];
  editMode: boolean;
  onUpdateHC: (id: string, val: number) => void;
  onUpdateQuota: (rowId: string, gradeId: string, val: number | null) => void;
  onAutoBalance: () => void;
  onResetQuotas: () => void;
  showParent?: boolean;
  parentHeader?: string;
  parentFooterLabel?: string;
  primaryFooterLabel: string;
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
        {editMode && (hasAnyCustomQuota || hasRowMismatch || hasColMismatch) && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAutoBalance}
              title="Kunci nilai kuota yang sudah Anda ubah manual, lalu seimbangkan otomatis sisa grade & baris lain agar kembali sesuai HC dan kurva normal"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Balance Sisa Kuota
            </button>
            {hasAnyCustomQuota && (
              <button
                type="button"
                onClick={onResetQuotas}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
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
                {title.replace("Proportion per ", "").toUpperCase()}
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
            {rows.map((row) => {
              const rowTotal = row.calcs.reduce((s, v) => s + v, 0);
              const rowDiff = rowTotal - row.hc;
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  {showParent && (
                    <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">
                      {row.parentLabel ?? "—"}
                    </td>
                  )}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900 font-medium">
                    {row.label}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center">
                    {editMode ? (
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

function CalibrationSummaryComparison({ unit }: { unit: CompanyUnit }) {
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
  });

  const eoyAlloc = computeUnitQuotaAllocation({
    calibrationGrades: unit.calibrationGrades,
    divisionProportions: unit.divisionProportions,
    departemenenProportions: unit.departemenenProportions,
    bagianProportions: unit.bagianProportions,
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
                <option value="bagian">Bagian</option>
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

function HeadcountSummary({ unit }: { unit: CompanyUnit }) {
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
        <CalibrationSummaryComparison unit={unit} />
      </div>
    </section>
  );
}

// ─── Year-End (EOY) Calibration Settings ──────────────────────────────────────

function YearEndCalibrationSettings({
  unit,
  onUpdate,
}: {
  unit: CompanyUnit;
  onUpdate: (unit: CompanyUnit) => void;
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
        Lengkapi dan simpan HC Awal Tahun (SOY) terlebih dahulu sebelum mengatur HC Akhir Tahun (EOY).
      </p>
    );
  }

  return (
    <>
      <p className="text-sm font-medium text-gray-500">
        HC Akhir Tahun (EOY) · 2026 — format tabel dan alur sama dengan HC Awal Tahun (SOY). Baseline awal tidak berubah.
      </p>
      <UnitDetail
        unit={draft}
        onBack={() => {}}
        onUpdate={setDraft}
        pageMode={mode}
        setPageMode={setMode}
        onShowConfirm={() => setConfirm(true)}
        embedded
        submitLabel="Confirm Data"
        onSave={(committed) => persist("edit", committed)}
      />
      {confirm && (
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
  const isSoyApprovedLocked = Boolean(!embedded && soyApproval?.status === "Approved" && soyApproval.snapshot);
  const isEditable = pageMode === "edit" && editMode && !activeUnit.beginningHC && !isSoyApprovedLocked;
  const canSubmit = isSaved || pageMode === "preview";

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
          <div>
            <p className="font-bold text-gray-900">{unit.name}</p>
            <p className="text-sm text-gray-500">
              {unit.industry}
              {unit.industry ? " · " : ""}
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{unit.code}</span>
            </p>
          </div>
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
          <Tabs.List aria-label="Pengaturan Headcount" className="flex flex-wrap gap-1 border-b border-gray-200">
            {[
              ["start", "HC Awal Tahun (SOY)"],
              ["end", "HC Akhir Tahun (EOY)"],
              ["summary", "Summary"],
            ].map(([value, label]) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="border-b-2 border-transparent px-5 py-3 text-sm font-medium text-gray-500 transition-colors hover:text-[#1A284F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 data-[state=active]:border-[#1A284F] data-[state=active]:text-[#1A284F]"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        )}

        <Tabs.Content value="start" className="space-y-6">
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

          {!embedded && (
            <p className="text-sm font-medium text-gray-500">
              {isSoyApprovedLocked || unit.beginningHC
                ? "HC Awal Tahun (SOY) — baseline tersimpan dan read-only; perubahan HC akhir tidak menimpa data ini."
                : "Setting HC Awal Tahun (SOY) — klik Edit Settings untuk menyesuaikan proporsi grade maupun kuota per Divisi, Departemen, dan Bagian."}
            </p>
          )}

          <CalibrationPanel
            calibrationGrades={displayCalibrationGrades}
            divisionProportions={displayDivisions}
            departemenenProportions={displayDepts}
            bagianProportions={displayBagian}
            editMode={isEditable}
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
            <YearEndCalibrationSettings unit={unit} onUpdate={onUpdate} />
          </Tabs.Content>
        )}
        {!embedded && (
          <Tabs.Content value="summary">
            <HeadcountSummary unit={unit} />
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
  onConfirm,
  onCancel,
}: {
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
              <h3 className="font-bold text-gray-900">Submit Calibration Setting (SOY)</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                HC Awal Tahun (SOY) &amp; Distribusi Proporsi Grade dikirim ke Approval Calibration — Setting (SOY)
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Once submitted, you will not be able to edit the calibration settings until the approval is completed.
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

export function CalibrationSetting() {
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(() => {
    try {
      const saved =
        localStorage.getItem("calibration_hc_settings_2026") ??
        localStorage.getItem("calibration_submitted_units");
      const base: CompanyUnit[] = saved ? JSON.parse(saved) : defaultCompanyUnits;
      const needsInitialSoyReset = !localStorage.getItem("pa_cal_soy_reset_2026_v1");
      const normalized = base.map((u) => {
        const clean = needsInitialSoyReset
          ? {
              ...u,
              beginningHC: undefined,
              beginningGrades: undefined,
              beginningCustomQuotas: undefined,
              yearEndStatus: undefined,
              yearEndUpdatedAt: undefined,
            }
          : u;
        return applyImportedEmployeesDistribution(clean);
      });
      if (needsInitialSoyReset) {
        safeSetLocalRaw("pa_cal_soy_reset_2026_v1", "1");
        localStorage.removeItem("calibration_submitted_units");
        localStorage.removeItem("calibration_submitted_at");
        resetSoyApproval();
        savePersistedState("calibration_hc_settings_2026", normalized);
      }
      return normalized;
    } catch {
      return defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u));
    }
  });
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>("edit");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const onHydrated = () => {
      const saved =
        loadPersistedState<CompanyUnit[] | null>("calibration_hc_settings_2026", null) ??
        loadPersistedState<CompanyUnit[] | null>("calibration_submitted_units", null);
      if (Array.isArray(saved) && saved.length > 0) {
        setCompanyUnits(saved.map((u) => applyImportedEmployeesDistribution(u)));
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

  const updateUnit = (updated: CompanyUnit) => {
    const next = companyUnits.map((unit) => (unit.id === updated.id ? updated : unit));
    try {
      savePersistedState("calibration_hc_settings_2026", next, {
        kind: "calibration-setting",
        unitId: updated.id,
        unitName: updated.name,
        data: updated,
        audit: {
          action: "Update",
          module: "Performance Appraisal",
          subModule: "Calibration Setting",
          description: `Updated Calibration HC & Grade setting for ${updated.name}`,
        },
      });
      if (localStorage.getItem("calibration_submitted_units")) {
        savePersistedState("calibration_submitted_units", next);
      }
      setCompanyUnits(next);
    } catch {
      toast.error("Pengaturan HC gagal disimpan. Periksa penyimpanan browser.");
    }
  };

  const [soyTick, setSoyTick] = useState(0);
  useEffect(() => {
    const refresh = () => setSoyTick((t) => t + 1);
    window.addEventListener(SOY_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener(SOY_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);
  void soyTick;

  const handleSubmitConfirm = () => {
    setShowConfirm(false);
    const unitToSubmit = selectedUnit
      ? companyUnits.find((u) => u.id === selectedUnit.id) ?? selectedUnit
      : null;
    if (unitToSubmit) {
      submitSoyForApproval(unitToSubmit);
      toast.success(
        `Calibration Setting (SOY) ${unitToSubmit.name} dikirim ke Approval Calibration — Setting (SOY).`,
      );
    }
    setPageMode("submitted");
    setSelectedUnit(null);
    try {
      const submittedAt = new Date().toISOString();
      savePersistedState("calibration_submitted_units", companyUnits, {
        kind: "calibration-setting",
        unitId: selectedUnit?.id ?? "all",
        unitName: selectedUnit?.name ?? "All Units",
        data: { submittedAt, units: companyUnits },
        audit: {
          action: "Create",
          module: "Performance Appraisal",
          subModule: "Calibration Setting",
          description: `Submitted Calibration Setting (${selectedUnit?.name ?? "All Units"}) for Approval Management`,
        },
      });
      savePersistedState("calibration_submitted_at", submittedAt);
    } catch {
      // ignore
    }
  };

  if (selectedUnit) {
    const liveUnit = companyUnits.find((u) => u.id === selectedUnit.id) ?? selectedUnit;
    const soyApproval = getSoyApproval(liveUnit.id);
    const effectiveMode: PageMode = soyApproval
      ? soyApproval.status === "Revision"
        ? pageMode === "submitted"
          ? "edit"
          : pageMode
        : "submitted"
      : pageMode === "submitted"
      ? "edit"
      : pageMode;

    return (
      <>
        {showConfirm && (
          <SubmitConfirmModal
            onConfirm={handleSubmitConfirm}
            onCancel={() => setShowConfirm(false)}
          />
        )}
        <div className="w-full flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
            <p className="text-sm text-gray-500">
              Configure performance calibration settings by company unit
            </p>
          </div>
          <UnitDetail
            unit={liveUnit}
            onBack={() => setSelectedUnit(null)}
            onUpdate={updateUnit}
            pageMode={effectiveMode}
            setPageMode={setPageMode}
            onShowConfirm={() => setShowConfirm(true)}
            soyApproval={soyApproval}
            onResetSoy={() => {
              resetSoyApproval(liveUnit.id);
              const resetUnit: CompanyUnit = {
                ...liveUnit,
                beginningHC: undefined,
                beginningGrades: undefined,
                beginningCustomQuotas: undefined,
                yearEndStatus: undefined,
                yearEndUpdatedAt: undefined,
              };
              updateUnit(resetUnit);
              setPageMode("edit");
              toast.success(
                `Status HC Awal Tahun (SOY) ${liveUnit.name} berhasil di-reset dan siap di-submit ulang.`,
              );
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showConfirm && (
        <SubmitConfirmModal
          onConfirm={handleSubmitConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
          <p className="text-sm text-gray-500">
            Configure performance calibration settings by company unit
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            {pageMode === "edit"
              ? "Select a company unit to configure its Calibration settings."
              : "Select a company unit to review its Calibration settings."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(authLockedUnits && authLockedUnits.length > 0
              ? companyUnits.filter((u) => authLockedUnits.includes(u.name))
              : companyUnits
            ).map((unit, idx) => {
              const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];
              const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
              const soyRec = getSoyApproval(unit.id);
              const unitHc =
                soyRec?.status === "Approved" && soyRec.snapshot
                  ? soyRec.snapshot.divisionProportions.reduce((s, d) => s + d.hc, 0)
                  : unit.divisionProportions.reduce((s, d) => s + d.hc, 0);
              return (
                <button
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
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
                        {unit.code}{unit.industry ? ` · ${unit.industry}` : ""}
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
      </div>
    </>
  );
}
