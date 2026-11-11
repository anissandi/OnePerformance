import { useState, useEffect, useCallback } from "react";
import { Download, ChevronDown, ChevronUp, ChevronsUpDown, Eye, X, Star } from "lucide-react";
import type { Employee, CalibrationTarget, ScoreGrade } from "../../data/mockEmployees";
import {
  mockEmployees, gradeColor, gradeFromScore, readCalibrationTargets, MI_EMPLOYEE_STORE_MAP,
} from "../../data/mockEmployees";
import {
  getPenilai1ScoreAsPercent, subscribeScores,
} from "../supervisor/managementInterviewScoreStore";
import { getActiveUser, getAuthorizedSubordinates, getScopedFilterOptionsForUser } from "../../store/authStore";

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
  year:        ["2026", "2025", "2024", "2023"],
  companyUnit: [
    "All Units",
    "PT RSUP (Industry)", "PT RSUP (Perkebunan)",
    "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)",
    "PT RSTM", "PT GHS", "ASD",
  ],
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
  const [activeTab, setActiveTab] = useState<"2026" | "2025">("2026");

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
            {(["2026", "2025"] as const).map(yr => (
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

function ModuleCell({ data }: { data: ScoreGrade | null }) {
  if (!data) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-semibold text-gray-800 text-xs">{data.score}%</span>
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
    Object.entries(MI_EMPLOYEE_STORE_MAP).forEach(([empId, storeId]) => {
      const pct = getPenilai1ScoreAsPercent(storeId);
      if (pct !== null) {
        result[empId] = { score: parseFloat(pct.toFixed(1)), grade: gradeFromScore(pct).grade };
      }
    });
    return result;
  }, []);
  const [liveMI, setLiveMI] = useState<Record<string, ScoreGrade>>(buildMIScores);
  useEffect(() => subscribeScores(() => setLiveMI(buildMIScores())), [buildMIScores]);

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
  const supervisorAllowedIds = new Set(
    role === "supervisor"
      ? getAuthorizedSubordinates(activeUser).map((u) => u.employeeId.toLowerCase())
      : [],
  );

  const filtered = mockEmployees.filter(emp => {
    if (role === "supervisor") {
      if (!supervisorAllowedIds.has(emp.id.toLowerCase())) return false;
    }
    if (lockedUnits && !lockedUnits.includes(emp.companyUnit)) return false;
    if (companyUnit !== "All Units"       && emp.companyUnit !== companyUnit) return false;
    if (division    !== "All Divisions"   && emp.division    !== division)    return false;
    if (department  !== "All Departments" && emp.department  !== department)  return false;
    if (position    !== "All Positions"   && emp.position    !== position)    return false;
    return true;
  });

  const GRADE_SORT_ORDER = ["A+", "A", "B", "C", "D", "E"];
  const sorted = [...filtered].sort((a, b) => {
    const aSelf = a.id.toLowerCase() === activeUser.employeeId.toLowerCase();
    const bSelf = b.id.toLowerCase() === activeUser.employeeId.toLowerCase();
    if (aSelf !== bSelf) return aSelf ? -1 : 1;
    let cmp = 0;
    if (sortKey === "totalScore") cmp = a.totalScore - b.totalScore;
    else if (sortKey === "grade") cmp = GRADE_SORT_ORDER.indexOf(a.grade) - GRADE_SORT_ORDER.indexOf(b.grade);
    else cmp = (a[sortKey] ?? "").toString().localeCompare((b[sortKey] ?? "").toString());
    return sortDir === "asc" ? cmp : -cmp;
  });

  const gradeCounts = ["A+", "A", "B", "C", "D", "E"].map(g => ({
    grade: g,
    count: filtered.filter(e => e.grade === g).length,
  }));

  const avgScore = filtered.length
    ? (filtered.reduce((s, e) => s + e.totalScore, 0) / filtered.length).toFixed(1)
    : "—";

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
          {role === "supervisor" && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1A284F] border border-blue-200">
              Cakupan Wewenang: {scopedMeta.authorityLabel}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="grid gap-4 grid-cols-5">
          <FilterSelect label="Year"         options={filterOptions.year}        value={year}        onChange={setYear} />
          <FilterSelect
            label="Company Unit"
            options={
              lockedUnits
                ? ["All Units", ...lockedUnits]
                : role === "supervisor" && scopedMeta.units.length > 0
                ? ["All Units", ...scopedMeta.units]
                : filterOptions.companyUnit
            }
            value={companyUnit}
            onChange={setCompanyUnit}
          />
          <FilterSelect
            label="Division"
            options={
              role === "supervisor" && scopedMeta.divisions.length > 0
                ? ["All Divisions", ...scopedMeta.divisions]
                : filterOptions.division
            }
            value={division}
            onChange={setDivision}
          />
          <FilterSelect
            label="Department"
            options={
              role === "supervisor" && scopedMeta.departments.length > 0
                ? ["All Departments", ...scopedMeta.departments]
                : filterOptions.department
            }
            value={department}
            onChange={setDepartment}
          />
          <FilterSelect
            label="Position"
            options={
              role === "supervisor" && scopedMeta.positions.length > 0
                ? ["All Positions", ...scopedMeta.positions]
                : filterOptions.position
            }
            value={position}
            onChange={setPosition}
          />
        </div>
      </div>

      <div className="grid grid-cols-8 gap-3">
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Employees</p>
          <p className="text-3xl font-bold text-gray-900">{filtered.length}</p>
          <p className="text-xs text-gray-400">Appraisal approved</p>
        </div>
        <div className="col-span-2 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col gap-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Average Score</p>
          <p className="text-3xl font-bold text-[#1A284F]">{avgScore}</p>
          <p className="text-xs text-gray-400">Across all modules</p>
        </div>
        <div className="col-span-4 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Grade Distribution</p>
          <div className="flex items-center gap-3">
            {gradeCounts.map(({ grade, count }) => (
              <div key={grade} className="flex-1 flex flex-col items-center gap-1">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${gradeColor(grade)}`}>{grade}</span>
                <span className="text-lg font-bold text-gray-800">{count}</span>
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
          <button className="flex items-center gap-2 bg-[#1A284F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-gray-50 text-xs text-gray-600 font-semibold">
              <tr className="border-b border-gray-200">
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 text-center">Action</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Employee ID</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("fullName")}>
                  <div className="flex items-center gap-1">Full Name <SortIcon col="fullName" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("position")}>
                  <div className="flex items-center gap-1">Position <SortIcon col="position" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("department")}>
                  <div className="flex items-center gap-1">Department <SortIcon col="department" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("division")}>
                  <div className="flex items-center gap-1">Division <SortIcon col="division" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("companyUnit")}>
                  <div className="flex items-center gap-1">Company Unit <SortIcon col="companyUnit" sortKey={sortKey} sortDir={sortDir} /></div>
                </th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Joined</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100">Tenure</th>
                <th rowSpan={2} className="px-4 py-2.5 whitespace-nowrap border border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("approvalCompleteDate")}>
                  <div className="flex items-center gap-1">Approval Date <SortIcon col="approvalCompleteDate" sortKey={sortKey} sortDir={sortDir} /></div>
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
                  <td colSpan={20} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No employees found matching the selected filters.
                  </td>
                </tr>
              ) : (
                sorted.map(emp => {
                  const isSelf = emp.id.toLowerCase() === activeUser.employeeId.toLowerCase();
                  return (
                  <tr key={emp.id} className={isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/50 transition-colors"}>
                    <td className="px-4 py-2.5 border border-gray-100 text-center">
                      <button
                        onClick={() => setSelectedEmployee(emp)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#1A284F] hover:text-[#B88645] transition-colors whitespace-nowrap bg-[#1A284F]/6 hover:bg-[#B88645]/10 px-3 py-1.5 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Detail
                      </button>
                    </td>
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
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.position}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.department}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.division}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-600 whitespace-nowrap">{emp.companyUnit}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.joined}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.tenure}</td>
                    <td className="px-4 py-2.5 border border-gray-100 text-gray-500 whitespace-nowrap">{emp.approvalCompleteDate}</td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.kpi} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.smartGoals} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formA} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formB} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.formC} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-blue-50/20"><ModuleCell data={emp.project} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-amber-50/20"><ModuleCell data={emp.managerialSkill} /></td>
                    <td className="px-3 py-2.5 border border-gray-100 text-center bg-amber-50/20"><ModuleCell data={liveMI[emp.id] ?? emp.managementInterview} /></td>
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
