import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { normalizeEmployeeId } from "./appraisalWorkflowStore";

const KEY = "kpi_approval_comments";

export interface KPIApproverComment {
  text: string;
  date: string;
  approverLabel: string;
  approverName?: string;
  employeeId?: string;
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
  text: string,
  approverName?: string,
  employeeId?: string,
): void {
  try {
    const all = loadAll();
    const actorName = approverName || getActiveUser().name || (role === "approver1" ? "Approver 1" : "Approver 2");
    const label = role === "approver1" ? `Approver 1 (${actorName})` : `Approver 2 (${actorName})`;
    const _d = new Date(); const today = `${String(_d.getDate()).padStart(2,"0")}/${String(_d.getMonth()+1).padStart(2,"0")}/${_d.getFullYear()}`;
    const entry: KPIApproverComment = {
      text,
      date: today,
      approverLabel: label,
      approverName: actorName,
      employeeId: employeeId ? normalizeEmployeeId(employeeId) : undefined,
    };
    all[rowNo] = { ...all[rowNo], [role]: entry };
    if (employeeId) {
      const empKey = `EMP_KPI_${normalizeEmployeeId(employeeId)}`;
      all[empKey] = { ...all[empKey], [role]: entry };
    }
    savePersistedState(KEY, all);
  } catch {
    // ignore
  }
}

export function loadKPICommentsForEmployee(employeeId: string): KPIRowComments {
  const normId = normalizeEmployeeId(employeeId);
  const all = loadAll();
  const merged: KPIRowComments = {};
  for (const [k, val] of Object.entries(all)) {
    const matchesKey =
      k === `EMP_KPI_${normId}` ||
      k.includes(`-${normId}-KPI`) ||
      val.approver1?.employeeId === normId ||
      val.approver2?.employeeId === normId;
    if (!matchesKey) continue;
    if (val.approver1?.text) merged.approver1 = val.approver1;
    if (val.approver2?.text) merged.approver2 = val.approver2;
  }
  return merged;
}

export function loadAllKPIComments(): Record<string, KPIRowComments> {
  return loadAll();
}
