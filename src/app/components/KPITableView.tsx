import React from "react";
import { Lock } from "lucide-react";
import {
  computeKPIAchievement,
  computePolaritasAchievementPct,
  computeTotal2026,
  doesKpiSubRowRequireRca,
  findMatchingRcaForSubItem,
  parseBobotDecimal,
  type KPIItem,
} from "../pages/employee/KPIPage";
import type { MonthEntry } from "../pages/employee/KPIPage";
import type { StoredRCASubmission } from "../pages/shared/rcaStore";
import type { EditedKpiCellDiff } from "../pages/shared/appraisalWorkflowStore";
import { computeKpiColorBandAchievementPct, isMonthBlockedForKpi, parseKpiRatioParts, parseStabilizeRange } from "../utils/kpiNumberAndPeriod";
import { isStoredRcaSubmissionClosed } from "./UnifiedRCADetailTable";
import { DualScrollTableContainer } from "./DualScrollTableContainer";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface KPITableViewProps {
  kpiItems: KPIItem[];
  months: MonthEntry[];
  cells: Record<string, Record<string, string>>;
  rcaSubmissions?: StoredRCASubmission[];
  onPreviewRCA?: (sub: StoredRCASubmission) => void;
  onClickUnmatchedRCA?: () => void;
  editedCellsDiff?: Record<string, EditedKpiCellDiff>;
}

// Helper to get percentage color
function getPctColor(val: string): string {
  if (!val || val === "—") return "text-gray-300 font-normal";
  const clean = val.replace(/,/g, "").replace(/%$/, "").trim();
  const n = parseFloat(clean);
  if (isNaN(n)) return "text-gray-700";
  if (n >= 100) return "text-green-700";
  return "text-rose-600";
}

