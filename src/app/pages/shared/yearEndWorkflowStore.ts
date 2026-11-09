import { normalizeEmployeeId, loadWorkflowRecords } from "./appraisalWorkflowStore";

export interface YearEndState {
  reminded: string[];
  inactive: string[];
  ignored: string[];
  phase: "verification" | "management-interview";
  completion?: Record<string, Record<string, boolean>>;
}

const KEY = "year_end_workflow_2026";

export function loadYearEndState(): YearEndState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return { reminded: saved?.reminded ?? [], inactive: saved?.inactive ?? [], ignored: saved?.ignored ?? [], phase: saved?.phase ?? "verification", completion: saved?.completion ?? {} };
  } catch {
    return { reminded: [], inactive: [], ignored: [], phase: "verification" };
  }
}

export function isYearEndInactive(employeeId: string): boolean {
  return loadYearEndState().inactive.some((id) => normalizeEmployeeId(id) === normalizeEmployeeId(employeeId));
}

export function applyYearEndScorePolicy<T extends Record<string, number | null>>(employeeId: string, scores: T): T {
  const state = loadYearEndState();
  const canonicalId = normalizeEmployeeId(employeeId);
  if (!state.ignored.some((id) => normalizeEmployeeId(id) === canonicalId)) return scores;
  const completion = { ...state.completion?.[canonicalId] };
  const modules = { "SMART Goals": "smartGoals", "Appraisal Form": "appraisalForm", "Managerial Skill": "managerialSkill" };
  for (const record of loadWorkflowRecords()) {
    if (record.employeeId !== canonicalId || record.phase !== "measurement" || record.year !== "2026") continue;
    const field = modules[record.module as keyof typeof modules];
    if (!field) continue;
    const decision = record.decisions.approver2?.status;
    completion[field] = decision === "Approved" || !!decision?.startsWith("Assessed");
  }
  return Object.fromEntries(Object.entries(scores).map(([module, score]) => [module, completion[module] === false ? 0 : score])) as T;
}

export function saveYearEndState(state: YearEndState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("year-end-updated"));
}

export function canProceedToInterview(employees: { id: string; overall: string }[], state: YearEndState): boolean {
  return employees.length > 0 && employees.every((employee) => employee.overall === "Complete" || state.inactive.includes(employee.id) || state.ignored.includes(employee.id));
}
