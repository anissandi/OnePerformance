import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import { validateTrackingEvidence } from "./shared/kpiTrackingWorkflow.ts";
import { canEditRca, canReadRca, createRcaDocument, rcaEvidenceIds, rcaRecipients, transitionRca } from "./shared/rcaWorkflow.ts";
import type { RcaDocument, RcaTrigger } from "./shared/rcaWorkflow.ts";

export const rcaRoutes = new Hono();
const bucket = "pa-simulation-rca-evidence";
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];
rcaRoutes.use("*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
rcaRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "RCA tidak tersimpan. Periksa migrasi dan muat ulang." }, 503);
});
function triggerId(value: string) {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) throw new HTTPException(400, { message: "ID pemicu RCA tidak valid." });
  return id;
}
async function loadRca(client: Client, id: number): Promise<RcaDocument> {
  const { data: trigger, error } = await client.from("pa_sim_kpi_rca_triggers").select("*").eq("id", id).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Pemicu RCA belum tersedia." });
  if (!trigger) throw new HTTPException(404, { message: "Pemicu RCA tidak ditemukan." });
  const { data: source, error: sourceError } = await client.from("pa_sim_tracking_events").select("document").eq("employee_id", trigger.employee_id).eq("period", trigger.period).eq("month", trigger.month).eq("version", trigger.source_version).maybeSingle();
  if (sourceError || !source) throw new HTTPException(503, { message: "Sumber Tracking tervalidasi tidak tersedia." });
  const initial = createRcaDocument(trigger as RcaTrigger, source.document);
  const { data, error: documentError } = await client.from("pa_sim_rca_documents").select("document").eq("trigger_id", id).maybeSingle();
  if (documentError) throw new HTTPException(503, { message: "Jalankan migrasi RCA dan redeploy Edge Function terlebih dahulu." });
  if (!data?.document) return initial;
  const document: RcaDocument = data.document;
  // Recover the real submission baseline for documents saved before this field existed.
  if (document.lastSubmittedEvidence === undefined && document.history.some((event) => event.action === "submit")) {
    const { data: events, error: historyError } = await client.from("pa_sim_rca_events").select("document").eq("trigger_id", id).order("version", { ascending: false });
    if (historyError) throw new HTTPException(503, { message: "Riwayat evidence RCA belum dapat diperiksa." });
    const submission = events?.find((event) => {
      const history = (event.document as RcaDocument).history;
      return history[history.length - 1]?.action === "submit";
    });
    if (!submission) throw new HTTPException(503, { message: "Riwayat submission RCA tidak lengkap." });
    document.lastSubmittedEvidence = rcaEvidenceIds(submission.document);
  }
  return document;
}
rcaRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: triggers, error } = await client.from("pa_sim_kpi_rca_triggers").select("id").eq("period", "2026").order("id");
  if (error) throw new HTTPException(503, { message: "Pemicu RCA tidak tersedia." });
  // Check schema even when there are no triggers yet.
  const { error: schemaError } = await client.from("pa_sim_rca_documents").select("trigger_id").limit(1);
  if (schemaError) throw new HTTPException(503, { message: "Migrasi RCA belum diterapkan." });
  const documents: RcaDocument[] = [];
  for (const trigger of triggers ?? []) {
    const document = await loadRca(client, trigger.id);
    if (canReadRca(document, identity.identity_id, strategic)) documents.push(document);
  }
  const ids = [...new Set(documents.flatMap(rcaEvidenceIds))];
  const evidence = ids.length ? await client.from("pa_sim_rca_evidence").select("id,file_name,size,content_type").in("id", ids) : { data: [], error: null };
  if (evidence.error) throw new HTTPException(503, { message: "Metadata evidence RCA tidak tersedia." });
  return c.json({ documents, evidence: evidence.data, serverNow: new Date().toISOString() });
});
rcaRoutes.post("/:id/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const document = await loadRca(client, triggerId(c.req.param("id")));
  if (!canReadRca(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak memiliki penugasan RCA ini." });
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) throw new HTTPException(409, { message: "RCA berubah. Muat ulang sebelum melanjutkan." });
  const next = transitionRca(document, { action: body.action, actorId: identity.identity_id, problems: body.problems, note: body.note, now: new Date().toISOString() });
  const ids = rcaEvidenceIds(next);
  if (ids.length) {
    const { data, error } = await client.from("pa_sim_rca_evidence").select("id").eq("trigger_id", document.triggerId).in("id", ids);
    if (error || data?.length !== ids.length) throw new WorkflowError("Evidence tidak terdaftar untuk pemicu RCA ini.");
  }
  const actorIds = [...new Set([next.employeeId, ...next.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) throw new WorkflowError("Seluruh penugasan RCA wajib terhubung dengan akun simulasi.");
  const { error } = await client.rpc("pa_sim_commit_rca", {
    source_trigger: document.triggerId, expected_version: document.version, next_document: next,
    recipients: rcaRecipients(next, body.action),
    notification_payload: { module: "RCA", action: body.action, employeeId: next.employeeId, period: next.period, month: next.month,
      status: next.status, at: new Date().toISOString(), link: "/pa-simulasi?view=rca", triggerId: next.triggerId },
  });
  if (error) throw new HTTPException(409, { message: "RCA tidak tersimpan; versi mungkin berubah. Muat ulang sebelum mengulang tindakan." });
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});
rcaRoutes.post("/:id/evidence", async (c) => {
  const { client, identity } = await simulationContext(c.req.header("Authorization"));
  const document = await loadRca(client, triggerId(c.req.param("id")));
  if (!canEditRca(document, identity.identity_id)) throw new HTTPException(403, { message: "Upload hanya untuk pemilik RCA yang dapat diedit." });
  const file = (await c.req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10485760 || !["image/jpeg", "image/png", "application/pdf"].includes(file.type)) throw new WorkflowError("Evidence JPG/PNG/PDF maksimal 10 MB/file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateTrackingEvidence(file.type, file.size, bytes);
  const id = crypto.randomUUID();
  const path = `2026/${document.employeeId}/${document.triggerId}/${id}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw new HTTPException(503, { message: "Upload evidence RCA gagal." });
  const metadata = { id, trigger_id: document.triggerId, file_name: file.name.slice(0, 200), content_type: file.type, size: file.size, storage_path: path };
  const { error } = await client.from("pa_sim_rca_evidence").insert(metadata);
  if (error) { await client.storage.from(bucket).remove([path]); throw new HTTPException(503, { message: "Metadata evidence gagal disimpan." }); }
  return c.json({ id, file_name: metadata.file_name, content_type: file.type, size: file.size });
});
rcaRoutes.get("/evidence/:id", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: file, error } = await client.from("pa_sim_rca_evidence").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (error || !file) throw new HTTPException(404, { message: "Evidence tidak tersedia." });
  const document = await loadRca(client, file.trigger_id);
  if (!canReadRca(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak berwenang melihat evidence RCA." });
  if (identity.identity_id !== document.employeeId) {
    const { data: events, error: eventError } = await client.from("pa_sim_rca_events").select("document").eq("trigger_id", file.trigger_id);
    if (eventError || !events?.some((event) => event.document.history.some((entry: { action: string }) => entry.action === "submit") && rcaEvidenceIds(event.document).includes(file.id))) throw new HTTPException(403, { message: "Evidence belum dilampirkan pada pengajuan." });
  }
  const { data, error: downloadError } = await client.storage.from(bucket).download(file.storage_path);
  if (downloadError || !data) throw new HTTPException(503, { message: "Evidence gagal dimuat." });
  return new Response(data, { headers: { "Content-Type": file.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
});
