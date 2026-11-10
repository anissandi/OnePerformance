import { loadAppraisalSelf, loadAllAppraisalApprovers } from "../../shared/appraisalFormStore";
import { useAppraisalRevision } from "../../shared/useAppraisalRevision";
import { useState } from "react";
import { Search, ClipboardList, CheckCircle2, AlertCircle, Clock, Filter } from "lucide-react";
import { EMPLOYEES, COMPANY_UNITS } from "./monitoringData";

// ─── Mock Appraisal Form data ─────────────────────────────────────────────────

interface AFRecord {
  employeeId: string;
  selfAssessmentStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  supervisorAssessmentStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  selfAvgScore: number;    // 1-5
  approver1Score: number;
  approver2Score: number;
  finalScore: number;      // weighted: self 30%, approver1 40%, approver2 30%
  competencies: { name: string; selfScore: number; supScore: number }[];
  lastUpdated: string;
}

const AF_DATA: AFRecord[] = [];
const _UNUSED_AF_DATA: AFRecord[] = [
  {
    employeeId: "E001",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.2, approver1Score: 4.0, approver2Score: 3.9, finalScore: 4.03,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.5, supScore: 4.2 },
      { name: "Kerja Tim", selfScore: 4.0, supScore: 3.8 },
      { name: "Komunikasi", selfScore: 4.2, supScore: 4.1 },
      { name: "Problem Solving", selfScore: 4.1, supScore: 3.9 },
      { name: "Integritas", selfScore: 4.2, supScore: 4.0 },
    ],
    lastUpdated: "2026-05-30",
  },
  {
    employeeId: "E002",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Dalam Proses",
    selfAvgScore: 3.8, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [
      { name: "Kepemimpinan", selfScore: 3.5, supScore: 0 },
      { name: "Kerja Tim", selfScore: 4.0, supScore: 0 },
      { name: "Komunikasi", selfScore: 3.8, supScore: 0 },
      { name: "Problem Solving", selfScore: 3.7, supScore: 0 },
      { name: "Integritas", selfScore: 4.0, supScore: 0 },
    ],
    lastUpdated: "2026-05-28",
  },
  {
    employeeId: "E003",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.5, approver1Score: 4.3, approver2Score: 4.4, finalScore: 4.38,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.8, supScore: 4.5 },
      { name: "Kerja Tim", selfScore: 4.3, supScore: 4.1 },
      { name: "Komunikasi", selfScore: 4.5, supScore: 4.4 },
      { name: "Problem Solving", selfScore: 4.6, supScore: 4.3 },
      { name: "Integritas", selfScore: 4.3, supScore: 4.2 },
    ],
    lastUpdated: "2026-05-31",
  },
  {
    employeeId: "E004",
    selfAssessmentStatus: "Dalam Proses", supervisorAssessmentStatus: "Belum Mulai",
    selfAvgScore: 0, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [],
    lastUpdated: "2026-05-20",
  },
  {
    employeeId: "E005",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.4, approver1Score: 4.2, approver2Score: 4.1, finalScore: 4.22,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.5, supScore: 4.3 },
      { name: "Kerja Tim", selfScore: 4.3, supScore: 4.1 },
      { name: "Komunikasi", selfScore: 4.4, supScore: 4.2 },
      { name: "Problem Solving", selfScore: 4.5, supScore: 4.3 },
      { name: "Integritas", selfScore: 4.3, supScore: 4.1 },
    ],
    lastUpdated: "2026-05-29",
  },
  {
    employeeId: "E006",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 3.9, approver1Score: 3.7, approver2Score: 3.8, finalScore: 3.78,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.0, supScore: 3.8 },
      { name: "Kerja Tim", selfScore: 3.8, supScore: 3.6 },
      { name: "Komunikasi", selfScore: 4.0, supScore: 3.7 },
      { name: "Problem Solving", selfScore: 3.8, supScore: 3.6 },
      { name: "Integritas", selfScore: 3.9, supScore: 3.8 },
    ],
    lastUpdated: "2026-06-01",
  },
  {
    employeeId: "E007",
    selfAssessmentStatus: "Belum Mulai", supervisorAssessmentStatus: "Belum Mulai",
    selfAvgScore: 0, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [],
    lastUpdated: "-",
  },
  {
    employeeId: "E008",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.9, approver1Score: 4.7, approver2Score: 4.8, finalScore: 4.78,
    competencies: [
      { name: "Kepemimpinan", selfScore: 5.0, supScore: 4.8 },
      { name: "Kerja Tim", selfScore: 4.8, supScore: 4.6 },
      { name: "Komunikasi", selfScore: 4.9, supScore: 4.7 },
      { name: "Problem Solving", selfScore: 4.9, supScore: 4.8 },
      { name: "Integritas", selfScore: 4.9, supScore: 4.6 },
    ],
    lastUpdated: "2026-06-02",
  },
  {
    employeeId: "E009",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Dalam Proses",
    selfAvgScore: 3.5, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [
      { name: "Kepemimpinan", selfScore: 3.2, supScore: 0 },
      { name: "Kerja Tim", selfScore: 3.7, supScore: 0 },
      { name: "Komunikasi", selfScore: 3.5, supScore: 0 },
      { name: "Problem Solving", selfScore: 3.4, supScore: 0 },
      { name: "Integritas", selfScore: 3.7, supScore: 0 },
    ],
    lastUpdated: "2026-05-25",
  },
  {
    employeeId: "E010",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.1, approver1Score: 3.9, approver2Score: 3.8, finalScore: 3.92,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.3, supScore: 4.0 },
      { name: "Kerja Tim", selfScore: 4.0, supScore: 3.8 },
      { name: "Komunikasi", selfScore: 4.1, supScore: 3.9 },
      { name: "Problem Solving", selfScore: 4.0, supScore: 3.9 },
      { name: "Integritas", selfScore: 4.1, supScore: 3.9 },
    ],
    lastUpdated: "2026-05-30",
  },
  {
    employeeId: "E011",
    selfAssessmentStatus: "Dalam Proses", supervisorAssessmentStatus: "Belum Mulai",
    selfAvgScore: 0, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [],
    lastUpdated: "2026-05-15",
  },
  {
    employeeId: "E012",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.3, approver1Score: 4.1, approver2Score: 4.0, finalScore: 4.12,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.4, supScore: 4.2 },
      { name: "Kerja Tim", selfScore: 4.2, supScore: 4.0 },
      { name: "Komunikasi", selfScore: 4.3, supScore: 4.1 },
      { name: "Problem Solving", selfScore: 4.4, supScore: 4.2 },
      { name: "Integritas", selfScore: 4.2, supScore: 4.0 },
    ],
    lastUpdated: "2026-05-31",
  },
  {
    employeeId: "E013",
    selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: "Selesai",
    selfAvgScore: 4.0, approver1Score: 3.9, approver2Score: 3.8, finalScore: 3.9,
    competencies: [
      { name: "Kepemimpinan", selfScore: 4.0, supScore: 3.9 },
      { name: "Kerja Tim", selfScore: 4.1, supScore: 3.8 },
      { name: "Komunikasi", selfScore: 3.9, supScore: 3.8 },
      { name: "Problem Solving", selfScore: 4.0, supScore: 3.9 },
      { name: "Integritas", selfScore: 4.0, supScore: 3.8 },
    ],
    lastUpdated: "2026-06-01",
  },
  {
    employeeId: "E014",
    selfAssessmentStatus: "Dalam Proses", supervisorAssessmentStatus: "Belum Mulai",
    selfAvgScore: 0, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [],
    lastUpdated: "2026-05-22",
  },
];

