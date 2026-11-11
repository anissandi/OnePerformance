import { useState, useRef, useEffect } from "react";
import { RefreshCw, Search, X, Save, ChevronRight, Shield, Plus, Trash2 } from "lucide-react";
import { loadPersistedState, savePersistedState, syncToSupabase } from "../../../services/supabaseClient";

export type BuiltinRole = "Administrator" | "BOD" | "Director" | "GM" | "HR Unit" | "HR ICF" | "Supervisor" | "Employee";
export type Role = BuiltinRole | string;

export interface Permission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  children?: MenuItem[];
}

export interface RolePermissions {
  [menuId: string]: Permission;
}

export const ACCESS_UPDATED_EVENT = "pa-access-updated";

export const MENU_STRUCTURE: MenuItem[] = [
  {
    id: "dashboard", label: "Dashboard",
    children: [
      { id: "dashboard_my",       label: "My Dashboard" },
      { id: "dashboard_approval", label: "Approval Summary" },
    ],
  },
  { id: "analytics", label: "Analytics Dashboard" },
  {
    id: "profile", label: "My Profile",
    children: [
      { id: "profile_overview", label: "Overview" },
      { id: "profile_results",  label: "PA Results" },
      { id: "profile_kpi",      label: "KPI Summary" },
    ],
  },
  {
    id: "appraisal", label: "My Performance Appraisal",
    children: [
      { id: "appraisal_kpi",        label: "KPI" },
      { id: "appraisal_smart",      label: "SMART Goals" },
      { id: "appraisal_form",       label: "Appraisal Form" },
      { id: "appraisal_project",    label: "Project Outside Job Scope" },
      { id: "appraisal_managerial", label: "Managerial Skill" },
      { id: "appraisal_feedback",   label: "Inter-Department Feedback" },
      { id: "appraisal_interview",  label: "Management Interview" },
    ],
  },
  {
    id: "approvals", label: "Approvals",
    children: [
      {
        id: "approvals_kpi_business", label: "KPI Business",
        children: [
          { id: "approvals_kpi_business_group", label: "KPI Group" },
          { id: "approvals_kpi_business_unit",  label: "KPI Unit (GM)" },
        ],
      },
      { id: "approvals_pa_measurement",  label: "Performance Appraisal Measurement" },
      { id: "approvals_feedback",        label: "Inter-Department Feedback Approvals" },
      { id: "approvals_pa_setting",      label: "Performance Appraisal Setting" },
      { id: "approvals_mgmt_interview",  label: "Management Interview" },
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
      { id: "mgmt_interview_invitation", label: "Invitation" },
    ]
  },
  { id: "history",   label: "PA Cycle History" },
  { id: "documents", label: "Documents" },
  { id: "override",  label: "Management Override" },
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
      {
        id: "setting_approval_mgmt", label: "Approval Management",
        children: [
          { id: "setting_approval_mgmt_flow",       label: "Approval Flow" },
          { id: "setting_approval_mgmt_icf",        label: "Approval ICF" },
          { id: "setting_approval_mgmt_other",      label: "Approval Other" },
          { id: "setting_approval_mgmt_delegation", label: "Delegation" },
        ],
      },
      {
        id: "setting_user_mgmt", label: "User Management",
        children: [
          { id: "setting_user_mgmt_users",    label: "Users & Approval Checker/Validator" },
          { id: "setting_user_mgmt_grouping", label: "User Groupings" },
        ],
      },
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
  dashboard: N,
  dashboard_my: N,
  dashboard_approval: N,
  calibration_verification: VE,
  analytics: V,
  profile: VE,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  approvals: VA,
  approvals_kpi_business:   T,
  approvals_kpi_business_group: T,
  approvals_kpi_business_unit:  T,
  approvals_pa_measurement: VA,
  approvals_feedback:       VA,
  approvals_pa_setting:     VA,
  approvals_mgmt_interview: N,
  approvals_open_lock:      VCEA,
  pa_monitoring: V,
  pa_monitoring_kpi:        VE,
  pa_monitoring_smart:      VE,
  pa_monitoring_appraisal:  VE,
  pa_monitoring_managerial: VE,
  pa_monitoring_project:    VE,
  pa_monitoring_interview:  VE,
  pa_monitoring_feedback:   N,
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
  history: V,
  documents: T,
  override: N,
  setting: V,
  setting_master: V,
  setting_master_kpi:       T,
  setting_master_appraisal: T,
  setting_master_managerial:T,
  setting_scores:        VE,
  setting_modules:       VE,
  setting_approval_mgmt: T,
  setting_approval_mgmt_flow:       T,
  setting_approval_mgmt_icf:        T,
  setting_approval_mgmt_other:      T,
  setting_approval_mgmt_delegation: T,
  setting_user_mgmt:     T,
  setting_user_mgmt_users:    T,
  setting_user_mgmt_grouping: T,
  setting_access_mgmt:   T,
  setting_menu_mgmt:     T,
  setting_data_sync:     VE,
  setting_cycle:         T,
  setting_audit:         V,
  appraisal:             N,
  appraisal_kpi:         N,
  appraisal_smart:       N,
  appraisal_form:        N,
  appraisal_project:     N,
  appraisal_managerial:  N,
  appraisal_feedback:    N,
  appraisal_interview:   N,
  approvals_calibration: N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
  mgmt_interview_invitation: N,
};

