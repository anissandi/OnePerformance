import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer"
import { feedbackEligibilityError } from "./feedbackEligibility.ts"

export const FOLLOW_UP_COLUMNS = [
  "Aspek Perbaikan",
  "Rencana Pengembangan",
  "Tindak Lanjut",
  "Evaluasi",
  "Timeline Evaluasi",
  "Indikator Keberhasilan",
] as const
export const FEEDBACK_INDICATORS = [
  {
    key: "q1",
    label:
      "Apa hal terbaik yang anda lihat dari cara individu tersebut bekerja?",
    sentiment: "positive",
  },
  {
    key: "q2",
    label: "Menurut Anda, apa yang perlu ditingkatkan dari individu tersebut?",
    sentiment: "negative",
  },
  {
    key: "q3",
    label:
      "Bagaimana individu tersebut berkontribusi terhadap rekan kerja sama tim atau lintas unit?",
    sentiment: "positive",
  },
  {
    key: "q4",
    label:
      "Tolong deskripsikan satu contoh aktivitas/diskusi ketika individu tersebut membantu anda atau tim dengan baik?",
    sentiment: "positive",
  },
  {
    key: "q5",
    label: "Apa saran Anda agar individu tersebut dapat bekerja lebih efektif?",
    sentiment: "negative",
  },
] as const

export type FeedbackFollowUp = Record<typeof FOLLOW_UP_COLUMNS[number], string>
export interface FeedbackPerson {
  id: string
  name: string
  position: string
  initials: string
  companyUnit: string
  division: string
  department: string
  departmentId?: string
  section?: string
  sectionId?: string
}
export interface ReceivedFeedback {
  id: string
  division: string
  companyUnit: string
  answers: Record<string, string>
}
export interface FeedbackNomination {
  giver: FeedbackPerson
  status: "Pending" | "Submitted"
  submittedAt?: string
}
export interface FeedbackSubmission {
  row: ApprovalRow
  feedbacks: ReceivedFeedback[]
  summaries: Record<string, string>
  followUps: Partial<Record<ReviewerRole, FeedbackFollowUp[]>>
  nominations?: FeedbackNomination[]
  summarySubmittedAt?: string
}
export interface FeedbackTask {
  submission: FeedbackSubmission
  nomination: FeedbackNomination
}

const KEY = "inter_department_feedback_workflows_v2"
const LEGACY_KEY = "inter_department_feedback_submissions_v1"
const now = () => new Date().toISOString()

function emit() {
  window.dispatchEvent(new Event("feedback-updated"))
}

