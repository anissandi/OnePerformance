import { deleteBackendRecordFromSupabase, safeGetLocalRaw, safeSetLocalJson, savePersistedState, syncToSupabase } from "../../services/supabaseClient";
import { getActiveUser, loadManagedUsers } from "../../store/authStore";
import { pushEmployeeNotification } from "../../store/notificationStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "./appraisalWorkflowStore";
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
  /** Waktu terakhir owner menekan Confirm RCA (update progress tanpa request approval) */
  confirmedAt?: string;
  confirmedBy?: string;
}

let _cachedRcaRaw: string | null | undefined = undefined;
let _cachedRcaAll: StoredRCASubmission[] = [];
let _cachedRcaByNormEmp = new Map<string, StoredRCASubmission[]>();

function loadAll(): StoredRCASubmission[] {
  try {
    const rawStr = safeGetLocalRaw(KEY);
    if (_cachedRcaRaw === rawStr) {
      return _cachedRcaAll;
    }
    const raw = JSON.parse(rawStr ?? "[]");
    if (!Array.isArray(raw)) return [];
    const cleaned = (raw as StoredRCASubmission[]).filter(
      (r) => !DEMO_RCA_IDS.has(r.id) && !DEMO_RCA_KPIS.has(r.key),
    );
    if (cleaned.length !== raw.length) {
      safeSetLocalJson(KEY, cleaned);
    }
    const byEmp = new Map<string, StoredRCASubmission[]>();
    for (const r of cleaned) {
      if (!r?.employeeId) continue;
      const nk = normalizeEmployeeId(r.employeeId);
      if (nk) {
        const list = byEmp.get(nk);
        if (list) list.push(r);
        else byEmp.set(nk, [r]);
      }
    }
    _cachedRcaRaw = safeGetLocalRaw(KEY);
    _cachedRcaAll = cleaned;
    _cachedRcaByNormEmp = byEmp;
    return cleaned;
  } catch {
    return [];
  }
}

function isAllActionPlansCompleted(sub: Pick<StoredRCASubmission, "masalahBlocks" | "actionPlans">): boolean {
  const aps = sub.masalahBlocks && sub.masalahBlocks.length > 0
    ? sub.masalahBlocks.flatMap((b) => b.actionPlans)
    : sub.actionPlans ?? [];
  const active = aps.filter((ap) => ap.status !== "Dibatalkan");
  return active.length > 0 && active.every((ap) => ap.status === "Selesai");
}

