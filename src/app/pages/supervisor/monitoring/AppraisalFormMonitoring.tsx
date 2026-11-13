// @refresh reset
import { useEffect, useState } from "react";
import { Search, ClipboardList, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { SUPERVISOR_TEAM_EMPLOYEES, filterMonitoringByModuleAccess } from "../../hr/monitoring/monitoringData";
import { loadAppraisalSelf, loadAllAppraisalApprovers } from "../../shared/appraisalFormStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../../shared/appraisalWorkflowStore";
import { useAppraisalRevision } from "../../shared/useAppraisalRevision";

const TEAM_IDS = ["E002", "E011"];
const TEAM_UNIT = "PT. RSUP (Industri)";
const TEAM_DIV  = "Divisi Sumber Daya Manusia";
const TEAM_EMPLOYEES = SUPERVISOR_TEAM_EMPLOYEES;

interface AFRecord {
  employeeId: string;
  selfAssessmentStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  supervisorAssessmentStatus: "Selesai" | "Dalam Proses" | "Belum Mulai";
  selfAvgScore: number; approver1Score: number; approver2Score: number; finalScore: number;
  competencies: { name: string; selfScore: number; supScore: number }[];
  lastUpdated: string;
}

const DEPARTMENT_MAP: Record<string, string> = {
  E002: "Dept. Rekrutmen & Seleksi",
  E011: "Dept. Pengembangan SDM",
};

const AF_DATA: AFRecord[] = [];
const _UNUSED_AF_DATA: AFRecord[] = [
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
    employeeId: "E011",
    selfAssessmentStatus: "Dalam Proses", supervisorAssessmentStatus: "Belum Mulai",
    selfAvgScore: 0, approver1Score: 0, approver2Score: 0, finalScore: 0,
    competencies: [],
    lastUpdated: "2026-05-15",
  },
];

