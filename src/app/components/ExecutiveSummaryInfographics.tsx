import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  ExternalLink,
  Filter,
  Flame,
  Gauge,
  Layers,
  LineChart as LineChartIcon,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MASTER_EXEC_SUMMARY_UPDATED_EVENT,
  classifyAchBand,
  formatExecPct,
  loadMasterExecutiveSummary,
  parseExecPct,
  refreshMasterExecutiveSummaryFromBackend,
  resolveAnnualSummaryReport,
  type AchColorBand,
  type ExecSummaryEntityDef,
  type ExecSummaryReportBlock,
  type MasterExecutiveSummaryStore,
} from "../pages/hr/settings/masterExecutiveSummaryStore";
import { isSameCompanyUnit, useAuthStore } from "../store/authStore";
import { hasRolePermission } from "../pages/hr/settings/AccessManagement";

// Palet ketat TANPA warna ungu/violet/fuchsia
const PALETTE = {
  navy: "#1A284F",
  cobalt: "#0A5598",
  sky: "#0284C7",
  teal: "#0D9488",
  emerald: "#059669",
  emeraldBright: "#10B981",
  amber: "#D97706",
  amberBright: "#F59E0B",
  rose: "#E11D48",
  slate: "#475569",
};

const PILLAR_COLORS: Record<string, string> = {
  "ind-k3l": "#0D9488", // Ocean Teal
  "ind-fin": "#0A5598", // Cobalt Blue
  "ind-prd": "#D97706", // Warm Amber
  "ind-emp": "#059669", // Emerald Forest
  "ind-prt": "#0284C7", // Sky Steel
  "ind-reg": "#1A284F", // Deep Navy
};

const BAND_BADGE: Record<
  AchColorBand,
  { bg: string; text: string; border: string; dot: string; solid: string; label: string }
> = {
  green: {
    bg: "#ECFDF5",
    text: "#065F46",
    border: "#A7F3D0",
    dot: "#10B981",
    solid: "#10B981",
    label: "On-Track (≥95%)",
  },
  yellow: {
    bg: "#FFFBEB",
    text: "#92400E",
    border: "#FDE68A",
    dot: "#F59E0B",
    solid: "#F59E0B",
    label: "Watchlist (80–<95%)",
  },
  red: {
    bg: "#FFF1F2",
    text: "#9F1239",
    border: "#FECDD3",
    dot: "#E11D48",
    solid: "#E11D48",
    label: "Kritis (<80%)",
  },
  na: {
    bg: "#F1F5F9",
    text: "#64748B",
    border: "#CBD5E1",
    dot: "#94A3B8",
    solid: "#94A3B8",
    label: "N/A",
  },
};

type HorizonMode = "FY" | "YTD" | "Quarter" | "MTD";
type ScopeFocus = "ALL" | "GROUP" | "UNITS";
type TrendGranularity = "MTD" | "Quarter" | "Horizon";
type UnitMetricView = "ach" | "actual_vs_target";

function AnimatedRadialGauge({
  value,
  band,
  subtitle,
}: {
  value: number;
  band: AchColorBand;
  subtitle: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const strokeColor =
    band === "green" ? PALETTE.emeraldBright : band === "yellow" ? PALETTE.amberBright : PALETTE.rose;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 136 136">
        <circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="11"
        />
        <motion.circle
          cx="68"
          cy="68"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.span
          key={value}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="text-2xl font-extrabold text-white tabular-nums tracking-tight"
        >
          {formatExecPct(value, 1)}
        </motion.span>
        <span className="text-[10px] font-semibold text-sky-200/90 uppercase tracking-wider mt-0.5">
          {subtitle}
        </span>
      </div>
    </div>
  );
}

