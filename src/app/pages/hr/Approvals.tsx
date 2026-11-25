// @refresh reset
import { useState, useRef, useEffect } from "react";
import { feedbackApprovalRows, refreshFeedbackSubmissionsFromBackend } from "../shared/interDepartmentFeedbackStore";
import { projectApprovalRows } from "../../store/projectStore";
import { useLocation, useParams } from "react-router";
import { ModuleRouteNav } from "../../components/ModuleRouteNav";
import { routeBase, tabSlug } from "../../utils/useRouteTab";
import { Search, Eye, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, Filter, FileCheck, CheckCircle2, XCircle, RotateCcw, X, FileEdit, Clock, ListTodo, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ReviewDrawer, type ApprovalRow } from "../../components/ReviewDrawer";
import { FeedbackApprovalDrawer } from "../../components/FeedbackApprovalDrawer";
import { SettingApprovalDrawer } from "../../components/SettingApprovalDrawer";
import { KpiTrackingEditReviewDrawer } from "../../components/KpiTrackingEditReviewDrawer";
import { TargetEditRequestsSection } from "../../components/TargetEditRequestsSection";
import { loadSubmittedGoals } from "../shared/smartGoalsStore";
import { applyOverrides, resolveDynamicApprovalRowsForUser, saveOverride } from "../shared/approvalsStore";
import {
  COMPANY_UNIT_LOCATIONS,
  getAllowedApprovalTypesForUser,
  getScopedFilterOptionsForUser,
  isAdminOrHrIcfRole,
  loadManagedUsers,
  useAuthStore,
} from "../../store/authStore";
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat";
import {
  approveKpiTrackingEditRequest,
  getKpiTrackingEditApprovalRowsForViewer,
  KPI_TRACKING_EDIT_EVENT,
  loadKpiTrackingEditRequests,
  refreshKpiTrackingEditRequestsFromBackend,
  rejectKpiTrackingEditRequest,
  reviseKpiTrackingEditRequest,
} from "../../store/kpiTrackingEditStore";

const BASE_CHECKIN: ApprovalRow[] = [];
const BASE_SETTING: ApprovalRow[] = [];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_NUM: Record<string,string> = Object.fromEntries(MONTHS.map((m, i) => [m, String(i + 1).padStart(2, "0")]));

const DEFAULT_COMPANY_UNITS = ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)", "PT RSTM", "PT GHS", "PT RSUP ASD"];

interface ApprovalFilterOptions {
  companyUnit: string[];
  year: string[];
  month: string[];
  division: string[];
  department: string[];
  bagian: string[];
}

const MODULE_BADGE_TONE: Record<string, string> = {
  KPI: "bg-blue-50 text-blue-700 border-blue-200",
  "SMART Goals": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Appraisal Form": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Managerial Skill": "bg-teal-50 text-teal-700 border-teal-200",
  Project: "bg-amber-50 text-amber-800 border-amber-200",
  "Inter-Department Feedback": "bg-cyan-50 text-cyan-800 border-cyan-200",
  RCA: "bg-rose-50 text-rose-700 border-rose-200",
};

const PAGE_SIZE = 8;
type MainTab = "checkin" | "setting";

const PENDING_STATUSES = new Set(["Pending", "Pending-Hasil Tindak Lanjut", "Edit Request"]);
const HISTORY_STATUSES = new Set(["Pending-Approver 1", "Pending-Approver 2", "Pending-Validate", "Checked", "Approved", "Approved-Hasil Tindak Lanjut", "Validated", "Assessed-Approver 1", "Assessed-Approver 2", "Revision", "Revision-Hasil Tindak Lanjut", "EditRequest-PendingA2", "EditRequest-AcceptedA2", "EditRequest-Rejected"]);

