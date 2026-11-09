import { useState, useRef, useEffect } from "react";
import { RefreshCw, Search, X, Save, ChevronRight, Shield, Plus, Trash2 } from "lucide-react";

type BuiltinRole = "Administrator" | "BOD" | "Director" | "HR Unit" | "HR ICF" | "Supervisor" | "Employee";
type Role = BuiltinRole | string;

interface Permission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  children?: MenuItem[];
}

interface RolePermissions {
  [menuId: string]: Permission;
}

const MENU_STRUCTURE: MenuItem[] = [
  { id: "analytics", label: "Analytics Dashboard" },
  { id: "appraisal", label: "My Performance Appraisal" },
  {
    id: "approvals", label: "Approvals",
    children: [
      { id: "approvals_kpi_business",    label: "KPI Business" },
      { id: "approvals_pa_measurement",  label: "Performance Appraisal Measurement" },
      { id: "approvals_pa_setting",      label: "Performance Appraisal Setting" },
      { id: "approvals_open_lock",       label: "Open Lock" },
      { id: "approvals_calibration",     label: "Calibration" },
    ]
  },
  {
    id: "pa_monitoring", label: "Performance Appraisal Monitoring",
    children: [
      { id: "pa_monitoring_kpi",        label: "KPI" },
      { id: "pa_monitoring_smart",      label: "SMART Goals" },
      { id: "pa_monitoring_appraisal",  label: "Appraisal Form" },
      { id: "pa_monitoring_managerial", label: "Managerial Skill" },
      { id: "pa_monitoring_project",    label: "Project Outside Job Scope" },
      { id: "pa_monitoring_interview",  label: "Management Interview" },
      { id: "pa_monitoring_feedback",   label: "Inter-Department Feedback" },
    ]
  },
  { id: "pa_summary", label: "Performance Appraisal Summary" },
  {
    id: "calibration", label: "Calibration",
    children: [
      { id: "calibration_setting",          label: "Setting" },
      { id: "calibration_verification", label: "Verification" },
      { id: "calibration_adjustment",       label: "Adjustment" },
      { id: "calibration_interview",        label: "Management Interview" },
      { id: "calibration_team_performance", label: "Team Performance" },
    ]
  },
  {
    id: "evidence", label: "Evidence",
    children: [
      { id: "evidence_kpi",       label: "KPI Tracking" },
      { id: "evidence_rca",       label: "RCA" },
      { id: "evidence_smart",     label: "SMART Goals" },
      { id: "evidence_interview", label: "Management Interview" },
    ]
  },
  {
    id: "pa_setting", label: "Performance Appraisal Setting",
    children: [
      { id: "pa_setting_kpi",       label: "KPI" },
      { id: "pa_setting_smart",     label: "SMART Goals" },
      { id: "pa_setting_project",   label: "Project Outside Job Scope" },
      { id: "pa_setting_interview", label: "Management Interview" },
    ]
  },
  {
    id: "pa_measurement", label: "Performance Appraisal Measurement",
    children: [
      { id: "pa_measurement_kpi",        label: "KPI Tracking" },
      { id: "pa_measurement_rca",        label: "RCA (Root Cause Analysis)" },
      { id: "pa_measurement_smart",      label: "SMART Goals" },
      { id: "pa_measurement_appraisal",  label: "Appraisal Form" },
      { id: "pa_measurement_project",    label: "Project Outside Job Scope" },
      { id: "pa_measurement_managerial", label: "Managerial Skill" },
      { id: "pa_measurement_feedback",   label: "Inter-Department Feedback" },
      { id: "pa_measurement_interview",  label: "Management Interview" },
    ]
  },
  {
    id: "management_interview", label: "Management Interview",
    children: [
      { id: "mgmt_interview_assessment", label: "Assessment" },
    ]
  },
  { id: "documents", label: "Documents" },
  {
    id: "setting", label: "Setting",
    children: [
      {
        id: "setting_master", label: "Master",
        children: [
          { id: "setting_master_kpi",        label: "KPI" },
          { id: "setting_master_appraisal",  label: "Appraisal Form" },
          { id: "setting_master_managerial", label: "Managerial Skill" },
        ]
      },
      { id: "setting_scores",        label: "Scores Setting" },
      { id: "setting_modules",       label: "Module Activation" },
      { id: "setting_cycle",         label: "Cycle Management" },
      { id: "setting_approval_mgmt", label: "Approval Management" },
      { id: "setting_user_mgmt",     label: "User Management" },
      { id: "setting_access_mgmt",   label: "Access Management" },
      { id: "setting_menu_mgmt",     label: "Menu Management" },
      { id: "setting_data_sync",     label: "Data Sync" },
      { id: "setting_audit",         label: "Audit Trail" },
    ]
  },
];

