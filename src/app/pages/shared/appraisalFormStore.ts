import { submitWorkflowModule, loadWorkflowRecords } from "./appraisalWorkflowStore";
import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
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
  try {
    const activeUser = getActiveUser();
    savePersistedState(APPROVER_KEY, []);
    savePersistedState(SELF_KEY, data, {
      kind: "appraisal-form",
      employeeId: activeUser.employeeId,
      period: "2026",
      selfRatings: data,
      approverRatings: [],
      status: "Submitted",
      audit: {
        action: "Create",
        module: "Performance Appraisal",
        subModule: "Appraisal Form",
        description: `Submitted Appraisal Form Self-Assessment (Form A, B, C) by ${activeUser.name} (${activeUser.employeeId})`,
      },
    });
    submitWorkflowModule("Appraisal Form", "measurement", new Date().toLocaleDateString("id-ID"), activeUser.employeeId);
  } catch { /* ignore */ }
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
    savePersistedState(APPROVER_KEY, current, {
      kind: "appraisal-form",
      employeeId: "E002",
      period: "2026",
      selfRatings: loadAppraisalSelf(),
      approverRatings: current,
      status: `Assessed-Approver ${entry.approverLevel}`,
    });
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
