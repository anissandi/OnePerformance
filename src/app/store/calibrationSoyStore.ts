import { savePersistedState } from "../services/supabaseClient";
import {
  canonicalizeCompanyUnitName,
  getActiveUser,
  getCalibrationRoleForUnit,
  getGroupCompaniesForUnit,
  getSoyCalibrationRoleForUnit,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
  isExcludedFromAppraisalCalibration,
  loadManagedUsers,
  type ManagedUser,
} from "./authStore";
import { pushEmployeeNotification } from "./notificationStore";

export const SOY_APPROVAL_KEY = "calibration_soy_approvals_2026";
export const SOY_SNAPSHOT_KEY = "calibration_soy_employee_snapshot_2026";
export const SOY_EVENT = "pa-calibration-soy-updated";

export interface SoyUnitSnapshot {
  id: string;
  name: string;
  code?: string;
  calibrationGrades: Array<{ id: string; grade: string; proporsi: string }>;
  divisionProportions: Array<{ id: string; divisi: string; hc: number; customQuotas?: Record<string, number> }>;
  departemenenProportions: Array<{ id: string; divisiId: string; departemen: string; hc: number; customQuotas?: Record<string, number> }>;
  bagianProportions: Array<{ id: string; departemenenId: string; bagian: string; hc: number; customQuotas?: Record<string, number> }>;
}

export type SoyStatus = "Pending" | "Approved" | "Revision";

export interface SoyApprovalRecord {
  unitId: string;
  unitName: string;
  status: SoyStatus;
  submittedAt: string;
  submittedBy: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  acknowledgedBy?: Record<string, { employeeId: string; by: string; at: string; note?: string }>;
  history: Array<{ status: SoyStatus | "Submitted" | "Mengetahui"; by: string; at: string; note?: string }>;
  snapshot: SoyUnitSnapshot;
}

