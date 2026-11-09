import { simulationAssignments } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiStage } from "./kpiSettingWorkflow.ts";

export type RcaTrigger = {
  id: number; employee_id: string; period: string; month: number; item_id: string;
  source_version: number; target: number; actual: number; achievement: number;
  improvement_status: string; closure_validated: boolean;
};
export const rcaStatuses = ["Belum dilaksanakan", "Sedang dilaksanakan", "Selesai", "Ditunda", "Dibatalkan"] as const;
export type RcaPlan = {
  id: string; action: string; targetDate: string; pic: string;
  status: typeof rcaStatuses[number]; keterangan: string; output: string; evidence: string[];
};
export type RcaProblem = { id: string; masalahUtama: string; kenapaA: string; kenapaB: string; kenapaC: string; actionPlans: RcaPlan[] };
export type RcaDocument = {
  triggerId: number; employeeId: string; period: string; month: number; subject: string; unitId: string;
  sourceVersion: number; target: number; actual: number; achievement: number;
  version: number; status: string; cycle: "plan" | "follow-up"; activeStage: number; revisionStage: number | null;
  stages: KpiStage[]; mirrorSecondSlot: boolean; problems: RcaProblem[]; history: KpiDocument["history"];
  lastSubmittedEvidence?: string[];
};
const pending: Record<string, string> = { checker: "Pending-Checker", "approver-1": "Pending-Approver 1", "approver-2": "Pending-Approver 2", validator: "Pending-Validate" };

export function createRcaDocument(trigger: RcaTrigger, source: KpiDocument): RcaDocument {
  const assignment = simulationAssignments.find((entry) => entry.employeeId === trigger.employee_id && entry.module === "rca");
  const item = source.items.find((entry) => entry.id === trigger.item_id);
  if (!assignment?.complete || !item || source.employeeId !== trigger.employee_id || source.period !== trigger.period || source.version !== trigger.source_version || source.status !== "Validated") {
    throw new WorkflowError("Sumber Tracking tervalidasi atau penugasan RCA tidak lengkap.");
  }
  return {
    triggerId: trigger.id, employeeId: trigger.employee_id, period: trigger.period, month: trigger.month,
    subject: item.subject, unitId: source.snapshot.unitId, sourceVersion: trigger.source_version,
    target: trigger.target, actual: trigger.actual, achievement: trigger.achievement,
    version: 0, status: "Draft", cycle: "plan", activeStage: -1, revisionStage: null,
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot, problems: [], history: [],
  };
}

export function canReadRca(document: RcaDocument, actorId: string, strategic: boolean) {
  return strategic || document.employeeId === actorId ||
    (document.history.some((event) => event.action === "submit") && document.stages.some((stage) => stage.actorId === actorId));
}
export function canEditRca(document: RcaDocument, actorId: string) {
  return !isRcaClosed(document) && document.employeeId === actorId && (document.status === "Draft" || document.status === "Approved" || document.revisionStage !== null);
}
export function rcaAllFinal(problems: RcaProblem[]) {
  const plans = problems.flatMap((problem) => problem.actionPlans);
  return plans.length > 0 && plans.every((plan) => plan.status === "Selesai" || plan.status === "Dibatalkan");
}
export function isRcaClosed(document: RcaDocument) {
  const last = document.history[document.history.length - 1];
  // Older documents may have been validated as Approved even with all plans final.
  return document.status === "Closed" || (document.status === "Approved" && rcaAllFinal(document.problems) &&
    last?.action === "advance" && last.stage === "validator");
}
export function rcaProgress(problems: RcaProblem[]) {
  const plans = problems.flatMap((problem) => problem.actionPlans).filter((plan) => plan.status !== "Dibatalkan");
  return { total: plans.length, complete: plans.filter((plan) => plan.status === "Selesai").length };
}
export function rcaEvidenceIds(document: RcaDocument) {
  return [...new Set(document.problems.flatMap((problem) => problem.actionPlans.flatMap((plan) => plan.evidence)))];
}
function text(value: unknown): value is string { return typeof value === "string" && value.length <= 10000; }
export function validateRcaProblems(problems: RcaProblem[], submitting: boolean) {
  if (!Array.isArray(problems) || problems.length > 20 || (submitting && !problems.length)) throw new WorkflowError("Isi minimal satu masalah utama (maksimal 20).");
  const ids = new Set<string>();
  for (const problem of problems) {
    if (!problem || !text(problem.id) || !problem.id || ids.has(problem.id) ||
      ![problem.masalahUtama, problem.kenapaA, problem.kenapaB, problem.kenapaC].every(text) ||
      !Array.isArray(problem.actionPlans) || problem.actionPlans.length > 20) throw new WorkflowError("Struktur analisis RCA tidak valid.");
    ids.add(problem.id);
    if (submitting && (![problem.masalahUtama, problem.kenapaA, problem.kenapaB, problem.kenapaC].every((value) => value.trim()) || !problem.actionPlans.length)) throw new WorkflowError("Lengkapi masalah utama, analisis penyebab, dan action plan.");
    for (const plan of problem.actionPlans) {
      if (!plan || !text(plan.id) || !plan.id || ids.has(plan.id) ||
        ![plan.action, plan.targetDate, plan.pic, plan.keterangan, plan.output].every(text) ||
        !rcaStatuses.includes(plan.status) || !Array.isArray(plan.evidence) ||
        !plan.evidence.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) ||
        new Set(plan.evidence).size !== plan.evidence.length) throw new WorkflowError("Struktur action plan atau lampiran tidak valid.");
      ids.add(plan.id);
      if (submitting) {
        const date = plan.targetDate;
        if (!plan.action.trim() || !plan.pic.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new WorkflowError("Lengkapi tindakan, PIC, dan target penyelesaian yang valid.");
        if (["Ditunda", "Dibatalkan"].includes(plan.status) && !plan.keterangan.trim()) throw new WorkflowError("Penundaan/pembatalan wajib disertai alasan.");
        if (plan.status === "Selesai" && (!plan.output.trim() || !plan.evidence.length)) throw new WorkflowError("Action plan Selesai wajib memiliki output dan evidence.");
      }
    }
  }
}

