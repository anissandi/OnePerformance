import {
  simulationActors,
  simulationEmployees,
  simulationInterviewAssignments,
  simulationUnits,
} from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiDocument, KpiWindow } from "./kpiSettingWorkflow.ts";
import { assertWindowOpen } from "./smartGoalsWorkflow.ts";

export type ManagementInterviewAspect = {
  id: string;
  no: number;
  title: string;
  description: string;
  indicators: { score: number; text: string }[];
};

export const MI_ASPECTS: ManagementInterviewAspect[] = [
  {
    id: "mi-1",
    no: 1,
    title: "Kewajaran Hasil Kinerja",
    description: "Menilai apakah hasil/grade yang disampaikan mencerminkan pencapaian dan kondisi aktual divisi/tim",
    indicators: [
      { score: 1, text: "Hasil tidak mencerminkan pencapaian aktual." },
      { score: 2, text: "Terdapat beberapa ketidaksesuaian yang memerlukan klarifikasi." },
      { score: 3, text: "Hasil secara umum sesuai dengan pencapaian aktual." },
      { score: 4, text: "Hasil konsisten dengan pencapaian aktual." },
      { score: 5, text: "Hasil sangat konsisten dengan pencapaian aktual dan kondisi kinerja." },
    ],
  },
  {
    id: "mi-2",
    no: 2,
    title: "Justifikasi & Evidence",
    description: "Menilai kemampuan Kepala Divisi untuk dapat menjelaskan dasar penilaian dan memberikan evidence yang memadai",
    indicators: [
      { score: 1, text: "Tidak terdapat justifikasi/evidence yang memadai." },
      { score: 2, text: "Justifikasi/evidence masih terbatas dan membutuhkan klarifikasi." },
      { score: 3, text: "Justifikasi dan evidence cukup untuk mendukung hasil." },
      { score: 4, text: "Justifikasi jelas dan didukung evidence yang memadai." },
      { score: 5, text: "Justifikasi sangat jelas dan didukung evidence yang lengkap dan relevan." },
    ],
  },
  {
    id: "mi-3",
    no: 3,
    title: "Improvement & Follow Up",
    description: "Menilai apakah tindakan/usulan perbaikan atas hasil pencapaian kinerja jelas, sesuai dan dapat ditindaklanjuti",
    indicators: [
      { score: 1, text: "Tidak terdapat follow-up yang memadai." },
      { score: 2, text: "Follow-up masih umum dan belum jelas." },
      { score: 3, text: "Memiliki follow-up untuk area utama yang perlu diperbaiki." },
      { score: 4, text: "Memiliki follow-up yang jelas dan relevan." },
      { score: 5, text: "Memiliki follow up yang sangat jelas, konkret, terukur, dan relevan dengan hasil evaluasi." },
    ],
  },
];

export const MI_RECOMMENDATIONS = [
  "Promote",
  "Maintain Current Position",
  "Needs Improvement",
  "Further Review Required",
] as const;

export type MIRecommendation = (typeof MI_RECOMMENDATIONS)[number];

export type ManagementInterviewSchedule = {
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  otherUsers: string[];
  textNotifikasi: string;
  textLampiran: string;
  scheduledBy: string;
  updatedAt: string;
};

export type ManagementInterviewReviewerSlot = {
  slot: number;
  actorId: string;
  actorName: string;
  actorRole: string;
  scores: Record<string, number | null>;
  recommendation: MIRecommendation | "";
  comment: string;
  status: "Pending" | "Saved" | "Completed";
  submittedAt: string | null;
};

export type ManagementInterviewDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: "Unscheduled" | "Scheduled" | "In Assessment" | "Validated" | "Cancelled";
  schedule: ManagementInterviewSchedule | null;
  reviewers: ManagementInterviewReviewerSlot[];
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

export type ManagementInterviewActionInput =
  | {
      action: "schedule";
      actorId: string;
      actorLevel: string;
      actorUnitId: string | null;
      strategic: boolean;
      scheduledDate: string;
      scheduledTime: string;
      location: string;
      otherUsers?: string[];
      textNotifikasi?: string;
      textLampiran?: string;
      now: string;
      window: KpiWindow | null;
    }
  | {
      action: "cancel-schedule";
      actorId: string;
      actorLevel: string;
      actorUnitId: string | null;
      strategic: boolean;
      note?: string;
      now: string;
      window: KpiWindow | null;
    }
  | {
      action: "save-assessment" | "submit-assessment";
      actorId: string;
      actorLevel: string;
      actorUnitId: string | null;
      strategic: boolean;
      scores: Record<string, number | null>;
      recommendation?: string;
      comment?: string;
      now: string;
      window: KpiWindow | null;
    };