const EMPTY_PERM: Permission = { view: false, create: false, edit: false, delete: false, approve: false };

function allMenuIds(): string[] {
  const ids: string[] = [];
  function walk(items: MenuItem[]) {
    for (const item of items) {
      ids.push(item.id);
      if (item.children) walk(item.children);
    }
  }
  walk(MENU_STRUCTURE);
  return ids;
}

function emptyPermissions(): RolePermissions {
  return Object.fromEntries(allMenuIds().map(id => [id, { ...EMPTY_PERM }]));
}

const T: Permission = { view: true,  create: true,  edit: true,  delete: true,  approve: true  };
const V: Permission = { view: true,  create: false, edit: false, delete: false, approve: false };
const VA: Permission= { view: true,  create: false, edit: false, delete: false, approve: true  };
const VE: Permission= { view: true,  create: false, edit: true,  delete: false, approve: false };
const VCE:Permission= { view: true,  create: true,  edit: true,  delete: false, approve: false };
const VCEA:Permission={ view: true,  create: true,  edit: true,  delete: false, approve: true  };
const VCET:Permission={ view: true,  create: true,  edit: true,  delete: true,  approve: false };
const N: Permission = { view: false, create: false, edit: false, delete: false, approve: false };

const DEFAULT_ADMIN: RolePermissions = {
  calibration_verification: VE,
  analytics: V,
  approvals: VA,
  approvals_kpi_business:   T,
  approvals_pa_measurement: VA,
  approvals_pa_setting:     VA,
  approvals_open_lock:      VCEA,
  pa_monitoring: V,
  pa_monitoring_kpi:        VE,
  pa_monitoring_smart:      VE,
  pa_monitoring_appraisal:  VE,
  pa_monitoring_managerial: VE,
  pa_monitoring_project:    VE,
  pa_monitoring_interview:  VE,
  pa_summary: V,
  calibration: V,
  calibration_setting:    VE,
  calibration_adjustment: VE,
  calibration_interview:  VE,
  evidence: V,
  evidence_kpi:       V,
  evidence_rca:       V,
  evidence_smart:     V,
  evidence_interview: V,
  pa_setting: V,
  pa_setting_kpi:   VCET,
  pa_setting_smart: VCET,
  pa_measurement: V,
  pa_measurement_kpi:        VE,
  pa_measurement_rca:        VE,
  pa_measurement_smart:      VE,
  pa_measurement_appraisal:  VE,
  pa_measurement_project:    VE,
  pa_measurement_managerial: VE,
  pa_measurement_feedback:   VE,
  pa_measurement_interview:  VE,
  documents: T,
  setting: V,
  setting_master: V,
  setting_master_kpi:       T,
  setting_master_appraisal: T,
  setting_master_managerial:T,
  setting_scores:        VE,
  setting_modules:       VE,
  setting_approval_mgmt: T,
  setting_user_mgmt:     T,
  setting_access_mgmt:   T,
  setting_menu_mgmt:     T,
  setting_data_sync:     VE,
  setting_cycle:         T,
  setting_audit:         V,
  appraisal:             N,
  approvals_calibration: N,
  pa_monitoring_feedback:    VE,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
};

