import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Check,
  Table2,
  SlidersHorizontal,
  Eye,
  Edit3,
  Layers,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadMasterKpi,
  loadMasterKpiFormats,
  MASTER_KPI_FORMATS_UPDATED_EVENT,
  MASTER_KPI_UPDATED_EVENT,
  saveMasterKpi,
  saveMasterKpiFormats,
  type MasterCodeDescItem,
  type MasterKpiFormatsStore,
  type MasterKpiStore,
} from "./masterKpiStore";
import {
  AddCorporateKPIModal,
  AddKPIModal,
  CORPORATE_KPI,
  CorporateKPITable,
  KPISettingTable,
  PERSONAL_KPI,
  renameKpiSection,
  resolveKpiSectionLabel,
  resolvePersonalSectionLabel,
  type KPISetting,
  type Polaritas,
} from "../../supervisor/setting/KPISetting";
import ExportImportButton from "../../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../../utils/excelUtils";
import { MasterExecutiveSummaryTab } from "./MasterExecutiveSummaryTab";
import { useAuthStore } from "../../../store/authStore";
import { hasRolePermission } from "./AccessManagement";
import { isMenuVisibleInMenuManagement, MENU_UPDATED_EVENT } from "./MenuManagement";

// ─── Types ────────────────────────────────────────────────────────────────────

type MainMasterTab = "kpi-format" | "executive-summary" | "kpi-variable";
type FormatSubTab = "kpi-group" | "kpi-unit" | "kpi-personal";

interface MasterItem { id: number; value: string; description?: string }

interface SectionConfig {
  key: keyof MasterKpiStore;
  label: string;
  color: string;           // tailwind bg for header dot
  hasDescription: boolean; // whether items have a description field
  codeLabel?: string;
  descLabel?: string;
  modalGroup: "section" | "subsection";
  fieldHint: string;
}

// ─── Section definitions (100% tersinkron dengan Add New KPI Modal: Tab Section & Sub Section) ──

const SECTIONS: SectionConfig[] = [
  // 1. Variabel Tab Section pada Add New KPI Modal
  {
    key: "section",
    label: "Section (KPI Group & Unit)",
    color: "bg-purple-500",
    hasDescription: false,
    modalGroup: "section",
    fieldHint: "Tab Section → Field Section (KPI Group / Unit / Division)",
  },
  {
    key: "personalSection",
    label: "Section (KPI Personal)",
    color: "bg-violet-500",
    hasDescription: true,
    codeLabel: "Kode Section (mis. A, B)",
    descLabel: "Nama Section",
    modalGroup: "section",
    fieldHint: "Tab Section → Field Section (KPI Personal)",
  },
  {
    key: "sectionBobot",
    label: "Section Bobot",
    color: "bg-amber-500",
    hasDescription: false,
    modalGroup: "section",
    fieldHint: "Tab Section → Field Section Bobot",
  },
  {
    key: "cascadingTypes",
    label: "Cascading Type (Section & Sub Section)",
    color: "bg-cyan-500",
    hasDescription: true,
    codeLabel: "Kode Cascading (FC / PC / CC)",
    descLabel: "Deskripsi Cascading",
    modalGroup: "section",
    fieldHint: "Tab Section & Sub Section → Field Cascading",
  },
  // 2. Variabel Tab Sub Section pada Add New KPI Modal
  {
    key: "perspektif",
    label: "Perspektif",
    color: "bg-teal-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Perspektif",
  },
  {
    key: "satuan",
    label: "Satuan",
    color: "bg-orange-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Satuan (Unit)",
  },
  {
    key: "period",
    label: "Periode Satuan",
    color: "bg-rose-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Periode Satuan",
  },
  {
    key: "formula",
    label: "Formula Setahun / Pencapaian",
    color: "bg-sky-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Formula Setahun / Pencapaian",
  },
  {
    key: "trackingPeriod",
    label: "Periode Tracking",
    color: "bg-indigo-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Periode Tracking (Bulan; Triwulan; Semester; Quarter; Tahun)",
  },
  {
    key: "scope",
    label: "Scope",
    color: "bg-blue-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Scope",
  },
  {
    key: "bobot",
    label: "Bobot KPI",
    color: "bg-fuchsia-500",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Bobot",
  },
  {
    key: "polaritas",
    label: "Polaritas",
    color: "bg-lime-600",
    hasDescription: false,
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Polaritas",
  },
  {
    key: "cascading",
    label: "Cascading Role",
    color: "bg-emerald-500",
    hasDescription: true,
    codeLabel: "Role Key",
    descLabel: "Role Name",
    modalGroup: "subsection",
    fieldHint: "Tab Sub Section → Field Cascading (Daftar Role)",
  },
];

