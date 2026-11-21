import {
  canCheckerHandleCompanyUnit,
  findHrIcfValidatorUser,
  findHrUnitCheckerUserForCompany,
  getActiveUser,
  isAdminOrHrIcfRole,
  loadManagedUsers,
  shouldBypassCheckerForSubmission,
  type ManagedUser,
} from "./authStore";
import { loadPersistedState, refreshKvKeysFromBackend, safeGetLocalRaw, savePersistedState } from "../services/supabaseClient";
import { pushEmployeeNotification } from "./notificationStore";
import { normalizeEmployeeId, type EditedKpiCellDiff } from "../pages/shared/appraisalWorkflowStore";
import { formatTodayDDMMYYYY } from "../utils/dateFormat";
import type { ApprovalRow } from "../components/ReviewDrawer";

export const KPI_TRACKING_EDIT_KEY = "pa_kpi_tracking_edit_requests_v1";
export const KPI_TRACKING_EDIT_EVENT = "pa-kpi-tracking-edit-updated";

export type KpiTrackingEditStage =
  | "pending_checker"
  | "pending_ap1"
  | "pending_ap2"
  | "pending_validator"
  | "approved"
  | "revision"
  | "rejected"
  | "completed"
  | "cancelled";

export interface KpiTrackingEditChainStep {
  stage: "checker" | "approver1" | "approver2" | "validator";
  label: string;
  employeeId: string;
  name: string;
  position: string;
  bypassed?: boolean;
}

export interface KpiTrackingEditDecisionEntry {
  stage: "checker" | "approver1" | "approver2" | "validator";
  roleLabel: string;
  approverId: string;
  approverName: string;
  decision: "Checked" | "Approved" | "Validated" | "Revision" | "Rejected";
  note?: string;
  decidedAt: string;
}

export interface KpiTrackingEditRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  companyUnit: string;
  division: string;
  department: string;
  bagian: string;
  position: string;
  targets: Array<{ kpiNo: string; monthId: string }>;
  kpiSummaries: Array<{ no: string; perspektif: string; kpiTitle: string }>;
  monthLabels: string[];
  reason: string;
  requestedAt: string;
  stage: KpiTrackingEditStage;
  bypassChecker: boolean;
  sameAp1Ap2: boolean;
  decisions: KpiTrackingEditDecisionEntry[];
  previousCellsSnapshot?: Record<string, Record<string, string>>;
  editedCellsDiff?: Record<string, EditedKpiCellDiff>;
  updatedAt: string;
}

function resolveUserByRef(allUsers: ManagedUser[], ref?: string): ManagedUser | undefined {
  const clean = String(ref ?? "").trim().toLowerCase();
  if (!clean) return undefined;
  const cleanNum = clean.replace(/^(?:emp-?|e)0*/i, "");
  return allUsers.find(
    (u) =>
      u.status === "Active" &&
      ((u.regNo ?? "").trim().toLowerCase() === clean ||
        u.employeeId.trim().toLowerCase() === clean ||
        u.name.trim().toLowerCase() === clean ||
        Boolean(cleanNum && u.employeeId.trim().toLowerCase().replace(/^(?:emp-?|e)0*/i, "") === cleanNum)),
  );
}

