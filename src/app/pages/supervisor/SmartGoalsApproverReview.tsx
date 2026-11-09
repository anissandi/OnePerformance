import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, XCircle, Eye, X, ChevronRight, Search, Filter, ThumbsUp, RotateCcw, Lightbulb, User, Calendar, Target, AlertTriangle, Activity, TrendingUp, ChevronDown, ChevronUp, Paperclip, Star, Info, BarChart2 } from "lucide-react";
import { EMPLOYEES } from "../hr/monitoring/monitoringData";
import { loadSubmittedGoals, upsertApprovalDecision } from "../shared/smartGoalsStore";
import { ROWS, SAMPLE_GOALS } from "../employee/SMARTGoals";
import type { SmartGoal } from "../employee/SMARTGoals";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = "Pending Review" | "Approved" | "Needs Revision";
type LocalStatus = "-" | "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Batal";
type AchievementStatus = "" | "Tercapai" | "Tidak Tercapai";

interface TargetActualMock {
  goalId: number;
  actual: string;
  status: AchievementStatus;
  alasan: string;
  evidenceCount: number;
}

interface EmployeeSubmission {
  employeeId: string;
  submittedDate: string;
  goals: SmartGoal[];
  actionPlanStatuses: Record<number, LocalStatus>;
  targetActuals: TargetActualMock[];
  status: ApprovalStatus;
  approverFeedback: string;
  approverScore: string;
  reviewedDate?: string;
}

// ─── Mock data ──────────────────────────────────────────────────────────────

// Sample goals with action plans already have IDs 1-3 goals, APs 1-9
// We define mock AP statuses keyed by AP id
const SAMPLE_AP_STATUSES: Record<number, LocalStatus> = {
  1: "Selesai",
  2: "Sedang dilaksanakan",
  3: "Belum dilaksanakan",
  4: "Selesai",
  5: "Selesai",
  6: "Batal",
  7: "Selesai",
  8: "Sedang dilaksanakan",
  9: "Belum dilaksanakan",
};

const GOALS_E011: SmartGoal[] = [
  {
    id: 101, label: "Goals 1",
    specific: "Meningkatkan kualitas rekrutmen dengan mempercepat proses seleksi kandidat hingga 30% lebih efisien pada semester 2 tahun 2026.",
    measurable: "Diukur melalui waktu rata-rata dari posting lowongan hingga offer letter yang dilacak di sistem ATS setiap bulan.",
    attainable: "Optimasi alur screening, penggunaan alat asesmen online, dan koordinasi lebih ketat dengan hiring manager.",
    relevant: "Efisiensi rekrutmen mendukung pertumbuhan organisasi dan mengurangi biaya per hire.",
    timely: "Target tercapai di Q4 2026 dengan review bulanan terhadap waktu siklus rekrutmen.",
    bukti: "Laporan ATS bulanan; perbandingan rata-rata waktu siklus Q1 vs Q4 2026.",
    target: "Waktu siklus rekrutmen rata-rata ≤ 21 hari (dari 30 hari di Q1 2026)",
    actionPlans: [
      { id: 1001, description: "Implementasi screening otomatis dengan ATS baru" },
      { id: 1002, description: "Pelatihan hiring manager tentang teknik wawancara terstruktur" },
    ],
  },
  {
    id: 102, label: "Goals 2",
    specific: "Menyelesaikan sertifikasi Certified Professional Recruiter (CPR) untuk meningkatkan kompetensi rekrutmen.",
    measurable: "Sertifikasi diperoleh dan terdokumentasi; skor ujian minimum 80%.",
    attainable: "Mendaftar program sertifikasi online; belajar mandiri 5 jam per minggu.",
    relevant: "Sertifikasi meningkatkan kredibilitas profesional dan kualitas proses rekrutmen.",
    timely: "Ujian sertifikasi diselesaikan sebelum akhir Q3 2026.",
    bukti: "Sertifikat CPR yang diterbitkan; bukti registrasi program; hasil ujian.",
    target: "Sertifikat CPR diperoleh dengan skor ujian ≥ 80% sebelum 30 September 2026",
    actionPlans: [
      { id: 1003, description: "Mendaftar dan melunasi biaya program sertifikasi CPR online" },
      { id: 1004, description: "Belajar mandiri modul 1–5 (bulan Juli–Agustus)" },
      { id: 1005, description: "Mengikuti ujian sertifikasi CPR" },
    ],
  },
];

const AP_STATUSES_E011: Record<number, LocalStatus> = {
  1001: "Selesai",
  1002: "Belum dilaksanakan",
  1003: "Selesai",
  1004: "Sedang dilaksanakan",
  1005: "-",
};

