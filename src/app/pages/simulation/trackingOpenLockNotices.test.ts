import assert from "node:assert/strict";
import test from "node:test";
import type { OpenLock } from "../../../../supabase/functions/server/shared/kpiTrackingWorkflow";
import { rejectedTrackingOpenLocks } from "./trackingOpenLockNotices.ts";

const document = { employeeId: "SIM-EMP-001", period: "2026", month: 10 };
const requester = "SIM-EMP-001";
function request(patch: Partial<OpenLock> = {}): OpenLock {
  return {
    id: "rejected", employee_id: document.employeeId, period: document.period,
    month: document.month, scope: "submission", requester_id: requester,
    reason: "Perlu submit", status: "Rejected", expires_on: null,
    decided_by: "SIM-ACTOR-HR-STRATEGIC", created_at: "2026-11-01T00:00:00Z",
    ...patch,
  };
}

test("shows the requester's rejection for the selected document", () => {
  const rejection = request();
  assert.deepEqual(rejectedTrackingOpenLocks([rejection], document, requester), [rejection]);
});

test("does not show decisions for another requester, employee, period or month", () => {
  const requests = [
    request({ requester_id: "OTHER" }), request({ employee_id: "SIM-EMP-002" }),
    request({ period: "2025" }), request({ month: 9 }),
  ];
  assert.deepEqual(rejectedTrackingOpenLocks(requests, document, requester), []);
  assert.deepEqual(rejectedTrackingOpenLocks([request()], undefined, requester), []);
});

test("a newer pending or approved request supersedes an old rejection regardless of input order", () => {
  for (const status of ["Pending", "Approved"] as const) {
    const retry = request({ id: "retry", status, created_at: "2026-11-02T00:00:00Z" });
    for (const requests of [[request(), retry], [retry, request()]]) {
      assert.deepEqual(rejectedTrackingOpenLocks(requests, document, requester), []);
    }
  }
});

test("keeps scopes independent and returns only the latest rejection per scope", () => {
  const latest = request({ id: "latest", created_at: "2026-11-02T00:00:00Z" });
  const approval = request({ id: "approval", scope: "approval", status: "Pending" });
  const revision = request({ id: "revision", scope: "revision" });
  assert.deepEqual(rejectedTrackingOpenLocks([request(), latest, approval, revision], document, requester), [latest, revision]);
});
