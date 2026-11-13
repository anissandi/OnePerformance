import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { loadRCASubmissions, deleteRCASubmission, saveRCASubmission, updateRCASubmissionStatus } from "../shared/rcaStore";
import type { StoredMasalahBlock, StoredRCAActionPlan } from "../shared/rcaStore";
import { uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { DatePickerID } from "../../components/DatePickerID";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import { getActiveUser } from "../../store/authStore";
import {
  Plus, X, Eye, Send, CheckCircle2, Trash2, ChevronDown,
  Clock, ArrowLeft, Info, FilePlus, Upload, FileText, Edit3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = "Pending-Approver 1" | "Pending-Approver 2" | "Approved" | "Closed";
type StatusPerbaikan = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Ditunda" | "Dibatalkan";

interface ActionPlan {
  id: string;
  action: string;
  targetDate: string;
  pic: string;
  status: StatusPerbaikan;
  keterangan: string[];
  output: string[];
  evidence: string[];
}

interface MasalahBlock {
  id: string;
  masalahUtama: string;
  kenapaA: string;
  kenapaB: string;
  kenapaC: string;
  actionPlans: ActionPlan[];
}

interface RCAItem {
  id: string;
  no: number;
  periode: string;
  kpi: string;
  satuan: string;
  baseline: string;
  target: string;
  actual: string;
  masalahBlocks: MasalahBlock[];
}

interface RCARow {
  id: string;
  no: number;
  periode: string;
  kpiIndicator: string;
  targetMonthly: string;
  actual: string;
  rcaPercentage: number;
  approvalStatus: ApprovalStatus;
  year: string;
  submitted: boolean;
  submittedDate: string;
  lastApprovedDate: string;
  rcaData: RCAItem[];
}

interface KPICatalogItem {
  kpi: string; satuan: string; baseline: string; target: string;
  actual: string; periode: string; score: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const YEARS = ["2026","2025","2024"];
const STATUS_OPTIONS: StatusPerbaikan[] = ["Belum dilaksanakan","Sedang dilaksanakan","Selesai","Ditunda","Dibatalkan"];
const STATUS_PERBAIKAN_STYLE: Record<StatusPerbaikan, string> = {
  "Belum dilaksanakan": "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai":             "bg-green-50 text-green-700",
  "Ditunda":             "bg-purple-50 text-purple-700",
  "Dibatalkan":          "bg-red-100 text-red-700",
};

const KPI_CATALOG: KPICatalogItem[] = [
  { kpi: "Implementasi ERP System",      satuan: "% /bulan", baseline: "0%",      target: "100%",      actual: "85%",     periode: "Jan", score: 85 },
  { kpi: "Training Completion Rate",      satuan: "%",        baseline: "70%",     target: "≥ 90%",     actual: "78%",     periode: "Feb", score: 87 },
  { kpi: "Recruitment Cycle Time",        satuan: "hari",     baseline: "40 hari", target: "≤ 30 hari", actual: "35 hari", periode: "Mar", score: 83 },
  { kpi: "Employee Engagement Score",     satuan: "score",    baseline: "3.5",     target: "≥ 4.0",     actual: "3.7",     periode: "Apr", score: 93 },
  { kpi: "Turnover Rate",                 satuan: "%",        baseline: "8%",      target: "≤ 5%",      actual: "7%",      periode: "Mei", score: 71 },
  { kpi: "Cost Per Hire",                 satuan: "Rp juta",  baseline: "15",      target: "≤ 12",      actual: "14",      periode: "Jun", score: 86 },
  { kpi: "Performance Review Completion", satuan: "%",        baseline: "75%",     target: "100%",      actual: "88%",     periode: "Jul", score: 88 },
  { kpi: "Learning Hours Per Employee",   satuan: "jam",      baseline: "20",      target: "≥ 40",      actual: "32",      periode: "Agu", score: 80 },
];

function genId() { return Math.random().toString(36).slice(2, 9); }

function newAction(): ActionPlan {
  return { id: genId(), action: "", targetDate: "", pic: "", status: "Belum dilaksanakan", keterangan: [], output: [], evidence: [] };
}

function newMasalahBlock(): MasalahBlock {
  return { id: genId(), masalahUtama: "", kenapaA: "", kenapaB: "", kenapaC: "", actionPlans: [newAction()] };
}

function allAPs(rcaData: RCAItem[]) {
  return rcaData.flatMap((it) => it.masalahBlocks.flatMap((b) => b.actionPlans));
}
function totalAPs(rcaData: RCAItem[]) {
  return allAPs(rcaData).filter((a) => a.status !== "Dibatalkan").length;
}
function computeProgressAPs(rcaData: RCAItem[], forceHundred = false) {
  if (forceHundred) return 100;
  const aps = allAPs(rcaData);
  const active = aps.filter((a) => a.status !== "Dibatalkan").length;
  if (active === 0) return 0;
  const selesai = aps.filter((a) => a.status === "Selesai").length;
  return Math.round((selesai / active) * 100);
}

// ─── Sample data ──────────────────────────────────────────────────────────────

const ERP_RCA_DATA: RCAItem[] = [{
  id: "r1", no: 1, periode: "Jan", kpi: "Implementasi ERP System", satuan: "% /bulan",
  baseline: "0%", target: "100%", actual: "85%",
  masalahBlocks: [{
    id: "mb_r1_1",
    masalahUtama: "[Faktor Internal] Modul Finance dan HR belum selesai",
    kenapaA: "Tim project kekurangan tenaga ahli modul HR",
    kenapaB: "Rekruten tenaga ahli HR tertunda karena approval anggaran lambat",
    kenapaC: "Proses approval anggaran lambat karena dokumen justifikasi belum lengkap",
    actionPlans: [
      { id: genId(), action: "Penyusunan dokumen justifikasi kebutuhan tenaga ahli modul HR", targetDate: "2027-01-17", pic: "PM ERP & HR Manager", status: "Sedang dilaksanakan", keterangan: ["Draft awal sudah disusun, menunggu data kebutuhan SDM dari HR"], output: ["Draft dokumen justifikasi"], evidence: [] },
      { id: genId(), action: "Permohonan approval dokumen justifikasi kepada Direktur Keuangan", targetDate: "2027-01-18", pic: "PM ERP", status: "Belum dilaksanakan", keterangan: ["Menunggu dokumen final dari tim ERP"], output: ["Dokumen justifikasi disetujui"], evidence: [] },
      { id: genId(), action: "Rekrutmen tenaga ahli modul HR via vendor", targetDate: "2027-02-01", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: ["Menunggu budget approval"], output: ["Tenaga ahli modul HR tersedia"], evidence: [] },
    ],
  }],
}];

const TRAINING_RCA_DATA: RCAItem[] = [{
  id: "r2", no: 1, periode: "Feb", kpi: "Training Completion Rate", satuan: "%",
  baseline: "70%", target: "≥ 90%", actual: "78%",
  masalahBlocks: [{
    id: "mb_r2_1",
    masalahUtama: "[Faktor Internal] Peserta training banyak yang tidak hadir",
    kenapaA: "Jadwal training berbenturan dengan deadline proyek",
    kenapaB: "Koordinasi penjadwalan antara HR dan manajer departemen kurang",
    kenapaC: "Tidak ada sistem reminder otomatis dan konfirmasi kehadiran peserta",
    actionPlans: [
      { id: genId(), action: "Implementasi sistem reminder otomatis H-3 dan H-1", targetDate: "2027-02-28", pic: "HR Training Coordinator", status: "Sedang dilaksanakan", keterangan: ["Sistem sedang dikembangkan oleh tim IT"], output: ["Sistem reminder training aktif"], evidence: [] },
      { id: genId(), action: "Koordinasi jadwal training dengan manajer departemen tiap awal bulan", targetDate: "2027-03-01", pic: "HR Training", status: "Belum dilaksanakan", keterangan: [], output: ["Jadwal training bulanan dikonfirmasi"], evidence: [] },
      { id: genId(), action: "Buat SOP wajib konfirmasi kehadiran H-1 oleh peserta", targetDate: "2027-03-05", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: [], output: ["SOP konfirmasi kehadiran"], evidence: [] },
      { id: genId(), action: "Evaluasi dan laporan completion rate bulanan ke manajemen", targetDate: "2027-03-10", pic: "HR Training Coordinator", status: "Belum dilaksanakan", keterangan: [], output: ["Laporan completion rate bulanan"], evidence: [] },
    ],
  }],
}];

const APPROVED_RCA_DATA: RCAItem[] = [{
  id: "r3", no: 1, periode: "Mar", kpi: "Recruitment Cycle Time", satuan: "hari",
  baseline: "40 hari", target: "≤ 30 hari", actual: "35 hari",
  masalahBlocks: [{
    id: "mb_r3_1",
    masalahUtama: "[Faktor Internal] Proses seleksi kandidat terlalu panjang",
    kenapaA: "Deskripsi pekerjaan tidak spesifik sehingga banyak kandidat tidak sesuai",
    kenapaB: "JD dibuat tanpa konsultasi mendalam dengan user departemen",
    kenapaC: "Tidak ada template standar JD yang mencakup kebutuhan teknis spesifik",
    actionPlans: [
      { id: genId(), action: "Revisi job description bersama user departemen", targetDate: "2027-03-10", pic: "HR Recruitment", status: "Selesai", keterangan: ["JD baru telah disetujui dan dipublikasikan"], output: ["JD revisi disetujui"], evidence: ["jd_revisi_final.pdf"] },
      { id: genId(), action: "Implementasi tes teknis awal sebelum proses seleksi", targetDate: "2027-03-15", pic: "HR & IT", status: "Sedang dilaksanakan", keterangan: ["Modul tes sedang dikonfigurasi"], output: ["Modul tes teknis online aktif"], evidence: [] },
      { id: genId(), action: "Pelatihan rekruter tentang technical screening", targetDate: "2027-03-20", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: [], output: ["Rekruter terlatih screening kandidat"], evidence: [] },
      { id: genId(), action: "Pembuatan template standar JD berdasarkan kompetensi teknis", targetDate: "2027-03-25", pic: "HR & Dept. Manager", status: "Belum dilaksanakan", keterangan: [], output: ["Template JD standar tersedia"], evidence: [] },
      { id: genId(), action: "Review dan update template JD setiap kuartal", targetDate: "2027-04-01", pic: "HR Manager", status: "Belum dilaksanakan", keterangan: [], output: ["Template JD terkini"], evidence: [] },
    ],
  }],
}];

const CLOSED_RCA_DATA_C1: RCAItem[] = [{
  id: "r4", no: 1, periode: "Jan", kpi: "Headcount Fulfilment", satuan: "%",
  baseline: "80%", target: "100%", actual: "80%",
  masalahBlocks: [{
    id: "mb_r4_1",
    masalahUtama: "[Faktor Internal] Posisi kosong belum terisi karena proses seleksi panjang",
    kenapaA: "Kandidat yang lolos seleksi awal tidak memenuhi persyaratan teknis",
    kenapaB: "Deskripsi pekerjaan tidak mencerminkan kebutuhan teknis secara spesifik",
    kenapaC: "Job description dibuat tanpa konsultasi mendalam dengan user departemen",
    actionPlans: [
      { id: genId(), action: "Revisi job description bersama user departemen", targetDate: "2027-01-15", pic: "HR Recruitment", status: "Selesai", keterangan: ["JD baru telah disetujui dan dipublikasikan"], output: ["Job description revisi disetujui"], evidence: ["jd_headcount.pdf"] },
      { id: genId(), action: "Implementasi tes teknis awal sebelum proses seleksi", targetDate: "2027-01-20", pic: "HR & IT", status: "Selesai", keterangan: ["Tes teknis online sudah aktif"], output: ["Modul tes teknis online aktif"], evidence: ["screenshot_tes_online.png"] },
      { id: genId(), action: "Rekrut 3 kandidat dari platform rekrutmen eksternal", targetDate: "2027-01-25", pic: "HR Recruitment", status: "Selesai", keterangan: ["Semua posisi telah terisi"], output: ["3 kandidat onboarding"], evidence: ["offer_letter.pdf"] },
    ],
  }],
}];

const CLOSED_RCA_DATA_C2: RCAItem[] = [{
  id: "r5", no: 1, periode: "Des", kpi: "Employee Retention Rate", satuan: "%",
  baseline: "88%", target: "≥ 95%", actual: "90%",
  masalahBlocks: [{
    id: "mb_r5_1",
    masalahUtama: "[Faktor Eksternal] Tingkat turnover masih di atas target",
    kenapaA: "Karyawan merasa kompensasi tidak kompetitif dibanding pasar",
    kenapaB: "Benchmarking kompensasi belum dilakukan dalam 2 tahun terakhir",
    kenapaC: "Tidak ada anggaran khusus untuk survey kompensasi eksternal",
    actionPlans: [
      { id: genId(), action: "Melakukan benchmarking kompensasi dengan konsultan HR eksternal", targetDate: "2025-12-10", pic: "HR Manager & Finance", status: "Selesai", keterangan: ["Benchmarking selesai, laporan diterima"], output: ["Laporan benchmarking kompensasi"], evidence: ["benchmarking_kompensasi.pdf"] },
      { id: genId(), action: "Revisi struktur kompensasi berdasarkan hasil benchmarking", targetDate: "2025-12-15", pic: "HR Director & Finance", status: "Selesai", keterangan: ["Struktur baru disetujui Direktur"], output: ["Struktur kompensasi revisi"], evidence: ["sk_kompensasi_baru.pdf"] },
      { id: genId(), action: "Sosialisasi perubahan kompensasi kepada seluruh karyawan", targetDate: "2025-12-18", pic: "HR Manager", status: "Selesai", keterangan: ["Town hall dilaksanakan"], output: ["Dokumentasi sosialisasi"], evidence: ["foto_townhall.jpg"] },
      { id: genId(), action: "Implementasi retention bonus untuk karyawan kunci", targetDate: "2025-12-20", pic: "HR & Finance", status: "Selesai", keterangan: ["Bonus sudah dibayarkan"], output: ["Bukti pembayaran retention bonus"], evidence: ["bukti_transfer.pdf"] },
    ],
  }],
}];

const INITIAL_OPEN_ROWS: RCARow[] = [];
const INITIAL_CLOSED_ROWS: RCARow[] = [];

// ─── Shared UI ────────────────────────────────────────────────────────────────

export function loadMeasurementRCARecords() {
  const stored = loadRCASubmissions();
  const defaults = [...INITIAL_OPEN_ROWS, ...INITIAL_CLOSED_ROWS].map((row) => ({
    id: row.id,
    key: `${row.kpiIndicator}__${row.periode}`,
    employeeId: "EMP002",
    year: row.year,
    periode: `${row.periode} ${row.year}`,
    status: row.approvalStatus === "Closed" ? "Closed" as const : "Open" as const,
    problems: row.rcaData.flatMap((item) => item.masalahBlocks.map((block) => block.masalahUtama)),
  }));
  const live = stored.map((row) => ({
    id: row.id, key: row.key, employeeId: row.employeeId ?? "EMP002", year: row.year,
    periode: `${row.periode} ${row.year}`,
    status: row.approvalStatus === "Closed" ? "Closed" as const : "Open" as const,
    problems: row.masalahBlocks?.length ? row.masalahBlocks.map((block) => block.masalahUtama) : row.masalahUtama,
  }));
  return [...defaults.filter((row) => !live.some((item) => item.key === row.key || item.id === row.id)), ...live];
}

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const cfg = {
    "Pending-Approver 1": { cls: "bg-amber-50 text-amber-700 border-amber-200",  icon: Clock        },
    "Pending-Approver 2": { cls: "bg-blue-50 text-blue-700 border-blue-200",     icon: Clock        },
    "Approved":           { cls: "bg-green-50 text-green-700 border-green-200",  icon: CheckCircle2 },
    "Closed":             { cls: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2 },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{status}
    </span>
  );
}

function RCAPercentBar({ pct }: { pct: number }) {
  const color = pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : pct > 0 ? "bg-amber-500" : "bg-gray-200";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold ${pct === 100 ? "text-green-700" : "text-gray-700"}`}>{pct}%</span>
    </div>
  );
}

function FilterSelect({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className={`appearance-none text-xs font-medium pl-3 pr-7 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A284F]/30 ${
            value ? "border-[#1A284F] bg-[#1A284F]/5 text-[#1A284F]" : "border-gray-200 text-gray-600"
          }`}>
          <option value="">All</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── List Editor ──────────────────────────────────────────────────────────────

function ListEditor({ items, onChange, lockCount = 0 }: {
  items: string[]; onChange: (v: string[]) => void; lockCount?: number;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim();
    if (t) { onChange([...items, t]); setDraft(""); }
  };
  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      {items.map((it, idx) => (
        <div key={idx} className="flex items-start gap-1 group">
          <span className="text-[10px] text-gray-700 flex-1 leading-relaxed break-words">{it}</span>
          {idx >= lockCount ? (
            <button onClick={() => onChange(items.filter((_, i) => i !== idx))} className="shrink-0 text-gray-200 hover:text-red-400 transition-colors mt-0.5">
              <X className="w-3 h-3" />
            </button>
          ) : (
            <span className="shrink-0 w-3 h-3 mt-0.5" />
          )}
        </div>
      ))}
      <div className="flex items-center gap-1 mt-0.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder="Tambah…"
          className="flex-1 text-[10px] border border-dashed border-amber-300 rounded px-1.5 py-1 outline-none focus:border-amber-500 bg-amber-50/30 min-w-0"
        />
        <button onClick={commit} className="text-[10px] font-bold text-amber-600 hover:bg-amber-100 px-1.5 py-1 rounded transition-colors">+</button>
      </div>
    </div>
  );
}

// ─── Multi-file Upload ────────────────────────────────────────────────────────

function MultiFileUpload({ files, onChange }: { files: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    rawFiles.forEach((rawFile) => {
      void uploadEvidenceFileToSupabase(rawFile, {
        moduleType: "RCA",
        period: "2026",
        month: "June",
      });
    });
    const newFiles = rawFiles.map((f) => f.name);
    if (newFiles.length) onChange([...files, ...newFiles]);
    e.target.value = "";
  };
  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      {files.map((f, idx) => (
        <div key={idx} className="flex items-center gap-1 text-[10px] text-green-700">
          <FileText className="w-3 h-3 shrink-0 text-green-500" />
          <span className="flex-1 truncate max-w-[120px]" title={f}>{f}</span>
          <button onClick={() => onChange(files.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={() => ref.current?.click()}
        className="flex items-center gap-1.5 text-[10px] text-blue-600 font-medium hover:text-blue-700 mt-0.5 border border-dashed border-blue-300 rounded px-2 py-1 bg-blue-50/40 hover:bg-blue-50 transition-colors">
        <Upload className="w-3 h-3" /> Upload file
      </button>
      <p className="text-[9px] text-gray-400">JPG, PNG, PDF</p>
      <input ref={ref} type="file" accept=".jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={handleFiles} />
    </div>
  );
}

// ─── Helper: parse masalah block display info ─────────────────────────────────

function parseMasalah(masalahUtama: string) {
  const isInternal  = masalahUtama.startsWith("[Faktor Internal]");
  const isEksternal = masalahUtama.startsWith("[Faktor Eksternal]");
  const hasFactor   = isInternal || isEksternal;
  const bodyText    = hasFactor ? masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : masalahUtama;
  const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
  return { hasFactor, isInternal, bodyText, factorLabel };
}

// ─── Preview table (read-only) ────────────────────────────────────────────────

function RCAPreviewTable({ data }: { data: RCAItem[] }) {
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
              const { hasFactor, isInternal, bodyText, factorLabel } = parseMasalah(block.masalahUtama);
              const blockRows = Math.max(1, block.actionPlans.length);
              const aps = block.actionPlans.length > 0 ? block.actionPlans : [null as ActionPlan | null];
              return aps.map((ap, ai) => (
                <tr key={`${item.id}_${bi}_${ai}`} className="border-t border-gray-200">
                  {/* KPI-level columns: span entire item */}
                  {bi === 0 && ai === 0 && (
                    <>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-semibold text-gray-600`}>{item.no}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center`}><span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode || "—"}</span></td>
                      <td rowSpan={totalItemRows} className={`${td} font-medium text-gray-800`}>{item.kpi || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-gray-600`}>{item.satuan || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-gray-500 italic`}>{item.baseline || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-bold text-[#1A284F]`}>{item.target || "—"}</td>
                      <td rowSpan={totalItemRows} className={`${td} text-center font-bold text-gray-800`}>{item.actual || "—"}</td>
                    </>
                  )}
                  {/* Block-level columns: span the block's action plans */}
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
                  {/* Action plan columns */}
                  {ap ? (
                    <>
                      <td className="border border-gray-200 py-2 px-3 text-gray-700 leading-relaxed bg-blue-50/20">{ap.action || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-center text-gray-600 bg-blue-50/20">{ap.targetDate || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-gray-600 bg-blue-50/20">{ap.pic || "—"}</td>
                      <td className="border border-gray-200 py-2 px-3 text-center bg-blue-50/20">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_PERBAIKAN_STYLE[ap.status]}`}>{ap.status}</span>
                      </td>
                      <td className="border border-gray-200 py-2 px-3 text-gray-600 bg-blue-50/20">
                        {ap.keterangan.length > 0
                          ? <ul className="flex flex-col gap-0.5">{ap.keterangan.map((k, ki) => <li key={ki} className="text-[10px] leading-relaxed">• {k}</li>)}</ul>
                          : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                      <td className="border border-gray-200 py-2 px-3 text-gray-600 bg-blue-50/20">
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

// ─── Inline-editable table (Approved — Update Progress) ──────────────────────

function RCAEditableTable({ data, originalData, onChange, showEvidenceErrors }: {
  data: RCAItem[];
  originalData: RCAItem[];
  onChange: (d: RCAItem[]) => void;
  showEvidenceErrors?: boolean;
}) {
  const updateAP = (itemId: string, blockId: string, apId: string, patch: Partial<ActionPlan>) => {
    onChange(data.map((it) =>
      it.id !== itemId ? it : {
        ...it,
        masalahBlocks: it.masalahBlocks.map((b) =>
          b.id !== blockId ? b : {
            ...b,
            actionPlans: b.actionPlans.map((ap) => ap.id !== apId ? ap : { ...ap, ...patch }),
          }
        ),
      }
    ));
  };

  const origAPMap = new Map<string, ActionPlan>();
  originalData.forEach((it) => it.masalahBlocks.forEach((b) => b.actionPlans.forEach((ap) => origAPMap.set(ap.id, ap))));

  if (!data.length) return <div className="text-center py-10 text-gray-400 text-sm">Belum ada data RCA.</div>;
  const th   = "border border-[#1A284F]/30 py-3 px-3 text-center font-semibold text-xs";
  const tdRO = "border border-gray-200 align-top py-2 px-3 bg-white text-gray-700";
  const tdED = "border border-amber-200 align-top py-2 px-2 bg-amber-50/20";

  return (
    <div className="overflow-x-auto rounded-xl border border-amber-200 shadow-sm">
      <table className="border-collapse text-xs" style={{ minWidth: 1900 }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            {([["No",42],["Periode",72],["KPI",160],["Satuan",90],["Baseline",90],["Target",80],["Actual",80],
              ["Masalah Utama (A)",180],["Kenapa A? (B)",150],["Kenapa B? (C)",150],["Kenapa C? (D)",150],
              ["Action Plan",180],["Target Penyelesaian",120],["PIC",120]] as [string,number][]).map(([h, w]) => (
              <th key={h} className={th} style={{ minWidth: w }}>{h}</th>
            ))}
            <th className={`${th} bg-amber-600/90`} style={{ minWidth: 140 }}>Status Perbaikan ✎</th>
            <th className={`${th} bg-amber-600/90`} style={{ minWidth: 180 }}>Keterangan ✎</th>
            <th className={`${th} bg-amber-600/90`} style={{ minWidth: 180 }}>Output ✎</th>
            <th className={`${th} bg-amber-600/90`} style={{ minWidth: 170 }}>Evidence ✎</th>
          </tr>
        </thead>
        <tbody>
          {data.flatMap((item) => {
            const totalItemRows = item.masalahBlocks.reduce((s, b) => s + Math.max(1, b.actionPlans.length), 0);
            return item.masalahBlocks.flatMap((block, bi) => {
              const { hasFactor, isInternal, bodyText, factorLabel } = parseMasalah(block.masalahUtama);
              const blockRows = Math.max(1, block.actionPlans.length);
              const aps = block.actionPlans.length > 0 ? block.actionPlans : [null as ActionPlan | null];
              return aps.map((ap, ai) => {
                const origAP = ap ? origAPMap.get(ap.id) : undefined;
                const outputLock = origAP ? origAP.output.length : 0;
                const evidenceError = showEvidenceErrors && ap?.status === "Selesai" && ap.evidence.length === 0;
                const tdEvidence = evidenceError ? "border-2 border-red-400 align-top py-2 px-2 bg-red-50/30" : tdED;
                return (
                  <tr key={`${item.id}_${bi}_${ai}`} className="border-t border-gray-100">
                    {bi === 0 && ai === 0 && (
                      <>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-center font-semibold text-gray-600`}>{item.no}</td>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-center`}><span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode || "—"}</span></td>
                        <td rowSpan={totalItemRows} className={`${tdRO} font-medium text-gray-800`}>{item.kpi || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-gray-600`}>{item.satuan || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-gray-500 italic`}>{item.baseline || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-center font-bold text-[#1A284F]`}>{item.target || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdRO} text-center font-bold text-gray-800`}>{item.actual || "—"}</td>
                      </>
                    )}
                    {ai === 0 && (
                      <>
                        <td rowSpan={blockRows} className={`${tdRO} leading-relaxed`}>
                          {factorLabel && (
                            <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${isInternal ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                              {factorLabel}
                            </span>
                          )}
                          <p>{bodyText || "—"}</p>
                        </td>
                        <td rowSpan={blockRows} className={`${tdRO} leading-relaxed`}>{block.kenapaA || "—"}</td>
                        <td rowSpan={blockRows} className={`${tdRO} leading-relaxed`}>{block.kenapaB || "—"}</td>
                        <td rowSpan={blockRows} className={`${tdRO} leading-relaxed`}>{block.kenapaC || "—"}</td>
                      </>
                    )}
                    {ap ? (
                      <>
                        <td className={`${tdRO} leading-relaxed`}>{ap.action || "—"}</td>
                        <td className={`${tdRO} text-center`}>{ap.targetDate || "—"}</td>
                        <td className={`${tdRO}`}>{ap.pic || "—"}</td>
                        <td className={tdED}>
                          <select value={ap.status}
                            onChange={(e) => updateAP(item.id, block.id, ap.id, { status: e.target.value as StatusPerbaikan })}
                            className="w-full text-[11px] border border-amber-300 rounded-lg px-2 py-1.5 outline-none focus:border-amber-500 bg-white cursor-pointer">
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <span className={`mt-1.5 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${STATUS_PERBAIKAN_STYLE[ap.status]}`}>{ap.status}</span>
                        </td>
                        <td className={tdED}>
                          <ListEditor items={ap.keterangan} onChange={(v) => updateAP(item.id, block.id, ap.id, { keterangan: v })} />
                        </td>
                        <td className={tdED}>
                          <ListEditor items={ap.output} lockCount={outputLock} onChange={(v) => updateAP(item.id, block.id, ap.id, { output: v })} />
                          {outputLock > 0 && <p className="text-[9px] text-gray-400 mt-1 italic">Data lama tidak dapat dihapus</p>}
                        </td>
                        <td className={tdEvidence}>
                          {ap.status === "Selesai" ? (
                            <>
                              <MultiFileUpload files={ap.evidence} onChange={(v) => updateAP(item.id, block.id, ap.id, { evidence: v })} />
                              {evidenceError && (
                                <p className="text-[10px] text-red-600 font-semibold mt-1 flex items-center gap-1"><span>⚠</span> Wajib Upload Evidence</p>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-gray-300 italic">Tersedia saat Selesai</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="border border-gray-200 py-2 px-3 text-center text-gray-300">Belum ada action plan</td>
                    )}
                  </tr>
                );
              });
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Full editable RCA card (create flow) ─────────────────────────────────────

function RCAInputCard({ item, onChange, onDelete, kpiCatalog }: {
  item: RCAItem; onChange: (u: RCAItem) => void; onDelete: () => void; kpiCatalog?: KPICatalogItem[];
}) {
  const [expanded, setExpanded] = useState(true);
  const set = (field: keyof RCAItem, val: any) => onChange({ ...item, [field]: val });

  const updateBlock = (blockId: string, patch: Partial<MasalahBlock>) =>
    onChange({ ...item, masalahBlocks: item.masalahBlocks.map((b) => b.id !== blockId ? b : { ...b, ...patch }) });

  const deleteBlock = (blockId: string) =>
    onChange({ ...item, masalahBlocks: item.masalahBlocks.filter((b) => b.id !== blockId) });

  const addAP = (blockId: string) => {
    const block = item.masalahBlocks.find((b) => b.id === blockId)!;
    updateBlock(blockId, { actionPlans: [...block.actionPlans, newAction()] });
  };

  const removeAP = (blockId: string, apId: string) => {
    const block = item.masalahBlocks.find((b) => b.id === blockId)!;
    updateBlock(blockId, { actionPlans: block.actionPlans.filter((a) => a.id !== apId) });
  };

  const setAP = (blockId: string, apId: string, field: keyof ActionPlan, val: any) => {
    const block = item.masalahBlocks.find((b) => b.id === blockId)!;
    updateBlock(blockId, { actionPlans: block.actionPlans.map((a) => a.id === apId ? { ...a, [field]: val } : a) });
  };

  const handleKPISelect = (kpiName: string) => {
    if (!kpiCatalog) return;
    const found = kpiCatalog.find((k) => k.kpi === kpiName);
    if (found) onChange({ ...item, kpi: found.kpi, satuan: found.satuan, baseline: found.baseline, target: found.target, actual: found.actual });
    else set("kpi", kpiName);
  };

  // Gate: last masalahBlock must be fully filled before adding another
  const canAddMasalahBlock = (): boolean => {
    if (item.masalahBlocks.length === 0) return true;
    const last = item.masalahBlocks[item.masalahBlocks.length - 1];
    const { hasFactor, bodyText } = parseMasalah(last.masalahUtama);
    const masalahOk = hasFactor && bodyText.trim().length > 0;
    const kenapaOk  = last.kenapaA.trim().length > 0 && last.kenapaB.trim().length > 0 && last.kenapaC.trim().length > 0;
    const apOk      = last.actionPlans.some((ap) => ap.action.trim() && ap.targetDate && ap.pic.trim());
    return masalahOk && kenapaOk && apOk;
  };

  const RO = ({ label, value }: { label: string; value: string }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</label>
      <p className="text-xs text-gray-700 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">{value || "—"}</p>
    </div>
  );
  const Field = ({ label, value, onChange: fc, multiline = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</label>
      {multiline
        ? <textarea value={value} onChange={(e) => fc(e.target.value)} rows={3} placeholder="—" className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
        : <input type="text" value={value} onChange={(e) => fc(e.target.value)} placeholder="—" className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />}
    </div>
  );

  const hasKPICatalog = !!kpiCatalog && kpiCatalog.length > 0;
  const kpiSelected   = hasKPICatalog && kpiCatalog!.some((k) => k.kpi === item.kpi);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#1A284F] cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">{item.no}</span>
          <span className="text-white text-sm font-semibold">{item.kpi || "KPI (belum diisi)"}</span>
          {item.periode && <span className="text-white/60 text-xs">— {item.periode}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:bg-white/20 rounded-lg text-white/50 hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4" /></button>
          <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="p-5 flex flex-col gap-5 bg-white">

          {/* ── KPI Info ── */}
          <div>
            <p className="text-xs font-bold text-[#1A284F] uppercase tracking-widest mb-3">Informasi KPI</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Periode</label>
                <p className="text-xs font-semibold text-[#1A284F] px-3 py-2 bg-[#1A284F]/5 rounded-lg border border-[#1A284F]/20">
                  {MONTHS_ID[new Date().getMonth()]}
                </p>
              </div>
              <div className="lg:col-span-2 flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">KPI</label>
                {hasKPICatalog ? (
                  <div className="relative">
                    <select value={item.kpi} onChange={(e) => handleKPISelect(e.target.value)} className="appearance-none w-full text-xs border border-gray-200 rounded-lg px-3 pr-7 py-2 outline-none focus:border-[#1A284F]">
                      <option value="">— Pilih KPI —</option>
                      {kpiCatalog!.map((k) => <option key={k.kpi} value={k.kpi}>{k.kpi} ({k.periode}, Score {k.score}%)</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  </div>
                ) : <input type="text" value={item.kpi} onChange={(e) => set("kpi", e.target.value)} placeholder="—" className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />}
              </div>
              {kpiSelected ? (
                <><RO label="Satuan" value={item.satuan} /><RO label="Baseline" value={item.baseline} /><RO label="Monthly Target" value={item.target} /></>
              ) : (
                <><Field label="Satuan" value={item.satuan} onChange={(v) => set("satuan", v)} /><Field label="Baseline" value={item.baseline} onChange={(v) => set("baseline", v)} /><Field label="Monthly Target" value={item.target} onChange={(v) => set("target", v)} /></>
              )}
            </div>
            <div className="mt-3 max-w-xs">
              {kpiSelected ? <RO label="Actual" value={item.actual} /> : <Field label="Actual" value={item.actual} onChange={(v) => set("actual", v)} />}
            </div>
            {kpiSelected && (
              <p className="mt-2 text-[10px] text-blue-500 flex items-center gap-1">
                <Info className="w-3 h-3" /> Data KPI diisi otomatis dari KPI Tracking.
                <button className="underline ml-1" onClick={() => onChange({ ...item, kpi: "", satuan: "", baseline: "", target: "", actual: "", periode: "" })}>Reset</button>
              </p>
            )}
          </div>

          {/* ── Masalah Blocks ── */}
          {item.masalahBlocks.map((block, bi) => {
            const { hasFactor, bodyText } = parseMasalah(block.masalahUtama);
            const factorKey = block.masalahUtama.startsWith("[Faktor Internal]") ? "Faktor Internal"
              : block.masalahUtama.startsWith("[Faktor Eksternal]") ? "Faktor Eksternal" : "";

            const setMasalahFactor = (f: "Faktor Internal" | "Faktor Eksternal") =>
              updateBlock(block.id, { masalahUtama: `[${f}] ${bodyText}` });
            const setMasalahText = (t: string) =>
              updateBlock(block.id, { masalahUtama: hasFactor ? `[${factorKey}] ${t}` : t });

            return (
              <div key={block.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Block header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#1A284F]/5 border-b border-gray-200">
                  <span className="text-[11px] font-bold text-[#1A284F] uppercase tracking-widest">
                    Masalah Utama #{bi + 1}
                  </span>
                  {item.masalahBlocks.length > 1 && (
                    <button
                      onClick={() => deleteBlock(block.id)}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                    >
                      <X className="w-3 h-3" /> Hapus
                    </button>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-4">
                  {/* Masalah Utama field */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Masalah Utama (A)</label>
                      <span className="text-[9px] text-gray-400">Pilih faktor terlebih dahulu, lalu jelaskan masalahnya</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Faktor:</span>
                      {(["Faktor Internal", "Faktor Eksternal"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setMasalahFactor(f)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                            factorKey === f
                              ? f === "Faktor Internal" ? "bg-blue-600 text-white border-blue-600" : "bg-orange-500 text-white border-orange-500"
                              : f === "Faktor Internal" ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    {(hasFactor || bodyText) ? (
                      <textarea
                        value={bodyText}
                        onChange={(e) => setMasalahText(e.target.value)}
                        rows={2}
                        placeholder={`Jelaskan ${factorKey || "masalah"}…`}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none bg-gray-50"
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <Info className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="text-[10px] text-amber-700 font-medium">Pilih Faktor Internal atau Faktor Eksternal di atas untuk melanjutkan mengisi deskripsi masalah</span>
                      </div>
                    )}
                  </div>

                  {/* 5-Why fields */}
                  <div className="flex flex-col gap-3">
                    <p className="text-[10px] font-bold text-[#1A284F] uppercase tracking-widest">Analisis 5 Why</p>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kenapa A? (B)</label>
                      <textarea value={block.kenapaA} onChange={(e) => updateBlock(block.id, { kenapaA: e.target.value })} rows={3} placeholder="—"
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kenapa B? (C)</label>
                      <textarea value={block.kenapaB} onChange={(e) => updateBlock(block.id, { kenapaB: e.target.value })} rows={3} placeholder="—"
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kenapa C? (D)</label>
                      <textarea value={block.kenapaC} onChange={(e) => updateBlock(block.id, { kenapaC: e.target.value })} rows={3} placeholder="—"
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
                    </div>
                  </div>

                  {/* Action Plans for this block */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-[#1A284F] uppercase tracking-widest">Action Plan</p>
                      <button onClick={() => addAP(block.id)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] border border-[#1A284F] px-3 py-1.5 rounded-lg hover:bg-[#1A284F]/5 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Tambah Action Plan
                      </button>
                    </div>
                    {block.actionPlans.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">Belum ada action plan.</p>
                    )}
                    <div className="flex flex-col gap-3">
                      {block.actionPlans.map((ap, idx) => (
                        <div key={ap.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Action Plan #{idx + 1}</span>
                            <button onClick={() => removeAP(block.id, ap.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Usulan Tindak Lanjut</label>
                              <textarea value={ap.action} onChange={(e) => setAP(block.id, ap.id, "action", e.target.value)} rows={2} placeholder="Deskripsikan tindak lanjut..."
                                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Target Penyelesaian</label>
                              <DatePickerID value={ap.targetDate} onChange={(iso) => setAP(block.id, ap.id, "targetDate", iso)} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">PIC</label>
                              <input type="text" value={ap.pic} onChange={(e) => setAP(block.id, ap.id, "pic", e.target.value)} placeholder="Nama PIC..."
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status Perbaikan</label>
                              <select value={ap.status} onChange={(e) => setAP(block.id, ap.id, "status", e.target.value as StatusPerbaikan)}
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Keterangan</label>
                              <ListEditor items={ap.keterangan} onChange={(v) => setAP(block.id, ap.id, "keterangan", v)} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Output</label>
                              <ListEditor items={ap.output} onChange={(v) => setAP(block.id, ap.id, "output", v)} />
                            </div>
                            {ap.status === "Selesai" && (
                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-green-700 mb-1 block">Upload Evidence ✎</label>
                                <MultiFileUpload files={ap.evidence} onChange={(v) => setAP(block.id, ap.id, "evidence", v)} />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── Tambah Masalah Utama (gated after completing the last block) ── */}
          <div className="pt-1">
            {canAddMasalahBlock() ? (
              <button
                onClick={() => onChange({ ...item, masalahBlocks: [...item.masalahBlocks, newMasalahBlock()] })}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] border-2 border-dashed border-[#1A284F]/40 rounded-xl px-4 py-3 hover:bg-[#1A284F]/5 transition-colors w-full justify-center"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Masalah Utama
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  disabled
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 w-full justify-center cursor-not-allowed bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Masalah Utama
                </button>
                <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                  Lengkapi <strong>Masalah Utama</strong>, <strong>Kenapa A/B/C</strong>, dan minimal <strong>1 Action Plan</strong> (Tindak Lanjut, Target, PIC) pada masalah terakhir terlebih dahulu.
                </p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Confirm / Success modals ─────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4"><Send className="w-6 h-6 text-[#1A284F]" /></div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">Are you sure you want to submit your RCA for approval?</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-7 h-7 text-green-600" /></div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">Your RCA has been submitted for approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ row, onClose, onSubmit }: {
  row: RCARow; onClose: () => void; onSubmit: (data: RCAItem[]) => void;
}) {
  const isApproved = row.approvalStatus === "Approved";
  const isReadOnly = row.approvalStatus === "Pending-Approver 1"
                  || row.approvalStatus === "Pending-Approver 2"
                  || row.approvalStatus === "Closed";

  const cloneData = (d: RCAItem[]) => d.map((it) => ({
    ...it,
    masalahBlocks: it.masalahBlocks.map((b) => ({
      ...b,
      actionPlans: b.actionPlans.map((a) => ({ ...a, keterangan: [...a.keterangan], output: [...a.output], evidence: [...a.evidence] })),
    })),
  }));

  const [editMode,        setEditMode]        = useState(false);
  const [isSaved,         setIsSaved]         = useState(false);
  const [editData,        setEditData]        = useState<RCAItem[]>(cloneData(row.rcaData));
  const [originalData,    setOriginalData]    = useState<RCAItem[]>(cloneData(row.rcaData));
  const [submitted,       setSubmitted]       = useState(row.submitted);
  const [showEvidenceErr, setShowEvidenceErr] = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [showSuccess,     setShowSuccess]     = useState(false);

  const missingEvidence = editData.some((it) =>
    it.masalahBlocks.some((b) => b.actionPlans.some((ap) => ap.status === "Selesai" && ap.evidence.length === 0))
  );

  const handleEnterEdit = () => {
    setOriginalData(cloneData(editData));
    setShowEvidenceErr(false);
    setEditMode(true);
  };

  // Derive the rcaStore key for this row (matches how CreateRCADrawer and KPIPage store entries)
  const storeKey = `${row.kpiIndicator}__${row.periode}`;

  const persistToStore = (data: RCAItem[], approvalStatus: string) => {
    const storedBlocks: StoredMasalahBlock[] = data.flatMap((item) =>
      item.masalahBlocks.map((b) => ({
        id: b.id,
        masalahUtama: b.masalahUtama,
        kenapaA: b.kenapaA,
        kenapaB: b.kenapaB,
        kenapaC: b.kenapaC,
        actionPlans: b.actionPlans as StoredRCAActionPlan[],
      }))
    );
    const flatAPs: StoredRCAActionPlan[] = storedBlocks.flatMap((b) => b.actionPlans);
    updateRCASubmissionStatus(storeKey, {
      masalahBlocks: storedBlocks,
      actionPlans: flatAPs,
      approvalStatus,
    });
  };

  const handleSaveUpdate = () => {
    if (missingEvidence) { setShowEvidenceErr(true); return; }
    setShowEvidenceErr(false);
    setEditMode(false);
    setIsSaved(true);
    persistToStore(editData, row.approvalStatus);
  };

  const handleConfirm = () => { setShowConfirm(false); setShowSuccess(true); };
  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setIsSaved(false);
    persistToStore(editData, "Pending-Approver 1");
    onSubmit(editData);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 shrink-0 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors shrink-0">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-sm font-bold text-gray-800">{row.kpiIndicator}</span>
        <span className="text-xs text-gray-400">— {row.periode} {row.year}</span>
        <StatusBadge status={row.approvalStatus} />
        {isApproved && !submitted && editMode && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
            <Edit3 className="w-3 h-3" /> Edit Mode
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {isApproved && !submitted && !editMode && !isSaved && (
            <button onClick={handleEnterEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border-2 border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors">
              <Edit3 className="w-4 h-4" /> Update Progress
            </button>
          )}
          {isApproved && !submitted && !editMode && isSaved && (
            <>
              <button onClick={handleEnterEdit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Edit3 className="w-4 h-4" /> Edit
              </button>
              <button onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] shadow-sm transition-colors">
                <Send className="w-4 h-4" /> Submit RCA
              </button>
            </>
          )}
          {isApproved && !submitted && editMode && (
            <button onClick={handleSaveUpdate} disabled={missingEvidence}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                missingEvidence ? "bg-gray-100 text-gray-300 cursor-not-allowed" : "bg-[#1A284F] text-white hover:bg-[#131d3b] shadow-sm"
              }`}>
              <CheckCircle2 className="w-4 h-4" /> Save Update
            </button>
          )}
        </div>
      </div>

      {submitted && (
        <div className="mx-8 mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium shrink-0">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          RCA has been submitted and is pending Approver review.
        </div>
      )}
      {isApproved && editMode && !submitted && (
        <div className="mx-8 mt-4 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm shrink-0">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Edit Mode aktif — perbarui <strong>Status Perbaikan</strong>, <strong>Keterangan</strong>, dan <strong>Output</strong> langsung di tabel. Evidence wajib diupload jika Status = <strong>Selesai</strong>. Data Output lama tidak dapat dihapus, hanya bisa menambah.</span>
        </div>
      )}
      {isApproved && editMode && showEvidenceErr && missingEvidence && (
        <div className="mx-8 mt-2 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-300 text-red-700 text-sm font-semibold shrink-0">
          <span>⚠</span> Wajib Upload Evidence untuk setiap Action Plan dengan Status Perbaikan <strong>Selesai</strong>.
        </div>
      )}
      {isApproved && !editMode && isSaved && !submitted && (
        <div className="mx-8 mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm shrink-0">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Update berhasil disimpan. Klik <strong className="mx-1">Submit RCA</strong> untuk mengirim ke approver, atau <strong className="mx-1">Edit</strong> jika ada perubahan lagi.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isReadOnly && <RCAPreviewTable data={editData} />}
        {isApproved && (
          editMode && !submitted
            ? <RCAEditableTable data={editData} originalData={originalData} onChange={setEditData} showEvidenceErrors={showEvidenceErr} />
            : <RCAPreviewTable data={editData} />
        )}
      </div>

      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}