const GOALS_E009: SmartGoal[] = [
  {
    id: 401, label: "Goals 1",
    specific: "Meningkatkan produktivitas lahan perkebunan kelapa sawit di blok B12 sebesar 15% melalui optimasi pemupukan dan manajemen air.",
    measurable: "Produksi TBS per hektar diukur setiap panen dan dibandingkan dengan baseline tahun 2025.",
    attainable: "Implementasi jadwal pemupukan presisi, sistem irigasi tetes, dan monitoring kondisi tanah bulanan.",
    relevant: "Produktivitas lahan secara langsung memengaruhi revenue perkebunan dan efisiensi biaya operasional.",
    timely: "Target dicapai pada musim panen utama Q3 2026; review progres di Q2 2026.",
    bukti: "Data produksi TBS per hektar per panen; laporan pemupukan dan irigasi; perbandingan dengan data 2025.",
    target: "Produksi TBS blok B12 meningkat ≥ 15% vs baseline 2025 (dari 18 ton/ha → 20,7 ton/ha)",
    actionPlans: [
      { id: 2001, description: "Audit kondisi tanah dan peta kebutuhan pupuk blok B12" },
      { id: 2002, description: "Instalasi sistem irigasi tetes di area prioritas" },
      { id: 2003, description: "Monitoring dan pelaporan produksi TBS bulanan" },
    ],
  },
  {
    id: 402, label: "Goals 2",
    specific: "Menyelesaikan pelatihan sertifikasi RSPO untuk mendukung standar keberlanjutan perkebunan.",
    measurable: "Sertifikat RSPO diperoleh dan terdaftar; peserta lulus dengan nilai minimum yang ditetapkan.",
    attainable: "Mendaftar program pelatihan RSPO yang disetujui perusahaan; mengalokasikan 3 hari untuk pelatihan intensif.",
    relevant: "Sertifikasi RSPO mendukung kepatuhan perusahaan terhadap standar internasional.",
    timely: "Pelatihan selesai sebelum akhir Q2 2026.",
    bukti: "Sertifikat RSPO; bukti kehadiran pelatihan; laporan implementasi praktik berkelanjutan.",
    target: "Sertifikat RSPO diperoleh sebelum 30 Juni 2026",
    actionPlans: [
      { id: 2004, description: "Mendaftar program pelatihan RSPO resmi" },
      { id: 2005, description: "Mengikuti pelatihan intensif 3 hari" },
    ],
  },
];

const AP_STATUSES_E009: Record<number, LocalStatus> = {
  2001: "Selesai",
  2002: "Selesai",
  2003: "Sedang dilaksanakan",
  2004: "Selesai",
  2005: "Selesai",
};

