import type { OpenLock, TrackingDocument } from "../../../../supabase/functions/server/shared/kpiTrackingWorkflow";

/** Only the latest request per scope is relevant; a retry supersedes an old rejection. */
export function rejectedTrackingOpenLocks<T extends OpenLock>(
  requests: readonly T[],
  document: Pick<TrackingDocument, "employeeId" | "period" | "month"> | undefined,
  requesterId: string,
): T[] {
  if (!document) return [];
  const latest = new Map<OpenLock["scope"], T>();
  for (const request of requests) {
    if (request.employee_id !== document.employeeId || request.period !== document.period ||
      request.month !== document.month || request.requester_id !== requesterId) continue;
    const previous = latest.get(request.scope);
    if (!previous || Date.parse(request.created_at) > Date.parse(previous.created_at)) {
      latest.set(request.scope, request);
    }
  }
  return [...latest.values()].filter((request) => request.status === "Rejected");
}
