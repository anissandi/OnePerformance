import { deleteBackendRecordFromSupabase, loadPersistedState, savePersistedState, syncToSupabase } from "../services/supabaseClient";
import {
  canonicalizeCompanyUnitName,
  getActiveUser,
  isSameCompanyUnit,
  loadManagedUsers,
  saveManagedUsers,
  type ManagedUser,
} from "./authStore";

export const ARCHIVE_KEY = "pa_archived_users_v1";
export const ARCHIVE_UPDATED_EVENT = "pa-archive-updated";
export const EOY_ARCHIVE_REASON = "Eliminasi HC (EOY)";
export type ArchiveSource = "manual" | "eoy" | "verification";

export interface ArchivedUserRecord {
  id: string;
  user: ManagedUser;
  archivedAt: string; // ISO
  reason: string;
  archivedBy: string;
  source: ArchiveSource;
}

function normId(id: string): string {
  const n = String(id ?? "").replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
  return n ? `EMP-${n.padStart(3, "0")}` : String(id ?? "").trim();
}

export function loadArchivedUsers(): ArchivedUserRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveArchivedUsers(
  list: ArchivedUserRecord[],
  audit?: { action: string; subModule: string; description: string },
): void {
  const actor = getActiveUser();
  savePersistedState(
    ARCHIVE_KEY,
    list,
    audit
      ? {
          kind: "kv-state",
          stateKey: ARCHIVE_KEY,
          stateValue: list,
          audit: {
            userId: actor.employeeId,
            userName: actor.name,
            role: actor.role,
            action: audit.action,
            module: "Archive",
            subModule: audit.subModule,
            description: audit.description,
          },
        }
      : undefined,
  );
  window.dispatchEvent(new Event(ARCHIVE_UPDATED_EVENT));
}

export function isEmployeeArchived(
  employeeIdOrEmail: string,
  company?: string,
  regNo?: string,
): ArchivedUserRecord | undefined {
  const q = employeeIdOrEmail.trim().toLowerCase();
  if (!q) return undefined;
  return loadArchivedUsers().find(
    (a) => {
      if (company && !isSameCompanyUnit(a.user.company ?? "", company)) return false;
      if (regNo && String(a.user.regNo ?? "").trim().toLowerCase() !== regNo.trim().toLowerCase()) return false;
      return (
      a.user.employeeId.toLowerCase() === q ||
      normId(a.user.employeeId).toLowerCase() === normId(q).toLowerCase() ||
      Boolean(a.user.email && a.user.email.trim().toLowerCase() === q) ||
      Boolean(a.user.name && a.user.name.trim().toLowerCase() === q)
      );
    },
  );
}

function isSameUserIdentity(a: ManagedUser, b: ManagedUser): boolean {
  if (a.id && b.id && a.id === b.id && isSameCompanyUnit(a.company ?? "", b.company ?? "")) return true;
  const unitA = canonicalizeCompanyUnitName(a.company ?? "").trim().toLowerCase();
  const unitB = canonicalizeCompanyUnitName(b.company ?? "").trim().toLowerCase();
  const regA = String(a.regNo ?? "").trim().toLowerCase();
  const regB = String(b.regNo ?? "").trim().toLowerCase();
  if (unitA && unitB && unitA === unitB && regA && regB) {
    return regA === regB;
  }
  if (unitA && unitB && unitA === unitB && !regA && !regB) {
    return a.employeeId.trim().toLowerCase() === b.employeeId.trim().toLowerCase();
  }
  return false;
}

/** Menghapus data arsip khusus untuk suatu Unit Usaha (atau seluruh unit bila unitName === "ALL"). */
export function clearArchivedUsersForCompanyUnit(unitName: string): void {
  const existing = loadArchivedUsers();
  if (existing.length === 0) return;
  const kept =
    unitName === "ALL"
      ? []
      : existing.filter((a) => !isSameCompanyUnit(a.user?.company ?? "", unitName));
  if (kept.length === existing.length) return;
  saveArchivedUsers(kept, {
    action: "Delete",
    subModule: "Data Sync Replace Clean Archive",
    description: `Cleaned archived employee records for ${unitName === "ALL" ? "All Company Units" : unitName}`,
  });
}

