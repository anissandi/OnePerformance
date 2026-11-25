import { resolveGradeForScore } from "../pages/shared/scoringWeightStore";
import { TrendingUp, Lightbulb, ClipboardList, Briefcase, FolderKanban, MessageSquare } from "lucide-react";
import React from "react";
import {
  getActiveUser,
  isExcludedFromAppraisalCalibration,
  loadManagedUsers,
  resolveEffectiveUserGrouping,
  resolveUserAllowedModules,
  type ManagedUser,
} from "../store/authStore";
import { ARCHIVE_UPDATED_EVENT, loadArchivedUsers } from "../store/archiveStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { dateToSortableKey, normalizeDateDDMMYYYY } from "../utils/dateFormat";
import { loadUnitScoreWeights, weightColumnFromGrouping } from "../pages/shared/scoringWeightStore";
import { loadAppraisalSelf, loadAllAppraisalApprovers } from "../pages/shared/appraisalFormStore";
import { loadMSSelfRatings, loadAllMSApprovers } from "../pages/shared/msStore";
import { loadAllIcfProjectsByEmployee } from "../store/projectStore";
import { evaluateEmployeeKPITracking } from "../pages/employee/KPIPage";
import { getPenilai1ScoreAsPercent } from "../pages/supervisor/managementInterviewScoreStore";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScoreGrade { score: number; grade: string; weightedScore?: number; weightPct?: number; }
export interface ModuleScore { name: string; icon: React.ReactNode; score: number; grade: string; weight: number; }
export interface Employee {
  id: string; fullName: string; position: string; department: string;
  departmentId?: string; sectionId?: string; section?: string;
  division: string; companyUnit: string; joined: string; tenure: string;
  approvalCompleteDate: string; totalScore: number; grade: string;
  modules: ModuleScore[];
  kpi: ScoreGrade; smartGoals: ScoreGrade; formA: ScoreGrade; formB: ScoreGrade; formC: ScoreGrade;
  project: ScoreGrade; managerialSkill: ScoreGrade | null; managementInterview: ScoreGrade | null;
  kpiIsYtd?: boolean;
  kpiTrackedMonths?: number;
  kpiFullyValidated?: boolean;
  isCalibrationReady?: boolean;
}
export interface CalibrationTarget { grade: string; target: number; color: string; }

// ── Grade colours ──────────────────────────────────────────────────────────────
export const GRADE_COLORS: Record<string, string> = {
  "A+": "#7C3AED", "A": "#2563EB", "B": "#10B981",
  "C":  "#F59E0B", "D": "#F97316", "E": "#EF4444",
};

export const GRADE_ORDER = ["A+", "A", "B", "C", "D", "E"];

const GRADE_HEX: Record<string, string> = { "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B" };
export function gradeFromScore(n: number, companyName?: string): { grade: string; color: string } {
  const grade = resolveGradeForScore(n, companyName);
  return { grade, color: GRADE_HEX[grade] ?? "#6B7280" };
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "A+": return "bg-purple-100 text-purple-700";
    case "A":  return "bg-emerald-100 text-emerald-700";
    case "B":  return "bg-blue-100 text-blue-700";
    case "C":  return "bg-yellow-100 text-yellow-700";
    case "D":  return "bg-orange-100 text-orange-700";
    case "E":  return "bg-red-100 text-red-700";
    default:   return "bg-gray-100 text-gray-600";
  }
}

// ── Calibration targets ────────────────────────────────────────────────────────
export const DEFAULT_CALIBRATION_GRADES = [
  { grade: "A+", target: 5  },
  { grade: "A",  target: 15 },
  { grade: "B",  target: 40 },
  { grade: "C",  target: 25 },
  { grade: "D",  target: 10 },
  { grade: "E",  target: 5  },
];

