import { useState } from "react";
import { Plus, Pencil, Trash2, Info, AlertCircle, Play } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export function GoalSetting() {
  const [activeTab, setActiveTab] = useState("Common Goals");

  return (
    <div className="w-full pb-24 relative h-full flex flex-col">
      <div className="flex justify-between items-start mb-8 shrink-0">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Performance Appraisal Setting - 2027</h1>
          <p className="text-gray-500 text-sm">Define your performance goals for the year</p>
        </div>
        <div className="px-4 py-1.5 bg-gray-100 text-gray-600 font-medium text-sm rounded-full">
          Draft
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex justify-between items-end border-b border-gray-200 shrink-0">
        <div className="flex gap-2">
          {["Common Goals", "Shared Goals", "Individual Goals", "Revised Goals (Optional)"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium rounded-t-lg transition-colors border border-b-0 ${
                activeTab === tab
                  ? "bg-[#1A284F] text-white border-[#1A284F]"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="pb-2 pr-2">
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            <Plus className="w-4 h-4" />
            Add Goal
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pt-6 flex flex-col gap-6">
        {/* Goal 1 Display */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
          <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 mb-4">
            Goal 1
          </div>
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-lg font-bold text-gray-700">Enhance System reliability</h3>
            <div className="flex items-center gap-3">
              <button className="text-[#1A284F] hover:bg-blue-50 p-1.5 rounded transition-colors">
                <Pencil className="w-5 h-5" />
              </button>
              <button className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-6 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">KPI*</p>
              <p className="text-sm text-gray-600">Enhance System reliability</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Target*</p>
              <p className="text-sm text-gray-600">99.9% Uptime</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Timeline*</p>
              <p className="text-sm text-gray-600">Q1-Q4 2026</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Significance Level*</p>
              <p className="text-sm text-gray-600">Medium (M)</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Influence Level*</p>
              <p className="text-sm text-gray-600">Medium (M)</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Weight*</p>
              <p className="text-sm text-gray-600">20%</p>
            </div>
          </div>
        </div>

        {/* Goal 2 Form */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Performance Goal 2*
              </label>
              <Input 
                placeholder="e.g., Enhance system reliability" 
                className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus-visible:ring-[#1A284F] focus-visible:bg-white focus-visible:border-[#1A284F]" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                KPI *
              </label>
              <Input 
                placeholder="e.g., System uptime percentage" 
                className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus-visible:ring-[#1A284F] focus-visible:bg-white focus-visible:border-[#1A284F]" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Target *
              </label>
              <Input 
                placeholder="e.g., 99.9% uptime" 
                className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus-visible:ring-[#1A284F] focus-visible:bg-white focus-visible:border-[#1A284F]" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Timeline *
              </label>
              <Input 
                placeholder="e.g., Q1-Q4 2026" 
                className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus-visible:ring-[#1A284F] focus-visible:bg-white focus-visible:border-[#1A284F]" 
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                Significance Level *
                <Info className="w-4 h-4 text-gray-400" />
              </label>
              <Select defaultValue="medium">
                <SelectTrigger className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus:ring-[#1A284F]">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (L)</SelectItem>
                  <SelectItem value="medium">Medium (M)</SelectItem>
                  <SelectItem value="high">High (H)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                Influence Level *
                <Info className="w-4 h-4 text-gray-400" />
              </label>
              <Select defaultValue="medium">
                <SelectTrigger className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus:ring-[#1A284F]">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (L)</SelectItem>
                  <SelectItem value="medium">Medium (M)</SelectItem>
                  <SelectItem value="high">High (H)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Weight (%) *
              </label>
              <Input 
                placeholder="e.g., 20" 
                className="bg-gray-50 border-transparent w-full text-sm py-2.5 h-auto rounded-lg focus-visible:ring-[#1A284F] focus-visible:bg-white focus-visible:border-[#1A284F]" 
              />
            </div>
            <div className="flex items-end justify-end">
              <Button className="bg-[#1A284F] hover:bg-[#131d3b] text-white px-8 py-6 rounded-full text-sm font-medium h-auto">
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Weight Summary */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm flex flex-col gap-4">
          <h3 className="text-lg font-bold text-gray-900">Weight Summary</h3>
          
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Total Weight Allocation</p>
              <p className="text-3xl font-bold text-[#E33045] mb-2">0%</p>
              <p className="text-sm font-medium text-[#E33045]">
                The total weight must equal exactly 100%. Current total: 0%. Please adjust the weights.
              </p>
            </div>
            
            <div className="bg-[#E33045] text-white text-xs font-medium px-4 py-2 flex items-center gap-1.5 rounded-md">
              <AlertCircle className="w-4 h-4" />
              Must equal 100%
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky Bar */}
      <div className="absolute bottom-0 left-0 right-0 py-6 bg-white border-t border-gray-100 flex justify-end items-center gap-4 z-10 shrink-0">
        <Button variant="outline" className="px-6 py-6 border-gray-200 text-gray-700 font-medium rounded-full hover:bg-gray-50 hover:text-gray-900">
          Save Draft
        </Button>
        <Button disabled className="px-8 py-6 bg-gray-400 text-white font-medium rounded-full flex items-center gap-2">
          Next
          <Play className="w-4 h-4 fill-current" />
        </Button>
      </div>
    </div>
  );
}
