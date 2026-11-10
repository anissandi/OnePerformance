// Shared mock data for all HR Monitoring pages

import { loadManagedUsers } from "../../../store/authStore";

export interface MonitoringEmployee {
  id: string;
  name: string;
  position: string;
  division: string;
  unit: string;
  grade: string;
  isSupervisor: boolean;
}

export function getMonitoringEmployees(): MonitoringEmployee[] {
  const users = loadManagedUsers();
  return users.map((u) => ({
    id: u.employeeId,
    name: u.name,
    position: u.position,
    division: u.division,
    unit: u.company,
    grade: u.grade || "Grade 5",
    isSupervisor: u.role === "Supervisor" || u.role === "GM" || u.role === "Director" || u.groupings !== "Operasional",
  }));
}

export const EMPLOYEES: MonitoringEmployee[] = new Proxy([] as MonitoringEmployee[], {
  get(_target, prop, receiver) {
    const list = getMonitoringEmployees();
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
