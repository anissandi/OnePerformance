const KEY = "kpi_rca_submissions";

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
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveAll(rows: StoredRCASubmission[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // ignore
  }
}

export function saveRCASubmission(row: StoredRCASubmission): void {
  row = { ...row, employeeId: row.employeeId ?? "EMP002" };
  const all = loadAll();
  const idx = all.findIndex((r) => r.key === row.key);
  if (idx >= 0) {
    all[idx] = row;
  } else {
    all.push(row);
  }
  saveAll(all);
}

export function loadRCASubmissions(): StoredRCASubmission[] {
  return loadAll();
}

export function deleteRCASubmission(id: string): void {
  saveAll(loadAll().filter((r) => r.id !== id));
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
