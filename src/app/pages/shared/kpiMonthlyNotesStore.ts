import { savePersistedState } from "../../services/supabaseClient";

const KEY = "kpi_monthly_notes";

export interface MonthlyApproverNote {
  text: string;
  approverName: string;
  approverRole: string;
  date: string;
}

export interface MonthlyNoteEntry {
  approver1?: MonthlyApproverNote;
  approver2?: MonthlyApproverNote;
}

function loadAll(): Record<string, MonthlyNoteEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function loadMonthlyNotes(): Record<string, MonthlyNoteEntry> {
  return loadAll();
}

export function saveMonthlyNote(
  monthId: string,
  role: "approver1" | "approver2",
  text: string,
  approverName: string,
  approverRole: string,
): void {
  try {
    const all = loadAll();
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    all[monthId] = { ...all[monthId], [role]: { text, approverName, approverRole, date } };
    savePersistedState(KEY, all);
  } catch {
    // ignore
  }
}
