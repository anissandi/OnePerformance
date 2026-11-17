import { useState } from "react"
import { Info, Plus, X } from "lucide-react"
import { toast } from "sonner"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tabs from "@radix-ui/react-tabs"
import type { ApprovalRow, ReviewerRole } from "./ReviewDrawer"
import {
  FOLLOW_UP_COLUMNS,
  FEEDBACK_INDICATORS,
  decideOwnerFollowUpResult,
  feedbackRowStatusFor,
  loadFeedbackSubmissions,
  requiredFollowUpRoles,
  saveFeedbackFollowUp,
  type FeedbackFollowUp,
} from "../pages/shared/interDepartmentFeedbackStore"

/** Tanggal minimal Timeline Evaluasi: besok (lebih besar dari hari ini). */
function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}
function formatTimeline(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

function readOnlyDecision(readOnly?: boolean): boolean {
  return Boolean(readOnly)
}

function emptyFollowUp(): FeedbackFollowUp {
  return Object.fromEntries(
    FOLLOW_UP_COLUMNS.map((column) => [column, ""]),
  ) as FeedbackFollowUp
}

export function FeedbackApprovalDrawer({
  row,
  reviewerRole,
  onClose,
  onAssessed,
  onUpdated,
  readOnly,
}: {
  row: ApprovalRow
  reviewerRole: ReviewerRole
  onClose: () => void
  onAssessed?: () => void
  onUpdated?: () => void
  readOnly?: boolean
}) {
  const submission = loadFeedbackSubmissions().find(
    (entry) => entry.row.no === row.no,
  )
  // AP1 == AP2 → hanya 1 kali tindak lanjut (sebagai Approver 1)
  const effectiveRole: ReviewerRole =
    submission && !requiredFollowUpRoles(submission).includes(reviewerRole) ? "approver1" : reviewerRole
  reviewerRole = effectiveRole
  const [rows, setRows] = useState<FeedbackFollowUp[]>(
    () => submission?.followUps[effectiveRole] ?? [emptyFollowUp()],
  )
  const [decisionNote, setDecisionNote] = useState("")
  const [decisionConfirm, setDecisionConfirm] = useState<null | "Approved" | "Revision">(null)
  const rowState = submission ? feedbackRowStatusFor(submission, effectiveRole) : null
  const canDecideOwnerResult = !readOnlyDecision(readOnly) && rowState?.stage === "owner-result"
  const [confirm, setConfirm] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const awaitingFirstApprover =
    reviewerRole === "approver2" && !submission?.followUps.approver1?.length
  const locked =
    readOnly ||
    !!submission?.followUps[reviewerRole]?.length ||
    awaitingFirstApprover
  const complete =
    rows.length > 0 &&
    rows.every((item) =>
      FOLLOW_UP_COLUMNS.every((column) => item[column].trim()),
    )
  const otherRole = reviewerRole === "approver1" ? "approver2" : "approver1"

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Content className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 focus:outline-none">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-white px-4 py-5 sm:px-8">
            <div>
              <Dialog.Title className="text-xl font-bold text-[#1A284F]">
                Inter-Department Feedback
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-gray-500">
                {row.employeeId} · {row.name} ·{" "}
                {reviewerRole === "approver1" ? "Approver 1" : "Approver 2"}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Tutup"
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>
          <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-8">
            <p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
              Feedback anonim dan summary karyawan bersifat read-only. Setiap
              approver mengisi tindak lanjutnya sendiri.
            </p>
            {!submission ? (
              <p className="text-red-700">
                Submission feedback tidak ditemukan.
              </p>
            ) : (
              <>
                <section className="overflow-hidden rounded-2xl border bg-white">
                  <div className="border-b px-5 py-4">
                    <h3 className="font-bold text-[#1A284F]">
                      Received Feedback
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {submission.feedbacks.length} feedback anonim · identitas
                      pemberi feedback tidak ditampilkan
                    </p>
                  </div>
                  <Tabs.Root defaultValue={submission.feedbacks[0]?.id}>
                    {submission.feedbacks.length > 1 && (
                      <Tabs.List
                        aria-label="Received Feedback"
                        className="flex flex-wrap gap-2 border-b bg-gray-50 p-4"
                      >
                        {submission.feedbacks.map((feedback, index) => (
                          <Tabs.Trigger
                            key={feedback.id}
                            value={feedback.id}
                            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 data-[state=active]:border-[#1A284F] data-[state=active]:bg-[#1A284F] data-[state=active]:text-white"
                          >
                            Feedback {index + 1} - {feedback.division} -{" "}
                            {feedback.companyUnit}
                          </Tabs.Trigger>
                        ))}
                      </Tabs.List>
                    )}
                    {submission.feedbacks.map((feedback, index) => (
                      <Tabs.Content
                        key={feedback.id}
                        value={feedback.id}
                        className="space-y-4 p-4 focus-visible:outline-none sm:p-6"
                      >
                        <h4 className="font-semibold text-gray-800">
                          Feedback {index + 1} - {feedback.division} -{" "}
                          {feedback.companyUnit}
                        </h4>
                        {FEEDBACK_INDICATORS.map(
                          (indicator, indicatorIndex) => (
                            <article
                              key={indicator.key}
                              className="overflow-hidden rounded-xl border border-gray-200"
                            >
                              <div className="flex flex-wrap items-start gap-3 border-b bg-gray-50 px-4 py-4">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-gray-500">
                                  {indicatorIndex + 1}
                                </span>
                                <h5 className="min-w-[200px] flex-1 text-sm font-semibold leading-relaxed text-gray-800">
                                  {indicator.label}
                                </h5>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                    indicator.sentiment === "positive"
                                      ? "border-green-200 bg-green-50 text-green-800"
                                      : "border-red-200 bg-red-50 text-red-800"
                                  }`}
                                >
                                  {indicator.sentiment === "positive"
                                    ? "Positif"
                                    : "Negatif"}
                                </span>
                              </div>
                              <div className="space-y-3 p-4">
                                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-800">
                                    Feedback Pemberi · Anonim
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                                    {feedback.answers[indicator.key] || "—"}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-800">
                                    Summary / Catatan Penerima · {row.name}
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                                    {submission.summaries[
                                      `${feedback.id}-${indicator.key}`
                                    ] || "—"}
                                  </p>
                                </div>
                              </div>
                            </article>
                          ),
                        )}
                      </Tabs.Content>
                    ))}
                  </Tabs.Root>
                </section>
                <aside
                  aria-label="Panduan tindak lanjut feedback"
                  className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="space-y-3 leading-relaxed">
                    <p>
                      Feedback Positif dapat dilihat dari jawaban Indikator{" "}
                      <strong>1, 3, 4</strong>{" "}
                      <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Positif
                      </span>
                      , dan Feedback Negatif dapat dilihat dari jawaban
                      Indikator <strong>2, 5</strong>{" "}
                      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                        Negatif
                      </span>
                      .
                    </p>
                    <p>
                      <strong>
                        Individual Plan atau Tindak Lanjut Feedback
                      </strong>{" "}
                      dapat dibuat berdasarkan saran di{" "}
                      <strong>Indikator 5</strong> atau jawaban di{" "}
                      <strong>Indikator 2</strong>.
                    </p>
                  </div>
                </aside>
                {!!submission.followUps[otherRole]?.length && (
                  <section className="rounded-xl border p-4">
                    <h3 className="mb-3 font-semibold">
                      Tindak Lanjut{" "}
                      {otherRole === "approver1" ? "Approver 1" : "Approver 2"}{" "}
                      · Read-only
                    </h3>
                    {submission.followUps[otherRole]?.map((item, index) => (
                      <div
                        key={index}
                        className="mb-3 grid gap-3 border-t pt-3 md:grid-cols-2"
                      >
                        {FOLLOW_UP_COLUMNS.map((column) => (
                          <p key={column} className="text-sm">
                            <span className="block font-semibold">
                              {column}
                            </span>
                            {column === "Timeline Evaluasi" ? formatTimeline(item[column]) : item[column]}
                          </p>
                        ))}
                      </div>
                    ))}
                  </section>
                )}
                {awaitingFirstApprover && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Tindak lanjut belum dapat diisi karena Approver 1 belum
                    menyelesaikan tindak lanjutnya.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-bold">
                    Tindak Lanjut Feedback{" "}
                    {reviewerRole === "approver1" ? "Approver 1" : "Approver 2"}
                  </h3>
                  <button
                    type="button"
                    aria-expanded={showExample}
                    aria-controls="feedback-writing-example"
                    onClick={() => setShowExample((previous) => !previous)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <Info className="h-3.5 w-3.5" />
                    Lihat Contoh Feedback
                  </button>
                </div>
                {showExample && (
                  <section
                    id="feedback-writing-example"
                    aria-label="Contoh penulisan tindak lanjut feedback"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-5"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-amber-900">
                          Contoh Penulisan Tindak Lanjut Feedback
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-amber-900">
                          Berdasarkan indikator 2 dan 5: update progres
                          rekrutmen perlu lebih konsisten. Contoh ini hanya
                          panduan dan tidak mengisi atau mengubah form Anda.
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Tutup contoh feedback"
                        onClick={() => setShowExample(false)}
                        className="rounded-lg p-1 text-amber-800 hover:bg-amber-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <dl className="grid gap-3 md:grid-cols-2">
                      {[
                        [
                          "Aspek Perbaikan",
                          "Konsistensi update progres rekrutmen",
                        ],
                        [
                          "Rencana Pengembangan",
                          "Mengikuti coaching komunikasi lintas departemen dan menyusun template laporan progres mingguan.",
                        ],
                        [
                          "Tindak Lanjut",
                          "Mengirim laporan setiap Jumat yang mencakup status kandidat, kendala, PIC, dan target penyelesaian; mengadakan koordinasi dua mingguan dengan departemen pemohon.",
                        ],
                        [
                          "Evaluasi",
                          "Supervisor meninjau ketepatan pengiriman laporan dan meminta umpan balik dari departemen pemohon pada akhir setiap bulan.",
                        ],
                        ["Timeline Evaluasi", "Pilih tanggal evaluasi pada kalender, mis. 30/09/2026"],
                        [
                          "Indikator Keberhasilan",
                          "100% laporan mingguan dikirim tepat waktu selama 8 minggu dan minimal 90% tindak lanjut diselesaikan sesuai target yang disepakati.",
                        ],
                      ].map(([label, example]) => (
                        <div
                          key={label}
                          className="rounded-lg border border-amber-200 bg-white p-4"
                        >
                          <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                            {label}
                          </dt>
                          <dd className="text-sm leading-relaxed text-gray-800">
                            {example}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {rows.map((item, index) => (
                  <section key={index} className="rounded-xl border p-4">
                    <div className="mb-4 flex justify-between">
                      <h4 className="font-semibold">
                        Tindak Lanjut {index + 1}
                      </h4>
                      {!locked && rows.length > 1 && (
                        <button
                          onClick={() =>
                            setRows((previous) =>
                              previous.filter(
                                (_, rowIndex) => rowIndex !== index,
                              ),
                            )
                          }
                          className="text-sm text-red-700"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {FOLLOW_UP_COLUMNS.map((column) => (
                        <label
                          key={column}
                          className="space-y-2 text-sm font-medium"
                        >
                          <span>
                            {column} {!locked && "*"}
                          </span>
                          {locked ? (
                            <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-normal">
                              {column === "Timeline Evaluasi" ? formatTimeline(item[column]) : item[column]}
                            </p>
                          ) : column === "Timeline Evaluasi" ? (
                            <input
                              type="date"
                              required
                              min={tomorrowIso()}
                              value={/^\d{4}-\d{2}-\d{2}$/.test(item[column]) ? item[column] : ""}
                              onChange={(event) => {
                                const v = event.target.value
                                if (v && v < tomorrowIso()) {
                                  toast.error("Timeline Evaluasi harus lebih besar dari hari ini.")
                                  return
                                }
                                setRows((previous) =>
                                  previous.map((entry, rowIndex) =>
                                    rowIndex === index ? { ...entry, [column]: v } : entry,
                                  ),
                                )
                              }}
                              className="block w-full rounded-lg border p-3 font-normal focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          ) : (
                            <textarea
                              required
                              value={item[column]}
                              onChange={(event) =>
                                setRows((previous) =>
                                  previous.map((entry, rowIndex) =>
                                    rowIndex === index
                                      ? {
                                          ...entry,
                                          [column]: event.target.value,
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              className="block min-h-24 w-full rounded-lg border p-3 font-normal focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
                {!locked && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() =>
                        setRows((previous) => [...previous, emptyFollowUp()])
                      }
                      className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Tambah Tindak Lanjut
                    </button>
                    <button
                      disabled={!complete}
                      onClick={() => setConfirm(true)}
                      className="rounded-lg bg-[#1A284F] px-4 py-2 text-sm text-white disabled:opacity-40"
                    >
                      Submit Tindak Lanjut
                    </button>
                  </div>
                )}
                {submission.ownerResults && submission.ownerResults.length > 0 && submission.ownerResultStatus && (
                  <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-4">
                      <div>
                        <h3 className="font-bold text-[#1A284F]">Hasil Tindak Lanjut Karyawan</h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Disubmit {row.name}
                          {submission.ownerResultSubmittedAt
                            ? ` · ${new Date(submission.ownerResultSubmittedAt).toLocaleDateString("id-ID")}`
                            : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-800">
                        {submission.ownerResultStatus === "Approved"
                          ? "Disetujui"
                          : submission.ownerResultStatus === "Revision"
                          ? "Revisi"
                          : "Menunggu Approval"}
                      </span>
                    </div>
                    <div className="space-y-3 p-5">
                      {submission.ownerResults.map((r, i) => (
                        <div key={r.ref} className="rounded-xl border border-gray-100 bg-slate-50/60 p-4">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-violet-700">
                            Hasil Tindak Lanjut #{i + 1}
                          </p>
                          <div className="grid gap-3 md:grid-cols-3">
                            {[
                              ["Aspek Perbaikan", r.aspekPerbaikan],
                              ["Rencana Pengembangan", r.rencanaPengembangan],
                              ["Tindak Lanjut", r.tindakLanjut],
                              ["Evaluasi", r.evaluasi],
                              ["Indikator Keberhasilan", r.indikatorKeberhasilan],
                              ["Status Tindak Lanjut", r.status],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-lg border border-gray-200/80 bg-white p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{value || "—"}</p>
                              </div>
                            ))}
                          </div>
                          {r.evidence.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {r.evidence.map((ev) => (
                                <a
                                  key={ev.id}
                                  href={ev.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={ev.name}
                                  className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50"
                                >
                                  {ev.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {(submission.ownerResultHistory ?? []).map((h, i) => (
                        <p
                          key={i}
                          className={`rounded-lg p-3 text-xs ${
                            h.status === "Approved" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
                          }`}
                        >
                          <strong>
                            {h.status === "Approved" ? "Approved" : "Revisi"} · {h.role === "approver1" ? "Approver 1" : "Approver 2"} ·{" "}
                            {h.approverName} ({h.date})
                          </strong>
                          {h.note ? ` — ${h.note}` : ""}
                        </p>
                      ))}
                      {canDecideOwnerResult && (
                        <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                          <label className="block text-sm font-medium text-gray-700">
                            Komentar Approval / Note Revisi
                            <textarea
                              value={decisionNote}
                              onChange={(e) => setDecisionNote(e.target.value)}
                              placeholder="Komentar (opsional untuk Approve, wajib untuk Revisi)"
                              className="mt-2 block min-h-20 w-full rounded-lg border p-3 font-normal focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </label>
                          <div className="flex flex-wrap justify-end gap-3">
                            <button
                              type="button"
                              disabled={!decisionNote.trim()}
                              title={!decisionNote.trim() ? "Isi note revisi terlebih dahulu" : undefined}
                              onClick={() => setDecisionConfirm("Revision")}
                              className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                            >
                              Revisi
                            </button>
                            <button
                              type="button"
                              onClick={() => setDecisionConfirm("Approved")}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
                {decisionConfirm && (
                  <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setDecisionConfirm(null)}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
                    >
                      <h4 className="text-base font-bold text-[#1A284F]">
                        {decisionConfirm === "Approved" ? "Konfirmasi Approve" : "Konfirmasi Revisi"} Hasil Tindak Lanjut
                      </h4>
                      <p className="text-sm text-gray-700">
                        {decisionConfirm === "Approved"
                          ? `Setujui Hasil Tindak Lanjut ${row.name}?`
                          : `Kembalikan Hasil Tindak Lanjut ke ${row.name} untuk direvisi?`}
                      </p>
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setDecisionConfirm(null)}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              decideOwnerFollowUpResult(row.no, effectiveRole, decisionConfirm, decisionNote)
                              toast.success(
                                decisionConfirm === "Approved"
                                  ? "Hasil Tindak Lanjut disetujui"
                                  : "Hasil Tindak Lanjut dikembalikan untuk revisi",
                              )
                              setDecisionConfirm(null)
                              onAssessed?.()
                              onUpdated?.()
                              onClose()
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Gagal menyimpan keputusan")
                            }
                          }}
                          className="rounded-xl bg-[#1A284F] px-5 py-2 text-sm font-semibold text-white"
                        >
                          Ya, Lanjutkan
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {confirm && (
                  <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setConfirm(false)}
                  >
                    <div
                      role="dialog"
                      aria-modal="true"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl space-y-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-base font-bold text-[#1A284F]">
                          Konfirmasi Submit Tindak Lanjut
                        </h4>
                        <button
                          type="button"
                          onClick={() => setConfirm(false)}
                          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-gray-700">
                        Submit tindak lanjut? pastikan Anda telah membaca semua feedback yang diberikan pada <strong>{row.name}</strong>. Setelah submit tindak lanjut, data tidak dapat diubah dan akan tampil di Received Feedback <strong>{row.name}</strong>.
                      </p>
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setConfirm(false)}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              saveFeedbackFollowUp(row.no, reviewerRole, rows)
                              onAssessed?.()
                              onUpdated?.()
                              toast.success(
                                "Tindak lanjut feedback berhasil disubmit",
                              )
                              onClose()
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Gagal menyimpan feedback",
                              )
                            }
                          }}
                          className="rounded-xl bg-[#1A284F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#131d3b]"
                        >
                          Ya, Submit
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
