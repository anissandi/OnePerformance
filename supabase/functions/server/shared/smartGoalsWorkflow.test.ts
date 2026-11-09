import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSmartGoalsScore,
  createSmartGoalMeasurementDocument,
  createSmartGoalSettingDocument,
  transitionSmartGoalMeasurement,
  transitionSmartGoalSetting,
} from "./smartGoalsWorkflow.ts";
import type { SmartGoalItem } from "./smartGoalsWorkflow.ts";

const window = { startDate: "2026-01-01", endDate: "2026-12-31", locked: false };
const now = "2026-06-10T03:00:00Z";
const evidenceId = "12345678-1234-1234-1234-123456789012";

function sampleGoals(): SmartGoalItem[] {
  return [
    {
      id: "goal-1",
      label: "Goals 1 — Uptime 99.9%",
      specific: "Meningkatkan uptime sistem produksi menjadi 99,9%",
      measurable: "Dipantau melalui dashboard uptime bulanan",
      attainable: "Redundansi server dan auto-failover",
      relevant: "Mendukung operasional produksi tanpa gangguan",
      timely: "Akhir Q4 2026",
      bukti: "Laporan dashboard uptime",
      target: "Uptime >= 99,9%",
      actionPlans: [
        { id: "ap-1", description: "Konfigurasi auto-failover server utama" },
        { id: "ap-2", description: "Audit bulanan load balancer" },
      ],
    },
    {
      id: "goal-2",
      label: "Goals 2 — Efisiensi Proses",
      specific: "Mempercepat waktu siklus laporan bulanan 30%",
      measurable: "Waktu penyelesaian laporan",
      attainable: "Otomasi template pelaporan",
      relevant: "Mempercepat pengambilan keputusan manajemen",
      timely: "Akhir Q3 2026",
      bukti: "Log pengiriman laporan",
      target: "Selesai H+2 setiap bulan",
      actionPlans: [{ id: "ap-3", description: "Otomasi skrip rekapitulasi data" }],
    },
    {
      id: "goal-3",
      label: "Goals 3 — Sertifikasi Kompetensi",
      specific: "Menyelesaikan sertifikasi kompetensi teknis tahun 2026",
      measurable: "Sertifikat kelulusan resmi dengan skor >= 85",
      attainable: "Mengikuti pelatihan intensif dan ujian resmi",
      relevant: "Meningkatkan standar mutu operasional departemen",
      timely: "Akhir Q3 2026",
      bukti: "Sertifikat kelulusan",
      target: "Lulus ujian dengan skor >= 85",
      actionPlans: [{ id: "ap-4", description: "Mengikuti pelatihan dan ujian sertifikasi" }],
    },
  ];
}

test("SMART Goals Setting lifecycle: draft, revision, resubmit to requesting stage, and full validation", () => {
  let setting = createSmartGoalSettingDocument("SIM-EMP-001");
  assert.equal(setting.snapshot.weights["smart-goals"], 20);
  assert.deepEqual(
    setting.stages.map((s) => s.stage),
    ["checker", "approver-1", "approver-2", "validator"],
  );

  // Fewer than 3 goals rejected on submit
  assert.throws(
    () => transitionSmartGoalSetting(setting, { action: "submit", actorId: "SIM-EMP-001", goals: sampleGoals().slice(0, 2), now, window }),
    /Minimal 3 SMART Goals/,
  );

  setting = transitionSmartGoalSetting(setting, {
    action: "submit",
    actorId: "SIM-EMP-001",
    goals: sampleGoals(),
    now,
    window,
  });
  assert.equal(setting.status, "Pending-Checker");

  // Checker advances, Approver 1 requests revision
  setting = transitionSmartGoalSetting(setting, {
    action: "advance",
    actorId: setting.stages[0].actorId,
    now,
    window,
  });
  assert.equal(setting.status, "Pending-Approver 1");

  setting = transitionSmartGoalSetting(setting, {
    action: "revise",
    actorId: setting.stages[1].actorId,
    note: "Perjelas target kuantitatif Goals 2",
    now,
    window,
  });
  assert.equal(setting.status, "Revision-Approver 1");
  assert.equal(setting.revisionStage, 1);

  // Resubmit returns directly to Approver 1
  setting = transitionSmartGoalSetting(setting, {
    action: "submit",
    actorId: "SIM-EMP-001",
    now,
    window,
  });
  assert.equal(setting.status, "Pending-Approver 1");
  assert.equal(setting.activeStage, 1);

  while (setting.status !== "Validated") {
    setting = transitionSmartGoalSetting(setting, {
      action: "advance",
      actorId: setting.stages[setting.activeStage].actorId,
      now,
      window,
    });
  }
  assert.equal(setting.status, "Validated");
});