function saveAll(rows: StoredRCASubmission[], changedSubmission?: StoredRCASubmission): void {
  try {
    const latest = changedSubmission ?? rows[rows.length - 1];
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
  const autoClosed = isAllActionPlansCompleted(row);
  row = {
    ...row,
    employeeId: normEmpId,
    submittedDate: finalDate,
    approvalStatus: autoClosed
      ? "Closed"
      : submitNow
      ? row.approvalStatus && row.approvalStatus !== RCA_DRAFT_STATUS
        ? row.approvalStatus
        : "Pending-Check"
      : RCA_DRAFT_STATUS,
  };
  const all = loadAll();
  const idx = all.findIndex(
    (r) => r.key === row.key && normalizeEmployeeId(r.employeeId ?? "") === normEmpId,
  );
  if (idx >= 0) {
    all[idx] = row;
  } else {
    all.push(row);
  }
  saveAll(all, row);
  window.dispatchEvent(new Event("appraisal-updated"));
}

/**
 * Dipanggil saat Submit KPI Tracking: seluruh RCA Draft/Revisi pada bulan yang diajukan ikut terkirim ke approver
 * menyatu dengan KPI Tracking bulanan (Checker → Approver 1 → Approver 2 → Validator).
 */
export function submitRCAsForMonths(employeeId: string, monthLabels: string[]): number {
  const normEmpId = normalizeEmployeeId(employeeId);
  const months = new Set(monthLabels);
  const all = loadAll();
  let count = 0;
  const modifiedRows: StoredRCASubmission[] = [];
  const today = formatTodayDDMMYYYY();
  const next = all.map((r) => {
    const owned = Boolean(r.employeeId) && normalizeEmployeeId(r.employeeId ?? "") === normEmpId;
    if (!owned || !months.has(r.monthLabel)) return r;
    if (isAllActionPlansCompleted(r)) {
      const closedRow = { ...r, employeeId: normEmpId, approvalStatus: "Closed", submittedDate: today };
      modifiedRows.push(closedRow);
      count++;
      return closedRow;
    }
    if (r.approvalStatus === "Closed" || r.approvalStatus === "Validated") return r;
    count++;
    const updatedRow = { ...r, employeeId: normEmpId, approvalStatus: "Pending-Check", submittedDate: today };
    modifiedRows.push(updatedRow);
    return updatedRow;
  });
  if (count > 0) {
    saveAll(next, modifiedRows[modifiedRows.length - 1]);
    for (let i = 0; i < modifiedRows.length - 1; i++) {
      void syncToSupabase({ kind: "rca-submission", submission: modifiedRows[i] });
    }
    window.dispatchEvent(new Event("appraisal-updated"));
  }
  return count;
}

export function loadRCASubmissions(employeeId?: string): StoredRCASubmission[] {
  const all = loadAll();
  const targetId = employeeId ?? getActiveUser().employeeId;
  if (!targetId) return all;
  const normId = normalizeEmployeeId(targetId);
  return _cachedRcaByNormEmp.get(normId) ?? [];
}

export function deleteRCASubmission(id: string): void {
  const current = loadAll();
  const toDelete = current.filter((r) => r.id === id || r.key === id);
  saveAll(current.filter((r) => r.id !== id && r.key !== id));
  for (const item of toDelete) {
    const rawKey = String(item.key ?? item.id);
    void deleteBackendRecordFromSupabase("pa_rca_submissions", "doc_key", rawKey);
    if (item.employeeId) {
      void deleteBackendRecordFromSupabase("pa_rca_submissions", "doc_key", `${item.employeeId}::${rawKey}`);
    }
  }
}

/** Update only masalahBlocks, actionPlans, and approvalStatus of an existing entry by key */
export function updateRCASubmissionStatus(
  key: string,
  patch: Pick<StoredRCASubmission, "masalahBlocks" | "actionPlans" | "approvalStatus">
): void {
  const all = loadAll();
  const idx = all.findIndex((r) => r.key === key || r.id === key);
  if (idx >= 0) {
    const merged: StoredRCASubmission = {
      ...all[idx],
      ...patch,
      masalahBlocks: (patch.masalahBlocks ?? all[idx].masalahBlocks ?? []).map((b) => ({
        ...b,
        actionPlans: b.actionPlans.map((ap) => ({
          ...ap,
          keterangan: Array.isArray(ap.keterangan) ? [...ap.keterangan] : [],
          output: Array.isArray(ap.output) ? [...ap.output] : [],
          evidence: Array.isArray(ap.evidence) ? [...ap.evidence] : [],
        })),
      })),
      actionPlans: (patch.actionPlans ?? all[idx].actionPlans ?? []).map((ap) => ({
        ...ap,
        keterangan: Array.isArray(ap.keterangan) ? [...ap.keterangan] : [],
        output: Array.isArray(ap.output) ? [...ap.output] : [],
        evidence: Array.isArray(ap.evidence) ? [...ap.evidence] : [],
      })),
    };
    if (isAllActionPlansCompleted(merged)) {
      merged.approvalStatus = "Closed";
    }
    all[idx] = merged;
    saveAll(all, merged);
    window.dispatchEvent(new Event("appraisal-updated"));
  }
}

/**
 * Confirm RCA (update progress): memperbarui SELURUH entri RCA terkait (owner & tampilan approver membaca store yang sama)
 * dengan periode + subjek KPI yang sama, tanpa mengirim request approval RCA (RCA satu paket dengan KPI Tracking).
 * Status otomatis Closed bila seluruh Action Plan aktif Selesai. Owner menerima notifikasi.
 */
export function confirmRCAProgressUpdate(
  key: string,
  patch: Pick<StoredRCASubmission, "masalahBlocks" | "actionPlans">,
): { updated: number; closed: boolean; periode: string } {
  const all = loadAll();
  const base = all.find((r) => r.key === key || r.id === key);
  if (!base) return { updated: 0, closed: false, periode: "" };
  const actor = getActiveUser();
  const ownerNorm = normalizeEmployeeId(base.employeeId || actor.employeeId);
  const now = new Date().toISOString();
  const kpiName = base.kpiIndicator.trim().toLowerCase();
  const isRelated = (r: StoredRCASubmission) =>
    (r.key === base.key || r.id === base.id) ||
    (normalizeEmployeeId(r.employeeId || "") === ownerNorm &&
      r.kpiIndicator.trim().toLowerCase() === kpiName &&
      (r.periode === base.periode || (Boolean(r.monthLabel) && r.monthLabel === base.monthLabel)));
  const cloneAp = (ap: StoredRCAActionPlan): StoredRCAActionPlan => ({
    ...ap,
    keterangan: Array.isArray(ap.keterangan) ? [...ap.keterangan] : [],
    output: Array.isArray(ap.output) ? [...ap.output] : [],
    evidence: Array.isArray(ap.evidence) ? [...ap.evidence] : [],
  });
  let closed = false;
  const changed: StoredRCASubmission[] = [];
  const next = all.map((r) => {
    if (!isRelated(r)) return r;
    const merged: StoredRCASubmission = {
      ...r,
      masalahBlocks: (patch.masalahBlocks ?? r.masalahBlocks ?? []).map((b) => ({ ...b, actionPlans: b.actionPlans.map(cloneAp) })),
      actionPlans: (patch.actionPlans ?? r.actionPlans ?? []).map(cloneAp),
      confirmedAt: now,
      confirmedBy: actor.name,
    };
    if (isAllActionPlansCompleted(merged)) {
      merged.approvalStatus = "Closed";
      closed = true;
    }
    changed.push(merged);
    return merged;
  });
  savePersistedState(KEY, next);
  for (const row of changed) {
    void syncToSupabase({
      kind: "rca-submission",
      submission: row,
      audit: {
        userId: actor.employeeId,
        userName: actor.name,
        action: "Update",
        module: "KPI",
        subModule: "RCA",
        description: `Confirm RCA "${row.kpiIndicator}" (${row.monthLabel || row.periode}) — ${row.approvalStatus ?? "Draft"}`,
      },
    });
  }
  const owner = loadManagedUsers().find((u) => normalizeEmployeeId(u.employeeId) === ownerNorm);
  pushEmployeeNotification({
    employeeIds: [owner?.employeeId ?? actor.employeeId],
    title: closed ? "RCA Berstatus Closed" : "Update Progress RCA Tersimpan",
    summary: `Update progress RCA "${base.kpiIndicator}" periode ${base.periode} telah dikonfirmasi${
      closed ? " dan berstatus Closed" : ""
    }. Status RCA otomatis ter-update pada tabel RCA KPI Tracking di riwayat Approver dan akan ikut terkirim saat KPI Tracking bulan berikutnya disubmit.`,
    category: "Approval",
    moduleName: "KPI",
    senderName: "PA System",
    senderRole: "System",
    approvalStatus: closed ? "Closed" : "Updated",
    ctaLabel: "Buka RCA",
    ctaRoute: "/measurement/rca",
  });
  window.dispatchEvent(new Event("appraisal-updated"));
  return { updated: changed.length, closed, periode: base.periode };
}
