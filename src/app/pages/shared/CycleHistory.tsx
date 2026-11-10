import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, Calendar, Users, ArrowRight } from "lucide-react";
import { loadPersistedState } from "../../services/supabaseClient";

type Role = "hr" | "supervisor" | "employee";

interface GradeBar {
  grade: string;
  pct: number;
  color: string;
}

interface CycleData {
  year: number;
  period: string;
  completedEmployees: number;
  employee: {
    score: number;
    grade: string;
    modules: string;
  };
  supervisor: {
    teamAvg: number;
    topPerformer: string;
    topScore: number;
    lowestPerformer: string;
    lowestScore: number;
  };
  hr: {
    companyAvg: number;
    gradeDistribution: GradeBar[];
    completionRate: number;
  };
  calibration: string;
  managementInterview: string;
}

const gradeColors: Record<string, string> = {
  "A+": "bg-purple-500",
  "A": "bg-blue-500",
  "B": "bg-green-500",
  "C": "bg-amber-400",
  "D": "bg-red-400",
};

const cycles: CycleData[] = [];
const _UNUSED_CYCLES: CycleData[] = [
  {
    year: 2025,
    period: "Feb 2025 – Feb 2026",
    completedEmployees: 22,
    employee: { score: 82.3, grade: "A", modules: "4/4 complete" },
    supervisor: {
      teamAvg: 79.8,
      topPerformer: "Budi Santoso",
      topScore: 91.2,
      lowestPerformer: "Wahyu Utomo",
      lowestScore: 62.4,
    },
    hr: {
      companyAvg: 80.9,
      completionRate: 100,
      gradeDistribution: [
        { grade: "A+", pct: 5, color: gradeColors["A+"] },
        { grade: "A", pct: 35, color: gradeColors["A"] },
        { grade: "B", pct: 40, color: gradeColors["B"] },
        { grade: "C", pct: 15, color: gradeColors["C"] },
        { grade: "D", pct: 5, color: gradeColors["D"] },
      ],
    },
    calibration: "Completed",
    managementInterview: "Completed",
  },
  {
    year: 2024,
    period: "Feb 2024 – Feb 2025",
    completedEmployees: 20,
    employee: { score: 78.1, grade: "B", modules: "4/4 complete" },
    supervisor: {
      teamAvg: 76.5,
      topPerformer: "Siti Rahayu",
      topScore: 88.4,
      lowestPerformer: "Diana Kusuma",
      lowestScore: 58.2,
    },
    hr: {
      companyAvg: 79.8,
      completionRate: 98,
      gradeDistribution: [
        { grade: "A+", pct: 3, color: gradeColors["A+"] },
        { grade: "A", pct: 30, color: gradeColors["A"] },
        { grade: "B", pct: 45, color: gradeColors["B"] },
        { grade: "C", pct: 17, color: gradeColors["C"] },
        { grade: "D", pct: 5, color: gradeColors["D"] },
      ],
    },
    calibration: "Completed",
    managementInterview: "Completed",
  },
  {
    year: 2023,
    period: "Feb 2023 – Feb 2024",
    completedEmployees: 18,
    employee: { score: 74.6, grade: "B", modules: "4/4 complete" },
    supervisor: {
      teamAvg: 73.2,
      topPerformer: "Rizal Fauzi",
      topScore: 85.1,
      lowestPerformer: "Eko Prasetyo",
      lowestScore: 61.0,
    },
    hr: {
      companyAvg: 77.2,
      completionRate: 96,
      gradeDistribution: [
        { grade: "A+", pct: 2, color: gradeColors["A+"] },
        { grade: "A", pct: 28, color: gradeColors["A"] },
        { grade: "B", pct: 47, color: gradeColors["B"] },
        { grade: "C", pct: 18, color: gradeColors["C"] },
        { grade: "D", pct: 5, color: gradeColors["D"] },
      ],
    },
    calibration: "Completed",
    managementInterview: "Completed",
  },
];

const subtitleByRole: Record<Role, string> = {
  employee: "Your personal appraisal history across completed cycles",
  supervisor: "Team performance history across completed cycles",
  hr: "Company-wide performance history",
};

const buttonLabelByRole: Record<Role, string> = {
  employee: "View My Report",
  supervisor: "View Team Report",
  hr: "View Full Archive",
};

