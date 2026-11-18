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

export function SmartGoalsProgressCard({ variant = "dark", ...rest }: Props) {
  const p = computeSmartGoalsProgress(rest);
  const dark = variant === "dark";
  const muted = dark ? "text-white/55" : "text-gray-500";
  const strong = dark ? "text-white" : "text-gray-900";
  const label = dark ? "text-white/60" : "text-gray-500";
  const track = dark ? "bg-white/10" : "bg-gray-100";
  const divide = dark ? "divide-white/10" : "divide-gray-100";

  const Row = ({ name, value, dot, tone }: { name: string; value: number; dot: string; tone: string }) => (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={`text-[11px] ${muted}`}>{name}</span>
      </span>
      <span className={`text-xs font-bold ${tone}`}>{value}</span>
    </div>
  );

  const Panel = ({ icon, title, total, totalLabel, open, closed, pct }: {
    icon: React.ReactNode; title: string; total: number; totalLabel: string; open: number; closed: number; pct: number;
  }) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`text-[10px] font-bold uppercase tracking-widest ${label}`}>{title}</span>
      </div>
      <div className="flex items-end gap-1">
        <span className={`text-2xl font-bold leading-none ${strong}`}>{total}</span>
        <span className={`text-xs mb-0.5 ml-1 ${muted}`}>{totalLabel}</span>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px]">
        <div className="flex justify-between"><span className={muted}>Open</span><span className={`font-semibold ${strong}`}>{open}</span></div>
        <div className="flex justify-between"><span className={muted}>Closed</span><span className={`font-semibold ${dark ? "text-green-400" : "text-emerald-600"}`}>{closed}</span></div>
      </div>
      <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 ${track}`}>
        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] ${muted}`}>{pct}% Closed</span>
    </div>
  );

  return (
    <div
      className={
        dark
          ? "border border-[#1A284F]/20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#1A284F] to-[#253660] shadow-sm"
          : "border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm"
      }
    >
      <div className={`px-5 py-3 flex items-center gap-2 ${dark ? "border-b border-white/10" : "bg-[#1A284F]"}`}>
        <Activity className="w-4 h-4 text-white/70" />
        <span className="text-xs font-bold uppercase tracking-widest text-white/80">Status Progress Keseluruhan</span>
      </div>
      <div className={`px-5 py-3.5 grid grid-cols-1 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x ${divide} ${dark ? "" : "bg-gradient-to-br from-sky-50/75 via-white to-indigo-50/40"}`}>
        <div className="md:pr-3">
          <Panel
            icon={<Target className={`w-3.5 h-3.5 ${dark ? "text-blue-300" : "text-sky-600"}`} />}
            title="Goals"
            total={p.totalGoals}
            totalLabel="Total Goals"
            open={p.openGoals}
            closed={p.closedGoals}
            pct={p.goalsPct}
          />
        </div>
        <div className="pt-3 md:pt-0 md:px-3">
          <Panel
            icon={<TrendingUp className={`w-3.5 h-3.5 ${dark ? "text-green-300" : "text-emerald-600"}`} />}
            title="Action Plans"
            total={p.totalAPs}
            totalLabel="Total Action Plans"
            open={p.openAPs}
            closed={p.closedAPs}
            pct={p.apPct}
          />
        </div>
        <div className="pt-3 md:pt-0 md:px-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Target className={`w-3.5 h-3.5 ${dark ? "text-blue-300" : "text-indigo-600"}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${label}`}>Breakdown Status</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>Goals</span>
            <Row name="Tercapai" value={p.goalBreakdown.tercapai} dot="bg-green-500" tone={dark ? "text-green-400" : "text-emerald-600"} />
            <Row name="Tidak Tercapai" value={p.goalBreakdown.tidakTercapai} dot="bg-red-500" tone={dark ? "text-red-400" : "text-red-600"} />
            {p.goalBreakdown.belumDinilai > 0 && (
              <Row name="Belum diisi" value={p.goalBreakdown.belumDinilai} dot="bg-gray-400" tone={dark ? "text-gray-300" : "text-gray-500"} />
            )}
          </div>
        </div>
        <div className="pt-3 md:pt-0 md:pl-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className={`w-3.5 h-3.5 ${dark ? "text-green-300" : "text-violet-600"}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${label}`}>Action Plan</span>
          </div>
          <div className="flex flex-col gap-1">
            <Row name="Selesai" value={p.apBreakdown.selesai} dot="bg-green-500" tone={dark ? "text-green-400" : "text-emerald-600"} />
            <Row name="Sedang dilaksanakan" value={p.apBreakdown.sedang} dot="bg-amber-400" tone={dark ? "text-amber-400" : "text-amber-600"} />
            <Row name="Belum dilaksanakan" value={p.apBreakdown.belum} dot="bg-gray-400" tone={dark ? "text-gray-300" : "text-gray-500"} />
            <Row name="Batal" value={p.apBreakdown.batal} dot="bg-red-500" tone={dark ? "text-red-400" : "text-red-600"} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SmartGoalsProgressCard;
