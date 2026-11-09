import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, Plus, RefreshCw, Send, Trash2, Upload, X } from "lucide-react";
import { sgActionPlanStatuses } from "../../../../supabase/functions/server/shared/smartGoalsWorkflow";
import type {
  SmartGoalItem,
  SmartGoalMeasurementDocument,
  SmartGoalMeasurementEntry,
  SmartGoalPlanCheckIn,
  SmartGoalSettingDocument,
} from "../../../../supabase/functions/server/shared/smartGoalsWorkflow";
import type { KpiAction } from "../../domain/kpiSettingWorkflow";
import { simulationEmployees, simulationUnits } from "../../data/paSimulation2026";
import {
  actOnSmartGoalsMeasurement,
  actOnSmartGoalsSetting,
  fetchSmartGoalsEvidence,
  loadSimulationSmartGoals,
  saveSmartGoalsWindow,
  uploadSmartGoalsEvidence,
} from "../../services/paSimulationApi";
import type { SimulationIdentity, SmartGoalsOverview, TrackingEvidence } from "../../services/paSimulationApi";

export type SmartGoalsView =
  | "sg-setting"
  | "approvals-sg-setting"
  | "sg-measurement"
  | "approvals-sg-measurement"
  | "sg-activation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-gray-50 disabled:text-gray-600";
const buttonClass =
  "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
const percent = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

const SMART_FIELDS = [
  { key: "specific", label: "Specific / Spesifik", hint: "Apa hasil spesifik yang ingin dicapai?" },
  { key: "measurable", label: "Measurable / Dapat Diukur", hint: "Bagaimana cara mengukur pencapaiannya?" },
  { key: "attainable", label: "Attainable / Dapat Dicapai", hint: "Langkah dan sumber daya apa yang diperlukan?" },
  { key: "relevant", label: "Relevant / Relevan", hint: "Bagaimana keselarasan dengan tujuan unit/organisasi?" },
  { key: "timely", label: "Timely / Batas Waktu", hint: "Kapan target waktu penyelesaiannya?" },
  { key: "bukti", label: "Bukti Keberhasilan", hint: "Dokumen/bukti apa yang membuktikan ketercapaian?" },
  { key: "target", label: "Target Kuantitatif / Kualitatif", hint: "Ukuran target keberhasilan yang terukur." },
] as const;

const blankGoal = (index: number): SmartGoalItem => ({
  id: crypto.randomUUID(),
  label: `Goals ${index}`,
  specific: "",
  measurable: "",
  attainable: "",
  relevant: "",
  timely: "",
  bukti: "",
  target: "",
  actionPlans: [{ id: crypto.randomUUID(), description: "" }],
});

