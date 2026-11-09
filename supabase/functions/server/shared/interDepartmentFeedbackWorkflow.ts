import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiDocument, KpiStage, KpiWindow } from "./kpiSettingWorkflow.ts";
import { assertWindowOpen } from "./smartGoalsWorkflow.ts";

export const IDF_FOLLOW_UP_COLUMNS = [
  "Aspek Perbaikan",
  "Rencana Pengembangan",
  "Tindak Lanjut",
  "Evaluasi",
  "Timeline Evaluasi",
  "Indikator Keberhasilan",
] as const;
export type IdfFollowUpColumn = typeof IDF_FOLLOW_UP_COLUMNS[number];
export type IdfFollowUpRow = Record<IdfFollowUpColumn, string>;

export const IDF_INDICATORS = [
  {
    key: "q1",
    label: "Apa hal terbaik yang anda lihat dari cara individu tersebut bekerja?",
    sentiment: "positive" as const,
  },
  {
    key: "q2",
    label: "Menurut Anda, apa yang perlu ditingkatkan dari individu tersebut?",
    sentiment: "negative" as const,
  },
  {
    key: "q3",
    label: "Bagaimana individu tersebut berkontribusi terhadap rekan kerja sama tim atau lintas unit?",
    sentiment: "positive" as const,
  },
  {
    key: "q4",
    label: "Tolong deskripsikan satu contoh aktivitas/diskusi ketika individu tersebut membantu anda atau tim dengan baik?",
    sentiment: "positive" as const,
  },
  {
    key: "q5",
    label: "Apa saran Anda agar individu tersebut dapat bekerja lebih efektif?",
    sentiment: "negative" as const,
  },
] as const;
export type IdfIndicatorKey = typeof IDF_INDICATORS[number]["key"];

export type IdfNominationRecord = {
  giverId: string;
  status: "Pending" | "Submitted";
  submittedAt?: string;
};

export type IdfFeedbackEntry = {
  id: string;
  giverId?: string; // Stored in DB for task tracking, stripped before returning to recipient/approvers
  division: string;
  companyUnit: string;
  answers: Record<IdfIndicatorKey, string>;
  submittedAt: string;
};

export type IdfDocument = {
  employeeId: string;
  period: string;
  version: number;
  status:
    | "Draft"
    | "Awaiting Feedback"
    | "Awaiting Summary"
    | "Pending-Approver 1"
    | "Pending-Approver 2"
    | "Validated";
  activeStage: number;
  nominations: IdfNominationRecord[];
  feedbacks: IdfFeedbackEntry[];
  summaries: Record<string, string>;
  summarySubmittedAt?: string;
  followUps: {
    approver1?: IdfFollowUpRow[];
    approver2?: IdfFollowUpRow[];
  };
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string };
  history: KpiDocument["history"];
};

export type IdfTaskView = {
  recipientId: string;
  recipientName: string;
  recipientPosition: string;
  recipientDepartment: string;
  recipientDivision: string;
  recipientCompanyUnit: string;
  unitId: string;
  status: "Pending" | "Submitted";
  submittedAt?: string;
  documentVersion: number;
};

function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 10000;
}

const normalize = (value: string | undefined) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

export function isEligibleForIdf(employeeId: string): boolean {
  const employee = simulationEmployees.find((emp) => emp.id === employeeId);
  return !!employee && employee.allowedModules.includes("inter-department-feedback");
}

export function idfGiverEligibilityError(recipientId: string, giverId: string): string {
  if (recipientId === giverId) return "Karyawan tidak dapat memilih dirinya sendiri.";
  const recipient = simulationEmployees.find((emp) => emp.id === recipientId);
  const giver = simulationEmployees.find((emp) => emp.id === giverId);
  if (!recipient || !giver) return "Karyawan pemberi feedback tidak ditemukan dalam dataset simulasi.";
  if (normalize(recipient.companyUnit) !== normalize(giver.companyUnit)) return "";
  const sameDepartment =
    normalize(recipient.departmentId) === normalize(giver.departmentId) ||
    (normalize(recipient.division) === normalize(giver.division) &&
      normalize(recipient.department) === normalize(giver.department));
  if (sameDepartment) {
    return "Pemberi feedback tidak boleh berasal dari departemen dan bagian yang sama dengan penerima.";
  }
  return "";
}

export function createIdfDocument(employeeId: string): IdfDocument {
  const employee = simulationEmployees.find((emp) => emp.id === employeeId);
  const assignment = simulationAssignments.find(
    (record) => record.employeeId === employeeId && record.module === "inter-department-feedback" && record.phase === "measurement",
  );
  if (
    !employee ||
    !employee.allowedModules.includes("inter-department-feedback") ||
    !assignment ||
    !assignment.complete ||
    !simulationUnits.some((unit) => unit.id === employee.unitId)
  ) {
    throw new WorkflowError("Modul Inter-Department Feedback hanya berlaku untuk posisi/level Kepala Bagian ke atas (termasuk Supervisor HR Unit).");
  }
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Draft",
    activeStage: -1,
    nominations: [],
    feedbacks: [],
    summaries: {},
    followUps: {},
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level },
    history: [],
  };
}

