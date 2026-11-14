// @refresh reset
import React, { useState, useEffect, useRef } from "react";
import { useRouteTab } from "../../../utils/useRouteTab";
import { loadMasterKpi, type MasterKpiStore } from "../../hr/settings/masterKpiStore";
import {
  getActiveUser,
  getGroupNameForUnit,
  isDirectorRoleOrGrouping,
  resolveEffectiveUserGrouping,
} from "../../../store/authStore";
import { loadWorkflowRecords, normalizeEmployeeId, submitWorkflowModule } from "../../shared/appraisalWorkflowStore";
import { savePersistedState } from "../../../services/supabaseClient";
import { ModuleApprovalStatusBar } from "../../../components/ModuleApprovalStatusBar";
import { formatTodayDDMMYYYY } from "../../../utils/dateFormat";
import { Eye, Send, CheckCircle2, Edit3, Plus, Trash2, X, FileEdit, UserCircle2, Paperclip, Lock } from "lucide-react";
import ExportImportButton from "../../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../../utils/excelUtils";

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

type Polaritas = "Maximize" | "Minimize" | "Stabilize";
type PageView = "input" | "preview";
type KPITab = "personal" | "department" | "division" | "corporate" | "pak-anton" | "pak-amir";

interface KPISetting {
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
}

// ─── Personal KPI data (existing SettingKPIPage data) ─────────────────────────

const PERSONAL_KPI: KPISetting[] = [
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

const CORPORATE_KPI: KPISetting[] = [
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
    return () => window.removeEventListener("storage", refresh);
  }, []);
  return master;
}

// ─── Section alphabet options (A – L) ────────────────────────────────────────


const PERSPEKTIF_OPTIONS = ["Finansial", "Proses", "Environment, Health & Safety", "Customer", "Learning & Growth"];
const FORMULA_OPTIONS = ["Jumlah", "Rata-Rata", "Nilai Akhir"];

const SATUAN_UNIT_OPTIONS = ["%", "Temuan", "Hari", "Kasus", "Rp Juta", "Rp Miliar", "Jumlah"];
const SATUAN_PERIODE_OPTIONS = ["Hari", "Bulan", "Triwulan", "Tahun"];

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
const inputCls = "text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] w-full";

// ─── Shared field wrapper ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</label>
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

  const combine = (u: string, p: string) => onChange(u && p ? `${u}/${p}` : u);
  const uOpts = unitOptions ?? SATUAN_UNIT_OPTIONS;
  const pOpts = periodeOptions ?? SATUAN_PERIODE_OPTIONS;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Satuan</label>
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

function calcSectionBobot(items: KPISetting[], section: string, excludeId?: string): number {
  return items
    .filter((i) => i.section === section && i.id !== excludeId)
    .reduce((sum, i) => sum + (parseFloat(i.bobot) || 0), 0);
}

function calcTotalBobot(items: KPISetting[], excludeId?: string): number {
  return items
    .filter((i) => i.id !== excludeId)
    .reduce((sum, i) => sum + (parseFloat(i.bobot) || 0), 0);
}

// Sum of unique sectionBobots across all sections (for corporate/division KPIs)
function calcTotalSectionBobot(items: KPISetting[], excludeSection?: string): number {
  const seen = new Set<string>();
  let total = 0;
  for (const item of items) {
    if (item.section === excludeSection) continue;
    if (!seen.has(item.section) && item.sectionBobot) {
      seen.add(item.section);
      total += parseFloat(item.sectionBobot) || 0;
    }
  }
  return total;
}

