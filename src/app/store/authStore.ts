import { useEffect, useState } from "react";
import { notifyLoginToSupabase, savePersistedState, syncToSupabase } from "../services/supabaseClient";

export type AppUserRole =
  | "Employee"
  | "Supervisor"
  | "GM"
  | "HR Unit"
  | "HR ICF"
  | "Director"
  | "BOD"
  | "Administrator"
  | "HR Admin"
  | "";

export type UserGrouping =
  | "Operasional"
  | "Ka./Wa.Ka.Seksi"
  | "Ka./Wa.Ka.Bagian"
  | "Ka./Wa.Ka.Dept"
  | "Ka./Wa.Ka.Div ke atas";

export type AppraisalModuleName =
  | "KPI (Setting/Measurement)"
  | "SMART Goals (Setting/Measurement)"
  | "Appraisals Form"
  | "Project Outside Job Scope"
  | "Managerial Skill"
  | "Inter-Departement Feedback"
  | "Management Interview";

export interface ManagedUser {
  id: string;
  no?: string;
  regNo?: string;
  name: string;
  employeeId: string;
  position: string;
  company: string;
  division: string;
  department: string;
  bagian?: string;
  joinDate?: string;
  telegramNo?: string;
  grade: string;
  role: AppUserRole;
  groupings: string;
  status: "Active" | "Inactive";
  lastLogin: string;
  email: string;
  regNoAp1?: string;
  regNoAp2?: string;
  isHrUnitChecker?: boolean;
  isHrIcfValidator?: boolean;
}

export interface ManagedGroupRule {
  id: string;
  position: string;
  group: string;
  description: string;
  allowedModules: AppraisalModuleName[];
}

export const COMPANY_UNIT_LOCATIONS = [
  { code: "RSUP",  unitId: "IND",  company: "PT RSUP (Industry)",          fullName: "PT. Riau Sakti United Plantations (Industry)" },
  { code: "RSUP2", unitId: "PKB",  company: "PT RSUP (Perkebunan)",        fullName: "PT. Riau Sakti United Plantations (Perkebunan)" },
  { code: "PSJ",   unitId: "PSJ",  company: "PT Pulau Sambu (Jakarta)",    fullName: "PT. Pulau Sambu (Jakarta)" },
  { code: "PSG",   unitId: "GTG",  company: "PT Pulau Sambu (Guntung)",    fullName: "PT. Pulau Sambu (Guntung)" },
  { code: "PSKE",  unitId: "KEN",  company: "PT Pulau Sambu (Kuala Enok)", fullName: "PT. Pulau Sambu (Kuala Enok)" },
  { code: "RSTM",  unitId: "RSTM", company: "PT RSTM",                     fullName: "PT. Riau Sakti Transmandiri" },
  { code: "GHS",   unitId: "GHS",  company: "PT GHS",                      fullName: "PT. Guntung Hasratmakmur" },
  { code: "ASD",   unitId: "ASD",  company: "ASD",                         fullName: "PT. Agrisambu" },
] as const;

export const RSUP_GROUP_COMPANIES = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT RSTM",
  "PT GHS",
  "ASD",
] as const;

export const DEFAULT_MANAGED_USERS: ManagedUser[] = [
  { id: "1", no: "1", regNo: "REG-001", name: "Administrator PA", employeeId: "ADMIN", position: "System Administrator", company: "PT RSUP (Industry)", division: "Staff Management", department: "Sumber Daya Manusia", bagian: "Pengembangan SDM", joinDate: "2020-01-01", telegramNo: "", grade: "Grade 6", role: "Administrator", groupings: "Ka./Wa.Ka.Bagian", status: "Active", lastLogin: "", email: "admin@sambugroup.com", regNoAp1: "", regNoAp2: "", isHrIcfValidator: true },
];

export function inferGroupingFromPosition(position: string): UserGrouping {
  const p = position.toLowerCase();
  if (/direktur|director|bod|gm|general manager|koordinator|divisi/i.test(p)) {
    return "Ka./Wa.Ka.Div ke atas";
  }
  if (/departemen|dept/i.test(p)) {
    return "Ka./Wa.Ka.Dept";
  }
  if (/bagian|supervisor/i.test(p)) {
    return "Ka./Wa.Ka.Bagian";
  }
  if (/seksi|shift|pengawas/i.test(p)) {
    return "Ka./Wa.Ka.Seksi";
  }
  return "Operasional";
}

