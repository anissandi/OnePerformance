// @refresh reset
import React, { useState, useMemo, useEffect } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import { ArrowRight, TrendingUp, Lightbulb, ClipboardList, FolderKanban, Target, Clock, CheckCircle2, Search, AlertTriangle, LayoutDashboard, ClipboardCheck, Star, X, Briefcase, Users, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router";
import {
  getActiveUser,
  getAllowedApprovalTypesForUser,
  getAuthorizedSubordinates,
  isAdminOrHrIcfRole,
  resolveReviewerRoleForTarget,
  resolveWorkflowStageForTarget,
  shouldBypassCheckerForSubmission,
  useAuthStore,
} from "../../store/authStore";
import { getLiveUserModuleApprovals, loadWorkflowRecords, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { buildLiveCycleStepsFromActivation } from "../hr/ModuleActivation";
import { projectApprovalRows } from "../../store/projectStore";
import { feedbackApprovalRows } from "../shared/interDepartmentFeedbackStore";
import { SCORE_WEIGHT_EVENT } from "../shared/scoringWeightStore";
import { ACCESS_UPDATED_EVENT, useAccessManagement } from "../hr/settings/AccessManagement";
import { isMenuVisibleInMenuManagement, MENU_UPDATED_EVENT } from "../hr/settings/MenuManagement";
import { useLocation } from "react-router";
import { DashboardNotificationSection } from "../../components/DashboardNotificationSection";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module =
  | "KPI"
  | "SMART Goals"
  | "Appraisal Form"
  | "Project"
  | "Managerial Skill"
  | "Inter-Department Feedback"
  | "RCA";
type ActionType = "Approve" | "Complete Assessment" | "Review & Validate";

interface PendingItem {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  unit: string;
  division: string;
  module: Module;
  phase?: "setting" | "measurement";
  submissionType: string;
  actionNeeded: ActionType;
  submittedDate: string;
  notes: string;
  urgent: boolean;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const MODULE_META: Record<Module, { icon: React.ElementType; color: string; bg: string; border: string; hex: string }> = {
  "KPI":                       { icon: TrendingUp,    color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200",   hex: "#1A284F" },
  "SMART Goals":               { icon: Lightbulb,     color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200",  hex: "#d97706" },
  "Appraisal Form":            { icon: ClipboardList, color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200",  hex: "#15803d" },
  "Project":                   { icon: FolderKanban,  color: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-200",   hex: "#0f766e" },
  "Managerial Skill":          { icon: Briefcase,     color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200", hex: "#7e22ce" },
  "Inter-Department Feedback": { icon: Users,         color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", hex: "#4f46e5" },
  "RCA":                       { icon: Target,        color: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200",   hex: "#be123c" },
};

const ACTION_STYLE: Record<ActionType, string> = {
  "Approve":             "bg-[#1A284F] hover:bg-[#131d3b] text-white",
  "Complete Assessment": "bg-green-700 hover:bg-green-800 text-white",
  "Review & Validate":   "bg-amber-600 hover:bg-amber-700 text-white",
};

type TabFilter = "All" | Module;

// ─── Approval Dashboard ───────────────────────────────────────────────────────

function formatDate(iso: string) {
  return normalizeDateDDMMYYYY(iso);
}

// Map module → Approvals route with the right tab
const MODULE_APPROVAL_ROUTE: Record<Module, string> = {
  "KPI":                       "/supervisor/approvals/measurement/kpi",
  "SMART Goals":               "/supervisor/approvals/measurement/smart-goals",
  "Appraisal Form":            "/supervisor/approvals/measurement/appraisal-form",
  "Project":                   "/supervisor/approvals/measurement/project",
  "Managerial Skill":          "/supervisor/approvals/measurement/managerial-skill",
  "Inter-Department Feedback": "/supervisor/approvals/measurement/inter-department-feedback",
  "RCA":                       "/supervisor/approvals/measurement/rca",
};

const MODULE_SETTING_APPROVAL_ROUTE: Partial<Record<Module, string>> = {
  "KPI":         "/supervisor/approvals/setting/kpi",
  "SMART Goals": "/supervisor/approvals/setting/smart-goals",
};

function ApprovalDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHrPortal = location.pathname.startsWith("/hr");
  const { activeUser, allUsers } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabFilter>("All");
  const [search, setSearch]       = useState("");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onRefresh = () => setTick((v) => v + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("feedback-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener(ACCESS_UPDATED_EVENT, onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("feedback-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  const allowedApprovalModules = useMemo(() => {
    const allowed = new Set(getAllowedApprovalTypesForUser(activeUser, "checkin"));
    const allOrder: Module[] = [
      "KPI",
      "SMART Goals",
      "Appraisal Form",
      "Project",
      "Managerial Skill",
      "Inter-Department Feedback",
      "RCA",
    ];
    return allOrder.filter((m) => allowed.has(m));
  }, [activeUser, tick]);

  const subordinates = useMemo(
    () => {
      const isGlobalValidator = isAdminOrHrIcfRole(activeUser.role) || Boolean(activeUser.isHrIcfValidator);
      if (isGlobalValidator) return allUsers;
      return getAuthorizedSubordinates(activeUser, allUsers).filter((u) => u.employeeId !== activeUser.employeeId);
    },
    [activeUser, allUsers, tick],
  );

  const pendingItems = useMemo<PendingItem[]>(() => {
    const workflows = loadWorkflowRecords();
    const allowedSet = new Set<string>(allowedApprovalModules);
    const list: PendingItem[] = [];
    const seenKeys = new Set<string>();

    for (const rec of workflows) {
      const sub = subordinates.find(
        (u) => normalizeEmployeeId(u.employeeId) === rec.employeeId || u.employeeId.toLowerCase() === rec.employeeId.toLowerCase(),
      );
      if (!sub) continue;
      const mod = (["KPI", "SMART Goals", "Appraisal Form", "Project", "Managerial Skill", "Inter-Department Feedback", "RCA"].includes(rec.module) ? rec.module : "KPI") as Module;
      if (!allowedSet.has(mod)) continue;

      const isFourStep = mod === "KPI" || mod === "SMART Goals" || mod === "RCA";
      const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(sub.employeeId);
      const chk = rec.decisions.checker?.status ?? "";
      const a1 = rec.decisions.approver1?.status ?? "";
      const a2 = rec.decisions.approver2?.status ?? "";
      const val = rec.decisions.validator?.status ?? "";

      const isRev = chk === "Revision" || a1 === "Revision" || a2 === "Revision" || val === "Revision";
      if (isRev) continue;

      const checkerDone = Boolean(bypassCheck || (chk && chk !== "Revision"));
      const a1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
      const a2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
      const validatorDone = Boolean(val === "Validated" || a2 === "Validated");

      const stageForRec = resolveWorkflowStageForTarget(
        activeUser,
        sub.employeeId,
        mod,
        { checkerDone, a1Done, a2Done, validatorDone },
      );
      if (!stageForRec) continue;

      let actionType: ActionType = mod === "Appraisal Form" ? "Complete Assessment" : "Approve";
      let noteText = "";

      if (isFourStep) {
        if (validatorDone) continue;
        if (!checkerDone) {
          // Sebelum di-Check oleh HR Unit Usaha -> HANYA muncul di HR Unit Checker, TIDAK muncul di Approver 1!
          if (stageForRec !== "checker") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"}) dari ${sub.name} menunggu pemeriksaan (Check) HR Unit Anda.`;
        } else if (!a1Done) {
          if (stageForRec !== "approver1") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"}) dari ${sub.name} telah di-Check HR Unit dan menunggu Approval 1 Anda.`;
        } else if (!a2Done) {
          if (stageForRec !== "approver2") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"}) dari ${sub.name} telah disetujui Approver 1 dan menunggu Approval 2 Anda.`;
        } else {
          // a2Done && !validatorDone -> masuk ke HR ICF / Administrator untuk di-Validate!
          if (stageForRec !== "validator") continue;
          actionType = "Review & Validate";
          noteText = `Pengajuan ${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"}) dari ${sub.name} telah disetujui Approver 2 dan menunggu Validasi (Validate) HR ICF Anda.`;
        }
      } else {
        if (stageForRec === "approver1" && a1Done) continue;
        if (stageForRec === "approver2" && (!a1Done || a2Done)) continue;
        noteText = `Pengajuan ${rec.module} (${rec.phase}) dari ${sub.name} menunggu ${stageForRec === "approver2" ? "Approval 2" : "Approval 1"} Anda.`;
      }

      seenKeys.add(`${normalizeEmployeeId(sub.employeeId)}:${mod}:${rec.phase}`);
      list.push({
        id: rec.key,
        employeeId: sub.employeeId,
        employeeName: sub.name,
        position: sub.position,
        unit: sub.company,
        division: sub.division,
        module: mod,
        phase: rec.phase,
        submissionType: `${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"})`,
        actionNeeded: actionType,
        submittedDate: rec.submittedDate || formatTodayDDMMYYYY(),
        notes: noteText,
        urgent: false,
      });
    }

    if (allowedSet.has("Project")) {
      for (const prjRow of projectApprovalRows("approver1")) {
        const sub = subordinates.find(
          (u) =>
            normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(prjRow.employeeId) ||
            u.employeeId.toLowerCase() === prjRow.employeeId.toLowerCase(),
        );
        if (!sub) continue;
        const normId = normalizeEmployeeId(sub.employeeId);
        const wfRec = workflows.find((w) => w.year === "2026" && w.module === "Project" && w.phase === "measurement" && w.employeeId === normId);
        const a1Done = Boolean(wfRec?.decisions.approver1 && (wfRec.decisions.approver1.status === "Approved" || wfRec.decisions.approver1.status.startsWith("Assessed")));
        const a2Done = Boolean(wfRec?.decisions.approver2 && (wfRec.decisions.approver2.status === "Approved" || wfRec.decisions.approver2.status.startsWith("Assessed")));
        const roleForPrj = resolveReviewerRoleForTarget(activeUser, sub.employeeId, a1Done, "Project");
        if (!roleForPrj) continue;
        if (roleForPrj === "approver1" && a1Done) continue;
        if (roleForPrj === "approver2" && (!a1Done || a2Done)) continue;
        const key = `${normalizeEmployeeId(sub.employeeId)}:Project:measurement`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        list.push({
          id: prjRow.no,
          employeeId: sub.employeeId,
          employeeName: sub.name,
          position: sub.position,
          unit: sub.company,
          division: sub.division,
          module: "Project",
          submissionType: "Project Outside Job Scope (Measurement)",
          actionNeeded: "Approve",
          submittedDate: prjRow.submittedDate && prjRow.submittedDate !== "-" ? prjRow.submittedDate : formatTodayDDMMYYYY(),
          notes: `Pengajuan Project Outside Job Scope dari ${sub.name} menunggu persetujuan Anda.`,
          urgent: false,
        });
      }
    }

    if (allowedSet.has("Inter-Department Feedback")) {
      for (const fbRow of feedbackApprovalRows("approver1")) {
        if (fbRow.status !== "Pending") continue;
        const sub = subordinates.find(
          (u) =>
            normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(fbRow.employeeId) ||
            u.employeeId.toLowerCase() === fbRow.employeeId.toLowerCase(),
        );
        if (!sub) continue;
        const key = `${normalizeEmployeeId(sub.employeeId)}:Inter-Department Feedback:measurement`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        list.push({
          id: fbRow.no,
          employeeId: sub.employeeId,
          employeeName: sub.name,
          position: sub.position,
          unit: sub.company,
          division: sub.division,
          module: "Inter-Department Feedback",
          submissionType: "Inter-Department Feedback (Measurement)",
          actionNeeded: "Approve",
          submittedDate: fbRow.submittedDate && fbRow.submittedDate !== "-" ? fbRow.submittedDate : formatTodayDDMMYYYY(),
          notes: `Pengajuan Inter-Department Feedback dari ${sub.name} menunggu persetujuan Anda.`,
          urgent: false,
        });
      }
    }

    return list;
  }, [subordinates, allowedApprovalModules, tick]);

  const top5OldestIds = useMemo(
    () =>
      new Set(
        [...pendingItems]
          .sort((a, b) => a.submittedDate.localeCompare(b.submittedDate))
          .slice(0, 5)
          .map((i) => i.id),
      ),
    [pendingItems],
  );

  const filtered = pendingItems.filter((item) => {
    if (activeTab !== "All" && item.module !== activeTab) return false;
    if (search && !item.employeeName.toLowerCase().includes(search.toLowerCase()) && !item.submissionType.toLowerCase().includes(search.toLowerCase())) return false;
    if (urgentOnly && !top5OldestIds.has(item.id)) return false;
    return true;
  }).sort((a, b) => a.submittedDate.localeCompare(b.submittedDate));

  const urgentCount = top5OldestIds.size;
  const byModule = (m: Module) => pendingItems.filter((p) => p.module === m).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Pending */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#1E3A6E]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Total Pending</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{pendingItems.length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#1E3A6E] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">{subordinates.length} team members</p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#1E3A6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Urgent */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#FCECEE] via-[#FDF6F7] to-white border border-[#F4D6DA] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#9F3A4B]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Urgent</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{urgentCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#9F3A4B] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">requires immediate action</p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#9F3A4B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Assessments Due */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#FBECE5] via-[#FDF7F4] to-white border border-[#F2DCD2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#A85D43]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Assessments Due</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{byModule("Appraisal Form")}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#A85D43] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">supervisor assessment pending</p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#A85D43" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Approvals Needed */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#E6F4EE] via-[#F4FAF7] to-white border border-[#D3EBE1] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#2D6A5B]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Approvals Needed</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{pendingItems.filter((p) => p.actionNeeded === "Approve").length}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#2D6A5B] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">KPI & project submissions</p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#2D6A5B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Module pills */}
      <div className="flex flex-wrap gap-3">
        {allowedApprovalModules.map((m) => {
          const meta = MODULE_META[m];
          const Icon = meta.icon;
          return (
            <button
              key={m}
              onClick={() => setActiveTab(activeTab === m ? "All" : m)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                activeTab === m ? `${meta.bg} ${meta.color} ${meta.border}` : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {m}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === m ? "bg-white/60" : "bg-gray-100 text-gray-600"}`}>
                {byModule(m)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee or submission type..."
            className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400" />
        </div>
        <button onClick={() => setUrgentOnly(!urgentOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${urgentOnly ? "bg-rose-50 border-rose-200 text-rose-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          Urgent Only
        </button>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} items shown</span>
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
            <CheckCircle2 className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-400 mb-1">No pending items</p>
            <p className="text-xs text-gray-400">All caught up! Try adjusting the filter.</p>
          </div>
        ) : filtered.map((item) => {
          const meta    = MODULE_META[item.module];
          const Icon    = meta.icon;
          const btnCls  = ACTION_STYLE[item.actionNeeded];
          const isUrgent = top5OldestIds.has(item.id);
          return (
            <div key={item.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all ${isUrgent ? "border-rose-200" : "border-gray-200"}`}>
              {isUrgent && (
                <div className="flex items-center gap-1.5 px-5 py-1.5 bg-rose-50 border-b border-rose-100">
                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                  <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wide">Urgent — Immediate Action Required</span>
                </div>
              )}
              <div className="px-5 py-4 flex items-center gap-5 flex-wrap">
                <div className={`flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl ${meta.bg} ${meta.border} border`}>
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div className="flex flex-col min-w-[160px]">
                  <p className="text-sm font-bold text-gray-800">{item.employeeName}</p>
                  <p className="text-xs text-gray-400">{item.position}</p>
                  <p className="text-[11px] text-gray-400">{item.unit}</p>
                </div>
                <div className="flex flex-col flex-1 min-w-[180px]">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.bg} ${meta.color}`}>{item.module}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">{item.submissionType}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>
                </div>
                <div className="flex flex-col items-end gap-2 ml-auto shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {formatDate(item.submittedDate)}
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                    item.actionNeeded === "Approve" ? "bg-[#1A284F]/5 text-[#1A284F] border-[#1A284F]/20"
                    : item.actionNeeded === "Complete Assessment" ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>{item.actionNeeded}</span>
                  <button
                    onClick={() => {
                      const rawRoute =
                        item.phase === "setting"
                          ? MODULE_SETTING_APPROVAL_ROUTE[item.module] ?? "/supervisor/approvals/setting"
                          : MODULE_APPROVAL_ROUTE[item.module];
                      const targetRoute = isHrPortal
                        ? rawRoute.replace(/^\/supervisor\//, "/hr/")
                        : rawRoute;
                      navigate(targetRoute);
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${btnCls}`}
                  >
                    {item.actionNeeded === "Complete Assessment" ? "Fill Assessment" : "Review"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── My Dashboard (employee view for supervisor) ──────────────────────────────


type ApprovalStatus = "Not Started" | "Submitted" | "On Progress" | "Done";

interface MonthProgress { month: string; status: ApprovalStatus; }

interface ModuleMilestone {
  label: string;
  icon: React.ElementType;
  status: ApprovalStatus;
  months?: MonthProgress[];
  navTo?: string;
}


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

const MODULE_MILESTONE_ICONS: Record<string, React.ElementType> = {
  "KPI (Setting)":          TrendingUp,
  "SMART Goals (Setting)":  Lightbulb,
  "KPI (Tracking)":         TrendingUp,
  "SMART Goals (Tracking)": Lightbulb,
  "Appraisal Form":         ClipboardList,
  "Project OJS":            FolderKanban,
  "Managerial Skill":       Star,
};

const MODULE_ROUTES: Record<string, string> = {
  "KPI (Setting)":          "/supervisor/setting/kpi",
  "SMART Goals (Setting)":  "/supervisor/setting/smart-goals",
  "KPI (Tracking)":         "/supervisor/measurement/kpi-tracking",
  "SMART Goals (Tracking)": "/supervisor/measurement/smart-goals",
  "Appraisal Form":         "/supervisor/measurement/appraisal-form",
  "Project OJS":            "/supervisor/measurement/project-outside",
  "Managerial Skill":       "/supervisor/measurement/managerial-skill",
};

function approvalToMilestoneStatus(mod: ModuleApprovalData): ApprovalStatus {
  if (mod.overallStatus === "Approved") return "Done";
  if (mod.overallStatus === "Pending")  return "Not Started";
  const firstInProg = mod.steps.findIndex(s => s.status === "in_progress");
  return firstInProg === 0 ? "Submitted" : "On Progress";
}

function stepFillPct(mod: ModuleApprovalData): number {
  if (mod.overallStatus === "Approved") return 100;
  if (mod.overallStatus === "Pending")  return 0;
  const completed = mod.steps.filter(s => s.status === "completed").length;
  const total     = mod.steps.length;
  const inProg    = mod.steps.findIndex(s => s.status === "in_progress");
  return Math.round(((completed + (inProg >= 0 ? 0.4 : 0)) / total) * 100);
}

function MilestoneProgress() {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);
  const liveModules = getLiveUserModuleApprovals(true);

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
      {/* Module rows — derived from MODULE_APPROVALS */}
      <div className="flex flex-col gap-4">
        {liveModules.map((mod) => {
          const Icon    = MODULE_MILESTONE_ICONS[mod.module] ?? ClipboardList;
          const status  = approvalToMilestoneStatus(mod);
          const fillPct = stepFillPct(mod);
          const pending = mod.steps.find(s => s.status === "in_progress");

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
                    onClick={() => navigate(MODULE_ROUTES[mod.module] ?? "/supervisor/appraisals")}
                    className="text-[10px] font-semibold text-[#1A284F] hover:underline flex items-center gap-0.5"
                  >
                    View <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
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

// ─── Appraisal Summary Cards ──────────────────────────────────────────────────

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

const MODULE_APPROVALS: ModuleApprovalData[] = new Proxy([] as ModuleApprovalData[], {
  get(_target, prop, receiver) {
    const list = getLiveUserModuleApprovals(true);
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

const MY_APPRAISAL_SUMMARY = new Proxy(
  {
    currentScore: 0,
    currentGrade: "—",
    modulesApproved: 0,
    modulesTotal: 7,
    lastUpdated: "—",
    yearEnd: "Dec 2026",
    status: "In Progress" as const,
  },
  {
    get(_target, prop: string) {
      const mods = getLiveUserModuleApprovals(true);
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

function ModuleApprovalPopup({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const mod = MODULE_APPROVALS[selected];

  const statusBadgeClass = (s: ModuleApprovalData["overallStatus"]) => {
    if (s === "Approved")    return "bg-green-100 text-green-700 border-green-200";
    if (s === "In Progress") return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-gray-100 text-gray-500 border-gray-200";
  };

  const stepCircle = (status: ApprovalStepStatus, index: number) => {
    if (status === "completed")
      return <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shrink-0"><CheckCircle2 className="w-4 h-4 text-white" /></div>;
    if (status === "in_progress")
      return <div className="w-8 h-8 rounded-full bg-orange-400 flex items-center justify-center shrink-0 text-white text-xs font-bold">{index + 1}</div>;
    return <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 text-gray-400 text-xs font-bold">{index + 1}</div>;
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
                mod.overallStatus === "Approved" ? "text-green-600" :
                mod.overallStatus === "In Progress" ? "text-orange-500" : "text-gray-400"
              }`}>
                {mod.overallStatus === "Approved" ? "Approved" :
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
          {mod.steps.map((step, i) => (
            <div key={step.label} className="relative">
              {/* Connector line */}
              {i < mod.steps.length - 1 && (
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
              ? "Approval in progress"
              : "Awaiting approver review"}
          </div>
        </div>
      </div>
    </div>
  );
}

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

  const activeUser = getActiveUser();
  const liveMods = getLiveUserModuleApprovals(true);
  const emps = getLiveTransactionalEmployees();
  const me = emps.find((e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase());
  const baseScore = me?.totalScore ?? 0;
  const currentScore = parseFloat(baseScore.toFixed(1));
  const currentGrade = currentScore > 0 ? scoreToGrade(currentScore) : "—";
  const modulesApproved = liveMods.filter(m => m.overallStatus === "Approved").length;
  const modulesTotal = liveMods.length;
  const s = { ...MY_APPRAISAL_SUMMARY, currentScore, currentGrade, modulesApproved, modulesTotal };
  const pending = s.modulesTotal - s.modulesApproved;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Current Score */}
        <button onClick={() => navigate("/supervisor/profile")}
          className="group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] text-left transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg active:scale-[0.99] cursor-pointer shadow-sm">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#1E3A6E]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <span className="text-xs font-medium text-gray-500 block">Current Score</span>
              <span className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5 block">{s.currentScore}%</span>
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
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <button
              onClick={() => setShowPopup(true)}
              className="text-[11px] text-[#142546] font-medium text-left hover:underline"
            >
              {pending} pending | {s.modulesApproved} Approved - See Details
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

function MyDashboard() {
  return (
    <div className="flex flex-col gap-8">
      <CurrentCycleBanner />

      <AppraisalSummaryCards />

      <MilestoneProgress />

      <DashboardNotificationSection />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DashTab = "approval" | "my";

export function SupervisorDashboard() {
  const location = useLocation();
  const { activeUser } = useAuthStore();
  const { getRolePermissions } = useAccessManagement();
  const [, setMenuTick] = useState(0);
  useEffect(() => {
    const onMenuUpdate = () => setMenuTick((t) => t + 1);
    window.addEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
    return () => window.removeEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
  }, []);

  const rolePerms = getRolePermissions(activeUser.role || "Employee");
  const canViewMy =
    isMenuVisibleInMenuManagement("dashboard_my") && Boolean(rolePerms.dashboard_my?.view);
  const canViewApproval =
    isMenuVisibleInMenuManagement("dashboard_approval") && Boolean(rolePerms.dashboard_approval?.view);

  const portalPrefix = `/${location.pathname.split("/")[1] || "supervisor"}`;
  const defaultTab: DashTab = canViewMy ? "my" : canViewApproval ? "approval" : "my";
  const [activeTab, setActiveTab] = useRouteTab<DashTab>(["my", "approval"], defaultTab, {
    base: `${portalPrefix}/dashboard`,
  });

  const visibleTabs: { key: DashTab; label: string; icon: React.ElementType }[] = [
    ...(canViewMy || (!canViewMy && !canViewApproval)
      ? [{ key: "my" as DashTab, label: "My Dashboard", icon: LayoutDashboard }]
      : []),
    ...(canViewApproval
      ? [{ key: "approval" as DashTab, label: "Approval Dashboard", icon: ClipboardCheck }]
      : []),
  ];

  const effectiveTab: DashTab =
    !canViewMy && canViewApproval
      ? "approval"
      : !canViewApproval && canViewMy
      ? "my"
      : activeTab;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-100">
        {visibleTabs.map(({ key, label, icon: Icon }) => {
          const isActive = effectiveTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-t-xl border-b-2 transition-colors ${
                isActive
                  ? "border-[#1A284F] text-[#1A284F] bg-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {effectiveTab === "approval" ? <ApprovalDashboard /> : <MyDashboard />}
    </div>
  );
}
