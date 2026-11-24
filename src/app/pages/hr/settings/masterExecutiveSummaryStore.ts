// Shared Executive Summary KPI Business store (Master KPI -> Executive Summary & Appraisal Analytics -> Executive Summary)
// Persisted end-to-end to Supabase (`public.pa_master_catalogs` & `public.pa_kv_state` via `/api/pa-sync`, PostgREST, and Edge Function).

import {
  refreshKvKeysFromBackend,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  selectRowsFromSupabase,
  syncToSupabase,
} from "../../../services/supabaseClient";

export const MASTER_EXEC_SUMMARY_KEY = "master_kpi_executive_summary_v1";
export const MASTER_EXEC_SUMMARY_UPDATED_EVENT = "pa-master-exec-summary-updated";

export type ExecSummaryPeriodType = "YTD" | "Quarter" | "MTD";
export type AchColorBand = "green" | "yellow" | "red" | "na";

export interface ExecSummaryEntityDef {
  id: string;
  name: string;
  shortName: string;
  kind: "group" | "unit";
  groupName: "RSUP Group" | "Sambu Group";
  colorHex: string;
}

export interface ExecSummaryIndicatorDef {
  id: string;
  label: string;
  shortLabel: string;
}

export interface ExecSummaryMetricCell {
  /** Jika false, sel ditutup blok gelap (tidak berlaku pada entitas tsb, mis. Regulatory Compliance di RSUP Group atau Be Partner di PT RSUP ASD). */
  applicable: boolean;
  bobot: string;
  actual: string;
  ach: string;
}

export interface ExecSummaryEntityTotal {
  bobot: string;
  ach: string;
  /** Opsional untuk mengakomodasi pembulatan sumber (mis. 79.6% tampil "80%" namun kategori Merah <80%). */
  bandOverride?: AchColorBand;
}

export interface ExecSummaryReportBlock {
  id: string;
  title: string;
  shortLabel: string;
  periodType: ExecSummaryPeriodType;
  /** Urutan kronologis di dalam kelompok periodType (mis. 1..4 untuk Q1..Q4, 1..12 untuk Jan..Des). */
  sortOrder: number;
  totalLabel: string;
  /** Map `indicatorId -> entityId -> { applicable, bobot, actual, ach }` */
  cells: Record<string, Record<string, ExecSummaryMetricCell>>;
  /** Map `entityId -> { bobot, ach, bandOverride }` */
  totals: Record<string, ExecSummaryEntityTotal>;
}

export interface MasterExecutiveSummaryStore {
  cycleYear: string;
  entities: ExecSummaryEntityDef[];
  indicators: ExecSummaryIndicatorDef[];
  reports: ExecSummaryReportBlock[];
  updatedAt?: string;
}

// Palet tema resmi terlampir (#3E3E3E, #FF7864, #FFE770, #167267 + Navy #1E3A6E) — TANPA warna ungu & pink
export const EXEC_THEME_PALETTE = {
  charcoal: "#3E3E3E",
  coralRed: "#FF7864",
  sunYellow: "#FFE770",
  pineGreen: "#167267",
  navyCard: "#1E3A6E",
  seaTeal: "#2A8C80",
  warmGold: "#D4A72C",
  terracotta: "#E0634E",
  steelSlate: "#4E5D6C",
} as const;

export const DEFAULT_EXEC_ENTITIES: ExecSummaryEntityDef[] = [
  {
    id: "rsup-group",
    name: "RSUP Group",
    shortName: "RSUP Group",
    kind: "group",
    groupName: "RSUP Group",
    colorHex: "#3E3E3E",
  },
  {
    id: "rsup-ind",
    name: "PT RSUP (Industry)",
    shortName: "RSUP Industry",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#167267",
  },
  {
    id: "rsup-pkb",
    name: "PT RSUP (Perkebunan)",
    shortName: "RSUP Perkebunan",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#2A8C80",
  },
  {
    id: "rsup-asd",
    name: "PT RSUP ASD",
    shortName: "RSUP ASD",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#1E3A6E",
  },
  {
    id: "rsup-ghs",
    name: "PT GHS",
    shortName: "PT GHS",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#D4A72C",
  },
  {
    id: "rsup-rstm",
    name: "PT RSTM",
    shortName: "PT RSTM",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#FF7864",
  },
  // Unit Usaha Sambu Group (siap diisi aktual pada Master KPI -> Executive Summary & ditampilkan via tag Sambu Group)
  {
    id: "ps-jkt",
    name: "PT Pulau Sambu (Jakarta)",
    shortName: "PS Jakarta",
    kind: "unit",
    groupName: "Sambu Group",
    colorHex: "#236477",
  },
  {
    id: "ps-gtg",
    name: "PT Pulau Sambu (Guntung)",
    shortName: "PS Guntung",
    kind: "unit",
    groupName: "Sambu Group",
    colorHex: "#3D8361",
  },
  {
    id: "ps-ken",
    name: "PT Pulau Sambu (Kuala Enok)",
    shortName: "PS Kuala Enok",
    kind: "unit",
    groupName: "Sambu Group",
    colorHex: "#C97A40",
  },
];

