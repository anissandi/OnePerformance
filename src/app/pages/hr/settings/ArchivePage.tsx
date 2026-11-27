import React, { useEffect, useMemo, useState } from "react";
import { Archive, Eye, RotateCcw, Search, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  ARCHIVE_UPDATED_EVENT,
  EOY_ARCHIVE_REASON,
  loadArchivedUsers,
  permanentlyDeleteArchivedUser,
  restoreArchivedUser,
  type ArchivedUserRecord,
} from "../../../store/archiveStore";
import { useAuthStore } from "../../../store/authStore";
import { normalizeDateDDMMYYYY } from "../../../utils/dateFormat";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return normalizeDateDDMMYYYY(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

type ConfirmState = { kind: "restore" | "delete"; record: ArchivedUserRecord } | null;

export function ArchivePage() {
  const { lockedUnits } = useAuthStore();
  const [records, setRecords] = useState<ArchivedUserRecord[]>(() => loadArchivedUsers());
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "verification" | "eoy">("all");
  const [viewing, setViewing] = useState<ArchivedUserRecord | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  useEffect(() => {
    const refresh = () => setRecords(loadArchivedUsers());
    window.addEventListener(ARCHIVE_UPDATED_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener(ARCHIVE_UPDATED_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => !lockedUnits || lockedUnits.length === 0 || lockedUnits.includes(r.user.company))
      .filter((r) => sourceFilter === "all" || r.source === sourceFilter)
      .filter(
        (r) =>
          !q ||
          [r.user.employeeId, r.user.name, r.user.regNo, r.user.company, r.user.division, r.user.department, r.reason]
            .some((v) => String(v ?? "").toLowerCase().includes(q)),
      )
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  }, [records, search, sourceFilter, lockedUnits]);

  const handleConfirm = () => {
    if (!confirm) return;
    const { kind, record } = confirm;
    if (kind === "restore") {
      const restored = restoreArchivedUser(record.id);
      if (restored) toast.success(`${restored.name} berhasil di-restore beserta seluruh datanya.`);
    } else {
      if (permanentlyDeleteArchivedUser(record.id)) {
        toast.success(`${record.user.name} dihapus permanen beserta seluruh history PA & evidence.`);
      }
    }
    setConfirm(null);
    setRecords(loadArchivedUsers());
  };

  const th = "px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-white whitespace-nowrap";
  const td = "px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap";

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1A284F]/8 flex items-center justify-center text-[#1A284F]">
            <Archive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Archive</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Karyawan yang dihapus di User Management, dinonaktifkan pada Calibration Verification, atau tereliminasi pada Confirm Data HC Akhir Tahun.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-[#1A284F] bg-[#1A284F]/5 px-3 py-1.5 rounded-lg">
          {rows.length} karyawan diarsipkan
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-3 flex-wrap">
        <div className="relative w-80 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Reg No, ID, nama, unit, keterangan…"
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([
            ["all", "Semua"],
            ["manual", "Delete User Management"],
            ["verification", "Inactive Verification"],
            ["eoy", EOY_ARCHIVE_REASON],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSourceFilter(id)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                sourceFilter === id ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1A284F]">
                <th className={th}>No</th>
                <th className={th}>Aksi</th>
                <th className={th}>Reg No</th>
                <th className={th}>ID Karyawan</th>
                <th className={th}>Nama</th>
                <th className={th}>Unit</th>
                <th className={th}>Division</th>
                <th className={th}>Department</th>
                <th className={th}>Bagian</th>
                <th className={th}>Jabatan</th>
                <th className={th}>Tgl Arsip</th>
                <th className={th}>Keterangan Arsip</th>
                <th className={th}>Arsip By</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-xs text-gray-400">
                    Belum ada karyawan yang diarsipkan.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className={`${td} text-gray-400`}>{i + 1}</td>
                    <td className={td}>
                      <div className="flex items-center gap-1">
                        <button title="Lihat" onClick={() => setViewing(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button title="Restore" onClick={() => setConfirm({ kind: "restore", record: r })} className="p-1.5 rounded-lg text-gray-500 hover:bg-emerald-50 hover:text-emerald-600">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button title="Hapus Permanen" onClick={() => setConfirm({ kind: "delete", record: r })} className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    <td className={td}>{r.user.regNo || "—"}</td>
                    <td className={`${td} font-mono`}>{r.user.employeeId}</td>
                    <td className={`${td} font-semibold text-gray-800`}>{r.user.name}</td>
                    <td className={td}>{r.user.company || "—"}</td>
                    <td className={td}>{r.user.division || "—"}</td>
                    <td className={td}>{r.user.department || "—"}</td>
                    <td className={td}>{r.user.bagian || "—"}</td>
                    <td className={td}>{r.user.position || "—"}</td>
                    <td className={td}>{fmtDate(r.archivedAt)}</td>
                    <td className={`${td} max-w-[240px] truncate`} title={r.reason}>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        r.source === "eoy"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : r.source === "verification"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-gray-200 bg-gray-50 text-gray-600"
                      }`}>
                        {r.reason}
                      </span>
                    </td>
                    <td className={td}>{r.archivedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setViewing(null)}>
          <div className="h-full w-full max-w-md bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-[#1A284F]">{viewing.user.name}</h3>
                <p className="text-xs text-gray-400">{viewing.user.employeeId} · {viewing.user.position}</p>
              </div>
              <button onClick={() => setViewing(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-2 text-xs">
              {[
                ["Reg No", viewing.user.regNo],
                ["ID Karyawan", viewing.user.employeeId],
                ["Unit", viewing.user.company],
                ["Division", viewing.user.division],
                ["Department", viewing.user.department],
                ["Bagian", viewing.user.bagian],
                ["Jabatan", viewing.user.position],
                ["Role", viewing.user.role],
                ["Groupings", viewing.user.groupings],
                ["Corporate Email", viewing.user.email],
                ["Reg No AP1", viewing.user.regNoAp1],
                ["Reg No AP2", viewing.user.regNoAp2],
                ["Tgl Arsip", fmtDate(viewing.archivedAt)],
                ["Keterangan Arsip", viewing.reason],
                ["Arsip By", viewing.archivedBy],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-gray-50 pb-2">
                  <span className="text-gray-400">{k}</span>
                  <span className="font-semibold text-gray-800 text-right">{v || "—"}</span>
                </div>
              ))}
              <p className="pt-3 text-[11px] text-gray-500 leading-relaxed">
                Seluruh history PA & evidence karyawan ini tetap tersimpan selama berada di Archive. Karyawan tidak dapat login
                (pesan: "Karyawan tidak ditemukan") sampai di-restore.
              </p>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center" onClick={(e) => e.stopPropagation()}>
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${confirm.kind === "restore" ? "bg-emerald-50" : "bg-red-50"}`}>
              {confirm.kind === "restore" ? <RotateCcw className="h-7 w-7 text-emerald-600" /> : <AlertTriangle className="h-7 w-7 text-red-600" />}
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-2">
              {confirm.kind === "restore" ? "Restore Karyawan?" : "Hapus Permanen?"}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {confirm.kind === "restore" ? (
                <>
                  <strong>{confirm.record.user.name}</strong> akan dikembalikan ke User Management beserta seluruh data PA, dan dapat login kembali.
                </>
              ) : (
                <>
                  Seluruh history PA dan evidence milik <strong>{confirm.record.user.name}</strong> akan dihapus permanen dan tidak dapat dipulihkan.
                </>
              )}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Batal
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold text-white ${confirm.kind === "restore" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {confirm.kind === "restore" ? "Restore" : "Hapus Permanen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ArchivePage;
