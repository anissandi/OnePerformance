import { submitWorkflowModule, loadWorkflowRecords } from "./appraisalWorkflowStore";
const SELF_KEY     = "ms_self_ratings_v1";
const APPROVER_KEY = "ms_approver_ratings_v1";

// ─── Self-assessment ──────────────────────────────────────────────────────────

export interface MSSelfRatings {
  ratings: Record<number, number>; // item.no → score 1-5
  totalScore: number;
  submittedAt: string;
}

export function saveMSSelfRatings(data: MSSelfRatings): void {
  try { localStorage.setItem(SELF_KEY, JSON.stringify(data)); localStorage.removeItem(APPROVER_KEY); submitWorkflowModule("Managerial Skill"); } catch { /* ignore */ }
}

export function loadMSSelfRatings(): MSSelfRatings | null {
  try {
    const raw = localStorage.getItem(SELF_KEY);
    return raw ? (JSON.parse(raw) as MSSelfRatings) : null;
  } catch { return null; }
}

// ─── Approver assessment ──────────────────────────────────────────────────────

export interface MSApproverEntry {
  approverName: string;
  approverRole: string;
  approverLevel: number;
  ratings: Record<number, number>; // item.no → score 1-5
  totalScore: number;
  comment: string;
  reviewedDate: string;
}

export function saveMSApproverEntry(entry: MSApproverEntry): void {
  try {
    const current = loadAllMSApprovers();
    const idx = current.findIndex((e) => e.approverLevel === entry.approverLevel);
    if (idx >= 0) { current[idx] = entry; } else { current.push(entry); }
    localStorage.setItem(APPROVER_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
}

export function loadAllMSApprovers(): MSApproverEntry[] {
  try {
    const raw = localStorage.getItem(APPROVER_KEY);
    const entries: MSApproverEntry[] = raw ? JSON.parse(raw) : [];
    const record = loadWorkflowRecords().find((item) => item.employeeId === "EMP-002" && item.module === "Managerial Skill" && item.phase === "measurement" && item.year === "2026");
    return record ? entries.filter((entry) => !!record.assessments[entry.approverLevel === 1 ? "approver1" : "approver2"]) : entries;
  } catch { return []; }
}
