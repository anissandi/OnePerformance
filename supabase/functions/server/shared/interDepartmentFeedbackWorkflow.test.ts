import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdfDocument,
  IDF_FOLLOW_UP_COLUMNS,
  IDF_INDICATORS,
  idfGiverEligibilityError,
  nominateIdfGivers,
  sanitizeIdfDocumentForViewer,
  submitIdfApproverFollowUp,
  submitIdfColleagueFeedback,
  submitIdfRecipientSummary,
} from "./interDepartmentFeedbackWorkflow.ts";
import type { IdfFollowUpRow } from "./interDepartmentFeedbackWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-07-10T04:00:00Z";

function sampleAnswers() {
  return Object.fromEntries(IDF_INDICATORS.map((ind) => [ind.key, `Jawaban profesional untuk ${ind.key}`]));
}

function sampleFollowUp(): IdfFollowUpRow {
  return Object.fromEntries(IDF_FOLLOW_UP_COLUMNS.map((col) => [col, `Isian ${col}`])) as IdfFollowUpRow;
}

test("IDF giver eligibility: rejects self and same department/section, allows other departments and cross-unit", () => {
  // SIM-EMP-003 (IND · Human Resources · SIM-DEPT-IND-3) & SIM-ACTOR-IND-HR-UNIT (IND · Human Resources · SIM-DEPT-IND-3)
  assert.notEqual(idfGiverEligibilityError("SIM-EMP-003", "SIM-EMP-003"), "");
  assert.match(idfGiverEligibilityError("SIM-EMP-003", "SIM-ACTOR-IND-HR-UNIT"), /departemen dan bagian yang sama/);

  // Different department in same unit (SIM-EMP-001 = Produksi, SIM-EMP-002 = Finance, SIM-EMP-004 = Engineering)
  assert.equal(idfGiverEligibilityError("SIM-EMP-003", "SIM-EMP-001"), "");
  assert.equal(idfGiverEligibilityError("SIM-EMP-003", "SIM-EMP-002"), "");
  assert.equal(idfGiverEligibilityError("SIM-EMP-003", "SIM-EMP-004"), "");

  // Same department name in another business unit (SIM-EMP-008 = PKB · Human Resources) is allowed
  assert.equal(idfGiverEligibilityError("SIM-EMP-003", "SIM-EMP-008"), "");
});

test("IDF end-to-end lifecycle: 3 nominations, anonymous colleague feedbacks, 15 summaries, and sequential A1 -> A2 follow-up", () => {
  let doc = createIdfDocument("SIM-EMP-003");

  // Rejects fewer than 3 givers or same-department giver
  assert.throws(
    () => nominateIdfGivers(doc, { actorId: "SIM-EMP-003", giverIds: ["SIM-EMP-001", "SIM-EMP-002"], now, window }),
    /tepat 3/,
  );
  assert.throws(
    () =>
      nominateIdfGivers(doc, {
        actorId: "SIM-EMP-003",
        giverIds: ["SIM-EMP-001", "SIM-EMP-002", "SIM-ACTOR-IND-HR-UNIT"],
        now,
        window,
      }),
    /departemen/,
  );

  const givers = ["SIM-EMP-001", "SIM-EMP-002", "SIM-EMP-006"];
  doc = nominateIdfGivers(doc, { actorId: "SIM-EMP-003", giverIds: givers, now, window }).document;
  assert.equal(doc.status, "Awaiting Feedback");

  // Cannot submit summary before all 3 feedbacks arrive
  doc = submitIdfColleagueFeedback(doc, { giverId: givers[0], answers: sampleAnswers(), now, window }).document;
  doc = submitIdfColleagueFeedback(doc, { giverId: givers[1], answers: sampleAnswers(), now, window }).document;
  assert.equal(doc.status, "Awaiting Feedback");
  assert.throws(
    () => submitIdfRecipientSummary(doc, { actorId: "SIM-EMP-003", summaries: {}, submit: true, now, window }),
    /ketiga feedback/,
  );

  // Third colleague submits feedback
  doc = submitIdfColleagueFeedback(doc, { giverId: givers[2], answers: sampleAnswers(), now, window }).document;
  assert.equal(doc.status, "Awaiting Summary");

  // Server sanitization strips giverId for recipient and hides nominations for approvers
  const recipientView = sanitizeIdfDocumentForViewer(doc, "SIM-EMP-003");
  assert.equal(recipientView.feedbacks.some((fb) => "giverId" in fb), false);
  const approverView = sanitizeIdfDocumentForViewer(doc, doc.stages[0].actorId);
  assert.equal(approverView.nominations.length, 0);

  // Recipient fills all 15 summary entries and submits
  const allSummaries = Object.fromEntries(
    doc.feedbacks.flatMap((fb) => IDF_INDICATORS.map((ind) => [`${fb.id}-${ind.key}`, `Catatan summary ${fb.id} ${ind.key}`])),
  );
  doc = submitIdfRecipientSummary(doc, {
    actorId: "SIM-EMP-003",
    summaries: allSummaries,
    submit: true,
    now,
    window,
  }).document;
  assert.equal(doc.status, "Pending-Approver 1");

  // Approver 2 cannot submit before Approver 1
  assert.throws(
    () => submitIdfApproverFollowUp(doc, { actorId: doc.stages[1].actorId, rows: [sampleFollowUp()], now, window }),
    /Approver 1/,
  );

  // Approver 1 submits follow-up
  doc = submitIdfApproverFollowUp(doc, {
    actorId: doc.stages[0].actorId,
    rows: [sampleFollowUp()],
    now,
    window,
  }).document;
  assert.equal(doc.status, "Pending-Approver 2");

  // Approver 2 submits follow-up -> Validated
  doc = submitIdfApproverFollowUp(doc, {
    actorId: doc.stages[1].actorId,
    rows: [sampleFollowUp()],
    now,
    window,
  }).document;
  assert.equal(doc.status, "Validated");
  assert.equal(doc.followUps.approver1?.length, 1);
  assert.equal(doc.followUps.approver2?.length, 1);
});
