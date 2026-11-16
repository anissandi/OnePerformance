import { deleteBackendRecordFromSupabase, savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId, submitWorkflowModule } from "./appraisalWorkflowStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";

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
  /** Target tahunan KPI (kolom Target pada baris KPI di KPI Tracking) */
  targetYearly?: string;
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

/** Status RCA yang sudah dibuat tetapi belum dikirim ke approver (menunggu Submit KPI Tracking bulan tsb). */
export const RCA_DRAFT_STATUS = "Draft";

/** Apakah bulan KPI Tracking tsb sudah diajukan/tervalidasi (sehingga RCA baru langsung masuk approval). */
function isKpiMonthAlreadySubmitted(employeeId: string, monthLabel: string): boolean {
  const normId = normalizeEmployeeId(employeeId);
  const rec = loadWorkflowRecords().find(
    (r) => r.module === "KPI" && r.phase === "measurement" && normalizeEmployeeId(r.employeeId) === normId,
  );
  if (!rec) return false;
  const isRevision = Object.values(rec.decisions).some((d) => d?.status === "Revision");
  if (isRevision) return false;
  return Boolean(rec.validatedMonths?.includes(monthLabel) || rec.submittedMonths?.includes(monthLabel));
}

/**
 * Simpan RCA. Secara default RCA disimpan sebagai Draft (tag RCA menjadi kuning) dan baru dikirim ke approver
 * bersama Submit KPI Tracking bulan tsb. Jika bulan KPI tsb sudah diajukan, RCA langsung masuk alur approval.
 */
export function saveRCASubmission(row: StoredRCASubmission, opts: { submitNow?: boolean } = {}): void {
  const activeUser = getActiveUser();
  const empId = row.employeeId && row.employeeId !== "EMP002" ? row.employeeId : activeUser.employeeId;
  const normEmpId = normalizeEmployeeId(empId);
  const effectiveDate = normalizeDateDDMMYYYY(row.submittedDate);
  const finalDate = effectiveDate === "—" ? formatTodayDDMMYYYY() : effectiveDate;
  const submitNow = opts.submitNow ?? isKpiMonthAlreadySubmitted(empId, row.monthLabel);
  row = {
    ...row,
    employeeId: normEmpId,
    submittedDate: finalDate,
    approvalStatus: submitNow ? row.approvalStatus || "Pending-Check" : RCA_DRAFT_STATUS,
  };
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
  if (submitNow) {
    submitWorkflowModule("RCA", "measurement", finalDate, empId, [row.monthLabel]);
  }
}

/**
 * Dipanggil saat Submit KPI Tracking: seluruh RCA Draft/Revisi pada bulan yang diajukan ikut terkirim ke approver
 * (Checker → Approver 1 → Approver 2 → Validator). Mengembalikan jumlah RCA yang diajukan.
 */
export function submitRCAsForMonths(employeeId: string, monthLabels: string[]): number {
  const normEmpId = normalizeEmployeeId(employeeId);
  const months = new Set(monthLabels);
  const all = loadAll();
  let count = 0;
  const today = formatTodayDDMMYYYY();
  const next = all.map((r) => {
    const owned = !r.employeeId || normalizeEmployeeId(r.employeeId) === normEmpId;
    if (!owned || !months.has(r.monthLabel)) return r;
    if (r.approvalStatus === "Closed" || r.approvalStatus === "Validated") return r;
    count++;
    return { ...r, employeeId: normEmpId, approvalStatus: "Pending-Check", submittedDate: today };
  });
  if (count > 0) {
    saveAll(next);
    submitWorkflowModule("RCA", "measurement", today, employeeId, monthLabels);
  }
  return count;
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
  const current = loadAll();
  const toDelete = current.filter((r) => r.id === id || r.key === id);
  saveAll(current.filter((r) => r.id !== id && r.key !== id));
  for (const item of toDelete) {
    void deleteBackendRecordFromSupabase("pa_rca_submissions", "doc_key", String(item.key ?? item.id));
  }
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
