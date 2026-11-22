import {
  getModuleWeightFraction,
  resolveGradeForScore,
  SCORE_WEIGHT_EVENT,
} from "../shared/scoringWeightStore";
// @refresh reset
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useRouteTab } from "../../utils/useRouteTab";
import { getPenilai1ScoreAsPercent, subscribeScores } from "../supervisor/managementInterviewScoreStore";
import { Save, Edit2, Building2, ChevronRight, ArrowLeft, CheckCircle2, Send, Clock, X, ChevronDown, ChevronUp, Lock, RotateCcw, Paperclip, Upload, MessageSquare, Eye, Check, Users, Target, Activity, Award } from "lucide-react";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Dot } from "recharts";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../utils/excelUtils";
import { applyYearEndScorePolicy, isYearEndInactive, loadYearEndState } from "../shared/yearEndWorkflowStore";
import { useAppraisalRevision } from "../shared/useAppraisalRevision";
import { getApproverNotesHistory, normalizeEmployeeId } from "../shared/appraisalWorkflowStore";
import { loadAllIcfProjectsByEmployee } from "../../store/projectStore";
import { loadRCASubmissions, type StoredRCASubmission } from "../shared/rcaStore";
import { UnifiedRCADetailTable, isStoredRcaSubmissionClosed } from "../../components/UnifiedRCADetailTable";
import { loadPersistedState, safeSetLocalJson, savePersistedState, uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { isExcludedFromAppraisalCalibration, loadManagedUsers, resolveEffectiveUserGrouping, resolveUserAllowedModules, useAuthStore } from "../../store/authStore";
import { getLiveTransactionalEmployees } from "../../data/mockEmployees";
import {
  applyImportedEmployeesDistribution,
  apportionLargestRemainder,
  computeUnitQuotaAllocation,
  orgSlug,
  type BagianProportion,
  type CalibrationGrade,
  type CompanyUnit,
  type DepartemenenProportion,
  type DivisionProportion,
} from "./CalibrationSetting";
import { getSoyApproval, loadSoyEmployeeSnapshot, SOY_EVENT } from "../../store/calibrationSoyStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageMode = "edit" | "preview" | "submitted";

// ─── Employee adjustment types ────────────────────────────────────────────────

type EmpLevel = "Operasional" | "Pengawas" | "Kepala Bagian" | "Kepala Departemen" | "Kepala Divisi";

type EvidenceFile = { name: string; objectUrl: string; mimeType: string };

type EmpScores = {
  kpi: number;
  smartGoals: number;
  appraisalForm: number;
  managerialSkill: number | null;
  managementInterview: number | null;
  projectOutsideJobScope: number;
};

type Employee = {
  id: string; employeeId: string; name: string; nip: string; level: EmpLevel;
  groupingLabel: string;
  positionName: string;
  allowedModules?: string[];
  bagianId: string; departemenenId: string; divisiId: string;
  companyUnit?: string;
  divisionName?: string;
  departmentName?: string;
  bagianName?: string;
  base: EmpScores;
  kpiIsYtd?: boolean;
  kpiFullyValidated?: boolean;
  isCalibrationReady?: boolean;
};

// ─── Default data ─────────────────────────────────────────────────────────────

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%"  },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%"  },
];

// ─── Employee level weights & helpers ─────────────────────────────────────────

const LEVEL_WEIGHTS: Record<EmpLevel, Record<keyof EmpScores, number>> = {
  "Operasional":       { kpi:.50, smartGoals:.20, appraisalForm:.15, managerialSkill:0,   managementInterview:0,   projectOutsideJobScope:.15 },
  "Pengawas":          { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.15, managementInterview:0,   projectOutsideJobScope:.15 },
  "Kepala Bagian":     { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.15, managementInterview:0,   projectOutsideJobScope:.15 },
  "Kepala Departemen": { kpi:.40, smartGoals:.15, appraisalForm:.15, managerialSkill:.20, managementInterview:0,   projectOutsideJobScope:.10 },
  "Kepala Divisi":     { kpi:.40, smartGoals:.10, appraisalForm:.10, managerialSkill:.20, managementInterview:.10, projectOutsideJobScope:.10 },
};

function resolveEmployeeWeights(
  emp: Pick<Employee, "level" | "groupingLabel" | "companyUnit" | "allowedModules">,
): Record<keyof EmpScores, number> {
  const unitName = emp.companyUnit || "PT RSUP (Industry)";
  const allowed = emp.allowedModules ?? [];
  const hasKpi = allowed.length === 0 || allowed.includes("KPI (Setting/Measurement)");
  const hasSg = allowed.length === 0 || allowed.includes("SMART Goals (Setting/Measurement)");
  const hasAf = allowed.length === 0 || allowed.includes("Appraisals Form");
  const hasPrj = allowed.length === 0 || allowed.includes("Project Outside Job Scope");
  const hasMs = allowed.includes("Managerial Skill");
  const hasMi = allowed.includes("Management Interview");

  const kpi = hasKpi ? getModuleWeightFraction(unitName, emp.groupingLabel, "KPI", 0) : 0;
  const smartGoals = hasSg ? getModuleWeightFraction(unitName, emp.groupingLabel, "SMART Goals", 0) : 0;
  const appraisalForm = hasAf ? getModuleWeightFraction(unitName, emp.groupingLabel, "Appraisal Form", 0) : 0;
  const projectOutsideJobScope = hasPrj ? getModuleWeightFraction(unitName, emp.groupingLabel, "Project Outside Job Scope", 0) : 0;
  const managerialSkill = hasMs ? getModuleWeightFraction(unitName, emp.groupingLabel, "Managerial Skill", 0) : 0;
  const configuredMi = getModuleWeightFraction(unitName, emp.groupingLabel, "Management Interview", 0);
  const managementInterview = hasMi ? (configuredMi > 0 ? configuredMi : 0.1) : 0;

  const sum = kpi + smartGoals + appraisalForm + managerialSkill + managementInterview + projectOutsideJobScope;
  if (!Number.isFinite(sum) || sum <= 0) return LEVEL_WEIGHTS[emp.level];
  return { kpi, smartGoals, appraisalForm, managerialSkill, managementInterview, projectOutsideJobScope };
}

function calcEmployeeFinalScore(
  emp: Pick<Employee, "level" | "groupingLabel" | "companyUnit" | "allowedModules">,
  s: EmpScores,
): number {
  const w = resolveEmployeeWeights(emp);
  const raw = (s.kpi ?? 0) * w.kpi
    + (s.smartGoals ?? 0) * w.smartGoals
    + (s.appraisalForm ?? 0) * w.appraisalForm
    + (s.managerialSkill ?? 0) * w.managerialSkill
    + (s.managementInterview ?? 0) * w.managementInterview
    + (s.projectOutsideJobScope ?? 0) * w.projectOutsideJobScope;
  return Number.isFinite(raw) ? raw : 0;
}

const GRADE_HEX: Record<string, string> = { "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B" };
function gradeFromScore(n: number, companyName?: string): { grade: string; color: string } {
  const grade = resolveGradeForScore(n, companyName);
  return { grade, color: GRADE_HEX[grade] ?? "#6B7280" };
}

const GRADE_SCORE_PILL_STYLE: Record<string, { pill: string; text: string }> = {
  "A+": { pill: "bg-emerald-50/95 text-emerald-700 border-emerald-200/90", text: "text-emerald-700" },
  A:    { pill: "bg-blue-50/95 text-blue-700 border-blue-200/90",         text: "text-blue-700"    },
  B:    { pill: "bg-amber-50/95 text-amber-700 border-amber-200/90",      text: "text-amber-700"   },
  C:    { pill: "bg-orange-50/95 text-orange-700 border-orange-200/90",   text: "text-orange-700"  },
  D:    { pill: "bg-red-50/95 text-red-600 border-red-200/90",            text: "text-red-600"     },
  E:    { pill: "bg-rose-50/95 text-rose-800 border-rose-200/90",         text: "text-rose-800"    },
};

function scoreBadgeStyle(score: number, companyName?: string): { grade: string; pill: string; text: string } {
  const safeScore = Number.isFinite(score) ? score : 0;
  const { grade } = gradeFromScore(safeScore, companyName);
  const theme = GRADE_SCORE_PILL_STYLE[grade] ?? { pill: "bg-slate-100 text-slate-700 border-slate-200", text: "text-slate-700" };
  return { grade, ...theme };
}

const SOFT_ROW_PALETTE = [
  "bg-sky-50/55 hover:bg-sky-100/65",
  "bg-emerald-50/45 hover:bg-emerald-100/55",
  "bg-amber-50/40 hover:bg-amber-100/55",
  "bg-cyan-50/50 hover:bg-cyan-100/60",
];

const SUPPORTING_TAG_THEMES: Record<string, { active: string; inactive: string }> = {
  mangkir: {
    active: "bg-rose-600 text-white border-rose-600 shadow-xs",
    inactive: "bg-rose-50/85 text-rose-700 border-rose-200 hover:bg-rose-100/80 hover:border-rose-300",
  },
  pelanggaran: {
    active: "bg-orange-600 text-white border-orange-600 shadow-xs",
    inactive: "bg-orange-50/85 text-orange-700 border-orange-200 hover:bg-orange-100/80 hover:border-orange-300",
  },
  kecelakaanKerja: {
    active: "bg-amber-600 text-white border-amber-600 shadow-xs",
    inactive: "bg-amber-50/85 text-amber-800 border-amber-200 hover:bg-amber-100/80 hover:border-amber-300",
  },
  projek: {
    active: "bg-teal-600 text-white border-teal-600 shadow-xs",
    inactive: "bg-teal-50/85 text-teal-700 border-teal-200 hover:bg-teal-100/80 hover:border-teal-300",
  },
};


function buildLiveCalibrationEmployees(): Employee[] {
  const users = loadManagedUsers().filter((u) => u.status === "Active" && !isExcludedFromAppraisalCalibration(u));
  const liveEmps = getLiveTransactionalEmployees();
  return users.map((u) => {
    const live = liveEmps.find((e) => e.id.toLowerCase() === u.employeeId.toLowerCase());
    const orgDivKey = (u.division || "Umum").trim();
    const orgDeptKey = (u.department || orgDivKey).trim();
    const orgBagKey = (u.bagian || orgDeptKey).trim();
    const divisiId = `div_${orgSlug(orgDivKey)}`;
    const deptId = `dep_${orgSlug(orgDivKey)}__${orgSlug(orgDeptKey)}`;
    const bagianId = `bag_${orgSlug(orgDivKey)}__${orgSlug(orgDeptKey)}__${orgSlug(orgBagKey)}`;

    const actualDivName = (u.division || "").trim() || "—";
    const actualDeptName = (u.department || "").trim() || "—";
    const actualBagianName = (u.bagian || "").trim() || "—";
    const actualPositionName = (u.position || "").trim() || "—";

    const grouping = resolveEffectiveUserGrouping(u);
    const allowedModules = resolveUserAllowedModules(u);
    const level: EmpLevel =
      grouping === "Ka./Wa.Ka.Div ke atas"
        ? "Kepala Divisi"
        : grouping === "Ka./Wa.Ka.Dept"
        ? "Kepala Departemen"
        : grouping === "Ka./Wa.Ka.Bagian"
        ? "Kepala Bagian"
        : grouping === "Ka./Wa.Ka.Seksi"
        ? "Pengawas"
        : "Operasional";
    const hasMgr = allowedModules.includes("Managerial Skill");
    const hasIntv = allowedModules.includes("Management Interview");
    return {
      id: `emp-${u.employeeId}`,
      employeeId: u.employeeId,
      name: u.name,
      nip: u.regNo || u.employeeId,
      level,
      groupingLabel: grouping,
      positionName: actualPositionName,
      allowedModules,
      bagianId,
      departemenenId: deptId,
      divisiId,
      companyUnit: u.company,
      divisionName: actualDivName,
      departmentName: actualDeptName,
      bagianName: actualBagianName,
      base: {
        kpi: live?.kpi.score ?? 0,
        smartGoals: live?.smartGoals.score ?? 0,
        appraisalForm: live ? Math.round((live.formA.score + live.formB.score + live.formC.score) / 3) : 0,
        managerialSkill: hasMgr ? (live?.managerialSkill?.score ?? 0) : null,
        managementInterview: hasIntv ? (live?.managementInterview?.score ?? null) : null,
        projectOutsideJobScope: live?.project.score ?? 0,
      },
      kpiIsYtd: live?.kpiIsYtd ?? false,
      kpiFullyValidated: live?.kpiFullyValidated ?? false,
      isCalibrationReady: live?.isCalibrationReady ?? false,
    };
  });
}

