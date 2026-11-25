import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer";
import { safeGetLocalRaw, safeSetLocalJson, savePersistedState, syncToSupabase } from "../../services/supabaseClient";
import {
  findHrIcfValidatorUser,
  findHrUnitCheckerUserForCompany,
  getActiveUser,
  isAdminOrHrIcfRole,
  loadManagedUsers,
  resolveUserAllowedModules,
  shouldBypassCheckerForSubmission,
  type WorkflowStageRole,
} from "../../store/authStore";
import { triggerApprovalTransactionNotification } from "../../store/notificationStore";
import { resolveActingApproverLabel } from "../../store/delegationStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";

export const MOCK_EMPLOYEE_ID = "EMP-002";
const KEY = "appraisal_workflow_v1";
const ALIASES_KEY = "appraisal_row_aliases_v1";
export interface EditedKpiCellDiff {
  before: string;
  after: string;
  kpiNo: string;
  monthId: string;
  monthLabel: string;
  subLabel: string;
  updatedAt: string;
}

export interface WorkflowRecord {
  key: string;
  employeeId: string;
  module: string;
  phase: "setting" | "measurement";
  year: string;
  submittedDate: string;
  decisions: Partial<Record<ReviewerRole | "checker" | "validator", { status: string; date: string; note?: string; approverName?: string }>>;
  assessments: Partial<Record<ReviewerRole, { ratings: Record<string, number>; comments: Record<string, string>; date: string }>>;
  revisionHistory?: Array<{
    role: string;
    approverName: string;
    note: string;
    date: string;
  }>;
  /** Riwayat seluruh keputusan reviewer (Checker/AP1/AP2/Validator), tidak di-reset saat submit ulang. */
  decisionLog?: WorkflowDecisionLogEntry[];
  /** KPI Measurement: bulan yang diajukan pada siklus submit aktif (mis. ["Mar-26"]). */
  submittedMonths?: string[];
  /** KPI Measurement: bulan yang sudah Validated oleh HR ICF. */
  validatedMonths?: string[];
  /** Menandai pengajuan berasal dari Re-submit Perubahan Edit KPI Tracking */
  isEditResubmit?: boolean;
  /** Daftar sel KPI Tracking yang berubah saat Re-submit Edit KPI Tracking (`${monthId}::${kpiNo}__${subIdx}`) */
  editedCellsDiff?: Record<string, EditedKpiCellDiff>;
}
export type WorkflowLogStage = "checker" | "approver1" | "approver2" | "validator";
export interface WorkflowDecisionLogEntry {
  stage: WorkflowLogStage;
  approverName: string;
  status: string;
  note?: string;
  date: string;
  months?: string[];
  ts?: number;
}
export interface WorkflowAlias {
  key: string;
  employeeId: string;
  module: string;
  phase: WorkflowRecord["phase"];
  year: string;
  submittedDate: string;
  role: ReviewerRole;
  stage?: WorkflowStageRole;
}
function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(safeGetLocalRaw(key) ?? "null") ?? fallback; } catch { return fallback; }
}
export function normalizeEmployeeId(id: string) {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return "";
  const number = trimmed.replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
  return number ? `EMP-${number.padStart(3, "0")}` : trimmed.toUpperCase();
}
function keyFor(employeeId: string, module: string, phase: WorkflowRecord["phase"], year = "2026") {
  return `${normalizeEmployeeId(employeeId)}:${phase}:${module}:${year}`;
}

// Simpan alias baris approval di memori (0 byte pemakaian localStorage, bebas QuotaExceededError)
// dengan migrasi otomatis & penghapusan key lama appraisal_row_aliases_v1 dari localStorage.
const workflowAliasesMemory = new Map<string, WorkflowAlias>();
let legacyAliasesMigrated = false;

function ensureLegacyAliasesMigrated(): void {
  if (legacyAliasesMigrated) return;
  legacyAliasesMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(ALIASES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, WorkflowAlias> | null;
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (k && v && typeof v === "object" && !workflowAliasesMemory.has(k)) {
            workflowAliasesMemory.set(k, v);
          }
        }
      }
      localStorage.removeItem(ALIASES_KEY);
    }
  } catch {
    try { localStorage.removeItem(ALIASES_KEY); } catch { /* ignore */ }
  }
}

function deriveCanonicalAlias(no: string): WorkflowAlias | undefined {
  const liveMatch = no.match(
    /^(H?)(ST|CI)-LIVE-(.+)-(KPI|SMART Goals|Appraisal Form|Managerial Skill|Project|RCA|Inter-Department Feedback)$/,
  );
  if (liveMatch) {
    const [, hPrefix, phaseCode, rawEmpId, module] = liveMatch;
    const phase: WorkflowRecord["phase"] = phaseCode === "ST" ? "setting" : "measurement";
    const normEmpId = normalizeEmployeeId(rawEmpId);
    const key = keyFor(normEmpId, module, phase, "2026");
    const existing = loadWorkflowRecordsByKeyMap().get(key);
    const role: ReviewerRole = hPrefix === "H" ? "approver2" : "approver1";
    return {
      key,
      employeeId: normEmpId,
      module,
      phase,
      year: "2026",
      submittedDate: existing?.submittedDate ?? "-",
      role,
      stage: role,
    };
  }
  const idfMatch = no.match(/^IDF-(.+)-(20\d{2})$/);
  if (idfMatch) {
    const [, rawEmpId, year] = idfMatch;
    const normEmpId = normalizeEmployeeId(rawEmpId);
    const key = keyFor(normEmpId, "Inter-Department Feedback", "measurement", year);
    const existing = loadWorkflowRecordsByKeyMap().get(key);
    return {
      key,
      employeeId: normEmpId,
      module: "Inter-Department Feedback",
      phase: "measurement",
      year,
      submittedDate: existing?.submittedDate ?? "-",
      role: "approver1",
      stage: "approver1",
    };
  }
  return undefined;
}