export const DEFAULT_EXEC_INDICATORS: ExecSummaryIndicatorDef[] = [
  { id: "ind-k3l", label: "Kinerja K3L Terintegrasi (SMK3 / HSE)", shortLabel: "K3L / HSE" },
  { id: "ind-fin", label: "Finansial & Cost", shortLabel: "Finansial & Cost" },
  { id: "ind-prd", label: "Produksi", shortLabel: "Produksi" },
  { id: "ind-emp", label: "Be Employer of Choices", shortLabel: "Employer of Choices" },
  { id: "ind-prt", label: "Be Partner of Choices", shortLabel: "Partner of Choices" },
  { id: "ind-reg", label: "Regulatory Compliance", shortLabel: "Regulatory Compliance" },
];

function c(bobot: string, actual: string, ach: string): ExecSummaryMetricCell {
  return { applicable: true, bobot, actual, ach };
}
const NA_CELL: ExecSummaryMetricCell = { applicable: false, bobot: "", actual: "", ach: "" };

function mkCells(rows: Record<string, [ExecSummaryMetricCell, ExecSummaryMetricCell, ExecSummaryMetricCell, ExecSummaryMetricCell, ExecSummaryMetricCell, ExecSummaryMetricCell]>): Record<string, Record<string, ExecSummaryMetricCell>> {
  const entityIds = ["rsup-group", "rsup-ind", "rsup-pkb", "rsup-asd", "rsup-ghs", "rsup-rstm"];
  const out: Record<string, Record<string, ExecSummaryMetricCell>> = {};
  for (const [indId, tuple] of Object.entries(rows)) {
    out[indId] = {};
    entityIds.forEach((eid, idx) => {
      out[indId][eid] = tuple[idx];
    });
  }
  return out;
}

function mkTotals(
  achTuple: [string, string, string, string, string, string],
  overrides?: Partial<Record<string, AchColorBand>>,
): Record<string, ExecSummaryEntityTotal> {
  const entityIds = ["rsup-group", "rsup-ind", "rsup-pkb", "rsup-asd", "rsup-ghs", "rsup-rstm"];
  const out: Record<string, ExecSummaryEntityTotal> = {};
  entityIds.forEach((eid, idx) => {
    out[eid] = {
      bobot: "100%",
      ach: achTuple[idx],
      ...(overrides?.[eid] ? { bandOverride: overrides[eid] } : {}),
    };
  });
  return out;
}

