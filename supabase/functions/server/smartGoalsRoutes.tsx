import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiWindow } from "./shared/kpiSettingWorkflow.ts";
import { validateTrackingEvidence } from "./shared/kpiTrackingWorkflow.ts";
import {
  assertWindowOpen,
  calculateSmartGoalsScore,
  canReadSmartGoals,
  createSmartGoalMeasurementDocument,
  createSmartGoalSettingDocument,
  sgEvidenceIds,
  sgNotificationRecipients,
  transitionSmartGoalMeasurement,
  transitionSmartGoalSetting,
} from "./shared/smartGoalsWorkflow.ts";
import type { SmartGoalMeasurementDocument, SmartGoalSettingDocument } from "./shared/smartGoalsWorkflow.ts";

export const smartGoalsRoutes = new Hono();
const bucket = "pa-simulation-sg-evidence";
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];

smartGoalsRoutes.use("*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
smartGoalsRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi SMART Goals belum tersimpan. Periksa migrasi dan muat ulang." }, 503);
});

async function loadWindow(client: Client, table: "pa_sim_sg_setting_windows" | "pa_sim_sg_measurement_windows", unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client.from(table).select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi SMART Goals terlebih dahulu." });
  if (!data) return null;
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

async function loadSettingDoc(client: Client, employeeId: string): Promise<SmartGoalSettingDocument> {
  const { data, error } = await client.from("pa_sim_sg_setting_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan SMART Goals Setting belum tersedia." });
  return data?.document ?? createSmartGoalSettingDocument(employeeId);
}

async function loadMeasurementDoc(client: Client, employeeId: string): Promise<SmartGoalMeasurementDocument> {
  const setting = await loadSettingDoc(client, employeeId);
  if (setting.status !== "Validated") throw new WorkflowError("SMART Goals Setting karyawan ini belum berstatus Validated.");
  const { data, error } = await client.from("pa_sim_sg_measurement_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan SMART Goals Measurement belum tersedia." });
  return data?.document ?? createSmartGoalMeasurementDocument(setting);
}

smartGoalsRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: rawSettings, error: settingError } = await client.from("pa_sim_sg_setting_documents").select("document").eq("period", "2026");
  if (settingError) throw new HTTPException(503, { message: "Jalankan migrasi SMART Goals terlebih dahulu." });
  const settingDocuments: SmartGoalSettingDocument[] = (rawSettings ?? [])
    .map((row) => row.document as SmartGoalSettingDocument)
    .filter((doc) => canReadSmartGoals(doc, identity.identity_id, strategic));
  if (identity.appraisal_participant && !settingDocuments.some((doc) => doc.employeeId === identity.identity_id)) {
    settingDocuments.push(createSmartGoalSettingDocument(identity.identity_id));
  }

  const { data: rawMeasurements, error: measurementError } = await client.from("pa_sim_sg_measurement_documents").select("document").eq("period", "2026");
  if (measurementError) throw new HTTPException(503, { message: "Penyimpanan SMART Goals Measurement belum tersedia." });
  const measurementDocuments: SmartGoalMeasurementDocument[] = (rawMeasurements ?? [])
    .map((row) => row.document as SmartGoalMeasurementDocument)
    .filter((doc) => canReadSmartGoals(doc, identity.identity_id, strategic));
  const ownValidatedSetting = settingDocuments.find((doc) => doc.employeeId === identity.identity_id && doc.status === "Validated");
  if (ownValidatedSetting && !measurementDocuments.some((doc) => doc.employeeId === identity.identity_id)) {
    measurementDocuments.push(createSmartGoalMeasurementDocument(ownValidatedSetting));
  }

  const unitIds = [...new Set(strategic ? simulationEmployees.map((emp) => emp.unitId) : settingDocuments.map((doc) => doc.snapshot.unitId))];
  const settingWindows = [];
  const measurementWindows = [];
  for (const unitId of unitIds) {
    settingWindows.push({ unitId, window: await loadWindow(client, "pa_sim_sg_setting_windows", unitId) });
    measurementWindows.push({ unitId, window: await loadWindow(client, "pa_sim_sg_measurement_windows", unitId) });
  }

  const evidenceIds = [...new Set(measurementDocuments.flatMap(sgEvidenceIds))];
  const evidence = evidenceIds.length
    ? await client.from("pa_sim_sg_evidence").select("id,employee_id,goal_id,file_name,size,content_type").in("id", evidenceIds)
    : { data: [], error: null };
  if (evidence.error) throw new HTTPException(503, { message: "Metadata bukti SMART Goals belum tersedia." });

  const scores = settingDocuments.map((setting) => {
    const measurement = measurementDocuments.find((doc) => doc.employeeId === setting.employeeId);
    return { employeeId: setting.employeeId, ...calculateSmartGoalsScore(measurement) };
  });

  return c.json({
    settingDocuments,
    measurementDocuments,
    settingWindows,
    measurementWindows,
    evidence: evidence.data ?? [],
    scores,
    serverNow: new Date().toISOString(),
  });
});

