// @refresh reset
import React, { useState } from "react";
import { X, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Lightbulb, ClipboardList, Layers, Eye, User, Building2, Calendar, MessageSquare } from "lucide-react";
import { type ApprovalRow } from "./ReviewDrawer";
import { ROWS, SAMPLE_GOALS, type SmartGoal } from "../pages/employee/SMARTGoals";
import { loadSubmittedGoals } from "../pages/shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { FORMS } from "../pages/employee/AppraisalForm";
import { MS_ITEMS } from "../pages/supervisor/ManagerialSkillCheckIn";
import { KPI_ITEMS as FULL_KPI_ITEMS } from "../pages/employee/KPIPage";

// ── Extra sample goals for non-EMP002 employees ───────────────────────────────

const SAMPLE_GOALS_EMP009: SmartGoal[] = [
  { id: 101, label: "Goals 1", specific: "Meningkatkan akurasi data analitik SDM melalui penerapan sistem HR analytics terpadu sepanjang 2026.", measurable: "Akurasi diukur dari tingkat kesalahan data < 2% per laporan bulanan.", attainable: "Implementasi tools HR analytics; pelatihan tim analitik; integrasi dengan HRIS.", relevant: "Data SDM yang akurat mendukung pengambilan keputusan strategis manajemen.", timely: "Sistem live pada Q2 2026; review akurasi tiap kuartal.", bukti: "Laporan akurasi bulanan; audit data bulanan oleh tim QA.", target: "Tingkat kesalahan data < 2% mulai Q2 2026", actionPlans: [
    { id: 1001, description: "Identifikasi dan pemetaan sumber data SDM yang ada" },
    { id: 1002, description: "Evaluasi dan pemilihan tools HR analytics yang sesuai" },
    { id: 1003, description: "Implementasi pilot HR analytics pada 2 departemen" },
  ]},
  { id: 102, label: "Goals 2", specific: "Merancang dan mengimplementasikan program retensi karyawan untuk menekan turnover di bawah 8%.", measurable: "Turnover rate dipantau bulanan dari data HRIS; survei engagement tiap kuartal.", attainable: "Program terdiri dari: program pengembangan karir, kompensasi kompetitif, dan wellbeing.", relevant: "Turnover tinggi berdampak pada biaya rekrutmen dan produktivitas organisasi.", timely: "Program diluncurkan Q1 2026; evaluasi dampak pada Q3 2026.", bukti: "Laporan turnover bulanan; hasil survei engagement; perbandingan data Q1 vs Q4 2026.", target: "Turnover rate ≤ 8% pada akhir 2026 (baseline 2025: 12%)", actionPlans: [
    { id: 1004, description: "Analisis akar penyebab turnover melalui exit interview mendalam" },
    { id: 1005, description: "Desain program pengembangan karir dan mentoring" },
    { id: 1006, description: "Implementasi survey engagement bulanan dan tindak lanjut" },
  ]},
  { id: 103, label: "Goals 3", specific: "Mengembangkan dashboard SDM real-time yang diakses oleh seluruh manajer departemen.", measurable: "Jumlah manajer yang aktif mengakses dashboard ≥ 80% setiap bulan.", attainable: "Kolaborasi dengan tim IT untuk pengembangan dashboard; training pengguna.", relevant: "Dashboard SDM meningkatkan visibilitas data dan kecepatan respons manajerial.", timely: "Dashboard live Q2 2026; adopsi ≥ 80% tercapai Q3 2026.", bukti: "Log akses dashboard bulanan; laporan adopsi dari IT.", target: "Tingkat adopsi manajer ≥ 80% pada Q3 2026", actionPlans: [
    { id: 1007, description: "Requirement gathering dari manajer departemen terkait kebutuhan data" },
    { id: 1008, description: "Pengembangan dan pengujian dashboard bersama tim IT" },
    { id: 1009, description: "Training dan rollout dashboard ke seluruh manajer" },
  ]},
];

