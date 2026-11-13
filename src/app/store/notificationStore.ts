import { useEffect, useState } from "react";
import { loadPersistedState, savePersistedState, PA_APP_API_BASE, SUPABASE_ANON_KEY } from "../services/supabaseClient";
import {
  getActiveUser,
  loadManagedUsers,
  resolveEffectiveUserGrouping,
  resolveUserAllowedModules,
  type AppraisalModuleName,
  type ManagedUser,
} from "./authStore";

export type NotificationCategory =
  | "Reminder"
  | "Approval"
  | "Info"
  | "Calibration"
  | "Warning"
  | "System"
  | "Announcement"
  | "Evaluation";

export type NotificationDeliveryChannel =
  | "Notifikasi Sistem"
  | "Telegram"
  | "WhatsApp"
  | "Email";

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "Reminder",
  "Approval",
  "Info",
  "Calibration",
  "Warning",
  "System",
  "Announcement",
  "Evaluation",
];

export const NOTIFICATION_DELIVERY_CHANNELS: NotificationDeliveryChannel[] = [
  "Notifikasi Sistem",
  "Telegram",
  "WhatsApp",
  "Email",
];

export const NOTIFICATION_CATEGORY_META: Record<
  NotificationCategory,
  { label: string; badgeBg: string; badgeText: string; border: string }
> = {
  Reminder: {
    label: "Reminder",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    border: "border-amber-200",
  },
  Approval: {
    label: "Approval",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-700",
    border: "border-indigo-200",
  },
  Info: {
    label: "Info",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-700",
    border: "border-sky-200",
  },
  Calibration: {
    label: "Calibration",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-700",
    border: "border-purple-200",
  },
  Warning: {
    label: "Warning",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    border: "border-rose-200",
  },
  System: {
    label: "System",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    border: "border-slate-200",
  },
  Announcement: {
    label: "Announcement",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    border: "border-emerald-200",
  },
  Evaluation: {
    label: "Evaluation",
    badgeBg: "bg-teal-50",
    badgeText: "text-teal-700",
    border: "border-teal-200",
  },
};

export interface NotificationAttachment {
  id: string;
  name: string;
  size?: number;
  sizeLabel?: string;
  mimeType: string;
  dataUrl?: string;
  isImage?: boolean;
}

export interface AppNotificationItem {
  id: string;
  title: string;
  summary: string;
  body: string[];
  bodyHtml?: string;
  category: NotificationCategory;
  createdAt: string; // ISO string
  senderName: string;
  senderRole: string;
  moduleName?: string;
  approvalStatus?: string;
  approverName?: string;
  ctaLabel?: string;
  ctaRoute?: string;
  /** Target penerima: jika targetAll === true maka untuk semua user; jika false difilter berdasarkan unit/divisi/dept/employeeIds */
  targetAll: boolean;
  targetUnits?: string[];
  targetDivisions?: string[];
  targetDepartments?: string[];
  targetEmployeeIds?: string[];
  channels: NotificationDeliveryChannel[];
  attachments?: NotificationAttachment[];
  embeddedImages?: string[];
  readByEmployeeIds: string[];
  clearedByEmployeeIds: string[];
}

export type AutoNotificationTriggerType = "Scheduled" | "Transaction";

export type MasterApprovalTriggerStatus =
  | "All Approval Status"
  | "Submitted"
  | "Checked"
  | "Approved (Approval 1)"
  | "Approved (Approval 2)"
  | "Validated"
  | "Revision"
  | "Rejected";

export const MASTER_APPROVAL_TRIGGER_OPTIONS: MasterApprovalTriggerStatus[] = [
  "All Approval Status",
  "Submitted",
  "Checked",
  "Approved (Approval 1)",
  "Approved (Approval 2)",
  "Validated",
  "Revision",
  "Rejected",
];

export type ScheduledModuleChoice =
  | "KPI Setting"
  | "SMART Goals Setting"
  | "KPI Measurement"
  | "SMART Measurement"
  | "RCA"
  | "Appraisal Form"
  | "Managerial Skill"
  | "Project Outside Job Scope"
  | "Inter-Departement Feedback";

export const SCHEDULED_MODULE_OPTIONS: ScheduledModuleChoice[] = [
  "KPI Setting",
  "SMART Goals Setting",
  "KPI Measurement",
  "SMART Measurement",
  "RCA",
  "Appraisal Form",
  "Managerial Skill",
  "Project Outside Job Scope",
  "Inter-Departement Feedback",
];

export type ApprovalTransactionModuleChoice =
  | ScheduledModuleChoice
  | "Management Interview"
  | "KPI Business (KPI Group)"
  | "KPI Business (KPI Unit)"
  | "Calibration";

export const APPROVAL_TRANSACTION_MODULE_OPTIONS: ApprovalTransactionModuleChoice[] = [
  "KPI Setting",
  "SMART Goals Setting",
  "KPI Measurement",
  "SMART Measurement",
  "RCA",
  "Appraisal Form",
  "Managerial Skill",
  "Project Outside Job Scope",
  "Inter-Departement Feedback",
  "Management Interview",
  "KPI Business (KPI Group)",
  "KPI Business (KPI Unit)",
  "Calibration",
];

export const SCHEDULED_ELIGIBLE_MODULES: Array<{
  id: ScheduledModuleChoice;
  label: string;
}> = SCHEDULED_MODULE_OPTIONS.map((m) => ({ id: m, label: m }));

