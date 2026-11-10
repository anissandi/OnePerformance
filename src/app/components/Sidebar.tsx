import { Link, NavLink, useLocation } from "react-router";
import { useState, useEffect } from "react";
import {
  BarChart2,
  Settings,
  Users,
  Target,
  UserCog,
  CheckSquare,
  FileText,
  Clock,
  ListTodo,
  ClipboardCheck,
  TrendingUp,
  Lightbulb,
  ClipboardList,
  Briefcase,
  FolderKanban,
  MessageSquare,
  ChevronDown,
  Shield,
  Menu,
  FileSearch,
  BookOpen,
  LayoutList,
  RefreshCw,
  FolderOpen,
  LockOpen,
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSG from "@/imports/Logo_Sambu_Group_transparent.png";
import { useAuthStore } from "../store/authStore";

type Role = "hr" | "employee" | "supervisor" | "bod";

const hrLinks = [
  { to: "/hr", icon: BarChart2, label: "Analytics Dashboard", exact: true },
  { to: "/hr/profile", icon: UserCog, label: "My Profile" },
  {
    label: "Approvals",
    icon: CheckSquare,
    subLinks: [
      { to: "/hr/settings/kpi", label: "KPI Business", icon: TrendingUp },
      { to: "/hr/approvals/measurement", label: "Performance Appraisal Measurement", icon: Clock },
      { to: "/hr/approvals/setting", label: "Performance Appraisal Setting", icon: Target },
      { to: "/hr/settings/open-lock", label: "Open Lock", icon: LockOpen },
    ]
  },
  {
    label: "Performance Appraisal Monitoring",
    icon: ClipboardCheck,
    subLinks: [
      { to: "/hr/monitoring/kpi", label: "KPI", icon: TrendingUp },
      { to: "/hr/monitoring/smart-goals", label: "SMART Goals", icon: Lightbulb },
      { to: "/hr/monitoring/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
      { to: "/hr/monitoring/managerial-skill", label: "Managerial Skill", icon: Briefcase },
      { to: "/hr/monitoring/project", label: "Project Outside Job Scope", icon: FolderKanban },
      { to: "/hr/monitoring/management-interview", label: "Management Interview", icon: MessageSquare },
    ]
  },
  { to: "/hr/summary", icon: LayoutList, label: "Performance Appraisal Summary" },
  {
    label: "Calibration",
    icon: Target,
    subLinks: [
      { to: "/hr/calibration/setting", label: "Setting", icon: Settings },
      { to: "/hr/calibration/verification", label: "Verification", icon: CheckSquare },
      { to: "/hr/calibration/adjustment", label: "Adjustment", icon: RefreshCw },
      { to: "/hr/calibration/management-interview", label: "Management Interview", icon: MessageSquare },
    ]
  },
  {
    label: "Evidence",
    icon: FolderOpen,
    subLinks: [
      { to: "/hr/evidence/kpi-tracking", label: "KPI Tracking", icon: TrendingUp },
      { to: "/hr/evidence/rca", label: "RCA", icon: RefreshCw },
      { to: "/hr/evidence/smart-goals", label: "SMART Goals", icon: Lightbulb },
      { to: "/hr/evidence/management-interview", label: "Management Interview", icon: MessageSquare },
    ]
  },
  { to: "/hr/history", icon: BookOpen, label: "PA Cycle History" },
  { to: "/hr/documents", icon: BookOpen, label: "Documents" },
  {
    label: "Setting",
    icon: Settings,
    subLinks: [
      { label: "Master", icon: ListTodo, children: [
          { to: "/hr/settings/master/kpi", label: "KPI", icon: TrendingUp },
          { to: "/hr/settings/master/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
          { to: "/hr/settings/master/managerial-skill", label: "Managerial Skill", icon: Briefcase },
        ]},
      { to: "/hr/settings/scores-calibration", label: "Scores Setting", icon: TrendingUp },
      { to: "/hr/modules", label: "Module Activation", icon: Settings },
      { to: "/hr/settings/cycle", label: "Cycle Management", icon: RefreshCw },
      { to: "/hr/settings/approval-management", label: "Approval Management", icon: CheckSquare },
      { to: "/hr/settings/user-management", label: "User Management", icon: Users },
      { to: "/hr/settings/access-management", label: "Access Management", icon: Shield },
      { to: "/hr/settings/menu-management", label: "Menu Management", icon: Menu },
      { to: "/hr/settings/data-sync", label: "Data Sync", icon: RefreshCw },
      { to: "/hr/settings/audit-trail", label: "Audit Trail", icon: FileSearch },
    ]
  },
];


const supervisorLinks = [
  { to: "/supervisor", icon: ListTodo, label: "Dashboard", exact: true },
  { to: "/supervisor/profile", icon: UserCog, label: "My Profile" },
  { to: "/supervisor/appraisal", icon: FileText, label: "My Performance Appraisal" },
  {
    label: "Approvals",
    icon: CheckSquare,
    subLinks: [
      { to: "/supervisor/approvals/measurement", label: "Performance Appraisal Measurement", icon: Clock },
      { to: "/supervisor/appraisals/setting", label: "Performance Appraisal Setting", icon: Target },
    ]
  },
  { to: "/supervisor/summary", icon: LayoutList, label: "Performance Appraisal Summary" },
  {
    label: "Performance Appraisal Monitoring",
    icon: ClipboardCheck,
    subLinks: [
      { to: "/supervisor/monitoring/kpi", label: "KPI", icon: TrendingUp },
      { to: "/supervisor/monitoring/smart-goals", label: "SMART Goals", icon: Lightbulb },
      { to: "/supervisor/monitoring/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
      { to: "/supervisor/monitoring/managerial-skill", label: "Managerial Skill", icon: Briefcase },
      { to: "/supervisor/monitoring/project", label: "Project Outside Job Scope", icon: FolderKanban },
      { to: "/supervisor/monitoring/inter-department-feedback", label: "Inter-Department Feedback", icon: Users },
    ]
  },
  {
    label: "Performance Appraisal Setting",
    icon: Target,
    subLinks: [
      { to: "/supervisor/setting/kpi", label: "KPI", icon: TrendingUp },
      { to: "/supervisor/setting/smart-goals", label: "SMART Goals", icon: Lightbulb },
    ]
  },
  {
    label: "Performance Appraisal Measurement",
    icon: Clock,
    subLinks: [
      { to: "/supervisor/measurement/kpi-tracking", label: "KPI Tracking", icon: TrendingUp },
      { to: "/supervisor/measurement/rca", label: "RCA (Root Cause Analysis)", icon: FileText },
      { to: "/supervisor/measurement/smart-goals", label: "SMART Goals", icon: Lightbulb },
      { to: "/supervisor/measurement/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
      { to: "/supervisor/measurement/project-outside", label: "Project Outside Job Scope", icon: FolderKanban },
      { to: "/supervisor/measurement/managerial-skill", label: "Managerial Skill", icon: Briefcase },
      { to: "/supervisor/measurement/inter-department-feedback", label: "Inter-Department Feedback", icon: Users },
    ]
  },
  {
    label: "Calibration",
    icon: Target,
    subLinks: [
      { to: "/supervisor/calibration/team-performance", label: "Team Performance", icon: BarChart2 },
      { to: "/supervisor/calibration/management-interview", label: "Management Interview", icon: MessageSquare },
    ]
  },
  { to: "/supervisor/history", icon: BookOpen, label: "PA Cycle History" },
  { to: "/supervisor/documents", icon: BookOpen, label: "Documents" },
];

const bodLinks = [
  { to: "/bod", icon: BarChart2, label: "Analytics Dashboard", exact: true },
  {
    label: "Approvals",
    icon: CheckSquare,
    subLinks: [
      { to: "/bod/approvals/measurement", label: "Performance Appraisal Measurement", icon: Clock },
      { to: "/bod/approvals/setting", label: "Performance Appraisal Setting", icon: Target },
      { to: "/bod/approvals/management-interview", label: "Management Interview", icon: MessageSquare },
      { to: "/bod/approvals/calibration", label: "Calibration", icon: Target },
    ]
  },
  {
    label: "Performance Appraisal Monitoring",
    icon: ClipboardCheck,
    subLinks: [
      { to: "/bod/monitoring/kpi", label: "KPI", icon: TrendingUp },
      { to: "/bod/monitoring/smart-goals", label: "SMART Goals", icon: Lightbulb },
      { to: "/bod/monitoring/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
      { to: "/bod/monitoring/managerial-skill", label: "Managerial Skill", icon: Briefcase },
      { to: "/bod/monitoring/project", label: "Project Outside Job Scope", icon: FolderKanban },
      { to: "/bod/monitoring/management-interview", label: "Management Interview", icon: MessageSquare },
    ]
  },
  { to: "/bod/summary", icon: LayoutList, label: "Performance Appraisal Summary" },
  {
    label: "Calibration",
    icon: Target,
    subLinks: [
      { to: "/bod/calibration/adjustment", label: "Adjustment", icon: RefreshCw },
    ]
  },
  { to: "/bod/management-interview/assessment", icon: MessageSquare, label: "Management Interview" },
  { to: "/bod/history", icon: BookOpen, label: "PA Cycle History" },
  { to: "/bod/documents", icon: BookOpen, label: "Documents" },
];

const employeeLinks = [
  { to: "/employee", icon: BarChart2, label: "Dashboard", exact: true },
  { to: "/employee/profile", icon: UserCog, label: "My Profile" },
  { to: "/employee/appraisal", icon: FileText, label: "My Performance Appraisal" },
  {
    label: "Performance Appraisal Setting",
    icon: Target,
    subLinks: [
      { to: "/employee/setting/kpi",         label: "KPI",         icon: TrendingUp   },
      { to: "/employee/setting/smart-goals", label: "SMART Goals", icon: Lightbulb    },
    ],
  },
  {
    label: "Performance Appraisal Measurement",
    icon: Clock,
    subLinks: [
      { to: "/employee/measurement/kpi-tracking",   label: "KPI Tracking",              icon: TrendingUp    },
      { to: "/employee/measurement/rca",            label: "RCA (Root Cause Analysis)", icon: FileText      },
      { to: "/employee/measurement/smart-goals",    label: "SMART Goals",               icon: Lightbulb     },
      { to: "/employee/measurement/appraisal-form", label: "Appraisal Form",            icon: ClipboardList },
      { to: "/employee/measurement/project-outside",label: "Project Outside Job Scope", icon: FolderKanban  },
      { to: "/employee/measurement/inter-department-feedback", label: "Inter-Department Feedback", icon: Users },
    ],
  },
  { to: "/employee/documents", icon: BookOpen, label: "Documents" },
];

export function Sidebar({ role, collapsed }: { role: string; collapsed: boolean }) {
  const { activeUser, allowedModules } = useAuthStore();
  const hasManagerial = allowedModules.includes("Managerial Skill");
  const hasIdf = allowedModules.includes("Inter-Departement Feedback");
  const hasMi = allowedModules.includes("Management Interview");

  const filteredEmployeeLinks = employeeLinks.map((link) => {
    if (link.label === "Performance Appraisal Measurement" && link.subLinks) {
      return {
        ...link,
        subLinks: link.subLinks.filter((sub) => {
          if (sub.to.endsWith("/inter-department-feedback")) return hasIdf;
          return true;
        }),
      };
    }
    return link;
  });

  const filteredSupervisorLinks = supervisorLinks.map((link) => {
    if (link.label === "Performance Appraisal Measurement" && link.subLinks) {
      return {
        ...link,
        subLinks: link.subLinks.filter((sub) => {
          if (sub.to.endsWith("/managerial-skill")) return hasManagerial;
          if (sub.to.endsWith("/inter-department-feedback")) return hasIdf;
          return true;
        }),
      };
    }
    if (link.label === "Performance Appraisal Monitoring" && link.subLinks) {
      return {
        ...link,
        subLinks: link.subLinks.filter((sub) => {
          if (sub.to.endsWith("/managerial-skill")) return hasManagerial;
          if (sub.to.endsWith("/inter-department-feedback")) return hasIdf;
          return true;
        }),
      };
    }
    return link;
  });

  // Dual-role HR Unit: also acts as an appraisal participant at level Ka./Wa.Ka.Bagian
  const effectiveHrLinks =
    activeUser.role === "HR Unit"
      ? [
          hrLinks[0],
          { to: "/supervisor/appraisal", icon: FileText, label: "My Performance Appraisal" },
          {
            label: "My PA Setting & Measurement",
            icon: Target,
            subLinks: [
              { to: "/supervisor/setting/kpi", label: "KPI Setting", icon: TrendingUp },
              { to: "/supervisor/setting/smart-goals", label: "SMART Goals Setting", icon: Lightbulb },
              { to: "/supervisor/measurement/kpi-tracking", label: "KPI Tracking", icon: TrendingUp },
              { to: "/supervisor/measurement/rca", label: "RCA (Root Cause Analysis)", icon: FileText },
              { to: "/supervisor/measurement/smart-goals", label: "SMART Goals Measurement", icon: Lightbulb },
              { to: "/supervisor/measurement/appraisal-form", label: "Appraisal Form", icon: ClipboardList },
              { to: "/supervisor/measurement/project-outside", label: "Project Outside Job Scope", icon: FolderKanban },
              ...(hasManagerial ? [{ to: "/supervisor/measurement/managerial-skill", label: "Managerial Skill", icon: Briefcase }] : []),
              ...(hasIdf ? [{ to: "/supervisor/measurement/inter-department-feedback", label: "Inter-Department Feedback", icon: Users }] : []),
              ...(hasMi ? [{ to: "/supervisor/setting/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
            ],
          },
          ...hrLinks.slice(1),
        ]
      : hrLinks;

  const links =
    role === "hr"
      ? effectiveHrLinks
      : role === "employee"
      ? filteredEmployeeLinks
      : role === "bod"
      ? bodLinks
      : filteredSupervisorLinks;
  const location = useLocation();

  // Pre-compute which menus have an active child
  const getInitialExpanded = () => {
    const set = new Set<any>();
    links.forEach((link, idx) => {
      if (link.subLinks?.some((sub: any) => {
        if (sub.children) return sub.children.some((c: any) => location.pathname.startsWith(c.to));
        return location.pathname.startsWith(sub.to);
      })) {
        set.add(idx);
      }
      link.subLinks?.forEach((sub: any, sIdx: number) => {
        if (sub.children?.some((c: any) => location.pathname.startsWith(c.to))) {
          set.add(`${idx}-${sIdx}`);
        }
      });
    });
    return set;
  };

  const [expandedMenus, setExpandedMenus] = useState<Set<number>>(getInitialExpanded);

  // Auto-expand when navigating to a child route (e.g. from notification)
  useEffect(() => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      links.forEach((link, idx) => {
        if (link.subLinks?.some((sub: any) => {
          if (sub.children) return sub.children.some((c: any) => location.pathname.startsWith(c.to));
          return location.pathname.startsWith(sub.to);
        })) {
          next.add(idx);
        }
        // Also expand sub-submenus
        link.subLinks?.forEach((sub: any, sIdx: number) => {
          if (sub.children?.some((c: any) => location.pathname.startsWith(c.to))) {
            next.add(`${idx}-${sIdx}` as any);
          }
        });
      });
      return next;
    });
  }, [location.pathname]);

  const toggleMenu = (idx: number) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  return (
    <div
      className={`bg-[#F4F6FC] flex flex-col h-full border-r border-gray-100 transition-[width] duration-300 ease-in-out overflow-hidden shrink-0 ${
        collapsed ? "w-0 border-r-0" : "w-[260px]"
      }`}
    >
      <div className="h-[88px] flex items-end justify-center px-4 pb-1 border-b border-gray-100">
        <ImageWithFallback
          src={logoSG}
          alt="Company Logo"
          className="h-16 w-auto max-w-full object-contain"
        />
      </div>

      <div className="py-6 flex flex-col gap-1 px-4 flex-1 overflow-y-auto">
        {links.map((link, idx) => {
          if (link.subLinks) {
            const isExpanded = expandedMenus.has(idx);
            return (
              <div key={idx} className="mb-2">
                <button
                  onClick={() => toggleMenu(idx)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100/50 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <link.icon className="w-5 h-5" />
                    {link.label}
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-1 mt-1">
                    {link.subLinks.map((sub, sIdx) => {
                      // Sub-submenu (has children array)
                      if ((sub as any).children) {
                        const subKey = `${idx}-${sIdx}`;
                        const isSubExpanded = expandedMenus.has(subKey as any);
                        const SubIcon = sub.icon;
                        return (
                          <div key={sIdx}>
                            <button
                              onClick={() => setExpandedMenus(prev => {
                                const next = new Set(prev);
                                if (next.has(subKey as any)) next.delete(subKey as any);
                                else next.add(subKey as any);
                                return next;
                              })}
                              className="w-full flex items-center justify-between pl-12 pr-4 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 rounded-xl transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {SubIcon && <SubIcon className="w-4 h-4" />}
                                {sub.label}
                              </div>
                              <ChevronDown className={`w-3 h-3 transition-transform ${isSubExpanded ? "rotate-180" : ""}`} />
                            </button>
                            {isSubExpanded && (
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {(sub as any).children.map((child: any, cIdx: number) => (
                                  <NavLink
                                    key={cIdx}
                                    to={child.to}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2 pl-16 pr-4 py-2 text-[11px] font-medium rounded-xl transition-colors ${
                                        isActive ? "bg-[#1A284F] text-white shadow-sm" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100/50"
                                      }`
                                    }
                                  >
                                    {child.icon && <child.icon className="w-3.5 h-3.5" />}
                                    {child.label}
                                  </NavLink>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }
                      // Regular sublink
                      return (
                        <NavLink
                          key={sIdx}
                          to={sub.to}
                          className={({ isActive }) =>
                            `flex items-center gap-2 pl-12 pr-4 py-2.5 text-xs font-medium rounded-xl transition-colors ${
                              isActive ? "bg-[#1A284F] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
                            }`
                          }
                        >
                          {sub.icon && <sub.icon className="w-4 h-4" />}
                          {sub.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={idx}
              to={link.to || ""}
              end={link.exact}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-[#1A284F] text-white shadow-sm" 
                    : "text-gray-600 hover:bg-gray-100/50 hover:text-gray-800"
                }`
              }
            >
              {link.icon && <link.icon className="w-5 h-5" />}
              {link.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
