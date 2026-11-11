import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "react-router";
import { ModuleRouteNav } from "../../components/ModuleRouteNav";
import { routeBase, tabSlug } from "../../utils/useRouteTab";
import { Search, Eye, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Filter, FileCheck, Check, CheckCircle2, XCircle, RotateCcw, X, FileEdit, Clock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ReviewDrawer, type ApprovalRow } from "../../components/ReviewDrawer";
import { SettingApprovalDrawer } from "../../components/SettingApprovalDrawer";
import { loadSubmittedGoals } from "../shared/smartGoalsStore";
import { applyOverrides, saveOverride } from "../shared/approvalsStore";
import { saveRCAApprovalDecision } from "../shared/rcaApprovalStore";
import { feedbackApprovalRows } from "../shared/interDepartmentFeedbackStore";
import { projectApprovalRows } from "../../store/projectStore";
import {
  canUserAccessEmployeeData,
  getAllowedApprovalTypesForUser,
  getDirectApprovalRoleForTarget,
  getScopedFilterOptionsForUser,
  shouldBypassCheckerForSubmission,
  useAuthStore,
} from "../../store/authStore";

const TEAM_UNIT = "PT RSUP (Industry)";
const TEAM_DIV  = "Divisi Sumber Daya Manusia";

const BASE_CHECKIN: ApprovalRow[] = [];
const BASE_SETTING: ApprovalRow[] = [];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_NUM: Record<string,string> = Object.fromEntries(MONTHS.map((m, i) => [m, String(i + 1).padStart(2, "0")]));

const CHECKIN_FILTER_OPTIONS = {
  companyUnit: [TEAM_UNIT], year: ["2026", "2025", "2024"], month: MONTHS, division: [TEAM_DIV],
  department: ["SDM"], approvalType: ["KPI", "SMART Goals", "Appraisal Form", "Managerial Skill", "Project", "RCA", "Inter-Department Feedback"],
};
const SETTING_FILTER_OPTIONS = {
  companyUnit: [TEAM_UNIT], year: ["2026", "2025", "2024"], month: MONTHS, division: [TEAM_DIV],
  department: ["SDM"], approvalType: ["KPI", "SMART Goals", "Appraisal Form", "Managerial Skill", "RCA"],
};

const PENDING_STATUSES  = new Set(["Pending", "Edit Request"]);
const HISTORY_STATUSES  = new Set(["Assessed-Approver 1", "Approved", "Revision", "EditRequest-PendingA2", "EditRequest-Rejected"]);

type MainTab = "checkin" | "setting";

