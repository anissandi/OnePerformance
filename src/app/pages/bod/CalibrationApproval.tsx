import { resolveGradeForScore } from "../shared/scoringWeightStore";
import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2, RotateCcw, ChevronDown, ChevronUp, X, Info,
  Building2, Search, Users, RefreshCw, TrendingUp, TrendingDown, Download, Eye, ShieldAlert, Clock, UserCheck,
} from "lucide-react";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";
import {
  canRoleAccessCalibrationApproval,
  canonicalizeCompanyUnitName,
  getActiveUser,
  getCalibrationInvolvedUnits,
  getCalibrationRoleForUnit,
  getGroupCompaniesForUnit,
  getRoleAllowedCompanyUnits,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
  isExcludedFromAppraisalCalibration,
  loadManagedUsers,
  type CalibrationUnitRole,
  type ManagedUser,
} from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import { BellCurveTagButton, GradeBellCurveModal } from "../../components/GradeBellCurveModal";
import { AnalyticsStatCard } from "../../components/AnalyticsStatCard";
import { getSoyApproval, SOY_EVENT } from "../../store/calibrationSoyStore";
import {
  applyImportedEmployeesDistribution,
  computeUnitQuotaAllocation,
  type CompanyUnit as SettingCompanyUnit,
} from "../hr/CalibrationSetting";
import { EXCEL_THEME, exportStyledXLSX, type StyledExcelCell } from "../../utils/excelUtils";

// ─── Grade helpers ─────────────────────────────────────────────────────────────

const GRADE_HEX: Record<string, string> = { "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B" };
function gradeFromScore(n: number, companyName?: string): { grade: string; color: string } {
  const grade = resolveGradeForScore(n, companyName);
  return { grade, color: GRADE_HEX[grade] ?? "#6B7280" };
}

// ─── Company units (mirrors CalibrationAdjustment) ────────────────────────────

type CompanyUnit = {
  id: string;
  name: string;
  code: string;
  totalHC: number;
  submittedBy: string;
  submittedAt: string;
};

const COMPANY_UNITS: CompanyUnit[] = [
  { id: "1", name: "PT RSUP (Industry)",          code: "RSUP-IND", totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "2", name: "PT RSUP (Perkebunan)",        code: "RSUP-PKB", totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "3", name: "PT RSTM",                     code: "RSTM",     totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "4", name: "PT GHS",                      code: "GHS",      totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "5", name: "PT RSUP ASD",                 code: "RSUP-ASD", totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "6", name: "PT Pulau Sambu (Jakarta)",    code: "PSJ",      totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "7", name: "PT Pulau Sambu (Guntung)",    code: "PSG",      totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
  { id: "8", name: "PT Pulau Sambu (Kuala Enok)", code: "PSKE",     totalHC: 0, submittedBy: "HR ICF", submittedAt: "—" },
];

// ─── Grade distribution (live) ──────────────────────────────────────

const GRADE_KEYS = ["A+","A","B","C","D","E"];
const GRADE_COLORS: Record<string, string> = {
  "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
};


const GRADE_ORDER = ["E", "D", "C", "B", "A", "A+"];

type EmpRow = {
  id: string; name: string; division: string; department: string; position: string;
  currentScore: number; currentGrade: string; currentColor: string;
  proposedScore: number; proposedGrade: string; proposedColor: string;
  status: "No Change" | "Upgraded" | "Downgraded";
  justification: string;
};

function generateEmployees(unitId: string, _totalHC: number): EmpRow[] {
  const unitDef = COMPANY_UNITS.find((u) => u.id === unitId);
  const unitName = unitDef?.name ?? "";
  const liveEmps = getLiveTransactionalEmployees().filter((e) => !unitName || e.companyUnit === unitName);
  const adjScores = loadPersistedState<Record<string, number>>("pa_calibration_adj_scores_v1", {});
  const adjComments = loadPersistedState<Record<string, string>>("pa_calibration_adj_comments_v1", {});

  return liveEmps.map((e) => {
    const score = e.totalScore;
    const { grade: cg, color: cc } = gradeFromScore(score, unitName || e.companyUnit);
    const pScore = adjScores[e.id] ?? adjScores[`emp-${e.id}`] ?? score;
    const { grade: pg, color: pc } = gradeFromScore(pScore, unitName || e.companyUnit);
    const statusVal: EmpRow["status"] =
      GRADE_ORDER.indexOf(pg) > GRADE_ORDER.indexOf(cg)
        ? "Upgraded"
        : GRADE_ORDER.indexOf(pg) < GRADE_ORDER.indexOf(cg)
        ? "Downgraded"
        : "No Change";
    return {
      id: e.id,
      name: e.fullName,
      division: e.division,
      department: e.department,
      position: e.position,
      currentScore: score,
      currentGrade: cg,
      currentColor: cc,
      proposedScore: pScore,
      proposedGrade: pg,
      proposedColor: pc,
      status: statusVal,
      justification: adjComments[e.id] ?? adjComments[`emp-${e.id}`] ?? "",
    };
  });
}

function getDivisionSummary(emps: EmpRow[]) {
  const map = new Map<string, { hc: number; upgraded: number; noChange: number; downgraded: number; grades: string[] }>();
  for (const e of emps) {
    if (!map.has(e.division)) map.set(e.division, { hc: 0, upgraded: 0, noChange: 0, downgraded: 0, grades: [] });
    const d = map.get(e.division)!;
    d.hc++;
    d.grades.push(e.proposedGrade);
    if (e.status === "Upgraded")   d.upgraded++;
    else if (e.status === "Downgraded") d.downgraded++;
    else d.noChange++;
  }
  return Array.from(map.entries()).map(([division, d]) => {
    const gradeCounts = GRADE_KEYS.map(g => ({ grade: g, count: d.grades.filter(x => x === g).length }));
    const top = gradeCounts.sort((a, b) => b.count - a.count)[0]?.grade ?? "B";
    return { division, ...d, gradeTop: top };
  });
}

function getDepartmentSummary(emps: EmpRow[]) {
  const map = new Map<string, { division: string; hc: number; upgraded: number; noChange: number; downgraded: number; grades: string[] }>();
  for (const e of emps) {
    const key = `${e.division}__${e.department}`;
    if (!map.has(key)) map.set(key, { division: e.division, hc: 0, upgraded: 0, noChange: 0, downgraded: 0, grades: [] });
    const d = map.get(key)!;
    d.hc++;
    d.grades.push(e.proposedGrade);
    if (e.status === "Upgraded") d.upgraded++;
    else if (e.status === "Downgraded") d.downgraded++;
    else d.noChange++;
  }
  return Array.from(map.entries())
    .map(([key, d]) => {
      const gradeCounts = GRADE_KEYS.map((g) => ({ grade: g, count: d.grades.filter((x) => x === g).length }));
      const top = [...gradeCounts].sort((a, b) => b.count - a.count)[0]?.grade ?? "B";
      return { department: key.split("__")[1] || "-", ...d, gradeTop: top };
    })
    .sort((a, b) => a.division.localeCompare(b.division) || a.department.localeCompare(b.department));
}

interface CalibrationUserDecision {
  employeeId: string;
  name: string;
  position: string;
  calRole: "approver" | "mengetahui";
  status: "approved" | "acknowledged" | "revision";
  at: string;
}

const CAL_USER_DECISIONS_KEY = "pa_bod_cal_user_decisions_v1";

/**
 * Mengumpulkan daftar user aktif yang di-allow sebagai Approver atau Mengetahui pada suatu Unit Usaha
 * (tidak termasuk Read Only maupun Kosong).
 */
function resolveUnitCalibrationApproverUsers(
  unitName: string,
  allUsers: ManagedUser[],
): Array<{ user: ManagedUser; calRole: "approver" | "mengetahui" }> {
  const canonUnit = canonicalizeCompanyUnitName(unitName);
  const out: Array<{ user: ManagedUser; calRole: "approver" | "mengetahui" }> = [];
  for (const u of allUsers) {
    if (u.status !== "Active") continue;
    if (!canRoleAccessCalibrationApproval(u.role)) continue;
    const map = u.calibrationRoleByUnit;
    const hasExplicitMap =
      map &&
      typeof map === "object" &&
      Object.values(map).some((v) => v === "approver" || v === "mengetahui" || v === "readonly");
    if (hasExplicitMap) {
      const r = map![canonUnit] ?? map![unitName] ?? "";
      if (r === "approver" || r === "mengetahui") {
        out.push({ user: u, calRole: r });
      }
      continue;
    }
    // Administrator & HR ICF hanya masuk daftar Approver/Mengetahui jika dipetakan eksplisit di Peran Approval Calibration
    if (isAdminOrHrIcfRole(u.role)) continue;
    const fallbackRole = getCalibrationRoleForUnit(u, canonUnit);
    if (fallbackRole === "approver" || fallbackRole === "mengetahui") {
      out.push({ user: u, calRole: fallbackRole });
    }
  }
  return out.sort((a, b) => {
    if (a.calRole !== b.calRole) return a.calRole === "approver" ? -1 : 1;
    return a.user.name.localeCompare(b.user.name);
  });
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true, action }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean; action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(v => !v); } }}
        className="w-full flex items-center justify-between px-6 py-5 border-b border-gray-100 hover:bg-gray-50/50 transition-colors text-left cursor-pointer"
      >
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 text-sm">{title}</p>
            {action}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

