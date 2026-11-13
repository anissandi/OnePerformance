import { useState, useMemo, useEffect } from "react";
import { Users, CheckCircle, Clock, TrendingUp, ChevronDown, Award, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from "recharts";
import { useLanguage } from "../../context/LangContext";
import type { Employee, CalibrationTarget } from "../../data/mockEmployees";
import {
  getLiveTransactionalEmployees, GRADE_ORDER,
  readCalibrationTargets, getModuleScoreGrade,
} from "../../data/mockEmployees";
import { isExcludedFromAppraisalCalibration, loadManagedUsers, resolveUserAllowedModules, useAuthStore, type ManagedUser } from "../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../shared/appraisalWorkflowStore";
import { buildLiveTimelineRowsFromActivation } from "./ModuleActivation";
import { SCORE_WEIGHT_EVENT } from "../shared/scoringWeightStore";
import { ACCESS_UPDATED_EVENT } from "./settings/AccessManagement";

// ── Live Transactional Completion Calculator ──────────────────────────────────
function computeModuleStatsForUsers(
  users: ManagedUser[],
  workflows: WorkflowRecord[],
  modLabel: string,
  year: string,
): { total: number; completed: number; inProgress: number; pending: number } {
  const eligibleUsers = users.filter((u) => {
    if (u.status !== "Active") return false;
    const allowed = resolveUserAllowedModules(u);
    if (modLabel === "KPI (Setting)" || modLabel === "KPI (Tracking)") {
      return allowed.includes("KPI (Setting/Measurement)");
    }
    if (modLabel === "SMART Goals (Setting)" || modLabel === "SMART Goals (Tracking)") {
      return allowed.includes("SMART Goals (Setting/Measurement)");
    }
    if (modLabel === "Appraisal Form") return allowed.includes("Appraisals Form");
    if (modLabel === "Project OJS") return allowed.includes("Project Outside Job Scope");
    if (modLabel === "Managerial Skill") return allowed.includes("Managerial Skill");
    if (modLabel === "Management Interview") return allowed.includes("Management Interview");
    return true;
  });
  const total = eligibleUsers.length;
  if (total === 0) return { total: 0, completed: 0, inProgress: 0, pending: 0 };

  let projectByEmp: Record<string, { rows?: unknown[]; submitted?: boolean }> = {};
  if (modLabel === "Project OJS") {
    try {
      projectByEmp = JSON.parse(localStorage.getItem("pa_project_icf_by_emp_v1") ?? "{}");
    } catch {
      projectByEmp = {};
    }
  }

  const mapModPhase = (m: string): { moduleName: string; phase: "setting" | "measurement" } => {
    if (m === "KPI (Setting)") return { moduleName: "KPI", phase: "setting" };
    if (m === "SMART Goals (Setting)") return { moduleName: "SMART Goals", phase: "setting" };
    if (m === "KPI (Tracking)") return { moduleName: "KPI", phase: "measurement" };
    if (m === "SMART Goals (Tracking)") return { moduleName: "SMART Goals", phase: "measurement" };
    if (m === "Project OJS") return { moduleName: "Project", phase: "measurement" };
    return { moduleName: m, phase: "measurement" };
  };

  const { moduleName, phase } = mapModPhase(modLabel);
  let completed = 0;
  let inProgress = 0;
  let pending = 0;

  for (const u of eligibleUsers) {
    const normId = normalizeEmployeeId(u.employeeId);
    const rec = workflows.find(
      (w) =>
        w.year === year &&
        w.module === moduleName &&
        w.phase === phase &&
        (w.employeeId === normId || w.employeeId.toLowerCase() === u.employeeId.toLowerCase()),
    );
    if (!rec) {
      if (modLabel === "Project OJS") {
        const prj = projectByEmp[normId] ?? projectByEmp[u.employeeId];
        if (prj && Array.isArray(prj.rows) && prj.rows.length > 0) {
          inProgress++;
          continue;
        }
      }
      pending++;
      continue;
    }
    const a2 = rec.decisions.approver2?.status ?? "";
    const a1 = rec.decisions.approver1?.status ?? "";
    if (
      a2 === "Approved" ||
      a2 === "Validated" ||
      a2.startsWith("Assessed") ||
      (!u.regNoAp2 && (a1 === "Approved" || a1.startsWith("Assessed")))
    ) {
      completed++;
    } else {
      inProgress++;
    }
  }

  return { total, completed, inProgress, pending };
}

// ── PA Cycle Timeline ──────────────────────────────────────────────────────────
const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb"];
const MONTH_YEARS = [2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027];
const TOTAL_MONTHS = 14;

// ── Module → Timeline correlation ─────────────────────────────────────────────
type TimelinePhase = "done" | "in-progress" | "not-started";

const PHASE_META: Record<TimelinePhase, { label: string; color: string; bg: string; dot: string }> = {
  "done":        { label: "Completed",   color: "#059669", bg: "#d1fae5", dot: "#10b981" },
  "in-progress": { label: "In Progress", color: "#c2410c", bg: "#ffedd5", dot: "#f97316" },
  "not-started": { label: "Not Started", color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
};

// ── All modules in display order ──────────────────────────────────────────────
const ALL_MODULES = [
  "KPI (Setting)",
  "SMART Goals (Setting)",
  "KPI (Tracking)",
  "SMART Goals (Tracking)",
  "Appraisal Form",
  "Managerial Skill",
  "Project OJS",
  "Management Interview",
] as const;

// Short labels for display inside the infographic
const MODULE_SHORT: Record<string, string> = {
  "KPI (Setting)":             "KPI Setting",
  "SMART Goals (Setting)":     "SMART Goals Setting",
  "KPI (Tracking)":         "KPI Tracking",
  "SMART Goals (Tracking)": "SMART Goals Tracking",
  "Appraisal Form":            "Appraisal Form",
  "Managerial Skill":          "Managerial Skill",
  "Project OJS":               "Project OJS",
  "Management Interview":      "Mgmt. Interview",
};

function ModuleCompletionOverview({
  companyUnit,
  module,
  scopedUsers,
  workflows,
  year,
}: {
  companyUnit: string;
  module: string;
  scopedUsers: ManagedUser[];
  workflows: WorkflowRecord[];
  year: string;
}) {
  const isAllUnits = companyUnit === "All Units";
  const [collapsed, setCollapsed] = useState(false);

  const rows = ALL_MODULES.map((mod) => {
    const { total, completed, inProgress, pending } = computeModuleStatsForUsers(scopedUsers, workflows, mod, year);
    const rate = total > 0 ? (completed / total) * 100 : 0;
    return { mod, total, completed, inProgress, pending, rate };
  });

  const isFiltered = module !== "All Modules";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm transition-all duration-300">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={`w-full flex items-center gap-3 text-left transition-all ${collapsed ? "" : "pb-3 border-b border-gray-100 mb-5"}`}
      >
        <div className="w-8 h-8 rounded-lg bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">
          <Layers className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-base">Module Completion Overview</h3>
          <p className="text-xs text-gray-500">
            {isFiltered
              ? `Showing: ${module} — other modules dimmed`
              : `Completion progress per module${isAllUnits ? " across all units" : ` — ${companyUnit}`}`}
          </p>
        </div>
        {isFiltered && (
          <span className="text-[10px] font-semibold bg-[#1A284F]/8 text-[#1A284F] px-2.5 py-1 rounded-full whitespace-nowrap">
            Filtered: {MODULE_SHORT[module] ?? module}
          </span>
        )}
        <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </div>
      </button>

      {!collapsed && (
        <div className="pa-card-motion">
      {/* Rows */}
      <div className="flex flex-col gap-2">
        {rows.map(({ mod, total, completed, inProgress, pending, rate }) => {
          const isActive  = module === mod;
          const isDimmed  = isFiltered && !isActive;
          const cPct      = total > 0 ? (completed   / total) * 100 : 0;
          const iPct      = total > 0 ? (inProgress  / total) * 100 : 0;
          const pPct      = total > 0 ? (pending     / total) * 100 : 0;
          const rateColor = rate >= 80 ? "#059669" : rate >= 40 ? "#d97706" : "#6B7280";

          return (
            <div
              key={mod}
              className={`rounded-xl px-4 py-2.5 transition-all duration-200 ${
                isActive ? "bg-[#1A284F]/5 ring-1 ring-[#1A284F]/20" :
                isDimmed ? "opacity-35" :
                "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Module label */}
                <div className="w-52 shrink-0">
                  <span className={`text-sm font-semibold ${isActive ? "text-[#1A284F]" : "text-gray-700"}`}>
                    {MODULE_SHORT[mod]}
                  </span>
                </div>

                {/* Stacked progress bar */}
                <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-gray-100">
                  {cPct > 0 && (
                    <div
                      className="h-full bg-emerald-500 pa-bar-animate"
                      style={{ width: `${cPct}%` }}
                      title={`Completed: ${completed}`}
                    />
                  )}
                  {iPct > 0 && (
                    <div
                      className="h-full bg-orange-400 pa-bar-animate"
                      style={{ width: `${iPct}%` }}
                      title={`In Progress: ${inProgress}`}
                    />
                  )}
                  {pPct > 0 && (
                    <div
                      className="h-full bg-gray-200 transition-all duration-500"
                      style={{ width: `${pPct}%` }}
                      title={`Pending: ${pending}`}
                    />
                  )}
                </div>

                {/* Stats strip */}
                <div className="shrink-0 flex items-center gap-4 w-72">
                  <span className="w-12 text-right text-sm font-bold tabular-nums" style={{ color: rateColor }}>
                    {rate.toFixed(1)}%
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
                      <span className="font-semibold text-emerald-700">{completed}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" />
                      <span className="font-semibold text-orange-600">{inProgress}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-sm bg-gray-300 inline-block" />
                      <span className="font-semibold text-gray-500">{pending}</span>
                    </span>
                    <span className="text-gray-300">/ {total}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block" />In Progress</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" />Not Started</span>
      </div>
        </div>
      )}
    </div>
  );
}

// ── Score / Grade Distribution (copied from /hr/summary) ──────────────────────
function ScoreGradeDistributionDashboard({
  employees,
  calibrationTargets,
  module,
}: {
  employees: Employee[];
  calibrationTargets: CalibrationTarget[];
  module: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Re-derive grade based on selected module's score field
  const derivedEmployees = useMemo(() => {
    if (module === "All Modules") return employees;
    return employees
      .map(emp => {
        const sg = getModuleScoreGrade(emp, module);
        if (!sg) return null;
        return { ...emp, totalScore: sg.score, grade: sg.grade };
      })
      .filter(Boolean) as Employee[];
  }, [employees, module]);

  const evaluatedEmployees = derivedEmployees.filter((e) => e.grade && e.grade !== "N/A" && e.grade !== "—");
  const total = evaluatedEmployees.length || 1;
  const gradeMap = Object.fromEntries(calibrationTargets.map(cg => [cg.grade, cg]));

  const bellData = GRADE_ORDER.map(g => {
    const cg          = gradeMap[g] ?? { target: 0, color: "#6B7280" };
    const actualCount = evaluatedEmployees.filter(e => e.grade === g).length;
    const actualPct   = evaluatedEmployees.length > 0 ? Math.round((actualCount / total) * 100) : 0;
    return {
      grade: g,
      areaTarget: cg.target,
      areaActual: actualPct,
      barTarget:  cg.target,
      barActual:  actualPct,
      actualCount,
      color: cg.color,
    };
  });

  const actualCounts = calibrationTargets.map(cg => ({
    ...cg,
    actual:    evaluatedEmployees.filter(e => e.grade === cg.grade).length,
    actualPct: evaluatedEmployees.length > 0 ? Math.round((evaluatedEmployees.filter(e => e.grade === cg.grade).length / total) * 100) : 0,
  }));

  const moduleLabel = module !== "All Modules" ? ` — ${module}` : "";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 transition-all duration-300">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={`w-full flex items-center gap-3 text-left transition-all ${collapsed ? "" : "pb-3 border-b border-gray-100 mb-6"}`}
      >
        <div className="w-8 h-8 rounded-lg bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">
          <Award className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-base">Score / Grade Distribution</h3>
          <p className="text-xs text-gray-500">
            Actual employee distribution vs calibration targets{moduleLabel}
          </p>
        </div>
        {module !== "All Modules" && (
          <span className="text-[10px] font-semibold bg-[#1A284F]/8 text-[#1A284F] px-2.5 py-1 rounded-full whitespace-nowrap">
            {module}
          </span>
        )}
        <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </div>
      </button>

      {!collapsed && (
      <div className="grid grid-cols-2 gap-8 pa-card-motion">
        {/* ── Bell Curve ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Grade Distribution (Bell Curve)
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                key={`bell-${module}`}
                data={bellData}
                margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
              >
                <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis
                  key="xaxis"
                  dataKey="grade"
                  tickLine={false}
                  axisLine={false}
                  tick={({ x, y, payload }) => {
                    const cg = gradeMap[payload.value];
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={14} textAnchor="middle" fontSize={12} fontWeight={700} fill={cg?.color ?? "#6B7280"}>
                          {payload.value}
                        </text>
                      </g>
                    );
                  }}
                />
                <YAxis key="yaxis" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  key="tooltip"
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const cg = gradeMap[d.grade];
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-lg text-xs">
                        <p className="font-bold mb-1" style={{ color: cg?.color }}>{d.grade}</p>
                        <p className="text-gray-500">Target: <span className="font-semibold text-gray-700">{d.areaTarget}%</span></p>
                        <p className="text-gray-500">Actual: <span className="font-semibold text-gray-700">{d.areaActual}%</span> ({d.actualCount} employees)</p>
                      </div>
                    );
                  }}
                />
                <Area
                  key="area-target"
                  type="monotone"
                  dataKey="areaTarget"
                  name="Target"
                  stroke="#6366F1"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fill="#6366F1" fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 4, fill: "#6366F1" }}
                  isAnimationActive={true}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
                <Area
                  key="area-actual"
                  type="monotone"
                  dataKey="areaActual"
                  name="Actual"
                  stroke="#06B6D4"
                  strokeWidth={2.5}
                  fill="#06B6D4" fillOpacity={0.28}
                  dot={{ r: 4, fill: "#06B6D4", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#06B6D4" }}
                  isAnimationActive={true}
                  animationDuration={950}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-5 mt-3 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#6366F1" strokeWidth="2" strokeDasharray="5 3" /></svg>
              <span>Target (calibration)</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#06B6D4" strokeWidth="2.5" /></svg>
              <span>Actual</span>
            </div>
          </div>
        </div>

        {/* ── Target vs Actual Proportion ─────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Target vs Actual Proportion (%)
          </p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                key={`bars-${module}`}
                data={bellData}
                margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
                barSize={18}
                barGap={4}
                barCategoryGap="28%"
              >
                <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis
                  key="xaxis"
                  dataKey="grade"
                  tickLine={false}
                  axisLine={false}
                  tick={({ x, y, payload }) => {
                    const cg = gradeMap[payload.value];
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={14} textAnchor="middle" fontSize={12} fontWeight={700} fill={cg?.color ?? "#6B7280"}>
                          {payload.value}
                        </text>
                      </g>
                    );
                  }}
                />
                <YAxis key="yaxis" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={v => `${v}%`} />
                <Tooltip key="tooltip" formatter={(v: number) => `${v}%`} />
                <Bar key="bar-target" dataKey="barTarget" name="Target" radius={[4, 4, 0, 0]} fill="#C7D2FE" isAnimationActive={true} animationDuration={850} animationEasing="ease-out" />
                <Bar key="bar-actual" dataKey="barActual" name="Actual" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={950} animationEasing="ease-out">
                  {bellData.map((d, i) => (
                    <Cell key={`ad-bar-cell-${i}`} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {actualCounts.map(cg => (
              <div key={cg.grade} className="flex items-center gap-1.5 text-xs bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
                <span className="font-bold" style={{ color: cg.color }}>{cg.grade}</span>
                <span className="text-gray-400">{cg.actual} emp</span>
                <span className={`font-semibold ${cg.actualPct > cg.target ? "text-orange-500" : cg.actualPct < cg.target ? "text-blue-500" : "text-emerald-500"}`}>
                  {cg.actualPct}%<span className="text-gray-300 font-normal">/{cg.target}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────


const filterOptions = {
  companyUnit: ["All Units", "PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)", "PT RSTM", "PT GHS", "ASD"],
  module: ["All Modules", "KPI (Setting)", "SMART Goals (Setting)", "KPI (Tracking)", "SMART Goals (Tracking)", "Appraisal Form", "Managerial Skill", "Project OJS", "Management Interview"],
  year: ["2026", "2025", "2024", "2023"],
  month: ["All Months", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function FilterSelect({ label, options, value, onChange, highlight }: { label: string; options: string[]; value: string; onChange: (v: string) => void; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className={`text-xs font-semibold uppercase tracking-wide ${highlight ? "text-[#1A284F]" : "text-gray-500"}`}>{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`w-full appearance-none bg-white border rounded-lg px-3 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 cursor-pointer transition-colors ${
            highlight && value !== options[0]
              ? "border-[#1A284F]/40 text-[#1A284F] ring-[#1A284F]/20 bg-[#1A284F]/5"
              : "border-gray-200 text-gray-800 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 hover:border-gray-300"
          }`}>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${highlight && value !== options[0] ? "text-[#1A284F]" : "text-gray-400"}`} />
      </div>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
  collapsed,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 text-left transition-all ${collapsed ? "" : "pb-3 border-b border-gray-100 mb-6"}`}
    >
      <div className="w-8 h-8 rounded-lg bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">{icon}</div>
      <div className="flex-1">
        <h3 className="font-bold text-gray-900 text-base">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {onToggle && (
        <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0">
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </div>
      )}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AnalyticsDashboard({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const { t } = useLanguage();
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const effectiveLockedUnits = lockedUnits ?? authLockedUnits;
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [companyUnit, setCompanyUnit] = useState("All Units");
  const [module, setModule] = useState("All Modules");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("All Months");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onRefresh = () => setTick((v) => v + 1);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-employees-imported", onRefresh);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("pa-module-activation-updated", onRefresh);
    window.addEventListener("feedback-activation-changed", onRefresh);
    window.addEventListener(SCORE_WEIGHT_EVENT, onRefresh);
    window.addEventListener(ACCESS_UPDATED_EVENT, onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-employees-imported", onRefresh);
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("pa-module-activation-updated", onRefresh);
      window.removeEventListener("feedback-activation-changed", onRefresh);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  // Calibration targets (same source as /hr/summary)
  const [calibrationTargets, setCalibrationTargets] = useState<CalibrationTarget[]>(
    () => readCalibrationTargets("All Units")
  );
  useEffect(() => { setCalibrationTargets(readCalibrationTargets(companyUnit)); }, [companyUnit, tick]);

  // Employees filtered by company unit (for the grade distribution charts)
  const liveEmployees = useMemo(() => getLiveTransactionalEmployees(), [tick]);
  const filteredEmployees = useMemo(
    () => {
      const unitEmployees = effectiveLockedUnits
        ? liveEmployees.filter(e => effectiveLockedUnits.includes(e.companyUnit))
        : liveEmployees;
      return companyUnit === "All Units"
        ? unitEmployees
        : unitEmployees.filter(e => e.companyUnit === companyUnit);
    },
    [companyUnit, effectiveLockedUnits, liveEmployees],
  );

  const scopedUsers = useMemo(() => {
    const all = loadManagedUsers().filter((u) => u.status === "Active" && !isExcludedFromAppraisalCalibration(u));
    const unitFiltered = effectiveLockedUnits ? all.filter((u) => effectiveLockedUnits.includes(u.company)) : all;
    return companyUnit === "All Units" ? unitFiltered : unitFiltered.filter((u) => u.company === companyUnit);
  }, [companyUnit, effectiveLockedUnits, tick]);

  const workflows = useMemo(() => loadWorkflowRecords(), [tick]);

  // Live timeline rows built directly from /hr/modules (Module Activation)
  const { rows: liveTimelineRows, todayMonthSlot, todayLabel } = useMemo(
    () => buildLiveTimelineRowsFromActivation(year),
    [year, tick],
  );

  const activeTimelineInfo = useMemo(() => {
    if (module === "All Modules") return null;
    const idx = liveTimelineRows.findIndex((r) => r.filterModuleLabel === module);
    if (idx < 0) return null;
    return { rowIndex: idx, phase: liveTimelineRows[idx].status };
  }, [module, liveTimelineRows]);

  // Stats computed 100% from imported employees and live workflow transactions
  const stats = useMemo(() => {
    if (module !== "All Modules") {
      const { total, completed, inProgress, pending } = computeModuleStatsForUsers(scopedUsers, workflows, module, year);
      return { total, completed, inProgress, pending, rate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0" };
    }

    const total = scopedUsers.length;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    for (const u of scopedUsers) {
      const normId = normalizeEmployeeId(u.employeeId);
      const userRecs = workflows.filter(
        (w) => w.year === year && (w.employeeId === normId || w.employeeId.toLowerCase() === u.employeeId.toLowerCase()),
      );
      if (userRecs.length === 0) {
        pending++;
      } else {
        const allDone = userRecs.every((r) => {
          const a2 = r.decisions.approver2?.status ?? "";
          const a1 = r.decisions.approver1?.status ?? "";
          return a2 === "Approved" || a2 === "Validated" || a2.startsWith("Assessed") || (!u.regNoAp2 && (a1 === "Approved" || a1.startsWith("Assessed")));
        });
        if (allDone) completed++;
        else inProgress++;
      }
    }

    return { total, completed, inProgress, pending, rate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0" };
  }, [module, scopedUsers, workflows, year]);

  const hasActiveFilters = companyUnit !== "All Units" || module !== "All Modules" || year !== "2026" || month !== "All Months";

  return (
    <div className="w-full flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{t("Analytics Dashboard")}</h2>
          <p className="text-sm text-gray-500">{t("Track completion status and export final appraisal scores")}</p>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-md">
        <div className="grid gap-4 grid-cols-4">
          <FilterSelect
            label={t("Company Unit")}
            options={effectiveLockedUnits ? ["All Units", ...effectiveLockedUnits] : filterOptions.companyUnit}
            value={companyUnit}
            onChange={setCompanyUnit}
          />
          <FilterSelect label={t("Module")}       options={filterOptions.module}       value={module}       onChange={setModule} highlight />
          <FilterSelect label={t("Year")}         options={filterOptions.year}         value={year}         onChange={setYear} />
          <FilterSelect label={t("Month")}        options={filterOptions.month}        value={month}        onChange={setMonth} />
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end mt-2">
            <button onClick={() => { setCompanyUnit("All Units"); setModule("All Modules"); setYear("2026"); setMonth("All Months"); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
          </div>
        )}
        {module !== "All Modules" && activeTimelineInfo && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Module PA Status:</span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: PHASE_META[activeTimelineInfo.phase].bg, color: PHASE_META[activeTimelineInfo.phase].color }}
            >
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: PHASE_META[activeTimelineInfo.phase].dot }} />
              {PHASE_META[activeTimelineInfo.phase].label}
            </span>
            <span className="text-xs text-gray-400">
              — see highlighted row in PA Cycle Timeline below
            </span>
          </div>
        )}
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <StatCard
          title={t("Total Employees")}
          value={String(stats.total)}
          subtitle="Active headcount in scope"
          icon={<Users className="w-5 h-5" />}
          gradient="from-[#EAEFF9] via-[#F6F8FD] to-white"
          border="border-[#DCE3F2]"
          accentHex="#1E3A6E"
        />
        <StatCard
          title={t("Completed Appraisals")}
          value={String(stats.completed)}
          subtitle="Verified & finalized"
          icon={<CheckCircle className="w-5 h-5" />}
          gradient="from-[#E6F4EE] via-[#F4FAF7] to-white"
          border="border-[#D3EBE1]"
          accentHex="#2D6A5B"
        />
        <StatCard
          title={t("In Progress")}
          value={String(stats.inProgress)}
          subtitle="Under review / approval"
          icon={<Clock className="w-5 h-5" />}
          gradient="from-[#FBECE5] via-[#FDF7F4] to-white"
          border="border-[#F2DCD2]"
          accentHex="#A85D43"
        />
        <StatCard
          title={t("Not Started")}
          value={String(stats.pending)}
          subtitle="Pending submission"
          icon={<Clock className="w-5 h-5" />}
          gradient="from-[#ECEFF8] via-[#F7F8FC] to-white"
          border="border-[#DDE2F0]"
          accentHex="#142546"
        />
        <StatCard
          title={t("Completion Rate")}
          value={`${stats.rate}%`}
          subtitle={`${stats.completed} of ${stats.total} completed`}
          icon={<TrendingUp className="w-5 h-5" />}
          gradient="from-[#F2ECF9] via-[#F9F6FD] to-white"
          border="border-[#E4D8F3]"
          accentHex="#5B3E86"
        />
      </div>

      {/* ── PA Cycle Timeline ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm transition-all duration-300">
        <SectionHeading
          icon={<Clock className="w-4 h-4" />}
          title="PA Cycle Timeline"
          subtitle={
            module !== "All Modules" && activeTimelineInfo
              ? `Showing: ${module} — ${PHASE_META[activeTimelineInfo.phase].label} (highlighted row)`
              : "Jadwal appraisal mengikuti SK Penilaian Kinerja yang sudah di tetapkan di masing-masing Unit Usaha."
          }
          collapsed={timelineCollapsed}
          onToggle={() => setTimelineCollapsed((c) => !c)}
        />
        {!timelineCollapsed && (
        <div className="overflow-x-auto pa-card-motion">
          <div className="min-w-[760px]">

            {/* Year band */}
            <div className="flex ml-44 mb-0">
              <div className="text-center text-[10px] font-semibold text-gray-400 pb-1 border-b border-gray-200" style={{ flex: 12 }}>
                {year}
              </div>
              <div className="text-center text-[10px] font-semibold pb-1 border-b border-[#1A284F]/30" style={{ flex: 2, color: "#1A284F99" }}>
                {Number(year) + 1}
              </div>
            </div>

            {/* Month headers */}
            <div className="flex mb-1 ml-44">
              {MONTHS.map((m, i) => (
                <div
                  key={i}
                  className={`flex-1 text-center text-[10px] font-semibold pb-2 ${
                    i === todayMonthSlot ? "text-[#1A284F] font-black" : i >= 12 ? "text-[#1A284F]/50" : "text-gray-400"
                  }`}
                >
                  {m}
                  {i === todayMonthSlot && <div className="w-0.5 h-2 bg-[#1A284F]/40 mx-auto mt-0.5 rounded-full" />}
                </div>
              ))}
            </div>

            <div className="relative pt-6">
              {/* Column shading */}
              <div className="absolute inset-0 ml-44 flex pointer-events-none">
                {MONTHS.map((_, i) => (
                  <div key={i} className={`flex-1 ${i % 2 === 0 ? "bg-gray-50/50" : ""} ${i === todayMonthSlot ? "bg-blue-50/50" : ""} ${i >= 12 ? "bg-indigo-50/20" : ""}`} />
                ))}
              </div>

              {/* Today marker */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10"
                style={{ left: `calc(11rem + (100% - 11rem) * ${((todayMonthSlot + 0.5) / TOTAL_MONTHS).toFixed(4)})` }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="bg-[#1A284F] text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                    {todayLabel}
                  </div>
                </div>
                <div className="absolute top-5 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#1A284F]/50" />
              </div>

              {/* Timeline rows */}
              {liveTimelineRows.map((row, ri) => {
                const isActiveRow    = activeTimelineInfo?.rowIndex === ri;
                const isInactiveRow  = activeTimelineInfo !== null && !isActiveRow;
                const dotColor = PHASE_META[row.status].dot;

                return (
                  <div
                    key={row.id}
                    className={`flex items-center mb-2 rounded-xl transition-all duration-300 ${
                      isInactiveRow ? "opacity-25" : ""
                    } ${isActiveRow ? "-mx-2 px-2 py-1 border" : ""}`}
                    style={isActiveRow ? {
                      background: `${PHASE_META[activeTimelineInfo!.phase].bg}60`,
                      borderColor: `${PHASE_META[activeTimelineInfo!.phase].dot}99`,
                    } : undefined}
                  >
                    <div className="w-44 shrink-0 pr-3 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: dotColor }} />
                      <span className="text-xs font-medium text-gray-700 leading-tight">{row.label}</span>
                      {isActiveRow && activeTimelineInfo && (
                        <span
                          className="ml-auto shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: PHASE_META[activeTimelineInfo.phase].bg, color: PHASE_META[activeTimelineInfo.phase].color }}
                        >
                          {PHASE_META[activeTimelineInfo.phase].label}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 relative flex h-8">
                      {MONTHS.map((_, mi) => (
                        <div key={mi} className="flex-1 h-8 relative" />
                      ))}
                      {row.segments.map((s, si) => {
                        const leftPct = (s.start / TOTAL_MONTHS) * 100;
                        const widthPct = ((s.end - s.start + 1) / TOTAL_MONTHS) * 100;
                        return (
                          <div
                            key={si}
                            className="absolute inset-y-1.5 rounded-md pa-bar-animate transition-opacity duration-300 flex items-center justify-center px-2 overflow-hidden"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              background: s.color,
                              opacity: 0.9,
                            }}
                            title={s.phase}
                          >
                            <span className="text-[10px] font-bold text-white whitespace-nowrap truncate">
                              {s.phase}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 ml-44 text-[10px] text-gray-500">
              {[
                { label: "Done",        color: "#10b981" },
                { label: "In Progress", color: "#f97316" },
                { label: "Not Started", color: "#9ca3af" },
              ].map(p => (
                <span key={p.label} className="flex items-center gap-1.5">
                  <span className="w-8 h-2.5 rounded-sm" style={{ background: p.color, opacity: 0.85 }} />
                  {p.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 ml-auto">
                <span className="w-px h-4 bg-[#1A284F]/50 inline-block" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Today ({todayLabel})
              </span>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── Score / Grade Distribution + Target vs Actual ──────────────────── */}
      <ScoreGradeDistributionDashboard
        employees={filteredEmployees}
        calibrationTargets={calibrationTargets}
        module={module}
      />

      {/* ── Module Completion Overview ─────────────────────────────────────── */}
      <ModuleCompletionOverview
        companyUnit={companyUnit}
        module={module}
        scopedUsers={scopedUsers}
        workflows={workflows}
        year={year}
      />


    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  subtitle,
  icon,
  gradient,
  border,
  accentHex,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  border: string;
  accentHex: string;
}) {
  return (
    <div
      className={`group relative overflow-hidden bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion`}
    >
      <div
        className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
        style={{ backgroundColor: `${accentHex}0D` }}
      />
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
          <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
          style={{ backgroundColor: accentHex }}
        >
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
        <p className="text-[11px] text-gray-500 font-medium truncate">{subtitle}</p>
        <svg
          className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          viewBox="0 0 64 24"
          fill="none"
        >
          <path
            d="M2 20L16 14L26 17L40 9L50 12L62 5"
            stroke={accentHex}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