export function SupervisorApprovals() {
  const location = useLocation();
  const { tab } = useParams();
  const { activeUser } = useAuthStore();
  const mainTab: MainTab = /\/setting(\/|$)/.test(location.pathname) ? "setting" : "checkin";
  const moduleTypes = getAllowedApprovalTypesForUser(activeUser, mainTab);
  const allowedTypeSet = new Set(moduleTypes);
  const routeType = moduleTypes.find((type) => tabSlug(type) === tab);
  const moduleBase = routeBase(location.pathname, routeType ? tab : undefined);
  const scopedFilterMeta = getScopedFilterOptionsForUser(activeUser);
  const dynamicCheckinFilterOpts = {
    ...CHECKIN_FILTER_OPTIONS,
    companyUnit: scopedFilterMeta.units.length > 0 ? scopedFilterMeta.units : [activeUser.company],
    division: scopedFilterMeta.divisions.length > 0 ? scopedFilterMeta.divisions : [activeUser.division],
    department: scopedFilterMeta.departments.length > 0 ? scopedFilterMeta.departments : [activeUser.department],
    approvalType: moduleTypes,
  };
  const dynamicSettingFilterOpts = {
    ...SETTING_FILTER_OPTIONS,
    companyUnit: scopedFilterMeta.units.length > 0 ? scopedFilterMeta.units : [activeUser.company],
    division: scopedFilterMeta.divisions.length > 0 ? scopedFilterMeta.divisions : [activeUser.division],
    department: scopedFilterMeta.departments.length > 0 ? scopedFilterMeta.departments : [activeUser.department],
    approvalType: moduleTypes,
  };

  const filterByScopeAndSelfCheckerRule = (rows: ApprovalRow[]): ApprovalRow[] => {
    return rows.filter((row) => {
      if (!allowedTypeSet.has(row.type)) return false;
      // Bagian XII Poin 2: HR Unit Checker tidak bisa melakukan Checker pada pengajuan KPI & SMART Goals miliknya sendiri
      if (
        (activeUser.role === "HR Unit" || activeUser.isHrUnitChecker) &&
        (row.type === "KPI" || row.type === "SMART Goals") &&
        (row.employeeId.toLowerCase().replace(/^emp-?0*/i, "") === activeUser.employeeId.toLowerCase().replace(/^e0*/i, "") ||
          row.name.toLowerCase() === activeUser.name.toLowerCase()) &&
        shouldBypassCheckerForSubmission(activeUser.employeeId)
      ) {
        return false;
      }
      // Bagian I Poin 4: Hanya melihat data karyawan di dalam wewenang approval-nya
      return (
        canUserAccessEmployeeData(activeUser, row.employeeId) ||
        canUserAccessEmployeeData(activeUser, row.name) ||
        row.companyUnit === activeUser.company
      );
    });
  };

  const [checkinData, setCheckinData] = useState<ApprovalRow[]>(() => [...applyOverrides(BASE_CHECKIN, "approver1", "measurement"), ...projectApprovalRows("approver1"), ...feedbackApprovalRows("approver1")]);
  useEffect(() => {
    const refresh = () => {
      setCheckinData([...applyOverrides(BASE_CHECKIN, "approver1", "measurement"), ...projectApprovalRows("approver1"), ...feedbackApprovalRows("approver1")]);
      setSettingData(applyOverrides(BASE_SETTING, "approver1", "setting"));
    };
    refresh();
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("feedback-updated", refresh); window.removeEventListener("appraisal-updated", refresh); window.removeEventListener("storage", refresh); };
  }, [location.pathname]);
  const [settingData, setSettingData] = useState<ApprovalRow[]>(() => {
    const base = applyOverrides(BASE_SETTING, "approver1", "setting");
    const live = loadSubmittedGoals();
    if (live && live.length > 0) {
      return base.map((r) => r.no === "ST-02" ? { ...r, submittedDate: "29/05/2026", status: (applyOverrides(BASE_SETTING, "approver1", "setting").find((x) => x.no === "ST-02")?.status ?? "Pending") } : r);
    }
    return base;
  });

  useEffect(() => {
    const live = loadSubmittedGoals();
    if (live && live.length > 0) {
      setSettingData((prev) => prev.map((r) => r.no === "ST-02" && r.submittedDate === "-" ? { ...r, submittedDate: "29/05/2026" } : r));
    }
  }, [location.pathname]);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#1A284F]">
          {mainTab === "checkin" ? "Performance Appraisal Measurement" : "Performance Appraisal Setting"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <p className="text-gray-500 text-sm">{activeUser.company} · {activeUser.division}</p>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1A284F] border border-blue-200">
            Cakupan Wewenang: {scopedFilterMeta.authorityLabel}
          </span>
        </div>
      </div>
      <ModuleRouteNav base={moduleBase} modules={moduleTypes} label="Modul approval" />
      {mainTab === "checkin" ? (
        <ApprovalsTable key={`checkin-${routeType ?? "all"}`} initialType={routeType} data={filterByScopeAndSelfCheckerRule(checkinData)} onDataChange={setCheckinData} filterOptions={dynamicCheckinFilterOpts} reviewerRole="approver1" isSetting={false} />
      ) : (
        <ApprovalsTable key={`setting-${routeType ?? "all"}`} initialType={routeType} data={filterByScopeAndSelfCheckerRule(settingData)} onDataChange={setSettingData} filterOptions={dynamicSettingFilterOpts} reviewerRole="approver1" isSetting={true} />
      )}
    </div>
  );
}

// ── Edit Request Review Modal ──────────────────────────────────────────────────