const DEFAULT_DIRECTOR: RolePermissions = {
  calibration_verification: N,
  analytics: V,
  approvals: VA,
  approvals_kpi_business:   N,
  approvals_pa_measurement: VA,
  approvals_pa_setting:     VA,
  approvals_open_lock:      N,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  V,
  pa_summary: V,
  calibration: V,
  calibration_setting:    N,
  calibration_adjustment: V,
  calibration_interview:  N,
  evidence: N,
  evidence_kpi:       N,
  evidence_rca:       N,
  evidence_smart:     N,
  evidence_interview: N,
  pa_setting: N,
  pa_setting_kpi:   N,
  pa_setting_smart: N,
  pa_measurement: N,
  pa_measurement_kpi:        N,
  pa_measurement_rca:        N,
  pa_measurement_smart:      N,
  pa_measurement_appraisal:  N,
  pa_measurement_project:    N,
  pa_measurement_managerial: N,
  pa_measurement_feedback:   N,
  pa_measurement_interview:  N,
  documents: V,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_user_mgmt:     N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             N,
  approvals_calibration: VA,
  pa_monitoring_feedback:    V,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  V,
  mgmt_interview_assessment: N,
};

const DEFAULT_HR_UNIT: RolePermissions = {
  calibration_verification: VE,
  analytics: V,
  approvals: VA,
  approvals_kpi_business:   VCET,
  approvals_pa_measurement: VA,
  approvals_pa_setting:     VA,
  approvals_open_lock:      VCE,
  pa_monitoring: V,
  pa_monitoring_kpi:        VE,
  pa_monitoring_smart:      VE,
  pa_monitoring_appraisal:  VE,
  pa_monitoring_managerial: VE,
  pa_monitoring_project:    VE,
  pa_monitoring_interview:  VE,
  pa_summary: V,
  calibration: V,
  calibration_setting:    VE,
  calibration_adjustment: VE,
  calibration_interview:  VE,
  evidence: V,
  evidence_kpi:       V,
  evidence_rca:       V,
  evidence_smart:     V,
  evidence_interview: V,
  pa_setting: V,
  pa_setting_kpi:   VCET,
  pa_setting_smart: VCE,
  pa_measurement: V,
  pa_measurement_kpi:        VE,
  pa_measurement_rca:        VE,
  pa_measurement_smart:      VE,
  pa_measurement_appraisal:  VE,
  pa_measurement_project:    VE,
  pa_measurement_managerial: VE,
  pa_measurement_feedback:   VE,
  pa_measurement_interview:  VE,
  documents: T,
  setting: V,
  setting_master: V,
  setting_master_kpi:       VCET,
  setting_master_appraisal: VCET,
  setting_master_managerial:VCET,
  setting_scores:        VE,
  setting_modules:       VE,
  setting_approval_mgmt: VCE,
  setting_user_mgmt:     VCE,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     VE,
  setting_data_sync:     VE,
  setting_cycle:         VCET,
  setting_audit:         V,
  appraisal:             N,
  approvals_calibration: N,
  pa_monitoring_feedback:    VE,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  V,
  mgmt_interview_assessment: N,
};

const DEFAULT_HR_ICF: RolePermissions = {
  calibration_verification: VE,
  analytics: V,
  approvals: VA,
  approvals_kpi_business:   VCEA,
  approvals_pa_measurement: VA,
  approvals_pa_setting:     VA,
  approvals_open_lock:      VCE,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  V,
  pa_summary: V,
  calibration: V,
  calibration_setting:    VE,
  calibration_adjustment: VE,
  calibration_interview:  VE,
  evidence: V,
  evidence_kpi:       V,
  evidence_rca:       V,
  evidence_smart:     V,
  evidence_interview: V,
  pa_setting: V,
  pa_setting_kpi:   VCEA,
  pa_setting_smart: VCE,
  pa_measurement: V,
  pa_measurement_kpi:        VE,
  pa_measurement_rca:        VE,
  pa_measurement_smart:      VE,
  pa_measurement_appraisal:  VE,
  pa_measurement_project:    VE,
  pa_measurement_managerial: VE,
  pa_measurement_feedback:   VE,
  pa_measurement_interview:  VE,
  documents: VCE,
  setting: V,
  setting_master: V,
  setting_master_kpi:       VCEA,
  setting_master_appraisal: VCEA,
  setting_master_managerial:VCEA,
  setting_scores:        VE,
  setting_modules:       VE,
  setting_approval_mgmt: T,
  setting_user_mgmt:     T,
  setting_access_mgmt:   V,
  setting_menu_mgmt:     VCE,
  setting_data_sync:     V,
  setting_cycle:         VCET,
  setting_audit:         V,
  appraisal:             N,
  approvals_calibration: N,
  pa_monitoring_feedback:    VE,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  V,
  mgmt_interview_assessment: N,
};

