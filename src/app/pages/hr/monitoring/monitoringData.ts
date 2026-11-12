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
      isSupervisor: allowed.includes("Managerial Skill") || u.role === "Supervisor" || u.role === "GM" || u.role === "Director",
      isSelf,
      allowedModules: allowed,
      hasManagementInterview: allowed.includes("Management Interview"),
      hasManagerialSkill: allowed.includes("Managerial Skill"),
      hasInterDeptFeedback: allowed.includes("Inter-Departement Feedback"),
    };
  });
  return mapped.sort((a, b) => (a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1));
}

export function getSupervisorScopedMonitoringEmployees(): MonitoringEmployee[] {
  const activeUser = getActiveUser();
  const authorized = getAuthorizedSubordinates(activeUser);
  const allowedIds = new Set(authorized.map((s) => s.employeeId.toLowerCase()));
  return getMonitoringEmployees().filter((e) => allowedIds.has(e.id.toLowerCase()));
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

const ALL_COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];

function getScopedCompanyUnits(): string[] {
  const activeUser = getActiveUser();
  const roleUnits = getRoleAllowedCompanyUnits(activeUser.role);
  if (roleUnits.length > 0) {
    return Array.from(new Set([...roleUnits, ...(activeUser.managedUnits ?? [])].filter(Boolean)));
  }
  if (activeUser.role === "HR Unit") {
    return Array.from(new Set([activeUser.company, ...(activeUser.managedUnits ?? [])].filter(Boolean)));
  }
  if (isDirectorRoleOrGrouping(activeUser)) {
    return getGroupCompaniesForUnit(activeUser.company, activeUser.managedUnits);
  }
  return ALL_COMPANY_UNITS;
}

export const COMPANY_UNITS: string[] = new Proxy([] as string[], {
  get(_target, prop, receiver) {
    const list = getScopedCompanyUnits();
    const value = Reflect.get(list, prop, receiver);
    return typeof value === "function" ? value.bind(list) : value;
  },
});
