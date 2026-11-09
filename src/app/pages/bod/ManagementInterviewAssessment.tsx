import { useState } from "react";
import { Calendar, Clock, CheckCircle, AlertCircle, Users, ChevronDown } from "lucide-react";
import {
  setMIPenilaiResult,
  CANDIDATE_TO_EMP_ID,
} from "../supervisor/managementInterviewResultStore";
import type { MIRecommendation } from "../supervisor/managementInterviewResultStore";

interface Candidate {
  id: string;
  name: string;
  position: string;
  division: string;
  company: string;
  date: string;
  time: string;
  status: "Completed" | "Pending";
}

const CANDIDATES: Candidate[] = [
  {
    id: "hendra",
    name: "Drs. Hendra Wijaya",
    position: "Ka. Divisi Operasional",
    division: "Divisi Operasional",
    company: "PT RSUP (Industry)",
    date: "15 Jan 2027",
    time: "09:00",
    status: "Completed",
  },
  {
    id: "susi",
    name: "Ir. Susi Marlina",
    position: "Ka. Divisi Keuangan",
    division: "Divisi Keuangan",
    company: "PT RSUP (Industry)",
    date: "15 Jan 2027",
    time: "11:00",
    status: "Completed",
  },
  {
    id: "tono",
    name: "Ir. Tono Sugiarto",
    position: "Ka. Divisi Teknik",
    division: "Divisi Teknik",
    company: "PT RSUP (Industry)",
    date: "16 Jan 2027",
    time: "13:00",
    status: "Pending",
  },
  {
    id: "eko",
    name: "Drs. Eko Prasetyo",
    position: "Wa. Ka. Divisi Supply Chain",
    division: "Divisi Supply Chain",
    company: "PT RSUP (Industry)",
    date: "17 Jan 2027",
    time: "09:00",
    status: "Pending",
  },
];

interface Criterion {
  id: number;
  label: string;
  description: string;
}

const CRITERIA: Criterion[] = [
  { id: 1, label: "Kewajaran Hasil Kinerja", description: "Kesesuaian hasil kinerja dengan target dan ekspektasi yang ditetapkan" },
  { id: 2, label: "Justifikasi & Evidence", description: "Kelengkapan data dan bukti pendukung atas pencapaian kinerja" },
  { id: 3, label: "Improvement & Follow Up", description: "Rencana perbaikan dan tindak lanjut atas area yang perlu ditingkatkan" },
];

const RATING_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Below Avg",
  3: "Average",
  4: "Good",
  5: "Excellent",
};

const RECOMMENDATIONS = [
  "Promote",
  "Maintain Current Position",
  "Needs Improvement",
  "Further Review Required",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function ManagementInterviewAssessment() {
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, Record<number, number>>>({});
  const [recommendations, setRecommendations] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const total = CANDIDATES.length;
  const completed = CANDIDATES.filter((c) => c.status === "Completed").length;
  const pending = CANDIDATES.filter((c) => c.status === "Pending").length;

  function handleRating(candidateId: string, criterionId: number, value: number) {
    setRatings((prev) => ({
      ...prev,
      [candidateId]: { ...(prev[candidateId] ?? {}), [criterionId]: value },
    }));
  }

  function finalScore(candidateId: string): string {
    const cRatings = ratings[candidateId] ?? {};
    const filled = Object.values(cRatings);
    if (filled.length === 0) return "—";
    const avg = filled.reduce((a, b) => a + b, 0) / CRITERIA.length;
    return (avg * 20).toFixed(1);
  }

  function allRated(candidateId: string): boolean {
    const cRatings = ratings[candidateId] ?? {};
    return CRITERIA.every((c) => cRatings[c.id] !== undefined);
  }

  function handleSubmit(candidateId: string) {
    const empId = CANDIDATE_TO_EMP_ID[candidateId];
    if (empId) {
      // Bambang Sutrisno (current assessor shown on this page) is slot 1
      setMIPenilaiResult(
        empId,
        1,
        ratings[candidateId] ?? {},
        (recommendations[candidateId] as MIRecommendation) || "",
        notes[candidateId] ?? "",
      );
    }
    setActiveCard(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A284F]">Management Interview — Assessment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Performance Year 2026 · Interviewer: Ir. Bambang Sutrisno (Direktur Operasional)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
            <div className="bg-blue-50 rounded-xl p-3">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total Assigned</p>
              <p className="text-2xl font-bold text-[#1A284F]">{total}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
            <div className="bg-green-50 rounded-xl p-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Assessment Completed</p>
              <p className="text-2xl font-bold text-[#1A284F]">{completed}</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
            <div className="bg-amber-50 rounded-xl p-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Pending Assessment</p>
              <p className="text-2xl font-bold text-[#1A284F]">{pending}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {CANDIDATES.map((candidate) => {
            const isExpanded = activeCard === candidate.id;
            const cRatings = ratings[candidate.id] ?? {};

            return (
              <div key={candidate.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-full bg-[#1A284F] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {getInitials(candidate.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{candidate.name}</p>
                        <p className="text-xs text-gray-500">{candidate.position} · {candidate.division}</p>
                        <p className="text-xs text-gray-400">{candidate.company}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {candidate.date}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {candidate.time}
                      </span>

                      {candidate.status === "Completed" ? (
                        <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-0.5 text-xs font-semibold">
                          Completed
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-0.5 text-xs font-semibold">
                          Pending
                        </span>
                      )}

                      {candidate.status === "Completed" ? (
                        <button className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          View Assessment
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveCard(isExpanded ? null : candidate.id)}
                          className="bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
                        >
                          {isExpanded ? "Hide Form" : "Start Assessment"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-6 pb-6 pt-5 space-y-6">
                    <h3 className="text-sm font-semibold text-[#1A284F] uppercase tracking-wide">
                      Assessment Criteria
                    </h3>

                    <div className="space-y-5">
                      {CRITERIA.map((criterion) => (
                        <div key={criterion.id} className="space-y-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{criterion.label}</p>
                            <p className="text-xs text-gray-500">{criterion.description}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5].map((val) => {
                              const selected = cRatings[criterion.id] === val;
                              return (
                                <button
                                  key={val}
                                  onClick={() => handleRating(candidate.id, criterion.id, val)}
                                  className={
                                    selected
                                      ? "bg-[#1A284F] text-white rounded-lg px-3 py-1.5 text-sm font-semibold"
                                      : "border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                  }
                                >
                                  {val} {RATING_LABELS[val]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Overall Recommendation</label>
                        <div className="relative">
                          <select
                            value={recommendations[candidate.id] ?? ""}
                            onChange={(e) =>
                              setRecommendations((prev) => ({ ...prev, [candidate.id]: e.target.value }))
                            }
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 appearance-none bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
                          >
                            <option value="">Select recommendation...</option>
                            {RECOMMENDATIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Final Score</label>
                        <div className="flex items-center h-10">
                          {allRated(candidate.id) ? (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-sm font-semibold">
                              {finalScore(candidate.id)} / 100
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Rate all criteria to calculate</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Interview Notes</label>
                      <textarea
                        rows={4}
                        value={notes[candidate.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [candidate.id]: e.target.value }))
                        }
                        placeholder="Summarize key discussion points and observations..."
                        className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
                      />
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setActiveCard(null)}
                        className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSubmit(candidate.id)}
                        className="bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
                      >
                        Submit Assessment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
