import { useState } from "react";
import { RefreshCw, CheckSquare, Square, Database, CheckCircle2, AlertCircle, Clock } from "lucide-react";

type SyncItem = {
  id: string;
  label: string;
  description: string;
  lastSync: string | null;
  status: "idle" | "syncing" | "success" | "error";
};

const initialItems: SyncItem[] = [
  {
    id: "all",
    label: "All Data",
    description: "Sync semua data sekaligus (Absensi, Jumlah Karyawan, Pelanggaran, Kecelakaan Kerja)",
    lastSync: null,
    status: "idle",
  },
  {
    id: "absensi",
    label: "Data Summary Absensi",
    description: "Rekap data kehadiran dan ketidakhadiran karyawan",
    lastSync: null,
    status: "idle",
  },
  {
    id: "karyawan",
    label: "Data Jumlah Karyawan",
    description: "Total headcount dan distribusi karyawan per unit/divisi",
    lastSync: null,
    status: "idle",
  },
  {
    id: "pelanggaran",
    label: "Data Pelanggaran",
    description: "Catatan pelanggaran dan sanksi disiplin karyawan",
    lastSync: null,
    status: "idle",
  },
  {
    id: "kecelakaan-kerja",
    label: "Data Kecelakaan Kerja",
    description: "Catatan kejadian kecelakaan kerja karyawan",
    lastSync: null,
    status: "idle",
  },
];

function StatusBadge({ status }: { status: SyncItem["status"] }) {
  if (status === "idle")    return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3.5 h-3.5" />Not synced</span>;
  if (status === "syncing") return <span className="inline-flex items-center gap-1 text-xs text-blue-600 animate-pulse"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Menyinkron...</span>;
  if (status === "success") return <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />Berhasil</span>;
  return                           <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />Gagal</span>;
}

export function DataSyncPage() {
  const [items, setItems] = useState<SyncItem[]>(initialItems);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (id === "all") {
        // "All Data" toggles everything
        if (next.has("all")) {
          next.clear();
        } else {
          initialItems.forEach(i => next.add(i.id));
        }
      } else {
        if (next.has(id)) {
          next.delete(id);
          next.delete("all"); // uncheck All if a child is unchecked
        } else {
          next.add(id);
          // auto-check "All" if all children are checked
          const children = initialItems.filter(i => i.id !== "all").map(i => i.id);
          if (children.every(c => next.has(c))) next.add("all");
        }
      }
      return next;
    });
  };

  const handleSync = () => {
    if (checked.size === 0 || syncing) return;

    const targetIds = checked.has("all")
      ? initialItems.map(i => i.id)
      : [...checked];

    setSyncing(true);
    setItems(prev => prev.map(item =>
      targetIds.includes(item.id) ? { ...item, status: "syncing" } : item
    ));

    // Simulate staggered sync completion
    targetIds.forEach((id, i) => {
      setTimeout(() => {
        const _n = new Date(); const now = `${String(_n.getDate()).padStart(2,"0")}/${String(_n.getMonth()+1).padStart(2,"0")}/${_n.getFullYear()} ${String(_n.getHours()).padStart(2,"0")}:${String(_n.getMinutes()).padStart(2,"0")}`;
        setItems(prev => prev.map(item =>
          item.id === id ? { ...item, status: "success", lastSync: now } : item
        ));
        if (i === targetIds.length - 1) {
          setSyncing(false);
          setChecked(new Set());
        }
      }, 1200 * (i + 1));
    });
  };

  const anyChecked = checked.size > 0;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-[#1A284F]" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">Data Sync</h1>
          </div>
          <p className="text-gray-500 text-sm">Select the data you want to sync, then click the Sync button</p>
        </div>
        <button
          onClick={handleSync}
          disabled={!anyChecked || syncing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
            anyChecked && !syncing
              ? "bg-[#1A284F] text-white hover:bg-[#131d3b]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const isChecked = checked.has(item.id);
          const isSyncing = item.status === "syncing";
          const isAll = item.id === "all";

          return (
            <button
              key={item.id}
              onClick={() => !syncing && toggle(item.id)}
              disabled={syncing}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all ${
                isChecked
                  ? "border-[#1A284F] bg-[#1A284F]/5"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } ${syncing ? "cursor-not-allowed opacity-80" : "cursor-pointer"} ${
                isAll ? "shadow-sm" : ""
              }`}
            >
              {/* Checkbox icon */}
              <div className={`shrink-0 w-5 h-5 ${isChecked ? "text-[#1A284F]" : "text-gray-300"}`}>
                {isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isAll ? "text-[#1A284F]" : "text-gray-800"}`}>
                  {item.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              </div>

              {/* Status + last sync */}
              <div className="shrink-0 text-right flex flex-col items-end gap-1">
                <StatusBadge status={item.status} />
                {item.lastSync && (
                  <p className="text-[10px] text-gray-400">Terakhir: {item.lastSync}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          The sync process will fetch the latest data from the source system. Please ensure your network connection is stable before running a sync.
        </p>
      </div>
    </div>
  );
}
