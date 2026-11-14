import { useState, useMemo, useEffect } from "react";
import {
  Users,
  CheckCircle,
  Clock,
  TrendingUp,
  ChevronDown,
  Award,
  Layers,
  SlidersHorizontal,
  Target,
  ClipboardList,
  Gauge,
  Briefcase,
  Network,
  MessageSquare,
  BarChart3,
  GitPullRequest,
  RotateCcw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  PieChart,
  Pie,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { useLanguage } from "../../context/LangContext";
import type { Employee, CalibrationTarget } from "../../data/mockEmployees";
import {
  getLiveTransactionalEmployees, GRADE_ORDER,
  readCalibrationTargets, getModuleScoreGrade,
} from "../../data/mockEmployees";
import {
  isExcludedFromAppraisalCalibration,
  loadManagedUsers,
  resolveUserAllowedModules,
  shouldBypassCheckerForSubmission,
  useAuthStore,
  type ManagedUser,
} from "../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../shared/appraisalWorkflowStore";
import { buildLiveTimelineRowsFromActivation } from "./ModuleActivation";
import { SCORE_WEIGHT_EVENT } from "../shared/scoringWeightStore";
import { ACCESS_UPDATED_EVENT } from "./settings/AccessManagement";
import { evaluateEmployeeKPITracking } from "../employee/KPIPage";
import { loadFeedbackSubmissions } from "../shared/interDepartmentFeedbackStore";
import { normalizeDateDDMMYYYY } from "../../utils/dateFormat";

const MONTH_NAME_TO_MM: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

function matchesMonthFilter(dateStr: string | undefined, monthFilter: string): boolean {
  if (!monthFilter || monthFilter === "All Months") return true;
  const targetMm = MONTH_NAME_TO_MM[monthFilter];
  if (!targetMm) return true;
  const norm = normalizeDateDDMMYYYY(dateStr);
  if (norm === "—") return false;
  const parts = norm.split("/");
  return parts.length === 3 && parts[1] === targetMm;
}

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
    if (modLabel === "Inter-Department Feedback") return allowed.includes("Inter-Departement Feedback");
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

  const feedbackSubs = modLabel === "Inter-Department Feedback" ? loadFeedbackSubmissions() : [];

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
    if (modLabel === "KPI (Tracking)") {
      const evalKpi = evaluateEmployeeKPITracking(u.employeeId);
      const isVal = Boolean(
        rec &&
          (rec.decisions.validator?.status === "Validated" ||
            rec.decisions.approver2?.status === "Validated"),
      );
      if (evalKpi.isFullYearMonthsComplete && isVal) {
        completed++;
      } else if (rec || evalKpi.hasAnyTrackingData) {
        inProgress++;
      } else {
        pending++;
      }
      continue;
    }
    if (
      modLabel === "KPI (Setting)" ||
      modLabel === "SMART Goals (Setting)" ||
      modLabel === "SMART Goals (Tracking)"
    ) {
      if (!rec) {
        pending++;
      } else if (
        rec.decisions.validator?.status === "Validated" ||
        rec.decisions.approver2?.status === "Validated"
      ) {
        completed++;
      } else {
        inProgress++;
      }
      continue;
    }
    if (modLabel === "Inter-Department Feedback") {
      const fb = feedbackSubs.find(
        (s) =>
          normalizeEmployeeId(s.row.employeeId) === normId ||
          s.row.employeeId.toLowerCase() === u.employeeId.toLowerCase(),
      );
      const fbDone = Boolean(
        (fb?.followUps.approver1?.length && fb?.followUps.approver2?.length) ||
          (rec &&
            (rec.decisions.approver2?.status === "Approved" ||
              rec.decisions.approver2?.status?.startsWith("Assessed"))),
      );
      if (fbDone) {
        completed++;
      } else if (fb || rec) {
        inProgress++;
      } else {
        pending++;
      }
      continue;
    }
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

// ── All 9 modules in exact 3×3 card order (matching Gambar 2) ─────────────────
const ALL_MODULES = [
  "KPI (Setting)",
  "SMART Goals (Setting)",
  "Appraisal Form",
  "KPI (Tracking)",
  "SMART Goals (Tracking)",
  "Project OJS",
  "Managerial Skill",
  "Management Interview",
  "Inter-Department Feedback",
] as const;

// Short labels for display inside the infographic
const MODULE_SHORT: Record<string, string> = {
  "KPI (Setting)":             "KPI Setting",
  "SMART Goals (Setting)":     "SMART Goals Setting",
  "Appraisal Form":            "Appraisals Form",
  "KPI (Tracking)":            "KPI Tracking",
  "SMART Goals (Tracking)":    "SMART Goals Tracking",
  "Project OJS":               "Project OJS",
  "Managerial Skill":          "Managerial Skill",
  "Management Interview":      "Mgmt. Interview",
  "Inter-Department Feedback": "Inter-Department Feedback",
};

const MODULE_CARD_ICON: Record<string, React.ReactNode> = {
  "KPI (Setting)":             <SlidersHorizontal className="w-4 h-4" />,
  "SMART Goals (Setting)":     <Target className="w-4 h-4" />,
  "Appraisal Form":            <ClipboardList className="w-4 h-4" />,
  "KPI (Tracking)":            <Gauge className="w-4 h-4" />,
  "SMART Goals (Tracking)":    <Target className="w-4 h-4" />,
  "Project OJS":               <Briefcase className="w-4 h-4" />,
  "Managerial Skill":          <Network className="w-4 h-4" />,
  "Management Interview":      <Users className="w-4 h-4" />,
  "Inter-Department Feedback": <MessageSquare className="w-4 h-4" />,
};

function ModuleCompletionOverview({
  companyUnit,
  module,
  onSelectModule,
  scopedUsers,
  workflows,
  year,
  motionKey,
}: {
  companyUnit: string;
  module: string;
  onSelectModule: (nextMod: string) => void;
  scopedUsers: ManagedUser[];
  workflows: WorkflowRecord[];
  year: string;
  motionKey: string;
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
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm pa-infographic-surface">
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
        <div key={`mod-grid-${motionKey}`} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map(({ mod, total, completed, inProgress, pending, rate }, cardIdx) => {
            const isActive = module === mod;
            const isDimmed = isFiltered && !isActive;
            const cPct = total > 0 ? (completed / total) * 100 : 0;
            const iPct = total > 0 ? (inProgress / total) * 100 : 0;
            const pPct = total > 0 ? (pending / total) * 100 : 0;

            const hasSlices = completed > 0 || inProgress > 0 || pending > 0;
            const pieData =
              hasSlices && (completed > 0 || inProgress > 0)
                ? [
                    { name: "Completed", value: completed, color: "#10B981" },
                    { name: "In Progress", value: inProgress, color: "#F59E0B" },
                    { name: "Not Started", value: pending, color: "#E5E7EB" },
                  ].filter((s) => s.value > 0)
                : [{ name: "Not Started", value: Math.max(total, 1), color: "#E5E7EB" }];

            return (
              <div
                key={mod}
                onClick={() => onSelectModule(isActive ? "All Modules" : mod)}
                style={{ animationDelay: `${cardIdx * 45}ms` }}
                className={`group cursor-pointer rounded-2xl border p-5 bg-white pa-card-motion ${
                  isActive
                    ? "border-[#1A284F]/40 ring-2 ring-[#1A284F]/15 shadow-md"
                    : isDimmed
                    ? "border-gray-100 opacity-45 hover:opacity-90"
                    : "border-gray-100 shadow-xs hover:shadow-md hover:border-gray-200"
                }`}
              >
                {/* Card top header */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100/90 text-[#1A284F] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:bg-[#1A284F]/10">
                    {MODULE_CARD_ICON[mod] ?? <Layers className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm text-gray-900 truncate leading-snug">
                      {MODULE_SHORT[mod]}
                    </h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {total} {total === 1 ? "employee" : "employees"} in scope
                    </p>
                  </div>
                </div>

                {/* Donut + Breakdown bars */}
                <div className="flex items-center gap-5 mt-4">
                  {/* Donut chart */}
                  <div className="relative w-24 h-24 shrink-0 pa-donut-hover">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={33}
                          outerRadius={44}
                          startAngle={90}
                          endAngle={-270}
                          stroke="none"
                          isAnimationActive={true}
                          animationDuration={850}
                          animationEasing="ease-out"
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={`slice-${mod}-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length || total === 0) return null;
                            const p = payload[0].payload as { name: string; value: number };
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-md text-[11px]">
                                <span className="font-semibold text-gray-800">{p.name}:</span>{" "}
                                <span className="font-bold text-[#1A284F]">{p.value}</span>{" "}
                                <span className="text-gray-400">({Math.round((p.value / total) * 100)}%)</span>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[15px] font-extrabold text-gray-900 tabular-nums leading-none">
                        {rate.toFixed(1)}%
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 mt-1">
                        COMPLETE
                      </span>
                    </div>
                  </div>

                  {/* 3 Status rows */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    {/* Completed */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          Completed
                        </span>
                        <span className="font-bold text-emerald-700 tabular-nums">{completed}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 pa-bar-animate"
                          style={{ width: `${cPct}%` }}
                        />
                      </div>
                    </div>

                    {/* In Progress */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="flex items-center gap-1.5 text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          In Progress
                        </span>
                        <span className="font-bold text-amber-600 tabular-nums">{inProgress}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 pa-bar-animate"
                          style={{ width: `${iPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Not Started */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                          Not Started
                        </span>
                        <span className="font-bold text-gray-600 tabular-nums">{pending}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gray-200 pa-bar-animate"
                          style={{ width: `${pPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Multi-Module Breakdown & Division Scores (Gambar 1 Left) ───────────────────
function MultiModuleDivisionSection({
  scopedUsers,
  employees,
  workflows,
  year,
  motionKey,
}: {
  scopedUsers: ManagedUser[];
  employees: Employee[];
  workflows: WorkflowRecord[];
  year: string;
  motionKey: string;
}) {
  const radarData = useMemo(() => {
    const radarModules: Array<{ key: string; label: string }> = [
      { key: "KPI (Setting)", label: "KPI Setting" },
      { key: "SMART Goals (Setting)", label: "SMART Goals" },
      { key: "Appraisal Form", label: "Appraisals" },
      { key: "KPI (Tracking)", label: "KPI Tracking" },
      { key: "SMART Goals (Tracking)", label: "SMART Track." },
      { key: "Project OJS", label: "Project OJS" },
    ];
    return radarModules.map(({ key, label }) => {
      const st = computeModuleStatsForUsers(scopedUsers, workflows, key, year);
      const pct = st.total > 0 ? Math.round((st.completed / st.total) * 1000) / 10 : 0;
      return {
        subject: label,
        fullLabel: MODULE_SHORT[key] ?? label,
        pct,
        completed: st.completed,
        total: st.total,
      };
    });
  }, [scopedUsers, workflows, year]);

  const divisionScoreData = useMemo(() => {
    const divMap = new Map<string, { totalSum: number; kpiSum: number; count: number }>();
    // Seed divisions from scopedUsers so divisions appear even when scores are 0
    for (const u of scopedUsers) {
      const div = (u.division || "Unassigned").trim();
      if (!divMap.has(div)) {
        divMap.set(div, { totalSum: 0, kpiSum: 0, count: 0 });
      }
    }
    for (const emp of employees) {
      const div = (emp.division || "Unassigned").trim();
      const cur = divMap.get(div) ?? { totalSum: 0, kpiSum: 0, count: 0 };
      cur.totalSum += emp.totalScore || 0;
      cur.kpiSum += emp.kpi?.score || 0;
      cur.count += 1;
      divMap.set(div, cur);
    }
    return Array.from(divMap.entries())
      .map(([divName, agg]) => {
        const cleanLabel = divName.replace(/^Divisi\s+/i, "");
        const shortDiv = cleanLabel.length > 14 ? `${cleanLabel.slice(0, 13)}…` : cleanLabel;
        return {
          division: divName,
          shortDiv,
          overall: agg.count > 0 ? Math.round((agg.totalSum / agg.count) * 10) / 10 : 0,
          kpi: agg.count > 0 ? Math.round((agg.kpiSum / agg.count) * 10) / 10 : 0,
          headcount: agg.count,
        };
      })
      .slice(0, 8);
  }, [scopedUsers, employees]);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col h-full pa-infographic-surface">
      <div className="flex items-start gap-3 pb-3.5 border-b border-gray-100 mb-4">
        <div className="w-9 h-9 rounded-xl bg-cyan-50 text-teal-600 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-gray-900 text-sm leading-snug">
            Multi-Module Breakdown &amp; Division Scores
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Completion health and average performance by division
          </p>
        </div>
      </div>

      <div key={`mm-${motionKey}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 items-stretch pa-card-motion">
        {/* Left: Hexagonal Module Completion Radar */}
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            MODULE COMPLETION
          </p>
          <div className="flex-1 min-h-[215px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="52%" outerRadius="68%" data={radarData}>
                <PolarGrid stroke="#CBD5E1" strokeOpacity={0.7} />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 9.5, fill: "#475569", fontWeight: 500 }}
                />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name="Completion"
                  dataKey="pct"
                  stroke="#0284C7"
                  strokeWidth={2}
                  fill="#0EA5E9"
                  fillOpacity={0.22}
                  dot={{ r: 3, fill: "#0284C7", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#0369A1" }}
                  isAnimationActive={true}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      fullLabel: string;
                      pct: number;
                      completed: number;
                      total: number;
                    };
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                        <p className="font-bold text-[#1A284F] mb-0.5">{d.fullLabel}</p>
                        <p className="text-gray-600">
                          Completed: <span className="font-bold text-sky-700">{d.pct}%</span> ({d.completed}/{d.total})
                        </p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Average Score by Division */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              AVERAGE SCORE BY DIVISION
            </p>
            <div className="flex items-center gap-2.5 text-[10px] text-gray-600 font-medium">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Overall
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                KPI
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-[215px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={
                  divisionScoreData.length > 0
                    ? divisionScoreData
                    : [{ division: "No Division", shortDiv: "—", overall: 0, kpi: 0, headcount: 0 }]
                }
                margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
                barGap={2}
                barSize={8}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9.5, fill: "#64748B" }}
                />
                <YAxis
                  type="category"
                  dataKey="shortDiv"
                  width={74}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9.5, fill: "#475569" }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      division: string;
                      overall: number;
                      kpi: number;
                      headcount: number;
                    };
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs">
                        <p className="font-bold text-gray-900 mb-1">{d.division}</p>
                        <p className="text-emerald-700 font-semibold">Overall Avg: {d.overall}%</p>
                        <p className="text-sky-700 font-semibold">KPI Avg: {d.kpi}%</p>
                        <p className="text-gray-400 text-[10px] mt-0.5">{d.headcount} employee(s)</p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="overall"
                  name="Overall"
                  fill="#10B981"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={true}
                  animationDuration={850}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="kpi"
                  name="KPI"
                  fill="#0EA5E9"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={true}
                  animationDuration={950}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Approval Tracking & Bottleneck (Gambar 1 Right) ────────────────────────────
function ApprovalTrackingBottleneckSection({
  scopedUsers,
  workflows,
  module,
  year,
  month,
  motionKey,
}: {
  scopedUsers: ManagedUser[];
  workflows: WorkflowRecord[];
  module: string;
  year: string;
  month: string;
  motionKey: string;
}) {
  const chainStats = useMemo(() => {
    const scopedIds = new Set(scopedUsers.map((u) => normalizeEmployeeId(u.employeeId)));
    const scopedRawIds = new Set(scopedUsers.map((u) => u.employeeId.toLowerCase()));

    const matchesSelectedModule = (w: WorkflowRecord): boolean => {
      if (module === "All Modules") return true;
      if (module === "KPI (Setting)") return w.module === "KPI" && w.phase === "setting";
      if (module === "KPI (Tracking)") return w.module === "KPI" && w.phase === "measurement";
      if (module === "SMART Goals (Setting)") return w.module === "SMART Goals" && w.phase === "setting";
      if (module === "SMART Goals (Tracking)") return w.module === "SMART Goals" && w.phase === "measurement";
      if (module === "Project OJS") return w.module === "Project";
      return w.module === module;
    };

    const relevant = workflows.filter(
      (w) =>
        w.year === year &&
        (scopedIds.has(w.employeeId) || scopedRawIds.has(w.employeeId.toLowerCase())) &&
        matchesSelectedModule(w) &&
        matchesMonthFilter(w.submittedDate, month),
    );

    const stages = [
      { stage: "Submitted", funnelLabel: "Submitted", completed: 0, waiting: 0, revision: 0 },
      { stage: "HR Unit Check", funnelLabel: "HR Unit Check", completed: 0, waiting: 0, revision: 0 },
      { stage: "Approval 1", funnelLabel: "Approval 1", completed: 0, waiting: 0, revision: 0 },
      { stage: "Approval 2", funnelLabel: "Approval 2", completed: 0, waiting: 0, revision: 0 },
      { stage: "HR ICF Validate", funnelLabel: "HR ICF Validate", completed: 0, waiting: 0, revision: 0 },
    ];

    for (const rec of relevant) {
      stages[0].completed += 1;

      const isFourStep = rec.module === "KPI" || rec.module === "SMART Goals" || rec.module === "RCA";
      const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(rec.employeeId);
      const chk = rec.decisions.checker?.status ?? "";
      const a1 = rec.decisions.approver1?.status ?? "";
      const a2 = rec.decisions.approver2?.status ?? "";
      const val = rec.decisions.validator?.status ?? "";

      const a1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
      const a2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
      const valDone = isFourStep ? val === "Validated" || a2 === "Validated" : a2Done;
      const chkDone = isFourStep
        ? Boolean(bypassCheck || a1Done || a2Done || valDone || (chk && chk !== "Revision"))
        : true;

      // HR Unit Check stage
      if (isFourStep) {
        if (chk === "Revision") {
          stages[1].revision += 1;
        } else if (chkDone) {
          stages[1].completed += 1;
        } else {
          stages[1].waiting += 1;
        }
      } else {
        stages[1].completed += 1;
      }

      // Approval 1 stage
      if (a1 === "Revision") {
        stages[2].revision += 1;
      } else if (a1Done) {
        stages[2].completed += 1;
      } else if (chkDone && chk !== "Revision") {
        stages[2].waiting += 1;
      }

      // Approval 2 stage
      if (a2 === "Revision") {
        stages[3].revision += 1;
      } else if (a2Done) {
        stages[3].completed += 1;
      } else if (a1Done && a1 !== "Revision") {
        stages[3].waiting += 1;
      }

      // HR ICF Validate stage
      if (isFourStep) {
        if (val === "Revision") {
          stages[4].revision += 1;
        } else if (valDone) {
          stages[4].completed += 1;
        } else if (a2Done && a2 !== "Revision") {
          stages[4].waiting += 1;
        }
      } else if (a2Done) {
        stages[4].completed += 1;
      }
    }

    const maxTotal = Math.max(4, ...stages.map((s) => s.completed + s.waiting + s.revision));
    return { totalSubmissions: relevant.length, stages, maxTotal };
  }, [scopedUsers, workflows, module, year, month]);

  const funnelClipPaths = [
    "polygon(0% 0%, 100% 0%, 91% 100%, 9% 100%)",
    "polygon(9% 0%, 91% 0%, 83% 100%, 17% 100%)",
    "polygon(17% 0%, 83% 0%, 76% 100%, 24% 100%)",
    "polygon(24% 0%, 76% 0%, 69% 100%, 31% 100%)",
    "polygon(31% 0%, 69% 0%, 63% 100%, 37% 100%)",
  ];
  const funnelColors = ["#0284C7", "#0369A1", "#0EA5E9", "#0284C7", "#0EA5E9"];

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col h-full pa-infographic-surface">
      <div className="flex items-start justify-between gap-2 pb-3.5 border-b border-gray-100 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <GitPullRequest className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-sm leading-snug">
              Approval Tracking &amp; Bottleneck
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Live progress across the full approval chain
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold whitespace-nowrap shrink-0">
          {chainStats.totalSubmissions} {chainStats.totalSubmissions === 1 ? "submission" : "submissions"}
        </span>
      </div>

      <div key={`ab-${motionKey}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 items-stretch pa-card-motion">
        {/* Left: 5-tier tapering Approval Funnel */}
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            APPROVAL FUNNEL
          </p>
          <div className="flex-1 flex flex-col justify-center gap-1.5 py-1">
            {chainStats.stages.map((st, idx) => (
              <div
                key={st.stage}
                style={{
                  clipPath: funnelClipPaths[idx],
                  background: funnelColors[idx],
                  animationDelay: `${idx * 65}ms`,
                }}
                title={`${st.stage} — Completed: ${st.completed} · Waiting: ${st.waiting} · Revision: ${st.revision}`}
                className="h-9 flex items-center justify-center px-3 text-white text-[10.5px] font-bold tracking-tight cursor-default select-none pa-funnel-tier"
              >
                <span className="truncate">
                  {st.funnelLabel} · {st.completed}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Stage Progress stacked horizontal bar */}
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            STAGE PROGRESS
          </p>
          <div className="flex-1 min-h-[195px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chainStats.stages}
                margin={{ top: 2, right: 8, left: -4, bottom: 0 }}
                barSize={12}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  domain={[0, chainStats.maxTotal]}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9.5, fill: "#64748B" }}
                />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={68}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9.5, fill: "#475569" }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as {
                      stage: string;
                      completed: number;
                      waiting: number;
                      revision: number;
                    };
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-lg text-xs space-y-0.5">
                        <p className="font-bold text-gray-900 mb-1">{d.stage}</p>
                        <p className="text-teal-700 font-semibold">Completed: {d.completed}</p>
                        <p className="text-amber-600 font-semibold">Waiting: {d.waiting}</p>
                        <p className="text-rose-600 font-semibold">Revision: {d.revision}</p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="completed"
                  stackId="a"
                  name="Completed"
                  fill="#0F766E"
                  radius={[0, 2, 2, 0]}
                  isAnimationActive={true}
                  animationDuration={800}
                />
                <Bar
                  dataKey="waiting"
                  stackId="a"
                  name="Waiting"
                  fill="#F59E0B"
                  radius={[0, 2, 2, 0]}
                  isAnimationActive={true}
                  animationDuration={900}
                />
                <Bar
                  dataKey="revision"
                  stackId="a"
                  name="Revision"
                  fill="#EF4444"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={true}
                  animationDuration={950}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-3.5 pt-2 text-[10px] text-gray-600 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-700 inline-block" />
              Completed
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Waiting
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Revision
            </span>
          </div>
        </div>
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
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 pa-infographic-surface">
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
  module: ["All Modules", "KPI (Setting)", "SMART Goals (Setting)", "Appraisal Form", "KPI (Tracking)", "SMART Goals (Tracking)", "Project OJS", "Managerial Skill", "Management Interview", "Inter-Department Feedback"],
  year: ["2026", "2025", "2024", "2023"],
  month: ["All Months", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

function FilterSelect({ label, options, value, onChange, highlight }: { label: string; options: string[]; value: string; onChange: (v: string) => void; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <label className={`text-[10px] font-semibold uppercase tracking-wider truncate ${highlight ? "text-[#1A284F]" : "text-gray-400"}`}>{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`w-full h-8 appearance-none bg-white border rounded-lg px-2.5 pr-7 text-xs font-medium focus:outline-none focus:ring-2 cursor-pointer transition-colors ${
            highlight && value !== options[0]
              ? "border-[#1A284F]/40 text-[#1A284F] ring-[#1A284F]/20 bg-[#1A284F]/5"
              : "border-gray-200 text-gray-800 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 hover:border-gray-300"
          }`}>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <ChevronDown className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 ${highlight && value !== options[0] ? "text-[#1A284F]" : "text-gray-400"}`} />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function AnalyticsDashboard({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const { t } = useLanguage();
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const effectiveLockedUnits = lockedUnits ?? authLockedUnits;
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [companyUnit, setCompanyUnit] = useState("All Units");
  const [division, setDivision] = useState("All Divisions");
  const [department, setDepartment] = useState("All Departments");
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
  const allManagedActiveUsers = useMemo(() => {
    const all = loadManagedUsers().filter((u) => u.status === "Active" && !isExcludedFromAppraisalCalibration(u));
    return effectiveLockedUnits ? all.filter((u) => effectiveLockedUnits.includes(u.company)) : all;
  }, [effectiveLockedUnits, tick]);

  const divisionOptions = useMemo(() => {
    const pool = companyUnit === "All Units"
      ? allManagedActiveUsers
      : allManagedActiveUsers.filter((u) => u.company === companyUnit);
    const divs = Array.from(new Set(pool.map((u) => (u.division || "").trim()).filter(Boolean))).sort();
    return ["All Divisions", ...divs];
  }, [allManagedActiveUsers, companyUnit]);

  const departmentOptions = useMemo(() => {
    const pool = allManagedActiveUsers.filter(
      (u) =>
        (companyUnit === "All Units" || u.company === companyUnit) &&
        (division === "All Divisions" || u.division === division),
    );
    const depts = Array.from(new Set(pool.map((u) => (u.department || "").trim()).filter(Boolean))).sort();
    return ["All Departments", ...depts];
  }, [allManagedActiveUsers, companyUnit, division]);

  const filteredEmployees = useMemo(
    () => {
      const unitEmployees = effectiveLockedUnits
        ? liveEmployees.filter(e => effectiveLockedUnits.includes(e.companyUnit))
        : liveEmployees;
      return unitEmployees.filter(
        (e) =>
          (companyUnit === "All Units" || e.companyUnit === companyUnit) &&
          (division === "All Divisions" || e.division === division) &&
          (department === "All Departments" || e.department === department),
      );
    },
    [companyUnit, division, department, effectiveLockedUnits, liveEmployees],
  );

  const scopedUsers = useMemo(() => {
    return allManagedActiveUsers.filter(
      (u) =>
        (companyUnit === "All Units" || u.company === companyUnit) &&
        (division === "All Divisions" || u.division === division) &&
        (department === "All Departments" || u.department === department),
    );
  }, [allManagedActiveUsers, companyUnit, division, department]);

  const workflows = useMemo(
    () => loadWorkflowRecords().filter((w) => matchesMonthFilter(w.submittedDate, month)),
    [month, tick],
  );

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

    let projectByEmpAll: Record<string, { rows?: unknown[] }> = {};
    try {
      projectByEmpAll = JSON.parse(localStorage.getItem("pa_project_icf_by_emp_v1") ?? "{}");
    } catch {
      projectByEmpAll = {};
    }

    for (const u of scopedUsers) {
      const normId = normalizeEmployeeId(u.employeeId);
      const allowed = resolveUserAllowedModules(u);
      const userRecs = workflows.filter(
        (w) => w.year === year && (w.employeeId === normId || w.employeeId.toLowerCase() === u.employeeId.toLowerCase()),
      );
      const evalKpi = evaluateEmployeeKPITracking(u.employeeId);
      const prj = projectByEmpAll[normId] ?? projectByEmpAll[u.employeeId];
      const hasPrjRows = Boolean(prj && Array.isArray(prj.rows) && prj.rows.length > 0);

      const isTwoStepDone = (modName: string) => {
        const rec = userRecs.find((r) => r.module === modName && r.phase === "measurement");
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
      const wfKpiMeas = userRecs.find((r) => r.module === "KPI" && r.phase === "measurement");
      const kpiDone = Boolean(
        evalKpi.isFullYearMonthsComplete &&
          wfKpiMeas &&
          (wfKpiMeas.decisions.validator?.status === "Validated" ||
            wfKpiMeas.decisions.approver2?.status === "Validated"),
      );
      const wfSgMeas = userRecs.find((r) => r.module === "SMART Goals" && r.phase === "measurement");
      const sgDone = Boolean(
        wfSgMeas &&
          (wfSgMeas.decisions.validator?.status === "Validated" ||
            wfSgMeas.decisions.approver2?.status === "Validated"),
      );

      const allRequiredDone =
        (!allowed.includes("KPI (Setting/Measurement)") || kpiDone) &&
        (!allowed.includes("SMART Goals (Setting/Measurement)") || sgDone) &&
        (!allowed.includes("Appraisals Form") || isTwoStepDone("Appraisal Form")) &&
        (!allowed.includes("Project Outside Job Scope") || isTwoStepDone("Project")) &&
        (!allowed.includes("Managerial Skill") || isTwoStepDone("Managerial Skill"));

      if (allRequiredDone) {
        completed++;
      } else if (userRecs.length > 0 || evalKpi.hasAnyTrackingData || hasPrjRows) {
        inProgress++;
      } else {
        pending++;
      }
    }

    return { total, completed, inProgress, pending, rate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0" };
  }, [module, scopedUsers, workflows, year]);

  const hasActiveFilters =
    companyUnit !== "All Units" ||
    division !== "All Divisions" ||
    department !== "All Departments" ||
    module !== "All Modules" ||
    year !== "2026" ||
    month !== "All Months";

  const refreshMotionKey = `${companyUnit}|${division}|${department}|${module}|${year}|${month}|${tick}`;

  return (
    <div className="w-full flex flex-col gap-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-0.5">{t("Analytics Dashboard")}</h2>
          <p className="text-sm text-gray-500">{t("Track completion status and export final appraisal scores")}</p>
        </div>
      </div>

      {/* ── Slim Sticky Filter Bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="grid gap-2.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end">
          <FilterSelect
            label={t("Company Unit")}
            options={effectiveLockedUnits ? ["All Units", ...effectiveLockedUnits] : filterOptions.companyUnit}
            value={companyUnit}
            onChange={(val) => {
              setCompanyUnit(val);
              setDivision("All Divisions");
              setDepartment("All Departments");
            }}
          />
          <FilterSelect
            label="Division"
            options={divisionOptions}
            value={division}
            onChange={(val) => {
              setDivision(val);
              setDepartment("All Departments");
            }}
          />
          <FilterSelect
            label="Department"
            options={departmentOptions}
            value={department}
            onChange={setDepartment}
          />
          <FilterSelect label={t("Module")}       options={filterOptions.module}       value={module}       onChange={setModule} highlight />
          <FilterSelect label={t("Year")}         options={filterOptions.year}         value={year}         onChange={setYear} />
          <FilterSelect label={t("Month")}        options={filterOptions.month}        value={month}        onChange={setMonth} />
        </div>
        {(hasActiveFilters || (module !== "All Modules" && activeTimelineInfo)) && (
          <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-gray-100 flex-wrap">
            {module !== "All Modules" && activeTimelineInfo ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">Module PA Status:</span>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: PHASE_META[activeTimelineInfo.phase].bg, color: PHASE_META[activeTimelineInfo.phase].color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: PHASE_META[activeTimelineInfo.phase].dot }} />
                  {PHASE_META[activeTimelineInfo.phase].label}
                </span>
              </div>
            ) : <div />}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setCompanyUnit("All Units");
                  setDivision("All Divisions");
                  setDepartment("All Departments");
                  setModule("All Modules");
                  setYear("2026");
                  setMonth("All Months");
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700"
              >
                <RotateCcw className="w-3 h-3" /> Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stat Cards (Urutan Pertama) ────────────────────────────────────── */}
      <div key={`stats-${refreshMotionKey}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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

      {/* ── Score / Grade Distribution (Urutan Kedua dibawah Card Total Employees dst.) ── */}
      <ScoreGradeDistributionDashboard
        key={`sgd-${refreshMotionKey}`}
        employees={filteredEmployees}
        calibrationTargets={calibrationTargets}
        module={module}
      />

      {/* ── 2. Module Completion Overview (9 Pie/Donut Cards — 3 per Line) ── */}
      <ModuleCompletionOverview
        companyUnit={companyUnit}
        module={module}
        onSelectModule={setModule}
        scopedUsers={scopedUsers}
        workflows={workflows}
        year={year}
        motionKey={refreshMotionKey}
      />

      {/* ── 3. One-Line Row: PA Cycle Timeline | Multi-Module & Division | Approval Tracking & Bottleneck ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
        {/* 3A. PA Cycle Timeline */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex flex-col h-full pa-infographic-surface">
          <button
            type="button"
            onClick={() => setTimelineCollapsed((c) => !c)}
            className={`w-full flex items-start gap-3 text-left transition-all ${timelineCollapsed ? "" : "pb-3.5 border-b border-gray-100 mb-4"}`}
          >
            <div className="w-9 h-9 rounded-xl bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F] shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm leading-snug">PA Cycle Timeline</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                {module !== "All Modules" && activeTimelineInfo
                  ? `Showing: ${module} — ${PHASE_META[activeTimelineInfo.phase].label}`
                  : "Jadwal appraisal mengikuti SK Penilaian Kinerja yang sudah di tetapkan di masing-masing Unit Usaha."}
              </p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors shrink-0">
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${timelineCollapsed ? "-rotate-90" : "rotate-0"}`} />
            </div>
          </button>

          {!timelineCollapsed && (
            <div key={`tl-${refreshMotionKey}`} className="overflow-x-auto flex-1 flex flex-col justify-between pa-card-motion">
              <div className="min-w-[460px]">
                {/* Year band */}
                <div className="flex ml-28 mb-0">
                  <div className="text-center text-[9px] font-semibold text-gray-400 pb-0.5 border-b border-gray-200" style={{ flex: 12 }}>
                    {year}
                  </div>
                  <div className="text-center text-[9px] font-semibold pb-0.5 border-b border-[#1A284F]/30" style={{ flex: 2, color: "#1A284F99" }}>
                    {Number(year) + 1}
                  </div>
                </div>

                {/* Month headers */}
                <div className="flex mb-1 ml-28">
                  {MONTHS.map((m, i) => (
                    <div
                      key={i}
                      className={`flex-1 text-center text-[9px] font-semibold pb-1 ${
                        i === todayMonthSlot ? "text-[#1A284F] font-black" : i >= 12 ? "text-[#1A284F]/50" : "text-gray-400"
                      }`}
                    >
                      {m}
                    </div>
                  ))}
                </div>

                <div className="relative pt-5">
                  {/* Column shading */}
                  <div className="absolute inset-0 ml-28 flex pointer-events-none">
                    {MONTHS.map((_, i) => (
                      <div key={i} className={`flex-1 ${i % 2 === 0 ? "bg-gray-50/50" : ""} ${i === todayMonthSlot ? "bg-blue-50/50" : ""} ${i >= 12 ? "bg-indigo-50/20" : ""}`} />
                    ))}
                  </div>

                  {/* Today marker */}
                  <div
                    className="absolute top-0 bottom-0 pointer-events-none z-10"
                    style={{ left: `calc(7rem + (100% - 7rem) * ${((todayMonthSlot + 0.5) / TOTAL_MONTHS).toFixed(4)})` }}
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
                      <div className="bg-[#1A284F] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-sm flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                        {todayLabel}
                      </div>
                    </div>
                    <div className="absolute top-4 bottom-0 left-1/2 -translate-x-1/2 w-px bg-[#1A284F]/50" />
                  </div>

                  {/* Timeline rows */}
                  {liveTimelineRows.map((row, ri) => {
                    const isActiveRow = activeTimelineInfo?.rowIndex === ri;
                    const isInactiveRow = activeTimelineInfo !== null && !isActiveRow;
                    const dotColor = PHASE_META[row.status].dot;

                    return (
                      <div
                        key={row.id}
                        className={`flex items-center mb-1.5 rounded-lg transition-all duration-300 ${
                          isInactiveRow ? "opacity-25" : ""
                        } ${isActiveRow ? "-mx-1.5 px-1.5 py-0.5 border" : ""}`}
                        style={isActiveRow ? {
                          background: `${PHASE_META[activeTimelineInfo!.phase].bg}60`,
                          borderColor: `${PHASE_META[activeTimelineInfo!.phase].dot}99`,
                        } : undefined}
                      >
                        <div className="w-28 shrink-0 pr-2 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-xs shrink-0" style={{ background: dotColor }} />
                          <span className="text-[10.5px] font-medium text-gray-700 leading-tight truncate" title={row.label}>
                            {row.label}
                          </span>
                        </div>

                        <div className="flex-1 relative flex h-6">
                          {MONTHS.map((_, mi) => (
                            <div key={mi} className="flex-1 h-6 relative" />
                          ))}
                          {row.segments.map((s, si) => {
                            const leftPct = (s.start / TOTAL_MONTHS) * 100;
                            const widthPct = ((s.end - s.start + 1) / TOTAL_MONTHS) * 100;
                            return (
                              <div
                                key={si}
                                className="absolute inset-y-1 rounded pa-bar-animate hover:brightness-110 flex items-center justify-center px-1.5 overflow-hidden cursor-default"
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  background: s.color,
                                  opacity: 0.9,
                                }}
                                title={`${row.label}: ${s.phase}`}
                              >
                                <span className="text-[8.5px] font-bold text-white whitespace-nowrap truncate">
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
                <div className="flex items-center gap-3.5 mt-3 pt-2 border-t border-gray-100 text-[9.5px] text-gray-500 flex-wrap">
                  {[
                    { label: "Done", color: "#10b981" },
                    { label: "In Progress", color: "#f97316" },
                    { label: "Not Started", color: "#9ca3af" },
                  ].map((p) => (
                    <span key={p.label} className="flex items-center gap-1">
                      <span className="w-4 h-2 rounded-xs" style={{ background: p.color, opacity: 0.85 }} />
                      {p.label}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 ml-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    Today ({todayLabel})
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3B. Multi-Module Breakdown & Division Scores */}
        <MultiModuleDivisionSection
          scopedUsers={scopedUsers}
          employees={filteredEmployees}
          workflows={workflows}
          year={year}
          motionKey={refreshMotionKey}
        />

        {/* 3C. Approval Tracking & Bottleneck */}
        <ApprovalTrackingBottleneckSection
          scopedUsers={scopedUsers}
          workflows={workflows}
          module={module}
          year={year}
          month={month}
          motionKey={refreshMotionKey}
        />
      </div>


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
