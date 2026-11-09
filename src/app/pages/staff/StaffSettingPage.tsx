import React, { useState } from "react";
import { PenLine, FolderKanban, Lightbulb, CheckCircle2, Lock, Info } from "lucide-react";
import { EDWARD_PROJECTS, EDWARD_PROFILE } from "../../data/edwardData";
import { EmptyState } from "../../components/EmptyState";

// ─── KPI Setting Tab ──────────────────────────────────────────────────────────

function KPISettingTab() {
  return (
    <EmptyState
      icon={PenLine}
      title="No KPI Setting data yet"
      description="KPI Setting data will appear here once submitted by the employee."
    />
  );
}

// ─── SMART Goals Setting Tab ──────────────────────────────────────────────────

function SMARTGoalsSettingTab() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="No SMART Goals Setting data yet"
      description="SMART Goals data will appear here once submitted by the employee."
    />
  );
}

// ─── Project Registration Tab ─────────────────────────────────────────────────

function ProjectRegistrationTab() {
  const proj = EDWARD_PROJECTS[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700">Project Registration Approved</p>
            <p className="text-xs text-green-600">1 project registered — approved by Ahmad Fauzi · 20 January 2026</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Lock className="w-4 h-4" />
          <span className="text-xs font-semibold">Locked</span>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between bg-[#1A284F] px-5 py-3">
          <div className="flex items-center gap-3">
            <FolderKanban className="w-4 h-4 text-white/70" />
            <span className="text-white font-semibold text-sm">{proj.projectName}</span>
          </div>
          <span className="text-[11px] font-bold text-green-300 bg-green-900/30 px-3 py-0.5 rounded-full border border-green-700/30">
            {proj.approvalStatus}
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {[
            { label: "Category",        value: proj.category       },
            { label: "Scope / Type",    value: proj.scope          },
            { label: "Role",            value: proj.role           },
            { label: "Description",     value: proj.description    },
            { label: "Start Date",      value: proj.startDate      },
            { label: "End Date",        value: proj.endDate        },
            { label: "Expected Output", value: proj.expectedOutput },
            { label: "Weight",          value: `${proj.bobot}%`   },
          ].map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[200px_1fr] gap-4 px-5 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">{label}</p>
              <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Approved projects can only have their progress updated via Performance Appraisal Measurement → Project Check-In.
        </p>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "KPI" | "SMART Goals" | "Project Registration";

const TABS: { id: Tab; icon: React.ElementType; label: string }[] = [
  { id: "KPI",                  icon: PenLine,      label: "KPI"                  },
  { id: "SMART Goals",          icon: Lightbulb,    label: "SMART Goals"          },
  { id: "Project Registration", icon: FolderKanban, label: "Project Registration" },
];

export function StaffSettingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("KPI");

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F] mb-1">Performance Appraisal Setting</h1>
        <p className="text-gray-500 text-sm">{EDWARD_PROFILE.name} · Performance Year 2026</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === id ? "border-[#1A284F] text-[#1A284F] bg-gray-50" : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "KPI"                  && <KPISettingTab />}
      {activeTab === "SMART Goals"          && <SMARTGoalsSettingTab />}
      {activeTab === "Project Registration" && <ProjectRegistrationTab />}
    </div>
  );
}
