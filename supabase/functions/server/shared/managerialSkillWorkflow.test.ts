import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_MANAGERIAL_KEYS,
  calculateManagerialSkillScore,
  createManagerialSkillDocument,
  isEligibleForManagerialSkill,
  transitionManagerialSkill,
} from "./managerialSkillWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-06-20T04:00:00Z";

function makeRatings(score: number): Record<string, number> {
  return Object.fromEntries(ALL_MANAGERIAL_KEYS.map((key) => [key, score]));
}

test("Managerial Skill eligibility: rejects operasional & seksi, allows bagian, departemen, divisi, and HR Unit", () => {
  assert.equal(isEligibleForManagerialSkill("SIM-EMP-001"), false); // operasional
  assert.equal(isEligibleForManagerialSkill("SIM-EMP-002"), false); // seksi
  assert.equal(isEligibleForManagerialSkill("SIM-EMP-003"), true);  // bagian
  assert.equal(isEligibleForManagerialSkill("SIM-EMP-004"), true);  // departemen
  assert.equal(isEligibleForManagerialSkill("SIM-EMP-005"), true);  // divisi
  assert.equal(isEligibleForManagerialSkill("SIM-ACTOR-IND-HR-UNIT"), true); // HR Unit (bagian)

  assert.throws(() => createManagerialSkillDocument("SIM-EMP-001"), /Kepala Bagian ke atas/);
  assert.throws(() => createManagerialSkillDocument("SIM-EMP-002"), /Kepala Bagian ke atas/);
});

test("Managerial Skill lifecycle: self-assessment, Approver 1 & 2 evaluation, and score calculation", () => {
  // SIM-EMP-003 (Kepala Bagian, weight 15%)
  let doc = createManagerialSkillDocument("SIM-EMP-003");
  assert.equal(doc.snapshot.weights["manager-skill"], 15);
  assert.deepEqual(
    doc.stages.map((s) => s.stage),
    ["approver-1", "approver-2"],
  );

  assert.throws(
    () => transitionManagerialSkill(doc, { action: "submit", actorId: "SIM-EMP-003", ratings: { "ms-1": 4 }, now, window }),
    /Lengkapi penilaian/,
  );

  // Self submits all 3s (selfAvg = 3.00)
  doc = transitionManagerialSkill(doc, {
    action: "submit",
    actorId: "SIM-EMP-003",
    ratings: makeRatings(3),
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 1");

  // Approver 1 submits all 4s (app1Avg = 4.00)
  doc = transitionManagerialSkill(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    ratings: makeRatings(4),
    note: "Kepemimpinan baik",
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 2");

  // Approver 2 submits all 5s (app2Avg = 5.00)
  doc = transitionManagerialSkill(doc, {
    action: "advance",
    actorId: doc.stages[1].actorId,
    ratings: makeRatings(5),
    note: "Siap memimpin proyek lintas bagian",
    now,
    window,
  });
  assert.equal(doc.status, "Validated");

  // combinedAvg = (3 + 4 + 5) / 3 = 4.00 => score = (4 / 5) * 100 = 80% => weighted (15%) = 12%
  const summary = calculateManagerialSkillScore(doc);
  assert.deepEqual(summary, {
    complete: true,
    selfAvg: 3,
    app1Avg: 4,
    app2Avg: 5,
    combinedAvg: 4,
    score: 80,
    weightedScore: 12,
  });
});

test("Division level Managerial Skill mirrors Approver 1 assessment to Approver 2 with 20% weight", () => {
  let doc = createManagerialSkillDocument("SIM-EMP-005");
  assert.equal(doc.snapshot.weights["manager-skill"], 20);
  assert.equal(doc.mirrorSecondSlot, true);
  doc = transitionManagerialSkill(doc, {
    action: "submit",
    actorId: "SIM-EMP-005",
    ratings: makeRatings(4),
    now,
    window,
  });
  doc = transitionManagerialSkill(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    ratings: makeRatings(4),
    now,
    window,
  });
  assert.equal(doc.status, "Validated");
  assert.equal(doc.assessments.approver2?.mirrored, true);
  const summary = calculateManagerialSkillScore(doc);
  assert.equal(summary.score, 80);
  assert.equal(summary.weightedScore, 16); // 80 * 20% = 16
});
