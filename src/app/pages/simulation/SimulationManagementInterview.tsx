import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardEdit,
  Clock,
  Info,
  MapPin,
  MessageSquare,
  RefreshCw,
  Save,
  Send,
  User,
  Users,
  X,
} from "lucide-react";
import {
  calculateManagementInterviewScore,
  canManageInterviewSchedule,
  isEligibleForManagementInterview,
  MI_ASPECTS,
  MI_RECOMMENDATIONS,
} from "../../../../supabase/functions/server/shared/managementInterviewWorkflow";
import type {
  ManagementInterviewAspect,
  ManagementInterviewDocument,
  MIRecommendation,
} from "../../../../supabase/functions/server/shared/managementInterviewWorkflow";
import { simulationEmployees, simulationUnits } from "../../data/paSimulation2026";
import {
  actOnSimulationManagementInterview,
  loadSimulationManagementInterview,
  saveManagementInterviewWindow,
} from "../../services/paSimulationApi";
import type { ManagementInterviewOverview, SimulationIdentity } from "../../services/paSimulationApi";

export type ManagementInterviewView =
  | "management-interview"
  | "approvals-management-interview"
  | "mi-activation";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-gray-50 disabled:text-gray-600";
const buttonClass =
  "rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40";
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

const SCORE_COLOR: Record<number, { bg: string; text: string; label: string }> = {
  5: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Excellent" },
  4: { bg: "bg-blue-100", text: "text-blue-700", label: "Good" },
  3: { bg: "bg-amber-100", text: "text-amber-700", label: "Average" },
  2: { bg: "bg-orange-100", text: "text-orange-700", label: "Below Avg" },
  1: { bg: "bg-red-100", text: "text-red-700", label: "Poor" },
};

const REC_STYLE: Record<string, string> = {
  Promote: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Maintain Current Position": "bg-blue-50 text-blue-700 border-blue-200",
  "Needs Improvement": "bg-amber-50 text-amber-700 border-amber-200",
  "Further Review Required": "bg-orange-50 text-orange-700 border-orange-200",
};

function miScoreColor(pct: number | null): string {
  if (pct === null) return "text-gray-300";
  if (pct >= 90) return "text-emerald-700";
  if (pct >= 75) return "text-blue-700";
  if (pct >= 60) return "text-amber-700";
  return "text-rose-600";
}

function miBgColor(pct: number | null): string {
  if (pct === null) return "bg-gray-50";
  if (pct >= 90) return "bg-emerald-50";
  if (pct >= 75) return "bg-blue-50";
  if (pct >= 60) return "bg-amber-50";
  return "bg-rose-50";
}

