import type { SmartGoal } from "../employee/SMARTGoals";
import { normalizeEmployeeId, resetWorkflowPhaseForEmployee, submitWorkflowModule } from "./appraisalWorkflowStore";
import {
  buildEmployeeIdMatchSet,
  mergeKvMapRecord,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  syncToSupabase,
} from "../../services/supabaseClient";
import { getActiveUser } from "../../store/authStore";
import { formatTodayDDMMYYYY } from "../../utils/dateFormat";

const GOALS_BY_EMP_KEY = "sg_goals_by_emp_v2";
const CHECKIN_BY_EMP_KEY = "sg_checkin_by_emp_v2";

/** Memecah teks Attainable atau array actionPlans menjadi daftar poin bersih (tanpa awalan nomor/bullet). */
export function parseSmartGoalAttainablePoints(
  goal: Partial<Pick<SmartGoal, "attainable" | "actionPlans">>,
): string[] {
  const fromPlans = Array.isArray(goal.actionPlans)
    ? goal.actionPlans.map((ap) => String(ap?.description ?? "").trim()).filter(Boolean)
    : [];
  if (fromPlans.length > 0) return fromPlans;
  const raw = String(goal.attainable ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|;\s*|\s+(?=\d+[.)]\s+)/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}

/** Memformat daftar poin Attainable menjadi poin bernomor vertikal ke bawah (`1. ...\n2. ...\n3. ...`). */
export function formatSmartGoalAttainableVertical(points: string[]): string {
  return points
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .map((p, idx) => `${idx + 1}. ${p}`)
    .join("\n");
}

/** Menormalisasi daftar SMART Goals agar `attainable` dan `actionPlans` selalu sinkron dalam format poin bernomor ke bawah. */
export function normalizeSmartGoalsList(goals: SmartGoal[]): SmartGoal[] {
  return goals.map((g, gi) => {
    const pts = parseSmartGoalAttainablePoints(g);
    const existingPlans = Array.isArray(g.actionPlans) ? g.actionPlans : [];
    const syncedPlans =
      pts.length > 0
        ? pts.map((desc, idx) => ({
            id: existingPlans[idx]?.id ?? (Number(g.id || gi + 1) * 1000 + idx + 1),
            description: desc,
          }))
        : existingPlans.length > 0
          ? existingPlans
          : [{ id: Number(g.id || gi + 1) * 1000 + 1, description: "" }];
    const formattedAttainable =
      pts.length > 0 ? formatSmartGoalAttainableVertical(pts) : String(g.attainable ?? "");
    return {
      ...g,
      label: g.label || `Goals ${gi + 1}`,
      attainable: formattedAttainable,
      actionPlans: syncedPlans,
    };
  });
}

/**
 * Menyelaraskan isi SMART Goals Measurement (`StoredCheckInEntry[]`) dengan SMART Goals Setting terbaru:
 * - Menghapus goal Measurement lama yang sudah tidak ada di Setting terbaru
 * - Menghapus status/progress/kendala/evidence pada poin Attainable lama yang dihapus atau berubah deskripsinya
 * - Me-reset status Target vs Actual apabila kalimat Target pada Setting berubah
 */
