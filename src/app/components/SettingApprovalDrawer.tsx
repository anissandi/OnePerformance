// @refresh reset
import React, { useEffect, useState } from "react";
import { X, CheckCircle2, RotateCcw, ChevronDown, ChevronUp, Lightbulb, ClipboardList, Layers, Eye, User, Building2, Calendar, MessageSquare, Paperclip, Download, FileSpreadsheet, FileText, Image as ImageIcon } from "lucide-react";
import { type ApprovalRow } from "./ReviewDrawer";
import { ROWS, SAMPLE_GOALS, type SmartGoal } from "../pages/employee/SMARTGoals";
import { loadSubmittedGoals, normalizeSmartGoalsList, parseSmartGoalAttainablePoints } from "../pages/shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { DualScrollTableContainer } from "./DualScrollTableContainer";
import { EmbeddedPdfPreview, EvidenceViewerModal, triggerReliableFileDownload } from "./EvidenceViewerModal";
import {
  buildEmployeeIdMatchSet,
  fetchEmployeeKpiSettingsLive,
  fetchEmployeeSmartGoalsLive,
  fetchKpiAttachmentsForEmployee,
  safeGetLocalRaw,
  type HydratedKpiAttachmentItem,
} from "../services/supabaseClient";
import { FORMS } from "../pages/employee/AppraisalForm";
import { MS_ITEMS } from "../pages/supervisor/ManagerialSkillCheckIn";
import { KPI_ITEMS as FULL_KPI_ITEMS } from "../pages/employee/KPIPage";
import { getActiveUser, loadManagedUsers, resolveEffectiveUserGrouping, type ManagedUser } from "../store/authStore";
import { normalizeDateDDMMYYYY } from "../utils/dateFormat";
import {
  canViewerSeeConfidentialNetProfit,
  enforceRsupPersonalSectionA,
  isRsupGroupCompanyUnit,
  isSectionANetProfitRow,
} from "../store/rsupPersonalSectionAStore";

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
  onApprove: (note?: string) => void;
  onRevision: (note: string) => void;
  readOnly?: boolean;
}

function findUserByRef(allUsers: ManagedUser[], refValue?: string): ManagedUser | undefined {
  const ref = (refValue ?? "").trim().toLowerCase();
  if (!ref) return undefined;
  const refNum = ref.replace(/^(?:emp-?|e)0*/i, "");
  return allUsers.find(
    (u) =>
      (u.regNo ?? "").trim().toLowerCase() === ref ||
      u.employeeId.trim().toLowerCase() === ref ||
      u.name.trim().toLowerCase() === ref ||
      Boolean(refNum && u.employeeId.trim().toLowerCase().replace(/^(?:emp-?|e)0*/i, "") === refNum),
  );
}

