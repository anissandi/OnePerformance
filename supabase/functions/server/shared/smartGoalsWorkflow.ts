import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiStage, KpiWindow } from "./kpiSettingWorkflow.ts";

export const sgActionPlanStatuses = ["Belum dilaksanakan", "Sedang dilaksanakan", "Selesai", "Batal"] as const;
export type SgActionPlanStatus = typeof sgActionPlanStatuses[number];
export type SgAchievementStatus = "" | "Tercapai" | "Tidak Tercapai";

export type SmartGoalActionPlan = {
  id: string;
  description: string;
};

export type SmartGoalItem = {
  id: string;
  label: string;
  specific: string;
  measurable: string;
  attainable: string;
  relevant: string;
  timely: string;
  bukti: string;
  target: string;
  actionPlans: SmartGoalActionPlan[];
};

export type SmartGoalSettingDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  goals: SmartGoalItem[];
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

export type SmartGoalPlanCheckIn = {
  status: SgActionPlanStatus;
  progressPct: number;
  kendala: string;
  alasanBatal: string;
};

export type SmartGoalMeasurementEntry = {
  actual: string;
  achievementStatus: SgAchievementStatus;
  alasanTidakTercapai: string;
  evidence: string[];
  actionPlans: Record<string, SmartGoalPlanCheckIn>;
};

export type SmartGoalApproverAssessment = {
  actorId: string;
  ratings: Record<string, number>;
  comment: string;
  at: string;
  mirrored?: boolean;
};

export type SmartGoalMeasurementDocument = {
  employeeId: string;
  period: string;
  settingVersion: number;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  goals: SmartGoalItem[];
  entries: Record<string, SmartGoalMeasurementEntry>;
  assessments: {
    approver1?: SmartGoalApproverAssessment;
    approver2?: SmartGoalApproverAssessment;
  };
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

const pending: Record<string, string> = {
  checker: "Pending-Checker",
  "approver-1": "Pending-Approver 1",
  "approver-2": "Pending-Approver 2",
  validator: "Pending-Validate",
};
const revision: Record<string, string> = {
  checker: "Revision-Checker",
  "approver-1": "Revision-Approver 1",
  "approver-2": "Revision-Approver 2",
  validator: "Revision-Validator",
};
const weights: Record<string, Record<string, number>> = {
  operasional: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  seksi: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  bagian: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 15, "manager-skill": 15 },
  departemen: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 10, "manager-skill": 20 },
  divisi: { kpi: 40, "smart-goals": 10, "appraisal-form": 10, project: 10, "manager-skill": 20, "management-interview": 10 },
};

function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 10000;
}

export function assertWindowOpen(window: KpiWindow | null, nowIso: string, label: string) {
  if (!window || window.locked || !/^\d{4}-\d{2}-\d{2}$/.test(window.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(window.endDate)) {
    throw new WorkflowError(`Jadwal ${label} belum dibuka atau fase terkunci.`);
  }
  const now = Date.parse(nowIso);
  const start = new Date(window.startDate + "T00:00:00+07:00").getTime();
  const end = new Date(window.endDate + "T00:00:00+07:00").getTime() + 86400000;
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || now < start || now >= end) {
    throw new WorkflowError(`Di luar jadwal aktif ${label} (WIB).`);
  }
}

export function canReadSmartGoals(document: { employeeId: string; status: string; stages: KpiStage[] }, actorId: string, strategic: boolean) {
  return strategic || document.employeeId === actorId || (document.status !== "Draft" && document.stages.some((stage) => stage.actorId === actorId));
}

export function sgNotificationRecipients(document: { employeeId: string; revisionStage: number | null; activeStage: number; stages: KpiStage[] }, action: KpiAction) {
  if (action === "save") return [];
  const recipients = action === "submit" ? [] : [document.employeeId];
  if (document.revisionStage === null && document.stages[document.activeStage]) {
    recipients.push(document.stages[document.activeStage].actorId);
  }
  return [...new Set(recipients)];
}

