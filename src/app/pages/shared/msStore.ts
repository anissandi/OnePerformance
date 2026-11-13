import { submitWorkflowModule, loadWorkflowRecords, normalizeEmployeeId } from "./appraisalWorkflowStore";
import { savePersistedState } from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
const SELF_BY_EMP_KEY     = "ms_self_by_emp_v2";
const APPROVER_BY_EMP_KEY = "ms_approver_by_emp_v2";

// ─── Self-assessment ──────────────────────────────────────────────────────────

export interface MSSelfRatings {
  ratings: Record<number, number>; // item.no → score 1-5
  totalScore: number;
  submittedAt: string;
}

function readSelfMap(): Record<string, MSSelfRatings> {
  try {
    const raw = localStorage.getItem(SELF_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MSSelfRatings>) ?? {} : {};
  } catch {
    return {};
  }
}

function readApproverMap(): Record<string, MSApproverEntry[]> {
  try {
    const raw = localStorage.getItem(APPROVER_BY_EMP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MSApproverEntry[]>) ?? {} : {};
  } catch {
    return {};
  }
}

export function saveMSSelfRatings(data: MSSelfRatings): void {
  try {
    const activeUser = getActiveUser();
    const normId = normalizeEmployeeId(activeUser.employeeId);
    const appMap = readApproverMap();
    appMap[normId] = [];
    savePersistedState(APPROVER_BY_EMP_KEY, appMap);

    const selfMap = readSelfMap();
    selfMap[normId] = data;
    savePersistedState(SELF_BY_EMP_KEY, selfMap, {
      kind: "managerial-skill",
      employeeId: activeUser.employeeId,
      period: "2026",
      selfRatings: data,
      approverRatings: [],
      status: "Submitted",
      audit: {
        action: "Create",
        module: "Performance Appraisal",
        subModule: "Managerial Skill",
        description: `Submitted Managerial Skill Self-Assessment by ${activeUser.name} (${activeUser.employeeId})`,
      },
    });
    submitWorkflowModule("Managerial Skill", "measurement", new Date().toLocaleDateString("id-ID"), activeUser.employeeId);
  } catch { /* ignore */ }
}

export function loadMSSelfRatings(employeeId?: string): MSSelfRatings | null {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const selfMap = readSelfMap();
    return selfMap[normId] ?? null;
  } catch { return null; }
}

// ─── Approver assessment ──────────────────────────────────────────────────────

export interface MSApproverEntry {
  approverName: string;
  approverRole: string;
  approverLevel: number;
  ratings: Record<number, number>; // item.no → score 1-5
  totalScore: number;
  comment: string;
  reviewedDate: string;
}

export function saveMSApproverEntry(entry: MSApproverEntry, employeeId?: string): void {
  try {
    const targetId = employeeId ?? getActiveUser().employeeId;
    const normId = normalizeEmployeeId(targetId);
    const appMap = readApproverMap();
    const current = [...(appMap[normId] ?? [])];
    const idx = current.findIndex((e) => e.approverLevel === entry.approverLevel);
    if (idx >= 0) { current[idx] = entry; } else { current.push(entry); }
    appMap[normId] = current;
    savePersistedState(APPROVER_BY_EMP_KEY, appMap, {
      kind: "managerial-skill",
      employeeId: targetId,
      period: "2026",
      selfRatings: loadMSSelfRatings(targetId),
      approverRatings: current,
      status: `Assessed-Approver ${entry.approverLevel}`,
    });
  } catch { /* ignore */ }
}

export function loadAllMSApprovers(employeeId?: string): MSApproverEntry[] {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const appMap = readApproverMap();
    const entries: MSApproverEntry[] = appMap[normId] ?? [];
    const record = loadWorkflowRecords().find((item) => item.employeeId === normId && item.module === "Managerial Skill" && item.phase === "measurement" && item.year === "2026");
    return record ? entries.filter((entry) => !!record.assessments[entry.approverLevel === 1 ? "approver1" : "approver2"]) : entries;
  } catch { return []; }
}