const SAMPLE_GOALS_EMP013: SmartGoal[] = [
  { id: 201, label: "Goals 1", specific: "Melakukan review dan penyesuaian struktur kompensasi agar kompetitif di pasar kerja 2026.", measurable: "Benchmark kompensasi dibandingkan dengan median pasar dari 3 survei gaji terpercaya.", attainable: "Kerjasama dengan konsultan HR; analisis data survei gaji; presentasi ke direksi.", relevant: "Kompensasi kompetitif mendukung daya tarik dan retensi talenta terbaik.", timely: "Review selesai Q1 2026; implementasi penyesuaian Q2 2026.", bukti: "Laporan benchmark kompensasi; SK penyesuaian gaji yang disetujui direksi.", target: "Struktur kompensasi berada di P50 pasar untuk semua grade pada Q2 2026", actionPlans: [
    { id: 2001, description: "Pengumpulan data survei gaji dari 3 sumber terpercaya (Mercer, Hay, Willis)" },
    { id: 2002, description: "Analisis gap kompensasi per grade dan fungsi jabatan" },
    { id: 2003, description: "Presentasi rekomendasi penyesuaian ke Komite Kompensasi" },
  ]},
  { id: 202, label: "Goals 2", specific: "Membangun sistem benefit fleksibel (flexible benefit) yang dapat disesuaikan dengan kebutuhan individu karyawan.", measurable: "Kepuasan karyawan terhadap benefit diukur melalui survei tahunan; target skor ≥ 75/100.", attainable: "Studi banding program flexible benefit; piloting pada 2 departemen; evaluasi dan rollout.", relevant: "Flexible benefit meningkatkan employee engagement dan loyalitas karyawan.", timely: "Pilot Q2 2026; rollout penuh Q4 2026; survei kepuasan akhir 2026.", bukti: "Laporan pilot flexible benefit; hasil survei kepuasan benefit; dokumentasi rollout.", target: "Skor kepuasan benefit ≥ 75/100 pada survei akhir 2026", actionPlans: [
    { id: 2004, description: "Studi banding dan benchmarking program flexible benefit di 5 perusahaan sejenis" },
    { id: 2005, description: "Desain program flexible benefit dan piloting di 2 departemen" },
    { id: 2006, description: "Evaluasi hasil pilot dan persiapan rollout ke seluruh organisasi" },
  ]},
];

// ── Project detail data ───────────────────────────────────────────────────────

interface ProjectItem {
  no: number;
  category: string;
  scope: string;
  projectName: string;
  description: string;
  startDate: string;
  endDate: string;
  role: string;
  expectedOutput: string;
  bobot: number;
}

const PROJECT_ITEMS: ProjectItem[] = [
  {
    no: 1,
    category: "Improvement Project",
    scope: 'M - "Major Improvement"',
    projectName: "Reduksi Downtime Mesin Boiler (QCC)",
    description: "Proyek peningkatan efisiensi operasional mesin boiler melalui analisis akar masalah dan implementasi solusi teknis.",
    startDate: "01/01/2026",
    endDate: "31/12/2026",
    role: "Leader / Ketua",
    expectedOutput: "Penurunan downtime minimal 20% dari baseline 2025",
    bobot: 15,
  },
  {
    no: 2,
    category: "Komite/Task Force",
    scope: 'SS - "Small Idea Kaizen"',
    projectName: "Task Force Implementasi ISO 45001",
    description: "Partisipasi dalam komite implementasi sistem manajemen keselamatan dan kesehatan kerja sesuai standar ISO 45001.",
    startDate: "01/03/2026",
    endDate: "30/09/2026",
    role: "Member / Anggota",
    expectedOutput: "Sertifikasi ISO 45001 berhasil diraih",
    bobot: 5,
  },
];

// ── Interview detail data ─────────────────────────────────────────────────────

interface InterviewDetail {
  interviewerName: string;
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  notes: string;
}

const INTERVIEW_DETAIL: InterviewDetail = {
  interviewerName: "Budi Santoso",
  scheduledDate: "2026-06-20",
  scheduledTime: "10:00",
  location: "Ruang Meeting A — Lantai 3, Gedung HQ RSUP",
  notes: "Wawancara akhir tahun terkait pencapaian kinerja dan rencana pengembangan karir. Mohon membawa dokumen portofolio dan laporan kinerja terbaru.",
};

// ── Drawer ───────────���────────────────────────────────────────────────────────

interface SettingApprovalDrawerProps {
  row: ApprovalRow;
  onClose: () => void;
  onApprove: () => void;
  onRevision: (note: string) => void;
  readOnly?: boolean;
}

