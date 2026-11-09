import { projectId, publicAnonKey } from "../../../utils/supabase/info";
import type { KpiAction, KpiDocument, KpiItem, KpiWindow } from "../domain/kpiSettingWorkflow";
import type { OpenLock, TrackingDocument, TrackingWindow } from "../../../supabase/functions/server/shared/kpiTrackingWorkflow";
import type { RcaDocument, RcaProblem } from "../../../supabase/functions/server/shared/rcaWorkflow";
import type {
  SmartGoalItem,
  SmartGoalMeasurementDocument,
  SmartGoalMeasurementEntry,
  SmartGoalSettingDocument,
} from "../../../supabase/functions/server/shared/smartGoalsWorkflow";
import type {
  AppraisalFormDocument,
  AppraisalFormId,
  calculateAppraisalFormScore,
} from "../../../supabase/functions/server/shared/appraisalFormWorkflow";
import type {
  ManagerialSkillDocument,
  calculateManagerialSkillScore,
} from "../../../supabase/functions/server/shared/managerialSkillWorkflow";
import type {
  IdfDocument,
  IdfFollowUpRow,
  IdfTaskView,
} from "../../../supabase/functions/server/shared/interDepartmentFeedbackWorkflow";
import type {
  ProjectExcelRow,
  ProjectSimulationDocument,
  calculateProjectModuleScore,
} from "../../../supabase/functions/server/shared/projectWorkflow";
import type {
  ManagementInterviewDocument,
  calculateManagementInterviewScore,
} from "../../../supabase/functions/server/shared/managementInterviewWorkflow";

export type SimulationIdentity = { identity_id: string; name: string; unit_id: string | null; actor_level: string; appraisal_participant: boolean };
export type SimulationOverview = {
  documents: KpiDocument[];
  windows: (Partial<KpiWindow> & { unitId: string })[];
  notifications: { id: number; payload: { module: string; employeeId: string; status: string; at: string }; created_at: string }[];
};
const base = `https://${projectId}.supabase.co`;
const endpoint = base + "/functions/v1/make-server-74dadec6/pa-simulation";
let accessToken: string | null = null;
export type TrackingEvidence = { id: string; file_name: string; size: number; content_type: string };
export type TrackingOverview = {
  settings: KpiDocument[]; documents: TrackingDocument[]; windows: { unitId: string; window: TrackingWindow | null }[];
  openLocks: (OpenLock & { decision_note?: string; decided_at?: string })[]; evidence: TrackingEvidence[]; serverNow: string;
  scores: { employeeId: string; complete: boolean; score: number | null; weightedScore: number | null }[];
  rcaTriggers: { id: number; employee_id: string; month: number; item_id: string; achievement: number; improvement_status: string; closure_validated: boolean }[];
};

