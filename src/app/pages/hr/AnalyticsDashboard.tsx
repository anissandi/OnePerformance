import { useState, useMemo, useEffect } from "react";
import { Users, CheckCircle, Clock, TrendingUp, ChevronDown, Award, Layers } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from "recharts";
import { useLanguage } from "../../context/LangContext";
import type { Employee, CalibrationTarget } from "../../data/mockEmployees";
import {
  mockEmployees, GRADE_ORDER,
  readCalibrationTargets, getModuleScoreGrade,
} from "../../data/mockEmployees";

// ── Master data (All Units / All Modules) ──────────────────────────────────────
const allDivisionData = [
  { name: "Coconut",    Completed: 45, "In Progress": 10, Pending: 5,  total: 60, rate: 75.0 },
  { name: "Pineapple",  Completed: 28, "In Progress": 4,  Pending: 8,  total: 40, rate: 70.0 },
  { name: "Qual. Mgmt", Completed: 35, "In Progress": 8,  Pending: 12, total: 55, rate: 63.6 },
  { name: "Material",   Completed: 15, "In Progress": 3,  Pending: 2,  total: 20, rate: 75.0 },
  { name: "General",    Completed: 20, "In Progress": 5,  Pending: 5,  total: 30, rate: 66.7 },
  { name: "Utility",    Completed: 18, "In Progress": 6,  Pending: 4,  total: 28, rate: 64.3 },
  { name: "Finance",    Completed: 22, "In Progress": 3,  Pending: 3,  total: 28, rate: 78.6 },
];

const allDeptData = [
  { name: "Finance", Completed: 30, "In Progress": 5, Pending: 3, total: 38 },
  { name: "MPD",     Completed: 42, "In Progress": 9, Pending: 8, total: 59 },
  { name: "IT",      Completed: 25, "In Progress": 6, Pending: 7, total: 38 },
  { name: "HR",      Completed: 18, "In Progress": 4, Pending: 2, total: 24 },
  { name: "PHD",     Completed: 28, "In Progress": 6, Pending: 12, total: 46 },
  { name: "RMR",     Completed: 22, "In Progress": 5, Pending: 4, total: 31 },
  { name: "COF",     Completed: 20, "In Progress": 3, Pending: 6, total: 29 },
];

const unitData = [
  { id: "rsup-ind", name: "PT RSUP (Industry)",          label: "RSUP Ind.",  Completed: 88, "In Progress": 15, Pending: 12, total: 115, unitCompleted: 88,  unitInProgress: 15, unitPending: 12 },
  { id: "rsup-pkb", name: "PT RSUP (Perkebunan)",        label: "RSUP Pkbn.", Completed: 54, "In Progress": 10, Pending: 8,  total: 72,  unitCompleted: 54,  unitInProgress: 10, unitPending: 8  },
  { id: "ps-jkt",   name: "PT Pulau Sambu (Jakarta)",    label: "PS Jakarta", Completed: 32, "In Progress": 8,  Pending: 10, total: 50,  unitCompleted: 32,  unitInProgress: 8,  unitPending: 10 },
  { id: "ps-gtg",   name: "PT Pulau Sambu (Guntung)",    label: "PS Guntung", Completed: 23, "In Progress": 7,  Pending: 10, total: 40,  unitCompleted: 23,  unitInProgress: 7,  unitPending: 10 },
  { id: "ps-ke",    name: "PT Pulau Sambu (Kuala Enok)", label: "PS K.Enok",  Completed: 19, "In Progress": 5,  Pending: 6,  total: 30,  unitCompleted: 19,  unitInProgress: 5,  unitPending: 6  },
  { id: "rstm",     name: "PT RSTM",                     label: "RSTM",       Completed: 26, "In Progress": 6,  Pending: 8,  total: 40,  unitCompleted: 26,  unitInProgress: 6,  unitPending: 8  },
  { id: "ghs",      name: "PT GHS",                      label: "GHS",        Completed: 21, "In Progress": 4,  Pending: 5,  total: 30,  unitCompleted: 21,  unitInProgress: 4,  unitPending: 5  },
  { id: "asd",      name: "ASD",                      label: "ASD",        Completed: 15, "In Progress": 3,  Pending: 4,  total: 22,  unitCompleted: 15,  unitInProgress: 3,  unitPending: 4  },
];

