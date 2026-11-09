import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, Plus, RefreshCw, Upload, X } from "lucide-react";
import { canEditRca, isRcaClosed, rcaAllFinal, rcaEvidenceIds, rcaProgress, rcaStatuses } from "../../../../supabase/functions/server/shared/rcaWorkflow";
import type { RcaDocument, RcaPlan, RcaProblem } from "../../../../supabase/functions/server/shared/rcaWorkflow";
import type { KpiAction } from "../../domain/kpiSettingWorkflow";
import { simulationEmployees } from "../../data/paSimulation2026";
import { actOnSimulationRca, fetchRcaEvidence, loadSimulationRca, uploadRcaEvidence } from "../../services/paSimulationApi";
import type { RcaOverview, SimulationIdentity, TrackingEvidence } from "../../services/paSimulationApi";

const input = "mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600";
const button = "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const newPlan = (): RcaPlan => ({ id: crypto.randomUUID(), action: "", targetDate: "", pic: "", status: "Belum dilaksanakan", keterangan: "", output: "", evidence: [] });
const newProblem = (): RcaProblem => ({ id: crypto.randomUUID(), masalahUtama: "", kenapaA: "", kenapaB: "", kenapaC: "", actionPlans: [newPlan()] });
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export function SimulationRca({ identity, mode = "own", refreshNotifications }: { identity: SimulationIdentity; mode?: "own" | "approvals"; refreshNotifications: () => Promise<void> }) {
  const [overview, setOverview] = useState<RcaOverview | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [problems, setProblems] = useState<RcaProblem[]>([]);
  const [files, setFiles] = useState<TrackingEvidence[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");
  const [confirmation, setConfirmation] = useState<KpiAction | null>(null);
  const [proof, setProof] = useState<{ url: string; name: string; type: string } | null>(null);
  const proofUrl = useRef<string | null>(null);
  const isApprovalsMode = mode === "approvals";
  const scopedDocuments = overview?.documents.filter((record) => isApprovalsMode ? record.employeeId !== identity.identity_id : record.employeeId === identity.identity_id) ?? [];
  const document = scopedDocuments.find((record) => record.triggerId === selected);
  const editable = !isApprovalsMode && !!document && canEditRca(document, identity.identity_id);
  const activeStage = document?.stages[document.activeStage];
  const actionable = isApprovalsMode && !!document && document.status.startsWith("Pending") && document.revisionStage === null && activeStage?.actorId === identity.identity_id;
  const visible = scopedDocuments.filter((record) => filter === "all" || (filter === "closed" ? isRcaClosed(record) : !isRcaClosed(record)));
  const progress = rcaProgress(problems);
  const savedEvidence = new Set(document ? rcaEvidenceIds(document) : []);
  const needsNewEvidence = !!document?.history.some((event) => event.action === "submit");
  const previousSubmissionEvidence = new Set(document?.lastSubmittedEvidence ?? [...savedEvidence]);
  const newEvidenceCount = [...new Set(problems.flatMap((problem) => problem.actionPlans.flatMap((plan) => plan.evidence)))].filter((id) => !previousSubmissionEvidence.has(id)).length;
  function select(record: RcaDocument) { setSelected(record.triggerId); setProblems(structuredClone(record.problems)); setNote(""); setConfirmation(null); }
  function accept(result: RcaOverview, preferred = selected) {
    setOverview(result); setFiles(result.evidence);
    const scoped = result.documents.filter((entry) => isApprovalsMode ? entry.employeeId !== identity.identity_id : entry.employeeId === identity.identity_id);
    const matches = scoped.filter((entry) => filter === "all" || (filter === "closed" ? isRcaClosed(entry) : !isRcaClosed(entry)));
    const record = matches.find((entry) => entry.triggerId === preferred) ?? matches[0];
    if (record) select(record); else { setSelected(null); setProblems([]); }
  }
  async function refresh() { accept(await loadSimulationRca()); }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Operasi RCA gagal."); } finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationRca().then((result) => { if (active) accept(result); }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : "RCA belum tersedia."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [identity.identity_id]);
  useEffect(() => () => { if (proofUrl.current) URL.revokeObjectURL(proofUrl.current); }, []);
  function patchProblem(id: string, patch: Partial<RcaProblem>) { setProblems((current) => current.map((problem) => problem.id === id ? { ...problem, ...patch } : problem)); }
  function patchPlan(problemId: string, planId: string, patch: Partial<RcaPlan>) {
    setProblems((current) => current.map((problem) => problem.id === problemId ? { ...problem, actionPlans: problem.actionPlans.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan) } : problem));
  }
  async function act(action: KpiAction) {
    if (!document) return;
    await run(async () => {
      await actOnSimulationRca(document, action, editable ? problems : undefined, note);
      setConfirmation(null); setMessage("Tindakan RCA tersimpan. Notifikasi dalam aplikasi tersedia; email belum tersambung.");
      try { await refresh(); await refreshNotifications(); } catch { setError("Tindakan tersimpan, tetapi pemuatan ulang gagal. Jangan ulangi keputusan; klik Muat ulang."); }
    });
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-500">RCA dari pemicu ketidakcapaian KPI Tracking yang sudah Validated · 2026</p><button disabled={busy} onClick={() => void run(refresh)} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15} />Muat ulang</button></div>
    <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Alur: analisis penyebab dan rencana → checker → approver → validator → pembaruan progres → pemeriksaan ulang → Closed. RCA tidak mengubah aktual atau skor KPI yang telah divalidasi. Jadwal dan Open Lock khusus RCA belum diterapkan; tenggat setiap action plan dicatat terpisah dari lock KPI Tracking.</p>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{message}</p>}
    <div className="flex gap-2">{(["open", "closed", "all"] as const).map((value) => <button key={value} disabled={busy} onClick={() => { setFilter(value); const record = scopedDocuments.find((entry) => value === "all" || (value === "closed" ? isRcaClosed(entry) : !isRcaClosed(entry))); if (record) select(record); else setSelected(null); }} className={`rounded-lg border px-4 py-2 text-sm ${filter === value ? "bg-[#1A284F] text-white" : "bg-white"}`}>{value === "all" ? "Semua" : value === "open" ? "RCA Open" : "RCA Closed"}</button>)}</div>
    {!busy && overview && !visible.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-gray-500">{isApprovalsMode ? "Belum ada pengajuan RCA karyawan pada filter ini yang menunggu pemeriksaan/persetujuan Anda." : "Belum ada pemicu atau dokumen RCA pribadi Anda pada filter ini."}</p>}
    {!!visible.length && <label className="block text-sm font-medium">{isApprovalsMode ? "Pilih pengajuan RCA karyawan" : "Pilih RCA saya"}<select disabled={busy} value={selected ?? ""} onChange={(event) => { const record = scopedDocuments.find((entry) => entry.triggerId === Number(event.target.value)); if (record) select(record); }} className={input}>{visible.map((record) => <option key={record.triggerId} value={record.triggerId}>{record.employeeId} · Bulan {record.month} · {record.subject} · {record.status}</option>)}</select></label>}
    {document && <section className="space-y-5 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold text-[#1A284F]">{document.subject}</h2><p className="text-sm text-gray-500">{simulationEmployees.find((employee) => employee.id === document.employeeId)?.name} · {document.employeeId} · {document.unitId} · Bulan {document.month}/{document.period}</p></div><span className="text-sm font-semibold">{document.status} · v{document.version} · {document.cycle === "plan" ? "Rencana" : "Tindak lanjut"}</span></div>
      <div className="grid gap-3 rounded-lg bg-gray-50 p-4 text-sm sm:grid-cols-4"><p>Target: <strong>{document.target}</strong></p><p>Aktual: <strong>{document.actual}</strong></p><p>Capaian: <strong>{document.achievement.toFixed(2)}%</strong></p><p>Tracking v{document.sourceVersion} · Pemicu #{document.triggerId}</p></div>
      <ol className="flex flex-wrap gap-2">{document.stages.map((stage, index) => <li key={stage.stage} className={`rounded-lg border p-2 text-xs ${document.activeStage === index ? "border-blue-400 bg-blue-50" : ""}`}>{stage.stage} · {stage.actorId}{stage.stage === "approver-1" && document.mirrorSecondSlot ? " (A1 + A2)" : ""}</li>)}</ol>
      {document.revisionStage !== null && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Revisi diminta: {document.history.filter((event) => event.action === "revise").slice(-1)[0]?.note}. Submit ulang kembali ke tahap peminta revisi.</p>}
      {document.status === "Approved" && !isRcaClosed(document) && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">RCA telah tervalidasi dan masih dapat diperbarui. Setiap submit pembaruan wajib evidence baru; evidence lama tetap tersedia. RCA terkunci setelah seluruh action plan Selesai atau Dibatalkan dan lolos seluruh tahap approval.</p>}
      {isRcaClosed(document) && <p className="rounded-lg bg-green-50 p-3 text-sm font-semibold text-green-900">Seluruh action plan Selesai/Dibatalkan dan penutupan telah tervalidasi. Data terkunci; tidak dapat submit kembali. Evidence tetap dapat dilihat.</p>}
      {editable && needsNewEvidence && <p role="status" className={`rounded-lg border p-3 text-sm ${newEvidenceCount ? "border-blue-200 bg-blue-50 text-blue-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>Evidence baru sejak submission sebelumnya: <strong>{newEvidenceCount}</strong>. Tambahkan minimal satu evidence baru sebelum submit pembaruan/revisi. Simpan draft tidak menghapus evidence baru maupun evidence lama.</p>}
      {editable && rcaAllFinal(problems) && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Status action plan sudah final. Tetap submit dan selesaikan seluruh approval agar RCA terkunci.</p>}
      <p className="text-sm font-medium">Progres action plan aktif: {progress.complete}/{progress.total} selesai · {progress.total ? Math.round(progress.complete / progress.total * 100) : 0}%</p>
      {problems.map((problem, problemIndex) => <fieldset key={problem.id} disabled={!editable || busy} className="space-y-4 rounded-xl border p-4">
        <div className="flex justify-between gap-3"><h3 className="font-semibold">Masalah {problemIndex + 1}</h3>{editable && <button disabled={busy || problem.actionPlans.some((plan) => plan.evidence.some((id) => savedEvidence.has(id)))} onClick={() => setProblems((current) => current.filter((entry) => entry.id !== problem.id))} className="text-xs text-red-700 disabled:opacity-40">Hapus masalah</button>}</div>
        <div className="grid gap-3 md:grid-cols-2">{([["masalahUtama", "Masalah Utama (A)"], ["kenapaA", "Kenapa A? (B)"], ["kenapaB", "Kenapa B? (C)"], ["kenapaC", "Kenapa C? (D)"]] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<textarea className={input} value={problem[key]} onChange={(event) => patchProblem(problem.id, { [key]: event.target.value })} /></label>)}</div>
        {problem.actionPlans.map((plan, planIndex) => <div key={plan.id} className="space-y-3 rounded-xl border bg-gray-50 p-4">
          <div className="flex justify-between"><h4 className="text-sm font-semibold">Action Plan {planIndex + 1}</h4>{editable && <button disabled={plan.evidence.some((id) => savedEvidence.has(id))} onClick={() => patchProblem(problem.id, { actionPlans: problem.actionPlans.filter((entry) => entry.id !== plan.id) })} className="text-xs text-red-700 disabled:opacity-40">Hapus rencana</button>}</div>
          <label className="block text-sm">Usulan tindak lanjut<textarea className={input} value={plan.action} onChange={(event) => patchPlan(problem.id, plan.id, { action: event.target.value })} /></label>
          <div className="grid gap-3 md:grid-cols-3"><label className="text-sm">Target penyelesaian<input type="date" className={input} value={plan.targetDate} onChange={(event) => patchPlan(problem.id, plan.id, { targetDate: event.target.value })} /></label><label className="text-sm">PIC<input className={input} value={plan.pic} onChange={(event) => patchPlan(problem.id, plan.id, { pic: event.target.value })} /></label><label className="text-sm">Status perbaikan<select className={input} value={plan.status} onChange={(event) => patchPlan(problem.id, plan.id, { status: event.target.value as RcaPlan["status"] })}>{rcaStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div>
          <div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Keterangan / alasan<textarea className={input} value={plan.keterangan} onChange={(event) => patchPlan(problem.id, plan.id, { keterangan: event.target.value })} /></label><label className="text-sm">Output hasil perbaikan<textarea className={input} value={plan.output} onChange={(event) => patchPlan(problem.id, plan.id, { output: event.target.value })} /></label></div>
          {editable && <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#1A284F]"><Upload size={15} />Tambah evidence ({plan.evidence.length} file terlampir)<input className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run(async () => { const metadata = await uploadRcaEvidence(document.triggerId, file); setFiles((current) => [...current, metadata]); patchPlan(problem.id, plan.id, { evidence: [...plan.evidence, metadata.id] }); setMessage("Evidence baru ditambahkan tanpa mengganti evidence lama. Simpan draft atau submit untuk menautkan pada RCA."); }); }} /></label>}
          <p className="text-xs text-gray-500">JPG/PNG/PDF, maksimal 10 MB/file. Status Selesai wajib output dan evidence; Ditunda/Dibatalkan wajib alasan.</p>
        </div>)}
        {editable && <button onClick={() => patchProblem(problem.id, { actionPlans: [...problem.actionPlans, newPlan()] })} className="flex items-center gap-1 text-sm font-semibold text-[#1A284F]"><Plus size={15} />Tambah Action Plan</button>}
      </fieldset>)}
      {/* Evidence controls remain usable by reviewers even when the form is read-only. */}
      {problems.flatMap((problem) => problem.actionPlans.map((plan) => <div key={plan.id} className="space-y-2">{plan.evidence.map((id) => <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span>{files.find((file) => file.id === id)?.file_name ?? "Evidence RCA"}</span><button disabled={busy} className="flex items-center gap-1 font-semibold text-[#1A284F]" onClick={() => void run(async () => { const blob = await fetchRcaEvidence(id); if (proofUrl.current) URL.revokeObjectURL(proofUrl.current); const url = URL.createObjectURL(blob); proofUrl.current = url; setProof({ url, type: blob.type, name: files.find((file) => file.id === id)?.file_name ?? "Evidence RCA" }); })}><Eye size={15} />Lihat</button>{savedEvidence.has(id) && <span className="text-xs text-gray-500">Evidence tersimpan · dipertahankan</span>}{editable && !savedEvidence.has(id) && <button disabled={busy} onClick={() => patchPlan(problem.id, plan.id, { evidence: plan.evidence.filter((fileId) => fileId !== id) })} className="text-red-700">Lepas lampiran</button>}</div>)}</div>))}
      {editable && <div className="flex flex-wrap gap-3"><button disabled={busy || problems.length >= 20} onClick={() => setProblems((current) => [...current, newProblem()])} className="rounded-lg border px-4 py-2 text-sm">Tambah Masalah</button><button disabled={busy} onClick={() => void act("save")} className="rounded-lg border px-4 py-2 text-sm">Simpan draft / progres</button><button disabled={busy || (needsNewEvidence && newEvidenceCount === 0)} onClick={() => setConfirmation("submit")} className={button}>{document.revisionStage !== null ? "Submit ulang revisi" : document.status === "Approved" ? "Submit tindak lanjut" : "Submit RCA"}</button></div>}
      {actionable && <div className="space-y-3 border-t pt-4"><label className="block text-sm">Catatan pemeriksaan / alasan revisi<textarea className={input} disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} /></label><div className="flex gap-3"><button disabled={busy} onClick={() => setConfirmation("advance")} className={button}>{activeStage?.stage === "validator" ? "Validasi" : activeStage?.stage === "checker" ? "Checked / Teruskan" : "Setujui / Teruskan"}</button><button disabled={busy || !note.trim()} onClick={() => setConfirmation("revise")} className="rounded-lg border border-amber-300 px-4 py-2 text-sm">Minta revisi</button></div></div>}
      <section className="space-y-2 border-t pt-4"><h3 className="font-semibold">History RCA</h3>{document.history.map((event, index) => <div key={index} className="rounded-lg bg-gray-50 p-3 text-xs"><p className="font-semibold">{event.action} · {event.status} · {event.stage ?? "Karyawan"} · {event.actorId}{event.mirrored ? " · slot otomatis" : ""}</p><p>{dateTime(event.at)} · v{event.version}</p>{event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}</div>)}</section>
    </section>}
    <Dialog.Root open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6"><Dialog.Title className="text-lg font-bold">Konfirmasi RCA</Dialog.Title><Dialog.Description className="mt-2 text-sm text-gray-600">{confirmation === "submit" ? "Submit analisis/rencana atau progres untuk diperiksa? Input terkunci sampai ada revisi atau persetujuan." : confirmation === "revise" ? "Kembalikan kepada karyawan dengan alasan revisi?" : "Simpan keputusan tahap aktif? RCA menjadi Closed jika seluruh action plan Selesai/Dibatalkan setelah validasi penuh."}</Dialog.Description><div className="mt-5 flex justify-end gap-3"><button disabled={busy} onClick={() => setConfirmation(null)}>Batal</button><button disabled={busy} onClick={() => { if (confirmation) void act(confirmation); }} className={button}>Konfirmasi</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!proof} onOpenChange={(open) => { if (!open) { if (proofUrl.current) URL.revokeObjectURL(proofUrl.current); proofUrl.current = null; setProof(null); } }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5"><div className="flex justify-between"><Dialog.Title>{proof?.name}</Dialog.Title><Dialog.Close aria-label="Tutup evidence"><X size={20} /></Dialog.Close></div><Dialog.Description className="mt-1 text-xs text-gray-500">Evidence privat; akses diperiksa oleh server.</Dialog.Description>{proof && (proof.type === "application/pdf" ? <iframe title="Evidence RCA PDF" src={proof.url} className="mt-4 h-[65vh] w-full" /> : <img src={proof.url} alt={proof.name} className="mt-4 max-h-[65vh] w-full object-contain" />)}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
