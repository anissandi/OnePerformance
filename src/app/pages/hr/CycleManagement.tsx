import React, { useState } from "react";
import { CheckCircle2, Clock, Users, BarChart2, TrendingUp, RefreshCw, Lock, Play, ArrowRight } from "lucide-react";

type PhaseStatus = "completed" | "in-progress" | "upcoming";

interface Phase {
  label: string;
  period: string;
  status: PhaseStatus;
}

const phases: Phase[] = [
  { label: "Setting", period: "Q1", status: "completed" },
  { label: "Measurement", period: "Q2–Q4", status: "completed" },
  { label: "Performance Evaluation & Analysis", period: "Q4", status: "in-progress" },
  { label: "Year-End Performance Dialogue", period: "Q4–Q1", status: "upcoming" },
];

const currentPhaseProgress = [
  { label: "Appraisal Form", pct: 89 },
  { label: "Managerial Skill", pct: 67 },
  { label: "Inter-Dept Feedback", pct: 45 },
];

const historyData = [
  { year: 2025, employees: 22, avgScore: 82.4, topGrade: "A" },
  { year: 2024, employees: 20, avgScore: 79.8, topGrade: "B" },
  { year: 2023, employees: 18, avgScore: 77.2, topGrade: "B" },
];

const companyUnits = [
  { label: "PT RSUP Industry", key: "industry" },
  { label: "PT RSUP Perkebunan", key: "perkebunan" },
  { label: "PT RSTM", key: "rstm" },
  { label: "PT GHS", key: "ghs" },
  { label: "ASD", key: "asd" },
];

