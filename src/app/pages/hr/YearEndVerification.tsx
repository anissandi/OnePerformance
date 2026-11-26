import React, { useState, useMemo, useEffect } from "react";
import { CheckCircle2, XCircle, Clock, Users, AlertTriangle, Bell, BellRing, UserX, Building2, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { useNavigate } from "react-router";
import { loadYearEndState, saveYearEndState, canProceedToInterview } from "../shared/yearEndWorkflowStore";
import { loadWorkflowRecords, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { isFeedbackFollowUpComplete, loadFeedbackSubmissions } from "../shared/interDepartmentFeedbackStore";
import { getActiveUser, isExcludedFromVerification, loadManagedUsers, resolveUserAllowedModules, useAuthStore } from "../../store/authStore";
import { ARCHIVE_UPDATED_EVENT, archiveUsers, isEmployeeArchived } from "../../store/archiveStore";
import { pushEmployeeNotification } from "../../store/notificationStore";
import { fetchYearEndVerificationLive } from "../../services/supabaseClient";
import { loadAllIcfProjectsByEmployee } from "../../store/projectStore";
import { evaluateEmployeeKPITracking } from "../employee/KPIPage";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import { MASTER_COMPANY_UPDATED_EVENT, getMasterCompanyLocations } from "./settings/masterCompanyStore";

interface VerificationCompanyUnit {
  id: string;
  name: string;
  code: string;
  industry: string;
}

const FALLBACK_VERIFICATION_UNITS: VerificationCompanyUnit[] = [
  { id: "1", name: "PT RSUP (Industry)",          code: "RSUP-IND", industry: "Industry" },
  { id: "2", name: "PT RSUP (Perkebunan)",        code: "RSUP-PKB", industry: "Perkebunan" },
  { id: "3", name: "PT Pulau Sambu (Jakarta)",    code: "PS-JKT",   industry: "Jakarta" },
  { id: "4", name: "PT Pulau Sambu (Guntung)",    code: "PS-GTG",   industry: "Guntung" },
  { id: "5", name: "PT Pulau Sambu (Kuala Enok)", code: "PS-KE",    industry: "Kuala Enok" },
  { id: "6", name: "PT RSTM",                     code: "RSTM",     industry: "" },
  { id: "7", name: "PT GHS",                      code: "GHS",      industry: "" },
  { id: "8", name: "PT RSUP ASD",                 code: "RSUP-ASD", industry: "" },
];

function getDynamicVerificationUnits(): VerificationCompanyUnit[] {
  const locs = getMasterCompanyLocations();
  if (locs.length === 0) return FALLBACK_VERIFICATION_UNITS;
  return locs.map((loc, idx) => {
    const legacy = FALLBACK_VERIFICATION_UNITS.find((u) => u.name === loc.company);
    return {
      id: legacy?.id ?? loc.unitId ?? `u-${idx + 1}`,
      name: loc.company,
      code: loc.code,
      industry: legacy?.industry ?? "",
    };
  });
}

const VERIFICATION_COMPANY_UNITS: VerificationCompanyUnit[] = new Proxy([] as VerificationCompanyUnit[], {
  get(_target, prop, receiver) {
    const list = getDynamicVerificationUnits();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});
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

function buildImportedVerificationEmployees(): Employee[] {
  return loadManagedUsers()
    .filter((u) => u.status === "Active" && !isExcludedFromVerification(u) && !isEmployeeArchived(u.employeeId))
    .map((u) => {
      const allowed = resolveUserAllowedModules(u);
      const hasKpi = allowed.includes("KPI (Setting/Measurement)");
      const hasSg = allowed.includes("SMART Goals (Setting/Measurement)");
      const hasAf = allowed.includes("Appraisals Form");
      const hasMs = allowed.includes("Managerial Skill");
      const hasPrj = allowed.includes("Project Outside Job Scope");
      const hasIdf = allowed.includes("Inter-Departement Feedback");
      return {
        id: u.employeeId,
        name: u.name,
        unit: u.company,
        division: u.division,
        department: u.department,
        position: u.position,
        kpi: hasKpi ? "incomplete" : "na",
        smartGoals: hasSg ? "incomplete" : "na",
        appraisalForm: hasAf ? "incomplete" : "na",
        managerialSkill: hasMs ? "incomplete" : "na",
        projectOJS: hasPrj ? "incomplete" : "na",
        interDept: hasIdf ? "incomplete" : "na",
        overall: "Incomplete",
      };
    });
}
const _UNUSED_STATIC_EMPLOYEES: Employee[] = [
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


const statusOptions   = ["All", "Complete", "Incomplete", "Pending", "Ignored"] as const;

function buildVerificationReminderDetails(emp: Employee): {
  pendingModules: string[];
  incompleteModules: string[];
  summaryText: string;
  ctaRoute: string;
} {
  const entries: Array<{ label: string; status: ModuleStatus; route: string }> = [
    { label: "KPI", status: emp.kpi, route: "/measurement/kpi-tracking" },
    { label: "SMART Goals", status: emp.smartGoals, route: "/measurement/smart-goals" },
    { label: "Appraisal Form", status: emp.appraisalForm, route: "/measurement/appraisal-form" },
    { label: "Managerial Skill", status: emp.managerialSkill, route: "/measurement/managerial-skill" },
    { label: "Project Outside Job Scope", status: emp.projectOJS, route: "/measurement/project-outside" },
    { label: "Inter-Department Feedback", status: emp.interDept, route: "/measurement/inter-department-feedback" },
  ];
  const incompleteModules = entries.filter((e) => e.status === "incomplete").map((e) => e.label);
  const pendingModules = entries.filter((e) => e.status === "pending").map((e) => e.label);
  const firstActionable = entries.find((e) => e.status === "incomplete" || e.status === "pending");
  const statusParts: string[] = [];
  if (incompleteModules.length > 0) {
    statusParts.push(`Incomplete: ${incompleteModules.join(", ")}`);
  }
  if (pendingModules.length > 0) {
    statusParts.push(`Pending: ${pendingModules.join(", ")}`);
  }
  const detailStr = statusParts.join(" | ") || `Status keseluruhan: ${emp.overall}`;
  return {
    pendingModules,
    incompleteModules,
    summaryText: `Pengingat Verifikasi Penilaian Kinerja 2026 — terdapat modul penilaian Anda yang belum selesai (${detailStr}). Mohon segera lengkapi pengisian atau tindak lanjuti proses persetujuan modul terkait.`,
    ctaRoute: firstActionable?.route || "/dashboard",
  };
}

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
  const { lockedUnits } = useAuthStore();
  const [tick, setTick] = useState(0);
  const availableCompanyUnits = useMemo(
    () =>
      lockedUnits && lockedUnits.length > 0
        ? VERIFICATION_COMPANY_UNITS.filter((u) => lockedUnits.includes(u.name))
        : [...VERIFICATION_COMPANY_UNITS],
    [lockedUnits, tick],
  );
  const [selectedUnit,   setSelectedUnit]   = useState<VerificationCompanyUnit | null>(null);
  const [search,         setSearch]         = useState("");
  const [divFilter,      setDivFilter]      = useState("All");
  const [deptFilter,     setDeptFilter]     = useState("All");
  const [posFilter,      setPosFilter]      = useState("All");
  const [statusFilter,   setStatusFilter]   = useState("All");
  const [remindedSet,    setRemindedSet]    = useState<Set<string>>(() => new Set(loadYearEndState().reminded));
  const [ignoredSet,     setIgnoredSet]     = useState<Set<string>>(() => new Set(loadYearEndState().ignored));
  const [inactiveReason, setInactiveReason] = useState("");

  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState(loadWorkflowRecords);
  const [feedback, setFeedback] = useState(loadFeedbackSubmissions);
  useEffect(() => {
    void fetchYearEndVerificationLive().then((remote) => {
      if (remote) {
        const latest = loadYearEndState();
        setRemindedSet(new Set(latest.reminded));
        setIgnoredSet(new Set(latest.ignored));
      }
    });
    const refresh = () => {
      const latestYe = loadYearEndState();
      setRemindedSet(new Set(latestYe.reminded));
      setIgnoredSet(new Set(latestYe.ignored));
      setWorkflow(loadWorkflowRecords());
      setFeedback(loadFeedbackSubmissions());
      setTick((t) => t + 1);
    };
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("pa-auth-updated", refresh);
    window.addEventListener("pa-employees-imported", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener("year-end-updated", refresh);
    window.addEventListener(ARCHIVE_UPDATED_EVENT, refresh);
    window.addEventListener(MASTER_COMPANY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("feedback-updated", refresh);
      window.removeEventListener("pa-auth-updated", refresh);
      window.removeEventListener("pa-employees-imported", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener("year-end-updated", refresh);
      window.removeEventListener(ARCHIVE_UPDATED_EVENT, refresh);
      window.removeEventListener(MASTER_COMPANY_UPDATED_EVENT, refresh);
    };
  }, []);
  const currentEmployees = useMemo(() => {
    const baseList = buildImportedVerificationEmployees();
    const projectsByEmp = loadAllIcfProjectsByEmployee();
    return baseList.map((employee) => {
    const updated = { ...employee };
    const normId = normalizeEmployeeId(employee.id);

    // 1. Evaluasi kolom KPI: centang hijau HANYA jika 12 bulan lengkap + Validated HR ICF
    if (updated.kpi !== "na") {
      const evalKpi = evaluateEmployeeKPITracking(employee.id);
      const wfKpiMeas = workflow.find(
        (item) => item.employeeId === normId && item.module === "KPI" && item.phase === "measurement" && item.year === "2026",
      );
      const wfKpiSet = workflow.find(
        (item) => item.employeeId === normId && item.module === "KPI" && item.phase === "setting" && item.year === "2026",
      );
      const isKpiValidated = Boolean(
        wfKpiMeas &&
          (wfKpiMeas.decisions.validator?.status === "Validated" ||
            wfKpiMeas.decisions.approver2?.status === "Validated"),
      );
      if (evalKpi.isFullYearMonthsComplete && isKpiValidated) {
        updated.kpi = "complete";
      } else if (evalKpi.hasAnyTrackingData || wfKpiMeas || wfKpiSet) {
        updated.kpi = "pending";
      } else {
        updated.kpi = "incomplete";
      }
    }

    // 2. Evaluasi kolom SMART Goals: centang hijau jika SMART Goals Measurement sudah Validated HR ICF
    if (updated.smartGoals !== "na") {
      const wfSgMeas = workflow.find(
        (item) => item.employeeId === normId && item.module === "SMART Goals" && item.phase === "measurement" && item.year === "2026",
      );
      const wfSgSet = workflow.find(
        (item) => item.employeeId === normId && item.module === "SMART Goals" && item.phase === "setting" && item.year === "2026",
      );
      const isSgValidated = Boolean(
        wfSgMeas &&
          (wfSgMeas.decisions.validator?.status === "Validated" ||
            wfSgMeas.decisions.approver2?.status === "Validated"),
      );
      if (isSgValidated) {
        updated.smartGoals = "complete";
      } else if (wfSgMeas || wfSgSet) {
        updated.smartGoals = "pending";
      } else {
        updated.smartGoals = "incomplete";
      }
    }

    // 3. Evaluasi modul 2-tahap (Appraisal Form, Managerial Skill, Project OJS)
    const modules = { "Appraisal Form": "appraisalForm", "Managerial Skill": "managerialSkill", "Project": "projectOJS" } as const;
    for (const [module, field] of Object.entries(modules)) {
      if (updated[field] === "na") continue;
      const record = workflow.find((item) => item.employeeId === normId && item.module === module && item.phase === "measurement" && item.year === "2026");
      if (record) {
        const decision = record.decisions.approver2?.status;
        updated[field] = decision === "Approved" || decision?.startsWith("Assessed") ? "complete" : "pending";
      }
    }
    if (updated.projectOJS === "incomplete" && (projectsByEmp[normalizeEmployeeId(employee.id)]?.rows?.length || projectsByEmp[employee.id]?.rows?.length)) {
      updated.projectOJS = "pending";
    }
    const received = feedback.find((entry) => normalizeEmployeeId(entry.row.employeeId) === normalizeEmployeeId(employee.id));
    if (received && updated.interDept !== "na") updated.interDept = isFeedbackFollowUpComplete(received) ? "complete" : "pending";
    const statuses = [updated.kpi, updated.smartGoals, updated.appraisalForm, updated.managerialSkill, updated.projectOJS, updated.interDept];
    updated.overall = statuses.includes("incomplete") ? "Incomplete" : statuses.includes("pending") ? "Pending" : "Complete";
    return updated;
  });
  }, [workflow, feedback, tick]);
  useEffect(() => {
    const prev = loadYearEndState();
    const completion = Object.fromEntries(currentEmployees.map((employee) => [normalizeEmployeeId(employee.id), { kpi: employee.kpi === "complete", smartGoals: employee.smartGoals === "complete", appraisalForm: employee.appraisalForm === "complete", managerialSkill: employee.managerialSkill === "complete", projectOutsideJobScope: employee.projectOJS === "complete" }]));
    saveYearEndState({ ...prev, reminded: [...remindedSet], ignored: [...ignoredSet], completion });
  }, [currentEmployees]);

  const buildCompletionSnapshot = () =>
    Object.fromEntries(
      currentEmployees.map((employee) => [
        normalizeEmployeeId(employee.id),
        {
          kpi: employee.kpi === "complete",
          smartGoals: employee.smartGoals === "complete",
          appraisalForm: employee.appraisalForm === "complete",
          managerialSkill: employee.managerialSkill === "complete",
          projectOutsideJobScope: employee.projectOJS === "complete",
        },
      ]),
    );

  const isEmpIgnored = (empId: string) =>
    ignoredSet.has(empId) || Array.from(ignoredSet).some((x) => normalizeEmployeeId(x) === normalizeEmployeeId(empId));
  const isEmpReminded = (empId: string) =>
    remindedSet.has(empId) || Array.from(remindedSet).some((x) => normalizeEmployeeId(x) === normalizeEmployeeId(empId));

  // Hanya karyawan pada Company Unit yang dipilih yang masuk dalam perhitungan & tabel
  const unitEmployees = useMemo(
    () =>
      selectedUnit
        ? currentEmployees.filter((e) => e.unit === selectedUnit.name)
        : [],
    [currentEmployees, selectedUnit],
  );

  const archivedInSelectedUnitCount = useMemo(() => {
    if (!selectedUnit) return 0;
    try {
      const raw = JSON.parse(localStorage.getItem("pa_archived_users_v1") ?? "[]") as Array<{ source?: string; user?: { company?: string } }>;
      return Array.isArray(raw)
        ? raw.filter((r) => r?.source === "verification" && r?.user?.company === selectedUnit.name).length
        : 0;
    } catch {
      return 0;
    }
  }, [selectedUnit, tick]);

  const TOTAL_EMPLOYEES = unitEmployees.length;
  const FULLY_COMPLETE = unitEmployees.filter((employee) => employee.overall === "Complete").length;
  const INCOMPLETE = unitEmployees.filter((employee) => employee.overall === "Incomplete" && !isEmpIgnored(employee.id)).length;
  const PENDING_REVIEW = unitEmployees.filter((employee) => employee.overall === "Pending" && !isEmpIgnored(employee.id)).length;
  const IGNORED_COUNT = unitEmployees.filter((employee) => isEmpIgnored(employee.id)).length;
  const handled = unitEmployees.filter((employee) => employee.overall === "Complete" || isEmpIgnored(employee.id)).length;
  const READINESS_PCT = TOTAL_EMPLOYEES > 0 ? Math.round((handled / TOTAL_EMPLOYEES) * 100) : 0;

  const divisionOptions = useMemo(() => ["All", ...Array.from(new Set(unitEmployees.map((e) => e.division)))], [unitEmployees]);
  const deptOptions     = useMemo(() => ["All", ...Array.from(new Set(unitEmployees.map((e) => e.department)))], [unitEmployees]);
  const positionOptions = useMemo(() => ["All", ...Array.from(new Set(unitEmployees.map((e) => e.position)))], [unitEmployees]);

  type ModalState =
    | { type: "reminder_one"; id: string; name: string }
    | { type: "reminder_all"; count: number }
    | { type: "inactive"; id: string; name: string }
    | { type: "ignore"; id: string; name: string }
    | { type: "unignore"; id: string; name: string }
    | { type: "proceed" }
    | null;
  const [modal, setModal] = useState<ModalState>(null);

  const filtered = useMemo(() => unitEmployees.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.position.toLowerCase().includes(q);
    const matchDiv    = divFilter    === "All" || e.division   === divFilter;
    const matchDept   = deptFilter   === "All" || e.department === deptFilter;
    const matchPos    = posFilter    === "All" || e.position   === posFilter;
    const matchStatus = statusFilter === "All" || (isEmpIgnored(e.id) ? "Ignored" : e.overall) === statusFilter;
    return matchSearch && matchDiv && matchDept && matchPos && matchStatus;
  }), [search, divFilter, deptFilter, posFilter, statusFilter, unitEmployees, ignoredSet]);

  const canProceed = canProceedToInterview(unitEmployees, { ...loadYearEndState(), inactive: [], ignored: [...ignoredSet] });

  function confirmSendReminder(id: string, name: string) { setModal({ type: "reminder_one", id, name }); }
  function doSendReminder(id: string) {
    const targetEmp = unitEmployees.find((e) => e.id === id) ?? currentEmployees.find((e) => e.id === id);
    const actor = getActiveUser();
    const nextReminded = new Set([...remindedSet, id]);
    setRemindedSet(nextReminded);
    const prev = loadYearEndState();
    saveYearEndState(
      {
        ...prev,
        reminded: [...nextReminded],
        ignored: [...ignoredSet],
        completion: buildCompletionSnapshot(),
      },
      {
        action: "Update",
        description: `Sent Year-End Verification reminder to ${targetEmp?.name ?? id} (${id})`,
      },
    );
    if (targetEmp) {
      const detail = buildVerificationReminderDetails(targetEmp);
      pushEmployeeNotification({
        employeeIds: [targetEmp.id],
        title: "Reminder Verifikasi Penilaian Kinerja 2026",
        summary: detail.summaryText,
        category: "Reminder",
        moduleName: "Calibration Verification",
        approvalStatus: targetEmp.overall,
        ctaLabel: "Lengkapi Modul Penilaian",
        ctaRoute: detail.ctaRoute,
        senderName: actor.name,
        senderRole: actor.role,
      });
    }
    toast.success(`Notifikasi reminder berhasil dikirim ke ${targetEmp?.name ?? id}.`);
  }

  function confirmSendAll() {
    const count = filtered.filter((e) => !isEmpIgnored(e.id) && (e.overall === "Pending" || e.overall === "Incomplete") && !isEmpReminded(e.id)).length;
    setModal({ type: "reminder_all", count });
  }
  function doSendAllReminders() {
    const targets = filtered.filter((e) => !isEmpIgnored(e.id) && (e.overall === "Pending" || e.overall === "Incomplete") && !isEmpReminded(e.id));
    if (targets.length === 0) return;
    const actor = getActiveUser();
    const nextReminded = new Set([...remindedSet, ...targets.map((t) => t.id)]);
    setRemindedSet(nextReminded);
    const prev = loadYearEndState();
    saveYearEndState(
      {
        ...prev,
        reminded: [...nextReminded],
        ignored: [...ignoredSet],
        completion: buildCompletionSnapshot(),
      },
      {
        action: "Update",
        description: `Sent bulk Year-End Verification reminders to ${targets.length} employee(s) in ${selectedUnit?.name ?? "Unit"}`,
      },
    );
    for (const targetEmp of targets) {
      const detail = buildVerificationReminderDetails(targetEmp);
      pushEmployeeNotification({
        employeeIds: [targetEmp.id],
        title: "Reminder Verifikasi Penilaian Kinerja 2026",
        summary: detail.summaryText,
        category: "Reminder",
        moduleName: "Calibration Verification",
        approvalStatus: targetEmp.overall,
        ctaLabel: "Lengkapi Modul Penilaian",
        ctaRoute: detail.ctaRoute,
        senderName: actor.name,
        senderRole: actor.role,
      });
    }
    toast.success(`Notifikasi reminder berhasil dikirim ke ${targets.length} karyawan.`);
  }

  function confirmInactive(id: string, name: string) {
    setInactiveReason("");
    setModal({ type: "inactive", id, name });
  }
  function doInactive(id: string, reasonText: string) {
    const cleanReason = reasonText.trim();
    if (!cleanReason) {
      toast.error("Alasan Inactive wajib diisi.");
      return;
    }
    const managedUser = loadManagedUsers().find(
      (u) => u.employeeId.toLowerCase() === id.toLowerCase() || normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(id),
    );
    if (!managedUser) {
      toast.error("Data karyawan tidak ditemukan pada daftar aktif.");
      return;
    }
    const nextIgnored = new Set([...ignoredSet].filter((v) => normalizeEmployeeId(v) !== normalizeEmployeeId(id)));
    const nextReminded = new Set([...remindedSet].filter((v) => normalizeEmployeeId(v) !== normalizeEmployeeId(id)));
    setIgnoredSet(nextIgnored);
    setRemindedSet(nextReminded);
    archiveUsers([managedUser], cleanReason, "verification");
    setInactiveReason("");
    setModal(null);
    setTick((t) => t + 1);
    toast.success(`${managedUser.name} (${managedUser.employeeId}) telah dinonaktifkan dan dipindahkan ke Archive.`);
  }

  function confirmIgnore(id: string, name: string) { setModal({ type: "ignore", id, name }); }
  function doIgnore(id: string) {
    const nextIgnored = new Set([...ignoredSet, id]);
    setIgnoredSet(nextIgnored);
    const prev = loadYearEndState();
    saveYearEndState(
      {
        ...prev,
        reminded: [...remindedSet],
        ignored: [...nextIgnored],
        completion: buildCompletionSnapshot(),
      },
      {
        action: "Update",
        description: `Marked employee ${id} as Ignored in Year-End Verification`,
      },
    );
    toast.success("Status karyawan diperbarui menjadi Ignored dan tersimpan ke database.");
  }
  function confirmUnignore(id: string, name: string) { setModal({ type: "unignore", id, name }); }
  function doUnignore(id: string) {
    const nextIgnored = new Set([...ignoredSet].filter((v) => v !== id && normalizeEmployeeId(v) !== normalizeEmployeeId(id)));
    setIgnoredSet(nextIgnored);
    const prev = loadYearEndState();
    saveYearEndState(
      {
        ...prev,
        reminded: [...remindedSet],
        ignored: [...nextIgnored],
        completion: buildCompletionSnapshot(),
      },
      {
        action: "Update",
        description: `Reverted Ignored status for employee ${id} in Year-End Verification`,
      },
    );
    toast.success("Status Ignored telah dibatalkan dan tersimpan ke database.");
  }

  const pendingCount = filtered.filter((e) => !isEmpIgnored(e.id) && (e.overall === "Pending" || e.overall === "Incomplete") && !isEmpReminded(e.id)).length;

  if (!selectedUnit) {
    const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Verification</h2>
          <p className="text-sm text-gray-500">
            Performance Year 2026 · Pre-Management Interview Gate per Company Unit
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            Select a company unit to review and verify employee appraisal completion status.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {availableCompanyUnits.map((unit, idx) => {
              const unitEmpCount = currentEmployees.filter((e) => e.unit === unit.name).length;
              const unitCompleteCount = currentEmployees.filter((e) => e.unit === unit.name && e.overall === "Complete").length;
              const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
              return (
                <button
                  key={unit.id}
                  onClick={() => {
                    setSelectedUnit(unit);
                    setSearch("");
                    setDivFilter("All");
                    setDeptFilter("All");
                    setPosFilter("All");
                    setStatusFilter("All");
                  }}
                  style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                  className={`group relative overflow-hidden text-left bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-4 min-h-[132px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion cursor-pointer`}
                >
                  <div
                    className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                    style={{ backgroundColor: `${spec.accentHex}0D` }}
                  />
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-500 truncate">{unit.code}{unit.industry ? ` · ${unit.industry}` : ""}</p>
                      <p className="text-base font-extrabold text-[#111827] leading-snug mt-1">{unit.name}</p>
                    </div>
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: spec.accentHex }}
                    >
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-4 relative z-10">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-[#1A284F] tabular-nums">{unitEmpCount} Active HC</span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-white/80 border border-emerald-200 px-2 py-0.5 rounded-full">
                        {unitCompleteCount} Complete
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1A284F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Verification</h2>
        <p className="text-sm text-gray-500">Performance Year 2026 · Pre-Management Interview Gate</p>
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setSelectedUnit(null)}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>
      </div>
      {/* Unit header */}
      <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-[#1A284F]" />
        </div>
        <div>
          <p className="font-bold text-gray-900">{selectedUnit.name}</p>
          <p className="text-sm text-gray-500">
            {selectedUnit.industry}{selectedUnit.industry ? " · " : ""}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{selectedUnit.code}</span>
          </p>
        </div>
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
        {([
          { icon: Users,         label: "Total Employees",     value: TOTAL_EMPLOYEES,             sub: "Active HC unit ini",     tone: "navy"       as AnalyticsCardTone },
          { icon: CheckCircle2,  label: "Fully Complete",      value: FULLY_COMPLETE,              sub: "Seluruh modul tuntas",   tone: "emerald"    as AnalyticsCardTone },
          { icon: XCircle,       label: "Incomplete",          value: INCOMPLETE,                  sub: "Belum mengisi lengkap",  tone: "rose"       as AnalyticsCardTone },
          { icon: Clock,         label: "Pending Review",      value: PENDING_REVIEW,              sub: "Menunggu approval",      tone: "terracotta" as AnalyticsCardTone },
          { icon: UserX,         label: "Archived (Inactive)", value: archivedInSelectedUnitCount, sub: "Dipindahkan ke Archive", tone: "slate"      as AnalyticsCardTone },
          { icon: AlertTriangle, label: "Ignored",             value: IGNORED_COUNT,               sub: "Dikecualikan sementara", tone: "plum"       as AnalyticsCardTone },
        ]).map(({ icon: Icon, label, value, sub, tone }, idx) => (
          <AnalyticsStatCard
            key={label}
            index={idx}
            compact
            tone={tone}
            title={label}
            value={value}
            subtitle={sub}
            icon={<Icon className="w-4 h-4" />}
          />
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
          <FilterSelect label="Division"     value={divFilter}    options={divisionOptions} onChange={setDivFilter}  />
          <FilterSelect label="Department"   value={deptFilter}   options={deptOptions}     onChange={setDeptFilter} />
          <FilterSelect label="Position"     value={posFilter}    options={positionOptions} onChange={setPosFilter}  />
          <FilterSelect label="Status"       value={statusFilter} options={[...statusOptions]} onChange={setStatusFilter} />
          {/* Reset */}
          {(divFilter !== "All" || deptFilter !== "All" || posFilter !== "All" || statusFilter !== "All" || search) && (
            <button
              onClick={() => { setSearch(""); setDivFilter("All"); setDeptFilter("All"); setPosFilter("All"); setStatusFilter("All"); }}
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
                const isIgnored  = isEmpIgnored(emp.id);
                const needsReminder = !isIgnored && (emp.overall === "Pending" || emp.overall === "Incomplete");
                const reminded = isEmpReminded(emp.id);
                const rowCls = isIgnored
                  ? "bg-orange-50/50"
                  : "hover:bg-gray-50/60";
                return (
                  <tr key={emp.id} className={`border-b border-gray-50 transition-colors ${rowCls}`}>
                    {/* No */}
                    <td className="px-4 py-3 text-center text-xs text-gray-400 font-semibold">{idx + 1}</td>

                    {/* Action */}
                    <td className="px-4 py-3 text-center">
                      {isIgnored ? (
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
        message={(() => {
          if (modal?.type !== "reminder_one") return null;
          const emp = unitEmployees.find((e) => e.id === modal.id);
          const detail = emp ? buildVerificationReminderDetails(emp) : null;
          return (
            <>
              Notifikasi sistem akan dikirim ke <span className="font-semibold text-gray-800">{modal.name}</span> ({modal.id}) beserta rincian modul yang belum tuntas:
              {detail && (
                <span className="block mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 text-left">
                  {detail.incompleteModules.length > 0 && (
                    <span className="block"><strong>Incomplete:</strong> {detail.incompleteModules.join(", ")}</span>
                  )}
                  {detail.pendingModules.length > 0 && (
                    <span className="block"><strong>Pending:</strong> {detail.pendingModules.join(", ")}</span>
                  )}
                </span>
              )}
            </>
          );
        })()}
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
      {modal?.type === "inactive" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-2.5">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <UserX className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Nonaktifkan &amp; Arsipkan Karyawan?</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                <span className="font-semibold text-gray-800">{modal.name}</span> ({modal.id}) akan dipindahkan ke menu{" "}
                <span className="font-semibold text-[#1A284F]">Archive (/settings/archive)</span> dan dikeluarkan dari seluruh fitur karyawan aktif (login, headcount, verifikasi, kalibrasi, dll.).
              </p>
            </div>
            <div className="px-6 pb-4">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Alasan Inactive <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                autoFocus
                value={inactiveReason}
                onChange={(e) => setInactiveReason(e.target.value)}
                placeholder="Masukkan alasan penonaktifan (akan tersimpan pada kolom Keterangan Arsip di menu Archive)..."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Alasan ini akan ditampilkan pada kolom <strong>Keterangan Arsip</strong> di halaman Archive.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-6 pt-1">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!inactiveReason.trim()}
                onClick={() => doInactive(modal.id, inactiveReason)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Nonaktifkan &amp; Arsipkan
              </button>
            </div>
          </div>
        </div>
      )}
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
            Karyawan yang telah dipindahkan ke Archive (Inactive) tidak akan disertakan. Proses ini tidak dapat dibatalkan.
          </>
        }
        confirmLabel="Ya, Lanjutkan"
        confirmCls="bg-[#1A284F] hover:bg-[#243869]"
        icon={<CheckCircle2 className="w-6 h-6 text-[#1A284F]" />}
        onConfirm={() => {
          if (!canProceed) return;
          saveYearEndState(
            { ...loadYearEndState(), reminded: [...remindedSet], ignored: [...ignoredSet], completion: buildCompletionSnapshot(), phase: "management-interview" },
            { action: "Approve", description: `Proceeded ${selectedUnit?.name ?? "Company Unit"} from Year-End Verification to Management Interview phase` },
          );
          navigate("/hr/calibration/management-interview");
        }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}
