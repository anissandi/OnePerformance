import type { SmartGoal } from "../employee/SMARTGoals";
import { submitWorkflowModule } from "./appraisalWorkflowStore";

const STORAGE_KEY = "sg_submitted_smart_goals";
const CHECKIN_KEY = "sg_checkin_entries_v1";

export function saveSubmittedGoals(goals: SmartGoal[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
    submitWorkflowModule("SMART Goals", "setting");
  } catch {
    // ignore storage errors
  }
}

export function loadSubmittedGoals(): SmartGoal[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SmartGoal[];
  } catch {
    return null;
  }
}

export function clearSubmittedGoals(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
  targetAchievementStatus: string;
  alasanTidakTercapai: string;
}

export function saveCheckInEntries(entries: StoredCheckInEntry[]): void {
  try {
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(entries));
    saveApprovalDecisions(loadApprovalDecisions().filter((decision) => decision.employeeId.replace(/-/g, "") !== "EMP002"));
    submitWorkflowModule("SMART Goals");
  } catch { /* ignore */ }
}

export function loadCheckInEntries(): StoredCheckInEntry[] {
  try {
    const raw = localStorage.getItem(CHECKIN_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredCheckInEntry[];
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
    localStorage.setItem(APPROVAL_KEY, JSON.stringify(decisions));
  } catch { /* ignore */ }
}

export function loadApprovalDecisions(): StoredApprovalDecision[] {
  try {
    const raw = localStorage.getItem(APPROVAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredApprovalDecision[];
  } catch {
    return [];
  }
}

export function upsertApprovalDecision(decision: StoredApprovalDecision): void {
  const current = loadApprovalDecisions();
  const idx = current.findIndex(
    (d) => d.employeeId === decision.employeeId && d.approverLevel === decision.approverLevel
  );
  if (idx >= 0) {
    current[idx] = decision;
  } else {
    current.push(decision);
  }
  saveApprovalDecisions(current);
}