const DEFAULT_DIRECTOR: RolePermissions = {
  dashboard: N,
  dashboard_my: N,
  dashboard_approval: N,
  calibration_verification: N,
  analytics: V,
  profile: N,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  approvals: VA,
  approvals_kpi_business:   N,
  approvals_kpi_business_group: N,
  approvals_kpi_business_unit:  N,
  approvals_pa_measurement: VA,
  approvals_feedback:       VA,
  approvals_pa_setting:     VA,
  approvals_mgmt_interview: VA,
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
  history: V,
  documents: V,
  override: N,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_approval_mgmt_flow:       N,
  setting_approval_mgmt_icf:        N,
  setting_approval_mgmt_other:      N,
  setting_approval_mgmt_delegation: N,
  setting_user_mgmt:     N,
  setting_user_mgmt_users:    N,
  setting_user_mgmt_grouping: N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             N,
  appraisal_kpi:         N,
  appraisal_smart:       N,
  appraisal_form:        N,
  appraisal_project:     N,
  appraisal_managerial:  N,
  appraisal_feedback:    N,
  appraisal_interview:   N,
  approvals_calibration: VA,
  pa_monitoring_feedback:    N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  V,
  mgmt_interview_assessment: VCEA,
  mgmt_interview_invitation: N,
};

const DEFAULT_HR_UNIT: RolePermissions = {
  dashboard: V,
  dashboard_my: V,
  dashboard_approval: V,
  calibration_verification: N,
  analytics: V,
  profile: VE,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  approvals: VA,
  approvals_kpi_business:   N,
  approvals_kpi_business_group: N,
  approvals_kpi_business_unit:  N,
  approvals_pa_measurement: VA,
  approvals_feedback:       VA,
  approvals_pa_setting:     VA,
  approvals_mgmt_interview: N,
  approvals_open_lock:      N,
  pa_monitoring: V,
  pa_monitoring_kpi:        VE,
  pa_monitoring_smart:      VE,
  pa_monitoring_appraisal:  VE,
  pa_monitoring_managerial: VE,
  pa_monitoring_project:    VE,
  pa_monitoring_interview:  VE,
  pa_monitoring_feedback:   N,
  pa_summary: V,
  calibration: N,
  calibration_setting:    N,
  calibration_adjustment: N,
  calibration_interview:  N,
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
  history: V,
  documents: T,
  override: N,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_approval_mgmt_flow:       N,
  setting_approval_mgmt_icf:        N,
  setting_approval_mgmt_other:      N,
  setting_approval_mgmt_delegation: N,
  setting_user_mgmt:     N,
  setting_user_mgmt_users:    N,
  setting_user_mgmt_grouping: N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             V,
  appraisal_kpi:         V,
  appraisal_smart:       V,
  appraisal_form:        V,
  appraisal_project:     V,
  appraisal_managerial:  V,
  appraisal_feedback:    V,
  appraisal_interview:   V,
  approvals_calibration: N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
  mgmt_interview_invitation: N,
};

