import { useState, useEffect } from "react";
import { MessageSquare, CheckCircle2, Calendar, X, Eye, Building2, ClipboardEdit, Save, AlertCircle, Info } from "lucide-react";
import { getEntries, subscribe, updateEntry, type ScheduleEntry } from "../interviewScheduleStore";
import { NAME_TO_EMP_ID, setPenilai1Score } from "../managementInterviewScoreStore";
import { setMIPenilaiResult } from "../managementInterviewResultStore";
import { loadPersistedState, mergeKvMapRecord, savePersistedState } from "../../../services/supabaseClient";
import { getActiveUser, loadManagedUsers, resolveEffectiveUserGrouping, type ManagedUser } from "../../../store/authStore";
import { getModuleWeightFraction } from "../../shared/scoringWeightStore";
import { getLiveTransactionalEmployees, type Employee } from "../../../data/mockEmployees";
import { Award, Sparkles } from "lucide-react";

function isUserAppointedInterviewer(user: ManagedUser, interviewers: string[]): boolean {
  if (!user || !Array.isArray(interviewers) || interviewers.length === 0) return false;
  const uName = (user.name ?? "").trim().toLowerCase();
  const uId = (user.employeeId ?? "").trim().toLowerCase();
  return interviewers.some((raw) => {
    const item = (raw ?? "").trim().toLowerCase();
    if (!item) return false;
    if (uName && (item === uName || item.includes(uName) || uName.includes(item))) return true;
    if (uId && (item === uId || item.includes(uId))) return true;
    return false;
  });
}

const TEAM_UNIT = "PT. RSUP (Industri)";
const TEAM_DIV  = "Divisi Sumber Daya Manusia";

const SCHED_STATUS_STYLE = {
  Scheduled: { bg: "bg-blue-100 text-blue-700",   icon: Calendar },
  Cancelled: { bg: "bg-red-100 text-red-600",      icon: X },
  Done:      { bg: "bg-green-100 text-green-700",  icon: CheckCircle2 },
};

