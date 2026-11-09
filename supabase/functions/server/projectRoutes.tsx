import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiWindow } from "./shared/kpiSettingWorkflow.ts";
import {
  calculateProjectModuleScore,
  canManageProjectUpload,
  canReadProject,
  createProjectDocument,
  projectNotificationRecipients,
  transitionProjectDocument,
} from "./shared/projectWorkflow.ts";
import type { ProjectSimulationDocument } from "./shared/projectWorkflow.ts";

export const projectRoutes = new Hono();
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];

projectRoutes.use("*", bodyLimit({ maxSize: 400000 }));
projectRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi Project Outside Job Scope belum tersimpan. Periksa migrasi dan muat ulang." }, 503);
});

async function loadWindow(client: Client, unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client.from("pa_sim_project_windows").select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Project Outside Job Scope terlebih dahulu." });
  if (!data) return null;
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

async function loadDoc(client: Client, employeeId: string): Promise<ProjectSimulationDocument> {
  const { data, error } = await client.from("pa_sim_project_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan Project Outside Job Scope belum tersedia." });
  return data?.document ?? createProjectDocument(employeeId);
}

projectRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: records, error } = await client.from("pa_sim_project_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Project Outside Job Scope terlebih dahulu." });
  const documents: ProjectSimulationDocument[] = (records ?? [])
    .map((row) => row.document as ProjectSimulationDocument)
    .filter((doc) => canReadProject(doc, identity.identity_id, identity.actor_level, identity.unit_id, strategic));

  if (identity.appraisal_participant && !documents.some((doc) => doc.employeeId === identity.identity_id)) {
    documents.push(createProjectDocument(identity.identity_id));
  }
  if (strategic || identity.actor_level === "hr-unit") {
    for (const emp of simulationEmployees) {
      if (!strategic && emp.unitId !== identity.unit_id) continue;
      if (!documents.some((doc) => doc.employeeId === emp.id)) {
        documents.push(createProjectDocument(emp.id));
      }
    }
  }

  const unitIds = [...new Set(strategic ? simulationEmployees.map((emp) => emp.unitId) : documents.map((doc) => doc.snapshot.unitId))];
  const windows = [];
  for (const unitId of unitIds) {
    windows.push({ unitId, window: await loadWindow(client, unitId) });
  }
  const scores = documents.map((doc) => ({
    employeeId: doc.employeeId,
    ...calculateProjectModuleScore(doc),
  }));
  return c.json({
    documents,
    windows,
    scores,
    serverNow: new Date().toISOString(),
  });
});

projectRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Jadwal Project Outside Job Scope hanya dikelola HR Strategic." });
  const body = await c.req.json();
  const datesValid = [body.startDate, body.endDate].every(
    (value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
  if (!simulationEmployees.some((emp) => emp.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) {
    throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
  }
  const existing = await loadWindow(client, body.unitId);
  if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
  const { error } = await client.from("pa_sim_project_windows").upsert({
    unit_id: body.unitId,
    period: "2026",
    start_date: body.startDate,
    end_date: body.endDate,
    locked: false,
    updated_by: identity.identity_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new HTTPException(503, { message: "Jadwal Project Outside Job Scope gagal disimpan." });
  return c.json({ saved: true });
});

projectRoutes.post("/bulk-upload", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic && identity.actor_level !== "hr-unit") {
    throw new HTTPException(403, { message: "Hanya HR ICF atau HR Unit Usaha yang dapat mengunggah file Excel Project Outside Job Scope." });
  }
  const body = await c.req.json();
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > 95) {
    throw new WorkflowError("File Excel Project Outside Job Scope wajib memuat minimal 1 data karyawan yang valid.");
  }
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : "Upload_Project_ICF.xlsx";
  const now = new Date().toISOString();
  const updatedDocuments: ProjectSimulationDocument[] = [];

  for (const entry of body.entries) {
    const employeeId = typeof entry?.employeeId === "string" ? entry.employeeId.trim() : "";
    if (!simulationEmployees.some((emp) => emp.id === employeeId)) {
      throw new WorkflowError(`ID Karyawan "${employeeId}" pada file Excel tidak ditemukan dalam daftar peserta PA-Simulasi.`);
    }
    const document = await loadDoc(client, employeeId);
    if (!canManageProjectUpload(document, identity.identity_id, identity.actor_level, identity.unit_id, strategic)) {
      throw new HTTPException(403, { message: `Anda tidak memiliki akses HR Unit Usaha / HR ICF untuk mengunggah Project karyawan ${employeeId}.` });
    }
    const actorIds = [...new Set([employeeId, identity.identity_id, ...document.stages.map((stage) => stage.actorId)])];
    const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
    if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
      throw new WorkflowError(`Penugasan akun simulasi untuk karyawan ${employeeId} belum lengkap.`);
    }
    const window = await loadWindow(client, document.snapshot.unitId);
    // Automatically submit directly to Approval Level 1 -> Approval Level 2 for each employee
    const next = transitionProjectDocument(document, {
      action: "submit",
      actorId: identity.identity_id,
      actorLevel: identity.actor_level,
      actorUnitId: identity.unit_id,
      strategic,
      rows: entry.rows,
      fileName,
      note: `Upload otomatis dari sistem eksternal (${fileName})`,
      now,
      window,
    });
    const recipients = projectNotificationRecipients(next, "submit");
    const payload = {
      action: "submit",
      module: "Project Outside Job Scope",
      period: next.period,
      employeeId,
      status: next.status,
      at: now,
      link: "/pa-simulasi?view=project",
      timezone: "Asia/Jakarta",
    };
    const { error } = await client.rpc("pa_sim_commit_project", {
      employee: employeeId,
      appraisal_period: "2026",
      expected_version: document.version,
      next_document: next,
      recipients,
      notification_payload: payload,
    });
    if (error) {
      throw new HTTPException(409, { message: `Gagal menyimpan Project untuk karyawan ${employeeId}; muat ulang halaman.` });
    }
    updatedDocuments.push(next);
  }

  return c.json({ documents: updatedDocuments, persisted: true, count: updatedDocuments.length });
});

projectRoutes.post("/:employeeId/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!simulationEmployees.some((emp) => emp.id === employeeId)) {
    throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  }
  const document = await loadDoc(client, employeeId);
  if (!canReadProject(document, identity.identity_id, identity.actor_level, identity.unit_id, strategic)) {
    throw new HTTPException(403, { message: "Tidak memiliki penugasan untuk Project Outside Job Scope ini." });
  }
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) {
    throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  }
  const actorIds = [...new Set([employeeId, identity.identity_id, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh penugasan Project Outside Job Scope wajib terhubung dengan akun simulasi.");
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, document.snapshot.unitId);
  const next = transitionProjectDocument(document, {
    action: body.action,
    actorId: identity.identity_id,
    actorLevel: identity.actor_level,
    actorUnitId: identity.unit_id,
    strategic,
    rows: body.rows,
    fileName: body.fileName,
    note: body.note,
    now,
    window,
  });
  const recipients = projectNotificationRecipients(next, body.action);
  const payload = {
    action: body.action,
    module: "Project Outside Job Scope",
    period: next.period,
    employeeId,
    status: next.status,
    at: now,
    link: "/pa-simulasi?view=project",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_project", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: next,
    recipients,
    notification_payload: payload,
  });
  if (error) {
    throw new HTTPException(409, { message: "Project Outside Job Scope tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  }
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});
