import React, { useState, useMemo, useEffect } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import {
  Briefcase, Building2, MapPin, Mail, Phone, Calendar,
  TrendingUp, Lightbulb, ClipboardList, FolderKanban,
  ChevronRight, Award,
  BarChart2, Star, Activity, MessageSquare, Clock, CheckCircle2, ChevronDown, Users,
  StickyNote, UserCheck, Target, ClipboardCheck, Sparkles,
} from "lucide-react";
import {
  KPI_ITEMS, computeKPIAchievement, parseBobotDecimal, loadKPITracking,
} from "../employee/KPIPage";
import { SUPERVISOR_PROFILE } from "../../store/profileStore";
import {
  getActiveUser,
  resolveEffectiveUserGrouping,
  resolveUserAllowedModules,
  useAuthStore,
  type AppraisalModuleName,
} from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { loadUnitScoreWeights, SCORE_WEIGHT_EVENT, type ScoreWeightColumn } from "./scoringWeightStore";
import { ACCESS_UPDATED_EVENT } from "../hr/settings/AccessManagement";

// ─── User identity (from shared profile store) ─────────────────────────────────
const USER = SUPERVISOR_PROFILE;

// ─── Grade helpers ─────────────────────────────────────────────────────────────

function gradeColor(grade: string) {
  switch (grade) {
    case "A+":  return "bg-purple-100 text-purple-700";
    case "A":   return "bg-emerald-100 text-emerald-700";
    case "B":   return "bg-blue-100 text-blue-700";
    case "C":   return "bg-yellow-100 text-yellow-700";
    case "D":   return "bg-orange-100 text-orange-700";
    case "E":   return "bg-red-100 text-red-700";
    case "N/A": return "bg-gray-100 text-gray-400";
    default:    return "bg-gray-100 text-gray-500";
  }
}

function gradeBar(grade: string) {
  switch (grade) {
    case "A+": return "bg-teal-500";
    case "A":  return "bg-emerald-500";
    case "B":  return "bg-blue-500";
    case "C":  return "bg-yellow-500";
    case "D":  return "bg-orange-500";
    case "E":  return "bg-red-500";
    default:   return "bg-gray-300";
  }
}

// ─── Module result types ───────────────────────────────────────────────────────

interface ModuleResult {
  id: string;
  module: string;
  submissionType: string;
  completedDate: string;
  score: number;
  grade: string;
  weight: number;
  weightedScore: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  detail: string;
  subResults?: { label: string; score: number; grade: string }[];
}

type ModuleStatus = "approved" | "pending" | "in_review" | "not_applicable";

