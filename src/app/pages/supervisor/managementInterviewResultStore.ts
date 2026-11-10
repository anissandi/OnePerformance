// Shared store: BOD Management Interview results visible to each interviewee (supervisor)

import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";

export const MI_CRITERIA: { id: number; label: string }[] = [
  { id: 1, label: "Kewajaran Hasil Kinerja" },
  { id: 2, label: "Justifikasi & Evidence" },
  { id: 3, label: "Improvement & Follow Up" },
];

export const BOD_ASSESSORS = [
  { slot: 1, name: "Ir. Bambang Sutrisno",  role: "Direktur Operasional" },
  { slot: 2, name: "Dr. Maya Kusuma",        role: "Direktur Keuangan" },
  { slot: 3, name: "Ir. Hendra Laksana",    role: "Direktur SDM & Umum" },
  { slot: 4, name: "Dr. Reni Cahyani",       role: "Direktur Strategi" },
] as const;

export const MI_RECOMMENDATIONS = [
  "Promote",
  "Maintain Current Position",
  "Needs Improvement",
  "Further Review Required",
] as const;

export type MIRecommendation = typeof MI_RECOMMENDATIONS[number];

export interface MIPenilaiResult {
  slot: 1 | 2 | 3 | 4;
  penilaiName: string;
  penilaiRole: string;
  scores: Record<number, number>; // criterionId → 1-5
  recommendation: MIRecommendation | "";
  notes: string;
  date: string;
  status: "Completed" | "Pending";
}

export interface MIEmployeeResult {
  employeeId: string;
  schedulePeriod: string;
  penilai: MIPenilaiResult[];
}

// Candidate id (from BOD assessment page) → employee id (for supervisor store lookup)
export const CANDIDATE_TO_EMP_ID: Record<string, string> = {
  hendra: "E001",
  susi:   "E002",
  tono:   "E003",
  eko:    "E004",
};

// ─── Seeded helpers ───────────────────────────────────────────────────────────

function h16(s: string): number {
  return s.split("").reduce((a, c) => ((a * 31) + c.charCodeAt(0)) & 0xffff, 0);
}

const SCORE_TABLE = [3, 4, 4, 5, 3, 4, 5, 4, 3, 5, 4, 4, 3, 5, 4, 3];

function seededCriterionScore(empId: string, slot: number, criterionId: number): number {
  const v = (h16(empId) ^ (slot * 137 + criterionId * 31)) & 0xf;
  return SCORE_TABLE[v];
}

const SLOT_DATES = ["15 Jan 2027", "15 Jan 2027", "16 Jan 2027", "17 Jan 2027"];
const SLOT_RECS: MIRecommendation[] = [
  "Maintain Current Position",
  "Promote",
  "Maintain Current Position",
  "Maintain Current Position",
];

function buildSeededResult(employeeId: string): MIEmployeeResult {
  return {
    employeeId,
    schedulePeriod: "15–17 January 2027",
    penilai: BOD_ASSESSORS.map((a) => ({
      slot: a.slot,
      penilaiName: a.name,
      penilaiRole: a.role,
      scores: {},
      recommendation: "",
      notes: "",
      date: "—",
      status: "Pending",
    })),
  };
}

// ─── In-memory store with listener support ────────────────────────────────────

const MI_RESULTS_KEY = "pa_mi_results_by_emp_v1";
const _results: Record<string, MIEmployeeResult> = loadPersistedState(MI_RESULTS_KEY, {});
const _listeners: Array<() => void> = [];

export function getMIResult(employeeId: string): MIEmployeeResult {
  const persisted = loadPersistedState<Record<string, MIEmployeeResult>>(MI_RESULTS_KEY, {});
  if (persisted[employeeId]) _results[employeeId] = persisted[employeeId];
  return _results[employeeId] ?? buildSeededResult(employeeId);
}

export function setMIPenilaiResult(
  employeeId: string,
  slot: 1 | 2 | 3 | 4,
  scores: Record<number, number>,
  recommendation: MIRecommendation | "",
  notes: string,
): void {
  const current = getMIResult(employeeId);
  const updated: MIEmployeeResult = {
    ...current,
    penilai: current.penilai.map((p) =>
      p.slot === slot
        ? { ...p, scores, recommendation, notes, status: "Completed", date: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) }
        : p
    ),
  };
  _results[employeeId] = updated;
  savePersistedState(MI_RESULTS_KEY, _results, {
    kind: "interview-assessment",
    employeeId,
    period: "2026",
    schedulePeriod: updated.schedulePeriod,
    penilai: updated.penilai,
    audit: {
      action: "Approve",
      module: "Performance Appraisal",
      subModule: "Management Interview",
      description: `Penilai ${slot} submitted Management Interview assessment for ${employeeId} (Recommendation: ${recommendation || "-"})`,
    },
  });
  _listeners.forEach((fn) => fn());
}

export function subscribeMIResults(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

// ─── Score utilities ──────────────────────────────────────────────────────────

export function penilaiAvg(p: MIPenilaiResult): number | null {
  const vals = Object.values(p.scores);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function penilaiScorePercent(p: MIPenilaiResult): number | null {
  const avg = penilaiAvg(p);
  if (avg === null) return null;
  return parseFloat(((avg / 5) * 100).toFixed(2));
}

export function finalScorePercent(result: MIEmployeeResult): number | null {
  const completed = result.penilai.filter((p) => p.status === "Completed");
  if (completed.length === 0) return null;
  const pcts = completed.map(penilaiScorePercent).filter((v): v is number => v !== null);
  if (pcts.length === 0) return null;
  return parseFloat((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(2));
}