const ASSESS_STYLE = {
  Selesai:        { bg: "bg-green-100 text-green-700", icon: CheckCircle2 },
  "Dalam Proses": { bg: "bg-amber-100 text-amber-700", icon: Clock },
  "Belum Mulai":  { bg: "bg-gray-100 text-gray-500",  icon: AlertCircle },
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

export function SupervisorMonitoringAppraisalForm() {
  useAppraisalRevision();
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
  const average = (values: number[]) => values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : 0;

  const allowedTeamEmployees = filterMonitoringByModuleAccess(TEAM_EMPLOYEES, "Appraisals Form");
  const workflows = loadWorkflowRecords();
  const allRows = allowedTeamEmployees.map((emp) => {
    const normId = normalizeEmployeeId(emp.id);
    const self = loadAppraisalSelf(emp.id);
    const approvers = loadAllAppraisalApprovers(emp.id);
    const wfRec = workflows.find(
      (w) => w.year === "2026" && w.module === "Appraisal Form" && w.phase === "measurement" && w.employeeId === normId,
    );
    const first = approvers.find((entry) => entry.approverLevel === 1);
    const second = approvers.find((entry) => entry.approverLevel === 2);
    const selfValues = self
      ? self.forms.flatMap((form) => {
          const vals = Object.values(form.ratings).map(Number).filter((v) => v > 0);
          return vals.length > 0 ? vals : form.avgScore > 0 ? [form.avgScore] : [];
        })
      : [];
    const a1Values = first
      ? first.forms.flatMap((form) => Object.values(form.ratings))
      : Object.values(wfRec?.assessments.approver1?.ratings ?? {});
    const a2Values = second
      ? second.forms.flatMap((form) => Object.values(form.ratings))
      : Object.values(wfRec?.assessments.approver2?.ratings ?? {});
    const selfAvgScore = average(selfValues);
    const approver1Score = average(a1Values);
    const approver2Score = average(a2Values);
    const selfDoneStatus: AFRecord["selfAssessmentStatus"] =
      self?.submitted || wfRec
        ? "Selesai"
        : selfValues.length > 0
        ? "Dalam Proses"
        : "Belum Mulai";
    const supDoneStatus: AFRecord["supervisorAssessmentStatus"] =
      a2Values.length > 0
        ? "Selesai"
        : a1Values.length > 0
        ? "Dalam Proses"
        : "Belum Mulai";
    const finalScore =
      a2Values.length > 0
        ? approver2Score
        : a1Values.length > 0
        ? approver1Score
        : 0;
    const af: AFRecord = {
      employeeId: emp.id,
      selfAssessmentStatus: selfDoneStatus,
      supervisorAssessmentStatus: supDoneStatus,
      selfAvgScore,
      approver1Score,
      approver2Score,
      finalScore,
      competencies: [],
      lastUpdated:
        second?.reviewedDate ??
        wfRec?.decisions.approver2?.date ??
        first?.reviewedDate ??
        wfRec?.decisions.approver1?.date ??
        self?.submittedAt ??
        wfRec?.submittedDate ??
        "—",
    };
    return { emp, af };
  });
  const rows = allRows.filter(({ emp }) => !search || emp.name.toLowerCase().includes(search.toLowerCase()));
  const filteredAF = allRows.map((r) => r.af);
  const data = filteredAF;

  const selfDone  = filteredAF.filter((k) => k.selfAssessmentStatus === "Selesai").length;
  const supDone   = filteredAF.filter((k) => k.supervisorAssessmentStatus === "Selesai").length;
  const bothDone  = filteredAF.filter((k) => k.selfAssessmentStatus === "Selesai" && k.supervisorAssessmentStatus === "Selesai").length;
  const validScores = filteredAF.filter((k) => k.finalScore > 0);
  const avgFinal  = validScores.length ? (validScores.reduce((s, k) => s + k.finalScore, 0) / validScores.length).toFixed(2) : "—";

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="w-5 h-5 text-green-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Appraisal Form Monitoring</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">My Team</span>
        </div>
        <p className="text-gray-500 text-sm">{TEAM_UNIT} · {TEAM_DIV}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Team Members", value: TEAM_EMPLOYEES.length, sub: "in your department", color: "text-[#1A284F]", bg: "bg-[#1A284F]/5" },
          { label: "Self-Assessment Done", value: selfDone, sub: `${TEAM_EMPLOYEES.length - selfDone} not yet complete`, color: "text-blue-700", bg: "bg-blue-50" },
          { label: "Supervisor Assessment Done", value: supDone, sub: `${TEAM_EMPLOYEES.length - supDone} not yet complete`, color: "text-purple-700", bg: "bg-purple-50" },
          { label: "Avg. Final Score", value: avgFinal, sub: `${bothDone} fully completed`, color: "text-green-700", bg: "bg-green-50" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name..." className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400" />
        </div>
        <span className="ml-auto text-xs text-gray-400">{rows.length} members shown</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="py-3 px-5 text-center w-10">No.</th>
                <th className="py-3 px-5">Employee ID</th>
                <th className="py-3 px-5">Employee Name</th>
                <th className="py-3 px-5">Company Unit</th>
                <th className="py-3 px-5">Division</th>
                <th className="py-3 px-5">Department</th>
                <th className="py-3 px-5">Position</th>
                <th className="py-3 px-5">Self-Assessment</th>
                <th className="py-3 px-5">Supervisor Assessment</th>
                <th className="py-3 px-5 text-center">Self Score</th>
                <th className="py-3 px-5 text-center">Approver 1 Score</th>
                <th className="py-3 px-5 text-center">Approver 2 Score</th>
                <th className="py-3 px-5 text-center">Final Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ emp, af }, rowIdx) => {
                const selfSt = ASSESS_STYLE[af.selfAssessmentStatus];
                const supSt  = ASSESS_STYLE[af.supervisorAssessmentStatus];
                return (
                  <tr key={emp.id} className={emp.isSelf ? "bg-indigo-50/70 hover:bg-indigo-100/60 transition-colors" : "hover:bg-gray-50/60 transition-colors"}>
                    <td className="py-3.5 px-5 text-center text-xs font-semibold text-gray-400">{rowIdx + 1}</td>
                    <td className="py-3.5 px-5">
                      <span className="text-[11px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded">{emp.id}</span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{emp.name}</p>
                        {emp.isSelf && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Data Saya
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{emp.unit}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{emp.division}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{emp.department ?? DEPARTMENT_MAP[emp.id] ?? "—"}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="text-sm text-gray-700 whitespace-nowrap">{emp.position}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${selfSt.bg}`}>
                        <selfSt.icon className="w-3 h-3" />{af.selfAssessmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${supSt.bg}`}>
                        <supSt.icon className="w-3 h-3" />{af.supervisorAssessmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.selfAvgScore} label="self" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.approver1Score} label="appr. 1" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.approver2Score} label="appr. 2" /></td>
                    <td className="py-3.5 px-5 text-center"><ScorePill score={af.finalScore} label="final" asPercent /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">No data matches the selected filter.</div>}
      </div>

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
