import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { simulationEmployees } from "./shared/paSimulation2026.ts";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiWindow } from "./shared/kpiSettingWorkflow.ts";
import {
  canReadIdfDocument,
  createIdfDocument,
  isEligibleForIdf,
  nominateIdfGivers,
  sanitizeIdfDocumentForViewer,
  submitIdfApproverFollowUp,
  submitIdfColleagueFeedback,
  submitIdfRecipientSummary,
} from "./shared/interDepartmentFeedbackWorkflow.ts";
import type { IdfDocument, IdfTaskView } from "./shared/interDepartmentFeedbackWorkflow.ts";

export const interDepartmentFeedbackRoutes = new Hono();
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];

interDepartmentFeedbackRoutes.use("*", bodyLimit({ maxSize: 300000 }));
interDepartmentFeedbackRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi Inter-Department Feedback belum tersimpan. Periksa migrasi dan muat ulang." }, 503);
});

async function loadWindow(client: Client, unitId: string): Promise<KpiWindow | null> {
  const { data, error } = await client.from("pa_sim_idf_windows").select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Inter-Department Feedback terlebih dahulu." });
  if (!data) return null;
  return { startDate: data.start_date, endDate: data.end_date, locked: data.locked };
}

async function loadDoc(client: Client, employeeId: string): Promise<IdfDocument> {
  const { data, error } = await client.from("pa_sim_idf_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Penyimpanan Inter-Department Feedback belum tersedia." });
  return data?.document ?? createIdfDocument(employeeId);
}

interDepartmentFeedbackRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: records, error } = await client.from("pa_sim_idf_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi Inter-Department Feedback terlebih dahulu." });
  const allDocuments: IdfDocument[] = (records ?? []).map((row) => row.document as IdfDocument);

  if (isEligibleForIdf(identity.identity_id) && !allDocuments.some((doc) => doc.employeeId === identity.identity_id)) {
    allDocuments.push(createIdfDocument(identity.identity_id));
  }

  const visibleDocuments = allDocuments
    .filter((doc) => canReadIdfDocument(doc, identity.identity_id, strategic))
    .map((doc) => sanitizeIdfDocumentForViewer(doc, identity.identity_id));

  const tasks: IdfTaskView[] = allDocuments.flatMap((doc) => {
    const nom = doc.nominations.find((n) => n.giverId === identity.identity_id);
    if (!nom) return [];
    const emp = simulationEmployees.find((e) => e.id === doc.employeeId);
    if (!emp) return [];
    return [
      {
        recipientId: emp.id,
        recipientName: emp.name,
        recipientPosition: emp.position,
        recipientDepartment: emp.department,
        recipientDivision: emp.division,
        recipientCompanyUnit: emp.companyUnit,
        unitId: emp.unitId,
        status: nom.status,
        submittedAt: nom.submittedAt,
        documentVersion: doc.version,
      },
    ];
  });

  const unitIds = [
    ...new Set([
      ...(strategic ? simulationEmployees.map((emp) => emp.unitId) : []),
      ...visibleDocuments.map((doc) => doc.snapshot.unitId),
      ...tasks.map((task) => task.unitId),
      ...(identity.unit_id ? [identity.unit_id] : []),
    ]),
  ];
  const windows = [];
  for (const unitId of unitIds) {
    windows.push({ unitId, window: await loadWindow(client, unitId) });
  }

  return c.json({
    documents: visibleDocuments,
    tasks,
    windows,
    serverNow: new Date().toISOString(),
  });
});

interDepartmentFeedbackRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Jadwal Inter-Department Feedback hanya dikelola HR Strategic." });
  const body = await c.req.json();
  const datesValid = [body.startDate, body.endDate].every(
    (value) => typeof value === "string" && /^2026-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
  if (!simulationEmployees.some((emp) => emp.unitId === body.unitId) || !datesValid || body.endDate < body.startDate) {
    throw new WorkflowError("Unit atau urutan tanggal 2026 tidak valid.");
  }
  const existing = await loadWindow(client, body.unitId);
  if (existing?.locked) throw new HTTPException(409, { message: "Fase terkunci; jadwal tidak boleh dibuka ulang." });
  const { error } = await client.from("pa_sim_idf_windows").upsert({
    unit_id: body.unitId,
    period: "2026",
    start_date: body.startDate,
    end_date: body.endDate,
    locked: false,
    updated_by: identity.identity_id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new HTTPException(503, { message: "Jadwal Inter-Department Feedback gagal disimpan." });
  return c.json({ saved: true });
});

interDepartmentFeedbackRoutes.post("/:employeeId/action", async (c) => {
  const { client, identity } = await simulationContext(c.req.header("Authorization"));
  const employeeId = c.req.param("employeeId");
  if (!simulationEmployees.some((emp) => emp.id === employeeId)) {
    throw new HTTPException(404, { message: "Peserta simulasi tidak ditemukan." });
  }
  const document = await loadDoc(client, employeeId);
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) {
    throw new HTTPException(409, { message: "Data berubah. Muat ulang sebelum melanjutkan." });
  }
  const now = new Date().toISOString();
  const window = await loadWindow(client, document.snapshot.unitId);

  let result: { document: IdfDocument; recipients: string[] };
  if (body.action === "nominate") {
    result = nominateIdfGivers(document, {
      actorId: identity.identity_id,
      giverIds: body.giverIds,
      now,
      window,
    });
  } else if (body.action === "give-feedback") {
    result = submitIdfColleagueFeedback(document, {
      giverId: identity.identity_id,
      answers: body.answers,
      now,
      window,
    });
  } else if (body.action === "save-summary" || body.action === "submit-summary") {
    result = submitIdfRecipientSummary(document, {
      actorId: identity.identity_id,
      summaries: body.summaries,
      submit: body.action === "submit-summary",
      now,
      window,
    });
  } else if (body.action === "submit-follow-up") {
    result = submitIdfApproverFollowUp(document, {
      actorId: identity.identity_id,
      rows: body.rows,
      now,
      window,
    });
  } else {
    throw new WorkflowError("Tindakan Inter-Department Feedback tidak dikenali.");
  }

  const actorIds = [
    ...new Set([
      employeeId,
      ...result.document.nominations.map((n) => n.giverId),
      ...result.document.stages.map((s) => s.actorId),
    ]),
  ];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) {
    throw new WorkflowError("Seluruh akun penerima, pemberi feedback, dan approver wajib terhubung dengan akun simulasi.");
  }

  const payload = {
    action: body.action,
    module: "Inter-Department Feedback",
    period: result.document.period,
    employeeId,
    status: result.document.status,
    at: now,
    link: "/pa-simulasi?view=idf",
    timezone: "Asia/Jakarta",
  };
  const { error } = await client.rpc("pa_sim_commit_idf", {
    employee: employeeId,
    appraisal_period: "2026",
    expected_version: document.version,
    next_document: result.document,
    recipients: result.recipients,
    notification_payload: payload,
  });
  if (error) {
    throw new HTTPException(409, { message: "Inter-Department Feedback tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  }
  return c.json({
    document: sanitizeIdfDocumentForViewer(result.document, identity.identity_id),
    persisted: true,
    emailDelivery: "pending-integration",
  });
});
