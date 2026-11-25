import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, ChevronDown, ChevronRight, Clock, Eye, Filter, Layers, RotateCcw, Settings, ShieldAlert, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  acknowledgeSoyApproval,
  decideSoyApproval,
  formatActorWithPosition,
  loadGroupSoyApprovals,
  refreshGroupSoyApprovalsFromBackend,
  resolveGroupSoyRoleForUser,
  SOY_EVENT,
  type SoyApprovalRecord,
  type SoyStatus,
} from "../../store/calibrationSoyStore";
import {
  computeGroupQuotaAllocation,
  computeUnitQuotaAllocation,
  SingleBellCurveCard,
  type CompanyUnit,
} from "../hr/CalibrationSetting";
import {
  canUserAccessCalibrationSoyApproval,
  getActiveUser,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
} from "../../store/authStore";
import { hasRolePermission } from "../hr/settings/AccessManagement";
import { AnalyticsStatCard, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import { resolveGradeColorHex } from "../shared/scoringWeightStore";

const STATUS_TONE: Record<SoyStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Revision: "bg-orange-50 text-orange-700 border-orange-200",
};

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(v: string) {
  return parseFloat(String(v).replace("%", "")) || 0;
}

const DEFAULT_SCORING_GRADE_TONE: Record<string, string> = {
  "A+": "#10B981",
  A: "#3B82F6",
  B: "#F59E0B",
  C: "#EF4444",
  D: "#DC2626",
  E: "#991B1B",
};
const gradeTone = (g: string, companyName?: string) =>
  resolveGradeColorHex(g, companyName) ?? DEFAULT_SCORING_GRADE_TONE[g] ?? "#1A284F";

const UNIT_PILL_PALETTES = [
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-800 border-amber-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-orange-50 text-orange-700 border-orange-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
];

const SOFT_ROW_PALETTE = [
  "bg-[#F6FAFF] hover:bg-[#EDF4FC]",
  "bg-[#F4FBF9] hover:bg-[#EBF6F3]",
  "bg-[#FFFBF4] hover:bg-[#FDF3E3]",
  "bg-[#F8F9FC] hover:bg-[#EFF2F9]",
];

const SECTION_HEAD_TONE: Record<string, string> = {
  unit: "from-slate-100 via-white to-blue-50 text-[#1A284F]",
  division: "from-indigo-50 via-white to-sky-50 text-indigo-800",
  department: "from-emerald-50 via-white to-teal-50 text-emerald-800",
};

function GradeHead({ grade }: { grade: string }) {
  return (
    <span
      className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-md px-1.5 text-[11px] font-black text-white shadow-sm"
      style={{ background: gradeTone(grade) }}
    >
      {grade}
    </span>
  );
}

