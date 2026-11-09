import { simulationAssignments, simulationEmployees, simulationUnits } from "./paSimulation2026.ts";
import { WorkflowError } from "./kpiSettingWorkflow.ts";
import type { KpiAction, KpiDocument, KpiStage, KpiWindow } from "./kpiSettingWorkflow.ts";
import { assertWindowOpen } from "./smartGoalsWorkflow.ts";

export const PROJECT_EXCEL_HEADERS = [
  "No",
  "Project Scope",
  "Role Project",
  "Project Title",
  "Project Detail",
  "Start Date",
  "Finish Date",
  "Progress Status",
  "Final Score",
] as const;

export const PROJECT_EXTERNAL_UPLOAD_HEADERS = [
  "No",
  "Emp. ID",
  "Employee",
  "Company Unit",
  "Department",
  "Position",
  "Project Scope",
  "Role Project",
  "Project Title",
  "Project Detail",
  "Start Date",
  "Finish Date",
  "Progress Status",
  "Final Score",
] as const;

export type ProjectExcelRow = {
  no: number;
  projectScope: string;
  roleProject: string;
  projectTitle: string;
  projectDetail: string;
  startDate: string;
  finishDate: string;
  progressStatus: string;
  finalScore: number;
};

export type ParsedExternalProjectRow = ProjectExcelRow & {
  employeeId?: string;
  employeeName?: string;
  companyUnit?: string;
  department?: string;
  position?: string;
};

export function mapParsedProjectExcelRows(headers: string[], rawRows: string[][]): ParsedExternalProjectRow[] {
  const norm = (val: string) => val.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const findCol = (patterns: RegExp[]) => headers.findIndex((h) => patterns.some((p) => p.test(norm(h))));

  const empIdIdx = findCol([/^emp id$/, /employee id/, /id karyawan/, /^nik$/]);
  const empNameIdx = findCol([/^employee$/, /employee name/, /nama karyawan/, /^nama$/]);
  const unitIdx = findCol([/company unit/, /unit usaha/, /^unit$/]);
  const deptIdx = findCol([/^department$/, /^departemen$/, /^division$/, /^divisi$/]);
  const posIdx = findCol([/^position$/, /^jabatan$/]);
  const scopeIdx = findCol([/project scope/, /\bscope\b/]);
  const roleIdx = findCol([/role project/, /roe project/, /\brole\b/, /\broe\b/]);
  const titleIdx = findCol([/project title/, /\btitle\b/, /project name/]);
  const detailIdx = findCol([/project detail/, /\bdetail\b/, /description/]);
  const startIdx = findCol([/start date/, /\bstart\b/]);
  const finishIdx = findCol([/finish date/, /end date/, /\bfinish\b/]);
  const statusIdx = findCol([/progress status/, /\bprogress\b/, /^status$/]);
  const scoreIdx = findCol([/final score/, /\bscore\b/]);

  const getCell = (row: string[], idx: number, fallbackIdx: number) =>
    (idx >= 0 ? row[idx] : fallbackIdx >= 0 ? row[fallbackIdx] : "")?.trim() ?? "";

  const nonEmptyRows = rawRows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) {
    throw new WorkflowError("File Excel kosong. Isi minimal 1 baris proyek pada template.");
  }

  const hasEmpColumns = empIdIdx >= 0;
  return nonEmptyRows.map((row, idx) => {
    const rawScore = getCell(row, scoreIdx, hasEmpColumns ? 13 : 8).replace("%", "").replace(",", ".").trim();
    const parsedScore = Number(rawScore);
    if (!rawScore || !Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      throw new WorkflowError(`Nilai Final Score pada baris ke-${idx + 1} ("${rawScore}") harus berupa angka 0–100.`);
    }
    const employeeId = empIdIdx >= 0 ? getCell(row, empIdIdx, -1) : undefined;
    return {
      no: idx + 1,
      ...(employeeId ? { employeeId } : {}),
      ...(empNameIdx >= 0 ? { employeeName: getCell(row, empNameIdx, -1) } : {}),
      ...(unitIdx >= 0 ? { companyUnit: getCell(row, unitIdx, -1) } : {}),
      ...(deptIdx >= 0 ? { department: getCell(row, deptIdx, -1) } : {}),
      ...(posIdx >= 0 ? { position: getCell(row, posIdx, -1) } : {}),
      projectScope: getCell(row, scopeIdx, hasEmpColumns ? 6 : 1),
      roleProject: getCell(row, roleIdx, hasEmpColumns ? 7 : 2),
      projectTitle: getCell(row, titleIdx, hasEmpColumns ? 8 : 3),
      projectDetail: getCell(row, detailIdx, hasEmpColumns ? 9 : 4),
      startDate: getCell(row, startIdx, hasEmpColumns ? 10 : 5),
      finishDate: getCell(row, finishIdx, hasEmpColumns ? 11 : 6),
      progressStatus: getCell(row, statusIdx, hasEmpColumns ? 12 : 7),
      finalScore: Number(parsedScore.toFixed(2)),
    };
  });
}

