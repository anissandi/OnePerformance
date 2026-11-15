import React from "react";
import { CheckCircle2 } from "lucide-react";
import { loadSubmittedGoals } from "../pages/shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";
import { loadUnitScoreWeights, type ScoreWeightColumn } from "../pages/shared/scoringWeightStore";
import { loadManagedUsers, resolveEffectiveUserGrouping } from "../store/authStore";

function pctTone(v: number | null): string {
  if (v == null) return "text-gray-300";
  if (v >= 90) return "text-emerald-600";
  if (v >= 75) return "text-blue-600";
  if (v >= 60) return "text-amber-600";
  return "text-rose-600";
}

function avgOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
}

function resolveSmartGoalsWeight(employeeId: string): number {
  const norm = normalizeEmployeeId(employeeId);
  const owner = loadManagedUsers().find((u) => normalizeEmployeeId(u.employeeId) === norm);
  const grp = owner ? resolveEffectiveUserGrouping(owner) : "";
  const col: ScoreWeightColumn =
    grp === "Ka./Wa.Ka.Div ke atas" || grp === "Direktur / Director"
      ? "kepalaDivisi"
      : grp === "Ka./Wa.Ka.Dept"
      ? "kepalaDepartement"
      : grp === "Ka./Wa.Ka.Bagian"
      ? "pengawasKepalaBagian"
      : grp === "Ka./Wa.Ka.Seksi"
      ? "kaWaKaSeksi"
      : "operasional";
  const raw = loadUnitScoreWeights(owner?.company || "PT RSUP (Industry)")["SMART Goals"]?.[col];
  const parsed = raw && raw !== "-" ? parseFloat(String(raw).replace("%", "").trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : 20;
}

/**
 * History Penilaian Approver SMART Goals: nilai per goal (AP1 & AP2), rata-rata masing-masing
 * approver, rata-rata gabungan AP1 & AP2, dan nilai konversi sesuai bobot.
 */
export function SmartGoalsScoreHistory({ employeeId }: { employeeId: string }) {
  const goals = loadSubmittedGoals(employeeId) ?? [];
  const norm = normalizeEmployeeId(employeeId);
  const rec = loadWorkflowRecords().find(
    (r) => r.module === "SMART Goals" && r.phase === "measurement" && normalizeEmployeeId(r.employeeId) === norm,
  );
  const ratingOf = (role: "approver1" | "approver2", goalId: number): number | null => {
    const v = rec?.assessments[role]?.ratings?.[`sg-${goalId}`];
    return typeof v === "number" ? v : null;
  };
  const rows = goals.map((g) => {
    const a1 = ratingOf("approver1", g.id);
    const a2 = ratingOf("approver2", g.id);
    return { id: g.id, label: g.label, a1, a2, avg: avgOf([a1, a2]) };
  });
  const a1Avg = avgOf(rows.map((r) => r.a1));
  const a2Avg = avgOf(rows.map((r) => r.a2));
  const combined = avgOf([a1Avg, a2Avg]);
  const weight = resolveSmartGoalsWeight(employeeId);
  const converted = combined != null ? Math.round(((combined * weight) / 100) * 100) / 100 : null;
  const a1Name = rec?.decisions.approver1?.approverName || "Approver 1";
  const a2Name = rec?.decisions.approver2?.approverName || "Approver 2";
  const fmt = (v: number | null) => (v == null ? "—" : `${v}%`);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <CheckCircle2 className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">History Penilaian Approver</span>
        <span className="text-[10px] text-white/50 font-medium">SMART Goals 2026</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Belum ada SMART Goals yang dinilai.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 620 }}>
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 text-left font-bold w-10">No</th>
                <th className="px-4 py-2.5 text-left font-bold">Goals</th>
                <th className="px-4 py-2.5 text-center font-bold border-l border-gray-200">
                  Approver 1<div className="normal-case font-medium text-gray-400 tracking-normal">{a1Name}</div>
                </th>
                <th className="px-4 py-2.5 text-center font-bold border-l border-gray-200">
                  Approver 2<div className="normal-case font-medium text-gray-400 tracking-normal">{a2Name}</div>
                </th>
                <th className="px-4 py-2.5 text-center font-bold border-l border-gray-200">Rata-Rata AP1 &amp; AP2</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-400 font-semibold">{i + 1}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-medium">{r.label}</td>
                  <td className={`px-4 py-2.5 text-center font-bold border-l border-gray-100 ${pctTone(r.a1)}`}>{fmt(r.a1)}</td>
                  <td className={`px-4 py-2.5 text-center font-bold border-l border-gray-100 ${pctTone(r.a2)}`}>{fmt(r.a2)}</td>
                  <td className={`px-4 py-2.5 text-center font-bold border-l border-gray-100 ${pctTone(r.avg)}`}>{fmt(r.avg)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-slate-50">
                <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold text-[#1A284F]">Rata-Rata per Approver</td>
                <td className={`px-4 py-3 text-center text-base font-black border-l border-gray-200 ${pctTone(a1Avg)}`}>{fmt(a1Avg)}</td>
                <td className={`px-4 py-3 text-center text-base font-black border-l border-gray-200 ${pctTone(a2Avg)}`}>{fmt(a2Avg)}</td>
                <td className={`px-4 py-3 text-center text-base font-black border-l border-gray-200 ${pctTone(combined)}`}>{fmt(combined)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#1A284F]/[0.03] border-t border-gray-100">
        <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Rata-Rata Gabungan AP1 &amp; AP2</p>
          <p className={`text-2xl font-black ${pctTone(combined)}`}>{fmt(combined)}</p>
        </div>
        <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Bobot SMART Goals</p>
          <p className="text-2xl font-black text-[#1A284F]">{weight}%</p>
        </div>
        <div className="rounded-xl bg-[#1A284F] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-200">Nilai Konversi (× Bobot)</p>
          <p className="text-2xl font-black text-white">{converted != null ? converted.toFixed(2) : "—"}</p>
        </div>
      </div>
    </div>
  );
}

export default SmartGoalsScoreHistory;
