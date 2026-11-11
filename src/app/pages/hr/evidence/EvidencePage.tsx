import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search, Download, Eye, ChevronDown, X, FileArchive,
  TrendingUp, Lightbulb, MessageSquare, CheckCircle2, Clock, RotateCcw, RefreshCw,
} from "lucide-react";
import { loadUploadedEvidenceList, UploadedEvidenceRecord } from "../../../services/supabaseClient";
import { toast } from "sonner";
import { useAuthStore } from "../../../store/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EvidenceType = "KPI Tracking" | "SMART Goals" | "Management Interview" | "RCA";

type ApprovalStatus = "Approved" | "Pending" | "Revision";

interface EvidenceRow {
  no: string;
  employeeId: string;
  fullName: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  approvalStatus: ApprovalStatus;
  submittedDate: string;
  year: string;
  month: string;
  // RCA-specific
  period?: string;
  kpi?: string;
  fileName?: string;
  fileUrl?: string;
}

// ─── Reference values (consistent with HR Approvals / Monitoring pages) ───────

const COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];

const DIVISIONS = [
  "Divisi Produksi & Operasional",
  "Divisi Sumber Daya Manusia",
  "Divisi Keuangan & Akuntansi",
  "Divisi Teknologi Informasi",
  "Divisi Pemasaran & Penjualan",
  "Divisi Perkebunan",
  "Divisi Operasional",
];

const DEPARTMENTS = [
  "Produksi",
  "SDM",
  "Keuangan",
  "TI",
  "Pemasaran",
  "Operasional",
  "HRD",
  "Akuntansi",
];

const STATUSES: ApprovalStatus[] = ["Approved", "Pending", "Revision"];

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Sample data ──────────────────────────────────────────────────────────────