export type ProjectSimulationDocument = {
  employeeId: string;
  period: string;
  version: number;
  status: string;
  activeStage: number;
  revisionStage: number | null;
  uploadedBy: string | null;
  fileName: string | null;
  rows: ProjectExcelRow[];
  stages: KpiStage[];
  mirrorSecondSlot: boolean;
  snapshot: { unitId: string; level: string; weights: Record<string, number> };
  history: KpiDocument["history"];
};

const pending: Record<string, string> = {
  "approver-1": "Pending-Approver 1",
  "approver-2": "Pending-Approver 2",
};
const revision: Record<string, string> = {
  "approver-1": "Revision-Approver 1",
  "approver-2": "Revision-Approver 2",
};
const weights: Record<string, Record<string, number>> = {
  operasional: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  seksi: { kpi: 50, "smart-goals": 20, "appraisal-form": 15, project: 15 },
  bagian: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 15, "manager-skill": 15 },
  departemen: { kpi: 40, "smart-goals": 15, "appraisal-form": 15, project: 10, "manager-skill": 20 },
  divisi: { kpi: 40, "smart-goals": 10, "appraisal-form": 10, project: 10, "manager-skill": 20, "management-interview": 10 },
};

function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 5000;
}

export function createProjectDocument(employeeId: string): ProjectSimulationDocument {
  const employee = simulationEmployees.find((record) => record.id === employeeId);
  const assignment = simulationAssignments.find(
    (record) => record.employeeId === employeeId && record.module === "project" && record.phase === "measurement",
  );
  if (!employee || !assignment || !assignment.complete || !simulationUnits.some((unit) => unit.id === employee.unitId)) {
    throw new WorkflowError("Penugasan Project Outside Job Scope belum lengkap atau peserta tidak berlaku.");
  }
  if (assignment.stages.some((stage) => stage.actorId === employeeId)) {
    throw new WorkflowError("Pengajuan sendiri tidak boleh disetujui oleh akun yang sama.");
  }
  return {
    employeeId,
    period: employee.period,
    version: 0,
    status: "Draft",
    activeStage: -1,
    revisionStage: null,
    uploadedBy: null,
    fileName: null,
    rows: [],
    stages: assignment.stages.map((stage) => ({ stage: stage.stage, actorId: stage.actorId! })),
    mirrorSecondSlot: assignment.mirrorSecondSlot,
    snapshot: { unitId: employee.unitId, level: employee.level, weights: { ...weights[employee.level] } },
    history: [],
  };
}

export function canManageProjectUpload(
  document: ProjectSimulationDocument,
  actorId: string,
  actorLevel: string,
  actorUnitId: string | null,
  strategic: boolean,
): boolean {
  if (document.stages.some((stage) => stage.actorId === actorId)) return false;
  if (strategic) return true;
  if (actorLevel === "hr-unit" && actorUnitId === document.snapshot.unitId) return true;
  return false;
}

export function canReadProject(
  document: ProjectSimulationDocument,
  actorId: string,
  actorLevel: string,
  actorUnitId: string | null,
  strategic: boolean,
): boolean {
  if (strategic || document.employeeId === actorId) return true;
  if (actorLevel === "hr-unit" && actorUnitId === document.snapshot.unitId) return true;
  if (document.status !== "Draft" && document.stages.some((stage) => stage.actorId === actorId)) return true;
  return false;
}

export function validateProjectRows(rows: ProjectExcelRow[] | undefined, submitting: boolean) {
  if (!Array.isArray(rows) || rows.length > 100 || (submitting && rows.length === 0)) {
    throw new WorkflowError("File Excel Project Outside Job Scope wajib berisi minimal 1 baris proyek (maksimal 100 baris).");
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      !row ||
      !Number.isInteger(row.no) ||
      row.no < 1 ||
      ![row.projectScope, row.roleProject, row.projectTitle, row.projectDetail, row.startDate, row.finishDate, row.progressStatus].every(text) ||
      typeof row.finalScore !== "number" ||
      !Number.isFinite(row.finalScore) ||
      row.finalScore < 0 ||
      row.finalScore > 100
    ) {
      throw new WorkflowError(`Format baris ke-${i + 1} pada tabel Excel Project tidak valid (Final Score harus angka 0–100).`);
    }
    if (
      submitting &&
      ![row.projectScope, row.roleProject, row.projectTitle, row.projectDetail, row.startDate, row.finishDate, row.progressStatus].every((v) =>
        v.trim(),
      )
    ) {
      throw new WorkflowError(
        `Lengkapi seluruh 9 kolom Excel (No, Project Scope, Role Project, Project Title, Project Detail, Start Date, Finish Date, Progress Status, Final Score) pada baris ke-${i + 1}.`,
      );
    }
  }
}

