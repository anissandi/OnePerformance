import { useEffect, useState } from "react";
import { ArrowLeftRight, CheckCircle2, ChevronDown, Clock, Eye, Users } from "lucide-react";
import {
  FEEDBACK_INDICATORS,
  FOLLOW_UP_COLUMNS,
  getFeedbackSubmission,
  type FeedbackFollowUp,
} from "../pages/shared/interDepartmentFeedbackStore";
import { useAuthStore } from "../store/authStore";
import { normalizeDateDDMMYYYY } from "../utils/dateFormat";

function FollowUpSummaryTable({
  label,
  approverName,
  rows,
}: {
  label: string;
  approverName: string;
  rows?: FeedbackFollowUp[];
}) {
  const hasRows = Boolean(rows && rows.length > 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="w-8 h-8 rounded-full bg-[#1A284F] flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">
            {label === "Approver 1" ? "A1" : "A2"}
          </span>
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">
            Summary Tindak Lanjut — {label}
          </p>
          <p className="text-xs text-gray-500">{approverName}</p>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full border ${
            hasRows
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasRows ? "bg-emerald-500" : "bg-amber-400"
            }`}
          />
          {hasRows ? `${rows!.length} Rencana Tindak Lanjut` : "Menunggu Tindak Lanjut"}
        </span>
      </div>

      {!hasRows ? (
        <div className="px-6 py-6 text-sm text-gray-500">
          Belum ada tindak lanjut dari <span className="font-semibold text-gray-700">{label}</span> ({approverName}).
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 760 }}>
            <thead>
              <tr className="bg-[#1A284F]/5 border-b border-gray-200">
                <th className="text-center px-3 py-3 font-bold text-[#1A284F] w-10">No</th>
                {FOLLOW_UP_COLUMNS.map((col) => (
                  <th key={col} className="text-left px-3 py-3 font-bold text-[#1A284F] whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows!.map((r, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/60 align-top">
                  <td className="text-center px-3 py-3 font-bold text-gray-400">{idx + 1}</td>
                  {FOLLOW_UP_COLUMNS.map((col) => (
                    <td key={col} className="px-3 py-3 text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {r[col] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function InterDeptFeedbackAppraisalSummary() {
  const { activeUser, allUsers } = useAuthStore();
  const [tick, setTick] = useState(0);
  const [activeFbIdx, setActiveFbIdx] = useState(0);
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("feedback-updated", refresh);
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("feedback-updated", refresh);
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  void tick;
  const submission = getFeedbackSubmission(activeUser.employeeId);
  const ap1User = allUsers.find(
    (u) =>
      (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase()) ||
      u.employeeId.toLowerCase() === (activeUser.regNoAp1 ?? "").toLowerCase(),
  );
  const ap2User = allUsers.find(
    (u) =>
      (u.regNo && u.regNo.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase()) ||
      u.employeeId.toLowerCase() === (activeUser.regNoAp2 ?? "").toLowerCase(),
  );

  if (!submission || submission.feedbacks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
          <ArrowLeftRight className="w-6 h-6 text-indigo-600" />
        </div>
        <p className="text-sm font-semibold text-gray-700">
          Belum ada Inter-Department Feedback yang diterima
        </p>
        <p className="text-xs text-gray-400 max-w-md">
          {submission?.nominations?.length
            ? `Nominasi 3 pemberi feedback telah dikirim (${submission.feedbacks.length}/3 feedback masuk). Ringkasan akan tampil setelah feedback diterima.`
            : "Ringkasan feedback yang diterima, catatan penerima, serta tindak lanjut Approver 1 & 2 akan tampil setelah proses nominasi dan pengisian feedback dilakukan."}
        </p>
      </div>
    );
  }

  const feedbacks = submission.feedbacks;
  const posPerFb = FEEDBACK_INDICATORS.filter((i) => i.sentiment === "positive").length;
  const negPerFb = FEEDBACK_INDICATORS.filter((i) => i.sentiment === "negative").length;
  const totalPos = feedbacks.length * posPerFb;
  const totalNeg = feedbacks.length * negPerFb;
  const hasSummarySubmitted = Boolean(submission.summarySubmittedAt);
  const a1Done = Boolean(submission.followUps.approver1?.length);
  const a2Done = Boolean(submission.followUps.approver2?.length);
  const fullApproved = a1Done && (a2Done || !activeUser.regNoAp2);
  const safeIdx = Math.min(activeFbIdx, feedbacks.length - 1);

  return (
    <div className="w-full space-y-6">
      {/* Banner Informasi */}
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-blue-600 shrink-0" />
        <p className="text-xs text-blue-800">
          Ringkasan <strong>Inter-Department Feedback</strong> menampilkan seluruh feedback anonim yang diterima,{" "}
          <strong>Summary / Catatan Penerima</strong>, serta <strong>Summary Tindak Lanjut dari Approver 1 &amp; Approver 2</strong>.
        </p>
      </div>

      {/* Kartu Summary Statistik */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
              Feedback Diterima
            </p>
            <p className="text-2xl font-bold text-[#1A284F]">
              {feedbacks.length}
              <span className="text-sm font-normal text-gray-400 ml-1">/ 3 pemberi</span>
            </p>
          </div>
          <div className="w-px h-10 bg-gray-100 hidden sm:block" />
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Indikator Positif
            </p>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <p className="text-2xl font-bold text-emerald-600">
                {totalPos}
                <span className="text-xs font-normal text-gray-400 ml-1">jawaban</span>
              </p>
            </div>
          </div>
          <div className="w-px h-10 bg-gray-100 hidden sm:block" />
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Area Peningkatan
            </p>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              <p className="text-2xl font-bold text-rose-500">
                {totalNeg}
                <span className="text-xs font-normal text-gray-400 ml-1">jawaban</span>
              </p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {submission.row.submittedDate && submission.row.submittedDate !== "-" && (
              <span className="text-xs text-gray-400">
                Submitted: {normalizeDateDDMMYYYY(submission.row.submittedDate)}
              </span>
            )}
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold border inline-flex items-center gap-1.5 ${
                fullApproved
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : hasSummarySubmitted
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-sky-50 text-sky-700 border-sky-200"
              }`}
            >
              {fullApproved ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Full Approved
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  {hasSummarySubmitted ? "Menunggu Tindak Lanjut Approver" : "Summary Belum Disubmit"}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tab Pemberi Feedback (Semua vs Per Pemberi) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-[#1A284F] flex items-center gap-2">
            <Users className="w-4 h-4" />
            Summary Feedback yang Diterima &amp; Catatan Penerima
          </h3>
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveFbIdx(-1)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                activeFbIdx === -1
                  ? "bg-[#1A284F] text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              Semua Feedback ({feedbacks.length})
            </button>
            {feedbacks.map((fb, idx) => (
              <button
                key={fb.id}
                type="button"
                onClick={() => setActiveFbIdx(idx)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                  safeIdx === idx && activeFbIdx !== -1
                    ? "bg-[#1A284F] text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Feedback {idx + 1} · {fb.division}
              </button>
            ))}
          </div>
        </div>

        {(activeFbIdx === -1 ? feedbacks : [feedbacks[safeIdx]]).map((fb) => {
          const realIdx = feedbacks.findIndex((x) => x.id === fb.id);
          const isCollapsed = Boolean(collapsedMap[fb.id]);
          return (
            <div
              key={fb.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setCollapsedMap((prev) => ({ ...prev, [fb.id]: !prev[fb.id] }))
                }
                className="w-full flex items-center gap-3 px-6 py-4 bg-[#1A284F] text-white text-left"
              >
                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold shrink-0">
                  {realIdx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">
                    Feedback {realIdx + 1} — {fb.division} · {fb.companyUnit}
                  </p>
                  <p className="text-[11px] text-white/70">
                    Pemberi Feedback Anonim · {FEEDBACK_INDICATORS.length} Indikator
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-white/80 transition-transform ${
                    isCollapsed ? "" : "rotate-180"
                  }`}
                />
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-gray-100">
                  {FEEDBACK_INDICATORS.map((ind, indIdx) => {
                    const summaryVal = submission.summaries[`${fb.id}-${ind.key}`] ?? "";
                    const isPos = ind.sentiment === "positive";
                    return (
                      <div key={ind.key} className="p-5 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-xs font-bold flex items-center justify-center shrink-0">
                            {indIdx + 1}
                          </span>
                          <p className="text-xs font-semibold text-gray-800 flex-1 leading-relaxed">
                            {ind.label}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 border ${
                              isPos
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}
                          >
                            {isPos ? "Positif" : "Negatif"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-8">
                          <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 p-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-800 mb-1">
                              Feedback yang Diterima (Anonim)
                            </p>
                            <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                              {fb.answers[ind.key] || "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-violet-200/80 bg-violet-50/60 p-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-800 mb-1">
                              Summary / Catatan Penerima
                            </p>
                            <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                              {summaryVal || (
                                <span className="italic text-gray-400">
                                  Belum diisi pada tab Feedback Diterima
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Tindak Lanjut Approver 1 & Approver 2 */}
      <div className="space-y-4">
        <FollowUpSummaryTable
          label="Approver 1"
          approverName={ap1User?.name || activeUser.regNoAp1 || "Approver 1"}
          rows={submission.followUps.approver1}
        />
        {Boolean(activeUser.regNoAp2) && (
          <FollowUpSummaryTable
            label="Approver 2"
            approverName={ap2User?.name || activeUser.regNoAp2 || "Approver 2"}
            rows={submission.followUps.approver2}
          />
        )}
      </div>
    </div>
  );
}
