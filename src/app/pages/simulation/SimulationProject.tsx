import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileSpreadsheet, Plus, RefreshCw, Send, Trash2, Upload, X } from "lucide-react";
import {
  calculateProjectModuleScore,
  canManageProjectUpload,
  PROJECT_EXCEL_HEADERS,
} from "../../../../supabase/functions/server/shared/projectWorkflow";
import type {
  ProjectExcelRow,
  ProjectSimulationDocument,
} from "../../../../supabase/functions/server/shared/projectWorkflow";
import type { KpiAction } from "../../domain/kpiSettingWorkflow";
import { simulationEmployees, simulationUnits } from "../../data/paSimulation2026";
import {
  actOnSimulationProject,
  bulkUploadSimulationProject,
  loadSimulationProject,
  saveProjectWindow,
} from "../../services/paSimulationApi";
import type { ProjectOverview, SimulationIdentity } from "../../services/paSimulationApi";
import { downloadProjectExcelTemplate, parseProjectExcelFile } from "../../utils/projectExcelUtils";

export type ProjectSimulationView = "project" | "approvals-project" | "project-activation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-gray-50 disabled:text-gray-600";
const buttonClass =
  "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

const blankProjectRow = (no: number): ProjectExcelRow => ({
  no,
  projectScope: 'QCC - "Small Group Activity"',
  roleProject: "Member / Anggota",
  projectTitle: "",
  projectDetail: "",
  startDate: "2026-01-15",
  finishDate: "2026-06-30",
  progressStatus: "Done",
  finalScore: 85,
});

