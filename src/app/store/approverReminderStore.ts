import {
  getActiveUser,
  getAllowedApprovalTypesForUser,
  getAuthorizedSubordinates,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  loadManagedUsers,
  resolveReviewerRoleForTarget,
  resolveUniqueUserByApproverRef,
  resolveWorkflowStageForTarget,
  shouldBypassCheckerForSubmission,
  type ManagedUser,
} from "./authStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { projectApprovalRows } from "./projectStore";
import { feedbackApprovalRows } from "../pages/shared/interDepartmentFeedbackStore";
import { getPendingTargetEditRequestsForViewer } from "./kpiTargetEditStore";
import { getPendingKpiTrackingEditForDashboard } from "./kpiTrackingEditStore";
import {
  loadAllNotifications,
  saveAllNotifications,
  type AppNotificationItem,
} from "./notificationStore";
import { formatTodayDDMMYYYY, parseDateInputToISO } from "../utils/dateFormat";

export interface ApproverOutstandingTask {
  taskKey: string;
  subordinateId: string;
  subordinateName: string;
  companyUnit: string;
  moduleLabel: string;
  stageRole: "approver1" | "approver2" | "gm";
  requestedDate: string;
  ctaRoute: string;
}

function parseLocalMidnightMs(rawDate?: string): number | null {
  if (!rawDate) return null;
  const iso = parseDateInputToISO(rawDate);
  if (iso) {
    const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }
  }
  const parsed = new Date(rawDate);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0).getTime();
  }
  return null;
}

/**
 * Mengumpulkan seluruh task approval yang masih outstanding untuk `viewer` khusus dalam kapasitasnya
 * sebagai Approver berjenjang (Approver 1 / Approver 2 / GM pada Edit Target Fase 2) — BUKAN tahap Checker & Validate.
 */
