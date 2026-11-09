import { loadMSSelfRatings, loadAllMSApprovers } from "../../shared/msStore";
import { useAppraisalRevision } from "../../shared/useAppraisalRevision";
import { useState } from "react";
import { Search, Briefcase, CheckCircle2, AlertCircle, Clock, Filter } from "lucide-react";
import { EMPLOYEES, COMPANY_UNITS } from "./monitoringData";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface MSRecord {
  employeeId: string;
  selfStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  supervisorStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  items: { no: number; selfScore: number; supScore: number }[];
  lastUpdated: string;
}

const MS_DATA: MSRecord[] = [
  {
    employeeId: "E001", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-05-30",
    items: [
      { no: 1, selfScore: 4, supScore: 4 },
      { no: 2, selfScore: 4, supScore: 4 },
      { no: 3, selfScore: 4, supScore: 4 },
      { no: 4, selfScore: 4, supScore: 4 },
      { no: 5, selfScore: 4, supScore: 4 },
    ],
  },
  {
    employeeId: "E003", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-05-31",
    items: [
      { no: 1, selfScore: 5, supScore: 4 },
      { no: 2, selfScore: 5, supScore: 4 },
      { no: 3, selfScore: 4, supScore: 4 },
      { no: 4, selfScore: 5, supScore: 5 },
      { no: 5, selfScore: 4, supScore: 4 },
    ],
  },
  {
    employeeId: "E005", selfStatus: "Selesai", supervisorStatus: "Dalam Proses", lastUpdated: "2026-05-29",
    items: [
      { no: 1, selfScore: 4, supScore: 0 },
      { no: 2, selfScore: 4, supScore: 0 },
      { no: 3, selfScore: 4, supScore: 0 },
      { no: 4, selfScore: 4, supScore: 0 },
      { no: 5, selfScore: 4, supScore: 0 },
    ],
  },
  {
    employeeId: "E006", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-06-01",
    items: [
      { no: 1, selfScore: 4, supScore: 4 },
      { no: 2, selfScore: 4, supScore: 3 },
      { no: 3, selfScore: 3, supScore: 3 },
      { no: 4, selfScore: 4, supScore: 4 },
      { no: 5, selfScore: 4, supScore: 4 },
    ],
  },
  {
    employeeId: "E008", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-06-02",
    items: [
      { no: 1, selfScore: 5, supScore: 5 },
      { no: 2, selfScore: 5, supScore: 5 },
      { no: 3, selfScore: 5, supScore: 5 },
      { no: 4, selfScore: 5, supScore: 5 },
      { no: 5, selfScore: 5, supScore: 4 },
    ],
  },
  {
    employeeId: "E010", selfStatus: "Dalam Proses", supervisorStatus: "Belum Mulai", lastUpdated: "2026-05-20",
    items: [],
  },
  {
    employeeId: "E012", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-05-31",
    items: [
      { no: 1, selfScore: 4, supScore: 4 },
      { no: 2, selfScore: 4, supScore: 4 },
      { no: 3, selfScore: 4, supScore: 4 },
      { no: 4, selfScore: 4, supScore: 4 },
      { no: 5, selfScore: 4, supScore: 4 },
    ],
  },
  {
    employeeId: "E013", selfStatus: "Selesai", supervisorStatus: "Selesai", lastUpdated: "2026-06-01",
    items: [
      { no: 1, selfScore: 4, supScore: 4 },
      { no: 2, selfScore: 3, supScore: 4 },
      { no: 3, selfScore: 4, supScore: 3 },
      { no: 4, selfScore: 4, supScore: 4 },
      { no: 5, selfScore: 3, supScore: 3 },
    ],
  },
  {
    employeeId: "E014", selfStatus: "Dalam Proses", supervisorStatus: "Belum Mulai", lastUpdated: "2026-05-22",
    items: [],
  },
];

const MS_ITEM_LABELS = [
  "Kepemimpinan",
  "Keselarasan Organisasi",
  "Perencanaan Penerus",
  "Resolusi Konflik Internal",
  "Resolusi Konflik Eksternal",
];

const STATUS_STYLE = {
  Selesai:        { bg: "bg-green-100 text-green-700", icon: CheckCircle2 },
  "Dalam Proses": { bg: "bg-amber-100 text-amber-700", icon: Clock },
  "Belum Mulai":  { bg: "bg-gray-100 text-gray-500",  icon: AlertCircle },
};

