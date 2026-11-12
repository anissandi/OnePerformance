import React, { useState, useMemo, useEffect } from "react";
import { KPI_ITEMS, computeKPIAchievement, parseBobotDecimal, loadKPITracking } from "../employee/KPIPage";
import {
  TrendingUp, Lightbulb, ClipboardList, FolderKanban,
  CheckCircle2, Clock, X, Target, ArrowRight, ChevronDown, ChevronUp, Sparkles, ClipboardCheck,
} from "lucide-react";
import { useNavigate } from "react-router";
import { getLiveUserModuleApprovals } from "../shared/appraisalWorkflowStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { buildLiveCycleStepsFromActivation } from "../hr/ModuleActivation";
import { getActiveUser } from "../../store/authStore";
import { SCORE_WEIGHT_EVENT } from "../shared/scoringWeightStore";
import { ACCESS_UPDATED_EVENT } from "../hr/settings/AccessManagement";
import { DashboardNotificationSection } from "../../components/DashboardNotificationSection";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = "Not Started" | "Submitted" | "On Progress" | "Done";
type ApprovalStepStatus = "completed" | "in_progress" | "pending";

interface ApprovalStep {
  label: string;
  description: string;
  status: ApprovalStepStatus;
}

interface ModuleApprovalData {
  module: string;
  overallStatus: "Approved" | "Pending" | "In Progress";
  steps: ApprovalStep[];
}

const CYCLE_STEP_STYLE: Record<string, string> = {
  "Completed":   "bg-green-500 text-white",
  "On Progress": "bg-[#EEDDBB] text-[#1A284F]",
  "Not Started": "bg-gray-100 text-gray-400",
};

const CYCLE_LABEL_STYLE: Record<string, string> = {
  "Completed":   "text-green-600",
  "On Progress": "text-[#1A284F] font-bold",
  "Not Started": "text-gray-400",
};

// ─── Appraisal Summary ────────────────────────────────────────────────────────

