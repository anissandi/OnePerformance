import React, { useState, useMemo } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import { Briefcase, Building2, MapPin, Mail, Phone, Calendar, TrendingUp, Lightbulb, ClipboardList, FolderKanban, ChevronRight, BarChart2, Star, Activity, Clock, CheckCircle2, ChevronDown, StickyNote, UserCheck } from "lucide-react";
import {
  KPI_ITEMS, computeKPIAchievement, parseBobotDecimal, loadKPITracking,
} from "../employee/KPIPage";
import { STAFF_PROFILE } from "../../store/profileStore";
import { getActiveUser } from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";

// ─── User identity (from shared profile store) ─────────────────────────────────
const USER = STAFF_PROFILE;

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
    case "A+": return "bg-purple-500";
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
  approved:       { label: "Approved",  color: "text-green-700", bg: "bg-green-50",  border: "border-green-200"  },
  in_review:      { label: "In Review", color: "text-blue-700",  bg: "bg-blue-50",   border: "border-blue-200"   },
  pending:        { label: "Pending",   color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200"  },
  not_applicable: { label: "N/A",       color: "text-gray-400",  bg: "bg-gray-100",  border: "border-gray-200"   },
};

// ─── 2026 Module Results ───────────────────────────────────────────────────────

const MODULE_RESULTS: (ModuleResult & { status: ModuleStatus })[] = [
  {
    id: "m1",
    module: "KPI",
    submissionType: "KPI Tracking — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 50,
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
    submissionType: "SMART Goals — Measurement",
    completedDate: "—",
    score: 0,
    grade: "N/A",
    weight: 20,
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
];

// ─── 2025 Final Module Results (static, no Math.random) ───────────────────────

const FINAL_MODULE_RESULTS_2025: (ModuleResult & { status: ModuleStatus })[] = [
  {
    id: "m1",
    module: "KPI",
    submissionType: "KPI Tracking — Measurement",
    completedDate: "2025-12-30",
    score: 89,
    grade: "A",
    weight: 50,
    weightedScore: 44.5,
    status: "approved",
    icon: TrendingUp,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    detail: "7 KPI indicators. Final result 2025. All approved.",
  },
  {
    id: "m2",
    module: "SMART Goals",
    submissionType: "SMART Goals — Measurement",
    completedDate: "2025-12-30",
    score: 85,
    grade: "A",
    weight: 20,
    weightedScore: 17.0,
    status: "approved",
    icon: Lightbulb,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    detail: "3 SMART goals submitted with evidence and action plans. All approved.",
  },
  {
    id: "m3",
    module: "Appraisal Form",
    submissionType: "Appraisal Form — Measurement",
    completedDate: "2025-12-30",
    score: 78,
    grade: "B",
    weight: 15,
    weightedScore: 11.7,
    status: "approved",
    icon: ClipboardList,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    detail: "3 appraisal form sections submitted and finalized.",
  },
  {
    id: "m4",
    module: "Project Outside Job Scope",
    submissionType: "Project Measurement",
    completedDate: "2025-12-30",
    score: 70,
    grade: "B",
    weight: 15,
    weightedScore: 10.5,
    status: "approved",
    icon: FolderKanban,
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    detail: "Project finalized and approved for 2025 appraisal period.",
  },
];

// ─── 2024 Final Module Results (static, no Math.random) ───────────────────────

const FINAL_MODULE_RESULTS_2024: (ModuleResult & { status: ModuleStatus })[] = [
  {
    id: "m1",
    module: "KPI",
    submissionType: "KPI Tracking — Measurement",
    completedDate: "2024-12-28",
    score: 84,
    grade: "B",
    weight: 50,
    weightedScore: 42.0,
    status: "approved",
    icon: TrendingUp,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    detail: "7 KPI indicators. Final result 2024. All approved.",
  },
  {
    id: "m2",
    module: "SMART Goals",
    submissionType: "SMART Goals — Measurement",
    completedDate: "2024-12-28",
    score: 80,
    grade: "A",
    weight: 20,
    weightedScore: 16.0,
    status: "approved",
    icon: Lightbulb,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    detail: "3 SMART goals submitted with evidence and action plans. All approved.",
  },
  {
    id: "m3",
    module: "Appraisal Form",
    submissionType: "Appraisal Form — Measurement",
    completedDate: "2024-12-28",
    score: 76,
    grade: "B",
    weight: 15,
    weightedScore: 11.4,
    status: "approved",
    icon: ClipboardList,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    detail: "3 appraisal form sections submitted and finalized.",
  },
  {
    id: "m4",
    module: "Project Outside Job Scope",
    submissionType: "Project Measurement",
    completedDate: "2024-12-28",
    score: 65,
    grade: "B",
    weight: 15,
    weightedScore: 9.75,
    status: "approved",
    icon: FolderKanban,
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    detail: "Project finalized and approved for 2024 appraisal period.",
  },
];

// ─── KPI summary ───────────────────────────────────────────────────────────────

const KPI_SUMMARY = [
  { label: "Kepatuhan Pelaporan Keuangan",              target: "100%",      achievement: "100%",     score: 100, grade: "A" },
  { label: "Efisiensi Penggunaan Anggaran Operasional", target: "95%",       achievement: "96%",      score: 96,  grade: "A" },
  { label: "Akurasi Jurnal Akuntansi",                  target: "99%",       achievement: "99.2%",    score: 99,  grade: "A" },
  { label: "Ketepatan Rekonsiliasi Bank Bulanan",       target: "100%",      achievement: "91.7%",    score: 92,  grade: "A" },
  { label: "Ketepatan Waktu Penyerahan Laporan",        target: "≤ 5 hari",  achievement: "4.5 hari", score: 94,  grade: "A" },
  { label: "Jam Pelatihan & Pengembangan Kompetensi",   target: "40 JPL",    achievement: "21 JPL",   score: 75,  grade: "B" },
  { label: "Kepatuhan SOP Internal Keuangan",           target: "100%",      achievement: "100%",     score: 100, grade: "A" },
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

type Tab = "overview" | "results" | "kpi";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StaffViewProfile() {
  const [tab, setTab] = useRouteTab<Tab>(["overview", "results", "kpi"], "overview");
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [yearOpen, setYearOpen] = useState(false);

  // Live 2026 KPI score — same computation as My Appraisal page
  const liveKPIScore2026 = useMemo(() => {
    const { months, cellsMap } = loadKPITracking();
    const total = KPI_ITEMS.reduce((s, k) => {
      const ach = computeKPIAchievement(k, cellsMap, months);
      if (ach === null) return s;
      return s + (Math.min(ach, 100) / 100) * parseBobotDecimal(k.bobot) * 100;
    }, 0);
    return total > 0 ? parseFloat(total.toFixed(1)) : null;
  }, []);

  const isCurrent = selectedYear === CURRENT_YEAR;
  const yearData = YEAR_DATA[selectedYear];

  // Inject live KPI score into 2026 module results
  const activeModules = useMemo(() => {
    const activeUser = getActiveUser();
    const liveEmp = getLiveTransactionalEmployees().find(
      (e) => e.id.toLowerCase() === activeUser.employeeId.toLowerCase(),
    );
    const base = getModuleResults(selectedYear);
    if (!isCurrent) return base;
    return base.map((m) => {
      let score = 0;
      if (m.module === "KPI") score = liveKPIScore2026 ?? liveEmp?.kpi.score ?? 0;
      else if (m.module === "SMART Goals") score = liveEmp?.smartGoals.score ?? 0;
      else if (m.module === "Appraisal Form") score = liveEmp?.formA.score ?? 0;
      else if (m.module === "Project Outside Job Scope") score = liveEmp?.project.score ?? 0;
      const grade = score === 0 ? "N/A" : score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "E";
      const status: ModuleStatus = score > 0 ? "approved" : "pending";
      return { ...m, score, grade, status, weightedScore: parseFloat(((score * m.weight) / 100).toFixed(2)) };
    });
  }, [selectedYear, isCurrent, liveKPIScore2026]);

  const yearsOfService = new Date().getFullYear() - new Date(USER.joinDate).getFullYear();
  const totalWeighted = activeModules.reduce((s, m) => s + m.weightedScore, 0);

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
  const displayScore    = isCurrent ? parseFloat(totalWeighted.toFixed(1)) : yearData.score;
  const displayGrade    = isCurrent ? scoreToGrade(displayScore) : yearData.grade;
  const displayKPIScore = isCurrent && liveKPIScore2026 !== null ? liveKPIScore2026 : displayKPIScore;
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
                      <span className="font-bold text-gray-700">{displayScore}</span>
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
                      <span className="text-sm font-bold text-[#1A284F] leading-none">{displayScore}</span>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#1A284F] rounded-2xl border border-[#1A284F] shadow-sm px-5 py-4">
          <p className="text-[11px] text-blue-200 uppercase tracking-wide mb-1">{isCurrent ? "Current Score" : "Final Score"}</p>
          <p className="text-3xl font-bold text-white">{displayScore}</p>
          <p className="text-[11px] text-blue-200 mt-0.5">Appraisal {selectedYear}</p>
        </div>
        <div className={`rounded-2xl border shadow-sm px-5 py-4 ${isCurrent ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
          <p className={`text-[11px] uppercase tracking-wide mb-1 opacity-80 ${isCurrent ? "text-amber-600" : "text-green-600"}`}>
            {isCurrent ? "Current Grade" : "Final Grade"}
          </p>
          <p className={`text-3xl font-bold ${gradeColor(displayGrade).split(" ")[1]}`}>{displayGrade}</p>
          {isCurrent ? (
            <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</p>
          ) : (
            <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Finalized</p>
          )}
        </div>
        <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm px-5 py-4">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Modules Approved</p>
          <p className="text-3xl font-bold text-blue-700">
            {yearData.modulesApproved}<span className="text-lg text-blue-300">/{yearData.modulesTotal}</span>
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {isCurrent ? `${yearData.modulesTotal - yearData.modulesApproved} pending approval` : "All modules finalized"}
          </p>
        </div>
        <div className={`rounded-2xl border shadow-sm px-5 py-4 ${isCurrent ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100"}`}>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Last Updated</p>
          <p className="text-base font-bold text-gray-800 mt-1">{yearData.lastUpdated}</p>
          {isCurrent ? (
            <p className="text-[11px] text-amber-600 mt-0.5">Year-end: Dec {selectedYear}</p>
          ) : (
            <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Score locked</p>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: "overview", label: "Overview",       icon: Activity  },
          { id: "results",  label: "Module Results", icon: Star      },
          { id: "kpi",      label: "KPI Detail",     icon: BarChart2 },
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
          {/* Status banner */}
          <div className="bg-[#1A284F] rounded-2xl p-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-blue-200 font-semibold uppercase tracking-wide">
                  {isCurrent ? "Current Appraisal Status" : "Final Appraisal Result"} · {selectedYear}
                </p>
                {isCurrent ? (
                  <span className="text-[10px] bg-amber-400 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><Clock className="w-2.5 h-2.5" />In Progress</span>
                ) : (
                  <span className="text-[10px] bg-green-400 text-white font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />Finalized</span>
                )}
              </div>
              <p className="text-4xl font-bold text-white">{displayScore} <span className="text-lg font-normal text-blue-200">/ 100</span></p>
              <p className="text-sm text-blue-200 mt-1">
                Last updated {yearData.lastUpdated} · {yearData.modulesApproved} of {yearData.modulesTotal} modules approved
              </p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-xs text-blue-200 mb-2">{isCurrent ? "Current Grade" : "Final Grade"}</p>
              <span className={`inline-block text-4xl font-black px-6 py-3 rounded-2xl ${gradeColor(displayGrade)}`}>
                {displayGrade}
              </span>
            </div>
          </div>

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
                            ["Raw Score",      `${m.score} / 100`],
                            ["Grade",          m.grade],
                            ["Weight",         `${m.weight}%`],
                            ["Weighted Score", `${m.weightedScore.toFixed(1)} pts`],
                            ["Completed Date", m.completedDate],
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

      {/* ── Tab: KPI Detail ── */}
      {tab === "kpi" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">{isCurrent ? "Current KPI Score" : "Final KPI Score"}</p>
              <p className="text-2xl font-bold text-[#1A284F]">{displayKPIScore}</p>
              {isCurrent ? (
                <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />In Progress</p>
              ) : (
                <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Finalized</p>
              )}
            </div>
            <div className={`rounded-2xl border shadow-sm px-5 py-4 ${gradeColor(displayKPIGrade)} border-current/20`}>
              <p className="text-[11px] uppercase tracking-wide mb-1 opacity-70">KPI Grade</p>
              <p className="text-2xl font-bold">{displayKPIGrade}</p>
              <p className="text-[11px] opacity-60 mt-0.5">Weight 50%</p>
            </div>
            <div className="bg-green-50 rounded-2xl border border-green-100 shadow-sm px-5 py-4">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">On Track</p>
              <p className="text-2xl font-bold text-green-700">{KPI_SUMMARY.filter(k => k.score >= 85).length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">KPI indicators</p>
            </div>
            <div className="bg-blue-50 rounded-2xl border border-blue-100 shadow-sm px-5 py-4">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Total KPIs</p>
              <p className="text-2xl font-bold text-blue-700">{KPI_SUMMARY.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">indicators set</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                KPI Indicators — {isCurrent ? "Current Status" : `Final Result ${selectedYear}`}
              </p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-5 py-3">No</th>
                  <th className="px-5 py-3">KPI Indicator</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">Achievement</th>
                  <th className="px-5 py-3">Score</th>
                  <th className="px-5 py-3 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {KPI_SUMMARY.map((k, i) => (
                  <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3.5 text-xs font-medium text-gray-800">{k.label}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600">{k.target}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-700 font-semibold">{k.achievement}</td>
                    <td className="px-5 py-3.5 w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`${gradeBar(k.grade)} h-1.5 rounded-full`} style={{ width: `${k.score}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 w-7 text-right">{k.score}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${gradeColor(k.grade)}`}>
                        {k.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