function avg(items: { selfScore: number; supScore: number }[], key: "selfScore" | "supScore") {
  const vals = items.map((i) => i[key]).filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function ScorePill({ score, label, asPercent = false }: { score: number; label: string; asPercent?: boolean }) {
  if (score === 0) return <span className="text-gray-300 text-sm">—</span>;
  const pct = Math.round(score * 20);
  const color = pct >= 90 ? "text-green-700 bg-green-100" : pct >= 70 ? "text-blue-700 bg-blue-100" : pct >= 50 ? "text-amber-700 bg-amber-100" : "text-rose-700 bg-rose-100";
  return (
    <span className={`inline-flex flex-col items-center px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>
      <span>{asPercent ? `${pct}%` : score.toFixed(1)}</span>
      <span className="text-[9px] font-normal opacity-70">{label}</span>
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HRMonitoringManagerialSkill({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  useAppraisalRevision();
  const self = loadMSSelfRatings();
  const first = loadAllMSApprovers().find((entry) => entry.approverLevel === 1);
  const data: MSRecord[] = self ? [...MS_DATA.filter((record) => record.employeeId !== "E002"), { employeeId: "E002", selfStatus: "Selesai", supervisorStatus: first ? "Selesai" : "Belum Mulai", items: Object.entries(self.ratings).map(([no, score]) => ({ no: Number(no), selfScore: score, supScore: first?.ratings[Number(no)] ?? 0 })), lastUpdated: first?.reviewedDate ?? self.submittedAt }] : MS_DATA;
  const [search, setSearch]       = useState("");
  const [unitFilter, setUnitFilter] = useState("Semua Unit");

  const supervisors = EMPLOYEES.filter((e) => (e.isSupervisor || (e.id === "E002" && !!self)) && (!lockedUnits || lockedUnits.includes(e.unit)));

  const rows = supervisors.map((emp) => ({
    emp,
    ms: data.find((k) => k.employeeId === emp.id),
  })).filter(({ emp }) => {
    const q = search.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.unit.toLowerCase().includes(q) || emp.division.toLowerCase().includes(q);
    const matchUnit = unitFilter === "Semua Unit" || emp.unit === unitFilter;
    return matchSearch && matchUnit;
  });

  const hasActiveFilters = unitFilter !== "Semua Unit";

  const filteredMS = lockedUnits
    ? data.filter(k => supervisors.some(e => e.id === k.employeeId))
    : data;
  const selfDone  = filteredMS.filter((k) => k.selfStatus === "Selesai").length;
  const supDone   = filteredMS.filter((k) => k.supervisorStatus === "Selesai").length;
  const bothDone  = filteredMS.filter((k) => k.selfStatus === "Selesai" && k.supervisorStatus === "Selesai").length;
  const validFinal = filteredMS.filter((k) => k.supervisorStatus === "Selesai" && k.items.length > 0);
  const avgFinal  = validFinal.length
    ? (validFinal.reduce((s, k) => s + avg(k.items, "supScore"), 0) / validFinal.length).toFixed(2)
    : "—";

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-5 h-5 text-purple-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Managerial Skill Monitoring</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
        </div>
        <p className="text-gray-500 text-sm">Monitor managerial skill assessment — for Supervisor level and above</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Supervisors", value: supervisors.length, sub: "required to complete", color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Self-Assessment Done", value: selfDone, sub: `${Math.max(0, supervisors.length - selfDone)} not yet complete`, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Supervisor Assessment Done", value: supDone, sub: `${Math.max(0, supervisors.length - supDone)} not yet complete`, color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Avg. Final Score", value: avgFinal, sub: `${bothDone} fully completed`, color: "text-green-700", bg: "bg-green-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
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
        {hasActiveFilters && (
          <button onClick={() => setUnitFilter("Semua Unit")} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        )}
        <span className="ml-auto text-xs text-gray-400">{rows.length} supervisors shown</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-5">Employee</th>
                <th className="py-3 px-5">Company Unit</th>
                <th className="py-3 px-5">Self-Assessment</th>
                <th className="py-3 px-5">Supervisor Assessment</th>
                <th className="py-3 px-5 text-center">Self Score</th>
                <th className="py-3 px-5 text-center">Approver 1 Score</th>
                <th className="py-3 px-5 text-center">Approver 2 Score</th>
                <th className="py-3 px-5 text-center">Final Score</th>
                <th className="py-3 px-5">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ emp, ms }) => {
                const selfSt = STATUS_STYLE[ms?.selfStatus ?? "Belum Mulai"];
                const supSt  = STATUS_STYLE[ms?.supervisorStatus ?? "Belum Mulai"];
                const SelfIcon = selfSt.icon;
                const SupIcon  = supSt.icon;
                const selfAvg    = ms?.items.length ? avg(ms.items, "selfScore") : 0;
                const approver1  = ms?.supervisorStatus === "Selesai" && ms.items.length ? avg(ms.items, "supScore") : 0;
                const approver2  = 0;
                const finalAvg   = ms?.selfStatus === "Selesai" && ms.supervisorStatus === "Selesai" && ms.items.length
                  ? (selfAvg + approver1) / 2 : 0;
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
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selfSt.bg}`}>
                        <SelfIcon className="w-3 h-3" />{ms?.selfStatus ?? "Belum Mulai"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${supSt.bg}`}>
                        <SupIcon className="w-3 h-3" />{ms?.supervisorStatus ?? "Belum Mulai"}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={selfAvg} label="self" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={approver1} label="appr. 1" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={approver2} label="appr. 2" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={finalAvg} label="final" asPercent /></td>
                    <td className="py-3.5 px-5 text-xs text-gray-500">{ms?.lastUpdated ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">No data matches the selected filter.</div>}
      </div>

      {/* Avg breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-[#1A284F] mb-4">Avg. Score per Managerial Competency (Supervisor Assessment)</h3>
        <div className="flex flex-wrap gap-6">
          {MS_ITEM_LABELS.map((label, idx) => {
            const no = idx + 1;
            const vals = data.flatMap((k) => k.items.filter((i) => i.no === no && i.supScore > 0).map((i) => i.supScore));
            const a = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
            const color = a >= 4.5 ? "bg-green-500" : a >= 3.5 ? "bg-purple-500" : a >= 2.5 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={label} className="flex flex-col gap-1 min-w-[160px]">
                <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                  <span>{label}</span><span className="font-semibold text-gray-700">{a > 0 ? a.toFixed(1) : "—"}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: a > 0 ? `${(a / 5) * 100}%` : "0%" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
