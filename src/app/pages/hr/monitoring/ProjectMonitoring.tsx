import React, { useEffect, useState } from "react";
import { FolderKanban, CheckCircle2, AlertCircle, Clock, Search, Filter, Download, Upload, ShieldCheck, ShieldX, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { EMPLOYEES } from "./monitoringData";
import { downloadProjectExcelTemplate, parseProjectExcelFile } from "../../../utils/projectExcelUtils";
import { importExternalProjectRows, loadAllIcfProjectsByEmployee } from "../../../store/projectStore";
import { normalizeEmployeeId } from "../../shared/appraisalWorkflowStore";

type ProgressStatus = "Submitted" | "In Progress" | "Done";
type ProjectScope   = "SS" | "QCC" | "QCP";
type ProjectRole    = "Ideator" | "Team Leader" | "Member";
type SortDir        = "asc" | "desc";
type SortKey        = "no"|"id"|"name"|"unit"|"division"|"position"|"scope"|"role"|"title"|"startDate"|"finishDate"|"progressStatus"|"approvalStatus"|"finalScore";

interface ProjRecord {
  employeeId:     string;
  scope:          ProjectScope | null;
  role:           ProjectRole  | null;
  title:          string | null;
  detail:         string | null;
  startDate:      string | null;
  finishDate:     string | null;
  progressStatus: ProgressStatus | null;
  projectScore:   number | null;
}

const PROJ_DATA: ProjRecord[] = [];
const _UNUSED_PROJ_DATA: ProjRecord[] = [
  { employeeId: "E001", scope: "QCC", role: "Team Leader", title: "Reduksi Downtime Mesin Boiler",       detail: "Pengurangan downtime mesin boiler melalui preventive maintenance dan perbaikan SOP operasional.",         startDate: "2026-01-15", finishDate: "2026-06-30", progressStatus: "In Progress", projectScore: 75   },
  { employeeId: "E002", scope: "SS",  role: "Ideator",     title: "Peningkatan Proses Rekrutmen Digital", detail: "Digitalisasi alur rekrutmen dari seleksi hingga onboarding untuk meningkatkan efisiensi waktu proses.", startDate: "2026-02-01", finishDate: "2026-07-31", progressStatus: "In Progress", projectScore: null },
  { employeeId: "E003", scope: "QCP", role: "Member",      title: "Efisiensi Proses Laporan Keuangan",    detail: "Optimalisasi pembuatan laporan keuangan bulanan menggunakan sistem otomasi dan template standar.",        startDate: "2026-01-10", finishDate: "2026-06-30", progressStatus: "Done",        projectScore: 90   },
  { employeeId: "E004", scope: "SS",  role: "Ideator",     title: "Campaign Media Sosial Q2 2026",        detail: "Strategi konten media sosial untuk meningkatkan brand awareness dan engagement pelanggan Q2 2026.",      startDate: "2026-03-01", finishDate: "2026-06-30", progressStatus: "Submitted",   projectScore: null },
  { employeeId: "E005", scope: "QCC", role: "Ideator",     title: "Implementasi Sistem Monitoring IT",    detail: "Pengembangan dashboard monitoring infrastruktur IT real-time untuk deteksi dini gangguan sistem.",        startDate: "2026-01-20", finishDate: "2026-07-31", progressStatus: "In Progress", projectScore: 85   },
  { employeeId: "E006", scope: "QCC", role: "Member",      title: "Optimasi Panen Kelapa Sawit",          detail: "Peningkatan efisiensi panen melalui penjadwalan berbasis data dan pelatihan teknik panen yang benar.",   startDate: "2026-02-15", finishDate: "2026-06-15", progressStatus: "Done",        projectScore: 92   },
  { employeeId: "E007", scope: null,  role: null,          title: null,                                   detail: null,                                                                                                     startDate: null,         finishDate: null,         progressStatus: null,          projectScore: null },
  { employeeId: "E008", scope: "QCP", role: "Ideator",     title: "Transformasi Operasional 2026",        detail: "Program transformasi menyeluruh operasional unit untuk meningkatkan kapasitas produksi dan kualitas.",   startDate: "2026-01-05", finishDate: "2026-12-31", progressStatus: "In Progress", projectScore: 88   },
  { employeeId: "E009", scope: "SS",  role: "Ideator",     title: "Peningkatan Kualitas Pupuk Organik",   detail: "Riset dan pengembangan formula pupuk organik berbasis limbah perkebunan untuk meningkatkan kualitas.",   startDate: "2026-03-01", finishDate: "2026-08-31", progressStatus: "Submitted",   projectScore: null },
  { employeeId: "E010", scope: "QCC", role: "Team Leader", title: "Reduksi Kerusakan Alat Berat",         detail: "Pemeliharaan proaktif alat berat untuk menekan biaya perbaikan dan meningkatkan availability unit.",     startDate: "2026-02-01", finishDate: "2026-07-31", progressStatus: "In Progress", projectScore: 70   },
  { employeeId: "E011", scope: "SS",  role: "Ideator",     title: "Digitalisasi Arsip Kepegawaian",       detail: "Konversi arsip fisik kepegawaian ke sistem digital untuk mempermudah akses dan pengelolaan dokumen.",    startDate: "2026-04-01", finishDate: "2026-09-30", progressStatus: "Submitted",   projectScore: null },
  { employeeId: "E012", scope: "QCC", role: "Ideator",     title: "Zero Defect Program Packaging",        detail: "Program zero defect pada lini packaging melalui penerapan quality gate dan kontrol statistik proses.",   startDate: "2026-01-15", finishDate: "2026-06-30", progressStatus: "In Progress", projectScore: 82   },
  { employeeId: "E013", scope: "SS",  role: "Team Leader", title: "Efisiensi Proses Rekrutmen Internal",  detail: "Penyederhanaan alur rekrutmen internal untuk mempercepat pemenuhan kebutuhan SDM di seluruh unit.",       startDate: "2026-03-01", finishDate: "2026-08-31", progressStatus: "In Progress", projectScore: null },
  { employeeId: "E014", scope: "QCC", role: "Anggota",     title: "Standarisasi SOP Penilaian Kinerja",   detail: "Penyusunan dan standarisasi SOP penilaian kinerja agar selaras antar unit dan mudah diaudit.",           startDate: "2026-04-15", finishDate: "2026-09-30", progressStatus: "Submitted",   projectScore: null },
];

const SCOPE_COLOR: Record<ProjectScope, string> = {
  SS:  "bg-amber-100 text-amber-700",
  QCC: "bg-indigo-100 text-indigo-700",
  QCP: "bg-teal-100 text-teal-700",
};
const ROLE_COLOR: Record<ProjectRole, string> = {
  Ideator:       "bg-orange-100 text-orange-700",
  "Team Leader": "bg-purple-100 text-purple-700",
  Member:        "bg-gray-100 text-gray-600",
};
const PROGRESS_META: Record<ProgressStatus, { bg: string; icon: React.ElementType; label: string }> = {
  "Submitted":   { bg: "bg-amber-100 text-amber-700", icon: Clock,        label: "Submitted"   },
  "In Progress": { bg: "bg-blue-100 text-blue-700",   icon: AlertCircle,  label: "In Progress" },
  "Done":        { bg: "bg-green-100 text-green-700", icon: CheckCircle2, label: "Done"        },
};
const PROJECT_BOBOT: Record<ProjectScope, number> = { SS: 25, QCC: 35, QCP: 40 };

function approvalLabel(ps: ProgressStatus | null): string {
  if (!ps) return "";
  return ps === "Submitted" ? "Rejected" : "Approved";
}
function approvalBadge(ps: ProgressStatus | null): { label: string; bg: string; Icon: React.ElementType } | null {
  if (!ps) return null;
  if (ps === "Submitted") return { label: "Rejected", bg: "bg-rose-100 text-rose-700",   Icon: ShieldX     };
  return                         { label: "Approved", bg: "bg-green-100 text-green-700", Icon: ShieldCheck };
}
function getProjectScore(rec: ProjRecord): number | null {
  if (!rec.scope || !rec.progressStatus) return null;
  if (rec.scope === "SS") return rec.progressStatus === "Submitted" ? 20 : 100;
  return rec.projectScore;
}
function getTeamBobot(role: ProjectRole | null, scope: ProjectScope | null): number | null {
  if (!role || !scope) return null;
  if (scope === "SS") return 0;
  return role === "Member" ? 90 : 100;
}
function computeFinalScore(rec: ProjRecord): number | null {
  if (!rec.scope) return null;
  const ps = getProjectScore(rec);
  const pb = PROJECT_BOBOT[rec.scope];
  if (ps === null) return null;
  if (rec.scope === "SS") return Math.round(ps * pb / 100 * 10) / 10;
  const tb = getTeamBobot(rec.role, rec.scope);
  if (tb === null) return null;
  return Math.round(ps * tb * pb / 10000 * 10) / 10;
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>;
  const c = value >= 30 ? "text-green-700 bg-green-50 border-green-200"
    : value >= 20 ? "text-blue-700 bg-blue-50 border-blue-200"
    : value >= 10 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${c}`}>{value}%</span>;
}
function RawScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>;
  const c = value === 100 ? "text-green-700 bg-green-50 border-green-200"
    : value >= 70 ? "text-blue-700 bg-blue-50 border-blue-200"
    : value >= 40 ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-rose-700 bg-rose-50 border-rose-200";
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${c}`}>{value}%</span>;
}
function PctBadge({ value, muted }: { value: number | null; muted?: boolean }) {
  if (value === null) return <span className="text-xs text-gray-300">—</span>;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${muted ? "bg-gray-100 text-gray-400" : "bg-slate-100 text-slate-600"}`}>{value}%</span>;
}
function fmt(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function unique(arr: string[]): string[] { return Array.from(new Set(arr)).sort(); }

const SCOPE_TOOLTIP: Record<ProjectScope, string> = {
  SS:  'Suggestion System (SS) — "Small Idea Kaizen"',
  QCC: 'Quality Control Circle (QCC) — "Small Group Activity"',
  QCP: 'Quality Control Project (QCP) — "Cross Functional Kaizen Team"',
};

function ScopeBadge({ scope }: { scope: ProjectScope }) {
  return (
    <div className="relative inline-flex group">
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold cursor-default ${SCOPE_COLOR[scope]}`}>{scope}</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:flex z-50 pointer-events-none">
        <div className="bg-gray-900 text-white text-[10px] font-medium rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg leading-snug">
          {SCOPE_TOOLTIP[scope]}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 text-[#1A284F] shrink-0" />
    : <ChevronDown className="w-3 h-3 text-[#1A284F] shrink-0" />;
}

