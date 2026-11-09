import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer";
import { syncToSupabase } from "../../services/supabaseClient";

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
  decisions: Partial<Record<ReviewerRole, { status: string; date: string }>>;
  assessments: Partial<Record<ReviewerRole, { ratings: Record<string, number>; comments: Record<string, string>; date: string }>>;
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
  for (const row of rows) {
    const phase = /^(?:H?ST)-/.test(row.no) ? "setting" : "measurement";
    const year = row.period?.match(/20\d{2}/)?.[0] ?? "2026";
    aliases[row.no] = { key: keyFor(row.employeeId, row.type, phase, year), employeeId: normalizeEmployeeId(row.employeeId), module: row.type, phase, year, submittedDate: row.submittedDate, role };
  }
  localStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
}
function write(record: WorkflowRecord) {
  localStorage.setItem(KEY, JSON.stringify([...loadWorkflowRecords().filter((item) => item.key !== record.key), record]));
  window.dispatchEvent(new Event("appraisal-updated"));
  const latestStatus =
    record.decisions.approver2?.status ??
    record.decisions.approver1?.status ??
    "Pending";
  void syncToSupabase({
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
export function submitWorkflowModule(module: string, phase: WorkflowRecord["phase"] = "measurement", date = new Date().toLocaleDateString("id-ID"), employeeId = MOCK_EMPLOYEE_ID) {
  const key = keyFor(employeeId, module, phase);
  write({ key, employeeId: normalizeEmployeeId(employeeId), module, phase, year: "2026", submittedDate: date, decisions: {}, assessments: {} });
}
export function saveWorkflowDecision(no: string, status: string, date: string) {
  const alias = workflowAlias(no);
  if (!alias) return;
  const existing = loadWorkflowRecords().find((item) => item.key === alias.key);
  const record: WorkflowRecord = existing ?? { ...alias, decisions: {}, assessments: {} };
  const decisions = { ...record.decisions, [alias.role]: { status, date } };
  const assessments = { ...record.assessments };
  if (alias.role === "approver1") {
    delete decisions.approver2;
    delete assessments.approver2;
  }
  write({ ...record, decisions, assessments });
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
  const ready = first && (first.status === "Approved" || first.status.startsWith("Assessed"));
  const status = own?.status ?? (role === "approver2" && !ready ? "Awaiting Approver 1" : "Pending");
  return { status, submittedDate: record.submittedDate, approvalDate: own?.date ?? "-" };
}