export function createSmartGoalSettingDocument(employeeId: string): SmartGoalSettingDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationAssignments.find((record) => record.employeeId === employeeId && record.module === "smart-goals" && record.phase === "setting");
  if (!employee || !assignment || !assignment.complete || !simulationUnits.some((unit) => unit.id === employee.unitId)) {
    throw new WorkflowError("Penugasan SMART Goals Setting belum lengkap atau peserta tidak berlaku.");
  }
  if (assignment.stages.some((stage) => stage.actorId === employeeId)) {
    throw new WorkflowError("Pengajuan sendiri tidak boleh diperiksa atau disetujui sendiri.");
  }
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Draft",
    activeStage: -1,
    revisionStage: null,
    goals: [],
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level, weights: { ...weights[employee.level] } },
    history: [],
  };
}

export function validateSmartGoals(goals: SmartGoalItem[], submitting: boolean) {
  if (!Array.isArray(goals) || goals.length > 20 || (submitting && goals.length < 3)) {
    throw new WorkflowError("Minimal 3 SMART Goals wajib diisi (maksimal 20).");
  }
  const ids = new Set<string>();
  for (const goal of goals) {
    if (
      !goal ||
      !text(goal.id) ||
      !goal.id.trim() ||
      ids.has(goal.id) ||
      ![goal.label, goal.specific, goal.measurable, goal.attainable, goal.relevant, goal.timely, goal.bukti, goal.target].every(text) ||
      !Array.isArray(goal.actionPlans) ||
      goal.actionPlans.length > 30
    ) {
      throw new WorkflowError("Format SMART Goal atau Action Plan tidak valid.");
    }
    ids.add(goal.id);
    if (
      submitting &&
      (![goal.label, goal.specific, goal.measurable, goal.attainable, goal.relevant, goal.timely, goal.bukti, goal.target].every((val) => val.trim()) ||
        goal.actionPlans.length === 0)
    ) {
      throw new WorkflowError("Setiap SMART Goal wajib memiliki judul, 7 atribut SMART lengkap (Specific s.d. Target), dan minimal satu Action Plan.");
    }
    for (const plan of goal.actionPlans) {
      if (!plan || !text(plan.id) || !plan.id.trim() || ids.has(plan.id) || !text(plan.description)) {
        throw new WorkflowError("Format Action Plan pada SMART Goal tidak valid.");
      }
      ids.add(plan.id);
      if (submitting && !plan.description.trim()) {
        throw new WorkflowError("Deskripsi setiap Action Plan pada SMART Goal wajib diisi.");
      }
    }
  }
}

