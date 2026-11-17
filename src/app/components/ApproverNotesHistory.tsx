import React from "react";
import { MessageSquare, ChevronDown } from "lucide-react";
import {
  getApproverNotesHistory,
  KPI_MONTH_LABELS_2026,
  type WorkflowLogStage,
  type WorkflowRecord,
} from "../pages/shared/appraisalWorkflowStore";

const STAGE_TAG: Record<WorkflowLogStage, string> = {
  checker: "bg-sky-50 text-sky-700 border-sky-200",
  approver1: "bg-indigo-50 text-indigo-700 border-indigo-200",
  approver2: "bg-violet-50 text-violet-700 border-violet-200",
  validator: "bg-teal-50 text-teal-700 border-teal-200",
};

function statusTone(status: string): string {
  if (/revision/i.test(status)) return "bg-orange-50 text-orange-700 border-orange-200";
  if (/reject|cancel/i.test(status)) return "bg-red-50 text-red-700 border-red-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

interface Props {
  employeeId: string;
  module: string;
  phase: WorkflowRecord["phase"];
  title?: string;
  /** Tampilkan tag & filter per bulan (KPI Tracking). */
  monthly?: boolean;
  defaultOpen?: boolean;
}

/**
 * Riwayat catatan dari Checker, Approver 1, Approver 2, dan Validator milik satu karyawan
 * (diambil dari workflow record karyawan tersebut sehingga tidak bercampur dengan karyawan lain).
 */
export function ApproverNotesHistory({
  employeeId,
  module,
  phase,
  title = "Catatan dari Approver",
  monthly = false,
  defaultOpen = true,
}: Props) {
  const [tick, setTick] = React.useState(0);
  const [open, setOpen] = React.useState(defaultOpen);
  const [monthFilter, setMonthFilter] = React.useState<string>("all");

  React.useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  void tick;
  const rawEntries = employeeId ? getApproverNotesHistory(employeeId, module, phase) : [];
  // Tahap Checker & Validator tidak memiliki field komentar penilaian biasa;
  // hanya ditampilkan pada Catatan dari Approver apabila keputusannya berupa Revision (revisi).
  const entries = rawEntries.filter((e) => {
    if (e.stage === "checker" || e.stage === "validator") {
      return /revision/i.test(e.status);
    }
    return true;
  });
  const monthsWithEntries = monthly
    ? KPI_MONTH_LABELS_2026.filter((m) => entries.some((e) => e.months?.includes(m)))
    : [];
  const visible =
    monthly && monthFilter !== "all" ? entries.filter((e) => e.months?.includes(monthFilter)) : entries;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-[#1e3a5f] text-white"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare size={15} />
          {title}
          <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium">
            {entries.length}
          </span>
        </span>
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-4 space-y-3">
          {monthly && monthsWithEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {["all", ...monthsWithEntries].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonthFilter(m)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    monthFilter === m
                      ? "bg-[#1e3a5f] text-white border-[#1e3a5f]"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {m === "all" ? "Semua Bulan" : m}
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Belum ada catatan dari approver.</p>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((e, i) => (
                <li key={`${e.stage}-${e.ts ?? i}-${i}`} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STAGE_TAG[e.stage]}`}>
                      {e.stageLabel}
                    </span>
                    {monthly &&
                      (e.months ?? []).map((m) => (
                        <span key={m} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {m}
                        </span>
                      ))}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusTone(e.status)}`}>
                      {e.status}
                    </span>
                    <span className="ml-auto text-[11px] text-gray-400">{e.date}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-gray-700">{e.approverName || "—"}</p>
                  <p className={`mt-0.5 text-sm ${e.note ? "text-gray-800" : "italic text-gray-400"}`}>
                    {e.note || "Tanpa catatan"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default ApproverNotesHistory;
