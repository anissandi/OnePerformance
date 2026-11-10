import React, { useState } from "react";
import { PenLine, FolderKanban, Lightbulb } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
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
  return (
    <EmptyState
      icon={FolderKanban}
      title="No Project Registration data yet"
      description="Project Outside Job Scope data will appear here once uploaded by Administrator / HR ICF."
    />
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
  const { activeUser } = useAuthStore();

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F] mb-1">Performance Appraisal Setting</h1>
        <p className="text-gray-500 text-sm">{activeUser.name} ({activeUser.employeeId}) · Performance Year 2026</p>
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