const ASSESS_STYLE = {
  Selesai:        { bg: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  "Dalam Proses": { bg: "bg-amber-100 text-amber-700",  icon: Clock },
  "Belum Mulai":  { bg: "bg-gray-100 text-gray-500",   icon: AlertCircle },
};

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

export function HRMonitoringAppraisalForm({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  useAppraisalRevision();
  const self = loadAppraisalSelf();
  const approvers = loadAllAppraisalApprovers();
  const average = (values: number[]) => values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : 0;
  const data = AF_DATA.map((record): AFRecord => {
    if (record.employeeId !== "E002" || !self) return record;
    const first = approvers.find((entry) => entry.approverLevel === 1);
    const second = approvers.find((entry) => entry.approverLevel === 2);
    const selfAvgScore = average(self.forms.flatMap((form) => Object.values(form.ratings)));
    const approver1Score = average(first?.forms.flatMap((form) => Object.values(form.ratings)) ?? []);
    const approver2Score = average(second?.forms.flatMap((form) => Object.values(form.ratings)) ?? []);
    return { ...record, selfAssessmentStatus: "Selesai", supervisorAssessmentStatus: first ? "Selesai" : "Belum Mulai", selfAvgScore, approver1Score, approver2Score, finalScore: second ? selfAvgScore * .3 + approver1Score * .4 + approver2Score * .3 : 0, competencies: [], lastUpdated: second?.reviewedDate ?? first?.reviewedDate ?? self.submittedAt };
  });
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("Semua Unit");

  const filteredEmployees = lockedUnits ? EMPLOYEES.filter(e => lockedUnits.includes(e.unit)) : EMPLOYEES;
  const allRows = filteredEmployees.map((emp) => ({
    emp,
    af: data.find((k) => k.employeeId === emp.id) ?? {
      employeeId: emp.id,
      selfAssessmentStatus: "Belum Mulai" as const,
      supervisorAssessmentStatus: "Belum Mulai" as const,
      selfAvgScore: 0,
      approver1Score: 0,
      approver2Score: 0,
      finalScore: 0,
      competencies: [],
      lastUpdated: "—",
    },
  }));
  const filteredAF = allRows.map((r) => r.af);

  const rows = allRows.filter(({ emp }) => {
    const q = search.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.unit.toLowerCase().includes(q) || emp.division.toLowerCase().includes(q);
    const matchUnit = unitFilter === "Semua Unit" || emp.unit === unitFilter;
    return matchSearch && matchUnit;
  });

  const hasActiveFilters = unitFilter !== "Semua Unit";

  const selfDone   = filteredAF.filter((k) => k.selfAssessmentStatus === "Selesai").length;
  const supDone    = filteredAF.filter((k) => k.supervisorAssessmentStatus === "Selesai").length;
  const bothDone   = filteredAF.filter((k) => k.selfAssessmentStatus === "Selesai" && k.supervisorAssessmentStatus === "Selesai").length;
  const validScores = filteredAF.filter((k) => k.finalScore > 0);
  const avgFinal   = validScores.length ? (validScores.reduce((s, k) => s + k.finalScore, 0) / validScores.length).toFixed(2) : "—";

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-5 h-5 text-green-600" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">Appraisal Form Monitoring</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          </div>
          <p className="text-gray-500 text-sm">Monitor behavioural competency assessment status of all employees</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: filteredEmployees.length, sub: "registered", color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Self-Assessment Done", value: selfDone, sub: `${filteredEmployees.length - selfDone} not yet complete`, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Supervisor Assessment Done", value: supDone, sub: `${filteredEmployees.length - supDone} not yet complete`, color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Avg. Final Score", value: avgFinal, sub: `${bothDone} employees fully completed`, color: "text-green-700", bg: "bg-green-50" },
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
        {hasActiveFilters && (
          <button onClick={() => setUnitFilter("Semua Unit")} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
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
              {rows.map(({ emp, af }) => {
                const selfSt = ASSESS_STYLE[af.selfAssessmentStatus];
                const supSt  = ASSESS_STYLE[af.supervisorAssessmentStatus];
                const SelfIcon = selfSt.icon;
                const SupIcon  = supSt.icon;
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
                        <SelfIcon className="w-3 h-3" />{af.selfAssessmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${supSt.bg}`}>
                        <SupIcon className="w-3 h-3" />{af.supervisorAssessmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.selfAvgScore} label="self" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.approver1Score} label="appr. 1" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.approver2Score} label="appr. 2" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.finalScore} label="final" asPercent /></td>
                    <td className="py-3.5 px-5 text-xs text-gray-500">{af.lastUpdated}</td>
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

      {/* Competency summary */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-bold text-[#1A284F] mb-4">Avg. Score per Competency (Supervisor Assessment)</h3>
        <div className="flex flex-wrap gap-6">
          {["Kepemimpinan", "Kerja Tim", "Komunikasi", "Problem Solving", "Integritas"].map((comp) => {
            const vals = data.flatMap((k) => k.competencies.filter((c) => c.name === comp && c.supScore > 0).map((c) => c.supScore));
            const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
            const color = avg >= 4.5 ? "bg-green-500" : avg >= 3.5 ? "bg-blue-500" : avg >= 2.5 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={comp} className="flex flex-col gap-1 min-w-[120px]">
                <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                  <span>{comp}</span><span className="font-semibold text-gray-700">{avg > 0 ? avg.toFixed(1) : "—"}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: avg > 0 ? `${(avg / 5) * 100}%` : "0%" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
