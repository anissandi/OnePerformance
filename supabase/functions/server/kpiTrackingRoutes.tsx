import { Hono } from "npm:hono";
import { HTTPException } from "npm:hono/http-exception";
import { bodyLimit } from "npm:hono/body-limit";
import { simulationContext } from "./kpiSettingRoutes.tsx";
import { canReadKpi, kpiNotificationRecipients, WorkflowError } from "./shared/kpiSettingWorkflow.ts";
import type { KpiDocument } from "./shared/kpiSettingWorkflow.ts";
import { annualKpiScore, assertTrackingAccess, createTrackingDocument, trackingAchievements, trackingScope, transitionTracking, validDate, validateTrackingWindow, validateTrackingEvidence, wibDate } from "./shared/kpiTrackingWorkflow.ts";
import type { OpenLock, TrackingDocument, TrackingWindow } from "./shared/kpiTrackingWorkflow.ts";

export const kpiTrackingRoutes = new Hono();
kpiTrackingRoutes.use("*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
type Client = Awaited<ReturnType<typeof simulationContext>>["client"];
const bucket = "pa-sim-kpi-evidence";
async function measurementWindow(client: Client, unitId: string): Promise<TrackingWindow | null> {
  const { data, error } = await client.from("pa_sim_tracking_windows").select("*").eq("unit_id", unitId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Migrasi KPI Measurement belum tersedia." });
  if (!data) return null;
  const window: TrackingWindow = { startDate: data.start_date, endDate: data.end_date, dateLock: data.date_lock, backlogMonths: data.backlog_months, backlogEnd: data.backlog_end, locked: data.locked };
  validateTrackingWindow(window);
  return window;
}
async function sourceSetting(client: Client, employeeId: string): Promise<KpiDocument> {
  const { data, error } = await client.from("pa_sim_kpi_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").maybeSingle();
  if (error) throw new HTTPException(503, { message: "Sumber KPI Setting belum tersedia." });
  if (!data || data.document.status !== "Validated") throw new WorkflowError("KPI Setting belum Validated; Tracking diblokir.");
  return data.document;
}
async function loadTracking(client: Client, employeeId: string, month: number) {
  const setting = await sourceSetting(client, employeeId);
  const { data, error } = await client.from("pa_sim_tracking_documents").select("document").eq("employee_id", employeeId).eq("period", "2026").eq("month", month).maybeSingle();
  if (error) throw new HTTPException(503, { message: "Migrasi KPI Measurement belum tersedia." });
  const document: TrackingDocument = data?.document ?? createTrackingDocument(setting, month);
  if (document.settingVersion !== setting.version) throw new HTTPException(409, { message: "Versi Setting berubah; penyesuaian masa penugasan belum tersambung. Data lama tidak ditimpa." });
  return { setting, document };
}
async function grantsFor(client: Client, employeeId: string, month: number): Promise<OpenLock[]> {
  const { data, error } = await client.from("pa_sim_kpi_open_locks").select("*").eq("employee_id", employeeId).eq("period", "2026").eq("month", month);
  if (error) throw new HTTPException(503, { message: "Penyimpanan Open Lock belum tersedia." });
  return data ?? [];
}
kpiTrackingRoutes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  if (error instanceof WorkflowError) return c.json({ error: error.message }, 400);
  return c.json({ error: "Operasi Tracking belum tersimpan. Periksa konfigurasi atau muat ulang." }, 503);
});
kpiTrackingRoutes.get("/", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: sources, error: sourceError } = await client.from("pa_sim_kpi_documents").select("document").eq("period", "2026");
  if (sourceError) throw new HTTPException(503, { message: "Sumber Setting tidak tersedia." });
  const settings: KpiDocument[] = (sources ?? []).map((record) => record.document).filter((setting) => setting.status === "Validated" && canReadKpi(setting, identity.identity_id, strategic));
  const { data: records, error } = await client.from("pa_sim_tracking_documents").select("document").eq("period", "2026");
  if (error) throw new HTTPException(503, { message: "Jalankan migrasi KPI Measurement terlebih dahulu." });
  const documents: TrackingDocument[] = (records ?? []).map((record) => record.document).filter((document) => canReadKpi(document, identity.identity_id, strategic));
  const ownerSetting = settings.find((setting) => setting.employeeId === identity.identity_id);
  if (ownerSetting) for (let month = 1; month <= 12; month++) if (!documents.some((document) => document.employeeId === ownerSetting.employeeId && document.month === month)) documents.push(createTrackingDocument(ownerSetting, month));
  const windows = [];
  const unitIds = strategic ? ["IND","PKB","RSTM","GHS","ASD","GTG","KEN"] : [...new Set(settings.map((setting) => setting.snapshot.unitId))];
  for (const unitId of unitIds) windows.push({ unitId, window: await measurementWindow(client, unitId) });
  const { data: locks, error: lockError } = await client.from("pa_sim_kpi_open_locks").select("*").eq("period", "2026").order("created_at", { ascending: false });
  if (lockError) throw new HTTPException(503, { message: "Penyimpanan Open Lock belum tersedia." });
  const openLocks: OpenLock[] = (locks ?? []).filter((request) => strategic || request.requester_id === identity.identity_id || settings.some((setting) => setting.employeeId === request.employee_id));
  const evidenceIds = [...new Set(documents.flatMap((document) => document.evidence))];
  const evidence = evidenceIds.length ? await client.from("pa_sim_tracking_evidence").select("id,employee_id,month,file_name,size,content_type").in("id", evidenceIds) : { data: [], error: null };
  if (evidence.error) throw new HTTPException(503, { message: "Data bukti tidak tersedia." });
  const { data: triggers, error: triggerError } = await client.from("pa_sim_kpi_rca_triggers").select("*").eq("period", "2026");
  if (triggerError) throw new HTTPException(503, { message: "Penyimpanan pemicu RCA belum tersedia." });
  return c.json({ settings, documents, windows, openLocks, evidence: evidence.data, serverNow: new Date().toISOString(), scores: settings.map((setting) => ({ employeeId: setting.employeeId, ...annualKpiScore(setting, documents) })), rcaTriggers: (triggers ?? []).filter((trigger) => settings.some((setting) => setting.employeeId === trigger.employee_id)), emailDelivery: "pending-integration" });
});
kpiTrackingRoutes.post("/window", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Hanya HR Strategic mengatur KPI Measurement." });
  const body = await c.req.json();
  const window: TrackingWindow = { startDate: body.startDate, endDate: body.endDate, dateLock: body.dateLock, backlogMonths: body.backlogMonths, backlogEnd: body.backlogEnd, locked: false };
  validateTrackingWindow(window);
  if (!["IND","PKB","RSTM","GHS","ASD","GTG","KEN"].includes(body.unitId)) throw new WorkflowError("Unit tidak berlaku.");
  if ((await measurementWindow(client, body.unitId))?.locked) throw new HTTPException(409, { message: "Fase terkunci." });
  const { error } = await client.rpc("pa_sim_save_tracking_window", { unit: body.unitId, actor: identity.identity_id, configuration: window });
  if (error) throw new HTTPException(503, { message: "Jadwal Measurement tidak tersimpan." });
  return c.json({ saved: true });
});
kpiTrackingRoutes.post("/:employeeId/:month/action", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { document } = await loadTracking(client, c.req.param("employeeId"), Number(c.req.param("month")));
  if (!canReadKpi(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Pengajuan tidak sesuai penugasan." });
  const body = await c.req.json();
  if (!Number.isInteger(body.version) || body.version !== document.version) throw new HTTPException(409, { message: "Versi berubah; muat ulang." });
  const actorIds = [...new Set([document.employeeId, ...document.stages.map((stage) => stage.actorId)])];
  const { data: actors, error: actorError } = await client.from("pa_sim_identities").select("identity_id,auth_user_id").in("identity_id", actorIds);
  if (actorError || actors?.length !== actorIds.length || actors.some((actor) => !actor.auth_user_id)) throw new WorkflowError("Penugasan belum lengkap dengan akun simulasi.");
  const now = new Date().toISOString();
  const next = transitionTracking(document, { action: body.action, actorId: identity.identity_id, actuals: body.actuals, evidence: body.evidence, note: body.note, now, window: await measurementWindow(client, document.snapshot.unitId), grants: await grantsFor(client, document.employeeId, document.month) });
  if (next.evidence.length) {
    const { data: files, error: fileError } = await client.from("pa_sim_tracking_evidence").select("id").in("id", next.evidence).eq("employee_id", document.employeeId).eq("period", "2026").eq("month", document.month);
    if (fileError || files?.length !== next.evidence.length) throw new WorkflowError("Lampiran harus berasal dari upload privat karyawan dan bulan ini.");
  }
  const payload = { module: "KPI Measurement", action: body.action, employeeId: next.employeeId, period: next.period, month: next.month, status: next.status, at: now, link: "/pa-simulasi?view=measurement", timezone: "Asia/Jakarta" };
  const rca = next.status === "Validated" ? trackingAchievements(next).filter((item) => item.achievement !== null && item.achievement < 100) : [];
  const { error } = await client.rpc("pa_sim_commit_tracking", { employee: next.employeeId, tracking_month: next.month, expected_version: document.version, next_document: next, recipients: kpiNotificationRecipients(next, body.action), notification_payload: payload, rca_triggers: rca });
  if (error) throw new HTTPException(409, { message: "Tracking tidak tersimpan; jadwal atau versi mungkin berubah. Muat ulang." });
  return c.json({ document: next, persisted: true, emailDelivery: "pending-integration" });
});
kpiTrackingRoutes.post("/:employeeId/:month/evidence", async (c) => {
  const { client, identity } = await simulationContext(c.req.header("Authorization"));
  const { document } = await loadTracking(client, c.req.param("employeeId"), Number(c.req.param("month")));
  if (identity.identity_id !== document.employeeId || !(document.status === "Draft" || document.revisionStage !== null)) throw new HTTPException(403, { message: "Upload hanya oleh pemilik Draft/revisi resmi." });
  assertTrackingAccess(document, trackingScope(document, "save"), new Date().toISOString(), await measurementWindow(client, document.snapshot.unitId), await grantsFor(client, document.employeeId, document.month));
  const file = (await c.req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 10485760 || !["image/jpeg","image/png","application/pdf"].includes(file.type)) throw new WorkflowError("Bukti harus JPG/PNG/PDF, maksimal 10 MB per file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateTrackingEvidence(file.type, file.size, bytes);
  const id = crypto.randomUUID();
  const path = `2026/${document.employeeId}/${document.month}/${id}`;
  const { error: uploadError } = await client.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) throw new HTTPException(503, { message: "Upload bukti privat gagal." });
  const metadata = { id, employee_id: document.employeeId, period: "2026", month: document.month, file_name: file.name.slice(0,200), content_type: file.type, size: file.size, storage_path: path };
  const { error } = await client.from("pa_sim_tracking_evidence").insert(metadata);
  if (error) { await client.storage.from(bucket).remove([path]); throw new HTTPException(503, { message: "Metadata bukti tidak tersimpan." }); }
  return c.json({ id, file_name: metadata.file_name, size: file.size, content_type: file.type });
});
kpiTrackingRoutes.get("/evidence/:id", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  const { data: file, error } = await client.from("pa_sim_tracking_evidence").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (error || !file) throw new HTTPException(404, { message: "Bukti tidak tersedia." });
  const { document } = await loadTracking(client, file.employee_id, file.month);
  if (identity.identity_id !== file.employee_id) {
    if (!canReadKpi(document, identity.identity_id, strategic)) throw new HTTPException(403, { message: "Tidak berwenang melihat bukti." });
    const { data: events, error: historyError } = await client.from("pa_sim_tracking_events").select("id").eq("employee_id", file.employee_id).eq("month", file.month).contains("document", { evidence: [file.id] }).limit(1);
    if (historyError || !events?.length) throw new HTTPException(403, { message: "Bukti belum dilampirkan pada versi pengajuan." });
  }
  const { data, error: downloadError } = await client.storage.from(bucket).download(file.storage_path);
  if (downloadError || !data) throw new HTTPException(503, { message: "Bukti tidak dapat dimuat." });
  return new Response(data, { headers: { "Content-Type": file.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
});
kpiTrackingRoutes.post("/:employeeId/:month/open-lock", async (c) => {
  const { client, identity } = await simulationContext(c.req.header("Authorization"));
  const { document } = await loadTracking(client, c.req.param("employeeId"), Number(c.req.param("month")));
  const body = await c.req.json();
  if (document.status === "Validated" || typeof body.reason !== "string" || !body.reason.trim()) throw new WorkflowError("Pengajuan wajib memiliki alasan dan belum tervalidasi final.");
  if (document.items.every((item) => item.months[document.month - 1].target === null)) throw new WorkflowError("Bulan ini Tidak Berlaku sesuai Setting; tidak memerlukan Open Lock.");
  const owner = document.employeeId === identity.identity_id;
  const scope = owner ? document.revisionStage !== null ? "revision" : "submission" : "approval";
  if (owner ? !(document.status === "Draft" || document.revisionStage !== null) : document.revisionStage !== null || document.stages[document.activeStage]?.actorId !== identity.identity_id) throw new HTTPException(403, { message: "Pemohon harus pemilik tindakan yang sedang terkunci." });
  const window = await measurementWindow(client, document.snapshot.unitId);
  if (!window || window.locked || wibDate(new Date().toISOString()) < window.startDate || wibDate(new Date().toISOString()) < `2026-${String(document.month).padStart(2,"0")}-01`) throw new WorkflowError("Fase terkunci/belum dibuka atau bulan masih mendatang.");
  let accessOpen = true;
  try { assertTrackingAccess(document, scope, new Date().toISOString(), window, await grantsFor(client, document.employeeId, document.month)); } catch (error) { if (!(error instanceof WorkflowError)) throw error; accessOpen = false; }
  if (accessOpen) throw new WorkflowError("Akses tindakan masih terbuka; Open Lock belum diperlukan.");
  const id = crypto.randomUUID();
  const { error } = await client.rpc("pa_sim_commit_open_lock", { request_id: id, actor: identity.identity_id, request_data: { employeeId: document.employeeId, month: document.month, scope, reason: body.reason.trim() }, decision: "request", decision_expiry: null, note: null });
  if (error) throw new HTTPException(409, { message: "Request tidak tersimpan; request sejenis mungkin masih Pending." });
  return c.json({ id, saved: true });
});
kpiTrackingRoutes.post("/open-lock/:id/decision", async (c) => {
  const { client, identity, strategic } = await simulationContext(c.req.header("Authorization"));
  if (!strategic) throw new HTTPException(403, { message: "Hanya HR Strategic memutuskan Open Lock." });
  const body = await c.req.json();
  if (!["Approved","Rejected"].includes(body.decision) || typeof body.note !== "string" || !body.note.trim() || (body.decision === "Approved" && (!validDate(body.expiresOn) || body.expiresOn < wibDate(new Date().toISOString())))) throw new WorkflowError("Keputusan, catatan, dan tanggal akhir akses untuk persetujuan wajib valid.");
  const { data: request, error: requestError } = await client.from("pa_sim_kpi_open_locks").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (requestError || !request) throw new HTTPException(404, { message: "Request tidak tersedia." });
  if (request.requester_id === identity.identity_id) throw new HTTPException(403, { message: "Tidak boleh memutuskan request sendiri." });
  const { document } = await loadTracking(client, request.employee_id, request.month);
  if (document.status === "Validated" || (await measurementWindow(client, document.snapshot.unitId))?.locked) throw new WorkflowError("Pengajuan sudah selesai atau fase terkunci.");
  const { error } = await client.rpc("pa_sim_commit_open_lock", { request_id: request.id, actor: identity.identity_id, request_data: null, decision: body.decision, decision_expiry: body.decision === "Approved" ? body.expiresOn : null, note: body.note.trim() });
  if (error) throw new HTTPException(409, { message: "Keputusan tidak tersimpan; request mungkin sudah diputuskan." });
  return c.json({ saved: true });
});