export function HRMonitoringProject({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const [search, setSearch]                 = useState("");
  const [typeFilter, setTypeFilter]         = useState("All Scopes");
  const [roleFilter, setRoleFilter]         = useState("All Roles");
  const [progressFilter, setProgressFilter] = useState("All Status");
  const [unitFilter, setUnitFilter]         = useState("All Units");
  const [deptFilter, setDeptFilter]         = useState("All Departments");
  const [sortKey, setSortKey]               = useState<SortKey | null>(null);
  const [sortDir, setSortDir]               = useState<SortDir>("asc");
  const [uploadNotice, setUploadNotice]     = useState("");
  const [uploadError, setUploadError]       = useState("");
  const [uploadedByEmp, setUploadedByEmp]   = useState(() => loadAllIcfProjectsByEmployee());

  useEffect(() => {
    const sync = () => setUploadedByEmp(loadAllIcfProjectsByEmployee());
    window.addEventListener("appraisal-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("appraisal-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const filteredEmployees = lockedUnits ? EMPLOYEES.filter(e => lockedUnits.includes(e.unit)) : EMPLOYEES;
  const effectiveRecords: ProjRecord[] = filteredEmployees.map((emp) => {
    const uploaded = uploadedByEmp[normalizeEmployeeId(emp.id)] ?? uploadedByEmp[emp.id];
    if (!uploaded || !uploaded.rows.length) {
      return {
        employeeId: emp.id,
        scope: null,
        role: null,
        title: null,
        detail: null,
        startDate: null,
        finishDate: null,
        progressStatus: null,
        projectScore: null,
      };
    }
    const bestRow = [...uploaded.rows].sort((a, b) => b.finalScore - a.finalScore)[0];
    const normScope: ProjectScope = bestRow.projectScope.toUpperCase().includes("QCP")
      ? "QCP"
      : bestRow.projectScope.toUpperCase().includes("QCC")
      ? "QCC"
      : "SS";
    const normRole: ProjectRole = bestRow.roleProject.toLowerCase().includes("leader") || bestRow.roleProject.toLowerCase().includes("ketua")
      ? "Team Leader"
      : bestRow.roleProject.toLowerCase().includes("ideator")
      ? "Ideator"
      : "Member";
    const normProgress: ProgressStatus = bestRow.progressStatus.toLowerCase().includes("done") || bestRow.progressStatus.toLowerCase().includes("complete")
      ? "Done"
      : bestRow.progressStatus.toLowerCase().includes("progress")
      ? "In Progress"
      : "Submitted";
    return {
      employeeId: emp.id,
      scope: normScope,
      role: normRole,
      title: bestRow.projectTitle,
      detail: bestRow.projectDetail,
      startDate: bestRow.startDate,
      finishDate: bestRow.finishDate,
      progressStatus: normProgress,
      projectScore: bestRow.finalScore,
    };
  });
  const filteredPROJ      = effectiveRecords.filter(k => filteredEmployees.some(e => e.id === k.employeeId));

  const ssCount        = filteredPROJ.filter(k => k.scope === "SS").length;
  const qccCount       = filteredPROJ.filter(k => k.scope === "QCC").length;
  const qcpCount       = filteredPROJ.filter(k => k.scope === "QCP").length;
  const totalProjects = ssCount + qccCount + qcpCount;
  const doneCount     = filteredPROJ.filter(k => k.progressStatus === "Done").length;

  const unitOptions = ["All Units",       ...unique(filteredEmployees.map(e => e.unit))];
  const deptOptions = ["All Departments", ...unique(filteredEmployees.map(e => e.division))];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const baseRows = filteredEmployees.map((emp, idx) => ({
    no: idx + 1,
    emp,
    rec: effectiveRecords.find(k => k.employeeId === emp.id) ?? {
      employeeId: emp.id,
      scope: null,
      role: null,
      title: null,
      detail: null,
      startDate: null,
      finishDate: null,
      progressStatus: null,
      projectScore: null,
    },
  })).filter(({ emp, rec }) => {
    const q = search.toLowerCase();
    const matchSearch   = !q || emp.name.toLowerCase().includes(q) || emp.id.toLowerCase().includes(q)
      || emp.unit.toLowerCase().includes(q) || emp.division.toLowerCase().includes(q)
      || emp.position.toLowerCase().includes(q) || (rec.title ?? "").toLowerCase().includes(q);
    const matchType     = typeFilter     === "All Scopes"      || rec.scope    === typeFilter;
    const matchRole     = roleFilter     === "All Roles"       || rec.role     === roleFilter;
    const matchProgress = progressFilter === "All Status"      || rec.progressStatus === progressFilter;
    const matchUnit     = unitFilter     === "All Units"       || emp.unit     === unitFilter;
    const matchDept     = deptFilter     === "All Departments" || emp.division === deptFilter;
    return matchSearch && matchType && matchRole && matchProgress && matchUnit && matchDept;
  });

  const rows = sortKey ? [...baseRows].sort((a, b) => {
    let av: string | number | null = null, bv: string | number | null = null;
    const gv = (x: typeof a) => {
      switch(sortKey) {
        case "no":             return x.no;
        case "id":             return x.emp.id;
        case "name":           return x.emp.name;
        case "unit":           return x.emp.unit;
        case "division":       return x.emp.division;
        case "position":       return x.emp.position;
        case "scope":          return x.rec.scope ?? "";
        case "role":           return x.rec.role ?? "";
        case "title":          return x.rec.title ?? "";
        case "startDate":      return x.rec.startDate ?? "";
        case "finishDate":     return x.rec.finishDate ?? "";
        case "progressStatus": return x.rec.progressStatus ?? "";
        case "approvalStatus": return approvalLabel(x.rec.progressStatus);
        case "finalScore":     return (x.rec.projectScore ?? computeFinalScore(x.rec)) ?? -1;
        default:               return "";
      }
    };
    av = gv(a); bv = gv(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  }) : baseRows;

  const hasActiveFilters = typeFilter !== "All Scopes" || roleFilter !== "All Roles" || progressFilter !== "All Status" || unitFilter !== "All Units" || deptFilter !== "All Departments";

  const handleExport = () => {
    const header = ["No","Emp. ID","Employee","Company Unit","Department","Position","Project Scope","Role Project","Project Title","Project Detail","Start Date","Finish Date","Progress Status","Approval Status","Final Score (%)"];
    const csvRows = rows.map(({ no, emp, rec }) => [
      no, emp.id, emp.name, emp.unit, emp.division, emp.position,
      rec.scope ?? "", rec.role ?? "", rec.title ?? "", rec.detail ?? "",
      rec.startDate ?? "", rec.finishDate ?? "", rec.progressStatus ?? "",
      approvalLabel(rec.progressStatus),
      (rec.projectScore ?? computeFinalScore(rec)) ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...csvRows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "project_monitoring.csv"; a.click();
  };

  const Th = ({ col, children, center }: { col: SortKey; children: React.ReactNode; center?: boolean }) => (
    <th
      onClick={() => handleSort(col)}
      className={`py-3 px-3 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap ${center ? "text-center" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${center ? "justify-center w-full" : ""}`}>
        {children}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FolderKanban className="w-5 h-5 text-teal-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Project Monitoring</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
        </div>
        <p className="text-gray-500 text-sm">Monitor projects outside job scope of all employees — Mid-Year Measurement</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Projects",            value: totalProjects,  sub: "across all employees",   color: "text-[#1A284F]",  bg: "bg-[#1A284F]/5" },
          { label: "SS Project",                value: ssCount,        sub: "Suggestion System",      color: "text-amber-700",  bg: "bg-amber-50"    },
          { label: "QCC Project",               value: qccCount,       sub: "Quality Control Circle", color: "text-indigo-700", bg: "bg-indigo-50"   },
          { label: "QCP Project",               value: qcpCount,       sub: "Quality Control Project",color: "text-teal-700",   bg: "bg-teal-50"     },
          { label: "Total Project Done",         value: doneCount,      sub: "progress status Done",    color: "text-rose-700",   bg: "bg-rose-50"     },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-gray-100 px-5 py-4 ${s.bg}`}>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Toolbar — single row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="text-sm outline-none bg-transparent flex-1 text-gray-700 placeholder-gray-400 w-28" />
          </div>
          {([
            { value: typeFilter,     onChange: setTypeFilter,     opts: ["All Scopes","SS","QCC","QCP"] },
            { value: roleFilter,     onChange: setRoleFilter,     opts: ["All Roles","Ideator","Team Leader","Member"] },
            { value: progressFilter, onChange: setProgressFilter, opts: ["All Status","Submitted","In Progress","Done"] },
            { value: unitFilter,     onChange: setUnitFilter,     opts: unitOptions },
            { value: deptFilter,     onChange: setDeptFilter,     opts: deptOptions },
          ] as const).map(({ value, onChange, opts }) => (
            <div key={opts[0]} className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2.5 py-2 shadow-sm">
              <Filter className="w-3 h-3 text-gray-400 shrink-0" />
              <select value={value} onChange={e => onChange(e.target.value as never)} className="text-xs outline-none bg-transparent text-gray-600 cursor-pointer max-w-[120px]">
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {hasActiveFilters && (
            <button onClick={() => { setTypeFilter("All Scopes"); setRoleFilter("All Roles"); setProgressFilter("All Status"); setUnitFilter("All Units"); setDeptFilter("All Departments"); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
          )}
          <span className="text-xs text-gray-400 whitespace-nowrap">{rows.length} employees</span>
        </div>
        <div className="flex items-center gap-2">
          {!lockedUnits && (
            <>
              <button
                type="button"
                onClick={() =>
                  downloadProjectExcelTemplate(
                    filteredEmployees.map((e) => ({
                      id: e.id,
                      name: e.name,
                      unit: e.unit,
                      department: e.division,
                      position: e.position,
                    })),
                  )
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />Download Template Excel
              </button>
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors shadow-sm">
                <Upload className="w-3.5 h-3.5" />Import Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploadError("");
                    setUploadNotice("");
                    parseProjectExcelFile(file)
                      .then((parsed) => {
                        const result = importExternalProjectRows(parsed, file.name);
                        setUploadedByEmp(loadAllIcfProjectsByEmployee());
                        setUploadNotice(
                          `File "${file.name}" (${result.rowCount} proyek untuk ${result.employeeCount} karyawan) berhasil diunggah dan otomatis diteruskan ke proses Approval Level 1 & Level 2 masing-masing karyawan.`,
                        );
                      })
                      .catch((err) => setUploadError(err instanceof Error ? err.message : "Gagal membaca file Excel."));
                  }}
                />
              </label>
            </>
          )}
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1A284F] text-white text-xs font-semibold hover:bg-[#131d3b] transition-colors shadow-sm">
            <Download className="w-3.5 h-3.5" />Export Excel
          </button>
        </div>
      </div>

      {uploadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">{uploadError}</div>}
      {uploadNotice && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">{uploadNotice}</div>}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-left border-collapse w-full" style={{ minWidth: "1750px" }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <Th col="no" center>No.</Th>
                <Th col="id">Emp. ID</Th>
                <Th col="name">Employee</Th>
                <Th col="unit">Company Unit</Th>
                <Th col="division">Department</Th>
                <Th col="position">Position</Th>
                <Th col="scope" center>Project Scope</Th>
                <Th col="role" center>Role Project</Th>
                <Th col="title">Project Title</Th>
                <th className="py-3 px-3 min-w-[180px]">Project Detail</th>
                <Th col="startDate" center>Start Date</Th>
                <Th col="finishDate" center>Finish Date</Th>
                <Th col="progressStatus" center>Progress Status</Th>
                <Th col="approvalStatus" center>Approval Status</Th>
                <Th col="finalScore" center>Final Score</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ no, emp, rec }) => {
                const pm         = rec.progressStatus ? PROGRESS_META[rec.progressStatus] : null;
                const uploaded   = uploadedByEmp[normalizeEmployeeId(emp.id)];
                const appr       = uploaded ? { label: "Pending Approval 1 & 2", bg: "bg-amber-100 text-amber-700", Icon: Clock } : approvalBadge(rec.progressStatus);
                const finalScore = rec.projectScore ?? computeFinalScore(rec);
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-3 text-center text-xs font-semibold text-gray-400">{no}</td>
                    <td className="py-3 px-3"><span className="text-[11px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded">{emp.id}</span></td>
                    <td className="py-3 px-3"><p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{emp.name}</p></td>
                    <td className="py-3 px-3"><p className="text-xs text-gray-600 leading-snug">{emp.unit}</p></td>
                    <td className="py-3 px-3"><p className="text-xs text-gray-600 leading-snug">{emp.division}</p></td>
                    <td className="py-3 px-3"><p className="text-xs text-gray-600 leading-snug">{emp.position}</p></td>
                    <td className="py-3 px-3 text-center">
                      {rec.scope ? <ScopeBadge scope={rec.scope} /> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {rec.role ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${ROLE_COLOR[rec.role]}`}>{rec.role}</span> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3">{rec.title ? <p className="text-xs font-medium text-gray-700 leading-snug">{rec.title}</p> : <span className="text-xs text-gray-300">—</span>}</td>
                    <td className="py-3 px-3">{rec.detail ? <p className="text-xs text-gray-500 leading-snug line-clamp-2" title={rec.detail}>{rec.detail}</p> : <span className="text-xs text-gray-300">—</span>}</td>
                    <td className="py-3 px-3 text-center"><span className="text-xs text-gray-600 whitespace-nowrap">{fmt(rec.startDate)}</span></td>
                    <td className="py-3 px-3 text-center"><span className="text-xs text-gray-600 whitespace-nowrap">{fmt(rec.finishDate)}</span></td>
                    <td className="py-3 px-3 text-center">
                      {pm ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${pm.bg}`}><pm.icon className="w-3 h-3" />{pm.label}</span> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {appr ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${appr.bg}`}><appr.Icon className="w-3 h-3" />{appr.label}</span> : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-center"><ScoreBadge value={finalScore} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-16 text-center text-gray-400 text-sm">No data matches the selected filter.</div>}
        <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-4">
          <span>{rows.length} of {filteredEmployees.length} employees shown</span>
          <span className="text-gray-300">·</span>
          <span>Data diunggah dari sistem eksternal oleh HR ICF / HR Unit Usaha → otomatis masuk Approval Level 1 & Level 2 (diambil Final Score tertinggi × Bobot Modul)</span>
        </div>
      </div>
    </div>
  );
}