// ── Assessment aspects ─────────────────────────────────────────────────────────
const ASPECTS = [
  {
    no: 1,
    title: "Kewajaran Hasil Kinerja",
    description: "Menilai apakah hasil/grade yang disampaikan mencerminkan pencapaian dan kondisi aktual divisi/tim",
    indicators: [
      { score: 1, text: "Hasil tidak mencerminkan pencapaian aktual." },
      { score: 2, text: "Terdapat beberapa ketidaksesuaian yang memerlukan klarifikasi." },
      { score: 3, text: "Hasil secara umum sesuai dengan pencapaian aktual." },
      { score: 4, text: "Hasil konsisten dengan pencapaian aktual." },
      { score: 5, text: "Hasil sangat konsisten dengan pencapaian aktual dan kondisi kinerja." },
    ],
  },
  {
    no: 2,
    title: "Justifikasi & Evidence",
    description: "Menilai kemampuan Kepala Divisi untuk dapat menjelaskan dasar penilaian dan memberikan evidence yang memadai",
    indicators: [
      { score: 1, text: "Tidak terdapat justifikasi/evidence yang memadai." },
      { score: 2, text: "Justifikasi/evidence masih terbatas dan membutuhkan klarifikasi." },
      { score: 3, text: "Justifikasi dan evidence cukup untuk mendukung hasil." },
      { score: 4, text: "Justifikasi jelas dan didukung evidence yang memadai." },
      { score: 5, text: "Justifikasi sangat jelas dan didukung evidence yang lengkap dan relevan." },
    ],
  },
  {
    no: 3,
    title: "Improvement & Follow Up",
    description: "Menilai apakah tindakan/usulan perbaikan atas hasil pencapaian kinerja jelas, sesuai dan dapat ditindaklanjuti",
    indicators: [
      { score: 1, text: "Tidak terdapat follow-up yang memadai." },
      { score: 2, text: "Follow-up masih umum dan belum jelas." },
      { score: 3, text: "Memiliki follow-up untuk area utama yang perlu diperbaiki." },
      { score: 4, text: "Memiliki follow-up yang jelas dan relevan." },
      { score: 5, text: "Memiliki follow up yang sangat jelas, konkret, terukur, dan relevan dengan hasil evaluasi." },
    ],
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParticipantScore {
  name: string;
  employeeId?: string;
  aspectScores: (number | null)[];  // 3 elements, each 1–5 or null
  comment: string;
}

const PARTICIPANT_META: Record<string, { position: string; division: string }> = {
  "Andi Pratama": { position: "Manager Divisi", division: "Coconut Production" },
  "Siti Rahayu":  { position: "Manager Divisi", division: "Logistik & Material" },
};

// ── Persistent assessment store (synced to Supabase backend) ──────────────────
const MI_SUP_ASSESSMENTS_KEY = "pa_mi_supervisor_assessments_v1";
function loadSavedAssessmentsMap(): Record<string, ParticipantScore[]> {
  return loadPersistedState<Record<string, ParticipantScore[]>>(MI_SUP_ASSESSMENTS_KEY, {});
}

function resolveParticipantUser(name: string, companyHint?: string, empIdHint?: string): ManagedUser | undefined {
  const users = loadManagedUsers();
  if (empIdHint) {
    const byId = users.find((u) => u.employeeId.trim().toLowerCase() === empIdHint.trim().toLowerCase());
    if (byId) return byId;
  }
  const lcName = name.trim().toLowerCase();
  return (
    users.find((u) => u.name.trim().toLowerCase() === lcName && (!companyHint || u.company === companyHint)) ??
    users.find((u) => u.name.trim().toLowerCase() === lcName)
  );
}

function getParticipantMIWeightFraction(name: string, companyUnit: string, empIdHint?: string): number {
  const user = resolveParticipantUser(name, companyUnit, empIdHint);
  const company = user?.company || companyUnit || "PT RSUP (Industry)";
  const grouping = user ? resolveEffectiveUserGrouping(user) : "Ka./Wa.Ka.Div ke atas";
  const w = getModuleWeightFraction(company, grouping, "Management Interview", 0.1);
  return w > 0 ? w : 0.1;
}

// ── Warna skor & tag PA Score ─────────────────────────────────────────────────
const SCORE_TONE: Record<number, string> = {
  1: "bg-rose-500 border-rose-500",
  2: "bg-orange-500 border-orange-500",
  3: "bg-amber-500 border-amber-500",
  4: "bg-sky-600 border-sky-600",
  5: "bg-emerald-600 border-emerald-600",
};

function findPAEmployee(name: string): Employee | undefined {
  const users = loadManagedUsers();
  const u = users.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
  const list = getLiveTransactionalEmployees();
  return list.find((e) => (u && e.id.toLowerCase() === u.employeeId.toLowerCase()) || e.fullName.trim().toLowerCase() === name.trim().toLowerCase());
}

const PA_GRADE_TONE: Record<string, string> = {
  "A+": "bg-violet-50 text-violet-700 border-violet-200",
  A: "bg-sky-50 text-sky-700 border-sky-200",
  B: "bg-emerald-50 text-emerald-700 border-emerald-200",
  C: "bg-amber-50 text-amber-700 border-amber-200",
  D: "bg-orange-50 text-orange-700 border-orange-200",
  E: "bg-rose-50 text-rose-700 border-rose-200",
};

/** Tag PA Score di samping nama peserta; klik → popup summary score & grade semua modul. */
function PAScoreTag({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const emp = findPAEmployee(name);
  const tone = emp ? PA_GRADE_TONE[emp.grade] ?? "bg-gray-50 text-gray-600 border-gray-200" : "bg-gray-50 text-gray-500 border-gray-200";
  const formAvg = emp ? Math.round((emp.formA.score + emp.formB.score + emp.formC.score) / 3) : 0;
  const rows: Array<[string, { score: number; grade: string } | null | undefined]> = emp
    ? [
        [`KPI${emp.kpiIsYtd ? " (YTD)" : ""}`, emp.kpi],
        ["SMART Goals", emp.smartGoals],
        ["Appraisal Form", { score: formAvg, grade: emp.formA.grade }],
        ["Managerial Skill", emp.managerialSkill],
        ["Project Outside Job Scope", emp.project],
        ["Management Interview", emp.managementInterview],
      ]
    : [];
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition hover:shadow-sm ${tone}`}
      >
        <Award className="h-3 w-3" />
        PA Score {emp ? `${emp.totalScore.toFixed(1)} · ${emp.grade}` : "—"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-sky-500 px-5 py-4 text-white">
              <div>
                <p className="text-xs text-white/80">Summary Performance Appraisal 2026</p>
                <p className="font-bold">{name}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            {!emp ? (
              <p className="p-6 text-center text-sm text-gray-400">Belum ada data skor PA untuk karyawan ini.</p>
            ) : (
              <div className="space-y-2 p-5">
                {rows.filter(([, v]) => v).map(([label, v]) => (
                  <div key={label} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm">
                    <span className="text-gray-700">{label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{v!.score}</span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${PA_GRADE_TONE[v!.grade] ?? "border-gray-200 text-gray-500"}`}>{v!.grade}</span>
                    </span>
                  </div>
                ))}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-[#1A284F] px-4 py-3 text-white">
                  <span className="text-sm font-semibold">Total PA Score</span>
                  <span className="text-lg font-bold">{emp.totalScore.toFixed(1)} · {emp.grade}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Indicator popover ─────────────────────────────────────────────────────────
function IndicatorPopover({ aspect, onClose }: { aspect: typeof ASPECTS[number]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 bg-[#1A284F] rounded-t-2xl">
          <div>
            <p className="font-bold text-white text-sm">{aspect.title}</p>
            <p className="text-[11px] text-blue-200 mt-0.5">Indikator Penilaian</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-2">
          {aspect.indicators.map(ind => (
            <div key={ind.score} className="flex gap-3 items-start">
              <span className="shrink-0 w-6 h-6 rounded-full bg-[#1A284F] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {ind.score}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{ind.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Confirmation dialog ────────────────────────────────────────────────────────
function ConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">Konfirmasi Submit Penilaian</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Pastikan semua nilai sudah benar sebelum di-submit. Nilai yang sudah di-submit dapat dilihat kembali namun tidak dapat diubah.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">
            Kembali
          </button>
          <button onClick={onConfirm} className="flex items-center gap-1.5 px-5 py-2 bg-[#1A284F] text-white text-sm font-semibold rounded-lg hover:bg-[#243660] transition-colors">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ya, Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Per-participant aspect table ───────────────────────────────────────────────
function ParticipantTable({
  ps, pIdx, isSubmitted, companyUnit,
  onScoreChange, onCommentChange,
}: {
  ps: ParticipantScore;
  pIdx: number;
  isSubmitted: boolean;
  companyUnit: string;
  onScoreChange: (pIdx: number, aIdx: number, val: number) => void;
  onCommentChange: (pIdx: number, val: string) => void;
}) {
  const [indicatorAspect, setIndicatorAspect] = useState<typeof ASPECTS[number] | null>(null);
  const matchedUser = resolveParticipantUser(ps.name, companyUnit, ps.employeeId);
  const weightFraction = getParticipantMIWeightFraction(ps.name, companyUnit, ps.employeeId);
  const weightPctLabel = Math.round(weightFraction * 100);

  const filledScores = ps.aspectScores.filter(s => s !== null) as number[];
  const avg = filledScores.length > 0
    ? filledScores.reduce((a, b) => a + b, 0) / filledScores.length
    : null;
  const scorePercent = avg !== null ? (avg / 5) * 100 : null;
  const weightedFinalScore = scorePercent !== null ? scorePercent * weightFraction : null;
  const allAspectsFilled = filledScores.length === ASPECTS.length;

  const scoreColor = (v: number | null) => {
    if (v === null) return "";
    if (v >= 4.5) return "bg-green-100 text-green-700";
    if (v >= 3.5) return "bg-blue-100 text-blue-700";
    if (v >= 2.5) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-600";
  };

  return (
    <>
      <div className={`rounded-xl border overflow-hidden ${isSubmitted ? "border-gray-200" : "border-gray-200"}`}>
        {/* Participant header */}
        <div className={`flex items-center justify-between px-4 py-3 ${isSubmitted ? "bg-gray-100" : "bg-gradient-to-r from-indigo-50 via-sky-50 to-emerald-50"}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-sm">
              {ps.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-800 leading-tight">
                {ps.name}
                <PAScoreTag name={ps.name} />
              </p>
              {(matchedUser || PARTICIPANT_META[ps.name]) && (
                <p className="text-[11px] text-gray-400 leading-tight">
                  {matchedUser?.position ?? PARTICIPANT_META[ps.name]?.position}
                  <span className="mx-1 text-gray-300">·</span>
                  {matchedUser?.division ?? PARTICIPANT_META[ps.name]?.division}
                </p>
              )}
            </div>
          </div>
          {avg !== null && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${scoreColor(avg)}`}>
                Avg {avg.toFixed(2)} · {scorePercent?.toFixed(2)}%
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#1A284F] text-white">
                Skor Akhir (×{weightPctLabel}%): {weightedFinalScore?.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Aspect table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#1A284F] text-white text-xs">
                <th className="px-4 py-3 text-center font-semibold w-12 border-r border-white/10" rowSpan={2}>No</th>
                <th className="px-5 py-3 text-left font-semibold min-w-[280px] border-r border-white/10" rowSpan={2}>Aspek Penilaian</th>
                <th className="px-5 py-3 text-center font-semibold whitespace-nowrap min-w-[200px] border-r border-white/10" rowSpan={2}>Indikator Penilaian</th>
                <th colSpan={5} className="px-4 py-2 text-center font-semibold border-b border-white/20">Penilaian Management</th>
              </tr>
              <tr className="bg-[#1A284F] text-white text-xs">
                {[1, 2, 3, 4, 5].map(n => (
                  <th key={n} className="px-4 py-2 text-center font-semibold w-16 border-r border-white/10 last:border-r-0">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ASPECTS.map((aspect, aIdx) => {
                const selected = ps.aspectScores[aIdx];
                return (
                  <tr key={aspect.no} className={`border-t border-gray-200 ${aIdx % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}>
                    <td className="px-4 py-4 text-center text-gray-500 font-semibold text-sm border-r border-gray-200">{aspect.no}</td>
                    <td className="px-5 py-4 border-r border-gray-200">
                      <p className="font-semibold text-gray-800 text-sm leading-snug">{aspect.title}</p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{aspect.description}</p>
                    </td>
                    <td className="px-5 py-4 text-center border-r border-gray-200">
                      <button
                        onClick={() => setIndicatorAspect(aspect)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1A284F]/30 text-[#1A284F] text-[11px] font-semibold hover:bg-[#1A284F]/5 transition-colors whitespace-nowrap"
                      >
                        <Info className="w-3 h-3" />
                        Lihat Indikator Penilaian
                      </button>
                    </td>
                    {[1, 2, 3, 4, 5].map(val => (
                      <td key={val} className="px-3 py-4 text-center border-r border-gray-200 last:border-r-0">
                        <div className="group/score relative inline-block">
                        <span
                          role="tooltip"
                          className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl bg-[#1A284F] px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover/score:visible group-hover/score:opacity-100 group-focus-within/score:visible group-focus-within/score:opacity-100"
                        >
                          <strong className="mr-1">Nilai {val}:</strong>{aspect.indicators.find((ind) => ind.score === val)?.text}
                        </span>
                        <button
                          onClick={() => !isSubmitted && onScoreChange(pIdx, aIdx, val)}
                          disabled={isSubmitted}
                          className={`w-9 h-9 rounded border-2 text-sm font-bold transition-all mx-auto flex items-center justify-center
                            ${selected === val
                              ? `${SCORE_TONE[val]} text-white shadow-md scale-105`
                              : isSubmitted
                                ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed"
                                : "bg-white border-gray-300 text-gray-500 hover:border-[#1A284F] hover:text-[#1A284F] hover:bg-[#1A284F]/5 cursor-pointer"
                            }`}
                        >
                          {val}
                        </button>
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Nilai Rata-Rata row */}
              <tr className="border-t-2 border-[#1A284F]/20 bg-[#1A284F]/5">
                <td colSpan={3} className="px-5 py-3 text-center text-sm font-bold text-[#1A284F] border-r border-[#1A284F]/10">
                  Nilai Assessment (Konversi % &amp; × Bobot Management Interview {weightPctLabel}%)
                </td>
                <td colSpan={5} className="px-5 py-3 text-center">
                  {avg !== null ? (
                    <div className="inline-flex flex-wrap items-center justify-center gap-2">
                      <span className={`inline-block text-xs font-bold px-3.5 py-1 rounded-full ${allAspectsFilled ? scoreColor(avg) : "bg-amber-100 text-amber-700"}`}>
                        Rata-rata {avg.toFixed(2)} / 5.00 → {scorePercent?.toFixed(2)}%
                        {!allAspectsFilled && <span className="ml-1 font-normal">(parsial)</span>}
                      </span>
                      <span className="inline-block text-xs font-bold px-3.5 py-1 rounded-full bg-emerald-600 text-white">
                        {scorePercent?.toFixed(2)}% × {weightPctLabel}% = {weightedFinalScore?.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm italic">—</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comment */}
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-white">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Komentar & Catatan Management
          </label>
          <textarea
            rows={2}
            value={ps.comment}
            onChange={e => onCommentChange(pIdx, e.target.value)}
            disabled={isSubmitted}
            placeholder="Tulis komentar atau catatan management untuk participant ini..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] focus:ring-1 focus:ring-[#1A284F]/20 resize-none bg-white placeholder-gray-300 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {indicatorAspect && (
        <IndicatorPopover aspect={indicatorAspect} onClose={() => setIndicatorAspect(null)} />
      )}
    </>
  );
}

// ── Assessment modal ───────────────────────────────────────────────────────────
function AssessmentModal({
  entry,
  readOnly = false,
  onSubmitted,
  onClose,
}: {
  entry: ScheduleEntry;
  readOnly?: boolean;
  onSubmitted?: () => void;
  onClose: () => void;
}) {
  // Peserta yang dinilai hanya karyawan pada field Employee (Other User bukan peserta assessment)
  const allParticipants = [...entry.addedUsers];
  const initialSavedMap = loadSavedAssessmentsMap();

  const [scores, setScores] = useState<ParticipantScore[]>(() => {
    const existing = initialSavedMap[entry.id];
    return allParticipants.map((name, idx) => {
      const empIdHint = entry.addedUserIds?.[idx];
      const u = resolveParticipantUser(name, entry.companyUnit, empIdHint);
      const prev = existing?.find((s) => s.name === name);
      return prev
        ? { ...prev, employeeId: prev.employeeId ?? u?.employeeId ?? empIdHint, aspectScores: [...prev.aspectScores] }
        : { name, employeeId: u?.employeeId ?? empIdHint, aspectScores: [null, null, null], comment: "" };
    });
  });

  // per-participant saved flags (saved ≠ submitted — saved means locally confirmed per tab)
  const [savedFlags, setSavedFlags] = useState<boolean[]>(() => {
    const existing = initialSavedMap[entry.id];
    return allParticipants.map((name) =>
      existing?.find((s) => s.name === name)?.aspectScores.every((v) => v !== null) ?? false
    );
  });

  const [activeTab, setActiveTab]   = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(() => Boolean(initialSavedMap[entry.id]));
  const [showConfirm, setShowConfirm] = useState(false);
  const effectiveReadOnly = isSubmitted || readOnly;

  function handleScoreChange(pIdx: number, aIdx: number, val: number) {
    if (effectiveReadOnly) return;
    setScores(prev => prev.map((ps, i) => {
      if (i !== pIdx) return ps;
      const next = [...ps.aspectScores];
      next[aIdx] = val;
      return { ...ps, aspectScores: next };
    }));
    // unsave this participant when they change a score
    setSavedFlags(prev => prev.map((f, i) => i === pIdx ? false : f));
  }

  function handleCommentChange(pIdx: number, val: string) {
    if (effectiveReadOnly) return;
    setScores(prev => prev.map((ps, i) => i === pIdx ? { ...ps, comment: val } : ps));
    setSavedFlags(prev => prev.map((f, i) => i === pIdx ? false : f));
  }

  function handleSaveParticipant(pIdx: number) {
    setSavedFlags(prev => prev.map((f, i) => i === pIdx ? true : f));
    // advance to next unsaved tab automatically
    const nextUnsaved = scores.findIndex((_, i) => i > pIdx && !savedFlags[i]);
    if (nextUnsaved !== -1) setActiveTab(nextUnsaved);
  }

  function handleConfirm() {
    const managedUsers = loadManagedUsers();
    const normalizedScores: ParticipantScore[] = scores.map((s, idx) => {
      const matchedUser =
        resolveParticipantUser(s.name, entry.companyUnit, s.employeeId ?? entry.addedUserIds?.[idx]) ??
        managedUsers.find((u) => u.name.toLowerCase() === s.name.toLowerCase());
      const resolvedId = matchedUser?.employeeId ?? s.employeeId ?? entry.addedUserIds?.[idx] ?? NAME_TO_EMP_ID[s.name];
      return { ...s, employeeId: resolvedId, aspectScores: [...s.aspectScores] };
    });
    const latestMap = { ...loadSavedAssessmentsMap(), [entry.id]: normalizedScores };
    savePersistedState(MI_SUP_ASSESSMENTS_KEY, latestMap, {
      kind: "kv-state",
      stateKey: MI_SUP_ASSESSMENTS_KEY,
      stateValue: latestMap,
      audit: {
        action: "Update",
        module: "Management Interview",
        subModule: "Interview Assessment",
        description: `Submitted Management Interview assessment for schedule ${entry.id}`,
      },
    });
    void mergeKvMapRecord(MI_SUP_ASSESSMENTS_KEY, entry.id, normalizedScores);
    // Write Score Penilai 1 to shared store for each participant
    normalizedScores.forEach(ps => {
      const empId = ps.employeeId ?? NAME_TO_EMP_ID[ps.name];
      if (!empId) return;
      const filled = ps.aspectScores.filter((s): s is number => s !== null);
      if (filled.length === 0) return;
      const avg = filled.reduce((a, b) => a + b, 0) / filled.length;
      setPenilai1Score(empId, avg);
      const criterionMap: Record<number, number> = {};
      ps.aspectScores.forEach((sc, idx) => {
        if (sc !== null) criterionMap[idx + 1] = sc;
      });
      setMIPenilaiResult(empId, 1, criterionMap, "", ps.comment);
    });
    updateEntry(entry.id, { status: "Done" });
    setIsSubmitted(true);
    setShowConfirm(false);
    onSubmitted?.();
    window.dispatchEvent(new Event("appraisal-updated"));
  }

  const allParticipantsSaved = savedFlags.every(Boolean) && scores.every(ps => ps.aspectScores.every(s => s !== null));
  const savedCount = savedFlags.filter(Boolean).length;

  const ps = scores[activeTab];
  const filledScores = ps?.aspectScores.filter(s => s !== null) as number[] ?? [];
  const tabAllFilled = ps?.aspectScores.every(s => s !== null) ?? false;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[95vh]">

          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#1A284F] via-indigo-700 to-sky-600 rounded-t-2xl shrink-0">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <ClipboardEdit className="w-4 h-4" />
                Penilaian Management Interview
              </h3>
              <p className="text-xs text-blue-200 mt-0.5">{entry.companyUnit} · {entry.scheduledDate} · {entry.scheduledTime}</p>
            </div>
            <div className="flex items-center gap-2">
              {readOnly && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-200 text-[11px] font-semibold border border-amber-300/30">
                  <Eye className="w-3 h-3" />Read-Only (Bukan Interviewer Terpilih)
                </span>
              )}
              {isSubmitted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/20 text-green-200 text-[11px] font-semibold border border-green-300/30">
                  <CheckCircle2 className="w-3 h-3" />Submitted
                </span>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {readOnly && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 shrink-0">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Mode Read-Only:</strong> Role Anda diizinkan membuka menu Management Interview, namun penilaian hanya dapat diberikan oleh <strong>Interviewer yang ditunjuk</strong> pada jadwal ini (<strong>{entry.interviewers.join(", ") || "—"}</strong>).
              </p>
            </div>
          )}

          {/* Submitted banner */}
          {isSubmitted && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2 shrink-0">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-700 font-medium">
                Penilaian telah di-submit. Nilai tidak dapat diubah kembali.
              </p>
            </div>
          )}

          {allParticipants.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-16">
              Tidak ada participants terdaftar untuk jadwal ini.
            </div>
          ) : (
            <>
              {/* Participant tabs */}
              <div className="shrink-0 px-6 pt-4 flex items-center gap-2 border-b border-gray-100">
                {scores.map((ps, idx) => {
                  const isSaved   = savedFlags[idx];
                  const isActive  = activeTab === idx;
                  const pFilled   = ps.aspectScores.every(s => s !== null);
                  return (
                    <button
                      key={ps.name}
                      onClick={() => setActiveTab(idx)}
                      className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors whitespace-nowrap ${
                        isActive
                          ? "bg-white border-gray-200 text-[#1A284F] -mb-px z-10"
                          : "bg-gray-50 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        isActive ? "bg-[#1A284F] text-white" : "bg-gray-200 text-gray-500"
                      }`}>
                        {ps.name.charAt(0).toUpperCase()}
                      </div>
                      <span>{ps.name}</span>
                      {isSaved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : pFilled ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
                <div className="ml-auto pb-1 text-xs text-gray-400">
                  {savedCount} / {scores.length} tersimpan
                </div>
              </div>

              {/* Active participant table */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                {ps && (
                  <ParticipantTable
                    key={ps.name}
                    ps={ps}
                    pIdx={activeTab}
                    isSubmitted={effectiveReadOnly}
                    companyUnit={entry.companyUnit}
                    onScoreChange={handleScoreChange}
                    onCommentChange={handleCommentChange}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-2xl">
                <div className="flex items-center gap-2">
                  <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">
                    {effectiveReadOnly ? "Close" : "Cancel"}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {/* Per-participant Save */}
                  {!effectiveReadOnly && (
                    <button
                      onClick={() => handleSaveParticipant(activeTab)}
                      disabled={!tabAllFilled || savedFlags[activeTab]}
                      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        savedFlags[activeTab]
                          ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                          : tabAllFilled
                            ? "bg-white border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5"
                            : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                      }`}
                    >
                      {savedFlags[activeTab]
                        ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved</>
                        : <><Save className="w-3.5 h-3.5" />Save</>
                      }
                    </button>
                  )}

                  {/* Submit all */}
                  {!effectiveReadOnly && (
                    <div className="group/submit relative">
                      <button
                        onClick={() => allParticipantsSaved && setShowConfirm(true)}
                        aria-disabled={!allParticipantsSaved}
                        className={`flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-[#1A284F] to-indigo-600 text-white text-sm font-semibold rounded-lg transition-all ${allParticipantsSaved ? "hover:shadow-lg" : "opacity-40 cursor-not-allowed"}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Submit
                      </button>
                      {!allParticipantsSaved && (
                        <div role="tooltip" className="pointer-events-none invisible absolute bottom-full right-0 z-30 mb-2 w-72 rounded-xl bg-[#1A284F] px-3 py-2 text-[11px] text-white opacity-0 shadow-xl transition-opacity group-hover/submit:visible group-hover/submit:opacity-100 group-focus-within/submit:visible group-focus-within/submit:opacity-100">
                          <p className="mb-1 font-bold">Masih ada karyawan yang belum di-assessment / belum di-Save:</p>
                          {scores.filter((sc, i) => !savedFlags[i] || sc.aspectScores.some((v) => v === null)).map((sc) => (
                            <p key={sc.name}>• {sc.name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog onConfirm={handleConfirm} onCancel={() => setShowConfirm(false)} />
      )}
    </>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
function ScheduleDetailModal({ entry, onClose }: { entry: ScheduleEntry; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Company Unit",        entry.companyUnit],
    ["Interview Date",      entry.scheduledDate],
    ["Time",                entry.scheduledTime],
    ["Location / Platform", entry.location || "—"],
    ["Interviewers",        entry.interviewers.join(", ") || "—"],
    ["Added Users",         entry.addedUsers.join(", ") || "—"],
    ["Other Users",         entry.otherUsers.join(", ") || "—"],
    ["Notification Text",   entry.textNotifikasi || "—"],
    ["Attachment Text",     entry.textLampiran || "—"],
  ];
  const ss = SCHED_STATUS_STYLE[entry.status];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] rounded-t-2xl">
          <div>
            <h3 className="font-bold text-white">Schedule Detail</h3>
            <p className="text-xs text-blue-200 mt-0.5">{entry.companyUnit} · {entry.scheduledDate}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <div className="flex justify-end">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${ss.bg}`}>
              <ss.icon className="w-3 h-3" />{entry.status}
            </span>
          </div>
          {rows.map(([label, val]) => (
            <div key={label} className="grid grid-cols-[170px_1fr] gap-2 text-sm">
              <span className="text-gray-400 font-medium">{label}</span>
              <span className="text-gray-800 font-semibold">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SupervisorMonitoringManagementInterview({ hideAssess = false }: { hideAssess?: boolean } = {}) {
  const activeUser = getActiveUser();
  const [schedEntries, setSchedEntries] = useState<ScheduleEntry[]>(getEntries);
  const [assessmentsMap, setAssessmentsMap] = useState<Record<string, ParticipantScore[]>>(() =>
    loadSavedAssessmentsMap(),
  );
  const [viewEntry, setViewEntry]       = useState<ScheduleEntry | null>(null);
  const [assessEntry, setAssessEntry]   = useState<{ entry: ScheduleEntry; readOnly: boolean } | null>(null);

  useEffect(() => {
    const refreshAll = () => {
      setSchedEntries(getEntries());
      setAssessmentsMap(loadSavedAssessmentsMap());
    };
    const unsub = subscribe(refreshAll);
    window.addEventListener("pa-db-hydrated", refreshAll);
    window.addEventListener("appraisal-updated", refreshAll);
    return () => {
      unsub();
      window.removeEventListener("pa-db-hydrated", refreshAll);
      window.removeEventListener("appraisal-updated", refreshAll);
    };
  }, []);

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Management Interview Assessment</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">My Team</span>
        </div>
        <p className="text-gray-500 text-sm">{TEAM_UNIT} · {TEAM_DIV}</p>
        {!hideAssess && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>
              Login aktif: <strong>{activeUser.name}</strong> ({activeUser.role}). Hanya pengguna yang namanya tercantum pada kolom <strong>Interviewers</strong> yang dapat mengisi penilaian (selain itu tampil sebagai <strong>Read-Only</strong>).
            </span>
          </div>
        )}
      </div>

      {/* HR Schedules table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-500" />
          <p className="font-bold text-[#1A284F] text-sm">HR Schedules</p>
          <span className="ml-auto text-xs text-gray-400">Schedules created via HR → Calibration → Management Interview</span>
        </div>

        {schedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">No schedules created by HR yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#1A284F] text-white text-xs">
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Action</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Company Unit</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Time</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Interviewers</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Participants</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Location</th>
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedEntries.map((entry, i) => {
                  const ss = SCHED_STATUS_STYLE[entry.status];
                  const participants = [...entry.addedUsers, ...entry.otherUsers];
                  const entryAssessments = assessmentsMap[entry.id];
                  const isAssessed = Boolean(entryAssessments && entryAssessments.length > 0);
                  const isAppointedInterviewer = isUserAppointedInterviewer(activeUser, entry.interviewers);
                  return (
                    <tr key={entry.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${i % 2 !== 0 ? "bg-gray-50/30" : ""}`}>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!hideAssess && isAppointedInterviewer && (
                            <button
                              onClick={() => setAssessEntry({ entry, readOnly: false })}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                                isAssessed
                                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                                  : "bg-[#1A284F] text-white hover:bg-[#243660]"
                              }`}
                            >
                              {isAssessed ? <CheckCircle2 className="w-3 h-3" /> : <ClipboardEdit className="w-3 h-3" />}
                              {isAssessed ? "Assessed" : "Assess"}
                            </button>
                          )}
                          {!hideAssess && !isAppointedInterviewer && (
                            <button
                              onClick={() => setAssessEntry({ entry, readOnly: true })}
                              title="Anda hanya memiliki akses Read-Only karena bukan Interviewer yang ditunjuk pada jadwal ini"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
                            >
                              <Eye className="w-3 h-3" />
                              Read-Only
                            </button>
                          )}
                          <button
                            onClick={() => setViewEntry(entry)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{entry.companyUnit}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{entry.scheduledDate}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{entry.scheduledTime}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-medium text-indigo-700">
                            {entry.interviewers.join(", ")}
                          </span>
                          {!hideAssess && (
                            <span className={`inline-flex w-fit px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isAppointedInterviewer
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {isAppointedInterviewer ? "Interviewer Terpilih" : "Read-Only"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {participants.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {participants.map((p) => {
                              const assessedItem = entryAssessments?.find((a) => a.name.trim().toLowerCase() === p.trim().toLowerCase());
                              const valid = (assessedItem?.aspectScores ?? []).filter((v): v is number => typeof v === "number");
                              const avgVal = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
                              const pctVal = avgVal !== null ? (avgVal / 5) * 100 : null;
                              const wFrac = avgVal !== null ? getParticipantMIWeightFraction(p, entry.companyUnit, assessedItem?.employeeId) : 0;
                              const weightedVal = pctVal !== null ? pctVal * wFrac : null;
                              return (
                                <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded text-[10px] font-medium whitespace-nowrap">
                                  <span>{p}</span>
                                  {pctVal !== null && weightedVal !== null && (
                                    <span className="px-1 py-0.2 rounded bg-emerald-600 text-white font-bold text-[9px]">
                                      {pctVal.toFixed(1)}% · ×{Math.round(wFrac * 100)}%={weightedVal.toFixed(2)}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap max-w-[140px] truncate">{entry.location || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {isAssessed ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />Assessed
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${ss.bg}`}>
                            <ss.icon className="w-3 h-3" />{entry.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewEntry   && <ScheduleDetailModal entry={viewEntry}   onClose={() => setViewEntry(null)} />}
      {assessEntry && (
        <AssessmentModal
          entry={assessEntry.entry}
          readOnly={assessEntry.readOnly}
          onSubmitted={() => {
            setSchedEntries(getEntries());
            setAssessmentsMap(loadSavedAssessmentsMap());
          }}
          onClose={() => setAssessEntry(null)}
        />
      )}
    </div>
  );
}