export function SettingApprovalDrawer({ row, onClose, onApprove, onRevision, readOnly }: SettingApprovalDrawerProps) {
  const [revisionNote, setRevisionNote] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmRevisionOpen, setConfirmRevisionOpen] = useState(false);
  const [expandedKpi, setExpandedKpi]   = useState<string | null>(null);

  const normEmpId = normalizeEmployeeId(row.employeeId);
  const wfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.module === row.type &&
      r.phase === "setting" &&
      r.employeeId === normEmpId,
  );
  const revisionHistory = wfRec?.revisionHistory ?? [];

  const handleRevision = () => {
    if (!revisionNote.trim()) return;
    setConfirmRevisionOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 px-8 py-4 border-b border-gray-200 bg-white shrink-0">
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
            {row.type} — Setting
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {row.status}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-gray-700">
          <User className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="font-semibold">{row.name}</span>
          <span className="text-gray-400">({row.employeeId})</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
          <span>{row.position} · {row.department} · {row.division}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <span>Submitted: {row.submittedDate}</span>
        </div>
      </div>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex flex-col gap-5">
          {revisionHistory.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-800">
                <MessageSquare className="w-4 h-4 text-orange-600" />
                <span>Riwayat Revisi &amp; Komentar Sebelumnya ({revisionHistory.length}):</span>
              </div>
              <div className="space-y-1.5">
                {revisionHistory.map((rev, i) => (
                  <div key={i} className="bg-white border border-orange-100 rounded-lg px-3.5 py-2 text-xs">
                    <div className="flex items-center justify-between font-semibold text-gray-800">
                      <span>{rev.role} — {rev.approverName}</span>
                      <span className="text-[10px] text-gray-400">{rev.date}</span>
                    </div>
                    <p className="text-gray-700 mt-0.5">{rev.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {row.type === "KPI" && <KPIContent expandedKpi={expandedKpi} setExpandedKpi={setExpandedKpi} />}
          {row.type === "SMART Goals" && <SmartGoalsSettingContent employeeId={row.employeeId} />}
          {row.type === "Appraisal Form" && <AppraisalFormSettingContent />}
          {row.type === "Managerial Skill" && <ManSkillSettingContent />}
          {row.type === "Project Outside Job" && <ProjectContent />}
          {row.type === "Management Interview" && <InterviewContent />}
        </div>
      </div>

      {/* ── Action area ─────────────────────────────────────────────────────── */}
      {!readOnly && row.status !== "Approved" && row.status !== "Validated" && row.status !== "Assessed-Approver 1" && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-4 shrink-0">
          <div>
            {!showRevision ? (
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowRevision(true)}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 border-2 border-orange-400 text-orange-600 rounded-xl font-semibold text-sm hover:bg-orange-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Request Revision
                </button>
                <button
                  onClick={() => setConfirmApproveOpen(true)}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1A284F] text-white rounded-xl font-semibold text-sm hover:bg-[#131d3b] transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approve
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-w-3xl ml-auto">
                <textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="Describe what needs to be revised..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowRevision(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevision}
                    disabled={!revisionNote.trim()}
                    className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-40"
                  >
                    Send Revision Request
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {(readOnly || row.status === "Approved" || row.status === "Assessed-Approver 1") && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-8 py-4 shrink-0">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="font-medium">Viewing in read-only mode — this record has already been processed.</span>
          </div>
        </div>
      )}

      {/* Popup Konfirmasi Approve */}
      {confirmApproveOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-50 mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Konfirmasi Persetujuan (Approve)</h3>
            <p className="text-sm text-gray-600 mb-6">
              Apakah Anda yakin ingin menyetujui pengajuan <strong>{row.type} (Setting)</strong> dari <strong>{row.name}</strong> ({row.employeeId})?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmApproveOpen(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmApproveOpen(false);
                  onApprove();
                }}
                className="flex-1 py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
              >
                Ya, Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Konfirmasi Revision */}
      {confirmRevisionOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-orange-50 mx-auto mb-4">
              <RotateCcw className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">Konfirmasi Permintaan Revisi</h3>
            <p className="text-sm text-gray-600 mb-6">
              Kirim permintaan revisi untuk <strong>{row.type} (Setting)</strong> milik <strong>{row.name}</strong>?
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmRevisionOpen(false)}
                className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmRevisionOpen(false);
                  onRevision(revisionNote);
                }}
                className="flex-1 py-2.5 rounded-full bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
              >
                Ya, Kirim Revisi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SMART Goals Setting content ───────────────────────────────────────────────

function SmartGoalsSettingContent({ employeeId }: { employeeId: string }) {
  const [openGoal, setOpenGoal] = useState<number | null>(null);

  const live = loadSubmittedGoals(employeeId);
  const goals: SmartGoal[] = live && live.length > 0 ? live : SAMPLE_GOALS;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-gray-800 text-sm">SMART Goals Setting — 2026</h3>
        <span className="ml-auto text-xs text-gray-400">{goals.length} goal{goals.length !== 1 ? "s" : ""} · {goals.reduce((s, g) => s + g.actionPlans.length, 0)} action plans</span>
      </div>

      {/* SMART criteria table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table
          className="border-collapse w-full text-xs"
          style={{ minWidth: `${Math.max(520, 200 + goals.length * 200)}px` }}
        >
          <thead>
            <tr>
              <th className="border border-[#1A284F] bg-[#1A284F] text-white text-left py-2.5 px-3 font-bold" style={{ width: "200px" }}>
                SMART Goals
              </th>
              {goals.map((g) => (
                <th key={g.id} className="border border-[#1A284F] bg-[#1A284F] text-white text-center py-2.5 px-3 font-bold">
                  {g.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.key} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="border border-gray-200 align-top px-3 py-3 bg-[#1A284F]/5" style={{ width: "200px" }}>
                  <p className="font-semibold text-[#1A284F] text-[11px] mb-0.5">{row.title}</p>
                  <p className="text-gray-400 text-[10px] leading-relaxed">{row.desc}</p>
                </td>
                {goals.map((g) => (
                  <td key={g.id} className="border border-gray-200 align-top px-3 py-2.5">
                    <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[60px]">
                      {(g[row.key as keyof typeof g] as string) || <span className="text-gray-300 italic">—</span>}
                    </p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action Plans section — collapsible per goal */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#1A284F]">Action Plans</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>
        {goals.map((goal) => {
          const isOpen = openGoal === goal.id;
          const apCount = goal.actionPlans.length;
          return (
            <div key={goal.id} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenGoal(isOpen ? null : goal.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-[#1A284F] text-left hover:bg-[#1e3060] transition-colors"
              >
                <span className="text-white text-sm font-bold flex-1">{goal.label}</span>
                <span className="text-[10px] text-white/60 font-semibold">{apCount} Action Plan{apCount !== 1 ? "s" : ""}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-white/60 shrink-0" /> : <ChevronDown className="w-4 h-4 text-white/60 shrink-0" />}
              </button>
              {isOpen && (
                <div className="p-4 bg-white">
                  {apCount === 0 ? (
                    <p className="text-xs text-gray-300 italic text-center py-4">Belum ada action plan.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="bg-[#1A284F] text-white text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide w-12 border-r border-white/20">No</th>
                            <th className="bg-[#1A284F] text-white text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide">Action Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {goal.actionPlans.map((ap, idx) => (
                            <tr key={ap.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                              <td className="border-t border-gray-100 border-r border-gray-100 px-3 py-2.5 text-center align-middle">
                                <span className="w-5 h-5 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[9px] font-bold flex items-center justify-center mx-auto">{idx + 1}</span>
                              </td>
                              <td className="border-t border-gray-100 px-4 py-2.5 align-middle text-[11px] text-gray-700 leading-relaxed">{ap.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI content ────────────────────────────��──────────────────────────────────

function KPIContent({ expandedKpi, setExpandedKpi }: { expandedKpi: string | null; setExpandedKpi: (v: string | null) => void }) {
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const sectionA = FULL_KPI_ITEMS.filter((k) => k.section === "A");
  const sectionB = FULL_KPI_ITEMS.filter((k) => k.section === "B");

  const totalBobot = FULL_KPI_ITEMS.reduce((sum, k) => sum + parseFloat(k.bobot), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 text-sm">KPI Setting Detail</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Total Bobot: <span className="font-bold text-[#1A284F]">{totalBobot}%</span></span>
          <button
            onClick={() => setViewMode(viewMode === "cards" ? "table" : "cards")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            {viewMode === "cards" ? "View Table Format" : "View Cards"}
          </button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <>
          {[{ label: "Section A — Individual KPI", items: sectionA }, { label: "Section B — Company KPI", items: sectionB }].map(({ label, items }) => (
            <div key={label} className="flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</p>
              {items.map((kpi) => {
                const expanded = expandedKpi === kpi.no;
                return (
                  <div key={kpi.no} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedKpi(expanded ? null : kpi.no)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span className="w-7 h-7 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-xs font-bold flex items-center justify-center shrink-0">{kpi.no}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{kpi.kpi}</p>
                        <p className="text-[10px] text-gray-400">{kpi.perspektif}</p>
                      </div>
                      <span className="text-xs font-bold text-[#1A284F] shrink-0">{kpi.bobot}</span>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                          {[
                            ["Perspektif",  kpi.perspektif],
                            ["Satuan",      kpi.satuan],
                            ["Bobot",       kpi.bobot],
                            ["Polaritas",   kpi.polaritas],
                            ["Baseline 2025",    kpi.baseline2025],
                            ["Target 2026", kpi.target2026],
                            ["Formula", kpi.formula],
                            ["Source", kpi.source],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">{label}</p>
                              <p className="text-gray-700 font-medium mt-0.5">{value}</p>
                            </div>
                          ))}
                          {kpi.definisi && (
                            <div className="col-span-2">
                              <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">Definisi</p>
                              <p className="text-gray-700 font-medium mt-0.5">{kpi.definisi}</p>
                            </div>
                          )}
                          {kpi.detailFormula && (
                            <div className="col-span-2">
                              <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">Detail Formula</p>
                              <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-line text-xs">{kpi.detailFormula}</p>
                            </div>
                          )}
                          {kpi.keterangan && (
                            <div className="col-span-2">
                              <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">Keterangan</p>
                              <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-line text-xs">{kpi.keterangan}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 50 }}>No</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 120 }}>Perspektif</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 250 }}>KPI</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 110 }}>Satuan</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 90 }}>Formula</th>
                <th className="border border-[#1A284F]/30 py-3 px-2 font-semibold text-center" style={{ minWidth: 64 }}>Bobot</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 240 }}>Definisi</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 155 }}>Source</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Baseline 2025</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Target 2026</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Polaritas</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 250 }}>Detail Formula</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 180 }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {/* Section A */}
              <tr>
                <td colSpan={13} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border" style={{ background: "#1565C0", borderColor: "#1565C0" }}>
                  A. Objective KPI — Bobot 20%
                </td>
              </tr>
              {sectionA.map((kpi, idx) => (
                <tr key={kpi.no} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">{kpi.no}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.perspektif}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 whitespace-pre-line">{kpi.kpi}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.satuan}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.formula}</td>
                  <td className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">{kpi.bobot}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs leading-relaxed">{kpi.definisi}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">{kpi.source}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.baseline2025}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.target2026}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.polaritas}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs whitespace-pre-line leading-relaxed">{kpi.detailFormula}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs whitespace-pre-line leading-relaxed">{kpi.keterangan || "—"}</td>
                </tr>
              ))}

              {/* Section B */}
              <tr>
                <td colSpan={13} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border" style={{ background: "#1976D2", borderColor: "#1976D2" }}>
                  B. Functional KPI — Bobot 80%
                </td>
              </tr>
              {sectionB.map((kpi, idx) => (
                <tr key={kpi.no} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">{kpi.no}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.perspektif}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 whitespace-pre-line">{kpi.kpi}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.satuan}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700">{kpi.formula}</td>
                  <td className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">{kpi.bobot}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs leading-relaxed">{kpi.definisi}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">{kpi.source}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.baseline2025}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.target2026}</td>
                  <td className="border border-gray-200 py-2 px-3 text-center text-gray-700">{kpi.polaritas}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs whitespace-pre-line leading-relaxed">{kpi.detailFormula}</td>
                  <td className="border border-gray-200 py-2 px-3 text-gray-700 text-xs whitespace-pre-line leading-relaxed">{kpi.keterangan || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Project content ───────────────────────────────────────────────────────��───

function ProjectContent() {
  const categoryColors: Record<string, string> = {
    "Improvement Project": "bg-blue-50 text-blue-700 border-blue-200",
    "Komite/Task Force":   "bg-purple-50 text-purple-700 border-purple-200",
    "Corporate Event":     "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-gray-800 text-sm">Project Outside Job Scope Detail</h3>
      {PROJECT_ITEMS.map((p) => (
        <div key={p.no} className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{p.projectName}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${categoryColors[p.category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {p.category}
              </span>
            </div>
            <span className="shrink-0 text-xs font-bold bg-[#1A284F]/10 text-[#1A284F] px-2.5 py-1 rounded-lg">Bobot {p.bobot}%</span>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {[
              ["Scope",           p.scope],
              ["Role",            p.role],
              ["Start Date",      p.startDate],
              ["End Date",        p.endDate],
              ["Expected Output", p.expectedOutput],
            ].map(([label, value]) => (
              <div key={label} className={label === "Expected Output" ? "col-span-2" : ""}>
                <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">{label}</p>
                <p className="text-gray-700 font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Interview content ─────────────────────────────────────────────────────────

function InterviewContent() {
  const d = INTERVIEW_DETAIL;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-bold text-gray-800 text-sm">Management Interview Schedule</h3>
      <div className="border border-gray-200 rounded-xl p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          {[
            ["Interviewer",     d.interviewerName],
            ["Scheduled Date",  d.scheduledDate],
            ["Scheduled Time",  d.scheduledTime],
            ["Location",        d.location],
          ].map(([label, value]) => (
            <div key={label} className={label === "Location" ? "col-span-2" : ""}>
              <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-gray-700 font-medium mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {d.notes && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-gray-400 text-[10px] uppercase tracking-wide font-semibold mb-1">Notes</p>
            <p className="text-xs text-gray-600 leading-relaxed">{d.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Appraisal Form setting content ────────────────────────────────────────────

function AppraisalFormSettingContent() {
  const [expandedForm, setExpandedForm] = useState<string | null>("A");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-indigo-500" />
        <h3 className="font-bold text-gray-800 text-sm">Appraisal Form — Setting Detail</h3>
      </div>

      {FORMS.map((form) => {
        const expanded = expandedForm === form.id;
        return (
          <div key={form.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedForm(expanded ? null : form.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
            >
              <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 border border-indigo-100">
                {form.id}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800">{form.tab} — {form.title}</p>
                <p className="text-[10px] text-gray-400">{form.items.length} indikator</p>
              </div>
              {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            </button>
            {expanded && (
              <div className="border-t border-gray-100 bg-gray-50/50">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#1A284F]/5 border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 w-12">No</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500">Indikator</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 w-32">Bobot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item, idx) => (
                      <tr key={item.no} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                        <td className="px-4 py-2.5 text-gray-400 font-semibold">{item.no}</td>
                        <td className="px-4 py-2.5 text-gray-700">{item.label}</td>
                        <td className="px-4 py-2.5 text-gray-500">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Managerial Skill setting content ─────────────────────────────────────────

function ManSkillSettingContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-teal-500" />
        <h3 className="font-bold text-gray-800 text-sm">Managerial Skill — Setting Detail</h3>
        <span className="ml-auto text-xs text-gray-400">{MS_ITEMS.length} kompetensi</span>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#1A284F] text-white">
              <th className="text-left px-4 py-2.5 font-semibold w-10">No</th>
              <th className="text-left px-4 py-2.5 font-semibold">Kompetensi Manajerial</th>
              <th className="text-left px-4 py-2.5 font-semibold w-48">Deskripsi</th>
              <th className="text-center px-4 py-2.5 font-semibold w-20">Skala</th>
            </tr>
          </thead>
          <tbody>
            {MS_ITEMS.map((item, idx) => (
              <tr key={item.no} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-4 py-3 text-gray-400 font-semibold border-b border-gray-100">{item.no}</td>
                <td className="px-4 py-3 text-gray-800 font-medium border-b border-gray-100">{item.label}</td>
                <td className="px-4 py-3 text-gray-500 leading-relaxed border-b border-gray-100">{item.description}</td>
                <td className="px-4 py-3 text-center border-b border-gray-100">
                  <span className="inline-flex gap-0.5">
                    {[1,2,3,4,5].map((n) => (
                      <span key={n} className="w-5 h-5 rounded border border-gray-200 bg-gray-50 text-[10px] font-bold text-gray-400 flex items-center justify-center">{n}</span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