const MODULE_APPROVALS: ModuleApprovalData[] = new Proxy([] as ModuleApprovalData[], {
  get(_target, prop, receiver) {
    const list = getLiveUserModuleApprovals(false);
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

const MY_APPRAISAL_SUMMARY = new Proxy(
  {
    currentScore: 0,
    currentGrade: "—",
    modulesApproved: 0,
    modulesTotal: 6,
    lastUpdated: "—",
    yearEnd: "Dec 2026",
    status: "In Progress" as const,
  },
  {
    get(_target, prop: string) {
      const mods = getLiveUserModuleApprovals(false);
      const activeUser = getActiveUser();
      const emps = getLiveTransactionalEmployees();
      const me = emps.find((e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase()) ?? emps[0];
      const summary = {
        currentScore: me?.totalScore ?? 0,
        currentGrade: me?.grade && me.grade !== "N/A" ? me.grade : "—",
        modulesApproved: mods.filter((m) => m.overallStatus === "Approved").length,
        modulesTotal: mods.length,
        lastUpdated: me?.approvalCompleteDate ?? "—",
        yearEnd: "Dec 2026",
        status: (mods.every((m) => m.overallStatus === "Approved") ? "Done" : "In Progress") as "In Progress",
      };
      return summary[prop as keyof typeof summary];
    },
  },
);

// ─── Milestone helpers (derived from MODULE_APPROVALS) ────────────────────────

const MODULE_MILESTONE_ICONS: Record<string, React.ElementType> = {
  "KPI (Setting)":          TrendingUp,
  "SMART Goals (Setting)":  Lightbulb,
  "KPI (Tracking)":         TrendingUp,
  "SMART Goals (Tracking)": Lightbulb,
  "Appraisal Form":         ClipboardList,
  "Project OJS":            FolderKanban,
};

const MODULE_ROUTES: Record<string, string> = {
  "KPI (Setting)":          "/employee/setting/kpi",
  "SMART Goals (Setting)":  "/employee/setting/smart-goals",
  "KPI (Tracking)":         "/employee/measurement/kpi-tracking",
  "SMART Goals (Tracking)": "/employee/measurement/smart-goals",
  "Appraisal Form":         "/employee/measurement/appraisal-form",
  "Project OJS":            "/employee/measurement/project-outside",
};

function approvalToMilestoneStatus(mod: ModuleApprovalData): ApprovalStatus {
  if (mod.overallStatus === "Approved") return "Done";
  if (mod.overallStatus === "Pending")  return "Not Started";
  const firstPendingIdx = mod.steps.findIndex(s => s.status === "in_progress");
  return firstPendingIdx === 0 ? "Submitted" : "On Progress";
}

function stepFillPct(mod: ModuleApprovalData): number {
  if (mod.overallStatus === "Approved") return 100;
  if (mod.overallStatus === "Pending")  return 0;
  const completed = mod.steps.filter(s => s.status === "completed").length;
  const total     = mod.steps.length;
  const inProg    = mod.steps.findIndex(s => s.status === "in_progress");
  // Add half a step for the in-progress step to show movement
  return Math.round(((completed + (inProg >= 0 ? 0.4 : 0)) / total) * 100);
}

// ─── Status Styles ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ApprovalStatus, { node: string; badge: string; label: string; line: string }> = {
  "Done":        { node: "bg-green-500 shadow-green-200", badge: "bg-green-50 text-green-700 border-green-200",  label: "text-green-700", line: "bg-green-400" },
  "On Progress": { node: "bg-amber-500 shadow-amber-200", badge: "bg-amber-50 text-amber-700 border-amber-200",  label: "text-amber-700", line: "bg-amber-400" },
  "Submitted":   { node: "bg-blue-500 shadow-blue-200",   badge: "bg-blue-50 text-blue-700 border-blue-200",     label: "text-blue-700",  line: "bg-blue-400"  },
  "Not Started": { node: "bg-gray-300 shadow-gray-100",   badge: "bg-gray-50 text-gray-500 border-gray-200",     label: "text-gray-400",  line: "bg-gray-200"  },
};

const STAGE_ORDER: ApprovalStatus[] = ["Not Started", "Submitted", "On Progress", "Done"];

const STAGE_BAR_COLOR: Record<ApprovalStatus, string> = {
  "Not Started": "bg-gray-200",
  "Submitted":   "bg-blue-500",
  "On Progress": "bg-amber-400",
  "Done":        "bg-green-500",
};

const STAGE_TEXT_COLOR: Record<ApprovalStatus, string> = {
  "Not Started": "text-gray-400",
  "Submitted":   "text-blue-600",
  "On Progress": "text-amber-600",
  "Done":        "text-green-600",
};

// ─── CurrentCycleBanner ───────────────────────────────────────────────────────

function CurrentCycleBanner() {
  const [cycleSteps, setCycleSteps] = useState(() => buildLiveCycleStepsFromActivation("2026"));
  useEffect(() => {
    const refresh = () => setCycleSteps(buildLiveCycleStepsFromActivation("2026"));
    window.addEventListener("pa-module-activation-updated", refresh);
    window.addEventListener("feedback-activation-changed", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener("pa-module-activation-updated", refresh);
      window.removeEventListener("feedback-activation-changed", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);
  const activeStep = cycleSteps.find((s) => s.status === "On Progress") ?? cycleSteps[0];
  const phaseLabel = activeStep ? `${activeStep.label}` : "On Progress";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-8 py-6 flex flex-col gap-5">
      {/* Row 1 — cycle name */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#1A284F]" />
          <span className="text-sm font-bold text-[#1A284F] uppercase tracking-widest">
            2026 Performance Appraisal
          </span>
        </div>
        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 whitespace-nowrap">
          {phaseLabel}
        </span>
      </div>

      {/* Row 2 — steps in a single line */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        {cycleSteps.map((step, i) => (
          <React.Fragment key={step.label}>
            {i > 0 && (
              <div className={`h-0.5 flex-1 min-w-[24px] rounded-full ${step.status === "Not Started" ? "bg-gray-200" : "bg-green-400"}`} />
            )}
            <div className="flex items-center gap-3 shrink-0">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${CYCLE_STEP_STYLE[step.status]}`}>
                {step.status === "Completed" ? "✓" : i + 1}
              </div>
              <div className="flex flex-col leading-none gap-0.5">
                <span className={`text-sm font-semibold whitespace-nowrap ${CYCLE_LABEL_STYLE[step.status]}`}>{step.label}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">{step.date}</span>
                <span className="text-[10px] text-gray-400 whitespace-nowrap">{step.dateRange}</span>
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── ModuleApprovalPopup ──────────────────────────────────────────────────────

function ModuleApprovalPopup({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const mod = MODULE_APPROVALS[selected];

  // When overallStatus is "Approved", treat every step as completed
  const effectiveSteps: ApprovalStep[] = mod.overallStatus === "Approved"
    ? mod.steps.map((s) => ({ ...s, status: "completed" as ApprovalStepStatus }))
    : mod.steps;

  const statusBadgeClass = (s: ModuleApprovalData["overallStatus"]) => {
    if (s === "Approved")    return "bg-green-100 text-green-700 border-green-200";
    if (s === "In Progress") return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-gray-100 text-gray-500 border-gray-200";
  };

  const stepCircle = (status: ApprovalStepStatus, index: number) => {
    if (status === "completed")
      return (
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-white" />
        </div>
      );
    if (status === "in_progress")
      return (
        <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center shrink-0 text-white text-xs font-bold">
          {index + 1}
        </div>
      );
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 text-gray-400 text-xs font-bold">
        {index + 1}
      </div>
    );
  };

  const stepRowClass = (status: ApprovalStepStatus) => {
    if (status === "completed")   return "bg-green-50 border border-green-100";
    if (status === "in_progress") return "bg-yellow-50 border border-yellow-200";
    return "bg-white border border-gray-100";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                mod.overallStatus === "Approved"    ? "text-green-600"   :
                mod.overallStatus === "In Progress" ? "text-orange-500"  : "text-gray-400"
              }`}>
                {mod.overallStatus === "Approved"    ? "Approved"         :
                 mod.overallStatus === "In Progress" ? "Pending Approval" : "Not Started"}
              </span>
              <h3 className="text-lg font-bold text-gray-900 mt-0.5">{mod.module}</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Module tabs */}
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {MODULE_APPROVALS.map((m, i) => (
              <button
                key={m.module}
                onClick={() => setSelected(i)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  selected === i
                    ? "bg-[#1A284F] text-white border-[#1A284F]"
                    : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300"
                }`}
              >
                {m.module}
              </button>
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 flex flex-col gap-2">
          {effectiveSteps.map((step, i) => (
            <div key={step.label} className="relative">
              {/* Connector line */}
              {i < effectiveSteps.length - 1 && (
                <div className="absolute left-4 top-8 w-px h-[calc(100%+8px)] bg-gray-200 z-0" />
              )}
              <div className={`relative z-10 flex items-start gap-3 rounded-xl px-3 py-3 ${stepRowClass(step.status)}`}>
                {stepCircle(step.status, i)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-gray-800">{step.label}</span>
                    {step.status === "in_progress" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800 border border-yellow-300 shrink-0">
                        In Progress
                      </span>
                    )}
                    {step.status === "completed" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{step.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer summary */}
        <div className="px-5 pb-5">
          <div className={`text-[11px] font-semibold text-center py-2 rounded-lg border ${statusBadgeClass(mod.overallStatus)}`}>
            {mod.overallStatus === "Approved"
              ? "All steps completed — Module Approved"
              : mod.overallStatus === "In Progress"
              ? `Pending: ${mod.steps.find(s => s.status === "in_progress")?.label ?? "Approval"}`
              : "Not Started — module not yet submitted"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AppraisalSummaryCards ────────────────────────────────────────────────────

function scoreToGrade(s: number) {
  if (s >= 90) return "A+"; if (s >= 80) return "A"; if (s >= 70) return "B";
  if (s >= 60) return "C"; if (s >= 50) return "D"; return "E";
}

function AppraisalSummaryCards() {
  const [showPopup, setShowPopup] = useState(false);
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const onRefresh = () => setTick((v) => v + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener(SCORE_WEIGHT_EVENT, onRefresh);
    window.addEventListener(ACCESS_UPDATED_EVENT, onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  const liveKPI = useMemo(() => {
    const { months, cellsMap } = loadKPITracking();
    const total = KPI_ITEMS.reduce((sum, k) => {
      const ach = computeKPIAchievement(k, cellsMap, months);
      if (ach === null) return sum;
      return sum + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
    }, 0);
    return total > 0 ? parseFloat(total.toFixed(1)) : null;
  }, [tick]);

  const activeUser = getActiveUser();
  const emps = getLiveTransactionalEmployees();
  const me = emps.find((e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase());
  const baseScore = me?.totalScore ?? 0;
  const currentScore = baseScore > 0 ? baseScore : liveKPI ? parseFloat((liveKPI * 0.5).toFixed(1)) : 0;
  const currentGrade = currentScore > 0 ? scoreToGrade(currentScore) : "—";
  const modulesApproved = MODULE_APPROVALS.filter(m => m.overallStatus === "Approved").length;
  const modulesTotal = MODULE_APPROVALS.length;
  const s = { ...MY_APPRAISAL_SUMMARY, currentScore, currentGrade, modulesApproved, modulesTotal };
  const pending = s.modulesTotal - s.modulesApproved;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Current Score */}
        <button
          onClick={() => navigate("/employee/appraisal")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] cursor-pointer shadow-sm"
        >
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#1E3A6E]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Current Score</span>
              <span className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5 block">{s.currentScore}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#1E3A6E] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <span className="text-[11px] text-gray-500 font-medium">Appraisal 2026</span>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#1E3A6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>

        {/* Current Grade */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#E6F4EE] via-[#F4FAF7] to-white border border-[#D3EBE1] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#2D6A5B]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Current Grade</span>
              <span className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5 block">{s.currentGrade}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#2D6A5B] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <span className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
              <Clock className="w-3 h-3 text-[#2D6A5B]" />
              {s.status}
            </span>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#2D6A5B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Modules Approved */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#ECEFF8] via-[#F7F8FC] to-white border border-[#DDE2F0] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#142546]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Modules Approved</span>
              <div className="flex items-baseline gap-0.5 leading-tight mt-0.5">
                <span className="text-2xl font-extrabold text-[#111827]">{s.modulesApproved}</span>
                <span className="text-lg font-bold text-gray-400">/{s.modulesTotal}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#142546] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <button
              onClick={() => setShowPopup(true)}
              className="text-[11px] text-[#142546] font-medium text-left hover:underline"
            >
              {pending} pending — Details
            </button>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#142546" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Last Updated */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#FBECE5] via-[#FDF7F4] to-white border border-[#F2DCD2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#A85D43]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Last Updated</span>
              <span className="text-xl font-extrabold text-[#111827] leading-tight mt-0.5 block">{s.lastUpdated}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#A85D43] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <span className="text-[11px] text-gray-500 font-medium">Year-end: {s.yearEnd}</span>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#A85D43" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {showPopup && <ModuleApprovalPopup onClose={() => setShowPopup(false)} />}
    </>
  );
}

// ─── MilestoneProgress ────────────────────────────────────────────────────────

function MilestoneProgress() {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      {/* Header */}
      <div className={`flex items-center justify-between gap-3 ${isCollapsed ? "" : "mb-6"}`}>
        <div>
          <h3 className="font-semibold text-base text-gray-900">Approval Progress by Module</h3>
          <p className="text-xs text-gray-400 mt-0.5">Current cycle — 2026 Performance Appraisal</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-600 transition-colors"
          title={isCollapsed ? "Expand Approval Progress by Module" : "Collapse Approval Progress by Module"}
        >
          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <>
      {/* Module rows — derived directly from MODULE_APPROVALS */}
      <div className="flex flex-col gap-4">
        {MODULE_APPROVALS.map((mod) => {
          const Icon     = MODULE_MILESTONE_ICONS[mod.module] ?? ClipboardList;
          const status   = approvalToMilestoneStatus(mod);
          const fillPct  = stepFillPct(mod);
          const pending  = mod.steps.find(s => s.status === "in_progress");

          return (
            <div key={mod.module} className="flex flex-col gap-1.5">
              {/* Row header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${STATUS_STYLE[status].badge}`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{mod.module}</span>
                </div>
                <div className="flex items-center gap-2">
                  {pending && (
                    <span className="text-[10px] text-gray-400 font-medium">
                      Pending: <span className="font-semibold text-gray-600">{pending.label}</span>
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold ${STAGE_TEXT_COLOR[status]}`}>{status}</span>
                  <button
                    onClick={() => navigate(MODULE_ROUTES[mod.module] ?? "/employee/measurement")}
                    className="text-[10px] font-semibold text-[#1A284F] hover:underline flex items-center gap-0.5"
                  >
                    View <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Progress bar — fills based on completed steps / total steps */}
              <div className="relative h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${STAGE_BAR_COLOR[status]}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>

              {/* Step labels below bar */}
              <div className="flex justify-between mt-0.5">
                {mod.steps.map((step) => {
                  const isDone = step.status === "completed";
                  const isCur  = step.status === "in_progress";
                  return (
                    <span
                      key={step.label}
                      className={`text-[9px] font-semibold ${
                        isCur  ? STAGE_TEXT_COLOR["On Progress"] :
                        isDone ? "text-gray-400" :
                        "text-gray-300"
                      }`}
                    >
                      {step.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap mt-5 pt-4 border-t border-gray-100">
        {STAGE_ORDER.map((stage) => (
          <span key={stage} className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${STAGE_TEXT_COLOR[stage]}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${STAGE_BAR_COLOR[stage]} shrink-0`} />
            {stage}
          </span>
        ))}
      </div>
        </>
      )}
    </div>
  );
}

// ─── StaffDashboard ───────────────────────────────────────────────────────────

export function StaffDashboard() {
  return (
    <div className="flex flex-col gap-8">
      <CurrentCycleBanner />

      <AppraisalSummaryCards />

      <DashboardNotificationSection />

      <MilestoneProgress />
    </div>
  );
}
