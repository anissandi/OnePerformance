import React, { useMemo, useState } from "react";
import { CheckCircle2, Copy, Layers, X } from "lucide-react";

/** Bentuk minimal baris KPI yang ditampilkan pada modal copy (kompatibel dengan KPISetting). */
export interface CopyableKpiRow {
  id: string;
  no: string;
  section: string;
  sectionLabel?: string;
  sectionBobot?: string;
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  scope?: string;
  bobot: string;
  baseline2025: string;
  target2026: string;
  polaritas: string;
  detailFormula: string;
  keterangan: string;
  trackingPeriod?: string;
  coo?: string;
  gmVgmIndustry?: string;
  gmVgmPerkebunan?: string;
  gmAsd?: string;
  gmRstm?: string;
  gmGhs?: string;
  cascadingMap?: Record<string, string>;
}

const SECTION_TONES = ["#1565C0", "#2E7D32", "#6A1B9A", "#EF6C00", "#00838F", "#AD1457", "#4E342E", "#283593"];

/**
 * Modal tabel sumber (KPI (Group) / KPI (Unit)) dengan kolom checkbox paling kiri.
 * Baris terpilih di-copy ke tabel tujuan setelah konfirmasi.
 */
export function CopyKpiFromSourceModal<T extends CopyableKpiRow>({
  sourceLabel,
  targetLabel,
  sourceItems,
  copiedSourceIds,
  resolveSectionLabel,
  canCopy,
  onCopy,
  onClose,
}: {
  sourceLabel: string;
  targetLabel: string;
  sourceItems: T[];
  copiedSourceIds: Set<string>;
  resolveSectionLabel: (item: T) => string;
  canCopy: boolean;
  onCopy: (rows: T[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sections = useMemo(
    () => Array.from(new Set(sourceItems.map((i) => i.section))).sort(),
    [sourceItems],
  );
  const allChecked = sourceItems.length > 0 && sourceItems.every((i) => selected.has(i.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSection = (sec: string) => {
    const ids = sourceItems.filter((i) => i.section === sec).map((i) => i.id);
    const all = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  };
  const selectedRows = sourceItems.filter((i) => selected.has(i.id));
  const showCascading = sourceLabel === "KPI (Group)";
  const th = "border border-[#1A284F]/25 px-2 py-2 text-center text-[11px] font-semibold whitespace-nowrap";
  const td = "border border-gray-200 px-2 py-1.5 align-top text-[11px] text-gray-700";
  const formatCascadingSummary = (r: T): string => {
    if (r.cascadingMap && Object.keys(r.cascadingMap).length > 0) {
      return Object.entries(r.cascadingMap)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ") || "—";
    }
    const pairs: Array<[string, string | undefined]> = [
      ["COO", r.coo],
      ["GM Ind", r.gmVgmIndustry],
      ["GM Pkb", r.gmVgmPerkebunan],
      ["GM ASD", r.gmAsd],
      ["GM RSTM", r.gmRstm],
      ["GM GHS", r.gmGhs],
    ];
    const active = pairs.filter(([, v]) => Boolean(v)).map(([k, v]) => `${k}: ${v}`);
    return active.length > 0 ? active.join(", ") : "—";
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-8" onClick={onClose}>
      <div className="flex w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/80 via-white to-sky-50/70 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-600" />
              <h3 className="text-base font-bold text-[#1A284F]">Tabel {sourceLabel}</h3>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                {sourceItems.length} KPI
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Centang baris KPI yang ingin di-copy ke <strong>{targetLabel}</strong>. Kolom yang tidak tersedia pada format tujuan akan dikosongkan.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[62vh] overflow-auto p-5">
          {sourceItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
              Belum ada data pada {sourceLabel}.
            </div>
          ) : (
            <table className="w-full border-collapse" style={{ minWidth: 1500 }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#1A284F] text-white">
                  <th className={`${th} w-10`}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(sourceItems.map((i) => i.id)))}
                      className="h-3.5 w-3.5 accent-violet-600"
                      aria-label="Pilih semua"
                    />
                  </th>
                  {["No", "Perspektif", "KPI", "Satuan", "Formula Setahun", "Scope", "Bobot", "Baseline 2025", "Target 2026", "Polaritas", "Detail Formula", "Keterangan", "Periode Tracking", ...(showCascading ? ["CASCADING (FC; PC; CC)"] : [])].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((sec, si) => {
                  const rows = sourceItems.filter((i) => i.section === sec);
                  const tone = SECTION_TONES[si % SECTION_TONES.length];
                  const secAll = rows.every((r) => selected.has(r.id));
                  return (
                    <React.Fragment key={sec}>
                      <tr>
                        <td colSpan={showCascading ? 15 : 14} className="border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: tone, borderColor: tone }}>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={secAll} onChange={() => toggleSection(sec)} className="h-3.5 w-3.5 accent-white" />
                            {sec}. {resolveSectionLabel(rows[0])}
                            {rows[0]?.sectionBobot && <span className="font-normal normal-case opacity-80">— Bobot {rows[0].sectionBobot}</span>}
                          </label>
                        </td>
                      </tr>
                      {rows.map((r, ri) => {
                        const isSel = selected.has(r.id);
                        const copied = copiedSourceIds.has(r.id);
                        return (
                          <tr
                            key={r.id}
                            onClick={() => toggle(r.id)}
                            className={`cursor-pointer transition-colors ${isSel ? "bg-violet-50" : ri % 2 ? "bg-gray-50/40" : "bg-white"} hover:bg-violet-50/60`}
                          >
                            <td className={`${td} text-center`}>
                              <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5 accent-violet-600" />
                            </td>
                            <td className={`${td} text-center font-semibold`}>{r.no}</td>
                            <td className={td}>{r.perspektif || "—"}</td>
                            <td className={`${td} min-w-[240px] font-medium text-gray-800`}>
                              <span className="whitespace-pre-line">{r.kpi || "—"}</span>
                              {copied && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Sudah di-copy
                                </span>
                              )}
                            </td>
                            <td className={td}>{r.satuan || "—"}</td>
                            <td className={td}>{r.formula || "—"}</td>
                            <td className={td}>{r.scope || "—"}</td>
                            <td className={`${td} text-center font-semibold text-[#1A284F]`}>{r.bobot || "—"}</td>
                            <td className={`${td} text-center`}>{r.baseline2025 || "—"}</td>
                            <td className={`${td} text-center font-bold text-[#1A284F]`}>{r.target2026 || "—"}</td>
                            <td className={`${td} text-center`}>{r.polaritas || "—"}</td>
                            <td className={`${td} min-w-[200px] whitespace-pre-line`}>{r.detailFormula || "—"}</td>
                            <td className={`${td} min-w-[160px] whitespace-pre-line`}>{r.keterangan || "—"}</td>
                            <td className={`${td} text-center`}>{r.trackingPeriod || "—"}</td>
                            {showCascading && (
                              <td className={`${td} min-w-[180px] text-[10px] font-medium text-indigo-700`}>
                                {formatCascadingSummary(r)}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-3">
          <span className="text-xs text-gray-500">
            <strong className="text-violet-700">{selectedRows.length}</strong> baris dipilih
            {!canCopy && <span className="ml-2 text-amber-600">· Tabel tujuan sedang terkunci (sudah disubmit / tidak memiliki akses tambah).</span>}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              Tutup
            </button>
            <button
              type="button"
              disabled={!canCopy || selectedRows.length === 0}
              onClick={() => setConfirmOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" /> Copy {selectedRows.length > 0 ? `${selectedRows.length} ` : ""}ke {targetLabel}
            </button>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
              <Copy className="h-5 w-5 text-violet-600" />
            </div>
            <h4 className="text-sm font-bold text-[#1A284F]">Konfirmasi Copy KPI</h4>
            <p className="mt-2 text-xs text-gray-500">
              {selectedRows.length} baris KPI dari {sourceLabel} akan di-copy ke {targetLabel}. Setelah di-copy, setiap baris dapat diedit atau dihapus. Lanjutkan?
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onCopy(selectedRows);
                  setConfirmOpen(false);
                  onClose();
                }}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-700"
              >
                Ya, Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
