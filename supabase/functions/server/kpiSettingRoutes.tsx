import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import {
  canReadKpi, createKpiDocument, kpiNotificationRecipients, transitionKpi, WorkflowError,
} from "./shared/kpiSettingWorkflow.ts";
import type { KpiDocument, KpiWindow } from "./shared/kpiSettingWorkflow.ts";

export const kpiSettingRoutes = new Hono();
kpiSettingRoutes.use("*", bodyLimit({ maxSize: 200000 }));

export async function simulationContext(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) throw new HTTPException(401, { message: "Login simulasi diperlukan." });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url !== "https://ekzrnltjbcauihoftkiy.supabase.co" || !key) throw new HTTPException(503, { message: "Konfigurasi proyek simulasi belum tersedia." });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !user.user) throw new HTTPException(401, { message: "Sesi tidak valid atau berakhir." });
  const { data: identity, error } = await client.from("pa_sim_identities").select("*").eq("auth_user_id", user.user.id).maybeSingle();
  if (error) throw new HTTPException(503, { message: "Identitas simulasi belum tersedia." });
  if (!identity) throw new HTTPException(403, { message: "Akun tidak terdaftar dalam PA-Simulasi." });
  const normalizedIdentity = { ...identity, appraisal_participant: Boolean(identity.appraisal_participant || identity.actor_level === "hr-unit") };
  return { client, identity: normalizedIdentity, strategic: normalizedIdentity.actor_level === "hr-strategic" };
}

async function loadWindow(client: Awaited<ReturnType<typeof simulationContext>>["client"], unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client.from("pa_sim_kpi_windows").select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Migrasi workflow KPI Setting belum tersedia." });
  if (!data) return null;
  if (typeof data.start_date !== "string" || typeof data.end_date !== "string" || typeof data.locked !== "boolean") {
    throw new HTTPException(503, { message: "Konfigurasi jadwal KPI Setting tidak valid." });
  }
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

kpiSettingRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi tidak tersimpan. Periksa konfigurasi dan coba muat ulang." }, 503);
});

kpiSettingRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: records, error } = await client.from("pa_sim_kpi_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi workflow KPI Setting terlebih dahulu." });
  const documents = (records ?? []).map((row) => row.document as KpiDocument).filter((record) => canReadKpi(record, identity.identity_id, strategic));
  if (identity.appraisal_participant && !documents.some((record) => record.employeeId === identity.identity_id)) documents.push(createKpiDocument(identity.identity_id));
  const windows = [];
  const units = [...new Set(strategic ? simulationEmployees.map((employee) => employee.unitId) : documents.map((record) => record.snapshot.unitId))];
  for (const unitId of units) windows.push({ unitId, ...await loadWindow(client, unitId) });
  const { data: notifications, error: notificationError } = await client.from("pa_sim_notifications")
    .select("id, payload, created_at, delivery_status").eq("recipient_id", identity.identity_id).eq("channel", "in-app").order("created_at", { ascending: false }).limit(20);
  if (notificationError) throw new HTTPException(503, { message: "Penyimpanan notifikasi belum tersedia." });
  return c.json({ documents, windows, notifications, emailDelivery: "pending-integration" });
});

kpiSettingRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Jadwal hanya dikelola HR Strategic." });
  const body = await c.req.json();
  const datesValid = [body.startDate, body.endDate].every((value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  if (!simulationEmployees.some((employee) => employee.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
  const existing = await loadWindow(client, body.unitId);
  if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
  const { error } = await client.from("pa_sim_kpi_windows").upsert({ unit_id: body.unitId, period: "2026", start_date: body.startDate, end_date: body.endDate,
    locked: false, updated_by: identity.identity_id, updated_at: new Date().toISOString() });
  if (error) throw new HTTPException(503, { message: "Jadwal gagal disimpan." });
  return c.json({ saved: true });
});

kpiSettingRoutes.post("/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  const body = await c.req.json();
  if (!simulationEmployees.some((employee) => employee.id === employeeId)) throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  const { data, error } = await client.from("pa_sim_kpi_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan KPI Setting belum tersedia." });
  const document: KpiDocument = data?.document ?? createKpiDocument(employeeId);
  if (!canReadKpi(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak memiliki penugasan untuk pengajuan ini." });
  if (!Number.isInteger(body.version) || body.version !== document.version) throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melakukan tindakan." });
  if ((body.action === "advance" || body.action === "revise") && body.items !== undefined) throw new WorkflowError("Checker, approver, dan Validator tidak boleh mengubah data KPI.");
  const actorIds = [...new Set([employeeId, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id, auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) throw new WorkflowError("Seluruh penugasan wajib harus terhubung dengan akun simulasi.");
  const now = new Date().toISOString();
  const next = transitionKpi(document, { action: body.action, actorId: identity.identity_id, items: body.items, note: body.note, now,
    window: await loadWindow(client, document.snapshot.unitId) });
  const recipients = kpiNotificationRecipients(next, body.action);
  const payload = { action: body.action, module: "KPI Setting", period: next.period, employeeId, status: next.status, at: now,
    link: "/pa-simulasi", timezone: "Asia/Jakarta" };
  const { error: commitError } = await client.rpc("pa_sim_commit_kpi", { employee: employeeId, appraisal_period: "2026", expected_version: document.version,
    next_document: next, recipients, notification_payload: payload });
  if (commitError) throw new HTTPException(409, { message: "Tindakan tidak tersimpan. Data/jadwal mungkin berubah; muat ulang. Notifikasi keberhasilan tidak dikirim." });
  return c.json({ document: next, notificationsPersisted: recipients.length > 0, emailDelivery: "pending-integration" });
});