function PhaseCircle({ status }: { status: PhaseStatus }) {
  if (status === "completed") {
    return (
      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
        <CheckCircle2 className="w-5 h-5 text-white" />
      </div>
    );
  }
  if (status === "in-progress") {
    return (
      <div className="relative w-10 h-10 flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#1A284F] flex items-center justify-center shadow-sm">
          <Play className="w-4 h-4 text-white fill-white" />
        </div>
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white animate-pulse" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
      <Clock className="w-5 h-5 text-gray-400" />
    </div>
  );
}

export function CycleManagement() {
  const [isCycleClosed, setIsCycleClosed] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [cycleStartDate, setCycleStartDate] = useState("2027-02-01");
  const [settingEnd, setSettingEnd] = useState("2027-03-31");
  const [measurementEnd, setMeasurementEnd] = useState("2027-11-16");
  const [evaluationEnd, setEvaluationEnd] = useState("2028-01-16");
  const [dialogueEnd, setDialogueEnd] = useState("2028-02-16");
  const [selectedUnits, setSelectedUnits] = useState<Record<string, boolean>>({
    industry: true,
    perkebunan: true,
    rstm: true,
    ghs: true,
    asd: false,
  });

  const toggleUnit = (key: string) => {
    setSelectedUnits((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F]">PA Cycle Management</h1>
        <p className="text-gray-500 mt-1 text-sm">Manage Performance Appraisal cycles and phases</p>
      </div>

      {/* Section 1: Active Cycle */}
      <section className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1A284F]">Active Cycle: 2026 Performance Appraisal</h2>
            </div>
            <span className="rounded-full px-3 py-0.5 text-xs font-semibold border bg-blue-50 text-blue-700 border-blue-200">
              In Progress
            </span>
          </div>

          {/* Timeline */}
          <div className="overflow-x-auto pb-2">
            <div className="flex items-start min-w-max gap-0">
              {phases.map((phase, idx) => (
                <React.Fragment key={phase.label}>
                  <div className="flex flex-col items-center gap-2 w-48">
                    <PhaseCircle status={phase.status} />
                    <div className="text-center">
                      <p className="text-xs font-semibold text-gray-700 leading-tight">{phase.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{phase.period}</p>
                      {phase.status === "completed" && (
                        <span className="text-xs text-green-600 font-medium">Completed</span>
                      )}
                      {phase.status === "in-progress" && (
                        <span className="text-xs text-[#1A284F] font-medium">In Progress</span>
                      )}
                      {phase.status === "upcoming" && (
                        <span className="text-xs text-gray-400 font-medium">Upcoming</span>
                      )}
                    </div>
                  </div>
                  {idx < phases.length - 1 && (
                    <div className="flex-1 h-0.5 bg-gray-200 mt-5 mx-2 min-w-8" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Current + Next Phase Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Current Phase */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-[#1A284F]" />
                <h3 className="text-sm font-semibold text-gray-800">Current Phase Details</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-500">Phase: <span className="text-gray-800 font-medium">Performance Evaluation &amp; Analysis</span></p>
                <p className="text-gray-500">Period: <span className="text-gray-800 font-medium">17 Nov 2026 – 16 Jan 2027</span></p>
              </div>
              <div className="space-y-2">
                {currentPhaseProgress.map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-semibold text-gray-700">{item.pct}%</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-[#1A284F] rounded-full h-2 transition-all"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Next Phase */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-800">Next Phase</h3>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-gray-500">Phase: <span className="text-gray-800 font-medium">Year-End Performance Dialogue</span></p>
                <p className="text-gray-500">Period: <span className="text-gray-800 font-medium">17 Jan 2027 – 16 Feb 2027</span></p>
              </div>
              <div className="text-sm space-y-1">
                <p className="text-gray-500 font-medium text-xs uppercase tracking-wide">Items</p>
                <ul className="text-gray-700 space-y-0.5 text-sm">
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-300" />
                    Management Interview
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-300" />
                    Calibration
                  </li>
                </ul>
              </div>
              <span className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200">
                Not yet started
              </span>
            </div>
          </div>

          {/* Close Cycle Button */}
          {!isCycleClosed && (
            <div className="pt-2">
              {!showCloseConfirm ? (
                <button
                  onClick={() => setShowCloseConfirm(true)}
                  className="border border-red-200 text-red-600 hover:bg-red-50 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
                >
                  Close Current Cycle
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm text-red-700 font-semibold">Confirm Close Cycle</p>
                  <p className="text-sm text-red-600">
                    Are you sure you want to close the 2026 PA Cycle? This action cannot be undone. All data will be archived.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCloseConfirm(false)}
                      className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { setIsCycleClosed(true); setShowCloseConfirm(false); }}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors"
                    >
                      Confirm Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {isCycleClosed && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              2026 PA Cycle has been closed and archived.
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Initialize Next Cycle */}
      <section>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-[#1A284F]" />
            <h2 className="text-lg font-bold text-[#1A284F]">Initialize 2027 Performance Appraisal Cycle</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Performance Year */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Performance Year</label>
              <input
                type="text"
                value="2027"
                readOnly
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-400 bg-gray-50 cursor-not-allowed"
              />
            </div>

            {/* Cycle Start Date */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cycle Start Date</label>
              <input
                type="date"
                value={cycleStartDate}
                onChange={(e) => setCycleStartDate(e.target.value)}
                disabled={!isCycleClosed}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Setting Phase End</label>
              <input
                type="date"
                value={settingEnd}
                onChange={(e) => setSettingEnd(e.target.value)}
                disabled={!isCycleClosed}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Measurement Phase End</label>
              <input
                type="date"
                value={measurementEnd}
                onChange={(e) => setMeasurementEnd(e.target.value)}
                disabled={!isCycleClosed}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evaluation Phase End</label>
              <input
                type="date"
                value={evaluationEnd}
                onChange={(e) => setEvaluationEnd(e.target.value)}
                disabled={!isCycleClosed}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Year-End Dialogue End</label>
              <input
                type="date"
                value={dialogueEnd}
                onChange={(e) => setDialogueEnd(e.target.value)}
                disabled={!isCycleClosed}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Company Units */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Company Units</label>
            <div className="flex flex-wrap gap-3">
              {companyUnits.map((unit) => (
                <label
                  key={unit.key}
                  className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border text-sm transition-colors ${
                    selectedUnits[unit.key]
                      ? "bg-[#1A284F]/5 border-[#1A284F]/30 text-[#1A284F] font-medium"
                      : "bg-white border-gray-200 text-gray-500"
                  } ${!isCycleClosed ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedUnits[unit.key]}
                    onChange={() => isCycleClosed && toggleUnit(unit.key)}
                    disabled={!isCycleClosed}
                    className="accent-[#1A284F]"
                  />
                  {unit.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              disabled={!isCycleClosed}
              className={`bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${!isCycleClosed ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Play className="w-4 h-4" />
              Initialize New Cycle
            </button>
            {!isCycleClosed && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <Lock className="w-3.5 h-3.5" />
                New cycle can only be initialized after the current cycle is closed.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section 3: Cycle History */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-[#1A284F]">Past PA Cycles</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {historyData.map((cycle) => (
            <div key={cycle.year} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-[#1A284F]">{cycle.year}</span>
                <span className="rounded-full px-3 py-0.5 text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
                  Completed
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span><span className="font-semibold text-gray-800">{cycle.employees}</span> employees</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <BarChart2 className="w-4 h-4 text-gray-400" />
                  <span>Avg Score: <span className="font-semibold text-gray-800">{cycle.avgScore}</span></span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <span>Top Grade: <span className="font-semibold text-[#1A284F]">{cycle.topGrade}</span></span>
                </div>
              </div>
              <button
                onClick={() => {}}
                className="flex items-center gap-1 text-sm text-[#1A284F] font-semibold hover:underline"
              >
                View Archive
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