export function transitionSmartGoalSetting(
  document: SmartGoalSettingDocument,
  input: { action: KpiAction; actorId: string; goals?: SmartGoalItem[]; note?: string; now: string; window: KpiWindow | null },
): SmartGoalSettingDocument {
  assertWindowOpen(input.window, input.now, "SMART Goals Setting");
  if (input.note !== undefined && !text(input.note)) throw new WorkflowError("Catatan harus berupa teks.");
  if (document.status === "Validated") throw new WorkflowError("SMART Goals Setting yang sudah Validated terkunci.");
  const next = structuredClone(document);
  const owner = input.actorId === document.employeeId;
  const editable = document.status === "Draft" || document.revisionStage !== null;
  let eventStage: string | null = null;

  if (input.action === "save" || input.action === "submit") {
    if (!owner || !editable) throw new WorkflowError("Hanya pemilik dapat mengubah Draft atau revisi resmi SMART Goals Setting.");
    if (input.goals !== undefined) next.goals = structuredClone(input.goals);
    validateSmartGoals(next.goals, input.action === "submit");
    if (input.action === "submit") {
      if (!next.stages.length || next.stages.some((stage) => !stage.actorId || stage.actorId === next.employeeId)) {
        throw new WorkflowError("Penugasan wajib belum lengkap atau melanggar larangan approval sendiri.");
      }
      next.activeStage = next.revisionStage ?? 0;
      next.revisionStage = null;
      next.status = pending[next.stages[next.activeStage].stage];
    }
  } else if (input.action === "advance" || input.action === "revise") {
    if (input.goals !== undefined) throw new WorkflowError("Checker, Approver, dan Validator tidak boleh mengubah isi SMART Goals.");
    const active = next.stages[next.activeStage];
    if (owner || !active || active.actorId !== input.actorId || next.revisionStage !== null || next.status !== pending[active.stage]) {
      throw new WorkflowError("Keputusan hanya boleh diberikan aktor tahap aktif yang ditugaskan.");
    }
    eventStage = active.stage;
    if (input.action === "revise") {
      if (!input.note?.trim()) throw new WorkflowError("Alasan revisi wajib diisi.");
      next.revisionStage = next.activeStage;
      next.status = revision[active.stage];
    } else {
      validateSmartGoals(next.goals, true);
      next.activeStage += 1;
      next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
    }
  } else {
    throw new WorkflowError("Tindakan tidak tersedia pada SMART Goals Setting.");
  }

  next.version += 1;
  next.history.push({
    action: input.action,
    actorId: input.actorId,
    stage: eventStage,
    status: next.status,
    note: input.note?.trim() ?? "",
    at: input.now,
    version: next.version,
  });
  if (input.action === "advance" && eventStage === "approver-1" && next.mirrorSecondSlot) {
    next.history.push({
      action: "advance",
      actorId: input.actorId,
      stage: "approver-2",
      status: next.status,
      note: "sesuai catatan approver 1",
      at: input.now,
      version: next.version,
      mirrored: true,
    });
  }
  return next;
}

export function createSmartGoalMeasurementDocument(setting: SmartGoalSettingDocument): SmartGoalMeasurementDocument {
  if (setting.status !== "Validated") {
    throw new WorkflowError("SMART Goals Setting harus berstatus Validated sebelum memulai Measurement.");
  }
  const entries: Record<string, SmartGoalMeasurementEntry> = {};
  for (const goal of setting.goals) {
    const actionPlans: Record<string, SmartGoalPlanCheckIn> = {};
    for (const plan of goal.actionPlans) {
      actionPlans[plan.id] = { status: "Belum dilaksanakan", progressPct: 0, kendala: "", alasanBatal: "" };
    }
    entries[goal.id] = {
      actual: "",
      achievementStatus: "",
      alasanTidakTercapai: "",
      evidence: [],
      actionPlans,
    };
  }
  return {
    employeeId: setting.employeeId,
    period: setting.period,
    settingVersion: setting.version,
    version: 0,
    status: "Draft",
    activeStage: -1,
    revisionStage: null,
    goals: structuredClone(setting.goals),
    entries,
    assessments: {},
    stages: structuredClone(setting.stages),
    mirrorSecondSlot: setting.mirrorSecondSlot,
    snapshot: structuredClone(setting.snapshot),
    history: [],
  };
}

export function sgEvidenceIds(document: SmartGoalMeasurementDocument): string[] {
  return [...new Set(Object.values(document.entries).flatMap((entry) => entry.evidence))];
}