export function readCalibrationTargets(companyUnitFilter: string): CalibrationTarget[] {
  try {
    const raw = localStorage.getItem("calibration_submitted_units") ?? localStorage.getItem("calibration_hc_settings_2026");
    if (!raw) return DEFAULT_CALIBRATION_GRADES.map(g => ({ ...g, color: GRADE_COLORS[g.grade] ?? "#6B7280" }));

    const units: Array<{
      name: string;
      calibrationGrades: Array<{ grade: string; proporsi: string }>;
      divisionProportions: Array<{ hc: number }>;
    }> = JSON.parse(raw);

    if (!units?.length) return DEFAULT_CALIBRATION_GRADES.map(g => ({ ...g, color: GRADE_COLORS[g.grade] ?? "#6B7280" }));

    const relevant = companyUnitFilter === "All Units"
      ? units
      : units.filter(u => u.name === companyUnitFilter);

    if (!relevant.length) return DEFAULT_CALIBRATION_GRADES.map(g => ({ ...g, color: GRADE_COLORS[g.grade] ?? "#6B7280" }));

    let totalWeight = 0;
    const gradeWeights: Record<string, number> = {};
    for (const unit of relevant) {
      const unitHC = unit.divisionProportions.reduce((s, d) => s + (d.hc ?? 0), 0);
      const w = unitHC > 0 ? unitHC : 1;
      totalWeight += w;
      for (const cg of unit.calibrationGrades) {
        const pct = parseFloat(cg.proporsi) || 0;
        gradeWeights[cg.grade] = (gradeWeights[cg.grade] ?? 0) + pct * w;
      }
    }

    return DEFAULT_CALIBRATION_GRADES.map(dg => ({
      grade: dg.grade,
      target: totalWeight > 0 ? Math.round((gradeWeights[dg.grade] ?? 0) / totalWeight) : dg.target,
      color: GRADE_COLORS[dg.grade] ?? "#6B7280",
    }));
  } catch {
    return DEFAULT_CALIBRATION_GRADES.map(g => ({ ...g, color: GRADE_COLORS[g.grade] ?? "#6B7280" }));
  }
}

export const MI_EMPLOYEE_STORE_MAP: Record<string, string> = {};

function averageNumbers(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10) / 10;
}