function storeToCardItems(stored: MasterKpiStore): Record<string, MasterItem[]> {
  const fromStrings = (vals: string[]): MasterItem[] =>
    vals.map((value, i) => ({ id: i + 1, value }));
  const fromCodeDesc = (items: MasterCodeDescItem[]): MasterItem[] =>
    items.map((c, i) => ({ id: i + 1, value: c.value, description: c.description }));
  return {
    section:         fromStrings(stored.section),
    personalSection: fromCodeDesc(stored.personalSection),
    sectionBobot:    fromStrings(stored.sectionBobot),
    cascadingTypes:  fromCodeDesc(stored.cascadingTypes),
    perspektif:      fromStrings(stored.perspektif),
    satuan:          fromStrings(stored.satuan),
    period:          fromStrings(stored.period),
    formula:         fromStrings(stored.formula),
    trackingPeriod:  fromStrings(stored.trackingPeriod),
    scope:           fromStrings(stored.scope),
    bobot:           fromStrings(stored.bobot),
    polaritas:       fromStrings(stored.polaritas),
    cascading:       fromCodeDesc(stored.cascading),
  };
}

function cardItemsToStore(data: Record<string, MasterItem[]>): MasterKpiStore {
  const toStrings = (arr?: MasterItem[]) => (arr ?? []).map((i) => i.value);
  const toCodeDesc = (arr?: MasterItem[]): MasterCodeDescItem[] =>
    (arr ?? []).map((i) => ({ value: i.value, description: i.description ?? "" }));
  return {
    section:         toStrings(data.section),
    personalSection: toCodeDesc(data.personalSection),
    sectionBobot:    toStrings(data.sectionBobot),
    cascadingTypes:  toCodeDesc(data.cascadingTypes),
    perspektif:      toStrings(data.perspektif),
    satuan:          toStrings(data.satuan),
    period:          toStrings(data.period),
    formula:         toStrings(data.formula),
    trackingPeriod:  toStrings(data.trackingPeriod),
    scope:           toStrings(data.scope),
    bobot:           toStrings(data.bobot),
    polaritas:       toStrings(data.polaritas),
    cascading:       toCodeDesc(data.cascading),
  };
}

function cloneKpiList(list: KPISetting[], idPrefix?: string): KPISetting[] {
  return list.map((it) => ({
    ...it,
    id: idPrefix && !it.id.startsWith(idPrefix) ? `${idPrefix}${it.id}` : it.id,
    monthlyTargets: it.monthlyTargets ? { ...it.monthlyTargets } : undefined,
    cascadingMap: it.cascadingMap ? { ...it.cascadingMap } : undefined,
  }));
}

