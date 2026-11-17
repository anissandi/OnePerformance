import { Eye, UserCheck } from "lucide-react";
import { useRouteTab } from "../../utils/useRouteTab";
import { ApproverMonitoringTable, DelegationTable } from "../../components/approval/DelegationTable";

/** Settings → Approval Management: tab Approver Monitoring & Delegation. */
export function HRApprovalManagement() {
  const [activeTab, setActiveTab] = useRouteTab<"monitoring" | "delegation">(["monitoring", "delegation"], "monitoring");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A284F]">Approval Management</h1>
        <p className="mt-1 text-sm text-gray-500">Monitoring Approver 1 & Approver 2 seluruh karyawan dan pengaturan delegasi approval.</p>
      </div>
      <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
        {([
          { id: "monitoring", label: "Approver Monitoring", Icon: Eye },
          { id: "delegation", label: "Delegation", Icon: UserCheck },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold ${activeTab === id ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500"}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {activeTab === "monitoring" ? <ApproverMonitoringTable /> : <DelegationTable mode="settings" />}
    </div>
  );
}

/** Approvals → Delegation (untuk karyawan / role yang diberi akses submenu). */
export function ApprovalsDelegationPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A284F]">Delegation</h1>
        <p className="mt-1 text-sm text-gray-500">Delegasikan tugas approval Anda (KPI Setting, KPI Tracking, SMART Goals Setting) kepada karyawan lain.</p>
      </div>
      <DelegationTable mode="approvals" />
    </div>
  );
}