export function reconcileCheckInEntriesWithGoals(
  latestGoals: SmartGoal[],
  prevGoals: SmartGoal[] | null,
  existingEntries: StoredCheckInEntry[],
): StoredCheckInEntry[] {
  if (!Array.isArray(latestGoals) || latestGoals.length === 0) return [];
  const prevGoalMap = new Map<number, SmartGoal>((prevGoals ?? []).map((g) => [g.id, g]));
  const out: StoredCheckInEntry[] = [];

  for (const g of latestGoals) {
    const prevEntry = existingEntries.find((e) => e.goalId === g.id);
    if (!prevEntry) continue;
    const prevGoal = prevGoalMap.get(g.id);
    const prevApDescById = new Map<number, string>(
      (prevGoal?.actionPlans ?? []).map((ap) => [ap.id, String(ap.description ?? "").trim()]),
    );
    const nextStatuses: Record<number, string> = {};
    const nextProgress: Record<number, number> = {};
    const nextKendala: Record<number, string> = {};
    const nextAlasanBatal: Record<number, string> = {};
    const nextEvidence: Record<number, StoredSmartGoalEvidenceFile[]> = {};

    for (const ap of g.actionPlans ?? []) {
      const curDesc = String(ap.description ?? "").trim();
      const oldDesc = prevApDescById.get(ap.id);
      if (oldDesc !== undefined && oldDesc !== curDesc) continue;
      if (prevEntry.actionPlanStatuses?.[ap.id] !== undefined) {
        nextStatuses[ap.id] = prevEntry.actionPlanStatuses[ap.id];
      }
      if (prevEntry.actionPlanProgress?.[ap.id] !== undefined) {
        nextProgress[ap.id] = prevEntry.actionPlanProgress[ap.id];
      }
      if (prevEntry.actionPlanKendala?.[ap.id] !== undefined) {
        nextKendala[ap.id] = prevEntry.actionPlanKendala[ap.id];
      }
      if (prevEntry.actionPlanAlasanBatal?.[ap.id] !== undefined) {
        nextAlasanBatal[ap.id] = prevEntry.actionPlanAlasanBatal[ap.id];
      }
      if (prevEntry.actionPlanEvidence?.[ap.id] !== undefined) {
        nextEvidence[ap.id] = prevEntry.actionPlanEvidence[ap.id];
      }
    }

    const targetChanged =
      prevGoal !== undefined && String(prevGoal.target ?? "").trim() !== String(g.target ?? "").trim();

    out.push({
      goalId: g.id,
      actual: targetChanged ? "" : (prevEntry.actual ?? ""),
      achievement: targetChanged ? "" : (prevEntry.achievement ?? ""),
      kendala: prevEntry.kendala ?? "",
      rencanaLanjut: prevEntry.rencanaLanjut ?? "",
      actionPlanStatuses: nextStatuses,
      actionPlanProgress: nextProgress,
      actionPlanKendala: nextKendala,
      actionPlanAlasanBatal: nextAlasanBatal,
      actionPlanEvidence: nextEvidence,
      targetAchievementStatus: targetChanged ? "" : (prevEntry.targetAchievementStatus ?? ""),
      alasanTidakTercapai: targetChanged ? "" : (prevEntry.alasanTidakTercapai ?? ""),
      evidenceFiles: targetChanged ? [] : (prevEntry.evidenceFiles ?? []),
    });
  }

  return out;
}

export interface StoredSmartGoalEvidenceFile {
  name: string;
  size: number;
  type?: string;
  url?: string;
  dataUrl?: string;
}

let _cachedGoalsByEmpRaw: string | null | undefined = undefined;
let _cachedGoalsByEmpMap: Record<string, SmartGoal[]> = {};
let _cachedCheckinByEmpRaw: string | null | undefined = undefined;
let _cachedCheckinByEmpMap: Record<string, StoredCheckInEntry[]> = {};

function readGoalsByEmpMap(): Record<string, SmartGoal[]> {
  try {
    const raw = safeGetLocalRaw(GOALS_BY_EMP_KEY);
    if (_cachedGoalsByEmpRaw === raw) {
      return { ..._cachedGoalsByEmpMap };
    }
    const parsed = raw ? (JSON.parse(raw) as Record<string, SmartGoal[]>) ?? {} : {};
    _cachedGoalsByEmpRaw = raw;
    _cachedGoalsByEmpMap = parsed;
    return { ...parsed };
  } catch {
    return {};
  }
}

function readCheckinByEmpMap(): Record<string, StoredCheckInEntry[]> {
  try {
    const raw = safeGetLocalRaw(CHECKIN_BY_EMP_KEY);
    if (_cachedCheckinByEmpRaw === raw) {
      return { ..._cachedCheckinByEmpMap };
    }
    const parsed = raw ? (JSON.parse(raw) as Record<string, StoredCheckInEntry[]>) ?? {} : {};
    _cachedCheckinByEmpRaw = raw;
    _cachedCheckinByEmpMap = parsed;
    return { ...parsed };
  } catch {
    return {};
  }
}

