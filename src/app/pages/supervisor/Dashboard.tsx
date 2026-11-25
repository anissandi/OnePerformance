import { resolveGradeForScore } from "../shared/scoringWeightStore";
// @refresh reset
import { KpiMonthlyApprovalBar } from "../../components/KpiMonthlyApprovalBar";
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
  canCheckerHandleCompanyUnit,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  resolveReviewerRoleForTarget,
  resolveWorkflowStageForTarget,
  shouldBypassCheckerForSubmission,
  useAuthStore,
} from "../../store/authStore";
import { getLiveUserModuleApprovals, loadWorkflowRecords, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";
import { getLiveTransactionalEmployeeById } from "../../data/mockEmployees";
import { buildLiveCycleStepsFromActivation } from "../hr/ModuleActivation";
import { projectApprovalRows } from "../../store/projectStore";
import { feedbackApprovalRows } from "../shared/interDepartmentFeedbackStore";
import { SCORE_WEIGHT_EVENT } from "../shared/scoringWeightStore";
import { ACCESS_UPDATED_EVENT, useAccessManagement } from "../hr/settings/AccessManagement";
import {
  getPendingKpiTrackingEditForDashboard,
  KPI_TRACKING_EDIT_EVENT,
  refreshKpiTrackingEditRequestsFromBackend,
} from "../../store/kpiTrackingEditStore";
import { isMenuVisibleInMenuManagement, MENU_UPDATED_EVENT } from "../hr/settings/MenuManagement";
import { useLocation } from "react-router";
import { DashboardNotificationSection } from "../../components/DashboardNotificationSection";
import { loadGroupSoyApprovals, resolveGroupSoyRoleForUser, SOY_EVENT } from "../../store/calibrationSoyStore";
import { loadPersistedState } from "../../services/supabaseClient";
import { getPendingTargetEditRequestsForViewer, KPI_TARGET_EDIT_EVENT } from "../../store/kpiTargetEditStore";
import { getGroupCompaniesForUnit, isDirectorRoleOrGrouping } from "../../store/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type Module =
  | "KPI"
  | "SMART Goals"
  | "Appraisal Form"
  | "Project"
  | "Managerial Skill"
  | "Inter-Department Feedback"
  | "RCA"
  | "Calibration";
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
  "Calibration":               { icon: Sparkles,      color: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200",    hex: "#0369a1" },
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
  "RCA":                       "/supervisor/approvals/measurement/kpi",
  "Calibration":               "/supervisor/approvals/calibration/setting",
};

const MODULE_SETTING_APPROVAL_ROUTE: Partial<Record<Module, string>> = {
  "KPI":         "/supervisor/approvals/setting/kpi",
  "SMART Goals": "/supervisor/approvals/setting/smart-goals",
};

function ApprovalDashboard({ onCountChange }: { onCountChange?: (n: number) => void }) {
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
    window.addEventListener(SOY_EVENT, onRefresh);
    window.addEventListener(KPI_TARGET_EDIT_EVENT, onRefresh);
    window.addEventListener(KPI_TRACKING_EDIT_EVENT, onRefresh);
    void refreshKpiTrackingEditRequestsFromBackend();
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("feedback-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
      window.removeEventListener(SOY_EVENT, onRefresh);
      window.removeEventListener(KPI_TARGET_EDIT_EVENT, onRefresh);
      window.removeEventListener(KPI_TRACKING_EDIT_EVENT, onRefresh);
    };
  }, []);

  // Task Approval Edit [Target] Request KPI (Fase 1 HR ICF & Fase 2 Approver 1 -> Approver 2 -> GM -> Validate HR ICF)
  const targetEditItems = useMemo<PendingItem[]>(() => {
    return getPendingTargetEditRequestsForViewer(activeUser, allUsers).map(({ req, roleLabel }) => ({
      id: `targetedit-${req.id}`,
      employeeId: req.employeeId,
      employeeName: req.employeeName,
      position: req.position,
      unit: req.companyUnit,
      division: req.division,
      module: "KPI" as Module,
      phase: "setting" as const,
      submissionType: `Edit [Target] KPI (${roleLabel})`,
      actionNeeded: req.stage === "pending_validate" ? ("Review & Validate" as ActionType) : ("Approve" as ActionType),
      submittedDate: req.phase2SubmittedAt || req.phase1RequestedAt || formatTodayDDMMYYYY(),
      notes: `[${req.phase1Category}] ${req.phase1Reason}${req.phase2Comment ? ` — Note: ${req.phase2Comment}` : ""}`,
      urgent: false,
    }));
  }, [activeUser, allUsers, tick]);

  // Task Approval Request Edit KPI Tracking (4-tahap: HR Unit Checker -> Approver 1 -> Approver 2 -> HR ICF Validator)
  const kpiTrackingEditItems = useMemo<PendingItem[]>(() => {
    return getPendingKpiTrackingEditForDashboard(activeUser, allUsers).map(({ req, stageRole, roleLabel }) => ({
      id: `kpitredit-${req.id}`,
      employeeId: req.employeeId,
      employeeName: req.employeeName,
      position: req.position,
      unit: req.companyUnit,
      division: req.division,
      module: "KPI" as Module,
      phase: "measurement" as const,
      submissionType: `Request Edit KPI Tracking (${roleLabel})`,
      actionNeeded: stageRole === "validator" ? ("Review & Validate" as ActionType) : ("Approve" as ActionType),
      submittedDate: req.requestedAt || formatTodayDDMMYYYY(),
      notes: `Bulan: ${req.monthLabels.join(", ")} — Alasan: ${req.reason}`,
      urgent: false,
    }));
  }, [activeUser, allUsers, tick]);

  // Task Approval KPI Business: Checker Khusus -> Director (untuk KPI Unit) -> HR ICF (Validate)
  const kpiBusinessItems = useMemo<PendingItem[]>(() => {
    const out: PendingItem[] = [];
    const statusMap = loadPersistedState<Record<string, { submitted?: boolean; checked?: boolean; stage?: string; directorApproved?: boolean; approved?: boolean; companyUnit?: string; submittedDate?: string; submittedBy?: string }>>("pa_kpi_business_status_v1", {});
    const isDir = isDirectorRoleOrGrouping(activeUser);
    const isVal = isAdminOrHrIcfRole(activeUser.role) || Boolean(activeUser.isHrIcfValidator);
    const isBizChecker = Boolean(activeUser.isKpiBusinessChecker);
    const checkerScopes = (activeUser.kpiBusinessCheckerUnits ?? []).filter(Boolean);
    const dirUnits = isDir ? getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits) : [];

    for (const [scopeKey, st] of Object.entries(statusMap)) {
      if (!st?.submitted || st.approved) continue;
      const awaitingChecker =
        !st.directorApproved &&
        (st.stage === "pending_checker" || (st.checked === false && st.stage !== "revision"));
      if (scopeKey.startsWith("unit-")) {
        const unitName = st.companyUnit || scopeKey.replace(/^unit-/, "");
        const canCheckThisUnit =
          isBizChecker && (checkerScopes.length === 0 || checkerScopes.some((s) => s === unitName));
        if (awaitingChecker) {
          if (canCheckThisUnit) {
            out.push({
              id: `kpibiz-chk-${scopeKey}`,
              employeeId: "-",
              employeeName: `KPI (Unit) — ${unitName}`,
              position: `Disubmit oleh ${st.submittedBy || "GM"}`,
              unit: unitName,
              division: "-",
              module: "KPI" as Module,
              phase: "setting" as const,
              submissionType: "KPI Business — KPI (Unit)",
              actionNeeded: "Check",
              submittedDate: st.submittedDate || formatTodayDDMMYYYY(),
              notes: `Pengajuan KPI (Unit) ${unitName} menunggu pemeriksaan (Checked) oleh Checker KPI Business.`,
              urgent: false,
            });
          }
        } else if (isDir && !st.directorApproved && dirUnits.includes(unitName)) {
          out.push({
            id: `kpibiz-dir-${scopeKey}`,
            employeeId: "-",
            employeeName: `KPI (Unit) — ${unitName}`,
            position: `Disubmit oleh ${st.submittedBy || "GM"}`,
            unit: unitName,
            division: "-",
            module: "KPI" as Module,
            phase: "setting" as const,
            submissionType: "KPI Business — KPI (Unit)",
            actionNeeded: "Approve",
            submittedDate: st.submittedDate || formatTodayDDMMYYYY(),
            notes: `Pengajuan KPI (Unit) ${unitName} menunggu persetujuan (Approve) Director.`,
            urgent: false,
          });
        } else if (isVal && st.directorApproved) {
          out.push({
            id: `kpibiz-val-${scopeKey}`,
            employeeId: "-",
            employeeName: `KPI (Unit) — ${unitName}`,
            position: `Approved by Director · Penyusun: ${st.submittedBy || "GM"}`,
            unit: unitName,
            division: "-",
            module: "KPI" as Module,
            phase: "setting" as const,
            submissionType: "KPI Business — KPI (Unit)",
            actionNeeded: "Review & Validate",
            submittedDate: st.submittedDate || formatTodayDDMMYYYY(),
            notes: `KPI (Unit) ${unitName} telah disetujui Director dan menunggu Validate HR ICF.`,
            urgent: false,
          });
        }
      } else if (scopeKey.startsWith("corporate-")) {
        const groupLabel = scopeKey.replace(/^corporate-/, "") || "RSUP Group";
        const canCheckGroup =
          isBizChecker && (checkerScopes.length === 0 || checkerScopes.includes("KPI Group"));
        if (awaitingChecker) {
          if (canCheckGroup) {
            out.push({
              id: `kpibiz-chk-${scopeKey}`,
              employeeId: "-",
              employeeName: `KPI (Group) — ${groupLabel}`,
              position: `Disubmit oleh ${st.submittedBy || "Director"}`,
              unit: st.companyUnit || "PT RSUP (Industry)",
              division: "-",
              module: "KPI" as Module,
              phase: "setting" as const,
              submissionType: "KPI Business — KPI (Group)",
              actionNeeded: "Check",
              submittedDate: st.submittedDate || formatTodayDDMMYYYY(),
              notes: `Pengajuan KPI (Group) ${groupLabel} menunggu pemeriksaan (Checked) oleh Checker KPI Business.`,
              urgent: false,
            });
          }
        } else if (isVal) {
          out.push({
            id: `kpibiz-grp-${scopeKey}`,
            employeeId: "-",
            employeeName: `KPI (Group) — ${groupLabel}`,
            position: `Checked · Penyusun: ${st.submittedBy || "Director"}`,
            unit: st.companyUnit || "PT RSUP (Industry)",
            division: "-",
            module: "KPI" as Module,
            phase: "setting" as const,
            submissionType: "KPI Business — KPI (Group)",
            actionNeeded: "Review & Validate",
            submittedDate: st.submittedDate || formatTodayDDMMYYYY(),
            notes: `Pengajuan KPI (Group) ${groupLabel} telah diperiksa Checker dan menunggu validasi (Validate) HR ICF.`,
            urgent: false,
          });
        }
      }
    }
    return out;
  }, [activeUser, tick]);

  // Task Approval Open Lock (khusus HR ICF / Administrator)
  const openLockItems = useMemo<PendingItem[]>(() => {
    if (!isAdminOrHrIcfRole(activeUser.role) && !activeUser.isHrIcfValidator) return [];
    const list = loadPersistedState<Array<{ id?: string; employeeId?: string; employeeName?: string; posisi?: string; companyUnit?: string; divisi?: string; module?: string; submittedAt?: string; status?: string; reason?: string }>>("pa_open_lock_requests_v1", []);
    return (Array.isArray(list) ? list : [])
      .filter((r) => r.status === "pending")
      .map((r) => ({
        id: `openlock-${r.id ?? r.employeeId}`,
        employeeId: String(r.employeeId ?? "-"),
        employeeName: String(r.employeeName ?? r.employeeId ?? "-"),
        position: String(r.posisi ?? "-"),
        unit: String(r.companyUnit ?? "-"),
        division: String(r.divisi ?? "-"),
        module: "KPI" as Module,
        submissionType: `Open Lock — ${r.module ?? "KPI Tracking"}`,
        actionNeeded: "Review & Validate" as ActionType,
        submittedDate: String(r.submittedAt ?? formatTodayDDMMYYYY()),
        notes: String(r.reason ?? "Permintaan Open Lock menunggu persetujuan HR ICF."),
        urgent: false,
      }));
  }, [activeUser, tick]);

  // Task Approval Calibration — Setting (SOY) berbasis Group yang masih Pending untuk Director / Approver Group tsb
  const calibrationItems = useMemo<PendingItem[]>(() => {
    const out: PendingItem[] = [];
    for (const rec of Object.values(loadGroupSoyApprovals())) {
      if (rec.status !== "Pending") continue;
      const role = resolveGroupSoyRoleForUser(activeUser, rec.unitName, false);
      if (!role) continue;
      out.push({
        id: `soy-${rec.unitId}`,
        employeeId: "-",
        employeeName: rec.unitName,
        position: `Disubmit oleh ${rec.submittedBy}`,
        unit: rec.unitName,
        division: "-",
        module: "Calibration",
        submissionType: "Calibration Setting (HC Awal Tahun / SOY)",
        actionNeeded: role === "approve" ? "Approve" : "Review & Validate",
        submittedDate: normalizeDateDDMMYYYY(rec.submittedAt.slice(0, 10)),
        notes:
          role === "approve"
            ? `Calibration Setting (SOY) ${rec.unitName} menunggu persetujuan (Approve / Revision) Anda.`
            : `Calibration Setting (SOY) ${rec.unitName} disubmit untuk Anda ketahui (Mengetahui).`,
        urgent: false,
      });
    }
    return out;
  }, [activeUser, tick]);

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
    const base = allOrder.filter((m) => allowed.has(m));
    return calibrationItems.length > 0 ? [...base, "Calibration" as Module] : base;
  }, [activeUser, tick, calibrationItems.length]);

  const subordinates = useMemo(
    () => {
      const isGlobalValidator = isAdminOrHrIcfRole(activeUser.role) || Boolean(activeUser.isHrIcfValidator);
      if (isGlobalValidator) return allUsers;
      const authSubs = getAuthorizedSubordinates(activeUser, allUsers).filter((u) => u.employeeId !== activeUser.employeeId);
      if (activeUser.role === "HR Unit" || Boolean(activeUser.isHrUnitChecker)) {
        const authIds = new Set(authSubs.map((u) => u.employeeId.toLowerCase()));
        const unitUsers = allUsers.filter(
          (u) =>
            u.employeeId !== activeUser.employeeId &&
            (authIds.has(u.employeeId.toLowerCase()) ||
              canCheckerHandleCompanyUnit(activeUser, u.company) ||
              isSameCompanyUnit(u.company, activeUser.company)),
        );
        return unitUsers;
      }
      return authSubs;
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

      const isEditResubmitKpi = Boolean(rec.module === "KPI" && rec.phase === "measurement" && rec.isEditResubmit);
      const modTitleLabel = isEditResubmitKpi
        ? "Re-submit Perubahan Edit KPI Tracking"
        : `${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"})`;
      let actionType: ActionType = mod === "Appraisal Form" ? "Complete Assessment" : "Approve";
      let noteText = "";

      if (isFourStep) {
        if (validatorDone) continue;
        if (!checkerDone) {
          // Sebelum di-Check oleh HR Unit Usaha -> HANYA muncul di HR Unit Checker, TIDAK muncul di Approver 1!
          if (stageForRec !== "checker") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${modTitleLabel} dari ${sub.name} menunggu pemeriksaan (Check) HR Unit Anda.`;
        } else if (!a1Done) {
          if (stageForRec !== "approver1") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${modTitleLabel} dari ${sub.name} telah di-Check HR Unit dan menunggu Approval 1 Anda.`;
        } else if (!a2Done) {
          if (stageForRec !== "approver2") continue;
          actionType = "Approve";
          noteText = `Pengajuan ${modTitleLabel} dari ${sub.name} telah disetujui Approver 1 dan menunggu Approval 2 Anda.`;
        } else {
          // a2Done && !validatorDone -> masuk ke HR ICF / Administrator untuk di-Validate!
          if (stageForRec !== "validator") continue;
          actionType = "Review & Validate";
          noteText = `Pengajuan ${modTitleLabel} dari ${sub.name} telah disetujui Approver 2 dan menunggu Validasi (Validate) HR ICF Anda.`;
        }
      } else {
        if (stageForRec === "approver1" && a1Done) continue;
        if (stageForRec === "approver2" && (!a1Done || a2Done)) continue;
        noteText = `Pengajuan ${modTitleLabel} dari ${sub.name} menunggu ${stageForRec === "approver2" ? "Approval 2" : "Approval 1"} Anda.`;
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
        submissionType: modTitleLabel,
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

    return [...list, ...targetEditItems, ...kpiTrackingEditItems, ...kpiBusinessItems, ...openLockItems, ...calibrationItems];
  }, [subordinates, allowedApprovalModules, tick, calibrationItems, openLockItems, targetEditItems, kpiTrackingEditItems, kpiBusinessItems]);

  useEffect(() => {
    onCountChange?.(pendingItems.length);
  }, [pendingItems.length, onCountChange]);

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
                      const curPortal = location.pathname.split("/").filter(Boolean)[0] || "supervisor";
                      const portalPrefix =
                        curPortal === "hr" || curPortal === "bod" || curPortal === "employee" || curPortal === "supervisor"
                          ? `/${curPortal}`
                          : "/supervisor";
                      if (item.id.startsWith("kpibiz-chk-")) {
                        const isUnit = item.id.includes("unit-");
                        navigate(`${portalPrefix}/approvals/settings/kpi/${isUnit ? "gm" : "group"}`);
                        return;
                      }
                      if (item.id.startsWith("kpibiz-dir-")) {
                        navigate(`${portalPrefix}/approvals/settings/kpi/gm`);
                        return;
                      }
                      if (item.id.startsWith("kpibiz-val-")) {
                        navigate(`${portalPrefix}/approvals/settings/kpi/gm`);
                        return;
                      }
                      if (item.id.startsWith("kpibiz-grp-")) {
                        navigate(`${portalPrefix}/approvals/settings/kpi/group`);
                        return;
                      }
                      const rawRoute = item.id.startsWith("openlock-")
                        ? "/hr/settings/open-lock"
                        : item.phase === "setting"
                          ? MODULE_SETTING_APPROVAL_ROUTE[item.module] ?? "/supervisor/approvals/setting"
                          : MODULE_APPROVAL_ROUTE[item.module];
                      const portalSeg = location.pathname.split("/").filter(Boolean)[0];
                      const targetRoute = isHrPortal
                        ? rawRoute.replace(/^\/supervisor\//, "/hr/")
                        : (portalSeg === "bod" || portalSeg === "employee")
                        ? rawRoute.replace(/^\/supervisor\//, `/${portalSeg}/`)
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
  "RCA":                    ClipboardCheck,
  "SMART Goals (Tracking)": Lightbulb,
  "Appraisal Form":         ClipboardList,
  "Project OJS":            FolderKanban,
  "Managerial Skill":       Star,
  "Inter-Department Feedback": Users,
};

const MODULE_ROUTES: Record<string, string> = {
  "KPI (Setting)":          "/supervisor/setting/kpi",
  "SMART Goals (Setting)":  "/supervisor/setting/smart-goals",
  "KPI (Tracking)":         "/supervisor/measurement/kpi-tracking",
  "RCA":                    "/supervisor/measurement/rca",
  "SMART Goals (Tracking)": "/supervisor/measurement/smart-goals",
  "Appraisal Form":         "/supervisor/measurement/appraisal-form",
  "Project OJS":            "/supervisor/measurement/project-outside",
  "Managerial Skill":       "/supervisor/measurement/managerial-skill",
  "Inter-Department Feedback": "/supervisor/measurement/inter-department-feedback",
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
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let rafId: number | null = null;
    const onRefresh = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setTick((t) => t + 1);
      });
    };
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);
  const activeUser = getActiveUser();
  const liveModules = useMemo(() => getLiveUserModuleApprovals(true), [tick, activeUser.employeeId]);

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

              {/* Progress bar — KPI (Tracking) dibagi per bulan dengan warna status approval masing-masing bulan */}

              {mod.module === "KPI (Tracking)" ? (

                <KpiMonthlyApprovalBar employeeId={activeUser.employeeId} />

              ) : (

              <div className="relative h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">

                <div

                  className={`h-full rounded-full transition-all duration-700 ${STAGE_BAR_COLOR[status]}`}

                  style={{ width: `${fillPct}%` }}

                />

              </div>

              )}

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