async function request(path: string, body?: unknown) {
  if (!accessToken) throw new Error("Login simulasi diperlukan.");
  const token = accessToken;
  const response = await fetch(endpoint + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 404 && path.startsWith("/rca")) {
    throw new Error("Endpoint RCA belum tersedia. Terapkan migrasi RCA dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/smart-goals")) {
    throw new Error("Endpoint SMART Goals belum tersedia. Terapkan migrasi SMART Goals dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/appraisal-form")) {
    throw new Error("Endpoint Appraisal Form belum tersedia. Terapkan migrasi Appraisal Form dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/managerial-skill")) {
    throw new Error("Endpoint Managerial Skill belum tersedia. Terapkan migrasi Managerial Skill dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/inter-department-feedback")) {
    throw new Error("Endpoint Inter-Department Feedback belum tersedia. Terapkan migrasi Inter-Department Feedback dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/project")) {
    throw new Error("Endpoint Project Outside Job Scope belum tersedia. Terapkan migrasi Project dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  if (response.status === 404 && path.startsWith("/management-interview")) {
    throw new Error("Endpoint Management Interview belum tersedia. Terapkan migrasi Management Interview dan redeploy Edge Function make-server-74dadec6 terlebih dahulu.");
  }
  const data = await response.json();
  if (accessToken !== token) throw new Error("Sesi berubah; respons akun sebelumnya tidak digunakan.");
  if (!response.ok) throw new Error(data.error ?? "Layanan simulasi belum tersedia.");
  return data;
}

export async function loginSimulation(email: string, password: string): Promise<SimulationIdentity> {
  if (projectId !== "ekzrnltjbcauihoftkiy") throw new Error("Proyek tidak sesuai dengan PA-Simulasi.");
  const response = await fetch(base + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: publicAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Login gagal. Periksa akun simulasi dan password.");
  accessToken = result.access_token;
  const loginToken = accessToken;
  try {
    const identity: SimulationIdentity = (await request("/session")).identity;
    return { ...identity, appraisal_participant: Boolean(identity.appraisal_participant || identity.actor_level === "hr-unit") };
  }
  catch (error) { if (accessToken === loginToken) await logoutSimulation(); throw error; }
}

export async function logoutSimulation() {
  const token = accessToken;
  accessToken = null;
  if (token) {
    const response = await fetch(base + "/auth/v1/logout?scope=local", {
      method: "POST", headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Sesi lokal dihapus, tetapi logout server belum berhasil.");
  }
}

export const loadSimulationKpi = (): Promise<SimulationOverview> => request("/kpi-setting");
export const saveSimulationWindow = (unitId: string, startDate: string, endDate: string) => request("/kpi-setting/window", { unitId, startDate, endDate });
export const actOnSimulationKpi = (document: KpiDocument, action: KpiAction, items?: KpiItem[], note?: string) =>
  request(`/kpi-setting/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, items, note });

export const loadSimulationTracking = (): Promise<TrackingOverview> => request("/kpi-tracking");
export type RcaOverview = { documents: RcaDocument[]; evidence: TrackingEvidence[]; serverNow: string };
export const loadSimulationRca = (): Promise<RcaOverview> => request("/rca");
export const actOnSimulationRca = (document: RcaDocument, action: KpiAction, problems?: RcaProblem[], note?: string) =>
  request(`/rca/${document.triggerId}/action`, { version: document.version, action, problems, note });
export async function uploadRcaEvidence(triggerId: number, file: File): Promise<TrackingEvidence> {
  if (!accessToken) throw new Error("Login simulasi diperlukan.");
  const token = accessToken;
  const form = new FormData(); form.append("file", file);
  const response = await fetch(`${endpoint}/rca/${triggerId}/evidence`, { method: "POST", headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` }, body: form });
  const result = await response.json();
  if (accessToken !== token) throw new Error("Sesi berubah; respons upload akun sebelumnya tidak digunakan.");
  if (!response.ok) throw new Error(result.error ?? "Upload evidence RCA gagal.");
  return result;
}
export async function fetchRcaEvidence(id: string): Promise<Blob> {
  if (!accessToken) throw new Error("Login simulasi diperlukan.");
  const token = accessToken;
  const response = await fetch(`${endpoint}/rca/evidence/${encodeURIComponent(id)}`, { headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` } });
  if (accessToken !== token) throw new Error("Sesi berubah; evidence tidak dimuat.");
  if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "Evidence tidak tersedia."); }
  const blob = await response.blob();
  if (accessToken !== token) throw new Error("Sesi berubah; evidence tidak dimuat.");
  return blob;
}

export type SmartGoalsOverview = {
  settingDocuments: SmartGoalSettingDocument[];
  measurementDocuments: SmartGoalMeasurementDocument[];
  settingWindows: { unitId: string; window: KpiWindow | null }[];
  measurementWindows: { unitId: string; window: KpiWindow | null }[];
  evidence: (TrackingEvidence & { goal_id?: string })[];
  scores: {
    employeeId: string;
    complete: boolean;
    approver1Score: number | null;
    approver2Score: number | null;
    score: number | null;
    weightedScore: number | null;
  }[];
  serverNow: string;
};

export const loadSimulationSmartGoals = (): Promise<SmartGoalsOverview> => request("/smart-goals");
export const saveSmartGoalsWindow = (phase: "setting" | "measurement", unitId: string, startDate: string, endDate: string) =>
  request(`/smart-goals/${phase}/window`, { unitId, startDate, endDate });
export const actOnSmartGoalsSetting = (
  document: SmartGoalSettingDocument,
  action: KpiAction,
  goals?: SmartGoalItem[],
  note?: string,
) => request(`/smart-goals/setting/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, goals, note });
export const actOnSmartGoalsMeasurement = (
  document: SmartGoalMeasurementDocument,
  action: KpiAction,
  entries?: Record<string, SmartGoalMeasurementEntry>,
  ratings?: Record<string, number>,
  note?: string,
) => request(`/smart-goals/measurement/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, entries, ratings, note });
export async function uploadSmartGoalsEvidence(employeeId: string, goalId: string, file: File): Promise<TrackingEvidence & { goal_id?: string }> {
  if (!accessToken) throw new Error("Login simulasi diperlukan.");
  const token = accessToken;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${endpoint}/smart-goals/measurement/${encodeURIComponent(employeeId)}/${encodeURIComponent(goalId)}/evidence`, {
    method: "POST",
    headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` },
    body: form,
  });
  const result = await response.json();
  if (accessToken !== token) throw new Error("Sesi berubah; respons upload tidak digunakan.");
  if (!response.ok) throw new Error(result.error ?? "Upload bukti SMART Goals gagal.");
  return result;
}
export async function fetchSmartGoalsEvidence(id: string): Promise<Blob> {
  if (!accessToken) throw new Error("Login simulasi diperlukan.");
  const token = accessToken;
  const response = await fetch(`${endpoint}/smart-goals/evidence/${encodeURIComponent(id)}`, {
    headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` },
  });
  if (accessToken !== token) throw new Error("Sesi berubah; bukti tidak dimuat.");
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? "Bukti SMART Goals tidak tersedia.");
  }
  const blob = await response.blob();
  if (accessToken !== token) throw new Error("Sesi berubah; bukti tidak dimuat.");
  return blob;
}

