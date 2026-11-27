import React, { useMemo, useState } from "react"
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tabs from "@radix-ui/react-tabs"
import { Calendar } from "./ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import type { ApprovalRow, ReviewerRole } from "./ReviewDrawer"
import {
  FOLLOW_UP_COLUMNS,
  FEEDBACK_INDICATORS,
  MIN_FEEDBACK_SENTENCES,
  countValidSentences,
  decideOwnerFollowUpResult,
  feedbackRowStatusFor,
  hasMinFeedbackSentences,
  loadFeedbackSubmissions,
  requiredFollowUpRoles,
  saveFeedbackFollowUp,
  type FeedbackFollowUp,
  type FeedbackSubmission,
} from "../pages/shared/interDepartmentFeedbackStore"

const MONTH_NAMES_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

/** Tanggal minimal Timeline Evaluasi: besok (lebih besar dari hari ini). */
function getTomorrowDate(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}

function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

function tomorrowIso(): string {
  return toIsoDate(getTomorrowDate())
}

function parseIsoToDate(value: string): Date | undefined {
  const m = String(value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const yr = Number(m[1])
  const mo = Number(m[2]) - 1
  const dy = Number(m[3])
  const dt = new Date(yr, mo, dy)
  dt.setHours(0, 0, 0, 0)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

function formatTimeline(value: string): string {
  const m = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value
}

function formatTimelineLongId(value: string): string {
  const dt = parseIsoToDate(value)
  if (!dt) return value
  return `${dt.getDate()} ${MONTH_NAMES_ID[dt.getMonth()]} ${dt.getFullYear()} (${formatTimeline(value)})`
}

function readOnlyDecision(readOnly?: boolean): boolean {
  return Boolean(readOnly)
}

function emptyFollowUp(): FeedbackFollowUp {
  return Object.fromEntries(
    FOLLOW_UP_COLUMNS.map((column) => [column, ""]),
  ) as FeedbackFollowUp
}

const GIVER_SOURCE_TAG_PALETTE = [
  "border-sky-200 bg-sky-100/80 text-sky-800",
  "border-teal-200 bg-teal-100/80 text-teal-800",
  "border-amber-200 bg-amber-100/80 text-amber-800",
  "border-blue-200 bg-blue-100/80 text-blue-800",
  "border-cyan-200 bg-cyan-100/80 text-cyan-800",
]

function TimelineCalendarPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (nextIso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const minDate = useMemo(() => getTomorrowDate(), [])
  const selectedDate = useMemo(() => parseIsoToDate(value), [value])
  const [viewMonth, setViewMonth] = useState<Date>(() => selectedDate ?? minDate)

  const currentYear = minDate.getFullYear()
  const yearOptions = [currentYear, currentYear + 1, currentYear + 2]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 ${
            selectedDate
              ? "border-sky-300 bg-sky-50/40 font-semibold text-[#1A284F]"
              : "border-gray-200 bg-white font-normal text-gray-400 hover:border-[#1A284F]/40"
          }`}
        >
          <span className="flex items-center gap-2.5 truncate">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A284F]/10 text-[#1A284F]">
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="truncate">
              {selectedDate ? formatTimelineLongId(value) : "Pilih tanggal evaluasi pada kalender…"}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 px-1">
          <select
            value={viewMonth.getMonth()}
            onChange={(e) => {
              const next = new Date(viewMonth.getFullYear(), Number(e.target.value), 1)
              setViewMonth(next)
            }}
            aria-label="Pilih Bulan"
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#1A284F] outline-none focus:border-[#1A284F] cursor-pointer"
          >
            {MONTH_NAMES_ID.map((mName, idx) => (
              <option key={mName} value={idx}>
                {mName}
              </option>
            ))}
          </select>
          <select
            value={viewMonth.getFullYear()}
            onChange={(e) => {
              const next = new Date(Number(e.target.value), viewMonth.getMonth(), 1)
              setViewMonth(next)
            }}
            aria-label="Pilih Tahun"
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#1A284F] outline-none focus:border-[#1A284F] cursor-pointer"
          >
            {yearOptions.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
        <Calendar
          mode="single"
          month={viewMonth}
          onMonthChange={setViewMonth}
          selected={selectedDate}
          disabled={(date) => {
            const cmp = new Date(date)
            cmp.setHours(0, 0, 0, 0)
            return cmp < minDate
          }}
          onSelect={(date) => {
            if (!date) return
            const iso = toIsoDate(date)
            if (iso < tomorrowIso()) {
              toast.error("Timeline Evaluasi harus lebih besar dari hari ini.")
              return
            }
            onChange(iso)
            setOpen(false)
          }}
          classNames={{
            day_selected:
              "bg-[#1A284F] text-white hover:bg-[#1A284F] hover:text-white focus:bg-[#1A284F] focus:text-white font-bold",
            day_today: "bg-amber-100 text-amber-900 font-bold",
          }}
        />
        <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2 px-1 text-[11px] text-slate-500">
          <span>Min: {formatTimeline(tomorrowIso())}</span>
          {selectedDate && (
            <button
              type="button"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
              className="font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              Reset Tanggal
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type SentimentFilter = "all" | "positive" | "negative"

interface CombinedFeedbackSummaryRow {
  id: string
  sentiment: "positive" | "negative"
  indicatorNo: number
  indicatorKey: string
  indicatorLabel: string
  giverIndex: number
  giverLabel: string
  division: string
  companyUnit: string
  feedbackText: string
  recipientSummary: string
}

function CombinedFeedbackSummarySection({
  submission,
  recipientName,
}: {
  submission: FeedbackSubmission
  recipientName: string
}) {
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all")

  const { positiveRows, negativeRows } = useMemo(() => {
    const pos: CombinedFeedbackSummaryRow[] = []
    const neg: CombinedFeedbackSummaryRow[] = []

    FEEDBACK_INDICATORS.forEach((indicator, indIdx) => {
      submission.feedbacks.forEach((fb, fbIdx) => {
        const entry: CombinedFeedbackSummaryRow = {
          id: `${fb.id}-${indicator.key}`,
          sentiment: indicator.sentiment,
          indicatorNo: indIdx + 1,
          indicatorKey: indicator.key,
          indicatorLabel: indicator.label,
          giverIndex: fbIdx,
          giverLabel: `Feedback ${fbIdx + 1}`,
          division: fb.division,
          companyUnit: fb.companyUnit,
          feedbackText: fb.answers[indicator.key]?.trim() || "—",
          recipientSummary: submission.summaries[`${fb.id}-${indicator.key}`]?.trim() || "—",
        }
        if (indicator.sentiment === "positive") {
          pos.push(entry)
        } else {
          neg.push(entry)
        }
      })
    })

    return { positiveRows: pos, negativeRows: neg }
  }, [submission])

  const totalCount = positiveRows.length + negativeRows.length
  const showPositive = sentimentFilter === "all" || sentimentFilter === "positive"
  const showNegative = sentimentFilter === "all" || sentimentFilter === "negative"

  const renderGroupRows = (
    groupRows: CombinedFeedbackSummaryRow[],
    tone: "positive" | "negative",
  ) => {
    // Kelompokkan per indikator agar rowSpan pertanyaan indikator terlihat bersih & mudah dibaca lintas pemberi feedback
    const byIndicator = new Map<number, CombinedFeedbackSummaryRow[]>()
    for (const r of groupRows) {
      const list = byIndicator.get(r.indicatorNo) ?? []
      list.push(r)
      byIndicator.set(r.indicatorNo, list)
    }

    let runningNo = 0
    return Array.from(byIndicator.entries()).flatMap(([, items], groupIdx) =>
      items.map((item, subIdx) => {
        runningNo += 1
        const isPositive = tone === "positive"
        const softRowBg = isPositive
          ? runningNo % 2 === 1
            ? "bg-emerald-50/40 hover:bg-emerald-100/45"
            : "bg-teal-50/35 hover:bg-teal-100/45"
          : runningNo % 2 === 1
          ? "bg-rose-50/40 hover:bg-rose-100/45"
          : "bg-amber-50/40 hover:bg-amber-100/45"
        const giverTagCls = GIVER_SOURCE_TAG_PALETTE[item.giverIndex % GIVER_SOURCE_TAG_PALETTE.length]

        return (
          <tr
            key={item.id}
            className={`border-b border-slate-200/70 transition-colors ${softRowBg} ${
              subIdx === 0 && groupIdx > 0 ? "border-t-2 border-t-slate-200" : ""
            }`}
          >
            <td className="px-3 py-3 text-center text-xs font-bold text-slate-500 tabular-nums align-top">
              {runningNo}
            </td>
            {subIdx === 0 && (
              <td
                rowSpan={items.length}
                className={`px-3.5 py-3 align-top border-r border-slate-200/70 ${
                  isPositive ? "bg-emerald-50/60" : "bg-rose-50/60"
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                        isPositive
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : "border-rose-300 bg-rose-100 text-rose-800"
                      }`}
                    >
                      {isPositive ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3 w-3 shrink-0" />
                      )}
                      {isPositive ? "Feedback Positif" : "Feedback Negatif"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-[#1A284F]">
                      Indikator #{item.indicatorNo}
                    </span>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-slate-800">
                    {item.indicatorLabel}
                  </p>
                </div>
              </td>
            )}
            <td className="px-3.5 py-3 align-top">
              <div className="flex flex-col items-start gap-1">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold whitespace-nowrap ${giverTagCls}`}>
                  {item.giverLabel} · Anonim
                </span>
                <span className="text-[11px] font-medium text-slate-600">
                  {item.division}
                </span>
                <span className="text-[10px] text-slate-400">
                  {item.companyUnit}
                </span>
              </div>
            </td>
            <td className="px-4 py-3 align-top">
              <div className="rounded-xl border border-white/80 bg-white/85 px-3.5 py-2.5 shadow-2xs">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                  {item.feedbackText}
                </p>
              </div>
            </td>
            <td className="px-4 py-3 align-top">
              <div className="rounded-xl border border-sky-200/70 bg-sky-50/55 px-3.5 py-2.5">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                  {item.recipientSummary}
                </p>
              </div>
            </td>
          </tr>
        )
      }),
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-sky-50/50 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-[#1A284F] text-base">
              Summary Gabungan Received Feedback &amp; Catatan Penerima
            </h3>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-800">
              {submission.feedbacks.length} Pemberi Feedback
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Rekapitulasi terpadu seluruh feedback anonim dan refleksi <strong>{recipientName}</strong> yang dipisahkan berdasarkan kategori Positif &amp; Negatif sebagai dasar pengisian 1 Tindak Lanjut Feedback.
          </p>
        </div>

        {/* Tag Filter Positif / Negatif */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            {
              id: "all" as SentimentFilter,
              label: `Semua (${totalCount})`,
              activeCls: "border-[#1A284F] bg-[#1A284F] text-white shadow-xs",
              inactiveCls: "border-slate-200 bg-slate-100/80 text-slate-700 hover:bg-slate-200/70",
            },
            {
              id: "positive" as SentimentFilter,
              label: `Feedback Positif (${positiveRows.length})`,
              activeCls: "border-emerald-600 bg-emerald-600 text-white shadow-xs",
              inactiveCls: "border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100/80",
            },
            {
              id: "negative" as SentimentFilter,
              label: `Feedback Negatif (${negativeRows.length})`,
              activeCls: "border-rose-600 bg-rose-600 text-white shadow-xs",
              inactiveCls: "border-rose-200 bg-rose-50/90 text-rose-800 hover:bg-rose-100/80",
            },
          ]).map((tag) => {
            const isActive = sentimentFilter === tag.id
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => setSentimentFilter(tag.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none ${
                  isActive ? tag.activeCls : tag.inactiveCls
                }`}
              >
                {isActive && <Check className="h-3 w-3 shrink-0 stroke-[2.5]" />}
                <span>{tag.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#1A284F] text-white">
              <th className="w-12 px-3 py-3 text-center font-semibold">No</th>
              <th className="w-[250px] px-3.5 py-3 font-semibold">Kategori &amp; Indikator</th>
              <th className="w-[180px] px-3.5 py-3 font-semibold">Sumber Feedback</th>
              <th className="px-4 py-3 font-semibold">Received Feedback (Pemberi · Anonim)</th>
              <th className="px-4 py-3 font-semibold">Summary / Catatan Penerima ({recipientName})</th>
            </tr>
          </thead>
          <tbody>
            {showPositive && positiveRows.length > 0 && (
              <>
                <tr className="border-y border-emerald-200 bg-gradient-to-r from-emerald-100/85 via-emerald-50/90 to-teal-50/70">
                  <td colSpan={5} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Feedback Positif
                        </span>
                        <span className="text-xs font-bold text-emerald-900">
                          Kekuatan, Apresiasi &amp; Kontribusi Positif (Indikator 1, 3, 4)
                        </span>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        {positiveRows.length} catatan gabungan
                      </span>
                    </div>
                  </td>
                </tr>
                {renderGroupRows(positiveRows, "positive")}
              </>
            )}

            {showNegative && negativeRows.length > 0 && (
              <>
                <tr className="border-y border-rose-200 bg-gradient-to-r from-rose-100/85 via-rose-50/90 to-amber-50/70">
                  <td colSpan={5} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-600 px-3 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Feedback Negatif
                        </span>
                        <span className="text-xs font-bold text-rose-900">
                          Area Peningkatan &amp; Saran Pengembangan (Indikator 2, 5)
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900">
                          <Sparkles className="h-3 w-3" />
                          Acuan Utama Tindak Lanjut
                        </span>
                      </div>
                      <span className="rounded-full border border-rose-200 bg-white/80 px-2.5 py-0.5 text-[10px] font-bold text-rose-800">
                        {negativeRows.length} catatan gabungan
                      </span>
                    </div>
                  </td>
                </tr>
                {renderGroupRows(negativeRows, "negative")}
              </>
            )}

            {totalCount === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                  Belum ada data Received Feedback.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
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
  const existingFollowUps = submission?.followUps[effectiveRole]
  const [followUpItem, setFollowUpItem] = useState<FeedbackFollowUp>(
    () => existingFollowUps?.[0] ?? emptyFollowUp(),
  )
  const [rawDetailOpen, setRawDetailOpen] = useState(false)
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
  const complete = FOLLOW_UP_COLUMNS.every((column) =>
    column === "Timeline Evaluasi"
      ? Boolean(followUpItem[column]?.trim())
      : hasMinFeedbackSentences(followUpItem[column]),
  )
  const otherRole = reviewerRole === "approver1" ? "approver2" : "approver1"
  const lockedRowsToDisplay = locked && existingFollowUps?.length ? existingFollowUps : [followUpItem]

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
            <p className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm text-sky-900">
              Seluruh feedback anonim dan Summary / Catatan Penerima telah dirangkum dalam <strong>Tabel Summary Gabungan</strong> di bawah ini (terpisah antara kategori <strong>Positif</strong> dan <strong>Negatif</strong>). Berdasarkan tabel summary tersebut, berikan <strong>1 Tindak Lanjut Feedback</strong> terpadu untuk keseluruhan feedback.
            </p>
            {!submission ? (
              <p className="text-red-700">
                Submission feedback tidak ditemukan.
              </p>
            ) : (
              <>
                {/* 1. Tabel Summary Gabungan Seluruh Feedback & Summary Penerima (Positif & Negatif) */}
                <CombinedFeedbackSummarySection
                  submission={submission}
                  recipientName={row.name}
                />

                {/* 2. Rincian Per Pemberi Feedback (Collapsible bila ingin melihat per individu pemberi) */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setRawDetailOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <div>
                      <h3 className="font-bold text-[#1A284F] text-sm">
                        Detail Received Feedback Per Pemberi ({submission.feedbacks.length} Feedback Anonim)
                      </h3>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Klik untuk {rawDetailOpen ? "menyembunyikan" : "melihat"} rincian per pemberi feedback secara individual
                      </p>
                    </div>
                    {rawDetailOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                  </button>
                  {rawDetailOpen && (
                  <Tabs.Root defaultValue={submission.feedbacks[0]?.id}>
                    {submission.feedbacks.length > 1 && (
                      <Tabs.List
                        aria-label="Received Feedback"
                        className="flex flex-wrap gap-2 border-y bg-gray-50 p-4"
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
                  )}
                </section>

                <aside
                  aria-label="Panduan tindak lanjut feedback"
                  className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div className="space-y-1.5 leading-relaxed">
                    <p>
                      Feedback Positif dapat dilihat dari jawaban Indikator{" "}
                      <strong>1, 3, 4</strong>{" "}
                      <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        Feedback Positif
                      </span>
                      , dan Feedback Negatif dapat dilihat dari jawaban
                      Indikator <strong>2, 5</strong>{" "}
                      <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">
                        Feedback Negatif
                      </span>
                      .
                    </p>
                    <p>
                      <strong>
                        1 Tindak Lanjut Feedback Terpadu
                      </strong>{" "}
                      disusun untuk keseluruhan feedback berdasarkan rangkuman pada{" "}
                      <strong>Tabel Summary Gabungan</strong> di atas (utamanya masukan pada <strong>Indikator 2</strong> dan <strong>Indikator 5</strong>).
                    </p>
                  </div>
                </aside>
                {!!submission.followUps[otherRole]?.length && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                    <h3 className="mb-3 font-bold text-[#1A284F]">
                      Tindak Lanjut{" "}
                      {otherRole === "approver1" ? "Approver 1" : "Approver 2"}{" "}
                      · Read-only
                    </h3>
                    {submission.followUps[otherRole]?.map((item, index) => (
                      <div
                        key={index}
                        className="mb-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-2"
                      >
                        {FOLLOW_UP_COLUMNS.map((column) => (
                          <div key={column} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm">
                            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                              {column}
                            </span>
                            <span className="text-slate-800 whitespace-pre-wrap">
                              {column === "Timeline Evaluasi" ? formatTimelineLongId(item[column]) : item[column]}
                            </span>
                          </div>
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
                  <div>
                    <h3 className="font-bold text-[#1A284F] text-base">
                      Tindak Lanjut Feedback{" "}
                      {reviewerRole === "approver1" ? "Approver 1" : "Approver 2"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      1 Tindak Lanjut terpadu untuk seluruh feedback berdasarkan Tabel Summary Gabungan di atas
                    </p>
                  </div>
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
                {lockedRowsToDisplay.map((item, index) => (
                  <section key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-[#1A284F] text-sm">
                          {lockedRowsToDisplay.length > 1
                            ? `Tindak Lanjut ${index + 1}`
                            : "Form Tindak Lanjut Feedback (Berdasarkan Summary Seluruh Feedback)"}
                        </h4>
                        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold text-teal-800">
                          1 Tindak Lanjut Terpadu
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {FOLLOW_UP_COLUMNS.map((column) => (
                        <div
                          key={column}
                          className="space-y-2 text-sm font-medium text-slate-700"
                        >
                          <span className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                            {column} {!locked && <span className="text-rose-500">*</span>}
                          </span>
                          {locked ? (
                            <p className="whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 font-normal text-slate-800">
                              {column === "Timeline Evaluasi" ? formatTimelineLongId(item[column]) : item[column]}
                            </p>
                          ) : column === "Timeline Evaluasi" ? (
                            <TimelineCalendarPicker
                              value={/^\d{4}-\d{2}-\d{2}$/.test(item[column]) ? item[column] : ""}
                              onChange={(nextIso) =>
                                setFollowUpItem((prev) => ({ ...prev, [column]: nextIso }))
                              }
                            />
                          ) : (
                            <>
                              <textarea
                                required
                                value={item[column]}
                                placeholder={`Isi ${column.toLowerCase()} berdasarkan tabel summary feedback (minimal ${MIN_FEEDBACK_SENTENCES} kalimat)…`}
                                onChange={(event) =>
                                  setFollowUpItem((prev) => ({
                                    ...prev,
                                    [column]: event.target.value,
                                  }))
                                }
                                className="block min-h-28 w-full rounded-xl border border-gray-200 bg-white p-3 font-normal text-slate-800 placeholder-slate-400 focus:border-[#1A284F] focus:outline-none focus:ring-2 focus:ring-[#1A284F]/15"
                              />
                              {(() => {
                                const sc = countValidSentences(item[column])
                                const ok = sc >= MIN_FEEDBACK_SENTENCES
                                const hasVal = Boolean(item[column]?.trim())
                                return (
                                  <p
                                    className={`text-[11px] font-medium ${
                                      ok ? "text-emerald-700" : hasVal ? "text-amber-700" : "text-slate-400"
                                    }`}
                                  >
                                    {ok
                                      ? `Minimal ${MIN_FEEDBACK_SENTENCES} kalimat terpenuhi (${sc} kalimat)`
                                      : `Minimal input ${MIN_FEEDBACK_SENTENCES} kalimat (${sc}/${MIN_FEEDBACK_SENTENCES} kalimat)`}
                                  </p>
                                )
                              })()}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                {!locked && (
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      disabled={!complete}
                      onClick={() => setConfirm(true)}
                      title={
                        !complete
                          ? `Lengkapi seluruh field teks minimal ${MIN_FEEDBACK_SENTENCES} kalimat dan pilih Timeline Evaluasi.`
                          : "Submit Tindak Lanjut"
                      }
                      className="rounded-xl bg-[#1A284F] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                            ? ` · ${normalizeDateDDMMYYYY(submission.ownerResultSubmittedAt)}`
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
                              saveFeedbackFollowUp(row.no, reviewerRole, [followUpItem])
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
import { normalizeDateDDMMYYYY } from "../utils/dateFormat";
