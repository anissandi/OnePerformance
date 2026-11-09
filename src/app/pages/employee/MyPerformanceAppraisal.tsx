import React, { useState } from "react";
import { TrendingUp, Lightbulb, ClipboardList, SearchCode, ChevronDown, ChevronUp, FolderKanban, CheckCircle2, AlertTriangle, Clock, XCircle, Activity, Lock, Paperclip, MessageSquare, Eye, Download, FileText, X } from "lucide-react";
import { KPI_ITEMS, computeTotal2026, computeKPIAchievement, parseBobotDecimal, loadKPITracking } from "./KPIPage";
import { SAMPLE_GOALS } from "./SMARTGoals";
import { FORMS } from "./AppraisalForm";
import { useProjectStore, CATEGORY_META, SCOPE_BOBOT, type CheckInStatus } from "../../store/projectStore";
import { loadEvidenceFiles } from "../shared/kpiEvidenceStore";
import type { StoredEvidenceFile } from "../shared/kpiEvidenceStore";
import { loadMonthlyNotes } from "../shared/kpiMonthlyNotesStore";
import type { MonthlyNoteEntry } from "../shared/kpiMonthlyNotesStore";

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "KPI" | "SMART Goals" | "Appraisal Form" | "RCA" | "Project Outside Job Scope";

const TABS: { id: Tab; icon: React.ElementType; color: string }[] = [
  { id: "KPI", icon: TrendingUp, color: "text-blue-600" },
  { id: "SMART Goals", icon: Lightbulb, color: "text-amber-600" },
  { id: "Appraisal Form", icon: ClipboardList, color: "text-green-600" },
  { id: "RCA", icon: SearchCode, color: "text-purple-600" },
  { id: "Project Outside Job Scope", icon: FolderKanban, color: "text-teal-600" },
];

// ─── Shared helpers for KPI history ──────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreviewFile(name: string, type: string): boolean {
  return /image\/(jpeg|png|gif|webp)/.test(type)
    || /\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(name)
    || type === "application/pdf";
}

