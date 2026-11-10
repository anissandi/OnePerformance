import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, RotateCcw } from "lucide-react";
import { MS_ITEMS, MSItem, loadMasterMSItems, saveMasterMSItems } from "../../supervisor/ManagerialSkillCheckIn";

const PERCENTAGE = 20;

// ─── Deep-clone helper ────────────────────────────────────────────────────────

function cloneItems(src: MSItem[]): MSItem[] {
  return src.map((item) => ({
    ...item,
    indicators: item.indicators.map((ind) => ({ ...ind })),
  }));
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  item,
  onSave,
  onClose,
}: {
  item: MSItem;
  onSave: (updated: MSItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MSItem>({
    ...item,
    indicators: item.indicators.map((i) => ({ ...i })),
  });

  const updateIndicator = (score: number, text: string) =>
    setDraft((prev) => ({
      ...prev,
      indicators: prev.indicators.map((ind) => ind.score === score ? { ...ind, text } : ind),
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Managerial Skill · No. {item.no}</p>
            <h3 className="text-base font-bold text-[#1A284F] mt-0.5">Edit Item</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Label</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]"
              placeholder="e.g. Kepemimpinan:"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none leading-relaxed"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Indicator Texts (Nilai 1–5)</label>
            {draft.indicators.map((ind) => (
              <div key={ind.score} className="flex gap-3 items-start">
                <span className="w-8 h-8 rounded-full bg-[#1A284F] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-1">
                  {ind.score}
                </span>
                <textarea
                  value={ind.text}
                  onChange={(e) => updateIndicator(ind.score, e.target.value)}
                  rows={2}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({
  nextNo,
  onAdd,
  onClose,
}: {
  nextNo: number;
  onAdd: (item: MSItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MSItem>({
    no: nextNo,
    label: "",
    description: "",
    indicators: [1, 2, 3, 4, 5].map((s) => ({ score: s as any, label: `Nilai ${s}`, text: "" })),
  });

  const updateIndicator = (score: number, text: string) =>
    setDraft((prev) => ({
      ...prev,
      indicators: prev.indicators.map((ind) => ind.score === score ? { ...ind, text } : ind),
    }));

  const isValid = draft.description.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Managerial Skill · New Item</p>
            <h3 className="text-base font-bold text-[#1A284F] mt-0.5">Add Item</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Label</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]"
              placeholder="e.g. Kepemimpinan:"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Description *</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
              rows={3}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none leading-relaxed"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Indicator Texts (Nilai 1–5)</label>
            {draft.indicators.map((ind) => (
              <div key={ind.score} className="flex gap-3 items-start">
                <span className="w-8 h-8 rounded-full bg-[#1A284F] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-1">{ind.score}</span>
                <textarea
                  value={ind.text}
                  onChange={(e) => updateIndicator(ind.score, e.target.value)}
                  rows={2}
                  className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none leading-relaxed"
                  placeholder={`Nilai ${ind.score} description…`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={() => { onAdd(draft); onClose(); }}
            disabled={!isValid}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MasterManagerialSkill() {
  const [items, setItems] = useState<MSItem[]>(() => cloneItems(loadMasterMSItems()));
  const [editItem, setEditItem] = useState<MSItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onHydrated = () => setItems(cloneItems(loadMasterMSItems()));
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const updateItem = (updated: MSItem) => {
    setSaved(false);
    setItems((prev) => prev.map((it) => (it.no === updated.no ? updated : it)));
  };

  const deleteItem = (no: number) => {
    setSaved(false);
    setItems((prev) => prev.filter((it) => it.no !== no).map((it, i) => ({ ...it, no: i + 1 })));
  };

  const addItem = (item: MSItem) => {
    setSaved(false);
    setItems((prev) => [...prev, { ...item, no: prev.length + 1 }]);
  };

  const resetToDefault = () => {
    const defaults = cloneItems(MS_ITEMS);
    setItems(defaults);
    saveMasterMSItems(defaults);
    setSaved(false);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#1A284F] mb-1">Master — Managerial Skill</h1>
          <p className="text-sm text-gray-500">Kelola kriteria & indikator penilaian Kepemimpinan dan Keterampilan Manajerial</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetToDefault}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Default
          </button>
          <button
            onClick={() => {
              saveMasterMSItems(items);
              setSaved(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
          >
            <Save className="w-4 h-4" />
            {saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between bg-[#1A284F] text-white px-5 py-3 rounded-lg">
        <span className="text-sm font-bold tracking-wide">KEPEMIMPINAN DAN KETERAMPILAN MANAJERIAL (MANAGERIAL SKILLS)</span>
        <span className="text-xs font-semibold bg-[#C69A45] text-white px-3 py-1 rounded">
          ({PERCENTAGE}%) Nilai Total
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-12">No</th>
              <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">
                Kepemimpinan dan Keterampilan Manajerial (Managerial Skills)
              </th>
              <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-48">Indikator Penilaian</th>
              <th className="py-3 px-4 text-center font-semibold text-gray-700 w-28">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.no} className="hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-4 text-gray-500 align-top border-r border-gray-100">{item.no}</td>
                <td className="py-4 px-4 align-top border-r border-gray-100 leading-relaxed text-gray-800">
                  <span className="font-bold italic">{item.label} </span>
                  {item.description}
                </td>
                <td className="py-4 px-4 align-middle border-r border-gray-100 text-center">
                  <button
                    onClick={() => setEditItem(item)}
                    className="text-xs font-medium px-3 py-1.5 border border-[#1A284F]/30 text-[#1A284F] rounded hover:bg-[#1A284F]/5 transition-colors whitespace-nowrap"
                  >
                    Edit Indikator
                  </button>
                </td>
                <td className="py-4 px-4 align-middle text-center">
                  <button
                    onClick={() => deleteItem(item.no)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}

            {/* Add row */}
            <tr>
              <td colSpan={4} className="py-3 px-4">
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 text-xs font-semibold text-[#1A284F] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Item
                </button>
              </td>
            </tr>

            {/* Total row */}
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={3} className="py-3 px-4 text-sm font-bold text-gray-800 text-right border-r border-gray-200">
                ({PERCENTAGE}%) Total Items: {items.length}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {editItem && (
        <EditModal item={editItem} onSave={updateItem} onClose={() => setEditItem(null)} />
      )}
      {showAdd && (
        <AddItemModal nextNo={items.length + 1} onAdd={addItem} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
