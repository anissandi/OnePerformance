import { useEffect, useMemo, useState } from "react";
import { Save, Plus, Trash2, Edit2, Building2, ChevronRight, ArrowLeft, Columns3, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  BUILTIN_WEIGHT_COLUMNS,
  loadUnitCustomWeightColumns,
  loadUnitScoreRanges,
  loadUnitScoreWeights,
  registerCustomGroupingInAccessSystem,
  saveUnitCustomWeightColumns,
  saveUnitScoreRanges,
  saveUnitScoreWeights,
  toCustomGroupingColumnKey,
  type CustomScoreWeightColumn,
} from "../shared/scoringWeightStore";
import { loadAccessGroups } from "./settings/AccessManagement";
import { loadManagedUsers, resolveEffectiveUserGrouping } from "../../store/authStore";
import { ANALYTICS_CARD_TONES, type AnalyticsCardTone } from "../../components/AnalyticsStatCard";
import { getMasterCompanyLocations } from "./settings/masterCompanyStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScoreRange = {
  id: string; min: number; max: number; grade: string; label: string; color: string;
};

type KPIWeight = {
  id: string;
  indikator: string;
  operasional: string;
  kaWaKaSeksi: string;
  pengawasKepalaBagian: string;
  kepalaDepartement: string;
  kepalaDivisi: string;
  [customColKey: string]: string;
};

type CalibrationGrade = { id: string; grade: string; proporsi: string; };

type DivisionProportion  = { id: string; divisi: string;     hc: number; };
type DepartemenenProportion = { id: string; divisiId: string; departemen: string; hc: number; };
type BagianProportion    = { id: string; departemenenId: string; bagian: string; hc: number; };

type CompanyUnit = {
  id: string; name: string; code: string; industry: string;
  scores: ScoreRange[];
  kpiWeights: KPIWeight[];
  customColumns: CustomScoreWeightColumn[];
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
};

// ─── Default data factories ───────────────────────────────────────────────────

const makeDefaultScores = (): ScoreRange[] => [
  { id: "1", min: 90, max: 100, grade: "A+", label: "Outstanding",    color: "#10B981" },
  { id: "2", min: 80, max: 89,  grade: "A",  label: "Good",           color: "#3B82F6" },
  { id: "3", min: 70, max: 79,  grade: "B",  label: "Average",        color: "#F59E0B" },
  { id: "4", min: 60, max: 69,  grade: "C",  label: "Below Average",  color: "#EF4444" },
  { id: "5", min: 50, max: 59,  grade: "D",  label: "Unsatisfactory", color: "#DC2626" },
  { id: "6", min: 0,  max: 49,  grade: "E",  label: "Fail",           color: "#991B1B" },
];

const makeDefaultKPIWeights = (): KPIWeight[] => [
  { id: "1", indikator: "KPI",                       operasional: "50%", kaWaKaSeksi: "50%", pengawasKepalaBagian: "40%", kepalaDepartement: "40%", kepalaDivisi: "40%" },
  { id: "2", indikator: "SMART Goals",               operasional: "20%", kaWaKaSeksi: "20%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "3", indikator: "Appraisal Form",            operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "4", indikator: "Project Outside Job Scope", operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "10%", kepalaDivisi: "10%" },
  { id: "5", indikator: "Managerial Skill",          operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "15%", kepalaDepartement: "20%", kepalaDivisi: "20%" },
  { id: "6", indikator: "Inter-Departement Feedback",operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "-",   kepalaDepartement: "-",   kepalaDivisi: "-" },
  { id: "7", indikator: "Management Interview",      operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "-",   kepalaDepartement: "-",   kepalaDivisi: "10%" },
];

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%"  },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%"  },
];

// Division list is shared across all units
const DIV_DEFS = [
  { id: "div1", divisi: "Staff Management" },
  { id: "div2", divisi: "Generals" },
  { id: "div3", divisi: "Finance & Accounting" },
  { id: "div4", divisi: "Logistic / Materials" },
  { id: "div5", divisi: "Quality Management" },
  { id: "div6", divisi: "Coconut Production" },
  { id: "div7", divisi: "Pineapple Production" },
  { id: "div8", divisi: "Utility & Supports" },
];

