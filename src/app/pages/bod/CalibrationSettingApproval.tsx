import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock, RotateCcw, Settings, X } from "lucide-react";
import { toast } from "sonner";
import {
  decideSoyApproval,
  loadSoyApprovals,
  SOY_EVENT,
  type SoyApprovalRecord,
  type SoyStatus,
} from "../../store/calibrationSoyStore";
import { computeUnitQuotaAllocation } from "../hr/CalibrationSetting";
import {
  getActiveUser,
  getCalibrationInvolvedUnits,
  getCalibrationRoleForUnit,
  getGroupCompaniesForUnit,
  getRoleAllowedCompanyUnits,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
} from "../../store/authStore";
import { hasRolePermission } from "../hr/settings/AccessManagement";

const STATUS_TONE: Record<SoyStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Revision: "bg-orange-50 text-orange-700 border-orange-200",
};

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(v: string) {
  return parseFloat(String(v).replace("%", "")) || 0;
}

function ProportionTable({ title, rows, grades }: {
  title: string;
  rows: Array<{ id: string; label: string; parent?: string; hc: number; calcs: number[] }>;
  grades: SoyApprovalRecord["snapshot"]["calibrationGrades"];
}) {
  const total = rows.reduce((s, r) => s + r.hc, 0);
  const colTotals = grades.map((_, gi) => rows.reduce((s, r) => s + (r.calcs[gi] ?? 0), 0));
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="flex items-center justify-between bg-[#1A284F] px-4 py-2.5 text-white">
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className="text-[11px] text-white/70">Total HC: {total}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Organisasi</th>
              <th className="px-3 py-2 text-right">HC</th>
              {grades.map((g) => (
                <th key={g.id} className="px-3 py-2 text-right">{g.grade}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={grades.length + 2} className="py-6 text-center text-gray-400">Tidak ada data.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <span className="font-medium text-gray-800">{r.label}</span>
                    {r.parent && <span className="block text-[10px] text-gray-400">{r.parent}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{r.hc}</td>
                  {grades.map((g, gi) => (
                    <td key={g.id} className="px-3 py-2 text-right text-gray-600">{r.calcs[gi] ?? 0}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[#1A284F]">
              <tr>
                <td className="px-3 py-2">Jumlah ({rows.length})</td>
                <td className="px-3 py-2 text-right">{total}</td>
                {colTotals.map((t, gi) => (
                  <td key={gi} className="px-3 py-2 text-right">{t}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function CalibrationSettingApproval() {
  const activeUser = getActiveUser();
  const [records, setRecords] = useState<Record<string, SoyApprovalRecord>>(() => loadSoyApprovals());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<"Approved" | "Revision" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const refresh = () => setRecords(loadSoyApprovals());
    window.addEventListener(SOY_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener(SOY_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const isHrAdmin = isAdminOrHrIcfRole(activeUser.role);
  const isDirector = isDirectorRoleOrGrouping(activeUser);
  const allowedUnits = useMemo(() => {
    const all = Object.values(records).map((r) => r.unitName);
    if (isHrAdmin) return all;
    if (activeUser.calibrationRoleByUnit && Object.keys(activeUser.calibrationRoleByUnit).length > 0) {
      return getCalibrationInvolvedUnits(activeUser, all);
    }
    const roleUnits = getRoleAllowedCompanyUnits(activeUser.role);
    if (roleUnits.length > 0) return Array.from(new Set([...roleUnits, ...(activeUser.managedUnits ?? [])]));
    if (isDirector) return getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits);
    return activeUser.company ? [activeUser.company] : [];
  }, [records, activeUser, isHrAdmin, isDirector]);

  const list = Object.values(records)
    .filter((r) => allowedUnits.includes(r.unitName))
    .sort((a, b) => (a.status === "Pending" ? -1 : 1) - (b.status === "Pending" ? -1 : 1) || b.submittedAt.localeCompare(a.submittedAt));
  const selected = list.find((r) => r.unitId === selectedId) ?? list[0] ?? null;

  const canApprove = (rec: SoyApprovalRecord) => {
    const unitRole = getCalibrationRoleForUnit(activeUser, rec.unitName);
    if (unitRole === "mengetahui") return false;
    if (unitRole === "approver") return true;
    return isDirector || hasRolePermission(activeUser.role || "Employee", "approvals_calibration_soy", "approve");
  };

  const submitDecision = () => {
    if (!selected || !action) return;
    if (action === "Revision" && !note.trim()) return;
    decideSoyApproval(selected.unitId, action, note);
    toast.success(action === "Approved" ? `Calibration Setting (SOY) ${selected.unitName} disetujui.` : `Revisi dikirim ke HR untuk ${selected.unitName}.`);
    setAction(null);
    setNote("");
  };

  const snap = selected?.snapshot;
  const snapAlloc = useMemo(
    () =>
      snap
        ? computeUnitQuotaAllocation({
            calibrationGrades: snap.calibrationGrades,
            divisionProportions: snap.divisionProportions,
            departemenenProportions: snap.departemenenProportions,
            bagianProportions: snap.bagianProportions,
          })
        : null,
    [snap],
  );
  const totalHC = snapAlloc?.totalHC ?? 0;
  const divName = (id: string) => snap?.divisionProportions.find((d) => d.id === id)?.divisi ?? "";
  const deptName = (id: string) => snap?.departemenenProportions.find((d) => d.id === id)?.departemen ?? "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A284F]/8 text-[#1A284F]"><Settings className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-800">Calibration Approval — Setting (SOY)</h1>
          <p className="mt-0.5 text-xs text-gray-400">Distribusi & Proporsi Grade berdasarkan HC Awal Tahun dari Calibration Setting.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-400">
          Belum ada Calibration Setting (SOY) yang disubmit untuk unit dalam kewenangan Anda.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2">
            {list.map((r) => (
              <button
                key={r.unitId}
                onClick={() => setSelectedId(r.unitId)}
                className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition-all ${
                  selected?.unitId === r.unitId ? "border-[#1A284F] ring-1 ring-[#1A284F]/20" : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#1A284F]" />
                  <span className="flex-1 truncate text-sm font-semibold text-gray-800">{r.unitName}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  <span className="text-[10px] text-gray-400">{fmt(r.submittedAt)}</span>
                </div>
              </button>
            ))}
          </div>

          {selected && snap && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                <div>
                  <p className="text-base font-bold text-[#1A284F]">{selected.unitName}</p>
                  <p className="text-xs text-gray-400">Disubmit oleh {selected.submittedBy} · {fmt(selected.submittedAt)} · HC Awal Tahun: {totalHC}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_TONE[selected.status]}`}>{selected.status}</span>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="bg-[#1A284F] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white">Distribusi & Proporsi Grade</div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-2 text-left">Grade</th><th className="px-4 py-2 text-right">Proporsi</th><th className="px-4 py-2 text-right">Kuota (HC {totalHC})</th></tr>
                  </thead>
                  <tbody>
                    {snap.calibrationGrades.map((g, gi) => (
                      <tr key={g.id} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-semibold">{g.grade}</td>
                        <td className="px-4 py-2 text-right">{g.proporsi}</td>
                        <td className="px-4 py-2 text-right">{snapAlloc?.unitGradeTargets[gi] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[#1A284F]">
                    <tr>
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right">{snap.calibrationGrades.reduce((s, g) => s + pct(g.proporsi), 0)}%</td>
                      <td className="px-4 py-2 text-right">{(snapAlloc?.unitGradeTargets ?? []).reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <ProportionTable
                title="Proporsi per Divisi"
                grades={snap.calibrationGrades}
                rows={snap.divisionProportions.map((d) => ({
                  id: d.id,
                  label: d.divisi,
                  hc: d.hc,
                  calcs: snapAlloc?.divMatrix[d.id] ?? [],
                }))}
              />
              <ProportionTable
                title="Proporsi per Departemen"
                grades={snap.calibrationGrades}
                rows={snap.departemenenProportions.map((d) => ({
                  id: d.id,
                  label: d.departemen,
                  parent: divName(d.divisiId),
                  hc: d.hc,
                  calcs: snapAlloc?.deptMatrix[d.id] ?? [],
                }))}
              />
              <ProportionTable
                title="Proporsi per Bagian"
                grades={snap.calibrationGrades}
                rows={snap.bagianProportions.map((b) => ({
                  id: b.id,
                  label: b.bagian,
                  parent: deptName(b.departemenenId),
                  hc: b.hc,
                  calcs: snapAlloc?.bagianMatrix[b.id] ?? [],
                }))}
              />

              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Riwayat</p>
                <ul className="space-y-1.5 text-xs">
                  {[...selected.history].reverse().map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-700">{h.status}</span>
                      <span className="text-gray-500">{h.by}</span>
                      <span className="text-gray-400">{fmt(h.at)}</span>
                      {h.note && <span className="w-full text-gray-600">“{h.note}”</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {selected.status === "Pending" && (
                canApprove(selected) ? (
                  <div className="sticky bottom-0 flex justify-end gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                    <button onClick={() => { setAction("Revision"); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl border-2 border-orange-400 px-5 py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50">
                      <RotateCcw className="h-4 w-4" /> Request Revision
                    </button>
                    <button onClick={() => { setAction("Approved"); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl bg-[#1A284F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#131d3b]">
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-500">
                    <Clock className="h-4 w-4" /> Anda memiliki akses lihat (mengetahui) untuk unit ini.
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {action && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAction(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">{action === "Approved" ? "Approve" : "Request Revision"} — {selected.unitName}</h3>
              <button onClick={() => setAction(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Catatan {action === "Revision" && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === "Revision" ? "Jelaskan bagian yang perlu direvisi…" : "Catatan (opsional)"}
              className="mb-5 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1A284F]/40"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAction(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={submitDecision}
                disabled={action === "Revision" && !note.trim()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${action === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-500 hover:bg-orange-600"}`}
              >
                {action === "Approved" ? "Approve" : "Kirim Revisi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalibrationSettingApproval;
