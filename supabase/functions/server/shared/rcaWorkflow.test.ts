import assert from "node:assert/strict";
import test from "node:test";
import { createKpiDocument } from "./kpiSettingWorkflow.ts";
import { simulationEmployees } from "./paSimulation2026.ts";
import { canEditRca, canReadRca, createRcaDocument, rcaProgress, rcaRecipients, transitionRca, validateRcaProblems } from "./rcaWorkflow.ts";
import type { RcaDocument, RcaProblem } from "./rcaWorkflow.ts";

const now = "2026-11-20T03:00:00Z";
const evidence = "12345678-1234-1234-1234-123456789012";
function initial(employeeId = "SIM-EMP-001") {
  const source = createKpiDocument(employeeId);
  source.version = 5; source.status = "Validated";
  source.items = [{ id: "kpi", subject: "Produksi", unit: "ton", source: "Laporan", definition: "Produksi bulanan", weight: 100, polarity: "maximize", formula: "sum", months: Array.from({ length: 12 }, () => ({ target: 100, notApplicableReason: "" })) }];
  return createRcaDocument({ id: 1, employee_id: employeeId, period: "2026", month: 10, item_id: "kpi", source_version: 5, target: 100, actual: 80, achievement: 80, improvement_status: "Open", closure_validated: false }, source);
}
function problems(): RcaProblem[] {
  return [{ id: "problem", masalahUtama: "Produksi kurang", kenapaA: "Downtime", kenapaB: "Mesin berhenti", kenapaC: "Perawatan terlambat", actionPlans: [
    { id: "plan", action: "Perawatan berkala", targetDate: "2026-12-01", pic: "Maintenance", status: "Belum dilaksanakan", keterangan: "", output: "", evidence: [] },
  ] }];
}
function approve(document: RcaDocument) {
  let next = document;
  while (next.status.startsWith("Pending")) {
    next = transitionRca(next, { action: "advance", actorId: next.stages[next.activeStage].actorId, now });
  }
  return next;
}
test("RCA sources and assignments are immutable Tracking snapshots", () => {
  const document = initial();
  assert.equal(document.achievement, 80);
  assert.deepEqual(document.stages.map((stage) => stage.stage), ["checker", "approver-1", "approver-2", "validator"]);
  assert.equal(document.version, 0);
});
test("rejects a trigger whose source is not the exact validated Tracking version", () => {
  const source = createKpiDocument("SIM-EMP-001");
  const trigger = { id: 1, employee_id: source.employeeId, period: "2026", month: 10, item_id: "kpi", source_version: 5, target: 100, actual: 80, achievement: 80, improvement_status: "Open", closure_validated: false };
  assert.throws(() => createRcaDocument(trigger, source));
});
test("owner-only draft, no direct approval and no incomplete submission", () => {
  const document = initial();
  assert.equal(canReadRca(document, document.stages[0].actorId, false), false);
  assert.equal(canEditRca(document, document.employeeId), true);
  assert.throws(() => transitionRca(document, { action: "save", actorId: document.stages[0].actorId, problems: problems(), now }));
  assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, now }));
  assert.throws(() => transitionRca(document, { action: "advance", actorId: document.stages[0].actorId, now }));
});
test("revision returns to requesting stage; reviewers cannot alter RCA", () => {
  let document = initial();
  document = transitionRca(document, { action: "submit", actorId: document.employeeId, problems: problems(), now });
  const checker = document.stages[0].actorId;
  assert.equal(canReadRca(document, checker, false), true);
  assert.throws(() => transitionRca(document, { action: "advance", actorId: document.stages[1].actorId, now }));
  assert.throws(() => transitionRca(document, { action: "advance", actorId: checker, problems: problems(), now }));
  assert.throws(() => transitionRca(document, { action: "revise", actorId: checker, now }));
  document = transitionRca(document, { action: "revise", actorId: checker, note: "Lengkapi akar penyebab", now });
  assert.equal(document.revisionStage, 0);
  assert.deepEqual(rcaRecipients(document, "revise"), [document.employeeId]);
  const revised = structuredClone(document.problems);
  revised[0].actionPlans[0].evidence = [evidence];
  document = transitionRca(document, { action: "submit", actorId: document.employeeId, problems: revised, now });
  assert.equal(document.activeStage, 0);
  assert.equal(document.revisionStage, null);
  assert.deepEqual(rcaRecipients(document, "submit"), [checker]);
});
test("plan approval, progress submission and final validation are separate; Closed is locked", () => {
  let document = initial();
  document = approve(transitionRca(document, { action: "submit", actorId: document.employeeId, problems: problems(), now }));
  assert.equal(document.status, "Approved");
  const progress = structuredClone(document.problems);
  progress[0].actionPlans[0] = { ...progress[0].actionPlans[0], status: "Selesai", output: "Mesin kembali normal", evidence: [evidence] };
  document = transitionRca(document, { action: "save", actorId: document.employeeId, problems: progress, now });
  assert.equal(document.status, "Approved");
  document = transitionRca(document, { action: "submit", actorId: document.employeeId, now });
  assert.equal(document.cycle, "follow-up");
  document = approve(document);
  assert.equal(document.status, "Closed");
  assert.equal(canEditRca(document, document.employeeId), false);
  assert.throws(() => transitionRca(document, { action: "save", actorId: document.employeeId, now }));
  assert.deepEqual(rcaRecipients(document, "advance"), [document.employeeId]);
});
test("incomplete progress remains open after approval; canceled plans require reasons", () => {
  let document = initial();
  document = approve(transitionRca(document, { action: "submit", actorId: document.employeeId, problems: problems(), now }));
  const update = structuredClone(document.problems);
  update[0].actionPlans[0].evidence = [evidence];
  document = approve(transitionRca(document, { action: "submit", actorId: document.employeeId, problems: update, now }));
  assert.equal(document.status, "Approved");
  const data = problems();
  data[0].actionPlans[0].status = "Selesai";
  assert.throws(() => validateRcaProblems(data, true));
  data[0].actionPlans[0].status = "Dibatalkan";
  assert.throws(() => validateRcaProblems(data, true));
  data[0].actionPlans[0].keterangan = "Digantikan tindakan lain";
  assert.doesNotThrow(() => validateRcaProblems(data, true));
  assert.deepEqual(rcaProgress(data), { total: 0, complete: 0 });
});
test("validates evidence references, unique IDs, and real target dates", () => {
  const data = problems();
  data[0].actionPlans[0].targetDate = "2026-02-30";
  assert.throws(() => validateRcaProblems(data, true));
  data[0].actionPlans[0].targetDate = "2026-12-01";
  data[0].actionPlans[0].evidence = ["not-an-upload-id"];
  assert.throws(() => validateRcaProblems(data, false));
  data[0].actionPlans[0].evidence = [];
  data[0].actionPlans.push(structuredClone(data[0].actionPlans[0]));
  assert.throws(() => validateRcaProblems(data, false));
});
test("division mirror preserves the A1 + A2 audit event", () => {
  let document = initial("SIM-EMP-005");
  document = approve(transitionRca(document, { action: "submit", actorId: document.employeeId, problems: problems(), now }));
  assert.equal(document.status, "Approved");
  assert.equal(document.history.filter((event) => event.mirrored && event.stage === "approver-2").length, 1);
});