const ALL_EMPLOYEES: Employee[] = new Proxy([] as Employee[], {
  get(_target, prop, receiver) {
    const list = buildLiveCalibrationEmployees();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => ({
  id, name, code, industry,
  calibrationGrades: makeDefaultCalibrationGrades(),
  divisionProportions: [],
  departemenenProportions: [],
  bagianProportions: [],
});

const defaultCompanyUnits: CompanyUnit[] = [
  makeUnit("1", "PT RSUP (Industry)",          "RSUP-IND", "Industry"),
  makeUnit("2", "PT RSUP (Perkebunan)",        "RSUP-PKB", "Perkebunan"),
  makeUnit("3", "PT Pulau Sambu (Jakarta)",    "PS-JKT",   "Jakarta"),
  makeUnit("4", "PT Pulau Sambu (Guntung)",    "PS-GTG",   "Guntung"),
  makeUnit("5", "PT Pulau Sambu (Kuala Enok)", "PS-KE",    "Kuala Enok"),
  makeUnit("6", "PT RSTM",                     "RSTM",     ""),
  makeUnit("7", "PT GHS",                      "GHS",      ""),
  makeUnit("8", "PT RSUP ASD",                 "RSUP-ASD", ""),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeCalcs(hc: number, grades: CalibrationGrade[]): number[] {
  return grades.map(g => hc > 0 ? Math.round(hc * (parseFloat(g.proporsi) || 0) / 100) : 0);
}




// ─── Color tokens ─────────────────────────────────────────────────────────────
const SETTING_BG  = "bg-[#1A284F]";        // navy  – setting header
const ACTUAL_BG   = "bg-teal-700";          // teal  – actual header
const ACTUAL_CELL = "bg-teal-50";           // teal light – actual data cells

// ─── Submit Confirm Modal ─────────────────────────────────────────────────────

function SubmitConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Submit Calibration Adjustment</h3>
              <p className="text-xs text-gray-500 mt-0.5">This will send for Approval Management review</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Once submitted, you will not be able to edit the calibration adjustment until the approval is completed.
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <CheckCircle2 className="w-4 h-4" />Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section wrapper ─────────────────────────────────────────────

function CollapsibleSection({ title, subtitle, defaultOpen = true, actions, children }: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <button onClick={() => setOpen(v => !v)} className="flex-1 flex items-center justify-between hover:bg-gray-50/60 transition-colors text-left -mx-1 px-1 py-1 rounded-lg mr-2">
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 ml-4" />
            : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 ml-4" />}
        </button>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

// ─── Bell Curve Chart ─────────────────────────────────────────────────────────

function BellCurveChart({
  calibrationGrades,
  settingCounts,
  settingEoyCounts,
  actualCounts,
  calibratedCounts,
  hasCalibration,
}: {
  calibrationGrades: CalibrationGrade[];
  settingCounts: number[];
  settingEoyCounts?: number[];
  actualCounts?: number[];
  calibratedCounts?: number[];
  hasCalibration: boolean;
}) {
  const gradeHeaders  = calibrationGrades.map(g => g.grade);

  const settingTotals = calibrationGrades.map((_, idx) => settingCounts[idx] ?? 0);
  const settingEoyTotals = calibrationGrades.map((_, idx) => settingEoyCounts?.[idx] ?? 0);
  const actualTotals = actualCounts ? actualCounts : calibrationGrades.map(() => 0);
  const calTotals = hasCalibration && calibratedCounts
    ? calibratedCounts
    : calibrationGrades.map(() => 0);

  const totalSetting = settingTotals.reduce((a, b) => a + b, 0);
  const totalSettingEoy = settingEoyTotals.reduce((a, b) => a + b, 0);
  const totalActual  = actualTotals.reduce((a, b) => a + b, 0);
  const totalCal     = calTotals.reduce((a, b) => a + b, 0);

  const data = gradeHeaders.map((grade, i) => ({
    grade,
    "Setting (SOY)":   totalSetting > 0 ? parseFloat(((settingTotals[i] / totalSetting) * 100).toFixed(1)) : 0,
    "Setting (EOY)":   totalSettingEoy > 0 ? parseFloat(((settingEoyTotals[i] / totalSettingEoy) * 100).toFixed(1)) : (parseFloat(String(calibrationGrades[i]?.proporsi ?? "0").replace("%", "")) || 0),
    "Aktual":          totalActual  > 0 ? parseFloat(((actualTotals[i]  / totalActual)  * 100).toFixed(1)) : 0,
    "Kalibrasi (EOY)": hasCalibration && totalCal > 0 ? parseFloat(((calTotals[i] / totalCal) * 100).toFixed(1)) : 0,
    settingHC:    settingTotals[i],
    settingEoyHC: settingEoyTotals[i],
    actualHC:     actualTotals[i],
    calibratedHC: calTotals[i],
  }));

  const gradeColors: Record<string, string> = {
    "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const color = gradeColors[label] ?? "#6B7280";
    // Deduplicate — bars and lines both fire; keep unique dataKeys
    const seen = new Set<string>();
    const unique = payload.filter((p: any) => {
      if (seen.has(p.dataKey)) return false;
      seen.add(p.dataKey);
      return true;
    });
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-xs min-w-[215px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
          <span className="font-bold text-gray-800">Grade {label}</span>
        </div>
        {unique.map((p: any) => {
          const hc =
            p.dataKey === "Setting (SOY)"
              ? p.payload.settingHC
              : p.dataKey === "Setting (EOY)"
              ? p.payload.settingEoyHC
              : p.dataKey === "Aktual"
              ? p.payload.actualHC
              : p.payload.calibratedHC;
          return (
            <div key={p.dataKey} className="flex justify-between gap-4 mt-1">
              <span className="text-gray-500 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color ?? p.fill ?? p.stroke }} />
                {p.dataKey}
              </span>
              <span className="font-bold text-gray-800">
                {p.dataKey === "Kalibrasi (EOY)" && !hasCalibration ? (
                  <span className="text-gray-400 font-normal">Belum dikalibrasi</span>
                ) : (
                  <>
                    {p.value}%
                    <span className="text-gray-400 font-normal ml-1">({hc} orang)</span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const CustomBarShape = (props: any) => {
    const { x, y, width, height, fill } = props;
    if (height <= 0) return null;
    return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} ry={3} />;
  };

  const SettingDot = (props: any) => {
    const { cx, cy } = props;
    return <Dot cx={cx} cy={cy} r={5} fill="#06B6D4" stroke="#fff" strokeWidth={2} />;
  };

  const SettingEoyDot = (props: any) => {
    const { cx, cy } = props;
    return <Dot cx={cx} cy={cy} r={4.5} fill="#F59E0B" stroke="#fff" strokeWidth={2} />;
  };

  const AktualDot = (props: any) => {
    const { cx, cy } = props;
    return <Dot cx={cx} cy={cy} r={5} fill="#0D9488" stroke="#fff" strokeWidth={2} />;
  };

  const KalibrasiDot = (props: any) => {
    const { cx, cy } = props;
    if (!hasCalibration) return <Dot cx={cx} cy={cy} r={3.5} fill="#94A3B8" stroke="#fff" strokeWidth={1.5} />;
    return <Dot cx={cx} cy={cy} r={5} fill="#1A284F" stroke="#fff" strokeWidth={2} />;
  };

  const legendPayload = [
    { value: "Setting (SOY)",   type: "square" as const, color: "#06B6D4" },
    { value: "Setting (EOY)",   type: "square" as const, color: "#F59E0B" },
    { value: "Aktual",          type: "square" as const, color: "#0D9488" },
    { value: "Kalibrasi (EOY)", type: "square" as const, color: "#1A284F" },
  ];

  return (
    <CollapsibleSection
      title="Grade Distribution — Bell Curve"
      subtitle="Setting (SOY) vs Setting (EOY) vs Aktual vs Kalibrasi (EOY)"
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Chart */}
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={335}>
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 24, left: -8, bottom: 0 }}
              barSize={16}
              barGap={3}
              barCategoryGap="22%"
            >
              <CartesianGrid key="bc-grid" strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis key="bc-xaxis" dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#374151", fontWeight: 600 }} dy={6} />
              <YAxis key="bc-yaxis" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={v => `${v}%`} domain={[0, "auto"]} />
              <Tooltip key="bc-tooltip" content={<CustomTooltip />} cursor={{ fill: "rgba(26,40,79,0.04)" }} />
              <Legend
                key="bc-legend"
                payload={legendPayload}
                iconSize={10}
                formatter={(value) => <span className="text-xs text-gray-600 font-medium">{value}</span>}
              />
              {/* Bars */}
              <Bar key="bc-bar-setting"     dataKey="Setting (SOY)"   name="Setting (SOY)"   fill="#06B6D4" fillOpacity={0.26} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              <Bar key="bc-bar-setting-eoy" dataKey="Setting (EOY)"   name="Setting (EOY)"   fill="#F59E0B" fillOpacity={0.25} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              <Bar key="bc-bar-actual"      dataKey="Aktual"          name="Aktual"          fill="#0D9488" fillOpacity={0.24} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              <Bar key="bc-bar-cal"         dataKey="Kalibrasi (EOY)" name="Kalibrasi (EOY)" fill="#1A284F" fillOpacity={0.24} shape={<CustomBarShape />} isAnimationActive={false} legendType="none" />
              {/* Lines */}
              <Line key="bc-line-setting" type="monotone" dataKey="Setting (SOY)"   name="Setting (SOY)"   stroke="#06B6D4" strokeWidth={2.5} strokeDasharray="6 3" dot={<SettingDot />}   activeDot={{ r: 6 }} isAnimationActive={false} legendType="none" />
              <Line key="bc-line-setting-eoy" type="monotone" dataKey="Setting (EOY)" name="Setting (EOY)" stroke="#F59E0B" strokeWidth={2.5} strokeDasharray="6 3" dot={<SettingEoyDot />} activeDot={{ r: 6 }} isAnimationActive={false} legendType="none" />
              <Line key="bc-line-actual"  type="monotone" dataKey="Aktual"          name="Aktual"          stroke="#0D9488" strokeWidth={2.5}                       dot={<AktualDot />}    activeDot={{ r: 6 }} isAnimationActive={false} legendType="none" />
              <Line key="bc-line-cal"     type="monotone" dataKey="Kalibrasi (EOY)" name="Kalibrasi (EOY)" stroke={hasCalibration ? "#1A284F" : "#CBD5E1"} strokeWidth={hasCalibration ? 2.5 : 1.5} strokeDasharray={hasCalibration ? undefined : "3 3"} dot={<KalibrasiDot />} activeDot={hasCalibration ? { r: 6 } : false} isAnimationActive={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Info Grade di samping Bell Curve — sinkron dengan Setting (SOY), Setting (EOY), Aktual & Kalibrasi (EOY) */}
        <div className="w-full lg:w-96 xl:w-[420px] shrink-0 flex flex-col gap-2.5 justify-center">
          {data.map(d => {
            const comparePct = hasCalibration ? d["Kalibrasi (EOY)"] : d["Aktual"];
            const diffEoy = parseFloat((comparePct - d["Setting (EOY)"]).toFixed(1));
            const diffCalVsAct = hasCalibration ? d.calibratedHC - d.actualHC : 0;
            const color = gradeColors[d.grade] ?? "#6B7280";
            return (
              <div key={d.grade} className="flex items-center gap-3 bg-slate-50/85 rounded-xl px-3.5 py-2.5 border border-slate-200/80">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-xs"
                  style={{ background: color }}>{d.grade}</span>
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-4 gap-2 text-[11px] leading-snug">
                    <div>
                      <span className="block text-[10px] font-semibold text-cyan-600">Set. SOY</span>
                      <span className="font-bold text-cyan-600 tabular-nums">{d["Setting (SOY)"]}%</span>
                      <span className="block text-[10px] text-gray-400 tabular-nums">({d.settingHC} org)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-amber-600">Set. EOY</span>
                      <span className="font-bold text-amber-600 tabular-nums">{d["Setting (EOY)"]}%</span>
                      <span className="block text-[10px] text-gray-400 tabular-nums">({d.settingEoyHC} org)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-teal-700/85">Aktual</span>
                      <span className="font-bold text-teal-700 tabular-nums">{d["Aktual"]}%</span>
                      <span className="block text-[10px] text-gray-400 tabular-nums">({d.actualHC} org)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold text-[#1A284F]/85">Kalibrasi</span>
                      {hasCalibration ? (
                        <>
                          <span className="font-bold text-[#1A284F] tabular-nums">{d["Kalibrasi (EOY)"]}%</span>
                          <span className="block text-[10px] text-gray-400 tabular-nums">
                            ({d.calibratedHC}{diffCalVsAct !== 0 ? ` · ${diffCalVsAct > 0 ? `+${diffCalVsAct}` : diffCalVsAct}` : ""})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-gray-300 tabular-nums">0%</span>
                          <span className="block text-[10px] text-gray-300">—</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums ${
                  diffEoy > 0 ? "bg-emerald-50 text-emerald-700" : diffEoy < 0 ? "bg-rose-50 text-rose-600" : "bg-gray-100 text-gray-500"
                }`} title={hasCalibration ? "Selisih Kalibrasi (EOY) terhadap Setting (EOY)" : "Selisih Aktual terhadap Setting (EOY)"}>
                  {diffEoy > 0 ? `+${diffEoy}%` : diffEoy < 0 ? `${diffEoy}%` : "0%"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </CollapsibleSection>
  );
}

// ─── Grade Distribution with Actual column ────────────────────────────────────

function GradeDistributionTable({
  calibrationGrades,
  settingCounts,
  actualCounts,
}: {
  calibrationGrades: CalibrationGrade[];
  settingCounts: number[];
  actualCounts?: number[];
}) {
  const settingKaryawan = calibrationGrades.map((_, idx) => settingCounts[idx] ?? 0);

  const actualPerGrade = actualCounts
    ? actualCounts
    : calibrationGrades.map(() =>
        0
      );

  const totalSettingKaryawan = settingKaryawan.reduce((a, b) => a + b, 0);
  const totalActualKaryawan  = actualPerGrade.reduce((a, b) => a + b, 0);

  const totalProporsi = calibrationGrades.reduce((s, g) => {
    const n = parseFloat(g.proporsi.replace("%", "").trim());
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <CollapsibleSection
      title="Grade Distribution & Calibration"
      subtitle="Comparison between setting target and actual appraisal results"
      defaultOpen={false}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className={`border border-gray-300 px-4 py-3 text-center font-semibold text-white ${SETTING_BG}`}>GRADE</th>
              <th rowSpan={2} className={`border border-gray-300 px-4 py-3 text-center font-semibold text-white ${SETTING_BG}`}>PROPORSI</th>
              <th colSpan={1} className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${SETTING_BG} text-xs tracking-wide`}>SETTING (SOY)</th>
              <th colSpan={1} className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${ACTUAL_BG} text-xs tracking-wide`}>AKTUAL (EOY)</th>
            </tr>
            <tr>
              <th className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${SETTING_BG} text-xs`}>KARYAWAN</th>
              <th className={`border border-gray-300 px-4 py-2 text-center font-semibold text-white ${ACTUAL_BG} text-xs`}>KARYAWAN (Final)</th>
            </tr>
          </thead>
          <tbody>
            {calibrationGrades.map((grade, idx) => {
              const sKary = settingKaryawan[idx];
              const aKary = actualPerGrade[idx];
              const diff  = aKary - sKary;
              return (
                <tr key={grade.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-900">{grade.grade}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center text-gray-900">{grade.proporsi}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center bg-gray-50">
                    <span className="text-gray-900">{sKary > 0 ? sKary.toLocaleString() : "—"}</span>
                  </td>
                  <td className={`border border-gray-300 px-4 py-3 text-center ${ACTUAL_CELL}`}>
                    <span className="font-semibold text-teal-800">{aKary > 0 ? aKary.toLocaleString() : "—"}</span>
                    {sKary > 0 && aKary > 0 && (
                      <span className={`ml-1.5 text-[10px] font-bold ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-gray-400"}`}>
                        {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "="}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className={`${SETTING_BG} text-white font-semibold`}>
              <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
              <td className={`border border-gray-300 px-4 py-3 text-center ${totalProporsi !== 100 && totalProporsi > 0 ? "text-red-300" : ""}`}>
                {totalProporsi}%
              </td>
              <td className="border border-gray-300 px-4 py-3 text-center">{totalSettingKaryawan > 0 ? totalSettingKaryawan.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-4 py-3 text-center ${ACTUAL_BG}`}>{totalActualKaryawan > 0 ? totalActualKaryawan.toLocaleString() : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// ─── Proportion Table with Setting + Actual column groups ─────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  // Setting
  settingHC: number;
  settingShareKuota: string;
  settingCalcs: number[];
  // Actual
  actualHC: number;
  actualShareKuota: string;
  actualCalcs: number[];
};

function AdjustmentProportionTable({
  title, subtitle, rows, totalSettingHC, totalActualHC,
  gradeHeaders, showParent, parentHeader,
}: {
  title: string;
  subtitle: string;
  rows: PropRow[];
  totalSettingHC: number;
  totalActualHC: number;
  gradeHeaders: string[];
  showParent?: boolean;
  parentHeader?: string;
}) {
  const colName   = title.replace("Proportion per ", "").toUpperCase();
  const nGrades   = gradeHeaders.length;
  const colSpanEach = 2 + nGrades + 1; // HC + ShareKuota + grades + Jumlah

  // Footer totals
  const settingGradeTotals = gradeHeaders.map((_, i) => rows.reduce((s, r) => s + (r.settingCalcs[i] ?? 0), 0));
  const settingGrandTotal  = rows.reduce((s, r) => s + r.settingCalcs.reduce((a, v) => a + v, 0), 0);
  const actualGradeTotals  = gradeHeaders.map((_, i) => rows.reduce((s, r) => s + (r.actualCalcs[i] ?? 0), 0));
  const actualGrandTotal   = rows.reduce((s, r) => s + r.actualCalcs.reduce((a, v) => a + v, 0), 0);

  const thSetting = `border border-gray-300 px-2 py-2 text-center font-semibold text-white text-xs whitespace-nowrap ${SETTING_BG}`;
  const thActual  = `border border-gray-300 px-2 py-2 text-center font-semibold text-white text-xs whitespace-nowrap ${ACTUAL_BG}`;

  return (
    <CollapsibleSection title={title} subtitle={subtitle} defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* Row 1 – group labels */}
            <tr>
              {showParent && (
                <th rowSpan={2} className={`${thSetting} text-left`}>{parentHeader}</th>
              )}
              <th rowSpan={2} className={`${thSetting} text-left min-w-[140px]`}>{colName}</th>
              <th colSpan={colSpanEach} className={`border border-gray-300 px-3 py-2 text-center font-bold text-white text-xs tracking-wide ${SETTING_BG}`}>
                SETTING (SOY)
              </th>
              <th colSpan={colSpanEach} className={`border border-gray-300 px-3 py-2 text-center font-bold text-white text-xs tracking-wide ${ACTUAL_BG}`}>
                AKTUAL (EOY)
              </th>
            </tr>
            {/* Row 2 – sub-columns */}
            <tr>
              {/* Setting sub-cols */}
              <th className={thSetting}>HC</th>
              <th className={`${thSetting} whitespace-nowrap`}>Share Kuota</th>
              {gradeHeaders.map(g => <th key={`setting-h-${g}`} className={thSetting}>{g}</th>)}
              <th className={thSetting}>JUMLAH</th>
              {/* Actual sub-cols */}
              <th className={thActual}>HC</th>
              <th className={`${thActual} whitespace-nowrap`}>Share Kuota</th>
              {gradeHeaders.map(g => <th key={`actual-h-${g}`} className={thActual}>{g}</th>)}
              <th className={thActual}>JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const sTotal = row.settingCalcs.reduce((a, v) => a + v, 0);
              const aTotal = row.actualCalcs.reduce((a, v) => a + v, 0);
              return (
                <tr key={row.id} className="hover:bg-gray-50/70">
                  {showParent && (
                    <td className="border border-gray-300 px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">{row.parentLabel ?? "—"}</td>
                  )}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900 font-medium">{row.label}</td>
                  {/* Setting data cells */}
                  <td className="border border-gray-300 px-3 py-2.5 text-center text-gray-700 bg-gray-50">
                    {row.settingHC > 0 ? row.settingHC.toLocaleString() : "—"}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center text-gray-600 bg-gray-50">
                    {row.settingShareKuota || "—"}
                  </td>
                  {row.settingCalcs.map((v, i) => (
                    <td key={`s-${i}`} className="border border-gray-300 px-3 py-2.5 text-center text-gray-700 bg-gray-50">
                      {v > 0 ? v : "—"}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2.5 text-center font-medium text-gray-800 bg-gray-50">
                    {sTotal > 0 ? sTotal.toLocaleString() : "—"}
                  </td>
                  {/* Actual data cells */}
                  <td className={`border border-gray-300 px-3 py-2.5 text-center font-semibold text-teal-800 ${ACTUAL_CELL}`}>
                    {row.actualHC > 0 ? row.actualHC.toLocaleString() : "—"}
                  </td>
                  <td className={`border border-gray-300 px-3 py-2.5 text-center text-teal-700 ${ACTUAL_CELL}`}>
                    {row.actualShareKuota || "—"}
                  </td>
                  {row.actualCalcs.map((v, i) => (
                    <td key={`a-${i}`} className={`border border-gray-300 px-3 py-2.5 text-center text-teal-800 ${ACTUAL_CELL}`}>
                      {v > 0 ? v : "—"}
                    </td>
                  ))}
                  <td className={`border border-gray-300 px-3 py-2.5 text-center font-semibold text-teal-800 ${ACTUAL_CELL}`}>
                    {aTotal > 0 ? aTotal.toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
            {/* Footer row */}
            <tr className="font-semibold">
              {showParent && <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>—</td>}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>JUMLAH</td>
              {/* Setting footer */}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{totalSettingHC > 0 ? totalSettingHC.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>100%</td>
              {settingGradeTotals.map((t, i) => (
                <td key={`sf-${i}`} className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{t > 0 ? t.toLocaleString() : "—"}</td>
              ))}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${SETTING_BG}`}>{settingGrandTotal > 0 ? settingGrandTotal.toLocaleString() : "—"}</td>
              {/* Actual footer */}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{totalActualHC > 0 ? totalActualHC.toLocaleString() : "—"}</td>
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>100%</td>
              {actualGradeTotals.map((t, i) => (
                <td key={`af-${i}`} className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{t > 0 ? t.toLocaleString() : "—"}</td>
              ))}
              <td className={`border border-gray-300 px-3 py-3 text-center text-white ${ACTUAL_BG}`}>{actualGrandTotal > 0 ? actualGrandTotal.toLocaleString() : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// ─── Score Adjuster cell ──────────────────────────────────────────────────────


// ─── Lag-free Note Textarea (local draft + debounced Supabase persistence) ───

const CalibrationNoteInput = React.memo(function CalibrationNoteInput({
  empId,
  value,
  onCommit,
}: {
  empId: string;
  value: string;
  onCommit: (empId: string, nextVal: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const latestRef = useRef(value);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!dirtyRef.current && value !== latestRef.current) {
      latestRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirtyRef.current) {
      dirtyRef.current = false;
      onCommitRef.current(empId, latestRef.current);
    }
  }, [empId]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return (
    <textarea
      rows={2}
      placeholder="Tambahkan note kalibrasi..."
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        latestRef.current = next;
        dirtyRef.current = true;
        setDraft(next);
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          if (dirtyRef.current) {
            dirtyRef.current = false;
            onCommitRef.current(empId, latestRef.current);
          }
        }, 420);
      }}
      onBlur={flush}
      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1A284F]/30 placeholder-slate-400 text-slate-700"
    />
  );
});

// ─── Catatan Kalibrasi sub-panel ─────────────────────────────────────────────

function CatatanKalibrasi({ comment, evidenceFiles, onLightbox, emptyLabel }: {
  comment?: string;
  evidenceFiles?: EvidenceFile[];
  onLightbox: (f: EvidenceFile) => void;
  emptyLabel?: string;
}) {
  const trimmedComment = comment?.trim() ?? "";
  const hasContent = !!trimmedComment || !!(evidenceFiles?.length);
  if (!hasContent) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60 border border-gray-200 rounded-xl">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 shrink-0">Note</span>
        <p className="text-xs text-gray-500">{emptyLabel ?? "Tidak ada kalibrasi"}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {trimmedComment ? (
        <div className="bg-white/70 border border-amber-200 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Note</span>
          </div>
          <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{trimmedComment}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white/60 border border-gray-200 rounded-xl">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 shrink-0">Note</span>
          <p className="text-xs text-gray-500">{emptyLabel ?? "Tidak ada kalibrasi"}</p>
        </div>
      )}
      {evidenceFiles && evidenceFiles.length > 0 && (
        <div className="bg-white/70 border border-blue-200 rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-2">
            Bukti Pendukung ({evidenceFiles.length} file)
          </p>
          <div className="flex flex-wrap gap-2">
            {evidenceFiles.map((f, i) => {
              const isImage = f.mimeType.startsWith("image/");
              const isPdf   = f.mimeType === "application/pdf";
              return (
                <div key={i} className="flex flex-col gap-1">
                  {isImage ? (
                    <button onClick={() => onLightbox(f)}
                      className="w-16 h-16 rounded-xl overflow-hidden border-2 border-blue-200 hover:border-blue-400 transition-colors focus:outline-none">
                      <img src={f.objectUrl} alt={f.name} className="w-full h-full object-cover" />
                    </button>
                  ) : isPdf ? (
                    <button onClick={() => onLightbox(f)}
                      className="w-16 h-16 rounded-xl border-2 border-blue-200 hover:border-blue-400 transition-colors bg-red-50 flex flex-col items-center justify-center gap-1 focus:outline-none">
                      <Paperclip className="w-5 h-5 text-red-400" />
                      <span className="text-[9px] text-red-500 font-semibold">PDF</span>
                    </button>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-blue-100 bg-blue-50 flex flex-col items-center justify-center gap-1">
                      <Paperclip className="w-5 h-5 text-blue-300" />
                      <span className="text-[9px] text-blue-400 font-semibold uppercase">
                        {f.name.split(".").pop()?.slice(0, 4) ?? "file"}
                      </span>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-500 truncate max-w-[64px] text-center">{f.name}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Supporting Data Helpers ──────────────────────────────────────────────────
// Data kedisiplinan, pelanggaran, dan kecelakaan kerja bersumber dari HRIS yang belum terintegrasi,
// sehingga bernilai null (ditampilkan "—"). Jumlah project dihitung dari data Project Outside Job Scope.

const KEDISIPLINAN_LABELS = ["Mangkir", "Terlambat", "Istirahat Cepat", "Pulang Istirahat Terlambat"];

function empKedisiplinan(_emp: Employee): Array<{ label: string; value: number | null }> {
  return KEDISIPLINAN_LABELS.map((label) => ({ label, value: null }));
}
function empPelanggaran(_emp: Employee): number | null { return null; }
function empKecelakaanKerja(_emp: Employee): number | null { return null; }
function empProject(emp: Employee): number {
  const byEmp = loadAllIcfProjectsByEmployee();
  const norm = normalizeEmployeeId(emp.employeeId);
  const state = byEmp[norm] ?? byEmp[emp.employeeId];
  return Array.isArray(state?.rows) ? state.rows.length : 0;
}

const SUPPORTING_COLUMNS = [
  { key: "mangkir", label: "Mangkir", value: (emp: Employee): number | null => empKedisiplinan(emp).find((item) => item.label === "Mangkir")?.value ?? null },
  { key: "pelanggaran", label: "Pelanggaran", value: empPelanggaran },
  { key: "kecelakaanKerja", label: "Kecelakaan Kerja", value: empKecelakaanKerja },
  { key: "projek", label: "Projek", value: (emp: Employee): number | null => empProject(emp) },
] as const;

const NOTE_MODULES: Array<{ module: string; label: string }> = [
  { module: "KPI", label: "KPI" },
  { module: "SMART Goals", label: "SMART Goals" },
  { module: "Appraisal Form", label: "Appraisal Form" },
  { module: "Managerial Skill", label: "Managerial Skill" },
  { module: "Project", label: "Project Outside Job Scope" },
];

/** Catatan approver terbaru per modul (Measurement) dari riwayat keputusan approval karyawan. */
function empApproverNotes(emp: Employee): Array<{ module: string; note: string; by: string; date: string }> {
  const out: Array<{ module: string; note: string; by: string; date: string }> = [];
  for (const m of NOTE_MODULES) {
    const latest = getApproverNotesHistory(emp.employeeId, m.module, "measurement").find((e) => e.note?.trim());
    if (latest) out.push({ module: m.label, note: latest.note!.trim(), by: `${latest.approverName} (${latest.stageLabel})`, date: latest.date });
  }
  return out;
}

function loadEmployeeActualRCASubmissions(employeeId: string): StoredRCASubmission[] {
  return loadRCASubmissions(employeeId);
}

// ─── Appraisal Detail Drawer (slide-over) ─────────────────────────────────────

function AppraisalDetailCard({
  emp,
  effectiveScores,
  finalScore,
  comment,
  evidenceFiles,
  onClose,
}: {
  emp: Employee;
  effectiveScores: EmpScores;
  finalScore: number;
  comment?: string;
  evidenceFiles?: EvidenceFile[];
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [selYear,  setSelYear]  = useState(currentYear);
  const [lightbox, setLightbox] = useState<EvidenceFile | null>(null);
  const [showRCA,  setShowRCA]  = useState(false);
  const [rcaTick,  setRcaTick]  = useState(0);

  useEffect(() => {
    const onUpdate = () => setRcaTick((v) => v + 1);
    window.addEventListener("pa-db-hydrated", onUpdate);
    window.addEventListener("appraisal-updated", onUpdate);
    window.addEventListener(SCORE_WEIGHT_EVENT, onUpdate);
    return () => {
      window.removeEventListener("pa-db-hydrated", onUpdate);
      window.removeEventListener("appraisal-updated", onUpdate);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onUpdate);
    };
  }, []);

  const isCurrentYear = selYear === currentYear;
  const empWeights = resolveEmployeeWeights(emp);

  // Use effectiveScores (includes live MI score from BOD assessment) for current score
  const currentScore = isCurrentYear ? parseFloat(calcEmployeeFinalScore(emp, effectiveScores).toFixed(2)) : 0;
  const safeFinal    = Number.isFinite(finalScore) ? parseFloat(finalScore.toFixed(2)) : currentScore;
  const hasAdj       = isCurrentYear && Math.abs(safeFinal - currentScore) > 0.0001;
  const effectiveFinalScore = hasAdj ? safeFinal : currentScore;
  const diff         = parseFloat((effectiveFinalScore - currentScore).toFixed(2));

  const currentGrade = gradeFromScore(currentScore, emp.companyUnit);
  const finalGrade   = gradeFromScore(effectiveFinalScore, emp.companyUnit);

  const divisiName   = emp.divisionName && emp.divisionName !== "—" ? emp.divisionName : "—";
  const deptName     = emp.departmentName && emp.departmentName !== "—" ? emp.departmentName : "—";
  const bagianName   = emp.bagianName && emp.bagianName !== "—" ? emp.bagianName : "—";
  const posisiName   = emp.positionName && emp.positionName !== "—" ? emp.positionName : "—";

  // Supporting data (live / belum terintegrasi = null)
  const kedisiplinan       = empKedisiplinan(emp);
  const pelanggaran        = empPelanggaran(emp);
  const projectCount       = empProject(emp);
  const rcaSubmissions     = useMemo(
    () => loadEmployeeActualRCASubmissions(emp.employeeId),
    [emp.employeeId, rcaTick],
  );
  const approverNotes      = empApproverNotes(emp);

  // Grade order for color logic (index = rank, higher = better)
  const GRADE_ORDER = ["E", "D", "C", "B", "A", "A+"];
  const finalCardColors = (fScore: number, cScore: number, fGrade: { grade: string }, cGrade: { grade: string }) => {
    const scoreDiff   = parseFloat((fScore - cScore).toFixed(2));
    const scoreColor  = scoreDiff < 0 ? "#EF4444" : "#10B981";
    const fIdx = GRADE_ORDER.indexOf(fGrade.grade);
    const cIdx = GRADE_ORDER.indexOf(cGrade.grade);
    const gradeColor  = fIdx < cIdx ? "#EF4444" : "#10B981";
    return { scoreColor, gradeColor };
  };
  const openRcaSubs   = rcaSubmissions.filter((sub) => !isStoredRcaSubmissionClosed(sub));
  const closedRcaSubs = rcaSubmissions.filter((sub) => isStoredRcaSubmissionClosed(sub));
  const rcaOpen       = openRcaSubs.length;
  const rcaClosed     = closedRcaSubs.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[840px] max-h-[90vh] overflow-y-auto flex flex-col border border-gray-100">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-white flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0 text-lg font-black text-[#1A284F] select-none">
              {emp.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base leading-tight">{emp.name}</h2>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {emp.employeeId}{emp.companyUnit ? ` · ${emp.companyUnit}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {[currentYear, currentYear - 1].map(yr => (
                <button key={yr} onClick={() => setSelYear(yr)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${selYear === yr ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  {yr}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Org info */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[["Divisi", divisiName], ["Departemen", deptName], ["Bagian", bagianName], ["Posisi", posisiName]].map(([lbl, val]) => (
              <div key={lbl} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                <p className="font-semibold text-gray-800 text-xs">{val}</p>
              </div>
            ))}
          </div>

          {/* Year content */}
          {!isCurrentYear ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-gray-600">Belum ada data riwayat penilaian {selYear}</p>
              <p className="mt-1 text-xs text-gray-400">Riwayat tahun sebelumnya akan tampil setelah siklus PA tahun tersebut tersimpan di sistem.</p>
            </div>
          ) : (
            <>
              {/* Score panel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Current — {selYear}</p>
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-black tabular-nums" style={{ color: currentGrade.color }}>{currentScore.toFixed(1)}%</span>
                      <span className="text-lg font-black mb-0.5" style={{ color: currentGrade.color }}>{currentGrade.grade}</span>
                    </div>
                    <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(currentScore, 100)}%`, background: currentGrade.color }} />
                    </div>
                  </div>
                  {/* Score component breakdown */}
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-200">
                    {([
                      { label: "KPI",                   score: effectiveScores.kpi,                    weight: empWeights.kpi, isYtd: emp.kpiIsYtd },
                      { label: "Smart Goals",           score: effectiveScores.smartGoals,             weight: empWeights.smartGoals },
                      { label: "Appraisal Form",        score: effectiveScores.appraisalForm,          weight: empWeights.appraisalForm },
                      { label: "Managerial Skill",      score: effectiveScores.managerialSkill,        weight: empWeights.managerialSkill },
                      { label: "Management Interview",  score: effectiveScores.managementInterview,    weight: empWeights.managementInterview, isMI: true },
                      { label: "Project Outside",       score: effectiveScores.projectOutsideJobScope, weight: empWeights.projectOutsideJobScope },
                    ] as { label: string; score: number | null; weight: number; isMI?: boolean; isYtd?: boolean }[])
                      .filter(r => r.weight > 0)
                      .map(r => {
                        const modStyle = r.score != null ? scoreBadgeStyle(r.score, emp.companyUnit) : null;
                        return (
                        <div key={r.label} className="flex items-center justify-between text-[10px]">
                          <span className={`flex items-center gap-1 ${r.isMI ? "text-gray-700 font-semibold" : "text-gray-600"}`}>
                            {r.label}
                            {r.isYtd && (
                              <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[9px]">YTD</span>
                            )}
                            {r.isMI && r.score !== null && (
                              <span className="px-1 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[9px]">Assessment</span>
                            )}
                            <span className="text-gray-400">({Math.round(r.weight * 100)}%)</span>
                          </span>
                          {r.score != null && modStyle ? (
                            <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums text-[10px] ${modStyle.pill}`}>
                              {r.score.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="font-bold tabular-nums text-gray-300">—</span>
                          )}
                        </div>
                        );
                      })}
                  </div>
                </div>
                {(() => {
                  const { scoreColor, gradeColor } = finalCardColors(effectiveFinalScore, currentScore, finalGrade, currentGrade);
                  return (
                    <div className="bg-green-50/60 border border-green-200 rounded-2xl px-5 py-4 flex flex-col gap-3">
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Final — Setelah Kalibrasi</p>
                      <div>
                        <div className="flex items-end gap-2">
                          <span className="text-3xl font-black tabular-nums" style={{ color: hasAdj ? scoreColor : currentGrade.color }}>{effectiveFinalScore.toFixed(1)}%</span>
                          <span className="text-lg font-black mb-0.5" style={{ color: hasAdj ? gradeColor : currentGrade.color }}>{finalGrade.grade}</span>
                          {hasAdj && (
                            <span className="text-sm font-bold tabular-nums mb-0.5" style={{ color: scoreColor }}>
                              {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(effectiveFinalScore, 100)}%`, background: hasAdj ? scoreColor : currentGrade.color }} />
                        </div>
                        {hasAdj && finalGrade.grade !== currentGrade.grade && (
                          <p className="text-[10px] mt-1.5 font-semibold" style={{ color: gradeColor }}>
                            Grade berubah: <span className="line-through text-gray-400">{currentGrade.grade}</span> → {finalGrade.grade}
                          </p>
                        )}
                        {!hasAdj && <p className="text-[10px] mt-1.5 text-gray-400">Belum ada penyesuaian kalibrasi</p>}
                      </div>
                      <CatatanKalibrasi comment={comment} evidenceFiles={evidenceFiles} onLightbox={setLightbox} emptyLabel={hasAdj ? "Ada penyesuaian nilai final dari kalibrasi dengan mempertimbangkan supporting data yang dimiliki" : "Tidak ada kalibrasi"} />
                    </div>
                  );
                })()}
              </div>

              {/* ── Supporting Data ──────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-100 pb-2">Supporting Data</p>

                {/* 1. Project · Kedisiplinan · Pelanggaran */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Project · Kedisiplinan · Pelanggaran</p>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Project Outside Job Scope</p>
                      <p className="text-2xl font-black text-[#1A284F] tabular-nums">{projectCount}</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Other Project</p>
                      <p className="text-2xl font-black text-blue-600 tabular-nums">—</p>
                      <p className="text-[10px] text-gray-400">project</p>
                    </div>
                    <div className="bg-white rounded-xl border border-orange-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">Pelanggaran</p>
                      <p className="text-2xl font-black text-orange-600 tabular-nums">{pelanggaran ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">point matrix</p>
                    </div>
                    <div className="bg-white rounded-xl border border-amber-200 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Kecelakaan Kerja</p>
                      <p className="text-2xl font-black text-amber-700 tabular-nums">{empKecelakaanKerja(emp) ?? "—"}</p>
                      <p className="text-[10px] text-gray-400">kejadian</p>
                    </div>
                    <div className="bg-white rounded-xl border border-red-100 px-3 py-3 flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Kedisiplinan</p>
                      <p className="text-2xl font-black text-red-500 tabular-nums">{kedisiplinan.some((k) => k.value !== null) ? kedisiplinan.reduce((s, k) => s + (k.value ?? 0), 0) : "—"}</p>
                      <p className="text-[10px] text-gray-400">total kejadian</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {kedisiplinan.map(k => (
                      <div key={k.label} className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <span className="text-xs text-gray-600">{k.label}</span>
                        <span className="text-xs font-bold text-gray-800 tabular-nums">{k.value === null ? "—" : `${k.value}×`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Summary Notes from All Approvers */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Summary Note — All Approver · All Modul</p>
                  <div className="flex flex-col gap-2">
                    {approverNotes.length === 0 ? (
                      <p className="text-xs text-gray-400">Belum ada catatan approver pada modul Measurement.</p>
                    ) : approverNotes.map(n => (
                      <div key={n.module} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-[#1A284F] uppercase tracking-wide">{n.module}</span>
                        <p className="text-xs text-gray-700 leading-relaxed">{n.note}</p>
                        <span className="text-[10px] text-gray-400">{n.by} · {n.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. RCA */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">RCA (Root Cause Analysis)</p>
                    <button onClick={() => setShowRCA(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1A284F] hover:underline underline-offset-2 cursor-pointer">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white border border-amber-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">RCA Open</p>
                      <p className="text-2xl font-black text-amber-600 tabular-nums">{rcaOpen}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {openRcaSubs.length > 0 ? (
                          openRcaSubs.slice(0, 4).map((sub) => (
                            <span key={sub.id || sub.key} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 max-w-full truncate">
                              {sub.monthLabel || sub.periode}: {sub.kpiIndicator}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-gray-400">Tidak ada RCA berstatus Open.</span>
                        )}
                        {openRcaSubs.length > 4 && (
                          <span className="text-[10px] font-semibold text-amber-700">+{openRcaSubs.length - 4} lainnya</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">RCA Closed</p>
                      <p className="text-2xl font-black text-emerald-600 tabular-nums">{rcaClosed}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {closedRcaSubs.length > 0 ? (
                          closedRcaSubs.slice(0, 4).map((sub) => (
                            <span key={sub.id || sub.key} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 max-w-full truncate">
                              {sub.monthLabel || sub.periode}: {sub.kpiIndicator}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-gray-400">Tidak ada RCA berstatus Closed.</span>
                        )}
                        {closedRcaSubs.length > 4 && (
                          <span className="text-[10px] font-semibold text-emerald-700">+{closedRcaSubs.length - 4} lainnya</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* RCA detail modal */}
      {showRCA && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRCA(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Detail RCA — {emp.name} ({emp.employeeId})</h3>
                <p className="text-xs text-gray-500 mt-0.5">{divisiName} · {deptName} · {bagianName} · {posisiName} — {rcaOpen} Open · {rcaClosed} Closed</p>
              </div>
              <button onClick={() => setShowRCA(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {rcaSubmissions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-10 px-4 text-center text-xs text-gray-400">
                  Belum ada data RCA aktual untuk karyawan ini.
                </div>
              ) : (
                <UnifiedRCADetailTable
                  submissions={rcaSubmissions}
                  title="Root Cause Analysis (RCA) Aktual Karyawan"
                  subtitle="Rincian lengkap indikator KPI, masalah utama, analisis penyebab, rencana tindak lanjut, dan status penyelesaian."
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
            {lightbox.mimeType.startsWith("image/") ? (
              <img src={lightbox.objectUrl} alt={lightbox.name}
                className="max-h-[80vh] max-w-full rounded-xl shadow-2xl object-contain" />
            ) : (
              <iframe src={lightbox.objectUrl} title={lightbox.name}
                className="w-full h-[80vh] rounded-xl shadow-2xl bg-white" />
            )}
            <p className="mt-3 text-white/60 text-sm">{lightbox.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Employee Adjustment Section ──────────────────────────────────────────────

function EmployeeAdjustmentSection({
  unitName,
  calibrationGrades,
  soyTotalHC,
  soyGradeTargets,
  soyDivMap,
  soyDeptMap,
  soyBagianMap,
  soyDivMatrix,
  soyDeptMatrix,
  soyBagianMatrix,
  miScores,
  editMode,
  adjustments,
  setAdjustments,
  onStart,
  onSave,
  onCancel,
  pageMode,
  canSubmit,
  onSubmit,
}: {
  unitName?: string;
  calibrationGrades: CalibrationGrade[];
  soyTotalHC: number;
  soyGradeTargets: number[];
  soyDivMap: Record<string, number>;
  soyDeptMap: Record<string, number>;
  soyBagianMap: Record<string, number>;
  soyDivMatrix: Record<string, number[]>;
  soyDeptMatrix: Record<string, number[]>;
  soyBagianMatrix: Record<string, number[]>;
  miScores: Record<string, number | null>;
  editMode: boolean;
  adjustments: Record<string, number>;
  setAdjustments: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  onStart:     () => void;
  onSave:      () => void;
  onCancel:    () => void;
  pageMode:    PageMode;
  canSubmit:   boolean;
  onSubmit:    () => void;
}) {
  const [selDivisi,  setSelDivisi]  = useState("__all__");
  const [search, setSearch] = useState("");
  const [selDept,    setSelDept]    = useState("__all__");
  const [selBagian,  setSelBagian]  = useState("__all__");
  const [selPosisi,  setSelPosisi]  = useState("__all__");
  const [selGrade,   setSelGrade]   = useState("__all__");
  const [detailEmp,  setDetailEmp]  = useState<Employee | null>(null);
  const [comments,   setComments]   = useState<Record<string, string>>(() =>
    loadPersistedState("pa_calibration_adj_comments_v1", {})
  );
  const [evidence,   setEvidence]   = useState<Record<string, EvidenceFile[]>>(() =>
    loadPersistedState("pa_calibration_adj_evidence_v1", {})
  );
  const [openNotes,  setOpenNotes]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    const syncNotesAndEvidence = () => {
      setComments(loadPersistedState("pa_calibration_adj_comments_v1", {}));
      setEvidence(loadPersistedState("pa_calibration_adj_evidence_v1", {}));
    };
    window.addEventListener("pa-db-hydrated", syncNotesAndEvidence);
    return () => window.removeEventListener("pa-db-hydrated", syncNotesAndEvidence);
  }, []);
  const [sortKey,    setSortKey]    = useState<string | null>(null);
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("asc");
  const [freeEdit,   setFreeEdit]   = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});
  const supportingColumns = SUPPORTING_COLUMNS.filter((column) => visibleColumns[column.key]);

  const unitEmployees = useMemo(
    () => ALL_EMPLOYEES.filter((e) => !unitName || e.companyUnit === unitName),
    [unitName, adjustments],
  );

  const dynamicDivDefs = useMemo(() => {
    const map = new Map<string, string>();
    unitEmployees.forEach((e) => {
      const label = e.divisionName && e.divisionName !== "—" ? e.divisionName : "";
      if (e.divisiId && label && !map.has(e.divisiId)) map.set(e.divisiId, label);
    });
    return Array.from(map.entries()).map(([id, divisi]) => ({ id, divisi }));
  }, [unitEmployees]);

  const dynamicDeptDefs = useMemo(() => {
    const map = new Map<string, [string, string, string]>();
    unitEmployees.forEach((e) => {
      const label = e.departmentName && e.departmentName !== "—" ? e.departmentName : "";
      if (e.departemenenId && label && !map.has(e.departemenenId)) {
        map.set(e.departemenenId, [e.departemenenId, e.divisiId, label]);
      }
    });
    return Array.from(map.values());
  }, [unitEmployees]);

  const dynamicBagianDefs = useMemo(() => {
    const map = new Map<string, [string, string, string]>();
    unitEmployees.forEach((e) => {
      const label = e.bagianName && e.bagianName !== "—" ? e.bagianName : "";
      if (e.bagianId && label && !map.has(e.bagianId)) {
        map.set(e.bagianId, [e.bagianId, e.departemenenId, label]);
      }
    });
    return Array.from(map.values());
  }, [unitEmployees]);

  const deptOptions = dynamicDeptDefs.filter(([, divId]) =>
    selDivisi === "__all__" || divId === selDivisi,
  );

  const bagianOptions = dynamicBagianDefs.filter(([, deptId]) => {
    if (selDivisi !== "__all__") {
      const dept = dynamicDeptDefs.find(([dId]) => dId === deptId);
      if (dept && dept[1] !== selDivisi) return false;
    }
    if (selDept !== "__all__" && deptId !== selDept) return false;
    return true;
  });

  const getEffectiveScores = (emp: Employee): EmpScores => {
    if (emp.id in miScores && miScores[emp.id] !== null) {
      return applyYearEndScorePolicy(emp.employeeId, { ...emp.base, managementInterview: miScores[emp.id] });
    }
    return applyYearEndScorePolicy(emp.employeeId, emp.base);
  };
  const getBase  = (emp: Employee) => parseFloat(calcEmployeeFinalScore(emp, getEffectiveScores(emp)).toFixed(2));
  const getFinal = (emp: Employee) => {
    const adj = adjustments[emp.id];
    return typeof adj === "number" && Number.isFinite(adj) ? adj : getBase(emp);
  };

  const posisiOptions = useMemo(() => {
    const set = new Set<string>();
    unitEmployees.forEach((e) => {
      if (selDivisi !== "__all__" && e.divisiId !== selDivisi) return;
      if (selDept !== "__all__" && e.departemenenId !== selDept) return;
      if (selBagian !== "__all__" && e.bagianId !== selBagian) return;
      if (e.positionName && e.positionName !== "—") set.add(e.positionName);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
  }, [unitEmployees, selDivisi, selDept, selBagian]);

  const filtered = unitEmployees.filter(e => {
    if (isYearEndInactive(e.employeeId)) return false;
    const query = search.trim().toLowerCase();
    if (query && !e.name.toLowerCase().includes(query) && !e.employeeId.toLowerCase().replace(/-/g, "").includes(query.replace(/-/g, ""))) return false;
    if (selDivisi !== "__all__" && e.divisiId       !== selDivisi) return false;
    if (selDept   !== "__all__" && e.departemenenId !== selDept)   return false;
    if (selBagian !== "__all__" && e.bagianId       !== selBagian) return false;
    if (selPosisi !== "__all__" && e.positionName   !== selPosisi) return false;
    if (selGrade  !== "__all__" && gradeFromScore(getFinal(e), unitName || e.companyUnit).grade !== selGrade) return false;
    return true;
  });

  const adjustedCount = unitEmployees.filter(
    (e) => !isYearEndInactive(e.employeeId) && e.id in adjustments && Number.isFinite(adjustments[e.id]) && Math.abs(getFinal(e) - getBase(e)) > 0.0001,
  ).length;

  const setFinal = (emp: Employee, val: number) =>
    setAdjustments(prev => ({ ...prev, [emp.id]: parseFloat(val.toFixed(2)) }));

  const GRADE_ORDER: Record<string, number> = { "A+": 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let va = 0, vb = 0;
      if      (sortKey === "kpi")             { va = a.base.kpi;                    vb = b.base.kpi; }
      else if (sortKey === "project")         { va = a.base.projectOutsideJobScope; vb = b.base.projectOutsideJobScope; }
      else if (sortKey === "smartGoals")      { va = a.base.smartGoals;             vb = b.base.smartGoals; }
      else if (sortKey === "appraisalForm")   { va = a.base.appraisalForm;          vb = b.base.appraisalForm; }
      else if (sortKey === "managerialSkill") { va = a.base.managerialSkill ?? -1;  vb = b.base.managerialSkill ?? -1; }
      else if (sortKey === "mgmtInterview")   { va = getEffectiveScores(a).managementInterview ?? -1; vb = getEffectiveScores(b).managementInterview ?? -1; }
      else if (sortKey === "nilaiAkhir")      { va = getFinal(a);                   vb = getFinal(b); }
      else if (sortKey === "grade")           { va = GRADE_ORDER[gradeFromScore(getFinal(a), unitName || a.companyUnit).grade] ?? 0; vb = GRADE_ORDER[gradeFromScore(getFinal(b), unitName || b.companyUnit).grade] ?? 0; }
      else {
        const column = SUPPORTING_COLUMNS.find((item) => item.key === sortKey);
        if (column) { va = column.value(a) ?? -1; vb = column.value(b) ?? -1; }
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortKey, sortDir, adjustments]);

  const resetEmp = (id: string) => {
    setAdjustments(prev => { const n = { ...prev }; delete n[id]; return n; });
    setComments(prev => {
      const n = { ...prev };
      delete n[id];
      savePersistedState("pa_calibration_adj_comments_v1", n);
      return n;
    });
    setEvidence(prev => {
      const n = { ...prev };
      delete n[id];
      savePersistedState("pa_calibration_adj_evidence_v1", n);
      return n;
    });
    setOpenNotes(prev => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const commitNoteForEmp = useCallback((empId: string, nextVal: string) => {
    setComments((prev) => {
      if ((prev[empId] ?? "") === nextVal) return prev;
      const next = { ...prev, [empId]: nextVal };
      savePersistedState("pa_calibration_adj_comments_v1", next);
      return next;
    });
  }, []);

  const thBase = "border border-gray-600 px-2 py-2.5 text-center text-xs font-semibold text-white whitespace-nowrap";

  // Grade summary over filtered employees
  const GRADE_COLORS: Record<string, string> = {
    "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
  };
  const gradeKeys = useMemo(
    () => (calibrationGrades.length > 0 ? calibrationGrades.map((g) => g.grade) : ["A+", "A", "B", "C", "D", "E"]),
    [calibrationGrades],
  );
  const soyScopeStats = useMemo(() => {
    const weights = calibrationGrades.map((g) => parseFloat(g.proporsi) || 0);
    let hc = soyTotalHC;
    let targets = soyGradeTargets;
    if (selBagian !== "__all__") {
      hc = soyBagianMap[selBagian] ?? 0;
      targets = soyBagianMatrix[selBagian] ?? apportionLargestRemainder(hc, weights);
    } else if (selDept !== "__all__") {
      hc = soyDeptMap[selDept] ?? 0;
      targets = soyDeptMatrix[selDept] ?? apportionLargestRemainder(hc, weights);
    } else if (selDivisi !== "__all__") {
      hc = soyDivMap[selDivisi] ?? 0;
      targets = soyDivMatrix[selDivisi] ?? apportionLargestRemainder(hc, weights);
    } else if (selPosisi !== "__all__" || selGrade !== "__all__" || search.trim() !== "") {
      const snap = unitName ? loadSoyEmployeeSnapshot()[unitName] : undefined;
      if (Array.isArray(snap) && snap.length > 0) {
        const q = search.trim().toLowerCase();
        const matched = snap.filter((u) => {
          if (q && !u.name.toLowerCase().includes(q) && !u.employeeId.toLowerCase().replace(/-/g, "").includes(q.replace(/-/g, ""))) return false;
          if (selPosisi !== "__all__" && ((u.position || "").trim() || "—") !== selPosisi) return false;
          return true;
        });
        hc = matched.length;
        targets = apportionLargestRemainder(hc, weights);
      }
    }
    const byGrade: Record<string, number> = {};
    gradeKeys.forEach((g, idx) => {
      byGrade[g] = targets[idx] ?? 0;
    });
    return { hc, byGrade };
  }, [
    calibrationGrades,
    soyTotalHC,
    soyGradeTargets,
    soyDivMap,
    soyDeptMap,
    soyBagianMap,
    soyDivMatrix,
    soyDeptMatrix,
    soyBagianMatrix,
    selDivisi,
    selDept,
    selBagian,
    selPosisi,
    selGrade,
    search,
    unitName,
    gradeKeys,
  ]);

  const gradeSummaryBefore = filtered.reduce<Record<string, number>>((acc, emp) => {
    const { grade } = gradeFromScore(getBase(emp), unitName || emp.companyUnit);
    acc[grade] = (acc[grade] ?? 0) + 1;
    return acc;
  }, {});
  const gradeSummaryAfter = filtered.reduce<Record<string, number>>((acc, emp) => {
    const { grade } = gradeFromScore(getFinal(emp), unitName || emp.companyUnit);
    acc[grade] = (acc[grade] ?? 0) + 1;
    return acc;
  }, {});

  const handleExport = () => {
    const headers = ["Nama","ID Karyawan","Posisi","Divisi","Departemen","Bagian","KPI","Project","Smart Goals","Appraisal Form","Managerial Skill","Mgmt Interview","Nilai Akhir","Grade"];
    const rows = sorted.map(emp => {
      const divisiName = emp.divisionName && emp.divisionName !== "—" ? emp.divisionName : "";
      const deptName   = emp.departmentName && emp.departmentName !== "—" ? emp.departmentName : "";
      const bagianName = emp.bagianName && emp.bagianName !== "—" ? emp.bagianName : "";
      const posisiName = emp.positionName && emp.positionName !== "—" ? emp.positionName : "";
      const final      = getFinal(emp);
      return [
        emp.name, emp.employeeId, posisiName, divisiName, deptName, bagianName,
        emp.base.kpi, emp.base.projectOutsideJobScope,
        emp.base.smartGoals, emp.base.appraisalForm,
        emp.base.managerialSkill ?? "", getEffectiveScores(emp).managementInterview ?? "",
        final.toFixed(2), gradeFromScore(final, unitName || emp.companyUnit).grade,
      ];
    });
    exportXLSX("Calibration_Adjustment.xlsx", headers, rows);
  };

  const handleImport = (file: File) => {
    parseXLSX(file).then(({ headers, rows }) => {
      const employeeIdIdx = headers.findIndex((header) => /id\s*karyawan|employee\s*id/i.test(header));
      const nipIdx = employeeIdIdx >= 0 ? employeeIdIdx : headers.findIndex((header) => /nip/i.test(header));
      const finalIdx = headers.findIndex(h => /nilai.akhir/i.test(h));
      if (nipIdx < 0 || finalIdx < 0) return;
      setAdjustments(prev => {
        const next = { ...prev };
        rows.forEach(row => {
          const nip   = row[nipIdx]?.trim();
          const val   = parseFloat(row[finalIdx]);
          const emp = ALL_EMPLOYEES.find((entry) => employeeIdIdx >= 0 ? entry.employeeId.replace("-", "") === nip?.replace("-", "") : entry.nip === nip);
          if (emp && !isNaN(val)) next[emp.id] = val;
        });
        return next;
      });
    });
  };

  const hcDelta = filtered.length - soyScopeStats.hc;

  return (
    <CollapsibleSection
      title="Employee Performance Calibration Adjustment"
      defaultOpen={true}
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-5 pb-5 border-b border-gray-100">
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <label htmlFor="calibration-employee-search" className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Search</label>
          <input id="calibration-employee-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama atau ID Karyawan..." className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20" />
        </div>
        {[
          {
            label: "Divisi", value: selDivisi,
            options: [["__all__","Semua Divisi"], ...dynamicDivDefs.map(d => [d.id, d.divisi])],
            onChange: (v: string) => { setSelDivisi(v); setSelDept("__all__"); setSelBagian("__all__"); setSelPosisi("__all__"); },
          },
          {
            label: "Departemen", value: selDept,
            options: [["__all__","Semua Departemen"], ...deptOptions.map(([id,,name]) => [id,name])],
            onChange: (v: string) => { setSelDept(v); setSelBagian("__all__"); },
          },
          {
            label: "Bagian", value: selBagian,
            options: [["__all__","Semua Bagian"], ...bagianOptions.map(([id,,name]) => [id,name])],
            onChange: (v: string) => setSelBagian(v),
          },
          {
            label: "Posisi", value: selPosisi,
            options: [["__all__","Semua Posisi"], ...posisiOptions.map(p => [p, p])],
            onChange: (v: string) => setSelPosisi(v),
          },
          {
            label: "Grade", value: selGrade,
            options: [["__all__","Semua Grade"], ...["A+","A","B","C","D","E"].map(g => [g, `Grade ${g}`])],
            onChange: (v: string) => setSelGrade(v),
          },
        ].map(({ label, value, options, onChange }) => (
          <div key={label} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
            <div className="relative">
              <select value={value} onChange={e => onChange(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 min-w-[180px] cursor-pointer">
                {options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>
        ))}
        {(search || selDivisi !== "__all__" || selDept !== "__all__" || selBagian !== "__all__" || selPosisi !== "__all__" || selGrade !== "__all__") && (
          <button onClick={() => { setSearch(""); setSelDivisi("__all__"); setSelDept("__all__"); setSelBagian("__all__"); setSelPosisi("__all__"); setSelGrade("__all__"); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors self-end">
            <X className="w-3.5 h-3.5" />Clear Filter
          </button>
        )}
        {adjustedCount > 0 && (
          <button onClick={() => {
            const unitIds = new Set(unitEmployees.map((e) => e.id));
            setAdjustments((prev) => {
              const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !unitIds.has(k)));
              savePersistedState("pa_calibration_adj_scores_v1", next);
              return next;
            });
            setComments((prev) => {
              const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !unitIds.has(k)));
              savePersistedState("pa_calibration_adj_comments_v1", next);
              return next;
            });
            setEvidence((prev) => {
              const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !unitIds.has(k)));
              savePersistedState("pa_calibration_adj_evidence_v1", next);
              return next;
            });
          }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors self-end">
            <RotateCcw className="w-3.5 h-3.5" />Reset Semua ({adjustedCount})
          </button>
        )}
      </div>

      {/* 5 Summary cards — 1 baris proporsional dengan format Analytics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(135px,0.9fr)_minmax(135px,0.9fr)_minmax(215px,1.7fr)_minmax(215px,1.7fr)_minmax(215px,1.7fr)] gap-3 mb-4 items-stretch">
        {/* 1. Total Karyawan (SOY) */}
        <AnalyticsStatCard
          index={0}
          compact
          tone="navy"
          title="Total Karyawan (SOY)"
          value={soyScopeStats.hc}
          subtitle="Setting (SOY)"
          icon={<Users className="w-4 h-4" />}
        />

        {/* 2. Total Karyawan (EOY) */}
        <AnalyticsStatCard
          index={1}
          compact
          tone="teal"
          title="Total Karyawan (EOY)"
          value={filtered.length}
          subtitle={`${hcDelta === 0 ? "Sama dengan SOY" : `${hcDelta > 0 ? `+${hcDelta}` : hcDelta} vs SOY`}${adjustedCount > 0 ? ` · ${adjustedCount} dikalibrasi` : ""}`}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />

        {/* 3, 4, 5. Distribusi Grade — Setting (SOY), Aktual, Kalibrasi (EOY) */}
        {([
          {
            key: "soy",
            title: "Distribusi Grade — Setting (SOY)",
            tone: "teal" as AnalyticsCardTone,
            icon: <Target className="w-4 h-4" />,
            getCount: (g: string) => soyScopeStats.byGrade[g] ?? 0,
            getDiff: (_g: string) => 0,
            showDiff: false,
          },
          {
            key: "aktual",
            title: "Distribusi Grade — Aktual",
            tone: "emerald" as AnalyticsCardTone,
            icon: <Activity className="w-4 h-4" />,
            getCount: (g: string) => gradeSummaryBefore[g] ?? 0,
            getDiff: (_g: string) => 0,
            showDiff: false,
          },
          {
            key: "kalibrasi",
            title: "Distribusi Grade — Kalibrasi (EOY)",
            tone: "plum" as AnalyticsCardTone,
            icon: <Award className="w-4 h-4" />,
            getCount: (g: string) => (adjustedCount > 0 ? gradeSummaryAfter[g] ?? 0 : 0),
            getDiff: (g: string) => (gradeSummaryAfter[g] ?? 0) - (gradeSummaryBefore[g] ?? 0),
            showDiff: adjustedCount > 0,
          },
        ]).map((card, cIdx) => {
          const spec = ANALYTICS_CARD_TONES[card.tone];
          return (
            <div
              key={card.key}
              style={{ animationDelay: `${(cIdx + 2) * 50}ms` }}
              className={`group relative overflow-hidden bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-3.5 min-h-[116px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion`}
            >
              <div
                className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                style={{ backgroundColor: `${spec.accentHex}0D` }}
              />
              <div className="flex items-start justify-between gap-2 relative z-10 mb-2">
                <p className="text-[11px] font-medium text-gray-500 leading-snug line-clamp-2" title={card.title}>
                  {card.title}
                </p>
                <div
                  className="w-8 h-8 rounded-lg text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                  style={{ backgroundColor: spec.accentHex }}
                >
                  {card.icon}
                </div>
              </div>
              <div className="grid grid-cols-6 gap-1 relative z-10">
                {gradeKeys.map((g) => {
                  const cnt = card.getCount(g);
                  const diff = card.getDiff(g);
                  return (
                    <div key={g} className="flex flex-col items-center bg-white/85 border border-white/90 rounded-lg py-1 px-0.5 shadow-2xs">
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white leading-none"
                        style={{ background: GRADE_COLORS[g] ?? "#6B7280" }}
                      >
                        {g}
                      </span>
                      <span className="text-xs font-extrabold text-[#111827] tabular-nums mt-1">
                        {cnt}
                      </span>
                      {card.showDiff && diff !== 0 && (
                        <span className={`text-[9px] font-bold tabular-nums leading-none mt-0.5 ${diff > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons Bar (Start Adjusting; Submit; Download/Upload — ukuran lebih besar) */}
      {pageMode !== "submitted" && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 bg-slate-50/80 border border-slate-200/80 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={editMode ? onSave : onStart}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1A284F] text-white rounded-xl text-sm font-semibold hover:bg-[#131d3b] transition-colors shadow-sm cursor-pointer"
            >
              {editMode ? <><Save className="w-4 h-4" />Save Changes</> : <><Edit2 className="w-4 h-4" />Start Adjusting</>}
            </button>
            {editMode && (
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={canSubmit ? onSubmit : undefined}
              title={editMode ? "Klik Save Changes terlebih dahulu sebelum Submit" : undefined}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
                canSubmit
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
              }`}
            >
              <Send className="w-4 h-4" />Submit
            </button>
          </div>
          <div className="flex items-center gap-2">
            <ExportImportButton onExport={handleExport} onImport={handleImport} size="lg" />
          </div>
        </div>
      )}

      {/* Free-edit toggle */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-4 items-stretch">
      <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer select-none transition-colors ${
        freeEdit
          ? "bg-orange-50 border-orange-300"
          : "bg-gray-50 border-gray-200 hover:bg-gray-100/70"
      } ${!editMode ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="relative flex items-center shrink-0">
          <input
            type="checkbox"
            checked={freeEdit}
            onChange={e => setFreeEdit(e.target.checked)}
            disabled={!editMode}
            className="sr-only peer"
          />
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            freeEdit ? "bg-orange-500 border-orange-500" : "bg-white border-gray-300"
          }`}>
            {freeEdit && (
              <svg viewBox="0 0 10 8" className="w-3 h-3 fill-none stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4l3 3 5-6" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${freeEdit ? "text-orange-800" : "text-gray-700"}`}>
            Override Batas Kalibrasi — Adjust Nilai Akhir Tanpa Batasan
          </p>
          <p className={`text-xs mt-0.5 ${freeEdit ? "text-orange-600" : "text-gray-400"}`}>
            {freeEdit
              ? "Mode aktif: nilai akhir dapat diatur bebas dari 0–100 tanpa batas ±5%"
              : "Secara default nilai akhir dibatasi ±5% dari nilai dasar. Centang untuk menghapus batasan ini."}
          </p>
        </div>
        {freeEdit && (
          <span className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white uppercase tracking-wide">
            Tanpa Batasan
          </span>
        )}
      </label>
      <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <legend className="px-1 text-xs font-semibold text-gray-600">Tampilkan Kolom Tambahan</legend>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          {SUPPORTING_COLUMNS.map((column) => {
            const active = !!visibleColumns[column.key];
            const tagTheme = SUPPORTING_TAG_THEMES[column.key] ?? SUPPORTING_TAG_THEMES.projek;
            return (
              <button
                key={column.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const nextChecked = !active;
                  setVisibleColumns((previous) => ({ ...previous, [column.key]: nextChecked }));
                  if (!nextChecked && sortKey === column.key) setSortKey(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                  active ? tagTheme.active : tagTheme.inactive
                }`}
              >
                {active ? (
                  <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shrink-0" />
                )}
                <span>{column.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Default tersembunyi. Klik tag untuk menampilkan kolom pada tabel, klik kembali untuk menyembunyikan.</p>
      </fieldset>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 1340 }}>
          <thead>
            <tr className="bg-[#1A284F] text-white text-xs">
              <th className={`${thBase} text-left w-8`}>#</th>
              <th className={`${thBase} text-left min-w-[120px]`}>ID Karyawan</th>
              <th className={`${thBase} text-left min-w-[160px]`}>Nama</th>
              <th className={`${thBase} min-w-[120px]`}>Divisi</th>
              <th className={`${thBase} min-w-[140px]`}>Departemen</th>
              <th className={`${thBase} min-w-[140px]`}>Bagian</th>
              <th className={`${thBase} min-w-[120px]`}>Posisi</th>
              {([
                { key: "kpi",           label: "KPI",             extra: <><br/><span className="text-gray-400 font-normal text-[9px]">🔒</span></>, bg: "bg-[#111d3a]" },
                { key: "project",       label: "Project",         extra: <><br/><span className="text-gray-400 font-normal text-[9px]">🔒</span></>, bg: "bg-[#111d3a]" },
                { key: "smartGoals",    label: "SMART Goals",     extra: null,                                                                     bg: "bg-[#1e3260]" },
                { key: "appraisalForm", label: "Appraisal Form",  extra: null,                                                                     bg: "bg-[#1e3260]" },
                { key: "managerialSkill",  label: "Managerial Skill",  extra: null,                                                                bg: "bg-[#1e3260]" },
                { key: "mgmtInterview", label: "Mgmt Interview",  extra: null,                                                                     bg: "bg-[#1e3260]" },
              ] as { key: string; label: string; extra: React.ReactNode; bg: string }[]).map(col => (
                <th key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={`${thBase} ${col.bg} cursor-pointer select-none hover:brightness-110 transition-all`}>
                  <div className="flex items-center justify-center gap-1">
                    <span>{col.label}{col.extra}</span>
                    {sortKey === col.key
                      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                      : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                  </div>
                </th>
              ))}
              <th onClick={() => toggleSort("nilaiAkhir")}
                className={`${thBase} min-w-[140px] cursor-pointer select-none hover:brightness-110 transition-all`}>
                <div className="flex items-center justify-center gap-1">
                  <span>Nilai Akhir{editMode && <span className="ml-1 text-indigo-300 font-normal text-[9px]">{freeEdit ? "Unlimited" : "±5%"}</span>}</span>
                  {sortKey === "nilaiAkhir"
                    ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                    : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                </div>
              </th>
              <th onClick={() => toggleSort("grade")}
                className={`${thBase} cursor-pointer select-none hover:brightness-110 transition-all`}>
                <div className="flex items-center justify-center gap-1">
                  <span>Grade</span>
                  {sortKey === "grade"
                    ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                    : <span className="text-gray-500 text-[9px] leading-none">⇅</span>}
                </div>
              </th>
              {supportingColumns.map((column) => (
                <th key={column.key} scope="col" aria-sort={sortKey === column.key ? sortDir === "asc" ? "ascending" : "descending" : "none"} className={`${thBase} min-w-[100px]`}>
                  <button type="button" onClick={() => toggleSort(column.key)} className="flex w-full items-center justify-center gap-1 rounded px-1 py-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    <span>{column.label}</span>
                    {sortKey === column.key
                      ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-300 shrink-0" /> : <ChevronDown className="w-3 h-3 text-indigo-300 shrink-0" />)
                      : <span className="text-gray-400 text-[9px] leading-none">⇅</span>}
                  </button>
                </th>
              ))}
              <th className={`${thBase} min-w-[200px]`}>Bukti</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={16 + supportingColumns.length} className="py-12 text-center text-gray-400 text-sm">
                  Tidak ada karyawan ditemukan. Coba ubah filter di atas.
                </td>
              </tr>
            ) : sorted.map((emp, idx) => {
              const base      = getBase(emp);
              const final     = getFinal(emp);
              const hasAdj    = emp.id in adjustments && Number.isFinite(adjustments[emp.id]) && Math.abs(final - base) > 0.0001;
              const diff      = parseFloat((final - base).toFixed(2));
              const diffPct   = base > 0 ? parseFloat(((diff / base) * 100).toFixed(2)) : 0;
              const bGrade    = gradeFromScore(base, unitName || emp.companyUnit);
              const fGrade    = gradeFromScore(final, unitName || emp.companyUnit);
              const unitForGrade = unitName || emp.companyUnit;
              const kpiStyle  = scoreBadgeStyle(emp.base.kpi, unitForGrade);
              const prjStyle  = scoreBadgeStyle(emp.base.projectOutsideJobScope, unitForGrade);
              const sgStyle   = emp.base.smartGoals != null ? scoreBadgeStyle(emp.base.smartGoals, unitForGrade) : null;
              const afStyle   = emp.base.appraisalForm != null ? scoreBadgeStyle(emp.base.appraisalForm, unitForGrade) : null;
              const msStyle   = emp.base.managerialSkill != null ? scoreBadgeStyle(emp.base.managerialSkill, unitForGrade) : null;
              const liveMi    = getEffectiveScores(emp).managementInterview;
              const miStyle   = liveMi != null ? scoreBadgeStyle(liveMi, unitForGrade) : null;
              const finalStyle = scoreBadgeStyle(final, unitForGrade);
              const rowSoftBg = hasAdj
                ? "bg-amber-50/85 hover:bg-amber-100/75 ring-1 ring-inset ring-amber-300/70"
                : SOFT_ROW_PALETTE[idx % SOFT_ROW_PALETTE.length];
              const step      = freeEdit ? 1.0 : parseFloat((base * 0.01).toFixed(2));
              const minFinal  = freeEdit ? 0   : parseFloat((base * 0.95).toFixed(2));
              const maxFinal  = freeEdit ? 100 : parseFloat((base * 1.05).toFixed(2));
              const yeState   = loadYearEndState();
              const normEmpId = normalizeEmployeeId(emp.employeeId);
              const isExempt  = yeState.inactive.some((id) => normalizeEmployeeId(id) === normEmpId) ||
                                yeState.ignored.some((id) => normalizeEmployeeId(id) === normEmpId);
              const empReadyForCal = Boolean(emp.isCalibrationReady || isExempt);
              const canDec    = empReadyForCal && (freeEdit ? final > 0   : final > minFinal + 0.001);
              const canInc    = empReadyForCal && (freeEdit ? final < 100 : final < maxFinal - 0.001);

              const divisiName = emp.divisionName || "—";
              const deptName   = emp.departmentName || "—";
              const bagianName = emp.bagianName || "—";
              const posisiName = emp.positionName || "—";

              return (
                <tr key={emp.id} className={`border-b border-slate-200/70 transition-colors ${rowSoftBg}`}>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-slate-500 font-medium text-xs tabular-nums">{idx + 1}</td>

                  <td className="border border-slate-200/60 px-3 py-2.5 whitespace-nowrap font-mono text-xs font-medium text-slate-700">{emp.employeeId}</td>

                  <td className="border border-slate-200/60 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#1A284F] text-xs leading-tight truncate">{emp.name}</p>
                      </div>
                      <button onClick={() => setDetailEmp(emp)}
                        className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-[#1A284F] hover:bg-white/80 transition-colors cursor-pointer"
                        title="View Detail">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>

                  <td className="border border-slate-200/60 px-3 py-2.5 text-xs text-slate-700">{divisiName}</td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-xs text-slate-700">{deptName}</td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-xs text-slate-700">{bagianName}</td>

                  <td className="border border-slate-200/60 px-3 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                    {posisiName}
                  </td>

                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    <div className="inline-flex items-center justify-center gap-1">
                      <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${kpiStyle.pill}`}>
                        {Math.round(emp.base.kpi)}%
                      </span>
                      {emp.kpiIsYtd && (
                        <span
                          className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold leading-none"
                          title="Nilai berjalan Year-to-Date (menunggu KPI 12 bulan lengkap & Validated HR ICF)"
                        >
                          YTD
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${prjStyle.pill}`}>
                      {Math.round(emp.base.projectOutsideJobScope)}%
                    </span>
                  </td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    {emp.base.smartGoals != null && sgStyle ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${sgStyle.pill}`}>
                        {Math.round(emp.base.smartGoals)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    {emp.base.appraisalForm != null && afStyle ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${afStyle.pill}`}>
                        {Math.round(emp.base.appraisalForm)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    {emp.base.managerialSkill != null && msStyle ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${msStyle.pill}`}>
                        {Math.round(emp.base.managerialSkill)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center text-xs">
                    {liveMi != null && miStyle ? (
                      <span className={`inline-block px-2 py-0.5 rounded-md border font-bold tabular-nums ${miStyle.pill}`}>
                        {Math.round(liveMi)}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  {/* Nilai Akhir – editable ±5% of base score */}
                  <td className="border border-slate-200/60 px-2.5 py-2.5 text-center">
                    {editMode ? (
                      empReadyForCal ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={!canDec}
                              onClick={() => setFinal(emp, Math.max(minFinal, parseFloat((final - step).toFixed(2))))}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-300 shadow-2xs hover:bg-[#1A284F] hover:text-white hover:border-[#1A284F] active:scale-95 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:hover:border-slate-300 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 font-extrabold text-base transition-all select-none cursor-pointer"
                              title="Kurangi Nilai Akhir"
                            >
                              −
                            </button>
                            <span className={`px-2.5 py-1 rounded-lg border text-center font-extrabold text-xs tabular-nums min-w-[70px] ${finalStyle.pill}`}>
                              {final.toFixed(2)}%
                            </span>
                            <button
                              type="button"
                              disabled={!canInc}
                              onClick={() => setFinal(emp, Math.min(maxFinal, parseFloat((final + step).toFixed(2))))}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-300 shadow-2xs hover:bg-[#1A284F] hover:text-white hover:border-[#1A284F] active:scale-95 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-slate-700 disabled:hover:border-slate-300 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 font-extrabold text-base transition-all select-none cursor-pointer"
                              title="Tambah Nilai Akhir"
                            >
                              +
                            </button>
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums ${diffPct > 0 ? "text-emerald-600" : diffPct < 0 ? "text-rose-500" : "text-slate-400"}`}>
                            {diffPct > 0 ? `+${diffPct.toFixed(1)}%` : diffPct < 0 ? `${diffPct.toFixed(1)}%` : "base"}
                          </span>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col items-center gap-0.5"
                          title="Seluruh modul wajib (termasuk KPI Full-Year 12 Bulan) harus berstatus Validated sebelum dapat dikalibrasi"
                        >
                          <span className={`inline-block px-2 py-0.5 rounded-md border font-bold text-xs tabular-nums ${finalStyle.pill}`}>
                            {final.toFixed(2)}%
                          </span>
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold whitespace-nowrap">
                            <Lock className="w-2.5 h-2.5" /> Perlu Validated
                          </span>
                        </div>
                      )
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md border font-bold text-xs tabular-nums ${finalStyle.pill}`}>
                          {final.toFixed(2)}%
                        </span>
                        {diff !== 0 && (
                          <span className={`text-[10px] font-bold tabular-nums ${diffPct > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Grade */}
                  <td className="border border-slate-200/60 px-3 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center min-w-[30px] px-2 py-0.5 rounded-md text-xs font-extrabold text-white shadow-2xs" style={{ background: fGrade.color }}>
                      {fGrade.grade}
                    </span>
                    {fGrade.grade !== bGrade.grade && (
                      <p className="text-[10px] text-gray-400 line-through leading-none mt-0.5">{bGrade.grade}</p>
                    )}
                  </td>

                  {supportingColumns.map((column) => <td key={column.key} className="border border-slate-200/60 px-3 py-2.5 text-center text-xs font-medium tabular-nums text-slate-700">{column.value(emp) ?? "—"}</td>)}

                  {/* Bukti (Upload File & Note) */}
                  <td className="border border-slate-200/60 px-2.5 py-2.5 align-top min-w-[215px]">
                    {editMode ? (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setOpenNotes((prev) => ({ ...prev, [emp.id]: !(prev[emp.id] ?? (hasAdj || Boolean(comments[emp.id]))) }))}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer ${
                              (openNotes[emp.id] ?? (hasAdj || Boolean(comments[emp.id])))
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200"
                            }`}
                          >
                            <MessageSquare className="w-3 h-3 shrink-0" />
                            <span>{comments[emp.id]?.trim() ? "Note" : "+ Note"}</span>
                          </button>
                          <label className="inline-flex items-center gap-1 cursor-pointer px-2 py-1 border border-dashed border-sky-300 bg-white rounded-lg text-sky-700 hover:bg-sky-50 transition-colors">
                            <Upload className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] font-semibold">Upload File</span>
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              onChange={e => {
                                const rawFiles = Array.from(e.target.files ?? []);
                                const tempFiles: EvidenceFile[] = rawFiles.map(f => ({
                                  name: f.name,
                                  objectUrl: URL.createObjectURL(f),
                                  mimeType: f.type || "application/octet-stream",
                                }));
                                if (tempFiles.length) {
                                  setEvidence(prev => {
                                    const next = { ...prev, [emp.id]: [...(prev[emp.id] ?? []), ...tempFiles] };
                                    savePersistedState("pa_calibration_adj_evidence_v1", next);
                                    return next;
                                  });
                                  rawFiles.forEach((rawFile, idxFile) => {
                                    const localBlobUrl = tempFiles[idxFile]?.objectUrl;
                                    void uploadEvidenceFileToSupabase(rawFile, {
                                      employeeId: emp.employeeId,
                                      employeeName: emp.name,
                                      companyUnit: emp.companyUnit,
                                      division: emp.divisionName,
                                      department: emp.departmentName,
                                      position: emp.positionName,
                                      moduleType: "Calibration",
                                      period: "2026",
                                      month: "Year-End",
                                    }).then((uploaded) => {
                                      if (!uploaded?.url) return;
                                      setEvidence(prev => {
                                        const list = prev[emp.id] ?? [];
                                        const updatedList = list.map((item) =>
                                          item.objectUrl === localBlobUrl ? { ...item, objectUrl: uploaded.url } : item,
                                        );
                                        const next = { ...prev, [emp.id]: updatedList };
                                        savePersistedState("pa_calibration_adj_evidence_v1", next);
                                        return next;
                                      });
                                    });
                                  });
                                }
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {(hasAdj || Boolean(comments[emp.id]?.trim()) || (evidence[emp.id]?.length ?? 0) > 0) && (
                            <button
                              type="button"
                              onClick={() => resetEmp(emp.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors text-[10px] font-semibold border border-rose-200 cursor-pointer"
                              title="Reset kalibrasi, note, dan bukti baris ini"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset</span>
                            </button>
                          )}
                        </div>

                        {(openNotes[emp.id] ?? (hasAdj || Boolean(comments[emp.id]))) && (
                          <CalibrationNoteInput
                            empId={emp.id}
                            value={comments[emp.id] ?? ""}
                            onCommit={commitNoteForEmp}
                          />
                        )}

                        {/* Evidence file list */}
                        {(evidence[emp.id]?.length ?? 0) > 0 && (
                          <div className="flex flex-col gap-1">
                            {evidence[emp.id].map((f, i) => (
                              <div key={i} className="flex items-center gap-1 bg-white/90 border border-sky-200 rounded-md px-2 py-0.5">
                                <Paperclip className="w-2.5 h-2.5 text-sky-500 shrink-0" />
                                <span className="text-[10px] text-sky-800 truncate max-w-[130px]">{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setEvidence(prev => {
                                    const next = { ...prev, [emp.id]: prev[emp.id].filter((_, j) => j !== i) };
                                    savePersistedState("pa_calibration_adj_evidence_v1", next);
                                    return next;
                                  })}
                                  className="ml-auto text-gray-300 hover:text-red-500 transition-colors shrink-0 cursor-pointer"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (comments[emp.id]?.trim() || (evidence[emp.id]?.length ?? 0) > 0) ? (
                      <div className="flex flex-col gap-1">
                        {comments[emp.id]?.trim() && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0">Note</span>
                            <p className="text-[10px] text-slate-700 line-clamp-2">{comments[emp.id]}</p>
                          </div>
                        )}
                        {(evidence[emp.id]?.length ?? 0) > 0 && (
                          <div className="flex items-center gap-1 text-sky-600">
                            <Paperclip className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] font-semibold">{evidence[emp.id]!.length} file</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Appraisal Detail Modal */}
      {detailEmp && (
        <AppraisalDetailCard
          emp={detailEmp}
          effectiveScores={getEffectiveScores(detailEmp)}
          finalScore={getFinal(detailEmp)}
          comment={comments[detailEmp.id]}
          evidenceFiles={evidence[detailEmp.id]}
          onClose={() => setDetailEmp(null)}
        />
      )}
    </CollapsibleSection>
  );
}

// ─── Calibration Panel ────────────────────────────────────────────────────────

function CalibrationPanel({
  unit,
  unitName,
  calibrationGrades, divisionProportions, departemenenProportions, bagianProportions,
  editMode, setEditMode, saveVersion, setSaveVersion, setIsSaved, pageMode,
  canSubmit, onSubmit,
}: {
  unit: CompanyUnit;
  unitName?: string;
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  saveVersion: number;
  setSaveVersion: React.Dispatch<React.SetStateAction<number>>;
  setIsSaved: (v: boolean) => void;
  pageMode: PageMode;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  const [liveAdjustments, setLiveAdjustments] = useState<Record<string, number>>(() =>
    loadPersistedState("pa_calibration_adj_scores_v1", {})
  );
  const editModeRef = useRef(editMode);
  editModeRef.current = editMode;
  const preEditAdjustmentsRef = useRef<Record<string, number>>({});
  const updateLiveAdjustments: React.Dispatch<React.SetStateAction<Record<string, number>>> = useCallback(
    (updater) => {
      setLiveAdjustments((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        // Simpan draft langsung ke localStorage agar event hidrasi dari kolom Bukti tidak pernah me-reset Nilai Akhir
        safeSetLocalJson("pa_calibration_adj_scores_v1", next);
        return next;
      });
    },
    [],
  );
  const [activeTab, setActiveTab] = useRouteTab<"distribusi" | "proporsi">(["distribusi", "proporsi"], "distribusi");
  const [soyTick, setSoyTick] = useState(0);

  // Live Management Interview scores from BOD assessment (0–100 percentage)
  const MI_EMP_MAP: Record<string, string> = {
    "emp-mi-E002": "E002",
    "emp-mi-E011": "E011",
    "emp-mi-E013": "E013",
    "emp-mi-E014": "E014",
  };
  const buildMIScores = useCallback(() => {
    const result: Record<string, number | null> = {};
    for (const emp of ALL_EMPLOYEES) {
      const mapped = MI_EMP_MAP[emp.id] ?? emp.employeeId;
      const pct = getPenilai1ScoreAsPercent(mapped, emp.name);
      if (pct !== null) {
        result[emp.id] = pct;
      }
    }
    return result;
  }, []);
  const [miScores, setMIScores] = useState<Record<string, number | null>>(buildMIScores);
  useEffect(() => {
    return subscribeScores(() => setMIScores(buildMIScores()));
  }, [buildMIScores]);

  useEffect(() => {
    const onHydrated = () => {
      // Selama berada di mode Edit (Start Adjusting), pertahankan nilai adjustment di memori
      // agar aktivitas pada kolom Bukti (+ Note / Upload File) tidak pernah mengembalikan Nilai Akhir ke angka awal!
      if (!editModeRef.current) {
        const s = loadPersistedState<Record<string, number>>("pa_calibration_adj_scores_v1", {});
        setLiveAdjustments(s);
      }
      setSoyTick((v) => v + 1);
    };
    const onSoyUpdated = () => setSoyTick((v) => v + 1);
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener(SOY_EVENT, onSoyUpdated);
    window.addEventListener(SCORE_WEIGHT_EVENT, onSoyUpdated);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener(SOY_EVENT, onSoyUpdated);
      window.removeEventListener(SCORE_WEIGHT_EVENT, onSoyUpdated);
    };
  }, []);

  useEffect(() => {
    if (saveVersion > 0) {
      savePersistedState("pa_calibration_adj_scores_v1", liveAdjustments, {
        kind: "calibration-adjustment",
        adjustmentKey: `adj-2026-${Date.now()}`,
        unitName: unitName ?? unit.name,
        employeeId: "ALL",
        period: "2026",
        status: "Saved",
        data: liveAdjustments,
        audit: {
          action: "Update",
          module: "Performance Appraisal",
          subModule: "Calibration Adjustment",
          description: `Saved Calibration score adjustments (${Object.keys(liveAdjustments).length} employees)`,
        },
      });
    }
  }, [saveVersion]);

  const handleStart  = () => {
    preEditAdjustmentsRef.current = { ...liveAdjustments };
    setEditMode(true);
  };
  const handleCancel = () => {
    const restored = { ...preEditAdjustmentsRef.current };
    safeSetLocalJson("pa_calibration_adj_scores_v1", restored);
    setLiveAdjustments(restored);
    setEditMode(false);
  };
  const handleSave   = () => { setEditMode(false); setIsSaved(true); setSaveVersion(v => v + 1); };

  // Sumber SOY akurat: utamakan snapshot SOY yang telah disubmit/disetujui, fallback ke beginningHC / setting unit
  const soySource = useMemo(() => {
    const soyRec = getSoyApproval(unit.id);
    if (soyRec?.snapshot) {
      return {
        grades: soyRec.snapshot.calibrationGrades ?? calibrationGrades,
        divisions: soyRec.snapshot.divisionProportions ?? divisionProportions ?? [],
        depts: soyRec.snapshot.departemenenProportions ?? departemenenProportions ?? [],
        bagians: soyRec.snapshot.bagianProportions ?? bagianProportions ?? [],
      };
    }
    if (unit.beginningHC) {
      return {
        grades: unit.beginningGrades ?? calibrationGrades,
        divisions: (divisionProportions ?? []).map((d) => ({
          ...d,
          hc: unit.beginningHC?.[d.id] ?? d.hc,
          customQuotas: unit.beginningCustomQuotas?.[d.id] ?? d.customQuotas,
        })),
        depts: (departemenenProportions ?? []).map((dep) => ({
          ...dep,
          hc: unit.beginningHC?.[dep.id] ?? dep.hc,
          customQuotas: unit.beginningCustomQuotas?.[dep.id] ?? dep.customQuotas,
        })),
        bagians: (bagianProportions ?? []).map((bag) => ({
          ...bag,
          hc: unit.beginningHC?.[bag.id] ?? bag.hc,
          customQuotas: unit.beginningCustomQuotas?.[bag.id] ?? bag.customQuotas,
        })),
      };
    }
    return {
      grades: calibrationGrades,
      divisions: divisionProportions ?? [],
      depts: departemenenProportions ?? [],
      bagians: bagianProportions ?? [],
    };
  }, [unit, calibrationGrades, divisionProportions, departemenenProportions, bagianProportions, soyTick]);

  const soyAlloc = useMemo(
    () =>
      computeUnitQuotaAllocation({
        calibrationGrades: soySource.grades,
        divisionProportions: soySource.divisions,
        departemenenProportions: soySource.depts,
        bagianProportions: soySource.bagians,
      }),
    [soySource],
  );

  // Sumber Setting (EOY): diambil dari Grade Distribution (Bell Curve) tab HC Akhir Tahun (EOY) pada /calibration/setting
  const eoySettingAlloc = useMemo(() => {
    const eoyGrades = calibrationGrades ?? soySource.grades;
    const eoyDivs =
      divisionProportions && divisionProportions.length > 0
        ? divisionProportions
        : applyImportedEmployeesDistribution(unit).divisionProportions;
    const eoyDepts =
      departemenenProportions && departemenenProportions.length > 0
        ? departemenenProportions
        : applyImportedEmployeesDistribution(unit).departemenenProportions;
    const eoyBags =
      bagianProportions && bagianProportions.length > 0
        ? bagianProportions
        : applyImportedEmployeesDistribution(unit).bagianProportions;
    return computeUnitQuotaAllocation({
      calibrationGrades: eoyGrades,
      divisionProportions: eoyDivs,
      departemenenProportions: eoyDepts,
      bagianProportions: eoyBags,
    });
  }, [unit, calibrationGrades, divisionProportions, departemenenProportions, bagianProportions, soySource.grades, soyTick]);

  const safeDivisions = soySource.divisions;
  const safeDepts     = soySource.depts;
  const safeBagian    = soySource.bagians;
  const effectiveGrades = soySource.grades;

  const totalDivHC = safeDivisions.reduce((s, d) => s + d.hc, 0);
  const gradeHeaders = effectiveGrades.map(g => g.grade);

  // Setting share maps
  const divShareMap: Record<string, number> = {};
  safeDivisions.forEach(d => { divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0; });

  const deptShareMap: Record<string, number> = {};
  safeDepts.forEach(dept => {
    const sibHC = safeDepts.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptShareMap[dept.id] = sibHC > 0 ? (dept.hc / sibHC) * (divShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianShareMap: Record<string, number> = {};
  safeBagian.forEach(b => {
    const sibHC = safeBagian.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianShareMap[b.id] = sibHC > 0 ? (b.hc / sibHC) * (deptShareMap[b.departemenenId] ?? 0) : 0;
  });

  // Actual data computed from employee scores (uses savedAdjustments after Save Changes)
  const gradeIdx = Object.fromEntries(gradeHeaders.map((g, i) => [g, i]));

  const { actualBaseCounts, calibratedCounts, hasCalibration } = useMemo(() => {
    const nGrades = gradeHeaders.length;
    const baseGlobal = Array<number>(nGrades).fill(0);
    const calGlobal  = Array<number>(nGrades).fill(0);
    const divCounts:    Record<string, number[]> = {};
    const deptCounts:   Record<string, number[]> = {};
    const bagianCounts: Record<string, number[]> = {};
    let adjustedCount = 0;

    ALL_EMPLOYEES.filter(emp => !unitName || emp.companyUnit === unitName).forEach(emp => {
      if (isYearEndInactive(emp.employeeId)) return;
      const effScores =
        emp.id in miScores && miScores[emp.id] !== null
          ? applyYearEndScorePolicy(emp.employeeId, { ...emp.base, managementInterview: miScores[emp.id] })
          : applyYearEndScorePolicy(emp.employeeId, emp.base);
      const baseScore = parseFloat(calcEmployeeFinalScore(emp, effScores).toFixed(2));
      const rawAdj = liveAdjustments[emp.id];
      const finalScore = typeof rawAdj === "number" && Number.isFinite(rawAdj) ? rawAdj : baseScore;
      if (emp.id in liveAdjustments && typeof rawAdj === "number" && Number.isFinite(rawAdj) && Math.abs(finalScore - baseScore) > 0.0001) {
        adjustedCount++;
      }

      const { grade: baseGrade } = gradeFromScore(baseScore, unitName || emp.companyUnit);
      const baseGi = gradeIdx[baseGrade] ?? -1;
      if (baseGi >= 0) baseGlobal[baseGi]++;

      const { grade } = gradeFromScore(finalScore, unitName || emp.companyUnit);
      const gi = gradeIdx[grade] ?? -1;
      if (gi < 0) return;
      calGlobal[gi]++;
      if (!divCounts[emp.divisiId])          divCounts[emp.divisiId]          = Array(nGrades).fill(0);
      if (!deptCounts[emp.departemenenId])   deptCounts[emp.departemenenId]   = Array(nGrades).fill(0);
      if (!bagianCounts[emp.bagianId])       bagianCounts[emp.bagianId]       = Array(nGrades).fill(0);
      divCounts[emp.divisiId][gi]++;
      deptCounts[emp.departemenenId][gi]++;
      bagianCounts[emp.bagianId][gi]++;
    });

    return {
      actualBaseCounts: baseGlobal,
      calibratedCounts: { globalCounts: calGlobal, divCounts, deptCounts, bagianCounts },
      hasCalibration: adjustedCount > 0,
    };
  }, [liveAdjustments, miScores, gradeHeaders.join(","), unitName, soyTick]);

  // Actual HC per org unit (sum of grade counts)
  const divActualData = safeDivisions.map(d => ({
    id: d.id,
    divisiId: d.id,
    hc: (calibratedCounts.divCounts[d.id] ?? []).reduce((a, b) => a + b, 0),
    grades: calibratedCounts.divCounts[d.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const totalActualDivHC = divActualData.reduce((s, d) => s + d.hc, 0);
  const divActualShareMap: Record<string, number> = {};
  divActualData.forEach(d => { divActualShareMap[d.id] = totalActualDivHC > 0 ? (d.hc / totalActualDivHC) * 100 : 0; });

  const deptActualData = safeDepts.map(dept => ({
    id: dept.id,
    divisiId: dept.divisiId,
    hc: (calibratedCounts.deptCounts[dept.id] ?? []).reduce((a, b) => a + b, 0),
    grades: calibratedCounts.deptCounts[dept.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const deptActualShareMap: Record<string, number> = {};
  deptActualData.forEach(dept => {
    const sibHC = deptActualData.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptActualShareMap[dept.id] = sibHC > 0 ? (dept.hc / sibHC) * (divActualShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianActualData = safeBagian.map(b => ({
    id: b.id,
    departemenenId: b.departemenenId,
    hc: (calibratedCounts.bagianCounts[b.id] ?? []).reduce((a, b2) => a + b2, 0),
    grades: calibratedCounts.bagianCounts[b.id] ?? Array(gradeHeaders.length).fill(0),
  }));
  const bagianActualShareMap: Record<string, number> = {};
  bagianActualData.forEach(b => {
    const sibHC = bagianActualData.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianActualShareMap[b.id] = sibHC > 0 ? (b.hc / sibHC) * (deptActualShareMap[b.departemenenId] ?? 0) : 0;
  });

  const fmtShare = (v: number) => v > 0 ? `${v.toFixed(1)}%` : "";
  const soyDivHCMap = useMemo(() => Object.fromEntries(safeDivisions.map((d) => [d.id, d.hc])), [safeDivisions]);
  const soyDeptHCMap = useMemo(() => Object.fromEntries(safeDepts.map((d) => [d.id, d.hc])), [safeDepts]);
  const soyBagianHCMap = useMemo(() => Object.fromEntries(safeBagian.map((b) => [b.id, b.hc])), [safeBagian]);

  const tabDefs: { key: "distribusi" | "proporsi"; label: string }[] = [
    { key: "distribusi", label: "Grade Distribution & Calibration" },
    { key: "proporsi",   label: "Proportion per Division / Departemen / Bagian" },
  ];

  return (
    <>
      {/* Tabs */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-100">
          {tabDefs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-4 text-sm font-semibold transition-colors relative ${
                activeTab === tab.key
                  ? "text-[#1A284F]"
                  : "text-gray-400 hover:text-gray-600"
              }`}>
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1A284F] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6 flex flex-col gap-6">
          {activeTab === "distribusi" ? (
            <>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-6 bg-gray-50 border border-gray-100 rounded-xl px-5 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Legend:</p>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm bg-[#06B6D4] inline-block" />
                  <span className="text-xs text-gray-700 font-semibold">Setting (SOY)</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="22" height="10" className="shrink-0">
                    <line x1="0" y1="5" x2="22" y2="5" stroke="#F59E0B" strokeWidth="2.5" strokeDasharray="5 3" />
                  </svg>
                  <span className="text-xs text-gray-700 font-semibold">Setting (EOY)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm bg-teal-600 inline-block" />
                  <span className="text-xs text-gray-700 font-semibold">Aktual</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-3 rounded-sm bg-[#1A284F] inline-block" />
                  <span className="text-xs text-gray-700 font-semibold">Kalibrasi (EOY)</span>
                </div>
              </div>

              <BellCurveChart
                calibrationGrades={effectiveGrades}
                settingCounts={soyAlloc.unitGradeTargets}
                settingEoyCounts={eoySettingAlloc.unitGradeTargets}
                actualCounts={actualBaseCounts}
                calibratedCounts={calibratedCounts.globalCounts}
                hasCalibration={hasCalibration}
              />

              <EmployeeAdjustmentSection
                unitName={unitName}
                calibrationGrades={effectiveGrades}
                soyTotalHC={soyAlloc.totalHC}
                soyGradeTargets={soyAlloc.unitGradeTargets}
                soyDivMap={soyDivHCMap}
                soyDeptMap={soyDeptHCMap}
                soyBagianMap={soyBagianHCMap}
                soyDivMatrix={soyAlloc.divMatrix}
                soyDeptMatrix={soyAlloc.deptMatrix}
                soyBagianMatrix={soyAlloc.bagianMatrix}
                miScores={miScores}
                editMode={editMode}
                adjustments={liveAdjustments}
                setAdjustments={updateLiveAdjustments}
                onStart={handleStart}
                onSave={handleSave}
                onCancel={handleCancel}
                pageMode={pageMode}
                canSubmit={canSubmit}
                onSubmit={onSubmit}
              />
            </>
          ) : (
            <>
              <GradeDistributionTable
                calibrationGrades={effectiveGrades}
                settingCounts={soyAlloc.unitGradeTargets}
                actualCounts={calibratedCounts.globalCounts}
              />
              <AdjustmentProportionTable
                title="Proportion per Division"
                subtitle="Comparison of setting vs actual headcount & grade distribution per division"
                rows={safeDivisions.map(d => {
                  const actual = divActualData.find(x => x.id === d.id)!;
                  return {
                    id: d.id, label: d.divisi,
                    settingHC: d.hc, settingShareKuota: fmtShare(divShareMap[d.id] ?? 0),
                    settingCalcs: soyAlloc.divMatrix[d.id] ?? gradeCalcs(d.hc, effectiveGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(divActualShareMap[d.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={totalDivHC} totalActualHC={totalActualDivHC} gradeHeaders={gradeHeaders}
              />
              <AdjustmentProportionTable
                title="Proportion per Departemen"
                subtitle="Comparison of setting vs actual headcount & grade distribution per departemen"
                rows={safeDepts.map(dept => {
                  const parentDiv = safeDivisions.find(d => d.id === dept.divisiId);
                  const actual = deptActualData.find(x => x.id === dept.id)!;
                  return {
                    id: dept.id, label: dept.departemen, parentLabel: parentDiv?.divisi,
                    settingHC: dept.hc, settingShareKuota: fmtShare(deptShareMap[dept.id] ?? 0),
                    settingCalcs: soyAlloc.deptMatrix[dept.id] ?? gradeCalcs(dept.hc, effectiveGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(deptActualShareMap[dept.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
                totalActualHC={deptActualData.reduce((s, d) => s + d.hc, 0)}
                gradeHeaders={gradeHeaders} showParent parentHeader="DIVISI"
              />
              <AdjustmentProportionTable
                title="Proportion per Bagian"
                subtitle="Comparison of setting vs actual headcount & grade distribution per bagian"
                rows={safeBagian.map(b => {
                  const parentDept = safeDepts.find(d => d.id === b.departemenenId);
                  const actual = bagianActualData.find(x => x.id === b.id)!;
                  return {
                    id: b.id, label: b.bagian, parentLabel: parentDept?.departemen,
                    settingHC: b.hc, settingShareKuota: fmtShare(bagianShareMap[b.id] ?? 0),
                    settingCalcs: soyAlloc.bagianMatrix[b.id] ?? gradeCalcs(b.hc, effectiveGrades),
                    actualHC: actual.hc, actualShareKuota: fmtShare(bagianActualShareMap[b.id] ?? 0),
                    actualCalcs: actual.grades,
                  };
                })}
                totalSettingHC={safeBagian.reduce((s, b) => s + b.hc, 0)}
                totalActualHC={bagianActualData.reduce((s, b) => s + b.hc, 0)}
                gradeHeaders={gradeHeaders} showParent parentHeader="DEPARTEMEN"
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Unit Detail ──────────────────────────────────────────────────────────────

function UnitDetail({ unit, onBack, pageMode, onShowConfirm, hideBack }: {
  unit: CompanyUnit;
  onBack: () => void;
  pageMode: PageMode;
  onShowConfirm: () => void;
  hideBack?: boolean;
}) {
  const [editMode,     setEditMode]     = useState(false);
  const [isSaved,      setIsSaved]      = useState(false);
  const [saveVersion,  setSaveVersion]  = useState(0);
  const revision = useAppraisalRevision();
  const [yeTick, setYeTick] = useState(0);

  useEffect(() => {
    const bump = () => setYeTick((v) => v + 1);
    window.addEventListener("year-end-updated", bump);
    window.addEventListener("pa-db-hydrated", bump);
    return () => {
      window.removeEventListener("year-end-updated", bump);
      window.removeEventListener("pa-db-hydrated", bump);
    };
  }, []);

  const activeUnitEmployeeCount = useMemo(() => {
    return ALL_EMPLOYEES.filter((e) => e.companyUnit === unit.name && !isYearEndInactive(e.employeeId)).length;
  }, [unit.name, saveVersion, revision, yeTick]);

  const canSubmit = pageMode !== "submitted" && !editMode && (isSaved || pageMode === "preview" || activeUnitEmployeeCount > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar */}
      {!hideBack && (
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>
      </div>
      )}

      {/* Unit header */}
      <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-[#1A284F]" />
        </div>
        <div>
          <p className="font-bold text-gray-900">{unit.name}</p>
          <p className="text-sm text-gray-500">
            {unit.industry}{unit.industry ? " · " : ""}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{unit.code}</span>
          </p>
        </div>
      </div>

      {/* Submitted warning */}
      {pageMode === "submitted" && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Calibration adjustment has been submitted and is <strong>Pending Approval Management</strong>. Editing is disabled until the approval is completed.
          </p>
        </div>
      )}

      <CalibrationPanel
        unit={unit}
        unitName={unit.name}
        calibrationGrades={unit.calibrationGrades}
        divisionProportions={unit.divisionProportions}
        departemenenProportions={unit.departemenenProportions}
        bagianProportions={unit.bagianProportions}
        editMode={editMode}
        setEditMode={setEditMode}
        saveVersion={saveVersion}
        setSaveVersion={setSaveVersion}
        setIsSaved={setIsSaved}
        pageMode={pageMode}
        canSubmit={canSubmit}
        onSubmit={onShowConfirm}
      />
    </div>
  );
}

// ─── Load from Setting ────────────────────────────────────────────────────────

function loadFromSetting(): { units: CompanyUnit[]; submittedAt: string | null } {
  try {
    const raw = localStorage.getItem("calibration_submitted_units") ?? localStorage.getItem("calibration_hc_settings_2026");
    const submittedAt = localStorage.getItem("calibration_submitted_at");
    if (!raw) {
      return {
        units: defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u)),
        submittedAt: null,
      };
    }
    const submitted: any[] = JSON.parse(raw);
    const units = defaultCompanyUnits.map(def => {
      const synced = applyImportedEmployeesDistribution(def);
      const src = submitted.find(s => s.id === def.id);
      if (!src) return synced;
      return {
        ...synced,
        calibrationGrades:        src.calibrationGrades ?? synced.calibrationGrades,
        divisionProportions:      synced.divisionProportions.length > 0 ? synced.divisionProportions : (src.divisionProportions ?? []),
        departemenenProportions:  synced.departemenenProportions.length > 0 ? synced.departemenenProportions : (src.departemenenProportions ?? []),
        bagianProportions:        synced.bagianProportions.length > 0 ? synced.bagianProportions : (src.bagianProportions ?? []),
        beginningHC:              src.beginningHC,
        beginningGrades:          src.beginningGrades,
        beginningCustomQuotas:    src.beginningCustomQuotas,
      };
    });
    return { units, submittedAt };
  } catch {
    return {
      units: defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u)),
      submittedAt: null,
    };
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const SELECTED_UNIT_SESSION_KEY = "pa_cal_adj_selected_unit_id";

export function CalibrationAdjustment({ lockedUnits }: { lockedUnits?: string[] } = {}) {
  useAppraisalRevision();
  const location = useLocation();
  const navigate = useNavigate();
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const effectiveLockedUnits = lockedUnits ?? authLockedUnits;
  const [{ units: allCompanyUnits, submittedAt }, setLoadedSetting] = useState(loadFromSetting);
  const companyUnits = effectiveLockedUnits ? allCompanyUnits.filter(u => effectiveLockedUnits.includes(u.name)) : allCompanyUnits;
  const isSubTabUrl = /\/calibration\/adjustment\/(distribusi|proporsi)\/?$/i.test(location.pathname);
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(() => {
    if (!isSubTabUrl) return null;
    try {
      const savedId = sessionStorage.getItem(SELECTED_UNIT_SESSION_KEY);
      const found = savedId ? companyUnits.find((u) => u.id === savedId) : undefined;
      return found ?? companyUnits[0] ?? null;
    } catch {
      return companyUnits[0] ?? null;
    }
  });
  const [pageMode, setPageMode]         = useState<PageMode>(() =>
    loadPersistedState<PageMode>("pa_calibration_adj_mode_v1", "edit")
  );
  const [showConfirm, setShowConfirm]   = useState(false);

  const baseAdjustmentPath = useMemo(
    () => location.pathname.replace(/\/(distribusi|proporsi)\/?$/i, ""),
    [location.pathname],
  );

  const selectUnit = (unit: CompanyUnit) => {
    try {
      sessionStorage.setItem(SELECTED_UNIT_SESSION_KEY, unit.id);
    } catch {
      // ignore
    }
    setPageMode("edit");
    setSelectedUnit(unit);
    if (!isSubTabUrl) {
      navigate(`${baseAdjustmentPath}/distribusi`);
    }
  };

  const clearSelectedUnit = () => {
    try {
      sessionStorage.removeItem(SELECTED_UNIT_SESSION_KEY);
    } catch {
      // ignore
    }
    setSelectedUnit(null);
    if (isSubTabUrl) {
      navigate(baseAdjustmentPath);
    }
  };

  useEffect(() => {
    const onHydrated = () => {
      setLoadedSetting(loadFromSetting());
      setPageMode(loadPersistedState<PageMode>("pa_calibration_adj_mode_v1", "edit"));
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const handleSubmitConfirm = () => {
    setShowConfirm(false);
    setPageMode("submitted");
    savePersistedState("pa_calibration_adj_mode_v1", "submitted", {
      kind: "calibration-adjustment",
      adjustmentKey: `submit-${selectedUnit?.id ?? "1"}-2026`,
      unitName: selectedUnit?.name ?? "PT RSUP (Industry)",
      employeeId: "ALL",
      period: "2026",
      status: "Submitted",
      data: { submittedAt: new Date().toISOString() },
      audit: {
        action: "Create",
        module: "Performance Appraisal",
        subModule: "Calibration Adjustment",
        description: `Submitted Calibration Adjustment for ${selectedUnit?.name ?? "Company Unit"} to BOD Approval`,
      },
    });
    clearSelectedUnit();
  };

  if (selectedUnit) {
    const liveUnit = companyUnits.find(u => u.id === selectedUnit.id) ?? selectedUnit;
    return (
      <>
        {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
        <div className="w-full flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Adjustment</h2>
            <p className="text-sm text-gray-500">Compare setting targets with actual appraisal results and adjust per company unit</p>
          </div>
          <UnitDetail
            unit={liveUnit}
            onBack={clearSelectedUnit}
            pageMode={pageMode}
            onShowConfirm={() => setShowConfirm(true)}
            hideBack={false}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Adjustment</h2>
          <p className="text-sm text-gray-500">Compare setting targets with actual appraisal results and adjust per company unit</p>
        </div>

        {pageMode === "submitted" && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800 font-medium">
              Calibration adjustment has been submitted and is <strong>Pending Approval Management</strong>.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            {submittedAt
              ? "Select a company unit to compare setting targets with actual appraisal data."
              : "No submitted data yet. Submit from Calibration Setting first."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {companyUnits.map((unit, idx) => {
              const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];
              const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
              const unitActiveHC = ALL_EMPLOYEES.filter(
                (e) => e.companyUnit === unit.name && !isYearEndInactive(e.employeeId),
              ).length;
              return (
                <button
                  key={unit.id}
                  onClick={() => selectUnit(unit)}
                  style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                  className={`group relative overflow-hidden text-left bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-4 min-h-[132px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion cursor-pointer`}
                >
                  <div
                    className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                    style={{ backgroundColor: `${spec.accentHex}0D` }}
                  />
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-500 truncate">
                        {unit.code}{unit.industry ? ` · ${unit.industry}` : ""}
                      </p>
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1A284F] tabular-nums">
                        <Users className="w-3 h-3" /> {unitActiveHC} Active HC
                      </span>
                      {submittedAt && (
                        <span className="text-[10px] font-semibold text-sky-700 bg-white/85 border border-sky-200 px-2 py-0.5 rounded-full">
                          From Setting
                        </span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1A284F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