function buildSingleEmployeeRecord(
  u: ManagedUser,
  ctx: {
    workflowsByNormId: Map<string, ReturnType<typeof loadWorkflowRecords>>;
    projectByEmp: ReturnType<typeof loadAllIcfProjectsByEmployee>;
    calAdjScores: Record<string, Record<string, number>>;
    unitWeightsCache: Map<string, ReturnType<typeof loadUnitScoreWeights>>;
  },
): Employee {
  const normId = normalizeEmployeeId(u.employeeId);
  const empWorkflows = ctx.workflowsByNormId.get(normId) ?? [];

  const extractAssessmentScore = (modName: string): number => {
    const rec = empWorkflows.find((w) => w.module === modName && w.phase === "measurement");
    if (!rec) return 0;
    const a2 = Object.values(rec.assessments.approver2?.ratings ?? {});
    const a1 = Object.values(rec.assessments.approver1?.ratings ?? {});
    const vals = a2.length > 0 ? a2 : a1;
    if (vals.length === 0) return 0;
    if (modName === "Appraisal Form") {
      const ratingMap =
        Object.keys(rec.assessments.approver2?.ratings ?? {}).length > 0
          ? rec.assessments.approver2!.ratings
          : (rec.assessments.approver1?.ratings ?? {});
      const avgForm = (prefix: "A" | "B" | "C") => {
        const entries = Object.entries(ratingMap)
          .filter(([k]) => k.startsWith(`${prefix}-`) || k.startsWith(`${prefix}__`))
          .map(([, v]) => Number(v));
        return entries.length > 0 ? entries.reduce((s, n) => s + n, 0) / entries.length : 0;
      };
      const weighted5 = avgForm("A") * 0.6 + avgForm("B") * 0.25 + avgForm("C") * 0.15;
      return weighted5 > 0 ? Math.round((weighted5 / 5) * 100) : 0;
    }
    const avg = averageNumbers(vals);
    return avg <= 5 ? Math.round((avg / 5) * 100) : Math.round(avg);
  };

  let kpiScore = extractAssessmentScore("KPI");
  const sgScore = extractAssessmentScore("SMART Goals");
  let afScore = extractAssessmentScore("Appraisal Form");
  let msScore = 0;
  let miScore = extractAssessmentScore("Management Interview");
  if (miScore === 0) {
    const liveMiPct = getPenilai1ScoreAsPercent(u.employeeId, u.name);
    if (liveMiPct !== null && liveMiPct > 0) {
      miScore = parseFloat(liveMiPct.toFixed(2));
    }
  }

  const evalKpi = evaluateEmployeeKPITracking(u.employeeId);
  const wfKpiMeas = empWorkflows.find((w) => w.module === "KPI" && w.phase === "measurement");
  const kpiMeasValidated = Boolean(
    wfKpiMeas &&
      (wfKpiMeas.decisions.validator?.status === "Validated" ||
        wfKpiMeas.decisions.approver2?.status === "Validated"),
  );
  const kpiFullyValidated = evalKpi.isFullYearMonthsComplete && kpiMeasValidated;
  if (evalKpi.ytdScore > 0) {
    kpiScore = Math.round(evalKpi.ytdScore);
  }
  const kpiIsYtd = kpiScore > 0 && !kpiFullyValidated;

  if (afScore === 0) {
    const afApprovers = loadAllAppraisalApprovers(u.employeeId);
    const afSelf = loadAppraisalSelf(u.employeeId);
    const computeWeightedAfPct = (forms: Array<{ formId: string; avgScore: number }>) => {
      const getAvg = (id: string) => forms.find((f) => f.formId === id)?.avgScore ?? 0;
      const weighted5 = getAvg("A") * 0.6 + getAvg("B") * 0.25 + getAvg("C") * 0.15;
      return weighted5 > 0 ? Math.round((weighted5 / 5) * 100) : 0;
    };
    if (afApprovers.length > 0) {
      const latest = afApprovers[afApprovers.length - 1];
      afScore = computeWeightedAfPct(latest.forms);
    } else if (afSelf && afSelf.submitted && afSelf.forms.length > 0) {
      afScore = computeWeightedAfPct(afSelf.forms);
    }
  }
  {
    const wfMs = empWorkflows.find((w) => w.module === "Managerial Skill" && w.phase === "measurement");
    const msApprovers = loadAllMSApprovers(u.employeeId);
    const msSelf = loadMSSelfRatings(u.employeeId);
    const avgFromMap = (map?: Record<string | number, number> | null): number | null => {
      if (!map) return null;
      const vals = Object.values(map).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      return vals.length > 0 ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
    };
    const selfAvg5 = msSelf && !msSelf.isDraft ? avgFromMap(msSelf.ratings) : null;
    const ap1Entry = msApprovers.find((e) => e.approverLevel === 1);
    const ap2Entry = msApprovers.find((e) => e.approverLevel === 2);
    const ap1Avg5 = avgFromMap(wfMs?.assessments.approver1?.ratings) ?? avgFromMap(ap1Entry?.ratings);
    const sameAp1Ap2 = Boolean(
      u.regNoAp1 && u.regNoAp2 && String(u.regNoAp1).trim().toLowerCase() === String(u.regNoAp2).trim().toLowerCase(),
    );
    const ap2Avg5 =
      avgFromMap(wfMs?.assessments.approver2?.ratings) ??
      avgFromMap(ap2Entry?.ratings) ??
      (sameAp1Ap2 ? ap1Avg5 : null);
    const activeEvaluatorAvgs = [selfAvg5, ap1Avg5, ap2Avg5].filter((v): v is number => v != null && v > 0);
    if (activeEvaluatorAvgs.length > 0) {
      const mean3 = activeEvaluatorAvgs.reduce((s, v) => s + v, 0) / activeEvaluatorAvgs.length;
      msScore = parseFloat(((mean3 / 5) * 100).toFixed(2));
    }
  }

  const prjRows = ctx.projectByEmp[normId]?.rows ?? ctx.projectByEmp[u.employeeId]?.rows ?? [];
  const prjScore = prjRows.length > 0 ? Math.max(...prjRows.map((r) => Number(r.finalScore ?? 0))) : 0;

  const grouping = resolveEffectiveUserGrouping(u);
  const allowedMods = resolveUserAllowedModules(u);
  const hasManagerial = allowedMods.includes("Managerial Skill");
  const hasInterview = allowedMods.includes("Management Interview") || miScore > 0;

  const isTwoStepDone = (modName: string): boolean => {
    const rec = empWorkflows.find((w) => w.module === modName && w.phase === "measurement");
    if (!rec) return false;
    const a2 = rec.decisions.approver2?.status ?? "";
    const a1 = rec.decisions.approver1?.status ?? "";
    return (
      a2 === "Approved" ||
      a2 === "Validated" ||
      a2.startsWith("Assessed") ||
      (!u.regNoAp2 && (a1 === "Approved" || a1.startsWith("Assessed")))
    );
  };
  const wfSgMeas = empWorkflows.find((w) => w.module === "SMART Goals" && w.phase === "measurement");
  const sgFullyValidated = Boolean(
    wfSgMeas &&
      (wfSgMeas.decisions.validator?.status === "Validated" ||
        wfSgMeas.decisions.approver2?.status === "Validated"),
  );
  const isCalibrationReady =
    (!allowedMods.includes("KPI (Setting/Measurement)") || kpiFullyValidated) &&
    (!allowedMods.includes("SMART Goals (Setting/Measurement)") || sgFullyValidated) &&
    (!allowedMods.includes("Appraisals Form") || isTwoStepDone("Appraisal Form")) &&
    (!allowedMods.includes("Project Outside Job Scope") || isTwoStepDone("Project")) &&
    (!allowedMods.includes("Managerial Skill") || isTwoStepDone("Managerial Skill"));

  let unitWeights = ctx.unitWeightsCache.get(u.company);
  if (!unitWeights) {
    unitWeights = loadUnitScoreWeights(u.company);
    ctx.unitWeightsCache.set(u.company, unitWeights);
  }
  const weightCol = weightColumnFromGrouping(grouping, u.company);
  const parseWeightPct = (indikator: string, fallback: number): number => {
    const raw = unitWeights![indikator]?.[weightCol];
    if (!raw || raw === "-") return 0;
    const num = parseFloat(String(raw).replace("%", "").trim());
    return Number.isFinite(num) ? num / 100 : fallback;
  };

  const wKpi = allowedMods.includes("KPI (Setting/Measurement)") ? parseWeightPct("KPI", 0.5) : 0;
  const wSg = allowedMods.includes("SMART Goals (Setting/Measurement)") ? parseWeightPct("SMART Goals", 0.2) : 0;
  const wAf = allowedMods.includes("Appraisals Form") ? parseWeightPct("Appraisal Form", 0.15) : 0;
  const wPrj = allowedMods.includes("Project Outside Job Scope") ? parseWeightPct("Project Outside Job Scope", 0.15) : 0;
  const wMs = hasManagerial ? parseWeightPct("Managerial Skill", 0.15) : 0;
  const configuredMiWeight = parseWeightPct("Management Interview", 0.1);
  const wMi = hasInterview ? (configuredMiWeight > 0 ? configuredMiWeight : 0.1) : 0;
  const miWeightedScore = parseFloat((miScore * wMi).toFixed(2));

  const adjOverride = ctx.calAdjScores[u.employeeId]?.total ?? ctx.calAdjScores[normId]?.total;
  const computedScore = parseFloat(
    (
      kpiScore * wKpi +
      sgScore * wSg +
      afScore * wAf +
      prjScore * wPrj +
      msScore * wMs +
      miScore * wMi
    ).toFixed(1),
  );
  const totalScore = typeof adjOverride === "number" && adjOverride > 0 ? adjOverride : computedScore;
  const grade = totalScore > 0 ? gradeFromScore(totalScore, u.company).grade : "N/A";

  const joinYear = u.joinDate ? parseInt(u.joinDate.slice(0, 4), 10) : 2026;
  const tenureYrs = Math.max(0, 2026 - (Number.isFinite(joinYear) ? joinYear : 2026));

  const modules: ModuleScore[] = [
    { name: "KPI", icon: React.createElement(TrendingUp, { className: "w-4 h-4" }), score: kpiScore, grade: kpiScore > 0 ? gradeFromScore(kpiScore, u.company).grade : "—", weight: Math.round(wKpi * 100) },
    { name: "SMART Goals", icon: React.createElement(Lightbulb, { className: "w-4 h-4" }), score: sgScore, grade: sgScore > 0 ? gradeFromScore(sgScore, u.company).grade : "—", weight: Math.round(wSg * 100) },
    { name: "Appraisal Form (A)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—", weight: Math.round((wAf * 100) / 3) },
    { name: "Appraisal Form (B)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—", weight: Math.round((wAf * 100) / 3) },
    { name: "Appraisal Form (C)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—", weight: Math.round((wAf * 100) / 3) },
    { name: "Project Outside Job Scope", icon: React.createElement(FolderKanban, { className: "w-4 h-4" }), score: prjScore, grade: prjScore > 0 ? gradeFromScore(prjScore, u.company).grade : "—", weight: Math.round(wPrj * 100) },
    ...(hasManagerial ? [{ name: "Managerial Skill", icon: React.createElement(Briefcase, { className: "w-4 h-4" }), score: msScore, grade: msScore > 0 ? gradeFromScore(msScore, u.company).grade : "—", weight: Math.round(wMs * 100) }] : []),
    ...(hasInterview ? [{ name: "Management Interview", icon: React.createElement(MessageSquare, { className: "w-4 h-4" }), score: miScore, grade: miScore > 0 ? gradeFromScore(miScore, u.company).grade : "—", weight: Math.round(wMi * 100) }] : []),
  ];

  const latestWorkflowDate = empWorkflows
    .flatMap((w) => [
      w.decisions.validator?.date,
      w.decisions.approver2?.date,
      w.decisions.approver1?.date,
      w.decisions.checker?.date,
      w.submittedDate,
    ])
    .filter((d): d is string => Boolean(d && d !== "-" && d !== "—"))
    .sort((a, b) => dateToSortableKey(a).localeCompare(dateToSortableKey(b)))
    .pop();
  const prjDate = ctx.projectByEmp[normId]?.submittedDate || ctx.projectByEmp[u.employeeId]?.submittedDate;

  return {
    id: u.employeeId,
    fullName: u.name,
    position: u.position,
    department: u.department,
    section: u.bagian || "",
    division: u.division,
    companyUnit: u.company,
    joined: normalizeDateDDMMYYYY(u.joinDate),
    tenure: `${tenureYrs} Tahun`,
    approvalCompleteDate: normalizeDateDDMMYYYY(latestWorkflowDate || prjDate),
    totalScore,
    grade,
    modules,
    kpi: { score: kpiScore, grade: kpiScore > 0 ? gradeFromScore(kpiScore, u.company).grade : "—" },
    smartGoals: { score: sgScore, grade: sgScore > 0 ? gradeFromScore(sgScore, u.company).grade : "—" },
    formA: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—" },
    formB: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—" },
    formC: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore, u.company).grade : "—" },
    project: { score: prjScore, grade: prjScore > 0 ? gradeFromScore(prjScore, u.company).grade : "—" },
    managerialSkill: hasManagerial ? { score: msScore, grade: msScore > 0 ? gradeFromScore(msScore, u.company).grade : "—" } : null,
    managementInterview: hasInterview
      ? {
          score: miScore,
          grade: miScore > 0 ? gradeFromScore(miScore, u.company).grade : "—",
          weightedScore: miScore > 0 ? miWeightedScore : undefined,
          weightPct: Math.round(wMi * 100),
        }
      : null,
    kpiIsYtd,
    kpiTrackedMonths: evalKpi.trackedMonthsCount,
    kpiFullyValidated,
    isCalibrationReady,
  };
}

