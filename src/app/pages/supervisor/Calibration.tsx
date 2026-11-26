import { resolveGradeForScore } from "../shared/scoringWeightStore";
import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Eye, X, FileText, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Users, TrendingUp, Award, Sparkles } from "lucide-react";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { AnalyticsStatCard } from "../../components/AnalyticsStatCard";
import { loadPersistedState } from "../../services/supabaseClient";
import { getActiveUser, getStrictSubordinateUsers } from "../../store/authStore";
import { getApproverNotesHistory, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { loadAllIcfProjectsByEmployee } from "../../store/projectStore";
import { loadMeasurementRCARecords } from "../employee/RCAPage";

// ─── Supporting data (live) ───────────────────────────────────────────────────
// Kedisiplinan & pelanggaran bersumber dari HRIS yang belum terintegrasi → null (ditampilkan "—").

const KEDISIPLINAN_LABELS = ["Mangkir", "Terlambat", "Istirahat Cepat", "Pulang Istirahat Terlambat"];
function empKedisiplinan(_id: string): Array<{ label: string; value: number | null }> {
  return KEDISIPLINAN_LABELS.map((label) => ({ label, value: null }));
}
function empPelanggaran(_id: string): number | null { return null; }
function empProject(id: string): number {
  const byEmp = loadAllIcfProjectsByEmployee();
  const state = byEmp[normalizeEmployeeId(id)] ?? byEmp[id];
  return Array.isArray(state?.rows) ? state.rows.length : 0;
}

const NOTE_MODULES: Array<{ module: string; label: string }> = [
  { module: "KPI", label: "KPI" },
  { module: "SMART Goals", label: "SMART Goals" },
  { module: "Appraisal Form", label: "Appraisal Form" },
  { module: "Managerial Skill", label: "Managerial Skill" },
  { module: "Project", label: "Project Outside Job Scope" },
];
function empApproverNotes(id: string): Array<{ module: string; note: string; by: string; date: string }> {
  const out: Array<{ module: string; note: string; by: string; date: string }> = [];
  for (const m of NOTE_MODULES) {
    const latest = getApproverNotesHistory(id, m.module, "measurement").find((e) => e.note?.trim());
    if (latest) out.push({ module: m.label, note: latest.note!.trim(), by: `${latest.approverName} (${latest.stageLabel})`, date: latest.date });
  }
  return out;
}

type RCAEntry = { id: string; masalah: string; status: "Open" | "Closed"; periode: string };
function empRCAItems(id: string): RCAEntry[] {
  const norm = normalizeEmployeeId(id);
  return loadMeasurementRCARecords()
    .filter((row) => normalizeEmployeeId(String(row.employeeId)) === norm)
    .map((row) => ({
      id: String(row.id),
      status: row.status,
      periode: row.periode,
      masalah: row.problems.map((p) => p.replace(/^\[Faktor (Internal|Eksternal)\]\s*/, "")).join("; ") || "—",
    }));
}

// ─── Grade helpers ─────────────────────────────────────────────────────────────

const GRADE_HEX: Record<string, string> = { "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B" };
function gradeFromScore(n: number, companyName?: string): { grade: string; color: string } {
  const grade = resolveGradeForScore(n, companyName);
  return { grade, color: GRADE_HEX[grade] ?? "#6B7280" };
}

// ─── Data ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  no: number;
  idEmployee: string;
  name: string;
  companyUnit: string;
  division: string;
  department: string;
  position: string;
  currentScore: number;
  proposedScore: number;
  currentGrade: string;
  proposedGrade: string;
  status: "No Change" | "Upgraded";
  notes: string;
  evidence: string;
  kpi: number;
  kpiIsYtd?: boolean;
  smartGoals: number;
  appraisalForm: number;
  managerialSkill: number | null;
  projectOutside: number;
}