export function SimulationManagementInterview({
  identity,
  view,
  refreshNotifications,
}: {
  identity: SimulationIdentity;
  view: ManagementInterviewView;
  refreshNotifications: () => Promise<void>;
}) {
  const isHrScheduler = identity.actor_level === "hr-unit" || identity.actor_level === "hr-strategic";
  const isOwnEligible = isEligibleForManagementInterview(identity.identity_id);
  const [overview, setOverview] = useState<ManagementInterviewOverview | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [approvalTab, setApprovalTab] = useState<"pending" | "validated" | "all">("pending");
  const [search, setSearch] = useState("");

  // HR Schedule form state
  const [scheduledDate, setScheduledDate] = useState("2026-10-15");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [location, setLocation] = useState("Ruang Rapat Direksi Lt. 3 / Zoom Meeting");
  const [otherUsersText, setOtherUsersText] = useState("");
  const [textNotifikasi, setTextNotifikasi] = useState("Harap hadir tepat waktu. Interview berdurasi ±60 menit.");
  const [textLampiran, setTextLampiran] = useState("Lampirkan dokumen KPI & ringkasan PA terakhir sebelum sesi dimulai.");

  // Reviewer Assessment state
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [recommendation, setRecommendation] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [indicatorModalAspect, setIndicatorModalAspect] = useState<ManagementInterviewAspect | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Activation window state
  const [unitId, setUnitId] = useState("IND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isApprovalsMode = view === "approvals-management-interview";

  const hrSchedulableDocs =
    overview?.documents.filter((doc) =>
      canManageInterviewSchedule(
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
        ? true
        : approvalTab === "validated"
        ? doc.status === "Validated"
        : doc.status !== "Validated" && doc.status !== "Cancelled",
    )
    .filter((doc) =>
      `${doc.employeeId} ${simulationEmployees.find((emp) => emp.id === doc.employeeId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );

  const ownDocument = overview?.documents.find((doc) => doc.employeeId === identity.identity_id);
  const document: ManagementInterviewDocument | undefined =
    view === "management-interview"
      ? isOwnEligible
        ? ownDocument
        : isHrScheduler
        ? hrSchedulableDocs.find((d) => d.employeeId === selectedEmployeeId) ?? hrSchedulableDocs[0]
        : undefined
      : view === "approvals-management-interview"
      ? filteredApprovals.find((d) => d.employeeId === selectedEmployeeId) ?? filteredApprovals[0]
      : undefined;

  function syncSelection(doc: ManagementInterviewDocument | undefined) {
    setConfirmSubmit(false);
    if (!doc) {
      setSelectedEmployeeId(null);
      setScores({});
      setRecommendation("");
      setComment("");
      return;
    }
    setSelectedEmployeeId(doc.employeeId);
    if (doc.schedule) {
      setScheduledDate(doc.schedule.scheduledDate);
      setScheduledTime(doc.schedule.scheduledTime);
      setLocation(doc.schedule.location);
      setOtherUsersText(doc.schedule.otherUsers.join(", "));
      setTextNotifikasi(doc.schedule.textNotifikasi);
      setTextLampiran(doc.schedule.textLampiran);
    }
    const mySlot = doc.reviewers.find((r) => r.actorId === identity.identity_id);
    if (mySlot) {
      setScores({ ...mySlot.scores });
      setRecommendation(mySlot.recommendation);
      setComment(mySlot.comment);
    } else {
      setScores(Object.fromEntries(MI_ASPECTS.map((a) => [a.id, null])));
      setRecommendation("");
      setComment("");
    }
  }

  async function refresh() {
    const result = await loadSimulationManagementInterview();
    setOverview(result);
  }

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadSimulationManagementInterview()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Management Interview belum tersedia.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [identity.identity_id]);

  useEffect(() => {
    if (!overview || view === "mi-activation") return;
    syncSelection(document);
  }, [view, approvalTab, search, overview, document?.employeeId, document?.version]);

  useEffect(() => {
    if (!overview || view !== "mi-activation") return;
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
      setError(failure instanceof Error ? failure.message : "Operasi Management Interview gagal.");
    } finally {
      setBusy(false);
    }
  }

  const canScheduleCurrent =
    !!document &&
    document.status !== "Validated" &&
    canManageInterviewSchedule(
      document,
      identity.identity_id,
      identity.actor_level,
      identity.unit_id,
      identity.actor_level === "hr-strategic",
    );

  const myReviewerSlot = document?.reviewers.find((r) => r.actorId === identity.identity_id);
  const canAssessCurrent =
    isApprovalsMode &&
    !!document &&
    !!document.schedule &&
    document.status !== "Unscheduled" &&
    document.status !== "Cancelled" &&
    document.status !== "Validated" &&
    !!myReviewerSlot &&
    myReviewerSlot.status !== "Completed";

  const allAspectsFilled = MI_ASPECTS.every((a) => scores[a.id] !== null && scores[a.id] !== undefined);
  const myFilledVals = MI_ASPECTS.map((a) => scores[a.id]).filter((v): v is number => v !== null && v !== undefined);
  const myLiveAvg = myFilledVals.length ? Number((myFilledVals.reduce((s, v) => s + v, 0) / myFilledVals.length).toFixed(2)) : null;
  const myLivePct = myLiveAvg !== null ? Number(((myLiveAvg / 5) * 100).toFixed(2)) : null;

  const scoreSummary = calculateManagementInterviewScore(document);

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!document) return;
    await run(async () => {
      await actOnSimulationManagementInterview(document.employeeId, document.version, {
        action: "schedule",
        scheduledDate,
        scheduledTime,
        location,
        otherUsers: otherUsersText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        textNotifikasi,
        textLampiran,
      });
      setMessage(
        `Jadwal Management Interview untuk ${document.employeeId} berhasil disimpan dan dikirim ke Kandidat serta Penilai (${document.reviewers.map((r) => r.actorName).join(", ")}).`,
      );
      await refresh();
      await refreshNotifications();
    });
  }

  async function handleAssessmentAction(action: "save-assessment" | "submit-assessment") {
    if (!document) return;
    await run(async () => {
      await actOnSimulationManagementInterview(document.employeeId, document.version, {
        action,
        scores,
        recommendation,
        comment,
      });
      setConfirmSubmit(false);
      setMessage(
        action === "save-assessment"
          ? "Penilaian Management Interview berhasil disimpan sementara (Saved)."
          : "Penilaian Management Interview berhasil di-submit dan dikunci.",
      );
      await refresh();
      await refreshNotifications();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Modul Management Interview PA-Simulasi · Periode 2026 (Khusus Level Ka. / Wa. Ka. Divisi ke atas · Bobot Modul 10%)
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

      {view === "mi-activation" && identity.actor_level === "hr-strategic" && (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold text-[#1A284F]">Module Activation · Management Interview</h2>
          <p className="text-xs text-gray-500">
            Tetapkan jadwal aktif penjadwalan dan penilaian Management Interview per unit usaha (WIB).
          </p>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await saveManagementInterviewWindow(unitId, startDate, endDate);
                await refresh();
                setMessage("Jadwal aktivasi Management Interview tersimpan.");
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

      {view === "management-interview" && !isOwnEligible && !isHrScheduler && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <strong>Informasi Kelayakan Modul:</strong> Modul <strong>Management Interview</strong> hanya berlaku untuk peserta level{" "}
          <strong>Ka. / Wa. Ka. Divisi ke atas (`divisi`)</strong> sesuai matriks group akses.
        </div>
      )}

      {view === "management-interview" && isHrScheduler && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
          <label className="block max-w-xl text-sm font-semibold text-[#1A284F]">
            Pilih Kandidat Level Kepala Divisi (`divisi`) — Penjadwalan & Monitoring HR
            <select
              disabled={busy}
              value={document?.employeeId ?? ""}
              onChange={(e) => {
                const target = hrSchedulableDocs.find((d) => d.employeeId === e.target.value);
                if (target) syncSelection(target);
              }}
              className={inputClass + " mt-1 font-normal"}
            >
              {hrSchedulableDocs.map((doc) => {
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
                  { id: "validated", label: "Validated (Selesai)" },
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
              Cari kandidat Kepala Divisi
              <input
                className={inputClass + " mt-1"}
                placeholder="ID Karyawan atau Nama"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full min-w-[1050px] border-collapse text-xs">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  {[
                    "ID Karyawan",
                    "Nama",
                    "Unit Usaha",
                    "Divisi",
                    "Jabatan",
                    "Jadwal Interview",
                    "Progres Penilai",
                    "Status",
                    "Aksi",
                  ].map((h) => (
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
                  const completedCount = record.reviewers.filter((r) => r.status === "Completed").length;
                  return (
                    <tr key={record.employeeId} className={isCurrent ? "bg-blue-50/50" : "hover:bg-gray-50"}>
                      {[emp.id, emp.name, emp.companyUnit, emp.division, emp.position].map((val, i) => (
                        <td key={i} className="border border-gray-200 px-3 py-3 text-gray-700">
                          {val}
                        </td>
                      ))}
                      <td className="border border-gray-200 px-3 py-3 text-gray-600">
                        {record.schedule
                          ? `${record.schedule.scheduledDate} · ${record.schedule.scheduledTime} WIB`
                          : "Belum Dijadwalkan"}
                      </td>
                      <td className="border border-gray-200 px-3 py-3 font-semibold text-[#1A284F]">
                        {completedCount} / {record.reviewers.length} Penilai Selesai
                      </td>
                      <td className="border border-gray-200 px-3 py-3">
                        <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
                          {record.status}
                        </span>
                      </td>
                      <td className="border border-gray-200 px-3 py-3">
                        <button
                          disabled={busy}
                          className="font-semibold text-[#1A284F] hover:underline"
                          onClick={() => syncSelection(record)}
                        >
                          {record.reviewers.some((r) => r.actorId === identity.identity_id && r.status !== "Completed")
                            ? "Nilai / Assess"
                            : "Lihat detail"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!filteredApprovals.length && (
                  <tr>
                    <td colSpan={9} className="border border-gray-200 px-4 py-8 text-center text-gray-500">
                      {approvalTab === "pending"
                        ? "Tidak ada kandidat Management Interview yang berstatus Pending pada saat ini."
                        : approvalTab === "validated"
                        ? "Belum ada kandidat Management Interview yang berstatus Validated (Selesai)."
                        : "Tidak ada data Management Interview yang cocok dengan filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(view === "management-interview" || view === "approvals-management-interview") && document && (
        <section className="space-y-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">Management Interview · 2026</h2>
              <p className="text-xs text-gray-500">
                Bobot modul Management Interview: {document.snapshot.weights["management-interview"]}% · Jadwal Unit{" "}
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

          {/* HR Scheduling Section (matches ManagementInterviewCheckIn / Invitation in main mockup) */}
          {canScheduleCurrent && (
            <form
              onSubmit={(e) => void handleScheduleSubmit(e)}
              className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-[#1A284F]">
                    {document.schedule ? "Perbarui Jadwal Management Interview (HR)" : "Buat Jadwal Management Interview (HR)"}
                  </h3>
                </div>
                <span className="text-xs text-gray-500">
                  Interviewer Otomatis: {document.reviewers.map((r) => `${r.actorName} (${r.actorRole})`).join(", ")}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-gray-700">
                  Tanggal Interview *
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-700">
                  Waktu (WIB) *
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-700">
                  Lokasi / Platform *
                  <input
                    type="text"
                    required
                    placeholder="cth. Ruang Rapat Direksi Lt. 3 / Zoom"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-xs font-semibold text-gray-700">
                  Other User / Pendamping (opsional, pisahkan koma)
                  <input
                    type="text"
                    placeholder="cth. Sekretaris Direksi, Notulis HR"
                    value={otherUsersText}
                    onChange={(e) => setOtherUsersText(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-700">
                  Text Notifikasi
                  <input
                    type="text"
                    value={textNotifikasi}
                    onChange={(e) => setTextNotifikasi(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
                <label className="text-xs font-semibold text-gray-700">
                  Catatan Lampiran
                  <input
                    type="text"
                    value={textLampiran}
                    onChange={(e) => setTextLampiran(e.target.value)}
                    className={inputClass + " mt-1 font-normal"}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={busy} className={buttonClass + " flex items-center gap-2"}>
                  <Send size={14} /> {document.schedule ? "Perbarui & Kirim Jadwal" : "Simpan & Kirim Jadwal Interview"}
                </button>
                {document.schedule && document.status !== "Cancelled" && !document.reviewers.some((r) => r.status === "Completed") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await actOnSimulationManagementInterview(document.employeeId, document.version, {
                          action: "cancel-schedule",
                          note: "Jadwal dibatalkan oleh HR.",
                        });
                        setMessage("Jadwal Management Interview dibatalkan.");
                        await refresh();
                      })
                    }
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Batalkan Jadwal
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Schedule Information Card */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A284F]">
                Detail Jadwal Management Interview
              </h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  document.schedule
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {document.schedule ? "Dijadwalkan" : "Belum Dijadwalkan"}
              </span>
            </div>
            {document.schedule ? (
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-3 border border-gray-100">
                  <p className="text-gray-400">Tanggal & Waktu</p>
                  <p className="mt-1 font-semibold text-gray-800">
                    {document.schedule.scheduledDate} · {document.schedule.scheduledTime} WIB
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-gray-100">
                  <p className="text-gray-400">Lokasi / Platform</p>
                  <p className="mt-1 font-semibold text-gray-800">{document.schedule.location}</p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-gray-100">
                  <p className="text-gray-400">Interviewer (Penilai)</p>
                  <p className="mt-1 font-semibold text-gray-800">
                    {document.reviewers.map((r) => `${r.actorName} (${r.actorRole})`).join(", ")}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-gray-100">
                  <p className="text-gray-400">Catatan & Lampiran</p>
                  <p className="mt-1 font-medium text-gray-700">
                    {document.schedule.textNotifikasi || "—"}
                    {document.schedule.textLampiran ? ` (${document.schedule.textLampiran})` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Jadwal Management Interview belum ditetapkan oleh HR. Setelah dijadwalkan, Penilai (Direktur / GM) dapat mengisi penilaian.
              </p>
            )}
          </div>

          {/* Active Reviewer Assessment Form (matches ManagementInterviewMonitoring / Assessment in main mockup) */}
          {canAssessCurrent && myReviewerSlot && (
            <div className="space-y-4 rounded-2xl border-2 border-[#1A284F]/20 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardEdit className="h-5 w-5 text-[#1A284F]" />
                  <div>
                    <h3 className="text-sm font-bold text-[#1A284F]">
                      Formulir Penilaian Management Interview — Penilai {myReviewerSlot.slot} ({myReviewerSlot.actorName} · {myReviewerSlot.actorRole})
                    </h3>
                    <p className="text-xs text-gray-500">
                      Berikan skor 1–5 pada ketiga aspek penilaian di bawah ini, pilih rekomendasi, dan isi catatan manajemen.
                    </p>
                  </div>
                </div>
                {myLiveAvg !== null && (
                  <span className="rounded-full bg-[#1A284F] px-3 py-1 text-xs font-bold text-white">
                    Avg Anda: {myLiveAvg.toFixed(2)} / 5 ({myLivePct?.toFixed(2)}%)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full min-w-[850px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#1A284F] text-white text-xs">
                      <th className="px-4 py-3 text-center font-semibold w-12 border-r border-white/10" rowSpan={2}>
                        No
                      </th>
                      <th className="px-5 py-3 text-left font-semibold min-w-[260px] border-r border-white/10" rowSpan={2}>
                        Aspek Penilaian
                      </th>
                      <th className="px-4 py-3 text-center font-semibold whitespace-nowrap border-r border-white/10" rowSpan={2}>
                        Indikator Penilaian
                      </th>
                      <th colSpan={5} className="px-4 py-2 text-center font-semibold border-b border-white/20">
                        Penilaian Management (Skala 1–5)
                      </th>
                    </tr>
                    <tr className="bg-[#1A284F] text-white text-xs">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <th key={n} className="px-4 py-2 text-center font-semibold w-16 border-r border-white/10 last:border-r-0">
                          {n}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MI_ASPECTS.map((aspect, aIdx) => {
                      const selected = scores[aspect.id];
                      return (
                        <tr key={aspect.id} className={`border-t border-gray-200 ${aIdx % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}>
                          <td className="px-4 py-4 text-center text-gray-500 font-semibold text-sm border-r border-gray-200">
                            {aspect.no}
                          </td>
                          <td className="px-5 py-4 border-r border-gray-200">
                            <p className="font-semibold text-gray-800 text-sm leading-snug">{aspect.title}</p>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{aspect.description}</p>
                          </td>
                          <td className="px-4 py-4 text-center border-r border-gray-200">
                            <button
                              type="button"
                              onClick={() => setIndicatorModalAspect(aspect)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1A284F]/30 text-[#1A284F] text-[11px] font-semibold hover:bg-[#1A284F]/5 transition-colors whitespace-nowrap"
                            >
                              <Info className="w-3 h-3" /> Lihat Indikator Penilaian
                            </button>
                          </td>
                          {[1, 2, 3, 4, 5].map((val) => (
                            <td key={val} className="px-3 py-4 text-center border-r border-gray-200 last:border-r-0">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setScores((curr) => ({ ...curr, [aspect.id]: val }))}
                                className={`w-9 h-9 rounded border-2 text-sm font-bold transition-all mx-auto flex items-center justify-center ${
                                  selected === val
                                    ? "bg-[#1A284F] border-[#1A284F] text-white shadow-sm"
                                    : "bg-white border-gray-300 text-gray-600 hover:border-[#1A284F] hover:text-[#1A284F]"
                                }`}
                              >
                                {val}
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-[#1A284F]/20 bg-[#1A284F]/5">
                      <td colSpan={3} className="px-5 py-3 text-center text-sm font-bold text-[#1A284F] border-r border-[#1A284F]/10">
                        Nilai Rata-Rata Penilai {myReviewerSlot.slot}
                      </td>
                      <td colSpan={5} className="px-5 py-3 text-center font-bold text-[#1A284F]">
                        {myLiveAvg !== null ? `${myLiveAvg.toFixed(2)} / 5 (${myLivePct?.toFixed(2)}%)` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                    Rekomendasi Management
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MI_RECOMMENDATIONS.map((rec) => (
                      <button
                        key={rec}
                        type="button"
                        onClick={() => setRecommendation(rec)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all text-left ${
                          recommendation === rec
                            ? "border-[#1A284F] bg-[#1A284F] text-white"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {rec}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1.5">
                    Komentar & Catatan Management
                  </label>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tulis komentar atau catatan management untuk kandidat ini..."
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAssessmentAction("save-assessment")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1A284F] px-4 py-2 text-sm font-semibold text-[#1A284F] hover:bg-[#1A284F]/5"
                >
                  <Save size={15} /> Simpan Sementara (Save)
                </button>
                <button
                  type="button"
                  disabled={busy || !allAspectsFilled}
                  onClick={() => setConfirmSubmit(true)}
                  className={buttonClass + " inline-flex items-center gap-1.5"}
                >
                  <CheckCircle2 size={15} /> Submit Penilaian
                </button>
              </div>
            </div>
          )}

          {/* Per-Penilai Summary Cards + Final Score Badge (matches ManagementInterviewTab in main mockup) */}
          <div className="flex flex-wrap gap-3">
            {scoreSummary.reviewerResults.map((p) => (
              <div
                key={p.slot}
                className={`bg-white border rounded-2xl shadow-sm p-4 flex flex-col gap-2 flex-1 min-w-[160px] ${
                  p.status === "Completed" ? "border-gray-200" : "border-dashed border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-white bg-[#1A284F] px-2 py-0.5 rounded-full">
                    Penilai {p.slot}
                  </span>
                  {p.status === "Completed" ? (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      Selesai
                    </span>
                  ) : p.status === "Saved" ? (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                      Tersimpan
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                      Pending
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{p.actorName}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{p.actorRole}</p>
                </div>
                {p.status === "Completed" && p.percent !== null ? (
                  <>
                    <div className="flex items-end gap-1">
                      <span className={`text-2xl font-black leading-none ${miScoreColor(p.percent)}`}>
                        {p.percent.toFixed(1)}
                        <span className="text-sm font-bold">%</span>
                      </span>
                      <span className="text-[10px] text-gray-400 mb-0.5">avg {p.avg?.toFixed(2)}/5</span>
                    </div>
                    {p.recommendation && (
                      <span
                        className={`self-start text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                          REC_STYLE[p.recommendation] ?? "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {p.recommendation}
                      </span>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">Belum disubmit</p>
                )}
              </div>
            ))}

            <div
              className={`flex flex-col items-center justify-center rounded-2xl px-6 py-4 border min-w-[160px] ${
                scoreSummary.partialFinalPercent !== null
                  ? `${miBgColor(scoreSummary.partialFinalPercent)} border-blue-200`
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Final Score</p>
              <p className={`text-3xl font-black leading-none ${miScoreColor(scoreSummary.partialFinalPercent)}`}>
                {scoreSummary.partialFinalPercent !== null ? `${scoreSummary.partialFinalPercent.toFixed(1)}%` : "—"}
              </p>
              <p className="text-[10px] text-gray-500 mt-1">
                {scoreSummary.completedReviewers} / {scoreSummary.totalReviewers} penilai selesai
              </p>
              <p className="text-[10px] font-bold text-[#1A284F] mt-1">
                Kontribusi PA (10%):{" "}
                {scoreSummary.partialFinalPercent !== null
                  ? `${((scoreSummary.partialFinalPercent * 10) / 100).toFixed(2)}%`
                  : "—"}
              </p>
            </div>
          </div>

          {/* Skor Per Kriteria Matrix (matches ManagementInterviewTab in main mockup) */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 bg-[#1A284F]">
              <MessageSquare className="w-4 h-4 text-amber-300" />
              <span className="text-white text-sm font-bold flex-1">Skor Per Kriteria</span>
              <span className="text-white/70 text-[11px]">
                Skala 1–5 · {scoreSummary.completedReviewers} / {scoreSummary.totalReviewers} penilai selesai
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-3 px-4 text-left font-semibold text-gray-600" style={{ minWidth: 220 }}>
                      Kriteria
                    </th>
                    {document.reviewers.map((p) => (
                      <th key={p.slot} className="py-3 px-3 text-center font-semibold text-gray-600 whitespace-nowrap">
                        <div>Penilai {p.slot}</div>
                        <div className="text-[10px] font-normal text-gray-400 mt-0.5">{p.actorName}</div>
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center font-semibold text-[#1A284F] bg-[#1A284F]/5">
                      Rata-rata
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MI_ASPECTS.map((c, idx) => {
                    const rowAvg = scoreSummary.criterionAverages[c.id];
                    return (
                      <tr key={c.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                        <td className="py-3 px-4 font-medium text-gray-800">{c.title}</td>
                        {document.reviewers.map((p) => {
                          const sc = p.status === "Completed" ? p.scores[c.id] : null;
                          const cfg = sc ? SCORE_COLOR[sc] : null;
                          return (
                            <td key={p.slot} className="py-3 px-3 text-center">
                              {sc && cfg ? (
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${cfg.bg} ${cfg.text}`}>
                                  {sc}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-center bg-[#1A284F]/5 font-bold text-[#1A284F]">
                          {rowAvg !== null && rowAvg !== undefined ? rowAvg.toFixed(2) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-[#1A284F]/5">
                    <td className="py-3 px-4 font-bold text-[#1A284F] uppercase">Avg per Penilai</td>
                    {scoreSummary.reviewerResults.map((p) => (
                      <td key={p.slot} className="py-3 px-3 text-center font-black text-[#1A284F]">
                        {p.status === "Completed" && p.avg !== null ? p.avg.toFixed(2) : "—"}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-center bg-[#1A284F]/10 font-black text-[#1A284F]">
                      {scoreSummary.partialFinalPercent !== null ? `${scoreSummary.partialFinalPercent.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="py-3 px-4 font-bold text-[#1A284F] uppercase">Score (% dari 100)</td>
                    {scoreSummary.reviewerResults.map((p) => (
                      <td key={p.slot} className="py-3 px-3 text-center font-black text-[#1A284F]">
                        {p.status === "Completed" && p.percent !== null ? `${p.percent.toFixed(1)}%` : "—"}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-center font-black text-emerald-700">
                      {scoreSummary.partialFinalPercent !== null ? `${scoreSummary.partialFinalPercent.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Komentar & Catatan Manajemen */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 bg-[#1A284F]">
              <MessageSquare className="w-4 h-4 text-amber-300" />
              <span className="text-white text-sm font-bold">Komentar & Catatan Manajemen</span>
            </div>
            <div className="divide-y divide-gray-100">
              {scoreSummary.reviewerResults.map((p) => (
                <div key={p.slot} className="flex gap-4 p-4">
                  <div className="flex flex-col items-center gap-1 shrink-0 w-24">
                    <div className="w-9 h-9 rounded-full bg-[#1A284F] text-white flex items-center justify-center text-xs font-bold">
                      P{p.slot}
                    </div>
                    <p className="text-[10px] text-gray-600 text-center font-semibold leading-tight">{p.actorName}</p>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        p.status === "Completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-50 text-gray-400 border-gray-200"
                      }`}
                    >
                      {p.status === "Completed" ? "Selesai" : "Pending"}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Komentar dari {p.actorName} ({p.actorRole})
                    </p>
                    {p.status === "Completed" ? (
                      <div className="rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-xs text-gray-700 whitespace-pre-wrap">
                        {p.comment || <span className="italic text-gray-400">Tidak ada catatan tambahan.</span>}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-gray-50 border border-dashed border-gray-200 px-3.5 py-2.5 text-xs italic text-gray-400">
                        Penilaian belum diselesaikan.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Indicator Rubric Modal */}
      <Dialog.Root open={indicatorModalAspect !== null} onOpenChange={(open) => !open && setIndicatorModalAspect(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between bg-[#1A284F] px-5 py-4">
              <div>
                <Dialog.Title className="text-sm font-bold text-white">{indicatorModalAspect?.title}</Dialog.Title>
                <Dialog.Description className="text-[11px] text-blue-200 mt-0.5">Indikator Penilaian (Skala 1–5)</Dialog.Description>
              </div>
              <button onClick={() => setIndicatorModalAspect(null)} className="rounded-lg p-1 text-white/70 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2.5 p-5">
              {indicatorModalAspect?.indicators.map((ind) => (
                <div key={ind.score} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A284F] text-xs font-bold text-white">
                    {ind.score}
                  </span>
                  <p className="text-xs leading-relaxed text-gray-700">{ind.text}</p>
                </div>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Submit Confirmation Modal */}
      <Dialog.Root open={confirmSubmit} onOpenChange={(open) => !open && !busy && setConfirmSubmit(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-base font-bold text-[#1A284F]">Konfirmasi Submit Penilaian</Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-relaxed text-gray-500">
              Pastikan semua nilai pada 3 aspek penilaian sudah benar sebelum di-submit. Nilai yang sudah di-submit dapat dilihat kembali namun tidak dapat diubah.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmSubmit(false)}
                className="rounded-lg border px-4 py-2 text-xs font-semibold text-gray-600"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAssessmentAction("submit-assessment")}
                className={buttonClass + " text-xs"}
              >
                Ya, Submit
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