let _cachedEmployees: Employee[] | null = null;
let _cachedEmployeesAt = 0;
if (typeof window !== "undefined") {
  const invalidateEmpCache = () => {
    _cachedEmployees = null;
  };
  window.addEventListener("appraisal-updated", invalidateEmpCache);
  window.addEventListener("pa-auth-updated", invalidateEmpCache);
  window.addEventListener("pa-db-hydrated", invalidateEmpCache);
  window.addEventListener("pa-employees-imported", invalidateEmpCache);
  window.addEventListener(ARCHIVE_UPDATED_EVENT, invalidateEmpCache);
  window.addEventListener("pa-score-weights-updated", invalidateEmpCache);
  window.addEventListener("pa-access-updated", invalidateEmpCache);
  window.addEventListener("storage", invalidateEmpCache);
}

/**
 * O(1) evaluasi khusus 1 karyawan (mis. untuk `/dashboard/my`), tanpa perlu menghitung seluruh karyawan perusahaan.
 */
export function getLiveTransactionalEmployeeById(employeeId?: string): Employee | null {
  try {
    const targetId = (employeeId ?? getActiveUser().employeeId).trim();
    if (!targetId) return null;
    const normTarget = normalizeEmployeeId(targetId);
    const targetLower = targetId.toLowerCase();
    const u = loadManagedUsers().find(
      (x) =>
        x.status === "Active" &&
        (x.employeeId.trim().toLowerCase() === targetLower || normalizeEmployeeId(x.employeeId) === normTarget),
    );
    if (!u || isExcludedFromAppraisalCalibration(u)) return null;
    const archivedList = loadArchivedUsers();
    if (
      archivedList.some(
        (a) =>
          a.user.employeeId.trim().toLowerCase() === targetLower ||
          normalizeEmployeeId(a.user.employeeId) === normTarget,
      )
    ) {
      return null;
    }
    const empWorkflows = loadWorkflowRecords().filter(
      (w) => w.employeeId === normTarget || w.employeeId.toLowerCase() === targetLower,
    );
    const workflowsByNormId = new Map<string, ReturnType<typeof loadWorkflowRecords>>([[normTarget, empWorkflows]]);
    const projectByEmp = loadAllIcfProjectsByEmployee();
    let calAdjScores: Record<string, Record<string, number>> = {};
    try {
      calAdjScores = JSON.parse(localStorage.getItem("pa_calibration_adj_scores_v1") ?? "{}");
    } catch {
      calAdjScores = {};
    }
    const unitWeightsCache = new Map<string, ReturnType<typeof loadUnitScoreWeights>>();
    return buildSingleEmployeeRecord(u, {
      workflowsByNormId,
      projectByEmp,
      calAdjScores,
      unitWeightsCache,
    });
  } catch {
    return null;
  }
}