function sanitizeWorkflowAutoNote(rawNote?: string): string | undefined {
  if (!rawNote) return undefined;
  const cleaned = rawNote
    .replace(/\s*\(Otomatis:\s*Approver\s*1\s*&\s*Approver\s*2[^)]*\)/gi, "")
    .replace(/^Otomatis:\s*Approver\s*1\s*&\s*Approver\s*2.*$/gi, "")
    .trim();
  return cleaned || undefined;
}

function sanitizeWorkflowRecord(rec: WorkflowRecord): WorkflowRecord {
  if (!rec || typeof rec !== "object") return rec;
  const nextDecisions: WorkflowRecord["decisions"] = {};
  if (rec.decisions && typeof rec.decisions === "object") {
    for (const [k, v] of Object.entries(rec.decisions)) {
      if (!v) continue;
      nextDecisions[k as keyof WorkflowRecord["decisions"]] = {
        ...v,
        note: sanitizeWorkflowAutoNote(v.note),
      };
    }
  }
  const nextLog = Array.isArray(rec.decisionLog)
    ? rec.decisionLog.map((e) => ({ ...e, note: sanitizeWorkflowAutoNote(e.note) }))
    : rec.decisionLog;
  const nextRev = Array.isArray(rec.revisionHistory)
    ? rec.revisionHistory
        .map((r) => ({ ...r, note: sanitizeWorkflowAutoNote(r.note) ?? "" }))
        .filter((r) => Boolean(r.note))
    : rec.revisionHistory;
  return {
    ...rec,
    decisions: nextDecisions,
    decisionLog: nextLog,
    revisionHistory: nextRev,
  };
}

let _cachedWorkflowRaw: string | null | undefined = undefined;
let _cachedWorkflowList: WorkflowRecord[] = [];
let _cachedWorkflowByKey = new Map<string, WorkflowRecord>();
let _cachedWorkflowByNormEmp = new Map<string, WorkflowRecord[]>();

export function loadWorkflowRecords(): WorkflowRecord[] {
  const raw = safeGetLocalRaw(KEY);
  if (_cachedWorkflowRaw === raw) {
    return _cachedWorkflowList;
  }
  let parsed: WorkflowRecord[] = [];
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) {
        parsed = p.map(sanitizeWorkflowRecord);
      }
    } catch {
      parsed = [];
    }
  }
  const byKey = new Map<string, WorkflowRecord>();
  const byEmp = new Map<string, WorkflowRecord[]>();
  for (const rec of parsed) {
    if (!rec) continue;
    if (rec.key) byKey.set(rec.key, rec);
    const normEmp = normalizeEmployeeId(rec.employeeId);
    if (normEmp) {
      const list = byEmp.get(normEmp);
      if (list) list.push(rec);
      else byEmp.set(normEmp, [rec]);
    }
  }
  _cachedWorkflowRaw = raw;
  _cachedWorkflowList = parsed;
  _cachedWorkflowByKey = byKey;
  _cachedWorkflowByNormEmp = byEmp;
  return parsed;
}

export function loadWorkflowRecordsByKeyMap(): Map<string, WorkflowRecord> {
  loadWorkflowRecords();
  return _cachedWorkflowByKey;
}

export function loadWorkflowRecordsByEmployeeMap(): Map<string, WorkflowRecord[]> {
  loadWorkflowRecords();
  return _cachedWorkflowByNormEmp;
}
export function workflowAlias(no: string): WorkflowAlias | undefined {
  ensureLegacyAliasesMigrated();
  return workflowAliasesMemory.get(no) ?? deriveCanonicalAlias(no);
}
export function registerWorkflowRows(rows: ApprovalRow[], role: ReviewerRole) {
  ensureLegacyAliasesMigrated();
  for (const row of rows) {
    const phase = /^(?:H?ST)-/.test(row.no) ? "setting" : "measurement";
    const year = row.period?.match(/20\d{2}/)?.[0] ?? "2026";
    const stage: WorkflowStageRole = row.workflowStageForRow ?? role;
    const nextAlias: WorkflowAlias = {
      key: keyFor(row.employeeId, row.type, phase, year),
      employeeId: normalizeEmployeeId(row.employeeId),
      module: row.type,
      phase,
      year,
      submittedDate: row.submittedDate,
      role,
      stage,
    };
    workflowAliasesMemory.set(row.no, nextAlias);
  }
}
function write(record: WorkflowRecord) {
  const nextRecords = [...loadWorkflowRecords().filter((item) => item.key !== record.key), record];
  safeSetLocalJson(KEY, nextRecords);
  window.dispatchEvent(new Event("appraisal-updated"));
  const latestStatus =
    record.decisions.validator?.status ??
    record.decisions.approver2?.status ??
    record.decisions.approver1?.status ??
    record.decisions.checker?.status ??
    "Pending";
  savePersistedState(KEY, nextRecords, {
    kind: "workflow-document",
    doc: {
      key: record.key,
      employeeId: record.employeeId,
      module: record.module,
      phase: record.phase,
      year: record.year,
      status: latestStatus,
      version: Object.keys(record.decisions).length + 1,
      payload: record,
    },
    audit: {
      userId: record.employeeId,
      userName: record.employeeId,
      role: "Approver",
      action: latestStatus,
      module: record.module,
      subModule: record.phase === "setting" ? "PA Setting" : "PA Measurement",
      description: `${record.module} (${record.phase}) for ${record.employeeId} updated to ${latestStatus}`,
    },
  });
}

