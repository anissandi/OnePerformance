import { loadPersistedState, mergeKvMapRecord, safeGetLocalRaw, safeSetLocalJson, syncToSupabase } from "../services/supabaseClient";
import { loadManagedUsers, type ManagedUser } from "./authStore";

/**
 * Delegasi approval (Approval Management → Delegation & Approvals → Delegation).
 * Disimpan di backend (pa_kv_state) per pemberi delegasi agar berlaku lintas perangkat & sesi.
 */
export const DELEGATION_KEY = "pa_approval_delegations_v2";
export const TAKE_OVER_KEY = "pa_approval_takeovers_v1";
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

type DelegatedModuleFlags = {
  kpiSetting: boolean;
  kpiTracking: boolean;
  smartGoalsSetting: boolean;
  smartGoalsMeasurement: boolean;
  approveSetting: boolean;
  approveMeasurement: boolean;
  approvedSettingTypes: string[];
  approvedCheckinTypes: string[];
};

const EMPTY_DELEGATED_FLAGS: DelegatedModuleFlags = {
  kpiSetting: false,
  kpiTracking: false,
  smartGoalsSetting: false,
  smartGoalsMeasurement: false,
  approveSetting: false,
  approveMeasurement: false,
  approvedSettingTypes: [],
  approvedCheckinTypes: [],
};

export type TakeOverModuleKey =
  | "kpiSetting"
  | "kpiTracking"
  | "smartGoalsSetting"
  | "smartGoalsMeasurement"
  | "appraisalForm"
  | "managerialSkill"
  | "project"
  | "feedback";

export const ALL_TAKE_OVER_MODULE_KEYS: TakeOverModuleKey[] = [
  "kpiSetting",
  "kpiTracking",
  "smartGoalsSetting",
  "smartGoalsMeasurement",
  "appraisalForm",
  "managerialSkill",
  "project",
  "feedback",
];

export interface TakeOverRecord {
  /** Kunci = Employee ID bawahan yang di-take-over (uppercase) */
  id: string;
  subordinateEmployeeId: string;
  takeOverByEmployeeId: string;
  reason?: string;
  /** Daftar modul approval yang di-take-over (jika kosong/tidak diset pada data lama, berlaku semua modul approval) */
  modules?: TakeOverModuleKey[];
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  history: Array<{ at: string; by: string; action: string }>;
}

let _cachedDelegationsRaw: string | null | undefined = undefined;
let _cachedDelegationsMap: Record<string, DelegationRecord> = {};
let _cachedActiveDelegations: DelegationRecord[] = [];
let _cachedDelegateFlagsByKey = new Map<string, DelegatedModuleFlags>();
let _cachedTakeOversRaw: string | null | undefined = undefined;
let _cachedTakeOversMap: Record<string, TakeOverRecord> = {};

