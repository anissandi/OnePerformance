// Shared store: scores submitted by BOD assessment → visible in HR & BOD monitoring

import { loadPersistedState, mergeKvMapRecord, savePersistedState } from "../../services/supabaseClient";
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
  const allBySched = loadPersistedState<
    Record<string, Array<{ name?: string; employeeId?: string; aspectScores?: Array<number | null> }>>
  >(MI_SUP_ASSESSMENTS_KEY, {});
  if (!allBySched || typeof allBySched !== "object") return null;
  const targetIdNorm = normEmpKey(employeeId);
  const targetNameLc = String(employeeName ?? "").trim().toLowerCase();
  const matches: number[] = [];
  for (const list of Object.values(allBySched)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const idMatch = Boolean(item.employeeId && normEmpKey(item.employeeId) === targetIdNorm);
      const nameMatch = Boolean(targetNameLc && item.name && item.name.trim().toLowerCase() === targetNameLc);
      if (!idMatch && !nameMatch) continue;
      const valid = (item.aspectScores ?? []).filter((v): v is number => typeof v === "number" && v > 0);
      if (valid.length > 0) {
        matches.push(valid.reduce((a, b) => a + b, 0) / valid.length);
      }
    }
  }
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

export function getPenilai1Score(employeeId: string, employeeName?: string): number | null {
  const persisted = loadPersistedState<Record<string, number>>(MI_SCORES_KEY, {});
  Object.assign(_scores, persisted);
  if (typeof _scores[employeeId] === "number") return _scores[employeeId];
  const targetNorm = normEmpKey(employeeId);
  const foundEntry = Object.entries(_scores).find(
    ([k, v]) =>
      typeof v === "number" &&
      (k.trim().toUpperCase() === employeeId.trim().toUpperCase() || normEmpKey(k) === targetNorm),
  );
  if (foundEntry) return foundEntry[1];
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