/** Menghapus/me-reset status workflow fase tertentu milik satu karyawan ketika definisi Setting diperbarui ulang. */
export function resetWorkflowPhaseForEmployee(
  employeeId: string,
  module: string,
  phase: WorkflowRecord["phase"],
  year = "2026",
): void {
  const normId = normalizeEmployeeId(employeeId);
  if (!normId) return;
  const docKey = keyFor(normId, module, phase, year);
  const current = loadWorkflowRecords();
  if (!current.some((r) => r.key === docKey)) return;
  const remaining = current.filter((r) => r.key !== docKey);
  safeSetLocalJson(KEY, remaining);
  savePersistedState(KEY, remaining, {
    kind: "workflow-document",
    doc: {
      key: docKey,
      employeeId: normId,
      module,
      phase,
      year,
      status: "Cancelled",
      version: 1,
      payload: { key: docKey, employeeId: normId, module, phase, year, cancelled: true },
    },
  });
  window.dispatchEvent(new Event("appraisal-updated"));
}
export function submitWorkflowModule(
  module: string,
  phase: WorkflowRecord["phase"] = "measurement",
  date = formatTodayDDMMYYYY(),
  employeeId = getActiveUser().employeeId || MOCK_EMPLOYEE_ID,
  months?: string[],
  options?: {
    isEditResubmit?: boolean;
    editedCellsDiff?: Record<string, EditedKpiCellDiff>;
  },
) {
  const normalizedDate = normalizeDateDDMMYYYY(date);
  const effectiveDate = normalizedDate === "—" ? formatTodayDDMMYYYY() : normalizedDate;
  const key = keyFor(employeeId, module, phase);
  const bypassChecker =
    (module === "KPI" || module === "SMART Goals" || module === "RCA") &&
    shouldBypassCheckerForSubmission(employeeId);
  const existing = loadWorkflowRecords().find((item) => item.key === key);
  const validatedMonths = existing?.validatedMonths ?? [];
  let submittedMonths: string[] | undefined;
  if (months && months.length > 0) {
    submittedMonths = Array.from(new Set(months));
  } else if (module === "KPI" && phase === "measurement") {
    const tracked = readTrackedKpiMonthLabels(employeeId);
    const fresh = tracked.filter((m) => !validatedMonths.includes(m));
    submittedMonths = fresh.length > 0 ? fresh : tracked.slice(-1);
  }
  const initialDecisions: WorkflowRecord["decisions"] = bypassChecker
    ? {
        checker: { status: "Bypassed", date: effectiveDate },
      }
    : {};
  const isResubmitEdit = Boolean(options?.isEditResubmit);
  const mergedEditedDiff = isResubmitEdit
    ? { ...(existing?.editedCellsDiff ?? {}), ...(options?.editedCellsDiff ?? {}) }
    : existing?.editedCellsDiff;
  write({
    key,
    employeeId: normalizeEmployeeId(employeeId),
    module,
    phase,
    year: "2026",
    submittedDate: effectiveDate,
    decisions: initialDecisions,
    assessments: {},
    revisionHistory: existing?.revisionHistory ?? [],
    decisionLog: existing ? getRecordDecisionLog(existing) : [],
    submittedMonths,
    validatedMonths,
    isEditResubmit: isResubmitEdit,
    editedCellsDiff: mergedEditedDiff,
  });
  triggerApprovalTransactionNotification({
    employeeId: normalizeEmployeeId(employeeId),
    moduleName: isResubmitEdit
      ? "Re-submit Perubahan Edit KPI Tracking"
      : `${module} (${phase === "setting" ? "Setting" : "Measurement"})`,
    rawStatus: "Submitted",
    approverName: getActiveUser().name,
  });
}

/**
 * Batalkan Submit KPI Tracking selama belum ada 1 pun approver (Checker/AP1/AP2/Validator) yang memproses.
 * - Jika terdapat bulan sebelumnya yang sudah Validated (`validatedMonths`), pulihkan status ke Validated untuk bulan lama tersebut
 *   sehingga hanya bulan baru yang kembali berstatus Draft / dapat diedit.
 * - Jika belum ada bulan Validated, hapus workflow record KPI Measurement dari cache & tabel Supabase `pa_workflow_documents`.
 */
export function cancelSubmittedKpiMeasurement(employeeId: string): boolean {
  const normId = normalizeEmployeeId(employeeId);
  const key = keyFor(employeeId, "KPI", "measurement");
  const all = loadWorkflowRecords();
  const existing = all.find(
    (r) =>
      r.key === key ||
      (r.year === "2026" && r.module === "KPI" && r.phase === "measurement" && r.employeeId === normId),
  );
  if (!existing) return false;

  const chk = existing.decisions.checker?.status ?? "";
  const a1 = existing.decisions.approver1?.status ?? "";
  const a2 = existing.decisions.approver2?.status ?? "";
  const val = existing.decisions.validator?.status ?? "";
  const hasRealApproverDecision = Boolean(
    (chk && chk !== "Revision" && chk !== "Bypassed") ||
      (a1 && a1 !== "Revision") ||
      (a2 && a2 !== "Revision") ||
      (val && val !== "Revision"),
  );
  if (hasRealApproverDecision) return false;

  const prevValidated = existing.validatedMonths ?? [];
  if (prevValidated.length > 0) {
    const restored: WorkflowRecord = {
      ...existing,
      submittedMonths: [...prevValidated],
      validatedMonths: [...prevValidated],
      decisions: {
        validator: {
          status: "Validated",
          date: existing.submittedDate || formatTodayDDMMYYYY(),
        },
      },
    };
    write(restored);
  } else {
    const remaining = all.filter((r) => r.key !== existing.key);
    savePersistedState(KEY, remaining);
    void syncToSupabase({
      kind: "workflow-delete",
      docKeys: [existing.key],
      records: [
        {
          key: existing.key,
          employeeId: existing.employeeId,
          module: "KPI",
          phase: "measurement",
        },
      ],
      audit: {
        userId: getActiveUser().employeeId,
        userName: getActiveUser().name,
        role: getActiveUser().role,
        action: "Update",
        module: "KPI",
        subModule: "KPI Tracking",
        description: `Cancelled submitted KPI Tracking (${(existing.submittedMonths ?? []).join(", ") || "2026"}) before approver action`,
      },
    });
    window.dispatchEvent(new Event("appraisal-updated"));
  }
  return true;
}