function parseNum(s: string): number | null {
  if (!s || s === "—") return null;
  const clean = s.replace(/,/g, "").replace(/%$/, "").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

const PERSP_TEXT_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

export function KPITableView({
  kpiItems,
  months,
  cells,
  rcaSubmissions = [],
  onPreviewRCA,
  onClickUnmatchedRCA,
  editedCellsDiff,
}: KPITableViewProps) {
  const monthLabelById = new Map(months.map((m) => [m.id, m.label] as const));

  const resolveFallbackTarget = (kpi: KPIItem, monthId: string): string => {
    const mLabel = monthLabelById.get(monthId) ?? "";
    return kpi.monthlyTargets?.[mLabel] || kpi.target2026 || "";
  };

  // Compute cell value for a given sub-row
  const getCellValue = (kpi: KPIItem, monthId: string, subIdx: number): string => {
    const cellKey = `${kpi.no}__${subIdx}`;
    const sub = kpi.subRows[subIdx];
    if (!sub) return "—";
    const rawVal = cells[monthId]?.[cellKey] ?? "";
    const isTargetSub = !sub.compute && sub.label.toLowerCase().startsWith("target");
    
    if (!sub.compute) {
      if (isTargetSub && !rawVal) {
        return resolveFallbackTarget(kpi, monthId) || "—";
      }
      return rawVal || "—";
    }
    
    // Compute based on spec
    const spec = sub.compute;

    if (spec.type === "color_band") {
      const actBand = (cells[monthId]?.[`${kpi.no}__${spec.actualIdx}`] ?? "").trim();
      const tgtBand = (cells[monthId]?.[`${kpi.no}__${spec.targetIdx}`] || resolveFallbackTarget(kpi, monthId)).trim();
      if (!actBand) return "—";
      const pct = computeKpiColorBandAchievementPct(actBand, tgtBand);
      return pct !== null ? `${pct.toFixed(1)}%` : "—";
    }
    
    if (spec.type === "ratio") {
      const actualKey = `${kpi.no}__${spec.actualIdx}`;
      const targetKey = `${kpi.no}__${spec.targetIdx}`;
      const rawTarget = (cells[monthId]?.[targetKey] || resolveFallbackTarget(kpi, monthId)).trim();
      const target = parseNum(rawTarget);
      const isRangeStabilize = kpi.polaritas === "Stabilize" && parseStabilizeRange(rawTarget) !== null;
      if (target === null && !isRangeStabilize) return "—";
      const actual = parseNum(cells[monthId]?.[actualKey] ?? "");
      if (actual === null) return "0%";
      const pct = computePolaritasAchievementPct(actual, rawTarget, target ?? 0, kpi.polaritas, spec.minimize);
      return pct.toFixed(1) + "%";
    }
    
    if (spec.type === "ref") {
      const sourceKey = `${kpi.no}__${spec.sourceIdx}`;
      return cells[monthId]?.[sourceKey] ?? "—";
    }
    
    if (spec.type === "avg") {
      const vals = spec.sourceIdxs
        .map((i) => parseNum(getCellValue(kpi, monthId, i)))
        .filter((v): v is number => v !== null);
      if (!vals.length) return "—";
      return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) + "%";
    }

    if (spec.type === "ratio_score") {
      const negRaw = cells[monthId]?.[`${kpi.no}__${spec.negIdx}`] ?? "";
      if (!negRaw) return "—";
      const neg = parseNum(negRaw) ?? 0;
      const pos = parseNum(cells[monthId]?.[`${kpi.no}__${spec.posIdx}`] ?? "") ?? 0;
      if (neg === 0) return "100%";
      const tgtIdx = kpi.subRows.findIndex((s) => !s.compute && s.label.toLowerCase().startsWith("target"));
      const rawTgtRatio = (tgtIdx >= 0 ? cells[monthId]?.[`${kpi.no}__${tgtIdx}`] : "") || resolveFallbackTarget(kpi, monthId);
      const parsedRatio = parseKpiRatioParts(rawTgtRatio);
      const mult = parsedRatio ? parsedRatio.multiplier : spec.multiplier;
      return pos + 1e-9 >= neg * mult ? "100%" : "0%";
    }
    
    return "—";
  };

  const isRcaClosed = (sub: StoredRCASubmission): boolean => isStoredRcaSubmissionClosed(sub);

  const totalNilai = kpiItems.reduce((sum, k) => {
    const ach = computeKPIAchievement(k, cells, months);
    if (ach === null) return sum;
    return sum + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
  }, 0);
  const computeSectionScore = (sec: string): number =>
    kpiItems
      .filter((k) => (k.section || "A") === sec)
      .reduce((sum, k) => {
        const ach = computeKPIAchievement(k, cells, months);
        if (ach === null) return sum;
        return sum + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
      }, 0);
  const colSpanBeforeTotal = 14 + (months.length > 0 ? months.length : 1);
  const W_NO = 50;
  const W_PERSP = 120;
  const W_KPI = 220;
  const dynamicSections = Array.from(new Set(kpiItems.map((k) => k.section || "A"))).sort();
  const secPalette = ["#1565C0", "#1976D2", "#00838F", "#6A1B9A", "#2E7D32", "#EF6C00"];

  return (
    <DualScrollTableContainer className="rounded-xl border border-gray-200 shadow-sm bg-white">
      <table className="border-collapse text-xs w-full">
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ position: "sticky", left: 0, zIndex: 25, background: "#1A284F", minWidth: W_NO, maxWidth: W_NO }}>No</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO, zIndex: 25, background: "#1A284F", minWidth: W_PERSP, maxWidth: W_PERSP }}>Perspektif</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 25, background: "#1A284F", minWidth: W_KPI, maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.28)" }}>KPI</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 110 }}>Satuan</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 90 }}>Formula</th>
            <th className="border border-[#1A284F]/30 py-3 px-2 font-semibold text-center" style={{ minWidth: 64 }}>Bobot</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 220 }}>Definisi</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 155 }}>Source</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Baseline</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Target</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 88 }}>Polaritas</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 230 }}>Detail Formula</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 160 }}>Keterangan</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 100 }}>Sub-row</th>
            {months.length > 0 ? (
              months.map((m) => (
                <th key={m.id} className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 120 }}>
                  {m.label}
                </th>
              ))
            ) : (
              <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-medium italic text-white/60" style={{ minWidth: 140 }}>
                Belum ada bulan
              </th>
            )}
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0F3460]" style={{ minWidth: 120 }}>Total</th>
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0a2a4a]" style={{ minWidth: 110 }}>Achievement</th>
          </tr>
        </thead>
        <tbody>
          {dynamicSections.map((sec, sIdx) => {
            const secKpis = kpiItems.filter((k) => (k.section || "A") === sec);
            const first = secKpis[0];
            const defTitle = sec === "A" ? "Objective KPI — Bobot 20%" : sec === "B" ? "Functional KPI — Bobot 80%" : `Section ${sec}`;
            const hdrLabel = first?.sectionLabel
              ? `${sec}. ${first.sectionLabel}${first.sectionBobot ? ` — Bobot ${first.sectionBobot}` : ""}`
              : `${sec}. ${defTitle}`;
            const bg = secPalette[sIdx % secPalette.length];
            const secScore = computeSectionScore(sec);
            const hasSecScore = secKpis.some((k) => computeKPIAchievement(k, cells, months) !== null);
            return (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={colSpanBeforeTotal + 1} className="p-0 text-white text-xs font-bold uppercase tracking-widest border" style={{ background: bg, borderColor: bg }}>
                    <div className="py-2 px-4 inline-flex items-center whitespace-nowrap" style={{ position: "sticky", left: 0, zIndex: 15, background: bg }}>
                      {hdrLabel}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center border text-white text-xs font-bold whitespace-nowrap" style={{ background: bg, borderColor: bg }}>
                    {hasSecScore ? `${secScore.toFixed(2)}%` : "—"}
                  </td>
                </tr>
                {secKpis.map((kpi, kpiIdx) => {
            const rs = kpi.subRows.length;
            const ach = computeKPIAchievement(kpi, cells, months);
            const cappedAch = ach !== null ? Math.min(ach, 100) : null;
            const weightedScore = cappedAch !== null ? (cappedAch / 100) * parseBobotDecimal(kpi.bobot) * 100 : null;
            const stickyBg = kpiIdx % 2 === 0 ? "#ffffff" : "#f9fafb";
            
            return kpi.subRows.map((sub, subIdx) => {
              const isFirst = subIdx === 0;
              const isComputed = !!sub.compute;
              // Tag RCA hanya muncul pada item KPI spesifik (bukan baris rata-rata total "% Pencapaian Total")
              const isItemComputed = Boolean(sub.compute && sub.compute.type !== "avg");
              const isTargetRow = !sub.compute && sub.label.toLowerCase().startsWith("target");
              
              const totalVal = computeTotal2026(kpi, subIdx, cells, months);
              const totalColorCls = isComputed || sub.bold ? getPctColor(totalVal) : (totalVal === "—" ? "text-gray-300" : "text-blue-800");
              
              return (
                <tr key={`${kpi.no}-${subIdx}`} className={kpiIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {isFirst && (
                    <>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700"
                        style={{ position: "sticky", left: 0, zIndex: 12, background: stickyBg, minWidth: W_NO, maxWidth: W_NO }}>
                        {kpi.no}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700"
                        style={{ position: "sticky", left: W_NO, zIndex: 12, background: stickyBg, minWidth: W_PERSP, maxWidth: W_PERSP }}>
                        <span className={`font-bold ${PERSP_TEXT_COLOR[kpi.perspektif] ?? "text-gray-700"}`}>{kpi.perspektif}</span>
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700"
                        style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 12, background: stickyBg, minWidth: W_KPI, maxWidth: W_KPI, boxShadow: "2px 0 5px -2px rgba(15,23,42,0.12)" }}>
                        <p className="font-medium text-gray-800 whitespace-pre-line leading-relaxed">{kpi.kpi}</p>
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.satuan}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.formula}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center">
                        <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">
                        {kpi.definisi}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">
                        {kpi.source}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-center text-gray-700">
                        {kpi.baseline2025}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-center font-bold text-[#1A284F]">
                        {kpi.target2026}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-center text-gray-700">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${kpi.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : kpi.polaritas === "Minimize" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {kpi.polaritas}
                        </span>
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">
                        {kpi.detailFormula}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700 text-xs">
                        {kpi.keterangan}
                      </td>
                    </>
                  )}
                  
                  {/* Sub-row label */}
                  <td className={`border border-gray-200 py-1 px-3 text-left ${
                    isComputed ? "bg-emerald-50/80" : isTargetRow ? "bg-sky-50/70" : sub.bold ? "bg-green-50/60" : "bg-green-50"
                  }`}>
                    <div className="flex items-center gap-1">
                      <span className={sub.bold ? "font-bold text-gray-800" : "text-gray-700"}>
                        {sub.label}
                      </span>
                      {isComputed && <span className="text-[9px] text-emerald-600 font-normal">(auto)</span>}
                    </div>
                  </td>
                  
                  {/* Monthly cells */}
                  {months.length > 0 ? (
                    months.map((m) => {
                      if (isMonthBlockedForKpi(kpi, m.label)) {
                        const monthFullMap: Record<string, string> = {
                          Jan: "Januari", Feb: "Februari", Mar: "Maret", Apr: "April",
                          May: "Mei", Jun: "Juni", Jul: "Juli", Aug: "Agustus",
                          Sep: "September", Oct: "Oktober", Nov: "November", Dec: "Desember",
                        };
                        const mShort = m.label.replace(/-\d{2}$/, "");
                        const mFull = monthFullMap[mShort] ?? mShort;
                        return (
                          <td
                            key={m.id}
                            className="border border-slate-200 bg-slate-100/85 text-center py-1.5 px-1.5 select-none"
                            title={`KPI ini di bulan ${mFull} Anda inactive kan pada saat membuat KPI Setting.`}
                          >
                            {isComputed ? (
                              <span className="text-slate-400 text-[11px] font-medium">—</span>
                            ) : isTargetRow ? (
                              <div className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/75 text-slate-500 text-[10px] font-semibold">
                                <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                <span>0 · Inactive</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded bg-rose-50/80 border border-rose-200/80 text-rose-600/80 text-[10px] font-semibold">
                                <Lock className="w-2.5 h-2.5 shrink-0" />
                                <span>0 · Inactive</span>
                              </div>
                            )}
                          </td>
                        );
                      }
                      const val = getCellValue(kpi, m.id, subIdx);
                      const diffEntry = !isComputed && !isTargetRow
                        ? editedCellsDiff?.[`${m.id}::${kpi.no}__${subIdx}`]
                        : undefined;
                      const cellColorCls = isComputed ? getPctColor(val) : "";
                      const getRawForMonth = (idx: number) => {
                        const raw = cells[m.id]?.[`${kpi.no}__${idx}`] ?? "";
                        const sr = kpi.subRows[idx];
                        if (sr && !sr.compute && sr.label.toLowerCase().startsWith("target") && !raw) {
                          return resolveFallbackTarget(kpi, m.id);
                        }
                        return raw;
                      };
                      const needsRca = isItemComputed && doesKpiSubRowRequireRca(kpi, subIdx, getRawForMonth, val);
                      const matchedRCA =
                        needsRca
                          ? findMatchingRcaForSubItem(rcaSubmissions, kpi, subIdx, m)
                          : isItemComputed
                          ? findMatchingRcaForSubItem(rcaSubmissions, kpi, subIdx, m)
                          : undefined;
                      const showRcaTrigger =
                        isItemComputed && (needsRca || Boolean(matchedRCA));

                      return (
                        <td key={m.id} className={`border border-gray-200 text-center py-1.5 px-1.5 ${
                          diffEntry
                            ? "bg-amber-100/90 ring-2 ring-inset ring-amber-400"
                            : isComputed
                            ? "bg-emerald-50/80"
                            : isTargetRow
                            ? "bg-sky-50/70"
                            : sub.bold
                            ? "bg-green-50/60"
                            : "bg-green-50"
                        }`}>
                          {isComputed ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`font-bold ${cellColorCls}`}>{val}</span>
                              {showRcaTrigger && (
                                matchedRCA ? (
                                  <button
                                    type="button"
                                    onClick={() => onPreviewRCA?.(matchedRCA)}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border transition-colors ${
                                      isRcaClosed(matchedRCA)
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                                        : "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                                    }`}
                                    title="Klik untuk melihat detail RCA"
                                  >
                                    <span>RCA · {isRcaClosed(matchedRCA) ? "Closed" : "Open"}</span>
                                  </button>
                                ) : onClickUnmatchedRCA ? (
                                  <button
                                    type="button"
                                    onClick={onClickUnmatchedRCA}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200 transition-colors cursor-pointer"
                                    title="Klik untuk membuka halaman RCA"
                                  >
                                    RCA
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                    RCA
                                  </span>
                                )
                              )}
                            </div>
                          ) : isTargetRow ? (
                            <span className="font-semibold text-sky-700">{val}</span>
                          ) : diffEntry ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex flex-col items-center gap-0.5 cursor-help px-1">
                                  <span className="font-extrabold text-[#1A284F] underline decoration-amber-500 decoration-2 underline-offset-2">
                                    {val}
                                  </span>
                                  <span className="px-1.5 py-0 rounded-full bg-amber-300/80 text-amber-950 text-[8px] font-extrabold uppercase tracking-wider leading-tight">
                                    Edited
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-[#1A284F] text-white px-3 py-2 rounded-xl shadow-xl z-[80] text-[11px] space-y-0.5">
                                <p className="font-bold text-amber-300">Perubahan Edit KPI Tracking</p>
                                <p>Nilai sebelum di-edit: <strong className="text-rose-200">{diffEntry.before || "—"}</strong></p>
                                <p>Nilai sesudah di-edit: <strong className="text-emerald-300">{val}</strong></p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className={sub.bold ? "font-bold text-gray-800" : "text-gray-700"}>{val}</span>
                          )}
                        </td>
                      );
                    })
                  ) : (
                    <td className="border border-gray-200 text-center py-1.5 px-2 text-gray-300 italic">
                      —
                    </td>
                  )}
                  
                  {/* Total 2026 cell */}
                  <td className={`border border-gray-200 text-center py-1 px-2 ${
                    isComputed ? "bg-blue-50/80" : sub.bold ? "bg-blue-50/40" : "bg-blue-50/20"
                  }`}>
                    <span className={`${sub.bold ? "font-bold" : ""} ${totalColorCls}`}>
                      {totalVal}
                    </span>
                  </td>

                  {isFirst && (
                    <td rowSpan={rs} className="border border-gray-200 text-center py-2 px-2 bg-[#0a2a4a]/5 align-middle">
                      {ach !== null ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`font-bold ${ach >= 100 ? "text-green-700" : "text-rose-600"}`}>
                            {ach.toFixed(1)}%
                          </span>
                          <span className="text-[9px] text-gray-400">Score Bobot</span>
                          <span className="font-bold text-[#1A284F]">
                            {weightedScore !== null ? `${weightedScore.toFixed(2)}%` : "—"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            });
                })}
              </React.Fragment>
            );
          })}
          <tr className="bg-[#1A284F]/5 font-bold">
            <td colSpan={colSpanBeforeTotal + 1} className="border border-gray-200 py-2.5 px-4 text-right text-xs text-[#1A284F]">
              Total Nilai KPI (YTD)
            </td>
            <td className="border border-gray-200 py-2.5 px-2 text-center text-sm font-black text-[#1A284F]">
              {months.length > 0 ? `${totalNilai.toFixed(2)}%` : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </DualScrollTableContainer>
  );
}
