import {
  getKpiMonthStatuses,
  loadWorkflowRecords,
  normalizeEmployeeId,
  readTrackedKpiMonthLabels,
  type KpiMonthState,
} from "../pages/shared/appraisalWorkflowStore";

export type KpiMonthVisualState = KpiMonthState | "draft";

export interface KpiMonthVisual {
  label: string;
  state: KpiMonthVisualState;
  /** Tahap approval berjalan untuk bulan yang sedang diajukan (mis. "Approver 1") */
  stage?: string;
}

const MONTH_NAME_ID: Record<string, string> = {
  Jan: "Januari", Feb: "Februari", Mar: "Maret", Apr: "April", May: "Mei", Jun: "Juni",
  Jul: "Juli", Aug: "Agustus", Sep: "September", Oct: "Oktober", Nov: "November", Dec: "Desember",
};

export function monthNameId(label: string): string {
  return MONTH_NAME_ID[label.slice(0, 3)] ?? label;
}

/** Status per bulan KPI Tracking (Jan–Des) + tahap approval yang sedang berjalan. */
export function getKpiMonthVisuals(employeeId: string): KpiMonthVisual[] {
  const tracked = new Set(readTrackedKpiMonthLabels(employeeId));
  const normId = normalizeEmployeeId(employeeId);
  const rec = loadWorkflowRecords().find(
    (r) => r.module === "KPI" && r.phase === "measurement" && normalizeEmployeeId(r.employeeId) === normId,
  );
  let stage: string | undefined;
  if (rec) {
    const d = rec.decisions;
    const ok = (s?: string) => Boolean(s && s !== "Revision");
    if (!ok(d.checker?.status)) stage = "Check";
    else if (!ok(d.approver1?.status)) stage = "Approver 1";
    else if (!ok(d.approver2?.status)) stage = "Approver 2";
    else if (d.validator?.status !== "Validated") stage = "Validate";
  }
  return getKpiMonthStatuses(employeeId).map((m) => {
    if (m.state === "not_submitted" && tracked.has(m.label)) return { label: m.label, state: "draft" };
    if (m.state === "pending") return { label: m.label, state: "pending", stage };
    return { label: m.label, state: m.state };
  });
}

/** Bulan terakhir yang sudah full approve (Validated) secara berurutan dari Januari. */
export function lastFullyApprovedMonth(visuals: KpiMonthVisual[]): { count: number; label: string | null } {
  let count = 0;
  for (const v of visuals) {
    if (v.state !== "validated") break;
    count++;
  }
  return { count, label: count > 0 ? visuals[count - 1].label : null };
}

const SEGMENT_STYLE: Record<KpiMonthVisualState, string> = {
  validated: "bg-emerald-500",
  pending: "bg-amber-400",
  revision: "bg-rose-400",
  draft: "bg-sky-300",
  not_submitted: "bg-gray-100",
};
const STATE_LABEL: Record<KpiMonthVisualState, string> = {
  validated: "Validated (Full Approve)",
  pending: "Dalam Approval",
  revision: "Revisi",
  draft: "Draft (belum disubmit)",
  not_submitted: "Belum ada tracking",
};

export function KpiMonthlyApprovalBar({ employeeId, showLegend = true }: { employeeId: string; showLegend?: boolean }) {
  const visuals = getKpiMonthVisuals(employeeId);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-12 gap-0.5 overflow-hidden rounded-full bg-gray-50 p-0.5">
        {visuals.map((v) => (
          <div
            key={v.label}
            title={`${monthNameId(v.label)} 2026 · ${STATE_LABEL[v.state]}${v.stage ? ` (tahap ${v.stage})` : ""}`}
            className={`h-2.5 ${SEGMENT_STYLE[v.state]} first:rounded-l-full last:rounded-r-full transition-colors duration-500`}
          />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-0.5">
        {visuals.map((v) => (
          <span key={v.label} className={`text-center text-[8px] font-semibold ${v.state === "not_submitted" ? "text-gray-300" : "text-gray-500"}`}>
            {v.label.slice(0, 3)}
          </span>
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap items-center gap-3">
          {(["validated", "pending", "revision", "draft", "not_submitted"] as KpiMonthVisualState[]).map((st) => (
            <span key={st} className="inline-flex items-center gap-1 text-[9px] font-medium text-gray-500">
              <span className={`h-2 w-2 rounded-full ${SEGMENT_STYLE[st]} ${st === "not_submitted" ? "ring-1 ring-gray-200" : ""}`} />
              {STATE_LABEL[st]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