const DEFAULT_HR_ICF: RolePermissions = {
  ...DEFAULT_ADMIN,
  calibration_verification: VE,
  analytics: V,
  approvals: VA,
  approvals_kpi_business:   VCEA,
  approvals_kpi_business_group: VCEA,
  approvals_kpi_business_unit:  VCEA,
  approvals_pa_measurement: VA,
  approvals_feedback:       VA,
  approvals_pa_setting:     VA,
  approvals_mgmt_interview: N,
  approvals_open_lock:      VCE,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  V,
  pa_monitoring_feedback:   N,
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
  history: V,
  documents: VCE,
  override: N,
  setting: V,
  setting_master: V,
  setting_master_kpi:       VCEA,
  setting_master_appraisal: VCEA,
  setting_master_managerial:VCEA,
  setting_scores:        VE,
  setting_modules:       VE,
  setting_approval_mgmt: T,
  setting_approval_mgmt_flow:       T,
  setting_approval_mgmt_icf:        T,
  setting_approval_mgmt_other:      T,
  setting_approval_mgmt_delegation: T,
  setting_user_mgmt:     T,
  setting_user_mgmt_users:    T,
  setting_user_mgmt_grouping: T,
  setting_access_mgmt:   V,
  setting_menu_mgmt:     VCE,
  setting_data_sync:     V,
  setting_cycle:         VCET,
  setting_audit:         V,
  appraisal:             N,
  approvals_calibration: N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
  mgmt_interview_invitation: N,
};

const DEFAULT_SUPERVISOR: RolePermissions = {
  dashboard: V,
  dashboard_my: V,
  dashboard_approval: V,
  calibration_verification: N,
  analytics: N,
  profile: VE,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  approvals: VA,
  approvals_kpi_business:   N,
  approvals_kpi_business_group: N,
  approvals_kpi_business_unit:  N,
  approvals_pa_measurement: VA,
  approvals_feedback:       VA,
  approvals_pa_setting:     VA,
  approvals_mgmt_interview: N,
  approvals_open_lock:      N,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  N,
  pa_summary: V,
  calibration: V,
  calibration_setting:    N,
  calibration_adjustment: N,
  calibration_interview:  V,
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
  pa_measurement_interview:  N,
  history: V,
  documents: VCE,
  override: N,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_approval_mgmt_flow:       N,
  setting_approval_mgmt_icf:        N,
  setting_approval_mgmt_other:      N,
  setting_approval_mgmt_delegation: N,
  setting_user_mgmt:     N,
  setting_user_mgmt_users:    N,
  setting_user_mgmt_grouping: N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             V,
  appraisal_kpi:         V,
  appraisal_smart:       V,
  appraisal_form:        V,
  appraisal_project:     V,
  appraisal_managerial:  V,
  appraisal_feedback:    V,
  appraisal_interview:   V,
  approvals_calibration: N,
  pa_monitoring_feedback:    V,
  calibration_team_performance: V,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
  mgmt_interview_invitation: N,
};

const DEFAULT_EMPLOYEE: RolePermissions = {
  dashboard: V,
  dashboard_my: V,
  dashboard_approval: N,
  calibration_verification: N,
  analytics: N,
  profile: VE,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  approvals: N,
  approvals_kpi_business:   N,
  approvals_kpi_business_group: N,
  approvals_kpi_business_unit:  N,
  approvals_pa_measurement: N,
  approvals_feedback:       N,
  approvals_pa_setting:     N,
  approvals_mgmt_interview: N,
  approvals_open_lock:      N,
  pa_monitoring: N,
  pa_monitoring_kpi:        N,
  pa_monitoring_smart:      N,
  pa_monitoring_appraisal:  N,
  pa_monitoring_managerial: N,
  pa_monitoring_project:    N,
  pa_monitoring_interview:  N,
  pa_summary: N,
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
  pa_measurement_feedback:   VCET,
  pa_measurement_interview:  N,
  history: N,
  documents: V,
  override: N,
  setting: N,
  setting_master: N,
  setting_master_kpi:       N,
  setting_master_appraisal: N,
  setting_master_managerial:N,
  setting_scores:        N,
  setting_modules:       N,
  setting_approval_mgmt: N,
  setting_approval_mgmt_flow:       N,
  setting_approval_mgmt_icf:        N,
  setting_approval_mgmt_other:      N,
  setting_approval_mgmt_delegation: N,
  setting_user_mgmt:     N,
  setting_user_mgmt_users:    N,
  setting_user_mgmt_grouping: N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_cycle:         N,
  setting_audit:         N,
  appraisal:             V,
  appraisal_kpi:         V,
  appraisal_smart:       V,
  appraisal_form:        V,
  appraisal_project:     V,
  appraisal_managerial:  N,
  appraisal_feedback:    V,
  appraisal_interview:   N,
  approvals_calibration: N,
  pa_monitoring_feedback:    N,
  calibration_team_performance: N,
  pa_setting_project:    N,
  pa_setting_interview:  N,
  management_interview:  N,
  mgmt_interview_assessment: N,
  mgmt_interview_invitation: N,
};

