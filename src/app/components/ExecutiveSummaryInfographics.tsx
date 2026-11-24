// @refresh reset
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  Award,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  Filter,
  Gauge,
  Layers,
  LineChart as LineChartIcon,
  RotateCcw,
  SlidersHorizontal,
  Target,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  EXEC_THEME_PALETTE,
  MASTER_EXEC_SUMMARY_UPDATED_EVENT,
  classifyAchBand,
  formatExecPct,
  loadMasterExecutiveSummary,
  parseExecPct,
  refreshMasterExecutiveSummaryFromBackend,
  type AchColorBand,
  type ExecSummaryReportBlock,
  type MasterExecutiveSummaryStore,
} from "../pages/hr/settings/masterExecutiveSummaryStore";
import { isSameCompanyUnit, useAuthStore } from "../store/authStore";
import { hasRolePermission } from "../pages/hr/settings/AccessManagement";

// Palet warna ikon collapsed Sidebar (tanpa ungu & pink) + Kuning Telur #EA9942 untuk Achievement Kuning
const THEME = EXEC_THEME_PALETTE;

const INDICATOR_COLORS: Record<string, string> = {
  "ind-k3l": "#248277", // Seafoam Teal
  "ind-fin": "#2F5597", // Navy Cobalt
  "ind-prd": "#C76332", // Burnt Sienna Orange
  "ind-emp": "#2E8555", // Muted Emerald
  "ind-prt": "#2378A6", // Cerulean Sky
  "ind-reg": "#85643A", // Warm Bronze Taupe
};

const UNIT_STAT_CARD_SPECS: Record<
  string,
  { gradient: string; border: string; accentHex: string }
> = {
  "rsup-group": {
    gradient: "from-[#EAEFF9] via-[#F6F8FD] to-white",
    border: "border-[#DCE3F2]",
    accentHex: "#2F5597",
  },
  "rsup-ind": {
    gradient: "from-[#EBF2FA] via-[#F6F9FD] to-white",
    border: "border-[#D6E4F5]",
    accentHex: "#3B6EA8",
  },
  "rsup-pkb": {
    gradient: "from-[#E6F4EE] via-[#F4FAF7] to-white",
    border: "border-[#D3EBE1]",
    accentHex: "#2E8555",
  },
  "rsup-asd": {
    gradient: "from-[#E4F4F2] via-[#F3FAF9] to-white",
    border: "border-[#CBE8E4]",
    accentHex: "#248277",
  },
  "rsup-ghs": {
    gradient: "from-[#FDF3E6] via-[#FEFAF4] to-white",
    border: "border-[#F5DFC3]",
    accentHex: "#C07A28",
  },
  "rsup-rstm": {
    gradient: "from-[#E5F3F7] via-[#F3FAFC] to-white",
    border: "border-[#CBE5EE]",
    accentHex: "#1F8699",
  },
};

const ACHIEVEMENT_BADGE: Record<
  AchColorBand,
  { bg: string; softBg: string; text: string; softText: string; border: string; solid: string; label: string }
> = {
  green: {
    bg: "#2E8555",
    softBg: "#E6F4EE",
    text: "#FFFFFF",
    softText: "#1E5C3A",
    border: "#BBDED0",
    solid: "#2E8555",
    label: "Hijau (≥95%)",
  },
  yellow: {
    bg: "#EA9942",
    softBg: "#FDF3E7",
    text: "#FFFFFF",
    softText: "#9A5B13",
    border: "#F3CFA4",
    solid: "#EA9942",
    label: "Kuning (80–<95%)",
  },
  red: {
    bg: "#B84A4A",
    softBg: "#FBEAEA",
    text: "#FFFFFF",
    softText: "#8C3131",
    border: "#E8BFBF",
    solid: "#B84A4A",
    label: "Merah (<80%)",
  },
  na: {
    bg: "#475569",
    softBg: "#F1F5F9",
    text: "#FFFFFF",
    softText: "#475569",
    border: "#CBD5E1",
    solid: "#475569",
    label: "N/A",
  },
};

type HorizonMode = "YTD" | "Quarter" | "MTD";
type ScopeFocus = "ALL" | "GROUP" | "UNITS";
type TrendGranularity = "MTD" | "Quarter";
type UnitMetricView = "actual_vs_target" | "ach";
type RootFilterKey = "periode" | "fokus" | "indikator" | null;
type FokusChildKey = "ALL" | "GROUP" | "UNITS";

