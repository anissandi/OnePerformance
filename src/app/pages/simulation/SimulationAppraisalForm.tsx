import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, RefreshCw, Send, X } from "lucide-react";
import {
  ALL_APPRAISAL_KEYS,
  APPRAISAL_FORM_DEFS,
  calculateAppraisalFormScore,
} from "../../../../supabase/functions/server/shared/appraisalFormWorkflow";
import type {
  AppraisalFormDocument,
  AppraisalFormId,
  AppraisalFormItemDef,
} from "../../../../supabase/functions/server/shared/appraisalFormWorkflow";
import type { KpiAction } from "../../domain/kpiSettingWorkflow";
import { simulationEmployees, simulationUnits } from "../../data/paSimulation2026";
import {
  actOnSimulationAppraisalForm,
  loadSimulationAppraisalForm,
  saveAppraisalFormWindow,
} from "../../services/paSimulationApi";
import type { AppraisalFormOverview, SimulationIdentity } from "../../services/paSimulationApi";

export type AppraisalFormView = "appraisal-form" | "approvals-appraisal-form" | "af-activation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-gray-50 disabled:text-gray-600";
const buttonClass =
  "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
const fmtNum = (val: number | null | undefined) => (val == null ? "—" : val.toFixed(2));

export function SimulationAppraisalForm({
  identity,
  view,
  refreshNotifications,
}: {
  identity: SimulationIdentity;
  view: AppraisalFormView;
  refreshNotifications: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<AppraisalFormOverview | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [approvalTab, setApprovalTab] = useState<"pending" | "validated" | "all">("pending");
  const [search, setSearch] = useState("");
  const [activeForm, setActiveForm] = useState<AppraisalFormId>("A");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [savedForms, setSavedForms] = useState<AppraisalFormId[]>([]);
  const [note, setNote] = useState("");
  const [indicatorItem, setIndicatorItem] = useState<AppraisalFormItemDef | null>(null);
  const [confirmation, setConfirmation] = useState<KpiAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unitId, setUnitId] = useState("IND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const isApprovalsMode = view === "approvals-appraisal-form";

  const filteredApprovals = (overview?.documents.filter((doc) => doc.employeeId !== identity.identity_id) ?? [])
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

  const ownDocument = overview?.documents.find((doc) => doc.employeeId === identity.identity_id);
  const document: AppraisalFormDocument | undefined =
    view === "appraisal-form"
      ? ownDocument
      : view === "approvals-appraisal-form"
      ? filteredApprovals.find((doc) => doc.employeeId === selectedEmployeeId) ?? filteredApprovals[0]
      : undefined;

  function syncSelection(doc: AppraisalFormDocument | undefined) {
    setConfirmation(null);
    setNote("");
    setActiveForm("A");
    if (!doc) {
      setSelectedEmployeeId(null);
      setRatings({});
      setSavedForms([]);
      return;
    }
    setSelectedEmployeeId(doc.employeeId);
    if (isApprovalsMode) {
      const stageName = doc.stages[doc.activeStage]?.stage;
      const existing =
        stageName === "approver-2"
          ? doc.assessments.approver2?.ratings
          : stageName === "approver-1"
          ? doc.assessments.approver1?.ratings
          : undefined;
      setRatings(existing ? { ...existing } : {});
      setSavedForms(existing && ALL_APPRAISAL_KEYS.every((k) => existing[k] != null) ? ["A", "B", "C"] : []);
    } else {
      setRatings({ ...doc.selfRatings });
      setSavedForms([...(doc.savedForms ?? [])]);
    }
  }

  async function refresh() {
    const result = await loadSimulationAppraisalForm();
    setOverview(result);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationAppraisalForm()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Appraisal Form belum tersedia.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [identity.identity_id]);

  useEffect(() => {
    if (!overview || view === "af-activation") return;
    syncSelection(document);
  }, [view, approvalTab, search, overview, document?.employeeId, document?.version]);

  useEffect(() => {
    if (!overview || view !== "af-activation") return;
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
      setError(failure instanceof Error ? failure.message : "Operasi Appraisal Form gagal.");
    } finally {
      setBusy(false);
    }
  }

  const editableSelf =
    view === "appraisal-form" &&
    !!document &&
    document.employeeId === identity.identity_id &&
    document.status === "Draft";
  const activeStage = document?.stages[document.activeStage];
  const actionable =
    isApprovalsMode &&
    !!document &&
    document.status !== "Validated" &&
    activeStage?.actorId === identity.identity_id;

  const section = APPRAISAL_FORM_DEFS.find((s) => s.id === activeForm)!;
  const sectionKeys = section.items.map((item) => `${section.id}-${item.no}`);
  const ratedCount = sectionKeys.filter((k) => ratings[k] != null).length;
  const allSectionRated = ratedCount === section.items.length;
  const allFormsRated = ALL_APPRAISAL_KEYS.every((k) => ratings[k] != null);
  const allFormsSaved = (["A", "B", "C"] as const).every((id) => savedForms.includes(id));

  function setItemRating(no: number, score: number) {
    const itemKey = `${activeForm}-${no}`;
    setRatings((curr) => ({ ...curr, [itemKey]: score }));
    if (savedForms.includes(activeForm)) {
      setSavedForms((curr) => curr.filter((id) => id !== activeForm));
    }
  }

  async function saveCurrentSection() {
    if (!document || !allSectionRated) return;
    const nextSaved = [...new Set([...savedForms, activeForm])];
    if (editableSelf) {
      await run(async () => {
        await actOnSimulationAppraisalForm(document, "save", ratings, nextSaved);
        setSavedForms(nextSaved);
        setMessage(`${section.tab} berhasil disimpan ke draft.`);
        await refresh();
        const nextIdx = APPRAISAL_FORM_DEFS.findIndex((f) => f.id === activeForm) + 1;
        if (nextIdx < APPRAISAL_FORM_DEFS.length) {
          setActiveForm(APPRAISAL_FORM_DEFS[nextIdx].id);
        }
      });
    } else if (actionable) {
      setSavedForms(nextSaved);
      const nextIdx = APPRAISAL_FORM_DEFS.findIndex((f) => f.id === activeForm) + 1;
      if (nextIdx < APPRAISAL_FORM_DEFS.length) {
        setActiveForm(APPRAISAL_FORM_DEFS[nextIdx].id);
      }
    }
  }

  async function handleAction(action: KpiAction) {
    if (!document) return;
    await run(async () => {
      await actOnSimulationAppraisalForm(document, action, ratings, ["A", "B", "C"], note);
      setConfirmation(null);
      setMessage(
        action === "submit"
          ? "Self-Assessment Appraisal Form berhasil disubmit untuk evaluasi Approver 1."
          : "Evaluasi Appraisal Form berhasil disimpan.",
      );
      await refresh();
      await refreshNotifications();
    });
  }

  const previewDocument: AppraisalFormDocument | undefined = document
    ? {
        ...document,
        selfRatings: editableSelf ? ratings : document.selfRatings,
        assessments: {
          ...document.assessments,
          ...(actionable && activeStage?.stage === "approver-1"
            ? {
                approver1: { actorId: identity.identity_id, ratings, comment: note, at: "" },
                ...(document.mirrorSecondSlot
                  ? { approver2: { actorId: identity.identity_id, ratings, comment: note, at: "", mirrored: true } }
                  : {}),
              }
            : {}),
          ...(actionable && activeStage?.stage === "approver-2"
            ? { approver2: { actorId: identity.identity_id, ratings, comment: note, at: "" } }
            : {}),
        },
      }
    : undefined;
  const scorePreview = calculateAppraisalFormScore(previewDocument);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Modul Appraisal Form PA-Simulasi · Periode 2026 (Form A 60% · Form B 25% · Form C 15% · Self-Assessment → Approver 1 → Approver 2)
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

      {view === "af-activation" && identity.actor_level === "hr-strategic" && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold text-[#1A284F]">Module Activation · Appraisal Form</h2>
          <p className="text-xs text-gray-500">
            Tetapkan jadwal aktif pengisian Self-Assessment dan evaluasi Approver Appraisal Form per unit usaha (WIB).
          </p>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveAppraisalFormWindow(unitId, startDate, endDate);
                await refresh();
                setMessage("Jadwal Appraisal Form tersimpan.");
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
              Start Date
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
              End Date
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
                {filteredApprovals.map((record) => {
                  const emp = simulationEmployees.find((e) => e.id === record.employeeId)!;
                  const isCurrent = document?.employeeId === record.employeeId;
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
                          onClick={() => syncSelection(record)}
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
                        ? "Tidak ada pengajuan Appraisal Form yang berstatus Pending pada saat ini."
                        : approvalTab === "validated"
                        ? "Belum ada pengajuan Appraisal Form yang berstatus Validated."
                        : "Tidak ada pengajuan Appraisal Form yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(view === "appraisal-form" || view === "approvals-appraisal-form") && document && (
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">Appraisal Form · 2026</h2>
              <p className="text-xs text-gray-500">
                Bobot modul Appraisal Form: {document.snapshot.weights["appraisal-form"]}% · Jadwal Unit{" "}
                {document.snapshot.unitId}:{" "}
                {overview?.windows.find((w) => w.unitId === document.snapshot.unitId)?.window
                  ? `${overview.windows.find((w) => w.unitId === document.snapshot.unitId)!.window!.startDate} — ${
                      overview.windows.find((w) => w.unitId === document.snapshot.unitId)!.window!.endDate
                    } WIB`
                  : "Belum dibuka HR Strategic"}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
              {document.status} · versi {document.version}
            </span>
          </div>

          <EmployeeIdentityCard employeeId={document.employeeId} />

          <ol className="flex flex-wrap gap-2">
            {document.stages.map((st, idx) => (
              <li
                key={st.stage}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  idx === document.activeStage ? "border-teal-600 bg-teal-50 font-semibold" : "border-gray-200"
                }`}
              >
                {st.stage} · {st.actorId}
                {st.stage === "approver-1" && document.mirrorSecondSlot ? " (A1 + A2)" : ""}
              </li>
            ))}
          </ol>

          {/* Form A / B / C Tab bar */}
          <div className="flex border-b border-gray-200">
            {APPRAISAL_FORM_DEFS.map((f, idx) => {
              const isActive = activeForm === f.id;
              const isSaved = savedForms.includes(f.id);
              const isLocked =
                (editableSelf || actionable) && idx > 0 && !savedForms.includes(APPRAISAL_FORM_DEFS[idx - 1].id);
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => !isLocked && setActiveForm(f.id)}
                  className={`flex-1 border-b-2 px-4 py-3 text-center transition-colors ${
                    isActive
                      ? "border-[#1A284F] bg-gray-50 font-bold text-[#1A284F]"
                      : isLocked
                      ? "cursor-not-allowed border-transparent text-gray-300"
                      : "border-transparent text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 text-sm">
                    <span>
                      {f.tab} ({f.percentage}%)
                    </span>
                    {isSaved && <CheckCircle2 size={15} className="text-green-600" />}
                  </div>
                  <p className="text-[11px] font-normal text-gray-400">{f.subtitle}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[#1A284F] px-5 py-3 text-white">
            <span className="text-sm font-bold">{section.sectionTitle}</span>
            <span className="rounded bg-[#C69A45] px-3 py-1 text-xs font-semibold">({section.percentage}%) Nilai Total</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs">
                  <th className="w-12 border-r border-gray-200 px-3 py-3 text-left font-semibold">No</th>
                  <th className="border-r border-gray-200 px-4 py-3 text-left font-semibold">Kompetensi</th>
                  <th className="w-44 border-r border-gray-200 px-3 py-3 text-center font-semibold">Indikator Penilaian</th>
                  <th className="w-52 border-r border-gray-200 px-3 py-3 text-center font-semibold">
                    <div>Evaluasi Pribadi Karyawan</div>
                    <div className="mt-1 flex justify-around font-normal text-gray-400">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className="w-7 text-center">
                          {n}
                        </span>
                      ))}
                    </div>
                  </th>
                  {(isApprovalsMode || document.status !== "Draft") && (
                    <th className="w-52 border-r border-gray-200 px-3 py-3 text-center font-semibold text-indigo-700">
                      <div>Evaluasi Approver 1</div>
                      <div className="mt-1 flex justify-around font-normal text-indigo-400">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className="w-7 text-center">
                            {n}
                          </span>
                        ))}
                      </div>
                    </th>
                  )}
                  {(isApprovalsMode || document.status === "Validated" || !!document.assessments.approver2) && (
                    <th className="w-52 px-3 py-3 text-center font-semibold text-teal-700">
                      <div>Evaluasi Approver 2</div>
                      <div className="mt-1 flex justify-around font-normal text-teal-400">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <span key={n} className="w-7 text-center">
                            {n}
                          </span>
                        ))}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {section.items.map((item) => {
                  const itemKey = `${section.id}-${item.no}`;
                  const selfVal = editableSelf ? ratings[itemKey] : document.selfRatings[itemKey];
                  const app1Val =
                    actionable && activeStage?.stage === "approver-1"
                      ? ratings[itemKey]
                      : document.assessments.approver1?.ratings[itemKey];
                  const app2Val =
                    actionable && activeStage?.stage === "approver-2"
                      ? ratings[itemKey]
                      : document.assessments.approver2?.ratings[itemKey];

                  return (
                    <tr key={item.no} className="hover:bg-gray-50/50">
                      <td className="border-r border-gray-100 px-3 py-3 align-top text-xs text-gray-500">{item.no}</td>
                      <td className="border-r border-gray-100 px-4 py-3 align-top text-xs leading-relaxed text-gray-800">
                        {item.label && <span className="font-bold italic">{item.label} </span>}
                        {item.description}
                      </td>
                      <td className="border-r border-gray-100 px-3 py-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => setIndicatorItem(item)}
                          className="rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-[#1A284F] hover:text-[#1A284F]"
                        >
                          Lihat Indikator Penilaian
                        </button>
                      </td>
                      <td className="border-r border-gray-100 px-3 py-3 align-middle">
                        <div className="flex items-center justify-around">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              disabled={!editableSelf || busy}
                              onClick={() => setItemRating(item.no, n)}
                              className={`h-8 w-8 rounded border text-xs font-bold transition-colors ${
                                selfVal === n
                                  ? "border-[#1A284F] bg-[#1A284F] text-white"
                                  : editableSelf
                                  ? "border-gray-300 bg-white text-gray-600 hover:border-[#1A284F]"
                                  : "border-gray-200 bg-gray-50 text-gray-300"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </td>
                      {(isApprovalsMode || document.status !== "Draft") && (
                        <td className="border-r border-gray-100 px-3 py-3 align-middle">
                          <div className="flex items-center justify-around">
                            {[1, 2, 3, 4, 5].map((n) => {
                              const canEditA1 = actionable && activeStage?.stage === "approver-1" && !busy;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  disabled={!canEditA1}
                                  onClick={() => setItemRating(item.no, n)}
                                  className={`h-8 w-8 rounded border text-xs font-bold transition-colors ${
                                    app1Val === n
                                      ? "border-indigo-600 bg-indigo-600 text-white"
                                      : canEditA1
                                      ? "border-indigo-300 bg-white text-indigo-600 hover:border-indigo-600"
                                      : "border-gray-200 bg-gray-50 text-gray-300"
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      )}
                      {(isApprovalsMode || document.status === "Validated" || !!document.assessments.approver2) && (
                        <td className="px-3 py-3 align-middle">
                          <div className="flex items-center justify-around">
                            {[1, 2, 3, 4, 5].map((n) => {
                              const canEditA2 = actionable && activeStage?.stage === "approver-2" && !busy;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  disabled={!canEditA2}
                                  onClick={() => setItemRating(item.no, n)}
                                  className={`h-8 w-8 rounded border text-xs font-bold transition-colors ${
                                    app2Val === n
                                      ? "border-teal-600 bg-teal-600 text-white"
                                      : canEditA2
                                      ? "border-teal-300 bg-white text-teal-600 hover:border-teal-600"
                                      : "border-gray-200 bg-gray-50 text-gray-300"
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(editableSelf || actionable) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-600">
                <strong>{ratedCount}</strong> dari <strong>{section.items.length}</strong> kompetensi pada {section.tab} telah dinilai.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || !allSectionRated}
                  onClick={() => void saveCurrentSection()}
                  className="rounded-lg border border-[#1A284F] bg-white px-4 py-2 text-xs font-semibold text-[#1A284F] disabled:opacity-40"
                >
                  Simpan {section.tab}
                </button>
                {editableSelf && (
                  <button
                    type="button"
                    disabled={busy || !allFormsRated}
                    onClick={() => setConfirmation("submit")}
                    className={buttonClass + " flex items-center gap-1.5 text-xs"}
                  >
                    <Send size={14} /> Submit Self-Assessment
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Summary Table across Form A (60%), Form B (25%), Form C (15%) */}
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[750px] border-collapse text-xs">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Bagian Form</th>
                  <th className="px-4 py-3 text-center font-semibold">Bobot Form</th>
                  <th className="px-4 py-3 text-center font-semibold">Rata-rata Self</th>
                  <th className="px-4 py-3 text-center font-semibold">Rata-rata Approver 1</th>
                  <th className="px-4 py-3 text-center font-semibold">Rata-rata Approver 2</th>
                  <th className="px-4 py-3 text-center font-semibold">Rata-rata Gabungan (1–5)</th>
                  <th className="px-4 py-3 text-center font-semibold">Skor Form (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scorePreview.forms.map((f) => (
                  <tr key={f.formId}>
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{f.title}</td>
                    <td className="px-4 py-2.5 text-center">{f.percentage}%</td>
                    <td className="px-4 py-2.5 text-center">{fmtNum(f.selfAvg)}</td>
                    <td className="px-4 py-2.5 text-center">{fmtNum(f.app1Avg)}</td>
                    <td className="px-4 py-2.5 text-center">{fmtNum(f.app2Avg)}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{fmtNum(f.combinedAvg)}</td>
                    <td className="px-4 py-2.5 text-center font-bold text-[#1A284F]">
                      {f.weightedPct != null ? `${f.weightedPct.toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold text-[#1A284F]">
                  <td className="px-4 py-3">Total / Skor Akhir Appraisal Form</td>
                  <td className="px-4 py-3 text-center">100%</td>
                  <td className="px-4 py-3 text-center">{fmtNum(scorePreview.grandSelf)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(scorePreview.grandApp1)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(scorePreview.grandApp2)}</td>
                  <td className="px-4 py-3 text-center">{fmtNum(scorePreview.grandCombined)}</td>
                  <td className="px-4 py-3 text-center">
                    {scorePreview.score != null
                      ? `${scorePreview.score.toFixed(2)}% (Kontribusi PA ${document.snapshot.weights["appraisal-form"]}%: ${scorePreview.weightedScore?.toFixed(2)}%)`
                      : "Menunggu Evaluasi Lengkap"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {actionable && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <label className="block text-sm">
                Komentar / Catatan Evaluasi {activeStage?.stage === "approver-1" ? "Approver 1" : "Approver 2"}
                <textarea
                  rows={3}
                  className={inputClass + " mt-1"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                  placeholder="Tambahkan catatan evaluasi perilaku dan kompetensi karyawan..."
                />
              </label>
              <button
                type="button"
                disabled={busy || !allFormsRated || !allFormsSaved}
                onClick={() => setConfirmation("advance")}
                className={buttonClass}
              >
                {document.mirrorSecondSlot && activeStage?.stage === "approver-1"
                  ? "Submit Evaluasi GM (Approver 1 + Approver 2)"
                  : `Submit Evaluasi ${activeStage?.stage === "approver-1" ? "Approver 1" : "Approver 2"}`}
              </button>
              {(!allFormsRated || !allFormsSaved) && (
                <p className="text-xs text-amber-700">
                  Lengkapi nilai 1–5 dan klik Simpan pada Form A, Form B, serta Form C sebelum submit evaluasi.
                </p>
              )}
            </div>
          )}

          <section className="space-y-2 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold">History Appraisal Form</h3>
            {!document.history.filter((h) => h.action !== "save").length && (
              <p className="text-xs text-gray-400">Belum ada riwayat submission/evaluasi.</p>
            )}
            {document.history
              .filter((h) => h.action !== "save")
              .map((event, idx) => (
                <div key={`${event.version}-${idx}`} className="rounded-lg bg-gray-50 p-3 text-xs">
                  <p className="font-semibold">
                    {event.status} · {event.stage ?? "Self-Assessment Karyawan"} · {event.actorId}
                    {event.mirrored ? " · slot otomatis" : ""}
                  </p>
                  <p className="mt-1 text-gray-400">
                    {formatDate(event.at)} · versi {event.version}
                  </p>
                  {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
                </div>
              ))}
          </section>
        </section>
      )}

      <Dialog.Root open={!!indicatorItem} onOpenChange={(open) => !open && setIndicatorItem(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%_-_2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <Dialog.Title className="text-base font-bold text-[#1A284F]">
                Indikator Penilaian · {indicatorItem?.label || `Kompetensi No. ${indicatorItem?.no}`}
              </Dialog.Title>
              <Dialog.Close aria-label="Tutup indikator">
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-xs text-gray-600">{indicatorItem?.description}</Dialog.Description>
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[750px] border-collapse text-xs">
                <thead className="bg-[#1A284F] text-white">
                  <tr>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <th key={n} className="border-r border-white/20 px-3 py-2.5 text-center font-semibold last:border-r-0">
                        Nilai {n}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {indicatorItem?.indicators.map((ind) => (
                      <td key={ind.score} className="border-r border-gray-100 p-3 align-top leading-relaxed text-gray-700 last:border-r-0">
                        {ind.text}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-[#1A284F]">Konfirmasi Appraisal Form</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-500">
              {confirmation === "submit"
                ? "Submit Self-Assessment Appraisal Form (Form A, B, dan C)? Setelah disubmit, nilai pribadi terkunci dan diteruskan ke Approver 1."
                : "Submit hasil evaluasi Appraisal Form tahap ini? Tindakan tidak dapat diubah setelah disimpan."}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <button disabled={busy} onClick={() => setConfirmation(null)} className="rounded-lg border px-4 py-2 text-sm">
                Batal
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirmation) void handleAction(confirmation);
                }}
                className={buttonClass}
              >
                Konfirmasi
              </button>
            </div>
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