const MOCK_SUBMISSIONS: EmployeeSubmission[] = [
  {
    employeeId: "E002",
    submittedDate: "28/05/2026",
    goals: SAMPLE_GOALS,
    actionPlanStatuses: SAMPLE_AP_STATUSES,
    targetActuals: [
      { goalId: SAMPLE_GOALS[0]?.id ?? 1, actual: "Uptime 98%", status: "Tidak Tercapai", alasan: "Terjadi 2 insiden P1 akibat kegagalan switch jaringan yang belum di-upgrade.", evidenceCount: 0 },
      { goalId: SAMPLE_GOALS[1]?.id ?? 2, actual: "NPS 76", status: "Tidak Tercapai", alasan: "Penurunan disebabkan gangguan layanan di Q2; sudah ada rencana perbaikan di Q3.", evidenceCount: 0 },
      { goalId: SAMPLE_GOALS[2]?.id ?? 3, actual: "Rp 1,8M penghematan", status: "Tercapai", alasan: "", evidenceCount: 2 },
    ],
    status: "Pending Review",
    approverFeedback: "",
    approverScore: "",
  },
  {
    employeeId: "E011",
    submittedDate: "30/05/2026",
    goals: GOALS_E011,
    actionPlanStatuses: AP_STATUSES_E011,
    targetActuals: [
      { goalId: 101, actual: "Waktu siklus 24 hari", status: "Tidak Tercapai", alasan: "Keterlambatan respons dari hiring manager di beberapa departemen menyebabkan proses melambat.", evidenceCount: 0 },
      { goalId: 102, actual: "Sedang dalam proses ujian", status: "", alasan: "", evidenceCount: 0 },
    ],
    status: "Pending Review",
    approverFeedback: "",
  },
  {
    employeeId: "E004",
    submittedDate: "20/05/2026",
    goals: [
      {
        id: 201, label: "Goals 1",
        specific: "Meningkatkan konversi prospek menjadi pelanggan aktif sebesar 20% melalui strategi pemasaran digital.",
        measurable: "Tingkat konversi dilacak di CRM setiap minggu; laporan bulanan dibandingkan dengan baseline Q1 2026.",
        attainable: "Mengimplementasikan kampanye email drip, retargeting digital, dan program loyalitas.",
        relevant: "Peningkatan konversi langsung mendorong pendapatan dan mendukung target pertumbuhan ARR.",
        timely: "Target peningkatan 20% dicapai pada Q4 2026 dengan milestone di setiap kuartal.",
        bukti: "Laporan CRM kuartalan; perbandingan tingkat konversi Q1 vs Q4 2026; data revenue baru.",
        target: "Tingkat konversi prospek → pelanggan aktif naik dari 12% (Q1) menjadi 14,4% (Q4 2026)",
        actionPlans: [
          { id: 3001, description: "Setup kampanye email drip 5-tahap untuk prospek baru" },
          { id: 3002, description: "Launch program loyalitas pelanggan lama" },
          { id: 3003, description: "Audit dan optimasi retargeting ads Google & Meta" },
        ],
      },
    ],
    actionPlanStatuses: { 3001: "Selesai", 3002: "Selesai", 3003: "Selesai" },
    targetActuals: [
      { goalId: 201, actual: "Konversi 15,2%", status: "Tercapai", alasan: "", evidenceCount: 3 },
    ],
    status: "Approved",
    approverFeedback: "Goals sangat relevan dan terukur dengan baik. Target 20% konversi sejalan dengan strategi pemasaran perusahaan. Disetujui.",
    approverScore: "88",
    reviewedDate: "02/06/2026",
  },
  {
    employeeId: "E007",
    submittedDate: "25/05/2026",
    goals: [
      {
        id: 301, label: "Goals 1",
        specific: "Menyusun laporan keuangan bulanan dengan akurasi 100% dan menyerahkan tepat waktu setiap tanggal 5.",
        measurable: "Jumlah kesalahan pada laporan keuangan dan tanggal penyerahan dicatat dan dievaluasi setiap bulan.",
        attainable: "Menggunakan template standar, checklist validasi, dan review berjenjang sebelum finalisasi laporan.",
        relevant: "Akurasi laporan keuangan adalah fondasi pengambilan keputusan manajemen dan kepatuhan regulasi.",
        timely: "Target akurasi 100% dipertahankan sepanjang tahun 2026; evaluasi per semester.",
        bukti: "Catatan tanggal penyerahan; log koreksi dan revisi laporan; feedback dari kepala divisi keuangan.",
        target: "Zero restatement pada laporan keuangan bulanan dan penyerahan tepat waktu ≥ 11 dari 12 bulan",
        actionPlans: [
          { id: 4001, description: "Membuat checklist validasi laporan keuangan bulanan" },
          { id: 4002, description: "Review berjenjang dengan senior akuntan sebelum finalisasi" },
        ],
      },
    ],
    actionPlanStatuses: { 4001: "Selesai", 4002: "Sedang dilaksanakan" },
    targetActuals: [
      { goalId: 301, actual: "8 dari 12 bulan tepat waktu (s/d Juni 2026)", status: "Tidak Tercapai", alasan: "Keterlambatan data dari divisi operasional di bulan Maret dan April menyebabkan penyerahan mundur.", evidenceCount: 0 },
    ],
    status: "Needs Revision",
    approverFeedback: "Target akurasi 100% perlu didefinisikan lebih spesifik — apakah itu zero restatement atau toleransi tertentu? Mohon perjelas metrik pengukuran dan tambahkan detail mekanisme validasi yang akan digunakan.",
    approverScore: "",
    reviewedDate: "01/06/2026",
  },
  {
    employeeId: "E009",
    submittedDate: "01/06/2026",
    goals: GOALS_E009,
    actionPlanStatuses: AP_STATUSES_E009,
    targetActuals: [
      { goalId: 401, actual: "19,4 ton/ha (blok B12 Q2)", status: "Tidak Tercapai", alasan: "Curah hujan tinggi di Maret–April mengganggu jadwal pemupukan; sudah ada rencana catch-up di Q3.", evidenceCount: 0 },
      { goalId: 402, actual: "Sertifikat RSPO diperoleh 15 Juni 2026", status: "Tercapai", alasan: "", evidenceCount: 1 },
    ],
    status: "Pending Review",
    approverFeedback: "",
  },
];

// ─── Status styling ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApprovalStatus, { bg: string; text: string; border: string; icon: React.ElementType; dot: string }> = {
  "Pending Review": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Clock, dot: "bg-amber-400" },
  "Approved":       { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", icon: CheckCircle2, dot: "bg-green-500" },
  "Needs Revision": { bg: "bg-rose-50",  text: "text-rose-700",  border: "border-rose-200",  icon: XCircle, dot: "bg-rose-500" },
};

const AP_STATUS_COLOR: Record<LocalStatus, string> = {
  "-":                   "bg-gray-100 text-gray-400 border border-gray-200",
  "Belum dilaksanakan":  "bg-gray-100 text-gray-500",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-700",
  "Selesai":             "bg-green-100 text-green-700",
  "Batal":               "bg-red-100 text-red-600",
};

