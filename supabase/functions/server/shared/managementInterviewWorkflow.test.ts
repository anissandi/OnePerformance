import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateManagementInterviewScore,
  createManagementInterviewDocument,
  isEligibleForManagementInterview,
  MI_ASPECTS,
  transitionManagementInterviewDocument,
} from "./managementInterviewWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-10-15T09:00:00Z";

test("Management Interview eligibility: only allows level divisi (Ka. / Wa. Ka. Div ke atas)", () => {
  assert.equal(isEligibleForManagementInterview("SIM-EMP-001"), false); // operasional
  assert.equal(isEligibleForManagementInterview("SIM-EMP-002"), false); // seksi
  assert.equal(isEligibleForManagementInterview("SIM-EMP-003"), false); // bagian
  assert.equal(isEligibleForManagementInterview("SIM-EMP-004"), false); // departemen
  assert.equal(isEligibleForManagementInterview("SIM-ACTOR-IND-HR-UNIT"), false); // hr-unit (bagian)
  assert.equal(isEligibleForManagementInterview("SIM-EMP-005"), true); // divisi (IND - RSUP)
  assert.equal(isEligibleForManagementInterview("SIM-EMP-030"), true); // divisi (GTG - SAMBU)

  assert.throws(() => createManagementInterviewDocument("SIM-EMP-004"), /Ka\. \/ Wa\. Ka\. Divisi ke atas/);
  assert.equal(MI_ASPECTS.length, 3);
});

