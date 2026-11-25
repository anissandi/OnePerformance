import type { ApprovalRow, ReviewerRole } from "../../components/ReviewDrawer"
import { feedbackEligibilityError } from "./feedbackEligibility.ts"
import {
  loadPersistedState,
  safeSetLocalJson,
  savePersistedState,
  selectRowsFromSupabase,
  syncToSupabase,
} from "../../services/supabaseClient"
import {
  normalizeEmployeeId,
  registerWorkflowRows,
  saveWorkflowDecision,
  submitWorkflowModule,
} from "./appraisalWorkflowStore"
import { formatTodayDDMMYYYY, normalizeDateDDMMYYYY } from "../../utils/dateFormat"
import {
  pushEmployeeNotification,
  triggerInterDeptNominationNotifications,
} from "../../store/notificationStore"
import { getActiveUser, loadManagedUsers, type ManagedUser } from "../../store/authStore"

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

/** Minimal jumlah pemberi feedback yang wajib dinominasikan (boleh lebih). */
export const MIN_FEEDBACK_GIVERS = 3
export const MIN_FEEDBACK_WORDS = 4
export const MIN_FEEDBACK_SENTENCES = MIN_FEEDBACK_WORDS
export const MAX_FEEDBACK_REPLACEMENTS = 3

export const BLOCKED_PROFANITY_TERMS = [
  "fuck you",
  "payu dara",
  "payudara",
  "diperkosa",
  "perkosa",
  "ngentot",
  "bencong",
  "perawan",
  "perjaka",
  "anjing",
  "monyet",
  "jancok",
  "jancuk",
  "kontol",
  "kondom",
  "pantat",
  "memek",
  "setan",
  "ngewe",
  "binal",
  "banci",
  "lesbi",
  "lesby",
  "combi",
  "babi",
  "itil",
  "laso",
  "ewek",
  "lgbt",
  "tete",
  "tai",
  "ewe",
  "oyo",
  "ml",
] as const

export interface FeedbackTextValidationResult {
  valid: boolean
  wordCount: number
  error?: string
}

/**
 * Validasi teks Inter-Department Feedback (Pemberi Feedback & Summary Penerima Feedback):
 * 1) Minimal 4 kata (contoh: "saya sedang menjalankan tugas")
 * 2) Tidak boleh spasi berulang (spasi ganda) atau simbol berulang (mis. "!!", "..", "--", "@@")
 * 3) Tidak boleh kata berulang berurutan ("dan dan"), namun reduplikasi bertanda hubung tunggal sah ("masing-masing") diperbolehkan
 * 4) Blokir daftar kata kasar/tidak pantas
 */
