import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Edit3,
  Eye,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DualScrollTableContainer } from "../../../components/DualScrollTableContainer";
import {
  EXEC_MONTH_META_LIST,
  EXEC_QUARTER_META,
  MASTER_EXEC_SUMMARY_UPDATED_EVENT,
  classifyAchBand,
  computeEntityTotalFromCells,
  formatExecPct,
  getExecMonthMeta,
  inferMonthTagFromReport,
  inferQuarterTagFromReport,
  loadMasterExecutiveSummary,
  parseExecPct,
  recalculateQuarterAndYtdFromMtd,
  refreshMasterExecutiveSummaryFromBackend,
  saveMasterExecutiveSummary,
  sortExecSummaryReports,
  syncExecutiveSummaryFromActualBusinessKpi,
  type AchColorBand,
  type ExecSummaryPeriodType,
  type ExecSummaryReportBlock,
  type MasterExecutiveSummaryStore,
} from "./masterExecutiveSummaryStore";

const ACH_CELL_STYLE: Record<AchColorBand, { bg: string; text: string; border: string; shortTag: string; label: string }> = {
  green:  { bg: "#2E8555", text: "#FFFFFF", border: "#256D46", shortTag: "Hijau",  label: "HIJAU (95%–100%+)" },
  yellow: { bg: "#EA9942", text: "#FFFFFF", border: "#D4842E", shortTag: "Kuning", label: "KUNING (≥80% – <95%)" },
  red:    { bg: "#B84A4A", text: "#FFFFFF", border: "#9B3B3B", shortTag: "Merah",  label: "MERAH (<80%)" },
  na:     { bg: "#475569", text: "#E2E8F0", border: "#334155", shortTag: "N/A",    label: "N/A" },
};

type FilterTag = "ALL" | "YTD" | "Quarter" | "MTD";

