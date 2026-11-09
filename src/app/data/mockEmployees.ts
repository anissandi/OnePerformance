import { TrendingUp, Lightbulb, ClipboardList, Briefcase, FolderKanban, MessageSquare } from "lucide-react";
import React from "react";

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
    const raw = localStorage.getItem("calibration_submitted_units");
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

// ── Mock data generation ───────────────────────────────────────────────────────
const DIV_DEFS = [
  { id: "div1", divisi: "Staff Management"     },
  { id: "div2", divisi: "Generals"             },
  { id: "div3", divisi: "Finance & Accounting" },
  { id: "div4", divisi: "Logistic / Materials" },
  { id: "div5", divisi: "Quality Management"   },
  { id: "div6", divisi: "Coconut Production"   },
  { id: "div7", divisi: "Pineapple Production" },
  { id: "div8", divisi: "Utility & Supports"   },
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

type EmpLevel = "Operasional" | "Pengawas" | "Kepala Bagian" | "Kepala Departemen" | "Kepala Divisi";
type EmpScores = {
  kpi: number; smartGoals: number; appraisalForm: number;
  managerialSkill: number | null; managementInterview: number | null; projectOutsideJobScope: number;
};

const LEVEL_WEIGHTS: Record<EmpLevel, Record<keyof EmpScores, number>> = {
  "Operasional":       { kpi:.50, smartGoals:.20, appraisalForm:.15, managerialSkill:0,   managementInterview:0,   projectOutsideJobScope:.15 },
  "Pengawas":          { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.15, managementInterview:0,   projectOutsideJobScope:.15 },
  "Kepala Bagian":     { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.15, managementInterview:0,   projectOutsideJobScope:.15 },
  "Kepala Departemen": { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.20, managementInterview:0,   projectOutsideJobScope:.10 },
  "Kepala Divisi":     { kpi:.40, smartGoals:.10, appraisalForm:.10, managerialSkill:.20, managementInterview:.10, projectOutsideJobScope:.10 },
};

function calcFinalScore(level: EmpLevel, s: EmpScores): number {
  const w = LEVEL_WEIGHTS[level];
  return s.kpi*w.kpi + s.smartGoals*w.smartGoals + s.appraisalForm*w.appraisalForm
    + (s.managerialSkill??0)*w.managerialSkill + (s.managementInterview??0)*w.managementInterview
    + s.projectOutsideJobScope*w.projectOutsideJobScope;
}

function h16(s: string): number {
  return s.split("").reduce((a,c) => ((a*31)+c.charCodeAt(0))&0xffff, 0);
}
function seededInt(seed: number, lo: number, hi: number): number {
  return lo + (Math.abs(seed) % (hi - lo + 1));
}

const FIRST_NAMES = ["Budi","Siti","Ahmad","Dewi","Eko","Fitri","Gunawan","Heni","Irfan","Joko","Kartika","Lukman","Maya","Nugroho","Purnomo","Rudi","Sri","Teguh","Wahyu","Yanto","Arif","Bagas","Cahya","Dian","Endra","Fajar","Gita","Hadi","Indra","Jeni"];
const LAST_NAMES  = ["Santoso","Rahayu","Fauzi","Lestari","Prasetyo","Handayani","Wibowo","Kurniawati","Hidayat","Susilo","Hakim","Sari","Wicaksono","Hermawan","Wahyuni","Wijaya","Rahman","Nugroho","Kusuma","Pertiwi","Utomo","Setiawan","Adi","Purwanto","Surya"];

const GRADE_BAND_SPECS = [
  { lo: 90, hi: 98, count: 11 },
  { lo: 80, hi: 89, count: 24 },
  { lo: 70, hi: 79, count: 71 },
  { lo: 60, hi: 69, count: 51 },
  { lo: 50, hi: 59, count: 22 },
  { lo: 35, hi: 49, count: 14 },
] as const;

const EMP_TOTAL = GRADE_BAND_SPECS.reduce((s, b) => s + b.count, 0);

const EMP_BAND_LIST: { lo: number; hi: number }[] = (() => {
  const assigned = GRADE_BAND_SPECS.map(() => 0);
  const result: { lo: number; hi: number }[] = [];
  for (let i = 0; i < EMP_TOTAL; i++) {
    let bestG = 0, bestDebt = -Infinity;
    for (let g = 0; g < GRADE_BAND_SPECS.length; g++) {
      const debt = ((i + 1) * GRADE_BAND_SPECS[g].count) / EMP_TOTAL - assigned[g];
      if (debt > bestDebt) { bestDebt = debt; bestG = g; }
    }
    result.push({ lo: GRADE_BAND_SPECS[bestG].lo, hi: GRADE_BAND_SPECS[bestG].hi });
    assigned[bestG]++;
  }
  return result;
})();

const POSITION_LEVELS: [EmpLevel, boolean, boolean][] = [
  ["Kepala Bagian", true,  false],
  ["Pengawas",      true,  false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
];

const DIV_TO_UNIT: Record<string, string> = {
  "div1": "PT RSUP (Industry)",
  "div2": "PT RSUP (Industry)",
  "div3": "PT RSUP (Perkebunan)",
  "div4": "PT Pulau Sambu (Jakarta)",
  "div5": "PT Pulau Sambu (Guntung)",
  "div6": "PT Pulau Sambu (Kuala Enok)",
  "div7": "PT RSTM",
  "div8": "PT GHS",
};

const APPROVAL_DAYS: number[] = [15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30];

function buildMockEmployees(): Employee[] {
  const nBagian = BAGIAN_DEFS.length;
  return EMP_BAND_LIST.map((band, idx) => {
    const [bagianId, deptId, bagianName] = BAGIAN_DEFS[idx % nBagian];
    const divisiId  = DEPT_DEFS.find(([dId]) => dId === deptId)?.[1] ?? "div1";
    const pos       = Math.floor(idx / nBagian);
    const [level, hasMgr, hasIntv] = POSITION_LEVELS[Math.min(pos, POSITION_LEVELS.length - 1)];
    const { lo, hi } = band;
    const seed = h16(`${bagianId}x${idx}`);
    const fn   = FIRST_NAMES[(seed + idx * 7)  % FIRST_NAMES.length];
    const ln   = LAST_NAMES[ (seed + idx * 13) % LAST_NAMES.length];

    const base: EmpScores = {
      kpi:                    seededInt(h16(`${bagianId}${idx}kpi`), lo, hi),
      smartGoals:             seededInt(h16(`${bagianId}${idx}sg`),  lo, hi),
      appraisalForm:          seededInt(h16(`${bagianId}${idx}af`),  lo, hi),
      managerialSkill:        hasMgr  ? seededInt(h16(`${bagianId}${idx}ms`), lo, hi) : null,
      managementInterview:    hasIntv ? seededInt(h16(`${bagianId}${idx}mi`), lo, hi) : null,
      projectOutsideJobScope: seededInt(h16(`${bagianId}${idx}pj`), lo, hi),
    };

    const finalScore = parseFloat(calcFinalScore(level, base).toFixed(1));
    const { grade } = gradeFromScore(finalScore);

    const divisiName  = DIV_DEFS.find(d => d.id === divisiId)?.divisi ?? "—";
    const deptName    = DEPT_DEFS.find(([id]) => id === deptId)?.[2] ?? "—";
    const companyUnit = DIV_TO_UNIT[divisiId] ?? "ASD";

    const joinYear = 1990 + seededInt(h16(`${bagianId}${idx}jy`), 0, 32);
    const joinMo   = seededInt(h16(`${bagianId}${idx}jm`), 1, 12);
    const joinDy   = seededInt(h16(`${bagianId}${idx}jd`), 1, 28);
    const joined   = `${joinYear}-${String(joinMo).padStart(2,"0")}-${String(joinDy).padStart(2,"0")}`;
    const tenureYrs = 2026 - joinYear;
    const tenure   = `${tenureYrs} year${tenureYrs !== 1 ? "s" : ""}`;

    const appMo = seededInt(h16(`${bagianId}${idx}am`), 5, 6);
    const appDy = APPROVAL_DAYS[seededInt(h16(`${bagianId}${idx}ad`), 0, APPROVAL_DAYS.length - 1)];
    const approvalCompleteDate = `2026-${String(appMo).padStart(2,"0")}-${String(appDy).padStart(2,"0")}`;

    const af = base.appraisalForm;
    const fA = Math.max(30, Math.min(100, af + seededInt(h16(`${bagianId}${idx}fa`), -3, 3) - 3));
    const fB = Math.max(30, Math.min(100, af + seededInt(h16(`${bagianId}${idx}fb`), -3, 3) - 3));
    const fC = Math.max(30, Math.min(100, af + seededInt(h16(`${bagianId}${idx}fc`), -3, 3) - 3));

    const modules: ModuleScore[] = [
      { name: "KPI", icon: React.createElement(TrendingUp, { className: "w-4 h-4" }), score: base.kpi, grade: gradeFromScore(base.kpi).grade, weight: Math.round(LEVEL_WEIGHTS[level].kpi * 100) },
      { name: "SMART Goals", icon: React.createElement(Lightbulb, { className: "w-4 h-4" }), score: base.smartGoals, grade: gradeFromScore(base.smartGoals).grade, weight: Math.round(LEVEL_WEIGHTS[level].smartGoals * 100) },
      { name: "Appraisal Form (A)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fA, grade: gradeFromScore(fA).grade, weight: Math.round(LEVEL_WEIGHTS[level].appraisalForm * 100 / 3) },
      { name: "Appraisal Form (B)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fB, grade: gradeFromScore(fB).grade, weight: Math.round(LEVEL_WEIGHTS[level].appraisalForm * 100 / 3) },
      { name: "Appraisal Form (C)", icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fC, grade: gradeFromScore(fC).grade, weight: Math.round(LEVEL_WEIGHTS[level].appraisalForm * 100 / 3) },
      { name: "Project Outside Job Scope", icon: React.createElement(FolderKanban, { className: "w-4 h-4" }), score: base.projectOutsideJobScope, grade: gradeFromScore(base.projectOutsideJobScope).grade, weight: Math.round(LEVEL_WEIGHTS[level].projectOutsideJobScope * 100) },
      ...(base.managerialSkill !== null ? [{ name: "Managerial Skill", icon: React.createElement(Briefcase, { className: "w-4 h-4" }), score: base.managerialSkill, grade: gradeFromScore(base.managerialSkill).grade, weight: Math.round(LEVEL_WEIGHTS[level].managerialSkill * 100) }] : []),
      ...(base.managementInterview !== null ? [{ name: "Management Interview", icon: React.createElement(MessageSquare, { className: "w-4 h-4" }), score: base.managementInterview, grade: gradeFromScore(base.managementInterview).grade, weight: Math.round(LEVEL_WEIGHTS[level].managementInterview * 100) }] : []),
    ];

    return {
      id: `EMP-${String(idx + 1).padStart(3, "0")}`,
      fullName: `${fn} ${ln}`,
      position: level,
      department: deptName,
      departmentId: deptId,
      sectionId: bagianId,
      section: bagianName,
      division: divisiName,
      companyUnit,
      joined,
      tenure,
      approvalCompleteDate,
      totalScore: finalScore,
      grade,
      modules,
      kpi:               { score: base.kpi,                    grade: gradeFromScore(base.kpi).grade },
      smartGoals:        { score: base.smartGoals,             grade: gradeFromScore(base.smartGoals).grade },
      formA:             { score: fA,                          grade: gradeFromScore(fA).grade },
      formB:             { score: fB,                          grade: gradeFromScore(fB).grade },
      formC:             { score: fC,                          grade: gradeFromScore(fC).grade },
      project:           { score: base.projectOutsideJobScope, grade: gradeFromScore(base.projectOutsideJobScope).grade },
      managerialSkill:   base.managerialSkill  !== null ? { score: base.managerialSkill,  grade: gradeFromScore(base.managerialSkill).grade  } : null,
      managementInterview: base.managementInterview !== null ? { score: base.managementInterview, grade: gradeFromScore(base.managementInterview).grade } : null,
    };
  });
}

// ── MI-linked Kepala Divisi employees (assessed by BOD Management Interview) ───
// Store IDs (E002, E011, E013, E014) map to managementInterviewScoreStore keys.
export const MI_EMPLOYEE_STORE_MAP: Record<string, string> = {
  "MI-E002": "E002",
  "MI-E011": "E011",
  "MI-E013": "E013",
  "MI-E014": "E014",
};

function buildMIEmployee(
  id: string, fullName: string,
  kpi: number, sg: number, af: number, ms: number, pj: number,
  dept: string, div: string, unit: string,
): Employee {
  const fA = Math.max(30, Math.min(100, af - 2));
  const fB = Math.max(30, Math.min(100, af - 1));
  const fC = Math.max(30, Math.min(100, af));
  // Kepala Divisi weights: kpi:.40 sg:.10 af:.10 ms:.20 mi:.10 pj:.10
  // MI is null until BOD submits score; contributes 0 until then
  const totalScore = parseFloat((kpi*.40 + sg*.10 + af*.10 + ms*.20 + pj*.10).toFixed(1));
  const { grade } = gradeFromScore(totalScore);
  const modules: ModuleScore[] = [
    { name: "KPI",                    icon: React.createElement(TrendingUp,    { className: "w-4 h-4" }), score: kpi, grade: gradeFromScore(kpi).grade, weight: 40 },
    { name: "SMART Goals",            icon: React.createElement(Lightbulb,     { className: "w-4 h-4" }), score: sg,  grade: gradeFromScore(sg).grade,  weight: 10 },
    { name: "Appraisal Form (A)",     icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fA,  grade: gradeFromScore(fA).grade,  weight: 3  },
    { name: "Appraisal Form (B)",     icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fB,  grade: gradeFromScore(fB).grade,  weight: 3  },
    { name: "Appraisal Form (C)",     icon: React.createElement(ClipboardList, { className: "w-4 h-4" }), score: fC,  grade: gradeFromScore(fC).grade,  weight: 4  },
    { name: "Project Outside Job Scope", icon: React.createElement(FolderKanban, { className: "w-4 h-4" }), score: pj, grade: gradeFromScore(pj).grade, weight: 10 },
    { name: "Managerial Skill",       icon: React.createElement(Briefcase,     { className: "w-4 h-4" }), score: ms,  grade: gradeFromScore(ms).grade,  weight: 20 },
    { name: "Management Interview",   icon: React.createElement(MessageSquare, { className: "w-4 h-4" }), score: 0,   grade: "—",                        weight: 10 },
  ];
  return {
    id, fullName,
    position: "Kepala Divisi",
    department: dept, division: div, companyUnit: unit,
    joined: "2018-03-01", tenure: "8 years",
    approvalCompleteDate: "2026-06-15",
    totalScore, grade, modules,
    kpi:               { score: kpi, grade: gradeFromScore(kpi).grade },
    smartGoals:        { score: sg,  grade: gradeFromScore(sg).grade  },
    formA:             { score: fA,  grade: gradeFromScore(fA).grade  },
    formB:             { score: fB,  grade: gradeFromScore(fB).grade  },
    formC:             { score: fC,  grade: gradeFromScore(fC).grade  },
    project:           { score: pj,  grade: gradeFromScore(pj).grade  },
    managerialSkill:   { score: ms,  grade: gradeFromScore(ms).grade  },
    managementInterview: null,
  };
}

const MI_EMPLOYEES: Employee[] = [
  buildMIEmployee("MI-E002", "Siti Rahayu",  82, 78, 80, 79, 75, "Sumber Daya Manusia", "Staff Management",     "PT RSUP (Industry)"),
  buildMIEmployee("MI-E011", "Kartini Dewi", 76, 74, 77, 73, 72, "Sumber Daya Manusia", "Staff Management",     "PT RSUP (Industry)"),
  buildMIEmployee("MI-E013", "Rini Susanti", 85, 83, 84, 81, 80, "Keuangan",            "Finance & Accounting", "PT RSUP (Perkebunan)"),
  buildMIEmployee("MI-E014", "Dian Permana", 79, 77, 78, 75, 74, "Keuangan",            "Finance & Accounting", "PT RSUP (Perkebunan)"),
];

export const mockEmployees: Employee[] = [...buildMockEmployees(), ...MI_EMPLOYEES];

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
      return { score: avg, grade: gradeFromScore(avg).grade };
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