// Sum of KPI bobots within a section (for sub-section validation)
function calcSubSectionBobot(items: KPISetting[], section: string, excludeId?: string): number {
  return items
    .filter((i) => i.section === section && i.id !== excludeId)
    .reduce((sum, i) => sum + (parseFloat(i.bobot) || 0), 0);
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

const EDIT_APPROVERS = [
  { label: "Approver 1", name: "Ahmad Fauzi",  role: "Supervisor / Atasan Langsung" },
  { label: "Approver 2", name: "Dewi Rahayu", role: "HR Manager" },
];

function EditRequestModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
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

function EditRequestSuccessModal({ onClose }: { onClose: () => void }) {
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

// Phase 1: single approver for the Edit Request itself
const TARGET_EDIT_REQUEST_APPROVER = { name: "HR ICF", role: "HR ICF", label: "Approver" };

// Phase 2: 4-layer approval after user submits the edited target
const TARGET_EDIT_APPROVERS = [
  { label: "Approver 1", name: "Ahmad Fauzi",     role: "Supervisor / Atasan Langsung" },
  { label: "Approver 2", name: "Dewi Rahayu",     role: "HR Manager"                   },
  { label: "Approver 3", name: "Made Astanawa",   role: "General Manager"              },
  { label: "Validate",   name: "HR ICF",          role: "HR ICF"                       },
];

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

function EditTargetRequestModal({ items, onCancel, onConfirm }: {
  items: KPISetting[];
  onCancel: () => void;
  onConfirm: (category: string, reason: string, files: File[], selectedKpis: string[]) => void;
}) {
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
                <p className="text-[10px] text-blue-500">4 layer approval (Approver 1 → 2 → GM → Validate)</p>
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

function MonthlyTargetEditModal({ items, selectedKpiIds, phase1Category, phase1Reason, onSave, onClose, onSubmitted }: {
  items: KPISetting[];
  selectedKpiIds?: string[];
  phase1Category?: string;
  phase1Reason?: string;
  onSave: (updated: KPISetting[]) => void;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
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
  const [targetSubmitted, setTargetSubmitted]     = useState(false);
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

          {/* File Upload */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Upload Memo &amp; File Pendukung</span>
              <span className="text-[10px] text-gray-400 font-normal normal-case">(jpg, png, pdf)</span>
              <span className="text-[10px] text-red-500 font-semibold">* wajib</span>
            </div>
            <input
              ref={supportFileRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf"
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
                      <span>{a.label === "Approver 3" ? "GM" : a.label}</span>
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
                disabled={supportFiles.length === 0}
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
                  onClick={() => {
                    const editMap = new Map(editItems.map((i) => [i.id, i]));
                    const merged = items.map((i) => editMap.get(i.id) ?? i);
                    onSave(merged);
                    setShowSubmitConfirm(false);
                    setTargetSubmitted(true);
                    setTimeout(() => { onSubmitted?.(); }, 1200);
                  }}
                  className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
                >
                  <Send className="w-3.5 h-3.5" /> Ya, Submit
                </button>
              </div>
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
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Indicator</label>
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50">
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Baseline 2025</label>
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

function Target2026Field({ value, colorMode, ratioMode, monthlyTargets }: {
  value: string; colorMode: boolean; ratioMode?: boolean;
  monthlyTargets?: Record<string, string>;
}) {
  const meta = colorMode ? MONTHLY_FLAG_OPTIONS.find((o) => o.value === value) : null;

  if (ratioMode) {
    const hasValue = !!value;
    const { totalP, totalN } = monthlyTargets ? computeRatioSumDisplay(monthlyTargets) : { totalP: 0, totalN: 0 };
    return (
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target 2026</label>
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50/40">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target 2026</label>
      {colorMode ? (
        <div
          className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-bold"
          style={{
            background: meta ? meta.bg : "#f9fafb",
            borderColor: meta ? meta.border : "#e5e7eb",
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
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none w-full bg-gray-50 text-[#1A284F] font-bold cursor-default"
            placeholder="Auto-computed from Monthly Target"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium pointer-events-none">auto</span>
        </div>
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
}: {
  monthlyTargets: Record<string, string>;
  formula: string;
  colorMode: boolean;
  ratioMode?: boolean;
  onChange: (mt: Record<string, string>, computed2026: string) => void;
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Monthly Target</label>
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
      <div className="overflow-x-auto rounded-xl border border-gray-200">
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

function AddKPIModal({ existingItems, onAdd, onClose, forDivision, onSectionCascade }: { existingItems: KPISetting[]; onAdd: (item: KPISetting) => void; onClose: () => void; forDivision?: boolean; onSectionCascade?: (section: string, type: string) => void }) {
  const master = useMasterKpi();
  const [tab, setTab] = useState<"section" | "subsection">("section");
  const [form, setForm] = useState<Omit<KPISetting, "id">>({
    no: "", sectionAlphabet: forDivision ? "A." : "A.", section: forDivision ? "A" : "A",
    sectionLabel: forDivision ? "K3L Terintegrasi (SMK3/HSE)" : "Objective KPI",
    sectionBobot: forDivision ? "" : "20%",
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
  const setSection = (code: string) => {
    if (forDivision) {
      const opt = DIVISION_SECTION_OPTIONS.find(o => o.value === code);
      // Try to get bobot from existing items, else from CORP_SECTION_META
      const existingBobot = existingItems.find(i => i.section === code)?.sectionBobot ?? "";
      const metaBobot = (CORP_SECTION_META as Record<string, { bobot: string }>)[code]?.bobot ?? "";
      setForm(p => ({ ...p, section: code, sectionLabel: opt?.label.replace(/^[A-Z] — /, "") ?? code, sectionAlphabet: code + ".", sectionBobot: existingBobot || metaBobot }));
    } else {
      const opt = PERSONAL_SECTION_OPTIONS.find(o => o.value === code);
      setForm(p => ({ ...p, section: code, sectionLabel: opt?.label.replace(/^[A-Z] — /, "") ?? code, sectionAlphabet: code + ".", sectionBobot: opt?.bobot ?? "" }));
    }
  };

  const setIndicatorMode = (mode: IndicatorMode) => setForm((p) => ({
    ...p, indicatorMode: mode, colorIndicator: mode === "color", monthlyTargets: {}, baseline2025: "", target2026: "",
    ...(mode === "color" ? { formula: "Nilai Akhir" } : mode === "ratio" ? { formula: "Jumlah" } : {}),
  }));

  const handleNextToSubSection = () => setTab("subsection");

  const handleAdd = () => {
    if (!form.no || !form.kpi) return;
    const bobot = parseFloat(form.bobot) || 0;
    const totalUsed = calcTotalBobot(existingItems);
    if (totalUsed + bobot > 100) {
      setBobotError({ kind: "global", totalUsed, remaining: 100 - totalUsed,
        conflictItems: existingItems.map((i) => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot })) });
      return;
    }
    const sectionUsed = calcSectionBobot(existingItems, form.section);
    const sectionLimit = SECTION_BOBOT_LIMIT[form.section] ?? 100;
    if (sectionUsed + bobot > sectionLimit) {
      setBobotError({ kind: "section", section: form.section, remaining: sectionLimit - sectionUsed,
        conflictItems: existingItems.filter((i) => i.section === form.section).map((i) => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot })) });
      return;
    }
    if (sectionCascadeType) onSectionCascade?.(form.section, sectionCascadeType);
    onAdd({ ...form, id: `kpi-${Date.now()}` }); onClose();
  };

  const sectionOptions = forDivision ? DIVISION_SECTION_OPTIONS : PERSONAL_SECTION_OPTIONS;
  const modalTitle = forDivision ? "Add New KPI — Division" : "Add New KPI — Personal";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-lg">{modalTitle}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{forDivision ? "KPI Divisi 2026" : "KPI Personal 2026"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 pt-3 gap-1">
          {([{ id: "section", label: "Section" }, { id: "subsection", label: "Sub Section" }] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${tab === t.id ? "bg-[#1A284F] text-white" : "text-gray-500 hover:text-[#1A284F] hover:bg-gray-50"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">

          {/* ══ SECTION TAB ══ */}
          {tab === "section" && (
            <>
              <Field label="Section">
                <select value={form.section} onChange={(e) => setSection(e.target.value)} className={inputCls}>
                  {sectionOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Pilih section untuk KPI ini.</p>
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
                <select value={form.sectionBobot ?? ""} onChange={(e) => set("sectionBobot" as keyof typeof form, e.target.value)} className={inputCls}>
                  <option value="">— Section Bobot —</option>
                  {SECTION_BOBOT_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {form.sectionBobot && (
                  <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    Auto-filled dari section yang sudah ada. Dapat diubah jika diperlukan.
                  </p>
                )}
              </Field>

              {/* Cascading */}
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
                  <option value="FC" style={{ background: "#fff", color: "#312e81" }}>FC — Full Cascading (level bawah read-only)</option>
                  <option value="PC" style={{ background: "#fff", color: "#78350f" }}>PC — Partial Cascading (dapat edit Section Bobot)</option>
                  <option value="CC" style={{ background: "#fff", color: "#134e4a" }}>CC — Contributing Cascading (dapat edit Section Bobot & Name)</option>
                </select>
                <div className="mt-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[10px] text-gray-500 leading-relaxed">
                  {sectionCascadeType === "FC" && <><span className="font-bold text-indigo-700">FC — Full Cascading:</span> Level di bawah tidak dapat mengubah Section Bobot maupun nama section.</>}
                  {sectionCascadeType === "PC" && <><span className="font-bold text-amber-700">PC — Partial Cascading:</span> Level di bawah dapat mengubah Section Bobot, namun nama section tetap read-only.</>}
                  {sectionCascadeType === "CC" && <><span className="font-bold text-teal-700">CC — Contributing Cascading:</span> Level di bawah dapat mengubah Section Bobot dan Section Name.</>}
                </div>
              </Field>

              <div className="flex items-center justify-between pt-2">
                {!form.sectionBobot && (
                  <p className="text-[11px] text-amber-600 font-medium">Choose Section Bobot to continue.</p>
                )}
                <div className="ml-auto">
                  <button onClick={handleNextToSubSection} disabled={!form.sectionBobot}
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="No *"><input value={form.no} onChange={(e) => set("no", e.target.value)} placeholder="e.g. 8" className={inputCls} /></Field>
                <Field label="Perspektif">
                  <select value={form.perspektif} onChange={(e) => set("perspektif", e.target.value)} className={inputCls}>
                    <option value="">— Perspektif —</option>
                    {master.perspektif.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="KPI *"><textarea rows={3} value={form.kpi} onChange={(e) => set("kpi", e.target.value)} placeholder="KPI name / description" className={inputCls + " resize-none"} /></Field>
              <SatuanField value={form.satuan} onChange={(v) => set("satuan", v)} unitOptions={master.satuan} periodeOptions={master.period} />

              <Field label="Formula Pencapaian">
                {colorMode || ratioMode
                  ? <div className={inputCls + " bg-gray-50 text-[#1A284F] font-semibold cursor-default select-none"}>{form.formula}</div>
                  : <select value={form.formula} onChange={(e) => set("formula", e.target.value)} className={inputCls}>
                      {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                    </select>}
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Bobot">
                  <select value={form.bobot} onChange={(e) => set("bobot", e.target.value)} className={inputCls}>
                    <option value="">— Pilih Bobot —</option>
                    {BOBOT_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Polaritas">
                  <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)} className={inputCls}>
                    {POLARITAS_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
                onChange={(mt, computed) => setForm((p) => ({ ...p, monthlyTargets: mt, target2026: computed }))}
              />

              <Target2026Field value={form.target2026} colorMode={colorMode} ratioMode={ratioMode} monthlyTargets={form.monthlyTargets} />

              <Field label="Detail Formula Pencapaian"><textarea rows={4} value={form.detailFormula} onChange={(e) => set("detailFormula", e.target.value)} className={inputCls + " resize-none"} /></Field>
              <Field label="Keterangan"><textarea rows={3} value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)} className={inputCls + " resize-none"} /></Field>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          {tab === "subsection" && (
            <button onClick={handleAdd} disabled={!form.no || !form.kpi}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40">
              <Plus className="w-4 h-4" /> Add KPI
            </button>
          )}
        </div>
      </div>
      {bobotError && <BobotExceededModal violation={bobotError} onClose={() => setBobotError(null)} />}
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
  type: "FC" | "PC" | "CC";
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

function AddCorporateKPIModal({ onAdd, onClose, existingItems = [], sectionLabel = "Business" }: { onAdd: (item: KPISetting) => void; onClose: () => void; existingItems?: KPISetting[]; sectionLabel?: string }) {
  const master = useMasterKpi();
  const [tab, setTab] = useState<"section" | "subsection">("section");
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

  // Handles free-text section label → derives letter code + alphabet
  // Auto-fills sectionBobot when an existing section is selected
  const setSection = (label: string) => {
    const usedCodes = Array.from(new Set(existingItems.map(i => i.section).filter(Boolean)));
    const code = getMasterSectionCode(label.trim(), master.section, usedCodes);
    // Prefer static metadata bobot (authoritative), fall back to existingItems sectionBobot field
    const metaBobot = (CORP_SECTION_META as Record<string, { label: string; bobot: string; bg: string }>)[code]?.bobot ?? "";
    const itemBobot = existingItems.find(i => i.section === code)?.sectionBobot ?? "";
    const autoBobot = metaBobot || itemBobot;
    setForm(p => ({
      ...p,
      sectionLabel: label,
      section: code,
      sectionAlphabet: code + ".",
      // Only auto-fill if we found a known bobot; don't overwrite a manually-set value when user clears and retypes
      sectionBobot: autoBobot || p.sectionBobot,
    }));
  };

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

  const handleNextToSubSection = () => {
    const newSectionBobot = parseFloat(form.sectionBobot) || 0;
    const usedSectionBobot = calcTotalSectionBobot(existingItems, form.section);
    if (usedSectionBobot + newSectionBobot > 100) {
      const conflictItems = Array.from(
        new Map(existingItems.filter(i => i.sectionBobot).map(i => [i.section, i])).values()
      ).map(i => ({ no: i.section, label: i.sectionLabel || `Section ${i.section}`, bobot: i.sectionBobot || "" }));
      setBobotError({ kind: "section_bobot", totalUsed: usedSectionBobot, remaining: 100 - usedSectionBobot, conflictItems });
      return;
    }
    setTab("subsection");
  };

  const handleAdd = () => {
    if (!form.no || !form.kpi) return;
    const kpiBobot = parseFloat(form.bobot) || 0;
    const sectionLimit = parseFloat(form.sectionBobot) || 100;
    const subUsed = calcSubSectionBobot(existingItems, form.section);
    if (subUsed + kpiBobot > sectionLimit) {
      const conflictItems = existingItems
        .filter(i => i.section === form.section)
        .map(i => ({ no: i.no, label: i.kpi.split("\n")[0], bobot: i.bobot }));
      setBobotError({ kind: "sub_section_bobot", sectionLabel: form.sectionLabel || `Section ${form.section}`, sectionLimit, remaining: sectionLimit - subUsed, conflictItems });
      return;
    }
    onAdd({ ...form, id: `corp-kpi-${Date.now()}` });
    onClose();
  };

  const TABS = [
    { id: "section" as const,    label: "Section" },
    { id: "subsection" as const, label: "Sub Section" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-lg">Add New KPI — {sectionLabel}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{sectionLabel === "Division" ? "KPI Divisi 2026" : "KPI Bisnis RSUP Group 2026"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6 pt-3 gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
                tab === t.id
                  ? "bg-[#1A284F] text-white"
                  : "text-gray-500 hover:text-[#1A284F] hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[65vh] overflow-y-auto">

          {/* ══ SECTION TAB ══ */}
          {tab === "section" && (
            <>
              {/* Unified Section field — free text with master suggestions */}
              <Field label="Section">
                <div className="relative">
                  <input
                    list="corp-section-list"
                    value={form.sectionLabel ?? ""}
                    onChange={(e) => setSection(e.target.value)}
                    placeholder="Type or select a section name…"
                    className={inputCls}
                  />
                  <datalist id="corp-section-list">
                    {master.section.map(label => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  Choose from existing sections or type a new name to create a custom section.
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
                <select value={form.sectionBobot} onChange={(e) => set("sectionBobot", e.target.value)} className={inputCls}>
                  <option value="">— Section Bobot —</option>
                  {SECTION_BOBOT_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {form.section && form.sectionBobot && (CORP_SECTION_META as Record<string, { bobot: string }>)[form.section]?.bobot === form.sectionBobot && (
                  <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    Auto-filled dari bobot section yang sudah ada. Dapat diubah jika diperlukan.
                  </p>
                )}
              </Field>

              <div className="flex items-center justify-between pt-2">
                {(!form.sectionLabel?.trim() || !form.sectionBobot) && (
                  <p className="text-[11px] text-amber-600 font-medium">
                    {!form.sectionLabel?.trim() ? "Enter a section name." : "Choose Section Bobot to continue."}
                  </p>
                )}
                <div className="ml-auto">
                  <button
                    onClick={handleNextToSubSection}
                    disabled={!form.sectionLabel?.trim() || !form.sectionBobot}
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
                        {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                      </select>}
                </Field>
                <Field label="Tracking Period">
                  <select value={form.trackingPeriod} onChange={(e) => set("trackingPeriod", e.target.value)} className={inputCls}>
                    <option value="">— Period —</option>
                    {master.trackingPeriod.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <ScopeCheckboxField
                  options={master.scope}
                  value={form.scope ? form.scope.split(", ").filter(Boolean) : []}
                  onChange={(vals) => set("scope", vals.join(", "))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Bobot">
                  <select value={form.bobot} onChange={(e) => set("bobot", e.target.value)} className={inputCls}>
                    <option value="">— Pilih Bobot —</option>
                    {BOBOT_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                <Field label="Polaritas">
                  <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)} className={inputCls}>
                    {POLARITAS_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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

              {/* CASCADING — compact searchable dropdown per type */}
              {(() => {
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
                      {(["FC", "PC", "CC"] as const).map((type) => {
                        const s = CASC_STYLE[type];
                        const selectedInType = cascRoles.filter(r => cmap[r.key] === type);
                        return (
                          <CascadingDropdownRow
                            key={type}
                            type={type}
                            desc={DESC[type]}
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

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          {tab === "subsection" && (
            <button
              onClick={handleAdd}
              disabled={!form.no || !form.kpi}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40"
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
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

function KPISettingTable({ items, editable, onDelete, onUpdateItem, hideCascading = false }: {
  items: KPISetting[]; editable: boolean;
  onDelete?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<KPISetting>) => void;
  hideCascading?: boolean;
}) {
  const master = useMasterKpi();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KPISetting | null>(null);
  const [targetEditItem, setTargetEditItem] = useState<KPISetting | null>(null);
  const [sectionLabelOverrides, setSectionLabelOverrides] = useState<Record<string, string>>({});
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [bobotOverErrorPersonal, setBobotOverErrorPersonal] = useState<{ sectionLabel: string; sectionBobot: number; totalBobot: number; kind: "section" | "total" } | null>(null);

  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const secItems = (sec: string) => items.filter((k) => k.section === sec);
  const totalCols = (editable ? 17 : 16) - (hideCascading ? 1 : 0);

  const startEdit = (item: KPISetting) => { setEditingId(item.id); setDraft({ ...item }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (draft) {
      const sec = draft.section;
      // Rule 6: KPI item bobots in section must not exceed section bobot
      const rawSecBobot = items.find(i => i.section === sec && i.sectionBobot)?.sectionBobot ?? "100";
      const sectionBobot = parseFloat(rawSecBobot.replace("%", "")) || 100;
      const secTotal = items
        .filter(i => i.section === sec && i.id !== draft.id)
        .reduce((s, i) => s + (parseFloat(i.bobot.replace("%", "")) || 0), 0)
        + (parseFloat(draft.bobot.replace("%", "")) || 0);
      if (secTotal > sectionBobot) {
        const lbl = items.find(i => i.section === sec)?.sectionLabel ?? `Section ${sec}`;
        setBobotOverErrorPersonal({ sectionLabel: lbl, sectionBobot, totalBobot: secTotal, kind: "section" });
        return;
      }
      // Rule 7: Total all KPI item bobots must not exceed 100%
      const allTotal = items
        .filter(i => i.id !== draft.id)
        .reduce((s, i) => s + (parseFloat(i.bobot.replace("%", "")) || 0), 0)
        + (parseFloat(draft.bobot.replace("%", "")) || 0);
      if (allTotal > 100) {
        setBobotOverErrorPersonal({ sectionLabel: "Semua Section", sectionBobot: 100, totalBobot: allTotal, kind: "total" });
        return;
      }
      onUpdateItem?.(draft.id, draft);
    }
    setEditingId(null);
    setDraft(null);
  };
  const setD = (patch: Partial<KPISetting>) => setDraft((d) => d ? { ...d, ...patch } : d);

  const ci = "w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-[#1A284F] bg-white resize-none leading-relaxed";

  const renderRows = (sec: string) =>
    secItems(sec).map((item) => {
      const isEditing = editingId === item.id;
      const row = isEditing && draft ? draft : item;
      return (
        <tr key={item.id} className={`border-t border-gray-200 transition-colors ${isEditing ? "bg-blue-50/20 ring-1 ring-inset ring-[#1A284F]/20" : "hover:bg-gray-50/50"}`}>
          {/* No */}
          <td className="border border-gray-200 text-center text-xs font-semibold text-gray-600 bg-white py-3 px-2"
            style={{ position: "sticky", left: 0, zIndex: 10, minWidth: W_NO, maxWidth: W_NO }}>
            {isEditing
              ? <input value={row.no} onChange={(e) => setD({ no: e.target.value })} className={ci + " text-center font-bold"} />
              : item.no}
          </td>
          {/* Perspektif */}
          <td className="border border-gray-200 py-3 px-3 bg-white"
            style={{ position: "sticky", left: W_NO, zIndex: 10, minWidth: W_PERSP, maxWidth: W_PERSP }}>
            {isEditing
              ? <select value={row.perspektif} onChange={(e) => setD({ perspektif: e.target.value })} className={ci}>
                  {PERSPEKTIF_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
              : <span className={`text-xs font-bold ${PERSP_COLOR[item.perspektif] ?? "text-gray-700"}`}>{item.perspektif}</span>}
          </td>
          {/* KPI */}
          <td className="border border-gray-200 py-3 px-3 bg-white"
            style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 10, minWidth: W_KPI, maxWidth: W_KPI }}>
            {isEditing
              ? (item._cascadeType === "FC" || item._cascadeType === "PC")
                ? <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-gray-600 whitespace-pre-line leading-relaxed bg-gray-100 rounded px-2 py-1.5 select-none">{row.kpi}</p>
                    <span className="text-[10px] text-amber-600 font-semibold">{item._cascadeType} — Read only</span>
                  </div>
                : <textarea rows={3} value={row.kpi} onChange={(e) => setD({ kpi: e.target.value })} className={ci} />
              : <p className="text-xs font-medium text-gray-800 whitespace-pre-line leading-relaxed">{item.kpi}</p>}
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
                        {SATUAN_PERIODE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
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
                  {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                </select>
              : item.formula}
          </td>
          {/* Scope */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600" style={{ minWidth: 140 }}>
            {isEditing
              ? <input value={row.scope ?? ""} onChange={(e) => setD({ scope: e.target.value })} className={ci} />
              : item.scope || "—"}
          </td>
          {/* Bobot */}
          <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 72 }}>
            {isEditing
              ? <select value={row.bobot} onChange={(e) => setD({ bobot: e.target.value })} className={ci}>
                  {BOBOT_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
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
                  {POLARITAS_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
          {/* Tracking Period */}
          <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 120 }}>
            {isEditing
              ? <select value={row.trackingPeriod ?? ""} onChange={(e) => setD({ trackingPeriod: e.target.value })} className={ci}>
                  <option value="">— Pilih —</option>
                  {["Bulanan", "Triwulan", "Semesteran", "Tahunan"].map((p) => <option key={p}>{p}</option>)}
                </select>
              : item.trackingPeriod || "—"}
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
          {/* Aksi */}
          {editable && (
            <td className="border border-gray-200 bg-white py-3 px-2 text-center" style={{ minWidth: 88 }}>
              {isEditing
                ? <div className="flex flex-col gap-1">
                    <button onClick={saveEdit} className="w-full px-2 py-1 rounded text-[10px] font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">Save</button>
                    <button onClick={cancelEdit} className="w-full px-2 py-1 rounded text-[10px] font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                  </div>
                : <div className="flex items-center justify-center gap-1">
                    <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg hover:bg-[#1A284F]/10 text-[#1A284F]" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDelete?.(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>}
            </td>
          )}
        </tr>
      );
    });

  return (
    <>
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-xs" style={{ minWidth: `${W_NO + W_PERSP + W_KPI + 1660 + (editable ? 88 : 0)}px` }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {[
              { label: "No",                       style: { position: "sticky" as const, left: 0,               zIndex: 20, background: "#1A284F", minWidth: W_NO    } },
              { label: "Perspektif",               style: { position: "sticky" as const, left: W_NO,            zIndex: 20, background: "#1A284F", minWidth: W_PERSP } },
              { label: "KPI",                      style: { position: "sticky" as const, left: W_NO + W_PERSP,  zIndex: 20, background: "#1A284F", minWidth: W_KPI   } },
              { label: "Satuan",                   style: { minWidth: 180  } },
              { label: "Formula Setahun",          style: { minWidth: 100  } },
              { label: "Scope",                    style: { minWidth: 140  } },
              { label: "Bobot",                    style: { minWidth: 72   } },
              { label: "Definisi",                 style: { minWidth: 240  } },
              { label: "Source",                   style: { minWidth: 160  } },
              { label: "Baseline 2025",            style: { minWidth: 96   } },
              { label: "Target 2026",              style: { minWidth: 96   } },
              { label: "Polaritas",                style: { minWidth: 96   } },
              { label: "Detail Formula",           style: { minWidth: 260  } },
              { label: "Tracking Period",          style: { minWidth: 120  } },
              ...(!hideCascading ? [{ label: "CASCADING (FC; PC; CC)", style: { minWidth: 100 } }] : []),
              ...(editable ? [{ label: "Aksi", style: { minWidth: 88 } }] : []),
            ].map(({ label, style }) => (
              <th key={label} className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={style}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec, si) => {
            const isCorp = sections.some((s) => ["C","D","E","F"].includes(s));
            const DEFAULT_SEC_LABELS: Record<string, string> = isCorp ? {
              A: "A. K3L Terintegrasi — Bobot 15%",
              B: "B. Finansial & Cost — Bobot 40%",
              C: "C. Produksi — Bobot 30%",
              D: "D. Be Employer of Choices — Bobot 9%",
              E: "E. Be Partner of Choices — Bobot 6%",
              F: "F. Regulatory Compliance — Bobot 0%",
            } : {
              A: "A. Objective KPI — Bobot 20%",
              B: "B. Functional KPI — Bobot 80%",
            };
            const bgColors = ["#1565C0","#1976D2","#1E88E5","#2196F3","#42A5F5","#64B5F6"];
            const bg = bgColors[si % bgColors.length];
            const label = sectionLabelOverrides[sec] ?? DEFAULT_SEC_LABELS[sec] ?? `${sec}.`;
            const isEditingThisSection = editingSection === sec;
            return (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={totalCols} className="border" style={{ background: bg, borderColor: bg }}>
                    {editable && isEditingThisSection
                      ? <div className="flex items-center gap-2 px-4 py-1.5">
                          <input
                            autoFocus
                            value={sectionLabelOverrides[sec] ?? DEFAULT_SEC_LABELS[sec] ?? sec}
                            onChange={(e) => setSectionLabelOverrides((p) => ({ ...p, [sec]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingSection(null); }}
                            className="flex-1 text-xs font-bold bg-white/20 text-white placeholder-white/60 border border-white/40 rounded px-2 py-0.5 outline-none"
                          />
                          <button onClick={() => setEditingSection(null)} className="text-white/80 hover:text-white text-[10px] font-semibold px-2 py-0.5 rounded bg-white/10 hover:bg-white/20">Done</button>
                        </div>
                      : <div className="flex items-center justify-between px-4 py-2">
                          <span className="text-white text-xs font-bold uppercase tracking-widest">{label}</span>
                          {editable && (
                            <button onClick={() => setEditingSection(sec)} className="p-1 rounded hover:bg-white/20 text-white/70 hover:text-white" title="Edit section label">
                              <Edit3 className="w-3 h-3" />
                            </button>
                          )}
                        </div>}
                  </td>
                </tr>
                {renderRows(sec)}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>

    {targetEditItem && (
      <TargetEditMiniModal
        item={targetEditItem}
        onSave={(updates) => { setD(updates); setTargetEditItem(null); }}
        onClose={() => setTargetEditItem(null)}
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

function CorporateKPITable({ items, onUpdateItem, onDeleteItem, onAddClick, onSubmit, onExport, onImport, submitted = false, hideCascading = false, kpiApproved = false, targetEditApproved = false, onEditTargetRequest, sectionCascadeMap, onSectionCascadeChange, parentSectionCascadeMap, editedSectionBobots, onSectionBobotChange }: {
  items: KPISetting[];
  onUpdateItem?: (id: string, updates: Partial<KPISetting>) => void;
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
  const [previewMode, setPreviewMode] = useState(false);
  const [bobotOverError, setBobotOverError] = useState<{ section: string; sectionLabel: string; sectionBobot: number; totalBobot: number; kind?: "section" | "total" } | null>(null);
  const [corpTargetEdit, setCorpTargetEdit] = useState<KPISetting | null>(null);
  // Local editable section names for CC cascade type (pak-anton view)
  const [editedSectionLabels, setEditedSectionLabels] = useState<Record<string, string>>({});

  const startEdit = (item: KPISetting) => { if (submitted || kpiApproved) return; setEditingRowId(item.id); setDraft({ ...item }); };
  const cancelEdit = () => { setEditingRowId(null); setDraft(null); };
  const saveEdit = () => {
    if (draft) {
      const sec = draft.section;
      // Rule 6: total KPI bobot in section must not exceed section bobot
      const rawSectionBobot = editedSectionBobots?.[sec] ?? CORP_SECTION_META[sec]?.bobot ?? "100";
      const sectionBobot = parseFloat(rawSectionBobot.replace("%", "")) || 100;
      const sectionTotal = items
        .filter((i) => i.section === sec && i.id !== draft.id)
        .reduce((s, i) => s + (parseFloat(i.bobot.replace("%", "")) || 0), 0)
        + (parseFloat(draft.bobot.replace("%", "")) || 0);
      if (sectionTotal > sectionBobot) {
        const secMeta = CORP_SECTION_META[sec];
        setBobotOverError({
          section: sec,
          sectionLabel: secMeta?.label ?? `Section ${sec}`,
          sectionBobot,
          totalBobot: sectionTotal,
          kind: "section",
        });
        return;
      }
      // Rule 7: total of all KPI item bobots across all sections must not exceed 100%
      const allTotal = items
        .filter((i) => i.id !== draft.id)
        .reduce((s, i) => s + (parseFloat(i.bobot.replace("%", "")) || 0), 0)
        + (parseFloat(draft.bobot.replace("%", "")) || 0);
      if (allTotal > 100) {
        setBobotOverError({
          section: sec,
          sectionLabel: "Semua Section",
          sectionBobot: 100,
          totalBobot: allTotal,
          kind: "total",
        });
        return;
      }
      onUpdateItem?.(draft.id, draft);
    }
    setEditingRowId(null);
    setDraft(null);
  };
  const setDraftField = (updates: Partial<KPISetting>) => setDraft((d) => d ? { ...d, ...updates } : d);

  // FC/PC/CC editability rules applied to the row currently being edited
  const isFieldEditable = (field: string): boolean => {
    const ct = draft?._cascadeType;
    if (!ct) return true;           // custom row — all editable
    if (ct === "CC") return true;   // Contributing — fully editable
    if (field === "no") return true; // No column always editable for all cascade types
    if (ct === "PC") return field === "bobot" || field === "target2026";
    return false;                   // FC — all other data fields read-only
  };

  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const COLS = [
    { label: "No",                w: 44  },
    { label: "Perspektif",        w: 100 },
    { label: "KPI",               w: 260 },
    { label: "Satuan",            w: 120 },
    { label: "Formula Setahun",   w: 110 },
    { label: "Scope",             w: 180 },
    { label: "Bobot",             w: 60  },
    { label: "Definisi",          w: 240 },
    { label: "Source",            w: 180 },
    { label: "Baseline 2025",     w: 100 },
    { label: "Target 2026",       w: 100 },
    { label: "Polaritas",         w: 80  },
    { label: "Detail Formula",    w: 240 },
    { label: "Tracking Period",   w: 90  },
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
  const cascadingWidth = COLS.slice(14).reduce((s, c) => s + c.w, 0) + 80;
  const showAksi = !previewMode && !kpiApproved && !submitted;
  const totalWidth = COLS.reduce((s, c) => s + c.w, 0) + (showAksi ? 80 : 0) - (hideCascading ? cascadingWidth : 0) + (hasCascadedRows && !previewMode ? 62 : 0);
  const totalCols = 14
    + (showAksi ? 1 : 0)
    + (hasCascadedRows && !previewMode ? 1 : 0)
    + (!previewMode && !hideCascading ? 3 : 0);
  const cellInput = "w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-[#1A284F] bg-white resize-none leading-relaxed";

  return (
    <>
    <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <div className="flex items-center gap-1.5">
          {!hideCascading && previewMode
            ? <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                <Eye className="w-3.5 h-3.5" /> Preview Mode — CASCADING columns hidden
              </span>
            : (!kpiApproved && !submitted) && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] bg-[#1A284F]/5 border border-[#1A284F]/15 px-2.5 py-1 rounded-full">
                <Edit3 className="w-3.5 h-3.5" /> Edit Mode
              </span>
            )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!submitted && !kpiApproved && (
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
          {!submitted && (
            <button onClick={onSubmit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
              <Send className="w-3.5 h-3.5" /> Submit KPI
            </button>
          )}
          {onExport && <ExportImportButton onExport={onExport} onImport={onImport ?? (() => {})} size="sm" />}
        </div>
      </div>
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs" style={{ minWidth: totalWidth + "px" }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {hasCascadedRows && !previewMode && (
              <th rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-1.5 text-center font-semibold text-[10px] align-middle" style={{ minWidth: 62 }}>
                Cascade
              </th>
            )}
            {COLS.slice(0, 14).map(({ label, w }) => (
              <th key={label} rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px] align-middle"
                style={{ minWidth: w }}>{label}</th>
            ))}
            {!previewMode && !hideCascading && (
              <th colSpan={3} className="border border-[#1A284F]/30 py-2 px-2 text-center font-semibold text-[11px]">
                CASCADING
              </th>
            )}
            {showAksi && (
              <th rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px] align-middle"
                style={{ minWidth: 80 }}>Aksi</th>
            )}
          </tr>
          <tr className="bg-[#243860] text-white">
            {!previewMode && !hideCascading && COLS.slice(14).map(({ label, w }) => (
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
            const alphabet  = staticMeta ? `${sec}.` : (firstItem?.sectionAlphabet ?? sec + ".");
            const secLabel  = staticMeta ? staticMeta.label : (firstItem?.sectionLabel ?? sec);
            const bobot     = staticMeta ? staticMeta.bobot : (firstItem?.sectionBobot ?? "—");
            const customIdx = sections.filter(s => !CORP_SECTION_META[s]).indexOf(sec);
            const bg        = staticMeta ? staticMeta.bg : CUSTOM_SECTION_BG_PALETTE[customIdx % CUSTOM_SECTION_BG_PALETTE.length];
            return (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={totalCols} className="py-2.5 px-4 text-white text-[11px] font-bold uppercase tracking-wider border"
                    style={{ background: bg, borderColor: bg }}>
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Section name — editable for CC cascade only */}
                      {parentSectionCascadeMap?.[sec] === "CC" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="opacity-60 text-[11px]">{alphabet}</span>
                          <input
                            value={editedSectionLabels[sec] ?? secLabel}
                            onChange={(e) => { if (!submitted && !kpiApproved) setEditedSectionLabels(p => ({ ...p, [sec]: e.target.value })); }}
                            readOnly={submitted || kpiApproved}
                            className="text-[11px] font-bold bg-white/20 text-white border border-white/30 rounded px-2 py-0.5 outline-none min-w-0 w-48 read-only:opacity-70 read-only:cursor-default"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </span>
                      ) : (
                        <span>{alphabet} {editedSectionLabels[sec] ?? secLabel}</span>
                      )}
                      {/* Section bobot — editable in pak-anton if PC/CC, read-only if FC */}
                      {parentSectionCascadeMap?.[sec] ? (
                        parentSectionCascadeMap[sec] === "FC" ? (
                          <span className="opacity-80 font-normal normal-case tracking-normal text-[11px] flex items-center gap-1">
                            — Bobot {bobot}
                            <Lock className="w-3 h-3 opacity-70" />
                          </span>
                        ) : (
                          <span className="font-normal normal-case tracking-normal text-[11px] flex items-center gap-1.5 opacity-90">
                            — Bobot
                            <select
                              value={editedSectionBobots?.[sec] ?? bobot}
                              onChange={(e) => onSectionBobotChange?.(sec, e.target.value)}
                              disabled={submitted || kpiApproved}
                              className="text-[11px] font-bold bg-white/20 text-white border border-white/30 rounded px-1.5 py-0.5 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {SECTION_BOBOT_OPTIONS.map((o) => <option key={o} value={o} style={{ color: "#1A284F", background: "#fff" }}>{o}</option>)}
                            </select>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: CASCADING_CELL_BG[parentSectionCascadeMap[sec]], color: CASCADING_CELL_COLOR[parentSectionCascadeMap[sec]], border: `1px solid ${CASCADING_CELL_BORDER[parentSectionCascadeMap[sec]]}` }}>
                              {parentSectionCascadeMap[sec]}
                            </span>
                          </span>
                        )
                      ) : (
                        <span className="opacity-80 font-normal normal-case tracking-normal text-[11px]">— Bobot {bobot}</span>
                      )}
                      {/* Section-level cascade selector (corporate tab only, not in preview) */}
                      {!previewMode && !hideCascading && sectionCascadeMap !== undefined && (
                        <span className="font-normal normal-case tracking-normal text-[11px] flex items-center gap-1.5 opacity-90 ml-auto">
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
                  const isEditing = editingRowId === item.id;
                  const row = isEditing && draft ? draft : item;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/30";
                  const cascBg = (v?: string) => isEditing && v ? CASCADING_CELL_BG[v] : undefined;
                  const ct = item._cascadeType;
                  const CASCADE_BADGE: Record<string, { label: string; cls: string }> = {
                    FC: { label: "FC", cls: "bg-indigo-100 text-indigo-800 border border-indigo-300" },
                    PC: { label: "PC", cls: "bg-amber-100 text-amber-800 border border-amber-300" },
                    CC: { label: "CC", cls: "bg-teal-100 text-teal-800 border border-teal-300" },
                  };
                  return (
                    <tr key={item.id} className={`border-t border-gray-100 ${rowBg} ${isEditing ? "ring-1 ring-inset ring-[#1A284F]/20 bg-blue-50/10" : "hover:bg-blue-50/20"} transition-colors`}>
                      {/* Cascade badge column */}
                      {hasCascadedRows && !previewMode && (
                        <td className="border border-gray-200 py-2 px-1 text-center">
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
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("no")
                          ? <input value={row.no} onChange={(e) => setDraftField({ no: e.target.value })} className={cellInput + " text-center font-bold text-gray-600"} />
                          : <span className="font-bold text-gray-500 text-[11px]">{row.no}</span>}
                      </td>
                      {/* Perspektif */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("perspektif")
                          ? <select value={row.perspektif} onChange={(e) => setDraftField({ perspektif: e.target.value })} className={cellInput}>
                              {PERSPEKTIF_OPTIONS.map((p) => <option key={p}>{p}</option>)}
                            </select>
                          : <span className={`text-[11px] font-semibold ${PERSP_COLOR[row.perspektif] ?? "text-gray-700"}`}>{row.perspektif}</span>}
                      </td>
                      {/* KPI */}
                      <td className="border border-gray-200 py-2 px-1.5">
                        {isEditing && isFieldEditable("kpi")
                          ? <textarea rows={3} value={row.kpi} onChange={(e) => setDraftField({ kpi: e.target.value })} className={cellInput} />
                          : <p className="text-[11px] font-medium text-gray-800 leading-relaxed">{row.kpi}</p>}
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
                              {FORMULA_OPTIONS.map((f) => <option key={f}>{f}</option>)}
                            </select>
                          : <span className="text-[11px] text-gray-600">{row.formula || "—"}</span>}
                      </td>
                      {/* Scope */}
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
                      {/* Bobot */}
                      <td className="border border-gray-200 py-2 px-1.5 text-center">
                        {isEditing && isFieldEditable("bobot")
                          ? <select value={row.bobot} onChange={(e) => setDraftField({ bobot: e.target.value })} className={cellInput + " text-center font-bold text-[#1A284F]"}>
                              <option value="">— Bobot —</option>
                              {BOBOT_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
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
                              {POLARITAS_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
                            : ((row as Record<string, unknown>)[key] as string) ?? "";
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
                                      setDraftField({ cascadingMap: { ...(draft?.cascadingMap ?? {}), [key]: newVal } });
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
                      {/* Aksi — hidden in preview mode or when approved/validated */}
                      {showAksi && (
                        <td className="border border-gray-200 py-2 px-1.5 bg-white text-center">
                          {isEditing ? (
                            <div className="flex flex-col gap-1 items-center">
                              <button onClick={saveEdit} className="w-full px-2 py-1 rounded text-[10px] font-bold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">Save</button>
                              <button onClick={cancelEdit} className="w-full px-2 py-1 rounded text-[10px] font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => startEdit(item)}
                                title={ct === "FC" ? "Edit Cascading (FC — data fields read-only)" : ct ? "Edit Cascading" : "Edit"}
                                className="p-1.5 rounded-lg hover:bg-[#1A284F]/10 text-[#1A284F] transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {(!ct || ct === "CC") && (
                                <button onClick={() => onDeleteItem?.(item.id)} title="Delete"
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
    </div>
    </div>

    {/* Target Edit Mini Modal — opens from Target 2026 cell in edit mode */}
    {corpTargetEdit && (
      <TargetEditMiniModal
        item={corpTargetEdit}
        onSave={(updates) => { setDraftField(updates); setCorpTargetEdit(null); }}
        onClose={() => setCorpTargetEdit(null)}
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

function KPISection({ initialItems, isPersonal, isCorporate, hideCascading, divisionApproved = true, useValidateTerms = false, onTabStatusChange, onItemsChange, sectionCascadeMap, onSectionCascadeChange, parentSectionCascadeMap, editedSectionBobots, onSectionBobotChange }: {
  initialItems: KPISetting[]; isPersonal: boolean; isCorporate?: boolean; hideCascading?: boolean; divisionApproved?: boolean; useValidateTerms?: boolean;
  onTabStatusChange?: (s: TabStatus) => void;
  onItemsChange?: (items: KPISetting[]) => void;
  sectionCascadeMap?: Record<string, string>;
  onSectionCascadeChange?: (sec: string, val: string) => void;
  parentSectionCascadeMap?: Record<string, string>;
  editedSectionBobots?: Record<string, string>;
  onSectionBobotChange?: (sec: string, val: string) => void;
}) {
  const [view, setView]               = useState<PageView>("input");
  const [items, setItems_]            = useState<KPISetting[]>(initialItems);

  const setItems = (updater: KPISetting[] | ((prev: KPISetting[]) => KPISetting[])) => {
    setItems_((prev) => typeof updater === "function" ? updater(prev) : updater);
  };

  useEffect(() => {
    onItemsChange?.(items);
  }, [items]);
  const [editingItem, setEditingItem] = useState<KPISetting | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const readPersonalWorkflowState = () => {
    if (isCorporate) return { isSub: false, isApp: false, rec: undefined as ReturnType<typeof loadWorkflowRecords>[number] | undefined, storedItems: null as KPISetting[] | null };
    const u = getActiveUser();
    const normId = normalizeEmployeeId(u.employeeId);
    let storedItems: KPISetting[] | null = null;
    try {
      const raw = localStorage.getItem("pa_kpi_setting_by_emp_v2");
      const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
      if (Array.isArray(map[normId]) && map[normId].length > 0) {
        storedItems = map[normId];
      }
    } catch {
      // ignore
    }
    const rec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "KPI" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === u.employeeId.toLowerCase()),
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
  const [showTargetEditRequest, setShowTargetEditRequest] = useState(false);
  const [showTargetEditSuccess, setShowTargetEditSuccess] = useState(false);
  const [pendingTargetEditRequest, setPendingTargetEditRequest] = useState(false);
  const [targetEditApproved, setTargetEditApproved]     = useState(false);
  const [monthlyTargetPending, setMonthlyTargetPending] = useState(false);
  const [showMonthlyTargetEdit, setShowMonthlyTargetEdit] = useState(false);
  const [selectedTargetKpis, setSelectedTargetKpis]     = useState<string[]>([]);
  const [targetEditCategory, setTargetEditCategory]     = useState("");
  const [targetEditReason, setTargetEditReason]         = useState("");

  useEffect(() => {
    const init = readPersonalWorkflowState();
    if (init.storedItems) {
      setItems_(init.storedItems);
    }
    const onSync = () => {
      const st = readPersonalWorkflowState();
      setSubmitted(st.isSub);
      setKpiApproved(st.isApp);
      setWfRecState(st.rec);
      if (st.storedItems) {
        setItems_(st.storedItems);
      }
      if (st.rec && !st.isSub) {
        // Jika dikembalikan untuk Revision, buka kembali ke mode input
        setView("input");
      }
    };
    window.addEventListener("pa-auth-updated", onSync);
    window.addEventListener("appraisal-updated", onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener("pa-auth-updated", onSync);
      window.removeEventListener("appraisal-updated", onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener("storage", onSync);
    };
  }, [isCorporate]);

  useEffect(() => {
    let ts: TabStatus = "idle";
    if (submitted && !kpiApproved) ts = "pending";
    else if (kpiApproved) {
      if (pendingTargetEditRequest || monthlyTargetPending) ts = "pending-target";
      else ts = "approved";
    }
    onTabStatusChange?.(ts);
  }, [submitted, kpiApproved, pendingTargetEditRequest, monthlyTargetPending]);

  const totalBobot = items.reduce((sum, item) => {
    const n = parseFloat(item.bobot.replace("%", "")) || 0;
    return sum + n;
  }, 0);

  const handleConfirm = () => { setShowConfirm(false); setShowSuccess(true); };
  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setView("preview");
    const u = getActiveUser();
    const normId = normalizeEmployeeId(u.employeeId);
    const todayStr = formatTodayDDMMYYYY();
    try {
      const raw = localStorage.getItem("pa_kpi_setting_by_emp_v2");
      const map = raw ? (JSON.parse(raw) as Record<string, KPISetting[]>) : {};
      map[normId] = items;
      savePersistedState("pa_kpi_setting_by_emp_v2", map);
    } catch {
      // ignore
    }
    submitWorkflowModule("KPI", "setting", todayStr, u.employeeId);
    setWfRecState(readPersonalWorkflowState().rec);
  };

  const handleExport = () => {
    if (isCorporate) {
      const headers = ["No","Section","Perspektif","KPI","Satuan","Formula Setahun","Scope","Bobot","Definisi","Source","Polaritas","Detail Formula","Baseline 2025","Target 2026","Tracking Period","COO","GM Industry","GM Perkebunan","GM ASD","GM RSTM","GM GHS"];
      const rows = items.map((i) => [i.no, `${i.section}. ${CORP_SECTION_META[i.section]?.label ?? i.section}`, i.perspektif, i.kpi, i.satuan, i.formula, i.scope ?? "", i.bobot, i.definisi, i.source, i.polaritas, i.detailFormula, i.baseline2025, i.target2026, i.trackingPeriod ?? "", i.coo ?? "", i.gmVgmIndustry ?? "", i.gmVgmPerkebunan ?? "", i.gmAsd ?? "", i.gmRstm ?? "", i.gmGhs ?? ""]);
      exportXLSX("KPI_Bisnis_RSUP_Group_2026.xlsx", headers, rows);
    } else {
      const headers = ["No","Section","Perspektif","KPI","Satuan","Formula","Bobot","Definisi","Source","Baseline 2025","Target 2026","Polaritas","Detail Formula","Keterangan"];
      const rows = items.map((i) => [i.no, `Section ${i.section}`, i.perspektif, i.kpi, i.satuan, i.formula, i.bobot, i.definisi, i.source, i.baseline2025, i.target2026, i.polaritas, i.detailFormula, i.keterangan]);
      exportXLSX("KPI_Setting_2026.xlsx", headers, rows);
    }
  };

  const handleImport = async (file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      const col = (pat: RegExp) => headers.findIndex((h) => pat.test(h.trim()));
      const noI = col(/^no$/i), sectionI = col(/section/i), perspektifI = col(/perspektif/i),
        kpiI = col(/^kpi$/i), satuanI = col(/satuan/i), formulaI = col(/formula/i),
        bobotI = col(/bobot/i), definisiI = col(/definisi/i), sourceI = col(/source/i),
        baseI = col(/baseline/i), targetI = col(/target/i), polarI = col(/polaritas/i),
        detailI = col(/detail/i), ketI = col(/keterangan/i);
      const g = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
      const imported: KPISetting[] = rows.filter((r) => r.some((c) => c.trim())).map((r, idx) => ({
        id: `imported-${Date.now()}-${idx}`,
        no: g(r, noI) || String(idx + 1),
        section: (g(r, sectionI).toUpperCase().match(/[A-Z]/)?.[0] as "A" | "B") ?? "B",
        perspektif: g(r, perspektifI),
        kpi: g(r, kpiI),
        satuan: g(r, satuanI),
        formula: g(r, formulaI),
        bobot: g(r, bobotI),
        definisi: g(r, definisiI),
        source: g(r, sourceI),
        baseline2025: g(r, baseI),
        target2026: g(r, targetI),
        polaritas: (g(r, polarI) as "Maximize" | "Minimize") || "Maximize",
        detailFormula: g(r, detailI),
        keterangan: g(r, ketI),
        monthlyTargets: {},
        colorIndicator: false,
        indicatorMode: "numeric" as const,
      }));
      if (imported.length > 0) setItems(imported);
    } catch { /* ignore parse errors */ }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Up-to-date Approval Status Bar (Submitted -> HR Unit Check -> Approver 1 -> Approver 2 -> HR ICF Validate) */}
      {!isCorporate && (
        <ModuleApprovalStatusBar
          module="KPI"
          phase="setting"
          submittedOverride={submitted}
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
            Object.entries(CORP_SECTION_META).map(([sec, meta]) => (
              <div key={sec} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ background: meta.bg }}>{sec}</span>
                <span className="text-[11px] font-semibold text-gray-600">{meta.label}</span>
                <span className="text-[11px] text-gray-400">·</span>
                <span className="text-[11px] font-bold text-[#1A284F]">{items.filter((i) => i.section === sec).length} KPI</span>
                <span className="text-[10px] text-gray-400">({meta.bobot})</span>
              </div>
            ))
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
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${totalBobot === 100 ? "bg-green-50" : "bg-orange-50"}`}>
                <span className={`text-xs font-bold ${totalBobot === 100 ? "text-green-700" : "text-orange-700"}`}>Total Bobot:</span>
                <span className={`text-sm font-bold ${totalBobot === 100 ? "text-green-700" : "text-orange-700"}`}>{totalBobot}%</span>
                {totalBobot !== 100 && <span className="text-[10px] text-orange-600">(should be 100%)</span>}
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Non-corporate pre-submit flow */}
          {!isCorporate && view === "input" && !submitted && (
            <>
              <button onClick={() => !isPersonal || divisionApproved ? setShowAddModal(true) : undefined}
                disabled={isPersonal && !divisionApproved}
                title={isPersonal && !divisionApproved ? "KPI Division harus disetujui terlebih dahulu" : ""}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus className="w-4 h-4" /> Add KPI
              </button>
              <button onClick={() => setView("preview")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
                <Send className="w-4 h-4" /> Submit KPI
              </button>
            </>
          )}
          {!isCorporate && view === "preview" && !submitted && (
            <>
              <button onClick={() => setView("input")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Edit3 className="w-4 h-4" /> Back
              </button>
              <button onClick={() => setShowConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
                <Send className="w-4 h-4" /> Submit KPI
              </button>
            </>
          )}
          {/* General Edit Request (submitted, not yet approved) */}
          {!isCorporate && submitted && !kpiApproved && !pendingEditRequest && (
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
              <button onClick={() => setPendingTargetEditRequest(false)}
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

          {!isCorporate && <ExportImportButton onExport={handleExport} onImport={handleImport} />}
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

      {isCorporate ? (
        <CorporateKPITable
          items={items}
          onUpdateItem={(id, updates) => setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))}
          onDeleteItem={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onAddClick={() => setShowAddModal(true)}
          onSubmit={() => setShowConfirm(true)}
          onExport={handleExport}
          onImport={handleImport}
          submitted={submitted}
          hideCascading={hideCascading}
          kpiApproved={kpiApproved}
          targetEditApproved={targetEditApproved}
          onEditTargetRequest={useValidateTerms ? undefined : () => setShowTargetEditRequest(true)}
          sectionCascadeMap={sectionCascadeMap}
          onSectionCascadeChange={onSectionCascadeChange}
          parentSectionCascadeMap={parentSectionCascadeMap}
          editedSectionBobots={editedSectionBobots}
          onSectionBobotChange={onSectionBobotChange}
        />
      ) : (
        <KPISettingTable
          items={items}
          editable={view === "input" && !submitted}
          onDelete={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onUpdateItem={(id, updates) => setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))}
          hideCascading={hideCascading}
        />
      )}
      {showAddModal && isCorporate && (
        <AddCorporateKPIModal existingItems={items} onAdd={(item) => setItems((p) => [...p, item])} onClose={() => setShowAddModal(false)} />
      )}
      {showAddModal && !isCorporate && (
        <AddKPIModal existingItems={items} onAdd={(item) => setItems((p) => [...p, item])} onClose={() => setShowAddModal(false)} onSectionCascade={onSectionCascadeChange} />
      )}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} validateMode={useValidateTerms} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} validateMode={useValidateTerms} />}
      {showEditRequest && (
        <EditRequestModal
          onCancel={() => setShowEditRequest(false)}
          onConfirm={() => { setShowEditRequest(false); setShowEditRequestSuccess(true); }}
        />
      )}
      {showEditRequestSuccess && (
        <EditRequestSuccessModal onClose={() => { setShowEditRequestSuccess(false); setPendingEditRequest(true); }} />
      )}
      {showTargetEditRequest && (
        <EditTargetRequestModal
          items={items}
          onCancel={() => setShowTargetEditRequest(false)}
          onConfirm={(cat, reason, _files, kpis) => {
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
          onSave={(updated) => setItems(updated)}
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

export function SupervisorSettingKPIPage({ personalOnly: personalOnlyProp = false }: { personalOnly?: boolean } = {}) {
  const activeUser = getActiveUser();
  const isDirectorMode = !personalOnlyProp && isDirectorRoleOrGrouping(activeUser);
  const isGmMode = !personalOnlyProp && !isDirectorMode && activeUser.role === "GM";
  const personalOnly = personalOnlyProp || (!isDirectorMode && !isGmMode);
  const defaultFirstTab: KPITab = personalOnly
    ? "personal"
    : isGmMode
    ? "pak-amir"
    : "corporate";
  const [routeKpiTab, setActiveTab]         = useRouteTab<KPITab>(["corporate", "pak-anton", "pak-amir", "division", "department", "personal"], defaultFirstTab);
  const activeTab: KPITab                   = personalOnly ? "personal" : routeKpiTab;
  const [personalTabStatus, setPersonalTabStatus]   = useState<TabStatus>("idle");
  const [divisionTabStatus, setDivisionTabStatus]   = useState<TabStatus>("approved");
  const [corporateTabStatus, setCorporateTabStatus] = useState<TabStatus>("idle");
  const [pakAntonTabStatus, setPakAntonTabStatus]   = useState<TabStatus>("idle");
  const [pakAmirTabStatus, setPakAmirTabStatus]     = useState<TabStatus>("idle");
  const [businessItems, setBusinessItems]           = useState<KPISetting[]>(CORPORATE_KPI);
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
    const v = (item as Record<string, unknown>)[SUPERVISOR_ROLE_KEY] as string | undefined;
    return (v as "FC" | "PC" | "CC") || null;
  };

  const tabStatusMap: Record<KPITab, TabStatus> = {
    personal:    personalTabStatus,
    department:  "idle",
    division:    divisionTabStatus,
    corporate:   corporateTabStatus,
    "pak-anton": pakAntonTabStatus,
    "pak-amir":  pakAmirTabStatus,
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
    const v = (item as Record<string, unknown>)[PAK_MADE_ROLE_KEY] as string | undefined;
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
    "pak-amir":  isGmMode ? false : (!corpValidated || !pakAntonValidated),
    division:    !corpValidated || !pakAntonValidated || !pakAmirApproved,
    personal:    isDirectorMode || isGmMode ? false : (!corpValidated || !pakAntonValidated || !pakAmirApproved || !divisionApproved),
    department:  false,
  };

  // validate-mode tabs (Business + Pak Anton) use "Validated" terminology
  const useValidateMap: Record<KPITab, boolean> = {
    corporate: !isDirectorMode, "pak-anton": true,
    "pak-amir": false, division: false, personal: false, department: false,
  };

  const handleTabClick = (id: KPITab) => {
    if (!tabLocked[id]) setActiveTab(id);
  };

  // A locked tab opened directly by URL falls back to the first (always open) tab.
  const activeTabLocked = tabLocked[activeTab];
  useEffect(() => {
    if (!personalOnly && activeTabLocked) setActiveTab(isGmMode ? "pak-amir" : "corporate");
    if (isGmMode && activeTab !== "pak-amir" && activeTab !== "personal") setActiveTab("pak-amir");
    if (isDirectorMode && activeTab !== "corporate" && activeTab !== "personal") setActiveTab("corporate");
  }, [personalOnly, activeTabLocked, activeTab, isGmMode, isDirectorMode, setActiveTab]);

  const visibleTabDefs: { id: KPITab; label: string }[] = isDirectorMode
    ? [
        { id: "corporate", label: "KPI (Group)" },
        { id: "personal",  label: "KPI (Personal)" },
      ]
    : isGmMode
    ? [
        { id: "pak-amir", label: "KPI (Unit)" },
        { id: "personal", label: "KPI (Personal)" },
      ]
    : TAB_DEFS;

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Setting</h1>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — KPI Configuration</p>
          {isDirectorMode && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              Role Director ({getGroupNameForUnit(activeUser.company)}) — 2 Tab: KPI (Group) [Director Submit → HR ICF Validate] &amp; KPI (Personal)
            </span>
          )}
          {isGmMode && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Role GM ({activeUser.company}) — 2 Tab: KPI (Unit) [GM Submit → Director Approve → HR ICF Validate] &amp; KPI (Personal)
            </span>
          )}
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
          initialItems={CORPORATE_KPI}
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
          key={`pak-anton-${corpValidated ? "validated" : "pending"}-${businessItems.map(i => `${i.id}:${(i as Record<string,unknown>)["coo"] ?? ""}:${JSON.stringify(i.cascadingMap ?? {})}`).join("|")}-${JSON.stringify(sectionCascadeMap)}`}
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
      {activeTab === "pak-amir" && (
        <KPISection
          key={`pak-amir-${isGmMode ? "gm" : pakAntonValidated ? "validated" : "pending"}-${pakAmirInitialItems.map(i => i.id).join("|")}`}
          initialItems={isGmMode ? CORPORATE_KPI : pakAmirInitialItems}
          isPersonal={false}
          isCorporate={true}
          useValidateTerms={false}
          onTabStatusChange={setPakAmirTabStatus}
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
          key="personal"
          initialItems={personalOnly || isDirectorMode || isGmMode ? PERSONAL_KPI : []}
          isPersonal={true}
          isCorporate={false}
          divisionApproved={personalOnly || isDirectorMode || isGmMode ? true : divisionApproved}
          useValidateTerms={false}
          hideCascading={personalOnly || isDirectorMode || isGmMode}
          onTabStatusChange={setPersonalTabStatus}
        />
      )}
    </div>
  );
}