export function saveWorkflowDecision(no: string, status: string, date: string, note?: string) {
  const alias = workflowAlias(no);
  if (!alias) return;
  const activeUser = getActiveUser();
  const existing = loadWorkflowRecords().find((item) => item.key === alias.key);
  const record: WorkflowRecord = existing ?? { ...alias, decisions: {}, assessments: {}, revisionHistory: [] };
  const isFourStep = alias.module === "KPI" || alias.module === "SMART Goals" || alias.module === "RCA";
  const effectiveDate = date && date !== "-" ? normalizeDateDDMMYYYY(date) : "-";
  const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(alias.employeeId);
  const checkerDone = Boolean(
    bypassCheck ||
      (record.decisions.checker && record.decisions.checker.status !== "Revision"),
  );

  let effectiveStage: WorkflowStageRole = alias.stage ?? alias.role;
  if (isFourStep) {
    if (
      (activeUser.role === "HR Unit" || activeUser.isHrUnitChecker) &&
      !checkerDone &&
      alias.stage !== "approver2" &&
      alias.stage !== "validator"
    ) {
      effectiveStage = "checker";
    } else if (
      (isAdminOrHrIcfRole(activeUser.role) || activeUser.isHrIcfValidator) &&
      alias.stage === "validator"
    ) {
      effectiveStage = "validator";
    }
  }

  const decisions: WorkflowRecord["decisions"] = { ...record.decisions };
  const assessments = { ...record.assessments };
  const allUsers = loadManagedUsers();
  const ownerUser = allUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === alias.employeeId ||
      u.employeeId.trim().toLowerCase() === alias.employeeId.trim().toLowerCase(),
  );
  const resolvedCheckerName =
    activeUser.role === "HR Unit" || Boolean(activeUser.isHrUnitChecker)
      ? activeUser.name
      : findHrUnitCheckerUserForCompany(
          ownerUser?.company || activeUser.company,
          ownerUser?.employeeId || alias.employeeId,
          allUsers,
        )?.name || activeUser.name;
  const resolvedValidatorName =
    activeUser.role === "HR ICF"
      ? activeUser.name
      : findHrIcfValidatorUser(allUsers)?.name || activeUser.name;
  let notifStatus = status;
  let notifRole: string = effectiveStage;
  // Nama approver yang tercatat: "Nama Delegasi | atas nama Pemberi Delegasi" bila approval dilakukan via delegasi
  const actingName = (stage: "approver1" | "approver2") =>
    resolveActingApproverLabel(activeUser, ownerUser, alias.module, alias.phase, stage, allUsers);
  // Aturan: bila Approver 1 & Approver 2 adalah orang yang sama → cukup 1 kali approval
  const refKey = (v?: string) => String(v ?? "").trim().toLowerCase();
  const sameAp1Ap2 = Boolean(
    ownerUser && refKey(ownerUser.regNoAp1) && refKey(ownerUser.regNoAp1) === refKey(ownerUser.regNoAp2),
  );

  if (isFourStep && effectiveStage === "checker") {
    const chkStatus = status === "Revision" ? "Revision" : "Checked";
    decisions.checker = {
      status: chkStatus,
      date: effectiveDate,
      note: note?.trim() ? note : undefined,
      approverName: resolvedCheckerName,
    };
    delete decisions.approver1;
    delete decisions.approver2;
    delete decisions.validator;
    notifStatus = chkStatus;
    notifRole = "checker";
  } else if (effectiveStage === "approver1") {
    const a1Status = status === "Revision" ? "Revision" : status === "Checked" ? "Assessed-Approver 1" : status;
    decisions.approver1 = {
      status: a1Status,
      date: effectiveDate,
      note,
      approverName: actingName("approver1"),
    };
    if (note?.trim()) {
      assessments.approver1 = {
        ratings: assessments.approver1?.ratings ?? {},
        comments: { ...(assessments.approver1?.comments ?? {}), "0": note.trim() },
        date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
      };
    }
    delete decisions.approver2;
    delete decisions.validator;
    delete assessments.approver2;
    notifStatus = a1Status;
    notifRole = "approver1";
    if (sameAp1Ap2 && a1Status !== "Revision") {
      // AP1 == AP2: keputusan Approver 1 otomatis berlaku sebagai Approver 2
      const mirrored = isFourStep
        ? "Assessed-Approver 2"
        : a1Status === "Assessed-Approver 1"
        ? "Approved"
        : a1Status.replace("Approver 1", "Approver 2");
      decisions.approver2 = {
        status: mirrored,
        date: effectiveDate,
        note: note?.trim() || undefined,
        approverName: actingName("approver1"),
      };
      if (assessments.approver1) assessments.approver2 = { ...assessments.approver1 };
      notifStatus = mirrored;
      notifRole = "approver2";
    }
  } else if (isFourStep && effectiveStage === "approver2") {
    const a2Status =
      status === "Revision"
        ? "Revision"
        : status === "Validated"
        ? "Assessed-Approver 2"
        : status;
    decisions.approver2 = {
      status: a2Status,
      date: effectiveDate,
      note,
      approverName: actingName("approver2"),
    };
    if (note?.trim() && status !== "Revision") {
      assessments.approver2 = {
        ratings: assessments.approver2?.ratings ?? {},
        comments: { ...(assessments.approver2?.comments ?? {}), "0": note.trim() },
        date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
      };
    }
    delete decisions.validator;
    notifStatus = a2Status;
    notifRole = "approver2";
  } else if (isFourStep && effectiveStage === "validator") {
    const valStatus = status === "Revision" ? "Revision" : "Validated";
    decisions.validator = {
      status: valStatus,
      date: effectiveDate,
      note: note?.trim() ? note : undefined,
      approverName: resolvedValidatorName,
    };
    notifStatus = valStatus;
    notifRole = "validator";
  } else {
    decisions.approver2 = {
      status,
      date: effectiveDate,
      note,
      approverName: actingName("approver2"),
    };
    if (note?.trim() && status !== "Revision") {
      assessments.approver2 = {
        ratings: assessments.approver2?.ratings ?? {},
        comments: { ...(assessments.approver2?.comments ?? {}), "0": note.trim() },
        date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
      };
    }
    notifStatus = status;
    notifRole = "approver2";
  }

  const revisionHistory = [...(record.revisionHistory ?? [])];
  if (status === "Revision" && note?.trim()) {
    const roleLabel =
      effectiveStage === "checker"
        ? "HR Unit Checker"
        : effectiveStage === "validator"
        ? "HR ICF Validator"
        : effectiveStage === "approver2"
        ? "Approver 2"
        : "Approver 1";
    const revActor =
      effectiveStage === "checker"
        ? resolvedCheckerName
        : effectiveStage === "validator"
        ? resolvedValidatorName
        : actingName(effectiveStage === "approver2" ? "approver2" : "approver1") || roleLabel;
    revisionHistory.push({
      role: roleLabel,
      approverName: revActor,
      note: note.trim(),
      date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
    });
  }
  const logStage: WorkflowLogStage =
    effectiveStage === "checker" || effectiveStage === "validator" || effectiveStage === "approver1"
      ? effectiveStage
      : "approver2";
  const storedDecision = decisions[logStage];
  const decisionLog = [
    ...getRecordDecisionLog(record),
    {
      stage: logStage,
      approverName: storedDecision?.approverName || activeUser.name,
      status: storedDecision?.status || status,
      note: note?.trim() || undefined,
      date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
      months: record.submittedMonths && record.submittedMonths.length > 0 ? [...record.submittedMonths] : undefined,
      ts: Date.now(),
    },
  ];
  if (logStage === "approver1" && sameAp1Ap2 && decisions.approver2 && storedDecision?.status !== "Revision") {
    decisionLog.push({
      stage: "approver2",
      approverName: decisions.approver2.approverName || activeUser.name,
      status: decisions.approver2.status,
      note: decisions.approver2.note,
      date: effectiveDate !== "-" ? effectiveDate : formatTodayDDMMYYYY(),
      months: record.submittedMonths && record.submittedMonths.length > 0 ? [...record.submittedMonths] : undefined,
      ts: Date.now() + 1,
    });
  }
  let validatedMonths = record.validatedMonths ?? [];
  if (logStage === "validator" && storedDecision?.status === "Validated" && record.submittedMonths?.length) {
    validatedMonths = Array.from(new Set([...validatedMonths, ...record.submittedMonths]));
  }
  write({ ...record, decisions, assessments, revisionHistory, decisionLog, validatedMonths });
  triggerApprovalTransactionNotification({
    employeeId: alias.employeeId,
    moduleName: `${alias.module} (${alias.phase === "setting" ? "Setting" : "Measurement"})`,
    rawStatus: notifStatus,
    approverRole: notifRole,
    approverName: storedDecision?.approverName || activeUser.name,
  });
}
const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const KPI_MONTH_LABELS_2026 = MONTH_ORDER.map((m) => `${m}-26`);

