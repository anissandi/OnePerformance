import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Clock, Eye, RotateCcw, Settings, ShieldAlert, Target, X } from "lucide-react";
import { toast } from "sonner";
import {
  decideSoyApproval,
  formatActorWithPosition,
  loadSoyApprovals,
  SOY_EVENT,
  type SoyApprovalRecord,
  type SoyStatus,
} from "../../store/calibrationSoyStore";
import { computeUnitQuotaAllocation } from "../hr/CalibrationSetting";
import {
  canRoleAccessCalibrationApproval,
  getActiveUser,
  getCalibrationInvolvedUnits,
  getCalibrationRoleForUnit,
  getGroupCompaniesForUnit,
  getRoleAllowedCompanyUnits,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
} from "../../store/authStore";
import { hasRolePermission } from "../hr/settings/AccessManagement";
import { BellCurveTagButton, GradeBellCurveModal } from "../../components/GradeBellCurveModal";
import { AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";

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

const GRADE_TONE: Record<string, string> = {
  "A+": "#7C3AED",
  A: "#2563EB",
  B: "#059669",
  C: "#D97706",
  D: "#EA580C",
  E: "#DC2626",
};
const gradeTone = (g: string) => GRADE_TONE[g] ?? "#1A284F";

const UNIT_PILL_PALETTES = [
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-800 border-amber-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

const SECTION_HEAD_TONE: Record<string, string> = {
  division: "from-indigo-50 via-white to-sky-50 text-indigo-800",
  department: "from-emerald-50 via-white to-teal-50 text-emerald-800",
  bagian: "from-amber-50 via-white to-orange-50 text-amber-800",
};

function GradeHead({ grade }: { grade: string }) {
  return (
    <span
      className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-md px-1.5 text-[11px] font-black text-white shadow-sm"
      style={{ background: gradeTone(grade) }}
    >
      {grade}
    </span>
  );
}

function ProportionTable({ title, rows, grades, tone = "division" }: {
  title: string;
  rows: Array<{ id: string; label: string; parent?: string; hc: number; calcs: number[] }>;
  grades: SoyApprovalRecord["snapshot"]["calibrationGrades"];
  tone?: "division" | "department" | "bagian";
}) {
  const total = rows.reduce((s, r) => s + r.hc, 0);
  const colTotals = grades.map((_, gi) => rows.reduce((s, r) => s + (r.calcs[gi] ?? 0), 0));
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between bg-gradient-to-r px-5 py-3 ${SECTION_HEAD_TONE[tone]}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A284F] shadow-sm">
          {rows.length} baris · Total HC {total}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/80 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">Organisasi</th>
              <th className="px-4 py-2.5 text-right">HC</th>
              {grades.map((g) => (
                <th key={g.id} className="px-3 py-2.5 text-center"><GradeHead grade={g.grade} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={grades.length + 2} className="py-6 text-center text-gray-400">Tidak ada data.</td></tr>
            ) : (
              rows.map((r, ri) => (
                <tr key={r.id} className={`border-t border-gray-100 transition-colors hover:bg-indigo-50/30 ${ri % 2 === 1 ? "bg-gray-50/40" : ""}`}>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-gray-800">{r.label}</span>
                    {r.parent && <span className="block text-[10px] text-gray-400">{r.parent}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex min-w-[34px] justify-center rounded-md bg-[#1A284F]/[0.06] px-2 py-0.5 font-bold tabular-nums text-[#1A284F]">{r.hc}</span>
                  </td>
                  {grades.map((g, gi) => {
                    const v = r.calcs[gi] ?? 0;
                    return (
                      <td key={g.id} className="px-3 py-2.5 text-center tabular-nums">
                        {v > 0 ? (
                          <span className="font-bold" style={{ color: gradeTone(g.grade) }}>{v}</span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-[#1A284F]/[0.03] font-semibold text-[#1A284F]">
              <tr>
                <td className="px-4 py-2.5">Jumlah ({rows.length})</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{total}</td>
                {colTotals.map((t, gi) => (
                  <td key={gi} className="px-3 py-2.5 text-center tabular-nums" style={{ color: gradeTone(grades[gi]?.grade ?? "") }}>{t}</td>
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
  const [bellOpen, setBellOpen] = useState(false);

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
    if (unitRole === "mengetahui" || unitRole === "readonly") return false;
    if (unitRole === "approver") return true;
    if (isAdminOrHrIcfRole(activeUser.role)) return false;
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

  const unitPalette = (unitId: string) => {
    const idx = Math.max(0, list.findIndex((r) => r.unitId === unitId));
    return UNIT_PILL_PALETTES[idx % UNIT_PILL_PALETTES.length];
  };
  const unitTotalTargets = (snapAlloc?.unitGradeTargets ?? []).reduce((a, b) => a + b, 0);
  const gradeCardTones: AnalyticsCardTone[] = ["plum", "navy", "emerald", "terracotta", "rose", "slate"];

  if (!canRoleAccessCalibrationApproval(activeUser.role)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
        <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-600" />
        <p className="text-sm font-bold text-amber-900">Akses Halaman Terbatas</p>
        <p className="mt-1 text-xs text-amber-800">
          Halaman Calibration Approval — Setting (SOY) hanya dapat diakses oleh role Director, DirectorNonOpr, BOD, Administrator, dan HR ICF.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
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
        <div className="flex w-full flex-col gap-4">
          {/* Unit usaha (pill kecil berwarna lembut) + Grade Distribution (Bell Curve) di samping nama unit usaha */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
            {list.map((r) => {
              const active = selected?.unitId === r.unitId;
              return (
                <React.Fragment key={r.unitId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.unitId)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${unitPalette(r.unitId)} ${
                      active ? "ring-2 ring-[#1A284F]/30 shadow-sm" : "opacity-75 hover:opacity-100"
                    }`}
                  >
                    <Building2 className="h-3 w-3" />
                    {r.unitName}
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${r.status === "Approved" ? "bg-emerald-500" : r.status === "Revision" ? "bg-orange-500" : "bg-amber-400"}`}
                      title={r.status}
                    />
                  </button>
                  {active && (
                    <BellCurveTagButton onClick={() => setBellOpen(true)} label="Grade Distribution (Bell Curve)" />
                  )}
                </React.Fragment>
              );
            })}
            {selected && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                  <Clock className="h-3 w-3" /> Disubmit oleh <strong className="font-semibold text-slate-800">{formatActorWithPosition(selected.submittedBy)}</strong> · {fmt(selected.submittedAt)}
                </span>
                <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                  HC Awal Tahun: {totalHC}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[selected.status]}`}>{selected.status}</span>
              </div>
            )}
          </div>

          {selected && snap && (
            <div className="flex w-full flex-col gap-4">
              {/* Ringkasan kartu grade format Analytics Dashboard */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {snap.calibrationGrades.map((g, gi) => {
                  const kuota = snapAlloc?.unitGradeTargets[gi] ?? 0;
                  return (
                    <AnalyticsStatCard
                      key={g.id}
                      index={gi}
                      compact
                      tone={gradeCardTones[gi % gradeCardTones.length]}
                      title={`Grade ${g.grade} (${g.proporsi})`}
                      value={kuota}
                      subtitle="Kuota karyawan (SOY)"
                      icon={<span className="text-xs font-black">{g.grade}</span>}
                    />
                  );
                })}
              </div>

              <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between bg-gradient-to-r from-[#1A284F] to-[#2B3F73] px-5 py-3 text-white">
                  <span className="text-xs font-bold uppercase tracking-wide">Distribusi & Proporsi Grade</span>
                  <span className="text-[11px] text-white/70">Total HC {totalHC}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50/80 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-2.5 text-left">Grade</th>
                      <th className="px-5 py-2.5 text-right">Proporsi</th>
                      <th className="px-5 py-2.5 text-right">Kuota (HC {totalHC})</th>
                      <th className="px-5 py-2.5 text-left">Distribusi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.calibrationGrades.map((g, gi) => {
                      const kuota = snapAlloc?.unitGradeTargets[gi] ?? 0;
                      const share = unitTotalTargets > 0 ? (kuota / unitTotalTargets) * 100 : pct(g.proporsi);
                      const c = gradeTone(g.grade);
                      return (
                        <tr key={g.id} className="border-t border-gray-100 hover:bg-indigo-50/30">
                          <td className="px-5 py-2.5"><GradeHead grade={g.grade} /></td>
                          <td className="px-5 py-2.5 text-right font-semibold text-gray-600">{g.proporsi}</td>
                          <td className="px-5 py-2.5 text-right text-sm font-black tabular-nums" style={{ color: c }}>{kuota}</td>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: c }} />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-500">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-[#1A284F]/[0.03] font-semibold text-[#1A284F]">
                    <tr>
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-5 py-2.5 text-right">{snap.calibrationGrades.reduce((s, g) => s + pct(g.proporsi), 0)}%</td>
                      <td className="px-5 py-2.5 text-right">{unitTotalTargets}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <ProportionTable
                title="Proporsi per Divisi"
                tone="division"
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
                tone="department"
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
                tone="bagian"
                grades={snap.calibrationGrades}
                rows={snap.bagianProportions.map((b) => ({
                  id: b.id,
                  label: b.bagian,
                  parent: deptName(b.departemenenId),
                  hc: b.hc,
                  calcs: snapAlloc?.bagianMatrix[b.id] ?? [],
                }))}
              />

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Riwayat</p>
                <ul className="space-y-1.5 text-xs">
                  {[...selected.history].reverse().map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-700">{h.status}</span>
                      <span className="text-gray-600 font-medium">{formatActorWithPosition(h.by)}</span>
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
                    <Eye className="h-4 w-4" />
                    {getCalibrationRoleForUnit(activeUser, selected.unitName) === "readonly"
                      ? "Anda memiliki akses Read Only untuk unit ini."
                      : "Anda memiliki akses lihat (Mengetahui) untuk unit ini."}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {bellOpen && selected && snap && (
        <GradeBellCurveModal
          mode="single"
          title={`Grade Distribution (Bell Curve) — ${selected.unitName}`}
          subtitle={`Proporsi & kuota grade HC Awal Tahun (SOY) · Total HC ${totalHC}`}
          rows={snap.calibrationGrades.map((g, gi) => ({
            grade: g.grade,
            color: gradeTone(g.grade),
            target: pct(g.proporsi),
            targetCount: snapAlloc?.unitGradeTargets[gi] ?? 0,
          }))}
          onClose={() => setBellOpen(false)}
        />
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
