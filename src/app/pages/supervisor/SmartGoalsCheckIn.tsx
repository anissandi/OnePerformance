// @refresh reset
import React, { useState, useEffect, useRef } from "react";
import {
  CheckCircle2, Send, Eye, Edit3, AlertCircle, Paperclip, X, Plus,
  ChevronDown, ChevronUp, Star, Info, TrendingUp, Target, Activity, Upload, Clock, RotateCcw, Lock,
} from "lucide-react";
import type { SmartGoal } from "../employee/SMARTGoals";
import { ROWS, SAMPLE_GOALS } from "../employee/SMARTGoals";
import { loadApprovalDecisions, loadCheckInEntries, loadSubmittedGoals, saveCheckInEntries } from "../shared/smartGoalsStore";
import type { StoredCheckInEntry } from "../shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../shared/appraisalWorkflowStore";
import { getActiveUser } from "../../store/authStore";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX } from "../../utils/excelUtils";
import { uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvidenceFile {
  name: string;
  size: number;
  type: string;
  dataUrl?: string;
}

// Local status — includes dash (default/unset), Batal, and the 3 standard states
type LocalStatus = "-" | "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai" | "Batal";

type GoalAchievementStatus = "" | "Tercapai" | "Tidak Tercapai";

interface TargetActualEntry {
  goalId: number;
  actual: string;
  status: GoalAchievementStatus;
  alasanTidakTercapai: string;
  evidenceFiles: EvidenceFile[];
}

interface ActionPlanExtra {
  kendala: string;
  progressPct: number;
  evidence: EvidenceFile[];
  alasanBatal: string;
}

interface CheckInEntry {
  goalId: number;
  actual: string;
  achievement: string;
  kendala: string;
  rencanaLanjut: string;
  evidence: EvidenceFile[];
  actionPlanStatuses: Record<number, LocalStatus>;
  actionPlanExtras: Record<number, ActionPlanExtra>;
  managerScore: string;
  managerNotes: string;
}

type PageView = "input" | "preview";

const LOCAL_STATUS_OPTIONS: LocalStatus[] = [
  "-",
  "Belum dilaksanakan",
  "Sedang dilaksanakan",
  "Selesai",
  "Batal",
];

const STATUS_COLOR: Record<LocalStatus, string> = {
  "-":                   "bg-gray-50 text-gray-400 border border-gray-200",
  "Belum dilaksanakan":  "bg-gray-100 text-gray-500",
  "Sedang dilaksanakan": "bg-amber-100 text-amber-700",
  "Selesai":             "bg-green-100 text-green-700",
  "Batal":               "bg-red-100 text-red-600",
};

const STATUS_DOT: Record<LocalStatus, string> = {
  "-":                   "bg-gray-300",
  "Belum dilaksanakan":  "bg-gray-400",
  "Sedang dilaksanakan": "bg-amber-500",
  "Selesai":             "bg-green-500",
  "Batal":               "bg-red-500",
};

function progressBarColor(pct: number): string {
  const hue = Math.round(pct * 1.2); // 0° red → 120° green
  return `hsl(${hue}, 72%, 44%)`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDefaultExtra(): ActionPlanExtra {
  return { kendala: "", progressPct: 0, evidence: [], alasanBatal: "" };
}

function makeBlankEntry(goal: SmartGoal): CheckInEntry {
  return {
    goalId: goal.id,
    actual: "",
    achievement: "",
    kendala: "",
    rencanaLanjut: "",
    evidence: [],
    actionPlanStatuses: {},
    actionPlanExtras: {},
    managerScore: "",
    managerNotes: "",
  };
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">Apakah Anda yakin ingin submit pengukuran SMART Goals?</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">Pengukuran SMART Goals telah berhasil disubmit untuk persetujuan (menutup otomatis...).</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Accumulation Progress Card ───────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-1 mt-1">
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-white/40">{pct}%</span>
    </div>
  );
}

function AccumulationCard({ goals, entries }: { goals: SmartGoal[]; entries: CheckInEntry[] }) {
  const totalGoals = goals.length;
  const totalAPs = goals.reduce((sum, g) => sum + g.actionPlans.length, 0);

  let selesaiCount = 0, sedangCount = 0, belumCount = 0, batalCount = 0, dashCount = 0;

  goals.forEach((g) => {
    const entry = entries.find((e) => e.goalId === g.id);
    if (!entry) return;
    g.actionPlans.forEach((ap) => {
      const s: LocalStatus = entry.actionPlanStatuses[ap.id] ?? "-";
      if (s === "Selesai") selesaiCount++;
      else if (s === "Sedang dilaksanakan") sedangCount++;
      else if (s === "Belum dilaksanakan") belumCount++;
      else if (s === "Batal") batalCount++;
      else dashCount++;
    });
  });

  // Goals: closed = all APs are Selesai (or goal has no APs); open = remaining
  const closedGoals = goals.filter((g) => {
    if (g.actionPlans.length === 0) return false;
    const entry = entries.find((e) => e.goalId === g.id);
    if (!entry) return false;
    return g.actionPlans.every((ap) => (entry.actionPlanStatuses[ap.id] ?? "-") === "Selesai");
  }).length;
  const openGoals = totalGoals - closedGoals;
  const goalsPct = totalGoals > 0 ? Math.round((closedGoals / totalGoals) * 100) : 0;

  // Action Plans: closed = Selesai; open = everything else (including unselected "-")
  const closedAPs = selesaiCount;
  const openAPs = sedangCount + belumCount + dashCount;
  const apPct = totalAPs > 0 ? Math.round((closedAPs / totalAPs) * 100) : 0;

  return (
    <div className="border border-[#1A284F]/20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A284F] to-[#253660] shadow-sm">
      <div className="px-5 py-3 flex items-center gap-2 border-b border-white/10">
        <Activity className="w-4 h-4 text-white/70" />
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">Status Progress Keseluruhan</span>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
        {/* Goals panel */}
        <div className="flex flex-col gap-2.5 pb-4 sm:pb-0 sm:pr-4">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-blue-300 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Goals</span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-bold text-white leading-none">{totalGoals}</span>
            <span className="text-sm text-white/50 mb-0.5">Total Goals</span>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Open</span>
              <span className="font-semibold text-white">{openGoals}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">Closed</span>
              <span className="font-semibold text-green-400">{closedGoals}</span>
            </div>
          </div>
          <ProgressBar pct={goalsPct} color="#22c55e" />
        </div>

        {/* Action Plans panel */}
        <div className="flex flex-col gap-2.5 pt-4 sm:pt-0 sm:px-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-green-300 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Action Plans</span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-3xl font-bold text-white leading-none">{totalAPs}</span>
            <span className="text-sm text-white/50 mb-0.5">Total Action Plans</span>
          </div>
          <div className="flex flex-col gap-0.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Open</span>
              <span className="font-semibold text-white">{openAPs}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">Closed</span>
              <span className="font-semibold text-green-400">{closedAPs}</span>
            </div>
          </div>
          <ProgressBar pct={apPct} color="#22c55e" />
        </div>

        {/* Breakdown Status panel */}
        <div className="flex flex-col gap-2 pt-4 sm:pt-0 sm:pl-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Breakdown Status</span>
          <div className="flex flex-col gap-1.5 mt-0.5">
            {[
              { label: "Selesai", count: selesaiCount, dot: "bg-green-500", text: "text-green-400" },
              { label: "Sedang dilaksanakan", count: sedangCount, dot: "bg-amber-400", text: "text-amber-400" },
              { label: "Belum dilaksanakan", count: belumCount, dot: "bg-gray-400", text: "text-gray-400" },
              { label: "Batal", count: batalCount, dot: "bg-red-500", text: "text-red-400" },
            ].map(({ label, count, dot, text }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-xs text-white/70">{label}</span>
                </div>
                <span className={`text-sm font-bold ${text}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Action Plans Section ─────────────────────────────────────────────────────

function ActionPlansSection({
  goal,
  entry,
  editable,
  onChange,
}: {
  goal: SmartGoal;
  entry: CheckInEntry;
  editable: boolean;
  onChange: (updated: CheckInEntry) => void;
}) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getStatus = (planId: number): LocalStatus => entry.actionPlanStatuses[planId] ?? "-";

  const setStatus = (planId: number, status: LocalStatus) => {
    onChange({ ...entry, actionPlanStatuses: { ...entry.actionPlanStatuses, [planId]: status } });
  };

  const getExtra = (planId: number): ActionPlanExtra =>
    entry.actionPlanExtras[planId] ?? getDefaultExtra();

  const setExtra = (planId: number, updated: Partial<ActionPlanExtra>) => {
    const current = getExtra(planId);
    onChange({
      ...entry,
      actionPlanExtras: { ...entry.actionPlanExtras, [planId]: { ...current, ...updated } },
    });
  };

  const handleUpload = (planId: number, files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) =>
      ["image/jpeg", "image/png", "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"].includes(f.type)
    );
    valid.forEach((rawFile) => {
      void uploadEvidenceFileToSupabase(rawFile, {
        moduleType: "SMART Goals",
        period: "2026",
        month: "June",
        kpiName: goal.label,
      });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
        const curr = getExtra(planId);
        setExtra(planId, {
          evidence: [
            ...curr.evidence,
            { name: rawFile.name, size: rawFile.size, type: rawFile.type, dataUrl },
          ],
        });
      };
      reader.readAsDataURL(rawFile);
    });
  };

  if (goal.actionPlans.length === 0) return null;

  // Only show detail cards for APs whose status is NOT "-"
  const visibleDetailAPs = goal.actionPlans.filter((ap) => getStatus(ap.id) !== "-");

  return (
    <div className="border-t border-gray-100 pt-4 flex flex-col gap-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#1A284F]">Status Action Plans</p>

      {/* Horizontal table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + goal.actionPlans.length * 160}px` }}>
          <thead>
            <tr>
              <th className="bg-[#1A284F] text-white text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide w-28 align-middle border-r border-white/20">
                Action Plan
              </th>
              {goal.actionPlans.map((ap, idx) => (
                <th
                  key={ap.id}
                  className={`bg-[#1A284F] text-white text-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide align-middle ${idx < goal.actionPlans.length - 1 ? "border-r border-white/20" : ""}`}
                >
                  Action Plan {idx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Description row */}
            <tr className="bg-white">
              <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2.5 align-top">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Deskripsi</span>
              </td>
              {goal.actionPlans.map((ap, idx) => (
                <td
                  key={ap.id}
                  className={`border-t border-gray-200 px-3 py-2.5 align-top text-[11px] text-gray-700 leading-relaxed ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[9px] font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                    <span>{ap.description}</span>
                  </div>
                </td>
              ))}
            </tr>

            {/* Status row (bottom) */}
            <tr className="bg-gray-50">
              <td className="border-t border-gray-200 border-r border-gray-200 px-3 py-2.5 align-middle">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</span>
              </td>
              {goal.actionPlans.map((ap, idx) => {
                const status = getStatus(ap.id);
                return (
                  <td
                    key={ap.id}
                    className={`border-t border-gray-200 px-2 py-2 text-center align-middle ${idx < goal.actionPlans.length - 1 ? "border-r border-gray-200" : ""}`}
                  >
                    {editable ? (
                      <select
                        value={status}
                        onChange={(e) => setStatus(ap.id, e.target.value as LocalStatus)}
                        className={`text-[10px] rounded-lg px-2 py-1.5 border-0 outline-none w-full text-center cursor-pointer font-semibold ${STATUS_COLOR[status]}`}
                      >
                        {LOCAL_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt === "-" ? "— Pilih Status" : opt}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[10px] rounded-lg px-2 py-1 font-semibold leading-tight ${STATUS_COLOR[status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                        {status === "-" ? "—" : status === "Belum dilaksanakan" ? "Belum" : status === "Sedang dilaksanakan" ? "Berjalan" : status}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail panels — only for APs with status other than "-" */}
      {visibleDetailAPs.length > 0 && (
        <div className="flex flex-col gap-3">
          {visibleDetailAPs.map((ap, _) => {
            const idx = goal.actionPlans.indexOf(ap);
            const status = getStatus(ap.id);
            const extra = getExtra(ap.id);
            const fileKey = `ap-${ap.id}`;

            return (
              <div key={ap.id} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* AP header */}
                <div className="bg-gray-50 px-3 py-2 flex items-center gap-2 border-b border-gray-200">
                  <span className="w-5 h-5 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[9px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                  <span className="text-xs font-semibold text-gray-700 leading-tight flex-1">{ap.description}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}>{status}</span>
                </div>

                <div className="p-3 flex flex-col gap-2.5">
                  {/* ── Belum dilaksanakan ── */}
                  {status === "Belum dilaksanakan" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kendala / Hambatan</label>
                      {editable ? (
                        <textarea rows={2} value={extra.kendala}
                          onChange={(e) => setExtra(ap.id, { kendala: e.target.value })}
                          placeholder="Tuliskan kendala atau hambatan yang menyebabkan action plan belum dilaksanakan..."
                          className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] bg-white resize-none" />
                      ) : (
                        <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 min-h-[36px]">
                          {extra.kendala || <span className="italic text-gray-300">—</span>}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Sedang dilaksanakan ── */}
                  {status === "Sedang dilaksanakan" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Progress</label>
                          <span className="text-sm font-bold" style={{ color: progressBarColor(extra.progressPct) }}>{extra.progressPct}%</span>
                        </div>
                        {editable && (
                          <input type="range" min={0} max={100} step={5} value={extra.progressPct}
                            onChange={(e) => setExtra(ap.id, { progressPct: Number(e.target.value) })}
                            className="w-full" />
                        )}
                        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${extra.progressPct}%`, backgroundColor: progressBarColor(extra.progressPct) }} />
                        </div>
                        <span className="text-[10px] text-gray-400 self-end">
                          {extra.progressPct >= 75 ? "Hampir selesai" : extra.progressPct >= 50 ? "Lebih dari setengah" : extra.progressPct >= 25 ? "Dalam proses" : "Baru dimulai"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Kendala / Hambatan</label>
                        {editable ? (
                          <textarea rows={2} value={extra.kendala}
                            onChange={(e) => setExtra(ap.id, { kendala: e.target.value })}
                            placeholder="Tuliskan kendala atau hambatan yang dihadapi..."
                            className="text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] bg-white resize-none" />
                        ) : (
                          <p className="text-xs text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 min-h-[36px]">
                            {extra.kendala || <span className="italic text-gray-300">—</span>}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* ── Selesai ── */}
                  {status === "Selesai" && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Bukti / Evidence</label>
                        {editable && (
                          <button type="button" onClick={() => fileRefs.current[fileKey]?.click()}
                            className="flex items-center gap-1 text-[10px] font-semibold text-green-700 hover:text-green-900 transition-colors">
                            <Paperclip className="w-3 h-3" />Upload
                          </button>
                        )}
                      </div>
                      <input ref={(el) => { fileRefs.current[fileKey] = el; }} type="file"
                        accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls" multiple className="hidden"
                        onChange={(e) => { handleUpload(ap.id, e.target.files); e.target.value = ""; }} />
                      {extra.evidence.length === 0 ? (
                        editable ? (
                          <button type="button" onClick={() => fileRefs.current[fileKey]?.click()}
                            className="flex flex-col items-center gap-1.5 w-full py-3 border-2 border-dashed border-green-200 rounded-lg text-green-500 hover:bg-green-50 transition-colors">
                            <Paperclip className="w-4 h-4" />
                            <span className="text-[10px] font-semibold">Upload bukti (PDF, JPG, PNG, Excel)</span>
                          </button>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Belum ada bukti.</p>
                        )
                      ) : (
                        <div className="flex flex-col gap-1">
                          {extra.evidence.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-green-50 rounded-lg border border-green-100">
                              <Paperclip className="w-3 h-3 text-green-500 shrink-0" />
                              <span className="text-[11px] text-gray-700 flex-1 truncate">{f.name}</span>
                              <span className="text-[10px] text-gray-400 shrink-0">{formatSize(f.size)}</span>
                              {editable && (
                                <button type="button" onClick={() => setExtra(ap.id, { evidence: extra.evidence.filter((_, ei) => ei !== i) })}
                                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                          {editable && (
                            <button type="button" onClick={() => fileRefs.current[fileKey]?.click()}
                              className="flex items-center gap-1 text-[10px] text-green-600 hover:text-green-800 font-semibold mt-0.5 self-start transition-colors">
                              <Plus className="w-3 h-3" />Tambah file
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Batal ── */}
                  {status === "Batal" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold uppercase tracking-wide text-red-500">Alasan Action Plan Batal</label>
                      {editable ? (
                        <textarea rows={2} value={extra.alasanBatal}
                          onChange={(e) => setExtra(ap.id, { alasanBatal: e.target.value })}
                          placeholder="Tuliskan alasan action plan dibatalkan..."
                          className="text-xs border border-red-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-red-50/40 resize-none" />
                      ) : (
                        <p className="text-xs text-red-700 leading-relaxed bg-red-50 rounded-lg px-3 py-2 min-h-[36px]">
                          {extra.alasanBatal || <span className="italic text-gray-300">—</span>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {LOCAL_STATUS_OPTIONS.filter((s) => s !== "-").map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
            <span className="text-[10px] text-gray-500 font-medium">{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Goal Section ─────────────────────────────────────────────────────────────

function GoalSection({
  goal,
  entry,
  editable,
  onChange,
}: {
  goal: SmartGoal;
  entry: CheckInEntry;
  editable: boolean;
  onChange: (updated: CheckInEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <span className="text-white text-sm font-bold flex-1">{goal.label}</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-white/70 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-5 bg-white flex flex-col gap-5">
          {/* SMART Criteria Table — slim, no desc subtitles */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide w-36 border-r border-white/20">
                    Kriteria
                  </th>
                  <th className="bg-[#1A284F] text-white text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wide">
                    Uraian
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
                    <td className="border-t border-gray-100 border-r border-gray-100 px-3 py-2 align-middle whitespace-nowrap">
                      <span className="font-semibold text-[11px] text-gray-700">{row.title}</span>
                    </td>
                    <td className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-700 leading-relaxed align-top">
                      {goal[row.key] || <span className="italic text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Plans */}
          {goal.actionPlans.length > 0 && (
            <ActionPlansSection
              goal={goal}
              entry={entry}
              editable={editable}
              onChange={onChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Target vs Actual Section ────────────────────────────────────────────────

function TargetVsActualSection({
  goals,
  targetActuals,
  editable,
  onChange,
}: {
  goals: SmartGoal[];
  targetActuals: TargetActualEntry[];
  editable: boolean;
  onChange: (updated: TargetActualEntry[]) => void;
}) {
  const evidenceRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const getEntry = (goalId: number): TargetActualEntry =>
    targetActuals.find((e) => e.goalId === goalId) ?? {
      goalId,
      actual: "",
      status: "",
      alasanTidakTercapai: "",
      evidenceFiles: [],
    };

  const updateEntry = (goalId: number, patch: Partial<TargetActualEntry>) => {
    const prev = getEntry(goalId);
    const next = { ...prev, ...patch };
    const others = targetActuals.filter((e) => e.goalId !== goalId);
    onChange([...others, next]);
  };

  const handleEvidenceUpload = (goalId: number, files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) =>
      ["image/jpeg", "image/png", "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"].includes(f.type)
    );
    valid.forEach((rawFile) => {
      void uploadEvidenceFileToSupabase(rawFile, {
        moduleType: "SMART Goals",
        period: "2026",
        month: "June",
      });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
        const curr = getEntry(goalId);
        updateEntry(goalId, {
          evidenceFiles: [
            ...curr.evidenceFiles,
            { name: rawFile.name, size: rawFile.size, type: rawFile.type, dataUrl },
          ],
        });
      };
      reader.readAsDataURL(rawFile);
    });
  };

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <TrendingUp className="w-4 h-4 text-green-300" />
        <span className="text-white text-sm font-bold flex-1">Target vs Actual</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" style={{ minWidth: "680px" }}>
          <thead>
            <tr>
              <th className="bg-gray-50 border-b border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-36">Goals</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-64">Target</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 w-48">Actual</th>
              <th className="bg-gray-50 border-b border-gray-200 border-l border-gray-200 text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal, idx) => {
              const entry = getEntry(goal.id);
              return (
                <React.Fragment key={goal.id}>
                  <tr className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    {/* Goals */}
                    <td className="border-t border-gray-100 px-4 py-3 align-top">
                      <span className="font-semibold text-[11px] text-gray-700 leading-tight">{goal.label}</span>
                    </td>
                    {/* Target — read only */}
                    <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                      <span className="text-[11px] text-gray-500 leading-relaxed italic">{goal.target || "—"}</span>
                    </td>
                    {/* Actual */}
                    <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                      {editable ? (
                        <input
                          type="text"
                          value={entry.actual}
                          onChange={(e) => updateEntry(goal.id, { actual: e.target.value })}
                          placeholder="Masukkan nilai aktual..."
                          className="w-full text-[11px] border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1A284F] bg-white"
                        />
                      ) : (
                        <span className="text-[11px] text-gray-700">{entry.actual || <span className="italic text-gray-300">—</span>}</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="border-t border-gray-100 border-l border-gray-100 px-4 py-3 align-top">
                      {editable ? (
                        <select
                          value={entry.status}
                          onChange={(e) => updateEntry(goal.id, { status: e.target.value as GoalAchievementStatus, alasanTidakTercapai: "", evidenceFiles: [] })}
                          className={`text-[11px] rounded-lg px-2.5 py-1.5 border outline-none cursor-pointer font-semibold w-full ${
                            entry.status === "Tercapai"
                              ? "bg-green-50 border-green-200 text-green-700"
                              : entry.status === "Tidak Tercapai"
                              ? "bg-red-50 border-red-200 text-red-700"
                              : "bg-gray-50 border-gray-200 text-gray-400"
                          }`}
                        >
                          <option value="">— Pilih Status</option>
                          <option value="Tercapai">Tercapai</option>
                          <option value="Tidak Tercapai">Tidak Tercapai</option>
                        </select>
                      ) : (
                        entry.status ? (
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                            entry.status === "Tercapai"
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${entry.status === "Tercapai" ? "bg-green-500" : "bg-red-500"}`} />
                            {entry.status}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300 italic">—</span>
                        )
                      )}
                    </td>
                  </tr>
                  {/* Conditional sub-row: Alasan or Evidence */}
                  {entry.status !== "" && (
                    <tr className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <td colSpan={4} className="border-t border-dashed border-gray-100 px-4 pb-3 pt-0">
                        <div className="ml-0 flex flex-col gap-2">
                          {entry.status === "Tidak Tercapai" && (
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold uppercase tracking-wide text-red-500">Alasan Tidak Tercapai</label>
                              {editable ? (
                                <textarea
                                  rows={2}
                                  value={entry.alasanTidakTercapai}
                                  onChange={(e) => updateEntry(goal.id, { alasanTidakTercapai: e.target.value })}
                                  placeholder="Tuliskan alasan mengapa target tidak tercapai..."
                                  className="text-xs border border-red-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-red-50/30 resize-none w-full max-w-xl"
                                />
                              ) : (
                                <p className="text-xs text-red-700 leading-relaxed bg-red-50 rounded-lg px-3 py-2 min-h-[36px] max-w-xl">
                                  {entry.alasanTidakTercapai || <span className="italic text-gray-300">—</span>}
                                </p>
                              )}
                            </div>
                          )}

                          {entry.status === "Tercapai" && (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center justify-between max-w-xl">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-green-700">Upload Evidence</label>
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => evidenceRefs.current[goal.id]?.click()}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-green-700 hover:text-green-900 transition-colors"
                                  >
                                    <Upload className="w-3 h-3" />Upload
                                  </button>
                                )}
                              </div>
                              <input
                                ref={(el) => { evidenceRefs.current[goal.id] = el; }}
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls"
                                multiple
                                className="hidden"
                                onChange={(e) => { handleEvidenceUpload(goal.id, e.target.files); e.target.value = ""; }}
                              />
                              {entry.evidenceFiles.length === 0 ? (
                                editable ? (
                                  <button
                                    type="button"
                                    onClick={() => evidenceRefs.current[goal.id]?.click()}
                                    className="flex flex-col items-center gap-1.5 w-full max-w-xl py-3 border-2 border-dashed border-green-200 rounded-lg text-green-500 hover:bg-green-50 transition-colors"
                                  >
                                    <Upload className="w-4 h-4" />
                                    <span className="text-[10px] font-semibold">Upload bukti (PDF, JPG, PNG, Excel)</span>
                                  </button>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">Belum ada evidence.</p>
                                )
                              ) : (
                                <div className="flex flex-col gap-1 max-w-xl">
                                  {entry.evidenceFiles.map((f, fi) => (
                                    <div key={fi} className="flex items-center gap-2 px-2.5 py-1.5 bg-green-50 rounded-lg border border-green-100">
                                      <Paperclip className="w-3 h-3 text-green-500 shrink-0" />
                                      <span className="text-[11px] text-gray-700 flex-1 truncate">{f.name}</span>
                                      <span className="text-[10px] text-gray-400 shrink-0">{formatSize(f.size)}</span>
                                      {editable && (
                                        <button
                                          type="button"
                                          onClick={() => updateEntry(goal.id, { evidenceFiles: entry.evidenceFiles.filter((_, ei) => ei !== fi) })}
                                          className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {editable && (
                                    <button
                                      type="button"
                                      onClick={() => evidenceRefs.current[goal.id]?.click()}
                                      className="flex items-center gap-1 text-[10px] text-green-600 hover:text-green-800 font-semibold mt-0.5 self-start transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />Tambah file
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Penilaian Akhir Section (single, at end of page) ─────────────────────────

function PenilaianAkhirSection({
  scoreLabel,
  approver1Note,
  approver2Note,
  approver1Score,
  approver2Score,
}: {
  scoreLabel: string | null;
  approver1Note: string;
  approver2Note: string;
  approver1Score: string | null;
  approver2Score: string | null;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center px-5 py-3 bg-[#1A284F] gap-3">
        <Star className="w-4 h-4 text-amber-300" />
        <span className="text-white text-sm font-bold flex-1">Penilaian Akhir</span>
      </div>
      <div className="p-5 bg-white flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Nilai / Score</label>
          <div className="flex items-center gap-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {scoreLabel ? (
              <span className="text-sm font-bold text-[#1A284F]">{scoreLabel}</span>
            ) : (
              <span className="text-xs text-gray-400 italic">Belum ada nilai/score</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between">
              <span>Catatan Approver 1</span>
              {approver1Score && <span className="text-indigo-700 font-bold">Nilai: {approver1Score}</span>}
            </label>
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5 min-h-[48px]">
              {approver1Note ? (
                <span className="text-xs text-gray-700 leading-relaxed">{approver1Note}</span>
              ) : (
                <span className="text-xs text-gray-400 italic">Belum ada catatan</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 flex items-center justify-between">
              <span>Catatan Approver 2</span>
              {approver2Score && <span className="text-emerald-700 font-bold">Nilai: {approver2Score}</span>}
            </label>
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5 min-h-[48px]">
              {approver2Note ? (
                <span className="text-xs text-gray-700 leading-relaxed">{approver2Note}</span>
              ) : (
                <span className="text-xs text-gray-400 italic">Belum ada catatan</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SmartGoalsCheckInPage() {
  const [goals, setGoals] = useState<SmartGoal[] | null>(null);
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [targetActuals, setTargetActuals] = useState<TargetActualEntry[]>([]);
  const [view, setView] = useState<PageView>("input");
  const [submitted, setSubmitted] = useState(false);
  const [isSettingValidated, setIsSettingValidated] = useState(false);
  const [settingStatusLabel, setSettingStatusLabel] = useState("Belum Disubmit");
  const [statusLabel, setStatusLabel] = useState("Draft");
  const [statusTone, setStatusTone] = useState<"validated" | "in_progress" | "revision" | "submitted">("submitted");
  const [wfRecState, setWfRecState] = useState<WorkflowRecord | undefined>(undefined);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const syncCheckInPageState = () => {
    const user = getActiveUser();
    const normId = normalizeEmployeeId(user.employeeId);
    const loaded = loadSubmittedGoals(user.employeeId);
    const source = loaded ?? SAMPLE_GOALS;
    const savedCheckIn = loadCheckInEntries(user.employeeId);
    const wfSetting = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "SMART Goals" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === user.employeeId.toLowerCase()),
    );
    const stVal = wfSetting?.decisions.validator?.status ?? "";
    const stA2 = wfSetting?.decisions.approver2?.status ?? "";
    const stA1 = wfSetting?.decisions.approver1?.status ?? "";
    const stChk = wfSetting?.decisions.checker?.status ?? "";
    const settingValidated = Boolean(stVal === "Validated" || stA2 === "Validated");
    let curSettingLabel = "Belum Disubmit";
    if (settingValidated) {
      curSettingLabel = "Validated";
    } else if (stVal === "Revision" || stA2 === "Revision" || stA1 === "Revision" || stChk === "Revision") {
      curSettingLabel = "Revision";
    } else if (stA2 === "Approved" || stA2.startsWith("Assessed")) {
      curSettingLabel = "Pending-Validate (HR ICF)";
    } else if (stA1 === "Approved" || stA1.startsWith("Assessed")) {
      curSettingLabel = "Pending-Approver 2";
    } else if (stChk && stChk !== "Revision") {
      curSettingLabel = "Pending-Approver 1";
    } else if (wfSetting) {
      curSettingLabel = "Submitted · Pending Check HR Unit";
    }
    setIsSettingValidated(settingValidated);
    setSettingStatusLabel(curSettingLabel);

    const wfRec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "SMART Goals" &&
        r.phase === "measurement" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === user.employeeId.toLowerCase()),
    );
    const a1 = wfRec?.decisions.approver1?.status ?? "";
    const a2 = wfRec?.decisions.approver2?.status ?? "";
    const chk = wfRec?.decisions.checker?.status ?? "";
    const val = wfRec?.decisions.validator?.status ?? "";
    const isRev = a1 === "Revision" || a2 === "Revision" || chk === "Revision" || val === "Revision";
    const isVal = val === "Validated" || a2 === "Validated";
    const isA2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
    const isA1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
    const isChkDone = Boolean(chk && chk !== "Revision");

    let nextLabel = "Draft (Belum Disubmit)";
    let nextTone: "validated" | "in_progress" | "revision" | "submitted" = "submitted";
    if (isRev) {
      nextLabel = "Revision";
      nextTone = "revision";
    } else if (isVal) {
      nextLabel = "Validated";
      nextTone = "validated";
    } else if (isA2Done) {
      nextLabel = "Pending-Validate (HR ICF)";
      nextTone = "in_progress";
    } else if (isA1Done) {
      nextLabel = "Pending-Approver 2";
      nextTone = "in_progress";
    } else if (isChkDone) {
      nextLabel = "Pending-Approver 1";
      nextTone = "in_progress";
    } else if (wfRec) {
      nextLabel = "Submitted · Pending Check HR Unit";
      nextTone = "submitted";
    }

    const isLocked = Boolean(wfRec && !isRev);
    setGoals(source);
    setSubmitted(isLocked);
    if (isLocked) setView("preview");
    setStatusLabel(nextLabel);
    setStatusTone(nextTone);
    setWfRecState(wfRec);

    setEntries(
      source.map((g) => {
        const st = savedCheckIn.find((x) => x.goalId === g.id);
        if (!st) return makeBlankEntry(g);
        const extras: Record<number, ActionPlanExtra> = {};
        g.actionPlans.forEach((ap) => {
          extras[ap.id] = {
            kendala: st.actionPlanKendala?.[ap.id] ?? "",
            progressPct: st.actionPlanProgress?.[ap.id] ?? 0,
            evidence: (st.actionPlanEvidence?.[ap.id] ?? []).map((f) => ({
              name: f.name,
              size: f.size,
              type: f.type || "application/octet-stream",
              dataUrl: f.dataUrl,
            })),
            alasanBatal: st.actionPlanAlasanBatal?.[ap.id] ?? "",
          };
        });
        return {
          ...makeBlankEntry(g),
          actual: st.actual ?? "",
          achievement: st.achievement ?? "",
          kendala: st.kendala ?? "",
          rencanaLanjut: st.rencanaLanjut ?? "",
          actionPlanStatuses: (st.actionPlanStatuses as Record<number, LocalStatus>) ?? {},
          actionPlanExtras: extras,
        };
      }),
    );
    setTargetActuals(
      source.map((g) => {
        const st = savedCheckIn.find((x) => x.goalId === g.id);
        return {
          goalId: g.id,
          actual: st?.actual ?? "",
          status: (st?.targetAchievementStatus as GoalAchievementStatus) ?? "",
          alasanTidakTercapai: st?.alasanTidakTercapai ?? "",
          evidenceFiles: (st?.evidenceFiles ?? []).map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type || "application/octet-stream",
            dataUrl: f.dataUrl,
          })),
        };
      }),
    );
  };

  useEffect(() => {
    syncCheckInPageState();
    window.addEventListener("pa-auth-updated", syncCheckInPageState);
    window.addEventListener("appraisal-updated", syncCheckInPageState);
    window.addEventListener("pa-db-hydrated", syncCheckInPageState);
    window.addEventListener("storage", syncCheckInPageState);
    return () => {
      window.removeEventListener("pa-auth-updated", syncCheckInPageState);
      window.removeEventListener("appraisal-updated", syncCheckInPageState);
      window.removeEventListener("pa-db-hydrated", syncCheckInPageState);
      window.removeEventListener("storage", syncCheckInPageState);
    };
  }, []);

  const updateEntry = (goalId: number, updated: CheckInEntry) =>
    setEntries((prev) => {
      const next = prev.map((e) => e.goalId === goalId ? updated : e);
      // Simpan draft tanpa men-trigger submitWorkflowModule / notifikasi
      persistEntries(next, targetActuals, false);
      return next;
    });

  // Persist helper
  const persistEntries = (ents: CheckInEntry[], tas: TargetActualEntry[], submitWorkflow = false) => {
    const stored: StoredCheckInEntry[] = ents.map((e) => {
      const ta = tas.find((t) => t.goalId === e.goalId);
      return {
        goalId: e.goalId,
        actual: ta?.actual || e.actual,
        achievement: e.achievement,
        kendala: e.kendala,
        rencanaLanjut: e.rencanaLanjut,
        actionPlanStatuses: e.actionPlanStatuses as Record<number, string>,
        actionPlanProgress: Object.fromEntries(
          Object.entries(e.actionPlanExtras).map(([k, v]) => [Number(k), (v as ActionPlanExtra).progressPct])
        ),
        actionPlanKendala: Object.fromEntries(
          Object.entries(e.actionPlanExtras).map(([k, v]) => [Number(k), (v as ActionPlanExtra).kendala])
        ),
        actionPlanAlasanBatal: Object.fromEntries(
          Object.entries(e.actionPlanExtras).map(([k, v]) => [Number(k), (v as ActionPlanExtra).alasanBatal])
        ),
        actionPlanEvidence: Object.fromEntries(
          Object.entries(e.actionPlanExtras).map(([k, v]) => [Number(k), (v as ActionPlanExtra).evidence])
        ),
        targetAchievementStatus: ta?.status ?? "",
        alasanTidakTercapai: ta?.alasanTidakTercapai ?? "",
        evidenceFiles: ta?.evidenceFiles ?? [],
      };
    });
    saveCheckInEntries(stored, { submitWorkflow });
  };

  const handleConfirm = () => {
    persistEntries(entries, targetActuals, true);
    setShowConfirm(false);
    setShowSuccess(true);
    setSubmitted(true);
    setView("preview");
    syncCheckInPageState();
  };
  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setView("preview");
  };

  const handleExport = () => {
    if (!goals) return;
    const headers = ["No", "Goals"];
    const rows = goals.map((g, i) => [String(i + 1), g.label]);
    exportXLSX("SMART_Goals_CheckIn_2026.xlsx", headers, rows);
  };

  const handleImport = async (_file: File) => { /* placeholder */ };

  // Validasi kelengkapan seluruh field SMART Goals Measurement (tanpa menambah hook baru agar aman saat HMR)
  const smartGoalsValidation = (() => {
    const missing: string[] = [];
    if (!goals || goals.length === 0) {
      missing.push("Belum ada data SMART Goals.");
      return { isComplete: false, missing };
    }

    for (const goal of goals) {
      const entry = entries.find((e) => e.goalId === goal.id);
      const ta = targetActuals.find((t) => t.goalId === goal.id);

      goal.actionPlans.forEach((ap, apIdx) => {
        const st: LocalStatus = entry?.actionPlanStatuses?.[ap.id] ?? "-";
        const extra = entry?.actionPlanExtras?.[ap.id] ?? getDefaultExtra();
        const apName = `${goal.label} — Action Plan ${apIdx + 1}`;
        if (st === "-") {
          missing.push(`${apName}: Status belum dipilih`);
        } else if (st === "Belum dilaksanakan" && !extra.kendala.trim()) {
          missing.push(`${apName}: Kendala/Hambatan wajib diisi`);
        } else if (st === "Sedang dilaksanakan") {
          if (extra.progressPct <= 0) {
            missing.push(`${apName}: Persentase Progress (> 0%) wajib diisi`);
          }
          if (!extra.kendala.trim()) {
            missing.push(`${apName}: Kendala/Hambatan wajib diisi`);
          }
        } else if (st === "Selesai" && extra.evidence.length === 0) {
          missing.push(`${apName}: Bukti/Evidence wajib diupload`);
        } else if (st === "Batal" && !extra.alasanBatal.trim()) {
          missing.push(`${apName}: Alasan Action Plan Batal wajib diisi`);
        }
      });

      if (!ta?.actual?.trim()) {
        missing.push(`${goal.label} (Target vs Actual): Nilai Actual wajib diisi`);
      }
      if (!ta?.status) {
        missing.push(`${goal.label} (Target vs Actual): Status pencapaian wajib dipilih`);
      } else if (ta.status === "Tidak Tercapai" && !ta.alasanTidakTercapai.trim()) {
        missing.push(`${goal.label} (Target vs Actual): Alasan Tidak Tercapai wajib diisi`);
      } else if (ta.status === "Tercapai" && (ta.evidenceFiles?.length ?? 0) === 0) {
        missing.push(`${goal.label} (Target vs Actual): Evidence wajib diupload`);
      }
    }

    return {
      isComplete: missing.length === 0,
      missing,
    };
  })();

  if (!goals) {
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">SMART Goals Measurement</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal</p>
        </div>
        <div className="flex flex-col items-center justify-center py-20 gap-4 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-500" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-base font-bold text-gray-800 mb-1">No SMART Goals Data</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              Data akan muncul setelah SMART Goals disubmit dari{" "}
              <span className="font-semibold text-[#1A284F]">Performance Appraisal Setting → SMART Goals</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const editable = isSettingValidated && view === "input" && !submitted;

  // Ekstrak nilai & catatan terbaru dari Approver 1 & Approver 2 untuk Penilaian Akhir
  const activeUser = getActiveUser();
  const decisions = loadApprovalDecisions(activeUser.employeeId);
  const dec1 = decisions.find((d) => d.approverLevel === 1);
  const dec2 = decisions.find((d) => d.approverLevel === 2);
  const wfA1Vals = Object.values(wfRecState?.assessments.approver1?.ratings ?? {}).map(Number).filter((v) => v > 0);
  const wfA2Vals = Object.values(wfRecState?.assessments.approver2?.ratings ?? {}).map(Number).filter((v) => v > 0);
  const a1AvgStr =
    wfA1Vals.length > 0
      ? `${Math.round(wfA1Vals.reduce((s, n) => s + n, 0) / wfA1Vals.length)}%`
      : dec1?.score
      ? `${dec1.score}%`
      : null;
  const a2AvgStr =
    wfA2Vals.length > 0
      ? `${Math.round(wfA2Vals.reduce((s, n) => s + n, 0) / wfA2Vals.length)}%`
      : dec2?.score
      ? `${dec2.score}%`
      : null;
  const a1NoteStr = wfRecState?.assessments.approver1?.comments?.["0"] || dec1?.feedback || "";
  const a2NoteStr = wfRecState?.assessments.approver2?.comments?.["0"] || dec2?.feedback || "";
  const finalScoreStr =
    wfA2Vals.length > 0 && wfA1Vals.length > 0
      ? `${Math.round(((wfA1Vals.reduce((s, n) => s + n, 0) / wfA1Vals.length) + (wfA2Vals.reduce((s, n) => s + n, 0) / wfA2Vals.length)) / 2)}% (Rata-rata A1 & A2)`
      : a2AvgStr || a1AvgStr || null;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">SMART Goals Measurement</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — {goals.length} goal{goals.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ExportImportButton onExport={handleExport} onImport={handleImport} size="sm" />
        </div>
      </div>

      <ModuleApprovalStatusBar
        module="SMART Goals"
        phase="measurement"
        submittedOverride={submitted}
      />

      {/* Gate Banner: SMART Goals Setting belum Validated */}
      {!isSettingValidated && (
        <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-amber-300 bg-amber-50">
          <Lock className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">
              SMART Goals Measurement Terkunci — SMART Goals Setting Belum Berstatus Validated
            </p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              Anda belum dapat melakukan tindakan atau mengisi SMART Goals Measurement karena pengajuan{" "}
              <strong>SMART Goals Setting</strong> Anda belum berstatus <strong>Validated</strong> (status saat ini:{" "}
              <span className="font-bold underline">{settingStatusLabel}</span>). Sesuai aturan referensi PA, SMART Goals Measurement otomatis terbuka setelah SMART Goals Setting berstatus Validated.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
            <Lock className="w-3.5 h-3.5" /> Terkunci
          </span>
        </div>
      )}

      {/* Preview mode banner (hanya tampil saat belum disubmit; tag read-only dihapus sesuai Poin 19) */}
      {view === "preview" && !submitted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border bg-amber-50 border-amber-200 text-amber-700">
          <Eye className="w-4 h-4 shrink-0" />
          Preview mode — periksa kembali data sebelum submit.
        </div>
      )}

      {/* Accumulation card */}
      <AccumulationCard goals={goals} entries={entries} />

      {/* Goal sections */}
      <div className="flex flex-col gap-5">
        {goals.map((goal) => {
          const entry = entries.find((e) => e.goalId === goal.id);
          if (!entry) return null;
          return (
            <GoalSection
              key={goal.id}
              goal={goal}
              entry={entry}
              editable={editable}
              onChange={(updated) => updateEntry(goal.id, updated)}
            />
          );
        })}
      </div>

      {/* Target vs Actual */}
      <TargetVsActualSection
        goals={goals}
        targetActuals={targetActuals}
        editable={editable}
        onChange={(updated) => {
          setTargetActuals(updated);
          persistEntries(entries, updated, false);
        }}
      />

      {/* Action Buttons — di bawah Target vs Actual dan tepat di atas section Penilaian Akhir */}
      {isSettingValidated && !submitted && (
        <div className="flex items-center justify-end gap-3 bg-white border border-gray-200 rounded-2xl px-5 py-3.5 shadow-sm">
          {editable ? (
            <>
              <button
                type="button"
                onClick={() => setView("preview")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <button
                      type="button"
                      disabled={!smartGoalsValidation.isComplete}
                      onClick={() => setShowConfirm(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Submit SMART Goals
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm bg-[#1A284F] text-white p-3 rounded-xl shadow-lg">
                  {smartGoalsValidation.isComplete ? (
                    <p className="text-xs font-medium">Seluruh field telah lengkap. Klik untuk Submit SMART Goals.</p>
                  ) : (
                    <div>
                      <p className="font-bold text-xs mb-1">
                        Lengkapi seluruh field berikut sebelum Submit SMART Goals ({smartGoalsValidation.missing.length} belum selesai):
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-white/90 max-h-48 overflow-y-auto">
                        {smartGoalsValidation.missing.slice(0, 8).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                        {smartGoalsValidation.missing.length > 8 && (
                          <li>...dan {smartGoalsValidation.missing.length - 8} field lainnya.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setView("input")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Back to Edit
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <button
                      type="button"
                      disabled={!smartGoalsValidation.isComplete}
                      onClick={() => setShowConfirm(true)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      Submit SMART Goals
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm bg-[#1A284F] text-white p-3 rounded-xl shadow-lg">
                  {smartGoalsValidation.isComplete ? (
                    <p className="text-xs font-medium">Seluruh field telah lengkap. Klik untuk Submit SMART Goals.</p>
                  ) : (
                    <div>
                      <p className="font-bold text-xs mb-1">
                        Lengkapi seluruh field berikut sebelum Submit SMART Goals ({smartGoalsValidation.missing.length} belum selesai):
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-white/90 max-h-48 overflow-y-auto">
                        {smartGoalsValidation.missing.slice(0, 8).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                        {smartGoalsValidation.missing.length > 8 && (
                          <li>...dan {smartGoalsValidation.missing.length - 8} field lainnya.</li>
                        )}
                      </ul>
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      )}

      {/* Single Penilaian Akhir at end of page */}
      <PenilaianAkhirSection
        scoreLabel={finalScoreStr}
        approver1Note={a1NoteStr}
        approver2Note={a2NoteStr}
        approver1Score={a1AvgStr}
        approver2Score={a2AvgStr}
      />

      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}