const DEFAULT_BOD: RolePermissions = {
  dashboard: N,
  dashboard_my: N,
  dashboard_approval: N,
  calibration_verification: N,
  analytics: V,
  profile: N,
  profile_overview: VE,
  profile_results: V,
  profile_kpi: V,
  appraisal: N,
  appraisal_kpi:         N,
  appraisal_smart:       N,
  appraisal_form:        N,
  appraisal_project:     N,
  appraisal_managerial:  N,
  appraisal_feedback:    N,
  appraisal_interview:   N,
  approvals: VA,
  approvals_kpi_business:    N,
  approvals_kpi_business_group: N,
  approvals_kpi_business_unit:  N,
  approvals_pa_measurement:  VA,
  approvals_feedback:        VA,
  approvals_pa_setting:      VA,
  approvals_mgmt_interview:  VA,
  approvals_open_lock:       N,
  approvals_calibration:     VA,
  pa_monitoring: V,
  pa_monitoring_kpi:        V,
  pa_monitoring_smart:      V,
  pa_monitoring_appraisal:  V,
  pa_monitoring_managerial: V,
  pa_monitoring_project:    V,
  pa_monitoring_interview:  V,
  pa_monitoring_feedback:   N,
  pa_summary: V,
  calibration: V,
  calibration_setting:          N,
  calibration_adjustment:       V,
  calibration_interview:        N,
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
  mgmt_interview_invitation: N,
  history: V,
  documents: V,
  override: N,
  setting: N,
  setting_master: N,
  setting_master_kpi:        N,
  setting_master_appraisal:  N,
  setting_master_managerial: N,
  setting_scores:        N,
  setting_modules:       N,
  setting_cycle:         N,
  setting_approval_mgmt: N,
  setting_approval_mgmt_flow:       N,
  setting_approval_mgmt_icf:        N,
  setting_approval_mgmt_other:      N,
  setting_approval_mgmt_delegation: N,
  setting_user_mgmt:     N,
  setting_user_mgmt_users:    N,
  setting_user_mgmt_grouping: N,
  setting_access_mgmt:   N,
  setting_menu_mgmt:     N,
  setting_data_sync:     N,
  setting_audit:         N,
};

const DEFAULT_GM: RolePermissions = {
  ...DEFAULT_SUPERVISOR,
  dashboard: V,
  analytics: N,
  approvals_kpi_business: N,
  approvals_kpi_business_unit: N,
  pa_monitoring_interview: N,
  calibration: V,
  calibration_adjustment: N,
  calibration_team_performance: VE,
  pa_setting_interview: N,
};

export const BUILTIN_DEFAULTS: Record<BuiltinRole, RolePermissions> = {
  "Administrator": DEFAULT_ADMIN,
  "BOD":           DEFAULT_BOD,
  "Director":      DEFAULT_DIRECTOR,
  "GM":            DEFAULT_GM,
  "HR Unit":       DEFAULT_HR_UNIT,
  "HR ICF":        DEFAULT_HR_ICF,
  "Supervisor":    DEFAULT_SUPERVISOR,
  "Employee":      DEFAULT_EMPLOYEE,
};

export const BUILTIN_ROLES: BuiltinRole[] = ["Administrator", "BOD", "Director", "GM", "HR Unit", "HR ICF", "Supervisor", "Employee"];

