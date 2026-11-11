import { useState, useEffect } from "react";
import { Search, MessageSquare, CheckCircle2, AlertCircle, Filter, Calendar } from "lucide-react";
import { EMPLOYEES, COMPANY_UNITS, filterMonitoringByModuleAccess } from "./monitoringData";
import { getPenilai1Score, subscribeScores } from "../../supervisor/managementInterviewScoreStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MIRecord {
  employeeId:    string;
  scheduledDate: string | null;
  interviewers:  [string, string, string, string];
  status:        "Selesai" | "Dijadwalkan" | "Belum Dijadwalkan";
  penilaiScores: [number | null, number | null, number | null, number | null];
  notes:         string;
}

// 4 shared interviewers for PT RSUP (Industry) sessions
const INTERVIEWERS: [string, string, string, string] = [
  "Direktur Operasional",
  "Direktur Keuangan",
  "Direktur Produksi",
  "Direktur Pemasaran",
];

// ─── Mock data ────────────────────────────────────────────────────────────────
// PT RSUP (Industry): E002, E011, E013, E014 → Dijadwalkan
// All others → Belum Dijadwalkan

const MI_DATA: MIRecord[] = [];
const _UNUSED_MI_DATA: MIRecord[] = [
  // ── PT RSUP (Industry) — Scheduled ───────────────────────────────────────
  {
    employeeId: "E002", scheduledDate: "2026-07-15",
    interviewers: INTERVIEWERS, status: "Dijadwalkan",
    penilaiScores: [null, null, null, null], notes: "",
  },
  {
    employeeId: "E011", scheduledDate: "2026-07-15",
    interviewers: INTERVIEWERS, status: "Dijadwalkan",
    penilaiScores: [null, null, null, null], notes: "",
  },
  {
    employeeId: "E013", scheduledDate: "2026-07-15",
    interviewers: INTERVIEWERS, status: "Dijadwalkan",
    penilaiScores: [null, null, null, null], notes: "",
  },
  {
    employeeId: "E014", scheduledDate: "2026-07-15",
    interviewers: INTERVIEWERS, status: "Dijadwalkan",
    penilaiScores: [null, null, null, null], notes: "",
  },
  // ── All other employees — Unscheduled ─────────────────────────────────────
  { employeeId: "E001", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E003", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E004", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E005", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E006", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E007", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E008", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E009", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E010", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
  { employeeId: "E012", scheduledDate: null, interviewers: INTERVIEWERS, status: "Belum Dijadwalkan", penilaiScores: [null, null, null, null], notes: "" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  Selesai:             { bg: "bg-green-100 text-green-700", icon: CheckCircle2 },
  Dijadwalkan:         { bg: "bg-blue-100 text-blue-700",   icon: Calendar     },
  "Belum Dijadwalkan": { bg: "bg-gray-100 text-gray-500",   icon: AlertCircle  },
};

// score (1–5) → percentage (0–100)
function toPercent(score: number): number {
  return Math.round((score / 5) * 100 * 100) / 100;
}

// average of non-null 1–5 scores → percentage
function computeFinalScore(scores: (number | null)[]): number | null {
  const valid = scores.filter((s): s is number => s !== null);
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return toPercent(avg);
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-xs">—</span>;
  const pct = toPercent(score);
  const c = pct >= 90 ? "text-green-700 bg-green-100"
    : pct >= 70 ? "text-blue-700 bg-blue-100"
    : pct >= 50 ? "text-amber-700 bg-amber-100"
    : "text-rose-700 bg-rose-100";
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${c}`}>{pct.toFixed(2)}%</span>;
}

function FinalScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-xs">—</span>;
  const c = score >= 90 ? "text-green-700 bg-green-100 border-green-200"
    : score >= 70 ? "text-blue-700 bg-blue-100 border-blue-200"
    : score >= 50 ? "text-amber-700 bg-amber-100 border-amber-200"
    : "text-rose-700 bg-rose-100 border-rose-200";
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${c}`}>{score.toFixed(2)}%</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HRMonitoringManagementInterview({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const [search, setSearch]           = useState("");
  const [unitFilter, setUnitFilter]   = useState("Semua Unit");
  const [statusFilter, setStatusFilter] = useState("Semua Status");
  const [, forceUpdate] = useState(0);

  useEffect(() => subscribeScores(() => forceUpdate(n => n + 1)), []);

  const filteredEmployees = filterMonitoringByModuleAccess(
    lockedUnits ? EMPLOYEES.filter(e => lockedUnits.includes(e.unit)) : EMPLOYEES,
    "Management Interview",
  );

  // Merge static MI_DATA with live Score Penilai 1 from BOD assessment
  const mergedMI = MI_DATA.map(rec => {
    const live = getPenilai1Score(rec.employeeId);
    const penilaiScores: [number | null, number | null, number | null, number | null] =
      live !== null
        ? [live, rec.penilaiScores[1], rec.penilaiScores[2], rec.penilaiScores[3]]
        : rec.penilaiScores;
    return { ...rec, penilaiScores };
  });

  const allRows = filteredEmployees.map((emp) => {
    const live = getPenilai1Score(emp.id);
    const found = mergedMI.find((k) => k.employeeId === emp.id);
    const mi: MIRecord = found ?? {
      employeeId: emp.id,
      status: live !== null ? "Selesai" : "Belum Dijadwalkan",
      penilaiScores: [live, null, null, null],
    };
    return { emp, mi };
  });
  const filteredMI = allRows.map((r) => r.mi);

  const baseRows = allRows.filter(({ emp, mi }) => {
    if (!mi) return false;
    const q = search.toLowerCase();
    const matchSearch = !q
      || emp.name.toLowerCase().includes(q)
      || emp.id.toLowerCase().includes(q)
      || emp.unit.toLowerCase().includes(q)
      || emp.division.toLowerCase().includes(q)
      || emp.position.toLowerCase().includes(q);
    const matchUnit   = unitFilter   === "Semua Unit"   || emp.unit   === unitFilter;
    const matchStatus = statusFilter === "Semua Status" || mi.status  === statusFilter;
    return matchSearch && matchUnit && matchStatus;
  });

  // Sort: rows with a live Score Penilai 1 (most recently updated) first
  baseRows.sort((a, b) => {
    if (a.emp.isSelf !== b.emp.isSelf) return a.emp.isSelf ? -1 : 1;
    const aHasScore = getPenilai1Score(a.emp.id) !== null ? 0 : 1;
    const bHasScore = getPenilai1Score(b.emp.id) !== null ? 0 : 1;
    if (aHasScore !== bHasScore) return aHasScore - bHasScore;
    // Secondary: PT RSUP (Industry) first among equal groups
    const aIsRSUP = a.emp.unit === "PT RSUP (Industry)" ? 0 : 1;
    const bIsRSUP = b.emp.unit === "PT RSUP (Industry)" ? 0 : 1;
    return aIsRSUP - bIsRSUP;
  });

  // Numbered rows after filtering
  const rows = baseRows.map((r, idx) => ({ ...r, no: idx + 1 }));

  const hasActiveFilters = unitFilter !== "Semua Unit" || statusFilter !== "Semua Status";

  const done         = filteredMI.filter(k => k.status === "Selesai").length;
  const scheduled    = filteredMI.filter(k => k.status === "Dijadwalkan").length;
  const notScheduled = filteredMI.filter(k => k.status === "Belum Dijadwalkan").length;
  const validFinals  = filteredMI.map(k => computeFinalScore(k.penilaiScores)).filter((s): s is number => s !== null);
  const avgScore     = validFinals.length
    ? (validFinals.reduce((a, b) => a + b, 0) / validFinals.length).toFixed(2)
    : "—";

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">Management Interview Monitoring</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          </div>
          <p className="text-gray-500 text-sm">Monitor management interview status and results for all employees</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees",    value: filteredEmployees.length, sub: "registered",          color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Interview Done",     value: done,                     sub: "completed",            color: "text-green-700", bg: "bg-green-50"    },
          { label: "Scheduled",          value: scheduled,                sub: "awaiting execution",   color: "text-blue-700",  bg: "bg-blue-50"     },
          { label: "Not Yet Scheduled",  value: notScheduled,             sub: `Avg score: ${avgScore}`, color: "text-amber-700", bg: "bg-amber-50"  },
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, ID, division, unit..."
            className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400"
          />
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
            {["Semua Status", "Selesai", "Dijadwalkan", "Belum Dijadwalkan"].map((s) => <option key={s}>{s}</option>)}
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
          <table className="text-left border-collapse" style={{ minWidth: "1800px" }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-3 text-center">No.</th>
                <th className="py-3 px-3">Emp. ID</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Company Unit</th>
                <th className="py-3 px-4">Division</th>
                <th className="py-3 px-4">Position</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Interview Date</th>
                <th className="py-3 px-4">Interviewer</th>
                <th className="py-3 px-3 text-center">Score Penilai 1</th>
                <th className="py-3 px-3 text-center">Score Penilai 2</th>
                <th className="py-3 px-3 text-center">Score Penilai 3</th>
                <th className="py-3 px-3 text-center">Score Penilai 4</th>
                <th className="py-3 px-4 text-center">Final Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ no, emp, mi }) => {
                const st          = STATUS_STYLE[mi.status];
                const Icon        = st.icon;
                const finalScore  = computeFinalScore(mi.penilaiScores);
                return (
                  <tr key={emp.id} className={emp.isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/60 transition-colors"}>
                    <td className="py-3 px-3 text-center text-xs font-semibold text-gray-400">{no}</td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded">{emp.id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{emp.name}</p>
                        {emp.isSelf && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Data Saya
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-gray-600 leading-snug">{emp.unit}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-gray-600 leading-snug">{emp.division}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-xs text-gray-600 leading-snug">{emp.position}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${st.bg}`}>
                        <Icon className="w-3 h-3" />{mi.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {mi.scheduledDate
                        ? <span className="text-xs text-gray-700 whitespace-nowrap">{mi.scheduledDate}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      {mi.status !== "Belum Dijadwalkan" ? (
                        <span className="text-[10px] font-medium text-indigo-700">
                          {mi.interviewers.join(", ")}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    {mi.penilaiScores.map((score, i) => (
                      <td key={i} className="py-3 px-3 text-center">
                        <ScoreBadge score={score} />
                      </td>
                    ))}
                    <td className="py-3 px-4 text-center">
                      <FinalScoreBadge score={finalScore} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No data matches the selected filter.</div>
        )}
        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-4">
          <span>{rows.length} of {filteredEmployees.length} employees shown</span>
          <span className="text-gray-300">·</span>
          <span>Final Score = average of Score Penilai 1–4 (from assessment modal)</span>
        </div>
      </div>
    </div>
  );
}