export function mapModuleChoiceToAllowedModule(choice?: string): AppraisalModuleName | null {
  if (!choice) return null;
  const c = choice.trim().toLowerCase();
  if (c.includes("kpi") || c === "rca") return "KPI (Setting/Measurement)";
  if (c.includes("smart")) return "SMART Goals (Setting/Measurement)";
  if (c.includes("appraisal")) return "Appraisals Form";
  if (c.includes("managerial")) return "Managerial Skill";
  if (c.includes("project")) return "Project Outside Job Scope";
  if (c.includes("feedback")) return "Inter-Departement Feedback";
  if (c.includes("interview")) return "Management Interview";
  return null;
}

export function resolveCanonicalModuleName(raw?: string): string {
  if (!raw) return "Performance Appraisal";
  const r = raw.trim();
  const lower = r.toLowerCase();
  if (lower === "kpi (setting)" || lower === "kpi setting") return "KPI Setting";
  if (lower === "kpi (measurement)" || lower === "kpi measurement" || lower === "kpi tracking") return "KPI Measurement";
  if (lower === "kpi (setting/measurement)") return "KPI Setting";
  if (lower === "smart goals (setting)" || lower === "smart goals setting") return "SMART Goals Setting";
  if (lower === "smart goals (measurement)" || lower === "smart measurement" || lower === "smart goals measurement") return "SMART Measurement";
  if (lower === "smart goals (setting/measurement)") return "SMART Goals Setting";
  if (lower.startsWith("rca")) return "RCA";
  if (lower.startsWith("appraisal form") || lower.startsWith("appraisals form")) return "Appraisal Form";
  if (lower.startsWith("managerial skill")) return "Managerial Skill";
  if (lower.startsWith("project")) return "Project Outside Job Scope";
  if (lower.includes("inter-depart") && lower.includes("feedback")) return "Inter-Departement Feedback";
  if (lower.startsWith("management interview")) return "Management Interview";
  if (lower.includes("kpi group")) return "KPI Business (KPI Group)";
  if (lower.includes("kpi unit")) return "KPI Business (KPI Unit)";
  if (lower.includes("calibration")) return "Calibration";
  return r;
}

export const SYSTEM_NOTIFICATION_VARIABLES: Array<{
  token: string;
  label: string;
}> = [
  { token: "{{nama_karyawan}}", label: "Nama Karyawan" },
  { token: "{{id_karyawan}}", label: "ID Karyawan" },
  { token: "{{reg_no}}", label: "Reg No" },
  { token: "{{jabatan}}", label: "Jabatan" },
  { token: "{{unit_usaha}}", label: "Company Unit" },
  { token: "{{divisi}}", label: "Divisi" },
  { token: "{{departemen}}", label: "Departemen" },
  { token: "{{bagian}}", label: "Bagian" },
  { token: "{{groupings}}", label: "User Groupings" },
  { token: "{{nama_modul}}", label: "Nama Modul" },
  { token: "{{status_approval}}", label: "Status Approval" },
  { token: "{{nama_approver}}", label: "Nama Approver" },
  { token: "{{tanggal}}", label: "Tanggal" },
  { token: "{{tahun_pa}}", label: "Tahun PA" },
];

export interface NotificationVariableContext {
  user?: Partial<ManagedUser>;
  moduleName?: string;
  approvalStatus?: string;
  approverName?: string;
  date?: string;
  year?: string;
}

export function interpolateNotificationTemplate(
  text: string,
  ctx: NotificationVariableContext = {},
): string {
  if (!text || !text.includes("{{")) return text;
  const u = ctx.user;
  const todayStr =
    ctx.date ||
    new Date().toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const replacements: Record<string, string> = {
    "{{nama_karyawan}}": u?.name || "Karyawan",
    "{{id_karyawan}}": u?.employeeId || "-",
    "{{reg_no}}": u?.regNo || "-",
    "{{jabatan}}": u?.position || "-",
    "{{unit_usaha}}": u?.company || "-",
    "{{divisi}}": u?.division || "-",
    "{{departemen}}": u?.department || "-",
    "{{bagian}}": u?.bagian || "-",
    "{{groupings}}": u ? resolveEffectiveUserGrouping(u as ManagedUser) : "-",
    "{{nama_modul}}": resolveCanonicalModuleName(ctx.moduleName),
    "{{status_approval}}": ctx.approvalStatus || "Updated",
    "{{nama_approver}}": ctx.approverName || "Approver",
    "{{tanggal}}": todayStr,
    "{{tahun_pa}}": ctx.year || "2026",
  };
  let out = text;
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }
  return out;
}

export function getEligibleUsersForScheduledModule(
  companyUnits?: string[] | string,
  moduleChoice?: string,
): ManagedUser[] {
  const activeUsers = loadManagedUsers().filter((u) => u.status === "Active");
  const unitList = Array.isArray(companyUnits)
    ? companyUnits.filter(Boolean)
    : companyUnits
    ? [companyUnits]
    : [];
  const hasAllUnits =
    unitList.length === 0 ||
    unitList.some((x) => x.trim().toLowerCase() === "all units");
  const requiredAllowedMod = mapModuleChoiceToAllowedModule(moduleChoice);

  return activeUsers.filter((u) => {
    const unitMatch =
      hasAllUnits ||
      unitList.some((unit) => u.company.trim().toLowerCase() === unit.trim().toLowerCase());
    if (!unitMatch) return false;
    if (!requiredAllowedMod) return true;
    const allowed = resolveUserAllowedModules(u);
    return allowed.includes(requiredAllowedMod);
  });
}

