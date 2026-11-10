import React, { useState, useMemo } from "react";
import { Search, Lightbulb, CheckCircle2, AlertCircle, Clock, ChevronUp, ChevronDown, Eye, X, Filter, Users, Target, ListChecks, ShieldCheck, BarChart2, TrendingUp } from "lucide-react";
import { EMPLOYEES } from "../../hr/monitoring/monitoringData";

// ─── Team scope ───────────────────────────────────────────────────────────────

const TEAM_IDS       = ["E002", "E011"];
const TEAM_UNIT      = "PT. RSUP (Industri)";
const TEAM_DIV       = "Divisi Sumber Daya Manusia";
const TEAM_EMPLOYEES = EMPLOYEES;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionPlan { id: number; description: string; }
interface SmartGoal  { id: number; label: string; specific: string; measurable: string; attainable: string; relevant: string; timely: string; target: string; actionPlans: ActionPlan[]; }

interface SGRecord {
  employeeId: string;
  totalGoals: number;
  totalAPs: number;
  completedAPs: number;
  completionPercent: number;
  settingStatus: "Unsubmitted" | "Draft" | "Pending-Approver" | "Revision" | "Validated";
  measurementStatus: "Pending-Assessment" | "Revision" | "Validated";
  lastUpdated: string;
  goals: SmartGoal[];
}

// ─── Team mock data ───────────────────────────────────────────────────────────

const MOCK_GOALS_E002: SmartGoal[] = [
  { id: 1, label: "Goal 1", specific: "Mempercepat proses rekrutmen karyawan baru", measurable: "Time-to-hire < 30 hari", attainable: "Dengan database kandidat aktif dan panel interview terstruktur", relevant: "Mendukung ekspansi tim 2026", timely: "Berlaku mulai April 2026", target: "< 30 hari", actionPlans: [{ id: 1, description: "Bangun database kandidat" }, { id: 2, description: "Buat panduan panel interview" }] },
  { id: 2, label: "Goal 2", specific: "Meningkatkan retensi karyawan di divisi SDM", measurable: "Turnover < 5% selama 2026", attainable: "Program engagement dan exit interview rutin", relevant: "Mendukung stabilitas tim jangka panjang", timely: "Evaluasi per kuartal 2026", target: "Turnover < 5%", actionPlans: [{ id: 1, description: "Survey engagement Q1" }, { id: 2, description: "Program mentoring internal" }, { id: 3, description: "Exit interview analysis" }] },
  { id: 3, label: "Goal 3", specific: "Implementasi sistem HRIS baru", measurable: "Go-live sebelum Q3 2026", attainable: "Koordinasi IT dan vendor HRIS", relevant: "Efisiensi proses HR administrasi", timely: "Go-live Juli 2026", target: "HRIS live Q3 2026", actionPlans: [{ id: 1, description: "Evaluasi vendor HRIS" }, { id: 2, description: "UAT sistem baru" }] },
];

const MOCK_GOALS_E011: SmartGoal[] = [
  { id: 1, label: "Goal 1", specific: "Menyusun modul pelatihan onboarding", measurable: "Modul selesai dan digunakan oleh 100% new hire Q2", attainable: "Kolaborasi dengan divisi terkait", relevant: "Mempercepat produktivitas karyawan baru", timely: "Selesai Maret 2026", target: "Modul onboarding tersedia Q2", actionPlans: [{ id: 1, description: "Kumpulkan kebutuhan materi onboarding" }, { id: 2, description: "Susun draft modul" }] },
  { id: 2, label: "Goal 2", specific: "Digitalisasi arsip kepegawaian", measurable: "100% dokumen terdigitalisasi sebelum Q4 2026", attainable: "Scanner dan storage cloud tersedia", relevant: "Memudahkan akses dokumen HR", timely: "Selesai September 2026", target: "100% dokumen digital", actionPlans: [{ id: 1, description: "Inventarisasi dokumen fisik" }, { id: 2, description: "Proses scanning & upload" }] },
];

