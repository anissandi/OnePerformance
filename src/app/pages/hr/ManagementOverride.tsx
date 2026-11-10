import { useState, useEffect } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import { Search, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
// force reload
import { Input } from "../../components/ui/input";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";
import { toast } from "sonner";

const INITIAL_DATA: Array<{ id: string; name: string; role: string; division: string; status: string; date: string }> = [];

export function HRManagementOverride() {
  const [activeTab, setActiveTab] = useRouteTab(["Reviewer Delegation", "Audit Trail"], "Reviewer Delegation");
  const [rows, setRows] = useState(() => loadPersistedState("pa_mgmt_override_rows_v1", INITIAL_DATA));
  const [search, setSearch] = useState("");

  useEffect(() => {
    const onHydrated = () => setRows(loadPersistedState("pa_mgmt_override_rows_v1", INITIAL_DATA));
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const handleReassign = (idx: number) => {
    const target = rows[idx];
    if (!target) return;
    const today = new Date().toISOString().slice(0, 10);
    const next = rows.map((r, i) =>
      i === idx ? { ...r, status: "Reassigned", date: today } : r
    );
    setRows(next);
    savePersistedState("pa_mgmt_override_rows_v1", next, {
      kind: "management-override",
      overrideId: `OVR-${target.id}`,
      employeeId: `E0${target.id}`,
      module: "Performance Appraisal",
      data: next[idx],
      audit: {
        action: "Update",
        module: "HR Settings",
        subModule: "Management Override",
        description: `Reassigned reviewer delegation for ${target.name} (${target.role} · ${target.division})`,
      },
    });
    toast.success(`Reviewer delegation reassigned for ${target.name} (${target.role}) and saved to Supabase.`);
  };

  const filtered = rows.filter(
    (r) =>
      !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.role.toLowerCase().includes(search.toLowerCase()) ||
      r.division.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1A284F] mb-2">Management Override</h1>
        <p className="text-gray-500">Manage reviewer delegation and view audit trail</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          <button
            onClick={() => setActiveTab("Reviewer Delegation")}
            className={`pb-4 px-6 font-medium text-sm transition-colors border-b-2 ${
              activeTab === "Reviewer Delegation" 
                ? "text-[#1A284F] border-[#1A284F]" 
                : "text-gray-500 border-transparent hover:text-gray-800"
            }`}
          >
            Reviewer Delegation
          </button>
          <button
            onClick={() => setActiveTab("Audit Trail")}
            className={`pb-4 px-6 font-medium text-sm transition-colors border-b-2 ${
              activeTab === "Audit Trail" 
                ? "text-[#1A284F] border-[#1A284F]" 
                : "text-gray-500 border-transparent hover:text-gray-800"
            }`}
          >
            Audit Trail
          </button>
        </div>

        {/* Search */}
        <div className="flex gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..." 
              className="pl-12 py-6 bg-[#FAFAFA] border-gray-200 rounded-xl w-full text-base"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50">
                <th className="py-4 px-6 font-semibold">Actions</th>
                <th className="py-4 px-6 font-semibold w-16">S/N</th>
                <th className="py-4 px-6 font-semibold">Employee</th>
                <th className="py-4 px-6 font-semibold">Coy./Div./Grp.</th>
                <th className="py-4 px-6 font-semibold">Status</th>
                <th className="py-4 px-6 font-semibold">Submitted Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <Button
                      onClick={() => handleReassign(idx)}
                      className="bg-[#1A284F] hover:bg-[#1A284F]/90 text-white rounded-full px-6 py-2 text-sm font-medium"
                    >
                      Reassign
                    </Button>
                  </td>
                  <td className="py-4 px-6 text-gray-500 text-sm">{row.id}</td>
                  <td className="py-4 px-6">
                    <div className="text-sm font-medium text-gray-900">{row.name}</div>
                    <div className="text-xs text-gray-500">{row.role}</div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600">{row.division}</td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                      <CheckCircle2 className="w-5 h-5" />
                      {row.status}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-600">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
