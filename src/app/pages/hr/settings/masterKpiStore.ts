// Shared Master KPI store (KPI Variable & KPI Format) — persisted to Supabase (pa_master_catalogs & pa_kv_state)

import { safeGetLocalRaw, savePersistedState } from "../../../services/supabaseClient";

const KEY = "master_kpi_data";
export const MASTER_KPI_FORMATS_KEY = "master_kpi_formats_v1";
export const MASTER_KPI_UPDATED_EVENT = "pa-master-kpi-updated";
export const MASTER_KPI_FORMATS_UPDATED_EVENT = "pa-master-kpi-formats-updated";

export interface MasterCodeDescItem {
  value: string;
  description: string;
}

export interface MasterKpiStore {
  // ── Variabel pada Tab Section (Add New KPI Modal) ──
  section:         string[];
  personalSection: MasterCodeDescItem[];
  sectionBobot:    string[];
  cascadingTypes:  MasterCodeDescItem[];
  // ── Variabel pada Tab Sub Section (Add New KPI Modal) ──
  perspektif:      string[];
  satuan:          string[];
  period:          string[];
  formula:         string[];
  trackingPeriod:  string[];
  scope:           string[];
  bobot:           string[];
  polaritas:       string[];
  cascading:       MasterCodeDescItem[];
}

export interface MasterKpiFormatItem {
  id: string;
  no: string;
  section: string;
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  bobot: string;
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: "Maximize" | "Minimize" | "Stabilize";
  detailFormula: string;
  keterangan: string;
  monthlyTargets?: Record<string, string>;
  colorIndicator?: boolean;
  indicatorMode?: "numeric" | "color" | "ratio";
  ratioPositiveLabel?: string;
  ratioNegativeLabel?: string;
  sectionAlphabet?: string;
  sectionBobot?: string;
  sectionLabel?: string;
  scope?: string;
  trackingPeriod?: string;
  coo?: string;
  gmVgmIndustry?: string;
  gmVgmPerkebunan?: string;
  gmAsd?: string;
  gmRstm?: string;
  gmGhs?: string;
  cascading?: string;
  cascadingMap?: Record<string, string>;
}

export interface MasterKpiFormatsStore<T = MasterKpiFormatItem> {
  group: T[];
  unit: T[];
  personal: T[];
  sectionCascadeGroup?: Record<string, string>;
  sectionCascadeUnit?: Record<string, string>;
}

const DEFAULTS: MasterKpiStore = {
  scope: [
    "RSUP Group", "RSUP Industry",
    "RMD", "MPD", "WCC",
    "PT RSUP (Industry)", "PT RSUP (Perkebunan)",
    "PT RSTM", "PT GHS", "PT RSUP ASD",
    "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)",
  ],
  section: [
    "Kinerja K3L Terintegrasi (SMK3/HSE)", "Finansial", "Produksi",
    "Be Employer of Choices", "Be Partner of Choices", "Regulatory Compliance",
  ],
  personalSection: [
    { value: "A", description: "Objective KPI" },
    { value: "B", description: "Functional KPI" },
  ],
  sectionBobot: [
    "0%", "1%", "2%", "3%", "4%", "5%", "6%", "7%", "8%", "9%",
    "10%", "12%", "15%", "20%", "25%", "30%", "35%", "40%", "45%",
    "50%", "55%", "60%", "65%", "80%", "100%",
  ],
  cascadingTypes: [
    { value: "FC", description: "Full Cascading" },
    { value: "PC", description: "Partial Cascading" },
    { value: "CC", description: "Contributing Cascading" },
  ],
  perspektif:    ["Proses", "Finansial", "Environment, Health & Safety", "Learning & Growth", "Customer"],
  satuan:        ["%", "Temuan", "Hari", "Kasus", "Rp Juta", "Rp Miliar", "Jumlah"],
  period:        ["Hari", "Bulan", "Semester", "Triwulan", "Quarter", "Tahun"],
  formula:       ["Jumlah", "Rata-Rata", "Nilai Akhir"],
  trackingPeriod: ["Bulan", "Triwulan", "Semester", "Quarter", "Tahun"],
  bobot: [
    "0%", "1%", "2%", "3%", "4%",
    "5%", "10%", "15%", "20%", "25%",
    "30%", "35%", "40%", "45%", "50%",
  ],
  polaritas:     ["Maximize", "Minimize", "Stabilize"],
  cascading: [
    { value: "COO",           description: "COO"           },
    { value: "GM Industry",   description: "GM Industry"   },
    { value: "VGM Industry",  description: "VGM Industry"  },
    { value: "GM Perkebunan", description: "GM Perkebunan" },
    { value: "VGM Perkebunan",description: "VGM Perkebunan"},
    { value: "GM ASD",        description: "GM ASD"        },
    { value: "GM RSTM",       description: "GM RSTM"       },
    { value: "GM GHS",        description: "GM GHS"        },
    { value: "GM PSG",        description: "GM PSG"        },
    { value: "GM PSKE",       description: "GM PSKE"       },
    { value: "VGM PSG",       description: "VGM PSG"       },
    { value: "VGM PSKE",      description: "VGM PSKE"      },
  ],
};

