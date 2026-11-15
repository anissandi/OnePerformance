import { savePersistedState } from "../services/supabaseClient";
import { getActiveUser, isExcludedFromAppraisalCalibration, loadManagedUsers, type ManagedUser } from "./authStore";

export const SOY_APPROVAL_KEY = "calibration_soy_approvals_2026";
export const SOY_SNAPSHOT_KEY = "calibration_soy_employee_snapshot_2026";
export const SOY_EVENT = "pa-calibration-soy-updated";

export interface SoyUnitSnapshot {
  id: string;
  name: string;
  code?: string;
  calibrationGrades: Array<{ id: string; grade: string; proporsi: string }>;
  divisionProportions: Array<{ id: string; divisi: string; hc: number }>;
  departemenenProportions: Array<{ id: string; divisiId: string; departemen: string; hc: number }>;
  bagianProportions: Array<{ id: string; departemenenId: string; bagian: string; hc: number }>;
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
  history: Array<{ status: SoyStatus | "Submitted"; by: string; at: string; note?: string }>;
  snapshot: SoyUnitSnapshot;
}

export function loadSoyApprovals(): Record<string, SoyApprovalRecord> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOY_APPROVAL_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getSoyApproval(unitId: string): SoyApprovalRecord | undefined {
  return loadSoyApprovals()[unitId];
}

function actorLabel(): string {
  const u = getActiveUser();
  return u?.name ? `${u.name}${u.role ? ` (${u.role})` : ""}` : "System";
}

function save(map: Record<string, SoyApprovalRecord>) {
  savePersistedState(SOY_APPROVAL_KEY, map);
  window.dispatchEvent(new Event(SOY_EVENT));
}

/** Snapshot karyawan aktif per unit saat HC Awal Tahun di-submit (dasar Eliminasi HC EOY). */
export function loadSoyEmployeeSnapshot(): Record<string, ManagedUser[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SOY_SNAPSHOT_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