// Department definitions: [ divisiId, departemen ]
const DEPT_DEFS: [string, string, string][] = [
  ["dep1",  "div1", "Sumber Daya Manusia"],
  ["dep2",  "div1", "Umum & Administrasi"],
  ["dep3",  "div2", "Legal & Compliance"],
  ["dep4",  "div2", "Teknologi Informasi"],
  ["dep5",  "div3", "Keuangan"],
  ["dep6",  "div3", "Akuntansi"],
  ["dep7",  "div3", "Pajak & Audit"],
  ["dep8",  "div4", "Warehouse & Inventory"],
  ["dep9",  "div4", "Purchasing"],
  ["dep10", "div5", "Quality Control"],
  ["dep11", "div5", "Quality Assurance"],
  ["dep12", "div6", "Produksi Kelapa A"],
  ["dep13", "div6", "Produksi Kelapa B"],
  ["dep14", "div7", "Produksi Nanas"],
  ["dep15", "div8", "Maintenance"],
  ["dep16", "div8", "Utilitas & Energi"],
];

// definitions: [ bagianId, departemenenId, bagian ]
const BAGIAN_DEFS: [string, string, string][] = [
  ["bag1",  "dep1",  "Rekrutmen & Seleksi"],
  ["bag2",  "dep1",  "Pengembangan SDM"],
  ["bag3",  "dep2",  "Administrasi Umum"],
  ["bag4",  "dep2",  "Kearsipan"],
  ["bag5",  "dep3",  "Legal"],
  ["bag6",  "dep3",  "Kepatuhan"],
  ["bag7",  "dep4",  "Infrastruktur IT"],
  ["bag8",  "dep4",  "Pengembangan Sistem"],
  ["bag9",  "dep5",  "Treasury"],
  ["bag10", "dep5",  "Anggaran"],
  ["bag11", "dep6",  "Akuntansi Biaya"],
  ["bag12", "dep6",  "Akuntansi Umum"],
  ["bag13", "dep7",  "Pajak"],
  ["bag14", "dep7",  "Internal Audit"],
  ["bag15", "dep8",  "Warehouse"],
  ["bag16", "dep8",  "Inventory Control"],
  ["bag17", "dep9",  "Pengadaan Lokal"],
  ["bag18", "dep9",  "Pengadaan Import"],
  ["bag19", "dep10", "Inspeksi QC"],
  ["bag20", "dep10", "Laboratorium"],
  ["bag21", "dep11", "Sistem Manajemen Mutu"],
  ["bag22", "dep11", "Dokumentasi QA"],
  ["bag23", "dep12", "Proses Kelapa A"],
  ["bag24", "dep12", "Packing Kelapa A"],
  ["bag25", "dep13", "Proses Kelapa B"],
  ["bag26", "dep13", "Packing Kelapa B"],
  ["bag27", "dep14", "Proses Nanas"],
  ["bag28", "dep14", "Packing Nanas"],
  ["bag29", "dep15", "Mechanical"],
  ["bag30", "dep15", "Electrical"],
  ["bag31", "dep16", "Utilitas"],
  ["bag32", "dep16", "Energi & Environment"],
];

const makeDefaultDivisionProportions = (): DivisionProportion[] =>
  DIV_DEFS.map(d => ({ id: d.id, divisi: d.divisi, hc: 0 }));

const makeDefaultDepartemenenProportions = (): DepartemenenProportion[] =>
  DEPT_DEFS.map(([id, divisiId, departemen]) => ({ id, divisiId, departemen, hc: 0 }));

const makeDefaultBagianProportions = (): BagianProportion[] =>
  BAGIAN_DEFS.map(([id, departemenenId, bagian]) => ({ id, departemenenId, bagian, hc: 0 }));

