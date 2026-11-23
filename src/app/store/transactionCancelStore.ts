import {
  mergeKvMapRecord,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  syncToSupabase,
} from "../services/supabaseClient";
import {
  loadWorkflowRecords,
  normalizeEmployeeId,
  type WorkflowRecord,
} from "../pages/shared/appraisalWorkflowStore";
import { canCancelTransaction, getLoginOriginUser, loadManagedUsers } from "./authStore";
import { loadSoyApprovals, resetSoyApproval } from "./calibrationSoyStore";
import { pushEmployeeNotification } from "./notificationStore";
import { projectStore } from "./projectStore";

/**
 * Fitur sementara (DEMO) khusus Role Administrator: Cancel Transaction.
 * Mengembalikan transaksi yang masih pending ke status awal (mis. pengajuan approval → Unsubmitted)
 * dan menyinkronkannya ke Backend Supabase (pa_kv_state, pa_workflow_documents, pa_rca_submissions).
 */

const WORKFLOW_KEY = "appraisal_workflow_v1";
const KPI_BUSINESS_STATUS_KEY = "pa_kpi_business_status_v1";
const RCA_KEY = "kpi_rca_submissions";
const SG_APPROVAL_KEY = "sg_approval_decisions_v1";
const AF_SELF_KEY = "af_self_by_emp_v2";
const AF_APPROVER_KEY = "af_approver_by_emp_v2";
const MS_APPROVER_KEY = "ms_approver_by_emp_v2";
const PROJECT_BY_EMP_KEY = "pa_project_icf_by_emp_v1";
const IDF_WORKFLOWS_KEY = "inter_department_feedback_workflows_v2";
const KPI_SUBMIT_PREFIX = "kpi_tracking_submit_v1_";

export type PendingTransactionSource = "workflow" | "kpi-business" | "rca" | "calibration-soy";