export function validateFeedbackText(
  rawText?: string | null,
  minWords = MIN_FEEDBACK_WORDS,
): FeedbackTextValidationResult {
  const raw = String(rawText ?? "")
  const trimmed = raw.trim()
  if (!trimmed) {
    return { valid: false, wordCount: 0, error: `Minimal input ${minWords} kata (0/${minWords} kata).` }
  }

  // Cek spasi berulang pada baris yang sama
  if (/[ \t]{2,}/.test(raw)) {
    const wc = trimmed.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
    return {
      valid: false,
      wordCount: wc,
      error: "Tidak boleh menggunakan spasi berulang (spasi ganda) di antara atau di dalam kata.",
    }
  }

  // Cek simbol berulang berturut-turut (mis. "!!", "??", "..", "--", "##", dll.)
  if (/[^A-Za-z0-9\s]{2,}/.test(trimmed)) {
    const wc = trimmed.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
    return {
      valid: false,
      wordCount: wc,
      error: "Tidak boleh menggunakan simbol berulang (contoh: !!, .., --, @@).",
    }
  }

  // Cek simbol asing berulang di dalam satu kata (kecuali tanda hubung tunggal kata ulang mis. masing-masing, atau garis miring tunggal a/n)
  const rawTokens = trimmed.split(/\s+/)
  for (const tok of rawTokens) {
    const strippedEdge = tok.replace(/^[.,;:!?"'()[\]]+|[.,;:!?"'()[\]]+$/g, "")
    if (!strippedEdge) continue
    const symbolMatches = strippedEdge.match(/[^A-Za-z0-9]/g) ?? []
    if (symbolMatches.length >= 2) {
      const isValidSingleSlashOrHyphen = /^[A-Za-z0-9]+[-/][A-Za-z0-9]+$/.test(strippedEdge)
      if (!isValidSingleSlashOrHyphen) {
        const wc = rawTokens.filter((w) => /[A-Za-z0-9]/.test(w)).length
        return {
          valid: false,
          wordCount: wc,
          error: `Kata "${tok}" mengandung simbol tidak valid atau berulang di dalam 1 kata.`,
        }
      }
    }
  }

  // Cek bahasa kasar / terlarang (word boundary)
  const lowerClean = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  for (const bad of BLOCKED_PROFANITY_TERMS) {
    const escaped = bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i")
    if (re.test(lowerClean)) {
      const wc = rawTokens.filter((w) => /[A-Za-z0-9]/.test(w)).length
      return {
        valid: false,
        wordCount: wc,
        error: `Teks mengandung kata yang dilarang ("${bad}"). Gunakan bahasa profesional dan sopan.`,
      }
    }
  }

  // Ekstrak kata bermakna (mengizinkan kata ulang bertanda hubung tunggal seperti "masing-masing" sebagai 1 token sah)
  const cleanWords = rawTokens
    .map((t) => t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((t) => /[A-Za-z0-9]/.test(t))

  // Cek kata berulang berurutan ("dan dan" ditolak; "masing-masing" adalah 1 token bertanda hubung sehingga lolos, namun "masing-masing masing-masing" ditolak)
  for (let i = 1; i < cleanWords.length; i++) {
    if (cleanWords[i].toLowerCase() === cleanWords[i - 1].toLowerCase()) {
      return {
        valid: false,
        wordCount: cleanWords.length,
        error: `Tidak boleh menggunakan kata berulang berurutan ("${cleanWords[i - 1]} ${cleanWords[i]}").`,
      }
    }
  }

  if (cleanWords.length < minWords) {
    return {
      valid: false,
      wordCount: cleanWords.length,
      error: `Minimal input ${minWords} kata (${cleanWords.length}/${minWords} kata).`,
    }
  }

  return { valid: true, wordCount: cleanWords.length }
}

export function countValidSentences(rawText?: string | null): number {
  return validateFeedbackText(rawText).wordCount
}

export function hasMinFeedbackSentences(
  rawText?: string | null,
  minWords = MIN_FEEDBACK_WORDS,
): boolean {
  return validateFeedbackText(rawText, minWords).valid
}

export const OWNER_RESULT_STATUS_OPTIONS = ["Open", "Closed", "Cancel"] as const
export type OwnerResultStatus = (typeof OWNER_RESULT_STATUS_OPTIONS)[number]

export interface OwnerEvidenceFile {
  id: string
  name: string
  url: string
  mimeType: string
  size: number
}

/** Section "Hasil Tindak Lanjut Saya" milik owner untuk setiap tindak lanjut approver. */
export interface OwnerFollowUpResult {
  /** Referensi tindak lanjut approver, mis. "approver1-0" */
  ref: string
  aspekPerbaikan: string
  rencanaPengembangan: string
  tindakLanjut: string
  evaluasi: string
  indikatorKeberhasilan: string
  status: OwnerResultStatus
  evidence: OwnerEvidenceFile[]
}

export interface OwnerResultDecision {
  status: "Approved" | "Revision"
  note: string
  date: string
  approverName: string
}

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
  role?: string
  groupings?: string
}
export interface ReceivedFeedback {
  id: string
  division: string
  companyUnit: string
  answers: Record<string, string>
  receivedAt?: string
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
  followUpMeta?: Partial<Record<ReviewerRole, { approverName: string; date: string }>>
  nominations?: FeedbackNomination[]
  /** Jumlah pergantian pemberi feedback (maksimal 3 kali selama status masih Pending). */
  replacementCount?: number
  replacementHistory?: Array<{ oldGiverId: string; oldGiverName: string; newGiverId: string; newGiverName: string; at: string }>
  summaryDraftSavedAt?: string
  summarySubmittedAt?: string
  /** Log selesai modul: setelah tindak lanjut AP1 & AP2 (jika ada) diterima owner. */
  completedAt?: string
  ownerResults?: OwnerFollowUpResult[]
  ownerResultStatus?: "Draft" | "Submitted" | "Revision" | "Approved"
  ownerResultSubmittedAt?: string
  ownerResultDecisions?: Partial<Record<ReviewerRole, OwnerResultDecision>>
  ownerResultHistory?: Array<OwnerResultDecision & { role: ReviewerRole }>
}
export interface FeedbackTask {
  submission: FeedbackSubmission
  nomination: FeedbackNomination
}

const KEY = "inter_department_feedback_workflows_v2"
const LEGACY_KEY = "inter_department_feedback_submissions_v1"
const now = () => new Date().toISOString()
const FEEDBACK_ROUTE = "/measurement/inter-department-feedback"
const APPROVAL_ROUTE = "/approvals/measurement/inter-department-feedback"

// In-memory backend-hydrated cache (disinkronkan penuh ke tabel pa_inter_dept_feedbacks di Supabase)
let _idfBackendCache: FeedbackSubmission[] | null = null
let _idfListenersBound = false

function ensureIdfCacheInvalidationBound() {
  if (_idfListenersBound || typeof window === "undefined") return
  _idfListenersBound = true
  const invalidate = () => {
    _idfBackendCache = null
  }
  window.addEventListener("pa-db-hydrated", invalidate)
  window.addEventListener("storage", invalidate)
}
if (typeof window !== "undefined") {
  window.addEventListener("pa-db-hydrated", () => {
    _idfBackendCache = null
  })
}

function emit() {
  window.dispatchEvent(new Event("feedback-updated"))
}

function safeRead(key: string): FeedbackSubmission[] {
  try {
    const value = loadPersistedState<FeedbackSubmission[]>(key, [])
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function normalize(record: FeedbackSubmission): FeedbackSubmission {
  return {
    ...record,
    feedbacks: record.feedbacks ?? [],
    summaries: record.summaries ?? {},
    followUps: record.followUps ?? {},
    nominations: record.nominations ?? [],
    ownerResults: record.ownerResults ?? [],
    ownerResultDecisions: record.ownerResultDecisions ?? {},
    ownerResultHistory: record.ownerResultHistory ?? [],
  }
}

export function loadFeedbackSubmissions(): FeedbackSubmission[] {
  ensureIdfCacheInvalidationBound()
  if (_idfBackendCache && _idfBackendCache.length > 0) {
    return _idfBackendCache
  }
  const current = safeRead(KEY).map(normalize)
  if (current.length) {
    _idfBackendCache = current.filter((c) => !c.row.no.startsWith("IDF-EXAMPLE-"))
    return _idfBackendCache
  }
  const legacy = safeRead(LEGACY_KEY).map(normalize)
  const filteredLegacy = legacy.filter((c) => !c.row.no.startsWith("IDF-EXAMPLE-"))
  if (filteredLegacy.length > 0) {
    _idfBackendCache = filteredLegacy
  }
  return filteredLegacy
}

function writeLocal(submission: FeedbackSubmission) {
  const normalized = normalize(submission)
  const next = [
    ...loadFeedbackSubmissions().filter((entry) => entry.row.no !== normalized.row.no),
    normalized,
  ]
  _idfBackendCache = next
  safeSetLocalJson(KEY, next)
  emit()
  return { normalized, next }
}

function persistBackend(submission: FeedbackSubmission, description: string) {
  const normalized = normalize(submission)
  const next = [
    ...loadFeedbackSubmissions().filter((entry) => entry.row.no !== normalized.row.no),
    normalized,
  ]
  _idfBackendCache = next
  savePersistedState(KEY, next, {
    kind: "inter-dept-feedback",
    submission: normalized,
    audit: {
      action: "Update",
      module: "Performance Appraisal",
      subModule: "Inter-Department Feedback",
      description,
    },
  })
  emit()
}

/** Simpan submission apa adanya (dipakai oleh kode lama). */
export function saveFeedbackSubmission(submission: FeedbackSubmission) {
  persistBackend(
    submission,
    `Updated Inter-Department Feedback for ${submission.row.name} (${submission.row.status})`,
  )
}

/**
 * Terapkan mutasi ke data lokal (langsung tampil), lalu terapkan mutasi yang sama ke data backend terbaru
 * (tabel pa_inter_dept_feedbacks) agar perubahan pemberi feedback, owner, dan approver tidak saling menimpa.
 */
function mutateSubmission(
  no: string,
  mutate: (current: FeedbackSubmission) => FeedbackSubmission,
  description: string,
): FeedbackSubmission {
  const local = loadFeedbackSubmissions().find((entry) => entry.row.no === no)
  if (!local) throw new Error("Submission feedback tidak ditemukan.")
  const nextLocal = mutate(normalize(local))
  writeLocal(nextLocal)
  void (async () => {
    let base: FeedbackSubmission | null = null
    try {
      const rows = await selectRowsFromSupabase<{ submission?: FeedbackSubmission }>(
        "pa_inter_dept_feedbacks",
        `select=submission&submission_id=eq.${encodeURIComponent(no)}&limit=1`,
      )
      if (rows[0]?.submission?.row?.no) base = normalize(rows[0].submission)
    } catch {
      base = null
    }
    let finalState = nextLocal
    if (base) {
      try {
        finalState = mutate(base)
      } catch {
        finalState = nextLocal
      }
    }
    persistBackend(finalState, description)
  })()
  return nextLocal
}

export function getFeedbackSubmission(employeeId: string) {
  const normTarget = normalizeEmployeeId(employeeId)
  return loadFeedbackSubmissions().find(
    (entry) =>
      entry.row.employeeId === employeeId ||
      normalizeEmployeeId(entry.row.employeeId) === normTarget,
  )
}

/** Muat ulang satu submission dari backend (dipakai saat halaman dibuka / fokus kembali). */
export async function refreshFeedbackSubmissionsFromBackend(): Promise<void> {
  try {
    const rows = await selectRowsFromSupabase<{ submission?: FeedbackSubmission }>(
      "pa_inter_dept_feedbacks",
      "select=submission&order=updated_at.desc",
    )
    if (!rows.length) return
    const byNo = new Map(loadFeedbackSubmissions().map((s) => [s.row.no, s] as const))
    for (const r of rows) {
      if (r.submission?.row?.no) byNo.set(r.submission.row.no, normalize(r.submission))
    }
    const next = Array.from(byNo.values())
    _idfBackendCache = next
    safeSetLocalJson(KEY, next)
    emit()
  } catch {
    // ignore network errors
  }
}

function findUserByRef(ref?: string, users: ManagedUser[] = loadManagedUsers()): ManagedUser | undefined {
  const q = (ref ?? "").trim().toLowerCase()
  if (!q) return undefined
  return users.find(
    (u) =>
      (u.regNo ?? "").trim().toLowerCase() === q ||
      u.employeeId.trim().toLowerCase() === q ||
      normalizeEmployeeId(u.employeeId).toLowerCase() === normalizeEmployeeId(ref ?? "").toLowerCase(),
  )
}

export function resolveFeedbackApprovers(employeeId: string): {
  owner?: ManagedUser
  ap1?: ManagedUser
  ap2?: ManagedUser
  /** true jika Approver 2 ada & berbeda dengan Approver 1 */
  hasDistinctAp2: boolean
} {
  const users = loadManagedUsers()
  const owner =
    users.find((u) => normalizeEmployeeId(u.employeeId) === normalizeEmployeeId(employeeId)) ??
    users.find((u) => u.employeeId.toLowerCase() === employeeId.toLowerCase())
  const ap1 = findUserByRef(owner?.regNoAp1, users)
  const ap2 = findUserByRef(owner?.regNoAp2, users)
  const hasDistinctAp2 = Boolean(
    (owner?.regNoAp2 ?? "").trim() &&
      (!ap1 || !ap2 || ap1.employeeId !== ap2.employeeId) &&
      (owner?.regNoAp2 ?? "").trim().toLowerCase() !== (owner?.regNoAp1 ?? "").trim().toLowerCase(),
  )
  return { owner, ap1, ap2, hasDistinctAp2 }
}

/** Approver yang wajib memberi tindak lanjut (AP1, dan AP2 bila berbeda dengan AP1). */
export function requiredFollowUpRoles(submission: FeedbackSubmission): ReviewerRole[] {
  const { hasDistinctAp2 } = resolveFeedbackApprovers(submission.row.employeeId)
  return hasDistinctAp2 ? ["approver1", "approver2"] : ["approver1"]
}

/** Seluruh tindak lanjut approver sudah diterima owner (log selesai modul). */
export function isFeedbackFollowUpComplete(submission: FeedbackSubmission): boolean {
  return requiredFollowUpRoles(submission).every((role) => Boolean(submission.followUps[role]?.length))
}

export function nominateFeedbackGivers(
  recipient: FeedbackPerson,
  givers: FeedbackPerson[],
) {
  if (givers.length < MIN_FEEDBACK_GIVERS)
    throw new Error(
      `Pilih minimal ${MIN_FEEDBACK_GIVERS} karyawan berbeda sebagai pemberi feedback.`,
    )
  if (new Set(givers.map((giver) => giver.id)).size !== givers.length)
    throw new Error("Pemberi feedback tidak boleh duplikat.")
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
  triggerInterDeptNominationNotifications({
    recipient: {
      id: recipient.id,
      name: recipient.name,
      position: recipient.position,
      department: recipient.department,
      division: recipient.division,
      companyUnit: recipient.companyUnit,
    },
    givers: givers.map((g) => ({
      id: g.id,
      name: g.name,
      position: g.position,
      department: g.department,
      division: g.division,
      companyUnit: g.companyUnit,
    })),
  })
  return submission
}

/**
 * Ganti 1 pemberi feedback yang masih berstatus "Pending" (Menunggu feedback), maksimal 3 kali per periode.
 */
export function replacePendingFeedbackGiver(
  recipient: FeedbackPerson,
  oldGiverId: string,
  newGiver: FeedbackPerson,
): FeedbackSubmission {
  const submission = getFeedbackSubmission(recipient.id)
  if (!submission) throw new Error("Data nominasi pemberi feedback belum ditemukan.")
  if (submission.summarySubmittedAt) {
    throw new Error("Summary feedback sudah disubmit sehingga pemberi feedback tidak dapat diganti.")
  }
  const used = submission.replacementCount ?? 0
  if (used >= MAX_FEEDBACK_REPLACEMENTS) {
    throw new Error(`Kuota ganti pemberi feedback sudah mencapai batas maksimal (${MAX_FEEDBACK_REPLACEMENTS} kali).`)
  }
  const normOld = normalizeEmployeeId(oldGiverId)
  const targetNom = (submission.nominations ?? []).find(
    (n) => n.giver.id === oldGiverId || normalizeEmployeeId(n.giver.id) === normOld,
  )
  if (!targetNom) throw new Error("Pemberi feedback yang akan diganti tidak ditemukan.")
  if (targetNom.status !== "Pending") {
    throw new Error("Pemberi feedback yang sudah mengirimkan feedback tidak dapat diganti.")
  }
  const alreadyNominated = (submission.nominations ?? []).some(
    (n) =>
      n.giver.id === newGiver.id ||
      normalizeEmployeeId(n.giver.id) === normalizeEmployeeId(newGiver.id),
  )
  if (alreadyNominated) {
    throw new Error(`${newGiver.name} sudah terdaftar sebagai pemberi feedback Anda.`)
  }
  const eligErr = feedbackEligibilityError(recipient, newGiver)
  if (eligErr) throw new Error(eligErr)

  const updated = mutateSubmission(
    submission.row.no,
    (current) => {
      const curUsed = current.replacementCount ?? 0
      if (curUsed >= MAX_FEEDBACK_REPLACEMENTS) return current
      return {
        ...current,
        replacementCount: curUsed + 1,
        replacementHistory: [
          ...(current.replacementHistory ?? []),
          {
            oldGiverId: targetNom.giver.id,
            oldGiverName: targetNom.giver.name,
            newGiverId: newGiver.id,
            newGiverName: newGiver.name,
            at: now(),
          },
        ],
        nominations: (current.nominations ?? []).map((n) =>
          n.giver.id === oldGiverId || normalizeEmployeeId(n.giver.id) === normOld
            ? { giver: newGiver, status: "Pending" }
            : n,
        ),
      }
    },
    `Ganti pemberi feedback (${used + 1}/${MAX_FEEDBACK_REPLACEMENTS}): ${targetNom.giver.name} -> ${newGiver.name}`,
  )

  triggerInterDeptNominationNotifications({
    recipient: {
      id: recipient.id,
      name: recipient.name,
      position: recipient.position,
      department: recipient.department,
      division: recipient.division,
      companyUnit: recipient.companyUnit,
    },
    givers: [
      {
        id: newGiver.id,
        name: newGiver.name,
        position: newGiver.position,
        department: newGiver.department,
        division: newGiver.division,
        companyUnit: newGiver.companyUnit,
      },
    ],
  })
  return updated
}

export function feedbackTasksFor(giverId: string): FeedbackTask[] {
  const normGiver = normalizeEmployeeId(giverId)
  return loadFeedbackSubmissions().flatMap((submission) =>
    (submission.nominations ?? [])
      .filter(
        (nomination) =>
          nomination.giver.id === giverId ||
          normalizeEmployeeId(nomination.giver.id) === normGiver,
      )
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
  for (const indicator of FEEDBACK_INDICATORS) {
    const check = validateFeedbackText(answers[indicator.key])
    if (!check.valid) {
      throw new Error(check.error || `Setiap indikator wajib diisi minimal ${MIN_FEEDBACK_WORDS} kata yang valid.`)
    }
  }
  const submission = getFeedbackSubmission(recipientId)
  if (!submission) throw new Error("Permintaan feedback tidak ditemukan.")
  const normGiver = normalizeEmployeeId(giverId)
  const matchGiver = (entry: FeedbackNomination) =>
    entry.giver.id === giverId || normalizeEmployeeId(entry.giver.id) === normGiver
  const nomination = submission.nominations?.find(matchGiver)
  if (!nomination || nomination.status === "Submitted")
    throw new Error("Tugas feedback sudah tidak tersedia.")
  const feedback: ReceivedFeedback = {
    id: `rf-${recipientId}-${giverId}`,
    division: nomination.giver.division,
    companyUnit: nomination.giver.companyUnit,
    answers,
    receivedAt: now(),
  }
  mutateSubmission(
    submission.row.no,
    (current) => ({
      ...current,
      feedbacks: [...current.feedbacks.filter((entry) => entry.id !== feedback.id), feedback],
      nominations: current.nominations?.map((entry) =>
        matchGiver(entry) ? { ...entry, status: "Submitted", submittedAt: now() } : entry,
      ),
    }),
    `Feedback anonim diterima untuk ${submission.row.name}`,
  )
  // Notifikasi ke penerima bahwa ada feedback baru yang dapat langsung diberi Summary
  pushEmployeeNotification({
    employeeIds: [submission.row.employeeId],
    title: "Feedback Baru Diterima",
    summary: `Anda menerima 1 Inter-Department Feedback baru dari ${feedback.division} (${feedback.companyUnit}).`,
    body: [
      `Feedback anonim baru dari ${feedback.division} · ${feedback.companyUnit} telah masuk.`,
      "Anda dapat langsung mengisi Summary / Catatan Penerima dan menyimpannya sebagai draft tanpa menunggu feedback lainnya.",
    ],
    moduleName: "Inter-Departement Feedback",
    ctaLabel: "Lihat Feedback Diterima",
    ctaRoute: `${FEEDBACK_ROUTE}/received`,
  })
}

/** Kunci summary untuk 1 feedback & 1 indikator. */
export const summaryKey = (feedbackId: string, indicatorKey: string) => `${feedbackId}-${indicatorKey}`

/** Feedback yang summary-nya belum lengkap. */
export function feedbacksMissingSummary(
  submission: FeedbackSubmission,
  summaries: Record<string, string>,
): ReceivedFeedback[] {
  return submission.feedbacks.filter((feedback) =>
    FEEDBACK_INDICATORS.some(
      (indicator) => !hasMinFeedbackSentences(summaries[summaryKey(feedback.id, indicator.key)]),
    ),
  )
}

/** Syarat Submit Feedback & Summary + alasan bila belum terpenuhi (untuk tooltip). */
export function summarySubmitReadiness(
  submission: FeedbackSubmission,
  summaries: Record<string, string>,
): { ready: boolean; reasons: string[] } {
  const reasons: string[] = []
  const total = submission.nominations?.length ?? 0
  const pending = (submission.nominations ?? []).filter((n) => n.status !== "Submitted").length
  if (submission.feedbacks.length < MIN_FEEDBACK_GIVERS)
    reasons.push(`Minimal ${MIN_FEEDBACK_GIVERS} feedback harus diterima (saat ini ${submission.feedbacks.length}).`)
  if (pending > 0) reasons.push(`Masih menunggu ${pending} dari ${total} feedback.`)
  const missing = feedbacksMissingSummary(submission, summaries)
  if (missing.length > 0)
    reasons.push(`${missing.length} feedback belum lengkap Summary / Catatan Penerima-nya (minimal ${MIN_FEEDBACK_WORDS} kata valid, tanpa kata/simbol/spasi berulang atau kata terlarang).`)
  if (submission.summarySubmittedAt) reasons.push("Feedback & Summary sudah disubmit.")
  return { ready: reasons.length === 0, reasons }
}

/** Save Draft Summary / Catatan Penerima (tidak dikirim ke approver). */
export function saveFeedbackSummaryDraft(employeeId: string, summaries: Record<string, string>) {
  const submission = getFeedbackSubmission(employeeId)
  if (!submission) throw new Error("Feedback yang diterima belum tersedia.")
  if (submission.summarySubmittedAt) throw new Error("Summary feedback sudah disubmit.")
  mutateSubmission(
    submission.row.no,
    (current) => ({
      ...current,
      // Gabung: summary yang sudah tersimpan sebelumnya tetap ada, ditimpa nilai terbaru yang diketik owner
      summaries: { ...current.summaries, ...summaries },
      summaryDraftSavedAt: now(),
    }),
    `Draft summary Inter-Department Feedback disimpan oleh ${submission.row.name}`,
  )
}

export function submitFeedbackSummary(
  employeeId: string,
  summaries: Record<string, string>,
) {
  const submission = getFeedbackSubmission(employeeId)
  if (!submission) throw new Error("Feedback yang diterima belum tersedia.")
  const merged = { ...submission.summaries, ...summaries }
  const readiness = summarySubmitReadiness(submission, merged)
  if (!readiness.ready) throw new Error(readiness.reasons.join(" "))
  const todayStr = formatTodayDDMMYYYY()
  mutateSubmission(
    submission.row.no,
    (current) => ({
      ...current,
      summaries: { ...current.summaries, ...summaries },
      summarySubmittedAt: current.summarySubmittedAt ?? now(),
      row: { ...current.row, submittedDate: todayStr, status: "Pending" },
    }),
    `Feedback & Summary Inter-Department Feedback disubmit oleh ${submission.row.name}`,
  )
  submitWorkflowModule(
    "Inter-Department Feedback",
    "measurement",
    todayStr,
    submission.row.employeeId,
  )
  const { ap1 } = resolveFeedbackApprovers(submission.row.employeeId)
  if (ap1) {
    pushEmployeeNotification({
      employeeIds: [ap1.employeeId],
      title: "Tindak Lanjut Inter-Department Feedback Diperlukan",
      summary: `${submission.row.name} telah submit Feedback & Summary. Mohon isi Tindak Lanjut sebagai Approver 1.`,
      body: [
        `Yth. Bapak/Ibu ${ap1.name},`,
        `${submission.row.name} (${submission.row.position} · ${submission.row.department}) telah mengirim Feedback & Summary / Catatan Penerima Inter-Department Feedback periode 2026.`,
        "Silakan buka menu Approvals untuk mengisi Tindak Lanjut sebagai Approver 1 (Level Divisi).",
      ],
      category: "Approval",
      moduleName: "Inter-Departement Feedback",
      approvalStatus: "Submitted",
      ctaLabel: "Isi Tindak Lanjut",
      ctaRoute: APPROVAL_ROUTE,
      senderName: submission.row.name,
      senderRole: submission.row.position || "Employee",
    })
  }
}

/** Status baris approval untuk role reviewer tertentu. */
export function feedbackRowStatusFor(submission: FeedbackSubmission, role: ReviewerRole): {
  status: string
  needsAction: boolean
  stage: "followup" | "owner-result" | "done" | "waiting"
} {
  const required = requiredFollowUpRoles(submission)
  const isRequired = required.includes(role)
  const effectiveRole: ReviewerRole = isRequired ? role : "approver1"
  const myFollowUp = Boolean(submission.followUps[effectiveRole]?.length)
  if (!myFollowUp) {
    if (effectiveRole === "approver2" && !submission.followUps.approver1?.length)
      return { status: "Menunggu Approver 1", needsAction: false, stage: "waiting" }
    return { status: "Pending", needsAction: true, stage: "followup" }
  }
  if (submission.ownerResultStatus === "Submitted") {
    const decision = submission.ownerResultDecisions?.[effectiveRole]
    const prevApproved =
      effectiveRole === "approver1" || submission.ownerResultDecisions?.approver1?.status === "Approved"
    if (!decision && prevApproved)
      return { status: "Pending-Hasil Tindak Lanjut", needsAction: true, stage: "owner-result" }
    if (!decision) return { status: "Menunggu Approver 1", needsAction: false, stage: "waiting" }
  }
  if (submission.ownerResultStatus === "Approved")
    return { status: "Approved-Hasil Tindak Lanjut", needsAction: false, stage: "done" }
  if (submission.ownerResultStatus === "Revision")
    return { status: "Revision-Hasil Tindak Lanjut", needsAction: false, stage: "done" }
  return {
    status: `Assessed-Approver ${effectiveRole === "approver1" ? "1" : "2"}`,
    needsAction: false,
    stage: "done",
  }
}

export function feedbackApprovalRows(role: ReviewerRole): ApprovalRow[] {
  return loadFeedbackSubmissions()
    .filter((entry) => !!entry.summarySubmittedAt)
    .map((entry) => {
      const { row, summarySubmittedAt } = entry
      const normSub = normalizeDateDDMMYYYY(row.submittedDate)
      const fallbackSub = normalizeDateDDMMYYYY(summarySubmittedAt)
      return {
        ...row,
        submittedDate:
          normSub !== "—" ? normSub : fallbackSub !== "—" ? fallbackSub : formatTodayDDMMYYYY(),
        status: feedbackRowStatusFor(entry, role).status,
      }
    })
}

export function saveFeedbackFollowUp(
  no: string,
  role: ReviewerRole,
  rows: FeedbackFollowUp[],
  actingApproverName?: string,
) {
  const submission = loadFeedbackSubmissions().find((entry) => entry.row.no === no)
  if (!submission) throw new Error("Submission feedback tidak ditemukan.")
  const required = requiredFollowUpRoles(submission)
  // AP1 == AP2 → cukup 1 kali tindak lanjut (disimpan sebagai Approver 1)
  const effectiveRole: ReviewerRole = required.includes(role) ? role : "approver1"
  if (effectiveRole === "approver2" && !submission.followUps.approver1?.length)
    throw new Error("Approver 1 harus menyelesaikan tindak lanjut terlebih dahulu.")
  if (
    !rows.length ||
    rows.some((row) => FOLLOW_UP_COLUMNS.some((column) => !row[column]?.trim()))
  )
    throw new Error("Semua field tindak lanjut wajib diisi.")
  if (
    rows.some((row) =>
      FOLLOW_UP_COLUMNS.some(
        (column) => column !== "Timeline Evaluasi" && !hasMinFeedbackSentences(row[column]),
      ),
    )
  )
    throw new Error(`Setiap field teks Tindak Lanjut wajib diisi minimal ${MIN_FEEDBACK_SENTENCES} kalimat.`)
  if (submission.followUps[effectiveRole]?.length) throw new Error("Tindak lanjut sudah disubmit.")
  const todayStr = formatTodayDDMMYYYY()
  const approverName = actingApproverName || getActiveUser().name
  const isFinal = effectiveRole === required[required.length - 1]
  const next = mutateSubmission(
    no,
    (current) => {
      if (current.followUps[effectiveRole]?.length) return current
      const followUps = { ...current.followUps, [effectiveRole]: rows }
      const complete = required.every((r) => Boolean(followUps[r]?.length))
      return {
        ...current,
        row: {
          ...current.row,
          approvalDate: todayStr,
          status: isFinal ? "Approved" : "Assessed-Approver 1",
        },
        followUps,
        followUpMeta: { ...(current.followUpMeta ?? {}), [effectiveRole]: { approverName, date: todayStr } },
        completedAt: complete ? current.completedAt ?? now() : current.completedAt,
      }
    },
    `Tindak lanjut ${effectiveRole === "approver1" ? "Approver 1" : "Approver 2"} Inter-Department Feedback untuk ${submission.row.name}`,
  )
  registerWorkflowRows([submission.row], effectiveRole)
  saveWorkflowDecision(submission.row.no, isFinal ? "Approved" : "Assessed-Approver 1", todayStr)

  const { ap2 } = resolveFeedbackApprovers(submission.row.employeeId)
  pushEmployeeNotification({
    employeeIds: [submission.row.employeeId],
    title: "Tindak Lanjut Approver Diterima",
    summary: `${approverName} (${effectiveRole === "approver1" ? "Approver 1" : "Approver 2"}) telah memberikan Tindak Lanjut Inter-Department Feedback Anda.`,
    body: [
      `Tindak lanjut dari ${approverName} sudah tersedia pada tab Tindak Lanjut.`,
      isFinal
        ? "Seluruh tindak lanjut approver telah diterima. Silakan lengkapi section Hasil Tindak Lanjut Saya lalu Submit."
        : "Menunggu tindak lanjut dari Approver 2.",
    ],
    moduleName: "Inter-Departement Feedback",
    approvalStatus: "Tindak Lanjut Berjalan",
    ctaLabel: "Lihat Tindak Lanjut",
    ctaRoute: `${FEEDBACK_ROUTE}/followup`,
    senderName: approverName,
  })
  if (!isFinal && ap2) {
    pushEmployeeNotification({
      employeeIds: [ap2.employeeId],
      title: "Tindak Lanjut Inter-Department Feedback Diperlukan",
      summary: `Approver 1 telah memberi tindak lanjut untuk ${submission.row.name}. Mohon isi Tindak Lanjut sebagai Approver 2.`,
      category: "Approval",
      moduleName: "Inter-Departement Feedback",
      approvalStatus: "Assessed-Approver 1",
      ctaLabel: "Isi Tindak Lanjut",
      ctaRoute: APPROVAL_ROUTE,
      senderName: approverName,
    })
  }
  return next
}

/** Template "Hasil Tindak Lanjut Saya" (1 entri per tindak lanjut approver) dengan nilai tersimpan sebelumnya. */
export function buildOwnerResultTemplate(submission: FeedbackSubmission): OwnerFollowUpResult[] {
  const existing = new Map((submission.ownerResults ?? []).map((r) => [r.ref, r] as const))
  const out: OwnerFollowUpResult[] = []
  for (const role of requiredFollowUpRoles(submission)) {
    ;(submission.followUps[role] ?? []).forEach((fu, idx) => {
      const ref = `${role}-${idx}`
      out.push(
        existing.get(ref) ?? {
          ref,
          aspekPerbaikan: fu["Aspek Perbaikan"] ?? "",
          rencanaPengembangan: "",
          tindakLanjut: "",
          evaluasi: "",
          indikatorKeberhasilan: "",
          status: "Open",
          evidence: [],
        },
      )
    })
  }
  return out
}

export function ownerResultMissingFields(results: OwnerFollowUpResult[]): string[] {
  const missing: string[] = []
  results.forEach((r, i) => {
    const label = `Tindak Lanjut #${i + 1}`
    if (!r.aspekPerbaikan.trim()) missing.push(`${label}: Aspek Perbaikan`)
    if (!r.rencanaPengembangan.trim()) missing.push(`${label}: Rencana Pengembangan`)
    if (!r.tindakLanjut.trim()) missing.push(`${label}: Tindak Lanjut`)
    if (!r.evaluasi.trim()) missing.push(`${label}: Evaluasi`)
    if (!r.indikatorKeberhasilan.trim()) missing.push(`${label}: Indikator Keberhasilan`)
  })
  return missing
}

/** Owner submit "Hasil Tindak Lanjut Saya" (tidak menjadi trigger log selesai modul). */
export function submitOwnerFollowUpResults(employeeId: string, results: OwnerFollowUpResult[]) {
  const submission = getFeedbackSubmission(employeeId)
  if (!submission) throw new Error("Submission feedback tidak ditemukan.")
  if (!isFeedbackFollowUpComplete(submission))
    throw new Error("Hasil Tindak Lanjut dapat diisi setelah seluruh tindak lanjut approver diterima.")
  if (submission.ownerResultStatus === "Submitted" || submission.ownerResultStatus === "Approved")
    throw new Error("Hasil Tindak Lanjut sudah disubmit.")
  const missing = ownerResultMissingFields(results)
  if (missing.length) throw new Error(`Lengkapi field berikut: ${missing.join(", ")}`)
  mutateSubmission(
    submission.row.no,
    (current) => ({
      ...current,
      ownerResults: results,
      ownerResultStatus: "Submitted",
      ownerResultSubmittedAt: now(),
      ownerResultDecisions: {},
    }),
    `Hasil Tindak Lanjut Inter-Department Feedback disubmit oleh ${submission.row.name}`,
  )
  const { ap1 } = resolveFeedbackApprovers(submission.row.employeeId)
  if (ap1) {
    pushEmployeeNotification({
      employeeIds: [ap1.employeeId],
      title: "Approval Hasil Tindak Lanjut Feedback",
      summary: `${submission.row.name} telah submit Hasil Tindak Lanjut Inter-Department Feedback. Mohon berikan Approval atau Revisi.`,
      category: "Approval",
      moduleName: "Inter-Departement Feedback",
      approvalStatus: "Submitted",
      ctaLabel: "Review Hasil Tindak Lanjut",
      ctaRoute: APPROVAL_ROUTE,
      senderName: submission.row.name,
    })
  }
}

/** Approver memberi Approval (komentar opsional) atau Revisi (note wajib) atas Hasil Tindak Lanjut owner. */
export function decideOwnerFollowUpResult(
  no: string,
  role: ReviewerRole,
  decision: "Approved" | "Revision",
  note: string,
  actingApproverName?: string,
) {
  const submission = loadFeedbackSubmissions().find((entry) => entry.row.no === no)
  if (!submission) throw new Error("Submission feedback tidak ditemukan.")
  if (submission.ownerResultStatus !== "Submitted")
    throw new Error("Tidak ada Hasil Tindak Lanjut yang menunggu approval.")
  if (decision === "Revision" && !note.trim()) throw new Error("Note revisi wajib diisi.")
  const required = requiredFollowUpRoles(submission)
  const effectiveRole: ReviewerRole = required.includes(role) ? role : "approver1"
  if (effectiveRole === "approver2" && submission.ownerResultDecisions?.approver1?.status !== "Approved")
    throw new Error("Approver 1 harus memberikan approval terlebih dahulu.")
  const approverName = actingApproverName || getActiveUser().name
  const entry: OwnerResultDecision = {
    status: decision,
    note: note.trim(),
    date: formatTodayDDMMYYYY(),
    approverName,
  }
  const isFinal = effectiveRole === required[required.length - 1]
  mutateSubmission(
    no,
    (current) => {
      const decisions = { ...(current.ownerResultDecisions ?? {}), [effectiveRole]: entry }
      const history = [...(current.ownerResultHistory ?? []), { ...entry, role: effectiveRole }]
      if (decision === "Revision")
        return { ...current, ownerResultStatus: "Revision", ownerResultDecisions: decisions, ownerResultHistory: history }
      return {
        ...current,
        ownerResultStatus: isFinal ? "Approved" : "Submitted",
        ownerResultDecisions: decisions,
        ownerResultHistory: history,
      }
    },
    `${decision === "Approved" ? "Approval" : "Revisi"} Hasil Tindak Lanjut Inter-Department Feedback ${submission.row.name}`,
  )
  pushEmployeeNotification({
    employeeIds: [submission.row.employeeId],
    title:
      decision === "Approved"
        ? "Hasil Tindak Lanjut Disetujui"
        : "Hasil Tindak Lanjut Perlu Revisi",
    summary:
      decision === "Approved"
        ? `${approverName} menyetujui Hasil Tindak Lanjut Anda${note.trim() ? `: "${note.trim()}"` : "."}`
        : `${approverName} meminta revisi Hasil Tindak Lanjut Anda: "${note.trim()}"`,
    category: decision === "Approved" ? "Approval" : "Reminder",
    moduleName: "Inter-Departement Feedback",
    approvalStatus: decision,
    ctaLabel: "Lihat Hasil Tindak Lanjut",
    ctaRoute: `${FEEDBACK_ROUTE}/followup`,
    senderName: approverName,
  })
  if (decision === "Approved" && !isFinal) {
    const { ap2 } = resolveFeedbackApprovers(submission.row.employeeId)
    if (ap2) {
      pushEmployeeNotification({
        employeeIds: [ap2.employeeId],
        title: "Approval Hasil Tindak Lanjut Feedback",
        summary: `Approver 1 telah menyetujui Hasil Tindak Lanjut ${submission.row.name}. Mohon berikan Approval atau Revisi sebagai Approver 2.`,
        category: "Approval",
        moduleName: "Inter-Departement Feedback",
        ctaLabel: "Review Hasil Tindak Lanjut",
        ctaRoute: APPROVAL_ROUTE,
        senderName: approverName,
      })
    }
  }
  void syncToSupabase({
    audit: {
      action: decision,
      module: "Inter-Department Feedback",
      subModule: "Hasil Tindak Lanjut",
      description: `${approverName} ${decision === "Approved" ? "approved" : "requested revision for"} follow-up result of ${submission.row.name}`,
    },
  })
}
