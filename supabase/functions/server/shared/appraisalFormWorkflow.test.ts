import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_APPRAISAL_KEYS,
  APPRAISAL_FORM_DEFS,
  calculateAppraisalFormScore,
  createAppraisalFormDocument,
  transitionAppraisalForm,
} from "./appraisalFormWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-06-15T04:00:00Z";

function makeUniformRatings(score: number): Record<string, number> {
  return Object.fromEntries(ALL_APPRAISAL_KEYS.map((key) => [key, score]));
}

test("Appraisal Form definitions contain 20 items across Form A (60%), Form B (25%), and Form C (15%)", () => {
  assert.equal(ALL_APPRAISAL_KEYS.length, 20);
  assert.deepEqual(
    APPRAISAL_FORM_DEFS.map((s) => ({ id: s.id, count: s.items.length, pct: s.percentage })),
    [
      { id: "A", count: 12, pct: 60 },
      { id: "B", count: 5, pct: 25 },
      { id: "C", count: 3, pct: 15 },
    ],
  );
});

test("Appraisal Form lifecycle: self-assessment, Approver 1 & Approver 2 evaluation, and weighted score formula", () => {
  let doc = createAppraisalFormDocument("SIM-EMP-001");
  assert.equal(doc.snapshot.weights["appraisal-form"], 15);
  assert.deepEqual(
    doc.stages.map((s) => s.stage),
    ["approver-1", "approver-2"],
  );

  // Incomplete ratings rejected on submit
  assert.throws(
    () => transitionAppraisalForm(doc, { action: "submit", actorId: "SIM-EMP-001", ratings: { "A-1": 4 }, now, window }),
    /Lengkapi seluruh penilaian/,
  );

  // Employee submits all 3s (selfAvg = 3.00)
  doc = transitionAppraisalForm(doc, {
    action: "submit",
    actorId: "SIM-EMP-001",
    ratings: makeUniformRatings(3),
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 1");

  // Approver 1 submits all 4s (app1Avg = 4.00)
  doc = transitionAppraisalForm(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    ratings: makeUniformRatings(4),
    note: "Kompetensi kerja baik",
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 2");

  // Approver 2 submits all 5s (app2Avg = 5.00)
  doc = transitionAppraisalForm(doc, {
    action: "advance",
    actorId: doc.stages[1].actorId,
    ratings: makeUniformRatings(5),
    note: "Sangat baik dan konsisten",
    now,
    window,
  });
  assert.equal(doc.status, "Validated");

  // Combined avg per form = (3 + 4 + 5) / 3 = 4.00 (out of 5) => 80% of each form weight:
  // Form A: 4/5 * 60 = 48%, Form B: 4/5 * 25 = 20%, Form C: 4/5 * 15 = 12% => Total = 80%
  // Weighted PA contribution (15% module weight) = 80 * 15 / 100 = 12%
  const summary = calculateAppraisalFormScore(doc);
  assert.equal(summary.complete, true);
  assert.equal(summary.grandSelf, 3);
  assert.equal(summary.grandApp1, 4);
  assert.equal(summary.grandApp2, 5);
  assert.equal(summary.grandCombined, 4);
  assert.equal(summary.score, 80);
  assert.equal(summary.weightedScore, 12);
});

test("Division level Appraisal Form mirrors Approver 1 assessment to Approver 2", () => {
  let doc = createAppraisalFormDocument("SIM-EMP-005");
  assert.equal(doc.mirrorSecondSlot, true);
  doc = transitionAppraisalForm(doc, {
    action: "submit",
    actorId: "SIM-EMP-005",
    ratings: makeUniformRatings(4),
    now,
    window,
  });
  doc = transitionAppraisalForm(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    ratings: makeUniformRatings(4),
    now,
    window,
  });
  assert.equal(doc.status, "Validated");
  assert.equal(doc.assessments.approver2?.mirrored, true);
  const summary = calculateAppraisalFormScore(doc);
  assert.equal(summary.score, 80);
  assert.equal(summary.weightedScore, 8); // 10% weight for divisi
});