const DEFAULT_SUPERVISOR: RolePermissions = {
  calibration_verification: N,
  analytics: N,
  approvals: VA,
  approvals_kpi_business:   N,
  approvals_pa_measurement: VA,
  approvals_pa_setting:     VA,
  approvals_open_lock:      N,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  N,
  pa_summary: V,
  calibration: N,
  calibration_setting:    N,
  calibration_adjustment: N,
  calibration_interview:  N,
  evidence: N,
  evidence_kpi:       N,
  evidence_rca:       N,
  evidence_smart:     N,
  evidence_interview: N,
  pa_setting: V,
  pa_setting_kpi:   VCET,
  pa_setting_smart: VCE,
  pa_measurement: V,
  pa_measurement_kpi:        VCET,
  pa_measurement_rca:        VCET,
  pa_measurement_smart:      VCET,
  pa_measurement_appraisal:  VCET,
  pa_measurement_project:    VCET,
  pa_measurement_managerial: VCET,
  pa_measurement_feedback:   VCET,
  pa_measurement_interview:  VCET,
  documents: VCE,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_user_mgmt:     N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             V,
  approvals_calibration: N,
  pa_monitoring_feedback:    V,
  calibration_team_performance: V,
  pa_setting_project:    VCET,
  pa_setting_interview:  VCET,
  management_interview:  N,
  mgmt_interview_assessment: N,
};

const DEFAULT_EMPLOYEE: RolePermissions = {
  calibration_verification: N,
  analytics: N,
  approvals: N,
  approvals_kpi_business:   N,
  approvals_pa_measurement: N,
  approvals_pa_setting:     N,
  approvals_open_lock:      N,
  pa_monitoring: N,
  pa_monitoring_kpi:        N,
  pa_monitoring_smart:      N,
  pa_monitoring_appraisal:  N,
  pa_monitoring_managerial: N,
  pa_monitoring_project:    N,
  pa_monitoring_interview:  N,
  pa_summary: V,
  calibration: N,
  calibration_setting:    N,
  calibration_adjustment: N,
  calibration_interview:  N,
  evidence: N,
  evidence_kpi:       N,
  evidence_rca:       N,
  evidence_smart:     N,
  evidence_interview: N,
  pa_setting: V,
  pa_setting_kpi:   VCET,
  pa_setting_smart: VCET,
  pa_measurement: V,
  pa_measurement_kpi:        VCET,
  pa_measurement_rca:        VCET,
  pa_measurement_smart:      VCET,
  pa_measurement_appraisal:  VCET,
  pa_measurement_project:    VCET,
  pa_measurement_managerial: N,
  pa_measurement_feedback:   N,
  pa_measurement_interview:  N,
  documents: V,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_user_mgmt:     N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             V,
  approvals_calibration: N,
  pa_monitoring_feedback:    N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
};