export function validateSmartGoalMeasurementEntries(
  goals: SmartGoalItem[],
  entries: Record<string, SmartGoalMeasurementEntry>,
  submitting: boolean,
) {
  if (!entries || typeof entries !== "object") throw new WorkflowError("Data pengukuran SMART Goals tidak valid.");
  for (const goal of goals) {
    const entry = entries[goal.id];
    if (
      !entry ||
      !text(entry.actual) ||
      !text(entry.alasanTidakTercapai) ||
      !["", "Tercapai", "Tidak Tercapai"].includes(entry.achievementStatus) ||
      !Array.isArray(entry.evidence) ||
      entry.evidence.length > 10 ||
      !entry.evidence.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) ||
      new Set(entry.evidence).size !== entry.evidence.length ||
      !entry.actionPlans ||
      typeof entry.actionPlans !== "object"
    ) {
      throw new WorkflowError("Struktur pengukuran atau lampiran bukti SMART Goal tidak valid.");
    }
    for (const plan of goal.actionPlans) {
      const planCheckIn = entry.actionPlans[plan.id];
      if (
        !planCheckIn ||
        !sgActionPlanStatuses.includes(planCheckIn.status) ||
        !Number.isFinite(planCheckIn.progressPct) ||
        planCheckIn.progressPct < 0 ||
        planCheckIn.progressPct > 100 ||
        !text(planCheckIn.kendala) ||
        !text(planCheckIn.alasanBatal)
      ) {
        throw new WorkflowError("Status atau persentase progres Action Plan tidak valid (0–100%).");
      }
      if (submitting && planCheckIn.status === "Batal" && !planCheckIn.alasanBatal.trim()) {
        throw new WorkflowError(`Action Plan yang dibatalkan pada "${goal.label}" wajib memiliki alasan batal.`);
      }
    }
    if (submitting) {
      if (!entry.actual.trim() || !entry.achievementStatus) {
        throw new WorkflowError(`Lengkapi realisasi aktual dan status pencapaian pada "${goal.label}".`);
      }
      if (entry.achievementStatus === "Tidak Tercapai" && !entry.alasanTidakTercapai.trim()) {
        throw new WorkflowError(`Goal "${goal.label}" yang Tidak Tercapai wajib disertai alasan ketidakcapaian.`);
      }
      if (entry.achievementStatus === "Tercapai" && entry.evidence.length === 0) {
        throw new WorkflowError(`Goal "${goal.label}" yang Tercapai wajib melampirkan minimal 1 file bukti (evidence).`);
      }
    }
  }
}

function validateApproverRatings(goals: SmartGoalItem[], ratings: Record<string, number> | undefined) {
  if (!ratings || typeof ratings !== "object") {
    throw new WorkflowError("Approver wajib mengisi nilai pencapaian (0–100%) untuk setiap SMART Goal.");
  }
  for (const goal of goals) {
    const value = ratings[goal.id];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new WorkflowError(`Nilai untuk "${goal.label}" wajib berupa angka 0–100%.`);
    }
  }
}

