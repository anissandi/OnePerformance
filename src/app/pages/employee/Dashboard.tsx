import { Target, Clock, FileText, CheckCircle2, TrendingUp, Lightbulb, ClipboardList, FolderKanban } from "lucide-react";
import { useNavigate } from "react-router";

const CHECK_IN_LABELS = [
  { label: "KPI", icon: TrendingUp, color: "text-blue-700 bg-blue-50 border-blue-100 hover:bg-blue-100", to: "/employee/measurement/kpi-tracking" },
  { label: "SMART Goals", icon: Lightbulb, color: "text-amber-700 bg-amber-50 border-amber-100 hover:bg-amber-100", to: "/employee/measurement/smart-goals" },
  { label: "Appraisal Form", icon: ClipboardList, color: "text-green-700 bg-green-50 border-green-100 hover:bg-green-100", to: "/employee/measurement/appraisal-form" },
  { label: "Project Outside Job Scope", icon: FolderKanban, color: "text-teal-700 bg-teal-50 border-teal-100 hover:bg-teal-100", to: "/employee/measurement/project-outside" },
];

export function EmployeeDashboard() {
  const navigate = useNavigate();

  return (
    <div className="w-full flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back, Anis Sandi</h2>
        <p className="text-sm text-gray-500">Here is your current appraisal cycle overview</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-gray-900 mb-4">Current Cycle: 2026 Performance Appraisal</h3>

        <div className="relative">
          <div className="absolute left-8 top-10 bottom-10 w-0.5 bg-gray-100"></div>

          <div className="flex flex-col gap-6 relative z-10">
            <StepItem
              icon={<Target className="w-5 h-5 text-white" />}
              iconBg="bg-green-500"
              title="Performance Appraisal Setting"
              date="Completed on 15/01/2026"
              status="Completed"
              statusColor="text-green-600 bg-green-50"
            />

            {/* Performance Appraisal Measurement — custom step with mini labels */}
            <div className="flex items-start gap-6 p-4 rounded-xl bg-blue-50/50 border border-blue-100">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm z-10 bg-[#EEDDBB]">
                <Clock className="w-5 h-5 text-[#1A284F]" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="text-lg font-semibold text-gray-900">Performance Appraisal Measurement</h4>
                  <span className="px-2.5 py-1 rounded-md text-xs font-semibold text-orange-600 bg-orange-50">Pending Action</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">Due 30/07/2026</p>
                <div className="flex items-center gap-3 flex-wrap">
                  {CHECK_IN_LABELS.map(({ label, icon: Icon, color, to }) => (
                    <button
                      key={label}
                      onClick={() => navigate(to)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${color}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <StepItem
              icon={<CheckCircle2 className="w-5 h-5 text-gray-400" />}
              iconBg="bg-gray-100"
              title="Performance Appraisal Approval"
              date="Due 01/08/2026"
              status="Not Started"
              statusColor="text-gray-500 bg-gray-100"
            />

            <StepItem
              icon={<FileText className="w-5 h-5 text-gray-400" />}
              iconBg="bg-gray-100"
              title="My Performance Appraisal"
              date="Due 01/12/2026"
              status="Not Started"
              statusColor="text-gray-500 bg-gray-100"
            />
          </div>
        </div>
      </div>
      
      <div className="bg-[#1A284F] text-white rounded-2xl p-6 relative overflow-hidden">
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">Performance Appraisal Feedback</h3>
            <p className="text-blue-100 text-sm mb-4">Feedback received from your Approver on your appraisal submission.</p>
            <div className="flex items-center gap-3 flex-wrap mb-5">
              {[
                { label: "KPI", icon: TrendingUp, color: "bg-blue-400/20 text-blue-100 border-blue-300/30 hover:bg-blue-400/30", to: "/employee/measurement/kpi-tracking" },
                { label: "SMART Goals", icon: Lightbulb, color: "bg-amber-400/20 text-amber-100 border-amber-300/30 hover:bg-amber-400/30", to: "/employee/measurement/smart-goals" },
                { label: "Appraisal Form", icon: ClipboardList, color: "bg-green-400/20 text-green-100 border-green-300/30 hover:bg-green-400/30", to: "/employee/measurement/appraisal-form" },
                { label: "Project Outside Job Scope", icon: FolderKanban, color: "bg-teal-400/20 text-teal-100 border-teal-300/30 hover:bg-teal-400/30", to: "/employee/measurement/project-outside" },
              ].map(({ label, icon: Icon, color, to }) => (
                <button key={label} onClick={() => navigate(to)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
          </div>
          </div>
          <Target className="w-28 h-28 text-white/5 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function StepItem({ icon, iconBg, title, date, status, statusColor, actionText, onAction, isActive = false }: any) {
  return (
    <div className={`flex items-start gap-6 p-4 rounded-xl transition-colors ${isActive ? 'bg-blue-50/50 border border-blue-100' : ''}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm z-10 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start mb-1">
          <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${statusColor}`}>{status}</span>
        </div>
        <p className="text-sm text-gray-500 mb-3">{date}</p>
        {actionText && (
          <button 
            onClick={onAction}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-[#1A284F] text-white hover:bg-[#131d3b]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {actionText}
          </button>
        )}
      </div>
    </div>
  );
}
