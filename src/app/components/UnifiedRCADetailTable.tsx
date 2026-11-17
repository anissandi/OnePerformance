import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import type { StoredMasalahBlock, StoredRCAActionPlan, StoredRCASubmission } from "../pages/shared/rcaStore";
import { normalizeDateDDMMYYYY } from "../utils/dateFormat";

const MONTH_SORT_ORDER: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  may: 5, mei: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  aug: 8, agu: 8, agustus: 8,
  sep: 9, september: 9,
  oct: 10, okt: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, des: 12, desember: 12,
};

const FULL_MONTH_NAME_ID: Record<number, string> = {
  1: "Januari",
  2: "Februari",
  3: "Maret",
  4: "April",
  5: "Mei",
  6: "Juni",
  7: "Juli",
  8: "Agustus",
  9: "September",
  10: "Oktober",
  11: "November",
  12: "Desember",
};

// Palet warna soft profesional untuk pemisah antar-bulan dalam 1 tabel RCA gabungan
const SOFT_MONTH_SEPARATOR_PALETTE: Array<{
  bannerBg: string;
  bannerBorder: string;
  bannerText: string;
  pillBg: string;
  pillText: string;
  cellTint: string;
}> = [
  {
    bannerBg: "bg-sky-50/90",
    bannerBorder: "border-sky-200",
    bannerText: "text-sky-900",
    pillBg: "bg-sky-100",
    pillText: "text-sky-800",
    cellTint: "bg-sky-50/25",
  },
  {
    bannerBg: "bg-indigo-50/90",
    bannerBorder: "border-indigo-200",
    bannerText: "text-indigo-900",
    pillBg: "bg-indigo-100",
    pillText: "text-indigo-800",
    cellTint: "bg-indigo-50/25",
  },
  {
    bannerBg: "bg-violet-50/90",
    bannerBorder: "border-violet-200",
    bannerText: "text-violet-900",
    pillBg: "bg-violet-100",
    pillText: "text-violet-800",
    cellTint: "bg-violet-50/20",
  },
  {
    bannerBg: "bg-amber-50/90",
    bannerBorder: "border-amber-200",
    bannerText: "text-amber-900",
    pillBg: "bg-amber-100",
    pillText: "text-amber-800",
    cellTint: "bg-amber-50/20",
  },
  {
    bannerBg: "bg-teal-50/90",
    bannerBorder: "border-teal-200",
    bannerText: "text-teal-900",
    pillBg: "bg-teal-100",
    pillText: "text-teal-800",
    cellTint: "bg-teal-50/20",
  },
  {
    bannerBg: "bg-rose-50/80",
    bannerBorder: "border-rose-200",
    bannerText: "text-rose-900",
    pillBg: "bg-rose-100",
    pillText: "text-rose-800",
    cellTint: "bg-rose-50/20",
  },
];

const AP_STATUS_BADGE: Record<string, string> = {
  Selesai: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-800 border border-amber-200",
  "Belum dilaksanakan": "bg-red-100 text-red-700 border border-red-200",
  Ditunda: "bg-purple-100 text-purple-700 border border-purple-200",
  Dibatalkan: "bg-gray-100 text-gray-600 border border-gray-200",
};

export function isStoredRcaSubmissionClosed(sub: StoredRCASubmission): boolean {
  if (sub.approvalStatus === "Closed") return true;
  const aps: StoredRCAActionPlan[] = sub.masalahBlocks?.length
    ? sub.masalahBlocks.flatMap((b) => b.actionPlans)
    : sub.actionPlans ?? [];
  const active = aps.filter((ap) => ap.status !== "Dibatalkan");
  return active.length > 0 && active.every((ap) => ap.status === "Selesai");
}

function resolveMonthIndex(sub: StoredRCASubmission): number {
  const ml = String(sub.monthLabel ?? "").trim().toLowerCase().replace(/-\d{2,4}$/, "");
  if (MONTH_SORT_ORDER[ml]) return MONTH_SORT_ORDER[ml];
  const pr = String(sub.periode ?? "").trim().toLowerCase().replace(/-\d{2,4}$/, "");
  return MONTH_SORT_ORDER[pr] ?? 99;
}

