// @refresh reset
import { useState, useEffect, useCallback, useMemo } from "react";
import { Award, Download, ChevronDown, ChevronUp, ChevronsUpDown, Eye, TrendingUp, Users, X, Star } from "lucide-react";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard } from "../../components/AnalyticsStatCard";
import { TablePaginationBar } from "../../components/TablePaginationBar";
import { EXCEL_THEME, exportStyledXLSX, type StyledExcelCell, type StyledExcelMerge } from "../../utils/excelUtils";
import type { Employee, CalibrationTarget, ScoreGrade } from "../../data/mockEmployees";
import {
  getLiveTransactionalEmployees, gradeColor, gradeFromScore, readCalibrationTargets, MI_EMPLOYEE_STORE_MAP,
} from "../../data/mockEmployees";
import {
  getPenilai1ScoreAsPercent, subscribeScores,
} from "../supervisor/managementInterviewScoreStore";
import { getActiveUser, getAuthorizedSubordinates, getScopedFilterOptionsForUser, isAdminOrHrIcfRole, loadManagedUsers, useAuthStore } from "../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "./appraisalWorkflowStore";
import { getMasterCompanyLocations } from "../hr/settings/masterCompanyStore";

type Role = "hr" | "supervisor";

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

const filterOptions = {
  year:        ["2026"],
  get companyUnit(): string[] {
    return ["All Units", ...getMasterCompanyLocations().map((l) => l.company)];
  },
  division:    ["All Divisions", ...DIV_DEFS.map(d => d.divisi)],
  department:  ["All Departments", ...DEPT_DEFS.map(([,, name]) => name)],
  position:    ["All Positions", "Operasional", "Pengawas", "Kepala Bagian", "Kepala Departemen", "Kepala Divisi"],
};

function FilterSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 cursor-pointer transition-colors hover:border-gray-300"
        >
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      </div>
    </div>
  );
}

// Merge Form A / B / C modules into a single "Appraisal Form" entry
function mergeFormModules(modules: Employee["modules"]) {
  const forms = modules.filter(m => ["Appraisal Form (A)", "Appraisal Form (B)", "Appraisal Form (C)"].includes(m.name));
  const others = modules.filter(m => !["Appraisal Form (A)", "Appraisal Form (B)", "Appraisal Form (C)"].includes(m.name));
  if (forms.length === 0) return others;
  const avgScore = Math.round(forms.reduce((s, m) => s + m.score, 0) / forms.length);
  const totalWeight = forms.reduce((s, m) => s + m.weight, 0);
  const merged = { ...forms[0], name: "Appraisal Form", score: avgScore, grade: gradeFromScore(avgScore).grade, weight: totalWeight };
  // Insert merged after SMART Goals (index of first form minus nothing — just put it in place of the first form)
  const insertIdx = modules.findIndex(m => m.name === "Appraisal Form (A)");
  const result = [...others];
  result.splice(insertIdx, 0, merged);
  return result;
}

// Seeded historical score for 2025 (deterministic offset from current score)
function hist2025(empId: string, score: number): number {
  const seed = empId.split("").reduce((a, c) => ((a * 31) + c.charCodeAt(0)) & 0xffff, 0);
  const offset = (seed % 17) - 8; // –8 to +8
  return Math.max(30, Math.min(100, Math.round(score + offset)));
}

