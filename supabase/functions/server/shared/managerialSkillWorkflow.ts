import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiStage, KpiWindow } from "./kpiSettingWorkflow.ts";
import { assertWindowOpen } from "./smartGoalsWorkflow.ts";
import type { AppraisalIndicator } from "./appraisalFormWorkflow.ts";

export type ManagerialSkillItemDef = {
  no: number;
  label: string;
  description: string;
  indicators: AppraisalIndicator[];
};

export const MANAGERIAL_SKILL_ITEMS: ManagerialSkillItemDef[] = [
  {
    no: 1,
    label: "Kepemimpinan:",
    description:
      "Mampu mengukur efektivitas hasil kerja bawahan; menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif, serta mengukur efektivitas kinerja secara efektif, serta mempromosikan inovasi dan kerja tim.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif." },
      { score: 2, label: "Nilai 2", text: "Mampu menciptakan tujuan yang menantang." },
      { score: 3, label: "Nilai 3", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif. Namun membutuhkan waktu yang lebih lama untuk dapat mengukur efektivitas kinerja seluruh bawahannya." },
      { score: 4, label: "Nilai 4", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif dan mampu mengukur efektivitas kinerja seluruh bawahannya." },
      { score: 5, label: "Nilai 5", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif serta mampu dengan berbagai metode-metode yang tepat serta mampu mengukur efektivitas kinerja seluruh bawahannya." },
    ],
  },
  {
    no: 2,
    label: "Keselarasan Organisasi:",
    description:
      "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif." },
      { score: 2, label: "Nilai 2", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi." },
      { score: 4, label: "Nilai 4", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi dan bagaimana tujuan tersebut dapat dibuat pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi." },
      { score: 5, label: "Nilai 5", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman yang mendalam dan detail mengenai keputusan organisasi dan bagaimana tujuan tersebut dapat dibuat untuk bawahannya yang efektif untuk mencapai tujuan-tujuan organisasi." },
    ],
  },
  {
    no: 3,
    label: "Perencanaan Penerus:",
    description:
      "Mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 2, label: "Nilai 2", text: "Mampu mempersiapkan penerus yang secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan namun membutuhkan waktu yang lebih lama dari yang seharusnya." },
      { score: 3, label: "Nilai 3", text: "Mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat perencanaan yang baik dan merestruktur untuk mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat perencanaan yang baik dan merestruktur untuk mempersiapkan penerus yang sesuai dengan kondisi perusahaan dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
    ],
  },
  {
    no: 4,
    label: "Resolusi Konflik Internal:",
    description:
      "Dapat membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 2, label: "Nilai 2", text: "Mampu membuat keputusan yang logis, namun tidak tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya secara efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah manajerialnya tanggung jawab yang berkepanjangan yang dapat mempengaruhi kinerja." },
    ],
  },
  {
    no: 5,
    label: "Resolusi Konflik Eksternal:",
    description:
      "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 2, label: "Nilai 2", text: "Mampu membuat keputusan yang logis namun tidak tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya secara efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya serta mampu dalam membuat kesepakatan yang menguntungkan semua pihak." },
    ],
  },
];

export const ALL_MANAGERIAL_KEYS = MANAGERIAL_SKILL_ITEMS.map((item) => `ms-${item.no}`);

export type ManagerialApproverEntry = {
  actorId: string;
  ratings: Record<string, number>;
  comment: string;
  at: string;
  mirrored?: boolean;
};

export type ManagerialSkillDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  selfRatings: Record<string, number>;
  assessments: {
    approver1?: ManagerialApproverEntry;
    approver2?: ManagerialApproverEntry;
  };
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

const pending: Record<string, string> = {
  "approver-1": "Pending-Approver 1",
  "approver-2": "Pending-Approver 2",
};
const weights: Record<string, Record<string, number>> = {
  operasional: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  seksi: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  bagian: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 15, "manager-skill": 15 },
  departemen: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 10, "manager-skill": 20 },
  divisi: { kpi: 40, "smart-goals": 10, "appraisal-form": 10, project: 10, "manager-skill": 20, "management-interview": 10 },
};

export function isEligibleForManagerialSkill(employeeId: string): boolean {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  return !!employee && employee.allowedModules.includes("manager-skill");
}

export function createManagerialSkillDocument(employeeId: string): ManagerialSkillDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationAssignments.find(
    (record) => record.employeeId === employeeId && record.module === "manager-skill" && record.phase === "measurement",
  );
  if (
    !employee ||
    !employee.allowedModules.includes("manager-skill") ||
    !assignment ||
    !assignment.complete ||
    !simulationUnits.some((unit) => unit.id === employee.unitId)
  ) {
    throw new WorkflowError("Modul Managerial Skill hanya berlaku untuk posisi/level Kepala Bagian ke atas (termasuk Supervisor HR Unit).");
  }
  if (assignment.stages.some((stage) => stage.actorId === employeeId)) {
    throw new WorkflowError("Pengajuan sendiri tidak boleh dinilai sendiri oleh atasan yang sama.");
  }
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Draft",
    activeStage: -1,
    revisionStage: null,
    selfRatings: {},
    assessments: {},
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level, weights: { ...weights[employee.level] } },
    history: [],
  };
}

export function canReadManagerialSkill(document: ManagerialSkillDocument, actorId: string, strategic: boolean) {
  return (
    strategic ||
    document.employeeId === actorId ||
    (document.status !== "Draft" && document.stages.some((stage) => stage.actorId === actorId))
  );
}