function resolveMonthGroupTitle(sub: StoredRCASubmission): string {
  const mIdx = resolveMonthIndex(sub);
  const yr = sub.year || "2026";
  if (FULL_MONTH_NAME_ID[mIdx]) return `${FULL_MONTH_NAME_ID[mIdx]} ${yr}`;
  return sub.monthLabel || `${sub.periode || "Periode"} ${yr}`;
}

function parseEvidenceRef(raw: string): { name: string; url?: string } {
  const str = String(raw ?? "");
  const sep = str.indexOf("||");
  if (sep >= 0) {
    return { name: str.slice(0, sep) || "file", url: str.slice(sep + 2) || undefined };
  }
  return { name: str };
}

function normalizeBlocks(sub: StoredRCASubmission): StoredMasalahBlock[] {
  if (sub.masalahBlocks && sub.masalahBlocks.length > 0) {
    return sub.masalahBlocks;
  }
  return [
    {
      id: `${sub.id}_flat`,
      masalahUtama: (sub.masalahUtama ?? []).join(" / "),
      kenapaA: sub.kenapaA ?? "",
      kenapaB: sub.kenapaB ?? "",
      kenapaC: sub.kenapaC ?? "",
      actionPlans: sub.actionPlans ?? [],
    },
  ];
}

interface UnifiedRCADetailTableProps {
  submissions: StoredRCASubmission[];
  title?: string;
  subtitle?: string;
  highlightedKey?: string | null;
  onOpenRcaSubmenu?: () => void;
  containerId?: string;
}

