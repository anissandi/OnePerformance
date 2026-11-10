import React, { useState } from "react";
import { TrendingUp, Lightbulb, ClipboardList, FolderKanban, SearchCode } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { EmptyState } from "../../components/EmptyState";

// ─── Tab Contents ─────────────────────────────────────────────────────────────

function KPITrackingTab() {
  return (
    <EmptyState
      icon={TrendingUp}
      title="No KPI Tracking data yet"
      description="KPI Tracking data will appear here once the employee inputs monthly actuals."
    />
  );
}

function SMARTGoalsTab() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="No SMART Goals data yet"
      description="SMART Goals data will appear here once submitted by the employee."
    />
  );
}

function AppraisalFormTab() {
  return (
    <EmptyState
      icon={ClipboardList}
      title="No Appraisal Form data yet"
      description="The Appraisal Form will appear here once the employee completes their self-assessment."
    />
  );
}

function RCATab() {
  return (
    <EmptyState
      icon={SearchCode}
      title="No RCA data yet"
      description="Root Cause Analysis is generated automatically when a KPI achievement falls below the 80% threshold."
    />
  );
}

function ProjectCheckInTab() {
  return (
    <EmptyState
      icon={FolderKanban}
      title="No Project Outside Job Scope data yet"
      description="Project data will appear here once a project is registered and approved in PA Setting."
    />
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Tab = "KPI Tracking" | "SMART Goals" | "Appraisal Form" | "RCA" | "Project Check-In";

const TABS: { id: Tab; icon: React.ElementType }[] = [
  { id: "KPI Tracking",    icon: TrendingUp   },
  { id: "SMART Goals",     icon: Lightbulb    },
  { id: "Appraisal Form",  icon: ClipboardList },
  { id: "RCA",             icon: SearchCode   },
  { id: "Project Check-In", icon: FolderKanban },
];

export function StaffMeasurementPage() {
  const [activeTab, setActiveTab] = useState<Tab>("KPI Tracking");
  const { activeUser } = useAuthStore();

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-[#1A284F] mb-1">Performance Appraisal Measurement</h1>
        <p className="text-gray-500 text-sm">{activeUser.name} ({activeUser.employeeId}) · Performance Year 2026</p>
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? "border-[#1A284F] text-[#1A284F] bg-gray-50" : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}
          >
            <Icon className="w-4 h-4" />
            {id}
          </button>
        ))}
      </div>

      {activeTab === "KPI Tracking"    && <KPITrackingTab />}
      {activeTab === "SMART Goals"     && <SMARTGoalsTab />}
      {activeTab === "Appraisal Form"  && <AppraisalFormTab />}
      {activeTab === "RCA"             && <RCATab />}
      {activeTab === "Project Check-In" && <ProjectCheckInTab />}
    </div>
  );
}
