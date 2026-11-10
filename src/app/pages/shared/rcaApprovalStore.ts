import { savePersistedState } from "../../services/supabaseClient";

const KEY = "rca_approval_decisions_v1";

export interface RCAApprovalDecision {
  approverName: string;
  approverRole: string;
  approverLevel: number;
  status: string;
  comment: string;
  reviewedDate: string;
}

export function saveRCAApprovalDecision(decision: RCAApprovalDecision): void {
  try {
    const current = loadRCAApprovalDecisions();
    const idx = current.findIndex((d) => d.approverLevel === decision.approverLevel);
    if (idx >= 0) { current[idx] = decision; } else { current.push(decision); }
    savePersistedState(KEY, current, {
      kind: "kv-state",
      stateKey: KEY,
      stateValue: current,
      audit: {
        action: decision.status === "Approved" ? "Approve" : "Reject",
        module: "KPI",
        subModule: "RCA Approval",
        description: `RCA decision (${decision.status}) by ${decision.approverName}`,
      },
    });
  } catch { /* ignore */ }
}

export function loadRCAApprovalDecisions(): RCAApprovalDecision[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RCAApprovalDecision[]) : [];
  } catch { return []; }
}