// Data awal terverifikasi 100% digit-per-digit dari dokumen resmi Executive Summary_24112026.pdf
export const INITIAL_EXEC_SUMMARY_STORE: MasterExecutiveSummaryStore = {
  cycleYear: "2026",
  entities: DEFAULT_EXEC_ENTITIES,
  indicators: DEFAULT_EXEC_INDICATORS,
  reports: [
    {
      id: "ytd-jan-oct-26",
      title: "YTD Report (Jan-Oct'26)",
      shortLabel: "YTD (Jan–Okt'26)",
      periodType: "YTD",
      sortOrder: 10,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "12%", "80%"), c("15%", "15%", "99%"), c("15%", "15%", "99%"), c("16%", "15%", "96%"), c("20%", "17%", "85%"), c("20%", "19%", "97%")],
        "ind-fin": [c("40%", "39%", "98%"), c("35%", "33%", "95%"), c("30%", "25%", "84%"), c("20%", "17%", "86%"), c("30%", "29%", "96%"), c("30%", "26%", "86%")],
        "ind-prd": [c("30%", "25%", "83%"), c("30%", "27%", "90%"), c("25%", "15%", "60%"), c("40%", "40%", "100%"), c("22%", "17%", "76%"), c("25%", "23%", "91%")],
        "ind-emp": [c("9%", "9%", "100%"),  c("5%", "5%", "93%"),   c("10%", "10%", "100%"), c("10%", "6%", "60%"),  c("10%", "7%", "72%"),  c("10%", "7%", "74%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"), NA_CELL,                c("10%", "5%", "50%"),  c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),  c("10%", "10%", "97%"), c("15%", "12%", "80%"), c("8%", "8%", "94%"),   c("10%", "9%", "87%")],
      }),
      totals: mkTotals(["91%", "95%", "85%", "90%", "82%", "89%"]),
    },
    {
      id: "mtd-oct-26",
      title: "MTD Report (Oct'26)",
      shortLabel: "Okt'26",
      periodType: "MTD",
      sortOrder: 10,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "92%"), c("15%", "14%", "90%"), c("15%", "14%", "95%"), c("16%", "15%", "97%"), c("20%", "18%", "90%"), c("20%", "19%", "95%")],
        "ind-fin": [c("40%", "40%", "99%"), c("35%", "34%", "96%"), c("30%", "25%", "85%"), c("20%", "19%", "96%"), c("30%", "31%", "102%"), c("30%", "25%", "84%")],
        "ind-prd": [c("30%", "26%", "87%"), c("30%", "28%", "93%"), c("25%", "16%", "65%"), c("40%", "40%", "100%"), c("22%", "16%", "74%"), c("25%", "23%", "91%")],
        "ind-emp": [c("9%", "6%", "66%"),   c("5%", "5%", "96%"),   c("10%", "10%", "100%"), c("10%", "6%", "60%"),  c("10%", "7%", "72%"),  c("10%", "8%", "75%")],
        "ind-prt": [c("6%", "5%", "83%"),   c("10%", "8%", "75%"),  c("10%", "10%", "100%"), NA_CELL,                c("10%", "5%", "50%"),  c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),  c("10%", "10%", "97%"), c("15%", "12%", "80%"), c("8%", "8%", "94%"),   c("10%", "9%", "87%")],
      }),
      totals: mkTotals(["90%", "92%", "86%", "92%", "85%", "88%"]),
    },
    {
      id: "mtd-sep-26",
      title: "MTD Report (Sep'26)",
      shortLabel: "Sep'26",
      periodType: "MTD",
      sortOrder: 9,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "13%", "89%"), c("15%", "14%", "90%"), c("15%", "15%", "99%"), c("16%", "13%", "86%"), c("20%", "20%", "100%"), c("20%", "17%", "85%")],
        "ind-fin": [c("40%", "27%", "68%"), c("35%", "24%", "67%"), c("30%", "26%", "87%"), c("20%", "18%", "92%"), c("30%", "28%", "92%"),  c("30%", "26%", "86%")],
        "ind-prd": [c("30%", "26%", "86%"), c("30%", "26%", "88%"), c("25%", "17%", "68%"), c("40%", "40%", "100%"), c("22%", "20%", "92%"), c("25%", "23%", "90%")],
        "ind-emp": [c("9%", "9%", "100%"),  c("5%", "5%", "91%"),   c("10%", "10%", "100%"), c("10%", "6%", "59%"),  c("10%", "7%", "70%"),  c("10%", "7%", "72%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"), NA_CELL,                c("10%", "5%", "50%"),  c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "99%"),   c("10%", "10%", "98%"), c("15%", "12%", "80%"), c("8%", "8%", "95%"),   c("10%", "9%", "87%")],
      }),
      totals: mkTotals(["81%", "83%", "88%", "89%", "87%", "86%"]),
    },
    {
      id: "mtd-aug-26",
      title: "MTD Report (Aug'26)",
      shortLabel: "Agu'26",
      periodType: "MTD",
      sortOrder: 8,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "90%"), c("15%", "14%", "95%"), c("15%", "14%", "97%"), c("16%", "14%", "90%"), c("20%", "20%", "100%"), c("20%", "19%", "96%")],
        "ind-fin": [c("40%", "38%", "96%"), c("35%", "33%", "93%"), c("30%", "26%", "86%"), c("20%", "19%", "98%"), c("30%", "31%", "103%"), c("30%", "26%", "86%")],
        "ind-prd": [c("30%", "25%", "83%"), c("30%", "24%", "81%"), c("25%", "17%", "69%"), c("40%", "40%", "100%"), c("22%", "19%", "88%"), c("25%", "23%", "91%")],
        "ind-emp": [c("9%", "9%", "100%"),  c("5%", "5%", "95%"),   c("10%", "10%", "100%"), c("10%", "6%", "60%"),  c("10%", "7%", "72%"),  c("10%", "7%", "74%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"), NA_CELL,                c("10%", "5%", "50%"),  c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),  c("10%", "10%", "95%"), c("15%", "12%", "80%"), c("8%", "8%", "95%"),   c("10%", "10%", "97%")],
      }),
      totals: mkTotals(["92%", "91%", "87%", "91%", "90%", "90%"]),
    },
    {
      id: "mtd-jul-26",
      title: "MTD Report (Jul'26)",
      shortLabel: "Jul'26",
      periodType: "MTD",
      sortOrder: 7,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "93%"), c("15%", "14%", "93%"), c("15%", "15%", "99%"), c("16%", "13%", "83%"), c("20%", "19%", "94%"),  c("20%", "20%", "100%")],
        "ind-fin": [c("40%", "36%", "89%"), c("35%", "32%", "91%"), c("30%", "26%", "87%"), c("20%", "17%", "86%"), c("30%", "30%", "100%"), c("30%", "25%", "83%")],
        "ind-prd": [c("30%", "27%", "89%"), c("30%", "26%", "85%"), c("25%", "18%", "73%"), c("40%", "40%", "100%"), c("22%", "19%", "85%"), c("25%", "22%", "88%")],
        "ind-emp": [c("9%", "9%", "98%"),   c("5%", "5%", "94%"),   c("10%", "10%", "100%"), c("10%", "6%", "59%"),  c("10%", "7%", "67%"),  c("10%", "7%", "73%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "96%"),  NA_CELL,                c("10%", "5%", "50%"),  c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),  c("10%", "8%", "80%"),  c("15%", "12%", "80%"), c("8%", "8%", "94%"),   c("10%", "8%", "81%")],
      }),
      totals: mkTotals(["91%", "91%", "87%", "88%", "87%", "87%"]),
    },
    {
      id: "mtd-jun-26",
      title: "MTD Report (Jun'26)",
      shortLabel: "Jun'26",
      periodType: "MTD",
      sortOrder: 6,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "93%"), c("15%", "15%", "100%"),  c("15%", "15%", "99%"), c("16%", "15%", "97%"), c("20%", "20%", "100%"), c("20%", "20%", "100%")],
        "ind-fin": [c("40%", "40%", "99%"), c("35%", "33%", "94,9%"), c("30%", "25%", "84%"), c("20%", "17%", "89%"), c("30%", "26%", "87%"),  c("30%", "22%", "74%")],
        "ind-prd": [c("30%", "25%", "83%"), c("30%", "24%", "81%"),   c("25%", "17%", "66%"), c("40%", "40%", "100%"), c("22%", "18%", "84%"), c("25%", "19%", "78%")],
        "ind-emp": [c("9%", "9%", "95%"),   c("5%", "4%", "90%"),     c("10%", "10%", "100%"), c("10%", "6%", "60%"),  c("10%", "7%", "72%"),  c("10%", "8%", "75%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"),  c("10%", "10%", "100%"), NA_CELL,                c("10%", "5%", "50%"),  c("5%", "4%", "80%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),    c("10%", "8%", "81%"),  c("15%", "12%", "79%"), c("8%", "7%", "89%"),   c("10%", "7%", "67%")],
      }),
      totals: mkTotals(["93%", "92%", "85%", "90%", "84%", "80%"], { "rsup-rstm": "red" }),
    },
    {
      id: "q1-2026",
      title: "Q1 Report (Jan-Mar'26)",
      shortLabel: "Q1'26",
      periodType: "Quarter",
      sortOrder: 1,
      totalLabel: "Total Q1",
      cells: mkCells({
        "ind-k3l": [c("15%", "12%", "80%"), c("15%", "15%", "100%"), c("15%", "15%", "103%"),    c("16%", "15%", "97%"), c("20%", "17%", "85%"), c("20%", "20%", "100%")],
        "ind-fin": [c("40%", "38%", "96%"), c("35%", "33%", "93%"),  c("30%", "24%", "81%"),     c("20%", "15%", "78%"), c("30%", "28%", "94%"), c("30%", "26%", "87%")],
        "ind-prd": [c("30%", "24%", "82%"), c("30%", "29%", "96%"),  c("25%", "18%", "70%"),     c("40%", "37%", "92%"), c("22%", "14%", "63%"), c("25%", "15%", "60%")],
        "ind-emp": [c("9%", "9%", "99%"),   c("5%", "5%", "92%"),    c("10%", "9,95%", "99,5%"), c("10%", "10%", "99%"), c("10%", "8%", "75%"),  c("10%", "8%", "75%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "9%", "95%"),      NA_CELL,                c("10%", "5%", "50%"),  c("5%", "4%", "80%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),   c("10%", "6%", "62%"),      c("15%", "5%", "31%"),  c("8%", "6%", "79%"),   c("10%", "4%", "44%")],
      }),
      totals: mkTotals(["90%", "96%", "83%", "82%", "78%", "77%"]),
    },
    {
      id: "q2-2026",
      title: "Q2 Report (Apr-Jun'26)",
      shortLabel: "Q2'26",
      periodType: "Quarter",
      sortOrder: 2,
      totalLabel: "Total Q2",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "93%"), c("15%", "15%", "100%"), c("15%", "15%", "99%"),     c("16%", "15%", "97%"), c("20%", "20%", "100%"), c("20%", "19%", "93%")],
        "ind-fin": [c("40%", "40%", "99%"), c("35%", "33%", "95%"),  c("30%", "26%", "85%"),     c("20%", "17%", "85%"), c("30%", "28%", "92%"),  c("30%", "24%", "80%")],
        "ind-prd": [c("30%", "23%", "78%"), c("30%", "27%", "89%"),  c("25%", "13%", "52%"),     c("40%", "40%", "99%"), c("22%", "15%", "70%"),  c("25%", "19%", "75%")],
        "ind-emp": [c("9%", "9%", "98%"),   c("5%", "4%", "89%"),    c("10%", "10%", "100,0%"),  c("10%", "6%", "60%"),  c("10%", "7%", "72%"),   c("10%", "7%", "73%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"),    NA_CELL,                c("10%", "5%", "50%"),   c("5%", "4%", "80%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),   c("10%", "8%", "81%"),      c("15%", "12%", "79%"), c("8%", "7%", "89%"),    c("10%", "7%", "67%")],
      }),
      totals: mkTotals(["92%", "95%", "81%", "89%", "82%", "79%"]),
    },
    {
      id: "q3-2026",
      title: "Q3 Report (Jul-Sep'26)",
      shortLabel: "Q3'26",
      periodType: "Quarter",
      sortOrder: 3,
      totalLabel: "Total Q3",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "90%"), c("15%", "14%", "94%"),  c("15%", "15%", "99%"),     c("16%", "13%", "85%"), c("20%", "20%", "100%"), c("20%", "18%", "92%")],
        "ind-fin": [c("40%", "38%", "94%"), c("35%", "33%", "94%"),  c("30%", "26%", "86%"),     c("20%", "18%", "93%"), c("30%", "29%", "98%"),  c("30%", "26%", "86%")],
        "ind-prd": [c("30%", "25%", "85%"), c("30%", "26%", "85%"),  c("25%", "17%", "68%"),     c("40%", "40%", "100%"), c("22%", "20%", "90%"), c("25%", "23%", "91%")],
        "ind-emp": [c("9%", "9%", "100%"),  c("5%", "5%", "93%"),    c("10%", "10%", "100,0%"),  c("10%", "6%", "60%"),  c("10%", "7%", "71%"),   c("10%", "7%", "73%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"),    NA_CELL,                c("10%", "5%", "50%"),   c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "99%"),    c("10%", "10%", "98%"),     c("15%", "12%", "80%"), c("8%", "8%", "95%"),    c("10%", "9%", "87%")],
      }),
      totals: mkTotals(["92%", "92%", "88%", "89%", "89%", "88%"]),
    },
    {
      id: "q4-2026",
      title: "Q4 Report (Oct-Dec'26)",
      shortLabel: "Q4'26",
      periodType: "Quarter",
      sortOrder: 4,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "92%"), c("15%", "14%", "90%"), c("15%", "14%", "95%"),     c("16%", "15%", "97%"), c("20%", "18%", "90%"),  c("20%", "19%", "95%")],
        "ind-fin": [c("40%", "40%", "99%"), c("35%", "34%", "96%"), c("30%", "25%", "85%"),     c("20%", "19%", "96%"), c("30%", "31%", "102%"), c("30%", "25%", "84%")],
        "ind-prd": [c("30%", "27%", "91%"), c("30%", "28%", "93%"), c("25%", "16%", "65%"),     c("40%", "37%", "93%"), c("22%", "16%", "74%"),  c("25%", "23%", "91%")],
        "ind-emp": [c("9%", "6%", "66%"),   c("5%", "5%", "96%"),   c("10%", "10%", "100,0%"),  c("10%", "6%", "60%"),  c("10%", "5%", "47%"),   c("10%", "8%", "75%")],
        "ind-prt": [c("6%", "5%", "83%"),   c("10%", "8%", "75%"),  c("10%", "10%", "100%"),    NA_CELL,                c("10%", "5%", "50%"),   c("5%", "5%", "100%")],
        "ind-reg": [NA_CELL,                c("5%", "3%", "50%"),   c("10%", "10%", "97%"),     c("15%", "12%", "80%"), c("8%", "8%", "94%"),    c("10%", "9%", "87%")],
      }),
      totals: mkTotals(["91%", "90%", "86%", "89%", "82%", "88%"]),
    },
    {
      id: "mtd-may-26",
      title: "MTD Report (Mei'26)",
      shortLabel: "Mei'26",
      periodType: "MTD",
      sortOrder: 5,
      totalLabel: "Total",
      cells: mkCells({
        "ind-k3l": [c("15%", "14%", "93%"), c("15%", "15%", "100%"), c("15%", "15%", "99%"),     c("16%", "15%", "97%"), c("20%", "20%", "100%"), c("20%", "18%", "89%")],
        "ind-fin": [c("40%", "38%", "95%"), c("35%", "33%", "94%"),  c("30%", "26%", "88%"),     c("20%", "16%", "84%"), c("30%", "29%", "96%"),  c("30%", "25%", "84%")],
        "ind-prd": [c("30%", "23%", "76%"), c("30%", "27%", "90%"),  c("25%", "14%", "55%"),     c("40%", "38%", "96%"), c("22%", "14%", "63%"),  c("25%", "17%", "68%")],
        "ind-emp": [c("9%", "9%", "97%"),   c("5%", "4%", "88%"),    c("10%", "10%", "100,0%"),  c("10%", "6%", "60%"),  c("10%", "7%", "70%"),   c("10%", "7%", "73%")],
        "ind-prt": [c("6%", "6%", "100%"),  c("10%", "10%", "100%"), c("10%", "10%", "100%"),    NA_CELL,                c("10%", "5%", "50%"),   c("5%", "4%", "80%")],
        "ind-reg": [NA_CELL,                c("5%", "5%", "100%"),   c("10%", "8%", "81%"),      c("15%", "8%", "56%"),  c("8%", "6%", "79%"),    c("10%", "8%", "83%")],
      }),
      totals: mkTotals(["89%", "94%", "83%", "84%", "81%", "80%"], { "rsup-rstm": "red" }),
    },
  ],
};