export function loadSoyApprovals(): Record<string, SoyApprovalRecord> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOY_APPROVAL_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SoyApprovalRecord> = {};
    for (const [k, rec] of Object.entries(parsed as Record<string, SoyApprovalRecord>)) {
      if (!rec) continue;
      const canon = canonicalizeCompanyUnitName(rec.unitName);
      out[k] = {
        ...rec,
        unitName: canon,
        snapshot: rec.snapshot ? { ...rec.snapshot, name: canonicalizeCompanyUnitName(rec.snapshot.name) } : rec.snapshot,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function getSoyApproval(unitId: string): SoyApprovalRecord | undefined {
  return loadSoyApprovals()[unitId];
}

export function formatActorWithPosition(rawBy?: string): string {
  const text = String(rawBy ?? "").trim();
  if (!text) return "—";
  const users = loadManagedUsers();
  const m = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const namePart = (m ? m[1] : text).trim();
  const found = users.find(
    (u) =>
      u.name.trim().toLowerCase() === namePart.toLowerCase() ||
      u.employeeId.trim().toLowerCase() === namePart.toLowerCase(),
  );
  if (found && found.position?.trim()) {
    return `${found.name} (${found.position.trim()})`;
  }
  return text;
}

function actorLabel(): string {
  const u = getActiveUser();
  const pos = u?.position?.trim();
  return u?.name ? `${u.name}${pos ? ` (${pos})` : ""}` : "System";
}

function save(map: Record<string, SoyApprovalRecord>) {
  savePersistedState(SOY_APPROVAL_KEY, map);
  window.dispatchEvent(new Event(SOY_EVENT));
}

/** Snapshot karyawan aktif per unit saat HC Awal Tahun di-submit (dasar Eliminasi HC EOY). */
export function loadSoyEmployeeSnapshot(): Record<string, ManagedUser[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOY_SNAPSHOT_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ManagedUser[]> = {};
    for (const [k, list] of Object.entries(parsed as Record<string, ManagedUser[]>)) {
      out[canonicalizeCompanyUnitName(k)] = list;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Peran user terhadap pengajuan Calibration Setting (SOY) suatu unit:
 * "approve" (Approver), "view" (Mengetahui) atau null (tidak terlibat).
 * Administrator / HR ICF hanya dihitung bila dipetakan eksplisit per unit agar tidak membanjiri notifikasi.
 */
export function resolveSoyRoleForUser(user: ManagedUser, unitName: string, includeGlobalAdmins = false): "approve" | "view" | null {
  const explicitSoy = user.soyCalibrationRoleByUnit?.[canonicalizeCompanyUnitName(unitName)] ?? user.soyCalibrationRoleByUnit?.[unitName];
  if (explicitSoy === "approver") return "approve";
  if (explicitSoy === "mengetahui" || explicitSoy === "readonly") return "view";
  if (user.soyCalibrationRoleByUnit && Object.values(user.soyCalibrationRoleByUnit).some(Boolean)) {
    return null;
  }
  const explicit = user.calibrationRoleByUnit?.[unitName];
  if (explicit === "approver") return "approve";
  if (explicit === "mengetahui" || explicit === "readonly") return "view";
  if (isAdminOrHrIcfRole(user.role)) return includeGlobalAdmins ? "approve" : null;
  if (isDirectorRoleOrGrouping(user) && !getGroupCompaniesForUnit(user.company, user.managedUnits).includes(unitName)) {
    return null;
  }
  const r = getSoyCalibrationRoleForUnit(user, unitName) || getCalibrationRoleForUnit(user, unitName);
  if (r === "approver") return "approve";
  if (r === "mengetahui" || r === "readonly") return "view";
  return null;
}

/** Daftar penerima (Approver & Mengetahui) pengajuan Calibration Setting (SOY) per unit. */
export function findSoyRecipients(unitName: string, excludeEmployeeId?: string): Array<{ user: ManagedUser; role: "approve" | "view" }> {
  return loadManagedUsers()
    .filter((u) => u.status === "Active" && (!excludeEmployeeId || u.employeeId.toUpperCase() !== excludeEmployeeId.toUpperCase()))
    .map((u) => ({ user: u, role: resolveSoyRoleForUser(u, unitName) }))
    .filter((x): x is { user: ManagedUser; role: "approve" | "view" } => x.role !== null);
}

export function submitSoyForApproval(unit: SoyUnitSnapshot): SoyApprovalRecord {
  const map = loadSoyApprovals();
  const now = new Date().toISOString();
  const by = actorLabel();
  const prev = map[unit.id];
  const record: SoyApprovalRecord = {
    unitId: unit.id,
    unitName: unit.name,
    status: "Pending",
    submittedAt: now,
    submittedBy: by,
    history: [...(prev?.history ?? []), { status: "Submitted", by, at: now }],
    snapshot: JSON.parse(JSON.stringify(unit)),
  };
  map[unit.id] = record;
  save(map);

  // Notifikasi approval ke Approver / Mengetahui unit tsb (task juga muncul di Dashboard Approval)
  const actor = getActiveUser();
  const recipients = findSoyRecipients(unit.name, actor.employeeId);
  const approvers = recipients.filter((r) => r.role === "approve").map((r) => r.user.employeeId);
  const viewers = recipients.filter((r) => r.role === "view").map((r) => r.user.employeeId);
  if (approvers.length > 0) {
    pushEmployeeNotification({
      employeeIds: approvers,
      title: `Calibration Setting (SOY) ${unit.name} Menunggu Persetujuan Anda`,
      summary: `${by} telah mensubmit Calibration Setting (HC Awal Tahun / SOY) unit ${unit.name}. Silakan review Distribusi & Proporsi Grade lalu Approve atau Request Revision.`,
      category: "Approval",
      moduleName: "Calibration",
      approvalStatus: "Pending",
      ctaLabel: "Buka Approval Calibration — Setting",
      ctaRoute: "/approvals/calibration/setting",
      senderName: actor.name || by,
      senderRole: actor.role || "HR",
    });
  }
  if (viewers.length > 0) {
    pushEmployeeNotification({
      employeeIds: viewers,
      title: `Calibration Setting (SOY) ${unit.name} Disubmit (Mengetahui)`,
      summary: `${by} telah mensubmit Calibration Setting (HC Awal Tahun / SOY) unit ${unit.name} untuk diketahui.`,
      category: "Approval",
      moduleName: "Calibration",
      approvalStatus: "Pending",
      ctaLabel: "Lihat Calibration — Setting",
      ctaRoute: "/approvals/calibration/setting",
      senderName: actor.name || by,
      senderRole: actor.role || "HR",
    });
  }

  const snap = loadSoyEmployeeSnapshot();
  snap[unit.name] = loadManagedUsers().filter(
    (u) => u.company === unit.name && u.status === "Active" && !isExcludedFromAppraisalCalibration(u),
  );
  savePersistedState(SOY_SNAPSHOT_KEY, snap);
  return record;
}

export function decideSoyApproval(unitId: string, status: "Approved" | "Revision", note: string): void {
  const map = loadSoyApprovals();
  const rec = map[unitId];
  if (!rec) return;
  const now = new Date().toISOString();
  const by = actorLabel();
  map[unitId] = {
    ...rec,
    status,
    decidedAt: now,
    decidedBy: by,
    note: note.trim(),
    history: [...rec.history, { status, by, at: now, note: note.trim() }],
  };
  save(map);

  // Ketika HC Awal Tahun (SOY) telah Approved, kunci baseline SOY di calibration_hc_settings_2026
  // agar perubahan apa pun pada HC Akhir Tahun (EOY) tidak pernah mengubah HC di tab HC Awal Tahun (SOY).
  if (status === "Approved" && rec.snapshot) {
    try {
      const rawUnits = localStorage.getItem("calibration_hc_settings_2026");
      if (rawUnits) {
        const parsedUnits = JSON.parse(rawUnits) as Array<Record<string, unknown>>;
        if (Array.isArray(parsedUnits)) {
          const snap = rec.snapshot;
          const lockedBeginningHC: Record<string, number> = {};
          const lockedCustomQuotas: Record<string, Record<string, number>> = {};
          for (const row of [
            ...(snap.divisionProportions ?? []),
            ...(snap.departemenenProportions ?? []),
            ...(snap.bagianProportions ?? []),
          ]) {
            lockedBeginningHC[row.id] = row.hc;
            if (row.customQuotas) lockedCustomQuotas[row.id] = { ...row.customQuotas };
          }
          const updatedUnits = parsedUnits.map((u) =>
            String(u.id) === String(unitId) || canonicalizeCompanyUnitName(String(u.name ?? "")) === rec.unitName
              ? {
                  ...u,
                  beginningGrades: snap.calibrationGrades.map((g) => ({ ...g })),
                  beginningHC: lockedBeginningHC,
                  beginningCustomQuotas: lockedCustomQuotas,
                }
              : u,
          );
          savePersistedState("calibration_hc_settings_2026", updatedUnits);
        }
      }
    } catch {
      // ignore local parse issues
    }
  }
}

export function acknowledgeSoyApproval(unitId: string, note = ""): void {
  const map = loadSoyApprovals();
  const rec = map[unitId];
  if (!rec) return;
  const u = getActiveUser();
  const now = new Date().toISOString();
  const by = actorLabel();
  const empKey = (u?.employeeId || "USER").trim().toUpperCase();
  map[unitId] = {
    ...rec,
    acknowledgedBy: {
      ...(rec.acknowledgedBy ?? {}),
      [empKey]: {
        employeeId: u?.employeeId || "",
        by,
        at: now,
        note: note.trim() || undefined,
      },
    },
    history: [...rec.history, { status: "Mengetahui", by, at: now, note: note.trim() || undefined }],
  };
  save(map);
}

/** Reset status pengajuan HC Awal Tahun (SOY) agar unit dapat diedit dan di-submit ulang. */
export function resetSoyApproval(unitId?: string): void {
  if (!unitId) {
    save({});
    return;
  }
  const map = loadSoyApprovals();
  if (map[unitId]) {
    delete map[unitId];
    save(map);
  } else {
    window.dispatchEvent(new Event(SOY_EVENT));
  }
}
