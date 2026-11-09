import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Save, Check } from "lucide-react";
import { loadMasterKpi, saveMasterKpi } from "./masterKpiStore";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterItem { id: number; value: string; description?: string }

interface SectionConfig {
  key: string;
  label: string;
  color: string;           // tailwind bg for header dot
  hasDescription: boolean; // whether items have a description field
  descLabel?: string;
}

// ─── Section definitions ──────────────────────────────────────────────────────

const SECTIONS: SectionConfig[] = [
  { key: "scope",           label: "Scope",           color: "bg-blue-500",    hasDescription: false },
  { key: "section",         label: "Section",         color: "bg-purple-500",  hasDescription: false },
  { key: "perspektif",      label: "Perspektif",      color: "bg-teal-500",    hasDescription: false },
  { key: "satuan",          label: "Satuan",          color: "bg-orange-500",  hasDescription: false },
  { key: "period",          label: "Period",          color: "bg-rose-500",    hasDescription: false },
  { key: "trackingPeriod",  label: "Tracking Period", color: "bg-indigo-500",  hasDescription: false },
  { key: "cascading",       label: "Cascading",       color: "bg-emerald-500", hasDescription: true, descLabel: "Role Name" },
];

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_DATA: Record<string, MasterItem[]> = {
  scope: [
    { id: 1, value: "RMD" },
    { id: 2, value: "MPD" },
    { id: 3, value: "WCC" },
    { id: 4, value: "PT RSUP (Industry)" },
    { id: 5, value: "PT RSUP (Perkebunan)" },
    { id: 6, value: "PT RSTM" },
    { id: 7, value: "PT GHS" },
    { id: 8, value: "ASD" },
    { id: 9, value: "PT Pulau Sambu (Jakarta)" },
    { id: 10, value: "PT Pulau Sambu (Guntung)" },
    { id: 11, value: "PT Pulau Sambu (Kuala Enok)" },
  ],
  section: [
    { id: 1, value: "Kinerja K3L Terintegrasi (SMK3/HSE)" },
    { id: 2, value: "Finansial" },
    { id: 3, value: "Produksi" },
    { id: 4, value: "Be Employer of Choices" },
    { id: 5, value: "Be Partner of Choices" },
    { id: 6, value: "Regulatory Compliance" },
  ],
  perspektif: [
    { id: 1, value: "Proses" },
    { id: 2, value: "Finansial" },
    { id: 3, value: "Learning & Growth" },
    { id: 4, value: "Customer" },
  ],
  satuan: [
    { id: 1, value: "%" },
    { id: 2, value: "Temuan" },
    { id: 3, value: "Hari" },
    { id: 4, value: "Kasus" },
    { id: 5, value: "Rp Juta" },
    { id: 6, value: "Rp Miliar" },
    { id: 7, value: "Jumlah" },
  ],
  period: [
    { id: 1, value: "Hari" },
    { id: 2, value: "Bulan" },
    { id: 3, value: "Semester" },
    { id: 4, value: "Triwulan" },
    { id: 5, value: "Quarter" },
    { id: 6, value: "Tahun" },
  ],
  trackingPeriod: [
    { id: 1, value: "Bulanan" },
    { id: 2, value: "Semester" },
    { id: 3, value: "Triwulan" },
    { id: 4, value: "Quarter" },
    { id: 5, value: "Tahunan" },
  ],
  cascading: [
    { id: 1,  value: "COO",            description: "COO"            },
    { id: 2,  value: "GM Industry",    description: "GM Industry"    },
    { id: 3,  value: "VGM Industry",   description: "VGM Industry"   },
    { id: 4,  value: "GM Perkebunan",  description: "GM Perkebunan"  },
    { id: 5,  value: "VGM Perkebunan", description: "VGM Perkebunan" },
    { id: 6,  value: "GM ASD",         description: "GM ASD"         },
    { id: 7,  value: "GM RSTM",        description: "GM RSTM"        },
    { id: 8,  value: "GM GHS",         description: "GM GHS"         },
    { id: 9,  value: "GM PSG",         description: "GM PSG"         },
    { id: 10, value: "GM PSKE",        description: "GM PSKE"        },
    { id: 11, value: "VGM PSG",        description: "VGM PSG"        },
    { id: 12, value: "VGM PSKE",       description: "VGM PSKE"       },
  ],
};

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({
  title,
  item,
  hasDescription,
  descLabel,
  onSave,
  onClose,
}: {
  title: string;
  item?: MasterItem;
  hasDescription: boolean;
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
              {hasDescription ? "Code / Abbreviation" : "Value"}
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
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
          <span className="text-sm font-bold text-[#1A284F]">{cfg.label}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{items.length}</span>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50">
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
  const [data, setData] = useState<Record<string, MasterItem[]>>(DEFAULT_DATA);

  // Sync to shared store whenever data changes so KPISetting can read it
  useEffect(() => {
    const toStrings = (arr: MasterItem[]) => arr.map(i => i.value);
    const toCascading = (arr: MasterItem[]) =>
      arr.map(i => ({ value: i.value, description: i.description ?? "" }));
    saveMasterKpi({
      scope:          toStrings(data.scope ?? []),
      section:        toStrings(data.section ?? []),
      perspektif:     toStrings(data.perspektif ?? []),
      satuan:         toStrings(data.satuan ?? []),
      period:         toStrings(data.period ?? []),
      trackingPeriod: toStrings(data.trackingPeriod ?? []),
      cascading:      toCascading(data.cascading ?? []),
    });
  }, [data]);

  // Hydrate from store on first mount
  useEffect(() => {
    const stored = loadMasterKpi();
    const fromStrings = (vals: string[], nextId: number): MasterItem[] =>
      vals.map((value, i) => ({ id: nextId + i, value }));
    const fromCascading = (items: { value: string; description: string }[]): MasterItem[] =>
      items.map((c, i) => ({ id: i + 1, value: c.value, description: c.description }));
    setData({
      scope:          fromStrings(stored.scope, 1),
      section:        fromStrings(stored.section, 1),
      perspektif:     fromStrings(stored.perspektif, 1),
      satuan:         fromStrings(stored.satuan, 1),
      period:         fromStrings(stored.period, 1),
      trackingPeriod: fromStrings(stored.trackingPeriod, 1),
      cascading:      fromCascading(stored.cascading),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSection(key: string, items: MasterItem[]) {
    setData(prev => ({ ...prev, [key]: items }));
  }

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">Master KPI</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage KPI master data — scope, section, perspektif, satuan, period, and cascading</p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span>
          <span>Setting</span><span className="mx-1">›</span>
          <span>Master</span><span className="mx-1">›</span>
          <span className="font-medium text-gray-700">KPI</span>
        </div>
      </div>

      {/* Grid of section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SECTIONS.map(cfg => (
          <SectionCard
            key={cfg.key}
            cfg={cfg}
            items={data[cfg.key] ?? []}
            onChange={items => updateSection(cfg.key, items)}
          />
        ))}
      </div>
    </div>
  );
}