export function SimulationProject({
  identity,
  view,
  refreshNotifications,
}: {
  identity: SimulationIdentity;
  view: ProjectSimulationView;
  refreshNotifications: () => Promise<void>;
}) {
  const isHrIcfUploader =
    identity.actor_level === "hr-unit" || identity.actor_level === "hr-strategic";
  const [overview, setOverview] = useState<ProjectOverview | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<"my-project" | "icf-upload">(() =>
    identity.actor_level === "hr-strategic" ? "icf-upload" : "my-project",
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [approvalTab, setApprovalTab] = useState<"pending" | "validated" | "all">("pending");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ProjectExcelRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<KpiAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unitId, setUnitId] = useState("IND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const isApprovalsMode = view === "approvals-project";

  const icfUploadDocuments =
    overview?.documents.filter((doc) =>
      canManageProjectUpload(
        doc,
        identity.identity_id,
        identity.actor_level,
        identity.unit_id,
        identity.actor_level === "hr-strategic",
      ),
    ) ?? [];

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
  const document: ProjectSimulationDocument | undefined =
    view === "project"
      ? workspaceMode === "icf-upload" && isHrIcfUploader
        ? icfUploadDocuments.find((doc) => doc.employeeId === selectedEmployeeId) ?? icfUploadDocuments[0]
        : ownDocument
      : view === "approvals-project"
      ? filteredApprovals.find((doc) => doc.employeeId === selectedEmployeeId) ?? filteredApprovals[0]
      : undefined;

  function syncSelection(doc: ProjectSimulationDocument | undefined) {
    setConfirmation(null);
    setNote("");
    if (!doc) {
      setSelectedEmployeeId(null);
      setRows([]);
      setFileName("");
      return;
    }
    setSelectedEmployeeId(doc.employeeId);
    setRows(structuredClone(doc.rows));
    setFileName(doc.fileName ?? "");
  }

  async function refresh() {
    const result = await loadSimulationProject();
    setOverview(result);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationProject()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Project Outside Job Scope belum tersedia.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [identity.identity_id]);

  useEffect(() => {
    if (!overview || view === "project-activation") return;
    syncSelection(document);
  }, [view, workspaceMode, approvalTab, search, overview, document?.employeeId, document?.version]);

  useEffect(() => {
    if (!overview || view !== "project-activation") return;
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
      setError(failure instanceof Error ? failure.message : "Operasi Project Outside Job Scope gagal.");
    } finally {
      setBusy(false);
    }
  }

  const editableUpload =
    view === "project" &&
    workspaceMode === "icf-upload" &&
    !!document &&
    canManageProjectUpload(
      document,
      identity.identity_id,
      identity.actor_level,
      identity.unit_id,
      identity.actor_level === "hr-strategic",
    ) &&
    (document.status === "Draft" || document.revisionStage !== null);

  const activeStage = document?.stages[document.activeStage];
  const actionable =
    isApprovalsMode &&
    !!document &&
    document.revisionStage === null &&
    document.status !== "Validated" &&
    activeStage?.actorId === identity.identity_id;

  const previewScore = calculateProjectModuleScore(
    document ? { ...document, rows: editableUpload ? rows : document.rows } : undefined,
  );
  const maxRowScore = rows.length ? Math.max(...rows.map((r) => r.finalScore)) : null;

  async function handleAction(action: KpiAction) {
    if (!document) return;
    await run(async () => {
      await actOnSimulationProject(
        document,
        action,
        editableUpload ? rows : undefined,
        editableUpload ? fileName || "Upload_HR_ICF.xlsx" : undefined,
        note,
      );
      setConfirmation(null);
      setMessage(
        action === "save"
          ? "Draft Excel Project Outside Job Scope berhasil disimpan oleh HR ICF."
          : action === "submit"
          ? "Data Excel Project Outside Job Scope berhasil disubmit oleh HR ICF ke Approver Level 1."
          : "Keputusan Approval Project Outside Job Scope berhasil disimpan.",
      );
      await refresh();
      await refreshNotifications();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Modul Project Outside Job Scope PA-Simulasi · Periode 2026 (Upload Excel oleh HR ICF → Approval Level 1 & Level 2 · Skor Tertinggi × Bobot Modul)
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

      {view === "project-activation" && identity.actor_level === "hr-strategic" && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold text-[#1A284F]">Module Activation · Project Outside Job Scope</h2>
          <p className="text-xs text-gray-500">
            Tetapkan jadwal aktif unggah Excel oleh HR ICF dan persetujuan Approver Level 1 & Level 2 per unit usaha (WIB).
          </p>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveProjectWindow(unitId, startDate, endDate);
                await refresh();
                setMessage("Jadwal Project Outside Job Scope tersimpan.");
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

      {view === "project" && isHrIcfUploader && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="text-xs text-[#1A284F]">
            <strong>Mode HR ICF Aktif:</strong> Anda dapat mengunggah file Excel Project Outside Job Scope untuk karyawan unit usaha Anda dan meneruskannya ke Approval Level 1 & Level 2.
          </div>
          <div className="flex gap-2">
            {identity.appraisal_participant && (
              <button
                type="button"
                onClick={() => setWorkspaceMode("my-project")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  workspaceMode === "my-project" ? "bg-[#1A284F] text-white" : "bg-white text-gray-700 border"
                }`}
              >
                Project Saya (Karyawan)
              </button>
            )}
            <button
              type="button"
              onClick={() => setWorkspaceMode("icf-upload")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                workspaceMode === "icf-upload" ? "bg-[#1A284F] text-white" : "bg-white text-gray-700 border"
              }`}
            >
              Upload Excel Karyawan (HR ICF)
            </button>
          </div>
        </div>
      )}

      {view === "project" && workspaceMode === "icf-upload" && isHrIcfUploader && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <label className="block max-w-xl text-sm font-semibold text-[#1A284F]">
            Pilih Karyawan untuk Upload Excel Project (HR ICF)
            <select
              disabled={busy}
              value={document?.employeeId ?? ""}
              onChange={(e) => {
                const target = icfUploadDocuments.find((d) => d.employeeId === e.target.value);
                if (target) syncSelection(target);
              }}
              className={inputClass + " mt-1 font-normal"}
            >
              {icfUploadDocuments.map((doc) => {
                const emp = simulationEmployees.find((e) => e.id === doc.employeeId)!;
                return (
                  <option key={doc.employeeId} value={doc.employeeId}>
                    {emp.id} · {emp.name} ({emp.companyUnit} · {emp.position}) — [{doc.status}]
                  </option>
                );
              })}
            </select>
          </label>
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
                        ? "Tidak ada pengajuan Project Outside Job Scope yang berstatus Pending pada saat ini."
                        : approvalTab === "validated"
                        ? "Belum ada pengajuan Project Outside Job Scope yang berstatus Validated."
                        : "Tidak ada pengajuan Project Outside Job Scope yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(view === "project" || view === "approvals-project") && document && (
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">Project Outside Job Scope · 2026</h2>
              <p className="text-xs text-gray-500">
                Bobot modul Project: {document.snapshot.weights.project}% · Diunggah oleh:{" "}
                {document.uploadedBy ?? "Belum diunggah HR ICF"}
                {fileName ? ` · File: ${fileName}` : ""} · Jadwal Unit {document.snapshot.unitId}:{" "}
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
                {st.stage === "approver-1" ? "Approval Level 1" : "Approval Level 2"} · {st.actorId}
                {st.stage === "approver-1" && document.mirrorSecondSlot ? " (Level 1 + Level 2)" : ""}
              </li>
            ))}
          </ol>

          {document.revisionStage !== null && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Revisi diminta oleh Approver: {document.history.filter((h) => h.action === "revise").slice(-1)[0]?.note}. Silakan unggah ulang atau perbaiki baris tabel di bawah ini lalu Submit kembali.
            </p>
          )}

          {editableUpload && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#1A284F]/40 bg-slate-50 p-4">
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#1A284F]">Upload File Excel Project Outside Job Scope (HR ICF)</p>
                <p className="text-xs text-gray-500">
                  Unggah file Excel dari sistem eksternal (berisi data karyawan yang memiliki project). Saat diunggah oleh HR Unit Usaha atau HR ICF, data <strong>otomatis langsung masuk ke proses Approval Level 1 & Level 2</strong> masing-masing karyawan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadProjectExcelTemplate(
                      icfUploadDocuments.map((doc) => {
                        const emp = simulationEmployees.find((e) => e.id === doc.employeeId)!;
                        return {
                          id: emp.id,
                          name: emp.name,
                          unit: emp.companyUnit,
                          department: emp.department,
                          position: emp.position,
                        };
                      }),
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Download size={14} /> Download Template Excel
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1A284F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#131d3b]">
                  <Upload size={14} /> Upload Excel (.xlsx / .csv)
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void run(async () => {
                        const parsed = await parseProjectExcelFile(file);
                        const grouped = new Map<string, ProjectExcelRow[]>();
                        for (const item of parsed) {
                          const targetEmpId = item.employeeId?.trim() || document.employeeId;
                          const list = grouped.get(targetEmpId) ?? [];
                          list.push({
                            no: list.length + 1,
                            projectScope: item.projectScope,
                            roleProject: item.roleProject,
                            projectTitle: item.projectTitle,
                            projectDetail: item.projectDetail,
                            startDate: item.startDate,
                            finishDate: item.finishDate,
                            progressStatus: item.progressStatus,
                            finalScore: item.finalScore,
                          });
                          grouped.set(targetEmpId, list);
                        }
                        const entries = [...grouped.entries()].map(([employeeId, empRows]) => ({
                          employeeId,
                          rows: empRows,
                        }));
                        const result = await bulkUploadSimulationProject(entries, file.name);
                        await refresh();
                        await refreshNotifications();
                        setMessage(
                          `File "${file.name}" (${parsed.length} baris proyek untuk ${result.count} karyawan) berhasil diunggah oleh HR dan otomatis masuk ke proses Approval Level 1 & Level 2 masing-masing karyawan.`,
                        );
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setRows((curr) => [...curr, blankProjectRow(curr.length + 1)])}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#1A284F] bg-white px-3 py-2 text-xs font-semibold text-[#1A284F]"
                >
                  <Plus size={14} /> Tambah Baris
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[1150px] border-collapse text-xs">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  {PROJECT_EXCEL_HEADERS.map((h) => (
                    <th key={h} className="border border-[#1A284F]/30 px-3 py-3 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                  {editableUpload && <th className="border border-[#1A284F]/30 px-3 py-3 text-center">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isHighest = maxRowScore !== null && row.finalScore === maxRowScore;
                  return (
                    <tr key={idx} className={isHighest ? "bg-emerald-50/50" : "hover:bg-gray-50"}>
                      <td className="border border-gray-200 px-3 py-2.5 text-center font-semibold">{idx + 1}</td>
                      {(
                        [
                          ["projectScope", "Project Scope"],
                          ["roleProject", "Role Project"],
                          ["projectTitle", "Project Title"],
                          ["projectDetail", "Project Detail"],
                          ["startDate", "Start Date"],
                          ["finishDate", "Finish Date"],
                          ["progressStatus", "Progress Status"],
                        ] as const
                      ).map(([field, label]) => (
                        <td key={field} className="border border-gray-200 px-3 py-2">
                          {editableUpload ? (
                            <input
                              aria-label={`${label} baris ${idx + 1}`}
                              value={row[field]}
                              onChange={(e) =>
                                setRows((curr) =>
                                  curr.map((item, i) => (i === idx ? { ...item, [field]: e.target.value } : item)),
                                )
                              }
                              className={inputClass + " text-xs"}
                            />
                          ) : (
                            <span>{row[field]}</span>
                          )}
                        </td>
                      ))}
                      <td className="border border-gray-200 px-3 py-2 text-center font-bold text-[#1A284F]">
                        {editableUpload ? (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            value={row.finalScore}
                            onChange={(e) =>
                              setRows((curr) =>
                                curr.map((item, i) =>
                                  i === idx ? { ...item, finalScore: Number(e.target.value) || 0 } : item,
                                ),
                              )
                            }
                            className={inputClass + " w-24 text-center text-xs font-bold"}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {row.finalScore}%
                            {isHighest && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                Tertinggi
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {editableUpload && (
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setRows((curr) =>
                                curr.filter((_, i) => i !== idx).map((item, i) => ({ ...item, no: i + 1 })),
                              )
                            }
                            className="text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={editableUpload ? 10 : 9} className="border border-gray-200 px-4 py-10 text-center text-gray-400">
                      <FileSpreadsheet className="mx-auto mb-2 h-7 w-7 text-gray-300" />
                      Belum ada data Excel Project Outside Job Scope yang diunggah oleh HR ICF untuk karyawan ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Final Score Tertinggi (Dari {rows.length} Proyek)
              </h3>
              <p className="mt-2 text-lg font-bold text-[#1A284F]">
                {previewScore.maxFinalScore != null ? `${previewScore.maxFinalScore.toFixed(2)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Diambil nilai <code>Final Score</code> tertinggi dari baris proyek karyawan.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Bobot Modul Project</h3>
              <p className="mt-2 text-lg font-bold text-[#1A284F]">{document.snapshot.weights.project}%</p>
              <p className="mt-1 text-xs text-gray-500">Sesuai level jabatan ({document.snapshot.level}).</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Kontribusi Nilai PA (Skor Tertinggi × Bobot)
              </h3>
              <p className="mt-2 text-lg font-bold text-emerald-700">
                {previewScore.maxFinalScore != null
                  ? `${(((previewScore.maxFinalScore * document.snapshot.weights.project) / 100)).toFixed(2)}%`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Status resmi: {previewScore.complete ? "Tervalidasi (Final)" : "Menunggu Approval Level 1 & Level 2"}
              </p>
            </div>
          </div>

          {editableUpload && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || !rows.length}
                onClick={() => void handleAction("save")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                Simpan Draft Excel
              </button>
              <button
                type="button"
                disabled={busy || !rows.length}
                onClick={() => setConfirmation("submit")}
                className={buttonClass + " flex items-center gap-2"}
              >
                <Send size={15} />{" "}
                {document.revisionStage !== null
                  ? "Submit Ulang Revisi ke Approver"
                  : "Submit Excel ke Approval Level 1 & 2"}
              </button>
            </div>
          )}

          {actionable && (
            <div className="space-y-3 border-t border-gray-200 pt-4">
              <label className="block text-sm">
                Catatan Approval / Alasan Revisi ({activeStage?.stage === "approver-1" ? "Approval Level 1" : "Approval Level 2"})
                <textarea
                  rows={2}
                  className={inputClass + " mt-1"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={busy}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} onClick={() => setConfirmation("advance")} className={buttonClass}>
                  {document.mirrorSecondSlot && activeStage?.stage === "approver-1"
                    ? "Setujui GM (Level 1 + Level 2)"
                    : activeStage?.stage === "approver-2"
                    ? "Setujui Final (Approval Level 2)"
                    : "Setujui & Teruskan ke Level 2"}
                </button>
                <button
                  disabled={busy || !note.trim()}
                  onClick={() => setConfirmation("revise")}
                  className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-40"
                >
                  Minta Revisi ke HR ICF
                </button>
              </div>
            </div>
          )}

          <section className="space-y-2 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold">History Approval Project</h3>
            {!document.history.filter((h) => h.action !== "save").length && (
              <p className="text-xs text-gray-400">Belum ada riwayat submission/approval.</p>
            )}
            {document.history
              .filter((h) => h.action !== "save")
              .map((event, idx) => (
                <div key={`${event.version}-${idx}`} className="rounded-lg bg-gray-50 p-3 text-xs">
                  <p className="font-semibold">
                    {event.status} · {event.stage ?? "Upload HR ICF"} · {event.actorId}
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

      <Dialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold text-[#1A284F]">
              Konfirmasi Project Outside Job Scope
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-gray-500">
              {confirmation === "submit"
                ? "Submit data Excel Project Outside Job Scope ini untuk diperiksa oleh Approval Level 1 & Level 2?"
                : confirmation === "revise"
                ? "Kembalikan data Project ini ke HR ICF untuk direvisi?"
                : "Setujui data Project Outside Job Scope pada tahap approval ini?"}
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
