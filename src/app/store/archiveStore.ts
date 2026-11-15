import { deleteBackendRecordFromSupabase, savePersistedState } from "../services/supabaseClient";
import { getActiveUser, loadManagedUsers, saveManagedUsers, type ManagedUser } from "./authStore";

export const ARCHIVE_KEY = "pa_archived_users_v1";
export const ARCHIVE_UPDATED_EVENT = "pa-archive-updated";
export const EOY_ARCHIVE_REASON = "Eliminasi HC (EOY)";

export interface ArchivedUserRecord {
  id: string;
  user: ManagedUser;
  archivedAt: string; // ISO
  reason: string;
  archivedBy: string;
  source: "manual" | "eoy";
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

function saveArchivedUsers(list: ArchivedUserRecord[]): void {
  savePersistedState(ARCHIVE_KEY, list);
  window.dispatchEvent(new Event(ARCHIVE_UPDATED_EVENT));
}

export function isEmployeeArchived(employeeIdOrEmail: string): ArchivedUserRecord | undefined {
  const q = employeeIdOrEmail.trim().toLowerCase();
  if (!q) return undefined;
  return loadArchivedUsers().find(
    (a) =>
      a.user.employeeId.toLowerCase() === q ||
      (a.user.email ?? "").toLowerCase() === q ||
      (a.user.name ?? "").toLowerCase() === q,
  );
}

/** Arsipkan user: dikeluarkan dari User Management aktif (tidak bisa login) tanpa menghapus data PA. */
export function archiveUsers(users: ManagedUser[], reason: string, source: "manual" | "eoy" = "manual"): number {
  if (users.length === 0) return 0;
  const actor = getActiveUser();
  const archivedBy = actor?.name ? `${actor.name}${actor.role ? ` (${actor.role})` : ""}` : "System";
  const now = new Date().toISOString();
  const existing = loadArchivedUsers();
  const ids = new Set(users.map((u) => u.employeeId.toLowerCase()));
  const next = [
    ...existing.filter((a) => !ids.has(a.user.employeeId.toLowerCase())),
    ...users.map((u) => ({
      id: `arc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: u,
      archivedAt: now,
      reason: reason.trim() || (source === "eoy" ? EOY_ARCHIVE_REASON : "-"),
      archivedBy,
      source,
    })),
  ];
  saveArchivedUsers(next);
  const remaining = loadManagedUsers().filter((u) => !ids.has(u.employeeId.toLowerCase()));
  // Sinkronkan penghapusan user aktif ke backend (data PA tetap tersimpan untuk restore)
  users.forEach((u) => saveManagedUsers(remaining, undefined, u.employeeId));
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
  saveArchivedUsers(list.filter((a) => a.id !== archiveId));
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