function normalizeMasterTrackingPeriods(list?: string[]): string[] {
  const canonMap = (raw: string): string => {
    const t = String(raw ?? "").trim();
    if (/^bulan(an)?$/i.test(t)) return "Bulan";
    if (/^triwulan(an)?$/i.test(t)) return "Triwulan";
    if (/^semester(an)?$/i.test(t)) return "Semester";
    if (/^quarter(ly)?$/i.test(t)) return "Quarter";
    if (/^tahun(an)?$/i.test(t)) return "Tahun";
    return t;
  };
  const base: string[] = [...DEFAULTS.trackingPeriod];
  if (Array.isArray(list)) {
    for (const item of list) {
      const norm = canonMap(item);
      if (norm && !base.some((b) => b.toLowerCase() === norm.toLowerCase())) {
        base.push(norm);
      }
    }
  }
  return base;
}

export function loadMasterKpi(): MasterKpiStore {
  try {
    const stored = safeGetLocalRaw(KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<MasterKpiStore>;
      const mergedPerspektif = Array.isArray(parsed.perspektif) && parsed.perspektif.length > 0
        ? parsed.perspektif
        : DEFAULTS.perspektif;
      return {
        scope: Array.isArray(parsed.scope) && parsed.scope.length > 0
          ? Array.from(new Set(parsed.scope.map((s) => (s.trim().toUpperCase() === "ASD" ? "PT RSUP ASD" : s))))
          : DEFAULTS.scope,
        section: Array.isArray(parsed.section) && parsed.section.length > 0 ? parsed.section : DEFAULTS.section,
        personalSection:
          Array.isArray(parsed.personalSection) && parsed.personalSection.length > 0
            ? parsed.personalSection
            : DEFAULTS.personalSection,
        sectionBobot:
          Array.isArray(parsed.sectionBobot) && parsed.sectionBobot.length > 0
            ? parsed.sectionBobot
            : DEFAULTS.sectionBobot,
        cascadingTypes:
          Array.isArray(parsed.cascadingTypes) && parsed.cascadingTypes.length > 0
            ? parsed.cascadingTypes
            : DEFAULTS.cascadingTypes,
        perspektif: mergedPerspektif,
        satuan: Array.isArray(parsed.satuan) && parsed.satuan.length > 0 ? parsed.satuan : DEFAULTS.satuan,
        period: Array.isArray(parsed.period) && parsed.period.length > 0 ? parsed.period : DEFAULTS.period,
        formula: Array.isArray(parsed.formula) && parsed.formula.length > 0 ? parsed.formula : DEFAULTS.formula,
        trackingPeriod: normalizeMasterTrackingPeriods(parsed.trackingPeriod),
        bobot: Array.isArray(parsed.bobot) && parsed.bobot.length > 0 ? parsed.bobot : DEFAULTS.bobot,
        polaritas:
          Array.isArray(parsed.polaritas) && parsed.polaritas.length > 0
            ? parsed.polaritas
            : DEFAULTS.polaritas,
        cascading:
          Array.isArray(parsed.cascading) && parsed.cascading.length > 0
            ? parsed.cascading
            : DEFAULTS.cascading,
      };
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

export function saveMasterKpi(data: MasterKpiStore): void {
  savePersistedState(KEY, data, {
    kind: "master-catalog",
    catalogKey: KEY,
    data,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Master KPI (KPI Variable)",
      description: "Updated Master KPI Variable configuration",
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MASTER_KPI_UPDATED_EVENT));
  }
}

export function loadMasterKpiFormats<T = MasterKpiFormatItem>(
  fallback: MasterKpiFormatsStore<T>,
): MasterKpiFormatsStore<T> {
  try {
    const raw = safeGetLocalRaw(MASTER_KPI_FORMATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MasterKpiFormatsStore<T>>;
      return {
        group: Array.isArray(parsed.group) && parsed.group.length > 0 ? parsed.group : fallback.group,
        unit: Array.isArray(parsed.unit) && parsed.unit.length > 0 ? parsed.unit : fallback.unit,
        personal: Array.isArray(parsed.personal) && parsed.personal.length > 0 ? parsed.personal : fallback.personal,
        sectionCascadeGroup: parsed.sectionCascadeGroup ?? fallback.sectionCascadeGroup ?? {},
        sectionCascadeUnit: parsed.sectionCascadeUnit ?? fallback.sectionCascadeUnit ?? {},
      };
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function saveMasterKpiFormats<T = MasterKpiFormatItem>(
  formats: MasterKpiFormatsStore<T>,
  changedLabel = "KPI Format",
): void {
  savePersistedState(MASTER_KPI_FORMATS_KEY, formats, {
    kind: "master-catalog",
    catalogKey: MASTER_KPI_FORMATS_KEY,
    data: formats,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: `Master KPI (${changedLabel})`,
      description: `Updated Master KPI Format template (${changedLabel})`,
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MASTER_KPI_FORMATS_UPDATED_EVENT));
  }
}

export { DEFAULTS as MASTER_KPI_DEFAULTS };