/** Label bulan yang sudah tercatat pada KPI Tracking milik karyawan (scoped per karyawan). */
export function readTrackedKpiMonthLabels(employeeId: string): string[] {
  try {
    const raw = safeGetLocalRaw(`kpi_tracking_v1_${normalizeEmployeeId(employeeId)}`);
    const snap = raw ? (JSON.parse(raw) as { months?: Array<{ label?: string }> }) : null;
    const labels = (snap?.months ?? []).map((m) => String(m.label ?? "")).filter(Boolean);
    return labels.sort((a, b) => MONTH_ORDER.indexOf(a.slice(0, 3)) - MONTH_ORDER.indexOf(b.slice(0, 3)));
  } catch {
    return [];
  }
}

/** Log keputusan; record lama tanpa decisionLog disintesis dari decisions + revisionHistory. */
export function getRecordDecisionLog(record: WorkflowRecord): WorkflowDecisionLogEntry[] {
  if (Array.isArray(record.decisionLog)) return record.decisionLog;
  const out: WorkflowDecisionLogEntry[] = [];
  const stageFromLabel = (label: string): WorkflowLogStage =>
    /checker/i.test(label) ? "checker" : /validator/i.test(label) ? "validator" : /2/.test(label) ? "approver2" : "approver1";
  for (const rev of record.revisionHistory ?? []) {
    out.push({ stage: stageFromLabel(rev.role), approverName: rev.approverName, status: "Revision", note: rev.note, date: rev.date });
  }
  (["checker", "approver1", "approver2", "validator"] as WorkflowLogStage[]).forEach((stage) => {
    const d = record.decisions[stage];
    if (!d || d.status === "Bypassed") return;
    if (d.status === "Revision" && out.some((e) => e.stage === stage && e.note === d.note)) return;
    out.push({ stage, approverName: d.approverName || "", status: d.status, note: d.note, date: d.date, months: record.submittedMonths });
  });
  return out;
}

