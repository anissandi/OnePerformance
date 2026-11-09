import { submitWorkflowModule, loadWorkflowRecords } from "./appraisalWorkflowStore";
const SELF_KEY     = "af_self_ratings_v1";
const APPROVER_KEY = "af_approver_ratings_v1";

// ─── Self-assessment ───────────────────────────────────────────────────────────

export interface StoredFormSelfEntry {
  formId: "A" | "B" | "C";
  ratings: Record<string, number>; // key = `${formId}__${no}`
  avgScore: number;
}

export interface StoredAppraisalSelf {
  forms: StoredFormSelfEntry[];
  submittedAt: string;
}

export function saveAppraisalSelf(data: StoredAppraisalSelf): void {
  try { localStorage.setItem(SELF_KEY, JSON.stringify(data)); localStorage.removeItem(APPROVER_KEY); submitWorkflowModule("Appraisal Form"); } catch { /* ignore */ }
}

export function loadAppraisalSelf(): StoredAppraisalSelf | null {
  try {
    const raw = localStorage.getItem(SELF_KEY);
    return raw ? (JSON.parse(raw) as StoredAppraisalSelf) : null;
  } catch { return null; }
}

// ─── Approver assessment ───────────────────────────────────────────────────────

export interface StoredAppraisalApproverEntry {
  approverName: string;
  approverRole: string;
  approverLevel: number;
  forms: StoredFormSelfEntry[]; // same shape, approver's ratings
  overallComment: string;
  reviewedDate: string;
}

export function saveAppraisalApprover(entry: StoredAppraisalApproverEntry): void {
  try {
    const current = loadAllAppraisalApprovers();
    const idx = current.findIndex(
      (e) => e.approverLevel === entry.approverLevel
    );
    if (idx >= 0) { current[idx] = entry; } else { current.push(entry); }
    localStorage.setItem(APPROVER_KEY, JSON.stringify(current));
  } catch { /* ignore */ }
}

export function loadAllAppraisalApprovers(): StoredAppraisalApproverEntry[] {
  try {
    const raw = localStorage.getItem(APPROVER_KEY);
    const entries: StoredAppraisalApproverEntry[] = raw ? JSON.parse(raw) : [];
    const record = loadWorkflowRecords().find((item) => item.employeeId === "EMP-002" && item.module === "Appraisal Form" && item.phase === "measurement" && item.year === "2026");
    return record ? entries.filter((entry) => !!record.assessments[entry.approverLevel === 1 ? "approver1" : "approver2"]) : entries;
  } catch { return []; }
}