export function getApproverOutstandingTeamTasks(
  viewer: ManagedUser = getActiveUser(),
  allUsers: ManagedUser[] = loadManagedUsers(),
): ApproverOutstandingTask[] {
  if (!viewer?.employeeId) return [];
  // Role global murni Administrator / HR ICF (Validator) tidak menerima popup/reminder Approver lini kecuali memang ditunjuk langsung sebagai AP1/AP2
  const tasks: ApproverOutstandingTask[] = [];
  const seenTaskKeys = new Set<string>();

  const allowedTypes = new Set<string>([
    ...getAllowedApprovalTypesForUser(viewer, "setting"),
    ...getAllowedApprovalTypesForUser(viewer, "checkin"),
  ]);

  // Daftar bawahan yang terhubung rantai AP1/AP2/delegasi (atau seluruh user aktif bila viewer adalah AP1/AP2 lintas unit)
  const normViewerId = normalizeEmployeeId(viewer.employeeId);
  const directOrChainSubs = isAdminOrHrIcfRole(viewer.role)
    ? allUsers.filter((u) => {
        if (normalizeEmployeeId(u.employeeId) === normViewerId) return false;
        const ap1 = resolveUniqueUserByApproverRef(allUsers, u.regNoAp1, true);
        const ap2 = resolveUniqueUserByApproverRef(allUsers, u.regNoAp2, true);
        return (
          (ap1 && normalizeEmployeeId(ap1.employeeId) === normViewerId) ||
          (ap2 && normalizeEmployeeId(ap2.employeeId) === normViewerId)
        );
      })
    : getAuthorizedSubordinates(viewer, allUsers).filter(
        (u) => normalizeEmployeeId(u.employeeId) !== normViewerId,
      );

  if (directOrChainSubs.length === 0 && viewer.role !== "GM") {
    return [];
  }

  const workflows = loadWorkflowRecords();

  for (const rec of workflows) {
    if (rec.year && rec.year !== "2026") continue;
    const sub = directOrChainSubs.find(
      (u) =>
        normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(rec.employeeId) ||
        u.employeeId.trim().toLowerCase() === rec.employeeId.trim().toLowerCase(),
    );
    if (!sub) continue;
    if (allowedTypes.size > 0 && !allowedTypes.has(rec.module)) continue;

    const isFourStep = rec.module === "KPI" || rec.module === "SMART Goals" || rec.module === "RCA";
    const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(sub.employeeId);
    const chk = rec.decisions.checker?.status ?? "";
    const a1 = rec.decisions.approver1?.status ?? "";
    const a2 = rec.decisions.approver2?.status ?? "";
    const val = rec.decisions.validator?.status ?? "";

    if (chk === "Revision" || a1 === "Revision" || a2 === "Revision" || val === "Revision") continue;

    const checkerDone = Boolean(bypassCheck || (chk && chk !== "Revision"));
    const a1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
    const a2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
    const validatorDone = Boolean(val === "Validated" || a2 === "Validated");
    if (validatorDone) continue;

    const stageForRec = resolveWorkflowStageForTarget(
      viewer,
      sub.employeeId,
      rec.module,
      { checkerDone, a1Done, a2Done, validatorDone },
      allUsers,
      rec.phase,
    );
    // Hanya untuk Approver (approver1 / approver2), BUKAN checker & validator!
    if (stageForRec !== "approver1" && stageForRec !== "approver2") continue;

    if (isFourStep) {
      if (!checkerDone) continue;
      if (stageForRec === "approver1" && a1Done) continue;
      if (stageForRec === "approver2" && (!a1Done || a2Done)) continue;
    } else {
      if (stageForRec === "approver1" && a1Done) continue;
      if (stageForRec === "approver2" && (!a1Done || a2Done)) continue;
    }

    const requestedDate =
      stageForRec === "approver2"
        ? rec.decisions.approver1?.date || rec.submittedDate
        : isFourStep && rec.decisions.checker?.date && rec.decisions.checker.status !== "Bypassed"
        ? rec.decisions.checker.date
        : rec.submittedDate;

    const taskKey = `wf:${normalizeEmployeeId(sub.employeeId)}:${rec.phase}:${rec.module}:${stageForRec}`;
    if (seenTaskKeys.has(taskKey)) continue;
    seenTaskKeys.add(taskKey);
    tasks.push({
      taskKey,
      subordinateId: sub.employeeId,
      subordinateName: sub.name,
      companyUnit: sub.company,
      moduleLabel: `${rec.module} (${rec.phase === "setting" ? "Setting" : "Measurement"})`,
      stageRole: stageForRec,
      requestedDate: requestedDate || formatTodayDDMMYYYY(),
      ctaRoute: rec.phase === "setting" ? "/approvals/setting" : "/approvals/measurement",
    });
  }

  // Project Outside Job Scope
  if (allowedTypes.has("Project")) {
    for (const prjRow of projectApprovalRows("approver1")) {
      const sub = directOrChainSubs.find(
        (u) =>
          normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(prjRow.employeeId) ||
          u.employeeId.trim().toLowerCase() === prjRow.employeeId.trim().toLowerCase(),
      );
      if (!sub) continue;
      const normId = normalizeEmployeeId(sub.employeeId);
      const wfRec = workflows.find(
        (w) => w.year === "2026" && w.module === "Project" && w.phase === "measurement" && normalizeEmployeeId(w.employeeId) === normId,
      );
      const a1Done = Boolean(wfRec?.decisions.approver1 && (wfRec.decisions.approver1.status === "Approved" || wfRec.decisions.approver1.status.startsWith("Assessed")));
      const a2Done = Boolean(wfRec?.decisions.approver2 && (wfRec.decisions.approver2.status === "Approved" || wfRec.decisions.approver2.status.startsWith("Assessed")));
      const roleForPrj = resolveReviewerRoleForTarget(viewer, sub.employeeId, a1Done, "Project");
      if (roleForPrj !== "approver1" && roleForPrj !== "approver2") continue;
      if (roleForPrj === "approver1" && a1Done) continue;
      if (roleForPrj === "approver2" && (!a1Done || a2Done)) continue;
      const taskKey = `wf:${normId}:measurement:Project:${roleForPrj}`;
      if (seenTaskKeys.has(taskKey)) continue;
      seenTaskKeys.add(taskKey);
      tasks.push({
        taskKey,
        subordinateId: sub.employeeId,
        subordinateName: sub.name,
        companyUnit: sub.company,
        moduleLabel: "Project Outside Job Scope",
        stageRole: roleForPrj,
        requestedDate:
          roleForPrj === "approver2"
            ? wfRec?.decisions.approver1?.date || prjRow.submittedDate
            : prjRow.submittedDate || formatTodayDDMMYYYY(),
        ctaRoute: "/approvals/measurement/project",
      });
    }
  }

  // Inter-Department Feedback
  if (allowedTypes.has("Inter-Department Feedback")) {
    for (const fbRow of feedbackApprovalRows("approver1")) {
      if (fbRow.status !== "Pending") continue;
      const sub = directOrChainSubs.find(
        (u) =>
          normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(fbRow.employeeId) ||
          u.employeeId.trim().toLowerCase() === fbRow.employeeId.trim().toLowerCase(),
      );
      if (!sub) continue;
      const normId = normalizeEmployeeId(sub.employeeId);
      const roleForFb = resolveReviewerRoleForTarget(viewer, sub.employeeId, false, "Inter-Department Feedback");
      if (roleForFb !== "approver1" && roleForFb !== "approver2") continue;
      const taskKey = `wf:${normId}:measurement:IDF:${roleForFb}`;
      if (seenTaskKeys.has(taskKey)) continue;
      seenTaskKeys.add(taskKey);
      tasks.push({
        taskKey,
        subordinateId: sub.employeeId,
        subordinateName: sub.name,
        companyUnit: sub.company,
        moduleLabel: "Inter-Department Feedback",
        stageRole: roleForFb,
        requestedDate: fbRow.submittedDate || formatTodayDDMMYYYY(),
        ctaRoute: "/approvals/measurement/inter-department-feedback",
      });
    }
  }

  // Edit [Target] KPI Fase 2 (pending_ap1, pending_ap2, pending_gm — bukan pending_phase1_hricf & pending_validate)
  for (const { req } of getPendingTargetEditRequestsForViewer(viewer, allUsers)) {
    if (req.stage !== "pending_ap1" && req.stage !== "pending_ap2" && req.stage !== "pending_gm") continue;
    if (req.stage === "pending_gm" && !(viewer.role === "GM" && isSameCompanyUnit(viewer.company, req.companyUnit))) {
      continue;
    }
    const stageRole: "approver1" | "approver2" | "gm" =
      req.stage === "pending_ap1" ? "approver1" : req.stage === "pending_ap2" ? "approver2" : "gm";
    const taskKey = `targetedit:${normalizeEmployeeId(req.employeeId)}:${req.stage}`;
    if (seenTaskKeys.has(taskKey)) continue;
    seenTaskKeys.add(taskKey);
    tasks.push({
      taskKey,
      subordinateId: req.employeeId,
      subordinateName: req.employeeName,
      companyUnit: req.companyUnit,
      moduleLabel: "Edit [Target] KPI Setting",
      stageRole,
      requestedDate: req.phase2SubmittedAt || req.phase1RequestedAt || formatTodayDDMMYYYY(),
      ctaRoute: "/approvals/setting/kpi",
    });
  }

  // Request Edit KPI Tracking (hanya approver1 / approver2 — bukan checker / validator)
  for (const { req, stageRole } of getPendingKpiTrackingEditForDashboard(viewer, allUsers)) {
    if (stageRole !== "approver1" && stageRole !== "approver2") continue;
    const taskKey = `kpitredit:${normalizeEmployeeId(req.employeeId)}:${stageRole}`;
    if (seenTaskKeys.has(taskKey)) continue;
    seenTaskKeys.add(taskKey);
    tasks.push({
      taskKey,
      subordinateId: req.employeeId,
      subordinateName: req.employeeName,
      companyUnit: req.companyUnit,
      moduleLabel: "Request Edit KPI Tracking",
      stageRole,
      requestedDate: req.requestedAt || formatTodayDDMMYYYY(),
      ctaRoute: "/approvals/measurement/kpi",
    });
  }

  return tasks;
}