export interface PendingTransaction {
  id: string;
  source: PendingTransactionSource;
  employeeId: string;
  employeeName: string;
  company: string;
  moduleLabel: string;
  status: string;
  submittedDate: string;
  /** Status setelah dibatalkan (ditampilkan pada konfirmasi). */
  resetTo: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetLocalRaw(key);
    return raw ? ((JSON.parse(raw) as T) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
}

const FOUR_STEP = new Set(["KPI", "SMART Goals", "RCA"]);

function workflowStatus(rec: WorkflowRecord): { status: string; final: boolean } {
  const d = rec.decisions;
  const vals = [d.checker?.status, d.approver1?.status, d.approver2?.status, d.validator?.status];
  if (vals.some((s) => s === "Revision" || s === "Rejected")) return { status: "Revision", final: false };
  if (d.validator?.status === "Validated") return { status: "Validated", final: true };
  if (!FOUR_STEP.has(rec.module)) {
    const a2 = d.approver2?.status ?? "";
    if (/approv|valid/i.test(a2)) return { status: "Approved", final: true };
  }
  if (d.approver2?.status) return { status: "Pending-Validator", final: false };
  if (d.approver1?.status) return { status: "Pending-Approver 2", final: false };
  if (d.checker?.status) return { status: "Pending-Approver 1", final: false };
  return { status: FOUR_STEP.has(rec.module) ? "Pending-Check" : "Pending-Approver 1", final: false };
}

function userLookup() {
  const users = loadManagedUsers();
  return (id: string) => {
    const norm = normalizeEmployeeId(id);
    return users.find((u) => normalizeEmployeeId(u.employeeId) === norm);
  };
}

/** Daftar seluruh transaksi yang masih pending (belum final) pada sistem. */
export function listPendingTransactions(): PendingTransaction[] {
  const find = userLookup();
  const out: PendingTransaction[] = [];

  for (const rec of loadWorkflowRecords()) {
    const st = workflowStatus(rec);
    const u = find(rec.employeeId);
    out.push({
      id: `workflow::${rec.key}`,
      source: "workflow",
      employeeId: rec.employeeId,
      employeeName: u?.name ?? rec.employeeId,
      company: u?.company ?? "—",
      moduleLabel: `${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"})${
        rec.submittedMonths?.length && rec.phase === "measurement" ? ` · ${rec.submittedMonths.join(", ")}` : ""
      }`,
      status: st.status,
      submittedDate: rec.submittedDate || "—",
      resetTo: "Unsubmitted",
    });
  }

  const bizStatus = readJson<Record<string, { submitted?: boolean; checked?: boolean; stage?: string; directorApproved?: boolean; approved?: boolean; submittedDate?: string; submittedBy?: string }>>(
    KPI_BUSINESS_STATUS_KEY,
    {},
  );
  for (const [scope, st] of Object.entries(bizStatus)) {
    if (!st?.submitted && !st?.approved) continue;
    const statusLabel = st.approved
      ? "Validated"
      : st.directorApproved
      ? "Approved by Director"
      : st.stage === "pending_checker" || st.checked === false
      ? "Pending Checker"
      : "Checked · Pending Approval";
    out.push({
      id: `kpi-business::${scope}`,
      source: "kpi-business",
      employeeId: "—",
      employeeName: st.submittedBy ?? "—",
      company: scope,
      moduleLabel: `KPI Business (${scope.startsWith("corporate-unit") || scope.includes("unit") ? "KPI Unit" : "KPI Group"})`,
      status: statusLabel,
      submittedDate: st.submittedDate ?? "—",
      resetTo: "Unsubmitted",
    });
  }

  const rcas = readJson<Array<{ key: string; id: string; employeeId?: string; kpiIndicator: string; monthLabel: string; approvalStatus?: string; submittedDate?: string }>>(
    RCA_KEY,
    [],
  );
  for (const r of Array.isArray(rcas) ? rcas : []) {
    const s = r.approvalStatus ?? "";
    if (!/^pending/i.test(s)) continue;
    const u = find(r.employeeId ?? "");
    out.push({
      id: `rca::${r.key}::${r.employeeId ?? ""}`,
      source: "rca",
      employeeId: r.employeeId ?? "—",
      employeeName: u?.name ?? r.employeeId ?? "—",
      company: u?.company ?? "—",
      moduleLabel: `RCA · ${r.kpiIndicator} (${r.monthLabel})`,
      status: s,
      submittedDate: r.submittedDate ?? "—",
      resetTo: "Draft",
    });
  }

  for (const rec of Object.values(loadSoyApprovals())) {
    if (rec.status !== "Pending") continue;
    out.push({
      id: `calibration-soy::${rec.unitId}`,
      source: "calibration-soy",
      employeeId: "—",
      employeeName: rec.submittedBy,
      company: rec.unitName,
      moduleLabel: "Calibration Setting (HC Awal Tahun)",
      status: "Pending Approval",
      submittedDate: rec.submittedAt ? new Date(rec.submittedAt).toLocaleDateString("id-ID") : "—",
      resetTo: "Unsubmitted",
    });
  }

  return out;
}

function cancelWorkflowRecords(keys: Set<string>): WorkflowRecord[] {
  const all = loadWorkflowRecords();
  const cancelled: WorkflowRecord[] = [];
  const next: WorkflowRecord[] = [];
  for (const rec of all) {
    if (!keys.has(rec.key)) {
      next.push(rec);
      continue;
    }
    cancelled.push(rec);
    // KPI Measurement yang sudah memiliki bulan Validated: pertahankan bulan Validated, batalkan siklus pending saja.
    if (rec.module === "KPI" && rec.phase === "measurement" && (rec.validatedMonths?.length ?? 0) > 0) {
      next.push({
        ...rec,
        submittedMonths: [...(rec.validatedMonths ?? [])],
        decisions: { validator: { status: "Validated", date: rec.submittedDate || "-" } },
        assessments: {},
      });
    }
  }
  savePersistedState(WORKFLOW_KEY, next);
  const deletedDocKeys: string[] = [];
  const deletedRecordsMeta: Array<{ key: string; employeeId: string; module: string; phase: string }> = [];
  for (const rec of cancelled) {
    const kept = next.find((r) => r.key === rec.key);
    if (kept) {
      void syncToSupabase({
        kind: "workflow-document",
        doc: {
          key: kept.key,
          employeeId: kept.employeeId,
          module: kept.module,
          phase: kept.phase,
          year: kept.year,
          status: "Validated",
          version: 1,
          payload: kept,
        },
      });
    } else {
      deletedDocKeys.push(rec.key);
      deletedRecordsMeta.push({
        key: rec.key,
        employeeId: rec.employeeId,
        module: rec.module,
        phase: rec.phase,
      });
    }
    const norm = normalizeEmployeeId(rec.employeeId);
    // SMART Goals Measurement: bersihkan keputusan approver lama milik karyawan tsb.
    if (rec.module === "SMART Goals") {
      const decisions = readJson<Array<{ employeeId: string }>>(SG_APPROVAL_KEY, []);
      const filtered = (Array.isArray(decisions) ? decisions : []).filter(
        (d) => normalizeEmployeeId(d.employeeId) !== norm,
      );
      if (filtered.length !== decisions.length) savePersistedState(SG_APPROVAL_KEY, filtered);
    }
    // KPI Measurement: reset submit state + kembalikan RCA yang ikut terkirim ke Draft.
    if (rec.module === "KPI" && rec.phase === "measurement") {
      savePersistedState(`${KPI_SUBMIT_PREFIX}${norm}`, { submitted: false, submittedDate: "" });
      const months = new Set(rec.submittedMonths ?? []);
      const validated = new Set(rec.validatedMonths ?? []);
      resetRcaRows((r) =>
        normalizeEmployeeId(r.employeeId ?? "") === norm && months.has(r.monthLabel) && !validated.has(r.monthLabel),
      );
    }
    // Appraisal Form: buka kembali status submitted menjadi false (isi draft tetap terjaga) & bersihkan penilaian approver
    if (rec.module === "Appraisal Form") {
      const selfMap = readJson<Record<string, Record<string, unknown>>>(AF_SELF_KEY, {});
      if (selfMap[norm]) {
        selfMap[norm] = { ...selfMap[norm], submitted: false };
        savePersistedState(AF_SELF_KEY, selfMap, {
          kind: "appraisal-form",
          employeeId: rec.employeeId,
          period: "2026",
          selfRatings: selfMap[norm],
          approverRatings: [],
          status: "Draft",
        });
      }
      const appMap = readJson<Record<string, unknown>>(AF_APPROVER_KEY, {});
      if (norm in appMap) {
        delete appMap[norm];
        savePersistedState(AF_APPROVER_KEY, appMap);
      }
    }
    // Managerial Skill: bersihkan penilaian approver & kembalikan status backend ke Draft
    if (rec.module === "Managerial Skill") {
      const msAppMap = readJson<Record<string, unknown>>(MS_APPROVER_KEY, {});
      if (norm in msAppMap) {
        delete msAppMap[norm];
        savePersistedState(MS_APPROVER_KEY, msAppMap);
      }
    }
    // Project Outside Job Scope: kembalikan submitted ke false (data project tetap tersimpan)
    if (rec.module === "Project") {
      const projMap = readJson<Record<string, Record<string, unknown>>>(PROJECT_BY_EMP_KEY, {});
      if (projMap[norm]) {
        projMap[norm] = { ...projMap[norm], submitted: false };
        savePersistedState(PROJECT_BY_EMP_KEY, projMap, {
          kind: "project-records",
          employeeId: norm,
          period: "2026",
          fileName: String(projMap[norm].fileName ?? "Project_ICF_2026.xlsx"),
          submitted: false,
          rows: projMap[norm].rows ?? [],
        });
      }
      projectStore.unsubmitAll();
    }
    // Inter-Department Feedback: kembalikan submission summary ke status Draft (belum disubmit ke approver)
    if (rec.module === "Inter-Department Feedback") {
      const idfList = readJson<Array<Record<string, unknown> & { row?: { employeeId?: string; status?: string; submittedDate?: string } }>>(
        IDF_WORKFLOWS_KEY,
        [],
      );
      let idfChanged = false;
      const nextIdf = (Array.isArray(idfList) ? idfList : []).map((entry) => {
        if (normalizeEmployeeId(entry?.row?.employeeId ?? "") !== norm) return entry;
        idfChanged = true;
        const updated = {
          ...entry,
          summarySubmittedAt: undefined,
          followUps: {},
          ownerResultStatus: undefined,
          row: { ...(entry.row ?? {}), status: "Draft", submittedDate: "-" },
        };
        void syncToSupabase({ kind: "inter-dept-feedback", submission: updated });
        return updated;
      });
      if (idfChanged) {
        savePersistedState(IDF_WORKFLOWS_KEY, nextIdf);
        window.dispatchEvent(new Event("feedback-updated"));
      }
    }
  }
  if (deletedDocKeys.length > 0) {
    // Hapus baris pa_workflow_documents langsung menggunakan SUPABASE_SERVICE_ROLE_KEY (Vercel API + Edge Function)
    void syncToSupabase({
      kind: "workflow-delete",
      docKeys: deletedDocKeys,
      records: deletedRecordsMeta,
    });
  }
  return cancelled;
}

function resetRcaRows(
  predicate: (r: { key: string; employeeId?: string; monthLabel: string; approvalStatus?: string }) => boolean,
): number {
  const rows = readJson<Array<Record<string, unknown> & { key: string; employeeId?: string; monthLabel: string; approvalStatus?: string }>>(
    RCA_KEY,
    [],
  );
  let count = 0;
  const next = (Array.isArray(rows) ? rows : []).map((r) => {
    if (!/^pending/i.test(r.approvalStatus ?? "") || !predicate(r)) return r;
    count++;
    const updated = { ...r, approvalStatus: "Draft" };
    void syncToSupabase({
      kind: "rca-submission",
      submission: updated,
      audit: {
        action: "Update",
        module: "KPI",
        subModule: "RCA",
        description: `Cancel Transaction: RCA "${String(r.kpiIndicator ?? "")}" (${r.monthLabel}) dikembalikan ke Draft`,
      },
    });
    return updated;
  });
  if (count > 0) savePersistedState(RCA_KEY, next);
  return count;
}

/** Membatalkan transaksi terpilih & mengembalikannya ke status awal. Mengembalikan jumlah transaksi yang dibatalkan. */
export function cancelPendingTransactions(ids: string[]): number {
  if (!canCancelTransaction()) return 0;
  const admin = getLoginOriginUser();
  const workflowKeys = new Set<string>();
  let count = 0;
  const notifyIds = new Set<string>();

  for (const id of ids) {
    const [source, ...rest] = id.split("::");
    if (source === "workflow") {
      workflowKeys.add(rest.join("::"));
    } else if (source === "kpi-business") {
      const scope = rest.join("::");
      const map = readJson<Record<string, unknown>>(KPI_BUSINESS_STATUS_KEY, {});
      const record = { submitted: false, approved: false, cancelledAt: new Date().toISOString(), cancelledBy: admin.name };
      map[scope] = record;
      safeSetLocalJson(KPI_BUSINESS_STATUS_KEY, map);
      void mergeKvMapRecord(KPI_BUSINESS_STATUS_KEY, scope, record);
      count++;
    } else if (source === "rca") {
      const [key, emp] = rest;
      const n = resetRcaRows((r) => r.key === key && (!emp || (r.employeeId ?? "") === emp));
      if (n > 0 && emp) notifyIds.add(emp);
      count += n;
    } else if (source === "calibration-soy") {
      resetSoyApproval(rest.join("::"));
      count++;
    }
  }

  if (workflowKeys.size > 0) {
    const cancelled = cancelWorkflowRecords(workflowKeys);
    count += cancelled.length;
    const find = userLookup();
    for (const rec of cancelled) {
      const u = find(rec.employeeId);
      if (u) notifyIds.add(u.employeeId);
      if (rec.module === "KPI" && rec.phase === "measurement") {
        const normId = normalizeEmployeeId(rec.employeeId);
        const emptySnap = { months: [], cellsMap: {} };
        safeSetLocalJson(`kpi_tracking_v1_${normId}`, emptySnap);
        void syncToSupabase({
          kind: "kpi-tracking",
          docKey: `${rec.employeeId}:2026`,
          employeeId: rec.employeeId,
          period: "2026",
          months: [],
          cellsMap: {},
          monthlyNotes: {},
          comments: {},
        });
        try {
          const evByEmp = readJson<Record<string, unknown[]>>("kpi_evidence_files_by_emp_v1", {});
          if (evByEmp[normId] || evByEmp[rec.employeeId]) {
            delete evByEmp[normId];
            delete evByEmp[rec.employeeId];
            safeSetLocalJson("kpi_evidence_files_by_emp_v1", evByEmp);
          }
        } catch {
          // ignore
        }
        try {
          const rcaList = readJson<Array<{ employeeId?: string }>>("kpi_rca_submissions", []);
          const filteredRca = rcaList.filter((r) => normalizeEmployeeId(String(r.employeeId ?? "")) !== normId);
          if (filteredRca.length !== rcaList.length) {
            savePersistedState("kpi_rca_submissions", filteredRca);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (notifyIds.size > 0) {
    pushEmployeeNotification({
      employeeIds: Array.from(notifyIds),
      title: "Transaksi Dibatalkan oleh Administrator",
      summary: `Pengajuan Anda yang masih pending telah dibatalkan oleh ${admin.name} dan dikembalikan ke status awal (Unsubmitted). Silakan lakukan pengajuan ulang.`,
      category: "Approval",
      senderName: admin.name,
      senderRole: "Administrator",
      approvalStatus: "Cancelled",
    });
  }

  void syncToSupabase({
    kind: "kv-state",
    stateKey: "pa_cancel_transaction_log_v1",
    stateValue: { lastRunAt: new Date().toISOString(), by: admin.employeeId, count, ids },
    audit: {
      userId: admin.employeeId,
      userName: admin.name,
      role: admin.role,
      action: "Cancel Transaction",
      module: "System",
      subModule: "Cancel Transaction",
      description: `${admin.role || "Administrator"} ${admin.name} membatalkan ${count} transaksi pending`,
    },
  });

  window.dispatchEvent(new Event("appraisal-updated"));
  window.dispatchEvent(new Event("pa-db-hydrated"));
  return count;
}