function DetailDrawer({ employee, liveMIScore, onClose }: {
  employee: Employee;
  liveMIScore?: ScoreGrade | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"2026">("2026");

  // ── 2026 data ──────────────────────────────────────────────────────────────
  const modules2026 = mergeFormModules(
    liveMIScore
      ? employee.modules.map(m =>
          m.name === "Management Interview"
            ? { ...m, score: liveMIScore.score, grade: liveMIScore.grade }
            : m
        )
      : employee.modules
  );
  const totalScore2026 = modules2026.reduce((s, m) => s + (m.score * m.weight / 100), 0);

  // ── 2025 data (seeded historical) ──────────────────────────────────────────
  const modules2025 = modules2026.map(m => {
    const score = hist2025(`${employee.id}${m.name}`, m.score);
    return { ...m, score, grade: gradeFromScore(score).grade };
  });
  const totalScore2025 = modules2025.reduce((s, m) => s + (m.score * m.weight / 100), 0);
  const grade2025 = gradeFromScore(totalScore2025).grade;

  const modules = activeTab === "2026" ? modules2026 : modules2025;
  const totalScore = activeTab === "2026" ? totalScore2026 : totalScore2025;
  const displayGrade = activeTab === "2026" ? employee.grade : grade2025;
  const scoreLabel = activeTab === "2026" ? "Current Score" : "Final Score";
  const gradeLabel = activeTab === "2026" ? "Current Grade" : "Final Grade";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 bg-[#1A284F] shrink-0">
          <div>
            <h3 className="font-semibold text-white text-base">Appraisal Detail</h3>
            <p className="text-xs text-blue-200 mt-0.5">{employee.fullName} · {employee.id}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Year tabs */}
        <div className="px-7 pt-4 pb-0 border-b border-gray-100 shrink-0 bg-white">
          <div className="flex gap-1">
            {(["2026"] as const).map(yr => (
              <button
                key={yr}
                onClick={() => setActiveTab(yr)}
                className={`px-5 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                  activeTab === yr
                    ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">
          {/* Employee info */}
          <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-3 gap-3">
            {[
              ["Employee ID", employee.id],
              ["Full Name", employee.fullName],
              ["Position", employee.position],
              ["Department", employee.department],
              ["Division", employee.division],
              ["Company Unit", employee.companyUnit],
              ["Joined", employee.joined],
              ["Tenure", employee.tenure],
              ["Approval Date", employee.approvalCompleteDate],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-gray-400 font-medium">{label}</p>
                <p className="text-sm text-gray-800 font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Score banner */}
          <div className="bg-[#1A284F] rounded-2xl px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-200 font-medium mb-1">{scoreLabel}</p>
              <p className="text-4xl font-bold text-white">{totalScore.toFixed(1)}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-200 font-medium mb-1">{gradeLabel}</p>
              <span className={`inline-block px-5 py-2 rounded-xl text-2xl font-bold ${gradeColor(displayGrade)}`}>
                {displayGrade}
              </span>
            </div>
          </div>

          {/* Modules */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3 text-sm">Score per Module</h4>
            <div className="flex flex-col gap-2.5">
              {modules.map((mod, idx) => (
                <div key={idx} className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className="w-7 h-7 rounded-lg bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">
                        {mod.icon}
                      </span>
                      <span className="text-sm font-semibold">{mod.name}</span>
                      {activeTab === "2026" && mod.name === "KPI" && employee.kpiIsYtd && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold leading-none">
                          YTD
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{mod.score}%</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${gradeColor(mod.grade)}`}>
                        {mod.grade}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1A284F] rounded-full transition-all" style={{ width: `${mod.score}%` }} />
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">Weight {mod.weight}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weighted total */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-600">
                <Star className="w-4 h-4 text-[#B88645]" />
                <span className="text-sm font-semibold">Weighted Total Score</span>
              </div>
              <span className="text-lg font-bold text-[#1A284F]">{totalScore.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Calculated from sum of (Score × Weight) across all modules</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupDistributionTable({ employees, groupKey, groupLabel, calibrationTargets }: {
  employees: Employee[];
  groupKey: keyof Pick<Employee, "division" | "department" | "position" | "companyUnit">;
  groupLabel: string;
  calibrationTargets: CalibrationTarget[];
}) {
  const groups = Array.from(new Set(employees.map(e => e[groupKey] as string))).sort();

  const rows = groups.map(grp => {
    const grpEmployees = employees.filter(e => (e[groupKey] as string) === grp);
    const total = grpEmployees.length || 1;
    const grades = calibrationTargets.map(cg => {
      const count = grpEmployees.filter(e => e.grade === cg.grade).length;
      const actualPct = Math.round((count / total) * 100);
      return { ...cg, count, actualPct, diff: actualPct - cg.target };
    });
    return { grp, total: grpEmployees.length, grades };
  });

  if (rows.length === 0) return (
    <div className="py-10 text-center text-gray-400 text-sm">No data available.</div>
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2.5 text-left text-gray-500 font-semibold border border-gray-200 bg-gray-50 whitespace-nowrap">{groupLabel}</th>
              <th className="px-3 py-2.5 text-center text-gray-500 font-semibold border border-gray-200 bg-gray-50 whitespace-nowrap">Total HC</th>
              {calibrationTargets.map(cg => (
                <th key={cg.grade} className="px-3 py-2.5 text-center font-semibold border border-gray-200 whitespace-nowrap" style={{ background: `${cg.color}18`, color: cg.color }}>
                  {cg.grade}
                  <span className="block text-gray-400 font-normal">target {cg.target}%</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.grp} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 border border-gray-100 font-semibold text-gray-800 whitespace-nowrap">{row.grp}</td>
                <td className="px-3 py-3 border border-gray-100 text-center text-gray-600 font-semibold">{row.total}</td>
                {row.grades.map(g => (
                  <td key={g.grade} className="px-3 py-3 border border-gray-100 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-bold text-gray-800">{g.count}</span>
                      <span className="text-gray-400">{g.actualPct}%</span>
                      {g.count > 0 && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          g.diff > 5 ? "bg-orange-50 text-orange-500" :
                          g.diff < -5 ? "bg-blue-50 text-blue-500" :
                          "bg-emerald-50 text-emerald-600"
                        }`}>
                          {g.diff > 0 ? `+${g.diff}` : g.diff}%
                        </span>
                      )}
                      <div className="w-12 h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(g.actualPct, 100)}%`, background: g.color }} />
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="px-4 py-2.5 border border-gray-200 font-semibold text-gray-500 text-xs">Calibration Target</td>
              <td className="px-3 py-2.5 border border-gray-200 text-center text-gray-400">—</td>
              {calibrationTargets.map(cg => (
                <td key={cg.grade} className="px-3 py-2.5 border border-gray-200 text-center">
                  <span className="font-bold" style={{ color: cg.color }}>{cg.target}%</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-6 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-300 inline-block" /> Above target (&gt;+5%)</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> Below target (&lt;-5%)</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Within target</div>
      </div>
    </>
  );
}

type DistTab = "companyUnit" | "division" | "department" | "position";

function DistributionByGroup({ employees, calibrationTargets }: { employees: Employee[]; calibrationTargets: CalibrationTarget[] }) {
  const [activeTab, setActiveTab] = useState<DistTab>("companyUnit");

  const tabs: { id: DistTab; label: string; groupLabel: string }[] = [
    { id: "companyUnit", label: "By Company Unit", groupLabel: "Company Unit" },
    { id: "division",   label: "By Division",      groupLabel: "Division"     },
    { id: "department", label: "By Department",    groupLabel: "Department"   },
    { id: "position",   label: "By Position",      groupLabel: "Position"     },
  ];

  const active = tabs.find(t => t.id === activeTab)!;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-5 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === t.id
                ? "bg-white text-[#1A284F] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-5">
        Actual grade proportions per {active.groupLabel.toLowerCase()} vs calibration targets
      </p>
      <GroupDistributionTable employees={employees} groupKey={activeTab} groupLabel={active.groupLabel} calibrationTargets={calibrationTargets} />
    </div>
  );
}

function ModuleCell({ data, settingValidated, isYtd, hideWeighted }: { data: ScoreGrade | null; settingValidated?: boolean; isYtd?: boolean; hideWeighted?: boolean }) {
  if (!data || data.score <= 0) {
    if (settingValidated) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Setting
        </span>
      );
    }
    return <span className="text-gray-300 text-xs">—</span>;
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="inline-flex items-center gap-1">
        <span className="font-semibold text-gray-800 text-xs">{data.score}%</span>
        {isYtd && (
          <span
            className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold leading-none"
            title="Nilai berjalan Year-to-Date (menunggu kelengkapan 12 bulan & Validated HR ICF)"
          >
            YTD
          </span>
        )}
      </div>
      {!hideWeighted && typeof data.weightedScore === "number" && typeof data.weightPct === "number" && (
        <span className="text-[9px] font-semibold text-indigo-700 whitespace-nowrap">
          ×{data.weightPct}% = {data.weightedScore.toFixed(2)}
        </span>
      )}
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${gradeColor(data.grade)}`}>{data.grade}</span>
    </div>
  );
}

type SortKey = "fullName" | "totalScore" | "grade" | "department" | "division" | "companyUnit" | "position" | "approvalCompleteDate";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-400 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#1A284F] shrink-0" />
    : <ChevronDown className="w-3 h-3 text-[#1A284F] shrink-0" />;
}

export function PerformanceAppraisalSummary({ role, lockedUnits }: { role: Role; lockedUnits?: string[] }) {
  const [year, setYear]               = useState("2026");
  const [companyUnit, setCompanyUnit] = useState("All Units");
  const [division, setDivision]       = useState("All Divisions");
  const [department, setDepartment]   = useState("All Departments");
  const [position, setPosition]       = useState("All Positions");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("totalScore");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [calibrationTargets, setCalibrationTargets] = useState<CalibrationTarget[]>(
    () => readCalibrationTargets("All Units")
  );

  // Live Management Interview scores from BOD assessment
  const buildMIScores = useCallback((): Record<string, ScoreGrade> => {
    const result: Record<string, ScoreGrade> = {};
    for (const emp of getLiveTransactionalEmployees()) {
      if (emp.managementInterview && emp.managementInterview.score > 0) {
        result[emp.id] = emp.managementInterview;
      } else {
        const storeId = MI_EMPLOYEE_STORE_MAP[emp.id] ?? emp.id;
        const pct = getPenilai1ScoreAsPercent(storeId, emp.fullName);
        if (pct !== null && pct > 0) {
          result[emp.id] = { score: parseFloat(pct.toFixed(2)), grade: gradeFromScore(pct).grade };
        }
      }
    }
    return result;
  }, []);
  const [liveMI, setLiveMI] = useState<Record<string, ScoreGrade>>(buildMIScores);
  useEffect(() => subscribeScores(() => setLiveMI(buildMIScores())), [buildMIScores]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  useEffect(() => {
    const onRefresh = () => setRefreshTick((t) => t + 1);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  // Reload calibration targets from localStorage whenever the company-unit filter changes.
  // This picks up any submission made in /hr/calibration/setting without a page reload.
  useEffect(() => {
    setCalibrationTargets(readCalibrationTargets(companyUnit));
  }, [companyUnit]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const activeUser = getActiveUser();
  const scopedMeta = getScopedFilterOptionsForUser(activeUser);
  const isGlobalViewer = isAdminOrHrIcfRole(activeUser.role) || activeUser.role === "BOD";
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const globalLockedUnits = isGlobalViewer ? (lockedUnits ?? authLockedUnits) : undefined;
  const supervisorAllowedIds = useMemo(
    () =>
      new Set(
        !isGlobalViewer
          ? getAuthorizedSubordinates(activeUser).map((u) => u.employeeId.toLowerCase())
          : [],
      ),
    [isGlobalViewer, activeUser, refreshTick],
  );

  const liveEmployees = useMemo(() => getLiveTransactionalEmployees(), [refreshTick]);
  const visibleBaseEmployees = useMemo(
    () =>
      liveEmployees.filter((emp) => {
        if (!isGlobalViewer) {
          return supervisorAllowedIds.has(emp.id.toLowerCase());
        }
        if (globalLockedUnits && !globalLockedUnits.includes(emp.companyUnit)) return false;
        return true;
      }),
    [liveEmployees, isGlobalViewer, supervisorAllowedIds, globalLockedUnits],
  );
  const approvedSettingKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const w of loadWorkflowRecords()) {
      if (w.year !== year || w.phase !== "setting") continue;
      const a2 = w.decisions.approver2?.status ?? "";
      if (a2 === "Approved" || a2 === "Validated" || a2.startsWith("Assessed")) {
        set.add(`${normalizeEmployeeId(w.employeeId)}::${w.module}`);
      }
    }
    return set;
  }, [year, refreshTick]);
  const isSettingFullyApproved = (empId: string, modName: "KPI" | "SMART Goals"): boolean => {
    return approvedSettingKeySet.has(`${normalizeEmployeeId(empId)}::${modName}`);
  };

  const filtered = useMemo(
    () =>
      visibleBaseEmployees.filter((emp) => {
        if (companyUnit !== "All Units" && emp.companyUnit !== companyUnit) return false;
        if (division !== "All Divisions" && emp.division !== division) return false;
        if (department !== "All Departments" && emp.department !== department) return false;
        if (position !== "All Positions" && emp.position !== position) return false;
        return true;
      }),
    [visibleBaseEmployees, companyUnit, division, department, position],
  );

  const sorted = useMemo(() => {
    const GRADE_SORT_ORDER = ["A+", "A", "B", "C", "D", "E"];
    const selfLower = activeUser.employeeId.toLowerCase();
    return [...filtered].sort((a, b) => {
      const aSelf = a.id.toLowerCase() === selfLower;
      const bSelf = b.id.toLowerCase() === selfLower;
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      let cmp = 0;
      if (sortKey === "totalScore") cmp = a.totalScore - b.totalScore;
      else if (sortKey === "grade") cmp = GRADE_SORT_ORDER.indexOf(a.grade) - GRADE_SORT_ORDER.indexOf(b.grade);
      else cmp = (a[sortKey] ?? "").toString().localeCompare((b[sortKey] ?? "").toString());
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, activeUser.employeeId, sortKey, sortDir]);

  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = { "A+": 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const e of filtered) {
      if (counts[e.grade] !== undefined) counts[e.grade]++;
    }
    return ["A+", "A", "B", "C", "D", "E"].map((g) => ({ grade: g, count: counts[g] ?? 0 }));
  }, [filtered]);

  const avgScore = useMemo(
    () =>
      filtered.length
        ? (filtered.reduce((s, e) => s + e.totalScore, 0) / filtered.length).toFixed(1)
        : "—",
    [filtered],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [companyUnit, division, department, position, year]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedSorted = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  const managedUsersById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof loadManagedUsers>[number]>();
    loadManagedUsers().forEach((u) => {
      map.set(u.employeeId.toLowerCase(), u);
    });
    return map;
  }, [liveEmployees]);

  const dynamicFilterOpts = useMemo(() => {
    const poolByUnit =
      companyUnit === "All Units"
        ? visibleBaseEmployees
        : visibleBaseEmployees.filter((e) => e.companyUnit === companyUnit);
    const poolByDiv =
      division === "All Divisions"
        ? poolByUnit
        : poolByUnit.filter((e) => e.division === division);
    const poolByDept =
      department === "All Departments"
        ? poolByDiv
        : poolByDiv.filter((e) => e.department === department);

    const uniq = (arr: string[]) =>
      Array.from(new Set(arr.map((s) => s.trim()).filter((s) => s && s !== "-"))).sort((a, b) => a.localeCompare(b));

    const units = uniq(visibleBaseEmployees.map((e) => e.companyUnit));
    return {
      companyUnit: units.length === 1 && !isGlobalViewer ? [units[0]] : ["All Units", ...units],
      division: ["All Divisions", ...uniq(poolByUnit.map((e) => e.division))],
      department: ["All Departments", ...uniq(poolByDiv.map((e) => e.department))],
      position: ["All Positions", ...uniq(poolByDept.map((e) => e.position))],
    };
  }, [visibleBaseEmployees, companyUnit, division, department, isGlobalViewer]);

  useEffect(() => {
    if (!dynamicFilterOpts.companyUnit.includes(companyUnit)) {
      setCompanyUnit(dynamicFilterOpts.companyUnit[0] ?? "All Units");
    }
  }, [dynamicFilterOpts.companyUnit, companyUnit]);

  const handleDownloadReport = () => {
    const leftHeaders = [
      "No",
      "Reg No",
      "ID Karyawan",
      "Nama Karyawan",
      "Divisi",
      "Departemen",
      "Bagian",
      "Join Date",
      "Masa Kerja",
      "Update Terakhir",
    ];
    const hdrNavy = { bg: EXCEL_THEME.headerNavyBg, fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "334155" };
    const hdrBlue = { bg: "1D4ED8", fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "1E40AF" };
    const hdrAmber = { bg: "B45309", fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "92400E" };
    const hdrEmerald = { bg: "047857", fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "065F46" };

    const row0: StyledExcelCell[] = [
      ...leftHeaders.map((h) => ({ value: h, style: hdrNavy })),
      { value: "KPI", style: hdrBlue },
      { value: "SMART Goals", style: hdrBlue },
      { value: "Appraisal Form", style: hdrBlue },
      { value: "", style: hdrBlue },
      { value: "", style: hdrBlue },
      { value: "Project", style: hdrBlue },
      { value: "Supervisor Level", style: hdrAmber },
      { value: "", style: hdrAmber },
      { value: "Final Score", style: hdrEmerald },
      { value: "", style: hdrEmerald },
    ];
    const row1: StyledExcelCell[] = [
      ...leftHeaders.map(() => ({ value: "", style: hdrNavy })),
      { value: "", style: hdrBlue },
      { value: "", style: hdrBlue },
      { value: "Form A", style: hdrBlue },
      { value: "Form B", style: hdrBlue },
      { value: "Form C", style: hdrBlue },
      { value: "", style: hdrBlue },
      { value: "Managerial Skill", style: hdrAmber },
      { value: "Mgmt Interview", style: hdrAmber },
      { value: "Score", style: hdrEmerald },
      { value: "Grade", style: hdrEmerald },
    ];

    const merges: StyledExcelMerge[] = [
      ...leftHeaders.map((_, ci) => ({ sRow: 0, sCol: ci, eRow: 1, eCol: ci })),
      { sRow: 0, sCol: 10, eRow: 1, eCol: 10 },
      { sRow: 0, sCol: 11, eRow: 1, eCol: 11 },
      { sRow: 0, sCol: 12, eRow: 0, eCol: 14 },
      { sRow: 0, sCol: 15, eRow: 1, eCol: 15 },
      { sRow: 0, sCol: 16, eRow: 0, eCol: 17 },
      { sRow: 0, sCol: 18, eRow: 0, eCol: 19 },
    ];

    const modFmt = (m?: { score: number; grade: string } | null) =>
      m && m.score > 0 ? `${m.score.toFixed(1)}% (${m.grade})` : "—";

    const rowsOut: StyledExcelCell[][] = [row0, row1];
    const rowHeights: Record<number, number> = { 0: 26, 1: 22 };

    sorted.forEach((emp, idx) => {
      const u = managedUsersById.get(emp.id.toLowerCase());
      const zebraBg = idx % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
      const miData = liveMI[emp.id] ?? emp.managementInterview;
      const vals = [
        String(idx + 1),
        u?.regNo || "-",
        emp.id,
        emp.fullName,
        emp.division,
        emp.department,
        u?.bagian || "-",
        emp.joined,
        emp.tenure,
        emp.approvalCompleteDate,
        modFmt(emp.kpi),
        modFmt(emp.smartGoals),
        modFmt(emp.formA),
        modFmt(emp.formB),
        modFmt(emp.formC),
        modFmt(emp.project),
        modFmt(emp.managerialSkill),
        modFmt(miData),
        `${emp.totalScore.toFixed(1)}%`,
        emp.grade,
      ];
      rowsOut.push(
        vals.map((val, ci) => ({
          value: val,
          style: {
            bg: ci >= 18 ? "ECFDF5" : ci >= 16 ? "FFFBEB" : ci >= 10 ? "EFF6FF" : zebraBg,
            fg: EXCEL_THEME.textDark,
            bold: ci === 3 || ci >= 18,
            align: ci === 0 || ci >= 7 ? "center" : "left",
          },
        })),
      );
      rowHeights[rowsOut.length - 1] = 24;
    });

    exportStyledXLSX(`Performance_Appraisal_Summary_${year}.xlsx`, {
      sheetName: "PA Summary",
      colWidths: [6, 14, 14, 26, 20, 20, 18, 13, 14, 15, 14, 14, 12, 12, 12, 14, 16, 16, 12, 10],
      rowHeights,
      rows: rowsOut,
      merges,
    });
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Performance Appraisal Summary</h2>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">
            {role === "hr"
              ? "Consolidated appraisal results for all employees with completed approvals"
              : "Appraisal results for employees under your hierarchical & approval authority"}
          </p>
          {!isGlobalViewer && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1A284F] border border-blue-200">
              Cakupan Wewenang: {scopedMeta.authorityLabel}
            </span>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-r from-slate-50 via-white to-sky-50/40 border border-slate-200/80 rounded-2xl px-6 py-4 shadow-sm">
        <div className="grid gap-4 grid-cols-5">
          <FilterSelect label="Year"         options={filterOptions.year}        value={year}        onChange={setYear} />
          <FilterSelect
            label="Company Unit"
            options={dynamicFilterOpts.companyUnit}
            value={companyUnit}
            onChange={(val) => {
              setCompanyUnit(val);
              setDivision("All Divisions");
              setDepartment("All Departments");
              setPosition("All Positions");
            }}
          />
          <FilterSelect
            label="Division"
            options={dynamicFilterOpts.division}
            value={division}
            onChange={(val) => {
              setDivision(val);
              setDepartment("All Departments");
              setPosition("All Positions");
            }}
          />
          <FilterSelect
            label="Department"
            options={dynamicFilterOpts.department}
            value={department}
            onChange={(val) => {
              setDepartment(val);
              setPosition("All Positions");
            }}
          />
          <FilterSelect
            label="Position"
            options={dynamicFilterOpts.position}
            value={position}
            onChange={setPosition}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-3.5">
        <AnalyticsStatCard
          className="lg:col-span-2"
          title="Total Employees"
          value={filtered.length}
          subtitle="Appraisal approved"
          icon={<Users className="w-5 h-5" />}
          tone="navy"
          index={0}
        />
        <AnalyticsStatCard
          className="lg:col-span-2"
          title="Average Score"
          value={avgScore}
          subtitle="Across all modules"
          icon={<TrendingUp className="w-5 h-5" />}
          tone="plum"
          index={1}
        />
        <div
          style={{ animationDelay: "100ms" }}
          className={`sm:col-span-2 lg:col-span-4 group relative overflow-hidden bg-gradient-to-br ${ANALYTICS_CARD_TONES.emerald.gradient} border ${ANALYTICS_CARD_TONES.emerald.border} rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion`}
        >
          <div
            className="pointer-events-none absolute -right-5 -bottom-6 w-28 h-28 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
            style={{ backgroundColor: `${ANALYTICS_CARD_TONES.emerald.accentHex}0D` }}
          />
          <div className="flex items-start justify-between gap-2 relative z-10 mb-2.5">
            <div>
              <p className="text-xs font-medium text-gray-500">Grade Distribution</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Distribusi perolehan grade seluruh modul</p>
            </div>
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
              style={{ backgroundColor: ANALYTICS_CARD_TONES.emerald.accentHex }}
            >
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2 relative z-10">
            {gradeCounts.map(({ grade, count }) => (
              <div
                key={grade}
                className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/80 border border-[#D3EBE1]/80 py-1.5 px-1 transition-transform duration-200 hover:-translate-y-0.5 shadow-2xs"
              >
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${gradeColor(grade)}`}>{grade}</span>
                <span className="text-base font-extrabold text-[#111827] tabular-nums leading-tight">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">Employee Appraisal Results</h3>
            <span className="text-xs text-gray-400 font-medium">{filtered.length} employees</span>
          </div>
          <button
            type="button"
            onClick={handleDownloadReport}
            className="flex items-center gap-2 bg-[#1A284F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-xs text-gray-600 font-semibold">
              <tr className="border-b border-gray-200">
                <th rowSpan={2} className="px-3 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 text-center">No</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 text-center">Aksi</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Reg No</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">ID Karyawan</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("fullName")}>
                  <div className="flex items-center gap-1">Nama Karyawan <SortIcon col="fullName" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("division")}>
                  <div className="flex items-center gap-1">Divisi <SortIcon col="division" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("department")}>
                  <div className="flex items-center gap-1">Departemen <SortIcon col="department" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Bagian</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Join Date</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Masa Kerja</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("approvalCompleteDate")}>
                  <div className="flex items-center gap-1">Update Terakhir <SortIcon col="approvalCompleteDate" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-3 py-2.5 text-center whitespace-nowrap border border-gray-200 bg-blue-50 text-blue-700">KPI</th>
                <th rowSpan={2} className="px-3 py-2.5 text-center whitespace-nowrap border border-gray-200 bg-blue-50 text-blue-700">SMART Goals</th>
                <th colSpan={3} className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-blue-100 text-blue-700 uppercase tracking-wide">Appraisal Form</th>
                <th rowSpan={2} className="px-3 py-2.5 text-center whitespace-nowrap border border-gray-200 bg-blue-50 text-blue-700">Project</th>
                <th colSpan={2} className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-amber-100 text-amber-700 uppercase tracking-wide">Supervisor Level</th>
                <th colSpan={2} className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-emerald-100 text-emerald-700 uppercase tracking-wide">Final Score</th>
              </tr>
              <tr className="border-b border-gray-200">
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-blue-50/60 text-blue-600">Form A</th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-blue-50/60 text-blue-600">Form B</th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-blue-50/60 text-blue-600">Form C</th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-amber-50/70 text-amber-600">Managerial Skill</th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-amber-50/70 text-amber-600">Mgmt Interview</th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-emerald-50/70 text-emerald-700 cursor-pointer hover:bg-emerald-100 select-none" onClick={() => handleSort("totalScore")}>
                  <div className="flex items-center justify-center gap-1">Score <SortIcon col="totalScore" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th className="px-3 py-2 text-center whitespace-nowrap border border-gray-200 bg-emerald-50/70 text-emerald-700 cursor-pointer hover:bg-emerald-100 select-none" onClick={() => handleSort("grade")}>
                  <div className="flex items-center justify-center gap-1">Grade <SortIcon col="grade" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={21} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No employees found matching the selected filters.
                  </td>
                </tr>
              ) : (
                pagedSorted.map((emp, idx) => {
                  const globalIdx = (safePage - 1) * pageSize + idx;
                  const isSelf = emp.id.toLowerCase() === activeUser.employeeId.toLowerCase();
                  const u = managedUsersById.get(emp.id.toLowerCase());
                  return (
                  <tr key={emp.id} className={isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/50 transition-colors"}>
                    <td className="px-3 py-2.5 border border-gray-100 text-center text-xs font-semibold text-gray-500">{globalIdx + 1}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-center">
                      <button
                        onClick={() => setSelectedEmployee(emp)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#1A284F] hover:text-[#B88645] transition-colors whitespace-nowrap bg-[#1A284F]/6 hover:bg-[#B88645]/10 px-3 py-1.5 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Detail
                      </button>
                    </td>
                    <td className="px-4 py-2.5 border border-gray-100 font-mono text-xs text-gray-600 whitespace-nowrap">{u?.regNo || "-"}</td>
                    <td className="px-4 py-2.5 border border-gray-100 font-mono text-xs text-gray-500 whitespace-nowrap">{emp.id}</td>
                    <td className="px-4 py-2.5 border border-gray-100 font-semibold text-gray-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{emp.fullName}</span>
                        {isSelf && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Data Saya
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.division}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.department}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{u?.bagian || "-"}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.joined}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.tenure}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.approvalCompleteDate}</td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.kpi} settingValidated={isSettingFullyApproved(emp.id, "KPI")} isYtd={emp.kpiIsYtd} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.smartGoals} settingValidated={isSettingFullyApproved(emp.id, "SMART Goals")} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formA} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formB} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formC} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.project} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-amber-50/20"><ModuleCell data={emp.managerialSkill} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-amber-50/20"><ModuleCell data={liveMI[emp.id] ?? emp.managementInterview} hideWeighted /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-emerald-50/20">
                      <span className="font-bold text-gray-900 text-xs">{emp.totalScore.toFixed(1)}%</span>
                    </td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-emerald-50/20">
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${gradeColor(emp.grade)}`}>{emp.grade}</span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalItems={sorted.length}
          currentPage={safePage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          itemLabel="karyawan"
        />
      </div>

      <DistributionByGroup employees={filtered} calibrationTargets={calibrationTargets} />

      {selectedEmployee && (
        <DetailDrawer
          employee={selectedEmployee}
          liveMIScore={liveMI[selectedEmployee.id] ?? null}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}