export function transitionRca(document: RcaDocument, input: { action: KpiAction; actorId: string; problems?: RcaProblem[]; note?: string; now: string }): RcaDocument {
  if (!Number.isFinite(Date.parse(input.now)) || (input.note !== undefined && !text(input.note))) throw new WorkflowError("Waktu/catatan RCA tidak valid.");
  if (isRcaClosed(document)) throw new WorkflowError("RCA final (Selesai/Dibatalkan) sudah tervalidasi dan terkunci.");
  const next = structuredClone(document);
  const previouslySubmitted = document.history.some((event) => event.action === "submit");
  const lastSubmittedEvidence = document.lastSubmittedEvidence ?? (previouslySubmitted ? rcaEvidenceIds(document) : []);
  next.lastSubmittedEvidence = [...lastSubmittedEvidence];
  let stage: string | null = null;
  if (input.action === "save" || input.action === "submit") {
    if (!canEditRca(document, input.actorId)) throw new WorkflowError("Hanya pemilik dapat mengubah draft, progres yang disetujui, atau revisi resmi.");
    if (input.problems !== undefined) next.problems = structuredClone(input.problems);
    validateRcaProblems(next.problems, input.action === "submit");
    for (const problem of document.problems) {
      for (const plan of problem.actionPlans) {
        if (!plan.evidence.length) continue;
        const updated = next.problems.find((entry) => entry.id === problem.id)?.actionPlans.find((entry) => entry.id === plan.id);
        if (!updated || plan.evidence.some((id) => !updated.evidence.includes(id))) throw new WorkflowError("Evidence yang sudah tersimpan tidak boleh dihapus, diganti, atau dipindahkan. Batalkan action plan dengan alasan bila tidak dilanjutkan.");
      }
    }
    if (input.action === "submit") {
      const evidence = rcaEvidenceIds(next);
      if (previouslySubmitted && !evidence.some((id) => !lastSubmittedEvidence.includes(id))) throw new WorkflowError("Setiap submit pembaruan/revisi RCA wajib menambahkan evidence baru. Evidence sebelumnya tetap disimpan.");
      next.lastSubmittedEvidence = evidence;
      if (!next.stages.length || next.stages.some((entry) => !entry.actorId || entry.actorId === next.employeeId)) throw new WorkflowError("Penugasan RCA wajib lengkap tanpa approval sendiri.");
      if (document.status === "Approved") next.cycle = "follow-up";
      next.activeStage = next.revisionStage ?? 0;
      next.revisionStage = null;
      next.status = pending[next.stages[next.activeStage].stage];
    }
  } else if (input.action === "advance" || input.action === "revise") {
    const active = next.stages[next.activeStage];
    if (input.problems !== undefined) throw new WorkflowError("Pemeriksa tidak boleh mengubah isi RCA.");
    if (!active || active.actorId !== input.actorId || input.actorId === next.employeeId ||
      next.revisionStage !== null || next.status !== pending[active.stage]) throw new WorkflowError("Hanya aktor tahap aktif yang boleh memutuskan.");
    stage = active.stage;
    if (input.action === "revise") {
      if (!input.note?.trim()) throw new WorkflowError("Alasan revisi wajib diisi.");
      next.revisionStage = next.activeStage;
      next.status = `Revision-${active.stage}`;
    } else {
      validateRcaProblems(next.problems, true);
      next.activeStage++;
      if (next.activeStage === next.stages.length) {
        next.status = rcaAllFinal(next.problems) ? "Closed" : "Approved";
      } else next.status = pending[next.stages[next.activeStage].stage];
    }
  } else throw new WorkflowError("Tindakan RCA tidak tersedia.");
  next.version++;
  next.history.push({ action: input.action, actorId: input.actorId, stage, status: next.status, note: input.note?.trim() ?? "", at: input.now, version: next.version });
  if (input.action === "advance" && stage === "approver-1" && next.mirrorSecondSlot) next.history.push({
    action: input.action, actorId: input.actorId, stage: "approver-2", status: next.status,
    note: "sesuai catatan approver 1", at: input.now, version: next.version, mirrored: true,
  });
  return next;
}

export function rcaRecipients(document: RcaDocument, action: KpiAction) {
  if (action === "save") return [];
  const recipients = action === "submit" ? [] : [document.employeeId];
  if (document.revisionStage === null && document.status.startsWith("Pending") && document.stages[document.activeStage]) recipients.push(document.stages[document.activeStage].actorId);
  return [...new Set(recipients)];
}