// ─── Create RCA Drawer ────────────────────────────────────────────────────────

function CreateRCADrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (r: RCARow) => void }) {
  const currentPeriode = MONTHS_ID[new Date().getMonth()];
  const [items, setItems] = useState<RCAItem[]>([{
    id: genId(), no: 1, periode: currentPeriode, kpi: "", satuan: "", baseline: "", target: "", actual: "",
    masalahBlocks: [newMasalahBlock()],
  }]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const updateItem = (id: string, u: RCAItem) => setItems((p) => p.map((it) => it.id === id ? u : it));
  const deleteItem = (id: string) => setItems((p) => { const f = p.filter((it) => it.id !== id); return f.map((it, i) => ({ ...it, no: i + 1 })); });
  const addItem    = () => setItems((p) => [...p, {
    id: genId(), no: p.length + 1, periode: currentPeriode, kpi: "", satuan: "", baseline: "", target: "", actual: "",
    masalahBlocks: [newMasalahBlock()],
  }]);

  const handleConfirm = () => { setShowConfirm(false); setShowSuccess(true); };
  const handleSuccessClose = () => {
    setShowSuccess(false);
    const today = new Date().toISOString().slice(0, 10);
    const rowId = genId();
    // Persist each RCA item to rcaStore so KPIPage tags can sync
    items.forEach((item) => {
      const storeKey = `${item.kpi}__${item.periode}`;
      const storedBlocks: StoredMasalahBlock[] = item.masalahBlocks.map((b) => ({
        id: b.id,
        masalahUtama: b.masalahUtama,
        kenapaA: b.kenapaA,
        kenapaB: b.kenapaB,
        kenapaC: b.kenapaC,
        actionPlans: b.actionPlans as StoredRCAActionPlan[],
      }));
      saveRCASubmission({
        key: storeKey,
        id: storeKey,
        submittedDate: today,
        periode: item.periode,
        monthLabel: item.periode,
        year: "2026",
        kpiIndicator: item.kpi,
        approvalStatus: "Pending-Approver 1",
        targetMonthly: item.target,
        actual: item.actual,
        achievementPct: 0,
        satuan: item.satuan,
        baseline: item.baseline,
        masalahBlocks: storedBlocks,
        masalahUtama: [],
        kenapaA: "",
        kenapaB: "",
        kenapaC: "",
        actionPlans: [],
      });
    });
    onCreated({
      id: rowId, no: 0,
      periode: items[0]?.periode || "—",
      kpiIndicator: items[0]?.kpi || "New RCA",
      targetMonthly: items[0]?.target || "—",
      actual: items[0]?.actual || "—",
      rcaPercentage: 0, approvalStatus: "Pending-Approver 1", year: "2026",
      submitted: true, submittedDate: today, lastApprovedDate: "—",
      rcaData: items,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-4 px-8 py-4 border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-sm font-bold text-gray-800">Create New RCA</span>
        <div className="ml-auto">
          <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
            <Send className="w-4 h-4" /> Submit RCA
          </button>
        </div>
      </div>
      <div className="mx-8 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs shrink-0">
        <Info className="w-3.5 h-3.5 shrink-0" />
        KPI Tracking — hanya menampilkan KPI dengan Pencapaian / Score di bawah 100%. Pilih KPI untuk mengisi data secara otomatis.
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <RCAInputCard key={item.id} item={item} onChange={(u) => updateItem(item.id, u)} onDelete={() => deleteItem(item.id)} kpiCatalog={KPI_CATALOG} />
          ))}
          <button onClick={addItem} className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-semibold text-gray-400 hover:border-[#1A284F] hover:text-[#1A284F] transition-colors">
            <Plus className="w-4 h-4" /> Add KPI
          </button>
        </div>
      </div>
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ allRows }: { allRows: RCARow[] }) {
  const totalPeriod      = new Set(allRows.map((r) => r.periode)).size;
  const totalKPI         = new Set(allRows.map((r) => r.kpiIndicator)).size;
  const apCount          = allRows.reduce((s, r) => s + totalAPs_(r.rcaData), 0);
  const totalOutstanding = allRows.reduce((s, r) =>
    s + r.rcaData.reduce((ss, it) =>
      ss + it.masalahBlocks.reduce((sss, b) =>
        sss + b.actionPlans.filter((a) => a.status !== "Selesai" && a.status !== "Dibatalkan").length, 0), 0), 0
  );
  const outstandingPct   = apCount > 0 ? Math.round((totalOutstanding / apCount) * 100) : 0;
  const totalClosed      = allRows.filter((r) => r.approvalStatus === "Closed").length;

  const cards = [
    { label: "Total Period",      value: totalPeriod,          unit: "period", color: "bg-[#1A284F]",  text: "text-white" },
    { label: "Total KPI",         value: totalKPI,             unit: "KPI",    color: "bg-indigo-500", text: "text-white" },
    { label: "Total APs",         value: apCount,              unit: "APs",    color: "bg-blue-500",   text: "text-white" },
    { label: "Total Outstanding", value: totalOutstanding,     unit: "APs",    color: "bg-amber-500",  text: "text-white" },
    { label: "Outstanding (%)",   value: `${outstandingPct}%`, unit: "",       color: "bg-orange-500", text: "text-white" },
    { label: "Total RCA Closed",  value: totalClosed,          unit: "RCA",    color: "bg-green-600",  text: "text-white" },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(({ label, value, unit, color, text }) => (
        <div key={label} className={`${color} rounded-xl px-4 py-4 flex flex-col gap-1 shadow-sm`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider opacity-80 ${text}`}>{label}</p>
          <div className="flex items-end gap-1.5 mt-1">
            <span className={`text-2xl font-bold leading-none ${text}`}>{value}</span>
            {unit && <span className={`text-[11px] font-medium opacity-70 pb-0.5 ${text}`}>{unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function totalAPs_(rcaData: RCAItem[]) {
  return rcaData.reduce((s, it) =>
    s + it.masalahBlocks.reduce((ss, b) => ss + b.actionPlans.filter((a) => a.status !== "Dibatalkan").length, 0), 0);
}

// ─── List table ───────────────────────────────────────────────────────────────

function RCAListTable({ rows, isClosed, onViewDetail, onDelete }: {
  rows: RCARow[]; isClosed?: boolean; onViewDetail: (r: RCARow) => void; onDelete?: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<RCARow | null>(null);

  if (rows.length === 0) return <div className="py-16 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">Tidak ada data RCA.</div>;
  return (
    <>
      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">Hapus Data RCA</p>
                <p className="text-xs text-gray-400 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600">
                Apakah Anda yakin ingin menghapus data RCA untuk{" "}
                <span className="font-semibold text-gray-900">"{pendingDelete.kpiIndicator}"</span>{" "}
                periode <span className="font-semibold text-gray-900">{pendingDelete.periode}</span>?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => { onDelete!(pendingDelete.id); setPendingDelete(null); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-36">Action</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-12">No</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Period</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">KPI Indicator</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Target (Monthly)</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Actual (Monthly)</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Total APs</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Outstanding APs</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-40">Progress APs (%)</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Submitted Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Approval Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Last Approved Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const total = totalAPs(row.rcaData);
                const outstanding = row.rcaData.reduce((s, it) =>
                  s + it.masalahBlocks.reduce((ss, b) =>
                    ss + b.actionPlans.filter((a) => a.status !== "Selesai" && a.status !== "Dibatalkan").length, 0), 0);
                const pct = computeProgressAPs(row.rcaData, isClosed);
                return (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {row.approvalStatus === "Approved" ? (
                          <button onClick={() => onViewDetail(row)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" /> Update Progress
                          </button>
                        ) : (
                          <button onClick={() => onViewDetail(row)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors">
                            <Eye className="w-3.5 h-3.5" /> View Detail
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => setPendingDelete(row)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Hapus baris ini">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">{row.no}</td>
                  <td className="px-4 py-3.5"><span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[11px] font-bold">{row.periode}</span></td>
                  <td className="px-4 py-3.5 text-xs font-semibold text-gray-800">{row.kpiIndicator}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-600">{row.targetMonthly}</td>
                  <td className="px-4 py-3.5 text-xs font-semibold text-gray-700">{row.actual}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold text-gray-700">{total}</span>
                    <span className="text-[10px] text-gray-400 ml-1">APs</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {outstanding > 0
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-200">{outstanding} outstanding</span>
                      : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">All done</span>}
                  </td>
                  <td className="px-4 py-3.5"><RCAPercentBar pct={pct} /></td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">{row.submittedDate}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={row.approvalStatus} /></td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">{row.lastApprovedDate}</td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RCAPage() {
  const [tab,         setTab]         = useState<"open" | "closed">("open");
  const [filterYear,  setFilterYear]  = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [openRows,    setOpenRows]    = useState<RCARow[]>([]);
  const [closedRows,  setClosedRows]  = useState<RCARow[]>([]);
  const [detailRow,   setDetailRow]   = useState<RCARow | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);

  const syncRCARowsFromStore = () => {
    const stored = loadRCASubmissions();
    const nextOpen: RCARow[] = [];
    const nextClosed: RCARow[] = [];
    stored.forEach((s) => {
      const rcaItem: RCAItem = {
        id: s.id + "_item",
        no: 1,
        periode: s.periode,
        kpi: s.kpiIndicator,
        satuan: s.satuan,
        baseline: s.baseline,
        target: s.targetMonthly,
        actual: s.actual,
        masalahBlocks: s.masalahBlocks && s.masalahBlocks.length > 0
          ? s.masalahBlocks.map((b, bi) => ({
              id: b.id || s.id + `_block${bi}`,
              masalahUtama: b.masalahUtama,
              kenapaA: b.kenapaA,
              kenapaB: b.kenapaB,
              kenapaC: b.kenapaC,
              actionPlans: b.actionPlans as ActionPlan[],
            }))
          : [{
              id: s.id + "_block0",
              masalahUtama: s.masalahUtama.join(" / "),
              kenapaA: s.kenapaA,
              kenapaB: s.kenapaB,
              kenapaC: s.kenapaC,
              actionPlans: s.actionPlans as ActionPlan[],
            }],
      };
      const status = (s.approvalStatus as ApprovalStatus) || "Pending-Approver 1";
      const rowObj: RCARow = {
        id: s.id,
        no: status === "Closed" ? nextClosed.length + 1 : nextOpen.length + 1,
        periode: s.periode,
        kpiIndicator: s.kpiIndicator,
        targetMonthly: s.targetMonthly,
        actual: s.actual,
        rcaPercentage: computeProgressAPs([rcaItem], status === "Closed"),
        approvalStatus: status,
        year: s.year || "2026",
        submitted: true,
        submittedDate: s.submittedDate,
        lastApprovedDate: "—",
        rcaData: [rcaItem],
      };
      if (status === "Closed") {
        nextClosed.push(rowObj);
      } else {
        nextOpen.push(rowObj);
      }
    });
    setOpenRows(nextOpen);
    setClosedRows(nextClosed);
  };

  useEffect(() => {
    syncRCARowsFromStore();
    window.addEventListener("pa-db-hydrated", syncRCARowsFromStore);
    window.addEventListener("pa-auth-updated", syncRCARowsFromStore);
    window.addEventListener("appraisal-updated", syncRCARowsFromStore);
    window.addEventListener("storage", syncRCARowsFromStore);
    return () => {
      window.removeEventListener("pa-db-hydrated", syncRCARowsFromStore);
      window.removeEventListener("pa-auth-updated", syncRCARowsFromStore);
      window.removeEventListener("appraisal-updated", syncRCARowsFromStore);
      window.removeEventListener("storage", syncRCARowsFromStore);
    };
  }, []);

  const filterRows = (rows: RCARow[]) =>
    rows.filter((r) => {
      if (filterYear  && r.year    !== filterYear)                                  return false;
      if (filterMonth && r.periode !== MONTHS_ID[MONTHS_EN.indexOf(filterMonth)]) return false;
      return true;
    });

  const handleSubmit = (rowId: string, updatedData: RCAItem[]) => {
    const today = new Date().toISOString().slice(0, 10);
    setOpenRows((prev) => {
      const next = prev.map((r) => r.id !== rowId ? r : { ...r, rcaData: updatedData, approvalStatus: "Pending-Approver 1", submittedDate: today });
      // Persist updated approval status to rcaStore
      const row = prev.find((r) => r.id === rowId);
      if (row) {
        const storeKey = `${row.kpiIndicator}__${row.periode}`;
        const storedBlocks: StoredMasalahBlock[] = updatedData.flatMap((item) =>
          item.masalahBlocks.map((b) => ({
            id: b.id, masalahUtama: b.masalahUtama,
            kenapaA: b.kenapaA, kenapaB: b.kenapaB, kenapaC: b.kenapaC,
            actionPlans: b.actionPlans as StoredRCAActionPlan[],
          }))
        );
        const existing = loadRCASubmissions().find((entry) => entry.key === storeKey);
        saveRCASubmission({
          key: storeKey, id: row.id, employeeId: getActiveUser().employeeId, submittedDate: today,
          periode: row.periode, monthLabel: row.periode, year: row.year,
          kpiIndicator: row.kpiIndicator, targetMonthly: row.targetMonthly, actual: row.actual,
          achievementPct: 0, satuan: updatedData[0]?.satuan ?? "", baseline: updatedData[0]?.baseline ?? "",
          masalahUtama: [], kenapaA: "", kenapaB: "", kenapaC: "",
          ...existing,
          masalahBlocks: storedBlocks,
          actionPlans: storedBlocks.flatMap((b) => b.actionPlans),
          approvalStatus: "Pending-Approver 1",
        });
      }
      return next;
    });
    setDetailRow(null);
  };

  const handleCreated = (_newRow: RCARow) => {
    syncRCARowsFromStore();
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800 text-lg">RCA — Root Cause Analysis</h1>
          <p className="text-xs text-gray-400 mt-0.5">Analisis akar masalah KPI yang tidak tercapai</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <span>&#8962;</span><span>Home</span>
            <span className="mx-1">›</span><span>Performance Appraisal Measurement</span>
            <span className="mx-1">›</span>
            <span className="font-medium text-gray-700">RCA</span>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
            <FilePlus className="w-4 h-4" /> Create RCA
          </button>
        </div>
      </div>

      <ModuleApprovalStatusBar
        module="RCA"
        phase="measurement"
        submittedOverride={openRows.length > 0 || closedRows.length > 0}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["open","closed"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              RCA ({t === "open" ? "Open" : "Closed"})
              <span className={`ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tab === t ? "bg-[#1A284F] text-white" : "bg-gray-200 text-gray-500"}`}>
                {t === "open" ? openRows.length : closedRows.length}
              </span>
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <FilterSelect label="Year"   options={YEARS}     value={filterYear}  onChange={setFilterYear}  />
        <FilterSelect label="Period" options={MONTHS_EN} value={filterMonth} onChange={setFilterMonth} />
        {(filterYear || filterMonth) && (
          <button onClick={() => { setFilterYear(""); setFilterMonth(""); }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Rows with <strong className="text-green-600">Approved</strong> status can be updated.</span>
        </div>
      </div>

      <SummaryCards allRows={[...openRows, ...closedRows]} />

      {tab === "open"
        ? <RCAListTable rows={filterRows(openRows)}   isClosed={false} onViewDetail={setDetailRow}
            onDelete={(id) => {
              deleteRCASubmission(id);
              setOpenRows((prev) => prev.filter((r) => r.id !== id).map((r, i) => ({ ...r, no: i + 1 })));
            }} />
        : <RCAListTable rows={filterRows(closedRows)} isClosed={true}  onViewDetail={setDetailRow} />
      }

      {detailRow && (
        <DetailDrawer row={detailRow} onClose={() => setDetailRow(null)} onSubmit={(d) => handleSubmit(detailRow.id, d)} />
      )}
      {showCreate && (
        <CreateRCADrawer onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
