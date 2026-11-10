// Shared store: scores submitted by BOD assessment → visible in HR & BOD monitoring

import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";

export const NAME_TO_EMP_ID: Record<string, string> = {
  "Siti Rahayu":  "E002",
  "Kartini Dewi": "E011",
  "Rini Susanti": "E013",
  "Dian Permana": "E014",
};

const MI_SCORES_KEY = "pa_mi_penilai1_scores_v1";
// penilai1Score per employeeId (average of aspect scores, scale 1–5)
const _scores: Record<string, number> = loadPersistedState(MI_SCORES_KEY, {});
const _listeners: (() => void)[] = [];

export function getPenilai1Score(employeeId: string): number | null {
  const persisted = loadPersistedState<Record<string, number>>(MI_SCORES_KEY, {});
  if (persisted[employeeId] !== undefined) _scores[employeeId] = persisted[employeeId];
  return _scores[employeeId] ?? null;
}

// Returns score converted to 0–100 percentage (raw is 1–5 scale)
export function getPenilai1ScoreAsPercent(employeeId: string): number | null {
  const raw = _scores[employeeId];
  if (raw === undefined) return null;
  return parseFloat(((raw / 5) * 100).toFixed(2));
}

export function setPenilai1Score(employeeId: string, score: number): void {
  _scores[employeeId] = score;
  savePersistedState(MI_SCORES_KEY, _scores, {
    kind: "interview-assessment",
    employeeId,
    period: "2026",
    penilai1Score: score,
  });
  _listeners.forEach(fn => fn());
}

export function subscribeScores(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}
