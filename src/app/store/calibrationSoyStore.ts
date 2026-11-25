import {
  refreshKvKeysFromBackend,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  selectRowsFromSupabase,
  syncToSupabase,
} from "../services/supabaseClient";
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
import { getMasterCompanyGroups } from "../pages/hr/settings/masterCompanyStore";
import { pushEmployeeNotification } from "./notificationStore";

export const SOY_APPROVAL_KEY = "calibration_soy_approvals_2026";
export const SOY_SNAPSHOT_KEY = "calibration_soy_employee_snapshot_2026";
export const GROUP_CALIBRATION_SETTINGS_KEY = "calibration_group_settings_2026";
export const SOY_EVENT = "pa-calibration-soy-updated";

export type CalibrationGroupId = string;

export interface CalibrationGroupMeta {
  id: CalibrationGroupId;
  slug: string;
  name: string;
  code: string;
  industry: string;
  unitNames: string[];
}

function buildDynamicCalibrationGroups(): CalibrationGroupMeta[] {
  const dynamic = getMasterCompanyGroups();
  if (dynamic.length > 0) {
    return dynamic.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      code: g.code,
      industry: g.industry,
      unitNames: [...g.unitNames],
    }));
  }
  return [
    {
      id: "group-rsup",
      slug: "rsup-group",
      name: "RSUP Group",
      code: "RSUP-GRP",
      industry: "5 Company Units",
      unitNames: ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT RSTM", "PT GHS", "PT RSUP ASD"],
    },
    {
      id: "group-sambu",
      slug: "sambu-group",
      name: "Sambu Group",
      code: "SAMBU-GRP",
      industry: "3 Company Units",
      unitNames: ["PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)"],
    },
  ];
}

export const CALIBRATION_GROUPS: CalibrationGroupMeta[] = new Proxy([] as CalibrationGroupMeta[], {
  get(_target, prop) {
    const cur = buildDynamicCalibrationGroups();
    if (prop === Symbol.iterator) return cur[Symbol.iterator].bind(cur);
    if (prop === "length") return cur.length;
    const val = Reflect.get(cur, prop);
    return typeof val === "function" ? val.bind(cur) : val;
  },
  ownKeys() {
    return Reflect.ownKeys(buildDynamicCalibrationGroups());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(buildDynamicCalibrationGroups(), prop);
  },
});

export function getCalibrationGroupByUnitName(unitName: string): CalibrationGroupMeta | undefined {
  const canon = canonicalizeCompanyUnitName(unitName);
  return CALIBRATION_GROUPS.find(
    (g) => g.name === unitName || g.id === unitName || g.slug === unitName || g.unitNames.includes(canon),
  );
}

export interface SoyUnitSnapshot {
  id: string;
  name: string;
  code?: string;
  calibrationGrades: Array<{ id: string; grade: string; proporsi: string }>;
  /** Target kuota tingkat Unit Usaha hasil alokasi Group (`[A+, A, B, C, D, E]`) */
  unitQuotaTargets?: number[];
  divisionProportions: Array<{ id: string; divisi: string; hc: number; customQuotas?: Record<string, number> }>;
  departemenenProportions: Array<{ id: string; divisiId: string; departemen: string; hc: number; customQuotas?: Record<string, number> }>;
  bagianProportions: Array<{ id: string; departemenenId: string; bagian: string; hc: number; customQuotas?: Record<string, number> }>;
}

export interface SoyGroupSnapshot {
  id: CalibrationGroupId;
  slug: string;
  name: string;
  code: string;
  calibrationGrades: Array<{ id: string; grade: string; proporsi: string }>;
  unitCustomQuotas?: Record<string, Record<string, number>>;
  unitAllocatedQuotas?: Record<string, number[]>;
  units: SoyUnitSnapshot[];
}

export type SoyStatus = "Pending" | "Approved" | "Revision";

export interface SoyApprovalRecord {
  unitId: string;
  unitName: string;
  isGroupRecord?: boolean;
  status: SoyStatus;
  submittedAt: string;
  submittedBy: string;
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
  acknowledgedBy?: Record<string, { employeeId: string; by: string; at: string; note?: string }>;
  history: Array<{ status: SoyStatus | "Submitted" | "Mengetahui"; by: string; at: string; note?: string }>;
  snapshot: SoyUnitSnapshot;
  groupSnapshot?: SoyGroupSnapshot;
}

