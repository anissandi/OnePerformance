import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer";
import { savePersistedState } from "../../services/supabaseClient";
import {
  getActiveUser,
  isAdminOrHrIcfRole,
  resolveUserAllowedModules,
  shouldBypassCheckerForSubmission,
  type WorkflowStageRole,
} from "../../store/authStore";
import { triggerApprovalTransactionNotification } from "../../store/notificationStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";

export const MOCK_EMPLOYEE_ID = "EMP-002";
const KEY = "appraisal_workflow_v1";
const ALIASES_KEY = "appraisal_row_aliases_v1";
export interface WorkflowRecord {
  key: string;
  employeeId: string;
  module: string;
  phase: "setting" | "measurement";
  year: string;
  submittedDate: string;
  decisions: Partial<Record<ReviewerRole | "checker" | "validator", { status: string; date: string; note?: string; approverName?: string }>>;
  assessments: Partial<Record<ReviewerRole, { ratings: Record<string, number>; comments: Record<string, string>; date: string }>>;
  revisionHistory?: Array<{
    role: string;
    approverName: string;
    note: string;
    date: string;
  }>;
}
export interface WorkflowAlias {
  key: string;
  employeeId: string;
  module: string;
  phase: WorkflowRecord["phase"];
  year: string;
  submittedDate: string;
  role: ReviewerRole;
  stage?: WorkflowStageRole;
}
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}
export function normalizeEmployeeId(id: string) {
  const number = id.replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
  return number ? `EMP-${number.padStart(3, "0")}` : id;
}
function keyFor(employeeId: string, module: string, phase: WorkflowRecord["phase"], year = "2026") {
  return `${normalizeEmployeeId(employeeId)}:${phase}:${module}:${year}`;
}
export function loadWorkflowRecords(): WorkflowRecord[] { return read(KEY, []); }
export function workflowAlias(no: string): WorkflowAlias | undefined { return read<Record<string, WorkflowAlias>>(ALIASES_KEY, {})[no]; }
export function registerWorkflowRows(rows: ApprovalRow[], role: ReviewerRole) {
  const aliases = read<Record<string, WorkflowAlias>>(ALIASES_KEY, {});
  let changed = false;
  for (const row of rows) {
    const phase = /^(?:H?ST)-/.test(row.no) ? "setting" : "measurement";
    const year = row.period?.match(/20\d{2}/)?.[0] ?? "2026";
    const stage: WorkflowStageRole = row.workflowStageForRow ?? role;
    const nextAlias: WorkflowAlias = {
      key: keyFor(row.employeeId, row.type, phase, year),
      employeeId: normalizeEmployeeId(row.employeeId),
      module: row.type,
      phase,
      year,
      submittedDate: row.submittedDate,
      role,
      stage,
    };
    const prev = aliases[row.no];
    if (
      !prev ||
      prev.key !== nextAlias.key ||
      prev.submittedDate !== nextAlias.submittedDate ||
      prev.role !== nextAlias.role ||
      prev.stage !== nextAlias.stage
    ) {
      changed = true;
    }
    aliases[row.no] = nextAlias;
  }
  if (changed) {
    localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
  }
}
function write(record: WorkflowRecord) {
  const nextRecords = [...loadWorkflowRecords().filter((item) => item.key !== record.key), record];
  localStorage.setItem(KEY, JSON.stringify(nextRecords));
  window.dispatchEvent(new Event("appraisal-updated"));
  const latestStatus =
    record.decisions.validator?.status ??
    record.decisions.approver2?.status ??
    record.decisions.approver1?.status ??
    record.decisions.checker?.status ??
    "Pending";
  savePersistedState(KEY, nextRecords, {
    kind: "workflow-document",
    doc: {
      key: record.key,
      employeeId: record.employeeId,
      module: record.module,
      phase: record.phase,
      year: record.year,
      status: latestStatus,
      version: Object.keys(record.decisions).length + 1,
      payload: record,
    },
    audit: {
      userId: record.employeeId,
      userName: record.employeeId,
      role: "Approver",
      action: latestStatus,
      module: record.module,
      subModule: record.phase === "setting" ? "PA Setting" : "PA Measurement",
      description: `${record.module} (${record.phase}) for ${record.employeeId} updated to ${latestStatus}`,
    },
  });
}
export function submitWorkflowModule(
  module: string,
  phase: WorkflowRecord["phase"] = "measurement",
  date = formatTodayDDMMYYYY(),
  employeeId = getActiveUser().employeeId || MOCK_EMPLOYEE_ID,
) {
  const normalizedDate = normalizeDateDDMMYYYY(date);
  const effectiveDate = normalizedDate === "—" ? formatTodayDDMMYYYY() : normalizedDate;
  const key = keyFor(employeeId, module, phase);
  const bypassChecker =
    (module === "KPI" || module === "SMART Goals" || module === "RCA") &&
    shouldBypassCheckerForSubmission(employeeId);
  const existing = loadWorkflowRecords().find((item) => item.key === key);
  const initialDecisions: WorkflowRecord["decisions"] = bypassChecker
    ? {
        checker: { status: "Bypassed", date: effectiveDate },
      }
    : {};
  write({
    key,
    employeeId: normalizeEmployeeId(employeeId),
    module,
    phase,
    year: "2026",
    submittedDate: effectiveDate,
    decisions: initialDecisions,
    assessments: {},
    revisionHistory: existing?.revisionHistory ?? [],
  });
  triggerApprovalTransactionNotification({
    employeeId: normalizeEmployeeId(employeeId),
    moduleName: `${module} (${phase === "setting" ? "Setting" : "Measurement"})`,
    rawStatus: "Submitted",
    approverName: getActiveUser().name,
  });
}
export function saveWorkflowDecision(no: string, status: string, date: string, note?: string) {
  const alias = workflowAlias(no);
  if (!alias) return;
  const activeUser = getActiveUser();
  const existing = loadWorkflowRecords().find((item) => item.key === alias.key);
  const record: WorkflowRecord = existing ?? { ...alias, decisions: {}, assessments: {}, revisionHistory: [] };
  const isFourStep = alias.module === "KPI" || alias.module === "SMART Goals" || alias.module === "RCA";
  const effectiveDate = date && date !== "-" ? normalizeDateDDMMYYYY(date) : "-";
  const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(alias.employeeId);
  const checkerDone = Boolean(
    bypassCheck ||
      (record.decisions.checker && record.decisions.checker.status !== "Revision"),
  );

  let effectiveStage: WorkflowStageRole = alias.stage ?? alias.role;
  if (isFourStep) {
    if (
      (activeUser.role === "HR Unit" || activeUser.isHrUnitChecker) &&
      !checkerDone &&
      alias.stage !== "approver2" &&
      alias.stage !== "validator"
    ) {
      effectiveStage = "checker";
    } else if (
      (isAdminOrHrIcfRole(activeUser.role) || activeUser.isHrIcfValidator) &&
      alias.stage === "validator"
    ) {
      effectiveStage = "validator";
    }
  }

  const decisions: WorkflowRecord["decisions"] = { ...record.decisions };
  const assessments = { ...record.assessments };
  let notifStatus = status;
  let notifRole: string = effectiveStage;

  if (isFourStep && effectiveStage === "checker") {
    const chkStatus = status === "Revision" ? "Revision" : "Checked";
    decisions.checker = {
      status: chkStatus,
      date: effectiveDate,
      note,
      approverName: activeUser.name,
    };
    delete decisions.approver1;
    delete decisions.approver2;
    delete decisions.validator;
    notifStatus = chkStatus;
    notifRole = "checker";
  } else if (effectiveStage === "approver1") {
    const a1Status = status === "Revision" ? "Revision" : status === "Checked" ? "Assessed-Approver 1" : status;
    decisions.approver1 = {
      status: a1Status,
      date: effectiveDate,
      note,
      approverName: activeUser.name,
    };
    delete decisions.approver2;
    delete decisions.validator;
    delete assessments.approver2;
    notifStatus = a1Status;
    notifRole = "approver1";
  } else if (isFourStep && effectiveStage === "approver2") {
    const isAlsoValidator = Boolean(isAdminOrHrIcfRole(activeUser.role) || activeUser.isHrIcfValidator);
    const a2Status =
      status === "Revision"
        ? "Revision"
        : status === "Validated" && !isAlsoValidator
        ? "Assessed-Approver 2"
        : status;
    decisions.approver2 = {
      status: a2Status,
      date: effectiveDate,
      note,
      approverName: activeUser.name,
    };
    if (status === "Revision") {
      delete decisions.validator;
    } else if (isAlsoValidator) {
      decisions.validator = {
        status: "Validated",
        date: effectiveDate,
        note,
        approverName: activeUser.name,
      };
    } else {
      delete decisions.validator;
    }
    notifStatus = isAlsoValidator && status !== "Revision" ? "Validated" : a2Status;
    notifRole = "approver2";
  } else if (isFourStep && effectiveStage === "validator") {
    const valStatus = status === "Revision" ? "Revision" : "Validated";
    decisions.validator = {
      status: valStatus,
      date: effectiveDate,
      note,
      approverName: activeUser.name,
    };
    notifStatus = valStatus;
    notifRole = "validator";
  } else {
    decisions.approver2 = {
      status,
      date: effectiveDate,
      note,
      approverName: activeUser.name,
    };
    notifStatus = status;
    notifRole = "approver2";
  }

  const revisionHistory = [...(record.revisionHistory ?? [])];
  if (status === "Revision" && note?.trim()) {
    const roleLabel =
      effectiveStage === "checker"
        ? "HR Unit Checker"
        : effectiveStage === "validator"
        ? "HR ICF Validator"
        : effectiveStage === "approver2"
        ? "Approver 2"
        : "Approver 1";
    revisionHistory.push({
      role: roleLabel,
      approverName: activeUser.name || roleLabel,
      note: note.trim(),
      date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
    });
  }
  write({ ...record, decisions, assessments, revisionHistory });
  triggerApprovalTransactionNotification({
    employeeId: alias.employeeId,
    moduleName: `${alias.module} (${alias.phase === "setting" ? "Setting" : "Measurement"})`,
    rawStatus: notifStatus,
    approverRole: notifRole,
    approverName: activeUser.name,
  });
}
export function saveWorkflowAssessment(no: string, role: ReviewerRole, ratings: Record<string, number>, comments: Record<string, string>, date: string) {
  const alias = workflowAlias(no);
  if (!alias) return;
  const record = loadWorkflowRecords().find((item) => item.key === alias.key) ?? { ...alias, decisions: {}, assessments: {} };
  write({ ...record, assessments: { ...record.assessments, [role]: { ratings, comments, date } } });
}
export function workflowRowStatus(row: ApprovalRow, role: ReviewerRole): Partial<ApprovalRow> | null {
  const alias = workflowAlias(row.no);
  const record = alias && loadWorkflowRecords().find((item) => item.key === alias.key);
  if (!record) return null;
  const isFourStep = record.module === "KPI" || record.module === "SMART Goals" || record.module === "RCA";
  const stage: WorkflowStageRole = row.workflowStageForRow ?? alias?.stage ?? role;

  if (isFourStep) {
    const bypassCheck = shouldBypassCheckerForSubmission(record.employeeId);
    const chk = record.decisions.checker;
    const a1 = record.decisions.approver1;
    const a2 = record.decisions.approver2;
    const val = record.decisions.validator;

    const isRev =
      chk?.status === "Revision" ||
      a1?.status === "Revision" ||
      a2?.status === "Revision" ||
      val?.status === "Revision";

    const checkerDone = Boolean(bypassCheck || (chk && chk.status !== "Revision"));
    const a1Done = Boolean(a1 && (a1.status === "Approved" || a1.status.startsWith("Assessed") || a1.status === "Validated"));
    const a2Done = Boolean(a2 && (a2.status === "Approved" || a2.status.startsWith("Assessed") || a2.status === "Validated"));
    const validatorDone = Boolean(val?.status === "Validated" || a2?.status === "Validated");

    if (validatorDone) {
      return {
        status: "Validated",
        submittedDate: record.submittedDate,
        approvalDate: val?.date || a2?.date || a1?.date || chk?.date || "-",
      };
    }

    if (isRev) {
      return {
        status: "Revision",
        submittedDate: record.submittedDate,
        approvalDate: "-",
      };
    }

    if (!checkerDone) {
      if (stage === "checker") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting HR Unit Check", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (!a1Done) {
      if (stage === "checker") {
        return {
          status: "Pending-Approver 1",
          submittedDate: record.submittedDate,
          approvalDate: chk?.date || "-",
        };
      }
      if (stage === "approver1") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting Approver 1", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (!a2Done) {
      if (stage === "checker" || stage === "approver1") {
        return {
          status: "Pending-Approver 2",
          submittedDate: record.submittedDate,
          approvalDate: a1?.date || chk?.date || "-",
        };
      }
      if (stage === "approver2") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting Approver 2", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (stage === "validator") {
      return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
    }
    return {
      status: "Pending-Validate",
      submittedDate: record.submittedDate,
      approvalDate: a2?.date || a1?.date || chk?.date || "-",
    };
  }

  const own = record.decisions[role];
  const first = record.decisions.approver1;
  const second = record.decisions.approver2;
  const ready = first && (first.status === "Approved" || first.status.startsWith("Assessed") || first.status === "Validated");
  const a2Completed =
    second &&
    (second.status === "Approved" ||
      second.status.startsWith("Assessed") ||
      second.status === "Validated");

  // Jika Approver 2 sudah menyelesaikan penilaian/approval, maka di Approver 1 juga harus terupdate (tidak lagi Pending-Approver 2)
  if (a2Completed) {
    const finalStatus =
      record.module === "Project" || record.module === "Inter-Department Feedback"
        ? "Approved"
        : second.status;
    return {
      status: finalStatus,
      submittedDate: record.submittedDate,
      approvalDate: second.date || own?.date || "-",
    };
  }
  if (second?.status === "Revision") {
    return {
      status: "Revision",
      submittedDate: record.submittedDate,
      approvalDate: "-",
    };
  }

  const status = own?.status ?? (role === "approver2" && !ready ? "Awaiting Approver 1" : "Pending");
  return { status, submittedDate: record.submittedDate, approvalDate: own?.date ?? "-" };
}

