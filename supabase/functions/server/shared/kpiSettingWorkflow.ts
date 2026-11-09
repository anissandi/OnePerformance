import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";

export type KpiItem = {
  id: string;
  subject: string;
  unit: string;
  definition: string;
  source: string;
  presentation?: { section: "A" | "B"; perspective: string; baseline: string; formulaDetail: string; notes: string };
  weight: number;
  polarity: "maximize" | "minimize";
  formula: "sum" | "average" | "last";
  months: { target: number | null; notApplicableReason: string }[];
};
export type KpiStage = { stage: string; actorId: string };
export type KpiDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  items: KpiItem[];
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: { action: string; actorId: string; stage: string | null; status: string; note: string; at: string; version: number; mirrored?: boolean }[];
};
export type KpiWindow = { startDate: string; endDate: string; locked: boolean };
export type KpiAction = "save" | "submit" | "advance" | "revise";

export class WorkflowError extends Error {}

const pending: Record<string, string> = {
  checker: "Pending-Checker", "approver-1": "Pending-Approver 1",
  "approver-2": "Pending-Approver 2", validator: "Pending-Validate",
};
const revision: Record<string, string> = {
  checker: "Revision-Checker", "approver-1": "Revision-Approver 1",
  "approver-2": "Revision-Approver 2", validator: "Revision-Validator",
};
const weights: Record<string, Record<string, number>> = {
  operasional: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  seksi: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  bagian: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 15, "manager-skill": 15 },
  departemen: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 10, "manager-skill": 20 },
  divisi: { kpi: 40, "smart-goals": 10, "appraisal-form": 10, project: 10, "manager-skill": 20, "management-interview": 10 },
};

export function createKpiDocument(employeeId: string): KpiDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationAssignments.find((record) => record.employeeId === employeeId && record.module === "kpi" && record.phase === "setting");
  if (!employee || !assignment || !assignment.complete || !simulationUnits.some((unit) => unit.id === employee.unitId)) {
    throw new WorkflowError("Penugasan KPI Setting belum lengkap atau peserta tidak berlaku.");
  }
  if (assignment.stages.some((stage) => stage.actorId === employeeId)) throw new WorkflowError("Pengajuan sendiri tidak boleh diperiksa atau disetujui sendiri.");
  return {
    employeeId, period: employee.period, version: 0, status: "Draft", activeStage: -1, revisionStage: null, items: [],
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level, weights: { ...weights[employee.level] } }, history: [],
  };
}

export function canReadKpi(document: KpiDocument, actorId: string, strategic: boolean) {
  return strategic || document.employeeId === actorId || (document.status !== "Draft" && document.stages.some((stage) => stage.actorId === actorId));
}

export function validateKpiItems(items: KpiItem[]) {
  validateKpiShape(items);
  if (!Array.isArray(items) || !items.length) throw new WorkflowError("Minimal satu indikator KPI diperlukan.");
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new WorkflowError("ID indikator KPI harus unik.");
  let total = 0;
  for (const item of items) {
    if (![item.id, item.subject, item.unit, item.definition, item.source].every((value) => typeof value === "string" && value.trim())) {
      throw new WorkflowError("Lengkapi subjek, satuan, definisi, dan sumber data KPI.");
    }
    if (!Number.isInteger(item.weight) || item.weight < 0 || item.weight > 100) throw new WorkflowError("Bobot indikator harus bilangan bulat 0–100%.");
    total += item.weight;
    if (!["maximize", "minimize"].includes(item.polarity) || !["sum", "average", "last"].includes(item.formula)) throw new WorkflowError("Formula atau polaritas tidak valid.");
    if (!Array.isArray(item.months) || item.months.length !== 12) throw new WorkflowError("Setting harus menjelaskan target atau status tidak berlaku untuk 12 bulan.");
    for (const month of item.months) {
      if (!month || typeof month.notApplicableReason !== "string") throw new WorkflowError("Data bulan tidak valid.");
      if (month.target === null) {
        if (!month.notApplicableReason.trim()) throw new WorkflowError("Bulan tanpa target wajib memiliki alasan tidak dijadwalkan.");
      } else {
        if (!Number.isFinite(month.target) || month.target < 0 || month.notApplicableReason.trim()) throw new WorkflowError("Target bulanan tidak valid atau bertentangan dengan status tidak berlaku.");
        if (item.polarity === "maximize" && month.target === 0) throw new WorkflowError("Target nol tidak diperbolehkan untuk maksimalisasi.");
      }
    }
  }
  if (total !== 100) throw new WorkflowError(`Total bobot indikator ${total}%; wajib tepat 100%.`);
}

