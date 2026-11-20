import { loadPersistedState, safeGetLocalRaw, savePersistedState } from "../../services/supabaseClient";
import { canonicalizeCompanyUnitName, getActiveUser } from "../../store/authStore";

export const BUILTIN_WEIGHT_COLUMNS = [
  { key: "operasional", label: "Operasional", groupName: "Operasional" },
  { key: "kaWaKaSeksi", label: "Ka. / Wa. Ka. Seksi", groupName: "Ka./Wa.Ka.Seksi" },
  { key: "pengawasKepalaBagian", label: "Ka. / Wa. Ka. Bagian", groupName: "Ka./Wa.Ka.Bagian" },
  { key: "kepalaDepartement", label: "Ka. / Wa. Ka. Dept", groupName: "Ka./Wa.Ka.Dept" },
  { key: "kepalaDivisi", label: "Ka. / Wa. Ka. Div ke atas", groupName: "Ka./Wa.Ka.Div ke atas" },
] as const;

export type BuiltinScoreWeightColumn = (typeof BUILTIN_WEIGHT_COLUMNS)[number]["key"];
export type ScoreWeightColumn = BuiltinScoreWeightColumn | (string & {});

export interface CustomScoreWeightColumn {
  key: string;
  label: string;
  groupName: string;
}

export type ScoreWeightRow = { id?: string; indikator: string } & Record<string, string>;
export type UnitScoreWeights = Record<string, Partial<Record<string, string>>>;

const KEY = "score_calibration_weights_v1";
const CUSTOM_COLS_KEY = "score_calibration_custom_cols_v1";
const SCORE_RANGES_KEY = "score_calibration_ranges_v1";
export const SCORE_WEIGHT_EVENT = "score-calibration-weights-changed";

