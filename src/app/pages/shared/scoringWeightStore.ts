export type ScoreWeightColumn = "operasional" | "kaWaKaSeksi" | "pengawasKepalaBagian" | "kepalaDepartement" | "kepalaDivisi";
export type ScoreWeightRow = { indikator: string } & Record<ScoreWeightColumn, string>;
export type UnitScoreWeights = Record<string, Partial<Record<ScoreWeightColumn, string>>>;

const KEY = "score_calibration_weights_v1";
export const SCORE_WEIGHT_EVENT = "score-calibration-weights-changed";

export const DEFAULT_SCORE_WEIGHTS: UnitScoreWeights = {
  KPI: { operasional: "50%", kaWaKaSeksi: "50%", pengawasKepalaBagian: "40%", kepalaDepartement: "40%", kepalaDivisi: "40%" },
  "SMART Goals": { operasional: "20%", kaWaKaSeksi: "20%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  "Appraisal Form": { operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  "Project Outside Job Scope": { operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "10%", kepalaDivisi: "10%" },
  "Managerial Skill": { operasional: "-", kaWaKaSeksi: "-", pengawasKepalaBagian: "15%", kepalaDepartement: "20%", kepalaDivisi: "20%" },
  "Management Interview": { operasional: "-", kaWaKaSeksi: "-", pengawasKepalaBagian: "-", kepalaDepartement: "-", kepalaDivisi: "10%" },
};

export function loadUnitScoreWeights(companyName: string): UnitScoreWeights {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, UnitScoreWeights>;
    return saved[companyName] ?? DEFAULT_SCORE_WEIGHTS;
  } catch {
    return DEFAULT_SCORE_WEIGHTS;
  }
}

export function saveUnitScoreWeights(companyName: string, rows: readonly ScoreWeightRow[]) {
  const weights: UnitScoreWeights = Object.fromEntries(rows.map(({ indikator, ...values }) => [indikator, values]));
  let saved: Record<string, UnitScoreWeights> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch {}
  localStorage.setItem(KEY, JSON.stringify({ ...saved, [companyName]: weights }));
  window.dispatchEvent(new Event(SCORE_WEIGHT_EVENT));
}
