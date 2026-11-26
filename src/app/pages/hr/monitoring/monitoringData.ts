// Shared mock data for all HR Monitoring pages

import {
  getActiveUser,
  getAuthorizedSubordinates,
  getGroupCompaniesForUnit,
  getRoleAllowedCompanyUnits,
  isAdminOrHrIcfRole,
  isDirectorRoleOrGrouping,
  loadManagedUsers,
  resolveUserAllowedModules,
  type AppraisalModuleName,
} from "../../../store/authStore";
import { ACCESS_UPDATED_EVENT } from "../settings/AccessManagement";
import { MASTER_COMPANY_UPDATED_EVENT, getMasterCompanyLocations } from "../settings/masterCompanyStore";

let _monEpoch = 1;
let _cachedMonSig = "";
let _cachedMonList: MonitoringEmployee[] | null = null;
let _cachedSupMonSig = "";
let _cachedSupMonList: MonitoringEmployee[] | null = null;
let _cachedUnitsSig = "";
let _cachedUnitsList: string[] | null = null;

if (typeof window !== "undefined") {
  const bump = () => {
    _monEpoch++;
    _cachedMonList = null;
    _cachedSupMonList = null;
    _cachedUnitsList = null;
  };
  window.addEventListener("pa-auth-updated", bump);
  window.addEventListener(ACCESS_UPDATED_EVENT, bump);
  window.addEventListener(MASTER_COMPANY_UPDATED_EVENT, bump);
  window.addEventListener("pa-db-hydrated", bump);
  window.addEventListener("pa-employees-imported", bump);
  window.addEventListener("storage", bump);
}

export interface MonitoringEmployee {
  id: string;
  name: string;
  position: string;
  department?: string;
  division: string;
  unit: string;
  grade: string;
  isSupervisor: boolean;
  isSelf?: boolean;
  allowedModules?: AppraisalModuleName[];
  hasManagementInterview?: boolean;
  hasManagerialSkill?: boolean;
  hasInterDeptFeedback?: boolean;
}

export function getMonitoringEmployees(): MonitoringEmployee[] {
  const users = loadManagedUsers();
  const activeUser = getActiveUser();
  const sig = `${_monEpoch}|${users.length}|${activeUser.employeeId}|${activeUser.regNo ?? ""}|${activeUser.role}|${activeUser.company}|${activeUser.position}`;
  if (_cachedMonList && _cachedMonSig === sig) {
    return _cachedMonList;
  }
  const isGlobalViewer =
    isAdminOrHrIcfRole(activeUser.role) || activeUser.role === "BOD";
  const scopedUsers = isGlobalViewer ? users : getAuthorizedSubordinates(activeUser, users);
  const mapped = scopedUsers.map((u) => {
    const allowed = resolveUserAllowedModules(u);
    const isSelf = u.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase();
    return {
      id: u.employeeId,
      name: u.name,
      position: u.position,
      department: u.department,
      division: u.division,
      unit: u.company,
      grade: u.grade || "Grade 5",
      isSupervisor:
        allowed.includes("Managerial Skill") ||
        u.role === "Supervisor" ||
        u.role === "GM" ||
        u.role === "VGM" ||
        u.role === "vGM" ||
        u.role === "Coordinator" ||
        u.role === "Division" ||
        u.role === "Departement" ||
        u.role === "Director" ||
        u.role === "DirectorNonOpr",
      isSelf,
      allowedModules: allowed,
      hasManagementInterview: allowed.includes("Management Interview"),
      hasManagerialSkill: allowed.includes("Managerial Skill"),
      hasInterDeptFeedback: allowed.includes("Inter-Departement Feedback"),
    };
  });
  const sorted = mapped.sort((a, b) => (a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1));
  _cachedMonSig = sig;
  _cachedMonList = sorted;
  return sorted;
}

