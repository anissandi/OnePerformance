import { useState, useEffect } from "react";
import {
  ChevronRight, GripVertical, Plus, Edit2, Trash2,
  Eye, EyeOff, Save, X, ToggleLeft, ToggleRight, Search, Menu,
} from "lucide-react";
import { loadPersistedState, savePersistedState } from "../../../services/supabaseClient";
import {
  canRoleViewMenu,
  updateMenuViewRolesFromMenuManagement,
  useAccessManagement,
  type Role,
} from "./AccessManagement";

interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  isVisible: boolean;
  order: number;
  roles: Role[];
  children?: MenuItem[];
}

const ALL_ROLES: Role[] = ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor", "Employee"];
const HR_ROLES: Role[] = ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF"];
const HR_ADMIN: Role[] = ["Administrator", "HR Unit", "HR ICF"];

const ROLE_COLORS: Record<string, string> = {
  "Administrator": "bg-slate-100 text-slate-700",
  "BOD":           "bg-red-100 text-red-800",
  "Director":      "bg-rose-50 text-rose-700",
  "GM":            "bg-indigo-50 text-indigo-700",
  "HR Unit":       "bg-purple-50 text-purple-700",
  "HR ICF":        "bg-amber-50 text-amber-700",
  "Supervisor":    "bg-blue-50 text-blue-700",
  "Employee":      "bg-emerald-50 text-emerald-700",
};