function buildLiveSupervisorTeamMembers(): TeamMember[] {
  const activeUser = getActiveUser();
  const allowedIds = new Set(getStrictSubordinateUsers(activeUser).map((u) => u.employeeId.toLowerCase()));
  const liveEmps = getLiveTransactionalEmployees().filter((e) => allowedIds.has(e.id.toLowerCase()));
  const adjScores = loadPersistedState<Record<string, number>>("pa_calibration_adj_scores_v1", {});
  const adjComments = loadPersistedState<Record<string, string>>("pa_calibration_adj_comments_v1", {});
  return liveEmps.map((e, idx) => {
    const currScore = e.totalScore;
    const propScore = adjScores[e.id] ?? adjScores[`emp-${e.id}`] ?? currScore;
    const cg = currScore > 0 ? gradeFromScore(currScore).grade : "E";
    const pg = propScore > 0 ? gradeFromScore(propScore).grade : "E";
    return {
      no: idx + 1,
      idEmployee: e.id,
      name: e.fullName,
      companyUnit: e.companyUnit,
      division: e.division,
      department: e.department,
      position: e.position,
      currentScore: currScore,
      proposedScore: propScore,
      currentGrade: cg,
      proposedGrade: pg,
      status: propScore > currScore ? "Upgraded" : "No Change",
      notes: adjComments[e.id] ?? adjComments[`emp-${e.id}`] ?? "",
      evidence: "",
      kpi: e.kpi.score,
      kpiIsYtd: e.kpiIsYtd,
      smartGoals: e.smartGoals.score,
      appraisalForm: Math.round((e.formA.score + e.formB.score + e.formC.score) / 3),
      managerialSkill: e.managerialSkill ? e.managerialSkill.score : null,
      projectOutside: e.project.score,
    };
  });
}

