// @refresh reset
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import { getPenilai1ScoreAsPercent, subscribeScores } from "../supervisor/managementInterviewScoreStore";
import { Save, Edit2, Building2, ChevronRight, ArrowLeft, CheckCircle2, Send, Clock, X, ChevronDown, ChevronUp, Lock, RotateCcw, Paperclip, Upload, MessageSquare, Eye, AlertTriangle } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Dot } from "recharts";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../utils/excelUtils";
import { applyYearEndScorePolicy, isYearEndInactive, loadYearEndState } from "../shared/yearEndWorkflowStore";
import { useAppraisalRevision } from "../shared/useAppraisalRevision";
import { normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { loadMeasurementRCARecords } from "../employee/RCAPage";
import { loadPersistedState, savePersistedState, uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { isExcludedFromAppraisalCalibration, loadManagedUsers, resolveUserAllowedModules, useAuthStore } from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { applyImportedEmployeesDistribution, orgSlug } from "./CalibrationSetting";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalibrationGrade = { id: string; grade: string; proporsi: string; };

type DivisionProportion      = { id: string; divisi: string;                          hc: number; };
type DepartemenenProportion  = { id: string; divisiId: string; departemen: string;    hc: number; };
type BagianProportion        = { id: string; departemenenId: string; bagian: string;  hc: number; };

type CompanyUnit = {
  id: string; name: string; code: string; industry: string;
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
};

type PageMode = "edit" | "preview" | "submitted";

// ─── Employee adjustment types ────────────────────────────────────────────────

type EmpLevel = "Operasional" | "Pengawas" | "Kepala Bagian" | "Kepala Departemen" | "Kepala Divisi";

type EvidenceFile = { name: string; objectUrl: string; mimeType: string };

type EmpScores = {
  kpi: number;
  smartGoals: number;
  appraisalForm: number;
  managerialSkill: number | null;
  managementInterview: number | null;
  projectOutsideJobScope: number;
};

type Employee = {
  id: string; employeeId: string; name: string; nip: string; level: EmpLevel;
  bagianId: string; departemenenId: string; divisiId: string;
  companyUnit?: string;
  divisionName?: string;
  departmentName?: string;
  bagianName?: string;
  base: EmpScores;
  kpiIsYtd?: boolean;
  kpiFullyValidated?: boolean;
  isCalibrationReady?: boolean;
};

// ─── Default data ─────────────────────────────────────────────────────────────

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%"  },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%"  },
];

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

// ─── Employee level weights & helpers ─────────────────────────────────────────

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

function gradeFromScore(n: number): { grade: string; color: string } {
  if (n >= 90) return { grade:"A+", color:"#10B981" };
  if (n >= 80) return { grade:"A",  color:"#3B82F6" };
  if (n >= 70) return { grade:"B",  color:"#F59E0B" };
  if (n >= 60) return { grade:"C",  color:"#F97316" };
  if (n >= 50) return { grade:"D",  color:"#EF4444" };
  return          { grade:"E",  color:"#991B1B" };
}

function pastYearBase(emp: Employee): EmpScores {
  const off = (k: string) => seededInt(h16(`${emp.id}${k}py`), -10, 5);
  const clamp = (v: number) => Math.max(30, Math.min(100, v));
  return {
    kpi:                    clamp(emp.base.kpi                    + off("kpi")),
    smartGoals:             clamp(emp.base.smartGoals             + off("sg")),
    appraisalForm:          clamp(emp.base.appraisalForm          + off("af")),
    managerialSkill:        emp.base.managerialSkill   !== null ? clamp(emp.base.managerialSkill   + off("ms")) : null,
    managementInterview:    emp.base.managementInterview !== null ? clamp(emp.base.managementInterview + off("mi")) : null,
    projectOutsideJobScope: clamp(emp.base.projectOutsideJobScope + off("pj")),
  };
}

// ─── Mock employee generator ──────────────────────────────────────────────────

const FIRST_NAMES = ["Budi","Siti","Ahmad","Dewi","Eko","Fitri","Gunawan","Heni","Irfan","Joko","Kartika","Lukman","Maya","Nugroho","Purnomo","Rudi","Sri","Teguh","Wahyu","Yanto","Arif","Bagas","Cahya","Dian","Endra","Fajar","Gita","Hadi","Indra","Jeni"];
const LAST_NAMES  = ["Santoso","Rahayu","Fauzi","Lestari","Prasetyo","Handayani","Wibowo","Kurniawati","Hidayat","Susilo","Hakim","Sari","Wicaksono","Hermawan","Wahyuni","Wijaya","Rahman","Nugroho","Kusuma","Pertiwi","Utomo","Setiawan","Adi","Purwanto","Surya"];

function h16(s: string): number {
  return s.split("").reduce((a,c) => ((a*31)+c.charCodeAt(0))&0xffff, 0);
}
function seededInt(seed: number, lo: number, hi: number): number {
  return lo + (Math.abs(seed) % (hi - lo + 1));
}

// Target actual grade distribution: A+=11, A=51, B=71, C=51, D=22, E=14 → 220 total
const GRADE_BAND_SPECS = [
  { lo: 90, hi: 98, count: 11 }, // A+
  { lo: 80, hi: 89, count: 24 }, // A
  { lo: 70, hi: 79, count: 71 }, // B
  { lo: 60, hi: 69, count: 51 }, // C
  { lo: 50, hi: 59, count: 22 }, // D
  { lo: 35, hi: 49, count: 14 }, // E
] as const;

const EMP_TOTAL = GRADE_BAND_SPECS.reduce((s, b) => s + b.count, 0); // 220

// Bresenham-style interleaving: distributes grade bands evenly across all 220 slots
// so each bagian gets a proportional mix of grades rather than blocks
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

