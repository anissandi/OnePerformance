import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelPendingTransactions,
  listPendingTransactions,
  type PendingTransaction,
} from "../store/transactionCancelStore";

const SOURCE_TONE: Record<PendingTransaction["source"], string> = {
  workflow: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "kpi-business": "bg-sky-50 text-sky-700 border-sky-200",
  rca: "bg-amber-50 text-amber-700 border-amber-200",
  "calibration-soy": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

/** Modal fitur sementara (DEMO) Cancel Transaction — khusus Role Administrator. */
export function CancelTransactionModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PendingTransaction[]>(() => listPendingTransactions());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setRows(listPendingTransactions());
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.employeeId, r.employeeName, r.company, r.moduleLabel, r.status].some((v) => v.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runCancel = () => {
    const n = cancelPendingTransactions(Array.from(selected));
    setConfirmOpen(false);
    setSelected(new Set());
    setRows(listPendingTransactions());
    toast.success(`${n} transaksi pending berhasil dibatalkan dan dikembalikan ke status awal.`);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-rose-600" />
              <h3 className="text-base font-bold text-[#1A284F]">Cancel Transaction</h3>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                Fitur Sementara · Administrator
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Pilih transaksi yang masih pending untuk dibersihkan. Transaksi akan dikembalikan ke status awal
              (contoh: pengajuan approval menjadi Unsubmitted) dan tersinkron ke database.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari karyawan, modul, status..."
              className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs focus:border-[#1A284F] focus:outline-none"
            />
          </div>
          <span className="text-xs text-gray-500">
            {rows.length} transaksi pending · <strong className="text-[#1A284F]">{selected.size}</strong> dipilih
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-gray-500 shadow-[0_1px_0_#f1f5f9]">
              <tr>
                <th className="w-10 px-4 py-2.5 text-left">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-3.5 w-3.5 accent-[#1A284F]" aria-label="Pilih semua" />
                </th>
                <th className="px-3 py-2.5 text-left">Karyawan / Unit</th>
                <th className="px-3 py-2.5 text-left">Transaksi</th>
                <th className="px-3 py-2.5 text-left">Status Saat Ini</th>
                <th className="px-3 py-2.5 text-left">Tanggal</th>
                <th className="px-3 py-2.5 text-left">Kembali Ke</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    Tidak ada transaksi pending.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`cursor-pointer border-t border-gray-100 transition-colors ${selected.has(r.id) ? "bg-rose-50/60" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 accent-[#1A284F]"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-gray-800">{r.employeeName}</p>
                      <p className="text-[10px] text-gray-400">
                        {r.employeeId !== "—" ? `${r.employeeId} · ` : ""}
                        {r.company}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[r.source]}`}>
                        {r.moduleLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-amber-700">{r.status}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.submittedDate}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-700">{r.resetTo}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            Tutup
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => setConfirmOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Cancel {selected.size > 0 ? `${selected.size} ` : ""}Transaksi
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
            </div>
            <h4 className="text-center text-sm font-bold text-[#1A284F]">Konfirmasi Cancel Transaction</h4>
            <p className="mt-2 text-center text-xs text-gray-500">
              {selected.size} transaksi pending akan dibatalkan dan dikembalikan ke status awal. Karyawan terkait akan
              menerima notifikasi. Lanjutkan?
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                Batal
              </button>
              <button type="button" onClick={runCancel} className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-semibold text-white hover:bg-rose-700">
                Ya, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