export function transitionSmartGoalMeasurement(
  document: SmartGoalMeasurementDocument,
  input: {
    action: KpiAction;
    actorId: string;
    entries?: Record<string, SmartGoalMeasurementEntry>;
    ratings?: Record<string, number>;
    note?: string;
    now: string;
    window: KpiWindow | null;
  },
): SmartGoalMeasurementDocument {
  assertWindowOpen(input.window, input.now, "SMART Goals Measurement");
  if (input.note !== undefined && !text(input.note)) throw new WorkflowError("Catatan harus berupa teks.");
  if (document.status === "Validated") throw new WorkflowError("SMART Goals Measurement yang sudah Validated terkunci.");
  const next = structuredClone(document);
  const owner = input.actorId === document.employeeId;
  const editable = document.status === "Draft" || document.revisionStage !== null;
  let eventStage: string | null = null;

  if (input.action === "save" || input.action === "submit") {
    if (!owner || !editable) throw new WorkflowError("Hanya pemilik dapat mengubah Draft atau revisi resmi SMART Goals Measurement.");
    if (input.ratings !== undefined) throw new WorkflowError("Karyawan tidak boleh mengisi nilai approver.");
    if (input.entries !== undefined) next.entries = structuredClone(input.entries);
    validateSmartGoalMeasurementEntries(next.goals, next.entries, input.action === "submit");
    if (input.action === "submit") {
      const targetStageIdx = next.revisionStage ?? 0;
      const targetStage = next.stages[targetStageIdx]?.stage;
      if (targetStage === "checker" || targetStage === "approver-1") {
        delete next.assessments.approver1;
        delete next.assessments.approver2;
      } else if (targetStage === "approver-2") {
        delete next.assessments.approver2;
      }
      next.activeStage = targetStageIdx;
      next.revisionStage = null;
      next.status = pending[next.stages[next.activeStage].stage];
    }
  } else if (input.action === "advance" || input.action === "revise") {
    if (input.entries !== undefined) throw new WorkflowError("Pemeriksa dan Approver tidak boleh mengubah data aktual atau bukti karyawan.");
    const active = next.stages[next.activeStage];
    if (owner || !active || active.actorId !== input.actorId || next.revisionStage !== null || next.status !== pending[active.stage]) {
      throw new WorkflowError("Keputusan hanya boleh diberikan aktor tahap aktif yang ditugaskan.");
    }
    eventStage = active.stage;
    if (input.action === "revise") {
      if (!input.note?.trim()) throw new WorkflowError("Alasan revisi wajib diisi.");
      next.revisionStage = next.activeStage;
      next.status = revision[active.stage];
    } else {
      validateSmartGoalMeasurementEntries(next.goals, next.entries, true);
      const cleanRatings = (raw: Record<string, number>) =>
        Object.fromEntries(next.goals.map((goal) => [goal.id, Number(raw[goal.id].toFixed(2))]));
      if (active.stage === "approver-1") {
        validateApproverRatings(next.goals, input.ratings);
        const savedRatings = cleanRatings(input.ratings!);
        next.assessments.approver1 = {
          actorId: input.actorId,
          ratings: savedRatings,
          comment: input.note?.trim() ?? "",
          at: input.now,
        };
        if (next.mirrorSecondSlot) {
          next.assessments.approver2 = {
            actorId: input.actorId,
            ratings: { ...savedRatings },
            comment: "sesuai catatan approver 1",
            at: input.now,
            mirrored: true,
          };
        }
      } else if (active.stage === "approver-2") {
        validateApproverRatings(next.goals, input.ratings);
        next.assessments.approver2 = {
          actorId: input.actorId,
          ratings: cleanRatings(input.ratings!),
          comment: input.note?.trim() ?? "",
          at: input.now,
        };
      } else if (input.ratings !== undefined) {
        throw new WorkflowError("Hanya Approver 1 dan Approver 2 yang memberikan skor penilaian SMART Goals.");
      }
      next.activeStage += 1;
      next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
    }
  } else {
    throw new WorkflowError("Tindakan tidak tersedia pada SMART Goals Measurement.");
  }

  next.version += 1;
  next.history.push({
    action: input.action,
    actorId: input.actorId,
    stage: eventStage,
    status: next.status,
    note: input.note?.trim() ?? "",
    at: input.now,
    version: next.version,
  });
  if (input.action === "advance" && eventStage === "approver-1" && next.mirrorSecondSlot) {
    next.history.push({
      action: "advance",
      actorId: input.actorId,
      stage: "approver-2",
      status: next.status,
      note: "sesuai catatan approver 1",
      at: input.now,
      version: next.version,
      mirrored: true,
    });
  }
  return next;
}

export function calculateSmartGoalsScore(document: SmartGoalMeasurementDocument | undefined) {
  if (!document || !document.goals.length) {
    return { complete: false, approver1Score: null, approver2Score: null, score: null, weightedScore: null };
  }
  const avgFor = (assessment: SmartGoalApproverAssessment | undefined) => {
    if (!assessment) return null;
    const values = document.goals.map((goal) => assessment.ratings[goal.id]).filter((val): val is number => typeof val === "number" && Number.isFinite(val));
    if (values.length !== document.goals.length) return null;
    return Number((values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2));
  };
  const approver1Score = avgFor(document.assessments.approver1);
  const approver2Score = avgFor(document.assessments.approver2);
  const complete = document.status === "Validated" && approver1Score !== null && approver2Score !== null;
  if (!complete) {
    return { complete: false, approver1Score, approver2Score, score: null, weightedScore: null };
  }
  const score = Number(((approver1Score + approver2Score) / 2).toFixed(2));
  const weight = document.snapshot.weights["smart-goals"] ?? 0;
  const weightedScore = Number(((score * weight) / 100).toFixed(2));
  return { complete: true, approver1Score, approver2Score, score, weightedScore };
}
