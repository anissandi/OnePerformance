import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Edit3,
  Eye,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DualScrollTableContainer } from "../../../components/DualScrollTableContainer";
import ExportImportButton from "../../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../../utils/excelUtils";
import {
  INITIAL_EXEC_SUMMARY_STORE,
  MASTER_EXEC_SUMMARY_UPDATED_EVENT,
  classifyAchBand,
  formatExecPct,
  loadMasterExecutiveSummary,
  parseExecPct,
  refreshMasterExecutiveSummaryFromBackend,
  saveMasterExecutiveSummary,
  type AchColorBand,
  type ExecSummaryPeriodType,
  type ExecSummaryReportBlock,
  type MasterExecutiveSummaryStore,
} from "./masterExecutiveSummaryStore";

const ACH_CELL_STYLE: Record<AchColorBand, { bg: string; text: string; border: string; label: string }> = {
  green:  { bg: "#2E8555", text: "#FFFFFF", border: "#256D46", label: "HIJAU (95%–100%+)" },
  yellow: { bg: "#EA9942", text: "#FFFFFF", border: "#D4842E", label: "KUNING (≥80% – <95%)" },
  red:    { bg: "#B84A4A", text: "#FFFFFF", border: "#9B3B3B", label: "MERAH (<80%)" },
  na:     { bg: "#475569", text: "#E2E8F0", border: "#334155", label: "N/A" },
};

type FilterTag = "ALL" | "YTD" | "Quarter" | "MTD";

