import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateProjectModuleScore,
  canManageProjectUpload,
  createProjectDocument,
  mapParsedProjectExcelRows,
  PROJECT_EXCEL_HEADERS,
  PROJECT_EXTERNAL_UPLOAD_HEADERS,
  transitionProjectDocument,
} from "./projectWorkflow.ts";
import type { ProjectExcelRow } from "./projectWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-08-10T04:00:00Z";

function sampleRows(): ProjectExcelRow[] {
  return [
    {
      no: 1,
      projectScope: 'QCC - "Small Group Activity"',
      roleProject: "Member / Anggota",
      projectTitle: "Reduksi Downtime Boiler",
      projectDetail: "Preventive maintenance terjadwal",
      startDate: "2026-01-15",
      finishDate: "2026-06-30",
      progressStatus: "Done",
      finalScore: 75,
    },
    {
      no: 2,
      projectScope: 'QCP - "Cross Functional Kaizen Team"',
      roleProject: "Leader / Ketua",
      projectTitle: "Digitalisasi Monitoring Produksi",
      projectDetail: "Otomasi dashboard produksi lintas departemen",
      startDate: "2026-02-01",
      finishDate: "2026-09-30",
      progressStatus: "Done",
      finalScore: 92,
    },
    {
      no: 3,
      projectScope: "Komite P2K3",
      roleProject: "Member / Anggota",
      projectTitle: "Audit Keselamatan Kerja",
      projectDetail: "Inspeksi berkala area produksi",
      startDate: "2026-03-01",
      finishDate: "2026-10-15",
      progressStatus: "Done",
      finalScore: 84,
    },
  ];
}

test("Project Excel headers and HR ICF upload permissions", () => {
  assert.equal(PROJECT_EXCEL_HEADERS.length, 9);
  assert.equal(PROJECT_EXTERNAL_UPLOAD_HEADERS.length, 14);
  const doc = createProjectDocument("SIM-EMP-001"); // unit IND

  // Regular employee cannot upload
  assert.equal(canManageProjectUpload(doc, "SIM-EMP-001", "operasional", "IND", false), false);
  // HR Unit of another unit cannot upload
  assert.equal(canManageProjectUpload(doc, "SIM-ACTOR-PKB-HR-UNIT", "hr-unit", "PKB", false), false);
  // HR Unit of same unit (IND) and HR Strategic can upload as HR ICF
  assert.equal(canManageProjectUpload(doc, "SIM-ACTOR-IND-HR-UNIT", "hr-unit", "IND", false), true);
  assert.equal(canManageProjectUpload(doc, "SIM-ACTOR-HR-STRATEGIC", "hr-strategic", null, true), true);
});

