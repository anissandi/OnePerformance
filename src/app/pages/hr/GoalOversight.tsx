
import { Search, Eye, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
// force reload
import { Input } from "../../components/ui/input";

const DATA = [
  { id: "01", name: "Sarah Johnson", role: "Analyst 1", division: "iQx/ITD/IMG", status: "Approved", date: "2026-02-05" },
  { id: "02", name: "Sarah Johnson", role: "Analyst 2", division: "FMDQD/DOD/CIG", status: "Approved", date: "2026-02-05" },
  { id: "03", name: "Sarah Johnson", role: "Analyst 3", division: "iQx/EMD/BUG", status: "Approved", date: "2026-02-05" },
  { id: "04", name: "Sarah Johnson", role: "Associate 1", division: "FMDQG/MCD/EBG", status: "Approved", date: "2026-02-05" },
  { id: "05", name: "Sarah Johnson", role: "Associate 2", division: "iQx/EMD/BUG", status: "Approved", date: "2026-02-05" },
  { id: "06", name: "Sarah Johnson", role: "Associate 3", division: "FMDQG/MCD/EBG", status: "Approved", date: "2026-02-05" },
  { id: "07", name: "Sarah Johnson", role: "Associate 3", division: "iQx/EMD/BUG", status: "Approved", date: "2026-02-05" },
  { id: "08", name: "Sarah Johnson", role: "Analyst 1", division: "FMDQG/MCD/EBG", status: "Approved", date: "2026-02-05" },
];

export function HRGoalOversight() {
  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1A284F] mb-2">Goal Oversight</h1>
        <p className="text-gray-500">View submitted goals and manage revision workflows</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        {/* Search */}
        <div className="flex gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input 
              placeholder="Search by employee name, ID, or division..." 
              className="pl-12 py-6 bg-[#FAFAFA] border-gray-200 rounded-full w-full text-base"
            />
          </div>
          <Button className="bg-[#C69A45] hover:bg-[#B38A3E] text-white px-10 py-6 rounded-full text-base font-medium">
            Search
          </Button>
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
              {DATA.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-4 px-6">
                    <button className="flex items-center gap-2 px-3 py-1.5 text-[#1A284F] hover:bg-blue-50 rounded-lg text-sm font-medium transition-colors">
                      <Eye className="w-4 h-4" />
                      View
                    </button>
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
