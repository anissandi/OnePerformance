// @refresh reset
import { Link, NavLink, useLocation } from "react-router";
import { useState, useEffect, useRef } from "react";
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
  Bell,
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSG from "@/imports/Logo_Sambu_Group_transparent.png";
import { useAuthStore } from "../store/authStore";
import { useAccessManagement } from "../pages/hr/settings/AccessManagement";
import { isMenuVisibleInMenuManagement, MENU_UPDATED_EVENT } from "../pages/hr/settings/MenuManagement";

type Role = "hr" | "employee" | "supervisor" | "bod";

interface NavSubChild {
  to: string;
  label: string;
  icon?: any;
  menuId?: string;
}

interface NavSubLink {
  to?: string;
  label: string;
  icon?: any;
  menuId?: string;
  children?: NavSubChild[];
}

interface NavTopLink {
  to?: string;
  icon: any;
  label: string;
  exact?: boolean;
  menuId?: string;
  subLinks?: NavSubLink[];
}

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
  const { getRolePermissions } = useAccessManagement();
  const [, setMenuTick] = useState(0);
  useEffect(() => {
    const onMenuUpdate = () => setMenuTick((t) => t + 1);
    window.addEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
    return () => window.removeEventListener(MENU_UPDATED_EVENT, onMenuUpdate);
  }, []);
  const rolePerms = getRolePermissions(activeUser.role || "Employee");
  const canView = (menuId: string) =>
    isMenuVisibleInMenuManagement(menuId) && Boolean(rolePerms[menuId]?.view);

  const hasKpi = allowedModules.includes("KPI (Setting/Measurement)");
  const hasSmart = allowedModules.includes("SMART Goals (Setting/Measurement)");
  const hasAppraisalForm = allowedModules.includes("Appraisals Form");
  const hasProject = allowedModules.includes("Project Outside Job Scope");
  const hasManagerial = allowedModules.includes("Managerial Skill");
  const hasIdf = allowedModules.includes("Inter-Departement Feedback");
  const hasMi = allowedModules.includes("Management Interview");
  const isHrUnitUser = activeUser.role === "HR Unit";

  const buildSettingLink = (p = "/hr"): NavTopLink | null => {
    const masterChildren: NavSubChild[] = [
      ...(canView("setting_master_kpi") ? [{ to: `${p}/settings/master/kpi`, label: "KPI", icon: TrendingUp }] : []),
      ...(canView("setting_master_appraisal") ? [{ to: `${p}/settings/master/appraisal-form`, label: "Appraisal Form", icon: ClipboardList }] : []),
      ...(canView("setting_master_managerial") ? [{ to: `${p}/settings/master/managerial-skill`, label: "Managerial Skill", icon: Briefcase }] : []),
    ];
    const settingSubs: NavSubLink[] = [
      ...(canView("setting_master") && masterChildren.length > 0
        ? [{ label: "Master", icon: ListTodo, children: masterChildren }]
        : []),
      ...(canView("setting_scores") ? [{ to: `${p}/settings/scores-calibration`, label: "Scores Setting", icon: TrendingUp }] : []),
      ...(canView("setting_modules") ? [{ to: `${p}/modules`, label: "Module Activation", icon: Settings }] : []),
      ...(canView("setting_cycle") ? [{ to: `${p}/settings/cycle`, label: "Cycle Management", icon: RefreshCw }] : []),
      ...(canView("setting_approval_mgmt") ? [{ to: `${p}/settings/approval-management`, label: "Approval Management", icon: CheckSquare }] : []),
      ...(canView("setting_user_mgmt") ? [{ to: `${p}/settings/user-management`, label: "User Management", icon: Users }] : []),
      ...(canView("setting_access_mgmt") ? [{ to: `${p}/settings/access-management`, label: "Access Management", icon: Shield }] : []),
      ...(canView("setting_menu_mgmt") ? [{ to: `${p}/settings/menu-management`, label: "Menu Management", icon: Menu }] : []),
      ...(canView("setting_notification") ? [{ to: `${p}/settings/notification-management`, label: "Notification Management", icon: Bell }] : []),
      ...(canView("setting_data_sync") ? [{ to: `${p}/settings/data-sync`, label: "Data Sync", icon: RefreshCw }] : []),
      ...(canView("setting_audit") ? [{ to: `${p}/settings/audit-trail`, label: "Audit Trail", icon: FileSearch }] : []),
    ];
    if (!canView("setting") || settingSubs.length === 0) return null;
    return { label: "Setting", icon: Settings, subLinks: settingSubs };
  };

  const buildEvidenceLink = (p = "/hr"): NavTopLink | null => {
    const subs: NavSubLink[] = [
      ...(canView("evidence_kpi") ? [{ to: `${p}/evidence/kpi-tracking`, label: "KPI Tracking", icon: TrendingUp }] : []),
      ...(canView("evidence_rca") ? [{ to: `${p}/evidence/rca`, label: "RCA", icon: RefreshCw }] : []),
      ...(canView("evidence_smart") ? [{ to: `${p}/evidence/smart-goals`, label: "SMART Goals", icon: Lightbulb }] : []),
      ...(canView("evidence_interview") ? [{ to: `${p}/evidence/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
    ];
    if (!canView("evidence") || subs.length === 0) return null;
    return { label: "Evidence", icon: FolderOpen, subLinks: subs };
  };

  const buildLinksForPortal = (): NavTopLink[] => {
    const isStandardParticipantRole =
      activeUser.role === "Employee" ||
      activeUser.role === "Supervisor" ||
      activeUser.role === "GM" ||
      activeUser.role === "HR Unit";

    const canViewDashboard =
      canView("dashboard") || canView("dashboard_my") || canView("dashboard_approval");
    const onlyApprovalDashboard =
      !canView("dashboard_my") && canView("dashboard_approval");

    if (role === "hr" && !isStandardParticipantRole) {
      const list: NavTopLink[] = [];
      if (canView("analytics")) {
        list.push({ to: "/hr", icon: BarChart2, label: "Analytics Dashboard", exact: true });
      }
      if (canViewDashboard) {
        list.push({
          to: onlyApprovalDashboard ? "/hr/dashboard/approval" : "/hr/dashboard",
          icon: ListTodo,
          label: "Dashboard",
          exact: !onlyApprovalDashboard,
        });
      }
      if (canView("profile")) {
        list.push({ to: "/hr/profile", icon: UserCog, label: "My Profile" });
      }
      if (canView("appraisal")) {
        list.push({ to: "/hr/appraisal", icon: FileText, label: "My Performance Appraisal" });
      }
      const paSettingSubs: NavSubLink[] = [
        ...(canView("pa_setting_kpi") ? [{ to: "/hr/setting/kpi", label: "KPI", icon: TrendingUp }] : []),
        ...(canView("pa_setting_smart") ? [{ to: "/hr/setting/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_setting_project") ? [{ to: "/hr/setting/project", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_setting_interview") ? [{ to: "/hr/setting/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
      ];
      if (canView("pa_setting") && paSettingSubs.length > 0) {
        list.push({ label: "Performance Appraisal Setting", icon: Target, subLinks: paSettingSubs });
      }
      const paMeasSubs: NavSubLink[] = [
        ...(canView("pa_measurement_kpi") ? [{ to: "/hr/measurement/kpi-tracking", label: "KPI Tracking", icon: TrendingUp }] : []),
        ...(canView("pa_measurement_rca") ? [{ to: "/hr/measurement/rca", label: "RCA (Root Cause Analysis)", icon: FileText }] : []),
        ...(canView("pa_measurement_smart") ? [{ to: "/hr/measurement/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_measurement_appraisal") ? [{ to: "/hr/measurement/appraisal-form", label: "Appraisal Form", icon: ClipboardList }] : []),
        ...(canView("pa_measurement_project") ? [{ to: "/hr/measurement/project-outside", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_measurement_managerial") ? [{ to: "/hr/measurement/managerial-skill", label: "Managerial Skill", icon: Briefcase }] : []),
        ...(canView("pa_measurement_feedback") ? [{ to: "/hr/measurement/inter-department-feedback", label: "Inter-Department Feedback", icon: Users }] : []),
        ...(canView("pa_measurement_interview") ? [{ to: "/hr/setting/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
      ];
      if (canView("pa_measurement") && paMeasSubs.length > 0) {
        list.push({ label: "Performance Appraisal Measurement", icon: Clock, subLinks: paMeasSubs });
      }

      const approvalSubs: NavSubLink[] = [
        ...(canView("approvals_kpi_business") || canView("approvals_kpi_business_group") || canView("approvals_kpi_business_unit")
          ? [{ to: "/hr/settings/kpi", label: "KPI Business", icon: TrendingUp }]
          : []),
        ...(canView("approvals_pa_setting") ? [{ to: "/hr/approvals/setting", label: "Performance Appraisal Setting", icon: Target }] : []),
        ...(canView("approvals_pa_measurement") ? [{ to: "/hr/approvals/measurement", label: "Performance Appraisal Measurement", icon: Clock }] : []),
        ...(canView("approvals_mgmt_interview") ? [{ to: "/hr/approvals/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("approvals_calibration") ? [{ to: "/hr/approvals/calibration", label: "Calibration", icon: Target }] : []),
        ...(canView("approvals_open_lock") ? [{ to: "/hr/settings/open-lock", label: "Open Lock", icon: LockOpen }] : []),
      ];
      if (canView("approvals") && approvalSubs.length > 0) {
        list.push({ label: "Approvals", icon: CheckSquare, subLinks: approvalSubs });
      }

      const monitoringSubs: NavSubLink[] = [
        ...(canView("pa_monitoring_kpi") && (!isHrUnitUser || hasKpi) ? [{ to: "/hr/monitoring/kpi", label: "KPI", icon: TrendingUp }] : []),
        ...(canView("pa_monitoring_smart") && (!isHrUnitUser || hasSmart) ? [{ to: "/hr/monitoring/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_monitoring_appraisal") && (!isHrUnitUser || hasAppraisalForm) ? [{ to: "/hr/monitoring/appraisal-form", label: "Appraisal Form", icon: ClipboardList }] : []),
        ...(canView("pa_monitoring_managerial") && (!isHrUnitUser || hasManagerial) ? [{ to: "/hr/monitoring/managerial-skill", label: "Managerial Skill", icon: Briefcase }] : []),
        ...(canView("pa_monitoring_project") && (!isHrUnitUser || hasProject) ? [{ to: "/hr/monitoring/project", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_monitoring_interview") && (!isHrUnitUser || hasMi) ? [{ to: "/hr/monitoring/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("pa_monitoring_feedback") && (!isHrUnitUser || hasIdf) ? [{ to: "/hr/monitoring/inter-department-feedback", label: "Inter-Department Feedback", icon: Users }] : []),
      ];
      if (canView("pa_monitoring") && monitoringSubs.length > 0) {
        list.push({ label: "Performance Appraisal Monitoring", icon: ClipboardCheck, subLinks: monitoringSubs });
      }

      if (canView("pa_summary")) {
        list.push({ to: "/hr/summary", icon: LayoutList, label: "Performance Appraisal Summary" });
      }

      const calSubs: NavSubLink[] = [
        ...(canView("calibration_setting") ? [{ to: "/hr/calibration/setting", label: "Setting", icon: Settings }] : []),
        ...(canView("calibration_verification") ? [{ to: "/hr/calibration/verification", label: "Verification", icon: CheckSquare }] : []),
        ...(canView("calibration_adjustment") ? [{ to: "/hr/calibration/adjustment", label: "Adjustment", icon: RefreshCw }] : []),
        ...(canView("calibration_interview") ? [{ to: "/hr/calibration/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("calibration_team_performance") ? [{ to: "/hr/calibration/team-performance", label: "Team Performance", icon: BarChart2 }] : []),
      ];
      if (canView("calibration") && calSubs.length > 0) {
        list.push({ label: "Calibration", icon: Target, subLinks: calSubs });
      }

      const evLink = buildEvidenceLink("/hr");
      if (evLink) list.push(evLink);

      const miSubs: NavSubLink[] = [
        ...(canView("mgmt_interview_invitation") ? [{ to: "/hr/management-interview/invitation", label: "Invitation", icon: MessageSquare }] : []),
      ];
      if (canView("management_interview") && miSubs.length > 0) {
        list.push({ label: "Management Interview", icon: MessageSquare, subLinks: miSubs });
      }

      if (canView("history")) {
        list.push({ to: "/hr/history", icon: BookOpen, label: "PA Cycle History" });
      }
      if (canView("documents")) {
        list.push({ to: "/hr/documents", icon: BookOpen, label: "Documents" });
      }
      if (canView("override")) {
        list.push({ to: "/hr/override", icon: Shield, label: "Management Override" });
      }

      const settingLink = buildSettingLink("/hr");
      if (settingLink) list.push(settingLink);

      return list;
    }

    if (role === "bod") {
      const list: NavTopLink[] = [];
      if (canView("analytics")) {
        list.push({ to: "/bod", icon: BarChart2, label: "Analytics Dashboard", exact: true });
      }
      if (canViewDashboard) {
        list.push({
          to: onlyApprovalDashboard ? "/bod/dashboard/approval" : "/bod/dashboard",
          icon: ListTodo,
          label: "Dashboard",
          exact: !onlyApprovalDashboard,
        });
      }
      if (canView("profile")) {
        list.push({ to: "/bod/profile", icon: UserCog, label: "My Profile" });
      }
      if (canView("appraisal")) {
        list.push({ to: "/bod/appraisal", icon: FileText, label: "My Performance Appraisal" });
      }
      const paSettingSubs: NavSubLink[] = [
        ...(canView("pa_setting_kpi") && hasKpi ? [{ to: "/bod/setting/kpi", label: "KPI", icon: TrendingUp }] : []),
        ...(canView("pa_setting_smart") && hasSmart ? [{ to: "/bod/setting/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_setting_project") && hasProject ? [{ to: "/bod/setting/project", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_setting_interview") && hasMi ? [{ to: "/bod/setting/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
      ];
      if (canView("pa_setting") && paSettingSubs.length > 0) {
        list.push({ label: "Performance Appraisal Setting", icon: Target, subLinks: paSettingSubs });
      }

      const paMeasSubs: NavSubLink[] = [
        ...(canView("pa_measurement_kpi") && hasKpi ? [{ to: "/bod/measurement/kpi-tracking", label: "KPI Tracking", icon: TrendingUp }] : []),
        ...(canView("pa_measurement_rca") && hasKpi ? [{ to: "/bod/measurement/rca", label: "RCA (Root Cause Analysis)", icon: FileText }] : []),
        ...(canView("pa_measurement_smart") && hasSmart ? [{ to: "/bod/measurement/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_measurement_appraisal") && hasAppraisalForm ? [{ to: "/bod/measurement/appraisal-form", label: "Appraisal Form", icon: ClipboardList }] : []),
        ...(canView("pa_measurement_project") && hasProject ? [{ to: "/bod/measurement/project-outside", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_measurement_managerial") && hasManagerial ? [{ to: "/bod/measurement/managerial-skill", label: "Managerial Skill", icon: Briefcase }] : []),
        ...(canView("pa_measurement_feedback") && hasIdf ? [{ to: "/bod/measurement/inter-department-feedback", label: "Inter-Department Feedback", icon: Users }] : []),
        ...(canView("pa_measurement_interview") && hasMi ? [{ to: "/bod/setting/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
      ];
      if (canView("pa_measurement") && paMeasSubs.length > 0) {
        list.push({ label: "Performance Appraisal Measurement", icon: Clock, subLinks: paMeasSubs });
      }

      const approvalSubs: NavSubLink[] = [
        ...(canView("approvals_kpi_business") || canView("approvals_kpi_business_group") || canView("approvals_kpi_business_unit")
          ? [{ to: "/bod/settings/kpi", label: "KPI Business", icon: TrendingUp }]
          : []),
        ...(canView("approvals_pa_setting") ? [{ to: "/bod/approvals/setting", label: "Performance Appraisal Setting", icon: Target }] : []),
        ...(canView("approvals_pa_measurement") ? [{ to: "/bod/approvals/measurement", label: "Performance Appraisal Measurement", icon: Clock }] : []),
        ...(canView("approvals_mgmt_interview") ? [{ to: "/bod/approvals/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("approvals_calibration") ? [{ to: "/bod/approvals/calibration", label: "Calibration", icon: Target }] : []),
        ...(canView("approvals_open_lock") ? [{ to: "/bod/settings/open-lock", label: "Open Lock", icon: LockOpen }] : []),
      ];
      if (canView("approvals") && approvalSubs.length > 0) {
        list.push({ label: "Approvals", icon: CheckSquare, subLinks: approvalSubs });
      }

      const monitoringSubs: NavSubLink[] = [
        ...(canView("pa_monitoring_kpi") ? [{ to: "/bod/monitoring/kpi", label: "KPI", icon: TrendingUp }] : []),
        ...(canView("pa_monitoring_smart") ? [{ to: "/bod/monitoring/smart-goals", label: "SMART Goals", icon: Lightbulb }] : []),
        ...(canView("pa_monitoring_appraisal") ? [{ to: "/bod/monitoring/appraisal-form", label: "Appraisal Form", icon: ClipboardList }] : []),
        ...(canView("pa_monitoring_managerial") ? [{ to: "/bod/monitoring/managerial-skill", label: "Managerial Skill", icon: Briefcase }] : []),
        ...(canView("pa_monitoring_project") ? [{ to: "/bod/monitoring/project", label: "Project Outside Job Scope", icon: FolderKanban }] : []),
        ...(canView("pa_monitoring_interview") ? [{ to: "/bod/monitoring/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("pa_monitoring_feedback") ? [{ to: "/bod/monitoring/inter-department-feedback", label: "Inter-Department Feedback", icon: Users }] : []),
      ];
      if (canView("pa_monitoring") && monitoringSubs.length > 0) {
        list.push({ label: "Performance Appraisal Monitoring", icon: ClipboardCheck, subLinks: monitoringSubs });
      }

      if (canView("pa_summary")) {
        list.push({ to: "/bod/summary", icon: LayoutList, label: "Performance Appraisal Summary" });
      }

      const calSubs: NavSubLink[] = [
        ...(canView("calibration_setting") ? [{ to: "/bod/calibration/setting", label: "Setting", icon: Settings }] : []),
        ...(canView("calibration_verification") ? [{ to: "/bod/calibration/verification", label: "Verification", icon: CheckSquare }] : []),
        ...(canView("calibration_adjustment") ? [{ to: "/bod/calibration/adjustment", label: "Adjustment", icon: RefreshCw }] : []),
        ...(canView("calibration_interview") ? [{ to: "/bod/calibration/management-interview", label: "Management Interview", icon: MessageSquare }] : []),
        ...(canView("calibration_team_performance") ? [{ to: "/bod/calibration/team-performance", label: "Team Performance", icon: BarChart2 }] : []),
      ];
      if (canView("calibration") && calSubs.length > 0) {
        list.push({ label: "Calibration", icon: Target, subLinks: calSubs });
      }

      const evLink = buildEvidenceLink("/bod");
      if (evLink) list.push(evLink);

      if (canView("history")) {
        list.push({ to: "/bod/history", icon: BookOpen, label: "PA Cycle History" });
      }
      if (canView("documents")) {
        list.push({ to: "/bod/documents", icon: BookOpen, label: "Documents" });
      }

      const settingLink = buildSettingLink("/bod");
      if (settingLink) list.push(settingLink);

      return list;
    }

    // Default susunan menu untuk Role: Employee, GM, Supervisor, HR Unit (sesuai urutan 1 - 10)
    const isEmployeePortal = role === "employee" && activeUser.role === "Employee";
    const prefix = isEmployeePortal ? "/employee" : "/supervisor";
    const list: NavTopLink[] = [];

    // 1. Analytics Dashboard selalu urutan pertama, dilanjutkan dengan Dashboard (untuk role yang diberi akses)
    if (canView("analytics")) {
      list.push({
        to: `${prefix}/analytics`,
        icon: BarChart2,
        label: "Analytics Dashboard",
        exact: true,
      });
    }
    if (canViewDashboard) {
      list.push({
        to: isEmployeePortal
          ? "/employee"
          : onlyApprovalDashboard
          ? `${prefix}/dashboard/approval`
          : "/supervisor",
        icon: isEmployeePortal ? BarChart2 : ListTodo,
        label: "Dashboard",
        exact: !onlyApprovalDashboard,
      });
    }

    // 2. My Profile
    if (canView("profile")) {
      list.push({
        to: `${prefix}/profile`,
        icon: UserCog,
        label: "My Profile",
      });
    }

    // 3. My Performance Appraisal
    if (canView("appraisal")) {
      list.push({
        to: `${prefix}/appraisal`,
        icon: FileText,
        label: "My Performance Appraisal",
      });
    }

    // 4. Performance Appraisal Setting
    const paSettingSubs: NavSubLink[] = [
      ...(canView("pa_setting_kpi") && hasKpi ? [{ to: `${prefix}/setting/kpi`, label: "KPI", icon: TrendingUp }] : []),
      ...(canView("pa_setting_smart") && hasSmart ? [{ to: `${prefix}/setting/smart-goals`, label: "SMART Goals", icon: Lightbulb }] : []),
      ...(canView("pa_setting_project") && hasProject ? [{ to: `${prefix}/setting/project`, label: "Project Outside Job Scope", icon: FolderKanban }] : []),
      ...(canView("pa_setting_interview") && hasMi ? [{ to: `${prefix}/setting/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
    ];
    if (canView("pa_setting") && paSettingSubs.length > 0) {
      list.push({ label: "Performance Appraisal Setting", icon: Target, subLinks: paSettingSubs });
    }

    // 5. Performance Appraisal Measurement
    const paMeasSubs: NavSubLink[] = [
      ...(canView("pa_measurement_kpi") && hasKpi ? [{ to: `${prefix}/measurement/kpi-tracking`, label: "KPI Tracking", icon: TrendingUp }] : []),
      ...(canView("pa_measurement_rca") && hasKpi ? [{ to: `${prefix}/measurement/rca`, label: "RCA (Root Cause Analysis)", icon: FileText }] : []),
      ...(canView("pa_measurement_smart") && hasSmart ? [{ to: `${prefix}/measurement/smart-goals`, label: "SMART Goals", icon: Lightbulb }] : []),
      ...(canView("pa_measurement_appraisal") && hasAppraisalForm ? [{ to: `${prefix}/measurement/appraisal-form`, label: "Appraisal Form", icon: ClipboardList }] : []),
      ...(canView("pa_measurement_project") && hasProject ? [{ to: `${prefix}/measurement/project-outside`, label: "Project Outside Job Scope", icon: FolderKanban }] : []),
      ...(canView("pa_measurement_managerial") && hasManagerial ? [{ to: `${prefix}/measurement/managerial-skill`, label: "Managerial Skill", icon: Briefcase }] : []),
      ...(canView("pa_measurement_feedback") && hasIdf ? [{ to: `${prefix}/measurement/inter-department-feedback`, label: "Inter-Department Feedback", icon: Users }] : []),
      ...(canView("pa_measurement_interview") && hasMi ? [{ to: `${prefix}/setting/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
    ];
    if (canView("pa_measurement") && paMeasSubs.length > 0) {
      list.push({ label: "Performance Appraisal Measurement", icon: Clock, subLinks: paMeasSubs });
    }

    // Approvals (jika di-allow untuk GM / Supervisor / HR Unit / Employee)
    const approvalSubs: NavSubLink[] = [
      ...(canView("approvals_kpi_business") || canView("approvals_kpi_business_group") || canView("approvals_kpi_business_unit")
        ? [{ to: `${prefix}/settings/kpi`, label: "KPI Business", icon: TrendingUp }]
        : []),
      ...(canView("approvals_pa_setting") ? [{ to: `${prefix}/approvals/setting`, label: "Performance Appraisal Setting", icon: Target }] : []),
      ...(canView("approvals_pa_measurement") ? [{ to: `${prefix}/approvals/measurement`, label: "Performance Appraisal Measurement", icon: Clock }] : []),
      ...(canView("approvals_mgmt_interview") ? [{ to: `${prefix}/approvals/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
      ...(canView("approvals_calibration") ? [{ to: `${prefix}/approvals/calibration`, label: "Calibration", icon: Target }] : []),
      ...(canView("approvals_open_lock") ? [{ to: `${prefix}/settings/open-lock`, label: "Open Lock", icon: LockOpen }] : []),
    ];
    if (canView("approvals") && approvalSubs.length > 0) {
      list.push({ label: "Approvals", icon: CheckSquare, subLinks: approvalSubs });
    }

    // 6. Performance Appraisal Monitoring (mengikuti akses Role di Menu/Access Management, tidak ter-trigger oleh PA Setting/Measurement pribadi)
    const monitoringSubs: NavSubLink[] = [
      ...(canView("pa_monitoring_kpi") && (!isHrUnitUser || hasKpi) ? [{ to: `${prefix}/monitoring/kpi`, label: "KPI", icon: TrendingUp }] : []),
      ...(canView("pa_monitoring_smart") && (!isHrUnitUser || hasSmart) ? [{ to: `${prefix}/monitoring/smart-goals`, label: "SMART Goals", icon: Lightbulb }] : []),
      ...(canView("pa_monitoring_appraisal") && (!isHrUnitUser || hasAppraisalForm) ? [{ to: `${prefix}/monitoring/appraisal-form`, label: "Appraisal Form", icon: ClipboardList }] : []),
      ...(canView("pa_monitoring_managerial") && (!isHrUnitUser || hasManagerial) ? [{ to: `${prefix}/monitoring/managerial-skill`, label: "Managerial Skill", icon: Briefcase }] : []),
      ...(canView("pa_monitoring_project") && (!isHrUnitUser || hasProject) ? [{ to: `${prefix}/monitoring/project`, label: "Project Outside Job Scope", icon: FolderKanban }] : []),
      ...(canView("pa_monitoring_interview") && (!isHrUnitUser || hasMi) ? [{ to: `${prefix}/monitoring/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
      ...(canView("pa_monitoring_feedback") && (!isHrUnitUser || hasIdf) ? [{ to: `${prefix}/monitoring/inter-department-feedback`, label: "Inter-Department Feedback", icon: Users }] : []),
    ];
    if (canView("pa_monitoring") && monitoringSubs.length > 0) {
      list.push({ label: "Performance Appraisal Monitoring", icon: ClipboardCheck, subLinks: monitoringSubs });
    }

    // 7. Performance Appraisal Summary
    if (canView("pa_summary")) {
      list.push({ to: `${prefix}/summary`, icon: LayoutList, label: "Performance Appraisal Summary" });
    }

    // 8. Calibration
    const calSubs: NavSubLink[] = [
      ...(canView("calibration_setting") ? [{ to: `${prefix}/calibration/setting`, label: "Setting", icon: Settings }] : []),
      ...(canView("calibration_verification") ? [{ to: `${prefix}/calibration/verification`, label: "Verification", icon: CheckSquare }] : []),
      ...(canView("calibration_adjustment") ? [{ to: `${prefix}/calibration/adjustment`, label: "Adjustment", icon: RefreshCw }] : []),
      ...(canView("calibration_team_performance") ? [{ to: `${prefix}/calibration/team-performance`, label: "Team Performance", icon: BarChart2 }] : []),
      ...(canView("calibration_interview") ? [{ to: `${prefix}/calibration/management-interview`, label: "Management Interview", icon: MessageSquare }] : []),
    ];
    if (canView("calibration") && calSubs.length > 0) {
      list.push({ label: "Calibration", icon: Target, subLinks: calSubs });
    }

    // 9. PA Cycle History
    if (canView("history")) {
      list.push({ to: `${prefix}/history`, icon: BookOpen, label: "PA Cycle History" });
    }

    // 10. Documents
    if (canView("documents")) {
      list.push({ to: `${prefix}/documents`, icon: BookOpen, label: "Documents" });
    }

    const evLink = buildEvidenceLink(prefix);
    if (evLink) list.push(evLink);

    const settingLink = buildSettingLink(prefix);
    if (settingLink) list.push(settingLink);

    return list;
  };

  const links = buildLinksForPortal();
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
  const [collapsedFlyout, setCollapsedFlyout] = useState<{ idx: number; top: number } | null>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Auto-expand when navigating to a child route (e.g. from notification)
  useEffect(() => {
    setCollapsedFlyout(null);
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

  useEffect(() => {
    if (!collapsed) {
      setCollapsedFlyout(null);
    }
  }, [collapsed]);

  useEffect(() => {
    if (!collapsedFlyout) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target as Node)) {
        setCollapsedFlyout(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [collapsedFlyout]);

  const isSubLinkGroupActive = (link: NavTopLink) => {
    return Boolean(
      link.subLinks?.some((sub: any) => {
        if (sub.children) {
          return sub.children.some((c: any) => location.pathname.startsWith(c.to));
        }
        return sub.to ? location.pathname.startsWith(sub.to) : false;
      }),
    );
  };

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
        collapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <div
        className={`h-[88px] flex justify-center border-b border-gray-100 ${
          collapsed ? "items-center px-2" : "items-end px-4 pb-1"
        }`}
      >
        <ImageWithFallback
          src={logoSG}
          alt="Company Logo"
          className={
            collapsed
              ? "h-10 w-10 object-contain transition-all"
              : "h-16 w-auto max-w-full object-contain transition-all"
          }
        />
      </div>

      <div
        className={`py-5 flex flex-col gap-1.5 flex-1 overflow-y-auto ${
          collapsed ? "px-2 items-center" : "px-4"
        }`}
      >
        {links.map((link, idx) => {
          if (link.subLinks) {
            const isExpanded = expandedMenus.has(idx);
            const groupActive = isSubLinkGroupActive(link);

            if (collapsed) {
              const isFlyoutOpen = collapsedFlyout?.idx === idx;
              return (
                <div key={idx} className="w-full flex justify-center">
                  <button
                    type="button"
                    title={link.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const safeTop = Math.max(16, Math.min(rect.top, window.innerHeight - 320));
                      setCollapsedFlyout((prev) =>
                        prev?.idx === idx ? null : { idx, top: safeTop },
                      );
                    }}
                    className={`w-11 h-11 flex items-center justify-center rounded-xl transition-colors relative ${
                      groupActive || isFlyoutOpen
                        ? "bg-[#1A284F] text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900"
                    }`}
                  >
                    <link.icon className="w-5 h-5 shrink-0" />
                    <span
                      className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                        groupActive || isFlyoutOpen ? "bg-amber-300" : "bg-gray-400/70"
                      }`}
                    />
                  </button>
                </div>
              );
            }

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
              title={collapsed ? link.label : undefined}
              onClick={() => setCollapsedFlyout(null)}
              className={({ isActive }) => 
                `${
                  collapsed
                    ? "w-11 h-11 justify-center"
                    : "px-4 py-3 gap-3"
                } flex items-center rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-[#1A284F] text-white shadow-sm" 
                    : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-800"
                }`
              }
            >
              {link.icon && <link.icon className="w-5 h-5 shrink-0" />}
              {!collapsed && link.label}
            </NavLink>
          );
        })}
      </div>

      {/* Flyout Submenu saat mode Collapsed */}
      {collapsed && collapsedFlyout !== null && links[collapsedFlyout.idx]?.subLinks && (
        <div
          ref={flyoutRef}
          style={{ top: collapsedFlyout.top }}
          className="fixed left-[76px] z-50 w-64 bg-white rounded-2xl border border-gray-200 shadow-xl py-3 px-2.5 max-h-[80vh] overflow-y-auto"
        >
          <div className="px-3 pb-2 mb-1.5 border-b border-gray-100 flex items-center gap-2">
            {(() => {
              const ActiveGroupIcon = links[collapsedFlyout.idx].icon;
              return ActiveGroupIcon ? <ActiveGroupIcon className="w-4 h-4 text-[#1A284F] shrink-0" /> : null;
            })()}
            <span className="text-xs font-bold text-[#1A284F] truncate">
              {links[collapsedFlyout.idx].label}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {links[collapsedFlyout.idx].subLinks!.map((sub, sIdx) => {
              if ((sub as any).children) {
                const SubIcon = sub.icon;
                return (
                  <div key={sIdx} className="py-1">
                    <div className="px-3 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      {SubIcon && <SubIcon className="w-3.5 h-3.5" />}
                      <span>{sub.label}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-0.5 pl-2">
                      {(sub as any).children.map((child: any, cIdx: number) => (
                        <NavLink
                          key={cIdx}
                          to={child.to}
                          onClick={() => setCollapsedFlyout(null)}
                          className={({ isActive }) =>
                            `flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                              isActive
                                ? "bg-[#1A284F] text-white shadow-sm"
                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
                            }`
                          }
                        >
                          {child.icon && <child.icon className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate">{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <NavLink
                  key={sIdx}
                  to={sub.to || ""}
                  onClick={() => setCollapsedFlyout(null)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                      isActive
                        ? "bg-[#1A284F] text-white shadow-sm"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/70"
                    }`
                  }
                >
                  {sub.icon && <sub.icon className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{sub.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