function EditRequestReviewModal({ row, onAccept, onReject, onClose }: {
  row: ApprovalRow;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">Edit Request Review</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Employee</p>
              <p className="font-semibold text-gray-900">{row.name}</p>
              <p className="text-gray-500">{row.employeeId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Approval Type</p>
              <p className="font-semibold text-gray-900">{row.type}</p>
              <p className="text-gray-500">{row.position}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Submitted Date</p>
              <p className="text-gray-700">{row.submittedDate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Request Date</p>
              <p className="text-gray-700">{row.editRequestDate ?? "-"}</p>
            </div>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider font-semibold mb-2">Reason for Edit Request</p>
            <p className="text-sm text-amber-900 leading-relaxed">{row.editRequestReason}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" /> Accept Request
          </button>
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <XCircle className="w-4 h-4" /> Reject Request
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── History status tag helper ─────────────────────────────────────────────────

function HistoryTag({ status }: { status: string }) {
  if (status === "Assessed-Approver 1") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
        <Clock className="w-3 h-3" /> Pending-Approver 2
      </span>
    );
  }
  if (status === "Approved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
        <Check className="w-3 h-3" /> Assessed
      </span>
    );
  }
  if (status === "Revision") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-300">
        <RotateCcw className="w-3 h-3" /> Revision
      </span>
    );
  }
  if (status === "EditRequest-PendingA2") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300">
        <Clock className="w-3 h-3" /> Pending-Approver 2
      </span>
    );
  }
  if (status === "EditRequest-AcceptedA2") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 className="w-3 h-3" /> Edit Accepted
      </span>
    );
  }
  if (status === "EditRequest-Rejected") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-300">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    );
  }
  return null;
}

// ── Shared table ───────────────────────────────────────────────────────────────