function GradeDistributionBar({ items }: { items: GradeBar[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div key={item.grade} className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-5">{item.grade}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-2">
            <div
              className={`${item.color} rounded-full h-2`}
              style={{ width: `${item.pct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-7 text-right">{item.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function EmployeeView({ cycle }: { cycle: CycleData }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mt-4">
      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">My Score</p>
        <p className="text-2xl font-bold text-[#1A284F]">{cycle.employee.score}</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Grade</p>
        <p className="text-2xl font-bold text-[#1A284F]">{cycle.employee.grade}</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Modules</p>
        <p className="text-lg font-bold text-green-600">{cycle.employee.modules}</p>
      </div>
    </div>
  );
}

function SupervisorView({ cycle }: { cycle: CycleData }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mt-4">
      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Team Avg</p>
        <p className="text-2xl font-bold text-[#1A284F]">{cycle.supervisor.teamAvg}</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Top Performer</p>
        <p className="text-sm font-semibold text-green-700">{cycle.supervisor.topPerformer}</p>
        <p className="text-xs text-gray-500">{cycle.supervisor.topScore}</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Needs Attention</p>
        <p className="text-sm font-semibold text-red-600">{cycle.supervisor.lowestPerformer}</p>
        <p className="text-xs text-gray-500">{cycle.supervisor.lowestScore}</p>
      </div>
    </div>
  );
}

function HRView({ cycle }: { cycle: CycleData }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 mt-4">
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Company Avg</p>
        <p className="text-2xl font-bold text-[#1A284F]">{cycle.hr.companyAvg}</p>
        <div className="mt-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Completion Rate</p>
          <p className="text-lg font-bold text-green-600">{cycle.hr.completionRate}%</p>
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 sm:col-span-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Grade Distribution</p>
        <GradeDistributionBar items={cycle.hr.gradeDistribution} />
      </div>
    </div>
  );
}

function CycleCard({ cycle, role }: { cycle: CycleData; role: Role }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
      {/* Top Row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-2xl font-bold text-[#1A284F]">{cycle.year}</span>
          <span className="rounded-full px-3 py-0.5 text-xs font-semibold border bg-green-50 text-green-700 border-green-200">
            Completed
          </span>
        </div>
        <button
          onClick={() => {}}
          className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors font-medium flex-shrink-0"
        >
          {buttonLabelByRole[role]}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Meta info */}
      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-gray-400" />
          {cycle.period}
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-400" />
          {cycle.completedEmployees} employees
        </div>
      </div>

      {/* Role-specific view */}
      {role === "employee" && <EmployeeView cycle={cycle} />}
      {role === "supervisor" && <SupervisorView cycle={cycle} />}
      {role === "hr" && <HRView cycle={cycle} />}

      {/* Footer */}
      <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          Calibration: <span className="font-medium text-gray-700">{cycle.calibration}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          Management Interview: <span className="font-medium text-gray-700">{cycle.managementInterview}</span>
        </div>
      </div>
    </div>
  );
}

const YEAR_FILTERS = ["All", "2025", "2024", "2023"] as const;

export function CycleHistory({ role = "employee" }: { role?: Role }) {
  const [yearFilter, setYearFilter] = useState<string>("All");

  const filtered = useMemo(() => {
    if (yearFilter === "All") return cycles;
    return cycles.filter((c) => String(c.year) === yearFilter);
  }, [yearFilter]);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F]">Performance Appraisal History</h1>
        <p className="text-gray-500 mt-1 text-sm">{subtitleByRole[role]}</p>
      </div>

      {/* Year Filter Tabs */}
      <div className="flex gap-1 bg-white border border-gray-100 shadow-sm rounded-xl p-1 w-fit">
        {YEAR_FILTERS.map((yr) => (
          <button
            key={yr}
            onClick={() => setYearFilter(yr)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              yearFilter === yr
                ? "border-b-2 border-[#1A284F] text-[#1A284F] bg-gray-50"
                : "border-b-2 border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {yr}
          </button>
        ))}
      </div>

      {/* Cycle Cards */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
            No cycle data found for the selected year.
          </div>
        )}
        {filtered.map((cycle) => (
          <CycleCard key={cycle.year} cycle={cycle} role={role} />
        ))}
      </div>
    </div>
  );
}

export function HRCycleHistory() {
  return <CycleHistory role="hr" />;
}

export function SupervisorCycleHistory() {
  return <CycleHistory role="supervisor" />;
}

export function EmployeeCycleHistory() {
  return <CycleHistory role="employee" />;
}
