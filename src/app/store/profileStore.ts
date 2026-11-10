import { getActiveUser } from "./authStore";

export interface UserProfile {
  name: string;
  initials: string;
  employeeId: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  location: string;
  email: string;
  phone: string;
  joinDate: string;
}

export function getDynamicUserProfile(): UserProfile {
  const u = getActiveUser();
  const initials = u.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "PA";
  return {
    name: u.name,
    initials,
    employeeId: u.employeeId,
    position: u.position,
    department: u.department,
    division: u.division,
    companyUnit: u.company,
    location: u.bagian ? `${u.division} · ${u.bagian}` : u.division || u.company,
    email: u.email,
    phone: u.telegramNo || "—",
    joinDate: u.joinDate || "—",
  };
}

export const STAFF_PROFILE: UserProfile = new Proxy({} as UserProfile, {
  get(_target, prop: keyof UserProfile) {
    return getDynamicUserProfile()[prop];
  },
});

export const SUPERVISOR_PROFILE: UserProfile = new Proxy({} as UserProfile, {
  get(_target, prop: keyof UserProfile) {
    return getDynamicUserProfile()[prop];
  },
});
