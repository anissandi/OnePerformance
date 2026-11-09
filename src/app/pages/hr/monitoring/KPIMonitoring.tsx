import { useState } from "react";
import { Search, TrendingUp, CheckCircle2, AlertCircle, Clock, Filter } from "lucide-react";
import { EMPLOYEES, COMPANY_UNITS } from "./monitoringData";

// ─── Mock KPI data per employee ───────────────────────────────────────────────

interface KPIRecord {
  employeeId: string;
  totalKPI: number;
  submittedKPI: number;
  avgAchievement: number; // percent
  perspektifBreakdown: { name: string; avg: number }[];
  rcaRequired: number;
  rcaCompleted: number;
  status: "Submitted" | "Draft" | "Belum Mulai";
  lastUpdated: string;
}

const KPI_DATA: KPIRecord[] = [
  { employeeId: "E001", totalKPI: 12, submittedKPI: 12, avgAchievement: 94, perspektifBreakdown: [{ name: "Finansial", avg: 98 }, { name: "Proses", avg: 91 }, { name: "EHS", avg: 95 }, { name: "Customer", avg: 90 }, { name: "L&G", avg: 96 }], rcaRequired: 0, rcaCompleted: 0, status: "Submitted", lastUpdated: "2026-05-30" },
  { employeeId: "E002", totalKPI: 8,  submittedKPI: 8,  avgAchievement: 78, perspektifBreakdown: [{ name: "Finansial", avg: 80 }, { name: "Proses", avg: 72 }, { name: "EHS", avg: 85 }, { name: "Customer", avg: 75 }, { name: "L&G", avg: 78 }], rcaRequired: 2, rcaCompleted: 2, status: "Submitted", lastUpdated: "2026-05-28" },
  { employeeId: "E003", totalKPI: 10, submittedKPI: 10, avgAchievement: 88, perspektifBreakdown: [{ name: "Finansial", avg: 95 }, { name: "Proses", avg: 82 }, { name: "EHS", avg: 90 }, { name: "Customer", avg: 85 }, { name: "L&G", avg: 88 }], rcaRequired: 1, rcaCompleted: 1, status: "Submitted", lastUpdated: "2026-05-31" },
  { employeeId: "E004", totalKPI: 7,  submittedKPI: 5,  avgAchievement: 65, perspektifBreakdown: [{ name: "Finansial", avg: 60 }, { name: "Proses", avg: 70 }, { name: "EHS", avg: 65 }, { name: "Customer", avg: 62 }, { name: "L&G", avg: 68 }], rcaRequired: 3, rcaCompleted: 1, status: "Draft",     lastUpdated: "2026-05-20" },
  { employeeId: "E005", totalKPI: 9,  submittedKPI: 9,  avgAchievement: 91, perspektifBreakdown: [{ name: "Finansial", avg: 88 }, { name: "Proses", avg: 94 }, { name: "EHS", avg: 92 }, { name: "Customer", avg: 90 }, { name: "L&G", avg: 91 }], rcaRequired: 0, rcaCompleted: 0, status: "Submitted", lastUpdated: "2026-05-29" },
  { employeeId: "E006", totalKPI: 11, submittedKPI: 11, avgAchievement: 82, perspektifBreakdown: [{ name: "Finansial", avg: 78 }, { name: "Proses", avg: 85 }, { name: "EHS", avg: 88 }, { name: "Customer", avg: 80 }, { name: "L&G", avg: 79 }], rcaRequired: 1, rcaCompleted: 1, status: "Submitted", lastUpdated: "2026-06-01" },
  { employeeId: "E007", totalKPI: 6,  submittedKPI: 0,  avgAchievement: 0,  perspektifBreakdown: [],                                                                                                                                                      rcaRequired: 0, rcaCompleted: 0, status: "Belum Mulai", lastUpdated: "-" },
  { employeeId: "E008", totalKPI: 14, submittedKPI: 14, avgAchievement: 97, perspektifBreakdown: [{ name: "Finansial", avg: 100 }, { name: "Proses", avg: 95 }, { name: "EHS", avg: 98 }, { name: "Customer", avg: 96 }, { name: "L&G", avg: 96 }], rcaRequired: 0, rcaCompleted: 0, status: "Submitted", lastUpdated: "2026-06-02" },
  { employeeId: "E009", totalKPI: 7,  submittedKPI: 7,  avgAchievement: 73, perspektifBreakdown: [{ name: "Finansial", avg: 70 }, { name: "Proses", avg: 75 }, { name: "EHS", avg: 80 }, { name: "Customer", avg: 68 }, { name: "L&G", avg: 72 }], rcaRequired: 2, rcaCompleted: 0, status: "Submitted", lastUpdated: "2026-05-25" },
  { employeeId: "E010", totalKPI: 10, submittedKPI: 10, avgAchievement: 86, perspektifBreakdown: [{ name: "Finansial", avg: 84 }, { name: "Proses", avg: 88 }, { name: "EHS", avg: 90 }, { name: "Customer", avg: 82 }, { name: "L&G", avg: 86 }], rcaRequired: 1, rcaCompleted: 1, status: "Submitted", lastUpdated: "2026-05-30" },
  { employeeId: "E011", totalKPI: 6,  submittedKPI: 4,  avgAchievement: 55, perspektifBreakdown: [{ name: "Finansial", avg: 50 }, { name: "Proses", avg: 58 }, { name: "EHS", avg: 60 }, { name: "Customer", avg: 52 }, { name: "L&G", avg: 55 }], rcaRequired: 3, rcaCompleted: 0, status: "Draft",     lastUpdated: "2026-05-15" },
  { employeeId: "E012", totalKPI: 9,  submittedKPI: 9,  avgAchievement: 89, perspektifBreakdown: [{ name: "Finansial", avg: 85 }, { name: "Proses", avg: 92 }, { name: "EHS", avg: 94 }, { name: "Customer", avg: 88 }, { name: "L&G", avg: 86 }], rcaRequired: 0, rcaCompleted: 0, status: "Submitted", lastUpdated: "2026-05-31" },
  { employeeId: "E013", totalKPI: 8,  submittedKPI: 8,  avgAchievement: 84, perspektifBreakdown: [{ name: "Finansial", avg: 82 }, { name: "Proses", avg: 86 }, { name: "EHS", avg: 88 }, { name: "Customer", avg: 80 }, { name: "L&G", avg: 84 }], rcaRequired: 1, rcaCompleted: 1, status: "Submitted", lastUpdated: "2026-06-01" },
  { employeeId: "E014", totalKPI: 7,  submittedKPI: 6,  avgAchievement: 71, perspektifBreakdown: [{ name: "Finansial", avg: 68 }, { name: "Proses", avg: 74 }, { name: "EHS", avg: 76 }, { name: "Customer", avg: 70 }, { name: "L&G", avg: 67 }], rcaRequired: 2, rcaCompleted: 1, status: "Draft",     lastUpdated: "2026-05-22" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  Submitted:    { bg: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  Draft:        { bg: "bg-amber-100 text-amber-700",  icon: Clock },
  "Belum Mulai":{ bg: "bg-gray-100 text-gray-500",   icon: AlertCircle },
};

function AchievementBar({ value }: { value: number }) {
  const achieved = value >= 100;
  const barColor  = value === 0 ? "bg-gray-200" : achieved ? "bg-green-500" : "bg-rose-500";
  const textColor = value === 0 ? "text-gray-400" : achieved ? "text-green-700" : "text-rose-600";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${textColor}`}>{value > 0 ? `${value}%` : "—"}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function HRMonitoringKPI({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("Semua Unit");
  const [statusFilter, setStatusFilter] = useState("Semua Status");

  const filteredEmployees = lockedUnits ? EMPLOYEES.filter(e => lockedUnits.includes(e.unit)) : EMPLOYEES;
  const filteredKPI = lockedUnits
    ? KPI_DATA.filter(k => filteredEmployees.some(e => e.id === k.employeeId))
    : KPI_DATA;

  const rows = filteredEmployees.map((emp) => ({
    emp,
    kpi: KPI_DATA.find((k) => k.employeeId === emp.id)!,
  })).filter(({ emp, kpi }) => {
    const q = search.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.unit.toLowerCase().includes(q) || emp.division.toLowerCase().includes(q);
    const matchUnit = unitFilter === "Semua Unit" || emp.unit === unitFilter;
    const matchStatus = statusFilter === "Semua Status" || kpi.status === statusFilter;
    return matchSearch && matchUnit && matchStatus;
  });

  const hasActiveFilters = unitFilter !== "Semua Unit" || statusFilter !== "Semua Status";

  const totalSubmitted = filteredKPI.filter((k) => k.status === "Submitted").length;
  const totalDraft     = filteredKPI.filter((k) => k.status === "Draft").length;
  const totalBlm       = filteredKPI.filter((k) => k.status === "Belum Mulai").length;
  const avgKPIList     = filteredKPI.filter((k) => k.avgAchievement > 0);
  const avgAch         = avgKPIList.length ? Math.round(avgKPIList.reduce((s, k) => s + k.avgAchievement, 0) / avgKPIList.length) : 0;
  const rcaPending     = filteredKPI.reduce((s, k) => s + (k.rcaRequired - k.rcaCompleted), 0);

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">KPI Monitoring</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          </div>
          <p className="text-gray-500 text-sm">Monitor KPI achievement of all employees — Mid-Year Measurement</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: filteredEmployees.length, sub: "registered", color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Submitted", value: totalSubmitted, sub: `${totalDraft} draft · ${totalBlm} not started`, color: "text-green-700", bg: "bg-green-50" },
          { label: "Avg. Achievement", value: `${avgAch}%`, sub: "across all active KPIs", color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Pending RCA", value: rcaPending, sub: "requires follow-up", color: "text-rose-700", bg: "bg-rose-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, division, unit..." className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className="text-sm outline-none bg-transparent text-gray-600 cursor-pointer">
            <option value="Semua Unit">Semua Unit</option>
            {(lockedUnits ?? COMPANY_UNITS).map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm outline-none bg-transparent text-gray-600 cursor-pointer">
            {["All Status", "Submitted", "Draft", "Belum Mulai"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {hasActiveFilters && (
          <button onClick={() => { setUnitFilter("Semua Unit"); setStatusFilter("Semua Status"); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        )}
        <span className="ml-auto text-xs text-gray-400">{rows.length} employees shown</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-5">Employee</th>
                <th className="py-3 px-5">Company Unit</th>
                <th className="py-3 px-5 text-center">Total KPI</th>
                <th className="py-3 px-5 text-center">Submitted</th>
                <th className="py-3 px-5">Avg. Achievement</th>
                <th className="py-3 px-5 text-center">RCA Req.</th>
                <th className="py-3 px-5 text-center">RCA Done</th>
                <th className="py-3 px-5">Status</th>
                <th className="py-3 px-5">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ emp, kpi }) => {
                const st = STATUS_STYLE[kpi.status];
                const Icon = st.icon;
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                      <p className="text-xs text-gray-400">{emp.position}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700">{emp.unit}</p>
                      <p className="text-xs text-gray-400">{emp.division}</p>
                    </td>
                    <td className="py-3.5 px-5 text-center text-sm font-medium text-gray-700">{kpi.totalKPI}</td>
                    <td className="py-3.5 px-5 text-center text-sm font-medium text-gray-700">{kpi.submittedKPI}/{kpi.totalKPI}</td>
                    <td className="py-3.5 px-5"><AchievementBar value={kpi.avgAchievement} /></td>
                    <td className="py-3.5 px-5 text-center">
                      <span className={`text-sm font-semibold ${kpi.rcaRequired > 0 ? "text-rose-600" : "text-gray-400"}`}>{kpi.rcaRequired}</span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      {kpi.rcaRequired > 0 ? (
                        <span className={`text-sm font-semibold ${kpi.rcaCompleted === kpi.rcaRequired ? "text-green-600" : "text-amber-600"}`}>
                          {kpi.rcaCompleted}/{kpi.rcaRequired}
                        </span>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${st.bg}`}>
                        <Icon className="w-3 h-3" />
                        {kpi.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-xs text-gray-500">{kpi.lastUpdated}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No data matches the selected filter.</div>
        )}
      </div>

      {/* Perspektif breakdown legend */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-[#1A284F] mb-4">Avg. Achievement by Perspective</h3>
        <div className="flex flex-wrap gap-6">
          {["Finansial", "Proses", "EHS", "Customer", "L&G"].map((p) => {
            const vals = KPI_DATA.flatMap((k) => k.perspektifBreakdown.filter((b) => b.name === p).map((b) => b.avg));
            const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
            const color = avg >= 90 ? "bg-green-500" : avg >= 75 ? "bg-blue-500" : avg >= 60 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={p} className="flex flex-col gap-1 min-w-[100px]">
                <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                  <span>{p}</span><span className="font-semibold text-gray-700">{avg}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${avg}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