export function SettingApprovalDrawer({ row, onClose, onApprove, onRevision, readOnly }: SettingApprovalDrawerProps) {
  const [revisionNote, setRevisionNote] = useState("");
  const [showRevision, setShowRevision] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmRevisionOpen, setConfirmRevisionOpen] = useState(false);
  const [expandedKpi, setExpandedKpi]   = useState<string | null>(null);

  const normEmpId = normalizeEmployeeId(row.employeeId);
  const allUsers = loadManagedUsers();
  const ownerUser = allUsers.find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normEmpId ||
      u.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase(),
  );
  const ap1User = findUserByRef(allUsers, ownerUser?.regNoAp1);
  const ap2User = findUserByRef(allUsers, ownerUser?.regNoAp2);
  const wfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.module === row.type &&
      r.phase === "setting" &&
      r.employeeId === normEmpId,
  );
  const revisionHistory = wfRec?.revisionHistory ?? [];
  const ap1DisplayName =
    wfRec?.decisions.approver1?.approverName || ap1User?.name || ownerUser?.regNoAp1 || "Approver 1";
  const ap2DisplayName =
    wfRec?.decisions.approver2?.approverName || ap2User?.name || ownerUser?.regNoAp2 || "Approver 2";
  const prevA1Note = wfRec?.decisions.approver1?.note ?? "";
  const prevA1Date = wfRec?.decisions.approver1?.date ?? "—";
  const prevA2Note = wfRec?.decisions.approver2?.note ?? "";
  const prevA2Date = wfRec?.decisions.approver2?.date ?? "—";
  const isFourStepType = row.type === "KPI" || row.type === "SMART Goals";
  const isCheckerStage =
    isFourStepType &&
    (row.workflowStageForRow === "checker" ||
      (!row.workflowStageForRow && !wfRec?.decisions.checker));
  const isValidatorStage =
    isFourStepType && row.workflowStageForRow === "validator";
  const workflowStage = isCheckerStage
    ? "checker"
    : isValidatorStage
    ? "validator"
    : row.workflowStageForRow ?? row.reviewerRoleForRow ?? "approver1";
  const [approverComment, setApproverComment] = useState(() =>
    workflowStage === "approver1" ? prevA1Note : workflowStage === "approver2" ? prevA2Note : "",
  );
  const primaryActionLabel = isCheckerStage
    ? "Tandai Checked"
    : isValidatorStage
    ? "Validate"
    : "Approve";
  const confirmTitleText = isCheckerStage
    ? "Konfirmasi Tandai Checked"
    : isValidatorStage
    ? "Konfirmasi Validasi (Validate)"
    : "Konfirmasi Persetujuan (Approve)";
  const confirmActionButtonText = isCheckerStage
    ? "Ya, Tandai Checked"
    : isValidatorStage
    ? "Ya, Validate"
    : "Ya, Approve";
  const isAlreadyProcessed =
    row.status === "Approved" ||
    row.status === "Validated" ||
    row.status === "Checked" ||
    row.status === "Pending-Approver 1" ||
    row.status === "Pending-Approver 2" ||
    row.status === "Pending-Validate" ||
    row.status === "Assessed-Approver 1" ||
    row.status === "Assessed-Approver 2";

  const handleRevision = () => {
    if (!revisionNote.trim()) return;
    setConfirmRevisionOpen(true);
  };

  // SMART Goals (Setting): komentar Approver 1/2 wajib diisi
  const commentRequired = /smart/i.test(row.type) && !isCheckerStage && !isValidatorStage;
  const commentMissing = commentRequired && !approverComment.trim();

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

        <div className="ml-auto shrink-0">
          {isCheckerStage ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-200">
              Checker (HR Unit)
            </span>
          ) : isValidatorStage ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200">
              Validator (HR ICF)
            </span>
          ) : workflowStage === "approver1" ? (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
              Approver 1 ({ap1DisplayName})
            </span>
          ) : (
            <span className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-purple-50 text-purple-700 border-purple-200">
              Approver 2 ({ap2DisplayName})
            </span>
          )}
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
          {row.type === "KPI" && <KPIContent employeeId={row.employeeId} />}
          {row.type === "SMART Goals" && <SmartGoalsSettingContent employeeId={row.employeeId} />}
          {row.type === "Appraisal Form" && <AppraisalFormSettingContent />}
          {row.type === "Managerial Skill" && <ManSkillSettingContent />}
          {row.type === "Project Outside Job" && <ProjectContent />}
          {row.type === "Management Interview" && <InterviewContent />}

          {/* History & Input Catatan Approver (Checker TIDAK memiliki catatan; Validator HANYA melihat history A1 & A2) */}
          {!isCheckerStage && (
            <div className="space-y-3 pt-2">
              {(workflowStage === "approver2" || isValidatorStage) && (
                <div className="border border-blue-200 rounded-2xl overflow-hidden bg-blue-50/40">
                  <div className="px-4 py-2.5 flex items-center justify-between bg-blue-50 border-b border-blue-100">
                    <span className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      History Catatan Approver 1 — {ap1DisplayName}
                    </span>
                    <span className="text-[10px] text-blue-500">{normalizeDateDDMMYYYY(prevA1Date)}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-gray-800 bg-white border border-blue-100 rounded-xl px-4 py-3">
                      {prevA1Note || <span className="italic text-gray-400">Tidak ada catatan dari Approver 1.</span>}
                    </p>
                  </div>
                </div>
              )}

              {isValidatorStage && (
                <div className="border border-purple-200 rounded-2xl overflow-hidden bg-purple-50/40">
                  <div className="px-4 py-2.5 flex items-center justify-between bg-purple-50 border-b border-purple-100">
                    <span className="text-xs font-bold text-purple-800 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                      History Catatan Approver 2 — {ap2DisplayName}
                    </span>
                    <span className="text-[10px] text-purple-500">{normalizeDateDDMMYYYY(prevA2Date)}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-gray-800 bg-white border border-purple-100 rounded-xl px-4 py-3">
                      {prevA2Note || <span className="italic text-gray-400">Tidak ada catatan dari Approver 2.</span>}
                    </p>
                  </div>
                </div>
              )}

              {!isValidatorStage && (
                <div className="border border-indigo-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                  <div className="px-4 py-2.5 flex items-center gap-2 bg-indigo-50">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-xs font-bold text-indigo-700">
                      Komentar &amp; Catatan {workflowStage === "approver1" ? `Approver 1 (${ap1DisplayName})` : `Approver 2 (${ap2DisplayName})`}
                      {commentRequired && <span className="text-rose-500"> * (Wajib Diisi)</span>}
                    </span>
                  </div>
                  <div className="p-4">
                    {readOnly || isAlreadyProcessed ? (
                      <p className="text-xs text-gray-800 bg-indigo-50/40 border border-indigo-100 rounded-xl px-4 py-3">
                        {approverComment || <span className="italic text-gray-400">Tidak ada catatan.</span>}
                      </p>
                    ) : (
                      <textarea
                        rows={3}
                        value={approverComment}
                        onChange={(e) => setApproverComment(e.target.value)}
                        placeholder="Tambahkan komentar atau catatan untuk pengajuan ini..."
                        className={`w-full text-xs border-2 rounded-xl px-3.5 py-2.5 outline-none resize-none text-gray-700 ${commentMissing ? "border-rose-200 focus:border-rose-400" : "border-indigo-100 focus:border-indigo-400"}`}
                      />
                    )}
                    {commentMissing && !readOnly && !isAlreadyProcessed && (
                      <p className="mt-1.5 text-[11px] text-rose-500">Komentar &amp; Catatan Approver wajib diisi sebelum menyetujui.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Action area ─────────────────────────────────────────────────────── */}
      {!readOnly && !isAlreadyProcessed && (
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
                  disabled={commentMissing}
                  title={commentMissing ? "Komentar & Catatan Approver wajib diisi" : undefined}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#1A284F] text-white rounded-xl font-semibold text-sm hover:bg-[#131d3b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {primaryActionLabel}
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
      {(readOnly || isAlreadyProcessed) && (
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
            <h3 className="text-base font-bold text-gray-900 mb-2">{confirmTitleText}</h3>
            <p className="text-sm text-gray-600 mb-6">
              {isCheckerStage ? (
                <>
                  Apakah Anda yakin ingin menandai pengajuan <strong>{row.type} (Setting)</strong> dari <strong>{row.name}</strong> ({row.employeeId}) sebagai <strong>Checked</strong>?
                </>
              ) : isValidatorStage ? (
                <>
                  Apakah Anda yakin ingin memvalidasi (<strong>Validate</strong>) pengajuan <strong>{row.type} (Setting)</strong> dari <strong>{row.name}</strong> ({row.employeeId})?
                </>
              ) : (
                <>
                  Apakah Anda yakin ingin menyetujui pengajuan <strong>{row.type} (Setting)</strong> dari <strong>{row.name}</strong> ({row.employeeId})?
                </>
              )}
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
                  onApprove(!isCheckerStage && !isValidatorStage ? approverComment.trim() : undefined);
                }}
                className="flex-1 py-2.5 rounded-full bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
              >
                {confirmActionButtonText}
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
  const [goals, setGoals] = useState<SmartGoal[]>(() => loadSubmittedGoals(employeeId) ?? []);

  useEffect(() => {
    let cancelled = false;
    const local = loadSubmittedGoals(employeeId);
    setGoals(local ?? []);
    if (!local || local.length === 0) {
      void fetchEmployeeSmartGoalsLive<SmartGoal>(employeeId).then((remote) => {
        if (!cancelled && remote && remote.goals.length > 0) {
          setGoals(normalizeSmartGoalsList(remote.goals));
        }
      });
    }
    const onSync = () => {
      if (!cancelled) {
        const latest = loadSubmittedGoals(employeeId);
        if (latest) setGoals(latest);
      }
    };
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener("storage", onSync);
    return () => {
      cancelled = true;
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener("storage", onSync);
    };
  }, [employeeId]);

  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center text-xs text-gray-400">
        Belum ada data SMART Goals yang disimpan oleh karyawan ini.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-gray-800 text-sm">SMART Goals Setting — 2026</h3>
        <span className="ml-auto text-xs text-gray-400">{goals.length} goal{goals.length !== 1 ? "s" : ""} · {goals.reduce((s, g) => s + parseSmartGoalAttainablePoints(g).length, 0)} attainable</span>
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
                    {row.key === "attainable" ? (
                      (() => {
                        const pts = parseSmartGoalAttainablePoints(g);
                        return pts.length > 0 ? (
                          <div className="flex flex-col gap-1 text-[11px] text-gray-700 leading-relaxed min-h-[60px]">
                            {pts.map((pt, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <span className="font-bold text-[#1A284F] shrink-0">{idx + 1}.</span>
                                <span>{pt}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-300 italic min-h-[60px]">—</p>
                        );
                      })()
                    ) : (
                      <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[60px]">
                        {(g[row.key as keyof typeof g] as string) || <span className="text-gray-300 italic">—</span>}
                      </p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── KPI content ────────────────────────────��──────────────────────────────────

interface StoredOwnerKpiItem {
  id?: string;
  no: string;
  section: string;
  sectionLabel?: string;
  sectionBobot?: string;
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  bobot: string;
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: string;
  detailFormula: string;
  keterangan?: string;
  trackingPeriod?: string;
  periodicTargetBlock?: boolean;
  blockedMonths?: number[];
  monthlyTargets?: Record<string, string>;
  cascading?: string;
  _cascadeType?: string;
  colorIndicator?: boolean;
  indicatorMode?: "numeric" | "color" | "ratio";
}

const OWNER_PERSP_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

const OWNER_COLOR_BAND_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  "95%-100%":  { color: "#16a34a", bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
  "≥80%-<95%": { color: "#b45309", bg: "#fefce8", border: "#fde047", dot: "#eab308" },
  "<80%":      { color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
};

const OWNER_BASELINE_COLOR_META: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  Blue:  { color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6" },
  Red:   { color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
  Black: { color: "#111827", bg: "#f9fafb", border: "#d1d5db", dot: "#374151" },
};

function OwnerColorValueBadge({ value }: { value: string; isBaseline?: boolean }) {
  const meta = resolveKpiColorBandMeta(value);
  if (!meta) return <span className="text-gray-400 italic text-[11px]">{value || "—"}</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
      style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

function derivePeriodeTrackingLabel(satuan?: string, trackingPeriod?: string): string {
  return normalizeTrackingPeriod(trackingPeriod, satuan);
}

function classifyAttachmentType(name: string, mimeType = ""): {
  badge: string;
  badgeClass: string;
  isPreviewable: boolean;
  kind: "image" | "pdf" | "excel" | "word" | "other";
} {
  const n = (name || "").toLowerCase();
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n)) {
    return { badge: "Gambar", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", isPreviewable: true, kind: "image" };
  }
  if (m === "application/pdf" || /\.pdf$/i.test(n)) {
    return { badge: "PDF", badgeClass: "bg-rose-50 text-rose-700 border-rose-200", isPreviewable: true, kind: "pdf" };
  }
  if (/\.(xlsx?|csv)$/i.test(n) || m.includes("spreadsheet") || m.includes("excel")) {
    return { badge: "Excel", badgeClass: "bg-teal-50 text-teal-700 border-teal-200", isPreviewable: false, kind: "excel" };
  }
  if (/\.(docx?)$/i.test(n) || m.includes("word")) {
    return { badge: "Word", badgeClass: "bg-blue-50 text-blue-700 border-blue-200", isPreviewable: false, kind: "word" };
  }
  return { badge: "File", badgeClass: "bg-slate-100 text-slate-600 border-slate-200", isPreviewable: false, kind: "other" };
}

function triggerAttachmentFileDownload(url: string, fileName: string) {
  if (!url) return;
  if (url.startsWith("data:")) {
    try {
      const [head, body] = url.split(",", 2);
      const mime = head.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
      const isBase64 = /;base64/i.test(head);
      const raw = isBase64 ? atob(body) : decodeURIComponent(body);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      return;
    } catch {
      // fallback below
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function KPIContent({ employeeId }: { employeeId: string }) {
  const viewerUser = getActiveUser();
  const ownerUserObj = loadManagedUsers().find(
    (u) =>
      u.employeeId.trim().toLowerCase() === employeeId.trim().toLowerCase() ||
      normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(employeeId),
  );
  const isOwnerRsup = Boolean(ownerUserObj && isRsupGroupCompanyUnit(ownerUserObj.company));
  const maskConfNetProfit = isOwnerRsup && !canViewerSeeConfidentialNetProfit(viewerUser, "setting");

  const readLocalOwnerKpiItems = (): StoredOwnerKpiItem[] => {
    try {
      const candidates = buildEmployeeIdMatchSet(employeeId);
      candidates.add(normalizeEmployeeId(employeeId));
      const raw = safeGetLocalRaw("pa_kpi_setting_by_emp_v2");
      const map = raw ? (JSON.parse(raw) as Record<string, StoredOwnerKpiItem[]>) : {};
      for (const key of candidates) {
        const stored = map[key];
        if (Array.isArray(stored) && stored.length > 0) {
          return isOwnerRsup ? enforceRsupPersonalSectionA(stored, ownerUserObj) : stored;
        }
      }
      const lowerCandidates = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
      for (const [k, v] of Object.entries(map)) {
        if (lowerCandidates.has(k.toLowerCase()) && Array.isArray(v) && v.length > 0) {
          return isOwnerRsup ? enforceRsupPersonalSectionA(v, ownerUserObj) : v;
        }
      }
    } catch {
      // ignore
    }
    return [];
  };

  const readLocalKpiAttachments = (): HydratedKpiAttachmentItem[] => {
    const out: HydratedKpiAttachmentItem[] = [];
    const seen = new Set<string>();
    const candidates = buildEmployeeIdMatchSet(employeeId);
    candidates.add(normalizeEmployeeId(employeeId));
    const lowerCandidates = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
    try {
      const raw = safeGetLocalRaw("pa_kpi_attachments_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, HydratedKpiAttachmentItem[]>) : {};
      for (const [k, arr] of Object.entries(map)) {
        if (!lowerCandidates.has(k.trim().toLowerCase()) || !Array.isArray(arr)) continue;
        for (const item of arr) {
          if (!item || !item.name) continue;
          const sig = `${item.id || ""}::${item.name}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            out.push(item);
          }
        }
      }
    } catch {
      // ignore
    }
    try {
      const evRaw = safeGetLocalRaw("pa_uploaded_evidence_v1");
      const evList = evRaw ? (JSON.parse(evRaw) as Array<Record<string, unknown>>) : [];
      for (const ev of evList) {
        if (
          ev &&
          ev.moduleType === "Lampiran KPI Setting" &&
          lowerCandidates.has(String(ev.employeeId ?? "").trim().toLowerCase())
        ) {
          const id = String(ev.id ?? "");
          const name = String(ev.fileName ?? "");
          if (!name) continue;
          if (!out.some((x) => x.id === id || (x.name === name && x.size === Number(ev.fileSize ?? 0)))) {
            out.push({
              id: id || name,
              name,
              size: Number(ev.fileSize ?? 0),
              mimeType: ev.mimeType ? String(ev.mimeType) : undefined,
              url: String(ev.url ?? ""),
              uploadedAt: String(ev.submittedDate ?? ""),
            });
          }
        }
      }
    } catch {
      // ignore
    }
    return out;
  };

  const [kpiItems, setKpiItems] = useState<StoredOwnerKpiItem[]>(() => readLocalOwnerKpiItems());
  const [kpiAttachments, setKpiAttachments] = useState<HydratedKpiAttachmentItem[]>(() => readLocalKpiAttachments());
  const [previewAtt, setPreviewAtt] = useState<HydratedKpiAttachmentItem | null>(null);
  const [embeddedPdfId, setEmbeddedPdfId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKpiItems(readLocalOwnerKpiItems());
    setKpiAttachments(readLocalKpiAttachments());
    void fetchKpiAttachmentsForEmployee(employeeId).then((remoteAtts) => {
      if (!cancelled && remoteAtts.length > 0) {
        setKpiAttachments(remoteAtts);
      }
    });
    void fetchEmployeeKpiSettingsLive<StoredOwnerKpiItem>(employeeId).then((remoteItems) => {
      if (!cancelled && remoteItems.length > 0) {
        setKpiItems(remoteItems);
      }
    });
    const onSync = () => {
      if (cancelled) return;
      const latestLocalItems = readLocalOwnerKpiItems();
      if (latestLocalItems.length > 0) setKpiItems(latestLocalItems);
      const latestLocalAtts = readLocalKpiAttachments();
      if (latestLocalAtts.length > 0) setKpiAttachments(latestLocalAtts);
    };
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener("pa-evidence-updated", onSync);
    window.addEventListener("storage", onSync);
    return () => {
      cancelled = true;
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener("pa-evidence-updated", onSync);
      window.removeEventListener("storage", onSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const ownerUser = loadManagedUsers().find(
    (u) =>
      normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(employeeId) ||
      u.employeeId.trim().toLowerCase() === employeeId.trim().toLowerCase(),
  );
  const ownerGrouping = ownerUser ? String(resolveEffectiveUserGrouping(ownerUser) ?? "").trim() : "";
  const hideCascadingForOwner =
    ["Ka./Wa.Ka.Dept", "Ka./Wa.Ka.Bagian", "Ka./Wa.Ka.Seksi", "Operasional"].includes(ownerGrouping) &&
    !kpiItems.some((k) => Boolean(k.cascading || k._cascadeType));
  const showCascadingCol = !hideCascadingForOwner;
  const totalCols = showCascadingCol ? 15 : 14;

  const sections = Array.from(new Set(kpiItems.map((k) => k.section || "A"))).sort();
  const bgColors = ["#1565C0", "#1976D2", "#1E88E5", "#2196F3", "#42A5F5", "#64B5F6"];
  const sectionChipStyles = [
    "bg-blue-50 text-blue-700",
    "bg-indigo-50 text-indigo-700",
    "bg-violet-50 text-violet-700",
    "bg-sky-50 text-sky-700",
    "bg-teal-50 text-teal-700",
    "bg-cyan-50 text-cyan-700",
  ];

  const totalBobot = Math.round(kpiItems.reduce((sum, k) => sum + (parseFloat(String(k.bobot).replace("%", "")) || 0), 0) * 100) / 100;
  const isBobot100 = Math.round(totalBobot * 100) === 10000;

  if (kpiItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 py-10 text-center text-xs text-gray-400">
        Belum ada data KPI Setting yang disimpan oleh karyawan ini.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-gray-800 text-sm">KPI Setting Detail</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#1A284F]/5 rounded-lg">
            <span className="text-xs font-bold text-[#1A284F]">Total KPI:</span>
            <span className="text-xs font-bold text-[#1A284F]">{kpiItems.length}</span>
          </div>
          {sections.map((sec, si) => (
            <div key={sec} className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${sectionChipStyles[si % sectionChipStyles.length]}`}>
              <span>Section {sec}:</span>
              <span>{kpiItems.filter((k) => (k.section || "A") === sec).length}</span>
            </div>
          ))}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${isBobot100 ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"}`}>
            <span>Total Bobot:</span>
            <span>{totalBobot}%</span>
          </div>
        </div>
      </div>

      <DualScrollTableContainer className="rounded-xl border border-gray-200 shadow-sm bg-white">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 0, zIndex: 25, background: "#1A284F", minWidth: 54, maxWidth: 54 }}>No</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: 54, zIndex: 25, background: "#1A284F", minWidth: 140, maxWidth: 140 }}>Perspektif</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: 194, zIndex: 25, background: "#1A284F", minWidth: 270, maxWidth: 270, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" }}>KPI</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 160 }}>Satuan</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 100 }}>Formula Setahun</th>
                <th className="border border-[#1A284F]/30 py-3 px-2 font-semibold text-center" style={{ minWidth: 80 }}>Bobot</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 240 }}>Definisi</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 155 }}>Source</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Baseline 2025</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Target 2026</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Polaritas</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 250 }}>Detail Formula</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 180 }}>Keterangan</th>
                <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 110 }}>Periode Tracking</th>
                {showCascadingCol && (
                  <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 110 }}>CASCADING (FC; PC; CC)</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, si) => {
                const secRows = kpiItems.filter((k) => (k.section || "A") === sec);
                const first = secRows[0];
                const secSubSum = Math.round(secRows.reduce((s, r) => s + (parseFloat(String(r.bobot).replace("%", "")) || 0), 0) * 100) / 100;
                const pureSecName = first?.sectionLabel || (sec === "A" ? "Objective KPI" : sec === "B" ? "Functional KPI" : `Section ${sec}`);
                const secBobotLabel = first?.sectionBobot || `${secSubSum}%`;
                const bg = bgColors[si % bgColors.length];
                return (
                  <React.Fragment key={sec}>
                    <tr>
                      <td colSpan={totalCols} className="p-0 text-white text-xs font-bold border" style={{ background: bg, borderColor: bg }}>
                        <div className="py-2 px-4 inline-flex items-center gap-2 whitespace-nowrap" style={{ position: "sticky", left: 0, zIndex: 15, background: bg }}>
                          <span className="uppercase tracking-wider">{sec}. {pureSecName}</span>
                          <span className="text-white/90 text-[11px] font-semibold">— Bobot <strong className="text-white">{secBobotLabel}</strong></span>
                          <span className="text-[10px] text-white/75 font-normal">(Terisi {secSubSum}%)</span>
                        </div>
                      </td>
                    </tr>
                    {secRows.map((kpi, idx) => {
                      const stickyBg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
                      const isColorMode = Boolean(kpi.colorIndicator || kpi.indicatorMode === "color");
                      const cascVal = kpi.cascading || kpi._cascadeType || "";
                      return (
                      <tr key={kpi.id ?? `${sec}-${kpi.no}-${idx}`} className={idx % 2 === 0 ? "bg-white hover:bg-gray-50/50" : "bg-slate-50/60 hover:bg-gray-50"}>
                        <td className="border border-gray-200 py-3 px-2 text-center text-xs font-semibold text-gray-600" style={{ position: "sticky", left: 0, zIndex: 12, background: stickyBg, minWidth: 54, maxWidth: 54 }}>{kpi.no}</td>
                        <td className="border border-gray-200 py-3 px-3" style={{ position: "sticky", left: 54, zIndex: 12, background: stickyBg, minWidth: 140, maxWidth: 140 }}>
                          <span className={`text-xs font-bold ${OWNER_PERSP_COLOR[kpi.perspektif] ?? "text-gray-700"}`}>{kpi.perspektif}</span>
                        </td>
                        <td className="border border-gray-200 py-3 px-3" style={{ position: "sticky", left: 194, zIndex: 12, background: stickyBg, minWidth: 270, maxWidth: 270, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}>
                          <p className="text-xs font-medium text-gray-800 whitespace-pre-line leading-relaxed">{kpi.kpi}</p>
                        </td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600">{kpi.satuan}</td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 text-center">{kpi.formula}</td>
                        <td className="border border-gray-200 py-3 px-2 text-center">
                          <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                        </td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 leading-relaxed whitespace-pre-line">{kpi.definisi || "—"}</td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600">{kpi.source || "—"}</td>
                        <td className="border border-gray-200 py-3 px-3 text-center text-xs font-medium text-gray-700">
                          {maskConfNetProfit && isSectionANetProfitRow(kpi) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold select-none">
                              confidential
                            </span>
                          ) : (isColorMode || isKnownKpiColorBandValue(kpi.baseline2025)) ? (
                            <OwnerColorValueBadge value={kpi.baseline2025} isBaseline />
                          ) : (
                            kpi.baseline2025 || "—"
                          )}
                        </td>
                        <td className="border border-gray-200 py-3 px-3 text-center text-xs font-bold text-[#1A284F]">
                          {maskConfNetProfit && isSectionANetProfitRow(kpi) ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold select-none">
                              confidential
                            </span>
                          ) : (isColorMode || isKnownKpiColorBandValue(kpi.target2026)) ? (
                            <OwnerColorValueBadge value={kpi.target2026} />
                          ) : (
                            kpi.target2026 || "—"
                          )}
                        </td>
                        <td className="border border-gray-200 py-3 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kpi.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : kpi.polaritas === "Minimize" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                            {kpi.polaritas}
                          </span>
                        </td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed">{kpi.detailFormula || "—"}</td>
                        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed">{kpi.keterangan || "—"}</td>
                        <td className="border border-gray-200 py-3 px-3 text-center text-xs text-gray-600">
                          <div className="flex flex-col items-center gap-1">
                            <span>{derivePeriodeTrackingLabel(kpi.satuan, kpi.trackingPeriod)}</span>
                            {(() => {
                              const badgeText = formatBlockedMonthsBadgeText(kpi);
                              return badgeText ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-semibold leading-tight" title={badgeText}>
                                  {badgeText}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </td>
                        {showCascadingCol && (
                          <td className="border border-gray-200 py-3 px-2 text-center">
                            {cascVal ? (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cascVal === "FC" ? "bg-indigo-50 text-indigo-700" : cascVal === "PC" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}>
                                {cascVal}
                              </span>
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
      {kpiAttachments.length > 0 && (
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/40 p-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Paperclip className="w-4 h-4 text-sky-700" />
            <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Lampiran KPI</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
              {kpiAttachments.length} file terlampir
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {kpiAttachments.map((att) => {
              const meta = classifyAttachmentType(att.name, att.mimeType);
              const IconComp =
                meta.kind === "image"
                  ? ImageIcon
                  : meta.kind === "excel"
                    ? FileSpreadsheet
                    : meta.kind === "pdf" || meta.kind === "word"
                      ? FileText
                      : Paperclip;
              return (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-sky-200 text-xs text-gray-700 shadow-2xs"
                >
                  <IconComp className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${meta.badgeClass}`}>
                    {meta.badge}
                  </span>
                  <span className="font-medium text-[#1A284F] truncate max-w-[220px]" title={att.name}>
                    {att.name}
                  </span>
                  {att.url && meta.isPreviewable && (
                    <button
                      type="button"
                      onClick={() => {
                        if (meta.kind === "pdf") {
                          setEmbeddedPdfId((prev) => (prev === att.id ? null : att.id));
                        } else {
                          setPreviewAtt(att);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold transition-colors ${
                        meta.kind === "pdf" && embeddedPdfId === att.id
                          ? "bg-[#1A284F] text-white border-[#1A284F]"
                          : "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-200"
                      }`}
                      title={meta.kind === "pdf" ? "Buka PDF langsung (embed)" : "Lihat langsung"}
                    >
                      <Eye className="w-3 h-3" /> {meta.kind === "pdf" ? (embeddedPdfId === att.id ? "Tutup PDF" : "Buka PDF") : "Lihat"}
                    </button>
                  )}
                  {att.url && (
                    <button
                      type="button"
                      onClick={() => { void triggerReliableFileDownload(att.url, att.name); }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1A284F]/10 text-[#1A284F] hover:bg-[#1A284F]/20 text-[10px] font-semibold transition-colors"
                      title="Download lampiran"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const activePdf = kpiAttachments.find(
              (a) => a.id === embeddedPdfId && (a.mimeType === "application/pdf" || /\.pdf$/i.test(a.name || "")) && a.url,
            );
            if (!activePdf) return null;
            return (
              <EmbeddedPdfPreview
                url={activePdf.url}
                name={activePdf.name}
                height={460}
                onClose={() => setEmbeddedPdfId(null)}
                onExpandModal={() => setPreviewAtt(activePdf)}
              />
            );
          })()}
        </div>
      )}
      {previewAtt && (
        <EvidenceViewerModal
          name={previewAtt.name}
          url={previewAtt.url}
          mimeType={previewAtt.mimeType}
          subtitle="Lampiran KPI Setting"
          onClose={() => setPreviewAtt(null)}
        />
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
import {
  formatBlockedMonthsBadgeText,
  isKnownKpiColorBandValue,
  normalizeTrackingPeriod,
  resolveKpiColorBandMeta,
} from "../utils/kpiNumberAndPeriod";