function ModuleApprovalPopup({ modules, onClose }: { modules: ModuleApprovalData[]; onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const mod = modules[selected] ?? modules[0];
  if (!mod) return null;

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
            {modules.map((m, i) => (
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

function scoreToGrade(s: number, companyName?: string) {
  return resolveGradeForScore(s, companyName);
}

function AppraisalSummaryCards() {
  const [showPopup, setShowPopup] = useState(false);
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let rafId: number | null = null;
    const onRefresh = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setTick((v) => v + 1);
      });
    };
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener(SCORE_WEIGHT_EVENT, onRefresh);
    window.addEventListener(ACCESS_UPDATED_EVENT, onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  const activeUser = getActiveUser();
  const { liveMods, s } = useMemo(() => {
    const mods = getLiveUserModuleApprovals(true);
    const me = getLiveTransactionalEmployeeById(activeUser.employeeId);
    const baseScore = me?.totalScore ?? 0;
    const currentScore = parseFloat(baseScore.toFixed(1));
    const currentGrade = currentScore > 0 ? scoreToGrade(currentScore, activeUser.company) : "—";
    const modulesApproved = mods.filter((m) => m.overallStatus === "Approved").length;
    const modulesTotal = mods.length;
    return {
      liveMods: mods,
      s: {
        currentScore,
        currentGrade,
        modulesApproved,
        modulesTotal,
        lastUpdated: me?.approvalCompleteDate ?? "—",
        yearEnd: "Dec 2026",
        status: mods.length > 0 && mods.every((m) => m.overallStatus === "Approved") ? "Done" : "In Progress",
      },
    };
  }, [tick, activeUser.employeeId, activeUser.company]);
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

      {showPopup && <ModuleApprovalPopup modules={liveMods} onClose={() => setShowPopup(false)} />}
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
  const { activeUser, allUsers } = useAuthStore();
  const { getRolePermissions } = useAccessManagement();
  const [liveApprovalCount, setLiveApprovalCount] = useState<number | null>(null);
  const [menuTick, setMenuTick] = useState(0);
  useEffect(() => {
    const bump = () => setMenuTick((t) => t + 1);
    window.addEventListener("appraisal-updated", bump);
    window.addEventListener("pa-db-hydrated", bump);
    window.addEventListener(SOY_EVENT, bump);
    window.addEventListener(KPI_TARGET_EDIT_EVENT, bump);
    window.addEventListener(KPI_TRACKING_EDIT_EVENT, bump);
    return () => {
      window.removeEventListener("appraisal-updated", bump);
      window.removeEventListener("pa-db-hydrated", bump);
      window.removeEventListener(SOY_EVENT, bump);
      window.removeEventListener(KPI_TARGET_EDIT_EVENT, bump);
      window.removeEventListener(KPI_TRACKING_EDIT_EVENT, bump);
    };
  }, []);

  useEffect(() => {
    const onMenuUpdate = () => setMenuTick((t) => t + 1);
    window.addEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
    return () => window.removeEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
  }, []);

  const rolePerms = getRolePermissions(activeUser.role || "Employee");
  const canViewMy =
    isMenuVisibleInMenuManagement("dashboard_my") && Boolean(rolePerms.dashboard_my?.view);
  const canViewApproval =
    isMenuVisibleInMenuManagement("dashboard_approval") &&
    (Boolean(rolePerms.dashboard_approval?.view) ||
      Boolean(activeUser.isHrUnitChecker) ||
      Boolean(activeUser.isKpiBusinessChecker));

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

  const hasPendingApprovalDot = useMemo(() => {
    if (!canViewApproval) return false;
    if (liveApprovalCount !== null) return liveApprovalCount > 0;
    const isVal = isAdminOrHrIcfRole(activeUser.role) || Boolean(activeUser.isHrIcfValidator);
    const isDir = isDirectorRoleOrGrouping(activeUser);
    if (getPendingTargetEditRequestsForViewer(activeUser, allUsers).length > 0) return true;
    if (getPendingKpiTrackingEditForDashboard(activeUser, allUsers).length > 0) return true;
    if (isVal && loadPersistedState<Array<{ status?: string }>>("pa_open_lock_requests_v1", []).some((r) => r.status === "pending")) return true;
    for (const soyRec of Object.values(loadGroupSoyApprovals())) {
      if (soyRec.status === "Pending" && resolveGroupSoyRoleForUser(activeUser, soyRec.unitName, false)) return true;
    }
    const bizMap = loadPersistedState<Record<string, { submitted?: boolean; checked?: boolean; stage?: string; directorApproved?: boolean; approved?: boolean; companyUnit?: string }>>("pa_kpi_business_status_v1", {});
    const isBizChecker = Boolean(activeUser.isKpiBusinessChecker);
    const bizCheckerScopes = (activeUser.kpiBusinessCheckerUnits ?? []).filter(Boolean);
    for (const [sk, st] of Object.entries(bizMap)) {
      if (!st?.submitted || st.approved) continue;
      const awaitingChk = !st.directorApproved && (st.stage === "pending_checker" || (st.checked === false && st.stage !== "revision"));
      if (sk.startsWith("unit-")) {
        const uName = st.companyUnit || sk.replace(/^unit-/, "");
        if (awaitingChk) {
          if (isBizChecker && (bizCheckerScopes.length === 0 || bizCheckerScopes.includes(uName))) return true;
          continue;
        }
        if (isDir && !st.directorApproved && getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits).includes(uName)) return true;
        if (isVal && st.directorApproved) return true;
      } else if (sk.startsWith("corporate-")) {
        if (awaitingChk) {
          if (isBizChecker && (bizCheckerScopes.length === 0 || bizCheckerScopes.includes("KPI Group"))) return true;
          continue;
        }
        if (isVal) return true;
      }
    }
    const checkerBypassIds = new Set(
      allUsers
        .filter((u) => u.role === "HR Unit" || Boolean(u.isHrUnitChecker))
        .map((u) => normalizeEmployeeId(u.employeeId)),
    );
    const workflows = loadWorkflowRecords();
    for (const wf of workflows) {
      const chk = wf.decisions.checker?.status ?? "";
      const a1 = wf.decisions.approver1?.status ?? "";
      const a2 = wf.decisions.approver2?.status ?? "";
      const val = wf.decisions.validator?.status ?? "";
      if (chk === "Revision" || a1 === "Revision" || a2 === "Revision" || val === "Revision") continue;
      const isFour = wf.module === "KPI" || wf.module === "SMART Goals" || wf.module === "RCA";
      const chkDone = Boolean(checkerBypassIds.has(normalizeEmployeeId(wf.employeeId)) || (chk && chk !== "Revision"));
      const a1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
      const a2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
      const valDone = Boolean(val === "Validated" || a2 === "Validated");
      if (isFour && valDone) continue;
      if (!isFour && a2Done) continue;
      const stage = resolveWorkflowStageForTarget(activeUser, wf.employeeId, wf.module, { checkerDone: chkDone, a1Done, a2Done, validatorDone: valDone }, allUsers);
      if (!stage) continue;
      if (isFour) {
        if (!chkDone && stage === "checker") return true;
        if (chkDone && !a1Done && stage === "approver1") return true;
        if (chkDone && a1Done && !a2Done && stage === "approver2") return true;
        if (chkDone && a1Done && a2Done && !valDone && stage === "validator") return true;
      } else {
        if (!a1Done && stage === "approver1") return true;
        if (a1Done && !a2Done && stage === "approver2") return true;
      }
    }
    for (const prjRow of projectApprovalRows("approver1")) {
      const normId = normalizeEmployeeId(prjRow.employeeId);
      const wfRec = workflows.find((w) => w.year === "2026" && w.module === "Project" && w.phase === "measurement" && w.employeeId === normId);
      const a1Done = Boolean(wfRec?.decisions.approver1 && (wfRec.decisions.approver1.status === "Approved" || wfRec.decisions.approver1.status.startsWith("Assessed")));
      const a2Done = Boolean(wfRec?.decisions.approver2 && (wfRec.decisions.approver2.status === "Approved" || wfRec.decisions.approver2.status.startsWith("Assessed")));
      const roleForPrj = resolveReviewerRoleForTarget(activeUser, prjRow.employeeId, a1Done, "Project");
      if (roleForPrj === "approver1" && !a1Done) return true;
      if (roleForPrj === "approver2" && a1Done && !a2Done) return true;
    }
    for (const fbRow of feedbackApprovalRows("approver1")) {
      if (fbRow.status === "Pending" || fbRow.status === "Pending-Hasil Tindak Lanjut") {
        const roleForFb = resolveReviewerRoleForTarget(activeUser, fbRow.employeeId, false, "Inter-Department Feedback");
        if (roleForFb) return true;
      }
    }
    return false;
  }, [canViewApproval, liveApprovalCount, effectiveTab, activeUser, allUsers, menuTick]);

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
              {key === "approval" && hasPendingApprovalDot && (
                <span
                  className="w-2.5 h-2.5 rounded-full bg-yellow-400 ring-2 ring-yellow-200 shadow-2xs shrink-0"
                  title="Ada task approval menunggu tindakan Anda"
                />
              )}
            </button>
          );
        })}
      </div>

      {effectiveTab === "approval" ? <ApprovalDashboard onCountChange={setLiveApprovalCount} /> : <MyDashboard />}
    </div>
  );
}