export interface ApproverNoteHistoryItem extends WorkflowDecisionLogEntry {
  stageLabel: string;
}
export const WORKFLOW_STAGE_LABEL: Record<WorkflowLogStage, string> = {
  checker: "Checker",
  approver1: "Approver 1",
  approver2: "Approver 2",
  validator: "Validator",
};

/** Riwayat catatan approver milik satu karyawan untuk modul + fase tertentu (tidak bocor lintas karyawan). */
export function getApproverNotesHistory(
  employeeId: string,
  module: string,
  phase: WorkflowRecord["phase"],
): ApproverNoteHistoryItem[] {
  const normId = normalizeEmployeeId(employeeId);
  const rec = loadWorkflowRecords().find(
    (r) => r.module === module && r.phase === phase && normalizeEmployeeId(r.employeeId) === normId,
  );
  if (!rec) return [];
  return getRecordDecisionLog(rec)
    .map((e) => ({ ...e, stageLabel: WORKFLOW_STAGE_LABEL[e.stage] ?? e.stage }))
    .reverse();
}

export type KpiMonthState = "validated" | "pending" | "revision" | "not_submitted";
/** Status per bulan (Jan–Dec) KPI Tracking milik karyawan. */
export function getKpiMonthStatuses(employeeId: string): Array<{ label: string; state: KpiMonthState }> {
  const normId = normalizeEmployeeId(employeeId);
  const empRecs = loadWorkflowRecordsByEmployeeMap().get(normId) ?? [];
  const rec = empRecs.find((r) => r.module === "KPI" && r.phase === "measurement");
  const validated = new Set(rec?.validatedMonths ?? []);
  const isValidatedRecord = rec?.decisions.validator?.status === "Validated";
  // Record lama yang sudah Validated tanpa validatedMonths: anggap semua bulan tercatat tervalidasi
  if (rec && isValidatedRecord && !rec.validatedMonths) {
    readTrackedKpiMonthLabels(employeeId).forEach((m) => validated.add(m));
  }
  const submitted = new Set(rec && !isValidatedRecord ? rec.submittedMonths ?? [] : []);
  const isRevision = Boolean(
    rec && Object.values(rec.decisions).some((d) => d?.status === "Revision"),
  );
  return KPI_MONTH_LABELS_2026.map((label) => ({
    label,
    state: validated.has(label)
      ? "validated"
      : submitted.has(label)
      ? isRevision
        ? "revision"
        : "pending"
      : "not_submitted",
  }));
}

export function saveWorkflowAssessment(no: string, role: ReviewerRole, ratings: Record<string, number>, comments: Record<string, string>, date: string) {
  const alias = workflowAlias(no);
  if (!alias) return;
  const record = loadWorkflowRecordsByKeyMap().get(alias.key) ?? { ...alias, decisions: {}, assessments: {} };
  write({ ...record, assessments: { ...record.assessments, [role]: { ratings, comments, date } } });
}
export function workflowRowStatus(row: ApprovalRow, role: ReviewerRole): Partial<ApprovalRow> | null {
  const alias = workflowAlias(row.no);
  const record = alias ? loadWorkflowRecordsByKeyMap().get(alias.key) : undefined;
  if (!record) return null;
  const isFourStep = record.module === "KPI" || record.module === "SMART Goals" || record.module === "RCA";
  const stage: WorkflowStageRole = row.workflowStageForRow ?? alias?.stage ?? role;

  if (isFourStep) {
    const bypassCheck = shouldBypassCheckerForSubmission(record.employeeId);
    const chk = record.decisions.checker;
    const a1 = record.decisions.approver1;
    const a2 = record.decisions.approver2;
    const val = record.decisions.validator;

    const isRev =
      chk?.status === "Revision" ||
      a1?.status === "Revision" ||
      a2?.status === "Revision" ||
      val?.status === "Revision";

    const checkerDone = Boolean(bypassCheck || (chk && chk.status !== "Revision"));
    const a1Done = Boolean(a1 && (a1.status === "Approved" || a1.status.startsWith("Assessed") || a1.status === "Validated"));
    const a2Done = Boolean(a2 && (a2.status === "Approved" || a2.status.startsWith("Assessed") || a2.status === "Validated"));
    const validatorDone = Boolean(val?.status === "Validated" || a2?.status === "Validated");

    if (validatorDone) {
      return {
        status: "Validated",
        submittedDate: record.submittedDate,
        approvalDate: val?.date || a2?.date || a1?.date || chk?.date || "-",
      };
    }

    if (isRev) {
      return {
        status: "Revision",
        submittedDate: record.submittedDate,
        approvalDate: "-",
      };
    }

    if (!checkerDone) {
      if (stage === "checker") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting HR Unit Check", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (!a1Done) {
      if (stage === "checker") {
        return {
          status: "Pending-Approver 1",
          submittedDate: record.submittedDate,
          approvalDate: chk?.date || "-",
        };
      }
      if (stage === "approver1") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting Approver 1", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (!a2Done) {
      if (stage === "checker" || stage === "approver1") {
        return {
          status: "Pending-Approver 2",
          submittedDate: record.submittedDate,
          approvalDate: a1?.date || chk?.date || "-",
        };
      }
      if (stage === "approver2") {
        return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
      }
      return { status: "Awaiting Approver 2", submittedDate: record.submittedDate, approvalDate: "-" };
    }

    if (stage === "validator") {
      return { status: "Pending", submittedDate: record.submittedDate, approvalDate: "-" };
    }
    return {
      status: "Pending-Validate",
      submittedDate: record.submittedDate,
      approvalDate: a2?.date || a1?.date || chk?.date || "-",
    };
  }

  const own = record.decisions[role];
  const first = record.decisions.approver1;
  const second = record.decisions.approver2;
  const ready = first && (first.status === "Approved" || first.status.startsWith("Assessed") || first.status === "Validated");
  const a2Completed =
    second &&
    (second.status === "Approved" ||
      second.status.startsWith("Assessed") ||
      second.status === "Validated");
  const ownerUser = loadManagedUsers().find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === record.employeeId ||
      u.employeeId.trim().toLowerCase() === record.employeeId.trim().toLowerCase(),
  );
  const hasSecondApprover = ownerUser ? Boolean((ownerUser.regNoAp2 ?? "").trim()) : true;

  // Jika Approver 2 sudah menyelesaikan penilaian/approval, maka di Approver 1 juga harus terupdate (tidak lagi Pending-Approver 2)
  if (a2Completed || (!hasSecondApprover && ready)) {
    const finalStatus =
      record.module === "Project" || record.module === "Inter-Department Feedback"
        ? "Approved"
        : second?.status || first?.status || "Approved";
    return {
      status: finalStatus,
      submittedDate: record.submittedDate,
      approvalDate: second?.date || first?.date || own?.date || "-",
    };
  }
  if (first?.status === "Revision" || second?.status === "Revision") {
    return {
      status: "Revision",
      submittedDate: record.submittedDate,
      approvalDate: "-",
    };
  }

  if (ready) {
    if (role === "approver1") {
      return {
        status: "Pending-Approver 2",
        submittedDate: record.submittedDate,
        approvalDate: first?.date ?? "-",
      };
    }
    return {
      status: "Pending",
      submittedDate: record.submittedDate,
      approvalDate: "-",
    };
  }

  const status = own?.status ?? (role === "approver2" && !ready ? "Awaiting Approver 1" : "Pending");
  return { status, submittedDate: record.submittedDate, approvalDate: own?.date ?? "-" };
}

