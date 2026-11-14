import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { normalizeEmployeeId } from "./appraisalWorkflowStore";

const KEY = "kpi_evidence_files";
const BY_EMP_KEY = "kpi_evidence_files_by_emp_v1";

export interface StoredEvidenceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  dataUrl?: string;
  month: string;
}

function loadByEmpMap(): Record<string, StoredEvidenceFile[]> {
  try {
    return JSON.parse(localStorage.getItem(BY_EMP_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function loadLegacyAll(): StoredEvidenceFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveEvidenceFiles(files: StoredEvidenceFile[], employeeId?: string): void {
  try {
    const targetId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const serializable = files.map((f) => {
      const cleanUrl = f.url && !f.url.startsWith("blob:") ? f.url : f.dataUrl ?? "";
      return {
        ...f,
        url: cleanUrl,
        dataUrl: f.dataUrl || (cleanUrl.startsWith("data:") ? cleanUrl : undefined),
      };
    });
    const byEmp = loadByEmpMap();
    byEmp[targetId] = serializable;
    savePersistedState(BY_EMP_KEY, byEmp);
    savePersistedState(KEY, serializable);
    window.dispatchEvent(new Event("appraisal-updated"));
  } catch {
    // ignore
  }
}

export function loadEvidenceFiles(employeeId?: string): StoredEvidenceFile[] {
  const activeNorm = normalizeEmployeeId(getActiveUser().employeeId);
  const targetNorm = normalizeEmployeeId(employeeId ?? activeNorm);
  const byEmp = loadByEmpMap();
  if (Array.isArray(byEmp[targetNorm])) {
    return byEmp[targetNorm];
  }
  if (!employeeId || targetNorm === activeNorm) {
    return loadLegacyAll();
  }
  return [];
}

export function clearEvidenceFiles(employeeId?: string): void {
  try {
    const targetNorm = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const byEmp = loadByEmpMap();
    delete byEmp[targetNorm];
    savePersistedState(BY_EMP_KEY, byEmp);
    if (!employeeId || targetNorm === normalizeEmployeeId(getActiveUser().employeeId)) {
      savePersistedState(KEY, []);
    }
  } catch {
    // ignore
  }
}
