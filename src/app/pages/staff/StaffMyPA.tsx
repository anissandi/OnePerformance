// @refresh reset
import { useAppraisalRevision } from "../shared/useAppraisalRevision";
import React, { useEffect, useState } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import {
  TrendingUp, Lightbulb, ClipboardList, SearchCode, ChevronDown, ChevronUp,
  FolderKanban, CheckCircle2, AlertTriangle, Clock, XCircle, Activity, Lock,
  Target, ListChecks, ShieldCheck, ShieldX,
  Paperclip, Eye, Download, FileText, X, MessageSquare,
} from "lucide-react";
import {
  KPI_ITEMS, computeTotal2026, computeKPIAchievement, parseBobotDecimal, loadKPITracking,
} from "../employee/KPIPage";
import { loadEvidenceFiles } from "../shared/kpiEvidenceStore";
import type { StoredEvidenceFile } from "../shared/kpiEvidenceStore";
import { loadMonthlyNotes } from "../shared/kpiMonthlyNotesStore";
import type { MonthlyNoteEntry } from "../shared/kpiMonthlyNotesStore";
import { loadSubmittedGoals, loadCheckInEntries, loadApprovalDecisions } from "../shared/smartGoalsStore";
import { ROWS, SAMPLE_GOALS } from "../employee/SMARTGoals";
import type { SmartGoal } from "../employee/SMARTGoals";
import { FORMS } from "../employee/AppraisalForm";
import { loadAppraisalSelf, loadAllAppraisalApprovers } from "../shared/appraisalFormStore";
import { loadRCASubmissions } from "../shared/rcaStore";
import type { StoredMasalahBlock, StoredRCAActionPlan } from "../shared/rcaStore";
import { loadRCAApprovalDecisions } from "../shared/rcaApprovalStore";
import { useProjectStore, SCOPE_BOBOT } from "../../store/projectStore";
import type { CheckInStatus as ProjectCheckInStatus } from "../../store/projectStore";
import { STAFF_PROFILE } from "../../store/profileStore";
import { resolveEffectiveUserGrouping, useAuthStore } from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { loadUnitScoreWeights, type ScoreWeightColumn } from "../shared/scoringWeightStore";

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "KPI" | "SMART Goals" | "Appraisal Form" | "RCA" | "Project Outside Job Scope";

const TABS: { id: Tab; icon: React.ElementType; color: string }[] = [
  { id: "KPI",                       icon: TrendingUp,   color: "text-blue-600"   },
  { id: "SMART Goals",               icon: Lightbulb,    color: "text-amber-600"  },
  { id: "Appraisal Form",            icon: ClipboardList,color: "text-green-600"  },
  { id: "RCA",                       icon: SearchCode,   color: "text-purple-600" },
  { id: "Project Outside Job Scope", icon: FolderKanban, color: "text-teal-600"   },
];

// ─── Evidence helpers ─────────────────────────────────────────────────────────