/**
 * Membangun daftar Employee murni dari data karyawan yang diimpor (`loadManagedUsers()`)
 * dan skor transaksi nyata yang ada di dalam sistem (`loadWorkflowRecords()`, `pa_project_icf_by_emp_v1`, dll.).
 */
export function getLiveTransactionalEmployees(): Employee[] {
  if (_cachedEmployees && Date.now() - _cachedEmployeesAt < 1500) {
    return _cachedEmployees;
  }
  try {
    const archivedNormSet = new Set(
      loadArchivedUsers().flatMap((a) => [
        a.user.employeeId.trim().toLowerCase(),
        normalizeEmployeeId(a.user.employeeId).toLowerCase(),
      ]),
    );
    // Role Director & BOD tidak masuk dalam penilaian kinerja reguler (headcount, grade distribution, calibration adjustment, dll.)
    const users = loadManagedUsers().filter(
      (u) =>
        u.status === "Active" &&
        !isExcludedFromAppraisalCalibration(u) &&
        !archivedNormSet.has(u.employeeId.trim().toLowerCase()) &&
        !archivedNormSet.has(normalizeEmployeeId(u.employeeId).toLowerCase()),
    );
    const workflows = loadWorkflowRecords();
    const workflowsByNormId = new Map<string, typeof workflows>();
    for (const w of workflows) {
      const k = normalizeEmployeeId(w.employeeId);
      const list = workflowsByNormId.get(k);
      if (list) list.push(w);
      else workflowsByNormId.set(k, [w]);
    }
    const projectByEmp = loadAllIcfProjectsByEmployee();
    let calAdjScores: Record<string, Record<string, number>> = {};
    try {
      calAdjScores = JSON.parse(localStorage.getItem("pa_calibration_adj_scores_v1") ?? "{}");
    } catch {
      calAdjScores = {};
    }
    const unitWeightsCache = new Map<string, ReturnType<typeof loadUnitScoreWeights>>();
    const ctx = { workflowsByNormId, projectByEmp, calAdjScores, unitWeightsCache };
    const result = users.map((u) => buildSingleEmployeeRecord(u, ctx));
    _cachedEmployees = result;
    _cachedEmployeesAt = Date.now();
    return result;
  } catch {
    return [];
  }
}

export const mockEmployees: Employee[] = new Proxy([] as Employee[], {
  get(_target, prop, receiver) {
    const list = getLiveTransactionalEmployees();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

// ── Helper: get module-specific score & grade for an employee ──────────────────
export function getModuleScoreGrade(emp: Employee, module: string): { score: number; grade: string } | null {
  switch (module) {
    case "All Modules":
      return { score: emp.totalScore, grade: emp.grade };
    case "KPI (Setting)":
    case "KPI (Measurement)":
    case "KPI (Tracking)":
      return emp.kpi;
    case "SMART Goals (Setting)":
    case "SMART Goals (Measurement)":
    case "SMART Goals (Tracking)":
      return emp.smartGoals;
    case "Appraisal Form": {
      const avg = Math.round((emp.formA.score + emp.formB.score + emp.formC.score) / 3);
      return { score: avg, grade: avg > 0 ? gradeFromScore(avg).grade : "—" };
    }
    case "Managerial Skill":
      return emp.managerialSkill;
    case "Project OJS":
      return emp.project;
    case "Management Interview":
      return emp.managementInterview;
    default:
      return { score: emp.totalScore, grade: emp.grade };
  }
}
