import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiWindow } from "./shared/kpiSettingWorkflow.ts";
import {
  calculateManagementInterviewScore,
  canReadManagementInterview,
  createManagementInterviewDocument,
  isEligibleForManagementInterview,
  managementInterviewNotificationRecipients,
  transitionManagementInterviewDocument,
} from "./shared/managementInterviewWorkflow.ts";
import type { ManagementInterviewDocument } from "./shared/managementInterviewWorkflow.ts";

export const managementInterviewRoutes = new Hono();
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];

managementInterviewRoutes.use("*", bodyLimit({ maxSize: 300000 }));
managementInterviewRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi Management Interview belum tersimpan. Periksa migrasi dan muat ulang." }, 503);
});

async function loadWindow(client: Client, unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client
    .from("pa_sim_management_interview_windows")
    .select("*")
    .eq("unit_id", unitId)
    .eq("period", "2026")
    .maybeSingle();
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Management Interview terlebih dahulu." });
  if (!data) return null;
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

async function loadDoc(client: Client, employeeId: string): Promise<ManagementInterviewDocument> {
  const { data, error } = await client
    .from("pa_sim_management_interview_documents")
    .select("document")
    .eq("employee_id", employeeId)
    .eq("period", "2026")
    .maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan Management Interview belum tersedia." });
  return data?.document ?? createManagementInterviewDocument(employeeId);
}

managementInterviewRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: records, error } = await client.from("pa_sim_management_interview_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Management Interview terlebih dahulu." });
  const documents: ManagementInterviewDocument[] = (records ?? [])
    .map((row) => row.document as ManagementInterviewDocument)
    .filter((doc) => canReadManagementInterview(doc, identity.identity_id, identity.actor_level, identity.unit_id, strategic));

  // Ensure all eligible divisi documents visible to this actor are populated
  for (const emp of simulationEmployees) {
    if (!isEligibleForManagementInterview(emp.id)) continue;
    if (documents.some((doc) => doc.employeeId === emp.id)) continue;
    const candidateDoc = createManagementInterviewDocument(emp.id);
    if (canReadManagementInterview(candidateDoc, identity.identity_id, identity.actor_level, identity.unit_id, strategic)) {
      documents.push(candidateDoc);
    }
  }

  const unitIds = [...new Set(strategic ? simulationEmployees.map((emp) => emp.unitId) : documents.map((doc) => doc.snapshot.unitId))];
  const windows = [];
  for (const unitId of unitIds) {
    windows.push({ unitId, window: await loadWindow(client, unitId) });
  }
  const scores = documents.map((doc) => ({
    employeeId: doc.employeeId,
    ...calculateManagementInterviewScore(doc),
  }));
  return c.json({
    documents,
    windows,
    scores,
    serverNow: new Date().toISOString(),
  });
});

managementInterviewRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Jadwal aktivasi Management Interview hanya dikelola HR Strategic." });
  const body = await c.req.json();
  const datesValid = [body.startDate, body.endDate].every(
    (value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
  if (!simulationEmployees.some((emp) => emp.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) {
    throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
  }
  const existing = await loadWindow(client, body.unitId);
  if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
  const { error } = await client.from("pa_sim_management_interview_windows").upsert({
    unit_id: body.unitId,
    period: "2026",
    start_date: body.startDate,
    end_date: body.endDate,
    locked: false,
    updated_by: identity.identity_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new HTTPException(503, { message: "Jadwal Management Interview gagal disimpan." });
  return c.json({ saved: true });
});

managementInterviewRoutes.post("/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!isEligibleForManagementInterview(employeeId)) {
    throw new HTTPException(404, { message: "Peserta tidak termasuk dalam kriteria Management Interview (khusus level Ka. / Wa. Ka. Divisi ke atas)." });
  }
  const document = await loadDoc(client, employeeId);
  if (!canReadManagementInterview(document, identity.identity_id, identity.actor_level, identity.unit_id, strategic)) {
    throw new HTTPException(403, { message: "Tidak memiliki akses untuk Management Interview ini." });
  }
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) {
    throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  }
  const actorIds = [...new Set([employeeId, identity.identity_id, ...document.reviewers.map((r) => r.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh penugasan Management Interview wajib terhubung dengan akun simulasi.");
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, document.snapshot.unitId);

  const next = transitionManagementInterviewDocument(document, {
    ...body,
    actorId: identity.identity_id,
    actorLevel: identity.actor_level,
    actorUnitId: identity.unit_id,
    strategic,
    now,
    window,
  });

  const recipients = managementInterviewNotificationRecipients(next, body.action);
  const payload = {
    action: body.action,
    module: "Management Interview",
    period: next.period,
    employeeId,
    status: next.status,
    at: now,
    link: "/pa-simulasi?view=management-interview",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_management_interview", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: next,
    recipients,
    notification_payload: payload,
  });
  if (error) {
    throw new HTTPException(409, { message: "Management Interview tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  }
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});
