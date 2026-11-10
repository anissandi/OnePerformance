import { useEffect, useState } from "react";
import { notifyLoginToSupabase, savePersistedState, syncToSupabase } from "../services/supabaseClient";

export type AppUserRole =
  | "Employee"
  | "Supervisor"
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
  { id: "1",  no: "1",  regNo: "REG-001", name: "Ahmad Fauzi",          employeeId: "E001", position: "Kepala Departemen Produksi",     company: "PT Pulau Sambu (Guntung)",    division: "Divisi Produksi & Operasional", department: "Produksi",              bagian: "Proses Kelapa A",      joinDate: "2016-03-15", telegramNo: "+628117001001", grade: "Grade 8",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Dept",        status: "Active", lastLogin: "2026-06-09 08:14", email: "ahmad.fauzi@sambugroup.com",      regNoAp1: "REG-008", regNoAp2: "REG-016" },
  { id: "2",  no: "2",  regNo: "REG-002", name: "Siti Rahayu",          employeeId: "E002", position: "Staff Pengembangan SDM",         company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Pengembangan SDM",     joinDate: "2021-07-01", telegramNo: "+628117001002", grade: "Grade 5",  role: "Employee",      groupings: "Operasional",           status: "Active", lastLogin: "2026-06-08 13:45", email: "siti.rahayu@sambugroup.com",      regNoAp1: "REG-014", regNoAp2: "REG-008" },
  { id: "3",  no: "3",  regNo: "REG-003", name: "Budi Santoso",         employeeId: "E003", position: "Kepala Bagian Keuangan",         company: "PT RSTM",                     division: "Finance & Accounting",          department: "Keuangan",              bagian: "Treasury",             joinDate: "2018-01-10", telegramNo: "+628117001003", grade: "Grade 7",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-08 17:32", email: "budi.santoso@sambugroup.com",     regNoAp1: "REG-008", regNoAp2: "REG-016" },
  { id: "4",  no: "4",  regNo: "REG-004", name: "Diana Kusuma",         employeeId: "E004", position: "Staff Pemasaran",                company: "PT GHS",                      division: "Generals",                      department: "Umum & Administrasi",   bagian: "Administrasi Umum",    joinDate: "2022-04-12", telegramNo: "+628117001004", grade: "Grade 4",  role: "Employee",      groupings: "Operasional",           status: "Active", lastLogin: "2026-06-07 09:10", email: "diana.kusuma@sambugroup.com",     regNoAp1: "REG-010", regNoAp2: "REG-008" },
  { id: "5",  no: "5",  regNo: "REG-005", name: "Eko Prasetyo",         employeeId: "E005", position: "Supervisor Teknologi Informasi", company: "PT Pulau Sambu (Jakarta)",    division: "Generals",                      department: "Teknologi Informasi",   bagian: "Infrastruktur IT",     joinDate: "2019-09-01", telegramNo: "+628117001005", grade: "Grade 7",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 07:58", email: "eko.prasetyo@sambugroup.com",     regNoAp1: "REG-008", regNoAp2: "REG-016" },
  { id: "6",  no: "6",  regNo: "REG-006", name: "Fajar Hidayat",        employeeId: "E006", position: "Kepala Seksi Operasional",       company: "PT RSUP (Perkebunan)",        division: "Coconut Production",            department: "Produksi Kelapa A",     bagian: "Proses Kelapa A",      joinDate: "2020-02-17", telegramNo: "+628117001006", grade: "Grade 6",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Seksi",       status: "Active", lastLogin: "2026-06-06 10:30", email: "fajar.hidayat@sambugroup.com",    regNoAp1: "REG-008", regNoAp2: "REG-016" },
  { id: "7",  no: "7",  regNo: "REG-007", name: "Gita Permata",         employeeId: "E007", position: "Staff Keuangan",                 company: "PT Pulau Sambu (Kuala Enok)", division: "Finance & Accounting",          department: "Keuangan",              bagian: "Anggaran",             joinDate: "2023-01-09", telegramNo: "+628117001007", grade: "Grade 4",  role: "Employee",      groupings: "Operasional",           status: "Active", lastLogin: "2026-05-20 11:45", email: "gita.permata@sambugroup.com",     regNoAp1: "REG-003", regNoAp2: "REG-008" },
  { id: "8",  no: "8",  regNo: "REG-008", name: "Hendra Wijaya",        employeeId: "E008", position: "Kepala Divisi Operasional",      company: "PT RSUP (Industry)",          division: "Coconut Production",            department: "Produksi Kelapa A",     bagian: "Proses Kelapa A",      joinDate: "2014-06-01", telegramNo: "+628117001008", grade: "Grade 9",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Div ke atas", status: "Active", lastLogin: "2026-06-09 14:22", email: "hendra.wijaya@sambugroup.com",    regNoAp1: "REG-016", regNoAp2: "REG-017" },
  { id: "9",  no: "9",  regNo: "REG-009", name: "Indah Lestari",        employeeId: "E009", position: "Staff Agronomi",                 company: "PT RSUP (Perkebunan)",        division: "Coconut Production",            department: "Produksi Kelapa B",     bagian: "Proses Kelapa B",      joinDate: "2021-11-03", telegramNo: "+628117001009", grade: "Grade 5",  role: "Employee",      groupings: "Operasional",           status: "Active", lastLogin: "2026-06-05 08:20", email: "indah.lestari@sambugroup.com",    regNoAp1: "REG-006", regNoAp2: "REG-008" },
  { id: "10", no: "10", regNo: "REG-010", name: "Joko Susanto",         employeeId: "E010", position: "Kepala Bagian Teknik",           company: "PT GHS",                      division: "Utility & Supports",            department: "Maintenance",           bagian: "Mechanical",           joinDate: "2017-08-21", telegramNo: "+628117001010", grade: "Grade 7",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-07 16:00", email: "joko.susanto@sambugroup.com",     regNoAp1: "REG-008", regNoAp2: "REG-016" },
  { id: "11", no: "11", regNo: "REG-011", name: "Kartini Dewi",         employeeId: "E011", position: "Staff Rekrutmen",                company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Rekrutmen & Seleksi",  joinDate: "2022-05-16", telegramNo: "+628117001011", grade: "Grade 4",  role: "Employee",      groupings: "Operasional",           status: "Active", lastLogin: "2026-06-10 08:00", email: "kartini.dewi@sambugroup.com",     regNoAp1: "REG-014", regNoAp2: "REG-008" },
  { id: "12", no: "12", regNo: "REG-012", name: "Lukman Hakim",         employeeId: "E012", position: "Supervisor Quality Control",     company: "PT Pulau Sambu (Guntung)",    division: "Quality Management",            department: "Quality Control",       bagian: "Inspeksi QC",          joinDate: "2018-10-15", telegramNo: "+628117001012", grade: "Grade 7",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 06:55", email: "lukman.hakim@sambugroup.com",     regNoAp1: "REG-001", regNoAp2: "REG-008" },
  { id: "13", no: "13", regNo: "REG-013", name: "Anis Sandi",           employeeId: "E013", position: "HR Strategic Specialist",        company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Pengembangan SDM",     joinDate: "2017-04-03", telegramNo: "+628117001013", grade: "Grade 6",  role: "Administrator", groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 09:00", email: "anis.sandi@sambugroup.com",       regNoAp1: "REG-008", regNoAp2: "REG-016", isHrIcfValidator: true },
  { id: "14", no: "14", regNo: "REG-014", name: "Ananta Nirmala",       employeeId: "E014", position: "Supervisor HR Unit",             company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Rekrutmen & Seleksi",  joinDate: "2018-06-11", telegramNo: "+628117001014", grade: "Grade 6",  role: "HR Unit",       groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 09:15", email: "hr.unit.ind@sambugroup.com",      regNoAp1: "REG-008", regNoAp2: "REG-016", isHrUnitChecker: true },
  { id: "15", no: "15", regNo: "REG-015", name: "Mario Sesman",         employeeId: "E015", position: "HR ICF Specialist",              company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Pengembangan SDM",     joinDate: "2016-11-20", telegramNo: "+628117001015", grade: "Grade 6",  role: "HR ICF",        groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 09:20", email: "mario.sesman@sambugroup.com",     regNoAp1: "REG-008", regNoAp2: "REG-016", isHrIcfValidator: true },
  { id: "16", no: "16", regNo: "REG-016", name: "Ir. Bambang Sutrisno", employeeId: "E016", position: "Direktur Operasional",           company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Pengembangan SDM",     joinDate: "2012-01-05", telegramNo: "+628117001016", grade: "Grade 10", role: "Director",      groupings: "Ka./Wa.Ka.Div ke atas", status: "Active", lastLogin: "2026-06-10 09:30", email: "bambang.sutrisno@sambugroup.com", regNoAp1: "REG-017", regNoAp2: "REG-017" },
  { id: "17", no: "17", regNo: "REG-017", name: "Surya Abimanyu",       employeeId: "E017", position: "Board of Directors",             company: "PT RSUP (Industry)",          division: "Staff Management",              department: "Sumber Daya Manusia",   bagian: "Pengembangan SDM",     joinDate: "2010-01-01", telegramNo: "+628117001017", grade: "Grade 11", role: "BOD",           groupings: "Ka./Wa.Ka.Div ke atas", status: "Active", lastLogin: "2026-06-10 09:40", email: "surya.abimanyu@sambugroup.com",   regNoAp1: "",        regNoAp2: "" },
  { id: "18", no: "18", regNo: "REG-018", name: "Wahyu Nugroho",        employeeId: "E018", position: "Kepala Bagian Operasional",      company: "ASD",                         division: "Coconut Production",            department: "Produksi Kelapa A",     bagian: "Proses Kelapa A",      joinDate: "2019-03-14", telegramNo: "+628117001018", grade: "Grade 7",  role: "Supervisor",    groupings: "Ka./Wa.Ka.Bagian",      status: "Active", lastLogin: "2026-06-10 09:50", email: "wahyu.nugroho@sambugroup.com",    regNoAp1: "REG-008", regNoAp2: "REG-016" },
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
  if (isAdminOrHrIcfRole(user.role) || user.role === "BOD" || user.role === "Director" || user.role === "HR Unit" || user.role === "Supervisor") {
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
  if (user.role === "HR Unit") {
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
  return users[1] ?? DEFAULT_MANAGED_USERS[1]; // Default Siti Rahayu (E002)
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