export function canReadIdfDocument(document: IdfDocument, actorId: string, strategic: boolean): boolean {
  if (strategic || document.employeeId === actorId) return true;
  if (
    (document.status === "Pending-Approver 1" ||
      document.status === "Pending-Approver 2" ||
      document.status === "Validated") &&
    document.stages.some((stage) => stage.actorId === actorId)
  ) {
    return true;
  }
  return false;
}

/**
 * Strips `giverId` from received feedbacks so neither the recipient nor approvers
 * can see which nominated colleague wrote which feedback.
 */
export function sanitizeIdfDocumentForViewer(document: IdfDocument, viewerId: string): IdfDocument {
  const clone = structuredClone(document);
  clone.feedbacks = clone.feedbacks.map(({ giverId: _hidden, ...rest }) => rest);
  // Approvers only see anonymous feedbacks & summaries, not the nomination list of giver IDs
  if (viewerId !== document.employeeId) {
    clone.nominations = [];
  }
  return clone;
}

export function nominateIdfGivers(
  document: IdfDocument,
  input: { actorId: string; giverIds: string[]; now: string; window: KpiWindow | null },
): { document: IdfDocument; recipients: string[] } {
  assertWindowOpen(input.window, input.now, "Inter-Department Feedback");
  if (input.actorId !== document.employeeId) {
    throw new WorkflowError("Hanya pemilik dokumen yang dapat memilih pemberi feedback untuk dirinya sendiri.");
  }
  if (document.status !== "Draft" || document.nominations.length > 0) {
    throw new WorkflowError("Nominasi pemberi feedback periode ini sudah dikirim dan terkunci.");
  }
  if (!Array.isArray(input.giverIds) || input.giverIds.length !== 3 || new Set(input.giverIds).size !== 3) {
    throw new WorkflowError("Pilih tepat 3 karyawan berbeda sebagai pemberi feedback.");
  }
  for (const giverId of input.giverIds) {
    const err = idfGiverEligibilityError(document.employeeId, giverId);
    if (err) throw new WorkflowError(err);
  }
  const next = structuredClone(document);
  next.nominations = input.giverIds.map((giverId) => ({ giverId, status: "Pending" }));
  next.status = "Awaiting Feedback";
  next.version += 1;
  next.history.push({
    action: "nominate",
    actorId: input.actorId,
    stage: null,
    status: next.status,
    note: "Nominasi 3 pemberi feedback dikirim",
    at: input.now,
    version: next.version,
  });
  return { document: next, recipients: [...input.giverIds] };
}

export function submitIdfColleagueFeedback(
  document: IdfDocument,
  input: { giverId: string; answers: Record<string, string>; now: string; window: KpiWindow | null },
): { document: IdfDocument; recipients: string[] } {
  assertWindowOpen(input.window, input.now, "Inter-Department Feedback");
  const nomIdx = document.nominations.findIndex((n) => n.giverId === input.giverId);
  if (nomIdx < 0) {
    throw new WorkflowError("Anda tidak terdaftar sebagai pemberi feedback untuk karyawan ini.");
  }
  if (document.nominations[nomIdx].status === "Submitted") {
    throw new WorkflowError("Feedback Anda untuk karyawan ini sudah dikirim dan tidak dapat diubah.");
  }
  if (!input.answers || typeof input.answers !== "object") {
    throw new WorkflowError("Jawaban feedback tidak valid.");
  }
  const cleanAnswers = {} as Record<IdfIndicatorKey, string>;
  for (const ind of IDF_INDICATORS) {
    const val = input.answers[ind.key];
    if (!text(val) || !val.trim()) {
      throw new WorkflowError(`Seluruh 5 indikator feedback wajib diisi (${ind.key.toUpperCase()}).`);
    }
    cleanAnswers[ind.key] = val.trim();
  }
  const giver = simulationEmployees.find((emp) => emp.id === input.giverId);
  if (!giver) throw new WorkflowError("Identitas pemberi feedback tidak valid.");

  const next = structuredClone(document);
  next.nominations[nomIdx] = {
    giverId: input.giverId,
    status: "Submitted",
    submittedAt: input.now,
  };
  next.feedbacks.push({
    id: `idf-fb-${next.feedbacks.length + 1}`,
    giverId: input.giverId,
    division: giver.division,
    companyUnit: giver.companyUnit,
    answers: cleanAnswers,
    submittedAt: input.now,
  });
  if (next.feedbacks.length === 3) {
    next.status = "Awaiting Summary";
  }
  next.version += 1;
  next.history.push({
    action: "give-feedback",
    actorId: "ANONIM",
    stage: null,
    status: next.status,
    note: `Feedback anonim #${next.feedbacks.length} diterima (${giver.division} · ${giver.companyUnit})`,
    at: input.now,
    version: next.version,
  });
  return { document: next, recipients: [document.employeeId] };
}

