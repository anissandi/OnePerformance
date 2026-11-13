import type { ApprovalRow } from "../../components/ReviewDrawer";
import { registerWorkflowRows, workflowAlias, loadWorkflowRecords, saveWorkflowAssessment, saveWorkflowDecision, workflowRowStatus, normalizeEmployeeId } from "./appraisalWorkflowStore";
import { saveAppraisalApprover } from "./appraisalFormStore";
import { saveMSApproverEntry } from "./msStore";
import { upsertApprovalDecision } from "./smartGoalsStore";
import { savePersistedState } from "../../services/supabaseClient";
import {
  getActiveUser,
  loadManagedUsers,
  resolveReviewerRoleForTarget,
  shouldBypassCheckerForSubmission,
  type ManagedUser,
} from "../../store/authStore";

const KEY = "sg_approvals_overrides";

// ─── General Assessment Storage (all types, both approver roles) ─────────────

export interface StoredAssessment {
  rowNo: string;
  approverRole: "approver1" | "approver2";
  type: string;
  ratings: Record<string, number>;  // e.g. "sg-1"->85, "A-1"->4, "ms-1"->3
  comments: Record<string, string>; // "0" = global SG comment
  assessedDate: string;
}

const ASSESSMENT_KEY = "all_assessments_v2";

export function saveAssessment(
  rowNo: string,
  approverRole: "approver1" | "approver2",
  type: string,
  ratings: Record<string, number>,
  comments: Record<string, string>,
  assessedDate: string,
): void {
  try {
    const raw = localStorage.getItem(ASSESSMENT_KEY);
    const existing: StoredAssessment[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((a) => !(a.rowNo === rowNo && a.approverRole === approverRole));
    const nextList = [...filtered, { rowNo, approverRole, type, ratings, comments, assessedDate }];
    savePersistedState(ASSESSMENT_KEY, nextList);
    saveWorkflowAssessment(rowNo, approverRole, ratings, comments, assessedDate);
    const alias = workflowAlias(rowNo);
    if (alias && alias.phase === "measurement") {
      const level = approverRole === "approver1" ? 1 : 2;
      const activeUser = getActiveUser();
      const approverName = activeUser.name || (level === 1 ? "Approver 1" : "Approver 2");
      if (type === "Managerial Skill") {
        const values = Object.fromEntries(Object.entries(ratings).map(([key, value]) => [Number(key.replace("ms-", "")), value]));
        saveMSApproverEntry(
          {
            approverName,
            approverRole,
            approverLevel: level,
            ratings: values,
            totalScore: Object.values(values).reduce((sum, value) => sum + value, 0),
            comment: comments["0"] ?? "",
            reviewedDate: assessedDate,
          },
          alias.employeeId,
        );
      }
      if (type === "Appraisal Form") {
        const forms = (["A", "B", "C"] as const).map((formId) => {
          const entries = Object.entries(ratings).filter(([key]) => key.startsWith(`${formId}-`) || key.startsWith(`${formId}__`));
          return { formId, ratings: Object.fromEntries(entries.map(([key, value]) => [key.replace(`${formId}-`, `${formId}__`), value])), avgScore: entries.length ? entries.reduce((sum, [, value]) => sum + value, 0) / entries.length : 0 };
        });
        saveAppraisalApprover(
          {
            approverName,
            approverRole,
            approverLevel: level,
            forms,
            overallComment: comments["0"] ?? "",
            reviewedDate: assessedDate,
          },
          alias.employeeId,
        );
      }
    }
  } catch { /* ignore */ }
}

export function loadAssessment(rowNo: string, approverRole: "approver1" | "approver2"): StoredAssessment | null {
  const alias = workflowAlias(rowNo);
  const record = alias && loadWorkflowRecords().find((record) => record.key === alias.key);
  const shared = record?.assessments[approverRole];
  if (shared && alias) return { rowNo, approverRole, type: alias.module, ratings: shared.ratings, comments: shared.comments, assessedDate: shared.date };
  if (record) return null;
  try {
    const raw = localStorage.getItem(ASSESSMENT_KEY);
    if (!raw) return null;
    const list: StoredAssessment[] = JSON.parse(raw);
    return list.find((a) => a.rowNo === rowNo && a.approverRole === approverRole) ?? null;
  } catch {
    return null;
  }
}

// Legacy shim — keep saveSGAssessment so existing callers still compile
export function saveSGAssessment(rowNo: string, ratings: Record<string, number>, globalComment: string, assessedDate: string): void {
  saveAssessment(rowNo, "approver1", "SMART Goals", ratings, { "0": globalComment }, assessedDate);
}
export function loadSGAssessment(rowNo: string): { ratings: Record<string, number>; globalComment: string; assessedDate: string } | null {
  const a = loadAssessment(rowNo, "approver1");
  if (!a) return null;
  return { ratings: a.ratings, globalComment: a.comments["0"] ?? "", assessedDate: a.assessedDate };
}

// Persist per-row status overrides so approval decisions survive navigation.
interface Override {
  no: string;
  status: string;
  approvalDate: string;
}

export function loadOverrides(): Override[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Override[]) : [];
  } catch {
    return [];
  }
}

