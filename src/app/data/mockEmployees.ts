import { TrendingUp, Lightbulb, ClipboardList, Briefcase, FolderKanban, MessageSquare } from "lucide-react";
import React from "react";
import { getActiveUser, loadManagedUsers, resolveEffectiveUserGrouping, resolveUserAllowedModules } from "../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { loadUnitScoreWeights, type ScoreWeightColumn } from "../pages/shared/scoringWeightStore";
import { loadAppraisalSelf, loadAllAppraisalApprovers } from "../pages/shared/appraisalFormStore";
import { loadMSSelfRatings, loadAllMSApprovers } from "../pages/shared/msStore";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ScoreGrade { score: number; grade: string; }
export interface ModuleScore { name: string; icon: React.ReactNode; score: number; grade: string; weight: number; }
export interface Employee {
  id: string; fullName: string; position: string; department: string;
  departmentId?: string; sectionId?: string; section?: string;
  division: string; companyUnit: string; joined: string; tenure: string;
  approvalCompleteDate: string; totalScore: number; grade: string;
  modules: ModuleScore[];
  kpi: ScoreGrade; smartGoals: ScoreGrade; formA: ScoreGrade; formB: ScoreGrade; formC: ScoreGrade;
  project: ScoreGrade; managerialSkill: ScoreGrade | null; managementInterview: ScoreGrade | null;
}
export interface CalibrationTarget { grade: string; target: number; color: string; }

// ── Grade colours ──────────────────────────────────────────────────────────────
export const GRADE_COLORS: Record<string, string> = {
  "A+": "#7C3AED", "A": "#2563EB", "B": "#10B981",
  "C":  "#F59E0B", "D": "#F97316", "E": "#EF4444",
};

export const GRADE_ORDER = ["A+", "A", "B", "C", "D", "E"];

