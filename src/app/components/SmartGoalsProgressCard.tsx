import React from "react";
import { Activity, Target, TrendingUp } from "lucide-react";

export interface SmartGoalsProgressGoal {
  id: string | number;
  actionPlanIds: Array<string | number>;
}

interface Props {
  goals: SmartGoalsProgressGoal[];
  /** Status Action Plan: Selesai | Sedang dilaksanakan | Belum dilaksanakan | Batal | "-" */
  getActionPlanStatus: (goalId: string | number, apId: string | number) => string;
  /** Status Target vs Actual: Tercapai | Tidak Tercapai | "" */
  getGoalStatus: (goalId: string | number) => string;
  /** "dark" = kartu gradasi biru penuh, "light" = hanya header biru dongker. */
  variant?: "dark" | "light";
}

export function computeSmartGoalsProgress({ goals, getActionPlanStatus, getGoalStatus }: Omit<Props, "variant">) {
  let tercapai = 0, tidakTercapai = 0, belumDinilai = 0;
  let selesai = 0, sedang = 0, belum = 0, batal = 0, kosong = 0;
  goals.forEach((g) => {
    const gs = getGoalStatus(g.id);
    if (gs === "Tercapai") tercapai++;
    else if (gs === "Tidak Tercapai") tidakTercapai++;
    else belumDinilai++;
    g.actionPlanIds.forEach((apId) => {
      const s = getActionPlanStatus(g.id, apId);
      if (s === "Selesai") selesai++;
      else if (s === "Sedang dilaksanakan") sedang++;
      else if (s === "Belum dilaksanakan") belum++;
      else if (s === "Batal") batal++;
      else kosong++;
    });
  });
  const totalGoals = goals.length;
  const totalAPs = goals.reduce((n, g) => n + g.actionPlanIds.length, 0);
  // Goals: Tercapai = Closed, selain itu = Open. Action Plan: Selesai = Closed, selain itu = Open.
  const closedGoals = tercapai;
  const openGoals = totalGoals - closedGoals;
  const closedAPs = selesai;
  const openAPs = totalAPs - closedAPs;
  return {
    totalGoals, totalAPs, closedGoals, openGoals, closedAPs, openAPs,
    goalsPct: totalGoals ? Math.round((closedGoals / totalGoals) * 100) : 0,
    apPct: totalAPs ? Math.round((closedAPs / totalAPs) * 100) : 0,
    goalBreakdown: { tercapai, tidakTercapai, belumDinilai },
    apBreakdown: { selesai, sedang, belum, batal, kosong },
  };
}

export function SmartGoalsProgressCard({ variant: _variant = "light", ...rest }: Props) {
  const p = computeSmartGoalsProgress(rest);
  const StatusItem = ({ name, value, dot, tone }: { name: string; value: number; dot: string; tone: string }) => (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/80 border border-white/90 px-2.5 py-1.5 shadow-2xs">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-[11px] text-slate-600 font-medium truncate" title={name}>{name}</span>
      </span>
      <span className={`text-xs font-bold shrink-0 ${tone}`}>{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <Activity className="w-4 h-4 text-[#1A284F]" />
        <span className="text-xs font-bold uppercase tracking-widest text-[#1A284F]">Status Progress Keseluruhan</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[0.85fr_0.9fr_1fr_1.45fr] gap-3.5">
        {/* Card 1: Goals (Soft Sky-Blue Theme, tanpa Open/Closed) */}
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-[#EAF3FF] via-[#F5F9FF] to-white p-4 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-sky-100 border border-sky-200/80 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-sky-700" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-sky-900">Goals</span>
            </div>
            <span className="text-[11px] font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full">
              {p.goalsPct}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#1A284F] leading-none">{p.totalGoals}</span>
            <span className="text-xs font-medium text-slate-500">Total Goals</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="w-full h-1.5 rounded-full bg-sky-100 overflow-hidden">
              <div className="h-full bg-sky-600 rounded-full transition-all" style={{ width: `${p.goalsPct}%` }} />
            </div>
            <span className="text-[10px] font-medium text-slate-500">{p.goalsPct}% Tercapai</span>
          </div>
        </div>

        {/* Card 2: Attainable (Soft Emerald-Teal Theme, tanpa Open/Closed) */}
        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-[#E7F7F0] via-[#F4FCF8] to-white p-4 shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 border border-emerald-200/80 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-900">Attainable</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
              {p.apPct}%
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-[#1A284F] leading-none">{p.totalAPs}</span>
            <span className="text-xs font-medium text-slate-500">Total Attainable</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="w-full h-1.5 rounded-full bg-emerald-100 overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full transition-all" style={{ width: `${p.apPct}%` }} />
            </div>
            <span className="text-[10px] font-medium text-slate-500">{p.apPct}% Selesai</span>
          </div>
        </div>

        {/* Card 3: Breakdown Status · Goals (Soft Indigo-Lavender Theme) */}
        <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-[#EEF0FF] via-[#F7F8FF] to-white p-4 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-indigo-100 border border-indigo-200/80 flex items-center justify-center">
                <Target className="w-3.5 h-3.5 text-indigo-700" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-950">Breakdown Status</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100/80 text-indigo-800 text-[10px] font-bold uppercase tracking-wide">
              Goals
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <StatusItem name="Tercapai" value={p.goalBreakdown.tercapai} dot="bg-emerald-500" tone="text-emerald-700" />
            <StatusItem name="Tidak Tercapai" value={p.goalBreakdown.tidakTercapai} dot="bg-rose-500" tone="text-rose-600" />
            {p.goalBreakdown.belumDinilai > 0 && (
              <StatusItem name="Belum diisi" value={p.goalBreakdown.belumDinilai} dot="bg-slate-400" tone="text-slate-600" />
            )}
          </div>
        </div>

        {/* Card 4: Breakdown Status · Attainable (Soft Amber-Sand Theme, 2 baris / grid-cols-2) */}
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-[#FFF5E7] via-[#FFFBF5] to-white p-4 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-lg bg-amber-100 border border-amber-200/80 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-950">Breakdown Status</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-100/80 text-amber-800 text-[10px] font-bold uppercase tracking-wide">
              Attainable
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatusItem name="Selesai" value={p.apBreakdown.selesai} dot="bg-emerald-500" tone="text-emerald-700" />
            <StatusItem name="Sedang dilaksanakan" value={p.apBreakdown.sedang} dot="bg-amber-500" tone="text-amber-700" />
            <StatusItem name="Belum dilaksanakan" value={p.apBreakdown.belum} dot="bg-slate-400" tone="text-slate-600" />
            <StatusItem name="Batal" value={p.apBreakdown.batal} dot="bg-rose-500" tone="text-rose-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SmartGoalsProgressCard;
