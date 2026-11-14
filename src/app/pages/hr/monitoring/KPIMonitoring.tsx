import { useEffect, useState } from "react";
import { Search, TrendingUp, CheckCircle2, AlertCircle, Clock, Filter } from "lucide-react";
import { EMPLOYEES, COMPANY_UNITS, filterMonitoringByModuleAccess } from "./monitoringData";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../../shared/appraisalWorkflowStore";
import { dateToSortableKey, normalizeDateDDMMYYYY } from "../../../utils/dateFormat";

// ─── Mock KPI data per employee ───────────────────────────────────────────────

type KPIWorkflowStatus =
  | "Unsubmitted"
  | "Pending-Check"
  | "Pending-Approver 1"
  | "Pending-Approver 2"
  | "Pending-Validate"
  | "Revision"
  | "Validated";

interface KPIRecord {
  employeeId: string;
  totalKPI: number;
  submittedKPI: number;
  avgAchievement: number; // percent
  perspektifBreakdown: { name: string; avg: number }[];
  rcaRequired: number;
  rcaCompleted: number;
  status: KPIWorkflowStatus;
  measurementStatus: KPIWorkflowStatus;
  lastUpdated: string;
}

const KPI_DATA: KPIRecord[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; icon: React.ElementType }> = {
  "Unsubmitted":        { bg: "bg-gray-100 text-gray-500",    icon: AlertCircle },
  "Pending-Check":      { bg: "bg-amber-100 text-amber-700",  icon: Clock },
  "Pending-Approver 1": { bg: "bg-amber-100 text-amber-700",  icon: Clock },
  "Pending-Approver 2": { bg: "bg-sky-100 text-sky-700",      icon: Clock },
  "Pending-Validate":   { bg: "bg-indigo-100 text-indigo-700",icon: Clock },
  "Revision":           { bg: "bg-orange-100 text-orange-700",icon: AlertCircle },
  "Validated":          { bg: "bg-green-100 text-green-700",  icon: CheckCircle2 },
};

