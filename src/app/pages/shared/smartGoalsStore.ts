import type { SmartGoal } from "../employee/SMARTGoals";
import { normalizeEmployeeId, submitWorkflowModule } from "./appraisalWorkflowStore";
import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { formatTodayDDMMYYYY } from "../../utils/dateFormat";

const STORAGE_KEY = "sg_submitted_smart_goals";
const GOALS_BY_EMP_KEY = "sg_goals_by_emp_v2";
const CHECKIN_KEY = "sg_checkin_entries_v1";
const CHECKIN_BY_EMP_KEY = "sg_checkin_by_emp_v2";

export interface StoredSmartGoalEvidenceFile {
  name: string;
  size: number;
  type?: string;
  dataUrl?: string;
}

function readGoalsByEmpMap(): Record<string, SmartGoal[]> {
  try {
    const raw = localStorage.getItem(GOALS_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SmartGoal[]>) ?? {} : {};
  } catch {
    return {};
  }
}

function readCheckinByEmpMap(): Record<string, StoredCheckInEntry[]> {
  try {
    const raw = localStorage.getItem(CHECKIN_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredCheckInEntry[]>) ?? {} : {};
  } catch {
    return {};
  }
}

export function saveSubmittedGoals(
  goals: SmartGoal[],
  options?: { submitWorkflow?: boolean; employeeId?: string },
): void {
  try {
    const activeUser = getActiveUser();
    const empId = options?.employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(empId);
    const isFinalSubmit = options?.submitWorkflow ?? true;
    const map = readGoalsByEmpMap();
    map[normId] = goals;
    savePersistedState(GOALS_BY_EMP_KEY, map);
    savePersistedState(STORAGE_KEY, goals, {
      kind: "smart-goals",
      employeeId: empId,
      period: "2026",
      goals,
      checkinEntries: loadCheckInEntries(empId),
      approvalDecisions: loadApprovalDecisions(empId),
      status: isFinalSubmit ? "Submitted-Setting" : "Draft-Setting",
      ...(isFinalSubmit
        ? {
            audit: {
              action: "Create",
              module: "SMART Goals",
              subModule: "SMART Goals Setting",
              description: `Submitted ${goals.length} SMART Goals for approval by ${activeUser.name} (${empId})`,
            },
          }
        : {}),
    });
    if (isFinalSubmit) {
      submitWorkflowModule("SMART Goals", "setting", formatTodayDDMMYYYY(), empId);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadSubmittedGoals(employeeId?: string): SmartGoal[] | null {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const map = readGoalsByEmpMap();
    if (map[normId] && map[normId].length > 0) return map[normId];
    return null;
  } catch {
    return null;
  }
}

export function clearSubmittedGoals(employeeId?: string): void {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const map = readGoalsByEmpMap();
    delete map[normId];
    savePersistedState(GOALS_BY_EMP_KEY, map);
  } catch {
    // ignore
  }
}

// ─── Check-in entries persistence ─────────────────────────────────────────────

export interface StoredCheckInEntry {
  goalId: number;
  actual: string;
  achievement: string;
  kendala: string;
  rencanaLanjut: string;
  /** action plan id → status string */
  actionPlanStatuses: Record<number, string>;
  /** action plan id → progress percent (0-100) */
  actionPlanProgress: Record<number, number>;
  /** action plan id → kendala text */
  actionPlanKendala: Record<number, string>;
  /** action plan id → evidence files */
  actionPlanEvidence?: Record<number, StoredSmartGoalEvidenceFile[]>;
  targetAchievementStatus: string;
  alasanTidakTercapai: string;
  /** goal-level target vs actual evidence files */
  evidenceFiles?: StoredSmartGoalEvidenceFile[];
}

export function saveCheckInEntries(
  entries: StoredCheckInEntry[],
  options?: { submitWorkflow?: boolean; employeeId?: string },
): void {
  try {
    const activeUser = getActiveUser();
    const empId = options?.employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(empId);
    const isFinalSubmit = Boolean(options?.submitWorkflow);
    const map = readCheckinByEmpMap();
    map[normId] = entries;
    savePersistedState(CHECKIN_BY_EMP_KEY, map);
    savePersistedState(CHECKIN_KEY, entries, {
      kind: "smart-goals",
      employeeId: empId,
      period: "2026",
      goals: loadSubmittedGoals(empId) ?? [],
      checkinEntries: entries,
      approvalDecisions: loadApprovalDecisions(empId),
      status: isFinalSubmit ? "Submitted-Measurement" : "Draft-Measurement",
      ...(isFinalSubmit
        ? {
            audit: {
              action: "Update",
              module: "SMART Goals",
              subModule: "SMART Goals Measurement",
              description: `Submitted SMART Goals Measurement check-in (${entries.length} goals) by ${activeUser.name} (${empId})`,
            },
          }
        : {}),
    });
    // Hanya trigger workflow & notifikasi saat tombol Submit Measurement diklik (1x saja)
    if (isFinalSubmit) {
      saveApprovalDecisions(
        loadApprovalDecisions().filter(
          (decision) => normalizeEmployeeId(decision.employeeId) !== normId,
        ),
      );
      submitWorkflowModule("SMART Goals", "measurement", formatTodayDDMMYYYY(), empId);
    }
  } catch { /* ignore */ }
}

export function loadCheckInEntries(employeeId?: string): StoredCheckInEntry[] {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const map = readCheckinByEmpMap();
    return map[normId] ?? [];
  } catch {
    return [];
  }
}

// ─── Approval decisions persistence ───────────────────────────────────────────

const APPROVAL_KEY = "sg_approval_decisions_v1";

export type ApprovalDecisionStatus = "Pending Review" | "Approved" | "Needs Revision";

export interface StoredApprovalDecision {
  approverName: string;
  approverRole: string;
  approverLevel: number; // 1 = atasan langsung, 2 = HR/manager, etc.
  status: ApprovalDecisionStatus;
  feedback: string;
  score: string; // nilai/score (e.g. "85", "90")
  reviewedDate: string;
  employeeId: string;
}

export function saveApprovalDecisions(decisions: StoredApprovalDecision[]): void {
  try {
    savePersistedState(APPROVAL_KEY, decisions, {
      kind: "smart-goals",
      employeeId: "E002",
      period: "2026",
      goals: loadSubmittedGoals() ?? [],
      checkinEntries: loadCheckInEntries(),
      approvalDecisions: decisions,
      status: "Reviewed",
    });
  } catch { /* ignore */ }
}

export function loadApprovalDecisions(employeeId?: string): StoredApprovalDecision[] {
  try {
    const raw = localStorage.getItem(APPROVAL_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as StoredApprovalDecision[];
    if (!employeeId) return all;
    const normId = normalizeEmployeeId(employeeId);
    return all.filter((d) => normalizeEmployeeId(d.employeeId) === normId);
  } catch {
    return [];
  }
}

export function upsertApprovalDecision(decision: StoredApprovalDecision): void {
  const current = loadApprovalDecisions();
  const normId = normalizeEmployeeId(decision.employeeId);
  const idx = current.findIndex(
    (d) => normalizeEmployeeId(d.employeeId) === normId && d.approverLevel === decision.approverLevel
  );
  const normalizedDecision: StoredApprovalDecision = {
    ...decision,
    employeeId: normId,
  };
  if (idx >= 0) {
    current[idx] = normalizedDecision;
  } else {
    current.push(normalizedDecision);
  }
  saveApprovalDecisions(current);
}