export function loadSoyApprovals(): Record<string, SoyApprovalRecord> {
  try {
    const parsed = JSON.parse(safeGetLocalRaw(SOY_APPROVAL_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, SoyApprovalRecord> = {};
    for (const [k, rec] of Object.entries(parsed as Record<string, SoyApprovalRecord>)) {
      if (!rec) continue;
      const isGroup =
        Boolean(rec.isGroupRecord) ||
        k === "group-rsup" ||
        k === "group-sambu" ||
        rec.unitName === "RSUP Group" ||
        rec.unitName === "Sambu Group";
      if (isGroup) {
        const gMeta = CALIBRATION_GROUPS.find(
          (g) => g.id === k || g.id === rec.unitId || g.name === rec.unitName,
        );
        const normGroupSnap = rec.groupSnapshot
          ? {
              ...rec.groupSnapshot,
              units: (rec.groupSnapshot.units ?? []).map((u) => ({
                ...u,
                name: canonicalizeCompanyUnitName(u.name),
              })),
            }
          : undefined;
        out[gMeta?.id ?? k] = {
          ...rec,
          unitId: gMeta?.id ?? rec.unitId,
          unitName: gMeta?.name ?? rec.unitName,
          isGroupRecord: true,
          groupSnapshot: normGroupSnap,
        };
        continue;
      }
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

/** Hanya memuat record pengajuan Calibration Setting (SOY) berbasis Group (RSUP Group & Sambu Group). */
export function loadGroupSoyApprovals(): Record<string, SoyApprovalRecord> {
  const all = loadSoyApprovals();
  const out: Record<string, SoyApprovalRecord> = {};
  for (const [k, rec] of Object.entries(all)) {
    if (rec.isGroupRecord || k === "group-rsup" || k === "group-sambu") {
      out[k] = rec;
    }
  }
  return out;
}

/**
 * Tarik data terbaru pengajuan Group SOY dari Supabase (`pa_kv_state` & `pa_calibration_settings`)
 * agar saat user membuka halaman /approvals/calibration/setting dari notifikasi maupun lintas browser/sesi,
 * data pengajuan Group selalu langsung terhidrasi penuh.
 */
export async function refreshGroupSoyApprovalsFromBackend(): Promise<Record<string, SoyApprovalRecord>> {
  try {
    const [kvMap, calRows] = await Promise.all([
      refreshKvKeysFromBackend([SOY_APPROVAL_KEY, GROUP_CALIBRATION_SETTINGS_KEY]),
      selectRowsFromSupabase<{ unit_id?: string; unit_name?: string; data?: unknown }>(
        "pa_calibration_settings",
        "select=unit_id,unit_name,data&unit_id=in.(soy-approval:group-rsup,soy-approval:group-sambu,group-rsup,group-sambu)&limit=10",
      ),
    ]);

    const merged: Record<string, SoyApprovalRecord> = { ...loadSoyApprovals() };
    const remoteKv = kvMap?.[SOY_APPROVAL_KEY];
    if (remoteKv && typeof remoteKv === "object") {
      for (const [k, v] of Object.entries(remoteKv as Record<string, SoyApprovalRecord>)) {
        if (v && typeof v === "object" && "status" in v) {
          merged[k] = v;
        }
      }
    }
    for (const row of calRows ?? []) {
      const d = row?.data as Partial<SoyApprovalRecord> | undefined;
      if (d && typeof d === "object" && d.status && (d.groupSnapshot || d.isGroupRecord)) {
        const gMeta = CALIBRATION_GROUPS.find(
          (g) =>
            row.unit_id === `soy-approval:${g.id}` ||
            row.unit_id === g.id ||
            d.unitId === g.id ||
            d.unitName === g.name,
        );
        if (gMeta) {
          const existing = merged[gMeta.id];
          const existingTs = existing?.decidedAt || existing?.submittedAt || "";
          const incomingTs = d.decidedAt || d.submittedAt || "";
          if (!existing || incomingTs >= existingTs) {
            merged[gMeta.id] = {
              ...(d as SoyApprovalRecord),
              unitId: gMeta.id,
              unitName: gMeta.name,
              isGroupRecord: true,
            };
          }
        }
      }
    }

    safeSetLocalJson(SOY_APPROVAL_KEY, merged);
    window.dispatchEvent(new Event(SOY_EVENT));
  } catch {
    // ignore network failure, fallback to local state
  }
  return loadGroupSoyApprovals();
}

export function getGroupSoyApproval(groupIdOrName: string): SoyApprovalRecord | undefined {
  const groups = loadGroupSoyApprovals();
  if (groups[groupIdOrName]) return groups[groupIdOrName];
  return Object.values(groups).find(
    (r) =>
      r.unitId === groupIdOrName ||
      r.unitName.toLowerCase() === groupIdOrName.toLowerCase() ||
      r.groupSnapshot?.slug === groupIdOrName.toLowerCase(),
  );
}

export function getSoyApproval(unitId: string): SoyApprovalRecord | undefined {
  const all = loadSoyApprovals();
  if (all[unitId]) return all[unitId];
  // Otomatis turunkan dari pengajuan Group induknya bila dicari berdasarkan ID / nama Company Unit!
  const canonTarget = canonicalizeCompanyUnitName(unitId);
  for (const rec of Object.values(all)) {
    if (!rec.isGroupRecord || !rec.groupSnapshot?.units) continue;
    const foundUnit = rec.groupSnapshot.units.find(
      (u) => u.id === unitId || canonicalizeCompanyUnitName(u.name) === canonTarget,
    );
    if (foundUnit) {
      return {
        ...rec,
        unitId: foundUnit.id,
        unitName: foundUnit.name,
        isGroupRecord: false,
        snapshot: foundUnit,
      };
    }
  }
  return undefined;
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
    const parsed = JSON.parse(safeGetLocalRaw(SOY_SNAPSHOT_KEY) ?? "{}");
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

function getPureGroupIdsForUser(user: ManagedUser): CalibrationGroupId[] {
  const candidates = [user.company, ...(user.managedUnits ?? [])].filter(Boolean);
  const matched = new Set<CalibrationGroupId>();
  for (const raw of candidates) {
    const canon = canonicalizeCompanyUnitName(raw);
    const low = canon.toLowerCase();
    for (const grp of CALIBRATION_GROUPS) {
      if (
        grp.name.toLowerCase() === low ||
        grp.unitNames.some((u) => canonicalizeCompanyUnitName(u) === canon)
      ) {
        matched.add(grp.id);
      }
    }
    if (/sambu|guntung|kuala enok/.test(low)) matched.add("group-sambu");
    else if (/rsup|rstm|ghs|asd/.test(low)) matched.add("group-rsup");
  }
  return Array.from(matched);
}

/**
 * Peran user terhadap pengajuan Calibration Setting (SOY) suatu Group (RSUP Group / Sambu Group):
 * - Role Director sesuai cakupan Group-nya (atau user yang di-setup "approver" di User Management pada unit dalam Group tsb) -> "approve"
 * - User "mengetahui" / "readonly" / BOD sesuai cakupan Group -> "view"
 */
export function resolveGroupSoyRoleForUser(
  user: ManagedUser,
  groupIdOrName: string,
  includeGlobalAdmins = false,
): "approve" | "view" | null {
  if (!user) return null;
  const gMeta = CALIBRATION_GROUPS.find(
    (g) =>
      g.id === groupIdOrName ||
      g.slug === groupIdOrName.toLowerCase() ||
      g.name.toLowerCase() === groupIdOrName.toLowerCase(),
  );
  const unitNamesInGroup = gMeta ? gMeta.unitNames : [canonicalizeCompanyUnitName(groupIdOrName)];
  const keysToCheck = gMeta ? [gMeta.name, gMeta.id, ...gMeta.unitNames] : unitNamesInGroup;

  if (user.soyCalibrationRoleByUnit && typeof user.soyCalibrationRoleByUnit === "object") {
    const rolesFound = keysToCheck
      .map((k) => user.soyCalibrationRoleByUnit?.[k] ?? user.soyCalibrationRoleByUnit?.[canonicalizeCompanyUnitName(k)])
      .filter(Boolean);
    if (rolesFound.includes("approver")) return "approve";
    if (rolesFound.includes("mengetahui") || rolesFound.includes("readonly")) return "view";
    if (Object.values(user.soyCalibrationRoleByUnit).some(Boolean) && !isDirectorRoleOrGrouping(user) && !isAdminOrHrIcfRole(user.role)) {
      return null;
    }
  }

  const pureGroups = getPureGroupIdsForUser(user);
  const belongsToTargetGroup = gMeta ? pureGroups.includes(gMeta.id) : false;

  if (isDirectorRoleOrGrouping(user)) {
    // Jika Director berada pada Group ini (atau tidak dikunci ke group spesifik), berikan hak Approve
    if (belongsToTargetGroup || pureGroups.length === 0) {
      return "approve";
    }
    return null;
  }

  if (user.calibrationRoleByUnit && typeof user.calibrationRoleByUnit === "object") {
    const calRoles = keysToCheck
      .map((k) => user.calibrationRoleByUnit?.[k] ?? user.calibrationRoleByUnit?.[canonicalizeCompanyUnitName(k)])
      .filter(Boolean);
    if (calRoles.includes("approver")) return "approve";
    if (calRoles.includes("mengetahui") || calRoles.includes("readonly")) return "view";
  }

  if (isAdminOrHrIcfRole(user.role)) return includeGlobalAdmins ? "view" : null;
  if (user.role === "BOD") {
    if (pureGroups.length === 0 || belongsToTargetGroup) {
      return "view";
    }
  }
  return null;
}

export function resolveSoyRoleForUser(user: ManagedUser, unitName: string, includeGlobalAdmins = false): "approve" | "view" | null {
  if (unitName === "RSUP Group" || unitName === "Sambu Group" || unitName === "group-rsup" || unitName === "group-sambu") {
    return resolveGroupSoyRoleForUser(user, unitName, includeGlobalAdmins);
  }
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

/** Submit Calibration Setting (SOY) berbasis 1 Group (RSUP Group atau Sambu Group) untuk di-approve Director. */
export function submitGroupSoyForApproval(groupSnap: SoyGroupSnapshot): SoyApprovalRecord {
  const map = loadSoyApprovals();
  const now = new Date().toISOString();
  const by = actorLabel();
  const prev = map[groupSnap.id];

  // Bersihkan record per-unit lama pada group ini agar alur sepenuhnya berbasis 1 Group
  const memberUnitIds = new Set(groupSnap.units.map((u) => u.id));
  const memberUnitNames = new Set(groupSnap.units.map((u) => canonicalizeCompanyUnitName(u.name)));
  for (const [k, existing] of Object.entries(map)) {
    if (k === groupSnap.id) continue;
    if (!existing.isGroupRecord && (memberUnitIds.has(k) || memberUnitNames.has(canonicalizeCompanyUnitName(existing.unitName)))) {
      delete map[k];
    }
  }

  // Bangun snapshot gabungan untuk kompatibilitas umum
  const mergedSnapshot: SoyUnitSnapshot = {
    id: groupSnap.id,
    name: groupSnap.name,
    code: groupSnap.code,
    calibrationGrades: JSON.parse(JSON.stringify(groupSnap.calibrationGrades)),
    divisionProportions: groupSnap.units.flatMap((u) =>
      u.divisionProportions.map((d) => ({
        ...d,
        id: `${u.id}::${d.id}`,
        divisi: `${d.divisi} (${u.name})`,
      })),
    ),
    departemenenProportions: groupSnap.units.flatMap((u) =>
      u.departemenenProportions.map((dep) => ({
        ...dep,
        id: `${u.id}::${dep.id}`,
        divisiId: `${u.id}::${dep.divisiId}`,
      })),
    ),
    bagianProportions: groupSnap.units.flatMap((u) =>
      u.bagianProportions.map((bag) => ({
        ...bag,
        id: `${u.id}::${bag.id}`,
        departemenenId: `${u.id}::${bag.departemenenId}`,
      })),
    ),
  };

  const record: SoyApprovalRecord = {
    unitId: groupSnap.id,
    unitName: groupSnap.name,
    isGroupRecord: true,
    status: "Pending",
    submittedAt: now,
    submittedBy: by,
    history: [...(prev?.history ?? []), { status: "Submitted", by, at: now }],
    snapshot: mergedSnapshot,
    groupSnapshot: JSON.parse(JSON.stringify(groupSnap)),
  };
  map[groupSnap.id] = record;
  save(map);

  void syncToSupabase({
    kind: "calibration-setting",
    unitId: `soy-approval:${groupSnap.id}`,
    unitName: groupSnap.name,
    data: record,
    audit: {
      action: "Submit",
      module: "Performance Appraisal",
      subModule: "Calibration Setting (Group SOY)",
      description: `Submitted Group Calibration Setting (SOY) for ${groupSnap.name}`,
    },
  });

  // Kirim notifikasi ke Director / Approver & Mengetahui pada Group tersebut
  const actor = getActiveUser();
  const allActiveUsers = loadManagedUsers().filter(
    (u) => u.status === "Active" && (!actor.employeeId || u.employeeId.toUpperCase() !== actor.employeeId.toUpperCase()),
  );
  const approvers: string[] = [];
  const viewers: string[] = [];
  for (const u of allActiveUsers) {
    const r = resolveGroupSoyRoleForUser(u, groupSnap.name, false);
    if (r === "approve") approvers.push(u.employeeId);
    else if (r === "view") viewers.push(u.employeeId);
  }
  if (approvers.length > 0) {
    pushEmployeeNotification({
      employeeIds: approvers,
      title: `Calibration Setting (SOY) ${groupSnap.name} Menunggu Persetujuan Director`,
      summary: `${by} telah mensubmit Calibration Setting (HC Awal Tahun / SOY) untuk ${groupSnap.name} (${groupSnap.units.length} Unit Usaha). Silakan review Distribusi & Proporsi Grade lalu Approve atau Request Revision.`,
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
      title: `Calibration Setting (SOY) ${groupSnap.name} Disubmit (Mengetahui)`,
      summary: `${by} telah mensubmit Calibration Setting (HC Awal Tahun / SOY) ${groupSnap.name} untuk diketahui.`,
      category: "Approval",
      moduleName: "Calibration",
      approvalStatus: "Pending",
      ctaLabel: "Lihat Calibration — Setting",
      ctaRoute: "/approvals/calibration/setting",
      senderName: actor.name || by,
      senderRole: actor.role || "HR",
    });
  }

  // Simpan snapshot karyawan aktif awal tahun untuk seluruh unit di dalam Group (dasar Eliminasi HC EOY)
  const empSnap = loadSoyEmployeeSnapshot();
  const activeEmployees = loadManagedUsers();
  for (const u of groupSnap.units) {
    const canonName = canonicalizeCompanyUnitName(u.name);
    empSnap[canonName] = activeEmployees
      .filter(
        (emp) =>
          canonicalizeCompanyUnitName(emp.company) === canonName &&
          emp.status === "Active" &&
          !isExcludedFromAppraisalCalibration(emp),
      )
      .map((emp) => ({
        id: emp.id,
        employeeId: emp.employeeId,
        name: emp.name,
        company: emp.company,
        division: emp.division,
        department: emp.department,
        bagian: emp.bagian,
        position: emp.position,
        grade: emp.grade,
        role: emp.role,
        groupings: emp.groupings,
        status: emp.status,
        lastLogin: emp.lastLogin || "",
        email: emp.email || "",
      }));
  }
  savePersistedState(SOY_SNAPSHOT_KEY, empSnap);
  return record;
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

  void syncToSupabase({
    kind: "calibration-setting",
    unitId: rec.isGroupRecord ? `soy-approval:${rec.unitId}` : rec.unitId,
    unitName: rec.unitName,
    data: map[unitId],
    audit: {
      action: status === "Approved" ? "Approve" : "Revision",
      module: "Performance Appraisal",
      subModule: "Calibration Approval — Setting (SOY)",
      description: `${status} Calibration Setting (SOY) for ${rec.unitName}`,
    },
  });

  // Ketika HC Awal Tahun (SOY) telah Approved, kunci baseline SOY di calibration_hc_settings_2026
  // (baik untuk pengajuan Group -> seluruh Unit Usaha anggota Group, maupun unit tunggal).
  // Jika status === "Revision", buka kembali kunci beginningHC agar HR dapat menyesuaikan sebelum submit ulang.
  if (status === "Revision" && rec.isGroupRecord && rec.groupSnapshot?.units) {
    try {
      const rawUnits = safeGetLocalRaw("calibration_hc_settings_2026");
      if (rawUnits) {
        const parsedUnits = JSON.parse(rawUnits) as Array<Record<string, unknown>>;
        if (Array.isArray(parsedUnits)) {
          const unitIds = new Set(rec.groupSnapshot.units.map((u) => String(u.id)));
          const unitNames = new Set(rec.groupSnapshot.units.map((u) => canonicalizeCompanyUnitName(u.name)));
          const updatedUnits = parsedUnits.map((u) =>
            unitIds.has(String(u.id ?? "")) || unitNames.has(canonicalizeCompanyUnitName(String(u.name ?? "")))
              ? {
                  ...u,
                  beginningGrades: undefined,
                  beginningHC: undefined,
                  beginningUnitQuotaTargets: undefined,
                  beginningCustomQuotas: undefined,
                }
              : u,
          );
          savePersistedState("calibration_hc_settings_2026", updatedUnits);
        }
      }
      const rawGroups = safeGetLocalRaw(GROUP_CALIBRATION_SETTINGS_KEY);
      if (rawGroups) {
        const parsedGroups = JSON.parse(rawGroups) as Array<Record<string, unknown>>;
        if (Array.isArray(parsedGroups)) {
          const updatedGroups = parsedGroups.map((grp) =>
            String(grp.id) === String(rec.unitId)
              ? { ...grp, beginningGrades: undefined, beginningUnitCustomQuotas: undefined }
              : grp,
          );
          savePersistedState(GROUP_CALIBRATION_SETTINGS_KEY, updatedGroups);
        }
      }
    } catch {
      // ignore
    }
    return;
  }

  if (status === "Approved" && rec.isGroupRecord && rec.groupSnapshot?.units) {
    try {
      const rawUnits = safeGetLocalRaw("calibration_hc_settings_2026");
      if (rawUnits) {
        const parsedUnits = JSON.parse(rawUnits) as Array<Record<string, unknown>>;
        if (Array.isArray(parsedUnits)) {
          const unitSnapById = new Map<string, SoyUnitSnapshot>();
          const unitSnapByName = new Map<string, SoyUnitSnapshot>();
          for (const uSnap of rec.groupSnapshot.units) {
            unitSnapById.set(String(uSnap.id), uSnap);
            unitSnapByName.set(canonicalizeCompanyUnitName(uSnap.name), uSnap);
          }
          const updatedUnits = parsedUnits.map((u) => {
            const matched =
              unitSnapById.get(String(u.id ?? "")) ??
              unitSnapByName.get(canonicalizeCompanyUnitName(String(u.name ?? "")));
            if (!matched) return u;
            const lockedBeginningHC: Record<string, number> = {};
            const lockedCustomQuotas: Record<string, Record<string, number>> = {};
            for (const row of [
              ...(matched.divisionProportions ?? []),
              ...(matched.departemenenProportions ?? []),
              ...(matched.bagianProportions ?? []),
            ]) {
              lockedBeginningHC[row.id] = row.hc;
              if (row.customQuotas) lockedCustomQuotas[row.id] = { ...row.customQuotas };
            }
            return {
              ...u,
              calibrationGrades: matched.calibrationGrades.map((g) => ({ ...g })),
              divisionProportions: matched.divisionProportions,
              departemenenProportions: matched.departemenenProportions,
              bagianProportions: matched.bagianProportions,
              unitQuotaTargets: matched.unitQuotaTargets,
              beginningGrades: matched.calibrationGrades.map((g) => ({ ...g })),
              beginningHC: lockedBeginningHC,
              beginningCustomQuotas: lockedCustomQuotas,
            };
          });
          savePersistedState("calibration_hc_settings_2026", updatedUnits);
        }
      }
      const rawGroups = safeGetLocalRaw(GROUP_CALIBRATION_SETTINGS_KEY);
      if (rawGroups) {
        const parsedGroups = JSON.parse(rawGroups) as Array<Record<string, unknown>>;
        if (Array.isArray(parsedGroups)) {
          const updatedGroups = parsedGroups.map((grp) =>
            String(grp.id) === String(rec.unitId)
              ? {
                  ...grp,
                  beginningGrades: rec.groupSnapshot!.calibrationGrades.map((g) => ({ ...g })),
                  beginningUnitCustomQuotas: rec.groupSnapshot!.unitCustomQuotas ?? {},
                }
              : grp,
          );
          savePersistedState(GROUP_CALIBRATION_SETTINGS_KEY, updatedGroups);
        }
      }
    } catch {
      // ignore local parse issues
    }
    return;
  }

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
    void syncToSupabase({
      kind: "calibration-setting",
      unitId: `soy-approval:${unitId}`,
      unitName: unitId,
      data: {},
    });
  } else {
    window.dispatchEvent(new Event(SOY_EVENT));
  }
}