for (const [path, table] of [
  ["/setting/window", "pa_sim_sg_setting_windows"],
  ["/measurement/window", "pa_sim_sg_measurement_windows"],
] as const) {
  smartGoalsRoutes.post(path, async (c) => {
    const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
    if (!strategic) throw new HTTPException(403, { message: "Jadwal SMART Goals hanya dikelola HR Strategic." });
    const body = await c.req.json();
    const datesValid = [body.startDate, body.endDate].every(
      (value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    );
    if (!simulationEmployees.some((emp) => emp.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) {
      throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
    }
    const existing = await loadWindow(client, table, body.unitId);
    if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
    const { error } = await client.from(table).upsert({
      unit_id: body.unitId,
      period: "2026",
      start_date: body.startDate,
      end_date: body.endDate,
      locked: false,
      updated_by: identity.identity_id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new HTTPException(503, { message: "Jadwal SMART Goals gagal disimpan." });
    return c.json({ saved: true });
  });
}

smartGoalsRoutes.post("/setting/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!simulationEmployees.some((emp) => emp.id === employeeId)) throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  const document = await loadSettingDoc(client, employeeId);
  if (!canReadSmartGoals(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak memiliki penugasan untuk SMART Goals ini." });
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  const actorIds = [...new Set([employeeId, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh penugasan SMART Goals wajib terhubung dengan akun simulasi.");
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, "pa_sim_sg_setting_windows", document.snapshot.unitId);
  const next = transitionSmartGoalSetting(document, {
    action: body.action,
    actorId: identity.identity_id,
    goals: body.goals,
    note: body.note,
    now,
    window,
  });
  const recipients = sgNotificationRecipients(next, body.action);
  const payload = {
    action: body.action,
    module: "SMART Goals Setting",
    period: next.period,
    employeeId,
    status: next.status,
    at: now,
    link: "/pa-simulasi?view=sg-setting",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_sg_setting", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: next,
    recipients,
    notification_payload: payload,
  });
  if (error) throw new HTTPException(409, { message: "SMART Goals Setting tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});

smartGoalsRoutes.post("/measurement/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!simulationEmployees.some((emp) => emp.id === employeeId)) throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  const document = await loadMeasurementDoc(client, employeeId);
  if (!canReadSmartGoals(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak memiliki penugasan untuk SMART Goals Measurement ini." });
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  const actorIds = [...new Set([employeeId, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh penugasan SMART Goals Measurement wajib terhubung dengan akun simulasi.");
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, "pa_sim_sg_measurement_windows", document.snapshot.unitId);
  const next = transitionSmartGoalMeasurement(document, {
    action: body.action,
    actorId: identity.identity_id,
    entries: body.entries,
    ratings: body.ratings,
    note: body.note,
    now,
    window,
  });
  const evidenceIds = sgEvidenceIds(next);
  if (evidenceIds.length) {
    const { data: files, error: fileError } = await client.from("pa_sim_sg_evidence").select("id").eq("employee_id", employeeId).eq("period", "2026").in("id", evidenceIds);
    if (fileError || files?.length !== evidenceIds.length) {
      throw new WorkflowError("Lampiran bukti harus berasal dari upload privat karyawan pemilik SMART Goals.");
    }
  }
  const recipients = sgNotificationRecipients(next, body.action);
  const payload = {
    action: body.action,
    module: "SMART Goals Measurement",
    period: next.period,
    employeeId,
    status: next.status,
    at: now,
    link: "/pa-simulasi?view=sg-measurement",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_sg_measurement", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: next,
    recipients,
    notification_payload: payload,
  });
  if (error) throw new HTTPException(409, { message: "SMART Goals Measurement tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});

smartGoalsRoutes.post("/measurement/:employeeId/:goalId/evidence", async (c) => {
  const { client, identity } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  const goalId = c.req.param("goalId");
  const document = await loadMeasurementDoc(client, employeeId);
  if (identity.identity_id !== document.employeeId || !(document.status === "Draft" || document.revisionStage !== null)) {
    throw new HTTPException(403, { message: "Upload bukti hanya untuk pemilik SMART Goals Measurement yang dapat diedit." });
  }
  if (!document.goals.some((goal) => goal.id === goalId)) {
    throw new HTTPException(404, { message: "Goal tidak ditemukan pada dokumen SMART Goals." });
  }
  const window = await loadWindow(client, "pa_sim_sg_measurement_windows", document.snapshot.unitId);
  assertWindowOpen(window, new Date().toISOString(), "SMART Goals Measurement");
  const file = (await c.req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10485760 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) {
    throw new WorkflowError("Bukti harus JPG/PNG/PDF, maksimal 10 MB per file.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateTrackingEvidence(file.type, file.size, bytes);
  const id = crypto.randomUUID();
  const path = `2026/${document.employeeId}/${goalId}/${id}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw new HTTPException(503, { message: "Upload bukti privat SMART Goals gagal." });
  const metadata = {
    id,
    employee_id: document.employeeId,
    period: "2026",
    goal_id: goalId,
    file_name: file.name.slice(0, 200),
    content_type: file.type,
    size: file.size,
    storage_path: path,
  };
  const { error } = await client.from("pa_sim_sg_evidence").insert(metadata);
  if (error) {
    await client.storage.from(bucket).remove([path]);
    throw new HTTPException(503, { message: "Metadata bukti SMART Goals gagal disimpan." });
  }
  return c.json({ id, goal_id: goalId, file_name: metadata.file_name, size: file.size, content_type: file.type });
});

smartGoalsRoutes.get("/evidence/:id", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: file, error } = await client.from("pa_sim_sg_evidence").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (error || !file) throw new HTTPException(404, { message: "Bukti SMART Goals tidak tersedia." });
  const document = await loadMeasurementDoc(client, file.employee_id);
  if (identity.identity_id !== file.employee_id) {
    if (!canReadSmartGoals(document, identity.identity_id, strategic)) {
      throw new HTTPException(403, { message: "Tidak berwenang melihat bukti SMART Goals ini." });
    }
    const { data: events, error: historyError } = await client.from("pa_sim_sg_measurement_events").select("document").eq("employee_id", file.employee_id).eq("period", "2026");
    if (historyError || !events?.some((event) => sgEvidenceIds(event.document as SmartGoalMeasurementDocument).includes(file.id))) {
      throw new HTTPException(403, { message: "Bukti belum dilampirkan pada pengajuan SMART Goals." });
    }
  }
  const { data, error: downloadError } = await client.storage.from(bucket).download(file.storage_path);
  if (downloadError || !data) throw new HTTPException(503, { message: "Bukti SMART Goals gagal dimuat." });
  return new Response(data, {
    headers: {
      "Content-Type": file.content_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