export function ExecutiveSummaryInfographics({ lockedUnits }: { lockedUnits?: string[] }) {
  const navigate = useNavigate();
  const { activeUser, portalPath } = useAuthStore();
  const [store, setStore] = useState<MasterExecutiveSummaryStore>(() => loadMasterExecutiveSummary());

  // Soft Filter States
  const [horizon, setHorizon] = useState<HorizonMode>("YTD");
  const [selectedReportId, setSelectedReportId] = useState<string>("ytd-jan-oct-26");
  const [scopeFocus, setScopeFocus] = useState<ScopeFocus>("ALL");
  const [spotlightUnitId, setSpotlightUnitId] = useState<string>("ALL");
  const [selectedPillarId, setSelectedPillarId] = useState<string>("ALL");
  const [achBandFilter, setAchBandFilter] = useState<"ALL" | "green" | "yellow" | "red">("ALL");

  // Interactive Chart Mode States
  const [groupTrendMode, setGroupTrendMode] = useState<TrendGranularity>("MTD");
  const [unitTrendMode, setUnitTrendMode] = useState<TrendGranularity>("MTD");
  const [unitMetricView, setUnitMetricView] = useState<UnitMetricView>("ach");
  const [pillarSpotlightForUnits, setPillarSpotlightForUnits] = useState<string>("ind-fin");
  const [inspectedCell, setInspectedCell] = useState<{ indId: string; entId: string } | null>(null);

  useEffect(() => {
    void refreshMasterExecutiveSummaryFromBackend().then((latest) => {
      setStore(latest);
    });
    const onSync = () => setStore(loadMasterExecutiveSummary());
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener(MASTER_EXEC_SUMMARY_UPDATED_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener(MASTER_EXEC_SUMMARY_UPDATED_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const canManageMasterKpi = useMemo(() => {
    const r = activeUser.role || "Employee";
    return r === "Administrator" || r === "HR ICF" || hasRolePermission(r, "setting_master_kpi", "view");
  }, [activeUser.role]);

  // Filter entitas sesuai lockedUnits bila user memiliki pembatasan unit
  const groupEntity = useMemo(
    () => store.entities.find((e) => e.kind === "group") ?? store.entities[0],
    [store.entities],
  );
  const unitEntities = useMemo(() => {
    const allUnits = store.entities.filter((e) => e.kind === "unit");
    if (!lockedUnits || lockedUnits.length === 0) return allUnits;
    const matched = allUnits.filter((u) => lockedUnits.some((lu) => isSameCompanyUnit(lu, u.name)));
    return matched.length > 0 ? matched : allUnits;
  }, [store.entities, lockedUnits]);

  // Kelompok laporan per Horizon
  const annualResolved = useMemo(() => resolveAnnualSummaryReport(store), [store]);
  const ytdReports = useMemo(
    () => [...store.reports.filter((r) => r.periodType === "YTD")].sort((a, b) => b.sortOrder - a.sortOrder),
    [store.reports],
  );
  const quarterReports = useMemo(
    () => [...store.reports.filter((r) => r.periodType === "Quarter")].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.reports],
  );
  const mtdReports = useMemo(
    () => [...store.reports.filter((r) => r.periodType === "MTD")].sort((a, b) => a.sortOrder - b.sortOrder),
    [store.reports],
  );

  // Pastikan selectedReportId selalu valid ketika horizon berubah
  useEffect(() => {
    if (horizon === "FY") {
      setSelectedReportId(annualResolved.report.id);
    } else if (horizon === "YTD") {
      if (!ytdReports.some((r) => r.id === selectedReportId)) {
        setSelectedReportId(ytdReports[0]?.id ?? "");
      }
    } else if (horizon === "Quarter") {
      if (!quarterReports.some((r) => r.id === selectedReportId)) {
        setSelectedReportId(quarterReports[quarterReports.length - 1]?.id ?? "");
      }
    } else if (horizon === "MTD") {
      if (!mtdReports.some((r) => r.id === selectedReportId)) {
        setSelectedReportId(mtdReports[mtdReports.length - 1]?.id ?? "");
      }
    }
  }, [horizon, annualResolved.report.id, ytdReports, quarterReports, mtdReports, selectedReportId]);

  const activeReport: ExecSummaryReportBlock = useMemo(() => {
    if (horizon === "FY") return annualResolved.report;
    const found = store.reports.find((r) => r.id === selectedReportId);
    if (found) return found;
    return ytdReports[0] ?? store.reports[0] ?? annualResolved.report;
  }, [horizon, annualResolved.report, store.reports, selectedReportId, ytdReports]);

  const latestYtdReport = ytdReports[0] ?? annualResolved.report;
  const latestMtdReport = mtdReports[mtdReports.length - 1] ?? activeReport;
  const prevMtdReport = mtdReports.length >= 2 ? mtdReports[mtdReports.length - 2] : null;
  const latestQuarterReport = quarterReports[quarterReports.length - 1] ?? activeReport;

  // Filter indikator sesuai tag pilar yang dipilih
  const visibleIndicators = useMemo(() => {
    if (selectedPillarId === "ALL") return store.indicators;
    return store.indicators.filter((i) => i.id === selectedPillarId);
  }, [store.indicators, selectedPillarId]);

  // ── 1. Data Hero & Ranking Unit Usaha pada Horizon Aktif ──
  const groupActiveTotal = useMemo(() => {
    const raw = activeReport.totals?.[groupEntity.id];
    const num = parseExecPct(raw?.ach) ?? 0;
    const band = classifyAchBand(raw?.ach, true, raw?.bandOverride);
    return { num, raw: raw?.ach || formatExecPct(num, 1), band };
  }, [activeReport, groupEntity.id]);

  const groupHorizonSnapshot = useMemo(() => {
    const fyNum = parseExecPct(annualResolved.report.totals?.[groupEntity.id]?.ach) ?? 0;
    const ytdNum = parseExecPct(latestYtdReport.totals?.[groupEntity.id]?.ach) ?? 0;
    const qNum = parseExecPct(latestQuarterReport.totals?.[groupEntity.id]?.ach) ?? 0;
    const mNum = parseExecPct(latestMtdReport.totals?.[groupEntity.id]?.ach) ?? 0;
    const prevMNum = prevMtdReport ? parseExecPct(prevMtdReport.totals?.[groupEntity.id]?.ach) : null;
    return {
      fy: fyNum,
      ytd: ytdNum,
      quarter: qNum,
      quarterLabel: latestQuarterReport.shortLabel,
      mtd: mNum,
      mtdLabel: latestMtdReport.shortLabel,
      mtdDelta: prevMNum !== null ? Math.round((mNum - prevMNum) * 10) / 10 : null,
    };
  }, [annualResolved.report, latestYtdReport, latestQuarterReport, latestMtdReport, prevMtdReport, groupEntity.id]);

  const rankedUnits = useMemo(() => {
    return unitEntities
      .map((ent) => {
        const tot = activeReport.totals?.[ent.id];
        const achNum = parseExecPct(tot?.ach) ?? 0;
        const band = classifyAchBand(tot?.ach, true, tot?.bandOverride);
        // Hitung momentum Q1 -> Q4 (atau Mei -> Okt)
        const q1 = quarterReports[0] ? parseExecPct(quarterReports[0].totals?.[ent.id]?.ach) : null;
        const qLast = quarterReports.length > 1 ? parseExecPct(quarterReports[quarterReports.length - 1].totals?.[ent.id]?.ach) : null;
        const qDelta = q1 !== null && qLast !== null ? Math.round((qLast - q1) * 10) / 10 : null;

        let greenCount = 0;
        let yellowCount = 0;
        let redCount = 0;
        for (const ind of store.indicators) {
          const cell = activeReport.cells?.[ind.id]?.[ent.id];
          if (!cell || !cell.applicable) continue;
          const b = classifyAchBand(cell.ach, true);
          if (b === "green") greenCount++;
          else if (b === "yellow") yellowCount++;
          else if (b === "red") redCount++;
        }
        return {
          entity: ent,
          achNum,
          achStr: tot?.ach || formatExecPct(achNum, 1),
          band,
          qDelta,
          greenCount,
          yellowCount,
          redCount,
        };
      })
      .filter((item) => achBandFilter === "ALL" || item.band === achBandFilter)
      .sort((a, b) => b.achNum - a.achNum);
  }, [unitEntities, activeReport, quarterReports, store.indicators, achBandFilter]);

  // ── 2. Data Perspektif RSUP Group ──
  const rsupGroupMultiHorizonData = useMemo(() => {
    const items: Array<{ label: string; category: string; ach: number; target: number; band: AchColorBand }> = [];
    const pushPoint = (label: string, category: string, rep: ExecSummaryReportBlock) => {
      const tot = rep.totals?.[groupEntity.id];
      const ach = parseExecPct(tot?.ach) ?? 0;
      items.push({
        label,
        category,
        ach,
        target: 100,
        band: classifyAchBand(tot?.ach, true, tot?.bandOverride),
      });
    };
    pushPoint("Tahun '26", "Setahun", annualResolved.report);
    if (latestYtdReport) pushPoint("YTD Okt'26", "YTD", latestYtdReport);
    quarterReports.forEach((q) => pushPoint(q.shortLabel, "Quarter", q));
    mtdReports.forEach((m) => pushPoint(m.shortLabel, "Perbulan", m));
    return items;
  }, [annualResolved.report, latestYtdReport, quarterReports, mtdReports, groupEntity.id]);

  const rsupGroupPillarBreakdown = useMemo(() => {
    return visibleIndicators
      .map((ind) => {
        const cell = activeReport.cells?.[ind.id]?.[groupEntity.id];
        if (!cell || !cell.applicable) return null;
        const bobot = parseExecPct(cell.bobot) ?? 0;
        const actual = parseExecPct(cell.actual) ?? 0;
        const ach = parseExecPct(cell.ach) ?? 0;
        const band = classifyAchBand(cell.ach, true);
        if (achBandFilter !== "ALL" && band !== achBandFilter) return null;
        const pointGap = Math.max(0, Math.round((bobot - actual) * 100) / 100);
        return {
          id: ind.id,
          name: ind.shortLabel,
          fullName: ind.label,
          bobot,
          actual,
          ach,
          achStr: cell.ach,
          bobotStr: cell.bobot,
          actualStr: cell.actual,
          pointGap,
          band,
          color: PILLAR_COLORS[ind.id] ?? PALETTE.cobalt,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [visibleIndicators, activeReport, groupEntity.id, achBandFilter]);

  const rsupGroupPillarTrendData = useMemo(() => {
    const blocks: ExecSummaryReportBlock[] =
      groupTrendMode === "MTD"
        ? mtdReports
        : groupTrendMode === "Quarter"
        ? quarterReports
        : [...quarterReports, ...(latestYtdReport ? [latestYtdReport] : []), annualResolved.report];
    return blocks.map((rep) => {
      const row: Record<string, string | number> = {
        period: rep.shortLabel,
        totalAch: parseExecPct(rep.totals?.[groupEntity.id]?.ach) ?? 0,
      };
      for (const ind of store.indicators) {
        const cell = rep.cells?.[ind.id]?.[groupEntity.id];
        if (cell && cell.applicable) {
          row[ind.id] = parseExecPct(cell.ach) ?? 0;
        }
      }
      return row;
    });
  }, [groupTrendMode, mtdReports, quarterReports, latestYtdReport, annualResolved.report, store.indicators, groupEntity.id]);

  // ── 3. Data Perbandingan Antar Unit Usaha ──
  const unitHorizonComparisonData = useMemo(() => {
    return unitEntities
      .filter((u) => spotlightUnitId === "ALL" || u.id === spotlightUnitId)
      .map((u) => ({
        id: u.id,
        unit: u.shortName,
        fullName: u.name,
        color: u.colorHex,
        Setahun: parseExecPct(annualResolved.report.totals?.[u.id]?.ach) ?? 0,
        YTD: parseExecPct(latestYtdReport.totals?.[u.id]?.ach) ?? 0,
        Quarter: parseExecPct(
          (horizon === "Quarter" ? activeReport : latestQuarterReport).totals?.[u.id]?.ach,
        ) ?? 0,
        Perbulan: parseExecPct(
          (horizon === "MTD" ? activeReport : latestMtdReport).totals?.[u.id]?.ach,
        ) ?? 0,
      }));
  }, [
    unitEntities,
    spotlightUnitId,
    annualResolved.report,
    latestYtdReport,
    latestQuarterReport,
    latestMtdReport,
    horizon,
    activeReport,
  ]);

  const unitBySelectedPillarData = useMemo(() => {
    const targetInd =
      store.indicators.find((i) => i.id === (selectedPillarId !== "ALL" ? selectedPillarId : pillarSpotlightForUnits)) ??
      store.indicators[0];
    const rows = [groupEntity, ...unitEntities]
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || e.kind === "group")
      .map((ent) => {
        const cell = activeReport.cells?.[targetInd.id]?.[ent.id];
        const applicable = Boolean(cell?.applicable);
        const bobot = applicable ? parseExecPct(cell?.bobot) ?? 0 : 0;
        const actual = applicable ? parseExecPct(cell?.actual) ?? 0 : 0;
        const ach = applicable ? parseExecPct(cell?.ach) ?? 0 : 0;
        const band = classifyAchBand(cell?.ach, applicable);
        return {
          id: ent.id,
          entity: ent.shortName,
          fullName: ent.name,
          isGroup: ent.kind === "group",
          applicable,
          bobot,
          actual,
          ach,
          gap: Math.max(0, Math.round((bobot - actual) * 100) / 100),
          band,
          color: ent.colorHex,
        };
      })
      .filter((r) => r.applicable && (achBandFilter === "ALL" || r.band === achBandFilter));
    return { indicator: targetInd, rows };
  }, [
    store.indicators,
    selectedPillarId,
    pillarSpotlightForUnits,
    groupEntity,
    unitEntities,
    spotlightUnitId,
    activeReport,
    achBandFilter,
  ]);

  const unitTrajectoryData = useMemo(() => {
    const blocks: ExecSummaryReportBlock[] =
      unitTrendMode === "MTD"
        ? mtdReports
        : unitTrendMode === "Quarter"
        ? quarterReports
        : [...quarterReports, ...(latestYtdReport ? [latestYtdReport] : []), annualResolved.report];
    return blocks.map((rep) => {
      const row: Record<string, string | number> = {
        period: rep.shortLabel,
        [groupEntity.id]: parseExecPct(rep.totals?.[groupEntity.id]?.ach) ?? 0,
      };
      for (const u of unitEntities) {
        row[u.id] = parseExecPct(rep.totals?.[u.id]?.ach) ?? 0;
      }
      return row;
    });
  }, [unitTrendMode, mtdReports, quarterReports, latestYtdReport, annualResolved.report, groupEntity, unitEntities]);

  // ── 4. Data BOD Strategic Intelligence Suite (Saran Perspektif BOD) ──

  // 4A. Weighted Gap-to-100% Attribution (Pareto Defisit Poin Bobot per Entitas)
  const gapAttributionData = useMemo(() => {
    const entitiesList =
      scopeFocus === "GROUP"
        ? [groupEntity]
        : scopeFocus === "UNITS"
        ? unitEntities
        : [groupEntity, ...unitEntities];
    return entitiesList
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || e.kind === "group")
      .map((ent) => {
        const totAch = parseExecPct(activeReport.totals?.[ent.id]?.ach) ?? 0;
        const losses: Array<{ indId: string; label: string; loss: number; ach: number; color: string }> = [];
        let totalLoss = 0;
        for (const ind of store.indicators) {
          const cell = activeReport.cells?.[ind.id]?.[ent.id];
          if (!cell || !cell.applicable) continue;
          const b = parseExecPct(cell.bobot) ?? 0;
          const a = parseExecPct(cell.actual) ?? 0;
          const loss = Math.max(0, Math.round((b - a) * 100) / 100);
          if (loss > 0) {
            losses.push({
              indId: ind.id,
              label: ind.shortLabel,
              loss,
              ach: parseExecPct(cell.ach) ?? 0,
              color: PILLAR_COLORS[ind.id] ?? PALETTE.amber,
            });
            totalLoss += loss;
          }
        }
        losses.sort((a, b) => b.loss - a.loss);
        return {
          entity: ent,
          achieved: totAch,
          totalLoss: Math.round(totalLoss * 10) / 10,
          losses,
          topDrag: losses[0] ?? null,
        };
      });
  }, [scopeFocus, groupEntity, unitEntities, spotlightUnitId, activeReport, store.indicators]);

  // 4B. Balanced Scorecard Radar (RSUP Group vs Top Unit vs Spotlight/Watch Unit)
  const radarComparison = useMemo(() => {
    const focusUnit: ExecSummaryEntityDef | undefined =
      spotlightUnitId !== "ALL"
        ? unitEntities.find((u) => u.id === spotlightUnitId)
        : rankedUnits[0]?.entity ?? unitEntities[0];
    const watchUnit: ExecSummaryEntityDef | undefined =
      spotlightUnitId !== "ALL"
        ? rankedUnits[0]?.entity?.id !== spotlightUnitId
          ? rankedUnits[0]?.entity
          : rankedUnits[rankedUnits.length - 1]?.entity
        : rankedUnits[rankedUnits.length - 1]?.entity;

    const data = store.indicators.map((ind) => {
      const gCell = activeReport.cells?.[ind.id]?.[groupEntity.id];
      const fCell = focusUnit ? activeReport.cells?.[ind.id]?.[focusUnit.id] : undefined;
      const wCell = watchUnit ? activeReport.cells?.[ind.id]?.[watchUnit.id] : undefined;
      return {
        pillar: ind.shortLabel,
        groupVal: gCell?.applicable ? Math.min(105, parseExecPct(gCell.ach) ?? 0) : 0,
        focusVal: fCell?.applicable ? Math.min(105, parseExecPct(fCell.ach) ?? 0) : 0,
        watchVal: wCell?.applicable ? Math.min(105, parseExecPct(wCell.ach) ?? 0) : 0,
      };
    });
    return { focusUnit, watchUnit, data };
  }, [store.indicators, activeReport, groupEntity.id, spotlightUnitId, unitEntities, rankedUnits]);

  // 4C. Consistency & Momentum Index (Stabilitas Bulanan & Akselerasi Q1->Q4)
  const consistencyMatrix = useMemo(() => {
    return [groupEntity, ...unitEntities].map((ent) => {
      const mVals = mtdReports
        .map((m) => parseExecPct(m.totals?.[ent.id]?.ach))
        .filter((v): v is number => v !== null);
      const mean = mVals.length > 0 ? mVals.reduce((a, b) => a + b, 0) / mVals.length : 0;
      const variance =
        mVals.length > 1
          ? mVals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / mVals.length
          : 0;
      const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
      const minMtd = mVals.length > 0 ? Math.min(...mVals) : 0;
      const maxMtd = mVals.length > 0 ? Math.max(...mVals) : 0;
      const qFirst = quarterReports[0] ? parseExecPct(quarterReports[0].totals?.[ent.id]?.ach) : null;
      const qLast = quarterReports.length > 0 ? parseExecPct(quarterReports[quarterReports.length - 1].totals?.[ent.id]?.ach) : null;
      const qMomentum = qFirst !== null && qLast !== null ? Math.round((qLast - qFirst) * 10) / 10 : 0;
      const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - stdDev * 4)));
      return {
        entity: ent,
        meanMtd: Math.round(mean * 10) / 10,
        stdDev,
        minMtd,
        maxMtd,
        qMomentum,
        stabilityScore,
      };
    });
  }, [groupEntity, unitEntities, mtdReports, quarterReports]);

  // 4D. Cell Drilldown Sparkline (saat sel Heatmap diklik)
  const inspectedCellSeries = useMemo(() => {
    if (!inspectedCell) return null;
    const ind = store.indicators.find((i) => i.id === inspectedCell.indId);
    const ent = store.entities.find((e) => e.id === inspectedCell.entId);
    if (!ind || !ent) return null;
    const timeline = [...quarterReports, ...mtdReports, ...(latestYtdReport ? [latestYtdReport] : []), annualResolved.report];
    const points = timeline
      .map((rep) => {
        const cell = rep.cells?.[ind.id]?.[ent.id];
        if (!cell || !cell.applicable) return null;
        return {
          label: rep.shortLabel,
          type: rep.periodType,
          ach: parseExecPct(cell.ach) ?? 0,
          actual: parseExecPct(cell.actual) ?? 0,
          bobot: parseExecPct(cell.bobot) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return { ind, ent, points };
  }, [inspectedCell, store.indicators, store.entities, quarterReports, mtdReports, latestYtdReport, annualResolved.report]);

  // 4E. Automated BOD Executive Takeaways (100% dihitung live dari store)
  const executiveTakeaways = useMemo(() => {
    const topUnit = rankedUnits[0];
    const bestMomentum = [...consistencyMatrix]
      .filter((x) => x.entity.kind === "unit")
      .sort((a, b) => b.qMomentum - a.qMomentum)[0];

    const criticalCells: Array<{ entName: string; indName: string; ach: number; loss: number }> = [];
    for (const ent of unitEntities) {
      for (const ind of store.indicators) {
        const cell = activeReport.cells?.[ind.id]?.[ent.id];
        if (!cell || !cell.applicable) continue;
        const ach = parseExecPct(cell.ach) ?? 0;
        const b = parseExecPct(cell.bobot) ?? 0;
        const a = parseExecPct(cell.actual) ?? 0;
        if (ach < 80) {
          criticalCells.push({
            entName: ent.shortName,
            indName: ind.shortLabel,
            ach,
            loss: Math.max(0, Math.round((b - a) * 10) / 10),
          });
        }
      }
    }
    criticalCells.sort((a, b) => a.ach - b.ach || b.loss - a.loss);

    const groupGapObj = gapAttributionData.find((g) => g.entity.id === groupEntity.id);
    return {
      topUnit,
      bestMomentum,
      criticalCells: criticalCells.slice(0, 3),
      totalCriticalCount: criticalCells.length,
      groupTopDrag: groupGapObj?.topDrag ?? null,
      groupTotalLoss: groupGapObj?.totalLoss ?? 0,
    };
  }, [rankedUnits, consistencyMatrix, unitEntities, store.indicators, activeReport, gapAttributionData, groupEntity.id]);

  const hasActiveSoftFilter =
    horizon !== "YTD" ||
    scopeFocus !== "ALL" ||
    spotlightUnitId !== "ALL" ||
    selectedPillarId !== "ALL" ||
    achBandFilter !== "ALL";

  const resetFilters = () => {
    setHorizon("YTD");
    setSelectedReportId(ytdReports[0]?.id ?? "");
    setScopeFocus("ALL");
    setSpotlightUnitId("ALL");
    setSelectedPillarId("ALL");
    setAchBandFilter("ALL");
  };

  const masterExecPath = `${portalPath || "/hr"}/settings/master/kpi/executive-summary`;

  return (
    <div className="w-full space-y-5">
      {/* ══ STICKY SOFT-COLORED FILTER TAG BAR (Requirement #5) ══ */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3.5 shadow-sm space-y-2.5">
        {/* Baris 1: Horizon Waktu + Sub-Periode + Link Sumber Data */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              Periode:
            </span>
            {(
              [
                {
                  id: "FY" as const,
                  label: `Setahun (${store.cycleYear})`,
                  idle: "bg-emerald-50/90 text-emerald-800 border-emerald-200 hover:bg-emerald-100/80",
                  active: "bg-emerald-700 text-white border-emerald-700 shadow-xs",
                },
                {
                  id: "YTD" as const,
                  label: "YTD (Jan–Okt'26)",
                  idle: "bg-teal-50/90 text-teal-800 border-teal-200 hover:bg-teal-100/80",
                  active: "bg-teal-700 text-white border-teal-700 shadow-xs",
                },
                {
                  id: "Quarter" as const,
                  label: "Quarter (Q1–Q4)",
                  idle: "bg-amber-50/90 text-amber-800 border-amber-200 hover:bg-amber-100/80",
                  active: "bg-amber-600 text-white border-amber-600 shadow-xs",
                },
                {
                  id: "MTD" as const,
                  label: "Perbulan (MTD)",
                  idle: "bg-sky-50/90 text-sky-800 border-sky-200 hover:bg-sky-100/80",
                  active: "bg-sky-700 text-white border-sky-700 shadow-xs",
                },
              ] as const
            ).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHorizon(h.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  horizon === h.id ? h.active : h.idle
                }`}
              >
                {h.label}
              </button>
            ))}

            {/* Contextual Sub-pills untuk Quarter / MTD / YTD */}
            {horizon === "Quarter" && quarterReports.length > 0 && (
              <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200">
                {quarterReports.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedReportId(q.id)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                      activeReport.id === q.id
                        ? "bg-[#1A284F] text-white border-[#1A284F]"
                        : "bg-amber-50/60 text-amber-900 border-amber-200/80 hover:bg-amber-100"
                    }`}
                  >
                    {q.shortLabel}
                  </button>
                ))}
              </div>
            )}
            {horizon === "MTD" && mtdReports.length > 0 && (
              <div className="flex items-center gap-1 pl-2 ml-1 border-l border-slate-200 flex-wrap">
                {mtdReports.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedReportId(m.id)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                      activeReport.id === m.id
                        ? "bg-[#1A284F] text-white border-[#1A284F]"
                        : "bg-sky-50/60 text-sky-900 border-sky-200/80 hover:bg-sky-100"
                    }`}
                  >
                    {m.shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasActiveSoftFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset Tag
              </button>
            )}
            {canManageMasterKpi && (
              <button
                type="button"
                onClick={() => navigate(masterExecPath)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#1A284F]/6 text-[#1A284F] border border-[#1A284F]/15 hover:bg-[#1A284F]/12 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Kelola Data Master KPI
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </button>
            )}
          </div>
        </div>

        {/* Baris 2: Soft Filter Tags — Fokus Entitas, Spotlight Unit, Pilar KPI & Status ACH */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          {/* Perspektif & Unit Spotlight Tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">
              <Filter className="w-3 h-3 text-sky-600" />
              Fokus:
            </span>
            {(
              [
                { id: "ALL" as const, label: "RSUP Group & Unit" },
                { id: "GROUP" as const, label: "Khusus RSUP Group" },
                { id: "UNITS" as const, label: "Perbandingan Unit Usaha" },
              ] as const
            ).map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => setScopeFocus(sc.id)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                  scopeFocus === sc.id
                    ? "bg-[#1A284F] text-white border-[#1A284F]"
                    : "bg-slate-100/80 text-slate-600 border-slate-200 hover:bg-slate-200/70"
                }`}
              >
                {sc.label}
              </button>
            ))}

            <span className="text-slate-200 mx-0.5">|</span>
            {unitEntities.map((u) => {
              const isSpot = spotlightUnitId === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSpotlightUnitId((prev) => (prev === u.id ? "ALL" : u.id))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                    isSpot
                      ? "text-white shadow-2xs"
                      : "bg-sky-50/60 text-slate-700 border-slate-200/90 hover:bg-sky-100/60"
                  }`}
                  style={
                    isSpot
                      ? { backgroundColor: u.colorHex, borderColor: u.colorHex }
                      : undefined
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: isSpot ? "#ffffff" : u.colorHex }}
                  />
                  {u.shortName}
                </button>
              );
            })}
          </div>

          {/* Status ACH Soft Filter Tags */}
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                {
                  id: "ALL" as const,
                  label: "Semua ACH",
                  idle: "bg-slate-50 text-slate-600 border-slate-200",
                  active: "bg-slate-800 text-white border-slate-800",
                },
                {
                  id: "green" as const,
                  label: "Hijau ≥95%",
                  idle: "bg-emerald-50/80 text-emerald-800 border-emerald-200",
                  active: "bg-emerald-600 text-white border-emerald-600",
                },
                {
                  id: "yellow" as const,
                  label: "Kuning 80–<95%",
                  idle: "bg-amber-50/80 text-amber-800 border-amber-200",
                  active: "bg-amber-500 text-white border-amber-500",
                },
                {
                  id: "red" as const,
                  label: "Merah <80%",
                  idle: "bg-rose-50/80 text-rose-800 border-rose-200",
                  active: "bg-rose-600 text-white border-rose-600",
                },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setAchBandFilter(st.id)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                  achBandFilter === st.id ? st.active : st.idle
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Baris 3: Soft Tags Pilar Indikator KPI Strategis */}
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100/80 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Pilar KPI:
          </span>
          <button
            type="button"
            onClick={() => setSelectedPillarId("ALL")}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
              selectedPillarId === "ALL"
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-teal-50/60 text-teal-900 border-teal-200/80 hover:bg-teal-100/70"
            }`}
          >
            Semua 6 Pilar
          </button>
          {store.indicators.map((ind) => {
            const isAct = selectedPillarId === ind.id;
            const pColor = PILLAR_COLORS[ind.id] ?? PALETTE.cobalt;
            return (
              <button
                key={ind.id}
                type="button"
                onClick={() => {
                  const next = selectedPillarId === ind.id ? "ALL" : ind.id;
                  setSelectedPillarId(next);
                  if (next !== "ALL") setPillarSpotlightForUnits(next);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                  isAct
                    ? "text-white shadow-2xs"
                    : "bg-slate-50/90 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
                style={isAct ? { backgroundColor: pColor, borderColor: pColor } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: isAct ? "#fff" : pColor }}
                />
                {ind.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ HERO EXECUTIVE COMMAND STRIP: RSUP GROUP GAUGE + 5 UNIT SCORECARDS ══ */}
      <motion.div
        key={`hero-${activeReport.id}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4"
      >
        {/* Left 5 cols: RSUP Group Executive Pulse Card */}
        <div
          className="xl:col-span-5 rounded-2xl p-5 text-white shadow-md relative overflow-hidden flex flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, #152243 0%, #1A284F 48%, #0A5598 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, #38BDF8 0%, transparent 70%)" }}
          />
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/12 border border-white/15 text-[10px] font-bold uppercase tracking-wider text-sky-200">
                <Compass className="w-3 h-3" />
                Executive Boardroom Pulse · {activeReport.shortLabel}
              </div>
              <h3 className="text-lg font-extrabold text-white mt-2 leading-tight">
                Konsolidasi {groupEntity.name}
              </h3>
              <p className="text-xs text-sky-100/80 mt-0.5">
                {activeReport.title}
                {horizon === "FY" && annualResolved.isSynthesizedFromQuarters ? " · Rata-rata Q1–Q4" : ""}
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-extrabold border shrink-0"
              style={{
                backgroundColor: BAND_BADGE[groupActiveTotal.band].bg,
                color: BAND_BADGE[groupActiveTotal.band].text,
                borderColor: BAND_BADGE[groupActiveTotal.band].border,
              }}
            >
              {BAND_BADGE[groupActiveTotal.band].label}
            </span>
          </div>

          <div className="flex items-center gap-5 my-4 relative z-10">
            <AnimatedRadialGauge
              value={groupActiveTotal.num}
              band={groupActiveTotal.band}
              subtitle="Total ACH"
            />
            <div className="flex-1 grid grid-cols-2 gap-2">
              {[
                { lbl: `Setahun '${store.cycleYear.slice(-2)}`, val: groupHorizonSnapshot.fy, key: "FY" as const },
                { lbl: "YTD (Jan–Okt)", val: groupHorizonSnapshot.ytd, key: "YTD" as const },
                { lbl: `Quarter (${groupHorizonSnapshot.quarterLabel})`, val: groupHorizonSnapshot.quarter, key: "Quarter" as const },
                { lbl: `Bulan (${groupHorizonSnapshot.mtdLabel})`, val: groupHorizonSnapshot.mtd, key: "MTD" as const },
              ].map((hItem) => (
                <button
                  key={hItem.lbl}
                  type="button"
                  onClick={() => setHorizon(hItem.key)}
                  className={`text-left rounded-xl px-3 py-2 border transition-all cursor-pointer ${
                    horizon === hItem.key
                      ? "bg-white/18 border-sky-300/60 shadow-xs"
                      : "bg-white/7 border-white/10 hover:bg-white/12"
                  }`}
                >
                  <p className="text-[10px] text-sky-200/85 font-medium truncate">{hItem.lbl}</p>
                  <p className="text-sm font-extrabold text-white tabular-nums mt-0.5">
                    {formatExecPct(hItem.val, 1)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/12 text-[11px] text-sky-100/85 relative z-10 flex-wrap">
            <span>
              Target Bobot Korporasi: <strong className="text-white">100%</strong> · Defisit ke 100%:{" "}
              <strong className="text-amber-300">
                -{formatExecPct(Math.max(0, 100 - groupActiveTotal.num), 1)}
              </strong>
            </span>
            {groupHorizonSnapshot.mtdDelta !== null && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
                {groupHorizonSnapshot.mtdDelta >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-300" />
                )}
                {groupHorizonSnapshot.mtdDelta >= 0 ? "+" : ""}
                {groupHorizonSnapshot.mtdDelta}% MoM ({groupHorizonSnapshot.mtdLabel})
              </span>
            )}
          </div>
        </div>

        {/* Right 7 cols: 5 Unit Usaha Interactive Ranked Scorecards (Click-to-Spotlight Gimmick) */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-[#1A284F] flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                Peringkat Pencapaian Unit Usaha ({activeReport.shortLabel})
              </h3>
              <p className="text-[11px] text-slate-500">
                Klik kartu unit usaha untuk menyalakan mode <strong>Spotlight</strong> lintas seluruh grafik
              </p>
            </div>
            {spotlightUnitId !== "ALL" && (
              <button
                type="button"
                onClick={() => setSpotlightUnitId("ALL")}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 cursor-pointer"
              >
                <X className="w-3 h-3" /> Tampilkan Semua Unit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {rankedUnits.map((item, idx) => {
              const isSpot = spotlightUnitId === item.entity.id;
              const bMeta = BAND_BADGE[item.band];
              return (
                <motion.button
                  key={item.entity.id}
                  type="button"
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    setSpotlightUnitId((prev) => (prev === item.entity.id ? "ALL" : item.entity.id))
                  }
                  className={`text-left rounded-xl p-3 border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                    isSpot
                      ? "ring-2 ring-[#0A5598] border-[#0A5598] bg-sky-50/40 shadow-sm"
                      : spotlightUnitId !== "ALL"
                      ? "border-slate-200/70 bg-slate-50/40 opacity-65 hover:opacity-100"
                      : "border-slate-200/90 bg-gradient-to-b from-white to-slate-50/60 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: item.entity.colorHex }}
                  />
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700">
                      #{idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: bMeta.dot }}
                      title={bMeta.label}
                    />
                  </div>
                  <div className="my-2">
                    <p className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-1" title={item.entity.name}>
                      {item.entity.shortName}
                    </p>
                    <p className="text-xl font-extrabold text-[#1A284F] tabular-nums mt-0.5">
                      {item.achStr}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, item.achNum)}%` }}
                        transition={{ duration: 0.7, delay: idx * 0.06 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: bMeta.solid }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="font-bold text-emerald-700">{item.greenCount}H</span>·
                        <span className="font-bold text-amber-700">{item.yellowCount}K</span>·
                        <span className="font-bold text-rose-700">{item.redCount}M</span>
                      </span>
                      {item.qDelta !== null && (
                        <span
                          className={`font-bold ${
                            item.qDelta >= 0 ? "text-emerald-700" : "text-rose-600"
                          }`}
                          title="Perubahan Q1 ke Q4"
                        >
                          {item.qDelta >= 0 ? `+${item.qDelta}%` : `${item.qDelta}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Automated QuickBOD Callout Strip */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70 px-2.5 py-1.5 text-emerald-900">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">
                Top Unit: <strong>{executiveTakeaways.topUnit?.entity.shortName ?? "—"}</strong> (
                <strong>{executiveTakeaways.topUnit?.achStr ?? "—"}</strong>)
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-sky-50/70 border border-sky-200/70 px-2.5 py-1.5 text-sky-900">
              <TrendingUp className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">
                Akselerasi Q1→Q4 Terbaik:{" "}
                <strong>{executiveTakeaways.bestMomentum?.entity.shortName ?? "—"}</strong> (
                <strong>
                  {(executiveTakeaways.bestMomentum?.qMomentum ?? 0) >= 0 ? "+" : ""}
                  {executiveTakeaways.bestMomentum?.qMomentum ?? 0}%
                </strong>
                )
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-rose-50/70 border border-rose-200/70 px-2.5 py-1.5 text-rose-900">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="truncate">
                Indikator Kritis (&lt;80%): <strong>{executiveTakeaways.totalCriticalCount} sel</strong> perlu atensi
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ══ SECTION 1: PERSPEKTIF KONSOLIDASI RSUP GROUP (Requirement #6) ══ */}
      {scopeFocus !== "UNITS" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#1A284F] text-white flex items-center justify-center shadow-xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A284F]">
                  Perspektif Konsolidasi {groupEntity.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Perbandingan Setahun, YTD, Quarter &amp; Perbulan · Aktual vs Target (Bobot) per Pilar KPI · Trend Lintas Waktu
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Chart 1A: RSUP Group Summary Comparison Setahun, YTD, Quarter, Perbulan */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                    RSUP Group · Multi-Horizon
                  </span>
                  <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                    Summary Pencapaian RSUP Group: Setahun · YTD · Quarter · Perbulan
                  </h4>
                </div>
              </div>
              <div className="h-[275px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rsupGroupMultiHorizonData} margin={{ top: 12, right: 12, left: -14, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#475569" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      domain={[65, 105]}
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      unit="%"
                    />
                    <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" label={{ value: "Target Hijau 95%", position: "insideTopRight", fontSize: 9, fill: "#059669" }} />
                    <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" label={{ value: "Batas Kritis 80%", position: "insideBottomRight", fontSize: 9, fill: "#E11D48" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof rsupGroupMultiHorizonData)[number];
                        const meta = BAND_BADGE[d.band];
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs space-y-1">
                            <p className="font-bold text-[#1A284F]">{d.label} ({d.category})</p>
                            <p className="font-semibold" style={{ color: meta.solid }}>
                              Total ACH RSUP Group: {formatExecPct(d.ach, 1)}
                            </p>
                            <p className="text-[10px] text-slate-500">Gap ke 100%: -{formatExecPct(100 - d.ach, 1)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ach" radius={[6, 6, 0, 0]} barSize={22} animationDuration={750}>
                      {rsupGroupMultiHorizonData.map((entry, index) => (
                        <Cell
                          key={`grp-bar-${index}`}
                          fill={
                            entry.category === "Setahun"
                              ? "#059669"
                              : entry.category === "YTD"
                              ? "#0D9488"
                              : entry.category === "Quarter"
                              ? "#D97706"
                              : entry.band === "red"
                              ? "#E11D48"
                              : "#0A5598"
                          }
                          fillOpacity={0.86}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="ach"
                      stroke="#1A284F"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#1A284F" }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-slate-500 flex-wrap">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" /> Setahun</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-teal-600" /> YTD</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-amber-600" /> Quarter</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-[#0A5598]" /> Perbulan (MTD)</span>
              </div>
            </div>

            {/* Chart 1B: RSUP Group Aktual vs Target (Bobot) & ACH per Indikator KPI */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                    Aktual vs Target Bobot &amp; ACH · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                    Pencapaian per Indikator KPI — {groupEntity.name}
                  </h4>
                </div>
              </div>

              <div className="space-y-3 my-auto">
                {rsupGroupPillarBreakdown.map((item, idx) => {
                  const bMeta = BAND_BADGE[item.band];
                  const fillRatio = item.bobot > 0 ? Math.min(100, (item.actual / item.bobot) * 100) : 0;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 hover:border-slate-200 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                        <span className="font-bold text-slate-800 truncate" title={item.fullName}>
                          {item.fullName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            Actual <strong className="text-[#1A284F]">{item.actualStr}</strong> / Bobot{" "}
                            <strong>{item.bobotStr}</strong>
                          </span>
                          {item.pointGap > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 tabular-nums">
                              -{formatExecPct(item.pointGap, 1)} poin
                            </span>
                          )}
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-extrabold border tabular-nums min-w-[52px] text-center"
                            style={{
                              backgroundColor: bMeta.bg,
                              color: bMeta.text,
                              borderColor: bMeta.border,
                            }}
                          >
                            ACH {item.achStr}
                          </span>
                        </div>
                      </div>
                      <div className="relative h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${fillRatio}%` }}
                          transition={{ duration: 0.65, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: bMeta.solid }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chart 1C: Trend Multi-Indikator RSUP Group (Perbulan | Quarter | YTD & Tahun) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h4 className="text-sm font-bold text-[#1A284F] flex items-center gap-1.5">
                  <LineChartIcon className="w-4 h-4 text-[#0A5598]" />
                  Trend Pencapaian (ACH %) per Indikator KPI — {groupEntity.name}
                </h4>
                <p className="text-xs text-slate-500">
                  Pergerakan capaian setiap pilar strategis RSUP Group dari waktu ke waktu
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { id: "MTD" as const, label: "Trend Perbulan" },
                    { id: "Quarter" as const, label: "Trend Quarter" },
                    { id: "Horizon" as const, label: "Q1–Q4 · YTD · Tahun" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGroupTrendMode(m.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      groupTrendMode === m.id
                        ? "bg-white text-[#1A284F] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rsupGroupPillarTrendData} margin={{ top: 10, right: 18, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[55, 105]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "#E2E8F0",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  {visibleIndicators
                    .filter((ind) => ind.id !== "ind-reg")
                    .map((ind) => (
                      <Line
                        key={ind.id}
                        type="monotone"
                        dataKey={ind.id}
                        name={ind.shortLabel}
                        stroke={PILLAR_COLORS[ind.id] ?? PALETTE.cobalt}
                        strokeWidth={2.4}
                        dot={{ r: 3.5 }}
                        activeDot={{ r: 5.5 }}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.section>
      )}

      {/* ══ SECTION 2: PERBANDINGAN ANTAR UNIT USAHA (Requirement #4) ══ */}
      {scopeFocus !== "GROUP" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0A5598] text-white flex items-center justify-center shadow-xs">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A284F]">
                  Summary Perbandingan Antar Unit Usaha
                </h3>
                <p className="text-xs text-slate-500">
                  Komparasi lintas Unit Usaha dalam Setahun, YTD, Quarter &amp; Perbulan · Aktual vs Target &amp; ACH per Pilar · Trend Lintasan Unit
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Chart 2A: Summary Perbandingan Unit Usaha dalam Setahun, YTD, Quarter, Perbulan */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Komparasi 4 Horizon Waktu
                </span>
                <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                  Perbandingan Total ACH per Unit Usaha: Setahun · YTD · Quarter · Perbulan
                </h4>
              </div>
              <div className="h-[290px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unitHorizonComparisonData} margin={{ top: 10, right: 12, left: -14, bottom: 4 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="unit" tick={{ fontSize: 10.5, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[60, 105]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                    <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" />
                    <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                      formatter={(val: number) => [`${val}%`, undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Setahun" name={`Setahun '${store.cycleYear.slice(-2)}`} fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="YTD" name="YTD (Jan–Okt)" fill="#0D9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Quarter" name={horizon === "Quarter" ? activeReport.shortLabel : latestQuarterReport.shortLabel} fill="#D97706" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Perbulan" name={horizon === "MTD" ? activeReport.shortLabel : latestMtdReport.shortLabel} fill="#0A5598" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2B: Pencapaian per Indikator KPI (ACH % vs Aktual/Target Bobot) per Unit Usaha */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Komparasi per Indikator · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                    {unitBySelectedPillarData.indicator.label}
                  </h4>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setUnitMetricView("ach")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      unitMetricView === "ach"
                        ? "bg-white text-[#1A284F] shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Kolom ACH (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitMetricView("actual_vs_target")}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                      unitMetricView === "actual_vs_target"
                        ? "bg-white text-[#1A284F] shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Aktual vs Target (Bobot)
                  </button>
                </div>
              </div>

              {/* Quick Pillar Selector Pills */}
              {selectedPillarId === "ALL" && (
                <div className="flex items-center gap-1 mb-2.5 flex-wrap">
                  {store.indicators.map((ind) => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setPillarSpotlightForUnits(ind.id)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                        pillarSpotlightForUnits === ind.id
                          ? "bg-[#0A5598] text-white border-[#0A5598]"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {ind.shortLabel}
                    </button>
                  ))}
                </div>
              )}

              <div className="h-[245px] w-full mt-auto">
                <ResponsiveContainer width="100%" height="100%">
                  {unitMetricView === "ach" ? (
                    <BarChart data={unitBySelectedPillarData.rows} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" />
                      <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof unitBySelectedPillarData.rows)[number];
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs space-y-1">
                              <p className="font-bold text-[#1A284F]">{d.fullName}</p>
                              <p className="font-semibold text-emerald-700">ACH: {formatExecPct(d.ach, 1)}</p>
                              <p className="text-slate-600">
                                Actual: <strong>{d.actual}%</strong> dari Target Bobot <strong>{d.bobot}%</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="ach" name="Achievement (ACH %)" radius={[6, 6, 0, 0]} barSize={32}>
                        {unitBySelectedPillarData.rows.map((entry) => (
                          <Cell
                            key={entry.id}
                            fill={BAND_BADGE[entry.band].solid}
                            fillOpacity={entry.isGroup ? 0.95 : 0.82}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <BarChart data={unitBySelectedPillarData.rows} margin={{ top: 8, right: 12, left: -14, bottom: 4 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#334155", fontWeight: 600 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                        formatter={(val: number) => [`${val}%`, undefined]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="bobot" name="Target (Bobot %)" fill="#CBD5E1" radius={[5, 5, 0, 0]} barSize={22} />
                      <Bar dataKey="actual" name="Aktual Kontribusi (%)" fill="#0A5598" radius={[5, 5, 0, 0]} barSize={22} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Chart 2C: Trend Lintasan Total ACH Seluruh Unit Usaha (Perbulan | Quarter | YTD & Tahun) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h4 className="text-sm font-bold text-[#1A284F] flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-600" />
                  Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group
                </h4>
                <p className="text-xs text-slate-500">
                  Garis putus-putus menunjukkan benchmark konsolidasi RSUP Group terhadap masing-masing Unit Usaha
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { id: "MTD" as const, label: "Trend Perbulan" },
                    { id: "Quarter" as const, label: "Trend Quarter" },
                    { id: "Horizon" as const, label: "Q1–Q4 · YTD · Tahun" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setUnitTrendMode(m.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      unitTrendMode === m.id
                        ? "bg-white text-[#1A284F] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[285px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={unitTrajectoryData} margin={{ top: 10, right: 18, left: -12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="rsupGroupBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1A284F" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#1A284F" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[70, 102]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Area
                    type="monotone"
                    dataKey={groupEntity.id}
                    name={`${groupEntity.shortName} (Benchmark)`}
                    fill="url(#rsupGroupBand)"
                    stroke="#1A284F"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                  />
                  {unitEntities.map((u) => {
                    const dimmed = spotlightUnitId !== "ALL" && spotlightUnitId !== u.id;
                    return (
                      <Line
                        key={u.id}
                        type="monotone"
                        dataKey={u.id}
                        name={u.shortName}
                        stroke={u.colorHex}
                        strokeWidth={spotlightUnitId === u.id ? 3.4 : 2.2}
                        strokeOpacity={dimmed ? 0.22 : 1}
                        dot={{ r: spotlightUnitId === u.id ? 4.5 : 3 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.section>
      )}

      {/* ══ SECTION 3: REKOMENDASI INFOGRAFIS STRATEGIS PERSPEKTIF BOD (Requirement #4 & #6) ══ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1A284F]">
                BOD Strategic Intelligence Suite
              </h3>
              <p className="text-xs text-slate-500">
                Matriks Risiko Strategis (Klik Sel untuk Drilldown Trend) · Pareto Defisit Poin Bobot · Keseimbangan &amp; Indeks Konsistensi Eksekusi
              </p>
            </div>
          </div>
        </div>

        {/* 3A. Interactive Strategic ACH Heatmap Matrix + Cell Sparkline Inspector */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#1A284F] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Interactive Risk &amp; Achievement Matrix · {activeReport.shortLabel}
              </span>
              <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                Peta Kesehatan Strategis Lintas Entitas &amp; Pilar KPI (Klik Sel untuk Melihat Histori Trend)
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">≥95% Hijau</span>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">80–&lt;95% Kuning</span>
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300">&lt;80% Merah</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="bg-[#1A284F] text-white">
                  <th className="px-3.5 py-2.5 text-left font-bold">Pilar Indikator KPI</th>
                  {[groupEntity, ...unitEntities].map((ent) => (
                    <th key={ent.id} className="px-3 py-2.5 text-center font-bold whitespace-nowrap">
                      {ent.shortName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleIndicators.map((ind) => (
                  <tr key={ind.id} className="border-t border-slate-100">
                    <td className="px-3.5 py-2.5 font-semibold text-slate-800 bg-slate-50/60">
                      {ind.label}
                    </td>
                    {[groupEntity, ...unitEntities].map((ent) => {
                      const cell = activeReport.cells?.[ind.id]?.[ent.id];
                      if (!cell || !cell.applicable) {
                        return (
                          <td key={`${ind.id}-${ent.id}`} className="px-2 py-2 text-center bg-slate-900 text-slate-400 text-[10px] font-semibold">
                            N/A
                          </td>
                        );
                      }
                      const band = classifyAchBand(cell.ach, true);
                      const meta = BAND_BADGE[band];
                      const isSelected =
                        inspectedCell?.indId === ind.id && inspectedCell?.entId === ent.id;
                      const hiddenByFilter = achBandFilter !== "ALL" && band !== achBandFilter;
                      return (
                        <td key={`${ind.id}-${ent.id}`} className="p-1.5 text-center border-l border-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectedCell((prev) =>
                                prev?.indId === ind.id && prev?.entId === ent.id
                                  ? null
                                  : { indId: ind.id, entId: ent.id },
                              )
                            }
                            className={`w-full rounded-lg px-2 py-1.5 border transition-all cursor-pointer flex flex-col items-center ${
                              isSelected ? "ring-2 ring-[#1A284F] scale-[1.02] shadow-xs" : "hover:brightness-97"
                            } ${hiddenByFilter ? "opacity-25" : ""}`}
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.text,
                              borderColor: meta.border,
                            }}
                            title="Klik untuk membuka grafik trend historis sel ini"
                          >
                            <span className="text-xs font-extrabold tabular-nums">{cell.ach}</span>
                            <span className="text-[9px] opacity-80 tabular-nums">
                              {cell.actual} / {cell.bobot}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Baris Total ACH */}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-extrabold">
                  <td className="px-3.5 py-2.5 text-[#1A284F]">Total Pencapaian ({activeReport.shortLabel})</td>
                  {[groupEntity, ...unitEntities].map((ent) => {
                    const tot = activeReport.totals?.[ent.id];
                    const band = classifyAchBand(tot?.ach, true, tot?.bandOverride);
                    const meta = BAND_BADGE[band];
                    return (
                      <td key={`hm-tot-${ent.id}`} className="p-1.5 text-center border-l border-slate-200">
                        <div
                          className="rounded-lg px-2 py-1.5 border text-xs font-extrabold tabular-nums"
                          style={{
                            backgroundColor: meta.bg,
                            color: meta.text,
                            borderColor: meta.border,
                          }}
                        >
                          {tot?.ach || "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Animated Drilldown Panel saat sel Heatmap diklik */}
          <AnimatePresence>
            {inspectedCellSeries && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-sky-200 bg-sky-50/45 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#1A284F]">
                        Drilldown Lintasan Historis: {inspectedCellSeries.ent.name} —{" "}
                        <span className="text-[#0A5598]">{inspectedCellSeries.ind.label}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Perbandingan Quarter (Q1–Q4), Perbulan (Mei–Okt&apos;26), YTD &amp; Setahun
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectedCell(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="h-[175px] w-full bg-white rounded-xl border border-sky-100 p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={inspectedCellSeries.points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                        <ReferenceLine y={95} stroke="#10B981" strokeDasharray="4 4" />
                        <ReferenceLine y={80} stroke="#E11D48" strokeDasharray="3 3" />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                        <Bar dataKey="ach" name="ACH (%)" fill="#0A5598" fillOpacity={0.22} radius={[4, 4, 0, 0]} barSize={24} />
                        <Line type="monotone" dataKey="ach" name="Trend ACH (%)" stroke="#0A5598" strokeWidth={2.5} dot={{ r: 3.5, fill: "#0A5598" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3B & 3C: Pareto Defisit Poin Bobot + Balanced Scorecard Radar & Consistency Matrix */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 3B: Weighted Gap-to-100% Attribution */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                BOD Diagnostic · Sumber Kehilangan Poin Bobot
              </span>
              <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                Pareto Defisit Poin Menuju 100% ({activeReport.shortLabel})
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Mengidentifikasi pilar yang paling menggerus skor tertimbang di masing-masing entitas
              </p>
            </div>

            <div className="space-y-3 my-auto">
              {gapAttributionData.map((row) => (
                <div key={row.entity.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.entity.colorHex }}
                      />
                      {row.entity.shortName}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      Tercapai <strong className="text-emerald-700">{row.achieved}%</strong> · Defisit{" "}
                      <strong className="text-rose-700">-{row.totalLoss}%</strong>
                      {row.topDrag ? (
                        <span className="text-slate-400">
                          {" "}
                          (Utama: {row.topDrag.label} -{row.topDrag.loss}%)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {/* Stacked 100% Bar: Achieved + Loss segments */}
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, row.achieved)}%` }}
                      title={`Skor Tercapai: ${row.achieved}%`}
                    />
                    {row.losses.map((seg) => (
                      <div
                        key={seg.indId}
                        className="h-full border-l border-white/60 transition-all duration-500"
                        style={{
                          width: `${Math.min(100 - row.achieved, seg.loss)}%`,
                          backgroundColor: seg.ach < 80 ? PALETTE.rose : PALETTE.amberBright,
                        }}
                        title={`Defisit ${seg.label}: -${seg.loss}% (ACH ${seg.ach}%)`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-500 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Poin Bobot Tercapai
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" /> Defisit dari Pilar Watchlist (80–94%)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-600" /> Defisit dari Pilar Kritis (&lt;80%)
              </span>
            </div>
          </div>

          {/* 3C: Balanced Scorecard Radar + Execution Stability Table */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                Balanced Scorecard &amp; Indeks Stabilitas
              </span>
              <h4 className="text-sm font-bold text-[#1A284F] mt-1.5">
                Keseimbangan 6 Pilar KPI &amp; Konsistensi Eksekusi Bulanan
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center my-auto">
              <div className="sm:col-span-6 h-[225px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarComparison.data} outerRadius="70%">
                    <PolarGrid stroke="#E2E8F0" />
                    <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 9.5, fill: "#334155" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 105]} tick={{ fontSize: 8.5, fill: "#94A3B8" }} />
                    <Radar
                      name={groupEntity.shortName}
                      dataKey="groupVal"
                      stroke="#1A284F"
                      fill="#1A284F"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                    {radarComparison.focusUnit && (
                      <Radar
                        name={radarComparison.focusUnit.shortName}
                        dataKey="focusVal"
                        stroke="#059669"
                        fill="#10B981"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    )}
                    {radarComparison.watchUnit &&
                      radarComparison.watchUnit.id !== radarComparison.focusUnit?.id && (
                        <Radar
                          name={radarComparison.watchUnit.shortName}
                          dataKey="watchVal"
                          stroke="#D97706"
                          fill="#F59E0B"
                          fillOpacity={0.14}
                          strokeWidth={1.8}
                        />
                      )}
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Mini Table: Indeks Konsistensi & Momentum */}
              <div className="sm:col-span-6 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stabilitas MTD (Mei–Okt) &amp; Momentum Q1→Q4
                </p>
                {consistencyMatrix.map((cRow) => (
                  <div
                    key={cRow.entity.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-semibold text-slate-700 truncate">
                      {cRow.entity.shortName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className="text-slate-500" title={`Rentang MTD: ${cRow.minMtd}% – ${cRow.maxMtd}% (Deviasi ±${cRow.stdDev}%)`}>
                        σ ±{cRow.stdDev}%
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                          cRow.qMomentum > 0
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : cRow.qMomentum < 0
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {cRow.qMomentum >= 0 ? `+${cRow.qMomentum}%` : `${cRow.qMomentum}%`} QoQ
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3D. Executive Actionable Recommendations for BOD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 shadow-2xs space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <h5 className="text-xs font-extrabold uppercase tracking-wide">
                Benchmark &amp; Momentum Terbaik
              </h5>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              <strong>{executiveTakeaways.topUnit?.entity.name ?? "PT RSUP (Industry)"}</strong> memimpin capaian{" "}
              {activeReport.shortLabel} sebesar <strong>{executiveTakeaways.topUnit?.achStr ?? "95%"}</strong>, sementara{" "}
              <strong>{executiveTakeaways.bestMomentum?.entity.name ?? "PT RSTM"}</strong> mencatat pemulihan kuartalan terkuat (
              <strong>
                {(executiveTakeaways.bestMomentum?.qMomentum ?? 0) >= 0 ? "+" : ""}
                {executiveTakeaways.bestMomentum?.qMomentum ?? 0}%
              </strong>{" "}
              dari Q1 ke Q4).
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 via-white to-white p-4 shadow-2xs space-y-1.5">
            <div className="flex items-center gap-2 text-amber-900">
              <Target className="w-4 h-4 text-amber-600 shrink-0" />
              <h5 className="text-xs font-extrabold uppercase tracking-wide">
                Faktor Pengungkit Skor RSUP Group
              </h5>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {executiveTakeaways.groupTopDrag ? (
                <>
                  Dari total selisih <strong>-{executiveTakeaways.groupTotalLoss}%</strong> menuju 100% pada{" "}
                  <strong>{groupEntity.name}</strong>, kontributor defisit terbesar berada pada pilar{" "}
                  <strong>{executiveTakeaways.groupTopDrag.label}</strong> (kehilangan{" "}
                  <strong>-{executiveTakeaways.groupTopDrag.loss}%</strong> poin bobot; ACH{" "}
                  <strong>{executiveTakeaways.groupTopDrag.ach}%</strong>).
                </>
              ) : (
                <>Seluruh pilar strategis RSUP Group berada pada target optimal pada periode ini.</>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/80 via-white to-white p-4 shadow-2xs space-y-1.5">
            <div className="flex items-center gap-2 text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <h5 className="text-xs font-extrabold uppercase tracking-wide">
                Prioritas Intervensi BOD (ACH &lt;80%)
              </h5>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {executiveTakeaways.criticalCells.length > 0 ? (
                <>
                  Fokus pengawalan RCA &amp; koreksi prioritas:{" "}
                  {executiveTakeaways.criticalCells.map((cItem, idx) => (
                    <span key={`${cItem.entName}-${cItem.indName}`}>
                      {idx > 0 ? "; " : ""}
                      <strong>{cItem.entName}</strong> pada <em>{cItem.indName}</em> (
                      <strong className="text-rose-700">{cItem.ach}%</strong>)
                    </span>
                  ))}
                  .
                </>
              ) : (
                <>Tidak ada indikator berstatus Merah (&lt;80%) pada filter periode yang dipilih.</>
              )}
            </p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