export function transitionProjectDocument(
  document: ProjectSimulationDocument,
  input: {
    action: KpiAction;
    actorId: string;
    actorLevel: string;
    actorUnitId: string | null;
    strategic: boolean;
    rows?: ProjectExcelRow[];
    fileName?: string;
    note?: string;
    now: string;
    window: KpiWindow | null;
  },
): ProjectSimulationDocument {
  assertWindowOpen(input.window, input.now, "Project Outside Job Scope");
  if (input.note !== undefined && !text(input.note)) {
    throw new WorkflowError("Catatan harus berupa teks.");
  }
  if (document.status === "Validated") {
    throw new WorkflowError("Project Outside Job Scope yang sudah Validated terkunci.");
  }
  const next = structuredClone(document);
  const uploaderAllowed = canManageProjectUpload(document, input.actorId, input.actorLevel, input.actorUnitId, input.strategic);
  const editable = document.status === "Draft" || document.revisionStage !== null;
  let eventStage: string | null = null;

  if (input.action === "save" || input.action === "submit") {
    if (!uploaderAllowed || !editable) {
      throw new WorkflowError("Hanya HR ICF (HR Unit / HR Strategic) yang dapat mengunggah atau memperbarui data Excel Project pada status Draft/Revisi.");
    }
    if (input.rows !== undefined) {
      next.rows = structuredClone(input.rows).map((r, idx) => ({
        ...r,
        no: idx + 1,
        finalScore: Number(r.finalScore.toFixed(2)),
      }));
    }
    if (input.fileName !== undefined) {
      if (!text(input.fileName)) throw new WorkflowError("Nama file Excel tidak valid.");
      next.fileName = input.fileName.trim() || next.fileName;
    }
    validateProjectRows(next.rows, input.action === "submit");
    next.uploadedBy = input.actorId;
    if (input.action === "submit") {
      if (!next.stages.length || next.stages.some((s) => !s.actorId || s.actorId === next.employeeId)) {
        throw new WorkflowError("Penugasan Approver Level 1 & Level 2 belum lengkap.");
      }
      next.activeStage = next.revisionStage ?? 0;
      next.revisionStage = null;
      next.status = pending[next.stages[next.activeStage].stage];
    }
  } else if (input.action === "advance" || input.action === "revise") {
    if (input.rows !== undefined) {
      throw new WorkflowError("Approver tidak boleh mengubah isi tabel Excel Project.");
    }
    const active = next.stages[next.activeStage];
    if (!active || active.actorId !== input.actorId || input.actorId === next.employeeId || next.revisionStage !== null || next.status !== pending[active.stage]) {
      throw new WorkflowError("Keputusan hanya boleh diberikan oleh Approver tahap aktif yang ditugaskan.");
    }
    eventStage = active.stage;
    if (input.action === "revise") {
      if (!input.note?.trim()) throw new WorkflowError("Alasan revisi wajib diisi.");
      next.revisionStage = next.activeStage;
      next.status = revision[active.stage];
    } else {
      validateProjectRows(next.rows, true);
      next.activeStage += 1;
      next.status = next.activeStage === next.stages.length ? "Validated" : pending[next.stages[next.activeStage].stage];
    }
  } else {
    throw new WorkflowError("Tindakan tidak tersedia pada Project Outside Job Scope.");
  }

  next.version += 1;
  next.history.push({
    action: input.action,
    actorId: input.actorId,
    stage: eventStage,
    status: next.status,
    note: input.note?.trim() ?? (input.fileName ? `Upload Excel: ${input.fileName}` : ""),
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

export function projectNotificationRecipients(document: ProjectSimulationDocument, action: KpiAction): string[] {
  if (action === "save") return [];
  const recipients = new Set<string>([document.employeeId]);
  if (document.uploadedBy) recipients.add(document.uploadedBy);
  if (document.revisionStage === null && document.stages[document.activeStage]) {
    recipients.add(document.stages[document.activeStage].actorId);
  }
  return [...recipients];
}

export function calculateProjectModuleScore(document: ProjectSimulationDocument | undefined) {
  if (!document || !document.rows.length) {
    return {
      complete: false,
      maxFinalScore: null,
      score: null,
      weightedScore: null,
    };
  }
  const maxFinalScore = Number(Math.max(...document.rows.map((r) => r.finalScore)).toFixed(2));
  const complete = document.status === "Validated";
  const moduleWeight = document.snapshot.weights.project ?? 0;
  const score = complete ? maxFinalScore : null;
  const weightedScore = score !== null ? Number(((score * moduleWeight) / 100).toFixed(2)) : null;
  return {
    complete,
    maxFinalScore,
    score,
    weightedScore,
  };
}
