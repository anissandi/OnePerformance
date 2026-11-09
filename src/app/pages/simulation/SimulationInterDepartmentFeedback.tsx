import { useEffect, useState } from "react";
import { Check, CheckCircle2, Eye, FileText, Lock, Plus, RefreshCw, Send, Trash2, Users, X } from "lucide-react";
import {
  IDF_FOLLOW_UP_COLUMNS,
  IDF_INDICATORS,
  idfGiverEligibilityError,
  isEligibleForIdf,
} from "../../../../supabase/functions/server/shared/interDepartmentFeedbackWorkflow";
import type {
  IdfDocument,
  IdfFollowUpRow,
  IdfTaskView,
} from "../../../../supabase/functions/server/shared/interDepartmentFeedbackWorkflow";
import { simulationEmployees, simulationUnits } from "../../data/paSimulation2026";
import { actOnSimulationIdf, loadSimulationIdf, saveIdfWindow } from "../../services/paSimulationApi";
import type { IdfOverview, SimulationIdentity } from "../../services/paSimulationApi";

export type IdfView = "idf" | "approvals-idf" | "idf-activation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-gray-50 disabled:text-gray-600";
const buttonClass =
  "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

const emptyFollowUpRow = (): IdfFollowUpRow =>
  Object.fromEntries(IDF_FOLLOW_UP_COLUMNS.map((col) => [col, ""])) as IdfFollowUpRow;