export function resolveKpiTrackingEditChain(
  ownerUser: ManagedUser = getActiveUser(),
  allUsers: ManagedUser[] = loadManagedUsers(),
): {
  steps: KpiTrackingEditChainStep[];
  bypassChecker: boolean;
  sameAp1Ap2: boolean;
  allApproverIds: string[];
} {
  const bypassChecker = shouldBypassCheckerForSubmission(ownerUser.employeeId);
  const checkerUser = findHrUnitCheckerUserForCompany(ownerUser.company, ownerUser.employeeId, allUsers);
  const ap1User = resolveUserByRef(allUsers, ownerUser.regNoAp1);
  const ap2User = resolveUserByRef(allUsers, ownerUser.regNoAp2) ?? ap1User;
  const validatorUser = findHrIcfValidatorUser(allUsers);

  const sameAp1Ap2 = Boolean(
    ap1User &&
      ap2User &&
      ap1User.employeeId.trim().toLowerCase() === ap2User.employeeId.trim().toLowerCase(),
  );

  const steps: KpiTrackingEditChainStep[] = [
    {
      stage: "checker",
      label: "HR Unit Checker",
      employeeId: checkerUser?.employeeId ?? "",
      name: checkerUser?.name ?? `HR Unit (${ownerUser.company})`,
      position: bypassChecker
        ? "Bypass otomatis (pengajuan milik HR Unit Checker)"
        : checkerUser?.position ?? "HR Unit Checker",
      bypassed: bypassChecker,
    },
    {
      stage: "approver1",
      label: "Approver 1",
      employeeId: ap1User?.employeeId ?? "",
      name: ap1User?.name ?? (ownerUser.regNoAp1 || "Belum terdaftar"),
      position: ap1User?.position ?? "Atasan Langsung (AP1)",
    },
    {
      stage: "approver2",
      label: "Approver 2",
      employeeId: ap2User?.employeeId ?? "",
      name: ap2User?.name ?? (ownerUser.regNoAp2 || ap1User?.name || "Belum terdaftar"),
      position: ap2User?.position ?? "Atasan Tidak Langsung (AP2)",
    },
    {
      stage: "validator",
      label: "HR ICF Validator",
      employeeId: validatorUser?.employeeId ?? "",
      name: validatorUser?.name ?? "HR ICF",
      position: validatorUser?.position ?? "HR ICF Validator",
    },
  ];

  const allIdSet = new Set<string>();
  if (!bypassChecker) {
    allUsers
      .filter(
        (u) =>
          u.status === "Active" &&
          u.employeeId.toLowerCase() !== ownerUser.employeeId.toLowerCase() &&
          canCheckerHandleCompanyUnit(u, ownerUser.company),
      )
      .forEach((u) => allIdSet.add(u.employeeId));
  }
  if (ap1User?.employeeId) allIdSet.add(ap1User.employeeId);
  if (ap2User?.employeeId) allIdSet.add(ap2User.employeeId);
  allUsers
    .filter((u) => u.status === "Active" && (u.role === "HR ICF" || Boolean(u.isHrIcfValidator) || u.role === "Administrator"))
    .forEach((u) => allIdSet.add(u.employeeId));

  return {
    steps,
    bypassChecker,
    sameAp1Ap2,
    allApproverIds: Array.from(allIdSet),
  };
}

export function loadKpiTrackingEditRequests(): KpiTrackingEditRequest[] {
  const list = loadPersistedState<KpiTrackingEditRequest[]>(KPI_TRACKING_EDIT_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function refreshKpiTrackingEditRequestsFromBackend(): Promise<void> {
  try {
    await refreshKvKeysFromBackend([KPI_TRACKING_EDIT_KEY]);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(KPI_TRACKING_EDIT_EVENT));
    }
  } catch {
    // ignore
  }
}

function saveKpiTrackingEditRequests(
  list: KpiTrackingEditRequest[],
  audit?: { action: string; description: string },
): void {
  const actor = getActiveUser();
  savePersistedState(KPI_TRACKING_EDIT_KEY, list, {
    kind: "kv-state",
    stateKey: KPI_TRACKING_EDIT_KEY,
    stateValue: list,
    audit: audit
      ? {
          userId: actor.employeeId,
          userName: actor.name,
          role: actor.role,
          action: audit.action,
          module: "KPI",
          subModule: "Edit Request KPI Tracking",
          description: audit.description,
        }
      : undefined,
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KPI_TRACKING_EDIT_EVENT));
    window.dispatchEvent(new Event("appraisal-updated"));
  }
}