const APPROVAL_STATEMENTS = [
  "I have reviewed the grade distribution and confirm it aligns with company targets.",
  "I have reviewed all individual grade changes and their supporting justifications.",
  "I confirm that the calibration results are fair, objective, and based on performance data.",
  "I acknowledge that approving this will finalize all grades and notify all parties.",
];

function ApproveModal({ unitName, onConfirm, onCancel }: {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(APPROVAL_STATEMENTS.map(() => false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Approve Calibration</h3>
              <p className="text-xs text-gray-400 mt-0.5">{unitName} · Performance Year 2026</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
          As the authorized Director, please confirm each statement below before approving.
        </div>

        <div className="flex flex-col gap-3">
          {APPROVAL_STATEMENTS.map((stmt, i) => (
            <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked[i] ? "border-emerald-300 bg-emerald-50/60" : "border-gray-200 hover:bg-gray-50"}`}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))}
                className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
              />
              <span className={`text-sm leading-relaxed ${checked[i] ? "text-emerald-800 font-medium" : "text-gray-700"}`}>{stmt}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            disabled={!allChecked}
            onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve Calibration
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Revision Modal ───────────────────────────────────────────────────────────

function RevisionModal({ unitName, onConfirm, onCancel }: {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Return for Revision</h3>
              <p className="text-xs text-gray-400 mt-0.5">{unitName} · Performance Year 2026</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          HR will be notified to review and resubmit the calibration results for this company unit.
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <RotateCcw className="w-4 h-4" /> Confirm Revision
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = "pending" | "approved" | "revision";

export function BODCalibrationApproval() {
  const activeUser = getActiveUser();
  const isDirector = isDirectorRoleOrGrouping(activeUser);
  const [authTick, setAuthTick] = useState(0);
  const allowedUnitNames = useMemo(
    () => {
      return getCalibrationInvolvedUnits(
        activeUser,
        COMPANY_UNITS.map((u) => u.name),
      );
    },
    [isDirector, activeUser, authTick],
  );
  const visibleUnits = useMemo(
    () => COMPANY_UNITS.filter((u) => allowedUnitNames.includes(u.name)),
    [allowedUnitNames],
  );
  const [selectedUnitId, setSelectedUnitId] = useState(() => visibleUnits[0]?.id ?? COMPANY_UNITS[0].id);
  const [modal, setModal]   = useState<"approve" | "revision" | "mengetahui" | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, ApprovalStatus>>(() =>
    loadPersistedState("pa_bod_cal_status_map_v1", {})
  );
  const [approvedAtMap, setApprovedAtMap] = useState<Record<string, string>>(() =>
    loadPersistedState("pa_bod_cal_approved_at_v1", {})
  );
  const [acknowledgedMap, setAcknowledgedMap] = useState<Record<string, { by: string; at: string }>>(() =>
    loadPersistedState("pa_bod_cal_acknowledged_map_v1", {})
  );
  const [userDecisionsMap, setUserDecisionsMap] = useState<
    Record<string, Record<string, CalibrationUserDecision>>
  >(() => loadPersistedState(CAL_USER_DECISIONS_KEY, {}));
  const [empSearch, setEmpSearch] = useState("");
  const [finalEmpSearch, setFinalEmpSearch] = useState("");

  useEffect(() => {
    const onHydrated = () => {
      setStatusMap(loadPersistedState("pa_bod_cal_status_map_v1", {}));
      setApprovedAtMap(loadPersistedState("pa_bod_cal_approved_at_v1", {}));
      setAcknowledgedMap(loadPersistedState("pa_bod_cal_acknowledged_map_v1", {}));
      setUserDecisionsMap(loadPersistedState(CAL_USER_DECISIONS_KEY, {}));
      setAuthTick((t) => t + 1);
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener("pa-auth-updated", onHydrated);
    window.addEventListener(SOY_EVENT, onHydrated);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener("pa-auth-updated", onHydrated);
      window.removeEventListener(SOY_EVENT, onHydrated);
    };
  }, []);

  const baseUnit = visibleUnits.find(u => u.id === selectedUnitId) ?? visibleUnits[0] ?? COMPANY_UNITS[0];
  const effectiveCalRole: CalibrationUnitRole = getCalibrationRoleForUnit(activeUser, baseUnit.name);
  const allManagedUsers = useMemo(() => loadManagedUsers(), [authTick]);
  const liveUnitCount = allManagedUsers.filter(
    (u) => u.status === "Active" && u.company === baseUnit.name && !isExcludedFromAppraisalCalibration(u),
  ).length;
  const unit: CompanyUnit = { ...baseUnit, totalHC: liveUnitCount };
  const status = statusMap[selectedUnitId] ?? "pending";
  const ackInfo = acknowledgedMap[selectedUnitId];

  const employees = useMemo(
    () => generateEmployees(selectedUnitId, unit.totalHC),
    [selectedUnitId, unit.totalHC, statusMap, authTick],
  );

  // Daftar user yang di-allow sebagai Approver & Mengetahui pada Unit Usaha ini
  const unitApproverEntries = useMemo(
    () => resolveUnitCalibrationApproverUsers(unit.name, allManagedUsers),
    [unit.name, allManagedUsers],
  );

  // Keputusan per user pada Unit Usaha ini (sinkron dengan state lama bila belum tercatat per user)
  const resolvedApproverRows = useMemo(() => {
    const unitDecs = userDecisionsMap[selectedUnitId] ?? {};
    return unitApproverEntries.map(({ user: u, calRole }, idx) => {
      const key = u.employeeId.trim().toUpperCase();
      const explicitDec = unitDecs[key];
      let decisionStatus: "approved" | "acknowledged" | "revision" | "pending" = explicitDec?.status ?? "pending";
      let decisionAt = explicitDec?.at ?? "—";
      if (!explicitDec) {
        if (calRole === "mengetahui" && ackInfo && ackInfo.by.trim().toLowerCase() === u.name.trim().toLowerCase()) {
          decisionStatus = "acknowledged";
          decisionAt = ackInfo.at;
        } else if (
          calRole === "approver" &&
          status === "approved" &&
          unitApproverEntries.filter((e) => e.calRole === "approver").length === 1
        ) {
          decisionStatus = "approved";
          decisionAt = approvedAtMap[selectedUnitId] ?? "—";
        } else if (
          calRole === "approver" &&
          status === "revision" &&
          unitApproverEntries.filter((e) => e.calRole === "approver").length === 1
        ) {
          decisionStatus = "revision";
        }
      }
      return {
        no: idx + 1,
        employeeId: u.employeeId,
        name: u.name,
        position: u.position || "—",
        calRole,
        decisionStatus,
        decisionAt,
      };
    });
  }, [unitApproverEntries, userDecisionsMap, selectedUnitId, ackInfo, status, approvedAtMap]);

  const myApproverRow = useMemo(
    () =>
      resolvedApproverRows.find(
        (r) => r.employeeId.trim().toUpperCase() === activeUser.employeeId.trim().toUpperCase(),
      ),
    [resolvedApproverRows, activeUser.employeeId],
  );

  const allApproversCompleted = useMemo(() => {
    if (resolvedApproverRows.length === 0) return false;
    return resolvedApproverRows.every((r) =>
      r.calRole === "approver" ? r.decisionStatus === "approved" : r.decisionStatus === "acknowledged",
    );
  }, [resolvedApproverRows]);

  // Hitung Setting HC (HC Awal Tahun / SOY), Aktual HC (HC Akhir Tahun / EOY pre-calibration), Proposed HC (EOY post-calibration)
  const soyQuotaInfo = useMemo(() => {
    const defaultGrades = [
      { id: "1", grade: "A+", proporsi: "5%" },
      { id: "2", grade: "A",  proporsi: "15%" },
      { id: "3", grade: "B",  proporsi: "40%" },
      { id: "4", grade: "C",  proporsi: "25%" },
      { id: "5", grade: "D",  proporsi: "10%" },
      { id: "6", grade: "E",  proporsi: "5%" },
    ];
    const soyRec =
      getSoyApproval(selectedUnitId) ??
      Object.values(loadPersistedState<Record<string, { unitName?: string; snapshot?: SettingCompanyUnit }>>("calibration_soy_approvals_2026", {})).find(
        (r) => canonicalizeCompanyUnitName(r?.unitName) === unit.name,
      );
    if (soyRec?.snapshot) {
      const snap = soyRec.snapshot;
      const alloc = computeUnitQuotaAllocation({
        calibrationGrades: snap.calibrationGrades ?? defaultGrades,
        divisionProportions: snap.divisionProportions ?? [],
        departemenenProportions: snap.departemenenProportions ?? [],
        bagianProportions: snap.bagianProportions ?? [],
      });
      return {
        grades: snap.calibrationGrades ?? defaultGrades,
        targets: alloc.unitGradeTargets,
        soyTotalHC: alloc.totalHC,
      };
    }
    const savedUnits =
      loadPersistedState<SettingCompanyUnit[] | null>("calibration_hc_settings_2026", null) ??
      loadPersistedState<SettingCompanyUnit[] | null>("calibration_submitted_units", null) ??
      [];
    const foundUnit = Array.isArray(savedUnits)
      ? savedUnits.find((u) => u.id === selectedUnitId || canonicalizeCompanyUnitName(u.name) === unit.name)
      : undefined;
    if (foundUnit) {
      const grades = foundUnit.beginningGrades ?? foundUnit.calibrationGrades ?? defaultGrades;
      const baseDivs =
        foundUnit.divisionProportions && foundUnit.divisionProportions.length > 0
          ? foundUnit.divisionProportions.map((d) => ({
              ...d,
              hc: foundUnit.beginningHC ? foundUnit.beginningHC[d.id] ?? d.hc : d.hc,
              customQuotas: foundUnit.beginningHC ? foundUnit.beginningCustomQuotas?.[d.id] : d.customQuotas,
            }))
          : applyImportedEmployeesDistribution(foundUnit).divisionProportions;
      const baseDepts = (foundUnit.departemenenProportions ?? []).map((dep) => ({
        ...dep,
        hc: foundUnit.beginningHC ? foundUnit.beginningHC[dep.id] ?? dep.hc : dep.hc,
        customQuotas: foundUnit.beginningHC ? foundUnit.beginningCustomQuotas?.[dep.id] : dep.customQuotas,
      }));
      const baseBags = (foundUnit.bagianProportions ?? []).map((bag) => ({
        ...bag,
        hc: foundUnit.beginningHC ? foundUnit.beginningHC[bag.id] ?? bag.hc : bag.hc,
        customQuotas: foundUnit.beginningHC ? foundUnit.beginningCustomQuotas?.[bag.id] : bag.customQuotas,
      }));
      const alloc = computeUnitQuotaAllocation({
        calibrationGrades: grades,
        divisionProportions: baseDivs,
        departemenenProportions: baseDepts,
        bagianProportions: baseBags,
      });
      return {
        grades,
        targets: alloc.unitGradeTargets,
        soyTotalHC: alloc.totalHC,
      };
    }
    const fallbackSynced = applyImportedEmployeesDistribution({
      id: selectedUnitId,
      name: unit.name,
      code: unit.code,
      industry: "",
      calibrationGrades: defaultGrades,
      divisionProportions: [],
      departemenenProportions: [],
      bagianProportions: [],
    });
    const fallbackAlloc = computeUnitQuotaAllocation(fallbackSynced);
    return {
      grades: defaultGrades,
      targets: fallbackAlloc.unitGradeTargets,
      soyTotalHC: fallbackAlloc.totalHC,
    };
  }, [selectedUnitId, unit.name, unit.code, authTick]);

  const gradeDist  = useMemo(() => {
    return GRADE_KEYS.map((grade, i) => {
      const gDef = soyQuotaInfo.grades.find((g) => g.grade === grade) ?? soyQuotaInfo.grades[i];
      const gIdx = soyQuotaInfo.grades.findIndex((g) => g.grade === grade);
      const configuredPct = parseFloat(String(gDef?.proporsi ?? "0").replace("%", "")) || 0;
      const setting = gIdx >= 0 ? (soyQuotaInfo.targets[gIdx] ?? 0) : (soyQuotaInfo.targets[i] ?? 0);
      const aktual = employees.filter((e) => e.currentGrade === grade).length;
      const proposed = employees.filter((e) => e.proposedGrade === grade).length;
      return { grade, color: GRADE_COLORS[grade], configuredPct, setting, aktual, proposed };
    });
  }, [soyQuotaInfo, employees]);
  const divSummary = useMemo(() => getDivisionSummary(employees), [employees]);
  const deptSummary = useMemo(() => getDepartmentSummary(employees), [employees]);
  const [bellOpen, setBellOpen] = useState(false);

  const gradeChanges = useMemo(() => employees.filter(e => e.status !== "No Change"), [employees]);
  const totalEOYHC   = employees.length;
  const totalHC      = totalEOYHC;
  const totalSettingHC = gradeDist.reduce((s, g) => s + g.setting, 0);
  const totalAktualHC  = gradeDist.reduce((s, g) => s + g.aktual, 0);
  const totalChanged = gradeChanges.length;
  const totalUpgraded   = gradeChanges.filter(e => e.status === "Upgraded").length;
  const totalDowngraded = gradeChanges.filter(e => e.status === "Downgraded").length;

  const filteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.division.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  const filteredFinalEmps = useMemo(() => {
    const q = finalEmpSearch.toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q) ||
        e.division.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q),
    );
  }, [employees, finalEmpSearch]);

  const totalProposed = gradeDist.reduce((s, g) => s + g.proposed, 0);

  const approvedBySummary = useMemo(() => {
    const names = resolvedApproverRows
      .filter((r) => r.calRole === "approver" && r.decisionStatus === "approved")
      .map((r) => r.name);
    return names.length > 0 ? names.join(", ") : "—";
  }, [resolvedApproverRows]);

  const acknowledgedBySummary = useMemo(() => {
    const names = resolvedApproverRows
      .filter((r) => r.calRole === "mengetahui" && r.decisionStatus === "acknowledged")
      .map((r) => r.name);
    return names.length > 0 ? names.join(", ") : "—";
  }, [resolvedApproverRows]);

  const finalApprovedDateSummary = useMemo(() => {
    const approverDates = resolvedApproverRows
      .filter((r) => r.calRole === "approver" && r.decisionStatus === "approved" && r.decisionAt !== "—")
      .map((r) => r.decisionAt);
    if (approverDates.length > 0) return approverDates[approverDates.length - 1];
    return approvedAtMap[selectedUnitId] ?? ackInfo?.at ?? "—";
  }, [resolvedApproverRows, approvedAtMap, selectedUnitId, ackInfo]);

  const handleExportFinalExcel = () => {
    const headers = [
      "No",
      "ID Employee",
      "Division",
      "Department",
      "Position",
      "Final Score",
      "Final Grade",
      "Approved Date",
      "Approved By",
      "Acknowledged By",
    ];
    const gradeStyleMap: Record<string, { bg: string; fg: string }> = {
      "A+": { bg: "DCFCE7", fg: "047857" },
      A:    { bg: "DBEAFE", fg: "1D4ED8" },
      B:    { bg: "FEF3C7", fg: "B45309" },
      C:    { bg: "FFEDD5", fg: "C2410C" },
      D:    { bg: "FEE2E2", fg: "B91C1C" },
      E:    { bg: "FECACA", fg: "7F1D1D" },
    };
    const titleRow: StyledExcelCell[] = headers.map((_, idx) => ({
      value: idx === 0 ? `ALL EMPLOYEES IN CALIBRATION (FINAL) — ${unit.name.toUpperCase()} (2026)` : "",
      style: {
        bg: EXCEL_THEME.headerNavyBg,
        fg: EXCEL_THEME.white,
        bold: true,
        fontSize: 12,
        align: "left",
        vAlign: "center",
      },
    }));
    const headerRow: StyledExcelCell[] = headers.map((h) => ({
      value: h,
      style: {
        bg: EXCEL_THEME.headerSubNavyBg,
        fg: EXCEL_THEME.white,
        bold: true,
        align: "center",
        vAlign: "center",
        borderColor: "334155",
      },
    }));
    const dataRows: StyledExcelCell[][] = filteredFinalEmps.map((e, idx) => {
      const baseBg = idx % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
      const gs = gradeStyleMap[e.proposedGrade] ?? { bg: baseBg, fg: EXCEL_THEME.textDark };
      return [
        { value: idx + 1, style: { bg: baseBg, fg: EXCEL_THEME.headerNavyBg, bold: true, align: "center" } },
        { value: `${e.id} - ${e.name}`, style: { bg: baseBg, fg: EXCEL_THEME.textDark, bold: true, align: "left" } },
        { value: e.division || "—", style: { bg: baseBg, fg: EXCEL_THEME.textDark, align: "left" } },
        { value: e.department || "—", style: { bg: baseBg, fg: EXCEL_THEME.textDark, align: "left" } },
        { value: e.position || "—", style: { bg: baseBg, fg: EXCEL_THEME.textDark, align: "left" } },
        { value: `${e.proposedScore.toFixed(1)}%`, style: { bg: gs.bg, fg: gs.fg, bold: true, align: "right" } },
        { value: e.proposedGrade, style: { bg: gs.bg, fg: gs.fg, bold: true, align: "center" } },
        { value: finalApprovedDateSummary, style: { bg: baseBg, fg: EXCEL_THEME.textMuted, align: "center" } },
        { value: approvedBySummary, style: { bg: "ECFDF5", fg: "065F46", bold: true, align: "left" } },
        { value: acknowledgedBySummary, style: { bg: "F0F9FF", fg: "075985", bold: true, align: "left" } },
      ];
    });
    exportStyledXLSX(`Calibration_Final_${unit.code}_2026`, {
      sheetName: `Final ${unit.code}`,
      colWidths: [6, 30, 22, 24, 24, 14, 12, 24, 26, 26],
      rowHeights: { 0: 30, 1: 26 },
      merges: [{ sRow: 0, sCol: 0, eRow: 0, eCol: headers.length - 1 }],
      rows: [titleRow, headerRow, ...dataRows],
    });
  };

  const handleApprove = () => {
    const now = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
    const empKey = activeUser.employeeId.trim().toUpperCase();
    const nextUnitDecisions: Record<string, CalibrationUserDecision> = {
      ...(userDecisionsMap[selectedUnitId] ?? {}),
      [empKey]: {
        employeeId: activeUser.employeeId,
        name: activeUser.name || "Approver",
        position: activeUser.position || "",
        calRole: "approver",
        status: "approved",
        at: now,
      },
    };
    const nextAllDecisions = { ...userDecisionsMap, [selectedUnitId]: nextUnitDecisions };
    setUserDecisionsMap(nextAllDecisions);
    savePersistedState(CAL_USER_DECISIONS_KEY, nextAllDecisions);

    const approverUsers = unitApproverEntries.filter((e) => e.calRole === "approver");
    const allApproverUsersDone =
      approverUsers.length === 0 ||
      approverUsers.every((e) => nextUnitDecisions[e.user.employeeId.trim().toUpperCase()]?.status === "approved");

    const nextStatus = {
      ...statusMap,
      [selectedUnitId]: (allApproverUsersDone ? "approved" : "pending") as ApprovalStatus,
    };
    const nextApprovedAt = { ...approvedAtMap, [selectedUnitId]: now };
    setStatusMap(nextStatus);
    setApprovedAtMap(nextApprovedAt);
    savePersistedState("pa_bod_cal_status_map_v1", nextStatus, {
      kind: "calibration-adjustment",
      adjustmentKey: `bod-approval-${selectedUnitId}-2026`,
      unitName: unit.name,
      employeeId: "ALL",
      period: "2026",
      status: allApproverUsersDone ? "Approved" : "Pending",
      bodDecision: allApproverUsersDone ? "Approved" : "In Progress",
      bodNote: `Approved by ${activeUser.name} on ${now}`,
      data: { approvedAt: now, unitId: selectedUnitId, decisions: nextUnitDecisions },
      audit: {
        action: "Approve",
        module: "Performance Appraisal",
        subModule: "Calibration Approval",
        description: `${activeUser.name} approved Calibration results for ${unit.name} (${now})`,
      },
    });
    savePersistedState("pa_bod_cal_approved_at_v1", nextApprovedAt);
    setModal(null);
  };

  const handleRevision = () => {
    const now = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
    const empKey = activeUser.employeeId.trim().toUpperCase();
    const nextUnitDecisions: Record<string, CalibrationUserDecision> = {
      ...(userDecisionsMap[selectedUnitId] ?? {}),
      [empKey]: {
        employeeId: activeUser.employeeId,
        name: activeUser.name || "Approver",
        position: activeUser.position || "",
        calRole: "approver",
        status: "revision",
        at: now,
      },
    };
    const nextAllDecisions = { ...userDecisionsMap, [selectedUnitId]: nextUnitDecisions };
    setUserDecisionsMap(nextAllDecisions);
    savePersistedState(CAL_USER_DECISIONS_KEY, nextAllDecisions);

    const nextStatus = { ...statusMap, [selectedUnitId]: "revision" as ApprovalStatus };
    setStatusMap(nextStatus);
    savePersistedState("pa_bod_cal_status_map_v1", nextStatus, {
      kind: "calibration-adjustment",
      adjustmentKey: `bod-approval-${selectedUnitId}-2026`,
      unitName: unit.name,
      employeeId: "ALL",
      period: "2026",
      status: "Revision",
      bodDecision: "Revision",
      bodNote: "Returned for HR revision",
      data: { unitId: selectedUnitId, decisions: nextUnitDecisions },
      audit: {
        action: "Reject",
        module: "Performance Appraisal",
        subModule: "Calibration Approval",
        description: `${activeUser.name} requested revision on Calibration results for ${unit.name}`,
      },
    });
    setModal(null);
  };

  const handleAcknowledge = () => {
    const now = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
    const empKey = activeUser.employeeId.trim().toUpperCase();
    const nextUnitDecisions: Record<string, CalibrationUserDecision> = {
      ...(userDecisionsMap[selectedUnitId] ?? {}),
      [empKey]: {
        employeeId: activeUser.employeeId,
        name: activeUser.name || "Director",
        position: activeUser.position || "",
        calRole: "mengetahui",
        status: "acknowledged",
        at: now,
      },
    };
    const nextAllDecisions = { ...userDecisionsMap, [selectedUnitId]: nextUnitDecisions };
    setUserDecisionsMap(nextAllDecisions);
    savePersistedState(CAL_USER_DECISIONS_KEY, nextAllDecisions);

    const nextAck = {
      ...acknowledgedMap,
      [selectedUnitId]: { by: activeUser.name || "Director", at: now },
    };
    setAcknowledgedMap(nextAck);
    savePersistedState("pa_bod_cal_acknowledged_map_v1", nextAck, {
      kind: "kv-state",
      stateKey: "pa_bod_cal_acknowledged_map_v1",
      stateValue: nextAck,
      audit: {
        action: "Approve",
        module: "Performance Appraisal",
        subModule: "Calibration Approval (Mengetahui)",
        description: `${activeUser.name} acknowledged (Mengetahui) Calibration results for ${unit.name} (${now})`,
      },
    });
    setModal(null);
  };

  if (!canRoleAccessCalibrationApproval(activeUser.role)) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-600" />
          <p className="text-sm font-bold text-amber-900">Akses Halaman Terbatas</p>
          <p className="mt-1 text-xs text-amber-800">
            Halaman Calibration Approval — Adjustment (EOY) hanya dapat diakses oleh role Director, DirectorNonOpr, BOD, Administrator, dan HR ICF.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[#1A284F]">Calibration Approval — Adjustment (EOY)</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <p className="text-sm text-gray-500">Performance Year 2026 · Director / BOD Review</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          {allApproversCompleted ? (
            <span className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Finalized ({finalApprovedDateSummary})
            </span>
          ) : status === "approved" ? (
            <span className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Approved on {approvedAtMap[selectedUnitId]}
            </span>
          ) : null}
          {status === "revision" && (
            <span className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-4 py-2 rounded-xl">
              <RotateCcw className="w-4 h-4" /> Revision Requested
            </span>
          )}
          {ackInfo && (
            <span className="flex items-center gap-2 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold px-4 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Diketahui oleh {ackInfo.by} ({ackInfo.at})
            </span>
          )}
          </div>
        </div>

        {/* ── Company Unit Selector ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Company Unit</p>
          <div className="flex flex-wrap gap-2">
            {visibleUnits.map(u => {
              const s = statusMap[u.id] ?? "pending";
              return (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUnitId(u.id); setEmpSearch(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    selectedUnitId === u.id
                      ? "bg-[#1A284F] text-white border-[#1A284F] shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#1A284F]/30 hover:bg-[#1A284F]/5"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  {u.name}
                  {s === "approved" && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                  {s === "revision" && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                  {s === "pending"  && <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Unit info */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ["Unit Code", unit.code],
              ["HC Awal (SOY) / Akhir (EOY)", `${totalSettingHC} SOY · ${totalEOYHC} EOY`],
              ["Submitted by", unit.submittedBy],
              ["Submitted at", unit.submittedAt],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                <p className="font-semibold text-gray-800">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stat Cards (Analytics Dashboard Format) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AnalyticsStatCard
            index={0}
            tone="navy"
            title="Total Employees"
            value={totalEOYHC}
            subtitle={`HC Akhir Tahun (EOY) · SOY ${totalSettingHC}`}
            icon={<Users className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={1}
            tone="plum"
            title="Grade Changes"
            value={totalChanged}
            subtitle={`${totalUpgraded} naik · ${totalDowngraded} turun`}
            icon={<RefreshCw className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={2}
            tone="emerald"
            title="Upgraded"
            value={totalUpgraded}
            subtitle="Karyawan mengalami kenaikan grade"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <AnalyticsStatCard
            index={3}
            tone="rose"
            title="Downgraded"
            value={totalDowngraded}
            subtitle="Karyawan mengalami penurunan grade"
            icon={<TrendingDown className="w-4 h-4" />}
          />
        </div>

        {/* ── Grade Distribution ── */}
        <Section
          title="Grade Distribution"
          subtitle="Setting HC (HC Awal Tahun / SOY) vs Aktual HC (HC Akhir Tahun / EOY sebelum kalibrasi) vs Proposed HC (EOY setelah kalibrasi)"
          action={<BellCurveTagButton onClick={() => setBellOpen(true)} label="Bell Curve: Aktual vs Calibration" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Grade</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Setting HC</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Setting %</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Aktual HC</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Aktual %</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-[#1A284F]">Proposed HC</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-[#1A284F]">Proposed %</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-6">Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gradeDist.map(row => {
                  const sPct = totalSettingHC > 0 ? ((row.setting / totalSettingHC) * 100).toFixed(1) : row.configuredPct.toFixed(1);
                  const aPct = totalAktualHC > 0 ? ((row.aktual / totalAktualHC) * 100).toFixed(1) : "0.0";
                  const pPct = totalProposed > 0 ? ((row.proposed / totalProposed) * 100).toFixed(1) : "0.0";
                  const diff = row.proposed - row.aktual;
                  return (
                    <tr key={row.grade} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-6">
                        <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white text-xs font-black" style={{ background: row.color }}>{row.grade}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600 tabular-nums text-xs">{row.setting}</td>
                      <td className="py-3 px-4 text-center text-gray-400 tabular-nums text-xs">{sPct}%</td>
                      <td className="py-3 px-4 text-center text-gray-700 font-medium tabular-nums text-xs">{row.aktual}</td>
                      <td className="py-3 px-4 text-center text-gray-400 tabular-nums text-xs">{aPct}%</td>
                      <td className="py-3 px-4 text-center font-bold tabular-nums text-xs" style={{ color: row.color }}>{row.proposed}</td>
                      <td className="py-3 px-4 text-center tabular-nums text-xs" style={{ color: row.color }}>{pPct}%</td>
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(parseFloat(pPct), 100)}%`, background: row.color }} />
                          </div>
                          {diff !== 0 && (
                            <span className={`text-[10px] font-bold ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="py-3 pr-6 text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-700">{totalSettingHC}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-500">100%</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-700">{totalAktualHC}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-500">{totalAktualHC > 0 ? "100%" : "0%"}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-[#1A284F]">{totalProposed}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-[#1A284F]">{totalProposed > 0 ? "100%" : "0%"}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* ── Division Summary ── */}
        <Section title="Calibration Summary by Division" subtitle="Headcount and grade change breakdown per division" defaultOpen={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Division</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Total HC</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-emerald-600">Upgraded</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">No Change</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-red-500">Downgraded</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-6">Dominant Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {divSummary.map(div => (
                  <tr key={div.division} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-6 font-medium text-gray-900 text-sm">{div.division}</td>
                    <td className="py-3 px-4 text-center text-gray-700 font-semibold tabular-nums text-xs">{div.hc}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {div.upgraded > 0 ? <span className="text-emerald-600 font-bold">+{div.upgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500 tabular-nums text-xs">{div.noChange}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {div.downgraded > 0 ? <span className="text-red-500 font-bold">−{div.downgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 pl-6">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: GRADE_COLORS[div.gradeTop] ?? "#6B7280" }}>
                        {div.gradeTop}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Department Summary ── */}
        <Section title="Calibration Summary by Departement" subtitle="Headcount and grade change breakdown per departement" defaultOpen={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Departement</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Division</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Total HC</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-emerald-600">Upgraded</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">No Change</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-red-500">Downgraded</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-6">Dominant Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deptSummary.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-xs text-gray-400">Belum ada data departemen.</td></tr>
                )}
                {deptSummary.map(dep => (
                  <tr key={`${dep.division}-${dep.department}`} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-6 font-medium text-gray-900 text-sm">{dep.department}</td>
                    <td className="py-3 pr-6 text-xs text-gray-500">{dep.division}</td>
                    <td className="py-3 px-4 text-center text-gray-700 font-semibold tabular-nums text-xs">{dep.hc}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {dep.upgraded > 0 ? <span className="text-emerald-600 font-bold">+{dep.upgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500 tabular-nums text-xs">{dep.noChange}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {dep.downgraded > 0 ? <span className="text-red-500 font-bold">−{dep.downgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 pl-6">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: GRADE_COLORS[dep.gradeTop] ?? "#6B7280" }}>
                        {dep.gradeTop}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {bellOpen && (
          <GradeBellCurveModal
            mode="compare"
            title={`Grade Distribution (Bell Curve) — ${unit.name}`}
            subtitle={`Setting SOY (${totalSettingHC} HC) vs Aktual EOY (${totalAktualHC} HC) vs Proposed EOY (${totalProposed} HC)`}
            calibrationStatusBadge={
              allApproversCompleted || status === "approved"
                ? { label: "Final", tone: "final" }
                : { label: "Current", tone: "current" }
            }
            rows={gradeDist.map((g) => ({
              grade: g.grade,
              color: g.color,
              target: totalSettingHC > 0 ? (g.setting / totalSettingHC) * 100 : g.configuredPct,
              targetCount: g.setting,
              actual: totalAktualHC > 0 ? (g.aktual / totalAktualHC) * 100 : 0,
              actualCount: g.aktual,
              calibration: totalProposed > 0 ? (g.proposed / totalProposed) * 100 : 0,
              calibrationCount: g.proposed,
            }))}
            onClose={() => setBellOpen(false)}
          />
        )}

        {/* ── Grade Changes ── */}
        <Section title={`Grade Changes — ${totalChanged} Employees`} subtitle="Employees whose calibration grade differs from their PA result" defaultOpen={false}>
          {gradeChanges.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No grade changes for this unit.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-3">ID</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-4">Employee</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Division</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Department</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Position</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">Before</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">After</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">Dir.</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-3">Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gradeChanges.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-3 text-xs font-mono text-gray-400">{row.id}</td>
                      <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap text-sm">{row.name}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.division}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.department}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.position}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: row.currentColor }}>{row.currentGrade}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: row.proposedColor }}>{row.proposedGrade}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.status === "Upgraded" ? <span className="text-emerald-600 font-black">↑</span> : <span className="text-red-500 font-black">↓</span>}
                      </td>
                      <td className="py-3 pl-3 text-xs text-gray-500 max-w-[220px]">{row.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── All Employees in Calibration (Proposed) ── */}
        <Section title={`All Employees in Calibration (Proposed) — ${unit.name}`} subtitle={`${employees.length} employees shown · search by name, ID, or department`} defaultOpen={false}>
          <div className="mb-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="Search employee, ID, division, department..."
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 bg-white"
            />
          </div>
          <div className="overflow-x-auto">
            <div className="max-h-[480px] overflow-y-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">No.</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">ID</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Employee</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Division</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Department</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Position</th>
                    <th className="text-right text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Current Score</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Current Grade</th>
                    <th className="text-right text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Proposed Score</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Proposed Grade</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredEmps.length === 0 ? (
                    <tr><td colSpan={11} className="py-10 text-center text-gray-400">No employees match your search.</td></tr>
                  ) : filteredEmps.map((e, idx) => (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="py-2.5 px-3 text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-400">{e.id}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">{e.name}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.division}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.department}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.position}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: e.currentColor }}>{e.currentScore.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ color: e.currentColor }}>{e.currentGrade}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: e.proposedColor }}>{e.proposedScore.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ color: e.proposedColor }}>{e.proposedGrade}</td>
                      <td className="py-2.5 px-3 text-center">
                        {e.status === "Upgraded"   && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">↑ Upgraded</span>}
                        {e.status === "Downgraded" && <span className="bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">↓ Downgraded</span>}
                        {e.status === "No Change"  && <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ── All Employees in Calibration (Final) — hanya muncul jika semua Approver & Mengetahui selesai ── */}
        {allApproversCompleted && (
          <Section
            title={`All Employees in Calibration (Final) — ${unit.name}`}
            subtitle={`Seluruh Approver & Mengetahui pada ${unit.name} telah menyelesaikan persetujuan · ${employees.length} karyawan difinalisasi`}
            defaultOpen={true}
            action={
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> Finalized
              </span>
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={finalEmpSearch}
                  onChange={(e) => setFinalEmpSearch(e.target.value)}
                  placeholder="Cari karyawan, ID, divisi, departemen, posisi..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleExportFinalExcel}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white px-4 py-2.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Excel (.xlsx)
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#1A284F] text-white">
                    <tr>
                      <th className="py-3 px-3 text-center font-semibold whitespace-nowrap w-12">No</th>
                      <th className="py-3 px-3.5 text-left font-semibold whitespace-nowrap">ID Employee</th>
                      <th className="py-3 px-3 text-left font-semibold whitespace-nowrap">Division</th>
                      <th className="py-3 px-3 text-left font-semibold whitespace-nowrap">Department</th>
                      <th className="py-3 px-3 text-left font-semibold whitespace-nowrap">Position</th>
                      <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">Final Score</th>
                      <th className="py-3 px-3 text-center font-semibold whitespace-nowrap">Final Grade</th>
                      <th className="py-3 px-3 text-center font-semibold whitespace-nowrap">Approved Date</th>
                      <th className="py-3 px-3 text-left font-semibold whitespace-nowrap">Approved By</th>
                      <th className="py-3 px-3 text-left font-semibold whitespace-nowrap">Acknowledged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFinalEmps.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          Tidak ada karyawan yang sesuai pencarian.
                        </td>
                      </tr>
                    ) : (
                      filteredFinalEmps.map((e, idx) => (
                        <tr
                          key={e.id}
                          className={`transition-colors hover:bg-indigo-50/40 ${
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/65"
                          }`}
                        >
                          <td className="py-3 px-3 text-center font-semibold text-slate-500 tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span className="inline-block font-mono text-[11px] font-bold text-[#1A284F] bg-[#1A284F]/[0.07] px-2 py-0.5 rounded">
                              {e.id}
                            </span>
                            <span className="block font-semibold text-slate-800 mt-0.5">{e.name}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{e.division || "—"}</td>
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{e.department || "—"}</td>
                          <td className="py-3 px-3 text-slate-700 font-medium whitespace-nowrap">{e.position || "—"}</td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span
                              className="inline-block px-2.5 py-0.5 rounded-md font-extrabold tabular-nums border"
                              style={{
                                color: e.proposedColor,
                                backgroundColor: `${e.proposedColor}14`,
                                borderColor: `${e.proposedColor}40`,
                              }}
                            >
                              {e.proposedScore.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className="inline-flex items-center justify-center min-w-[30px] h-7 px-2 rounded-lg text-white text-xs font-black shadow-2xs"
                              style={{ background: e.proposedColor }}
                            >
                              {e.proposedGrade}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center text-slate-500 whitespace-nowrap">{finalApprovedDateSummary}</td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {approvedBySummary !== "—" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                {approvedBySummary}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {acknowledgedBySummary !== "—" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 px-2.5 py-0.5 font-semibold">
                                <UserCheck className="w-3 h-3 text-sky-600 shrink-0" />
                                {acknowledgedBySummary}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}

        {/* ── Table Approver — {{Unit Usaha}} ── */}
        <Section
          title={`Table Approver - ${unit.name}`}
          subtitle="Daftar pejabat yang diberikan wewenang sebagai Approver dan Mengetahui pada unit usaha ini"
          defaultOpen={true}
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  <th className="py-3 px-3 text-center font-semibold w-12">No</th>
                  <th className="py-3 px-3.5 text-left font-semibold whitespace-nowrap">ID Karyawan</th>
                  <th className="py-3 px-3.5 text-left font-semibold whitespace-nowrap">Nama Pejabat</th>
                  <th className="py-3 px-3.5 text-left font-semibold whitespace-nowrap">Jabatan / Posisi</th>
                  <th className="py-3 px-3.5 text-center font-semibold whitespace-nowrap">Peran Calibration</th>
                  <th className="py-3 px-3.5 text-center font-semibold whitespace-nowrap">Status</th>
                  <th className="py-3 px-3.5 text-center font-semibold whitespace-nowrap">Tanggal Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolvedApproverRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Belum ada user yang di-setup sebagai Approver atau Mengetahui untuk {unit.name} pada User Management.
                    </td>
                  </tr>
                ) : (
                  resolvedApproverRows.map((row, idx) => (
                    <tr
                      key={row.employeeId}
                      className={`transition-colors hover:bg-indigo-50/30 ${
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-semibold text-slate-500 tabular-nums">{row.no}</td>
                      <td className="py-3 px-3.5 font-mono font-semibold text-[#1A284F] whitespace-nowrap">{row.employeeId}</td>
                      <td className="py-3 px-3.5 font-semibold text-slate-900 whitespace-nowrap">{row.name}</td>
                      <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">{row.position}</td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {row.calRole === "approver" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Approver
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-0.5 text-[11px] font-bold text-sky-700">
                            <UserCheck className="w-3 h-3" /> Mengetahui
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {row.decisionStatus === "approved" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100/70 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {row.decisionStatus === "acknowledged" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-100/70 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                            <CheckCircle2 className="w-3 h-3" /> Acknowledged
                          </span>
                        )}
                        {row.decisionStatus === "revision" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                            <RotateCcw className="w-3 h-3" /> Revision
                          </span>
                        )}
                        {row.decisionStatus === "pending" && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center text-slate-500 whitespace-nowrap">{row.decisionAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Approval Action ── */}
        {visibleUnits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            Akun Anda disetup <strong>Tidak Terlibat (Kosong)</strong> pada Peran Approval Calibration untuk seluruh Unit Usaha.
          </div>
        ) : effectiveCalRole === "readonly" || effectiveCalRole === "" ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 flex items-center gap-3 text-sm text-slate-600">
            <Eye className="w-5 h-5 text-slate-500 shrink-0" />
            <span>
              Akun Anda memiliki akses <strong>Read Only</strong> pada Calibration Approval untuk unit <strong>{unit.name}</strong> (tanpa tombol tindakan).
            </span>
          </div>
        ) : effectiveCalRole === "mengetahui" ? (
          myApproverRow?.decisionStatus === "acknowledged" ? (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6 flex gap-4">
              <CheckCircle2 className="w-6 h-6 text-sky-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sky-800">Calibration Telah Diketahui (Acknowledged) — {unit.name}</p>
                <p className="text-sm text-sky-700 mt-0.5">
                  Diketahui oleh <strong>{myApproverRow.name}</strong> pada {myApproverRow.decisionAt}.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[#1A284F]">Director Mengetahui (Acknowledge) — {unit.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Akun Anda di-setup sebagai <strong>Mengetahui</strong> pada Calibration Approval unit ini.
                </p>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-sky-800">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-500" />
                Klik tombol Mengetahui di bawah untuk mengonfirmasi bahwa Anda telah meninjau dan mengetahui hasil kalibrasi untuk {unit.name}.
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setModal("mengetahui")}
                  className="flex items-center gap-2 bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mengetahui Calibration
                </button>
              </div>
            </div>
          )
        ) : myApproverRow?.decisionStatus === "approved" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-800">Calibration Approved — {unit.name}</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Disetujui oleh <strong>{myApproverRow.name}</strong> pada {myApproverRow.decisionAt}.
                {allApproversCompleted
                  ? " Seluruh Approver & Mengetahui telah selesai; tabel Final telah tersedia di atas."
                  : " Menunggu penyelesaian dari pejabat Approver / Mengetahui lainnya pada tabel di atas."}
              </p>
            </div>
          </div>
        ) : status === "revision" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
            <RotateCcw className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Revision Requested — {unit.name}</p>
              <p className="text-sm text-amber-700 mt-0.5">HR has been notified to review and resubmit the calibration results for this unit.</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#1A284F]">Director Approval — {unit.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review the calibration results above and take action</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModal("revision")}
                className="flex items-center gap-2 border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
                <RotateCcw className="w-4 h-4" /> Revision
              </button>
              <button onClick={() => setModal("approve")}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors shadow-sm">
                <CheckCircle2 className="w-4 h-4" /> Approve Calibration
              </button>
            </div>
          </div>
        )}

      </div>

      {modal === "approve"   && <ApproveModal  unitName={unit.name} onConfirm={handleApprove}  onCancel={() => setModal(null)} />}
      {modal === "revision"  && <RevisionModal unitName={unit.name} onConfirm={handleRevision} onCancel={() => setModal(null)} />}
      {modal === "mengetahui" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Konfirmasi Mengetahui Calibration</h3>
                <p className="text-xs text-gray-500">{unit.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Apakah Anda yakin ingin mengonfirmasi <strong>Mengetahui (Acknowledge)</strong> atas hasil kalibrasi untuk unit <strong>{unit.name}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                onClick={handleAcknowledge}
                className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-[#1A284F] text-white rounded-xl hover:bg-[#243869]"
              >
                <CheckCircle2 className="w-4 h-4" /> Ya, Mengetahui
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