export type AppraisalFormOverview = {
  documents: AppraisalFormDocument[];
  windows: { unitId: string; window: KpiWindow | null }[];
  scores: ({ employeeId: string } & ReturnType<typeof calculateAppraisalFormScore>)[];
  serverNow: string;
};

export const loadSimulationAppraisalForm = (): Promise<AppraisalFormOverview> => request("/appraisal-form");
export const saveAppraisalFormWindow = (unitId: string, startDate: string, endDate: string) =>
  request("/appraisal-form/window", { unitId, startDate, endDate });
export const actOnSimulationAppraisalForm = (
  document: AppraisalFormDocument,
  action: KpiAction,
  ratings?: Record<string, number>,
  savedForms?: AppraisalFormId[],
  note?: string,
) => request(`/appraisal-form/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, ratings, savedForms, note });

export type ManagerialSkillOverview = {
  documents: ManagerialSkillDocument[];
  windows: { unitId: string; window: KpiWindow | null }[];
  scores: ({ employeeId: string } & ReturnType<typeof calculateManagerialSkillScore>)[];
  serverNow: string;
};

export const loadSimulationManagerialSkill = (): Promise<ManagerialSkillOverview> => request("/managerial-skill");
export const saveManagerialSkillWindow = (unitId: string, startDate: string, endDate: string) =>
  request("/managerial-skill/window", { unitId, startDate, endDate });
export const actOnSimulationManagerialSkill = (
  document: ManagerialSkillDocument,
  action: KpiAction,
  ratings?: Record<string, number>,
  note?: string,
) => request(`/managerial-skill/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, ratings, note });

export type IdfOverview = {
  documents: IdfDocument[];
  tasks: IdfTaskView[];
  windows: { unitId: string; window: KpiWindow | null }[];
  serverNow: string;
};

export const loadSimulationIdf = (): Promise<IdfOverview> => request("/inter-department-feedback");
export const saveIdfWindow = (unitId: string, startDate: string, endDate: string) =>
  request("/inter-department-feedback/window", { unitId, startDate, endDate });
export const actOnSimulationIdf = (
  employeeId: string,
  version: number,
  body:
    | { action: "nominate"; giverIds: string[] }
    | { action: "give-feedback"; answers: Record<string, string> }
    | { action: "save-summary" | "submit-summary"; summaries: Record<string, string> }
    | { action: "submit-follow-up"; rows: IdfFollowUpRow[] },
) => request(`/inter-department-feedback/${encodeURIComponent(employeeId)}/action`, { version, ...body });

export type ProjectOverview = {
  documents: ProjectSimulationDocument[];
  windows: { unitId: string; window: KpiWindow | null }[];
  scores: ({ employeeId: string } & ReturnType<typeof calculateProjectModuleScore>)[];
  serverNow: string;
};

