import { useNavigate } from "react-router";
import { Users, UserCheck, LogOut, Crown, User } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSG from "@/imports/Logo_Sambu_Group_transparent.png";
import worldMap from "@/imports/image-3.png";

const ROLES = [
  {
    title: "Administrator",
    description: "Manage modules, track overall progress, reports, and analytics. Restricted to HR Administrators.",
    icon: UserCheck,
    path: "/hr",
    cardClass: "bg-slate-50 border-slate-500 hover:bg-slate-100 focus-visible:ring-slate-500",
    iconClass: "bg-slate-100 border-slate-300 text-[#1A284F]",
  },
  {
    title: "Board of Directors",
    description: "View analytics dashboard, monitor appraisal progress, review approvals, calibration, and documents.",
    icon: Crown,
    path: "/bod",
    cardClass: "bg-violet-50 border-violet-500 hover:bg-violet-100 focus-visible:ring-violet-500",
    iconClass: "bg-violet-100 border-violet-300 text-violet-800",
  },
  {
    title: "Employee — Supervisor",
    description: "Set and review goals, complete self-assessments, provide team feedback, and evaluate team performance.",
    icon: Users,
    path: "/supervisor",
    cardClass: "bg-sky-50 border-sky-600 hover:bg-sky-100 focus-visible:ring-sky-600",
    iconClass: "bg-sky-100 border-sky-300 text-sky-800",
  },
  {
    title: "Employee — Staff",
    description: "Track KPI progress, submit SMART Goals, complete self-appraisal, and monitor your performance cycle.",
    icon: User,
    path: "/employee",
    cardClass: "bg-emerald-50 border-emerald-600 hover:bg-emerald-100 focus-visible:ring-emerald-600",
    iconClass: "bg-emerald-100 border-emerald-300 text-emerald-800",
  },
];

export function RoleSelector() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col">
      {/* World-map background */}
      <img
        src={worldMap}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] object-contain opacity-50"
      />

      {/* Logo */}
      <div className="relative z-10 flex justify-center pt-10 pb-6">
        <ImageWithFallback src={logoSG} alt="Sambu Group" className="h-24 object-contain" />
      </div>

      {/* Role selection card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16">
        <div className="max-w-5xl w-full bg-white/90 backdrop-blur-md rounded-2xl p-5 sm:p-10 shadow-lg border-2 border-slate-300">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Performance Appraisal</h1>
            <p className="text-gray-500 text-sm">Select your role to continue</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 w-full">
            {ROLES.map((role) => (
              <RoleCard key={role.path} role={role} onClick={() => navigate(role.path)} />
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => navigate("/pa-simulasi")}
              className="mr-3 rounded-xl border-2 border-teal-600 bg-teal-50 px-6 py-2.5 text-sm font-semibold text-teal-900 hover:bg-teal-100 focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Masuk PA-Simulasi
            </button>
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 font-medium text-sm shadow-sm hover:shadow transition-all border border-gray-200 hover:border-red-200"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center text-xs text-gray-400 pb-5">
        Copyright © 2026 Sambu Group
      </div>
    </div>
  );
}

function RoleCard({
  role,
  onClick,
}: {
  role: typeof ROLES[0];
  onClick: () => void;
}) {
  const Icon = role.icon;
  return (
    <button
      onClick={onClick}
      className={`group border-2 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 ${role.cardClass}`}
    >
      <div
        className={`w-14 h-14 rounded-2xl border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200 ${role.iconClass}`}
      >
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-2 leading-snug">{role.title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{role.description}</p>
    </button>
  );
}