export function isAdminOrHrIcfRole(role: AppUserRole): boolean {
  return role === "Administrator" || role === "HR ICF" || role === "HR Admin";
}

export function isUserApprover(user: ManagedUser, allUsers = loadManagedUsers()): boolean {
  if (isAdminOrHrIcfRole(user.role) || user.role === "BOD" || user.role === "Director" || user.role === "GM" || user.role === "HR Unit" || user.role === "Supervisor") {
    return true;
  }
  const reg = (user.regNo ?? "").trim().toLowerCase();
  const emp = user.employeeId.trim().toLowerCase();
  if (!reg && !emp) return false;
  return allUsers.some((u) => {
    const ap1 = (u.regNoAp1 ?? "").trim().toLowerCase();
    const ap2 = (u.regNoAp2 ?? "").trim().toLowerCase();
    return (reg && (ap1 === reg || ap2 === reg)) || (emp && (ap1 === emp || ap2 === emp));
  });
}

export function getAuthorizedSubordinates(user: ManagedUser, allUsers = loadManagedUsers()): ManagedUser[] {
  if (isAdminOrHrIcfRole(user.role) || user.role === "BOD" || user.role === "Director") {
    return allUsers;
  }
  if (user.role === "HR Unit" || user.role === "GM") {
    return allUsers.filter((u) => u.company === user.company);
  }
  const reg = (user.regNo ?? "").trim().toLowerCase();
  const emp = user.employeeId.trim().toLowerCase();
  const directMatches = allUsers.filter((u) => {
    if (u.employeeId === user.employeeId) return true;
    const ap1 = (u.regNoAp1 ?? "").trim().toLowerCase();
    const ap2 = (u.regNoAp2 ?? "").trim().toLowerCase();
    if (reg && (ap1 === reg || ap2 === reg)) return true;
    if (emp && (ap1 === emp || ap2 === emp)) return true;
    return false;
  });
  if (directMatches.length > 1) return directMatches;
  if (user.role === "Supervisor") {
    return allUsers.filter(
      (u) =>
        u.employeeId === user.employeeId ||
        (u.company === user.company && (u.division === user.division || u.department === user.department)),
    );
  }
  return allUsers.filter((u) => u.employeeId === user.employeeId);
}

export function canUserAccessEmployeeData(
  viewer: ManagedUser,
  targetEmployeeIdOrName: string,
  allUsers = loadManagedUsers(),
): boolean {
  if (isAdminOrHrIcfRole(viewer.role) || viewer.role === "BOD" || viewer.role === "Director") {
    return true;
  }
  const q = targetEmployeeIdOrName.trim().toLowerCase().replace(/^emp-?0*/i, "");
  const viewerNum = viewer.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
  if (
    viewer.employeeId.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
    viewer.name.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
    (q && viewerNum === q)
  ) {
    return true;
  }
  const allowed = getAuthorizedSubordinates(viewer, allUsers);
  return allowed.some((u) => {
    const uNum = u.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
    return (
      u.employeeId.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      u.name.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      (q && uNum === q)
    );
  });
}

/**
 * Bagian XII Poin 2:
 * HR Unit yang ditunjuk sebagai Checker tidak bisa melakukan Checker pada pengajuan
 * KPI & SMART Goals miliknya sendiri sehingga langsung masuk ke Approval 1 dst.
 */
export function shouldBypassCheckerForSubmission(
  submitterEmployeeId: string,
  allUsers = loadManagedUsers(),
): boolean {
  const clean = submitterEmployeeId.trim().toLowerCase().replace(/^emp-?0*/i, "");
  const found = allUsers.find((u) => {
    const uClean = u.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
    return (
      u.employeeId.toLowerCase() === submitterEmployeeId.trim().toLowerCase() ||
      (clean && uClean === clean)
    );
  });
  if (!found) return false;
  return found.role === "HR Unit" || Boolean(found.isHrUnitChecker);
}