function buildDefaultFormats(): MasterKpiFormatsStore<KPISetting> {
  return {
    group: cloneKpiList(CORPORATE_KPI),
    unit: cloneKpiList(CORPORATE_KPI, "unit-"),
    personal: cloneKpiList(PERSONAL_KPI),
    sectionCascadeGroup: {},
    sectionCascadeUnit: {},
  };
}

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({
  title,
  item,
  hasDescription,
  codeLabel,
  descLabel,
  onSave,
  onClose,
}: {
  title: string;
  item?: MasterItem;
  hasDescription: boolean;
  codeLabel?: string;
  descLabel?: string;
  onSave: (value: string, description?: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(item?.value ?? "");
  const [desc, setDesc]   = useState(item?.description ?? "");
  const isEdit = !!item;

  function handleSave() {
    if (!value.trim()) return;
    onSave(value.trim(), hasDescription ? desc.trim() : undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-[#1A284F] text-sm">{isEdit ? "Edit" : "Add"} {title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1 block">
              {hasDescription ? (codeLabel ?? "Code / Abbreviation") : "Value"}
            </label>
            <input
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={hasDescription ? "e.g. FC" : `Enter ${title} value`}
            />
          </div>
          {hasDescription && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1 block">
                {descLabel ?? "Description"}
              </label>
              <input
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="e.g. Full Cascading"
              />
            </div>
          )}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />{isEdit ? "Update" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single Section Card ──────────────────────────────────────────────────────

function SectionCard({ cfg, items, onChange }: {
  cfg: SectionConfig;
  items: MasterItem[];
  onChange: (items: MasterItem[]) => void;
}) {
  const [modal, setModal] = useState<{ open: boolean; item?: MasterItem }>({ open: false });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  function nextId() { return (items.length ? Math.max(...items.map(i => i.id)) : 0) + 1; }

  function handleSave(value: string, description?: string) {
    if (modal.item) {
      // update
      const updated = items.map(i => i.id === modal.item!.id ? { ...i, value, description } : i);
      onChange(updated);
      setSavedId(modal.item.id);
      setTimeout(() => setSavedId(null), 1500);
    } else {
      // add
      const newItem = { id: nextId(), value, description };
      onChange([...items, newItem]);
    }
    setModal({ open: false });
  }

  function handleDelete(id: number) {
    onChange(items.filter(i => i.id !== id));
    setDeleteId(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.color}`} />
            <span className="text-sm font-bold text-[#1A284F] truncate">{cfg.label}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">{items.length}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{cfg.fieldHint}</p>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">No items yet. Click Add to create one.</p>
        ) : items.map(item => (
          <div key={item.id} className={`flex items-center gap-3 px-4 py-2.5 group hover:bg-gray-50/60 transition-colors ${savedId === item.id ? "bg-emerald-50/60" : ""}`}>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800">{item.value}</span>
              {item.description && (
                <span className="ml-2 text-xs text-gray-400">— {item.description}</span>
              )}
            </div>
            {savedId === item.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setModal({ open: true, item })}
                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeleteId(item.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit modal */}
      {modal.open && (
        <ItemModal
          title={cfg.label}
          item={modal.item}
          hasDescription={cfg.hasDescription}
          codeLabel={cfg.codeLabel}
          descLabel={cfg.descLabel}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}

      {/* Delete confirm */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-5" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-gray-800 text-sm mb-1">Delete item?</p>
            <p className="text-xs text-gray-500 mb-4">
              "<span className="font-medium">{items.find(i => i.id === deleteId)?.value}</span>" will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MasterKPIPage() {
  const params = useParams<{ tab?: string; subtab?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeUser } = useAuthStore();
  const [, setPermTick] = useState(0);

  useEffect(() => {
    const onPermSync = () => setPermTick((t) => t + 1);
    window.addEventListener("pa-access-updated", onPermSync);
    window.addEventListener(MENU_UPDATED_EVENT, onPermSync);
    return () => {
      window.removeEventListener("pa-access-updated", onPermSync);
      window.removeEventListener(MENU_UPDATED_EVENT, onPermSync);
    };
  }, []);

  const canViewExecutiveSummary = useMemo(() => {
    const r = activeUser.role || "Employee";
    return (
      isMenuVisibleInMenuManagement("analytics_executive_summary") &&
      hasRolePermission(r, "analytics_executive_summary", "view")
    );
  }, [activeUser.role, activeUser.employeeId]);

  const canEditMasterKpi = useMemo(() => {
    const r = activeUser.role || "Employee";
    return (
      r === "Administrator" ||
      r === "HR ICF" ||
      hasRolePermission(r, "setting_master_kpi", "edit")
    );
  }, [activeUser.role]);

  const baseMasterPath = useMemo(() => {
    const idx = location.pathname.indexOf("/settings/master/kpi");
    if (idx >= 0) {
      return location.pathname.slice(0, idx + "/settings/master/kpi".length);
    }
    return "/hr/settings/master/kpi";
  }, [location.pathname]);

  const activeMainTab: MainMasterTab =
    params.tab === "kpi-variable"
      ? "kpi-variable"
      : params.tab === "executive-summary" && canViewExecutiveSummary
      ? "executive-summary"
      : "kpi-format";
  const activeSubTab: FormatSubTab =
    params.subtab === "kpi-unit"
      ? "kpi-unit"
      : params.subtab === "kpi-personal"
      ? "kpi-personal"
      : "kpi-group";

  // Pastikan path URL selalu sesuai dengan tab & sub-tab yang sedang aktif
  useEffect(() => {
    if (!params.tab) {
      navigate(`${baseMasterPath}/kpi-format/kpi-group`, { replace: true });
    } else if (params.tab === "kpi-format" && !params.subtab) {
      navigate(`${baseMasterPath}/kpi-format/kpi-group`, { replace: true });
    } else if (params.tab === "executive-summary" && !canViewExecutiveSummary) {
      navigate(`${baseMasterPath}/kpi-format/kpi-group`, { replace: true });
    }
  }, [params.tab, params.subtab, baseMasterPath, navigate, canViewExecutiveSummary]);

  const handleMainTabChange = (nextTab: MainMasterTab) => {
    if (nextTab === "kpi-variable") {
      navigate(`${baseMasterPath}/kpi-variable`);
    } else if (nextTab === "executive-summary") {
      navigate(`${baseMasterPath}/executive-summary`);
    } else {
      navigate(`${baseMasterPath}/kpi-format/${activeSubTab}`);
    }
  };

  const handleSubTabChange = (nextSub: FormatSubTab) => {
    navigate(`${baseMasterPath}/kpi-format/${nextSub}`);
  };

  // ── State KPI Variable (tersinkron penuh ke database Supabase) ──
  const [data, setData] = useState<Record<string, MasterItem[]>>(() =>
    storeToCardItems(loadMasterKpi()),
  );

  useEffect(() => {
    const syncVars = () => setData(storeToCardItems(loadMasterKpi()));
    window.addEventListener("pa-db-hydrated", syncVars);
    window.addEventListener(MASTER_KPI_UPDATED_EVENT, syncVars);
    window.addEventListener("storage", syncVars);
    return () => {
      window.removeEventListener("pa-db-hydrated", syncVars);
      window.removeEventListener(MASTER_KPI_UPDATED_EVENT, syncVars);
      window.removeEventListener("storage", syncVars);
    };
  }, []);

  function updateSection(key: keyof MasterKpiStore, items: MasterItem[]) {
    setData((prev) => {
      const next = { ...prev, [key]: items };
      saveMasterKpi(cardItemsToStore(next));
      return next;
    });
  }

  // ── State KPI Format: KPI (Group), KPI (Unit), KPI (Personal) ──
  const [formats, setFormats] = useState<MasterKpiFormatsStore<KPISetting>>(() =>
    loadMasterKpiFormats<KPISetting>(buildDefaultFormats()),
  );
  const [showAddModalFor, setShowAddModalFor] = useState<FormatSubTab | null>(null);
  const [personalPreviewMode, setPersonalPreviewMode] = useState(false);

  useEffect(() => {
    const syncFormats = () =>
      setFormats(loadMasterKpiFormats<KPISetting>(buildDefaultFormats()));
    window.addEventListener("pa-db-hydrated", syncFormats);
    window.addEventListener(MASTER_KPI_FORMATS_UPDATED_EVENT, syncFormats);
    window.addEventListener("storage", syncFormats);
    return () => {
      window.removeEventListener("pa-db-hydrated", syncFormats);
      window.removeEventListener(MASTER_KPI_FORMATS_UPDATED_EVENT, syncFormats);
      window.removeEventListener("storage", syncFormats);
    };
  }, []);

  const persistFormats = (
    updater: (prev: MasterKpiFormatsStore<KPISetting>) => MasterKpiFormatsStore<KPISetting>,
    label: string,
  ) => {
    setFormats((prev) => {
      const next = updater(prev);
      saveMasterKpiFormats(next, label);
      return next;
    });
  };

  const currentFormatItems: KPISetting[] =
    activeSubTab === "kpi-group"
      ? formats.group
      : activeSubTab === "kpi-unit"
      ? formats.unit
      : formats.personal;

  const totalBobotActive = useMemo(
    () =>
      currentFormatItems.reduce(
        (sum, item) => sum + (parseFloat(String(item.bobot ?? "0").replace("%", "")) || 0),
        0,
      ),
    [currentFormatItems],
  );

  const handleExportFormat = (sub: FormatSubTab) => {
    if (sub === "kpi-personal") {
      const headers = [
        "No", "Section", "Perspektif", "KPI", "Satuan", "Formula Setahun", "Scope",
        "Bobot", "Definisi", "Source", "Baseline 2025", "Target 2026", "Polaritas",
        "Detail Formula", "Keterangan", "Tracking Period",
      ];
      const rows = formats.personal.map((i) => [
        i.no, `Section ${i.section}`, i.perspektif, i.kpi, i.satuan, i.formula, i.scope ?? "",
        i.bobot, i.definisi, i.source, i.baseline2025, i.target2026, i.polaritas,
        i.detailFormula, i.keterangan ?? "", i.trackingPeriod ?? "",
      ]);
      exportXLSX("Master_KPI_Format_Personal_2026.xlsx", headers, rows);
      return;
    }
    const list = sub === "kpi-group" ? formats.group : formats.unit;
    const headers = [
      "No", "Section", "Perspektif", "KPI", "Satuan", "Formula Setahun", "Scope",
      "Bobot", "Definisi", "Source", "Baseline 2025", "Target 2026", "Polaritas",
      "Detail Formula", "Keterangan", "Tracking Period",
      "COO", "GM Industry", "GM Perkebunan", "GM ASD", "GM RSTM", "GM GHS",
    ];
    const rows = list.map((i) => [
      i.no, `${i.section}. ${i.sectionLabel ?? i.section}`, i.perspektif, i.kpi, i.satuan,
      i.formula, i.scope ?? "", i.bobot, i.definisi, i.source, i.baseline2025, i.target2026,
      i.polaritas, i.detailFormula, i.keterangan ?? "", i.trackingPeriod ?? "",
      i.coo ?? "", i.gmVgmIndustry ?? "", i.gmVgmPerkebunan ?? "", i.gmAsd ?? "", i.gmRstm ?? "", i.gmGhs ?? "",
    ]);
    exportXLSX(
      sub === "kpi-group" ? "Master_KPI_Format_Group_2026.xlsx" : "Master_KPI_Format_Unit_2026.xlsx",
      headers,
      rows,
    );
  };

  const handleImportFormat = async (sub: FormatSubTab, file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      const col = (pat: RegExp) => headers.findIndex((h) => pat.test(h.trim()));
      const noI = col(/^no$/i),
        sectionI = col(/section/i),
        perspektifI = col(/perspektif/i),
        kpiI = col(/^kpi$/i),
        satuanI = col(/satuan/i),
        formulaI = col(/formula/i),
        scopeI = col(/scope/i),
        bobotI = col(/bobot/i),
        definisiI = col(/definisi/i),
        sourceI = col(/source/i),
        baseI = col(/baseline/i),
        targetI = col(/target/i),
        polarI = col(/polaritas/i),
        detailI = col(/detail/i),
        ketI = col(/keterangan/i),
        trackI = col(/tracking/i);
      const g = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
      const imported: KPISetting[] = rows
        .filter((r) => r.some((c) => c.trim()))
        .map((r, idx) => ({
          id: `master-imp-${sub}-${Date.now()}-${idx}`,
          no: g(r, noI) || String(idx + 1),
          section: g(r, sectionI).toUpperCase().match(/[A-Z]/)?.[0] ?? "A",
          perspektif: g(r, perspektifI) || "Proses",
          kpi: g(r, kpiI),
          satuan: g(r, satuanI),
          formula: g(r, formulaI) || "Jumlah",
          scope: g(r, scopeI),
          bobot: g(r, bobotI) || "0%",
          definisi: g(r, definisiI),
          source: g(r, sourceI),
          baseline2025: g(r, baseI),
          target2026: g(r, targetI),
          polaritas: ((g(r, polarI) as Polaritas) || "Maximize"),
          detailFormula: g(r, detailI),
          keterangan: g(r, ketI),
          trackingPeriod: g(r, trackI) || "Bulan",
          monthlyTargets: {},
          colorIndicator: false,
          indicatorMode: "numeric",
        }));
      if (imported.length === 0) {
        toast.error("Tidak ada baris KPI valid pada file Excel.");
        return;
      }
      const keyField = sub === "kpi-group" ? "group" : sub === "kpi-unit" ? "unit" : "personal";
      persistFormats((prev) => ({ ...prev, [keyField]: imported }), sub);
      toast.success(`Berhasil meng-upload ${imported.length} item ke ${sub === "kpi-group" ? "KPI (Group)" : sub === "kpi-unit" ? "KPI (Unit)" : "KPI (Personal)"}.`);
    } catch {
      toast.error("Gagal membaca file Excel Master KPI.");
    }
  };

  const sectionGroupCards = SECTIONS.filter((s) => s.modalGroup === "section");
  const subSectionGroupCards = SECTIONS.filter((s) => s.modalGroup === "subsection");

  return (
    <div className="p-6 w-full space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">Master KPI</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Kelola template format KPI (Group, Unit, Personal) dan variabel dinamis untuk modal Add New KPI
          </p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span>
          <span>Setting</span><span className="mx-1">›</span>
          <span>Master</span><span className="mx-1">›</span>
          <span className="text-gray-500">KPI</span><span className="mx-1">›</span>
          <span className="font-medium text-gray-700">
            {activeMainTab === "kpi-format"
              ? "KPI Format"
              : activeMainTab === "executive-summary"
              ? "Executive Summary"
              : "KPI Variable"}
          </span>
        </div>
      </div>

      {/* Main Tabs: KPI Format | Executive Summary | KPI Variable */}
      <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => handleMainTabChange("kpi-format")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            activeMainTab === "kpi-format"
              ? "bg-white text-[#1A284F] shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <Table2 className="h-3.5 w-3.5" />
          KPI Format
        </button>
        {canViewExecutiveSummary && (
          <button
            type="button"
            onClick={() => handleMainTabChange("executive-summary")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
              activeMainTab === "executive-summary"
                ? "bg-white text-[#1A284F] shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Executive Summary
          </button>
        )}
        <button
          type="button"
          onClick={() => handleMainTabChange("kpi-variable")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
            activeMainTab === "kpi-variable"
              ? "bg-white text-[#1A284F] shadow-sm"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          KPI Variable
        </button>
      </div>

      {/* ══ TAB 1: KPI FORMAT (KPI Group | KPI Unit | KPI Personal) ══ */}
      {activeMainTab === "kpi-format" && (
        <div className="space-y-4">
          {/* Sub-tab bar + summary badges */}
          <div className="flex items-center justify-between border-b border-gray-200 flex-wrap gap-3">
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  { id: "kpi-group", label: "KPI (Group)", count: formats.group.length },
                  { id: "kpi-unit", label: "KPI (Unit)", count: formats.unit.length },
                  { id: "kpi-personal", label: "KPI (Personal)", count: formats.personal.length },
                ] as const
              ).map((t) => {
                const isAct = activeSubTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSubTabChange(t.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                      isAct
                        ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5 rounded-t-lg"
                        : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-t-lg"
                    }`}
                  >
                    <span>{t.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isAct ? "bg-[#1A284F] text-white" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A284F]/5 text-[#1A284F] text-xs font-semibold">
                Total KPI: <strong>{currentFormatItems.length}</strong>
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  Math.round(totalBobotActive) === 100
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                Total Bobot: <strong>{totalBobotActive}%</strong>
              </span>
            </div>
          </div>

          {/* Sub-tab 1: KPI (Group) — disalin dari /kpi/corporate */}
          {activeSubTab === "kpi-group" && (
            <CorporateKPITable
              items={formats.group}
              onUpdateItem={(id, updates) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    group: prev.group.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                  }),
                  "KPI (Group)",
                )
              }
              onDeleteItem={(id) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    group: prev.group.filter((i) => i.id !== id),
                  }),
                  "KPI (Group)",
                )
              }
              onRenameSection={(oldSec, newSec) =>
                persistFormats(
                  (prev) => ({ ...prev, group: renameKpiSection(prev.group, oldSec, newSec, false) }),
                  "KPI (Group) — Urutan Section",
                )
              }
              onUpdateSectionMeta={(sec, patch) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    group: prev.group.map((i) =>
                      i.section !== sec
                        ? i
                        : {
                            ...i,
                            sectionLabel: patch.sectionLabel !== undefined ? patch.sectionLabel : (i.sectionLabel || resolveKpiSectionLabel(i)),
                            sectionBobot: patch.sectionBobot !== undefined ? patch.sectionBobot : i.sectionBobot,
                          },
                    ),
                  }),
                  "KPI (Group) — Section Meta",
                )
              }
              onAddClick={() => setShowAddModalFor("kpi-group")}
              onExport={() => handleExportFormat("kpi-group")}
              onImport={(file) => handleImportFormat("kpi-group", file)}
              sectionCascadeMap={formats.sectionCascadeGroup ?? {}}
              onSectionCascadeChange={(sec, val) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    sectionCascadeGroup: { ...(prev.sectionCascadeGroup ?? {}), [sec]: val },
                  }),
                  "KPI (Group) Cascade",
                )
              }
            />
          )}

          {/* Sub-tab 2: KPI (Unit) — disalin dari /kpi/corporate-unit */}
          {activeSubTab === "kpi-unit" && (
            <CorporateKPITable
              items={formats.unit}
              onUpdateItem={(id, updates) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    unit: prev.unit.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                  }),
                  "KPI (Unit)",
                )
              }
              onDeleteItem={(id) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    unit: prev.unit.filter((i) => i.id !== id),
                  }),
                  "KPI (Unit)",
                )
              }
              onRenameSection={(oldSec, newSec) =>
                persistFormats(
                  (prev) => ({ ...prev, unit: renameKpiSection(prev.unit, oldSec, newSec, false) }),
                  "KPI (Unit) — Urutan Section",
                )
              }
              onUpdateSectionMeta={(sec, patch) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    unit: prev.unit.map((i) =>
                      i.section !== sec
                        ? i
                        : {
                            ...i,
                            sectionLabel: patch.sectionLabel !== undefined ? patch.sectionLabel : (i.sectionLabel || resolveKpiSectionLabel(i)),
                            sectionBobot: patch.sectionBobot !== undefined ? patch.sectionBobot : i.sectionBobot,
                          },
                    ),
                  }),
                  "KPI (Unit) — Section Meta",
                )
              }
              onAddClick={() => setShowAddModalFor("kpi-unit")}
              onExport={() => handleExportFormat("kpi-unit")}
              onImport={(file) => handleImportFormat("kpi-unit", file)}
              sectionCascadeMap={formats.sectionCascadeUnit ?? {}}
              onSectionCascadeChange={(sec, val) =>
                persistFormats(
                  (prev) => ({
                    ...prev,
                    sectionCascadeUnit: { ...(prev.sectionCascadeUnit ?? {}), [sec]: val },
                  }),
                  "KPI (Unit) Cascade",
                )
              }
            />
          )}

          {/* Sub-tab 3: KPI (Personal) — disalin dari /kpi/personal */}
          {activeSubTab === "kpi-personal" && (
            <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {personalPreviewMode ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      <Eye className="w-3.5 h-3.5" /> Preview Mode
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] bg-[#1A284F]/5 border border-[#1A284F]/15 px-2.5 py-1 rounded-full">
                      <Edit3 className="w-3.5 h-3.5" /> Edit Mode
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {!personalPreviewMode && (
                    <button
                      type="button"
                      onClick={() => setShowAddModalFor("kpi-personal")}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add KPI
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPersonalPreviewMode((p) => !p)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      personalPreviewMode
                        ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        : "bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {personalPreviewMode ? "Back to Edit" : "Preview"}
                  </button>
                  <ExportImportButton
                    onExport={() => handleExportFormat("kpi-personal")}
                    onImport={(file) => handleImportFormat("kpi-personal", file)}
                    size="sm"
                  />
                </div>
              </div>
              <div className="p-0">
                <KPISettingTable
                  items={formats.personal}
                  editable={!personalPreviewMode}
                  hideCascading={true}
                  onUpdateItem={(id, updates) =>
                    persistFormats(
                      (prev) => ({
                        ...prev,
                        personal: prev.personal.map((i) => (i.id === id ? { ...i, ...updates } : i)),
                      }),
                      "KPI (Personal)",
                    )
                  }
                  onDelete={(id) =>
                    persistFormats(
                      (prev) => ({
                        ...prev,
                        personal: prev.personal.filter((i) => i.id !== id),
                      }),
                      "KPI (Personal)",
                    )
                  }
                  onRenameSection={(oldSec, newSec) =>
                    persistFormats(
                      (prev) => ({ ...prev, personal: renameKpiSection(prev.personal, oldSec, newSec, true) }),
                      "KPI (Personal) — Urutan Section",
                    )
                  }
                  onUpdateSectionMeta={(sec, patch) =>
                    persistFormats(
                      (prev) => ({
                        ...prev,
                        personal: prev.personal.map((i) =>
                          i.section !== sec
                            ? i
                            : {
                                ...i,
                                sectionLabel: patch.sectionLabel !== undefined ? patch.sectionLabel : (i.sectionLabel || resolvePersonalSectionLabel(i)),
                                sectionBobot: patch.sectionBobot !== undefined ? patch.sectionBobot : i.sectionBobot,
                              },
                        ),
                      }),
                      "KPI (Personal) — Section Meta",
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* Add New KPI Modals untuk ketiga format (otomatis insert Keterangan ke kolom Keterangan setelah Detail Formula) */}
          {showAddModalFor === "kpi-group" && (
            <AddCorporateKPIModal
              sectionLabel="KPI (Group)"
              existingItems={formats.group}
              onAdd={(newItem) => {
                persistFormats(
                  (prev) => ({ ...prev, group: [...prev.group, newItem] }),
                  "KPI (Group) — Add KPI",
                );
                toast.success(`KPI No. ${newItem.no} berhasil ditambahkan ke Master KPI (Group).`);
              }}
              onClose={() => setShowAddModalFor(null)}
            />
          )}
          {showAddModalFor === "kpi-unit" && (
            <AddCorporateKPIModal
              sectionLabel="KPI (Unit)"
              existingItems={formats.unit}
              onAdd={(newItem) => {
                persistFormats(
                  (prev) => ({ ...prev, unit: [...prev.unit, newItem] }),
                  "KPI (Unit) — Add KPI",
                );
                toast.success(`KPI No. ${newItem.no} berhasil ditambahkan ke Master KPI (Unit).`);
              }}
              onClose={() => setShowAddModalFor(null)}
            />
          )}
          {showAddModalFor === "kpi-personal" && (
            <AddKPIModal
              existingItems={formats.personal}
              hideCascading={true}
              onAdd={(newItem) => {
                persistFormats(
                  (prev) => ({ ...prev, personal: [...prev.personal, newItem] }),
                  "KPI (Personal) — Add KPI",
                );
                toast.success(`KPI No. ${newItem.no} berhasil ditambahkan ke Master KPI (Personal).`);
              }}
              onClose={() => setShowAddModalFor(null)}
            />
          )}
        </div>
      )}

      {/* ══ TAB 2: EXECUTIVE SUMMARY (KPI Business: RSUP Group & Unit Usaha) ══ */}
      {activeMainTab === "executive-summary" && canViewExecutiveSummary && (
        <MasterExecutiveSummaryTab canEdit={canEditMasterKpi} />
      )}

      {/* ══ TAB 2: KPI VARIABLE (Sinkron penuh dengan Add New KPI Modal: Tab Section & Tab Sub Section) ══ */}
      {activeMainTab === "kpi-variable" && (
        <div className="space-y-6">
          {/* Kelompok 1: Variabel Tab Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#1A284F] text-white flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1A284F]">
                  Variabel Tab Section (Add New KPI Modal)
                </h2>
                <p className="text-xs text-gray-500">
                  Perubahan pada kartu di bawah ini langsung memperbarui pilihan pada tab Section di modal Add New KPI (/setting/kpi &amp; KPI Format)
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {sectionGroupCards.map((cfg) => (
                <SectionCard
                  key={cfg.key}
                  cfg={cfg}
                  items={data[cfg.key] ?? []}
                  onChange={(items) => updateSection(cfg.key, items)}
                />
              ))}
            </div>
          </div>

          {/* Kelompok 2: Variabel Tab Sub Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1A284F]">
                  Variabel Tab Sub Section (Add New KPI Modal)
                </h2>
                <p className="text-xs text-gray-500">
                  Perubahan pada kartu di bawah ini langsung memperbarui pilihan field pada tab Sub Section di modal Add New KPI (/setting/kpi &amp; KPI Format)
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {subSectionGroupCards.map((cfg) => (
                <SectionCard
                  key={cfg.key}
                  cfg={cfg}
                  items={data[cfg.key] ?? []}
                  onChange={(items) => updateSection(cfg.key, items)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