function EmpFileViewerModal({ name, url, mimeType, onClose }: {
  name: string; url: string; mimeType: string; onClose: () => void;
}) {
  const isImg = /image\/(jpeg|png|gif|webp)/.test(mimeType) || /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(name);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
          <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-sm font-semibold text-[#1A284F] flex-1 truncate">{name}</span>
          {url && (
            <a href={url} download={name} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0">
              <Download className="w-3 h-3" /> Download
            </a>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50 min-h-0">
          {isImg ? (
            <img src={url} alt={name} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow" />
          ) : isPdf ? (
            <iframe src={url} title={name} className="w-full rounded-lg border border-gray-200" style={{ height: "75vh" }} />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <FileText className="w-12 h-12 opacity-30" />
              <p className="text-sm">Format tidak bisa dipreview.</p>
              <a href={url} download={name} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmpEvidenceChip({ file }: { file: StoredEvidenceFile }) {
  const [viewing, setViewing] = useState<StoredEvidenceFile | null>(null);
  const viewable = !!file.url && canPreviewFile(file.name, file.type);
  return (
    <>
      <button
        type="button"
        onClick={() => viewable ? setViewing(file) : undefined}
        className={[
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors max-w-[200px]",
          viewable
            ? "bg-indigo-50 border-indigo-200 hover:bg-indigo-100 cursor-pointer"
            : "bg-gray-50 border-gray-200 cursor-default",
        ].join(" ")}
        title={file.name}
      >
        <Paperclip className={["w-3 h-3 shrink-0", viewable ? "text-indigo-400" : "text-gray-400"].join(" ")} />
        <span className={["text-xs font-medium truncate", viewable ? "text-indigo-700" : "text-gray-700"].join(" ")}>
          {file.name}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0 ml-0.5">{fmtBytes(file.size)}</span>
        {viewable && <Eye className="w-3 h-3 text-indigo-400 shrink-0" />}
      </button>
      {viewing && <EmpFileViewerModal name={viewing.name} url={viewing.url} mimeType={viewing.type} onClose={() => setViewing(null)} />}
    </>
  );
}

// ─── KPI Tab ──────────────────────────────────────────────────────────────────

const PERSP_COLOR: Record<string, string> = {
  "Finansial": "text-blue-700 bg-blue-50",
  "Proses": "text-purple-700 bg-purple-50",
  "Environment, Health & Safety": "text-green-700 bg-green-50",
  "Customer": "text-orange-700 bg-orange-50",
  "Learning & Growth": "text-pink-700 bg-pink-50",
};

function getPctColor(val: string): string {
  if (!val || val === "—") return "text-gray-300 font-normal";
  const n = parseFloat(val.replace(/,/g, "").replace(/%$/, "").trim());
  if (isNaN(n)) return "text-gray-700";
  return n >= 100 ? "text-green-700" : "text-rose-600";
}

function displayMonth(label: string): string {
  return label.replace(/-\d{2}$/, "");
}

function KPITab() {
  const { months, cellsMap } = React.useMemo(() => loadKPITracking(), []);
  const monthlyNotes = React.useMemo(() => loadMonthlyNotes(), []);
  const evidenceFiles = React.useMemo(() => loadEvidenceFiles(), []);
  const [notesOpen, setNotesOpen] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const evidenceByMonth = React.useMemo(() => {
    const map: Record<string, StoredEvidenceFile[]> = {};
    evidenceFiles.forEach((f) => {
      if (!map[f.month]) map[f.month] = [];
      map[f.month].push(f);
    });
    return map;
  }, [evidenceFiles]);

  const sectionScore = (sec: "A" | "B") =>
    KPI_ITEMS.filter((k) => k.section === sec).reduce((s, k) => {
      const ach = computeKPIAchievement(k, cellsMap, months);
      if (ach === null) return s;
      return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
    }, 0);

  const scoreA = sectionScore("A");
  const scoreB = sectionScore("B");
  const totalNilai = scoreA + scoreB;
  const totalBobot = KPI_ITEMS.reduce((s, k) => s + parseFloat(k.bobot.replace("%", "")), 0);

  const nilaiColor =
    totalNilai >= 100
      ? { row: "bg-emerald-50 border-emerald-200", label: "text-emerald-800", val: "text-emerald-700", valBg: "bg-emerald-100", tag: "bg-emerald-200/80 text-emerald-700 border-emerald-300/70" }
      : totalNilai >= 75
      ? { row: "bg-indigo-50 border-indigo-200", label: "text-indigo-800", val: "text-indigo-700", valBg: "bg-indigo-100", tag: "bg-indigo-200/80 text-indigo-700 border-indigo-300/70" }
      : totalNilai >= 50
      ? { row: "bg-amber-50 border-amber-200", label: "text-amber-800", val: "text-amber-700", valBg: "bg-amber-100", tag: "bg-amber-200/80 text-amber-700 border-amber-300/70" }
      : { row: "bg-rose-50 border-rose-200", label: "text-rose-800", val: "text-rose-700", valBg: "bg-rose-100", tag: "bg-rose-200/80 text-rose-700 border-rose-300/70" };

  const currentMonthLabel = months.length > 0 ? displayMonth(months[months.length - 1].label) : null;

  const colSpanFull = 5 + months.length + 2; // No+Persp+KPI+Bobot+Tracking + months + Total+Achievement

  const renderSection = (sec: "A" | "B") =>
    KPI_ITEMS.filter((k) => k.section === sec).map((kpi, kpiIdx) => {
      const rs = kpi.subRows.length;
      const ach = computeKPIAchievement(kpi, cellsMap, months);
      const cappedAch = ach !== null ? Math.min(ach, 100) : null;
      const score = cappedAch !== null ? (cappedAch / 100) * parseBobotDecimal(kpi.bobot) * 100 : null;
      const achColor = ach !== null ? (ach >= 100 ? "text-green-700" : "text-rose-600") : "text-gray-300";

      return kpi.subRows.map((sub, si) => {
        const isFirst = si === 0;
        const isComputed = !!sub.compute;
        const isTarget = !sub.compute && sub.label.toLowerCase().startsWith("target");
        const totalVal = computeTotal2026(kpi, si, cellsMap, months);
        const totalColor = isComputed || sub.bold ? getPctColor(totalVal) : totalVal === "—" ? "text-gray-300" : "text-blue-800";

        return (
          <tr key={`${kpi.no}-${si}`} className={kpiIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
            {isFirst && (
              <>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center text-xs font-semibold text-gray-500 align-middle">
                  {kpi.no}
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 align-middle">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${PERSP_COLOR[kpi.perspektif] ?? "text-gray-700 bg-gray-100"}`}>
                    {kpi.perspektif}
                  </span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-xs font-medium text-gray-800 whitespace-pre-line leading-snug align-middle" style={{ minWidth: 220 }}>
                  {kpi.kpi}
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center align-middle">
                  <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                </td>
              </>
            )}

            {/* Tracking sub-row label */}
            <td className={`border border-gray-200 py-1 px-3 text-[10px] ${
              isComputed ? "bg-emerald-50/80 text-emerald-700" : isTarget ? "bg-sky-50/70 text-sky-700 font-semibold" : sub.bold ? "bg-green-50/60 font-bold text-gray-800" : "text-gray-600"
            }`} style={{ minWidth: 140 }}>
              {sub.label}
              {isComputed && <span className="ml-1 text-[9px] text-emerald-500">(auto)</span>}
            </td>

            {/* Monthly cells */}
            {months.map((m) => {
              const ck = `${kpi.no}__${si}`;
              let val: string;
              if (!sub.compute) {
                val = cellsMap[m.id]?.[ck] ?? "—";
              } else {
                const spec = sub.compute;
                const getRaw = (idx: number) => cellsMap[m.id]?.[`${kpi.no}__${idx}`] ?? "";
                if (spec.type === "ratio") {
                  const target = parseFloat((getRaw(spec.targetIdx) || "").replace(/,/g, ""));
                  if (isNaN(target)) { val = "—"; }
                  else {
                    const actual = parseFloat((getRaw(spec.actualIdx) || "").replace(/,/g, ""));
                    if (isNaN(actual)) { val = "0%"; }
                    else if (target === 0) { val = actual === 0 ? "100%" : "0%"; }
                    else {
                      const pct = spec.minimize ? (actual <= target ? 100 : (target / actual) * 100) : (actual / target) * 100;
                      val = pct.toFixed(1) + "%";
                    }
                  }
                } else { val = "—"; }
              }
              const isEmpty = !sub.compute && !isTarget && (!val || val === "—");
              return (
                <td key={m.id} className={`border border-gray-200 text-center py-1 px-1 text-[10px] ${
                  isComputed ? "bg-emerald-50/60" : isTarget ? "bg-sky-50/50" : sub.bold ? "bg-green-50/40" : ""
                } ${isEmpty ? "bg-red-50" : ""}`} style={{ minWidth: 80 }}>
                  {isComputed ? (
                    <span className={`font-bold ${getPctColor(val)}`}>{val}</span>
                  ) : isTarget ? (
                    <span className="font-semibold text-sky-700">{val}</span>
                  ) : (
                    <span className={`${sub.bold ? "font-bold text-gray-800" : isEmpty ? "text-red-300" : "text-gray-700"}`}>{val || "—"}</span>
                  )}
                </td>
              );
            })}

            {/* Total 2026 */}
            <td className={`border border-gray-200 text-center py-1 px-2 text-[10px] ${
              isComputed ? "bg-blue-50/80" : sub.bold ? "bg-blue-50/40" : "bg-blue-50/20"
            }`} style={{ minWidth: 90 }}>
              <span className={`${sub.bold ? "font-bold" : ""} ${totalColor}`}>{totalVal}</span>
            </td>

            {/* Achievement (rowSpan, first sub-row only) */}
            {isFirst && (
              <td rowSpan={rs} className="border border-gray-200 text-center bg-[#0a2a4a]/5 py-2 px-2 align-middle" style={{ minWidth: 100 }}>
                {ach !== null ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-xs font-bold ${achColor}`}>{ach.toFixed(1)}%</span>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-1.5 rounded-full ${ach >= 100 ? "bg-green-500" : "bg-rose-500"}`} style={{ width: `${Math.min(ach, 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-400">Score Bobot</span>
                    <span className={`text-xs font-bold ${achColor}`}>{score !== null ? score.toFixed(2) + "%" : "—"}</span>
                  </div>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
            )}
          </tr>
        );
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="border-collapse text-xs" style={{ minWidth: `${52 + 110 + 220 + 64 + 140 + months.length * 80 + 90 + 100}px` }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 52 }}>No</th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 110 }}>Perspektif</th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 220 }}>KPI</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 64 }}>Bobot</th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 140 }}>Tracking</th>
              {months.map((m) => (
                <th key={m.id} className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 80 }}>
                  {displayMonth(m.label)}
                </th>
              ))}
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0F3460]" style={{ minWidth: 90 }}>Total</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold bg-[#0a2a4a]" style={{ minWidth: 100 }}>Achievement</th>
            </tr>
          </thead>
          <tbody>
            {/* Section A */}
            <tr>
              <td colSpan={colSpanFull} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border" style={{ background: "#1565C0", borderColor: "#1565C0" }}>
                A. Objective KPI — Bobot 20%
              </td>
            </tr>
            {renderSection("A")}

            {/* Section B */}
            <tr>
              <td colSpan={colSpanFull} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border" style={{ background: "#1976D2", borderColor: "#1976D2" }}>
                B. Functional KPI — Bobot 80%
              </td>
            </tr>
            {renderSection("B")}

            {/* Spacer */}
            <tr>
              <td colSpan={colSpanFull} className="py-1 border border-[#1A284F]/10 bg-[#1A284F]/5" />
            </tr>

            {/* Summary rows */}
            {([
              { label: `Total KPI`, value: `${KPI_ITEMS.length} KPI`, highlight: true },
              { label: "Total Bobot KPI", value: `${totalBobot.toFixed(0)}%`, highlight: true },
            ] as { label: string; value: string; highlight?: boolean }[]).map(({ label, value }) => (
              <tr key={label} className="bg-[#1A284F]/5">
                <td colSpan={colSpanFull - 1} className="border border-gray-200 py-2 px-4 text-xs font-bold text-[#1A284F]">{label}</td>
                <td className="border border-gray-200 py-2 px-3 text-center text-xs font-bold text-[#1A284F] bg-[#0a2a4a]/8">{value}</td>
              </tr>
            ))}

            {/* Total Nilai KPI (sementara) */}
            <tr className={nilaiColor.row}>
              <td colSpan={colSpanFull - 1} className={`border border-gray-200 py-3 px-4 text-sm font-extrabold tracking-wide ${nilaiColor.label}`}>
                Total Nilai KPI
              </td>
              <td className={`border border-gray-200 py-2 px-3 text-center ${nilaiColor.valBg}`}>
                <div className="flex flex-col items-center gap-0.5">
                  <span className={`text-base font-black tracking-tight ${nilaiColor.val}`}>
                    {totalNilai.toFixed(2)}%
                  </span>
                  {currentMonthLabel && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${nilaiColor.tag} leading-tight`}>
                      s.d. {currentMonthLabel} · belum final
                    </span>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── History Evidence ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-5 py-3 bg-[#1A284F] hover:bg-[#1e3159] transition-colors text-left"
          onClick={() => setEvidenceOpen((v) => !v)}
        >
          <Paperclip className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="text-white text-sm font-bold flex-1">History Evidence</span>
          <span className="text-white/50 text-[10px] mr-2">{evidenceFiles.length} file{evidenceFiles.length !== 1 ? "s" : ""} total</span>
          {evidenceOpen
            ? <ChevronUp className="w-4 h-4 text-white/60 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-white/60 shrink-0" />}
        </button>
        {evidenceOpen && (months.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Paperclip className="w-7 h-7 text-gray-200" />
            <p className="text-xs text-gray-400 italic">Belum ada data bulan di KPI tracking.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {months.map((m) => {
              const files = evidenceByMonth[m.label] ?? [];
              return (
                <div key={m.id} className="flex gap-0">
                  <div className="w-20 shrink-0 bg-gray-50 border-r border-gray-100 flex items-start justify-center pt-3 pb-3">
                    <span className="text-[10px] font-bold text-[#1A284F] uppercase tracking-widest">{displayMonth(m.label)}</span>
                  </div>
                  <div className="flex-1 p-3">
                    {files.length === 0 ? (
                      <p className="text-[11px] text-gray-300 italic">Tidak ada evidence</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {files.map((f) => <EmpEvidenceChip key={f.id} file={f} />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── History Catatan Approver ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          className="w-full flex items-center gap-2 px-5 py-3 bg-[#1A284F] hover:bg-[#1e3159] transition-colors text-left"
          onClick={() => setNotesOpen((v) => !v)}
        >
          <MessageSquare className="w-4 h-4 text-sky-300 shrink-0" />
          <span className="text-white text-sm font-bold flex-1">History Catatan Approver</span>
          {notesOpen
            ? <ChevronUp className="w-4 h-4 text-white/60 shrink-0" />
            : <ChevronDown className="w-4 h-4 text-white/60 shrink-0" />}
        </button>
        {notesOpen && (months.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <MessageSquare className="w-7 h-7 text-gray-200" />
            <p className="text-xs text-gray-400 italic">Belum ada data bulan di KPI tracking.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#1A284F]/5 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F] w-24">Bulan</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F]">Catatan Approver 1</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-[#1A284F] border-l border-gray-200">Catatan Approver 2</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const entry: MonthlyNoteEntry = monthlyNotes[m.id] ?? {};
                  const a1 = entry.approver1;
                  const a2 = entry.approver2;
                  return (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-[#1A284F] uppercase tracking-widest text-[10px] align-top whitespace-nowrap">
                        {displayMonth(m.label)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {a1 ? (
                          <div className="flex flex-col gap-0.5">
                            <p className="text-gray-800 leading-relaxed">{a1.text}</p>
                            <p className="text-[10px] text-gray-400">{a1.approverName} · {a1.date}</p>
                          </div>
                        ) : <span className="text-gray-300 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 align-top border-l border-gray-100">
                        {a2 ? (
                          <div className="flex flex-col gap-0.5">
                            <p className="text-gray-800 leading-relaxed">{a2.text}</p>
                            <p className="text-[10px] text-gray-400">{a2.approverName} · {a2.date}</p>
                          </div>
                        ) : <span className="text-gray-300 italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SMART Goals Tab ──────────────────────────────────────────────────────────

const SMART_ROWS: { key: keyof typeof SAMPLE_GOALS[0]; title: string }[] = [
  { key: "specific", title: "Specific / Spesifik" },
  { key: "measurable", title: "Measurable / Dapat Diukur" },
  { key: "attainable", title: "Attainable / Dapat Dicapai" },
  { key: "relevant", title: "Relevant / Relevan" },
  { key: "timely", title: "Timely / Tepat Waktu" },
  { key: "bukti", title: "Bukti" },
];

function SMARTGoalsTab() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {SAMPLE_GOALS.map((goal, idx) => (
        <div key={goal.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === goal.id ? null : goal.id)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-[#1A284F] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <span className="font-semibold text-gray-800">{goal.label}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded === goal.id ? "rotate-180" : ""}`} />
          </button>

          {expanded === goal.id && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {SMART_ROWS.map(({ key, title }) => (
                <div key={key} className="px-5 py-3 grid grid-cols-[200px_1fr] gap-4">
                  <p className="text-xs font-bold text-[#1A284F] uppercase tracking-wide pt-0.5">{title}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{(goal as any)[key] || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Appraisal Form Tab ───────────────────────────────────────────────────────

function AppraisalFormTab() {
  const [expandedForm, setExpandedForm] = useState<string | null>(null);

  const totalScore = FORMS.reduce((s, f) => s + f.percentage, 0);

  return (
    <div className="flex flex-col gap-4">
      {FORMS.map((f) => {
        const isOpen = expandedForm === f.id;
        return (
          <div key={f.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedForm(isOpen ? null : f.id)}
              className="w-full flex items-center justify-between bg-[#1A284F] px-5 py-3 text-left hover:bg-[#131d3b] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{f.tab}</span>
                <span className="text-white/70 text-xs">— {f.subtitle}</span>
                <span className="text-[10px] font-semibold bg-[#C69A45] text-white px-2.5 py-0.5 rounded">
                  {f.percentage}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/60 text-xs">{f.items.length} kompetensi</span>
                <ChevronDown className={`w-4 h-4 text-white/70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {/* Item list */}
            {isOpen && (
              <div className="divide-y divide-gray-50">
                {f.items.map((item) => (
                  <div key={item.no} className="flex gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                    <span className="w-6 h-6 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.no}
                    </span>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {item.label && <span className="font-semibold italic text-gray-800">{item.label} </span>}
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Overall summary */}
      <div className="bg-[#1A284F] rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Total Nilai Keseluruhan</p>
          <p className="text-white font-bold text-base mt-0.5">
            {FORMS.map((f) => f.subtitle).join(" + ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-[#C69A45]">{totalScore}%</p>
          <p className="text-white/60 text-xs">{FORMS.length} form penilaian</p>
        </div>
      </div>
    </div>
  );
}

// ─── RCA Tab ─────────────────────────────────────────────────────────────────

type StatusPerbaikan = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai";

const STATUS_STYLE: Record<StatusPerbaikan, string> = {
  "Belum dilaksanakan": "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai": "bg-green-50 text-green-700",
};

const RCA_DATA = [
  {
    no: 1,
    periode: "Jan",
    kpi: "Implementasi ERP System",
    satuan: "% /bulan",
    baseline: "—",
    target: "100%",
    actual: "85%",
    masalahUtama: "Modul Finance dan HR belum selesai",
    kenapaA: "Tim project kekurangan tenaga ahli modul HR",
    kenapaB: "Rekruten tenaga ahli HR tertunda karena approval anggaran lambat",
    kenapaC: "Proses approval anggaran lambat karena dokumen justifikasi belum lengkap dan belum ada persetujuan dari Direktur Keuangan",
    actionPlans: [
      { action: "Penyusunan dokumen justifikasi kebutuhan tenaga ahli modul HR", targetDate: "17 Jan 2027", pic: "PM ERP & HR Manager", status: "Sedang dilaksanakan" as StatusPerbaikan, keterangan: "Draft awal sudah disusun, menunggu data kebutuhan SDM dari HR", output: "Draft awal dokumen justifikasi kebutuhan tenaga ahli modul HR" },
      { action: "Permohonan approval dokumen justifikasi kepada Direktur Keuangan", targetDate: "18 Jan 2027", pic: "PM ERP", status: "Belum dilaksanakan" as StatusPerbaikan, keterangan: "Menunggu dokumen final dari tim ERP dan HR", output: "Dokumen justifikasi kebutuhan tenaga ahli modul HR lengkap" },
      { action: "Koordinasi langsung dengan Direktur Keuangan untuk percepatan approval", targetDate: "20 Jan 2027", pic: "PM ERP & CFO Assistant", status: "Belum dilaksanakan" as StatusPerbaikan, keterangan: "Akan dijadwalkan dalam rapat mingguan manajemen", output: "Dokumen justifikasi dan anggaran yang telah disetujui" },
      { action: "Siapkan alternatif tenaga ahli internal jika approval tertunda", targetDate: "22 Jan 2027", pic: "HR Manager", status: "Sedang dilaksanakan" as StatusPerbaikan, keterangan: "Identifikasi kandidat internal sedang dilakukan", output: "Pemenuhan manpower untuk posisi tenaga ahli HR" },
    ],
  },
];

function RCATab() {
  const thClass = "border border-[#1A284F]/30 py-2.5 px-3 text-center font-semibold text-xs";
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-xs" style={{ minWidth: 1800 }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className={thClass} style={{ minWidth: 42 }}>No</th>
            <th className={thClass} style={{ minWidth: 72 }}>Periode</th>
            <th className={thClass} style={{ minWidth: 150 }}>KPI</th>
            <th className={thClass} style={{ minWidth: 90 }}>Satuan</th>
            <th className={thClass} style={{ minWidth: 80, fontStyle: "italic" }}>Baseline</th>
            <th className={thClass} style={{ minWidth: 72 }}>Target</th>
            <th className={thClass} style={{ minWidth: 72 }}>Actual</th>
            <th className={thClass} style={{ minWidth: 160 }}><div>Masalah Utama</div><div className="font-normal opacity-70">(A)</div></th>
            <th className={thClass} style={{ minWidth: 140 }}><div>Kenapa A?</div><div className="font-normal opacity-70">(B)</div></th>
            <th className={thClass} style={{ minWidth: 140 }}><div>Kenapa B?</div><div className="font-normal opacity-70">(C)</div></th>
            <th className={thClass} style={{ minWidth: 140 }}><div>Kenapa C?</div><div className="font-normal opacity-70">(D)</div></th>
            <th className={thClass} style={{ minWidth: 170 }}>Action Plan</th>
            <th className={thClass} style={{ minWidth: 100 }}>Target Penyelesaian</th>
            <th className={thClass} style={{ minWidth: 110 }}>PIC</th>
            <th className={thClass} style={{ minWidth: 120 }}>Status Perbaikan</th>
            <th className={thClass} style={{ minWidth: 150 }}>Keterangan</th>
            <th className={thClass} style={{ minWidth: 150 }}>Output</th>
          </tr>
        </thead>
        <tbody>
          {RCA_DATA.map((item) => {
            const aps = item.actionPlans;
            const rs = aps.length;
            const tdLeft = "border border-gray-200 align-top py-2 px-3 bg-white";
            return aps.map((ap, apIdx) => (
              <tr key={`${item.no}_${apIdx}`} className="border-t border-gray-200">
                {apIdx === 0 && (
                  <>
                    <td rowSpan={rs} className={`${tdLeft} text-center font-semibold text-gray-600`}>{item.no}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-center`}>
                      <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{item.periode}</span>
                    </td>
                    <td rowSpan={rs} className={`${tdLeft} font-medium text-gray-800 leading-relaxed`}>{item.kpi}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-600`}>{item.satuan}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-400 italic`}>{item.baseline}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-center font-bold text-[#1A284F]`}>{item.target}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-center font-bold text-gray-800`}>{item.actual}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-700 leading-relaxed`}>{item.masalahUtama}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-700 leading-relaxed`}>{item.kenapaA}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-700 leading-relaxed`}>{item.kenapaB}</td>
                    <td rowSpan={rs} className={`${tdLeft} text-gray-700 leading-relaxed`}>{item.kenapaC}</td>
                  </>
                )}
                <td className="border border-gray-200 py-2 px-3 text-gray-700 leading-relaxed bg-blue-50/20">{ap.action}</td>
                <td className="border border-gray-200 py-2 px-3 text-center text-gray-600 bg-blue-50/20">{ap.targetDate}</td>
                <td className="border border-gray-200 py-2 px-3 text-gray-600 bg-blue-50/20">{ap.pic}</td>
                <td className="border border-gray-200 py-2 px-3 text-center bg-blue-50/20">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[ap.status]}`}>{ap.status}</span>
                </td>
                <td className="border border-gray-200 py-2 px-3 text-gray-600 leading-relaxed bg-blue-50/20">{ap.keterangan}</td>
                <td className="border border-gray-200 py-2 px-3 text-gray-600 leading-relaxed bg-blue-50/20">{ap.output}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Project Outside Job Scope Tab ───────────────────────────────────────────

const CHECK_IN_STATUS_META: Record<CheckInStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  not_started: { label: "Not Started",  color: "text-gray-500",   bg: "bg-gray-100",   border: "border-gray-200",   icon: <Clock className="w-3 h-3" /> },
  on_track:    { label: "On Track",     color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200",  icon: <TrendingUp className="w-3 h-3" /> },
  at_risk:     { label: "At Risk",      color: "text-orange-600", bg: "bg-orange-50",  border: "border-orange-200", icon: <AlertTriangle className="w-3 h-3" /> },
  completed:   { label: "Completed",    color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",   icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled:   { label: "Cancelled",    color: "text-red-600",    bg: "bg-red-50",     border: "border-red-200",    icon: <XCircle className="w-3 h-3" /> },
};

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 100 ? "bg-blue-500" : clamped >= 50 ? "bg-green-500" : clamped > 0 ? "bg-amber-400" : "bg-gray-200";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

function ProjectOutsideTab() {
  const { projects, submitted } = useProjectStore();

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
        <FolderKanban className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-400 mb-1">No projects registered yet</p>
        <p className="text-xs text-gray-400 text-center max-w-xs">
          Go to <strong>Performance Appraisal Setting → Project Outside Job Scope</strong> to register your projects.
        </p>
      </div>
    );
  }

  const totalBobot = projects.reduce((sum, p) => sum + (SCOPE_BOBOT[p.scope] ?? 0), 0);
  const avgProgress = Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length);
  const completedCount = projects.filter((p) => p.checkInStatus === "completed").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-[#1A284F]/5 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#1A284F]">Total Projects</p>
          <p className="text-2xl font-bold text-[#1A284F]">{projects.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Completed</p>
          <p className="text-2xl font-bold text-blue-700">{completedCount}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Avg. Progress</p>
          <p className="text-2xl font-bold text-indigo-700">{avgProgress}%</p>
        </div>
        <div className="bg-teal-50 rounded-xl px-4 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Total Bobot</p>
          <p className="text-2xl font-bold text-teal-700">{totalBobot}%</p>
        </div>
      </div>

      {/* Not-submitted notice */}
      {!submitted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Projects have not been submitted for approval yet. Progress check-in will be available after submission.
        </div>
      )}

      {/* Project rows */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 800 }}>
          <thead>
            <tr className="bg-[#1A284F] text-white">
              <th className="py-3 px-4 text-center font-semibold text-xs w-10">No</th>
              <th className="py-3 px-4 text-left font-semibold text-xs">Category</th>
              <th className="py-3 px-4 text-left font-semibold text-xs">Project Name</th>
              <th className="py-3 px-4 text-center font-semibold text-xs">Bobot</th>
              <th className="py-3 px-4 text-center font-semibold text-xs">Role</th>
              <th className="py-3 px-4 text-center font-semibold text-xs">Timeline</th>
              <th className="py-3 px-4 text-center font-semibold text-xs bg-[#0F3460]">Progress</th>
              <th className="py-3 px-4 text-center font-semibold text-xs bg-[#0F3460]">Measurement Status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, idx) => {
              const { color, bg } = CATEGORY_META[p.category];
              const bobot = SCOPE_BOBOT[p.scope] ?? 0;
              const { label: statusLabel, color: sColor, bg: sBg, border: sBorder, icon: sIcon } = CHECK_IN_STATUS_META[p.checkInStatus];
              return (
                <tr key={p.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"} hover:bg-teal-50/20 transition-colors`}>
                  <td className="py-3 px-4 text-center text-xs font-semibold text-gray-500">{p.no}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${bg} ${color}`}>{p.category}</span>
                      <span className="text-[10px] text-gray-500 leading-tight">{p.scope}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-sm font-semibold text-gray-800">{p.projectName}</p>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed line-clamp-2">{p.description}</p>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2.5 py-1 bg-[#1A284F] text-white rounded-full text-[11px] font-bold">{bobot}%</span>
                  </td>
                  <td className="py-3 px-4 text-center text-xs text-gray-600">{p.role}</td>
                  <td className="py-3 px-4 text-center text-xs text-gray-500">
                    <div>{p.startDate || "—"}</div>
                    <div className="text-gray-300">↓</div>
                    <div>{p.endDate || "—"}</div>
                  </td>
                  <td className="py-3 px-4 bg-teal-50/30">
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <ProgressBar percent={p.progressPercent} />
                      <p className="text-[11px] font-bold text-center text-gray-600">{p.progressPercent}%</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center bg-teal-50/30">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sBg} ${sColor} ${sBorder}`}>
                      {sIcon} {statusLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail cards: actual vs expected output + notes */}
      {projects.some((p) => p.progressNotes || p.actualOutput || p.expectedOutput) && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Progress Detail</p>
          {projects.filter((p) => p.progressNotes || p.actualOutput || p.expectedOutput).map((p) => (
            <div key={p.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              <div className={`px-5 py-2.5 flex items-center gap-2 ${CATEGORY_META[p.category].bg}`}>
                <span className={`text-xs font-bold ${CATEGORY_META[p.category].color}`}>{p.category}</span>
                <span className="text-gray-400 text-xs">•</span>
                <span className="text-xs font-semibold text-gray-700">{p.projectName}</span>
              </div>
              <div className="px-5 py-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Expected Output (Target)</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{p.expectedOutput || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Actual Output (Achieved)</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{p.actualOutput || "—"}</p>
                </div>
                {p.progressNotes && (
                  <div className="sm:col-span-2 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Progress Notes</p>
                    <p className="text-xs text-gray-600 leading-relaxed">{p.progressNotes}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Score Summary ────────────────────────────────────────────────────────────

interface ScoreCard {
  label: string;
  score: number | null; // null = not yet computed
  weight: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}

// Historical final scores per year
const HISTORICAL_SCORES: Record<string, { kpi: number; smart: number; appraisal: number; project: number; overall: number }> = {
  "2025": { kpi: 87, smart: 82, appraisal: 78, project: 70, overall: 84 },
  "2024": { kpi: 91, smart: 88, appraisal: 85, project: 80, overall: 89 },
  "2023": { kpi: 79, smart: 75, appraisal: 82, project: 65, overall: 79 },
};

function ScoreBadge({ value, isCurrent }: { value: number | null; isCurrent: boolean }) {
  if (value === null) {
    return <span className="text-2xl font-bold text-amber-500">—</span>;
  }
  const color = isCurrent
    ? value >= 90 ? "text-blue-700" : value >= 75 ? "text-amber-600" : "text-rose-600"
    : value >= 90 ? "text-green-700" : value >= 75 ? "text-green-600" : "text-amber-600";
  return <span className={`text-2xl font-bold ${color}`}>{value}%</span>;
}

function ScoreSummarySection({ year }: { year: string }) {
  const isCurrent = year === "2026";

  // For 2026 — compute KPI score live from KPI Tracking store
  const kpi2026 = React.useMemo(() => {
    const { months: m, cellsMap: c } = loadKPITracking();
    const total = KPI_ITEMS.reduce((s, k) => {
      const ach = computeKPIAchievement(k, c, m);
      if (ach === null) return s;
      return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
    }, 0);
    return total > 0 ? Math.round(total) : null;
  }, []);

  const hist = HISTORICAL_SCORES[year];

  const cards: ScoreCard[] = [
    {
      label: "KPI",
      score: isCurrent ? kpi2026 : (hist?.kpi ?? null),
      weight: 40,
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200",
    },
    {
      label: "SMART Goals",
      score: isCurrent ? null : (hist?.smart ?? null),
      weight: 20,
      icon: <Lightbulb className="w-5 h-5" />,
      color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200",
    },
    {
      label: "Appraisal Form",
      score: isCurrent ? null : (hist?.appraisal ?? null),
      weight: 30,
      icon: <ClipboardList className="w-5 h-5" />,
      color: "text-green-700", bg: "bg-green-50", border: "border-green-200",
    },
    {
      label: "Project Outside",
      score: isCurrent ? null : (hist?.project ?? null),
      weight: 10,
      icon: <FolderKanban className="w-5 h-5" />,
      color: "text-teal-700", bg: "bg-teal-50", border: "border-teal-200",
    },
  ];

  const overallScore = isCurrent ? null : (hist?.overall ?? null);
  const scoreLabel = isCurrent ? "Current Score" : "Final Score";

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${isCurrent ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white" : "border-green-200 bg-gradient-to-br from-green-50 to-white"}`}>
      {/* Banner header */}
      <div className={`flex items-center justify-between px-6 py-3 ${isCurrent ? "bg-amber-500" : "bg-green-600"}`}>
        <div className="flex items-center gap-2">
          {isCurrent
            ? <Activity className="w-4 h-4 text-white" />
            : <Lock className="w-4 h-4 text-white" />}
          <span className="text-white font-bold text-sm tracking-wide uppercase">{scoreLabel}</span>
          <span className="text-white/70 text-xs">— Performance Year {year}</span>
        </div>
        {overallScore !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-xs font-medium">Overall Score</span>
            <span className="bg-white text-green-700 font-extrabold text-base px-3 py-0.5 rounded-full">{overallScore}%</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-xs font-medium">Overall Score</span>
            <span className="bg-white/20 text-white font-bold text-sm px-3 py-0.5 rounded-full">In Progress</span>
          </div>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border ${card.border} ${card.bg} px-4 py-4 flex flex-col gap-2`}>
            <div className={`flex items-center gap-2 ${card.color}`}>
              {card.icon}
              <span className="text-xs font-bold uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="flex items-end justify-between">
              <ScoreBadge value={card.score} isCurrent={isCurrent} />
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isCurrent ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                Bobot {card.weight}%
              </span>
            </div>
            <div className="mt-1">
              <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                {card.score !== null ? (
                  <div
                    className={`h-1.5 rounded-full transition-all duration-700 ${isCurrent ? "bg-amber-400" : "bg-green-500"}`}
                    style={{ width: `${card.score}%` }}
                  />
                ) : (
                  <div className="h-1.5 rounded-full bg-gray-200 w-full" />
                )}
              </div>
              <p className={`text-[10px] mt-1 font-medium ${card.score === null ? "text-gray-400 italic" : card.color}`}>
                {card.score === null ? (isCurrent ? "Score being tracked…" : "No data") : scoreLabel}
              </p>
            </div>
          </div>
        ))}
      </div>

      {isCurrent && (
        <div className="flex items-center gap-2 mx-5 mb-5 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <Activity className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">
            Scores are updated in real-time as monthly KPI data is entered. Final scores will be locked at year-end.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const YEARS = ["2026", "2025", "2024", "2023"];

export function MyPerformanceAppraisal() {
  const [activeTab, setActiveTab] = useState<Tab>("KPI");
  const [selectedYear, setSelectedYear] = useState("2026");

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">My Performance Appraisal – {selectedYear}</h1>
          <p className="text-gray-500 text-sm">Review your annual performance results</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-sm font-medium text-gray-700 bg-transparent border-none outline-none cursor-pointer pr-1"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {selectedYear === "2026" ? (
            <div className="px-4 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 font-medium text-sm rounded-full">In Progress</div>
          ) : (
            <div className="px-4 py-1.5 bg-green-50 text-green-700 border border-green-200 font-medium text-sm rounded-full">Done</div>
          )}
        </div>
      </div>

      {/* Score Summary */}
      <ScoreSummarySection year={selectedYear} />

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map(({ id, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === id
                ? "border-[#1A284F] text-[#1A284F] bg-gray-50"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <Icon className={`w-4 h-4 ${activeTab === id ? "text-[#1A284F]" : color}`} />
            {id}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "KPI" && <KPITab />}
      {activeTab === "SMART Goals" && <SMARTGoalsTab />}
      {activeTab === "Appraisal Form" && <AppraisalFormTab />}
      {activeTab === "RCA" && <RCATab />}
      {activeTab === "Project Outside Job Scope" && <ProjectOutsideTab />}
    </div>
  );
}