export function defaultAllowedModulesForGrouping(group: string): AppraisalModuleName[] {
  const normalized = group.trim();
  if (normalized === "Operasional" || normalized === "Ka./Wa.Ka.Seksi") {
    return [
      "KPI (Setting/Measurement)",
      "SMART Goals (Setting/Measurement)",
      "Appraisals Form",
      "Project Outside Job Scope",
    ];
  }
  if (normalized === "Ka./Wa.Ka.Div ke atas" || normalized === "TEAM_DIV") {
    return [
      "KPI (Setting/Measurement)",
      "SMART Goals (Setting/Measurement)",
      "Appraisals Form",
      "Project Outside Job Scope",
      "Managerial Skill",
      "Inter-Departement Feedback",
      "Management Interview",
    ];
  }
  // Ka./Wa.Ka.Bagian & Ka./Wa.Ka.Dept
  return [
    "KPI (Setting/Measurement)",
    "SMART Goals (Setting/Measurement)",
    "Appraisals Form",
    "Project Outside Job Scope",
    "Managerial Skill",
    "Inter-Departement Feedback",
  ];
}

const USERS_KEY = "pa_managed_users_v1";
const ACTIVE_USER_KEY = "pa_active_user_v1";
const GROUP_RULES_BY_UNIT_KEY = "pa_group_rules_by_unit_v1";

export function loadManagedUsers(): ManagedUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return DEFAULT_MANAGED_USERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_MANAGED_USERS;
  } catch {
    return DEFAULT_MANAGED_USERS;
  }
}

export function saveManagedUsers(users: ManagedUser[], changedUser?: ManagedUser, deletedId?: string): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    window.dispatchEvent(new Event("pa-auth-updated"));
    if (changedUser) {
      void syncToSupabase({
        kind: "user-upsert",
        user: changedUser,
        audit: {
          userId: changedUser.employeeId,
          userName: changedUser.name,
          role: changedUser.role || "Employee",
          action: "Update",
          module: "User Management",
          subModule: "Users",
          description: `Updated user ${changedUser.name} (${changedUser.employeeId}) — Role: ${changedUser.role}, Unit: ${changedUser.company}`,
        },
      });
    } else if (deletedId) {
      void syncToSupabase({
        kind: "user-delete",
        employeeId: deletedId,
      });
    }
  } catch {
    // ignore storage errors
  }
}

export function loadUnitGroupRules(company: string, fallback: ManagedGroupRule[]): ManagedGroupRule[] {
  try {
    const raw = localStorage.getItem(GROUP_RULES_BY_UNIT_KEY);
    if (!raw) return fallback;
    const map = JSON.parse(raw) as Record<string, ManagedGroupRule[]>;
    return map[company] ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveUnitGroupRules(company: string, rules: ManagedGroupRule[]): void {
  try {
    const raw = localStorage.getItem(GROUP_RULES_BY_UNIT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, ManagedGroupRule[]>) : {};
    map[company] = rules;
    window.dispatchEvent(new Event("pa-auth-updated"));
    savePersistedState(GROUP_RULES_BY_UNIT_KEY, map, {
      kind: "group-rules",
      company,
      rules,
    });
  } catch {
    // ignore
  }
}

export function getActiveUser(): ManagedUser {
  const users = loadManagedUsers();
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ManagedUser;
      const latest = users.find((u) => u.employeeId.toUpperCase() === parsed.employeeId.toUpperCase());
      if (latest) return latest;
      return parsed;
    }
  } catch {
    // fallback
  }
  return users[0] ?? DEFAULT_MANAGED_USERS[0];
}

export function resolvePortalPathForRole(role: AppUserRole, position = ""): "/hr" | "/bod" | "/supervisor" | "/employee" {
  if (role === "Administrator" || role === "HR Admin" || role === "HR Unit" || role === "HR ICF") {
    return "/hr";
  }
  if (role === "BOD" || role === "Director" || /direktur|director|bod/i.test(position)) {
    return "/bod";
  }
  if (
    role === "Supervisor" ||
    role === "GM" ||
    /kepala|supervisor|manager|gm|pengawas/i.test(position)
  ) {
    return "/supervisor";
  }
  return "/employee";
}