export interface AutoNotificationTemplate {
  id: string;
  code?: string;
  name: string;
  description?: string;
  category: NotificationCategory;
  triggerType:
    | AutoNotificationTriggerType
    | "Scheduled (Jadwal Otomatis)"
    | "System Action (Aksi Sistem)"
    | "Schedule (H-7 Deadline)"
    | "Schedule (Monthly)"
    | "On Submission"
    | "On Approval / Revision"
    | "On Calibration Gate"
    | "On Password / Security Alert";
  scheduledCompanyUnit?: string;
  scheduledCompanyUnits?: string[];
  scheduledModule?: string;
  scheduledDates?: string[];
  recurringMonthly?: boolean;
  scheduledTime?: string;
  approvalModule?: string;
  approvalTriggerStatus?: MasterApprovalTriggerStatus;
  scheduleInfo?: string;
  triggerCondition?: string;
  subjectTemplate: string;
  bodyTemplate: string;
  channels: NotificationDeliveryChannel[];
  active: boolean;
  lastTriggeredAt?: string;
}

export const NOTIFICATIONS_LIST_KEY = "pa_system_notifications_v3_clean";
export const AUTO_NOTIFICATION_TEMPLATES_KEY = "pa_auto_notification_templates_v1";
export const NOTIFICATIONS_UPDATED_EVENT = "pa-notifications-updated";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const INITIAL_AUTO_TEMPLATES: AutoNotificationTemplate[] = [
  {
    id: "auto-1",
    code: "AUTO_KPI_MONTHLY",
    name: "Pengingat Bulanan KPI Tracking & RCA",
    description: "Mengirimkan pengingat otomatis bulanan kepada karyawan untuk mengisi realisasi KPI Tracking, evidence, dan RCA sebelum Date Lock.",
    category: "Reminder",
    triggerType: "Scheduled",
    scheduledCompanyUnit: "All Units",
    scheduledCompanyUnits: ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)", "PT RSTM", "PT GHS", "ASD"],
    scheduledModule: "KPI Measurement",
    scheduledDates: ["5", "25"],
    recurringMonthly: true,
    scheduledTime: "08:00",
    scheduleInfo: "Setiap tanggal 5 & H-3 sebelum Date Lock Per Month",
    triggerCondition: "Setiap tanggal 5 & H-3 sebelum Date Lock Per Month",
    subjectTemplate: "Pengingat Pengisian {{nama_modul}} Bulanan",
    bodyTemplate: "Halo {{nama_karyawan}}, sistem mendeteksi {{nama_modul}} Anda pada unit {{unit_usaha}} untuk periode berjalan belum disubmit. Mohon segera melengkapi realisasi dan dokumen evidence sebelum batas waktu penguncian.",
    channels: ["Notifikasi Sistem"],
    active: true,
    lastTriggeredAt: "2026-06-08 08:00",
  },
  {
    id: "auto-2",
    code: "AUTO_APPROVAL_SUBMIT",
    name: "Notifikasi Pengajuan Menunggu Approval (Checker / AP1 / AP2)",
    description: "Memberitahukan Checker HR Unit, Approver 1, Approver 2, atau Validator HR ICF saat terdapat pengajuan baru.",
    category: "Approval",
    triggerType: "Transaction",
    approvalModule: "KPI Setting",
    approvalTriggerStatus: "Submitted",
    scheduleInfo: "Real-time saat karyawan melakukan Submit modul PA",
    triggerCondition: "Real-time saat karyawan melakukan Submit modul PA",
    subjectTemplate: "Pengajuan {{nama_modul}} Menunggu Persetujuan Anda",
    bodyTemplate: "Terdapat pengajuan {{nama_modul}} baru dari {{nama_karyawan}} ({{unit_usaha}}) yang menunggu pemeriksaan/persetujuan Anda di menu Approvals.",
    channels: ["Notifikasi Sistem"],
    active: true,
    lastTriggeredAt: "2026-06-08 09:15",
  },
  {
    id: "auto-3",
    code: "AUTO_APPROVAL_DECISION",
    name: "Notifikasi Hasil Review Approver / Permintaan Revisi",
    description: "Memberitahukan karyawan saat pengajuan KPI, SMART Goals, atau modul PA disetujui atau dikembalikan untuk revisi.",
    category: "Approval",
    triggerType: "Transaction",
    approvalModule: "KPI Measurement",
    approvalTriggerStatus: "All Approval Status",
    scheduleInfo: "Real-time saat Approver memberikan keputusan Approve / Revision",
    triggerCondition: "Real-time saat Approver memberikan keputusan Approve / Revision",
    subjectTemplate: "Update Status Pengajuan {{nama_modul}} — {{status_approval}}",
    bodyTemplate: "Halo {{nama_karyawan}}, pengajuan {{nama_modul}} Anda pada unit {{unit_usaha}} telah diperbarui dengan status {{status_approval}} oleh {{nama_approver}} pada {{tanggal}}.",
    channels: ["Notifikasi Sistem"],
    active: true,
    lastTriggeredAt: "2026-06-07 14:30",
  },
  {
    id: "auto-4",
    code: "AUTO_DEADLINE_WARN",
    name: "Peringatan Batas Akhir Pengisian Appraisal Form & SMART Goals",
    description: "Mengirimkan peringatan menjelang berakhirnya jadwal aktif modul di Module Activation (/hr/modules).",
    category: "Warning",
    triggerType: "Scheduled",
    scheduledCompanyUnit: "All Units",
    scheduledCompanyUnits: ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)", "PT RSTM", "PT GHS", "ASD"],
    scheduledModule: "Appraisal Form",
    scheduledDates: ["20", "28"],
    recurringMonthly: true,
    scheduledTime: "07:30",
    scheduleInfo: "H-7 dan H-1 sebelum End Date di Module Activation (/hr/modules)",
    triggerCondition: "H-7 dan H-1 sebelum End Date di Module Activation (/hr/modules)",
    subjectTemplate: "Batas Waktu Pengisian {{nama_modul}} Segera Berakhir",
    bodyTemplate: "Halo {{nama_karyawan}} ({{jabatan}} - {{departemen}}), masa aktif pengisian {{nama_modul}} akan segera berakhir sesuai jadwal Module Activation. Pastikan seluruh form telah disimpan dan disubmit.",
    channels: ["Notifikasi Sistem"],
    active: true,
    lastTriggeredAt: "2026-06-05 07:30",
  },
  {
    id: "auto-5",
    code: "AUTO_CALIBRATION_INVITE",
    name: "Undangan & Jadwal Management Interview / Calibration",
    description: "Mengirimkan undangan otomatis saat jadwal Management Interview atau Calibration diterbitkan.",
    category: "Calibration",
    triggerType: "Scheduled",
    scheduledCompanyUnits: ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)", "PT RSTM", "PT GHS", "ASD"],
    scheduledModule: "Managerial Skill",
    scheduledDates: ["15"],
    recurringMonthly: true,
    scheduledTime: "09:00",
    scheduleInfo: "Saat jadwal Management Interview atau Calibration diterbitkan",
    triggerCondition: "Saat jadwal Management Interview atau Calibration diterbitkan",
    subjectTemplate: "Jadwal Management Interview & Calibration 2026",
    bodyTemplate: "Halo {{nama_karyawan}}, jadwal Management Interview & Calibration tahun {{tahun_pa}} telah diterbitkan. Silakan periksa waktu dan informasi pelaksanaan pada sistem.",
    channels: ["Notifikasi Sistem"],
    active: true,
    lastTriggeredAt: "2026-06-04 10:00",
  },
];