export const DEFAULT_SCORE_WEIGHTS: UnitScoreWeights = {
  KPI: { operasional: "50%", kaWaKaSeksi: "50%", pengawasKepalaBagian: "40%", kepalaDepartement: "40%", kepalaDivisi: "40%" },
  "SMART Goals": { operasional: "20%", kaWaKaSeksi: "20%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  "Appraisal Form": { operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  "Project Outside Job Scope": { operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "10%", kepalaDivisi: "10%" },
  "Managerial Skill": { operasional: "-", kaWaKaSeksi: "-", pengawasKepalaBagian: "15%", kepalaDepartement: "20%", kepalaDivisi: "20%" },
  "Inter-Departement Feedback": { operasional: "-", kaWaKaSeksi: "-", pengawasKepalaBagian: "-", kepalaDepartement: "-", kepalaDivisi: "-" },
  "Management Interview": { operasional: "-", kaWaKaSeksi: "-", pengawasKepalaBagian: "-", kepalaDepartement: "-", kepalaDivisi: "10%" },
};

export function toCustomGroupingColumnKey(groupName: string): string {
  const slug = String(groupName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `grp_${slug || "custom"}`;
}

function loadAllCustomColumnsMap(): Record<string, CustomScoreWeightColumn[]> {
  try {
    const parsed = JSON.parse(safeGetLocalRaw(CUSTOM_COLS_KEY) ?? "{}") as Record<string, CustomScoreWeightColumn[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadUnitCustomWeightColumns(companyName: string): CustomScoreWeightColumn[] {
  const map = loadAllCustomColumnsMap();
  const canon = canonicalizeCompanyUnitName(companyName);
  const list = map[canon] ?? (canon === "PT RSUP ASD" ? map["ASD"] : undefined) ?? map[companyName] ?? [];
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is CustomScoreWeightColumn => Boolean(c && typeof c.key === "string" && typeof c.label === "string"));
}

export function saveUnitCustomWeightColumns(companyName: string, cols: readonly CustomScoreWeightColumn[]): void {
  const canon = canonicalizeCompanyUnitName(companyName);
  const saved = loadAllCustomColumnsMap();
  if (canon === "PT RSUP ASD") delete saved["ASD"];
  const cleaned = cols.map((c) => ({
    key: c.key || toCustomGroupingColumnKey(c.groupName || c.label),
    label: c.label.trim(),
    groupName: (c.groupName || c.label).trim(),
  }));
  const next = { ...saved, [canon]: cleaned };
  savePersistedState(CUSTOM_COLS_KEY, next, {
    kind: "kv-state",
    stateKey: CUSTOM_COLS_KEY,
    stateValue: next,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Scores Setting",
      description: `Updated custom grouping columns (${cleaned.map((c) => c.label).join(", ") || "none"}) for ${canon}`,
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SCORE_WEIGHT_EVENT));
  }
}

export function registerCustomGroupingInAccessSystem(groupName: string): void {
  const trimmed = String(groupName ?? "").trim();
  if (!trimmed) return;
  const builtinNames = new Set([
    "Operasional",
    "Ka./Wa.Ka.Seksi",
    "Ka./Wa.Ka.Bagian",
    "Ka./Wa.Ka.Dept",
    "Ka./Wa.Ka.Div ke atas",
    "Direktur / Director",
  ]);
  if (builtinNames.has(trimmed)) return;

  const groupsKey = "pa_access_groups_v1";
  const cfgsKey = "pa_access_group_configs_v1";
  const existingGroups = loadPersistedState<string[]>(groupsKey, Array.from(builtinNames));
  const normalizedGroups = Array.isArray(existingGroups) ? [...existingGroups] : Array.from(builtinNames);
  const alreadyExists = normalizedGroups.some((g) => String(g).trim().toLowerCase() === trimmed.toLowerCase());
  if (!alreadyExists) {
    normalizedGroups.push(trimmed);
    savePersistedState(groupsKey, normalizedGroups);
  }

  const existingCfgs = loadPersistedState<Record<string, unknown>>(cfgsKey, {});
  const cfgMap = existingCfgs && typeof existingCfgs === "object" ? { ...existingCfgs } : {};
  const matchingKey = Object.keys(cfgMap).find((k) => k.trim().toLowerCase() === trimmed.toLowerCase());
  if (!matchingKey) {
    cfgMap[trimmed] = {
      name: trimmed,
      description: `Custom user grouping: ${trimmed}`,
      authorityLevel: "operational",
      allowedModules: [
        "KPI (Setting/Measurement)",
        "SMART Goals (Setting/Measurement)",
        "Appraisals Form",
        "Project Outside Job Scope",
      ],
    };
    savePersistedState(cfgsKey, cfgMap, {
      kind: "kv-state",
      stateKey: cfgsKey,
      stateValue: cfgMap,
      audit: {
        action: "Create",
        module: "HR Settings",
        subModule: "Scores Setting",
        description: `Registered new user grouping ${trimmed} from Bobot Penilaian KPI`,
      },
    });
  }

  if (typeof window !== "undefined") {
    queueMicrotask(() => window.dispatchEvent(new Event("pa-access-updated")));
    queueMicrotask(() => window.dispatchEvent(new Event("pa-auth-updated")));
  }
}

export function loadUnitScoreWeights(companyName: string): UnitScoreWeights {
  try {
    const saved = JSON.parse(safeGetLocalRaw(KEY) ?? "{}") as Record<string, UnitScoreWeights>;
    const canon = canonicalizeCompanyUnitName(companyName);
    const found = saved[canon] ?? (canon === "PT RSUP ASD" ? saved["ASD"] : undefined) ?? saved[companyName];
    if (!found || typeof found !== "object") return DEFAULT_SCORE_WEIGHTS;
    const merged: UnitScoreWeights = { ...DEFAULT_SCORE_WEIGHTS };
    for (const [indikator, cols] of Object.entries(found)) {
      merged[indikator] = {
        ...(DEFAULT_SCORE_WEIGHTS[indikator] ?? {}),
        ...(cols ?? {}),
      };
    }
    return merged;
  } catch {
    return DEFAULT_SCORE_WEIGHTS;
  }
}

export function weightColumnFromGrouping(grouping?: string, companyName?: string): ScoreWeightColumn {
  const g = String(grouping ?? "").trim();
  if (!g) return "operasional";
  const gLower = g.toLowerCase();

  // 1. Cek kolom grouping custom pada unit usaha aktif (atau lintas unit bila companyName tidak disertakan)
  const candidateCols: CustomScoreWeightColumn[] = companyName
    ? loadUnitCustomWeightColumns(companyName)
    : Object.values(loadAllCustomColumnsMap()).flat();
  const matchedCustom = candidateCols.find(
    (c) =>
      c.groupName.trim().toLowerCase() === gLower ||
      c.label.trim().toLowerCase() === gLower ||
      c.key === g,
  );
  if (matchedCustom) return matchedCustom.key;

  const customSlugKey = toCustomGroupingColumnKey(g);
  if (companyName) {
    const unitW = loadUnitScoreWeights(companyName);
    if (Object.values(unitW).some((row) => row && row[customSlugKey] !== undefined)) {
      return customSlugKey;
    }
  } else {
    try {
      const allSaved = JSON.parse(safeGetLocalRaw(KEY) ?? "{}") as Record<string, UnitScoreWeights>;
      const existsAnywhere = Object.values(allSaved).some(
        (uw) => uw && Object.values(uw).some((row) => row && row[customSlugKey] !== undefined),
      );
      if (existsAnywhere) return customSlugKey;
    } catch {
      // ignore
    }
  }

  // 2. Pemetaan 5 kolom standar
  if (g === "Ka./Wa.Ka.Div ke atas" || g === "Direktur / Director" || g === "TEAM_DIV") return "kepalaDivisi";
  if (gLower === "ka. / wa. ka. div ke atas") return "kepalaDivisi";
  if (g === "Ka./Wa.Ka.Dept" || gLower === "ka. / wa. ka. dept") return "kepalaDepartement";
  if (g === "Ka./Wa.Ka.Bagian" || gLower === "ka. / wa. ka. bagian") return "pengawasKepalaBagian";
  if (g === "Ka./Wa.Ka.Seksi" || gLower === "ka. / wa. ka. seksi") return "kaWaKaSeksi";
  if (g === "Operasional" || gLower === "operasional") return "operasional";
  return "operasional";
}

export function resolveGroupingWeightRaw(
  companyName: string,
  grouping: string | undefined,
  indikator: string,
): string | undefined {
  const unitWeights = loadUnitScoreWeights(companyName);
  const col = weightColumnFromGrouping(grouping, companyName);
  const direct = unitWeights[indikator]?.[col];
  if (direct !== undefined) return direct;
  if (grouping) {
    const byName = unitWeights[indikator]?.[grouping.trim()];
    if (byName !== undefined) return byName;
  }
  return DEFAULT_SCORE_WEIGHTS[indikator]?.[col] ?? DEFAULT_SCORE_WEIGHTS[indikator]?.operasional;
}

export function getModuleWeightPercent(
  companyName: string,
  grouping: string | undefined,
  indikator: string,
  fallbackPct = 0,
): number {
  const raw = resolveGroupingWeightRaw(companyName, grouping, indikator);
  if (!raw || raw === "-") return 0;
  const num = parseFloat(String(raw).replace("%", "").trim());
  return Number.isFinite(num) ? num : fallbackPct;
}

export function getModuleWeightFraction(
  companyName: string,
  grouping: string | undefined,
  indikator: string,
  fallback = 0,
): number {
  const raw = resolveGroupingWeightRaw(companyName, grouping, indikator);
  if (!raw || raw === "-") return fallback;
  const num = parseFloat(String(raw).replace("%", "").trim());
  return Number.isFinite(num) ? num / 100 : fallback;
}

export function saveUnitScoreWeights(companyName: string, rows: readonly ScoreWeightRow[]) {
  const canon = canonicalizeCompanyUnitName(companyName);
  const weights: UnitScoreWeights = Object.fromEntries(
    rows.map(({ id: _id, indikator, ...values }) => [indikator, values]),
  );
  let saved: Record<string, UnitScoreWeights> = {};
  try { saved = JSON.parse(safeGetLocalRaw(KEY) ?? "{}"); } catch {}
  if (canon === "PT RSUP ASD") delete saved["ASD"];
  const next = { ...saved, [canon]: weights };
  savePersistedState(KEY, next, {
    kind: "score-weights",
    companyUnit: canon,
    weights,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Scores Setting",
      description: `Updated module score weights for ${canon}`,
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SCORE_WEIGHT_EVENT));
  }
}

export function loadUnitScoreRanges<T>(companyName: string, fallback: T): T {
  try {
    const saved = JSON.parse(safeGetLocalRaw(SCORE_RANGES_KEY) ?? "{}") as Record<string, T>;
    const canon = canonicalizeCompanyUnitName(companyName);
    const found = saved[canon] ?? (canon === "PT RSUP ASD" ? saved["ASD"] : undefined) ?? saved[companyName];
    return Array.isArray(found) && found.length > 0 ? found : fallback;
  } catch {
    return fallback;
  }
}

export interface GradeRange {
  id?: string;
  min: number;
  max: number;
  grade: string;
  label?: string;
  color?: string;
}

/** Rentang grade default, sama dengan default Scores Setting. */
export const DEFAULT_GRADE_RANGES: GradeRange[] = [
  { id: "1", min: 90, max: 100, grade: "A+", label: "Outstanding" },
  { id: "2", min: 80, max: 89, grade: "A", label: "Good" },
  { id: "3", min: 70, max: 79, grade: "B", label: "Average" },
  { id: "4", min: 60, max: 69, grade: "C", label: "Below Average" },
  { id: "5", min: 50, max: 59, grade: "D", label: "Unsatisfactory" },
  { id: "6", min: 0, max: 49, grade: "E", label: "Fail" },
];

const gradeRangeCache = new Map<string, GradeRange[]>();

/** Rentang grade aktif untuk Unit Usaha (dari Scores Setting), terurut dari min tertinggi. */
export function loadGradeRanges(companyName?: string): GradeRange[] {
  let company = companyName;
  if (!company) {
    try { company = getActiveUser().company; } catch { company = ""; }
  }
  const cacheKey = `${company ?? ""}::${safeGetLocalRaw(SCORE_RANGES_KEY) ?? ""}`;
  const cached = gradeRangeCache.get(cacheKey);
  if (cached) return cached;
  const raw = company ? loadUnitScoreRanges<GradeRange[]>(company, DEFAULT_GRADE_RANGES) : DEFAULT_GRADE_RANGES;
  const cleaned = (Array.isArray(raw) ? raw : DEFAULT_GRADE_RANGES)
    .map((r) => ({ ...r, min: Number(r.min), max: Number(r.max), grade: String(r.grade ?? "").trim() }))
    .filter((r) => r.grade && Number.isFinite(r.min));
  const list = cleaned.length > 0 ? cleaned : DEFAULT_GRADE_RANGES;
  const sorted = [...list].sort((a, b) => b.min - a.min);
  if (gradeRangeCache.size > 50) gradeRangeCache.clear();
  gradeRangeCache.set(cacheKey, sorted);
  return sorted;
}

/** Grade untuk skor (0-100) berdasarkan rentang Scores Setting milik Unit Usaha. */
export function resolveGradeForScore(score: number, companyName?: string): string {
  const ranges = loadGradeRanges(companyName);
  const s = Number(score);
  if (!Number.isFinite(s)) return ranges[ranges.length - 1]?.grade ?? "E";
  const hit = ranges.find((r) => s >= r.min);
  return (hit ?? ranges[ranges.length - 1])?.grade ?? "E";
}

export function saveUnitScoreRanges<T>(companyName: string, ranges: T): void {
  const canon = canonicalizeCompanyUnitName(companyName);
  let saved: Record<string, T> = {};
  try { saved = JSON.parse(safeGetLocalRaw(SCORE_RANGES_KEY) ?? "{}"); } catch {}
  if (canon === "PT RSUP ASD") delete saved["ASD"];
  const next = { ...saved, [canon]: ranges };
  savePersistedState(SCORE_RANGES_KEY, next, {
    kind: "kv-state",
    stateKey: SCORE_RANGES_KEY,
    stateValue: next,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Scores Setting",
      description: `Updated score grading ranges for ${canon}`,
    },
  });
}
