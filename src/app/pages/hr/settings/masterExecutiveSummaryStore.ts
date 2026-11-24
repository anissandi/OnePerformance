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
import {
  computeKPIAchievement,
  mapStoredSettingRowsToTrackingItems,
  parseBobotDecimal,
} from "../../employee/KPIPage";

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
  /** Penanda bulan (1 = Jan .. 12 = Des) khusus tabel MTD agar sistem mengenali bulan KPI & mengakumulasi Quarter + YTD otomatis. */
  monthTag?: number;
  /** Penanda kuartal (1 = Q1 .. 4 = Q4) khusus tabel Quarter. */
  quarterTag?: number;
  totalLabel: string;
  /** Map `indicatorId -> entityId -> { applicable, bobot, actual, ach }` */
  cells: Record<string, Record<string, ExecSummaryMetricCell>>;
  /** Map `entityId -> { bobot, ach, bandOverride }` */
  totals: Record<string, ExecSummaryEntityTotal>;
}

export interface ExecMonthMeta {
  month: number; // 1..12
  code: string; // M01..M12
  idShort: string; // Jan, Feb, Mar, Apr, Mei, Jun, Jul, Agu, Sep, Okt, Nov, Des
  enShort: string; // Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
  reportToken: string; // Jan, Feb, Mar, Apr, Mei, Jun, Jul, Aug, Sep, Oct, Nov, Dec
  trackingLabel26: string; // Jan-26..Dec-26
  fullName: string;
  quarter: 1 | 2 | 3 | 4;
}

export const EXEC_MONTH_META_LIST: ExecMonthMeta[] = [
  { month: 1,  code: "M01", idShort: "Jan", enShort: "Jan", reportToken: "Jan", trackingLabel26: "Jan-26", fullName: "Januari",   quarter: 1 },
  { month: 2,  code: "M02", idShort: "Feb", enShort: "Feb", reportToken: "Feb", trackingLabel26: "Feb-26", fullName: "Februari",  quarter: 1 },
  { month: 3,  code: "M03", idShort: "Mar", enShort: "Mar", reportToken: "Mar", trackingLabel26: "Mar-26", fullName: "Maret",     quarter: 1 },
  { month: 4,  code: "M04", idShort: "Apr", enShort: "Apr", reportToken: "Apr", trackingLabel26: "Apr-26", fullName: "April",     quarter: 2 },
  { month: 5,  code: "M05", idShort: "Mei", enShort: "May", reportToken: "Mei", trackingLabel26: "May-26", fullName: "Mei",       quarter: 2 },
  { month: 6,  code: "M06", idShort: "Jun", enShort: "Jun", reportToken: "Jun", trackingLabel26: "Jun-26", fullName: "Juni",      quarter: 2 },
  { month: 7,  code: "M07", idShort: "Jul", enShort: "Jul", reportToken: "Jul", trackingLabel26: "Jul-26", fullName: "Juli",      quarter: 3 },
  { month: 8,  code: "M08", idShort: "Agu", enShort: "Aug", reportToken: "Aug", trackingLabel26: "Aug-26", fullName: "Agustus",   quarter: 3 },
  { month: 9,  code: "M09", idShort: "Sep", enShort: "Sep", reportToken: "Sep", trackingLabel26: "Sep-26", fullName: "September", quarter: 3 },
  { month: 10, code: "M10", idShort: "Okt", enShort: "Oct", reportToken: "Oct", trackingLabel26: "Oct-26", fullName: "Oktober",   quarter: 4 },
  { month: 11, code: "M11", idShort: "Nov", enShort: "Nov", reportToken: "Nov", trackingLabel26: "Nov-26", fullName: "November",  quarter: 4 },
  { month: 12, code: "M12", idShort: "Des", enShort: "Dec", reportToken: "Dec", trackingLabel26: "Dec-26", fullName: "Desember",  quarter: 4 },
];

export const EXEC_QUARTER_META: Record<1 | 2 | 3 | 4, { quarter: 1 | 2 | 3 | 4; rangeEn: string; shortLabel26: string; title26: string; totalLabel: string }> = {
  1: { quarter: 1, rangeEn: "Jan-Mar", shortLabel26: "Q1'26", title26: "Q1 Report (Jan-Mar'26)", totalLabel: "Total Q1" },
  2: { quarter: 2, rangeEn: "Apr-Jun", shortLabel26: "Q2'26", title26: "Q2 Report (Apr-Jun'26)", totalLabel: "Total Q2" },
  3: { quarter: 3, rangeEn: "Jul-Sep", shortLabel26: "Q3'26", title26: "Q3 Report (Jul-Sep'26)", totalLabel: "Total Q3" },
  4: { quarter: 4, rangeEn: "Oct-Dec", shortLabel26: "Q4'26", title26: "Q4 Report (Oct-Dec'26)", totalLabel: "Total Q4" },
};