export function SimulationSmartGoals({
  identity,
  view,
  refreshNotifications,
}: {
  identity: SimulationIdentity;
  view: SmartGoalsView;
  refreshNotifications: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<SmartGoalsOverview | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [approvalTab, setApprovalTab] = useState<"pending" | "validated" | "all">("pending");
  const [search, setSearch] = useState("");
  const [goals, setGoals] = useState<SmartGoalItem[]>([]);
  const [entries, setEntries] = useState<Record<string, SmartGoalMeasurementEntry>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<(TrackingEvidence & { goal_id?: string })[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<KpiAction | null>(null);
  const [unitId, setUnitId] = useState("IND");
  const [settingStart, setSettingStart] = useState("");
  const [settingEnd, setSettingEnd] = useState("");
  const [measurementStart, setMeasurementStart] = useState("");
  const [measurementEnd, setMeasurementEnd] = useState("");
  const [proof, setProof] = useState<{ url: string; name: string; type: string } | null>(null);
  const proofUrl = useRef<string | null>(null);

  const isSettingPhase = view === "sg-setting" || view === "approvals-sg-setting";
  const isMeasurementPhase = view === "sg-measurement" || view === "approvals-sg-measurement";
  const isApprovalsMode = view === "approvals-sg-setting" || view === "approvals-sg-measurement";

  const filteredSettingApprovals = (overview?.settingDocuments.filter((doc) => doc.employeeId !== identity.identity_id) ?? [])
    .filter((doc) =>
      approvalTab === "all"
        ? doc.status !== "Draft"
        : approvalTab === "validated"
        ? doc.status === "Validated"
        : doc.status !== "Validated" && doc.status !== "Draft",
    )
    .filter((doc) =>
      `${doc.employeeId} ${simulationEmployees.find((emp) => emp.id === doc.employeeId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  const filteredMeasurementApprovals = (overview?.measurementDocuments.filter((doc) => doc.employeeId !== identity.identity_id) ?? [])
    .filter((doc) =>
      approvalTab === "all"
        ? doc.status !== "Draft"
        : approvalTab === "validated"
        ? doc.status === "Validated"
        : doc.status !== "Validated" && doc.status !== "Draft",
    )
    .filter((doc) =>
      `${doc.employeeId} ${simulationEmployees.find((emp) => emp.id === doc.employeeId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  const ownSettingDoc = overview?.settingDocuments.find((doc) => doc.employeeId === identity.identity_id);
  const ownMeasurementDoc = overview?.measurementDocuments.find((doc) => doc.employeeId === identity.identity_id);

  const activeSettingDoc: SmartGoalSettingDocument | undefined =
    view === "sg-setting"
      ? ownSettingDoc
      : view === "approvals-sg-setting"
      ? filteredSettingApprovals.find((doc) => doc.employeeId === selectedEmployeeId) ?? filteredSettingApprovals[0]
      : undefined;

  const activeMeasurementDoc: SmartGoalMeasurementDocument | undefined =
    view === "sg-measurement"
      ? ownMeasurementDoc
      : view === "approvals-sg-measurement"
      ? filteredMeasurementApprovals.find((doc) => doc.employeeId === selectedEmployeeId) ?? filteredMeasurementApprovals[0]
      : undefined;

  function syncSettingSelection(doc: SmartGoalSettingDocument | undefined) {
    setConfirmation(null);
    setNote("");
    if (!doc) {
      setSelectedEmployeeId(null);
      setGoals([]);
      return;
    }
    setSelectedEmployeeId(doc.employeeId);
    setGoals(structuredClone(doc.goals));
  }

  function syncMeasurementSelection(doc: SmartGoalMeasurementDocument | undefined) {
    setConfirmation(null);
    setNote("");
    if (!doc) {
      setSelectedEmployeeId(null);
      setEntries({});
      setRatings({});
      return;
    }
    setSelectedEmployeeId(doc.employeeId);
    setEntries(structuredClone(doc.entries));
    const stageName = doc.stages[doc.activeStage]?.stage;
    const existingRatings =
      stageName === "approver-2"
        ? doc.assessments.approver2?.ratings
        : stageName === "approver-1"
        ? doc.assessments.approver1?.ratings
        : undefined;
    setRatings(existingRatings ? { ...existingRatings } : {});
  }

  async function refresh() {
    const result = await loadSimulationSmartGoals();
    setOverview(result);
    setFiles(result.evidence);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationSmartGoals()
      .then((result) => {
        if (!active) return;
        setOverview(result);
        setFiles(result.evidence);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "SMART Goals belum tersedia.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [identity.identity_id]);

  useEffect(() => {
    if (!overview) return;
    if (isSettingPhase) {
      syncSettingSelection(activeSettingDoc);
    } else if (isMeasurementPhase) {
      syncMeasurementSelection(activeMeasurementDoc);
    }
  }, [
    view,
    approvalTab,
    search,
    overview,
    activeSettingDoc?.employeeId,
    activeSettingDoc?.version,
    activeMeasurementDoc?.employeeId,
    activeMeasurementDoc?.version,
  ]);

  useEffect(() => {
    if (!overview || view !== "sg-activation") return;
    const sw = overview.settingWindows.find((w) => w.unitId === unitId)?.window;
    const mw = overview.measurementWindows.find((w) => w.unitId === unitId)?.window;
    setSettingStart(sw?.startDate ?? "");
    setSettingEnd(sw?.endDate ?? "");
    setMeasurementStart(mw?.startDate ?? "");
    setMeasurementEnd(mw?.endDate ?? "");
  }, [overview, view, unitId]);

  useEffect(() => () => {
    if (proofUrl.current) URL.revokeObjectURL(proofUrl.current);
  }, []);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Operasi SMART Goals gagal.");
    } finally {
      setBusy(false);
    }
  }

  function patchGoal(goalId: string, patch: Partial<SmartGoalItem>) {
    setGoals((current) => current.map((goal) => (goal.id === goalId ? { ...goal, ...patch } : goal)));
  }

  function patchEntry(goalId: string, patch: Partial<SmartGoalMeasurementEntry>) {
    setEntries((current) => ({
      ...current,
      [goalId]: { ...current[goalId], ...patch },
    }));
  }

  function patchPlanCheckIn(goalId: string, planId: string, patch: Partial<SmartGoalPlanCheckIn>) {
    setEntries((current) => ({
      ...current,
      [goalId]: {
        ...current[goalId],
        actionPlans: {
          ...current[goalId]?.actionPlans,
          [planId]: { ...current[goalId]?.actionPlans?.[planId], ...patch },
        },
      },
    }));
  }

  async function handleSettingAction(action: KpiAction) {
    if (!activeSettingDoc) return;
    const editable = view === "sg-setting" && activeSettingDoc.employeeId === identity.identity_id;
    await run(async () => {
      await actOnSmartGoalsSetting(activeSettingDoc, action, editable ? goals : undefined, note);
      setConfirmation(null);
      setMessage(
        action === "save"
          ? "Draft SMART Goals Setting tersimpan."
          : "Tindakan SMART Goals Setting tersimpan. Notifikasi dalam aplikasi tersedia.",
      );
      await refresh();
      await refreshNotifications();
    });
  }

  async function handleMeasurementAction(action: KpiAction) {
    if (!activeMeasurementDoc) return;
    const editable = view === "sg-measurement" && activeMeasurementDoc.employeeId === identity.identity_id;
    const stageName = activeMeasurementDoc.stages[activeMeasurementDoc.activeStage]?.stage;
    const needsRatings =
      action === "advance" && (stageName === "approver-1" || stageName === "approver-2");
    await run(async () => {
      await actOnSmartGoalsMeasurement(
        activeMeasurementDoc,
        action,
        editable ? entries : undefined,
        needsRatings ? ratings : undefined,
        note,
      );
      setConfirmation(null);
      setMessage(
        action === "save"
          ? "Draft SMART Goals Measurement tersimpan."
          : "Tindakan SMART Goals Measurement tersimpan. Notifikasi dalam aplikasi tersedia.",
      );
      await refresh();
      await refreshNotifications();
    });
  }

  const settingEditable =
    view === "sg-setting" &&
    !!activeSettingDoc &&
    activeSettingDoc.employeeId === identity.identity_id &&
    (activeSettingDoc.status === "Draft" || activeSettingDoc.revisionStage !== null);
  const settingStage = activeSettingDoc?.stages[activeSettingDoc.activeStage];
  const settingActionable =
    view === "approvals-sg-setting" &&
    !!activeSettingDoc &&
    activeSettingDoc.revisionStage === null &&
    activeSettingDoc.status !== "Validated" &&
    settingStage?.actorId === identity.identity_id;

  const measurementEditable =
    view === "sg-measurement" &&
    !!activeMeasurementDoc &&
    activeMeasurementDoc.employeeId === identity.identity_id &&
    (activeMeasurementDoc.status === "Draft" || activeMeasurementDoc.revisionStage !== null);
  const measurementStage = activeMeasurementDoc?.stages[activeMeasurementDoc.activeStage];
  const measurementActionable =
    view === "approvals-sg-measurement" &&
    !!activeMeasurementDoc &&
    activeMeasurementDoc.revisionStage === null &&
    activeMeasurementDoc.status !== "Validated" &&
    measurementStage?.actorId === identity.identity_id;
  const isScoringApprover =
    measurementActionable &&
    (measurementStage?.stage === "approver-1" || measurementStage?.stage === "approver-2");

  const currentScoreSummary = overview?.scores.find(
    (s) => s.employeeId === (activeMeasurementDoc?.employeeId ?? identity.identity_id),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Modul SMART Goals PA-Simulasi · Periode 2026 (Checker → Approver 1 → Approver 2 → Validator)
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

      {view === "sg-activation" && identity.actor_level === "hr-strategic" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-bold text-[#1A284F]">Module Activation · SMART Goals Setting</h2>
            <p className="text-xs text-gray-500">
              Tetapkan jadwal penyusunan & approval SMART Goals Setting per unit usaha (WIB).
            </p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await saveSmartGoalsWindow("setting", unitId, settingStart, settingEnd);
                  await refresh();
                  setMessage("Jadwal SMART Goals Setting tersimpan.");
                });
              }}
            >
              <label className="block text-sm">
                Unit Usaha
                <select
                  className={inputClass + " mt-1"}
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  {simulationUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Start Date
                  <input
                    type="date"
                    min="2026-01-01"
                    max="2026-12-31"
                    required
                    value={settingStart}
                    onChange={(e) => setSettingStart(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
                <label className="text-sm">
                  End Date
                  <input
                    type="date"
                    min={settingStart || "2026-01-01"}
                    max="2026-12-31"
                    required
                    value={settingEnd}
                    onChange={(e) => setSettingEnd(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
              </div>
              <button disabled={busy} className={buttonClass}>
                Simpan jadwal Setting
              </button>
            </form>
            <div className="flex flex-wrap gap-2 pt-2">
              {overview?.settingWindows.map((entry) => (
                <span key={entry.unitId} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                  {entry.unitId}: {entry.window ? `${entry.window.startDate} — ${entry.window.endDate}` : "Belum dibuka"}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-bold text-[#1A284F]">Module Activation · SMART Goals Measurement</h2>
            <p className="text-xs text-gray-500">
              Tetapkan jadwal pengisian capaian, bukti, dan penilaian SMART Goals Measurement per unit usaha (WIB).
            </p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await saveSmartGoalsWindow("measurement", unitId, measurementStart, measurementEnd);
                  await refresh();
                  setMessage("Jadwal SMART Goals Measurement tersimpan.");
                });
              }}
            >
              <label className="block text-sm">
                Unit Usaha
                <select
                  className={inputClass + " mt-1"}
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  {simulationUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Start Date
                  <input
                    type="date"
                    min="2026-01-01"
                    max="2026-12-31"
                    required
                    value={measurementStart}
                    onChange={(e) => setMeasurementStart(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
                <label className="text-sm">
                  End Date
                  <input
                    type="date"
                    min={measurementStart || "2026-01-01"}
                    max="2026-12-31"
                    required
                    value={measurementEnd}
                    onChange={(e) => setMeasurementEnd(e.target.value)}
                    className={inputClass + " mt-1"}
                  />
                </label>
              </div>
              <button disabled={busy} className={buttonClass}>
                Simpan jadwal Measurement
              </button>
            </form>
            <div className="flex flex-wrap gap-2 pt-2">
              {overview?.measurementWindows.map((entry) => (
                <span key={entry.unitId} className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                  {entry.unitId}: {entry.window ? `${entry.window.startDate} — ${entry.window.endDate}` : "Belum dibuka"}
                </span>
              ))}
            </div>
          </section>
        </div>
      )}

      {isApprovalsMode && (
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
                {(isSettingPhase ? filteredSettingApprovals : filteredMeasurementApprovals).map((record) => {
                  const emp = simulationEmployees.find((e) => e.id === record.employeeId)!;
                  const isCurrent =
                    (isSettingPhase ? activeSettingDoc?.employeeId : activeMeasurementDoc?.employeeId) === record.employeeId;
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
                          onClick={() =>
                            isSettingPhase
                              ? syncSettingSelection(record as SmartGoalSettingDocument)
                              : syncMeasurementSelection(record as SmartGoalMeasurementDocument)
                          }
                        >
                          Lihat detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!(isSettingPhase ? filteredSettingApprovals.length : filteredMeasurementApprovals.length) && (
                  <tr>
                    <td colSpan={8} className="border border-gray-200 px-4 py-8 text-center text-gray-500">
                      {approvalTab === "pending"
                        ? "Tidak ada pengajuan SMART Goals yang berstatus Pending pada saat ini."
                        : approvalTab === "validated"
                        ? "Belum ada pengajuan SMART Goals yang berstatus Validated."
                        : "Tidak ada pengajuan SMART Goals yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isSettingPhase && activeSettingDoc && (
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">SMART Goals Setting · 2026</h2>
              <p className="text-xs text-gray-500">
                Bobot modul SMART Goals: {activeSettingDoc.snapshot.weights["smart-goals"]}% · Jadwal Unit{" "}
                {activeSettingDoc.snapshot.unitId}:{" "}
                {overview?.settingWindows.find((w) => w.unitId === activeSettingDoc.snapshot.unitId)?.window
                  ? `${overview.settingWindows.find((w) => w.unitId === activeSettingDoc.snapshot.unitId)!.window!.startDate} — ${
                      overview.settingWindows.find((w) => w.unitId === activeSettingDoc.snapshot.unitId)!.window!.endDate
                    } WIB`
                  : "Belum dibuka HR Strategic"}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
              {activeSettingDoc.status} · versi {activeSettingDoc.version}
            </span>
          </div>

          <EmployeeIdentityCard employeeId={activeSettingDoc.employeeId} />

          <ol className="flex flex-wrap gap-2">
            {activeSettingDoc.stages.map((st, idx) => (
              <li
                key={st.stage}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  idx === activeSettingDoc.activeStage ? "border-teal-600 bg-teal-50 font-semibold" : "border-gray-200"
                }`}
              >
                {st.stage} · {st.actorId}
                {st.stage === "approver-1" && activeSettingDoc.mirrorSecondSlot ? " (A1 + A2)" : ""}
              </li>
            ))}
          </ol>

          {activeSettingDoc.revisionStage !== null && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Revisi diminta: {activeSettingDoc.history.filter((h) => h.action === "revise").slice(-1)[0]?.note}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-[#1A284F]">
            <span>Aturan pengajuan: wajib menyusun <strong>minimal 3 SMART Goals</strong> beserta 7 atribut SMART dan minimal 1 Action Plan pada setiap Goal.</span>
            <span className={`rounded-full px-3 py-1 font-bold ${goals.length >= 3 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {goals.length} / min. 3 Goals
            </span>
          </div>

          {goals.map((goal, goalIdx) => (
            <fieldset
              key={goal.id}
              disabled={!settingEditable || busy}
              className="space-y-4 rounded-xl border border-gray-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex-1 text-sm font-semibold text-[#1A284F]">
                  Judul Goal {goalIdx + 1}
                  <input
                    className={inputClass + " mt-1 font-normal"}
                    value={goal.label}
                    onChange={(e) => patchGoal(goal.id, { label: e.target.value })}
                    placeholder="Contoh: Goals 1 — Peningkatan Keandalan Sistem"
                  />
                </label>
                {settingEditable && (
                  <button
                    type="button"
                    onClick={() => {
                      if (goals.length <= 3) {
                        setError("Minimal 3 SMART Goals wajib dipertahankan.");
                        return;
                      }
                      setGoals((curr) => curr.filter((g) => g.id !== goal.id));
                    }}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={14} /> Hapus Goal
                  </button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {SMART_FIELDS.map((field) => (
                  <label key={field.key} className="block text-xs font-medium text-gray-700">
                    {field.label}
                    <span className="block text-[11px] font-normal text-gray-400">{field.hint}</span>
                    <textarea
                      rows={2}
                      className={inputClass + " mt-1"}
                      value={goal[field.key]}
                      onChange={(e) => patchGoal(goal.id, { [field.key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>

              <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#1A284F]">Action Plans ({goal.actionPlans.length})</p>
                  {settingEditable && (
                    <button
                      type="button"
                      onClick={() =>
                        patchGoal(goal.id, {
                          actionPlans: [...goal.actionPlans, { id: crypto.randomUUID(), description: "" }],
                        })
                      }
                      className="flex items-center gap-1 text-xs font-semibold text-[#1A284F]"
                    >
                      <Plus size={14} /> Tambah Action Plan
                    </button>
                  )}
                </div>
                {goal.actionPlans.map((plan, planIdx) => (
                  <div key={plan.id} className="flex items-center gap-2">
                    <span className="w-6 text-xs font-semibold text-gray-500">{planIdx + 1}.</span>
                    <input
                      className={inputClass}
                      placeholder="Deskripsi langkah tindakan..."
                      value={plan.description}
                      onChange={(e) =>
                        patchGoal(goal.id, {
                          actionPlans: goal.actionPlans.map((p) =>
                            p.id === plan.id ? { ...p, description: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    {settingEditable && goal.actionPlans.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          patchGoal(goal.id, {
                            actionPlans: goal.actionPlans.filter((p) => p.id !== plan.id),
                          })
                        }
                        className="text-red-600"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}

          {!goals.length && (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              <p>Belum ada SMART Goal pada pengajuan ini (wajib minimal 3 Goals).</p>
              {settingEditable && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setGoals([blankGoal(1), blankGoal(2), blankGoal(3)])}
                  className={buttonClass + " mt-3 inline-flex items-center gap-2"}
                >
                  <Plus size={15} /> Buat 3 SMART Goals Awal
                </button>
              )}
            </div>
          )}

          {settingEditable && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setGoals((curr) => [...curr, blankGoal(curr.length + 1)])}
                className="flex items-center gap-2 rounded-lg border border-[#1A284F] px-4 py-2 text-sm font-semibold text-[#1A284F]"
              >
                <Plus size={15} /> Tambah SMART Goal
              </button>
              <button type="button" disabled={busy} onClick={() => void handleSettingAction("save")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                Simpan draft
              </button>
              <button type="button" disabled={busy || goals.length < 3} onClick={() => setConfirmation("submit")} className={buttonClass + " flex items-center gap-2"}>
                <Send size={15} /> {activeSettingDoc.revisionStage !== null ? "Submit ulang revisi" : "Submit SMART Goals"}
              </button>
            </div>
          )}

          {settingActionable && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <label className="block text-sm">
                Catatan pemeriksaan / alasan revisi
                <textarea className={inputClass + " mt-1"} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} onClick={() => setConfirmation("advance")} className={buttonClass}>
                  {settingStage?.stage === "checker"
                    ? "Checked / Teruskan"
                    : settingStage?.stage === "validator"
                    ? "Validasi"
                    : activeSettingDoc.mirrorSecondSlot && settingStage?.stage === "approver-1"
                    ? "Setujui GM (A1 + A2)"
                    : "Setujui / Teruskan"}
                </button>
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => setConfirmation("revise")}
                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-40"
                >
                  Minta revisi
                </button>
              </div>
            </div>
          )}

          <HistoryList history={activeSettingDoc.history} />
        </section>
      )}

      {view === "sg-measurement" && !activeMeasurementDoc && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          SMART Goals Setting pribadi Anda belum berstatus <strong>Validated</strong>. Selesaikan dan validasikan SMART Goals Setting terlebih dahulu sebelum mengisi Measurement.
        </div>
      )}

      {isMeasurementPhase && activeMeasurementDoc && (
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">SMART Goals Measurement · 2026</h2>
              <p className="text-xs text-gray-500">
                Sumber resmi: SMART Goals Setting v{activeMeasurementDoc.settingVersion} (Validated) · Jadwal Unit{" "}
                {activeMeasurementDoc.snapshot.unitId}:{" "}
                {overview?.measurementWindows.find((w) => w.unitId === activeMeasurementDoc.snapshot.unitId)?.window
                  ? `${overview.measurementWindows.find((w) => w.unitId === activeMeasurementDoc.snapshot.unitId)!.window!.startDate} — ${
                      overview.measurementWindows.find((w) => w.unitId === activeMeasurementDoc.snapshot.unitId)!.window!.endDate
                    } WIB`
                  : "Belum dibuka HR Strategic"}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
              {activeMeasurementDoc.status} · versi {activeMeasurementDoc.version}
            </span>
          </div>

          <EmployeeIdentityCard employeeId={activeMeasurementDoc.employeeId} />

          <ol className="flex flex-wrap gap-2">
            {activeMeasurementDoc.stages.map((st, idx) => (
              <li
                key={st.stage}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  idx === activeMeasurementDoc.activeStage ? "border-teal-600 bg-teal-50 font-semibold" : "border-gray-200"
                }`}
              >
                {st.stage} · {st.actorId}
                {st.stage === "approver-1" && activeMeasurementDoc.mirrorSecondSlot ? " (A1 + A2)" : ""}
              </li>
            ))}
          </ol>

          {activeMeasurementDoc.revisionStage !== null && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Revisi diminta: {activeMeasurementDoc.history.filter((h) => h.action === "revise").slice(-1)[0]?.note}
            </p>
          )}

          {activeMeasurementDoc.goals.map((goal, goalIdx) => {
            const entry = entries[goal.id] ?? {
              actual: "",
              achievementStatus: "",
              alasanTidakTercapai: "",
              evidence: [],
              actionPlans: {},
            };
            return (
              <div key={goal.id} className="space-y-4 rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="font-bold text-[#1A284F]">
                      {goalIdx + 1}. {goal.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">Target: {goal.target} · Bukti: {goal.bukti}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                    {entry.achievementStatus || "Belum dinilai"}
                  </span>
                </div>

                <div className="space-y-3 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#1A284F]">Progres Action Plans</p>
                  {goal.actionPlans.map((plan, planIdx) => {
                    const checkIn = entry.actionPlans?.[plan.id] ?? {
                      status: "Belum dilaksanakan",
                      progressPct: 0,
                      kendala: "",
                      alasanBatal: "",
                    };
                    return (
                      <div key={plan.id} className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-xs font-semibold text-gray-800">
                          {planIdx + 1}. {plan.description}
                        </p>
                        <div className="grid gap-3 md:grid-cols-3">
                          <label className="text-xs">
                            Status Pelaksanaan
                            <select
                              disabled={!measurementEditable || busy}
                              value={checkIn.status}
                              onChange={(e) =>
                                patchPlanCheckIn(goal.id, plan.id, {
                                  status: e.target.value as SmartGoalPlanCheckIn["status"],
                                  progressPct: e.target.value === "Selesai" ? 100 : checkIn.progressPct,
                                })
                              }
                              className={inputClass + " mt-1"}
                            >
                              {sgActionPlanStatuses.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            Progres (%)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={!measurementEditable || busy}
                              value={checkIn.progressPct}
                              onChange={(e) =>
                                patchPlanCheckIn(goal.id, plan.id, {
                                  progressPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                })
                              }
                              className={inputClass + " mt-1"}
                            />
                          </label>
                          <label className="text-xs">
                            {checkIn.status === "Batal" ? "Alasan Batal *" : "Kendala / Catatan"}
                            <input
                              disabled={!measurementEditable || busy}
                              value={checkIn.status === "Batal" ? checkIn.alasanBatal : checkIn.kendala}
                              onChange={(e) =>
                                patchPlanCheckIn(
                                  goal.id,
                                  plan.id,
                                  checkIn.status === "Batal"
                                    ? { alasanBatal: e.target.value }
                                    : { kendala: e.target.value },
                                )
                              }
                              className={inputClass + " mt-1"}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-medium">
                    Realisasi Aktual *
                    <textarea
                      rows={2}
                      disabled={!measurementEditable || busy}
                      value={entry.actual}
                      onChange={(e) => patchEntry(goal.id, { actual: e.target.value })}
                      placeholder="Tuliskan hasil aktual pencapaian SMART Goal ini..."
                      className={inputClass + " mt-1 font-normal"}
                    />
                  </label>
                  <div className="space-y-3">
                    <label className="block text-xs font-medium">
                      Status Pencapaian Goal *
                      <select
                        disabled={!measurementEditable || busy}
                        value={entry.achievementStatus}
                        onChange={(e) =>
                          patchEntry(goal.id, {
                            achievementStatus: e.target.value as SmartGoalMeasurementEntry["achievementStatus"],
                          })
                        }
                        className={inputClass + " mt-1 font-normal"}
                      >
                        <option value="">-- Pilih Status --</option>
                        <option value="Tercapai">Tercapai (Wajib Bukti)</option>
                        <option value="Tidak Tercapai">Tidak Tercapai (Wajib Alasan)</option>
                      </select>
                    </label>
                    {entry.achievementStatus === "Tidak Tercapai" && (
                      <label className="block text-xs font-medium">
                        Alasan Tidak Tercapai *
                        <textarea
                          rows={2}
                          disabled={!measurementEditable || busy}
                          value={entry.alasanTidakTercapai}
                          onChange={(e) => patchEntry(goal.id, { alasanTidakTercapai: e.target.value })}
                          className={inputClass + " mt-1 font-normal"}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-700">
                      Bukti (Evidence) Goal · {entry.evidence.length}/10 file (JPG/PNG/PDF, maks. 10 MB)
                    </p>
                    {measurementEditable && entry.evidence.length < 10 && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#1A284F] px-3 py-1.5 text-xs font-semibold text-[#1A284F]">
                        <Upload size={14} /> Upload bukti
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          className="sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            void run(async () => {
                              const uploaded = await uploadSmartGoalsEvidence(activeMeasurementDoc.employeeId, goal.id, file);
                              setFiles((curr) => [...curr, uploaded]);
                              patchEntry(goal.id, { evidence: [...entry.evidence, uploaded.id] });
                              setMessage("Bukti terupload privat. Klik Simpan draft atau Submit untuk menyimpan tautan bukti.");
                            });
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {entry.evidence.map((fileId) => {
                      const meta = files.find((f) => f.id === fileId);
                      return (
                        <div key={fileId} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                          <span className="truncate">{meta?.file_name ?? `Bukti ${fileId.slice(0, 8)}`}</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const blob = await fetchSmartGoalsEvidence(fileId);
                                  if (proofUrl.current) URL.revokeObjectURL(proofUrl.current);
                                  const url = URL.createObjectURL(blob);
                                  proofUrl.current = url;
                                  setProof({ url, name: meta?.file_name ?? "Bukti SMART Goals", type: blob.type });
                                })
                              }
                              className="flex items-center gap-1 font-semibold text-[#1A284F]"
                            >
                              <Eye size={14} /> Lihat
                            </button>
                            {measurementEditable && (
                              <button
                                type="button"
                                onClick={() =>
                                  patchEntry(goal.id, { evidence: entry.evidence.filter((id) => id !== fileId) })
                                }
                                className="text-red-600"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Nilai Approver 1</h3>
              <p className="mt-2 text-lg font-bold text-[#1A284F]">{percent(currentScoreSummary?.approver1Score ?? null)}</p>
              {activeMeasurementDoc.assessments.approver1?.comment && (
                <p className="mt-1 text-xs text-gray-600">Catatan: {activeMeasurementDoc.assessments.approver1.comment}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Nilai Approver 2</h3>
              <p className="mt-2 text-lg font-bold text-[#1A284F]">{percent(currentScoreSummary?.approver2Score ?? null)}</p>
              {activeMeasurementDoc.assessments.approver2?.comment && (
                <p className="mt-1 text-xs text-gray-600">Catatan: {activeMeasurementDoc.assessments.approver2.comment}</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Skor Akhir SMART Goals (Rata-rata A1 & A2)</h3>
              <p className="mt-2 text-lg font-bold text-[#1A284F]">
                {currentScoreSummary?.complete ? percent(currentScoreSummary.score) : "Menunggu Validated"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Kontribusi terbobot ({activeMeasurementDoc.snapshot.weights["smart-goals"]}%):{" "}
                {percent(currentScoreSummary?.weightedScore ?? null)}
              </p>
            </div>
          </div>

          {measurementEditable && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleMeasurementAction("save")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                Simpan draft Measurement
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmation("submit")}
                className={buttonClass + " flex items-center gap-2"}
              >
                <Send size={15} />{" "}
                {activeMeasurementDoc.revisionStage !== null ? "Submit ulang revisi" : "Submit SMART Goals Measurement"}
              </button>
            </div>
          )}

          {measurementActionable && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              {isScoringApprover && (
                <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                  <h3 className="text-sm font-bold text-[#1A284F]">
                    Penilaian {measurementStage?.stage === "approver-1" ? "Approver 1" : "Approver 2"} (0–100% per Goal)
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeMeasurementDoc.goals.map((goal, idx) => (
                      <label key={goal.id} className="block text-xs font-semibold text-gray-700">
                        {idx + 1}. {goal.label} ({entries[goal.id]?.achievementStatus || "—"})
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={ratings[goal.id] ?? ""}
                          onChange={(e) =>
                            setRatings((curr) => ({
                              ...curr,
                              [goal.id]: e.target.value === "" ? NaN : Number(e.target.value),
                            }))
                          }
                          placeholder="0 - 100"
                          className={inputClass + " mt-1"}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <label className="block text-sm">
                Catatan pemeriksaan / komentar penilaian / alasan revisi
                <textarea className={inputClass + " mt-1"} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} onClick={() => setConfirmation("advance")} className={buttonClass}>
                  {measurementStage?.stage === "checker"
                    ? "Checked / Teruskan"
                    : measurementStage?.stage === "validator"
                    ? "Validasi Final"
                    : activeMeasurementDoc.mirrorSecondSlot && measurementStage?.stage === "approver-1"
                    ? "Simpan Nilai & Setujui GM (A1 + A2)"
                    : "Simpan Nilai & Setujui"}
                </button>
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => setConfirmation("revise")}
                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-40"
                >
                  Minta revisi
                </button>
              </div>
            </div>
          )}

          <HistoryList history={activeMeasurementDoc.history} />
        </section>
      )}

      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-[#1A284F]">Konfirmasi SMART Goals</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-500">
              {confirmation === "submit"
                ? "Submit dokumen SMART Goals ini untuk diperiksa? Data terkunci selama proses pemeriksaan."
                : confirmation === "revise"
                ? "Kembalikan dokumen kepada karyawan untuk direvisi? Submit ulang akan kembali ke tahap Anda."
                : "Simpan keputusan pada tahap aktif ini?"}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <button disabled={busy} onClick={() => setConfirmation(null)} className="rounded-lg border px-4 py-2 text-sm">
                Batal
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (!confirmation) return;
                  if (isSettingPhase) void handleSettingAction(confirmation);
                  else void handleMeasurementAction(confirmation);
                }}
                className={buttonClass}
              >
                Konfirmasi
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!proof}
        onOpenChange={(open) => {
          if (!open) {
            if (proofUrl.current) URL.revokeObjectURL(proofUrl.current);
            proofUrl.current = null;
            setProof(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-sm font-semibold">{proof?.name}</Dialog.Title>
              <Dialog.Close aria-label="Tutup bukti">
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-1 text-xs text-gray-500">
              Bukti SMART Goals diambil secara privat melalui pemeriksaan kewenangan API.
            </Dialog.Description>
            {proof &&
              (proof.type === "application/pdf" ? (
                <iframe title="Bukti PDF SMART Goals" src={proof.url} className="mt-4 h-[65vh] w-full" />
              ) : (
                <img src={proof.url} alt={proof.name} className="mt-4 max-h-[65vh] w-full object-contain" />
              ))}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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

function HistoryList({ history }: { history: SmartGoalSettingDocument["history"] }) {
  const events = history.filter((h) => h.action !== "save");
  return (
    <section className="space-y-2 border-t border-gray-200 pt-4">
      <h3 className="text-sm font-semibold">History Approval</h3>
      {!events.length && <p className="text-xs text-gray-400">Belum ada riwayat submission/approval.</p>}
      {events.map((event, idx) => (
        <div key={`${event.version}-${idx}`} className="rounded-lg bg-gray-50 p-3 text-xs">
          <p className="font-semibold">
            {event.status} · {event.stage ?? "Submission karyawan"} · {event.actorId}
            {event.mirrored ? " · slot otomatis" : ""}
          </p>
          <p className="mt-1 text-gray-400">
            {formatDate(event.at)} · versi {event.version}
          </p>
          {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
        </div>
      ))}
    </section>
  );
}
