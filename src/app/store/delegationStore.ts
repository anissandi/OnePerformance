import { loadPersistedState, mergeKvMapRecord, safeSetLocalJson, syncToSupabase } from "../services/supabaseClient";
import type { ManagedUser } from "./authStore";

/**
 * Delegasi approval (Approval Management → Delegation & Approvals → Delegation).
 * Disimpan di backend (pa_kv_state) per pemberi delegasi agar berlaku lintas perangkat & sesi.
 */
export const DELEGATION_KEY = "pa_approval_delegations_v2";
export const DELEGATION_EVENT = "pa-delegations-updated";

export interface DelegationAccess {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

export interface DelegationRecord {
  /** = Employee ID pemberi delegasi (uppercase) */
  id: string;
  delegatorEmployeeId: string;
  delegateEmployeeId: string;
  kpiSetting: boolean;
  kpiTracking: boolean;
  smartGoalsSetting: boolean;
  smartGoalsMeasurement: boolean;
  access: DelegationAccess;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  history: Array<{ at: string; by: string; action: string }>;
}

export const EMPTY_ACCESS: DelegationAccess = { view: true, create: false, edit: false, delete: false, approve: true };

const norm = (id: string) => String(id ?? "").trim().toUpperCase();
const numKey = (id: string) => norm(id).replace(/^(?:EMP-?|E)0*/i, "");
const sameEmp = (a: string, b: string) => Boolean(a && b) && (norm(a) === norm(b) || (numKey(a) !== "" && numKey(a) === numKey(b)));

export function loadDelegations(): Record<string, DelegationRecord> {
  const raw = loadPersistedState<Record<string, DelegationRecord>>(DELEGATION_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized: Record<string, DelegationRecord> = {};
  for (const [k, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object") continue;
    normalized[k] = {
      ...rec,
      kpiSetting: Boolean(rec.kpiSetting),
      kpiTracking: Boolean(rec.kpiTracking),
      smartGoalsSetting: Boolean(rec.smartGoalsSetting),
      smartGoalsMeasurement: Boolean(rec.smartGoalsMeasurement),
      access: { ...EMPTY_ACCESS, ...(rec.access ?? {}) },
    };
  }
  return normalized;
}

export function getDelegationFor(delegatorEmployeeId: string): DelegationRecord | undefined {
  const all = loadDelegations();
  return all[norm(delegatorEmployeeId)] ?? Object.values(all).find((d) => sameEmp(d.delegatorEmployeeId, delegatorEmployeeId));
}

export function blankDelegation(delegatorEmployeeId: string): DelegationRecord {
  return {
    id: norm(delegatorEmployeeId),
    delegatorEmployeeId: norm(delegatorEmployeeId),
    delegateEmployeeId: "",
    kpiSetting: false,
    kpiTracking: false,
    smartGoalsSetting: false,
    smartGoalsMeasurement: false,
    access: { ...EMPTY_ACCESS },
    active: false,
    updatedAt: "",
    updatedBy: "",
    history: [],
  };
}

/** Simpan delegasi (merge-safe, hanya record pemberi delegasi tsb yang ditulis ulang). */
export function saveDelegation(record: DelegationRecord, actor: { employeeId: string; name: string }, action: string): DelegationRecord {
  const key = norm(record.delegatorEmployeeId);
  const next: DelegationRecord = {
    ...record,
    id: key,
    delegatorEmployeeId: key,
    delegateEmployeeId: norm(record.delegateEmployeeId),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name || actor.employeeId,
    history: [...(record.history ?? []), { at: new Date().toISOString(), by: actor.name || actor.employeeId, action }].slice(-30),
  };
  const local = { ...loadDelegations(), [key]: next };
  safeSetLocalJson(DELEGATION_KEY, local);
  void mergeKvMapRecord(DELEGATION_KEY, key, next);
  void syncToSupabase({
    audit: {
      userId: actor.employeeId,
      userName: actor.name,
      action: "Update",
      module: "Approval Management",
      subModule: "Delegation",
      description: `${action} — delegasi ${key} → ${next.delegateEmployeeId || "-"} (${next.active ? "Aktif" : "Nonaktif"})`,
    },
  });
  queueMicrotask(() => window.dispatchEvent(new Event(DELEGATION_EVENT)));
  return next;
}

export type DelegationModuleKey =
  | "kpiSetting"
  | "kpiTracking"
  | "smartGoalsSetting"
  | "smartGoalsMeasurement";

/** Modul approval yang dicakup delegasi untuk tipe modul & fase tertentu. */
export function delegationModuleKeyFor(moduleType: string, phase?: "setting" | "measurement"): DelegationModuleKey[] {
  const m = moduleType.trim().toLowerCase();
  if (m === "kpi" || m.startsWith("kpi")) {
    if (phase === "setting") return ["kpiSetting"];
    if (phase === "measurement") return ["kpiTracking"];
    if (m.includes("setting")) return ["kpiSetting"];
    if (m.includes("tracking") || m.includes("measurement")) return ["kpiTracking"];
    return ["kpiSetting", "kpiTracking"];
  }
  if (m === "rca" || m.startsWith("rca")) return ["kpiTracking"];
  if (m.startsWith("smart")) {
    if (phase === "setting") return ["smartGoalsSetting"];
    if (phase === "measurement") return ["smartGoalsMeasurement"];
    if (m.includes("setting")) return ["smartGoalsSetting"];
    if (m.includes("measurement") || m.includes("tracking") || m.includes("check")) return ["smartGoalsMeasurement"];
    return ["smartGoalsSetting", "smartGoalsMeasurement"];
  }
  return [];
}

export function isDelegationEffective(
  rec: DelegationRecord | undefined,
  moduleType: string,
  phase?: "setting" | "measurement",
  requireApprove = true,
): boolean {
  if (!rec || !rec.active || !rec.delegateEmployeeId) return false;
  if (requireApprove && !rec.access?.approve) return false;
  if (!requireApprove && !rec.access?.view && !rec.access?.approve) return false;
  return delegationModuleKeyFor(moduleType, phase).some((k) => rec[k]);
}

/** Employee ID para pemberi delegasi yang saat ini mendelegasikan modul tsb kepada `delegateEmployeeId`. */
export function getActiveDelegatorIdsForDelegate(
  delegateEmployeeId: string,
  moduleType: string,
  phase?: "setting" | "measurement",
): string[] {
  if (!delegateEmployeeId || !moduleType) return [];
  return Object.values(loadDelegations())
    .filter((d) => sameEmp(d.delegateEmployeeId, delegateEmployeeId) && isDelegationEffective(d, moduleType, phase))
    .map((d) => d.delegatorEmployeeId);
}

/** Employee ID delegasi aktif milik approver `delegatorEmployeeId` untuk modul tsb. */
export function getActiveDelegateIdsForDelegator(
  delegatorEmployeeId: string,
  moduleType: string,
  phase?: "setting" | "measurement",
): string[] {
  const rec = getDelegationFor(delegatorEmployeeId);
  return isDelegationEffective(rec, moduleType, phase) ? [rec!.delegateEmployeeId] : [];
}

function userMatchesRef(user: ManagedUser, ref?: string): boolean {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return false;
  return (
    (user.regNo ?? "").trim().toLowerCase() === r ||
    user.employeeId.trim().toLowerCase() === r ||
    user.name.trim().toLowerCase() === r ||
    (numKey(r) !== "" && numKey(user.employeeId) === numKey(r))
  );
}

/**
 * Label nama approver yang tercatat pada status/komentar:
 * - Approver langsung → "Nama"
 * - Melalui delegasi → "Nama Delegasi | atas nama Nama Pemberi Delegasi"
 */
export function resolveActingApproverLabel(
  viewer: ManagedUser,
  target: ManagedUser | undefined,
  moduleType: string,
  phase: "setting" | "measurement" | undefined,
  stage: "approver1" | "approver2",
  allUsers: ManagedUser[],
): string {
  if (!target) return viewer.name;
  const ref = stage === "approver1" ? target.regNoAp1 : target.regNoAp2;
  if (userMatchesRef(viewer, ref)) return viewer.name;
  const delegatorIds = getActiveDelegatorIdsForDelegate(viewer.employeeId, moduleType, phase);
  const delegator = allUsers.find(
    (u) => delegatorIds.some((id) => sameEmp(id, u.employeeId)) && userMatchesRef(u, ref),
  );
  return delegator ? `${viewer.name} | atas nama ${delegator.name}` : viewer.name;
}

/** Daftar pengguna yang menjadi "identitas" viewer untuk keperluan matching AP1/AP2 (diri sendiri + pemberi delegasi). */
export function resolveApproverIdentities(
  viewer: ManagedUser,
  moduleType: string,
  phase: "setting" | "measurement" | undefined,
  allUsers: ManagedUser[],
): ManagedUser[] {
  const ids = getActiveDelegatorIdsForDelegate(viewer.employeeId, moduleType, phase);
  if (ids.length === 0) return [viewer];
  return [viewer, ...allUsers.filter((u) => ids.some((id) => sameEmp(id, u.employeeId)))];
}


/** Apakah konfigurasi Access mengizinkan penerima delegasi membuka modul milik pemberi delegasi. */
export function hasWorkspaceDelegationAccess(access?: DelegationAccess): boolean {
  return Boolean(access && (access.view || access.create || access.edit || access.delete));
}

export interface ReceivedWorkspaceDelegation {
  record: DelegationRecord;
  delegator: ManagedUser;
  access: DelegationAccess;
}

/**
 * Daftar delegasi aktif yang DITERIMA oleh `delegateEmployeeId` untuk modul workspace tertentu
 * (`kpiSetting` | `kpiTracking` | `smartGoalsSetting` | `smartGoalsMeasurement`) dengan minimal satu hak akses (`view`/`create`/`edit`/`delete`).
 */
export function getReceivedWorkspaceDelegations(
  delegateEmployeeId: string,
  moduleKey: DelegationModuleKey,
  allUsers: ManagedUser[],
): ReceivedWorkspaceDelegation[] {
  if (!delegateEmployeeId) return [];
  const list: ReceivedWorkspaceDelegation[] = [];
  for (const rec of Object.values(loadDelegations())) {
    if (!rec.active || !rec.delegateEmployeeId) continue;
    if (!rec[moduleKey]) continue;
    if (!hasWorkspaceDelegationAccess(rec.access)) continue;
    if (!sameEmp(rec.delegateEmployeeId, delegateEmployeeId)) continue;
    const delegator = allUsers.find((u) => sameEmp(u.employeeId, rec.delegatorEmployeeId));
    if (!delegator || sameEmp(delegator.employeeId, delegateEmployeeId)) continue;
    list.push({
      record: rec,
      delegator,
      access: rec.access,
    });
  }
  return list;
}

/** Ringkasan hak modul yang diterima user via delegasi aktif (untuk menu Sidebar & allowedModules). */
export function getDelegatedModuleFlagsForUser(delegateEmployeeId: string): {
  kpiSetting: boolean;
  kpiTracking: boolean;
  smartGoalsSetting: boolean;
  smartGoalsMeasurement: boolean;
  approveSetting: boolean;
  approveMeasurement: boolean;
} {
  const out = {
    kpiSetting: false,
    kpiTracking: false,
    smartGoalsSetting: false,
    smartGoalsMeasurement: false,
    approveSetting: false,
    approveMeasurement: false,
  };
  if (!delegateEmployeeId) return out;
  for (const rec of Object.values(loadDelegations())) {
    if (!rec.active || !rec.delegateEmployeeId) continue;
    if (!sameEmp(rec.delegateEmployeeId, delegateEmployeeId)) continue;
    if (hasWorkspaceDelegationAccess(rec.access)) {
      if (rec.kpiSetting) out.kpiSetting = true;
      if (rec.kpiTracking) out.kpiTracking = true;
      if (rec.smartGoalsSetting) out.smartGoalsSetting = true;
      if (rec.smartGoalsMeasurement) out.smartGoalsMeasurement = true;
    }
    if (rec.access?.approve) {
      if (rec.kpiSetting || rec.smartGoalsSetting) out.approveSetting = true;
      if (rec.kpiTracking || rec.smartGoalsMeasurement) out.approveMeasurement = true;
    }
  }
  return out;
}