/**
 * Menghitung jumlah KARYAWAN UNIK dari tim approver yang memiliki permintaan persetujuan/penilaian outstanding
 * (khusus kapasitas Approver, bukan Checker & Validate).
 */
export function countUniqueSubordinatesWithOutstandingApproval(
  viewer: ManagedUser = getActiveUser(),
  allUsers: ManagedUser[] = loadManagedUsers(),
): { uniqueEmployeeCount: number; tasks: ApproverOutstandingTask[] } {
  const tasks = getApproverOutstandingTeamTasks(viewer, allUsers);
  const uniqueSet = new Set(tasks.map((t) => normalizeEmployeeId(t.subordinateId)));
  return {
    uniqueEmployeeCount: uniqueSet.size,
    tasks,
  };
}

/**
 * Mengevaluasi dan menerbitkan Notifikasi Reminder otomatis khusus Approver untuk setiap task
 * yang masih outstanding >= 3 hari sejak tanggal request bawahan, dan selalu berulang tiap kelipatan 3 hari
 * (hari ke-3, ke-6, ke-9, dst.) selama approver belum melakukan aksi approval.
 */
export function evaluateRecurringThreeDayApproverReminders(
  viewer: ManagedUser = getActiveUser(),
  allUsers: ManagedUser[] = loadManagedUsers(),
): number {
  if (!viewer?.employeeId) return 0;
  const tasks = getApproverOutstandingTeamTasks(viewer, allUsers);
  if (tasks.length === 0) return 0;

  const now = new Date();
  const todayMidnightMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const existing = loadAllNotifications();
  const existingIds = new Set(existing.map((n) => n.id));
  const newReminders: AppNotificationItem[] = [];

  for (const task of tasks) {
    const reqMs = parseLocalMidnightMs(task.requestedDate);
    if (reqMs === null) continue;
    const elapsedDays = Math.floor((todayMidnightMs - reqMs) / 86_400_000);
    if (elapsedDays < 3) continue;

    const cycleNum = Math.floor(elapsedDays / 3); // 1 untuk hari 3..5, 2 untuk hari 6..8, dst.
    const safeTaskSlug = task.taskKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const notifId = `notif-rem3d-${normalizeEmployeeId(viewer.employeeId)}-${safeTaskSlug}-c${cycleNum}`;
    if (existingIds.has(notifId)) continue;

    const stageLabel =
      task.stageRole === "approver1"
        ? "Approver 1"
        : task.stageRole === "approver2"
        ? "Approver 2"
        : "GM Unit";
    const title = `Reminder Approval (${elapsedDays} Hari Outstanding) — ${task.subordinateName}`;
    const summary = `Permintaan persetujuan ${task.moduleLabel} dari ${task.subordinateName} (${task.companyUnit}) telah menunggu aksi ${stageLabel} Anda selama ${elapsedDays} hari sejak ${task.requestedDate}.`;
    newReminders.push({
      id: notifId,
      title,
      summary,
      body: [
        summary,
        "Pengingat otomatis ini dikirim setiap 3 hari selama pengajuan bawahan belum ditindaklanjuti. Silakan buka Dashboard Approval untuk memproses.",
      ],
      category: "Reminder",
      createdAt: new Date().toISOString(),
      senderName: "Approval Reminder System",
      senderRole: "System",
      moduleName: task.moduleLabel,
      approvalStatus: "Pending Reminder",
      approverName: viewer.name,
      ctaLabel: "Buka Dashboard Approval",
      ctaRoute: "/dashboard/approval",
      targetAll: false,
      targetEmployeeIds: [viewer.employeeId],
      channels: ["Notifikasi Sistem"],
      readByEmployeeIds: [],
      clearedByEmployeeIds: [],
    });
  }

  if (newReminders.length > 0) {
    saveAllNotifications([...newReminders, ...existing]);
  }
  return newReminders.length;
}