const DIVISI_WEIGHTS: Record<string, number> = {
  kpi: 40,
  "smart-goals": 10,
  "appraisal-form": 10,
  project: 10,
  "manager-skill": 20,
  "management-interview": 10,
};

const DIRECTOR_ROLES = [
  "Direktur Operasional",
  "Direktur Keuangan",
  "Direktur Produksi",
  "Direktur Pemasaran",
];

function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 5000;
}

function emptyScores(): Record<string, number | null> {
  return Object.fromEntries(MI_ASPECTS.map((aspect) => [aspect.id, null]));
}

export function isEligibleForManagementInterview(employeeId: string): boolean {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  return (
    !!employee &&
    employee.level === "divisi" &&
    employee.allowedModules.includes("management-interview") &&
    simulationInterviewAssignments.some((assignment) => assignment.employeeId === employeeId)
  );
}

export function createManagementInterviewDocument(employeeId: string): ManagementInterviewDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationInterviewAssignments.find((record) => record.employeeId === employeeId);
  if (
    !employee ||
    employee.level !== "divisi" ||
    !employee.allowedModules.includes("management-interview") ||
    !assignment ||
    !simulationUnits.some((unit) => unit.id === employee.unitId)
  ) {
    throw new WorkflowError("Management Interview hanya berlaku untuk level Ka. / Wa. Ka. Divisi ke atas.");
  }
  if (assignment.reviewerIds.includes(employeeId)) {
    throw new WorkflowError("Peserta Management Interview tidak boleh menjadi penilai untuk dirinya sendiri.");
  }
  const reviewers: ManagementInterviewReviewerSlot[] = assignment.reviewerIds.map((reviewerId, idx) => {
    const actor = simulationActors.find((a) => a.id === reviewerId);
    const roleLabel =
      actor?.level === "direktur"
        ? DIRECTOR_ROLES[idx] ?? "Direktur"
        : actor?.level === "gm"
        ? `General Manager (${employee.unitId})`
        : "Management Assessor";
    return {
      slot: idx + 1,
      actorId: reviewerId,
      actorName: actor?.name ?? reviewerId,
      actorRole: roleLabel,
      scores: emptyScores(),
      recommendation: "",
      comment: "",
      status: "Pending",
      submittedAt: null,
    };
  });
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Unscheduled",
    schedule: null,
    reviewers,
    snapshot: {
      unitId: employee.unitId,
      level: employee.level,
      weights: { ...DIVISI_WEIGHTS },
    },
    history: [],
  };
}

export function canManageInterviewSchedule(
  document: ManagementInterviewDocument,
  actorId: string,
  actorLevel: string,
  actorUnitId: string | null,
  strategic: boolean,
): boolean {
  if (document.employeeId === actorId) return false;
  if (strategic) return true;
  if (actorLevel === "hr-unit" && actorUnitId === document.snapshot.unitId) return true;
  return false;
}

export function canReadManagementInterview(
  document: ManagementInterviewDocument,
  actorId: string,
  actorLevel: string,
  actorUnitId: string | null,
  strategic: boolean,
): boolean {
  if (!isEligibleForManagementInterview(document.employeeId)) return false;
  if (strategic || document.employeeId === actorId) return true;
  if (actorLevel === "hr-unit" && actorUnitId === document.snapshot.unitId) return true;
  if (document.reviewers.some((reviewer) => reviewer.actorId === actorId)) return true;
  return false;
}

function validateReviewerScores(scores: Record<string, number | null> | undefined, requireAll: boolean) {
  if (!scores || typeof scores !== "object") {
    throw new WorkflowError("Data skor penilaian Management Interview tidak valid.");
  }
  for (const aspect of MI_ASPECTS) {
    const val = scores[aspect.id];
    if (val !== null && val !== undefined && (!Number.isInteger(val) || val < 1 || val > 5)) {
      throw new WorkflowError(`Skor aspek "${aspect.title}" harus berupa bilangan bulat 1 sampai 5.`);
    }
    if (requireAll && (val === null || val === undefined)) {
      throw new WorkflowError(`Seluruh 3 aspek penilaian wajib diisi (1–5) sebelum submit (${aspect.title} belum dinilai).`);
    }
  }
}