export const loadSimulationProject = (): Promise<ProjectOverview> => request("/project");
export const saveProjectWindow = (unitId: string, startDate: string, endDate: string) =>
  request("/project/window", { unitId, startDate, endDate });
export const actOnSimulationProject = (
  document: ProjectSimulationDocument,
  action: KpiAction,
  rows?: ProjectExcelRow[],
  fileName?: string,
  note?: string,
) => request(`/project/${encodeURIComponent(document.employeeId)}/action`, { version: document.version, action, rows, fileName, note });
export const bulkUploadSimulationProject = (
  entries: Array<{ employeeId: string; rows: ProjectExcelRow[] }>,
  fileName: string,
): Promise<{ documents: ProjectSimulationDocument[]; persisted: boolean; count: number }> =>
  request("/project/bulk-upload", { entries, fileName });

export type ManagementInterviewOverview = {
  documents: ManagementInterviewDocument[];
  windows: { unitId: string; window: KpiWindow | null }[];
  scores: ({ employeeId: string } & ReturnType<typeof calculateManagementInterviewScore>)[];
  serverNow: string;
};

export const loadSimulationManagementInterview = (): Promise<ManagementInterviewOverview> =>
  request("/management-interview");
export const saveManagementInterviewWindow = (unitId: string, startDate: string, endDate: string) =>
  request("/management-interview/window", { unitId, startDate, endDate });
export const actOnSimulationManagementInterview = (
  employeeId: string,
  version: number,
  body:
    | {
        action: "schedule";
        scheduledDate: string;
        scheduledTime: string;
        location: string;
        otherUsers?: string[];
        textNotifikasi?: string;
        textLampiran?: string;
      }
    | {
        action: "cancel-schedule";
        note?: string;
      }
    | {
        action: "save-assessment" | "submit-assessment";
        scores: Record<string, number | null>;
        recommendation?: string;
        comment?: string;
      },
) => request(`/management-interview/${encodeURIComponent(employeeId)}/action`, { version, ...body });
export const saveTrackingWindow = (unitId: string, window: TrackingWindow) => request("/kpi-tracking/window", { unitId, ...window });
export const actOnTracking = (document: TrackingDocument, action: KpiAction, actuals?: Record<string, number | null>, evidence?: string[], note?: string) =>
  request(`/kpi-tracking/${encodeURIComponent(document.employeeId)}/${document.month}/action`, { version: document.version, action, actuals, evidence, note });
export const requestTrackingOpenLock = (document: TrackingDocument, reason: string) => request(`/kpi-tracking/${encodeURIComponent(document.employeeId)}/${document.month}/open-lock`, { reason });
export const decideTrackingOpenLock = (id: string, decision: "Approved" | "Rejected", note: string, expiresOn: string) => request(`/kpi-tracking/open-lock/${encodeURIComponent(id)}/decision`, { decision, note, expiresOn });
export async function uploadTrackingEvidence(document: TrackingDocument, file: File): Promise<TrackingEvidence> {
  if (!accessToken) throw new Error("Login diperlukan.");
  const token = accessToken;
  const form = new FormData(); form.append("file", file);
  const response = await fetch(`${endpoint}/kpi-tracking/${encodeURIComponent(document.employeeId)}/${document.month}/evidence`, { method: "POST", headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json();
  if (accessToken !== token) throw new Error("Sesi berubah; respons upload akun sebelumnya tidak digunakan.");
  if (!response.ok) throw new Error(data.error ?? "Upload gagal.");
  return data;
}
export async function fetchTrackingEvidence(id: string) {
  if (!accessToken) throw new Error("Login diperlukan.");
  const token = accessToken;
  const response = await fetch(`${endpoint}/kpi-tracking/evidence/${encodeURIComponent(id)}`, { headers: { apikey: publicAnonKey, Authorization: `Bearer ${token}` } });
  if (accessToken !== token) throw new Error("Sesi berubah; bukti akun sebelumnya tidak dimuat.");
  if (!response.ok) { const data = await response.json(); throw new Error(data.error ?? "Tidak dapat mengakses bukti."); }
  const blob = await response.blob();
  if (accessToken !== token) throw new Error("Sesi berubah; bukti akun sebelumnya tidak dimuat.");
  return blob;
}