function safeRead(key: string): FeedbackSubmission[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function exampleSubmission(): FeedbackSubmission {
  const feedbacks: ReceivedFeedback[] = [
    {
      id: "sample-rf1",
      division: "Finance & Accounting",
      companyUnit: "PT RSUP (Perkebunan)",
      answers: {
        q1: "Responsif dalam koordinasi kebutuhan tenaga kerja lintas unit.",
        q2: "Update progres rekrutmen belum selalu disampaikan secara berkala.",
        q3: "Membantu menyelaraskan kebutuhan kandidat dengan anggaran departemen.",
        q4: "Mempercepat penjadwalan wawancara untuk posisi keuangan yang mendesak.",
        q5: "Gunakan laporan progres mingguan agar koordinasi lebih terstruktur.",
      },
    },
    {
      id: "sample-rf2",
      division: "Quality Management",
      companyUnit: "PT Pulau Sambu (Guntung)",
      answers: {
        q1: "Komunikasi jelas dan terbuka terhadap masukan dari departemen lain.",
        q2: "Perlu meningkatkan ketepatan waktu tindak lanjut permintaan kandidat.",
        q3: "Berhasil menjelaskan kebutuhan kompetensi pada proses seleksi.",
        q4: "Membantu menyiapkan kandidat quality control sebelum audit operasional.",
        q5: "Sepakati target waktu dan PIC untuk setiap permintaan rekrutmen.",
      },
    },
    {
      id: "sample-rf3",
      division: "Logistic / Materials",
      companyUnit: "PT Pulau Sambu (Jakarta)",
      answers: {
        q1: "Kooperatif dan mampu memahami kebutuhan tim operasional.",
        q2: "Dokumentasi hasil koordinasi masih perlu dibuat lebih konsisten.",
        q3: "Memberikan kontribusi positif dalam penyusunan kebutuhan manpower.",
        q4: "Membantu koordinasi pemenuhan tenaga warehouse pada periode sibuk.",
        q5: "Bagikan notulen dan daftar tindak lanjut setelah pertemuan lintas unit.",
      },
    },
  ]
  const notes = [
    "Mempertahankan komunikasi responsif dan kolaborasi lintas departemen.",
    "Meningkatkan konsistensi update progres dan ketepatan waktu tindak lanjut.",
    "Melanjutkan kontribusi dalam penyelarasan kebutuhan kompetensi dan manpower.",
    "Menjadikan pengalaman pemenuhan kebutuhan mendesak sebagai praktik baik.",
    "Menyusun laporan mingguan, target waktu, PIC, dan dokumentasi koordinasi.",
  ]
  return {
    row: {
      no: "IDF-EXAMPLE-EMP011-2026",
      employeeId: "EMP011",
      name: "Kartini Dewi",
      position: "Staff Rekrutmen",
      department: "SDM",
      division: "Divisi Sumber Daya Manusia",
      companyUnit: "PT RSUP (Industry)",
      type: "Inter-Department Feedback",
      submittedDate: "05/10/2026",
      approvalDate: "-",
      status: "Pending",
    },
    feedbacks,
    summaries: Object.fromEntries(
      feedbacks.flatMap((feedback) =>
        notes.map((note, index) => [`${feedback.id}-q${index + 1}`, note]),
      ),
    ),
    followUps: {},
    summarySubmittedAt: "2026-10-05T00:00:00.000Z",
  }
}

function normalize(record: FeedbackSubmission): FeedbackSubmission {
  return {
    ...record,
    feedbacks: record.feedbacks ?? [],
    summaries: record.summaries ?? {},
    followUps: record.followUps ?? {},
    nominations: record.nominations ?? [],
    summarySubmittedAt:
      record.summarySubmittedAt ??
      (record.feedbacks?.length ? record.row.submittedDate : undefined),
  }
}

export function loadFeedbackSubmissions(): FeedbackSubmission[] {
  const current = safeRead(KEY).map(normalize)
  if (current.length) return current
  const legacy = safeRead(LEGACY_KEY).map(normalize)
  const records = legacy.length ? legacy : [exampleSubmission()]
  localStorage.setItem(KEY, JSON.stringify(records))
  return records
}

export function saveFeedbackSubmission(submission: FeedbackSubmission) {
  const records = loadFeedbackSubmissions().filter(
    (entry) => entry.row.no !== submission.row.no,
  )
  localStorage.setItem(KEY, JSON.stringify([...records, normalize(submission)]))
  emit()
}

export function getFeedbackSubmission(employeeId: string) {
  return loadFeedbackSubmissions().find(
    (entry) => entry.row.employeeId === employeeId,
  )
}

export function nominateFeedbackGivers(
  recipient: FeedbackPerson,
  givers: FeedbackPerson[],
) {
  if (
    givers.length !== 3 ||
    new Set(givers.map((giver) => giver.id)).size !== 3
  )
    throw new Error(
      "Pilih tepat tiga karyawan berbeda sebagai pemberi feedback.",
    )
  for (const giver of givers) {
    const error = feedbackEligibilityError(recipient, giver)
    if (error) throw new Error(error)
  }
  if (getFeedbackSubmission(recipient.id))
    throw new Error(
      "Nominasi feedback periode ini sudah dikirim dan tidak dapat diubah.",
    )
  const submission: FeedbackSubmission = {
    row: {
      no: `IDF-${recipient.id}-2026`,
      employeeId: recipient.id,
      name: recipient.name,
      position: recipient.position,
      department: recipient.department,
      division: recipient.division,
      companyUnit: recipient.companyUnit,
      type: "Inter-Department Feedback",
      submittedDate: "-",
      approvalDate: "-",
      status: "Awaiting feedback",
    },
    feedbacks: [],
    summaries: {},
    followUps: {},
    nominations: givers.map((giver) => ({ giver, status: "Pending" })),
  }
  saveFeedbackSubmission(submission)
  return submission
}

export function feedbackTasksFor(giverId: string): FeedbackTask[] {
  return loadFeedbackSubmissions().flatMap((submission) =>
    (submission.nominations ?? [])
      .filter((nomination) => nomination.giver.id === giverId)
      .map((nomination) => ({ submission, nomination })),
  )
}

export function submitNominatedFeedback(
  giverId: string,
  recipientId: string,
  answers: Record<string, string>,
) {
  if (FEEDBACK_INDICATORS.some((indicator) => !answers[indicator.key]?.trim()))
    throw new Error("Semua indikator feedback wajib diisi.")
  const submission = getFeedbackSubmission(recipientId)
  if (!submission) throw new Error("Permintaan feedback tidak ditemukan.")
  const nomination = submission.nominations?.find(
    (entry) => entry.giver.id === giverId,
  )
  if (!nomination || nomination.status === "Submitted")
    throw new Error("Tugas feedback sudah tidak tersedia.")
  const feedback: ReceivedFeedback = {
    id: `rf-${recipientId}-${giverId}`,
    division: nomination.giver.division,
    companyUnit: nomination.giver.companyUnit,
    answers,
  }
  saveFeedbackSubmission({
    ...submission,
    feedbacks: [
      ...submission.feedbacks.filter((entry) => entry.id !== feedback.id),
      feedback,
    ],
    nominations: submission.nominations?.map((entry) =>
      entry.giver.id === giverId
        ? { ...entry, status: "Submitted", submittedAt: now() }
        : entry,
    ),
  })
}

export function submitFeedbackSummary(
  employeeId: string,
  summaries: Record<string, string>,
) {
  const submission = getFeedbackSubmission(employeeId)
  if (!submission) throw new Error("Feedback yang diterima belum tersedia.")
  if (submission.feedbacks.length !== 3)
    throw new Error(
      "Summary hanya dapat disubmit setelah tiga feedback diterima.",
    )
  if (
    FEEDBACK_INDICATORS.some((indicator) =>
      submission.feedbacks.some(
        (feedback) => !summaries[`${feedback.id}-${indicator.key}`]?.trim(),
      ),
    )
  )
    throw new Error("Semua summary feedback wajib diisi.")
  if (submission.summarySubmittedAt)
    throw new Error("Summary feedback sudah disubmit.")
  saveFeedbackSubmission({
    ...submission,
    summaries,
    summarySubmittedAt: now(),
    row: {
      ...submission.row,
      submittedDate: new Date().toLocaleDateString("id-ID"),
      status: "Pending",
    },
  })
}

export function feedbackApprovalRows(role: ReviewerRole): ApprovalRow[] {
  return loadFeedbackSubmissions()
    .filter((entry) => !!entry.summarySubmittedAt)
    .map(({ row, followUps }) => ({
      ...row,
      status: followUps[role]?.length
        ? `Assessed-Approver ${role === "approver1" ? "1" : "2"}`
        : "Pending",
    }))
}

export function saveFeedbackFollowUp(
  no: string,
  role: ReviewerRole,
  rows: FeedbackFollowUp[],
) {
  const submission = loadFeedbackSubmissions().find(
    (entry) => entry.row.no === no,
  )
  if (!submission) throw new Error("Submission feedback tidak ditemukan.")
  if (role === "approver2" && !submission.followUps.approver1?.length)
    throw new Error(
      "Approver 1 harus menyelesaikan tindak lanjut terlebih dahulu.",
    )
  if (
    !rows.length ||
    rows.some((row) => FOLLOW_UP_COLUMNS.some((column) => !row[column]?.trim()))
  )
    throw new Error("Semua field tindak lanjut wajib diisi.")
  if (submission.followUps[role]?.length)
    throw new Error("Tindak lanjut sudah disubmit.")
  saveFeedbackSubmission({
    ...submission,
    row: {
      ...submission.row,
      approvalDate: new Date().toLocaleDateString("id-ID"),
    },
    followUps: { ...submission.followUps, [role]: rows },
  })
}