export function saveSubmittedGoals(
  goals: SmartGoal[],
  options?: { submitWorkflow?: boolean; employeeId?: string; ownerName?: string },
): void {
  try {
    const activeUser = getActiveUser();
    const empId = options?.employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(empId);
    const isDelegated = normId !== normalizeEmployeeId(activeUser.employeeId);
    const actorLabel = isDelegated && options?.ownerName
      ? `${activeUser.name} | atas nama ${options.ownerName}`
      : activeUser.name;
    const isFinalSubmit = options?.submitWorkflow ?? true;
    const normalizedGoals = normalizeSmartGoalsList(goals);
    const map = readGoalsByEmpMap();
    const prevGoalsForEmp = map[normId] ?? null;
    map[normId] = normalizedGoals;
    safeSetLocalJson(GOALS_BY_EMP_KEY, map);
    void mergeKvMapRecord(GOALS_BY_EMP_KEY, normId, normalizedGoals);

    // Sinkronkan & gantikan data Measurement lama agar selalu sesuai dengan SMART Goals Setting terbaru milik user ini
    const checkinMap = readCheckinByEmpMap();
    const existingCheckins = loadCheckInEntries(empId);
    const syncedCheckins = reconcileCheckInEntriesWithGoals(normalizedGoals, prevGoalsForEmp, existingCheckins);
    checkinMap[normId] = syncedCheckins;
    safeSetLocalJson(CHECKIN_BY_EMP_KEY, checkinMap);
    void mergeKvMapRecord(CHECKIN_BY_EMP_KEY, normId, syncedCheckins);

    let nextDecisionsForEmp = loadApprovalDecisions(empId);
    if (isFinalSubmit) {
      // Saat SMART Goals Setting baru/revisi di-submit, bersihkan status approval Measurement lama agar tidak menyisakan history usang
      resetWorkflowPhaseForEmployee(empId, "SMART Goals", "measurement", "2026");
      const remainingAllDecs = loadApprovalDecisions().filter(
        (d) => normalizeEmployeeId(d.employeeId) !== normId,
      );
      safeSetLocalJson(APPROVAL_KEY, remainingAllDecs);
      nextDecisionsForEmp = [];
    }

    void syncToSupabase({
      kind: "smart-goals",
      employeeId: empId,
      period: "2026",
      goals: normalizedGoals,
      checkinEntries: syncedCheckins,
      approvalDecisions: nextDecisionsForEmp,
      status: isFinalSubmit ? "Submitted-Setting" : "Draft-Setting",
      audit: {
        userId: activeUser.employeeId,
        userName: actorLabel,
        action: isFinalSubmit ? "Create" : "Update",
        module: "SMART Goals",
        subModule: "SMART Goals Setting",
        description: isFinalSubmit
          ? `Submitted ${normalizedGoals.length} SMART Goals for approval (${empId}) by ${actorLabel}`
          : `Saved SMART Goals draft (${normalizedGoals.length} goals) for ${empId} by ${actorLabel}`,
      },
    });
    if (isFinalSubmit) {
      submitWorkflowModule("SMART Goals", "setting", formatTodayDDMMYYYY(), empId);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadSubmittedGoals(employeeId?: string): SmartGoal[] | null {
  try {
    const rawTarget = employeeId !== undefined ? employeeId : getActiveUser().employeeId;
    if (!String(rawTarget ?? "").trim()) return null;
    const candidates = buildEmployeeIdMatchSet(rawTarget);
    candidates.add(normalizeEmployeeId(rawTarget));
    const map = readGoalsByEmpMap();
    for (const k of candidates) {
      if (Array.isArray(map[k]) && map[k].length > 0) {
        return normalizeSmartGoalsList(map[k]);
      }
    }
    const lower = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
    for (const [k, v] of Object.entries(map)) {
      if (lower.has(k.toLowerCase()) && Array.isArray(v) && v.length > 0) {
        return normalizeSmartGoalsList(v);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSubmittedGoals(employeeId?: string): void {
  try {
    const normId = normalizeEmployeeId(employeeId ?? getActiveUser().employeeId);
    const map = readGoalsByEmpMap();
    delete map[normId];
    savePersistedState(GOALS_BY_EMP_KEY, map);
  } catch {
    // ignore
  }
}

// ─── Check-in entries persistence ─────────────────────────────────────────────

export interface StoredCheckInEntry {
  goalId: number;
  actual: string;
  achievement: string;
  kendala: string;
  rencanaLanjut: string;
  /** action plan id → status string */
  actionPlanStatuses: Record<number, string>;
  /** action plan id → progress percent (0-100) */
  actionPlanProgress: Record<number, number>;
  /** action plan id → kendala text */
  actionPlanKendala: Record<number, string>;
  /** action plan id → alasan batal text */
  actionPlanAlasanBatal?: Record<number, string>;
  /** action plan id → evidence files */
  actionPlanEvidence?: Record<number, StoredSmartGoalEvidenceFile[]>;
  targetAchievementStatus: string;
  alasanTidakTercapai: string;
  /** goal-level target vs actual evidence files */
  evidenceFiles?: StoredSmartGoalEvidenceFile[];
}

export function saveCheckInEntries(
  entries: StoredCheckInEntry[],
  options?: { submitWorkflow?: boolean; employeeId?: string },
): void {
  try {
    const activeUser = getActiveUser();
    const empId = options?.employeeId ?? activeUser.employeeId;
    const normId = normalizeEmployeeId(empId);
    const isFinalSubmit = Boolean(options?.submitWorkflow);
    const map = readCheckinByEmpMap();
    map[normId] = entries;
    savePersistedState(CHECKIN_BY_EMP_KEY, map, {
      kind: "smart-goals",
      employeeId: empId,
      period: "2026",
      goals: loadSubmittedGoals(empId) ?? [],
      checkinEntries: entries,
      approvalDecisions: loadApprovalDecisions(empId),
      status: isFinalSubmit ? "Submitted-Measurement" : "Draft-Measurement",
      ...(isFinalSubmit
        ? {
            audit: {
              action: "Update",
              module: "SMART Goals",
              subModule: "SMART Goals Measurement",
              description: `Submitted SMART Goals Measurement check-in (${entries.length} goals) by ${activeUser.name} (${empId})`,
            },
          }
        : {}),
    });
    // Hanya trigger workflow & notifikasi saat tombol Submit Measurement diklik (1x saja)
    if (isFinalSubmit) {
      saveApprovalDecisions(
        loadApprovalDecisions().filter(
          (decision) => normalizeEmployeeId(decision.employeeId) !== normId,
        ),
        empId,
      );
      submitWorkflowModule("SMART Goals", "measurement", formatTodayDDMMYYYY(), empId);
    }
  } catch { /* ignore */ }
}

export function loadCheckInEntries(employeeId?: string): StoredCheckInEntry[] {
  try {
    const rawTarget = employeeId !== undefined ? employeeId : getActiveUser().employeeId;
    if (!String(rawTarget ?? "").trim()) return [];
    const candidates = buildEmployeeIdMatchSet(rawTarget);
    candidates.add(normalizeEmployeeId(rawTarget));
    const map = readCheckinByEmpMap();
    for (const k of candidates) {
      if (Array.isArray(map[k])) return map[k];
    }
    const lower = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
    for (const [k, v] of Object.entries(map)) {
      if (lower.has(k.toLowerCase()) && Array.isArray(v)) return v;
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Approval decisions persistence ───────────────────────────────────────────

const APPROVAL_KEY = "sg_approval_decisions_v1";

export type ApprovalDecisionStatus = "Pending Review" | "Approved" | "Needs Revision";

export interface StoredApprovalDecision {
  approverName: string;
  approverRole: string;
  approverLevel: number; // 1 = atasan langsung, 2 = HR/manager, etc.
  status: ApprovalDecisionStatus;
  feedback: string;
  score: string; // nilai/score (e.g. "85", "90")
  reviewedDate: string;
  employeeId: string;
}

export function saveApprovalDecisions(decisions: StoredApprovalDecision[], targetEmployeeId?: string): void {
  try {
    const empId = targetEmployeeId?.trim();
    if (empId) {
      const normId = normalizeEmployeeId(empId);
      const empDecisions = decisions.filter((d) => normalizeEmployeeId(d.employeeId) === normId);
      savePersistedState(APPROVAL_KEY, decisions, {
        kind: "smart-goals",
        employeeId: empId,
        period: "2026",
        goals: loadSubmittedGoals(empId) ?? [],
        checkinEntries: loadCheckInEntries(empId),
        approvalDecisions: empDecisions,
        status: "Reviewed",
      });
    } else {
      savePersistedState(APPROVAL_KEY, decisions);
    }
  } catch { /* ignore */ }
}

export function loadApprovalDecisions(employeeId?: string): StoredApprovalDecision[] {
  try {
    const raw = safeGetLocalRaw(APPROVAL_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as StoredApprovalDecision[];
    if (!employeeId) return all;
    const normId = normalizeEmployeeId(employeeId);
    return all.filter((d) => normalizeEmployeeId(d.employeeId) === normId);
  } catch {
    return [];
  }
}

export function upsertApprovalDecision(decision: StoredApprovalDecision): void {
  const current = loadApprovalDecisions();
  const normId = normalizeEmployeeId(decision.employeeId);
  const idx = current.findIndex(
    (d) => normalizeEmployeeId(d.employeeId) === normId && d.approverLevel === decision.approverLevel
  );
  const normalizedDecision: StoredApprovalDecision = {
    ...decision,
    employeeId: normId,
  };
  if (idx >= 0) {
    current[idx] = normalizedDecision;
  } else {
    current.push(normalizedDecision);
  }
  saveApprovalDecisions(current, decision.employeeId);
}