export function saveOverride(no: string, status: string, approvalDate: string): void {
  try {
    const existing = loadOverrides().filter((o) => o.no !== no);
    savePersistedState(KEY, [...existing, { no, status, approvalDate }]);
    saveWorkflowDecision(no, status, approvalDate);
    const alias = workflowAlias(no);
    if (alias && alias.module === "SMART Goals" && alias.phase === "measurement") {
      const assessment = loadAssessment(no, alias.role);
      const values = Object.values(assessment?.ratings ?? {});
      upsertApprovalDecision({ employeeId: alias.employeeId.replace(/-/g, ""), approverLevel: alias.role === "approver1" ? 1 : 2, approverName: alias.role === "approver1" ? "Supervisor" : "HR Admin", approverRole: alias.role, status: status === "Revision" ? "Needs Revision" : "Approved", feedback: assessment?.comments["0"] ?? "", score: values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : "", reviewedDate: approvalDate });
    }
  } catch {
    // ignore
  }
}

export function applyOverrides(
  rows: ApprovalRow[],
  role: "approver1" | "approver2" = "approver1",
  explicitPhase?: "setting" | "measurement",
): ApprovalRow[] {
  const phase = explicitPhase ?? (/^(?:H?ST)-/.test(rows[0]?.no ?? "") ? "setting" : "measurement");
  const isCleanTrial = localStorage.getItem("pa_trial_mode_clean_v1") === "true";
  const managedUsers = loadManagedUsers();
  const baseRows = isCleanTrial
    ? rows.filter((row) =>
        managedUsers.some(
          (u) =>
            normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(row.employeeId) ||
            u.name.toLowerCase() === row.name.toLowerCase(),
        ),
      )
    : rows;
  const expanded = [...baseRows];
  for (const record of loadWorkflowRecords()) {
    if (record.phase !== phase || record.year !== "2026") continue;
    // Jangan duplikasi modul Project & Inter-Department Feedback karena sudah di-generate oleh projectApprovalRows & feedbackApprovalRows
    if (record.module === "Project" || record.module === "Inter-Department Feedback") continue;
    if (expanded.some((row) => normalizeEmployeeId(row.employeeId) === record.employeeId && row.type === record.module)) continue;
    const existingRow = rows.find((row) => normalizeEmployeeId(row.employeeId) === record.employeeId);
    const managedUser = managedUsers.find(
      (u) => normalizeEmployeeId(u.employeeId) === record.employeeId || u.employeeId.toLowerCase() === record.employeeId.toLowerCase(),
    );
    const templateRow: ApprovalRow | null = existingRow
      ? existingRow
      : managedUser
      ? {
          no: `${role === "approver2" ? "H" : ""}${phase === "setting" ? "ST" : "CI"}-LIVE-${record.employeeId}-${record.module}`,
          employeeId: managedUser.employeeId,
          name: managedUser.name,
          position: managedUser.position,
          department: managedUser.department,
          division: managedUser.division,
          companyUnit: managedUser.company,
          type: record.module,
          submittedDate: record.submittedDate,
          approvalDate: "-",
          status: "Pending",
        }
      : null;
    if (!templateRow) continue;
    expanded.push({
      ...templateRow,
      no: `${role === "approver2" ? "H" : ""}${phase === "setting" ? "ST" : "CI"}-LIVE-${record.employeeId}-${record.module}`,
      type: record.module,
      submittedDate: record.submittedDate,
      status: "Pending",
      approvalDate: "-",
      editRequestReason: undefined,
      editRequestDate: undefined,
    });
  }
  rows = expanded;
  registerWorkflowRows(rows, role);
  const overrides = loadOverrides();
  return rows.map((r) => {
    const shared = workflowRowStatus(r, role);
    if (shared) return { ...r, ...shared };
    const ov = overrides.find((o) => o.no === r.no);
    return ov ? { ...r, status: ov.status, approvalDate: ov.approvalDate } : r;
  });
}

