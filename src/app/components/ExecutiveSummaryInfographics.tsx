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
  Info,
  Layers,
  LineChart as LineChartIcon,
  RotateCcw,
  SlidersHorizontal,
  Target,
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
  EXEC_THEME_PALETTE,
  MASTER_EXEC_SUMMARY_UPDATED_EVENT,
  classifyAchBand,
  formatExecPct,
  loadMasterExecutiveSummary,
  parseExecPct,
  refreshMasterExecutiveSummaryFromBackend,
  type AchColorBand,
  type ExecSummaryEntityDef,
  type ExecSummaryReportBlock,
  type MasterExecutiveSummaryStore,
} from "../pages/hr/settings/masterExecutiveSummaryStore";
import { isSameCompanyUnit, useAuthStore } from "../store/authStore";
import { hasRolePermission } from "../pages/hr/settings/AccessManagement";

// Palet ketat sesuai gambar lampiran (#3E3E3E, #FF7864, #FFE770, #167267) + Navy #1E3A6E — TANPA warna ungu & pink
const THEME = EXEC_THEME_PALETTE;

const INDICATOR_COLORS: Record<string, string> = {
  "ind-k3l": "#167267", // Pine Teal Green
  "ind-fin": "#1E3A6E", // Deep Slate Navy
  "ind-prd": "#FF7864", // Warm Coral Terracotta
  "ind-emp": "#2A8C80", // Sea Teal
  "ind-prt": "#D4A72C", // Warm Ochre Gold (pendamping #FFE770 agar kontras garis tajam)
  "ind-reg": "#3E3E3E", // Charcoal Dark
};

const BALANCED_SCORECARD_DESCRIPTIONS: Record<
  string,
  { perspective: string; summary: string; strategicRole: string }
> = {
  "ind-k3l": {
    perspective: "Internal Process · HSE & Sustainability",
    summary:
      "Mengukur efektivitas pengendalian keselamatan kerja (Zero Fatality & LTI), pencegahan kebakaran/karhutla, kepatuhan PROPER lingkungan, serta reduksi emisi GRK.",
    strategicRole:
      "Fondasi lisensi operasional (license to operate) yang menjaga keberlangsungan pabrik dan perkebunan dari risiko penghentian operasi maupun sanksi lingkungan.",
  },
  "ind-fin": {
    perspective: "Financial · Profitability & Cost Leadership",
    summary:
      "Mencerminkan pencapaian Net Profit, EBITDA, ROA, serta efisiensi biaya produksi & overhead (HPP Kelapa/Nanas/Bibit, Cost Utility, dan Cost Meat Preparation).",
    strategicRole:
      "Indikator bobot terbesar yang menentukan kesehatan arus kas, margin grup, serta kapasitas pendanaan belanja modal (CAPEX).",
  },
  "ind-prd": {
    perspective: "Internal Process · Operational Throughput & Yield",
    summary:
      "Mengukur volume olah dan panen bahan baku (Coconut & Pineapple Process/Production), rendemen efisiensi produk utama (White Meat, Coconut Water, Santan), serta program replanting & pemupukan.",
    strategicRole:
      "Penggerak langsung utilisasi kapasitas pabrik dan ketersediaan pasokan bahan baku jangka panjang lintas kebun dan industri.",
  },
  "ind-emp": {
    perspective: "Learning & Growth · Human Capital Excellence",
    summary:
      "Mengevaluasi retensi talenta (pengendalian Employee Turnover), tingkat keterikatan karyawan (Engagement Score), pemenuhan batch Management Trainee, serta realisasi jam pelatihan.",
    strategicRole:
      "Menjamin kesiapan kompetensi kepemimpinan dan stabilitas tenaga kerja operasional untuk menopang target produksi.",
  },
  "ind-prt": {
    perspective: "Customer & Stakeholder · Market Trust",
    summary:
      "Mengukur kepuasan dan kepercayaan mitra/pelanggan melalui pengendalian komplain & insiden kualitas, keberlanjutan sertifikasi pihak ketiga (ISO/standar global), program CSR berdampak bisnis, dan reputasi media.",
    strategicRole:
      "Menjaga reputasi merek dan akses pasar ekspor maupun kemitraan strategis jangka panjang.",
  },
  "ind-reg": {
    perspective: "Governance · Legal & Permit Readiness",
    summary:
      "Memantau ketepatan penyelesaian perizinan lahan & operasional strategis seperti proses HGU, IUP, serta kepatuhan sertifikasi alat dan keselamatan kerja (SIA/SIO/SILO).",
    strategicRole:
      "Mitigasi risiko hukum dan kepastian legalitas aset perkebunan maupun fasilitas industri.",
  },
};

const ACHIEVEMENT_BADGE: Record<
  AchColorBand,
  { bg: string; softBg: string; text: string; softText: string; border: string; solid: string; label: string }
> = {
  green: {
    bg: "#167267",
    softBg: "#E6F3F1",
    text: "#FFFFFF",
    softText: "#0F524A",
    border: "#B2DBD5",
    solid: "#167267",
    label: "Hijau (≥95%)",
  },
  yellow: {
    bg: "#FFE770",
    softBg: "#FFFBEB",
    text: "#3E3E3E",
    softText: "#6B5300",
    border: "#F0D558",
    solid: "#FFE770",
    label: "Kuning (80–<95%)",
  },
  red: {
    bg: "#FF7864",
    softBg: "#FFF2EF",
    text: "#FFFFFF",
    softText: "#9E3424",
    border: "#FFC7BE",
    solid: "#FF7864",
    label: "Merah (<80%)",
  },
  na: {
    bg: "#3E3E3E",
    softBg: "#EFEFEF",
    text: "#FFFFFF",
    softText: "#3E3E3E",
    border: "#CFCFCF",
    solid: "#3E3E3E",
    label: "N/A",
  },
};

type HorizonMode = "YTD" | "Quarter" | "MTD";
type ScopeFocus = "ALL" | "GROUP" | "UNITS";
type TrendGranularity = "MTD" | "Quarter";
type UnitMetricView = "actual_vs_target" | "ach";
type RootFilterKey = "periode" | "fokus" | "indikator" | null;
type FokusChildKey = "ALL" | "GROUP" | "RSUP_UNITS" | "SAMBU_UNITS";