function ProportionTable({
  title,
  rows,
  grades,
  tone = "division",
  selectedRowId,
  actionTagLabel,
  onActionTagClick,
}: {
  title: string;
  rows: Array<{ id: string; label: string; parent?: string; hc: number; sharePct?: string; calcs: number[] }>;
  grades: SoyApprovalRecord["snapshot"]["calibrationGrades"];
  tone?: "unit" | "division" | "department";
  selectedRowId?: string | null;
  actionTagLabel?: string;
  onActionTagClick?: (rowId: string) => void;
}) {
  const total = rows.reduce((s, r) => s + r.hc, 0);
  const colTotals = grades.map((_, gi) => rows.reduce((s, r) => s + (r.calcs[gi] ?? 0), 0));
  const hasShare = rows.some((r) => Boolean(r.sharePct));
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between bg-gradient-to-r px-5 py-3 ${SECTION_HEAD_TONE[tone]}`}>
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
        <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-[#1A284F] shadow-sm">
          {rows.length} baris · Total HC {total}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50/80 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left">{tone === "unit" ? "Unit Usaha" : "Organisasi"}</th>
              <th className="px-4 py-2.5 text-right">HC</th>
              {hasShare && <th className="px-3 py-2.5 text-right">Share Kuota</th>}
              {grades.map((g) => (
                <th key={g.id} className="px-3 py-2.5 text-center"><GradeHead grade={g.grade} /></th>
              ))}
              <th className="px-3 py-2.5 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={grades.length + (hasShare ? 4 : 3)} className="py-6 text-center text-gray-400">Tidak ada data.</td></tr>
            ) : (
              rows.map((r, ri) => {
                const rowSum = r.calcs.reduce((a, b) => a + b, 0);
                const isSelected = Boolean(selectedRowId && selectedRowId === r.id);
                const tagPalette = UNIT_PILL_PALETTES[ri % UNIT_PILL_PALETTES.length];
                return (
                <tr
                  key={r.id}
                  className={`border-t border-gray-100 transition-colors ${
                    isSelected
                      ? "bg-[#E2EEFB] hover:bg-[#D7E7F8]"
                      : SOFT_ROW_PALETTE[ri % SOFT_ROW_PALETTE.length]
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <span className="font-semibold text-gray-800">{r.label}</span>
                        {r.parent && <span className="block text-[10px] text-gray-400">{r.parent}</span>}
                      </div>
                      {actionTagLabel && onActionTagClick && (
                        <button
                          type="button"
                          onClick={() => onActionTagClick(r.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#1A284F] text-white border-[#1A284F] shadow-2xs"
                              : `${tagPalette} hover:opacity-90`
                          }`}
                        >
                          {actionTagLabel}
                          {isSelected ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex min-w-[34px] justify-center rounded-md bg-[#1A284F]/[0.06] px-2 py-0.5 font-bold tabular-nums text-[#1A284F]">{r.hc}</span>
                  </td>
                  {hasShare && (
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-600 tabular-nums">
                      {r.sharePct ?? "0.0%"}
                    </td>
                  )}
                  {grades.map((g, gi) => {
                    const v = r.calcs[gi] ?? 0;
                    return (
                      <td key={g.id} className="px-3 py-2.5 text-center tabular-nums">
                        {v > 0 ? (
                          <span className="font-bold" style={{ color: gradeTone(g.grade) }}>{v}</span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#1A284F]">{rowSum}</td>
                </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-[#1A284F]/[0.03] font-semibold text-[#1A284F]">
              <tr>
                <td className="px-4 py-2.5">Jumlah ({rows.length})</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{total}</td>
                {hasShare && <td className="px-3 py-2.5 text-right tabular-nums">{total > 0 ? "100.0%" : "0.0%"}</td>}
                {colTotals.map((t, gi) => (
                  <td key={gi} className="px-3 py-2.5 text-center tabular-nums" style={{ color: gradeTone(grades[gi]?.grade ?? "") }}>{t}</td>
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums">{colTotals.reduce((a, b) => a + b, 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export function CalibrationSettingApproval() {
  const activeUser = getActiveUser();
  const [records, setRecords] = useState<Record<string, SoyApprovalRecord>>(() => loadGroupSoyApprovals());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unitFilterId, setUnitFilterId] = useState<string>("ALL");
  const [drillUnitId, setDrillUnitId] = useState<string | null>(null);
  const [drillDivId, setDrillDivId] = useState<string | null>(null);
  const [action, setAction] = useState<"Approved" | "Revision" | "Mengetahui" | null>(null);
  const [note, setNote] = useState("");
  const [authTick, setAuthTick] = useState(0);
  const [isHydratingSoy, setIsHydratingSoy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void refreshGroupSoyApprovalsFromBackend().then((latest) => {
      if (!cancelled) {
        setRecords(latest);
        setIsHydratingSoy(false);
      }
    });
    const refresh = () => {
      setRecords(loadGroupSoyApprovals());
      setAuthTick((t) => t + 1);
    };
    window.addEventListener(SOY_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener("pa-auth-updated", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SOY_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener("pa-auth-updated", refresh);
    };
  }, []);

  const isHrAdmin = isAdminOrHrIcfRole(activeUser.role);
  const isDirector = isDirectorRoleOrGrouping(activeUser);

  const list = useMemo(() => {
    return Object.values(records)
      .filter((r) => resolveGroupSoyRoleForUser(activeUser, r.unitName, true) !== null)
      .sort(
        (a, b) =>
          (a.status === "Pending" ? -1 : 1) - (b.status === "Pending" ? -1 : 1) ||
          b.submittedAt.localeCompare(a.submittedAt),
      );
  }, [records, activeUser, isHrAdmin, isDirector, authTick]);

  const selected = list.find((r) => r.unitId === selectedId) ?? list[0] ?? null;

  useEffect(() => {
    setUnitFilterId("ALL");
    setDrillUnitId(null);
    setDrillDivId(null);
  }, [selected?.unitId]);

  const getGroupRole = (rec: SoyApprovalRecord) => resolveGroupSoyRoleForUser(activeUser, rec.unitName, false);
  const isExplicitMengetahui = (rec: SoyApprovalRecord) => {
    const keys = [rec.unitName, rec.unitId, ...(rec.groupSnapshot?.units?.map((u) => u.name) ?? [])];
    const map = activeUser.soyCalibrationRoleByUnit ?? {};
    const roles = keys.map((k) => map[k]).filter(Boolean);
    return !roles.includes("approver") && roles.includes("mengetahui");
  };

  const canApprove = (rec: SoyApprovalRecord) => {
    const grpRole = getGroupRole(rec);
    if (grpRole === "approve") return true;
    if (isAdminOrHrIcfRole(activeUser.role)) return false;
    return Boolean(isDirector && grpRole !== null && hasRolePermission(activeUser.role || "Employee", "approvals_calibration_soy", "approve"));
  };

  const submitDecision = () => {
    if (!selected || !action) return;
    if (action === "Revision" && !note.trim()) return;
    if (action === "Mengetahui") {
      acknowledgeSoyApproval(selected.unitId, note);
      toast.success(`Calibration Setting (SOY) ${selected.unitName} telah dikonfirmasi Mengetahui.`);
      setAction(null);
      setNote("");
      return;
    }
    decideSoyApproval(selected.unitId, action, note);
    toast.success(
      action === "Approved"
        ? `Calibration Setting (SOY) ${selected.unitName} disetujui & seluruh Company Units telah dikunci.`
        : `Permintaan revisi dikirim ke HR untuk ${selected.unitName}.`,
    );
    setAction(null);
    setNote("");
  };

  const grpSnap = selected?.groupSnapshot;
  const memberUnitsAsCompany: CompanyUnit[] = useMemo(() => {
    if (!grpSnap?.units) return [];
    return grpSnap.units.map((u) => ({
      id: u.id,
      name: u.name,
      code: u.code || u.id,
      industry: "",
      calibrationGrades: u.calibrationGrades,
      unitQuotaTargets: u.unitQuotaTargets,
      divisionProportions: u.divisionProportions,
      departemenenProportions: u.departemenenProportions,
      bagianProportions: u.bagianProportions,
    }));
  }, [grpSnap]);

  const groupAlloc = useMemo(() => {
    if (!grpSnap || memberUnitsAsCompany.length === 0) return null;
    return computeGroupQuotaAllocation({
      calibrationGrades: grpSnap.calibrationGrades,
      units: memberUnitsAsCompany,
      unitCustomQuotas: grpSnap.unitCustomQuotas,
    });
  }, [grpSnap, memberUnitsAsCompany]);

  const filteredUnit = useMemo(
    () => (unitFilterId === "ALL" ? null : memberUnitsAsCompany.find((u) => u.id === unitFilterId) ?? null),
    [unitFilterId, memberUnitsAsCompany],
  );

  const filteredUnitAlloc = useMemo(() => {
    if (!filteredUnit || !grpSnap) return null;
    return (
      groupAlloc?.perUnitAlloc[filteredUnit.id] ??
      computeUnitQuotaAllocation({
        calibrationGrades: grpSnap.calibrationGrades,
        divisionProportions: filteredUnit.divisionProportions,
        departemenenProportions: filteredUnit.departemenenProportions,
        bagianProportions: filteredUnit.bagianProportions,
        unitQuotaTargets: filteredUnit.unitQuotaTargets,
      })
    );
  }, [filteredUnit, grpSnap, groupAlloc]);

  const activeGrades = grpSnap?.calibrationGrades ?? selected?.snapshot?.calibrationGrades ?? [];
  const activeScopeLabel = filteredUnit ? `${filteredUnit.name} (${selected?.unitName})` : selected?.unitName ?? "";
  const activeTotalHC = filteredUnit
    ? filteredUnitAlloc?.totalHC ?? 0
    : groupAlloc?.totalHC ?? 0;
  const activeGradeTargets = useMemo(() => {
    if (filteredUnit) {
      return groupAlloc?.unitMatrix[filteredUnit.id] ?? filteredUnitAlloc?.unitGradeTargets ?? [];
    }
    if (!groupAlloc) return [];
    const unitSums = activeGrades.map((_, gi) =>
      memberUnitsAsCompany.reduce((s, u) => s + (groupAlloc.unitMatrix[u.id]?.[gi] ?? 0), 0),
    );
    return unitSums.some((v, i) => v !== groupAlloc.groupGradeTargets[i])
      ? unitSums
      : groupAlloc.groupGradeTargets;
  }, [filteredUnit, groupAlloc, filteredUnitAlloc, activeGrades, memberUnitsAsCompany]);

  const activeTargetSum = activeGradeTargets.reduce((a, b) => a + b, 0);

  const unitPalette = (unitId: string) => {
    const idx = Math.max(0, list.findIndex((r) => r.unitId === unitId));
    return UNIT_PILL_PALETTES[idx % UNIT_PILL_PALETTES.length];
  };
  const gradeCardTones: AnalyticsCardTone[] = ["emerald", "navy", "terracotta", "rose", "rose", "slate"];

  // CALIBRATION.6: Tabel Proporsi per Divisi muncul hanya saat tag "Lihat Divisi" pada baris Unit Usaha diklik (diurutkan A-Z)
  const activeDrillUnit = useMemo(
    () => (drillUnitId ? memberUnitsAsCompany.find((u) => u.id === drillUnitId) ?? null : null),
    [drillUnitId, memberUnitsAsCompany],
  );

  const divisionTableRows = useMemo(() => {
    if (!groupAlloc || !activeDrillUnit) return [];
    const uAlloc = groupAlloc.perUnitAlloc[activeDrillUnit.id];
    return [...activeDrillUnit.divisionProportions]
      .sort((a, b) => a.divisi.localeCompare(b.divisi, "id"))
      .map((d) => ({
        id: d.id,
        label: d.divisi,
        hc: d.hc,
        sharePct: uAlloc && uAlloc.totalHC > 0 ? `${((d.hc / uAlloc.totalHC) * 100).toFixed(1)}%` : "0.0%",
        calcs: uAlloc?.divMatrix[d.id] ?? [],
      }));
  }, [groupAlloc, activeDrillUnit]);

  const activeDrillDiv = useMemo(
    () => (activeDrillUnit && drillDivId ? activeDrillUnit.divisionProportions.find((d) => d.id === drillDivId) ?? null : null),
    [activeDrillUnit, drillDivId],
  );

  // CALIBRATION.6: Tabel Proporsi per Departemen muncul hanya saat tag "Lihat Departemen" pada baris Divisi diklik (diurutkan A-Z)
  const departmentTableRows = useMemo(() => {
    if (!groupAlloc || !activeDrillUnit || !activeDrillDiv) return [];
    const uAlloc = groupAlloc.perUnitAlloc[activeDrillUnit.id];
    const depts = activeDrillUnit.departemenenProportions.filter((dep) => dep.divisiId === activeDrillDiv.id);
    const sibHc = depts.reduce((s, x) => s + x.hc, 0);
    return [...depts]
      .sort((a, b) => a.departemen.localeCompare(b.departemen, "id"))
      .map((dep) => ({
        id: dep.id,
        label: dep.departemen,
        parent: activeDrillDiv.divisi,
        hc: dep.hc,
        sharePct: sibHc > 0 ? `${((dep.hc / sibHc) * 100).toFixed(1)}%` : "0.0%",
        calcs: uAlloc?.deptMatrix[dep.id] ?? [],
      }));
  }, [groupAlloc, activeDrillUnit, activeDrillDiv]);

  if (!canUserAccessCalibrationSoyApproval(activeUser)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center">
        <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-600" />
        <p className="text-sm font-bold text-amber-900">Akses Halaman Terbatas</p>
        <p className="mt-1 text-xs text-amber-800">
          Halaman Calibration Approval — Setting (SOY) hanya dapat diakses oleh user yang diberikan akses pada Peran Approval Setting (SOY) atau role Director, DirectorNonOpr, BOD, Administrator, dan HR ICF.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A284F]/8 text-[#1A284F]"><Settings className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-800">Calibration Approval — Setting (SOY)</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            Persetujuan Distribusi &amp; Proporsi Grade HC Awal Tahun (SOY) berbasis Group (dapat difilter per Unit Usaha).
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-400">
          {isHydratingSoy
            ? "Memuat data pengajuan Calibration Setting (SOY)..."
            : "Belum ada pengajuan Calibration Setting (SOY) Group dalam kewenangan Anda."}
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          {/* Bar Pilih Group + Filter Unit Usaha + Bell Curve */}
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {list.map((r) => {
                const active = selected?.unitId === r.unitId;
                return (
                  <React.Fragment key={r.unitId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.unitId)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${unitPalette(r.unitId)} ${
                        active ? "ring-2 ring-[#1A284F]/30 shadow-sm" : "opacity-75 hover:opacity-100"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {r.unitName}
                      <span
                        className={`h-2 w-2 rounded-full ${r.status === "Approved" ? "bg-emerald-500" : r.status === "Revision" ? "bg-orange-500" : "bg-amber-400"}`}
                        title={r.status}
                      />
                    </button>
                  </React.Fragment>
                );
              })}
              {selected && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                    <Clock className="h-3 w-3" /> Disubmit oleh <strong className="font-semibold text-slate-800">{formatActorWithPosition(selected.submittedBy)}</strong> · {fmt(selected.submittedAt)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/70 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                    HC {filteredUnit ? filteredUnit.code : selected.unitName}: {activeTotalHC}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[selected.status]}`}>{selected.status}</span>
                </div>
              )}
            </div>

            {/* Filter per Unit Usaha di dalam Group */}
            {selected && memberUnitsAsCompany.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mr-1">
                  <Filter className="h-3 w-3" /> Filter Unit Usaha:
                </span>
                <button
                  type="button"
                  onClick={() => setUnitFilterId("ALL")}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    unitFilterId === "ALL"
                      ? "bg-[#1A284F] text-white border-[#1A284F]"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  Semua Unit ({selected.unitName}) · HC {groupAlloc?.totalHC ?? 0}
                </button>
                {memberUnitsAsCompany.map((u) => {
                  const isSel = unitFilterId === u.id;
                  const uHc = groupAlloc?.unitHCs[u.id] ?? 0;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setUnitFilterId(isSel ? "ALL" : u.id)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        isSel
                          ? "bg-[#2F5597] text-white border-[#2F5597]"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <Building2 className="h-3 w-3" />
                      {u.name} ({uHc})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected && activeGrades.length > 0 && (
            <div className="flex w-full flex-col gap-4">
              {/* Ringkasan kartu grade format Analytics Dashboard */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {activeGrades.map((g, gi) => {
                  const kuota = activeGradeTargets[gi] ?? 0;
                  return (
                    <AnalyticsStatCard
                      key={g.id}
                      index={gi}
                      compact
                      tone={gradeCardTones[gi % gradeCardTones.length]}
                      title={`Grade ${g.grade} (${g.proporsi})`}
                      value={kuota}
                      subtitle={filteredUnit ? `Kuota ${filteredUnit.code}` : `Kuota ${selected.unitName}`}
                      icon={<span className="text-xs font-black">{g.grade}</span>}
                    />
                  );
                })}
              </div>

              {/* Tabel Distribusi & Proporsi Grade berdampingan dengan Grade Distribution (Bell Curve) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
                <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between bg-gradient-to-r from-[#1A284F] to-[#2B3F73] px-5 py-3 text-white">
                      <span className="text-xs font-bold uppercase tracking-wide">
                        Distribusi &amp; Proporsi Grade — {activeScopeLabel}
                      </span>
                      <span className="text-[11px] text-white/70">Total HC {activeTotalHC}</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50/80 text-[10px] uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-5 py-2.5 text-left">Grade</th>
                          <th className="px-5 py-2.5 text-right">Proporsi</th>
                          <th className="px-5 py-2.5 text-right">Kuota (HC {activeTotalHC})</th>
                          <th className="px-5 py-2.5 text-left">Distribusi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeGrades.map((g, gi) => {
                          const kuota = activeGradeTargets[gi] ?? 0;
                          const share = activeTargetSum > 0 ? (kuota / activeTargetSum) * 100 : pct(g.proporsi);
                          const c = gradeTone(g.grade);
                          return (
                            <tr key={g.id} className="border-t border-gray-100 hover:bg-indigo-50/30">
                              <td className="px-5 py-2.5"><GradeHead grade={g.grade} /></td>
                              <td className="px-5 py-2.5 text-right font-semibold text-gray-600">{g.proporsi}</td>
                              <td className="px-5 py-2.5 text-right text-sm font-black tabular-nums" style={{ color: c }}>{kuota}</td>
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-36 overflow-hidden rounded-full bg-gray-100">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(share, 100)}%`, background: c }} />
                                  </div>
                                  <span className="text-[10px] font-semibold text-gray-500">{share.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-[#1A284F]/[0.03] font-semibold text-[#1A284F]">
                        <tr>
                          <td className="px-5 py-2.5">Total</td>
                          <td className="px-5 py-2.5 text-right">{activeGrades.reduce((s, g) => s + pct(g.proporsi), 0)}%</td>
                          <td className="px-5 py-2.5 text-right">{activeTargetSum}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <SingleBellCurveCard
                  title={`Grade Distribution (Bell Curve) — ${activeScopeLabel}`}
                  subtitle={
                    filteredUnit
                      ? `Kurva distribusi proporsi & kuota karyawan untuk unit ${filteredUnit.name}`
                      : `Kurva distribusi proporsi & kuota karyawan gabungan ${selected.unitName}`
                  }
                  calibrationGrades={activeGrades}
                  gradeCounts={activeGradeTargets}
                />
              </div>

              {/* CALIBRATION.6: Proporsi per Unit Usaha dengan tag warna "Lihat Divisi" -> Proporsi per Divisi (A-Z) -> tag "Lihat Departemen" -> Proporsi per Departemen (A-Z) */}
              {groupAlloc && memberUnitsAsCompany.length > 0 && (
                <ProportionTable
                  title={`Proporsi per Unit Usaha — ${selected.unitName}`}
                  tone="unit"
                  grades={activeGrades}
                  selectedRowId={drillUnitId}
                  actionTagLabel="Lihat Divisi"
                  onActionTagClick={(uid) => {
                    setDrillUnitId((prev) => {
                      const next = prev === uid ? null : uid;
                      setDrillDivId(null);
                      return next;
                    });
                  }}
                  rows={memberUnitsAsCompany.map((u) => ({
                    id: u.id,
                    label: u.name,
                    hc: groupAlloc.unitHCs[u.id] ?? 0,
                    sharePct: `${(groupAlloc.unitShareMap[u.id] ?? 0).toFixed(1)}%`,
                    calcs: groupAlloc.unitMatrix[u.id] ?? [],
                  }))}
                />
              )}

              {activeDrillUnit && (
                <ProportionTable
                  title={`Proporsi per Divisi — ${activeDrillUnit.name} (A–Z)`}
                  tone="division"
                  grades={activeGrades}
                  selectedRowId={drillDivId}
                  actionTagLabel="Lihat Departemen"
                  onActionTagClick={(divId) => setDrillDivId((prev) => (prev === divId ? null : divId))}
                  rows={divisionTableRows}
                />
              )}
              {activeDrillUnit && activeDrillDiv && (
                <ProportionTable
                  title={`Proporsi per Departemen — ${activeDrillDiv.divisi} (${activeDrillUnit.name}) (A–Z)`}
                  tone="department"
                  grades={activeGrades}
                  rows={departmentTableRows}
                />
              )}

              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Riwayat</p>
                <ul className="space-y-1.5 text-xs">
                  {[...selected.history].reverse().map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-700">{h.status}</span>
                      <span className="text-gray-600 font-medium">{formatActorWithPosition(h.by)}</span>
                      <span className="text-gray-400">{fmt(h.at)}</span>
                      {h.note && <span className="w-full text-gray-600">“{h.note}”</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {(() => {
                const myAck = selected.acknowledgedBy?.[activeUser.employeeId.trim().toUpperCase()];
                if (isExplicitMengetahui(selected)) {
                  return myAck ? (
                    <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-xs font-medium text-sky-800">
                      <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0" />
                      <span>
                        Telah Diketahui oleh <strong>{formatActorWithPosition(myAck.by)}</strong> pada {fmt(myAck.at)}.
                      </span>
                    </div>
                  ) : (
                    <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white px-5 py-4 shadow-sm">
                      <span className="text-xs text-slate-600">
                        Akun Anda memiliki peran <strong className="text-sky-700">Mengetahui</strong> untuk <strong>{selected.unitName}</strong>.
                      </span>
                      <button
                        type="button"
                        onClick={() => { setAction("Mengetahui"); setNote(""); }}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#1A284F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#131d3b] cursor-pointer"
                      >
                        <UserCheck className="h-4 w-4" /> Mengetahui
                      </button>
                    </div>
                  );
                }
                if (!canApprove(selected) && selected.status === "Pending") {
                  return (
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-5 py-3 text-xs text-gray-600">
                      <Eye className="h-4 w-4 shrink-0" />
                      <span>Anda memiliki akses <strong>Read Only</strong> untuk <strong>{selected.unitName}</strong> (menunggu persetujuan Director).</span>
                    </div>
                  );
                }
                if (selected.status === "Pending" && canApprove(selected)) {
                  return (
                  <div className="sticky bottom-0 flex justify-end gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
                    <button onClick={() => { setAction("Revision"); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl border-2 border-orange-400 px-5 py-2.5 text-sm font-semibold text-orange-600 hover:bg-orange-50 cursor-pointer">
                      <RotateCcw className="h-4 w-4" /> Request Revision
                    </button>
                    <button onClick={() => { setAction("Approved"); setNote(""); }} className="inline-flex items-center gap-2 rounded-xl bg-[#1A284F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#131d3b] cursor-pointer">
                      <CheckCircle2 className="h-4 w-4" /> Approve {selected.unitName}
                    </button>
                  </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </div>
      )}


      {action && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setAction(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {action === "Approved" ? "Approve" : action === "Mengetahui" ? "Konfirmasi Mengetahui" : "Request Revision"} — {selected.unitName}
              </h3>
              <button onClick={() => setAction(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Catatan {action === "Revision" && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={action === "Revision" ? "Jelaskan bagian yang perlu direvisi…" : "Catatan (opsional)"}
              className="mb-5 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1A284F]/40"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setAction(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={submitDecision}
                disabled={action === "Revision" && !note.trim()}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${
                  action === "Approved"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : action === "Mengetahui"
                    ? "bg-[#1A284F] hover:bg-[#131d3b]"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {action === "Approved" ? "Approve" : action === "Mengetahui" ? "Ya, Mengetahui" : "Kirim Revisi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CalibrationSettingApproval;
