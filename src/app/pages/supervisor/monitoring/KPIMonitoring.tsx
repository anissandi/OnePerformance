// @refresh reset
import React, { useEffect, useState } from "react";
import { Search, TrendingUp, BarChart2, AlertTriangle, AlertCircle, Clock, X, Lock, CheckCircle2, FileText, Eye } from "lucide-react";
import { SUPERVISOR_TEAM_EMPLOYEES, filterMonitoringByModuleAccess } from "../../hr/monitoring/monitoringData";
import { loadWorkflowRecords, normalizeEmployeeId } from "../../shared/appraisalWorkflowStore";

const TEAM_IDS   = ["E002", "E011"];
const TEAM_UNIT  = "PT. RSUP (Industri)";
const TEAM_DIV   = "Divisi Sumber Daya Manusia";
const TEAM_EMPLOYEES = SUPERVISOR_TEAM_EMPLOYEES;

const DEPARTMENT_MAP: Record<string, string> = {
  E002: "Dept. Rekrutmen & Seleksi",
  E011: "Dept. Pengembangan SDM",
};

// Only months tracked so far (matches /measurement/kpi-tracking current state)
const MONTHS: { id: string; label: string }[] = [
  { id: "jan", label: "Jan-26" },
  { id: "feb", label: "Feb-26" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface KPIItemDef {
  no: string;
  section: "A" | "B";
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: "Jumlah" | "Rata-Rata" | "Nilai Akhir";
  bobot: string;
  definisi: string;
  source: string;
  baseline: string;
  target: string;
  polaritas: "Maximize" | "Minimize";
  detailFormula: string;
  monthlyTargets: Record<string, string>; // monthId -> target value
}

// cells: monthId -> kpiNo -> actual value
type CellMap = Record<string, Record<string, string>>;

type StatusPerbaikan = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Ditunda" | "Dibatalkan";
const STATUS_PERBAIKAN_STYLE: Record<StatusPerbaikan, string> = {
  "Belum dilaksanakan": "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai":             "bg-green-50 text-green-700",
  "Ditunda":             "bg-purple-50 text-purple-700",
  "Dibatalkan":          "bg-red-100 text-red-700",
};

interface APDetail {
  id: string; action: string; targetDate: string; pic: string;
  status: StatusPerbaikan; keterangan: string[]; output: string[]; evidence: string[];
}
interface MasalahBlockDetail {
  id: string; masalahUtama: string;
  kenapaA: string; kenapaB: string; kenapaC: string;
  actionPlans: APDetail[];
}
interface RCADetailItem {
  id: string; no: number; periode: string; kpi: string;
  satuan: string; baseline: string; target: string; actual: string;
  masalahBlocks: MasalahBlockDetail[];
}

interface RCAItemDef {
  no: number;
  periode: string;
  kpiIndicator: string;
  target: string;
  actual: string;
  percentage: number;
  approvalStatus: "Pending Approver 1" | "Pending Approver 2" | "Approved" | "Closed";
  actionPlansTotal: number;
  actionPlansDone: number;
  rcaDetail?: RCADetailItem[];
}

interface KPIRecord {
  employeeId: string;
  totalKPI: number;
  submittedKPI: number;
  avgAchievement: number;
  rcaRequired: number;
  rcaCompleted: number;
  kpiDefs: KPIItemDef[];
  cells: CellMap;
  rcaClosedSet: Set<string>; // `${kpiNo}__${monthId}` keys that are Closed
  rcaItems: RCAItemDef[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(s: string): number | null {
  if (!s || s === "—") return null;
  const n = parseFloat(s.replace(/,/g, "").replace(/%$/, "").trim());
  return isNaN(n) ? null : n;
}

function computePct(actual: string, target: string, minimize: boolean): string {
  const a = parseNum(actual);
  const t = parseNum(target);
  if (t === null) return "—";
  if (a === null) return "0%";
  if (t === 0) return a === 0 ? "100%" : "0%";
  const pct = minimize ? (a <= t ? 100 : (t / a) * 100) : (a / t) * 100;
  return pct.toFixed(1) + "%";
}

function pctStyle(val: string): { text: string; bg: string } {
  const n = parseNum(val);
  if (n === null) return { text: "text-gray-400", bg: "" };
  if (n >= 100)  return { text: "text-emerald-700", bg: "bg-emerald-50/80" };
  return              { text: "text-red-600",     bg: "bg-red-50/70" };
}

const PERSP_COLOR: Record<string, { label: string; badge: string }> = {
  Finansial: { label: "text-blue-700",   badge: "bg-blue-100 text-blue-800" },
  Proses:    { label: "text-purple-700", badge: "bg-purple-100 text-purple-800" },
  EHS:       { label: "text-green-700",  badge: "bg-green-100 text-green-800" },
  Customer:  { label: "text-orange-700", badge: "bg-orange-100 text-orange-800" },
  "L&G":     { label: "text-pink-700",   badge: "bg-pink-100 text-pink-800" },
};

const W_NO    = 40;
const W_PERSP = 110;
const W_KPI   = 200;

function computePerspScore(kpis: KPIItemDef[], cells: CellMap): number {
  let wSum = 0; let wTotal = 0;
  kpis.forEach((kpi) => {
    const w = parseNum(kpi.bobot.replace("%", ""));
    if (!w) return;
    const pcts = MONTHS.map((m) => {
      const a = cells[m.id]?.[kpi.no] ?? "";
      const t = kpi.monthlyTargets[m.id] ?? "";
      if (!a || !t) return null;
      return parseNum(computePct(a, t, kpi.polaritas === "Minimize"));
    }).filter((v): v is number => v !== null);
    if (pcts.length) {
      wSum   += (pcts.reduce((a, b) => a + b, 0) / pcts.length) * w;
      wTotal += w;
    }
  });
  return wTotal ? Math.round(wSum / wTotal) : 0;
}

// ─── Mock data – E002 ──────────────────────────────────────────────────────────

const DEFS_E002: KPIItemDef[] = [
  {
    no:"1", section:"A", perspektif:"Finansial", kpi:"Efisiensi Biaya Rekrutmen",
    satuan:"% / bulan", formula:"Rata-Rata", bobot:"15%",
    definisi:"Persentase penghematan biaya rekrutmen terhadap anggaran yang ditetapkan.",
    source:"Laporan Keuangan HR", baseline:"80%", target:"85%", polaritas:"Maximize",
    detailFormula:"= Realisasi / Target × 100%",
    monthlyTargets:{ jan:"82", feb:"84" },
  },
  {
    no:"2", section:"A", perspektif:"Finansial", kpi:"Cost per Hire",
    satuan:"Rp Juta / rekrutmen", formula:"Rata-Rata", bobot:"10%",
    definisi:"Rata-rata biaya yang dikeluarkan untuk setiap proses rekrutmen yang berhasil.",
    source:"Laporan Keuangan HR", baseline:"5.5", target:"5", polaritas:"Minimize",
    detailFormula:"= Total Biaya Rekrutmen / Jumlah Hire",
    monthlyTargets:{ jan:"5.2", feb:"5.1" },
  },
  {
    no:"3", section:"B", perspektif:"Proses", kpi:"Time to Fill (Hari)",
    satuan:"Hari / proses", formula:"Rata-Rata", bobot:"15%",
    definisi:"Rata-rata jumlah hari dari permintaan rekrutmen hingga kandidat diterima.",
    source:"Sistem ATS HR", baseline:"35", target:"30", polaritas:"Minimize",
    detailFormula:"= Total Hari / Jumlah Rekrutmen",
    monthlyTargets:{ jan:"32", feb:"31" },
  },
  {
    no:"4", section:"B", perspektif:"Proses", kpi:"Offer Acceptance Rate",
    satuan:"% / bulan", formula:"Rata-Rata", bobot:"10%",
    definisi:"Persentase kandidat yang menerima tawaran pekerjaan dari total penawaran.",
    source:"Laporan Rekrutmen", baseline:"75%", target:"80%", polaritas:"Maximize",
    detailFormula:"= Diterima / Total Penawaran × 100%",
    monthlyTargets:{ jan:"78", feb:"79" },
  },
  {
    no:"5", section:"B", perspektif:"EHS", kpi:"Zero Accident Rekrutmen Event",
    satuan:"Kasus / bulan", formula:"Jumlah", bobot:"10%",
    definisi:"Jumlah kecelakaan pada event rekrutmen (target nol kejadian).",
    source:"Laporan K3 HR", baseline:"0", target:"0", polaritas:"Minimize",
    detailFormula:"= Jumlah kasus kecelakaan pada event rekrutmen",
    monthlyTargets:{ jan:"0", feb:"0" },
  },
  {
    no:"6", section:"B", perspektif:"Customer", kpi:"Hiring Manager Satisfaction",
    satuan:"% / quarter", formula:"Nilai Akhir", bobot:"15%",
    definisi:"Skor kepuasan hiring manager terhadap kualitas kandidat dan proses rekrutmen.",
    source:"Survey Internal HR", baseline:"75%", target:"80%", polaritas:"Maximize",
    detailFormula:"= Hasil survey kepuasan hiring manager",
    monthlyTargets:{ jan:"75", feb:"77" },
  },
  {
    no:"7", section:"B", perspektif:"L&G", kpi:"% Rekruter Bersertifikat",
    satuan:"% / semester", formula:"Nilai Akhir", bobot:"15%",
    definisi:"Persentase rekruter yang memiliki sertifikasi profesional HR.",
    source:"Data Training HR", baseline:"60%", target:"70%", polaritas:"Maximize",
    detailFormula:"= Rekruter Bersertifikat / Total Rekruter × 100%",
    monthlyTargets:{ jan:"65", feb:"67" },
  },
  {
    no:"8", section:"B", perspektif:"L&G", kpi:"Training Compliance Rate",
    satuan:"% / bulan", formula:"Rata-Rata", bobot:"10%",
    definisi:"Persentase karyawan yang mengikuti training wajib sesuai jadwal.",
    source:"Laporan Training HR", baseline:"85%", target:"90%", polaritas:"Maximize",
    detailFormula:"= Peserta Hadir / Total Wajib × 100%",
    monthlyTargets:{ jan:"87", feb:"88" },
  },
];

const CELLS_E002: CellMap = {
  jan: { "1":"80","2":"5.2","3":"35","4":"70","5":"0","6":"76","7":"60","8":"82" },
  feb: { "1":"82","2":"5.0","3":"33","4":"73","5":"0","6":"77","7":"63","8":"84" },
};

// ─── Mock data – E011 ──────────────────────────────────────────────────────────

const DEFS_E011: KPIItemDef[] = [
  {
    no:"1", section:"A", perspektif:"Finansial", kpi:"Anggaran Training Terserap",
    satuan:"% / bulan", formula:"Rata-Rata", bobot:"20%",
    definisi:"Persentase anggaran training yang terserap dari total anggaran yang dialokasikan.",
    source:"Laporan Keuangan HR", baseline:"75%", target:"90%", polaritas:"Maximize",
    detailFormula:"= Realisasi Anggaran / Total Anggaran × 100%",
    monthlyTargets:{ jan:"85", feb:"87" },
  },
  {
    no:"2", section:"B", perspektif:"Proses", kpi:"Jumlah Program Pelatihan Berjalan",
    satuan:"Program / bulan", formula:"Jumlah", bobot:"20%",
    definisi:"Jumlah program pelatihan yang aktif berjalan sesuai jadwal.",
    source:"Laporan Training HR", baseline:"8", target:"12", polaritas:"Maximize",
    detailFormula:"= Jumlah program aktif dalam bulan berjalan",
    monthlyTargets:{ jan:"10", feb:"11" },
  },
  {
    no:"3", section:"B", perspektif:"EHS", kpi:"% Peserta Training Safety Awareness",
    satuan:"% / bulan", formula:"Rata-Rata", bobot:"15%",
    definisi:"Persentase karyawan yang mengikuti training safety awareness dari total wajib.",
    source:"Laporan K3 & Training", baseline:"80%", target:"95%", polaritas:"Maximize",
    detailFormula:"= Peserta Safety Training / Total Wajib × 100%",
    monthlyTargets:{ jan:"90", feb:"92" },
  },
  {
    no:"4", section:"B", perspektif:"Customer", kpi:"Kepuasan Peserta Training",
    satuan:"% / quarter", formula:"Nilai Akhir", bobot:"20%",
    definisi:"Skor kepuasan peserta terhadap materi, metode, dan fasilitator training.",
    source:"Survey Pasca Training", baseline:"78%", target:"85%", polaritas:"Maximize",
    detailFormula:"= Hasil survey kepuasan peserta training",
    monthlyTargets:{ jan:"80", feb:"82" },
  },
  {
    no:"5", section:"B", perspektif:"L&G", kpi:"% Karyawan Mengikuti Min. 1 Training",
    satuan:"% / semester", formula:"Nilai Akhir", bobot:"15%",
    definisi:"Persentase karyawan yang mengikuti minimal satu program training per semester.",
    source:"Data Kehadiran Training", baseline:"70%", target:"80%", polaritas:"Maximize",
    detailFormula:"= Karyawan Mengikuti Training / Total Karyawan × 100%",
    monthlyTargets:{ jan:"75", feb:"77" },
  },
  {
    no:"6", section:"B", perspektif:"L&G", kpi:"Training Effectiveness Rate",
    satuan:"% / semester", formula:"Nilai Akhir", bobot:"10%",
    definisi:"Persentase peserta yang menunjukkan peningkatan kompetensi setelah training.",
    source:"Assessment Pasca Training", baseline:"65%", target:"75%", polaritas:"Maximize",
    detailFormula:"= Peserta Meningkat / Total Peserta Asesmen × 100%",
    monthlyTargets:{ jan:"70", feb:"72" },
  },
];

const CELLS_E011: CellMap = {
  jan: { "1":"45","2":"5","3":"57","4":"48","5":"52","6":"" },
  feb: { "1":"47","2":"6","3":"58","4":"50","5":"53","6":"" },
};

// ─── Records ───────────────────────────────────────────────────────────────────

const KPI_DATA: KPIRecord[] = [];
const _UNUSED_KPI_DATA: KPIRecord[] = [
  {
    employeeId:"E002", totalKPI:8, submittedKPI:8, avgAchievement:98,
    rcaRequired:2, rcaCompleted:2,
    kpiDefs: DEFS_E002, cells: CELLS_E002,
    rcaClosedSet: new Set(["3__feb", "4__jan"]),
    rcaItems: [
      {
        no:1, periode:"Feb 2026", kpiIndicator:"Time to Fill (Hari)", target:"30 hari", actual:"33 hari",
        percentage:90, approvalStatus:"Closed", actionPlansTotal:3, actionPlansDone:3,
        rcaDetail: [{
          id:"rd_e002_1", no:1, periode:"Feb", kpi:"Time to Fill (Hari)", satuan:"Hari / proses",
          baseline:"35 hari", target:"30 hari", actual:"33 hari",
          masalahBlocks: [{
            id:"mb1", masalahUtama:"[Faktor Internal] Proses interview berlapis memerlukan koordinasi lintas departemen",
            kenapaA:"Penjadwalan wawancara melibatkan 4 stakeholder berbeda",
            kenapaB:"Tidak ada platform penjadwalan terpusat untuk proses rekrutmen",
            kenapaC:"Sistem ATS yang ada belum terintegrasi dengan kalender tim hiring manager",
            actionPlans: [
              { id:"ap1", action:"Implementasi fitur scheduling terintegrasi di ATS", targetDate:"2026-03-15", pic:"IT & HR Recruitment", status:"Selesai", keterangan:["Modul sudah live di ATS"], output:["Fitur scheduling aktif"], evidence:["screenshot_ats_scheduling.png"] },
              { id:"ap2", action:"Pelatihan hiring manager penggunaan fitur scheduling ATS", targetDate:"2026-03-20", pic:"HR Recruitment", status:"Selesai", keterangan:["Semua hiring manager sudah dilatih"], output:["Dokumentasi pelatihan"], evidence:["absensi_training.pdf"] },
              { id:"ap3", action:"Review dan optimasi alur approval interview", targetDate:"2026-03-25", pic:"HR Manager", status:"Selesai", keterangan:["Alur baru sudah diimplementasikan, TTF turun ke 28 hari"], output:["SOP alur interview baru"], evidence:["sop_interview_v2.pdf"] },
            ],
          }],
        }],
      },
      {
        no:2, periode:"Jan 2026", kpiIndicator:"Offer Acceptance Rate", target:"80%", actual:"70%",
        percentage:88, approvalStatus:"Pending Approver 1", actionPlansTotal:2, actionPlansDone:1,
        rcaDetail: [{
          id:"rd_e002_2", no:1, periode:"Jan", kpi:"Offer Acceptance Rate", satuan:"% / bulan",
          baseline:"75%", target:"80%", actual:"70%",
          masalahBlocks: [{
            id:"mb2", masalahUtama:"[Faktor Eksternal] Kandidat menolak tawaran karena paket kompensasi tidak kompetitif",
            kenapaA:"Benchmark gaji tidak diperbarui sejak 2 tahun lalu",
            kenapaB:"Anggaran benchmark kompensasi tidak disetujui di awal tahun",
            kenapaC:"Tidak ada prosedur review kompensasi tahunan yang formal",
            actionPlans: [
              { id:"ap4", action:"Lakukan benchmarking kompensasi dengan 3 konsultan HR eksternal", targetDate:"2026-02-28", pic:"HR Manager & Finance", status:"Selesai", keterangan:["Laporan benchmarking diterima dari 2 konsultan"], output:["Laporan benchmarking kompensasi 2026"], evidence:["benchmarking_2026.pdf"] },
              { id:"ap5", action:"Revisi grade kompensasi berdasarkan hasil benchmarking", targetDate:"2026-03-15", pic:"HR Director", status:"Belum dilaksanakan", keterangan:["Menunggu persetujuan Direktur Keuangan"], output:["Struktur kompensasi revisi"], evidence:[] },
            ],
          }],
        }],
      },
    ],
  },
  {
    employeeId:"E011", totalKPI:6, submittedKPI:4, avgAchievement:57,
    rcaRequired:3, rcaCompleted:0,
    kpiDefs: DEFS_E011, cells: CELLS_E011,
    rcaClosedSet: new Set(),
    rcaItems: [
      {
        no:1, periode:"Jan 2026", kpiIndicator:"Anggaran Training Terserap", target:"85%", actual:"45%",
        percentage:53, approvalStatus:"Pending Approver 1", actionPlansTotal:3, actionPlansDone:0,
        rcaDetail: [{
          id:"rd_e011_1", no:1, periode:"Jan", kpi:"Anggaran Training Terserap", satuan:"% / bulan",
          baseline:"75%", target:"85%", actual:"45%",
          masalahBlocks: [{
            id:"mb3", masalahUtama:"[Faktor Internal] Realisasi penyerapan anggaran rendah akibat banyak program training dibatalkan",
            kenapaA:"Vendor training utama membatalkan kontrak secara sepihak",
            kenapaB:"Tidak ada klausul penalti yang cukup kuat dalam kontrak vendor",
            kenapaC:"Review kontrak vendor tidak melibatkan tim legal secara penuh",
            actionPlans: [
              { id:"ap6", action:"Identifikasi vendor training pengganti sesuai TOR", targetDate:"2026-02-15", pic:"HR Training Coordinator", status:"Belum dilaksanakan", keterangan:[], output:["Daftar vendor alternatif"], evidence:[] },
              { id:"ap7", action:"Revisi template kontrak dengan klausul penalti dan force majeure", targetDate:"2026-02-20", pic:"HR & Legal", status:"Belum dilaksanakan", keterangan:[], output:["Template kontrak vendor training baru"], evidence:[] },
              { id:"ap8", action:"Jadwalkan ulang 6 program training yang dibatalkan", targetDate:"2026-03-01", pic:"HR Training", status:"Belum dilaksanakan", keterangan:[], output:["Jadwal training Q1 yang direvisi"], evidence:[] },
            ],
          }],
        }],
      },
      {
        no:2, periode:"Jan 2026", kpiIndicator:"Jumlah Program Pelatihan Berjalan", target:"10", actual:"5",
        percentage:50, approvalStatus:"Pending Approver 1", actionPlansTotal:2, actionPlansDone:0,
        rcaDetail: [{
          id:"rd_e011_2", no:1, periode:"Jan", kpi:"Jumlah Program Pelatihan Berjalan", satuan:"Program / bulan",
          baseline:"8", target:"10", actual:"5",
          masalahBlocks: [{
            id:"mb4", masalahUtama:"[Faktor Internal] Jumlah program aktif hanya 5 dari target 10 program",
            kenapaA:"5 program lainnya tertunda karena fasilitator internal tidak tersedia",
            kenapaB:"Fasilitator merangkap tugas operasional di luar jadwal training",
            kenapaC:"Tidak ada mekanisme proteksi waktu fasilitator dari tugas non-training",
            actionPlans: [
              { id:"ap9", action:"Buat kebijakan perlindungan jadwal fasilitator internal", targetDate:"2026-02-10", pic:"HR Manager", status:"Belum dilaksanakan", keterangan:[], output:["Kebijakan penjadwalan fasilitator"], evidence:[] },
              { id:"ap10", action:"Rekrut 2 fasilitator eksternal untuk backup", targetDate:"2026-02-28", pic:"HR Training", status:"Belum dilaksanakan", keterangan:[], output:["Kontrak fasilitator eksternal"], evidence:[] },
            ],
          }],
        }],
      },
      {
        no:3, periode:"Jan 2026", kpiIndicator:"Kepuasan Peserta Training", target:"80%", actual:"48%",
        percentage:60, approvalStatus:"Pending Approver 1", actionPlansTotal:2, actionPlansDone:0,
        rcaDetail: [{
          id:"rd_e011_3", no:1, periode:"Jan", kpi:"Kepuasan Peserta Training", satuan:"% / quarter",
          baseline:"78%", target:"80%", actual:"48%",
          masalahBlocks: [{
            id:"mb5", masalahUtama:"[Faktor Internal] Skor kepuasan peserta sangat rendah pada training Januari",
            kenapaA:"Materi training tidak relevan dengan kebutuhan aktual peserta",
            kenapaB:"TNA (Training Needs Analysis) tidak dilakukan sebelum program berjalan",
            kenapaC:"Tidak ada prosedur wajib TNA sebelum pengadaan training",
            actionPlans: [
              { id:"ap11", action:"Lakukan TNA menyeluruh sebelum setiap program training baru", targetDate:"2026-02-20", pic:"HR Training Coordinator", status:"Belum dilaksanakan", keterangan:[], output:["Laporan TNA Q1 2026"], evidence:[] },
              { id:"ap12", action:"Revisi kurikulum training berdasarkan hasil TNA", targetDate:"2026-03-01", pic:"HR Training & Dept. Manager", status:"Belum dilaksanakan", keterangan:[], output:["Kurikulum training revisi"], evidence:[] },
            ],
          }],
        }],
      },
    ],
  },
];

// ─── KPI Tracking Table ────────────────────────────────────────────────────────

function KPITrackingTable({ rec }: { rec: KPIRecord }) {
  function ytdActual(kpi: KPIItemDef): string {
    const vals = MONTHS.map((m) => parseNum(rec.cells[m.id]?.[kpi.no] ?? "")).filter((v): v is number => v !== null);
    if (!vals.length) return "—";
    return kpi.formula === "Jumlah"
      ? vals.reduce((a, b) => a + b, 0).toFixed(0)
      : (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  }

  function ytdPct(kpi: KPIItemDef): string {
    const pcts = MONTHS.map((m) => {
      const a = rec.cells[m.id]?.[kpi.no] ?? "";
      const t = kpi.monthlyTargets[m.id] ?? "";
      return parseNum(computePct(a, t, kpi.polaritas === "Minimize"));
    }).filter((v): v is number => v !== null);
    return pcts.length ? (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1) + "%" : "—";
  }

  const sections: ("A" | "B")[] = ["A", "B"];

  return (
    <div className="overflow-x-auto">
      <table className="text-left border-collapse text-[11px]" style={{ minWidth: 1600 }}>
        <thead>
          <tr className="bg-[#1A284F] text-white text-[10px] font-bold uppercase tracking-wide">
            <th rowSpan={2} style={{ position:"sticky", left:0, zIndex:21, background:"#1A284F", minWidth:W_NO, width:W_NO }}
              className="border border-[#243869] px-2 py-2 text-center">No.</th>
            <th rowSpan={2} style={{ position:"sticky", left:W_NO, zIndex:21, background:"#1A284F", minWidth:W_PERSP }}
              className="border border-[#243869] px-3 py-2">Perspektif</th>
            <th rowSpan={2} style={{ position:"sticky", left:W_NO+W_PERSP, zIndex:21, background:"#1A284F", minWidth:W_KPI }}
              className="border border-[#243869] px-3 py-2">KPI</th>
            <th rowSpan={2} className="border border-[#243869] px-3 py-2" style={{ minWidth:110 }}>Satuan</th>
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:88 }}>Formula</th>
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:56 }}>Bobot</th>
            <th rowSpan={2} className="border border-[#243869] px-3 py-2" style={{ minWidth:200 }}>Definisi</th>
            <th rowSpan={2} className="border border-[#243869] px-3 py-2" style={{ minWidth:140 }}>Source Data</th>
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:76 }}>Baseline</th>
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:76 }}>Target</th>
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:88 }}>Polaritas</th>
            <th rowSpan={2} className="border border-[#243869] px-3 py-2" style={{ minWidth:200 }}>Detail Formula</th>
            <th rowSpan={2} className="border border-[#243869] px-3 py-2" style={{ minWidth:130 }}>Sub-Row</th>
            {MONTHS.map((m) => (
              <th key={m.id} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:100 }}>{m.label}</th>
            ))}
            <th rowSpan={2} className="border border-[#243869] px-2 py-2 text-center" style={{ minWidth:90 }}>Total / YTD</th>
          </tr>
          <tr className="bg-[#243869]">
            {MONTHS.map((m) => (
              <th key={m.id} className="border border-[#2d4a8a] py-0.5" style={{ minWidth:100 }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => {
            const items = rec.kpiDefs.filter((k) => k.section === sec);

            // Group by perspektif (preserve order)
            const perspOrder: string[] = [];
            const perspMap = new Map<string, KPIItemDef[]>();
            items.forEach((kpi) => {
              if (!perspMap.has(kpi.perspektif)) { perspMap.set(kpi.perspektif, []); perspOrder.push(kpi.perspektif); }
              perspMap.get(kpi.perspektif)!.push(kpi);
            });

            return (
              <React.Fragment key={sec}>
                {/* Section header */}
                <tr>
                  <td colSpan={13 + MONTHS.length + 1}
                    className={`py-1.5 px-4 text-[10px] font-bold text-white ${sec === "A" ? "bg-[#1565C0]" : "bg-[#1976D2]"}`}>
                    {sec === "A" ? "A. Objective KPI" : "B. Functional KPI"}
                  </td>
                </tr>

                {perspOrder.flatMap((persp) => {
                  const perspKPIs   = perspMap.get(persp)!;
                  const perspScore  = computePerspScore(perspKPIs, rec.cells);
                  const perspRSpan  = perspKPIs.length * 3;
                  const pc          = PERSP_COLOR[persp] ?? { label: "text-gray-700", badge: "bg-gray-100 text-gray-700" };

                  return perspKPIs.flatMap((kpi, kpiIdx) =>
                    (["actual", "target", "computed"] as const).map((subKey, si) => {
                      const isActual   = subKey === "actual";
                      const isTarget   = subKey === "target";
                      const isComputed = subKey === "computed";
                      const rowBg = isComputed ? "bg-emerald-50/60" : isTarget ? "bg-sky-50/40" : "bg-white";

                      return (
                        <tr key={`${kpi.no}_${si}`} className={`border-t border-gray-100 ${rowBg}`}>

                          {/* Perspektif — only first sub-row of first KPI in persp group */}
                          {si === 0 && kpiIdx === 0 && (
                            <td
                              rowSpan={perspRSpan}
                              style={{ position:"sticky", left:W_NO, zIndex:10, background:"white", minWidth:W_PERSP, verticalAlign:"middle" }}
                              className="border border-gray-200 px-3 py-3 text-center"
                            >
                              <span className={`text-xs font-bold leading-tight text-center ${pc.label}`}>{persp}</span>
                            </td>
                          )}

                          {/* No. — first sub-row of each KPI (rowSpan=3) */}
                          {si === 0 && (
                            <td rowSpan={3}
                              style={{ position:"sticky", left:0, zIndex:10, background:"white", minWidth:W_NO, width:W_NO, verticalAlign:"top" }}
                              className="border border-gray-200 text-center text-xs font-bold text-gray-500 py-2 px-2">
                              {kpi.no}
                            </td>
                          )}

                          {/* KPI name — rowSpan=3 */}
                          {si === 0 && (
                            <td rowSpan={3}
                              style={{ position:"sticky", left:W_NO+W_PERSP, zIndex:10, background:"white", minWidth:W_KPI, verticalAlign:"top" }}
                              className="border border-gray-200 py-2 px-3">
                              <p className="text-[11px] font-semibold text-gray-800 leading-snug">{kpi.kpi}</p>
                            </td>
                          )}

                          {/* Fixed info cells — rowSpan=3, first sub-row only */}
                          {si === 0 && <>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-3 text-[11px] text-gray-600" style={{ minWidth:110 }}>{kpi.satuan}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-2 text-center text-[11px] text-gray-600" style={{ minWidth:88 }}>{kpi.formula}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-2 text-center" style={{ minWidth:56 }}>
                              <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                            </td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-3 text-[11px] text-gray-600 leading-relaxed" style={{ minWidth:200 }}>{kpi.definisi}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-3 text-[11px] text-gray-600" style={{ minWidth:140 }}>{kpi.source}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-2 text-center text-[11px] font-medium text-gray-700" style={{ minWidth:76 }}>{kpi.baseline}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-2 text-center text-[11px] font-bold text-[#1A284F]" style={{ minWidth:76 }}>{kpi.target}</td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-2 text-center" style={{ minWidth:88 }}>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kpi.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                                {kpi.polaritas}
                              </span>
                            </td>
                            <td rowSpan={3} className="border border-gray-200 align-top py-2 px-3 text-[11px] text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth:200 }}>{kpi.detailFormula}</td>
                          </>}

                          {/* Sub-row label */}
                          <td className={`border border-gray-200 py-2 px-3 text-[11px] whitespace-nowrap ${
                            isComputed ? "font-bold text-emerald-800 bg-emerald-50/60" :
                            isTarget   ? "font-semibold text-sky-700 bg-sky-50/40" :
                                         "text-gray-700 bg-white"
                          }`} style={{ minWidth:130 }}>
                            {isActual   ? "Actual" : isTarget ? "Target" : "% Pencapaian"}
                            {isComputed && <span className="ml-1 text-[9px] text-emerald-500 font-normal">(auto)</span>}
                          </td>

                          {/* Monthly cells */}
                          {MONTHS.map((m) => {
                            const actual = rec.cells[m.id]?.[kpi.no] ?? "";
                            const target = kpi.monthlyTargets[m.id] ?? "";
                            const empty  = !actual.trim();

                            if (isActual) {
                              return (
                                <td key={m.id} className={`border py-2 px-2 text-center text-[11px] font-medium ${
                                  empty ? "bg-red-50 border-red-200 text-red-300" : "bg-green-50/40 border-gray-200 text-gray-700"
                                }`} style={{ minWidth:100 }}>
                                  {empty ? "—" : actual}
                                </td>
                              );
                            }

                            if (isTarget) {
                              return (
                                <td key={m.id} className="border border-gray-200 py-2 px-2 text-center text-[11px] bg-sky-50/40" style={{ minWidth:100 }}>
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="font-semibold text-sky-700">{target || "—"}</span>
                                    <Lock className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                                  </div>
                                </td>
                              );
                            }

                            // % Pencapaian
                            const pct     = actual ? computePct(actual, target, kpi.polaritas === "Minimize") : "—";
                            const style   = pctStyle(pct);
                            const rcaKey  = `${kpi.no}__${m.id}`;
                            const isClosed = rec.rcaClosedSet.has(rcaKey);
                            const n       = parseNum(pct);
                            const under   = n !== null && n < 100;

                            return (
                              <td key={m.id} className={`border border-gray-200 py-1.5 px-1.5 text-center ${style.bg}`} style={{ minWidth:100 }}>
                                <span className={`text-[11px] font-bold ${style.text}`}>{pct}</span>
                              </td>
                            );
                          })}

                          {/* YTD — rowSpan=3, rendered only on Actual row */}
                          {isActual && (() => {
                            const yp = ytdPct(kpi);
                            const ys = pctStyle(yp);
                            return (
                              <td rowSpan={3} className={`border border-gray-200 text-center px-2 py-2 align-middle ${ys.bg}`} style={{ minWidth:90 }}>
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] text-gray-500">Actual</span>
                                  <span className="text-xs font-semibold text-gray-700">{ytdActual(kpi)}</span>
                                  <span className="text-[10px] text-gray-500 mt-0.5">% YTD</span>
                                  <span className={`text-xs font-bold ${ys.text}`}>{yp}</span>
                                </div>
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── KPI-only modal ────────────────────────────────────────────────────────────

function KPIModal({ rec, empName, onClose }: { rec: KPIRecord; empName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
        <div>
          <p className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-[#1A284F]" />
            KPI Tracking — {empName}
          </p>
          <p className="text-xs text-gray-400">{DEPARTMENT_MAP[rec.employeeId] ?? ""} · 2026</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      <div className="flex gap-4 px-8 pt-4 pb-2 flex-shrink-0 flex-wrap">
        {[
          { label:"Total KPI",        value: rec.totalKPI,                        color:"text-[#1A284F]", bg:"bg-[#1A284F]/5" },
          { label:"Submitted",        value:`${rec.submittedKPI}/${rec.totalKPI}`, color:"text-green-700", bg:"bg-green-50" },
          { label:"Avg. Achievement", value:`${rec.avgAchievement}%`,             color:"text-blue-700",  bg:"bg-blue-50" },
          { label:"RCA Required",     value: rec.rcaRequired,                     color:"text-rose-700",  bg:"bg-rose-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-gray-100 px-4 py-3 ${s.bg}`}>
            <p className="text-[10px] text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <KPITrackingTable rec={rec} />
        </div>
        <p className="text-[10px] text-gray-400 mt-3">
          Actual (hijau muda) = data diinput karyawan · Target (biru, dikunci) = dari KPI Setting ·
          % Pencapaian (hijau ≥ 100%, merah &lt; 100%) = dihitung otomatis
        </p>
      </div>
    </div>
  );
}

// ─── Helpers for RCA detail ────────────────────────────────────────────────────

function parseMasalahDetail(masalahUtama: string) {
  const isInternal  = masalahUtama.startsWith("[Faktor Internal]");
  const isEksternal = masalahUtama.startsWith("[Faktor Eksternal]");
  const hasFactor   = isInternal || isEksternal;
  const bodyText    = hasFactor ? masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : masalahUtama;
  const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
  return { isInternal, bodyText, factorLabel };
}

// ─── Full RCA preview table (read-only, measurement/rca format) ────────────────

function RCAFullTable({ data }: { data: RCADetailItem[] }) {
  if (!data.length) return <div className="text-center py-10 text-gray-400 text-sm">Belum ada data RCA.</div>;
  const th = "border border-[#1A284F]/30 py-3 px-3 text-center font-semibold text-xs";
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="border-collapse text-xs" style={{ minWidth: 1900 }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {([["No",42],["Periode",72],["KPI",160],["Satuan",90],["Baseline",90],["Target",80],["Actual",80],
              ["Masalah Utama (A)",180],["Kenapa A? (B)",150],["Kenapa B? (C)",150],["Kenapa C? (D)",150],
              ["Action Plan",180],["Target Penyelesaian",120],["PIC",120],["Status Perbaikan",130],
              ["Keterangan",160],["Output",160],["Evidence",160]] as [string,number][]).map(([h, w]) => (
              <th key={h} className={th} style={{ minWidth: w }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.flatMap((item) => {
            const totalItemRows = item.masalahBlocks.reduce((s, b) => s + Math.max(1, b.actionPlans.length), 0);
            const td = "border border-gray-200 align-top py-2 px-3 bg-white";
            return item.masalahBlocks.flatMap((block, bi) => {
              const { isInternal, bodyText, factorLabel } = parseMasalahDetail(block.masalahUtama);
              const blockRows = Math.max(1, block.actionPlans.length);
              const aps = block.actionPlans.length > 0 ? block.actionPlans : [null as APDetail | null];
              return aps.map((ap, ai) => (
                <tr key={`${item.id}_${bi}_${ai}`} className="border-t border-gray-200">
                  {bi === 0 && ai === 0 && (
                    <>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-semibold text-gray-600`}>{item.no}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center`}><span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode || "—"}</span></td>
                      <td rowSpan={totalItemRows} className={`${td} font-medium text-gray-800`}>{item.kpi || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-gray-600`}>{item.satuan || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-gray-500 italic`}>{item.baseline || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-bold text-[#1A284F]`}>{item.target || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-bold text-rose-600`}>{item.actual || "—"}</td>
                    </>
                  )}
                  {ai === 0 && (
                    <>
                      <td rowSpan={blockRows} className={`${td} text-gray-700 leading-relaxed`}>
                        {factorLabel && (
                          <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${isInternal ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                            {factorLabel}
                          </span>
                        )}
                        <p>{bodyText || "—"}</p>
                      </td>
                      <td rowSpan={blockRows} className={`${td} text-gray-700 leading-relaxed`}>{block.kenapaA || "—"}</td>
                      <td rowSpan={blockRows} className={`${td} text-gray-700 leading-relaxed`}>{block.kenapaB || "—"}</td>
                      <td rowSpan={blockRows} className={`${td} text-gray-700 leading-relaxed`}>{block.kenapaC || "—"}</td>
                    </>
                  )}
                  {ap ? (
                    <>
                      <td className="border border-gray-200 py-2 px-3 text-gray-700 leading-relaxed bg-blue-50/20">{ap.action || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-center text-gray-600 bg-blue-50/20">{ap.targetDate || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-gray-600 bg-blue-50/20">{ap.pic || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-center bg-blue-50/20">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_PERBAIKAN_STYLE[ap.status]}`}>{ap.status}</span>
                      </td>
                      <td className="border border-gray-200 py-2 px-3 bg-blue-50/20">
                        {ap.keterangan.length > 0
                          ? <ul className="flex flex-col gap-0.5">{ap.keterangan.map((k, ki) => <li key={ki} className="text-[10px] leading-relaxed">• {k}</li>)}</ul>
                          : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                      <td className="border border-gray-200 py-2 px-3 bg-blue-50/20">
                        {ap.output.length > 0
                          ? <ul className="flex flex-col gap-0.5">{ap.output.map((o, oi) => <li key={oi} className="text-[10px] leading-relaxed">• {o}</li>)}</ul>
                          : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                      <td className="border border-gray-200 py-2 px-3 bg-blue-50/20">
                        {ap.evidence.length > 0
                          ? <div className="flex flex-col gap-0.5">{ap.evidence.map((ev, ei) => <span key={ei} className="flex items-center gap-1 text-[10px] text-green-700 font-medium"><FileText className="w-3 h-3 shrink-0" />{ev}</span>)}</div>
                          : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                    </>
                  ) : (
                    <td colSpan={7} className="border border-gray-200 py-2 px-3 text-center text-gray-300 bg-blue-50/20">Belum ada action plan</td>
                  )}
                </tr>
              ));
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RCA Detail Drawer ─────────────────────────────────────────────────────────

function RCADetailDrawer({ item, empName, onClose }: { item: RCAItemDef; empName: string; onClose: () => void }) {
  const ApprovalBadge = ({ status }: { status: RCAItemDef["approvalStatus"] }) => {
    const map: Record<string, string> = {
      "Pending Approver 1": "bg-amber-50 text-amber-700 border-amber-200",
      "Pending Approver 2": "bg-blue-50 text-blue-700 border-blue-200",
      Approved:             "bg-green-50 text-green-700 border-green-200",
      Closed:               "bg-gray-100 text-gray-600 border-gray-300",
    };
    return <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border ${map[status]}`}>{status}</span>;
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">Detail RCA — {empName}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{item.kpiIndicator} · {item.periode}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0 transition-colors">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 px-8 py-3 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">Target:</span>
            <span className="font-bold text-[#1A284F]">{item.target}</span>
          </div>
          <div className="w-px h-4 bg-gray-200 self-center" />
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">Actual:</span>
            <span className="font-bold text-rose-600">{item.actual}</span>
          </div>
          <div className="w-px h-4 bg-gray-200 self-center" />
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">% Pencapaian:</span>
            <span className={`font-bold ${item.percentage >= 80 ? "text-amber-600" : "text-rose-600"}`}>{item.percentage}%</span>
          </div>
          <div className="w-px h-4 bg-gray-200 self-center" />
          <ApprovalBadge status={item.approvalStatus} />
          <div className="ml-auto flex items-center gap-1.5 text-xs">
            <span className="text-gray-400">Progress:</span>
            <span className={`font-bold ${item.actionPlansDone === item.actionPlansTotal ? "text-green-700" : "text-amber-700"}`}>
              {item.actionPlansDone}/{item.actionPlansTotal} Action Plans
            </span>
            {item.actionPlansDone === item.actionPlansTotal && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {item.rcaDetail && item.rcaDetail.length > 0 ? (
            <>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                Tabel RCA — Format Measurement/RCA
              </p>
              <RCAFullTable data={item.rcaDetail} />
              <p className="text-[10px] text-gray-400 mt-3">
                Data RCA diisi oleh karyawan melalui modul <span className="font-semibold">Measurement → RCA</span> dan disetujui oleh approver.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-500">Belum ada data RCA detail</p>
              <p className="text-xs text-gray-400">Karyawan belum mengisi RCA untuk indikator ini.</p>
            </div>
          )}
        </div>
    </div>
  );
}

// ─── RCA-only modal ────────────────────────────────────────────────────────────

function RCAModal({ rec, empName, onClose }: { rec: KPIRecord; empName: string; onClose: () => void }) {
  const [drawerItem, setDrawerItem] = useState<RCAItemDef | null>(null);

  function ApprovalBadge({ status }: { status: RCAItemDef["approvalStatus"] }) {
    const map: Record<string, string> = {
      "Pending Approver 1": "bg-amber-50 text-amber-700 border-amber-200",
      "Pending Approver 2": "bg-blue-50 text-blue-700 border-blue-200",
      Approved:             "bg-green-50 text-green-700 border-green-200",
      Closed:               "bg-gray-100 text-gray-500 border-gray-200",
    };
    return (
      <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${map[status]}`}>
        {status}
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
        <div>
          <p className="text-base font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            RCA — {empName}
          </p>
          <p className="text-xs text-gray-400">{DEPARTMENT_MAP[rec.employeeId] ?? ""} · 2026</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      <div className="flex gap-4 px-8 pt-4 pb-2 flex-shrink-0 flex-wrap">
        {[
          { label:"RCA Required",  value: rec.rcaRequired,                   color:"text-rose-700",  bg:"bg-rose-50" },
          { label:"RCA Completed", value: rec.rcaCompleted,                  color:"text-green-700", bg:"bg-green-50" },
          { label:"Pending",       value: rec.rcaRequired - rec.rcaCompleted, color:"text-amber-700", bg:"bg-amber-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-gray-100 px-4 py-3 ${s.bg}`}>
            <p className="text-[10px] text-gray-500 mb-0.5">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#1A284F] text-white text-[10px] font-bold uppercase tracking-wide">
                  <th className="py-3 px-4 text-center w-10">No.</th>
                  <th className="py-3 px-4 text-center">Detail RCA</th>
                  <th className="py-3 px-4">Periode</th>
                  <th className="py-3 px-4">KPI Indicator</th>
                  <th className="py-3 px-4 text-center">Target</th>
                  <th className="py-3 px-4 text-center">Actual</th>
                  <th className="py-3 px-4 text-center">% Pencapaian</th>
                  <th className="py-3 px-4 text-center">Approval Status</th>
                  <th className="py-3 px-4 text-center">Action Plans</th>
                  <th className="py-3 px-4 text-center">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rec.rcaItems.length === 0 ? (
                  <tr><td colSpan={10} className="py-14 text-center text-sm text-gray-400 italic">Tidak ada data RCA</td></tr>
                ) : rec.rcaItems.map((rca) => (
                  <tr key={rca.no} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 text-center text-gray-400 font-semibold">{rca.no}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setDrawerItem(rca)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#1A284F] bg-[#1A284F]/8 hover:bg-[#1A284F]/15 border border-[#1A284F]/20 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                      >
                        <Eye className="w-3 h-3" /> Detail
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-700 whitespace-nowrap">{rca.periode}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-800 leading-snug">{rca.kpiIndicator}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-gray-700">{rca.target}</td>
                    <td className="py-3.5 px-4 text-center font-semibold text-rose-600">{rca.actual}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`text-sm font-bold ${rca.percentage >= 80 ? "text-amber-600" : "text-rose-600"}`}>{rca.percentage}%</span>
                    </td>
                    <td className="py-3.5 px-4 text-center"><ApprovalBadge status={rca.approvalStatus} /></td>
                    <td className="py-3.5 px-4 text-center font-semibold text-gray-700">{rca.actionPlansTotal}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        rca.actionPlansDone === rca.actionPlansTotal
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>
                        {rca.actionPlansDone === rca.actionPlansTotal && <CheckCircle2 className="w-3 h-3" />}
                        {rca.actionPlansDone}/{rca.actionPlansTotal} Done
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerItem && (
        <RCADetailDrawer
          item={drawerItem}
          empName={empName}
          onClose={() => setDrawerItem(null)}
        />
      )}
    </div>
  );
}

// ─── Achievement bar ───────────────────────────────────────────────────────────

function AchievementBar({ value }: { value: number }) {
  const color = value === 0 ? "bg-gray-200" : value >= 100 ? "bg-emerald-500" : value >= 75 ? "bg-blue-400" : value >= 50 ? "bg-amber-400" : "bg-rose-500";
  const text  = value === 0 ? "text-gray-400" : value >= 100 ? "text-emerald-700" : value >= 75 ? "text-blue-700" : value >= 50 ? "text-amber-700" : "text-rose-600";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${text}`}>{value > 0 ? `${value}%` : "—"}</span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const KPI_WORKFLOW_STATUS_STYLE: Record<string, { bg: string; icon: React.ElementType }> = {
  "Unsubmitted":        { bg: "bg-gray-100 text-gray-500",     icon: AlertCircle },
  "Pending-Check":      { bg: "bg-amber-100 text-amber-700",   icon: Clock },
  "Pending-Approver 1": { bg: "bg-amber-100 text-amber-700",   icon: Clock },
  "Pending-Approver 2": { bg: "bg-sky-100 text-sky-700",       icon: Clock },
  "Pending-Validate":   { bg: "bg-indigo-100 text-indigo-700", icon: Clock },
  "Revision":           { bg: "bg-orange-100 text-orange-700", icon: AlertCircle },
  "Validated":          { bg: "bg-green-100 text-green-700",   icon: CheckCircle2 },
};

function resolveSupKpiPhaseStatus(rec?: ReturnType<typeof loadWorkflowRecords>[number]): string {
  if (!rec) return "Unsubmitted";
  const val = rec.decisions.validator?.status ?? "";
  const a2 = rec.decisions.approver2?.status ?? "";
  const a1 = rec.decisions.approver1?.status ?? "";
  const chk = rec.decisions.checker?.status ?? "";
  if (val === "Revision" || a2 === "Revision" || a1 === "Revision" || chk === "Revision") {
    return "Revision";
  }
  if (val === "Validated" || a2 === "Validated") {
    return "Validated";
  }
  if (a2 === "Approved" || a2.startsWith("Assessed")) {
    return "Pending-Validate";
  }
  if (a1 === "Approved" || a1.startsWith("Assessed")) {
    return "Pending-Approver 2";
  }
  if (chk && chk !== "Revision") {
    return "Pending-Approver 1";
  }
  return "Pending-Check";
}

export function SupervisorMonitoringKPI() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);
  const [search, setSearch]     = useState("");
  const [kpiModal, setKpiModal] = useState<{ rec: KPIRecord; empName: string } | null>(null);
  const [rcaModal, setRcaModal] = useState<{ rec: KPIRecord; empName: string } | null>(null);

  const allowedTeamEmployees = filterMonitoringByModuleAccess(TEAM_EMPLOYEES, "KPI (Setting/Measurement)");
  const workflows = loadWorkflowRecords();
  const rows = allowedTeamEmployees
    .map((emp, idx) => {
      const normId = normalizeEmployeeId(emp.id);
      const wfSet = workflows.find(
        (w) => w.year === "2026" && w.module === "KPI" && w.phase === "setting" && (w.employeeId === normId || w.employeeId.toLowerCase() === emp.id.toLowerCase()),
      );
      const wfMeas = workflows.find(
        (w) => w.year === "2026" && w.module === "KPI" && w.phase === "measurement" && (w.employeeId === normId || w.employeeId.toLowerCase() === emp.id.toLowerCase()),
      );
      const setApproved = Boolean(
        wfSet?.decisions.validator?.status === "Validated" ||
          wfSet?.decisions.approver2?.status === "Validated",
      );
      const settingStatus = resolveSupKpiPhaseStatus(wfSet);
      const measurementStatus = resolveSupKpiPhaseStatus(wfMeas);
      const hasActiveKpi = Boolean(setApproved || wfMeas);
      const kpi: KPIRecord = hasActiveKpi
        ? {
            employeeId: emp.id,
            totalKPI: KPI_DEFS_E002.length,
            submittedKPI: wfMeas ? KPI_DEFS_E002.length : 0,
            avgAchievement: wfMeas ? 85 : 0,
            rcaRequired: 0,
            rcaCompleted: 0,
            kpiDefs: KPI_DEFS_E002,
            cells: wfMeas ? CELLS_E002 : {},
            rcaClosedSet: new Set<string>(),
            rcaItems: [],
          }
        : {
            employeeId: emp.id,
            totalKPI: 0,
            submittedKPI: 0,
            avgAchievement: 0,
            rcaRequired: 0,
            rcaCompleted: 0,
            kpiDefs: [],
            cells: {},
            rcaClosedSet: new Set<string>(),
            rcaItems: [],
          };
      return { idx, emp, kpi, settingStatus, measurementStatus };
    })
    .filter(({ emp }) => !search || emp.name.toLowerCase().includes(search.toLowerCase()) || emp.id.toLowerCase().includes(search.toLowerCase()));

  const totalSubmitted = KPI_DATA.filter((k) => k.totalKPI > 0 && k.submittedKPI === k.totalKPI).length;
  const avgAch         = KPI_DATA.length ? Math.round(KPI_DATA.reduce((s, k) => s + k.avgAchievement, 0) / KPI_DATA.length) : 0;
  const rcaPending     = KPI_DATA.reduce((s, k) => s + (k.rcaRequired - k.rcaCompleted), 0);

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">KPI Monitoring</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">My Team</span>
        </div>
        <p className="text-gray-500 text-sm">{TEAM_UNIT} · {TEAM_DIV}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:"Team Members",     value: TEAM_EMPLOYEES.length,           sub:"in your department",                              color:"text-[#1A284F]", bg:"bg-[#1A284F]/5" },
          { label:"Fully Submitted",  value: totalSubmitted,                  sub:`${TEAM_EMPLOYEES.length - totalSubmitted} incomplete`, color:"text-green-700", bg:"bg-green-50" },
          { label:"Avg. Achievement", value:`${avgAch}%`,                     sub:"across active KPIs",                              color:"text-blue-700",  bg:"bg-blue-50" },
          { label:"Pending RCA",      value: rcaPending,                      sub:"requires follow-up",                              color:"text-rose-700",  bg:"bg-rose-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID..."
            className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400" />
        </div>
        <span className="ml-auto text-xs text-gray-400">{rows.length} members shown</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-5 text-center w-10">No.</th>
                <th className="py-3 px-5 text-center">Action</th>
                <th className="py-3 px-5">Employee ID</th>
                <th className="py-3 px-5">Employee Name</th>
                <th className="py-3 px-5">Company Unit</th>
                <th className="py-3 px-5">Division</th>
                <th className="py-3 px-5">Department</th>
                <th className="py-3 px-5">Position</th>
                <th className="py-3 px-5 text-center">Total KPI</th>
                <th className="py-3 px-5 text-center">Submitted</th>
                <th className="py-3 px-5">Avg. Achievement</th>
                <th className="py-3 px-5 text-center">RCA Req.</th>
                <th className="py-3 px-5 text-center">RCA Done</th>
                <th className="py-3 px-5">KPI Setting Status</th>
                <th className="py-3 px-5">KPI Measurement Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ idx, emp, kpi, settingStatus, measurementStatus }) => {
                const setSt = KPI_WORKFLOW_STATUS_STYLE[settingStatus] ?? KPI_WORKFLOW_STATUS_STYLE["Unsubmitted"];
                const SetIcon = setSt.icon;
                const measSt = KPI_WORKFLOW_STATUS_STYLE[measurementStatus] ?? KPI_WORKFLOW_STATUS_STYLE["Unsubmitted"];
                const MeasIcon = measSt.icon;
                return (
                <tr key={emp.id} className={emp.isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/60 transition-colors"}>
                  <td className="py-3.5 px-5 text-center text-xs font-semibold text-gray-400">{idx + 1}</td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setKpiModal({ rec: kpi, empName: emp.name })}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#1A284F] hover:bg-[#243869] rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap">
                        <BarChart2 className="w-3 h-3" /> KPI
                      </button>
                      <button onClick={() => setRcaModal({ rec: kpi, empName: emp.name })}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap">
                        <AlertTriangle className="w-3 h-3" /> RCA
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="text-[11px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded">{emp.id}</span>
                  </td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{emp.name}</p>
                      {emp.isSelf && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Data Saya
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-5"><p className="text-sm text-gray-700 whitespace-nowrap">{emp.unit}</p></td>
                  <td className="py-3.5 px-5"><p className="text-sm text-gray-700 whitespace-nowrap">{emp.division}</p></td>
                  <td className="py-3.5 px-5"><p className="text-sm text-gray-700 whitespace-nowrap">{emp.department ?? DEPARTMENT_MAP[emp.id] ?? "—"}</p></td>
                  <td className="py-3.5 px-5"><p className="text-sm text-gray-700 whitespace-nowrap">{emp.position}</p></td>
                  <td className="py-3.5 px-5 text-center text-sm font-medium text-gray-700">{kpi.totalKPI}</td>
                  <td className="py-3.5 px-5 text-center text-sm font-medium text-gray-700">{kpi.submittedKPI}/{kpi.totalKPI}</td>
                  <td className="py-3.5 px-5"><AchievementBar value={kpi.avgAchievement} /></td>
                  <td className="py-3.5 px-5 text-center">
                    <span className={`text-sm font-semibold ${kpi.rcaRequired > 0 ? "text-rose-600" : "text-gray-400"}`}>{kpi.rcaRequired}</span>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    {kpi.rcaRequired > 0
                      ? <span className={`text-sm font-semibold ${kpi.rcaCompleted === kpi.rcaRequired ? "text-green-600" : "text-amber-600"}`}>{kpi.rcaCompleted}/{kpi.rcaRequired}</span>
                      : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="py-3.5 px-5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${setSt.bg}`}>
                      <SetIcon className="w-3 h-3" />
                      {settingStatus}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${measSt.bg}`}>
                      <MeasIcon className="w-3 h-3" />
                      {measurementStatus}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">No data matches the search.</div>}
      </div>

      {kpiModal && <KPIModal rec={kpiModal.rec} empName={kpiModal.empName} onClose={() => setKpiModal(null)} />}
      {rcaModal && <RCAModal rec={rcaModal.rec} empName={rcaModal.empName} onClose={() => setRcaModal(null)} />}
    </div>
  );
}