const extraEvidence = "22345678-1234-1234-1234-123456789012";
test("every update needs new evidence; draft reload does not reset the submission baseline", () => {
  const data = problems();
  data[0].actionPlans[0].evidence = [evidence];
  let document = approve(transitionRca(initial(), { action: "submit", actorId: initial().employeeId, problems: data, now }));
  assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, now }), /evidence baru/);
  const update = structuredClone(document.problems);
  update[0].actionPlans[0].status = "Sedang dilaksanakan";
  assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, problems: update, now }), /evidence baru/);
  update[0].actionPlans[0].evidence.push(extraEvidence);
  document = transitionRca(document, { action: "save", actorId: document.employeeId, problems: update, now });
  document = JSON.parse(JSON.stringify(document));
  assert.deepEqual(document.lastSubmittedEvidence, [evidence]);
  document = approve(transitionRca(document, { action: "submit", actorId: document.employeeId, now }));
  assert.equal(document.status, "Approved");
  assert.deepEqual(document.problems[0].actionPlans[0].evidence, [evidence, extraEvidence]);
  assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, now }), /evidence baru/);
});
test("saved evidence cannot be removed, replaced, or lost by deleting its problem/plan", () => {
  const data = problems();
  data[0].actionPlans[0].evidence = [evidence];
  const document = transitionRca(initial(), { action: "save", actorId: initial().employeeId, problems: data, now });
  for (const replacement of [[], [extraEvidence]]) {
    const update = structuredClone(data);
    update[0].actionPlans[0].evidence = replacement;
    assert.throws(() => transitionRca(document, { action: "save", actorId: document.employeeId, problems: update, now }), /tidak boleh/);
  }
  assert.throws(() => transitionRca(document, { action: "save", actorId: document.employeeId, problems: [], now }), /tidak boleh/);
});
test("all canceled or mixed completed/canceled plans close only after full approval, even in the first cycle", () => {
  for (const mixed of [false, true]) {
    const data = problems();
    data[0].actionPlans[0] = { ...data[0].actionPlans[0], status: "Dibatalkan", keterangan: "Perubahan kebutuhan", evidence: [evidence] };
    if (mixed) data[0].actionPlans.push({ ...data[0].actionPlans[0], id: "complete", status: "Selesai", output: "Perbaikan selesai" });
    let document = transitionRca(initial(), { action: "submit", actorId: initial().employeeId, problems: data, now });
    assert.notEqual(document.status, "Closed");
    assert.equal(canEditRca(document, document.employeeId), false);
    document = approve(document);
    assert.equal(document.status, "Closed");
    assert.equal(canEditRca(document, document.employeeId), false);
    assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, now }));
  }
});
test("evidence can accumulate beyond ten files across updates", () => {
  const data = problems();
  data[0].actionPlans[0].evidence = Array.from({ length: 12 }, (_, index) => `${String(index).padStart(8, "0")}-1234-1234-1234-123456789012`);
  assert.doesNotThrow(() => validateRcaProblems(data, true));
});
test("saving final statuses after approval does not lock the unsent update", () => {
  let document = approve(transitionRca(initial(), { action: "submit", actorId: initial().employeeId, problems: problems(), now }));
  const update = structuredClone(document.problems);
  update[0].actionPlans[0] = { ...update[0].actionPlans[0], status: "Dibatalkan", keterangan: "Tidak lagi diperlukan", evidence: [evidence] };
  document = transitionRca(document, { action: "save", actorId: document.employeeId, problems: update, now });
  assert.equal(canEditRca(document, document.employeeId), true);
  document = transitionRca(document, { action: "submit", actorId: document.employeeId, now });
  assert.notEqual(document.status, "Closed");
  document = approve(document);
  assert.equal(document.status, "Closed");
});
test("legacy Approved records with final statuses and full validation are locked", () => {
  const data = problems();
  data[0].actionPlans[0] = { ...data[0].actionPlans[0], status: "Selesai", output: "Selesai", evidence: [evidence] };
  const document = approve(transitionRca(initial(), { action: "submit", actorId: initial().employeeId, problems: data, now }));
  document.status = "Approved";
  delete document.lastSubmittedEvidence;
  assert.equal(canEditRca(document, document.employeeId), false);
  assert.throws(() => transitionRca(document, { action: "submit", actorId: document.employeeId, now }));
});
test("HR Unit acts as both employee participant (level bagian) and unit checker without self-checking", () => {
  const hrUnit = simulationEmployees.find((employee) => employee.id === "SIM-ACTOR-IND-HR-UNIT");
  assert.ok(hrUnit);
  assert.equal(hrUnit.level, "bagian");
  assert.equal(hrUnit.position, "Supervisor HR Unit");
  assert.deepEqual(hrUnit.allowedModules, ["kpi", "smart-goals", "appraisal-form", "project", "rca", "inter-department-feedback", "manager-skill"]);

  const hrKpi = createKpiDocument("SIM-ACTOR-IND-HR-UNIT");
  assert.equal(hrKpi.snapshot.weights.kpi, 40);
  assert.deepEqual(hrKpi.stages.map((stage) => stage.stage), ["approver-1", "approver-2", "validator"]);
  assert.equal(hrKpi.stages.some((stage) => stage.actorId === "SIM-ACTOR-IND-HR-UNIT"), false);

  let hrRca = initial("SIM-ACTOR-IND-HR-UNIT");
  assert.deepEqual(hrRca.stages.map((stage) => stage.stage), ["approver-1", "approver-2", "validator"]);
  hrRca = transitionRca(hrRca, { action: "submit", actorId: "SIM-ACTOR-IND-HR-UNIT", problems: problems(), now });
  assert.equal(hrRca.status, "Pending-Approver 1");
  assert.equal(hrRca.stages[hrRca.activeStage].actorId, "SIM-ACTOR-IND-DEPARTEMEN");

  const staffKpi = createKpiDocument("SIM-EMP-001");
  assert.equal(staffKpi.stages[0].stage, "checker");
  assert.equal(staffKpi.stages[0].actorId, "SIM-ACTOR-IND-HR-UNIT");
});