const TEAM_MEMBERS: TeamMember[] = new Proxy([] as TeamMember[], {
  get(_target, prop, receiver) {
    const list = buildLiveSupervisorTeamMembers();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

// ─── Employee Detail Card (matches AppraisalDetailCard from CalibrationAdjustment) ──

function EmployeeDetailCard({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const currentYear = 2026;
  const [selYear, setSelYear] = useState(currentYear);
  const [showRCA, setShowRCA] = useState(false);

  const isCurrentYear = selYear === currentYear;

  const currentGrade = gradeFromScore(member.currentScore);
  const finalGrade   = gradeFromScore(member.proposedScore);

  const diff    = parseFloat((member.proposedScore - member.currentScore).toFixed(2));
  const hasAdj  = member.status === "Upgraded";

  const GRADE_ORDER = ["E","D","C","B","A","A+"];
  const fIdx = GRADE_ORDER.indexOf(finalGrade.grade);
  const cIdx = GRADE_ORDER.indexOf(currentGrade.grade);
  const scoreColor = diff < 0 ? "#EF4444" : diff > 0 ? "#10B981" : currentGrade.color;
  const gradeColor = fIdx < cIdx ? "#EF4444" : fIdx > cIdx ? "#10B981" : finalGrade.color;

  const weights = member.managerialSkill !== null
    ? [
        { label: "KPI",              score: member.kpi,            weight: 40 },
        { label: "Smart Goals",      score: member.smartGoals,     weight: 15 },
        { label: "Appraisal Form",   score: member.appraisalForm,  weight: 15 },
        { label: "Managerial Skill", score: member.managerialSkill!, weight: 15 },
        { label: "Project Outside",  score: member.projectOutside, weight: 15 },
      ]
    : [
        { label: "KPI",              score: member.kpi,            weight: 50 },
        { label: "Smart Goals",      score: member.smartGoals,     weight: 20 },
        { label: "Appraisal Form",   score: member.appraisalForm,  weight: 15 },
        { label: "Project Outside",  score: member.projectOutside, weight: 15 },
      ];


  const kedisiplinan   = empKedisiplinan(member.idEmployee);
  const pelanggaran    = empPelanggaran(member.idEmployee);
  const projectCount   = empProject(member.idEmployee);
  const rcaItems       = empRCAItems(member.idEmployee);
  const approverNotes  = empApproverNotes(member.idEmployee);
  const rcaOpen        = rcaItems.filter(r => r.status === "Open").length;
  const rcaClosed      = rcaItems.filter(r => r.status === "Closed").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0 text-lg font-black text-[#1A284F] select-none">
              {member.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">{member.name}</h2>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{member.idEmployee}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[currentYear, currentYear - 1].map(yr => (
                <button key={yr} onClick={() => setSelYear(yr)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selYear === yr ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {yr}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Org info */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[["Divisi", "Staff Management"], ["Departemen", member.department], ["Bagian", "Rekrutmen & Seleksi"], ["Posisi", member.position]].map(([lbl, val]) => (
              <div key={lbl} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                <p className="font-semibold text-gray-800 text-xs">{val}</p>
              </div>
            ))}
          </div>

          {/* ── Past year view ── */}
          {!isCurrentYear ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-gray-600">Belum ada data riwayat penilaian {selYear}</p>
              <p className="mt-1 text-xs text-gray-400">Riwayat tahun sebelumnya akan tampil setelah siklus PA tahun tersebut tersimpan di sistem.</p>
            </div>
          ) : (
            <>
              {/* ── Current year: score panel ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Current — {selYear}</p>
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black tabular-nums" style={{ color: currentGrade.color }}>{member.currentScore.toFixed(1)}%</span>
                      <span className="text-lg font-black mb-0.5" style={{ color: currentGrade.color }}>{currentGrade.grade}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(member.currentScore, 100)}%`, background: currentGrade.color }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-200">
                    {weights.map(w => (
                      <div key={w.label} className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-500 flex items-center gap-1">
                          {w.label}
                          {w.label === "KPI" && member.kpiIsYtd && (
                            <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[9px] leading-none">YTD</span>
                          )}
                          <span className="text-gray-300">({w.weight}%)</span>
                        </span>
                        <span className="font-bold text-gray-700 tabular-nums">{w.score.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-green-50/60 border border-green-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                  <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Final — Setelah Kalibrasi</p>
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black tabular-nums" style={{ color: scoreColor }}>{member.proposedScore.toFixed(1)}%</span>
                      <span className="text-lg font-black mb-0.5" style={{ color: gradeColor }}>{finalGrade.grade}</span>
                      {hasAdj && diff !== 0 && (
                        <span className="text-sm font-bold tabular-nums mb-0.5" style={{ color: scoreColor }}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(member.proposedScore, 100)}%`, background: scoreColor }} />
                    </div>
                    {hasAdj && finalGrade.grade !== currentGrade.grade && (
                      <p className="text-[10px] mt-1.5 font-semibold" style={{ color: gradeColor }}>
                        Grade berubah: <span className="line-through text-gray-400">{currentGrade.grade}</span> → {finalGrade.grade}
                      </p>
                    )}
                    {!hasAdj && <p className="text-[10px] mt-1.5 text-gray-400">Belum ada penyesuaian kalibrasi</p>}
                  </div>
                  {/* Catatan kalibrasi */}
                  {member.notes || member.evidence ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Catatan Kalibrasi</p>
                      {member.notes && (
                        <div className="bg-white/70 border border-amber-200 rounded-xl px-3 py-2.5">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1">Komentar</p>
                          <p className="text-xs text-gray-800 leading-relaxed">{member.notes}</p>
                        </div>
                      )}
                      {member.evidence && (
                        <div className="flex items-center gap-1.5 text-xs text-[#1A284F] font-medium">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>{member.evidence}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60 border border-gray-200 rounded-xl">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Info</span>
                      <p className="text-xs text-gray-400">Tidak ada catatan kalibrasi</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Supporting Data ── */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Supporting Data</p>

                {/* Project · Kedisiplinan · Pelanggaran */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Project · Kedisiplinan · Pelanggaran</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Project Outside</p>
                      <p className="text-2xl font-black text-[#1A284F] tabular-nums">{projectCount}</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Other Project</p>
                      <p className="text-2xl font-black text-blue-600 tabular-nums">—</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-orange-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">Pelanggaran</p>
                      <p className="text-2xl font-black text-orange-600 tabular-nums">{pelanggaran ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">point matrix</p>
                    </div>
                    <div className="bg-white rounded-xl border border-red-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Kedisiplinan</p>
                      <p className="text-2xl font-black text-red-500 tabular-nums">{kedisiplinan.some((k) => k.value !== null) ? kedisiplinan.reduce((s, k) => s + (k.value ?? 0), 0) : "—"}</p>
                      <p className="text-[10px] text-gray-400">total kejadian</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {kedisiplinan.map(k => (
                      <div key={k.label} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <span className="text-xs text-gray-600">{k.label}</span>
                        <span className="text-xs font-bold text-gray-800 tabular-nums">{k.value === null ? "—" : `${k.value}×`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary Notes from All Approvers */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Summary Note — All Approver · All Modul</p>
                  <div className="flex flex-col gap-2">
                    {approverNotes.length === 0 ? (
                      <p className="text-xs text-gray-400">Belum ada catatan approver pada modul Measurement.</p>
                    ) : approverNotes.map(n => (
                      <div key={n.module} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#1A284F] uppercase tracking-wide">{n.module}</span>
                        <p className="text-xs text-gray-700 leading-relaxed">{n.note}</p>
                        <span className="text-[10px] text-gray-400">{n.by} · {n.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RCA */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">RCA (Root Cause Analysis)</p>
                    <button onClick={() => setShowRCA(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1A284F] hover:underline underline-offset-2">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">RCA Open</p>
                      <p className="text-2xl font-black text-amber-600 tabular-nums">{rcaOpen}</p>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">RCA Closed</p>
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">{rcaClosed}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RCA detail modal */}
      {showRCA && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRCA(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Detail RCA</h3>
                <p className="text-xs text-gray-400 mt-0.5">{member.name} · {rcaOpen} Open · {rcaClosed} Closed</p>
              </div>
              <button onClick={() => setShowRCA(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1A284F] text-white">
                    <th className="px-3 py-2 text-left font-semibold rounded-tl-lg w-8">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Masalah Utama</th>
                    <th className="px-3 py-2 text-center font-semibold whitespace-nowrap">Periode</th>
                    <th className="px-3 py-2 text-center font-semibold rounded-tr-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rcaItems.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">Tidak ada RCA</td></tr>
                  ) : rcaItems.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="px-3 py-2.5 text-gray-400">{r.id}</td>
                      <td className="px-3 py-2.5 text-gray-800">{r.masalah}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600 whitespace-nowrap">{r.periode}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${r.status === "Open" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter Dropdown ──────────────────────────────────────────────────────────

function FilterSelect({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none text-xs font-medium border rounded-xl pl-3 pr-8 py-2 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 cursor-pointer ${value ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5" : "border-gray-200 text-gray-600"}`}
      >
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_GRADES = ["A+","A","B","C","D","E"];

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SupervisorCalibration() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-employees-imported", onRefresh);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-employees-imported", onRefresh);
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Filters
  const [fUnit,     setFUnit]     = useState("");
  const [fDiv,      setFDiv]      = useState("");
  const [fDept,     setFDept]     = useState("");
  const [fPosition, setFPosition] = useState("");
  const [fCurrGrade,setFCurrGrade]= useState("");
  const [fPropGrade,setFPropGrade]= useState("");
  const [fStatus,   setFStatus]   = useState("");

  // Sort
  type SortDir = "asc" | "desc" | null;
  const [sortCurr, setSortCurr] = useState<SortDir>(null);
  const [sortProp, setSortProp] = useState<SortDir>(null);

  const teamMembers = useMemo(() => buildLiveSupervisorTeamMembers(), [tick]);
  const unitOptions = useMemo(
    () => [...new Set(teamMembers.map((m) => m.companyUnit).filter(Boolean))].sort(),
    [teamMembers],
  );
  const divOptions = useMemo(() => {
    const pool = fUnit ? teamMembers.filter((m) => m.companyUnit === fUnit) : teamMembers;
    return [...new Set(pool.map((m) => m.division).filter(Boolean))].sort();
  }, [teamMembers, fUnit]);
  const deptOptions = useMemo(() => {
    const pool = teamMembers.filter(
      (m) => (!fUnit || m.companyUnit === fUnit) && (!fDiv || m.division === fDiv),
    );
    return [...new Set(pool.map((m) => m.department).filter(Boolean))].sort();
  }, [teamMembers, fUnit, fDiv]);
  const positionOptions = useMemo(() => {
    const pool = teamMembers.filter(
      (m) =>
        (!fUnit || m.companyUnit === fUnit) &&
        (!fDiv || m.division === fDiv) &&
        (!fDept || m.department === fDept),
    );
    return [...new Set(pool.map((m) => m.position).filter(Boolean))].sort();
  }, [teamMembers, fUnit, fDiv, fDept]);
  const gradeOptions = useMemo(
    () => [...new Set(teamMembers.flatMap((m) => [m.currentGrade, m.proposedGrade]))].sort(),
    [teamMembers],
  );
  const statusOptions   = ["No Change", "Upgraded"];

  const hasFilter = !!(fUnit || fDiv || fDept || fPosition || fCurrGrade || fPropGrade || fStatus);

  const displayed = useMemo(() => {
    let rows = teamMembers.filter(m => {
      if (fUnit      && m.companyUnit   !== fUnit)      return false;
      if (fDiv       && m.division      !== fDiv)       return false;
      if (fDept      && m.department    !== fDept)      return false;
      if (fPosition  && m.position      !== fPosition)  return false;
      if (fCurrGrade && m.currentGrade  !== fCurrGrade) return false;
      if (fPropGrade && m.proposedGrade !== fPropGrade) return false;
      if (fStatus    && m.status        !== fStatus)    return false;
      return true;
    });
    if (sortCurr) {
      rows = [...rows].sort((a, b) => sortCurr === "asc" ? a.currentScore - b.currentScore : b.currentScore - a.currentScore);
    } else if (sortProp) {
      rows = [...rows].sort((a, b) => sortProp === "asc" ? a.proposedScore - b.proposedScore : b.proposedScore - a.proposedScore);
    }
    return rows;
  }, [teamMembers, fUnit, fDiv, fDept, fPosition, fCurrGrade, fPropGrade, fStatus, sortCurr, sortProp]);

  function cycleSortCurr() {
    setSortProp(null);
    setSortCurr(prev => prev === null ? "desc" : prev === "desc" ? "asc" : null);
  }
  function cycleSortProp() {
    setSortCurr(null);
    setSortProp(prev => prev === null ? "desc" : prev === "desc" ? "asc" : null);
  }

  function SortIcon({ dir }: { dir: SortDir }) {
    if (dir === "asc")  return <ArrowUp className="w-3 h-3 text-[#1A284F]" />;
    if (dir === "desc") return <ArrowDown className="w-3 h-3 text-[#1A284F]" />;
    return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
  }

  // HC summary
  const allDisplayGrades = ALL_GRADES; // always show all including E

  const currentCounts  = (g: string) => teamMembers.filter(m => m.currentGrade  === g).length;
  const proposedCounts = (g: string) => teamMembers.filter(m => m.proposedGrade === g).length;
  const avgCurrentScore = displayed.length > 0
    ? (displayed.reduce((s, m) => s + m.currentScore, 0) / displayed.length).toFixed(1)
    : "0.0";
  const avgProposedScore = displayed.length > 0
    ? (displayed.reduce((s, m) => s + m.proposedScore, 0) / displayed.length).toFixed(1)
    : "0.0";
  const upgradedCount = displayed.filter((m) => m.status === "Upgraded").length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-full mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A284F]">Team Performance Calibration</h1>
          <p className="mt-1 text-sm text-gray-500">Performance Year 2026 · Pending HR Review</p>
        </div>

        {/* ── Summary Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AnalyticsStatCard
            index={0}
            tone="navy"
            title="Total Anggota Tim"
            value={displayed.length}
            subtitle={`Dari ${teamMembers.length} bawahan dalam wewenang`}
            icon={<Users className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={1}
            tone="teal"
            title="Rata-Rata Current Score"
            value={`${avgCurrentScore}%`}
            subtitle="Skor aktual sebelum kalibrasi"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={2}
            tone="plum"
            title="Rata-Rata Proposed Score"
            value={`${avgProposedScore}%`}
            subtitle="Skor usulan setelah kalibrasi"
            icon={<Award className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={3}
            tone="emerald"
            title="Upgraded"
            value={upgradedCount}
            subtitle={`${displayed.length - upgradedCount} anggota tanpa perubahan`}
            icon={<Sparkles className="w-4 h-4" />}
          />
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          {unitOptions.length > 1 && (
            <FilterSelect
              label="All Units"
              options={unitOptions}
              value={fUnit}
              onChange={(v) => { setFUnit(v); setFDiv(""); setFDept(""); setFPosition(""); }}
            />
          )}
          {divOptions.length > 1 && (
            <FilterSelect
              label="All Divisions"
              options={divOptions}
              value={fDiv}
              onChange={(v) => { setFDiv(v); setFDept(""); setFPosition(""); }}
            />
          )}
          <FilterSelect label="All Departments"   options={deptOptions}     value={fDept}      onChange={setFDept} />
          <FilterSelect label="All Positions"     options={positionOptions} value={fPosition}  onChange={setFPosition} />
          <FilterSelect label="Current Grade"     options={gradeOptions}    value={fCurrGrade} onChange={setFCurrGrade} />
          <FilterSelect label="Proposed Grade"    options={gradeOptions}    value={fPropGrade} onChange={setFPropGrade} />
          <FilterSelect label="All Status"        options={statusOptions}   value={fStatus}    onChange={setFStatus} />
          {hasFilter && (
            <button
              onClick={() => { setFUnit(""); setFDiv(""); setFDept(""); setFPosition(""); setFCurrGrade(""); setFPropGrade(""); setFStatus(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 ml-1"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Team Calibration Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A284F]">
              Team Calibration — {displayed.length}/{teamMembers.length} Members
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-center text-xs text-gray-500 font-medium pb-2 pr-2 w-8">Action</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-2 pr-3 w-8">No.</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-3">ID</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4">Employee</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 px-3">Department</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 px-3">Position</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-2 px-3">
                    <button onClick={cycleSortCurr} className="inline-flex items-center gap-1 hover:text-[#1A284F] transition-colors">
                      Current Score <SortIcon dir={sortCurr} />
                    </button>
                  </th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-2 px-3">Current Grade</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-2 px-3">
                    <button onClick={cycleSortProp} className="inline-flex items-center gap-1 hover:text-[#1A284F] transition-colors">
                      Proposed Score <SortIcon dir={sortProp} />
                    </button>
                  </th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-2 px-3">Proposed Grade</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-2 px-3">Status</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 px-3">Notes</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pl-3">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-sm text-gray-400">No members match the selected filters.</td>
                  </tr>
                ) : displayed.map((member) => {
                  const cg = gradeFromScore(member.currentScore);
                  const pg = gradeFromScore(member.proposedScore);
                  return (
                    <tr key={member.idEmployee} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-2 text-center">
                        <button
                          onClick={() => setSelectedMember(member)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="py-3 pr-3 text-center text-xs text-gray-400 tabular-nums">{member.no}</td>
                      <td className="py-3 pr-3 text-xs font-mono text-gray-500">{member.idEmployee}</td>
                      <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap">{member.name}</td>
                      <td className="py-3 px-3 text-xs text-gray-600 whitespace-nowrap">{member.department}</td>
                      <td className="py-3 px-3 text-xs text-gray-600 whitespace-nowrap">{member.position}</td>
                      <td className="py-3 px-3 text-right text-xs tabular-nums font-semibold" style={{ color: cg.color }}>
                        {member.currentScore.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-bold text-gray-700">{member.currentGrade}</td>
                      <td className="py-3 px-3 text-right text-xs tabular-nums font-semibold" style={{ color: pg.color }}>
                        {member.proposedScore.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-[#1A284F]">{member.proposedGrade}</td>
                      <td className="py-3 px-3 text-center">
                        {member.status === "Upgraded" ? (
                          <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap">Upgraded</span>
                        ) : (
                          <span className="bg-gray-50 text-gray-500 border border-gray-200 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap">No Change</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500 max-w-[140px]">
                        {member.notes || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-3 pl-3 text-xs">
                        {member.evidence ? (
                          <span className="inline-flex items-center gap-1 text-[#1A284F] hover:underline cursor-pointer whitespace-nowrap">
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            {member.evidence}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── HC per Grade Summary ── */}
          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">HC per Grade Summary</p>
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-gray-400 font-medium pb-2 pr-6 w-36"></th>
                  {allDisplayGrades.map(g => (
                    <th key={g} className="text-center text-gray-400 font-medium pb-2 px-6 min-w-[56px]">{g}</th>
                  ))}
                  <th className="text-center text-gray-400 font-medium pb-2 px-6">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-50">
                  <td className="py-2.5 pr-6 font-semibold text-gray-600">Current HC</td>
                  {allDisplayGrades.map(g => {
                    const c = currentCounts(g);
                    return (
                      <td key={g} className="py-2.5 px-6 text-center font-semibold text-gray-700">
                        {c > 0 ? c : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-6 text-center font-bold text-[#1A284F]">{teamMembers.length}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-6 font-semibold text-gray-600">Proposed HC</td>
                  {allDisplayGrades.map(g => {
                    const curr = currentCounts(g);
                    const prop = proposedCounts(g);
                    return (
                      <td key={g} className="py-2.5 px-6 text-center">
                        <span className={`font-semibold ${prop > curr ? "text-green-600" : prop < curr ? "text-red-500" : "text-gray-700"}`}>
                          {prop > 0 ? prop : <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-6 text-center font-bold text-[#1A284F]">{teamMembers.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Calibration is currently in review. Grades are finalized by HR and management.
            Deadline: <span className="font-semibold">25 January 2027.</span>
          </p>
        </div>
      </div>

      {/* ── Employee Detail Modal ── */}
      {selectedMember && (
        <EmployeeDetailCard member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  );
}