export function resolveUserAllowedModules(user: ManagedUser): AppraisalModuleName[] {
  try {
    const raw = localStorage.getItem(GROUP_RULES_BY_UNIT_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, ManagedGroupRule[]>;
      const unitRules = map[user.company];
      if (unitRules) {
        const matched = unitRules.find(
          (r) =>
            r.position.toLowerCase() === user.position.toLowerCase() ||
            r.group.toLowerCase() === user.groupings.toLowerCase(),
        );
        if (matched && matched.allowedModules.length > 0) {
          return matched.allowedModules;
        }
      }
    }
  } catch {
    // fallback to grouping defaults
  }
  if (user.role === "HR Unit") {
    // Dual-role HR Unit: acts as appraisal participant at Ka./Wa.Ka.Bagian level
    return defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian");
  }
  if (/divisi|gm|direktur/i.test(user.position) || user.groupings === "Ka./Wa.Ka.Div ke atas" || user.groupings === "TEAM_DIV") {
    return defaultAllowedModulesForGrouping("Ka./Wa.Ka.Div ke atas");
  }
  if (/departemen|bagian|supervisor/i.test(user.position) || user.groupings === "Ka./Wa.Ka.Bagian" || user.groupings === "Ka./Wa.Ka.Dept") {
    return defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian");
  }
  return defaultAllowedModulesForGrouping(user.groupings);
}

export function loginWithCompanyAndEmployeeId(
  companyName: string,
  employeeIdInput: string,
): { ok: true; user: ManagedUser; redirectPath: string } | { ok: false; error: string } {
  const users = loadManagedUsers();
  const q = employeeIdInput.trim().toLowerCase();
  if (!q) {
    return { ok: false, error: "Masukkan Employee ID terlebih dahulu." };
  }

  // Match by Employee ID, email, or name (prioritizing selected company unit)
  const matched =
    users.find(
      (u) =>
        u.company === companyName &&
        (u.employeeId.toLowerCase() === q || u.email.toLowerCase() === q || u.name.toLowerCase() === q),
    ) ??
    users.find(
      (u) => u.employeeId.toLowerCase() === q || u.email.toLowerCase() === q || u.name.toLowerCase() === q,
    );

  if (!matched) {
    return {
      ok: false,
      error: `Employee ID "${employeeIdInput}" tidak ditemukan pada User Management.`,
    };
  }
  if (matched.status !== "Active") {
    return {
      ok: false,
      error: `Akun ${matched.name} (${matched.employeeId}) berstatus Inactive di User Management.`,
    };
  }
  if (!matched.role) {
    return {
      ok: false,
      error: `Akun ${matched.name} (${matched.employeeId}) belum memiliki Role di User Management.`,
    };
  }

  const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
  const updatedUser: ManagedUser = { ...matched, lastLogin: nowStr };
  const updatedList = users.map((u) => (u.id === matched.id ? updatedUser : u));
  localStorage.setItem(USERS_KEY, JSON.stringify(updatedList));
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(updatedUser));
  window.dispatchEvent(new Event("pa-auth-updated"));
  void notifyLoginToSupabase({
    employeeId: updatedUser.employeeId,
    name: updatedUser.name,
    role: updatedUser.role,
    company: updatedUser.company,
  });

  const redirectPath = resolvePortalPathForRole(updatedUser.role, updatedUser.position);
  return { ok: true, user: updatedUser, redirectPath };
}

export function switchActiveUserByEmployeeId(employeeId: string): ManagedUser | null {
  const users = loadManagedUsers();
  const found = users.find((u) => u.employeeId.toUpperCase() === employeeId.toUpperCase());
  if (!found) return null;
  localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(found));
  window.dispatchEvent(new Event("pa-auth-updated"));
  return found;
}

export function useAuthStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener("pa-auth-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("pa-auth-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const activeUser = getActiveUser();
  const allUsers = loadManagedUsers();
  const allowedModules = resolveUserAllowedModules(activeUser);
  const isHrUnitLocked = activeUser.role === "HR Unit";
  const lockedUnits = isHrUnitLocked ? [activeUser.company] : undefined;

  return {
    activeUser,
    allUsers,
    allowedModules,
    isHrUnitLocked,
    lockedUnits,
    portalPath: resolvePortalPathForRole(activeUser.role, activeUser.position),
  };
}