export function transitionManagementInterviewDocument(
  document: ManagementInterviewDocument,
  input: ManagementInterviewActionInput,
): ManagementInterviewDocument {
  assertWindowOpen(input.window, input.now, "Management Interview");
  if (document.status === "Validated") {
    throw new WorkflowError("Management Interview yang sudah Validated (Selesai) terkunci.");
  }

  const next = structuredClone(document);
  let eventStage: string | null = null;
  let eventNote = "";

  if (input.action === "schedule") {
    if (!canManageInterviewSchedule(document, input.actorId, input.actorLevel, input.actorUnitId, input.strategic)) {
      throw new WorkflowError("Hanya HR Strategic atau HR Unit Usaha terkait yang dapat membuat/mengubah jadwal Management Interview.");
    }
    if (
      !text(input.scheduledDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate.trim()) ||
      !text(input.scheduledTime) ||
      !/^\d{2}:\d{2}$/.test(input.scheduledTime.trim()) ||
      !text(input.location) ||
      !input.location.trim()
    ) {
      throw new WorkflowError("Tanggal, waktu (HH:MM), dan lokasi/platform Management Interview wajib diisi dengan lengkap.");
    }
    const otherUsers = Array.isArray(input.otherUsers)
      ? input.otherUsers.filter((u): u is string => text(u) && u.trim().length > 0).map((u) => u.trim())
      : [];
    const textNotifikasi = text(input.textNotifikasi) ? input.textNotifikasi.trim() : "";
    const textLampiran = text(input.textLampiran) ? input.textLampiran.trim() : "";

    next.schedule = {
      scheduledDate: input.scheduledDate.trim(),
      scheduledTime: input.scheduledTime.trim(),
      location: input.location.trim(),
      otherUsers,
      textNotifikasi,
      textLampiran,
      scheduledBy: input.actorId,
      updatedAt: input.now,
    };
    const anyCompletedOrSaved = next.reviewers.some((r) => r.status !== "Pending");
    next.status = anyCompletedOrSaved ? "In Assessment" : "Scheduled";
    eventStage = "schedule";
    eventNote = `Jadwal: ${next.schedule.scheduledDate} ${next.schedule.scheduledTime} WIB · ${next.schedule.location}`;
  } else if (input.action === "cancel-schedule") {
    if (!canManageInterviewSchedule(document, input.actorId, input.actorLevel, input.actorUnitId, input.strategic)) {
      throw new WorkflowError("Hanya HR Strategic atau HR Unit Usaha terkait yang dapat membatalkan jadwal Management Interview.");
    }
    if (next.reviewers.some((r) => r.status === "Completed")) {
      throw new WorkflowError("Jadwal tidak dapat dibatalkan karena penilaian sudah disubmit oleh Penilai.");
    }
    next.status = "Cancelled";
    eventStage = "cancel-schedule";
    eventNote = text(input.note) ? input.note.trim() : "Jadwal dibatalkan oleh HR.";
  } else if (input.action === "save-assessment" || input.action === "submit-assessment") {
    if (!next.schedule || next.status === "Unscheduled" || next.status === "Cancelled") {
      throw new WorkflowError("Management Interview belum dijadwalkan oleh HR atau jadwal telah dibatalkan.");
    }
    const reviewerIdx = next.reviewers.findIndex((r) => r.actorId === input.actorId);
    if (reviewerIdx < 0 || input.actorId === next.employeeId) {
      throw new WorkflowError("Hanya Penilai (Interviewer) yang ditugaskan yang dapat mengisi penilaian Management Interview.");
    }
    const slot = next.reviewers[reviewerIdx];
    if (slot.status === "Completed") {
      throw new WorkflowError("Penilaian Anda untuk kandidat ini sudah di-submit dan terkunci.");
    }
    const submitting = input.action === "submit-assessment";
    validateReviewerScores(input.scores, submitting);

    const rec = text(input.recommendation) ? input.recommendation.trim() : "";
    if (rec && !(MI_RECOMMENDATIONS as readonly string[]).includes(rec)) {
      throw new WorkflowError("Rekomendasi Management Interview tidak valid.");
    }
    if (input.comment !== undefined && !text(input.comment)) {
      throw new WorkflowError("Komentar & catatan management tidak valid.");
    }

    slot.scores = Object.fromEntries(MI_ASPECTS.map((aspect) => [aspect.id, input.scores[aspect.id] ?? null]));
    slot.recommendation = (rec as MIRecommendation | "") || slot.recommendation;
    slot.comment = input.comment !== undefined ? input.comment.trim() : slot.comment;
    slot.status = submitting ? "Completed" : "Saved";
    if (submitting) {
      slot.submittedAt = input.now;
    }

    const allCompleted = next.reviewers.every((r) => r.status === "Completed");
    next.status = allCompleted ? "Validated" : "In Assessment";
    eventStage = `penilai-${slot.slot}`;
    eventNote = slot.comment || (submitting ? `Penilai ${slot.slot} menyelesaikan penilaian.` : "");
  } else {
    throw new WorkflowError("Tindakan tidak tersedia pada Management Interview.");
  }

  next.version += 1;
  next.history.push({
    action: input.action === "submit-assessment" ? "advance" : input.action === "save-assessment" ? "save" : "submit",
    actorId: input.actorId,
    stage: eventStage,
    status: next.status,
    note: eventNote,
    at: input.now,
    version: next.version,
  });
  return next;
}