type UnitBreakdown = { divisionData: typeof allDivisionData; deptData: typeof allDeptData };


// ── Color tokens ───────────────────────────────────────────────────────────────


// ── PA Cycle Timeline ──────────────────────────────────────────────────────────
const MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb"];
const MONTH_YEARS = [2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2026,2027,2027];
const TOTAL_MONTHS = 14;
const TODAY_MONTH  = 8; // Sep 2026 = index 8

const TIMELINE_ROWS = [
  {
    label: "KPI; SMART Goals",
    segments: [
      { start: 0,  end: 2,  color: "#10b981", phase: "Setting"     },
      { start: 3,  end: 10, color: "#f97316", phase: "Tracking" },
    ],
  },
  { label: "Appraisal Form",       segments: [{ start: 10, end: 12, color: "#9ca3af", phase: "Not Started" }] },
  { label: "Managerial Skill",     segments: [{ start: 10, end: 12, color: "#9ca3af", phase: "Not Started" }] },
  { label: "Project",              segments: [{ start: 10, end: 12, color: "#9ca3af", phase: "Not Started" }] },
  { label: "Management Interview", segments: [{ start: 12, end: 13, color: "#9ca3af", phase: "Not Started" }] },
];

// ── Module → Timeline correlation ─────────────────────────────────────────────
type TimelinePhase = "done" | "in-progress" | "not-started";
const MODULE_TIMELINE_MAP: Record<string, { rowIndex: number; segmentIndex?: number; phase: TimelinePhase }> = {
  "KPI (Setting)":             { rowIndex: 0, segmentIndex: 0, phase: "done"        },
  "SMART Goals (Setting)":     { rowIndex: 0, segmentIndex: 0, phase: "done"        },
  "KPI (Tracking)":         { rowIndex: 0, segmentIndex: 1, phase: "in-progress" },
  "SMART Goals (Tracking)": { rowIndex: 0, segmentIndex: 1, phase: "in-progress" },
  "Appraisal Form":            { rowIndex: 1,                  phase: "not-started" },
  "Managerial Skill":          { rowIndex: 2,                  phase: "not-started" },
  "Project OJS":               { rowIndex: 3,                  phase: "not-started" },
  "Management Interview":      { rowIndex: 4,                  phase: "not-started" },
};

const PHASE_META: Record<TimelinePhase, { label: string; color: string; bg: string; dot: string }> = {
  "done":        { label: "Completed",   color: "#059669", bg: "#d1fae5", dot: "#10b981" },
  "in-progress": { label: "In Progress", color: "#c2410c", bg: "#ffedd5", dot: "#f97316" },
  "not-started": { label: "Not Started", color: "#374151", bg: "#f3f4f6", dot: "#9ca3af" },
};

// ── Per-module stats (All Units) ───────────────────────────────────────────────
const MODULE_STATS: Record<string, { total: number; completed: number; inProgress: number; pending: number }> = {
  "KPI (Setting)":             { total: 205, completed: 185, inProgress: 12, pending:   8 },
  "SMART Goals (Setting)":     { total: 205, completed: 178, inProgress: 15, pending:  12 },
  "KPI (Tracking)":         { total: 205, completed:  85, inProgress: 80, pending:  40 },
  "SMART Goals (Tracking)": { total: 205, completed:  72, inProgress: 85, pending:  48 },
  "Appraisal Form":            { total: 205, completed:   0, inProgress:  7, pending: 198 },
  "Managerial Skill":          { total: 205, completed:   0, inProgress:  0, pending: 205 },
  "Project OJS":               { total: 205, completed:   0, inProgress: 10, pending: 195 },
  "Management Interview":      { total: 205, completed:   0, inProgress:  0, pending: 205 },
};

// ── Per-module division data (All Units) ───────────────────────────────────────


// ── Per-module dept data (All Units) ───────────────────────────────────────────