export function MasterExecutiveSummaryTab({ canEdit = true }: { canEdit?: boolean }) {
  const [store, setStore] = useState<MasterExecutiveSummaryStore>(() => loadMasterExecutiveSummary());
  const [filterTag, setFilterTag] = useState<FilterTag>("ALL");
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [draftBlock, setDraftBlock] = useState<ExecSummaryReportBlock | null>(null);
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Form state untuk + Tambah Laporan Periode
  const [newReportForm, setNewReportForm] = useState<{
    title: string;
    shortLabel: string;
    periodType: ExecSummaryPeriodType;
    sortOrder: number;
    totalLabel: string;
    cloneFromId: string;
  }>({
    title: "MTD Report (Nov'26)",
    shortLabel: "Nov'26",
    periodType: "MTD",
    sortOrder: 11,
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

  const filteredReports = useMemo(() => {
    if (filterTag === "ALL") return store.reports;
    return store.reports.filter((r) => r.periodType === filterTag);
  }, [store.reports, filterTag]);

  const countsByType = useMemo(() => {
    const counts: Record<FilterTag, number> = {
      ALL: store.reports.length,
      YTD: 0,
      Quarter: 0,
      MTD: 0,
    };
    for (const r of store.reports) {
      counts[r.periodType] = (counts[r.periodType] ?? 0) + 1;
    }
    return counts;
  }, [store.reports]);

  const displayedEntities = useMemo(
    () => store.entities.filter((e) => e.groupName !== "Sambu Group"),
    [store.entities],
  );

  const startEditReport = (block: ExecSummaryReportBlock) => {
    setEditingReportId(block.id);
    setDraftBlock(JSON.parse(JSON.stringify(block)));
  };

  const cancelEditReport = () => {
    setEditingReportId(null);
    setDraftBlock(null);
  };

  const recomputeEntityTotalFromCells = (
    cellsMap: ExecSummaryReportBlock["cells"],
    entityId: string,
    prevTotal?: ExecSummaryReportBlock["totals"][string],
  ) => {
    let bobotSum = 0;
    let actualSum = 0;
    let hasAny = false;
    for (const ind of store.indicators) {
      const cell = cellsMap?.[ind.id]?.[entityId];
      if (!cell || !cell.applicable) continue;
      const b = parseExecPct(cell.bobot);
      const a = parseExecPct(cell.actual);
      if (b !== null) bobotSum += b;
      if (a !== null) {
        actualSum += a;
        hasAny = true;
      }
    }
    return {
      bobot: bobotSum > 0 ? "100%" : (prevTotal?.bobot || "100%"),
      ach: hasAny ? formatExecPct(Math.round(actualSum), 0) : (prevTotal?.ach || "0%"),
    };
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
        nextCell = app
          ? { applicable: true, bobot: curCell.bobot || "10%", actual: curCell.actual || "0%", ach: curCell.ach || "0%" }
          : { applicable: false, bobot: "", actual: "", ach: "" };
      } else {
        const strVal = String(value);
        nextCell[field] = strVal;
        // Auto-hitung ACH bila Bobot atau Actual diubah
        if (field === "bobot" || field === "actual") {
          const bNum = parseExecPct(field === "bobot" ? strVal : nextCell.bobot);
          const aNum = parseExecPct(field === "actual" ? strVal : nextCell.actual);
          if (bNum !== null && bNum > 0 && aNum !== null) {
            nextCell.ach = formatExecPct(Math.round((aNum / bNum) * 1000) / 10, 1);
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
        [entityId]: recomputeEntityTotalFromCells(nextCells, entityId, prev.totals?.[entityId]),
      };
      return {
        ...prev,
        cells: nextCells,
        totals: nextTotals,
      };
    });
  };

  const handleDraftTotalAchChange = (entityId: string, achVal: string) => {
    setDraftBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        totals: {
          ...prev.totals,
          [entityId]: {
            bobot: prev.totals?.[entityId]?.bobot || "100%",
            ach: achVal,
          },
        },
      };
    });
  };

  const saveEditedReport = () => {
    if (!draftBlock) return;
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
          cleanedCells[ind.id][ent.id] = {
            applicable: true,
            bobot: normalizePctSuffix(rawC.bobot),
            actual: normalizePctSuffix(rawC.actual),
            ach: normalizePctSuffix(rawC.ach),
          };
        }
      }
    }
    const cleanedTotals: ExecSummaryReportBlock["totals"] = {};
    for (const ent of store.entities) {
      const rawT = draftBlock.totals?.[ent.id];
      cleanedTotals[ent.id] = {
        bobot: normalizePctSuffix(rawT?.bobot || "100%"),
        ach: normalizePctSuffix(rawT?.ach || "0%"),
      };
    }
    const finalBlock: ExecSummaryReportBlock = {
      ...draftBlock,
      cells: cleanedCells,
      totals: cleanedTotals,
    };
    const nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: store.reports.map((r) => (r.id === finalBlock.id ? finalBlock : r)),
    };
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Updated Executive Summary report: ${finalBlock.title}`);
    setEditingReportId(null);
    setDraftBlock(null);
    toast.success(`Tabel "${finalBlock.title}" berhasil disimpan & disinkronkan ke Dashboard Infografis.`);
  };

  const handleDeleteReport = (report: ExecSummaryReportBlock) => {
    if (store.reports.length <= 1) {
      toast.warning("Minimal 1 tabel laporan Executive Summary harus tersedia.");
      return;
    }
    const nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: store.reports.filter((r) => r.id !== report.id),
    };
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Deleted Executive Summary report: ${report.title}`);
    toast.success(`Tabel "${report.title}" dihapus.`);
  };

  const handleAddNewReport = () => {
    const title = newReportForm.title.trim();
    const shortLabel = newReportForm.shortLabel.trim();
    if (!title || !shortLabel) {
      toast.error("Judul laporan dan label singkat wajib diisi.");
      return;
    }
    const template =
      store.reports.find((r) => r.id === newReportForm.cloneFromId) ?? store.reports[0];
    const clonedCells: ExecSummaryReportBlock["cells"] = JSON.parse(JSON.stringify(template.cells));
    const clonedTotals: ExecSummaryReportBlock["totals"] = JSON.parse(JSON.stringify(template.totals));
    const created: ExecSummaryReportBlock = {
      id: `rep-${newReportForm.periodType.toLowerCase()}-${Date.now()}`,
      title,
      shortLabel,
      periodType: newReportForm.periodType,
      sortOrder: Number(newReportForm.sortOrder) || 1,
      totalLabel: newReportForm.totalLabel.trim() || "Total",
      cells: clonedCells,
      totals: clonedTotals,
    };
    const nextStore: MasterExecutiveSummaryStore = {
      ...store,
      reports: [created, ...store.reports],
    };
    setStore(nextStore);
    saveMasterExecutiveSummary(nextStore, `Added Executive Summary report: ${created.title}`);
    setShowAddReportModal(false);
    setEditingReportId(created.id);
    setDraftBlock(JSON.parse(JSON.stringify(created)));
    toast.success(`Laporan "${created.title}" ditambahkan. Silakan sesuaikan angka lalu klik Simpan.`);
  };

  const handleExportExcel = () => {
    const headers = [
      "Report ID",
      "Judul Laporan",
      "Kategori Periode",
      "Label Singkat",
      "Urutan",
      "Indikator",
      ...store.entities.flatMap((e) => [`${e.name} - Bobot`, `${e.name} - Actual`, `${e.name} - ACH`]),
    ];
    const rows: string[][] = [];
    for (const rep of store.reports) {
      for (const ind of store.indicators) {
        rows.push([
          rep.id,
          rep.title,
          rep.periodType,
          rep.shortLabel,
          String(rep.sortOrder),
          ind.label,
          ...store.entities.flatMap((ent) => {
            const cell = rep.cells?.[ind.id]?.[ent.id];
            if (!cell || !cell.applicable) return ["N/A", "N/A", "N/A"];
            return [cell.bobot, cell.actual, cell.ach];
          }),
        ]);
      }
      rows.push([
        rep.id,
        rep.title,
        rep.periodType,
        rep.shortLabel,
        String(rep.sortOrder),
        rep.totalLabel || "Total",
        ...store.entities.flatMap((ent) => [
          rep.totals?.[ent.id]?.bobot || "100%",
          "",
          rep.totals?.[ent.id]?.ach || "0%",
        ]),
      ]);
    }
    exportXLSX(`Master_Executive_Summary_${store.cycleYear}.xlsx`, headers, rows);
    toast.success("Data Executive Summary berhasil di-export ke Excel.");
  };

  const handleImportExcel = async (file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      const findCol = (pat: RegExp) => headers.findIndex((h) => pat.test(String(h ?? "").trim()));
      const titleCol = findCol(/judul laporan|report title|laporan/i);
      const typeCol = findCol(/kategori periode|period type/i);
      const shortCol = findCol(/label singkat|short label/i);
      const sortCol = findCol(/urutan|sort/i);
      const indCol = findCol(/^indikator$/i);
      if (titleCol < 0 || indCol < 0) {
        toast.error("Format kolom Excel tidak sesuai. Gunakan hasil Export Excel dari halaman ini sebagai template.");
        return;
      }

      const entCols = store.entities.map((ent) => {
        const esc = ent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return {
          entId: ent.id,
          bobotIdx: findCol(new RegExp(`${esc}\\s*-\\s*bobot`, "i")),
          actualIdx: findCol(new RegExp(`${esc}\\s*-\\s*actual`, "i")),
          achIdx: findCol(new RegExp(`${esc}\\s*-\\s*ach`, "i")),
        };
      });

      const reportMap = new Map<string, ExecSummaryReportBlock>();
      for (const r of rows) {
        const title = String(r[titleCol] ?? "").trim();
        const indName = String(r[indCol] ?? "").trim();
        if (!title || !indName) continue;
        const pTypeRaw = String(typeCol >= 0 ? r[typeCol] ?? "MTD" : "MTD").trim();
        const pType: ExecSummaryPeriodType =
          pTypeRaw === "YTD" || pTypeRaw === "Quarter" ? pTypeRaw : "MTD";
        const shortLbl = String(shortCol >= 0 ? r[shortCol] ?? title : title).trim();
        const sortOrd = Number(sortCol >= 0 ? r[sortCol] : 1) || 1;

        let block = reportMap.get(title);
        if (!block) {
          const existing = store.reports.find((x) => x.title.toLowerCase() === title.toLowerCase());
          block = {
            id: existing?.id ?? `imp-${Date.now()}-${reportMap.size}`,
            title,
            shortLabel: shortLbl,
            periodType: pType,
            sortOrder: sortOrd,
            totalLabel: existing?.totalLabel ?? "Total",
            cells: {},
            totals: {},
          };
          reportMap.set(title, block);
        }

        const isTotalRow = /^total/i.test(indName);
        if (isTotalRow) {
          block.totalLabel = indName;
          for (const ec of entCols) {
            const bVal = ec.bobotIdx >= 0 ? String(r[ec.bobotIdx] ?? "100%").trim() : "100%";
            const achVal = ec.achIdx >= 0 ? String(r[ec.achIdx] ?? "0%").trim() : "0%";
            block.totals[ec.entId] = { bobot: bVal || "100%", ach: achVal || "0%" };
          }
        } else {
          const matchedInd = store.indicators.find(
            (i) => i.label.toLowerCase() === indName.toLowerCase() || i.shortLabel.toLowerCase() === indName.toLowerCase(),
          );
          if (!matchedInd) continue;
          if (!block.cells[matchedInd.id]) block.cells[matchedInd.id] = {};
          for (const ec of entCols) {
            const bVal = ec.bobotIdx >= 0 ? String(r[ec.bobotIdx] ?? "").trim() : "";
            const actVal = ec.actualIdx >= 0 ? String(r[ec.actualIdx] ?? "").trim() : "";
            const achVal = ec.achIdx >= 0 ? String(r[ec.achIdx] ?? "").trim() : "";
            if (!bVal || /^n\/?a$/i.test(bVal)) {
              block.cells[matchedInd.id][ec.entId] = { applicable: false, bobot: "", actual: "", ach: "" };
            } else {
              block.cells[matchedInd.id][ec.entId] = {
                applicable: true,
                bobot: bVal,
                actual: actVal,
                ach: achVal,
              };
            }
          }
        }
      }

      const importedReports = Array.from(reportMap.values());
      if (importedReports.length === 0) {
        toast.error("Tidak ada baris laporan valid yang ditemukan pada file Excel.");
        return;
      }
      const nextStore: MasterExecutiveSummaryStore = {
        ...store,
        reports: importedReports,
      };
      setStore(nextStore);
      saveMasterExecutiveSummary(nextStore, `Imported ${importedReports.length} Executive Summary reports from Excel`);
      toast.success(`Berhasil meng-upload ${importedReports.length} tabel laporan Executive Summary.`);
    } catch {
      toast.error("Gagal membaca file Excel Executive Summary.");
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
      label: `Quarter Q1–Q4 (${countsByType.Quarter})`,
      toneActive: "bg-[#EA9942] text-white border-[#EA9942] shadow-xs",
      toneIdle: "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4] hover:bg-[#FAE6CE]",
    },
    {
      id: "MTD",
      label: `Perbulan / MTD (${countsByType.MTD})`,
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
                onClick={() => setShowAddReportModal(true)}
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
            <ExportImportButton
              onExport={handleExportExcel}
              onImport={canEdit ? handleImportExcel : undefined}
              size="sm"
            />
            {canEdit && !previewMode && (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                title="Kembalikan ke data baseline dokumen Executive Summary_24112026"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Baseline
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
        filteredReports.map((report) => {
          const isEditingThis = editingReportId === report.id && draftBlock !== null;
          const activeBlock = isEditingThis && draftBlock ? draftBlock : report;

          return (
            <div
              key={report.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden"
            >
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
                    {activeBlock.periodType} · {activeBlock.shortLabel}
                  </span>
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
                          onClick={() => handleDeleteReport(report)}
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
                              >
                                {isEditingThis ? (
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="text"
                                      value={cell.ach}
                                      onChange={(e) =>
                                        handleDraftCellChange(ind.id, ent.id, "ach", e.target.value)
                                      }
                                      className="w-full text-center text-[11px] font-bold border border-black/20 rounded px-1 py-0.5 bg-white/85 text-slate-900 outline-none"
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
                        const tot = activeBlock.totals?.[ent.id] ?? { bobot: ent.groupName === "Sambu Group" ? "—" : "100%", ach: "" };
                        const totBand = classifyAchBand(tot.ach, true, tot.bandOverride);
                        const totStyle = ACH_CELL_STYLE[totBand];
                        return (
                          <React.Fragment key={`tot-${ent.id}`}>
                            <td className="border border-[#125E55] bg-[#167267] text-white px-2 py-2 text-center tabular-nums">
                              {tot.bobot || "100%"}
                            </td>
                            <td
                              colSpan={2}
                              className="border border-slate-400 px-2 py-2 text-center font-extrabold tabular-nums text-xs"
                              style={{ backgroundColor: totStyle.bg, color: totStyle.text }}
                            >
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  value={tot.ach}
                                  onChange={(e) => handleDraftTotalAchChange(ent.id, e.target.value)}
                                  className="w-20 text-center text-xs font-extrabold border border-black/20 rounded px-1.5 py-0.5 bg-white/90 text-slate-900 outline-none"
                                />
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
          );
        })
      )}

      {/* Modal: + Tambah Periode Laporan */}
      {showAddReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setShowAddReportModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] text-white">
              <div>
                <h3 className="text-sm font-bold">Tambah Periode Laporan Executive Summary</h3>
                <p className="text-[11px] text-white/75 mt-0.5">
                  Tambahkan blok laporan Bulanan (MTD), Quarter (Q1–Q4), atau Year-to-Date (YTD)
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
                      setNewReportForm((prev) => ({
                        ...prev,
                        periodType: p,
                        title:
                          p === "YTD"
                            ? "YTD Report (Jan-Nov'26)"
                            : p === "Quarter"
                            ? "Q4 Report (Oct-Dec'26)"
                            : "MTD Report (Nov'26)",
                        shortLabel:
                          p === "YTD" ? "YTD (Jan–Nov'26)" : p === "Quarter" ? "Q4'26" : "Nov'26",
                        sortOrder: p === "MTD" ? 11 : 4,
                      }));
                    }}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                  >
                    <option value="MTD">Perbulan (MTD)</option>
                    <option value="Quarter">Quarter (Q1–Q4)</option>
                    <option value="YTD">Year-to-Date (YTD)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Urutan Kronologis</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={newReportForm.sortOrder}
                    onChange={(e) =>
                      setNewReportForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 1 }))
                    }
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                  />
                </div>
              </div>
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
                  <label className="block font-semibold text-slate-700 mb-1">Salin Struktur Bobot Dari</label>
                  <select
                    value={newReportForm.cloneFromId}
                    onChange={(e) => setNewReportForm((p) => ({ ...p, cloneFromId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                  >
                    {store.reports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3.5 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddReportModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleAddNewReport}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b]"
              >
                Tambahkan Tabel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Baseline */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setShowResetConfirm(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#1A284F]">Reset ke Baseline Executive Summary?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Seluruh tabel pada tab Executive Summary akan dikembalikan ke 11 tabel resmi baseline dokumen <strong>Executive Summary 2026</strong> (YTD Jan–Okt&apos;26, Q1–Q4, dan MTD Mei–Okt&apos;26).
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const fresh = JSON.parse(JSON.stringify(INITIAL_EXEC_SUMMARY_STORE)) as MasterExecutiveSummaryStore;
                  setStore(fresh);
                  saveMasterExecutiveSummary(fresh, "Reset Executive Summary to official 2026 baseline");
                  setShowResetConfirm(false);
                  cancelEditReport();
                  toast.success("Data Executive Summary dikembalikan ke baseline resmi.");
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#FF7864] text-white hover:opacity-90"
              >
                Ya, Reset Baseline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
