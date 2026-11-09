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
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch { /* ignore */ }
}

export function loadRCAApprovalDecisions(): RCAApprovalDecision[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RCAApprovalDecision[]) : [];
  } catch { return []; }
}