function hydrateUnitKPIWeights(unitName: string, customCols: CustomScoreWeightColumn[]): KPIWeight[] {
  const defaults = makeDefaultKPIWeights();
  const saved = loadUnitScoreWeights(unitName);
  return defaults.map((row) => {
    const savedRow = saved[row.indikator] ?? {};
    const merged: KPIWeight = {
      ...row,
      operasional: savedRow.operasional ?? row.operasional,
      kaWaKaSeksi: savedRow.kaWaKaSeksi ?? row.kaWaKaSeksi,
      pengawasKepalaBagian: savedRow.pengawasKepalaBagian ?? row.pengawasKepalaBagian,
      kepalaDepartement: savedRow.kepalaDepartement ?? row.kepalaDepartement,
      kepalaDivisi: savedRow.kepalaDivisi ?? row.kepalaDivisi,
    };
    for (const col of customCols) {
      merged[col.key] = savedRow[col.key] ?? savedRow[col.groupName] ?? "-";
    }
    for (const [k, v] of Object.entries(savedRow)) {
      if (k !== "id" && typeof v === "string" && merged[k] === undefined) {
        merged[k] = v;
      }
    }
    return merged;
  });
}

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => {
  const customCols = loadUnitCustomWeightColumns(name);
  return {
    id, name, code, industry,
    scores: loadUnitScoreRanges(name, makeDefaultScores()),
    customColumns: customCols,
    kpiWeights: hydrateUnitKPIWeights(name, customCols),
    calibrationGrades: makeDefaultCalibrationGrades(),
    divisionProportions: makeDefaultDivisionProportions(),
    departemenenProportions: makeDefaultDepartemenenProportions(),
    bagianProportions: makeDefaultBagianProportions(),
  };
};

const EXTRA_SOFT_WEIGHT_ROW_BG = [
  "bg-[#F6FAFF] hover:bg-[#ECF4FF]",
  "bg-[#F4FBF9] hover:bg-[#E8F7F3]",
  "bg-[#FFFBF4] hover:bg-[#FFF4E2]",
  "bg-[#F8F7FF] hover:bg-[#F0EEFF]",
  "bg-[#F5FBF6] hover:bg-[#E9F7EC]",
  "bg-[#FDF7F9] hover:bg-[#FBEFF4]",
  "bg-[#F7FAFC] hover:bg-[#EDF2F7]",
];