function ApprovalsTable({
  data, onDataChange, filterOptions, reviewerRole, isSetting, initialType,
}: {
  data: ApprovalRow[];
  onDataChange: (rows: ApprovalRow[]) => void;
  filterOptions: typeof CHECKIN_FILTER_OPTIONS;
  reviewerRole: "approver1" | "approver2";
  isSetting: boolean;
  initialType?: string;
}) {
  const { activeUser } = useAuthStore();
  const [activeTab, setActiveTab]                         = useState("Pending");
  const [search, setSearch]                               = useState("");
  const [selectedCompanyUnits, setSelectedCompanyUnits]   = useState<string[]>([]);
  const [selectedYears, setSelectedYears]                 = useState<string[]>(["2026"]);
  const [selectedMonths, setSelectedMonths]               = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions]         = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments]     = useState<string[]>([]);
  const [selectedApprovalTypes, setSelectedApprovalTypes] = useState<string[]>(() => initialType ? [initialType] : []);
  const [openFilter, setOpenFilter]                       = useState<string | null>(null);
  const [currentPage, setCurrentPage]                     = useState(1);
  const [sortCol, setSortCol]   = useState<string>("no");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const [reviewRow, setReviewRow]                         = useState<ApprovalRow | null>(null);
  const [reviewFromHistory, setReviewFromHistory]         = useState(false);
  const [editReviewRow, setEditReviewRow]                 = useState<ApprovalRow | null>(null);
  const PAGE_SIZE = 8;
  const TODAY = "08/06/2026";

  const toggleFilter = (name: string) => setOpenFilter(openFilter === name ? null : name);
  const toggleSelection = (list: string[], setList: (v: string[]) => void, item: string) =>
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  // date format: "DD/MM/YYYY" — extract year (parts[2]) and month (parts[1])
  const getDateParts = (d: string) => d !== "-" ? d.split("/") : null;

  const filtered = data.filter((row) => {
    const matchTab    = activeTab === "Pending" ? PENDING_STATUSES.has(row.status) : HISTORY_STATUSES.has(row.status);
    const matchSearch = !search || row.name.toLowerCase().includes(search.toLowerCase()) || row.employeeId.toLowerCase().includes(search.toLowerCase());
    const matchUnit   = !selectedCompanyUnits.length  || selectedCompanyUnits.includes(row.companyUnit);
    const matchDiv    = !selectedDivisions.length     || selectedDivisions.includes(row.division);
    const matchDept   = !selectedDepartments.length   || selectedDepartments.includes(row.department);
    const matchType   = !selectedApprovalTypes.length || selectedApprovalTypes.includes(row.type);
    const parts       = getDateParts(row.submittedDate);
    const matchYear   = !selectedYears.length   || (parts ? selectedYears.includes(parts[2]) : false);
    const matchMonth  = !selectedMonths.length  || (parts ? selectedMonths.some(m => MONTH_NUM[m] === parts[1]) : false);
    return matchTab && matchSearch && matchUnit && matchDiv && matchDept && matchType && matchYear && matchMonth;
  });

  const hasActiveFilters = selectedCompanyUnits.length > 0 || !(selectedYears.length === 1 && selectedYears[0] === "2026") || selectedMonths.length > 0 || selectedDivisions.length > 0 || selectedDepartments.length > 0 || selectedApprovalTypes.length > 0 || !!search;

  const COL_GETTER: Record<string, (r: ApprovalRow) => string> = {
    no:           (r) => r.no,
    employeeId:   (r) => r.employeeId,
    name:         (r) => r.name,
    position:     (r) => r.position,
    department:   (r) => r.department,
    division:     (r) => r.division,
    companyUnit:  (r) => r.companyUnit,
    type:         (r) => r.type,
    submittedDate:(r) => { const p = getDateParts(r.submittedDate); return p ? `${p[2]}${p[1]}${p[0]}` : ""; },
    approvalDate: (r) => { const p = getDateParts(r.approvalDate);  return p ? `${p[2]}${p[1]}${p[0]}` : ""; },
  };

  const sorted = [...filtered].sort((a, b) => {
    const getter = COL_GETTER[sortCol] ?? COL_GETTER.no;
    const cmp = getter(a).localeCompare(getter(b), "id", { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated  = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => setCurrentPage(1), [activeTab, search, selectedCompanyUnits, selectedYears, selectedMonths, selectedDivisions, selectedDepartments, selectedApprovalTypes, sortCol, sortDir]);

  const pendingCount = data.filter((r) => PENDING_STATUSES.has(r.status)).length;

  const handleAcceptEdit = (row: ApprovalRow) => {
    // Approver 1 accepts → pending approver 2
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "EditRequest-PendingA2" } : r));
    setEditReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleRejectEdit = (row: ApprovalRow) => {
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "EditRequest-Rejected" } : r));
    setEditReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleApprove = (row: ApprovalRow) => {
    const isAssessedType = (row.type === "KPI" || row.type === "SMART Goals" || row.type === "RCA") && reviewerRole === "approver1";
    const newStatus = isAssessedType ? "Assessed-Approver 1" : "Approved";
    saveOverride(row.no, newStatus, TODAY);
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: newStatus, approvalDate: TODAY } : r));
    if (row.type === "RCA") {
      saveRCAApprovalDecision({ approverName: "Budi Santoso", approverRole: "Atasan Langsung", approverLevel: 1, status: newStatus, comment: "", reviewedDate: TODAY });
    }
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleRevision = (row: ApprovalRow, note: string) => {
    saveOverride(row.no, "Revision", "-");
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "Revision", approvalDate: "-" } : r));
    if (row.type === "RCA") {
      saveRCAApprovalDecision({ approverName: "Budi Santoso", approverRole: "Atasan Langsung", approverLevel: 1, status: "Revision", comment: note ?? "", reviewedDate: TODAY });
    }
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleAssessed = (row: ApprovalRow) => {
    saveOverride(row.no, "Assessed-Approver 1", TODAY);
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "Assessed-Approver 1", approvalDate: TODAY } : r));
    if (row.type === "RCA") {
      saveRCAApprovalDecision({ approverName: "Budi Santoso", approverRole: "Atasan Langsung", approverLevel: 1, status: "Assessed-Approver 1", comment: "", reviewedDate: TODAY });
    }
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const isHistory = activeTab === "Approval History";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      {/* Tabs */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setActiveTab("Pending")}
          className={`relative px-8 py-2 rounded-lg font-medium transition-colors ${activeTab === "Pending" ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
        >
          Pending
          {pendingCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">{pendingCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("Approval History")}
          className={`px-8 py-2 rounded-lg font-medium border-2 transition-colors ${isHistory ? "border-green-500 text-green-600 bg-green-50" : "border-green-500 text-green-600 hover:bg-green-50"}`}
        >
          Approval History
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <FilterDropdown label="Company Unit"  options={filterOptions.companyUnit}  selected={selectedCompanyUnits}  onToggle={(i) => toggleSelection(selectedCompanyUnits, setSelectedCompanyUnits, i)} isOpen={openFilter === "companyUnit"}  onToggleOpen={() => toggleFilter("companyUnit")} />
        <FilterDropdown label="Year"          options={filterOptions.year}         selected={selectedYears}         onToggle={(i) => toggleSelection(selectedYears, setSelectedYears, i)}                 isOpen={openFilter === "year"}         onToggleOpen={() => toggleFilter("year")} />
        <FilterDropdown label="Month"         options={filterOptions.month}        selected={selectedMonths}        onToggle={(i) => toggleSelection(selectedMonths, setSelectedMonths, i)}               isOpen={openFilter === "month"}        onToggleOpen={() => toggleFilter("month")} />
        <FilterDropdown label="Division"      options={filterOptions.division}     selected={selectedDivisions}     onToggle={(i) => toggleSelection(selectedDivisions, setSelectedDivisions, i)}         isOpen={openFilter === "division"}     onToggleOpen={() => toggleFilter("division")} />
        <FilterDropdown label="Department"    options={filterOptions.department}   selected={selectedDepartments}   onToggle={(i) => toggleSelection(selectedDepartments, setSelectedDepartments, i)}   isOpen={openFilter === "department"}   onToggleOpen={() => toggleFilter("department")} />
        <FilterDropdown label="Approval Type" options={filterOptions.approvalType} selected={selectedApprovalTypes} onToggle={(i) => toggleSelection(selectedApprovalTypes, setSelectedApprovalTypes, i)} isOpen={openFilter === "approvalType"} onToggleOpen={() => toggleFilter("approvalType")} />
      </div>
      {hasActiveFilters && (
        <div className="flex justify-end -mt-3 mb-3">
          <button onClick={() => { setSelectedCompanyUnits([]); setSelectedYears(["2026"]); setSelectedMonths([]); setSelectedDivisions([]); setSelectedDepartments([]); setSelectedApprovalTypes([]); setSearch(""); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by employee name or ID..." className="pl-12 py-6 bg-[#FAFAFA] border-gray-200 rounded-full w-full text-base" />
        </div>
        <Button className="bg-[#1A284F] hover:bg-[#131d3b] text-white px-10 py-6 rounded-full text-base font-medium">Search</Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {([
                { col: null,            label: "Actions",       cls: "" },
                { col: "no",            label: "No",            cls: "w-16" },
                { col: "employeeId",    label: "Employee ID",   cls: "" },
                { col: "name",          label: "Full Name",     cls: "" },
                { col: "position",      label: "Position",      cls: "" },
                { col: "department",    label: "Department",    cls: "" },
                { col: "division",      label: "Division",      cls: "" },
                { col: "companyUnit",   label: "Company Unit",  cls: "" },
                { col: "type",          label: "Approval Type", cls: "" },
                { col: "submittedDate", label: "Submitted Date",cls: "" },
                { col: "approvalDate",  label: "Approval Date", cls: "" },
              ] as { col: string | null; label: string; cls: string }[]).map(({ col, label, cls }) =>
                col ? (
                  <th key={col} className={`py-4 px-4 ${cls} cursor-pointer select-none group`} onClick={() => handleSort(col)}>
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <span className="text-gray-400 group-hover:text-gray-600">
                        {sortCol === col ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                      </span>
                    </span>
                  </th>
                ) : (
                  <th key="actions" className={`py-4 px-4 ${cls}`}>{label}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={11} className="py-16 text-center text-gray-400 text-sm">No records found for this tab.</td></tr>
            ) : paginated.map((row, idx) => (
              <tr key={row.no} className={`border-b border-gray-50/50 hover:bg-gray-50/50 ${idx === 0 ? "bg-[#FDF9F1]" : ""}`}>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Pending tab */}
                    {activeTab === "Pending" && row.status === "Pending" && (() => {
                      const rel = getDirectApprovalRoleForTarget(activeUser, row.employeeId);
                      const isDirectApprover = rel === "ap1" || rel === "ap2" || rel === "checker" || rel === "validator";
                      return isDirectApprover ? (
                        <button
                          onClick={() => { setReviewRow(row); setReviewFromHistory(false); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#1A284F] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg"
                          title="Review & Approve (Direct Approver)"
                        >
                          <FileCheck className="w-4 h-4" />
                          <span>{rel === "ap1" ? "Approve (AP1)" : rel === "ap2" ? "Approve (AP2)" : rel === "checker" ? "Check (HR Unit)" : "Validate"}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => { setReviewRow(row); setReviewFromHistory(true); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg"
                          title="View Only (Cakupan Hirarki Berjenjang)"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View (Hirarki)</span>
                        </button>
                      );
                    })()}
                    {activeTab === "Pending" && row.status === "Edit Request" && (
                      <button
                        onClick={() => setEditReviewRow(row)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                        title="Review Edit Request"
                      >
                        <FileEdit className="w-3.5 h-3.5" /> Review Request
                      </button>
                    )}
                    {/* Approval History tab */}
                    {isHistory && (
                      <>
                        <button onClick={() => { setReviewRow(row); setReviewFromHistory(true); }} className="p-1 text-gray-500 hover:bg-gray-100 rounded" title="View">
                          <Eye className="w-5 h-5" />
                        </button>
                        <HistoryTag status={row.status} />
                      </>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4 text-gray-500 text-sm">{row.no}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.employeeId}</td>
                <td className="py-4 px-4 text-sm font-medium text-gray-900">{row.name}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.position}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.department}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.division}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.companyUnit}</td>
                <td className="py-4 px-4 text-sm font-medium text-gray-900">{row.type}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{row.submittedDate}</td>
                <td className="py-4 px-4 text-sm text-gray-600">{isHistory ? row.approvalDate : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 mt-8">
        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronsLeft className="w-4 h-4" /></button>
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => setCurrentPage(p)} className={`w-10 h-10 flex items-center justify-center rounded-lg font-medium ${p === currentPage ? "bg-[#1A284F] text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{p}</button>
        ))}
        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-40"><ChevronsRight className="w-4 h-4" /></button>
      </div>

      {reviewRow && !isSetting && (
        <ReviewDrawer row={reviewRow} reviewerRole={reviewerRole} onClose={() => setReviewRow(null)} onApprove={() => handleApprove(reviewRow)} onRevision={(note) => handleRevision(reviewRow, note)} onAssessed={() => handleAssessed(reviewRow)} readOnly={reviewFromHistory} />
      )}
      {reviewRow && isSetting && (
        <SettingApprovalDrawer row={reviewRow} onClose={() => setReviewRow(null)} onApprove={() => handleApprove(reviewRow)} onRevision={(note) => handleRevision(reviewRow, note)} readOnly={reviewFromHistory} />
      )}
      {editReviewRow && (
        <EditRequestReviewModal
          row={editReviewRow}
          onAccept={() => handleAcceptEdit(editReviewRow)}
          onReject={() => handleRejectEdit(editReviewRow)}
          onClose={() => setEditReviewRow(null)}
        />
      )}
    </div>
  );
}

function FilterDropdown({ label, options, selected, onToggle, isOpen, onToggleOpen }: {
  label: string; options: string[]; selected: string[];
  onToggle: (item: string) => void; isOpen: boolean; onToggleOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node) && isOpen) onToggleOpen(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onToggleOpen]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={onToggleOpen} className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span>{label}{selected.length > 0 && <span className="ml-2 px-2 py-0.5 bg-[#1A284F] text-white text-xs rounded-full">{selected.length}</span>}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {options.map((option) => (
            <label key={option} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} className="w-4 h-4 text-[#1A284F] border-gray-300 rounded focus:ring-[#1A284F] focus:ring-2" />
              <span className="text-sm text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