function validateKpiShape(items: KpiItem[]) {
  if (!Array.isArray(items) || items.length > 100) throw new WorkflowError("Format indikator KPI tidak valid.");
  for (const item of items) {
    if (item?.presentation !== undefined && (!item.presentation || !["A", "B"].includes(item.presentation.section) ||
      ![item.presentation.perspective, item.presentation.baseline, item.presentation.formulaDetail, item.presentation.notes].every((value) => typeof value === "string"))) {
      throw new WorkflowError("Format informasi tampilan KPI tidak valid.");
    }
    if (!item || ![item.id, item.subject, item.unit, item.definition, item.source].every((value) => typeof value === "string") ||
      !Number.isFinite(item.weight) || !["maximize", "minimize"].includes(item.polarity) ||
      !["sum", "average", "last"].includes(item.formula) || !Array.isArray(item.months) || item.months.length !== 12 ||
      item.months.some((month) => !month || typeof month.notApplicableReason !== "string" || (month.target !== null && !Number.isFinite(month.target)))) {
      throw new WorkflowError("Format indikator atau target bulanan tidak valid.");
    }
  }
}

export function aggregateTarget(item: KpiItem) {
  const targets = item.months.map((month) => month.target).filter((target): target is number => target !== null);
  if (!targets.length) return null;
  if (item.formula === "last") return targets[targets.length - 1];
  const total = targets.reduce((sum, value) => sum + value, 0);
  return item.formula === "average" ? total / targets.length : total;
}

export function transitionKpi(document: KpiDocument, input: {
  action: KpiAction; actorId: string; items?: KpiItem[]; note?: string; now: string; window: KpiWindow | null;
}): KpiDocument {
  if (input.note !== undefined && typeof input.note !== "string") throw new WorkflowError("Catatan harus berupa teks.");
  const now = new Date(input.now).getTime();
  const window = input.window;
  if (!window || window.locked || !/^\d{4}-\d{2}-\d{2}$/.test(window.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(window.endDate)) throw new WorkflowError("Jadwal KPI Setting belum dibuka atau fase terkunci.");
  const start = new Date(window.startDate + "T00:00:00+07:00").getTime();
  const end = new Date(window.endDate + "T00:00:00+07:00").getTime() + 86400000;
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || now < start || now >= end) throw new WorkflowError("Di luar jadwal KPI Setting (WIB). Open Lock belum tersambung pada fase ini.");
  return applyKpiAction(document, input);
}

export function applyKpiAction(document: KpiDocument, input: {
  action: KpiAction; actorId: string; items?: KpiItem[]; note?: string; now: string;
}): KpiDocument {
  if (input.note !== undefined && typeof input.note !== "string") throw new WorkflowError("Catatan harus berupa teks.");
  if (document.status === "Validated") throw new WorkflowError("KPI yang sudah tervalidasi terkunci.");
  const next = structuredClone(document);
  const owner = input.actorId === document.employeeId;
  const editable = document.status === "Draft" || document.revisionStage !== null;
  let eventStage: string | null = null;
  if (input.action === "save" || input.action === "submit") {
    if (!owner || !editable) throw new WorkflowError("Hanya pemilik dapat mengubah Draft atau revisi resmi.");
    if (input.items !== undefined) {
      validateKpiShape(input.items);
      next.items = structuredClone(input.items);
    }
    if (input.action === "submit") {
      validateKpiItems(next.items);
      if (!next.stages.length || next.stages.some((stage) => !stage.actorId || stage.actorId === next.employeeId)) throw new WorkflowError("Penugasan wajib belum lengkap atau melanggar larangan approval sendiri.");
      next.activeStage = next.revisionStage ?? 0;
      next.revisionStage = null;
      next.status = pending[next.stages[next.activeStage].stage];
    }
  } else if (input.action === "advance" || input.action === "revise") {
    const active = next.stages[next.activeStage];
    if (owner || !active || active.actorId !== input.actorId || next.revisionStage !== null || next.status !== pending[active.stage]) throw new WorkflowError("Keputusan hanya boleh diberikan aktor tahap aktif yang ditugaskan.");
    eventStage = active.stage;
    if (input.action === "revise") {
      if (!input.note?.trim()) throw new WorkflowError("Alasan revisi wajib diisi.");
      next.revisionStage = next.activeStage;
      next.status = revision[active.stage];
    } else {
      next.activeStage += 1;
      next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
    }
  } else throw new WorkflowError("Tindakan tidak tersedia pada KPI Setting.");
  next.version += 1;
  next.history.push({ action: input.action, actorId: input.actorId, stage: eventStage, status: next.status,
    note: input.note?.trim() ?? "", at: input.now, version: next.version });
  if (input.action === "advance" && eventStage === "approver-1" && next.mirrorSecondSlot) {
    next.history.push({ action: "advance", actorId: input.actorId, stage: "approver-2", status: next.status,
      note: "sesuai catatan approver 1", at: input.now, version: next.version, mirrored: true });
  }
  return next;
}

export function kpiNotificationRecipients(document: KpiDocument, action: KpiAction) {
  if (action === "save") return [];
  const recipients = action === "submit" ? [] : [document.employeeId];
  if (document.revisionStage === null && document.stages[document.activeStage]) recipients.push(document.stages[document.activeStage].actorId);
  return [...new Set(recipients)];
}