function buildSeedNotifications(): AppNotificationItem[] {
  return [];
}

export function resolveNotificationRouteForUser(rawRoute?: string, user = getActiveUser()): string | undefined {
  if (!rawRoute) return undefined;
  if (
    rawRoute.startsWith("/hr/") ||
    rawRoute.startsWith("/supervisor/") ||
    rawRoute.startsWith("/employee/") ||
    rawRoute.startsWith("/bod/")
  ) {
    return rawRoute;
  }
  const portal =
    user.role === "Employee"
      ? "/employee"
      : user.role === "BOD"
      ? "/bod"
      : user.role === "Administrator" || user.role === "HR ICF"
      ? "/hr"
      : "/supervisor";
  return `${portal}${rawRoute.startsWith("/") ? rawRoute : `/${rawRoute}`}`;
}

/**
 * Memuat seluruh notifikasi dan otomatis menghapus (auto-clear) notifikasi yang berusia > 30 hari.
 */
export function loadAllNotifications(): AppNotificationItem[] {
  const raw = loadPersistedState<AppNotificationItem[]>(NOTIFICATIONS_LIST_KEY, buildSeedNotifications());
  const now = Date.now();
  const sourceList = Array.isArray(raw) ? raw : buildSeedNotifications();
  const validList = sourceList.filter((item) => {
    if (item.id && item.id.startsWith("notif-seed-")) return false;
    const ts = new Date(item.createdAt).getTime();
    if (!Number.isFinite(ts)) return true;
    // Lebih dari 30 hari otomatis ter-clear (termasuk yang belum dibaca)
    return now - ts <= THIRTY_DAYS_MS;
  });
  if (validList.length !== sourceList.length) {
    savePersistedState(NOTIFICATIONS_LIST_KEY, validList);
  }
  return validList.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function saveAllNotifications(list: AppNotificationItem[]): void {
  savePersistedState(NOTIFICATIONS_LIST_KEY, list);
  queueMicrotask(() => window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT)));
}

export function isNotificationTargetedToUser(item: AppNotificationItem, user: ManagedUser): boolean {
  const empId = user.employeeId.trim().toUpperCase();
  if ((item.clearedByEmployeeIds ?? []).includes(empId)) {
    return false;
  }
  if (item.targetAll) return true;
  if (item.targetEmployeeIds?.some((id) => id.trim().toUpperCase() === empId)) return true;
  const matchUnit =
    !item.targetUnits ||
    item.targetUnits.length === 0 ||
    item.targetUnits.some((u) => u.trim().toLowerCase() === (user.company ?? "").trim().toLowerCase());
  const matchDiv =
    !item.targetDivisions ||
    item.targetDivisions.length === 0 ||
    item.targetDivisions.some((d) => d.trim().toLowerCase() === (user.division ?? "").trim().toLowerCase());
  const matchDept =
    !item.targetDepartments ||
    item.targetDepartments.length === 0 ||
    item.targetDepartments.some((dep) => dep.trim().toLowerCase() === (user.department ?? "").trim().toLowerCase());

  const hasAnyOrgFilter =
    (item.targetUnits && item.targetUnits.length > 0) ||
    (item.targetDivisions && item.targetDivisions.length > 0) ||
    (item.targetDepartments && item.targetDepartments.length > 0);

  return Boolean(hasAnyOrgFilter && matchUnit && matchDiv && matchDept);
}