// Level per position within each bagian (round-robin assignment: idx % 32 = bagian)
const POSITION_LEVELS: [EmpLevel, boolean, boolean][] = [
  ["Kepala Bagian", true,  false], // position 0 in bagian
  ["Pengawas",      true,  false], // position 1
  ["Operasional",   false, false], // position 2+
  ["Operasional",   false, false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
  ["Operasional",   false, false],
];

function generateEmployees(): Employee[] {
  const employeeNumbers = Array.from({ length: EMP_BAND_LIST.length + 4 }, (_, index) => index + 1).filter((number) => ![2, 11, 13, 14].includes(number));
  const nBagian = BAGIAN_DEFS.length; // 32
  return EMP_BAND_LIST.map((band, idx) => {
    const [bagianId, deptId] = BAGIAN_DEFS[idx % nBagian];
    const divisiId  = DEPT_DEFS.find(([dId]) => dId === deptId)?.[1] ?? "";
    const pos       = Math.floor(idx / nBagian);
    const [level, hasMgr, hasIntv] = POSITION_LEVELS[Math.min(pos, POSITION_LEVELS.length - 1)];
    const { lo, hi } = band;
    const seed = h16(`${bagianId}x${idx}`);
    const fn   = FIRST_NAMES[(seed + idx * 7)  % FIRST_NAMES.length];
    const ln   = LAST_NAMES[ (seed + idx * 13) % LAST_NAMES.length];
    const yr   = 70 + seededInt(seed, 0, 24);
    const mo   = seededInt(seed ^ 0x1a, 1, 12);
    const dy   = seededInt(seed ^ 0x2b, 1, 28);
    const nip  = `19${yr}${String(mo).padStart(2,"0")}${String(dy).padStart(2,"0")}${String(seededInt(seed,100,999)).padStart(4,"0")}`;
    return {
      id: `emp-${bagianId}-${idx}`,
      employeeId: `EMP-${String(employeeNumbers[idx]).padStart(3, "0")}`,
      name: `${fn} ${ln}`, nip, level,
      bagianId, departemenenId: deptId, divisiId,
      base: {
        kpi:                    seededInt(h16(`${bagianId}${idx}kpi`), lo, hi),
        smartGoals:             seededInt(h16(`${bagianId}${idx}sg`),  lo, hi),
        appraisalForm:          seededInt(h16(`${bagianId}${idx}af`),  lo, hi),
        managerialSkill:        hasMgr  ? seededInt(h16(`${bagianId}${idx}ms`), lo, hi) : null,
        managementInterview:    hasIntv ? seededInt(h16(`${bagianId}${idx}mi`), lo, hi) : null,
        projectOutsideJobScope: seededInt(h16(`${bagianId}${idx}pj`), lo, hi),
      },
    };
  });
}

// Fixed employees linked to Management Interview monitoring (E002, E011, E013, E014)
const MI_LINKED_EMPLOYEES: Employee[] = [
  {
    id: "emp-mi-E002", employeeId: "EMP-002", name: "Siti Rahayu",  nip: "198505150001", level: "Kepala Divisi",
    bagianId: "bag1", departemenenId: "dep1", divisiId: "div1",
    base: { kpi: 82, smartGoals: 78, appraisalForm: 80, managerialSkill: 79, managementInterview: null, projectOutsideJobScope: 75 },
  },
  {
    id: "emp-mi-E011", employeeId: "EMP-011", name: "Kartini Dewi", nip: "199003150002", level: "Kepala Divisi",
    bagianId: "bag1", departemenenId: "dep1", divisiId: "div1",
    base: { kpi: 76, smartGoals: 74, appraisalForm: 77, managerialSkill: 73, managementInterview: null, projectOutsideJobScope: 72 },
  },
  {
    id: "emp-mi-E013", employeeId: "EMP-013", name: "Rini Susanti",  nip: "198807200003", level: "Kepala Divisi",
    bagianId: "bag2", departemenenId: "dep1", divisiId: "div1",
    base: { kpi: 85, smartGoals: 83, appraisalForm: 84, managerialSkill: 81, managementInterview: null, projectOutsideJobScope: 80 },
  },
  {
    id: "emp-mi-E014", employeeId: "EMP-014", name: "Dian Permana",  nip: "199211100004", level: "Kepala Divisi",
    bagianId: "bag2", departemenenId: "dep1", divisiId: "div1",
    base: { kpi: 79, smartGoals: 77, appraisalForm: 78, managerialSkill: 75, managementInterview: null, projectOutsideJobScope: 74 },
  },
];

function buildLiveCalibrationEmployees(): Employee[] {
  const users = loadManagedUsers().filter((u) => u.status === "Active" && !isExcludedFromAppraisalCalibration(u));
  const liveEmps = getLiveTransactionalEmployees();
  return users.map((u) => {
    const live = liveEmps.find((e) => e.id.toLowerCase() === u.employeeId.toLowerCase());
    const divName = (u.division || "Umum").trim();
    const deptName = (u.department || divName).trim();
    const bagName = (u.bagian || deptName).trim();
    const divisiId = `div_${orgSlug(divName)}`;
    const deptId = `dep_${orgSlug(divName)}__${orgSlug(deptName)}`;
    const bagianId = `bag_${orgSlug(divName)}__${orgSlug(deptName)}__${orgSlug(bagName)}`;
    const grouping = u.groupings || "Operasional";
    const allowedModules = resolveUserAllowedModules(u);
    const level: EmpLevel =
      grouping === "Ka./Wa.Ka.Div ke atas"
        ? "Kepala Divisi"
        : grouping === "Ka./Wa.Ka.Dept"
        ? "Kepala Departemen"
        : grouping === "Ka./Wa.Ka.Bagian"
        ? "Kepala Bagian"
        : grouping === "Ka./Wa.Ka.Seksi"
        ? "Pengawas"
        : "Operasional";
    const hasMgr = allowedModules.includes("Managerial Skill");
    const hasIntv = allowedModules.includes("Management Interview");
    return {
      id: `emp-${u.employeeId}`,
      employeeId: u.employeeId,
      name: u.name,
      nip: u.regNo || u.employeeId,
      level,
      bagianId,
      departemenenId: deptId,
      divisiId,
      companyUnit: u.company,
      divisionName: divName,
      departmentName: deptName,
      bagianName: bagName,
      base: {
        kpi: live?.kpi.score ?? 0,
        smartGoals: live?.smartGoals.score ?? 0,
        appraisalForm: live ? Math.round((live.formA.score + live.formB.score + live.formC.score) / 3) : 0,
        managerialSkill: hasMgr ? (live?.managerialSkill?.score ?? 0) : null,
        managementInterview: hasIntv ? (live?.managementInterview?.score ?? null) : null,
        projectOutsideJobScope: live?.project.score ?? 0,
      },
      kpiIsYtd: live?.kpiIsYtd ?? false,
      kpiFullyValidated: live?.kpiFullyValidated ?? false,
      isCalibrationReady: live?.isCalibrationReady ?? false,
    };
  });
}

const ALL_EMPLOYEES: Employee[] = new Proxy([] as Employee[], {
  get(_target, prop, receiver) {
    const list = buildLiveCalibrationEmployees();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => ({
  id, name, code, industry,
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
  makeUnit("8", "ASD",                      "ASD",      ""),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeCalcs(hc: number, grades: CalibrationGrade[]): number[] {
  return grades.map(g => hc > 0 ? Math.round(hc * (parseFloat(g.proporsi) || 0) / 100) : 0);
}

// Actual appraisal grade proportions (realistic end-of-year distribution)
const ACTUAL_PROPS = [0.04, 0.12, 0.43, 0.28, 0.09, 0.04];

function idHash(id: string): number {
  return id.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0);
}

function mockActual(rowId: string, settingHC: number): { hc: number; grades: number[] } {
  if (settingHC === 0) return { hc: 0, grades: ACTUAL_PROPS.map(() => 0) };
  const h = idHash(rowId);
  const variation = (h % 7) - 3; // -3 to +3
  const actualHC = Math.max(1, settingHC + variation);
  const grades = ACTUAL_PROPS.map(p => Math.round(actualHC * p));
  const diff = actualHC - grades.reduce((a, b) => a + b, 0);
  grades[2] = Math.max(0, grades[2] + diff); // absorb rounding into B (middle grade)
  return { hc: actualHC, grades };
}

// ─── Color tokens ─────────────────────────────────────────────────────────────
const SETTING_BG  = "bg-[#1A284F]";        // navy  – setting header
const ACTUAL_BG   = "bg-teal-700";          // teal  – actual header
const ACTUAL_CELL = "bg-teal-50";           // teal light – actual data cells

// ─── Submit Confirm Modal ─────────────────────────────────────────────────────

function SubmitConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Submit Calibration Adjustment</h3>
              <p className="text-xs text-gray-500 mt-0.5">This will send for Approval Management review</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Once submitted, you will not be able to edit the calibration adjustment until the approval is completed.
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <CheckCircle2 className="w-4 h-4" />Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section wrapper ─────────────────────────────────────────────

function CollapsibleSection({ title, subtitle, defaultOpen = true, actions, children }: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <button onClick={() => setOpen(v => !v)} className="flex-1 flex items-center justify-between hover:bg-gray-50/60 transition-colors text-left -mx-1 px-1 py-1 rounded-lg mr-2">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-4" />
            : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-4" />}
        </button>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

// ─── Bell Curve Chart ─────────────────────────────────────────────────────────

function BellCurveChart({
  calibrationGrades,
  divisionProportions,
  actualCounts,
}: {
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  actualCounts?: number[];
}) {
  const safeDivisions = divisionProportions ?? [];
  const gradeHeaders  = calibrationGrades.map(g => g.grade);

  // Setting totals per grade
  const settingTotals = calibrationGrades.map((_, idx) =>
    safeDivisions.reduce((s, d) =>
      s + (d.hc > 0 ? Math.round(d.hc * (parseFloat(calibrationGrades[idx]?.proporsi) || 0) / 100) : 0), 0)
  );

  // Actual totals per grade — use provided counts if available, else mockActual
  const actualTotals = actualCounts
    ? actualCounts
    : calibrationGrades.map((_, gi) =>
        safeDivisions.reduce((s, d) => s + mockActual(d.id, d.hc).grades[gi], 0)
      );

  const totalSetting = settingTotals.reduce((a, b) => a + b, 0);
  const totalActual  = actualTotals.reduce((a, b) => a + b, 0);

  const data = gradeHeaders.map((grade, i) => ({
    grade,
    "Setting (%)": totalSetting > 0 ? parseFloat(((settingTotals[i] / totalSetting) * 100).toFixed(1)) : 0,
    "Aktual (%)":  totalActual  > 0 ? parseFloat(((actualTotals[i]  / totalActual)  * 100).toFixed(1)) : 0,
    settingHC: settingTotals[i],
    actualHC:  actualTotals[i],
  }));

  const gradeColors: Record<string, string> = {
    "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const color = gradeColors[label] ?? "#6B7280";
    // Deduplicate — bars and lines both fire; keep unique dataKeys
    const seen = new Set<string>();
    const unique = payload.filter((p: any) => {
      if (seen.has(p.dataKey)) return false;
      seen.add(p.dataKey);
      return true;
    });
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-xs min-w-[180px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
          <span className="font-bold text-gray-800">Grade {label}</span>
        </div>
        {unique.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4 mt-1">
            <span className="text-gray-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color ?? p.fill ?? p.stroke }} />
              {p.name}
            </span>
            <span className="font-bold text-gray-800">
              {p.value}%
              <span className="text-gray-400 font-normal ml-1">
                ({p.dataKey === "Setting (%)" ? p.payload.settingHC : p.payload.actualHC} orang)
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  const CustomBarShape = (props: any) => {
    const { x, y, width, height, fill } = props;
    if (height <= 0) return null;
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} ry={3} />;
  };

  const SettingDot = (props: any) => {
    const { cx, cy } = props;
    return <Dot cx={cx} cy={cy} r={5} fill="#1A284F" stroke="#fff" strokeWidth={2} />;
  };

  const AktualDot = (props: any) => {
    const { cx, cy } = props;
    return <Dot cx={cx} cy={cy} r={5} fill="#0D9488" stroke="#fff" strokeWidth={2} />;
  };

  const legendPayload = [
    { value: "Setting (%)", type: "square" as const, color: "#1A284F" },
    { value: "Aktual (%)",  type: "square" as const, color: "#0D9488" },
    { value: "Kurva Setting", type: "line" as const, color: "#1A284F" },
    { value: "Kurva Aktual",  type: "line" as const, color: "#0D9488" },
  ];

  return (
    <CollapsibleSection
      title="Grade Distribution — Bell Curve"
      subtitle="Setting (target awal tahun) vs Aktual (perolehan nilai akhir tahun)"
    >
      <div className="flex gap-6">
        {/* Chart */}
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 24, left: -8, bottom: 0 }}
              barSize={26}
              barGap={4}
              barCategoryGap="30%"
            >
              <CartesianGrid key="bc-grid" strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis key="bc-xaxis" dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }} dy={6} />
              <YAxis key="bc-yaxis" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={v => `${v}%`} domain={[0, "auto"]} />
              <Tooltip key="bc-tooltip" content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.04)" }} />
              <Legend
                key="bc-legend"
                payload={legendPayload}
                iconSize={10}
                formatter={(value) => <span className="text-xs text-gray-600 font-medium">{value}</span>}
              />
              {/* Bars */}
              <Bar key="bc-bar-setting" dataKey="Setting (%)" name="Setting (%)" fill="#1A284F" fillOpacity={0.25} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              <Bar key="bc-bar-actual"  dataKey="Aktual (%)"  name="Aktual (%)"  fill="#0D9488" fillOpacity={0.25} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              {/* Lines */}
              <Line key="bc-line-setting" type="monotone" dataKey="Setting (%)" name="Kurva Setting" stroke="#1A284F" strokeWidth={2.5} strokeDasharray="6 3" dot={<SettingDot />} activeDot={{ r: 6 }} isAnimationActive={false} legendType="plainline" />
              <Line key="bc-line-actual"  type="monotone" dataKey="Aktual (%)"  name="Kurva Aktual"  stroke="#0D9488" strokeWidth={2.5} dot={<AktualDot />} activeDot={{ r: 6 }} isAnimationActive={false} legendType="plainline" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Summary cards */}
        <div className="w-48 shrink-0 flex flex-col gap-3 justify-center">
          {data.map(d => {
            const diff = parseFloat((d["Aktual (%)"] - d["Setting (%)"]).toFixed(1));
            const color = gradeColors[d.grade] ?? "#6B7280";
            return (
              <div key={d.grade} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: color }}>{d.grade}</span>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500">Aktual vs Setting</p>
                  <p className="text-xs font-bold text-gray-800">{d["Aktual (%)"]}% <span className="text-gray-400 font-normal">vs</span> {d["Setting (%)"]}%</p>
                  <p className={`text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400"}`}>
                    {diff > 0 ? `+${diff}%` : diff < 0 ? `${diff}%` : "sama"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─── Grade Distribution with Actual column ────────────────────────────────────

function GradeDistributionTable({
  calibrationGrades,
  divisionProportions,
  actualCounts,
}: {
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  actualCounts?: number[];
}) {
  const safeDivisions = divisionProportions ?? [];

  const settingKaryawan = calibrationGrades.map((_, idx) =>
    safeDivisions.reduce((s, d) =>
      s + (d.hc > 0 ? Math.round(d.hc * (parseFloat(calibrationGrades[idx]?.proporsi) || 0) / 100) : 0), 0)
  );

  const actualPerGrade = actualCounts
    ? actualCounts
    : calibrationGrades.map((_, gi) =>
        safeDivisions.reduce((s, d) => s + mockActual(d.id, d.hc).grades[gi], 0)
      );

  const totalSettingKaryawan = settingKaryawan.reduce((a, b) => a + b, 0);
  const totalActualKaryawan  = actualPerGrade.reduce((a, b) => a + b, 0);

  const totalProporsi = calibrationGrades.reduce((s, g) => {
    const n = parseFloat(g.proporsi.replace("%", "").trim());
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <CollapsibleSection
      title="Grade Distribution & Calibration"
      subtitle="Comparison between setting target and actual appraisal results"
      defaultOpen={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className={`border border-gray-300 px-4 py-3 text-center font-semibold text-white ${SETTING_BG}`}>GRADE</th>
              <th rowSpan={2} className={`border border-gray-300 px-4 py-3 text-center font-semibold text-white ${SETTING_BG}`}>PROPORSI</th>
              <th colSpan={1} className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${SETTING_BG} text-xs tracking-wide`}>SETTING — Awal Tahun</th>
              <th colSpan={1} className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${ACTUAL_BG} text-xs tracking-wide`}>AKTUAL — Akhir Tahun</th>
            </tr>
            <tr>
              <th className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${SETTING_BG} text-xs`}>KARYAWAN</th>
              <th className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${ACTUAL_BG} text-xs`}>KARYAWAN (Final)</th>
            </tr>
          </thead>
          <tbody>
            {calibrationGrades.map((grade, idx) => {
              const sKary = settingKaryawan[idx];
              const aKary = actualPerGrade[idx];
              const diff  = aKary - sKary;
              return (
                <tr key={grade.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">{grade.grade}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center text-gray-900">{grade.proporsi}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center bg-gray-50">
                    <span className="text-gray-900">{sKary > 0 ? sKary.toLocaleString() : "—"}</span>
                  </td>
                  <td className={`border border-gray-300 px-4 py-3 text-center ${ACTUAL_CELL}`}>
                    <span className="font-semibold text-teal-800">{aKary > 0 ? aKary.toLocaleString() : "—"}</span>
                    {sKary > 0 && aKary > 0 && (
                      <span className={`ml-1.5 text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400"}`}>
                        {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "="}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className={`${SETTING_BG} text-white font-semibold`}>
              <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
              <td className={`border border-gray-300 px-4 py-3 text-center ${totalProporsi !== 100 && totalProporsi > 0 ? "text-red-300" : ""}`}>
                {totalProporsi}%
              </td>
              <td className="border border-gray-300 px-4 py-3 text-center">{totalSettingKaryawan > 0 ? totalSettingKaryawan.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-4 py-3 text-center ${ACTUAL_BG}`}>{totalActualKaryawan > 0 ? totalActualKaryawan.toLocaleString() : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// ─── Proportion Table with Setting + Actual column groups ─────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  // Setting
  settingHC: number;
  settingShareKuota: string;
  settingCalcs: number[];
  // Actual
  actualHC: number;
  actualShareKuota: string;
  actualCalcs: number[];
};

function AdjustmentProportionTable({
  title, subtitle, rows, totalSettingHC, totalActualHC,
  gradeHeaders, showParent, parentHeader,
}: {
  title: string;
  subtitle: string;
  rows: PropRow[];
  totalSettingHC: number;
  totalActualHC: number;
  gradeHeaders: string[];
  showParent?: boolean;
  parentHeader?: string;
}) {
  const colName   = title.replace("Proportion per ", "").toUpperCase();
  const nGrades   = gradeHeaders.length;
  const colSpanEach = 2 + nGrades + 1; // HC + ShareKuota + grades + Jumlah

  // Footer totals
  const settingGradeTotals = gradeHeaders.map((_, i) => rows.reduce((s, r) => s + (r.settingCalcs[i] ?? 0), 0));
  const settingGrandTotal  = rows.reduce((s, r) => s + r.settingCalcs.reduce((a, v) => a + v, 0), 0);
  const actualGradeTotals  = gradeHeaders.map((_, i) => rows.reduce((s, r) => s + (r.actualCalcs[i] ?? 0), 0));
  const actualGrandTotal   = rows.reduce((s, r) => s + r.actualCalcs.reduce((a, v) => a + v, 0), 0);

  const thSetting = `border border-gray-300 px-2 py-2 text-center font-semibold text-white text-xs whitespace-nowrap ${SETTING_BG}`;
  const thActual  = `border border-gray-300 px-2 py-2 text-center font-semibold text-white text-xs whitespace-nowrap ${ACTUAL_BG}`;

  return (
    <CollapsibleSection title={title} subtitle={subtitle} defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Row 1 – group labels */}
            <tr>
              {showParent && (
                <th rowSpan={2} className={`${thSetting} text-left`}>{parentHeader}</th>
              )}
              <th rowSpan={2} className={`${thSetting} text-left min-w-[140px]`}>{colName}</th>
              <th colSpan={colSpanEach} className={`border border-gray-300 px-3 py-2 text-center font-bold text-white text-xs tracking-wide ${ACTUAL_BG}`}>
                AKTUAL — Akhir Tahun
              </th>
              <th colSpan={colSpanEach} className={`border border-gray-300 px-3 py-2 text-center font-bold text-white text-xs tracking-wide ${SETTING_BG}`}>
                SETTING — Awal Tahun
              </th>
            </tr>
            {/* Row 2 – sub-columns */}
            <tr>
              {/* Actual sub-cols */}
              <th className={thActual}>HC</th>
              <th className={`${thActual} whitespace-nowrap`}>Share Kuota</th>
              {gradeHeaders.map(g => <th key={`actual-h-${g}`} className={thActual}>{g}</th>)}
              <th className={thActual}>JUMLAH</th>
              {/* Setting sub-cols */}
              <th className={thSetting}>HC</th>
              <th className={`${thSetting} whitespace-nowrap`}>Share Kuota</th>
              {gradeHeaders.map(g => <th key={`setting-h-${g}`} className={thSetting}>{g}</th>)}
              <th className={thSetting}>JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const sTotal = row.settingCalcs.reduce((a, v) => a + v, 0);
              const aTotal = row.actualCalcs.reduce((a, v) => a + v, 0);
              return (
                <tr key={row.id} className="hover:bg-gray-50/70">
                  {showParent && (
                    <td className="border border-gray-300 px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">{row.parentLabel ?? "—"}</td>
                  )}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900 font-medium">{row.label}</td>
                  {/* Actual data cells */}
                  <td className={`border border-gray-300 px-3 py-2.5 text-center font-semibold text-teal-800 ${ACTUAL_CELL}`}>
                    {row.actualHC > 0 ? row.actualHC.toLocaleString() : "—"}
                  </td>
                  <td className={`border border-gray-300 px-3 py-2.5 text-center text-teal-700 ${ACTUAL_CELL}`}>
                    {row.actualShareKuota || "—"}
                  </td>
                  {row.actualCalcs.map((v, i) => (
                    <td key={`a-${i}`} className={`border border-gray-300 px-3 py-2.5 text-center text-teal-800 ${ACTUAL_CELL}`}>
                      {v > 0 ? v : "—"}
                    </td>
                  ))}
                  <td className={`border border-gray-300 px-3 py-2.5 text-center font-semibold text-teal-800 ${ACTUAL_CELL}`}>
                    {aTotal > 0 ? aTotal.toLocaleString() : "—"}
                  </td>
                  {/* Setting data cells */}
                  <td className="border border-gray-300 px-3 py-2.5 text-center text-gray-700 bg-gray-50">
                    {row.settingHC > 0 ? row.settingHC.toLocaleString() : "—"}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center text-gray-600 bg-gray-50">
                    {row.settingShareKuota || "—"}
                  </td>
                  {row.settingCalcs.map((v, i) => (
                    <td key={`s-${i}`} className="border border-gray-300 px-3 py-2.5 text-center text-gray-700 bg-gray-50">
                      {v > 0 ? v : "—"}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2.5 text-center font-medium text-gray-800 bg-gray-50">
                    {sTotal > 0 ? sTotal.toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
            {/* Footer row */}
            <tr className="font-semibold">
              {showParent && <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>—</td>}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>JUMLAH</td>
              {/* Actual footer */}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{totalActualHC > 0 ? totalActualHC.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>100%</td>
              {actualGradeTotals.map((t, i) => (
                <td key={`af-${i}`} className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{t > 0 ? t.toLocaleString() : "—"}</td>
              ))}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{actualGrandTotal > 0 ? actualGrandTotal.toLocaleString() : "—"}</td>
              {/* Setting footer */}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{totalSettingHC > 0 ? totalSettingHC.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>100%</td>
              {settingGradeTotals.map((t, i) => (
                <td key={`sf-${i}`} className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{t > 0 ? t.toLocaleString() : "—"}</td>
              ))}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{settingGrandTotal > 0 ? settingGrandTotal.toLocaleString() : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// ─── Score Adjuster cell ──────────────────────────────────────────────────────


// ─── Catatan Kalibrasi sub-panel ─────────────────────────────────────────────

function CatatanKalibrasi({ comment, evidenceFiles, onLightbox, emptyLabel }: {
  comment?: string;
  evidenceFiles?: EvidenceFile[];
  onLightbox: (f: EvidenceFile) => void;
  emptyLabel?: string;
}) {
  const hasContent = !!comment || !!(evidenceFiles?.length);
  if (!hasContent) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60 border border-gray-200 rounded-xl">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Info</span>
        <p className="text-xs text-gray-400">{emptyLabel ?? "Tidak ada catatan kalibrasi"}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Catatan Kalibrasi</p>
      {comment && (
        <div className="bg-white/70 border border-amber-200 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Komentar</p>
          <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{comment}</p>
        </div>
      )}
      {evidenceFiles && evidenceFiles.length > 0 && (
        <div className="bg-white/70 border border-blue-200 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-2">
            Bukti Pendukung ({evidenceFiles.length} file)
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceFiles.map((f, i) => {
              const isImage = f.mimeType.startsWith("image/");
              const isPdf   = f.mimeType === "application/pdf";
              return (
                <div key={i} className="flex flex-col gap-1">
                  {isImage ? (
                    <button onClick={() => onLightbox(f)}
                      className="w-16 h-16 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 transition-colors focus:outline-none">
                      <img src={f.objectUrl} alt={f.name} className="w-full h-full object-cover" />
                    </button>
                  ) : isPdf ? (
                    <button onClick={() => onLightbox(f)}
                      className="w-16 h-16 rounded-xl border-2 border-blue-200 hover:border-blue-400 transition-colors bg-red-50 flex flex-col items-center justify-center gap-1 focus:outline-none">
                      <Paperclip className="w-5 h-5 text-red-400" />
                      <span className="text-[9px] text-red-500 font-semibold">PDF</span>
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-blue-100 bg-blue-50 flex flex-col items-center justify-center gap-1">
                      <Paperclip className="w-5 h-5 text-blue-300" />
                      <span className="text-[9px] text-blue-400 font-semibold uppercase">
                        {f.name.split(".").pop()?.slice(0, 4) ?? "file"}
                      </span>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-500 truncate max-w-[64px] text-center">{f.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supporting Data Helpers ──────────────────────────────────────────────────

function empKedisiplinan(emp: Employee) {
  const h = idHash(emp.id);
  return [
    { label: "Mangkir",                      value: seededInt(h ^ 0x11, 5,  25) },
    { label: "Terlambat",                    value: seededInt(h ^ 0x22, 10, 35) },
    { label: "Istirahat Cepat",              value: seededInt(h ^ 0x33, 5,  20) },
    { label: "Pulang Istirahat Terlambat", value: seededInt(h ^ 0x44, 10, 30) },
  ];
}
function empPelanggaran(emp: Employee) { return seededInt(idHash(emp.id) ^ 0x55, 0, 40); }
function empKecelakaanKerja(emp: Employee) { return seededInt(idHash(emp.id) ^ 0x99, 0, 3); }
function empProject(emp: Employee)    { return seededInt(idHash(emp.id) ^ 0x66, 0, 3); }

const SUPPORTING_COLUMNS = [
  { key: "mangkir", label: "Mangkir", value: (emp: Employee) => empKedisiplinan(emp).find((item) => item.label === "Mangkir")?.value ?? 0 },
  { key: "pelanggaran", label: "Pelanggaran", value: empPelanggaran },
  { key: "kecelakaanKerja", label: "Kecelakaan Kerja", value: empKecelakaanKerja },
  { key: "projek", label: "Projek", value: empProject },
] as const;

const APPROVER_NOTE_POOL = [
  { module: "KPI",              note: "Pencapaian KPI sangat baik. Target produksi 108% dari rencana tahunan." },
  { module: "Smart Goals",      note: "Semua goal tercapai tepat waktu. Inisiatif pengembangan proses mendapat apresiasi tim manajemen." },
  { module: "Appraisal Form",   note: "Karyawan menunjukkan sikap kerja yang profesional dan kooperatif sepanjang tahun." },
  { module: "Managerial Skill", note: "Kepemimpinan cukup baik. Perlu peningkatan dalam delegasi tugas dan coaching anggota tim." },
];

type RCAEntry = { id: string; masalah: string; status: "Open" | "Closed"; periode: string; factors: string[] };

function empRCAItems(emp: Employee): RCAEntry[] {
  const normalizeId = (id: string) => id.replace(/^emp-mi-/, "").replace(/^EMP-?/, "E");
  return loadMeasurementRCARecords().filter((row) => normalizeId(row.employeeId) === normalizeId(emp.employeeId)).map((row) => ({
    id: row.id, status: row.status, periode: row.periode,
    masalah: row.problems.map((problem) => problem.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "")).join("; ") || "—",
    factors: Array.from(new Set(row.problems.flatMap((problem) => {
      const match = problem.match(/^\[(Faktor (?:Internal|Eksternal))\]/);
      return match ? [match[1]] : [];
    }))),
  }));
}

// ─── Appraisal Detail Card (modal) ───────────────────────────────────────────

function AppraisalDetailCard({
  emp,
  effectiveScores,
  finalScore,
  comment,
  evidenceFiles,
  onClose,
}: {
  emp: Employee;
  effectiveScores: EmpScores;
  finalScore: number;
  comment?: string;
  evidenceFiles?: EvidenceFile[];
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [selYear,  setSelYear]  = useState(currentYear);
  const [lightbox, setLightbox] = useState<EvidenceFile | null>(null);
  const [showRCA,  setShowRCA]  = useState(false);

  const isCurrentYear = selYear === currentYear;

  // Use effectiveScores (includes live MI score from BOD assessment) for current score
  const currentScore = isCurrentYear ? parseFloat(calcFinalScore(emp.level, effectiveScores).toFixed(2)) : 0;
  const hasAdj       = isCurrentYear && parseFloat(finalScore.toFixed(2)) !== currentScore;
  const diff         = parseFloat((finalScore - currentScore).toFixed(2));

  const currentGrade = gradeFromScore(currentScore);
  const finalGrade   = gradeFromScore(finalScore);

  const divisiName  = DIV_DEFS.find(d => d.id === emp.divisiId)?.divisi ?? "—";
  const deptName    = DEPT_DEFS.find(([id]) => id === emp.departemenenId)?.[2] ?? "—";
  const bagianName  = BAGIAN_DEFS.find(([id]) => id === emp.bagianId)?.[2] ?? "—";

  // Supporting data (seeded)
  const kedisiplinan       = empKedisiplinan(emp);
  const pelanggaran        = empPelanggaran(emp);
  const projectCount       = empProject(emp);
  const otherProjectCount  = seededInt(idHash(emp.id) ^ 0x88, 0, 2);
  const rcaItems           = empRCAItems(emp);

  // Grade order for color logic (index = rank, higher = better)
  const GRADE_ORDER = ["E", "D", "C", "B", "A", "A+"];
  const finalCardColors = (fScore: number, cScore: number, fGrade: { grade: string }, cGrade: { grade: string }) => {
    const scoreDiff   = parseFloat((fScore - cScore).toFixed(2));
    const scoreColor  = scoreDiff < 0 ? "#EF4444" : "#10B981";
    const fIdx = GRADE_ORDER.indexOf(fGrade.grade);
    const cIdx = GRADE_ORDER.indexOf(cGrade.grade);
    const gradeColor  = fIdx < cIdx ? "#EF4444" : "#10B981";
    return { scoreColor, gradeColor };
  };
  const rcaOpen      = rcaItems.filter(r => r.status === "Open").length;
  const rcaClosed    = rcaItems.filter(r => r.status === "Closed").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0 text-lg font-black text-[#1A284F] select-none">
              {emp.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">{emp.name}</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{emp.employeeId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[currentYear, currentYear - 1].map(yr => (
                <button key={yr} onClick={() => setSelYear(yr)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selYear === yr ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {yr}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Org info */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[["Divisi", divisiName], ["Departemen", deptName], ["Bagian", bagianName], ["Posisi", emp.level]].map(([lbl, val]) => (
              <div key={lbl} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                <p className="font-semibold text-gray-800 text-xs">{val}</p>
              </div>
            ))}
          </div>

          {/* Year content */}
          {!isCurrentYear ? (() => {
            const pyScores  = pastYearBase(emp);
            const pyScore   = parseFloat(calcFinalScore(emp.level, pyScores).toFixed(2));
            const pyGrade   = gradeFromScore(pyScore);
            // Seeded "final after past calibration" — slight offset
            const pyFinal   = parseFloat((pyScore + seededInt(idHash(emp.id) ^ 0x99, -3, 4)).toFixed(2));
            const pyFGrade  = gradeFromScore(pyFinal);
            const pyDiff    = parseFloat((pyFinal - pyScore).toFixed(2));
            return (
              <>
                {/* Score panel — past year */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Current — {selYear}</p>
                    <div>
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-black tabular-nums" style={{ color: pyGrade.color }}>{pyScore.toFixed(1)}%</span>
                        <span className="text-lg font-black mb-0.5" style={{ color: pyGrade.color }}>{pyGrade.grade}</span>
                      </div>
                      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pyScore, 100)}%`, background: pyGrade.color }} />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const { scoreColor: pyScoreColor, gradeColor: pyGradeColor } = finalCardColors(pyFinal, pyScore, pyFGrade, pyGrade);
                    return (
                      <div className="bg-green-50/60 border border-green-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Final — Setelah Kalibrasi</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">Final</span>
                        </div>
                        <div>
                          <div className="flex items-end gap-2">
                            <span className="text-3xl font-black tabular-nums" style={{ color: pyScoreColor }}>{pyFinal.toFixed(1)}%</span>
                            <span className="text-lg font-black mb-0.5" style={{ color: pyGradeColor }}>{pyFGrade.grade}</span>
                            {pyDiff !== 0 && (
                              <span className="text-sm font-bold tabular-nums mb-0.5" style={{ color: pyScoreColor }}>
                                {pyDiff > 0 ? "+" : ""}{pyDiff.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(pyFinal, 100)}%`, background: pyScoreColor }} />
                          </div>
                          {pyFGrade.grade !== pyGrade.grade && (
                            <p className="text-[10px] mt-1.5 font-semibold" style={{ color: pyGradeColor }}>
                              Grade berubah: <span className="line-through text-gray-400">{pyGrade.grade}</span> → {pyFGrade.grade}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Supporting Data — placeholder */}
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Supporting Data</p>
                  <div className="flex items-center justify-center gap-3 py-8 bg-gray-50 border border-gray-100 rounded-xl">
                    <Clock className="w-5 h-5 text-gray-300 shrink-0" />
                    <p className="text-sm text-gray-400 font-medium">Data pendukung belum tersedia</p>
                  </div>
                </div>
              </>
            );
          })() : (
            <>
              {/* Score panel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Current — {selYear}</p>
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black tabular-nums" style={{ color: currentGrade.color }}>{currentScore.toFixed(1)}%</span>
                      <span className="text-lg font-black mb-0.5" style={{ color: currentGrade.color }}>{currentGrade.grade}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(currentScore, 100)}%`, background: currentGrade.color }} />
                    </div>
                  </div>
                  {/* Score component breakdown */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-200">
                    {([
                      { label: "KPI",                   score: effectiveScores.kpi,                    weight: LEVEL_WEIGHTS[emp.level].kpi, isYtd: emp.kpiIsYtd },
                      { label: "Smart Goals",           score: effectiveScores.smartGoals,             weight: LEVEL_WEIGHTS[emp.level].smartGoals },
                      { label: "Appraisal Form",        score: effectiveScores.appraisalForm,          weight: LEVEL_WEIGHTS[emp.level].appraisalForm },
                      { label: "Managerial Skill",      score: effectiveScores.managerialSkill,        weight: LEVEL_WEIGHTS[emp.level].managerialSkill },
                      { label: "Management Interview",  score: effectiveScores.managementInterview,    weight: LEVEL_WEIGHTS[emp.level].managementInterview, isMI: true },
                      { label: "Project Outside",       score: effectiveScores.projectOutsideJobScope, weight: LEVEL_WEIGHTS[emp.level].projectOutsideJobScope },
                    ] as { label: string; score: number | null; weight: number; isMI?: boolean; isYtd?: boolean }[])
                      .filter(r => r.weight > 0)
                      .map(r => (
                        <div key={r.label} className="flex items-center justify-between text-[10px]">
                          <span className={`flex items-center gap-1 ${r.isMI ? "text-indigo-600 font-semibold" : "text-gray-500"}`}>
                            {r.label}
                            {r.isYtd && (
                              <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[9px]">YTD</span>
                            )}
                            {r.isMI && r.score !== null && (
                              <span className="px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 font-bold text-[9px]">Assessment</span>
                            )}
                            <span className="text-gray-300">({Math.round(r.weight * 100)}%)</span>
                          </span>
                          <span className={`font-bold tabular-nums ${r.score == null ? "text-gray-300" : r.isMI ? "text-indigo-700" : "text-gray-700"}`}>
                            {r.score != null ? `${r.score.toFixed(1)}%` : "—"}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
                {(() => {
                  const { scoreColor, gradeColor } = finalCardColors(finalScore, currentScore, finalGrade, currentGrade);
                  return (
                    <div className="bg-green-50/60 border border-green-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Final — Setelah Kalibrasi</p>
                      <div>
                        <div className="flex items-end gap-2">
                          <span className="text-3xl font-black tabular-nums" style={{ color: scoreColor }}>{finalScore.toFixed(1)}%</span>
                          <span className="text-lg font-black mb-0.5" style={{ color: gradeColor }}>{finalGrade.grade}</span>
                          {hasAdj && (
                            <span className="text-sm font-bold tabular-nums mb-0.5" style={{ color: scoreColor }}>
                              {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(finalScore, 100)}%`, background: scoreColor }} />
                        </div>
                        {hasAdj && finalGrade.grade !== currentGrade.grade && (
                          <p className="text-[10px] mt-1.5 font-semibold" style={{ color: gradeColor }}>
                            Grade berubah: <span className="line-through text-gray-400">{currentGrade.grade}</span> → {finalGrade.grade}
                          </p>
                        )}
                        {!hasAdj && <p className="text-[10px] mt-1.5 text-gray-400">Belum ada penyesuaian kalibrasi</p>}
                      </div>
                      <CatatanKalibrasi comment={comment} evidenceFiles={evidenceFiles} onLightbox={setLightbox} emptyLabel={hasAdj ? "Ada penyesuaian nilai final dari kalibrasi dengan mempertimbangkan supporting data yang dimiliki" : "Tidak ada kalibrasi untuk tahun ini"} />
                    </div>
                  );
                })()}
              </div>

              {/* ── Supporting Data ──────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Supporting Data</p>

                {/* 1. Project · Kedisiplinan · Pelanggaran */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Project · Kedisiplinan · Pelanggaran</p>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Project Outside Job Scope</p>
                      <p className="text-2xl font-black text-[#1A284F] tabular-nums">{projectCount}</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Other Project</p>
                      <p className="text-2xl font-black text-blue-600 tabular-nums">{otherProjectCount}</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-orange-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">Pelanggaran</p>
                      <p className="text-2xl font-black text-orange-600 tabular-nums">{pelanggaran}</p>
                      <p className="text-[10px] text-gray-400">point matrix</p>
                    </div>
                    <div className="bg-white rounded-xl border border-amber-200 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Kecelakaan Kerja</p>
                      <p className="text-2xl font-black text-amber-700 tabular-nums">{empKecelakaanKerja(emp)}</p>
                      <p className="text-[10px] text-gray-400">kejadian</p>
                    </div>
                    <div className="bg-white rounded-xl border border-red-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Kedisiplinan</p>
                      <p className="text-2xl font-black text-red-500 tabular-nums">{kedisiplinan.reduce((s, k) => s + k.value, 0)}</p>
                      <p className="text-[10px] text-gray-400">total kejadian</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {kedisiplinan.map(k => (
                      <div key={k.label} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <span className="text-xs text-gray-600">{k.label}</span>
                        <span className="text-xs font-bold text-gray-800 tabular-nums">{k.value}×</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Summary Notes from All Approvers */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Summary Note — All Approver · All Modul</p>
                  <div className="flex flex-col gap-2">
                    {APPROVER_NOTE_POOL.filter(n => n.module !== "Managerial Skill" || emp.base.managerialSkill !== null).map(n => (
                      <div key={n.module} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#1A284F] uppercase tracking-wide">{n.module}</span>
                        <p className="text-xs text-gray-700 leading-relaxed">{n.note}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. RCA */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">RCA (Root Cause Analysis)</p>
                    <button onClick={() => setShowRCA(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1A284F] hover:underline underline-offset-2">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">RCA Open</p>
                      <p className="text-2xl font-black text-amber-600 tabular-nums">{rcaOpen}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {["Faktor Eksternal", "Faktor Internal"].map((factor) => {
                          const count = rcaItems.filter((item) => item.status === "Open" && item.factors.includes(factor)).length;
                          return count > 0 ? <span key={factor} className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${factor === "Faktor Internal" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>{factor}: {count}</span> : null;
                        })}
                        {!rcaItems.some((item) => item.status === "Open" && item.factors.length > 0) && <span className="text-[10px] text-gray-400">Belum ada data faktor RCA Open.</span>}
                      </div>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">RCA Closed</p>
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">{rcaClosed}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {["Faktor Eksternal", "Faktor Internal"].map((factor) => {
                          const count = rcaItems.filter((item) => item.status === "Closed" && item.factors.includes(factor)).length;
                          return count > 0 ? <span key={factor} className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${factor === "Faktor Internal" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>{factor}: {count}</span> : null;
                        })}
                        {!rcaItems.some((item) => item.status === "Closed" && item.factors.length > 0) && <span className="text-[10px] text-gray-400">Belum ada data faktor RCA Closed.</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RCA detail modal */}
      {showRCA && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRCA(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Detail RCA</h3>
                <p className="text-xs text-gray-400 mt-0.5">{emp.name} · {rcaOpen} Open · {rcaClosed} Closed</p>
              </div>
              <button onClick={() => setShowRCA(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1A284F] text-white">
                    <th className="px-3 py-2 text-left font-semibold rounded-tl-lg w-8">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Masalah Utama</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Periode</th>
                    <th className="px-3 py-2 text-center font-semibold rounded-tr-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rcaItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-gray-400">Tidak ada RCA</td>
                    </tr>
                  ) : rcaItems.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="px-3 py-2.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2.5 text-gray-800 font-medium"><div className="mb-1 flex flex-wrap gap-1">{r.factors.map((factor) => <span key={factor} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${factor === "Faktor Internal" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>{factor}</span>)}</div>{r.masalah}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500 whitespace-nowrap">{r.periode}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "Open" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
            {lightbox.mimeType.startsWith("image/") ? (
              <img src={lightbox.objectUrl} alt={lightbox.name}
                className="max-h-[80vh] max-w-full rounded-xl shadow-2xl object-contain" />
            ) : (
              <iframe src={lightbox.objectUrl} title={lightbox.name}
                className="w-full h-[80vh] rounded-xl shadow-2xl bg-white" />
            )}
            <p className="mt-3 text-white/60 text-sm">{lightbox.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Employee Adjustment Section ──────────────────────────────────────────────

function EmployeeAdjustmentSection({
  unitName,
  editMode,
  adjustments,
  setAdjustments,
  onStart,
  onSave,
  onCancel,
  pageMode,
  onPreview,
  onBackToEdit,
  canSubmit,
  onSubmit,
}: {
  unitName?: string;
  editMode: boolean;
  adjustments: Record<string, number>;
  setAdjustments: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  onStart:     () => void;
  onSave:      () => void;
  onCancel:    () => void;
  pageMode:    PageMode;
  onPreview:   () => void;
  onBackToEdit:() => void;
  canSubmit:   boolean;
  onSubmit:    () => void;
}) {
  const [selDivisi,  setSelDivisi]  = useState("__all__");
  const [search, setSearch] = useState("");
  const [selDept,    setSelDept]    = useState("__all__");
  const [selBagian,  setSelBagian]  = useState("__all__");
  const [selPosisi,  setSelPosisi]  = useState("__all__");
  const [selGrade,   setSelGrade]   = useState("__all__");
  const [detailEmp,  setDetailEmp]  = useState<Employee | null>(null);
  const [comments,   setComments]   = useState<Record<string, string>>(() =>
    loadPersistedState("pa_calibration_adj_comments_v1", {})
  );
  const [evidence,   setEvidence]   = useState<Record<string, EvidenceFile[]>>(() =>
    loadPersistedState("pa_calibration_adj_evidence_v1", {})
  );
  const [sortKey,    setSortKey]    = useState<string | null>(null);
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("asc");
  const [freeEdit,   setFreeEdit]   = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const supportingColumns = SUPPORTING_COLUMNS.filter((column) => visibleColumns[column.key]);

  // Live Management Interview scores from BOD assessment (0–100 percentage)
  const MI_EMP_MAP: Record<string, string> = {
    "emp-mi-E002": "E002",
    "emp-mi-E011": "E011",
    "emp-mi-E013": "E013",
    "emp-mi-E014": "E014",
  };
  const buildMIScores = useCallback(() => {
    const result: Record<string, number | null> = {};
    Object.entries(MI_EMP_MAP).forEach(([empId, monId]) => {
      result[empId] = getPenilai1ScoreAsPercent(monId);
    });
    return result;
  }, []);
  const [miScores, setMIScores] = useState<Record<string, number | null>>(buildMIScores);
  useEffect(() => {
    return subscribeScores(() => setMIScores(buildMIScores()));
  }, [buildMIScores]);

  const unitEmployees = useMemo(
    () => ALL_EMPLOYEES.filter((e) => !unitName || e.companyUnit === unitName),
    [unitName, adjustments],
  );

  const dynamicDivDefs = useMemo(() => {
    const map = new Map<string, string>();
    unitEmployees.forEach((e) => {
      const label = e.divisionName ?? DIV_DEFS.find((d) => d.id === e.divisiId)?.divisi ?? e.divisiId;
      if (e.divisiId && label) map.set(e.divisiId, label);
    });
    return Array.from(map.entries()).map(([id, divisi]) => ({ id, divisi }));
  }, [unitEmployees]);

  const dynamicDeptDefs = useMemo(() => {
    const map = new Map<string, [string, string, string]>();
    unitEmployees.forEach((e) => {
      const label = e.departmentName ?? DEPT_DEFS.find(([id]) => id === e.departemenenId)?.[2] ?? e.departemenenId;
      if (e.departemenenId && label) map.set(e.departemenenId, [e.departemenenId, e.divisiId, label]);
    });
    return Array.from(map.values());
  }, [unitEmployees]);

  const dynamicBagianDefs = useMemo(() => {
    const map = new Map<string, [string, string, string]>();
    unitEmployees.forEach((e) => {
      const label = e.bagianName ?? BAGIAN_DEFS.find(([id]) => id === e.bagianId)?.[2] ?? e.bagianId;
      if (e.bagianId && label) map.set(e.bagianId, [e.bagianId, e.departemenenId, label]);
    });
    return Array.from(map.values());
  }, [unitEmployees]);

  const deptOptions = dynamicDeptDefs.filter(([, divId]) =>
    selDivisi === "__all__" || divId === selDivisi,
  );

  const bagianOptions = dynamicBagianDefs.filter(([, deptId]) => {
    const dept = dynamicDeptDefs.find(([dId]) => dId === deptId);
    if (!dept) return false;
    if (selDivisi !== "__all__" && dept[1] !== selDivisi) return false;
    if (selDept !== "__all__" && deptId !== selDept) return false;
    return true;
  });

  const filtered = unitEmployees.filter(e => {
    if (isYearEndInactive(e.employeeId)) return false;
    const query = search.trim().toLowerCase();
    if (query && !e.name.toLowerCase().includes(query) && !e.employeeId.toLowerCase().replace(/-/g, "").includes(query.replace(/-/g, ""))) return false;
    if (selDivisi !== "__all__" && e.divisiId       !== selDivisi) return false;
    if (selDept   !== "__all__" && e.departemenenId !== selDept)   return false;
    if (selBagian !== "__all__" && e.bagianId       !== selBagian) return false;
    if (selPosisi !== "__all__" && e.level          !== selPosisi) return false;
    if (selGrade  !== "__all__" && gradeFromScore(calcFinalScore(e.level, applyYearEndScorePolicy(e.employeeId, e.base))).grade !== selGrade) return false;
    return true;
  });

  const posisiOptions: EmpLevel[] = ["Kepala Bagian", "Pengawas", "Operasional", "Kepala Departemen", "Kepala Divisi"];

  const adjustedCount = Object.keys(adjustments).filter(id => unitEmployees.find(e => e.id === id)).length;

  const getEffectiveScores = (emp: Employee): EmpScores => {
    if (emp.id in miScores && miScores[emp.id] !== null) {
      return applyYearEndScorePolicy(emp.employeeId, { ...emp.base, managementInterview: miScores[emp.id] });
    }
    return applyYearEndScorePolicy(emp.employeeId, emp.base);
  };
  const getBase  = (emp: Employee) => parseFloat(calcFinalScore(emp.level, getEffectiveScores(emp)).toFixed(2));
  const getFinal = (emp: Employee) => adjustments[emp.id] ?? getBase(emp);

  const setFinal = (emp: Employee, val: number) =>
    setAdjustments(prev => ({ ...prev, [emp.id]: parseFloat(val.toFixed(2)) }));

  const GRADE_ORDER: Record<string, number> = { "A+": 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let va = 0, vb = 0;
      if      (sortKey === "kpi")             { va = a.base.kpi;                    vb = b.base.kpi; }
      else if (sortKey === "project")         { va = a.base.projectOutsideJobScope; vb = b.base.projectOutsideJobScope; }
      else if (sortKey === "smartGoals")      { va = a.base.smartGoals;             vb = b.base.smartGoals; }
      else if (sortKey === "appraisalForm")   { va = a.base.appraisalForm;          vb = b.base.appraisalForm; }
      else if (sortKey === "managerialSkill") { va = a.base.managerialSkill ?? -1;  vb = b.base.managerialSkill ?? -1; }
      else if (sortKey === "mgmtInterview")   { va = getEffectiveScores(a).managementInterview ?? -1; vb = getEffectiveScores(b).managementInterview ?? -1; }
      else if (sortKey === "nilaiAkhir")      { va = getFinal(a);                   vb = getFinal(b); }
      else if (sortKey === "grade")           { va = GRADE_ORDER[gradeFromScore(getFinal(a)).grade] ?? 0; vb = GRADE_ORDER[gradeFromScore(getFinal(b)).grade] ?? 0; }
      else {
        const column = SUPPORTING_COLUMNS.find((item) => item.key === sortKey);
        if (column) { va = column.value(a); vb = column.value(b); }
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortKey, sortDir, adjustments]);

  const resetEmp = (id: string) => {
    setAdjustments(prev => { const n = { ...prev }; delete n[id]; return n; });
    setComments(prev   => { const n = { ...prev }; delete n[id]; return n; });
    setEvidence(prev   => { const n = { ...prev }; delete n[id]; return n; });
  };

  const thBase = "border border-gray-600 px-2 py-2.5 text-center text-xs font-semibold text-white whitespace-nowrap";

  // Grade summary over filtered employees
  const GRADE_COLORS: Record<string, string> = {
    "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
  };
  const gradeSummaryBefore = filtered.reduce<Record<string, number>>((acc, emp) => {
    const { grade } = gradeFromScore(getBase(emp));
    acc[grade] = (acc[grade] ?? 0) + 1;
    return acc;
  }, {});
  const gradeSummaryAfter = filtered.reduce<Record<string, number>>((acc, emp) => {
    const { grade } = gradeFromScore(getFinal(emp));
    acc[grade] = (acc[grade] ?? 0) + 1;
    return acc;
  }, {});

  const handleExport = () => {
    const headers = ["Nama","ID Karyawan","Level","Divisi","Departemen","Bagian","KPI","Project","Smart Goals","Appraisal Form","Managerial Skill","Mgmt Interview","Nilai Akhir","Grade"];
    const rows = sorted.map(emp => {
      const divisiName = emp.divisionName ?? DIV_DEFS.find(d => d.id === emp.divisiId)?.divisi ?? "";
      const deptName   = emp.departmentName ?? DEPT_DEFS.find(([id]) => id === emp.departemenenId)?.[2] ?? "";
      const bagianName = emp.bagianName ?? BAGIAN_DEFS.find(([id]) => id === emp.bagianId)?.[2] ?? "";
      const final      = getFinal(emp);
      return [
        emp.name, emp.employeeId, emp.level, divisiName, deptName, bagianName,
        emp.base.kpi, emp.base.projectOutsideJobScope,
        emp.base.smartGoals, emp.base.appraisalForm,
        emp.base.managerialSkill ?? "", getEffectiveScores(emp).managementInterview ?? "",
        final.toFixed(2), gradeFromScore(final).grade,
      ];
    });
    exportXLSX("Calibration_Adjustment.xlsx", headers, rows);
  };

  const handleImport = (file: File) => {
    parseXLSX(file).then(({ headers, rows }) => {
      const employeeIdIdx = headers.findIndex((header) => /id\s*karyawan|employee\s*id/i.test(header));
      const nipIdx = employeeIdIdx >= 0 ? employeeIdIdx : headers.findIndex((header) => /nip/i.test(header));
      const finalIdx = headers.findIndex(h => /nilai.akhir/i.test(h));
      if (nipIdx < 0 || finalIdx < 0) return;
      setAdjustments(prev => {
        const next = { ...prev };
        rows.forEach(row => {
          const nip   = row[nipIdx]?.trim();
          const val   = parseFloat(row[finalIdx]);
          const emp = ALL_EMPLOYEES.find((entry) => employeeIdIdx >= 0 ? entry.employeeId.replace("-", "") === nip?.replace("-", "") : entry.nip === nip);
          if (emp && !isNaN(val)) next[emp.id] = val;
        });
        return next;
      });
    });
  };

  const sectionActions = pageMode === "submitted" ? null : (
    <>
      <ExportImportButton onExport={handleExport} onImport={handleImport} size="sm" />
      <span className="w-px h-5 bg-gray-200 mx-1" />
      {/* Calibration actions */}
      {editMode && (
        <button onClick={onCancel}
          className="px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      )}
      <button onClick={editMode ? onSave : onStart}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1A284F] text-white rounded-lg text-xs font-semibold hover:bg-[#131d3b] transition-colors shadow-sm">
        {editMode ? <><Save className="w-3.5 h-3.5" />Save Changes</> : <><Edit2 className="w-3.5 h-3.5" />Start Adjusting</>}
      </button>

      {/* Separator */}
      <span className="w-px h-5 bg-gray-200 mx-1" />

      {/* Submit */}
      <button disabled={!canSubmit} onClick={canSubmit ? onSubmit : undefined}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm ${canSubmit ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
        <Send className="w-3.5 h-3.5" />Submit
      </button>
    </>
  );

  return (
    <CollapsibleSection
      title="Employee Performance Calibration Adjustment"
      subtitle="Kalibrasi Nilai Akhir per karyawan ±5% dari nilai akhir (contoh: 73.7% → ±3.69%)"
      defaultOpen={true}
      actions={sectionActions}
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-gray-100">
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <label htmlFor="calibration-employee-search" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search</label>
          <input id="calibration-employee-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama atau ID Karyawan..." className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20" />
        </div>
        {[
          {
            label: "Divisi", value: selDivisi,
            options: [["__all__","Semua Divisi"], ...dynamicDivDefs.map(d => [d.id, d.divisi])],
            onChange: (v: string) => { setSelDivisi(v); setSelDept("__all__"); setSelBagian("__all__"); setSelPosisi("__all__"); },
          },
          {
            label: "Departemen", value: selDept,
            options: [["__all__","Semua Departemen"], ...deptOptions.map(([id,,name]) => [id,name])],
            onChange: (v: string) => { setSelDept(v); setSelBagian("__all__"); },
          },
          {
            label: "Bagian", value: selBagian,
            options: [["__all__","Semua Bagian"], ...bagianOptions.map(([id,,name]) => [id,name])],
            onChange: (v: string) => setSelBagian(v),
          },
          {
            label: "Posisi", value: selPosisi,
            options: [["__all__","Semua Posisi"], ...posisiOptions.map(p => [p, p])],
            onChange: (v: string) => setSelPosisi(v),
          },
          {
            label: "Grade", value: selGrade,
            options: [["__all__","Semua Grade"], ...["A+","A","B","C","D","E"].map(g => [g, `Grade ${g}`])],
            onChange: (v: string) => setSelGrade(v),
          },
        ].map(({ label, value, options, onChange }) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
            <div className="relative">
              <select value={value} onChange={e => onChange(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 min-w-[180px] cursor-pointer">
                {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
        ))}
        {(search || selDivisi !== "__all__" || selDept !== "__all__" || selBagian !== "__all__" || selPosisi !== "__all__" || selGrade !== "__all__") && (
          <button onClick={() => { setSearch(""); setSelDivisi("__all__"); setSelDept("__all__"); setSelBagian("__all__"); setSelPosisi("__all__"); setSelGrade("__all__"); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors self-end">
            <X className="w-3.5 h-3.5" />Clear Filter
          </button>
        )}
        {adjustedCount > 0 && (
          <button onClick={() => { setAdjustments({}); setComments({}); setEvidence({}); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors self-end">
            <RotateCcw className="w-3.5 h-3.5" />Reset Semua ({adjustedCount})
          </button>
        )}
      </div>

      {/* Summary cards — single row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* Total */}
        <div className="bg-[#1A284F]/5 border border-[#1A284F]/10 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Total Karyawan</p>
          <p className="text-2xl font-black text-[#1A284F] tabular-nums">{filtered.length}</p>
          {adjustedCount > 0 && (
            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">{adjustedCount} disesuaikan</p>
          )}
        </div>
        {/* Before */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Distribusi Grade — Sebelum Kalibrasi</p>
          <div className="flex items-center gap-2 flex-wrap">
            {["A+","A","B","C","D","E"].map(g => {
              const cnt = gradeSummaryBefore[g] ?? 0;
              return (
                <div key={g} className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md text-white min-w-[28px] text-center"
                    style={{ background: GRADE_COLORS[g] }}>{g}</span>
                  <span className="text-sm font-bold tabular-nums text-gray-800">{cnt}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* After */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-2">Distribusi Grade — Setelah Kalibrasi</p>
          <div className="flex items-center gap-2 flex-wrap">
            {["A+","A","B","C","D","E"].map(g => {
              const cntBefore = gradeSummaryBefore[g] ?? 0;
              const cntAfter  = gradeSummaryAfter[g]  ?? 0;
              const diff      = cntAfter - cntBefore;
              return (
                <div key={g} className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md text-white min-w-[28px] text-center"
                    style={{ background: GRADE_COLORS[g] }}>{g}</span>
                  <span className="text-sm font-bold tabular-nums text-gray-800">{cntAfter}</span>
                  {diff !== 0 && (
                    <span className={`text-[10px] font-bold tabular-nums ${diff > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Read-only notice */}
      {!editMode && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
          <Lock className="w-4 h-4 shrink-0 text-gray-400" />
          Tabel dalam mode <strong className="text-gray-700 mx-1">Read-Only</strong>. Klik
          <span className="mx-1 px-2 py-0.5 bg-[#1A284F] text-white rounded text-xs font-medium">Start Adjusting</span>
          untuk mengaktifkan penyesuaian.
        </div>
      )}

      {/* Free-edit toggle */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-4 items-stretch">
      <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
        freeEdit
          ? "bg-orange-50 border-orange-300"
          : "bg-gray-50 border-gray-200 hover:bg-gray-100/70"
      } ${!editMode ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="relative flex items-center shrink-0">
          <input
            type="checkbox"
            checked={freeEdit}
            onChange={e => setFreeEdit(e.target.checked)}
            disabled={!editMode}
            className="sr-only peer"
          />
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            freeEdit ? "bg-orange-500 border-orange-500" : "bg-white border-gray-300"
          }`}>
            {freeEdit && (
              <svg viewBox="0 0 10 8" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4l3 3 5-6" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${freeEdit ? "text-orange-800" : "text-gray-700"}`}>
            Override Batas Kalibrasi — Adjust Nilai Akhir Tanpa Batasan
          </p>
          <p className={`text-xs mt-0.5 ${freeEdit ? "text-orange-600" : "text-gray-400"}`}>
            {freeEdit
              ? "Mode aktif: nilai akhir dapat diatur bebas dari 0–100 tanpa batas ±5%"
              : "Secara default nilai akhir dibatasi ±5% dari nilai dasar. Centang untuk menghapus batasan ini."}
          </p>
        </div>
        {freeEdit && (
          <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white uppercase tracking-wide">
            Tanpa Batasan
          </span>
        )}
      </label>
      <fieldset className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <legend className="px-1 text-xs font-semibold text-gray-600">Tampilkan Kolom Tambahan</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {SUPPORTING_COLUMNS.map((column) => <label key={column.key} className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={!!visibleColumns[column.key]} onChange={(event) => {
              const checked = event.target.checked;
              setVisibleColumns((previous) => ({ ...previous, [column.key]: checked }));
              if (!checked && sortKey === column.key) setSortKey(null);
            }} className="h-4 w-4 rounded accent-[#1A284F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" />
            {column.label}
          </label>)}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Default tersembunyi. Centang untuk menampilkan, hilangkan centang untuk menyembunyikan.</p>
      </fieldset>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 1340 }}>
          <thead>
            <tr className="bg-[#1A284F] text-white text-xs">
              <th className={`${thBase} text-left w-8`}>#</th>
              <th className={`${thBase} text-left min-w-[120px]`}>ID Karyawan</th>
              <th className={`${thBase} text-left min-w-[160px]`}>Nama</th>
              <th className={`${thBase} min-w-[120px]`}>Divisi</th>
              <th className={`${thBase} min-w-[140px]`}>Departemen</th>
              <th className={`${thBase} min-w-[140px]`}>Bagian</th>
              <th className={`${thBase} min-w-[120px]`}>Posisi</th>
              {([
                { key: "kpi",           label: "KPI",             extra: <><br/><span className="text-gray-400 font-normal text-[9px]">🔒</span></>, bg: "bg-[#111d3a]" },
                { key: "project",       label: "Project",         extra: <><br/><span className="text-gray-400 font-normal text-[9px]">🔒</span></>, bg: "bg-[#111d3a]" },
                { key: "smartGoals",    label: "SMART Goals",     extra: null,                                                                     bg: "bg-[#1e3260]" },
                { key: "appraisalForm", label: "Appraisal Form",  extra: null,                                                                     bg: "bg-[#1e3260]" },
                { key: "managerialSkill",  label: "Managerial Skill",  extra: null,                                                                bg: "bg-[#1e3260]" },
                { key: "mgmtInterview", label: "Mgmt Interview",  extra: null,                                                                     bg: "bg-[#1e3260]" },
              ] as { key: string; label: string; extra: React.ReactNode; bg: string }[]).map(col => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`${thBase} ${col.bg} cursor-pointer select-none hover:brightness-110 transition-all`}>
                  <div className="flex items-center justify-center gap-1">
                    <span>{col.label}{col.extra}</span>
                    {sortKey === col.key
                      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                      : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                  </div>
                </th>
              ))}
              <th onClick={() => toggleSort("nilaiAkhir")}
                className={`${thBase} min-w-[140px] cursor-pointer select-none hover:brightness-110 transition-all`}>
                <div className="flex items-center justify-center gap-1">
                  <span>Nilai Akhir{editMode && <span className="ml-1 text-indigo-300 font-normal text-[9px]">{freeEdit ? "Unlimited" : "±5%"}</span>}</span>
                  {sortKey === "nilaiAkhir"
                    ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                    : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                </div>
              </th>
              <th onClick={() => toggleSort("grade")}
                className={`${thBase} cursor-pointer select-none hover:brightness-110 transition-all`}>
                <div className="flex items-center justify-center gap-1">
                  <span>Grade</span>
                  {sortKey === "grade"
                    ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                    : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                </div>
              </th>
              {supportingColumns.map((column) => (
                <th key={column.key} scope="col" aria-sort={sortKey === column.key ? sortDir === "asc" ? "ascending" : "descending" : "none"} className={`${thBase} min-w-[100px]`}>
                  <button type="button" onClick={() => toggleSort(column.key)} className="flex w-full items-center justify-center gap-1 rounded px-1 py-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <span>{column.label}</span>
                    {sortKey === column.key
                      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                      : <span className="text-gray-400 text-[9px] leading-none">⇅</span>}
                  </button>
                </th>
              ))}
              <th className={`${thBase} min-w-[200px]`}>Bukti</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={16 + supportingColumns.length} className="py-12 text-center text-gray-400 text-sm">
                  Tidak ada karyawan ditemukan. Coba ubah filter di atas.
                </td>
              </tr>
            ) : sorted.map((emp, idx) => {
              const base      = getBase(emp);
              const final     = getFinal(emp);
              const hasAdj    = !!adjustments[emp.id];
              const diff      = parseFloat((final - base).toFixed(2));
              const diffPct   = base > 0 ? parseFloat(((diff / base) * 100).toFixed(2)) : 0;
              const bGrade    = gradeFromScore(base);
              const fGrade    = gradeFromScore(final);
              const step      = freeEdit ? 1.0 : parseFloat((base * 0.01).toFixed(2));
              const minFinal  = freeEdit ? 0   : parseFloat((base * 0.95).toFixed(2));
              const maxFinal  = freeEdit ? 100 : parseFloat((base * 1.05).toFixed(2));
              const yeState   = loadYearEndState();
              const normEmpId = normalizeEmployeeId(emp.employeeId);
              const isExempt  = yeState.inactive.some((id) => normalizeEmployeeId(id) === normEmpId) ||
                                yeState.ignored.some((id) => normalizeEmployeeId(id) === normEmpId);
              const empReadyForCal = Boolean(emp.isCalibrationReady || isExempt);
              const canDec    = empReadyForCal && (freeEdit ? final > 0   : final > minFinal + 0.001);
              const canInc    = empReadyForCal && (freeEdit ? final < 100 : final < maxFinal - 0.001);

              const divisiName = emp.divisionName ?? DIV_DEFS.find(d => d.id === emp.divisiId)?.divisi ?? "—";
              const deptName   = emp.departmentName ?? DEPT_DEFS.find(([id]) => id === emp.departemenenId)?.[2] ?? "—";
              const bagianName = emp.bagianName ?? BAGIAN_DEFS.find(([id]) => id === emp.bagianId)?.[2] ?? "—";

              const posColor =
                emp.level === "Kepala Bagian"     ? "bg-purple-50 text-purple-700 border-purple-200" :
                emp.level === "Pengawas"          ? "bg-blue-50 text-blue-700 border-blue-200" :
                emp.level === "Kepala Departemen" ? "bg-orange-50 text-orange-700 border-orange-200" :
                emp.level === "Kepala Divisi"     ? "bg-red-50 text-red-700 border-red-200" :
                "bg-gray-100 text-gray-600 border-gray-200";

              return (
                <tr key={emp.id} className={`border-b border-gray-100 transition-colors ${hasAdj ? "bg-amber-50/40 hover:bg-amber-50/60" : "hover:bg-gray-50/60"}`}>
                  <td className="border border-gray-100 px-3 py-2 text-center text-gray-400 text-xs">{idx + 1}</td>

                  <td className="border border-gray-100 px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-600">{emp.employeeId}</td>

                  <td className="border border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#1A284F] text-xs leading-tight truncate">{emp.name}</p>
                      </div>
                      <button onClick={() => setDetailEmp(emp)}
                        className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
                        title="View Detail">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>

                  <td className="border border-gray-100 px-3 py-2 text-xs text-gray-700">{divisiName}</td>
                  <td className="border border-gray-100 px-3 py-2 text-xs text-gray-700">{deptName}</td>
                  <td className="border border-gray-100 px-3 py-2 text-xs text-gray-700">{bagianName}</td>

                  <td className="border border-gray-100 px-3 py-2 text-center">
                    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap border ${posColor}`}>{emp.level}</span>
                  </td>

                  <td className="border border-gray-100 px-3 py-2 text-center bg-gray-50 text-xs font-semibold text-gray-600">
                    <div className="inline-flex items-center justify-center gap-1">
                      <span>{emp.base.kpi}%</span>
                      {emp.kpiIsYtd && (
                        <span
                          className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold leading-none"
                          title="Nilai berjalan Year-to-Date (menunggu KPI 12 bulan lengkap & Validated HR ICF)"
                        >
                          YTD
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-100 px-3 py-2 text-center bg-gray-50 text-xs font-semibold text-gray-600">
                    {emp.base.projectOutsideJobScope}%
                  </td>
                  <td className="border border-gray-100 px-3 py-2 text-center bg-[#f7f8fc] text-xs text-gray-600">
                    {emp.base.smartGoals != null ? `${emp.base.smartGoals}%` : "—"}
                  </td>
                  <td className="border border-gray-100 px-3 py-2 text-center bg-[#f7f8fc] text-xs text-gray-600">
                    {emp.base.appraisalForm != null ? `${emp.base.appraisalForm}%` : "—"}
                  </td>
                  <td className="border border-gray-100 px-3 py-2 text-center bg-[#f7f8fc] text-xs text-gray-600">
                    {emp.base.managerialSkill != null ? `${emp.base.managerialSkill}%` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="border border-gray-100 px-3 py-2 text-center bg-[#f7f8fc] text-xs text-gray-600">
                    {(() => {
                      const live = getEffectiveScores(emp).managementInterview;
                      return live != null
                        ? <span className="text-indigo-700 font-semibold">{live.toFixed(2)}%</span>
                        : <span className="text-gray-300">—</span>;
                    })()}
                  </td>

                  {/* Nilai Akhir – editable ±5% of base score */}
                  <td className="border border-gray-100 px-2 py-2 text-center">
                    {editMode ? (
                      empReadyForCal ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <div className="flex items-center gap-0.5">
                            <button disabled={!canDec}
                              onClick={() => setFinal(emp, Math.max(minFinal, parseFloat((final - step).toFixed(2))))}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-700 font-bold text-xs transition-colors select-none">−</button>
                            <span className={`w-16 text-center font-bold text-sm tabular-nums ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-800"}`}>
                              {final.toFixed(2)}%
                            </span>
                            <button disabled={!canInc}
                              onClick={() => setFinal(emp, Math.min(maxFinal, parseFloat((final + step).toFixed(2))))}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-gray-700 font-bold text-xs transition-colors select-none">+</button>
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${diffPct > 0 ? "text-emerald-500" : diffPct < 0 ? "text-red-400" : "text-gray-300"}`}>
                            {diffPct > 0 ? `+${diffPct.toFixed(1)}%` : diffPct < 0 ? `${diffPct.toFixed(1)}%` : "base"}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col items-center gap-0.5"
                          title="Seluruh modul wajib (termasuk KPI Full-Year 12 Bulan) harus berstatus Validated sebelum dapat dikalibrasi"
                        >
                          <span className="font-bold text-sm tabular-nums text-gray-400">{final.toFixed(2)}%</span>
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold whitespace-nowrap">
                            <Lock className="w-2.5 h-2.5" /> Perlu Validated
                          </span>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className={`font-bold text-sm tabular-nums ${diff !== 0 ? (diff > 0 ? "text-emerald-600" : "text-red-500") : "text-gray-800"}`}>
                          {final.toFixed(2)}%
                        </span>
                        {diff !== 0 && (
                          <span className={`text-[10px] font-bold ${diffPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Grade */}
                  <td className="border border-gray-100 px-3 py-2 text-center">
                    <span className="font-bold text-sm" style={{ color: fGrade.color }}>{fGrade.grade}</span>
                    {fGrade.grade !== bGrade.grade && (
                      <p className="text-[10px] text-gray-400 line-through leading-none mt-0.5">{bGrade.grade}</p>
                    )}
                  </td>

                  {supportingColumns.map((column) => <td key={column.key} className="border border-gray-100 px-3 py-2 text-center text-xs tabular-nums text-gray-700">{column.value(emp)}</td>)}

                  {/* Aksi */}
                  <td className="border border-gray-100 px-2 py-2 align-top">
                    {editMode && hasAdj ? (
                      <div className="flex flex-col gap-1.5">
                        {/* Comment */}
                        <textarea
                          rows={2}
                          placeholder="Tambah komentar..."
                          value={comments[emp.id] ?? ""}
                          onChange={e => {
                            const val = e.target.value;
                            setComments(prev => {
                              const next = { ...prev, [emp.id]: val };
                              savePersistedState("pa_calibration_adj_comments_v1", next);
                              return next;
                            });
                          }}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1A284F]/30 placeholder-gray-300 text-gray-700"
                        />
                        {/* Upload evidence */}
                        <label className="flex items-center gap-1.5 cursor-pointer px-2 py-1.5 border border-dashed border-blue-300 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors">
                          <Upload className="w-3 h-3 shrink-0" />
                          <span className="text-[10px] font-semibold">Upload Bukti</span>
                          <input type="file" multiple className="hidden"
                            onChange={e => {
                              const rawFiles = Array.from(e.target.files ?? []);
                              const files: EvidenceFile[] = rawFiles.map(f => ({
                                name: f.name,
                                objectUrl: URL.createObjectURL(f),
                                mimeType: f.type || "application/octet-stream",
                              }));
                              if (files.length) {
                                rawFiles.forEach((rawFile) => {
                                  void uploadEvidenceFileToSupabase(rawFile, {
                                    employeeId: emp.employeeId,
                                    employeeName: emp.name,
                                    moduleType: "Calibration",
                                    period: "2026",
                                    month: "Year-End",
                                  });
                                });
                                setEvidence(prev => {
                                  const next = { ...prev, [emp.id]: [...(prev[emp.id] ?? []), ...files] };
                                  savePersistedState("pa_calibration_adj_evidence_v1", next);
                                  return next;
                                });
                              }
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {/* Evidence file list */}
                        {(evidence[emp.id]?.length ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            {evidence[emp.id].map((f, i) => (
                              <div key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                <Paperclip className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                                <span className="text-[10px] text-blue-700 truncate max-w-[110px]">{f.name}</span>
                                <button onClick={() => setEvidence(prev => ({ ...prev, [emp.id]: prev[emp.id].filter((_, j) => j !== i) }))}
                                  className="ml-auto text-gray-300 hover:text-red-400 transition-colors shrink-0">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Reset */}
                        <button onClick={() => resetEmp(emp.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors text-[10px] font-semibold border border-red-100">
                          <RotateCcw className="w-3 h-3" /> Reset
                        </button>
                      </div>
                    ) : !editMode && (comments[emp.id] || (evidence[emp.id]?.length ?? 0) > 0) ? (
                      <div className="flex flex-col gap-1">
                        {comments[emp.id] && (
                          <div className="flex items-start gap-1">
                            <MessageSquare className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-gray-600 line-clamp-2">{comments[emp.id]}</p>
                          </div>
                        )}
                        {(evidence[emp.id]?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-blue-500">
                            <Paperclip className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] font-semibold">{evidence[emp.id]!.length} file</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-block w-4" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Appraisal Detail Modal */}
      {detailEmp && (
        <AppraisalDetailCard
          emp={detailEmp}
          effectiveScores={getEffectiveScores(detailEmp)}
          finalScore={getFinal(detailEmp)}
          comment={comments[detailEmp.id]}
          evidenceFiles={evidence[detailEmp.id]}
          onClose={() => setDetailEmp(null)}
        />
      )}
    </CollapsibleSection>
  );
}

// ─── Calibration Panel ────────────────────────────────────────────────────────

function CalibrationPanel({
  unitName,
  calibrationGrades, divisionProportions, departemenenProportions, bagianProportions,
  editMode, setEditMode, saveVersion, setSaveVersion, setIsSaved, pageMode,
  onPreview, onBackToEdit, canSubmit, onSubmit,
}: {
  unitName?: string;
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  saveVersion: number;
  setSaveVersion: React.Dispatch<React.SetStateAction<number>>;
  setIsSaved: (v: boolean) => void;
  pageMode: PageMode;
  onPreview: () => void;
  onBackToEdit: () => void;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const [liveAdjustments, setLiveAdjustments] = useState<Record<string, number>>(() =>
    loadPersistedState("pa_calibration_adj_scores_v1", {})
  );
  const [savedAdjustments, setSavedAdjustments] = useState<Record<string, number>>(() =>
    loadPersistedState("pa_calibration_adj_scores_v1", {})
  );
  const [activeTab, setActiveTab] = useRouteTab<"distribusi" | "proporsi">(["distribusi", "proporsi"], "distribusi");

  useEffect(() => {
    const onHydrated = () => {
      const s = loadPersistedState<Record<string, number>>("pa_calibration_adj_scores_v1", {});
      setLiveAdjustments(s);
      setSavedAdjustments(s);
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  useEffect(() => {
    if (saveVersion > 0) {
      setSavedAdjustments(liveAdjustments);
      savePersistedState("pa_calibration_adj_scores_v1", liveAdjustments, {
        kind: "calibration-adjustment",
        adjustmentKey: `adj-2026-${Date.now()}`,
        unitName: "PT RSUP (Industry)",
        employeeId: "ALL",
        period: "2026",
        status: "Saved",
        data: liveAdjustments,
        audit: {
          action: "Update",
          module: "Performance Appraisal",
          subModule: "Calibration Adjustment",
          description: `Saved Calibration score adjustments (${Object.keys(liveAdjustments).length} employees)`,
        },
      });
    }
  }, [saveVersion]);

  const handleStart  = () => setEditMode(true);
  const handleCancel = () => setEditMode(false);
  const handleSave   = () => { setEditMode(false); setIsSaved(true); setSaveVersion(v => v + 1); };

  const safeDivisions = divisionProportions ?? [];
  const safeDepts     = departemenenProportions ?? [];
  const safeBagian    = bagianProportions ?? [];

  const totalDivHC = safeDivisions.reduce((s, d) => s + d.hc, 0);
  const gradeHeaders = calibrationGrades.map(g => g.grade);

  // Setting share maps
  const divShareMap: Record<string, number> = {};
  safeDivisions.forEach(d => { divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0; });

  const deptShareMap: Record<string, number> = {};
  safeDepts.forEach(dept => {
    const sibHC = safeDepts.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptShareMap[dept.id] = sibHC > 0 ? (dept.hc / sibHC) * (divShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianShareMap: Record<string, number> = {};
  safeBagian.forEach(b => {
    const sibHC = safeBagian.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianShareMap[b.id] = sibHC > 0 ? (b.hc / sibHC) * (deptShareMap[b.departemenenId] ?? 0) : 0;
  });

  // Actual data computed from employee scores (uses savedAdjustments after Save Changes)
  const gradeIdx = Object.fromEntries(gradeHeaders.map((g, i) => [g, i]));

  const actualComputed = useMemo(() => {
    const nGrades = gradeHeaders.length;
    const globalCounts = Array<number>(nGrades).fill(0);
    const divCounts:    Record<string, number[]> = {};
    const deptCounts:   Record<string, number[]> = {};
    const bagianCounts: Record<string, number[]> = {};

    const effectiveAdj = pageMode === "preview" ? liveAdjustments : savedAdjustments;
    ALL_EMPLOYEES.filter(emp => !unitName || emp.companyUnit === unitName).forEach(emp => {
      if (isYearEndInactive(emp.employeeId)) return;
      const finalScore = effectiveAdj[emp.id] ?? calcFinalScore(emp.level, applyYearEndScorePolicy(emp.employeeId, emp.base));
      const { grade } = gradeFromScore(finalScore);
      const gi = gradeIdx[grade] ?? -1;
      if (gi < 0) return;
      globalCounts[gi]++;
      if (!divCounts[emp.divisiId])          divCounts[emp.divisiId]          = Array(nGrades).fill(0);
      if (!deptCounts[emp.departemenenId])   deptCounts[emp.departemenenId]   = Array(nGrades).fill(0);
      if (!bagianCounts[emp.bagianId])       bagianCounts[emp.bagianId]       = Array(nGrades).fill(0);
      divCounts[emp.divisiId][gi]++;
      deptCounts[emp.departemenenId][gi]++;
      bagianCounts[emp.bagianId][gi]++;
    });

    return { globalCounts, divCounts, deptCounts, bagianCounts };
  }, [pageMode === "preview" ? liveAdjustments : savedAdjustments, gradeHeaders.join(","), pageMode]);

  // Actual HC per org unit (sum of grade counts)
  const divActualData = safeDivisions.map(d => ({
    id: d.id,
    divisiId: d.id,
    hc: (actualComputed.divCounts[d.id] ?? []).reduce((a, b) => a + b, 0),
    grades: actualComputed.divCounts[d.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const totalActualDivHC = divActualData.reduce((s, d) => s + d.hc, 0);
  const divActualShareMap: Record<string, number> = {};
  divActualData.forEach(d => { divActualShareMap[d.id] = totalActualDivHC > 0 ? (d.hc / totalActualDivHC) * 100 : 0; });

  const deptActualData = safeDepts.map(dept => ({
    id: dept.id,
    divisiId: dept.divisiId,
    hc: (actualComputed.deptCounts[dept.id] ?? []).reduce((a, b) => a + b, 0),
    grades: actualComputed.deptCounts[dept.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const deptActualShareMap: Record<string, number> = {};
  deptActualData.forEach(dept => {
    const sibHC = deptActualData.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptActualShareMap[dept.id] = sibHC > 0 ? (dept.hc / sibHC) * (divActualShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianActualData = safeBagian.map(b => ({
    id: b.id,
    departemenenId: b.departemenenId,
    hc: (actualComputed.bagianCounts[b.id] ?? []).reduce((a, b2) => a + b2, 0),
    grades: actualComputed.bagianCounts[b.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const bagianActualShareMap: Record<string, number> = {};
  bagianActualData.forEach(b => {
    const sibHC = bagianActualData.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianActualShareMap[b.id] = sibHC > 0 ? (b.hc / sibHC) * (deptActualShareMap[b.departemenenId] ?? 0) : 0;
  });

  const fmtShare = (v: number) => v > 0 ? `${v.toFixed(1)}%` : "";

  const tabDefs: { key: "distribusi" | "proporsi"; label: string }[] = [
    { key: "distribusi", label: "Grade Distribution & Calibration" },
    { key: "proporsi",   label: "Proportion per Division / Departemen / Bagian" },
  ];

  return (
    <>
      {/* Tabs */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          {tabDefs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-4 text-sm font-semibold transition-colors relative ${
                activeTab === tab.key
                  ? "text-[#1A284F]"
                  : "text-gray-400 hover:text-gray-600"
              }`}>
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1A284F] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6 flex flex-col gap-6">
          {activeTab === "distribusi" ? (
            <>
              {/* Legend */}
              <div className="flex items-center gap-6 bg-gray-50 border border-gray-100 rounded-xl px-5 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Legend:</p>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm bg-teal-600 inline-block" />
                  <span className="text-xs text-gray-600 font-medium">AKTUAL — Data perolehan nilai appraisal akhir tahun</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm bg-[#1A284F] inline-block" />
                  <span className="text-xs text-gray-600 font-medium">SETTING — Konfigurasi target awal tahun</span>
                </div>
              </div>

              <BellCurveChart
                calibrationGrades={calibrationGrades}
                divisionProportions={divisionProportions}
                actualCounts={actualComputed.globalCounts}
              />

              <EmployeeAdjustmentSection
                unitName={unitName}
                editMode={editMode}
                adjustments={liveAdjustments}
                setAdjustments={setLiveAdjustments}
                onStart={handleStart}
                onSave={handleSave}
                onCancel={handleCancel}
                pageMode={pageMode}
                onPreview={onPreview}
                onBackToEdit={onBackToEdit}
                canSubmit={canSubmit}
                onSubmit={onSubmit}
              />
            </>
          ) : (
            <>
              <GradeDistributionTable
                calibrationGrades={calibrationGrades}
                divisionProportions={divisionProportions}
                actualCounts={actualComputed.globalCounts}
              />
              <AdjustmentProportionTable
                title="Proportion per Division"
                subtitle="Comparison of setting vs actual headcount & grade distribution per division"
                rows={safeDivisions.map(d => {
                  const actual = divActualData.find(x => x.id === d.id)!;
                  return {
                    id: d.id, label: d.divisi,
                    settingHC: d.hc, settingShareKuota: fmtShare(divShareMap[d.id] ?? 0),
                    settingCalcs: gradeCalcs(d.hc, calibrationGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(divActualShareMap[d.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={totalDivHC} totalActualHC={totalActualDivHC} gradeHeaders={gradeHeaders}
              />
              <AdjustmentProportionTable
                title="Proportion per Departemen"
                subtitle="Comparison of setting vs actual headcount & grade distribution per departemen"
                rows={safeDepts.map(dept => {
                  const parentDiv = safeDivisions.find(d => d.id === dept.divisiId);
                  const actual = deptActualData.find(x => x.id === dept.id)!;
                  return {
                    id: dept.id, label: dept.departemen, parentLabel: parentDiv?.divisi,
                    settingHC: dept.hc, settingShareKuota: fmtShare(deptShareMap[dept.id] ?? 0),
                    settingCalcs: gradeCalcs(dept.hc, calibrationGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(deptActualShareMap[dept.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
                totalActualHC={deptActualData.reduce((s, d) => s + d.hc, 0)}
                gradeHeaders={gradeHeaders} showParent parentHeader="DIVISI"
              />
              <AdjustmentProportionTable
                title="Proportion per Bagian"
                subtitle="Comparison of setting vs actual headcount & grade distribution per bagian"
                rows={safeBagian.map(b => {
                  const parentDept = safeDepts.find(d => d.id === b.departemenenId);
                  const actual = bagianActualData.find(x => x.id === b.id)!;
                  return {
                    id: b.id, label: b.bagian, parentLabel: parentDept?.departemen,
                    settingHC: b.hc, settingShareKuota: fmtShare(bagianShareMap[b.id] ?? 0),
                    settingCalcs: gradeCalcs(b.hc, calibrationGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(bagianActualShareMap[b.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={safeBagian.reduce((s, b) => s + b.hc, 0)}
                totalActualHC={bagianActualData.reduce((s, b) => s + b.hc, 0)}
                gradeHeaders={gradeHeaders} showParent parentHeader="DEPARTEMEN"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Unit Detail ──────────────────────────────────────────────────────────────

function UnitDetail({ unit, onBack, pageMode, setPageMode, onShowConfirm, hideBack }: {
  unit: CompanyUnit;
  onBack: () => void;
  pageMode: PageMode;
  setPageMode: (m: PageMode) => void;
  onShowConfirm: () => void;
  hideBack?: boolean;
}) {
  const [editMode,     setEditMode]     = useState(false);
  const [isSaved,      setIsSaved]      = useState(false);
  const [saveVersion,  setSaveVersion]  = useState(0);
  const revision = useAppraisalRevision();
  const [yeTick, setYeTick] = useState(0);

  useEffect(() => {
    const bump = () => setYeTick((v) => v + 1);
    window.addEventListener("year-end-updated", bump);
    window.addEventListener("pa-db-hydrated", bump);
    return () => {
      window.removeEventListener("year-end-updated", bump);
      window.removeEventListener("pa-db-hydrated", bump);
    };
  }, []);

  const unvalidatedUnitEmployees = useMemo(() => {
    const ye = loadYearEndState();
    return ALL_EMPLOYEES.filter((e) => {
      if (e.companyUnit !== unit.name) return false;
      const norm = normalizeEmployeeId(e.employeeId);
      if (ye.inactive.some((id) => normalizeEmployeeId(id) === norm)) return false;
      if (ye.ignored.some((id) => normalizeEmployeeId(id) === norm)) return false;
      return !e.isCalibrationReady;
    });
  }, [unit.name, saveVersion, revision, yeTick]);

  const canSubmit = (isSaved || pageMode === "preview") && unvalidatedUnitEmployees.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      {!hideBack && (
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>
      </div>
      )}

      {/* Unit header */}
      <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-[#1A284F]" />
        </div>
        <div>
          <p className="font-bold text-gray-900">{unit.name}</p>
          <p className="text-sm text-gray-500">
            {unit.industry}{unit.industry ? " · " : ""}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{unit.code}</span>
          </p>
        </div>
      </div>

      {/* Submitted warning */}
      {pageMode === "submitted" && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Calibration adjustment has been submitted and is <strong>Pending Approval Management</strong>. Editing is disabled until the approval is completed.
          </p>
        </div>
      )}

      {pageMode !== "submitted" && unvalidatedUnitEmployees.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            Terdapat <strong>{unvalidatedUnitEmployees.length} karyawan</strong> pada unit <strong>{unit.name}</strong> yang nilainya masih berstatus <strong>YTD / Belum Validated penuh</strong> (misalnya bulan KPI Tracking belum genap 12 bulan atau modul wajib belum divalidasi HR ICF). Nilai berjalan (YTD) sudah ditampilkan, namun perlu berstatus <strong>Validated</strong> penuh untuk dapat diproses dan disubmit di Calibration Adjustment.
          </p>
        </div>
      )}

      <CalibrationPanel
        unitName={unit.name}
        calibrationGrades={unit.calibrationGrades}
        divisionProportions={unit.divisionProportions}
        departemenenProportions={unit.departemenenProportions}
        bagianProportions={unit.bagianProportions}
        editMode={editMode}
        setEditMode={setEditMode}
        saveVersion={saveVersion}
        setSaveVersion={setSaveVersion}
        setIsSaved={setIsSaved}
        pageMode={pageMode}
        onPreview={() => setPageMode("preview")}
        onBackToEdit={() => setPageMode("edit")}
        canSubmit={canSubmit}
        onSubmit={onShowConfirm}
      />
    </div>
  );
}

// ─── Load from Setting ────────────────────────────────────────────────────────

function loadFromSetting(): { units: CompanyUnit[]; submittedAt: string | null } {
  try {
    const raw = localStorage.getItem("calibration_submitted_units") ?? localStorage.getItem("calibration_hc_settings_2026");
    const submittedAt = localStorage.getItem("calibration_submitted_at");
    if (!raw) {
      return {
        units: defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u)),
        submittedAt: null,
      };
    }
    const submitted: any[] = JSON.parse(raw);
    const units = defaultCompanyUnits.map(def => {
      const synced = applyImportedEmployeesDistribution(def);
      const src = submitted.find(s => s.id === def.id);
      if (!src) return synced;
      return {
        ...synced,
        calibrationGrades:        src.calibrationGrades ?? synced.calibrationGrades,
        divisionProportions:      synced.divisionProportions.length > 0 ? synced.divisionProportions : (src.divisionProportions ?? []),
        departemenenProportions:  synced.departemenenProportions.length > 0 ? synced.departemenenProportions : (src.departemenenProportions ?? []),
        bagianProportions:        synced.bagianProportions.length > 0 ? synced.bagianProportions : (src.bagianProportions ?? []),
      };
    });
    return { units, submittedAt };
  } catch {
    return {
      units: defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u)),
      submittedAt: null,
    };
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CalibrationAdjustment({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  useAppraisalRevision();
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const effectiveLockedUnits = lockedUnits ?? authLockedUnits;
  const [{ units: allCompanyUnits, submittedAt }, setLoadedSetting] = useState(loadFromSetting);
  const companyUnits = effectiveLockedUnits ? allCompanyUnits.filter(u => effectiveLockedUnits.includes(u.name)) : allCompanyUnits;
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);
  const [pageMode, setPageMode]         = useState<PageMode>(() =>
    loadPersistedState<PageMode>("pa_calibration_adj_mode_v1", "edit")
  );
  const [showConfirm, setShowConfirm]   = useState(false);

  useEffect(() => {
    const onHydrated = () => {
      setLoadedSetting(loadFromSetting());
      setPageMode(loadPersistedState<PageMode>("pa_calibration_adj_mode_v1", "edit"));
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const formattedDate = submittedAt
    ? (() => { const d = new Date(submittedAt); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; })()
    : null;

  const handleSubmitConfirm = () => {
    setShowConfirm(false);
    setPageMode("submitted");
    savePersistedState("pa_calibration_adj_mode_v1", "submitted", {
      kind: "calibration-adjustment",
      adjustmentKey: `submit-${selectedUnit?.id ?? "1"}-2026`,
      unitName: selectedUnit?.name ?? "PT RSUP (Industry)",
      employeeId: "ALL",
      period: "2026",
      status: "Submitted",
      data: { submittedAt: new Date().toISOString() },
      audit: {
        action: "Create",
        module: "Performance Appraisal",
        subModule: "Calibration Adjustment",
        description: `Submitted Calibration Adjustment for ${selectedUnit?.name ?? "Company Unit"} to BOD Approval`,
      },
    });
    setSelectedUnit(null);
  };

  const TabBar = ({ onTabClick }: { onTabClick?: () => void }) => (
    <div className="border-b border-gray-200">
      <div className="flex gap-1">
        <button onClick={onTabClick}
          className="px-6 py-3 text-sm font-medium border-b-2 border-[#1A284F] text-[#1A284F]">
          Company Units
        </button>
      </div>
    </div>
  );

  if (selectedUnit) {
    const liveUnit = companyUnits.find(u => u.id === selectedUnit.id) ?? selectedUnit;
    return (
      <>
        {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
        <div className="w-full flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Adjustment</h2>
            <p className="text-sm text-gray-500">Compare setting targets with actual appraisal results and adjust per company unit</p>
          </div>
          <TabBar onTabClick={() => setSelectedUnit(null)} />
          {submittedAt && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-800 font-medium">
                Setting data loaded from <strong>Calibration Setting</strong> submission on {formattedDate}.
                Actual data reflects end-of-year performance appraisal results.
              </p>
            </div>
          )}
          <UnitDetail
            unit={liveUnit}
            onBack={() => setSelectedUnit(null)}
            pageMode={pageMode}
            setPageMode={setPageMode}
            onShowConfirm={() => setShowConfirm(true)}
            hideBack={false}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Adjustment</h2>
          <p className="text-sm text-gray-500">Compare setting targets with actual appraisal results and adjust per company unit</p>
        </div>
        <TabBar />

        {pageMode === "submitted" && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              Calibration adjustment has been submitted and is <strong>Pending Approval Management</strong>.
            </p>
          </div>
        )}

        {submittedAt && pageMode !== "submitted" && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800 font-medium">
              Data loaded from <strong>Calibration Setting</strong> submission on {formattedDate}. Select a company unit to review and adjust.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            {submittedAt
              ? "Select a company unit to compare setting targets with actual appraisal data."
              : "No submitted data yet. Submit from Calibration Setting first."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {companyUnits.map((unit, idx) => {
              const gradients = ["from-blue-600 to-blue-800","from-emerald-600 to-emerald-800","from-violet-600 to-violet-800","from-amber-500 to-orange-700","from-sky-500 to-cyan-700","from-rose-500 to-red-700","from-teal-500 to-teal-700","from-indigo-500 to-indigo-700"];
              const gradient = gradients[idx % gradients.length];
              return (
                <button key={unit.id} onClick={() => { setPageMode("edit"); setSelectedUnit(unit); }}
                  className="group text-left rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                  <div className={`bg-gradient-to-br ${gradient} px-5 py-4`}>
                    <Building2 className="w-5 h-5 text-white/80 mb-2" />
                    <p className="text-white font-semibold text-sm leading-tight">{unit.name}</p>
                  </div>
                  <div className="bg-white px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{unit.industry}</p>
                      <span className="inline-block mt-0.5 font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{unit.code}</span>
                      {submittedAt && (
                        <span className="block mt-0.5 text-[10px] font-medium text-blue-600">● From Setting</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
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
