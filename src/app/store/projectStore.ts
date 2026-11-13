import { useState, useEffect } from "react";
import type { ProjectExcelRow } from "../utils/projectExcelUtils";
import { normalizeEmployeeId, submitWorkflowModule, workflowRowStatus, registerWorkflowRows } from "../pages/shared/appraisalWorkflowStore";
import type { ApprovalRow, ReviewerRole } from "../components/ReviewDrawer";
import type { ParsedExternalProjectRow } from "../utils/projectExcelUtils";
import { getActiveUser, loadManagedUsers } from "./authStore";
import { savePersistedState, syncToSupabase } from "../services/supabaseClient";

export type ProjectCategory = "Improvement Project" | "Corporate Event" | "Komite/Task Force";
export type ProjectScope =
  | 'SS - "Small Idea Kaizen"'
  | 'QCC - "Small Group Activity"'
  | 'QCP - "Cross Functional Kaizen Team"'
  | "Corporate Activity (Event, Engagement, Culture)"
  | "Komite P2K3"
  | "Komite Food Safety"
  | "Komite Lean/CI"
  | "Komite lainnya"
  | "Tim Gugus Tugas";

export type ProjectStatus = "draft" | "submitted" | "approved" | "rejected";
export type CheckInStatus = "not_started" | "on_track" | "at_risk" | "completed" | "cancelled";

export interface ProjectEntry {
  id: string;
  no: number;
  category: ProjectCategory;
  scope: ProjectScope;
  projectName: string;
  description: string;
  startDate: string;
  endDate: string;
  role: string;
  expectedOutput: string;
  status: ProjectStatus;
  // check-in fields
  checkInStatus: CheckInStatus;
  progressPercent: number;
  progressNotes: string;
  actualOutput: string;
  note: string;
  evidenceFiles: Array<{ name: string; size: number; type: string; dataUrl: string }>;
  lastUpdated: string;
}

export const SCOPE_BOBOT: Record<ProjectScope, number> = {
  'SS - "Small Idea Kaizen"': 15,
  'QCC - "Small Group Activity"': 25,
  'QCP - "Cross Functional Kaizen Team"': 40,
  "Corporate Activity (Event, Engagement, Culture)": 10,
  "Komite P2K3": 10,
  "Komite Food Safety": 10,
  "Komite Lean/CI": 10,
  "Komite lainnya": 10,
  "Tim Gugus Tugas": 10,
};

export const SCOPE_BY_CATEGORY: Record<ProjectCategory, { scope: ProjectScope; bobot: number }[]> = {
  "Improvement Project": [
    { scope: 'SS - "Small Idea Kaizen"', bobot: 15 },
    { scope: 'QCC - "Small Group Activity"', bobot: 25 },
    { scope: 'QCP - "Cross Functional Kaizen Team"', bobot: 40 },
  ],
  "Corporate Event": [
    { scope: "Corporate Activity (Event, Engagement, Culture)", bobot: 10 },
  ],
  "Komite/Task Force": [
    { scope: "Komite P2K3", bobot: 10 },
    { scope: "Komite Food Safety", bobot: 10 },
    { scope: "Komite Lean/CI", bobot: 10 },
    { scope: "Komite lainnya", bobot: 10 },
    { scope: "Tim Gugus Tugas", bobot: 10 },
  ],
};