export function getNotificationsForUser(user = getActiveUser()): Array<
  AppNotificationItem & { isRead: boolean; ageDays: number }
> {
  const empId = user.employeeId.trim().toUpperCase();
  const now = Date.now();
  return loadAllNotifications()
    .filter((item) => isNotificationTargetedToUser(item, user))
    .map((item) => {
      const ts = new Date(item.createdAt).getTime();
      const ageDays = Number.isFinite(ts) ? Math.floor((now - ts) / (24 * 3600 * 1000)) : 0;
      const ctx: NotificationVariableContext = {
        user,
        moduleName: item.moduleName,
        approvalStatus: item.approvalStatus,
        approverName: item.approverName,
      };
      return {
        ...item,
        title: interpolateNotificationTemplate(item.title, ctx),
        summary: interpolateNotificationTemplate(item.summary, ctx),
        body: (item.body ?? []).map((line) => interpolateNotificationTemplate(line, ctx)),
        bodyHtml: item.bodyHtml
          ? interpolateNotificationTemplate(item.bodyHtml, ctx)
          : undefined,
        isRead: (item.readByEmployeeIds ?? []).includes(empId),
        ageDays,
      };
    });
}

export function markNotificationAsRead(notificationId: string, employeeId = getActiveUser().employeeId): void {
  const empId = employeeId.trim().toUpperCase();
  const all = loadAllNotifications();
  let changed = false;
  const next = all.map((item) => {
    if (item.id !== notificationId) return item;
    if ((item.readByEmployeeIds ?? []).includes(empId)) return item;
    changed = true;
    return {
      ...item,
      readByEmployeeIds: [...(item.readByEmployeeIds ?? []), empId],
    };
  });
  if (changed) {
    saveAllNotifications(next);
  }
}

export function markAllNotificationsAsRead(employeeId = getActiveUser().employeeId): void {
  const empId = employeeId.trim().toUpperCase();
  const all = loadAllNotifications();
  const next = all.map((item) => {
    if ((item.readByEmployeeIds ?? []).includes(empId)) return item;
    return {
      ...item,
      readByEmployeeIds: [...(item.readByEmployeeIds ?? []), empId],
    };
  });
  saveAllNotifications(next);
}

/**
 * Menghapus (clear) 1 notifikasi untuk user aktif.
 * Aturan: Notifikasi yang belum dibaca TIDAK BISA di-clear kecuali sudah >= 30 hari.
 */
export function clearSingleNotificationForUser(
  notificationId: string,
  employeeId = getActiveUser().employeeId,
): { ok: boolean; error?: string } {
  const empId = employeeId.trim().toUpperCase();
  const all = loadAllNotifications();
  const target = all.find((n) => n.id === notificationId);
  if (!target) return { ok: false, error: "Notifikasi tidak ditemukan." };

  const isRead = (target.readByEmployeeIds ?? []).includes(empId);
  const ageMs = Date.now() - new Date(target.createdAt).getTime();
  if (!isRead && ageMs < THIRTY_DAYS_MS) {
    return {
      ok: false,
      error: "Notifikasi yang belum dibaca tidak dapat di-clear. Silakan klik/baca notifikasi terlebih dahulu.",
    };
  }

  const next = all.map((item) =>
    item.id === notificationId
      ? {
          ...item,
          clearedByEmployeeIds: Array.from(new Set([...(item.clearedByEmployeeIds ?? []), empId])),
        }
      : item,
  );
  saveAllNotifications(next);
  return { ok: true };
}

/**
 * Clear seluruh notifikasi yang SUDAH DIBACA (atau yang sudah melewati 30 hari) untuk user aktif.
 * Notifikasi yang belum dibaca (< 30 hari) tetap dipertahankan sesuai aturan.
 */
export function clearReadNotificationsForUser(employeeId = getActiveUser().employeeId): {
  clearedCount: number;
  keptUnreadCount: number;
  skippedUnreadCount: number;
} {
  const empId = employeeId.trim().toUpperCase();
  const user = getActiveUser();
  const all = loadAllNotifications();
  let clearedCount = 0;
  let keptUnreadCount = 0;

  const next = all.map((item) => {
    if (!isNotificationTargetedToUser(item, user)) return item;
    const isRead = (item.readByEmployeeIds ?? []).includes(empId);
    const ageMs = Date.now() - new Date(item.createdAt).getTime();
    if (isRead || ageMs >= THIRTY_DAYS_MS) {
      clearedCount++;
      return {
        ...item,
        clearedByEmployeeIds: Array.from(new Set([...(item.clearedByEmployeeIds ?? []), empId])),
      };
    }
    keptUnreadCount++;
    return item;
  });

  saveAllNotifications(next);
  return { clearedCount, keptUnreadCount, skippedUnreadCount: keptUnreadCount };
}