/**
 * Menyaring, mendeduplikasi, dan menentukan reviewerRole ("approver1" | "approver2") secara dinamis
 * untuk setiap baris transaksi approval sesuai hirarki Reg No AP1 & Reg No AP2 dari user yang sedang login.
 */
export function resolveDynamicApprovalRowsForUser(
  rawRows: ApprovalRow[],
  activeUser: ManagedUser,
  phase: "setting" | "measurement",
  allowedTypes: Set<string>,
  lockedUnits?: string[],
): ApprovalRow[] {
  const workflows = loadWorkflowRecords();
  const overrides = loadOverrides();
  const seenKeys = new Set<string>();
  const result: ApprovalRow[] = [];

  for (const row of rawRows) {
    if (!allowedTypes.has(row.type)) continue;
    if (lockedUnits && !lockedUnits.includes(row.companyUnit)) continue;

    const normEmpId = normalizeEmployeeId(row.employeeId);
    const dedupKey = `${normEmpId}:${phase}:${row.type}`;
    if (seenKeys.has(dedupKey)) continue;

    // Bagian XII Poin 2: HR Unit Checker bypass pengajuan KPI & SMART Goals miliknya sendiri
    if (
      (activeUser.role === "HR Unit" || activeUser.isHrUnitChecker) &&
      (row.type === "KPI" || row.type === "SMART Goals") &&
      (normEmpId === normalizeEmployeeId(activeUser.employeeId) ||
        row.name.trim().toLowerCase() === activeUser.name.trim().toLowerCase()) &&
      shouldBypassCheckerForSubmission(activeUser.employeeId)
    ) {
      continue;
    }

    const wfRec = workflows.find(
      (w) =>
        w.year === "2026" &&
        w.phase === phase &&
        w.module === row.type &&
        w.employeeId === normEmpId,
    );
    const a1Done = Boolean(
      wfRec?.decisions.approver1 &&
        (wfRec.decisions.approver1.status === "Approved" ||
          wfRec.decisions.approver1.status.startsWith("Assessed")),
    );

    const roleForRow = resolveReviewerRoleForTarget(
      activeUser,
      row.employeeId,
      a1Done,
      row.type,
    );
    // Jika user yang login bukan Approver 1, bukan Approver 2, bukan Checker/Validator berwenang untuk karyawan ini -> sembunyikan
    if (!roleForRow) continue;

    seenKeys.add(dedupKey);

    const prefix = `${roleForRow === "approver2" ? "H" : ""}${phase === "setting" ? "ST" : "CI"}`;
    const canonicalNo =
      row.type === "Inter-Department Feedback"
        ? row.no
        : `${prefix}-LIVE-${normEmpId}-${row.type}`;
    const rowWithCanonicalNo: ApprovalRow = {
      ...row,
      no: canonicalNo,
      reviewerRoleForRow: roleForRow,
    };

    registerWorkflowRows([rowWithCanonicalNo], roleForRow);
    const shared = workflowRowStatus(rowWithCanonicalNo, roleForRow);
    const ov = overrides.find((o) => o.no === canonicalNo);
    const resolvedRow: ApprovalRow = shared
      ? { ...rowWithCanonicalNo, ...shared, reviewerRoleForRow: roleForRow }
      : ov
      ? { ...rowWithCanonicalNo, status: ov.status, approvalDate: ov.approvalDate, reviewerRoleForRow: roleForRow }
      : rowWithCanonicalNo;

    result.push(resolvedRow);
  }

  return result;
}