/** Arsipkan user: dikeluarkan dari User Management aktif (tidak bisa login) tanpa menghapus data PA. */
export function archiveUsers(users: ManagedUser[], reason: string, source: ArchiveSource = "manual"): number {
  if (users.length === 0) return 0;
  const actor = getActiveUser();
  const archivedBy = actor?.name ? `${actor.name}${actor.role ? ` (${actor.role})` : ""}` : "System";
  const now = new Date().toISOString();
  const existing = loadArchivedUsers();
  const ids = new Set(users.map((u) => u.employeeId.toLowerCase()));
  const normIds = new Set(users.map((u) => normId(u.employeeId).toLowerCase()));
  const namesLower = new Set(users.map((u) => (u.name ?? "").trim().toLowerCase()).filter(Boolean));
  const cleanReason = reason.trim() || (source === "eoy" ? EOY_ARCHIVE_REASON : "-");
  const next = [
    ...existing.filter((a) => !users.some((target) => isSameUserIdentity(a.user, target))),
    ...users.map((u) => ({
      id: `arc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: { ...u, status: "Inactive" as const },
      archivedAt: now,
      reason: cleanReason,
      archivedBy,
      source,
    })),
  ];
  saveArchivedUsers(next, {
    action: "Update",
    subModule: source === "verification" ? "Calibration Verification Inactive" : source === "eoy" ? "EOY Headcount Elimination" : "User Management Archive",
    description: `Archived ${users.length} employee(s): ${users.map((u) => `${u.name} (${u.employeeId})`).join(", ")} — Reason: ${cleanReason}`,
  });
  const remaining = loadManagedUsers().filter((u) => !users.some((target) => isSameUserIdentity(u, target)));
  // Sinkronkan penghapusan user aktif ke backend (data PA tetap tersimpan untuk restore)
  users.forEach((u) => saveManagedUsers(remaining, undefined, u.employeeId));

  // Bersihkan karyawan yang diarsipkan dari state aktif Year-End Verification & jadwal aktif Management Interview
  try {
    const matchesTargetId = (val: string) =>
      ids.has(val.trim().toLowerCase()) || normIds.has(normId(val).toLowerCase());
    const yeRaw = loadPersistedState<Record<string, unknown> | null>("year_end_workflow_2026", null);
    if (yeRaw && typeof yeRaw === "object") {
      const prevCompletion = (yeRaw.completion && typeof yeRaw.completion === "object" ? { ...(yeRaw.completion as Record<string, unknown>) } : {});
      for (const k of Object.keys(prevCompletion)) {
        if (matchesTargetId(k)) delete prevCompletion[k];
      }
      const nextYe = {
        ...yeRaw,
        reminded: Array.isArray(yeRaw.reminded) ? (yeRaw.reminded as string[]).filter((x) => !matchesTargetId(String(x))) : [],
        inactive: Array.isArray(yeRaw.inactive) ? (yeRaw.inactive as string[]).filter((x) => !matchesTargetId(String(x))) : [],
        ignored: Array.isArray(yeRaw.ignored) ? (yeRaw.ignored as string[]).filter((x) => !matchesTargetId(String(x))) : [],
        completion: prevCompletion,
      };
      savePersistedState("year_end_workflow_2026", nextYe, {
        kind: "year-end-verification",
        period: "2026",
        state: nextYe,
      });
      window.dispatchEvent(new Event("year-end-updated"));
    }
  } catch {
    // ignore
  }

  try {
    const schedules = loadPersistedState<Array<Record<string, unknown>>>("pa_interview_schedules_v1", []);
    if (Array.isArray(schedules) && schedules.length > 0) {
      let changedSchedule = false;
      const nextSchedules = schedules.map((s) => {
        if (s.status !== "Scheduled") return s;
        const prevNames = Array.isArray(s.addedUsers) ? (s.addedUsers as string[]) : [];
        const prevIds = Array.isArray(s.addedUserIds) ? (s.addedUserIds as string[]) : [];
        const filteredNames = prevNames.filter((nm) => !namesLower.has(String(nm ?? "").trim().toLowerCase()));
        const filteredIds = prevIds.filter(
          (eid) => !ids.has(String(eid ?? "").trim().toLowerCase()) && !normIds.has(normId(String(eid ?? "")).toLowerCase()),
        );
        if (filteredNames.length !== prevNames.length || filteredIds.length !== prevIds.length) {
          changedSchedule = true;
          const updated = { ...s, addedUsers: filteredNames, addedUserIds: filteredIds };
          void syncToSupabase({ kind: "interview-schedule", schedule: updated });
          return updated;
        }
        return s;
      });
      if (changedSchedule) {
        savePersistedState("pa_interview_schedules_v1", nextSchedules);
      }
    }
  } catch {
    // ignore
  }

  window.dispatchEvent(new Event("appraisal-updated"));
  return users.length;
}

/** Pulihkan user beserta seluruh datanya (data PA tidak pernah dihapus saat diarsipkan). */
export function restoreArchivedUser(archiveId: string): ManagedUser | null {
  const list = loadArchivedUsers();
  const rec = list.find((a) => a.id === archiveId);
  if (!rec) return null;
  const users = loadManagedUsers().filter((u) => u.employeeId.toLowerCase() !== rec.user.employeeId.toLowerCase());
  const restored: ManagedUser = { ...rec.user, status: "Active" };
  const next = [...users, restored];
  saveManagedUsers(next, restored);
  saveArchivedUsers(list.filter((a) => a.id !== archiveId), {
    action: "Update",
    subModule: "Restore Archive",
    description: `Restored archived employee: ${restored.name} (${restored.employeeId})`,
  });
  window.dispatchEvent(new Event("appraisal-updated"));
  return restored;
}

const PROTECTED_KEYS = new Set([ARCHIVE_KEY, "pa_active_user_v1", "pa_auth_session_v1", "pa_managed_users_v1"]);

/** Hapus permanen user arsip beserta seluruh history PA & evidence miliknya. */
export function permanentlyDeleteArchivedUser(archiveId: string): boolean {
  const list = loadArchivedUsers();
  const rec = list.find((a) => a.id === archiveId);
  if (!rec) return false;
  const rawId = rec.user.employeeId;
  const ids = new Set([rawId.toLowerCase(), normId(rawId).toLowerCase()]);
  const matchId = (v: unknown) => typeof v === "string" && ids.has(v.toLowerCase());

  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !PROTECTED_KEYS.has(k)) keys.push(k);
  }
  for (const key of keys) {
    // Key per-karyawan, mis. kpi_tracking_v1_EMP-002
    const suffix = key.split("_").pop() ?? "";
    if (matchId(suffix) || [...ids].some((id) => key.toLowerCase().endsWith(`_${id}`))) {
      localStorage.removeItem(key);
      void deleteBackendRecordFromSupabase("pa_kv_state", "state_key", key);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((item) => {
        if (!item || typeof item !== "object") return true;
        const o = item as Record<string, unknown>;
        const row = o.row as Record<string, unknown> | undefined;
        return !(matchId(o.employeeId) || matchId(o.employee_id) || matchId(row?.employeeId));
      });
      if (filtered.length !== parsed.length) savePersistedState(key, filtered);
    } else if (parsed && typeof parsed === "object") {
      const obj = { ...(parsed as Record<string, unknown>) };
      let changed = false;
      for (const k of Object.keys(obj)) {
        if (matchId(k) || [...ids].some((id) => k.toLowerCase().startsWith(`${id}:`))) {
          delete obj[k];
          changed = true;
        }
      }
      if (changed) savePersistedState(key, obj);
    }
  }
  ids.forEach((id) => {
    void deleteBackendRecordFromSupabase("pa_evidence_files", "employee_id", id);
  });
  void deleteBackendRecordFromSupabase("pa_evidence_files", "employee_id", rawId);
  saveArchivedUsers(list.filter((a) => a.id !== archiveId));
  window.dispatchEvent(new Event("appraisal-updated"));
  return true;
}