export function UnifiedRCADetailTable({
  submissions,
  title = "Root Cause Analysis (RCA) — Detail",
  subtitle,
  highlightedKey,
  onOpenRcaSubmenu,
  containerId,
}: UnifiedRCADetailTableProps) {
  // Urutkan kronologis dari bulan paling awal ke bulan terbaru
  const sorted = React.useMemo(() => {
    return [...submissions].sort((a, b) => {
      const ma = resolveMonthIndex(a);
      const mb = resolveMonthIndex(b);
      if (ma !== mb) return ma - mb;
      return String(a.kpiIndicator ?? "").localeCompare(String(b.kpiIndicator ?? ""), "id");
    });
  }, [submissions]);

  // Kelompokkan per bulan untuk pemisah warna soft dalam 1 tabel gabungan
  const monthGroups = React.useMemo(() => {
    const groups: Array<{ monthKey: string; monthTitle: string; items: StoredRCASubmission[] }> = [];
    for (const sub of sorted) {
      const mIdx = resolveMonthIndex(sub);
      const monthKey = mIdx < 99 ? `m-${mIdx}-${sub.year || "2026"}` : `raw-${sub.monthLabel || sub.periode}`;
      const existing = groups.find((g) => g.monthKey === monthKey);
      if (existing) {
        existing.items.push(sub);
      } else {
        groups.push({
          monthKey,
          monthTitle: resolveMonthGroupTitle(sub),
          items: [sub],
        });
      }
    }
    return groups;
  }, [sorted]);

  if (sorted.length === 0) return null;

  const closedCount = sorted.filter(isStoredRcaSubmissionClosed).length;
  const openCount = sorted.length - closedCount;
  const headers: Array<[string, number]> = [
    ["No", 42],
    ["Periode", 78],
    ["KPI", 190],
    ["Satuan", 90],
    ["Baseline", 90],
    ["Target", 84],
    ["Actual", 84],
    ["Masalah Utama (A)", 185],
    ["Kenapa A? (B)", 155],
    ["Kenapa B? (C)", 155],
    ["Kenapa C? (D)", 155],
    ["Action Plan", 190],
    ["Target Penyelesaian", 120],
    ["PIC", 120],
    ["Status Perbaikan", 135],
    ["Keterangan", 165],
    ["Output", 165],
    ["Evidence", 165],
  ];
  const thCls = "border border-[#1A284F]/30 py-2.5 px-3 text-center font-semibold text-xs whitespace-nowrap";

  let runningNo = 0;

  return (
    <div id={containerId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#1A284F]" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-sm text-[#1A284F]">{title}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#1A284F]/10 text-[#1A284F]">
                {sorted.length} RCA ({monthGroups.length} bulan)
              </span>
              {closedCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> {closedCount} Closed
                </span>
              )}
              {openCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  {openCount} Open / In Progress
                </span>
              )}
            </div>
            {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {onOpenRcaSubmenu && (
          <button
            type="button"
            onClick={onOpenRcaSubmenu}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
          >
            <span>Buka Submenu RCA (Update Progress)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs w-full" style={{ minWidth: 1920 }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {headers.map(([h, w]) => (
                <th key={h} className={thCls} style={{ minWidth: w }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGroups.map((group, groupIdx) => {
              const palette = SOFT_MONTH_SEPARATOR_PALETTE[groupIdx % SOFT_MONTH_SEPARATOR_PALETTE.length];
              const groupClosed = group.items.filter(isStoredRcaSubmissionClosed).length;
              return (
                <React.Fragment key={group.monthKey}>
                  {/* Baris pemisah bulan dengan warna soft */}
                  <tr className={`${palette.bannerBg} border-y ${palette.bannerBorder}`}>
                    <td colSpan={headers.length} className={`px-4 py-2 font-bold text-xs ${palette.bannerText}`}>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${palette.pillBg} ${palette.pillText}`}>
                          Periode {group.monthTitle}
                        </span>
                        <span className="text-[11px] font-medium opacity-80">
                          {group.items.length} item RCA · {groupClosed} selesai (Close)
                        </span>
                      </div>
                    </td>
                  </tr>
                  {group.items.flatMap((sub) => {
                    runningNo += 1;
                    const currentNo = runningNo;
                    const subIsClosed = isStoredRcaSubmissionClosed(sub);
                    const isHighlighted = Boolean(
                      highlightedKey && (sub.key === highlightedKey || sub.id === highlightedKey),
                    );
                    const blocks = normalizeBlocks(sub);
                    const totalSubRows = blocks.reduce((acc, b) => acc + Math.max(1, b.actionPlans.length), 0);

                    return blocks.flatMap((block, bi) => {
                      const isInternal = block.masalahUtama.startsWith("[Faktor Internal]");
                      const isEksternal = block.masalahUtama.startsWith("[Faktor Eksternal]");
                      const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
                      const bodyText = factorLabel
                        ? block.masalahUtama.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "")
                        : block.masalahUtama;
                      const aps = block.actionPlans.length > 0 ? block.actionPlans : [null];
                      const blockRows = aps.length;
                      const blockAllClosed =
                        subIsClosed ||
                        (block.actionPlans.length > 0 &&
                          block.actionPlans.filter((a) => a.status !== "Dibatalkan").length > 0 &&
                          block.actionPlans.filter((a) => a.status !== "Dibatalkan").every((a) => a.status === "Selesai"));

                      return aps.map((ap, ai) => {
                        const apIsClosed = subIsClosed || ap?.status === "Selesai";
                        const baseCellBg = subIsClosed ? "bg-emerald-50/75" : palette.cellTint;
                        const blockCellBg = blockAllClosed ? "bg-emerald-50/75" : "bg-white";
                        const apCellBg = apIsClosed ? "bg-emerald-50/85" : "bg-white";
                        const highlightCls = isHighlighted ? "ring-2 ring-inset ring-amber-400" : "";
                        const tdCommon = "border border-gray-200 align-top py-2 px-3 text-gray-700";

                        return (
                          <tr
                            key={`${sub.key}_${bi}_${ai}`}
                            data-rca-row-key={bi === 0 && ai === 0 ? sub.key : undefined}
                            className={`border-t border-gray-200 ${apIsClosed ? "bg-emerald-50/70" : ""} ${highlightCls}`}
                          >
                            {bi === 0 && ai === 0 && (
                              <>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-center font-semibold text-gray-600`}>
                                  {currentNo}
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-center`}>
                                  <div className="flex flex-col items-center gap-1">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${palette.pillBg} ${palette.pillText}`}>
                                      {sub.monthLabel || sub.periode || "—"}
                                    </span>
                                    {subIsClosed && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        Closed
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} font-semibold text-gray-800`}>
                                  {sub.kpiIndicator || "—"}
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-gray-600`}>
                                  {sub.satuan || "—"}
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-gray-500 italic`}>
                                  {sub.baseline || "—"}
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-center font-bold text-[#1A284F]`}>
                                  {sub.targetMonthly || "—"}
                                </td>
                                <td rowSpan={totalSubRows} className={`${tdCommon} ${baseCellBg} text-center font-bold text-gray-800`}>
                                  {sub.actual || "—"}
                                </td>
                              </>
                            )}
                            {ai === 0 && (
                              <>
                                <td rowSpan={blockRows} className={`${tdCommon} ${blockCellBg} leading-relaxed`}>
                                  {factorLabel && (
                                    <span
                                      className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                        isInternal ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                                      }`}
                                    >
                                      {factorLabel}
                                    </span>
                                  )}
                                  <p>{bodyText || "—"}</p>
                                </td>
                                <td rowSpan={blockRows} className={`${tdCommon} ${blockCellBg} leading-relaxed`}>
                                  {block.kenapaA || "—"}
                                </td>
                                <td rowSpan={blockRows} className={`${tdCommon} ${blockCellBg} leading-relaxed`}>
                                  {block.kenapaB || "—"}
                                </td>
                                <td rowSpan={blockRows} className={`${tdCommon} ${blockCellBg} leading-relaxed`}>
                                  {block.kenapaC || "—"}
                                </td>
                              </>
                            )}
                            {ap ? (
                              <>
                                <td className={`${tdCommon} ${apCellBg} leading-relaxed`}>{ap.action || "—"}</td>
                                <td className={`${tdCommon} ${apCellBg} text-center whitespace-nowrap`}>
                                  {ap.targetDate ? normalizeDateDDMMYYYY(ap.targetDate) : "—"}
                                </td>
                                <td className={`${tdCommon} ${apCellBg}`}>{ap.pic || "—"}</td>
                                <td className={`${tdCommon} ${apCellBg} text-center`}>
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                                      AP_STATUS_BADGE[ap.status] ?? "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {ap.status === "Selesai" ? "Close (Selesai)" : ap.status || "—"}
                                  </span>
                                </td>
                                <td className={`${tdCommon} ${apCellBg}`}>
                                  {Array.isArray(ap.keterangan) && ap.keterangan.length > 0 ? (
                                    <ul className="flex flex-col gap-0.5">
                                      {ap.keterangan.map((k, ki) => (
                                        <li key={ki} className="text-[11px] leading-relaxed">
                                          • {k}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-300 text-[10px]">—</span>
                                  )}
                                </td>
                                <td className={`${tdCommon} ${apCellBg}`}>
                                  {Array.isArray(ap.output) && ap.output.length > 0 ? (
                                    <ul className="flex flex-col gap-0.5">
                                      {ap.output.map((o, oi) => (
                                        <li key={oi} className="text-[11px] leading-relaxed">
                                          • {o}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-300 text-[10px]">—</span>
                                  )}
                                </td>
                                <td className={`${tdCommon} ${apCellBg}`}>
                                  {Array.isArray(ap.evidence) && ap.evidence.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      {ap.evidence.map((ev, ei) => {
                                        const parsed = parseEvidenceRef(ev);
                                        return parsed.url ? (
                                          <a
                                            key={ei}
                                            href={parsed.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            download={parsed.name}
                                            className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold hover:underline"
                                          >
                                            <FileText className="w-3 h-3 shrink-0 text-emerald-600" />
                                            <span className="truncate max-w-[140px]">{parsed.name}</span>
                                          </a>
                                        ) : (
                                          <span
                                            key={ei}
                                            className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium"
                                          >
                                            <FileText className="w-3 h-3 shrink-0 text-emerald-600" />
                                            <span className="truncate max-w-[140px]">{parsed.name}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 text-[10px]">—</span>
                                  )}
                                </td>
                              </>
                            ) : (
                              <td colSpan={7} className={`${tdCommon} ${apCellBg} text-center text-gray-300`}>
                                Belum ada action plan
                              </td>
                            )}
                          </tr>
                        );
                      });
                    });
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
