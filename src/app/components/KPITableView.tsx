import React from "react";
import { computeTotal2026, type KPIItem } from "../pages/employee/KPIPage";
import type { MonthEntry } from "../pages/employee/KPIPage";

interface KPITableViewProps {
  kpiItems: KPIItem[];
  months: MonthEntry[];
  cells: Record<string, Record<string, string>>;
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

export function KPITableView({ kpiItems, months, cells }: KPITableViewProps) {
  // Compute cell value for a given sub-row
  const getCellValue = (kpi: KPIItem, monthId: string, subIdx: number): string => {
    const cellKey = `${kpi.no}__${subIdx}`;
    const sub = kpi.subRows[subIdx];
    const rawVal = cells[monthId]?.[cellKey] ?? "";
    
    if (!sub.compute) return rawVal || "—";
    
    // Compute based on spec
    const spec = sub.compute;
    
    if (spec.type === "ratio") {
      const actualKey = `${kpi.no}__${spec.actualIdx}`;
      const targetKey = `${kpi.no}__${spec.targetIdx}`;
      const target = parseNum(cells[monthId]?.[targetKey] ?? "");
      if (target === null) return "—";
      const actual = parseNum(cells[monthId]?.[actualKey] ?? "");
      if (actual === null) return "0%";
      if (target === 0) return actual === 0 ? "100%" : "0%";
      let pct: number;
      if (spec.minimize) {
        pct = actual <= target ? 100 : (target / actual) * 100;
      } else {
        pct = (actual / target) * 100;
      }
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
    
    return "—";
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-xs w-full">
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 50 }}>No</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 120 }}>Perspektif</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 200 }}>KPI</th>
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
            {months.map((m) => (
              <th key={m.id} className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 120 }}>
                {m.label.replace(/-\d{2}$/, "")}
              </th>
            ))}
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0F3460]" style={{ minWidth: 120 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {kpiItems.map((kpi, kpiIdx) => {
            const rs = kpi.subRows.length;
            
            return kpi.subRows.map((sub, subIdx) => {
              const isFirst = subIdx === 0;
              const isComputed = !!sub.compute;
              const isTargetRow = !sub.compute && sub.label.toLowerCase().startsWith("target");
              
              const totalVal = computeTotal2026(kpi, subIdx, cells, months);
              const totalColorCls = isComputed || sub.bold ? getPctColor(totalVal) : (totalVal === "—" ? "text-gray-300" : "text-blue-800");
              
              return (
                <tr key={`${kpi.no}-${subIdx}`} className={kpiIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {isFirst && (
                    <>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">
                        {kpi.no}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.perspektif}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.kpi}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.satuan}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-gray-700">
                        {kpi.formula}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center font-semibold text-gray-700">
                        {kpi.bobot}
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
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-center text-gray-700">
                        {kpi.target2026}
                      </td>
                      <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-center text-gray-700">
                        {kpi.polaritas}
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
                  {months.map((m) => {
                    const val = getCellValue(kpi, m.id, subIdx);
                    const cellColorCls = isComputed ? getPctColor(val) : "";
                    
                    return (
                      <td key={m.id} className={`border border-gray-200 text-center py-1 px-1 ${
                        isComputed ? "bg-emerald-50/80" : isTargetRow ? "bg-sky-50/70" : sub.bold ? "bg-green-50/60" : "bg-green-50"
                      }`}>
                        {isComputed ? (
                          <span className={`font-bold ${cellColorCls}`}>{val}</span>
                        ) : isTargetRow ? (
                          <span className="font-semibold text-sky-700">{val}</span>
                        ) : (
                          <span className={sub.bold ? "font-bold text-gray-800" : "text-gray-700"}>{val}</span>
                        )}
                      </td>
                    );
                  })}
                  
                  {/* Total 2026 cell */}
                  <td className={`border border-gray-200 text-center py-1 px-2 ${
                    isComputed ? "bg-blue-50/80" : sub.bold ? "bg-blue-50/40" : "bg-blue-50/20"
                  }`}>
                    <span className={`${sub.bold ? "font-bold" : ""} ${totalColorCls}`}>
                      {totalVal}
                    </span>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
