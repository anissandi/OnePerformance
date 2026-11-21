import React, { useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  FileEdit,
  MessageSquare,
  RotateCcw,
  User,
  X,
  XCircle,
} from "lucide-react";
import type { ApprovalRow } from "./ReviewDrawer";
import {
  getStageDisplayLabel,
  loadKpiTrackingEditRequests,
  resolveKpiTrackingEditChain,
} from "../store/kpiTrackingEditStore";
import { loadManagedUsers } from "../store/authStore";

const PERSP_TEXT_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Financial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

interface KpiTrackingEditReviewDrawerProps {
  row: ApprovalRow;
  readOnly?: boolean;
  onClose: () => void;
  onAccept: () => void;
  onRevision: (note: string) => void;
  onReject: (reason: string) => void;
}

export function KpiTrackingEditReviewDrawer({
  row,
  readOnly = false,
  onClose,
  onAccept,
  onRevision,
  onReject,
}: KpiTrackingEditReviewDrawerProps) {
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [revisionPopupOpen, setRevisionPopupOpen] = useState(false);
  const [rejectPopupOpen, setRejectPopupOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const reqId = row.no.startsWith("KPITREDIT::") ? row.no.slice("KPITREDIT::".length) : "";
  const req = reqId ? loadKpiTrackingEditRequests().find((r) => r.id === reqId) : undefined;

  const allUsers = loadManagedUsers();
  const ownerUser = allUsers.find(
    (u) => u.employeeId.trim().toLowerCase() === row.employeeId.trim().toLowerCase(),
  );
  const chain = ownerUser ? resolveKpiTrackingEditChain(ownerUser, allUsers) : null;

  const stageRole = row.workflowStageForRow ?? "approver1";
  const isCheckerStage = stageRole === "checker";
  const isValidatorStage = stageRole === "validator";
  const isCheckerOrValidator = isCheckerStage || isValidatorStage;

  const primaryButtonLabel = isCheckerStage
    ? "Checked"
    : isValidatorStage
    ? "Validated"
    : "Approved";

  const isAlreadyProcessed =
    readOnly ||
    Boolean(
      req &&
        !req.stage.startsWith("pending_"),
    );

  const stageStepStatus = (stepStage: "checker" | "approver1" | "approver2" | "validator") => {
    if (!req) return { badge: "Waiting", tone: "bg-gray-100 text-gray-500 border-gray-200", date: "—" };
    if (stepStage === "checker" && req.bypassChecker) {
      return { badge: "Bypassed", tone: "bg-slate-100 text-slate-600 border-slate-200", date: req.requestedAt };
    }
    const latestDec = [...req.decisions].reverse().find((d) => d.stage === stepStage);
    if (latestDec) {
      if (latestDec.decision === "Revision") {
        return { badge: "Revision", tone: "bg-orange-100 text-orange-800 border-orange-200", date: latestDec.decidedAt };
      }
      if (latestDec.decision === "Rejected") {
        return { badge: "Rejected", tone: "bg-red-100 text-red-700 border-red-200", date: latestDec.decidedAt };
      }
      return {
        badge: latestDec.decision,
        tone: "bg-emerald-100 text-emerald-800 border-emerald-200",
        date: latestDec.decidedAt,
      };
    }
    const stageMap: Record<string, string> = {
      pending_checker: "checker",
      pending_ap1: "approver1",
      pending_ap2: "approver2",
      pending_validator: "validator",
    };
    if (stageMap[req.stage] === stepStage) {
      return { badge: "Pending", tone: "bg-amber-100 text-amber-800 border-amber-200", date: "—" };
    }
    return { badge: "Waiting", tone: "bg-gray-100 text-gray-500 border-gray-200", date: "—" };
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-7 py-5 bg-[#1A284F] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center shrink-0">
              <FileEdit className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold leading-tight">Review Request Edit KPI Tracking</h2>
                {req && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-amber-200 border border-white/20">
                    {getStageDisplayLabel(req.stage)}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/70 mt-0.5 truncate">
                {row.name} ({row.employeeId}) · {row.companyUnit}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-7 space-y-6 bg-slate-50/40">
          {/* Employee Identity Card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-[#1A284F] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Karyawan</p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{row.name}</p>
                <p className="font-mono text-[#1A284F] font-semibold">{row.employeeId}</p>
                <p className="text-gray-500 mt-0.5">{row.position}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-[#1A284F] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Unit &amp; Organisasi</p>
                <p className="font-semibold text-gray-800 mt-0.5">{row.companyUnit}</p>
                <p className="text-gray-600">{row.division}</p>
                <p className="text-gray-500">{row.department}{row.bagian ? ` · ${row.bagian}` : ""}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar className="w-4 h-4 text-[#1A284F] mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Tanggal Pengajuan</p>
                <p className="font-bold text-gray-900 mt-0.5">{req?.requestedAt || row.editRequestDate || row.submittedDate}</p>
                <p className="text-gray-500 mt-0.5">Tipe Modul: <strong className="text-[#1A284F]">KPI Tracking</strong></p>
              </div>
            </div>
          </div>

          {/* 4-Stage Approval Progress */}
          {chain && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Alur Persetujuan Request Edit KPI Tracking
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {chain.steps.map((step, i) => {
                  const st = stageStepStatus(step.stage);
                  return (
                    <div key={step.stage} className="rounded-xl border border-gray-200 bg-slate-50/60 p-3 flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-bold text-[#1A284F]">
                          {i + 1}. {step.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.tone}`}>
                          {st.badge}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-600">
                        <p className="font-semibold text-gray-800 truncate" title={step.name}>{step.name}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{st.date}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Requested Months & KPIs */}
          {req ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Bulan KPI Tracking yang Diajukan untuk Diedit
                </p>
                <div className="flex flex-wrap gap-2">
                  {req.monthLabels.map((m) => (
                    <span
                      key={m}
                      className="px-3 py-1 rounded-full bg-[#1A284F] text-white text-xs font-bold shadow-2xs"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2.5">
                  Daftar Indikator KPI yang Diajukan ({req.kpiSummaries.length} KPI)
                </p>
                <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                  {req.kpiSummaries.map((k) => (
                    <div key={k.no} className="px-4 py-3 bg-white flex items-start gap-2.5 text-xs">
                      <span className="px-2 py-0.5 rounded bg-[#1A284F]/10 text-[#1A284F] font-bold shrink-0">
                        No. {k.no}
                      </span>
                      <div className="leading-relaxed">
                        <span className={`font-bold ${PERSP_TEXT_COLOR[k.perspektif] ?? "text-slate-700"}`}>
                          {k.perspektif}
                        </span>
                        <span className="text-gray-400 font-semibold mx-1.5">-</span>
                        <span className="font-medium text-gray-800">{k.kpiTitle}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Reason for Edit Request */}
          <div className="rounded-2xl bg-amber-50/90 border border-amber-200 p-5">
            <p className="text-xs text-amber-800 uppercase tracking-wider font-bold mb-2">
              Alasan Permintaan Edit KPI Tracking
            </p>
            <p className="text-sm text-amber-950 leading-relaxed whitespace-pre-line">
              {req ? req.reason : row.editRequestReason || "—"}
            </p>
          </div>

          {/* Riwayat Keputusan / Catatan Revisi / Alasan Penolakan */}
          {req && req.decisions.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#1A284F]" />
                <p className="text-xs font-bold uppercase tracking-wider text-gray-600">
                  Riwayat Keputusan &amp; Catatan ({req.decisions.length})
                </p>
              </div>
              <div className="space-y-2">
                {req.decisions.map((d, idx) => (
                  <div
                    key={`${d.stage}-${idx}`}
                    className={`rounded-xl border px-4 py-3 text-xs ${
                      d.decision === "Revision"
                        ? "bg-orange-50/70 border-orange-200"
                        : d.decision === "Rejected"
                        ? "bg-red-50/70 border-red-200"
                        : "bg-emerald-50/50 border-emerald-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">
                        {d.roleLabel} — {d.approverName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.decision === "Revision"
                              ? "bg-orange-100 text-orange-800"
                              : d.decision === "Rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {d.decision}
                        </span>
                        <span className="text-[11px] text-gray-400">{d.decidedAt}</span>
                      </div>
                    </div>
                    {d.note && (
                      <p className="mt-1.5 text-gray-700 leading-relaxed">
                        <span className="font-semibold">
                          {d.decision === "Revision"
                            ? "Catatan Revisi:"
                            : d.decision === "Rejected"
                            ? "Alasan Tolak Permintaan:"
                            : "Catatan:"}
                        </span>{" "}
                        {d.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isAlreadyProcessed ? (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-7 py-4 flex items-center justify-end gap-3 shrink-0">
            {isCheckerOrValidator ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRevisionNote("");
                    setRevisionPopupOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Revision Request
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmApproveOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {primaryButtonLabel}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRejectReason("");
                    setRejectPopupOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  Reject Request
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmApproveOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Approved
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-7 py-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">
                Menampilkan detail riwayat <strong>Request Edit KPI Tracking</strong> (mode baca).
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Tutup
            </button>
          </div>
        )}

        {/* 1. Popup Konfirmasi Checked / Approved / Validated */}
        {confirmApproveOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => setConfirmApproveOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Konfirmasi {primaryButtonLabel}
              </h3>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                {isCheckerStage ? (
                  <>
                    Tandai pengajuan <strong>Request Edit KPI Tracking</strong> dari <strong>{row.name}</strong> ({row.employeeId}) sebagai <strong>Checked</strong>?
                  </>
                ) : isValidatorStage ? (
                  <>
                    Validasi (<strong>Validated</strong>) pengajuan <strong>Request Edit KPI Tracking</strong> dari <strong>{row.name}</strong> ({row.employeeId}) agar akses edit dibuka?
                  </>
                ) : (
                  <>
                    Setujui (<strong>Approved</strong>) pengajuan <strong>Request Edit KPI Tracking</strong> dari <strong>{row.name}</strong> ({row.employeeId})?
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
                    onAccept();
                  }}
                  className="flex-1 py-2.5 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  Ya, {primaryButtonLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Popup Revision Request (Khusus Checker & Validator — input Catatan Revisi) */}
        {revisionPopupOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => setRevisionPopupOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Revision Request</h3>
                  <p className="text-xs text-gray-500">Kembalikan Request Edit KPI Tracking ke {row.name}</p>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Catatan Revisi <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="Tuliskan catatan revisi untuk karyawan..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRevisionPopupOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!revisionNote.trim()}
                  onClick={() => {
                    const note = revisionNote.trim();
                    if (!note) return;
                    setRevisionPopupOpen(false);
                    onRevision(note);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Kirim Revisi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Popup Reject Request (Khusus Approver 1 & 2 — input Alasan Tolak Permintaan) */}
        {rejectPopupOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => setRejectPopupOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Reject Request</h3>
                  <p className="text-xs text-gray-500">Tolak pengajuan Request Edit KPI Tracking dari {row.name}</p>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Alasan Tolak Permintaan <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Tuliskan alasan penolakan permintaan edit KPI Tracking..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRejectPopupOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!rejectReason.trim()}
                  onClick={() => {
                    const r = rejectReason.trim();
                    if (!r) return;
                    setRejectPopupOpen(false);
                    onReject(r);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Tolak Permintaan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