const BASE_ROWS: Omit<EvidenceRow, "no">[] = [
  {
    employeeId: "E001", fullName: "Anis Sandi",
    position: "HR Strategic Specialist",
    department: "SDM", division: "Divisi Sumber Daya Manusia", companyUnit: "PT RSUP (Industry)",
    approvalStatus: "Approved", submittedDate: "2026-05-20", year: "2026", month: "May",
  },
  {
    employeeId: "E002", fullName: "Budi Santoso",
    position: "HR Manager",
    department: "HRD", division: "Divisi Sumber Daya Manusia", companyUnit: "PT RSUP (Industry)",
    approvalStatus: "Approved", submittedDate: "2026-05-21", year: "2026", month: "May",
  },
  {
    employeeId: "E003", fullName: "Siti Rahayu",
    position: "Recruitment Specialist",
    department: "SDM", division: "Divisi Sumber Daya Manusia", companyUnit: "PT Pulau Sambu (Guntung)",
    approvalStatus: "Pending", submittedDate: "2026-05-22", year: "2026", month: "May",
  },
  {
    employeeId: "E004", fullName: "Ahmad Fauzi",
    position: "Finance Analyst",
    department: "Keuangan", division: "Divisi Keuangan & Akuntansi", companyUnit: "PT Pulau Sambu (Jakarta)",
    approvalStatus: "Revision", submittedDate: "2026-06-01", year: "2026", month: "June",
  },
  {
    employeeId: "E005", fullName: "Kartika Wijaya",
    position: "Marketing Lead",
    department: "Pemasaran", division: "Divisi Pemasaran & Penjualan", companyUnit: "PT RSUP (Industry)",
    approvalStatus: "Approved", submittedDate: "2026-06-03", year: "2026", month: "June",
  },
  {
    employeeId: "E006", fullName: "Rizal Pratama",
    position: "Operations Supervisor",
    department: "Operasional", division: "Divisi Produksi & Operasional", companyUnit: "PT RSUP (Perkebunan)",
    approvalStatus: "Revision", submittedDate: "2026-06-05", year: "2026", month: "June",
  },
  {
    employeeId: "E007", fullName: "Dewi Lestari",
    position: "IT Support Engineer",
    department: "TI", division: "Divisi Teknologi Informasi", companyUnit: "PT GHS",
    approvalStatus: "Pending", submittedDate: "2026-06-08", year: "2026", month: "June",
  },
  {
    employeeId: "E008", fullName: "Hendra Gunawan",
    position: "Production Supervisor",
    department: "Produksi", division: "Divisi Produksi & Operasional", companyUnit: "PT RSTM",
    approvalStatus: "Approved", submittedDate: "2026-04-15", year: "2026", month: "April",
  },
  {
    employeeId: "E009", fullName: "Rina Marlina",
    position: "Procurement Officer",
    department: "Operasional", division: "Divisi Operasional", companyUnit: "PT Pulau Sambu (Kuala Enok)",
    approvalStatus: "Pending", submittedDate: "2026-04-18", year: "2026", month: "April",
  },
  {
    employeeId: "E010", fullName: "Dian Permatasari",
    position: "Quality Assurance Lead",
    department: "Produksi", division: "Divisi Produksi & Operasional", companyUnit: "ASD",
    approvalStatus: "Approved", submittedDate: "2026-03-12", year: "2026", month: "March",
  },
  {
    employeeId: "E011", fullName: "Yusuf Hakim",
    position: "Accountant",
    department: "Akuntansi", division: "Divisi Keuangan & Akuntansi", companyUnit: "PT Pulau Sambu (Guntung)",
    approvalStatus: "Pending", submittedDate: "2026-03-14", year: "2026", month: "March",
  },
  {
    employeeId: "E012", fullName: "Mega Putri",
    position: "Plantation Coordinator",
    department: "Operasional", division: "Divisi Perkebunan", companyUnit: "PT RSUP (Perkebunan)",
    approvalStatus: "Approved", submittedDate: "2025-12-10", year: "2025", month: "December",
  },
  {
    employeeId: "E013", fullName: "Fajar Nugroho",
    position: "IT Systems Analyst",
    department: "TI", division: "Divisi Teknologi Informasi", companyUnit: "PT GHS",
    approvalStatus: "Approved", submittedDate: "2025-12-15", year: "2025", month: "December",
  },
  {
    employeeId: "E014", fullName: "Laila Sari",
    position: "HR Generalist",
    department: "HRD", division: "Divisi Sumber Daya Manusia", companyUnit: "PT Pulau Sambu (Jakarta)",
    approvalStatus: "Approved", submittedDate: "2025-11-20", year: "2025", month: "November",
  },
  {
    employeeId: "E015", fullName: "Indra Kusuma",
    position: "Senior Finance Officer",
    department: "Keuangan", division: "Divisi Keuangan & Akuntansi", companyUnit: "ASD",
    approvalStatus: "Revision", submittedDate: "2025-10-05", year: "2025", month: "October",
  },
];

const ALL_ROWS: EvidenceRow[] = BASE_ROWS.map((r, i) => ({
  no: String(i + 1).padStart(2, "0"),
  ...r,
}));

type RCAApprovalStatus = "Pending" | "Closed";

interface RCAEvidenceRow extends Omit<EvidenceRow, "approvalStatus"> {
  approvalStatus: RCAApprovalStatus;
  progressAPs: number;
}