const DEFAULT_BOD: RolePermissions = {
  calibration_verification: N,
  analytics: V,
  appraisal: N,
  approvals: VA,
  approvals_kpi_business:    N,
  approvals_pa_measurement:  VA,
  approvals_pa_setting:      VA,
  approvals_open_lock:       N,
  approvals_calibration:     VA,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  V,
  pa_monitoring_feedback:   V,
  pa_summary: V,
  calibration: V,
  calibration_setting:          N,
  calibration_adjustment:       V,
  calibration_interview:        V,
  calibration_team_performance: N,
  evidence: N,
  evidence_kpi:       N,
  evidence_rca:       N,
  evidence_smart:     N,
  evidence_interview: N,
  pa_setting: N,
  pa_setting_kpi:       N,
  pa_setting_smart:     N,
  pa_setting_project:   N,
  pa_setting_interview: N,
  pa_measurement: N,
  pa_measurement_kpi:        N,
  pa_measurement_rca:        N,
  pa_measurement_smart:      N,
  pa_measurement_appraisal:  N,
  pa_measurement_project:    N,
  pa_measurement_managerial: N,
  pa_measurement_feedback:   N,
  pa_measurement_interview:  N,
  management_interview: V,
  mgmt_interview_assessment: VCEA,
  documents: V,
  setting: N,
  setting_master: N,
  setting_master_kpi:        N,
  setting_master_appraisal:  N,
  setting_master_managerial: N,
  setting_scores:        N,
  setting_modules:       N,
  setting_cycle:         N,
  setting_approval_mgmt: N,
  setting_user_mgmt:     N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_audit:         N,
};

const BUILTIN_DEFAULTS: Record<BuiltinRole, RolePermissions> = {
  "Administrator": DEFAULT_ADMIN,
  "BOD":           DEFAULT_BOD,
  "Director":      DEFAULT_DIRECTOR,
  "HR Unit":       DEFAULT_HR_UNIT,
  "HR ICF":        DEFAULT_HR_ICF,
  "Supervisor":    DEFAULT_SUPERVISOR,
  "Employee":      DEFAULT_EMPLOYEE,
};

const BUILTIN_ROLES: BuiltinRole[] = ["Administrator", "BOD", "Director", "HR Unit", "HR ICF", "Supervisor", "Employee"];