export const CATEGORY_META: Record<ProjectCategory, { bobot: number; color: string; bg: string; border: string }> = {
  "Improvement Project": { bobot: 80, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  "Corporate Event":     { bobot: 10, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  "Komite/Task Force":   { bobot: 10, color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200" },
};

export const ROLE_OPTIONS = [
  "Leader / Ketua",
  "Co-Leader / Wakil Ketua",
  "Member / Anggota",
  "Facilitator / Fasilitator",
  "Sponsor",
];

const INITIAL_PROJECTS: ProjectEntry[] = [];

const EXCEL_STORAGE_KEY = "pa_project_icf_excel_rows_v1";
const EXCEL_BY_EMP_STORAGE_KEY = "pa_project_icf_by_emp_v1";
const INITIAL_EXCEL_ROWS: ProjectExcelRow[] = [];

export type EmployeeIcfProjectState = {
  rows: ProjectExcelRow[];
  fileName: string;
  submitted: boolean;
  submittedDate: string;
};

export function loadAllIcfProjectsByEmployee(): Record<string, EmployeeIcfProjectState> {
  try {
    const raw = localStorage.getItem(EXCEL_BY_EMP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = (JSON.parse(raw) ?? {}) as Record<string, EmployeeIcfProjectState>;
    const managedUsers = loadManagedUsers();
    const cleaned: Record<string, EmployeeIcfProjectState> = {};
    for (const [rawKey, state] of Object.entries(parsed)) {
      if (!state || !Array.isArray(state.rows) || state.rows.length === 0) continue;
      const normKey = normalizeEmployeeId(rawKey);
      const matchedUser = managedUsers.find(
        (u) =>
          normalizeEmployeeId(u.employeeId).toLowerCase() === normKey.toLowerCase() ||
          u.employeeId.trim().toLowerCase() === rawKey.trim().toLowerCase() ||
          (u.regNo && u.regNo.trim().toLowerCase() === rawKey.trim().toLowerCase()),
      );
      if (!matchedUser) continue;
      const canonicalKey = normalizeEmployeeId(matchedUser.employeeId);
      cleaned[canonicalKey] = state;
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function loadIcfProjectRows(employeeId?: string): { rows: ProjectExcelRow[]; fileName: string; submitted: boolean } {
  try {
    const targetId = employeeId ?? getActiveUser().employeeId;
    const normId = normalizeEmployeeId(targetId);
    const byEmp = loadAllIcfProjectsByEmployee();
    if (byEmp[normId]) return byEmp[normId];
    if (byEmp[targetId]) return byEmp[targetId];
    return { rows: INITIAL_EXCEL_ROWS, fileName: "", submitted: false };
  } catch {
    return { rows: INITIAL_EXCEL_ROWS, fileName: "", submitted: false };
  }
}

export function saveIcfProjectRows(rows: ProjectExcelRow[], fileName: string, submitted: boolean) {
  try {
    savePersistedState(EXCEL_STORAGE_KEY, { rows, fileName, submitted }, {
      kind: "project-records",
      employeeId: "EMP-002",
      period: "2026",
      fileName,
      submitted,
      rows,
    });
    if (submitted) submitWorkflowModule("Project", "measurement");
  } catch {
    // ignore storage errors
  }
  notify();
}

export function importExternalProjectRows(
  parsedRows: ParsedExternalProjectRow[],
  fileName: string,
): { employeeCount: number; rowCount: number } {
  const today = new Date().toLocaleDateString("id-ID");
  const managedUsers = loadManagedUsers();
  const grouped = new Map<string, ProjectExcelRow[]>();

  for (const row of parsedRows) {
    const rawEmpId = row.employeeId?.trim();
    if (!rawEmpId) continue;
    const rawNorm = normalizeEmployeeId(rawEmpId);
    const matchedUser = managedUsers.find(
      (u) =>
        normalizeEmployeeId(u.employeeId).toLowerCase() === rawNorm.toLowerCase() ||
        u.employeeId.trim().toLowerCase() === rawEmpId.toLowerCase() ||
        (u.regNo && u.regNo.trim().toLowerCase() === rawEmpId.toLowerCase()) ||
        u.name.trim().toLowerCase() === rawEmpId.toLowerCase(),
    );
    const normId = matchedUser ? normalizeEmployeeId(matchedUser.employeeId) : rawNorm;
    const list = grouped.get(normId) ?? [];
    list.push({
      no: list.length + 1,
      projectScope: row.projectScope,
      roleProject: row.roleProject,
      projectTitle: row.projectTitle,
      projectDetail: row.projectDetail,
      startDate: row.startDate,
      finishDate: row.finishDate,
      progressStatus: row.progressStatus,
      finalScore: row.finalScore,
    });
    grouped.set(normId, list);
  }

  const currentByEmp = loadAllIcfProjectsByEmployee();
  for (const [normId, empRows] of grouped.entries()) {
    currentByEmp[normId] = {
      rows: empRows,
      fileName,
      submitted: true,
      submittedDate: today,
    };
    void syncToSupabase({
      kind: "project-records",
      employeeId: normId,
      period: "2026",
      fileName,
      submitted: true,
      submittedDate: today,
      rows: empRows,
    });
    // Automatically enter Approval 1 & Approval 2 workflow for each uploaded employee
    submitWorkflowModule("Project", "measurement", today, normId);
  }

  try {
    savePersistedState(EXCEL_BY_EMP_STORAGE_KEY, currentByEmp, {
      audit: {
        action: "Create",
        module: "Project",
        subModule: "Project Monitoring",
        description: `Uploaded external Project Excel "${fileName}" (${parsedRows.length} rows for ${grouped.size} employees) -> auto-routed to Approval 1 & 2`,
      },
    });
    localStorage.removeItem(EXCEL_STORAGE_KEY);
    window.dispatchEvent(new Event("appraisal-updated"));
  } catch {
    // ignore storage errors
  }
  notify();
  return { employeeCount: grouped.size, rowCount: parsedRows.length };
}

export function projectApprovalRows(role: ReviewerRole): ApprovalRow[] {
  const byEmp = loadAllIcfProjectsByEmployee();
  const entries = Object.entries(byEmp);
  if (entries.length === 0) return [];

  const managedUsers = loadManagedUsers();
  const baseRows: ApprovalRow[] = [];
  entries.forEach(([normId, state]) => {
    const managedUser = managedUsers.find(
      (u) =>
        normalizeEmployeeId(u.employeeId).toLowerCase() === normId.toLowerCase() ||
        u.employeeId.trim().toLowerCase() === normId.toLowerCase(),
    );
    if (!managedUser) return;
    const maxScore = state.rows.length ? Math.max(...state.rows.map((r) => r.finalScore)) : 0;
    baseRows.push({
      no: `${role === "approver1" ? "CI" : "HCI"}-LIVE-${normId}-Project`,
      employeeId: managedUser.employeeId,
      name: managedUser.name,
      position: managedUser.position || "Staff",
      department: managedUser.department || "Operasional",
      division: managedUser.division || "Divisi Operasional",
      companyUnit: managedUser.company || "PT RSUP (Industry)",
      type: "Project",
      submittedDate: state.submittedDate || "10/08/2026",
      approvalDate: "-",
      status: "Pending",
      period: "Mid-Year Checkin 2026",
      achievement: `${maxScore}%`,
    });
  });

  registerWorkflowRows(baseRows, role);
  return baseRows.map((row) => ({
    ...row,
    ...(workflowRowStatus(row, role) ?? {}),
  }));
}

// Module-level singleton so all consumers share the same data in memory
let _projects: ProjectEntry[] = [...INITIAL_PROJECTS];
let _submitted = false;
const _listeners: Set<() => void> = new Set();

function notify() {
  _listeners.forEach((fn) => fn());
}

export const projectStore = {
  getProjects: () => _projects,
  isSubmitted: () => _submitted,

  setProjects(projects: ProjectEntry[]) {
    _projects = projects;
    notify();
  },

  addProject(p: ProjectEntry) {
    _projects = [..._projects, p];
    notify();
  },

  updateProject(updated: ProjectEntry) {
    _projects = _projects.map((p) => (p.id === updated.id ? updated : p));
    notify();
  },

  deleteProject(id: string) {
    _projects = _projects.filter((p) => p.id !== id);
    notify();
  },

  submitAll() {
    _submitted = true;
    _projects = _projects.map((p) => ({ ...p, status: "submitted" as ProjectStatus }));
    notify();
  },

  subscribe(fn: () => void) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};

// Hook for React components
export function useProjectStore() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const bump = () => rerender((n) => n + 1);
    const unsub = projectStore.subscribe(bump);
    window.addEventListener("pa-db-hydrated", bump);
    window.addEventListener("appraisal-updated", bump);
    return () => {
      unsub();
      window.removeEventListener("pa-db-hydrated", bump);
      window.removeEventListener("appraisal-updated", bump);
    };
  }, []);
  const excelState = loadIcfProjectRows();
  const maxFinalScore = excelState.rows.length
    ? Math.max(...excelState.rows.map((r) => r.finalScore))
    : null;
  return {
    projects: projectStore.getProjects(),
    submitted: projectStore.isSubmitted(),
    excelRows: excelState.rows,
    excelFileName: excelState.fileName,
    excelSubmitted: excelState.submitted,
    maxFinalScore,
  };
}