export function SimulationInterDepartmentFeedback({
  identity,
  view,
  refreshNotifications,
}: {
  identity: SimulationIdentity;
  view: IdfView;
  refreshNotifications: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<IdfOverview | null>(null);
  const [subTab, setSubTab] = useState<"nominate" | "tasks" | "received">(() =>
    isEligibleForIdf(identity.identity_id) ? "nominate" : "tasks",
  );
  const [unitFilter, setUnitFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [selectedGivers, setSelectedGivers] = useState<string[]>([]);
  const [activeTask, setActiveTask] = useState<IdfTaskView | null>(null);
  const [taskAnswers, setTaskAnswers] = useState<Record<string, string>>({});
  const [activeFbIdx, setActiveFbIdx] = useState(0);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [approvalTab, setApprovalTab] = useState<"pending" | "validated" | "all">("pending");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [followUpRows, setFollowUpRows] = useState<IdfFollowUpRow[]>([emptyFollowUpRow()]);
  const [unitId, setUnitId] = useState("IND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isApprovalsMode = view === "approvals-idf";
  const eligibleRecipient = isEligibleForIdf(identity.identity_id);

  const ownDocument = overview?.documents.find((doc) => doc.employeeId === identity.identity_id);

  const filteredApprovals = (overview?.documents.filter((doc) => doc.employeeId !== identity.identity_id && !!doc.summarySubmittedAt) ?? [])
    .filter((doc) =>
      approvalTab === "all"
        ? true
        : approvalTab === "validated"
        ? doc.status === "Validated"
        : doc.status !== "Validated",
    )
    .filter((doc) =>
      `${doc.employeeId} ${simulationEmployees.find((emp) => emp.id === doc.employeeId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  const approvalDocument: IdfDocument | undefined = isApprovalsMode
    ? filteredApprovals.find((doc) => doc.employeeId === selectedEmployeeId) ?? filteredApprovals[0]
    : undefined;

  async function refresh() {
    const result = await loadSimulationIdf();
    setOverview(result);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationIdf()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Inter-Department Feedback belum tersedia.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [identity.identity_id]);

  useEffect(() => {
    if (!ownDocument) return;
    setSummaries({ ...ownDocument.summaries });
    setActiveFbIdx(0);
  }, [ownDocument?.employeeId, ownDocument?.version]);

  useEffect(() => {
    if (!isApprovalsMode) return;
    if (!approvalDocument) {
      setSelectedEmployeeId(null);
      setFollowUpRows([emptyFollowUpRow()]);
      return;
    }
    setSelectedEmployeeId(approvalDocument.employeeId);
    const stageName = approvalDocument.stages[approvalDocument.activeStage]?.stage;
    const existing =
      stageName === "approver-2"
        ? approvalDocument.followUps.approver2
        : stageName === "approver-1"
        ? approvalDocument.followUps.approver1
        : undefined;
    setFollowUpRows(existing?.length ? structuredClone(existing) : [emptyFollowUpRow()]);
    setActiveFbIdx(0);
  }, [isApprovalsMode, approvalTab, search, approvalDocument?.employeeId, approvalDocument?.version]);

  useEffect(() => {
    if (!overview || view !== "idf-activation") return;
    const w = overview.windows.find((entry) => entry.unitId === unitId)?.window;
    setStartDate(w?.startDate ?? "");
    setEndDate(w?.endDate ?? "");
  }, [overview, view, unitId]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Operasi Inter-Department Feedback gagal.");
    } finally {
      setBusy(false);
    }
  }

  const candidates = simulationEmployees.filter(
    (emp) =>
      !idfGiverEligibilityError(identity.identity_id, emp.id) &&
      (!unitFilter || emp.unitId === unitFilter) &&
      (!deptFilter || emp.department === deptFilter),
  );
  const pendingTasks = overview?.tasks.filter((t) => t.status === "Pending") ?? [];

  const approvalStage = approvalDocument?.stages[approvalDocument.activeStage];
  const approvalActionable =
    isApprovalsMode &&
    !!approvalDocument &&
    approvalDocument.status !== "Validated" &&
    approvalStage?.actorId === identity.identity_id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Modul Inter-Department Feedback PA-Simulasi · Periode 2026 (Tidak Berbobot · Nominasi 3 Rekan Beda Departemen/Bagian → Feedback Anonim → Summary → Tindak Lanjut A1 & A2)
        </p>
        <button
          disabled={busy}
          onClick={() => void run(refresh)}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <RefreshCw size={15} /> Muat ulang
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">
          {message}
        </p>
      )}

      {view === "idf-activation" && identity.actor_level === "hr-strategic" && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold text-[#1A284F]">Module Activation · Inter-Department Feedback</h2>
          <p className="text-xs text-gray-500">
            Satu rentang tanggal terpadu dari <strong>Mulai Nominasi & Feedback</strong> sampai{" "}
            <strong>Akhir Summary & Approval</strong> untuk proses nominasi 3 pemberi, pengisian feedback anonim, summary, dan tindak lanjut Approver 1 & 2.
          </p>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveIdfWindow(unitId, startDate, endDate);
                await refresh();
                setMessage("Jadwal Inter-Department Feedback tersimpan.");
              });
            }}
          >
            <label className="text-sm">
              Unit Usaha
              <select className={inputClass + " mt-1"} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {simulationUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Mulai Nominasi & Feedback
              <input
                type="date"
                min="2026-01-01"
                max="2026-12-31"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass + " mt-1"}
              />
            </label>
            <label className="text-sm">
              Akhir Summary & Approval
              <input
                type="date"
                min={startDate || "2026-01-01"}
                max="2026-12-31"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputClass + " mt-1"}
              />
            </label>
            <button disabled={busy} className={buttonClass + " self-end"}>
              Simpan jadwal
            </button>
          </form>
          <div className="flex flex-wrap gap-2 pt-2">
            {overview?.windows.map((entry) => (
              <span key={entry.unitId} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                {entry.unitId}: {entry.window ? `${entry.window.startDate} — ${entry.window.endDate}` : "Belum dibuka"}
              </span>
            ))}
          </div>
        </section>
      )}

      {view === "idf" && (
        <div className="space-y-6">
          <nav className="flex overflow-x-auto border-b border-gray-200">
            {[
              ...(eligibleRecipient ? ([["nominate", "Pilih Pemberi Feedback", Users]] as const) : []),
              ["tasks", `Tugas Feedback Saya${pendingTasks.length ? ` (${pendingTasks.length})` : ""}`, FileText] as const,
              ...(eligibleRecipient ? ([["received", "Feedback Diterima & Summary", Eye]] as const) : []),
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSubTab(id);
                  setError("");
                  setMessage("");
                }}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold ${
                  subTab === id ? "border-[#1A284F] text-[#1A284F]" : "border-transparent text-gray-500 hover:bg-gray-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          {subTab === "nominate" && eligibleRecipient && ownDocument && (
            <div className="space-y-5">
              <EmployeeIdentityCard employeeId={ownDocument.employeeId} />
              {ownDocument.nominations.length > 0 ? (
                <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                    <div>
                      <p className="font-bold">Tiga pemberi feedback sudah dipilih dan terkunci</p>
                      <p className="text-xs">
                        Status progres pengisian diperbarui saat rekan terpilih mengirim feedback anonim untuk Anda.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {ownDocument.nominations.map((nom, idx) => {
                      const giver = simulationEmployees.find((e) => e.id === nom.giverId)!;
                      return (
                        <div
                          key={nom.giverId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {idx + 1}. {giver?.name ?? nom.giverId} ({nom.giverId})
                            </p>
                            <p className="text-xs text-gray-500">
                              {giver?.position} · {giver?.department} · {giver?.companyUnit}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              nom.status === "Submitted"
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {nom.status === "Submitted" ? "Feedback Diterima" : "Menunggu Feedback"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
                  <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                    <div>
                      <h2 className="font-bold text-[#1A284F]">Pilih Tepat 3 Rekan Kerja sebagai Pemberi Feedback</h2>
                      <p className="mt-1 text-xs text-gray-500">
                        Aturan: pemberi feedback tidak boleh berasal dari departemen dan bagian yang sama dengan Anda. Boleh berasal dari divisi/unit usaha yang sama atau lintas unit usaha.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-gray-600">
                        Filter Unit Usaha
                        <select
                          value={unitFilter}
                          onChange={(e) => setUnitFilter(e.target.value)}
                          className={inputClass + " mt-1"}
                        >
                          <option value="">Semua Unit Usaha</option>
                          {simulationUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold text-gray-600">
                        Filter Departemen
                        <select
                          value={deptFilter}
                          onChange={(e) => setDeptFilter(e.target.value)}
                          className={inputClass + " mt-1"}
                        >
                          <option value="">Semua Departemen</option>
                          {[...new Set(candidates.map((c) => c.department))].map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {candidates.map((emp) => {
                        const added = selectedGivers.includes(emp.id);
                        return (
                          <div
                            key={emp.id}
                            className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 ${
                              added ? "border-green-200 bg-green-50" : "border-gray-100"
                            }`}
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {emp.name} ({emp.id})
                              </p>
                              <p className="text-xs text-gray-500">
                                {emp.position} · {emp.department} · {emp.companyUnit}
                              </p>
                            </div>
                            {added ? (
                              <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                                <Check size={14} /> Dipilih
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={busy || selectedGivers.length >= 3}
                                onClick={() => setSelectedGivers((curr) => [...curr, emp.id])}
                                className="rounded-lg border border-[#1A284F]/30 px-3 py-1.5 text-xs font-bold text-[#1A284F] disabled:opacity-40"
                              >
                                Pilih
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <aside className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-900">Pemberi Feedback Terpilih</h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            selectedGivers.length === 3
                              ? "bg-green-100 text-green-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {selectedGivers.length} / 3
                        </span>
                      </div>
                      <div className="space-y-2">
                        {selectedGivers.map((giverId, idx) => {
                          const emp = simulationEmployees.find((e) => e.id === giverId)!;
                          return (
                            <div
                              key={giverId}
                              className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-xs"
                            >
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {idx + 1}. {emp.name}
                                </p>
                                <p className="text-gray-500">
                                  {emp.department} · {emp.companyUnit}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedGivers((curr) => curr.filter((id) => id !== giverId))}
                                className="text-red-600"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                        {!selectedGivers.length && (
                          <p className="py-8 text-center text-xs text-gray-400">Belum ada pemberi feedback dipilih.</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || selectedGivers.length !== 3}
                      onClick={() =>
                        void run(async () => {
                          await actOnSimulationIdf(ownDocument.employeeId, ownDocument.version, {
                            action: "nominate",
                            giverIds: selectedGivers,
                          });
                          setSelectedGivers([]);
                          setMessage("Tiga pemberi feedback berhasil dinominasikan dan menerima tugas feedback.");
                          await refresh();
                          await refreshNotifications();
                        })
                      }
                      className={buttonClass + " mt-4 flex w-full items-center justify-center gap-2"}
                    >
                      <Send size={14} /> Kirim Nominasi (3 Rekan)
                    </button>
                  </aside>
                </div>
              )}
            </div>
          )}

          {subTab === "tasks" && (
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <Lock className="h-5 w-5 shrink-0" />
                <p>
                  <strong>Feedback Anda Bersifat Anonim:</strong> Penerima dan Approver hanya melihat divisi serta unit usaha Anda, bukan nama atau ID Anda.
                </p>
              </div>

              {!overview?.tasks.length ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Belum ada permintaan feedback yang ditujukan kepada akun Anda ({identity.identity_id}).
                </p>
              ) : (
                <div className="space-y-3">
                  {overview.tasks.map((task) => (
                    <div
                      key={task.recipientId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {task.recipientName} ({task.recipientId})
                        </p>
                        <p className="text-xs text-gray-500">
                          {task.recipientPosition} · {task.recipientDepartment} · {task.recipientCompanyUnit}
                        </p>
                      </div>
                      {task.status === "Submitted" ? (
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                          Sudah Dikirim
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setActiveTask(task);
                            setTaskAnswers({});
                          }}
                          className={buttonClass}
                        >
                          Isi Feedback Anonim
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTask && (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/30 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Berikan Feedback untuk</p>
                      <h3 className="text-base font-bold text-[#1A284F]">
                        {activeTask.recipientName} ({activeTask.recipientId})
                      </h3>
                    </div>
                    <button type="button" onClick={() => setActiveTask(null)}>
                      <X size={18} />
                    </button>
                  </div>
                  {IDF_INDICATORS.map((ind, idx) => (
                    <label key={ind.key} className="block text-xs font-semibold text-gray-800">
                      {idx + 1}. {ind.label}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${
                          ind.sentiment === "positive"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {ind.sentiment === "positive" ? "Positif" : "Negatif"}
                      </span>
                      <textarea
                        rows={3}
                        value={taskAnswers[ind.key] ?? ""}
                        onChange={(e) => setTaskAnswers((curr) => ({ ...curr, [ind.key]: e.target.value }))}
                        className={inputClass + " mt-1 font-normal"}
                        placeholder="Tuliskan jawaban secara spesifik dan profesional..."
                      />
                    </label>
                  ))}
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveTask(null)}
                      className="rounded-lg border px-4 py-2 text-sm"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={busy || IDF_INDICATORS.some((ind) => !taskAnswers[ind.key]?.trim())}
                      onClick={() =>
                        void run(async () => {
                          await actOnSimulationIdf(activeTask.recipientId, activeTask.documentVersion, {
                            action: "give-feedback",
                            answers: taskAnswers,
                          });
                          setActiveTask(null);
                          setMessage("Feedback anonim berhasil dikirim.");
                          await refresh();
                          await refreshNotifications();
                        })
                      }
                      className={buttonClass}
                    >
                      Kirim Feedback Anonim
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {subTab === "received" && eligibleRecipient && ownDocument && (
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-[#1A284F]">Feedback Diterima & Summary · 2026</h2>
                  <p className="text-xs text-gray-500">
                    Identitas pemberi disembunyikan oleh server. Lengkapi 15 catatan summary setelah 3 feedback anonim diterima.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                  {ownDocument.status} · {ownDocument.feedbacks.length}/3 Feedback Diterima
                </span>
              </div>

              {ownDocument.feedbacks.length < 3 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Menunggu {3 - ownDocument.feedbacks.length} feedback anonim lagi dari rekan yang Anda pilih sebelum Summary dapat disubmit.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {ownDocument.feedbacks.map((fb, idx) => (
                      <button
                        key={fb.id}
                        type="button"
                        onClick={() => setActiveFbIdx(idx)}
                        className={`rounded-xl px-4 py-2 text-xs font-bold ${
                          activeFbIdx === idx ? "bg-[#1A284F] text-white" : "border bg-white text-gray-600"
                        }`}
                      >
                        Feedback {idx + 1} · {fb.division} · {fb.companyUnit}
                      </button>
                    ))}
                  </div>
                  {ownDocument.feedbacks[activeFbIdx] && (
                    <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                      {IDF_INDICATORS.map((ind, idx) => {
                        const fb = ownDocument.feedbacks[activeFbIdx];
                        const sumKey = `${fb.id}-${ind.key}`;
                        return (
                          <div key={ind.key} className="space-y-2 rounded-lg border border-gray-100 p-3">
                            <p className="text-xs font-semibold text-gray-800">
                              {idx + 1}. {ind.label}
                            </p>
                            <p className="rounded-lg bg-sky-50 p-3 text-xs text-gray-800">
                              {fb.answers[ind.key]}
                            </p>
                            <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                              Summary / Catatan Penerima *
                              <textarea
                                rows={2}
                                disabled={!!ownDocument.summarySubmittedAt || busy}
                                value={summaries[sumKey] ?? ""}
                                onChange={(e) => setSummaries((curr) => ({ ...curr, [sumKey]: e.target.value }))}
                                className={inputClass + " mt-1 font-normal normal-case tracking-normal"}
                                placeholder="Tuliskan ringkasan atau tindak lanjut pribadi..."
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!ownDocument.summarySubmittedAt && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await actOnSimulationIdf(ownDocument.employeeId, ownDocument.version, {
                              action: "save-summary",
                              summaries,
                            });
                            setMessage("Draft summary berhasil disimpan.");
                            await refresh();
                          })
                        }
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
                      >
                        Simpan draft Summary
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          ownDocument.feedbacks.some((fb) =>
                            IDF_INDICATORS.some((ind) => !summaries[`${fb.id}-${ind.key}`]?.trim()),
                          )
                        }
                        onClick={() =>
                          void run(async () => {
                            await actOnSimulationIdf(ownDocument.employeeId, ownDocument.version, {
                              action: "submit-summary",
                              summaries,
                            });
                            setMessage("Summary feedback berhasil disubmit untuk tindak lanjut Approver 1 & Approver 2.");
                            await refresh();
                            await refreshNotifications();
                          })
                        }
                        className={buttonClass + " flex items-center gap-2"}
                      >
                        <Send size={14} /> Submit Summary untuk Approval
                      </button>
                    </div>
                  )}
                </>
              )}

              {(ownDocument.followUps.approver1?.length || ownDocument.followUps.approver2?.length) && (
                <div className="space-y-4 border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-bold text-[#1A284F]">Tindak Lanjut Approver</h3>
                  {(
                    [
                      ["Approver 1", ownDocument.followUps.approver1],
                      ["Approver 2", ownDocument.followUps.approver2],
                    ] as const
                  ).map(([label, rows]) => (
                    <div key={label} className="rounded-xl border border-gray-200 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
                      {!rows?.length ? (
                        <p className="mt-1 text-xs text-gray-400">Belum ada tindak lanjut dari {label}.</p>
                      ) : (
                        rows.map((r, rIdx) => (
                          <div key={rIdx} className="mt-2 grid gap-2 border-t pt-2 text-xs md:grid-cols-3">
                            {IDF_FOLLOW_UP_COLUMNS.map((col) => (
                              <div key={col}>
                                <span className="font-semibold text-gray-600">{col}: </span>
                                <span>{r[col]}</span>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {isApprovalsMode && (
        <div className="space-y-5">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
                {(
                  [
                    { id: "pending", label: "Pending" },
                    { id: "validated", label: "Validated" },
                    { id: "all", label: "Semua" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    disabled={busy}
                    onClick={() => setApprovalTab(tab.id)}
                    className={
                      "rounded-lg px-4 py-2 text-sm font-semibold transition-colors " +
                      (approvalTab === tab.id ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500")
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <label className="text-xs text-gray-500">
                Cari karyawan
                <input
                  className={inputClass + " mt-1"}
                  placeholder="ID Karyawan atau Nama"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full min-w-[1000px] border-collapse text-xs">
                <thead className="bg-[#1A284F] text-white">
                  <tr>
                    {["ID Karyawan", "Nama", "Unit Usaha", "Divisi", "Departemen", "Jabatan", "Status", "Aksi"].map((h) => (
                      <th key={h} className="border border-[#1A284F]/30 px-3 py-3 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredApprovals.map((record) => {
                    const emp = simulationEmployees.find((e) => e.id === record.employeeId)!;
                    const isCurrent = approvalDocument?.employeeId === record.employeeId;
                    return (
                      <tr key={record.employeeId} className={isCurrent ? "bg-blue-50/50" : "hover:bg-gray-50"}>
                        {[emp.id, emp.name, emp.companyUnit, emp.division, emp.department, emp.position].map((val, i) => (
                          <td key={i} className="border border-gray-200 px-3 py-3 text-gray-600">
                            {val}
                          </td>
                        ))}
                        <td className="border border-gray-200 px-3 py-3">
                          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">
                            {record.status}
                          </span>
                        </td>
                        <td className="border border-gray-200 px-3 py-3">
                          <button
                            disabled={busy}
                            className="font-semibold text-[#1A284F] hover:underline"
                            onClick={() => setSelectedEmployeeId(record.employeeId)}
                          >
                            Lihat detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredApprovals.length && (
                    <tr>
                      <td colSpan={8} className="border border-gray-200 px-4 py-8 text-center text-gray-500">
                        {approvalTab === "pending"
                          ? "Tidak ada pengajuan Inter-Department Feedback yang berstatus Pending pada saat ini."
                          : approvalTab === "validated"
                          ? "Belum ada pengajuan Inter-Department Feedback yang berstatus Validated."
                          : "Tidak ada pengajuan Inter-Department Feedback yang cocok dengan filter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {approvalDocument && (
            <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#1A284F]">
                    Tindak Lanjut Inter-Department Feedback · 2026
                  </h2>
                  <p className="text-xs text-gray-500">
                    Urutan wajib: Approver 1 mengisi tindak lanjut terlebih dahulu, kemudian Approver 2. Tidak ada keputusan approve/revisi atau skor angka.
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
                  {approvalDocument.status} · versi {approvalDocument.version}
                </span>
              </div>

              <EmployeeIdentityCard employeeId={approvalDocument.employeeId} />

              <div className="flex flex-wrap gap-2">
                {approvalDocument.feedbacks.map((fb, idx) => (
                  <button
                    key={fb.id}
                    type="button"
                    onClick={() => setActiveFbIdx(idx)}
                    className={`rounded-xl px-4 py-2 text-xs font-bold ${
                      activeFbIdx === idx ? "bg-[#1A284F] text-white" : "border bg-white text-gray-600"
                    }`}
                  >
                    Feedback {idx + 1} · {fb.division} · {fb.companyUnit}
                  </button>
                ))}
              </div>

              {approvalDocument.feedbacks[activeFbIdx] && (
                <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                  {IDF_INDICATORS.map((ind, idx) => {
                    const fb = approvalDocument.feedbacks[activeFbIdx];
                    return (
                      <div key={ind.key} className="space-y-2 rounded-lg border border-gray-100 p-3 text-xs">
                        <p className="font-semibold text-gray-800">
                          {idx + 1}. {ind.label}
                        </p>
                        <div className="grid gap-2 md:grid-cols-2">
                          <div className="rounded-lg bg-sky-50 p-3">
                            <p className="font-bold text-sky-900">Feedback Pemberi (Anonim)</p>
                            <p className="mt-1 text-gray-800">{fb.answers[ind.key]}</p>
                          </div>
                          <div className="rounded-lg bg-violet-50 p-3">
                            <p className="font-bold text-violet-900">Summary Penerima</p>
                            <p className="mt-1 text-gray-800">
                              {approvalDocument.summaries[`${fb.id}-${ind.key}`] || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!!approvalDocument.followUps.approver1?.length && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600">
                    Tindak Lanjut Approver 1 (Read-Only)
                  </h3>
                  {approvalDocument.followUps.approver1.map((row, idx) => (
                    <div key={idx} className="mt-2 grid gap-2 border-t pt-2 text-xs md:grid-cols-3">
                      {IDF_FOLLOW_UP_COLUMNS.map((col) => (
                        <div key={col}>
                          <span className="font-semibold text-gray-600">{col}: </span>
                          <span>{row[col]}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {approvalActionable && (
                <div className="space-y-4 border-t border-gray-200 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-[#1A284F]">
                      Form Tindak Lanjut ({approvalStage?.stage === "approver-1" ? "Approver 1" : "Approver 2"})
                    </h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setFollowUpRows((curr) => [...curr, emptyFollowUpRow()])}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1A284F]"
                    >
                      <Plus size={14} /> Tambah Baris Tindak Lanjut
                    </button>
                  </div>
                  {followUpRows.map((row, rIdx) => (
                    <div key={rIdx} className="space-y-3 rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-gray-700">Baris Tindak Lanjut #{rIdx + 1}</p>
                        {followUpRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFollowUpRows((curr) => curr.filter((_, i) => i !== rIdx))}
                            className="flex items-center gap-1 text-xs text-red-600"
                          >
                            <Trash2 size={13} /> Hapus
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {IDF_FOLLOW_UP_COLUMNS.map((col) => (
                          <label key={col} className="block text-xs font-medium text-gray-700">
                            {col} *
                            <textarea
                              rows={2}
                              value={row[col]}
                              onChange={(e) =>
                                setFollowUpRows((curr) =>
                                  curr.map((item, i) => (i === rIdx ? { ...item, [col]: e.target.value } : item)),
                                )
                              }
                              className={inputClass + " mt-1 font-normal"}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      followUpRows.some((r) => IDF_FOLLOW_UP_COLUMNS.some((col) => !r[col]?.trim()))
                    }
                    onClick={() =>
                      void run(async () => {
                        await actOnSimulationIdf(approvalDocument.employeeId, approvalDocument.version, {
                          action: "submit-follow-up",
                          rows: followUpRows,
                        });
                        setMessage("Tindak lanjut Inter-Department Feedback berhasil disubmit.");
                        await refresh();
                        await refreshNotifications();
                      })
                    }
                    className={buttonClass}
                  >
                    {approvalDocument.mirrorSecondSlot && approvalStage?.stage === "approver-1"
                      ? "Submit Tindak Lanjut GM (A1 + A2)"
                      : `Submit Tindak Lanjut ${approvalStage?.stage === "approver-1" ? "Approver 1" : "Approver 2"}`}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeIdentityCard({ employeeId }: { employeeId: string }) {
  const employee = simulationEmployees.find((record) => record.id === employeeId)!;
  const values = [
    employee.id,
    employee.name,
    employee.companyUnit,
    employee.division,
    employee.department,
    employee.position,
    employee.level,
  ];
  return (
    <dl className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
      {["ID Karyawan", "Nama", "Unit Usaha", "Divisi", "Departemen", "Jabatan", "Group Level"].map((label, index) => (
        <div key={label}>
          <dt className="text-xs text-gray-400">{label}</dt>
          <dd className="mt-1 text-sm font-medium capitalize">{values[index]}</dd>
        </div>
      ))}
    </dl>
  );
}