export function submitIdfRecipientSummary(
  document: IdfDocument,
  input: { actorId: string; summaries: Record<string, string>; submit: boolean; now: string; window: KpiWindow | null },
): { document: IdfDocument; recipients: string[] } {
  assertWindowOpen(input.window, input.now, "Inter-Department Feedback");
  if (input.actorId !== document.employeeId) {
    throw new WorkflowError("Hanya penerima feedback yang dapat mengisi summary atas feedback yang diterimanya.");
  }
  if (document.feedbacks.length !== 3 || (document.status !== "Awaiting Summary" && document.status !== "Awaiting Feedback")) {
    throw new WorkflowError("Summary hanya dapat disubmit setelah ketiga feedback anonim diterima.");
  }
  if (document.summarySubmittedAt) {
    throw new WorkflowError("Summary feedback sudah disubmit dan tidak dapat diubah.");
  }
  if (!input.summaries || typeof input.summaries !== "object") {
    throw new WorkflowError("Data summary tidak valid.");
  }
  const cleanSummaries: Record<string, string> = {};
  for (const fb of document.feedbacks) {
    for (const ind of IDF_INDICATORS) {
      const key = `${fb.id}-${ind.key}`;
      const val = input.summaries[key] ?? "";
      if (!text(val)) throw new WorkflowError("Catatan summary terlalu panjang atau tidak valid.");
      if (input.submit && !val.trim()) {
        throw new WorkflowError("Seluruh 15 catatan summary (5 indikator × 3 feedback) wajib diisi sebelum disubmit.");
      }
      if (val.trim()) cleanSummaries[key] = val.trim();
    }
  }

  const next = structuredClone(document);
  next.summaries = cleanSummaries;
  let recipients: string[] = [];
  if (input.submit) {
    next.summarySubmittedAt = input.now;
    next.activeStage = 0;
    next.status = "Pending-Approver 1";
    recipients = [next.stages[0].actorId];
  }
  next.version += 1;
  next.history.push({
    action: input.submit ? "submit-summary" : "save-summary",
    actorId: input.actorId,
    stage: null,
    status: next.status,
    note: input.submit ? "Summary 3 feedback anonim disubmit ke Approver 1" : "Draft summary disimpan",
    at: input.now,
    version: next.version,
  });
  return { document: next, recipients };
}

export function submitIdfApproverFollowUp(
  document: IdfDocument,
  input: { actorId: string; rows: IdfFollowUpRow[]; now: string; window: KpiWindow | null },
): { document: IdfDocument; recipients: string[] } {
  assertWindowOpen(input.window, input.now, "Inter-Department Feedback");
  const active = document.stages[document.activeStage];
  if (
    !active ||
    active.actorId !== input.actorId ||
    (active.stage === "approver-1" && document.status !== "Pending-Approver 1") ||
    (active.stage === "approver-2" && document.status !== "Pending-Approver 2")
  ) {
    throw new WorkflowError("Urutan tindak lanjut wajib: Approver 1 menyelesaikan terlebih dahulu, kemudian Approver 2.");
  }
  if (!Array.isArray(input.rows) || input.rows.length === 0 || input.rows.length > 20) {
    throw new WorkflowError("Isi minimal satu baris Tindak Lanjut Feedback.");
  }
  const cleanRows: IdfFollowUpRow[] = input.rows.map((row) => {
    if (!row || typeof row !== "object") throw new WorkflowError("Format baris tindak lanjut tidak valid.");
    const clean = {} as IdfFollowUpRow;
    for (const col of IDF_FOLLOW_UP_COLUMNS) {
      const val = row[col];
      if (!text(val) || !val.trim()) {
        throw new WorkflowError(`Kolom "${col}" pada Tindak Lanjut wajib diisi.`);
      }
      clean[col] = val.trim();
    }
    return clean;
  });

  const next = structuredClone(document);
  if (active.stage === "approver-1") {
    next.followUps.approver1 = cleanRows;
    if (next.mirrorSecondSlot) {
      next.followUps.approver2 = structuredClone(cleanRows);
    }
  } else {
    if (!next.followUps.approver1?.length) {
      throw new WorkflowError("Approver 1 harus menyelesaikan tindak lanjut terlebih dahulu.");
    }
    next.followUps.approver2 = cleanRows;
  }
  next.activeStage += 1;
  next.status = next.activeStage === next.stages.length ? "Validated" : "Pending-Approver 2";
  next.version += 1;
  next.history.push({
    action: "submit-follow-up",
    actorId: input.actorId,
    stage: active.stage,
    status: next.status,
    note: `Tindak lanjut ${active.stage} (${cleanRows.length} baris) disubmit`,
    at: input.now,
    version: next.version,
  });
  if (active.stage === "approver-1" && next.mirrorSecondSlot) {
    next.history.push({
      action: "submit-follow-up",
      actorId: input.actorId,
      stage: "approver-2",
      status: next.status,
      note: "sesuai catatan approver 1",
      at: input.now,
      version: next.version,
      mirrored: true,
    });
  }
  const recipients = [document.employeeId];
  if (next.status === "Pending-Approver 2" && next.stages[next.activeStage]) {
    recipients.push(next.stages[next.activeStage].actorId);
  }
  return { document: next, recipients: [...new Set(recipients)] };
}