function buildSparklineSvgPath(values: number[]): string {
  if (values.length < 2) {
    return "M2 18L16 15L28 16L41 10L52 12L62 6";
  }
  const minV = Math.min(...values, 65);
  const maxV = Math.max(...values, 100);
  const range = Math.max(1, maxV - minV);
  return values
    .map((v, i) => {
      const x = Math.round((2 + (i / (values.length - 1)) * 60) * 10) / 10;
      const y = Math.round((20 - ((v - minV) / range) * 15) * 10) / 10;
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join("");
}

function LightCardRadialGauge({
  value,
  band,
}: {
  value: number;
  band: AchColorBand;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeColor = ACHIEVEMENT_BADGE[band].solid;

  return (
    <div className="relative w-26 h-26 flex items-center justify-center shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 108 108">
        <circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke="#DCE3F2"
          strokeWidth="9.5"
        />
        <motion.circle
          cx="54"
          cy="54"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.85, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.span
          key={value}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-lg font-extrabold text-[#111827] tabular-nums tracking-tight"
        >
          {formatExecPct(value, 1)}
        </motion.span>
        <span className="text-[8.5px] font-bold text-[#2F5597] uppercase tracking-wider mt-0.5">
          Achievement
        </span>
      </div>
    </div>
  );
}

export function ExecutiveSummaryInfographics({ lockedUnits }: { lockedUnits?: string[] }) {
  const navigate = useNavigate();
  const { activeUser, portalPath } = useAuthStore();
  const [store, setStore] = useState<MasterExecutiveSummaryStore>(() => loadMasterExecutiveSummary());

  // ── 1-Row Cascading Filter State (Periode · Fokus · Indikator KPI -> Anak Tag -> Cucu Tag) ──
  const [openRootFilter, setOpenRootFilter] = useState<RootFilterKey>(null);
  const [fokusChildBranch, setFokusChildBranch] = useState<FokusChildKey>("ALL");
  const [indikatorShowGrandchild, setIndikatorShowGrandchild] = useState<boolean>(false);

  // Filter Fungsional
  const [horizon, setHorizon] = useState<HorizonMode>("YTD");
  const [selectedReportId, setSelectedReportId] = useState<string>("ytd-jan-oct-26");
  const [scopeFocus, setScopeFocus] = useState<ScopeFocus>("ALL");
  const [spotlightUnitId, setSpotlightUnitId] = useState<string>("ALL");
  // Tag warna untuk memunculkan RSUP Group pada kartu & grafik perbandingan Unit Usaha
  const [showRsupGroupInUnits, setShowRsupGroupInUnits] = useState<boolean>(false);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string>("ALL");
  const [achBandFilter, setAchBandFilter] = useState<"ALL" | "green" | "yellow" | "red">("ALL");

  // Interactive Chart Mode States
  const [groupTrendMode, setGroupTrendMode] = useState<TrendGranularity>("MTD");
  const [unitTrendMode, setUnitTrendMode] = useState<TrendGranularity>("MTD");
  // Auto memunculkan tab Aktual vs Target (Bobot) pada Komparasi per Indikator
  const [unitMetricView, setUnitMetricView] = useState<UnitMetricView>("actual_vs_target");
  const [indicatorSpotlightForUnits, setIndicatorSpotlightForUnits] = useState<string>("ind-fin");
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

  // Sinkronkan mode trend line secara otomatis saat filter Periode (Quarter / Perbulan) dipilih
  useEffect(() => {
    if (horizon === "Quarter") {
      setGroupTrendMode("Quarter");
      setUnitTrendMode("Quarter");
    } else if (horizon === "MTD") {
      setGroupTrendMode("MTD");
      setUnitTrendMode("MTD");
    }
  }, [horizon]);

  const canManageMasterKpi = useMemo(() => {
    const r = activeUser.role || "Employee";
    return r === "Administrator" || r === "HR ICF" || hasRolePermission(r, "setting_master_kpi", "view");
  }, [activeUser.role]);

  const groupEntity = useMemo(
    () => store.entities.find((e) => e.kind === "group") ?? store.entities[0],
    [store.entities],
  );

  const rsupUnitEntities = useMemo(() => {
    const list = store.entities.filter((e) => e.kind === "unit" && e.groupName === "RSUP Group");
    if (!lockedUnits || lockedUnits.length === 0) return list;
    const matched = list.filter((u) => lockedUnits.some((lu) => isSameCompanyUnit(lu, u.name)));
    return matched.length > 0 ? matched : list;
  }, [store.entities, lockedUnits]);

  // Auto memunculkan semua 5 Unit Usaha; jika tag RSUP Group diklik maka RSUP Group ikut dimunculkan di kartu & grafik perbandingan
  const comparisonEntities = useMemo(
    () => (showRsupGroupInUnits ? [groupEntity, ...rsupUnitEntities] : rsupUnitEntities),
    [groupEntity, rsupUnitEntities, showRsupGroupInUnits],
  );

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

  useEffect(() => {
    if (horizon === "YTD") {
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
  }, [horizon, ytdReports, quarterReports, mtdReports, selectedReportId]);

  const activeReport: ExecSummaryReportBlock = useMemo(() => {
    const found = store.reports.find((r) => r.id === selectedReportId);
    if (found) return found;
    return ytdReports[0] ?? store.reports[0];
  }, [store.reports, selectedReportId, ytdReports]);

  const latestYtdReport = ytdReports[0] ?? activeReport;
  const latestMtdReport = mtdReports[mtdReports.length - 1] ?? activeReport;
  const latestQuarterReport = quarterReports[quarterReports.length - 1] ?? activeReport;

  const visibleIndicators = useMemo(() => {
    if (selectedIndicatorId === "ALL") return store.indicators;
    return store.indicators.filter((i) => i.id === selectedIndicatorId);
  }, [store.indicators, selectedIndicatorId]);

  const activeFilterIndicatorObj = useMemo(
    () => (selectedIndicatorId !== "ALL" ? store.indicators.find((i) => i.id === selectedIndicatorId) : undefined),
    [store.indicators, selectedIndicatorId],
  );

  // ── 1. Data Executive Summary RSUP Group & Kartu Perbandingan Unit Usaha (Desain StatCard Appraisal Analytics) ──
  const groupActiveTotal = useMemo(() => {
    const raw = activeReport.totals?.[groupEntity.id];
    const num = parseExecPct(raw?.ach) ?? 0;
    const band = classifyAchBand(raw?.ach, true, raw?.bandOverride);
    return { num, raw: raw?.ach || formatExecPct(num, 1), band };
  }, [activeReport, groupEntity.id]);

  const groupHorizonSnapshot = useMemo(() => {
    const ytdNum = parseExecPct(latestYtdReport.totals?.[groupEntity.id]?.ach) ?? 0;
    const qNum = parseExecPct(latestQuarterReport.totals?.[groupEntity.id]?.ach) ?? 0;
    const mNum = parseExecPct(latestMtdReport.totals?.[groupEntity.id]?.ach) ?? 0;
    return {
      ytd: ytdNum,
      quarter: qNum,
      quarterLabel: latestQuarterReport.shortLabel,
      mtd: mNum,
      mtdLabel: latestMtdReport.shortLabel,
    };
  }, [latestYtdReport, latestQuarterReport, latestMtdReport, groupEntity.id]);

  const unitComparisonStatCards = useMemo(() => {
    const sparkSourceBlocks = horizon === "Quarter" ? quarterReports : mtdReports;
    return comparisonEntities
      .map((ent) => {
        const tot = activeReport.totals?.[ent.id];
        const achNum = parseExecPct(tot?.ach) ?? 0;
        const band: AchColorBand = classifyAchBand(tot?.ach, true, tot?.bandOverride);

        let greenCount = 0;
        let yellowCount = 0;
        let redCount = 0;
        for (const ind of store.indicators) {
          const cell = activeReport.cells?.[ind.id]?.[ent.id];
          if (!cell || !cell.applicable || !String(cell.ach ?? "").trim()) continue;
          const b = classifyAchBand(cell.ach, true);
          if (b === "green") greenCount++;
          else if (b === "yellow") yellowCount++;
          else if (b === "red") redCount++;
        }

        const sparkValues = sparkSourceBlocks
          .map((rep) => parseExecPct(rep.totals?.[ent.id]?.ach))
          .filter((v): v is number => v !== null);

        const spec = UNIT_STAT_CARD_SPECS[ent.id] ?? {
          gradient: "from-[#EAEFF9] via-[#F6F8FD] to-white",
          border: "border-[#DCE3F2]",
          accentHex: ent.colorHex,
        };

        return {
          entity: ent,
          achNum,
          achStr: tot?.ach || formatExecPct(achNum, 1),
          band,
          greenCount,
          yellowCount,
          redCount,
          sparkPath: buildSparklineSvgPath(sparkValues),
          spec,
        };
      })
      .filter((item) => achBandFilter === "ALL" || item.band === achBandFilter);
  }, [comparisonEntities, activeReport, horizon, quarterReports, mtdReports, store.indicators, achBandFilter]);

  // ── 2. Data Baris 1 Line RSUP Group: Pencapaian per Indikator KPI + Trend Achievement (%) per Indikator KPI ──
  const rsupGroupIndicatorBreakdown = useMemo(() => {
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
          color: INDICATOR_COLORS[ind.id] ?? THEME.seafoamTeal,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [visibleIndicators, activeReport, groupEntity.id, achBandFilter]);

  const rsupGroupIndicatorTrendData = useMemo(() => {
    const blocks: ExecSummaryReportBlock[] = groupTrendMode === "MTD" ? mtdReports : quarterReports;
    return blocks.map((rep) => {
      const row: Record<string, string | number> = {
        period: rep.shortLabel,
      };
      for (const ind of store.indicators) {
        const cell = rep.cells?.[ind.id]?.[groupEntity.id];
        if (cell && cell.applicable) {
          row[ind.id] = parseExecPct(cell.ach) ?? 0;
        }
      }
      return row;
    });
  }, [groupTrendMode, mtdReports, quarterReports, store.indicators, groupEntity.id]);

  // ── 3. Data Summary Perbandingan Antar Unit Usaha (Model Line Card sesuai Periode Filter + Tag RSUP Group) ──

  // Card Kiri: Line Card Pergerakan Achievement Unit Usaha dari Perspektif 6 Indikator pada Periode Filter Aktif
  const unitSixIndicatorsLineData = useMemo(() => {
    return visibleIndicators.map((ind) => {
      const point: Record<string, string | number | null> = {
        indicator: ind.shortLabel,
        fullIndicator: ind.label,
      };
      for (const ent of comparisonEntities) {
        if (spotlightUnitId !== "ALL" && ent.id !== spotlightUnitId && ent.kind !== "group") continue;
        const cell = activeReport.cells?.[ind.id]?.[ent.id];
        point[ent.id] = cell && cell.applicable ? parseExecPct(cell.ach) : null;
      }
      return point;
    });
  }, [visibleIndicators, comparisonEntities, spotlightUnitId, activeReport]);

  // Card Kanan: Line Card Komparasi per Indikator (Auto memunculkan tab Aktual vs Target Bobot, mengikuti Periode Filter)
  const unitIndicatorComparisonLineData = useMemo(() => {
    const targetInd =
      store.indicators.find(
        (i) => i.id === (selectedIndicatorId !== "ALL" ? selectedIndicatorId : indicatorSpotlightForUnits),
      ) ?? store.indicators[0];

    // Jika Periode = Quarter atau Perbulan (MTD), juga sediakan garis lintasan Aktual vs Target sesuai pergerakan periode,
    // atau perbandingan lintas Unit Usaha pada periode aktif (activeReport)
    const rows = comparisonEntities
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || (showRsupGroupInUnits && e.kind === "group"))
      .map((ent) => {
        const cell = activeReport.cells?.[targetInd.id]?.[ent.id];
        const applicable = Boolean(cell?.applicable);
        const bobot = applicable ? parseExecPct(cell?.bobot) ?? 0 : 0;
        const actual = applicable ? parseExecPct(cell?.actual) ?? 0 : 0;
        const ach = applicable ? parseExecPct(cell?.ach) ?? 0 : 0;
        const band: AchColorBand = applicable ? classifyAchBand(cell?.ach, true) : "na";
        return {
          id: ent.id,
          entity: ent.shortName,
          fullName: ent.name,
          isGroup: ent.kind === "group",
          applicable,
          bobot,
          actual,
          ach,
          band,
          color: ent.colorHex,
        };
      })
      .filter((r) => r.applicable && (achBandFilter === "ALL" || r.band === achBandFilter));
    return { indicator: targetInd, rows };
  }, [
    store.indicators,
    selectedIndicatorId,
    indicatorSpotlightForUnits,
    comparisonEntities,
    spotlightUnitId,
    showRsupGroupInUnits,
    activeReport,
    achBandFilter,
  ]);

  // ── 4. Data Baris Gabungan 1 Line: Trend Lintasan Unit Usaha + Diagnostic · Sumber Kehilangan Poin ──
  const unitTrajectoryData = useMemo(() => {
    const blocks: ExecSummaryReportBlock[] = unitTrendMode === "MTD" ? mtdReports : quarterReports;
    const resolveEntityVal = (rep: ExecSummaryReportBlock, entId: string): number | null => {
      if (selectedIndicatorId !== "ALL") {
        const cell = rep.cells?.[selectedIndicatorId]?.[entId];
        if (!cell || !cell.applicable) return null;
        return parseExecPct(cell.ach);
      }
      return parseExecPct(rep.totals?.[entId]?.ach);
    };
    return blocks.map((rep) => {
      const row: Record<string, string | number | null> = {
        period: rep.shortLabel,
        [groupEntity.id]: resolveEntityVal(rep, groupEntity.id),
      };
      for (const u of rsupUnitEntities) {
        row[u.id] = resolveEntityVal(rep, u.id);
      }
      return row;
    });
  }, [unitTrendMode, mtdReports, quarterReports, selectedIndicatorId, groupEntity.id, rsupUnitEntities]);

  const gapAttributionData = useMemo(() => {
    const entitiesList =
      scopeFocus === "GROUP"
        ? [groupEntity]
        : showRsupGroupInUnits
        ? [groupEntity, ...rsupUnitEntities]
        : rsupUnitEntities;
    return entitiesList
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || (showRsupGroupInUnits && e.kind === "group"))
      .map((ent) => {
        const rawTot = activeReport.totals?.[ent.id]?.ach;
        const totAch = parseExecPct(rawTot) ?? 0;
        const losses: Array<{ indId: string; label: string; loss: number; ach: number }> = [];
        let totalLoss = 0;
        for (const ind of store.indicators) {
          if (selectedIndicatorId !== "ALL" && ind.id !== selectedIndicatorId) continue;
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
  }, [
    scopeFocus,
    groupEntity,
    showRsupGroupInUnits,
    rsupUnitEntities,
    spotlightUnitId,
    activeReport,
    store.indicators,
    selectedIndicatorId,
  ]);

  // ── 5. Drilldown Lintasan Historis (khusus sesuai filter Periode aktif) ──
  const inspectedCellSeries = useMemo(() => {
    if (!inspectedCell) return null;
    const ind = store.indicators.find((i) => i.id === inspectedCell.indId);
    const ent = store.entities.find((e) => e.id === inspectedCell.entId);
    if (!ind || !ent) return null;
    const timeline: ExecSummaryReportBlock[] =
      horizon === "MTD"
        ? mtdReports
        : horizon === "Quarter"
        ? quarterReports
        : ytdReports;
    const points = timeline
      .map((rep) => {
        const cell = rep.cells?.[ind.id]?.[ent.id];
        if (!cell || !cell.applicable || !String(cell.ach ?? "").trim()) return null;
        return {
          label: rep.shortLabel,
          ach: parseExecPct(cell.ach) ?? 0,
          actual: parseExecPct(cell.actual) ?? 0,
          bobot: parseExecPct(cell.bobot) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return {
      ind,
      ent,
      points,
      horizonLabel:
        horizon === "MTD"
          ? "Perbulan (MTD)"
          : horizon === "Quarter"
          ? "Quarter (Q1–Q4)"
          : "Year-to-Date (YTD)",
    };
  }, [inspectedCell, store.indicators, store.entities, horizon, mtdReports, quarterReports, ytdReports]);

  const hasActiveFilter =
    horizon !== "YTD" ||
    scopeFocus !== "ALL" ||
    spotlightUnitId !== "ALL" ||
    selectedIndicatorId !== "ALL" ||
    achBandFilter !== "ALL" ||
    showRsupGroupInUnits;

  const resetFilters = () => {
    setHorizon("YTD");
    setSelectedReportId(ytdReports[0]?.id ?? "");
    setScopeFocus("ALL");
    setSpotlightUnitId("ALL");
    setShowRsupGroupInUnits(false);
    setSelectedIndicatorId("ALL");
    setAchBandFilter("ALL");
    setOpenRootFilter(null);
  };

  const masterExecPath = `${portalPath || "/hr"}/settings/master/kpi/executive-summary`;

  // Tag warna untuk memunculkan / menyembunyikan RSUP Group pada semua kartu perbandingan Unit Usaha
  const RsupGroupToggleTag = ({ compact = false }: { compact?: boolean }) => (
    <button
      type="button"
      onClick={() => setShowRsupGroupInUnits((prev) => !prev)}
      title="Klik untuk memunculkan atau menyembunyikan RSUP Group pada kartu dan grafik perbandingan"
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border transition-all cursor-pointer select-none ${
        compact ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]"
      } ${
        showRsupGroupInUnits
          ? "bg-[#2F5597] text-white border-[#2F5597] shadow-2xs"
          : "bg-[#EAEFF9] text-[#2F5597] border-[#CBD7EE] hover:bg-[#DCE5F7]"
      }`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: showRsupGroupInUnits ? "#EA9942" : "#2F5597" }}
      />
      <span>{showRsupGroupInUnits ? "RSUP Group: Ditampilkan" : "+ RSUP Group"}</span>
    </button>
  );

  const periodeSummaryLabel =
    horizon === "YTD"
      ? activeReport.shortLabel
      : `${horizon === "Quarter" ? "Quarter" : "Perbulan"} · ${activeReport.shortLabel}`;
  const fokusSummaryLabel =
    spotlightUnitId !== "ALL"
      ? store.entities.find((e) => e.id === spotlightUnitId)?.shortName ?? "Unit"
      : scopeFocus === "GROUP"
      ? "Khusus RSUP Group"
      : scopeFocus === "UNITS"
      ? "Perbandingan Unit Usaha"
      : "RSUP Group & Unit";
  const indikatorSummaryLabel =
    (activeFilterIndicatorObj ? activeFilterIndicatorObj.shortLabel : "Semua 6 Indikator") +
    (achBandFilter !== "ALL"
      ? ` · ${achBandFilter === "green" ? "Hijau" : achBandFilter === "yellow" ? "Kuning" : "Merah"}`
      : "");

  return (
    <div className="w-full space-y-5">
      {/* ══ STICKY 1-ROW ROOT FILTER BAR (Periode · Fokus · Indikator KPI) -> ANAK TAG -> CUCU TAG ══ */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Root Tag 1: PERIODE */}
            <button
              type="button"
              onClick={() => setOpenRootFilter((p) => (p === "periode" ? null : "periode"))}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                openRootFilter === "periode"
                  ? "bg-[#248277] text-white border-[#248277] shadow-xs"
                  : "bg-[#E4F4F2] text-[#248277] border-[#BEE2DD] hover:bg-[#D4ECE9]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Periode: {periodeSummaryLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  openRootFilter === "periode" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Root Tag 2: FOKUS */}
            <button
              type="button"
              onClick={() => setOpenRootFilter((p) => (p === "fokus" ? null : "fokus"))}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                openRootFilter === "fokus"
                  ? "bg-[#3B6EA8] text-white border-[#3B6EA8] shadow-xs"
                  : "bg-[#EBF2FA] text-[#3B6EA8] border-[#C9DCF0] hover:bg-[#DCE8F6]"
              }`}
            >
              <Filter className="w-3.5 h-3.5 shrink-0" />
              <span>Fokus: {fokusSummaryLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  openRootFilter === "fokus" ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Root Tag 3: INDIKATOR KPI */}
            <button
              type="button"
              onClick={() => setOpenRootFilter((p) => (p === "indikator" ? null : "indikator"))}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                openRootFilter === "indikator"
                  ? "bg-[#C07A28] text-white border-[#C07A28] shadow-xs"
                  : "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4] hover:bg-[#FAE6CE]"
              }`}
            >
              <Target className="w-3.5 h-3.5 shrink-0" />
              <span>Indikator KPI: {indikatorSummaryLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  openRootFilter === "indikator" ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <RsupGroupToggleTag />
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
            {canManageMasterKpi && (
              <button
                type="button"
                onClick={() => navigate(masterExecPath)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#EAEFF9] text-[#2F5597] border border-[#DCE3F2] hover:bg-[#DCE5F7] transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Kelola Data Master KPI
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </button>
            )}
          </div>
        </div>

        {/* Panel Anak Tag & Cucu Tag */}
        <AnimatePresence initial={false}>
          {openRootFilter === "periode" && (
            <motion.div
              key="drawer-periode"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#248277] mr-1">
                    Kategori Periode:
                  </span>
                  {(
                    [
                      { id: "YTD" as const, label: "YTD (Jan–Okt'26)" },
                      { id: "Quarter" as const, label: "Quarter (Q1–Q4)" },
                      { id: "MTD" as const, label: "Perbulan (MTD)" },
                    ] as const
                  ).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setHorizon(child.id)}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        horizon === child.id
                          ? "bg-[#248277] text-white border-[#248277]"
                          : "bg-[#E4F4F2]/75 text-[#248277] border-[#BEE2DD] hover:bg-[#E4F4F2]"
                      }`}
                    >
                      <span>{child.label}</span>
                      {child.id !== "YTD" && <ChevronRight className="w-3 h-3 opacity-75" />}
                    </button>
                  ))}
                </div>

                {(horizon === "Quarter" || horizon === "MTD" || ytdReports.length > 1) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#248277]/45 flex-wrap"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Pilih {horizon === "Quarter" ? "Kuartal" : horizon === "MTD" ? "Bulan" : "YTD"}:
                    </span>
                    {(horizon === "Quarter" ? quarterReports : horizon === "MTD" ? mtdReports : ytdReports).map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => setSelectedReportId(rep.id)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                          activeReport.id === rep.id
                            ? "bg-[#EA9942] text-white border-[#EA9942] shadow-2xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#FDF3E7]"
                        }`}
                      >
                        {rep.shortLabel}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {openRootFilter === "fokus" && (
            <motion.div
              key="drawer-fokus"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B6EA8] mr-1">
                    Cakupan Fokus:
                  </span>
                  {(
                    [
                      {
                        id: "ALL" as const,
                        label: "RSUP Group & Unit Usaha",
                        hasGrandchild: false,
                        onSelect: () => {
                          setFokusChildBranch("ALL");
                          setScopeFocus("ALL");
                          setSpotlightUnitId("ALL");
                        },
                      },
                      {
                        id: "GROUP" as const,
                        label: "Khusus RSUP Group",
                        hasGrandchild: false,
                        onSelect: () => {
                          setFokusChildBranch("GROUP");
                          setScopeFocus("GROUP");
                          setSpotlightUnitId("ALL");
                        },
                      },
                      {
                        id: "UNITS" as const,
                        label: "Perbandingan Unit Usaha",
                        hasGrandchild: true,
                        onSelect: () => {
                          setFokusChildBranch("UNITS");
                          setScopeFocus("UNITS");
                        },
                      },
                    ] as const
                  ).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={child.onSelect}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        fokusChildBranch === child.id
                          ? "bg-[#3B6EA8] text-white border-[#3B6EA8]"
                          : "bg-[#EBF2FA] text-[#3B6EA8] border-[#C9DCF0] hover:bg-[#DCE8F6]"
                      }`}
                    >
                      <span>{child.label}</span>
                      {child.hasGrandchild && <ChevronRight className="w-3 h-3 opacity-75" />}
                    </button>
                  ))}
                </div>

                {fokusChildBranch === "UNITS" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#3B6EA8]/45 flex-wrap"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Spotlight Unit:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSpotlightUnitId("ALL")}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                        spotlightUnitId === "ALL"
                          ? "bg-[#248277] text-white border-[#248277]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#E4F4F2]"
                      }`}
                    >
                      Semua Unit
                    </button>
                    {rsupUnitEntities.map((u) => {
                      const isSpot = spotlightUnitId === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSpotlightUnitId((prev) => (prev === u.id ? "ALL" : u.id))}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                            isSpot
                              ? "text-white shadow-2xs"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                          style={isSpot ? { backgroundColor: u.colorHex, borderColor: u.colorHex } : undefined}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: isSpot ? "#FFFFFF" : u.colorHex }}
                          />
                          {u.shortName}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {openRootFilter === "indikator" && (
            <motion.div
              key="drawer-indikator"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A5B13] mr-1">
                    Pilih Indikator KPI:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndicatorId("ALL");
                      setIndikatorShowGrandchild(true);
                    }}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      selectedIndicatorId === "ALL"
                        ? "bg-[#248277] text-white border-[#248277]"
                        : "bg-[#E4F4F2] text-[#248277] border-[#BEE2DD]"
                    }`}
                  >
                    <span>Semua 6 Indikator</span>
                    <ChevronRight className="w-3 h-3 opacity-75" />
                  </button>
                  {store.indicators.map((ind) => {
                    const isAct = selectedIndicatorId === ind.id;
                    const cHex = INDICATOR_COLORS[ind.id] ?? THEME.seafoamTeal;
                    return (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => {
                          const next = selectedIndicatorId === ind.id ? "ALL" : ind.id;
                          setSelectedIndicatorId(next);
                          if (next !== "ALL") setIndicatorSpotlightForUnits(next);
                          setIndikatorShowGrandchild(true);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isAct
                            ? "text-white shadow-2xs"
                            : "bg-[#FDF3E7]/85 text-slate-700 border-[#F3CFA4] hover:bg-[#FDF3E7]"
                        }`}
                        style={isAct ? { backgroundColor: cHex, borderColor: cHex } : undefined}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: isAct ? "#FFFFFF" : cHex }}
                        />
                        <span>{ind.shortLabel}</span>
                        <ChevronRight className="w-3 h-3 opacity-70" />
                      </button>
                    );
                  })}
                </div>

                {(indikatorShowGrandchild || achBandFilter !== "ALL") && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#EA9942] flex-wrap"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Status Achievement:
                    </span>
                    {(
                      [
                        {
                          id: "ALL" as const,
                          label: "Semua Achievement",
                          bg: "#475569",
                          idle: "bg-slate-100 text-slate-700 border-slate-300",
                        },
                        {
                          id: "green" as const,
                          label: "Hijau ≥95%",
                          bg: "#2E8555",
                          idle: "bg-[#E6F4EE] text-[#2E8555] border-[#BBDED0]",
                        },
                        {
                          id: "yellow" as const,
                          label: "Kuning 80–<95%",
                          bg: "#EA9942",
                          idle: "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4]",
                        },
                        {
                          id: "red" as const,
                          label: "Merah <80%",
                          bg: "#B84A4A",
                          idle: "bg-[#FBEAEA] text-[#B84A4A] border-[#E8BFBF]",
                        },
                      ] as const
                    ).map((st) => {
                      const act = achBandFilter === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setAchBandFilter(st.id)}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                            act ? "text-white shadow-2xs" : st.idle
                          }`}
                          style={act ? { backgroundColor: st.bg, borderColor: st.bg } : undefined}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ══ HERO ROW: EXECUTIVE SUMMARY RSUP GROUP + PERBANDINGAN PENCAPAIAN UNIT USAHA (Desain StatCard Appraisal Analytics) ══ */}
      <motion.div
        key={`hero-${activeReport.id}-${showRsupGroupInUnits}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch"
      >
        {/* Executive Summary RSUP Group Card — desain mengikuti Total Employees StatCard */}
        <div className="xl:col-span-4 group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-4 flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div
            className="pointer-events-none absolute -right-6 -bottom-7 w-28 h-28 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
            style={{ backgroundColor: "#1E3A6E0D" }}
          />

          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wider">
                Executive Boardroom Pulse · {activeReport.shortLabel}
              </p>
              <h3 className="text-base font-extrabold text-[#111827] mt-0.5 leading-tight">
                Executive Summary {groupEntity.name}
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">{activeReport.title}</p>
            </div>
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
              style={{ backgroundColor: "#2F5597" }}
            >
              <Compass className="w-5 h-5" />
            </div>
          </div>

          <div className="flex items-center gap-3.5 my-3 relative z-10">
            <LightCardRadialGauge value={groupActiveTotal.num} band={groupActiveTotal.band} />
            <div className="flex-1 grid grid-cols-3 gap-1.5">
              {[
                { lbl: "YTD", val: groupHorizonSnapshot.ytd, key: "YTD" as const },
                { lbl: groupHorizonSnapshot.quarterLabel, val: groupHorizonSnapshot.quarter, key: "Quarter" as const },
                { lbl: groupHorizonSnapshot.mtdLabel, val: groupHorizonSnapshot.mtd, key: "MTD" as const },
              ].map((hItem) => (
                <button
                  key={hItem.lbl}
                  type="button"
                  onClick={() => setHorizon(hItem.key)}
                  className={`text-left rounded-xl px-2 py-1.5 border transition-all cursor-pointer ${
                    horizon === hItem.key
                      ? "bg-[#2F5597] text-white border-[#2F5597] shadow-2xs"
                      : "bg-white/85 text-[#111827] border-[#DCE3F2] hover:bg-white"
                  }`}
                >
                  <p
                    className={`text-[9.5px] font-medium truncate ${
                      horizon === hItem.key ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    {hItem.lbl}
                  </p>
                  <p className="text-xs font-extrabold tabular-nums mt-0.5">
                    {formatExecPct(hItem.val, 1)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 pt-2.5 border-t border-[#DCE3F2]/80 text-[11px] text-gray-500 font-medium relative z-10">
            <span>
              Target Bobot: <strong className="text-[#111827]">100%</strong> · Defisit:{" "}
              <strong style={{ color: "#B84A4A" }}>
                -{formatExecPct(Math.max(0, 100 - groupActiveTotal.num), 1)}
              </strong>
            </span>
            <svg
              className="w-14 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              viewBox="0 0 64 24"
              fill="none"
            >
              <path
                d="M2 20L16 14L26 17L40 9L50 12L62 5"
                stroke="#2F5597"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Point 1: Perbandingan Pencapaian Unit Usaha dengan desain StatCard seperti Appraisal Analytics */}
        <div className="xl:col-span-8 flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#248277]" />
              <h3 className="text-sm font-bold text-[#111827]">
                Perbandingan Pencapaian Unit Usaha ({activeReport.shortLabel})
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <RsupGroupToggleTag compact />
              {spotlightUnitId !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSpotlightUnitId("ALL")}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#E4F4F2] text-[#248277] border border-[#BEE2DD] hover:bg-[#D4ECE9] cursor-pointer"
                >
                  <X className="w-3 h-3" /> Semua Unit
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              unitComparisonStatCards.length >= 6 ? "lg:grid-cols-3" : "lg:grid-cols-5"
            } gap-3 flex-1`}
          >
            {unitComparisonStatCards.map((item) => {
              const isSpot = spotlightUnitId === item.entity.id;
              const isGroupCard = item.entity.kind === "group";
              const bMeta = ACHIEVEMENT_BADGE[item.band];
              return (
                <button
                  key={item.entity.id}
                  type="button"
                  onClick={() => {
                    if (!isGroupCard) {
                      setSpotlightUnitId((prev) => (prev === item.entity.id ? "ALL" : item.entity.id));
                    }
                  }}
                  className={`group relative text-left overflow-hidden bg-gradient-to-br ${item.spec.gradient} border ${item.spec.border} rounded-2xl p-4 min-h-[126px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg ${
                    isSpot
                      ? "ring-2 ring-[#2F5597]"
                      : spotlightUnitId !== "ALL" && !isGroupCard
                      ? "opacity-65 hover:opacity-100"
                      : ""
                  } ${isGroupCard ? "cursor-default" : "cursor-pointer"}`}
                >
                  <div
                    className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                    style={{ backgroundColor: `${item.spec.accentHex}0D` }}
                  />
                  <div className="flex items-start justify-between gap-2 relative z-10">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-500 truncate" title={item.entity.name}>
                        {item.entity.shortName}
                      </p>
                      <p className="text-2xl font-extrabold text-[#111827] leading-tight mt-0.5 tabular-nums">
                        {item.achStr}
                      </p>
                    </div>
                    <div
                      className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                      style={{ backgroundColor: item.spec.accentHex }}
                    >
                      {isGroupCard ? <Layers className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2 mt-3 relative z-10">
                    <div className="space-y-1 min-w-0">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-bold text-white"
                        style={{ backgroundColor: bMeta.solid }}
                      >
                        {item.greenCount}H · {item.yellowCount}K · {item.redCount}M
                      </span>
                    </div>
                    <svg
                      className="w-13 h-5 shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      viewBox="0 0 64 24"
                      fill="none"
                    >
                      <path
                        d={item.sparkPath}
                        stroke={item.spec.accentHex}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ══ POINT 3: 1-LINE RSUP GROUP (Pencapaian per Indikator KPI + Trend Achievement (%) per Indikator KPI — RSUP Group) ══ */}
      {scopeFocus !== "UNITS" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
        >
          {/* Left 6 cols: Pencapaian per Indikator KPI — RSUP Group */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2F5597] bg-[#EAEFF9] border border-[#DCE3F2] px-2 py-0.5 rounded-full">
                Aktual vs Target Bobot &amp; Achievement · {activeReport.shortLabel}
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                Pencapaian per Indikator KPI — {groupEntity.name}
              </h4>
            </div>

            <div className="space-y-2.5 my-auto">
              {rsupGroupIndicatorBreakdown.map((item, idx) => {
                const bMeta = ACHIEVEMENT_BADGE[item.band];
                const fillRatio = item.bobot > 0 ? Math.min(100, (item.actual / item.bobot) * 100) : 0;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2 hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                      <span className="font-bold text-slate-800 truncate" title={item.fullName}>
                        {item.fullName}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          Actual <strong className="text-[#111827]">{item.actualStr}</strong> / Bobot{" "}
                          <strong>{item.bobotStr}</strong>
                        </span>
                        {item.pointGap > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FBEAEA] text-[#8C3131] border border-[#E8BFBF] tabular-nums">
                            -{formatExecPct(item.pointGap, 1)} poin
                          </span>
                        )}
                        <span
                          className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold text-white tabular-nums min-w-[78px] text-center"
                          style={{ backgroundColor: bMeta.solid }}
                        >
                          Achievement {item.achStr}
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-slate-200/80 overflow-hidden">
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

          {/* Right 6 cols: Trend Achievement (%) per Indikator KPI — RSUP Group (dipindahkan agar 1 line) */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#248277] bg-[#E4F4F2] border border-[#BEE2DD] px-2 py-0.5 rounded-full">
                  Multi-Indicator Trajectory
                </span>
                <h4 className="text-sm font-bold text-[#111827] mt-1.5 flex items-center gap-1.5">
                  <LineChartIcon className="w-4 h-4 text-[#248277]" />
                  Trend Achievement (%) per Indikator KPI — {groupEntity.name}
                </h4>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                {(
                  [
                    { id: "MTD" as const, label: "Trend Perbulan" },
                    { id: "Quarter" as const, label: "Q1–Q4" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGroupTrendMode(m.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      groupTrendMode === m.id
                        ? "bg-white text-[#111827] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[275px] w-full my-auto">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rsupGroupIndicatorTrendData} margin={{ top: 10, right: 14, left: -14, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[55, 105]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={95} stroke="#2E8555" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#B84A4A" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 4 }} />
                  {visibleIndicators
                    .filter((ind) => ind.id !== "ind-reg")
                    .map((ind) => (
                      <Line
                        key={ind.id}
                        type="monotone"
                        dataKey={ind.id}
                        name={ind.shortLabel}
                        stroke={INDICATOR_COLORS[ind.id] ?? THEME.seafoamTeal}
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

      {/* ══ POINT 6: SUMMARY PERBANDINGAN ANTAR UNIT USAHA (Model Line Card sesuai Periode Filter + Tag RSUP Group) ══ */}
      {scopeFocus !== "GROUP" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#3B6EA8] text-white flex items-center justify-center shadow-xs">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827]">
                  Summary Perbandingan Antar Unit Usaha
                </h3>
                <p className="text-xs text-slate-500">
                  Pergerakan line Achievement lintas 6 Indikator &amp; komparasi Aktual vs Target sesuai periode ({activeReport.shortLabel})
                </p>
              </div>
            </div>
            <RsupGroupToggleTag />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left Line Card: Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B6EA8] bg-[#EBF2FA] border border-[#C9DCF0] px-2 py-0.5 rounded-full">
                    Line Profile 6 Indikator KPI · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                    Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator
                  </h4>
                </div>
                <RsupGroupToggleTag compact />
              </div>
              <div className="h-[280px] w-full my-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={unitSixIndicatorsLineData} margin={{ top: 10, right: 16, left: -14, bottom: 6 }}>
                    <defs>
                      <linearGradient id="rsupGroupSixIndFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2F5597" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#2F5597" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="indicator"
                      tick={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis domain={[35, 108]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                    <ReferenceLine y={95} stroke="#2E8555" strokeDasharray="4 4" />
                    <ReferenceLine y={80} stroke="#B84A4A" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                      formatter={(val: number) => [`${val}%`, undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 4 }} />
                    {showRsupGroupInUnits && (
                      <Area
                        type="monotone"
                        dataKey={groupEntity.id}
                        name={groupEntity.shortName}
                        fill="url(#rsupGroupSixIndFill)"
                        stroke="#2F5597"
                        strokeWidth={2.8}
                        strokeDasharray="6 3"
                        dot={{ r: 4, fill: "#2F5597" }}
                        connectNulls
                      />
                    )}
                    {rsupUnitEntities.map((u) => {
                      const dimmed = spotlightUnitId !== "ALL" && spotlightUnitId !== u.id;
                      return (
                        <Line
                          key={u.id}
                          type="monotone"
                          dataKey={u.id}
                          name={u.shortName}
                          stroke={u.colorHex}
                          strokeWidth={spotlightUnitId === u.id ? 3.2 : 2.3}
                          strokeOpacity={dimmed ? 0.22 : 1}
                          dot={{ r: spotlightUnitId === u.id ? 4.5 : 3.5 }}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right Line Card: Komparasi per Indikator — auto memunculkan tab Aktual vs Target (Bobot) dalam model Line Card */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9A5B13] bg-[#FDF3E7] border border-[#F3CFA4] px-2 py-0.5 rounded-full">
                    Komparasi per Indikator · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                    {unitIndicatorComparisonLineData.indicator.label}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <RsupGroupToggleTag compact />
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setUnitMetricView("actual_vs_target")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                        unitMetricView === "actual_vs_target"
                          ? "bg-white text-[#111827] shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Aktual vs Target (Bobot)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnitMetricView("ach")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                        unitMetricView === "ach"
                          ? "bg-white text-[#111827] shadow-2xs"
                          : "text-slate-600"
                      }`}
                    >
                      Kolom Achievement (%)
                    </button>
                  </div>
                </div>
              </div>

              {selectedIndicatorId === "ALL" && (
                <div className="flex items-center gap-1 mb-2 flex-wrap">
                  {store.indicators.map((ind) => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setIndicatorSpotlightForUnits(ind.id)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                        indicatorSpotlightForUnits === ind.id
                          ? "bg-[#248277] text-white border-[#248277]"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-[#E4F4F2]"
                      }`}
                    >
                      {ind.shortLabel}
                    </button>
                  ))}
                </div>
              )}

              <div className="h-[240px] w-full mt-auto">
                <ResponsiveContainer width="100%" height="100%">
                  {unitMetricView === "actual_vs_target" ? (
                    <ComposedChart
                      data={unitIndicatorComparisonLineData.rows}
                      margin={{ top: 10, right: 14, left: -14, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="actualContribFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#248277" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#248277" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#475569", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                        formatter={(val: number) => [`${val}%`, undefined]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line
                        type="monotone"
                        dataKey="bobot"
                        name="Target (Bobot %)"
                        stroke="#5E6472"
                        strokeWidth={2.2}
                        strokeDasharray="5 4"
                        dot={{ r: 3.5, fill: "#5E6472" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="actual"
                        name="Aktual Kontribusi (%)"
                        fill="url(#actualContribFill)"
                        stroke="#248277"
                        strokeWidth={2.8}
                        dot={{ r: 4.5, fill: "#248277" }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  ) : (
                    <ComposedChart
                      data={unitIndicatorComparisonLineData.rows}
                      margin={{ top: 10, right: 14, left: -14, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="achLineFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B6EA8" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#3B6EA8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#475569", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <ReferenceLine y={95} stroke="#2E8555" strokeDasharray="4 4" />
                      <ReferenceLine y={80} stroke="#B84A4A" strokeDasharray="3 3" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof unitIndicatorComparisonLineData.rows)[number];
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs space-y-1">
                              <p className="font-bold text-[#111827]">{d.fullName}</p>
                              <p className="font-semibold" style={{ color: "#248277" }}>
                                Achievement: {formatExecPct(d.ach, 1)}
                              </p>
                              <p className="text-slate-600">
                                Actual: <strong>{d.actual}%</strong> dari Target Bobot <strong>{d.bobot}%</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="ach"
                        name="Achievement (%)"
                        fill="url(#achLineFill)"
                        stroke="#3B6EA8"
                        strokeWidth={2.8}
                        dot={{ r: 4.5, fill: "#3B6EA8" }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* ══ POINT 4 & POINT 5: 1-LINE MERGED ROW (Trend Lintasan Unit Usaha + Diagnostic · Sumber Kehilangan Poin; Balanced Scorecard Removed) ══ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
      >
        {/* Left 6 cols: Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#248277] bg-[#E4F4F2] border border-[#BEE2DD] px-2 py-0.5 rounded-full">
                Unit vs Benchmark Trajectory
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#248277]" />
                Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group
                {activeFilterIndicatorObj ? ` (${activeFilterIndicatorObj.shortLabel})` : ""}
              </h4>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {(
                [
                  { id: "MTD" as const, label: "Trend Perbulan" },
                  { id: "Quarter" as const, label: "Q1–Q4" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setUnitTrendMode(m.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    unitTrendMode === m.id
                      ? "bg-white text-[#111827] shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[265px] w-full my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={unitTrajectoryData} margin={{ top: 10, right: 14, left: -14, bottom: 4 }}>
                <defs>
                  <linearGradient id="rsupGroupBenchFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F5597" stopOpacity={0.14} />
                    <stop offset="95%" stopColor="#2F5597" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: "#475569" }} axisLine={false} tickLine={false} />
                <YAxis domain={[30, 108]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                <ReferenceLine y={95} stroke="#2E8555" strokeDasharray="4 4" />
                <ReferenceLine y={80} stroke="#B84A4A" strokeDasharray="3 3" />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 10.5, paddingTop: 4 }} />
                <Area
                  type="monotone"
                  dataKey={groupEntity.id}
                  name={`${groupEntity.shortName} (Benchmark)`}
                  fill="url(#rsupGroupBenchFill)"
                  stroke="#2F5597"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  connectNulls
                />
                {rsupUnitEntities.map((u) => {
                  const dimmed = spotlightUnitId !== "ALL" && spotlightUnitId !== u.id;
                  return (
                    <Line
                      key={u.id}
                      type="monotone"
                      dataKey={u.id}
                      name={u.shortName}
                      stroke={u.colorHex}
                      strokeWidth={spotlightUnitId === u.id ? 3.2 : 2.2}
                      strokeOpacity={dimmed ? 0.22 : 1}
                      dot={{ r: spotlightUnitId === u.id ? 4.5 : 3 }}
                      activeDot={{ r: 5.5 }}
                      connectNulls
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right 6 cols: Diagnostic · Sumber Kehilangan Poin (digabung menjadi 1 line) */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C3131] bg-[#FBEAEA] border border-[#E8BFBF] px-2 py-0.5 rounded-full">
                Diagnostic · Sumber Kehilangan Poin
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                Defisit Poin Menuju 100% ({activeReport.shortLabel})
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Mengidentifikasi Indikator yang paling menggerus skor tertimbang di masing-masing Unit Usaha
              </p>
            </div>
            <RsupGroupToggleTag compact />
          </div>

          <div className="space-y-3 my-auto">
            {gapAttributionData.map((row) => (
              <div key={row.entity.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: row.entity.colorHex }}
                    />
                    {row.entity.shortName}
                  </span>
                  <span className="text-[11px] text-slate-500 tabular-nums text-right">
                    Tercapai <strong style={{ color: "#2E8555" }}>{row.achieved}%</strong> · Defisit{" "}
                    <strong style={{ color: "#B84A4A" }}>-{row.totalLoss}%</strong>
                    {row.topDrag ? (
                      <span className="text-slate-400">
                        {" "}
                        (Utama: {row.topDrag.label} -{row.topDrag.loss}%)
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, row.achieved)}%`,
                      backgroundColor: "#2E8555",
                    }}
                    title={`Poin Tercapai: ${row.achieved}%`}
                  />
                  {row.losses.map((seg) => (
                    <div
                      key={seg.indId}
                      className="h-full border-l border-white/70 transition-all duration-500"
                      style={{
                        width: `${Math.min(100 - row.achieved, seg.loss)}%`,
                        backgroundColor: seg.ach < 80 ? "#B84A4A" : "#EA9942",
                      }}
                      title={`Defisit ${seg.label}: -${seg.loss}% (Achievement ${seg.ach}%)`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-600 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#2E8555" }} /> Poin Tercapai
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#EA9942" }} /> Defisit | Watchlist
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#B84A4A" }} /> Defisit | Kritis
            </span>
          </div>
        </div>
      </motion.section>

      {/* ══ STRATEGIC INTELLIGENCE SUITE (Interactive Risk & Achievement Matrix + Drilldown sesuai Periode) ══ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#248277] text-white flex items-center justify-center shadow-xs">
              <Gauge className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-[#111827]">
              Strategic Intelligence Suite
            </h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Interactive Risk &amp; Achievement Matrix · {activeReport.shortLabel}
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                Peta Kesehatan Strategis Lintas Entitas &amp; Indikator KPI (Klik Sel untuk Melihat Histori Trend)
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#2E8555" }}>
                ≥95% Hijau
              </span>
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#EA9942" }}>
                80–&lt;95% Kuning
              </span>
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#B84A4A" }}>
                &lt;80% Merah
              </span>
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#475569" }}>
                N/A
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="bg-[#2F5597] text-white">
                  <th className="px-3.5 py-2.5 text-left font-bold">Indikator KPI</th>
                  {[groupEntity, ...rsupUnitEntities].map((ent) => (
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
                    {[groupEntity, ...rsupUnitEntities].map((ent) => {
                      const cell = activeReport.cells?.[ind.id]?.[ent.id];
                      if (!cell || !cell.applicable) {
                        return (
                          <td
                            key={`${ind.id}-${ent.id}`}
                            className="px-2 py-2 text-center text-white/85 text-[10px] font-semibold"
                            style={{ backgroundColor: "#475569" }}
                          >
                            N/A
                          </td>
                        );
                      }
                      const band = classifyAchBand(cell.ach, true);
                      const meta = ACHIEVEMENT_BADGE[band];
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
                              isSelected ? "ring-2 ring-[#2F5597] scale-[1.02] shadow-xs" : "hover:brightness-97"
                            } ${hiddenByFilter ? "opacity-25" : ""}`}
                            style={{
                              backgroundColor: meta.bg,
                              color: meta.text,
                              borderColor: meta.bg,
                            }}
                            title="Klik untuk membuka grafik trend sesuai filter Periode aktif"
                          >
                            <span className="text-xs font-extrabold tabular-nums">{cell.ach || "—"}</span>
                            <span className="text-[9px] opacity-90 tabular-nums">
                              {cell.actual || "0%"} / {cell.bobot || "0%"}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-extrabold">
                  <td className="px-3.5 py-2.5 text-[#111827]">
                    Total Achievement ({activeReport.shortLabel})
                  </td>
                  {[groupEntity, ...rsupUnitEntities].map((ent) => {
                    const tot = activeReport.totals?.[ent.id];
                    const band: AchColorBand = classifyAchBand(tot?.ach, true, tot?.bandOverride);
                    const meta = ACHIEVEMENT_BADGE[band];
                    return (
                      <td key={`hm-tot-${ent.id}`} className="p-1.5 text-center border-l border-slate-200">
                        <div
                          className="rounded-lg px-2 py-1.5 border text-xs font-extrabold tabular-nums"
                          style={{
                            backgroundColor: meta.bg,
                            color: meta.text,
                            borderColor: meta.bg,
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

          <AnimatePresence>
            {inspectedCellSeries && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-[#BEE2DD] bg-[#E4F4F2]/45 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#111827]">
                        Drilldown Lintasan Historis: {inspectedCellSeries.ent.name} —{" "}
                        <span className="text-[#248277]">{inspectedCellSeries.ind.label}</span>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        Menampilkan khusus sesuai filter Periode aktif: <strong>{inspectedCellSeries.horizonLabel}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectedCell(null)}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="h-[175px] w-full bg-white rounded-xl border border-[#BEE2DD] p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={inspectedCellSeries.points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <defs>
                          <linearGradient id="drillLineFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#248277" stopOpacity={0.24} />
                            <stop offset="95%" stopColor="#248277" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#475569" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                        <ReferenceLine y={95} stroke="#2E8555" strokeDasharray="4 4" />
                        <ReferenceLine y={80} stroke="#B84A4A" strokeDasharray="3 3" />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                        <Area
                          type="monotone"
                          dataKey="ach"
                          name="Achievement (%)"
                          fill="url(#drillLineFill)"
                          stroke="#248277"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#248277" }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}