export type LiveApprovalStepStatus = "completed" | "in_progress" | "pending";
export interface LiveApprovalStep {
  label: string;
  description: string;
  status: LiveApprovalStepStatus;
}
export interface LiveModuleApprovalData {
  module: string;
  overallStatus: "Approved" | "Pending" | "In Progress";
  steps: LiveApprovalStep[];
}

export function getLiveUserModuleApprovals(includeManagerial = false): LiveModuleApprovalData[] {
  const activeUser = getActiveUser();
  const allowed = resolveUserAllowedModules(activeUser);
  const normId = normalizeEmployeeId(activeUser.employeeId);
  const records = loadWorkflowRecords().filter(
    (r) => r.year === "2026" && (r.employeeId === normId || r.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase()),
  );
  const bypassCheck = shouldBypassCheckerForSubmission(activeUser.employeeId);

  const buildFourStep = (modLabel: string, modKey: string, phase: "setting" | "measurement"): LiveModuleApprovalData => {
    const rec = records.find((r) => r.module === modKey && r.phase === phase);
    if (!rec) {
      return {
        module: modLabel,
        overallStatus: "Pending",
        steps: [
          { label: "Check", description: "Submission reviewed by HR Unit Usaha", status: "pending" },
          { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: "pending" },
          { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: "pending" },
          { label: "Validate", description: "Final validation by HR ICF", status: "pending" },
        ],
      };
    }
    const a1Done = Boolean(rec.decisions.approver1 && (rec.decisions.approver1.status === "Approved" || rec.decisions.approver1.status.startsWith("Assessed") || rec.decisions.approver1.status === "Validated"));
    const a2Done = Boolean(rec.decisions.approver2 && (rec.decisions.approver2.status === "Approved" || rec.decisions.approver2.status.startsWith("Assessed") || rec.decisions.approver2.status === "Validated"));
    const valDone = Boolean(rec.decisions.validator?.status === "Validated" || rec.decisions.approver2?.status === "Validated");
    const checkDone = Boolean(bypassCheck || a1Done || a2Done || (rec.decisions.checker && rec.decisions.checker.status !== "Revision"));
    const overallStatus = valDone ? "Approved" : "In Progress";
    return {
      module: modLabel,
      overallStatus,
      steps: [
        { label: "Check", description: bypassCheck ? "Auto-bypassed (Self HR Unit)" : "Submission reviewed by HR Unit Usaha", status: checkDone ? "completed" : "in_progress" },
        { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: a1Done ? "completed" : checkDone ? "in_progress" : "pending" },
        { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: a2Done ? "completed" : a1Done ? "in_progress" : "pending" },
        { label: "Validate", description: "Final validation by HR ICF", status: valDone ? "completed" : a2Done ? "in_progress" : "pending" },
      ],
    };
  };

  const buildTwoStep = (modLabel: string, modKey: string): LiveModuleApprovalData => {
    const rec = records.find((r) => r.module === modKey && r.phase === "measurement");
    if (!rec) {
      return {
        module: modLabel,
        overallStatus: "Pending",
        steps: [
          { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: "pending" },
          { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: "pending" },
        ],
      };
    }
    const a1Done = Boolean(rec.decisions.approver1 && (rec.decisions.approver1.status === "Approved" || rec.decisions.approver1.status.startsWith("Assessed")));
    const a2Done = Boolean(rec.decisions.approver2 && (rec.decisions.approver2.status === "Approved" || rec.decisions.approver2.status.startsWith("Assessed")));
    return {
      module: modLabel,
      overallStatus: a2Done ? "Approved" : "In Progress",
      steps: [
        { label: "Approver 1", description: `First-level approval (${activeUser.regNoAp1 || "AP1"})`, status: a1Done ? "completed" : "in_progress" },
        { label: "Approver 2", description: `Second-level approval (${activeUser.regNoAp2 || "AP2"})`, status: a2Done ? "completed" : a1Done ? "in_progress" : "pending" },
      ],
    };
  };

  const list: LiveModuleApprovalData[] = [];
  if (allowed.includes("KPI (Setting/Measurement)")) {
    list.push(buildFourStep("KPI (Setting)", "KPI", "setting"));
  }
  if (allowed.includes("SMART Goals (Setting/Measurement)")) {
    list.push(buildFourStep("SMART Goals (Setting)", "SMART Goals", "setting"));
  }
  if (allowed.includes("KPI (Setting/Measurement)")) {
    list.push(buildFourStep("KPI (Tracking)", "KPI", "measurement"));
  }
  if (allowed.includes("SMART Goals (Setting/Measurement)")) {
    list.push(buildFourStep("SMART Goals (Tracking)", "SMART Goals", "measurement"));
  }
  if (allowed.includes("Appraisals Form")) {
    list.push(buildTwoStep("Appraisal Form", "Appraisal Form"));
  }
  if (allowed.includes("Project Outside Job Scope")) {
    list.push(buildTwoStep("Project OJS", "Project"));
  }
  if (includeManagerial && allowed.includes("Managerial Skill")) {
    list.push(buildTwoStep("Managerial Skill", "Managerial Skill"));
  }
  if (allowed.includes("Inter-Departement Feedback")) {
    const wfRec = records.find(
      (r) => r.module === "Inter-Department Feedback" && r.phase === "measurement",
    );
    let idfRec: {
      summarySubmittedAt?: string;
      nominations?: unknown[];
      feedbacks?: unknown[];
      followUps?: { approver1?: unknown[]; approver2?: unknown[] };
    } | undefined;
    try {
      const idfList = JSON.parse(
        safeGetLocalRaw("inter_department_feedback_workflows_v2") ?? "[]",
      ) as Array<{
        row?: { employeeId?: string };
        summarySubmittedAt?: string;
        nominations?: unknown[];
        feedbacks?: unknown[];
        followUps?: { approver1?: unknown[]; approver2?: unknown[] };
      }>;
      idfRec = idfList.find(
        (entry) =>
          entry.row?.employeeId &&
          (normalizeEmployeeId(entry.row.employeeId) === normId ||
            entry.row.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase()),
      );
    } catch {
      idfRec = undefined;
    }
    const hasSecondApprover = Boolean((activeUser.regNoAp2 ?? "").trim());
    const summarySubmitted = Boolean(wfRec || idfRec?.summarySubmittedAt);
    const hasStartedNomination = Boolean(
      (idfRec?.nominations?.length ?? 0) > 0 || (idfRec?.feedbacks?.length ?? 0) > 0,
    );
    const a1Done = Boolean(
      (idfRec?.followUps?.approver1?.length ?? 0) > 0 ||
        (wfRec?.decisions.approver1 &&
          (wfRec.decisions.approver1.status === "Approved" ||
            wfRec.decisions.approver1.status.startsWith("Assessed"))),
    );
    const a2Done = !hasSecondApprover
      ? a1Done
      : Boolean(
          (idfRec?.followUps?.approver2?.length ?? 0) > 0 ||
            (wfRec?.decisions.approver2 &&
              (wfRec.decisions.approver2.status === "Approved" ||
                wfRec.decisions.approver2.status.startsWith("Assessed"))),
        );
    const steps: LiveApprovalStep[] = [
      {
        label: "Approver 1",
        description: `Tindak lanjut Approver 1 (${activeUser.regNoAp1 || "AP1"})`,
        status: a1Done ? "completed" : summarySubmitted ? "in_progress" : "pending",
      },
      ...(hasSecondApprover
        ? [
            {
              label: "Approver 2",
              description: `Tindak lanjut Approver 2 (${activeUser.regNoAp2 || "AP2"})`,
              status: (a2Done ? "completed" : a1Done ? "in_progress" : "pending") as LiveApprovalStepStatus,
            },
          ]
        : []),
    ];
    list.push({
      module: "Inter-Department Feedback",
      overallStatus: a2Done
        ? "Approved"
        : summarySubmitted || hasStartedNomination
        ? "In Progress"
        : "Pending",
      steps,
    });
  }
  return list;
}

/** Status approval Project Outside Job Scope (Approval 1 -> Approval 2) dari workflow aktual karyawan. */
export function getProjectApprovalStatus(employeeId: string): "" | "Pending-Approver 1" | "Pending-Approver 2" | "Approved" | "Revision" | "Rejected" {
  const norm = normalizeEmployeeId(employeeId);
  const rec = loadWorkflowRecords().find(
    (r) => r.module === "Project" && normalizeEmployeeId(r.employeeId) === norm,
  );
  if (!rec) return "";
  const a1 = rec.decisions.approver1?.status ?? "";
  const a2 = rec.decisions.approver2?.status ?? "";
  if (/reject/i.test(a1) || /reject/i.test(a2)) return "Rejected";
  if (a1 === "Revision" || a2 === "Revision") return "Revision";
  if (a2 && a2 !== "Pending") return "Approved";
  if (a1 && a1 !== "Pending") return "Pending-Approver 2";
  return "Pending-Approver 1";
}
