const KEY = "kpi_approval_comments";

export interface KPIApproverComment {
  text: string;
  date: string;
  approverLabel: string;
}

export interface KPIRowComments {
  approver1?: KPIApproverComment;
  approver2?: KPIApproverComment;
}

function loadAll(): Record<string, KPIRowComments> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function loadKPIComments(rowNo: string): KPIRowComments {
  return loadAll()[rowNo] ?? {};
}

export function saveKPIComment(
  rowNo: string,
  role: "approver1" | "approver2",
  text: string
): void {
  try {
    const all = loadAll();
    const label = role === "approver1" ? "Supervisor (Approver 1)" : "HR Admin (Approver 2)";
    const _d = new Date(); const today = `${String(_d.getDate()).padStart(2,"0")}/${String(_d.getMonth()+1).padStart(2,"0")}/${_d.getFullYear()}`;
    all[rowNo] = { ...all[rowNo], [role]: { text, date: today, approverLabel: label } };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function loadAllKPIComments(): Record<string, KPIRowComments> {
  return loadAll();
}