export function loadTakeOvers(): Record<string, TakeOverRecord> {
  const rawStr = safeGetLocalRaw(TAKE_OVER_KEY);
  if (_cachedTakeOversRaw === rawStr) {
    return _cachedTakeOversMap;
  }
  const raw = loadPersistedState<Record<string, TakeOverRecord>>(TAKE_OVER_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    _cachedTakeOversRaw = rawStr;
    _cachedTakeOversMap = {};
    return {};
  }
  const out: Record<string, TakeOverRecord> = {};
  for (const [k, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object") continue;
    out[k] = {
      ...rec,
      modules: Array.isArray(rec.modules) && rec.modules.length > 0 ? rec.modules : [...ALL_TAKE_OVER_MODULE_KEYS],
      active: Boolean(rec.active),
      history: Array.isArray(rec.history) ? rec.history : [],
    };
  }
  _cachedTakeOversRaw = rawStr;
  _cachedTakeOversMap = out;
  _cachedDelegateFlagsByKey = new Map();
  return out;
}

export function saveTakeOver(
  record: TakeOverRecord,
  actor: { employeeId: string; name: string },
  action: string,
): TakeOverRecord {
  const key = norm(record.subordinateEmployeeId);
  const next: TakeOverRecord = {
    ...record,
    id: key,
    subordinateEmployeeId: key,
    takeOverByEmployeeId: norm(record.takeOverByEmployeeId),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name || actor.employeeId,
    history: [...(record.history ?? []), { at: new Date().toISOString(), by: actor.name || actor.employeeId, action }].slice(-30),
  };
  const local = { ...loadTakeOvers(), [key]: next };
  safeSetLocalJson(TAKE_OVER_KEY, local);
  _cachedTakeOversRaw = undefined;
  _cachedDelegateFlagsByKey = new Map();
  void mergeKvMapRecord(TAKE_OVER_KEY, key, next);
  void syncToSupabase({
    audit: {
      userId: actor.employeeId,
      userName: actor.name,
      action: "Update",
      module: "Approval Management",
      subModule: "Take Over Approval",
      description: `${action} — Take Over ${key} oleh ${next.takeOverByEmployeeId || "-"} (${next.active ? "Aktif" : "Nonaktif"})`,
    },
  });
  queueMicrotask(() => window.dispatchEvent(new Event(DELEGATION_EVENT)));
  return next;
}

export function takeOverModuleKeysFor(moduleType: string, phase?: "setting" | "measurement"): TakeOverModuleKey[] {
  const m = moduleType.trim().toLowerCase();
  if (!m) return [...ALL_TAKE_OVER_MODULE_KEYS];
  if (m === "kpi" || m.startsWith("kpi")) {
    if (phase === "setting" || m.includes("setting")) return ["kpiSetting"];
    if (phase === "measurement" || m.includes("tracking") || m.includes("measurement")) return ["kpiTracking"];
    return ["kpiSetting", "kpiTracking"];
  }
  if (m === "rca" || m.startsWith("rca")) return ["kpiTracking"];
  if (m.startsWith("smart")) {
    if (phase === "setting" || m.includes("setting")) return ["smartGoalsSetting"];
    if (phase === "measurement" || m.includes("measurement") || m.includes("tracking") || m.includes("check")) return ["smartGoalsMeasurement"];
    return ["smartGoalsSetting", "smartGoalsMeasurement"];
  }
  if (m.includes("appraisal")) return ["appraisalForm"];
  if (m.includes("managerial")) return ["managerialSkill"];
  if (m.includes("project")) return ["project"];
  if (m.includes("feedback") || m.includes("inter")) return ["feedback"];
  return [];
}

export function isTakeOverEffectiveForModule(
  rec: TakeOverRecord | undefined,
  moduleType?: string,
  phase?: "setting" | "measurement",
): boolean {
  if (!rec || !rec.active || !rec.takeOverByEmployeeId) return false;
  const mods = Array.isArray(rec.modules) && rec.modules.length > 0 ? rec.modules : ALL_TAKE_OVER_MODULE_KEYS;
  if (!moduleType) return mods.length > 0;
  const keys = takeOverModuleKeysFor(moduleType, phase);
  if (keys.length === 0) return false;
  return keys.some((k) => mods.includes(k));
}

/** Daftar Employee ID bawahan yang saat ini sedang di-Take Over secara aktif oleh `superiorEmployeeId`. */
export function getActiveTakenOverSubordinateIds(
  superiorEmployeeId: string,
  moduleType?: string,
  phase?: "setting" | "measurement",
): string[] {
  if (!superiorEmployeeId) return [];
  return Object.values(loadTakeOvers())
    .filter(
      (r) =>
        r.active &&
        Boolean(r.takeOverByEmployeeId) &&
        sameEmp(r.takeOverByEmployeeId, superiorEmployeeId) &&
        isTakeOverEffectiveForModule(r, moduleType, phase),
    )
    .map((r) => r.subordinateEmployeeId);
}

export function loadDelegations(): Record<string, DelegationRecord> {
  const rawStr = safeGetLocalRaw(DELEGATION_KEY);
  if (_cachedDelegationsRaw === rawStr) {
    return _cachedDelegationsMap;
  }
  const raw = loadPersistedState<Record<string, DelegationRecord>>(DELEGATION_KEY, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    _cachedDelegationsRaw = rawStr;
    _cachedDelegationsMap = {};
    _cachedActiveDelegations = [];
    _cachedDelegateFlagsByKey = new Map();
    return {};
  }
  const normalized: Record<string, DelegationRecord> = {};
  const activeList: DelegationRecord[] = [];
  for (const [k, rec] of Object.entries(raw)) {
    if (!rec || typeof rec !== "object") continue;
    const item: DelegationRecord = {
      ...rec,
      kpiSetting: Boolean(rec.kpiSetting),
      kpiTracking: Boolean(rec.kpiTracking),
      smartGoalsSetting: Boolean(rec.smartGoalsSetting),
      smartGoalsMeasurement: Boolean(rec.smartGoalsMeasurement),
      access: { ...EMPTY_ACCESS, ...(rec.access ?? {}) },
    };
    normalized[k] = item;
    if (item.active && item.delegateEmployeeId) {
      activeList.push(item);
    }
  }
  _cachedDelegationsRaw = rawStr;
  _cachedDelegationsMap = normalized;
  _cachedActiveDelegations = activeList;
  _cachedDelegateFlagsByKey = new Map();
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
  if (!delegateEmployeeId) return [];
  const fromDelegations = moduleType
    ? Object.values(loadDelegations())
    .filter((d) => sameEmp(d.delegateEmployeeId, delegateEmployeeId) && isDelegationEffective(d, moduleType, phase))
    .map((d) => d.delegatorEmployeeId)
    : [];
  // Gabungkan bawahan yang di-Take Over aktif oleh atasan ini (berlaku untuk seluruh modul Approval & Assessment)
  const fromTakeOvers = getActiveTakenOverSubordinateIds(delegateEmployeeId, moduleType || undefined, phase);
  return Array.from(new Set([...fromDelegations, ...fromTakeOvers]));
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

function userMatchesRef(user: ManagedUser, ref?: string, allUsers?: ManagedUser[]): boolean {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return false;
  if (
    (user.regNo ?? "").trim().toLowerCase() === r ||
    user.employeeId.trim().toLowerCase() === r ||
    (/^(?:emp-?|e)\d+$/i.test(r) && /^(?:emp-?|e)\d+$/i.test(user.employeeId.trim()) && numKey(r) !== "" && numKey(user.employeeId) === numKey(r))
  ) {
    return true;
  }
  if (user.name.trim().toLowerCase() === r && allUsers) {
    const idCollision = allUsers.some(
      (u) => (u.regNo ?? "").trim().toLowerCase() === r || u.employeeId.trim().toLowerCase() === r,
    );
    if (idCollision) return false;
    return allUsers.filter((u) => u.name.trim().toLowerCase() === r).length === 1;
  }
  return false;
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
  if (userMatchesRef(viewer, ref, allUsers)) return viewer.name;
  const takenOverIds = getActiveTakenOverSubordinateIds(viewer.employeeId, moduleType, phase);
  const takenSub = allUsers.find(
    (u) => takenOverIds.some((id) => sameEmp(id, u.employeeId)) && userMatchesRef(u, ref, allUsers),
  );
  if (takenSub) return `${viewer.name} | Take Over atas nama ${takenSub.name}`;
  const delegatorIds = getActiveDelegatorIdsForDelegate(viewer.employeeId, moduleType, phase);
  const delegator = allUsers.find(
    (u) => delegatorIds.some((id) => sameEmp(id, u.employeeId)) && userMatchesRef(u, ref, allUsers),
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

/**
 * Daftar delegasi aktif yang diterima oleh `viewer` berdasarkan nama modul (`"KPI"` / `"SMART Goals"`) dan fase (`"setting"` / `"measurement"`).
 */
export function getReceivedDelegationsForModule(
  viewer: Pick<ManagedUser, "employeeId"> | null | undefined,
  moduleType: string,
  phase?: "setting" | "measurement",
  allUsers: ManagedUser[] = loadManagedUsers(),
): ReceivedWorkspaceDelegation[] {
  if (!viewer?.employeeId) return [];
  const modKeys = delegationModuleKeyFor(moduleType, phase);
  if (modKeys.length === 0) return [];
  const seen = new Set<string>();
  const out: ReceivedWorkspaceDelegation[] = [];
  for (const key of modKeys) {
    for (const item of getReceivedWorkspaceDelegations(viewer.employeeId, key, allUsers)) {
      const dedupKey = `${item.record.id}::${key}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push(item);
    }
  }
  return out;
}

/** Ringkasan hak modul yang diterima user via delegasi aktif (untuk menu Sidebar & allowedModules). */
export function getDelegatedModuleFlagsForUser(delegateEmployeeId: string): DelegatedModuleFlags {
  if (!delegateEmployeeId) return EMPTY_DELEGATED_FLAGS;
  loadDelegations();
  const allTakeOvers = Object.values(loadTakeOvers()).filter(
    (r) => r.active && Boolean(r.takeOverByEmployeeId) && sameEmp(r.takeOverByEmployeeId, delegateEmployeeId),
  );
  if (_cachedActiveDelegations.length === 0 && allTakeOvers.length === 0) return EMPTY_DELEGATED_FLAGS;
  const cacheKey = norm(delegateEmployeeId);
  const cached = _cachedDelegateFlagsByKey.get(cacheKey);
  if (cached) return cached;
  const settingTypeSet = new Set<string>();
  const checkinTypeSet = new Set<string>();
  for (const toRec of allTakeOvers) {
    const mods = Array.isArray(toRec.modules) && toRec.modules.length > 0 ? toRec.modules : ALL_TAKE_OVER_MODULE_KEYS;
    if (mods.includes("kpiSetting")) settingTypeSet.add("KPI");
    if (mods.includes("smartGoalsSetting")) settingTypeSet.add("SMART Goals");
    if (mods.includes("kpiTracking")) checkinTypeSet.add("KPI");
    if (mods.includes("smartGoalsMeasurement")) checkinTypeSet.add("SMART Goals");
    if (mods.includes("appraisalForm")) checkinTypeSet.add("Appraisal Form");
    if (mods.includes("managerialSkill")) checkinTypeSet.add("Managerial Skill");
    if (mods.includes("project")) checkinTypeSet.add("Project");
    if (mods.includes("feedback")) checkinTypeSet.add("Inter-Department Feedback");
  }
  const out: DelegatedModuleFlags = {
    kpiSetting: false,
    kpiTracking: false,
    smartGoalsSetting: false,
    smartGoalsMeasurement: false,
    approveSetting: settingTypeSet.size > 0,
    approveMeasurement: checkinTypeSet.size > 0,
    approvedSettingTypes: [],
    approvedCheckinTypes: [],
  };
  for (const rec of _cachedActiveDelegations) {
    if (!sameEmp(rec.delegateEmployeeId, delegateEmployeeId)) continue;
    if (hasWorkspaceDelegationAccess(rec.access)) {
      if (rec.kpiSetting) out.kpiSetting = true;
      if (rec.kpiTracking) out.kpiTracking = true;
      if (rec.smartGoalsSetting) out.smartGoalsSetting = true;
      if (rec.smartGoalsMeasurement) out.smartGoalsMeasurement = true;
    }
    if (rec.access?.approve) {
      if (rec.kpiSetting) {
        out.approveSetting = true;
        settingTypeSet.add("KPI");
      }
      if (rec.smartGoalsSetting) {
        out.approveSetting = true;
        settingTypeSet.add("SMART Goals");
      }
      if (rec.kpiTracking) {
        out.approveMeasurement = true;
        checkinTypeSet.add("KPI");
      }
      if (rec.smartGoalsMeasurement) {
        out.approveMeasurement = true;
        checkinTypeSet.add("SMART Goals");
      }
    }
  }
  out.approvedSettingTypes = Array.from(settingTypeSet);
  out.approvedCheckinTypes = Array.from(checkinTypeSet);
  _cachedDelegateFlagsByKey.set(cacheKey, out);
  return out;
}