export async function createAndBroadcastNotification(
  payload: Omit<AppNotificationItem, "id" | "createdAt" | "readByEmployeeIds" | "clearedByEmployeeIds">,
): Promise<AppNotificationItem> {
  const newItem: AppNotificationItem = {
    ...payload,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    readByEmployeeIds: [],
    clearedByEmployeeIds: [],
  };
  const current = loadAllNotifications();
  saveAllNotifications([newItem, ...current]);

  // Dispatch external channels (Telegram / WhatsApp / Email) to backend service
  const externalChannels = payload.channels.filter((c) => c !== "Notifikasi Sistem");
  if (externalChannels.length > 0) {
    try {
      const recipients = loadManagedUsers().filter((u) =>
        u.status === "Active" && isNotificationTargetedToUser(newItem, u),
      );
      await fetch(`${PA_APP_API_BASE}/notifications/dispatch`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notification: newItem,
          recipientCount: recipients.length,
          channels: externalChannels,
        }),
      });
    } catch {
      // ignore network error in offline mode
    }
  }

  return newItem;
}

export function loadAutoNotificationTemplates(): AutoNotificationTemplate[] {
  return loadPersistedState<AutoNotificationTemplate[]>(
    AUTO_NOTIFICATION_TEMPLATES_KEY,
    INITIAL_AUTO_TEMPLATES,
  );
}

export function saveAutoNotificationTemplates(templates: AutoNotificationTemplate[]): void {
  savePersistedState(AUTO_NOTIFICATION_TEMPLATES_KEY, templates, {
    kind: "kv-state",
    stateKey: AUTO_NOTIFICATION_TEMPLATES_KEY,
    stateValue: templates,
  });
  queueMicrotask(() => window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT)));
}

/**
 * Mengeksekusi Auto Notification bertipe Approval / Transaction ketika terjadi transaksi approval di sistem
 * (Submitted, Checked, Approved (Approval 1), Approved (Approval 2), Validated, Revision / Rejected),
 * dan otomatis menampilkannya ke daftar notifikasi karyawan terkait.
 */
