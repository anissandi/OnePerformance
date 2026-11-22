// Shared store: scores submitted by BOD assessment → visible in HR & BOD monitoring

import { loadPersistedState, mergeKvMapRecord, safeGetLocalRaw, savePersistedState } from "../../services/supabaseClient";
import { finalScorePercent, getMIResult } from "./managementInterviewResultStore";

export const NAME_TO_EMP_ID: Record<string, string> = {
  "Siti Rahayu":  "E002",
  "Kartini Dewi": "E011",
  "Rini Susanti": "E013",
  "Dian Permana": "E014",
};

const MI_SCORES_KEY = "pa_mi_penilai1_scores_v1";
const MI_SUP_ASSESSMENTS_KEY = "pa_mi_supervisor_assessments_v1";
// penilai1Score per employeeId (average of aspect scores, scale 1–5)
const _scores: Record<string, number> = loadPersistedState(MI_SCORES_KEY, {});
const _listeners: (() => void)[] = [];
let _cachedMiScoresRaw: string | null | undefined = undefined;
let _cachedMiScoresByNorm = new Map<string, number>();
let _cachedSupAssessRaw: string | null | undefined = undefined;
let _cachedSupAssessByNormId = new Map<string, number>();
let _cachedSupAssessByNameLc = new Map<string, number>();

function normEmpKey(id: string): string {
  const clean = String(id ?? "").trim().replace(/^emp-mi-/i, "");
  const num = clean.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
  return num ? `EMP-${num.padStart(3, "0")}` : clean.toUpperCase();
}

if (typeof window !== "undefined") {
  const notifyAll = () => _listeners.forEach((fn) => fn());
  window.addEventListener("pa-db-hydrated", notifyAll);
  window.addEventListener("storage", notifyAll);
}

function lookupSupAssessmentAvg(employeeId: string, employeeName?: string): number | null {
  const raw = safeGetLocalRaw(MI_SUP_ASSESSMENTS_KEY);
  if (_cachedSupAssessRaw !== raw) {
    const byId = new Map<string, number>();
    const byName = new Map<string, number>();
    const allBySched = loadPersistedState<
      Record<string, Array<{ name?: string; employeeId?: string; aspectScores?: Array<number | null> }>>
    >(MI_SUP_ASSESSMENTS_KEY, {});
    if (allBySched && typeof allBySched === "object") {
      for (const list of Object.values(allBySched)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          const valid = (item.aspectScores ?? []).filter((v): v is number => typeof v === "number" && v > 0);
          if (valid.length === 0) continue;
          const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
          if (item.employeeId) byId.set(normEmpKey(item.employeeId), avg);
          if (item.name) byName.set(item.name.trim().toLowerCase(), avg);
        }
      }
    }
    _cachedSupAssessRaw = raw;
    _cachedSupAssessByNormId = byId;
    _cachedSupAssessByNameLc = byName;
  }
  if (_cachedSupAssessByNormId.size === 0 && _cachedSupAssessByNameLc.size === 0) return null;
  const targetIdNorm = normEmpKey(employeeId);
  const idHit = _cachedSupAssessByNormId.get(targetIdNorm);
  if (idHit !== undefined) return idHit;
  const targetNameLc = String(employeeName ?? "").trim().toLowerCase();
  if (targetNameLc) {
    const nameHit = _cachedSupAssessByNameLc.get(targetNameLc);
    if (nameHit !== undefined) return nameHit;
  }
  return null;
}

export function getPenilai1Score(employeeId: string, employeeName?: string): number | null {
  const raw = safeGetLocalRaw(MI_SCORES_KEY);
  if (_cachedMiScoresRaw !== raw) {
    const persisted = loadPersistedState<Record<string, number>>(MI_SCORES_KEY, {});
    Object.assign(_scores, persisted);
    const normMap = new Map<string, number>();
    for (const [k, v] of Object.entries(_scores)) {
      if (typeof v === "number") {
        normMap.set(k.trim().toUpperCase(), v);
        normMap.set(normEmpKey(k), v);
      }
    }
    _cachedMiScoresByNorm = normMap;
    _cachedMiScoresRaw = raw;
  }
  if (typeof _scores[employeeId] === "number") return _scores[employeeId];
  const targetNorm = normEmpKey(employeeId);
  const byNorm = _cachedMiScoresByNorm.get(employeeId.trim().toUpperCase()) ?? _cachedMiScoresByNorm.get(targetNorm);
  if (byNorm !== undefined) return byNorm;
  const supAvg = lookupSupAssessmentAvg(employeeId, employeeName);
  if (supAvg !== null) return supAvg;
  const resPct = finalScorePercent(getMIResult(employeeId));
  if (resPct !== null && resPct > 0) return (resPct / 100) * 5;
  return null;
}

// Returns score converted to 0–100 percentage (raw is 1–5 scale)
export function getPenilai1ScoreAsPercent(employeeId: string, employeeName?: string): number | null {
  const raw = getPenilai1Score(employeeId, employeeName);
  if (raw === null || raw === undefined) return null;
  return parseFloat(((raw / 5) * 100).toFixed(2));
}

export function setPenilai1Score(employeeId: string, score: number): void {
  const persisted = loadPersistedState<Record<string, number>>(MI_SCORES_KEY, {});
  Object.assign(_scores, persisted);
  _scores[employeeId] = score;
  const norm = normEmpKey(employeeId);
  if (norm && norm !== employeeId) {
    _scores[norm] = score;
  }
  savePersistedState(MI_SCORES_KEY, _scores, {
    kind: "interview-assessment",
    employeeId,
    period: "2026",
    penilai1Score: score,
  });
  void mergeKvMapRecord(MI_SCORES_KEY, employeeId, score);
  if (norm && norm !== employeeId) {
    void mergeKvMapRecord(MI_SCORES_KEY, norm, score);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("appraisal-updated"));
  }
  _listeners.forEach(fn => fn());
}

export function subscribeScores(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}
