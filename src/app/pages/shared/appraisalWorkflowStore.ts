import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer";
import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser, resolveUserAllowedModules, shouldBypassCheckerForSubmission } from "../../store/authStore";
import { triggerApprovalTransactionNotification } from "../../store/notificationStore";

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
export interface WorkflowAlias { key: string; employeeId: string; module: string; phase: WorkflowRecord["phase"]; year: string; submittedDate: string; role: ReviewerRole }
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
    const nextAlias: WorkflowAlias = { key: keyFor(row.employeeId, row.type, phase, year), employeeId: normalizeEmployeeId(row.employeeId), module: row.type, phase, year, submittedDate: row.submittedDate, role };
    const prev = aliases[row.no];
    if (!prev || prev.key !== nextAlias.key || prev.submittedDate !== nextAlias.submittedDate || prev.role !== nextAlias.role) {
      changed = true;
    }
    aliases[row.no] = nextAlias;
  }
  localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
}
function write(record: WorkflowRecord) {
  const nextRecords = [...loadWorkflowRecords().filter((item) => item.key !== record.key), record];
  localStorage.setItem(KEY, JSON.stringify(nextRecords));
  window.dispatchEvent(new Event("appraisal-updated"));
  const latestStatus =
    record.decisions.approver2?.status ??
    record.decisions.approver1?.status ??
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
  date = new Date().toLocaleDateString("id-ID"),
  employeeId = getActiveUser().employeeId || MOCK_EMPLOYEE_ID,
) {
  const key = keyFor(employeeId, module, phase);
  const bypassChecker =
    (module === "KPI" || module === "SMART Goals") &&
    shouldBypassCheckerForSubmission(employeeId);
  const existing = loadWorkflowRecords().find((item) => item.key === key);
  const initialDecisions: WorkflowRecord["decisions"] = bypassChecker
    ? {
        checker: { status: "Bypassed", date },
      }
    : {};
  write({
    key,
    employeeId: normalizeEmployeeId(employeeId),
    module,
    phase,
    year: "2026",
    submittedDate: date,
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
  const isFourStep = alias.module === "KPI" || alias.module === "SMART Goals";
  const isHrUnitCheckerOnly =
    isFourStep &&
    (activeUser.role === "HR Unit" || activeUser.isHrUnitChecker) &&
    alias.role === "approver1" &&
    !record.decisions.checker;

  const decisions: WorkflowRecord["decisions"] = {
    ...record.decisions,
    ...(isHrUnitCheckerOnly
      ? { checker: { status: status === "Revision" ? "Revision" : "Checked", date, note, approverName: activeUser.name } }
      : {}),
    [alias.role]: {
      status:
        isFourStep && alias.role === "approver2" && (status === "Approved" || status.startsWith("Assessed"))
          ? "Validated"
          : status,
      date,
      note,
      approverName: activeUser.name,
    },
    ...(isFourStep && alias.role === "approver2" && (status === "Approved" || status.startsWith("Assessed") || status === "Validated")
      ? { validator: { status: "Validated", date, note, approverName: activeUser.name } }
      : {}),
  };
  const assessments = { ...record.assessments };
  if (alias.role === "approver1") {
    delete decisions.approver2;
    delete assessments.approver2;
  }
  const revisionHistory = [...(record.revisionHistory ?? [])];
  if (status === "Revision" && note?.trim()) {
    revisionHistory.push({
      role: alias.role === "approver2" ? "Approver 2" : "Approver 1",
      approverName: activeUser.name || (alias.role === "approver2" ? "Approver 2" : "Approver 1"),
      note: note.trim(),
      date: date !== "-" ? date : new Date().toLocaleDateString("id-ID"),
    });
  }
  write({ ...record, decisions, assessments, revisionHistory });
  triggerApprovalTransactionNotification({
    employeeId: alias.employeeId,
    moduleName: `${alias.module} (${alias.phase === "setting" ? "Setting" : "Measurement"})`,
    rawStatus: decisions[alias.role]?.status ?? status,
    approverRole: alias.role,
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
    const isFourStep = record.module === "KPI" || record.module === "SMART Goals";
    const finalStatus = isFourStep
      ? "Validated"
      : record.module === "Project" || record.module === "Inter-Department Feedback"
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
    const checkDone = Boolean(bypassCheck || a1Done || a2Done || (rec.decisions.checker && rec.decisions.checker.status !== "Revision"));
    const overallStatus = a2Done ? "Approved" : "In Progress";
    return {
      module: modLabel,
      overallStatus,
      steps: [
        { label: "Check", description: bypassCheck ? "Auto-bypassed (Self HR Unit)" : "Submission reviewed by HR Unit Usaha", status: checkDone ? "completed" : "in_progress" },
        { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: a1Done ? "completed" : checkDone ? "in_progress" : "pending" },
        { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: a2Done ? "completed" : a1Done ? "in_progress" : "pending" },
        { label: "Validate", description: "Final validation by HR ICF", status: a2Done ? "completed" : "pending" },
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
