import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiWindow } from "./shared/kpiSettingWorkflow.ts";
import { sgNotificationRecipients } from "./shared/smartGoalsWorkflow.ts";
import {
  calculateManagerialSkillScore,
  canReadManagerialSkill,
  createManagerialSkillDocument,
  isEligibleForManagerialSkill,
  transitionManagerialSkill,
} from "./shared/managerialSkillWorkflow.ts";
import type { ManagerialSkillDocument } from "./shared/managerialSkillWorkflow.ts";

export const managerialSkillRoutes = new Hono();
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];

managerialSkillRoutes.use("*", bodyLimit({ maxSize: 200000 }));
managerialSkillRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi Managerial Skill belum tersimpan. Periksa migrasi dan muat ulang." }, 503);
});

async function loadWindow(client: Client, unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client.from("pa_sim_ms_windows").select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Managerial Skill terlebih dahulu." });
  if (!data) return null;
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

async function loadDoc(client: Client, employeeId: string): Promise<ManagerialSkillDocument> {
  const { data, error } = await client.from("pa_sim_ms_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan Managerial Skill belum tersedia." });
  return data?.document ?? createManagerialSkillDocument(employeeId);
}

managerialSkillRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: records, error } = await client.from("pa_sim_ms_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Managerial Skill terlebih dahulu." });
  const documents: ManagerialSkillDocument[] = (records ?? [])
    .map((row) => row.document as ManagerialSkillDocument)
    .filter((doc) => canReadManagerialSkill(doc, identity.identity_id, strategic));
  if (isEligibleForManagerialSkill(identity.identity_id) && !documents.some((doc) => doc.employeeId === identity.identity_id)) {
    documents.push(createManagerialSkillDocument(identity.identity_id));
  }
  const unitIds = [...new Set(strategic ? simulationEmployees.map((emp) => emp.unitId) : documents.map((doc) => doc.snapshot.unitId))];
  const windows = [];
  for (const unitId of unitIds) {
    windows.push({ unitId, window: await loadWindow(client, unitId) });
  }
  const scores = documents.map((doc) => ({
    employeeId: doc.employeeId,
    ...calculateManagerialSkillScore(doc),
  }));
  return c.json({
    documents,
    windows,
    scores,
    serverNow: new Date().toISOString(),
  });
});

managerialSkillRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Jadwal Managerial Skill hanya dikelola HR Strategic." });
  const body = await c.req.json();
  const datesValid = [body.startDate, body.endDate].every(
    (value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
  if (!simulationEmployees.some((emp) => emp.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) {
    throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
  }
  const existing = await loadWindow(client, body.unitId);
  if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
  const { error } = await client.from("pa_sim_ms_windows").upsert({
    unit_id: body.unitId,
    period: "2026",
    start_date: body.startDate,
    end_date: body.endDate,
    locked: false,
    updated_by: identity.identity_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new HTTPException(503, { message: "Jadwal Managerial Skill gagal disimpan." });
  return c.json({ saved: true });
});

managerialSkillRoutes.post("/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!simulationEmployees.some((emp) => emp.id === employeeId)) {
    throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  }
  const document = await loadDoc(client, employeeId);
  if (!canReadManagerialSkill(document, identity.identity_id, strategic)) {
    throw new HTTPException(403, { message: "Tidak memiliki penugasan untuk Managerial Skill ini." });
  }
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) {
    throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  }
  const actorIds = [...new Set([employeeId, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh penugasan Managerial Skill wajib terhubung dengan akun simulasi.");
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, document.snapshot.unitId);
  const next = transitionManagerialSkill(document, {
    action: body.action,
    actorId: identity.identity_id,
    ratings: body.ratings,
    note: body.note,
    now,
    window,
  });
  const recipients = sgNotificationRecipients(next, body.action);
  const payload = {
    action: body.action,
    module: "Managerial Skill",
    period: next.period,
    employeeId,
    status: next.status,
    at: now,
    link: "/pa-simulasi?view=managerial-skill",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_managerial_skill", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: next,
    recipients,
    notification_payload: payload,
  });
  if (error) throw new HTTPException(409, { message: "Managerial Skill tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});
