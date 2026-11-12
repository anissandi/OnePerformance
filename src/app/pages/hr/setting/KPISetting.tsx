import React, { useState, useEffect } from "react";
import { useRouteTab } from "../../../utils/useRouteTab";
import { CheckCircle2, X, RotateCcw, Download, FileSearch, Copy, UserCheck, ShieldCheck, Layers } from "lucide-react";
import { toast } from "sonner";
import { loadPersistedState, savePersistedState } from "../../../services/supabaseClient";
import {
  getActiveUser,
  getGroupCompaniesForUnit,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
  loadManagedUsers,
  RSUP_GROUP_COMPANIES,
} from "../../../store/authStore";
import {
  loadKpiValidationChecklist,
  saveKpiValidationChecklist,
  type KpiHierarchyValidationChecklist,
} from "../ModuleActivation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Polaritas = "Maximize" | "Minimize";
type PageView = "input" | "preview";
type KPITab = "business";

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
  // Corporate / Business fields
  scope?: string;
  trackingPeriod?: string;
  coo?: string;
  gmVgmIndustry?: string;
  gmVgmPerkebunan?: string;
  gmAsd?: string;
  gmRstm?: string;
  gmGhs?: string;
}


// ─── Data sets per tab ────────────────────────────────────────────────────────

const CORPORATE_KPI: KPISetting[] = [
  // ── A. Kinerja K3L Terintegrasi (SMK3/HSE) — 15% ──────────────────────────
  { id: "c1a", no: "1a", section: "A", perspektif: "Proses", kpi: "Fatality Accident", satuan: "Kasus/bulan", formula: "Jumlah", bobot: "5%", definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja", source: "Laporan Komite K3", baseline2025: "1", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah kasus kecelakaan kerja (RSUP IND + RSUP PKB + ASD + RSTM + GHS)", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1b", no: "1b", section: "A", perspektif: "Proses", kpi: "Lost Time Injury", satuan: "Hari/bulan", formula: "Rata-Rata", bobot: "4%", definisi: "Cedera akibat kecelakaan kerja yang menyebabkan pekerja tidak dapat bekerja setidaknya satu shift penuh setelah kejadian tersebut", source: "Laporan Komite K3", baseline2025: "5.873", target2026: "6.948", polaritas: "Minimize", detailFormula: "Jumlah hari hilang akibat LTI (RSUP IND + RSUP PKB + ASD + RSTM + GHS)", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1c", no: "1c", section: "A", perspektif: "Proses", kpi: "Fire Accident", satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%", definisi: "Jumlah kebakaran bangunan", source: "Laporan Komite K3", baseline2025: "0", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah kasus kebakaran bangunan (RSUP IND + RSUP PKB + ASD + RSTM + GHS)", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1d", no: "1d", section: "A", perspektif: "Proses", kpi: "Karhutla", satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%", definisi: "Jumlah kebakaran hutan", source: "Laporan Komite K3", baseline2025: "0", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah kasus kebakaran hutan (RSUP PKB + ASD + RSTM + GHS)", keterangan: "", scope: "RSUP Perkebunan, ASD, RSTM, GHS", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1e", no: "1e", section: "A", perspektif: "Proses", kpi: "Proper Result", satuan: "%/Kategori", formula: "Nilai Akhir", bobot: "2%", definisi: "Hasil penilaian PROPER (Program Penilaian Peringkat Kinerja Perusahaan dalam Pengelolaan Lingkungan Hidup) yang dikeluarkan oleh KLHK", source: "Laporan LH", baseline2025: "Biru", target2026: "Biru", polaritas: "Maximize", detailFormula: "Pencapaian nilai PROPER di RSUP perkebunan + RSTM + GHS; Biru=100%, Merah=75%, Hitam=0%", keterangan: "", scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1f", no: "1f", section: "A", perspektif: "Proses", kpi: "GHG Reduction", satuan: "tonCo2-eq/bulan", formula: "Rata-Rata", bobot: "0%", definisi: "Pengurangan emisi gas rumah kaca yang diukur sebagai indikator kinerja organisasi", source: "Laporan Komite Energy", baseline2025: "230.973", target2026: "219.652", polaritas: "Minimize", detailFormula: "Jumlah Emisi Gas Rumah Kaca (Boiler Biomasa + PLTD + PLTU + Dapur Arang + Alat Berat + Freon)", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c1g", no: "1g", section: "A", perspektif: "Proses", kpi: "SIMATAG - 0.4m Report", satuan: "%/bulan", formula: "Rata-rata", bobot: "0%", definisi: "Tingkat kepatuhan unit kerja dalam menyusun dan menyampaikan laporan pemantauan muka air tanah gambut dengan ambang batas 0,4 meter sesuai standar format dan jadwal yang ditetapkan", source: "Laporan LH", baseline2025: "100%", target2026: "100%", polaritas: "Minimize", detailFormula: "Rata-rata pencapaian tingkat kepatuhan laporan RSUP Perkebunan + RSTM + GHS", keterangan: "", scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  // ── B. Finansial — 40% ─────────────────────────────────────────────────────
  { id: "c2a", no: "2a", section: "B", perspektif: "Finansial", kpi: "Net Profit (Miliar)", satuan: "Rp/bulan", formula: "Jumlah", bobot: "10%", definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaran biaya, bunga dan pajak RSUP Group", source: "Laporan Keuangan RSUP Group", baseline2025: "687,3", target2026: "750,0", polaritas: "Maximize", detailFormula: "Jumlah laba bersih perusahaan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "FC", gmAsd: "FC", gmRstm: "FC", gmGhs: "FC" },
  { id: "c2b", no: "2b", section: "B", perspektif: "Finansial", kpi: "ROA (Return on Assets)", satuan: "%/bulan", formula: "Rata-Rata", bobot: "5%", definisi: "Rasio keuangan yang mengukur kemampuan perusahaan menghasilkan laba bersih dari total aset yang dimiliki", source: "Laporan Keuangan RSUP Industry", baseline2025: "17,17%", target2026: "15%", polaritas: "Maximize", detailFormula: "Laba bersih / Total Asset x 100%", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c2c", no: "2c", section: "B", perspektif: "Finansial", kpi: "EBITDA (Miliar)", satuan: "Rp/bulan", formula: "Jumlah", bobot: "10%", definisi: "Laba Bersih Perusahaan sebelum dikurangi pengeluaran biaya, bunga dan pajak RSUP Group", source: "Laporan Keuangan RSUP Group", baseline2025: "1.017", target2026: "1.050", polaritas: "Maximize", detailFormula: "Total EBITDA perusahaan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c3a", no: "3a", section: "B", perspektif: "Finansial", kpi: "Overhead Cost (000)", satuan: "Rp/bulan", formula: "Rata-rata", bobot: "3%", definisi: "Biaya tidak langsung yang diperlukan untuk menjalankan operasi perusahaan, tetapi tidak dapat ditelusuri langsung ke produk, layanan, atau aktivitas tertentu", source: "Laporan Keuangan RSUP Group", baseline2025: "142.854.218", target2026: "191.286.313", polaritas: "Minimize", detailFormula: "Jumlah Overhead cost (RSUP IND + RSUP PKB + RSUP ASD + RSTM + GHS)", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c3b", no: "3b", section: "B", perspektif: "Finansial", kpi: "Cost Meat Preparation", satuan: "Rp/kg WM/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Total biaya yang dikeluarkan untuk mempersiapkan daging kepala (meat preparation) sebelum digunakan dalam proses produksi", source: "Laporan Keuangan RSUP Industry (ACC/MPD)", baseline2025: "1.452", target2026: "1.500", polaritas: "Minimize", detailFormula: "Rata-rata cost Meat Preparation per bulan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c3c", no: "3c", section: "B", perspektif: "Finansial", kpi: "Cost Utility", satuan: "Rp/kg Kelapa/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Biaya operasional seperti biaya listrik, air, gas, energi lainnya (solar), serta biaya perawatan lainnya", source: "Laporan Keuangan RSUP Industry (ACC/Utility)", baseline2025: "430", target2026: "472", polaritas: "Minimize", detailFormula: "Jumlah cost Utility", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c3d", no: "3d", section: "B", perspektif: "Finansial", kpi: "Reject Non Process (Kb-A to B)", satuan: "%/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Jumlah kelapa downgrade bukan karena proses produksi, melainkan karena faktor-faktor non-proses seperti kualitas awal, kerusakan fisik, kontaminasi atau kriteria reject lainnya", source: "Laporan MPD + RMD", baseline2025: "13,80%", target2026: "7,50%", polaritas: "Minimize", detailFormula: "Rata-rata jumlah kelapa reject dari Kb-A ke Kb-B", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c3e", no: "3e", section: "B", perspektif: "Finansial", kpi: "HPP Kelapa RSUP Group - Gabungan", satuan: "Rp/kg/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Total biaya yang dikeluarkan untuk menghasilkan produk berbasis kelapa, mulai dari bahan baku, tenaga kerja, utilitas, hingga overhead", source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "2.849", target2026: "6.794", polaritas: "Minimize", detailFormula: "Nilai HPP Kelapa (RSUP PKB + RSTM + GHS)", keterangan: "", scope: "RSUP Perkebunan, RSTM, GHS", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c3f", no: "3f", section: "B", perspektif: "Finansial", kpi: "HPP Nenas RSUP", satuan: "Rp/butir/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Total biaya yang dikeluarkan untuk menghasilkan produk berbasis nenas, mulai dari bahan baku, tenaga kerja, utilitas hingga overhead", source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "1.776", target2026: "3.804", polaritas: "Minimize", detailFormula: "Nilai HPP Nenas selama periode satu bulan", keterangan: "", scope: "RSUP Perkebunan", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "", gmGhs: "" },
  { id: "c3g", no: "3g", section: "B", perspektif: "Finansial", kpi: "HPP Bibit", satuan: "Rp/bibit/bulan", formula: "Rata-rata", bobot: "2%", definisi: "Total biaya yang dikeluarkan untuk menghasilkan bibit, mulai dari bahan baku, tenaga kerja, utilitas, hingga overhead", source: "Laporan Keuangan RSUP Perkebunan", baseline2025: "41.764", target2026: "45.000", polaritas: "Minimize", detailFormula: "Nilai HPP Bibit selama periode satu bulan", keterangan: "", scope: "RSUP ASD", trackingPeriod: "Bulanan", coo: "", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  // ── C. Produksi — 30% ──────────────────────────────────────────────────────
  { id: "c4a", no: "4a", section: "C", perspektif: "Proses", kpi: "Coconut Process", satuan: "Butir/bulan", formula: "Jumlah", bobot: "3%", definisi: "Jumlah kelapa utuh yang berhasil diterima selama periode tertentu", source: "Laporan PIC/RMD", baseline2025: "409.930.558", target2026: "460.000.000", polaritas: "Maximize", detailFormula: "Total kelapa yang berhasil diterima dalam setiap periode", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "CC", gmGhs: "CC" },
  { id: "c4b", no: "4b", section: "C", perspektif: "Proses", kpi: "Efficiency White Meat", satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Efisiensi hasil white meat yang diperoleh dari proses pengolahan kelapa dibandingkan dengan total input kelapa", source: "Laporan MPD", baseline2025: "0,31", target2026: "0,31", polaritas: "Maximize", detailFormula: "Total output white meat / Total olah kelapa utuh", keterangan: "", scope: "MPD", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c4c", no: "4c", section: "C", perspektif: "Proses", kpi: "Efficiency Coconut Water", satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Efisiensi perolehan coconut water dari proses pengolahan kelapa", source: "Laporan MPD", baseline2025: "0,23", target2026: "0,26", polaritas: "Maximize", detailFormula: "Total output coconut water / Total olah kelapa utuh", keterangan: "", scope: "MPD", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c4d", no: "4d", section: "C", perspektif: "Proses", kpi: "Efficiency Santan", satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat efisiensi proses produksi santan dibandingkan dengan target atau standar hasil yang ditetapkan", source: "Laporan WCC", baseline2025: "79,28", target2026: "79,28", polaritas: "Maximize", detailFormula: "Total actual produksi santan / Target", keterangan: "", scope: "WCC", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c5a", no: "5a", section: "C", perspektif: "Proses", kpi: "Pineapple Process", satuan: "pcs/bulan", formula: "Jumlah", bobot: "3%", definisi: "Jumlah buah nanas (butir) yang berhasil diterima selama periode tertentu", source: "Laporan PJD/RMR", baseline2025: "12.952.614", target2026: "17.270.906", polaritas: "Maximize", detailFormula: "Total nenas yang berhasil diterima dalam setiap periode", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "", gmGhs: "" },
  { id: "c5b", no: "5b", section: "C", perspektif: "Proses", kpi: "Efficiency Pineapple Meat (PSP+PJC)", satuan: "%/bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat efisiensi proses produksi santan dibandingkan dengan target atau standar hasil yang ditetapkan", source: "Laporan PSP + PJC", baseline2025: "52,76", target2026: "52,95", polaritas: "Maximize", detailFormula: "Rata-rata efficiency pineapple meat (PSP & PJC)", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c6a", no: "6a", section: "C", perspektif: "Proses", kpi: "Coconut Production (Grade A+B)", satuan: "kg/Bulan", formula: "Jumlah", bobot: "3%", definisi: "Total produksi atau panen kelapa Grade A dan B sesuai target yang direncanakan", source: "Laporan Grade", baseline2025: "15.552.425", target2026: "19.868.034", polaritas: "Maximize", detailFormula: "Jumlah panen kelapa Grade A dan B / Target panen kelapa", keterangan: "", scope: "RSUP Perkebunan, GHS, RSTM", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c6b", no: "6b", section: "C", perspektif: "Proses", kpi: "Pineapple Production (Grade N1-N5)", satuan: "butir/Bulan", formula: "Jumlah", bobot: "3%", definisi: "Total produksi atau panen nanas Grade N1 sampai N5 sesuai target yang direncanakan", source: "Laporan Penjualan", baseline2025: "10.659.453", target2026: "13.168.567", polaritas: "Maximize", detailFormula: "Jumlah Panen Nanas Grade N1-N5 / target panen nenas", keterangan: "", scope: "RSUP Perkebunan", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c7", no: "7", section: "C", perspektif: "Proses", kpi: "Replanting RSUP PKB, ASD dan GHS", satuan: "ha/bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Luas area kelapa yang telah di replanting sesuai target yang direncanakan", source: "Laporan RSUP PKB, ASD, GHS", baseline2025: "1.226,50", target2026: "2.473,20", polaritas: "Maximize", detailFormula: "Realisasi luas area yang telah di replanting / Target area replanting", keterangan: "", scope: "RSUP Perkebunan, RSUP ASD, GHS", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "CC", gmAsd: "CC", gmRstm: "CC", gmGhs: "CC" },
  { id: "c8", no: "8", section: "C", perspektif: "Proses", kpi: "Coconut Fertilizer Application (TM & TBM)", satuan: "kg/Bulan", formula: "Rata-rata", bobot: "3%", definisi: "Tingkat realisasi pemupukan kelapa sesuai standar direkomendasikan oleh ASD", source: "Laporan ASD", baseline2025: "N/A", target2026: "4.610.094", polaritas: "Maximize", detailFormula: "Realisasi area pemupukan kelapa yang berhasil dilakukan / Target rekomendasi dari ASD", keterangan: "", scope: "RSUP Perkebunan", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  // ── D. Be Employer of Choices — 9% ────────────────────────────────────────
  { id: "c9a", no: "9a", section: "D", perspektif: "Learning & Growth", kpi: "Employee Turn Over", satuan: "Jumlah", formula: "Nilai Akhir", bobot: "3%", definisi: "Jumlah karyawan keluar dibandingkan total karyawan aktif dalam periode tertentu", source: "Laporan HRD", baseline2025: "937", target2026: "837", polaritas: "Minimize", detailFormula: "Jumlah karyawan keluar pada periode tertentu", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "FC", gmAsd: "FC", gmRstm: "FC", gmGhs: "FC" },
  { id: "c9b", no: "9b", section: "D", perspektif: "Learning & Growth", kpi: "Employee Engagement Score", satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "2%", definisi: "Mengukur tingkat keterikatan emosional, komitmen, motivasi, dan kepuasan karyawan terhadap pekerjaan dan organisasi", source: "Laporan HRD", baseline2025: "83%", target2026: "84%", polaritas: "Maximize", detailFormula: "(Jumlah skor aktual / jumlah skor maksimal) x 100%", keterangan: "", scope: "RSUP Group", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c9c", no: "9c", section: "D", perspektif: "Learning & Growth", kpi: "MT For Industry & Plantations", satuan: "Batch", formula: "Nilai Akhir", bobot: "2%", definisi: "Jumlah Batch TMT yang berhasil dijalankan dalam satu tahun", source: "Laporan HRD", baseline2025: "5", target2026: "6", polaritas: "Maximize", detailFormula: "Jumlah MT Perkebunan + Jumlah MT Industri", keterangan: "", scope: "RSUP Group", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c9d", no: "9d", section: "D", perspektif: "Learning & Growth", kpi: "Hard & Soft Skill Training", satuan: "Jumlah", formula: "Nilai Akhir", bobot: "2%", definisi: "Jumlah training yang dilaksanakan dalam satu tahun", source: "Laporan HRD", baseline2025: "1.758", target2026: "1.722", polaritas: "Maximize", detailFormula: "Jumlah Training Perkebunan + Jumlah Training Industri", keterangan: "", scope: "RSUP Group", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  // ── E. Be Partner of Choices — 6% ─────────────────────────────────────────
  { id: "c10a", no: "10a", section: "E", perspektif: "Customer", kpi: "Customer Complain", satuan: "Kasus/bulan", formula: "Jumlah", bobot: "2%", definisi: "Jumlah kasus ketidakpuasan pelanggan terhadap produk, layanan, atau pengalaman yang diterima konsumen", source: "Laporan QA", baseline2025: "11", target2026: "8", polaritas: "Minimize", detailFormula: "Jumlah complaint dari pelanggan yang diterima perusahaan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "FC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c10b", no: "10b", section: "E", perspektif: "Customer", kpi: "Customer Incidents >50jt", satuan: "Jumlah", formula: "Jumlah", bobot: "2%", definisi: "Jumlah insiden pelanggan yang berdampak finansial besar (di atas Rp50 juta) dalam periode tertentu", source: "Laporan QA", baseline2025: "1", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah Customer Incidents dengan nilai kerugian > Rp50.000.000", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c11", no: "11", section: "E", perspektif: "Customer", kpi: "3rd Party Certification", satuan: "Nilai Akhir", formula: "Nilai Akhir", bobot: "2%", definisi: "Tingkat kepatuhan dan keberlangsungan sertifikasi dari pihak ketiga yang relevan dengan bisnis perusahaan (seperti ISO, dll)", source: "Laporan QS", baseline2025: "100%", target2026: "100%", polaritas: "Maximize", detailFormula: "Jumlah sertifikasi Perusahaan ≥ Jumlah sertifikasi Industri; Pencapaian = Jumlah Sertifikasi aktif / Jumlah Sertifikasi yang Dipersyaratkan", keterangan: "", scope: "RSUP Group", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c12a", no: "12a", section: "E", perspektif: "Customer", kpi: "Pro-Active CSR Program linked to Business Growth", satuan: "Jumlah", formula: "Nilai Akhir", bobot: "0%", definisi: "Persentase program CSR yang secara langsung mendukung pertumbuhan bisnis perusahaan (branding, market access, revenue, dll)", source: "Laporan TRRA", baseline2025: "5", target2026: "4", polaritas: "Maximize", detailFormula: "Jumlah Perusahaan ≥ Jumlah Program CSR yang Terkait Business Growth / Total Program CSR", keterangan: "", scope: "RSUP Perkebunan, GHS, RSTM", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c12b", no: "12b", section: "E", perspektif: "Customer", kpi: "10:1 Ratio Positive Over Negative Media", satuan: "Konten/Berita", formula: "Jumlah", bobot: "0%", definisi: "Perbandingan jumlah pemberitaan media positif dibandingkan pemberitaan negatif tentang perusahaan", source: "Laporan Comcom", baseline2025: "6:1", target2026: "6:1", polaritas: "Maximize", detailFormula: "Jumlah Perusahaan ≥ Jumlah Berita Positif / Jumlah Berita Negatif", keterangan: "", scope: "RSUP Group, RSTM", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  // ── F. Regulatory Compliance — 0% ─────────────────────────────────────────
  { id: "c13a", no: "13a", section: "F", perspektif: "Proses", kpi: "Completed Process HGU RSUP PKB", satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%", definisi: "Persentase penyelesaian proses HGU RSUP PKB sesuai tahapan dan target yang ditentukan dalam satu tahun", source: "Laporan Legal", baseline2025: "100%", target2026: "100%", polaritas: "Minimize", detailFormula: "Total tahapan HGU RSUP PKB yang selesai / Total tahapan HGU RSUP PKB yang Ditargetkan", keterangan: "", scope: "RSUP PKB", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c13b", no: "13b", section: "F", perspektif: "Proses", kpi: "Completed Process HGU RSTM", satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%", definisi: "Persentase penyelesaian proses pengerjaan HGU RSTM 03 sampai tahap akhir dalam periode satu tahun", source: "Laporan Legal", baseline2025: "100%", target2026: "100%", polaritas: "Minimize", detailFormula: "Total tahapan HGU RSTM 03 yang selesai / Total tahapan HGU RSTM 03 yang Ditargetkan", keterangan: "", scope: "RSTM", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "PC", gmGhs: "" },
  { id: "c14", no: "14", section: "F", perspektif: "Proses", kpi: "SIA/SIO/SILO Compliance", satuan: "%/Tahun", formula: "Jumlah", bobot: "0%", definisi: "Tingkat kepatuhan kepemilikan dan keaktifan SIA, SIO, dan SILO yang wajib dimiliki perusahaan selama satu tahun", source: "Laporan SAP", baseline2025: "51%", target2026: "85%", polaritas: "Minimize", detailFormula: "Jumlah SIA/SIO/SILO yang valid dan aktif / Total SIA/SIO/SILO yang Ditargetkan", keterangan: "", scope: "RSUP Group", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "PC", gmVgmPerkebunan: "PC", gmAsd: "PC", gmRstm: "PC", gmGhs: "PC" },
  { id: "c15a", no: "15a", section: "F", perspektif: "Proses", kpi: "Completed Proses Pelepasan HGU GHS 1", satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "0%", definisi: "Persentase penyelesaian pelepasan HGU GHS 01 sesuai target dan rencana tahunan", source: "Laporan Pertanahan IUP", baseline2025: "75%", target2026: "75%", polaritas: "Minimize", detailFormula: "Tahapan pelepasan HGU GHS 01 yang selesai / Total tahapan pelepasan HGU GHS 01", keterangan: "", scope: "GHS", trackingPeriod: "Tahunan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "", gmGhs: "PC" },
  { id: "c15b", no: "15b", section: "F", perspektif: "Proses", kpi: "Completed Proses HGU IUP", satuan: "%/Tahun", formula: "Nilai Akhir", bobot: "0%", definisi: "Persentase penyelesaian pengurusan IUP dalam lingkup RSUP Perkebunan", source: "Laporan Pertanahan IUP", baseline2025: "0%", target2026: "100%", polaritas: "Minimize", detailFormula: "Total IUP yang Wajib dimiliki / Total IUP Wajib", keterangan: "", scope: "RSUP Perkebunan", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "PC", gmAsd: "", gmRstm: "", gmGhs: "" },
  { id: "c15c", no: "15c", section: "F", perspektif: "Proses", kpi: "Completed Proses Hak Guna Usaha seluas 12.946 Ha", satuan: "%/Tahun", formula: "Rata Rata", bobot: "0%", definisi: "Persentase penyelesaian pengurusan Hak Guna Usaha seluas 12.946 Ha", source: "Laporan Legal", baseline2025: "40%", target2026: "100%", polaritas: "Minimize", detailFormula: "Realisasi proses / progress penyelesaian permohonan HGU", keterangan: "", scope: "RSTM", trackingPeriod: "Bulanan", coo: "FC", gmVgmIndustry: "", gmVgmPerkebunan: "", gmAsd: "", gmRstm: "PC", gmGhs: "" },
];


// ─── GM KPI Data (from Format KPI Bisnis RSUP Industri 2026) ─────────────────

const GM_KPI: KPISetting[] = [
  // A. Kinerja K3L Terintegrasi (SMK3/HSE) — 15%
  { id: "gm1a", no: "1a", section: "A", perspektif: "Proses", kpi: "Fire Accident", satuan: "Kasus /bulan", formula: "Jumlah", bobot: "3%", definisi: "Jumlah kebakaran bangunan berdasarkan claim", source: "Laporan SAF", baseline2025: "0", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah kebakaran perbulan", keterangan: "Base on claim", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm1b", no: "1b", section: "A", perspektif: "Proses", kpi: "Fatality Accident", satuan: "Kasus /bulan", formula: "Jumlah", bobot: "4%", definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja", source: "Laporan SAF", baseline2025: "1", target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah kasus perbulan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm1c", no: "1c", section: "A", perspektif: "Proses", kpi: "Lost Time Injury", satuan: "Hari/bulan", formula: "Rata-Rata", bobot: "5%", definisi: "Cedera akibat kecelakaan kerja yang menyebabkan pekerja tidak dapat bekerja setidaknya satu shift penuh setelah kejadian tersebut", source: "Laporan SAF", baseline2025: "5.474", target2026: "6.567", polaritas: "Minimize", detailFormula: "Jumlah hari hilang akibat kecelakaan kerja (LTI)", keterangan: "Hasil verifikasi CLN & HRD", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm1d", no: "1d", section: "A", perspektif: "Proses", kpi: "GHG Reduction", satuan: "tonCo2-eq /bulan", formula: "Rata-Rata", bobot: "2%", definisi: "Pengurangan emisi gas rumah kaca yang diukur sebagai indikator kinerja organisasi", source: "Laporan Komite Energy", baseline2025: "230.973", target2026: "219.652", polaritas: "Minimize", detailFormula: "Jumlah Emisi Gas Rumah Kaca (Boiler Biomasa + PLTD + PLTU + Dapur Arang + Alat Berat + Freon)", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  // B. Finansial & Cost — 35%
  { id: "gm2a", no: "2a", section: "B", perspektif: "Finansial", kpi: "Net Profit (dalam miliar)", satuan: "Rp Miliar /bulan", formula: "Jumlah", bobot: "10%", definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group", source: "Laporan Keuangan RSUP Industry", baseline2025: "687,25", target2026: "750,00", polaritas: "Maximize", detailFormula: "Jumlah Net Profit per bulan", keterangan: "target yang dilampirkan adalah target setahun", scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  { id: "gm2b", no: "2b", section: "B", perspektif: "Finansial", kpi: "ROA (Return on Assets)", satuan: "% /bulan", formula: "Rata-Rata", bobot: "5%", definisi: "Rasio keuangan yang mengukur kemampuan perusahaan menghasilkan laba bersih dari total aset yang dimiliki", source: "Laporan Keuangan RSUP Industry", baseline2025: "17,17%", target2026: "15%", polaritas: "Maximize", detailFormula: "Jumlah ROA per bulan", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  { id: "gm2c", no: "2c", section: "B", perspektif: "Finansial", kpi: "EBITDA (dalam miliar)", satuan: "Rp Miliar /bulan", formula: "Jumlah", bobot: "10%", definisi: "Laba Bersih Perusahaan sebelum dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group", source: "Laporan Keuangan RSUP Industry", baseline2025: "1016,51", target2026: "1050", polaritas: "Maximize", detailFormula: "Jumlah EBITDA per bulan", keterangan: "target yang dilampirkan adalah target setahun", scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  { id: "gm3a", no: "3a", section: "B", perspektif: "Finansial", kpi: "Reject Non Process (Kb-A to B)", satuan: "% /bulan", formula: "Rata-rata", bobot: "2%", definisi: "Jumlah kelapa downgrade bukan karena proses produksi, melainkan karena faktor-faktor non-proses seperti kualitas awal, kerusakan fisik, kontaminasi atau kriteria reject lainnya", source: "Laporan MPD + RMD", baseline2025: "13,80%", target2026: "7,50%", polaritas: "Minimize", detailFormula: "Jumlah kelapa reject dari Kb-A ke Kb-B", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm3b", no: "3b", section: "B", perspektif: "Finansial", kpi: "Overhead Cost (000)", satuan: "Rp /bulan", formula: "Jumlah", bobot: "2%", definisi: "Biaya tidak langsung yang diperlukan untuk menjalankan operasi perusahaan, tetapi tidak dapat ditelusuri langsung ke produk, layanan, atau aktivitas tertentu", source: "Laporan Keuangan RSUP Industry", baseline2025: "409.395", target2026: "442.147", polaritas: "Minimize", detailFormula: "Overhead Cost RSUP Perkebunan", keterangan: "target yang dilampirkan adalah target setahun", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm3c", no: "3c", section: "B", perspektif: "Finansial", kpi: "CAPEX (000)", satuan: "IDR", formula: "Jumlah", bobot: "2%", definisi: "Realisasi belanja modal (Capital Expenditure) untuk proyek pengembangan, peremajaan, dan infrastruktur kebun sesuai ruang lingkup RSUP", source: "Laporan Keuangan RSUP Industry", baseline2025: "146.589", target2026: "409.083", polaritas: "Maximize", detailFormula: "Jumlah CAPEX yang sudah direalisasikan", keterangan: "target yang dilampirkan adalah target setahun", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm3d", no: "3d", section: "B", perspektif: "Finansial", kpi: "Cost Meat Preparation", satuan: "Rp/kg WM /bulan", formula: "Rata-rata", bobot: "2%", definisi: "Total biaya yang dikeluarkan untuk mempersiapkan daging (meat preparation) sebelum digunakan dalam proses produksi", source: "Laporan Keuangan RSUP Industry (ACC / MPD)", baseline2025: "1.452", target2026: "1.500", polaritas: "Minimize", detailFormula: "Jumlah cost Meat Preparation", keterangan: "", scope: "MPD", trackingPeriod: "Bulanan" },
  { id: "gm3e", no: "3e", section: "B", perspektif: "Finansial", kpi: "Cost Utility", satuan: "Rp/kg Kelapa /bulan", formula: "Rata-rata", bobot: "2%", definisi: "Biaya operasional seperti biaya listrik, air, gas, energi lainnya (solar), serta biaya perawatan lainnya", source: "Laporan Keuangan RSUP Industry (ACC / Utility)", baseline2025: "430", target2026: "472", polaritas: "Minimize", detailFormula: "Jumlah cost Utility", keterangan: "", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  // C. Produksi — 30%
  { id: "gm4",  no: "4",  section: "C", perspektif: "Proses", kpi: "Coconut Process",            satuan: "Kg /bulan",        formula: "Jumlah",    bobot: "5%", definisi: "Jumlah kelapa utuh yang berhasil diterima selama periode tertentu",                                                     source: "Laporan PIC / RMD", baseline2025: "409.930.558", target2026: "460.000.000", polaritas: "Maximize", detailFormula: "Total kelapa yang berhasil diterima dalam setiap periode",        keterangan: "gunakan KG atau butir", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm5",  no: "5",  section: "C", perspektif: "Proses", kpi: "Qty Shipment Coconut",        satuan: "Ton / Bulan",      formula: "Jumlah",    bobot: "3%", definisi: "Jumlah hasil proses kelapa yang berhasil dikirim",                                                                       source: "Laporan PHD",       baseline2025: "193,07",      target2026: "172,03",      polaritas: "Maximize", detailFormula: "Total shipment coconut / target shipment",               keterangan: "",                      scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm6a", no: "6a", section: "C", perspektif: "Proses", kpi: "Efficiency White Meat",       satuan: "% /bulan",         formula: "Rata-Rata", bobot: "3%", definisi: "Efisiensi hasil white meat yang diperoleh dari proses pengolahan kelapa dibandingkan dengan total input kelapa",        source: "Laporan MPD",       baseline2025: "0,31",        target2026: "0,31",        polaritas: "Maximize", detailFormula: "Total output white meat / Total olah kelapa utuh",        keterangan: "",                      scope: "MPD",          trackingPeriod: "Bulanan" },
  { id: "gm6b", no: "6b", section: "C", perspektif: "Proses", kpi: "Efficiency Coconut Water",    satuan: "% /bulan",         formula: "Rata-Rata", bobot: "3%", definisi: "Efisiensi perolehan coconut water dari proses pengolahan kelapa",                                                        source: "Laporan MPD",       baseline2025: "0,23",        target2026: "0,26",        polaritas: "Maximize", detailFormula: "Total output coconut water / Total olah kelapa utuh",    keterangan: "",                      scope: "MPD",          trackingPeriod: "Bulanan" },
  { id: "gm6c", no: "6c", section: "C", perspektif: "Proses", kpi: "Efficiency Santan",           satuan: "% /bulan",         formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat efisiensi proses produksi santan dibandingkan dengan target atau standar hasil yang ditetapkan",              source: "Laporan WCC",       baseline2025: "79,28",       target2026: "79,28",       polaritas: "Maximize", detailFormula: "Total actual produksi santan / Target",                   keterangan: "",                      scope: "WCC",          trackingPeriod: "Bulanan" },
  { id: "gm7",  no: "7",  section: "C", perspektif: "Proses", kpi: "Pineapple Process",           satuan: "Butir /bulan",     formula: "Jumlah",    bobot: "5%", definisi: "Jumlah buah nanas (butir) yang berhasil diterima selama periode tertentu",                                              source: "Laporan PJD/RMR",   baseline2025: "12.952.614",  target2026: "17.270.906",  polaritas: "Maximize", detailFormula: "Total nenas yang berhasil diterima dalam setiap periode",    keterangan: "",                      scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm8",  no: "8",  section: "C", perspektif: "Proses", kpi: "Qty Shipment Pineapple",      satuan: "Ton / Bulan",      formula: "Jumlah",    bobot: "3%", definisi: "Jumlah hasil proses nanas yang berhasil dikirim",                                                                       source: "Laporan PHD",       baseline2025: "3.633",       target2026: "4.330",       polaritas: "Maximize", detailFormula: "Total shipment pineapple / target shipment",              keterangan: "",                      scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm9a", no: "9a", section: "C", perspektif: "Proses", kpi: "Efficiency Pineapple Meat PSP", satuan: "Case/Ton /bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat efisiensi proses produksi dibandingkan dengan target atau standar hasil yang ditetapkan",                    source: "Laporan PSP",       baseline2025: "17,05",       target2026: "17,05",       polaritas: "Maximize", detailFormula: "Output Pineapple Meat (PSP) / Total olah nenas",           keterangan: "",                      scope: "PSP",          trackingPeriod: "Bulanan" },
  { id: "gm9b", no: "9b", section: "C", perspektif: "Proses", kpi: "Efficiency Pineapple Meat PJC", satuan: "kg/ton /bulan",  formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat efisiensi proses produksi dibandingkan dengan target atau standar hasil yang ditetapkan",                    source: "Laporan PJC",       baseline2025: "36",          target2026: "36",          polaritas: "Maximize", detailFormula: "Output Pineapple Meat (PJC) / Total olah nenas",           keterangan: "",                      scope: "PJC",          trackingPeriod: "Bulanan" },
  // D. Be Employer of Choices — 5%
  { id: "gm10a", no: "10a", section: "D", perspektif: "Learn & Growth", kpi: "Employee Turn over",         satuan: "Jumlah",    formula: "Nilai Akhir", bobot: "1%",  definisi: "Jumlah karyawan keluar dalam periode tertentu (Khusus Non MP Employee)",                                                        source: "Laporan HRD", baseline2025: "418",    target2026: "355",    polaritas: "Minimize", detailFormula: "Jumlah turnover karyawan di RSUP Industri",                      keterangan: "Total karyawan keluar exclude MP",                                          scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm10b", no: "10b", section: "D", perspektif: "Learn & Growth", kpi: "Employee Engagement Score",  satuan: "% /Tahun",  formula: "Nilai Akhir", bobot: "1%",  definisi: "Mengukur tingkat keterikatan emosional, komitmen, motivasi, dan kepuasan karyawan terhadap pekerjaan dan organisasi",           source: "Laporan HRD", baseline2025: "85%",    target2026: "85%",    polaritas: "Maximize", detailFormula: "Jumlah score enggament survey",                                   keterangan: "",                                                                          scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  { id: "gm10c", no: "10c", section: "D", perspektif: "Learn & Growth", kpi: "MT For Industry",            satuan: "Batch",     formula: "Nilai Akhir", bobot: "1%",  definisi: "Jumlah Batch TMT yang berhasil dijalankan dalam satu tahun",                                                                     source: "Laporan HRD", baseline2025: "1",      target2026: "2",      polaritas: "Maximize", detailFormula: "Jumlah MT Industri",                                             keterangan: "",                                                                          scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  { id: "gm10d", no: "10d", section: "D", perspektif: "Learn & Growth", kpi: "Hard & Soft Skill Training", satuan: "Jumlah",    formula: "Nilai Akhir", bobot: "2%",  definisi: "Jumlah training yang dilaksanakan dalam satu tahun (jabatan struktural - wakabag ke atas)",                                    source: "Laporan HRD", baseline2025: "1.744",  target2026: "1.692",  polaritas: "Maximize", detailFormula: "Jumlah Training Industri x jumlah pegawai yang dinilai",         keterangan: "1 orang wajib mengikuti 12 training setahun (level Wakabag ke atas)",      scope: "RSUP Industry", trackingPeriod: "Tahunan" },
  // E. Be Partner of Choices — 10%
  { id: "gm11a", no: "11a", section: "E", perspektif: "Customer", kpi: "Customer Complain",       satuan: "Kasus / tahun",        formula: "Jumlah", bobot: "5%", definisi: "Jumlah Kasus ketidakpuasan pelanggan terhadap produk, layanan, atau pengalaman yang diterima konsumen",                      source: "Laporan QA", baseline2025: "11", target2026: "8", polaritas: "Minimize", detailFormula: "Jumlah complaint dari pelanggan yang diterima perusahaan",                         keterangan: "based on valid customer complaint dan CPAR (PPIC & QA)",    scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm11b", no: "11b", section: "E", perspektif: "Customer", kpi: "Customer Incidents >50jt", satuan: "Rp Juta /kasus / tahun", formula: "Jumlah", bobot: "5%", definisi: "Jumlah insiden pelanggan yang berdampak finansial besar (di atas Rp50 Juta) dalam periode tertentu",                  source: "Laporan QA", baseline2025: "1",  target2026: "0", polaritas: "Minimize", detailFormula: "Jumlah Customer Incident dengan nilai kerugian > Rp50.000.000",              keterangan: "customer incident based on customer claim",                 scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  // F. Regulatory Compliance — 5%
  { id: "gm12a", no: "12a", section: "F", perspektif: "Proses", kpi: "SIA/SILO Compliance", satuan: "% /bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat kepatuhan kepemilikan dan keabsahan SIA dan SILO yang wajib dimiliki perusahaan selama satu tahun", source: "Laporan SAF", baseline2025: "68%", target2026: "80%", polaritas: "Maximize", detailFormula: "Jumlah SIA/SILO yang valid dan aktif / Total SIA/SILO yang diwajibkan", keterangan: "Total SIA: aktual 2025: 369, target 2025: 474, Target 2026: 482. Total SILO: Target 2026: 11", scope: "RSUP Industry", trackingPeriod: "Bulanan" },
  { id: "gm12b", no: "12b", section: "F", perspektif: "Proses", kpi: "SIO Compliance",       satuan: "% /bulan", formula: "Rata-Rata", bobot: "3%", definisi: "Tingkat kepatuhan kepemilikan dan keabsahan SIO, yang wajib dimiliki perusahaan selama satu tahun",              source: "Laporan SAF", baseline2025: "29%", target2026: "50%", polaritas: "Maximize", detailFormula: "Jumlah SIO yang valid dan aktif / Total SIO yang diwajibkan",          keterangan: "Total SIO: aktual 2025: 416, target 2025: 585, Target 2026: 585",           scope: "RSUP Industry", trackingPeriod: "Bulanan" },
];

// ─── Constants ────────────────────────────────────────────────────────────────


const CORP_SECTION_META_BIZ: Record<string, { label: string; bobot: string; bg: string }> = {
  A: { label: "Kinerja K3L Terintegrasi (SMK3/HSE)", bobot: "15%", bg: "#1B5E20" },
  B: { label: "Finansial",                            bobot: "40%", bg: "#0D47A1" },
  C: { label: "Produksi",                             bobot: "30%", bg: "#4A148C" },
  D: { label: "Be Employer of Choices",               bobot: "9%",  bg: "#BF360C" },
  E: { label: "Be Partner of Choices",                bobot: "6%",  bg: "#006064" },
  F: { label: "Regulatory Compliance",                bobot: "0%",  bg: "#37474F" },
};

const CORP_SECTION_META_GM: Record<string, { label: string; bobot: string; bg: string }> = {
  A: { label: "Kinerja K3L Terintegrasi (SMK3/HSE)", bobot: "15%", bg: "#1B5E20" },
  B: { label: "Finansial & Cost",                    bobot: "35%", bg: "#0D47A1" },
  C: { label: "Produksi",                            bobot: "30%", bg: "#4A148C" },
  D: { label: "Be Employer of Choices",              bobot: "5%",  bg: "#BF360C" },
  E: { label: "Be Partner of Choices",               bobot: "10%", bg: "#006064" },
  F: { label: "Regulatory Compliance",               bobot: "5%",  bg: "#37474F" },
};

const CASCADING_CELL_BG_BIZ: Record<string, string> = { FC: "#e0e7ff", PC: "#fef3c7", CC: "#ccfbf1" };
const CASCADING_CELL_BORDER_BIZ: Record<string, string> = { FC: "#a5b4fc", PC: "#fcd34d", CC: "#5eead4" };
const CASCADING_CELL_COLOR_BIZ: Record<string, string> = { FC: "#312e81", PC: "#78350f", CC: "#134e4a" };


const PERSP_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};


// ─── Bobot validation ────────────────────────────────────────────────────────


// ─── Modals ───────────────────────────────────────────────────────────────────


function SuccessModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Done</h3>
        <p className="text-gray-500 text-sm mb-6">{message}</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Close</button>
      </div>
    </div>
  );
}

function RevisionModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
        <h3 className="font-bold text-gray-900 text-lg mb-1">Request Revision</h3>
        <p className="text-gray-500 text-sm mb-4">Describe what needs to be revised for this KPI setting.</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Enter revision notes..."
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none mb-4"
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-5 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => { if (note.trim()) onConfirm(note); }}
            disabled={!note.trim()}
            className="px-5 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 transition-colors"
          >
            Send Revision
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Helper components ────────────────────────────────────────────────────────


// ─── Color badge for Setting table ───────────────────────────────────────────


// ─── KPI Table ────────────────────────────────────────────────────────────────


type ApprovalStatus = "pending" | "director_approved" | "approved" | "revision";

// (KPISection preserved for reference — BusinessKPITable + HRSettingKPIPage handle the business tab)


// ─── Business KPI helpers ─────────────────────────────────────────────────────


function BusinessKPITable({ items }: { items: KPISetting[] }) {
  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const MAIN_COLS = [
    { label: "No",              w: 44  },
    { label: "Perspektif",      w: 100 },
    { label: "KPI",             w: 260 },
    { label: "Satuan",          w: 120 },
    { label: "Formula Setahun", w: 110 },
    { label: "Scope",           w: 180 },
    { label: "Bobot",           w: 60  },
    { label: "Definisi",        w: 240 },
    { label: "Source",          w: 180 },
    { label: "Polaritas",       w: 80  },
    { label: "Detail Formula",  w: 240 },
    { label: "Baseline 2025",   w: 100 },
    { label: "Target 2026",     w: 100 },
    { label: "Tracking Period", w: 90  },
  ];
  const CASC_TYPE_COLS = [
    { label: "FC", type: "FC", w: 150, bg: CASCADING_CELL_BG_BIZ.FC, border: CASCADING_CELL_BORDER_BIZ.FC, color: CASCADING_CELL_COLOR_BIZ.FC },
    { label: "PC", type: "PC", w: 170, bg: CASCADING_CELL_BG_BIZ.PC, border: CASCADING_CELL_BORDER_BIZ.PC, color: CASCADING_CELL_COLOR_BIZ.PC },
    { label: "CC", type: "CC", w: 130, bg: CASCADING_CELL_BG_BIZ.CC, border: CASCADING_CELL_BORDER_BIZ.CC, color: CASCADING_CELL_COLOR_BIZ.CC },
  ];
  const CASC_ROLE_FIELDS: { key: keyof KPISetting; label: string }[] = [
    { key: "coo",             label: "COO"           },
    { key: "gmVgmIndustry",   label: "GM Industry"   },
    { key: "gmVgmPerkebunan", label: "GM Perkebunan" },
    { key: "gmAsd",           label: "GM ASD"        },
    { key: "gmRstm",          label: "GM RSTM"       },
    { key: "gmGhs",           label: "GM GHS"        },
  ];
  const totalWidth = MAIN_COLS.reduce((s, c) => s + c.w, 0) + CASC_TYPE_COLS.reduce((s, c) => s + c.w, 0);
  const totalCols = MAIN_COLS.length + CASC_TYPE_COLS.length;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: totalWidth + "px" }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {MAIN_COLS.map(({ label, w }) => (
                <th key={label} rowSpan={2} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px] align-middle" style={{ minWidth: w }}>{label}</th>
              ))}
              <th colSpan={3} className="border border-[#1A284F]/30 py-2 px-2 text-center font-semibold text-[11px]">CASCADING</th>
            </tr>
            <tr className="bg-[#243860] text-white">
              {CASC_TYPE_COLS.map(({ label, w }) => (
                <th key={label} className="border border-[#1A284F]/30 py-2 px-1.5 text-center font-semibold text-[10px]" style={{ minWidth: w }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const meta = CORP_SECTION_META_BIZ[sec] ?? { label: sec, bobot: "—", bg: "#455A64" };
              const secRows = items.filter((k) => k.section === sec);
              return (
                <React.Fragment key={sec}>
                  <tr>
                    <td colSpan={totalCols} className="py-2.5 px-4 text-white text-[11px] font-bold uppercase tracking-wider border"
                      style={{ background: meta.bg, borderColor: meta.bg }}>
                      {sec}. {meta.label}
                      <span className="ml-3 opacity-80 font-normal normal-case tracking-normal text-[11px]">— Bobot {meta.bobot}</span>
                    </td>
                  </tr>
                  {secRows.map((item, idx) => {
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/30";
                    return (
                      <tr key={item.id} className={`border-t border-gray-100 ${rowBg} hover:bg-blue-50/20 transition-colors`}>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="font-bold text-gray-500 text-[11px]">{item.no}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className={`text-[11px] font-semibold ${PERSP_COLOR[item.perspektif] ?? "text-gray-700"}`}>{item.perspektif}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <p className="text-[11px] font-medium text-gray-800 leading-relaxed">{item.kpi}</p>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600">{item.satuan || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-600">{item.formula || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-500 italic">{item.scope || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{item.bobot}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600 leading-relaxed">{item.definisi || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-500">{item.source || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${item.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>{item.polaritas}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600 leading-relaxed">{item.detailFormula || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-700 font-medium">{item.baseline2025 || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] font-bold text-[#1A284F]">{item.target2026 || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-500">{item.trackingPeriod || "—"}</span>
                        </td>
                        {CASC_TYPE_COLS.map(({ type, w, bg, border, color }) => {
                          const rolesForType = CASC_ROLE_FIELDS.filter(r => (item[r.key] as string) === type);
                          return (
                            <td key={type} className="border border-gray-200 py-2 px-2 text-center align-top" style={{ minWidth: w, background: rolesForType.length ? bg : undefined }}>
                              {rolesForType.length === 0 ? (
                                <span className="text-gray-300 text-[10px]">—</span>
                              ) : (
                                <div className="flex flex-col gap-1 items-start">
                                  {rolesForType.map(r => (
                                    <span key={r.key} className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                      style={{ background: `${bg}cc`, border: `1px solid ${border}`, color }}>
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                                      {r.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
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
  );
}

function GMKPITable({ items }: { items: KPISetting[] }) {
  const sections = Array.from(new Set(items.map((k) => k.section))).sort();
  const COLS = [
    { label: "No",              w: 44  },
    { label: "Perspektif",      w: 100 },
    { label: "KPI",             w: 260 },
    { label: "Satuan",          w: 120 },
    { label: "Formula Setahun", w: 110 },
    { label: "Scope",           w: 150 },
    { label: "Bobot",           w: 60  },
    { label: "Definisi",        w: 240 },
    { label: "Source",          w: 180 },
    { label: "Polaritas",       w: 80  },
    { label: "Detail Formula",  w: 240 },
    { label: "Baseline 2025",   w: 100 },
    { label: "Target 2026",     w: 100 },
    { label: "Tracking Period", w: 90  },
    { label: "Keterangan",      w: 220 },
  ];
  const totalWidth = COLS.reduce((s, c) => s + c.w, 0);

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs" style={{ minWidth: totalWidth + "px" }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {COLS.map(({ label, w }) => (
                <th key={label} className="border border-[#1A284F]/30 py-2.5 px-2 text-center font-semibold text-[11px]" style={{ minWidth: w }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const meta = CORP_SECTION_META_GM[sec] ?? { label: sec, bobot: "—", bg: "#455A64" };
              const secRows = items.filter((k) => k.section === sec);
              return (
                <React.Fragment key={sec}>
                  <tr>
                    <td colSpan={COLS.length} className="py-2.5 px-4 text-white text-[11px] font-bold uppercase tracking-wider border"
                      style={{ background: meta.bg, borderColor: meta.bg }}>
                      {sec}. {meta.label}
                      <span className="ml-3 opacity-80 font-normal normal-case tracking-normal text-[11px]">— Bobot {meta.bobot}</span>
                    </td>
                  </tr>
                  {secRows.map((item, idx) => {
                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/30";
                    return (
                      <tr key={item.id} className={`border-t border-gray-100 ${rowBg} hover:bg-blue-50/20 transition-colors`}>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="font-bold text-gray-500 text-[11px]">{item.no}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className={`text-[11px] font-semibold ${PERSP_COLOR[item.perspektif] ?? "text-gray-700"}`}>{item.perspektif}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <p className="text-[11px] font-medium text-gray-800 leading-relaxed">{item.kpi}</p>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600">{item.satuan || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-600">{item.formula || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-500 italic">{item.scope || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{item.bobot}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600 leading-relaxed">{item.definisi || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-500">{item.source || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${item.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>{item.polaritas}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-600 leading-relaxed">{item.detailFormula || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-700 font-medium">{item.baseline2025 || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] font-bold text-[#1A284F]">{item.target2026 || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5 text-center">
                          <span className="text-[11px] text-gray-500">{item.trackingPeriod || "—"}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-1.5">
                          <span className="text-[11px] text-gray-500 italic">{item.keterangan || "—"}</span>
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
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const COMPANY_UNITS_BIZ = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];

const CURRENT_YEAR = 2026;
const YEAR_OPTIONS = [2024, 2025, 2026, 2027];

export function HRSettingKPIPage() {
  const activeUser = getActiveUser();
  const isDirector = isDirectorRoleOrGrouping(activeUser);
  const isValidator = isAdminOrHrIcfRole(activeUser.role) || Boolean(activeUser.isHrIcfValidator);
  const allowedUnits = React.useMemo(
    () =>
      isDirector
        ? getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits)
        : COMPANY_UNITS_BIZ,
    [isDirector, activeUser.company, activeUser.managedUnits],
  );
  const [items] = useState<KPISetting[]>(CORPORATE_KPI);
  const [companyUnit, setCompanyUnit] = useState(() => allowedUnits[0] ?? "PT RSUP (Industry)");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [routeKpiTab, setKpiTab] = useRouteTab<"group" | "gm">(
    ["group", "gm"],
    isDirector ? "gm" : "group",
  );
  // Untuk Role Director, tab KPI (Group) di-hide karena KPI (Group) dibuat oleh level Director
  const kpiTab: "group" | "gm" = isDirector ? "gm" : routeKpiTab;
  const [checklist, setChecklist] = useState<KpiHierarchyValidationChecklist>(() =>
    loadKpiValidationChecklist(String(CURRENT_YEAR)),
  );
  const [unitKpiByCompany, setUnitKpiByCompany] = useState<Record<string, KPISetting[]>>(() =>
    loadPersistedState<Record<string, KPISetting[]>>("pa_kpi_unit_by_company_2026", {
      "PT RSUP (Industry)": GM_KPI,
      "PT RSUP (Perkebunan)": CORPORATE_KPI.filter((k) => Boolean(k.gmVgmPerkebunan)).map((k, idx) => ({
        ...k,
        id: `pkb-${k.id}`,
        no: String(idx + 1),
        scope: "RSUP Perkebunan",
      })),
      "PT RSTM": CORPORATE_KPI.filter((k) => Boolean(k.gmRstm)).map((k, idx) => ({
        ...k,
        id: `rstm-${k.id}`,
        no: String(idx + 1),
        scope: "PT RSTM",
      })),
      "PT GHS": CORPORATE_KPI.filter((k) => Boolean(k.gmGhs)).map((k, idx) => ({
        ...k,
        id: `ghs-${k.id}`,
        no: String(idx + 1),
        scope: "PT GHS",
      })),
      "ASD": CORPORATE_KPI.filter((k) => Boolean(k.gmAsd)).map((k, idx) => ({
        ...k,
        id: `asd-${k.id}`,
        no: String(idx + 1),
        scope: "ASD",
      })),
    }),
  );
  const [trackingAssigneeByKey, setTrackingAssigneeByKey] = useState<Record<string, string>>(() =>
    loadPersistedState<Record<string, string>>("pa_kpi_business_tracking_pic_2026", {
      "group::PT RSUP (Industry)": "E013 · Anis Sandi (HR Strategic Specialist)",
      "gm::PT RSUP (Industry)": "E014 · Ananta Nirmala (HR Unit)",
      "gm::PT RSUP (Perkebunan)": "E006 · Fajar Hidayat",
      "gm::PT RSTM": "E003 · Budi Santoso",
      "gm::PT GHS": "E010 · Joko Susanto",
      "gm::ASD": "E018 · Wahyu Nugroho",
    }),
  );
  const [validationMap, setValidationMap] = useState<Record<string, ApprovalStatus>>(() =>
    loadPersistedState<Record<string, ApprovalStatus>>("pa_kpi_business_validation_2026", {
      "group::PT RSUP (Industry)": "approved",
      "gm::PT RSUP (Industry)": "approved",
    }),
  );

  useEffect(() => {
    const onSync = () => setChecklist(loadKpiValidationChecklist(String(selectedYear)));
    window.addEventListener("pa-module-activation-updated", onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    return () => {
      window.removeEventListener("pa-module-activation-updated", onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
    };
  }, [selectedYear]);

  const handleCompanyUnitChange = (unit: string) => {
    setCompanyUnit(unit);
    if (isDirector || unit !== "PT RSUP (Industry)") setKpiTab("gm");
  };
  const currentKey = `${kpiTab}::${companyUnit}`;
  const approvalStatus: ApprovalStatus = validationMap[currentKey] ?? "pending";
  const setApprovalStatus = (status: ApprovalStatus) => {
    setValidationMap((prev) => {
      const next = { ...prev, [currentKey]: status };
      savePersistedState("pa_kpi_business_validation_2026", next, {
        kind: "kv-state",
        stateKey: "pa_kpi_business_validation_2026",
        stateValue: next,
      });
      return next;
    });
  };
  const [pendingAction, setPendingAction] = useState<"approve" | "revision" | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showCancelValidate, setShowCancelValidate] = useState(false);

  const currentUnitItems = unitKpiByCompany[companyUnit] ?? GM_KPI;
  const isRsupGroupUnit = (RSUP_GROUP_COMPANIES as readonly string[]).includes(companyUnit);
  const canCreateOrEditKpiUnit = checklist.kpiGroupValidated || checklist.allowParallelKpiUnit;

  const handleAdoptFromKpiGroup = () => {
    if (!canCreateOrEditKpiUnit) {
      toast.error("KPI Unit belum dapat dibuat karena KPI Group belum berstatus Validated dan mode paralel di /hr/modules tidak aktif.");
      return;
    }
    const adopted = CORPORATE_KPI.map((k, idx) => ({
      ...k,
      id: `${companyUnit}-adopted-${k.id}`,
      no: String(idx + 1),
      scope: companyUnit,
    }));
    setUnitKpiByCompany((prev) => {
      const next = { ...prev, [companyUnit]: adopted };
      savePersistedState("pa_kpi_unit_by_company_2026", next, {
        kind: "kv-state",
        stateKey: "pa_kpi_unit_by_company_2026",
        stateValue: next,
        audit: {
          action: "Update",
          module: "KPI Business",
          subModule: "KPI Unit",
          description: `GM ${companyUnit} mengambil dan menyesuaikan ${adopted.length} indikator dari KPI Group`,
        },
      });
      return next;
    });
    toast.success(`${adopted.length} indikator KPI Group berhasil diambil ke KPI Unit ${companyUnit} untuk disesuaikan oleh GM.`);
  };

  const handleDirectorApprove = () => {
    setApprovalStatus("director_approved");
    setPendingAction(null);
    void savePersistedState("pa_kpi_business_validation_2026", {
      ...validationMap,
      [currentKey]: "director_approved",
    }, {
      kind: "kv-state",
      stateKey: "pa_kpi_business_validation_2026",
      stateValue: { ...validationMap, [currentKey]: "director_approved" },
      audit: {
        action: "Approve",
        module: "KPI Business",
        subModule: "KPI (Unit)",
        description: `Director ${activeUser.name} approved KPI (Unit) for ${companyUnit} (awaiting HR ICF Validate)`,
      },
    });
    setSuccessMessage(
      `KPI (Unit) (${companyUnit}) telah disetujui oleh Director (Approved by Director) dan diteruskan ke HR ICF untuk tahap Validate.`,
    );
    setShowSuccess(true);
  };

  const handleValidate = () => {
    setApprovalStatus("approved");
    if (kpiTab === "group") {
      const nextChecklist = { ...checklist, kpiGroupValidated: true };
      setChecklist(nextChecklist);
      saveKpiValidationChecklist(String(selectedYear), nextChecklist);
    }
    // Bagian IV Poin 10: KPI dengan status Validated otomatis ter-create di Measurement -> KPI Tracking
    const sourceItems = kpiTab === "group" ? items : currentUnitItems;
    const existingTracking = loadPersistedState<Record<string, unknown>>("pa_validated_kpi_tracking_items_2026", {});
    const nextTracking = {
      ...existingTracking,
      [currentKey]: {
        type: kpiTab === "group" ? "KPI Group" : "KPI Unit",
        companyUnit,
        year: selectedYear,
        validatedAt: new Date().toISOString(),
        trackingPic: trackingAssigneeByKey[currentKey] ?? "",
        cascadingEnabled: true,
        items: sourceItems,
      },
    };
    savePersistedState("pa_validated_kpi_tracking_items_2026", nextTracking, {
      kind: "kv-state",
      stateKey: "pa_validated_kpi_tracking_items_2026",
      stateValue: nextTracking,
      audit: {
        action: "Validate",
        module: "KPI Business",
        subModule: kpiTab === "group" ? "KPI Group" : "KPI Unit",
        description: `Validated ${kpiTab === "group" ? "KPI Group" : "KPI Unit"} (${companyUnit}) & auto-created in Measurement -> KPI Tracking`,
      },
    });
    setPendingAction(null);
    setSuccessMessage(
      `KPI ${kpiTab === "group" ? "Group" : "Unit"} (${companyUnit}) berhasil berstatus Validated dan otomatis ter-create di Measurement -> KPI Tracking.`,
    );
    setShowSuccess(true);
  };

  const handleCancelValidate = () => {
    setApprovalStatus(isDirector ? "pending" : kpiTab === "gm" ? "director_approved" : "pending");
    setShowCancelValidate(false);
    setSuccessMessage(
      isDirector
        ? `Approval Director telah dibatalkan. KPI (Unit) kembali ke status Pending Approval.`
        : `Validation has been cancelled. KPI ${kpiTab === "group" ? "(Group)" : "(Unit)"} is back to Pending Validation.`,
    );
    setShowSuccess(true);
  };

  const handleRevision = (note: string) => {
    setApprovalStatus("revision");
    setShowRevisionModal(false);
    setSuccessMessage(`Revision request sent for KPI ${kpiTab === "group" ? "(Group)" : "(Unit)"}.`);
    setShowSuccess(true);
  };

  const handleExport = () => {
    const headers = ["No","Section","Perspektif","KPI","Satuan","Formula Setahun","Scope","Bobot","Definisi","Source","Polaritas","Detail Formula","Baseline 2025","Target 2026","Tracking Period","COO","GM Industry","GM Perkebunan","GM ASD","GM RSTM","GM GHS"];
    const rows = items.map((i) => [i.no, `${i.section}. ${CORP_SECTION_META_BIZ[i.section]?.label ?? i.section}`, i.perspektif, i.kpi, i.satuan, i.formula, i.scope ?? "", i.bobot, i.definisi, i.source, i.polaritas, i.detailFormula, i.baseline2025, i.target2026, i.trackingPeriod ?? "", i.coo ?? "", i.gmVgmIndustry ?? "", i.gmVgmPerkebunan ?? "", i.gmAsd ?? "", i.gmRstm ?? "", i.gmGhs ?? ""]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "KPI_Business_RSUP_Group_2026.csv";
    a.click();
  };

  const statusBadge = () => {
    if (approvalStatus === "approved") return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" />Validated (HR ICF)</span>;
    if (approvalStatus === "director_approved") return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" />Approved by Director · Pending HR ICF Validate</span>;
    if (approvalStatus === "revision") return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold"><RotateCcw className="w-3.5 h-3.5" />Revision Requested</span>;
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
        {kpiTab === "group" ? "Pending HR ICF Validate" : "Pending Director Approve"}
      </span>
    );
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Business — Approval &amp; Validation</h1>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — KPI Configuration &amp; Approval</p>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-[#1A284F] border border-indigo-200">
            {kpiTab === "group"
              ? "Alur Approval KPI (Group): Director Submit → HR ICF Validate"
              : "Alur Approval KPI (Unit): GM Submit → Director Approve → HR ICF Validate"}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Company Unit</label>
          <select
            value={companyUnit}
            onChange={(e) => handleCompanyUnitChange(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white outline-none focus:border-[#1A284F] focus:ring-1 focus:ring-[#1A284F]/20 transition-all min-w-[200px]"
          >
            {allowedUnits.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Year</label>
          <div className="relative flex items-center">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 pr-24 text-gray-700 bg-white outline-none focus:border-[#1A284F] focus:ring-1 focus:ring-[#1A284F]/20 transition-all"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            {selectedYear === CURRENT_YEAR && (
              <span className="absolute right-7 pointer-events-none px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded">
                Current Year
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab header */}
      <div className="flex gap-1 border-b border-gray-200">
        {(!isDirector && companyUnit === "PT RSUP (Industry)" ? (["group", "gm"] as const) : (["gm"] as const)).map((tab) => (
          <button
            key={tab}
            onClick={() => setKpiTab(tab)}
            className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors ${
              kpiTab === tab
                ? "border-[#1A284F] text-[#1A284F]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "group" ? "KPI (Group)" : "KPI (Unit)"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {/* Sub-header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {statusBadge()}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A284F]/5 rounded-lg">
              <span className="text-xs font-bold text-[#1A284F]">Total KPI:</span>
              <span className="text-sm font-bold text-[#1A284F]">
                {kpiTab === "group" ? items.length : currentUnitItems.length}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-[#1A284F]">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold">Penyusun:</span>
              <span>
                {kpiTab === "group"
                  ? "Direktur Operasional — PT RSUP (Industry)"
                  : `General Manager (GM) — ${companyUnit}`}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border border-gray-200 rounded-lg text-xs">
              <span className="font-semibold text-gray-600">PIC Tracking (Allowed by Admin/HR ICF):</span>
              <select
                value={trackingAssigneeByKey[currentKey] ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setTrackingAssigneeByKey((prev) => {
                    const next = { ...prev, [currentKey]: val };
                    savePersistedState("pa_kpi_business_tracking_pic_2026", next);
                    return next;
                  });
                }}
                className="bg-transparent font-medium text-[#1A284F] focus:outline-none"
              >
                <option value="">— Pilih PIC Tracking —</option>
                {loadManagedUsers().map((u) => (
                  <option key={u.employeeId} value={`${u.employeeId} · ${u.name} (${u.position})`}>
                    {u.employeeId} · {u.name} ({u.company})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {kpiTab === "gm" && isRsupGroupUnit && (
              <button
                type="button"
                onClick={handleAdoptFromKpiGroup}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-[#1A284F] hover:bg-blue-100 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Ambil Indikator dari KPI Group
              </button>
            )}
            {isDirector ? (
              // Untuk Role Director pada tab KPI (Unit): bertindak sebagai Approver (bukan Validator)
              approvalStatus === "approved" ? null : approvalStatus === "director_approved" ? (
                <button
                  onClick={() => setShowCancelValidate(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-red-400 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel Approve
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowRevisionModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-orange-400 text-orange-600 hover:bg-orange-50 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> Revision
                  </button>
                  <button
                    onClick={() => setPendingAction("approve")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#243869] transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                </>
              )
            ) : approvalStatus === "approved" ? (
              isValidator && (
                <button
                  onClick={() => setShowCancelValidate(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-red-400 text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel Validate
                </button>
              )
            ) : (
              isValidator && (
                <>
                  <button
                    onClick={() => setShowRevisionModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-orange-400 text-orange-600 hover:bg-orange-50 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> Revision
                  </button>
                  <button
                    onClick={() => setPendingAction("approve")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Validate
                  </button>
                </>
              )
            )}
            <button onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 transition-all">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {kpiTab === "group" && companyUnit === "PT RSUP (Industry)" && selectedYear === CURRENT_YEAR ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  <strong>RSUP Group:</strong> PT RSUP (Industry), PT RSUP (Perkebunan), PT RSTM, PT GHS, dan ASD. Nilai Tracking KPI Group mendukung <strong>Cascading</strong> otomatis dari indikator turunan KPI Unit.
                </span>
              </div>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" />
                Status Validated otomatis ter-create ke Measurement → KPI Tracking
              </span>
            </div>
            <BusinessKPITable items={items} />
          </>
        ) : kpiTab === "gm" && isRsupGroupUnit && selectedYear === CURRENT_YEAR ? (
          canCreateOrEditKpiUnit ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-[#1A284F]">
                <span>
                  <strong>KPI Unit ({companyUnit}):</strong> Disusun oleh GM {companyUnit}, dapat mengambil indikator dari KPI Group dan disesuaikan dengan target unit usaha.
                </span>
                <span className="font-semibold text-emerald-700">
                  {checklist.kpiGroupValidated ? "KPI Group: Validated" : "Mode Paralel Aktif (/hr/modules)"}
                </span>
              </div>
              <GMKPITable items={currentUnitItems} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-amber-200 bg-amber-50/50 text-center px-6">
              <p className="text-sm font-bold text-amber-900">
                KPI Unit {companyUnit} Belum Dapat Dibuat
              </p>
              <p className="text-xs text-amber-800 max-w-lg">
                Sesuai aturan Bagian IV Poin 6, KPI Unit hanya bisa dibuat jika KPI Group sudah berstatus Validated atau Checklist Mode Paralel diaktifkan di menu <strong>/hr/modules</strong>.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-20 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <FileSearch className="w-6 h-6 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500">Empty Data</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {selectedYear !== CURRENT_YEAR
                  ? <>No KPI data available for year <span className="font-medium">{selectedYear}</span></>
                  : <>No KPI data available for <span className="font-medium">{companyUnit}</span></>}
              </p>
            </div>
          </div>
        )}
      </div>

      {pendingAction === "approve" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
            <button onClick={() => setPendingAction(null)} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
              {isDirector ? "Approve KPI (Unit) Setting" : `Validate KPI ${kpiTab === "group" ? "(Group)" : "(Unit)"} Setting`}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              You are about to {isDirector ? "approve" : "validate"} the <span className="font-semibold text-gray-800">{kpiTab === "group" ? "KPI (Group)" : "KPI (Unit)"}</span> setting for
            </p>
            <p className="text-sm font-semibold text-[#1A284F] text-center mb-6">{companyUnit} · {selectedYear}</p>
            <div className="flex items-start gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl mb-6">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              <p className="text-xs text-green-800">
                {isDirector
                  ? <>Setelah disetujui oleh Director (<span className="font-bold">Approved by Director</span>), KPI (Unit) ini akan diteruskan ke <span className="font-bold">HR ICF</span> untuk tahap <span className="font-bold">Validate</span>.</>
                  : <>Once validated by HR ICF, this KPI setting will be marked as <span className="font-bold">Validated</span> and auto-created in Measurement → KPI Tracking.</>}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingAction(null)} className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={isDirector ? handleDirectorApprove : handleValidate}
                className={`flex-1 py-2.5 rounded-full text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                  isDirector ? "bg-[#1A284F] hover:bg-[#243869]" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> {isDirector ? "Confirm Approve" : "Confirm Validate"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showRevisionModal && <RevisionModal onCancel={() => setShowRevisionModal(false)} onConfirm={handleRevision} />}
      {showSuccess && <SuccessModal message={successMessage} onClose={() => setShowSuccess(false)} />}

      {showCancelValidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
            <button onClick={() => setShowCancelValidate(false)} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 mx-auto mb-5">
              <RotateCcw className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Cancel Validation</h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              You are about to cancel validation for <span className="font-semibold text-gray-800">{kpiTab === "group" ? "KPI Group" : "KPI Unit"}</span>
            </p>
            <p className="text-sm font-semibold text-[#1A284F] text-center mb-6">{companyUnit} · {selectedYear}</p>
            <div className="flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl mb-6">
              <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800">This will revert the status to <span className="font-bold">Pending Validation</span>. The Revision, Validate, and Export actions will become available again.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelValidate(false)} className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Keep Validated
              </button>
              <button onClick={handleCancelValidate} className="flex-1 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