export function triggerApprovalTransactionNotification(params: {
  employeeId: string;
  moduleName: string;
  rawStatus: string;
  approverRole?: string;
  approverName?: string;
  ctaRoute?: string;
}): void {
  const allUsers = loadManagedUsers();
  const targetUser = allUsers.find(
    (u) =>
      u.employeeId.trim().toUpperCase() === params.employeeId.trim().toUpperCase() ||
      u.employeeId.replace(/-/g, "").toUpperCase() === params.employeeId.replace(/-/g, "").toUpperCase(),
  );

  const sLower = params.rawStatus.trim().toLowerCase();
  let mappedStatus: MasterApprovalTriggerStatus = "Submitted";
  if (sLower.includes("valid")) {
    mappedStatus = "Validated";
  } else if (sLower.includes("check")) {
    mappedStatus = "Checked";
  } else if (sLower.includes("reject") || sLower.includes("tolak")) {
    mappedStatus = "Rejected";
  } else if (sLower.includes("revis")) {
    mappedStatus = "Revision";
  } else if (sLower.includes("approv") || sLower.startsWith("assessed")) {
    mappedStatus =
      params.approverRole === "approver2"
        ? "Approved (Approval 2)"
        : "Approved (Approval 1)";
  } else if (sLower.includes("submit")) {
    mappedStatus = "Submitted";
  }

  const canonicalMod = resolveCanonicalModuleName(params.moduleName);

  const templates = loadAutoNotificationTemplates().filter((tpl) => {
    if (!tpl.active) return false;
    if (tpl.category !== "Approval") return false;
    if (tpl.approvalModule && tpl.approvalModule !== "All Modules") {
      const tplMod = resolveCanonicalModuleName(tpl.approvalModule);
      if (tplMod.toLowerCase() !== canonicalMod.toLowerCase()) {
        return false;
      }
    }
    if (!tpl.approvalTriggerStatus || tpl.approvalTriggerStatus === "All Approval Status") {
      return true;
    }
    return tpl.approvalTriggerStatus === mappedStatus;
  });

  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
  const ctx: NotificationVariableContext = {
    user: targetUser,
    moduleName: canonicalMod,
    approvalStatus: mappedStatus,
    approverName: params.approverName || (params.approverRole === "approver2" ? "Approver 2 / HR ICF" : params.approverRole === "approver1" ? "Approver 1" : "System"),
    year: "2026",
  };

  if (templates.length === 0) {
    // Default automatic approval notification if no custom rule matched
    const title = interpolateNotificationTemplate(
      "Update Status {{nama_modul}} — {{status_approval}}",
      ctx,
    );
    const bodyLine = interpolateNotificationTemplate(
      "Halo {{nama_karyawan}}, pengajuan {{nama_modul}} Anda telah berstatus {{status_approval}} oleh {{nama_approver}} pada {{tanggal}}.",
      ctx,
    );
    createAndBroadcastNotification({
      title,
      summary: bodyLine,
      body: [bodyLine],
      category: "Approval",
      senderName: ctx.approverName || "Workflow Approval System",
      senderRole: "System",
      moduleName: canonicalMod,
      approvalStatus: mappedStatus,
      approverName: ctx.approverName,
      ctaLabel: `Buka ${canonicalMod}`,
      ctaRoute: params.ctaRoute || "/appraisal",
      targetAll: !targetUser,
      targetEmployeeIds: targetUser ? [targetUser.employeeId] : undefined,
      channels: ["Notifikasi Sistem"],
    });
    return;
  }

  for (const tpl of templates) {
    const tplModuleName = resolveCanonicalModuleName(
      tpl.approvalModule || tpl.scheduledModule || canonicalMod,
    );
    const ruleCtx: NotificationVariableContext = {
      ...ctx,
      moduleName: tplModuleName,
    };
    const title = interpolateNotificationTemplate(tpl.subjectTemplate || tpl.name, ruleCtx);
    const bodyLines = (tpl.bodyTemplate || tpl.subjectTemplate)
      .split("\n")
      .map((line) => interpolateNotificationTemplate(line.trim(), ruleCtx))
      .filter(Boolean);
    createAndBroadcastNotification({
      title,
      summary: bodyLines[0] || title,
      body: bodyLines.length > 0 ? bodyLines : [title],
      category: tpl.category,
      senderName: `Auto Notification (${tpl.name})`,
      senderRole: "System",
      moduleName: tplModuleName,
      approvalStatus: mappedStatus,
      approverName: ruleCtx.approverName,
      ctaLabel: `Buka ${tplModuleName}`,
      ctaRoute: params.ctaRoute || "/appraisal",
      targetAll: !targetUser,
      targetEmployeeIds: targetUser ? [targetUser.employeeId] : undefined,
      channels: tpl.channels?.length ? tpl.channels : ["Notifikasi Sistem"],
    });
  }

  // Update lastTriggeredAt on matched templates
  const matchedIds = new Set(templates.map((t) => t.id));
  saveAutoNotificationTemplates(
    loadAutoNotificationTemplates().map((t) =>
      matchedIds.has(t.id) ? { ...t, lastTriggeredAt: nowStr } : t,
    ),
  );

  // Kirim notifikasi tindak lanjut ke Approver 1 (saat Submitted) atau Approver 2 (saat Approved oleh Approver 1)
  if (targetUser) {
    const isSettingPhase = canonicalMod.toLowerCase().includes("setting");
    const approvalRoute = isSettingPhase ? "/approvals/setting" : "/approvals/measurement";
    const isFourStepMod =
      canonicalMod.toLowerCase().includes("kpi") ||
      canonicalMod.toLowerCase().includes("smart");

    const findApproverUser = (refValue?: string): ManagedUser | undefined => {
      const ref = (refValue ?? "").trim().toLowerCase();
      if (!ref) return undefined;
      return allUsers.find(
        (u) =>
          (u.regNo ?? "").trim().toLowerCase() === ref ||
          u.employeeId.trim().toLowerCase() === ref ||
          u.name.trim().toLowerCase() === ref,
      );
    };

    const findUnitCheckerUsers = (companyName: string): ManagedUser[] =>
      allUsers.filter(
        (u) =>
          u.status === "Active" &&
          u.company.trim().toLowerCase() === companyName.trim().toLowerCase() &&
          (u.role === "HR Unit" || Boolean(u.isHrUnitChecker)) &&
          u.employeeId.toUpperCase() !== targetUser.employeeId.toUpperCase(),
      );

    const findHrIcfValidators = (): ManagedUser[] =>
      allUsers.filter(
        (u) =>
          u.status === "Active" &&
          (u.role === "HR ICF" || u.role === "Administrator" || Boolean(u.isHrIcfValidator)),
      );

    if (mappedStatus === "Submitted") {
      const checkers = isFourStepMod ? findUnitCheckerUsers(targetUser.company) : [];
      if (checkers.length > 0) {
        const chkTitle = `Menunggu Check HR Unit: ${canonicalMod} — ${targetUser.name}`;
        const chkBody = `Terdapat pengajuan ${canonicalMod} dari ${targetUser.name} (${targetUser.employeeId} · ${targetUser.company}) yang menunggu pemeriksaan (Check) HR Unit Anda.`;
        createAndBroadcastNotification({
          title: chkTitle,
          summary: chkBody,
          body: [chkBody],
          category: "Approval",
          senderName: targetUser.name,
          senderRole: targetUser.role || "Employee",
          moduleName: canonicalMod,
          approvalStatus: "Pending Check HR Unit",
          ctaLabel: "Buka Menu Approvals",
          ctaRoute: approvalRoute,
          targetAll: false,
          targetEmployeeIds: checkers.map((c) => c.employeeId),
          channels: ["Notifikasi Sistem"],
        });
      }
      const ap1User = findApproverUser(targetUser.regNoAp1);
      if (ap1User && ap1User.employeeId.toUpperCase() !== targetUser.employeeId.toUpperCase()) {
        const ap1Title = `Menunggu Approval 1: ${canonicalMod} — ${targetUser.name}`;
        const ap1Body = `Halo ${ap1User.name}, terdapat pengajuan ${canonicalMod} dari ${targetUser.name} (${targetUser.employeeId} · ${targetUser.company}) yang menunggu pemeriksaan dan Approval 1 Anda.`;
        createAndBroadcastNotification({
          title: ap1Title,
          summary: ap1Body,
          body: [ap1Body],
          category: "Approval",
          senderName: targetUser.name,
          senderRole: targetUser.role || "Employee",
          moduleName: canonicalMod,
          approvalStatus: "Pending Approval 1",
          approverName: ap1User.name,
          ctaLabel: "Buka Menu Approvals",
          ctaRoute: approvalRoute,
          targetAll: false,
          targetEmployeeIds: [ap1User.employeeId],
          channels: ["Notifikasi Sistem"],
        });
      }
    } else if (mappedStatus === "Checked") {
      const ap1User = findApproverUser(targetUser.regNoAp1);
      if (ap1User && ap1User.employeeId.toUpperCase() !== targetUser.employeeId.toUpperCase()) {
        const ap1Title = `Telah Di-Check HR Unit · Menunggu Approval 1: ${canonicalMod} — ${targetUser.name}`;
        const ap1Body = `Halo ${ap1User.name}, pengajuan ${canonicalMod} dari ${targetUser.name} (${targetUser.employeeId}) telah selesai diperiksa oleh HR Unit dan kini menunggu Approval 1 Anda.`;
        createAndBroadcastNotification({
          title: ap1Title,
          summary: ap1Body,
          body: [ap1Body],
          category: "Approval",
          senderName: ctx.approverName || "HR Unit Checker",
          senderRole: "HR Unit",
          moduleName: canonicalMod,
          approvalStatus: "Checked",
          approverName: ap1User.name,
          ctaLabel: "Buka Menu Approvals",
          ctaRoute: approvalRoute,
          targetAll: false,
          targetEmployeeIds: [ap1User.employeeId],
          channels: ["Notifikasi Sistem"],
        });
      }
    } else if (mappedStatus === "Approved (Approval 1)") {
      const ap2User = findApproverUser(targetUser.regNoAp2);
      if (ap2User && ap2User.employeeId.toUpperCase() !== targetUser.employeeId.toUpperCase()) {
        const ap2Title = `Menunggu Approval 2: ${canonicalMod} — ${targetUser.name}`;
        const ap2Body = `Halo ${ap2User.name}, pengajuan ${canonicalMod} dari ${targetUser.name} (${targetUser.employeeId} · ${targetUser.company}) telah disetujui oleh Approver 1 (${ctx.approverName}) dan kini menunggu tindak lanjut Approval 2 Anda.`;
        createAndBroadcastNotification({
          title: ap2Title,
          summary: ap2Body,
          body: [ap2Body],
          category: "Approval",
          senderName: ctx.approverName || "Approver 1",
          senderRole: "Approver 1",
          moduleName: canonicalMod,
          approvalStatus: "Pending Approval 2",
          approverName: ap2User.name,
          ctaLabel: "Tindak Lanjuti Approval 2",
          ctaRoute: approvalRoute,
          targetAll: false,
          targetEmployeeIds: [ap2User.employeeId],
          channels: ["Notifikasi Sistem"],
        });
      }
    } else if (mappedStatus === "Approved (Approval 2)" && isFourStepMod) {
      const validators = findHrIcfValidators();
      if (validators.length > 0) {
        const valTitle = `Menunggu Validasi HR ICF: ${canonicalMod} — ${targetUser.name}`;
        const valBody = `Pengajuan ${canonicalMod} dari ${targetUser.name} (${targetUser.employeeId} · ${targetUser.company}) telah disetujui oleh Approver 2 dan siap untuk divalidasi (Validate).`;
        createAndBroadcastNotification({
          title: valTitle,
          summary: valBody,
          body: [valBody],
          category: "Approval",
          senderName: ctx.approverName || "Approver 2",
          senderRole: "Approver 2",
          moduleName: canonicalMod,
          approvalStatus: "Pending Validation",
          ctaLabel: "Validate Pengajuan",
          ctaRoute: approvalRoute,
          targetAll: false,
          targetEmployeeIds: validators.map((v) => v.employeeId),
          channels: ["Notifikasi Sistem"],
        });
      }
    }
  }
}

