import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { normalizeEmployeeId, submitWorkflowModule } from "./appraisalWorkflowStore";

const KEY = "kpi_rca_submissions";
const DEMO_RCA_IDS = new Set(["o1", "o2", "o3", "c1", "c2", "r1", "r2", "r3", "r4", "r5"]);
const DEMO_RCA_KPIS = new Set([
  "Implementasi ERP System__Jan",
  "Training Completion Rate__Feb",
  "Recruitment Cycle Time__Mar",
  "Headcount Fulfilment__Jan",
  "Employee Retention Rate__Des",
]);

export interface StoredRCAActionPlan {
  id: string;
  action: string;
  targetDate: string;
  pic: string;
  status: string;
  keterangan: string[];
  output: string[];
  evidence: string[];
}

export interface StoredMasalahBlock {
  id: string;
  masalahUtama: string;
  kenapaA: string;
  kenapaB: string;
  kenapaC: string;
  actionPlans: StoredRCAActionPlan[];
}

export interface StoredRCASubmission {
  employeeId?: string;
  /** Unique key: kpiNo__monthId for KPIPage entries; kpiIndicator__periode for RCAPage entries */
  key: string;
  id: string;
  submittedDate: string; // "YYYY-MM-DD"
  /** Short month label, e.g. "Jan" */
  periode: string;
  /** Full label e.g. "Jan-26" */
  monthLabel: string;
  year: string;
  kpiIndicator: string;
  /** Tracks approval lifecycle; used by KPIPage tag color logic */
  approvalStatus?: string;
  targetMonthly: string;
  actual: string;
  achievementPct: number;
  satuan: string;
  baseline: string;
  /** Per-block data (preferred). Present for submissions created with per-block UI. */
  masalahBlocks?: StoredMasalahBlock[];
  /** Legacy flat fields — kept for backward compat with old submissions */
  masalahUtama: string[];
  kenapaA: string;
  kenapaB: string;
  kenapaC: string;
  actionPlans: StoredRCAActionPlan[];
}

function loadAll(): StoredRCASubmission[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const cleaned = (raw as StoredRCASubmission[]).filter(
      (r) => !DEMO_RCA_IDS.has(r.id) && !DEMO_RCA_KPIS.has(r.key),
    );
    if (cleaned.length !== raw.length) {
      localStorage.setItem(KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function saveAll(rows: StoredRCASubmission[]): void {
  try {
    const latest = rows[rows.length - 1];
    savePersistedState(KEY, rows, latest ? {
      kind: "rca-submission",
      submission: latest,
      audit: {
        action: "Update",
        module: "KPI",
        subModule: "RCA",
        description: `Saved RCA submission for "${latest.kpiIndicator}" (${latest.monthLabel})`,
      },
    } : undefined);
  } catch {
    // ignore
  }
}

export function saveRCASubmission(row: StoredRCASubmission): void {
  const activeUser = getActiveUser();
  const empId = row.employeeId && row.employeeId !== "EMP002" ? row.employeeId : activeUser.employeeId;
  const normEmpId = normalizeEmployeeId(empId);
  row = { ...row, employeeId: normEmpId };
  const all = loadAll();
  const idx = all.findIndex(
    (r) => r.key === row.key && (!r.employeeId || normalizeEmployeeId(r.employeeId) === normEmpId),
  );
  if (idx >= 0) {
    all[idx] = row;
  } else {
    all.push(row);
  }
  saveAll(all);
  submitWorkflowModule(
    "RCA",
    "measurement",
    row.submittedDate || new Date().toLocaleDateString("id-ID"),
    empId,
  );
}

export function loadRCASubmissions(employeeId?: string): StoredRCASubmission[] {
  const all = loadAll();
  const targetId = employeeId ?? getActiveUser().employeeId;
  if (!targetId) return all;
  const normId = normalizeEmployeeId(targetId);
  return all.filter(
    (r) => !r.employeeId || normalizeEmployeeId(r.employeeId) === normId || r.employeeId.toLowerCase() === targetId.toLowerCase(),
  );
}

export function deleteRCASubmission(id: string): void {
  saveAll(loadAll().filter((r) => r.id !== id && r.key !== id));
}

/** Update only masalahBlocks, actionPlans, and approvalStatus of an existing entry by key */
export function updateRCASubmissionStatus(
  key: string,
  patch: Pick<StoredRCASubmission, "masalahBlocks" | "actionPlans" | "approvalStatus">
): void {
  const all = loadAll();
  const idx = all.findIndex((r) => r.key === key);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
    saveAll(all);
  }
}
