import { simulationAssignments } from "./paSimulation2026.ts";
import { applyKpiAction, WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiItem } from "./kpiSettingWorkflow.ts";

export type TrackingWindow = { startDate: string; endDate: string; dateLock: number; backlogMonths: number[]; backlogEnd: string | null; locked: boolean };
export type LockScope = "submission" | "revision" | "approval";
export type OpenLock = { id: string; employee_id: string; period: string; month: number; scope: LockScope; requester_id: string; reason: string; status: "Pending" | "Approved" | "Rejected"; expires_on: string | null; decided_by: string | null; created_at: string };
export type TrackingDocument = KpiDocument & { month: number; settingVersion: number; actuals: Record<string, number | null>; evidence: string[] };
export const trackingMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function wibDate(now: string) {
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw new WorkflowError("Waktu tidak valid.");
  return new Date(time + 7 * 3600000).toISOString().slice(0, 10);
}
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateTrackingWindow(window: TrackingWindow) {
  if (!validDate(window.startDate) || !validDate(window.endDate) || window.startDate > window.endDate ||
    !window.startDate.startsWith("2026-") || !Number.isInteger(window.dateLock) || window.dateLock < 1 || window.dateLock > 28 ||
    typeof window.locked !== "boolean" || !Array.isArray(window.backlogMonths) || new Set(window.backlogMonths).size !== window.backlogMonths.length ||
    window.backlogMonths.some((month) => !Number.isInteger(month) || month < 1 || month > 4) ||
    (window.backlogMonths.length > 0 && (!validDate(window.backlogEnd) || window.backlogEnd < window.startDate || window.backlogEnd > window.endDate)) ||
    (window.backlogMonths.length === 0 && window.backlogEnd !== null)) throw new WorkflowError("Konfigurasi KPI Measurement tidak valid. Date Lock 1–28; bulan tertinggal hanya Januari–April dengan batas akses.");
}
export function monthDeadline(period: string, month: number, dateLock: number) {
  return `${Number(period) + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-${String(dateLock).padStart(2, "0")}`;
}
export function assertTrackingAccess(document: TrackingDocument, scope: LockScope, now: string, window: TrackingWindow | null, grants: OpenLock[]) {
  if (!window) throw new WorkflowError("HR Strategic belum membuka KPI Measurement.");
  validateTrackingWindow(window);
  const today = wibDate(now);
  const first = `${document.period}-${String(document.month).padStart(2, "0")}-01`;
  if (window.locked || today < window.startDate || today < first) throw new WorkflowError("Fase terkunci, belum dibuka, atau bulan Tracking masih mendatang.");
  const regular = today <= window.endDate && today <= monthDeadline(document.period, document.month, window.dateLock);
  const backlog = today <= window.endDate && window.backlogMonths.includes(document.month) && window.backlogEnd !== null && today <= window.backlogEnd;
  const permit = grants.some((grant) => grant.period === document.period && grant.employee_id === document.employeeId && grant.month === document.month && grant.scope === scope && grant.status === "Approved" && grant.expires_on !== null && today <= grant.expires_on);
  if (!regular && !backlog && !permit) throw new WorkflowError(`Akses ${scope} terkunci. Ajukan Request Open Lock sesuai jenis tindakan.`);
}
export function trackingScope(document: TrackingDocument, action: KpiAction): LockScope {
  return action === "save" || action === "submit" ? document.revisionStage === null ? "submission" : "revision" : "approval";
}
export function createTrackingDocument(setting: KpiDocument, month: number): TrackingDocument {
  if (setting.status !== "Validated" || !Number.isInteger(month) || month < 1 || month > 12) throw new WorkflowError("Tracking hanya tersedia dari KPI Setting tervalidasi dan bulan 1–12.");
  assertSupportedIndicators(setting);
  const assignment = simulationAssignments.find((record) => record.employeeId === setting.employeeId && record.module === "kpi" && record.phase === "measurement");
  if (!assignment?.complete || assignment.stages.some((stage) => !stage.actorId || stage.actorId === setting.employeeId)) throw new WorkflowError("Penugasan KPI Measurement belum lengkap atau melanggar larangan approval sendiri.");
  return { ...structuredClone(setting), month, settingVersion: setting.version, version: 0, status: "Draft", activeStage: -1, revisionStage: null, history: [],
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })), mirrorSecondSlot: assignment.mirrorSecondSlot,
    actuals: Object.fromEntries(setting.items.map((item) => [item.id, null])), evidence: [] };
}
export function achievement(item: KpiItem, target: number | null, actual: number | null) {
  if (target === null || actual === null) return null;
  if (!Number.isFinite(target) || target < 0) throw new WorkflowError("Target kalkulasi tidak valid.");
  if (!Number.isFinite(actual)) throw new WorkflowError("Aktual harus angka finite; kosong bukan nol.");
  if (item.polarity === "maximize") {
    if (target <= 0) throw new WorkflowError("Target maksimalisasi harus lebih dari nol.");
    const result = actual / target * 100;
    if (!Number.isFinite(result)) throw new WorkflowError("Capaian melampaui batas numerik.");
    return result;
  }
  return actual <= target ? 100 : target / actual * 100;
}
export function trackingAchievements(document: TrackingDocument) {
  return document.items.map((item) => ({ itemId: item.id, subject: item.subject, target: item.months[document.month - 1].target,
    actual: document.actuals[item.id], achievement: achievement(item, item.months[document.month - 1].target, document.actuals[item.id]) }));
}
export function validateTrackingEvidence(contentType: string, size: number, bytes: Uint8Array) {
  if (!["image/jpeg","image/png","application/pdf"].includes(contentType) || !Number.isInteger(size) || size <= 0 || size > 10485760 || bytes.byteLength !== size) throw new WorkflowError("Bukti harus JPG/PNG/PDF, maksimal 10 MB per file.");
  const validSignature = contentType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : contentType === "image/png" ? [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value) : new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-";
  if (!validSignature) throw new WorkflowError("Isi file tidak sesuai tipe bukti.");
}
export function transitionTracking(document: TrackingDocument, input: { action: KpiAction; actorId: string; actuals?: Record<string, number | null>; evidence?: string[]; note?: string; now: string; window: TrackingWindow | null; grants: OpenLock[] }) {
  assertTrackingAccess(document, trackingScope(document, input.action), input.now, input.window, input.grants);
  const ownerAction = input.action === "save" || input.action === "submit";
  if (!ownerAction && (input.actuals !== undefined || input.evidence !== undefined)) throw new WorkflowError("Aktor pemeriksa tidak boleh mengubah aktual atau bukti.");
  const candidate = structuredClone(document);
  if (ownerAction) {
    if (input.actuals !== undefined) candidate.actuals = input.actuals;
    if (input.evidence !== undefined) candidate.evidence = input.evidence;
    if (!candidate.actuals || typeof candidate.actuals !== "object" || Array.isArray(candidate.actuals) || Object.keys(candidate.actuals).length !== document.items.length || document.items.some((item) => !Object.hasOwn(candidate.actuals, item.id))) throw new WorkflowError("Aktual harus sesuai indikator Setting resmi.");
    for (const item of document.items) {
      const actual = candidate.actuals[item.id];
      const scheduled = item.months[document.month - 1].target !== null;
      if (actual !== null && (!Number.isFinite(actual) || !scheduled)) throw new WorkflowError("Aktual tidak valid atau bulan indikator tidak berlaku.");
      if (input.action === "submit" && scheduled && actual === null) throw new WorkflowError("Seluruh aktual bulan yang dinilai wajib diisi. Nol aktual boleh; data kosong tidak boleh.");
    }
    if (!Array.isArray(candidate.evidence) || candidate.evidence.length > 10 || new Set(candidate.evidence).size !== candidate.evidence.length || candidate.evidence.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) throw new WorkflowError("Lampiran harus unik, maksimal 10 file.");
    if (input.action === "submit" && !candidate.evidence.length) throw new WorkflowError("Minimal satu lampiran bukti wajib per submission bulan.");
    if (input.action === "submit" && !document.items.some((item) => item.months[document.month - 1].target !== null)) throw new WorkflowError("Seluruh indikator bulan ini Tidak Berlaku; tidak dibuat submission atau approval otomatis.");
    if (input.action === "submit") trackingAchievements(candidate);
  }
  const updated = applyKpiAction(candidate, { action: input.action, actorId: input.actorId, note: input.note, now: input.now });
  return updated as TrackingDocument;
}
export function annualKpiScore(setting: KpiDocument, documents: TrackingDocument[]) {
  assertSupportedIndicators(setting);
  let complete = true;
  let score = 0;
  for (const item of setting.items) {
    const targets: number[] = [];
    const actuals: number[] = [];
    let missing = false;
    item.months.forEach((month, index) => {
      if (month.target === null) return;
      const record = documents.find((document) => document.month === index + 1 && document.employeeId === setting.employeeId && document.settingVersion === setting.version && document.status === "Validated");
      const actual = record?.actuals[item.id];
      if (actual === undefined || actual === null) { missing = true; return; }
      targets.push(month.target); actuals.push(actual);
    });
    if (missing) { complete = false; continue; }
    if (!targets.length) continue;
    const aggregate = (values: number[]) => item.formula === "last" ? values[values.length - 1] : values.reduce((total, value) => total + value, 0) / (item.formula === "average" ? values.length : 1);
    const raw = achievement(item, aggregate(targets), aggregate(actuals))!;
    score += Math.min(raw, 100) * item.weight / 100;
  }
  return { complete, score: complete ? score : null, weightedScore: complete ? score * setting.snapshot.weights.kpi / 100 : null };
}
function assertSupportedIndicators(setting: KpiDocument) {
  if (setting.items.some((item) => {
    const structured = item as KpiItem & { subIndicators?: unknown; subRows?: unknown };
    return structured.subIndicators !== undefined || structured.subRows !== undefined;
  })) throw new WorkflowError("KPI kompleks/subindikator belum dimodelkan di Setting simulasi; tidak dihitung sebagai indikator tunggal.");
}