// ── Unit scale factors (for module × unit cross-filtering) ────────────────────
const UNIT_SCALE: Record<string, number> = {
  "All Units":                    1.000,
  "PT RSUP (Industry)":           0.288,
  "PT RSUP (Perkebunan)":         0.180,
  "PT Pulau Sambu (Jakarta)":     0.125,
  "PT Pulau Sambu (Guntung)":     0.100,
  "PT Pulau Sambu (Kuala Enok)":  0.075,
  "PT RSTM":                      0.100,
  "PT GHS":                       0.075,
  "ASD":                       0.055,
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

// ── Module Completion Overview ─────────────────────────────────────────────────
// Units with fixed completion patterns (100% done for Setting, 100% in-progress for Tracking, 100% pending for the rest)
const FIXED_COMPLETION_UNITS = new Set([
  "PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT RSTM", "PT GHS", "ASD",
]);

// Headcount per unit (from unitData totals)
const UNIT_HEADCOUNT: Record<string, number> = {
  "PT RSUP (Industry)":  115,
  "PT RSUP (Perkebunan)": 72,
  "PT RSTM":              40,
  "PT GHS":               30,
  "ASD":               22,
};

function ModuleCompletionOverview({ companyUnit, module }: { companyUnit: string; module: string }) {
  const scale      = UNIT_SCALE[companyUnit] ?? 0;
  const isAllUnits = companyUnit === "All Units";
  const isFixed    = FIXED_COMPLETION_UNITS.has(companyUnit);

  const rows = ALL_MODULES.map(mod => {
    let total: number, completed: number, inProgress: number, pending: number;

    const ALWAYS_PENDING = new Set(["Appraisal Form", "Managerial Skill", "Project OJS", "Management Interview"]);

    if (!isAllUnits && isFixed) {
      total = UNIT_HEADCOUNT[companyUnit] ?? 0;
      if (mod === "KPI (Setting)" || mod === "SMART Goals (Setting)") {
        completed = total; inProgress = 0; pending = 0;
      } else if (mod === "KPI (Tracking)" || mod === "SMART Goals (Tracking)") {
        completed = 0; inProgress = total; pending = 0;
      } else {
        completed = 0; inProgress = 0; pending = total;
      }
    } else {
      const base = MODULE_STATS[mod] ?? { total: 205, completed: 0, inProgress: 0, pending: 205 };
      total      = isAllUnits ? base.total      : Math.round(base.total      * scale);
      completed  = isAllUnits ? base.completed   : Math.round(base.completed   * scale);
      inProgress = isAllUnits ? base.inProgress  : Math.round(base.inProgress  * scale);
      pending    = isAllUnits ? base.pending     : Math.round(base.pending     * scale);
    }

    // These modules are always 100% pending across every unit
    if (ALWAYS_PENDING.has(mod)) {
      completed = 0; inProgress = 0; pending = total;
    }

    const rate = total > 0 ? (completed / total) * 100 : 0;
    return { mod, total, completed, inProgress, pending, rate };
  });

  const isFiltered = module !== "All Modules";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 pb-1 border-b border-gray-100 mb-5">
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
      </div>

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
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${cPct}%` }}
                      title={`Completed: ${completed}`}
                    />
                  )}
                  {iPct > 0 && (
                    <div
                      className="h-full bg-orange-400 transition-all duration-500"
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

  const total    = derivedEmployees.length || 1;
  const gradeMap = Object.fromEntries(calibrationTargets.map(cg => [cg.grade, cg]));

  const bellData = GRADE_ORDER.map(g => {
    const cg          = gradeMap[g] ?? { target: 0, color: "#6B7280" };
    const actualCount = derivedEmployees.filter(e => e.grade === g).length;
    const actualPct   = Math.round((actualCount / total) * 100);
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
    actual:    derivedEmployees.filter(e => e.grade === cg.grade).length,
    actualPct: Math.round((derivedEmployees.filter(e => e.grade === cg.grade).length / total) * 100),
  }));

  const moduleLabel = module !== "All Modules" ? ` — ${module}` : "";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-3 pb-1 border-b border-gray-100 mb-6">
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
      </div>

      <div className="grid grid-cols-2 gap-8">
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
                  isAnimationActive={false}
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
                  isAnimationActive={false}
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
                <Bar key="bar-target" dataKey="barTarget" name="Target" radius={[3, 3, 0, 0]} fill="#C7D2FE" isAnimationActive={false} />
                <Bar key="bar-actual" dataKey="barActual" name="Actual" radius={[3, 3, 0, 0]} isAnimationActive={false}>
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

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-1 border-b border-gray-100 mb-6">
      <div className="w-8 h-8 rounded-lg bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">{icon}</div>
      <div>
        <h3 className="font-bold text-gray-900 text-base">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AnalyticsDashboard({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const { t } = useLanguage();
  const [companyUnit, setCompanyUnit] = useState("All Units");
  const [module, setModule] = useState("All Modules");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("All Months");

  // Calibration targets (same source as /hr/summary)
  const [calibrationTargets, setCalibrationTargets] = useState<CalibrationTarget[]>(
    () => readCalibrationTargets("All Units")
  );
  useEffect(() => { setCalibrationTargets(readCalibrationTargets(companyUnit)); }, [companyUnit]);

  // Employees filtered by company unit (for the grade distribution charts)
  const filteredEmployees = useMemo(
    () => {
      const unitEmployees = lockedUnits
        ? mockEmployees.filter(e => lockedUnits.includes(e.companyUnit))
        : mockEmployees;
      return companyUnit === "All Units"
        ? unitEmployees
        : unitEmployees.filter(e => e.companyUnit === companyUnit);
    },
    [companyUnit, lockedUnits],
  );

  // Derive active timeline info from selected module
  const activeTimelineInfo = module !== "All Modules" ? MODULE_TIMELINE_MAP[module] ?? null : null;

  // Stats mirror ModuleCompletionOverview logic exactly so all infographics are consistent
  const stats = useMemo(() => {
    const ALWAYS_PENDING = new Set(["Appraisal Form", "Managerial Skill", "Project OJS", "Management Interview"]);
    const isAllUnits = companyUnit === "All Units";
    const isFixed    = FIXED_COMPLETION_UNITS.has(companyUnit);
    const scale      = UNIT_SCALE[companyUnit] ?? 0;

    let total: number, completed: number, inProgress: number, pending: number;

    if (module !== "All Modules") {
      // Specific module — identical branching to ModuleCompletionOverview
      if (!isAllUnits && isFixed) {
        total = UNIT_HEADCOUNT[companyUnit] ?? 0;
        if (module === "KPI (Setting)" || module === "SMART Goals (Setting)") {
          completed = total; inProgress = 0; pending = 0;
        } else if (module === "KPI (Tracking)" || module === "SMART Goals (Tracking)") {
          completed = 0; inProgress = total; pending = 0;
        } else {
          completed = 0; inProgress = 0; pending = total;
        }
      } else {
        const base = MODULE_STATS[module] ?? { total: 205, completed: 0, inProgress: 0, pending: 205 };
        total      = isAllUnits ? base.total      : Math.round(base.total      * scale);
        completed  = isAllUnits ? base.completed   : Math.round(base.completed   * scale);
        inProgress = isAllUnits ? base.inProgress  : Math.round(base.inProgress  * scale);
        pending    = isAllUnits ? base.pending     : Math.round(base.pending     * scale);
        // Force 100% not-started for modules not yet active (same as ModuleCompletionOverview)
        if (ALWAYS_PENDING.has(module)) { completed = 0; inProgress = 0; pending = total; }
      }
    } else {
      // All Modules — derive from unitData (single source of truth for per-unit headcounts)
      if (isAllUnits) {
        if (lockedUnits) {
          const subset = unitData.filter(u => lockedUnits.includes(u.name));
          total      = subset.reduce((s, u) => s + u.total, 0);
          completed  = subset.reduce((s, u) => s + u.Completed, 0);
          inProgress = subset.reduce((s, u) => s + u["In Progress"], 0);
          pending    = subset.reduce((s, u) => s + u.Pending, 0);
        } else {
          total = 205; completed = 143; inProgress = 30; pending = 32;
        }
      } else {
        const ud = unitData.find(u => u.name === companyUnit);
        total      = ud?.total            ?? Math.round(205 * scale);
        completed  = ud?.Completed        ?? Math.round(143 * scale);
        inProgress = ud?.["In Progress"]  ?? Math.round(30  * scale);
        pending    = ud?.Pending          ?? Math.round(32  * scale);
      }
    }

    return { total, completed, inProgress, pending, rate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0" };
  }, [companyUnit, module, lockedUnits]);

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
            options={lockedUnits ? ["All Units", ...lockedUnits] : filterOptions.companyUnit}
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
      <div className="grid grid-cols-5 gap-4">
        <StatCard title={t("Total Employees")}      value={String(stats.total)}       icon={<Users       className="w-5 h-5 text-blue-500"    />} gradient="from-blue-50 to-sky-100"       border="border-blue-100"   valueColor="text-blue-700"    />
        <StatCard title={t("Completed Appraisals")} value={String(stats.completed)}   icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} gradient="from-emerald-50 to-teal-100"   border="border-emerald-100" valueColor="text-emerald-700" />
        <StatCard title={t("In Progress")}          value={String(stats.inProgress)}  icon={<Clock       className="w-5 h-5 text-orange-500"  />} gradient="from-orange-50 to-amber-100"   border="border-orange-100"  valueColor="text-orange-700"  />
        <StatCard title={t("Not Started")}          value={String(stats.pending)}     icon={<Clock       className="w-5 h-5 text-gray-400"    />} gradient="from-gray-50 to-slate-100"     border="border-gray-200"    valueColor="text-gray-600"    />
        <StatCard title={t("Completion Rate")}      value={`${stats.rate}%`}          icon={<TrendingUp  className="w-5 h-5 text-violet-500"  />} gradient="from-violet-50 to-purple-100" border="border-violet-100"  valueColor="text-violet-700"  />
      </div>

      {/* ── PA Cycle Timeline ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <SectionHeading
          icon={<Clock className="w-4 h-4" />}
          title="PA Cycle Timeline"
          subtitle={
            module !== "All Modules" && activeTimelineInfo
              ? `Showing: ${module} — ${PHASE_META[activeTimelineInfo.phase].label} (highlighted row)`
              : "Module activation schedule — vertical line marks current period (September)"
          }
        />
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">

            {/* Year band */}
            <div className="flex ml-44 mb-0">
              <div className="text-center text-[10px] font-semibold text-gray-400 pb-1 border-b border-gray-200" style={{ flex: 12 }}>
                2026
              </div>
              <div className="text-center text-[10px] font-semibold pb-1 border-b border-[#1A284F]/30" style={{ flex: 2, color: "#1A284F99" }}>
                2027
              </div>
            </div>

            {/* Month headers */}
            <div className="flex mb-1 ml-44">
              {MONTHS.map((m, i) => (
                <div
                  key={i}
                  className={`flex-1 text-center text-[10px] font-semibold pb-2 ${
                    i === TODAY_MONTH ? "text-[#1A284F] font-black" : i >= 12 ? "text-[#1A284F]/50" : "text-gray-400"
                  }`}
                >
                  {m}
                  {i === TODAY_MONTH && <div className="w-0.5 h-2 bg-[#1A284F]/40 mx-auto mt-0.5 rounded-full" />}
                </div>
              ))}
            </div>

            <div className="relative pt-6">
              {/* Column shading */}
              <div className="absolute inset-0 ml-44 flex pointer-events-none">
                {MONTHS.map((_, i) => (
                  <div key={i} className={`flex-1 ${i % 2 === 0 ? "bg-gray-50/50" : ""} ${i === TODAY_MONTH ? "bg-blue-50/50" : ""} ${i >= 12 ? "bg-indigo-50/20" : ""}`} />
                ))}
              </div>

              {/* Today marker */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10"
                style={{ left: `calc(11rem + (100% - 11rem) * ${((TODAY_MONTH + 0.5) / TOTAL_MONTHS).toFixed(4)})` }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="bg-[#1A284F] text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                    Sep 2026
                  </div>
                </div>
                <div className="absolute top-5 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#1A284F]/50" />
              </div>

              {/* Timeline rows */}
              {TIMELINE_ROWS.map((row, ri) => {
                const isActiveRow    = activeTimelineInfo?.rowIndex === ri;
                const isInactiveRow  = activeTimelineInfo !== null && !isActiveRow;

                return (
                  <div
                    key={ri}
                    className={`flex items-center mb-2 rounded-xl transition-all duration-300 ${
                      isInactiveRow ? "opacity-25" : ""
                    } ${isActiveRow ? "-mx-2 px-2 py-1 border" : ""}`}
                    style={isActiveRow ? {
                      background: `${PHASE_META[activeTimelineInfo!.phase].bg}60`,
                      borderColor: `${PHASE_META[activeTimelineInfo!.phase].dot}99`,
                    } : undefined}
                  >
                    <div className="w-44 shrink-0 pr-3 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: row.segments[0].color }} />
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

                    <div className="flex-1 relative flex">
                      {MONTHS.map((_, mi) => {
                        const segIdx   = row.segments.findIndex(s => mi >= s.start && mi <= s.end);
                        const activeSeg = segIdx >= 0 ? row.segments[segIdx] : undefined;
                        const isFirst  = activeSeg ? mi === activeSeg.start : false;
                        const isLast   = activeSeg ? mi === activeSeg.end   : false;
                        // For rows with multiple segments (row 0), dim non-active segment when module is selected
                        const segDimmed = isActiveRow
                          && activeTimelineInfo?.segmentIndex !== undefined
                          && segIdx >= 0
                          && segIdx !== activeTimelineInfo.segmentIndex;

                        return (
                          <div key={mi} className="flex-1 h-8 relative">
                            {activeSeg && (
                              <div
                                className={`absolute inset-y-1.5 inset-x-0 transition-opacity duration-300 ${isFirst ? "rounded-l-md" : ""} ${isLast ? "rounded-r-md" : ""}`}
                                style={{ background: activeSeg.color, opacity: segDimmed ? 0.18 : 0.85 }}
                              >
                                {isFirst && !segDimmed && (
                                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white whitespace-nowrap overflow-hidden">
                                    {activeSeg.phase}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="w-28 shrink-0 pl-3 text-[10px] text-gray-400 leading-relaxed">
                      {row.segments.map((s, si) => {
                        const startStr = `${MONTHS[s.start]}${MONTH_YEARS[s.start] === 2027 ? " '27" : ""}`;
                        const endStr   = s.start !== s.end ? `–${MONTHS[s.end]}${MONTH_YEARS[s.end] === 2027 ? " '27" : ""}` : "";
                        const isActiveSeg = isActiveRow && (activeTimelineInfo?.segmentIndex === undefined || activeTimelineInfo.segmentIndex === si);
                        return (
                          <div key={si} className={isActiveSeg ? "font-semibold" : ""} style={isActiveSeg ? { color: PHASE_META[activeTimelineInfo!.phase].color } : undefined}>
                            {startStr}{endStr}
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
                Today (Sep 2026)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Score / Grade Distribution + Target vs Actual ──────────────────── */}
      <ScoreGradeDistributionDashboard
        employees={filteredEmployees}
        calibrationTargets={calibrationTargets}
        module={module}
      />

      {/* ── Module Completion Overview ─────────────────────────────────────── */}
      <ModuleCompletionOverview companyUnit={companyUnit} module={module} />


    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ title, value, icon, gradient, border, valueColor }: {
  title: string; value: string; icon: React.ReactNode;
  gradient: string; border: string; valueColor: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${gradient} border ${border} rounded-xl px-4 py-3 shadow-sm flex items-center gap-3`}>
      <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center shadow-sm shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
        <p className={`text-xl font-bold leading-tight ${valueColor}`}>{value}</p>
      </div>
    </div>
  );
}