function fmtBytesStaff(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function canPreviewStaff(name: string, type: string): boolean {
  return /image\/(jpeg|png|gif|webp)/.test(type)
    || /\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(name)
    || type === "application/pdf";
}

function StaffFileViewerModal({ name, url, mimeType, onClose }: {
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

function StaffEvidenceChip({ file }: { file: StoredEvidenceFile }) {
  const [viewing, setViewing] = React.useState<StoredEvidenceFile | null>(null);
  const viewable = !!file.url && canPreviewStaff(file.name, file.type);
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
        <span className="text-[10px] text-gray-400 shrink-0 ml-0.5">{fmtBytesStaff(file.size)}</span>
        {viewable && <Eye className="w-3 h-3 text-indigo-400 shrink-0" />}
      </button>
      {viewing && <StaffFileViewerModal name={viewing.name} url={viewing.url} mimeType={viewing.type} onClose={() => setViewing(null)} />}
    </>
  );
}

// ─── KPI Tab — live data from KPI Tracking store ─────────────────────────────

const PERSP_COLOR: Record<string, string> = {
  "Finansial":                       "text-blue-700 bg-blue-50",
  "Proses":                          "text-purple-700 bg-purple-50",
  "Environment, Health & Safety":    "text-green-700 bg-green-50",
  "Customer":                        "text-orange-700 bg-orange-50",
  "Learning & Growth":               "text-pink-700 bg-pink-50",
};

function getPctColor(val: string): string {
  if (!val || val === "—") return "text-gray-300 font-normal";
  const n = parseFloat(val.replace(/,/g, "").replace(/%$/, "").trim());
  if (isNaN(n)) return "text-gray-700";
  return n >= 100 ? "text-green-700" : "text-rose-600";
}

function displayMonthLabel(label: string): string {
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
  const currentMonthLabel = months.length > 0 ? displayMonthLabel(months[months.length - 1].label) : null;

  const nilaiColor =
    totalNilai >= 100
      ? { row: "bg-emerald-50 border-emerald-200", label: "text-emerald-800", val: "text-emerald-700", valBg: "bg-emerald-100", tag: "bg-emerald-200/80 text-emerald-700 border-emerald-300/70" }
      : totalNilai >= 75
      ? { row: "bg-indigo-50 border-indigo-200", label: "text-indigo-800", val: "text-indigo-700", valBg: "bg-indigo-100", tag: "bg-indigo-200/80 text-indigo-700 border-indigo-300/70" }
      : totalNilai >= 50
      ? { row: "bg-amber-50 border-amber-200", label: "text-amber-800", val: "text-amber-700", valBg: "bg-amber-100", tag: "bg-amber-200/80 text-amber-700 border-amber-300/70" }
      : { row: "bg-rose-50 border-rose-200", label: "text-rose-800", val: "text-rose-700", valBg: "bg-rose-100", tag: "bg-rose-200/80 text-rose-700 border-rose-300/70" };

  const KPI_COL = { no: 38, persp: 86, kpi: 206, bobot: 50, baseline: 62, target: 62, detail: 158, track: 122, total: 78, ach: 90 };
  const KPI_MIN_MONTH_W = 52;
  const KPI_FIXED_W = KPI_COL.no + KPI_COL.persp + KPI_COL.kpi + KPI_COL.bobot + KPI_COL.baseline + KPI_COL.target + KPI_COL.detail + KPI_COL.track + KPI_COL.total + KPI_COL.ach;
  const colSpanFull = 8 + months.length + 2;
  const minTableW = KPI_FIXED_W + months.length * KPI_MIN_MONTH_W;

  const renderSection = (sec: "A" | "B") =>
    KPI_ITEMS.filter((k) => k.section === sec).map((kpi, kpiIdx) => {
      const rs = kpi.subRows.length;
      const ach = computeKPIAchievement(kpi, cellsMap, months);
      const cappedAch = ach !== null ? Math.min(ach, 100) : null;
      const score = cappedAch !== null ? (cappedAch / 100) * parseBobotDecimal(kpi.bobot) * 100 : null;
      const achColor = ach !== null ? (ach >= 100 ? "text-green-700" : "text-rose-600") : "text-gray-300";
      const rowBg = kpiIdx % 2 === 0 ? "bg-white" : "bg-slate-50/60";

      return kpi.subRows.map((sub, si) => {
        const isFirst = si === 0;
        const isComputed = !!sub.compute;
        const isTarget = !sub.compute && sub.label.toLowerCase().startsWith("target");
        const totalVal = computeTotal2026(kpi, si, cellsMap, months);
        const totalColor = isComputed || sub.bold ? getPctColor(totalVal) : totalVal === "—" ? "text-gray-300" : "text-blue-800";

        return (
          <tr key={`${kpi.no}-${si}`} className={rowBg}>
            {isFirst && (
              <>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center text-xs font-semibold text-gray-400 align-middle">
                  {kpi.no}
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 align-middle" style={{ overflow: "hidden" }}>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-block leading-snug break-words ${PERSP_COLOR[kpi.perspektif] ?? "text-gray-700 bg-gray-100"}`}>
                    {kpi.perspektif}
                  </span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-3 text-xs font-medium text-gray-800 leading-snug align-middle" style={{ overflow: "hidden" }}>
                  {kpi.kpi}
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center align-middle">
                  <span className="px-1.5 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{kpi.bobot}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center align-middle">
                  <span className="text-[10px] font-semibold text-gray-600">{kpi.baseline2025 || "—"}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-2 text-center align-middle">
                  <span className="text-[10px] font-bold text-[#1A284F]">{kpi.target2026 || "—"}</span>
                </td>
                <td rowSpan={rs} className="border border-gray-200 py-2 px-3 align-top" style={{ overflow: "hidden" }}>
                  <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-4" style={{ wordBreak: "break-word" }}>{kpi.detailFormula || "—"}</p>
                </td>
              </>
            )}

            <td className={`border border-gray-200 py-1 px-3 text-[10px] align-middle ${
              isComputed ? "bg-emerald-50/80 text-emerald-700" : isTarget ? "bg-sky-50/70 text-sky-700 font-semibold" : sub.bold ? "bg-green-50/60 font-bold text-gray-800" : "text-gray-600"
            }`}>
              {sub.label}
              {isComputed && <span className="ml-1 text-[9px] text-emerald-500 font-normal">(auto)</span>}
            </td>

            {months.map((m) => {
              const cellKey = `${kpi.no}__${si}`;
              let val: string;
              if (!sub.compute) {
                val = cellsMap[m.id]?.[cellKey] ?? "—";
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
                } ${isEmpty ? "bg-red-50/60" : ""}`}>
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

            <td className={`border border-gray-200 text-center py-1 px-2 text-[10px] ${
              isComputed ? "bg-blue-50/80" : sub.bold ? "bg-blue-50/40" : "bg-blue-50/20"
            }`}>
              <span className={`${sub.bold ? "font-bold" : ""} ${totalColor}`}>{totalVal}</span>
            </td>

            {isFirst && (
              <td rowSpan={rs} className="border border-gray-200 text-center bg-[#0a2a4a]/5 py-2 px-2 align-middle">
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">
          Menampilkan data untuk <span className="font-semibold text-[#1A284F]">{months.length}</span> bulan.
          {months.length < 12 && (
            <span className="ml-1 text-gray-400">Kolom bulan baru ditambahkan otomatis saat data tersedia.</span>
          )}
        </p>
        {months.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {months.map((m) => (
              <span key={m.id} className="text-[10px] font-semibold bg-[#1A284F]/8 text-[#1A284F] px-2 py-0.5 rounded-full border border-[#1A284F]/15">
                {displayMonthLabel(m.label)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm bg-white" style={{ maxHeight: "calc(100vh - 340px)" }}>
        <table className="w-full border-collapse text-xs" style={{ minWidth: minTableW }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#1A284F] text-white">
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold" style={{ minWidth: KPI_COL.no, width: KPI_COL.no }}>No</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-left text-xs font-semibold" style={{ minWidth: KPI_COL.persp, width: KPI_COL.persp }}>Perspektif</th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-left text-xs font-semibold" style={{ minWidth: KPI_COL.kpi, width: KPI_COL.kpi }}>KPI</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold" style={{ minWidth: KPI_COL.bobot, width: KPI_COL.bobot }}>Bobot</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold" style={{ minWidth: KPI_COL.baseline, width: KPI_COL.baseline }}>Baseline<br /><span className="text-[9px] font-normal text-white/60">2025</span></th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold" style={{ minWidth: KPI_COL.target, width: KPI_COL.target }}>Target<br /><span className="text-[9px] font-normal text-white/60">2026</span></th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-left text-xs font-semibold" style={{ minWidth: KPI_COL.detail, width: KPI_COL.detail }}>Detail Formula</th>
              <th className="border border-[#1A284F]/30 py-3 px-3 text-center text-xs font-semibold" style={{ minWidth: KPI_COL.track, width: KPI_COL.track }}>Tracking</th>
              {months.map((m) => (
                <th key={m.id} className="border border-[#1A284F]/30 py-3 px-1 text-center text-xs font-semibold whitespace-nowrap" style={{ minWidth: KPI_MIN_MONTH_W, width: KPI_MIN_MONTH_W }}>
                  {displayMonthLabel(m.label)}
                </th>
              ))}
              {months.length === 0 && (
                <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-[10px] font-medium text-white/40 italic" style={{ minWidth: 60 }}>
                  — bulan —
                </th>
              )}
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold bg-[#0F3460]" style={{ minWidth: KPI_COL.total, width: KPI_COL.total }}>Total</th>
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center text-xs font-semibold bg-[#0a2a4a]" style={{ minWidth: KPI_COL.ach, width: KPI_COL.ach }}>Achievement</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={colSpanFull - 1} className="py-2 px-4 text-white text-[11px] font-bold uppercase tracking-widest border" style={{ background: "#1565C0", borderColor: "#1565C0" }}>
                A. Objective KPI — Bobot 20%
              </td>
              <td className="py-2 px-2 text-center text-white text-[11px] font-bold border" style={{ background: "#1565C0", borderColor: "#1565C0" }}>
                {KPI_ITEMS.some((k) => k.section === "A" && computeKPIAchievement(k, cellsMap, months) !== null) ? scoreA.toFixed(2) + "%" : "—"}
              </td>
            </tr>
            {renderSection("A")}
            <tr>
              <td colSpan={colSpanFull - 1} className="py-2 px-4 text-white text-[11px] font-bold uppercase tracking-widest border" style={{ background: "#1976D2", borderColor: "#1976D2" }}>
                B. Functional KPI — Bobot 80%
              </td>
              <td className="py-2 px-2 text-center text-white text-[11px] font-bold border" style={{ background: "#1976D2", borderColor: "#1976D2" }}>
                {KPI_ITEMS.some((k) => k.section === "B" && computeKPIAchievement(k, cellsMap, months) !== null) ? scoreB.toFixed(2) + "%" : "—"}
              </td>
            </tr>
            {renderSection("B")}
            <tr>
              <td colSpan={colSpanFull} className="py-1 border border-[#1A284F]/10 bg-[#1A284F]/5" />
            </tr>
            {([
              { label: "Total KPI Items", value: `${KPI_ITEMS.length} KPI` },
              { label: "Total Bobot KPI", value: `${totalBobot.toFixed(0)}%` },
            ]).map(({ label, value }) => (
              <tr key={label} className="bg-[#1A284F]/5">
                <td colSpan={colSpanFull - 1} className="border border-gray-200 py-2 px-4 text-xs font-bold text-[#1A284F]">{label}</td>
                <td className="border border-gray-200 py-2 px-3 text-center text-xs font-bold text-[#1A284F]">{value}</td>
              </tr>
            ))}
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
                    <span className="text-[10px] font-bold text-[#1A284F] uppercase tracking-widest">{displayMonthLabel(m.label)}</span>
                  </div>
                  <div className="flex-1 p-3">
                    {files.length === 0 ? (
                      <p className="text-[11px] text-gray-300 italic">Tidak ada evidence</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {files.map((f) => <StaffEvidenceChip key={f.id} file={f} />)}
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
                        {displayMonthLabel(m.label)}
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

// ─── Approval History Section ────────────────────────────────────────────────

const APPROVAL_STATUS_CONFIG = {
  "Approved":       { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700",  dot: "bg-green-500",  label: "Disetujui" },
  "Needs Revision": { bg: "bg-rose-50",   border: "border-rose-200",   text: "text-rose-700",   dot: "bg-rose-500",   label: "Perlu Revisi" },
  "Pending Review": { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-400",  label: "Menunggu Review" },
};

function ApprovalHistorySection() {
  const { activeUser, allUsers } = useAuthStore();
  const decisions = React.useMemo(() => loadApprovalDecisions(), []);
  // Filter to employee E002 (the synced employee) or show all if any
  const myDecisions = decisions.filter(
    (d) => d.employeeId.replace(/-/g, "").toLowerCase() === activeUser.employeeId.replace(/-/g, "").toLowerCase(),
  );
  const ap1User = allUsers.find((u) => (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase()) || u.employeeId.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase());
  const ap2User = allUsers.find((u) => (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase()) || u.employeeId.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase());
  // Always show at least the approver slots (filled or pending)
  const approverSlots = [
    { level: 1, name: ap1User?.name ?? (activeUser.regNoAp1 || "—"), role: "Approver 1" },
    { level: 2, name: ap2User?.name ?? (activeUser.regNoAp2 || "—"), role: "Approver 2" },
  ];

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <CheckCircle2 className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">History Penilaian Approver</span>
        <span className="text-[10px] text-white/50 font-medium">SMART Goals 2026</span>
      </div>

      {/* Timeline */}
      <div className="bg-white p-5">
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[18px] top-5 bottom-5 w-px bg-gray-200" />

          <div className="flex flex-col gap-0">
            {approverSlots.map((slot, idx) => {
              const decision = myDecisions.find((d) => d.approverLevel === slot.level);
              const cfg = APPROVAL_STATUS_CONFIG[decision?.status ?? "Pending Review"];
              const isLast = idx === approverSlots.length - 1;

              return (
                <div key={slot.level} className={`relative flex gap-4 ${isLast ? "" : "pb-5"}`}>
                  {/* Dot */}
                  <div className={`relative z-10 w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    decision ? `${cfg.bg} ${cfg.border}` : "bg-gray-50 border-gray-200"
                  }`}>
                    {decision?.status === "Approved" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : decision?.status === "Needs Revision" ? (
                      <XCircle className="w-4 h-4 text-rose-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1.5">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 leading-tight">
                          {decision?.approverName ?? slot.name}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {decision?.approverRole ?? slot.role} · Approver {slot.level}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        {decision?.reviewedDate && (
                          <span className="text-[10px] text-gray-400">{decision.reviewedDate}</span>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    {decision && (
                      <div className="mt-2 flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <div className="flex flex-col shrink-0">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400">Nilai / Score</span>
                          {decision.score ? (
                            <span className={`text-2xl font-black leading-none ${
                              parseFloat(decision.score) >= 90 ? "text-emerald-700"
                              : parseFloat(decision.score) >= 75 ? "text-blue-700"
                              : parseFloat(decision.score) >= 60 ? "text-amber-700"
                              : "text-rose-600"
                            }`}>
                              {decision.score}
                              <span className="text-xs font-semibold text-gray-400 ml-0.5">/100</span>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Belum ada nilai</span>
                          )}
                        </div>
                        {decision.score && (
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(parseFloat(decision.score) || 0, 100)}%`,
                                background: `hsl(${Math.round((parseFloat(decision.score) || 0) * 1.2)}, 65%, 42%)`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {decision?.feedback ? (
                      <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Catatan / Feedback</p>
                        <p className="text-xs text-gray-700 leading-relaxed">{decision.feedback}</p>
                      </div>
                    ) : (
                      <div className="mt-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2 min-h-[36px] flex items-center">
                        <span className="text-xs text-gray-400 italic">
                          {decision ? "Tidak ada catatan." : "Menunggu review dari approver."}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SMART Goals Tab — live data from store ──────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  "Belum dilaksanakan":  "bg-gray-100 text-gray-600",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-700",
  "Selesai":             "bg-green-100 text-green-700",
  "Batal":               "bg-red-100 text-red-600",
  "-":                   "bg-gray-50 text-gray-400",
};

function SMARTGoalsTab() {
  const goals: SmartGoal[] = React.useMemo(() => loadSubmittedGoals() ?? [], []);
  const checkIns = React.useMemo(() => loadCheckInEntries(), []);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [smartExpanded, setSmartExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {goals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <Lightbulb className="w-7 h-7 text-amber-500" />
          </div>
          <p className="text-sm text-gray-500">Belum ada SMART Goals yang disubmit.</p>
        </div>
      )}

      {goals.map((goal, idx) => {
        const ci = checkIns.find((e) => e.goalId === goal.id);
        const isOpen = expanded === goal.id;
        const isSmartOpen = smartExpanded === goal.id;
        const achievementStatus = ci?.targetAchievementStatus ?? "";
        const achievement = ci?.achievement ?? "";

        const apDone = goal.actionPlans.filter((ap) => {
          const st = ci?.actionPlanStatuses?.[ap.id];
          return st === "Selesai";
        }).length;
        const apTotal = goal.actionPlans.length;
        const overallPct = apTotal > 0
          ? Math.round(goal.actionPlans.reduce((s, ap) => s + (ci?.actionPlanProgress?.[ap.id] ?? 0), 0) / apTotal)
          : 0;

        const statusColor =
          achievementStatus === "Tercapai"       ? "bg-green-50 text-green-700 border-green-200"
          : achievementStatus === "Tidak Tercapai" ? "bg-red-50 text-red-600 border-red-200"
          : "bg-gray-50 text-gray-400 border-gray-200";

        return (
          <div key={goal.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : goal.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[#1A284F] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <span className="font-semibold text-gray-800 truncate">{goal.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {achievementStatus && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
                    {achievementStatus}
                  </span>
                )}
                {apTotal > 0 && (
                  <span className="text-[10px] text-gray-500 font-medium hidden sm:block">
                    {apDone}/{apTotal} action plans
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100">
                {/* Progress summary bar */}
                {apTotal > 0 && (
                  <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide shrink-0">Progress Action Plans</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${overallPct}%`,
                            background: `hsl(${Math.round(overallPct * 1.2)}, 65%, 42%)`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 shrink-0">{overallPct}%</span>
                    </div>
                    {achievement && (
                      <p className="mt-1.5 text-[11px] text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-700">Capaian: </span>{achievement}
                      </p>
                    )}
                    {achievementStatus === "Tidak Tercapai" && ci?.alasanTidakTercapai && (
                      <p className="mt-1 text-[11px] text-red-600 leading-relaxed">
                        <span className="font-semibold">Alasan: </span>{ci.alasanTidakTercapai}
                      </p>
                    )}
                  </div>
                )}

                {/* SMART fields (collapsible) */}
                <div>
                  <button
                    onClick={() => setSmartExpanded(isSmartOpen ? null : goal.id)}
                    className="w-full flex items-center gap-2 px-5 py-2.5 text-left bg-[#1A284F]/5 hover:bg-[#1A284F]/10 transition-colors"
                  >
                    <Target className="w-3.5 h-3.5 text-[#1A284F]" />
                    <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">SMART Fields</span>
                    {isSmartOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#1A284F] ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-[#1A284F] ml-auto" />}
                  </button>
                  {isSmartOpen && (
                    <div className="divide-y divide-gray-50">
                      {ROWS.map((row) => (
                        <div key={row.key} className="px-5 py-3 grid grid-cols-[180px_1fr] gap-4">
                          <p className="text-xs font-bold text-[#1A284F] uppercase tracking-wide pt-0.5">{row.title}</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{(goal as any)[row.key] || "—"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Plans */}
                {apTotal > 0 && (
                  <div className="px-5 py-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <ListChecks className="w-4 h-4 text-[#1A284F]" />
                      <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Action Plans</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {goal.actionPlans.map((ap) => {
                        const st = ci?.actionPlanStatuses?.[ap.id] ?? "-";
                        const pct = ci?.actionPlanProgress?.[ap.id] ?? 0;
                        const kendala = ci?.actionPlanKendala?.[ap.id] ?? "";
                        const badgeCls = STATUS_BADGE[st] ?? "bg-gray-50 text-gray-400";
                        return (
                          <div key={ap.id} className="bg-gray-50 rounded-lg px-3 py-2.5 flex flex-col gap-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-gray-700 leading-snug flex-1">{ap.description}</p>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeCls}`}>{st}</span>
                            </div>
                            {/* progress bar */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    background: `hsl(${Math.round(pct * 1.2)}, 65%, 42%)`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-500 font-semibold w-7 text-right">{pct}%</span>
                            </div>
                            {kendala && (
                              <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 leading-snug">
                                <span className="font-semibold">Kendala: </span>{kendala}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* History Penilaian Approver */}
      <ApprovalHistorySection />
    </div>
  );
}

// ─── Appraisal Form Tab — live data ──────────────────────────────────────────

function scoreColor(s: number | null | undefined): string {
  if (!s) return "text-gray-300";
  return s >= 4 ? "text-emerald-700" : s >= 3 ? "text-blue-700" : s >= 2 ? "text-amber-700" : "text-rose-600";
}

function ScoreDot({ value }: { value: number | null }) {
  const colors = ["", "bg-rose-400", "bg-amber-400", "bg-blue-400", "bg-emerald-400", "bg-emerald-600"];
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map((n) => (
        <span key={n} className={`w-5 h-5 rounded-full border text-[10px] font-bold flex items-center justify-center transition-all ${
          value === n ? `${colors[n]} text-white border-transparent` : "border-gray-200 text-gray-300"
        }`}>{n}</span>
      ))}
    </div>
  );
}

function AppraisalFormTab() {
  const selfData  = React.useMemo(() => loadAppraisalSelf(), []);
  const approvers = React.useMemo(() => loadAllAppraisalApprovers(), []);
  const [expandedForm, setExpandedForm] = useState<string | null>(null);

  const selfFormMap = React.useMemo(() => {
    const m: Record<string, { formId: string; ratings: Record<string, number>; avgScore: number }> = {};
    selfData?.forms.forEach((f) => { m[f.formId] = f; });
    return m;
  }, [selfData]);

  const approver1 = approvers.find((a) => a.approverLevel === 1);
  const approver2 = approvers.find((a) => a.approverLevel === 2);

  const appr1FormMap = React.useMemo(() => {
    const m: Record<string, { formId: string; ratings: Record<string, number>; avgScore: number }> = {};
    approver1?.forms.forEach((f) => { m[f.formId] = f; });
    return m;
  }, [approver1]);

  const appr2FormMap = React.useMemo(() => {
    const m: Record<string, { formId: string; ratings: Record<string, number>; avgScore: number }> = {};
    approver2?.forms.forEach((f) => { m[f.formId] = f; });
    return m;
  }, [approver2]);

  const selfWeighted = selfData?.forms && selfData.forms.some((f) => f.avgScore > 0)
    ? FORMS.reduce((s, f) => { const e = selfData.forms.find((sf) => sf.formId === f.id); return s + (e?.avgScore ?? 0) * (f.percentage / 100); }, 0)
    : null;
  const appr1Weighted = approver1 && approver1.forms.some((f) => f.avgScore > 0)
    ? FORMS.reduce((s, f) => { const e = approver1.forms.find((af) => af.formId === f.id); return s + (e?.avgScore ?? 0) * (f.percentage / 100); }, 0)
    : null;
  const appr2Weighted = approver2 && approver2.forms.some((f) => f.avgScore > 0)
    ? FORMS.reduce((s, f) => { const e = approver2.forms.find((af) => af.formId === f.id); return s + (e?.avgScore ?? 0) * (f.percentage / 100); }, 0)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {FORMS.map((f) => {
        const isOpen     = expandedForm === f.id;
        const selfEntry  = selfFormMap[f.id];
        const appr1Entry = appr1FormMap[f.id];
        const appr2Entry = appr2FormMap[f.id];
        const selfAvg    = selfEntry?.avgScore ?? null;
        const appr1Avg   = appr1Entry?.avgScore ?? null;
        const appr2Avg   = appr2Entry?.avgScore ?? null;

        return (
          <div key={f.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {/* Collapsible header */}
            <button
              onClick={() => setExpandedForm(isOpen ? null : f.id)}
              className="w-full flex items-center gap-3 bg-[#1A284F] px-5 py-3 text-left hover:bg-[#131d3b] transition-colors"
            >
              <span className="text-white font-bold text-sm flex-1">{f.tab}</span>
              <span className="text-white/60 text-xs hidden sm:block">— {f.subtitle}</span>
              <span className="text-[10px] font-semibold bg-[#C69A45] text-white px-2.5 py-0.5 rounded">{f.percentage}%</span>
              {(selfAvg != null && selfAvg > 0) && (
                <span className="text-[10px] text-white/70 font-medium hidden sm:inline">
                  Diri: <span className="font-bold text-white">{selfAvg.toFixed(2)}</span>
                  {appr1Avg != null && appr1Avg > 0 && <> · A1: <span className="font-bold text-amber-300">{appr1Avg.toFixed(2)}</span></>}
                  {appr2Avg != null && appr2Avg > 0 && <> · A2: <span className="font-bold text-orange-300">{appr2Avg.toFixed(2)}</span></>}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-white/70 transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-2 px-3 text-left text-gray-600 font-semibold w-8">No</th>
                    <th className="py-2 px-3 text-left text-gray-600 font-semibold">Aspek Penilaian</th>
                    <th className="py-2 px-4 text-center text-blue-700 font-semibold whitespace-nowrap">Evaluasi Diri</th>
                    <th className="py-2 px-4 text-center text-[#1A284F] font-semibold whitespace-nowrap">
                      Evaluasi Atasan 1
                      {approver1 && <div className="text-[9px] font-normal text-[#1A284F]/60 leading-none mt-0.5">{approver1.approverRole}</div>}
                    </th>
                    <th className="py-2 px-4 text-center text-orange-700 font-semibold whitespace-nowrap">
                      Evaluasi Atasan 2
                      {approver2 && <div className="text-[9px] font-normal text-orange-700/60 leading-none mt-0.5">{approver2.approverRole}</div>}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {f.items.map((item) => {
                    const rKey      = `${f.id}__${item.no}`;
                    const selfScore  = selfEntry?.ratings?.[rKey] ?? null;
                    const appr1Score = appr1Entry?.ratings?.[rKey] ?? null;
                    const appr2Score = appr2Entry?.ratings?.[rKey] ?? null;
                    return (
                      <tr key={item.no} className="hover:bg-gray-50/40 transition-colors">
                        <td className="py-2.5 px-3 text-gray-400 align-top">{item.no}</td>
                        <td className="py-2.5 px-3 text-gray-700 leading-snug align-top">
                          {item.label && <span className="font-semibold italic">{item.label} </span>}
                          {item.description}
                        </td>
                        <td className="py-2.5 px-4 align-middle text-center">
                          {selfScore != null ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-black ${scoreColor(selfScore)}`}>{selfScore}</span>
                              <ScoreDot value={selfScore} />
                            </div>
                          ) : <span className="text-gray-300 text-xs italic">—</span>}
                        </td>
                        <td className="py-2.5 px-4 align-middle text-center">
                          {appr1Score != null ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-black ${scoreColor(appr1Score)}`}>{appr1Score}</span>
                              <ScoreDot value={appr1Score} />
                            </div>
                          ) : <span className="text-gray-300 text-xs italic">Belum dinilai</span>}
                        </td>
                        <td className="py-2.5 px-4 align-middle text-center">
                          {appr2Score != null ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-black ${scoreColor(appr2Score)}`}>{appr2Score}</span>
                              <ScoreDot value={appr2Score} />
                            </div>
                          ) : <span className="text-gray-300 text-xs italic">Belum dinilai</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Avg row */}
                  <tr className="bg-[#1A284F]/5 font-bold">
                    <td colSpan={2} className="py-2 px-3 text-[#1A284F] text-xs font-bold text-right">Nilai Rata-rata</td>
                    <td className="py-2 px-4 text-center">
                      <span className={`text-sm font-black ${selfAvg != null && selfAvg > 0 ? scoreColor(selfAvg) : "text-gray-300"}`}>
                        {selfAvg != null && selfAvg > 0 ? selfAvg.toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`text-sm font-black ${appr1Avg != null && appr1Avg > 0 ? scoreColor(appr1Avg) : "text-gray-300"}`}>
                        {appr1Avg != null && appr1Avg > 0 ? appr1Avg.toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`text-sm font-black ${appr2Avg != null && appr2Avg > 0 ? scoreColor(appr2Avg) : "text-gray-300"}`}>
                        {appr2Avg != null && appr2Avg > 0 ? appr2Avg.toFixed(2) : "—"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>}
          </div>
        );
      })}

      {/* Summary cards — 4 columns like Managerial Skill */}
      <div className="bg-[#1A284F] rounded-xl px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
        <div>
          <p className="text-white/60 text-xs font-medium uppercase tracking-wide">Bobot</p>
          <p className="text-white font-bold text-xs mt-0.5 leading-snug">{FORMS.map((f) => `${f.tab} ${f.percentage}%`).join(" · ")}</p>
        </div>
        <div className="text-center">
          <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Evaluasi Diri</p>
          {selfWeighted != null ? (
            <p className={`text-2xl font-black ${scoreColor(selfWeighted)} brightness-150`}>{selfWeighted.toFixed(2)}</p>
          ) : <p className="text-gray-500 text-xs italic">Belum diisi</p>}
        </div>
        <div className="text-center">
          <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Evaluasi Atasan 1</p>
          {appr1Weighted != null ? (
            <p className={`text-2xl font-black ${scoreColor(appr1Weighted)} brightness-150`}>{appr1Weighted.toFixed(2)}</p>
          ) : <p className="text-gray-500 text-xs italic">Belum dinilai</p>}
        </div>
        <div className="text-center">
          <p className="text-white/60 text-[10px] font-semibold uppercase tracking-wide mb-1">Evaluasi Atasan 2</p>
          {appr2Weighted != null ? (
            <p className={`text-2xl font-black ${scoreColor(appr2Weighted)} brightness-150`}>{appr2Weighted.toFixed(2)}</p>
          ) : <p className="text-gray-500 text-xs italic">Belum dinilai</p>}
        </div>
      </div>

      {/* ── History Assessment Section ── */}
      <AppraisalHistorySection selfData={selfData} approvers={approvers} />
    </div>
  );
}

// ─── Appraisal Assessment History ────────────────────────────────────────────

function AppraisalHistorySection({
  selfData, approvers,
}: {
  selfData: ReturnType<typeof loadAppraisalSelf>;
  approvers: ReturnType<typeof loadAllAppraisalApprovers>;
}) {
  const historyRows: { role: string; name: string; type: "self" | "approver"; level?: number; forms: { formId: string; avgScore: number }[]; comment: string; date: string; }[] = [];

  if (selfData) {
    historyRows.push({
      role: "Karyawan", name: "Diri Sendiri", type: "self",
      forms: selfData.forms.map((f) => ({ formId: f.formId, avgScore: f.avgScore })),
      comment: "", date: selfData.submittedAt,
    });
  }
  approvers.forEach((a) => {
    historyRows.push({
      role: a.approverRole, name: a.approverName, type: "approver", level: a.approverLevel,
      forms: a.forms.map((f) => ({ formId: f.formId, avgScore: f.avgScore })),
      comment: a.overallComment, date: a.reviewedDate,
    });
  });

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <ClipboardList className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">History Penilaian Appraisal Form</span>
        <span className="text-[10px] text-white/50">2026</span>
      </div>

      {historyRows.length === 0 ? (
        <div className="bg-white px-5 py-8 flex flex-col items-center gap-2 text-center">
          <ClipboardList className="w-8 h-8 text-gray-200" />
          <p className="text-sm text-gray-400 italic">Belum ada penilaian yang disubmit.</p>
        </div>
      ) : (
        <div className="bg-white divide-y divide-gray-100">
          {historyRows.map((row, idx) => {
            const overallScore = FORMS.reduce((s, f) => {
              const fe = row.forms.find((rf) => rf.formId === f.id);
              return s + (fe?.avgScore ?? 0) * (f.percentage / 100);
            }, 0);
            const sc = scoreColor(overallScore > 0 ? overallScore : null);

            return (
              <div key={idx} className="px-5 py-4 flex flex-col gap-3">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${row.type === "self" ? "bg-blue-50 text-blue-700" : "bg-[#1A284F]/10 text-[#1A284F]"}`}>
                      {row.type === "self"
                        ? <span className="text-[10px] font-black">ME</span>
                        : <span className="text-[10px] font-black">A{row.level}</span>}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{row.name}</p>
                      <p className="text-[11px] text-gray-500">{row.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {overallScore > 0 && (
                      <div className="text-right">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Weighted Score</p>
                        <p className={`text-xl font-black leading-tight ${sc}`}>{overallScore.toFixed(2)}</p>
                      </div>
                    )}
                    {row.date && <span className="text-[10px] text-gray-400">{row.date}</span>}
                  </div>
                </div>

                {/* Per-form pills */}
                {row.forms.some((f) => f.avgScore > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {FORMS.map((f) => {
                      const fe = row.forms.find((rf) => rf.formId === f.id);
                      if (!fe || fe.avgScore === 0) return null;
                      return (
                        <div key={f.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-gray-500 font-semibold">{f.tab}</span>
                          <span className={`text-xs font-black ${scoreColor(fe.avgScore)}`}>{fe.avgScore.toFixed(2)}</span>
                          <span className="text-[9px] text-gray-400">({f.percentage}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Comment */}
                {row.comment && (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Komentar</p>
                    <p className="text-xs text-gray-700 leading-relaxed">{row.comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── RCA Tab — live data ──────────────────────────────────────────────────────

const RCA_STATUS_STYLE: Record<string, string> = {
  "Belum dilaksanakan":  "bg-red-50 text-red-700",
  "Sedang dilaksanakan": "bg-amber-50 text-amber-700",
  "Selesai":             "bg-green-50 text-green-700",
  "Ditunda":             "bg-purple-50 text-purple-700",
  "Dibatalkan":          "bg-red-100 text-red-700",
};

const RCA_APPROVAL_STYLE: Record<string, string> = {
  "Pending-Approver 1":    "bg-amber-50 text-amber-700 border-amber-200",
  "Pending-Approver 2":    "bg-blue-50 text-blue-700 border-blue-200",
  "Assessed-Approver 1":   "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Approved":              "bg-green-50 text-green-700 border-green-200",
  "Closed":                "bg-green-100 text-green-800 border-green-300",
  "Revision":              "bg-red-50 text-red-700 border-red-200",
};

function parseMasalahFactor(m: string) {
  const isInternal  = m.startsWith("[Faktor Internal]");
  const isEksternal = m.startsWith("[Faktor Eksternal]");
  const hasFactor   = isInternal || isEksternal;
  const bodyText    = hasFactor ? m.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "") : m;
  const factorLabel = isInternal ? "Faktor Internal" : isEksternal ? "Faktor Eksternal" : null;
  return { hasFactor, isInternal, bodyText, factorLabel };
}

function RCASubmissionCard({
  sub, no,
}: {
  sub: ReturnType<typeof loadRCASubmissions>[number];
  no: number;
}) {
  const [open, setOpen] = useState(false);
  const blocks: StoredMasalahBlock[] = sub.masalahBlocks && sub.masalahBlocks.length > 0
    ? sub.masalahBlocks
    : [{ id: "legacy", masalahUtama: sub.masalahUtama?.[0] ?? "", kenapaA: sub.kenapaA, kenapaB: sub.kenapaB, kenapaC: sub.kenapaC, actionPlans: sub.actionPlans as StoredRCAActionPlan[] }];

  const totalAPs = blocks.reduce((s, b) => s + b.actionPlans.length, 0);
  const doneAPs  = blocks.reduce((s, b) => s + b.actionPlans.filter((a) => a.status === "Selesai").length, 0);
  const pct      = totalAPs > 0 ? Math.round((doneAPs / totalAPs) * 100) : 0;
  const approvalStatus = sub.approvalStatus ?? "Pending-Approver 1";
  const approvalCls = RCA_APPROVAL_STYLE[approvalStatus] ?? "bg-gray-50 text-gray-700 border-gray-200";

  const th = "border border-[#1A284F]/30 py-2 px-2.5 text-center font-semibold text-[10px] whitespace-nowrap";
  const tdLeft = "border border-gray-200 align-top py-2 px-2.5 bg-white text-xs text-gray-700 leading-relaxed";

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-[#1A284F] hover:bg-[#131d3b] transition-colors text-left"
      >
        <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-[11px] font-bold shrink-0">{no}</span>
        <span className="text-white font-semibold text-sm flex-1">{sub.kpiIndicator}</span>
        <span className="text-[10px] text-white/60 hidden sm:block">{sub.monthLabel || sub.periode} {sub.year}</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${approvalCls} shrink-0`}>{approvalStatus}</span>
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-16 bg-white/20 rounded-full h-1.5 overflow-hidden">
            <div className={`h-1.5 rounded-full ${pct === 100 ? "bg-green-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-white/70 font-bold">{pct}%</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-white/60 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full" style={{ minWidth: 1600 }}>
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className={th} style={{ minWidth: 36 }}>No</th>
                <th className={th} style={{ minWidth: 70 }}>Periode</th>
                <th className={th} style={{ minWidth: 130 }}>KPI</th>
                <th className={th} style={{ minWidth: 80 }}>Satuan</th>
                <th className={th} style={{ minWidth: 72 }}>Baseline</th>
                <th className={th} style={{ minWidth: 68 }}>Target</th>
                <th className={th} style={{ minWidth: 68 }}>Actual</th>
                <th className={th} style={{ minWidth: 160 }}>Masalah Utama (A)</th>
                <th className={th} style={{ minWidth: 140 }}>Kenapa A? (B)</th>
                <th className={th} style={{ minWidth: 140 }}>Kenapa B? (C)</th>
                <th className={th} style={{ minWidth: 140 }}>Kenapa C? (D)</th>
                <th className={th} style={{ minWidth: 160 }}>Action Plan</th>
                <th className={th} style={{ minWidth: 100 }}>Target Penyelesaian</th>
                <th className={th} style={{ minWidth: 100 }}>PIC</th>
                <th className={th} style={{ minWidth: 110 }}>Status Perbaikan</th>
                <th className={th} style={{ minWidth: 140 }}>Keterangan</th>
                <th className={th} style={{ minWidth: 140 }}>Output</th>
              </tr>
            </thead>
            <tbody>
              {blocks.flatMap((block, bi) => {
                const { isInternal, bodyText, factorLabel } = parseMasalahFactor(block.masalahUtama);
                const aps = block.actionPlans.length > 0 ? block.actionPlans : [null as StoredRCAActionPlan | null];
                const blockRows = aps.length;
                const totalItemRows = blocks.reduce((s, b) => s + Math.max(1, b.actionPlans.length), 0);
                return aps.map((ap, ai) => (
                  <tr key={`${block.id}_${ai}`} className="border-t border-gray-100">
                    {bi === 0 && ai === 0 && (
                      <>
                        <td rowSpan={totalItemRows} className={`${tdLeft} text-center font-semibold text-gray-500`}>{no}</td>
                        <td rowSpan={totalItemRows} className={`${tdLeft} text-center`}>
                          <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[10px] font-bold">{sub.monthLabel || sub.periode}</span>
                        </td>
                        <td rowSpan={totalItemRows} className={`${tdLeft} font-medium text-gray-800`}>{sub.kpiIndicator}</td>
                        <td rowSpan={totalItemRows} className={tdLeft}>{sub.satuan || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdLeft} italic text-gray-400`}>{sub.baseline || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdLeft} text-center font-bold text-[#1A284F]`}>{sub.targetMonthly || "—"}</td>
                        <td rowSpan={totalItemRows} className={`${tdLeft} text-center font-bold`}>{sub.actual || "—"}</td>
                      </>
                    )}
                    {ai === 0 && (
                      <>
                        <td rowSpan={blockRows} className={tdLeft}>
                          {factorLabel && (
                            <span className={`inline-block mb-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${isInternal ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                              {factorLabel}
                            </span>
                          )}
                          <p>{bodyText || "—"}</p>
                        </td>
                        <td rowSpan={blockRows} className={tdLeft}>{block.kenapaA || "—"}</td>
                        <td rowSpan={blockRows} className={tdLeft}>{block.kenapaB || "—"}</td>
                        <td rowSpan={blockRows} className={tdLeft}>{block.kenapaC || "—"}</td>
                      </>
                    )}
                    {ap ? (
                      <>
                        <td className="border border-gray-200 py-2 px-2.5 text-gray-700 leading-relaxed bg-blue-50/20 text-xs">{ap.action || "—"}</td>
                        <td className="border border-gray-200 py-2 px-2.5 text-center text-gray-600 bg-blue-50/20 text-xs">{ap.targetDate || "—"}</td>
                        <td className="border border-gray-200 py-2 px-2.5 text-gray-600 bg-blue-50/20 text-xs">{ap.pic || "—"}</td>
                        <td className="border border-gray-200 py-2 px-2.5 text-center bg-blue-50/20">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${RCA_STATUS_STYLE[ap.status] ?? "bg-gray-50 text-gray-600"}`}>{ap.status}</span>
                        </td>
                        <td className="border border-gray-200 py-2 px-2.5 text-gray-600 bg-blue-50/20 text-xs">
                          {ap.keterangan && ap.keterangan.length > 0
                            ? <ul>{ap.keterangan.map((k, ki) => <li key={ki} className="text-[10px] leading-relaxed">• {k}</li>)}</ul>
                            : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                        <td className="border border-gray-200 py-2 px-2.5 text-gray-600 bg-blue-50/20 text-xs">
                          {ap.output && ap.output.length > 0
                            ? <ul>{ap.output.map((o, oi) => <li key={oi} className="text-[10px] leading-relaxed">• {o}</li>)}</ul>
                            : <span className="text-gray-300 text-[10px]">—</span>}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className="border border-gray-200 py-2 px-3 text-center text-gray-300 bg-blue-50/20 text-xs">Belum ada action plan</td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RCAApprovalHistorySection() {
  const decisions = React.useMemo(() => loadRCAApprovalDecisions(), []);
  const statusCfg: Record<string, { cls: string; label: string }> = {
    "Assessed-Approver 1": { cls: "bg-indigo-50 text-indigo-700 border-indigo-200", label: "Dinilai" },
    "Approved":            { cls: "bg-green-50 text-green-700 border-green-200",    label: "Disetujui" },
    "Revision":            { cls: "bg-red-50 text-red-700 border-red-200",          label: "Revisi" },
    "Closed":              { cls: "bg-green-100 text-green-800 border-green-300",   label: "Selesai" },
  };

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <SearchCode className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">History Penilaian RCA</span>
        <span className="text-[10px] text-white/50">2026</span>
      </div>

      {decisions.length === 0 ? (
        <div className="bg-white px-5 py-8 flex flex-col items-center gap-2 text-center">
          <SearchCode className="w-8 h-8 text-gray-200" />
          <p className="text-sm text-gray-400 italic">Belum ada penilaian RCA dari approver.</p>
        </div>
      ) : (
        <div className="bg-white divide-y divide-gray-100">
          {decisions.map((d, idx) => {
            const cfg = statusCfg[d.status] ?? { cls: "bg-gray-50 text-gray-700 border-gray-200", label: d.status };
            return (
              <div key={idx} className="px-5 py-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#1A284F]/10 text-[#1A284F] flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black">A{d.approverLevel}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{d.approverName}</p>
                      <p className="text-[11px] text-gray-500">{d.approverRole}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                    {d.reviewedDate && <span className="text-[10px] text-gray-400">{d.reviewedDate}</span>}
                  </div>
                </div>
                {d.comment && (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Catatan</p>
                    <p className="text-xs text-gray-700 leading-relaxed">{d.comment}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RCATab() {
  const submissions = React.useMemo(() => loadRCASubmissions(), []);
  const submitted   = submissions.filter((s) => s.submittedDate && s.submittedDate !== "—");

  return (
    <div className="flex flex-col gap-4">
      {submitted.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl p-12 flex flex-col items-center gap-3 shadow-sm text-center">
          <SearchCode className="w-10 h-10 text-gray-200" />
          <p className="text-gray-500 text-sm font-medium">Belum ada RCA yang disubmit.</p>
          <p className="text-gray-400 text-xs">RCA yang telah disubmit di halaman RCA Measurement akan tampil di sini.</p>
        </div>
      ) : (
        submitted.map((sub, idx) => (
          <RCASubmissionCard key={sub.id} sub={sub} no={idx + 1} />
        ))
      )}

      <RCAApprovalHistorySection />
    </div>
  );
}

// ─── Project Outside Job Scope (Staff) ────────────────────────────────────────

function scopeShort(scope: string): string { return scope.split(/\s*[-–(]/)[0].trim(); }

const SCOPE_BADGE: Record<string, string> = {
  SS:  "bg-amber-100 text-amber-700",
  QCC: "bg-indigo-100 text-indigo-700",
  QCP: "bg-teal-100 text-teal-700",
};
const PROJ_PROGRESS_META: Record<string, { bg: string; icon: React.ElementType; label: string }> = {
  "Submitted":   { bg: "bg-amber-100 text-amber-700", icon: Clock,         label: "Submitted"   },
  "In Progress": { bg: "bg-blue-100 text-blue-700",   icon: AlertTriangle, label: "In Progress" },
  "Done":        { bg: "bg-green-100 text-green-700", icon: CheckCircle2,  label: "Done"        },
};
function checkInToProgress(cs: ProjectCheckInStatus): string {
  if (cs === "completed")  return "Done";
  if (cs === "not_started" || cs === "cancelled") return "Submitted";
  return "In Progress";
}

function roleDisplay(role: string): { label: string; cls: string } {
  if (role.includes("Co-Leader") || role.includes("Wakil"))
    return { label: "Co-Leader",   cls: "bg-indigo-100 text-indigo-700" };
  if (role.includes("Leader") || role.includes("Ketua"))
    return { label: "Team Leader", cls: "bg-purple-100 text-purple-700" };
  if (role.includes("Member") || role.includes("Anggota"))
    return { label: "Member",      cls: "bg-gray-100 text-gray-600"     };
  if (role.includes("Facilitator"))
    return { label: "Facilitator", cls: "bg-orange-100 text-orange-700" };
  if (role.includes("Sponsor"))
    return { label: "Sponsor",     cls: "bg-orange-100 text-orange-700" };
  return { label: role, cls: "bg-gray-100 text-gray-600" };
}

const HR_PROJ_BOBOT: Record<string, number> = { SS: 25, QCC: 35, QCP: 40 };

function hrTeamBobot(role: string, scopeCode: string): number | null {
  if (scopeCode === "SS") return null;
  if (role.includes("Member") || role.includes("Anggota")) return 90;
  return 100;
}
function hrProjectScore(cs: ProjectCheckInStatus, progressPercent: number, scopeCode: string): number {
  if (scopeCode === "SS")
    return (cs === "not_started" || cs === "cancelled") ? 20 : 100;
  return progressPercent;
}
function hrProjectBobot(scope: string, scopeCode: string): number {
  return HR_PROJ_BOBOT[scopeCode] ?? (SCOPE_BOBOT[scope as keyof typeof SCOPE_BOBOT] ?? 10);
}
function hrFinalScore(projScore: number, teamBobot: number | null, projBobot: number, scopeCode: string): number | null {
  if (scopeCode === "SS") return Math.round(projScore * projBobot / 100 * 10) / 10;
  if (teamBobot === null) return null;
  return Math.round(projScore * teamBobot * projBobot / 10000 * 10) / 10;
}

function ProjRawScoreBadge({ value }: { value: number }) {
  const c = value === 100 ? "text-green-700 bg-green-50 border-green-200"
    : value >= 70 ? "text-blue-700 bg-blue-50 border-blue-200"
    : value >= 40 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${c}`}>{value}%</span>;
}
function ProjFinalBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>;
  const c = value >= 30 ? "text-green-700 bg-green-50 border-green-200"
    : value >= 20 ? "text-blue-700 bg-blue-50 border-blue-200"
    : value >= 10 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${c}`}>{value}%</span>;
}

export function ProjectOutsideTab() {
  const { excelRows, excelSubmitted, maxFinalScore } = useProjectStore();
  const moduleBobot = 15;
  const weightedContribution = maxFinalScore !== null ? Number(((maxFinalScore * moduleBobot) / 100).toFixed(2)) : null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-left border-collapse w-full" style={{ minWidth: 1100 }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              <th className="py-3 px-3 text-center w-10">No.</th>
              <th className="py-3 px-3 text-center">Project Scope</th>
              <th className="py-3 px-3 text-center">Role Project</th>
              <th className="py-3 px-3">Project Title</th>
              <th className="py-3 px-3 min-w-[180px]">Project Detail</th>
              <th className="py-3 px-3 text-center">Start Date</th>
              <th className="py-3 px-3 text-center">Finish Date</th>
              <th className="py-3 px-3 text-center">Progress Status</th>
              <th className="py-3 px-3 text-center">Approval Status</th>
              <th className="py-3 px-3 text-center">Final Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {excelRows.map((row, idx) => {
              const isHighest = maxFinalScore !== null && row.finalScore === maxFinalScore;
              return (
                <tr key={idx} className={isHighest ? "bg-emerald-50/50" : "hover:bg-gray-50/60"}>
                  <td className="py-3 px-3 text-center text-xs font-semibold text-gray-500">{row.no}</td>
                  <td className="py-3 px-3 text-center text-xs font-medium text-gray-800">{row.projectScope}</td>
                  <td className="py-3 px-3 text-center text-xs text-gray-700">{row.roleProject}</td>
                  <td className="py-3 px-3 text-xs font-semibold text-gray-900">{row.projectTitle}</td>
                  <td className="py-3 px-3 text-xs text-gray-600 max-w-xs">{row.projectDetail}</td>
                  <td className="py-3 px-3 text-center text-xs text-gray-600 whitespace-nowrap">{row.startDate}</td>
                  <td className="py-3 px-3 text-center text-xs text-gray-600 whitespace-nowrap">{row.finishDate}</td>
                  <td className="py-3 px-3 text-center text-xs font-semibold text-blue-700">{row.progressStatus}</td>
                  <td className="py-3 px-3 text-center">
                    {excelSubmitted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-green-100 text-green-700">
                        <ShieldCheck className="w-3 h-3" />Approved
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3" />Pending Approval
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center text-xs font-bold text-[#1A284F]">
                    <span className="inline-flex items-center gap-1.5">
                      {row.finalScore}%
                      {isHighest && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          Tertinggi
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {excelRows.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm border-t border-gray-100">Belum ada project yang terdaftar.</div>
      )}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
        <span>Rumus Penilaian: Ambil <strong>Final Score tertinggi</strong> dari daftar proyek karyawan, lalu kalikan dengan <strong>Bobot Modul ({moduleBobot}%)</strong>.</span>
        <span className="font-bold text-[#1A284F]">
          Skor Tertinggi: {maxFinalScore ?? "—"}% · Kontribusi PA ({moduleBobot}%): {weightedContribution ?? "—"}%
        </span>
      </div>
    </div>
  );
}

// ─── Score Summary Banner (Edward David) ─────────────────────────────────────

const HISTORICAL_SCORES_EDWARD: Record<string, { kpi: number; smart: number; appraisal: number; project: number; overall: number }> = {};

function getKPIScore2026(): number | null {
  const { months, cellsMap } = loadKPITracking();
  const total = KPI_ITEMS.reduce((s, k) => {
    const ach = computeKPIAchievement(k, cellsMap, months);
    if (ach === null) return s;
    return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
  }, 0);
  return total > 0 ? parseFloat(total.toFixed(1)) : null;
}

function getGrade(score: number): { letter: string; color: string; bg: string } {
  if (score >= 90) return { letter: "A+", color: "text-purple-700",  bg: "bg-purple-100"  };
  if (score >= 80) return { letter: "A",  color: "text-emerald-700", bg: "bg-emerald-100" };
  if (score >= 70) return { letter: "B",  color: "text-blue-700",    bg: "bg-blue-100"    };
  if (score >= 60) return { letter: "C",  color: "text-yellow-700",  bg: "bg-yellow-100"  };
  if (score >= 50) return { letter: "D",  color: "text-orange-700",  bg: "bg-orange-100"  };
  return             { letter: "E",  color: "text-red-700",     bg: "bg-red-100"     };
}

function ScoreSummaryBanner({ year }: { year: string }) {
  const { activeUser, allowedModules } = useAuthStore();
  const [, setTick] = useState(0);
  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);
  const isCurrent = year === "2026";
  const hist = HISTORICAL_SCORES_EDWARD[year];
  const scoreLabel = isCurrent ? "Current Score" : "Final Score";
  const liveMe = getLiveTransactionalEmployees().find(
    (e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase(),
  );
  const grouping = resolveEffectiveUserGrouping(activeUser);
  const unitWeights = loadUnitScoreWeights(activeUser.company);
  const weightCol: ScoreWeightColumn =
    grouping === "Ka./Wa.Ka.Div ke atas" || grouping === "Direktur / Director"
      ? "kepalaDivisi"
      : grouping === "Ka./Wa.Ka.Dept"
      ? "kepalaDepartement"
      : grouping === "Ka./Wa.Ka.Bagian"
      ? "pengawasKepalaBagian"
      : grouping === "Ka./Wa.Ka.Seksi"
      ? "kaWaKaSeksi"
      : "operasional";
  const getWeightNum = (indikator: string, fallback: number): number => {
    const raw = unitWeights[indikator]?.[weightCol];
    if (!raw || raw === "-") return 0;
    const num = parseFloat(String(raw).replace("%", "").trim());
    return Number.isFinite(num) ? num : fallback;
  };

  const liveKpiScore = liveMe && liveMe.kpi.score > 0 ? liveMe.kpi.score : null;
  const liveSgScore  = liveMe && liveMe.smartGoals.score > 0 ? liveMe.smartGoals.score : null;
  const liveAfScore  = liveMe && liveMe.formA.score > 0 ? liveMe.formA.score : null;
  const livePrjScore = liveMe && liveMe.project.score > 0 ? liveMe.project.score : null;

  const allCards = [
    { label: "KPI",            score: isCurrent ? liveKpiScore : (hist?.kpi       ?? null), weight: getWeightNum("KPI", 50),                       icon: <TrendingUp className="w-5 h-5" />,   color: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-200"  },
    { label: "SMART Goals",    score: isCurrent ? liveSgScore  : (hist?.smart     ?? null), weight: getWeightNum("SMART Goals", 20),               icon: <Lightbulb className="w-5 h-5" />,     color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
    { label: "Appraisal Form", score: isCurrent ? liveAfScore  : (hist?.appraisal ?? null), weight: getWeightNum("Appraisal Form", 15),            icon: <ClipboardList className="w-5 h-5" />, color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
    { label: "Project Outside",score: isCurrent ? livePrjScore : (hist?.project   ?? null), weight: getWeightNum("Project Outside Job Scope", 15), icon: <FolderKanban className="w-5 h-5" />,  color: "text-teal-700",  bg: "bg-teal-50",  border: "border-teal-200"  },
  ];
  const cards = allCards.filter((c) => {
    if (c.label === "KPI") return allowedModules.includes("KPI (Setting/Measurement)");
    if (c.label === "SMART Goals") return allowedModules.includes("SMART Goals (Setting/Measurement)");
    if (c.label === "Appraisal Form") return allowedModules.includes("Appraisals Form");
    if (c.label === "Project Outside") return allowedModules.includes("Project Outside Job Scope");
    return true;
  });

  const scoredCards = cards.filter(c => c.score !== null);
  const evaluatedWeight = scoredCards.reduce((s, c) => s + c.weight, 0);
  const computedOverall = liveMe && liveMe.totalScore > 0
    ? parseFloat(liveMe.totalScore.toFixed(1))
    : scoredCards.length > 0 && evaluatedWeight > 0
    ? parseFloat((scoredCards.reduce((s, c) => s + c.score! * (c.weight / 100), 0)).toFixed(1))
    : null;
  const overallScore = isCurrent ? computedOverall : (hist?.overall ?? null);
  const isPartial = isCurrent && evaluatedWeight < 100;

  const grade = overallScore !== null ? getGrade(overallScore) : null;

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${isCurrent ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white" : "border-green-200 bg-gradient-to-br from-green-50 to-white"}`}>
      <div className={`flex items-center justify-between px-6 py-3 ${isCurrent ? "bg-amber-500" : "bg-green-600"}`}>
        <div className="flex items-center gap-2">
          {isCurrent ? <Activity className="w-4 h-4 text-white" /> : <Lock className="w-4 h-4 text-white" />}
          <span className="text-white font-bold text-sm tracking-wide uppercase">{scoreLabel}</span>
          <span className="text-white/70 text-xs">— Performance Year {year}</span>
          {isPartial && (
            <span className="text-white/60 text-[10px] border border-white/30 px-2 py-0.5 rounded-full">
              {evaluatedWeight}% weight evaluated
            </span>
          )}
        </div>
        {overallScore !== null && grade ? (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-white/70 text-[10px] font-medium uppercase tracking-wide">Overall Score</p>
              <p className="text-white font-extrabold text-lg leading-none">{overallScore}%</p>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg shadow-sm ${grade.bg} ${grade.color}`}>
              {grade.letter}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-xs font-medium">Overall Score</span>
            <span className="bg-white/20 text-white font-bold text-sm px-3 py-0.5 rounded-full">Belum ada data</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border ${card.border} ${card.bg} px-4 py-4 flex flex-col gap-2`}>
            <div className={`flex items-center gap-2 ${card.color}`}>
              {card.icon}
              <span className="text-xs font-bold uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="flex items-end justify-between">
              {card.score !== null
                ? <span className={`text-2xl font-bold ${isCurrent ? "text-amber-600" : "text-green-700"}`}>{card.score}%</span>
                : <span className="text-2xl font-bold text-gray-300">—</span>}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isCurrent ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                Bobot {card.weight}%
              </span>
            </div>
            <div className="mt-1">
              <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                {card.score !== null
                  ? <div className={`h-1.5 rounded-full transition-all duration-700 ${isCurrent ? "bg-amber-400" : "bg-green-500"}`} style={{ width: `${card.score}%` }} />
                  : <div className="h-1.5 rounded-full bg-gray-200 w-full" />}
              </div>
              <p className={`text-[10px] mt-1 font-medium ${card.score === null ? "text-gray-400 italic" : card.color}`}>
                {card.score === null ? (isCurrent ? "Belum dievaluasi" : "No data") : scoreLabel}
              </p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const YEARS = ["2026", "2025", "2024", "2023"];

export function StaffMyPA() {
  const revision = useAppraisalRevision();
  const [activeTab, setActiveTab] = useRouteTab<Tab>(TABS.map((t) => t.id), "KPI");
  const [selectedYear, setSelectedYear] = useState("2026");

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">My Performance Appraisal – {selectedYear}</h1>
          <p className="text-gray-500 text-sm">Review your annual performance results as Staff — Grade Operasional</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
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

      {/* Identity Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-[#1A284F] flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-white tracking-wider">{STAFF_PROFILE.initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-gray-900 leading-tight">{STAFF_PROFILE.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{STAFF_PROFILE.position}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            <span className="text-[10px] text-gray-400">{STAFF_PROFILE.department}</span>
            <span className="text-gray-200 text-[10px]">·</span>
            <span className="text-[10px] text-gray-400">{STAFF_PROFILE.companyUnit}</span>
            <span className="text-gray-200 text-[10px]">·</span>
            <span className="text-[10px] text-gray-400">{STAFF_PROFILE.location}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] font-mono font-bold text-[#1A284F] bg-[#1A284F]/8 px-2 py-0.5 rounded">{STAFF_PROFILE.employeeId}</span>
          <span className="text-[10px] text-gray-400">{STAFF_PROFILE.email}</span>
        </div>
      </div>

      {/* Score Summary */}
      <ScoreSummaryBanner year={selectedYear} />

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ id, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
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

      {activeTab === "KPI"                       && <KPITab key={revision} />}
      {activeTab === "SMART Goals"               && <SMARTGoalsTab key={revision} />}
      {activeTab === "Appraisal Form"            && <AppraisalFormTab key={revision} />}
      {activeTab === "RCA"                       && <RCATab key={revision} />}
      {activeTab === "Project Outside Job Scope" && <ProjectOutsideTab key={revision} />}
    </div>
  );
}
