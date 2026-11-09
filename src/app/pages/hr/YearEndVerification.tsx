import React, { useState, useMemo, useEffect } from "react";
import { CheckCircle2, XCircle, Clock, Users, AlertTriangle, Bell, BellRing, UserX } from "lucide-react";

import { useNavigate } from "react-router";
import { loadYearEndState, saveYearEndState, canProceedToInterview } from "../shared/yearEndWorkflowStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { loadFeedbackSubmissions } from "../shared/interDepartmentFeedbackStore";

type ModuleStatus = "complete" | "incomplete" | "pending" | "na";
type OverallStatus = "Complete" | "Incomplete" | "Pending";

interface Employee {
  id: string;
  name: string;
  unit: string;
  division: string;
  department: string;
  position: string;
  kpi: ModuleStatus;
  smartGoals: ModuleStatus;
  appraisalForm: ModuleStatus;
  managerialSkill: ModuleStatus;
  projectOJS: ModuleStatus;
  interDept: ModuleStatus;
  overall: OverallStatus;
}

const employees: Employee[] = [
  {
    id: "E001", name: "Drs. Hendra Wijaya",
    unit: "PT RSUP (Industry)", division: "Divisi Operasional", department: "Dept. Produksi",
    position: "Ka. Divisi Operasional",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "complete", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
  {
    id: "E002", name: "Siti Rahayu",
    unit: "PT RSUP (Industry)", division: "Divisi Sumber Daya Manusia", department: "Dept. Pengembangan SDM",
    position: "Staff Pengembangan SDM",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
  {
    id: "E003", name: "Edward David",
    unit: "PT RSUP (Industry)", division: "Divisi Keuangan & Akuntansi", department: "Dept. Akuntansi",
    position: "Staf Keuangan",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
  {
    id: "E004", name: "Diana Kusuma",
    unit: "PT GHS", division: "Divisi Pemasaran", department: "Dept. Sales & Marketing",
    position: "Staff Pemasaran",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "incomplete", interDept: "complete", overall: "Incomplete",
  },
  {
    id: "E005", name: "Rizal Fauzi",
    unit: "PT RSUP (Industry)", division: "Divisi Operasional", department: "Dept. Produksi",
    position: "Ka. Bagian Produksi",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "complete", projectOJS: "complete", interDept: "incomplete", overall: "Incomplete",
  },
  {
    id: "E006", name: "Mega Purnama",
    unit: "PT RSUP (Perkebunan)", division: "Divisi Keuangan & Akuntansi", department: "Dept. Keuangan",
    position: "Staff Keuangan",
    kpi: "complete", smartGoals: "incomplete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "complete", interDept: "complete", overall: "Incomplete",
  },
  {
    id: "E007", name: "Andi Pratama",
    unit: "PT RSUP (Industry)", division: "Divisi IT & Digital", department: "Dept. Infrastruktur IT",
    position: "Wa. Ka. Bagian IT",
    kpi: "complete", smartGoals: "complete", appraisalForm: "pending",
    managerialSkill: "complete", projectOJS: "complete", interDept: "complete", overall: "Pending",
  },
  {
    id: "E008", name: "Kartini Dewi",
    unit: "PT RSUP (Industry)", division: "Divisi Sumber Daya Manusia", department: "Dept. Rekrutmen & Seleksi",
    position: "Staff Rekrutmen",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
  {
    id: "E009", name: "Indah Lestari",
    unit: "PT RSUP (Perkebunan)", division: "Divisi Agronomi", department: "Dept. Agronomi",
    position: "Staff Agronomi",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "na", projectOJS: "incomplete", interDept: "complete", overall: "Incomplete",
  },
  {
    id: "E010", name: "Budi Santoso",
    unit: "PT RSUP (Industry)", division: "Divisi Operasional", department: "Dept. Produksi",
    position: "Ka. Bagian Produksi",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "complete", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
  {
    id: "E011", name: "Wahyu Utomo",
    unit: "PT GHS", division: "Divisi Logistik", department: "Dept. Distribusi",
    position: "Wa. Ka. Divisi Logistik",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "complete", projectOJS: "complete", interDept: "pending", overall: "Pending",
  },
  {
    id: "E012", name: "Ratna Dewi",
    unit: "PT RSUP (Industry)", division: "Divisi Logistik", department: "Dept. Gudang & Distribusi",
    position: "Ka. Bagian Logistik",
    kpi: "complete", smartGoals: "complete", appraisalForm: "complete",
    managerialSkill: "complete", projectOJS: "complete", interDept: "complete", overall: "Complete",
  },
];


// ─── Filter option lists ───────────────────────────────────────────────────────

const unitOptions     = ["All", ...Array.from(new Set(employees.map((e) => e.unit)))];
const divisionOptions = ["All", ...Array.from(new Set(employees.map((e) => e.division)))];
const deptOptions     = ["All", ...Array.from(new Set(employees.map((e) => e.department)))];
const positionOptions = ["All", ...Array.from(new Set(employees.map((e) => e.position)))];
const statusOptions   = ["All", "Complete", "Incomplete", "Pending", "Inactivated", "Ignored"] as const;

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function ModuleIcon({ status }: { status: ModuleStatus }) {
  if (status === "complete")   return <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />;
  if (status === "incomplete") return <XCircle className="w-4 h-4 text-red-500 mx-auto" />;
  if (status === "pending")    return <Clock className="w-4 h-4 text-amber-500 mx-auto" />;
  return <span className="text-gray-300 text-sm block text-center">—</span>;
}

function StatusBadge({ status }: { status: OverallStatus }) {
  const cls: Record<OverallStatus, string> = {
    Complete:   "bg-green-50 text-green-700 border-green-200",
    Incomplete: "bg-red-50 text-red-700 border-red-200",
    Pending:    "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border whitespace-nowrap ${cls[status]}`}>
      {status}
    </span>
  );
}

function FilterSelect({
  label, value, options, onChange,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] bg-white"
      >
        {options.map((o) => <option key={o} value={o}>{o === "All" ? `All ${label}s` : o}</option>)}
      </select>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// ─── Confirmation Modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmCls: string;
  icon: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ open, title, message, confirmLabel, confirmCls, icon, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center">{icon}</div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-colors ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function YearEndVerification() {
  const [search,         setSearch]         = useState("");
  const [unitFilter,     setUnitFilter]     = useState("All");
  const [divFilter,      setDivFilter]      = useState("All");
  const [deptFilter,     setDeptFilter]     = useState("All");
  const [posFilter,      setPosFilter]      = useState("All");
  const [statusFilter,   setStatusFilter]   = useState("All");
  const [remindedSet,    setRemindedSet]    = useState<Set<string>>(() => new Set(loadYearEndState().reminded));
  const [inactiveSet,    setInactiveSet]    = useState<Set<string>>(new Set());
  const [ignoredSet,     setIgnoredSet]     = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState(loadWorkflowRecords);
  const [feedback, setFeedback] = useState(loadFeedbackSubmissions);
  useEffect(() => {
    const refresh = () => { setWorkflow(loadWorkflowRecords()); setFeedback(loadFeedbackSubmissions()); };
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("feedback-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const currentEmployees = useMemo(() => employees.map((employee) => {
    const updated = { ...employee };
    const modules = { "SMART Goals": "smartGoals", "Appraisal Form": "appraisalForm", "Managerial Skill": "managerialSkill" } as const;
    for (const [module, field] of Object.entries(modules)) {
      const record = workflow.find((item) => item.employeeId === normalizeEmployeeId(employee.id) && item.module === module && item.phase === "measurement" && item.year === "2026");
      if (record) {
        const decision = record.decisions.approver2?.status;
        updated[field] = decision === "Approved" || decision?.startsWith("Assessed") ? "complete" : "pending";
      }
    }
    const received = feedback.find((entry) => normalizeEmployeeId(entry.row.employeeId) === normalizeEmployeeId(employee.id));
    if (received) updated.interDept = received.followUps.approver1?.length && received.followUps.approver2?.length ? "complete" : "pending";
    const statuses = [updated.kpi, updated.smartGoals, updated.appraisalForm, updated.managerialSkill, updated.projectOJS, updated.interDept];
    updated.overall = statuses.includes("incomplete") ? "Incomplete" : statuses.includes("pending") ? "Pending" : "Complete";
    return updated;
  }), [workflow, feedback]);
  useEffect(() => {
    const completion = Object.fromEntries(currentEmployees.map((employee) => [normalizeEmployeeId(employee.id), { kpi: employee.kpi === "complete", smartGoals: employee.smartGoals === "complete", appraisalForm: employee.appraisalForm === "complete", managerialSkill: employee.managerialSkill === "complete", projectOutsideJobScope: employee.projectOJS === "complete" }]));
    saveYearEndState({ ...loadYearEndState(), reminded: [...remindedSet], inactive: [...inactiveSet], ignored: [...ignoredSet], completion });
  }, [remindedSet, inactiveSet, ignoredSet, currentEmployees]);
  const TOTAL_EMPLOYEES = currentEmployees.length;
  const FULLY_COMPLETE = currentEmployees.filter((employee) => employee.overall === "Complete" && !inactiveSet.has(employee.id)).length;
  const INCOMPLETE = currentEmployees.filter((employee) => employee.overall === "Incomplete" && !inactiveSet.has(employee.id) && !ignoredSet.has(employee.id)).length;
  const PENDING_REVIEW = currentEmployees.filter((employee) => employee.overall === "Pending" && !inactiveSet.has(employee.id) && !ignoredSet.has(employee.id)).length;
  const handled = currentEmployees.filter((employee) => employee.overall === "Complete" || inactiveSet.has(employee.id) || ignoredSet.has(employee.id)).length;
  const READINESS_PCT = Math.round(handled / TOTAL_EMPLOYEES * 100);

  type ModalState =
    | { type: "reminder_one"; id: string; name: string }
    | { type: "reminder_all"; count: number }
    | { type: "inactive"; id: string; name: string }
    | { type: "reactivate"; id: string; name: string }
    | { type: "ignore"; id: string; name: string }
    | { type: "unignore"; id: string; name: string }
    | { type: "proceed" }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  const filtered = useMemo(() => currentEmployees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.position.toLowerCase().includes(q);
    const matchUnit   = unitFilter   === "All" || e.unit       === unitFilter;
    const matchDiv    = divFilter    === "All" || e.division   === divFilter;
    const matchDept   = deptFilter   === "All" || e.department === deptFilter;
    const matchPos    = posFilter    === "All" || e.position   === posFilter;
    const matchStatus = statusFilter === "All" || (inactiveSet.has(e.id) ? "Inactivated" : ignoredSet.has(e.id) ? "Ignored" : e.overall) === statusFilter;
    return matchSearch && matchUnit && matchDiv && matchDept && matchPos && matchStatus;
  }), [search, unitFilter, divFilter, deptFilter, posFilter, statusFilter, currentEmployees, inactiveSet, ignoredSet]);

  const canProceed = canProceedToInterview(currentEmployees, { ...loadYearEndState(), inactive: [...inactiveSet], ignored: [...ignoredSet] });

  function confirmSendReminder(id: string, name: string) { setModal({ type: "reminder_one", id, name }); }
  function doSendReminder(id: string) { setRemindedSet((prev) => new Set([...prev, id])); }

  function confirmSendAll() {
    const count = filtered.filter((e) => !inactiveSet.has(e.id) && !ignoredSet.has(e.id) && (e.overall === "Pending" || e.overall === "Incomplete") && !remindedSet.has(e.id)).length;
    setModal({ type: "reminder_all", count });
  }
  function doSendAllReminders() {
    const ids = filtered.filter((e) => !inactiveSet.has(e.id) && !ignoredSet.has(e.id) && (e.overall === "Pending" || e.overall === "Incomplete")).map((e) => e.id);
    setRemindedSet((prev) => new Set([...prev, ...ids]));
  }

  function confirmInactive(id: string, name: string) { setModal({ type: "inactive", id, name }); }
  function doInactive(id: string) { setIgnoredSet((prev) => new Set([...prev].filter((value) => value !== id))); setInactiveSet((prev) => new Set([...prev, id])); }
  function confirmReactivate(id: string, name: string) { setModal({ type: "reactivate", id, name }); }
  function doReactivate(id: string) { setInactiveSet((prev) => { const s = new Set(prev); s.delete(id); return s; }); }

  function confirmIgnore(id: string, name: string) { setModal({ type: "ignore", id, name }); }
  function doIgnore(id: string) { setInactiveSet((prev) => new Set([...prev].filter((value) => value !== id))); setIgnoredSet((prev) => new Set([...prev, id])); }
  function confirmUnignore(id: string, name: string) { setModal({ type: "unignore", id, name }); }
  function doUnignore(id: string) { setIgnoredSet((prev) => { const s = new Set(prev); s.delete(id); return s; }); }

  const pendingCount = filtered.filter((e) => !inactiveSet.has(e.id) && !ignoredSet.has(e.id) && (e.overall === "Pending" || e.overall === "Incomplete") && !remindedSet.has(e.id)).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F]">Verification Checklist</h1>
        <p className="text-gray-500 mt-1 text-sm">Performance Year 2026 · Pre-Management Interview Gate</p>
      </div>

      {/* Overall Readiness Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-500 font-medium">Overall Readiness</p>
            <p className="text-2xl font-bold text-[#1A284F] mt-0.5">{READINESS_PCT}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-700 font-semibold">{FULLY_COMPLETE} of {TOTAL_EMPLOYEES} employees fully complete</p>
            <p className="text-xs text-gray-400 mt-0.5">Proceed setelah seluruh Pending/Incomplete ditangani</p>
          </div>
        </div>
        <div className="bg-gray-100 rounded-full h-2">
          <div className="bg-[#1A284F] rounded-full h-2 transition-all" style={{ width: `${READINESS_PCT}%` }} />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { icon: Users,         label: "Total Employees",  value: TOTAL_EMPLOYEES, cls: "border-blue-200",  val: "text-[#1A284F]" },
          { icon: CheckCircle2,  label: "Fully Complete",   value: FULLY_COMPLETE,  cls: "border-green-200", val: "text-green-600" },
          { icon: XCircle,       label: "Incomplete",       value: INCOMPLETE,      cls: "border-red-200",   val: "text-red-600"   },
          { icon: Clock,         label: "Pending Review",   value: PENDING_REVIEW,  cls: "border-amber-200", val: "text-amber-600" },
          { icon: UserX,         label: "Inactivated",      value: inactiveSet.size, cls: "border-gray-200", val: "text-gray-600" },
          { icon: AlertTriangle, label: "Ignored",          value: ignoredSet.size, cls: "border-orange-200", val: "text-orange-600" },
        ].map(({ icon: Icon, label, value, cls, val }) => (
          <div key={label} className={`bg-white rounded-2xl border shadow-sm p-6 ${cls}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            </div>
            <p className={`text-3xl font-bold ${val}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Search</label>
            <input
              type="text"
              placeholder="Name, ID, or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
            />
          </div>
          <FilterSelect label="Company Unit" value={unitFilter}   options={unitOptions}     onChange={setUnitFilter} />
          <FilterSelect label="Division"     value={divFilter}    options={divisionOptions} onChange={setDivFilter}  />
          <FilterSelect label="Department"   value={deptFilter}   options={deptOptions}     onChange={setDeptFilter} />
          <FilterSelect label="Position"     value={posFilter}    options={positionOptions} onChange={setPosFilter}  />
          <FilterSelect label="Status"       value={statusFilter} options={[...statusOptions]} onChange={setStatusFilter} />
          {/* Reset */}
          {(unitFilter !== "All" || divFilter !== "All" || deptFilter !== "All" || posFilter !== "All" || statusFilter !== "All" || search) && (
            <button
              onClick={() => { setSearch(""); setUnitFilter("All"); setDivFilter("All"); setDeptFilter("All"); setPosFilter("All"); setStatusFilter("All"); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-2"
            >
              Reset filters
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">{filtered.length} employee{filtered.length !== 1 ? "s" : ""} shown</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-center px-4 py-3 whitespace-nowrap w-10">#</th>
                <th className="text-center px-4 py-3 whitespace-nowrap w-56">Action</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">ID Employee</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Employee</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Company Unit</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Division</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Department</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Position</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">KPI</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">SMART Goals</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">Appraisal Form</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">Managerial Skill</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">Project OJS</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">Inter-Dept</th>
                <th className="text-center px-4 py-3 whitespace-nowrap">Overall Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No employees match the current filters.
                  </td>
                </tr>
              )}
              {filtered.map((emp, idx) => {
                const isInactive = inactiveSet.has(emp.id);
                const isIgnored  = ignoredSet.has(emp.id);
                const needsReminder = !isInactive && !isIgnored && (emp.overall === "Pending" || emp.overall === "Incomplete");
                const reminded = remindedSet.has(emp.id);
                const rowCls = isInactive
                  ? "opacity-40 bg-gray-50"
                  : isIgnored
                  ? "bg-orange-50/50"
                  : "hover:bg-gray-50/60";
                return (
                  <tr key={emp.id} className={`border-b border-gray-50 transition-colors ${rowCls}`}>
                    {/* No */}
                    <td className="px-4 py-3 text-center text-xs text-gray-400 font-semibold">{idx + 1}</td>

                    {/* Action */}
                    <td className="px-4 py-3 text-center">
                      {isInactive ? (
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                            <UserX className="w-3 h-3" /> Inactivated
                          </span>
                          <button
                            onClick={() => confirmReactivate(emp.id, emp.name)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-400 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                          >
                            Reactivate
                          </button>
                        </div>
                      ) : isIgnored ? (
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                            Ignored
                          </span>
                          <button
                            onClick={() => confirmUnignore(emp.id, emp.name)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 hover:border-blue-400 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                          >
                            Revert
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {needsReminder && (
                            reminded ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                                <BellRing className="w-3 h-3 text-green-600" /> Sent
                              </span>
                            ) : (
                              <button
                                onClick={() => confirmSendReminder(emp.id, emp.name)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-400 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                              >
                                <Bell className="w-3 h-3" /> Reminder
                              </button>
                            )
                          )}
                          {(emp.overall === "Pending" || emp.overall === "Incomplete") && (
                            <button
                              onClick={() => confirmIgnore(emp.id, emp.name)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:border-orange-400 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                            >
                              Ignore
                            </button>
                          )}
                          <button
                            onClick={() => confirmInactive(emp.id, emp.name)}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 hover:border-red-400 rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
                          >
                            <UserX className="w-3 h-3" /> Inactive
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[10px] font-mono font-semibold text-[#1A284F] bg-[#1A284F]/8 px-1.5 py-0.5 rounded inline-block">{emp.id}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{emp.name}</td>

                    {/* Company Unit */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{emp.unit}</td>

                    {/* Division */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{emp.division}</td>

                    {/* Department */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{emp.department}</td>

                    {/* Position */}
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{emp.position}</td>

                    {/* Modules */}
                    <td className="px-3 py-3"><ModuleIcon status={emp.kpi} /></td>
                    <td className="px-3 py-3"><ModuleIcon status={emp.smartGoals} /></td>
                    <td className="px-3 py-3"><ModuleIcon status={emp.appraisalForm} /></td>
                    <td className="px-3 py-3"><ModuleIcon status={emp.managerialSkill} /></td>
                    <td className="px-3 py-3"><ModuleIcon status={emp.projectOJS} /></td>
                    <td className="px-3 py-3"><ModuleIcon status={emp.interDept} /></td>

                    {/* Overall Status */}
                    <td className="px-4 py-3 text-center"><StatusBadge status={emp.overall} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Action Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-800">{FULLY_COMPLETE} of {TOTAL_EMPLOYEES} employees</span> are fully complete.{" "}
            <span className="font-semibold text-red-600">{INCOMPLETE + PENDING_REVIEW} employees</span> have pending or incomplete items.
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          {pendingCount > 0 && (
            <button
              onClick={confirmSendAll}
              className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              <Bell className="w-4 h-4" /> Send Reminder to All ({pendingCount})
            </button>
          )}
          <button
            disabled={!canProceed}
            onClick={() => canProceed && setModal({ type: "proceed" })}
            className={`bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors ${!canProceed ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Proceed to Management Interview Phase
          </button>
        </div>
      </div>

      <ConfirmModal
        open={modal?.type === "reminder_one"}
        title="Kirim Reminder?"
        message={<>Reminder akan dikirim ke <span className="font-semibold text-gray-800">{modal?.type === "reminder_one" ? modal.name : ""}</span> untuk melengkapi data penilaian.</>}
        confirmLabel="Kirim"
        confirmCls="bg-amber-500 hover:bg-amber-600"
        icon={<Bell className="w-6 h-6 text-amber-500" />}
        onConfirm={() => { if (modal?.type === "reminder_one") doSendReminder(modal.id); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "reminder_all"}
        title="Kirim Reminder ke Semua?"
        message={<>Reminder akan dikirim ke <span className="font-semibold text-gray-800">{modal?.type === "reminder_all" ? modal.count : 0} karyawan</span> yang memiliki status Pending atau Incomplete.</>}
        confirmLabel="Kirim Semua"
        confirmCls="bg-amber-500 hover:bg-amber-600"
        icon={<Users className="w-6 h-6 text-amber-500" />}
        onConfirm={doSendAllReminders}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "inactive"}
        title="Nonaktifkan Karyawan?"
        message={<><span className="font-semibold text-gray-800">{modal?.type === "inactive" ? modal.name : ""}</span> akan dikeluarkan dari seluruh proses penilaian kinerja tahun ini.</>}
        confirmLabel="Nonaktifkan"
        confirmCls="bg-red-600 hover:bg-red-700"
        icon={<UserX className="w-6 h-6 text-red-500" />}
        onConfirm={() => { if (modal?.type === "inactive") doInactive(modal.id); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "reactivate"}
        title="Aktifkan Kembali?"
        message={<><span className="font-semibold text-gray-800">{modal?.type === "reactivate" ? modal.name : ""}</span> akan diikutsertakan kembali dalam proses penilaian kinerja.</>}
        confirmLabel="Aktifkan"
        confirmCls="bg-blue-600 hover:bg-blue-700"
        icon={<CheckCircle2 className="w-6 h-6 text-blue-500" />}
        onConfirm={() => { if (modal?.type === "reactivate") doReactivate(modal.id); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "ignore"}
        title="Abaikan Modul Belum Selesai?"
        message={<>Skor <span className="font-semibold text-gray-800">{modal?.type === "ignore" ? modal.name : ""}</span> akan dihitung hanya dari modul yang sudah selesai. Modul yang belum selesai tidak akan memberikan tambahan skor.</>}
        confirmLabel="Ignore"
        confirmCls="bg-orange-500 hover:bg-orange-600"
        icon={<AlertTriangle className="w-6 h-6 text-orange-500" />}
        onConfirm={() => { if (modal?.type === "ignore") doIgnore(modal.id); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "unignore"}
        title="Kembalikan ke Status Semula?"
        message={<><span className="font-semibold text-gray-800">{modal?.type === "unignore" ? modal.name : ""}</span> akan dikembalikan ke status aslinya dan modul yang belum selesai kembali diperhitungkan.</>}
        confirmLabel="Revert"
        confirmCls="bg-blue-600 hover:bg-blue-700"
        icon={<CheckCircle2 className="w-6 h-6 text-blue-500" />}
        onConfirm={() => { if (modal?.type === "unignore") doUnignore(modal.id); }}
        onCancel={() => setModal(null)}
      />
      <ConfirmModal
        open={modal?.type === "proceed"}
        title="Lanjutkan ke Fase Management Interview?"
        message={
          <>
            Seluruh karyawan yang memenuhi syarat akan dilanjutkan ke fase{" "}
            <span className="font-semibold text-gray-800">Management Interview</span>.
            Karyawan dengan status Inactive tidak akan disertakan. Proses ini tidak dapat dibatalkan.
          </>
        }
        confirmLabel="Ya, Lanjutkan"
        confirmCls="bg-[#1A284F] hover:bg-[#243869]"
        icon={<CheckCircle2 className="w-6 h-6 text-[#1A284F]" />}
        onConfirm={() => { if (!canProceed) return; saveYearEndState({ ...loadYearEndState(), phase: "management-interview" }); navigate("/hr/management-interview/invitation"); }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