export function managementInterviewNotificationRecipients(
  document: ManagementInterviewDocument,
  action: ManagementInterviewActionInput["action"],
): string[] {
  if (action === "save-assessment") return [];
  const recipients = new Set<string>([document.employeeId]);
  if (document.schedule?.scheduledBy) {
    recipients.add(document.schedule.scheduledBy);
  }
  for (const reviewer of document.reviewers) {
    recipients.add(reviewer.actorId);
  }
  return [...recipients];
}

export function calculateManagementInterviewScore(document: ManagementInterviewDocument | undefined) {
  if (!document) {
    return {
      complete: false,
      completedReviewers: 0,
      totalReviewers: 0,
      reviewerResults: [] as Array<{
        slot: number;
        actorId: string;
        actorName: string;
        actorRole: string;
        status: "Pending" | "Saved" | "Completed";
        avg: number | null;
        percent: number | null;
        recommendation: string;
        comment: string;
      }>,
      criterionAverages: {} as Record<string, number | null>,
      partialFinalPercent: null as number | null,
      score: null as number | null,
      weightedScore: null as number | null,
    };
  }

  const reviewerResults = document.reviewers.map((r) => {
    const vals = MI_ASPECTS.map((a) => r.scores[a.id]).filter((v): v is number => v !== null && v !== undefined);
    const avg = vals.length === MI_ASPECTS.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
    const percent = avg !== null ? Number(((avg / 5) * 100).toFixed(2)) : null;
    return {
      slot: r.slot,
      actorId: r.actorId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      status: r.status,
      avg,
      percent,
      recommendation: r.recommendation,
      comment: r.comment,
    };
  });

  const completedResults = reviewerResults.filter((r) => r.status === "Completed" && r.percent !== null);
  const criterionAverages: Record<string, number | null> = {};
  for (const aspect of MI_ASPECTS) {
    const vals = document.reviewers
      .filter((r) => r.status === "Completed")
      .map((r) => r.scores[aspect.id])
      .filter((v): v is number => v !== null && v !== undefined);
    criterionAverages[aspect.id] = vals.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
  }

  const partialFinalPercent = completedResults.length
    ? Number((completedResults.reduce((s, r) => s + (r.percent ?? 0), 0) / completedResults.length).toFixed(2))
    : null;
  const complete = document.status === "Validated" && completedResults.length === document.reviewers.length;
  const moduleWeight = document.snapshot.weights["management-interview"] ?? 10;
  const score = complete ? partialFinalPercent : null;
  const weightedScore = score !== null ? Number(((score * moduleWeight) / 100).toFixed(2)) : null;

  return {
    complete,
    completedReviewers: completedResults.length,
    totalReviewers: document.reviewers.length,
    reviewerResults,
    criterionAverages,
    partialFinalPercent,
    score,
    weightedScore,
  };
}