const STATUS_META: Record<ModuleStatus, { label: string; color: string; bg: string; border: string }> = {
  approved:       { label: "Approved",       color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200"  },
  in_review:      { label: "In Review",      color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"   },
  pending:        { label: "Pending",        color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
  not_applicable: { label: "N/A",            color: "text-gray-400",   bg: "bg-gray-100",  border: "border-gray-200"   },
};

const MODULE_RESULTS: (ModuleResult & { status: ModuleStatus; appraisalModuleKey: AppraisalModuleName; weightIndicatorKey?: string })[] = [
  {
    id: "m1",
    module: "KPI",
    appraisalModuleKey: "KPI (Setting/Measurement)",
    weightIndicatorKey: "KPI",
    submissionType: "KPI Tracking — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 40,
    weightedScore: 0,
    status: "pending",
    icon: TrendingUp,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    detail: "Belum ada transaksi KPI yang diselesaikan pada periode ini.",
  },
  {
    id: "m2",
    module: "SMART Goals",
    appraisalModuleKey: "SMART Goals (Setting/Measurement)",
    weightIndicatorKey: "SMART Goals",
    submissionType: "SMART Goals — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 15,
    weightedScore: 0,
    status: "pending",
    icon: Lightbulb,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    detail: "Belum ada transaksi SMART Goals yang diselesaikan pada periode ini.",
  },
  {
    id: "m3",
    module: "Appraisal Form",
    appraisalModuleKey: "Appraisals Form",
    weightIndicatorKey: "Appraisal Form",
    submissionType: "Appraisal Form — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 15,
    weightedScore: 0,
    status: "pending",
    icon: ClipboardList,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    detail: "Belum ada transaksi Appraisal Form yang diselesaikan pada periode ini.",
  },
  {
    id: "m4",
    module: "Project Outside Job Scope",
    appraisalModuleKey: "Project Outside Job Scope",
    weightIndicatorKey: "Project Outside Job Scope",
    submissionType: "Project Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 15,
    weightedScore: 0,
    status: "pending",
    icon: FolderKanban,
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    detail: "Belum ada transaksi Project Outside Job Scope pada periode ini.",
  },
  {
    id: "m5",
    module: "Managerial Skill",
    appraisalModuleKey: "Managerial Skill",
    weightIndicatorKey: "Managerial Skill",
    submissionType: "Managerial Skill Assessment",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 15,
    weightedScore: 0,
    status: "pending",
    icon: Award,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    detail: "Belum ada transaksi Managerial Skill pada periode ini.",
  },
  {
    id: "m6_idf",
    module: "Inter-Department Feedback",
    appraisalModuleKey: "Inter-Departement Feedback",
    submissionType: "Inter-Department Feedback — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 0,
    weightedScore: 0,
    status: "pending",
    icon: Users,
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    detail: "Inter-Department Feedback (tidak memiliki bobot nilai).",
  },
  {
    id: "m7",
    module: "Management Interview",
    appraisalModuleKey: "Management Interview",
    weightIndicatorKey: "Management Interview",
    submissionType: "Management Interview",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 10,
    weightedScore: 0,
    status: "pending",
    icon: MessageSquare,
    color: "text-rose-700",
    bg: "bg-rose-50",
    border: "border-rose-200",
    detail: "Belum ada transaksi Management Interview pada periode ini.",
  },
];

// ─── KPI summary ───────────────────────────────────────────────────────────────

const KPI_SUMMARY = [
  { label: "Recruitment Cycle Time",   target: "≤ 30 days", achievement: "28 days", score: 95, grade: "A"  },
  { label: "Training Completion Rate", target: "≥ 90%",     achievement: "88%",     score: 82, grade: "B"  },
  { label: "Employee Retention Rate",  target: "≥ 95%",     achievement: "96%",     score: 96, grade: "A"  },
  { label: "Headcount Fulfilment",     target: "100%",       achievement: "80%",     score: 80, grade: "B"  },
];

// ─── Year-based data ──────────────────────────────────────────────────────────

const CURRENT_YEAR = 2026;
const AVAILABLE_YEARS = [2026, 2025, 2024];

interface SummaryNote {
  approver: string;
  role: string;
  date: string;
  module: string;
  note: string;
}

interface YearRecord {
  score: number;
  grade: string;
  isFinal: boolean;
  lastUpdated: string;
  modulesApproved: number;
  modulesTotal: number;
  kpiScore: number;
  kpiGrade: string;
  summaryNotes: SummaryNote[];
}

const YEAR_DATA: Record<number, YearRecord> = {
  2026: {
    score: 0,
    grade: "N/A",
    isFinal: false,
    lastUpdated: "—",
    modulesApproved: 0,
    modulesTotal: 4,
    kpiScore: 0,
    kpiGrade: "N/A",
    summaryNotes: [],
  },
  2025: {
    score: 0,
    grade: "N/A",
    isFinal: true,
    lastUpdated: "—",
    modulesApproved: 0,
    modulesTotal: 4,
    kpiScore: 0,
    kpiGrade: "N/A",
    summaryNotes: [],
  },
  2024: {
    score: 0,
    grade: "N/A",
    isFinal: true,
    lastUpdated: "—",
    modulesApproved: 0,
    modulesTotal: 4,
    kpiScore: 0,
    kpiGrade: "N/A",
    summaryNotes: [],
  },
};

const HIST_SCORES_2025: Record<string, number> = {};
const HIST_SCORES_2024: Record<string, number> = {};

const FINAL_MODULE_RESULTS_2025: (typeof MODULE_RESULTS[0])[] = MODULE_RESULTS.map((m) => {
  const s = HIST_SCORES_2025[m.module] ?? m.score;
  return { ...m, status: "approved" as const, score: s, grade: s === 0 ? "N/A" : s >= 90 ? "A+" : s >= 80 ? "A" : s >= 70 ? "B" : "C", weightedScore: parseFloat((s * m.weight / 100).toFixed(2)), completedDate: "2025-12-30" };
});

const FINAL_MODULE_RESULTS_2024: (typeof MODULE_RESULTS[0])[] = MODULE_RESULTS.map((m) => {
  const s = HIST_SCORES_2024[m.module] ?? m.score;
  return { ...m, status: "approved" as const, score: s, grade: s === 0 ? "N/A" : s >= 90 ? "A+" : s >= 80 ? "A" : s >= 70 ? "B" : "C", weightedScore: parseFloat((s * m.weight / 100).toFixed(2)), completedDate: "2024-12-28" };
});

function getModuleResults(year: number) {
  if (year === 2025) return FINAL_MODULE_RESULTS_2025;
  if (year === 2024) return FINAL_MODULE_RESULTS_2024;
  return MODULE_RESULTS;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ProgressRing({ pct, size = 80, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f4ff" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1A284F" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

type Tab = "overview" | "results";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ViewProfile() {
  const { activeUser } = useAuthStore();
  const [tab, setTab] = useRouteTab<Tab>(["overview", "results"], "overview");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [yearOpen, setYearOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onRefresh = () => setTick((v) => v + 1);
    window.addEventListener("appraisal-updated", onRefresh);
    window.addEventListener("pa-auth-updated", onRefresh);
    window.addEventListener("pa-db-hydrated", onRefresh);
    window.addEventListener(SCORE_WEIGHT_EVENT, onRefresh);
    window.addEventListener(ACCESS_UPDATED_EVENT, onRefresh);
    window.addEventListener("storage", onRefresh);
    return () => {
      window.removeEventListener("appraisal-updated", onRefresh);
      window.removeEventListener("pa-auth-updated", onRefresh);
      window.removeEventListener("pa-db-hydrated", onRefresh);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onRefresh);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onRefresh);
      window.removeEventListener("storage", onRefresh);
    };
  }, []);

  const isCurrent = selectedYear === CURRENT_YEAR;
  const yearData = YEAR_DATA[selectedYear];

  // Live 2026 KPI score — same computation as My Appraisal page
  // Inject live KPI score into 2026 module results
  const activeModules = useMemo(() => {
    const allowed = resolveUserAllowedModules(activeUser);
    const grouping = resolveEffectiveUserGrouping(activeUser);
    const unitWeights = loadUnitScoreWeights(activeUser.company);
    const weightCol: ScoreWeightColumn =
      grouping === "Ka./Wa.Ka.Div ke atas" || grouping === "Direktur / Director"
        ? "kepalaDivisi"
        : grouping === "Ka./Wa.Ka.Dept"
        ? "kepalaDepartement"
        : grouping === "Ka./Wa.Ka.Bagian"
        ? "pengawasKepalaBagian"
        : grouping === "Ka./Wa.Ka.Seksi"
        ? "kaWaKaSeksi"
        : "operasional";

    const resolveWeight = (indicatorKey?: string, fallback = 0): number => {
      if (!indicatorKey) return 0;
      const raw = unitWeights[indicatorKey]?.[weightCol];
      if (!raw || raw === "-") return 0;
      const num = parseFloat(String(raw).replace("%", "").trim());
      return Number.isFinite(num) ? num : fallback;
    };

    const liveEmp = getLiveTransactionalEmployees().find(
      (e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase(),
    );
    // Hanya tampilkan modul yang di-allow pada setup Groupings masing-masing karyawan
    const base = getModuleResults(selectedYear).filter((m) =>
      allowed.includes(m.appraisalModuleKey),
    );
    return base.map((m) => {
      const weight = resolveWeight(m.weightIndicatorKey, m.weight);
      if (!isCurrent) {
        return {
          ...m,
          weight,
          weightedScore: parseFloat(((m.score * weight) / 100).toFixed(2)),
        };
      }
      let score = 0;
      if (m.module === "KPI") score = liveEmp?.kpi.score ?? 0;
      else if (m.module === "SMART Goals") score = liveEmp?.smartGoals.score ?? 0;
      else if (m.module === "Appraisal Form") score = liveEmp?.formA.score ?? 0;
      else if (m.module === "Project Outside Job Scope") score = liveEmp?.project.score ?? 0;
      else if (m.module === "Managerial Skill") score = liveEmp?.managerialSkill?.score ?? 0;
      else if (m.module === "Management Interview") score = liveEmp?.managementInterview?.score ?? 0;
      const grade = score === 0 ? "N/A" : score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "E";
      const status: ModuleStatus = score > 0 ? "approved" : "pending";
      return { ...m, weight, score, grade, status, weightedScore: parseFloat(((score * weight) / 100).toFixed(2)) };
    });
  }, [activeUser, selectedYear, isCurrent, tick]);

  const yearsOfService = new Date().getFullYear() - new Date(USER.joinDate).getFullYear();
  const totalWeighted = activeModules.reduce((s, m) => s + m.weightedScore, 0);
  const dynamicModulesTotal = activeModules.length;
  const dynamicModulesApproved = activeModules.filter((m) => m.status === "approved").length;
  const kpiModuleWeight = activeModules.find((m) => m.module === "KPI")?.weight ?? 40;

  // For current year, derive display score/grade from live module scores
  function scoreToGrade(s: number) {
    if (s <= 0) return "N/A";
    if (s >= 90) return "A+";
    if (s >= 80) return "A";
    if (s >= 70) return "B";
    if (s >= 60) return "C";
    if (s >= 50) return "D";
    return "E";
  }
  const liveMe = getLiveTransactionalEmployees().find(
    (e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase(),
  );
  const displayScore    = isCurrent ? (liveMe?.totalScore ?? parseFloat(totalWeighted.toFixed(1))) : yearData.score;
  const displayGrade    = isCurrent ? scoreToGrade(displayScore) : yearData.grade;
  const displayKPIScore = isCurrent ? (liveMe?.kpi.score ?? 0) : yearData.kpiScore;
  const displayKPIGrade = scoreToGrade(displayKPIScore ?? 0);

  return (
    <div className="w-full flex flex-col gap-6">

      {/* ── Profile hero ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-[#1A284F] to-[#2d4a8f]">
          {/* Year filter — top right of banner */}
          <div className="flex justify-end px-6 pt-4">
            <div className="relative">
              <button
                onClick={() => setYearOpen((o) => !o)}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors border border-white/20"
              >
                <Calendar className="w-3.5 h-3.5" />
                {selectedYear}
                {isCurrent && <span className="text-[9px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-bold ml-0.5">Current</span>}
                {!isCurrent && <span className="text-[9px] bg-green-400 text-white px-1.5 py-0.5 rounded-full font-bold ml-0.5">Final</span>}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${yearOpen ? "rotate-180" : ""}`} />
              </button>
              {yearOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[140px]">
                  {AVAILABLE_YEARS.map((yr) => (
                    <button
                      key={yr}
                      onClick={() => { setSelectedYear(yr); setYearOpen(false); setExpandedModule(null); }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold hover:bg-gray-50 transition-colors ${selectedYear === yr ? "text-[#1A284F]" : "text-gray-600"}`}
                    >
                      <span>{yr}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${yr === CURRENT_YEAR ? "bg-amber-100 text-amber-600" : "bg-green-100 text-green-600"}`}>
                        {yr === CURRENT_YEAR ? "Current" : "Final"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="px-8 pb-6">
          <div className="flex items-end gap-5 -mt-10 mb-4 flex-wrap">
            <div className="w-20 h-20 rounded-2xl bg-[#1A284F] border-4 border-white flex items-center justify-center shadow-md shrink-0">
              <span className="text-2xl font-bold text-white tracking-wider">{USER.initials}</span>
            </div>
            <div className="flex-1 min-w-0 pt-12">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{USER.name}</h1>
                  <p className="text-sm text-gray-500">{USER.position}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${gradeColor(displayGrade)}`}>
                      Grade {displayGrade}
                    </span>
                    <span className="text-xs text-gray-400">
                      {isCurrent ? "Current" : "Final"} Score:{" "}
                      <span className="font-bold text-gray-700">{displayScore}%</span>
                    </span>
                    <span className="text-xs text-gray-300">·</span>
                    {isCurrent ? (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Finalized</span>
                    )}
                  </div>
                </div>
                {/* Score ring + Grade */}
                <div className="flex items-center gap-3 shrink-0 pt-1">
                  <div className="relative">
                    <ProgressRing pct={displayScore} size={72} stroke={6} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-[#1A284F] leading-none">{displayScore}%</span>
                      <span className={`text-[8px] leading-none mt-0.5 ${isCurrent ? "text-amber-500" : "text-green-500"}`}>
                        {isCurrent ? "Current" : "Final"}
                      </span>
                    </div>
                  </div>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg shadow-sm ${gradeColor(displayGrade)}`}>
                    {displayGrade}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            {[
              { icon: Building2, label: USER.companyUnit },
              { icon: Briefcase, label: USER.department },
              { icon: MapPin,    label: USER.location },
              { icon: Calendar,  label: `Joined ${USER.joinDate} · ${yearsOfService} yrs` },
              { icon: Mail,      label: USER.email },
              { icon: Phone,     label: USER.phone },
            ].map(({ icon: Icon, label }, idx) => (
              <div key={`${idx}-${label}`} className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-600 truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Current / Final Score */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#1E3A6E]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">{isCurrent ? "Current Score" : "Final Score"}</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{displayScore}%</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#1E3A6E] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">Appraisal {selectedYear}</p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#1E3A6E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Current / Final Grade */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#E6F4EE] via-[#F4FAF7] to-white border border-[#D3EBE1] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#2D6A5B]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">{isCurrent ? "Current Grade" : "Final Grade"}</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">{displayGrade}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#2D6A5B] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <ClipboardCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            {isCurrent ? (
              <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1"><Clock className="w-3 h-3 text-[#2D6A5B]" /> In Progress</p>
            ) : (
              <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#2D6A5B]" /> Finalized</p>
            )}
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#2D6A5B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Modules Approved */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#ECEFF8] via-[#F7F8FC] to-white border border-[#DDE2F0] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#142546]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Modules</p>
              <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5">
                {dynamicModulesApproved}<span className="text-lg font-bold text-gray-400">/{dynamicModulesTotal}</span>
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#142546] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            <p className="text-[11px] text-gray-500 font-medium">
              {isCurrent ? `${Math.max(0, dynamicModulesTotal - dynamicModulesApproved)} In Progress | ${dynamicModulesApproved} Done` : "All modules finalized"}
            </p>
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#142546" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Last Updated */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-[#FBECE5] via-[#FDF7F4] to-white border border-[#F2DCD2] rounded-2xl p-4 flex flex-col justify-between min-h-[126px] shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full bg-[#A85D43]/[0.05] transition-transform duration-500 ease-out group-hover:scale-125" />
          <div className="flex items-start justify-between gap-2 relative z-10">
            <div>
              <p className="text-xs font-medium text-gray-500">Last Updated</p>
              <p className="text-xl font-extrabold text-[#111827] leading-tight mt-0.5">{yearData.lastUpdated}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#A85D43] text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-4 relative z-10">
            {isCurrent ? (
              <p className="text-[11px] text-gray-500 font-medium">Year-end: Dec {selectedYear}</p>
            ) : (
              <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#A85D43]" /> Score locked</p>
            )}
            <svg className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 64 24" fill="none">
              <path d="M2 20L16 14L26 17L40 9L50 12L62 5" stroke="#A85D43" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: "overview", label: "Overview",         icon: Activity  },
          { id: "results",  label: "Module Results",   icon: Star      },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === id ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          {/* Module score bars */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Score by Module</p>
              {isCurrent ? (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-2.5 h-2.5" />In Progress — {selectedYear}</span>
              ) : (
                <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Final Score — {selectedYear}</span>
              )}
            </div>
            <div className="flex flex-col gap-4">
              {activeModules.map(m => (
                <div key={m.id} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-52 shrink-0">
                    <m.icon className={`w-4 h-4 shrink-0 ${m.color}`} />
                    <span className="text-xs text-gray-700 font-medium truncate">{m.module}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className={`${gradeBar(m.grade)} h-2.5 rounded-full transition-all`} style={{ width: `${m.score}%` }} />
                  </div>
                  <span className="text-xs font-bold text-gray-800 w-8 text-right">{m.score}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold w-10 text-center ${gradeColor(m.grade)}`}>{m.grade}</span>
                  <span className="text-[10px] text-gray-400 w-16 text-right">×{m.weight}% = <span className="font-semibold text-gray-600">{m.weightedScore.toFixed(1)}</span></span>
                </div>
              ))}
            </div>
            {/* Total */}
            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#B88645]" />
                <span className="text-sm font-bold text-gray-700">{isCurrent ? "Current" : "Final"} Weighted Score</span>
                {isCurrent ? (
                  <span className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-2.5 h-2.5" />In Progress</span>
                ) : (
                  <span className="text-[10px] text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Finalized</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-[#1A284F]">{totalWeighted.toFixed(1)}</span>
                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${gradeColor(displayGrade)}`}>{displayGrade}</span>
              </div>
            </div>
          </div>

          {/* Result summary cards */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Appraisal Result Summary</p>
            <div className="grid grid-cols-3 gap-3">
              {activeModules.map(m => (
                <div key={m.id} className={`rounded-xl border p-4 ${m.bg} ${m.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                      <span className={`text-[11px] font-bold ${m.color}`}>{m.module}</span>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${gradeColor(m.grade)}`}>{m.grade}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{m.score}</p>
                  <p className="text-[10px] text-gray-500 mt-1">Weight {m.weight}% · Weighted {m.weightedScore.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Summary Note */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <StickyNote className="w-4 h-4 text-[#1A284F]" />
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Summary Note</p>
              <span className="ml-auto text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                Appraisal {selectedYear}
              </span>
            </div>
            {yearData.summaryNotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
                <StickyNote className="w-8 h-8" />
                <p className="text-xs text-gray-400">No summary notes from approver for {selectedYear}.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {yearData.summaryNotes.map((note, i) => (
                  <div key={i} className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1A284F] flex items-center justify-center shrink-0">
                          <UserCheck className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">{note.approver}</p>
                          <p className="text-[10px] text-gray-500">{note.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                          {note.module}
                        </span>
                        <span className="text-[10px] text-gray-400">{note.date}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Module Results ── */}
      {tab === "results" && (
        <div className="flex flex-col gap-3">
          {/* Module result cards */}
          {activeModules.map((m, idx) => {
            const expanded = expandedModule === m.id;
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedModule(expanded ? null : m.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors text-left"
                >
                  {/* Module index */}
                  <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>

                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${m.bg} ${m.border}`}>
                    <m.icon className={`w-5 h-5 ${m.color}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{m.module}</p>
                    <p className="text-xs text-gray-400">{m.submissionType} · Completed {m.completedDate}</p>
                  </div>

                  {/* Score bar */}
                  <div className="w-40 shrink-0 hidden md:block">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className={`${gradeBar(m.grade)} h-2 rounded-full`} style={{ width: `${m.score}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-6">{m.score}</span>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="text-right shrink-0 hidden lg:block w-24">
                    <p className="text-[10px] text-gray-400">Weight {m.weight}%</p>
                    <p className="text-xs font-semibold text-gray-600">+{m.weightedScore.toFixed(1)} pts</p>
                  </div>

                  {/* Grade badge */}
                  <span className={`px-3 py-1.5 rounded-lg text-sm font-bold shrink-0 ${gradeColor(m.grade)}`}>{m.grade}</span>

                  {/* Status + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {(() => {
                      const s = STATUS_META[m.status];
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${s.bg} ${s.color} ${s.border}`}>
                          <Clock className="w-2.5 h-2.5" />
                          {s.label}
                        </span>
                      );
                    })()}
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="px-6 pb-5 border-t border-gray-50">
                    <div className="pt-4 grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detail</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{m.detail}</p>

                        {m.subResults && (
                          <div className="mt-4 flex flex-col gap-2">
                            {m.subResults.map(sub => (
                              <div key={sub.label} className="flex items-center gap-3">
                                <span className="text-xs text-gray-600 w-40 shrink-0">{sub.label}</span>
                                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                  <div className={`${gradeBar(sub.grade)} h-1.5 rounded-full`} style={{ width: `${sub.score}%` }} />
                                </div>
                                <span className="text-xs font-bold text-gray-700 w-7 text-right">{sub.score}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${gradeColor(sub.grade)}`}>{sub.grade}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Score Summary</p>
                        <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
                          {[
                            ["Raw Score",       `${m.score} / 100`],
                            ["Grade",           m.grade],
                            ["Weight",          `${m.weight}%`],
                            ["Weighted Score",  `${m.weightedScore.toFixed(1)} pts`],
                            ["Completed Date",  m.completedDate],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">{label}</span>
                              <span className={`font-semibold ${label === "Grade" ? gradeColor(m.grade) + " px-2 py-0.5 rounded" : "text-gray-800"}`}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Weighted total */}
          <div className={`bg-white rounded-2xl border shadow-sm px-6 py-4 flex items-center justify-between ${isCurrent ? "border-amber-100" : "border-green-100"}`}>
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-[#B88645]" />
              <div>
                <p className="text-sm font-bold text-gray-800">{isCurrent ? "Current" : "Final"} Weighted Score</p>
                {isCurrent ? (
                  <p className="text-xs text-amber-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Score updates as approvals complete</p>
                ) : (
                  <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Score locked — {selectedYear} appraisal finalized</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-[#1A284F]">{totalWeighted.toFixed(1)}</span>
              <span className={`px-4 py-2 rounded-xl text-lg font-black ${gradeColor(displayGrade)}`}>{displayGrade}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
