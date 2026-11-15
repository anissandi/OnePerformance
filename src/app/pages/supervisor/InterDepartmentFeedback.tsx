// @refresh reset
import { useEffect, useMemo, useState } from "react"
import { useRouteTab } from "../../utils/useRouteTab"
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileText,
  Info,
  Lock,
  Search,
  Send,
  Users,
  X,
} from "lucide-react"
import { useAuthStore, type ManagedUser } from "../../store/authStore"
import { normalizeDateDDMMYYYY } from "../../utils/dateFormat"
import { feedbackEligibilityError } from "../shared/feedbackEligibility"
import {
  FEEDBACK_ACTIVATION_EVENT,
  feedbackWindow,
  loadFeedbackActivation,
} from "../shared/feedbackActivationStore"
import {
  FEEDBACK_INDICATORS,
  FOLLOW_UP_COLUMNS,
  feedbackTasksFor,
  getFeedbackSubmission,
  nominateFeedbackGivers,
  submitFeedbackSummary,
  submitNominatedFeedback,
  type FeedbackFollowUp,
  type FeedbackPerson,
  type FeedbackTask,
} from "../shared/interDepartmentFeedbackStore"
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar"

const CANDIDATES_PER_PAGE = 10

const personFromManagedUser = (user: ManagedUser): FeedbackPerson => ({
  id: user.employeeId,
  name: user.name,
  position: user.position,
  initials: (user.name || "U")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase(),
  companyUnit: user.company,
  division: user.division,
  department: user.department,
  section: user.bagian,
})
const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-[#1A284F] focus:ring-2 focus:ring-[#1A284F]/15 disabled:cursor-not-allowed disabled:bg-gray-50"

function AnonymityBanner() {
  return (
    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Lock className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-bold">Feedback bersifat anonim</p>
        <p className="mt-1 text-xs leading-relaxed">
          Penerima dan approver hanya melihat unit serta divisi pemberi
          feedback, bukan nama atau ID pemberi. Tulis feedback secara
          profesional, spesifik, dan dapat dipertanggungjawabkan.
        </p>
      </div>
    </div>
  )
}

function EmployeeBadge({ person }: { person: FeedbackPerson }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1A284F] text-xs font-bold text-white">
        {person.initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">
          {person.name}
        </p>
        <p className="truncate text-xs text-gray-500">{person.position}</p>
        <p className="text-xs text-gray-500">{person.companyUnit} · {person.department}{person.section ? ` · ${person.section}` : ""}</p>
      </div>
    </div>
  )
}

