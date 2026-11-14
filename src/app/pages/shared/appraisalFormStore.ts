import { submitWorkflowModule, loadWorkflowRecords, normalizeEmployeeId } from "./appraisalWorkflowStore";
import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { formatTodayDDMMYYYY } from "../../utils/dateFormat";
const SELF_BY_EMP_KEY     = "af_self_by_emp_v2";
const APPROVER_BY_EMP_KEY = "af_approver_by_emp_v2";

// ─── Self-assessment ───────────────────────────────────────────────────────────

export interface StoredFormSelfEntry {
  formId: "A" | "B" | "C";
  ratings: Record<string, number>; // key = `${formId}__${no}`
  avgScore: number;
}

export interface StoredAppraisalSelf {
  forms: StoredFormSelfEntry[];
  submittedAt: string;
  submitted?: boolean;
}

function readSelfMap(): Record<string, StoredAppraisalSelf> {
  try {
    const raw = localStorage.getItem(SELF_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredAppraisalSelf>) ?? {} : {};
  } catch {
    return {};
  }
}

function readApproverMap(): Record<string, StoredAppraisalApproverEntry[]> {
  try {
    const raw = localStorage.getItem(APPROVER_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredAppraisalApproverEntry[]>) ?? {} : {};
  } catch {
    return {};
  }
}

export function saveAppraisalSelf(
  data: StoredAppraisalSelf,
  options?: { submitWorkflow?: boolean; employeeId?: string },
): void {
  try {
    const activeUser = getActiveUser();
    const empId = options?.employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(empId);
    const isFinalSubmit = Boolean(options?.submitWorkflow ?? data.submitted);
    const entryToSave: StoredAppraisalSelf = {
      ...data,
      submitted: isFinalSubmit,
    };
    const selfMap = readSelfMap();
    selfMap[normId] = entryToSave;

    if (isFinalSubmit) {
      const appMap = readApproverMap();
      appMap[normId] = [];
      savePersistedState(APPROVER_BY_EMP_KEY, appMap);
    }

    savePersistedState(SELF_BY_EMP_KEY, selfMap, {
      kind: "appraisal-form",
      employeeId: empId,
      period: "2026",
      selfRatings: entryToSave,
      approverRatings: [],
      status: isFinalSubmit ? "Submitted" : "Draft",
      ...(isFinalSubmit
        ? {
            audit: {
              action: "Create",
              module: "Performance Appraisal",
              subModule: "Appraisal Form",
              description: `Submitted Appraisal Form Self-Assessment (Form A, B, C) by ${activeUser.name} (${empId})`,
            },
          }
        : {}),
    });
    // Hanya trigger workflow & notifikasi saat user menekan tombol Submit Form (1x saja)
    if (isFinalSubmit) {
      submitWorkflowModule(
        "Appraisal Form",
        "measurement",
        data.submittedAt || formatTodayDDMMYYYY(),
        empId,
      );
    }
  } catch { /* ignore */ }
}

export function loadAppraisalSelf(employeeId?: string): StoredAppraisalSelf | null {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const selfMap = readSelfMap();
    return selfMap[normId] ?? null;
  } catch { return null; }
}

// ─── Approver assessment ───────────────────────────────────────────────────────

export interface StoredAppraisalApproverEntry {
  approverName: string;
  approverRole: string;
  approverLevel: number;
  forms: StoredFormSelfEntry[]; // same shape, approver's ratings
  overallComment: string;
  reviewedDate: string;
}

export function saveAppraisalApprover(entry: StoredAppraisalApproverEntry, employeeId?: string): void {
  try {
    const targetId = employeeId ?? getActiveUser().employeeId;
    const normId = normalizeEmployeeId(targetId);
    const appMap = readApproverMap();
    const current = [...(appMap[normId] ?? [])];
    const idx = current.findIndex(
      (e) => e.approverLevel === entry.approverLevel
    );
    if (idx >= 0) { current[idx] = entry; } else { current.push(entry); }
    appMap[normId] = current;
    savePersistedState(APPROVER_BY_EMP_KEY, appMap, {
      kind: "appraisal-form",
      employeeId: targetId,
      period: "2026",
      selfRatings: loadAppraisalSelf(targetId),
      approverRatings: current,
      status: `Assessed-Approver ${entry.approverLevel}`,
    });
  } catch { /* ignore */ }
}

export function loadAllAppraisalApprovers(employeeId?: string): StoredAppraisalApproverEntry[] {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const appMap = readApproverMap();
    const entries: StoredAppraisalApproverEntry[] = appMap[normId] ?? [];
    const record = loadWorkflowRecords().find((item) => item.employeeId === normId && item.module === "Appraisal Form" && item.phase === "measurement" && item.year === "2026");
    return record ? entries.filter((entry) => !!record.assessments[entry.approverLevel === 1 ? "approver1" : "approver2"]) : entries;
  } catch { return []; }
}