// Mirrors MENU_STRUCTURE from AccessManagement — same IDs, same hierarchy
const INITIAL_MENUS: MenuItem[] = [
  {
    id: "dashboard", label: "Dashboard", path: "/supervisor; /employee", icon: "ListTodo",
    isVisible: true, order: 1, roles: ["GM", "Supervisor", "Employee"],
    children: [
      { id: "dashboard_my",       label: "My Dashboard",     path: "/supervisor/dashboard/my; /employee", icon: "BarChart2", isVisible: true, order: 1, roles: ["GM", "Supervisor", "Employee"] },
      { id: "dashboard_approval", label: "Approval Summary", path: "/supervisor/dashboard/approval", icon: "CheckSquare", isVisible: true, order: 2, roles: ["GM", "Supervisor"] },
    ],
  },
  {
    id: "analytics", label: "Analytics Dashboard", path: "/hr; /bod", icon: "BarChart2",
    isVisible: true, order: 1, roles: HR_ROLES,
  },
  {
    id: "profile", label: "My Profile", path: "/profile", icon: "UserCog",
    isVisible: true, order: 2, roles: ALL_ROLES,
    children: [
      { id: "profile_overview", label: "Overview",    path: "/profile/overview", icon: "UserCog",    isVisible: true, order: 1, roles: ALL_ROLES },
      { id: "profile_results",  label: "PA Results",  path: "/profile/results",  icon: "FileText",   isVisible: true, order: 2, roles: ALL_ROLES },
      { id: "profile_kpi",      label: "KPI Summary", path: "/profile/kpi",      icon: "TrendingUp", isVisible: true, order: 3, roles: ALL_ROLES },
    ],
  },
  {
    id: "appraisal", label: "My Performance Appraisal", path: "/appraisal", icon: "UserCheck",
    isVisible: true, order: 3, roles: ["GM", "Supervisor", "Employee"] as Role[],
  },
  {
    id: "pa_setting", label: "Performance Appraisal Setting", path: "", icon: "Target",
    isVisible: true, order: 4, roles: ALL_ROLES,
    children: [
      { id: "pa_setting_kpi",       label: "KPI",                       path: "/setting/kpi",                  icon: "TrendingUp",    isVisible: true, order: 1, roles: ALL_ROLES },
      { id: "pa_setting_smart",     label: "SMART Goals",               path: "/setting/smart-goals",          icon: "Lightbulb",     isVisible: true, order: 2, roles: ALL_ROLES },
      { id: "pa_setting_project",   label: "Project Outside Job Scope", path: "/setting/project",              icon: "FolderKanban",  isVisible: true, order: 3, roles: ["Supervisor"] as Role[] },
      { id: "pa_setting_interview", label: "Management Interview",      path: "/setting/management-interview", icon: "MessageSquare", isVisible: true, order: 4, roles: ["Supervisor"] as Role[] },
    ],
  },
  {
    id: "pa_measurement", label: "Performance Appraisal Measurement", path: "", icon: "Clock",
    isVisible: true, order: 5, roles: ALL_ROLES,
    children: [
      { id: "pa_measurement_kpi",        label: "KPI Tracking",                  path: "/measurement/kpi-tracking",            icon: "TrendingUp",    isVisible: true, order: 1, roles: ALL_ROLES },
      { id: "pa_measurement_rca",        label: "RCA (Root Cause Analysis)",     path: "/measurement/rca",                     icon: "FileText",      isVisible: true, order: 2, roles: ALL_ROLES },
      { id: "pa_measurement_smart",      label: "SMART Goals",                   path: "/measurement/smart-goals",             icon: "Lightbulb",     isVisible: true, order: 3, roles: ALL_ROLES },
      { id: "pa_measurement_appraisal",  label: "Appraisal Form",                path: "/measurement/appraisal-form",          icon: "ClipboardList", isVisible: true, order: 4, roles: ALL_ROLES },
      { id: "pa_measurement_project",    label: "Project Outside Job Scope",     path: "/measurement/project-outside",         icon: "FolderKanban",  isVisible: true, order: 5, roles: ALL_ROLES },
      { id: "pa_measurement_managerial", label: "Managerial Skill",              path: "/measurement/managerial-skill",        icon: "Briefcase",     isVisible: true, order: 6, roles: ["Administrator", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
      { id: "pa_measurement_feedback",   label: "Inter-Department Feedback",     path: "/measurement/inter-department-feedback", icon: "Users",       isVisible: true, order: 7, roles: ["Administrator", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
      { id: "pa_measurement_interview",  label: "Management Interview",          path: "/measurement/management-interview",    icon: "MessageSquare", isVisible: true, order: 8, roles: ["Administrator", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
    ],
  },
  {
    id: "approvals", label: "Approvals", path: "", icon: "CheckSquare",
    isVisible: true, order: 6, roles: ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor"] as Role[],
    children: [
      { id: "approvals_kpi_business",   label: "KPI Business",                        path: "/settings/kpi",                                    icon: "TrendingUp",    isVisible: true, order: 1, roles: [...HR_ADMIN, "GM", "Director"] as Role[] },
      { id: "approvals_pa_measurement", label: "Performance Appraisal Measurement",   path: "/approvals/measurement",                           icon: "Clock",         isVisible: true, order: 2, roles: ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
      { id: "approvals_feedback",       label: "Inter-Department Feedback Approvals", path: "/approvals/measurement/inter-department-feedback", icon: "Users",         isVisible: true, order: 3, roles: ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
      { id: "approvals_pa_setting",     label: "Performance Appraisal Setting",       path: "/approvals/setting",                               icon: "Target",        isVisible: true, order: 4, roles: ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
      { id: "approvals_mgmt_interview", label: "Management Interview",                path: "/approvals/management-interview",                  icon: "MessageSquare", isVisible: true, order: 5, roles: ["BOD", "Director"] as Role[] },
      { id: "approvals_open_lock",      label: "Open Lock",                           path: "/settings/open-lock",                              icon: "LockOpen",      isVisible: true, order: 6, roles: HR_ADMIN },
      { id: "approvals_calibration",    label: "Calibration",                         path: "/approvals/calibration",                           icon: "BarChart2",     isVisible: true, order: 7, roles: ["BOD"] as Role[] },
    ],
  },
  {
    id: "pa_monitoring", label: "Performance Appraisal Monitoring", path: "", icon: "ClipboardCheck",
    isVisible: true, order: 7, roles: ["Administrator", "BOD", "Director", "HR Unit", "HR ICF", "Supervisor"] as Role[],
    children: [
      { id: "pa_monitoring_kpi",        label: "KPI",                       path: "/monitoring/kpi",                    icon: "TrendingUp",    isVisible: true, order: 1, roles: HR_ADMIN },
      { id: "pa_monitoring_smart",      label: "SMART Goals",               path: "/monitoring/smart-goals",            icon: "Lightbulb",     isVisible: true, order: 2, roles: HR_ADMIN },
      { id: "pa_monitoring_appraisal",  label: "Appraisal Form",            path: "/monitoring/appraisal-form",         icon: "ClipboardList", isVisible: true, order: 3, roles: HR_ADMIN },
      { id: "pa_monitoring_managerial", label: "Managerial Skill",          path: "/monitoring/managerial-skill",       icon: "Briefcase",     isVisible: true, order: 4, roles: HR_ADMIN },
      { id: "pa_monitoring_project",    label: "Project Outside Job Scope", path: "/monitoring/project",                icon: "FolderKanban",  isVisible: true, order: 5, roles: HR_ADMIN },
      { id: "pa_monitoring_interview",  label: "Management Interview",      path: "/monitoring/management-interview",   icon: "MessageSquare", isVisible: true, order: 6, roles: HR_ADMIN },
      { id: "pa_monitoring_feedback",   label: "Inter-Department Feedback", path: "/monitoring/inter-department-feedback", icon: "Users",      isVisible: true, order: 7, roles: ["Administrator", "HR Unit", "HR ICF", "Supervisor"] as Role[] },
    ],
  },
  {
    id: "pa_summary", label: "Performance Appraisal Summary", path: "/summary", icon: "LayoutList",
    isVisible: true, order: 8, roles: ALL_ROLES,
  },
  {
    id: "calibration", label: "Calibration", path: "", icon: "Target",
    isVisible: true, order: 9, roles: HR_ROLES,
    children: [
      { id: "calibration_setting",          label: "Setting",              path: "/calibration/setting",              icon: "Settings",      isVisible: true, order: 1, roles: HR_ADMIN },
      { id: "calibration_verification",     label: "Verification",         path: "/calibration/verification",         icon: "CheckSquare",   isVisible: true, order: 2, roles: HR_ADMIN },
      { id: "calibration_adjustment",       label: "Adjustment",           path: "/calibration/adjustment",           icon: "RefreshCw",     isVisible: true, order: 3, roles: HR_ROLES },
      { id: "calibration_interview",        label: "Management Interview", path: "/calibration/management-interview", icon: "MessageSquare", isVisible: true, order: 4, roles: HR_ADMIN },
      { id: "calibration_team_performance", label: "Team Performance",     path: "/calibration/team-performance",     icon: "Users",         isVisible: true, order: 5, roles: ["Supervisor"] as Role[] },
    ],
  },
  {
    id: "history", label: "PA Cycle History", path: "/history", icon: "BookOpen",
    isVisible: true, order: 10, roles: ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor"] as Role[],
  },
  {
    id: "documents", label: "Documents", path: "/documents", icon: "BookOpen",
    isVisible: true, order: 11, roles: ALL_ROLES,
  },
  {
    id: "evidence", label: "Evidence", path: "", icon: "FolderOpen",
    isVisible: true, order: 12, roles: HR_ADMIN,
    children: [
      { id: "evidence_kpi",       label: "KPI Tracking",         path: "/evidence/kpi-tracking",         icon: "TrendingUp",    isVisible: true, order: 1, roles: HR_ADMIN },
      { id: "evidence_rca",       label: "RCA",                  path: "/evidence/rca",                  icon: "RefreshCw",     isVisible: true, order: 2, roles: HR_ADMIN },
      { id: "evidence_smart",     label: "SMART Goals",          path: "/evidence/smart-goals",          icon: "Lightbulb",     isVisible: true, order: 3, roles: HR_ADMIN },
      { id: "evidence_interview", label: "Management Interview", path: "/evidence/management-interview", icon: "MessageSquare", isVisible: true, order: 4, roles: HR_ADMIN },
    ],
  },
  {
    id: "management_interview", label: "Management Interview", path: "", icon: "UserSquare",
    isVisible: true, order: 13, roles: HR_ADMIN,
    children: [
      { id: "mgmt_interview_invitation", label: "Invitation", path: "/management-interview/invitation", icon: "MessageSquare", isVisible: true, order: 1, roles: HR_ADMIN },
    ],
  },
  {
    id: "override", label: "Management Override", path: "/override", icon: "Shield",
    isVisible: false, order: 12, roles: HR_ADMIN,
  },
  {
    id: "setting", label: "Setting", path: "", icon: "Settings",
    isVisible: true, order: 12, roles: HR_ROLES,
    children: [
      {
        id: "setting_master", label: "Master", path: "", icon: "ListTodo",
        isVisible: true, order: 1, roles: HR_ADMIN,
        children: [
          { id: "setting_master_kpi",        label: "KPI",              path: "/settings/master/kpi",              icon: "TrendingUp",    isVisible: true, order: 1, roles: HR_ADMIN },
          { id: "setting_master_appraisal",  label: "Appraisal Form",   path: "/settings/master/appraisal-form",   icon: "ClipboardList", isVisible: true, order: 2, roles: HR_ADMIN },
          { id: "setting_master_managerial", label: "Managerial Skill", path: "/settings/master/managerial-skill", icon: "Briefcase",     isVisible: true, order: 3, roles: HR_ADMIN },
        ],
      },
      { id: "setting_scores",        label: "Scores Setting",       path: "/settings/scores-calibration",  icon: "TrendingUp",  isVisible: true,  order: 2, roles: HR_ADMIN },
      { id: "setting_modules",       label: "Module Activation",    path: "/modules",                       icon: "Settings",    isVisible: true,  order: 3, roles: HR_ADMIN },
      { id: "setting_cycle",         label: "Cycle Management",     path: "/settings/cycle",                icon: "RefreshCw",   isVisible: true,  order: 4, roles: HR_ADMIN },
      { id: "setting_approval_mgmt", label: "Approval Management",  path: "/settings/approval-management",  icon: "CheckSquare", isVisible: true,  order: 5, roles: HR_ADMIN },
      { id: "setting_user_mgmt",     label: "User Management",      path: "/settings/user-management",      icon: "Users",       isVisible: true,  order: 6, roles: HR_ADMIN },
      { id: "setting_access_mgmt",   label: "Access Management",    path: "/settings/access-management",    icon: "Shield",      isVisible: true,  order: 7, roles: ["Administrator"] as Role[] },
      { id: "setting_menu_mgmt",     label: "Menu Management",      path: "/settings/menu-management",      icon: "Menu",        isVisible: true,  order: 8, roles: ["Administrator"] as Role[] },
      { id: "setting_data_sync",     label: "Data Sync",            path: "/settings/data-sync",            icon: "RefreshCw",   isVisible: true,  order: 9, roles: HR_ADMIN },
      { id: "setting_audit",         label: "Audit Trail",          path: "/settings/audit-trail",          icon: "FileSearch",  isVisible: false, order: 10, roles: HR_ROLES },
    ],
  },
];

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

interface EditMenuModalProps {
  item: MenuItem | null;
  isNew: boolean;
  availableRoles: Role[];
  onClose: () => void;
  onSave: (item: MenuItem) => void;
}

function EditMenuModal({ item, isNew, availableRoles, onClose, onSave }: EditMenuModalProps) {
  const [form, setForm] = useState<MenuItem>(item ?? {
    id: `menu_${Date.now()}`, label: "", path: "", icon: "FileText",
    isVisible: true, order: 99, roles: [],
  });

  function toggleRole(r: Role) {
    setForm(p => ({
      ...p,
      roles: p.roles.includes(r) ? p.roles.filter(x => x !== r) : [...p.roles, r],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{isNew ? "Add Menu Item" : "Edit Menu Item"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Menu Label</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.label}
              onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Dashboard"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Path / URL</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.path}
              onChange={e => setForm(p => ({ ...p, path: e.target.value }))}
              placeholder="e.g. /dashboard"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Icon Name</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.icon}
                onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                placeholder="e.g. BarChart2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
              <input
                type="number" min={1}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={form.order}
                onChange={e => setForm(p => ({ ...p, order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Visible to Roles (Synced with Access Management)</label>
            <div className="flex gap-2 flex-wrap">
              {availableRoles.map(r => (
                <button
                  key={r} type="button" onClick={() => toggleRole(r)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    form.roles.includes(r)
                      ? "bg-[#1A284F] text-white border-[#1A284F]"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600">Visibility</label>
            <button onClick={() => setForm(p => ({ ...p, isVisible: !p.isVisible }))}>
              {form.isVisible
                ? <span className="flex items-center gap-1 text-emerald-600 text-sm"><ToggleRight size={20} /> Visible</span>
                : <span className="flex items-center gap-1 text-gray-400 text-sm"><ToggleLeft size={20} /> Hidden</span>}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            className="px-4 py-2 text-sm bg-[#1A284F] text-white rounded-lg hover:bg-[#2a3d6e] flex items-center gap-1.5"
          >
            <Save size={14} /> {isNew ? "Add Menu" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuRow({
  item, depth, onToggle, onEdit, onDelete,
}: {
  item: MenuItem; depth: number;
  onToggle: (id: string, parentId?: string) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string, parentId?: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <>
      <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${depth === 0 ? "bg-gray-50/40" : ""}`}>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onEdit(item)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
              title="Edit"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
        <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + depth * 20}px` }}>
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-gray-300 cursor-grab shrink-0" />
            {hasChildren ? (
              <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-3.5" />
            )}
            <span className={`text-sm ${depth === 0 ? "font-semibold text-gray-700" : depth === 1 ? "text-gray-600" : "text-gray-500"}`}>
              {item.label}
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
          {item.path || <span className="text-gray-300">—</span>}
        </td>
        <td className="px-4 py-2.5 text-xs text-gray-500">{item.icon}</td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {item.roles.map(r => (
              <span key={r} className={`text-xs px-1.5 py-0.5 rounded font-medium ${ROLE_COLORS[r] ?? "bg-gray-100 text-gray-600"}`}>
                {r}
              </span>
            ))}
            {item.roles.length === 0 && <span className="text-gray-300 text-xs">—</span>}
          </div>
        </td>
        <td className="px-4 py-2.5 text-center text-xs text-gray-500">{item.order}</td>
        <td className="px-4 py-2.5">
          <button onClick={() => onToggle(item.id)} className="flex items-center gap-1">
            {item.isVisible
              ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><Eye size={13} /> Visible</span>
              : <span className="flex items-center gap-1 text-gray-400 text-xs"><EyeOff size={13} /> Hidden</span>}
          </button>
        </td>
      </tr>
      {hasChildren && expanded && item.children!.map(child => (
        <MenuRow
          key={child.id}
          item={child}
          depth={depth + 1}
          onToggle={id => onToggle(id, item.id)}
          onEdit={onEdit}
          onDelete={id => onDelete(id, item.id)}
        />
      ))}
    </>
  );
}

function updateNested(items: MenuItem[], id: string, updater: (m: MenuItem) => MenuItem): MenuItem[] {
  return items.map(m => {
    if (m.id === id) return updater(m);
    if (m.children) return { ...m, children: updateNested(m.children, id, updater) };
    return m;
  });
}

function deleteNested(items: MenuItem[], id: string): MenuItem[] {
  return items
    .filter(m => m.id !== id)
    .map(m => m.children ? { ...m, children: deleteNested(m.children, id) } : m);
}

const MENU_CONFIGS_KEY = "pa_menu_configs_v1";

export function MenuManagementPage() {
  const { roles: accessRoles } = useAccessManagement();
  const [menus, setMenus] = useState<MenuItem[]>(() =>
    loadPersistedState<MenuItem[]>(MENU_CONFIGS_KEY, deepClone(INITIAL_MENUS)),
  );
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onHydrated = () => {
      setMenus(loadPersistedState<MenuItem[]>(MENU_CONFIGS_KEY, deepClone(INITIAL_MENUS)));
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  function persistMenus(nextMenus: MenuItem[], description: string) {
    savePersistedState(MENU_CONFIGS_KEY, nextMenus, {
      kind: "menu-configs",
      menus: nextMenus,
      audit: {
        action: "Update",
        module: "HR Settings",
        subModule: "Menu Management",
        description,
      },
    });
  }

  function toggleVisibility(id: string) {
    setSaved(false);
    const next = updateNested(menus, id, m => ({ ...m, isVisible: !m.isVisible }));
    setMenus(next);
    persistMenus(next, `Toggled visibility for menu ${id}`);
  }

  function syncMenuRolesWithAccessManagement(items: MenuItem[]): MenuItem[] {
    return items.map((m) => {
      const syncedRoles = accessRoles.filter((r) => canRoleViewMenu(r, m.id));
      return {
        ...m,
        roles: syncedRoles.length > 0 || m.id ? syncedRoles : m.roles,
        ...(m.children ? { children: syncMenuRolesWithAccessManagement(m.children) } : {}),
      };
    });
  }

  function handleEdit(item: MenuItem) {
    const syncedRoles = accessRoles.filter((r) => canRoleViewMenu(r, item.id));
    setEditItem({ ...deepClone(item), roles: syncedRoles });
  }

  function handleSave(updated: MenuItem) {
    setSaved(false);
    updateMenuViewRolesFromMenuManagement(updated.id, updated.roles);
    const next = updateNested(menus, updated.id, () => updated);
    setMenus(next);
    persistMenus(next, `Updated menu item ${updated.label} (${updated.id})`);
  }

  function handleAdd(item: MenuItem) {
    setSaved(false);
    const next = [...menus, item];
    setMenus(next);
    persistMenus(next, `Added new menu item ${item.label} (${item.id})`);
  }

  function handleDelete(id: string) {
    setSaved(false);
    const next = deleteNested(menus, id);
    setMenus(next);
    persistMenus(next, `Deleted menu item ${id}`);
  }

  function matchSearch(item: MenuItem, q: string): boolean {
    if (item.label.toLowerCase().includes(q)) return true;
    return item.children?.some(c => matchSearch(c, q)) ?? false;
  }

  const syncedMenus = syncMenuRolesWithAccessManagement(menus);
  const q = search.toLowerCase();
  const filtered = q ? syncedMenus.filter(m => matchSearch(m, q)) : syncedMenus;

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1A284F]/8 flex items-center justify-center">
            <Menu size={18} className="text-[#1A284F]" />
          </div>
          <div>
            <h1 className="font-bold text-gray-800 text-xl">Menu Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Configure sidebar menu items, visibility, and role access</p>
          </div>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span>
          <span>Home</span>
          <span className="mx-1">›</span>
          <span>Setting</span>
          <span className="mx-1">›</span>
          <span className="font-medium text-gray-700">Menu Management</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1" />
          {saved && (
            <span className="text-emerald-600 text-sm font-medium flex items-center gap-1">
              ✓ Changes saved
            </span>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 border border-dashed border-indigo-300 text-indigo-600 text-sm rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <Plus size={14} /> Add Menu
          </button>
          <button
            onClick={() => {
              persistMenus(menus, "Saved Menu Management configuration");
              setSaved(true);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            <Save size={13} /> Save Changes
          </button>
        </div>

        {saved && (
          <div className="mx-4 mt-3 mb-0 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <span className="font-medium">Saved!</span> Menu configuration has been updated successfully.
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Menu / Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-48">Path</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Icon</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Roles</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Order</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Visibility</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <MenuRow
                  key={item.id}
                  item={item}
                  depth={0}
                  onToggle={toggleVisibility}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-6 flex-wrap">
          <span className="flex items-center gap-1.5"><GripVertical size={12} /> Drag to reorder (UI only)</span>
          <span className="flex items-center gap-1.5 text-emerald-600"><Eye size={12} /> Visible to users</span>
          <span className="flex items-center gap-1.5"><EyeOff size={12} /> Hidden from menu</span>
          <span className="font-medium text-gray-500 ml-auto">
            {menus.length} top-level items
          </span>
        </div>
      </div>

      {editItem && (
        <EditMenuModal item={editItem} isNew={false} availableRoles={accessRoles} onClose={() => setEditItem(null)} onSave={handleSave} />
      )}
      {addOpen && (
        <EditMenuModal item={null} isNew={true} availableRoles={accessRoles} onClose={() => setAddOpen(false)} onSave={handleAdd} />
      )}
    </div>
  );
}