test("Management Interview RSUP lifecycle: HR schedules -> 4 Directors assess 3 criteria -> Validated & 10% weighted score", () => {
  let doc = createManagementInterviewDocument("SIM-EMP-005");
  assert.equal(doc.status, "Unscheduled");
  assert.equal(doc.snapshot.weights["management-interview"], 10);
  assert.deepEqual(
    doc.reviewers.map((r) => r.actorId),
    [
      "SIM-ACTOR-DIRECTOR-1",
      "SIM-ACTOR-DIRECTOR-2",
      "SIM-ACTOR-DIRECTOR-3",
      "SIM-ACTOR-DIRECTOR-4",
    ],
  );

  // Reviewer cannot assess before HR schedules the interview
  assert.throws(
    () =>
      transitionManagementInterviewDocument(doc, {
        action: "submit-assessment",
        actorId: "SIM-ACTOR-DIRECTOR-1",
        actorLevel: "direktur",
        actorUnitId: null,
        strategic: false,
        scores: { "mi-1": 4, "mi-2": 4, "mi-3": 4 },
        now,
        window,
      }),
    /belum dijadwalkan/,
  );

  // Candidate cannot schedule their own interview
  assert.throws(
    () =>
      transitionManagementInterviewDocument(doc, {
        action: "schedule",
        actorId: "SIM-EMP-005",
        actorLevel: "divisi",
        actorUnitId: "IND",
        strategic: false,
        scheduledDate: "2026-10-15",
        scheduledTime: "09:00",
        location: "Ruang Rapat Direksi Lt. 3",
        now,
        window,
      }),
    /Hanya HR/,
  );

  // HR Unit schedules the interview
  doc = transitionManagementInterviewDocument(doc, {
    action: "schedule",
    actorId: "SIM-ACTOR-IND-HR-UNIT",
    actorLevel: "hr-unit",
    actorUnitId: "IND",
    strategic: false,
    scheduledDate: "2026-10-15",
    scheduledTime: "09:00",
    location: "Ruang Rapat Direksi Lt. 3",
    otherUsers: ["Notulis HR"],
    textNotifikasi: "Harap hadir 15 menit sebelum jadwal.",
    textLampiran: "Lampirkan deck presentasi kinerja divisi.",
    now,
    window,
  });
  assert.equal(doc.status, "Scheduled");

  // Director 1 saves draft then submits (scores: 4, 4, 4 -> avg 4 -> 80%)
  doc = transitionManagementInterviewDocument(doc, {
    action: "save-assessment",
    actorId: "SIM-ACTOR-DIRECTOR-1",
    actorLevel: "direktur",
    actorUnitId: null,
    strategic: false,
    scores: { "mi-1": 4, "mi-2": 4, "mi-3": null },
    recommendation: "Maintain Current Position",
    comment: "Draft penilaian Direktur 1",
    now,
    window,
  });
  assert.equal(doc.status, "In Assessment");
  assert.equal(doc.reviewers[0].status, "Saved");

  doc = transitionManagementInterviewDocument(doc, {
    action: "submit-assessment",
    actorId: "SIM-ACTOR-DIRECTOR-1",
    actorLevel: "direktur",
    actorUnitId: null,
    strategic: false,
    scores: { "mi-1": 4, "mi-2": 4, "mi-3": 4 },
    recommendation: "Maintain Current Position",
    comment: "Pencapaian sangat baik.",
    now,
    window,
  });
  assert.equal(doc.reviewers[0].status, "Completed");

  // Director 2 submits (scores: 5, 4, 3 -> avg 4 -> 80%)
  doc = transitionManagementInterviewDocument(doc, {
    action: "submit-assessment",
    actorId: "SIM-ACTOR-DIRECTOR-2",
    actorLevel: "direktur",
    actorUnitId: null,
    strategic: false,
    scores: { "mi-1": 5, "mi-2": 4, "mi-3": 3 },
    recommendation: "Promote",
    comment: "Siap tanggung jawab lebih besar.",
    now,
    window,
  });

  // Director 3 submits (scores: 5, 5, 5 -> avg 5 -> 100%)
  doc = transitionManagementInterviewDocument(doc, {
    action: "submit-assessment",
    actorId: "SIM-ACTOR-DIRECTOR-3",
    actorLevel: "direktur",
    actorUnitId: null,
    strategic: false,
    scores: { "mi-1": 5, "mi-2": 5, "mi-3": 5 },
    recommendation: "Promote",
    comment: "Justifikasi dan evidence sangat lengkap.",
    now,
    window,
  });
  assert.equal(doc.status, "In Assessment");

  // Director 4 submits (scores: 5, 5, 5 -> avg 5 -> 100%) -> all 4 completed -> Validated
  doc = transitionManagementInterviewDocument(doc, {
    action: "submit-assessment",
    actorId: "SIM-ACTOR-DIRECTOR-4",
    actorLevel: "direktur",
    actorUnitId: null,
    strategic: false,
    scores: { "mi-1": 5, "mi-2": 5, "mi-3": 5 },
    recommendation: "Maintain Current Position",
    comment: "Rencana follow-up terukur.",
    now,
    window,
  });
  assert.equal(doc.status, "Validated");

  // Average across 4 directors: (80 + 80 + 100 + 100) / 4 = 90%; weighted (10%) = 9.0
  const summary = calculateManagementInterviewScore(doc);
  assert.equal(summary.complete, true);
  assert.equal(summary.completedReviewers, 4);
  assert.equal(summary.score, 90);
  assert.equal(summary.weightedScore, 9);
});

test("Management Interview SAMBU lifecycle: GM acts as single reviewer -> Validated", () => {
  let doc = createManagementInterviewDocument("SIM-EMP-030"); // GTG divisi
  assert.deepEqual(doc.reviewers.map((r) => r.actorId), ["SIM-ACTOR-GTG-GM"]);

  doc = transitionManagementInterviewDocument(doc, {
    action: "schedule",
    actorId: "SIM-ACTOR-HR-STRATEGIC",
    actorLevel: "hr-strategic",
    actorUnitId: null,
    strategic: true,
    scheduledDate: "2026-10-20",
    scheduledTime: "10:00",
    location: "Ruang Rapat GM Guntung",
    now,
    window,
  });
  doc = transitionManagementInterviewDocument(doc, {
    action: "submit-assessment",
    actorId: "SIM-ACTOR-GTG-GM",
    actorLevel: "gm",
    actorUnitId: "GTG",
    strategic: false,
    scores: { "mi-1": 4, "mi-2": 5, "mi-3": 3 },
    recommendation: "Maintain Current Position",
    comment: "Evaluasi GM Guntung selesai.",
    now,
    window,
  });
  assert.equal(doc.status, "Validated");
  const summary = calculateManagementInterviewScore(doc);
  assert.equal(summary.complete, true);
  assert.equal(summary.score, 80);
  assert.equal(summary.weightedScore, 8);
});