test("Project lifecycle: HR ICF Excel upload -> Approval Level 1 -> Revision -> Approval Level 2 -> Max Final Score * Bobot", () => {
  let doc = createProjectDocument("SIM-EMP-001"); // operasional, bobot project = 15%
  assert.equal(doc.snapshot.weights.project, 15);
  assert.deepEqual(
    doc.stages.map((s) => s.stage),
    ["approver-1", "approver-2"],
  );

  // Employee cannot submit directly
  assert.throws(
    () =>
      transitionProjectDocument(doc, {
        action: "submit",
        actorId: "SIM-EMP-001",
        actorLevel: "operasional",
        actorUnitId: "IND",
        strategic: false,
        rows: sampleRows(),
        now,
        window,
      }),
    /Hanya HR ICF/,
  );

  // HR Unit (acting as HR ICF) uploads and submits Excel
  doc = transitionProjectDocument(doc, {
    action: "submit",
    actorId: "SIM-ACTOR-IND-HR-UNIT",
    actorLevel: "hr-unit",
    actorUnitId: "IND",
    strategic: false,
    rows: sampleRows(),
    fileName: "Project_ICF_SIM-EMP-001.xlsx",
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 1");
  assert.equal(doc.uploadedBy, "SIM-ACTOR-IND-HR-UNIT");

  // Approver 1 requests revision
  doc = transitionProjectDocument(doc, {
    action: "revise",
    actorId: doc.stages[0].actorId,
    actorLevel: "seksi",
    actorUnitId: "IND",
    strategic: false,
    note: "Perbarui tanggal selesai proyek ke-2",
    now,
    window,
  });
  assert.equal(doc.status, "Revision-Approver 1");
  assert.equal(doc.revisionStage, 0);

  // HR ICF resubmits
  doc = transitionProjectDocument(doc, {
    action: "submit",
    actorId: "SIM-ACTOR-IND-HR-UNIT",
    actorLevel: "hr-unit",
    actorUnitId: "IND",
    strategic: false,
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 1");

  // Approver 1 approves -> Pending-Approver 2
  doc = transitionProjectDocument(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    actorLevel: "seksi",
    actorUnitId: "IND",
    strategic: false,
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 2");

  // Approver 2 approves -> Validated
  doc = transitionProjectDocument(doc, {
    action: "advance",
    actorId: doc.stages[1].actorId,
    actorLevel: "bagian",
    actorUnitId: "IND",
    strategic: false,
    now,
    window,
  });
  assert.equal(doc.status, "Validated");

  // Highest Final Score across rows (75, 92, 84) is 92; weighted (15%) = 92 * 0.15 = 13.8
  const summary = calculateProjectModuleScore(doc);
  assert.deepEqual(summary, {
    complete: true,
    maxFinalScore: 92,
    score: 92,
    weightedScore: 13.8,
  });
});

test("Division level Project mirrors Approval Level 1 to Level 2 with 10% weight", () => {
  let doc = createProjectDocument("SIM-EMP-005"); // divisi, bobot project = 10%
  assert.equal(doc.snapshot.weights.project, 10);
  assert.equal(doc.mirrorSecondSlot, true);

  doc = transitionProjectDocument(doc, {
    action: "submit",
    actorId: "SIM-ACTOR-HR-STRATEGIC",
    actorLevel: "hr-strategic",
    actorUnitId: null,
    strategic: true,
    rows: sampleRows(),
    fileName: "Project_Divisi.xlsx",
    now,
    window,
  });
  doc = transitionProjectDocument(doc, {
    action: "advance",
    actorId: doc.stages[0].actorId,
    actorLevel: "gm",
    actorUnitId: "IND",
    strategic: false,
    now,
    window,
  });
  assert.equal(doc.status, "Validated");
  const summary = calculateProjectModuleScore(doc);
  assert.equal(summary.maxFinalScore, 92);
  assert.equal(summary.score, 92);
  assert.equal(summary.weightedScore, 9.2);
});
test("External system multi-employee Excel parser maps Emp. ID and routes each employee directly to Approval 1 & 2", () => {
  const parsed = mapParsedProjectExcelRows(
    [...PROJECT_EXTERNAL_UPLOAD_HEADERS],
    [
      [
        "1",
        "SIM-EMP-001",
        "Budi Santoso",
        "PT. RSUP (Industri)",
        "Produksi",
        "Operator",
        "QCC",
        "Team Leader",
        "Reduksi Downtime Boiler",
        "Preventive maintenance terjadwal",
        "2026-01-15",
        "2026-06-30",
        "Done",
        "88",
      ],
      [
        "2",
        "SIM-EMP-001",
        "Budi Santoso",
        "PT. RSUP (Industri)",
        "Produksi",
        "Operator",
        "SS",
        "Ideator",
        "Otomasi Checklist Harian",
        "Digitalisasi QR checklist",
        "2026-03-01",
        "2026-08-15",
        "Done",
        "94",
      ],
    ],
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].employeeId, "SIM-EMP-001");
  assert.equal(parsed[1].finalScore, 94);

  // Simulate automatic submission upon HR upload
  const doc = transitionProjectDocument(createProjectDocument("SIM-EMP-001"), {
    action: "submit",
    actorId: "SIM-ACTOR-IND-HR-UNIT",
    actorLevel: "hr-unit",
    actorUnitId: "IND",
    strategic: false,
    rows: parsed,
    fileName: "External_Project_Export_2026.xlsx",
    now,
    window,
  });
  assert.equal(doc.status, "Pending-Approver 1");
  const summary = calculateProjectModuleScore(doc);
  assert.equal(summary.maxFinalScore, 94);
});