const ROLE_COLORS: Record<string, string> = {
  "Administrator": "bg-slate-100 text-slate-700 border-slate-200",
  "BOD":           "bg-red-100 text-red-800 border-red-200",
  "Director":      "bg-rose-100 text-rose-700 border-rose-200",
  "GM":            "bg-indigo-100 text-indigo-700 border-indigo-200",
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
  onAdd: (name: string, baseRole?: Role) => void;
  onClose: () => void;
}

function AddAccessModal({ existingRoles, onAdd, onClose }: AddAccessModalProps) {
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<string>("");
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
        <div className="mb-5 space-y-3.5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Role Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && valid) { onAdd(name.trim(), baseRole || undefined); onClose(); } }}
              placeholder="e.g. Finance Manager"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {duplicate && (
              <p className="text-xs text-red-500 mt-1">A role with this name already exists.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Copy Initial Permissions From (Optional)</label>
            <select
              value={baseRole}
              onChange={e => setBaseRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="">— Empty (All Permissions Disabled) —</option>
              {existingRoles.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">
              This role will immediately become available in User Management, Menu Management, and Data Sync.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => { if (valid) { onAdd(name.trim(), baseRole || undefined); onClose(); } }}
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

const ACCESS_ROLES_KEY = "pa_access_roles_v1";
const ACCESS_PERMS_KEY = "pa_access_permissions_v1";

function getAllExpandableIds(items: MenuItem[] = MENU_STRUCTURE): string[] {
  const ids: string[] = [];
  function walk(list: MenuItem[]) {
    for (const item of list) {
      if (item.children && item.children.length > 0) {
        ids.push(item.id);
        walk(item.children);
      }
    }
  }
  walk(items);
  return ids;
}

function findDescendantIds(targetId: string, items: MenuItem[] = MENU_STRUCTURE): string[] {
  const result: string[] = [];
  function collect(list: MenuItem[]) {
    for (const item of list) {
      result.push(item.id);
      if (item.children) collect(item.children);
    }
  }
  function search(list: MenuItem[]): boolean {
    for (const item of list) {
      if (item.id === targetId) {
        if (item.children) collect(item.children);
        return true;
      }
      if (item.children && search(item.children)) return true;
    }
    return false;
  }
  search(items);
  return result;
}

function findAncestorIds(targetId: string, items: MenuItem[] = MENU_STRUCTURE): string[] {
  const path: string[] = [];
  function dfs(list: MenuItem[], ancestors: string[]): boolean {
    for (const item of list) {
      if (item.id === targetId) {
        path.push(...ancestors);
        return true;
      }
      if (item.children && dfs(item.children, [...ancestors, item.id])) {
        return true;
      }
    }
    return false;
  }
  dfs(items, []);
  return path;
}

function buildDefaultPermissionsMap(): Record<Role, RolePermissions> {
  return {
    "Administrator": deepClone(DEFAULT_ADMIN),
    "BOD":           deepClone(DEFAULT_BOD),
    "Director":      deepClone(DEFAULT_DIRECTOR),
    "GM":            deepClone(DEFAULT_GM),
    "HR Unit":       deepClone(DEFAULT_HR_UNIT),
    "HR ICF":        deepClone(DEFAULT_HR_ICF),
    "Supervisor":    deepClone(DEFAULT_SUPERVISOR),
    "Employee":      deepClone(DEFAULT_EMPLOYEE),
  };
}

export function loadAccessRoles(): Role[] {
  const saved = loadPersistedState<Role[]>(ACCESS_ROLES_KEY, [...BUILTIN_ROLES]);
  const merged: Role[] = [...BUILTIN_ROLES];
  if (Array.isArray(saved)) {
    for (const r of saved) {
      if (r && typeof r === "string" && !merged.includes(r)) {
        merged.push(r);
      }
    }
  }
  return merged;
}

export function loadRolePermissionsMap(): Record<Role, RolePermissions> {
  const defaults = buildDefaultPermissionsMap();
  const saved = loadPersistedState<Record<Role, RolePermissions>>(ACCESS_PERMS_KEY, {});
  const roles = loadAccessRoles();
  const result: Record<Role, RolePermissions> = {};

  for (const role of roles) {
    const base = defaults[role] ? deepClone(defaults[role]) : emptyPermissions();
    const savedRole = saved?.[role];
    if (savedRole && typeof savedRole === "object") {
      result[role] = { ...base, ...savedRole };
    } else {
      result[role] = base;
    }
  }
  return result;
}

export function getRolePermissions(role: Role): RolePermissions {
  const normalized = role === "HR Admin" ? "Administrator" : role;
  const map = loadRolePermissionsMap();
  return map[normalized] ?? map["Employee"] ?? emptyPermissions();
}

export function hasRolePermission(
  role: Role,
  menuId: string,
  action: keyof Permission = "view",
): boolean {
  if (!role) return false;
  const perms = getRolePermissions(role);
  return Boolean(perms[menuId]?.[action]);
}

export function canRoleViewMenu(role: Role, menuId: string): boolean {
  if (!role) return false;
  const perms = getRolePermissions(role);
  if (perms[menuId]?.view) return true;
  // Also check if any descendant of menuId has view === true
  const descendants = findDescendantIds(menuId);
  if (descendants.length > 0) {
    return descendants.some((childId) => Boolean(perms[childId]?.view));
  }
  return false;
}

export function updateMenuViewRolesFromMenuManagement(
  menuId: string,
  allowedRoles: Role[],
): void {
  const currentMap = loadRolePermissionsMap();
  const allRoles = loadAccessRoles();
  const nextMap: Record<Role, RolePermissions> = { ...currentMap };

  for (const role of allRoles) {
    const rolePerm = { ...(nextMap[role] ?? emptyPermissions()) };
    const shouldView = allowedRoles.includes(role);
    const prevPerm = rolePerm[menuId] ?? { ...EMPTY_PERM };
    rolePerm[menuId] = { ...prevPerm, view: shouldView };
    if (shouldView) {
      for (const ancestorId of findAncestorIds(menuId)) {
        const ancPerm = rolePerm[ancestorId] ?? { ...EMPTY_PERM };
        rolePerm[ancestorId] = { ...ancPerm, view: true };
      }
    }
    nextMap[role] = rolePerm;
  }

  savePersistedState(ACCESS_PERMS_KEY, nextMap);
  window.dispatchEvent(new Event(ACCESS_UPDATED_EVENT));
}

export function useAccessManagement() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener(ACCESS_UPDATED_EVENT, onUpdate);
    window.addEventListener("pa-db-hydrated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(ACCESS_UPDATED_EVENT, onUpdate);
      window.removeEventListener("pa-db-hydrated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const roles = loadAccessRoles();
  const permissionsMap = loadRolePermissionsMap();

  return {
    roles,
    permissionsMap,
    getRolePermissions: (role: Role) => permissionsMap[role === "HR Admin" ? "Administrator" : role] ?? emptyPermissions(),
    canView: (role: Role, menuId: string) => canRoleViewMenu(role, menuId),
    hasPermission: (role: Role, menuId: string, action: keyof Permission = "view") =>
      hasRolePermission(role, menuId, action),
  };
}

export function AccessManagementPage() {
  const [roles, setRoles] = useState<Role[]>(() => loadAccessRoles());
  const [activeRole, setActiveRole] = useState<Role>("Administrator");
  const [permissions, setPermissions] = useState<Record<Role, RolePermissions>>(() => loadRolePermissionsMap());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(getAllExpandableIds()));
  const [search, setSearch] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showAddAccess, setShowAddAccess] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onHydrated = () => {
      setRoles(loadAccessRoles());
      setPermissions(loadRolePermissionsMap());
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener(ACCESS_UPDATED_EVENT, onHydrated);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onHydrated);
    };
  }, []);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleChange(menuId: string, key: keyof Permission, val: boolean) {
    setSaved(false);
    setPermissions(prev => {
      const rolePerm = { ...(prev[activeRole] ?? emptyPermissions()) };
      const currentItemPerm = rolePerm[menuId] ?? { ...EMPTY_PERM };
      rolePerm[menuId] = {
        ...currentItemPerm,
        [key]: val,
        // Jika mencentang create/edit/delete/approve, otomatis view = true
        ...(val && key !== "view" ? { view: true } : {}),
      };

      // Cascade ke seluruh descendant (sub-menu) jika menuId adalah parent
      const descendants = findDescendantIds(menuId);
      for (const descId of descendants) {
        const descPerm = rolePerm[descId] ?? { ...EMPTY_PERM };
        rolePerm[descId] = {
          ...descPerm,
          [key]: val,
          ...(val && key !== "view" ? { view: true } : {}),
        };
      }

      // Jika mencentang true pada child, pastikan seluruh parent memiliki view = true (dan key = true bila relevan)
      if (val) {
        const ancestors = findAncestorIds(menuId);
        for (const ancId of ancestors) {
          const ancPerm = rolePerm[ancId] ?? { ...EMPTY_PERM };
          rolePerm[ancId] = {
            ...ancPerm,
            view: true,
            ...(key === "view" ? { view: true } : {}),
          };
        }
      }

      return {
        ...prev,
        [activeRole]: rolePerm,
      };
    });
  }

  function handleReset() {
    setSaved(false);
    const isBuiltin = (BUILTIN_ROLES as string[]).includes(activeRole);
    const resetRolePerms = isBuiltin
      ? deepClone(BUILTIN_DEFAULTS[activeRole as BuiltinRole])
      : emptyPermissions();
    setPermissions(prev => {
      const next = { ...prev, [activeRole]: resetRolePerms };
      savePersistedState(ACCESS_PERMS_KEY, next, {
        kind: "role-permissions",
        role: activeRole,
        permissions: resetRolePerms,
        audit: {
          action: "Update",
          module: "HR Settings",
          subModule: "Access Management",
          description: `Reset access permissions for role ${activeRole} to default`,
        },
      });
      window.dispatchEvent(new Event(ACCESS_UPDATED_EVENT));
      return next;
    });
  }

  function handleSaveConfirm() {
    const rolePerm = permissions[activeRole] ?? emptyPermissions();
    savePersistedState(ACCESS_ROLES_KEY, roles);
    savePersistedState(ACCESS_PERMS_KEY, permissions, {
      kind: "role-permissions",
      role: activeRole,
      permissions: rolePerm,
      audit: {
        action: "Update",
        module: "HR Settings",
        subModule: "Access Management",
        description: `Saved access permissions for role ${activeRole}`,
      },
    });
    window.dispatchEvent(new Event(ACCESS_UPDATED_EVENT));
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

  function handleAddRole(name: string, baseRole?: Role) {
    const nextRoles = [...roles, name];
    const initPerm = baseRole && permissions[baseRole]
      ? deepClone(permissions[baseRole])
      : emptyPermissions();
    const nextPerms = { ...permissions, [name]: initPerm };
    setRoles(nextRoles);
    setPermissions(nextPerms);
    savePersistedState(ACCESS_ROLES_KEY, nextRoles);
    savePersistedState(ACCESS_PERMS_KEY, nextPerms, {
      kind: "role-permissions",
      role: name,
      permissions: initPerm,
      audit: {
        action: "Create",
        module: "HR Settings",
        subModule: "Access Management",
        description: `Created custom access role ${name}`,
      },
    });
    window.dispatchEvent(new Event(ACCESS_UPDATED_EVENT));
    setActiveRole(name);
    setSaved(false);
  }

  function handleDeleteRole(role: Role) {
    const idx = roles.indexOf(role);
    const next = roles.filter(r => r !== role);
    setRoles(next);
    savePersistedState(ACCESS_ROLES_KEY, next);
    setPermissions(prev => {
      const copy = { ...prev };
      delete copy[role];
      savePersistedState(ACCESS_PERMS_KEY, copy);
      return copy;
    });
    void syncToSupabase({
      kind: "kv-state",
      stateKey: ACCESS_ROLES_KEY,
      stateValue: next,
      audit: {
        action: "Delete",
        module: "HR Settings",
        subModule: "Access Management",
        description: `Deleted custom access role ${role}`,
      },
    });
    window.dispatchEvent(new Event(ACCESS_UPDATED_EVENT));
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
            onClick={() => setExpanded(new Set(getAllExpandableIds()))}
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