const SG_DATA: SGRecord[] = [];
const _UNUSED_SG_DATA: SGRecord[] = [
  { employeeId: "E002", totalGoals: 3, totalAPs: 8,  completedAPs: 8,  completionPercent: 100, settingStatus: "Validated", measurementStatus: "Pending-Assessment", lastUpdated: "2026-05-28", goals: MOCK_GOALS_E002 },
  { employeeId: "E011", totalGoals: 2, totalAPs: 5,  completedAPs: 0,  completionPercent: 0,   settingStatus: "Draft",     measurementStatus: "Pending-Assessment", lastUpdated: "2026-05-15", goals: MOCK_GOALS_E011 },
];

// ─── Rule helpers ─────────────────────────────────────────────────────────────

function getEffectiveProgressAPs(sg: SGRecord): number {
  if (sg.settingStatus === "Draft") return 0;
  return sg.totalAPs > 0 ? Math.round((sg.completedAPs / sg.totalAPs) * 100) : 0;
}

function getEffectiveGoalsCompletion(sg: SGRecord): number {
  if (sg.settingStatus === "Draft") return 0;
  const pAPs = sg.totalAPs > 0 ? Math.round((sg.completedAPs / sg.totalAPs) * 100) : 0;
  return pAPs === 100 ? 100 : sg.completionPercent;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const SETTING_STATUS_STYLE: Record<string, { bg: string; icon: React.ElementType }> = {
  "Unsubmitted":      { bg: "bg-gray-100 text-gray-500",     icon: AlertCircle },
  "Draft":            { bg: "bg-amber-100 text-amber-700",   icon: Clock },
  "Pending-Approver": { bg: "bg-blue-100 text-blue-700",     icon: Clock },
  "Revision":         { bg: "bg-orange-100 text-orange-700", icon: AlertCircle },
  "Validated":        { bg: "bg-green-100 text-green-700",   icon: CheckCircle2 },
};

const MEASUREMENT_STATUS_STYLE: Record<string, { bg: string; icon: React.ElementType }> = {
  "Pending-Assessment": { bg: "bg-sky-100 text-sky-700",       icon: Clock },
  "Revision":           { bg: "bg-orange-100 text-orange-700", icon: AlertCircle },
  "Validated":          { bg: "bg-green-100 text-green-700",   icon: CheckCircle2 },
};

function StatusBadge({ status, styleMap }: { status: string; styleMap: Record<string, { bg: string; icon: React.ElementType }> }) {
  const st = styleMap[status] ?? { bg: "bg-gray-100 text-gray-500", icon: AlertCircle };
  const Icon = st.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${st.bg}`}>
      <Icon className="w-3 h-3 shrink-0" />{status}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? "bg-green-500" : value >= 50 ? "bg-blue-500" : value > 0 ? "bg-amber-500" : "bg-gray-200";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{value > 0 ? `${value}%` : "—"}</span>
    </div>
  );
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

type SortKey = "no" | "employeeId" | "name" | "unit" | "division" | "department" | "position" | "totalGoals" | "totalAPs" | "progressAPs" | "goalsCompletion" | "settingStatus" | "measurementStatus" | "lastUpdated";
type SortDir = "asc" | "desc";

function SortTh({ label, col, sortKey, sortDir, onSort, center }: { label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; center?: boolean }) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 transition-colors ${center ? "text-center" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="flex flex-col">
          <ChevronUp className={`w-2.5 h-2.5 -mb-0.5 ${active && sortDir === "asc" ? "text-[#1A284F]" : "text-gray-300"}`} />
          <ChevronDown className={`w-2.5 h-2.5 ${active && sortDir === "desc" ? "text-[#1A284F]" : "text-gray-300"}`} />
        </span>
      </span>
    </th>
  );
}

// ─── SMART Goals Preview Table ────────────────────────────────────────────────

const PREVIEW_ROWS: { key: keyof SmartGoal; title: string; desc: string }[] = [
  { key: "specific",   title: "Specific/Spesifik",       desc: "Apa hasil yang diinginkan? Tuliskan secara spesifik perubahan yang diharapkan." },
  { key: "measurable", title: "Measurable/Dapat Diukur",  desc: "Bagaimana caranya untuk mengukur guna mengetahui pengembangan/peningkatan target?" },
  { key: "attainable", title: "Attainable/Dapat Dicapai", desc: "Apa yang harus dilakukan untuk mencapai target? Sumber daya apa yang diperlukan?" },
  { key: "relevant",   title: "Relevant/Relevan",         desc: "Apa tujuan yang ingin dicapai? Apakah tujuan tersebut selaras dengan tujuan organisasi?" },
  { key: "timely",     title: "Timely/Tepat Waktu",       desc: "Kapan batasan waktunya? Apakah batasan waktu yang ditetapkan realistis?" },
  { key: "target",     title: "Target",                   desc: "Apa target kuantitatif/kualitatif yang ingin dicapai?" },
];

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ empName, sg, onClose }: { empName: string; sg: SGRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-[#1A284F] text-lg">SMART Goals & Action Plans</h2>
            <p className="text-sm text-gray-500">{empName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-auto p-6 space-y-6">
          {sg.goals.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No goals submitted yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="border-collapse w-full text-sm" style={{ minWidth: `${Math.max(700, 260 + sg.goals.length * 240)}px` }}>
                  <thead>
                    <tr>
                      <th className="border-2 border-[#1A284F] bg-[#1A284F] text-white text-center py-3 px-4 font-bold" style={{ width: "260px" }}>
                        SMART Goals
                      </th>
                      {sg.goals.map(g => (
                        <th key={g.id} className="border-2 border-[#1A284F] bg-[#1A284F] text-white text-center py-3 px-4 font-bold">
                          {g.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PREVIEW_ROWS.map(row => (
                      <tr key={row.key} className={row.key === "target" ? "bg-blue-50/40" : ""}>
                        <td className={`border-2 border-black align-top px-4 py-4 ${row.key === "target" ? "bg-blue-50" : "bg-white"}`} style={{ width: "260px" }}>
                          <p className="font-bold underline text-gray-900 mb-1">{row.title}</p>
                          <p className="underline text-gray-700 text-xs leading-relaxed">{row.desc}</p>
                        </td>
                        {sg.goals.map(g => (
                          <td key={g.id} className={`border-2 border-black align-top px-3 py-3 ${row.key === "target" ? "bg-blue-50/60" : "bg-white"}`}>
                            <p className={`text-xs text-gray-800 leading-relaxed whitespace-pre-wrap ${row.key === "target" ? "min-h-[56px]" : "min-h-[96px]"}`}>
                              {(g[row.key] as string) || <span className="text-gray-300 italic">—</span>}
                            </p>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-[#1A284F] rounded-full" />
                  <h3 className="text-sm font-bold text-[#1A284F] uppercase tracking-wide">Action Plans</h3>
                  <span className="text-xs text-gray-400 font-normal normal-case tracking-normal">— Rencana tindakan pendukung setiap SMART Goal</span>
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(sg.goals.length, 3)}, 1fr)` }}>
                  {sg.goals.map(goal => (
                    <div key={goal.id} className="border-2 border-[#1A284F] rounded-xl overflow-hidden">
                      <div className="bg-[#1A284F] text-white text-sm font-bold px-4 py-2.5">{goal.label}</div>
                      <div className="p-4 bg-white flex flex-col gap-2">
                        {goal.actionPlans.length === 0 ? (
                          <p className="text-xs text-gray-400 italic py-2">Belum ada action plan.</p>
                        ) : goal.actionPlans.map((ap, i) => (
                          <div key={ap.id} className="flex items-start gap-2">
                            <span className="mt-1 shrink-0 w-5 h-5 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                            <p className="flex-1 text-xs text-gray-700 leading-relaxed py-1">{ap.description || "—"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 text-right">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SupervisorMonitoringSmartGoals() {
  const [search, setSearch]                           = useState("");
  const [unitFilter, setUnitFilter]                   = useState("All");
  const [divisionFilter, setDivisionFilter]           = useState("All");
  const [positionFilter, setPositionFilter]           = useState("All");
  const [settingStatusFilter, setSettingStatusFilter] = useState("All");
  const [measureStatusFilter, setMeasureStatusFilter] = useState("All");
  const [sortKey, setSortKey]                         = useState<SortKey>("no");
  const [sortDir, setSortDir]                         = useState<SortDir>("asc");
  const [viewRecord, setViewRecord]                   = useState<{ empName: string; sg: SGRecord } | null>(null);

  const units     = useMemo(() => [...new Set(TEAM_EMPLOYEES.map(e => e.unit))].sort(),     []);
  const divisions = useMemo(() => [...new Set(TEAM_EMPLOYEES.map(e => e.division))].sort(), []);
  const positions = useMemo(() => [...new Set(TEAM_EMPLOYEES.map(e => e.position))].sort(), []);
  const settingStatuses = ["Unsubmitted", "Draft", "Pending-Approver", "Revision", "Validated"];
  const measureStatuses = ["Pending-Assessment", "Revision", "Validated"];

  const rows = useMemo(() => {
    const base = TEAM_EMPLOYEES.map(emp => ({
      emp,
      sg: SG_DATA.find(k => k.employeeId === emp.id) ?? {
        employeeId: emp.id, totalGoals: 0, totalAPs: 0, completedAPs: 0,
        completionPercent: 0, settingStatus: "Unsubmitted" as const,
        measurementStatus: "Pending-Assessment" as const, lastUpdated: "-", goals: [],
      },
    }));

    const filtered = base.filter(({ emp, sg }) => {
      const q = search.toLowerCase();
      if (q && !emp.name.toLowerCase().includes(q) && !emp.id.toLowerCase().includes(q) && !emp.unit.toLowerCase().includes(q)) return false;
      if (unitFilter !== "All" && emp.unit !== unitFilter) return false;
      if (divisionFilter !== "All" && emp.division !== divisionFilter) return false;
      if (positionFilter !== "All" && emp.position !== positionFilter) return false;
      if (settingStatusFilter !== "All" && sg.settingStatus !== settingStatusFilter) return false;
      if (measureStatusFilter !== "All" && sg.measurementStatus !== measureStatusFilter) return false;
      return true;
    });

    filtered.sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      switch (sortKey) {
        case "employeeId":        av = a.emp.id;                       bv = b.emp.id;                       break;
        case "name":              av = a.emp.name;                     bv = b.emp.name;                     break;
        case "unit":              av = a.emp.unit;                     bv = b.emp.unit;                     break;
        case "division":          av = a.emp.division;                 bv = b.emp.division;                 break;
        case "position":          av = a.emp.position;                 bv = b.emp.position;                 break;
        case "totalGoals":        av = a.sg.totalGoals;                bv = b.sg.totalGoals;                break;
        case "totalAPs":          av = a.sg.totalAPs;                  bv = b.sg.totalAPs;                  break;
        case "progressAPs":       av = getEffectiveProgressAPs(a.sg);  bv = getEffectiveProgressAPs(b.sg);  break;
        case "goalsCompletion":   av = getEffectiveGoalsCompletion(a.sg); bv = getEffectiveGoalsCompletion(b.sg); break;
        case "settingStatus":     av = a.sg.settingStatus;             bv = b.sg.settingStatus;             break;
        case "measurementStatus": av = a.sg.measurementStatus;         bv = b.sg.measurementStatus;         break;
        case "lastUpdated":       av = a.sg.lastUpdated;               bv = b.sg.lastUpdated;               break;
        default: return 0;
      }
      const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [search, unitFilter, divisionFilter, positionFilter, settingStatusFilter, measureStatusFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────────
  const allSGWithEmp = TEAM_EMPLOYEES.map(emp => ({
    emp,
    sg: SG_DATA.find(k => k.employeeId === emp.id) ?? {
      employeeId: emp.id, totalGoals: 0, totalAPs: 0, completedAPs: 0,
      completionPercent: 0, settingStatus: "Unsubmitted" as const,
      measurementStatus: "Pending-Assessment" as const, lastUpdated: "-", goals: [],
    },
  }));

  const totalEmployees            = TEAM_EMPLOYEES.length;
  const totalGoals                = allSGWithEmp.reduce((s, { sg }) => s + sg.totalGoals, 0);
  const totalActionPlans          = allSGWithEmp.reduce((s, { sg }) => s + sg.totalAPs, 0);
  const goalsSettingValidated     = allSGWithEmp.filter(({ sg }) => sg.settingStatus === "Validated").length;
  const goalsMeasurementValidated = allSGWithEmp.filter(({ sg }) => sg.settingStatus === "Validated" && sg.measurementStatus === "Validated").length;
  const goalsAvgCompletion        = totalEmployees > 0
    ? Math.round(allSGWithEmp.reduce((s, { sg }) => s + getEffectiveGoalsCompletion(sg), 0) / totalEmployees) : 0;
  const apsAvgCompletion          = totalEmployees > 0
    ? Math.round(allSGWithEmp.reduce((s, { sg }) => s + getEffectiveProgressAPs(sg), 0) / totalEmployees) : 0;

  const STAT_CARDS = [
    { label: "Total Employees",             value: totalEmployees,            sub: "in your team",                                           color: "text-[#1A284F]",  bg: "bg-[#1A284F]/5", Icon: Users },
    { label: "Total Goals",                 value: totalGoals,                sub: "across team members",                                    color: "text-amber-700",  bg: "bg-amber-50",    Icon: Target },
    { label: "Total Action Plans",          value: totalActionPlans,          sub: "supporting all goals",                                   color: "text-violet-700", bg: "bg-violet-50",   Icon: ListChecks },
    { label: "Goals Setting Validated",     value: goalsSettingValidated,     sub: `${totalEmployees - goalsSettingValidated} not validated`, color: "text-green-700",  bg: "bg-green-50",    Icon: ShieldCheck },
    { label: "Goals Measurement Validated", value: goalsMeasurementValidated, sub: `of ${goalsSettingValidated} setting-validated`,          color: "text-teal-700",   bg: "bg-teal-50",     Icon: CheckCircle2 },
    { label: "Goals Avg. Completion",       value: `${goalsAvgCompletion}%`,  sub: "average goal completion rate",                          color: "text-blue-700",   bg: "bg-blue-50",     Icon: BarChart2 },
    { label: "APS Avg. Completion",         value: `${apsAvgCompletion}%`,    sub: "average action plan completion",                        color: "text-indigo-700", bg: "bg-indigo-50",   Icon: TrendingUp },
  ];

  const hasActiveFilters = unitFilter !== "All" || divisionFilter !== "All" || positionFilter !== "All" || settingStatusFilter !== "All" || measureStatusFilter !== "All";

  return (
    <div className="w-full flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">SMART Goals Monitoring</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">My Team</span>
          </div>
          <p className="text-gray-500 text-sm">{TEAM_UNIT} · {TEAM_DIV}</p>
        </div>
      </div>

      {/* Stats — 7 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {STAT_CARDS.map(s => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-4 py-4 ${s.bg} flex flex-col gap-1`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <s.Icon className={`w-3.5 h-3.5 ${s.color} shrink-0`} />
              <p className="text-[11px] text-gray-500 leading-tight">{s.label}</p>
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, ID, unit..."
              className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400"
            />
          </div>
          <span className="ml-auto text-xs text-gray-400">{rows.length} employees shown</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          {[
            { label: "Company Unit", value: unitFilter,     set: setUnitFilter,     opts: units },
            { label: "Division",     value: divisionFilter, set: setDivisionFilter, opts: divisions },
            { label: "Position",     value: positionFilter, set: setPositionFilter, opts: positions },
          ].map(({ label, value, set, opts }) => (
            <select
              key={label}
              value={value}
              onChange={e => set(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
            >
              <option value="All">All {label}</option>
              {opts.map(o => <option key={o}>{o}</option>)}
            </select>
          ))}
          <select
            value={settingStatusFilter}
            onChange={e => setSettingStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
          >
            <option value="All">All Setting Status</option>
            {settingStatuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            value={measureStatusFilter}
            onChange={e => setMeasureStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
          >
            <option value="All">All Measurement Status</option>
            {measureStatuses.map(s => <option key={s}>{s}</option>)}
          </select>
          {hasActiveFilters && (
            <button
              onClick={() => { setUnitFilter("All"); setDivisionFilter("All"); setPositionFilter("All"); setSettingStatusFilter("All"); setMeasureStatusFilter("All"); }}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <SortTh label="No."                      col="no"                sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                <SortTh label="Action"                   col="no"                sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                <SortTh label="ID Employee"              col="employeeId"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Employee"                 col="name"              sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Company Unit"             col="unit"              sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Division"                 col="division"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Department"               col="department"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Position"                 col="position"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Goals"                    col="totalGoals"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                <SortTh label="Total APs"                col="totalAPs"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} center />
                <SortTh label="Progress APs (%)"         col="progressAPs"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Goals Completion"         col="goalsCompletion"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Goals Setting Status"     col="settingStatus"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Goals Measurement Status" col="measurementStatus" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Last Updated"             col="lastUpdated"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ emp, sg }, idx) => {
                const progressAPs       = getEffectiveProgressAPs(sg);
                const goalsCompletion   = getEffectiveGoalsCompletion(sg);
                const showMeasurement   = sg.settingStatus === "Validated";

                return (
                  <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-4 text-center text-xs text-gray-400 font-medium">{idx + 1}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setViewRecord({ empName: emp.name, sg })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="View Goals"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">{emp.id}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-gray-800 whitespace-nowrap">{emp.name}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600 max-w-[140px]"><span className="block truncate">{emp.unit}</span></td>
                    <td className="py-3 px-4 text-xs text-gray-600 max-w-[140px]"><span className="block truncate">{emp.division}</span></td>
                    <td className="py-3 px-4 text-xs text-gray-400">—</td>
                    <td className="py-3 px-4 text-xs text-gray-600 max-w-[160px]"><span className="block truncate">{emp.position}</span></td>
                    <td className="py-3 px-4 text-center font-medium text-gray-700">{sg.totalGoals || "—"}</td>
                    <td className="py-3 px-4 text-center font-medium text-gray-700">{sg.totalAPs || "—"}</td>
                    <td className="py-3 px-4"><ProgressBar value={progressAPs} /></td>
                    <td className="py-3 px-4"><ProgressBar value={goalsCompletion} /></td>
                    <td className="py-3 px-4"><StatusBadge status={sg.settingStatus} styleMap={SETTING_STATUS_STYLE} /></td>
                    <td className="py-3 px-4">
                      {showMeasurement
                        ? <StatusBadge status={sg.measurementStatus} styleMap={MEASUREMENT_STATUS_STYLE} />
                        : <span className="text-gray-400 text-sm font-medium">—</span>
                      }
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500 whitespace-nowrap">{sg.lastUpdated}</td>
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

      {viewRecord && <ViewModal empName={viewRecord.empName} sg={viewRecord.sg} onClose={() => setViewRecord(null)} />}
    </div>
  );
}