export function getLatestKpiTrackingEditForEmployee(employeeId: string): KpiTrackingEditRequest | undefined {
  const norm = normalizeEmployeeId(employeeId);
  return loadKpiTrackingEditRequests().find(
    (r) =>
      (normalizeEmployeeId(r.employeeId) === norm || r.employeeId.toLowerCase() === employeeId.toLowerCase()) &&
      r.stage !== "cancelled" &&
      r.stage !== "completed",
  );
}

export function getStageDisplayLabel(stage: KpiTrackingEditStage): string {
  switch (stage) {
    case "pending_checker":
      return "Pending HR Unit Check";
    case "pending_ap1":
      return "Pending Approver 1";
    case "pending_ap2":
      return "Pending Approver 2";
    case "pending_validator":
      return "Pending HR ICF Validate";
    case "approved":
      return "Approved (Validated)";
    case "revision":
      return "Revision Requested";
    case "rejected":
      return "Rejected";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

export function canViewerActOnTrackingEditStage(
  viewer: ManagedUser,
  req: KpiTrackingEditRequest,
  allUsers: ManagedUser[] = loadManagedUsers(),
): "checker" | "approver1" | "approver2" | "validator" | null {
  const owner =
    allUsers.find(
      (u) =>
        normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(req.employeeId) ||
        u.employeeId.toLowerCase() === req.employeeId.toLowerCase(),
    ) ?? null;
  const viewerIdLower = viewer.employeeId.trim().toLowerCase();
  if (viewerIdLower === req.employeeId.trim().toLowerCase()) return null;

  if (req.stage === "pending_checker") {
    if (canCheckerHandleCompanyUnit(viewer, req.companyUnit)) return "checker";
    return null;
  }
  if (req.stage === "pending_ap1") {
    const ap1 = owner ? resolveUserByRef(allUsers, owner.regNoAp1) : undefined;
    if (ap1 && ap1.employeeId.trim().toLowerCase() === viewerIdLower) return "approver1";
    return null;
  }
  if (req.stage === "pending_ap2") {
    const ap1 = owner ? resolveUserByRef(allUsers, owner.regNoAp1) : undefined;
    const ap2 = owner ? resolveUserByRef(allUsers, owner.regNoAp2) ?? ap1 : undefined;
    if (ap2 && ap2.employeeId.trim().toLowerCase() === viewerIdLower) return "approver2";
    return null;
  }
  if (req.stage === "pending_validator") {
    if (isAdminOrHrIcfRole(viewer.role) || Boolean(viewer.isHrIcfValidator)) return "validator";
    return null;
  }
  return null;
}

export function isViewerInTrackingEditChain(
  viewer: ManagedUser,
  req: KpiTrackingEditRequest,
  allUsers: ManagedUser[] = loadManagedUsers(),
): boolean {
  const owner = allUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(req.employeeId) ||
      u.employeeId.toLowerCase() === req.employeeId.toLowerCase(),
  );
  const viewerIdLower = viewer.employeeId.trim().toLowerCase();
  if (viewerIdLower === req.employeeId.trim().toLowerCase()) return false;
  if (!req.bypassChecker && canCheckerHandleCompanyUnit(viewer, req.companyUnit)) return true;
  if (isAdminOrHrIcfRole(viewer.role) || Boolean(viewer.isHrIcfValidator)) return true;
  if (owner) {
    const ap1 = resolveUserByRef(allUsers, owner.regNoAp1);
    const ap2 = resolveUserByRef(allUsers, owner.regNoAp2) ?? ap1;
    if (ap1 && ap1.employeeId.trim().toLowerCase() === viewerIdLower) return true;
    if (ap2 && ap2.employeeId.trim().toLowerCase() === viewerIdLower) return true;
  }
  return req.decisions.some((d) => d.approverId.trim().toLowerCase() === viewerIdLower);
}

export function submitKpiTrackingEditRequest(params: {
  ownerUser: ManagedUser;
  targets: Array<{ kpiNo: string; monthId: string }>;
  kpiSummaries: Array<{ no: string; perspektif: string; kpiTitle: string }>;
  monthLabels: string[];
  reason: string;
}): KpiTrackingEditRequest {
  const allUsers = loadManagedUsers();
  const chain = resolveKpiTrackingEditChain(params.ownerUser, allUsers);
  const todayStr = formatTodayDDMMYYYY();
  const nowIso = new Date().toISOString();
  const initialStage: KpiTrackingEditStage = chain.bypassChecker ? "pending_ap1" : "pending_checker";

  const existing = loadKpiTrackingEditRequests().map((r) =>
    normalizeEmployeeId(r.employeeId) === normalizeEmployeeId(params.ownerUser.employeeId) &&
    (r.stage.startsWith("pending_") || r.stage === "approved" || r.stage === "revision")
      ? { ...r, stage: "cancelled" as const, updatedAt: nowIso }
      : r,
  );

  const created: KpiTrackingEditRequest = {
    id: `kpitredit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeId: params.ownerUser.employeeId,
    employeeName: params.ownerUser.name,
    companyUnit: params.ownerUser.company,
    division: params.ownerUser.division,
    department: params.ownerUser.department,
    bagian: params.ownerUser.bagian || "",
    position: params.ownerUser.position,
    targets: params.targets,
    kpiSummaries: params.kpiSummaries,
    monthLabels: params.monthLabels,
    reason: params.reason.trim(),
    requestedAt: todayStr,
    stage: initialStage,
    bypassChecker: chain.bypassChecker,
    sameAp1Ap2: chain.sameAp1Ap2,
    decisions: [],
    updatedAt: nowIso,
  };

  saveKpiTrackingEditRequests([created, ...existing], {
    action: "Create",
    description: `${params.ownerUser.name} (${params.ownerUser.employeeId}) submitted KPI Tracking Edit Request for months [${params.monthLabels.join(", ")}]`,
  });

  const kpiListLabel = params.kpiSummaries.map((k) => `${k.no}. ${k.perspektif} - ${k.kpiTitle}`).join("; ");
  // 1. Notifikasi ke Requester
  pushEmployeeNotification({
    employeeIds: [params.ownerUser.employeeId],
    title: "Request Edit KPI Tracking Terkirim",
    summary: `Permintaan edit KPI Tracking Anda untuk bulan ${params.monthLabels.join(", ")} (${kpiListLabel}) telah dikirim ke rantai Approver (HR Unit Checker → Approver 1 → Approver 2 → HR ICF Validator).`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Submitted",
    ctaLabel: "Lihat KPI Tracking",
    ctaRoute: "/measurement/kpi-tracking",
    senderName: params.ownerUser.name,
    senderRole: params.ownerUser.role,
  });

  // 2. Notifikasi ke seluruh Approver dalam skema (Checker, AP1, AP2, Validator)
  if (chain.allApproverIds.length > 0) {
    pushEmployeeNotification({
      employeeIds: chain.allApproverIds,
      title: `Request Edit KPI Tracking — ${params.ownerUser.name}`,
      summary: `${params.ownerUser.name} (${params.ownerUser.employeeId}) mengajukan Request Edit KPI Tracking pada bulan ${params.monthLabels.join(", ")}. Alasan: "${created.reason}". Silakan tinjau pada menu Approvals → Performance Appraisal Measurement.`,
      category: "Approval",
      moduleName: "KPI",
      approvalStatus: "Pending",
      ctaLabel: "Review Edit Request",
      ctaRoute: "/approvals/measurement/kpi",
      senderName: params.ownerUser.name,
      senderRole: params.ownerUser.role,
    });
  }

  return created;
}

export function approveKpiTrackingEditRequest(
  requestId: string,
  actor: ManagedUser = getActiveUser(),
  note?: string,
): KpiTrackingEditRequest | null {
  const allUsers = loadManagedUsers();
  const list = loadKpiTrackingEditRequests();
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  const req = list[idx];
  const stageRole = canViewerActOnTrackingEditStage(actor, req, allUsers);
  if (!stageRole) return null;

  const todayStr = formatTodayDDMMYYYY();
  const nowIso = new Date().toISOString();
  const roleLabel =
    stageRole === "checker"
      ? "HR Unit Checker"
      : stageRole === "approver1"
      ? "Approver 1"
      : stageRole === "approver2"
      ? "Approver 2"
      : "HR ICF Validator";

  const stageDecisionWord: KpiTrackingEditDecisionEntry["decision"] =
    stageRole === "checker"
      ? "Checked"
      : stageRole === "validator"
      ? "Validated"
      : "Approved";

  const nextDecisions: KpiTrackingEditDecisionEntry[] = [
    ...req.decisions,
    {
      stage: stageRole,
      roleLabel,
      approverId: actor.employeeId,
      approverName: actor.name,
      decision: stageDecisionWord,
      note: note?.trim() || undefined,
      decidedAt: todayStr,
    },
  ];

  let nextStage: KpiTrackingEditStage = "approved";
  if (stageRole === "checker") {
    nextStage = "pending_ap1";
  } else if (stageRole === "approver1") {
    if (req.sameAp1Ap2) {
      nextDecisions.push({
        stage: "approver2",
        roleLabel: "Approver 2",
        approverId: actor.employeeId,
        approverName: actor.name,
        decision: "Approved",
        note: note?.trim() || undefined,
        decidedAt: todayStr,
      });
      nextStage = "pending_validator";
    } else {
      nextStage = "pending_ap2";
    }
  } else if (stageRole === "approver2") {
    nextStage = "pending_validator";
  } else {
    nextStage = "approved";
  }

  let previousCellsSnapshot = req.previousCellsSnapshot;
  if (nextStage === "approved" && !previousCellsSnapshot) {
    try {
      const normEmp = normalizeEmployeeId(req.employeeId);
      const rawSnap = safeGetLocalRaw(`kpi_tracking_v1_${normEmp}`);
      if (rawSnap) {
        const parsed = JSON.parse(rawSnap) as { cellsMap?: Record<string, Record<string, string>> };
        if (parsed?.cellsMap && typeof parsed.cellsMap === "object") {
          previousCellsSnapshot = JSON.parse(JSON.stringify(parsed.cellsMap));
        }
      }
    } catch {
      // ignore
    }
  }

  const updated: KpiTrackingEditRequest = {
    ...req,
    stage: nextStage,
    decisions: nextDecisions,
    previousCellsSnapshot,
    updatedAt: nowIso,
  };
  const nextList = [...list];
  nextList[idx] = updated;
  saveKpiTrackingEditRequests(nextList, {
    action: "Approve",
    description: `${actor.name} (${roleLabel}) approved KPI Tracking Edit Request for ${req.employeeName} (${req.employeeId}) -> ${nextStage}`,
  });

  if (nextStage === "approved") {
    pushEmployeeNotification({
      employeeIds: [req.employeeId],
      title: "Request Edit KPI Tracking Disetujui",
      summary: `Permintaan edit KPI Tracking Anda untuk bulan ${req.monthLabels.join(", ")} telah disetujui seluruh Approver dan divalidasi oleh HR ICF (${actor.name}). Anda kini dapat mengedit sel KPI & bulan tersebut lalu klik Re-submit.`,
      category: "Approval",
      moduleName: "KPI",
      approvalStatus: "Validated",
      ctaLabel: "Edit KPI Tracking",
      ctaRoute: "/measurement/kpi-tracking",
      senderName: actor.name,
      senderRole: roleLabel,
    });
  } else {
    const owner = allUsers.find((u) => normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(req.employeeId));
    let nextTargetIds: string[] = [];
    if (nextStage === "pending_ap1" && owner) {
      const ap1 = resolveUserByRef(allUsers, owner.regNoAp1);
      if (ap1) nextTargetIds = [ap1.employeeId];
    } else if (nextStage === "pending_ap2" && owner) {
      const ap2 = resolveUserByRef(allUsers, owner.regNoAp2) ?? resolveUserByRef(allUsers, owner.regNoAp1);
      if (ap2) nextTargetIds = [ap2.employeeId];
    } else if (nextStage === "pending_validator") {
      nextTargetIds = allUsers
        .filter((u) => u.status === "Active" && (isAdminOrHrIcfRole(u.role) || Boolean(u.isHrIcfValidator)))
        .map((u) => u.employeeId);
    }
    if (nextTargetIds.length > 0) {
      pushEmployeeNotification({
        employeeIds: nextTargetIds,
        title: `Menunggu Persetujuan Anda: Edit KPI Tracking — ${req.employeeName}`,
        summary: `${roleLabel} (${actor.name}) telah menyetujui Request Edit KPI Tracking dari ${req.employeeName} (${req.monthLabels.join(", ")}). Kini menunggu tindak lanjut Anda.`,
        category: "Approval",
        moduleName: "KPI",
        approvalStatus: "Pending",
        ctaLabel: "Review Edit Request",
        ctaRoute: "/approvals/measurement/kpi",
        senderName: actor.name,
        senderRole: roleLabel,
      });
    }
  }
  return updated;
}

export function reviseKpiTrackingEditRequest(
  requestId: string,
  actor: ManagedUser = getActiveUser(),
  note?: string,
): KpiTrackingEditRequest | null {
  const allUsers = loadManagedUsers();
  const list = loadKpiTrackingEditRequests();
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  const req = list[idx];
  const stageRole = canViewerActOnTrackingEditStage(actor, req, allUsers);
  if (!stageRole) return null;

  const todayStr = formatTodayDDMMYYYY();
  const nowIso = new Date().toISOString();
  const roleLabel =
    stageRole === "checker"
      ? "HR Unit Checker"
      : stageRole === "validator"
      ? "HR ICF Validator"
      : stageRole === "approver2"
      ? "Approver 2"
      : "Approver 1";

  const updated: KpiTrackingEditRequest = {
    ...req,
    stage: "revision",
    decisions: [
      ...req.decisions,
      {
        stage: stageRole,
        roleLabel,
        approverId: actor.employeeId,
        approverName: actor.name,
        decision: "Revision",
        note: note?.trim() || undefined,
        decidedAt: todayStr,
      },
    ],
    updatedAt: nowIso,
  };
  const nextList = [...list];
  nextList[idx] = updated;
  saveKpiTrackingEditRequests(nextList, {
    action: "Update",
    description: `${actor.name} (${roleLabel}) requested revision on KPI Tracking Edit Request for ${req.employeeName} (${req.employeeId})`,
  });

  pushEmployeeNotification({
    employeeIds: [req.employeeId],
    title: `Revisi Request Edit KPI Tracking (${roleLabel})`,
    summary: `Pengajuan Request Edit KPI Tracking Anda untuk bulan ${req.monthLabels.join(", ")} dikembalikan untuk revisi oleh ${roleLabel} (${actor.name}).${note?.trim() ? ` Catatan Revisi: ${note.trim()}` : ""}`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Revision",
    ctaLabel: "Buka KPI Tracking",
    ctaRoute: "/measurement/kpi-tracking",
    senderName: actor.name,
    senderRole: roleLabel,
  });

  return updated;
}

export function rejectKpiTrackingEditRequest(
  requestId: string,
  actor: ManagedUser = getActiveUser(),
  note?: string,
): KpiTrackingEditRequest | null {
  const allUsers = loadManagedUsers();
  const list = loadKpiTrackingEditRequests();
  const idx = list.findIndex((r) => r.id === requestId);
  if (idx < 0) return null;
  const req = list[idx];
  const stageRole = canViewerActOnTrackingEditStage(actor, req, allUsers);
  if (!stageRole) return null;

  const todayStr = formatTodayDDMMYYYY();
  const nowIso = new Date().toISOString();
  const roleLabel =
    stageRole === "checker"
      ? "HR Unit Checker"
      : stageRole === "approver1"
      ? "Approver 1"
      : stageRole === "approver2"
      ? "Approver 2"
      : "HR ICF Validator";

  const updated: KpiTrackingEditRequest = {
    ...req,
    stage: "rejected",
    decisions: [
      ...req.decisions,
      {
        stage: stageRole,
        roleLabel,
        approverId: actor.employeeId,
        approverName: actor.name,
        decision: "Rejected",
        note: note?.trim() || undefined,
        decidedAt: todayStr,
      },
    ],
    updatedAt: nowIso,
  };
  const nextList = [...list];
  nextList[idx] = updated;
  saveKpiTrackingEditRequests(nextList, {
    action: "Reject",
    description: `${actor.name} (${roleLabel}) rejected KPI Tracking Edit Request for ${req.employeeName} (${req.employeeId})`,
  });

  pushEmployeeNotification({
    employeeIds: [req.employeeId],
    title: "Request Edit KPI Tracking Ditolak",
    summary: `Permintaan edit KPI Tracking Anda untuk bulan ${req.monthLabels.join(", ")} ditolak oleh ${roleLabel} (${actor.name}).${note?.trim() ? ` Catatan: ${note.trim()}` : ""}`,
    category: "Approval",
    moduleName: "KPI",
    approvalStatus: "Rejected",
    ctaLabel: "Buka KPI Tracking",
    ctaRoute: "/measurement/kpi-tracking",
    senderName: actor.name,
    senderRole: roleLabel,
  });

  return updated;
}

export function cancelOwnKpiTrackingEditRequest(employeeId: string): void {
  const norm = normalizeEmployeeId(employeeId);
  const nowIso = new Date().toISOString();
  const list = loadKpiTrackingEditRequests();
  let changed = false;
  const next = list.map((r) => {
    if (normalizeEmployeeId(r.employeeId) === norm && r.stage.startsWith("pending_")) {
      changed = true;
      return { ...r, stage: "cancelled" as const, updatedAt: nowIso };
    }
    return r;
  });
  if (changed) {
    saveKpiTrackingEditRequests(next, {
      action: "Update",
      description: `Employee ${employeeId} cancelled pending KPI Tracking Edit Request`,
    });
  }
}

export function completeKpiTrackingEditSession(
  employeeId: string,
  editedCellsDiff?: Record<string, EditedKpiCellDiff>,
): void {
  const norm = normalizeEmployeeId(employeeId);
  const nowIso = new Date().toISOString();
  const list = loadKpiTrackingEditRequests();
  let changed = false;
  const next = list.map((r) => {
    if (normalizeEmployeeId(r.employeeId) === norm && r.stage === "approved") {
      changed = true;
      return {
        ...r,
        stage: "completed" as const,
        editedCellsDiff: editedCellsDiff ?? r.editedCellsDiff,
        updatedAt: nowIso,
      };
    }
    return r;
  });
  if (changed) {
    saveKpiTrackingEditRequests(next, {
      action: "Update",
      description: `Employee ${employeeId} completed & re-submitted approved KPI Tracking Edit`,
    });
  }
}

export function getLatestEditedCellsDiffForEmployee(
  employeeId: string,
): Record<string, EditedKpiCellDiff> | undefined {
  const norm = normalizeEmployeeId(employeeId);
  const completed = loadKpiTrackingEditRequests().find(
    (r) =>
      (normalizeEmployeeId(r.employeeId) === norm || r.employeeId.toLowerCase() === employeeId.toLowerCase()) &&
      r.stage === "completed" &&
      r.editedCellsDiff &&
      Object.keys(r.editedCellsDiff).length > 0,
  );
  return completed?.editedCellsDiff;
}

export function getKpiTrackingEditApprovalRowsForViewer(
  viewer: ManagedUser,
  allUsers: ManagedUser[] = loadManagedUsers(),
  lockedUnits?: string[],
): ApprovalRow[] {
  const list = loadKpiTrackingEditRequests();
  const rows: ApprovalRow[] = [];
  for (const req of list) {
    if (req.stage === "cancelled") continue;
    if (lockedUnits && lockedUnits.length > 0 && !lockedUnits.includes(req.companyUnit)) continue;
    const actStage = canViewerActOnTrackingEditStage(viewer, req, allUsers);
    const inChain = isViewerInTrackingEditChain(viewer, req, allUsers);
    if (!actStage && !inChain) continue;

    const kpiSummaryText = req.kpiSummaries
      .map((k) => `${k.no}. ${k.perspektif} - ${k.kpiTitle}`)
      .join("\n");
    const fullReason = `Bulan: ${req.monthLabels.join(", ")}\nKPI:\n${kpiSummaryText}\n\nAlasan: ${req.reason}`;
    const lastDecision = req.decisions[req.decisions.length - 1];

    let rowStatus = "Edit Request";
    if (!actStage) {
      const myDec = [...req.decisions]
        .reverse()
        .find((d) => d.approverId.trim().toLowerCase() === viewer.employeeId.trim().toLowerCase());
      if (!myDec && req.stage.startsWith("pending_")) {
        // Belum tiba di giliran viewer ini -> jangan tampilkan dulu di Pending Task viewer ini
        continue;
      }
      if (req.stage === "rejected") {
        rowStatus = "EditRequest-Rejected";
      } else if (req.stage === "revision") {
        rowStatus = "Revision";
      } else if (req.stage === "approved" || req.stage === "completed") {
        rowStatus = "EditRequest-AcceptedA2";
      } else if (req.stage === "pending_ap1") {
        rowStatus = "Pending-Approver 1";
      } else if (req.stage === "pending_ap2") {
        rowStatus = "Pending-Approver 2";
      } else if (req.stage === "pending_validator") {
        rowStatus = "Pending-Validate";
      } else {
        rowStatus = "EditRequest-AcceptedA2";
      }
    }

    rows.push({
      no: `KPITREDIT::${req.id}`,
      employeeId: req.employeeId,
      name: req.employeeName,
      position: req.position,
      department: req.department,
      division: req.division,
      bagian: req.bagian || "",
      companyUnit: req.companyUnit,
      type: "KPI",
      submittedDate: req.requestedAt,
      approvalDate: lastDecision?.decidedAt || "-",
      status: rowStatus,
      workflowStageForRow: actStage ?? "approver1",
      reviewerRoleForRow: actStage === "approver2" || actStage === "validator" ? "approver2" : "approver1",
      editRequestReason: fullReason,
      editRequestDate: req.requestedAt,
    });
  }
  return rows;
}

export function getPendingKpiTrackingEditForDashboard(
  viewer: ManagedUser,
  allUsers: ManagedUser[] = loadManagedUsers(),
): Array<{ req: KpiTrackingEditRequest; stageRole: "checker" | "approver1" | "approver2" | "validator"; roleLabel: string }> {
  const out: Array<{ req: KpiTrackingEditRequest; stageRole: "checker" | "approver1" | "approver2" | "validator"; roleLabel: string }> = [];
  for (const req of loadKpiTrackingEditRequests()) {
    if (!req.stage.startsWith("pending_")) continue;
    const stageRole = canViewerActOnTrackingEditStage(viewer, req, allUsers);
    if (!stageRole) continue;
    const roleLabel =
      stageRole === "checker"
        ? "HR Unit Checker"
        : stageRole === "approver1"
        ? "Approver 1"
        : stageRole === "approver2"
        ? "Approver 2"
        : "HR ICF Validator";
    out.push({ req, stageRole, roleLabel });
  }
  return out;
}