export function getExecMonthMeta(month?: number | null): ExecMonthMeta | undefined {
  if (!month || month < 1 || month > 12) return undefined;
  return EXEC_MONTH_META_LIST[month - 1];
}

export function inferMonthTagFromReport(report: Pick<ExecSummaryReportBlock, "id" | "title" | "shortLabel" | "periodType" | "sortOrder" | "monthTag">): number | undefined {
  if (report.periodType !== "MTD") return undefined;
  if (report.monthTag && report.monthTag >= 1 && report.monthTag <= 12) return report.monthTag;
  const hay = `${report.id} ${report.title} ${report.shortLabel}`.toLowerCase();
  const patterns: Array<[RegExp, number]> = [
    [/\b(jan|januari|january)\b/, 1],
    [/\b(feb|februari|february)\b/, 2],
    [/\b(mar|maret|march)\b/, 3],
    [/\b(apr|april)\b/, 4],
    [/\b(mei|may)\b/, 5],
    [/\b(jun|juni|june)\b/, 6],
    [/\b(jul|juli|july)\b/, 7],
    [/\b(agu|ags|aug|agustus|august)\b/, 8],
    [/\b(sep|sept|september)\b/, 9],
    [/\b(okt|oct|oktober|october)\b/, 10],
    [/\b(nov|nop|november)\b/, 11],
    [/\b(des|dec|desember|december)\b/, 12],
  ];
  for (const [re, m] of patterns) {
    if (re.test(hay)) return m;
  }
  if (report.sortOrder >= 1 && report.sortOrder <= 12) return report.sortOrder;
  return undefined;
}

export function inferQuarterTagFromReport(report: Pick<ExecSummaryReportBlock, "id" | "title" | "shortLabel" | "periodType" | "sortOrder" | "quarterTag">): (1 | 2 | 3 | 4) | undefined {
  if (report.periodType !== "Quarter") return undefined;
  if (report.quarterTag && report.quarterTag >= 1 && report.quarterTag <= 4) {
    return report.quarterTag as 1 | 2 | 3 | 4;
  }
  const hay = `${report.id} ${report.title} ${report.shortLabel}`.toLowerCase();
  if (/\bq1\b/.test(hay)) return 1;
  if (/\bq2\b/.test(hay)) return 2;
  if (/\bq3\b/.test(hay)) return 3;
  if (/\bq4\b/.test(hay)) return 4;
  if (report.sortOrder >= 1 && report.sortOrder <= 4) return report.sortOrder as 1 | 2 | 3 | 4;
  return undefined;
}

export function enrichReportTags(report: ExecSummaryReportBlock): ExecSummaryReportBlock {
  if (report.periodType === "MTD") {
    const m = inferMonthTagFromReport(report);
    return {
      ...report,
      monthTag: m,
      sortOrder: m ?? report.sortOrder,
    };
  }
  if (report.periodType === "Quarter") {
    const q = inferQuarterTagFromReport(report);
    return {
      ...report,
      quarterTag: q,
      sortOrder: q ?? report.sortOrder,
    };
  }
  return report;
}

/**
 * Urutkan tabel laporan berdasarkan tipe: YTD -> Quarter (Q1..Q4) -> Month / MTD (kronologis bulan).
 */
export function sortExecSummaryReports(reports: ExecSummaryReportBlock[]): ExecSummaryReportBlock[] {
  const rank: Record<ExecSummaryPeriodType, number> = {
    YTD: 1,
    Quarter: 2,
    MTD: 3,
  };
  return [...reports]
    .map(enrichReportTags)
    .sort((a, b) => {
      const rDiff = (rank[a.periodType] ?? 9) - (rank[b.periodType] ?? 9);
      if (rDiff !== 0) return rDiff;
      if (a.periodType === "YTD") return b.sortOrder - a.sortOrder;
      if (a.periodType === "Quarter") {
        return (a.quarterTag ?? a.sortOrder) - (b.quarterTag ?? b.sortOrder);
      }
      return (a.monthTag ?? a.sortOrder) - (b.monthTag ?? b.sortOrder);
    });
}

export interface MasterExecutiveSummaryStore {
  cycleYear: string;
  entities: ExecSummaryEntityDef[];
  indicators: ExecSummaryIndicatorDef[];
  reports: ExecSummaryReportBlock[];
  updatedAt?: string;
}