/** Parse persentase format Indonesia/Inggris (mis. "94,9%" -> 94.9, "100%" -> 100). */
export function parseExecPct(raw?: string | number | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/%/g, "").trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatExecPct(num: number, decimals = 1): string {
  const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  if (Number.isInteger(rounded)) return `${rounded}%`;
  return `${rounded.toFixed(decimals).replace(".", ",")}%`;
}

/**
 * Klasifikasi warna ACH sesuai legenda halaman 7 PDF:
 * - >= 95%       -> HIJAU ("green")
 * - >= 80% < 95% -> KUNING ("yellow")
 * - < 80%        -> MERAH ("red")
 */
export function classifyAchBand(
  rawAch?: string | number | null,
  applicable = true,
  override?: AchColorBand,
): AchColorBand {
  if (!applicable) return "na";
  if (override && override !== "na") return override;
  const val = parseExecPct(rawAch);
  if (val === null) return "na";
  if (val >= 95) return "green";
  if (val >= 80) return "yellow";
  return "red";
}

function cloneStore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

let _syncedSeedOnce = false;

export function loadMasterExecutiveSummary(): MasterExecutiveSummaryStore {
  try {
    const raw = safeGetLocalRaw(MASTER_EXEC_SUMMARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MasterExecutiveSummaryStore>;
      if (
        parsed &&
        Array.isArray(parsed.reports) &&
        parsed.reports.length > 0 &&
        Array.isArray(parsed.entities) &&
        parsed.entities.length > 0 &&
        Array.isArray(parsed.indicators) &&
        parsed.indicators.length > 0
      ) {
        // Pastikan seluruh entitas standar (termasuk Sambu Group) & warna tema terbaru tersinkron, serta hapus laporan FY lama jika ada
        const defColorById = new Map(DEFAULT_EXEC_ENTITIES.map((e) => [e.id, e]));
        const mergedEntities: ExecSummaryEntityDef[] = parsed.entities.map((e) => {
          const def = defColorById.get(e.id);
          return def ? { ...e, colorHex: def.colorHex, groupName: def.groupName, shortName: def.shortName } : e;
        });
        const seenIds = new Set(mergedEntities.map((e) => e.id));
        for (const defEnt of DEFAULT_EXEC_ENTITIES) {
          if (!seenIds.has(defEnt.id)) mergedEntities.push({ ...defEnt });
        }
        const validReports = (parsed.reports as ExecSummaryReportBlock[]).filter(
          (r) => (r.periodType as string) !== "FY",
        );
        return {
          cycleYear: parsed.cycleYear || "2026",
          entities: mergedEntities,
          indicators: parsed.indicators,
          reports: validReports.length > 0 ? validReports : cloneStore(INITIAL_EXEC_SUMMARY_STORE.reports),
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch {
    // fallback to verified initial store
  }
  return cloneStore(INITIAL_EXEC_SUMMARY_STORE);
}

export function saveMasterExecutiveSummary(
  store: MasterExecutiveSummaryStore,
  changeDescription = "Updated Master KPI Executive Summary",
): void {
  const stamped: MasterExecutiveSummaryStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  savePersistedState(MASTER_EXEC_SUMMARY_KEY, stamped, {
    kind: "master-catalog",
    catalogKey: MASTER_EXEC_SUMMARY_KEY,
    data: stamped,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Master KPI (Executive Summary)",
      description: changeDescription,
    },
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MASTER_EXEC_SUMMARY_UPDATED_EVENT));
  }
}

/**
 * Tarik data terbaru `master_kpi_executive_summary_v1` dari Supabase (`pa_master_catalogs` & `pa_kv_state`).
 * Jika di database belum ada baris katalognya sama sekali, otomatis backfill data resmi awal ke Supabase
 * agar tersimpan permanen di backend (sesuai aturan Live Production).
 */
export async function refreshMasterExecutiveSummaryFromBackend(): Promise<MasterExecutiveSummaryStore> {
  try {
    const [catRows, kvMap] = await Promise.all([
      selectRowsFromSupabase<{ catalog_key?: string; data?: MasterExecutiveSummaryStore }>(
        "pa_master_catalogs",
        `select=catalog_key,data&catalog_key=eq.${MASTER_EXEC_SUMMARY_KEY}&limit=1`,
      ),
      refreshKvKeysFromBackend([MASTER_EXEC_SUMMARY_KEY]),
    ]);
    const fromCat = catRows?.[0]?.data;
    const fromKv = kvMap?.[MASTER_EXEC_SUMMARY_KEY] as MasterExecutiveSummaryStore | undefined;
    const remote =
      (fromCat && Array.isArray(fromCat.reports) && fromCat.reports.length > 0 ? fromCat : null) ??
      (fromKv && Array.isArray(fromKv.reports) && fromKv.reports.length > 0 ? fromKv : null);
    if (remote) {
      safeSetLocalJson(MASTER_EXEC_SUMMARY_KEY, remote);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(MASTER_EXEC_SUMMARY_UPDATED_EVENT));
      }
      return remote;
    }
    // Jika di Supabase belum tersimpan sama sekali, dorong seed resmi awal ke Supabase satu kali
    if (!_syncedSeedOnce) {
      _syncedSeedOnce = true;
      const initial = loadMasterExecutiveSummary();
      safeSetLocalJson(MASTER_EXEC_SUMMARY_KEY, initial);
      void syncToSupabase({
        kind: "master-catalog",
        catalogKey: MASTER_EXEC_SUMMARY_KEY,
        data: initial,
      });
      return initial;
    }
  } catch {
    // ignore network failure
  }
  return loadMasterExecutiveSummary();
}
