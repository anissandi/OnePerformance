import {
  loadPersistedState,
  mergeKvMapRecord,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  syncToSupabase,
} from "../services/supabaseClient";
import { normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import {
  getActiveUser,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  loadManagedUsers,
  type ManagedUser,
} from "./authStore";
import { pushEmployeeNotification } from "./notificationStore";
import { formatTodayDDMMYYYY } from "../utils/dateFormat";

export const KPI_TARGET_EDIT_KEY = "pa_kpi_target_edit_requests_v1";
export const KPI_TARGET_EDIT_EVENT = "pa-kpi-target-edit-updated";

export type TargetEditStage =
  | "pending_phase1_hricf"
  | "phase1_approved"
  | "phase1_rejected"
  | "pending_ap1"
  | "pending_ap2"
  | "pending_gm"
  | "pending_validate"
  | "validated"
  | "phase2_rejected";

export interface TargetEditAttachment {
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface TargetEditStepDecision {
  stage: string;
  actorId: string;
  actorName: string;
  status: "Approved" | "Validated" | "Rejected";
  note?: string;
  at: string;
}

export interface KpiTargetEditRequest<TItem = Record<string, unknown>> {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  stage: TargetEditStage;
  // Fase 1
  phase1Category: string;
  phase1Reason: string;
  selectedKpiIds: string[];
  phase1Files: TargetEditAttachment[];
  phase1RequestedAt: string;
  // Fase 2
  phase2Comment?: string;
  phase2MemoFiles?: TargetEditAttachment[];
  originalItems?: TItem[];
  proposedItems?: TItem[];
  phase2SubmittedAt?: string;
  decisions: TargetEditStepDecision[];
  updatedAt: string;
}

export function loadAllTargetEditRequests<TItem = Record<string, unknown>>(): Record<string, KpiTargetEditRequest<TItem>> {
  const raw = loadPersistedState<Record<string, KpiTargetEditRequest<TItem>>>(KPI_TARGET_EDIT_KEY, {});
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

export function getTargetEditRequestForEmployee<TItem = Record<string, unknown>>(
  employeeId: string,
): KpiTargetEditRequest<TItem> | undefined {
  const norm = normalizeEmployeeId(employeeId);
  const all = loadAllTargetEditRequests<TItem>();
  return all[norm] ?? all[employeeId];
}

function persistRequest<TItem>(normEmpId: string, req: KpiTargetEditRequest<TItem>, auditDesc: string, action: string) {
  const all = loadAllTargetEditRequests<TItem>();
  const next = { ...all, [normEmpId]: req };
  safeSetLocalJson(KPI_TARGET_EDIT_KEY, next);
  void mergeKvMapRecord(KPI_TARGET_EDIT_KEY, normEmpId, req);
  const actor = getActiveUser();
  savePersistedState(KPI_TARGET_EDIT_KEY, next, {
    audit: {
      userId: actor.employeeId,
      userName: actor.name,
      role: actor.role,
      action,
      module: "KPI",
      subModule: "Edit [Target] Request",
      description: auditDesc,
    },
  });
  window.dispatchEvent(new Event(KPI_TARGET_EDIT_EVENT));
  window.dispatchEvent(new Event("appraisal-updated"));
}

function findUserByRef(users: ManagedUser[], ref?: string): ManagedUser | undefined {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return undefined;
  const rNum = r.replace(/^(?:emp-?|e)0*/i, "");
  return users.find(
    (u) =>
      u.status === "Active" &&
      ((u.regNo ?? "").trim().toLowerCase() === r ||
        u.employeeId.trim().toLowerCase() === r ||
        u.name.trim().toLowerCase() === r ||
        (rNum !== "" && u.employeeId.trim().toLowerCase().replace(/^(?:emp-?|e)0*/i, "") === rNum)),
  );
}

function findHrIcfIds(users: ManagedUser[]): string[] {
  const icf = users.filter((u) => u.status === "Active" && (u.role === "HR ICF" || Boolean(u.isHrIcfValidator)));
  if (icf.length > 0) return icf.map((u) => u.employeeId);
  return users.filter((u) => u.status === "Active" && u.role === "Administrator").map((u) => u.employeeId);
}

function findUnitGmUsers(users: ManagedUser[], companyUnit: string, excludeEmpId?: string): ManagedUser[] {
  return users.filter(
    (u) =>
      u.status === "Active" &&
      u.role === "GM" &&
      isSameCompanyUnit(u.company, companyUnit) &&
      (!excludeEmpId || normalizeEmployeeId(u.employeeId) !== normalizeEmployeeId(excludeEmpId)),
  );
}

/** Menentukan tahap awal/selanjutnya pada Fase 2: Approver 1 -> Approver 2 -> GM (unit usaha) -> Validate (HR ICF). */
function resolveNextPhase2Stage(
  owner: ManagedUser | undefined,
  companyUnit: string,
  afterStage: "start" | "pending_ap1" | "pending_ap2" | "pending_gm",
  users: ManagedUser[],
): { nextStage: "pending_ap1" | "pending_ap2" | "pending_gm" | "pending_validate"; recipientIds: string[]; stageLabel: string } {
  const ap1 = owner ? findUserByRef(users, owner.regNoAp1) : undefined;
  const ap2 = owner ? findUserByRef(users, owner.regNoAp2) : undefined;
  const sameAp = Boolean(ap1 && ap2 && normalizeEmployeeId(ap1.employeeId) === normalizeEmployeeId(ap2.employeeId));
  const gms = findUnitGmUsers(users, companyUnit, owner?.employeeId);
  const hrIcfIds = findHrIcfIds(users);

  if (afterStage === "start") {
    if (ap1) {
      return { nextStage: "pending_ap1", recipientIds: [ap1.employeeId], stageLabel: "Approver 1" };
    }
    if (ap2) {
      return { nextStage: "pending_ap2", recipientIds: [ap2.employeeId], stageLabel: "Approver 2" };
    }
    if (gms.length > 0) {
      return { nextStage: "pending_gm", recipientIds: gms.map((g) => g.employeeId), stageLabel: `GM (${companyUnit})` };
    }
    return { nextStage: "pending_validate", recipientIds: hrIcfIds, stageLabel: "Validate (HR ICF)" };
  }

  if (afterStage === "pending_ap1") {
    if (ap2 && !sameAp) {
      return { nextStage: "pending_ap2", recipientIds: [ap2.employeeId], stageLabel: "Approver 2" };
    }
    // Bila AP2 sudah sama dengan GM unit tsb dan hanya ada 1 GM, tetap teruskan ke GM bila berbeda dari AP1/AP2
    const distinctGms = gms.filter(
      (g) =>
        (!ap1 || normalizeEmployeeId(g.employeeId) !== normalizeEmployeeId(ap1.employeeId)) &&
        (!ap2 || normalizeEmployeeId(g.employeeId) !== normalizeEmployeeId(ap2.employeeId)),
    );
    if (distinctGms.length > 0) {
      return { nextStage: "pending_gm", recipientIds: distinctGms.map((g) => g.employeeId), stageLabel: `GM (${companyUnit})` };
    }
    return { nextStage: "pending_validate", recipientIds: hrIcfIds, stageLabel: "Validate (HR ICF)" };
  }

  if (afterStage === "pending_ap2") {
    const distinctGms = gms.filter(
      (g) => !ap2 || normalizeEmployeeId(g.employeeId) !== normalizeEmployeeId(ap2.employeeId),
    );
    if (distinctGms.length > 0) {
      return { nextStage: "pending_gm", recipientIds: distinctGms.map((g) => g.employeeId), stageLabel: `GM (${companyUnit})` };
    }
    return { nextStage: "pending_validate", recipientIds: hrIcfIds, stageLabel: "Validate (HR ICF)" };
  }

  return { nextStage: "pending_validate", recipientIds: hrIcfIds, stageLabel: "Validate (HR ICF)" };
}

/** Fase 1: Owner mengirim Edit [Target] Request ke Role HR ICF. */
export function submitTargetEditPhase1<TItem = Record<string, unknown>>(params: {
  owner: ManagedUser;
  category: string;
  reason: string;
  selectedKpiIds: string[];
  files: TargetEditAttachment[];
}): KpiTargetEditRequest<TItem> {
  const { owner, category, reason, selectedKpiIds, files } = params;
  const norm = normalizeEmployeeId(owner.employeeId);
  const today = formatTodayDDMMYYYY();
  const req: KpiTargetEditRequest<TItem> = {
    id: `TER-2026-${norm}`,
    employeeId: owner.employeeId,
    employeeName: owner.name,
    position: owner.position || "-",
    department: owner.department || "-",
    division: owner.division || "-",
    companyUnit: owner.company,
    stage: "pending_phase1_hricf",
    phase1Category: category,
    phase1Reason: reason,
    selectedKpiIds,
    phase1Files: files,
    phase1RequestedAt: today,
    decisions: [],
    updatedAt: new Date().toISOString(),
  };
  persistRequest(norm, req, `${owner.name} mengajukan Edit [Target] Request (Fase 1) ke HR ICF`, "Create");

  const users = loadManagedUsers();
  const hrIcfIds = findHrIcfIds(users);
  pushEmployeeNotification({
    employeeIds: [owner.employeeId],
    title: "Edit [Target] Request Terkirim ke HR ICF",
    summary: `Permintaan Edit [Target] KPI Anda ([${category}] ${reason}) telah dikirim ke HR ICF dan menunggu persetujuan Fase 1.`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Pending",
    ctaLabel: "Buka KPI Setting",
    ctaRoute: "/setting/kpi",
    senderName: owner.name,
  });
  if (hrIcfIds.length > 0) {
    pushEmployeeNotification({
      employeeIds: hrIcfIds,
      title: `Edit [Target] Request (Fase 1) — ${owner.name}`,
      summary: `${owner.name} (${owner.company}) mengajukan Edit [Target] Request KPI ([${category}]). Silakan review & Approve/Reject di Approvals → PA Setting → KPI.`,
      category: "Approval",
      moduleName: "KPI Setting",
      approvalStatus: "Pending",
      ctaLabel: "Review Edit Target Request",
      ctaRoute: "/approvals/setting/kpi",
      senderName: owner.name,
      senderRole: owner.role,
    });
  }
  return req;
}

/** Batalkan request oleh owner (selama masih menunggu Fase 1). */
export function cancelTargetEditPhase1(employeeId: string): void {
  const norm = normalizeEmployeeId(employeeId);
  const all = loadAllTargetEditRequests();
  if (!(norm in all)) return;
  delete all[norm];
  savePersistedState(KPI_TARGET_EDIT_KEY, all);
  window.dispatchEvent(new Event(KPI_TARGET_EDIT_EVENT));
  window.dispatchEvent(new Event("appraisal-updated"));
}

/** Fase 1 Decision oleh HR ICF: jika Approved -> owner dapat mengedit target KPI yang diminta. */
export function decideTargetEditPhase1(employeeId: string, approved: boolean, note = ""): void {
  const norm = normalizeEmployeeId(employeeId);
  const existing = getTargetEditRequestForEmployee(employeeId);
  if (!existing) return;
  const actor = getActiveUser();
  const today = formatTodayDDMMYYYY();
  const updated: KpiTargetEditRequest = {
    ...existing,
    stage: approved ? "phase1_approved" : "phase1_rejected",
    decisions: [
      ...existing.decisions,
      {
        stage: "Fase 1 — HR ICF",
        actorId: actor.employeeId,
        actorName: actor.name,
        status: approved ? "Approved" : "Rejected",
        note: note || undefined,
        at: today,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  persistRequest(
    norm,
    updated,
    `HR ICF (${actor.name}) ${approved ? "menyetujui" : "menolak"} Edit [Target] Request Fase 1 untuk ${existing.employeeName}`,
    approved ? "Approve" : "Reject",
  );
  pushEmployeeNotification({
    employeeIds: [existing.employeeId],
    title: approved
      ? "Edit [Target] Request Disetujui HR ICF — Silakan Edit Target KPI"
      : "Edit [Target] Request Ditolak HR ICF",
    summary: approved
      ? `Permintaan Edit [Target] KPI Anda telah disetujui oleh HR ICF (${actor.name}). Silakan buka KPI Setting → klik "Edit Monthly Target", isi komentar & upload memo pendukung (JPG/PDF), lalu Submit.`
      : `Permintaan Edit [Target] KPI Anda ditolak oleh HR ICF (${actor.name}).${note ? ` Catatan: ${note}` : ""}`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: approved ? "Approved" : "Rejected",
    ctaLabel: "Buka KPI Setting",
    ctaRoute: "/setting/kpi",
    senderName: actor.name,
    senderRole: actor.role || "HR ICF",
  });
}

/** Fase 2 Submit oleh Owner: setelah edit target + isi komentar wajib + upload memo & file pendukung (JPG/PDF). */
export function submitTargetEditPhase2<TItem = Record<string, unknown>>(params: {
  owner: ManagedUser;
  comment: string;
  memoFiles: TargetEditAttachment[];
  originalItems: TItem[];
  proposedItems: TItem[];
}): KpiTargetEditRequest<TItem> | null {
  const { owner, comment, memoFiles, originalItems, proposedItems } = params;
  const norm = normalizeEmployeeId(owner.employeeId);
  const existing = getTargetEditRequestForEmployee<TItem>(owner.employeeId);
  const users = loadManagedUsers();
  const nextInfo = resolveNextPhase2Stage(owner, owner.company, "start", users);
  const today = formatTodayDDMMYYYY();

  const updated: KpiTargetEditRequest<TItem> = {
    ...(existing ?? {
      id: `TER-2026-${norm}`,
      employeeId: owner.employeeId,
      employeeName: owner.name,
      position: owner.position || "-",
      department: owner.department || "-",
      division: owner.division || "-",
      companyUnit: owner.company,
      phase1Category: "Perubahan Target",
      phase1Reason: "-",
      selectedKpiIds: [],
      phase1Files: [],
      phase1RequestedAt: today,
      decisions: [],
    }),
    stage: nextInfo.nextStage,
    phase2Comment: comment,
    phase2MemoFiles: memoFiles,
    originalItems,
    proposedItems,
    phase2SubmittedAt: today,
    updatedAt: new Date().toISOString(),
  };
  persistRequest(
    norm,
    updated,
    `${owner.name} mensubmit perubahan target KPI (Fase 2) beserta komentar & ${memoFiles.length} file memo -> menunggu ${nextInfo.stageLabel}`,
    "Update",
  );

  pushEmployeeNotification({
    employeeIds: [owner.employeeId],
    title: "Perubahan Target KPI Berhasil Disubmit (Fase 2)",
    summary: `Perubahan target KPI Anda beserta komentar & ${memoFiles.length} lampiran memo telah dikirim ke alur persetujuan (Approver 1 → Approver 2 → GM → Validate HR ICF). Saat ini menunggu: ${nextInfo.stageLabel}.`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Submitted",
    ctaLabel: "Buka KPI Setting",
    ctaRoute: "/setting/kpi",
    senderName: owner.name,
  });
  if (nextInfo.recipientIds.length > 0) {
    pushEmployeeNotification({
      employeeIds: nextInfo.recipientIds,
      title: `Approval Perubahan Target KPI (${nextInfo.stageLabel}) — ${owner.name}`,
      summary: `${owner.name} (${owner.company}) telah mengedit target KPI beserta komentar & memo pendukung. Menunggu persetujuan Anda sebagai ${nextInfo.stageLabel}.`,
      category: "Approval",
      moduleName: "KPI Setting",
      approvalStatus: "Pending",
      ctaLabel: "Review Perubahan Target",
      ctaRoute: "/approvals/setting/kpi",
      senderName: owner.name,
      senderRole: owner.role,
    });
  }
  return updated;
}

/** Fase 2 Decision berjenjang: Approver 1 -> Approver 2 -> GM (unit usaha) -> Validate (HR ICF). */
export function decideTargetEditPhase2(employeeId: string, approved: boolean, note = ""): void {
  const norm = normalizeEmployeeId(employeeId);
  const existing = getTargetEditRequestForEmployee<Record<string, unknown>>(employeeId);
  if (!existing) return;
  const actor = getActiveUser();
  const users = loadManagedUsers();
  const owner = users.find((u) => normalizeEmployeeId(u.employeeId) === norm);
  const today = formatTodayDDMMYYYY();

  const stageDisplay: Record<string, string> = {
    pending_ap1: "Approver 1",
    pending_ap2: "Approver 2",
    pending_gm: `GM (${existing.companyUnit})`,
    pending_validate: "Validate (HR ICF)",
  };
  const curLabel = stageDisplay[existing.stage] ?? existing.stage;

  if (!approved) {
    const rejected: KpiTargetEditRequest<Record<string, unknown>> = {
      ...existing,
      stage: "phase1_approved", // Kembalikan ke owner agar bisa memperbaiki target & submit ulang
      decisions: [
        ...existing.decisions,
        {
          stage: curLabel,
          actorId: actor.employeeId,
          actorName: actor.name,
          status: "Rejected",
          note: note || undefined,
          at: today,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    persistRequest(norm, rejected, `${curLabel} (${actor.name}) meminta revisi/menolak perubahan target KPI ${existing.employeeName}`, "Reject");
    pushEmployeeNotification({
      employeeIds: [existing.employeeId],
      title: `Perubahan Target KPI Dikembalikan oleh ${curLabel}`,
      summary: `Pengajuan perubahan target KPI Anda dikembalikan oleh ${actor.name} (${curLabel}).${note ? ` Catatan: ${note}.` : ""} Anda dapat memperbaiki target dan submit kembali.`,
      category: "Approval",
      moduleName: "KPI",
      approvalStatus: "Revision",
      ctaLabel: "Perbaiki Target KPI",
      ctaRoute: "/setting/kpi",
      senderName: actor.name,
    });
    return;
  }

  if (existing.stage === "pending_validate") {
    // Final Validate oleh HR ICF -> terapkan proposedItems ke KPI Setting karyawan di backend Supabase!
    const validatedReq: KpiTargetEditRequest<Record<string, unknown>> = {
      ...existing,
      stage: "validated",
      decisions: [
        ...existing.decisions,
        {
          stage: "Validate (HR ICF)",
          actorId: actor.employeeId,
          actorName: actor.name,
          status: "Validated",
          note: note || undefined,
          at: today,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    if (Array.isArray(existing.proposedItems) && existing.proposedItems.length > 0) {
      try {
        const raw = safeGetLocalRaw("pa_kpi_setting_by_emp_v2");
        const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        map[norm] = existing.proposedItems;
        safeSetLocalJson("pa_kpi_setting_by_emp_v2", map);
        void mergeKvMapRecord("pa_kpi_setting_by_emp_v2", norm, existing.proposedItems);
        void syncToSupabase({
          kind: "kpi-setting",
          docKey: `${existing.employeeId}:personal:2026`,
          employeeId: existing.employeeId,
          companyUnit: existing.companyUnit,
          tab: "personal",
          period: "2026",
          items: existing.proposedItems,
          status: "Validated",
        });
      } catch {
        // ignore
      }
    }
    persistRequest(norm, validatedReq, `HR ICF (${actor.name}) memvalidasi (Validated) perubahan target KPI ${existing.employeeName}`, "Approve");
    pushEmployeeNotification({
      employeeIds: [existing.employeeId],
      title: "Perubahan Target KPI Telah Validated (HR ICF)",
      summary: `Perubahan target KPI Anda telah divalidasi oleh HR ICF (${actor.name}) dan resmi berlaku pada KPI Setting & KPI Tracking.`,
      category: "Approval",
      moduleName: "KPI",
      approvalStatus: "Validated",
      ctaLabel: "Lihat KPI Setting",
      ctaRoute: "/setting/kpi",
      senderName: actor.name,
      senderRole: "HR ICF",
    });
    return;
  }

  // Lanjutkan ke tahap berikutnya (pending_ap1 -> pending_ap2 -> pending_gm -> pending_validate)
  const nextInfo = resolveNextPhase2Stage(
    owner,
    existing.companyUnit,
    existing.stage as "pending_ap1" | "pending_ap2" | "pending_gm",
    users,
  );
  const advanced: KpiTargetEditRequest<Record<string, unknown>> = {
    ...existing,
    stage: nextInfo.nextStage,
    decisions: [
      ...existing.decisions,
      {
        stage: curLabel,
        actorId: actor.employeeId,
        actorName: actor.name,
        status: "Approved",
        note: note || undefined,
        at: today,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  persistRequest(
    norm,
    advanced,
    `${curLabel} (${actor.name}) menyetujui perubahan target KPI ${existing.employeeName} -> diteruskan ke ${nextInfo.stageLabel}`,
    "Approve",
  );

  pushEmployeeNotification({
    employeeIds: [existing.employeeId],
    title: `Perubahan Target KPI Disetujui ${curLabel}`,
    summary: `Perubahan target KPI Anda telah disetujui oleh ${actor.name} (${curLabel}) dan kini diteruskan ke ${nextInfo.stageLabel}.`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Approved",
    ctaLabel: "Lihat Status KPI Setting",
    ctaRoute: "/setting/kpi",
    senderName: actor.name,
  });
  if (nextInfo.recipientIds.length > 0) {
    pushEmployeeNotification({
      employeeIds: nextInfo.recipientIds,
      title: `Approval Perubahan Target KPI (${nextInfo.stageLabel}) — ${existing.employeeName}`,
      summary: `Pengajuan perubahan target KPI dari ${existing.employeeName} (${existing.companyUnit}) telah disetujui oleh ${curLabel} (${actor.name}) dan kini menunggu tindakan Anda sebagai ${nextInfo.stageLabel}.`,
      category: "Approval",
      moduleName: "KPI Setting",
      approvalStatus: "Pending",
      ctaLabel: "Review Perubahan Target",
      ctaRoute: "/approvals/setting/kpi",
      senderName: actor.name,
    });
  }
}

/** Cek apakah user yang sedang login berhak menindaklanjuti request Edit [Target] ini pada tahap aktif saat ini. */
export function canViewerActOnTargetEdit(
  req: KpiTargetEditRequest<unknown>,
  viewer: ManagedUser,
  allUsers = loadManagedUsers(),
): { canAct: boolean; roleLabel: string } {
  const isHrIcf = isAdminOrHrIcfRole(viewer.role) || Boolean(viewer.isHrIcfValidator);
  const normViewer = normalizeEmployeeId(viewer.employeeId);
  const owner = allUsers.find((u) => normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(req.employeeId));

  if (req.stage === "pending_phase1_hricf") {
    return { canAct: isHrIcf, roleLabel: "HR ICF (Fase 1)" };
  }
  if (req.stage === "pending_ap1") {
    const ap1 = owner ? findUserByRef(allUsers, owner.regNoAp1) : undefined;
    return {
      canAct: Boolean((ap1 && normalizeEmployeeId(ap1.employeeId) === normViewer) || isHrIcf),
      roleLabel: "Approver 1",
    };
  }
  if (req.stage === "pending_ap2") {
    const ap2 = owner ? findUserByRef(allUsers, owner.regNoAp2) : undefined;
    return {
      canAct: Boolean((ap2 && normalizeEmployeeId(ap2.employeeId) === normViewer) || isHrIcf),
      roleLabel: "Approver 2",
    };
  }
  if (req.stage === "pending_gm") {
    const isUnitGm = viewer.role === "GM" && isSameCompanyUnit(viewer.company, req.companyUnit);
    return { canAct: isUnitGm || isHrIcf, roleLabel: `GM (${req.companyUnit})` };
  }
  if (req.stage === "pending_validate") {
    return { canAct: isHrIcf, roleLabel: "Validate (HR ICF)" };
  }
  return { canAct: false, roleLabel: "-" };
}

export function getPendingTargetEditRequestsForViewer(
  viewer: ManagedUser,
  allUsers = loadManagedUsers(),
): Array<{ req: KpiTargetEditRequest<Record<string, unknown>>; roleLabel: string }> {
  const all = Object.values(loadAllTargetEditRequests<Record<string, unknown>>());
  const out: Array<{ req: KpiTargetEditRequest<Record<string, unknown>>; roleLabel: string }> = [];
  for (const r of all) {
    if (!r.stage.startsWith("pending_")) continue;
    const check = canViewerActOnTargetEdit(r, viewer, allUsers);
    // Untuk Admin/HR ICF, pada tahap pending_ap1/ap2/gm jangan banjiri dashboard kecuali tahapnya memang HR ICF (pending_phase1_hricf / pending_validate)
    const isStrictStageMatch =
      r.stage === "pending_phase1_hricf" ||
      r.stage === "pending_validate" ||
      (r.stage === "pending_gm" && viewer.role === "GM" && isSameCompanyUnit(viewer.company, r.companyUnit)) ||
      (() => {
        const owner = allUsers.find((u) => normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(r.employeeId));
        if (!owner) return false;
        if (r.stage === "pending_ap1") {
          const ap1 = findUserByRef(allUsers, owner.regNoAp1);
          return Boolean(ap1 && normalizeEmployeeId(ap1.employeeId) === normalizeEmployeeId(viewer.employeeId));
        }
        if (r.stage === "pending_ap2") {
          const ap2 = findUserByRef(allUsers, owner.regNoAp2);
          return Boolean(ap2 && normalizeEmployeeId(ap2.employeeId) === normalizeEmployeeId(viewer.employeeId));
        }
        return false;
      })();
    if (isStrictStageMatch && check.canAct) {
      out.push({ req: r, roleLabel: check.roleLabel });
    }
  }
  return out;
}

export interface ApproverChainEntry {
  label: string;
  name: string;
  role: string;
  employeeId?: string;
}

function describeUser(u: ManagedUser): string {
  return u.position?.trim() || String(u.role || "");
}

/**
 * Approver Edit [KPI] Request (Approver 1 & Approver 2) diambil dari Reg No AP1 / Reg No AP2 owner.
 * Bila AP1 & AP2 orang yang sama, hanya ditampilkan satu kali.
 */
export function resolveEditRequestApprovers(owner?: ManagedUser): ApproverChainEntry[] {
  const users = loadManagedUsers();
  const target = owner ?? getActiveUser();
  const ap1 = findUserByRef(users, target.regNoAp1);
  const ap2 = findUserByRef(users, target.regNoAp2);
  const out: ApproverChainEntry[] = [];
  if (ap1) out.push({ label: "Approver 1", name: ap1.name, role: describeUser(ap1), employeeId: ap1.employeeId });
  if (ap2 && (!ap1 || normalizeEmployeeId(ap2.employeeId) !== normalizeEmployeeId(ap1.employeeId))) {
    out.push({ label: "Approver 2", name: ap2.name, role: describeUser(ap2), employeeId: ap2.employeeId });
  }
  return out;
}

/** Approver Fase 1 Edit [Target] Request: Role HR ICF. */
export function resolveTargetEditPhase1Approver(): ApproverChainEntry {
  const users = loadManagedUsers();
  const ids = findHrIcfIds(users);
  const first = users.find((u) => ids.includes(u.employeeId));
  return { label: "Approver", name: first?.name ?? "HR ICF", role: "HR ICF", employeeId: first?.employeeId };
}

/** Rantai Fase 2 Edit [Target] Request: Approver 1 -> Approver 2 -> GM (Unit Usaha) -> Validate (HR ICF). */
export function resolveTargetEditPhase2Chain(owner?: ManagedUser): ApproverChainEntry[] {
  const users = loadManagedUsers();
  const target = owner ?? getActiveUser();
  const chain: ApproverChainEntry[] = [...resolveEditRequestApprovers(target)];
  const usedIds = new Set(chain.map((c) => normalizeEmployeeId(c.employeeId ?? "")));
  const gms = findUnitGmUsers(users, target.company, target.employeeId).filter(
    (g) => !usedIds.has(normalizeEmployeeId(g.employeeId)),
  );
  if (gms.length > 0) {
    chain.push({ label: "GM", name: gms.map((g) => g.name).join(", "), role: `General Manager (${target.company})`, employeeId: gms[0].employeeId });
  }
  const validator = resolveTargetEditPhase1Approver();
  chain.push({ label: "Validate", name: validator.name, role: "HR ICF", employeeId: validator.employeeId });
  return chain;
}