function resolveKpiPhaseStatus(rec?: WorkflowRecord): KPIWorkflowStatus {
  if (!rec) return "Unsubmitted";
  const val = rec.decisions.validator?.status ?? "";
  const a2 = rec.decisions.approver2?.status ?? "";
  const a1 = rec.decisions.approver1?.status ?? "";
  const chk = rec.decisions.checker?.status ?? "";
  if (val === "Revision" || a2 === "Revision" || a1 === "Revision" || chk === "Revision") {
    return "Revision";
  }
  if (val === "Validated" || a2 === "Validated") {
    return "Validated";
  }
  if (a2 === "Approved" || a2.startsWith("Assessed")) {
    return "Pending-Validate";
  }
  if (a1 === "Approved" || a1.startsWith("Assessed")) {
    return "Pending-Approver 2";
  }
  if (chk && chk !== "Revision") {
    return "Pending-Approver 1";
  }
  return "Pending-Check";
}

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
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("Semua Unit");
  const [statusFilter, setStatusFilter] = useState("Semua Status");

  const filteredEmployees = filterMonitoringByModuleAccess(
    lockedUnits ? EMPLOYEES.filter(e => lockedUnits.includes(e.unit)) : EMPLOYEES,
    "KPI (Setting/Measurement)",
  );
  const workflows = loadWorkflowRecords();

  const allRows = filteredEmployees.map((emp) => {
    const normId = normalizeEmployeeId(emp.id);
    const wfSet = workflows.find(
      (w) => w.year === "2026" && w.module === "KPI" && w.phase === "setting" && (w.employeeId === normId || w.employeeId.toLowerCase() === emp.id.toLowerCase()),
    );
    const wfMeas = workflows.find(
      (w) => w.year === "2026" && w.module === "KPI" && w.phase === "measurement" && (w.employeeId === normId || w.employeeId.toLowerCase() === emp.id.toLowerCase()),
    );
    const settingStatus = resolveKpiPhaseStatus(wfSet);
    const measurementStatus = resolveKpiPhaseStatus(wfMeas);
    const hasAny = Boolean(wfSet || wfMeas);
    const latestKpiDate = [
      wfMeas?.decisions.validator?.date,
      wfMeas?.decisions.approver2?.date,
      wfMeas?.decisions.approver1?.date,
      wfMeas?.decisions.checker?.date,
      wfMeas?.submittedDate,
      wfSet?.decisions.validator?.date,
      wfSet?.decisions.approver2?.date,
      wfSet?.decisions.approver1?.date,
      wfSet?.decisions.checker?.date,
      wfSet?.submittedDate,
    ]
      .filter((d): d is string => Boolean(d && d !== "-" && d !== "—"))
      .sort((a, b) => dateToSortableKey(a).localeCompare(dateToSortableKey(b)))
      .pop();
    const kpi: KPIRecord = hasAny
      ? {
          employeeId: emp.id,
          totalKPI: 8,
          submittedKPI: wfMeas ? 8 : 0,
          avgAchievement: wfMeas ? 85 : 0,
          perspektifBreakdown: [],
          rcaRequired: 0,
          rcaCompleted: 0,
          status: settingStatus,
          measurementStatus,
          lastUpdated: normalizeDateDDMMYYYY(latestKpiDate),
        }
      : {
          employeeId: emp.id,
          totalKPI: 0,
          submittedKPI: 0,
          avgAchievement: 0,
          perspektifBreakdown: [],
          rcaRequired: 0,
          rcaCompleted: 0,
          status: "Unsubmitted",
          measurementStatus: "Unsubmitted",
          lastUpdated: "-",
        };
    return { emp, kpi };
  });
  const filteredKPI = allRows.map((r) => r.kpi);

  const rows = allRows.filter(({ emp, kpi }) => {
    const q = search.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.unit.toLowerCase().includes(q) || emp.division.toLowerCase().includes(q);
    const matchUnit = unitFilter === "Semua Unit" || emp.unit === unitFilter;
    const matchStatus = statusFilter === "Semua Status" || statusFilter === "All Status" || kpi.status === statusFilter;
    return matchSearch && matchUnit && matchStatus;
  });

  const hasActiveFilters = unitFilter !== "Semua Unit" || statusFilter !== "Semua Status";

  const totalSubmitted = filteredKPI.filter((k) => k.status === "Validated").length;
  const totalDraft     = filteredKPI.filter((k) => k.status !== "Unsubmitted" && k.status !== "Validated").length;
  const totalBlm       = filteredKPI.filter((k) => k.status === "Unsubmitted").length;
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
            {["All Status", "Unsubmitted", "Pending-Check", "Pending-Approver 1", "Pending-Approver 2", "Pending-Validate", "Revision", "Validated"].map((s) => <option key={s}>{s}</option>)}
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
                <th className="py-3 px-5">KPI Setting Status</th>
                <th className="py-3 px-5">KPI Measurement Status</th>
                <th className="py-3 px-5">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ emp, kpi }) => {
                const st = STATUS_STYLE[kpi.status] ?? STATUS_STYLE["Unsubmitted"];
                const Icon = st.icon;
                const mst = STATUS_STYLE[kpi.measurementStatus] ?? STATUS_STYLE["Unsubmitted"];
                const MIcon = mst.icon;
                return (
                  <tr key={emp.id} className={emp.isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/60 transition-colors"}>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{emp.name}</p>
                        {emp.isSelf && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Data Saya
                          </span>
                        )}
                      </div>
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
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${mst.bg}`}>
                        <MIcon className="w-3 h-3" />
                        {kpi.measurementStatus}
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
            const vals = (filteredKPI.length ? filteredKPI : KPI_DATA).flatMap((k) => k.perspektifBreakdown.filter((b) => b.name === p).map((b) => b.avg));
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