export function HRApprovals({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  const location = useLocation();
  const { tab } = useParams();
  const { activeUser, lockedUnits: authLockedUnits } = useAuthStore();
  const isGlobalAdmin = isAdminOrHrIcfRole(activeUser.role);
  const effectiveLockedUnits = isGlobalAdmin ? undefined : (lockedUnits ?? authLockedUnits);
  const scopedFilterMeta = getScopedFilterOptionsForUser(activeUser);
  const mainTab: MainTab = /\/setting(\/|$)/.test(location.pathname) ? "setting" : "checkin";
  const moduleTypes = getAllowedApprovalTypesForUser(activeUser, mainTab);
  const allowedTypeSet = new Set(moduleTypes);
  const routeType = moduleTypes.find((type) => tabSlug(type) === tab);
  const moduleBase = routeBase(location.pathname, routeType ? tab : undefined);

  const baseCheckin = effectiveLockedUnits ? BASE_CHECKIN.filter(r => effectiveLockedUnits.includes(r.companyUnit)) : BASE_CHECKIN;
  const baseSetting = effectiveLockedUnits ? BASE_SETTING.filter(r => effectiveLockedUnits.includes(r.companyUnit)) : BASE_SETTING;

  const buildCheckinRows = () =>
    [
      ...(allowedTypeSet.has("KPI")
        ? getKpiTrackingEditApprovalRowsForViewer(activeUser, loadManagedUsers(), effectiveLockedUnits)
        : []),
      ...resolveDynamicApprovalRowsForUser(
        [
          ...applyOverrides(baseCheckin, "approver2", "measurement"),
          ...projectApprovalRows("approver2"),
          ...feedbackApprovalRows("approver2"),
        ],
        activeUser,
        "measurement",
        allowedTypeSet,
        effectiveLockedUnits,
      ),
    ];

  const buildSettingRows = () =>
    resolveDynamicApprovalRowsForUser(
      applyOverrides(baseSetting, "approver2", "setting"),
      activeUser,
      "setting",
      allowedTypeSet,
      effectiveLockedUnits,
    );

  const [checkinData, setCheckinData] = useState<ApprovalRow[]>(() =>
    mainTab === "checkin" ? buildCheckinRows() : [],
  );
  const [settingData, setSettingData] = useState<ApprovalRow[]>(() =>
    mainTab === "setting" ? buildSettingRows() : [],
  );

  useEffect(() => {
    const refresh = () => {
      if (mainTab === "checkin") {
        setCheckinData(buildCheckinRows());
      } else {
        setSettingData(buildSettingRows());
      }
    };
    refresh();
    if (mainTab === "checkin") {
      void refreshFeedbackSubmissionsFromBackend();
      void refreshKpiTrackingEditRequestsFromBackend();
    }
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("pa-auth-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener(KPI_TRACKING_EDIT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("feedback-updated", refresh);
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("pa-auth-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener(KPI_TRACKING_EDIT_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [location.pathname, mainTab, effectiveLockedUnits?.join(",") ?? "", activeUser.employeeId]);

  const activeRows = mainTab === "checkin" ? checkinData : settingData;
  const allManaged = loadManagedUsers().filter(
    (u) => u.status === "Active" && (!effectiveLockedUnits || effectiveLockedUnits.includes(u.company)),
  );
  const uniqSorted = (vals: (string | undefined)[]) =>
    Array.from(new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id"));

  const dynamicFilterOpts: ApprovalFilterOptions = {
    companyUnit: effectiveLockedUnits ?? uniqSorted([...COMPANY_UNIT_LOCATIONS.map((c) => c.company), ...DEFAULT_COMPANY_UNITS, ...activeRows.map((r) => r.companyUnit)]),
    year: ["2026"],
    month: MONTHS,
    division: uniqSorted([...scopedFilterMeta.divisions, ...allManaged.map((u) => u.division), ...activeRows.map((r) => r.division)]),
    department: uniqSorted([...scopedFilterMeta.departments, ...allManaged.map((u) => u.department), ...activeRows.map((r) => r.department)]),
    bagian: uniqSorted([...scopedFilterMeta.bagians, ...allManaged.map((u) => u.bagian), ...activeRows.map((r) => r.bagian)]),
  };

  useEffect(() => {
    const live = loadSubmittedGoals();
    if (live && live.length > 0) {
      setSettingData((prev) => prev.map((r) => r.no === "HST-04" && r.submittedDate === "-" ? { ...r, submittedDate: "29/05/2026" } : r));
    }
  }, [location.pathname]);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#1A284F]">
          {mainTab === "checkin" ? "Performance Appraisal Measurement" : "Performance Appraisal Setting"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <p className="text-gray-500 text-sm">Review and approve submitted KPI & SMART Goals</p>
          {(activeUser.role === "HR Unit" || activeUser.role === "GM") && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#1A284F] border border-blue-200">
              Cakupan Wewenang: {scopedFilterMeta.authorityLabel}
            </span>
          )}
        </div>
      </div>
      <ModuleRouteNav base={moduleBase} modules={moduleTypes} label="Modul approval" />
      {mainTab === "checkin" ? (
        <ApprovalsTable key={`checkin-${routeType ?? "all"}-${activeUser.employeeId}`} initialType={routeType} data={checkinData} onDataChange={setCheckinData} filterOptions={dynamicFilterOpts} reviewerRole="approver2" isSetting={false} />
      ) : (
        <ApprovalsTable key={`setting-${routeType ?? "all"}-${activeUser.employeeId}`} initialType={routeType} data={settingData} onDataChange={setSettingData} filterOptions={dynamicFilterOpts} reviewerRole="approver2" isSetting={true} />
      )}
    </div>
  );
}

// ── Edit Request Review Modal ──────────────────────────────────────────────────

function EditRequestReviewModal({ row, onAccept, onReject, onClose }: {
  row: ApprovalRow;
  onAccept: () => void;
  onReject: (note?: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const trackingReqId = row.no.startsWith("KPITREDIT::") ? row.no.slice("KPITREDIT::".length) : "";
  const trackingReq = trackingReqId ? loadKpiTrackingEditRequests().find((r) => r.id === trackingReqId) : undefined;
  const actionLabel =
    row.workflowStageForRow === "checker"
      ? "Check & Lanjutkan"
      : row.workflowStageForRow === "validator"
      ? "Validate Request"
      : "Approve Request";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">Review Request Edit KPI Tracking</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
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
          {trackingReq && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-slate-600">Bulan yang Diajukan:</span>
                {trackingReq.monthLabels.map((m) => (
                  <span key={m} className="px-2 py-0.5 rounded-full bg-[#1A284F] text-white font-semibold text-[11px]">{m}</span>
                ))}
              </div>
              <div>
                <p className="font-bold text-slate-600 mb-1">KPI yang Diajukan:</p>
                <ul className="space-y-1 pl-1">
                  {trackingReq.kpiSummaries.map((k) => (
                    <li key={k.no} className="text-slate-700">
                      <span className="font-bold text-[#1A284F] mr-1.5">{k.no}.</span>
                      <span className="font-semibold text-blue-700">{k.perspektif}</span> - {k.kpiTitle}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs text-amber-600 uppercase tracking-wider font-semibold mb-2">Reason for Edit Request</p>
            <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-line">{trackingReq ? trackingReq.reason : row.editRequestReason}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan Approver (Opsional / Alasan Penolakan)</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tambahkan catatan (opsional)..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-700 focus:outline-none focus:border-[#1A284F] resize-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onAccept} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-green-500 text-white hover:bg-green-600 transition-colors">
            <CheckCircle2 className="w-4 h-4" /> {actionLabel}
          </button>
          <button onClick={() => onReject(note)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors">
            <XCircle className="w-4 h-4" /> Reject Request
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── History status tag ─────────────────────────────────────────────────────────

function HistoryTag({ status, type }: { status: string; type?: string }) {
  if (status === "Pending-Approver 1" || status === "Checked") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" /> Pending-Approver 1
      </span>
    );
  }
  if (status === "Pending-Approver 2" || status === "Assessed-Approver 1") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
        <Clock className="w-3 h-3" /> Pending-Approver 2
      </span>
    );
  }
  if (status === "Pending-Validate") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
        <Clock className="w-3 h-3" /> Pending-Validate (HR ICF)
      </span>
    );
  }
  if (status === "Validated") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3" /> Validated
      </span>
    );
  }
  if (status === "Assessed-Approver 2") {
    const tagText = type === "Project" ? "Approved" : "Assessed";
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
        <Check className="w-3 h-3" /> {tagText}
      </span>
    );
  }
  if (status === "Approved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === "Approved-Hasil Tindak Lanjut") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3" /> Approved (Hasil TL)
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
  if (status === "Revision-Hasil Tindak Lanjut") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-300">
        <RotateCcw className="w-3 h-3" /> Revision (Hasil TL)
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
        <CheckCircle2 className="w-3 h-3" /> Accepted
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
  filterOptions: ApprovalFilterOptions;
  reviewerRole: "approver1" | "approver2";
  isSetting: boolean;
  initialType?: string;
}) {
  const { activeUser } = useAuthStore();
  const [activeTab, setActiveTab]                         = useState<"Pending Task" | "Approval History">("Pending Task");
  const [search, setSearch]                               = useState("");
  const [selectedCompanyUnits, setSelectedCompanyUnits]   = useState<string[]>([]);
  const [selectedYears, setSelectedYears]                 = useState<string[]>(["2026"]);
  const [selectedMonths, setSelectedMonths]               = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions]         = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments]     = useState<string[]>([]);
  const [selectedBagians, setSelectedBagians]             = useState<string[]>([]);
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
  const [editReviewReadOnly, setEditReviewReadOnly]       = useState(false);

  const toggleFilter = (name: string) => setOpenFilter(openFilter === name ? null : name);
  const toggleSelection = (list: string[], setList: (v: string[]) => void, item: string) =>
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);

  // date format: "DD/MM/YYYY" — extract year (parts[2]) and month (parts[1])
  const getDateParts = (d: string) => {
    const norm = normalizeDateDDMMYYYY(d);
    return norm !== "—" ? norm.split("/") : null;
  };

  const filtered = data.filter((row) => {
    const matchTab    = activeTab === "Pending Task"
      ? (!row.globalHistoryOnly && PENDING_STATUSES.has(row.status))
      : (row.globalHistoryOnly || HISTORY_STATUSES.has(row.status));
    const q           = search.trim().toLowerCase();
    const matchSearch = !q ||
      row.name.toLowerCase().includes(q) ||
      row.employeeId.toLowerCase().includes(q) ||
      row.division.toLowerCase().includes(q) ||
      row.department.toLowerCase().includes(q) ||
      (row.bagian ?? "").toLowerCase().includes(q);
    const matchUnit   = !selectedCompanyUnits.length  || selectedCompanyUnits.includes(row.companyUnit);
    const matchDiv    = !selectedDivisions.length     || selectedDivisions.includes(row.division);
    const matchDept   = !selectedDepartments.length   || selectedDepartments.includes(row.department);
    const matchBagian = !selectedBagians.length       || selectedBagians.includes(row.bagian ?? "");
    const matchType   = !initialType                  || row.type === initialType;
    const parts       = getDateParts(row.submittedDate);
    const inferredYear = parts ? parts[2] : row.no.match(/20\d{2}/)?.[0];
    const matchYear   = !selectedYears.length   || !inferredYear || selectedYears.includes(inferredYear);
    const matchMonth  = !selectedMonths.length  || (parts ? selectedMonths.some(m => MONTH_NUM[m] === parts[1]) : false);
    return matchTab && matchSearch && matchUnit && matchDiv && matchDept && matchBagian && matchType && matchYear && matchMonth;
  });

  const hasActiveFilters = selectedCompanyUnits.length > 0 || !(selectedYears.length === 1 && selectedYears[0] === "2026") || selectedMonths.length > 0 || selectedDivisions.length > 0 || selectedDepartments.length > 0 || selectedBagians.length > 0 || !!search;

  const COL_GETTER: Record<string, (r: ApprovalRow) => string> = {
    no:           (r) => r.no,
    employeeId:   (r) => r.employeeId,
    name:         (r) => r.name,
    division:     (r) => r.division,
    department:   (r) => r.department,
    bagian:       (r) => r.bagian ?? "",
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

  useEffect(() => setCurrentPage(1), [activeTab, search, selectedCompanyUnits, selectedYears, selectedMonths, selectedDivisions, selectedDepartments, selectedBagians, sortCol, sortDir]);

  const typeScopedData = initialType ? data.filter((r) => r.type === initialType) : data;
  const pendingCount = typeScopedData.filter((r) => !r.globalHistoryOnly && PENDING_STATUSES.has(r.status)).length;
  const historyCount = typeScopedData.filter((r) => r.globalHistoryOnly || HISTORY_STATUSES.has(r.status)).length;

  const handleAcceptEdit = (row: ApprovalRow) => {
    if (row.no.startsWith("KPITREDIT::")) {
      const reqId = row.no.slice("KPITREDIT::".length);
      approveKpiTrackingEditRequest(reqId, activeUser);
      setEditReviewRow(null);
      setEditReviewReadOnly(false);
      setActiveTab("Approval History");
      return;
    }
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "EditRequest-AcceptedA2" } : r));
    setEditReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleRevisionEdit = (row: ApprovalRow, note: string) => {
    if (row.no.startsWith("KPITREDIT::")) {
      const reqId = row.no.slice("KPITREDIT::".length);
      reviseKpiTrackingEditRequest(reqId, activeUser, note);
      setEditReviewRow(null);
      setEditReviewReadOnly(false);
      setActiveTab("Approval History");
    }
  };

  const handleRejectEdit = (row: ApprovalRow, note?: string) => {
    if (row.no.startsWith("KPITREDIT::")) {
      const reqId = row.no.slice("KPITREDIT::".length);
      rejectKpiTrackingEditRequest(reqId, activeUser, note);
      setEditReviewRow(null);
      setEditReviewReadOnly(false);
      setActiveTab("Approval History");
      return;
    }
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "EditRequest-Rejected" } : r));
    setEditReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleApprove = (row: ApprovalRow, note?: string) => {
    const todayStr = formatTodayDDMMYYYY();
    const effectiveRole = row.reviewerRoleForRow ?? reviewerRole;
    const stage = row.workflowStageForRow ?? effectiveRole;
    const isAssessedType = row.type === "KPI" || row.type === "SMART Goals" || row.type === "RCA";
    let decisionStatus: string;
    let uiHistoryStatus: string;
    if (isAssessedType && stage === "checker") {
      decisionStatus = "Checked";
      uiHistoryStatus = "Pending-Approver 1";
    } else if (isAssessedType && stage === "approver1") {
      decisionStatus = "Assessed-Approver 1";
      uiHistoryStatus = "Pending-Approver 2";
    } else if (isAssessedType && stage === "approver2") {
      decisionStatus = "Assessed-Approver 2";
      uiHistoryStatus = "Pending-Validate";
    } else if (isAssessedType && stage === "validator") {
      decisionStatus = "Validated";
      uiHistoryStatus = "Validated";
    } else if (stage === "approver1") {
      decisionStatus = isAssessedType ? "Assessed-Approver 1" : "Approved";
      uiHistoryStatus = "Pending-Approver 2";
    } else {
      decisionStatus = isAssessedType
        ? effectiveRole === "approver2"
          ? "Validated"
          : "Assessed-Approver 1"
        : "Approved";
      uiHistoryStatus = decisionStatus;
    }
    saveOverride(row.no, decisionStatus, todayStr, note);
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: uiHistoryStatus, approvalDate: todayStr } : r));
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleRevision = (row: ApprovalRow, note: string) => {
    saveOverride(row.no, "Revision", "-", note);
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: "Revision", approvalDate: "-" } : r));
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const handleAssessed = (row: ApprovalRow, note?: string) => {
    const todayStr = formatTodayDDMMYYYY();
    const effectiveRole = row.reviewerRoleForRow ?? reviewerRole;
    const newStatus = effectiveRole === "approver2" ? "Assessed-Approver 2" : "Assessed-Approver 1";
    const uiStatus = effectiveRole === "approver1" ? "Pending-Approver 2" : newStatus;
    saveOverride(row.no, newStatus, todayStr, note);
    onDataChange(data.map((r) => r.no === row.no ? { ...r, status: uiStatus, approvalDate: todayStr } : r));
    setReviewRow(null);
    setActiveTab("Approval History");
  };

  const isHistory = activeTab === "Approval History";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      {/* Tabs */}
      <div className="inline-flex flex-wrap items-center gap-2.5 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 mb-7">
        <button
          type="button"
          onClick={() => setActiveTab("Pending Task")}
          className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "Pending Task"
              ? "bg-gradient-to-r from-[#1A284F] to-[#28407A] text-white shadow-md ring-1 ring-[#1A284F]/20"
              : "bg-white/80 text-slate-600 hover:bg-white hover:text-[#1A284F] border border-slate-200/80"
          }`}
        >
          <ListTodo className="w-4 h-4 shrink-0" />
          <span>Pending Task</span>
          <span
            className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${
              activeTab === "Pending Task"
                ? pendingCount > 0
                  ? "bg-amber-400 text-[#1A284F]"
                  : "bg-white/20 text-white"
                : pendingCount > 0
                  ? "bg-amber-100 text-amber-800 border border-amber-200"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {pendingCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("Approval History")}
          className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isHistory
              ? "bg-gradient-to-r from-teal-700 to-emerald-700 text-white shadow-md ring-1 ring-emerald-800/20"
              : "bg-white/80 text-slate-600 hover:bg-teal-50/70 hover:text-teal-800 border border-slate-200/80"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Approval History</span>
          <span
            className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${
              isHistory ? "bg-white/20 text-white" : "bg-teal-50 text-teal-700 border border-teal-200"
            }`}
          >
            {historyCount}
          </span>
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5 mb-6">
        <FilterDropdown tone="blue"    label="Company Unit" options={filterOptions.companyUnit} selected={selectedCompanyUnits} onToggle={(i) => toggleSelection(selectedCompanyUnits, setSelectedCompanyUnits, i)} isOpen={openFilter === "companyUnit"} onToggleOpen={() => toggleFilter("companyUnit")} />
        <FilterDropdown tone="indigo"  label="Year"         options={filterOptions.year}        selected={selectedYears}        onToggle={(i) => toggleSelection(selectedYears, setSelectedYears, i)}               isOpen={openFilter === "year"}        onToggleOpen={() => toggleFilter("year")} />
        <FilterDropdown tone="teal"    label="Month"        options={filterOptions.month}       selected={selectedMonths}       onToggle={(i) => toggleSelection(selectedMonths, setSelectedMonths, i)}             isOpen={openFilter === "month"}       onToggleOpen={() => toggleFilter("month")} />
        <FilterDropdown tone="emerald" label="Division"     options={filterOptions.division}    selected={selectedDivisions}    onToggle={(i) => toggleSelection(selectedDivisions, setSelectedDivisions, i)}       isOpen={openFilter === "division"}    onToggleOpen={() => toggleFilter("division")} />
        <FilterDropdown tone="amber"   label="Department"   options={filterOptions.department}  selected={selectedDepartments}  onToggle={(i) => toggleSelection(selectedDepartments, setSelectedDepartments, i)}   isOpen={openFilter === "department"}  onToggleOpen={() => toggleFilter("department")} />
        <FilterDropdown tone="cyan"    label="Bagian"       options={filterOptions.bagian}      selected={selectedBagians}      onToggle={(i) => toggleSelection(selectedBagians, setSelectedBagians, i)}           isOpen={openFilter === "bagian"}      onToggleOpen={() => toggleFilter("bagian")} />
      </div>
      {hasActiveFilters && (
        <div className="flex justify-end -mt-3 mb-3">
          <button onClick={() => { setSelectedCompanyUnits([]); setSelectedYears(["2026"]); setSelectedMonths([]); setSelectedDivisions([]); setSelectedDepartments([]); setSelectedBagians([]); setSearch(""); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari Nama, ID Karyawan, Divisi, Departemen, atau Bagian..." className="pl-12 py-6 bg-[#FAFAFA] border-gray-200 rounded-full w-full text-base" />
        </div>
        <Button className="bg-[#1A284F] hover:bg-[#131d3b] text-white px-10 py-6 rounded-full text-base font-medium">Search</Button>
      </div>

      {isSetting && <TargetEditRequestsSection />}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1A284F] text-white text-xs font-semibold uppercase tracking-wider">
              {([
                { col: null,            label: "Action",          cls: "whitespace-nowrap" },
                { col: "no",            label: "No",              cls: "w-14 whitespace-nowrap text-center" },
                { col: "employeeId",    label: "ID Karyawan",     cls: "whitespace-nowrap" },
                { col: "name",          label: "Nama",            cls: "whitespace-nowrap" },
                { col: "division",      label: "Divisi",          cls: "whitespace-nowrap" },
                { col: "department",    label: "Departemen",      cls: "whitespace-nowrap" },
                { col: "bagian",        label: "Bagian",          cls: "whitespace-nowrap" },
                { col: "type",          label: "Tipe Modul",      cls: "whitespace-nowrap" },
                { col: "submittedDate", label: "Tgl Pengajuan",   cls: "whitespace-nowrap" },
                { col: "approvalDate",  label: "Tgl Persetujuan", cls: "whitespace-nowrap" },
              ] as { col: string | null; label: string; cls: string }[]).map(({ col, label, cls }) =>
                col ? (
                  <th key={col} className={`py-4 px-4 ${cls} cursor-pointer select-none group`} onClick={() => handleSort(col)}>
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <span className="text-white/60 group-hover:text-white">
                        {sortCol === col ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-60" />}
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
              <tr><td colSpan={10} className="py-16 text-center text-gray-400 text-sm">Tidak ada data pengajuan pada tab ini.</td></tr>
            ) : paginated.map((row, idx) => (
              <tr key={row.no} className={`border-b border-gray-100 transition-colors hover:bg-sky-100/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {activeTab === "Pending Task" && (row.status === "Pending" || row.status === "Pending-Hasil Tindak Lanjut") && (
                      <button
                        onClick={() => { setReviewRow(row); setReviewFromHistory(false); }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1A284F] hover:bg-[#25386e] border border-[#1A284F] rounded-xl shadow-sm hover:shadow transition-all whitespace-nowrap"
                        title="Review"
                      >
                        <FileCheck className="w-4 h-4 shrink-0" />
                        <span>Review</span>
                      </button>
                    )}
                    {activeTab === "Pending Task" && row.status === "Edit Request" && (
                      <button
                        onClick={() => { setEditReviewRow(row); setEditReviewReadOnly(false); }}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-amber-600 border border-amber-600 text-white hover:bg-amber-700 shadow-sm transition-all whitespace-nowrap"
                        title="Review Edit Request"
                      >
                        <FileEdit className="w-4 h-4 shrink-0" /> Review Request
                      </button>
                    )}
                    {isHistory && (
                      <>
                        <button
                          onClick={() => {
                            if (row.no.startsWith("KPITREDIT::")) {
                              setEditReviewRow(row);
                              setEditReviewReadOnly(true);
                            } else {
                              setReviewRow(row);
                              setReviewFromHistory(true);
                            }
                          }}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <HistoryTag status={row.status} type={row.type} />
                      </>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4 text-center text-gray-500 text-sm font-medium">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="py-4 px-4 text-sm font-mono font-semibold text-[#1A284F] whitespace-nowrap">{row.employeeId}</td>
                <td className="py-4 px-4 text-sm font-medium text-gray-900 whitespace-nowrap">{row.name}</td>
                <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.division || "—"}</td>
                <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.department || "—"}</td>
                <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.bagian || "—"}</td>
                <td className="py-4 px-4 text-sm whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${MODULE_BADGE_TONE[row.type] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
                    {row.type}
                  </span>
                </td>
                <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{normalizeDateDDMMYYYY(row.submittedDate)}</td>
                <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{isHistory ? normalizeDateDDMMYYYY(row.approvalDate) : "—"}</td>
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

      {reviewRow && !isSetting && reviewRow.type === "Inter-Department Feedback" && (
        <FeedbackApprovalDrawer
          key={reviewRow.no}
          row={reviewRow}
          reviewerRole={reviewRow.reviewerRoleForRow ?? reviewerRole}
          onClose={() => setReviewRow(null)}
          onAssessed={() => window.dispatchEvent(new Event("feedback-updated"))}
          readOnly={reviewFromHistory}
        />
      )}
      {reviewRow && !isSetting && reviewRow.type !== "Inter-Department Feedback" && (
        <ReviewDrawer row={reviewRow} reviewerRole={reviewRow.reviewerRoleForRow ?? reviewerRole} onClose={() => setReviewRow(null)} onApprove={(note) => handleApprove(reviewRow, note)} onRevision={(note) => handleRevision(reviewRow, note)} onAssessed={(note) => handleAssessed(reviewRow, note)} readOnly={reviewFromHistory} />
      )}
      {reviewRow && isSetting && (
        <SettingApprovalDrawer row={reviewRow} onClose={() => setReviewRow(null)} onApprove={(note) => handleApprove(reviewRow, note)} onRevision={(note) => handleRevision(reviewRow, note)} readOnly={reviewFromHistory} />
      )}
      {editReviewRow && (
        editReviewRow.no.startsWith("KPITREDIT::") ? (
          <KpiTrackingEditReviewDrawer
            row={editReviewRow}
            readOnly={editReviewReadOnly}
            onAccept={() => handleAcceptEdit(editReviewRow)}
            onRevision={(note) => handleRevisionEdit(editReviewRow, note)}
            onReject={(reason) => handleRejectEdit(editReviewRow, reason)}
            onClose={() => { setEditReviewRow(null); setEditReviewReadOnly(false); }}
          />
        ) : (
          <EditRequestReviewModal
            row={editReviewRow}
            onAccept={() => handleAcceptEdit(editReviewRow)}
            onReject={(note) => handleRejectEdit(editReviewRow, note)}
            onClose={() => setEditReviewRow(null)}
          />
        )
      )}
    </div>
  );
}

type FilterTone = "blue" | "indigo" | "teal" | "emerald" | "amber" | "cyan";

const FILTER_TONE_CLASSES: Record<FilterTone, { btn: string; icon: string; badge: string }> = {
  blue: {
    btn: "bg-blue-50/60 border-blue-200/90 text-blue-900 hover:bg-blue-100/70 hover:border-blue-300",
    icon: "text-blue-600",
    badge: "bg-blue-600 text-white",
  },
  indigo: {
    btn: "bg-indigo-50/60 border-indigo-200/90 text-indigo-900 hover:bg-indigo-100/70 hover:border-indigo-300",
    icon: "text-indigo-600",
    badge: "bg-indigo-600 text-white",
  },
  teal: {
    btn: "bg-teal-50/60 border-teal-200/90 text-teal-900 hover:bg-teal-100/70 hover:border-teal-300",
    icon: "text-teal-600",
    badge: "bg-teal-600 text-white",
  },
  emerald: {
    btn: "bg-emerald-50/60 border-emerald-200/90 text-emerald-900 hover:bg-emerald-100/70 hover:border-emerald-300",
    icon: "text-emerald-600",
    badge: "bg-emerald-600 text-white",
  },
  amber: {
    btn: "bg-amber-50/70 border-amber-200/90 text-amber-900 hover:bg-amber-100/70 hover:border-amber-300",
    icon: "text-amber-600",
    badge: "bg-amber-600 text-white",
  },
  cyan: {
    btn: "bg-cyan-50/60 border-cyan-200/90 text-cyan-900 hover:bg-cyan-100/70 hover:border-cyan-300",
    icon: "text-cyan-600",
    badge: "bg-cyan-600 text-white",
  },
};

function FilterDropdown({ tone, label, options, selected, onToggle, isOpen, onToggleOpen }: {
  tone: FilterTone;
  label: string; options: string[]; selected: string[];
  onToggle: (item: string) => void; isOpen: boolean; onToggleOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node) && isOpen) onToggleOpen(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, onToggleOpen]);

  const palette = FILTER_TONE_CLASSES[tone];

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={onToggleOpen} className={`w-full flex items-center justify-between border rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${palette.btn}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Filter className={`w-3.5 h-3.5 shrink-0 ${palette.icon}`} />
          <span className="truncate">{label}</span>
          {selected.length > 0 && (
            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full shrink-0 ${palette.badge}`}>{selected.length}</span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 shrink-0 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">Belum ada opsi</p>
          ) : (
            options.map((option) => (
              <label key={option} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
                <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} className="w-4 h-4 text-[#1A284F] border-gray-300 rounded focus:ring-[#1A284F] focus:ring-2" />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