function LightCardRadialGauge({
  value,
  band,
}: {
  value: number;
  band: AchColorBand;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeColor =
    band === "green"
      ? THEME.pineGreen
      : band === "yellow"
      ? "#E0BE28"
      : THEME.coralRed;

  return (
    <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="#DCE3F2"
          strokeWidth="10"
        />
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
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
          className="text-xl font-extrabold text-[#111827] tabular-nums tracking-tight"
        >
          {formatExecPct(value, 1)}
        </motion.span>
        <span className="text-[9px] font-bold text-[#1E3A6E] uppercase tracking-wider mt-0.5">
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

  // ── Progressive 3-Level Filter State (Induk -> Anak -> Cucu dalam 1 baris utama) ──
  const [openRootFilter, setOpenRootFilter] = useState<RootFilterKey>(null);
  const [fokusChildBranch, setFokusChildBranch] = useState<FokusChildKey>("ALL");
  const [indikatorShowGrandchild, setIndikatorShowGrandchild] = useState<boolean>(false);

  // Filter Fungsional
  const [horizon, setHorizon] = useState<HorizonMode>("YTD");
  const [selectedReportId, setSelectedReportId] = useState<string>("ytd-jan-oct-26");
  const [scopeFocus, setScopeFocus] = useState<ScopeFocus>("ALL");
  const [spotlightUnitId, setSpotlightUnitId] = useState<string>("ALL");
  const [showSambuGroup, setShowSambuGroup] = useState<boolean>(false);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string>("ALL");
  const [achBandFilter, setAchBandFilter] = useState<"ALL" | "green" | "yellow" | "red">("ALL");

  // Interactive Chart Mode States
  const [groupTrendMode, setGroupTrendMode] = useState<TrendGranularity>("MTD");
  const [unitTrendMode, setUnitTrendMode] = useState<TrendGranularity>("MTD");
  // Point 8: Komparasi per Indikator card auto memunculkan tab Aktual vs Target (Bobot)
  const [unitMetricView, setUnitMetricView] = useState<UnitMetricView>("actual_vs_target");
  const [indicatorSpotlightForUnits, setIndicatorSpotlightForUnits] = useState<string>("ind-fin");
  const [inspectedCell, setInspectedCell] = useState<{ indId: string; entId: string } | null>(null);
  // Point 15: Indikator yang disorot kursor pada Balanced Scorecard
  const [hoveredBscIndId, setHoveredBscIndId] = useState<string>("ind-fin");

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

  const sambuUnitEntities = useMemo(() => {
    const list = store.entities.filter((e) => e.kind === "unit" && e.groupName === "Sambu Group");
    if (!lockedUnits || lockedUnits.length === 0) return list;
    const matched = list.filter((u) => lockedUnits.some((lu) => isSameCompanyUnit(lu, u.name)));
    return matched.length > 0 ? matched : list;
  }, [store.entities, lockedUnits]);

  // Point 7: Auto memunculkan semua unit usaha RSUP Group, dan Sambu Group muncul jika tag Sambu Group diaktifkan
  const activeUnitEntities = useMemo(
    () => (showSambuGroup ? [...rsupUnitEntities, ...sambuUnitEntities] : rsupUnitEntities),
    [rsupUnitEntities, sambuUnitEntities, showSambuGroup],
  );

  // Kelompok laporan per Horizon (YTD, Quarter, MTD — tanpa Setahun/FY sesuai Point 5)
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

  // ── 1. Data Executive Summary RSUP Group (Point 3 & 17) & Perbandingan Unit Usaha (Point 4 & 7) ──
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

  const unitComparisonCards = useMemo(() => {
    return activeUnitEntities
      .map((ent) => {
        const tot = activeReport.totals?.[ent.id];
        const parsedAch = parseExecPct(tot?.ach);
        const hasData = parsedAch !== null && String(tot?.ach ?? "").trim() !== "";
        const achNum = parsedAch ?? 0;
        const band: AchColorBand = hasData ? classifyAchBand(tot?.ach, true, tot?.bandOverride) : "na";
        const q1 = quarterReports[0] ? parseExecPct(quarterReports[0].totals?.[ent.id]?.ach) : null;
        const qLast =
          quarterReports.length > 1
            ? parseExecPct(quarterReports[quarterReports.length - 1].totals?.[ent.id]?.ach)
            : null;
        const qDelta = hasData && q1 !== null && qLast !== null ? Math.round((qLast - q1) * 10) / 10 : null;

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
        return {
          entity: ent,
          hasData,
          achNum,
          achStr: hasData ? tot?.ach || formatExecPct(achNum, 1) : "—",
          band,
          qDelta,
          greenCount,
          yellowCount,
          redCount,
        };
      })
      .filter((item) => achBandFilter === "ALL" || !item.hasData || item.band === achBandFilter);
  }, [activeUnitEntities, activeReport, quarterReports, store.indicators, achBandFilter]);

  // ── 2. Data Perspektif RSUP Group (tanpa Setahun) ──
  const rsupGroupMultiHorizonData = useMemo(() => {
    const items: Array<{ label: string; category: string; ach: number; band: AchColorBand }> = [];
    const pushPoint = (label: string, category: string, rep: ExecSummaryReportBlock) => {
      const valStr =
        selectedIndicatorId !== "ALL"
          ? rep.cells?.[selectedIndicatorId]?.[groupEntity.id]?.ach
          : rep.totals?.[groupEntity.id]?.ach;
      const ach = parseExecPct(valStr) ?? 0;
      items.push({
        label,
        category,
        ach,
        band: classifyAchBand(
          valStr,
          true,
          selectedIndicatorId === "ALL" ? rep.totals?.[groupEntity.id]?.bandOverride : undefined,
        ),
      });
    };
    if (latestYtdReport) pushPoint("YTD Okt'26", "YTD", latestYtdReport);
    quarterReports.forEach((q) => pushPoint(q.shortLabel, "Quarter", q));
    mtdReports.forEach((m) => pushPoint(m.shortLabel, "Perbulan", m));
    return items;
  }, [latestYtdReport, quarterReports, mtdReports, groupEntity.id, selectedIndicatorId]);

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
          color: INDICATOR_COLORS[ind.id] ?? THEME.pineGreen,
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

  // ── 3. Data Summary Perbandingan Antar Unit Usaha (Point 7, 8, 9) ──

  // Point 7: Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator (auto tampilkan semua unit usaha)
  const unitSixIndicatorsData = useMemo(() => {
    return activeUnitEntities
      .filter((u) => spotlightUnitId === "ALL" || u.id === spotlightUnitId)
      .map((u) => {
        const row: Record<string, string | number> = {
          id: u.id,
          unit: u.shortName,
          fullName: u.name,
          groupName: u.groupName,
        };
        for (const ind of store.indicators) {
          const cell = activeReport.cells?.[ind.id]?.[u.id];
          row[ind.id] = cell && cell.applicable ? parseExecPct(cell.ach) ?? 0 : 0;
        }
        return row;
      });
  }, [activeUnitEntities, spotlightUnitId, store.indicators, activeReport]);

  // Point 8: Komparasi per Indikator (auto memunculkan Aktual vs Target Bobot)
  const unitBySelectedIndicatorData = useMemo(() => {
    const targetInd =
      store.indicators.find(
        (i) => i.id === (selectedIndicatorId !== "ALL" ? selectedIndicatorId : indicatorSpotlightForUnits),
      ) ?? store.indicators[0];
    const rows = [groupEntity, ...activeUnitEntities]
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || e.kind === "group")
      .map((ent) => {
        const cell = activeReport.cells?.[targetInd.id]?.[ent.id];
        const isSambuUnfilled = ent.groupName === "Sambu Group" && !cell;
        const applicable = isSambuUnfilled ? true : Boolean(cell?.applicable);
        const bobot = applicable ? parseExecPct(cell?.bobot) ?? 0 : 0;
        const actual = applicable ? parseExecPct(cell?.actual) ?? 0 : 0;
        const ach = applicable ? parseExecPct(cell?.ach) ?? 0 : 0;
        const band: AchColorBand =
          cell && String(cell.ach ?? "").trim() ? classifyAchBand(cell.ach, applicable) : "na";
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
      .filter((r) => r.applicable && (achBandFilter === "ALL" || r.band === "na" || r.band === achBandFilter));
    return { indicator: targetInd, rows };
  }, [
    store.indicators,
    selectedIndicatorId,
    indicatorSpotlightForUnits,
    groupEntity,
    activeUnitEntities,
    spotlightUnitId,
    activeReport,
    achBandFilter,
  ]);

  // Point 9: Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group (MTD | Q1–Q4, dinamis mengikuti filter Indikator KPI)
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
      for (const u of activeUnitEntities) {
        row[u.id] = resolveEntityVal(rep, u.id);
      }
      return row;
    });
  }, [unitTrendMode, mtdReports, quarterReports, selectedIndicatorId, groupEntity.id, activeUnitEntities]);

  // ── 4. Data Strategic Intelligence Suite (Points 10, 11, 12, 13, 14, 15) ──

  // Point 14: Defisit Poin Menuju 100% (Unit Usaha + RSUP Group sesuai scopeFocus)
  const gapAttributionData = useMemo(() => {
    const entitiesList =
      scopeFocus === "GROUP"
        ? [groupEntity]
        : scopeFocus === "UNITS"
        ? activeUnitEntities
        : [groupEntity, ...activeUnitEntities];
    return entitiesList
      .filter((e) => spotlightUnitId === "ALL" || e.id === spotlightUnitId || e.kind === "group")
      .map((ent) => {
        const rawTot = activeReport.totals?.[ent.id]?.ach;
        const hasData = parseExecPct(rawTot) !== null && String(rawTot ?? "").trim() !== "";
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
          hasData,
          achieved: totAch,
          totalLoss: Math.round(totalLoss * 10) / 10,
          losses,
          topDrag: losses[0] ?? null,
        };
      });
  }, [scopeFocus, groupEntity, activeUnitEntities, spotlightUnitId, activeReport, store.indicators, selectedIndicatorId]);

  // Point 15: Balanced Scorecard Radar + Penjelasan Indikator yang disorot kursor
  const radarComparison = useMemo(() => {
    const rsupScoredUnits = unitComparisonCards.filter((u) => u.hasData);
    const focusUnit: ExecSummaryEntityDef | undefined =
      spotlightUnitId !== "ALL"
        ? activeUnitEntities.find((u) => u.id === spotlightUnitId)
        : rsupScoredUnits[0]?.entity ?? activeUnitEntities[0];
    const watchUnit: ExecSummaryEntityDef | undefined =
      spotlightUnitId !== "ALL"
        ? rsupScoredUnits[0]?.entity?.id !== spotlightUnitId
          ? rsupScoredUnits[0]?.entity
          : rsupScoredUnits[rsupScoredUnits.length - 1]?.entity
        : rsupScoredUnits[rsupScoredUnits.length - 1]?.entity;

    const data = store.indicators.map((ind) => {
      const gCell = activeReport.cells?.[ind.id]?.[groupEntity.id];
      const fCell = focusUnit ? activeReport.cells?.[ind.id]?.[focusUnit.id] : undefined;
      const wCell = watchUnit ? activeReport.cells?.[ind.id]?.[watchUnit.id] : undefined;
      return {
        indId: ind.id,
        indicator: ind.shortLabel,
        fullIndicator: ind.label,
        groupVal: gCell?.applicable ? Math.min(105, parseExecPct(gCell.ach) ?? 0) : 0,
        focusVal: fCell?.applicable ? Math.min(105, parseExecPct(fCell.ach) ?? 0) : 0,
        watchVal: wCell?.applicable ? Math.min(105, parseExecPct(wCell.ach) ?? 0) : 0,
      };
    });
    return { focusUnit, watchUnit, data };
  }, [store.indicators, activeReport, groupEntity.id, spotlightUnitId, activeUnitEntities, unitComparisonCards]);

  const activeBscInd = useMemo(() => {
    const targetId = selectedIndicatorId !== "ALL" ? selectedIndicatorId : hoveredBscIndId;
    return store.indicators.find((i) => i.id === targetId) ?? store.indicators[0];
  }, [store.indicators, selectedIndicatorId, hoveredBscIndId]);

  const activeBscExplanation = useMemo(() => {
    const meta = BALANCED_SCORECARD_DESCRIPTIONS[activeBscInd.id] ?? {
      perspective: "Strategic Balanced Scorecard",
      summary: `Pengukuran pencapaian indikator strategis ${activeBscInd.label}.`,
      strategicRole: "Menjaga keselarasan target bisnis lintas Group dan Unit Usaha.",
    };
    const entitiesToCompare = [
      groupEntity,
      ...(radarComparison.focusUnit ? [radarComparison.focusUnit] : []),
      ...(radarComparison.watchUnit && radarComparison.watchUnit.id !== radarComparison.focusUnit?.id
        ? [radarComparison.watchUnit]
        : []),
    ];
    const metrics = entitiesToCompare.map((ent) => {
      const cell = activeReport.cells?.[activeBscInd.id]?.[ent.id];
      const applicable = Boolean(cell?.applicable);
      const band = applicable && cell?.ach ? classifyAchBand(cell.ach, true) : "na";
      return {
        entity: ent,
        applicable,
        bobot: applicable ? cell?.bobot || "—" : "N/A",
        actual: applicable ? cell?.actual || "—" : "N/A",
        ach: applicable ? cell?.ach || "—" : "N/A",
        band,
      };
    });
    return { ind: activeBscInd, meta, metrics };
  }, [activeBscInd, groupEntity, radarComparison.focusUnit, radarComparison.watchUnit, activeReport]);

  // Point 12: Drilldown Lintasan Historis HANYA memunculkan sesuai filter Periode aktif (tidak menggabungkan)
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
          type: rep.periodType,
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
    showSambuGroup;

  const resetFilters = () => {
    setHorizon("YTD");
    setSelectedReportId(ytdReports[0]?.id ?? "");
    setScopeFocus("ALL");
    setSpotlightUnitId("ALL");
    setShowSambuGroup(false);
    setSelectedIndicatorId("ALL");
    setAchBandFilter("ALL");
    setOpenRootFilter(null);
  };

  const masterExecPath = `${portalPath || "/hr"}/settings/master/kpi/executive-summary`;

  const SambuToggleTag = ({ compact = false }: { compact?: boolean }) => (
    <button
      type="button"
      onClick={() => setShowSambuGroup((prev) => !prev)}
      title="Klik untuk menampilkan atau menyembunyikan kartu & grafik Unit Usaha Sambu Group"
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border transition-all cursor-pointer select-none ${
        compact ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]"
      } ${
        showSambuGroup
          ? "bg-[#167267] text-white border-[#167267] shadow-2xs"
          : "bg-[#FFFBEB] text-[#3E3E3E] border-[#E8CE4D] hover:bg-[#FFE770]/60"
      }`}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: showSambuGroup ? "#FFE770" : "#167267" }}
      />
      <span>{showSambuGroup ? "Sambu Group: Aktif (3 Unit)" : "+ Sambu Group"}</span>
    </button>
  );

  // Ringkasan label pada 3 tombol induk filter
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
      ? showSambuGroup
        ? "Semua Unit (RSUP + Sambu)"
        : "Unit Usaha RSUP"
      : showSambuGroup
      ? "Semua (RSUP + Sambu)"
      : "RSUP Group & Unit";
  const indikatorSummaryLabel =
    (activeFilterIndicatorObj ? activeFilterIndicatorObj.shortLabel : "Semua 6 Indikator") +
    (achBandFilter !== "ALL"
      ? ` · ${achBandFilter === "green" ? "Hijau" : achBandFilter === "yellow" ? "Kuning" : "Merah"}`
      : "");

  return (
    <div className="w-full space-y-5">
      {/* ══ POINT 18: 1-ROW ROOT FILTER BAR (Periode · Fokus · Indikator KPI) -> ANAK TAG -> CUCU TAG ══ */}
      <div className="sticky top-0 z-20 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3 shadow-sm space-y-2.5">
        {/* Baris Utama Tunggal */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Root Tag 1: PERIODE */}
            <button
              type="button"
              onClick={() => setOpenRootFilter((p) => (p === "periode" ? null : "periode"))}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                openRootFilter === "periode"
                  ? "bg-[#167267] text-white border-[#167267] shadow-xs"
                  : "bg-[#E6F3F1] text-[#167267] border-[#B2DBD5] hover:bg-[#D5ECE8]"
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
                  ? "bg-[#3E3E3E] text-white border-[#3E3E3E] shadow-xs"
                  : "bg-[#FFFBEB] text-[#3E3E3E] border-[#E8CE4D] hover:bg-[#FFE770]/55"
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
                  ? "bg-[#FF7864] text-white border-[#FF7864] shadow-xs"
                  : "bg-[#FFF2EF] text-[#9E3424] border-[#FFC7BE] hover:bg-[#FFE3DE]"
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
            <SambuToggleTag />
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
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#EAEFF9] text-[#1E3A6E] border border-[#DCE3F2] hover:bg-[#DCE5F7] transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                Kelola Data Master KPI
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </button>
            )}
          </div>
        </div>

        {/* Panel Anak Tag & Cucu Tag (muncul lembut saat Root Tag diklik) */}
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
                {/* Anak Tag Periode */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#167267] mr-1">
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
                          ? "bg-[#167267] text-white border-[#167267]"
                          : "bg-[#E6F3F1]/75 text-[#167267] border-[#B2DBD5] hover:bg-[#E6F3F1]"
                      }`}
                    >
                      <span>{child.label}</span>
                      {child.id !== "YTD" && <ChevronRight className="w-3 h-3 opacity-75" />}
                    </button>
                  ))}
                </div>

                {/* Cucu Tag Periode (muncul saat Quarter atau Perbulan dipilih, atau bila ada >1 YTD) */}
                {(horizon === "Quarter" || horizon === "MTD" || ytdReports.length > 1) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#167267]/40 flex-wrap"
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
                            ? "bg-[#FFE770] text-[#3E3E3E] border-[#E5CA45] shadow-2xs"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#FFFBEB]"
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
                {/* Anak Tag Fokus */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#3E3E3E] mr-1">
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
                        id: "RSUP_UNITS" as const,
                        label: "Unit Usaha RSUP Group",
                        hasGrandchild: true,
                        onSelect: () => {
                          setFokusChildBranch("RSUP_UNITS");
                          setScopeFocus("UNITS");
                        },
                      },
                      {
                        id: "SAMBU_UNITS" as const,
                        label: "Unit Usaha Sambu Group",
                        hasGrandchild: true,
                        onSelect: () => {
                          setFokusChildBranch("SAMBU_UNITS");
                          setShowSambuGroup(true);
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
                          ? "bg-[#3E3E3E] text-white border-[#3E3E3E]"
                          : "bg-[#FFFBEB] text-[#3E3E3E] border-[#E8CE4D] hover:bg-[#FFE770]/60"
                      }`}
                    >
                      <span>{child.label}</span>
                      {child.hasGrandchild && <ChevronRight className="w-3 h-3 opacity-75" />}
                    </button>
                  ))}
                </div>

                {/* Cucu Tag Fokus: Daftar Unit Usaha RSUP atau Sambu */}
                {(fokusChildBranch === "RSUP_UNITS" || fokusChildBranch === "SAMBU_UNITS") && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#E5CA45] flex-wrap"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Spotlight Unit:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSpotlightUnitId("ALL")}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                        spotlightUnitId === "ALL"
                          ? "bg-[#167267] text-white border-[#167267]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-[#E6F3F1]"
                      }`}
                    >
                      Semua Unit
                    </button>
                    {(fokusChildBranch === "RSUP_UNITS" ? rsupUnitEntities : sambuUnitEntities).map((u) => {
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
                {/* Anak Tag Indikator KPI */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E3424] mr-1">
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
                        ? "bg-[#167267] text-white border-[#167267]"
                        : "bg-[#E6F3F1] text-[#167267] border-[#B2DBD5]"
                    }`}
                  >
                    <span>Semua 6 Indikator</span>
                    <ChevronRight className="w-3 h-3 opacity-75" />
                  </button>
                  {store.indicators.map((ind) => {
                    const isAct = selectedIndicatorId === ind.id;
                    const cHex = INDICATOR_COLORS[ind.id] ?? THEME.pineGreen;
                    return (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => {
                          const next = selectedIndicatorId === ind.id ? "ALL" : ind.id;
                          setSelectedIndicatorId(next);
                          if (next !== "ALL") {
                            setIndicatorSpotlightForUnits(next);
                            setHoveredBscIndId(next);
                          }
                          setIndikatorShowGrandchild(true);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          isAct
                            ? "text-white shadow-2xs"
                            : "bg-[#FFF2EF]/75 text-[#3E3E3E] border-[#FFC7BE] hover:bg-[#FFF2EF]"
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

                {/* Cucu Tag Indikator KPI: Status Achievement sesuai palet lampiran */}
                {(indikatorShowGrandchild || achBandFilter !== "ALL") && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 pl-3 border-l-2 border-[#FF7864] flex-wrap"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Status Achievement:
                    </span>
                    {(
                      [
                        {
                          id: "ALL" as const,
                          label: "Semua Achievement",
                          bg: "#3E3E3E",
                          text: "#FFFFFF",
                          idle: "bg-slate-100 text-[#3E3E3E] border-slate-300",
                        },
                        {
                          id: "green" as const,
                          label: "Hijau ≥95%",
                          bg: "#167267",
                          text: "#FFFFFF",
                          idle: "bg-[#E6F3F1] text-[#167267] border-[#B2DBD5]",
                        },
                        {
                          id: "yellow" as const,
                          label: "Kuning 80–<95%",
                          bg: "#FFE770",
                          text: "#3E3E3E",
                          idle: "bg-[#FFFBEB] text-[#6B5300] border-[#E8CE4D]",
                        },
                        {
                          id: "red" as const,
                          label: "Merah <80%",
                          bg: "#FF7864",
                          text: "#FFFFFF",
                          idle: "bg-[#FFF2EF] text-[#9E3424] border-[#FFC7BE]",
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
                            act ? "shadow-2xs" : st.idle
                          }`}
                          style={
                            act
                              ? { backgroundColor: st.bg, color: st.text, borderColor: st.bg }
                              : undefined
                          }
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

      {/* ══ HERO ROW: EXECUTIVE SUMMARY RSUP GROUP (Point 3 & 17) + PERBANDINGAN UNIT USAHA (Point 4 & 7) ══ */}
      <motion.div
        key={`hero-${activeReport.id}-${showSambuGroup}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="grid grid-cols-1 xl:grid-cols-12 gap-4"
      >
        {/* Point 3 & Point 17: Executive Boardroom Pulse Card — mengikuti desain Total Employees card di Appraisal Analytics */}
        <div className="xl:col-span-5 group relative overflow-hidden bg-gradient-to-br from-[#EAEFF9] via-[#F6F8FD] to-white border border-[#DCE3F2] rounded-2xl p-5 flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
          <div
            className="pointer-events-none absolute -right-6 -bottom-7 w-28 h-28 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
            style={{ backgroundColor: "#1E3A6E0D" }}
          />

          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Executive Boardroom Pulse · {activeReport.shortLabel}
              </p>
              <h3 className="text-lg font-extrabold text-[#111827] mt-1 leading-tight">
                Executive Summary {groupEntity.name}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{activeReport.title}</p>
            </div>
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
              style={{ backgroundColor: "#1E3A6E" }}
            >
              <Compass className="w-5 h-5" />
            </div>
          </div>

          <div className="flex items-center gap-4 my-4 relative z-10">
            <LightCardRadialGauge value={groupActiveTotal.num} band={groupActiveTotal.band} />
            <div className="flex-1 grid grid-cols-3 gap-2">
              {[
                { lbl: "YTD (Jan–Okt)", val: groupHorizonSnapshot.ytd, key: "YTD" as const },
                { lbl: `Quarter (${groupHorizonSnapshot.quarterLabel})`, val: groupHorizonSnapshot.quarter, key: "Quarter" as const },
                { lbl: `Bulan (${groupHorizonSnapshot.mtdLabel})`, val: groupHorizonSnapshot.mtd, key: "MTD" as const },
              ].map((hItem) => (
                <button
                  key={hItem.lbl}
                  type="button"
                  onClick={() => setHorizon(hItem.key)}
                  className={`text-left rounded-xl px-2.5 py-2 border transition-all cursor-pointer ${
                    horizon === hItem.key
                      ? "bg-[#1E3A6E] text-white border-[#1E3A6E] shadow-2xs"
                      : "bg-white/85 text-[#111827] border-[#DCE3F2] hover:bg-white"
                  }`}
                >
                  <p
                    className={`text-[10px] font-medium truncate ${
                      horizon === hItem.key ? "text-white/80" : "text-gray-500"
                    }`}
                  >
                    {hItem.lbl}
                  </p>
                  <p className="text-sm font-extrabold tabular-nums mt-0.5">
                    {formatExecPct(hItem.val, 1)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 pt-3 border-t border-[#DCE3F2]/80 text-[11px] text-gray-500 font-medium relative z-10">
            <span>
              Target Bobot: <strong className="text-[#111827]">100%</strong> · Defisit ke 100%:{" "}
              <strong style={{ color: "#9E3424" }}>
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
                stroke="#1E3A6E"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Point 4 & Point 7: Perbandingan Pencapaian Unit Usaha + Tag Sambu Group */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[#167267]" />
                Perbandingan Pencapaian Unit Usaha ({activeReport.shortLabel})
              </h3>
              <p className="text-[11px] text-slate-500">
                Klik kartu unit usaha untuk menyalakan mode <strong>Spotlight</strong> lintas seluruh grafik
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <SambuToggleTag compact />
              {spotlightUnitId !== "ALL" && (
                <button
                  type="button"
                  onClick={() => setSpotlightUnitId("ALL")}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F3F1] text-[#167267] border border-[#B2DBD5] hover:bg-[#D5ECE8] cursor-pointer"
                >
                  <X className="w-3 h-3" /> Semua Unit
                </button>
              )}
            </div>
          </div>

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 ${
              showSambuGroup ? "lg:grid-cols-4" : "lg:grid-cols-5"
            } gap-2.5 my-auto`}
          >
            {unitComparisonCards.map((item, idx) => {
              const isSpot = spotlightUnitId === item.entity.id;
              const bMeta = ACHIEVEMENT_BADGE[item.band];
              const isSambu = item.entity.groupName === "Sambu Group";
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
                      ? "ring-2 ring-[#167267] border-[#167267] bg-[#E6F3F1]/40 shadow-sm"
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
                    <span
                      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
                        isSambu
                          ? "bg-[#FFFBEB] text-[#6B5300] border border-[#E8CE4D]"
                          : "bg-[#E6F3F1] text-[#167267]"
                      }`}
                    >
                      {isSambu ? "Sambu" : "RSUP"}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: bMeta.solid }}
                      title={bMeta.label}
                    />
                  </div>
                  <div className="my-2">
                    <p
                      className="text-[11px] font-bold text-slate-700 leading-snug line-clamp-1"
                      title={item.entity.name}
                    >
                      {item.entity.shortName}
                    </p>
                    <p className="text-xl font-extrabold text-[#111827] tabular-nums mt-0.5">
                      {item.achStr}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.hasData ? Math.min(100, item.achNum) : 0}%` }}
                        transition={{ duration: 0.65, delay: idx * 0.04 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: bMeta.solid }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      {item.hasData ? (
                        <>
                          <span className="inline-flex items-center gap-1">
                            <span className="font-bold" style={{ color: "#167267" }}>
                              {item.greenCount}H
                            </span>
                            ·
                            <span className="font-bold" style={{ color: "#947400" }}>
                              {item.yellowCount}K
                            </span>
                            ·
                            <span className="font-bold" style={{ color: "#D9533F" }}>
                              {item.redCount}M
                            </span>
                          </span>
                          {item.qDelta !== null && (
                            <span
                              className="font-bold"
                              style={{ color: item.qDelta >= 0 ? "#167267" : "#D9533F" }}
                              title="Perubahan Q1 ke Q4"
                            >
                              {item.qDelta >= 0 ? `+${item.qDelta}%` : `${item.qDelta}%`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">Belum diisi di Master KPI</span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ══ SECTION 1: PERSPEKTIF KONSOLIDASI RSUP GROUP ══ */}
      {scopeFocus !== "UNITS" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#3E3E3E] text-white flex items-center justify-center shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111827]">
                Perspektif Konsolidasi {groupEntity.name}
              </h3>
              <p className="text-xs text-slate-500">
                Perbandingan YTD, Quarter &amp; Perbulan · Aktual vs Target (Bobot) per Indikator KPI · Trend Lintas Waktu
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Chart 1A: RSUP Group Summary Comparison YTD, Quarter, Perbulan */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#167267] bg-[#E6F3F1] border border-[#B2DBD5] px-2 py-0.5 rounded-full">
                  RSUP Group · Multi-Horizon
                </span>
                <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                  Summary Pencapaian RSUP Group: YTD · Quarter · Perbulan
                  {activeFilterIndicatorObj ? ` (${activeFilterIndicatorObj.shortLabel})` : ""}
                </h4>
              </div>
              <div className="h-[275px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rsupGroupMultiHorizonData} margin={{ top: 12, right: 12, left: -14, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#3E3E3E" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={42}
                    />
                    <YAxis domain={[60, 105]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                    <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" label={{ value: "Hijau 95%", position: "insideTopRight", fontSize: 9, fill: "#167267" }} />
                    <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" label={{ value: "Batas Kritis 80%", position: "insideBottomRight", fontSize: 9, fill: "#D9533F" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as (typeof rsupGroupMultiHorizonData)[number];
                        const meta = ACHIEVEMENT_BADGE[d.band];
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs space-y-1">
                            <p className="font-bold text-[#111827]">{d.label} ({d.category})</p>
                            <p className="font-semibold" style={{ color: meta.softText }}>
                              Achievement RSUP Group: {formatExecPct(d.ach, 1)}
                            </p>
                            <p className="text-[10px] text-slate-500">Defisit ke 100%: -{formatExecPct(Math.max(0, 100 - d.ach), 1)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ach" radius={[6, 6, 0, 0]} barSize={24} animationDuration={750}>
                      {rsupGroupMultiHorizonData.map((entry, index) => (
                        <Cell
                          key={`grp-bar-${index}`}
                          fill={ACHIEVEMENT_BADGE[entry.band].solid}
                        />
                      ))}
                    </Bar>
                    <Line
                      type="monotone"
                      dataKey="ach"
                      stroke="#3E3E3E"
                      strokeWidth={2.2}
                      dot={{ r: 3.5, fill: "#3E3E3E" }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 pt-1 text-[10px] text-slate-600 flex-wrap">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#167267" }} /> Hijau ≥95%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs border border-[#D4B830]" style={{ backgroundColor: "#FFE770" }} /> Kuning 80–&lt;95%
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#FF7864" }} /> Merah &lt;80%
                </span>
              </div>
            </div>

            {/* Chart 1B: RSUP Group Aktual vs Target (Bobot) & Achievement per Indikator KPI */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#3E3E3E] bg-[#FFFBEB] border border-[#E8CE4D] px-2 py-0.5 rounded-full">
                  Aktual vs Target Bobot &amp; Achievement · {activeReport.shortLabel}
                </span>
                <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                  Pencapaian per Indikator KPI — {groupEntity.name}
                </h4>
              </div>

              <div className="space-y-3 my-auto">
                {rsupGroupIndicatorBreakdown.map((item, idx) => {
                  const bMeta = ACHIEVEMENT_BADGE[item.band];
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
                            Actual <strong className="text-[#111827]">{item.actualStr}</strong> / Bobot{" "}
                            <strong>{item.bobotStr}</strong>
                          </span>
                          {item.pointGap > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FFF2EF] text-[#9E3424] border border-[#FFC7BE] tabular-nums">
                              -{formatExecPct(item.pointGap, 1)} poin
                            </span>
                          )}
                          <span
                            className="px-2 py-0.5 rounded-full text-[11px] font-extrabold border tabular-nums min-w-[82px] text-center"
                            style={{
                              backgroundColor: bMeta.bg,
                              color: bMeta.text,
                              borderColor: bMeta.bg,
                            }}
                          >
                            Achievement {item.achStr}
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

          {/* Chart 1C: Trend Multi-Indikator RSUP Group (Perbulan | Q1–Q4) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h4 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <LineChartIcon className="w-4 h-4 text-[#167267]" />
                  Trend Achievement (%) per Indikator KPI — {groupEntity.name}
                </h4>
                <p className="text-xs text-slate-500">
                  Pergerakan capaian setiap Indikator KPI RSUP Group dari waktu ke waktu
                </p>
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
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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

            <div className="h-[265px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rsupGroupIndicatorTrendData} margin={{ top: 10, right: 18, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#3E3E3E" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[55, 105]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  {visibleIndicators
                    .filter((ind) => ind.id !== "ind-reg")
                    .map((ind) => (
                      <Line
                        key={ind.id}
                        type="monotone"
                        dataKey={ind.id}
                        name={ind.shortLabel}
                        stroke={INDICATOR_COLORS[ind.id] ?? THEME.pineGreen}
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

      {/* ══ SECTION 2: SUMMARY PERBANDINGAN ANTAR UNIT USAHA (Points 7, 8, 9) ══ */}
      {scopeFocus !== "GROUP" && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#167267] text-white flex items-center justify-center shadow-xs">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827]">
                  Summary Perbandingan Antar Unit Usaha
                </h3>
                <p className="text-xs text-slate-500">
                  Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator · Aktual vs Target (Bobot) · Trend Lintasan Unit
                </p>
              </div>
            </div>
            <SambuToggleTag />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Point 7: Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#167267] bg-[#E6F3F1] border border-[#B2DBD5] px-2 py-0.5 rounded-full">
                    Perspektif 6 Indikator KPI · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                    Perbandingan Achievement Unit Usaha dari Perspektif 6 Indikator
                  </h4>
                </div>
                <SambuToggleTag compact />
              </div>
              <div className="h-[295px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={unitSixIndicatorsData} margin={{ top: 10, right: 12, left: -14, bottom: 4 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="unit" tick={{ fontSize: 10, fill: "#3E3E3E", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                    <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" />
                    <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                      formatter={(val: number) => [`${val}%`, undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10.5 }} />
                    {visibleIndicators.map((ind) => (
                      <Bar
                        key={ind.id}
                        dataKey={ind.id}
                        name={ind.shortLabel}
                        fill={INDICATOR_COLORS[ind.id] ?? THEME.pineGreen}
                        radius={[3, 3, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Point 8: Komparasi per Indikator card — auto memunculkan tab Aktual vs Target (Bobot) */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#3E3E3E] bg-[#FFFBEB] border border-[#E8CE4D] px-2 py-0.5 rounded-full">
                    Komparasi per Indikator · {activeReport.shortLabel}
                  </span>
                  <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                    {unitBySelectedIndicatorData.indicator.label}
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <SambuToggleTag compact />
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
                <div className="flex items-center gap-1 mb-2.5 flex-wrap">
                  {store.indicators.map((ind) => (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setIndicatorSpotlightForUnits(ind.id)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                        indicatorSpotlightForUnits === ind.id
                          ? "bg-[#167267] text-white border-[#167267]"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-[#E6F3F1]"
                      }`}
                    >
                      {ind.shortLabel}
                    </button>
                  ))}
                </div>
              )}

              <div className="h-[245px] w-full mt-auto">
                <ResponsiveContainer width="100%" height="100%">
                  {unitMetricView === "actual_vs_target" ? (
                    <BarChart data={unitBySelectedIndicatorData.rows} margin={{ top: 8, right: 12, left: -14, bottom: 4 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#3E3E3E", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }}
                        formatter={(val: number) => [`${val}%`, undefined]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="bobot" name="Target (Bobot %)" fill="#D6DCE5" radius={[5, 5, 0, 0]} barSize={20} />
                      <Bar dataKey="actual" name="Aktual Kontribusi (%)" fill="#167267" radius={[5, 5, 0, 0]} barSize={20} />
                    </BarChart>
                  ) : (
                    <BarChart data={unitBySelectedIndicatorData.rows} margin={{ top: 8, right: 12, left: -14, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="entity" tick={{ fontSize: 10, fill: "#3E3E3E", fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                      <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" />
                      <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as (typeof unitBySelectedIndicatorData.rows)[number];
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-lg text-xs space-y-1">
                              <p className="font-bold text-[#111827]">{d.fullName}</p>
                              <p className="font-semibold" style={{ color: "#167267" }}>
                                Achievement: {formatExecPct(d.ach, 1)}
                              </p>
                              <p className="text-slate-600">
                                Actual: <strong>{d.actual}%</strong> dari Target Bobot <strong>{d.bobot}%</strong>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="ach" name="Achievement (%)" radius={[6, 6, 0, 0]} barSize={30}>
                        {unitBySelectedIndicatorData.rows.map((entry) => (
                          <Cell
                            key={entry.id}
                            fill={ACHIEVEMENT_BADGE[entry.band].solid}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Point 9: Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group (MTD | Q1–Q4, mengikuti filter Indikator KPI) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h4 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#167267]" />
                  Trend Lintasan Pencapaian Unit Usaha vs Benchmark RSUP Group
                  {activeFilterIndicatorObj ? ` — ${activeFilterIndicatorObj.label}` : ""}
                </h4>
                <p className="text-xs text-slate-500">
                  {activeFilterIndicatorObj
                    ? `Menampilkan trend Achievement khusus indikator "${activeFilterIndicatorObj.label}"`
                    : "Menampilkan trend Total Achievement seluruh indikator (pilih filter Indikator KPI di atas untuk fokus ke satu indikator)"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <SambuToggleTag compact />
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
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
            </div>

            <div className="h-[285px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={unitTrajectoryData} margin={{ top: 10, right: 18, left: -12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="rsupGroupThemeBand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3E3E3E" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#3E3E3E" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#3E3E3E" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[30, 108]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                  <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" />
                  <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" />
                  <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Area
                    type="monotone"
                    dataKey={groupEntity.id}
                    name={`${groupEntity.shortName} (Benchmark)`}
                    fill="url(#rsupGroupThemeBand)"
                    stroke="#3E3E3E"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    connectNulls
                  />
                  {activeUnitEntities.map((u) => {
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
                        connectNulls
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.section>
      )}

      {/* ══ SECTION 3: STRATEGIC INTELLIGENCE SUITE (Points 10, 11, 12, 13, 14, 15) ══ */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#167267] text-white flex items-center justify-center shadow-xs">
              <Gauge className="w-4 h-4" />
            </div>
            <div>
              {/* Point 10 & Point 11: Strategic Intelligence Suite tanpa subjudul Pareto... */}
              <h3 className="text-base font-bold text-[#111827]">
                Strategic Intelligence Suite
              </h3>
            </div>
          </div>
          <SambuToggleTag />
        </div>

        {/* 3A. Interactive Risk & Achievement Heatmap Matrix + Cell Drilldown (Point 12) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#3E3E3E] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                Interactive Risk &amp; Achievement Matrix · {activeReport.shortLabel}
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                Peta Kesehatan Strategis Lintas Entitas &amp; Indikator KPI (Klik Sel untuk Melihat Histori Trend)
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#167267" }}>
                ≥95% Hijau
              </span>
              <span className="px-2.5 py-0.5 rounded text-[#3E3E3E] border border-[#E8CE4D]" style={{ backgroundColor: "#FFE770" }}>
                80–&lt;95% Kuning
              </span>
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#FF7864" }}>
                &lt;80% Merah
              </span>
              <span className="px-2.5 py-0.5 rounded text-white" style={{ backgroundColor: "#3E3E3E" }}>
                N/A
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="bg-[#3E3E3E] text-white">
                  <th className="px-3.5 py-2.5 text-left font-bold">Indikator KPI</th>
                  {[groupEntity, ...activeUnitEntities].map((ent) => (
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
                    {[groupEntity, ...activeUnitEntities].map((ent) => {
                      const cell = activeReport.cells?.[ind.id]?.[ent.id];
                      if (!cell) {
                        return (
                          <td key={`${ind.id}-${ent.id}`} className="px-2 py-2 text-center bg-slate-50 text-slate-400 text-[10px]">
                            —
                          </td>
                        );
                      }
                      if (!cell.applicable) {
                        return (
                          <td
                            key={`${ind.id}-${ent.id}`}
                            className="px-2 py-2 text-center text-white/80 text-[10px] font-semibold"
                            style={{ backgroundColor: "#3E3E3E" }}
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
                              isSelected ? "ring-2 ring-[#3E3E3E] scale-[1.02] shadow-xs" : "hover:brightness-97"
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
                {/* Baris Total Achievement */}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-extrabold">
                  <td className="px-3.5 py-2.5 text-[#111827]">
                    Total Achievement ({activeReport.shortLabel})
                  </td>
                  {[groupEntity, ...activeUnitEntities].map((ent) => {
                    const tot = activeReport.totals?.[ent.id];
                    const hasVal = Boolean(tot?.ach && String(tot.ach).trim());
                    const band: AchColorBand = hasVal ? classifyAchBand(tot?.ach, true, tot?.bandOverride) : "na";
                    const meta = ACHIEVEMENT_BADGE[band];
                    return (
                      <td key={`hm-tot-${ent.id}`} className="p-1.5 text-center border-l border-slate-200">
                        <div
                          className="rounded-lg px-2 py-1.5 border text-xs font-extrabold tabular-nums"
                          style={
                            hasVal
                              ? {
                                  backgroundColor: meta.bg,
                                  color: meta.text,
                                  borderColor: meta.bg,
                                }
                              : {
                                  backgroundColor: "#F8FAFC",
                                  color: "#94A3B8",
                                  borderColor: "#E2E8F0",
                                }
                          }
                        >
                          {hasVal ? tot?.ach : "—"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Point 12: Drilldown Lintasan Historis HANYA memunculkan sesuai filter Periode aktif */}
          <AnimatePresence>
            {inspectedCellSeries && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-[#B2DBD5] bg-[#E6F3F1]/45 p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#111827]">
                        Drilldown Lintasan Historis: {inspectedCellSeries.ent.name} —{" "}
                        <span className="text-[#167267]">{inspectedCellSeries.ind.label}</span>
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
                  <div className="h-[175px] w-full bg-white rounded-xl border border-[#B2DBD5] p-2.5">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={inspectedCellSeries.points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#3E3E3E" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 110]} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} unit="%" />
                        <ReferenceLine y={95} stroke="#167267" strokeDasharray="4 4" />
                        <ReferenceLine y={80} stroke="#FF7864" strokeDasharray="3 3" />
                        <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                        <Bar dataKey="ach" name="Achievement (%)" fill="#167267" fillOpacity={0.22} radius={[4, 4, 0, 0]} barSize={28} />
                        <Line type="monotone" dataKey="ach" name="Trend Achievement (%)" stroke="#167267" strokeWidth={2.5} dot={{ r: 4, fill: "#167267" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3B & 3C: Defisit Poin Menuju 100% (Point 14) + Balanced Scorecard dengan Hover Explanation (Point 14 & 15) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Point 14: Diagnostic · Sumber Kehilangan Poin & Defisit Poin Menuju 100% */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E3424] bg-[#FFF2EF] border border-[#FFC7BE] px-2 py-0.5 rounded-full">
                  Diagnostic · Sumber Kehilangan Poin
                </span>
                <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                  Defisit Poin Menuju 100% ({activeReport.shortLabel})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mengidentifikasi Indikator yang paling menggerus skor tertimbang di masing-masing Unit Usaha
                </p>
              </div>
              <SambuToggleTag compact />
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
                    {row.hasData ? (
                      <span className="text-[11px] text-slate-500 tabular-nums text-right">
                        Tercapai <strong style={{ color: "#167267" }}>{row.achieved}%</strong> · Defisit{" "}
                        <strong style={{ color: "#D9533F" }}>-{row.totalLoss}%</strong>
                        {row.topDrag ? (
                          <span className="text-slate-400">
                            {" "}
                            (Utama: {row.topDrag.label} -{row.topDrag.loss}%)
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-[10px] italic text-slate-400">Belum diisi di Master KPI</span>
                    )}
                  </div>
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                    {row.hasData && (
                      <>
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, row.achieved)}%`,
                            backgroundColor: "#167267",
                          }}
                          title={`Poin Tercapai: ${row.achieved}%`}
                        />
                        {row.losses.map((seg) => (
                          <div
                            key={seg.indId}
                            className="h-full border-l border-white/70 transition-all duration-500"
                            style={{
                              width: `${Math.min(100 - row.achieved, seg.loss)}%`,
                              backgroundColor: seg.ach < 80 ? "#FF7864" : "#FFE770",
                            }}
                            title={`Defisit ${seg.label}: -${seg.loss}% (Achievement ${seg.ach}%)`}
                          />
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 pt-3 mt-3 border-t border-slate-100 text-[10px] text-slate-600 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#167267" }} /> Poin Tercapai
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs border border-[#D4B830]" style={{ backgroundColor: "#FFE770" }} /> Defisit | Watchlist
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: "#FF7864" }} /> Defisit | Kritis
              </span>
            </div>
          </div>

          {/* Point 14 & Point 15: Balanced Scorecard + Penjelasan Dinamis saat Kursor Menyorot Balanced Scorecard */}
          <div className="lg:col-span-6 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#167267] bg-[#E6F3F1] border border-[#B2DBD5] px-2 py-0.5 rounded-full">
                Balanced Scorecard
              </span>
              <h4 className="text-sm font-bold text-[#111827] mt-1.5">
                Keseimbangan 6 Indikator KPI &amp; Konsistensi Eksekusi Bulanan
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center my-auto">
              <div className="sm:col-span-6 h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={radarComparison.data}
                    outerRadius="68%"
                    onMouseMove={(state: unknown) => {
                      const st = state as { activePayload?: Array<{ payload?: { indId?: string } }> } | null;
                      const hoveredId = st?.activePayload?.[0]?.payload?.indId;
                      if (hoveredId && hoveredId !== hoveredBscIndId) {
                        setHoveredBscIndId(hoveredId);
                      }
                    }}
                  >
                    <PolarGrid stroke="#DCE3F2" />
                    <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 9.5, fill: "#3E3E3E", fontWeight: 600 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 105]} tick={{ fontSize: 8.5, fill: "#94A3B8" }} />
                    <Radar
                      name={groupEntity.shortName}
                      dataKey="groupVal"
                      stroke="#3E3E3E"
                      fill="#3E3E3E"
                      fillOpacity={0.16}
                      strokeWidth={2}
                    />
                    {radarComparison.focusUnit && (
                      <Radar
                        name={radarComparison.focusUnit.shortName}
                        dataKey="focusVal"
                        stroke="#167267"
                        fill="#167267"
                        fillOpacity={0.22}
                        strokeWidth={2}
                      />
                    )}
                    {radarComparison.watchUnit &&
                      radarComparison.watchUnit.id !== radarComparison.focusUnit?.id && (
                        <Radar
                          name={radarComparison.watchUnit.shortName}
                          dataKey="watchVal"
                          stroke="#FF7864"
                          fill="#FF7864"
                          fillOpacity={0.16}
                          strokeWidth={2}
                        />
                      )}
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Point 15: Penjelasan Dinamis dari Balanced Scorecard (mengikuti kursor pada grafik / indikator) */}
              <div className="sm:col-span-6 rounded-xl border border-[#DCE3F2] bg-gradient-to-br from-[#F6F8FD] via-white to-[#E6F3F1]/30 p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {store.indicators.map((ind) => {
                    const isCur = activeBscExplanation.ind.id === ind.id;
                    return (
                      <button
                        key={ind.id}
                        type="button"
                        onMouseEnter={() => setHoveredBscIndId(ind.id)}
                        onClick={() => setHoveredBscIndId(ind.id)}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border transition-all cursor-pointer ${
                          isCur
                            ? "bg-[#167267] text-white border-[#167267]"
                            : "bg-white text-slate-600 border-slate-200 hover:border-[#167267]"
                        }`}
                      >
                        {ind.shortLabel}
                      </button>
                    );
                  })}
                </div>

                <motion.div
                  key={activeBscExplanation.ind.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#167267] flex items-center gap-1">
                      <Info className="w-3 h-3 shrink-0" />
                      {activeBscExplanation.meta.perspective}
                    </p>
                    <h5 className="text-xs font-extrabold text-[#111827] mt-0.5">
                      {activeBscExplanation.ind.label}
                    </h5>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {activeBscExplanation.meta.summary}
                  </p>
                  <p className="text-[10.5px] text-slate-500 italic leading-snug">
                    Peran Strategis: {activeBscExplanation.meta.strategicRole}
                  </p>

                  {/* Ringkasan Achievement Indikator yang sedang disorot */}
                  <div className="pt-1.5 border-t border-slate-200/80 space-y-1">
                    {activeBscExplanation.metrics.map((m) => {
                      const bMeta = ACHIEVEMENT_BADGE[m.band];
                      return (
                        <div
                          key={m.entity.id}
                          className="flex items-center justify-between text-[10.5px] gap-2"
                        >
                          <span className="font-semibold text-slate-700 truncate">
                            {m.entity.shortName}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                            <span className="text-slate-400">
                              {m.actual}/{m.bobot}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded font-bold text-[10px]"
                              style={{
                                backgroundColor: bMeta.bg,
                                color: bMeta.text,
                              }}
                            >
                              {m.ach}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
