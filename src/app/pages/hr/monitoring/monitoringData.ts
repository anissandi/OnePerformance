// Shared mock data for all HR Monitoring pages

import { getActiveUser, getStrictSubordinateUsers, loadManagedUsers, resolveUserAllowedModules } from "../../../store/authStore";

export interface MonitoringEmployee {
  id: string;
  name: string;
  position: string;
  department?: string;
  division: string;
  unit: string;
  grade: string;
  isSupervisor: boolean;
  hasManagementInterview?: boolean;
  hasManagerialSkill?: boolean;
  hasInterDeptFeedback?: boolean;
}

export function getMonitoringEmployees(): MonitoringEmployee[] {
  const users = loadManagedUsers();
  return users.map((u) => {
    const allowed = resolveUserAllowedModules(u);
    return {
      id: u.employeeId,
      name: u.name,
      position: u.position,
      department: u.department,
      division: u.division,
      unit: u.company,
      grade: u.grade || "Grade 5",
      isSupervisor: allowed.includes("Managerial Skill") || u.role === "Supervisor" || u.role === "GM" || u.role === "Director",
      hasManagementInterview: allowed.includes("Management Interview"),
      hasManagerialSkill: allowed.includes("Managerial Skill"),
      hasInterDeptFeedback: allowed.includes("Inter-Departement Feedback"),
    };
  });
}

export function getSupervisorScopedMonitoringEmployees(): MonitoringEmployee[] {
  const activeUser = getActiveUser();
  const subs = getStrictSubordinateUsers(activeUser);
  const subIds = new Set(subs.map((s) => s.employeeId.toLowerCase()));
  return getMonitoringEmployees().filter((e) => subIds.has(e.id.toLowerCase()));
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

export const COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];