export function useNotificationStore(userOverride?: ManagedUser) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdate);
    window.addEventListener("pa-auth-updated", onUpdate);
    window.addEventListener("pa-db-hydrated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, onUpdate);
      window.removeEventListener("pa-auth-updated", onUpdate);
      window.removeEventListener("pa-db-hydrated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const activeUser = userOverride ?? getActiveUser();
  const userNotifications = getNotificationsForUser(activeUser);
  const unreadCount = userNotifications.filter((n) => !n.isRead).length;
  const allNotifications = loadAllNotifications();
  const autoTemplates = loadAutoNotificationTemplates();

  return {
    notifications: userNotifications,
    userNotifications,
    allNotifications,
    autoTemplates,
    unreadCount,
    markAsRead: (id: string) => markNotificationAsRead(id, activeUser.employeeId),
    markAllAsRead: () => markAllNotificationsAsRead(activeUser.employeeId),
    clearSingle: (id: string) => clearSingleNotificationForUser(id, activeUser.employeeId),
    clearOne: (id: string) => clearSingleNotificationForUser(id, activeUser.employeeId),
    clearAllRead: () => clearReadNotificationsForUser(activeUser.employeeId),
    updateAutoTemplates: (templates: AutoNotificationTemplate[]) =>
      saveAutoNotificationTemplates(templates),
    broadcastNotification: (
      payload: Omit<
        AppNotificationItem,
        "id" | "createdAt" | "readByEmployeeIds" | "clearedByEmployeeIds"
      >,
    ) => createAndBroadcastNotification(payload),
  };
}