export function gradeFromScore(n: number): { grade: string; color: string } {
  if (n >= 90) return { grade: "A+", color: "#10B981" };
  if (n >= 80) return { grade: "A",  color: "#3B82F6" };
  if (n >= 70) return { grade: "B",  color: "#F59E0B" };
  if (n >= 60) return { grade: "C",  color: "#F97316" };
  if (n >= 50) return { grade: "D",  color: "#EF4444" };
  return            { grade: "E",  color: "#991B1B" };
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

/**
 * Membangun daftar Employee murni dari data karyawan yang diimpor (`loadManagedUsers()`)
 * dan skor transaksi nyata yang ada di dalam sistem (`loadWorkflowRecords()`, `pa_project_icf_by_emp_v1`, dll.).
 */
export function getLiveTransactionalEmployees(): Employee[] {
  try {
    const users = loadManagedUsers();
    const activeUser = getActiveUser();
    const workflows = loadWorkflowRecords();
    let projectByEmp: Record<string, { rows?: Array<{ finalScore?: number }>; submittedDate?: string }> = {};
    try {
      projectByEmp = JSON.parse(localStorage.getItem("pa_project_icf_by_emp_v1") ?? "{}");
    } catch {
      projectByEmp = {};
    }
    let calAdjScores: Record<string, Record<string, number>> = {};
    try {
      calAdjScores = JSON.parse(localStorage.getItem("pa_calibration_adj_scores_v1") ?? "{}");
    } catch {
      calAdjScores = {};
    }

    return users.map((u) => {
      const normId = normalizeEmployeeId(u.employeeId);
      const isSelf = u.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase();
      const empWorkflows = workflows.filter(
        (w) => w.employeeId === normId || w.employeeId.toLowerCase() === u.employeeId.toLowerCase(),
      );

      const extractAssessmentScore = (modName: string): number => {
        const rec = empWorkflows.find((w) => w.module === modName && w.phase === "measurement");
        if (!rec) return 0;
        const a2 = Object.values(rec.assessments.approver2?.ratings ?? {});
        const a1 = Object.values(rec.assessments.approver1?.ratings ?? {});
        const vals = a2.length > 0 ? a2 : a1;
        if (vals.length === 0) return 0;
        const avg = averageNumbers(vals);
        return avg <= 5 ? Math.round((avg / 5) * 100) : Math.round(avg);
      };

      let kpiScore = extractAssessmentScore("KPI");
      const sgScore = extractAssessmentScore("SMART Goals");
      let afScore = extractAssessmentScore("Appraisal Form");
      let msScore = extractAssessmentScore("Managerial Skill");
      const miScore = extractAssessmentScore("Management Interview");

      // Jika user sedang aktif dan sudah mengisi self/approver rating di modul lokal
      if (isSelf) {
        if (afScore === 0) {
          const afApprovers = loadAllAppraisalApprovers();
          const afSelf = loadAppraisalSelf();
          if (afApprovers.length > 0) {
            const latest = afApprovers[afApprovers.length - 1];
            const avg = averageNumbers(latest.forms.map((f) => f.avgScore));
            afScore = avg <= 5 ? Math.round((avg / 5) * 100) : Math.round(avg);
          } else if (afSelf && afSelf.forms.length > 0) {
            const avg = averageNumbers(afSelf.forms.map((f) => f.avgScore));
            afScore = avg <= 5 ? Math.round((avg / 5) * 100) : Math.round(avg);
          }
        }
        if (msScore === 0) {
          const msApprovers = loadAllMSApprovers();
          const msSelf = loadMSSelfRatings();
          if (msApprovers.length > 0) {
            const latest = msApprovers[msApprovers.length - 1];
            msScore = latest.totalScore <= 5 ? Math.round((latest.totalScore / 5) * 100) : Math.round(latest.totalScore);
          } else if (msSelf && msSelf.totalScore > 0) {
            msScore = msSelf.totalScore <= 5 ? Math.round((msSelf.totalScore / 5) * 100) : Math.round(msSelf.totalScore);
          }
        }
      }

      const prjRows = projectByEmp[normId]?.rows ?? projectByEmp[u.employeeId]?.rows ?? [];
      const prjScore = prjRows.length > 0 ? Math.max(...prjRows.map((r) => Number(r.finalScore ?? 0))) : 0;

      const grouping = resolveEffectiveUserGrouping(u);
      const allowedMods = resolveUserAllowedModules(u);
      const hasManagerial = allowedMods.includes("Managerial Skill");
      const hasInterview = allowedMods.includes("Management Interview");

      const unitWeights = loadUnitScoreWeights(u.company);
      const weightCol: ScoreWeightColumn =
        grouping === "Ka./Wa.Ka.Div ke atas"
          ? "kepalaDivisi"
          : grouping === "Ka./Wa.Ka.Dept"
          ? "kepalaDepartement"
          : grouping === "Ka./Wa.Ka.Bagian"
          ? "pengawasKepalaBagian"
          : grouping === "Ka./Wa.Ka.Seksi"
          ? "kaWaKaSeksi"
          : "operasional";
      const parseWeightPct = (indikator: string, fallback: number): number => {
        const raw = unitWeights[indikator]?.[weightCol];
        if (!raw || raw === "-") return 0;
        const num = parseFloat(String(raw).replace("%", "").trim());
        return Number.isFinite(num) ? num / 100 : fallback;
      };

      const wKpi = allowedMods.includes("KPI (Setting/Measurement)") ? parseWeightPct("KPI", 0.5) : 0;
      const wSg  = allowedMods.includes("SMART Goals (Setting/Measurement)") ? parseWeightPct("SMART Goals", 0.2) : 0;
      const wAf  = allowedMods.includes("Appraisals Form") ? parseWeightPct("Appraisal Form", 0.15) : 0;
      const wPrj = allowedMods.includes("Project Outside Job Scope") ? parseWeightPct("Project Outside Job Scope", 0.15) : 0;
      const wMs  = hasManagerial ? parseWeightPct("Managerial Skill", 0.15) : 0;
      const wMi  = hasInterview ? parseWeightPct("Management Interview", 0.1) : 0;

      const adjOverride = calAdjScores[u.employeeId]?.total ?? calAdjScores[normId]?.total;
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
      const grade = totalScore > 0 ? gradeFromScore(totalScore).grade : "N/A";

      const joinYear = u.joinDate ? parseInt(u.joinDate.slice(0, 4), 10) : 2026;
      const tenureYrs = Math.max(0, 2026 - (Number.isFinite(joinYear) ? joinYear : 2026));

      const modules: ModuleScore[] = [
        { name: "KPI", icon: React.createElement(TrendingUp, { className: "w-4 h-4" }), score: kpiScore, grade: kpiScore > 0 ? gradeFromScore(kpiScore).grade : "—", weight: Math.round(wKpi * 100) },
        { name: "SMART Goals", icon: React.createElement(Lightbulb, { className: "w-4 h-4" }), score: sgScore, grade: sgScore > 0 ? gradeFromScore(sgScore).grade : "—", weight: Math.round(wSg * 100) },
        { name: "Appraisal Form (A)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—", weight: Math.round((wAf * 100) / 3) },
        { name: "Appraisal Form (B)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—", weight: Math.round((wAf * 100) / 3) },
        { name: "Appraisal Form (C)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—", weight: Math.round((wAf * 100) / 3) },
        { name: "Project Outside Job Scope", icon: React.createElement(FolderKanban, { className: "w-4 h-4" }), score: prjScore, grade: prjScore > 0 ? gradeFromScore(prjScore).grade : "—", weight: Math.round(wPrj * 100) },
        ...(hasManagerial ? [{ name: "Managerial Skill", icon: React.createElement(Briefcase, { className: "w-4 h-4" }), score: msScore, grade: msScore > 0 ? gradeFromScore(msScore).grade : "—", weight: Math.round(wMs * 100) }] : []),
        ...(hasInterview ? [{ name: "Management Interview", icon: React.createElement(MessageSquare, { className: "w-4 h-4" }), score: miScore, grade: miScore > 0 ? gradeFromScore(miScore).grade : "—", weight: Math.round(wMi * 100) }] : []),
      ];

      const latestWorkflowDate = empWorkflows
        .map((w) => w.decisions.approver2?.date || w.decisions.approver1?.date || w.submittedDate)
        .filter(Boolean)
        .sort()
        .pop();
      const prjDate = projectByEmp[normId]?.submittedDate || projectByEmp[u.employeeId]?.submittedDate;

      return {
        id: u.employeeId,
        fullName: u.name,
        position: u.position,
        department: u.department,
        section: u.bagian || "",
        division: u.division,
        companyUnit: u.company,
        joined: u.joinDate || "—",
        tenure: `${tenureYrs} year${tenureYrs !== 1 ? "s" : ""}`,
        approvalCompleteDate: latestWorkflowDate || prjDate || "—",
        totalScore,
        grade,
        modules,
        kpi: { score: kpiScore, grade: kpiScore > 0 ? gradeFromScore(kpiScore).grade : "—" },
        smartGoals: { score: sgScore, grade: sgScore > 0 ? gradeFromScore(sgScore).grade : "—" },
        formA: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—" },
        formB: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—" },
        formC: { score: afScore, grade: afScore > 0 ? gradeFromScore(afScore).grade : "—" },
        project: { score: prjScore, grade: prjScore > 0 ? gradeFromScore(prjScore).grade : "—" },
        managerialSkill: hasManagerial ? { score: msScore, grade: msScore > 0 ? gradeFromScore(msScore).grade : "—" } : null,
        managementInterview: hasInterview ? { score: miScore, grade: miScore > 0 ? gradeFromScore(miScore).grade : "—" } : null,
      };
    });
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
      return emp.kpi;
    case "SMART Goals (Setting)":
    case "SMART Goals (Measurement)":
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