// Palet warna profesional dari ikon collapsed Sidebar (tanpa ungu & pink) + Kuning Telur #EA9942 untuk Achievement Kuning
export const EXEC_THEME_PALETTE = {
  steelBlue: "#3B6EA8",
  seafoamTeal: "#248277",
  ochreAmber: "#C07A28",
  mutedEmerald: "#2E8555",
  crimsonBrick: "#B84A4A",
  ceruleanSky: "#2378A6",
  siennaOrange: "#C76332",
  pacificCyan: "#1F8699",
  oliveMoss: "#5B8731",
  coolSlate: "#475569",
  bronzeTaupe: "#85643A",
  navyCobalt: "#2F5597",
  sprucePetrol: "#1D6863",
  eggYolkYellow: "#EA9942",
} as const;

export const DEFAULT_EXEC_ENTITIES: ExecSummaryEntityDef[] = [
  {
    id: "rsup-group",
    name: "RSUP Group",
    shortName: "RSUP Group",
    kind: "group",
    groupName: "RSUP Group",
    colorHex: "#2F5597", // Navy Cobalt
  },
  {
    id: "rsup-ind",
    name: "PT RSUP (Industry)",
    shortName: "RSUP Industry",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#3B6EA8", // Soft Steel Blue
  },
  {
    id: "rsup-pkb",
    name: "PT RSUP (Perkebunan)",
    shortName: "RSUP Perkebunan",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#2E8555", // Muted Emerald
  },
  {
    id: "rsup-asd",
    name: "PT RSUP ASD",
    shortName: "RSUP ASD",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#248277", // Seafoam Teal
  },
  {
    id: "rsup-ghs",
    name: "PT GHS",
    shortName: "PT GHS",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#C07A28", // Warm Ochre Amber
  },
  {
    id: "rsup-rstm",
    name: "PT RSTM",
    shortName: "PT RSTM",
    kind: "unit",
    groupName: "RSUP Group",
    colorHex: "#1F8699", // Pacific Cyan
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
// Diurutkan berdasarkan tipe: YTD -> Quarter (Q1–Q4) -> Month / MTD (Mei–Okt'26)
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
      id: "q1-2026",
      title: "Q1 Report (Jan-Mar'26)",
      shortLabel: "Q1'26",
      periodType: "Quarter",
      sortOrder: 1,
      quarterTag: 1,
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
      quarterTag: 2,
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
      quarterTag: 3,
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
      quarterTag: 4,
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
      monthTag: 5,
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
    {
      id: "mtd-jun-26",
      title: "MTD Report (Jun'26)",
      shortLabel: "Jun'26",
      periodType: "MTD",
      sortOrder: 6,
      monthTag: 6,
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
      id: "mtd-jul-26",
      title: "MTD Report (Jul'26)",
      shortLabel: "Jul'26",
      periodType: "MTD",
      sortOrder: 7,
      monthTag: 7,
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
      id: "mtd-aug-26",
      title: "MTD Report (Aug'26)",
      shortLabel: "Agu'26",
      periodType: "MTD",
      sortOrder: 8,
      monthTag: 8,
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
      id: "mtd-sep-26",
      title: "MTD Report (Sep'26)",
      shortLabel: "Sep'26",
      periodType: "MTD",
      sortOrder: 9,
      monthTag: 9,
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
      id: "mtd-oct-26",
      title: "MTD Report (Oct'26)",
      shortLabel: "Okt'26",
      periodType: "MTD",
      sortOrder: 10,
      monthTag: 10,
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

/**
 * Hitung baris Total (Total Bobot & Total Achievement) per entitas dari sel indikator yang aktif.
 * Formula:
 * - Total Bobot = Σ Bobot indikator applicable (jika |Σ Bobot - 100| <= 1 karena pembulatan seperti 16%+15% dari 15,5%+14,5%, dinormalisasi 100%).
 * - Total Achievement = (|Σ Bobot - 100| <= 1.5 ? Σ Actual : (Σ Actual / Σ Bobot) * 100).
 */
export function computeEntityTotalFromCells(
  cellsMap: ExecSummaryReportBlock["cells"],
  indicators: ExecSummaryIndicatorDef[],
  entityId: string,
  prevTotal?: ExecSummaryEntityTotal,
): ExecSummaryEntityTotal {
  let bobotSum = 0;
  let actualSum = 0;
  let hasBobot = false;
  let hasActual = false;
  for (const ind of indicators) {
    const cell = cellsMap?.[ind.id]?.[entityId];
    if (!cell || !cell.applicable) continue;
    const b = parseExecPct(cell.bobot);
    const a = parseExecPct(cell.actual);
    if (b !== null) {
      bobotSum += b;
      hasBobot = true;
    }
    if (a !== null) {
      actualSum += a;
      hasActual = true;
    } else if (b !== null && b > 0) {
      const ach = parseExecPct(cell.ach);
      if (ach !== null) {
        actualSum += (b * ach) / 100;
        hasActual = true;
      }
    }
  }
  const normalizedBobot =
    !hasBobot
      ? prevTotal?.bobot || "100%"
      : Math.abs(bobotSum - 100) <= 1.05
      ? "100%"
      : formatExecPct(bobotSum, 1);

  let totalAchNum: number | null = null;
  if (hasActual) {
    if (bobotSum > 0 && Math.abs(bobotSum - 100) > 1.5) {
      totalAchNum = (actualSum / bobotSum) * 100;
    } else {
      totalAchNum = actualSum;
    }
  }
  return {
    bobot: normalizedBobot,
    ach: totalAchNum !== null ? formatExecPct(Math.round(totalAchNum * 10) / 10, 1) : prevTotal?.ach || "0%",
  };
}

/**
 * Kalkulasi otomatis Quarter Report (Q1–Q4) dan YTD Report berdasarkan tabel-tabel MTD ber-tag `Month` (`monthTag = 1..12`).
 * Bila `targetQuarters` diberikan, hanya kuartal tersebut yang dihitung ulang dari MTD lalu YTD diakumulasi ulang.
 */
export function recalculateQuarterAndYtdFromMtd(
  store: MasterExecutiveSummaryStore,
  targetQuarters?: Array<1 | 2 | 3 | 4>,
): MasterExecutiveSummaryStore {
  const cycleSuffix = String(store.cycleYear || "2026").slice(-2) || "26";
  const normalized = store.reports.map(enrichReportTags);
  const mtdReports = normalized
    .filter((r) => r.periodType === "MTD" && r.monthTag && r.monthTag >= 1 && r.monthTag <= 12)
    .sort((a, b) => (a.monthTag ?? 0) - (b.monthTag ?? 0));

  const quartersToRebuild: Set<1 | 2 | 3 | 4> = new Set(
    targetQuarters && targetQuarters.length > 0
      ? targetQuarters
      : ([1, 2, 3, 4] as Array<1 | 2 | 3 | 4>).filter((q) =>
          mtdReports.some((m) => getExecMonthMeta(m.monthTag)?.quarter === q),
        ),
  );

  const nonQuarterYtdReports = normalized.filter((r) => r.periodType === "MTD");
  const existingQuarters = new Map<1 | 2 | 3 | 4, ExecSummaryReportBlock>();
  for (const r of normalized) {
    if (r.periodType === "Quarter") {
      const q = inferQuarterTagFromReport(r);
      if (q) existingQuarters.set(q, r);
    }
  }
  const existingYtd = normalized.find((r) => r.periodType === "YTD");

  // 1) Rebuild affected Quarter Report(s) from MTD tables carrying monthTag in that quarter
  for (const q of [1, 2, 3, 4] as Array<1 | 2 | 3 | 4>) {
    if (!quartersToRebuild.has(q)) continue;
    const mtdsInQ = mtdReports.filter((m) => getExecMonthMeta(m.monthTag)?.quarter === q);
    if (mtdsInQ.length === 0) continue;

    const qMeta = EXEC_QUARTER_META[q];
    const prevQ = existingQuarters.get(q);
    const nextCells: ExecSummaryReportBlock["cells"] = {};
    for (const ind of store.indicators) {
      nextCells[ind.id] = {};
      for (const ent of store.entities) {
        const appCells = mtdsInQ
          .map((m) => m.cells?.[ind.id]?.[ent.id])
          .filter((cell): cell is ExecSummaryMetricCell => Boolean(cell && cell.applicable));
        if (appCells.length === 0) {
          nextCells[ind.id][ent.id] = { applicable: false, bobot: "", actual: "", ach: "" };
          continue;
        }
        const latestBobot =
          parseExecPct(appCells[appCells.length - 1].bobot) ??
          parseExecPct(appCells[0].bobot) ??
          0;
        let actSum = 0;
        let actCnt = 0;
        for (const cell of appCells) {
          const a = parseExecPct(cell.actual);
          const b = parseExecPct(cell.bobot);
          const ach = parseExecPct(cell.ach);
          if (a !== null) {
            actSum += a;
            actCnt += 1;
          } else if (b !== null && ach !== null) {
            actSum += (b * ach) / 100;
            actCnt += 1;
          }
        }
        const avgActual = actCnt > 0 ? actSum / actCnt : 0;
        const achPct = latestBobot > 0 ? (avgActual / latestBobot) * 100 : 0;
        nextCells[ind.id][ent.id] = {
          applicable: true,
          bobot: formatExecPct(latestBobot, 1),
          actual: formatExecPct(avgActual, 1),
          ach: formatExecPct(Math.round(achPct * 10) / 10, 1),
        };
      }
    }

    const nextTotals: ExecSummaryReportBlock["totals"] = {};
    for (const ent of store.entities) {
      nextTotals[ent.id] = computeEntityTotalFromCells(nextCells, store.indicators, ent.id, prevQ?.totals?.[ent.id]);
    }

    existingQuarters.set(q, {
      id: prevQ?.id ?? `q${q}-${store.cycleYear || "2026"}`,
      title: prevQ?.title || `Q${q} Report (${qMeta.rangeEn}'${cycleSuffix})`,
      shortLabel: prevQ?.shortLabel || `Q${q}'${cycleSuffix}`,
      periodType: "Quarter",
      sortOrder: q,
      quarterTag: q,
      totalLabel: prevQ?.totalLabel || qMeta.totalLabel,
      cells: nextCells,
      totals: nextTotals,
    });
  }

  // 2) Rebuild YTD Report automatically across available Quarter / MTD months
  const maxMtdMonth = mtdReports.reduce((mx, r) => Math.max(mx, r.monthTag ?? 0), 0);
  const maxQuarterWithData = Array.from(existingQuarters.keys()).reduce((mx, q) => Math.max(mx, q), 0);
  const maxEffectiveMonth =
    maxMtdMonth > 0
      ? Math.max(maxMtdMonth, ...Array.from(existingQuarters.keys()).filter((q) => q < Math.ceil(maxMtdMonth / 3)).map((q) => q * 3))
      : maxQuarterWithData * 3;

  let nextYtd = existingYtd;
  if (existingQuarters.size > 0 || mtdReports.length > 0) {
    // Susun sumber bobot bulan: untuk setiap kuartal q, jika ada MTD pada kuartal berjalan gunakan jumlah bulan MTD aktual,
    // sedangkan untuk kuartal historis sebelumnya tanpa rincian 3 MTD penuh (mis. Q1 Jan-Mar) gunakan bobot 3 bulan kuartal.
    const activeMaxQuarter = maxMtdMonth > 0 ? (Math.ceil(maxMtdMonth / 3) as 1 | 2 | 3 | 4) : (maxQuarterWithData as 1 | 2 | 3 | 4);
    const weightedSources: Array<{ block: ExecSummaryReportBlock; monthWeight: number }> = [];
    for (const q of [1, 2, 3, 4] as Array<1 | 2 | 3 | 4>) {
      const mtdsInQ = mtdReports.filter((m) => getExecMonthMeta(m.monthTag)?.quarter === q);
      const qBlock = existingQuarters.get(q);
      if (mtdsInQ.length === 3 && qBlock) {
        weightedSources.push({ block: qBlock, monthWeight: 3 });
      } else if (q < activeMaxQuarter && qBlock) {
        weightedSources.push({ block: qBlock, monthWeight: 3 });
      } else if (mtdsInQ.length > 0 && qBlock) {
        weightedSources.push({ block: qBlock, monthWeight: mtdsInQ.length });
      } else if (mtdsInQ.length > 0) {
        for (const mBlock of mtdsInQ) weightedSources.push({ block: mBlock, monthWeight: 1 });
      } else if (qBlock && maxMtdMonth === 0) {
        weightedSources.push({ block: qBlock, monthWeight: 3 });
      }
    }

    if (weightedSources.length > 0) {
      const ytdCells: ExecSummaryReportBlock["cells"] = {};
      for (const ind of store.indicators) {
        ytdCells[ind.id] = {};
        for (const ent of store.entities) {
          let weightedActualSum = 0;
          let weightSum = 0;
          let latestBobot: number | null = null;
          for (const { block, monthWeight } of weightedSources) {
            const cell = block.cells?.[ind.id]?.[ent.id];
            if (!cell || !cell.applicable) continue;
            const b = parseExecPct(cell.bobot);
            const a = parseExecPct(cell.actual);
            const ach = parseExecPct(cell.ach);
            if (b !== null) latestBobot = b;
            const actVal = a !== null ? a : b !== null && ach !== null ? (b * ach) / 100 : null;
            if (actVal !== null) {
              weightedActualSum += actVal * monthWeight;
              weightSum += monthWeight;
            }
          }
          if (weightSum === 0 || latestBobot === null) {
            ytdCells[ind.id][ent.id] = { applicable: false, bobot: "", actual: "", ach: "" };
          } else {
            const ytdActual = weightedActualSum / weightSum;
            const ytdAch = latestBobot > 0 ? (ytdActual / latestBobot) * 100 : 0;
            ytdCells[ind.id][ent.id] = {
              applicable: true,
              bobot: formatExecPct(latestBobot, 1),
              actual: formatExecPct(ytdActual, 1),
              ach: formatExecPct(Math.round(ytdAch * 10) / 10, 1),
            };
          }
        }
      }
      const ytdTotals: ExecSummaryReportBlock["totals"] = {};
      for (const ent of store.entities) {
        ytdTotals[ent.id] = computeEntityTotalFromCells(ytdCells, store.indicators, ent.id, existingYtd?.totals?.[ent.id]);
      }
      const endMonthMeta = getExecMonthMeta(maxEffectiveMonth || 10);
      const endTokenEn = endMonthMeta?.enShort || "Oct";
      const endTokenId = endMonthMeta?.idShort || "Okt";
      nextYtd = {
        id: existingYtd?.id || `ytd-jan-${endTokenEn.toLowerCase()}-${cycleSuffix}`,
        title: `YTD Report (Jan-${endTokenEn}'${cycleSuffix})`,
        shortLabel: `YTD (Jan–${endTokenId}'${cycleSuffix})`,
        periodType: "YTD",
        sortOrder: maxEffectiveMonth || 10,
        totalLabel: existingYtd?.totalLabel || "Total",
        cells: ytdCells,
        totals: ytdTotals,
      };
    }
  }

  const combined: ExecSummaryReportBlock[] = [
    ...(nextYtd ? [nextYtd] : []),
    ...Array.from(existingQuarters.values()),
    ...nonQuarterYtdReports,
  ];

  return {
    ...store,
    reports: sortExecSummaryReports(combined),
  };
}

function matchIndicatorIdForBusinessKpiItem(item: {
  section?: string;
  sectionLabel?: string;
  perspektif?: string;
  kpi?: string;
}): string | null {
  const sec = String(item.section ?? "").trim().toUpperCase();
  const label = `${item.sectionLabel ?? ""} ${item.perspektif ?? ""} ${item.kpi ?? ""}`.toLowerCase();
  if (/k3l|smk3|hse|safety|keselamatan|lingkungan/.test(label)) return "ind-k3l";
  if (/finansial|financial|cost|biaya|ebitda|revenue|budget/.test(label)) return "ind-fin";
  if (/produksi|production|yield|output|kapasitas|tonase/.test(label)) return "ind-prd";
  if (/employer|people|talent|karyawan|turnover|training|learning/.test(label)) return "ind-emp";
  if (/partner|mitra|customer|pelanggan|vendor|supplier/.test(label)) return "ind-prt";
  if (/regulatory|compliance|regulasi|kepatuhan|izin|legal/.test(label)) return "ind-reg";
  const bySection: Record<string, string> = {
    A: "ind-k3l",
    B: "ind-fin",
    C: "ind-prd",
    D: "ind-emp",
    E: "ind-prt",
    F: "ind-reg",
  };
  return bySection[sec] ?? null;
}

/**
 * Sync Data Aktual:
 * Menarik data aktual dari KPI Business Setting (`pa_kpi_business` / `pa_kpi_business_by_scope_v1`)
 * & KPI Business Tracking (`pa_kpi_trackings` / `kpi_business_tracking_cells_v2`) di sistem,
 * memperbarui tabel MTD per bulan (`monthTag`), lalu mengalkulasi ulang Quarter & YTD secara otomatis.
 */
export async function syncExecutiveSummaryFromActualBusinessKpi(
  currentStore: MasterExecutiveSummaryStore,
): Promise<{
  nextStore: MasterExecutiveSummaryStore;
  syncedCellsCount: number;
  syncedMonths: number[];
}> {
  const ENTITY_SCOPE_MAP: Record<
    string,
    { settingKeys: string[]; trackingScopes: string[] }
  > = {
    "rsup-group": {
      settingKeys: ["corporate-RSUP Group", "corporate-unit-RSUP"],
      trackingScopes: ["group:RSUP Group"],
    },
    "rsup-ind": {
      settingKeys: ["unit-PT RSUP (Industry)"],
      trackingScopes: ["unit:PT RSUP (Industry)"],
    },
    "rsup-pkb": {
      settingKeys: ["unit-PT RSUP (Perkebunan)"],
      trackingScopes: ["unit:PT RSUP (Perkebunan)"],
    },
    "rsup-asd": {
      settingKeys: ["unit-PT RSUP ASD", "unit-ASD"],
      trackingScopes: ["unit:PT RSUP ASD", "unit:ASD"],
    },
    "rsup-ghs": {
      settingKeys: ["unit-PT GHS"],
      trackingScopes: ["unit:PT GHS"],
    },
    "rsup-rstm": {
      settingKeys: ["unit-PT RSTM"],
      trackingScopes: ["unit:PT RSTM"],
    },
  };

  let settingByScope: Record<string, Array<Record<string, unknown>>> = {};
  let trackingByScope: Record<string, Record<string, Record<string, string>>> = {};
  const monthsMetaByScope: Record<string, Array<{ id: string; label: string }>> = {};

  try {
    const rawSet = safeGetLocalRaw("pa_kpi_business_by_scope_v1");
    if (rawSet) settingByScope = { ...(JSON.parse(rawSet) as typeof settingByScope) };
  } catch {
    // ignore
  }
  try {
    const rawTrk = safeGetLocalRaw("kpi_business_tracking_cells_v2");
    if (rawTrk) trackingByScope = { ...(JSON.parse(rawTrk) as typeof trackingByScope) };
  } catch {
    // ignore
  }

  // Tarik terbaru dari Supabase (tabel relasional pa_kpi_business, pa_kpi_trackings & pa_kv_state)
  try {
    const [bizRows, trkRows, kvMap] = await Promise.all([
      selectRowsFromSupabase<{ scope_key?: string; items?: Array<Record<string, unknown>> }>(
        "pa_kpi_business",
        "select=scope_key,items&limit=50",
      ),
      selectRowsFromSupabase<{
        doc_key?: string;
        employee_id?: string;
        months?: Array<{ id: string; label: string }>;
        cells_map?: Record<string, Record<string, string>>;
      }>("pa_kpi_trackings", "select=doc_key,employee_id,months,cells_map&doc_key=like.business:*&limit=50"),
      refreshKvKeysFromBackend(["pa_kpi_business_by_scope_v1", "kpi_business_tracking_cells_v2"]),
    ]);
    if (kvMap?.pa_kpi_business_by_scope_v1 && typeof kvMap.pa_kpi_business_by_scope_v1 === "object") {
      settingByScope = {
        ...settingByScope,
        ...(kvMap.pa_kpi_business_by_scope_v1 as typeof settingByScope),
      };
    }
    if (kvMap?.kpi_business_tracking_cells_v2 && typeof kvMap.kpi_business_tracking_cells_v2 === "object") {
      trackingByScope = {
        ...trackingByScope,
        ...(kvMap.kpi_business_tracking_cells_v2 as typeof trackingByScope),
      };
    }
    for (const row of bizRows ?? []) {
      if (row?.scope_key && Array.isArray(row.items) && row.items.length > 0) {
        settingByScope[row.scope_key] = row.items;
      }
    }
    for (const row of trkRows ?? []) {
      const sc = row?.employee_id || (row?.doc_key ? row.doc_key.replace(/^business:/, "").replace(/:\d{4}$/, "") : "");
      if (sc && row?.cells_map && typeof row.cells_map === "object") {
        trackingByScope[sc] = row.cells_map;
        if (Array.isArray(row.months)) monthsMetaByScope[sc] = row.months;
      }
    }
  } catch {
    // lanjutkan dengan snapshot yang sudah terhidrasi
  }

  const cycleSuffix = String(currentStore.cycleYear || "2026").slice(-2) || "26";
  const reportsMap = new Map<string, ExecSummaryReportBlock>();
  for (const rep of currentStore.reports.map(enrichReportTags)) {
    reportsMap.set(rep.id, JSON.parse(JSON.stringify(rep)));
  }

  let syncedCellsCount = 0;
  const syncedMonthsSet = new Set<number>();
  const affectedQuartersSet = new Set<1 | 2 | 3 | 4>();

  for (const mMeta of EXEC_MONTH_META_LIST) {
    const monthUpdatesForEntities: Record<string, Record<string, ExecSummaryMetricCell>> = {};
    for (const ent of currentStore.entities) {
      const scopeCfg = ENTITY_SCOPE_MAP[ent.id];
      if (!scopeCfg) continue;
      const rawItems =
        scopeCfg.settingKeys.map((k) => settingByScope[k]).find((arr) => Array.isArray(arr) && arr.length > 0) ?? [];
      if (rawItems.length === 0) continue;
      const cellsMap =
        scopeCfg.trackingScopes.map((k) => trackingByScope[k]).find((m) => m && Object.keys(m).length > 0) ?? null;
      if (!cellsMap) continue;
      const scopeName = scopeCfg.trackingScopes.find((k) => trackingByScope[k]) ?? scopeCfg.trackingScopes[0];
      const knownMonths = monthsMetaByScope[scopeName] ?? [];
      const matchedMonthEntry =
        knownMonths.find((x) => x.label.toLowerCase().startsWith(mMeta.enShort.toLowerCase())) ?? {
          id: `m${mMeta.month}`,
          label: mMeta.trackingLabel26,
        };
      const monthCells = cellsMap[matchedMonthEntry.id];
      if (!monthCells || Object.values(monthCells).every((v) => !String(v ?? "").trim())) continue;

      const mappedItems = mapStoredSettingRowsToTrackingItems(rawItems);
      for (const ind of currentStore.indicators) {
        const indItems = mappedItems.filter((it) => matchIndicatorIdForBusinessKpiItem(it) === ind.id);
        if (indItems.length === 0) continue;
        let bobotSec = 0;
        let actualSec = 0;
        let hasTrackedValue = false;
        for (const it of indItems) {
          const bPct = parseBobotDecimal(it.bobot) * 100;
          if (Number.isFinite(bPct) && bPct > 0) bobotSec += bPct;
          // Pastikan minimal ada sel aktual (non-target) terisi pada bulan ini
          const hasNonTargetCell = it.subRows.some(
            (sr, si) => !sr.compute && !/target/i.test(sr.label) && Boolean(String(monthCells[`${it.no}_${si}`] ?? "").trim()),
          );
          if (!hasNonTargetCell) continue;
          const ach = computeKPIAchievement(it, cellsMap, [matchedMonthEntry]);
          if (ach !== null) {
            actualSec += (Math.min(ach, 100) / 100) * bPct;
            hasTrackedValue = true;
          }
        }
        if (hasTrackedValue && bobotSec > 0) {
          if (!monthUpdatesForEntities[ind.id]) monthUpdatesForEntities[ind.id] = {};
          const achPct = (actualSec / bobotSec) * 100;
          monthUpdatesForEntities[ind.id][ent.id] = {
            applicable: true,
            bobot: formatExecPct(bobotSec, 1),
            actual: formatExecPct(actualSec, 1),
            ach: formatExecPct(Math.round(achPct * 10) / 10, 1),
          };
          syncedCellsCount += 1;
        }
      }
    }

    if (Object.keys(monthUpdatesForEntities).length > 0) {
      syncedMonthsSet.add(mMeta.month);
      affectedQuartersSet.add(mMeta.quarter);
      let targetMtd = Array.from(reportsMap.values()).find(
        (r) => r.periodType === "MTD" && r.monthTag === mMeta.month,
      );
      if (!targetMtd) {
        const template =
          Array.from(reportsMap.values())
            .filter((r) => r.periodType === "MTD")
            .sort((a, b) => (b.monthTag ?? 0) - (a.monthTag ?? 0))[0] ?? currentStore.reports[0];
        targetMtd = {
          id: `mtd-${mMeta.enShort.toLowerCase()}-${cycleSuffix}`,
          title: `MTD Report (${mMeta.reportToken}'${cycleSuffix})`,
          shortLabel: `${mMeta.idShort}'${cycleSuffix}`,
          periodType: "MTD",
          sortOrder: mMeta.month,
          monthTag: mMeta.month,
          totalLabel: "Total",
          cells: JSON.parse(JSON.stringify(template.cells)),
          totals: JSON.parse(JSON.stringify(template.totals)),
        };
      }
      for (const [indId, byEnt] of Object.entries(monthUpdatesForEntities)) {
        if (!targetMtd.cells[indId]) targetMtd.cells[indId] = {};
        for (const [entId, nextCell] of Object.entries(byEnt)) {
          targetMtd.cells[indId][entId] = nextCell;
        }
      }
      for (const ent of currentStore.entities) {
        targetMtd.totals[ent.id] = computeEntityTotalFromCells(
          targetMtd.cells,
          currentStore.indicators,
          ent.id,
          targetMtd.totals?.[ent.id],
        );
      }
      reportsMap.set(targetMtd.id, targetMtd);
    }
  }

  let nextStore: MasterExecutiveSummaryStore = {
    ...currentStore,
    reports: sortExecSummaryReports(Array.from(reportsMap.values())),
  };
  if (affectedQuartersSet.size > 0) {
    nextStore = recalculateQuarterAndYtdFromMtd(nextStore, Array.from(affectedQuartersSet));
  }
  return {
    nextStore,
    syncedCellsCount,
    syncedMonths: Array.from(syncedMonthsSet).sort((a, b) => a - b),
  };
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
        const defColorById = new Map(DEFAULT_EXEC_ENTITIES.map((e) => [e.id, e]));
        const mergedEntities: ExecSummaryEntityDef[] = parsed.entities
          .filter((e) => e.groupName !== "Sambu Group")
          .map((e) => {
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
          reports: sortExecSummaryReports(
            validReports.length > 0 ? validReports : cloneStore(INITIAL_EXEC_SUMMARY_STORE.reports),
          ),
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch {
    // fallback to verified initial store
  }
  const fallback = cloneStore(INITIAL_EXEC_SUMMARY_STORE);
  fallback.reports = sortExecSummaryReports(fallback.reports);
  return fallback;
}

export function saveMasterExecutiveSummary(
  store: MasterExecutiveSummaryStore,
  changeDescription = "Updated Master KPI Executive Summary",
): void {
  const stamped: MasterExecutiveSummaryStore = {
    ...store,
    reports: sortExecSummaryReports(store.reports),
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
      const normalizedRemote = loadMasterExecutiveSummary();
      safeSetLocalJson(MASTER_EXEC_SUMMARY_KEY, normalizedRemote);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(MASTER_EXEC_SUMMARY_UPDATED_EVENT));
      }
      return normalizedRemote;
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