export function getSupervisorScopedMonitoringEmployees(): MonitoringEmployee[] {
  const activeUser = getActiveUser();
  const users = loadManagedUsers();
  const sig = `${_monEpoch}|${users.length}|${activeUser.employeeId}|${activeUser.regNo ?? ""}|${activeUser.role}|${activeUser.company}|${activeUser.position}`;
  if (_cachedSupMonList && _cachedSupMonSig === sig) {
    return _cachedSupMonList;
  }
  const authorized = getAuthorizedSubordinates(activeUser, users);
  const allowedIds = new Set(authorized.map((s) => s.employeeId.toLowerCase()));
  const filtered = getMonitoringEmployees().filter((e) => allowedIds.has(e.id.toLowerCase()));
  _cachedSupMonSig = sig;
  _cachedSupMonList = filtered;
  return filtered;
}

/**
 * Memfilter karyawan Monitoring (termasuk Data Owner yang sedang login) agar hanya menampilkan
 * mereka yang di-allow pada modul tersebut sesuai User Groupings, dengan Data Owner di urutan teratas.
 */
export function filterMonitoringByModuleAccess(
  employees: MonitoringEmployee[],
  moduleName: AppraisalModuleName,
): MonitoringEmployee[] {
  return employees
    .filter((e) => (e.allowedModules ? e.allowedModules.includes(moduleName) : true))
    .sort((a, b) => (a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1));
}

export const EMPLOYEES: MonitoringEmployee[] = new Proxy([] as MonitoringEmployee[], {
  get(_target, prop, receiver) {
    const list = getMonitoringEmployees();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

export const SUPERVISOR_TEAM_EMPLOYEES: MonitoringEmployee[] = new Proxy([] as MonitoringEmployee[], {
  get(_target, prop, receiver) {
    const list = getSupervisorScopedMonitoringEmployees();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

function getAllMasterUnitsList(): string[] {
  const dyn = getMasterCompanyLocations().map((l) => l.company);
  return dyn.length > 0
    ? dyn
    : [
        "PT RSUP (Industry)",
        "PT RSUP (Perkebunan)",
        "PT Pulau Sambu (Jakarta)",
        "PT Pulau Sambu (Guntung)",
        "PT Pulau Sambu (Kuala Enok)",
        "PT RSTM",
        "PT GHS",
        "PT RSUP ASD",
      ];
}

function getScopedCompanyUnits(): string[] {
  const activeUser = getActiveUser();
  const allUnits = getAllMasterUnitsList();
  const sig = `${_monEpoch}|${activeUser.employeeId}|${activeUser.role}|${activeUser.company}|${allUnits.join(",")}`;
  if (_cachedUnitsList && _cachedUnitsSig === sig) {
    return _cachedUnitsList;
  }
  const isGlobalViewer = isAdminOrHrIcfRole(activeUser.role) || activeUser.role === "BOD";
  const roleUnits = getRoleAllowedCompanyUnits(activeUser.role);
  if (isGlobalViewer) {
    if (roleUnits.length > 0) {
      const u = Array.from(new Set([...roleUnits, ...(activeUser.managedUnits ?? [])].filter(Boolean)));
      _cachedUnitsSig = sig;
      _cachedUnitsList = u;
      return u;
    }
    _cachedUnitsSig = sig;
    _cachedUnitsList = allUnits;
    return allUnits;
  }
  const visibleUnits = new Set(getMonitoringEmployees().map((e) => e.unit).filter(Boolean));
  const ordered = [
    ...allUnits.filter((u) => visibleUnits.has(u)),
    ...Array.from(visibleUnits).filter((u) => !allUnits.includes(u)),
  ];
  const finalUnits = ordered.length > 0 ? ordered : [activeUser.company].filter(Boolean);
  _cachedUnitsSig = sig;
  _cachedUnitsList = finalUnits;
  return finalUnits;
}

export const COMPANY_UNITS: string[] = new Proxy([] as string[], {
  get(_target, prop, receiver) {
    const list = getScopedCompanyUnits();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});
