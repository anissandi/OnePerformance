import { useEffect, useState } from "react";
import { CheckCircle2, Eye, FileEdit, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  canViewerActOnTargetEdit,
  decideTargetEditPhase1,
  decideTargetEditPhase2,
  KPI_TARGET_EDIT_EVENT,
  loadAllTargetEditRequests,
  type KpiTargetEditRequest,
} from "../store/kpiTargetEditStore";
import { getActiveUser, loadManagedUsers } from "../store/authStore";

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  pending_phase1_hricf: { label: "Fase 1 · Menunggu HR ICF", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  phase1_approved:      { label: "Fase 1 Disetujui · Owner Sedang Edit Target", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  phase1_rejected:      { label: "Fase 1 Ditolak HR ICF", cls: "bg-red-50 text-red-700 border-red-200" },
  pending_ap1:          { label: "Fase 2 · Menunggu Approver 1", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_ap2:          { label: "Fase 2 · Menunggu Approver 2", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  pending_gm:           { label: "Fase 2 · Menunggu GM Unit", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  pending_validate:     { label: "Fase 2 · Menunggu Validate HR ICF", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  validated:            { label: "Validated (Target Baru Aktif)", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

export function TargetEditRequestsSection() {
  const [requests, setRequests] = useState<KpiTargetEditRequest[]>(() => Object.values(loadAllTargetEditRequests()));
  const [selectedReq, setSelectedReq] = useState<KpiTargetEditRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  useEffect(() => {
    const sync = () => setRequests(Object.values(loadAllTargetEditRequests()));
    window.addEventListener(KPI_TARGET_EDIT_EVENT, sync);
    window.addEventListener("appraisal-updated", sync);
    window.addEventListener("pa-db-hydrated", sync);
    return () => {
      window.removeEventListener(KPI_TARGET_EDIT_EVENT, sync);
      window.removeEventListener("appraisal-updated", sync);
      window.removeEventListener("pa-db-hydrated", sync);
    };
  }, []);

  const viewer = getActiveUser();
  const allUsers = loadManagedUsers();
  const visible = requests.filter((r) => {
    const check = canViewerActOnTargetEdit(r, viewer, allUsers);
    if (check.canAct) return true;
    return r.decisions.some((d) => d.actorId.toUpperCase() === viewer.employeeId.toUpperCase());
  });

  if (visible.length === 0) return null;

  const handleDecision = (req: KpiTargetEditRequest, approve: boolean) => {
    if (req.stage === "pending_phase1_hricf") {
      decideTargetEditPhase1(req.employeeId, approve, decisionNote.trim());
      toast.success(
        approve
          ? `Edit [Target] Request Fase 1 (${req.employeeName}) disetujui. Owner telah dinotifikasi untuk mengedit target.`
          : `Edit [Target] Request Fase 1 (${req.employeeName}) ditolak.`,
      );
    } else {
      decideTargetEditPhase2(req.employeeId, approve, decisionNote.trim());
      toast.success(
        approve
          ? req.stage === "pending_validate"
            ? `Perubahan Target KPI ${req.employeeName} berhasil di-Validate dan resmi aktif.`
            : `Perubahan Target KPI ${req.employeeName} disetujui dan diteruskan ke tahap berikutnya.`
          : `Perubahan Target KPI ${req.employeeName} dikembalikan untuk revisi.`,
      );
    }
    setDecisionNote("");
    setSelectedReq(null);
    setRequests(Object.values(loadAllTargetEditRequests()));
  };

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-bold text-[#1A284F]">Edit [Target] KPI Requests (Fase 1 &amp; Fase 2)</h3>
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{visible.length}</span>
        </div>
        <p className="text-[11px] text-gray-500">
          Alur: Fase 1 (HR ICF) → Owner Edit Target + Komentar &amp; Memo (JPG/PDF) → Approver 1 → Approver 2 → GM Unit → Validate (HR ICF)
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#1A284F] text-white">
            <tr>
              <th className="px-3 py-2.5 text-left font-semibold">Aksi</th>
              <th className="px-3 py-2.5 text-left font-semibold">Karyawan</th>
              <th className="px-3 py-2.5 text-left font-semibold">Unit Usaha</th>
              <th className="px-3 py-2.5 text-left font-semibold">Kategori &amp; Alasan</th>
              <th className="px-3 py-2.5 text-left font-semibold">Tahap Saat Ini</th>
              <th className="px-3 py-2.5 text-left font-semibold">Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((req) => {
              const act = canViewerActOnTargetEdit(req, viewer, allUsers);
              const badge = STAGE_BADGE[req.stage] ?? { label: req.stage, cls: "bg-gray-100 text-gray-600 border-gray-200" };
              return (
                <tr key={req.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => { setSelectedReq(req); setDecisionNote(""); }}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        act.canAct ? "bg-[#1A284F] text-white hover:bg-[#131d3b]" : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {act.canAct ? `Review (${act.roleLabel})` : "Lihat Detail"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-gray-900">{req.employeeName}</p>
                    <p className="text-[10px] text-gray-400">{req.employeeId} · {req.position}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{req.companyUnit}</td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <span className="font-semibold text-[#1A284F]">[{req.phase1Category}]</span>{" "}
                    <span className="text-gray-600">{req.phase1Reason}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500">{req.phase2SubmittedAt || req.phase1RequestedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedReq && (() => {
        const act = canViewerActOnTargetEdit(selectedReq, viewer, allUsers);
        const isPhase1 = selectedReq.stage === "pending_phase1_hricf";
        const isValidateStep = selectedReq.stage === "pending_validate";
        const origById = new Map(
          (selectedReq.originalItems ?? []).map((it) => [String(it.id ?? ""), it]),
        );
        const changedItems = (selectedReq.proposedItems ?? []).filter((it) => {
          if (!selectedReq.selectedKpiIds?.length) return true;
          return selectedReq.selectedKpiIds.includes(String(it.id ?? ""));
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setSelectedReq(null)}>
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-base font-bold text-[#1A284F]">
                    {isPhase1 ? "Review Edit [Target] Request — Fase 1 (HR ICF)" : "Review Perubahan Target KPI — Fase 2"}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selectedReq.employeeName} ({selectedReq.employeeId}) · {selectedReq.companyUnit}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedReq(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Alasan Permintaan Edit (Fase 1)</p>
                  <p className="font-semibold text-gray-800">[{selectedReq.phase1Category}] {selectedReq.phase1Reason}</p>
                </div>

                {selectedReq.phase2Comment && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 mb-1">Komentar / Note Perubahan Target (Fase 2)</p>
                    <p className="text-gray-800 whitespace-pre-line leading-relaxed">{selectedReq.phase2Comment}</p>
                  </div>
                )}

                {selectedReq.phase2MemoFiles && selectedReq.phase2MemoFiles.length > 0 && (
                  <div className="rounded-xl border border-gray-200 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                      Lampiran Memo &amp; File Pendukung ({selectedReq.phase2MemoFiles.length} file)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedReq.phase2MemoFiles.map((f, idx) => (
                        <a
                          key={idx}
                          href={f.url || "#"}
                          target="_blank"
                          rel="noreferrer"
                          download={f.name}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {f.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {changedItems.length > 0 && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-[#1A284F] px-4 py-2 text-[11px] font-bold text-white">
                      Perbandingan Target KPI (Sebelum vs Sesudah Edit)
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">No</th>
                          <th className="px-3 py-2 text-left">Indikator KPI</th>
                          <th className="px-3 py-2 text-center">Target Awal</th>
                          <th className="px-3 py-2 text-center">Target Baru</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedItems.map((it, idx) => {
                          const old = origById.get(String(it.id ?? ""));
                          return (
                            <tr key={idx} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-semibold">{String(it.no ?? idx + 1)}</td>
                              <td className="px-3 py-2 font-medium text-gray-800">{String(it.kpi ?? "")}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{String(old?.target2026 ?? "—")}</td>
                              <td className="px-3 py-2 text-center font-bold text-emerald-700">{String(it.target2026 ?? "—")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedReq.decisions.length > 0 && (
                  <div className="rounded-xl border border-gray-200 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Riwayat Persetujuan</p>
                    <div className="space-y-1.5">
                      {selectedReq.decisions.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                          <span>
                            <strong>{d.stage}</strong> · {d.actorName}
                            {d.note ? ` — "${d.note}"` : ""}
                          </span>
                          <span className="text-[11px] font-semibold text-gray-500">{d.status} ({d.at})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {act.canAct && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                      Catatan Approver (Opsional untuk Approve, disarankan untuk Reject/Revisi)
                    </label>
                    <textarea
                      rows={2}
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Tambahkan catatan..."
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-3.5">
                <button type="button" onClick={() => setSelectedReq(null)} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  Tutup
                </button>
                {act.canAct && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDecision(selectedReq, false)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {isPhase1 ? "Reject Request" : "Kembalikan / Revisi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(selectedReq, true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isValidateStep ? "Validate Perubahan Target" : "Approve"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