export function MasterExecutiveSummaryTab({ canEdit = true }: { canEdit?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const portalMatch = location.pathname.match(/^\/(hr|bod|supervisor|employee)(?:\/|$)/);
  const portalPrefix = portalMatch ? `/${portalMatch[1]}` : "";
  const analyticsExecPath = `${portalPrefix}/analytics/executive-summary`;

  const [store, setStore] = useState<MasterExecutiveSummaryStore>(() => loadMasterExecutiveSummary());
  const [filterTag, setFilterTag] = useState<FilterTag>("ALL");
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [draftBlock, setDraftBlock] = useState<ExecSummaryReportBlock | null>(null);
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [deleteTargetReport, setDeleteTargetReport] = useState<ExecSummaryReportBlock | null>(null);
  const [showSyncActualConfirm, setShowSyncActualConfirm] = useState(false);
  const [isSyncingActual, setIsSyncingActual] = useState(false);

  const cycleSuffix = String(store.cycleYear || "2026").slice(-2) || "26";

  // Form state untuk + Tambah Laporan Periode
  const [newReportForm, setNewReportForm] = useState<{
    title: string;
    shortLabel: string;
    periodType: ExecSummaryPeriodType;
    sortOrder: number;
    monthTag: number;
    quarterTag: 1 | 2 | 3 | 4;
    totalLabel: string;
    cloneFromId: string;
  }>({
    title: "MTD Report (Nov'26)",
    shortLabel: "Nov'26",
    periodType: "MTD",
    sortOrder: 11,
    monthTag: 11,
    quarterTag: 4,
    totalLabel: "Total",
    cloneFromId: "mtd-oct-26",
  });

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

  // Selalu urutkan tabel berdasarkan tipe: YTD -> Quarter -> Month (MTD)
  const sortedReports = useMemo(
    () => sortExecSummaryReports(store.reports),
    [store.reports],
  );

  const existingMtdMonthsSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of sortedReports) {
      if (r.periodType === "MTD") {
        const m = inferMonthTagFromReport(r);
        if (m) set.add(m);
      }
    }
    return set;
  }, [sortedReports]);

  const filteredReports = useMemo(() => {
    if (filterTag === "ALL") return sortedReports;
    return sortedReports.filter((r) => r.periodType === filterTag);
  }, [sortedReports, filterTag]);

  const countsByType = useMemo(() => {
    const counts: Record<FilterTag, number> = {
      ALL: sortedReports.length,
      YTD: 0,
      Quarter: 0,
      MTD: 0,
    };
    for (const r of sortedReports) {
      counts[r.periodType] = (counts[r.periodType] ?? 0) + 1;
    }
    return counts;
  }, [sortedReports]);

  const displayedEntities = useMemo(
    () => store.entities.filter((e) => e.groupName !== "Sambu Group"),
    [store.entities],
  );

  const openAddReportModal = () => {
    const maxExistingMonth = Array.from(existingMtdMonthsSet).reduce((mx, m) => Math.max(mx, m), 0);
    const nextCandidate =
      (maxExistingMonth >= 1 && maxExistingMonth < 12 && !existingMtdMonthsSet.has(maxExistingMonth + 1)
        ? maxExistingMonth + 1
        : EXEC_MONTH_META_LIST.find((m) => !existingMtdMonthsSet.has(m.month))?.month) ?? 11;
    const mMeta = getExecMonthMeta(nextCandidate) ?? EXEC_MONTH_META_LIST[10];
    const latestMtd =
      [...sortedReports]
        .filter((r) => r.periodType === "MTD")
        .sort((a, b) => (b.monthTag ?? b.sortOrder) - (a.monthTag ?? a.sortOrder))[0] ?? sortedReports[0];
    setNewReportForm({
      title: `MTD Report (${mMeta.reportToken}'${cycleSuffix})`,
      shortLabel: `${mMeta.idShort}'${cycleSuffix}`,
      periodType: "MTD",
      sortOrder: mMeta.month,
      monthTag: mMeta.month,
      quarterTag: mMeta.quarter,
      totalLabel: "Total",
      cloneFromId: latestMtd?.id ?? "",
    });
    setShowAddReportModal(true);
  };

  const startEditReport = (block: ExecSummaryReportBlock) => {
    setEditingReportId(block.id);
    setDraftBlock(JSON.parse(JSON.stringify(block)));
  };

  const cancelEditReport = () => {
    setEditingReportId(null);
    setDraftBlock(null);
  };

  const handleDraftCellChange = (
    indId: string,
    entityId: string,
    field: "bobot" | "actual" | "ach" | "applicable",
    value: string | boolean,
  ) => {
    setDraftBlock((prev) => {
      if (!prev) return prev;
      const curCell = prev.cells?.[indId]?.[entityId] ?? {
        applicable: true,
        bobot: "",
        actual: "",
        ach: "",
      };
      let nextCell = { ...curCell };
      if (field === "applicable") {
        const app = Boolean(value);
        if (app) {
          const defB = curCell.bobot || "10%";
          const defA = curCell.actual || "0%";
          const bNum = parseExecPct(defB);
          const aNum = parseExecPct(defA);
          const calcAch =
            bNum !== null && bNum > 0 && aNum !== null
              ? formatExecPct(Math.round((aNum / bNum) * 1000) / 10, 1)
              : curCell.ach || "0%";
          nextCell = { applicable: true, bobot: defB, actual: defA, ach: calcAch };
        } else {
          nextCell = { applicable: false, bobot: "", actual: "", ach: "" };
        }
      } else {
        const strVal = String(value);
        nextCell[field] = strVal;
        if (field === "bobot" || field === "actual") {
          const bNum = parseExecPct(field === "bobot" ? strVal : nextCell.bobot);
          const aNum = parseExecPct(field === "actual" ? strVal : nextCell.actual);
          if (bNum !== null && bNum > 0 && aNum !== null) {
            nextCell.ach = formatExecPct(Math.round((aNum / bNum) * 1000) / 10, 1);
          }
        } else if (field === "ach") {
          const bNum = parseExecPct(nextCell.bobot);
          const achNum = parseExecPct(strVal);
          if (bNum !== null && bNum > 0 && achNum !== null) {
            nextCell.actual = formatExecPct(Math.round(((bNum * achNum) / 100) * 10) / 10, 1);
          }
        }
      }
      const nextCells = {
        ...prev.cells,
        [indId]: {
          ...(prev.cells?.[indId] ?? {}),
          [entityId]: nextCell,
        },
      };
      const nextTotals = {
        ...prev.totals,
        [entityId]: computeEntityTotalFromCells(
          nextCells,
          store.indicators,
          entityId,
          prev.totals?.[entityId],
        ),
      };
      return {
        ...prev,
        cells: nextCells,
        totals: nextTotals,
      };
    });
  };

  const handleDraftMonthTagChange = (nextMonth: number) => {
    const mMeta = getExecMonthMeta(nextMonth);
    if (!mMeta) return;
    setDraftBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        monthTag: mMeta.month,
        sortOrder: mMeta.month,
        shortLabel: `${mMeta.idShort}'${cycleSuffix}`,
        title: /^mtd report/i.test(prev.title)
          ? `MTD Report (${mMeta.reportToken}'${cycleSuffix})`
          : prev.title,
      };
    });
  };

  const saveEditedReport = () => {
    if (!draftBlock) return;
    if (draftBlock.periodType === "MTD") {
      const mTag = draftBlock.monthTag ?? inferMonthTagFromReport(draftBlock);
      if (mTag) {
        const dup = store.reports.find(
          (r) => r.id !== draftBlock.id && r.periodType === "MTD" && inferMonthTagFromReport(r) === mTag,
        );
        if (dup) {
          const mMeta = getExecMonthMeta(mTag);
          toast.error(
            `Tag Month ${mMeta?.fullName ?? mTag} sudah digunakan pada tabel "${dup.title}". Gunakan bulan lain agar tidak duplikat.`,
          );
          return;
        }
      }
    }
    const normalizePctSuffix = (v: string) => {
      const t = v.trim();
      if (!t) return "";
      return t.endsWith("%") ? t : /\d/.test(t) ? `${t}%` : t;
    };
    const cleanedCells: ExecSummaryReportBlock["cells"] = {};
    for (const ind of store.indicators) {
      cleanedCells[ind.id] = {};
      for (const ent of store.entities) {
        const rawC = draftBlock.cells?.[ind.id]?.[ent.id];
        if (!rawC || !rawC.applicable) {
          cleanedCells[ind.id][ent.id] = { applicable: false, bobot: "", actual: "", ach: "" };
        } else {
          const bNorm = normalizePctSuffix(rawC.bobot);
          const aNorm = normalizePctSuffix(rawC.actual);
          let achNorm = normalizePctSuffix(rawC.ach);
          const bNum = parseExecPct(bNorm);
          const aNum = parseExecPct(aNorm);
          if (!achNorm && bNum !== null && bNum > 0 && aNum !== null) {
            achNorm = formatExecPct(Math.round((aNum / bNum) * 1000) / 10, 1);
          }
          cleanedCells[ind.id][ent.id] = {
            applicable: true,
            bobot: bNorm,
            actual: aNorm,
            ach: achNorm,
          };
        }
      }
    }
    const cleanedTotals: ExecSummaryReportBlock["totals"] = {};
    for (const ent of store.entities) {
      const computedTot = computeEntityTotalFromCells(
        cleanedCells,
        store.indicators,
        ent.id,
        draftBlock.totals?.[ent.id],
      );
      cleanedTotals[ent.id] = {
        bobot: normalizePctSuffix(computedTot.bobot || "100%"),
        ach: normalizePctSuffix(computedTot.ach || "0%"),
      };
    }
    const prevReport = store.reports.find((r) => r.id === draftBlock.id);
    const resolvedMonthTag =
      draftBlock.periodType === "MTD"
        ? draftBlock.monthTag ?? inferMonthTagFromReport(draftBlock)
        : undefined;
    const resolvedQuarterTag =
      draftBlock.periodType === "Quarter"
        ? draftBlock.quarterTag ?? inferQuarterTagFromReport(draftBlock)
        : undefined;
    const finalBlock: ExecSummaryReportBlock = {
      ...draftBlock,
      monthTag: resolvedMonthTag,
      quarterTag: resolvedQuarterTag,
      sortOrder:
        draftBlock.periodType === "MTD" && resolvedMonthTag
          ? resolvedMonthTag
          : draftBlock.periodType === "Quarter" && resolvedQuarterTag
          ? resolvedQuarterTag
          : draftBlock.sortOrder,
      cells: cleanedCells,
      totals: cleanedTotals,
    };
    let nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: sortExecSummaryReports(
        store.reports.map((r) => (r.id === finalBlock.id ? finalBlock : r)),
      ),
    };
    if (finalBlock.periodType === "MTD" && resolvedMonthTag) {
      const targetQs = new Set<1 | 2 | 3 | 4>();
      const curMeta = getExecMonthMeta(resolvedMonthTag);
      if (curMeta) targetQs.add(curMeta.quarter);
      const prevM = prevReport ? inferMonthTagFromReport(prevReport) : undefined;
      const prevMeta = getExecMonthMeta(prevM);
      if (prevMeta) targetQs.add(prevMeta.quarter);
      nextStore = recalculateQuarterAndYtdFromMtd(nextStore, Array.from(targetQs));
    }
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Updated Executive Summary report: ${finalBlock.title}`);
    setEditingReportId(null);
    setDraftBlock(null);
    if (finalBlock.periodType === "MTD" && resolvedMonthTag) {
      const mMeta = getExecMonthMeta(resolvedMonthTag);
      toast.success(
        `Tabel "${finalBlock.title}" disimpan. Q${mMeta?.quarter ?? ""} Report & YTD Report telah dikalkulasi ulang otomatis.`,
      );
    } else {
      toast.success(`Tabel "${finalBlock.title}" berhasil disimpan & disinkronkan ke Analytics Dashboard.`);
    }
  };

  const confirmDeleteReport = () => {
    if (!deleteTargetReport) return;
    if (store.reports.length <= 1) {
      toast.warning("Minimal 1 tabel laporan Executive Summary harus tersedia.");
      setDeleteTargetReport(null);
      return;
    }
    const deletedMonth = inferMonthTagFromReport(deleteTargetReport);
    let nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: sortExecSummaryReports(
        store.reports.filter((r) => r.id !== deleteTargetReport.id),
      ),
    };
    if (deleteTargetReport.periodType === "MTD" && deletedMonth) {
      const mMeta = getExecMonthMeta(deletedMonth);
      nextStore = recalculateQuarterAndYtdFromMtd(
        nextStore,
        mMeta ? [mMeta.quarter] : undefined,
      );
    }
    if (editingReportId === deleteTargetReport.id) {
      cancelEditReport();
    }
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Deleted Executive Summary report: ${deleteTargetReport.title}`);
    toast.success(
      deleteTargetReport.periodType === "MTD" && deletedMonth
        ? `Tabel "${deleteTargetReport.title}" dihapus & akumulasi Quarter + YTD telah diperbarui.`
        : `Tabel "${deleteTargetReport.title}" dihapus.`,
    );
    setDeleteTargetReport(null);
  };

  const handleAddNewReport = () => {
    const title = newReportForm.title.trim();
    const shortLabel = newReportForm.shortLabel.trim();
    if (!title || !shortLabel) {
      toast.error("Judul laporan dan label singkat wajib diisi.");
      return;
    }
    if (newReportForm.periodType === "MTD") {
      const mMeta = getExecMonthMeta(newReportForm.monthTag);
      if (!mMeta) {
        toast.error("Pilih Tag Month (Januari–Desember) terlebih dahulu.");
        return;
      }
      const duplicate = sortedReports.find(
        (r) => r.periodType === "MTD" && inferMonthTagFromReport(r) === mMeta.month,
      );
      if (duplicate) {
        toast.error(
          `Tabel untuk Month ${mMeta.fullName} sudah ada ("${duplicate.title}"). Silakan edit tabel tersebut atau pilih bulan lain.`,
        );
        return;
      }
    }
    const template =
      store.reports.find((r) => r.id === newReportForm.cloneFromId) ?? store.reports[0];
    const clonedCells: ExecSummaryReportBlock["cells"] = JSON.parse(JSON.stringify(template.cells));
    const clonedTotals: ExecSummaryReportBlock["totals"] = {};
    for (const ent of store.entities) {
      clonedTotals[ent.id] = computeEntityTotalFromCells(
        clonedCells,
        store.indicators,
        ent.id,
        template.totals?.[ent.id],
      );
    }
    const isMtd = newReportForm.periodType === "MTD";
    const isQuarter = newReportForm.periodType === "Quarter";
    const mMeta = isMtd ? getExecMonthMeta(newReportForm.monthTag) : undefined;
    const created: ExecSummaryReportBlock = {
      id: isMtd && mMeta
        ? `mtd-${mMeta.enShort.toLowerCase()}-${cycleSuffix}-${Date.now().toString(36)}`
        : `rep-${newReportForm.periodType.toLowerCase()}-${Date.now()}`,
      title,
      shortLabel,
      periodType: newReportForm.periodType,
      sortOrder: isMtd && mMeta ? mMeta.month : isQuarter ? newReportForm.quarterTag : Number(newReportForm.sortOrder) || 1,
      monthTag: isMtd && mMeta ? mMeta.month : undefined,
      quarterTag: isQuarter ? newReportForm.quarterTag : undefined,
      totalLabel: newReportForm.totalLabel.trim() || "Total",
      cells: clonedCells,
      totals: clonedTotals,
    };
    let nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: sortExecSummaryReports([created, ...store.reports]),
    };
    if (isMtd && mMeta) {
      nextStore = recalculateQuarterAndYtdFromMtd(nextStore, [mMeta.quarter]);
    }
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Added Executive Summary report: ${created.title}`);
    setShowAddReportModal(false);
    setEditingReportId(created.id);
    setDraftBlock(JSON.parse(JSON.stringify(created)));
    toast.success(
      isMtd && mMeta
        ? `Laporan "${created.title}" (Month: ${mMeta.fullName}) ditambahkan & Q${mMeta.quarter} + YTD diperbarui otomatis. Silakan sesuaikan angka lalu klik Simpan Perubahan.`
        : `Laporan "${created.title}" ditambahkan. Silakan sesuaikan angka lalu klik Simpan Perubahan.`,
    );
  };

  const handleSyncActualData = async () => {
    setIsSyncingActual(true);
    try {
      const { nextStore, syncedCellsCount, syncedMonths } =
        await syncExecutiveSummaryFromActualBusinessKpi(store);
      setStore(nextStore);
      saveMasterExecutiveSummary(
        nextStore,
        `Synced Executive Summary from live Business KPI Tracking (${syncedCellsCount} cells across ${syncedMonths.length} months)`,
      );
      cancelEditReport();
      setShowSyncActualConfirm(false);
      if (syncedCellsCount > 0) {
        const monthNames = syncedMonths
          .map((m) => getExecMonthMeta(m)?.idShort)
          .filter(Boolean)
          .join(", ");
        toast.success(
          `Sync Data Aktual berhasil memperbarui ${syncedCellsCount} sel indikator pada bulan (${monthNames}) serta menghitung ulang Quarter & YTD otomatis.`,
        );
      } else {
        toast.info(
          "Sinkronisasi selesai: Belum ada pengisian transaksi Aktual KPI Business baru pada KPI Tracking sistem. Nilai tabel periode yang tersimpan tetap dipertahankan.",
        );
      }
    } catch {
      toast.error("Gagal menyinkronkan data aktual KPI Business dari sistem.");
    } finally {
      setIsSyncingActual(false);
    }
  };

  const FILTER_PILLS: Array<{ id: FilterTag; label: string; toneActive: string; toneIdle: string }> = [
    {
      id: "ALL",
      label: `Semua Laporan (${countsByType.ALL})`,
      toneActive: "bg-[#2F5597] text-white border-[#2F5597] shadow-xs",
      toneIdle: "bg-slate-100/90 text-slate-700 border-slate-200 hover:bg-slate-200/70",
    },
    {
      id: "YTD",
      label: `YTD (${countsByType.YTD})`,
      toneActive: "bg-[#248277] text-white border-[#248277] shadow-xs",
      toneIdle: "bg-[#E6F3F1] text-[#248277] border-[#B8DDD8] hover:bg-[#D5ECE8]",
    },
    {
      id: "Quarter",
      label: `Quarter (${countsByType.Quarter})`,
      toneActive: "bg-[#EA9942] text-white border-[#EA9942] shadow-xs",
      toneIdle: "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4] hover:bg-[#FAE6CE]",
    },
    {
      id: "MTD",
      label: `Month / MTD (${countsByType.MTD})`,
      toneActive: "bg-[#3B6EA8] text-white border-[#3B6EA8] shadow-xs",
      toneIdle: "bg-[#EBF2FA] text-[#3B6EA8] border-[#C9DCF0] hover:bg-[#DCE8F6]",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Control & Legend Banner */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F] text-xs font-bold">
                <BarChart3 className="w-3.5 h-3.5" />
                Sumber Data Infografis Executive Summary
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Tersinkron ke Appraisal Analytics → Executive Summary
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Tabel ringkasan pencapaian KPI Business (<strong>RSUP Group</strong> &amp; <strong>5 Unit Usaha</strong>) per periode laporan. Setiap pembaruan nilai pada halaman ini langsung memperbarui seluruh grafik di tab <strong>Executive Summary</strong> pada menu <strong>Appraisal Analytics</strong>.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && !previewMode && (
              <button
                type="button"
                onClick={openAddReportModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Periode Laporan
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPreviewMode((p) => !p);
                cancelEditReport();
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                previewMode
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {previewMode ? "Kembali ke Mode Kelola" : "Preview Mode"}
            </button>
            <button
              type="button"
              onClick={() => navigate(analyticsExecPath)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#2F5597]/30 bg-[#EBF2FA] text-[#1A284F] hover:bg-[#DCE8F6] transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#2F5597]" />
              Analytics Dashboard
              <ArrowUpRight className="w-3.5 h-3.5 text-[#2F5597]" />
            </button>
            {canEdit && !previewMode && (
              <button
                type="button"
                disabled
                title="Belum aktif — menunggu data aktual KPI Business terisi di dalam sistem"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed select-none"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync Data Aktual
              </button>
            )}
          </div>
        </div>

        {/* Filter Soft Tags + Pewarnaan ACH Legend */}
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTER_PILLS.map((pill) => {
              const active = filterTag === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFilterTag(pill.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    active ? pill.toneActive : pill.toneIdle
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Legenda Resmi PEWARNAAN ACH */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="font-bold text-slate-500 uppercase tracking-wider">Pewarnaan Achievement:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: "#2E8555" }}>
              95%–100%+ Hijau
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: "#EA9942" }}>
              ≥80% – &lt;95% Kuning
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: "#B84A4A" }}>
              &lt;80% Merah
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: "#475569" }}>
              N/A (Tidak Berlaku)
            </span>
          </div>
        </div>
      </div>

      {/* Stacked Report Tables matching PDF layout */}
      {filteredReports.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center space-y-2">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">
            Belum ada tabel laporan untuk kategori <strong>{filterTag}</strong>.
          </p>
          <p className="text-xs text-slate-400">
            Klik tombol &ldquo;Tambah Periode Laporan&rdquo; di kanan atas apabila ingin menambahkan tabel laporan {filterTag} baru.
          </p>
        </div>
      ) : (
        filteredReports.map((report, idx) => {
          const isEditingThis = editingReportId === report.id && draftBlock !== null;
          const activeBlock = isEditingThis && draftBlock ? draftBlock : report;
          const monthTagNum = inferMonthTagFromReport(activeBlock);
          const monthMeta = getExecMonthMeta(monthTagNum);
          const quarterTagNum = inferQuarterTagFromReport(activeBlock);
          const mtdsInThisQuarter =
            activeBlock.periodType === "Quarter" && quarterTagNum
              ? sortedReports
                  .filter(
                    (r) =>
                      r.periodType === "MTD" &&
                      getExecMonthMeta(inferMonthTagFromReport(r))?.quarter === quarterTagNum,
                  )
                  .map((r) => getExecMonthMeta(inferMonthTagFromReport(r))?.idShort)
                  .filter(Boolean)
              : [];
          const prevReportInList = idx > 0 ? filteredReports[idx - 1] : null;
          const showTypeGroupHeader =
            filterTag === "ALL" && (!prevReportInList || prevReportInList.periodType !== report.periodType);

          return (
            <React.Fragment key={report.id}>
              {showTypeGroupHeader && (
                <div className="flex items-center gap-2.5 pt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${
                      report.periodType === "YTD"
                        ? "bg-[#E6F3F1] text-[#1D6863] border-[#B8DDD8]"
                        : report.periodType === "Quarter"
                        ? "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4]"
                        : "bg-[#EBF2FA] text-[#2F5597] border-[#C9DCF0]"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    {report.periodType === "YTD"
                      ? "1. Kelompok Laporan Year-to-Date (YTD)"
                      : report.periodType === "Quarter"
                      ? "2. Kelompok Laporan Kuartal (Quarter Q1–Q4)"
                      : "3. Kelompok Laporan Bulanan (Month / MTD)"}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
              {/* Report Block Top Bar */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/90 border-b border-slate-200 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {isEditingThis ? (
                    <input
                      type="text"
                      value={activeBlock.title}
                      onChange={(e) =>
                        setDraftBlock((p) => (p ? { ...p, title: e.target.value } : p))
                      }
                      className="text-sm font-bold text-[#1A284F] border border-blue-300 rounded-lg px-2.5 py-1 bg-white outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <h3 className="text-sm font-bold text-[#1A284F]">{activeBlock.title}</h3>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      activeBlock.periodType === "YTD"
                        ? "bg-teal-50 text-teal-800 border-teal-200"
                        : activeBlock.periodType === "Quarter"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-sky-50 text-sky-800 border-sky-200"
                    }`}
                  >
                    {activeBlock.periodType === "MTD" ? "Month" : activeBlock.periodType} · {activeBlock.shortLabel}
                  </span>

                  {activeBlock.periodType === "MTD" && (
                    isEditingThis ? (
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F3F1] text-[#1D6863] border border-[#B8DDD8]">
                        <Tag className="w-3 h-3" />
                        <span>Month:</span>
                        <select
                          value={monthTagNum ?? 1}
                          onChange={(e) => handleDraftMonthTagChange(Number(e.target.value))}
                          className="bg-white border border-[#95CEC6] rounded px-1.5 py-0.5 text-[11px] font-bold text-[#1A284F] outline-none"
                        >
                          {EXEC_MONTH_META_LIST.map((m) => (
                            <option key={m.month} value={m.month}>
                              {m.code} · {m.fullName} (→ Q{m.quarter} &amp; YTD)
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span
                        title="Flagging Month pada tabel MTD untuk akumulasi otomatis ke Quarter Report & YTD Report"
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F3F1] text-[#1D6863] border border-[#B8DDD8]"
                      >
                        <Tag className="w-3 h-3" />
                        Month: {monthMeta ? `${monthMeta.fullName} (${monthMeta.code} → Q${monthMeta.quarter} & YTD)` : `M${activeBlock.sortOrder}`}
                      </span>
                    )
                  )}
                  {activeBlock.periodType === "Quarter" && quarterTagNum && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      {mtdsInThisQuarter.length > 0
                        ? `Auto-Sync dari Month: ${mtdsInThisQuarter.join(", ")}`
                        : `Quarter Q${quarterTagNum}`}
                    </span>
                  )}
                  {activeBlock.periodType === "YTD" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      Auto-Rollup dari Quarter &amp; Tag Month
                    </span>
                  )}
                </div>

                {canEdit && !previewMode && (
                  <div className="flex items-center gap-2">
                    {isEditingThis ? (
                      <>
                        <button
                          type="button"
                          onClick={cancelEditReport}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" /> Batal
                        </button>
                        <button
                          type="button"
                          onClick={saveEditedReport}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" /> Simpan Perubahan
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEditReport(report)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border border-[#1A284F]/25 bg-[#1A284F]/5 text-[#1A284F] hover:bg-[#1A284F]/10 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" /> Edit Nilai
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetReport(report)}
                          title="Hapus periode laporan ini"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#FF7864] hover:bg-[#FFF2EF] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Summary Table matching PDF structure */}
              <DualScrollTableContainer>
                <table className="w-full border-collapse text-xs" style={{ minWidth: 1380 }}>
                  <thead>
                    {/* Row 1: Report Title & Entity Merged Headers */}
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-3 py-2 text-center font-bold text-[#1A284F] min-w-[250px] sticky left-0 z-10 bg-slate-50">
                        {activeBlock.title}
                      </th>
                      {displayedEntities.map((ent) => (
                        <th
                          key={ent.id}
                          colSpan={3}
                          className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-900 whitespace-nowrap"
                          style={{
                            backgroundColor: ent.kind === "group" ? "#e2e8f0" : "#f8fafc",
                          }}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: ent.colorHex }}
                            />
                            {ent.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                    {/* Row 2: Sub-headers Indikator | Bobot | Actual | ACH */}
                    <tr className="bg-[#167267] text-white">
                      <th className="border border-[#125E55] px-3 py-2 text-center font-bold sticky left-0 z-10 bg-[#167267]">
                        Indikator
                      </th>
                      {displayedEntities.map((ent) => (
                        <React.Fragment key={`sub-${ent.id}`}>
                          <th className="border border-[#125E55] px-2 py-1.5 text-center font-bold w-[62px]">
                            Bobot
                          </th>
                          <th className="border border-[#125E55] px-2 py-1.5 text-center font-bold w-[62px]">
                            Actual
                          </th>
                          <th className="border border-[#125E55] px-2 py-1.5 text-center font-bold w-[92px]">
                            Achievement
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {store.indicators.map((ind, rIdx) => (
                      <tr key={ind.id} className={rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                        <td className="border border-slate-300 px-3 py-2 font-medium text-slate-800 sticky left-0 z-10 bg-inherit">
                          {ind.label}
                        </td>
                        {displayedEntities.map((ent) => {
                          const rawCell = activeBlock.cells?.[ind.id]?.[ent.id];
                          const cell = rawCell ?? {
                            applicable: ent.groupName === "Sambu Group",
                            bobot: "",
                            actual: "",
                            ach: "",
                          };
                          if (!cell.applicable) {
                            return (
                              <td
                                key={`${ind.id}-${ent.id}-na`}
                                colSpan={3}
                                className="border border-[#2B2B2B] bg-[#3E3E3E] text-center py-1.5 px-1"
                              >
                                {isEditingThis ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDraftCellChange(ind.id, ent.id, "applicable", true)
                                    }
                                    className="text-[10px] font-semibold text-slate-300 hover:text-white underline cursor-pointer"
                                  >
                                    N/A (Klik untuk Aktifkan)
                                  </button>
                                ) : null}
                              </td>
                            );
                          }
                          const band = classifyAchBand(cell.ach, true);
                          const bandMeta = ACH_CELL_STYLE[band];
                          return (
                            <React.Fragment key={`${ind.id}-${ent.id}`}>
                              <td className="border border-slate-300 px-1.5 py-1.5 text-center text-slate-700 tabular-nums">
                                {isEditingThis ? (
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="text"
                                      value={cell.bobot}
                                      onChange={(e) =>
                                        handleDraftCellChange(ind.id, ent.id, "bobot", e.target.value)
                                      }
                                      className="w-full text-center text-[11px] border border-slate-300 rounded px-1 py-0.5 bg-white focus:border-blue-500 outline-none"
                                    />
                                  </div>
                                ) : (
                                  cell.bobot
                                )}
                              </td>
                              <td className="border border-slate-300 px-1.5 py-1.5 text-center text-slate-800 font-medium tabular-nums">
                                {isEditingThis ? (
                                  <input
                                    type="text"
                                    value={cell.actual}
                                    onChange={(e) =>
                                      handleDraftCellChange(ind.id, ent.id, "actual", e.target.value)
                                    }
                                    className="w-full text-center text-[11px] border border-slate-300 rounded px-1 py-0.5 bg-white focus:border-blue-500 outline-none"
                                  />
                                ) : (
                                  cell.actual
                                )}
                              </td>
                              <td
                                className="border border-slate-300 px-1.5 py-1.5 text-center font-bold tabular-nums relative group"
                                style={{ backgroundColor: bandMeta.bg, color: bandMeta.text }}
                                title={`${bandMeta.label} · Formula: Actual (${cell.actual || "0%"}) ÷ Bobot (${cell.bobot || "0%"})`}
                              >
                                {isEditingThis ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <div className="flex items-center gap-0.5 w-full">
                                      <input
                                        type="text"
                                        value={cell.ach}
                                        onChange={(e) =>
                                          handleDraftCellChange(ind.id, ent.id, "ach", e.target.value)
                                        }
                                        className="w-full text-center text-[11px] font-bold border border-black/20 rounded px-1 py-0.5 bg-white/90 text-slate-900 outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDraftCellChange(ind.id, ent.id, "applicable", false)
                                        }
                                        title="Set N/A (Blok Hitam)"
                                        className="text-[9px] px-1 py-0.5 rounded bg-slate-900/80 text-white hover:bg-slate-900 shrink-0 cursor-pointer"
                                      >
                                        N/A
                                      </button>
                                    </div>
                                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0 rounded-full bg-black/20 text-white">
                                      {bandMeta.shortTag}
                                    </span>
                                  </div>
                                ) : (
                                  cell.ach
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Total Row */}
                    <tr className="font-bold">
                      <td className="border border-[#125E55] bg-[#167267] text-white px-3 py-2 text-center sticky left-0 z-10">
                        {activeBlock.totalLabel || "Total"}
                      </td>
                      {displayedEntities.map((ent) => {
                        const tot = isEditingThis
                          ? computeEntityTotalFromCells(
                              activeBlock.cells,
                              store.indicators,
                              ent.id,
                              activeBlock.totals?.[ent.id],
                            )
                          : activeBlock.totals?.[ent.id] ??
                            computeEntityTotalFromCells(activeBlock.cells, store.indicators, ent.id);
                        const totBand = classifyAchBand(tot.ach, true, isEditingThis ? undefined : tot.bandOverride);
                        const totStyle = ACH_CELL_STYLE[totBand];
                        const bobotNum = parseExecPct(tot.bobot);
                        const bobotOff100 = bobotNum !== null && Math.abs(bobotNum - 100) > 1.05;
                        return (
                          <React.Fragment key={`tot-${ent.id}`}>
                            <td
                              className={`border border-[#125E55] px-2 py-2 text-center tabular-nums ${
                                bobotOff100 ? "bg-[#C07A28] text-white" : "bg-[#167267] text-white"
                              }`}
                              title={
                                bobotOff100
                                  ? `Total Bobot saat ini ${tot.bobot} (ideal 100%)`
                                  : "Total Bobot = Σ Bobot indikator aktif"
                              }
                            >
                              {tot.bobot || "100%"}
                            </td>
                            <td
                              colSpan={2}
                              className="border border-slate-400 px-2 py-2 text-center font-extrabold tabular-nums text-xs"
                              style={{ backgroundColor: totStyle.bg, color: totStyle.text }}
                              title={`${totStyle.label} · Total Achievement dihitung otomatis dari Σ Actual ÷ Σ Bobot`}
                            >
                              {isEditingThis ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span>{tot.ach || "0%"}</span>
                                  <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/20 text-white">
                                    {totStyle.shortTag}
                                  </span>
                                </div>
                              ) : (
                                tot.ach || "—"
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </DualScrollTableContainer>
            </div>
            </React.Fragment>
          );
        })
      )}

      {/* Modal: + Tambah Periode Laporan */}
      {showAddReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setShowAddReportModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] text-white">
              <div>
                <h3 className="text-sm font-bold">Tambah Periode Laporan Executive Summary</h3>
                <p className="text-[11px] text-white/75 mt-0.5">
                  Tambahkan tabel Month (MTD) ber-tag bulan otomatis atau periode Quarter / YTD
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddReportModal(false)}
                className="p-1 rounded-lg text-white/75 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori Periode</label>
                  <select
                    value={newReportForm.periodType}
                    onChange={(e) => {
                      const p = e.target.value as ExecSummaryPeriodType;
                      const mMeta = getExecMonthMeta(newReportForm.monthTag) ?? EXEC_MONTH_META_LIST[10];
                      const qMeta = EXEC_QUARTER_META[newReportForm.quarterTag];
                      setNewReportForm((prev) => ({
                        ...prev,
                        periodType: p,
                        title:
                          p === "YTD"
                            ? `YTD Report (Jan-${mMeta.enShort}'${cycleSuffix})`
                            : p === "Quarter"
                            ? `Q${qMeta.quarter} Report (${qMeta.rangeEn}'${cycleSuffix})`
                            : `MTD Report (${mMeta.reportToken}'${cycleSuffix})`,
                        shortLabel:
                          p === "YTD"
                            ? `YTD (Jan–${mMeta.idShort}'${cycleSuffix})`
                            : p === "Quarter"
                            ? `Q${qMeta.quarter}'${cycleSuffix}`
                            : `${mMeta.idShort}'${cycleSuffix}`,
                        sortOrder: p === "MTD" ? mMeta.month : p === "Quarter" ? qMeta.quarter : mMeta.month,
                        totalLabel: p === "Quarter" ? qMeta.totalLabel : "Total",
                      }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                  >
                    <option value="MTD">Month / MTD (Laporan Bulanan)</option>
                    <option value="Quarter">Quarter (Q1–Q4)</option>
                    <option value="YTD">Year-to-Date (YTD)</option>
                  </select>
                </div>
                <div>
                  {newReportForm.periodType === "Quarter" ? (
                    <>
                      <label className="block font-semibold text-slate-700 mb-1">Pilih Kuartal (Q1–Q4)</label>
                      <select
                        value={newReportForm.quarterTag}
                        onChange={(e) => {
                          const q = Number(e.target.value) as 1 | 2 | 3 | 4;
                          const qMeta = EXEC_QUARTER_META[q];
                          setNewReportForm((prev) => ({
                            ...prev,
                            quarterTag: q,
                            sortOrder: q,
                            title: `Q${q} Report (${qMeta.rangeEn}'${cycleSuffix})`,
                            shortLabel: `Q${q}'${cycleSuffix}`,
                            totalLabel: qMeta.totalLabel,
                          }));
                        }}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                      >
                        {([1, 2, 3, 4] as Array<1 | 2 | 3 | 4>).map((q) => (
                          <option key={q} value={q}>
                            Q{q} ({EXEC_QUARTER_META[q].rangeEn}&apos;{cycleSuffix})
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="block font-semibold text-slate-700 mb-1">Salin Struktur Bobot Dari</label>
                      <select
                        value={newReportForm.cloneFromId}
                        onChange={(e) => setNewReportForm((p) => ({ ...p, cloneFromId: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                      >
                        {sortedReports.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </div>

              {newReportForm.periodType === "MTD" && (
                <div className="rounded-xl border border-[#B8DDD8] bg-[#F4FAF9] p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 font-bold text-[#1D6863]">
                      <Tag className="w-3.5 h-3.5" />
                      Tag Month (Penanda Bulan KPI) <span className="text-rose-500">*</span>
                    </label>
                    {(() => {
                      const selMeta = getExecMonthMeta(newReportForm.monthTag);
                      return selMeta ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#248277] text-white">
                          {selMeta.code} · {selMeta.fullName} → Auto-Update Q{selMeta.quarter} &amp; YTD
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Pilih bulan laporan agar sistem mengenali tabel ini sebagai data KPI bulan terkait dan mengalkulasi ulang <strong>Quarter Report</strong> serta <strong>YTD Report</strong> secara otomatis.
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {EXEC_MONTH_META_LIST.map((m) => {
                      const isSelected = newReportForm.monthTag === m.month;
                      const alreadyExists = existingMtdMonthsSet.has(m.month);
                      return (
                        <button
                          key={m.month}
                          type="button"
                          onClick={() => {
                            setNewReportForm((prev) => ({
                              ...prev,
                              monthTag: m.month,
                              sortOrder: m.month,
                              quarterTag: m.quarter,
                              title: `MTD Report (${m.reportToken}'${cycleSuffix})`,
                              shortLabel: `${m.idShort}'${cycleSuffix}`,
                            }));
                          }}
                          className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#1A284F] text-white border-[#1A284F] shadow-xs"
                              : alreadyExists
                              ? "bg-slate-100 text-slate-400 border-slate-200 hover:border-slate-300"
                              : "bg-white text-slate-700 border-slate-200 hover:border-[#248277] hover:bg-[#E6F3F1]/60"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold">{m.idShort}</span>
                            <span className={`text-[9px] font-semibold ${isSelected ? "text-teal-200" : "text-slate-400"}`}>
                              Q{m.quarter}
                            </span>
                          </div>
                          <div className={`text-[9px] mt-0.5 ${isSelected ? "text-white/80" : alreadyExists ? "text-amber-600 font-semibold" : "text-emerald-700"}`}>
                            {alreadyExists ? "Sudah Ada" : "Tersedia"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Judul Tabel Laporan</label>
                <input
                  type="text"
                  value={newReportForm.title}
                  onChange={(e) => setNewReportForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Contoh: MTD Report (Nov'26)"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Label Singkat Grafik</label>
                  <input
                    type="text"
                    value={newReportForm.shortLabel}
                    onChange={(e) => setNewReportForm((p) => ({ ...p, shortLabel: e.target.value }))}
                    placeholder="Contoh: Nov'26"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                  />
                </div>
                <div>
                  {newReportForm.periodType === "Quarter" ? (
                    <>
                      <label className="block font-semibold text-slate-700 mb-1">Salin Struktur Bobot Dari</label>
                      <select
                        value={newReportForm.cloneFromId}
                        onChange={(e) => setNewReportForm((p) => ({ ...p, cloneFromId: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                      >
                        {sortedReports.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="block font-semibold text-slate-700 mb-1">Label Baris Total</label>
                      <input
                        type="text"
                        value={newReportForm.totalLabel}
                        onChange={(e) => setNewReportForm((p) => ({ ...p, totalLabel: e.target.value }))}
                        placeholder="Total"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3.5 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddReportModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddNewReport}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] cursor-pointer"
              >
                Tambahkan Tabel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 2: Modal Konfirmasi Hapus Tabel */}
      {deleteTargetReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setDeleteTargetReport(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#1A284F]">Hapus Tabel Laporan?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Anda yakin ingin menghapus tabel <strong>{deleteTargetReport.title}</strong>?
                </p>
                {deleteTargetReport.periodType === "MTD" && inferMonthTagFromReport(deleteTargetReport) && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5 leading-relaxed">
                    Tabel ini memiliki penanda <strong>Month: {getExecMonthMeta(inferMonthTagFromReport(deleteTargetReport))?.fullName}</strong>. Setelah dihapus, sistem akan otomatis menghitung ulang <strong>Quarter Report</strong> dan <strong>YTD Report</strong> dari bulan yang tersisa.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetReport(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteReport}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#B84A4A] text-white hover:opacity-90 cursor-pointer"
              >
                Ya, Hapus Tabel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Point 3: Modal Konfirmasi Sync Data Aktual */}
      {showSyncActualConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => !isSyncingActual && setShowSyncActualConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#E6F3F1] border border-[#B8DDD8] flex items-center justify-center shrink-0">
                <RefreshCw className={`w-5 h-5 text-[#248277] ${isSyncingActual ? "animate-spin" : ""}`} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#1A284F]">Sync Data Aktual KPI Business?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Sistem akan menarik data <strong>KPI Business (KPI Group &amp; KPI Unit)</strong> yang telah terisi secara aktual pada modul <strong>KPI Setting &amp; KPI Tracking</strong> di database untuk memperbarui nilai <strong>Bobot, Actual, Achievement, dan Total</strong> pada tabel <strong>Month (MTD)</strong>, lalu menghitung ulang <strong>Quarter Report</strong> dan <strong>YTD Report</strong> secara otomatis.
                </p>
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 leading-relaxed">
                  Catatan: Bagi entitas atau bulan yang belum memiliki pengisian nilai aktual di sistem, data tabel periode yang sudah ada tetap dipertahankan.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSyncingActual}
                onClick={() => setShowSyncActualConfirm(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSyncingActual}
                onClick={() => void handleSyncActualData()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#248277] text-white hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingActual ? "animate-spin" : ""}`} />
                {isSyncingActual ? "Menyinkronkan..." : "Sync Data Aktual Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