export type LiveApprovalStepStatus = "completed" | "in_progress" | "pending";
export interface LiveApprovalStep {
  label: string;
  description: string;
  status: LiveApprovalStepStatus;
}
export interface LiveModuleApprovalData {
  module: string;
  overallStatus: "Approved" | "Pending" | "In Progress";
  steps: LiveApprovalStep[];
}

export function getLiveUserModuleApprovals(includeManagerial = false): LiveModuleApprovalData[] {
  const activeUser = getActiveUser();
  const allowed = resolveUserAllowedModules(activeUser);
  const normId = normalizeEmployeeId(activeUser.employeeId);
  const records = loadWorkflowRecords().filter(
    (r) => r.year === "2026" && (r.employeeId === normId || r.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase()),
  );
  const bypassCheck = shouldBypassCheckerForSubmission(activeUser.employeeId);

  const buildFourStep = (modLabel: string, modKey: string, phase: "setting" | "measurement"): LiveModuleApprovalData => {
    const rec = records.find((r) => r.module === modKey && r.phase === phase);
    if (!rec) {
      return {
        module: modLabel,
        overallStatus: "Pending",
        steps: [
          { label: "Check", description: "Submission reviewed by HR Unit Usaha", status: "pending" },
          { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: "pending" },
          { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: "pending" },
          { label: "Validate", description: "Final validation by HR ICF", status: "pending" },
        ],
      };
    }
    const a1Done = Boolean(rec.decisions.approver1 && (rec.decisions.approver1.status === "Approved" || rec.decisions.approver1.status.startsWith("Assessed") || rec.decisions.approver1.status === "Validated"));
    const a2Done = Boolean(rec.decisions.approver2 && (rec.decisions.approver2.status === "Approved" || rec.decisions.approver2.status.startsWith("Assessed") || rec.decisions.approver2.status === "Validated"));
    const valDone = Boolean(rec.decisions.validator?.status === "Validated" || rec.decisions.approver2?.status === "Validated");
    const checkDone = Boolean(bypassCheck || a1Done || a2Done || (rec.decisions.checker && rec.decisions.checker.status !== "Revision"));
    const overallStatus = valDone ? "Approved" : "In Progress";
    return {
      module: modLabel,
      overallStatus,
      steps: [
        { label: "Check", description: bypassCheck ? "Auto-bypassed (Self HR Unit)" : "Submission reviewed by HR Unit Usaha", status: checkDone ? "completed" : "in_progress" },
        { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: a1Done ? "completed" : checkDone ? "in_progress" : "pending" },
        { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: a2Done ? "completed" : a1Done ? "in_progress" : "pending" },
        { label: "Validate", description: "Final validation by HR ICF", status: valDone ? "completed" : a2Done ? "in_progress" : "pending" },
      ],
    };
  };

  const buildTwoStep = (modLabel: string, modKey: string): LiveModuleApprovalData => {
    const rec = records.find((r) => r.module === modKey && r.phase === "measurement");
    if (!rec) {
      return {
        module: modLabel,
        overallStatus: "Pending",
        steps: [
          { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: "pending" },
          { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: "pending" },
        ],
      };
    }
    const a1Done = Boolean(rec.decisions.approver1 && (rec.decisions.approver1.status === "Approved" || rec.decisions.approver1.status.startsWith("Assessed")));
    const a2Done = Boolean(rec.decisions.approver2 && (rec.decisions.approver2.status === "Approved" || rec.decisions.approver2.status.startsWith("Assessed")));
    return {
      module: modLabel,
      overallStatus: a2Done ? "Approved" : "In Progress",
      steps: [
        { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: a1Done ? "completed" : "in_progress" },
        { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: a2Done ? "completed" : a1Done ? "in_progress" : "pending" },
      ],
    };
  };

  const list: LiveModuleApprovalData[] = [];
  if (allowed.includes("KPI (Setting/Measurement)")) {
    list.push(buildFourStep("KPI (Setting)", "KPI", "setting"));
  }
  if (allowed.includes("SMART Goals (Setting/Measurement)")) {
    list.push(buildFourStep("SMART Goals (Setting)", "SMART Goals", "setting"));
  }
  if (allowed.includes("KPI (Setting/Measurement)")) {
    list.push(buildFourStep("KPI (Tracking)", "KPI", "measurement"));
  }
  if (allowed.includes("SMART Goals (Setting/Measurement)")) {
    list.push(buildFourStep("SMART Goals (Tracking)", "SMART Goals", "measurement"));
  }
  if (allowed.includes("Appraisals Form")) {
    list.push(buildTwoStep("Appraisal Form", "Appraisal Form"));
  }
  if (allowed.includes("Project Outside Job Scope")) {
    list.push(buildTwoStep("Project OJS", "Project"));
  }
  if (includeManagerial && allowed.includes("Managerial Skill")) {
    list.push(buildTwoStep("Managerial Skill", "Managerial Skill"));
  }
  return list;
}