const ROLE_COLORS: Record<string, string> = {
  "Administrator": "bg-slate-100 text-slate-700 border-slate-200",
  "BOD":           "bg-red-100 text-red-800 border-red-200",
  "Director":      "bg-rose-100 text-rose-700 border-rose-200",
  "HR Unit":       "bg-purple-100 text-purple-700 border-purple-200",
  "HR ICF":        "bg-amber-100 text-amber-700 border-amber-200",
  "Supervisor":    "bg-blue-100 text-blue-700 border-blue-200",
  "Employee":      "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const PERM_KEYS: (keyof Permission)[] = ["view", "create", "edit", "delete", "approve"];
const PERM_LABELS: Record<keyof Permission, string> = { view: "View", create: "Create", edit: "Edit", delete: "Delete", approve: "Approve" };

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

interface PermRowProps {
  item: MenuItem;
  depth: number;
  perms: RolePermissions;
  onChange: (id: string, key: keyof Permission, val: boolean) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  search: string;
}

function matchSearch(item: MenuItem, q: string): boolean {
  if (item.label.toLowerCase().includes(q)) return true;
  return item.children?.some(c => matchSearch(c, q)) ?? false;
}

function PermRow({ item, depth, perms, onChange, expanded, toggleExpand, search }: PermRowProps) {
  const q = search.toLowerCase();
  if (q && !matchSearch(item, q)) return null;

  const hasChildren = item.children && item.children.length > 0;
  const isExpanded = expanded.has(item.id);
  const perm = perms[item.id] ?? { view: false, create: false, edit: false, delete: false, approve: false };

  return (
    <>
      <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${depth === 0 ? "bg-gray-50/40" : ""}`}>
        <td className="px-4 py-2.5" style={{ paddingLeft: `${16 + depth * 20}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button onClick={() => toggleExpand(item.id)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight size={14} className={`transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-3.5 h-3.5 inline-block" />
            )}
            <span className={`text-sm ${depth === 0 ? "font-semibold text-gray-700" : "text-gray-600"}`}>{item.label}</span>
          </div>
        </td>
        {PERM_KEYS.map(key => (
          <td key={key} className="px-4 py-2.5 text-center">
            <input
              type="checkbox"
              checked={perm[key]}
              onChange={e => onChange(item.id, key, e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
          </td>
        ))}
      </tr>
      {hasChildren && isExpanded && item.children!.map(child => (
        <PermRow
          key={child.id}
          item={child}
          depth={depth + 1}
          perms={perms}
          onChange={onChange}
          expanded={expanded}
          toggleExpand={toggleExpand}
          search={search}
        />
      ))}
    </>
  );
}

interface SaveModalProps {
  role: Role;
  onConfirm: () => void;
  onClose: () => void;
}

function SaveModal({ role, onConfirm, onClose }: SaveModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
            <Shield size={18} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Save Changes</h2>
            <p className="text-sm text-gray-500">Update access for <span className="font-medium">{role}</span>?</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">This will update the permissions for all users with the <strong>{role}</strong> role across the system.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <Save size={14} /> Confirm Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface AddAccessModalProps {
  existingRoles: Role[];
  onAdd: (name: string) => void;
  onClose: () => void;
}

function AddAccessModal({ existingRoles, onAdd, onClose }: AddAccessModalProps) {
  const [name, setName] = useState("");
  const duplicate = name.trim() && existingRoles.map(r => r.toLowerCase()).includes(name.trim().toLowerCase());
  const valid = name.trim().length > 0 && !duplicate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <Plus size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Add New Access</h2>
              <p className="text-sm text-gray-500">Create a new custom role</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Role Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && valid) { onAdd(name.trim()); onClose(); } }}
            placeholder="e.g. Finance Manager"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {duplicate && (
            <p className="text-xs text-red-500 mt-1">A role with this name already exists.</p>
          )}
          <p className="text-xs text-gray-400 mt-1.5">The new role will start with all permissions disabled. You can configure them after creation.</p>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => { if (valid) { onAdd(name.trim()); onClose(); } }}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} /> Create Role
          </button>
        </div>
      </div>
    </div>
  );
}

function IndeterminateCheckbox({ state, onChange }: { state: "all" | "none" | "indeterminate"; onChange: (val: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === "indeterminate";
      ref.current.checked = state === "all";
    }
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
      onChange={e => onChange(e.target.checked)}
    />
  );
}

export function AccessManagementPage() {
  const [roles, setRoles] = useState<Role[]>([...BUILTIN_ROLES]);
  const [activeRole, setActiveRole] = useState<Role>("Administrator");
  const [permissions, setPermissions] = useState<Record<Role, RolePermissions>>({
    "Administrator": deepClone(DEFAULT_ADMIN),
    "Director":      deepClone(DEFAULT_DIRECTOR),
    "HR Unit":       deepClone(DEFAULT_HR_UNIT),
    "HR ICF":        deepClone(DEFAULT_HR_ICF),
    "Supervisor":    deepClone(DEFAULT_SUPERVISOR),
    "Employee":      deepClone(DEFAULT_EMPLOYEE),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["approvals", "pa_monitoring", "calibration", "evidence", "pa_setting", "pa_measurement", "setting"]));
  const [search, setSearch] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showAddAccess, setShowAddAccess] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleChange(menuId: string, key: keyof Permission, val: boolean) {
    setSaved(false);
    setPermissions(prev => ({
      ...prev,
      [activeRole]: {
        ...prev[activeRole],
        [menuId]: { ...prev[activeRole][menuId], [key]: val },
      }
    }));
  }

  function handleReset() {
    setSaved(false);
    const isBuiltin = (BUILTIN_ROLES as string[]).includes(activeRole);
    setPermissions(prev => ({
      ...prev,
      [activeRole]: isBuiltin
        ? deepClone(BUILTIN_DEFAULTS[activeRole as BuiltinRole])
        : emptyPermissions(),
    }));
  }

  function handleSaveConfirm() {
    setSaved(true);
  }

  function handleCheckAllColumn(key: keyof Permission, val: boolean) {
    setSaved(false);
    const ids = allMenuIds();
    setPermissions(prev => {
      const rolePerm = { ...prev[activeRole] };
      ids.forEach(id => {
        rolePerm[id] = { ...(rolePerm[id] ?? { ...EMPTY_PERM }), [key]: val };
      });
      return { ...prev, [activeRole]: rolePerm };
    });
  }

  function getColumnCheckState(key: keyof Permission): "all" | "none" | "indeterminate" {
    const ids = allMenuIds();
    const rolePerm = permissions[activeRole] ?? {};
    const checkedCount = ids.filter(id => (rolePerm[id] ?? EMPTY_PERM)[key]).length;
    if (checkedCount === 0) return "none";
    if (checkedCount === ids.length) return "all";
    return "indeterminate";
  }

  function handleAddRole(name: string) {
    setRoles(prev => [...prev, name]);
    setPermissions(prev => ({ ...prev, [name]: emptyPermissions() }));
    setActiveRole(name);
    setSaved(false);
  }

  function handleDeleteRole(role: Role) {
    const idx = roles.indexOf(role);
    const next = roles.filter(r => r !== role);
    setRoles(next);
    setPermissions(prev => {
      const copy = { ...prev };
      delete copy[role];
      return copy;
    });
    setActiveRole(next[Math.min(idx, next.length - 1)]);
    setSaved(false);
  }

  const isBuiltinActive = (BUILTIN_ROLES as string[]).includes(activeRole);

  const roleColor = ROLE_COLORS[activeRole] ?? "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-800 text-xl">Access Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure role-based access permissions for each menu</p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span>
          <span>Home</span>
          <span className="mx-1">›</span>
          <span>Setting</span>
          <span className="mx-1">›</span>
          <span className="font-medium text-gray-700">Access Management</span>
        </div>
      </div>

      {/* Role tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
        <div className="flex items-center gap-1 p-3 border-b border-gray-100 flex-wrap">
          {roles.map(role => (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setSaved(false); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeRole === role
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Shield size={14} />
              {role}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowAddAccess(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <Plus size={14} />
            Add New Access
          </button>
          <span className={`ml-2 text-xs font-medium px-2.5 py-1 rounded-full border ${roleColor}`}>
            Editing: {activeRole}
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setExpanded(new Set(MENU_STRUCTURE.flatMap(m => m.children ? [m.id] : [])))}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Expand All
          </button>
          <button
            onClick={() => setExpanded(new Set())}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            Collapse All
          </button>
          <div className="flex-1" />
          {!isBuiltinActive && (
            <button
              onClick={() => handleDeleteRole(activeRole)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
            >
              <Trash2 size={13} /> Delete Role
            </button>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={13} /> Reset to Default
          </button>
          <button
            onClick={() => setShowSave(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Save size={13} /> Save Changes
          </button>
        </div>

        {saved && (
          <div className="mx-4 mb-3 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <span className="font-medium">Saved!</span> Permissions for <strong>{activeRole}</strong> have been updated successfully.
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">Menu / Module</th>
                {PERM_KEYS.map(key => (
                  <th key={key} className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">
                    <div className="flex flex-col items-center gap-1.5">
                      <span>{PERM_LABELS[key]}</span>
                      <IndeterminateCheckbox
                        state={getColumnCheckState(key)}
                        onChange={val => handleCheckAllColumn(key, val)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MENU_STRUCTURE.map(item => (
                <PermRow
                  key={item.id}
                  item={item}
                  depth={0}
                  perms={permissions[activeRole] ?? emptyPermissions()}
                  onChange={handleChange}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  search={search}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-6 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Legend:</span>
          {PERM_KEYS.map(key => (
            <span key={key} className="flex items-center gap-1.5">
              <input type="checkbox" readOnly checked className="w-3.5 h-3.5 accent-blue-600" />
              {PERM_LABELS[key]}
            </span>
          ))}
        </div>
      </div>

      {showSave && (
        <SaveModal
          role={activeRole}
          onConfirm={handleSaveConfirm}
          onClose={() => setShowSave(false)}
        />
      )}

      {showAddAccess && (
        <AddAccessModal
          existingRoles={roles}
          onAdd={handleAddRole}
          onClose={() => setShowAddAccess(false)}
        />
      )}
    </div>
  );
}
