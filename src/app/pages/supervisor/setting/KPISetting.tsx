// @refresh reset
import React, { useState, useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { useRouteTab } from "../../../utils/useRouteTab";
import {
  loadMasterKpi,
  loadMasterKpiFormats,
  MASTER_KPI_FORMATS_UPDATED_EVENT,
  MASTER_KPI_UPDATED_EVENT,
  type MasterKpiStore,
} from "../../hr/settings/masterKpiStore";
import {
  getActiveUser,
  getGroupCompaniesForUnit,
  getGroupNameForUnit,
  isDirectorRoleOrGrouping,
  loadManagedUsers,
  resolveEffectiveUserGrouping,
  useAuthStore,
  usesDemoSampleData,
  type ManagedUser,
} from "../../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId, submitWorkflowModule } from "../../shared/appraisalWorkflowStore";
import {
  deleteUploadedEvidenceById,
  fetchEmployeeKpiSettingsLive,
  fetchKpiAttachmentsForEmployee,
  mergeKvMapRecord,
  safeGetLocalRaw,
  safeSetLocalJson,
  syncToSupabase,
  uploadEvidenceFileToSupabase,
} from "../../../services/supabaseClient";
import { pushEmployeeNotification } from "../../../store/notificationStore";
import { cancelTargetEditPhase1, getTargetEditRequestForEmployee, KPI_TARGET_EDIT_EVENT, submitTargetEditPhase1, submitTargetEditPhase2, resolveEditRequestApprovers, resolveTargetEditPhase1Approver, resolveTargetEditPhase2Chain, type TargetEditAttachment } from "../../../store/kpiTargetEditStore";
import { DELEGATION_EVENT, getReceivedWorkspaceDelegations, type DelegationAccess } from "../../../store/delegationStore";
import { DelegatedWorkspaceBanner } from "../../../components/approval/DelegatedWorkspaceBanner";
import { ModuleApprovalStatusBar } from "../../../components/ModuleApprovalStatusBar";
import { ApproverNotesHistory } from "../../../components/ApproverNotesHistory";
import { formatTodayDDMMYYYY } from "../../../utils/dateFormat";
import { AlertCircle, Eye, Send, CheckCircle2, Edit3, Plus, Trash2, X, FileEdit, UserCircle2, Paperclip, Lock, Layers, Download } from "lucide-react";
import { toast } from "sonner";
import { CopyKpiFromSourceModal } from "./CopyKpiFromSourceModal";
import { EvidenceViewerModal } from "../../../components/EvidenceViewerModal";
import ExportImportButton from "../../../components/ExportImportButton";
import { DualScrollTableContainer } from "../../../components/DualScrollTableContainer";
import {
  dispatchTableFullscreen,
  getKpiTableScaleClasses,
  KpiTableDisplayControls,
  type KpiTableScale,
} from "../../../components/KpiTableDisplayControls";
import { EXCEL_THEME, exportStyledXLSX, inferSystemCellStyle, parseXLSXMatrix, type StyledExcelCell, type StyledExcelMerge } from "../../../utils/excelUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";

const MONTHS_LIST = ["Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26","Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Color Indicator constants ────────────────────────────────────────────────

const MONTHLY_FLAG_OPTIONS = [
  { value: "100", label: "100%", color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6" },
  { value: "75",  label: "75%",  color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
  { value: "0",   label: "0%",   color: "#111827", bg: "#f9fafb", border: "#d1d5db", dot: "#374151" },
];

const COLOR_BAND_OPTIONS = [
  { value: "95%-100%",   label: "95%-100%",   color: "#16a34a", bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
  { value: "≥80%-<95%",  label: "≥80%-<95%",  color: "#b45309", bg: "#fefce8", border: "#fde047", dot: "#eab308" },
  { value: "<80%",       label: "<80%",        color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
] as const;

const BASELINE_COLOR_OPTIONS = [
  { value: "Blue",  color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6" },
  { value: "Red",   color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
  { value: "Black", color: "#111827", bg: "#f9fafb", border: "#d1d5db", dot: "#374151" },
] as const;


type ColorBandValue = typeof COLOR_BAND_OPTIONS[number]["value"] | "";
type BaselineColorValue = typeof BASELINE_COLOR_OPTIONS[number]["value"] | "";

function colorBandMeta(v: string) {
  return COLOR_BAND_OPTIONS.find((o) => o.value === v);
}
function baselineColorMeta(v: string) {
  return BASELINE_COLOR_OPTIONS.find((o) => o.value === v);
}

function computeColorTarget2026(mt: Record<string, string>, formula: string): string {
  if (formula === "Nilai Akhir") return mt["Dec-26"] ?? "";
  const vals = MONTHS_LIST.map((m) => mt[m]).filter((v) => v && v.length > 0);
  if (vals.length === 0) return "";
  if (formula === "Rata-Rata") {
    const counts: Record<string, number> = {};
    vals.forEach((v) => { counts[v] = (counts[v] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  if (formula === "Jumlah") {
    if (vals.includes("<80%")) return "<80%";
    if (vals.includes("≥80%-<95%")) return "≥80%-<95%";
    return "95%-100%";
  }
  return "";
}

function computeTarget2026(mt: Record<string, string>, formula: string): string {
  if (formula === "Nilai Akhir") {
    return mt["Dec-26"] ?? "";
  }
  const vals = MONTHS_LIST.map((m) => parseFloat(mt[m] ?? "")).filter((v) => !isNaN(v));
  if (vals.length === 0) return "";
  const sum = vals.reduce((s, v) => s + v, 0);
  if (formula === "Jumlah") return String(+sum.toFixed(4).replace(/\.?0+$/, ""));
  if (formula === "Rata-Rata") {
    const avg = sum / vals.length;
    return String(+avg.toFixed(4).replace(/\.?0+$/, ""));
  }
  return "";
}

type IndicatorMode = "numeric" | "color" | "ratio";

const RATIO_OPTIONS = ["10:1", "6:1", "5:1", "4:1", "3:1", "2:1"] as const;

function parseRatioParts(val: string): { pos: number; neg: number } {
  const parts = val.split(":");
  const pos = parseInt(parts[0] ?? "0", 10);
  const neg = parseInt(parts[1] ?? "0", 10);
  return { pos: isNaN(pos) ? 0 : pos, neg: isNaN(neg) ? 0 : neg };
}

function computeRatioTarget2026(mt: Record<string, string>): string {
  // Display mask: show the ratio chosen in Jan (auto-filled to all months)
  const firstVal = MONTHS_LIST.map((k) => mt[k] ?? "").find((v) => v !== "");
  return firstVal ?? "";
}

function computeRatioSumDisplay(mt: Record<string, string>): { totalP: number; totalN: number } {
  let totalP = 0, totalN = 0;
  MONTHS_LIST.forEach((key) => {
    const val = mt[key] ?? "";
    if (!val) return;
    const { pos, neg } = parseRatioParts(val);
    totalP += pos; totalN += neg;
  });
  return { totalP, totalN };
}


// ─── Types ────────────────────────────────────────────────────────────────────

export type Polaritas = "Maximize" | "Minimize" | "Stabilize";
type PageView = "input" | "preview";
type KPITab = "personal" | "department" | "division" | "corporate" | "pak-anton" | "corporate-unit";

export interface KPISetting {
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
  polaritas: Polaritas;
  detailFormula: string;
  keterangan: string;
  monthlyTargets?: Record<string, string>;
  colorIndicator?: boolean;
  indicatorMode?: IndicatorMode;
  ratioPositiveLabel?: string;
  ratioNegativeLabel?: string;
  sectionAlphabet?: string;
  sectionBobot?: string;
  sectionLabel?: string;
  // Corporate KPI extra fields
  scope?: string;
  trackingPeriod?: string;
  coo?: string;
  gmVgmIndustry?: string;
  gmVgmPerkebunan?: string;
  gmAsd?: string;
  gmRstm?: string;
  gmGhs?: string;
  // Row-level cascading type shown in the All KPI table
  cascading?: string;
  // Dynamic cascading map from master (role label → FC/PC/CC)
  cascadingMap?: Record<string, string>;
  // Injected when KPI is cascaded from a parent layer (FC/PC/CC determines editability)
  _cascadeType?: "FC" | "PC" | "CC";
  /** ID baris sumber bila KPI ini hasil copy dari KPI (Group) / KPI (Unit) */
  copiedFromId?: string;
  /** Penanda bahwa baris berasal dari Upload Excel sehingga divalidasi kesesuaian format standarnya secara live */
  _uploadedCheck?: boolean;
}

// ─── Personal KPI data (existing SettingKPIPage data) ─────────────────────────

export const PERSONAL_KPI: KPISetting[] = [
  {
    id: "1", no: "1", section: "A", perspektif: "Finansial",
    kpi: "Net Profit (dalam miliar)",
    satuan: "Rp Miliar /bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Industry", baseline2025: "687", target2026: "750", polaritas: "Maximize",
    detailFormula: "Jumlah laba bersih perusahaan\n\n*Pencapaian = Realisasi / Target", keterangan: "",
    trackingPeriod: "Bulanan",
  },
  {
    id: "2", no: "2", section: "A", perspektif: "Proses",
    kpi: "Fatality Accident",
    satuan: "Kasus /bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja",
    source: "Laporan Komite K3", baseline2025: "1", target2026: "0", polaritas: "Minimize",
    detailFormula: "= Jumlah kasus Kecelakaan kerja yang menyebabkan kematian (RSUP IND + RSUP PKB + ASD + RSTM + GHS)", keterangan: "",
    trackingPeriod: "Bulanan",
  },
  {
    id: "3", no: "3", section: "B", perspektif: "Finansial",
    kpi: "HPP Produksi Energy:\na. Listrik (target: 1.920 Rp/kwh)\nb. Steam (target: 294 Rp/kg)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "20%",
    definisi: "Upaya sistematis untuk menekan biaya bahan baku, tenaga kerja, overhead, dan distribusi agar harga pokok produksi tetap rendah, margin keuntungan terjaga, dan daya saing produk meningkat",
    source: "Laporan Keuangan RSUP Industry", baseline2025: "100%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "= (Realisasi pencapaian listrik + Realisasi pencapaian steam) / 2",
    keterangan: "Baseline:\nListrik: 1,799.77\nSteam: 273.99",
    trackingPeriod: "Bulanan",
  },
  {
    id: "4a", no: "4a", section: "B", perspektif: "Proses",
    kpi: "Efisiensi pemakaian energi dan material:\na. Bahan Bakar - Produksi Steam (Target: 3,22 kg steam/kg bb)\nb. Bahan Bakar - Produksi Listrik (Target: 0,64 kwh/kg bb)\nc. Konsumsi HCL - Proses Demineralisasi (Target: 0,23 Kg/M3)\nd. Konsumsi NaOH - Proses Demineralisasi (Target: 0,11 Kg/M3)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "20%",
    definisi: "Meningkatkan rata-rata efisiensi dalam pemakaian energi dan material berlebih",
    source: "Laporan PWP", baseline2025: "97%", target2026: "100%", polaritas: "Maximize",
    detailFormula: "= (Eff BB Steam + Eff BB Listrik + Penggunaan HCL + Penggunaan NaOH) / 4\n\n*Pemakaian BB (steam) = kg steam/kg bahan bakar (batubara+tempurung)\n**Pemakaian BB (listrik) = kWh/kg bahan bakar\n***Penggunaan HCL = Total HCL (kg) / Volume air (m3)\n****Penggunaan NaOH = Total NaOH (kg)/Volume air (m3)",
    keterangan: "Baseline:\nSteam: —\nListrik: —\nHCL: —\nNaOH: —",
    trackingPeriod: "Bulanan",
  },
  {
    id: "4b", no: "4b", section: "B", perspektif: "Proses",
    kpi: "Pencapaian Index Produktivitas Karyawan:\na. Karyawan Power Plant (PWP) - Steam (Target: 22,43 ton steam/orang)\nb. Karyawan Power Plant (PWP) - Listrik (Target: 2.999 kwh/orang)",
    satuan: "% /bulan", formula: "Rata-Rata", bobot: "15%",
    definisi: "Meningkatkan produktivitas dengan menggunakan kapasitas maksimum sumberdaya dan output bulanan",
    source: "Laporan PWP", baseline2025: "198%", target2026: "100%", polaritas: "Maximize",
    detailFormula: "= (Index produktivitas karyawan PWP - Steam + Index produktivitas karyawan PWP - Listrik) / 2\n\n*Indeks Produktivitas = Total output pekerjaan / Jumlah manday",
    keterangan: "Baseline:\nSteam: 22.3\nListrik: 2,830",
    trackingPeriod: "Bulanan",
  },
  {
    id: "5a", no: "5a", section: "B", perspektif: "Environment, Health & Safety",
    kpi: "Pencapaian Kinerja Terintegrasi: LTI",
    satuan: "hari/tahun", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Rata-rata nilai parameter keselamatan, kesehatan kerja, keamanan pangan, mutu dan lingkungan",
    source: "Laporan Komite K3", baseline2025: "17", target2026: "17", polaritas: "Maximize",
    detailFormula: "Nilai poin LTI", keterangan: "",
    trackingPeriod: "Tahunan",
  },
  {
    id: "5b", no: "5b", section: "B", perspektif: "Environment, Health & Safety",
    kpi: "Regulatory Compliance - Audit Eksternal",
    satuan: "temuan/tahun", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Memenuhi kepatuhan organisasi terhadap regulasi, perizinan, dan persyaratan hukum yang berlaku",
    source: "Laporan QA", baseline2025: "0", target2026: "0", polaritas: "Maximize",
    detailFormula: "Jumlah temuan yang terdapat pada audit eksternal dept PWP (NC)", keterangan: "",
    trackingPeriod: "Tahunan",
  },
  {
    id: "6", no: "6", section: "B", perspektif: "Customer",
    kpi: "Meminimalisasi Risiko Proses\nJumlah Kasus Turbin Trip",
    satuan: "kasus/bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Meminimalisir tingkat risiko untuk seluruh proses yang berada pada scope pekerjaan Dept PWP",
    source: "Laporan PWP", baseline2025: "2", target2026: "2", polaritas: "Minimize",
    detailFormula: "Total kejadian turbin trip per tahun", keterangan: "",
    trackingPeriod: "Bulanan",
  },
  {
    id: "7", no: "7", section: "B", perspektif: "Learning & Growth",
    kpi: "Hard & Softskill Training",
    satuan: "Jumlah", formula: "Nilai Akhir", bobot: "5%",
    definisi: "Mengukur sejauh mana organisasi menjadi tempat kerja yang diminati, dengan menciptakan lingkungan kerja yang mendukung keterlibatan karyawan",
    source: "Laporan HRD", baseline2025: "25", target2026: "25", polaritas: "Maximize",
    detailFormula: "Jumlah pelaksanaan Hard & Softskill Training di dept BLR", keterangan: "",
    trackingPeriod: "Tahunan",
  },
];

// ─── Department KPI (same as HR Setting — Department tab) ─────────────────────


// ─── Division KPI (same as HR Setting — Division tab) ─────────────────────────


// ─── Corporate KPI — KPI Bisnis RSUP Group 2026 ───────────────────────────────

export const CORPORATE_KPI: KPISetting[] = [
  // ── A. Kinerja K3L Terintegrasi (SMK3/HSE) — 15% ─────────────────────────
  {
    id: "c1a", no: "1a", section: "A", perspektif: "Proses",
    kpi: "Fatality Accident",
    satuan: "Kasus/bulan", formula: "Jumlah", bobot: "5%",
    definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja",
    source: "Laporan Komite K3", baseline2025: "1", target2026: "0", polaritas: "Minimize",
    detailFormula: "Jumlah kasus kecelakaan kerja (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1b", no: "1b", section: "A", perspektif: "Proses",
    kpi: "Lost Time Injury",
    satuan: "Hari/bulan", formula: "Rata-Rata", bobot: "4%",
    definisi: "Cedera akibat kecelakaan kerja yang menyebabkan pekerja tidak dapat bekerja setidaknya satu shift penuh setelah kejadian tersebut",
    source: "Laporan Komite K3", baseline2025: "5.873", target2026: "6.948", polaritas: "Minimize",
    detailFormula: "Jumlah hari hilang akibat LTI (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1c", no: "1c", section: "A", perspektif: "Proses",
    kpi: "Fire Accident",
    satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%",
    definisi: "Jumlah kebakaran bangunan",
    source: "Laporan Komite K3", baseline2025: "0", target2026: "0", polaritas: "Minimize",
    detailFormula: "Jumlah kasus kebakaran bangunan (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1d", no: "1d", section: "A", perspektif: "Proses",
    kpi: "Karhutla",
    satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%",
    definisi: "Jumlah kebakaran hutan",
    source: "Laporan Komite K3", baseline2025: "0", target2026: "0", polaritas: "Minimize",
    detailFormula: "Jumlah kasus kebakaran hutan (RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Perkebunan, ASD, RSTM, GHS", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1e", no: "1e", section: "A", perspektif: "Proses",
    kpi: "Proper Result",
    satuan: "%/Kategori", formula: "Nilai Akhir", bobot: "2%",
    definisi: "Hasil penilaian PROPER (Program Penilaian Peringkat Kinerja Perusahaan dalam Pengelolaan Lingkungan Hidup) yang dikeluarkan oleh KLHK",
    source: "Laporan LH", baseline2025: "Biru", target2026: "Biru", polaritas: "Maximize",
    detailFormula: "Pencapaian nilai PROPER di RSUP perkebunan + RSTM + GHS; Biru=100%, Merah=75%, Hitam=0%",
    keterangan: "",
    scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1f", no: "1f", section: "A", perspektif: "Proses",
    kpi: "GHG Reduction",
    satuan: "tonCo2-eq/bulan", formula: "Rata-Rata", bobot: "0%",
    definisi: "Pengurangan emisi gas rumah kaca yang diukur sebagai indikator kinerja organisasi",
    source: "Laporan Komite Energy", baseline2025: "230.973", target2026: "219.652", polaritas: "Minimize",
    detailFormula: "Jumlah Emisi Gas Rumah Kaca (Boiler Biomasa + PLTD + PLTU + Dapur Arang + Alat Berat + Freon)",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c1g", no: "1g", section: "A", perspektif: "Proses",
    kpi: "SIMATAG - 0.4m Report",
    satuan: "%/bulan", formula: "Rata-rata", bobot: "0%",
    definisi: "Tingkat kepatuhan unit kerja dalam menyusun dan menyampaikan laporan pemantauan muka air tanah gambut dengan ambang batas 0,4 meter sesuai standar format dan jadwal yang ditetapkan",
    source: "Laporan LH", baseline2025: "100%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "Rata-rata pencapaian tingkat kepatuhan laporan RSUP Perkebunan + RSTM + GHS",
    keterangan: "",
    scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  // ── B. Finansial — 40% (Sub: Finansial & Cost 25% + Cost Control 15%) ─────
  {
    id: "c2a", no: "2a", section: "B", perspektif: "Finansial",
    kpi: "Net Profit (Miliar)",
    satuan: "Rp/bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaran biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Group", baseline2025: "687,3", target2026: "750,0", polaritas: "Maximize",
    detailFormula: "Jumlah laba bersih perusahaan",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "FC", gmAsd: "FC", gmRstm: "FC", gmGhs: "FC",
  },
  {
    id: "c2b", no: "2b", section: "B", perspektif: "Finansial",
    kpi: "ROA (Return on Assets)",
    satuan: "%/bulan", formula: "Rata-Rata", bobot: "5%",
    definisi: "Rasio keuangan yang mengukur kemampuan perusahaan menghasilkan laba bersih dari total aset yang dimiliki",
    source: "Laporan Keuangan RSUP Industry", baseline2025: "17,17%", target2026: "15%", polaritas: "Maximize",
    detailFormula: "Laba bersih / Total Asset x 100%",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c2c", no: "2c", section: "B", perspektif: "Finansial",
    kpi: "EBITDA (Miliar)",
    satuan: "Rp/bulan", formula: "Jumlah", bobot: "10%",
    definisi: "Laba Bersih Perusahaan sebelum dikurangi pengeluaran biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Group", baseline2025: "1.017", target2026: "1.050", polaritas: "Maximize",
    detailFormula: "Total EBITDA perusahaan",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c3a", no: "3a", section: "B", perspektif: "Finansial",
    kpi: "Overhead Cost (000)",
    satuan: "Rp/bulan", formula: "Rata-rata", bobot: "3%",
    definisi: "Biaya tidak langsung yang diperlukan untuk menjalankan operasi perusahaan, tetapi tidak dapat ditelusuri langsung ke produk, layanan, atau aktivitas tertentu",
    source: "Laporan Keuangan RSUP Group", baseline2025: "142.854.218", target2026: "191.286.313", polaritas: "Minimize",
    detailFormula: "Jumlah Overhead cost (RSUP IND + RSUP PKB + RSUP ASD + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c3b", no: "3b", section: "B", perspektif: "Finansial",
    kpi: "Cost Meat Preparation",
    satuan: "Rp/kg WM/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Total biaya yang dikeluarkan untuk mempersiapkan daging kepala (meat preparation) sebelum digunakan dalam proses produksi",
    source: "Laporan Keuangan RSUP Industry (ACC/MPD)", baseline2025: "1.452", target2026: "1.500", polaritas: "Minimize",
    detailFormula: "Rata-rata cost Meat Preparation per bulan",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c3c", no: "3c", section: "B", perspektif: "Finansial",
    kpi: "Cost Utility",
    satuan: "Rp/kg Kelapa/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Biaya operasional seperti biaya listrik, air, gas, energi lainnya (solar), serta biaya perawatan lainnya",
    source: "Laporan Keuangan RSUP Industry (ACC/Utility)", baseline2025: "430", target2026: "472", polaritas: "Minimize",
    detailFormula: "Jumlah cost Utility",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c3d", no: "3d", section: "B", perspektif: "Finansial",
    kpi: "Reject Non Process (Kb-A to B)",
    satuan: "%/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Jumlah kelapa downgrade bukan karena proses produksi, melainkan karena faktor-faktor non-proses seperti kualitas awal, kerusakan fisik, kontaminasi atau kriteria reject lainnya",
    source: "Laporan MPD + RMD", baseline2025: "13,80%", target2026: "7,50%", polaritas: "Minimize",
    detailFormula: "Rata-rata jumlah kelapa reject dari Kb-A ke Kb-B",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c3e", no: "3e", section: "B", perspektif: "Finansial",
    kpi: "HPP Kelapa RSUP Group - Gabungan",
    satuan: "Rp/kg/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Total biaya yang dikeluarkan untuk menghasilkan produk berbasis kelapa, mulai dari bahan baku, tenaga kerja, utilitas, hingga overhead",
    source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "2.849", target2026: "6.794", polaritas: "Minimize",
    detailFormula: "Nilai HPP Kelapa (RSUP PKB + RSTM + GHS)",
    keterangan: "",
    scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c3f", no: "3f", section: "B", perspektif: "Finansial",
    kpi: "HPP Nenas RSUP",
    satuan: "Rp/butir/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Total biaya yang dikeluarkan untuk menghasilkan produk berbasis nenas, mulai dari bahan baku, tenaga kerja, utilitas hingga overhead",
    source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "1.776", target2026: "3.804", polaritas: "Minimize",
    detailFormula: "Nilai HPP Nenas selama periode satu bulan",
    keterangan: "",
    scope: "RSUP Perkebunan", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "", gmGhs: "",
  },
  {
    id: "c3g", no: "3g", section: "B", perspektif: "Finansial",
    kpi: "HPP Bibit",
    satuan: "Rp/bibit/bulan", formula: "Rata-rata", bobot: "2%",
    definisi: "Total biaya yang dikeluarkan untuk menghasilkan bibit, mulai dari bahan baku, tenaga kerja, utilitas, hingga overhead",
    source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "41.764", target2026: "45.000", polaritas: "Minimize",
    detailFormula: "Nilai HPP Bibit selama periode satu bulan",
    keterangan: "",
    scope: "RSUP ASD", trackingPeriod: "Bulanan",
    coo: "", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  // ── C. Produksi — 30% ─────────────────────────────────────────────────────
  {
    id: "c4a", no: "4a", section: "C", perspektif: "Proses",
    kpi: "Coconut Process",
    satuan: "Butir/bulan", formula: "Jumlah", bobot: "3%",
    definisi: "Jumlah kelapa utuh yang berhasil diterima selama periode tertentu",
    source: "Laporan PIC/RMD", baseline2025: "409.930.558", target2026: "460.000.000", polaritas: "Maximize",
    detailFormula: "Total kelapa yang berhasil diterima dalam setiap periode",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "CC", gmGhs: "CC",
  },
  {
    id: "c4b", no: "4b", section: "C", perspektif: "Proses",
    kpi: "Efficiency White Meat",
    satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%",
    definisi: "Efisiensi hasil white meat yang diperoleh dari proses pengolahan kelapa dibandingkan dengan total input kelapa",
    source: "Laporan MPD", baseline2025: "0,31", target2026: "0,31", polaritas: "Maximize",
    detailFormula: "Total output white meat / Total olah kelapa utuh",
    keterangan: "",
    scope: "MPD", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c4c", no: "4c", section: "C", perspektif: "Proses",
    kpi: "Efficiency Coconut Water",
    satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%",
    definisi: "Efisiensi perolehan coconut water dari proses pengolahan kelapa",
    source: "Laporan MPD", baseline2025: "0,23", target2026: "0,26", polaritas: "Maximize",
    detailFormula: "Total output coconut water / Total olah kelapa utuh",
    keterangan: "",
    scope: "MPD", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c4d", no: "4d", section: "C", perspektif: "Proses",
    kpi: "Efficiency Santan",
    satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%",
    definisi: "Tingkat efisiensi proses produksi santan dibandingkan dengan target atau standar hasil yang ditetapkan",
    source: "Laporan WCC", baseline2025: "79,28", target2026: "79,28", polaritas: "Maximize",
    detailFormula: "Total actual produksi santan / Target",
    keterangan: "",
    scope: "WCC", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c5a", no: "5a", section: "C", perspektif: "Proses",
    kpi: "Pineapple Process",
    satuan: "pcs/bulan", formula: "Jumlah", bobot: "3%",
    definisi: "Jumlah buah nanas (butir) yang berhasil diterima selama periode tertentu",
    source: "Laporan PJD/RMR", baseline2025: "12.952.614", target2026: "17.270.906", polaritas: "Maximize",
    detailFormula: "Total nenas yang berhasil diterima dalam setiap periode",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "", gmGhs: "",
  },
  {
    id: "c5b", no: "5b", section: "C", perspektif: "Proses",
    kpi: "Efficiency Pineapple Meat (PSP+PJC)",
    satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%",
    definisi: "Tingkat efisiensi proses produksi santan dibandingkan dengan target atau standar hasil yang ditetapkan",
    source: "Laporan PSP + PJC", baseline2025: "52,76", target2026: "52,95", polaritas: "Maximize",
    detailFormula: "Rata-rata efficiency pineapple meat (PSP & PJC)",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c6a", no: "6a", section: "C", perspektif: "Proses",
    kpi: "Coconut Production (Grade A+B)",
    satuan: "kg/Bulan", formula: "Jumlah", bobot: "3%",
    definisi: "Total produksi atau panen kelapa Grade A dan B sesuai target yang direncanakan",
    source: "Laporan Grade", baseline2025: "15.552.425", target2026: "19.868.034", polaritas: "Maximize",
    detailFormula: "Jumlah panen kelapa Grade A dan B / Target panen kelapa",
    keterangan: "",
    scope: "RSUP Perkebunan, GHS, RSTM", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c6b", no: "6b", section: "C", perspektif: "Proses",
    kpi: "Pineapple Production (Grade N1-N5)",
    satuan: "butir/Bulan", formula: "Jumlah", bobot: "3%",
    definisi: "Total produksi atau panen nanas Grade N1 sampai N5 sesuai target yang direncanakan",
    source: "Laporan Penjualan", baseline2025: "10.659.453", target2026: "13.168.567", polaritas: "Maximize",
    detailFormula: "Jumlah Panen Nanas Grade N1-N5 / target panen nenas",
    keterangan: "",
    scope: "RSUP Perkebunan", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c7", no: "7", section: "C", perspektif: "Proses",
    kpi: "Replanting RSUP PKB, ASD dan GHS",
    satuan: "ha/bulan", formula: "Rata-Rata", bobot: "3%",
    definisi: "Luas area kelapa yang telah di replanting sesuai target yang direncanakan",
    source: "Laporan RSUP PKB, ASD, GHS", baseline2025: "1.226,50", target2026: "2.473,20", polaritas: "Maximize",
    detailFormula: "Realisasi luas area yang telah di replanting / Target area replanting",
    keterangan: "",
    scope: "RSUP Perkebunan, RSUP ASD, GHS", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "CC", gmGhs: "CC",
  },
  {
    id: "c8", no: "8", section: "C", perspektif: "Proses",
    kpi: "Coconut Fertilizer Application (TM & TBM)",
    satuan: "kg/Bulan", formula: "Rata-rata", bobot: "3%",
    definisi: "Tingkat realisasi pemupukan kelapa sesuai standar direkomendasikan oleh ASD",
    source: "Laporan ASD", baseline2025: "N/A", target2026: "4.610.094", polaritas: "Maximize",
    detailFormula: "Realisasi area pemupukan kelapa yang berhasil dilakukan / Target rekomendasi dari ASD",
    keterangan: "",
    scope: "RSUP Perkebunan", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  // ── D. Be Employer of Choices — 9% ────────────────────────────────────────
  {
    id: "c9a", no: "9a", section: "D", perspektif: "Learning & Growth",
    kpi: "Employee Turn Over",
    satuan: "Jumlah", formula: "Nilai Akhir", bobot: "3%",
    definisi: "Jumlah karyawan keluar dibandingkan total karyawan aktif dalam periode tertentu",
    source: "Laporan HRD", baseline2025: "937", target2026: "837", polaritas: "Minimize",
    detailFormula: "Jumlah karyawan keluar pada periode tertentu",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "FC", gmAsd: "FC", gmRstm: "FC", gmGhs: "FC",
  },
  {
    id: "c9b", no: "9b", section: "D", perspektif: "Learning & Growth",
    kpi: "Employee Engagement Score",
    satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "2%",
    definisi: "Mengukur tingkat keterikatan emosional, komitmen, motivasi, dan kepuasan karyawan terhadap pekerjaan dan organisasi",
    source: "Laporan HRD", baseline2025: "83%", target2026: "84%", polaritas: "Maximize",
    detailFormula: "(Jumlah skor aktual / jumlah skor maksimal) x 100%; Jumlah skor maksimal = jumlah pertanyaan x skor tertinggi x jumlah responden",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c9c", no: "9c", section: "D", perspektif: "Learning & Growth",
    kpi: "MT For Industry & Plantations",
    satuan: "Batch", formula: "Nilai Akhir", bobot: "2%",
    definisi: "Jumlah Batch TMT yang berhasil dijalankan dalam satu tahun",
    source: "Laporan HRD", baseline2025: "5", target2026: "6", polaritas: "Maximize",
    detailFormula: "Jumlah MT Perkebunan + Jumlah MT Industri",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c9d", no: "9d", section: "D", perspektif: "Learning & Growth",
    kpi: "Hard & Soft Skill Training",
    satuan: "Jumlah", formula: "Nilai Akhir", bobot: "2%",
    definisi: "Jumlah training yang dilaksanakan dalam satu tahun",
    source: "Laporan HRD", baseline2025: "1.758", target2026: "1.722", polaritas: "Maximize",
    detailFormula: "Jumlah Training Perkebunan + Jumlah Training Industri",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  // ── E. Be Partner of Choices — 6% ─────────────────────────────────────────
  {
    id: "c10a", no: "10a", section: "E", perspektif: "Customer",
    kpi: "Customer Complain",
    satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%",
    definisi: "Jumlah kasus ketidakpuasan pelanggan terhadap produk, layanan, atau pengalaman yang diterima konsumen",
    source: "Laporan QA", baseline2025: "11", target2026: "8", polaritas: "Minimize",
    detailFormula: "Jumlah complaint dari pelanggan yang diterima perusahaan",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c10b", no: "10b", section: "E", perspektif: "Customer",
    kpi: "Customer Incidents >50jt",
    satuan: "Jumlah", formula: "Jumlah", bobot: "2%",
    definisi: "Jumlah insiden pelanggan yang berdampak finansial besar (di atas Rp50 juta) dalam periode tertentu",
    source: "Laporan QA", baseline2025: "1", target2026: "0", polaritas: "Minimize",
    detailFormula: "Jumlah Customer Incidents dengan nilai kerugian > Rp50.000.000",
    keterangan: "",
    scope: "RSUP Industry", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c11", no: "11", section: "E", perspektif: "Customer",
    kpi: "3rd Party Certification",
    satuan: "Nilai Akhir", formula: "Nilai Akhir", bobot: "2%",
    definisi: "Tingkat kepatuhan dan keberlangsungan sertifikasi dari pihak ketiga yang relevan dengan bisnis perusahaan (seperti ISO, dll)",
    source: "Laporan QS", baseline2025: "100%", target2026: "100%", polaritas: "Maximize",
    detailFormula: "Jumlah sertifikasi Perusahaan ≥ Jumlah sertifikasi Industri; Pencapaian = Jumlah Sertifikasi aktif / Jumlah Sertifikasi yang Dipersyaratkan",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c12a", no: "12a", section: "E", perspektif: "Customer",
    kpi: "Pro-Active CSR Program linked to Business Growth",
    satuan: "Jumlah", formula: "Nilai Akhir", bobot: "0%",
    definisi: "Persentase program CSR yang secara langsung mendukung pertumbuhan bisnis perusahaan (branding, market access, revenue, dll)",
    source: "Laporan TRRA", baseline2025: "5", target2026: "4", polaritas: "Maximize",
    detailFormula: "Jumlah Perusahaan ≥ Jumlah Program CSR yang Terkait Business Growth / Total Program CSR",
    keterangan: "",
    scope: "RSUP Perkebunan, GHS, RSTM", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c12b", no: "12b", section: "E", perspektif: "Customer",
    kpi: "10:1 Ratio Positive Over Negative Media",
    satuan: "Konten/Berita", formula: "Jumlah", bobot: "0%",
    definisi: "Perbandingan jumlah pemberitaan media positif dibandingkan pemberitaan negatif tentang perusahaan",
    source: "Laporan Comcom", baseline2025: "6:1", target2026: "6:1", polaritas: "Maximize",
    detailFormula: "Jumlah Perusahaan ≥ Jumlah Berita Positif / Jumlah Berita Negatif",
    keterangan: "",
    scope: "RSUP Group, RSTM", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  // ── F. Regulatory Compliance — 0% ─────────────────────────────────────────
  {
    id: "c13a", no: "13a", section: "F", perspektif: "Proses",
    kpi: "Completed Process HGU RSUP PKB",
    satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%",
    definisi: "Persentase penyelesaian proses HGU RSUP PKB sesuai tahapan dan target yang ditentukan dalam satu tahun",
    source: "Laporan Legal", baseline2025: "100%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "Total tahapan HGU RSUP PKB yang selesai / Total tahapan HGU RSUP PKB yang Ditargetkan",
    keterangan: "",
    scope: "RSUP PKB", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c13b", no: "13b", section: "F", perspektif: "Proses",
    kpi: "Completed Process HGU RSTM",
    satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%",
    definisi: "Persentase penyelesaian proses pengerjaan HGU RSTM 03 sampai tahap akhir dalam periode satu tahun",
    source: "Laporan Legal", baseline2025: "100%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "Total tahapan HGU RSTM 03 yang selesai / Total tahapan HGU RSTM 03 yang Ditargetkan",
    keterangan: "",
    scope: "RSTM", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "PC", gmGhs: "",
  },
  {
    id: "c14", no: "14", section: "F", perspektif: "Proses",
    kpi: "SIA/SIO/SILO Compliance",
    satuan: "%/Tahun", formula: "Jumlah", bobot: "0%",
    definisi: "Tingkat kepatuhan kepemilikan dan keaktifan SIA, SIO, dan SILO yang wajib dimiliki perusahaan selama satu tahun",
    source: "Laporan SAP", baseline2025: "51%", target2026: "85%", polaritas: "Minimize",
    detailFormula: "Jumlah SIA/SIO/SILO yang valid dan aktif / Total SIA/SIO/SILO yang Ditargetkan",
    keterangan: "",
    scope: "RSUP Group", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC",
  },
  {
    id: "c15a", no: "15a", section: "F", perspektif: "Proses",
    kpi: "Completed Proses Pelepasan HGU GHS 1",
    satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "0%",
    definisi: "Persentase penyelesaian pelepasan HGU GHS 01 sesuai target dan rencana tahunan",
    source: "Laporan Pertanahan IUP", baseline2025: "75%", target2026: "75%", polaritas: "Minimize",
    detailFormula: "Tahapan pelepasan HGU GHS 01 yang selesai / Total tahapan pelepasan HGU GHS 01",
    keterangan: "",
    scope: "GHS", trackingPeriod: "Tahunan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "PC",
  },
  {
    id: "c15b", no: "15b", section: "F", perspektif: "Proses",
    kpi: "Completed Proses HGU IUP",
    satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "0%",
    definisi: "Persentase penyelesaian pengurusan IUP dalam lingkup RSUP Perkebunan",
    source: "Laporan Pertanahan IUP", baseline2025: "0%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "Total IUP yang Wajib dimiliki / Total IUP Wajib",
    keterangan: "",
    scope: "RSUP Perkebunan", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "", gmRstm: "", gmGhs: "",
  },
  {
    id: "c15c", no: "15c", section: "F", perspektif: "Proses",
    kpi: "Completed Proses Hak Guna Usaha seluas 12.946 Ha",
    satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%",
    definisi: "Persentase penyelesaian pengurusan Hak Guna Usaha seluas 12.946 Ha",
    source: "Laporan Legal", baseline2025: "40%", target2026: "100%", polaritas: "Minimize",
    detailFormula: "Realisasi proses / progress penyelesaian permohonan HGU",
    keterangan: "",
    scope: "RSTM", trackingPeriod: "Bulanan",
    coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "PC", gmGhs: "",
  },
];

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Master KPI hook ─────────────────────────────────────────────────────────

function useMasterKpi(): MasterKpiStore {
  const [master, setMaster] = useState<MasterKpiStore>(() => loadMasterKpi());
  useEffect(() => {
    const refresh = () => setMaster(loadMasterKpi());
    window.addEventListener("storage", refresh);
    window.addEventListener(MASTER_KPI_UPDATED_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(MASTER_KPI_UPDATED_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);
  return master;
}

// ─── Section alphabet options (A – L) ────────────────────────────────────────


const PERSPEKTIF_OPTIONS = ["Finansial", "Proses", "Environment, Health & Safety", "Customer", "Learning & Growth"];
const FORMULA_OPTIONS = ["Jumlah", "Rata-Rata", "Nilai Akhir"];

const SATUAN_UNIT_OPTIONS = ["%", "Temuan", "Hari", "Kasus", "Rp Juta", "Rp Miliar", "Jumlah"];
const SATUAN_PERIODE_OPTIONS = ["Bulan", "Triwulan", "Tahun"];

const BOBOT_OPTIONS = [
  "0%", "1%", "2%", "3%", "4%",
  "5%", "10%", "15%", "20%", "25%",
  "30%", "35%", "40%", "45%", "50%",
];

const SECTION_BOBOT_OPTIONS = ["0%","1%","2%","3%","4%","5%","6%","7%","8%","9%","10%","12%","15%","20%","25%","30%","35%","40%","45%","50%","55%","60%","65%"];

const POLARITAS_OPTIONS: { value: Polaritas; label: string }[] = [
  { value: "Maximize",  label: "Maximize"  },
  { value: "Minimize",  label: "Minimize"  },
  { value: "Stabilize", label: "Stabilize" },
];

const PERSP_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

const W_NO = 52;
const W_PERSP = 140;
const W_KPI = 270;
const W_AKSI = 88;
const inputCls = "text-sm bg-white border border-slate-200/90 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] focus:ring-2 focus:ring-[#1A284F]/10 w-full shadow-2xs transition-all";

// ─── Shared field wrapper ─────────────────────────────────────────────────────

type FieldTone = "indigo" | "sky" | "violet" | "emerald" | "amber" | "teal" | "rose";

const FIELD_TONE_STYLES: Record<FieldTone, { wrap: string; dot: string; label: string }> = {
  indigo:  { wrap: "bg-gradient-to-br from-indigo-50/70 via-white to-indigo-50/30 border-indigo-200/80 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10", dot: "bg-indigo-500", label: "text-indigo-950/85" },
  sky:     { wrap: "bg-gradient-to-br from-sky-50/70 via-white to-sky-50/30 border-sky-200/80 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/10", dot: "bg-sky-500", label: "text-sky-950/85" },
  violet:  { wrap: "bg-gradient-to-br from-violet-50/65 via-white to-violet-50/25 border-violet-200/80 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/10", dot: "bg-violet-500", label: "text-violet-950/85" },
  emerald: { wrap: "bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/25 border-emerald-200/80 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/10", dot: "bg-emerald-500", label: "text-emerald-950/85" },
  amber:   { wrap: "bg-gradient-to-br from-amber-50/70 via-white to-amber-50/25 border-amber-200/80 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-500/10", dot: "bg-amber-500", label: "text-amber-950/85" },
  teal:    { wrap: "bg-gradient-to-br from-teal-50/70 via-white to-teal-50/25 border-teal-200/80 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-500/10", dot: "bg-teal-500", label: "text-teal-950/85" },
  rose:    { wrap: "bg-gradient-to-br from-rose-50/60 via-white to-rose-50/20 border-rose-200/80 focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-500/10", dot: "bg-rose-500", label: "text-rose-950/85" },
};

function inferFieldTone(label: string): FieldTone {
  const l = label.toLowerCase();
  if (l.includes("bobot")) return "emerald";
  if (l.includes("baseline") || l.includes("target")) return "amber";
  if (l.includes("formula") || l.includes("polaritas") || l.includes("periode")) return "violet";
  if (l.includes("source") || l.includes("keterangan") || l.includes("cascad") || l.includes("scope")) return "teal";
  if (l.includes("kpi") || l.includes("definisi")) return "sky";
  return "indigo";
}

function Field({ label, tone, children }: { label: string; tone?: FieldTone; children: React.ReactNode }) {
  const t = FIELD_TONE_STYLES[tone ?? inferFieldTone(label)];
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3.5 transition-all shadow-2xs ${t.wrap}`}>
      <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${t.label}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
        <span>{label}</span>
      </label>
      {children}
    </div>
  );
}

function SatuanField({ value, onChange, unitOptions, periodeOptions }: {
  value: string; onChange: (v: string) => void;
  unitOptions?: string[]; periodeOptions?: string[];
}) {
  const sep = value.indexOf("/");
  const unit   = sep >= 0 ? value.slice(0, sep).trim() : value.trim();
  const periode = sep >= 0 ? value.slice(sep + 1).trim() : "";

  const combine = (u: string, p: string) => onChange(u && p ? `${u}/${p}` : u ? u : p ? `/${p}` : "");
  const baseUOpts = unitOptions ?? SATUAN_UNIT_OPTIONS;
  const uOpts = unit && !baseUOpts.includes(unit) ? [unit, ...baseUOpts] : baseUOpts;
  const basePOpts = (periodeOptions ?? SATUAN_PERIODE_OPTIONS).filter((p) => p.toLowerCase() !== "hari");
  const pOpts = periode && !basePOpts.includes(periode) ? [periode, ...basePOpts] : basePOpts;

  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3.5 transition-all shadow-2xs ${FIELD_TONE_STYLES.violet.wrap}`}>
      <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${FIELD_TONE_STYLES.violet.label}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${FIELD_TONE_STYLES.violet.dot}`} />
        <span>Satuan *</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={unit}
          onChange={(e) => combine(e.target.value, periode)}
          className={inputCls}
        >
          <option value="">— Satuan —</option>
          {uOpts.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={periode}
          onChange={(e) => combine(unit, e.target.value)}
          className={inputCls}
        >
          <option value="">— Periode —</option>
          {pOpts.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Bobot validation ────────────────────────────────────────────────────────

const SECTION_BOBOT_LIMIT: Record<string, number> = { A: 20, B: 80 };

function parsePctNum(val?: string | number | null): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val ?? "").replace("%", "").replace(",", ".").trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPctNum(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Membangun daftar pilihan dropdown bobot ("1%", "2%", ... s/d batas sisa kuota `maxPct`)
 * sehingga hanya memunculkan angka sisa yang valid dan tidak melebihi batas kuota.
 */
function buildRemainingBobotOptions(
  minPct: number,
  maxPct: number,
  currentVal?: string,
  allowZero = false,
): string[] {
  const safeMax = Math.max(0, Math.floor(maxPct + 1e-6));
  const safeMin = Math.max(allowZero ? 0 : 1, Math.ceil(minPct - 1e-6));
  const numSet = new Set<number>();
  if (allowZero && minPct <= 1e-6) {
    numSet.add(0);
  }
  for (let v = safeMin; v <= safeMax; v += 1) {
    if (v >= 0 && v <= safeMax) numSet.add(v);
  }
  // Jika maxPct memiliki pecahan desimal (mis. 7.5%), sertakan nilai batas sisa persisnya
  const roundedMax = Math.round(maxPct * 100) / 100;
  if (roundedMax > 0 && roundedMax >= minPct - 1e-6) {
    numSet.add(roundedMax);
  }
  if (currentVal !== undefined && currentVal !== "") {
    const curNum = Math.round(parsePctNum(currentVal) * 100) / 100;
    if (curNum >= (allowZero ? 0 : Math.min(safeMin, curNum)) && curNum <= roundedMax + 1e-6) {
      numSet.add(curNum);
    }
  }
  return Array.from(numSet)
    .sort((a, b) => a - b)
    .map((n) => `${formatPctNum(n)}%`);
}

function resolveEffectiveSectionBobotNum(
  items: KPISetting[],
  sec: string,
  isCorporate: boolean,
  editedSectionBobots?: Record<string, string>,
): number {
  const edited = editedSectionBobots?.[sec];
  if (edited !== undefined && edited !== "") {
    return parsePctNum(edited);
  }
  const secRows = items.filter((i) => i.section === sec);
  const explicit = secRows.find((i) => i.sectionBobot !== undefined && i.sectionBobot !== "")?.sectionBobot;
  if (explicit !== undefined && explicit !== "") {
    return parsePctNum(explicit);
  }
  if (isCorporate) {
    const metaBobot = (CORP_SECTION_META as Record<string, { bobot?: string }>)[sec]?.bobot;
    if (metaBobot !== undefined && metaBobot !== "") {
      return parsePctNum(metaBobot);
    }
  } else if (SECTION_BOBOT_LIMIT[sec] !== undefined) {
    return SECTION_BOBOT_LIMIT[sec];
  }
  return secRows.reduce((sum, i) => sum + parsePctNum(i.bobot), 0);
}

function calcAllSectionsBobotSum(
  items: KPISetting[],
  isCorporate: boolean,
  editedSectionBobots?: Record<string, string>,
  excludeSection?: string,
): number {
  const uniqueSecs = Array.from(new Set(items.map((i) => i.section).filter(Boolean)));
  let sum = 0;
  for (const sec of uniqueSecs) {
    if (excludeSection && sec === excludeSection) continue;
    sum += resolveEffectiveSectionBobotNum(items, sec, isCorporate, editedSectionBobots);
  }
  return Math.round(sum * 100) / 100;
}

function normalizeKpiTitleKey(kpiText?: string): string {
  return String(kpiText ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findDuplicateKpiTitleIds(items: KPISetting[]): Set<string> {
  const byTitle = new Map<string, string[]>();
  for (const item of items) {
    const key = normalizeKpiTitleKey(item.kpi);
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push(item.id);
    byTitle.set(key, list);
  }
  const dupIds = new Set<string>();
  for (const ids of byTitle.values()) {
    if (ids.length > 1) {
      ids.forEach((id) => dupIds.add(id));
    }
  }
  return dupIds;
}

function evaluateKpiSettingSubmitStatus(
  items: KPISetting[],
  isCorporate: boolean,
  editedSectionBobots?: Record<string, string>,
): { canSubmit: boolean; totalSectionBobot: number; totalItemBobot: number; reasons: string[] } {
  if (items.length === 0) {
    return {
      canSubmit: false,
      totalSectionBobot: 0,
      totalItemBobot: 0,
      reasons: ["Belum ada KPI. Tambahkan KPI terlebih dahulu hingga Total Bobot mencapai 100%."],
    };
  }
  const reasons: string[] = [];
  const dupIds = findDuplicateKpiTitleIds(items);
  if (dupIds.size > 0) {
    reasons.push("judul KPI sama, pastikan tidak ada judul KPI yang sama");
  }
  const totalSectionBobot = calcAllSectionsBobotSum(items, isCorporate, editedSectionBobots);
  const totalItemBobot = Math.round(items.reduce((s, i) => s + parsePctNum(i.bobot), 0) * 100) / 100;

  if (Math.round(totalSectionBobot * 100) !== 10000) {
    const diff = Math.abs(100 - totalSectionBobot);
    reasons.push(
      totalSectionBobot < 100
        ? `Total bobot semua Section saat ini ${formatPctNum(totalSectionBobot)}% (kurang ${formatPctNum(diff)}% dari 100%).`
        : `Total bobot semua Section saat ini ${formatPctNum(totalSectionBobot)}% (melebihi 100% sebesar ${formatPctNum(diff)}%).`,
    );
  }

  const uniqueSecs = Array.from(new Set(items.map((i) => i.section).filter(Boolean))).sort();
  for (const sec of uniqueSecs) {
    const secLimit = resolveEffectiveSectionBobotNum(items, sec, isCorporate, editedSectionBobots);
    const subSum = Math.round(calcSubSectionBobot(items, sec) * 100) / 100;
    if (Math.round(subSum * 100) !== Math.round(secLimit * 100)) {
      reasons.push(
        `Section ${sec}: total bobot Sub Section ${formatPctNum(subSum)}% belum tepat sama dengan bobot Section ${formatPctNum(secLimit)}%.`,
      );
    }
  }

  if (Math.round(totalItemBobot * 100) !== 10000) {
    reasons.push(
      `Total Bobot seluruh KPI saat ini ${formatPctNum(totalItemBobot)}% — wajib tepat 100% sebelum Submit KPI.`,
    );
  }

  return {
    canSubmit: reasons.length === 0,
    totalSectionBobot,
    totalItemBobot,
    reasons,
  };
}

function SubmitKpiGateButton({
  canSubmit,
  reasons,
  onConfirmSubmit,
  size = "md",
}: {
  canSubmit: boolean;
  reasons: string[];
  onConfirmSubmit: () => void;
  size?: "sm" | "md";
}) {
  const [tipOpen, setTipOpen] = useState(false);
  const isSm = size === "sm";

  if (canSubmit) {
    return (
      <button
        type="button"
        onClick={onConfirmSubmit}
        className={`flex items-center gap-1.5 rounded-lg font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors ${
          isSm ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
        }`}
      >
        <Send className={isSm ? "w-3.5 h-3.5" : "w-4 h-4"} /> Submit KPI
      </button>
    );
  }

  return (
    <Tooltip open={tipOpen} onOpenChange={setTipOpen}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="button"
          aria-disabled="true"
          onMouseEnter={() => setTipOpen(true)}
          onMouseLeave={() => setTipOpen(false)}
          onClick={(e) => {
            e.preventDefault();
            setTipOpen((prev) => !prev);
          }}
          className="inline-flex outline-none"
        >
          <span
            className={`flex items-center gap-1.5 rounded-lg font-semibold bg-[#1A284F] text-white opacity-45 cursor-not-allowed select-none ${
              isSm ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
            }`}
          >
            <Send className={isSm ? "w-3.5 h-3.5" : "w-4 h-4"} /> Submit KPI
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="max-w-sm bg-[#1A284F] text-white p-3.5 rounded-xl shadow-xl z-[70]">
        <p className="text-xs font-bold mb-1.5 text-amber-300">Belum dapat Submit KPI Setting:</p>
        <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed text-white/95">
          {reasons.map((r, idx) => (
            <li key={idx}>{r}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function calcSectionBobot(items: KPISetting[], section: string, excludeId?: string): number {
  return items
    .filter((i) => i.section === section && i.id !== excludeId)
    .reduce((sum, i) => sum + parsePctNum(i.bobot), 0);
}

function calcTotalBobot(items: KPISetting[], excludeId?: string): number {
  return items
    .filter((i) => i.id !== excludeId)
    .reduce((sum, i) => sum + parsePctNum(i.bobot), 0);
}

// Sum of unique sectionBobots across all sections (for corporate/division KPIs)
function calcTotalSectionBobot(items: KPISetting[], excludeSection?: string): number {
  return calcAllSectionsBobotSum(items, true, undefined, excludeSection);
}

// Sum of KPI bobots within a section (for sub-section validation)
function calcSubSectionBobot(items: KPISetting[], section: string, excludeId?: string): number {
  return items
    .filter((i) => i.section === section && i.id !== excludeId)
    .reduce((sum, i) => sum + parsePctNum(i.bobot), 0);
}

type BobotConflictItem = { no: string; label: string; bobot: string };

type BobotViolation =
  | { kind: "global";          totalUsed: number; remaining: number; conflictItems?: BobotConflictItem[] }
  | { kind: "section";         section: string;   remaining: number; conflictItems?: BobotConflictItem[] }
  | { kind: "section_bobot";   totalUsed: number; remaining: number; conflictItems?: BobotConflictItem[] }
  | { kind: "sub_section_bobot"; sectionLabel: string; sectionLimit: number; remaining: number; conflictItems?: BobotConflictItem[] };

function BobotExceededModal({ violation, onClose }: { violation: BobotViolation; onClose: () => void }) {
  const remaining = violation.remaining;

  let headline: React.ReactNode;
  let directionLabel: string;

  if (violation.kind === "global") {
    headline = (
      <>
        <p className="text-gray-700 text-sm font-medium">
          Total bobot seluruh KPI tidak boleh melebihi <span className="text-[#1A284F] font-bold">100%</span>.
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Sudah terpakai: <span className="font-bold text-red-600">{violation.totalUsed.toFixed(0)}%</span>
          {" — "}Sisa tersedia:{" "}
          <span className={`font-bold ${remaining <= 0 ? "text-red-600" : "text-green-600"}`}>{remaining.toFixed(0)}%</span>
        </p>
      </>
    );
    directionLabel = "Kurangi bobot pada salah satu KPI berikut:";
  } else if (violation.kind === "section") {
    const label = violation.section === "A" ? "Objective KPI (Section A)" : violation.section === "B" ? "Functional KPI (Section B)" : `Section ${violation.section}`;
    const limit = SECTION_BOBOT_LIMIT[violation.section] ?? 100;
    headline = (
      <>
        <p className="text-gray-700 text-sm font-medium">
          Bobot melebihi batas <span className="text-[#1A284F] font-bold">{label}</span> (maks. {limit}%).
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Sisa tersedia:{" "}
          <span className={`font-bold ${remaining <= 0 ? "text-red-600" : "text-green-600"}`}>{remaining.toFixed(0)}%</span>
        </p>
      </>
    );
    directionLabel = "Kurangi bobot pada salah satu KPI berikut:";
  } else if (violation.kind === "section_bobot") {
    headline = (
      <>
        <p className="text-gray-700 text-sm font-medium">
          Total <span className="text-[#1A284F] font-bold">Section Bobot</span> tidak boleh melebihi <span className="font-bold">100%</span>.
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Sudah terpakai: <span className="font-bold text-red-600">{violation.totalUsed.toFixed(0)}%</span>
          {" — "}Sisa tersedia:{" "}
          <span className={`font-bold ${remaining <= 0 ? "text-red-600" : "text-green-600"}`}>{remaining.toFixed(0)}%</span>
        </p>
      </>
    );
    directionLabel = "Kurangi Section Bobot pada section berikut:";
  } else {
    headline = (
      <>
        <p className="text-gray-700 text-sm font-medium">
          Total bobot KPI <span className="text-[#1A284F] font-bold">{violation.sectionLabel}</span> tidak boleh melebihi Section Bobot ({violation.sectionLimit}%).
        </p>
        <p className="text-gray-500 text-sm mt-1">
          Sisa tersedia:{" "}
          <span className={`font-bold ${remaining <= 0 ? "text-red-600" : "text-green-600"}`}>{remaining.toFixed(0)}%</span>
        </p>
      </>
    );
    directionLabel = "Kurangi bobot pada salah satu KPI berikut:";
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center px-6 pt-7 pb-5 border-b border-gray-100 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-3">Bobot Melebihi Batas</h3>
          <div className="text-left w-full">{headline}</div>
        </div>

        {/* Conflict items + directions */}
        {violation.conflictItems && violation.conflictItems.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">{directionLabel}</p>
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
              {violation.conflictItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-red-500 mr-1.5">No.{item.no}</span>
                    <span className="text-xs text-gray-700 break-words">{item.label}</span>
                  </div>
                  <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">{item.bobot}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
              Buka <span className="font-semibold text-gray-600">Edit</span> pada KPI yang ingin dikurangi bobotnya, kemudian simpan perubahan.
            </p>
          </div>
        )}

        <div className="px-6 py-4 flex justify-center">
          <button
            onClick={onClose}
            className="px-8 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
          >
            OK, Koreksi Bobot
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm, validateMode = false }: { onCancel: () => void; onConfirm: () => void; validateMode?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">
          {validateMode
            ? "Are you sure you want to submit the KPI Setting for validation?"
            : "Are you sure you want to submit the KPI Setting for approval?"}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose, validateMode = false }: { onClose: () => void; validateMode?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">
          {validateMode
            ? "KPI Setting has been submitted for validation."
            : "KPI Setting has been submitted for approval."}
        </p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Edit Request Modals ─────────────────────────────────────────────────────


function EditRequestModal({ onCancel, onConfirm, owner }: { onCancel: () => void; onConfirm: (reason: string) => void; owner?: ManagedUser }) {
  const resolvedEditApprovers = resolveEditRequestApprovers(owner);
  const EDIT_APPROVERS = resolvedEditApprovers.length > 0 ? resolvedEditApprovers : [{ label: "Approver", name: "Belum ada approver terdaftar", role: "Reg No AP1/AP2 kosong — hubungi HR ICF" }];
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileEdit className="w-4.5 h-4.5 text-amber-600" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h3 className="font-bold text-[#1A284F] text-base leading-tight">Request Edit KPI</h3>
              <p className="text-[11px] text-gray-400">Kirim permintaan edit ke approver</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Approvers */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Request akan dikirim ke</p>
            <div className="flex flex-col gap-2">
              {EDIT_APPROVERS.map((a) => (
                <div key={a.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#1A284F]/5 border border-[#1A284F]/10">
                  <div className="w-8 h-8 rounded-full bg-[#1A284F] flex items-center justify-center shrink-0">
                    <UserCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#1A284F]">{a.name}</p>
                    <p className="text-[10px] text-gray-500">{a.label} · {a.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Alasan Permintaan Edit <span className="text-red-500 normal-case font-normal">*wajib diisi</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tuliskan alasan Anda meminta perubahan pada KPI yang telah disubmit…"
              className="text-sm border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-[#1A284F] resize-none leading-relaxed placeholder:text-gray-400 transition-colors"
            />
            <p className="text-[10px] text-gray-400 text-right">{reason.length} karakter</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason)}
            disabled={!reason.trim()}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Kirim Request
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRequestSuccessModal({ onClose, owner }: { onClose: () => void; owner?: ManagedUser }) {
  const resolvedEditApprovers = resolveEditRequestApprovers(owner);
  const EDIT_APPROVERS = resolvedEditApprovers.length > 0 ? resolvedEditApprovers : [{ label: "Approver", name: "Belum ada approver terdaftar", role: "Reg No AP1/AP2 kosong — hubungi HR ICF" }];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Request Terkirim</h3>
        <p className="text-gray-500 text-sm mb-1">Permintaan edit KPI telah dikirimkan ke</p>
        <div className="flex flex-col gap-1 mb-6">
          {EDIT_APPROVERS.map((a) => (
            <p key={a.label} className="text-[#1A284F] font-semibold text-sm">{a.name} <span className="text-gray-400 font-normal text-xs">({a.label})</span></p>
          ))}
        </div>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Edit Target Request ──────────────────────────────────────────────────────

const CURRENT_MONTH_IDX = new Date().getMonth(); // 6 = July 2026



const TARGET_EDIT_CATEGORIES = ["Faktor Internal", "Faktor Eksternal", "Other"] as const;

// section label for KPI picker
function kpiSectionLabel(section: string): string {
  if (section === "A") return "Objective KPI";
  if (section === "B") return "Functional KPI";
  const meta = (CORP_SECTION_META as Record<string, { label: string } | undefined>)[section];
  return meta?.label ?? `Section ${section}`;
}
function kpiSectionBg(section: string): string {
  if (section === "A") return "bg-blue-50";
  if (section === "B") return "bg-indigo-50";
  const palette = ["bg-violet-50","bg-teal-50","bg-sky-50","bg-cyan-50","bg-fuchsia-50"];
  const idx = section.charCodeAt(0) % palette.length;
  return palette[idx];
}
function kpiSectionText(section: string): string {
  if (section === "A") return "text-blue-700";
  if (section === "B") return "text-indigo-700";
  const palette = ["text-violet-700","text-teal-700","text-sky-700","text-cyan-700","text-fuchsia-700"];
  const idx = section.charCodeAt(0) % palette.length;
  return palette[idx];
}

function EditTargetRequestModal({ items, onCancel, onConfirm, owner }: {
  owner?: ManagedUser;
  items: KPISetting[];

  onCancel: () => void;
  onConfirm: (category: string, reason: string, files: File[], selectedKpis: string[]) => void;
}) {
  const TARGET_EDIT_REQUEST_APPROVER = resolveTargetEditPhase1Approver();
  const TARGET_EDIT_APPROVERS = resolveTargetEditPhase2Chain(owner);
  const [selectedKpis, setSelectedKpis] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggleKpi = (id: string) =>
    setSelectedKpis((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const canSubmit = selectedKpis.length > 0 && category.length > 0 && reason.trim().length > 0;
  const showCategorySection = selectedKpis.length > 0;
  const sampleText = category ? `[${category}] karena ada kendala mesin.` : "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = "";
  };

  const sections = Array.from(new Set(items.map((i) => i.section))).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <FileEdit style={{ width: 18, height: 18 }} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1A284F] text-base leading-tight">Edit [Target] Request</h3>
              <p className="text-[11px] text-gray-400">Pilih KPI, kategori alasan, lalu kirim ke approver</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* 1 — Approval Flow */}
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Alur Approval</p>

            {/* Phase 1 — Edit Request */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
              <div className="px-3 py-1.5 bg-amber-100/70 border-b border-amber-200">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Fase 1 — Edit Request</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Request dikirim ke 1 approver untuk mendapat izin edit target</p>
              </div>
              <div className="px-3 py-2.5 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                  <UserCircle2 className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-[#1A284F]">{TARGET_EDIT_REQUEST_APPROVER.name}</p>
                  <p className="text-[10px] text-gray-500">{TARGET_EDIT_REQUEST_APPROVER.label} · {TARGET_EDIT_REQUEST_APPROVER.role}</p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">1 Approver</span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center gap-2 px-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[9px] font-semibold text-gray-400 whitespace-nowrap">Setelah disetujui → edit target</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Phase 2 — minimized summary */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-blue-100 bg-blue-50/30">
              <div className="flex items-center gap-1 shrink-0">
                {TARGET_EDIT_APPROVERS.map((a, i) => (
                  <div key={a.label} className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-white ${a.label === "Validate" ? "bg-emerald-500" : "bg-[#1A284F]"}`}
                    style={{ marginLeft: i > 0 ? -6 : 0, zIndex: TARGET_EDIT_APPROVERS.length - i }}>
                    {a.label === "Validate" ? "✓" : i + 1}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-blue-700">Fase 2 — Submit Target yang Diedit</p>
                <p className="text-[10px] text-blue-500">{TARGET_EDIT_APPROVERS.map((a) => a.label).join(" → ")}</p>
              </div>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50/60">
              <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <Paperclip className="w-2.5 h-2.5 text-amber-600" />
              </div>
              <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                Siapkan memo dan file pendukung untuk di upload setelah permintaan Edit Target di setujui oleh HR.
              </p>
            </div>
          </div>

          {/* 2 — KPI Picker */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Pilih KPI yang ingin diedit{" "}
              <span className="text-red-500 normal-case font-normal">* wajib pilih</span>
            </p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {sections.map((sec) => {
                const secItems = items.filter((i) => i.section === sec);
                const bg = kpiSectionBg(sec);
                const tc = kpiSectionText(sec);
                return (
                  <React.Fragment key={sec}>
                    <div className={`px-3 py-2 ${bg} border-b border-gray-100`}>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${tc}`}>
                        {sec}. {kpiSectionLabel(sec)}
                      </span>
                    </div>
                    {secItems.map((kpi) => {
                      const checked = selectedKpis.includes(kpi.id);
                      return (
                        <label key={kpi.id}
                          className="flex items-start gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKpi(kpi.id)}
                            className="mt-0.5 accent-[#1A284F] w-3.5 h-3.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-bold text-[#1A284F] mr-1.5">{kpi.no}</span>
                            <span className="text-[11px] text-gray-700">{kpi.kpi.split("\n")[0]}</span>
                          </div>
                        </label>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
            {selectedKpis.length > 0 && (
              <p className="text-[10px] text-[#1A284F] font-semibold">{selectedKpis.length} KPI dipilih</p>
            )}
          </div>

          {/* 3 — Category + Reason — revealed after KPI selected */}
          {showCategorySection && (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  Kategori Alasan <span className="text-red-500 normal-case font-normal">* wajib pilih</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {TARGET_EDIT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        category === cat
                          ? "bg-[#1A284F] text-white border-[#1A284F]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-[#1A284F] hover:text-[#1A284F]"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {category && (
                  <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 mt-0.5">
                    <p className="text-[10px] text-blue-600 font-medium mb-0.5">Contoh format alasan:</p>
                    <p className="text-[11px] text-blue-900 font-bold italic">{sampleText}</p>
                  </div>
                )}
              </div>

              {category && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                    Alasan Permintaan Edit <span className="text-red-500 normal-case font-normal">* wajib diisi</span>
                  </label>
                  <div className="flex items-start rounded-xl border border-gray-200 focus-within:border-[#1A284F] transition-colors overflow-hidden">
                    <span className="shrink-0 text-[11px] font-bold text-[#1A284F] bg-[#1A284F]/5 px-3 py-3 border-r border-gray-200 select-none whitespace-nowrap">
                      [{category}]
                    </span>
                    <textarea
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="karena ada kendala mesin..."
                      className="flex-1 text-sm px-3 py-3 outline-none resize-none leading-relaxed placeholder:text-gray-400 bg-white"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">{reason.length} karakter</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onCancel} className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button
            onClick={() => canSubmit && onConfirm(category, reason, files, selectedKpis)}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Kirim Request
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTargetSuccessModal({ onClose }: { onClose: () => void }) {
  const TARGET_EDIT_REQUEST_APPROVER = resolveTargetEditPhase1Approver();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Request Terkirim</h3>
        <p className="text-gray-500 text-sm mb-3">Permintaan edit target KPI telah dikirimkan ke</p>
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 mb-2 text-left">
          <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
            <UserCircle2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#1A284F]">{TARGET_EDIT_REQUEST_APPROVER.name}</p>
            <p className="text-[11px] text-gray-500">{TARGET_EDIT_REQUEST_APPROVER.label} · {TARGET_EDIT_REQUEST_APPROVER.role}</p>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-6">Setelah disetujui, Anda dapat mengubah target dan submit ulang melalui 4 layer approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Monthly Target Edit Modal ────────────────────────────────────────────────

/**
 * Auto-generate sample monthly targets from a KPI's target2026 and formula,
 * so the edit table always has meaningful data to display.
 *
 * Jumlah  → distribute target evenly across 12 months
 * Rata-Rata → repeat target every month (avg = target)
 * Nilai Akhir → place target in Dec only
 * color / ratio → repeat target value every month
 */
function generateSampleMonthlyTargets(item: KPISetting): Record<string, string> {
  const { target2026: t, formula, indicatorMode } = item;
  const mode = indicatorMode ?? "numeric";
  const fLower = formula.toLowerCase();
  const mt: Record<string, string> = {};

  if (mode === "color") {
    if (t) MONTHS_LIST.forEach((m) => { mt[m] = t; });
  } else if (mode === "ratio") {
    if (t) MONTHS_LIST.forEach((m) => { mt[m] = t; });
  } else {
    if (fLower === "nilai akhir") {
      if (t) mt["Dec-26"] = t;
    } else if (fLower.startsWith("rata")) {
      // Rata-Rata: same value every month so avg = target
      if (t) MONTHS_LIST.forEach((m) => { mt[m] = t; });
    } else {
      // Jumlah: distribute evenly (target / 12)
      const num = parseFloat(t);
      if (!isNaN(num)) {
        const monthly = +(num / 12).toFixed(2);
        MONTHS_LIST.forEach((m) => { mt[m] = String(monthly); });
      }
    }
  }
  return mt;
}

function MonthlyTargetEditModal({ items, selectedKpiIds, phase1Category, phase1Reason, ownerUser, onClose, onSubmitted }: {
  items: KPISetting[];
  selectedKpiIds?: string[];
  phase1Category?: string;
  phase1Reason?: string;
  ownerUser: ManagedUser;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const TARGET_EDIT_APPROVERS = resolveTargetEditPhase2Chain(ownerUser);
  // Show only selected KPIs when a selection exists; otherwise show all
  const visibleItems = selectedKpiIds && selectedKpiIds.length > 0
    ? items.filter((i) => selectedKpiIds.includes(i.id))
    : items;

  const [editItems, setEditItems] = useState<KPISetting[]>(() =>
    visibleItems.map((item) => {
      const hasData = Object.values(item.monthlyTargets ?? {}).some((v) => v && v.length > 0);
      const mt = hasData ? { ...(item.monthlyTargets ?? {}) } : generateSampleMonthlyTargets(item);
      // Compute Target 2026 from the (possibly generated) monthly targets
      const mode = item.indicatorMode ?? "numeric";
      const computed =
        mode === "color" ? computeColorTarget2026(mt, item.formula) :
        mode === "ratio" ? computeRatioTarget2026(mt) :
        computeTarget2026(mt, item.formula);
      return { ...item, monthlyTargets: mt, target2026: computed || item.target2026 };
    })
  );

  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showSubmittedPopup, setShowSubmittedPopup] = useState(false);
  const [submitting, setSubmitting]               = useState(false);
  const [targetSubmitted, setTargetSubmitted]     = useState(false);
  const [ownerComment, setOwnerComment]           = useState("");
  const [supportFiles, setSupportFiles]           = useState<File[]>([]);
  const supportFileRef                            = useRef<HTMLInputElement>(null);

  // Derive sections from visible items
  const sections = Array.from(new Set(editItems.map((i) => i.section))).sort();

  const setMonthTarget = (itemId: string, month: string, val: string) => {
    setEditItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const mt = { ...item.monthlyTargets, [month]: val };
        const mode = item.indicatorMode ?? "numeric";
        const t2026 =
          mode === "color" ? computeColorTarget2026(mt, item.formula) :
          mode === "ratio" ? computeRatioTarget2026(mt) :
          computeTarget2026(mt, item.formula);
        return { ...item, monthlyTargets: mt, target2026: t2026 || item.target2026 };
      })
    );
  };

  const pastMonths = MONTHS_LIST.filter((_, i) => i < CURRENT_MONTH_IDX);
  const editableMonths = MONTHS_LIST.filter((_, i) => i >= CURRENT_MONTH_IDX);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Edit3 style={{ width: 18, height: 18 }} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1A284F] text-base leading-tight">Edit Monthly Target</h3>
              <p className="text-[11px] text-gray-400">
                Bulan Jan–{MONTHS_SHORT[CURRENT_MONTH_IDX - 1]} terkunci (masa lalu). Hanya{" "}
                <span className="font-semibold text-blue-600">{MONTHS_SHORT[CURRENT_MONTH_IDX]}–Des</span> yang dapat diedit. Target 2026 otomatis diperbarui.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-gray-400" /> Terkunci</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Bulan ini</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Berikutnya</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto px-4 py-4">
          <table className="border-collapse text-xs" style={{ minWidth: "1300px" }}>
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px]" style={{ minWidth: 38 }}>No</th>
                <th className="border border-[#1A284F]/30 py-2.5 px-2 font-semibold text-[11px]" style={{ minWidth: 210 }}>KPI</th>
                <th className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px]" style={{ minWidth: 68 }}>Formula</th>
                {MONTHS_LIST.map((m, idx) => {
                  const isPast = idx < CURRENT_MONTH_IDX;
                  const isCur = idx === CURRENT_MONTH_IDX;
                  return (
                    <th key={m}
                      className="border border-[#1A284F]/30 py-2 px-1 text-center font-semibold text-[11px]"
                      style={{ minWidth: 72, background: isPast ? "#4b5563" : isCur ? "#1d4ed8" : "#1A284F" }}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        {isPast && <Lock className="w-2.5 h-2.5 opacity-70" />}
                        {m}
                      </div>
                    </th>
                  );
                })}
                <th className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px]" style={{ minWidth: 88, background: "#b45309" }}>
                  Target 2026
                </th>
              </tr>
            </thead>
            <tbody>
              {editItems.length === 0 ? (
                <tr>
                  <td colSpan={3 + MONTHS_LIST.length + 1} className="py-8 text-center text-gray-400 text-sm">Tidak ada KPI dipilih</td>
                </tr>
              ) : sections.map((sec) => {
                const secItems = editItems.filter((i) => i.section === sec);
                const secBg = sec === "A" ? "#dbeafe" : sec === "B" ? "#e0e7ff" : "#f0fdf4";
                const secColor = sec === "A" ? "#1d4ed8" : sec === "B" ? "#4338ca" : "#166534";
                const totalCols = 3 + MONTHS_LIST.length + 1;
                return (
                  <React.Fragment key={sec}>
                    {/* Section header row */}
                    <tr>
                      <td colSpan={totalCols} className="py-1.5 px-3 text-[10px] font-bold uppercase tracking-wider border border-gray-200"
                        style={{ background: secBg, color: secColor }}>
                        {sec}. {kpiSectionLabel(sec)}
                      </td>
                    </tr>
                    {secItems.map((item, ridx) => {
                      const mt = item.monthlyTargets ?? {};
                      const mode = item.indicatorMode ?? "numeric";
                      const rowBg = ridx % 2 === 0 ? "#ffffff" : "#f9fafb";
                      return (
                        <tr key={item.id} style={{ background: rowBg }}>
                          <td className="border border-gray-200 py-2 px-1.5 text-center font-bold text-gray-500 text-[11px]">{item.no}</td>
                          <td className="border border-gray-200 py-2 px-2">
                            <p className="text-[11px] font-medium text-gray-800 leading-snug">{item.kpi.split("\n")[0]}</p>
                          </td>
                          <td className="border border-gray-200 py-2 px-1.5 text-center">
                            <span className="text-[10px] text-gray-500">{item.formula}</span>
                          </td>
                          {MONTHS_LIST.map((month, idx) => {
                            const isPast = idx < CURRENT_MONTH_IDX;
                            const isCur = idx === CURRENT_MONTH_IDX;
                            const val = mt[month] ?? "";
                            const cellBg = isPast ? "#f3f4f6" : isCur ? "#eff6ff" : "#f0fdf4";
                            return (
                              <td key={month} className="border border-gray-200 py-1 px-1 text-center" style={{ background: cellBg }}>
                                {isPast || targetSubmitted ? (
                                  <div className="flex items-center justify-center gap-1">
                                    {isPast && <Lock className="w-2.5 h-2.5 text-gray-300 shrink-0" />}
                                    <span className="text-[10px] text-gray-400">{val || "—"}</span>
                                  </div>
                                ) : mode === "color" ? (
                                  <select value={val} onChange={(e) => setMonthTarget(item.id, month, e.target.value)}
                                    className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 bg-white">
                                    <option value="">—</option>
                                    {COLOR_BAND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                ) : mode === "ratio" ? (
                                  <select value={val} onChange={(e) => setMonthTarget(item.id, month, e.target.value)}
                                    className="w-full text-[10px] border border-gray-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 bg-white">
                                    <option value="">—</option>
                                    {RATIO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : (
                                  <input type="text" value={val}
                                    onChange={(e) => setMonthTarget(item.id, month, e.target.value)}
                                    placeholder="—"
                                    className={`w-full text-[10px] border rounded px-1 py-0.5 outline-none text-center ${isCur ? "border-blue-300 focus:border-blue-500" : "border-gray-200 focus:border-green-400"}`}
                                    style={{ background: "transparent" }}
                                  />
                                )}
                              </td>
                            );
                          })}
                          <td className="border border-gray-200 py-2 px-1.5 text-center bg-amber-50">
                            <span className="text-[11px] font-bold text-[#1A284F]">{item.target2026 || "—"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Upload + Approval Info */}
        <div className="flex flex-col gap-4 px-6 py-4 border-t border-gray-100">
          {/* Fase 1 reason — read only */}
          {(phase1Category || phase1Reason) && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Alasan Permintaan Edit (Fase 1)</p>
              <div className="flex items-start rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                {phase1Category && (
                  <span className="shrink-0 text-[11px] font-bold text-[#1A284F] bg-[#1A284F]/5 px-3 py-2.5 border-r border-gray-200 select-none whitespace-nowrap">
                    [{phase1Category}]
                  </span>
                )}
                <p className="flex-1 text-sm px-3 py-2.5 text-gray-600 leading-relaxed">{phase1Reason || "—"}</p>
              </div>
            </div>
          )}

          {/* Komentar / Note Wajib */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Komentar / Note Perubahan Target</span>
              <span className="text-[10px] text-red-500 font-semibold">* wajib</span>
            </div>
            <textarea
              rows={3}
              value={ownerComment}
              onChange={(e) => setOwnerComment(e.target.value)}
              placeholder="Tuliskan penjelasan detail perubahan target KPI beserta dasar perhitungannya..."
              className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-xs text-gray-800 outline-none focus:border-[#1A284F] resize-none"
            />
          </div>

          {/* File Upload (multiple jpg, pdf) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Upload Memo &amp; File Pendukung</span>
              <span className="text-[10px] text-gray-400 font-normal normal-case">(multiple file: jpg, pdf)</span>
              <span className="text-[10px] text-red-500 font-semibold">* wajib</span>
            </div>
            <input
              ref={supportFileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.pdf"
              onChange={(e) => { setSupportFiles((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => supportFileRef.current?.click()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed text-xs font-semibold transition-colors w-full justify-center ${
                supportFiles.length === 0
                  ? "border-red-300 text-red-400 hover:border-red-400 hover:bg-red-50"
                  : "border-green-300 text-green-600 hover:border-green-400 hover:bg-green-50"
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              {supportFiles.length === 0 ? "Upload memo dan file pendukung" : `${supportFiles.length} file terlampir — klik untuk tambah`}
              <span className="font-normal opacity-70">jpg · png · pdf</span>
            </button>
            {supportFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                {supportFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
                    <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="text-[11px] text-gray-700 flex-1 truncate">{f.name}</span>
                    <button onClick={() => setSupportFiles((p) => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fase 2 Approval Info — horizontal */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval setelah submit (Fase 2)</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {TARGET_EDIT_APPROVERS.map((a, i) => {
                const isValidate = a.label === "Validate";
                return (
                  <React.Fragment key={a.label}>
                    {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${isValidate ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-[#1A284F]/5 border-[#1A284F]/10 text-[#1A284F]"}`}>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${isValidate ? "bg-emerald-500" : "bg-[#1A284F]"}`}>
                        {isValidate ? "✓" : i + 1}
                      </div>
                      <span>{a.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
          {/* Pending Approval tag — shown after submit */}
          <div className="min-w-0">
            {targetSubmitted && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                Pending Approval
              </span>
            )}
          </div>
          <div className="flex gap-3 shrink-0">
            <button onClick={onClose} className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              {targetSubmitted ? "Tutup" : "Batal"}
            </button>
            {!targetSubmitted && (
              <button
                onClick={() => setShowSubmitConfirm(true)}
                disabled={supportFiles.length === 0 || !ownerComment.trim() || submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#1A284F] text-white hover:bg-[#131d3b]"
              >
                <Send className="w-3.5 h-3.5" /> Submit Target
              </button>
            )}
          </div>
        </div>

        {/* Confirmation dialog */}
        {showSubmitConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-xl p-7 max-w-sm w-full mx-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-3">
                <Send className="w-5 h-5 text-[#1A284F]" />
              </div>
              <h4 className="font-bold text-gray-900 text-base mb-1">Konfirmasi Submit Target</h4>
              <p className="text-gray-500 text-sm mb-5">
                Monthly target yang telah diisi akan dikirimkan ke approver untuk mendapatkan persetujuan. Lanjutkan?
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowSubmitConfirm(false)}
                  className="px-5 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      const uploadedMemo: TargetEditAttachment[] = [];
                      for (const f of supportFiles) {
                        let fileUrl = "";
                        try {
                          const up = await uploadEvidenceFileToSupabase(f, {
                            employeeId: ownerUser.employeeId,
                            employeeName: ownerUser.name,
                            companyUnit: ownerUser.company,
                            division: ownerUser.division || "-",
                            department: ownerUser.department || "-",
                            position: ownerUser.position || "-",
                            moduleType: "KPI Edit Target Memo",
                            period: "2026",
                            month: "All",
                          });
                          fileUrl = up?.url || "";
                        } catch {
                          fileUrl = "";
                        }
                        if (!fileUrl) {
                          fileUrl = await new Promise<string>((resolve) => {
                            const r = new FileReader();
                            r.onload = () => resolve(String(r.result ?? ""));
                            r.onerror = () => resolve("");
                            r.readAsDataURL(f);
                          });
                        }
                        uploadedMemo.push({ name: f.name, size: f.size, type: f.type || "application/octet-stream", url: fileUrl });
                      }
                      const editMap = new Map(editItems.map((i) => [i.id, i]));
                      const merged = items.map((i) => editMap.get(i.id) ?? i);
                      submitTargetEditPhase2({
                        owner: ownerUser,
                        comment: ownerComment.trim(),
                        memoFiles: uploadedMemo,
                        originalItems: items,
                        proposedItems: merged,
                      });
                      setShowSubmitConfirm(false);
                      setTargetSubmitted(true);
                      setShowSubmittedPopup(true);
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" /> {submitting ? "Mengirim..." : "Ya, Submit"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popup Notifikasi Sukses Submit Fase 2 */}
        {showSubmittedPopup && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full mx-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h4 className="font-bold text-gray-900 text-lg">Perubahan Target KPI Terkirim</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Perubahan target KPI beserta komentar dan <strong>{supportFiles.length} lampiran memo pendukung</strong> berhasil dikirim ke alur persetujuan berjenjang:
              </p>
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 px-3.5 py-2.5 text-[11px] font-semibold text-[#1A284F]">
                Approver 1 → Approver 2 → GM ({ownerUser.company}) → Validate (HR ICF)
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSubmittedPopup(false);
                  onSubmitted?.();
                }}
                className="w-full py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


function ColorIndicatorRadio({ value, onChange }: { value: IndicatorMode; onChange: (mode: IndicatorMode) => void }) {
  const options: { mode: IndicatorMode; label: string; desc: string }[] = [
    { mode: "numeric", label: "Numeric",  desc: "Input target as numbers" },
    { mode: "color",   label: "Color",    desc: "Use color bands (Green / Yellow / Red)" },
    { mode: "ratio",   label: "Ratio",    desc: "Monthly target as ratio (e.g. 10:1)" },
  ];
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3.5 transition-all shadow-2xs ${FIELD_TONE_STYLES.amber.wrap}`}>
      <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${FIELD_TONE_STYLES.amber.label}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${FIELD_TONE_STYLES.amber.dot}`} />
        <span>Indicator Mode</span>
      </label>
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl border border-amber-200/70 bg-white/90">
        {options.map(({ mode, label, desc }) => (
          <label key={mode} className="flex items-start gap-2.5 cursor-pointer flex-1">
            <input
              type="radio"
              name="indicatorMode"
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="mt-0.5 accent-[#1A284F] w-4 h-4 shrink-0"
            />
            <span className="flex flex-col">
              <span className={`text-xs font-bold ${value === mode ? "text-[#1A284F]" : "text-gray-600"}`}>{label}</span>
              <span className="text-[10px] text-gray-400">{desc}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function BaselineColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const meta = baselineColorMeta(value);
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3.5 transition-all shadow-2xs ${FIELD_TONE_STYLES.amber.wrap}`}>
      <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${FIELD_TONE_STYLES.amber.label}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${FIELD_TONE_STYLES.amber.dot}`} />
        <span>Baseline 2025</span>
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm border rounded-lg px-3 py-2 outline-none appearance-none cursor-pointer font-semibold"
          style={{
            borderColor: meta ? meta.border : "#e5e7eb",
            background: meta ? meta.bg : "white",
            color: meta ? meta.color : "#6b7280",
          }}
        >
          <option value="">— Pilih —</option>
          {BASELINE_COLOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.value}</option>
          ))}
        </select>
        {meta && (
          <span className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full pointer-events-none" style={{ background: meta.dot }} />
        )}
      </div>
    </div>
  );
}

function Target2026Field({ value, colorMode, ratioMode, monthlyTargets, softOrangeHighlight = false }: {
  value: string; colorMode: boolean; ratioMode?: boolean;
  monthlyTargets?: Record<string, string>;
  softOrangeHighlight?: boolean;
}) {
  const meta = colorMode ? MONTHLY_FLAG_OPTIONS.find((o) => o.value === value) : null;
  const orangeWrapCls = softOrangeHighlight
    ? "border-2 border-orange-300 bg-orange-50/50 ring-2 ring-orange-100"
    : "";

  if (ratioMode) {
    const hasValue = !!value;
    const { totalP, totalN } = monthlyTargets ? computeRatioSumDisplay(monthlyTargets) : { totalP: 0, totalN: 0 };
    return (
      <div className={`flex flex-col gap-1.5 rounded-xl p-3.5 transition-all ${softOrangeHighlight ? orangeWrapCls : ""}`}>
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target 2026</label>
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${softOrangeHighlight ? "border-orange-300 bg-white" : "border-purple-200 bg-purple-50/40"}`}>
          <span className="text-xl font-black text-purple-700 tracking-tight">
            {hasValue ? value : "—:—"}
          </span>
          {hasValue && (
            <span className="text-[10px] text-purple-400 font-medium">
              (kumulatif: {totalP}:{totalN})
            </span>
          )}
          <span className="ml-auto text-[10px] text-purple-400 font-medium">auto</span>
        </div>
        {softOrangeHighlight && (
          <p className="text-[11px] font-medium text-orange-700 flex items-center gap-1.5 mt-0.5">
            <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            Pastikan sudah sesuai dengan tracking bulanan &amp; target setahun Anda
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 rounded-xl p-3.5 transition-all shadow-2xs ${softOrangeHighlight ? orangeWrapCls : `border ${FIELD_TONE_STYLES.amber.wrap}`}`}>
      <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${FIELD_TONE_STYLES.amber.label}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${FIELD_TONE_STYLES.amber.dot}`} />
        <span>Target 2026</span>
      </label>
      {colorMode ? (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-bold"
          style={{
            background: meta ? meta.bg : "#f9fafb",
            borderColor: softOrangeHighlight ? "#fdba74" : (meta ? meta.border : "#e5e7eb"),
            color: meta ? meta.color : "#9ca3af",
          }}
        >
          {meta ? (
            <>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: meta.dot }} />
              {meta.label}
            </>
          ) : (
            <span className="text-gray-400 font-normal italic">Auto-filled from December</span>
          )}
          <span className="ml-auto text-[10px] font-semibold text-gray-400">auto</span>
        </div>
      ) : (
        <div className="relative">
          <input
            value={value}
            readOnly
            className={`text-sm rounded-lg px-3 py-2 outline-none w-full text-[#1A284F] font-bold cursor-default ${
              softOrangeHighlight ? "border-2 border-orange-300 bg-white" : "border border-gray-200 bg-gray-50"
            }`}
            placeholder="Auto-computed from Monthly Target"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium pointer-events-none">auto</span>
        </div>
      )}
      {softOrangeHighlight && (
        <p className="text-[11px] font-medium text-orange-700 flex items-center gap-1.5 mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          Pastikan sudah sesuai dengan tracking bulanan &amp; target setahun Anda
        </p>
      )}
    </div>
  );
}

function MonthlyTargetTable({
  monthlyTargets,
  formula,
  colorMode,
  ratioMode,
  onChange,
  softOrangeHighlight = false,
}: {
  monthlyTargets: Record<string, string>;
  formula: string;
  colorMode: boolean;
  ratioMode?: boolean;
  onChange: (mt: Record<string, string>, computed2026: string) => void;
  softOrangeHighlight?: boolean;
}) {
  const handleChange = (key: string, val: string) => {
    // Auto-fill all months when Jan is changed (ratio or color mode)
    const isJan = key === MONTHS_LIST[0];
    const shouldAutoFill = isJan && (ratioMode || colorMode);
    const updated = shouldAutoFill
      ? MONTHS_LIST.reduce((acc, k) => ({ ...acc, [k]: val }), { ...monthlyTargets })
      : { ...monthlyTargets, [key]: val };
    const computed = ratioMode
      ? computeRatioTarget2026(updated)
      : computeTarget2026(updated, formula);
    onChange(updated, computed);
  };

  const ruleHint = ratioMode
    ? "Pilih Jan → auto isi semua bulan"
    : colorMode
    ? "Pilih Jan → auto isi semua bulan"
    : formula === "Jumlah"      ? "Target 2026 = Sum (Jan–Dec)"
    : formula === "Rata-Rata"   ? "Target 2026 = Average (Jan–Dec)"
    : formula === "Nilai Akhir" ? "Target 2026 = December value"
    : "";

  return (
    <div className={`flex flex-col gap-1.5 ${softOrangeHighlight ? "rounded-xl border-2 border-orange-300 bg-orange-50/50 ring-2 ring-orange-100 p-3.5" : ""}`}>
      <div className="flex items-center justify-between">
        <label className={`text-[11px] font-bold uppercase tracking-wide ${softOrangeHighlight ? "text-orange-800" : "text-gray-500"}`}>Monthly Target</label>
        {ruleHint && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            ratioMode ? "text-purple-700 bg-purple-50 border-purple-200"
            : colorMode ? "text-emerald-700 bg-emerald-50 border-emerald-200"
            : "text-blue-600 bg-blue-50 border-blue-100"
          }`}>
            {ruleHint}
          </span>
        )}
      </div>
      <div className={`overflow-x-auto rounded-xl ${softOrangeHighlight ? "border-2 border-orange-300 bg-white" : "border border-gray-200"}`}>
        <table className="border-collapse w-full text-xs" style={{ minWidth: 680 }}>
          <thead>
            <tr className="bg-[#1A284F]/5">
              {MONTHS_SHORT.map((m, i) => (
                <th key={m} className={`border border-gray-200 py-2 px-1 text-center font-bold text-[#1A284F] text-[11px] ${
                  !colorMode && !ratioMode && i === 11 ? "bg-amber-50" : ""
                } ${(ratioMode || colorMode) && i === 0 ? "bg-[#1A284F]/10" : ""}`}>
                  {m}{(ratioMode || colorMode) && i === 0 ? " *" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {MONTHS_LIST.map((key, i) => {
                if (ratioMode) {
                  const selected = monthlyTargets[key] ?? "";
                  const isLocked = i > 0 && !!monthlyTargets[MONTHS_LIST[0]];
                  return (
                    <td key={key} className={`border border-gray-200 p-1 ${isLocked ? "bg-purple-50/10" : "bg-purple-50/20"}`}>
                      <select
                        value={selected}
                        onChange={(e) => handleChange(key, e.target.value)}
                        disabled={isLocked}
                        className={`w-full text-[10px] font-semibold border border-purple-200 rounded-md px-0.5 py-1.5 outline-none cursor-pointer text-purple-700 bg-white focus:border-purple-400 ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}
                      >
                        <option value="">—</option>
                        {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                  );
                }
                if (colorMode) {
                  const selected = monthlyTargets[key] ?? "";
                  const flagMeta = MONTHLY_FLAG_OPTIONS.find((o) => o.value === selected);
                  const isLocked = i > 0 && !!monthlyTargets[MONTHS_LIST[0]];
                  return (
                    <td key={key} className="border border-gray-200 p-1" style={{ background: flagMeta ? flagMeta.bg : "white" }}>
                      <select
                        value={selected}
                        onChange={(e) => handleChange(key, e.target.value)}
                        disabled={isLocked}
                        className={`w-full text-[10px] font-semibold border rounded-md px-0.5 py-1.5 outline-none cursor-pointer ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}
                        style={{ borderColor: flagMeta ? flagMeta.border : "#e5e7eb", color: flagMeta ? flagMeta.color : "#6b7280", background: "transparent" }}
                      >
                        <option value="">—</option>
                        {MONTHLY_FLAG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {flagMeta && <div className="flex justify-center mt-0.5"><span className="inline-block w-2 h-2 rounded-full" style={{ background: flagMeta.dot }} /></div>}
                    </td>
                  );
                }
                return (
                  <td key={key} className={`border border-gray-200 p-1 ${i === 11 ? "bg-amber-50/40" : "bg-white"}`}>
                    <input
                      type="number"
                      value={monthlyTargets[key] ?? ""}
                      onChange={(e) => handleChange(key, e.target.value)}
                      placeholder="—"
                      className={`w-full text-xs text-center border rounded-md px-1 py-1.5 outline-none focus:border-[#1A284F] ${i === 11 ? "border-amber-200 bg-amber-50/60" : "border-gray-200"}`}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {!colorMode && !ratioMode && formula === "Nilai Akhir" && (
        <p className="text-[10px] text-amber-700 font-medium">December (highlighted) is used as the final target value.</p>
      )}
      {softOrangeHighlight && (
        <p className="text-[11px] font-medium text-orange-700 flex items-center gap-1.5 mt-0.5">
          <AlertCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          Pastikan sudah sesuai dengan tracking bulanan &amp; target setahun Anda
        </p>
      )}
    </div>
  );
}


// Section options for Division and Personal modals
const DIVISION_SECTION_OPTIONS = [
  { value: "A", label: "A — K3L Terintegrasi (SMK3/HSE)" },
  { value: "B", label: "B — Finansial" },
  { value: "C", label: "C — Produksi" },
  { value: "D", label: "D — Be Employer of Choices" },
  { value: "E", label: "E — Be Partner of Choices" },
  { value: "F", label: "F — Regulatory Compliance" },
];
const PERSONAL_SECTION_OPTIONS = [
  { value: "A", label: "A — Objective KPI", bobot: "20%"  },
  { value: "B", label: "B — Functional KPI", bobot: "80%" },
];

const LIHAT_KPI_ATASAN_ROLES = new Set([
  "vGM",
  "Coordinator",
  "Division",
  "Departement",
  "HR Unit",
  "Supervisor",
  "Employee",
  "Administrator",
  "HR ICF",
]);

function resolveApproverKpiSnapshot(approverUser: ManagedUser | undefined): {
  statusKind: "validated" | "not_submitted" | "in_approval";
  statusText: string;
  items: KPISetting[];
} {
  if (!approverUser) {
    return { statusKind: "not_submitted", statusText: "KPI Belum di Submit", items: [] };
  }
  const normId = normalizeEmployeeId(approverUser.employeeId);
  const wfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.module === "KPI" &&
      r.phase === "setting" &&
      (r.employeeId === normId || r.employeeId.toLowerCase() === approverUser.employeeId.toLowerCase()),
  );
  const storedItems = readStoredPersonalKpiItems(approverUser.employeeId) ?? [];
  if (!wfRec) {
    return { statusKind: "not_submitted", statusText: "KPI Belum di Submit", items: [] };
  }
  const chk = wfRec.decisions.checker?.status ?? "";
  const a1 = wfRec.decisions.approver1?.status ?? "";
  const a2 = wfRec.decisions.approver2?.status ?? "";
  const val = wfRec.decisions.validator?.status ?? "";
  if (val === "Validated" || a2 === "Validated") {
    return { statusKind: "validated", statusText: "Validated", items: storedItems };
  }
  if (chk === "Revision" || a1 === "Revision" || a2 === "Revision" || val === "Revision") {
    return { statusKind: "in_approval", statusText: "Revision", items: [] };
  }
  let stageLabel = "Pending Check HR Unit";
  if (a2 === "Approved" || a2.startsWith("Assessed")) stageLabel = "Pending Validate (HR ICF)";
  else if (a1 === "Approved" || a1.startsWith("Assessed")) stageLabel = "Pending Approver 2";
  else if (chk && chk !== "Revision") stageLabel = "Pending Approver 1";
  return { statusKind: "in_approval", statusText: stageLabel, items: [] };
}

function LihatKpiAtasanModal({
  ownerUser,
  targetSectionCode,
  targetSectionLabel,
  remainingSectionBobot,
  onSelectKpi,
  onClose,
}: {
  ownerUser: ManagedUser;
  targetSectionCode: string;
  targetSectionLabel: string;
  remainingSectionBobot: number;
  onSelectKpi: (item: KPISetting) => void;
  onClose: () => void;
}) {
  const allUsers = loadManagedUsers();
  const [remoteTick, setRemoteTick] = useState(0);
  const findUserByRegOrId = (key?: string): ManagedUser | undefined => {
    const k = (key ?? "").trim().toLowerCase();
    if (!k) return undefined;
    return allUsers.find(
      (u) =>
        (u.regNo ?? "").trim().toLowerCase() === k ||
        u.employeeId.trim().toLowerCase() === k ||
        u.name.trim().toLowerCase() === k,
    );
  };
  const ap1User = findUserByRegOrId(ownerUser.regNoAp1);
  const ap2User = findUserByRegOrId(ownerUser.regNoAp2);
  const isSameApprover =
    Boolean(ap1User && ap2User && ap1User.employeeId.toLowerCase() === ap2User.employeeId.toLowerCase()) ||
    (!ap2User && Boolean(ap1User));

  const tabs = React.useMemo(() => {
    const list: Array<{ id: "ap1" | "ap2"; label: string; user?: ManagedUser }> = [];
    if (ap1User) {
      list.push({ id: "ap1", label: `Approver 1 · ${ap1User.name}`, user: ap1User });
    } else {
      list.push({ id: "ap1", label: "Approver 1 · Belum Ditentukan", user: undefined });
    }
    if (!isSameApprover && ap2User) {
      list.push({ id: "ap2", label: `Approver 2 · ${ap2User.name}`, user: ap2User });
    }
    return list;
  }, [ap1User, ap2User, isSameApprover]);

  const [activeTab, setActiveTab] = useState<"ap1" | "ap2">(tabs[0]?.id ?? "ap1");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const currentTab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  useEffect(() => {
    const supUser = currentTab?.user;
    if (!supUser?.employeeId) return;
    let cancelled = false;
    void fetchEmployeeKpiSettingsLive<KPISetting>(supUser.employeeId).then((remote) => {
      if (!cancelled && remote.length > 0) {
        setRemoteTick((t) => t + 1);
      }
    });
    const onHydrated = () => {
      if (!cancelled) setRemoteTick((t) => t + 1);
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => {
      cancelled = true;
      window.removeEventListener("pa-db-hydrated", onHydrated);
    };
  }, [currentTab?.user?.employeeId]);

  void remoteTick;
  const snapshot = resolveApproverKpiSnapshot(currentTab?.user);
  const selectedItem = snapshot.items.find((i) => i.id === selectedId) ?? null;
  const sections = Array.from(new Set(snapshot.items.map((k) => k.section || "A"))).sort();
  const sectionBannerPalette = ["#1565C0", "#1976D2", "#1E88E5", "#2196F3", "#00838F", "#6A1B9A"];
  const hasAnyCascading = snapshot.items.some((k) => Boolean(k.cascading));
  const colSpanCount = hasAnyCascading ? 16 : 15;

  const selectedBobotNum = selectedItem ? parsePctNum(selectedItem.bobot) : 0;
  const bobotMismatch =
    selectedItem !== null && Math.abs(selectedBobotNum - remainingSectionBobot) > 1e-6;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-5">
      <div
        className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[96vw] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-[#1A284F] text-lg">Lihat KPI Atasan</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pilih maksimal 1 baris KPI atasan (berstatus Validated) lalu klik Add untuk menyalin ke form Add New KPI.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-100 px-6 pt-3 gap-2 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                setSelectedId(null);
              }}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-[#1A284F] bg-sky-50/70 text-[#1A284F]"
                  : "border-transparent text-gray-500 hover:text-[#1A284F] hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {snapshot.statusKind === "not_submitted" ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-16 text-center">
              <p className="text-sm font-bold text-gray-600">KPI Belum di Submit</p>
              <p className="text-xs text-gray-400 mt-1">Atasan belum melakukan submit KPI Setting 2026.</p>
            </div>
          ) : snapshot.statusKind === "in_approval" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 py-16 text-center px-6">
              <p className="text-sm font-bold text-amber-800">
                KPI dalam status Approval {snapshot.statusText}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                KPI Atasan hanya dapat dipilih setelah berstatus Validated.
              </p>
            </div>
          ) : snapshot.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-16 text-center">
              <p className="text-sm font-bold text-gray-500">Belum ada data KPI pada atasan ini.</p>
            </div>
          ) : (
            <DualScrollTableContainer className="rounded-xl border border-gray-200 shadow-sm bg-white">
              <table className="border-collapse text-xs w-full" style={{ minWidth: 1850 }}>
                <thead>
                  <tr className="bg-[#1A284F] text-white">
                    <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 0, zIndex: 26, background: "#1A284F", minWidth: 54, maxWidth: 54 }}>Pilih</th>
                    <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 54, zIndex: 25, background: "#1A284F", minWidth: 52, maxWidth: 52 }}>No</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: 106, zIndex: 25, background: "#1A284F", minWidth: 125, maxWidth: 125 }}>Perspektif</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: 231, zIndex: 25, background: "#1A284F", minWidth: 250, maxWidth: 250, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" }}>KPI</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold min-w-[130px]">Satuan</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[110px]">Formula Setahun</th>
                    <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold w-20">Bobot</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold min-w-[240px]">Definisi</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold min-w-[155px]">Source</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[96px]">Baseline 2025</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[96px]">Target 2026</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[96px]">Polaritas</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold min-w-[240px]">Detail Formula</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold min-w-[170px]">Keterangan</th>
                    <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[120px]">Periode Tracking</th>
                    {hasAnyCascading && (
                      <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold min-w-[110px]">CASCADING (FC; PC; CC)</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((sec, sIdx) => {
                    const secRows = snapshot.items.filter((k) => (k.section || "A") === sec);
                    const first = secRows[0];
                    const fallbackLabel =
                      sec === "A"
                        ? "Objective KPI"
                        : sec === "B"
                          ? "Functional KPI"
                          : resolvePersonalSectionLabel(first);
                    const secLabel = first?.sectionLabel || fallbackLabel;
                    const secBobotVal =
                      first?.sectionBobot ||
                      `${formatPctNum(secRows.reduce((s, r) => s + parsePctNum(r.bobot), 0))}%`;
                    const bannerBg =
                      (CORP_SECTION_META as Record<string, { bg?: string }>)[sec]?.bg ||
                      sectionBannerPalette[sIdx % sectionBannerPalette.length];
                    return (
                      <React.Fragment key={sec}>
                        {/* Section Header Banner — TANPA checkbox (Section tidak dapat dipilih) */}
                        <tr className="select-none">
                          <td
                            colSpan={colSpanCount}
                            className="p-0 text-white text-xs font-bold uppercase tracking-widest border"
                            style={{ background: bannerBg, borderColor: bannerBg }}
                          >
                            <div
                              className="py-2.5 px-4 inline-flex items-center gap-2 whitespace-nowrap"
                              style={{ position: "sticky", left: 0, zIndex: 15, background: bannerBg }}
                            >
                              <span>{sec}. {secLabel}</span>
                              <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold tracking-normal">
                                Bobot {secBobotVal}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {secRows.map((it, idx) => {
                          const checked = selectedId === it.id;
                          const stickyBg = checked ? "#f0f9ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                          return (
                            <tr
                              key={it.id}
                              onClick={() => setSelectedId(checked ? null : it.id)}
                              className={`cursor-pointer border-t border-gray-200 transition-colors ${
                                checked ? "bg-sky-50 ring-1 ring-inset ring-sky-300" : idx % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-slate-50/60 hover:bg-gray-50"
                              }`}
                            >
                              <td
                                className="border border-gray-200 py-2.5 px-2 text-center"
                                style={{ position: "sticky", left: 0, zIndex: 13, background: stickyBg, minWidth: 54, maxWidth: 54 }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setSelectedId(checked ? null : it.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 accent-[#1A284F] cursor-pointer"
                                />
                              </td>
                              <td
                                className="border border-gray-200 py-2.5 px-2 text-center font-semibold text-gray-600"
                                style={{ position: "sticky", left: 54, zIndex: 12, background: stickyBg, minWidth: 52, maxWidth: 52 }}
                              >
                                {it.no}
                              </td>
                              <td
                                className="border border-gray-200 py-2.5 px-3 font-semibold text-gray-700"
                                style={{ position: "sticky", left: 106, zIndex: 12, background: stickyBg, minWidth: 125, maxWidth: 125 }}
                              >
                                <span className={PERSP_COLOR[it.perspektif] ?? "text-gray-700"}>{it.perspektif}</span>
                              </td>
                              <td
                                className="border border-gray-200 py-2.5 px-3 font-medium text-gray-800 whitespace-pre-line"
                                style={{ position: "sticky", left: 231, zIndex: 12, background: stickyBg, minWidth: 250, maxWidth: 250, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}
                              >
                                {it.kpi}
                              </td>
                              <td className="border border-gray-200 py-2.5 px-3 text-gray-600">{it.satuan}</td>
                              <td className="border border-gray-200 py-2.5 px-3 text-center text-gray-600">{it.formula}</td>
                              <td className="border border-gray-200 py-2.5 px-2 text-center">
                                <span className="px-2 py-0.5 rounded-full bg-[#1A284F] text-white text-[10px] font-bold">{it.bobot}</span>
                              </td>
                              <td className="border border-gray-200 py-2.5 px-3 text-gray-600 leading-relaxed">{it.definisi || "—"}</td>
                              <td className="border border-gray-200 py-2.5 px-3 text-gray-600">{it.source || "—"}</td>
                              <td className="border border-gray-200 py-2.5 px-3 text-center text-gray-700">
                                {it.colorIndicator ? <ColorValueBadge value={it.baseline2025} isBaseline /> : (it.baseline2025 || "—")}
                              </td>
                              <td className="border border-gray-200 py-2.5 px-3 text-center font-bold text-[#1A284F]">
                                {it.colorIndicator ? <ColorValueBadge value={it.target2026} /> : (it.target2026 || "—")}
                              </td>
                              <td className="border border-gray-200 py-2.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${it.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : it.polaritas === "Minimize" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                                  {it.polaritas}
                                </span>
                              </td>
                              <td className="border border-gray-200 py-2.5 px-3 text-gray-600 whitespace-pre-line leading-relaxed">{it.detailFormula || "—"}</td>
                              <td className="border border-gray-200 py-2.5 px-3 text-gray-600 whitespace-pre-line leading-relaxed">{it.keterangan || "—"}</td>
                              <td className="border border-gray-200 py-2.5 px-3 text-center text-gray-600">
                                {derivePeriodeTrackingFromSatuan(it.satuan, it.trackingPeriod)}
                              </td>
                              {hasAnyCascading && (
                                <td className="border border-gray-200 py-2.5 px-2 text-center">
                                  {it.cascading ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">{it.cascading}</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </DualScrollTableContainer>
          )}
        </div>

        <div className="flex flex-col gap-2.5 px-6 py-4 border-t border-gray-100 bg-gray-50/40 shrink-0">
          {selectedItem && bobotMismatch && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>
                Bobot KPI Atasan (<strong>{selectedItem.bobot}</strong>) tidak sesuai dengan sisa bobot pada{" "}
                <strong>Section {targetSectionCode} — {targetSectionLabel}</strong> Anda saat ini (sisa bobot:{" "}
                <strong>{formatPctNum(remainingSectionBobot)}%</strong>).{" "}
                <strong>Sisa bobot perlu disesuaikan setelah KPI Atasan ditambahkan ke form.</strong>
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-gray-500">
              {selectedItem ? (
                <>Terpilih: <strong className="text-[#1A284F]">{selectedItem.kpi}</strong> (Bobot {selectedItem.bobot})</>
              ) : (
                "Pilih 1 baris KPI (hanya baris KPI yang dapat dipilih, Section tidak memiliki checkbox)."
              )}
            </span>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
            {selectedItem && (
              <button
                type="button"
                onClick={() => {
                  onSelectKpi(selectedItem);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b]"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddKPIModal({
  existingItems,
  onAdd,
  onClose,
  forDivision,
  hideCascading,
  onSectionCascade,
  ownerUser,
}: {
  existingItems: KPISetting[];
  onAdd: (item: KPISetting) => void;
  onClose: () => void;
  forDivision?: boolean;
  hideCascading?: boolean;
  onSectionCascade?: (section: string, type: string) => void;
  ownerUser?: ManagedUser;
}) {
  const [showLihatAtasan, setShowLihatAtasan] = useState(false);
  const [atasanBobotWarning, setAtasanBobotWarning] = useState<string | null>(null);
  const [fromAtasanKpi, setFromAtasanKpi] = useState(false);
  const [atasanBobotNeedsAdjust, setAtasanBobotNeedsAdjust] = useState(false);
  const [addTipOpen, setAddTipOpen] = useState(false);
  const activeActor = getActiveUser();
  const canLihatKpiAtasan =
    !forDivision &&
    LIHAT_KPI_ATASAN_ROLES.has((ownerUser ?? activeActor).role) &&
    Boolean(ownerUser ?? activeActor);
  const master = useMasterKpi();
  const dynamicPersonalSections = (master.personalSection?.length ? master.personalSection : PERSONAL_SECTION_OPTIONS.map((p) => ({
    value: p.value,
    description: p.label.replace(/^[A-Z]+\s*—\s*/, ""),
  }))).map((s) => ({
    value: s.value,
    label: `${s.value} — ${s.description || s.value}`,
    bobot: s.value === "A" ? "20%" : s.value === "B" ? "80%" : "",
  }));
  const dynamicDivisionSections = (master.section?.length ? master.section : DIVISION_SECTION_OPTIONS.map((d) => d.label.replace(/^[A-Z]+\s*—\s*/, ""))).map((lbl, idx) => {
    const code = SECTION_LABEL_TO_CODE[lbl] || String.fromCharCode("A".charCodeAt(0) + idx);
    return { value: code, label: `${code} — ${lbl}` };
  });
  const firstPersonal = dynamicPersonalSections[0] ?? { value: "A", label: "A — Objective KPI", bobot: "20%" };
  const firstDivision = dynamicDivisionSections[0] ?? { value: "A", label: "A — K3L Terintegrasi (SMK3/HSE)" };
  const [tab, setTab] = useState<"section" | "subsection">("section");
  const [form, setForm] = useState<Omit<KPISetting, "id">>({
    no: "",
    sectionAlphabet: `${forDivision ? firstDivision.value : firstPersonal.value}.`,
    section: forDivision ? firstDivision.value : firstPersonal.value,
    sectionLabel: (forDivision ? firstDivision.label : firstPersonal.label).replace(/^[A-Z]+\s*—\s*/, ""),
    sectionBobot: forDivision ? "" : firstPersonal.bobot,
    perspektif: "Proses", kpi: "", satuan: "", formula: "Jumlah",
    bobot: "", definisi: "", source: "", baseline2025: "", target2026: "", polaritas: "Maximize",
    detailFormula: "", keterangan: "", monthlyTargets: {}, colorIndicator: false, indicatorMode: "numeric",
  });
  const [bobotError, setBobotError] = useState<BobotViolation | null>(null);
  const [sectionCascadeType, setSectionCascadeType] = useState<string>("FC");
  const indicatorMode: IndicatorMode = form.indicatorMode ?? "numeric";
  const colorMode = indicatorMode === "color";
  const ratioMode = indicatorMode === "ratio";

  const set = (key: keyof typeof form, val: string) => setForm((p) => {
    const next = { ...p, [key]: val } as typeof form;
    if (key === "formula") next.target2026 = computeTarget2026(p.monthlyTargets ?? {}, val);
    return next;
  });

  // When section changes, auto-fill sectionLabel, sectionAlphabet, and sectionBobot
  const [manualSection, setManualSection] = useState(false);

  const computeSectionStateForCode = (code: string) => {
    const existingRows = existingItems.filter((i) => i.section === code);
    const isExisting = existingRows.length > 0;
    const usedOtherSections = calcAllSectionsBobotSum(existingItems, Boolean(forDivision), undefined, code);
    const remainingForSection = Math.max(0, Math.round((100 - usedOtherSections) * 100) / 100);
    if (isExisting) {
      const lockedNum = resolveEffectiveSectionBobotNum(existingItems, code, Boolean(forDivision));
      return {
        isExisting: true,
        sectionBobotStr: `${formatPctNum(lockedNum)}%`,
        remainingForSection,
      };
    }
    // Section baru: sesuaikan default bobot ke dalam batas sisa dari 100%
    let suggestedNum = remainingForSection;
    if (forDivision) {
      const metaStr = (CORP_SECTION_META as Record<string, { bobot: string }>)[code]?.bobot ?? "";
      const metaNum = parsePctNum(metaStr);
      if (metaNum > 0 && metaNum <= remainingForSection) suggestedNum = metaNum;
    } else {
      const optStr = dynamicPersonalSections.find((o) => o.value === code)?.bobot ?? "";
      const optNum = parsePctNum(optStr);
      if (optNum > 0 && optNum <= remainingForSection) suggestedNum = optNum;
    }
    return {
      isExisting: false,
      sectionBobotStr: remainingForSection > 0 ? `${formatPctNum(suggestedNum)}%` : "",
      remainingForSection,
    };
  };

  const setSection = (code: string) => {
    if (code === "__manual__") {
      const used = new Set(existingItems.map((i) => i.section));
      const nextCode = SECTION_LETTERS.find((l) => !used.has(l)) ?? "Z";
      const st = computeSectionStateForCode(nextCode);
      setManualSection(true);
      setForm((p) => ({
        ...p,
        section: nextCode,
        sectionLabel: "",
        sectionAlphabet: nextCode + ".",
        sectionBobot: st.sectionBobotStr,
        bobot: "",
      }));
      return;
    }
    setManualSection(false);
    const st = computeSectionStateForCode(code);
    const existingRow = existingItems.find((i) => i.section === code);
    if (existingRow) {
      const lbl = forDivision ? resolveKpiSectionLabel(existingRow) : resolvePersonalSectionLabel(existingRow);
      setForm((p) => ({
        ...p,
        section: code,
        sectionLabel: lbl,
        sectionAlphabet: code + ".",
        sectionBobot: st.sectionBobotStr,
        bobot: "",
      }));
      return;
    }
    if (forDivision) {
      const opt = dynamicDivisionSections.find((o) => o.value === code);
      setForm((p) => ({
        ...p,
        section: code,
        sectionLabel: opt?.label.replace(/^[A-Z] — /, "") ?? code,
        sectionAlphabet: code + ".",
        sectionBobot: st.sectionBobotStr,
        bobot: "",
      }));
    } else {
      const opt = dynamicPersonalSections.find((o) => o.value === code);
      setForm((p) => ({
        ...p,
        section: code,
        sectionLabel: opt?.label.replace(/^[A-Z] — /, "") ?? code,
        sectionAlphabet: code + ".",
        sectionBobot: st.sectionBobotStr,
        bobot: "",
      }));
    }
  };

  const setIndicatorMode = (mode: IndicatorMode) => setForm((p) => ({
    ...p, indicatorMode: mode, colorIndicator: mode === "color", monthlyTargets: {}, baseline2025: "", target2026: "",
    ...(mode === "color" ? { formula: "Nilai Akhir" } : mode === "ratio" ? { formula: "Jumlah" } : {}),
  }));

  const isExistingSection = existingItems.some((i) => i.section === form.section);
  const usedOtherSectionsBobot = calcAllSectionsBobotSum(existingItems, Boolean(forDivision), undefined, form.section);
  const remainingSectionFrom100 = Math.max(0, Math.round((100 - usedOtherSectionsBobot) * 100) / 100);
  const activeSectionLimitNum = isExistingSection
    ? resolveEffectiveSectionBobotNum(existingItems, form.section, Boolean(forDivision))
    : parsePctNum(form.sectionBobot);
  const subUsedInSection = Math.round(calcSubSectionBobot(existingItems, form.section) * 100) / 100;
  const subRemainingInSection = Math.max(0, Math.round((activeSectionLimitNum - subUsedInSection) * 100) / 100);
  const isSectionQuotaFull = activeSectionLimitNum > 0 && subRemainingInSection <= 1e-6;
  const isNewSectionBlockedBy100 = !isExistingSection && remainingSectionFrom100 <= 1e-6;

  const availableSectionBobotOpts = buildRemainingBobotOptions(1, remainingSectionFrom100);
  const availableSubBobotOpts = buildRemainingBobotOptions(
    activeSectionLimitNum === 0 ? 0 : 1,
    subRemainingInSection,
    form.bobot || undefined,
    activeSectionLimitNum === 0,
  );

  const handleNextToSubSection = () => {
    if (!form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull) return;
    const secNum = parsePctNum(form.sectionBobot);
    if (!isExistingSection && usedOtherSectionsBobot + secNum > 100 + 1e-6) {
      const conflictItems = Array.from(
        new Map(existingItems.map((i) => [i.section, i])).values(),
      ).map((i) => ({
        no: i.section,
        label: i.sectionLabel || `Section ${i.section}`,
        bobot: `${formatPctNum(resolveEffectiveSectionBobotNum(existingItems, i.section, Boolean(forDivision)))}%`,
      }));
      setBobotError({
        kind: "section_bobot",
        totalUsed: usedOtherSectionsBobot,
        remaining: remainingSectionFrom100,
        conflictItems,
      });
      return;
    }
    setTab("subsection");
  };

  const missingSubFields: string[] = (() => {
    const miss: string[] = [];
    if (!form.no.trim()) miss.push("No");
    if (!form.perspektif.trim()) miss.push("Perspektif");
    if (!form.kpi.trim()) miss.push("KPI");
    const sep = form.satuan.indexOf("/");
    const uPart = sep >= 0 ? form.satuan.slice(0, sep).trim() : form.satuan.trim();
    const pPart = sep >= 0 ? form.satuan.slice(sep + 1).trim() : "";
    if (!uPart || !pPart) miss.push("Satuan & Periode");
    if (!form.formula.trim()) miss.push("Formula Pencapaian");
    if (!form.bobot.trim()) miss.push("Bobot");
    if (!form.polaritas.trim()) miss.push("Polaritas");
    if (!form.definisi.trim()) miss.push("Definisi / Deskripsi");
    if (!form.source.trim()) miss.push("Source");
    if (!form.baseline2025.trim()) miss.push("Baseline 2025");
    if (!form.target2026.trim()) miss.push("Target 2026 (isi Target Bulanan)");
    if (!form.detailFormula.trim()) miss.push("Detail Formula Pencapaian");
    return miss;
  })();
  const canClickAddPersonal = missingSubFields.length === 0 && !isSectionQuotaFull && (subUsedInSection + parsePctNum(form.bobot) <= activeSectionLimitNum + 1e-6);

  const handleAdd = () => {
    if (!canClickAddPersonal) {
      setAddTipOpen(true);
      return;
    }
    const bobot = parsePctNum(form.bobot);
    const sectionLimit = activeSectionLimitNum;
    const sectionUsed = calcSubSectionBobot(existingItems, form.section);
    if (sectionLimit > 0 && sectionUsed >= sectionLimit - 1e-6) {
      setBobotError({
        kind: "sub_section_bobot",
        sectionLabel: form.sectionLabel || `Section ${form.section}`,
        sectionLimit,
        remaining: Math.max(0, sectionLimit - sectionUsed),
        conflictItems: existingItems
          .filter((i) => i.section === form.section)
          .map((i) => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot })),
      });
      return;
    }
    if (sectionUsed + bobot > sectionLimit + 1e-6) {
      setBobotError({
        kind: "sub_section_bobot",
        sectionLabel: form.sectionLabel || `Section ${form.section}`,
        sectionLimit,
        remaining: Math.max(0, sectionLimit - sectionUsed),
        conflictItems: existingItems
          .filter((i) => i.section === form.section)
          .map((i) => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot })),
      });
      return;
    }
    const totalUsed = calcTotalBobot(existingItems);
    if (totalUsed + bobot > 100 + 1e-6) {
      setBobotError({ kind: "global", totalUsed, remaining: 100 - totalUsed,
        conflictItems: existingItems.map((i) => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot })) });
      return;
    }
    if (!hideCascading && sectionCascadeType) onSectionCascade?.(form.section, sectionCascadeType);
    // S2: Periode Tracking otomatis diambil dari bagian /Periode pada field Satuan (/Periode) di tab Sub Section
    const derivedTracking = derivePeriodeTrackingFromSatuan(form.satuan, form.trackingPeriod);
    const pinnedSectionBobot = `${formatPctNum(sectionLimit)}%`;
    onAdd({
      ...form,
      sectionBobot: pinnedSectionBobot,
      trackingPeriod: derivedTracking,
      id: `kpi-${Date.now()}`,
    });
    onClose();
  };

  // Sinkronkan section awal saat modal dibuka agar status read-only & sisa kuota langsung akurat
  useEffect(() => {
    if (existingItems.length > 0) {
      const sortedSecs = Array.from(new Set(existingItems.map((i) => i.section))).sort();
      // Utamakan section yang kuota sub-section-nya masih belum penuh, atau section pertama
      const openSec = sortedSecs.find((sec) => {
        const lim = resolveEffectiveSectionBobotNum(existingItems, sec, Boolean(forDivision));
        const used = calcSubSectionBobot(existingItems, sec);
        return lim > 0 && used < lim - 1e-6;
      });
      setSection(openSec ?? sortedSecs[0]);
    } else {
      setSection(forDivision ? firstDivision.value : firstPersonal.value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Section dari baris yang sudah ada (termasuk hasil copy KPI (Group)/(Unit)) + section manual
  const labelOf = (i: KPISetting) => (forDivision ? resolveKpiSectionLabel(i) : resolvePersonalSectionLabel(i));
  const existingSectionOpts = Array.from(new Map(existingItems.map((i) => [i.section, i])).values())
    .map((i) => ({ value: i.section, label: `${i.section} — ${labelOf(i)}`, bobot: i.sectionBobot ?? "" }));
  const baseSectionOptions = forDivision ? dynamicDivisionSections : dynamicPersonalSections;
  const sectionOptions = [
    ...existingSectionOpts,
    ...baseSectionOptions.filter((o) => !existingSectionOpts.some((e) => e.value === o.value)),
  ].sort((a, b) => a.value.localeCompare(b.value));
  const cascTypeOpts = master.cascadingTypes?.length
    ? master.cascadingTypes
    : [
        { value: "FC", description: "Full Cascading" },
        { value: "PC", description: "Partial Cascading" },
        { value: "CC", description: "Contributing Cascading" },
      ];
  const formulaOpts = master.formula?.length ? master.formula : FORMULA_OPTIONS;
  const polaritasOpts = master.polaritas?.length
    ? master.polaritas.map((v) => ({ value: v as Polaritas, label: v }))
    : POLARITAS_OPTIONS;
  const modalTitle = forDivision ? "Add New KPI — Division" : "Add New KPI — Personal";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5">
      <div
        className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[96vw] h-[93vh] max-h-[93vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-4 bg-gradient-to-r from-[#1A284F] via-[#233566] to-[#2B417A] text-white shrink-0">
          <div>
            <h3 className="font-bold text-white text-lg">{modalTitle}</h3>
            <p className="text-xs text-sky-200/90 mt-0.5">{forDivision ? "KPI Divisi 2026" : "KPI Personal 2026"}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg transition-colors" title="Close"><X className="w-4 h-4 text-white/80" /></button>
        </div>

        {/* Tabs */}
        <div className="flex items-center border-b border-slate-200/80 bg-slate-50/70 px-6 sm:px-8 pt-3 gap-1 shrink-0 flex-wrap">
          {([{ id: "section", label: "Section" }, { id: "subsection", label: "Sub Section" }] as const).map(t => (
            <button
              key={t.id}
              type="button"
              disabled={t.id === "subsection" && (!form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull)}
              onClick={() => {
                if (t.id === "subsection") handleNextToSubSection();
                else setTab("section");
              }}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tab === t.id ? "bg-[#1A284F] text-white" : "text-gray-500 hover:text-[#1A284F] hover:bg-gray-50"}`}>
              {t.label}
            </button>
          ))}
          {canLihatKpiAtasan && tab === "subsection" && (
            <button
              type="button"
              onClick={() => setShowLihatAtasan(true)}
              className="ml-2 mb-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Lihat KPI Atasan
            </button>
          )}
        </div>

        <div className="px-6 sm:px-8 py-5 flex flex-col gap-4 flex-1 overflow-y-auto">

          {/* ══ SECTION TAB ══ */}
          {tab === "section" && (
            <>
              <Field label="Section">
                <select value={manualSection ? "__manual__" : form.section} onChange={(e) => setSection(e.target.value)} className={inputCls}>
                  {sectionOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                  <option value="__manual__">+ Tambah Section Manual…</option>
                </select>
                {manualSection && (
                  <div className="mt-2 grid grid-cols-[90px_1fr] gap-2">
                    <select
                      value={form.section}
                      onChange={(e) => {
                        const code = e.target.value;
                        const st = computeSectionStateForCode(code);
                        setForm((p) => ({
                          ...p,
                          section: code,
                          sectionAlphabet: code + ".",
                          sectionBobot: st.sectionBobotStr,
                          bobot: "",
                        }));
                      }}
                      className={inputCls}
                      aria-label="Kode Section"
                    >
                      {SECTION_LETTERS.filter((l) => !existingItems.some((i) => i.section === l) || l === form.section).map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <input
                      value={form.sectionLabel ?? ""}
                      onChange={(e) => setForm(p => ({ ...p, sectionLabel: e.target.value }))}
                      placeholder="Nama section baru…"
                      className={inputCls}
                    />
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">Pilih section (termasuk section hasil copy) atau tambahkan section manual.</p>
              </Field>

              {/* Preview badge */}
              {form.section && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#1A284F]/5 border border-[#1A284F]/15">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold shrink-0"
                    style={{ background: (CORP_SECTION_META as Record<string, { bg: string }>)[form.section]?.bg ?? "#1A284F" }}>
                    {form.section}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1A284F] truncate">{form.sectionLabel}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Alphabet: <span className="font-semibold text-gray-600">{form.sectionAlphabet}</span></p>
                  </div>
                </div>
              )}

              {/* Section Bobot */}
              <Field label="Section Bobot">
                {isExistingSection ? (
                  <>
                    <div className={`${inputCls} bg-gray-100 text-[#1A284F] font-bold flex items-center justify-between cursor-not-allowed select-none`}>
                      <span>{`${formatPctNum(activeSectionLimitNum)}%`}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                        <Lock className="w-3.5 h-3.5" /> Read-only
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-700 mt-1 flex items-center gap-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Section ini sudah memiliki Sub Section sehingga bobot Section bersifat read-only di modal (dapat disesuaikan langsung pada dropdown tabel).
                    </p>
                  </>
                ) : isNewSectionBlockedBy100 ? (
                  <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
                    Total bobot seluruh Section yang ada sudah mencapai <strong>{formatPctNum(usedOtherSectionsBobot)}%</strong> (100%). Untuk membuat Section baru, kurangi terlebih dahulu bobot salah satu Section pada tabel.
                  </div>
                ) : (
                  <>
                    <select
                      value={form.sectionBobot ?? ""}
                      onChange={(e) => set("sectionBobot" as keyof typeof form, e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— Pilih Section Bobot (Maks. Sisa {formatPctNum(remainingSectionFrom100)}%) —</option>
                      {availableSectionBobotOpts.map((b) => (
                        <option key={b} value={b}>
                          {b}{parsePctNum(b) === remainingSectionFrom100 ? " (Sisa penuh dari 100%)" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      Bobot Section terpakai saat ini: <strong>{formatPctNum(usedOtherSectionsBobot)}%</strong> · Sisa kuota dari 100%: <strong>{formatPctNum(remainingSectionFrom100)}%</strong>.
                    </p>
                  </>
                )}
              </Field>

              {/* Info Sisa Kuota Sub Section pada Section terpilih */}
              {isExistingSection && (
                isSectionQuotaFull ? (
                  <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium leading-relaxed">
                    Total bobot Sub Section pada <strong>Section {form.section} ({form.sectionLabel})</strong> sudah terpenuhi <strong>{formatPctNum(subUsedInSection)}%</strong> dari batas <strong>{formatPctNum(activeSectionLimitNum)}%</strong>. Anda tidak dapat menambahkan Sub Section baru pada section ini kecuali mengurangi bobot Sub Section sebelumnya atau menaikkan bobot Section di tabel.
                  </div>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between flex-wrap gap-2">
                    <span>
                      Kuota Sub Section pada <strong>Section {form.section}</strong>: terpakai <strong>{formatPctNum(subUsedInSection)}%</strong> dari <strong>{formatPctNum(activeSectionLimitNum)}%</strong>
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Sisa tersedia: {formatPctNum(subRemainingInSection)}%
                    </span>
                  </div>
                )
              )}

              {/* Cascading */}
              {!hideCascading && (
              <Field label="Cascading">
                <select
                  value={sectionCascadeType}
                  onChange={(e) => setSectionCascadeType(e.target.value)}
                  className={inputCls}
                  style={{
                    background: CASCADING_CELL_BG[sectionCascadeType] ?? "#f9fafb",
                    borderColor: CASCADING_CELL_BORDER[sectionCascadeType] ?? "#e5e7eb",
                    color: CASCADING_CELL_COLOR[sectionCascadeType] ?? "#374151",
                    fontWeight: 700,
                  }}
                >
                  {cascTypeOpts.map((ct) => (
                    <option key={ct.value} value={ct.value} style={{ background: "#fff", color: "#1A284F" }}>
                      {ct.value} — {ct.description || ct.value}
                    </option>
                  ))}
                </select>
                <div className="mt-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[10px] text-gray-500 leading-relaxed">
                  {sectionCascadeType === "FC" && <><span className="font-bold text-indigo-700">FC — Full Cascading:</span> Level di bawah tidak dapat mengubah Section Bobot maupun nama section.</>}
                  {sectionCascadeType === "PC" && <><span className="font-bold text-amber-700">PC — Partial Cascading:</span> Level di bawah dapat mengubah Section Bobot, namun nama section tetap read-only.</>}
                  {sectionCascadeType === "CC" && <><span className="font-bold text-teal-700">CC — Contributing Cascading:</span> Level di bawah dapat mengubah Section Bobot dan Section Name.</>}
                </div>
              </Field>
              )}

              <div className="flex items-center justify-between pt-2">
                {!form.sectionBobot && !isNewSectionBlockedBy100 && (
                  <p className="text-[11px] text-amber-600 font-medium">Choose Section Bobot to continue.</p>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={handleNextToSubSection}
                    disabled={!form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull || (manualSection && !form.sectionLabel?.trim())}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed">
                    Next: Sub Section →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ══ SUB SECTION TAB ══ */}
          {tab === "subsection" && (
            <>
              {atasanBobotWarning && (
                <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{atasanBobotWarning}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#1A284F]/5 border border-[#1A284F]/15 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#1A284F] text-white font-bold">{form.section}</span>
                  <span className="font-bold text-[#1A284F]">{form.sectionLabel}</span>
                  <span className="text-gray-500">· Bobot Section: <strong>{formatPctNum(activeSectionLimitNum)}%</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Terpakai: <strong>{formatPctNum(subUsedInSection)}%</strong></span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold ${isSectionQuotaFull ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    Sisa Bobot Sub Section: {formatPctNum(subRemainingInSection)}%
                  </span>
                </div>
              </div>

              {isSectionQuotaFull && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                  Kuota bobot pada section ini sudah penuh ({formatPctNum(activeSectionLimitNum)}%). Tidak dapat menambahkan Sub Section baru.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="No *"><input value={form.no} onChange={(e) => set("no", e.target.value)} placeholder="e.g. 8" className={inputCls} /></Field>
                <Field label="Perspektif">
                  <select value={form.perspektif} onChange={(e) => set("perspektif", e.target.value)} className={inputCls}>
                    <option value="">— Perspektif —</option>
                    {form.perspektif && !master.perspektif.includes(form.perspektif) && (
                      <option value={form.perspektif}>{form.perspektif}</option>
                    )}
                    {master.perspektif.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="KPI *"><textarea rows={3} value={form.kpi} onChange={(e) => set("kpi", e.target.value)} placeholder="KPI name / description" className={inputCls + " resize-none"} /></Field>
              <SatuanField value={form.satuan} onChange={(v) => setForm((p) => ({ ...p, satuan: v, trackingPeriod: derivePeriodeTrackingFromSatuan(v, p.trackingPeriod) }))} unitOptions={master.satuan} periodeOptions={master.period} />

              <Field label="Formula Pencapaian">
                {colorMode || ratioMode
                  ? <div className={inputCls + " bg-gray-50 text-[#1A284F] font-semibold cursor-default select-none"}>{form.formula}</div>
                  : <select value={form.formula} onChange={(e) => set("formula", e.target.value)} className={inputCls}>
                      {formulaOpts.map((f) => <option key={f}>{f}</option>)}
                    </select>}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                {(() => {
                  const bobotExceedsRemaining = parsePctNum(form.bobot) > subRemainingInSection + 1e-6;
                  const showSoftRedBobot = bobotExceedsRemaining || (fromAtasanKpi && atasanBobotNeedsAdjust);
                  return (
                    <div
                      className={`flex flex-col gap-1.5 rounded-xl p-3.5 transition-all shadow-2xs ${
                        showSoftRedBobot
                          ? "bg-rose-50/90 border-2 border-rose-300 ring-2 ring-rose-100"
                          : `border ${FIELD_TONE_STYLES.emerald.wrap}`
                      }`}
                    >
                      <label
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${
                          showSoftRedBobot ? "text-rose-800" : FIELD_TONE_STYLES.emerald.label
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${showSoftRedBobot ? "bg-rose-500" : FIELD_TONE_STYLES.emerald.dot}`} />
                        <span>{`Bobot * (Maks. Sisa Section: ${formatPctNum(subRemainingInSection)}%)`}</span>
                      </label>
                      <select
                        value={form.bobot}
                        disabled={isSectionQuotaFull}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          set("bobot", nextVal);
                          const nextNum = parsePctNum(nextVal);
                          if (nextVal && nextNum <= subRemainingInSection + 1e-6) {
                            setAtasanBobotNeedsAdjust(false);
                            setAtasanBobotWarning(null);
                          }
                        }}
                        className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed ${
                          showSoftRedBobot ? "border-2 border-rose-300 bg-white text-rose-900 font-semibold" : ""
                        }`}
                      >
                        <option value="">— Pilih Bobot (Sisa {formatPctNum(subRemainingInSection)}%) —</option>
                        {availableSubBobotOpts.map((b) => {
                          const bNum = parsePctNum(b);
                          return (
                            <option key={b} value={b}>
                              {b}
                              {bNum > subRemainingInSection + 1e-6
                                ? ` (Melebihi sisa ${formatPctNum(subRemainingInSection)}% — wajib disesuaikan)`
                                : bNum === subRemainingInSection && subRemainingInSection > 0
                                  ? " (Gunakan seluruh sisa section)"
                                  : ""}
                            </option>
                          );
                        })}
                      </select>
                      {showSoftRedBobot && (
                        <p className="text-[11px] font-medium text-rose-700 leading-snug mt-0.5">
                          {bobotExceedsRemaining
                            ? `Bobot (${form.bobot}) melebihi sisa bobot Section ${form.section} (${formatPctNum(subRemainingInSection)}%). Sesuaikan bobot agar tidak melebihi sisa kuota.`
                            : `Bobot KPI Atasan (${form.bobot}) belum sama dengan sisa bobot Section ${form.section} (${formatPctNum(subRemainingInSection)}%). Pastikan sisa bobot disesuaikan.`}
                        </p>
                      )}
                    </div>
                  );
                })()}
                <Field label="Polaritas">
                  <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)} className={inputCls}>
                    {polaritasOpts.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Definisi / Deskripsi"><textarea rows={3} value={form.definisi} onChange={(e) => set("definisi", e.target.value)} className={inputCls + " resize-none"} /></Field>
              <Field label="Source"><input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. Laporan HRD" className={inputCls} /></Field>

              <ColorIndicatorRadio value={indicatorMode} onChange={setIndicatorMode} />

              {colorMode ? (
                <BaselineColorField value={form.baseline2025} onChange={(v) => set("baseline2025", v)} />
              ) : ratioMode ? (
                <Field label="Baseline 2025">
                  <select value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)} className={inputCls}>
                    <option value="">— Pilih Ratio —</option>
                    {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              ) : (
                <Field label="Baseline 2025"><input value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)} className={inputCls} /></Field>
              )}

              <MonthlyTargetTable
                monthlyTargets={form.monthlyTargets ?? {}}
                formula={form.formula}
                colorMode={colorMode}
                ratioMode={ratioMode}
                softOrangeHighlight={fromAtasanKpi}
                onChange={(mt, computed) => setForm((p) => ({ ...p, monthlyTargets: mt, target2026: computed }))}
              />

              <Target2026Field
                value={form.target2026}
                colorMode={colorMode}
                ratioMode={ratioMode}
                monthlyTargets={form.monthlyTargets}
                softOrangeHighlight={fromAtasanKpi}
              />

              <Field label="Detail Formula Pencapaian"><textarea rows={4} value={form.detailFormula} onChange={(e) => set("detailFormula", e.target.value)} className={inputCls + " resize-none"} /></Field>
              <Field label="Keterangan"><textarea rows={3} value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} className={inputCls + " resize-none"} /></Field>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 sm:px-8 py-4 border-t border-gray-100 shrink-0 bg-gray-50/40">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">Cancel</button>
          {tab === "subsection" && (
            <Tooltip open={!canClickAddPersonal && addTipOpen} onOpenChange={setAddTipOpen}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="inline-flex"
                  onMouseEnter={() => { if (!canClickAddPersonal) setAddTipOpen(true); }}
                  onMouseLeave={() => setAddTipOpen(false)}
                  onClick={() => { if (!canClickAddPersonal) setAddTipOpen((o) => !o); }}
                >
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!canClickAddPersonal}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    <Plus className="w-4 h-4" /> Add KPI
                  </button>
                </span>
              </TooltipTrigger>
              {!canClickAddPersonal && (
                <TooltipContent side="top" align="end" className="max-w-sm bg-[#1A284F] text-white p-3 rounded-xl shadow-xl z-[80]">
                  <p className="text-xs font-bold text-amber-300 mb-1">Lengkapi field mandatory berikut:</p>
                  <p className="text-[11px] leading-relaxed text-white/95">{missingSubFields.join(", ") || "Periksa kuota bobot Section."}</p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>
      </div>
      {bobotError && <BobotExceededModal violation={bobotError} onClose={() => setBobotError(null)} />}
      {showLihatAtasan && (
        <LihatKpiAtasanModal
          ownerUser={ownerUser ?? activeActor}
          targetSectionCode={form.section}
          targetSectionLabel={form.sectionLabel || `Section ${form.section}`}
          remainingSectionBobot={subRemainingInSection}
          onSelectKpi={(picked) => {
            const pickedBobotNum = parsePctNum(picked.bobot);
            const exceeds = pickedBobotNum > subRemainingInSection + 1e-6;
            const mismatch = Math.abs(pickedBobotNum - subRemainingInSection) > 1e-6;
            setFromAtasanKpi(true);
            setAtasanBobotNeedsAdjust(mismatch);
            if (exceeds) {
              setAtasanBobotWarning(
                `Bobot KPI Atasan (${picked.bobot}) melebihi sisa bobot Section ${form.section} (${formatPctNum(subRemainingInSection)}%). Sisa bobot wajib disesuaikan pada field Bobot bertanda merah muda sebelum menyimpan.`,
              );
            } else if (mismatch) {
              setAtasanBobotWarning(
                `Bobot KPI Atasan (${picked.bobot}) belum menutup seluruh sisa bobot Section ${form.section} (${formatPctNum(subRemainingInSection)}%). Pastikan sisa bobot disesuaikan setelah KPI ditambahkan.`,
              );
            } else {
              setAtasanBobotWarning(null);
            }
            // Pastikan seluruh 12 bulan Monthly Target & Target 2026 terisi penuh dari KPI Atasan
            const normalizedMonthly: Record<string, string> = {};
            const srcMt = picked.monthlyTargets ?? {};
            MONTHS_LIST.forEach((mKey, mIdx) => {
              const shortKey = MONTHS_SHORT[mIdx];
              const val = srcMt[mKey] ?? srcMt[shortKey] ?? "";
              if (val !== "") normalizedMonthly[mKey] = String(val);
            });
            if (Object.keys(normalizedMonthly).length === 0 && picked.target2026) {
              const pickedMode = picked.indicatorMode ?? (picked.colorIndicator ? "color" : "numeric");
              if (pickedMode === "color" || pickedMode === "ratio" || picked.formula === "Nilai Akhir" || picked.formula === "Rata-Rata") {
                MONTHS_LIST.forEach((mKey) => {
                  normalizedMonthly[mKey] = String(picked.target2026);
                });
              } else {
                const cleanTargetNum = parseFloat(String(picked.target2026).replace(/[^0-9.-]/g, ""));
                if (Number.isFinite(cleanTargetNum)) {
                  const perMonth = Math.round((cleanTargetNum / 12) * 100) / 100;
                  MONTHS_LIST.forEach((mKey) => {
                    normalizedMonthly[mKey] = String(perMonth);
                  });
                }
              }
            }
            const resolvedMode: IndicatorMode =
              picked.indicatorMode ?? (picked.colorIndicator ? "color" : "numeric");
            const resolvedFormula =
              picked.formula ||
              (resolvedMode === "color" ? "Nilai Akhir" : resolvedMode === "ratio" ? "Jumlah" : form.formula);
            const resolvedTarget2026 =
              picked.target2026 ||
              (resolvedMode === "ratio"
                ? computeRatioTarget2026(normalizedMonthly)
                : computeTarget2026(normalizedMonthly, resolvedFormula));
            const nextSeqNo = existingItems.some((x) => x.no === picked.no)
              ? String(existingItems.length + 1)
              : picked.no || String(existingItems.length + 1);
            setForm((p) => ({
              ...p,
              no: p.no.trim() || nextSeqNo,
              perspektif: picked.perspektif || p.perspektif,
              kpi: picked.kpi || p.kpi,
              satuan: picked.satuan || p.satuan,
              formula: resolvedFormula,
              bobot: picked.bobot || p.bobot,
              definisi: picked.definisi || "",
              source: picked.source || "",
              baseline2025: picked.baseline2025 || "",
              target2026: resolvedTarget2026,
              polaritas: picked.polaritas || "Maximize",
              detailFormula: picked.detailFormula || "",
              keterangan: picked.keterangan || "",
              monthlyTargets: normalizedMonthly,
              colorIndicator: resolvedMode === "color",
              indicatorMode: resolvedMode,
              ratioPositiveLabel: picked.ratioPositiveLabel,
              ratioNegativeLabel: picked.ratioNegativeLabel,
              cascading: picked.cascading ?? p.cascading,
              copiedFromId: picked.id,
              trackingPeriod: derivePeriodeTrackingFromSatuan(picked.satuan || p.satuan, picked.trackingPeriod || p.trackingPeriod),
            }));
          }}
          onClose={() => setShowLihatAtasan(false)}
        />
      )}
    </div>
  );
}

// ─── Add Corporate KPI Modal ─────────────────────────────────────────────────


// Reverse-lookup: master section label → single-letter code (A–F for known sections)
const SECTION_LABEL_TO_CODE: Record<string, string> = {
  "Kinerja K3L Terintegrasi (SMK3/HSE)": "A",
  "Finansial": "B",
  "Produksi": "C",
  "Be Employer of Choices": "D",
  "Be Partner of Choices": "E",
  "Regulatory Compliance": "F",
};

// Palette for custom sections (G, H, …) added via master data
const CUSTOM_SECTION_BG_PALETTE = [
  "#4527A0", // deep purple
  "#00695C", // teal
  "#5D4037", // brown
  "#0277BD", // ocean blue
  "#E65100", // deep orange
  "#2E7D32", // forest green
  "#6A1B9A", // violet
  "#BF360C", // deep red
];

// Returns the letter code for a master section label
// Returns the letter code for a section label.
// usedCodes = letter codes already present in the table (so new custom sections get the next free letter).
function getMasterSectionCode(label: string, allMasterLabels: string[], usedCodes: string[] = []): string {
  if (SECTION_LABEL_TO_CODE[label]) return SECTION_LABEL_TO_CODE[label];
  // Start from G and skip letters already in use
  let charCode = "G".charCodeAt(0);
  while (usedCodes.includes(String.fromCharCode(charCode))) charCode++;
  return String.fromCharCode(charCode);
}

const TRACKING_PERIOD_OPTIONS = ["Bulanan", "Triwulan", "Semesteran", "Tahunan"];

type CorporateKPIForm = Omit<KPISetting, "id"> & {
  sectionAlphabet: string;
  sectionBobot: string;
  scope: string; trackingPeriod: string;
  coo: string; gmVgmIndustry: string; gmVgmPerkebunan: string;
  gmAsd: string; gmRstm: string; gmGhs: string;
  cascadingMap: Record<string, string>;
};


// ─── Scope multi-checkbox dropdown ───────────────────────────────────────────

function ScopeCheckboxField({ options, value, onChange, hideLabel }: {
  options: string[];
  value: string[];
  onChange: (vals: string[]) => void;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt];
    onChange(next);
  };

  const displayLabel = value.length === 0
    ? "— Scope —"
    : value.length === 1
      ? value[0]
      : `${value.length} selected`;

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      {!hideLabel && <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Scope</label>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputCls} text-left flex items-center justify-between gap-1 ${value.length === 0 ? "text-gray-400" : "text-gray-800"}`}
      >
        <span className="truncate text-sm">{displayLabel}</span>
        <svg className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-3.5 h-3.5 rounded accent-[#1A284F] cursor-pointer"
              />
              <span className="leading-tight">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-medium">
              {v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-blue-900 leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cascading Dropdown Row ───────────────────────────────────────────────────

function CascadingDropdownRow({
  type, desc, style, allRoles, cascadingMap, selectedInType, onChange,
}: {
  type: string;
  desc: string;
  style: { bg: string; border: string; color: string; pill: string; pillText: string };
  allRoles: { key: string; label: string }[];
  cascadingMap: Record<string, string>;
  selectedInType: { key: string; label: string }[];
  onChange: (key: string, currentlyChecked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = allRoles.filter(r =>
    r.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex items-start gap-2" ref={ref}>
      {/* Type badge */}
      <div className="flex items-center gap-1.5 pt-1.5 shrink-0 w-36">
        <span className="text-[11px] font-black px-2 py-0.5 rounded-md"
          style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.color }}>
          {type}
        </span>
        <span className="text-[10px] font-medium text-gray-500 leading-tight">{desc}</span>
      </div>

      {/* Dropdown trigger + pills */}
      <div className="flex-1 relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center flex-wrap gap-1 min-h-[32px] px-2 py-1 border rounded-lg text-left cursor-pointer transition-colors"
          style={{
            borderColor: open ? style.border : "#e5e7eb",
            background: open ? style.bg + "33" : "white",
          }}
        >
          {selectedInType.length === 0 ? (
            <span className="text-[11px] text-gray-400 flex-1">— Pilih role —</span>
          ) : (
            selectedInType.map(r => (
              <span key={r.key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: style.pill, color: style.pillText }}>
                {r.label}
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onChange(r.key, true); }}
                  className="ml-0.5 leading-none cursor-pointer hover:opacity-70"
                >×</span>
              </span>
            ))
          )}
          <svg className={`w-3 h-3 text-gray-400 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {/* Search */}
            <div className="px-2.5 py-2 border-b border-gray-100">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari role..."
                className="w-full text-[11px] px-2.5 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              />
            </div>
            {/* Options */}
            <div className="max-h-44 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-3">Tidak ditemukan</p>
              ) : filtered.map(r => {
                const assignedTo = cascadingMap[r.key] ?? "";
                const isChecked = assignedTo === type;
                const isOther = assignedTo !== "" && assignedTo !== type;
                const CASC_STYLE_MAP: Record<string, { bg: string; color: string }> = {
                  FC: { bg: "#e0e7ff", color: "#312e81" },
                  PC: { bg: "#fef3c7", color: "#78350f" },
                  CC: { bg: "#ccfbf1", color: "#134e4a" },
                };
                return (
                  <label key={r.key}
                    className={`flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none transition-colors ${
                      isChecked ? "bg-blue-50/60" : "hover:bg-gray-50"
                    }`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onChange(r.key, isChecked)}
                      className="w-3.5 h-3.5 rounded cursor-pointer shrink-0"
                      style={{ accentColor: style.color }}
                    />
                    <span className={`text-[11px] flex-1 leading-tight ${isChecked ? "font-semibold" : "text-gray-700"}`}
                      style={isChecked ? { color: style.color } : {}}>
                      {r.label}
                    </span>
                    {isOther && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: CASC_STYLE_MAP[assignedTo]?.bg, color: CASC_STYLE_MAP[assignedTo]?.color }}>
                        {assignedTo}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AddCorporateKPIModal({ onAdd, onClose, existingItems = [], sectionLabel = "Business", hideScope = false, hideCascading = false }: { onAdd: (item: KPISetting) => void; onClose: () => void; existingItems?: KPISetting[]; sectionLabel?: string; hideScope?: boolean; hideCascading?: boolean }) {
  const master = useMasterKpi();
  const corpFormulaOpts = master.formula?.length ? master.formula : FORMULA_OPTIONS;
  const corpPolaritasOpts = master.polaritas?.length
    ? master.polaritas.map((v) => ({ value: v as Polaritas, label: v }))
    : POLARITAS_OPTIONS;
  const corpCascTypeOpts = master.cascadingTypes?.length
    ? master.cascadingTypes
    : [
        { value: "FC", description: "Full Cascading" },
        { value: "PC", description: "Partial Cascading" },
        { value: "CC", description: "Contributing Cascading" },
      ];
  const [tab, setTab] = useState<"section" | "subsection">("section");
  const [manualCustomSection, setManualCustomSection] = useState(false);
  const [form, setForm] = useState<CorporateKPIForm>({
    no: "", sectionAlphabet: "", sectionBobot: "", section: "",
    sectionLabel: "",
    perspektif: "", kpi: "", satuan: "", formula: "Jumlah",
    bobot: "", definisi: "", source: "", baseline2025: "", target2026: "", polaritas: "Maximize",
    detailFormula: "", keterangan: "", monthlyTargets: {}, colorIndicator: false, indicatorMode: "numeric" as IndicatorMode,
    scope: "", trackingPeriod: "",
    coo: "", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
    cascadingMap: {},
  });
  const indicatorMode: IndicatorMode = form.indicatorMode ?? "numeric";
  const colorMode = indicatorMode === "color";
  const ratioMode = indicatorMode === "ratio";

  const set = (key: keyof CorporateKPIForm, val: string) => setForm((p) => {
    const next = { ...p, [key]: val } as CorporateKPIForm;
    if (key === "formula") next.target2026 = computeTarget2026(p.monthlyTargets ?? {}, val);
    return next;
  });

  const computeCorpSectionState = (code: string, label: string) => {
    const existingRows = existingItems.filter((i) => i.section === code);
    const isExisting = existingRows.length > 0;
    const usedOther = calcAllSectionsBobotSum(existingItems, true, undefined, code);
    const remainingFrom100 = Math.max(0, Math.round((100 - usedOther) * 100) / 100);
    if (isExisting) {
      const lockedNum = resolveEffectiveSectionBobotNum(existingItems, code, true);
      return {
        isExisting: true,
        sectionBobotStr: `${formatPctNum(lockedNum)}%`,
        remainingFrom100,
        resolvedLabel: resolveKpiSectionLabel(existingRows[0]) || label,
      };
    }
    const metaBobotStr = (CORP_SECTION_META as Record<string, { label: string; bobot: string; bg: string }>)[code]?.bobot ?? "";
    const metaNum = parsePctNum(metaBobotStr);
    const suggestedNum = metaNum > 0 && metaNum <= remainingFrom100 ? metaNum : remainingFrom100;
    return {
      isExisting: false,
      sectionBobotStr: remainingFrom100 > 0 ? `${formatPctNum(suggestedNum)}%` : "",
      remainingFrom100,
      resolvedLabel: label,
    };
  };

  const selectSectionByCodeOrManual = (choice: string) => {
    const usedCodes = Array.from(new Set(existingItems.map((i) => i.section).filter(Boolean)));
    if (choice === "__manual__") {
      const nextFree = SECTION_LETTERS.find((l) => !usedCodes.includes(l)) ?? "G";
      const st = computeCorpSectionState(nextFree, "");
      setManualCustomSection(true);
      setForm((p) => ({
        ...p,
        section: nextFree,
        sectionAlphabet: `${nextFree}.`,
        sectionLabel: "",
        sectionBobot: st.sectionBobotStr,
        bobot: "",
      }));
      return;
    }
    setManualCustomSection(false);
    const sepIdx = choice.indexOf("::");
    const code = sepIdx >= 0 ? choice.slice(0, sepIdx) : choice;
    const lbl = sepIdx >= 0 ? choice.slice(sepIdx + 2) : choice;
    const st = computeCorpSectionState(code, lbl);
    setForm((p) => ({
      ...p,
      section: code,
      sectionAlphabet: `${code}.`,
      sectionLabel: st.resolvedLabel,
      sectionBobot: st.sectionBobotStr,
      bobot: "",
    }));
  };

  const setSection = (label: string) => {
    const usedCodes = Array.from(new Set(existingItems.map(i => i.section).filter(Boolean)));
    const existingMatch = existingItems.find((i) => resolveKpiSectionLabel(i).trim().toLowerCase() === label.trim().toLowerCase());
    const code = existingMatch?.section ?? getMasterSectionCode(label.trim(), master.section, usedCodes);
    const st = computeCorpSectionState(code, label);
    setForm(p => ({
      ...p,
      sectionLabel: label,
      section: code,
      sectionAlphabet: code + ".",
      sectionBobot: st.sectionBobotStr,
      bobot: "",
    }));
  };

  useEffect(() => {
    const existingSecMap = new Map<string, KPISetting>();
    existingItems.forEach((i) => {
      if (i.section && !existingSecMap.has(i.section)) existingSecMap.set(i.section, i);
    });
    if (existingSecMap.size > 0) {
      const sortedCodes = Array.from(existingSecMap.keys()).sort();
      const openCode = sortedCodes.find((c) => {
        const lim = resolveEffectiveSectionBobotNum(existingItems, c, true);
        const used = calcSubSectionBobot(existingItems, c);
        return lim > 0 && used < lim - 1e-6;
      });
      const chosenCode = openCode ?? sortedCodes[0];
      const chosenLbl = resolveKpiSectionLabel(existingSecMap.get(chosenCode));
      selectSectionByCodeOrManual(`${chosenCode}::${chosenLbl}`);
    } else {
      const firstLbl = master.section[0] || "Kinerja K3L Terintegrasi (SMK3/HSE)";
      const firstCode = getMasterSectionCode(firstLbl, master.section, []);
      selectSectionByCodeOrManual(`${firstCode}::${firstLbl}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setIndicatorMode = (mode: IndicatorMode) => setForm((p) => ({
    ...p,
    indicatorMode: mode,
    colorIndicator: mode === "color",
    monthlyTargets: {},
    baseline2025: "",
    target2026: "",
    ...(mode === "color" ? { formula: "Nilai Akhir" } : mode === "ratio" ? { formula: "Jumlah" } : {}),
  }));

  const [bobotError, setBobotError] = useState<BobotViolation | null>(null);

  const isExistingSection = Boolean(form.section && existingItems.some((i) => i.section === form.section));
  const usedOtherSectionsBobot = calcAllSectionsBobotSum(existingItems, true, undefined, form.section || undefined);
  const remainingSectionFrom100 = Math.max(0, Math.round((100 - usedOtherSectionsBobot) * 100) / 100);
  const activeSectionLimitNum = isExistingSection
    ? resolveEffectiveSectionBobotNum(existingItems, form.section, true)
    : parsePctNum(form.sectionBobot);
  const subUsedInSection = form.section ? Math.round(calcSubSectionBobot(existingItems, form.section) * 100) / 100 : 0;
  const subRemainingInSection = Math.max(0, Math.round((activeSectionLimitNum - subUsedInSection) * 100) / 100);
  const isSectionQuotaFull = activeSectionLimitNum > 0 && subRemainingInSection <= 1e-6;
  const isNewSectionBlockedBy100 = !isExistingSection && remainingSectionFrom100 <= 1e-6;

  const availableCorpSectionBobotOpts = buildRemainingBobotOptions(1, remainingSectionFrom100);
  const availableCorpSubBobotOpts = buildRemainingBobotOptions(
    activeSectionLimitNum === 0 ? 0 : 1,
    subRemainingInSection,
    undefined,
    activeSectionLimitNum === 0,
  );

  const corpSectionDropdownOpts = (() => {
    const map = new Map<string, { code: string; label: string; isExisting: boolean }>();
    existingItems.forEach((i) => {
      if (i.section && !map.has(i.section)) {
        map.set(i.section, { code: i.section, label: resolveKpiSectionLabel(i), isExisting: true });
      }
    });
    const usedCodes = Array.from(map.keys());
    master.section.forEach((lbl) => {
      const alreadyByLabel = Array.from(map.values()).some((v) => v.label.trim().toLowerCase() === lbl.trim().toLowerCase());
      if (alreadyByLabel) return;
      const c = getMasterSectionCode(lbl, master.section, usedCodes);
      if (!map.has(c)) {
        usedCodes.push(c);
        map.set(c, { code: c, label: lbl, isExisting: false });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  })();

  const handleNextToSubSection = () => {
    if (!form.sectionLabel?.trim() || !form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull) return;
    const newSectionBobot = parsePctNum(form.sectionBobot);
    if (!isExistingSection && usedOtherSectionsBobot + newSectionBobot > 100 + 1e-6) {
      const conflictItems = Array.from(
        new Map(existingItems.map(i => [i.section, i])).values()
      ).map(i => ({
        no: i.section,
        label: resolveKpiSectionLabel(i),
        bobot: `${formatPctNum(resolveEffectiveSectionBobotNum(existingItems, i.section, true))}%`,
      }));
      setBobotError({ kind: "section_bobot", totalUsed: usedOtherSectionsBobot, remaining: remainingSectionFrom100, conflictItems });
      return;
    }
    setTab("subsection");
  };

  const handleAdd = () => {
    if (!form.no.trim() || !form.kpi.trim() || !form.bobot) return;
    const kpiBobot = parsePctNum(form.bobot);
    const sectionLimit = activeSectionLimitNum;
    const subUsed = calcSubSectionBobot(existingItems, form.section);
    if ((sectionLimit > 0 && subUsed >= sectionLimit - 1e-6) || subUsed + kpiBobot > sectionLimit + 1e-6) {
      const conflictItems = existingItems
        .filter(i => i.section === form.section)
        .map(i => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot }));
      setBobotError({ kind: "sub_section_bobot", sectionLabel: form.sectionLabel || `Section ${form.section}`, sectionLimit, remaining: Math.max(0, sectionLimit - subUsed), conflictItems });
      return;
    }
    const derivedTracking = derivePeriodeTrackingFromSatuan(form.satuan, form.trackingPeriod);
    onAdd({
      ...form,
      sectionBobot: `${formatPctNum(sectionLimit)}%`,
      trackingPeriod: derivedTracking,
      id: `corp-kpi-${Date.now()}`,
    });
    onClose();
  };

  const TABS = [
    { id: "section" as const,    label: "Section" },
    { id: "subsection" as const, label: "Sub Section" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 sm:p-5">
      <div
        className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[96vw] h-[93vh] max-h-[93vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-4 bg-gradient-to-r from-[#1A284F] via-[#233566] to-[#2B417A] text-white shrink-0">
          <div>
            <h3 className="font-bold text-white text-lg">Add New KPI — {sectionLabel}</h3>
            <p className="text-xs text-sky-200/90 mt-0.5">{sectionLabel === "Division" ? "KPI Divisi 2026" : "KPI Bisnis RSUP Group 2026"}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/15 rounded-lg transition-colors" title="Close"><X className="w-4 h-4 text-white/80" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200/80 bg-slate-50/70 px-6 sm:px-8 pt-3 gap-1 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              disabled={t.id === "subsection" && (!form.sectionLabel?.trim() || !form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull)}
              onClick={() => {
                if (t.id === "subsection") handleNextToSubSection();
                else setTab("section");
              }}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                tab === t.id
                  ? "bg-[#1A284F] text-white"
                  : "text-gray-500 hover:text-[#1A284F] hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 sm:px-8 py-5 flex flex-col gap-4 flex-1 overflow-y-auto">

          {/* ══ SECTION TAB ══ */}
          {tab === "section" && (
            <>
              <Field label="Section">
                <select
                  value={
                    manualCustomSection
                      ? "__manual__"
                      : corpSectionDropdownOpts.some((o) => o.code === form.section)
                      ? `${form.section}::${corpSectionDropdownOpts.find((o) => o.code === form.section)?.label ?? form.sectionLabel}`
                      : "__manual__"
                  }
                  onChange={(e) => selectSectionByCodeOrManual(e.target.value)}
                  className={inputCls}
                >
                  {corpSectionDropdownOpts.map((o) => (
                    <option key={o.code} value={`${o.code}::${o.label}`}>
                      {o.code} — {o.label}{o.isExisting ? ` (Sudah ada · Bobot ${formatPctNum(resolveEffectiveSectionBobotNum(existingItems, o.code, true))}%)` : ""}
                    </option>
                  ))}
                  <option value="__manual__">+ Tambah Section Baru…</option>
                </select>
                {manualCustomSection && (
                  <div className="mt-2 grid grid-cols-[90px_1fr] gap-2">
                    <select
                      value={form.section}
                      onChange={(e) => {
                        const nextCode = e.target.value;
                        const st = computeCorpSectionState(nextCode, form.sectionLabel ?? "");
                        setForm((p) => ({
                          ...p,
                          section: nextCode,
                          sectionAlphabet: `${nextCode}.`,
                          sectionBobot: st.sectionBobotStr,
                          bobot: "",
                        }));
                      }}
                      className={inputCls}
                      aria-label="Kode Section"
                    >
                      {SECTION_LETTERS.filter((l) => !existingItems.some((i) => i.section === l) || l === form.section).map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                    <input
                      value={form.sectionLabel ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, sectionLabel: e.target.value }))}
                      placeholder="Ketik nama section baru…"
                      className={inputCls}
                    />
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  Pilih dari section yang sudah ada / master section, atau tambahkan section baru.
                </p>
              </Field>

              {/* Preview badge — shows auto-derived alphabet + section color */}
              {form.sectionLabel?.trim() && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#1A284F]/5 border border-[#1A284F]/15">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white text-xs font-bold shrink-0"
                    style={{ background: CORP_SECTION_META[form.section]?.bg ?? CUSTOM_SECTION_BG_PALETTE[0] }}
                  >
                    {form.section}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#1A284F] truncate">{form.sectionLabel}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Alphabet: <span className="font-semibold text-gray-600">{form.sectionAlphabet}</span>
                      {!SECTION_LABEL_TO_CODE[form.sectionLabel] && (
                        <span className="ml-2 text-purple-600 font-semibold">· New custom section</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Section Bobot — auto-filled when existing section is selected */}
              <Field label="Section Bobot">
                {isExistingSection ? (
                  <>
                    <div className={`${inputCls} bg-gray-100 text-[#1A284F] font-bold flex items-center justify-between cursor-not-allowed select-none`}>
                      <span>{`${formatPctNum(activeSectionLimitNum)}%`}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                        <Lock className="w-3.5 h-3.5" /> Read-only
                      </span>
                    </div>
                    <p className="text-[11px] text-blue-700 mt-1 flex items-center gap-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      Section ini sudah memiliki Sub Section sehingga bobot Section bersifat read-only di modal (dapat diubah melalui dropdown pada baris Section di tabel).
                    </p>
                  </>
                ) : isNewSectionBlockedBy100 ? (
                  <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-medium">
                    Total bobot seluruh Section yang ada sudah mencapai <strong>{formatPctNum(usedOtherSectionsBobot)}%</strong> (100%). Kurangi bobot salah satu Section pada tabel terlebih dahulu jika ingin membuat Section baru.
                  </div>
                ) : (
                  <>
                    <select value={form.sectionBobot} onChange={(e) => set("sectionBobot", e.target.value)} className={inputCls}>
                      <option value="">— Pilih Section Bobot (Maks. Sisa {formatPctNum(remainingSectionFrom100)}%) —</option>
                      {availableCorpSectionBobotOpts.map((b) => (
                        <option key={b} value={b}>
                          {b}{parsePctNum(b) === remainingSectionFrom100 ? " (Sisa penuh dari 100%)" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      Bobot Section terpakai saat ini: <strong>{formatPctNum(usedOtherSectionsBobot)}%</strong> · Sisa kuota dari 100%: <strong>{formatPctNum(remainingSectionFrom100)}%</strong>.
                    </p>
                  </>
                )}
              </Field>

              {isExistingSection && (
                isSectionQuotaFull ? (
                  <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium leading-relaxed">
                    Total bobot Sub Section pada <strong>Section {form.section} ({form.sectionLabel})</strong> sudah terpenuhi <strong>{formatPctNum(subUsedInSection)}%</strong> dari batas <strong>{formatPctNum(activeSectionLimitNum)}%</strong>. Tidak dapat menambahkan Sub Section baru pada section ini kecuali mengurangi bobot Sub Section sebelumnya atau menaikkan bobot Section di tabel.
                  </div>
                ) : (
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between flex-wrap gap-2">
                    <span>
                      Kuota Sub Section pada <strong>Section {form.section}</strong>: terpakai <strong>{formatPctNum(subUsedInSection)}%</strong> dari <strong>{formatPctNum(activeSectionLimitNum)}%</strong>
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Sisa tersedia: {formatPctNum(subRemainingInSection)}%
                    </span>
                  </div>
                )
              )}

              <div className="flex items-center justify-between pt-2">
                {(!form.sectionLabel?.trim() || !form.sectionBobot) && !isNewSectionBlockedBy100 && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    {!form.sectionLabel?.trim() ? "Enter a section name." : "Choose Section Bobot to continue."}
                  </p>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={handleNextToSubSection}
                    disabled={!form.sectionLabel?.trim() || !form.sectionBobot || isNewSectionBlockedBy100 || isSectionQuotaFull}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next: Sub Section →
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ══ SUB SECTION TAB ══ */}
          {tab === "subsection" && (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#1A284F]/5 border border-[#1A284F]/15 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#1A284F] text-white font-bold">{form.section}</span>
                  <span className="font-bold text-[#1A284F]">{form.sectionLabel}</span>
                  <span className="text-gray-500">· Bobot Section: <strong>{formatPctNum(activeSectionLimitNum)}%</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Terpakai: <strong>{formatPctNum(subUsedInSection)}%</strong></span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold ${isSectionQuotaFull ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    Sisa Bobot Sub Section: {formatPctNum(subRemainingInSection)}%
                  </span>
                </div>
              </div>

              {isSectionQuotaFull && (
                <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                  Kuota bobot pada section ini sudah penuh ({formatPctNum(activeSectionLimitNum)}%). Tidak dapat menambahkan Sub Section baru.
                </div>
              )}

              {/* No (narrow) + Perspektif */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "100px 1fr" }}>
                <Field label="No *">
                  <input value={form.no} onChange={(e) => set("no", e.target.value)} placeholder="e.g. 1a" className={inputCls} />
                </Field>
                <Field label="Perspektif">
                  <select value={form.perspektif} onChange={(e) => set("perspektif", e.target.value)} className={inputCls}>
                    <option value="">— Perspektif —</option>
                    {master.perspektif.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="KPI *">
                <textarea rows={3} value={form.kpi} onChange={(e) => set("kpi", e.target.value)} placeholder="KPI name / description" className={inputCls + " resize-none"} />
              </Field>

              <SatuanField value={form.satuan} onChange={(v) => set("satuan", v)} unitOptions={master.satuan} periodeOptions={master.period} />

              {/* Formula Setahun | Tracking Period | Scope */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Formula Setahun">
                  {colorMode || ratioMode
                    ? <div className={inputCls + " bg-gray-50 text-[#1A284F] font-semibold cursor-default select-none"}>{form.formula}</div>
                    : <select value={form.formula} onChange={(e) => set("formula", e.target.value)} className={inputCls}>
                        {corpFormulaOpts.map((f) => <option key={f}>{f}</option>)}
                      </select>}
                </Field>
                <Field label="Periode Tracking (dari Satuan)">
                  <div className={inputCls + " bg-gray-50 text-[#1A284F] font-semibold select-none"}>
                    {derivePeriodeTrackingFromSatuan(form.satuan, form.trackingPeriod) || "—"}
                  </div>
                </Field>
                {!hideScope && (
                  <ScopeCheckboxField
                    options={master.scope}
                    value={form.scope ? form.scope.split(", ").filter(Boolean) : []}
                    onChange={(vals) => set("scope", vals.join(", "))}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label={`Bobot * (Maks. Sisa Section: ${formatPctNum(subRemainingInSection)}%)`}>
                  <select
                    value={form.bobot}
                    disabled={isSectionQuotaFull}
                    onChange={(e) => set("bobot", e.target.value)}
                    className={inputCls + " disabled:bg-gray-100 disabled:cursor-not-allowed"}
                  >
                    <option value="">— Pilih Bobot (Sisa {formatPctNum(subRemainingInSection)}%) —</option>
                    {availableCorpSubBobotOpts.map((b) => (
                      <option key={b} value={b}>
                        {b}{parsePctNum(b) === subRemainingInSection && subRemainingInSection > 0 ? " (Gunakan seluruh sisa section)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Polaritas">
                  <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)} className={inputCls}>
                    {corpPolaritasOpts.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Definisi / Deskripsi">
                <textarea rows={3} value={form.definisi} onChange={(e) => set("definisi", e.target.value)} className={inputCls + " resize-none"} />
              </Field>

              <Field label="Source">
                <input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. Laporan Komite K3" className={inputCls} />
              </Field>

              {/* Indicator & targets */}
              <ColorIndicatorRadio value={indicatorMode} onChange={setIndicatorMode} />

              {colorMode
                ? <BaselineColorField value={form.baseline2025} onChange={(v) => set("baseline2025", v)} />
                : ratioMode
                ? <Field label="Baseline 2025">
                    <select value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)} className={inputCls}>
                      <option value="">— Pilih Ratio —</option>
                      {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                : <Field label="Baseline 2025"><input value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)} className={inputCls} /></Field>}

              <MonthlyTargetTable
                monthlyTargets={form.monthlyTargets ?? {}}
                formula={form.formula}
                colorMode={colorMode}
                ratioMode={ratioMode}
                onChange={(mt, computed) => setForm((p) => ({ ...p, monthlyTargets: mt, target2026: computed }))}
              />

              <Target2026Field
                value={form.target2026}
                colorMode={colorMode}
                ratioMode={ratioMode}
                monthlyTargets={form.monthlyTargets}
              />

              <Field label="Detail Formula Pencapaian">
                <textarea rows={4} value={form.detailFormula} onChange={(e) => set("detailFormula", e.target.value)} className={inputCls + " resize-none"} />
              </Field>

              <Field label="Keterangan">
                <textarea rows={2} value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} className={inputCls + " resize-none"} />
              </Field>

              {/* CASCADING — compact searchable dropdown per type (hanya pada KPI Group) */}
              {!hideCascading && (() => {
                const CASC_STYLE: Record<string, { bg: string; border: string; color: string; pill: string; pillText: string }> = {
                  FC: { bg: "#e0e7ff", border: "#a5b4fc", color: "#312e81", pill: "#c7d2fe", pillText: "#312e81" },
                  PC: { bg: "#fef3c7", border: "#fcd34d", color: "#78350f", pill: "#fde68a", pillText: "#78350f" },
                  CC: { bg: "#ccfbf1", border: "#5eead4", color: "#134e4a", pill: "#99f6e4", pillText: "#134e4a" },
                };
                const DESC: Record<string, string> = { FC: "Full Cascading", PC: "Partial Cascading", CC: "Contributing Cascading" };
                const cascRoles = master.cascading.map(c => ({ key: c.value, label: c.description || c.value }));
                const cmap = form.cascadingMap ?? {};

                return (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">CASCADING</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <p className="text-[11px] text-gray-400 -mt-0.5">Pilih Cascading type untuk setiap role. Satu role hanya bisa memiliki satu type.</p>
                    <div className="flex flex-col gap-2">
                      {corpCascTypeOpts.map((ct) => {
                        const type = ct.value;
                        const s = CASC_STYLE[type] ?? { bg: "#f1f5f9", border: "#cbd5e1", color: "#1e293b", pill: "#e2e8f0", pillText: "#1e293b" };
                        const selectedInType = cascRoles.filter(r => cmap[r.key] === type);
                        return (
                          <CascadingDropdownRow
                            key={type}
                            type={type}
                            desc={ct.description || DESC[type] || type}
                            style={s}
                            allRoles={cascRoles}
                            cascadingMap={cmap}
                            selectedInType={selectedInType}
                            onChange={(key, checked) => {
                              const next = { ...cmap, [key]: checked ? "" : type };
                              setForm(p => ({ ...p, cascadingMap: next }));
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 sm:px-8 py-4 border-t border-gray-100 shrink-0 bg-gray-50/40">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {tab === "subsection" && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={!form.no.trim() || !form.kpi.trim() || !form.bobot || isSectionQuotaFull || (subUsedInSection + parsePctNum(form.bobot) > activeSectionLimitNum + 1e-6)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add KPI
            </button>
          )}
        </div>
      </div>
      {bobotError && <BobotExceededModal violation={bobotError} onClose={() => setBobotError(null)} />}
    </div>
  );
}

// ─── Color badge for Setting table ───────────────────────────────────────────

function ColorValueBadge({ value, isBaseline }: { value: string; isBaseline?: boolean }) {
  const meta = isBaseline ? baselineColorMeta(value) : colorBandMeta(value);
  if (!meta) return <span className="text-gray-400 italic text-[11px]">{value || "—"}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
      style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
      {value}
    </span>
  );
}

// ─── Target Edit Mini Modal ───────────────────────────────────────────────────

function TargetEditMiniModal({ item, onSave, onClose }: {
  item: KPISetting;
  onSave: (updates: Partial<KPISetting>) => void;
  onClose: () => void;
}) {
  const initMode: IndicatorMode = item.indicatorMode ?? (item.colorIndicator ? "color" : "numeric");
  const [indicatorMode, setIndicatorMode] = useState<IndicatorMode>(initMode);
  const colorMode = indicatorMode === "color";
  const ratioMode = indicatorMode === "ratio";
  const [formula, setFormula] = useState(item.formula || "Jumlah");
  const [monthlyTargets, setMonthlyTargets] = useState<Record<string, string>>(item.monthlyTargets ?? {});
  const [target2026, setTarget2026] = useState(item.target2026);
  const [baseline2025, setBaseline2025] = useState(item.baseline2025);

  const handleModeChange = (mode: IndicatorMode) => {
    setIndicatorMode(mode);
    setMonthlyTargets({});
    setTarget2026("");
    setBaseline2025("");
    if (mode === "color") setFormula("Nilai Akhir");
    else if (mode === "ratio") setFormula("Jumlah");
  };

  return (
    <div data-kpi-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-base">Edit Target — No. {item.no}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-lg">{item.kpi.split("\n")[0]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <Field label="Formula Pencapaian">
            {colorMode || ratioMode
              ? <div className={inputCls + " bg-gray-50 text-[#1A284F] font-semibold pointer-events-none"}>{formula}</div>
              : <select value={formula} onChange={(e) => setFormula(e.target.value)} className={inputCls}>
                  {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                </select>}
          </Field>
          <ColorIndicatorRadio value={indicatorMode} onChange={handleModeChange} />
          {colorMode
            ? <BaselineColorField value={baseline2025} onChange={setBaseline2025} />
            : ratioMode
            ? <Field label="Baseline 2025">
                <select value={baseline2025} onChange={(e) => setBaseline2025(e.target.value)} className={inputCls}>
                  <option value="">— Pilih Ratio —</option>
                  {RATIO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            : <Field label="Baseline 2025">
                <input value={baseline2025} onChange={(e) => setBaseline2025(e.target.value)} className={inputCls} placeholder="e.g. 95" />
              </Field>}
          <MonthlyTargetTable
            monthlyTargets={monthlyTargets}
            formula={formula}
            colorMode={colorMode}
            ratioMode={ratioMode}
            onChange={(mt, computed) => { setMonthlyTargets(mt); setTarget2026(computed); }}
          />
          <Target2026Field value={target2026} colorMode={colorMode} ratioMode={ratioMode} monthlyTargets={monthlyTargets} />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => { onSave({ indicatorMode, colorIndicator: colorMode, monthlyTargets, target2026, baseline2025, formula }); onClose(); }}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b]">
            Save Target
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Table ────────────────────────────────────────────────────────────────

function isKpiDraftDirty(draft: KPISetting | null, original: KPISetting | undefined): boolean {
  if (!draft || !original) return false;
  const keys: (keyof KPISetting)[] = [
    "no", "section", "perspektif", "kpi", "satuan", "formula", "scope",
    "bobot", "definisi", "source", "baseline2025", "target2026",
    "polaritas", "detailFormula", "keterangan", "trackingPeriod", "cascading",
    "coo", "gmVgmIndustry", "gmVgmPerkebunan", "gmAsd", "gmRstm", "gmGhs",
  ];
  for (const k of keys) {
    if (String(draft[k] ?? "") !== String(original[k] ?? "")) return true;
  }
  if (JSON.stringify(draft.monthlyTargets ?? {}) !== JSON.stringify(original.monthlyTargets ?? {})) return true;
  if (JSON.stringify(draft.cascadingMap ?? {}) !== JSON.stringify(original.cascadingMap ?? {})) return true;
  return false;
}

function detectNumSepStyle(raw: string): "id" | "en" | "plain" {
  const s = String(raw ?? "").replace(/%/g, "").trim();
  if (!s) return "plain";
  if (/\d+\.\d{3}(?:\D|$)/.test(s) || /,\d+$/.test(s)) return "id";
  if (/\d+,\d{3}(?:\D|$)/.test(s) || /\.\d+$/.test(s)) return "en";
  return "plain";
}

/**
 * Validasi kesesuaian format penulisan baris KPI terhadap standar sistem (aktif untuk baris hasil Upload Excel).
 * Begitu baris diedit hingga sesuai standar, array alasan otomatis kosong -> mark merah lembut hilang.
 */
export function validateKpiRowStandard(item: KPISetting, master: MasterKpiStore): string[] {
  if (!item._uploadedCheck) return [];
  const issues: string[] = [];
  const validPersp = master.perspektif?.length ? master.perspektif : PERSPEKTIF_OPTIONS;
  const validUnits = master.satuan?.length ? master.satuan : SATUAN_UNIT_OPTIONS;
  const validPeriodes = (master.period?.length ? master.period : SATUAN_PERIODE_OPTIONS).filter((p) => p.toLowerCase() !== "hari");
  const validFormulas = master.formula?.length ? master.formula : FORMULA_OPTIONS;
  const validPolaritas = master.polaritas?.length ? master.polaritas : ["Maximize", "Minimize", "Stabilize"];

  if (!item.kpi?.trim()) issues.push("Nama KPI kosong");
  if (!item.perspektif?.trim() || !validPersp.includes(item.perspektif.trim())) {
    issues.push(`Perspektif "${item.perspektif || "—"}" tidak sesuai master`);
  }
  const satRaw = (item.satuan ?? "").trim();
  if (!satRaw) {
    issues.push("Satuan kosong");
  } else {
    const sep = satRaw.indexOf("/");
    const uPart = sep >= 0 ? satRaw.slice(0, sep).trim() : satRaw;
    const pPart = sep >= 0 ? satRaw.slice(sep + 1).trim() : "";
    if (!validUnits.includes(uPart) || (pPart && !validPeriodes.includes(pPart)) || sep < 0) {
      issues.push(`Satuan "${satRaw}" wajib format Satuan/Periode standar`);
    }
  }
  if (!item.formula?.trim() || !validFormulas.includes(item.formula.trim())) {
    issues.push(`Formula "${item.formula || "—"}" tidak sesuai standar`);
  }
  const bobotTrim = (item.bobot ?? "").trim();
  const bobotNum = parsePctNum(bobotTrim);
  if (!/^\d+(?:\.\d+)?%$/.test(bobotTrim) || bobotNum <= 0 || bobotNum > 100) {
    issues.push(`Bobot "${bobotTrim || "—"}" wajib format % (1%–100%)`);
  }
  if (!item.polaritas || !validPolaritas.includes(item.polaritas)) {
    issues.push(`Polaritas "${item.polaritas || "—"}" tidak sesuai standar`);
  }
  if (!item.definisi?.trim()) {
    issues.push("Definisi belum diisi");
  }
  if (!item.target2026?.trim()) {
    issues.push("Target 2026 belum diisi");
  }
  const bStyle = detectNumSepStyle(item.baseline2025);
  const tStyle = detectNumSepStyle(item.target2026);
  if (bStyle !== "plain" && tStyle !== "plain" && bStyle !== tStyle) {
    issues.push("Pemisah ribuan/desimal Baseline & Target tidak konsisten");
  }
  return issues;
}

function DeleteKpiRowConfirmModal({
  item,
  onCancel,
  onConfirm,
}: {
  item: KPISetting;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div data-kpi-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-rose-100 max-w-sm w-full p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-3.5">
          <Trash2 className="w-5 h-5 text-rose-600" />
        </div>
        <h4 className="font-bold text-gray-900 text-base mb-1.5">Konfirmasi Hapus KPI</h4>
        <p className="text-xs text-gray-500 leading-relaxed mb-5">
          Apakah Anda yakin ingin menghapus baris KPI <strong className="text-[#1A284F]">No. {item.no} — {item.kpi.split("\n")[0]}</strong>? Tindakan ini akan menghapus baris dari daftar KPI.
        </p>
        <div className="flex items-center justify-center gap-2.5">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Batal
          </button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors">
            Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedRowEditPopup({
  kpiNo,
  onSave,
  onDiscard,
  onContinueEdit,
}: {
  kpiNo: string;
  onSave: () => void;
  onDiscard: () => void;
  onContinueEdit: () => void;
}) {
  return (
    <div data-kpi-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 backdrop-blur-xs p-4" onClick={onContinueEdit}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xs w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Edit3 className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h4 className="font-bold text-[#1A284F] text-sm leading-snug">Simpan Perubahan Baris?</h4>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Terdapat perubahan belum disimpan pada <strong>KPI No. {kpiNo}</strong>.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onContinueEdit} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors">
            Kembali
          </button>
          <button type="button" onClick={onDiscard} className="px-3 py-1.5 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
            Buang
          </button>
          <button type="button" onClick={onSave} className="px-3.5 py-1.5 rounded-lg bg-[#1A284F] text-white text-[11px] font-bold hover:bg-[#131d3b] transition-colors">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalEditUnsavedModal({
  onSaveAll,
  onDiscardAll,
  onContinueEdit,
}: {
  onSaveAll: () => void;
  onDiscardAll: () => void;
  onContinueEdit: () => void;
}) {
  return (
    <div data-kpi-modal="true" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={onContinueEdit}>
      <div className="bg-white rounded-2xl shadow-2xl border border-indigo-100 max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <Edit3 className="w-5 h-5 text-[#1A284F]" />
          </div>
          <div>
            <h4 className="font-bold text-[#1A284F] text-base">Konfirmasi Perubahan Global Edit</h4>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Anda mengklik di luar tabel saat terdapat perubahan pada mode <strong>Global Edit</strong>. Apakah Anda ingin menyimpan perubahan tersebut?
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onContinueEdit} className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Lanjut Edit
          </button>
          <button type="button" onClick={onDiscardAll} className="px-3.5 py-2 rounded-xl border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
            Buang Perubahan
          </button>
          <button type="button" onClick={onSaveAll} className="px-4 py-2 rounded-xl bg-[#1A284F] text-white text-xs font-bold hover:bg-[#131d3b] transition-colors">
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}

export function KPISettingTable({ items, editable, onDelete, onUpdateItem, onBatchUpdateItems, hideCascading = false, onRenameSection, onUpdateSectionMeta, displayControls }: {
  items: KPISetting[]; editable: boolean;
  onRenameSection?: (oldSec: string, newSec: string) => void;
  onUpdateSectionMeta?: (sec: string, patch: { sectionLabel?: string; sectionBobot?: string }) => void;
  onDelete?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<KPISetting>) => void;
  onBatchUpdateItems?: (nextItems: KPISetting[]) => void;
  hideCascading?: boolean;
  displayControls?: React.ReactNode;
}) {
  const master = useMasterKpi();
  const tablePerspektifOpts = master.perspektif?.length ? master.perspektif : PERSPEKTIF_OPTIONS;
  const tablePeriodeOpts = (master.period?.length ? master.period : SATUAN_PERIODE_OPTIONS).filter((p) => p.toLowerCase() !== "hari");
  const tableFormulaOpts = master.formula?.length ? master.formula : FORMULA_OPTIONS;
  const tablePolaritasOpts = master.polaritas?.length
    ? master.polaritas.map((v) => ({ value: v as Polaritas, label: v }))
    : POLARITAS_OPTIONS;
  const tableTrackingPeriodOpts = master.trackingPeriod?.length
    ? master.trackingPeriod
    : ["Bulanan", "Triwulan", "Semesteran", "Tahunan"];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KPISetting | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<KPISetting | null>(null);
  const [pendingSwitchRow, setPendingSwitchRow] = useState<KPISetting | null>(null);
  const [showUnsavedRowPopup, setShowUnsavedRowPopup] = useState(false);
  const [globalEdit, setGlobalEdit] = useState(false);
  const [globalDrafts, setGlobalDrafts] = useState<Record<string, KPISetting>>({});
  const [showGlobalExitConfirm, setShowGlobalExitConfirm] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [targetEditItem, setTargetEditItem] = useState<KPISetting | null>(null);
  const [sectionLabelOverrides, setSectionLabelOverrides] = useState<Record<string, string>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingSectionDraftName, setEditingSectionDraftName] = useState<string>("");
  const [bobotOverErrorPersonal, setBobotOverErrorPersonal] = useState<{ sectionLabel: string; sectionBobot: number; totalBobot: number; kind: "section" | "total" } | null>(null);

  useEffect(() => {
    if (!editable && globalEdit) {
      setGlobalEdit(false);
      setGlobalDrafts({});
    }
  }, [editable, globalEdit]);

  const enterGlobalEdit = () => {
    if (!editable || !onUpdateItem) return;
    setEditingId(null);
    setDraft(null);
    const nextMap: Record<string, KPISetting> = {};
    items.forEach((it) => { nextMap[it.id] = { ...it }; });
    setGlobalDrafts(nextMap);
    setGlobalEdit(true);
  };

  const isGlobalDirty = items.some((it) => isKpiDraftDirty(globalDrafts[it.id] ?? null, it));

  const commitGlobalEdit = (): boolean => {
    const mergedList = items.map((it) => {
      const d = globalDrafts[it.id];
      if (!d) return it;
      const cleared = validateKpiRowStandard(d, master).length === 0 ? { ...d, _uploadedCheck: false } : d;
      return cleared;
    });
    const uniqueSecs = Array.from(new Set(mergedList.map((i) => i.section)));
    for (const sec of uniqueSecs) {
      const secLim = resolveEffectiveSectionBobotNum(mergedList, sec, false);
      const secSum = mergedList.filter((i) => i.section === sec).reduce((s, i) => s + parsePctNum(i.bobot), 0);
      if (secSum > secLim + 1e-6) {
        const lbl = mergedList.find((i) => i.section === sec)?.sectionLabel ?? `Section ${sec}`;
        setBobotOverErrorPersonal({ sectionLabel: lbl, sectionBobot: secLim, totalBobot: secSum, kind: "section" });
        return false;
      }
    }
    const allSum = mergedList.reduce((s, i) => s + parsePctNum(i.bobot), 0);
    if (allSum > 100 + 1e-6) {
      setBobotOverErrorPersonal({ sectionLabel: "Semua Section", sectionBobot: 100, totalBobot: allSum, kind: "total" });
      return false;
    }
    if (onBatchUpdateItems) {
      onBatchUpdateItems(mergedList);
    } else if (onUpdateItem) {
      mergedList.forEach((m) => onUpdateItem(m.id, m));
    }
    setGlobalEdit(false);
    setGlobalDrafts({});
    setShowGlobalExitConfirm(false);
    toast.success("Perubahan Global Edit berhasil disimpan.");
    return true;
  };

  const discardGlobalEdit = () => {
    setGlobalEdit(false);
    setGlobalDrafts({});
    setShowGlobalExitConfirm(false);
  };

  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const secItems = (sec: string) => items.filter((k) => k.section === sec);
  const leftActionOffset = editable ? W_AKSI : 0;
  const headerDefs = [
    ...(editable ? [{ label: "Aksi", style: { position: "sticky" as const, left: 0, zIndex: 26, background: "#1A284F", minWidth: W_AKSI, maxWidth: W_AKSI } }] : []),
    { label: "No",                       style: { position: "sticky" as const, left: leftActionOffset,                   zIndex: 25, background: "#1A284F", minWidth: W_NO,    maxWidth: W_NO    } },
    { label: "Perspektif",               style: { position: "sticky" as const, left: leftActionOffset + W_NO,            zIndex: 25, background: "#1A284F", minWidth: W_PERSP, maxWidth: W_PERSP } },
    { label: "KPI",                      style: { position: "sticky" as const, left: leftActionOffset + W_NO + W_PERSP,  zIndex: 25, background: "#1A284F", minWidth: W_KPI,   maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" } },
    { label: "Satuan",                   style: { minWidth: 180  } },
    { label: "Formula Setahun",          style: { minWidth: 100  } },
    { label: "Bobot",                    style: { minWidth: 72   } },
    { label: "Definisi",                 style: { minWidth: 240  } },
    { label: "Source",                   style: { minWidth: 160  } },
    { label: "Baseline 2025",            style: { minWidth: 96   } },
    { label: "Target 2026",              style: { minWidth: 96   } },
    { label: "Polaritas",                style: { minWidth: 96   } },
    { label: "Detail Formula",           style: { minWidth: 260  } },
    { label: "Keterangan",               style: { minWidth: 180  } },
    { label: "Periode Tracking",         style: { minWidth: 120  } },
    ...(!hideCascading ? [{ label: "CASCADING (FC; PC; CC)", style: { minWidth: 100 } }] : []),
  ];
  const totalCols = headerDefs.length;

  const startEdit = (item: KPISetting) => { setEditingId(item.id); setDraft({ ...item }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); setPendingSwitchRow(null); setShowUnsavedRowPopup(false); };
  const saveEdit = (): boolean => {
    if (draft) {
      const sec = draft.section;
      // Rule 6: KPI item bobots in section must not exceed section bobot
      const sectionBobot = resolveEffectiveSectionBobotNum(items, sec, false);
      const secTotal = items
        .filter(i => i.section === sec && i.id !== draft.id)
        .reduce((s, i) => s + parsePctNum(i.bobot), 0)
        + parsePctNum(draft.bobot);
      if (secTotal > sectionBobot + 1e-6) {
        const lbl = items.find(i => i.section === sec)?.sectionLabel ?? `Section ${sec}`;
        setBobotOverErrorPersonal({ sectionLabel: lbl, sectionBobot, totalBobot: secTotal, kind: "section" });
        return false;
      }
      // Rule 7: Total all KPI item bobots must not exceed 100%
      const allTotal = items
        .filter(i => i.id !== draft.id)
        .reduce((s, i) => s + parsePctNum(i.bobot), 0)
        + parsePctNum(draft.bobot);
      if (allTotal > 100 + 1e-6) {
        setBobotOverErrorPersonal({ sectionLabel: "Semua Section", sectionBobot: 100, totalBobot: allTotal, kind: "total" });
        return false;
      }
      const cleaned = validateKpiRowStandard(draft, master).length === 0 ? { ...draft, _uploadedCheck: false } : draft;
      onUpdateItem?.(draft.id, cleaned);
    }
    setEditingId(null);
    setDraft(null);
    return true;
  };
  const setRowPatch = (rowId: string, patch: Partial<KPISetting>) => {
    if (globalEdit) {
      setGlobalDrafts((prev) => {
        const base = prev[rowId] ?? items.find((i) => i.id === rowId);
        if (!base) return prev;
        return { ...prev, [rowId]: { ...base, ...patch } };
      });
    } else {
      setDraft((d) => (d ? { ...d, ...patch } : d));
    }
  };

  // Deteksi klik di luar tabel (untuk Global Edit) & klik pindah baris/luar baris (untuk Edit per Baris)
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-kpi-modal="true"]') || target.closest("[data-radix-popper-content-wrapper]")) return;
      if (targetEditItem || bobotOverErrorPersonal || deleteConfirmItem || showUnsavedRowPopup || showGlobalExitConfirm) return;

      if (globalEdit) {
        if (tableWrapRef.current && !tableWrapRef.current.contains(target)) {
          if (isGlobalDirty) {
            setShowGlobalExitConfirm(true);
          } else {
            setGlobalEdit(false);
            setGlobalDrafts({});
          }
        }
        return;
      }

      if (editingId && draft) {
        const activeTr = target.closest('[data-kpi-editing-row="true"]');
        if (!activeTr) {
          const orig = items.find((i) => i.id === editingId);
          if (isKpiDraftDirty(draft, orig)) {
            setShowUnsavedRowPopup(true);
          } else {
            setEditingId(null);
            setDraft(null);
          }
        }
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [globalEdit, isGlobalDirty, editingId, draft, items, targetEditItem, bobotOverErrorPersonal, deleteConfirmItem, showUnsavedRowPopup, showGlobalExitConfirm]);

  const ci = "w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-[#1A284F] bg-white resize-none leading-relaxed";
  const activeDisplayItems = globalEdit ? items.map((it) => globalDrafts[it.id] ?? it) : items;

  const renderRows = (sec: string) =>
    secItems(sec).map((item, rowIdx) => {
      const isEditing = globalEdit || editingId === item.id;
      const row = globalEdit ? (globalDrafts[item.id] ?? item) : (editingId === item.id && draft ? draft : item);
      const duplicateKpiIds = findDuplicateKpiTitleIds(activeDisplayItems);
      const isDuplicateKpi = duplicateKpiIds.has(item.id);
      const formatIssues = validateKpiRowStandard(row, master);
      const hasFormatIssue = formatIssues.length > 0;
      const hasRowRedAlert = hasFormatIssue || isDuplicateKpi;
      const stickyBg = hasRowRedAlert ? "#fff1f2" : isEditing ? "#f0f7ff" : rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";
      const secLimitNum = resolveEffectiveSectionBobotNum(activeDisplayItems, sec, false);
      const otherSubBobot = calcSubSectionBobot(activeDisplayItems, sec, item.id);
      const maxAllowedSubBobot = Math.max(0, Math.round((secLimitNum - otherSubBobot) * 100) / 100);
      const rowSubBobotOpts = buildRemainingBobotOptions(
        secLimitNum === 0 ? 0 : 1,
        maxAllowedSubBobot,
        row.bobot,
        true,
      );
      const setD = (patch: Partial<KPISetting>) => setRowPatch(item.id, patch);
      return (
        <tr
          key={item.id}
          data-kpi-editing-row={!globalEdit && editingId === item.id ? "true" : undefined}
          className={`border-t border-gray-200 transition-colors ${
            hasRowRedAlert
              ? "bg-rose-50/80 ring-1 ring-inset ring-rose-300/70"
              : isEditing
              ? "bg-blue-50/20 ring-1 ring-inset ring-[#1A284F]/20"
              : rowIdx % 2 === 0
              ? "bg-white hover:bg-gray-50/50"
              : "bg-slate-50/60 hover:bg-gray-50"
          }`}
        >
          {/* Aksi — Paling Kiri */}
          {editable && (
            <td
              className="border border-gray-200 py-3 px-2 text-center"
              style={{ position: "sticky", left: 0, zIndex: 13, background: stickyBg, minWidth: W_AKSI, maxWidth: W_AKSI }}
            >
              {globalEdit ? (
                <div className="flex items-center justify-center">
                  {onDelete && (
                    <button type="button" onClick={() => setDeleteConfirmItem(item)} className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition-colors" title="Hapus KPI">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : editingId === item.id ? (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={() => { void saveEdit(); }} className="w-full px-2 py-1 rounded text-[10px] font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">Save</button>
                  <button type="button" onClick={cancelEdit} className="w-full px-2 py-1 rounded text-[10px] font-semibold border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  {onUpdateItem && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingId && editingId !== item.id && draft) {
                          const orig = items.find((i) => i.id === editingId);
                          if (isKpiDraftDirty(draft, orig)) {
                            setPendingSwitchRow(item);
                            setShowUnsavedRowPopup(true);
                          } else {
                            startEdit(item);
                          }
                        } else {
                          startEdit(item);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-[#1A284F]/10 text-[#1A284F]"
                      title="Edit Baris"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" onClick={() => setDeleteConfirmItem(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600" title="Hapus KPI">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </td>
          )}
          {/* No */}
          <td className="border border-gray-200 text-center text-xs font-semibold text-gray-600 py-3 px-2"
            style={{ position: "sticky", left: leftActionOffset, zIndex: 12, background: stickyBg, minWidth: W_NO, maxWidth: W_NO }}>
            {isEditing
              ? <input value={row.no} onChange={(e) => setD({ no: e.target.value })} className={ci + " text-center font-bold"} />
              : item.no}
          </td>
          {/* Perspektif */}
          <td className="border border-gray-200 py-3 px-3"
            style={{ position: "sticky", left: leftActionOffset + W_NO, zIndex: 12, background: stickyBg, minWidth: W_PERSP, maxWidth: W_PERSP }}>
            {isEditing
              ? <select value={row.perspektif} onChange={(e) => setD({ perspektif: e.target.value })} className={ci}>
                  <option value="">— Pilih Perspektif —</option>
                  {tablePerspektifOpts.map((p) => <option key={p}>{p}</option>)}
                </select>
              : <span className={`text-xs font-bold ${PERSP_COLOR[item.perspektif] ?? "text-gray-700"}`}>{item.perspektif}</span>}
          </td>
          {/* KPI */}
          <td className={`border py-3 px-3 ${isDuplicateKpi ? "border-rose-300 bg-rose-50/95" : "border-gray-200"}`}
            style={{ position: "sticky", left: leftActionOffset + W_NO + W_PERSP, zIndex: 12, background: isDuplicateKpi ? "#ffe4e6" : stickyBg, minWidth: W_KPI, maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}>
            {isEditing
              ? (item._cascadeType === "FC" || item._cascadeType === "PC")
                ? <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-gray-600 whitespace-pre-line leading-relaxed bg-gray-100 rounded px-2 py-1.5 select-none">{row.kpi}</p>
                    <span className="text-[10px] text-amber-600 font-semibold">{item._cascadeType} — Read only</span>
                  </div>
                : <textarea rows={3} value={row.kpi} onChange={(e) => setD({ kpi: e.target.value })} className={ci} />
              : <p className="text-xs font-medium text-gray-800 whitespace-pre-line leading-relaxed">{item.kpi}</p>}
            {isDuplicateKpi && (
              <div className="mt-1.5 px-2 py-1 rounded-md bg-rose-100/90 border border-rose-300 text-[10px] text-rose-800 font-semibold leading-snug">
                judul KPI sama, pastikan tidak ada judul KPI yang sama
              </div>
            )}
            {hasFormatIssue && (
              <div className="mt-1.5 px-2 py-1 rounded-md bg-rose-100/80 border border-rose-200 text-[10px] text-rose-700 font-medium leading-snug">
                Format belum sesuai: {formatIssues.join(" · ")}
              </div>
            )}
          </td>
          {/* Satuan */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600" style={{ minWidth: 180 }}>
            {isEditing
              ? (() => {
                  const sep = row.satuan.indexOf("/");
                  const unit = sep >= 0 ? row.satuan.slice(0, sep).trim() : row.satuan.trim();
                  const periode = sep >= 0 ? row.satuan.slice(sep + 1).trim() : "";
                  const combine = (u: string, p: string) => setD({ satuan: u && p ? `${u}/${p}` : u });
                  return (
                    <div className="flex flex-col gap-1">
                      <select value={unit} onChange={(e) => combine(e.target.value, periode)} className={ci}>
                        <option value="">— Satuan —</option>
                        {(master.satuan.length ? master.satuan : SATUAN_UNIT_OPTIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select value={periode} onChange={(e) => combine(unit, e.target.value)} className={ci}>
                        <option value="">— Periode —</option>
                        {tablePeriodeOpts.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  );
                })()
              : item.satuan}
          </td>
          {/* Formula Setahun */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 100 }}>
            {isEditing
              ? <select value={row.formula} onChange={(e) => setD({ formula: e.target.value })} className={ci}>
                  <option value="">— Formula —</option>
                  {tableFormulaOpts.map((f) => <option key={f}>{f}</option>)}
                </select>
              : item.formula}
          </td>
          {/* Bobot */}
          <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 88 }}>
            {isEditing
              ? <select value={row.bobot} onChange={(e) => setD({ bobot: e.target.value })} className={ci}>
                  {rowSubBobotOpts.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              : editable && onUpdateItem && item._cascadeType !== "FC"
              ? <select
                  value={item.bobot}
                  title={`Pilih bobot Sub Section (Maks. sisa Section ${sec}: ${formatPctNum(maxAllowedSubBobot)}%)`}
                  onChange={(e) => onUpdateItem(item.id, { bobot: e.target.value })}
                  className="px-2 py-1 rounded-full bg-[#1A284F] text-white text-[10px] font-bold outline-none cursor-pointer hover:bg-[#243869] transition-colors"
                >
                  {rowSubBobotOpts.map((b) => (
                    <option key={b} value={b} style={{ background: "#ffffff", color: "#1A284F" }}>{b}</option>
                  ))}
                </select>
              : <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{item.bobot}</span>}
          </td>
          {/* Definisi */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 leading-relaxed" style={{ minWidth: 240 }}>
            {isEditing
              ? <textarea rows={3} value={row.definisi} onChange={(e) => setD({ definisi: e.target.value })} className={ci} />
              : item.definisi}
          </td>
          {/* Source */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600" style={{ minWidth: 160 }}>
            {isEditing
              ? <input value={row.source} onChange={(e) => setD({ source: e.target.value })} className={ci} />
              : item.source}
          </td>
          {/* Baseline 2025 */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-700 font-medium text-center" style={{ minWidth: 96 }}>
            {isEditing
              ? <input value={row.baseline2025} onChange={(e) => setD({ baseline2025: e.target.value })} className={ci + " text-center"} />
              : item.colorIndicator ? <ColorValueBadge value={item.baseline2025} isBaseline /> : item.baseline2025}
          </td>
          {/* Target 2026 */}
          <td className="border border-gray-200 py-3 px-2 text-xs font-bold text-[#1A284F] text-center" style={{ minWidth: 96 }}>
            {isEditing
              ? <button
                  onClick={() => setTargetEditItem({ ...row })}
                  className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded border border-[#1A284F]/30 bg-[#1A284F]/5 hover:bg-[#1A284F]/10 transition-colors"
                >
                  <span className="text-[11px] font-bold text-[#1A284F] truncate">{row.target2026 || "— Set"}</span>
                  <Edit3 className="w-3 h-3 text-[#1A284F] shrink-0" />
                </button>
              : item.colorIndicator ? <ColorValueBadge value={item.target2026} /> : item.target2026}
          </td>
          {/* Polaritas */}
          <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 96 }}>
            {isEditing
              ? <select value={row.polaritas} onChange={(e) => setD({ polaritas: e.target.value as Polaritas })} className={ci}>
                  <option value="">— Polaritas —</option>
                  {tablePolaritasOpts.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              : <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : item.polaritas === "Minimize" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {item.polaritas}
                </span>}
          </td>
          {/* Detail Formula */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 260 }}>
            {isEditing
              ? <textarea rows={3} value={row.detailFormula} onChange={(e) => setD({ detailFormula: e.target.value })} className={ci} />
              : item.detailFormula}
          </td>
          {/* Keterangan */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 180 }}>
            {isEditing
              ? <textarea rows={3} value={row.keterangan ?? ""} onChange={(e) => setD({ keterangan: e.target.value })} className={ci} />
              : item.keterangan || "—"}
          </td>
          {/* Periode Tracking (otomatis dari Satuan / Periode) */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 120 }}>
            {derivePeriodeTrackingFromSatuan(isEditing ? row.satuan : item.satuan, isEditing ? row.trackingPeriod : item.trackingPeriod)}
          </td>
          {/* CASCADING */}
          {!hideCascading && (
          <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 100 }}>
            {isEditing
              ? <select value={row.cascading ?? ""} onChange={(e) => setD({ cascading: e.target.value })} className={ci}>
                  <option value="">—</option>
                  <option value="FC">FC</option>
                  <option value="PC">PC</option>
                  <option value="CC">CC</option>
                </select>
              : item.cascading
                ? <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.cascading === "FC" ? "bg-indigo-50 text-indigo-700" : item.cascading === "PC" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
                    {item.cascading}
                  </span>
                : <span className="text-gray-300">—</span>}
          </td>
          )}
        </tr>
      );
    });

  return (
    <>
    <div ref={tableWrapRef} className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
      {displayControls && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {editable && onUpdateItem ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (globalEdit) {
                      if (isGlobalDirty) setShowGlobalExitConfirm(true);
                      else discardGlobalEdit();
                    } else {
                      enterGlobalEdit();
                    }
                  }}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    globalEdit
                      ? "bg-[#1A284F] text-white border-[#1A284F] shadow-xs"
                      : "text-[#1A284F] bg-white hover:bg-[#1A284F]/10 border-[#1A284F]/25"
                  }`}
                  title="Klik untuk membuka/menutup edit seluruh baris, kolom, dan section sekaligus"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Global Edit
                </button>
                {globalEdit && (
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { commitGlobalEdit(); }}
                      className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      Simpan Semua
                    </button>
                    <button
                      type="button"
                      onClick={discardGlobalEdit}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full">
                <Eye className="w-3.5 h-3.5" /> View Mode
              </span>
            )}
            {displayControls}
          </div>
        </div>
      )}
    <DualScrollTableContainer className="border-0 rounded-none shadow-none bg-white">
      <table className="border-collapse text-xs" style={{ minWidth: `${W_NO + W_PERSP + W_KPI + 1840 + (editable ? W_AKSI : 0)}px` }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {headerDefs.map(({ label, style }) => (
              <th key={label} className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={style}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec, si) => {
            const isCorp = sections.some((s) => ["C","D","E","F"].includes(s)) && !items.some((i) => i.copiedFromId);
            const DEFAULT_PURE_SEC_NAMES: Record<string, string> = isCorp ? {
              A: "K3L Terintegrasi",
              B: "Finansial & Cost",
              C: "Produksi",
              D: "Be Employer of Choices",
              E: "Be Partner of Choices",
              F: "Regulatory Compliance",
            } : {
              A: "Objective KPI",
              B: "Functional KPI",
            };
            const bgColors = ["#1565C0","#1976D2","#1E88E5","#2196F3","#42A5F5","#64B5F6"];
            const bg = bgColors[si % bgColors.length];
            const firstSecItem = items.find((k) => k.section === sec);
            const pureSecName = sectionLabelOverrides[sec] ?? firstSecItem?.sectionLabel ?? DEFAULT_PURE_SEC_NAMES[sec] ?? `Section ${sec}`;
            const secBobotNum = resolveEffectiveSectionBobotNum(items, sec, isCorp);
            const secBobotStr = `${formatPctNum(secBobotNum)}%`;
            const otherSecTotal = calcAllSectionsBobotSum(items, isCorp, undefined, sec);
            const maxSecAllowed = Math.max(0, Math.round((100 - otherSecTotal) * 100) / 100);
            const currentSubSum = Math.round(calcSubSectionBobot(items, sec) * 100) / 100;
            const minSecAllowed = Math.ceil(currentSubSum - 1e-6);
            const secDropdownOpts = buildRemainingBobotOptions(
              minSecAllowed,
              maxSecAllowed,
              secBobotNum <= maxSecAllowed + 1e-6 ? secBobotStr : undefined,
              currentSubSum === 0,
            );
            const isEditingThisSection = editingSection === sec;
            const commitRenameSectionLabel = () => {
              const nextName = editingSectionDraftName.trim();
              if (nextName) {
                setSectionLabelOverrides((p) => ({ ...p, [sec]: nextName }));
                onUpdateSectionMeta?.(sec, { sectionLabel: nextName });
              }
              setEditingSection(null);
            };
            return (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={totalCols} className="p-0 border" style={{ background: bg, borderColor: bg }}>
                    <div
                      className="px-4 py-2 inline-flex items-center gap-2.5 flex-wrap"
                      style={{ position: "sticky", left: 0, zIndex: 15, background: bg }}
                    >
                      {editable && onRenameSection ? (
                        <select
                          value={sec}
                          onChange={(e) => onRenameSection(sec, e.target.value)}
                          title="Ubah urutan kode section (mis. Section C menjadi Section D)"
                          className="text-[11px] font-bold bg-white/20 text-white border border-white/30 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                        >
                          {SECTION_LETTERS.slice(0, Math.max(10, sections.length + 2)).map((l) => (
                            <option key={l} value={l} style={{ color: "#1A284F", background: "#fff" }}>{l}.</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-white text-xs font-bold uppercase tracking-wider">{sec}.</span>
                      )}

                      {editable && isEditingThisSection ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingSectionDraftName}
                            onChange={(e) => setEditingSectionDraftName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRenameSectionLabel();
                              if (e.key === "Escape") setEditingSection(null);
                            }}
                            placeholder="Nama section…"
                            className="text-xs font-bold bg-white/20 text-white placeholder-white/60 border border-white/40 rounded px-2 py-0.5 outline-none min-w-[180px]"
                          />
                          <button
                            type="button"
                            onClick={commitRenameSectionLabel}
                            className="text-white text-[10px] font-bold px-2 py-0.5 rounded bg-white/25 hover:bg-white/35"
                          >
                            Simpan
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSection(null)}
                            className="text-white/80 hover:text-white text-[10px] font-semibold px-1.5 py-0.5 rounded hover:bg-white/15"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-white text-xs font-bold uppercase tracking-wider">{pureSecName}</span>
                          {editable && (onUpdateSectionMeta || onUpdateItem) && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSectionDraftName(pureSecName);
                                setEditingSection(sec);
                              }}
                              className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                              title="Rename nama section"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1.5 text-white/90 text-[11px] font-semibold">
                        <span>— Bobot</span>
                        {editable && onUpdateSectionMeta ? (
                          <select
                            value={secBobotStr}
                            title={`Pilih bobot Section ${sec} (Min. isi Sub Section ${formatPctNum(currentSubSum)}% · Maks. sisa gabungan Section ${formatPctNum(maxSecAllowed)}%)`}
                            onChange={(e) => onUpdateSectionMeta(sec, { sectionBobot: e.target.value })}
                            className="text-[11px] font-bold bg-white/20 text-white border border-white/35 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:bg-white/30"
                          >
                            {secDropdownOpts.map((opt) => (
                              <option key={opt} value={opt} style={{ color: "#1A284F", background: "#fff" }}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-bold text-white">{secBobotStr}</span>
                        )}
                        <span className="text-[10px] text-white/75 font-normal">
                          (Terisi {formatPctNum(currentSubSum)}%)
                        </span>
                      </span>
                    </div>
                  </td>
                </tr>
                {renderRows(sec)}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </DualScrollTableContainer>
    </div>

    {targetEditItem && (
      <TargetEditMiniModal
        item={targetEditItem}
        onSave={(updates) => { setRowPatch(targetEditItem.id, updates); setTargetEditItem(null); }}
        onClose={() => setTargetEditItem(null)}
      />
    )}
    {deleteConfirmItem && (
      <DeleteKpiRowConfirmModal
        item={deleteConfirmItem}
        onCancel={() => setDeleteConfirmItem(null)}
        onConfirm={() => {
          onDelete?.(deleteConfirmItem.id);
          if (editingId === deleteConfirmItem.id) cancelEdit();
          setDeleteConfirmItem(null);
        }}
      />
    )}
    {showUnsavedRowPopup && draft && (
      <UnsavedRowEditPopup
        kpiNo={draft.no || "—"}
        onContinueEdit={() => {
          setShowUnsavedRowPopup(false);
          setPendingSwitchRow(null);
        }}
        onDiscard={() => {
          const nextTarget = pendingSwitchRow;
          cancelEdit();
          if (nextTarget) startEdit(nextTarget);
        }}
        onSave={() => {
          const nextTarget = pendingSwitchRow;
          const ok = saveEdit();
          setShowUnsavedRowPopup(false);
          setPendingSwitchRow(null);
          if (ok && nextTarget) startEdit(nextTarget);
        }}
      />
    )}
    {showGlobalExitConfirm && (
      <GlobalEditUnsavedModal
        onContinueEdit={() => setShowGlobalExitConfirm(false)}
        onDiscardAll={discardGlobalEdit}
        onSaveAll={() => { commitGlobalEdit(); }}
      />
    )}
    {bobotOverErrorPersonal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-md mx-4 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-200">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-red-800 text-sm">
                {bobotOverErrorPersonal.kind === "total" ? "Total Bobot Seluruh KPI Melebihi 100%" : "Total Bobot Melebihi Batas Section"}
              </p>
              <p className="text-red-600 text-xs mt-0.5">Revisi diperlukan sebelum menyimpan</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="bg-red-50 rounded-xl border border-red-100 px-4 py-3 mb-4">
              <p className="text-xs text-gray-600 mb-2">
                {bobotOverErrorPersonal.kind === "total" ? "Total bobot dari semua KPI di seluruh section" : <><strong>{bobotOverErrorPersonal.sectionLabel}</strong></>}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Batas Bobot:</span>
                <span className="font-bold text-gray-800">{bobotOverErrorPersonal.sectionBobot}%</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-red-600">Total Bobot KPI:</span>
                <span className="font-bold text-red-700">{bobotOverErrorPersonal.totalBobot}%</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-red-600">Kelebihan:</span>
                <span className="font-bold text-red-700">+{(bobotOverErrorPersonal.totalBobot - bobotOverErrorPersonal.sectionBobot).toFixed(1)}%</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              {bobotOverErrorPersonal.kind === "total"
                ? "Total akumulasi bobot semua KPI tidak boleh melebihi 100%. Silakan sesuaikan nilai bobot KPI sebelum menyimpan."
                : "Total bobot semua KPI dalam satu section tidak boleh melebihi bobot section. Silakan sesuaikan nilai bobot KPI sebelum menyimpan."}
            </p>
            <div className="flex justify-end">
              <button onClick={() => setBobotOverErrorPersonal(null)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                Revisi Bobot
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Edit KPI Cascade Modal ───────────────────────────────────────────────────


// ─── Corporate KPI Table (PDF column format) ─────────────────────────────────

const CORP_SECTION_META: Record<string, { label: string; bobot: string; bg: string }> = {
  A: { label: "Kinerja K3L Terintegrasi (SMK3/HSE)", bobot: "15%", bg: "#1B5E20" },
  B: { label: "Finansial",                            bobot: "40%", bg: "#0D47A1" },
  C: { label: "Produksi",                             bobot: "30%", bg: "#4A148C" },
  D: { label: "Be Employer of Choices",               bobot: "9%",  bg: "#BF360C" },
  E: { label: "Be Partner of Choices",                bobot: "6%",  bg: "#006064" },
  F: { label: "Regulatory Compliance",                bobot: "0%",  bg: "#37474F" },
};


const CASCADING_CELL_BG: Record<string, string> = {
  FC: "#e0e7ff",
  PC: "#fef3c7",
  CC: "#ccfbf1",
};
const CASCADING_CELL_BORDER: Record<string, string> = {
  FC: "#a5b4fc",
  PC: "#fcd34d",
  CC: "#5eead4",
};
const CASCADING_CELL_COLOR: Record<string, string> = {
  FC: "#312e81",
  PC: "#78350f",
  CC: "#134e4a",
};


function CascadingTypePanel({
  type, roles, getValue, onToggle,
}: {
  type: "FC" | "PC" | "CC";
  roles: { key: string; label: string }[];
  getValue: (key: string) => string;
  onToggle: (key: string, checked: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const filtered = roles.filter((r) => r.label.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <input
        placeholder="Cari role..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full text-[10px] border border-blue-300 rounded px-2 py-1 outline-none focus:border-[#1A284F] bg-white"
      />
      <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto pr-0.5">
        {filtered.map((r) => {
          const current = getValue(r.key);
          const checked = current === type;
          const elsewhere = !!current && current !== type;
          return (
            <label
              key={r.key}
              className={`flex items-center gap-1.5 cursor-pointer select-none ${elsewhere ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={elsewhere}
                onChange={(e) => onToggle(r.key, e.target.checked)}
                className="w-3 h-3 accent-[#1A284F] shrink-0"
              />
              <span className="text-[10px] text-gray-700 leading-tight truncate">{r.label}</span>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-[10px] text-gray-300 italic">Tidak ditemukan</span>
        )}
      </div>
    </div>
  );
}

export function CorporateKPITable({ items, onUpdateItem, onBatchUpdateItems, onDeleteItem, onAddClick, onSubmit, onExport, onImport, submitted = false, hideCascading = false, hideScope = false, kpiApproved = false, targetEditApproved = false, onEditTargetRequest, sectionCascadeMap, onSectionCascadeChange, parentSectionCascadeMap, editedSectionBobots, onSectionBobotChange, toolbarExtra, onRenameSection, onUpdateSectionMeta, canSubmitKpi, submitBlockReasons, displayControls }: {
  hideScope?: boolean;
  toolbarExtra?: React.ReactNode;
  onRenameSection?: (oldSec: string, newSec: string) => void;
  onUpdateSectionMeta?: (sec: string, patch: { sectionLabel?: string; sectionBobot?: string }) => void;
  canSubmitKpi?: boolean;
  submitBlockReasons?: string[];
  displayControls?: React.ReactNode;
  items: KPISetting[];
  onUpdateItem?: (id: string, updates: Partial<KPISetting>) => void;
  onBatchUpdateItems?: (nextItems: KPISetting[]) => void;
  onDeleteItem?: (id: string) => void;
  onAddClick?: () => void;
  onSubmit?: () => void;
  onExport?: () => void;
  onImport?: (file: File) => void;
  submitted?: boolean;
  hideCascading?: boolean;
  kpiApproved?: boolean;
  targetEditApproved?: boolean;
  onEditTargetRequest?: () => void;
  sectionCascadeMap?: Record<string, string>;
  onSectionCascadeChange?: (sec: string, val: string) => void;
  parentSectionCascadeMap?: Record<string, string>;
  editedSectionBobots?: Record<string, string>;
  onSectionBobotChange?: (sec: string, val: string) => void;
}) {
  const master = useMasterKpi();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KPISetting | null>(null);
  const [corpDeleteItem, setCorpDeleteItem] = useState<KPISetting | null>(null);
  const [corpPendingSwitch, setCorpPendingSwitch] = useState<KPISetting | null>(null);
  const [corpUnsavedPopup, setCorpUnsavedPopup] = useState(false);
  const [corpGlobalEdit, setCorpGlobalEdit] = useState(false);
  const [corpGlobalDrafts, setCorpGlobalDrafts] = useState<Record<string, KPISetting>>({});
  const [corpGlobalExitConfirm, setCorpGlobalExitConfirm] = useState(false);
  const corpWrapRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [bobotOverError, setBobotOverError] = useState<{ section: string; sectionLabel: string; sectionBobot: number; totalBobot: number; kind?: "section" | "total" } | null>(null);
  const [corpTargetEdit, setCorpTargetEdit] = useState<KPISetting | null>(null);
  // Local editable section names for CC cascade type (pak-anton view)
  const [editedSectionLabels, setEditedSectionLabels] = useState<Record<string, string>>({});
  const [renamingSecCode, setRenamingSecCode] = useState<string | null>(null);
  const [renamingSecDraft, setRenamingSecDraft] = useState<string>("");

  const startEdit = (item: KPISetting) => { if (submitted || kpiApproved) return; setEditingRowId(item.id); setDraft({ ...item }); };
  const cancelEdit = () => { setEditingRowId(null); setDraft(null); setCorpPendingSwitch(null); setCorpUnsavedPopup(false); };
  const saveEdit = (): boolean => {
    if (draft) {
      const sec = draft.section;
      // Rule 6: total KPI bobot in section must not exceed section bobot
      const sectionBobot = resolveEffectiveSectionBobotNum(items, sec, true, editedSectionBobots);
      const sectionTotal = items
        .filter((i) => i.section === sec && i.id !== draft.id)
        .reduce((s, i) => s + parsePctNum(i.bobot), 0)
        + parsePctNum(draft.bobot);
      if (sectionTotal > sectionBobot + 1e-6) {
        const secMeta = CORP_SECTION_META[sec];
        setBobotOverError({
          section: sec,
          sectionLabel: items.find((i) => i.section === sec)?.sectionLabel || secMeta?.label || `Section ${sec}`,
          sectionBobot,
          totalBobot: sectionTotal,
          kind: "section",
        });
        return false;
      }
      // Rule 7: total of all KPI item bobots across all sections must not exceed 100%
      const allTotal = items
        .filter((i) => i.id !== draft.id)
        .reduce((s, i) => s + parsePctNum(i.bobot), 0)
        + parsePctNum(draft.bobot);
      if (allTotal > 100 + 1e-6) {
        setBobotOverError({
          section: sec,
          sectionLabel: "Semua Section",
          sectionBobot: 100,
          totalBobot: allTotal,
          kind: "total",
        });
        return false;
      }
      const cleaned = validateKpiRowStandard(draft, master).length === 0 ? { ...draft, _uploadedCheck: false } : draft;
      onUpdateItem?.(draft.id, cleaned);
    }
    setEditingRowId(null);
    setDraft(null);
    return true;
  };
  const setCorpRowPatch = (rowId: string, updates: Partial<KPISetting>) => {
    if (corpGlobalEdit) {
      setCorpGlobalDrafts((prev) => {
        const base = prev[rowId] ?? items.find((i) => i.id === rowId);
        if (!base) return prev;
        return { ...prev, [rowId]: { ...base, ...updates } };
      });
    } else {
      setDraft((d) => (d ? { ...d, ...updates } : d));
    }
  };

  const isCorpGlobalDirty = items.some((it) => isKpiDraftDirty(corpGlobalDrafts[it.id] ?? null, it));

  const enterCorpGlobalEdit = () => {
    if (submitted || kpiApproved || previewMode || !onUpdateItem) return;
    setEditingRowId(null);
    setDraft(null);
    const nextMap: Record<string, KPISetting> = {};
    items.forEach((it) => { nextMap[it.id] = { ...it }; });
    setCorpGlobalDrafts(nextMap);
    setCorpGlobalEdit(true);
  };

  const discardCorpGlobalEdit = () => {
    setCorpGlobalEdit(false);
    setCorpGlobalDrafts({});
    setCorpGlobalExitConfirm(false);
  };

  const commitCorpGlobalEdit = (): boolean => {
    const mergedList = items.map((it) => {
      const d = corpGlobalDrafts[it.id];
      if (!d) return it;
      return validateKpiRowStandard(d, master).length === 0 ? { ...d, _uploadedCheck: false } : d;
    });
    const uniqueSecs = Array.from(new Set(mergedList.map((i) => i.section)));
    for (const sec of uniqueSecs) {
      const secLim = resolveEffectiveSectionBobotNum(mergedList, sec, true, editedSectionBobots);
      const secSum = mergedList.filter((i) => i.section === sec).reduce((s, i) => s + parsePctNum(i.bobot), 0);
      if (secSum > secLim + 1e-6) {
        const secMeta = CORP_SECTION_META[sec];
        setBobotOverError({
          section: sec,
          sectionLabel: mergedList.find((i) => i.section === sec)?.sectionLabel || secMeta?.label || `Section ${sec}`,
          sectionBobot: secLim,
          totalBobot: secSum,
          kind: "section",
        });
        return false;
      }
    }
    const allSum = mergedList.reduce((s, i) => s + parsePctNum(i.bobot), 0);
    if (allSum > 100 + 1e-6) {
      setBobotOverError({
        section: uniqueSecs[0] ?? "A",
        sectionLabel: "Semua Section",
        sectionBobot: 100,
        totalBobot: allSum,
        kind: "total",
      });
      return false;
    }
    if (onBatchUpdateItems) {
      onBatchUpdateItems(mergedList);
    } else if (onUpdateItem) {
      mergedList.forEach((m) => onUpdateItem(m.id, m));
    }
    setCorpGlobalEdit(false);
    setCorpGlobalDrafts({});
    setCorpGlobalExitConfirm(false);
    toast.success("Perubahan Global Edit berhasil disimpan.");
    return true;
  };

  useEffect(() => {
    if ((submitted || kpiApproved || previewMode) && corpGlobalEdit) {
      setCorpGlobalEdit(false);
      setCorpGlobalDrafts({});
    }
  }, [submitted, kpiApproved, previewMode, corpGlobalEdit]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-kpi-modal="true"]') || target.closest("[data-radix-popper-content-wrapper]")) return;
      if (corpTargetEdit || bobotOverError || corpDeleteItem || corpUnsavedPopup || corpGlobalExitConfirm) return;

      if (corpGlobalEdit) {
        if (corpWrapRef.current && !corpWrapRef.current.contains(target)) {
          if (isCorpGlobalDirty) {
            setCorpGlobalExitConfirm(true);
          } else {
            setCorpGlobalEdit(false);
            setCorpGlobalDrafts({});
          }
        }
        return;
      }

      if (editingRowId && draft) {
        const activeTr = target.closest('[data-kpi-editing-row="true"]');
        if (!activeTr) {
          const orig = items.find((i) => i.id === editingRowId);
          if (isKpiDraftDirty(draft, orig)) {
            setCorpUnsavedPopup(true);
          } else {
            setEditingRowId(null);
            setDraft(null);
          }
        }
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [corpGlobalEdit, isCorpGlobalDirty, editingRowId, draft, items, corpTargetEdit, bobotOverError, corpDeleteItem, corpUnsavedPopup, corpGlobalExitConfirm]);

  // FC/PC/CC editability rules applied to the row currently being edited
  const isRowFieldEditable = (r: KPISetting, field: string): boolean => {
    const ct = r._cascadeType;
    if (!ct) return true;           // custom row — all editable
    if (ct === "CC") return true;   // Contributing — fully editable
    if (field === "no") return true; // No column always editable for all cascade types
    if (ct === "PC") return field === "bobot" || field === "target2026";
    return false;                   // FC — all other data fields read-only
  };

  const activeCorpItems = corpGlobalEdit ? items.map((it) => corpGlobalDrafts[it.id] ?? it) : items;
  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const corpPerspOpts = master.perspektif?.length ? master.perspektif : PERSPEKTIF_OPTIONS;
  const corpPolaritasOpts = master.polaritas?.length
    ? master.polaritas.map((v) => ({ value: v as Polaritas, label: v }))
    : POLARITAS_OPTIONS;
  const W_CORP_AKSI = 84;
  const W_CORP_CASC = 62;
  const W_CORP_NO = 48;
  const W_CORP_PERSP = 120;
  const W_CORP_KPI = 260;
  const COLS = [
    { label: "No",                w: W_CORP_NO    },
    { label: "Perspektif",        w: W_CORP_PERSP },
    { label: "KPI",               w: W_CORP_KPI   },
    { label: "Satuan",            w: 120 },
    { label: "Formula Setahun",   w: 110 },
    { label: "Scope",             w: 180 },
    { label: "Bobot",             w: 82  },
    { label: "Definisi",          w: 240 },
    { label: "Source",            w: 180 },
    { label: "Baseline 2025",     w: 100 },
    { label: "Target 2026",       w: 100 },
    { label: "Polaritas",         w: 80  },
    { label: "Detail Formula",    w: 240 },
    { label: "Keterangan",        w: 180 },
    { label: "Periode Tracking",  w: 90  },
    { label: "FC",                w: 150 },
    { label: "PC",                w: 170 },
    { label: "CC",                w: 130 },
  ];
  // Role fields for legacy typed-key KPIs (CORPORATE_KPI static data)
  const LEGACY_CASC_ROLE_FIELDS: { key: keyof KPISetting; label: string }[] = [
    { key: "coo",             label: "COO"           },
    { key: "gmVgmIndustry",   label: "GM Industry"   },
    { key: "gmVgmPerkebunan", label: "GM Perkebunan" },
    { key: "gmAsd",           label: "GM ASD"        },
    { key: "gmRstm",          label: "GM RSTM"       },
    { key: "gmGhs",           label: "GM GHS"        },
  ];
  // Dynamic roles from master KPI cascading (for KPIs added via modal)
  const masterCascRoles = master.cascading.map(c => ({ key: c.value, label: c.description || c.value }));
  const hasCascadedRows = items.some(i => !!i._cascadeType);
  const cascadingWidth = COLS.slice(15).reduce((s, c) => s + c.w, 0) + 80;
  const showAksi = !previewMode && !kpiApproved && !submitted && Boolean(onUpdateItem || onDeleteItem);
  const visibleMainCols = hideScope ? COLS.slice(0, 15).filter((c) => c.label !== "Scope") : COLS.slice(0, 15);
  const showCascadeCol = hasCascadedRows && !previewMode;
  const aksiOffset = showAksi ? W_CORP_AKSI : 0;
  const leftOffsetBase = aksiOffset + (showCascadeCol ? W_CORP_CASC : 0);
  const totalWidth = COLS.reduce((s, c) => s + c.w, 0) + (showAksi ? W_CORP_AKSI : 0) - (hideCascading ? cascadingWidth : 0) - (hideScope ? 180 : 0) + (showCascadeCol ? W_CORP_CASC : 0);
  const totalCols = visibleMainCols.length
    + (showAksi ? 1 : 0)
    + (showCascadeCol ? 1 : 0)
    + (!previewMode && !hideCascading ? 3 : 0);
  const cellInput = "w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-[#1A284F] bg-white resize-none leading-relaxed";
  const computedSubmitEval = evaluateKpiSettingSubmitStatus(items, true, editedSectionBobots);
  const effectiveCanSubmit = canSubmitKpi ?? computedSubmitEval.canSubmit;
  const effectiveSubmitReasons = submitBlockReasons ?? computedSubmitEval.reasons;

  const getCorpMainHdrStyle = (label: string, w: number): React.CSSProperties => {
    if (label === "No") return { position: "sticky", left: leftOffsetBase, zIndex: 25, background: "#1A284F", minWidth: w, maxWidth: w };
    if (label === "Perspektif") return { position: "sticky", left: leftOffsetBase + W_CORP_NO, zIndex: 25, background: "#1A284F", minWidth: w, maxWidth: w };
    if (label === "KPI") return { position: "sticky", left: leftOffsetBase + W_CORP_NO + W_CORP_PERSP, zIndex: 25, background: "#1A284F", minWidth: w, maxWidth: w, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" };
    return { minWidth: w };
  };

  return (
    <>
    <div ref={corpWrapRef} className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {!hideCascading && previewMode
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <Eye className="w-3.5 h-3.5" /> Preview Mode — CASCADING columns hidden
              </span>
            : (!kpiApproved && !submitted) && (
              onUpdateItem ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (corpGlobalEdit) {
                        if (isCorpGlobalDirty) setCorpGlobalExitConfirm(true);
                        else discardCorpGlobalEdit();
                      } else {
                        enterCorpGlobalEdit();
                      }
                    }}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                      corpGlobalEdit
                        ? "bg-[#1A284F] text-white border-[#1A284F] shadow-xs"
                        : "text-[#1A284F] bg-white hover:bg-[#1A284F]/10 border-[#1A284F]/25"
                    }`}
                    title="Klik untuk membuka/menutup edit seluruh baris, kolom, dan section sekaligus"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Global Edit
                  </button>
                  {corpGlobalEdit && (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => { commitCorpGlobalEdit(); }}
                        className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        Simpan Semua
                      </button>
                      <button
                        type="button"
                        onClick={discardCorpGlobalEdit}
                        className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] bg-[#1A284F]/5 border border-[#1A284F]/15 px-2.5 py-1 rounded-full">
                  <Eye className="w-3.5 h-3.5" /> View Mode
                </span>
              )
            )}
          {displayControls}
          {toolbarExtra}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!submitted && !kpiApproved && onAddClick && (
            <button onClick={onAddClick}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add KPI
            </button>
          )}
          {kpiApproved && !targetEditApproved && onEditTargetRequest && (
            <button
              onClick={onEditTargetRequest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap">
              <FileEdit className="w-3.5 h-3.5 shrink-0" />
              Edit [Target] Request
            </button>
          )}
          {!hideCascading && (
            <button
              onClick={() => { setPreviewMode((p) => !p); if (!previewMode) { setEditingRowId(null); setDraft(null); } }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                previewMode
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100"
              }`}>
              <Eye className="w-3.5 h-3.5" />
              {previewMode ? (submitted || kpiApproved ? "Back" : "Back to Edit") : "Preview"}
            </button>
          )}
          {!submitted && onSubmit && (
            <SubmitKpiGateButton
              canSubmit={effectiveCanSubmit}
              reasons={effectiveSubmitReasons}
              onConfirmSubmit={onSubmit}
              size="sm"
            />
          )}
          {onExport && <ExportImportButton onExport={onExport} onImport={onImport} size="sm" />}
        </div>
      </div>
    <DualScrollTableContainer className="border-0 rounded-none shadow-none bg-white">
      <table className="border-collapse text-xs" style={{ minWidth: totalWidth + "px" }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {showAksi && (
              <th rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px] align-middle"
                style={{ position: "sticky", left: 0, zIndex: 26, background: "#1A284F", minWidth: W_CORP_AKSI, maxWidth: W_CORP_AKSI }}>Aksi</th>
            )}
            {showCascadeCol && (
              <th rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-1.5 text-center font-semibold text-[10px] align-middle"
                style={{ position: "sticky", left: aksiOffset, zIndex: 25, background: "#1A284F", minWidth: W_CORP_CASC, maxWidth: W_CORP_CASC }}>
                Cascade
              </th>
            )}
            {visibleMainCols.map(({ label, w }) => (
              <th key={label} rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px] align-middle"
                style={getCorpMainHdrStyle(label, w)}>{label}</th>
            ))}
            {!previewMode && !hideCascading && (
              <th colSpan={3} className="border border-[#1A284F]/30 py-2 px-2 text-center font-semibold text-[11px]">
                CASCADING
              </th>
            )}
          </tr>
          <tr className="bg-[#243860] text-white">
            {!previewMode && !hideCascading && COLS.slice(15).map(({ label, w }) => (
              <th key={label} className="border border-[#1A284F]/30 py-2 px-1.5 text-center font-semibold text-[10px]"
                style={{ minWidth: w }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const staticMeta = CORP_SECTION_META[sec];
            const secRows = items.filter((k) => k.section === sec);
            // For KPIs added via the new modal, derive header from item fields
            const firstItem = secRows[0];
            const alphabet  = `${sec}.`;
            const secLabel  = editedSectionLabels[sec] ?? firstItem?.sectionLabel ?? staticMeta?.label ?? sec;
            const secBobotNum = resolveEffectiveSectionBobotNum(items, sec, true, editedSectionBobots);
            const bobot     = `${formatPctNum(secBobotNum)}%`;
            const canRename = Boolean(onRenameSection) && !previewMode && !submitted && !kpiApproved;
            const parentCasc = parentSectionCascadeMap?.[sec];
            const canEditSecName = !previewMode && !submitted && !kpiApproved && Boolean(onUpdateSectionMeta || onUpdateItem) && (!parentCasc || parentCasc === "CC");
            const canEditSecBobot = !previewMode && !submitted && !kpiApproved && Boolean(onUpdateSectionMeta || onSectionBobotChange) && parentCasc !== "FC";
            const otherSecTotal = calcAllSectionsBobotSum(items, true, editedSectionBobots, sec);
            const maxAllowedSecBobot = Math.max(0, Math.round((100 - otherSecTotal) * 100) / 100);
            const subSumInSec = Math.round(calcSubSectionBobot(items, sec) * 100) / 100;
            const minAllowedSecBobot = Math.ceil(subSumInSec - 1e-6);
            const corpSecDropdownOpts = buildRemainingBobotOptions(
              minAllowedSecBobot,
              maxAllowedSecBobot,
              secBobotNum <= maxAllowedSecBobot + 1e-6 ? bobot : undefined,
              subSumInSec === 0,
            );
            const customIdx = sections.filter(s => !CORP_SECTION_META[s]).indexOf(sec);
            const bg        = staticMeta ? staticMeta.bg : CUSTOM_SECTION_BG_PALETTE[customIdx % CUSTOM_SECTION_BG_PALETTE.length];
            const commitCorpSectionRename = () => {
              const nextLbl = renamingSecDraft.trim();
              if (nextLbl) {
                setEditedSectionLabels((p) => ({ ...p, [sec]: nextLbl }));
                onUpdateSectionMeta?.(sec, { sectionLabel: nextLbl });
              }
              setRenamingSecCode(null);
            };
            return (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={totalCols} className="p-0 text-white text-[11px] font-bold uppercase tracking-wider border"
                    style={{ background: bg, borderColor: bg }}>
                    <div
                      className="py-2 px-4 inline-flex items-center gap-3 flex-wrap"
                      style={{ position: "sticky", left: 0, zIndex: 15, background: bg }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {canRename ? (
                          <select
                            value={sec}
                            onChange={(e) => onRenameSection?.(sec, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            title="Ubah urutan section (mis. Section C menjadi Section D)"
                            className="text-[11px] font-bold bg-white/20 text-white border border-white/30 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                          >
                            {SECTION_LETTERS.slice(0, Math.max(10, sections.length + 2)).map((l) => <option key={l} value={l} style={{ color: "#1A284F", background: "#fff" }}>{l}.</option>)}
                          </select>
                        ) : (
                          <span>{alphabet}</span>
                        )}

                        {canEditSecName && renamingSecCode === sec ? (
                          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={renamingSecDraft}
                              onChange={(e) => setRenamingSecDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitCorpSectionRename();
                                if (e.key === "Escape") setRenamingSecCode(null);
                              }}
                              placeholder="Nama section…"
                              className="text-[11px] font-bold bg-white/20 text-white placeholder-white/60 border border-white/40 rounded px-2 py-0.5 outline-none min-w-[200px]"
                            />
                            <button
                              type="button"
                              onClick={commitCorpSectionRename}
                              className="text-white text-[10px] font-bold px-2 py-0.5 rounded bg-white/25 hover:bg-white/35 normal-case tracking-normal"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingSecCode(null)}
                              className="text-white/80 hover:text-white text-[10px] font-semibold px-1.5 py-0.5 rounded hover:bg-white/15 normal-case tracking-normal"
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span>{secLabel}</span>
                            {canEditSecName && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingSecDraft(secLabel);
                                  setRenamingSecCode(sec);
                                }}
                                title="Rename nama section"
                                className="p-1 rounded hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}
                      </span>

                      {parentCasc === "FC" ? (
                        <span className="opacity-85 font-normal normal-case tracking-normal text-[11px] flex items-center gap-1">
                          — Bobot {bobot}
                          <Lock className="w-3 h-3 opacity-70" />
                        </span>
                      ) : canEditSecBobot ? (
                        <span className="font-normal normal-case tracking-normal text-[11px] inline-flex items-center gap-1.5 opacity-95">
                          <span>— Bobot</span>
                          <select
                            value={bobot}
                            title={`Pilih bobot Section ${sec} (Min. isi Sub Section ${formatPctNum(subSumInSec)}% · Maks. sisa gabungan Section ${formatPctNum(maxAllowedSecBobot)}%)`}
                            onChange={(e) => {
                              const val = e.target.value;
                              onSectionBobotChange?.(sec, val);
                              onUpdateSectionMeta?.(sec, { sectionBobot: val });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] font-bold bg-white/20 text-white border border-white/35 rounded px-1.5 py-0.5 outline-none cursor-pointer hover:bg-white/30"
                          >
                            {corpSecDropdownOpts.map((o) => (
                              <option key={o} value={o} style={{ color: "#1A284F", background: "#fff" }}>{o}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-white/75">(Terisi {formatPctNum(subSumInSec)}%)</span>
                          {parentCasc && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: CASCADING_CELL_BG[parentCasc], color: CASCADING_CELL_COLOR[parentCasc], border: `1px solid ${CASCADING_CELL_BORDER[parentCasc]}` }}>
                              {parentCasc}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="opacity-85 font-normal normal-case tracking-normal text-[11px]">— Bobot {bobot}</span>
                      )}

                      {/* Section-level cascade selector (corporate tab only, not in preview) */}
                      {!previewMode && !hideCascading && sectionCascadeMap !== undefined && (
                        <span className="font-normal normal-case tracking-normal text-[11px] inline-flex items-center gap-1.5 opacity-90">
                          <span className="text-white/70">Cascade:</span>
                          <select
                            value={sectionCascadeMap?.[sec] ?? "FC"}
                            onChange={(e) => onSectionCascadeChange?.(sec, e.target.value)}
                            disabled={submitted || kpiApproved}
                            className="text-[10px] font-bold rounded border px-1.5 py-0.5 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            style={{
                              background: CASCADING_CELL_BG[sectionCascadeMap?.[sec] ?? "FC"] ?? "#f9fafb",
                              borderColor: CASCADING_CELL_BORDER[sectionCascadeMap?.[sec] ?? "FC"] ?? "#d1d5db",
                              color: CASCADING_CELL_COLOR[sectionCascadeMap?.[sec] ?? "FC"] ?? "#6b7280",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="" style={{ color: "#6b7280", background: "#f9fafb" }}>— No Cascade</option>
                            <option value="FC" style={{ color: "#312e81", background: "#e0e7ff" }}>FC — Full Cascading</option>
                            <option value="PC" style={{ color: "#78350f", background: "#fef3c7" }}>PC — Partial Cascading</option>
                            <option value="CC" style={{ color: "#134e4a", background: "#ccfbf1" }}>CC — Contributing Cascading</option>
                          </select>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
                {secRows.map((item, idx) => {
                  const isEditing = corpGlobalEdit || editingRowId === item.id;
                  const row = corpGlobalEdit ? (corpGlobalDrafts[item.id] ?? item) : (editingRowId === item.id && draft ? draft : item);
                  const corpDupIds = findDuplicateKpiTitleIds(activeCorpItems);
                  const isCorpDuplicateKpi = corpDupIds.has(item.id);
                  const formatIssues = validateKpiRowStandard(row, master);
                  const hasFormatIssue = formatIssues.length > 0;
                  const hasCorpRedAlert = hasFormatIssue || isCorpDuplicateKpi;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/70";
                  const stickyBg = hasCorpRedAlert ? "#fff1f2" : isEditing ? "#f0f7ff" : idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                  const ct = item._cascadeType;
                  const otherSubUsed = calcSubSectionBobot(activeCorpItems, sec, item.id);
                  const maxAllowedRowSubBobot = Math.max(0, Math.round((secBobotNum - otherSubUsed) * 100) / 100);
                  const corpRowSubBobotOpts = buildRemainingBobotOptions(
                    secBobotNum === 0 ? 0 : 1,
                    maxAllowedRowSubBobot,
                    row.bobot,
                    true,
                  );
                  const canQuickEditBobot = showAksi && Boolean(onUpdateItem) && (!ct || ct === "PC" || ct === "CC");
                  const setDraftField = (updates: Partial<KPISetting>) => setCorpRowPatch(item.id, updates);
                  const isFieldEditable = (field: string) => isRowFieldEditable(row, field);
                  const CASCADE_BADGE: Record<string, { label: string; cls: string }> = {
                    FC: { label: "FC", cls: "bg-indigo-100 text-indigo-800 border border-indigo-300" },
                    PC: { label: "PC", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
                    CC: { label: "CC", cls: "bg-teal-100 text-teal-800 border border-teal-300" },
                  };
                  return (
                    <tr
                      key={item.id}
                      data-kpi-editing-row={!corpGlobalEdit && editingRowId === item.id ? "true" : undefined}
                      className={`border-t border-gray-100 ${
                        hasCorpRedAlert
                          ? "bg-rose-50/80 ring-1 ring-inset ring-rose-300/70"
                          : isEditing
                          ? "ring-1 ring-inset ring-[#1A284F]/20 bg-blue-50/10"
                          : `${rowBg} hover:bg-blue-50/20`
                      } transition-colors`}
                    >
                      {/* Aksi — Paling Kiri */}
                      {showAksi && (
                        <td
                          className="border border-gray-200 py-2 px-1.5 text-center"
                          style={{ position: "sticky", left: 0, zIndex: 13, background: stickyBg, minWidth: W_CORP_AKSI, maxWidth: W_CORP_AKSI }}
                        >
                          {corpGlobalEdit ? (
                            <div className="flex items-center justify-center">
                              {(!ct || ct === "CC") && onDeleteItem && (
                                <button type="button" onClick={() => setCorpDeleteItem(item)} title="Hapus KPI"
                                  className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : editingRowId === item.id ? (
                            <div className="flex flex-col gap-1 items-center">
                              <button type="button" onClick={() => { void saveEdit(); }} className="w-full px-2 py-1 rounded text-[10px] font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">Save</button>
                              <button type="button" onClick={cancelEdit} className="w-full px-2 py-1 rounded text-[10px] font-semibold border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              {onUpdateItem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (editingRowId && editingRowId !== item.id && draft) {
                                      const orig = items.find((i) => i.id === editingRowId);
                                      if (isKpiDraftDirty(draft, orig)) {
                                        setCorpPendingSwitch(item);
                                        setCorpUnsavedPopup(true);
                                      } else {
                                        startEdit(item);
                                      }
                                    } else {
                                      startEdit(item);
                                    }
                                  }}
                                  title={ct === "FC" ? "Edit Cascading (FC — data fields read-only)" : ct ? "Edit Cascading" : "Edit Baris"}
                                  className="p-1.5 rounded-lg hover:bg-[#1A284F]/10 text-[#1A284F] transition-colors">
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(!ct || ct === "CC") && onDeleteItem && (
                                <button type="button" onClick={() => setCorpDeleteItem(item)} title="Hapus KPI"
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {/* Cascade badge column */}
                      {showCascadeCol && (
                        <td className="border border-gray-200 py-2 px-1 text-center"
                          style={{ position: "sticky", left: aksiOffset, zIndex: 12, background: stickyBg, minWidth: W_CORP_CASC, maxWidth: W_CORP_CASC }}>
                          {ct ? (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${CASCADE_BADGE[ct]?.cls}`}>
                              {CASCADE_BADGE[ct]?.label}
                            </span>
                          ) : (
                            <span className="text-[9px] text-gray-300">—</span>
                          )}
                        </td>
                      )}
                      {/* No */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center"
                        style={{ position: "sticky", left: leftOffsetBase, zIndex: 12, background: stickyBg, minWidth: W_CORP_NO, maxWidth: W_CORP_NO }}>
                        {isEditing && isFieldEditable("no")
                          ? <input value={row.no} onChange={(e) => setDraftField({ no: e.target.value })} className={cellInput + " text-center font-bold text-gray-600"} />
                          : <span className="font-bold text-gray-500 text-[11px]">{row.no}</span>}
                      </td>
                      {/* Perspektif */}
                      <td className="border border-gray-200 py-2 px-2"
                        style={{ position: "sticky", left: leftOffsetBase + W_CORP_NO, zIndex: 12, background: stickyBg, minWidth: W_CORP_PERSP, maxWidth: W_CORP_PERSP }}>
                        {isEditing && isFieldEditable("perspektif")
                          ? <select value={row.perspektif} onChange={(e) => setDraftField({ perspektif: e.target.value })} className={cellInput}>
                              <option value="">— Perspektif —</option>
                              {corpPerspOpts.map((p) => <option key={p}>{p}</option>)}
                            </select>
                          : <span className={`text-[11px] font-semibold ${PERSP_COLOR[row.perspektif] ?? "text-gray-700"}`}>{row.perspektif}</span>}
                      </td>
                      {/* KPI */}
                      <td className={`border py-2 px-2 ${isCorpDuplicateKpi ? "border-rose-300 bg-rose-50/95" : "border-gray-200"}`}
                        style={{ position: "sticky", left: leftOffsetBase + W_CORP_NO + W_CORP_PERSP, zIndex: 12, background: isCorpDuplicateKpi ? "#ffe4e6" : stickyBg, minWidth: W_CORP_KPI, maxWidth: W_CORP_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}>
                        {isEditing && isFieldEditable("kpi")
                          ? <textarea rows={3} value={row.kpi} onChange={(e) => setDraftField({ kpi: e.target.value })} className={cellInput} />
                          : <p className="text-[11px] font-medium text-gray-800 leading-relaxed">{row.kpi}</p>}
                        {isCorpDuplicateKpi && (
                          <div className="mt-1.5 px-2 py-1 rounded-md bg-rose-100/90 border border-rose-300 text-[10px] text-rose-800 font-semibold leading-snug">
                            judul KPI sama, pastikan tidak ada judul KPI yang sama
                          </div>
                        )}
                        {hasFormatIssue && (
                          <div className="mt-1.5 px-2 py-1 rounded-md bg-rose-100/80 border border-rose-200 text-[10px] text-rose-700 font-medium leading-snug">
                            Format belum sesuai: {formatIssues.join(" · ")}
                          </div>
                        )}
                      </td>
                      {/* Satuan */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("satuan")
                          ? (() => {
                              const sep = row.satuan.indexOf("/");
                              const unit = sep >= 0 ? row.satuan.slice(0, sep).trim() : row.satuan.trim();
                              const periode = sep >= 0 ? row.satuan.slice(sep + 1).trim() : "";
                              const combine = (u: string, p: string) => setDraftField({ satuan: u && p ? `${u}/${p}` : u });
                              return (
                                <div className="flex flex-col gap-1">
                                  <select value={unit} onChange={(e) => combine(e.target.value, periode)} className={cellInput}>
                                    <option value="">— Satuan —</option>
                                    {(master.satuan.length ? master.satuan : SATUAN_UNIT_OPTIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <select value={periode} onChange={(e) => combine(unit, e.target.value)} className={cellInput}>
                                    <option value="">— Periode —</option>
                                    {SATUAN_PERIODE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                                  </select>
                                </div>
                              );
                            })()
                          : <span className="text-[11px] text-gray-600">{row.satuan || "—"}</span>}
                      </td>
                      {/* Formula */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("formula")
                          ? <select value={row.formula} onChange={(e) => setDraftField({ formula: e.target.value })} className={cellInput}>
                              <option value="">— Formula —</option>
                              {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                            </select>
                          : <span className="text-[11px] text-gray-600">{row.formula || "—"}</span>}
                      </td>
                      {/* Scope */}
                      {!hideScope && (
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("scope")
                          ? <ScopeCheckboxField
                              hideLabel
                              options={master.scope.length ? master.scope : []}
                              value={row.scope ? row.scope.split(", ").filter(Boolean) : []}
                              onChange={(vals) => setDraftField({ scope: vals.join(", ") })}
                            />
                          : <span className="text-[11px] text-gray-500 italic">{row.scope || "—"}</span>}
                      </td>
                      )}
                      {/* Bobot */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("bobot")
                          ? <select value={row.bobot} onChange={(e) => setDraftField({ bobot: e.target.value })} className={cellInput + " text-center font-bold text-[#1A284F]"}>
                              {corpRowSubBobotOpts.map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                          : canQuickEditBobot
                          ? <select
                              value={row.bobot}
                              title={`Pilih bobot Sub Section (Maks. sisa Section ${sec}: ${formatPctNum(maxAllowedRowSubBobot)}%)`}
                              onChange={(e) => onUpdateItem?.(item.id, { bobot: e.target.value })}
                              className="px-2 py-0.5 rounded-full bg-[#1A284F] text-white text-[10px] font-bold outline-none cursor-pointer hover:bg-[#243869] transition-colors"
                            >
                              {corpRowSubBobotOpts.map((b) => (
                                <option key={b} value={b} style={{ background: "#ffffff", color: "#1A284F" }}>{b}</option>
                              ))}
                            </select>
                          : <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{row.bobot}</span>}
                      </td>
                      {/* Definisi */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("definisi")
                          ? <textarea rows={3} value={row.definisi} onChange={(e) => setDraftField({ definisi: e.target.value })} className={cellInput} />
                          : <span className="text-[11px] text-gray-600 leading-relaxed">{row.definisi || "—"}</span>}
                      </td>
                      {/* Source */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("source")
                          ? <input value={row.source} onChange={(e) => setDraftField({ source: e.target.value })} className={cellInput} />
                          : <span className="text-[11px] text-gray-500">{row.source || "—"}</span>}
                      </td>
                      {/* Baseline 2025 */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("baseline2025")
                          ? <input value={row.baseline2025} onChange={(e) => setDraftField({ baseline2025: e.target.value })} className={cellInput + " text-center"} />
                          : row.colorIndicator ? <ColorValueBadge value={row.baseline2025} isBaseline /> : <span className="text-[11px] text-gray-700 font-medium">{row.baseline2025 || "—"}</span>}
                      </td>
                      {/* Target 2026 — button opens TargetEditMiniModal when editing */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("target2026")
                          ? <button
                              onClick={() => setCorpTargetEdit({ ...row })}
                              className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded border border-[#1A284F]/30 bg-[#1A284F]/5 hover:bg-[#1A284F]/10 transition-colors"
                            >
                              <span className="text-[11px] font-bold text-[#1A284F] truncate">{row.target2026 || "— Set"}</span>
                              <Edit3 className="w-3 h-3 text-[#1A284F] shrink-0" />
                            </button>
                          : row.colorIndicator ? <ColorValueBadge value={row.target2026} /> : <span className="text-[11px] font-bold text-[#1A284F]">{row.target2026 || "—"}</span>}
                      </td>
                      {/* Polaritas */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("polaritas")
                          ? <select value={row.polaritas} onChange={(e) => setDraftField({ polaritas: e.target.value as Polaritas })} className={cellInput}>
                              <option value="">— Polaritas —</option>
                              {corpPolaritasOpts.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                          : <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              row.polaritas === "Maximize" ? "bg-blue-50 text-blue-700"
                              : row.polaritas === "Minimize" ? "bg-orange-50 text-orange-700"
                              : "bg-emerald-50 text-emerald-700"
                            }`}>{row.polaritas}</span>}
                      </td>
                      {/* Detail Formula */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("detailFormula")
                          ? <textarea rows={3} value={row.detailFormula} onChange={(e) => setDraftField({ detailFormula: e.target.value })} className={cellInput} />
                          : <span className="text-[11px] text-gray-600 leading-relaxed">{row.detailFormula || "—"}</span>}
                      </td>
                      {/* Keterangan */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("keterangan")
                          ? <textarea rows={3} value={row.keterangan ?? ""} onChange={(e) => setDraftField({ keterangan: e.target.value })} className={cellInput} />
                          : <span className="text-[11px] text-gray-600 whitespace-pre-line leading-relaxed">{row.keterangan || "—"}</span>}
                      </td>
                      {/* Tracking Period */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("trackingPeriod")
                          ? <select value={row.trackingPeriod ?? ""} onChange={(e) => setDraftField({ trackingPeriod: e.target.value })} className={cellInput + " text-center"}>
                              <option value="">— Period —</option>
                              {(master.trackingPeriod.length ? master.trackingPeriod : TRACKING_PERIOD_OPTIONS).map((t) => <option key={t}>{t}</option>)}
                            </select>
                          : <span className="text-[11px] text-gray-500">{row.trackingPeriod || "—"}</span>}
                      </td>
                      {/* Cascading columns — inverted: sub-columns = type (FC/PC/CC), cells = role names */}
                      {!previewMode && !hideCascading && (() => {
                        const hasCascMap = row.cascadingMap && Object.keys(row.cascadingMap).length > 0;
                        const activeRoleFields = hasCascMap
                          ? masterCascRoles
                          : LEGACY_CASC_ROLE_FIELDS;
                        const getRoleValue = (key: string) =>
                          hasCascMap
                            ? (row.cascadingMap?.[key] ?? "")
                            : ((row as unknown as Record<string, unknown>)[key] as string) ?? "";
                        return isEditing ? (
                          // Edit mode: one cell per type (FC/PC/CC) with search + checkbox list
                          <>
                            {(["FC", "PC", "CC"] as const).map((type) => (
                              <td key={type} className="border border-gray-200 py-2 px-1.5 align-top bg-blue-50/20" style={{ minWidth: 130 }}>
                                <CascadingTypePanel
                                  type={type}
                                  roles={activeRoleFields}
                                  getValue={getRoleValue}
                                  onToggle={(key, checked) => {
                                    const newVal = checked ? type : "";
                                    if (hasCascMap) {
                                      setDraftField({ cascadingMap: { ...(row.cascadingMap ?? {}), [key]: newVal } });
                                    } else {
                                      setDraftField({ [key]: newVal } as Partial<KPISetting>);
                                    }
                                  }}
                                />
                              </td>
                            ))}
                          </>
                        ) : (
                          // Read mode: one cell per cascading type, roles as comma-separated text
                          <>
                            {(["FC", "PC", "CC"] as const).map((type) => {
                              const roles = activeRoleFields.filter(rf => getRoleValue(rf.key) === type);
                              const typeCls = type === "FC"
                                ? "text-[#1A284F]"
                                : type === "PC"
                                ? "text-amber-800"
                                : "text-teal-800";
                              return (
                                <td key={type} className="border border-gray-200 py-2 px-2">
                                  {roles.length > 0 ? (
                                    <span className={`text-[10px] font-medium leading-snug ${typeCls}`}>
                                      {roles.map(rf => rf.label).join(", ")}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-[10px]">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </>
                        );
                      })()}
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </DualScrollTableContainer>
    </div>

    {/* Target Edit Mini Modal — opens from Target 2026 cell in edit mode */}
    {corpTargetEdit && (
      <TargetEditMiniModal
        item={corpTargetEdit}
        onSave={(updates) => { setCorpRowPatch(corpTargetEdit.id, updates); setCorpTargetEdit(null); }}
        onClose={() => setCorpTargetEdit(null)}
      />
    )}
    {corpDeleteItem && (
      <DeleteKpiRowConfirmModal
        item={corpDeleteItem}
        onCancel={() => setCorpDeleteItem(null)}
        onConfirm={() => {
          onDeleteItem?.(corpDeleteItem.id);
          if (editingRowId === corpDeleteItem.id) cancelEdit();
          setCorpDeleteItem(null);
        }}
      />
    )}
    {corpUnsavedPopup && draft && (
      <UnsavedRowEditPopup
        kpiNo={draft.no || "—"}
        onContinueEdit={() => {
          setCorpUnsavedPopup(false);
          setCorpPendingSwitch(null);
        }}
        onDiscard={() => {
          const nextTarget = corpPendingSwitch;
          cancelEdit();
          if (nextTarget) startEdit(nextTarget);
        }}
        onSave={() => {
          const nextTarget = corpPendingSwitch;
          const ok = saveEdit();
          setCorpUnsavedPopup(false);
          setCorpPendingSwitch(null);
          if (ok && nextTarget) startEdit(nextTarget);
        }}
      />
    )}
    {corpGlobalExitConfirm && (
      <GlobalEditUnsavedModal
        onContinueEdit={() => setCorpGlobalExitConfirm(false)}
        onDiscardAll={discardCorpGlobalEdit}
        onSaveAll={() => { commitCorpGlobalEdit(); }}
      />
    )}

    {/* Bobot Over-Limit Popup */}
    {bobotOverError && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-red-200 w-full max-w-md mx-4 overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 bg-red-50 border-b border-red-200">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-red-800 text-sm">
                {bobotOverError.kind === "total" ? "Total Bobot Seluruh KPI Melebihi 100%" : "Total Bobot Melebihi Batas Section"}
              </p>
              <p className="text-red-600 text-xs mt-0.5">Revisi diperlukan sebelum menyimpan</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="bg-red-50 rounded-xl border border-red-100 px-4 py-3 mb-4">
              {bobotOverError.kind === "total" ? (
                <p className="text-xs text-gray-600 mb-2">Total bobot dari <strong>semua KPI</strong> di seluruh section</p>
              ) : (
                <p className="text-xs text-gray-600 mb-2">
                  Section <strong>{bobotOverError.section}. {bobotOverError.sectionLabel}</strong>
                </p>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{bobotOverError.kind === "total" ? "Batas Total Bobot:" : "Batas Bobot Section:"}</span>
                <span className="font-bold text-gray-800">{bobotOverError.sectionBobot}%</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-red-600">Total Bobot KPI:</span>
                <span className="font-bold text-red-700">{bobotOverError.totalBobot}%</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-red-600">Kelebihan:</span>
                <span className="font-bold text-red-700">+{(bobotOverError.totalBobot - bobotOverError.sectionBobot).toFixed(1)}%</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              {bobotOverError.kind === "total"
                ? "Total akumulasi bobot semua KPI tidak boleh melebihi 100%. Silakan sesuaikan nilai bobot KPI sebelum menyimpan."
                : "Total bobot semua KPI dalam satu section tidak boleh melebihi bobot section. Silakan sesuaikan nilai bobot KPI sebelum menyimpan."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBobotOverError(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Revisi Bobot
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Supervisor unit config ───────────────────────────────────────────────────


// ─── Division KPI Section (cascaded from Business) ────────────────────────────

interface DivisionRow extends KPISetting {
  cascadingType: "FC" | "PC" | "CC" | "CUSTOM";
}


type TabStatus = "idle" | "pending" | "approved" | "pending-target";


// ─── KPI Section per tab ──────────────────────────────────────────────────────

function readStoredPersonalKpiItems(employeeId: string): KPISetting[] | null {
  try {
    const normId = normalizeEmployeeId(employeeId);
    const raw = safeGetLocalRaw("pa_kpi_setting_by_emp_v2");
    const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
    if (normId && Object.prototype.hasOwnProperty.call(map, normId) && Array.isArray(map[normId])) {
      return map[normId];
    }
    const trimmed = String(employeeId ?? "").trim();
    if (trimmed && Object.prototype.hasOwnProperty.call(map, trimmed) && Array.isArray(map[trimmed])) {
      return map[trimmed];
    }
  } catch {
    // ignore
  }
  return null;
}

function readStoredBusinessKpiItems(scopeKey: string): KPISetting[] | null {
  try {
    const raw = localStorage.getItem("pa_kpi_business_by_scope_v1");
    const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
    if (Array.isArray(map[scopeKey]) && map[scopeKey].length > 0) return map[scopeKey];
    if (scopeKey === "unit-PT RSUP ASD" && Array.isArray(map["unit-ASD"]) && map["unit-ASD"].length > 0) {
      return map["unit-ASD"];
    }
  } catch {
    // ignore
  }
  return null;
}

/** Ambil nilai Periode Tracking dari bagian /Periode pada Satuan (Add New KPI -> Sub Section -> Satuan -> Periode). */
export function derivePeriodeTrackingFromSatuan(satuan?: string, fallback?: string): string {
  const s = String(satuan ?? "");
  const idx = s.indexOf("/");
  if (idx >= 0) {
    const raw = s.slice(idx + 1).trim();
    if (raw) {
      if (/^bulan$/i.test(raw)) return "Bulan";
      if (/^tahun$/i.test(raw)) return "Tahun";
      return raw;
    }
  }
  return fallback || "Bulan";
}

const SECTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Nama section sebuah baris KPI (label tersimpan pada item → metadata statis KPI Group → kode). */
export function resolveKpiSectionLabel(item?: Pick<KPISetting, "section" | "sectionLabel">): string {
  if (!item) return "";
  return item.sectionLabel || CORP_SECTION_META[item.section]?.label || `Section ${item.section}`;
}

/**
 * Menyalin baris KPI sumber (KPI (Group) / KPI (Unit)) ke format tujuan:
 * - Section: memakai section tujuan dengan nama sama, atau kode asli bila belum dipakai, atau huruf berikutnya.
 * - Kolom yang tidak ada di format tujuan dikosongkan (mis. kolom Cascading untuk KPI (Personal)).
 */
/** Nama section untuk tabel KPI (Personal): label item → default Objective/Functional → kode. */
export function resolvePersonalSectionLabel(item?: Pick<KPISetting, "section" | "sectionLabel">): string {
  if (!item) return "";
  const def = PERSONAL_SECTION_OPTIONS.find((o) => o.value === item.section)?.label.replace(/^[A-Z]+\s*—\s*/, "");
  return item.sectionLabel || def || `Section ${item.section}`;
}

export function mapCopiedKpiRows(source: KPISetting[], target: KPISetting[], toPersonal: boolean): KPISetting[] {
  const targetLabel = (t: KPISetting) => (toPersonal ? resolvePersonalSectionLabel(t) : resolveKpiSectionLabel(t));
  const usedCodes = new Set(target.map((t) => t.section));
  const codeByKey = new Map<string, string>();
  const takeCode = (src: KPISetting): string => {
    const label = resolveKpiSectionLabel(src);
    const key = `${src.section}__${label}`;
    const cached = codeByKey.get(key);
    if (cached) return cached;
    const sameLabel = target.find((t) => targetLabel(t).trim().toLowerCase() === label.trim().toLowerCase());
    let code = sameLabel?.section;
    if (!code) {
      code = !usedCodes.has(src.section) ? src.section : SECTION_LETTERS.find((l) => !usedCodes.has(l)) ?? src.section;
    }
    usedCodes.add(code);
    codeByKey.set(key, code);
    return code;
  };
  const maxNo = target.reduce((m, t) => Math.max(m, parseInt(String(t.no), 10) || 0), 0);
  const stamp = Date.now();
  return source.map((src, idx) => {
    const code = takeCode(src);
    const base: KPISetting = {
      id: `copy-${stamp}-${idx}`,
      no: String(maxNo + idx + 1),
      section: code,
      sectionAlphabet: `${code}.`,
      sectionLabel: resolveKpiSectionLabel(src),
      sectionBobot: src.sectionBobot || CORP_SECTION_META[src.section]?.bobot || "",
      perspektif: src.perspektif ?? "",
      kpi: src.kpi ?? "",
      satuan: src.satuan ?? "",
      formula: src.formula ?? "",
      bobot: src.bobot ?? "",
      definisi: src.definisi ?? "",
      source: src.source ?? "",
      baseline2025: src.baseline2025 ?? "",
      target2026: src.target2026 ?? "",
      polaritas: src.polaritas ?? "Maximize",
      detailFormula: src.detailFormula ?? "",
      keterangan: src.keterangan ?? "",
      monthlyTargets: src.monthlyTargets ? { ...src.monthlyTargets } : {},
      colorIndicator: src.colorIndicator ?? false,
      indicatorMode: src.indicatorMode ?? "numeric",
      ratioPositiveLabel: src.ratioPositiveLabel,
      ratioNegativeLabel: src.ratioNegativeLabel,
      scope: "",
      trackingPeriod: src.trackingPeriod ?? "",
      copiedFromId: src.id,
    };
    if (toPersonal) return base;
    return { ...base, coo: "", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "", cascadingMap: {} };
  });
}

/** Ubah urutan section (mis. C → D). Bila kode tujuan sudah dipakai, kedua section ditukar. */
export function renameKpiSection(items: KPISetting[], oldSec: string, newSec: string, personal = false): KPISetting[] {
  if (!newSec || oldSec === newSec) return items;
  const personalBobot = (sec: string) => PERSONAL_SECTION_OPTIONS.find((o) => o.value === sec)?.bobot ?? "";
  const pin = (i: KPISetting): KPISetting => ({
    ...i,
    sectionLabel: personal ? resolvePersonalSectionLabel(i) : resolveKpiSectionLabel(i),
    sectionBobot: i.sectionBobot || (personal ? personalBobot(i.section) : CORP_SECTION_META[i.section]?.bobot) || "",
  });
  return items.map((i) => {
    if (i.section === oldSec) return { ...pin(i), section: newSec, sectionAlphabet: `${newSec}.` };
    if (i.section === newSec) return { ...pin(i), section: oldSec, sectionAlphabet: `${oldSec}.` };
    return i;
  });
}

/** Sumber copy KPI (Group) / KPI (Unit) berdasarkan profil pemilik KPI (data tersimpan di backend, fallback format Master KPI). */
function buildKpiCopySources(owner: ManagedUser): { group: KpiCopySource; unit: KpiCopySource } {
  const fmt = () => loadMasterKpiFormats<KPISetting>({ group: CORPORATE_KPI, unit: CORPORATE_KPI, personal: PERSONAL_KPI });
  return {
    group: {
      label: "KPI (Group)",
      load: () => readStoredBusinessKpiItems(`corporate-${getGroupNameForUnit(owner.company)}`) ?? fmt().group,
    },
    unit: {
      label: "KPI (Unit)",
      load: () => readStoredBusinessKpiItems(`unit-${owner.company}`) ?? (usesDemoSampleData(owner) ? fmt().unit : []),
    },
  };
}

function readStoredBusinessKpiStatus(scopeKey: string): { submitted: boolean; approved: boolean } {
  try {
    const raw = localStorage.getItem("pa_kpi_business_status_v1");
    const map = raw ? (JSON.parse(raw) as Record<string, { submitted?: boolean; approved?: boolean }>) : {};
    const entry = map[scopeKey] ?? (scopeKey === "unit-PT RSUP ASD" ? map["unit-ASD"] : undefined);
    return { submitted: Boolean(entry?.submitted), approved: Boolean(entry?.approved) };
  } catch {
    return { submitted: false, approved: false };
  }
}

interface KpiCopySource {
  /** Label tag & sumber, mis. "KPI (Group)" atau "KPI (Unit)" */
  label: string;
  load: () => KPISetting[];
}

function KPISection({ initialItems, isPersonal, isCorporate, hideCascading, divisionApproved = true, useValidateTerms = false, onTabStatusChange, onItemsChange, sectionCascadeMap, onSectionCascadeChange, parentSectionCascadeMap, editedSectionBobots, onSectionBobotChange, ownerUser, businessScopeKey, delegationAccess, actorName, workspaceLabel, copySource }: {
  copySource?: KpiCopySource;
  initialItems: KPISetting[]; isPersonal: boolean; isCorporate?: boolean; hideCascading?: boolean; divisionApproved?: boolean; useValidateTerms?: boolean;
  onTabStatusChange?: (s: TabStatus) => void;
  onItemsChange?: (items: KPISetting[]) => void;
  sectionCascadeMap?: Record<string, string>;
  onSectionCascadeChange?: (sec: string, val: string) => void;
  parentSectionCascadeMap?: Record<string, string>;
  editedSectionBobots?: Record<string, string>;
  onSectionBobotChange?: (sec: string, val: string) => void;
  ownerUser?: ManagedUser;
  businessScopeKey?: string;
  delegationAccess?: DelegationAccess;
  actorName?: string;
  workspaceLabel?: string;
}) {
  const effectiveOwner = ownerUser ?? getActiveUser();
  const actorUser = getActiveUser();
  const isDelegated = normalizeEmployeeId(effectiveOwner.employeeId) !== normalizeEmployeeId(actorUser.employeeId);
  const actorLabel = isDelegated ? `${actorName || actorUser.name} | atas nama ${effectiveOwner.name}` : (actorName || actorUser.name);

  const canCreate = !delegationAccess || Boolean(delegationAccess.create);
  const canEdit = !delegationAccess || Boolean(delegationAccess.edit);
  const canDelete = !delegationAccess || Boolean(delegationAccess.delete);
  const canSubmit = canCreate || canEdit;
  const isViewOnly = Boolean(delegationAccess && !canCreate && !canEdit && !canDelete);
  const effectiveScopeKey = businessScopeKey || (isCorporate ? `corporate-${getGroupNameForUnit(effectiveOwner.company)}` : "");
  const masterForSection = useMasterKpi();
  // Pin owner & scope key pada saat mount agar perpindahan akun login tidak pernah menyimpan draft user lama ke user baru
  const pinnedOwnerRef = useRef<ManagedUser>(effectiveOwner);
  const pinnedScopeKeyRef = useRef<string>(effectiveScopeKey);
  useEffect(() => {
    pinnedOwnerRef.current = effectiveOwner;
    pinnedScopeKeyRef.current = effectiveScopeKey;
  }, [effectiveOwner.employeeId, effectiveScopeKey]);

  const readAttachmentsForCurrentScope = () => {
    try {
      const raw = safeGetLocalRaw("pa_kpi_attachments_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, Array<{ id: string; name: string; size: number; mimeType?: string; url: string; uploadedAt: string }>>) : {};
      const key = isCorporate ? effectiveScopeKey : normalizeEmployeeId(effectiveOwner.employeeId);
      const direct = map[key] ?? (!isCorporate ? map[effectiveOwner.employeeId] : undefined);
      return Array.isArray(direct) ? direct : [];
    } catch {
      return [];
    }
  };
  const [kpiAttachments, setKpiAttachments] = useState<Array<{ id: string; name: string; size: number; mimeType?: string; url: string; uploadedAt: string }>>(
    () => readAttachmentsForCurrentScope(),
  );
  const [previewKpiAtt, setPreviewKpiAtt] = useState<{ id: string; name: string; size: number; mimeType?: string; url: string; uploadedAt: string } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const kpiAttachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKpiAttachments(readAttachmentsForCurrentScope());
    if (!isCorporate && effectiveOwner.employeeId) {
      let cancelled = false;
      void fetchKpiAttachmentsForEmployee(effectiveOwner.employeeId).then((remote) => {
        if (!cancelled && remote.length > 0) {
          setKpiAttachments(remote);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCorporate, effectiveScopeKey, effectiveOwner.employeeId]);

  const handleUploadKpiAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingAttachment(true);
    const key = isCorporate ? effectiveScopeKey : normalizeEmployeeId(effectiveOwner.employeeId);
    const added: Array<{ id: string; name: string; size: number; mimeType?: string; url: string; uploadedAt: string }> = [];
    for (const f of Array.from(files)) {
      let url = "";
      let uploadedId = "";
      let uploadedMime = f.type || "";
      try {
        const up = await uploadEvidenceFileToSupabase(f, {
          employeeId: effectiveOwner.employeeId,
          employeeName: effectiveOwner.name,
          companyUnit: effectiveOwner.company,
          division: effectiveOwner.division || "-",
          department: effectiveOwner.department || "-",
          position: effectiveOwner.position || "-",
          moduleType: "Lampiran KPI Setting",
          period: "2026",
          month: "All",
        });
        url = up?.url || "";
        uploadedId = up?.id || "";
        uploadedMime = up?.mimeType || uploadedMime;
      } catch {
        url = "";
      }
      added.push({
        id: uploadedId || `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        size: f.size,
        mimeType: uploadedMime || undefined,
        url,
        uploadedAt: formatTodayDDMMYYYY(),
      });
    }
    setKpiAttachments((prev) => {
      const next = [...prev, ...added];
      try {
        const raw = safeGetLocalRaw("pa_kpi_attachments_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, typeof next>) : {};
        map[key] = next;
        safeSetLocalJson("pa_kpi_attachments_v1", map);
      } catch {
        // ignore
      }
      // Simpan metadata ringan di pa_kv_state (URL Storage tetap utuh; Data URL besar sudah tersimpan di pa_evidence_files)
      const kvLight = next.map((item) =>
        item.url && item.url.startsWith("data:") && item.url.length > 150_000
          ? { ...item, url: "" }
          : item,
      );
      void mergeKvMapRecord("pa_kpi_attachments_v1", key, kvLight);
      return next;
    });
    setUploadingAttachment(false);
    toast.success(`${added.length} file lampiran KPI berhasil diunggah.`);
  };

  const handleRemoveKpiAttachment = (attId: string) => {
    const key = isCorporate ? effectiveScopeKey : normalizeEmployeeId(effectiveOwner.employeeId);
    void deleteUploadedEvidenceById(attId);
    setKpiAttachments((prev) => {
      const next = prev.filter((a) => a.id !== attId);
      try {
        const raw = safeGetLocalRaw("pa_kpi_attachments_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, typeof next>) : {};
        map[key] = next;
        safeSetLocalJson("pa_kpi_attachments_v1", map);
      } catch {
        // ignore
      }
      void mergeKvMapRecord("pa_kpi_attachments_v1", key, next);
      return next;
    });
  };


  const [view, setView]               = useState<PageView>(() => (isViewOnly ? "preview" : "input"));
  const [items, setItems_]            = useState<KPISetting[]>(() => {
    if (isCorporate) {
      return readStoredBusinessKpiItems(effectiveScopeKey) ?? initialItems;
    }
    return readStoredPersonalKpiItems(effectiveOwner.employeeId) ?? initialItems;
  });

  const persistKpiItemsToBackend = (
    nextItems: KPISetting[],
    statusLabel: string,
    ownerOverride?: ManagedUser,
    scopeKeyOverride?: string,
  ) => {
    const targetOwner = ownerOverride ?? pinnedOwnerRef.current;
    const targetScopeKey = scopeKeyOverride ?? pinnedScopeKeyRef.current;
    if (isCorporate) {
      try {
        const raw = safeGetLocalRaw("pa_kpi_business_by_scope_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
        map[targetScopeKey] = nextItems;
        safeSetLocalJson("pa_kpi_business_by_scope_v1", map);
      } catch {
        // ignore
      }
      void mergeKvMapRecord("pa_kpi_business_by_scope_v1", targetScopeKey, nextItems);
      void syncToSupabase({
        kind: "kpi-business",
        id: targetScopeKey,
        period: "2026",
        items: nextItems,
        status: statusLabel,
        audit: {
          userId: actorUser.employeeId,
          userName: actorLabel,
          action: statusLabel === "Submitted" ? "Create" : "Update",
          module: "KPI",
          subModule: workspaceLabel || "KPI Business Setting",
          description: `${statusLabel === "Submitted" ? "Submitted" : "Updated"} ${nextItems.length} KPI Business (${targetScopeKey}) by ${actorLabel}`,
        },
      });
    } else {
      const normId = normalizeEmployeeId(targetOwner.employeeId);
      try {
        const raw = safeGetLocalRaw("pa_kpi_setting_by_emp_v2");
        const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
        map[normId] = nextItems;
        safeSetLocalJson("pa_kpi_setting_by_emp_v2", map);
      } catch {
        // ignore
      }
      void mergeKvMapRecord("pa_kpi_setting_by_emp_v2", normId, nextItems);
      void syncToSupabase({
        kind: "kpi-setting",
        docKey: `${targetOwner.employeeId}:personal:2026`,
        employeeId: targetOwner.employeeId,
        companyUnit: targetOwner.company,
        tab: "personal",
        period: "2026",
        items: nextItems,
        status: statusLabel,
        audit: {
          userId: actorUser.employeeId,
          userName: actorLabel,
          action: statusLabel === "Submitted" ? "Create" : "Update",
          module: "KPI",
          subModule: "KPI Setting (Personal)",
          description: `${statusLabel === "Submitted" ? "Submitted" : "Updated"} ${nextItems.length} KPI Setting Personal (${targetOwner.employeeId}) by ${actorLabel}`,
        },
      });
    }
  };

  const [draftDirtyInSession, setDraftDirtyInSession] = useState(false);
  const latestItemsRef = useRef<KPISetting[]>(items);
  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  const setItems = (updater: KPISetting[] | ((prev: KPISetting[]) => KPISetting[])) => {
    setDraftDirtyInSession(true);
    const prevSnap = latestItemsRef.current;
    const computedNext = typeof updater === "function" ? updater(prevSnap) : updater;
    const prevDups = findDuplicateKpiTitleIds(prevSnap);
    const nextDups = findDuplicateKpiTitleIds(computedNext);
    if (
      nextDups.size > 0 &&
      (computedNext.length > prevSnap.length || Array.from(nextDups).some((id) => !prevDups.has(id)))
    ) {
      toast.error("judul KPI sama, pastikan tidak ada judul KPI yang sama");
    }
    setItems_((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistKpiItemsToBackend(next, "Draft");
      return next;
    });
  };

  const handleUpdateSectionMeta = (sec: string, patch: { sectionLabel?: string; sectionBobot?: string }) => {
    if (patch.sectionBobot !== undefined) {
      onSectionBobotChange?.(sec, patch.sectionBobot);
    }
    setItems((prev) => {
      const secRows = prev.filter((i) => i.section === sec);
      const fallbackLabel = !isCorporate
        ? resolvePersonalSectionLabel(secRows[0])
        : resolveKpiSectionLabel(secRows[0]);
      const fallbackBobot = `${formatPctNum(resolveEffectiveSectionBobotNum(prev, sec, Boolean(isCorporate), editedSectionBobots))}%`;
      return prev.map((i) => {
        if (i.section !== sec) return i;
        return {
          ...i,
          sectionLabel: patch.sectionLabel !== undefined ? patch.sectionLabel : (i.sectionLabel || fallbackLabel),
          sectionBobot: patch.sectionBobot !== undefined ? patch.sectionBobot : (i.sectionBobot || fallbackBobot),
        };
      });
    });
  };

  useEffect(() => {
    onItemsChange?.(items);
  }, [items]);
  const [editingItem, setEditingItem] = useState<KPISetting | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceItems, setCopySourceItems] = useState<KPISetting[]>([]);
  const handleRenameSection = (oldSec: string, newSec: string) =>
    setItems((prev) => renameKpiSection(prev, oldSec, newSec, !isCorporate));
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [tableScale, setTableScale] = useState<KpiTableScale>("md");

  const toggleTableFullscreen = () => {
    setIsTableFullscreen((prev) => {
      const next = !prev;
      dispatchTableFullscreen(next);
      return next;
    });
  };

  const cycleTableScale = () => {
    setTableScale((prev) => (prev === "md" ? "sm" : prev === "sm" ? "lg" : "md"));
  };

  useEffect(() => {
    return () => {
      dispatchTableFullscreen(false);
    };
  }, []);
  const readPersonalWorkflowState = () => {
    if (isCorporate) {
      const st = readStoredBusinessKpiStatus(effectiveScopeKey);
      return {
        isSub: st.submitted,
        isApp: st.approved,
        rec: undefined as ReturnType<typeof loadWorkflowRecords>[number] | undefined,
        storedItems: readStoredBusinessKpiItems(effectiveScopeKey),
      };
    }
    const normId = normalizeEmployeeId(effectiveOwner.employeeId);
    const storedItems = readStoredPersonalKpiItems(effectiveOwner.employeeId);
    const rec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "KPI" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === effectiveOwner.employeeId.toLowerCase()),
    );
    if (!rec) return { isSub: false, isApp: false, rec: undefined, storedItems };
    const chk = rec.decisions.checker?.status ?? "";
    const a1 = rec.decisions.approver1?.status ?? "";
    const a2 = rec.decisions.approver2?.status ?? "";
    const val = rec.decisions.validator?.status ?? "";
    const isRev = chk === "Revision" || a1 === "Revision" || a2 === "Revision" || val === "Revision";
    const isApp = val === "Validated" || a2 === "Validated";
    return { isSub: !isRev, isApp, rec, storedItems };
  };
  const [submitted, setSubmitted]     = useState(() => readPersonalWorkflowState().isSub);
  const [wfRecState, setWfRecState]   = useState(() => readPersonalWorkflowState().rec);
  const [showEditRequest, setShowEditRequest]             = useState(false);
  const [showEditRequestSuccess, setShowEditRequestSuccess] = useState(false);
  const [pendingEditRequest, setPendingEditRequest]       = useState(false);
  const [kpiApproved, setKpiApproved]                   = useState(() => readPersonalWorkflowState().isApp);
  const readTargetEditState = () => {
    const req = getTargetEditRequestForEmployee<KPISetting>(effectiveOwner.employeeId);
    return {
      pendingPhase1: req?.stage === "pending_phase1_hricf",
      phase1Approved: req?.stage === "phase1_approved",
      phase2Pending:
        req?.stage === "pending_ap1" ||
        req?.stage === "pending_ap2" ||
        req?.stage === "pending_gm" ||
        req?.stage === "pending_validate",
      selectedIds: req?.selectedKpiIds ?? [],
      cat: req?.phase1Category ?? "",
      reason: req?.phase1Reason ?? "",
    };
  };
  const initTe = readTargetEditState();
  const [showTargetEditRequest, setShowTargetEditRequest] = useState(false);
  const [showTargetEditSuccess, setShowTargetEditSuccess] = useState(false);
  const [pendingTargetEditRequest, setPendingTargetEditRequest] = useState(initTe.pendingPhase1);
  const [targetEditApproved, setTargetEditApproved]     = useState(initTe.phase1Approved);
  const [monthlyTargetPending, setMonthlyTargetPending] = useState(initTe.phase2Pending);
  const [showMonthlyTargetEdit, setShowMonthlyTargetEdit] = useState(false);
  const [selectedTargetKpis, setSelectedTargetKpis]     = useState<string[]>(initTe.selectedIds);
  const [targetEditCategory, setTargetEditCategory]     = useState(initTe.cat);
  const [targetEditReason, setTargetEditReason]         = useState(initTe.reason);

  useEffect(() => {
    const init = readPersonalWorkflowState();
    setItems_(init.storedItems ?? initialItems);
    setKpiAttachments(readAttachmentsForCurrentScope());
    const onSync = () => {
      const st = readPersonalWorkflowState();
      setSubmitted(st.isSub);
      setKpiApproved(st.isApp);
      setWfRecState(st.rec);
      const te = readTargetEditState();
      setPendingTargetEditRequest(te.pendingPhase1);
      setTargetEditApproved(te.phase1Approved);
      setMonthlyTargetPending(te.phase2Pending);
      setSelectedTargetKpis(te.selectedIds);
      setTargetEditCategory(te.cat);
      setTargetEditReason(te.reason);
      setItems_(st.storedItems ?? initialItems);
      setKpiAttachments(readAttachmentsForCurrentScope());
      if (st.rec && !st.isSub && !isViewOnly) {
        setView("input");
      }
      if (isViewOnly) {
        setView("preview");
      }
    };
    window.addEventListener("pa-auth-updated", onSync);
    window.addEventListener("appraisal-updated", onSync);
    window.addEventListener(KPI_TARGET_EDIT_EVENT, onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener("pa-auth-updated", onSync);
      window.removeEventListener("appraisal-updated", onSync);
      window.removeEventListener(KPI_TARGET_EDIT_EVENT, onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener("storage", onSync);
    };
  }, [isCorporate, effectiveOwner.employeeId, effectiveScopeKey, isViewOnly]);

  useEffect(() => {
    let ts: TabStatus = "idle";
    if (submitted && !kpiApproved) ts = "pending";
    else if (kpiApproved) {
      if (pendingTargetEditRequest || monthlyTargetPending) ts = "pending-target";
      else ts = "approved";
    }
    onTabStatusChange?.(ts);
  }, [submitted, kpiApproved, pendingTargetEditRequest, monthlyTargetPending]);

  const submitStatus = evaluateKpiSettingSubmitStatus(items, Boolean(isCorporate), editedSectionBobots);
  const totalBobot = submitStatus.totalItemBobot;
  const totalSectionBobot = submitStatus.totalSectionBobot;
  const isBobotExact100 = submitStatus.canSubmit;

  const hasUnsubmittedCreatedDraft =
    !submitted &&
    !kpiApproved &&
    !isViewOnly &&
    items.length > 0 &&
    (draftDirtyInSession || initialItems.length === 0);

  const draftBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsubmittedCreatedDraft &&
      currentLocation.pathname !== nextLocation.pathname &&
      normalizeEmployeeId(getActiveUser().employeeId) === normalizeEmployeeId(pinnedOwnerRef.current.employeeId),
  );

  useEffect(() => {
    if (draftBlocker.state === "blocked") {
      persistKpiItemsToBackend(latestItemsRef.current, "Draft", pinnedOwnerRef.current, pinnedScopeKeyRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftBlocker.state]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!submitted && !kpiApproved && !isViewOnly && latestItemsRef.current.length > 0 && draftDirtyInSession) {
        persistKpiItemsToBackend(latestItemsRef.current, "Draft", pinnedOwnerRef.current, pinnedScopeKeyRef.current);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, kpiApproved, isViewOnly, draftDirtyInSession]);

  const handleConfirm = () => { setShowConfirm(false); setShowSuccess(true); };
  const handleSuccessClose = () => {
    setShowSuccess(false);
    setDraftDirtyInSession(false);
    setSubmitted(true);
    setView("preview");
    const todayStr = formatTodayDDMMYYYY();
    persistKpiItemsToBackend(items, "Submitted");
    if (isCorporate) {
      const isUnitScope = effectiveScopeKey.startsWith("unit-") || effectiveScopeKey.startsWith("corporate-unit");
      const statusRecord = {
        submitted: true,
        directorApproved: false,
        approved: false,
        stage: isUnitScope ? "pending_director" : "pending_validator",
        companyUnit: effectiveOwner.company,
        submittedDate: todayStr,
        submittedBy: actorLabel,
        submittedById: effectiveOwner.employeeId,
      };
      try {
        const raw = safeGetLocalRaw("pa_kpi_business_status_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        map[effectiveScopeKey] = statusRecord;
        safeSetLocalJson("pa_kpi_business_status_v1", map);
      } catch {
        // ignore
      }
      void mergeKvMapRecord("pa_kpi_business_status_v1", effectiveScopeKey, statusRecord);
      // Notifikasi ke Owner (GM / Director) & ke Approver (Director / HR ICF)
      const allUsersPool = loadManagedUsers();
      pushEmployeeNotification({
        employeeIds: [effectiveOwner.employeeId],
        title: `Pengajuan ${isUnitScope ? `KPI (Unit) — ${effectiveOwner.company}` : "KPI (Group)"} Berhasil Disubmit`,
        summary: `Pengajuan ${isUnitScope ? `KPI (Unit) ${effectiveOwner.company}` : "KPI (Group)"} Anda telah berhasil disubmit pada ${todayStr} dan sedang menunggu ${isUnitScope ? "persetujuan Director" : "validasi HR ICF"}.`,
        category: "Approval",
        moduleName: "KPI",
        approvalStatus: "Submitted",
        ctaLabel: "Buka KPI Setting",
        ctaRoute: "/setting/kpi",
        senderName: actorLabel,
      });
      if (isUnitScope) {
        const groupUnits = getGroupCompaniesForUnit(effectiveOwner.company);
        const directorIds = allUsersPool
          .filter((u) => u.status === "Active" && isDirectorRoleOrGrouping(u) && groupUnits.includes(u.company))
          .map((u) => u.employeeId);
        if (directorIds.length > 0) {
          pushEmployeeNotification({
            employeeIds: directorIds,
            title: `Pengajuan KPI (Unit) ${effectiveOwner.company} Menunggu Approval Director`,
            summary: `${actorLabel} telah mensubmit KPI (Unit) untuk ${effectiveOwner.company}. Silakan review & Approve di menu Approvals → KPI Business.`,
            category: "Approval",
            moduleName: "KPI Business",
            approvalStatus: "Pending",
            ctaLabel: "Approve KPI (Unit)",
            ctaRoute: "/bod/settings/kpi/gm",
            senderName: actorLabel,
            senderRole: effectiveOwner.role,
          });
        }
      } else {
        const hrIcfIds = allUsersPool
          .filter((u) => u.status === "Active" && (u.role === "HR ICF" || Boolean(u.isHrIcfValidator) || u.role === "Administrator"))
          .map((u) => u.employeeId);
        if (hrIcfIds.length > 0) {
          pushEmployeeNotification({
            employeeIds: hrIcfIds,
            title: `Pengajuan KPI (Group) Menunggu Validasi HR ICF`,
            summary: `${actorLabel} telah mensubmit KPI (Group). Silakan review & Validate di menu Approvals → KPI Business.`,
            category: "Approval",
            moduleName: "KPI Business",
            approvalStatus: "Pending",
            ctaLabel: "Validate KPI (Group)",
            ctaRoute: "/hr/settings/kpi/group",
            senderName: actorLabel,
            senderRole: effectiveOwner.role,
          });
        }
      }
      window.dispatchEvent(new Event("appraisal-updated"));
    } else {
      submitWorkflowModule("KPI", "setting", todayStr, effectiveOwner.employeeId);
    }
    setWfRecState(readPersonalWorkflowState().rec);
  };

  const isUnitWorkspace = isCorporate && (workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") || effectiveScopeKey.startsWith("corporate-unit"));

  const handleExport = () => {
    const isGroupTable = Boolean(isCorporate && !isUnitWorkspace);
    const baseCols = isGroupTable
      ? ["No","Perspektif","KPI","Satuan","Formula Setahun","Scope","Bobot","Definisi","Source","Baseline 2025","Target 2026","Polaritas","Detail Formula","Keterangan","Periode Tracking"]
      : ["No","Perspektif","KPI","Satuan","Formula Setahun","Bobot","Definisi","Source","Baseline 2025","Target 2026","Polaritas","Detail Formula","Keterangan","Periode Tracking"];
    const totalColCount = isGroupTable ? baseCols.length + 3 : baseCols.length;
    const colWidths = isGroupTable
      ? [7, 16, 34, 15, 16, 22, 10, 32, 22, 14, 14, 13, 32, 24, 16, 22, 22, 22]
      : [7, 16, 34, 15, 16, 10, 32, 22, 14, 14, 13, 32, 24, 16];

    const rowsOut: StyledExcelCell[][] = [];
    const merges: StyledExcelMerge[] = [];
    const rowHeights: Record<number, number> = {};

    const hdrStyle = { bg: EXCEL_THEME.headerNavyBg, fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "334155" };
    const subHdrStyle = { bg: EXCEL_THEME.headerSubNavyBg, fg: EXCEL_THEME.white, bold: true, align: "center" as const, vAlign: "center" as const, borderColor: "334155" };

    if (isGroupTable) {
      // Baris header 2 tingkat persis seperti CorporateKPITable (CASCADING -> FC | PC | CC)
      const row0: StyledExcelCell[] = [
        ...baseCols.map((lbl) => ({ value: lbl, style: hdrStyle })),
        { value: "CASCADING (FC; PC; CC)", style: hdrStyle },
        { value: "", style: hdrStyle },
        { value: "", style: hdrStyle },
      ];
      const row1: StyledExcelCell[] = [
        ...baseCols.map(() => ({ value: "", style: hdrStyle })),
        { value: "FC", style: subHdrStyle },
        { value: "PC", style: subHdrStyle },
        { value: "CC", style: subHdrStyle },
      ];
      rowsOut.push(row0, row1);
      rowHeights[0] = 24;
      rowHeights[1] = 22;
      baseCols.forEach((_, ci) => merges.push({ sRow: 0, sCol: ci, eRow: 1, eCol: ci }));
      merges.push({ sRow: 0, sCol: baseCols.length, eRow: 0, eCol: baseCols.length + 2 });
    } else {
      rowsOut.push(baseCols.map((lbl) => ({ value: lbl, style: hdrStyle })));
      rowHeights[0] = 28;
    }

    const exportSource: KPISetting[] =
      items.length > 0
        ? items
        : [
            {
              id: "tpl-1",
              no: "1",
              section: "A",
              sectionLabel: isCorporate ? "Kinerja K3L Terintegrasi (SMK3/HSE)" : "Objective KPI",
              sectionBobot: isCorporate ? "15%" : "20%",
              perspektif: "Proses",
              kpi: "",
              satuan: "%/Bulan",
              formula: "Rata-Rata",
              scope: "",
              bobot: "20%",
              definisi: "",
              source: "",
              baseline2025: "",
              target2026: "",
              polaritas: "Maximize",
              detailFormula: "",
              keterangan: "",
              trackingPeriod: "Bulan",
            },
          ];

    const sections = Array.from(new Set(exportSource.map((k) => k.section || "A"))).sort();
    const roleFields: Array<[keyof KPISetting, string]> = [
      ["coo", "COO"],
      ["gmVgmIndustry", "GM Industry"],
      ["gmVgmPerkebunan", "GM Perkebunan"],
      ["gmAsd", "GM ASD"],
      ["gmRstm", "GM RSTM"],
      ["gmGhs", "GM GHS"],
    ];

    const collectRolesForType = (it: KPISetting, code: "FC" | "PC" | "CC"): string => {
      if (it.cascadingMap && Object.keys(it.cascadingMap).length > 0) {
        return Object.entries(it.cascadingMap)
          .filter(([, v]) => v === code)
          .map(([k]) => k)
          .join(", ");
      }
      return roleFields
        .filter(([k]) => it[k] === code)
        .map(([, lbl]) => lbl)
        .join(", ");
    };

    sections.forEach((sec, sIdx) => {
      const secRows = exportSource.filter((k) => (k.section || "A") === sec);
      const first = secRows[0];
      const staticMeta = CORP_SECTION_META[sec];
      const secName = !isCorporate
        ? resolvePersonalSectionLabel(first)
        : (first?.sectionLabel || staticMeta?.label || `Section ${sec}`);
      const secBobot = first?.sectionBobot || (isCorporate ? staticMeta?.bobot : (sec === "A" ? "20%" : sec === "B" ? "80%" : "")) || "";
      const bannerBg = (isCorporate && staticMeta?.bg ? staticMeta.bg.replace("#", "") : EXCEL_THEME.sectionPalette[sIdx % EXCEL_THEME.sectionPalette.length]);
      const bannerText = `${sec}. ${secName}${secBobot ? ` — Bobot ${secBobot}` : ""}`;

      const bannerRowIdx = rowsOut.length;
      const bannerRow: StyledExcelCell[] = Array.from({ length: totalColCount }, (_, ci) => ({
        value: ci === 0 ? bannerText : "",
        style: { bg: bannerBg, fg: EXCEL_THEME.white, bold: true, align: "left", vAlign: "center", borderColor: bannerBg },
      }));
      rowsOut.push(bannerRow);
      rowHeights[bannerRowIdx] = 24;
      merges.push({ sRow: bannerRowIdx, sCol: 0, eRow: bannerRowIdx, eCol: totalColCount - 1 });

      secRows.forEach((it, rIdx) => {
        const pTrack = derivePeriodeTrackingFromSatuan(it.satuan, it.trackingPeriod);
        const vals = isGroupTable
          ? [it.no, it.perspektif, it.kpi, it.satuan, it.formula, it.scope ?? "", it.bobot, it.definisi, it.source, it.baseline2025, it.target2026, it.polaritas, it.detailFormula, it.keterangan ?? "", pTrack]
          : [it.no, it.perspektif, it.kpi, it.satuan, it.formula, it.bobot, it.definisi, it.source, it.baseline2025, it.target2026, it.polaritas, it.detailFormula, it.keterangan ?? "", pTrack];

        const styledCells: StyledExcelCell[] = vals.map((v, ci) => ({
          value: v ?? "",
          style: inferSystemCellStyle(baseCols[ci], v ?? "", rIdx),
        }));

        if (isGroupTable) {
          const fcStr = collectRolesForType(it, "FC");
          const pcStr = collectRolesForType(it, "PC");
          const ccStr = collectRolesForType(it, "CC");
          const baseZebra = rIdx % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
          styledCells.push(
            { value: fcStr, style: fcStr ? { bg: EXCEL_THEME.cascading.FC.bg, fg: EXCEL_THEME.cascading.FC.fg, bold: true, align: "left" } : { bg: baseZebra, fg: EXCEL_THEME.textMuted } },
            { value: pcStr, style: pcStr ? { bg: EXCEL_THEME.cascading.PC.bg, fg: EXCEL_THEME.cascading.PC.fg, bold: true, align: "left" } : { bg: baseZebra, fg: EXCEL_THEME.textMuted } },
            { value: ccStr, style: ccStr ? { bg: EXCEL_THEME.cascading.CC.bg, fg: EXCEL_THEME.cascading.CC.fg, bold: true, align: "left" } : { bg: baseZebra, fg: EXCEL_THEME.textMuted } },
          );
        }
        const curRowIdx = rowsOut.length;
        rowsOut.push(styledCells);
        rowHeights[curRowIdx] = 28;
      });
    });

    const fname = isGroupTable
      ? "KPI_Group_2026.xlsx"
      : isUnitWorkspace
      ? `KPI_Unit_${effectiveOwner.company.replace(/[^A-Za-z0-9]+/g, "_")}_2026.xlsx`
      : `KPI_Personal_${effectiveOwner.employeeId}_2026.xlsx`;
    exportStyledXLSX(fname, {
      sheetName: isGroupTable ? "KPI (Group)" : isUnitWorkspace ? "KPI (Unit)" : "KPI (Personal)",
      colWidths,
      rowHeights,
      rows: rowsOut,
      merges,
    });
  };

  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const matrix = parseXLSXMatrix(buf);
      if (matrix.length === 0) return;

      const isGroupTable = Boolean(isCorporate && !isUnitWorkspace);
      // Cari baris header utama yang memuat "No" & "KPI"
      let hdrRowIdx = matrix.findIndex((r) => r.some((c) => /^no$/i.test(c.trim())) && r.some((c) => /^kpi$/i.test(c.trim())));
      if (hdrRowIdx < 0) hdrRowIdx = 0;
      const hdr0 = matrix[hdrRowIdx].map((h) => h.trim());
      const hdr1 = (matrix[hdrRowIdx + 1] ?? []).map((h) => h.trim());
      const hasTwoRowHeader = hdr1.some((h) => /^(fc|pc|cc)$/i.test(h)) && !hdr1[0];
      const mergedHeaders = hdr0.map((h, idx) => (hasTwoRowHeader && hdr1[idx] ? hdr1[idx] : h));
      const dataStartIdx = hdrRowIdx + (hasTwoRowHeader ? 2 : 1);

      const col = (pat: RegExp) => mergedHeaders.findIndex((h) => pat.test(h));
      const noI = col(/^no$/i);
      const sectionColI = col(/^section$/i);
      const perspektifI = col(/^perspektif$/i);
      const kpiI = col(/^kpi$/i);
      const satuanI = col(/^satuan$/i);
      const formulaI = col(/^formula/i);
      const scopeI = col(/^scope$/i);
      const bobotI = col(/^bobot$/i);
      const definisiI = col(/^definisi$/i);
      const sourceI = col(/^source$/i);
      const baseI = col(/^baseline/i);
      const targetI = col(/^target/i);
      const polarI = col(/^polaritas$/i);
      const detailI = col(/^detail/i);
      const ketI = col(/^keterangan$/i);
      const trackI = col(/^(periode tracking|tracking period)$/i);
      const fcI = col(/^fc$/i);
      const pcI = col(/^pc$/i);
      const ccI = col(/^cc$/i);

      const g = (r: string[], idx: number) => (idx >= 0 ? String(r[idx] ?? "").trim() : "");

      let curSec = "A";
      let curSecLabel = isCorporate ? "Kinerja K3L Terintegrasi (SMK3/HSE)" : "Objective KPI";
      let curSecBobot = isCorporate ? "15%" : "20%";
      const imported: KPISetting[] = [];

      for (let ri = dataStartIdx; ri < matrix.length; ri++) {
        const r = matrix[ri];
        const nonEmpty = r.filter((c) => String(c ?? "").trim() !== "");
        if (nonEmpty.length === 0) continue;

        // Deteksi baris Banner Section (mis. "A. Objective KPI — Bobot 20%" di sel pertama dan sel lainnya kosong)
        const firstCell = String(r[0] ?? "").trim();
        const otherCellsEmpty = r.slice(1).every((c) => String(c ?? "").trim() === "");
        const bannerMatch = firstCell.match(/^([A-Z])\.\s*(.+?)(?:\s*[—\-]\s*Bobot\s*(\d+%?))?$/i);
        if (otherCellsEmpty && bannerMatch) {
          curSec = bannerMatch[1].toUpperCase();
          curSecLabel = bannerMatch[2].trim();
          curSecBobot = bannerMatch[3] ? (bannerMatch[3].endsWith("%") ? bannerMatch[3] : `${bannerMatch[3]}%`) : "";
          continue;
        }

        const kpiText = g(r, kpiI);
        const noText = g(r, noI);
        if (!kpiText && !noText) continue;
        // Abaikan baris template kosong tanpa nama KPI
        if (!kpiText) continue;

        let rowSec = curSec;
        if (sectionColI >= 0 && g(r, sectionColI)) {
          rowSec = g(r, sectionColI).toUpperCase().match(/[A-Z]/)?.[0] ?? curSec;
        }
        const satuanVal = g(r, satuanI);
        const trackVal = derivePeriodeTrackingFromSatuan(satuanVal, g(r, trackI) || "Bulan");
        const rawBobot = g(r, bobotI);
        const normalizedBobot = /^\d+(?:\.\d+)?$/.test(rawBobot) ? `${rawBobot}%` : rawBobot;

        const item: KPISetting = {
          id: `imp-${Date.now()}-${imported.length}`,
          no: noText || String(imported.length + 1),
          section: rowSec,
          sectionAlphabet: `${rowSec}.`,
          sectionLabel: sectionColI >= 0 ? undefined : curSecLabel,
          sectionBobot: sectionColI >= 0 ? undefined : curSecBobot,
          perspektif: g(r, perspektifI),
          kpi: kpiText,
          satuan: satuanVal,
          formula: g(r, formulaI),
          scope: isGroupTable ? g(r, scopeI) : "",
          bobot: normalizedBobot,
          definisi: g(r, definisiI),
          source: g(r, sourceI),
          baseline2025: g(r, baseI),
          target2026: g(r, targetI),
          polaritas: g(r, polarI) as Polaritas,
          detailFormula: g(r, detailI),
          keterangan: g(r, ketI),
          trackingPeriod: trackVal,
          monthlyTargets: {},
          colorIndicator: false,
          indicatorMode: "numeric",
          _uploadedCheck: true,
        };

        if (isGroupTable && (fcI >= 0 || pcI >= 0 || ccI >= 0)) {
          const cmap: Record<string, string> = {};
          const applyRoleList = (rawList: string, code: "FC" | "PC" | "CC") => {
            rawList.split(/[,;]/).map((x) => x.trim()).filter(Boolean).forEach((roleName) => {
              cmap[roleName] = code;
              const rl = roleName.toLowerCase();
              if (rl === "coo") item.coo = code;
              else if (rl.includes("industry")) item.gmVgmIndustry = code;
              else if (rl.includes("perkebunan")) item.gmVgmPerkebunan = code;
              else if (rl.includes("asd")) item.gmAsd = code;
              else if (rl.includes("rstm")) item.gmRstm = code;
              else if (rl.includes("ghs")) item.gmGhs = code;
            });
          };
          applyRoleList(g(r, fcI), "FC");
          applyRoleList(g(r, pcI), "PC");
          applyRoleList(g(r, ccI), "CC");
          if (Object.keys(cmap).length > 0) item.cascadingMap = cmap;
        }

        imported.push(item);
      }

      if (imported.length > 0) {
        setItems(imported);
        const invalidRows = imported.filter((it) => validateKpiRowStandard(it, masterForSection).length > 0);
        if (invalidRows.length > 0) {
          toast.warning(
            `${imported.length} baris KPI di-upload, namun ${invalidRows.length} baris memiliki format penulisan yang belum sesuai standar sistem (ditandai merah lembut). Silakan perbaiki baris tersebut agar tanda merah otomatis hilang.`,
            { duration: 7000 },
          );
        } else {
          toast.success(`${imported.length} baris KPI berhasil di-upload dan seluruh format telah sesuai standar sistem.`);
        }
      } else {
        toast.error("Tidak ada baris KPI berisi data pada file Excel yang dipilih.");
      }
    } catch {
      toast.error("Gagal membaca file Excel. Pastikan menggunakan format template yang sesuai.");
    }
  };

  return (
    <div
      className={
        isTableFullscreen
          ? `fixed top-16 bottom-[41px] left-0 md:left-20 right-0 z-40 bg-white overflow-y-auto p-4 md:p-6 flex flex-col gap-4 shadow-2xl border-t border-gray-200 ${getKpiTableScaleClasses(tableScale)}`
          : `flex flex-col gap-5 ${getKpiTableScaleClasses(tableScale)}`
      }
    >
      {delegationAccess && (
        <DelegatedWorkspaceBanner
          delegator={effectiveOwner}
          actorName={actorName || actorUser.name}
          access={delegationAccess}
          moduleLabel={workspaceLabel || "KPI Setting"}
        />
      )}

      {/* Up-to-date Approval Status Bar (Submitted -> HR Unit Check -> Approver 1 -> Approver 2 -> HR ICF Validate) */}
      {!isCorporate && (
        <ModuleApprovalStatusBar
          module="KPI"
          phase="setting"
          submittedOverride={submitted}
          employeeId={effectiveOwner.employeeId}
        />
      )}

      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A284F]/5 rounded-lg">
            <span className="text-xs font-bold text-[#1A284F]">Total KPI:</span>
            <span className="text-sm font-bold text-[#1A284F]">{items.length}</span>
          </div>
          {isCorporate ? (
            <>
              {Array.from(new Set(items.map((i) => i.section))).sort().map((sec, si) => {
                const staticMeta = CORP_SECTION_META[sec];
                const secRows = items.filter((i) => i.section === sec);
                const secLbl = secRows[0]?.sectionLabel || staticMeta?.label || `Section ${sec}`;
                const secBbt = `${formatPctNum(resolveEffectiveSectionBobotNum(items, sec, true, editedSectionBobots))}%`;
                const bg = staticMeta?.bg ?? CUSTOM_SECTION_BG_PALETTE[si % CUSTOM_SECTION_BG_PALETTE.length];
                return (
                  <div key={sec} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ background: bg }}>{sec}</span>
                    <span className="text-[11px] font-semibold text-gray-600">{secLbl}</span>
                    <span className="text-[11px] text-gray-400">·</span>
                    <span className="text-[11px] font-bold text-[#1A284F]">{secRows.length} KPI</span>
                    <span className="text-[10px] text-gray-400">({secBbt})</span>
                  </div>
                );
              })}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isBobotExact100 ? "bg-green-50" : "bg-orange-50"}`}>
                <span className={`text-xs font-bold ${isBobotExact100 ? "text-green-700" : "text-orange-700"}`}>Total Bobot:</span>
                <span className={`text-sm font-bold ${isBobotExact100 ? "text-green-700" : "text-orange-700"}`}>{formatPctNum(totalBobot)}%</span>
                {!isBobotExact100 && (
                  <span className="text-[10px] text-orange-600">
                    {Math.round(totalSectionBobot * 100) !== 10000
                      ? `(Section: ${formatPctNum(totalSectionBobot)}% · should be 100%)`
                      : "(should be 100%)"}
                  </span>
                )}
              </div>
              {!submitted && !kpiApproved && items.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  Draft Tersimpan
                </span>
              )}
            </>
          ) : (
            <>
              {Array.from(new Set(items.map((i) => i.section))).sort().map((sec, si) => {
                const colors = ["blue","indigo","violet","sky","teal","cyan"];
                const c = colors[si % colors.length];
                return (
                  <div key={sec} className={`flex items-center gap-2 px-3 py-1.5 bg-${c}-50 rounded-lg`}>
                    <span className={`text-xs font-bold text-${c}-700`}>Section {sec}:</span>
                    <span className={`text-sm font-bold text-${c}-700`}>{items.filter((i) => i.section === sec).length}</span>
                  </div>
                );
              })}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isBobotExact100 ? "bg-green-50" : "bg-orange-50"}`}>
                <span className={`text-xs font-bold ${isBobotExact100 ? "text-green-700" : "text-orange-700"}`}>Total Bobot:</span>
                <span className={`text-sm font-bold ${isBobotExact100 ? "text-green-700" : "text-orange-700"}`}>{formatPctNum(totalBobot)}%</span>
                {!isBobotExact100 && (
                  <span className="text-[10px] text-orange-600">
                    {Math.round(totalSectionBobot * 100) !== 10000
                      ? `(Section: ${formatPctNum(totalSectionBobot)}% · should be 100%)`
                      : "(should be 100%)"}
                  </span>
                )}
              </div>
              {!submitted && !kpiApproved && items.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                  Draft Tersimpan
                </span>
              )}
              {copySource && (
                <button
                  type="button"
                  onClick={() => { setCopySourceItems(copySource.load()); setShowCopyModal(true); }}
                  title={`Lihat tabel ${copySource.label} & copy baris KPI ke tabel ini`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" /> {copySource.label}
                </button>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Non-corporate pre-submit flow */}
          {!isCorporate && view === "input" && !submitted && !isViewOnly && (
            <>
              {canCreate && (
                <button onClick={() => !isPersonal || divisionApproved ? setShowAddModal(true) : undefined}
                  disabled={isPersonal && !divisionApproved}
                  title={isPersonal && !divisionApproved ? "KPI Division harus disetujui terlebih dahulu" : ""}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus className="w-4 h-4" /> Add KPI
                </button>
              )}
              <button onClick={() => setView("preview")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Eye className="w-4 h-4" /> Preview
              </button>
              {canSubmit && (
                <SubmitKpiGateButton
                  canSubmit={submitStatus.canSubmit}
                  reasons={submitStatus.reasons}
                  onConfirmSubmit={() => setShowConfirm(true)}
                />
              )}
            </>
          )}
          {!isCorporate && view === "preview" && !submitted && !isViewOnly && (
            <>
              <button onClick={() => setView("input")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Edit3 className="w-4 h-4" /> Back
              </button>
              {canSubmit && (
                <SubmitKpiGateButton
                  canSubmit={submitStatus.canSubmit}
                  reasons={submitStatus.reasons}
                  onConfirmSubmit={() => setShowConfirm(true)}
                />
              )}
            </>
          )}
          {/* General Edit Request (submitted, not yet approved) */}
          {!isCorporate && submitted && !kpiApproved && !pendingEditRequest && canEdit && (
            <button onClick={() => setShowEditRequest(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              <FileEdit className="w-4 h-4" /> Edit Request
            </button>
          )}
          {!isCorporate && submitted && !kpiApproved && pendingEditRequest && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Edit Approval
              </span>
              <button onClick={() => setPendingEditRequest(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                <X className="w-4 h-4" /> Cancel Request
              </button>
            </div>
          )}

          {/* Approved / Validated state — all tabs */}
          {isCorporate && kpiApproved && !pendingTargetEditRequest && !monthlyTargetPending && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-50 border border-green-300 text-green-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> {useValidateTerms ? "Validated" : "Approved"}
            </span>
          )}
          {/* Edit [Target] Request — hidden in validate mode (Business / Pak Anton) when approved */}
          {kpiApproved && !pendingTargetEditRequest && !targetEditApproved && !monthlyTargetPending && !isCorporate && !useValidateTerms && (
            <button onClick={() => setShowTargetEditRequest(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              <FileEdit className="w-4 h-4" /> Edit [Target] Request
            </button>
          )}
          {/* First pending — after EditTargetSuccessModal */}
          {kpiApproved && pendingTargetEditRequest && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Approval
              </span>
              <button onClick={() => { cancelTargetEditPhase1(effectiveOwner.employeeId); setPendingTargetEditRequest(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            </div>
          )}
          {/* Edit Monthly Target — after first Simulate Approve */}
          {kpiApproved && targetEditApproved && (
            <button onClick={() => setShowMonthlyTargetEdit(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              <Edit3 className="w-4 h-4" /> Edit Monthly Target
            </button>
          )}
          {/* Second pending — after MonthlyTargetEditModal submit */}
          {kpiApproved && monthlyTargetPending && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 border border-amber-300 text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Approval
              </span>
            </div>
          )}

          {!isCorporate && <ExportImportButton onExport={handleExport} onImport={canCreate || canEdit ? handleImport : undefined} />}
        </div>
      </div>

      {/* Division prerequisite info banner */}
      {isPersonal && !divisionApproved && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <svg className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold">KPI Pak Pras (Demo) belum disetujui</p>
            <p className="text-amber-700 text-xs mt-0.5">Anda tidak dapat menambahkan KPI Personal sebelum KPI Pak Pras (Demo) disubmit dan disetujui oleh approver. Silakan lengkapi dan submit KPI Pak Pras (Demo) terlebih dahulu.</p>
          </div>
        </div>
      )}

      {/* Status banner for personal tab */}
      {isPersonal && view === "preview" && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
          submitted ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          {submitted ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
          {submitted ? "KPI Setting has been submitted and is pending approval." : "Preview mode — review all KPI definitions carefully before submitting."}
        </div>
      )}

      {(() => {
        const invalidUploaded = items.filter((it) => validateKpiRowStandard(it, masterForSection).length > 0);
        if (invalidUploaded.length === 0) return null;
        return (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-800 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-rose-900">
                Terdapat {invalidUploaded.length} baris KPI hasil upload dengan format penulisan belum sesuai standar sistem
              </p>
              <p className="text-rose-700 mt-0.5 leading-relaxed">
                Baris yang bermasalah diberi <strong>tanda merah lembut</strong> pada tabel beserta keterangan kolomnya (No: {invalidUploaded.map((r) => r.no).join(", ")}). Klik <strong>Edit</strong> per baris atau <strong>Global Edit</strong> untuk menyesuaikannya — tanda merah akan otomatis hilang begitu format sesuai.
              </p>
            </div>
          </div>
        );
      })()}

      {isCorporate ? (
        <CorporateKPITable
          items={items}
          hideScope={isCorporate && (workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") || effectiveScopeKey.startsWith("corporate-unit"))}
          onUpdateItem={canEdit ? (id, updates) => setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i)) : undefined}
          onBatchUpdateItems={canEdit ? (next) => setItems(next) : undefined}
          onDeleteItem={canDelete ? (id) => setItems((prev) => prev.filter((i) => i.id !== id)) : undefined}
          onAddClick={canCreate ? () => setShowAddModal(true) : undefined}
          onSubmit={canSubmit ? () => setShowConfirm(true) : undefined}
          canSubmitKpi={submitStatus.canSubmit}
          submitBlockReasons={submitStatus.reasons}
          onExport={handleExport}
          onImport={canCreate || canEdit ? handleImport : undefined}
          submitted={submitted || isViewOnly}
          hideCascading={hideCascading}
          kpiApproved={kpiApproved}
          targetEditApproved={targetEditApproved}
          onEditTargetRequest={useValidateTerms || !canEdit ? undefined : () => setShowTargetEditRequest(true)}
          sectionCascadeMap={sectionCascadeMap}
          onSectionCascadeChange={canEdit ? onSectionCascadeChange : undefined}
          parentSectionCascadeMap={parentSectionCascadeMap}
          editedSectionBobots={editedSectionBobots}
          onSectionBobotChange={canEdit ? onSectionBobotChange : undefined}
          onRenameSection={canEdit && !isViewOnly ? handleRenameSection : undefined}
          onUpdateSectionMeta={canEdit && !isViewOnly ? handleUpdateSectionMeta : undefined}
          displayControls={
            <KpiTableDisplayControls
              isFullscreen={isTableFullscreen}
              onToggleFullscreen={toggleTableFullscreen}
              tableScale={tableScale}
              onCycleScale={cycleTableScale}
            />
          }
          toolbarExtra={copySource ? (
            <button
              type="button"
              onClick={() => { setCopySourceItems(copySource.load()); setShowCopyModal(true); }}
              title={`Lihat tabel ${copySource.label} & copy baris KPI ke tabel ini`}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full hover:bg-violet-100 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" /> {copySource.label}
            </button>
          ) : undefined}
        />
      ) : (
        <KPISettingTable
          items={items}
          editable={view === "input" && !submitted && !isViewOnly && (canEdit || canDelete)}
          onDelete={canDelete ? (id) => setItems((prev) => prev.filter((i) => i.id !== id)) : undefined}
          onUpdateItem={canEdit ? (id, updates) => setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i)) : undefined}
          onBatchUpdateItems={canEdit ? (next) => setItems(next) : undefined}
          hideCascading={hideCascading}
          onRenameSection={canEdit && !isViewOnly ? handleRenameSection : undefined}
          onUpdateSectionMeta={canEdit && !isViewOnly ? handleUpdateSectionMeta : undefined}
          displayControls={
            <KpiTableDisplayControls
              isFullscreen={isTableFullscreen}
              onToggleFullscreen={toggleTableFullscreen}
              tableScale={tableScale}
              onCycleScale={cycleTableScale}
            />
          }
        />
      )}

      {/* Lampiran KPI */}
      <div className="rounded-xl border border-sky-200/80 bg-sky-50/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-sky-700" />
            <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">
              Lampiran KPI
            </span>
            {kpiAttachments.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                {kpiAttachments.length} file terlampir
              </span>
            )}
          </div>
          {!submitted && !kpiApproved && !isViewOnly && (canCreate || canEdit) && (
            <>
              <input
                ref={kpiAttachInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,image/*"
                className="hidden"
                onChange={(e) => {
                  void handleUploadKpiAttachments(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={uploadingAttachment}
                onClick={() => kpiAttachInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {uploadingAttachment ? "Mengunggah..." : "Lampiran KPI"}
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-sky-800/90 leading-relaxed">
          Silahkan tambahkan file lampiran KPI yang anda buat diluar sistem ini (jika ada) atau file pendukung KPI lainnya. Lampiran ini sebagai referensi Atasan untuk tindak lanjut persetujuan atau revisi.
        </p>
        {kpiAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {kpiAttachments.map((att) => {
              const isPreviewable =
                Boolean(att.mimeType?.startsWith("image/") || att.mimeType === "application/pdf") ||
                /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name || "");
              return (
              <div
                key={att.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-sky-200 text-xs text-gray-700 shadow-2xs"
              >
                <Paperclip className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span className="font-medium text-[#1A284F] truncate max-w-[220px]" title={att.name}>{att.name}</span>
                {att.url && isPreviewable && (
                  <button
                    type="button"
                    onClick={() => setPreviewKpiAtt(att)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 text-[10px] font-semibold"
                    title="Lihat langsung"
                  >
                    <Eye className="w-3 h-3" /> Lihat
                  </button>
                )}
                {att.url && (
                  <a
                    href={att.url}
                    download={att.name}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1A284F]/10 text-[#1A284F] hover:bg-[#1A284F]/20 text-[10px] font-semibold"
                    title="Download lampiran"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                )}
                {!submitted && !kpiApproved && !isViewOnly && canDelete && (
                  <button
                    type="button"
                    onClick={() => handleRemoveKpiAttachment(att.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Hapus lampiran"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
        {previewKpiAtt && (
          <EvidenceViewerModal
            name={previewKpiAtt.name}
            url={previewKpiAtt.url}
            mimeType={previewKpiAtt.mimeType}
            subtitle="Lampiran KPI Setting"
            onClose={() => setPreviewKpiAtt(null)}
          />
        )}
      </div>
      {showCopyModal && copySource && (
        <CopyKpiFromSourceModal
          sourceLabel={copySource.label}
          targetLabel={isCorporate ? (workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") ? "KPI (Unit)" : "KPI Business") : "KPI (Personal)"}
          sourceItems={copySourceItems}
          copiedSourceIds={new Set(items.map((i) => i.copiedFromId).filter((v): v is string => Boolean(v)))}
          resolveSectionLabel={(i) => resolveKpiSectionLabel(i)}
          canCopy={canCreate && !submitted && !kpiApproved && !isViewOnly}
          onCopy={(rows) => {
            setItems((prev) => [...prev, ...mapCopiedKpiRows(rows, prev, !isCorporate)]);
            toast.success(`${rows.length} KPI dari ${copySource.label} berhasil di-copy. Setiap baris dapat diedit atau dihapus.`);
          }}
          onClose={() => setShowCopyModal(false)}
        />
      )}
      {!isCorporate && (
        <ApproverNotesHistory
          employeeId={effectiveOwner.employeeId}
          module="KPI"
          phase="setting"
          title="Catatan dari Approver"
        />
      )}

      {showAddModal && isCorporate && (
        <AddCorporateKPIModal
          existingItems={items}
          sectionLabel={workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") || effectiveScopeKey.startsWith("corporate-unit") ? "KPI (Unit)" : "Business"}
          hideScope={workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") || effectiveScopeKey.startsWith("corporate-unit")}
          hideCascading={Boolean(hideCascading) || workspaceLabel?.includes("Unit") || effectiveScopeKey.startsWith("unit") || effectiveScopeKey.startsWith("corporate-unit")}
          onAdd={(item) => setItems((p) => [...p, item])}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {showAddModal && !isCorporate && (
        <AddKPIModal
          existingItems={items}
          ownerUser={effectiveOwner}
          onAdd={(item) => setItems((p) => [...p, item])}
          onClose={() => setShowAddModal(false)}
          hideCascading={
            Boolean(hideCascading) ||
            ["Ka./Wa.Ka.Dept", "Ka./Wa.Ka.Bagian", "Ka./Wa.Ka.Seksi", "Operasional"].includes(
              String(resolveEffectiveUserGrouping(effectiveOwner) ?? "").trim(),
            )
          }
          onSectionCascade={onSectionCascadeChange}
        />
      )}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} validateMode={useValidateTerms} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} validateMode={useValidateTerms} />}
      {draftBlocker.state === "blocked" && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 text-center border border-sky-100">
            <div className="w-14 h-14 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-sky-600" />
            </div>
            <h3 className="font-bold text-[#1A284F] text-lg mb-2">Tersimpan Otomatis sebagai Draft</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-6">
              Data KPI Setting yang telah Anda buat (<strong>{items.length} KPI</strong> · Total Bobot{" "}
              <strong>{formatPctNum(totalBobot)}%</strong>) belum di-submit dan telah{" "}
              <strong className="text-sky-700">otomatis disimpan sebagai Draft</strong>. Anda dapat melanjutkan
              pengisian kembali kapan saja saat membuka halaman ini.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => draftBlocker.reset?.()}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Tetap di Halaman Ini
              </button>
              <button
                type="button"
                onClick={() => draftBlocker.proceed?.()}
                className="px-5 py-2.5 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
              >
                OK, Tinggalkan Halaman
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditRequest && (
        <EditRequestModal owner={effectiveOwner}
          onCancel={() => setShowEditRequest(false)}
          onConfirm={() => { setShowEditRequest(false); setShowEditRequestSuccess(true); }}
        />
      )}
      {showEditRequestSuccess && (
        <EditRequestSuccessModal owner={effectiveOwner} onClose={() => { setShowEditRequestSuccess(false); setPendingEditRequest(true); }} />
      )}
      {showTargetEditRequest && (
        <EditTargetRequestModal owner={effectiveOwner}
          items={items}
          onCancel={() => setShowTargetEditRequest(false)}
          onConfirm={async (cat, reason, files, kpis) => {
            const phase1Attachments: TargetEditAttachment[] = [];
            for (const f of files) {
              let url = "";
              try {
                const up = await uploadEvidenceFileToSupabase(f, {
                  employeeId: effectiveOwner.employeeId,
                  employeeName: effectiveOwner.name,
                  companyUnit: effectiveOwner.company,
                  division: effectiveOwner.division || "-",
                  department: effectiveOwner.department || "-",
                  position: effectiveOwner.position || "-",
                  moduleType: "KPI Edit Target Request (Fase 1)",
                  period: "2026",
                  month: "All",
                });
                url = up?.url || "";
              } catch {
                url = "";
              }
              phase1Attachments.push({ name: f.name, size: f.size, type: f.type || "application/octet-stream", url });
            }
            submitTargetEditPhase1({
              owner: effectiveOwner,
              category: cat,
              reason,
              selectedKpiIds: kpis,
              files: phase1Attachments,
            });
            setTargetEditCategory(cat);
            setTargetEditReason(reason);
            setSelectedTargetKpis(kpis);
            setShowTargetEditRequest(false);
            setShowTargetEditSuccess(true);
          }}
        />
      )}
      {showTargetEditSuccess && (
        <EditTargetSuccessModal onClose={() => { setShowTargetEditSuccess(false); setPendingTargetEditRequest(true); }} />
      )}
      {showMonthlyTargetEdit && (
        <MonthlyTargetEditModal
          items={items}
          selectedKpiIds={selectedTargetKpis}
          phase1Category={targetEditCategory}
          phase1Reason={targetEditReason}
          ownerUser={effectiveOwner}
          onClose={() => setShowMonthlyTargetEdit(false)}
          onSubmitted={() => {
            setShowMonthlyTargetEdit(false);
            setTargetEditApproved(false);
            setMonthlyTargetPending(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TAB_DEFS: { id: KPITab; label: string }[] = [
  { id: "personal",  label: "KPI (Personal)"          },
];

function TabStatusBadge({ ts, useValidate = false }: { ts: TabStatus; useValidate?: boolean }) {
  if (ts === "idle") return null;
  if (ts === "pending") return (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      Pending
    </span>
  );
  if (ts === "pending-target") return (
    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
      <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
      Pending {useValidate ? "Validation" : "Approval"}
    </span>
  );
  return (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
      {useValidate ? "Validated" : "Approved"}
    </span>
  );
}

function StandardKPISettingContent({ personalOnly: personalOnlyProp = false }: { personalOnly?: boolean } = {}) {
  const activeUser = getActiveUser();
  const isDirectorMode = !personalOnlyProp && isDirectorRoleOrGrouping(activeUser);
  const isGmMode = !personalOnlyProp && !isDirectorMode && activeUser.role === "GM";
  const personalOnly = personalOnlyProp || (!isDirectorMode && !isGmMode);
  const defaultFirstTab: KPITab = personalOnly
    ? "personal"
    : isGmMode
    ? "corporate-unit"
    : "corporate";
  const [routeKpiTab, setActiveTab]         = useRouteTab<KPITab>(["corporate", "pak-anton", "corporate-unit", "division", "department", "personal"], defaultFirstTab);
  const activeTab: KPITab                   = personalOnly ? "personal" : routeKpiTab;
  const [personalTabStatus, setPersonalTabStatus]   = useState<TabStatus>("idle");
  const [divisionTabStatus, setDivisionTabStatus]   = useState<TabStatus>("approved");
  const [corporateTabStatus, setCorporateTabStatus] = useState<TabStatus>("idle");
  const [pakAntonTabStatus, setPakAntonTabStatus]   = useState<TabStatus>("idle");
  const [pakAmirTabStatus, setPakAmirTabStatus]     = useState<TabStatus>("idle");
  const copySources = buildKpiCopySources(activeUser);
  const masterFormats = loadMasterKpiFormats<KPISetting>({
    group: CORPORATE_KPI,
    unit: CORPORATE_KPI,
    personal: PERSONAL_KPI,
  });
  const [businessItems, setBusinessItems]           = useState<KPISetting[]>(() => masterFormats.group);
  useEffect(() => {
    const onFmt = () => {
      const latest = loadMasterKpiFormats<KPISetting>({
        group: CORPORATE_KPI,
        unit: CORPORATE_KPI,
        personal: PERSONAL_KPI,
      });
      setBusinessItems(latest.group);
    };
    window.addEventListener(MASTER_KPI_FORMATS_UPDATED_EVENT, onFmt);
    window.addEventListener("pa-db-hydrated", onFmt);
    return () => {
      window.removeEventListener(MASTER_KPI_FORMATS_UPDATED_EVENT, onFmt);
      window.removeEventListener("pa-db-hydrated", onFmt);
    };
  }, []);
  // Pak Anton's live items (after edits/deletions) – used to cascade to Pak Made
  const [pakAntonCurrentItems, setPakAntonCurrentItems] = useState<KPISetting[]>([]);
  // Section-level cascade assignments: section letter → "FC"|"PC"|"CC"|""
  const [sectionCascadeMap, setSectionCascadeMap]   = useState<Record<string, string>>({});
  // Pak Anton editable section bobots (when PC/CC): section letter → bobot string
  const [pakAntonSectionBobots, setPakAntonSectionBobots] = useState<Record<string, string>>({});

  // ── Cascade helper: determine FC/PC/CC type for a business KPI item ──────────
  const SUPERVISOR_ROLE_KEY = "coo"; // COO = Pak Anton (Demo)
  const getCascadeType = (item: KPISetting): "FC" | "PC" | "CC" | null => {
    if (item.cascadingMap) {
      // new modal items: cascadingMap = { roleName: "FC"|"PC"|"CC" }
      const val = item.cascadingMap[SUPERVISOR_ROLE_KEY] ?? item.cascadingMap["COO"] ?? item.cascadingMap["coo"];
      return (val as "FC" | "PC" | "CC") || null;
    }
    // legacy typed items: coo field (COO = Pak Anton)
    const v = (item as unknown as Record<string, unknown>)[SUPERVISOR_ROLE_KEY] as string | undefined;
    return (v as "FC" | "PC" | "CC") || null;
  };

  const tabStatusMap: Record<KPITab, TabStatus> = {
    personal:    personalTabStatus,
    department:  "idle",
    division:    divisionTabStatus,
    corporate:   corporateTabStatus,
    "pak-anton": pakAntonTabStatus,
    "corporate-unit": pakAmirTabStatus,
  };

  // ── Locking logic ────────────────────────────────────────────────────────────
  // corporate (Business) must be Validated to unlock everything else
  const corpValidated   = corporateTabStatus === "approved";
  // pak-anton must be Validated to unlock pak-amir, division, personal
  const pakAntonValidated = pakAntonTabStatus === "approved";
  // pak-amir must be Approved to unlock division, personal
  const pakAmirApproved  = pakAmirTabStatus === "approved";
  // division must be Approved to unlock personal
  const divisionApproved = divisionTabStatus === "approved";

  // ── Cascade helpers ───────────────────────────────────────────────────────────
  const CASCADE_VALUES = ["FC", "PC", "CC"];

  const clearCascadingCols = (item: KPISetting): Partial<KPISetting> => ({
    coo: "", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "",
    cascadingMap: undefined,
  });

  // ── Pak Anton initial items (COO = Pak Anton) ─────────────────────────────────
  // Section-level cascade defaults to "FC" when not explicitly set.
  // Priority: 1) Section-level cascade (sectionCascadeMap, default FC)  2) COO column FC/PC/CC
  const RSUP_SCOPES = ["RSUP Group", "RSUP Industry"];
  const getEffectiveSectionCascade = (section: string): string =>
    sectionCascadeMap[section] ?? "FC";
  const pakAntonInitialItems: KPISetting[] = (() => {
    if (!corpValidated) return [];
    return businessItems
      .filter(item => {
        const secCascade = sectionCascadeMap[item.section];
        // Section explicitly set to "" (No Cascade) → exclude all items in this section
        if (secCascade === "") return false;
        const itemCascade = getCascadeType(item);
        // Item cascade is empty / "—" → do NOT copy to level below
        if (!itemCascade || !CASCADE_VALUES.includes(itemCascade)) return false;
        return true;
      })
      .map(item => {
        const secCascade = getEffectiveSectionCascade(item.section);
        const itemCascade = getCascadeType(item);
        const effectiveCascade = (CASCADE_VALUES.includes(itemCascade ?? "") ? itemCascade : secCascade) as "FC" | "PC" | "CC";
        return {
          ...item,
          _cascadeType: effectiveCascade,
          ...clearCascadingCols(item),
        };
      });
  })();

  // ── Pak Made initial items (GM Industry = Pak Made) ──────────────────────────
  // Cascades from Pak Anton's validated items using the gmVgmIndustry column.
  // Items Pak Anton deleted are excluded via pakAntonCurrentItems ID tracking.
  const PAK_MADE_ROLE_KEY = "gmVgmIndustry";
  const getPakMadeCascadeType = (item: KPISetting): "FC" | "PC" | "CC" | null => {
    if (item.cascadingMap) {
      const val = item.cascadingMap[PAK_MADE_ROLE_KEY]
        ?? item.cascadingMap["GM Industry"]
        ?? item.cascadingMap["gmVgmIndustry"];
      return (val as "FC" | "PC" | "CC") || null;
    }
    const v = (item as unknown as Record<string, unknown>)[PAK_MADE_ROLE_KEY] as string | undefined;
    return (v as "FC" | "PC" | "CC") || null;
  };

  const pakAmirInitialItems: KPISetting[] = (() => {
    if (!pakAntonValidated) return [];
    // Build set of IDs still present in Pak Anton's table (respects deletions)
    const pakAntonIds = pakAntonCurrentItems.length > 0
      ? new Set(pakAntonCurrentItems.map((i) => i.id))
      : null; // null = not yet tracked, allow all
    return businessItems
      .filter((item) => {
        // Exclude if Pak Anton deleted it
        if (pakAntonIds && !pakAntonIds.has(item.id)) return false;
        const ct = getPakMadeCascadeType(item);
        return ct === "FC" || ct === "PC" || ct === "CC";
      })
      .map((item) => ({
        ...item,
        _cascadeType: getPakMadeCascadeType(item) as "FC" | "PC" | "CC",
        ...clearCascadingCols(item),
      }));
  })();

  const tabLocked: Record<KPITab, boolean> = {
    corporate:   false,
    "pak-anton": !corpValidated,
    "corporate-unit": isGmMode ? false : (!corpValidated || !pakAntonValidated),
    division:    !corpValidated || !pakAntonValidated || !pakAmirApproved,
    personal:    isDirectorMode || isGmMode ? false : (!corpValidated || !pakAntonValidated || !pakAmirApproved || !divisionApproved),
    department:  false,
  };

  // validate-mode tabs (Business + Pak Anton) use "Validated" terminology
  const useValidateMap: Record<KPITab, boolean> = {
    corporate: !isDirectorMode, "pak-anton": true,
    "corporate-unit": false, division: false, personal: false, department: false,
  };

  const handleTabClick = (id: KPITab) => {
    if (!tabLocked[id]) setActiveTab(id);
  };

  // A locked tab opened directly by URL falls back to the first (always open) tab.
  const activeTabLocked = tabLocked[activeTab];
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.endsWith("/setting/kpi/pak-amir")) {
      setActiveTab("corporate-unit");
      return;
    }
    if (!personalOnly && activeTabLocked) setActiveTab(isGmMode ? "corporate-unit" : "corporate");
    if (isGmMode && activeTab !== "corporate-unit" && activeTab !== "personal") setActiveTab("corporate-unit");
    if (isDirectorMode && activeTab !== "corporate" && activeTab !== "personal") setActiveTab("corporate");
  }, [personalOnly, activeTabLocked, activeTab, isGmMode, isDirectorMode, setActiveTab]);

  const visibleTabDefs: { id: KPITab; label: string }[] = isDirectorMode
    ? [
        { id: "corporate", label: "KPI (Group)" },
        { id: "personal",  label: "KPI (Personal)" },
      ]
    : isGmMode
    ? [
        { id: "corporate-unit", label: "KPI (Unit)" },
        { id: "personal", label: "KPI (Personal)" },
      ]
    : TAB_DEFS;

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Setting</h1>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — KPI Configuration</p>
        </div>
      </div>

      {/* Tab bar */}
      {!personalOnly && <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {visibleTabDefs.map((tab) => {
          const locked = tabLocked[tab.id];
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              disabled={locked}
              title={locked ? "Tab ini terkunci. Selesaikan dan validasi/setujui tab sebelumnya terlebih dahulu." : undefined}
              className={`flex items-center px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                active
                  ? "border-[#1A284F] text-[#1A284F]"
                  : locked
                  ? "border-transparent text-gray-300 cursor-not-allowed"
                  : "border-transparent text-gray-500 hover:text-gray-700 cursor-pointer"
              }`}
            >
              {locked && (
                <svg className="w-3 h-3 mr-1.5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              )}
              {tab.label}
              <TabStatusBadge ts={tabStatusMap[tab.id]} useValidate={useValidateMap[tab.id]} />
            </button>
          );
        })}
      </div>}

      {/* Content */}
      {activeTab === "corporate" && (
        <KPISection
          key="corporate"
          initialItems={masterFormats.group}
          isPersonal={false}
          isCorporate={true}
          useValidateTerms={!isDirectorMode}
          onTabStatusChange={setCorporateTabStatus}
          onItemsChange={setBusinessItems}
          sectionCascadeMap={sectionCascadeMap}
          onSectionCascadeChange={(sec, val) => setSectionCascadeMap((prev) => ({ ...prev, [sec]: val }))}
        />
      )}
      {activeTab === "pak-anton" && (
        <KPISection
          key={`pak-anton-${corpValidated ? "validated" : "pending"}-${businessItems.map(i => `${i.id}:${(i as unknown as Record<string,unknown>)["coo"] ?? ""}:${JSON.stringify(i.cascadingMap ?? {})}`).join("|")}-${JSON.stringify(sectionCascadeMap)}`}
          initialItems={pakAntonInitialItems}
          isPersonal={false}
          isCorporate={true}
          useValidateTerms={true}
          onTabStatusChange={setPakAntonTabStatus}
          onItemsChange={setPakAntonCurrentItems}
          parentSectionCascadeMap={Object.fromEntries(
            Array.from(new Set(businessItems.map(i => i.section))).map(s => [s, sectionCascadeMap[s] ?? "FC"])
          )}
          editedSectionBobots={pakAntonSectionBobots}
          onSectionBobotChange={(sec, val) => setPakAntonSectionBobots((prev) => ({ ...prev, [sec]: val }))}
        />
      )}
      {activeTab === "corporate-unit" && (
        <KPISection
          key={`corporate-unit-${isGmMode ? "gm" : pakAntonValidated ? "validated" : "pending"}-${pakAmirInitialItems.map(i => i.id).join("|")}`}
          initialItems={[]}
          isPersonal={false}
          isCorporate={true}
          hideCascading={true}
          useValidateTerms={false}
          businessScopeKey={isGmMode ? `unit-${activeUser.company}` : "corporate-unit-RSUP"}
          onTabStatusChange={setPakAmirTabStatus}
          copySource={copySources.group}
          workspaceLabel="KPI (Unit)"
        />
      )}
      {activeTab === "division" && (
        <KPISection
          key="division"
          initialItems={[]}
          isPersonal={false}
          isCorporate={true}
          useValidateTerms={false}
          onTabStatusChange={setDivisionTabStatus}
        />
      )}
      {activeTab === "personal" && (
        <KPISection
          key={`personal-${activeUser.employeeId}`}
          initialItems={[]}
          isPersonal={true}
          isCorporate={false}
          divisionApproved={personalOnly || isDirectorMode || isGmMode ? true : divisionApproved}
          useValidateTerms={false}
          hideCascading={personalOnly || isDirectorMode || isGmMode}
          onTabStatusChange={setPersonalTabStatus}
          copySource={isDirectorMode ? copySources.group : isGmMode ? copySources.unit : undefined}
        />
      )}
    </div>
  );
}

interface DelegatedKpiSettingTab {
  id: string;
  label: string;
  kind: "group" | "unit" | "personal";
  owner: ManagedUser;
  access?: DelegationAccess;
  businessScopeKey?: string;
}

export function SupervisorSettingKPIPage({ personalOnly: personalOnlyProp = false }: { personalOnly?: boolean } = {}) {
  const { activeUser, allUsers } = useAuthStore();
  const [, setDelegTick] = useState(0);
  useEffect(() => {
    const r = () => setDelegTick((t) => t + 1);
    window.addEventListener(DELEGATION_EVENT, r);
    window.addEventListener("pa-db-hydrated", r);
    return () => {
      window.removeEventListener(DELEGATION_EVENT, r);
      window.removeEventListener("pa-db-hydrated", r);
    };
  }, []);

  const usersPool = allUsers.length > 0 ? allUsers : loadManagedUsers();
  const receivedDelegations = getReceivedWorkspaceDelegations(activeUser.employeeId, "kpiSetting", usersPool);

  // Jika tidak ada delegasi KPI Setting yang diterima, jalankan tampilan standar 100% seperti sedia kala
  if (receivedDelegations.length === 0) {
    return <StandardKPISettingContent key={activeUser.employeeId} personalOnly={personalOnlyProp} />;
  }

  // Bangun daftar tab KPI Setting gabungan (Delegasi dari Pemberi Delegasi + KPI milik Penerima Delegasi sendiri):
  // - Pemberi delegasi Director -> KPI Group + KPI Personal pemberi delegasi
  // - Pemberi delegasi GM       -> KPI Unit  + KPI Personal pemberi delegasi
  // - Pemberi delegasi lainnya  -> KPI Personal pemberi delegasi
  // Ditambah tab KPI milik penerima delegasi sendiri -> contoh: 2 KPI atau 3 KPI sesuai profil pemberi & penerima!
  const delegatedTabs: DelegatedKpiSettingTab[] = [];
  for (const d of receivedDelegations) {
    const owner = d.delegator;
    if (isDirectorRoleOrGrouping(owner)) {
      const grp = getGroupNameForUnit(owner.company);
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-group`,
        label: `KPI (Group) · ${grp} · ${owner.name}`,
        kind: "group",
        owner,
        access: d.access,
        businessScopeKey: `corporate-${grp}`,
      });
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        kind: "personal",
        owner,
        access: d.access,
      });
    } else if (owner.role === "GM") {
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-unit`,
        label: `KPI (Unit) · ${owner.company} · ${owner.name}`,
        kind: "unit",
        owner,
        access: d.access,
        businessScopeKey: `unit-${owner.company}`,
      });
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        kind: "personal",
        owner,
        access: d.access,
      });
    } else {
      delegatedTabs.push({
        id: `deleg-${owner.employeeId}-personal`,
        label: `KPI (Personal) · ${owner.name}`,
        kind: "personal",
        owner,
        access: d.access,
      });
    }
  }

  const selfTabs: DelegatedKpiSettingTab[] = [];
  if (!personalOnlyProp && isDirectorRoleOrGrouping(activeUser)) {
    const grp = getGroupNameForUnit(activeUser.company);
    selfTabs.push({
      id: `self-${activeUser.employeeId}-group`,
      label: `KPI (Group) · ${grp} · Saya (${activeUser.name})`,
      kind: "group",
      owner: activeUser,
      businessScopeKey: `corporate-${grp}`,
    });
  } else if (!personalOnlyProp && activeUser.role === "GM") {
    selfTabs.push({
      id: `self-${activeUser.employeeId}-unit`,
      label: `KPI (Unit) · ${activeUser.company} · Saya (${activeUser.name})`,
      kind: "unit",
      owner: activeUser,
      businessScopeKey: `unit-${activeUser.company}`,
    });
  }
  selfTabs.push({
    id: `self-${activeUser.employeeId}-personal`,
    label: `KPI (Personal) · Saya (${activeUser.name})`,
    kind: "personal",
    owner: activeUser,
  });

  const allTabs = [...delegatedTabs, ...selfTabs];
  return <DelegatedKPISettingTabsView tabs={allTabs} actorName={activeUser.name} />;
}

function DelegatedKPISettingTabsView({
  tabs,
  actorName,
}: {
  tabs: DelegatedKpiSettingTab[];
  actorName: string;
}) {
  const [selectedId, setSelectedId] = useState<string>(() => tabs[0]?.id ?? "");
  const [statusByTab, setStatusByTab] = useState<Record<string, TabStatus>>({});
  const [sectionCascadeByTab, setSectionCascadeByTab] = useState<Record<string, Record<string, string>>>({});
  const current = tabs.find((t) => t.id === selectedId) ?? tabs[0];

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Setting</h1>
        <p className="text-gray-500 text-sm">
          2026 Performance Appraisal — Menampilkan {tabs.length} KPI ({tabs.filter((t) => t.access).length} Delegasi &amp; {tabs.filter((t) => !t.access).length} Milik Sendiri)
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map((tab) => {
          const isActive = tab.id === current.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedId(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                isActive
                  ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5 rounded-t-lg"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-t-lg"
              }`}
            >
              <span>{tab.label}</span>
              {tab.access && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  Delegasi
                </span>
              )}
              <TabStatusBadge ts={statusByTab[tab.id] ?? "idle"} useValidate={tab.kind === "group"} />
            </button>
          );
        })}
      </div>

      {current && (
        (() => {
          const fmt = loadMasterKpiFormats<KPISetting>({
            group: CORPORATE_KPI,
            unit: CORPORATE_KPI,
            personal: PERSONAL_KPI,
          });
          // DEMO: KPI (Group) tetap sebagai dasar KPI Utama; KPI (Unit)/(Personal) kosong untuk non-Administrator
          const ownerUsesDemo = usesDemoSampleData(current.owner);
          const initByKind =
            current.kind === "group"
              ? fmt.group
              : [];
          return (
        <KPISection
          key={current.id}
          initialItems={initByKind}
          isPersonal={current.kind === "personal"}
          isCorporate={current.kind !== "personal"}
          divisionApproved={true}
          useValidateTerms={false}
          hideCascading={current.kind === "personal"}
          ownerUser={current.owner}
          businessScopeKey={current.businessScopeKey}
          delegationAccess={current.access}
          actorName={actorName}
          workspaceLabel={current.label}
          copySource={(() => {
            const src = buildKpiCopySources(current.owner);
            if (current.kind === "unit") return src.group;
            if (current.kind === "personal") {
              if (isDirectorRoleOrGrouping(current.owner)) return src.group;
              if (current.owner.role === "GM") return src.unit;
            }
            return undefined;
          })()}
          sectionCascadeMap={sectionCascadeByTab[current.id] ?? {}}
          onSectionCascadeChange={(sec, val) =>
            setSectionCascadeByTab((prev) => ({
              ...prev,
              [current.id]: { ...(prev[current.id] ?? {}), [sec]: val },
            }))
          }
          onTabStatusChange={(st) => setStatusByTab((prev) => ({ ...prev, [current.id]: st }))}
        />
          );
        })()
      )}
    </div>
  );
}
