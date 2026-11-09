import { useState } from "react"
import { Info, Plus, X } from "lucide-react"
import { toast } from "sonner"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tabs from "@radix-ui/react-tabs"
import type { ApprovalRow, ReviewerRole } from "./ReviewDrawer"
import {
  FOLLOW_UP_COLUMNS,
  FEEDBACK_INDICATORS,
  loadFeedbackSubmissions,
  saveFeedbackFollowUp,
  type FeedbackFollowUp,
} from "../pages/shared/interDepartmentFeedbackStore"

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
  readOnly,
}: {
  row: ApprovalRow
  reviewerRole: ReviewerRole
  onClose: () => void
  onAssessed: () => void
  readOnly?: boolean
}) {
  const submission = loadFeedbackSubmissions().find(
    (entry) => entry.row.no === row.no,
  )
  const [rows, setRows] = useState<FeedbackFollowUp[]>(
    () => submission?.followUps[reviewerRole] ?? [emptyFollowUp()],
  )
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
                            {item[column]}
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
                    Contoh Feedback
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
                        ["Timeline Evaluasi", "2 Bulan"],
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
                              {item[column]}
                            </p>
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
                {confirm && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-3 text-sm">
                      Submit tindak lanjut? Setelah disubmit, data tidak dapat
                      diubah dan akan tampil di Received Feedback karyawan.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirm(false)}
                        className="rounded-lg border px-4 py-2 text-sm"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => {
                          try {
                            saveFeedbackFollowUp(row.no, reviewerRole, rows)
                            onAssessed()
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
                        className="rounded-lg bg-[#1A284F] px-4 py-2 text-sm text-white"
                      >
                        Ya, Submit
                      </button>
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
