import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../../components/ui/button";
// force reload
import { useNavigate } from "react-router";

export function HRMidYearCheckInDetails() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Common Goals");

  const GOALS = [
    { title: "Improve customer satisfaction", weight: "25%", kpi: "Customer satisfaction score", target: "90% satisfaction rate" },
    { title: "Reduce operational costs", weight: "25%", kpi: "Customer satisfaction score", target: "90% satisfaction rate" },
    { title: "Develop technical expertise", weight: "25%", kpi: "Customer satisfaction score", target: "90% satisfaction rate" },
    { title: "Develop technical expertise", weight: "25%", kpi: "Customer satisfaction score", target: "90% satisfaction rate" },
    { title: "Develop technical expertise", weight: "25%", kpi: "Customer satisfaction score", target: "90% satisfaction rate" },
  ];

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#1A284F] mb-2">Mid Year Measurement</h1>
        <p className="text-gray-500">View submitted goals and manage revision workflows</p>
      </div>

      <div className="flex gap-12 mb-8 items-start">
        <Button 
          onClick={() => navigate(-1)} 
          className="bg-[#1A284F] hover:bg-[#1A284F]/90 text-white px-8 py-5 rounded-xl font-medium text-base h-auto"
        >
          Back
        </Button>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-500 font-medium">Employee Details:</span>
          <span className="text-lg font-bold text-[#1A284F]">Sarah Johnson</span>
          <span className="text-sm text-gray-600">Analyst 1</span>
          <span className="text-sm text-gray-600">iQx/ITD/IMG</span>
          <span className="text-sm text-gray-600">January to June 2026</span>
        </div>
      </div>

      {/* Progress Card */}
      <div className="bg-[#F8FAFC] border border-blue-100 rounded-xl p-8 mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="font-bold text-[#1A284F] text-lg">Overall Progress</h3>
            <p className="text-gray-500 text-sm">Your weighted progress across all goals</p>
          </div>
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
            5 Goals
          </span>
        </div>

        <div className="mb-2 text-4xl font-light tracking-tight text-[#1A284F]">81%</div>
        
        <div className="w-full h-3 bg-gray-300 rounded-full mb-8 overflow-hidden">
          <div className="h-full bg-[#1A284F] rounded-full" style={{ width: '81%' }} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Completed</div>
            <div className="text-2xl text-green-600 font-light">3</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">On Track</div>
            <div className="text-2xl text-[#C69A45] font-light">20</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Needs Attention</div>
            <div className="text-2xl text-red-500 font-light">2</div>
          </div>
        </div>
      </div>

      <h3 className="text-lg font-bold text-[#1A284F] mb-6">Goal Progress Updates</h3>

      {/* Tabs */}
      <div className="flex mb-6 border-b border-gray-200">
        {["Common Goals", "Shared Goals", "Individual Goals"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium text-sm transition-colors border border-b-0 rounded-t-lg -mb-px ${
              activeTab === tab 
                ? "bg-[#1A284F] text-white border-[#1A284F]" 
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Accordions */}
      <div className="space-y-4">
        {GOALS.map((goal, idx) => (
          <div key={idx} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-center mb-2">
              <div className="inline-flex px-3 py-1 rounded-full border border-gray-200 text-xs font-medium text-gray-600 mb-3">
                Weight: {goal.weight}
              </div>
              <ChevronDown className="w-5 h-5 text-[#1A284F]" />
            </div>
            <h4 className="text-lg font-semibold text-[#1A284F] mb-2">{goal.title}</h4>
            <p className="text-sm text-gray-500">
              KPI: {goal.kpi} | Target: {goal.target}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