test("SMART Goals Measurement lifecycle: evidence/reason validation, Approver 1 & 2 scoring, and average final score", () => {
  let setting = createSmartGoalSettingDocument("SIM-EMP-001");
  setting = transitionSmartGoalSetting(setting, {
    action: "submit",
    actorId: "SIM-EMP-001",
    goals: sampleGoals(),
    now,
    window,
  });
  while (setting.status !== "Validated") {
    setting = transitionSmartGoalSetting(setting, {
      action: "advance",
      actorId: setting.stages[setting.activeStage].actorId,
      now,
      window,
    });
  }

  let measurement = createSmartGoalMeasurementDocument(setting);
  const entries = structuredClone(measurement.entries);
  entries["goal-1"] = {
    actual: "Uptime mencapai 99,95%",
    achievementStatus: "Tercapai",
    alasanTidakTercapai: "",
    evidence: [],
    actionPlans: {
      "ap-1": { status: "Selesai", progressPct: 100, kendala: "", alasanBatal: "" },
      "ap-2": { status: "Batal", progressPct: 0, kendala: "", alasanBatal: "" },
    },
  };
  entries["goal-2"] = {
    actual: "Baru selesai H+4",
    achievementStatus: "Tidak Tercapai",
    alasanTidakTercapai: "",
    evidence: [],
    actionPlans: {
      "ap-3": { status: "Sedang dilaksanakan", progressPct: 60, kendala: "Integrasi API tertunda", alasanBatal: "" },
    },
  };
  entries["goal-3"] = {
    actual: "Lulus sertifikasi dengan skor 90",
    achievementStatus: "Tercapai",
    alasanTidakTercapai: "",
    evidence: [evidenceId],
    actionPlans: {
      "ap-4": { status: "Selesai", progressPct: 100, kendala: "", alasanBatal: "" },
    },
  };

  // Missing alasanBatal on Batal action plan rejected
  assert.throws(
    () => transitionSmartGoalMeasurement(measurement, { action: "submit", actorId: "SIM-EMP-001", entries, now, window }),
    /alasan batal/,
  );
  entries["goal-1"].actionPlans["ap-2"].alasanBatal = "Digabung ke monitoring otomatis";

  // Missing evidence on Tercapai goal rejected
  assert.throws(
    () => transitionSmartGoalMeasurement(measurement, { action: "submit", actorId: "SIM-EMP-001", entries, now, window }),
    /minimal 1 file bukti/,
  );
  entries["goal-1"].evidence = [evidenceId];

  // Missing alasanTidakTercapai on Tidak Tercapai goal rejected
  assert.throws(
    () => transitionSmartGoalMeasurement(measurement, { action: "submit", actorId: "SIM-EMP-001", entries, now, window }),
    /alasan ketidakcapaian/,
  );
  entries["goal-2"].alasanTidakTercapai = "Menunggu akses database produksi";

  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "submit",
    actorId: "SIM-EMP-001",
    entries,
    now,
    window,
  });
  assert.equal(measurement.status, "Pending-Checker");

  // Checker advances without ratings
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[0].actorId,
    now,
    window,
  });
  assert.equal(measurement.status, "Pending-Approver 1");

  // Approver 1 must provide ratings for all goals
  assert.throws(() =>
    transitionSmartGoalMeasurement(measurement, {
      action: "advance",
      actorId: measurement.stages[1].actorId,
      now,
      window,
    }),
  );

  // Approver 1 gives 90%, 70%, 80% (avg = 80%)
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[1].actorId,
    ratings: { "goal-1": 90, "goal-2": 70, "goal-3": 80 },
    note: "Progres baik pada Goal 1",
    now,
    window,
  });
  assert.equal(measurement.status, "Pending-Approver 2");

  // Approver 2 gives 100%, 80%, 90% (avg = 90%)
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[2].actorId,
    ratings: { "goal-1": 100, "goal-2": 80, "goal-3": 90 },
    note: "Setuju dengan evaluasi",
    now,
    window,
  });
  assert.equal(measurement.status, "Pending-Validate");

  // Validator validates
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[3].actorId,
    now,
    window,
  });
  assert.equal(measurement.status, "Validated");

  // Final score = (80 + 90) / 2 = 85%; weighted (20%) = 17%
  const summary = calculateSmartGoalsScore(measurement);
  assert.deepEqual(summary, {
    complete: true,
    approver1Score: 80,
    approver2Score: 90,
    score: 85,
    weightedScore: 17,
  });
});

test("Division level SMART Goals Measurement mirrors Approver 1 ratings to Approver 2", () => {
  let setting = createSmartGoalSettingDocument("SIM-EMP-005");
  setting = transitionSmartGoalSetting(setting, {
    action: "submit",
    actorId: "SIM-EMP-005",
    goals: sampleGoals(),
    now,
    window,
  });
  while (setting.status !== "Validated") {
    setting = transitionSmartGoalSetting(setting, {
      action: "advance",
      actorId: setting.stages[setting.activeStage].actorId,
      now,
      window,
    });
  }
  let measurement = createSmartGoalMeasurementDocument(setting);
  const entries = structuredClone(measurement.entries);
  for (const goal of measurement.goals) {
    entries[goal.id].actual = "Tercapai sesuai target";
    entries[goal.id].achievementStatus = "Tercapai";
    entries[goal.id].evidence = [evidenceId];
  }
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "submit",
    actorId: "SIM-EMP-005",
    entries,
    now,
    window,
  });
  // Checker
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[0].actorId,
    now,
    window,
  });
  // Approver 1 (GM, mirrors A2)
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[1].actorId,
    ratings: { "goal-1": 90, "goal-2": 80, "goal-3": 85 },
    now,
    window,
  });
  assert.equal(measurement.status, "Pending-Validate");
  assert.equal(measurement.assessments.approver2?.mirrored, true);
  // Validator
  measurement = transitionSmartGoalMeasurement(measurement, {
    action: "advance",
    actorId: measurement.stages[2].actorId,
    now,
    window,
  });
  const summary = calculateSmartGoalsScore(measurement);
  assert.equal(summary.complete, true);
  assert.equal(summary.score, 85);
  assert.equal(summary.weightedScore, 8.5); // 10% weight for divisi
});