const buildCompanyUnitsFromStore = (): CompanyUnit[] => {
  const locs = getMasterCompanyLocations();
  if (locs.length > 0) {
    return locs.map((loc, idx) => makeUnit(String(idx + 1), loc.company, loc.code, loc.companyGroup));
  }
  return [
    makeUnit("1", "PT RSUP (Industry)",          "RSUP-IND", "Industry"),
    makeUnit("2", "PT RSUP (Perkebunan)",        "RSUP-PKB", "Perkebunan"),
    makeUnit("3", "PT Pulau Sambu (Jakarta)",    "PS-JKT",   "Jakarta"),
    makeUnit("4", "PT Pulau Sambu (Guntung)",    "PS-GTG",   "Guntung"),
    makeUnit("5", "PT Pulau Sambu (Kuala Enok)", "PS-KE",    "Kuala Enok"),
    makeUnit("6", "PT RSTM",                     "RSTM",     ""),
    makeUnit("7", "PT GHS",                      "GHS",      ""),
    makeUnit("8", "PT RSUP ASD",                 "RSUP-ASD", ""),
  ];
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function normalizeWeightInputOnBlur(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return "-";
  const num = parseFloat(trimmed.replace("%", "").trim());
  if (!Number.isFinite(num) || num <= 0) return "-";
  return `${num}%`;
}

function AddGroupingColumnModal({
  existingColumnNames,
  suggestedGroupings,
  templateOptions,
  kpiWeights,
  onClose,
  onAdd,
}: {
  existingColumnNames: string[];
  suggestedGroupings: string[];
  templateOptions: Array<{ key: string; label: string }>;
  kpiWeights: KPIWeight[];
  onClose: () => void;
  onAdd: (payload: { groupName: string; templateKey: string; applyAllUnits: boolean }) => void;
}) {
  const [groupName, setGroupName] = useState(suggestedGroupings[0] ?? "");
  const [templateKey, setTemplateKey] = useState<string>("operasional");
  const [applyAllUnits, setApplyAllUnits] = useState(true);

  const trimmed = groupName.trim();
  const isDuplicate = trimmed.length > 0 && existingColumnNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase());

  const previewRows = useMemo(() => {
    return kpiWeights.map((w) => ({
      indikator: w.indikator,
      val:
        w.indikator === "Inter-Departement Feedback"
          ? "-"
          : templateKey === "__empty__"
          ? "-"
          : w[templateKey] ?? "-",
    }));
  }, [kpiWeights, templateKey]);

  const previewTotal = useMemo(() => {
    return previewRows.reduce((sum, r) => {
      const num = parseFloat(String(r.val).replace("%", "").trim());
      return sum + (Number.isFinite(num) ? num : 0);
    }, 0);
  }, [previewRows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Columns3 className="w-5 h-5 text-sky-300" />
            <div>
              <h3 className="font-semibold text-base">Tambah Kolom Grouping Baru</h3>
              <p className="text-xs text-white/75">Kolom baru otomatis terhubung ke perhitungan nilai seluruh modul PA</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {suggestedGroupings.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                Pilih Cepat dari Grouping yang Sudah Dibuat
              </label>
              <div className="flex flex-wrap gap-1.5">
                {suggestedGroupings.map((sg) => {
                  const active = groupName.trim().toLowerCase() === sg.toLowerCase();
                  return (
                    <button
                      key={sg}
                      type="button"
                      onClick={() => setGroupName(sg)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? "bg-[#1A284F] text-white border-[#1A284F]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:border-[#1A284F]/40"
                      }`}
                    >
                      {sg}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Nama Grouping <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Contoh: Specialist, Management Trainee, Koordinator..."
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
            />
            {isDuplicate && (
              <p className="text-xs text-red-600 mt-1">Kolom untuk grouping &ldquo;{trimmed}&rdquo; sudah ada pada tabel ini.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Salin Bobot Awal Dari
            </label>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
            >
              {templateOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
              <option value="__empty__">Kosong (-) — isi manual dari 0%</option>
            </select>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Pratinjau Bobot Awal</span>
              <span className="text-xs font-bold text-[#1A284F]">Total: {previewTotal}%</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {previewRows.map((r) => (
                <div key={r.indikator} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-b-0">
                  <span className="text-slate-600 truncate pr-2">{r.indikator}</span>
                  <span className="font-semibold text-slate-900">{r.val}</span>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-blue-50/60 border border-blue-100 cursor-pointer">
            <input
              type="checkbox"
              checked={applyAllUnits}
              onChange={(e) => setApplyAllUnits(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#1A284F]"
            />
            <span className="text-xs text-slate-700 leading-relaxed">
              <strong className="text-[#1A284F]">Terapkan kolom ini ke seluruh Company Unit</strong> agar semua unit memiliki struktur kolom grouping yang konsisten (nilai bobot per unit tetap dapat diubah masing-masing).
            </span>
          </label>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!trimmed || isDuplicate}
            onClick={() => onAdd({ groupName: trimmed, templateKey, applyAllUnits })}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Kolom
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Score sub-panel ──────────────────────────────────────────────────────────

function ScorePanel({
  scores, kpiWeights, customColumns, unmappedGroupings, editMode,
  onUpdateScore, onAddScore, onDeleteScore, onUpdateKPIWeight,
  onOpenAddColumn, onQuickAddGrouping, onDeleteCustomColumn,
}: {
  scores: ScoreRange[];
  kpiWeights: KPIWeight[];
  customColumns: CustomScoreWeightColumn[];
  unmappedGroupings: string[];
  editMode: boolean;
  onUpdateScore: (id: string, field: keyof ScoreRange, value: any) => void;
  onAddScore: () => void;
  onDeleteScore: (id: string) => void;
  onUpdateKPIWeight: (id: string, field: string, value: string) => void;
  onOpenAddColumn: () => void;
  onQuickAddGrouping: (groupName: string) => void;
  onDeleteCustomColumn: (colKey: string, label: string) => void;
}) {
  const allColumns = useMemo(
    () => [
      ...BUILTIN_WEIGHT_COLUMNS.map((c) => ({ key: c.key, label: c.label, groupName: c.groupName, isCustom: false })),
      ...customColumns.map((c) => ({ key: c.key, label: c.label, groupName: c.groupName, isCustom: true })),
    ],
    [customColumns],
  );

  return (
    <>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-900">Bobot Penilaian KPI</h3>
            <p className="text-sm text-gray-500 mt-1">
              KPI assessment weights by position level &amp; custom user groupings
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAddColumn}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[#1A284F]/10 text-[#1A284F] hover:bg-[#1A284F] hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Kolom Grouping
          </button>
        </div>

        {unmappedGroupings.length > 0 && (
          <div className="mx-6 mt-5 px-4 py-3 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-indigo-900">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Grouping baru terdeteksi dan belum memiliki kolom bobot khusus (klik untuk menambahkan):
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {unmappedGroupings.map((gName) => (
                <button
                  key={gName}
                  type="button"
                  onClick={() => onQuickAddGrouping(gName)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-xs font-semibold text-[#1A284F] hover:bg-[#1A284F] hover:text-white hover:border-[#1A284F] transition-colors shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                  {gName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">No</th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Indikator</th>
                {allColumns.map((col) => (
                  <th key={col.key} className="border border-gray-300 px-4 py-3 text-center font-semibold whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>{col.label}</span>
                      {col.isCustom && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-200 text-[10px] font-semibold">
                          Custom
                        </span>
                      )}
                      {col.isCustom && editMode && (
                        <button
                          type="button"
                          title={`Hapus kolom ${col.label}`}
                          onClick={() => onDeleteCustomColumn(col.key, col.label)}
                          className="ml-1 p-1 rounded hover:bg-red-500/30 text-red-200 hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpiWeights.map((w, idx) => (
                <tr key={w.id} className={`transition-colors ${EXTRA_SOFT_WEIGHT_ROW_BG[idx % EXTRA_SOFT_WEIGHT_ROW_BG.length]}`}>
                  <td className="border border-gray-300 px-4 py-3 text-center font-medium text-gray-900">{idx + 1}</td>
                  <td className="border border-gray-300 px-4 py-3 font-medium text-gray-900">{w.indikator}</td>
                  {allColumns.map((col) => (
                    <td key={col.key} className={`border border-gray-300 px-4 py-3 text-center ${col.isCustom ? "bg-sky-100/20" : ""}`}>
                      {editMode && w.indikator !== "Inter-Departement Feedback" ? (
                        <input
                          type="text"
                          value={w[col.key] ?? "-"}
                          onChange={(e) => onUpdateKPIWeight(w.id, col.key, e.target.value)}
                          onBlur={(e) => onUpdateKPIWeight(w.id, col.key, normalizeWeightInputOnBlur(e.target.value))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center"
                        />
                      ) : (
                        <span className="text-gray-900">{w[col.key] ?? "-"}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {(() => {
                const totals = allColumns.map((col) =>
                  kpiWeights.reduce((sum, w) => {
                    const val = w[col.key] ?? "-";
                    const num = parseFloat(String(val).replace("%", "").trim());
                    return sum + (isNaN(num) ? 0 : num);
                  }, 0)
                );
                return (
                  <tr className="bg-[#1A284F] text-white font-semibold">
                    <td colSpan={2} className="border border-gray-300 px-4 py-3 text-center">Total</td>
                    {totals.map((t, i) => (
                      <td
                        key={allColumns[i]?.key ?? i}
                        className={`border border-gray-300 px-4 py-3 text-center ${
                          editMode && t !== 100 ? "text-amber-300" : ""
                        }`}
                      >
                        {t > 0 ? `${t}%` : "0%"}
                      </td>
                    ))}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-900">Scoring / Grading</h3>
            <p className="text-sm text-gray-500 mt-1">Define score ranges for performance ratings</p>
          </div>
          {editMode && (
            <button onClick={onAddScore}
              className="flex items-center gap-2 text-sm font-medium text-[#1A284F] hover:text-[#131d3b] transition-colors">
              <Plus className="w-4 h-4" />Add Range
            </button>
          )}
        </div>
        <div className="p-6 space-y-3">
          {[...scores].sort((a, b) => b.min - a.min).map(score => (
            <div key={score.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: score.color }}>{score.grade}</div>
              {editMode ? (
                <>
                  <div className="flex-1 grid grid-cols-5 gap-3">
                    {([["Min Score","min","number"],["Max Score","max","number"],["Grading","grade","text"],["Scoring Criteria","label","text"]] as [string, keyof ScoreRange, string][]).map(([lbl,field,type]) => (
                      <div key={field} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">{lbl}</label>
                        <input type={type} value={score[field] as any}
                          onChange={e => onUpdateScore(score.id, field, type === "number" ? Number(e.target.value) : e.target.value)}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20" />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500">Color</label>
                      <input type="color" value={score.color}
                        onChange={e => onUpdateScore(score.id, "color", e.target.value)}
                        className="h-[38px] w-full border border-gray-200 rounded-lg cursor-pointer" />
                    </div>
                  </div>
                  <button onClick={() => onDeleteScore(score.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex-1 flex items-center gap-8">
                  <div><p className="text-xs text-gray-500 mb-1">Achievement Score (%)</p>
                    <p className="font-semibold text-gray-900">{score.min === 0 && score.max < 50 ? `<50%` : `${score.min}–${score.max}%`}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Grading</p><p className="font-semibold text-gray-900">{score.grade}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Scoring Criteria</p><p className="font-semibold text-gray-900">{score.label}</p></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Calibration sub-panel ────────────────────────────────────────────────────


// ─── Reusable proportion table ────────────────────────────────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  hc: number;
  shareKuota: string;
  calcs: number[];
};


// ─── Unit detail view ─────────────────────────────────────────────────────────

function UnitDetail({
  unit,
  allSystemGroupings,
  onBack,
  onUpdate,
  onAddGroupingColumn,
  onRemoveGroupingColumn,
}: {
  unit: CompanyUnit;
  allSystemGroupings: string[];
  onBack: () => void;
  onUpdate: (u: CompanyUnit) => void;
  onAddGroupingColumn: (payload: { groupName: string; templateKey: string; applyAllUnits: boolean }) => void;
  onRemoveGroupingColumn: (colKey: string, label: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [showAddColModal, setShowAddColModal] = useState(false);
  const [prefillGroup, setPrefillGroup] = useState<string | null>(null);

  const upd = (patch: Partial<CompanyUnit>) => onUpdate({ ...unit, ...patch });

  const existingColumnNames = useMemo(
    () => [
      ...BUILTIN_WEIGHT_COLUMNS.map((c) => c.groupName),
      ...BUILTIN_WEIGHT_COLUMNS.map((c) => c.label),
      ...unit.customColumns.flatMap((c) => [c.groupName, c.label]),
    ],
    [unit.customColumns],
  );

  const unmappedGroupings = useMemo(() => {
    const builtinStandard = new Set([
      "operasional",
      "ka./wa.ka.seksi",
      "ka. / wa. ka. seksi",
      "ka./wa.ka.bagian",
      "ka. / wa. ka. bagian",
      "ka./wa.ka.dept",
      "ka. / wa. ka. dept",
      "ka./wa.ka.div ke atas",
      "ka. / wa. ka. div ke atas",
      "direktur / director",
      "team_div",
    ]);
    const mappedCustom = new Set(
      unit.customColumns.flatMap((c) => [c.groupName.trim().toLowerCase(), c.label.trim().toLowerCase()]),
    );
    return allSystemGroupings.filter((g) => {
      const low = g.trim().toLowerCase();
      return Boolean(low) && !builtinStandard.has(low) && !mappedCustom.has(low);
    });
  }, [allSystemGroupings, unit.customColumns]);

  const suggestedForModal = useMemo(() => {
    const list = [...unmappedGroupings];
    const dirMapped = unit.customColumns.some((c) => c.groupName.trim().toLowerCase() === "direktur / director");
    if (!dirMapped && !list.some((x) => x.toLowerCase() === "direktur / director")) {
      list.push("Direktur / Director");
    }
    if (prefillGroup && !list.includes(prefillGroup)) {
      return [prefillGroup, ...list];
    }
    return list;
  }, [unmappedGroupings, unit.customColumns, prefillGroup]);

  const templateOptions = useMemo(
    () => [
      ...BUILTIN_WEIGHT_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      ...unit.customColumns.map((c) => ({ key: c.key, label: `${c.label} (Custom)` })),
    ],
    [unit.customColumns],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>
        <div className="flex gap-2">
          {editMode && (
            <button onClick={() => setEditMode(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              if (editMode) {
                setEditMode(false);
                toast.success(`Pengaturan bobot & skoring ${unit.name} berhasil disimpan.`);
              } else {
                setEditMode(true);
              }
            }}
            className="flex items-center gap-2 bg-[#1A284F] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm">
            {editMode ? <><Save className="w-4 h-4" />Save Changes</> : <><Edit2 className="w-4 h-4" />Edit Settings</>}
          </button>
        </div>
      </div>

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

      <ScorePanel
        scores={unit.scores}
        kpiWeights={unit.kpiWeights}
        customColumns={unit.customColumns}
        unmappedGroupings={unmappedGroupings}
        editMode={editMode}
        onUpdateScore={(id, field, value) => upd({ scores: unit.scores.map(s => s.id === id ? { ...s, [field]: value } : s) })}
        onAddScore={() => upd({ scores: [...unit.scores, { id: Date.now().toString(), min: 0, max: 0, grade: "", label: "", color: "#6B7280" }] })}
        onDeleteScore={(id) => upd({ scores: unit.scores.filter(s => s.id !== id) })}
        onUpdateKPIWeight={(id, field, value) => upd({ kpiWeights: unit.kpiWeights.map(w => w.id === id ? { ...w, [field]: value } : w) })}
        onOpenAddColumn={() => {
          setPrefillGroup(null);
          setShowAddColModal(true);
        }}
        onQuickAddGrouping={(groupName) => {
          setPrefillGroup(groupName);
          setShowAddColModal(true);
        }}
        onDeleteCustomColumn={(colKey, label) => {
          onRemoveGroupingColumn(colKey, label);
        }}
      />

      {showAddColModal && (
        <AddGroupingColumnModal
          existingColumnNames={existingColumnNames}
          suggestedGroupings={suggestedForModal}
          templateOptions={templateOptions}
          kpiWeights={unit.kpiWeights}
          onClose={() => {
            setShowAddColModal(false);
            setPrefillGroup(null);
          }}
          onAdd={(payload) => {
            onAddGroupingColumn(payload);
            setShowAddColModal(false);
            setPrefillGroup(null);
            setEditMode(true);
          }}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ScoresCalibration() {
  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(() => buildCompanyUnitsFromStore());
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);
  const [allSystemGroupings, setAllSystemGroupings] = useState<string[]>(() => {
    const fromAccess = loadAccessGroups();
    const fromUsers = loadManagedUsers()
      .flatMap((u) => [String(u.groupings ?? "").trim(), String(resolveEffectiveUserGrouping(u) ?? "").trim()])
      .filter(Boolean);
    return Array.from(new Set([...fromAccess, ...fromUsers]));
  });

  useEffect(() => {
    const refreshGroupings = () => {
      const fromAccess = loadAccessGroups();
      const fromUsers = loadManagedUsers()
        .flatMap((u) => [String(u.groupings ?? "").trim(), String(resolveEffectiveUserGrouping(u) ?? "").trim()])
        .filter(Boolean);
      setAllSystemGroupings(Array.from(new Set([...fromAccess, ...fromUsers])));
    };
    const refreshUnits = () => {
      setCompanyUnits(buildCompanyUnitsFromStore());
      refreshGroupings();
    };
    window.addEventListener("pa-db-hydrated", refreshUnits);
    window.addEventListener("pa-access-updated", refreshGroupings);
    window.addEventListener("pa-auth-updated", refreshGroupings);
    return () => {
      window.removeEventListener("pa-db-hydrated", refreshUnits);
      window.removeEventListener("pa-access-updated", refreshGroupings);
      window.removeEventListener("pa-auth-updated", refreshGroupings);
    };
  }, []);

  const updateUnit = (updated: CompanyUnit) => {
    setCompanyUnits(prev => prev.map(u => u.id === updated.id ? updated : u));
    saveUnitCustomWeightColumns(updated.name, updated.customColumns);
    saveUnitScoreWeights(updated.name, updated.kpiWeights);
    saveUnitScoreRanges(updated.name, updated.scores);
  };

  const handleAddGroupingColumn = (
    targetUnitId: string,
    { groupName, templateKey, applyAllUnits }: { groupName: string; templateKey: string; applyAllUnits: boolean },
  ) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const colKey = toCustomGroupingColumnKey(trimmed);
    const newCol: CustomScoreWeightColumn = { key: colKey, label: trimmed, groupName: trimmed };

    registerCustomGroupingInAccessSystem(trimmed);
    setAllSystemGroupings((prev) => (prev.some((g) => g.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed]));

    setCompanyUnits((prev) =>
      prev.map((u) => {
        if (!applyAllUnits && u.id !== targetUnitId) return u;
        const alreadyHas = u.customColumns.some(
          (c) => c.key === colKey || c.groupName.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        const nextCols = alreadyHas ? u.customColumns : [...u.customColumns, newCol];
        const nextWeights = u.kpiWeights.map((w) => {
          if (w[colKey] !== undefined && alreadyHas) return w;
          const copied =
            w.indikator === "Inter-Departement Feedback"
              ? "-"
              : templateKey === "__empty__"
              ? "-"
              : w[templateKey] ?? "-";
          return { ...w, [colKey]: copied };
        });
        saveUnitCustomWeightColumns(u.name, nextCols);
        saveUnitScoreWeights(u.name, nextWeights);
        return { ...u, customColumns: nextCols, kpiWeights: nextWeights };
      }),
    );

    toast.success(
      applyAllUnits
        ? `Kolom grouping "${trimmed}" berhasil ditambahkan ke seluruh Company Unit.`
        : `Kolom grouping "${trimmed}" berhasil ditambahkan.`,
    );
  };

  const handleRemoveGroupingColumn = (targetUnitId: string, colKey: string, label: string) => {
    setCompanyUnits((prev) =>
      prev.map((u) => {
        if (u.id !== targetUnitId) return u;
        const nextCols = u.customColumns.filter((c) => c.key !== colKey);
        const nextWeights = u.kpiWeights.map((w) => {
          const copy = { ...w };
          delete copy[colKey];
          return copy;
        });
        saveUnitCustomWeightColumns(u.name, nextCols);
        saveUnitScoreWeights(u.name, nextWeights);
        return { ...u, customColumns: nextCols, kpiWeights: nextWeights };
      }),
    );
    toast.success(`Kolom grouping "${label}" dihapus dari unit usaha ini.`);
  };

  const TabBar = ({ onTabClick }: { onTabClick?: () => void }) => (
    <div className="border-b border-gray-200">
      <div className="flex gap-1">
        <button onClick={onTabClick}
          className="px-6 py-3 text-sm font-medium border-b-2 border-[#1A284F] text-[#1A284F]">
          Company Units
        </button>
      </div>
    </div>
  );

  if (selectedUnit) {
    const liveUnit = companyUnits.find(u => u.id === selectedUnit.id) ?? selectedUnit;
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Scores & Calibration</h2>
          <p className="text-sm text-gray-500">Configure performance score ranges and calibration settings</p>
        </div>
        <TabBar onTabClick={() => setSelectedUnit(null)} />
        <UnitDetail
          unit={liveUnit}
          allSystemGroupings={allSystemGroupings}
          onBack={() => setSelectedUnit(null)}
          onUpdate={updateUnit}
          onAddGroupingColumn={(payload) => handleAddGroupingColumn(liveUnit.id, payload)}
          onRemoveGroupingColumn={(colKey, label) => handleRemoveGroupingColumn(liveUnit.id, colKey, label)}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Scores & Calibration</h2>
        <p className="text-sm text-gray-500">Configure performance score ranges and calibration settings</p>
      </div>
      <TabBar />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">Select a company unit to configure its Score and Calibration settings independently.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {companyUnits.map((unit, idx) => {
            const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];
            const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
            const groupingCount = BUILTIN_WEIGHT_COLUMNS.length + unit.customColumns.length;
            return (
              <button
                key={unit.id}
                onClick={() => setSelectedUnit(unit)}
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
                    <span className="text-[11px] font-bold text-[#1A284F] tabular-nums">
                      {unit.scores.length} Grade Ranges
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-white/85 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {groupingCount} Groupings
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