export function InterDepartmentFeedback() {
  const { activeUser, allUsers } = useAuthStore()
  const [activeTab, setActiveTab] = useRouteTab<"nominate" | "tasks" | "received" | "followup">(
    ["nominate", "tasks", "received", "followup"],
    "nominate",
  )
  const [unit, setUnit] = useState("")
  const [division, setDivision] = useState("")
  const [department, setDepartment] = useState("")
  const [candidateSearch, setCandidateSearch] = useState("")
  const [selected, setSelected] = useState<FeedbackPerson[]>([])
  const [confirmNomination, setConfirmNomination] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [activation, setActivation] = useState(() =>
    loadFeedbackActivation("2026"),
  )
  const [version, setVersion] = useState(0)
  const people = useMemo(
    () =>
      allUsers
        .filter((u) => u.status === "Active")
        .map(personFromManagedUser),
    [allUsers, version],
  )
  const actor = useMemo(
    () =>
      people.find(
        (person) =>
          person.id.toLowerCase() === activeUser.employeeId.toLowerCase(),
      ) ?? personFromManagedUser(activeUser),
    [people, activeUser],
  )
  const workflow = actor ? getFeedbackSubmission(actor.id) : undefined
  const status = feedbackWindow(activation)
  const refresh = () => setVersion((current) => current + 1)

  useEffect(() => {
    const update = () => {
      setActivation(loadFeedbackActivation("2026"))
      refresh()
    }
    window.addEventListener(FEEDBACK_ACTIVATION_EVENT, update)
    window.addEventListener("feedback-updated", update)
    window.addEventListener("appraisal-updated", update)
    window.addEventListener("pa-db-hydrated", update)
    window.addEventListener("pa-auth-updated", update)
    window.addEventListener("storage", update)
    return () => {
      window.removeEventListener(FEEDBACK_ACTIVATION_EVENT, update)
      window.removeEventListener("feedback-updated", update)
      window.removeEventListener("appraisal-updated", update)
      window.removeEventListener("pa-db-hydrated", update)
      window.removeEventListener("pa-auth-updated", update)
      window.removeEventListener("storage", update)
    }
  }, [])

  useEffect(() => {
    setSelected([])
    setUnit("")
    setDivision("")
    setDepartment("")
    setCandidateSearch("")
    setError("")
    setNotice("")
  }, [activeUser.employeeId])

  const units = useMemo(
    () => [...new Set(people.map((person) => person.companyUnit))],
    [people],
  )
  const divisions = useMemo(
    () => [
      ...new Set(
        people
          .filter((person) => !unit || person.companyUnit === unit)
          .map((person) => person.division),
      ),
    ],
    [people, unit],
  )
  const departments = useMemo(
    () => [
      ...new Set(
        people
          .filter(
            (person) =>
              (!unit || person.companyUnit === unit) &&
              (!division || person.division === division),
          )
          .map((person) => person.department),
      ),
    ],
    [people, unit, division],
  )
  const candidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase()
    return people
      .filter(
        (person) =>
          !!actor &&
          !feedbackEligibilityError(actor, person) &&
          (!unit || person.companyUnit === unit) &&
          (!division || person.division === division) &&
          (!department || person.department === department) &&
          (!q ||
            [
              person.name,
              person.id,
              person.position,
              person.department,
              person.division,
              person.companyUnit,
            ].some((v) => String(v ?? "").toLowerCase().includes(q))),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }))
  }, [people, actor, unit, division, department, candidateSearch])

  const allTasks = actor ? feedbackTasksFor(actor.id) : []
  const pendingTasks = allTasks.filter(
    (task) => task.nomination.status === "Pending",
  )
  const tasksDotTone: "yellow" | "green" | null =
    allTasks.length === 0
      ? null
      : pendingTasks.length > 0
      ? "yellow"
      : "green"
  const receivedDotTone: "yellow" | "green" | null = !workflow
    ? null
    : workflow.feedbacks.length >= 3
    ? "green"
    : "yellow"
  const hasAp1FollowUp = Boolean(workflow?.followUps.approver1?.length)
  const hasAp2FollowUp = Boolean(workflow?.followUps.approver2?.length)
  const followUpDotTone: "yellow" | "green" | null = !workflow?.summarySubmittedAt
    ? null
    : hasAp1FollowUp && (hasAp2FollowUp || !activeUser.regNoAp2)
    ? "green"
    : "yellow"

  const ap1User = allUsers.find(
    (u) =>
      (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase()) ||
      u.employeeId.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase(),
  )
  const ap2User = allUsers.find(
    (u) =>
      (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase()) ||
      u.employeeId.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase(),
  )

  function nominate() {
    if (!actor || !status.receiving) {
      setError(
        "Nominasi hanya tersedia pada periode penerimaan feedback. Periksa Module Activation.",
      )
      return
    }
    try {
      nominateFeedbackGivers(actor, selected)
      setConfirmNomination(false)
      setNotice(
        "Tiga pemberi feedback berhasil dipilih. Tugas feedback telah dibuat untuk masing-masing karyawan.",
      )
      refresh()
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Nominasi gagal disimpan.",
      )
    }
  }

  return (
    <main className="w-full pb-16" data-feedback-version={version}>
      <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-wide text-[#1A284F]">
            Inter-Department & Factories Feedback / Comments
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Performance Year 2026 · Karyawan memilih tepat tiga pemberi feedback
            untuk dirinya.
          </p>
        </div>
      </header>

      <div className="mb-6">
        <ModuleApprovalStatusBar
          module="Inter-Department Feedback"
          phase="measurement"
          submittedOverride={Boolean(workflow?.summarySubmittedAt)}
          submittedDateOverride={
            workflow?.row.submittedDate && workflow.row.submittedDate !== "-"
              ? normalizeDateDDMMYYYY(workflow.row.submittedDate)
              : workflow?.summarySubmittedAt
              ? normalizeDateDDMMYYYY(workflow.summarySubmittedAt)
              : undefined
          }
        />
      </div>

      {(notice || error) && (
        <p
          role={error ? "alert" : "status"}
          className={`mb-5 rounded-xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {error || notice}
        </p>
      )}

      <nav
        className="mb-8 flex overflow-x-auto border-b border-gray-200"
        aria-label="Inter-Department Feedback"
      >
        {([
          { id: "nominate", label: "Pilih Pemberi Feedback", Icon: Users, dot: null as "yellow" | "green" | null },
          {
            id: "tasks",
            label: `Tugas Feedback Saya${pendingTasks.length ? ` (${pendingTasks.length})` : ""}`,
            Icon: FileText,
            dot: tasksDotTone,
          },
          { id: "received", label: "Feedback Diterima", Icon: Eye, dot: receivedDotTone },
          { id: "followup", label: "Tindak Lanjut", Icon: ClipboardCheck, dot: followUpDotTone },
        ] as const).map(({ id, label, Icon, dot }) => (
          <button
            key={id}
            onClick={() => {
              setActiveTab(id)
              setError("")
              setNotice("")
            }}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold ${
              activeTab === id
                ? "border-[#1A284F] text-[#1A284F]"
                : "border-transparent text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
            {dot && (
              <span
                title={
                  dot === "green"
                    ? "Sudah lengkap / selesai"
                    : "Menunggu / belum lengkap"
                }
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  dot === "green"
                    ? "bg-emerald-400 ring-2 ring-emerald-100"
                    : "bg-amber-300 ring-2 ring-amber-100"
                }`}
              />
            )}
          </button>
        ))}
      </nav>

      {activeTab === "nominate" && actor && (
        <NominationPanel
          actor={actor}
          workflow={workflow}
          selected={selected}
          candidates={candidates}
          unit={unit}
          division={division}
          department={department}
          search={candidateSearch}
          units={units}
          divisions={divisions}
          departments={departments}
          enabled={status.receiving}
          onUnit={(value) => {
            setUnit(value)
            setDivision("")
            setDepartment("")
          }}
          onDivision={(value) => {
            setDivision(value)
            setDepartment("")
          }}
          onDepartment={setDepartment}
          onSearch={setCandidateSearch}
          onAdd={(person) =>
            setSelected((current) =>
              current.length < 3 &&
              !current.some((entry) => entry.id === person.id)
                ? [...current, person]
                : current,
            )
          }
          onRemove={(id) =>
            setSelected((current) =>
              current.filter((person) => person.id !== id),
            )
          }
          onConfirm={() => {
            setError("")
            setConfirmNomination(true)
          }}
        />
      )}
      {activeTab === "tasks" && actor && (
        <TaskInbox
          actor={actor}
          tasks={allTasks}
          enabled={status.receiving}
          onDone={() => {
            setNotice("Feedback anonim berhasil dikirim kepada penerima.")
            refresh()
          }}
          onError={setError}
        />
      )}
      {activeTab === "received" && actor && (
        <ReceivedPanel
          actor={actor}
          workflow={workflow}
          approvalOpen={status.approval}
          onDone={() => {
            setNotice(
              "Summary feedback berhasil diteruskan kepada Approver 1 dan Approver 2.",
            )
            refresh()
          }}
          onError={setError}
        />
      )}
      {activeTab === "followup" && (
        <FollowUpResultPanel
          workflow={workflow}
          ap1Name={ap1User?.name || activeUser.regNoAp1 || "Approver 1"}
          ap2Name={ap2User?.name || activeUser.regNoAp2 || "Approver 2"}
          hasSecondApprover={Boolean(activeUser.regNoAp2)}
        />
      )}

      {confirmNomination && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-[#1A284F]">
              Konfirmasi Pemberi Feedback
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Tiga karyawan berikut akan menerima tugas untuk memberi feedback
              anonim kepada Anda. Pilihan tidak dapat diubah setelah dikirim.
            </p>
            <div className="my-5 space-y-2">
              {selected.map((person) => (
                <div key={person.id} className="rounded-lg bg-gray-50 p-3">
                  <EmployeeBadge person={person} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmNomination(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                onClick={nominate}
                className="rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white"
              >
                Kirim Nominasi
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function NominationPanel({
  actor,
  workflow,
  selected,
  candidates,
  unit,
  division,
  department,
  search,
  units,
  divisions,
  departments,
  enabled,
  onUnit,
  onDivision,
  onDepartment,
  onSearch,
  onAdd,
  onRemove,
  onConfirm,
}: {
  actor: FeedbackPerson
  workflow: ReturnType<typeof getFeedbackSubmission>
  selected: FeedbackPerson[]
  candidates: FeedbackPerson[]
  unit: string
  division: string
  department: string
  search: string
  units: string[]
  divisions: string[]
  departments: string[]
  enabled: boolean
  onUnit: (value: string) => void
  onDivision: (value: string) => void
  onDepartment: (value: string) => void
  onSearch: (value: string) => void
  onAdd: (person: FeedbackPerson) => void
  onRemove: (id: string) => void
  onConfirm: () => void
}) {
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [unit, division, department, search])

  const totalPages = Math.max(1, Math.ceil(candidates.length / CANDIDATES_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedCandidates = candidates.slice(
    (safePage - 1) * CANDIDATES_PER_PAGE,
    safePage * CANDIDATES_PER_PAGE,
  )
  const canSubmitNomination = enabled && selected.length === 3
  const submitTooltipText = !enabled
    ? "Nominasi hanya tersedia selama periode penerimaan feedback aktif."
    : selected.length < 3
    ? `Pilih tepat 3 pemberi feedback (${selected.length}/3 terpilih) untuk mengaktifkan tombol Kirim Nominasi.`
    : "Klik untuk mengirim nominasi ke 3 pemberi feedback terpilih."

  if (workflow)
    return (
      <section className="space-y-5">
        <div className="flex items-start gap-4 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="h-7 w-7 shrink-0 text-green-600" />
          <div>
            <h2 className="font-bold text-green-900">
              Pemberi feedback sudah dipilih
            </h2>
            <p className="mt-1 text-sm text-green-800">
              Anda telah menominasikan tiga karyawan. Pilihan terkunci untuk
              periode ini; status tugas diperbarui saat feedback diterima.
            </p>
          </div>
        </div>
        <section className="rounded-2xl border bg-white p-6">
          <h3 className="mb-4 font-bold text-[#1A284F]">
            Tiga pemberi feedback Anda
          </h3>
          <div className="space-y-3">
            {workflow.nominations?.map((nomination, index) => (
              <div
                key={nomination.giver.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A284F]/10 text-xs font-bold text-[#1A284F]">
                    {index + 1}
                  </span>
                  <EmployeeBadge person={nomination.giver} />
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    nomination.status === "Submitted"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {nomination.status === "Submitted"
                    ? "Feedback diterima"
                    : "Menunggu feedback"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </section>
    )
  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_380px] items-start">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A284F]/10">
            <Building2 className="h-5 w-5 text-[#1A284F]" />
          </span>
          <div>
            <h2 className="font-bold text-gray-900">
              Pilih 3 Karyawan sebagai Pemberi Feedback
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Pilih rekan dari departemen dan bagian yang berbeda dari Anda.
              Divisi dan unit usaha boleh sama; lintas unit usaha juga diperbolehkan.
              Mereka akan memberi feedback kepada Anda, bukan sebaliknya.
            </p>
          </div>
        </div>
        <AnonymityBanner />
        <div className="mt-5 relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cari nama karyawan, ID, jabatan, departemen, atau unit usaha (urut A–Z)..."
            className={inputClass + " pl-10 pr-9"}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Bersihkan pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Select
            label="Company Unit"
            value={unit}
            options={units}
            onChange={onUnit}
          />
          <Select
            label="Division"
            value={division}
            options={divisions}
            disabled={!unit}
            onChange={onDivision}
          />
          <Select
            label="Department"
            value={department}
            options={departments}
            disabled={!division}
            onChange={onDepartment}
          />
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <span>
            Diurutkan abjad <strong>A–Z</strong> ·{" "}
            {candidates.length === 0
              ? "0 karyawan"
              : `Menampilkan ${(safePage - 1) * CANDIDATES_PER_PAGE + 1}–${Math.min(
                  safePage * CANDIDATES_PER_PAGE,
                  candidates.length,
                )} dari ${candidates.length} karyawan`}
          </span>
          <span>Maks. {CANDIDATES_PER_PAGE} nama / halaman</span>
        </div>
        <div className="mt-3 space-y-2">
          {pagedCandidates.map((person) => {
            const added = selected.some((entry) => entry.id === person.id)
            return (
              <div
                key={person.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
                  added ? "border-green-200 bg-green-50" : "border-gray-100"
                }`}
              >
                <EmployeeBadge person={person} />
                {added ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
                    <Check className="h-4 w-4" /> Dipilih
                  </span>
                ) : (
                  <button
                    disabled={!enabled || selected.length === 3}
                    onClick={() => onAdd(person)}
                    className="rounded-lg border border-[#1A284F]/30 px-3 py-2 text-xs font-bold text-[#1A284F] disabled:opacity-40"
                  >
                    Pilih
                  </button>
                )}
              </div>
            )
          })}
          {!candidates.length && (
            <p className="py-12 text-center text-sm text-gray-400">
              Tidak ada karyawan yang memenuhi aturan beda departemen/bagian pada filter ini. Coba departemen atau unit usaha lain.
            </p>
          )}
        </div>
        {candidates.length > CANDIDATES_PER_PAGE && (
          <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev Page
            </button>
            <span className="text-xs font-semibold text-gray-600">
              Halaman {safePage} dari {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next Page
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <aside className="flex flex-col rounded-2xl border bg-white p-6 shadow-sm xl:sticky xl:top-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Pemberi Feedback Terpilih</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              selected.length === 3
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {selected.length} / 3
          </span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Tepat tiga karyawan wajib dipilih.
        </p>
        <div className="mt-4 space-y-2">
          {selected.length ? (
            selected.map((person, index) => (
              <div
                key={person.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">
                    {index + 1}
                  </span>
                  <EmployeeBadge person={person} />
                </div>
                <button
                  onClick={() => onRemove(person.id)}
                  className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              Belum ada pemberi feedback dipilih.
            </p>
          )}
        </div>
        {/* Tombol Kirim Nominasi tepat di bawah daftar nama terpilih + info tooltip saat disorot */}
        <div className="relative group mt-4">
          <button
            type="button"
            disabled={!canSubmitNomination}
            onClick={onConfirm}
            title={submitTooltipText}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#1A284F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#131d3b] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            Kirim Nominasi
            <Info className="h-3.5 w-3.5 opacity-75" />
          </button>
          <div
            role="tooltip"
            className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-xl bg-[#1A284F] px-3 py-2 text-[11px] font-medium leading-relaxed text-white shadow-xl z-20 text-center"
          >
            {submitTooltipText}
          </div>
        </div>
        {!enabled && (
          <p className="mt-3 text-center text-xs text-amber-700">
            Nominasi dibuka hanya selama periode penerimaan feedback.
          </p>
        )}
      </aside>
    </section>
  )
}

function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass + " mt-1 normal-case font-medium"}
      >
        <option value="">Semua {label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function TaskInbox({
  actor,
  tasks,
  enabled,
  onDone,
  onError,
}: {
  actor: FeedbackPerson
  tasks: FeedbackTask[]
  enabled: boolean
  onDone: () => void
  onError: (message: string) => void
}) {
  const [selectedTask, setSelectedTask] = useState<FeedbackTask | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [confirmSend, setConfirmSend] = useState(false)
  const pending = tasks.filter((task) => task.nomination.status === "Pending")
  function open(task: FeedbackTask) {
    setSelectedTask(task)
    setAnswers({})
    setConfirmSend(false)
  }
  function submit() {
    if (!selectedTask) return
    try {
      submitNominatedFeedback(
        actor.id,
        selectedTask.submission.row.employeeId,
        answers,
      )
      setConfirmSend(false)
      setSelectedTask(null)
      onDone()
    } catch (failure) {
      setConfirmSend(false)
      onError(
        failure instanceof Error ? failure.message : "Feedback gagal dikirim.",
      )
    }
  }
  return (
    <section className="space-y-5">
      <AnonymityBanner />
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[#1A284F]">Tugas Feedback Saya</h2>
            <p className="mt-1 text-sm text-gray-500">
              Anda dipilih oleh rekan kerja untuk memberi feedback terhadap
              kinerjanya.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold border ${
              pending.length > 0
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : tasks.length > 0
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-[#1A284F]/10 border-transparent text-[#1A284F]"
            }`}
          >
            {tasks.length > 0 && (
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  pending.length > 0 ? "bg-amber-300" : "bg-emerald-400"
                }`}
              />
            )}
            {pending.length > 0 ? `${pending.length} pending` : tasks.length > 0 ? "Semua selesai" : "0 tugas"}
          </span>
        </div>
        {!tasks.length ? (
          <p className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">
            Belum ada permintaan feedback yang ditujukan kepada Anda.
          </p>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.submission.row.no}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
                  task.nomination.status === "Submitted"
                    ? "border-emerald-200/80 bg-emerald-50/40"
                    : "border-amber-200/80 bg-amber-50/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      task.nomination.status === "Submitted"
                        ? "bg-emerald-400 ring-2 ring-emerald-100"
                        : "bg-amber-300 ring-2 ring-amber-100"
                    }`}
                  />
                  <div>
                    <p className="font-semibold text-gray-900">
                      {task.submission.row.name}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {task.submission.row.position} ·{" "}
                      {task.submission.row.department} ·{" "}
                      {task.submission.row.companyUnit}
                    </p>
                  </div>
                </div>
                {task.nomination.status === "Submitted" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Sudah dikirim
                  </span>
                ) : (
                  <button
                    disabled={!enabled}
                    onClick={() => open(task)}
                    className="rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Isi Feedback
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedTask && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                Berikan feedback untuk
              </p>
              <h2 className="mt-1 text-xl font-bold text-[#1A284F]">
                {selectedTask.submission.row.name}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedTask.submission.row.position} ·{" "}
                {selectedTask.submission.row.division}
              </p>
            </div>
            <button
              onClick={() => setSelectedTask(null)}
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <AnonymityBanner />
          <div className="mt-6 space-y-5">
            {FEEDBACK_INDICATORS.map((indicator, index) => (
              <label key={indicator.key} className="block">
                <span className="mb-2 flex gap-2 text-sm font-semibold text-gray-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A284F] text-xs text-white">
                    {index + 1}
                  </span>
                  {indicator.label}
                </span>
                <textarea
                  rows={4}
                  value={answers[indicator.key] ?? ""}
                  onChange={(event) =>
                    setAnswers({
                      ...answers,
                      [indicator.key]: event.target.value,
                    })
                  }
                  className={inputClass + " resize-none"}
                  placeholder="Tuliskan feedback profesional dan spesifik..."
                />
              </label>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-3 border-t pt-5">
            <button
              onClick={() => setSelectedTask(null)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Batal
            </button>
            <button
              disabled={
                !enabled ||
                FEEDBACK_INDICATORS.some(
                  (indicator) => !answers[indicator.key]?.trim(),
                )
              }
              onClick={() => setConfirmSend(true)}
              className="rounded-lg bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Kirim Feedback Anonim
            </button>
          </div>
        </section>
      )}
      {confirmSend && selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setConfirmSend(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-[#1A284F]">
              Konfirmasi Kirim Feedback
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Kirim feedback anonim untuk <strong>{selectedTask.submission.row.name}</strong>? Setelah dikirim, jawaban feedback tidak dapat diubah kembali.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSend(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submit}
                className="rounded-xl bg-[#1A284F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#131d3b]"
              >
                Ya, Kirim Feedback
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function ReceivedPanel({
  actor,
  workflow,
  approvalOpen,
  onDone,
  onError,
}: {
  actor: FeedbackPerson
  workflow: ReturnType<typeof getFeedbackSubmission>
  approvalOpen: boolean
  onDone: () => void
  onError: (message: string) => void
}) {
  const [summaries, setSummaries] = useState<Record<string, string>>(
    () => workflow?.summaries ?? {},
  )
  const [active, setActive] = useState(0)
  useEffect(() => {
    setSummaries(workflow?.summaries ?? {})
    setActive(0)
  }, [workflow?.row.no, workflow?.summarySubmittedAt])
  if (!workflow)
    return (
      <section className="rounded-2xl border border-dashed bg-white p-10 text-center">
        <Users className="mx-auto h-8 w-8 text-gray-300" />
        <h2 className="mt-3 font-bold text-gray-700">
          Belum ada feedback diterima
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Pilih tepat tiga pemberi feedback terlebih dahulu.
        </p>
      </section>
    )
  const complete = workflow.feedbacks.length === 3
  const submitted = !!workflow.summarySubmittedAt
  const allFilled =
    complete &&
    workflow.feedbacks.every((feedback) =>
      FEEDBACK_INDICATORS.every((indicator) =>
        summaries[`${feedback.id}-${indicator.key}`]?.trim(),
      ),
    )
  const feedback = workflow.feedbacks[active]
  function submit() {
    try {
      submitFeedbackSummary(actor.id, summaries)
      onDone()
    } catch (failure) {
      onError(
        failure instanceof Error ? failure.message : "Summary gagal disubmit.",
      )
    }
  }
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-[#1A284F]">Feedback Diterima</h2>
            <p className="mt-1 text-sm text-gray-500">
              Identitas pemberi disembunyikan. Anda melihat unit dan divisinya
              untuk konteks kolaborasi.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold ${
              complete
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                complete ? "bg-emerald-400" : "bg-amber-300"
              }`}
            />
            {submitted
              ? "Summary disubmit (Feedback lengkap)"
              : `${workflow.feedbacks.length}/3 feedback diterima`}
          </span>
        </div>
        {!complete && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Menunggu {3 - workflow.feedbacks.length} feedback lagi. Summary
            dapat diisi setelah tiga feedback diterima.
          </div>
        )}
      </div>
      {complete && feedback && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {workflow.feedbacks.map((entry, index) => (
              <button
                key={entry.id}
                onClick={() => setActive(index)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${
                  active === index
                    ? "bg-[#1A284F] text-white"
                    : "border bg-white text-gray-600"
                }`}
              >
                Feedback {index + 1} · {entry.division}
              </button>
            ))}
          </div>
          <article className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <header className="border-b bg-gray-50 px-6 py-4">
              <h3 className="font-bold text-gray-900">
                Feedback {active + 1} · {feedback.division} ·{" "}
                {feedback.companyUnit}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Pemberi feedback anonim
              </p>
            </header>
            <div className="space-y-4 p-6">
              {FEEDBACK_INDICATORS.map((indicator, index) => {
                const key = `${feedback.id}-${indicator.key}`
                return (
                  <div
                    key={indicator.key}
                    className="rounded-xl border border-gray-100 p-4"
                  >
                    <p className="text-sm font-semibold text-gray-800">
                      {index + 1}. {indicator.label}
                    </p>
                    <div className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-gray-800">
                      {feedback.answers[indicator.key]}
                    </div>
                    <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-gray-500">
                      Summary / Catatan Penerima{!submitted && " *"}
                      {submitted ? (
                        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm normal-case tracking-normal text-gray-700">
                          {summaries[key]}
                        </p>
                      ) : (
                        <textarea
                          rows={2}
                          value={summaries[key] ?? ""}
                          onChange={(event) =>
                            setSummaries({
                              ...summaries,
                              [key]: event.target.value,
                            })
                          }
                          className={
                            inputClass +
                            " mt-2 resize-none normal-case tracking-normal"
                          }
                          placeholder="Tuliskan ringkasan atau tindak lanjut pribadi..."
                        />
                      )}
                    </label>
                  </div>
                )
              })}
            </div>
          </article>
          {!submitted && (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="font-bold text-gray-900">
                Submit Summary Feedback
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Summary yang lengkap diteruskan kepada Approver 1 lalu Approver
                2 untuk tindak lanjut.
              </p>
              <button
                disabled={!approvalOpen || !allFilled}
                onClick={submit}
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#1A284F] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                Submit Summary untuk Approval
              </button>
              {!approvalOpen && (
                <p className="mt-2 text-xs text-amber-700">
                  Submission summary tersedia selama periode aktif mulai nominasi hingga akhir summary & approval.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  )
}

function FollowUpSectionCard({
  title,
  approverName,
  items,
  accent,
}: {
  title: string
  approverName: string
  items?: FeedbackFollowUp[]
  accent: "indigo" | "teal"
}) {
  const done = Boolean(items && items.length > 0)
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header
        className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${
          accent === "indigo" ? "bg-[#1A284F] text-white" : "bg-teal-800 text-white"
        }`}
      >
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-xs text-white/75">{approverName}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            done
              ? "bg-emerald-100 text-emerald-900"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              done ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {done ? "Sudah Ditindaklanjuti" : "Menunggu Tindak Lanjut"}
        </span>
      </header>
      <div className="p-6">
        {!done ? (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
            Belum ada hasil tindak lanjut dari {title}.
          </p>
        ) : (
          <div className="space-y-4">
            {items!.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-100 bg-slate-50/60 p-4 space-y-3"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-[#1A284F]">
                  Rencana Tindak Lanjut #{idx + 1}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {FOLLOW_UP_COLUMNS.map((col) => (
                    <div
                      key={col}
                      className="rounded-lg border border-gray-200/80 bg-white p-3"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                        {col}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                        {item[col] || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function FollowUpResultPanel({
  workflow,
  ap1Name,
  ap2Name,
  hasSecondApprover,
}: {
  workflow: ReturnType<typeof getFeedbackSubmission>
  ap1Name: string
  ap2Name: string
  hasSecondApprover: boolean
}) {
  if (!workflow || !workflow.summarySubmittedAt) {
    return (
      <section className="rounded-2xl border border-dashed bg-white p-10 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-gray-300" />
        <h2 className="mt-3 font-bold text-gray-700">
          Tindak Lanjut Belum Tersedia
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Hasil tindak lanjut dari Approver 1 dan Approver 2 akan muncul setelah Anda melengkapi dan men-submit Summary pada tab Feedback Diterima.
        </p>
      </section>
    )
  }
  return (
    <section className="space-y-5">
      <FollowUpSectionCard
        title="Tindak Lanjut Approver 1"
        approverName={ap1Name}
        items={workflow.followUps.approver1}
        accent="indigo"
      />
      {hasSecondApprover && (
        <FollowUpSectionCard
          title="Tindak Lanjut Approver 2"
          approverName={ap2Name}
          items={workflow.followUps.approver2}
          accent="teal"
        />
      )}
    </section>
  )
}