const RCA_ROWS: RCAEvidenceRow[] = [
  { no: "01", employeeId: "E001", fullName: "Anis Sandi",       position: "HR Strategic Specialist", department: "SDM",        division: "Divisi Sumber Daya Manusia",    companyUnit: "PT RSUP (Industry)",           approvalStatus: "Pending", submittedDate: "2026-01-20", year: "2026", month: "January",   period: "Jan", kpi: "Implementasi ERP System",       progressAPs: 25  },
  { no: "02", employeeId: "E002", fullName: "Budi Santoso",      position: "HR Manager",              department: "HRD",        division: "Divisi Sumber Daya Manusia",    companyUnit: "PT RSUP (Industry)",           approvalStatus: "Closed",  submittedDate: "2026-02-22", year: "2026", month: "February",  period: "Feb", kpi: "Training Completion Rate",      progressAPs: 100 },
  { no: "03", employeeId: "E003", fullName: "Siti Rahayu",       position: "Recruitment Specialist",  department: "SDM",        division: "Divisi Sumber Daya Manusia",    companyUnit: "PT Pulau Sambu (Guntung)",     approvalStatus: "Pending", submittedDate: "2026-03-15", year: "2026", month: "March",     period: "Mar", kpi: "Recruitment Cycle Time",        progressAPs: 50  },
  { no: "04", employeeId: "E004", fullName: "Ahmad Fauzi",       position: "Finance Analyst",          department: "Keuangan",   division: "Divisi Keuangan & Akuntansi",   companyUnit: "PT Pulau Sambu (Jakarta)",     approvalStatus: "Pending", submittedDate: "2026-04-10", year: "2026", month: "April",     period: "Apr", kpi: "Cost Per Hire",                 progressAPs: 0   },
  { no: "05", employeeId: "E005", fullName: "Kartika Wijaya",    position: "Marketing Lead",           department: "Pemasaran",  division: "Divisi Pemasaran & Penjualan",  companyUnit: "PT RSUP (Industry)",           approvalStatus: "Closed",  submittedDate: "2026-05-05", year: "2026", month: "May",       period: "Mei", kpi: "Turnover Rate",                 progressAPs: 100 },
  { no: "06", employeeId: "E006", fullName: "Rizal Pratama",     position: "Operations Supervisor",   department: "Operasional", division: "Divisi Produksi & Operasional", companyUnit: "PT RSUP (Perkebunan)",         approvalStatus: "Pending", submittedDate: "2026-06-08", year: "2026", month: "June",      period: "Jun", kpi: "Employee Engagement Score",     progressAPs: 75  },
  { no: "07", employeeId: "E007", fullName: "Dewi Lestari",      position: "IT Support Engineer",      department: "TI",         division: "Divisi Teknologi Informasi",    companyUnit: "PT GHS",                       approvalStatus: "Closed",  submittedDate: "2026-01-18", year: "2026", month: "January",   period: "Jan", kpi: "Headcount Fulfilment",          progressAPs: 100 },
  { no: "08", employeeId: "E008", fullName: "Hendra Gunawan",    position: "Production Supervisor",   department: "Produksi",   division: "Divisi Produksi & Operasional", companyUnit: "PT RSTM",                      approvalStatus: "Pending", submittedDate: "2026-02-24", year: "2026", month: "February",  period: "Feb", kpi: "Training Completion Rate",      progressAPs: 25  },
  { no: "09", employeeId: "E009", fullName: "Rina Marlina",      position: "Procurement Officer",     department: "Operasional", division: "Divisi Operasional",            companyUnit: "PT Pulau Sambu (Kuala Enok)", approvalStatus: "Pending", submittedDate: "2026-03-20", year: "2026", month: "March",     period: "Mar", kpi: "Recruitment Cycle Time",        progressAPs: 0   },
  { no: "10", employeeId: "E010", fullName: "Dian Permatasari",  position: "Quality Assurance Lead",  department: "Produksi",   division: "Divisi Produksi & Operasional", companyUnit: "ASD",                       approvalStatus: "Closed",  submittedDate: "2025-12-12", year: "2025", month: "December",  period: "Des", kpi: "Employee Retention Rate",       progressAPs: 100 },
  { no: "11", employeeId: "E011", fullName: "Yusuf Hakim",       position: "Accountant",              department: "Akuntansi",  division: "Divisi Keuangan & Akuntansi",   companyUnit: "PT Pulau Sambu (Guntung)",     approvalStatus: "Pending", submittedDate: "2025-12-20", year: "2025", month: "December",  period: "Des", kpi: "Employee Retention Rate",       progressAPs: 50  },
  { no: "12", employeeId: "E012", fullName: "Mega Putri",        position: "Plantation Coordinator",  department: "Operasional", division: "Divisi Perkebunan",             companyUnit: "PT RSUP (Perkebunan)",         approvalStatus: "Closed",  submittedDate: "2025-11-18", year: "2025", month: "November",  period: "Nov", kpi: "Performance Review Completion", progressAPs: 100 },
  { no: "13", employeeId: "E013", fullName: "Fajar Nugroho",     position: "IT Systems Analyst",      department: "TI",         division: "Divisi Teknologi Informasi",    companyUnit: "PT GHS",                       approvalStatus: "Pending", submittedDate: "2025-10-10", year: "2025", month: "October",   period: "Okt", kpi: "Learning Hours Per Employee",   progressAPs: 75  },
  { no: "14", employeeId: "E014", fullName: "Laila Sari",        position: "HR Generalist",           department: "HRD",        division: "Divisi Sumber Daya Manusia",    companyUnit: "PT Pulau Sambu (Jakarta)",     approvalStatus: "Closed",  submittedDate: "2025-09-22", year: "2025", month: "September", period: "Sep", kpi: "Turnover Rate",                 progressAPs: 100 },
  { no: "15", employeeId: "E015", fullName: "Indra Kusuma",      position: "Senior Finance Officer",  department: "Keuangan",   division: "Divisi Keuangan & Akuntansi",   companyUnit: "ASD",                       approvalStatus: "Pending", submittedDate: "2025-08-05", year: "2025", month: "August",    period: "Agu", kpi: "Cost Per Hire",                 progressAPs: 25  },
];

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, {
  color: string; bg: string; border: string; icon: React.ElementType;
}> = {
  "Approved": { color: "text-green-700",      bg: "bg-green-50",      border: "border-green-200",      icon: CheckCircle2 },
  "Pending":  { color: "text-amber-700",      bg: "bg-amber-50",      border: "border-amber-200",      icon: Clock        },
  "Revision": { color: "text-orange-700",     bg: "bg-orange-50",     border: "border-orange-200",     icon: RotateCcw    },
  "Closed":   { color: "text-green-800",      bg: "bg-green-100",     border: "border-green-300",      icon: CheckCircle2 },
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : pct > 0 ? "bg-amber-500" : "bg-gray-200";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold ${pct === 100 ? "text-green-700" : "text-gray-700"}`}>{pct}%</span>
    </div>
  );
}

// ─── Type meta ────────────────────────────────────────────────────────────────

const TYPE_META: Record<EvidenceType, { icon: React.ElementType; color: string }> = {
  "KPI Tracking":         { icon: TrendingUp,    color: "text-blue-600"   },
  "RCA":                  { icon: RefreshCw,     color: "text-rose-600"   },
  "SMART Goals":          { icon: Lightbulb,     color: "text-amber-600"  },
  "Management Interview": { icon: MessageSquare, color: "text-purple-600" },
};

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function FilterDropdown({
  label, options, selected, onChange,
}: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
          selected.length
            ? "border-[#1A284F] bg-[#1A284F]/5 text-[#1A284F]"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-[#1A284F] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl shadow-xl border border-gray-100 py-2 min-w-[210px] max-h-64 overflow-y-auto">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="w-3.5 h-3.5 accent-[#1A284F] rounded"
                />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EvidencePage({ type }: { type: EvidenceType }) {
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const allowedUnitOptions = authLockedUnits && authLockedUnits.length > 0 ? authLockedUnits : COMPANY_UNITS;
  const isRCA = type === "RCA";
  const showMonthFilter = type === "KPI Tracking";
  const [uploadedList, setUploadedList] = useState<UploadedEvidenceRecord[]>(() => loadUploadedEvidenceList());
  const [previewRow, setPreviewRow] = useState<EvidenceRow | null>(null);

  useEffect(() => {
    const refresh = () => setUploadedList(loadUploadedEvidenceList());
    window.addEventListener("pa-evidence-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener("pa-evidence-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const dynamicRows = useMemo<EvidenceRow[]>(() => {
    return uploadedList
      .filter((u) => u.moduleType === type)
      .map((u, idx) => ({
        no: `DB-${idx + 1}`,
        employeeId: u.employeeId,
        fullName: u.fullName,
        position: u.position,
        department: u.department,
        division: u.division,
        companyUnit: u.companyUnit,
        approvalStatus: isRCA ? ("Pending" as ApprovalStatus) : u.approvalStatus,
        submittedDate: u.submittedDate,
        year: u.period || "2026",
        month: u.month || "June",
        period: u.month?.slice(0, 3) || "Jun",
        kpi: u.kpi || u.fileName,
        fileName: u.fileName,
        fileUrl: u.url,
      }));
  }, [uploadedList, type, isRCA]);

  const sourceRows: EvidenceRow[] = useMemo(() => dynamicRows, [dynamicRows]);
  const rcaRows: typeof RCA_ROWS = [];

  const [filterYears,      setFilterYears]      = useState<string[]>([]);
  const [filterMonths,     setFilterMonths]     = useState<string[]>([]);
  const [filterUnits,      setFilterUnits]      = useState<string[]>([]);
  const [filterDivs,       setFilterDivs]       = useState<string[]>([]);
  const [filterDepts,      setFilterDepts]      = useState<string[]>([]);
  const [filterStatuses,   setFilterStatuses]   = useState<string[]>([]);
  const [filterPeriods,    setFilterPeriods]    = useState<string[]>([]);
  const [filterProgressAPs,setFilterProgressAPs] = useState<string[]>([]);
  const [search,           setSearch]           = useState("");
  const [selected,         setSelected]         = useState<Set<string>>(new Set());

  const PROGRESS_AP_OPTIONS = ["0%", "25%", "50%", "75%", "100%"];
  const RCA_PERIODS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

  const years = Array.from(new Set(sourceRows.map((r) => r.year))).sort((a, b) => b.localeCompare(a));

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sourceRows.filter((r) => {
      if (authLockedUnits && authLockedUnits.length > 0 && !authLockedUnits.includes(r.companyUnit)) return false;
      if (filterYears.length    && !filterYears.includes(r.year))              return false;
      if (filterMonths.length   && !filterMonths.includes(r.month))            return false;
      if (filterUnits.length    && !filterUnits.includes(r.companyUnit))       return false;
      if (filterDivs.length     && !filterDivs.includes(r.division))           return false;
      if (filterDepts.length    && !filterDepts.includes(r.department))        return false;
      if (filterStatuses.length && !filterStatuses.includes(r.approvalStatus)) return false;
      if (isRCA && filterPeriods.length && !filterPeriods.includes(r.period ?? "")) return false;
      if (isRCA && filterProgressAPs.length) {
        const rcaRow = rcaRows.find((rr) => rr.no === r.no);
        const pct = rcaRow ? (r.approvalStatus === "Closed" ? 100 : rcaRow.progressAPs) : 0;
        if (!filterProgressAPs.includes(`${pct}%`)) return false;
      }
      if (q && !r.employeeId.toLowerCase().includes(q) && !r.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sourceRows, filterYears, filterMonths, filterUnits, filterDivs, filterDepts, filterStatuses, filterPeriods, filterProgressAPs, search]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.no));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => { const n = new Set(prev); filtered.forEach((r) => n.delete(r.no)); return n; });
    } else {
      setSelected((prev) => { const n = new Set(prev); filtered.forEach((r) => n.add(r.no)); return n; });
    }
  }

  function toggleRow(no: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(no) ? n.delete(no) : n.add(no); return n; });
  }

  const hasSelected = selected.size > 0;

  const anyFilter =
    filterYears.length || filterMonths.length || filterUnits.length ||
    filterDivs.length  || filterDepts.length  || filterStatuses.length ||
    filterPeriods.length || filterProgressAPs.length;

  function clearAll() {
    setFilterYears([]); setFilterMonths([]); setFilterUnits([]);
    setFilterDivs([]); setFilterDepts([]); setFilterStatuses([]);
    setFilterPeriods([]); setFilterProgressAPs([]);
    setSearch("");
  }

  const TypeIcon = TYPE_META[type].icon;
  const typeColor = TYPE_META[type].color;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TypeIcon className={`w-5 h-5 ${typeColor}`} />
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Evidence — {type}</h1>
            <p className="text-xs text-gray-400 mt-0.5">Employee submission evidence records</p>
          </div>
        </div>
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span>
          <span className="mx-1">›</span><span>Evidence</span>
          <span className="mx-1">›</span>
          <span className="font-medium text-gray-700">{type}</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-3">
        {/* Filters row */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterDropdown label="Year"            options={years}        selected={filterYears}    onChange={setFilterYears}    />
          {showMonthFilter && (
            <FilterDropdown label="Period" options={MONTHS} selected={filterMonths} onChange={setFilterMonths} />
          )}
          <FilterDropdown label="Company Unit"    options={allowedUnitOptions} selected={filterUnits}   onChange={setFilterUnits}    />
          <FilterDropdown label="Division"        options={DIVISIONS}    selected={filterDivs}     onChange={setFilterDivs}     />
          <FilterDropdown label="Department"      options={DEPARTMENTS}  selected={filterDepts}    onChange={setFilterDepts}    />
          <FilterDropdown label="Approval Status" options={isRCA ? ["Pending","Closed"] : STATUSES} selected={filterStatuses} onChange={setFilterStatuses} />
          {isRCA && (
            <FilterDropdown label="Period"          options={RCA_PERIODS}       selected={filterPeriods}     onChange={setFilterPeriods}     />
          )}
          {isRCA && (
            <FilterDropdown label="Progress APs (%)" options={PROGRESS_AP_OPTIONS} selected={filterProgressAPs} onChange={setFilterProgressAPs} />
          )}

          {anyFilter ? (
            <button onClick={clearAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          ) : null}

          <div className="flex-1" />

          {/* Export .rar button */}
          <button
            disabled={!hasSelected}
            onClick={() => {
              if (!hasSelected) return;
              const chosen = filtered.filter((r) => selected.has(r.no));
              const content = chosen
                .map((r) => `${r.employeeId}\t${r.fullName}\t${r.companyUnit}\t${r.month} ${r.year}\t${r.fileName ?? `${type}_Evidence.pdf`}\t${r.fileUrl ?? "Supabase Storage"}`)
                .join("\n");
              const blob = new Blob([content], { type: "application/octet-stream" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `Evidence_${type.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.rar`;
              a.click();
              toast.success(`Exported ${chosen.length} evidence archive record(s).`);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
              hasSelected
                ? "bg-[#1A284F] text-white border-[#1A284F] hover:bg-[#131d3b] shadow-sm"
                : "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            Export .rar
            {hasSelected && (
              <span className="bg-white/25 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {selected.size}
              </span>
            )}
          </button>
        </div>

        {/* Search row */}
        <div className="flex items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Employee ID or Name…"
              className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A284F]/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""} found
            {hasSelected && (
              <span className="ml-2 text-[#1A284F] font-semibold">· {selected.size} selected</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-[#1A284F] rounded cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Actions</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-12">No</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Employee ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Full Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Department</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Division</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Company Unit</th>
                {!isRCA && (
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Period</th>
                )}
                {isRCA && <>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Period</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">KPI</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-36">Progress APs (%)</th>
                </>}
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Approval Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Submitted Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isRCA ? 14 : 12} className="py-16 text-center text-gray-400 text-xs">
                    No records found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const isChecked = selected.has(row.no);
                  const sm = STATUS_META[row.approvalStatus];
                  const StatusIcon = sm.icon;
                  return (
                    <tr
                      key={row.no}
                      className={`border-b border-gray-50 transition-colors ${
                        isChecked ? "bg-[#1A284F]/5" : "hover:bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(row.no)}
                          className="w-4 h-4 accent-[#1A284F] rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            title="View evidence"
                            onClick={() => {
                              if (row.fileUrl && row.fileUrl.startsWith("http")) {
                                window.open(row.fileUrl, "_blank", "noopener,noreferrer");
                              } else {
                                setPreviewRow(row);
                              }
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            title="Download evidence"
                            onClick={() => {
                              if (row.fileUrl) {
                                const a = document.createElement("a");
                                a.href = row.fileUrl;
                                a.download = row.fileName || `${row.employeeId}_${type}_Evidence.pdf`;
                                a.target = "_blank";
                                a.click();
                              } else {
                                const blob = new Blob([`Evidence Record: ${row.employeeId} - ${row.fullName} (${type} ${row.month} ${row.year})`], { type: "text/plain" });
                                const a = document.createElement("a");
                                a.href = URL.createObjectURL(blob);
                                a.download = `${row.employeeId}_${type.replace(/\s+/g, "_")}_${row.month}_${row.year}.txt`;
                                a.click();
                              }
                              toast.success(`Downloaded evidence for ${row.fullName}`);
                            }}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{row.no}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">{row.employeeId}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-800 whitespace-nowrap">{row.fullName}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.position}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.department}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{row.division}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{row.companyUnit}</td>
                      {!isRCA && (
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-[#1A284F]/8 text-[#1A284F] rounded-full text-[11px] font-semibold whitespace-nowrap">{row.month}</span>
                        </td>
                      )}
                      {isRCA && (() => {
                        const rcaRow = rcaRows.find((r) => r.no === row.no);
                        const pct = rcaRow ? (row.approvalStatus === "Closed" ? 100 : rcaRow.progressAPs) : 0;
                        return <>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-[#1A284F]/10 text-[#1A284F] rounded-full text-[11px] font-bold whitespace-nowrap">{row.period || "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-700 font-medium max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis">{row.kpi || "—"}</td>
                          <td className="px-4 py-3"><ProgressBar pct={pct} /></td>
                        </>;
                      })()}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${sm.bg} ${sm.color} ${sm.border}`}>
                          <StatusIcon className="w-3 h-3" />
                          {row.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{row.submittedDate}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewRow(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-[#1A284F] text-base">Evidence Preview — {type}</h3>
                <p className="text-xs text-gray-400">{previewRow.employeeId} · {previewRow.fullName}</p>
              </div>
              <button onClick={() => setPreviewRow(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 rounded-xl p-4">
              <div><span className="text-gray-400 block">Company Unit</span><span className="font-semibold text-gray-800">{previewRow.companyUnit}</span></div>
              <div><span className="text-gray-400 block">Division / Dept</span><span className="font-semibold text-gray-800">{previewRow.division} / {previewRow.department}</span></div>
              <div><span className="text-gray-400 block">Period</span><span className="font-semibold text-gray-800">{previewRow.month} {previewRow.year}</span></div>
              <div><span className="text-gray-400 block">Submitted Date</span><span className="font-semibold text-gray-800">{previewRow.submittedDate}</span></div>
              <div className="col-span-2"><span className="text-gray-400 block">File Name</span><span className="font-semibold text-[#1A284F]">{previewRow.fileName || `${previewRow.employeeId}_${type.replace(/\s+/g, "_")}_${previewRow.month}.pdf`}</span></div>
            </div>
            {previewRow.fileUrl && (
              <div className="pt-2">
                <a href={previewRow.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline">
                  Open Stored File in New Tab
                </a>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => setPreviewRow(null)} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