export function validateManagerialSkillRatings(ratings: Record<string, number> | undefined, requireAll: boolean, label: string) {
  if (!ratings || typeof ratings !== "object") {
    throw new WorkflowError(`Data nilai ${label} Managerial Skill tidak valid.`);
  }
  for (const [key, val] of Object.entries(ratings)) {
    if (!ALL_MANAGERIAL_KEYS.includes(key) || !Number.isInteger(val) || val < 1 || val > 5) {
      throw new WorkflowError(`Nilai untuk kompetensi ${key} harus berupa bilangan bulat 1–5.`);
    }
  }
  if (requireAll) {
    for (const item of MANAGERIAL_SKILL_ITEMS) {
      const val = ratings[`ms-${item.no}`];
      if (!Number.isInteger(val) || val < 1 || val > 5) {
        throw new WorkflowError(`Lengkapi penilaian kompetensi No. ${item.no} (${item.label.replace(":", "")}) dengan nilai 1–5.`);
      }
    }
  }
}

export function transitionManagerialSkill(
  document: ManagerialSkillDocument,
  input: {
    action: KpiAction;
    actorId: string;
    ratings?: Record<string, number>;
    note?: string;
    now: string;
    window: KpiWindow | null;
  },
): ManagerialSkillDocument {
  assertWindowOpen(input.window, input.now, "Managerial Skill");
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 10000)) {
    throw new WorkflowError("Catatan harus berupa teks.");
  }
  if (document.status === "Validated") {
    throw new WorkflowError("Managerial Skill yang sudah selesai dinilai (Validated) terkunci.");
  }
  const next = structuredClone(document);
  const owner = input.actorId === document.employeeId;
  let eventStage: string | null = null;

  if (input.action === "save" || input.action === "submit") {
    if (!owner || document.status !== "Draft") {
      throw new WorkflowError("Hanya pemilik dapat mengisi atau menyimpan Self-Assessment Managerial Skill pada saat Draft.");
    }
    if (input.ratings !== undefined) {
      validateManagerialSkillRatings(input.ratings, input.action === "submit", "Self-Assessment");
      next.selfRatings = structuredClone(input.ratings);
    } else if (input.action === "submit") {
      validateManagerialSkillRatings(next.selfRatings, true, "Self-Assessment");
    }
    if (input.action === "submit") {
      next.activeStage = 0;
      next.status = pending[next.stages[0].stage];
    }
  } else if (input.action === "advance") {
    const active = next.stages[next.activeStage];
    if (owner || !active || active.actorId !== input.actorId || next.status !== pending[active.stage]) {
      throw new WorkflowError("Penilaian hanya boleh disubmit oleh Approver tahap aktif yang ditugaskan.");
    }
    validateManagerialSkillRatings(input.ratings, true, active.stage === "approver-1" ? "Approver 1" : "Approver 2");
    eventStage = active.stage;
    const cleanRatings = Object.fromEntries(ALL_MANAGERIAL_KEYS.map((key) => [key, input.ratings![key]]));
    if (active.stage === "approver-1") {
      next.assessments.approver1 = {
        actorId: input.actorId,
        ratings: cleanRatings,
        comment: input.note?.trim() ?? "",
        at: input.now,
      };
      if (next.mirrorSecondSlot) {
        next.assessments.approver2 = {
          actorId: input.actorId,
          ratings: { ...cleanRatings },
          comment: "sesuai catatan approver 1",
          at: input.now,
          mirrored: true,
        };
      }
    } else if (active.stage === "approver-2") {
      next.assessments.approver2 = {
        actorId: input.actorId,
        ratings: cleanRatings,
        comment: input.note?.trim() ?? "",
        at: input.now,
      };
    }
    next.activeStage += 1;
    next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
  } else {
    throw new WorkflowError("Managerial Skill menggunakan alur Self-Assessment → Evaluasi Approver 1 → Evaluasi Approver 2 (tanpa revisi).");
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

export function calculateManagerialSkillScore(document: ManagerialSkillDocument | undefined) {
  if (!document) {
    return {
      complete: false,
      selfAvg: null,
      app1Avg: null,
      app2Avg: null,
      combinedAvg: null,
      score: null,
      weightedScore: null,
    };
  }
  const avgFrom = (map: Record<string, number> | undefined) => {
    if (!map) return null;
    const vals = ALL_MANAGERIAL_KEYS.map((k) => map[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length !== ALL_MANAGERIAL_KEYS.length) return null;
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2));
  };
  const selfAvg = avgFrom(document.selfRatings);
  const app1Avg = avgFrom(document.assessments.approver1?.ratings);
  const app2Avg = avgFrom(document.assessments.approver2?.ratings);
  const complete = document.status === "Validated" && selfAvg !== null && app1Avg !== null && app2Avg !== null;
  const combinedAvg = selfAvg !== null && app1Avg !== null && app2Avg !== null ? Number(((selfAvg + app1Avg + app2Avg) / 3).toFixed(2)) : null;
  const score = complete && combinedAvg !== null ? Number(((combinedAvg / 5) * 100).toFixed(2)) : null;
  const moduleWeight = document.snapshot.weights["manager-skill"] ?? 0;
  const weightedScore = score !== null ? Number(((score * moduleWeight) / 100).toFixed(2)) : null;

  return {
    complete,
    selfAvg,
    app1Avg,
    app2Avg,
    combinedAvg,
    score,
    weightedScore,
  };
}