const AP_STATUS_DOT: Record<LocalStatus, string> = {
  "-":                   "bg-gray-300",
  "Belum dilaksanakan":  "bg-gray-400",
  "Sedang dilaksanakan": "bg-amber-500",
  "Selesai":             "bg-green-500",
  "Batal":               "bg-red-500",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function progressBarColor(pct: number): string {
  const hue = Math.round(pct * 1.2);
  return `hsl(${hue}, 72%, 44%)`;
}

function computeStats(goals: SmartGoal[], apStatuses: Record<number, LocalStatus>) {
  let selesai = 0, sedang = 0, belum = 0, batal = 0, dash = 0;
  goals.forEach((g) =>
    g.actionPlans.forEach((ap) => {
      const s = apStatuses[ap.id] ?? "-";
      if (s === "Selesai") selesai++;
      else if (s === "Sedang dilaksanakan") sedang++;
      else if (s === "Belum dilaksanakan") belum++;
      else if (s === "Batal") batal++;
      else dash++;
    })
  );
  const totalAPs = goals.reduce((s, g) => s + g.actionPlans.length, 0);
  const closedGoals = goals.filter((g) =>
    g.actionPlans.length > 0 &&
    g.actionPlans.every((ap) => (apStatuses[ap.id] ?? "-") === "Selesai")
  ).length;
  return { selesai, sedang, belum, batal, dash, totalAPs, closedGoals };
}

// ─── Status Overview (read-only AccumulationCard) ───────────────────────────

function StatusOverviewCard({
  goals,
  apStatuses,
}: {
  goals: SmartGoal[];
  apStatuses: Record<number, LocalStatus>;
}) {
  const { selesai, sedang, belum, batal, dash, totalAPs, closedGoals } = computeStats(goals, apStatuses);
  const totalGoals = goals.length;
  const openGoals = totalGoals - closedGoals;
  const goalsPct = totalGoals > 0 ? Math.round((closedGoals / totalGoals) * 100) : 0;
  const closedAPs = selesai;
  const openAPs = sedang + belum + dash;
  const apPct = totalAPs > 0 ? Math.round((closedAPs / totalAPs) * 100) : 0;

  return (
    <div className="border border-[#1A284F]/20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A284F] to-[#253660] shadow-sm">
      <div className="px-5 py-2.5 flex items-center gap-2 border-b border-white/10">
        <Activity className="w-3.5 h-3.5 text-white/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Status Progress Keseluruhan</span>
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-4 divide-x divide-white/10">
        {/* Goals */}
        <div className="flex flex-col gap-2 pr-4">
          <div className="flex items-center gap-1.5">
            <Target className="w-3 h-3 text-blue-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Goals</span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-bold text-white leading-none">{totalGoals}</span>
            <span className="text-xs text-white/50 mb-0.5">Total</span>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-white/50">Open</span><span className="font-semibold text-white">{openGoals}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Closed</span><span className="font-semibold text-green-400">{closedGoals}</span></div>
          </div>
          <div className="flex flex-col gap-1 mt-0.5">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${goalsPct}%` }} />
            </div>
            <span className="text-[10px] text-white/40">{goalsPct}%</span>
          </div>
        </div>

        {/* Action Plans */}
        <div className="flex flex-col gap-2 px-4">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-green-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Action Plans</span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-2xl font-bold text-white leading-none">{totalAPs}</span>
            <span className="text-xs text-white/50 mb-0.5">Total</span>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex justify-between"><span className="text-white/50">Open</span><span className="font-semibold text-white">{openAPs}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Closed</span><span className="font-semibold text-green-400">{closedAPs}</span></div>
          </div>
          <div className="flex flex-col gap-1 mt-0.5">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${apPct}%` }} />
            </div>
            <span className="text-[10px] text-white/40">{apPct}%</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex flex-col gap-2 pl-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Breakdown Status</span>
          <div className="flex flex-col gap-1.5">
            {[
              { label: "Selesai", count: selesai, dot: "bg-green-500", text: "text-green-400" },
              { label: "Sedang", count: sedang, dot: "bg-amber-400", text: "text-amber-400" },
              { label: "Belum", count: belum, dot: "bg-gray-400", text: "text-gray-400" },
              { label: "Batal", count: batal, dot: "bg-red-500", text: "text-red-400" },
            ].map(({ label, count, dot, text }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <span className="text-[11px] text-white/60">{label}</span>
                </div>
                <span className={`text-xs font-bold ${text}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Goal Review Card ────────────────────────────────────────────────────────

function GoalReviewCard({
  goal,
  apStatuses,
  defaultOpen,
}: {
  goal: SmartGoal;
  apStatuses: Record<number, LocalStatus>;
  defaultOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  const selesaiCount = goal.actionPlans.filter((ap) => (apStatuses[ap.id] ?? "-") === "Selesai").length;
  const totalAPs = goal.actionPlans.length;
  const pct = totalAPs > 0 ? Math.round((selesaiCount / totalAPs) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Goal header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[#1A284F] text-left"
      >
        <span className="text-white text-sm font-bold flex-1">{goal.label}</span>
        <div className="flex items-center gap-3">
          {totalAPs > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-white/60 font-semibold">{selesaiCount}/{totalAPs} AP</span>
            </div>
          )}
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-white/60" />
            : <ChevronUp className="w-4 h-4 text-white/60" />}
        </div>
      </button>

      {!collapsed && (
        <div className="p-4 bg-white flex flex-col gap-4">
          {/* SMART criteria — compact 2-col table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-36 border-r border-white/20">Kriteria</th>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide">Uraian (diisi karyawan)</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                    <td className="border-t border-gray-100 border-r border-gray-100 px-3 py-2 align-middle whitespace-nowrap">
                      <span className="font-semibold text-[11px] text-gray-700">{row.title}</span>
                    </td>
                    <td className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-700 leading-relaxed">
                      {(goal[row.key as keyof SmartGoal] as string) || (
                        <span className="italic text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Plans — horizontal status table */}
          {goal.actionPlans.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#1A284F]">Status Action Plans</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + goal.actionPlans.length * 160}px` }}>
                  <thead>
                    <tr>
                      <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-24 align-middle border-r border-white/20">Action Plan</th>
                      {goal.actionPlans.map((ap, idx) => (
                        <th key={ap.id} className={`bg-[#1A284F] text-white text-center px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${idx < goal.actionPlans.length - 1 ? "border-r border-white/20" : ""}`}>
                          AP {idx + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-top">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Deskripsi</span>
                      </td>
                      {goal.actionPlans.map((ap, idx) => (
                        <td key={ap.id} className={`border-t border-gray-200 px-3 py-2 align-top text-[11px] text-gray-700 leading-relaxed ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                          <div className="flex items-start gap-1.5">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[9px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                            <span>{ap.description}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2 align-middle">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</span>
                      </td>
                      {goal.actionPlans.map((ap, idx) => {
                        const st = apStatuses[ap.id] ?? "-";
                        return (
                          <td key={ap.id} className={`border-t border-gray-200 px-2 py-2 text-center align-middle ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}>
                            <span className={`inline-flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 font-semibold leading-tight ${AP_STATUS_COLOR[st]}`}>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${AP_STATUS_DOT[st]}`} />
                              {st === "-" ? "—" : st === "Belum dilaksanakan" ? "Belum" : st === "Sedang dilaksanakan" ? "Berjalan" : st}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Target vs Actual — read-only ───────────────────────────────────────────

function TargetActualReadOnly({
  goals,
  targetActuals,
}: {
  goals: SmartGoal[];
  targetActuals: TargetActualMock[];
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-3 bg-[#1A284F] gap-2">
        <BarChart2 className="w-4 h-4 text-green-300" />
        <span className="text-white text-sm font-bold flex-1">Target vs Actual</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "600px" }}>
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-28">Goals</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-56">Target</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-40">Actual (karyawan)</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-100 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Status &amp; Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal, idx) => {
              const ta = targetActuals.find((t) => t.goalId === goal.id);
              return (
                <tr key={goal.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                  <td className="border-t border-gray-100 px-4 py-3 align-top">
                    <span className="font-semibold text-[11px] text-gray-700">{goal.label}</span>
                  </td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                    <span className="text-[11px] text-gray-500 italic leading-relaxed">{goal.target || "—"}</span>
                  </td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                    <span className="text-[11px] text-gray-800 font-medium">{ta?.actual || <span className="italic text-gray-300">—</span>}</span>
                  </td>
                  <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                    {!ta?.status ? (
                      <span className="text-[11px] text-gray-300 italic">Belum diisi</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full w-fit ${
                          ta.status === "Tercapai"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ta.status === "Tercapai" ? "bg-green-500" : "bg-red-500"}`} />
                          {ta.status}
                        </span>
                        {ta.status === "Tidak Tercapai" && ta.alasan && (
                          <div className="bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 max-w-xs">
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-0.5">Alasan</p>
                            <p className="text-[11px] text-red-700 leading-relaxed">{ta.alasan}</p>
                          </div>
                        )}
                        {ta.status === "Tercapai" && ta.evidenceCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <Paperclip className="w-3 h-3 text-green-600" />
                            <span className="text-[11px] text-green-700 font-medium">{ta.evidenceCount} file evidence</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Approver Decision Panel ─────────────────────────────────────────────────

function ApproverDecision({
  submission,
  feedback,
  score,
  onFeedbackChange,
  onScoreChange,
}: {
  submission: EmployeeSubmission;
  feedback: string;
  score: string;
  onFeedbackChange: (v: string) => void;
  onScoreChange: (v: string) => void;
}) {
  const isPending = submission.status === "Pending Review";
  const scoreNum = parseFloat(score);
  const scoreColor =
    !score ? "text-gray-400"
    : scoreNum >= 90 ? "text-emerald-700"
    : scoreNum >= 75 ? "text-blue-700"
    : scoreNum >= 60 ? "text-amber-700"
    : "text-rose-600";

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-4 py-3 bg-[#1A284F] gap-2">
        <Star className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">Keputusan Approver</span>
        {!isPending && (
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_CONFIG[submission.status].bg} ${STATUS_CONFIG[submission.status].text} ${STATUS_CONFIG[submission.status].border}`}>
            {React.createElement(STATUS_CONFIG[submission.status].icon, { className: "w-3 h-3" })}
            {submission.status}
          </span>
        )}
      </div>
      <div className="p-4 bg-white flex flex-col gap-3">
        {isPending ? (
          <>
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-500" />
              <span>Berikan nilai dan catatan sebelum mengambil keputusan. Nilai bersifat opsional namun direkomendasikan.</span>
            </div>

            {/* Score input */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Nilai / Score (0–100)</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => onScoreChange(e.target.value)}
                  placeholder="—"
                  className="w-28 text-2xl font-black text-center text-[#1A284F] bg-white border-2 border-[#1A284F]/20 rounded-xl px-3 py-2.5 outline-none focus:border-[#1A284F]/60 placeholder-gray-300 transition-all"
                />
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(Math.max(scoreNum || 0, 0), 100)}%`,
                      background: `hsl(${Math.round((scoreNum || 0) * 1.2)}, 65%, 42%)`,
                    }}
                  />
                </div>
                <span className={`text-sm font-bold w-10 text-right ${scoreColor}`}>
                  {score || "—"}
                </span>
              </div>
            </div>

            {/* Feedback textarea */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Catatan / Feedback Approver</label>
              <textarea
                value={feedback}
                onChange={(e) => onFeedbackChange(e.target.value)}
                placeholder="Tulis catatan, masukan, atau arahan untuk karyawan terkait SMART Goals yang disubmit…"
                rows={4}
                className="w-full text-sm text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none resize-none focus:border-[#1A284F]/40 placeholder-gray-400 transition-all"
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Score display */}
            <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Nilai / Score</span>
                {submission.approverScore ? (
                  <span className={`text-3xl font-black leading-none ${scoreColor}`}>
                    {submission.approverScore}
                    <span className="text-sm font-semibold text-gray-400 ml-0.5">/100</span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-400 italic">Tidak ada nilai</span>
                )}
              </div>
              {submission.approverScore && (
                <div className="flex-1 flex flex-col gap-1">
                  <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(parseFloat(submission.approverScore) || 0, 100)}%`,
                        background: `hsl(${Math.round((parseFloat(submission.approverScore) || 0) * 1.2)}, 65%, 42%)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Feedback display */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Feedback Approver</label>
              <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed border ${
                submission.status === "Approved"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}>
                {submission.approverFeedback || <span className="italic text-gray-400">Tidak ada feedback.</span>}
              </div>
              {submission.reviewedDate && (
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />Direview pada {submission.reviewedDate}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Modal ──────────────────────────────────────────────────────────

function ConfirmModal({
  action, employeeName, onCancel, onConfirm,
}: {
  action: "approve" | "revision";
  employeeName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = action === "approve";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isApprove ? "bg-green-50" : "bg-amber-50"}`}>
          {isApprove ? <ThumbsUp className="w-6 h-6 text-green-600" /> : <RotateCcw className="w-6 h-6 text-amber-600" />}
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">{isApprove ? "Approve SMART Goals?" : "Request Revision?"}</h3>
        <p className="text-gray-500 text-sm mb-6">
          {isApprove
            ? `SMART Goals yang disubmit oleh ${employeeName} akan disetujui.`
            : `SMART Goals ${employeeName} akan dikembalikan untuk direvisi.`}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Batal</button>
          <button onClick={onConfirm} className={`px-6 py-2 rounded-full text-white text-sm font-semibold transition-colors ${isApprove ? "bg-green-600 hover:bg-green-700" : "bg-amber-500 hover:bg-amber-600"}`}>
            {isApprove ? "Ya, Approve" : "Ya, Request Revisi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────

function DetailDrawer({
  submission, employeeName, employeePosition, employeeUnit,
  onClose, onApprove, onRequestRevision,
}: {
  submission: EmployeeSubmission;
  employeeName: string;
  employeePosition: string;
  employeeUnit: string;
  onClose: () => void;
  onApprove: (feedback: string, score: string) => void;
  onRequestRevision: (feedback: string, score: string) => void;
}) {
  const [feedback, setFeedback] = useState(submission.approverFeedback);
  const [score, setScore] = useState(submission.approverScore);
  const [confirmAction, setConfirmAction] = useState<"approve" | "revision" | null>(null);

  const isPending = submission.status === "Pending Review";
  const statusCfg = STATUS_CONFIG[submission.status];
  const StatusIcon = statusCfg.icon;

  const handleConfirm = () => {
    if (confirmAction === "approve") onApprove(feedback, score);
    else if (confirmAction === "revision") onRequestRevision(feedback, score);
    setConfirmAction(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-4xl bg-white shadow-2xl flex flex-col">

        {/* ── Drawer header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1A284F] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-base leading-tight">{employeeName}</p>
              <p className="text-white/60 text-xs">{employeePosition} · {employeeUnit}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {submission.status}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* ── Drawer body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Meta strip */}
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Calendar, label: "Submitted", value: submission.submittedDate },
              { icon: Target,   label: "Total Goals", value: `${submission.goals.length} goal${submission.goals.length !== 1 ? "s" : ""}` },
              { icon: Activity, label: "Action Plans", value: `${submission.goals.reduce((s, g) => s + g.actionPlans.length, 0)} plans` },
              ...(submission.reviewedDate ? [{ icon: CheckCircle2, label: "Direview", value: submission.reviewedDate }] : []),
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <Icon className="w-3.5 h-3.5 text-gray-400" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold leading-none">{label}</p>
                  <p className="text-xs font-semibold text-gray-700 mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 1 — Status Overview */}
          <StatusOverviewCard goals={submission.goals} apStatuses={submission.actionPlanStatuses} />

          {/* 2 — Per-Goal review cards */}
          <div>
            <p className="text-xs font-bold text-[#1A284F] uppercase tracking-widest mb-3 flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              Detail SMART Goals &amp; Action Plans
            </p>
            <div className="flex flex-col gap-3">
              {submission.goals.map((goal, idx) => (
                <GoalReviewCard
                  key={goal.id}
                  goal={goal}
                  apStatuses={submission.actionPlanStatuses}
                  defaultOpen={idx === 0}
                />
              ))}
            </div>
          </div>

          {/* 3 — Target vs Actual */}
          <TargetActualReadOnly goals={submission.goals} targetActuals={submission.targetActuals} />

          {/* 4 — Approver decision */}
          <ApproverDecision
            submission={submission}
            feedback={feedback}
            score={score}
            onFeedbackChange={setFeedback}
            onScoreChange={setScore}
          />

        </div>

        {/* ── Footer action bar ── */}
        {isPending && (
          <div className="px-6 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Tindakan tidak dapat dibatalkan setelah dikonfirmasi.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction("revision")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />Request Revision
              </button>
              <button
                onClick={() => setConfirmAction("approve")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
              >
                <ThumbsUp className="w-4 h-4" />Approve
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          employeeName={employeeName}
          onCancel={() => setConfirmAction(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function SmartGoalsApproverReview() {
  const [submissions, setSubmissions] = useState<EmployeeSubmission[]>(MOCK_SUBMISSIONS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | ApprovalStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    const live = loadSubmittedGoals();
    if (live && live.length > 0) {
      setSubmissions((prev) =>
        prev.map((s) =>
          s.employeeId === "E002" ? { ...s, goals: live, status: "Pending Review" } : s
        )
      );
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const selectedSub = submissions.find((s) => s.employeeId === selectedId);
  const selectedEmp = EMPLOYEES.find((e) => e.id === selectedId);

  const handleApprove = (feedback: string, score: string) => {
    const reviewedDate = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
    setSubmissions((prev) =>
      prev.map((s) =>
        s.employeeId === selectedId
          ? { ...s, status: "Approved", approverFeedback: feedback, approverScore: score, reviewedDate }
          : s
      )
    );
    if (selectedId) {
      upsertApprovalDecision({
        employeeId: selectedId,
        approverName: "Budi Santoso",
        approverRole: "Atasan Langsung",
        approverLevel: 1,
        status: "Approved",
        feedback,
        score,
        reviewedDate,
      });
    }
    setSelectedId(null);
    showToast("SMART Goals berhasil diapprove.");
  };

  const handleRequestRevision = (feedback: string, score: string) => {
    const reviewedDate = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
    setSubmissions((prev) =>
      prev.map((s) =>
        s.employeeId === selectedId
          ? { ...s, status: "Needs Revision", approverFeedback: feedback, approverScore: score, reviewedDate }
          : s
      )
    );
    if (selectedId) {
      upsertApprovalDecision({
        employeeId: selectedId,
        approverName: "Budi Santoso",
        approverRole: "Atasan Langsung",
        approverLevel: 1,
        status: "Needs Revision",
        feedback,
        score,
        reviewedDate,
      });
    }
    setSelectedId(null);
    showToast("Permintaan revisi telah dikirim ke karyawan.");
  };

  const filtered = submissions
    .map((s) => ({ sub: s, emp: EMPLOYEES.find((e) => e.id === s.employeeId) }))
    .filter(({ sub, emp }) => {
      if (!emp) return false;
      const matchSearch = !search || emp.name.toLowerCase().includes(search.toLowerCase()) || emp.position.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || sub.status === statusFilter;
      return matchSearch && matchStatus;
    });

  const counts = {
    total: submissions.length,
    pending: submissions.filter((s) => s.status === "Pending Review").length,
    approved: submissions.filter((s) => s.status === "Approved").length,
    revision: submissions.filter((s) => s.status === "Needs Revision").length,
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1A284F] text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          {toastMsg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h1 className="text-[28px] font-bold text-[#1A284F]">SMART Goals — Approver Review</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          </div>
          <p className="text-gray-500 text-sm">Review dan setujui SMART Goals Measurement yang disubmit karyawan.</p>
        </div>
        {counts.pending > 0 && (
          <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold">
            <Clock className="w-4 h-4" />{counts.pending} pending review
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Submissions", value: counts.total,    sub: "karyawan",           color: "text-[#1A284F]", bg: "bg-[#1A284F]/5", border: "border-[#1A284F]/10" },
          { label: "Pending Review",    value: counts.pending,  sub: "menunggu keputusan", color: "text-amber-700", bg: "bg-amber-50",    border: "border-amber-100" },
          { label: "Approved",          value: counts.approved, sub: "goals disetujui",    color: "text-green-700", bg: "bg-green-50",    border: "border-green-100" },
          { label: "Needs Revision",    value: counts.revision, sub: "dikembalikan",       color: "text-rose-700",  bg: "bg-rose-50",     border: "border-rose-100" },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border px-5 py-4 ${card.bg} ${card.border}`}>
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau jabatan karyawan…"
            className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "All" | ApprovalStatus)}
            className="text-sm outline-none bg-transparent text-gray-600 cursor-pointer"
          >
            <option value="All">Semua Status</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Needs Revision">Needs Revision</option>
          </select>
        </div>
        {statusFilter !== "All" && (
          <button onClick={() => setStatusFilter("All")} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        )}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} submission ditampilkan</span>
      </div>

      {/* Submission list */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-5">Karyawan</th>
                <th className="py-3 px-5">Unit / Divisi</th>
                <th className="py-3 px-5 text-center">Goals</th>
                <th className="py-3 px-5 text-center">AP Selesai</th>
                <th className="py-3 px-5">Target vs Actual</th>
                <th className="py-3 px-5">Submitted</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(({ sub, emp }) => {
                if (!emp) return null;
                const cfg = STATUS_CONFIG[sub.status];
                const StatusIcon = cfg.icon;
                const { selesai, totalAPs } = computeStats(sub.goals, sub.actionPlanStatuses);
                const apPct = totalAPs > 0 ? Math.round((selesai / totalAPs) * 100) : 0;
                const tercapai = sub.targetActuals.filter((t) => t.status === "Tercapai").length;
                const tidakTercapai = sub.targetActuals.filter((t) => t.status === "Tidak Tercapai").length;

                return (
                  <tr key={sub.employeeId} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#1A284F]/10 flex items-center justify-center shrink-0">
                          <span className="text-[#1A284F] font-bold text-sm">
                            {emp.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                          <p className="text-xs text-gray-400">{emp.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700">{emp.unit}</p>
                      <p className="text-xs text-gray-400">{emp.division}</p>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-sm font-bold">
                        {sub.goals.length}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-semibold text-gray-700">{selesai}/{totalAPs}</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${apPct}%`, backgroundColor: progressBarColor(apPct) }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {tercapai > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            {tercapai} Tercapai
                          </span>
                        )}
                        {tidakTercapai > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            {tidakTercapai} Tdk Tercapai
                          </span>
                        )}
                        {tercapai === 0 && tidakTercapai === 0 && (
                          <span className="text-xs text-gray-300 italic">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-gray-600">{sub.submittedDate}</td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <StatusIcon className="w-3 h-3" />
                        {sub.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => setSelectedId(sub.employeeId)}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          sub.status === "Pending Review"
                            ? "bg-[#1A284F] text-white hover:bg-[#131d3b]"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {sub.status === "Pending Review" ? "Review" : "View"}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">
            Tidak ada submission yang sesuai dengan filter.
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selectedId && selectedSub && selectedEmp && (
        <DetailDrawer
          submission={selectedSub}
          employeeName={selectedEmp.name}
          employeePosition={selectedEmp.position}
          employeeUnit={selectedEmp.unit}
          onClose={() => setSelectedId(null)}
          onApprove={handleApprove}
          onRequestRevision={handleRequestRevision}
        />
      )}
    </div>
  );
}
