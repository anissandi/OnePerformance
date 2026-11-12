import { useEffect, useState } from "react";
import { notifyLoginToSupabase, savePersistedState, syncToSupabase } from "../services/supabaseClient";
import {
  ACCESS_UPDATED_EVENT,
  getGroupAllowedModules,
  getGroupAuthorityLevel,
  getRoleMetadata,
  getRolePermissions,
  loadAccessGroups,
} from "../pages/hr/settings/AccessManagement";

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
  | ""
  | string;

export type UserGrouping =
  | "Operasional"
  | "Ka./Wa.Ka.Seksi"
  | "Ka./Wa.Ka.Bagian"
  | "Ka./Wa.Ka.Dept"
  | "Ka./Wa.Ka.Div ke atas"
  | "Direktur / Director"
  | string;

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
  /** Peran khusus Role Director pada Calibration Approval: "approver" (Approve/Revision) atau "mengetahui" (Acknowledge) */
  directorCalibrationRole?: "approver" | "mengetahui" | "";
  /** Mapping Peran Approval Calibration per Company Unit ("approver" | "mengetahui" | "") */
  calibrationRoleByUnit?: Record<string, "approver" | "mengetahui" | "">;
  /** Cakupan tambahan jika pejabat membawahi >1 Unit / Divisi / Departemen / Bagian */
  managedUnits?: string[];
  managedDivisions?: string[];
  managedDepartments?: string[];
  managedBagians?: string[];
}

export interface ManagedGroupRule {
  id: string;
  position: string;
  group: string;
  description: string;
  allowedModules: AppraisalModuleName[];
}

export const COMPANY_UNIT_LOCATIONS = [
  { code: "RSUP IDN", unitId: "IND",  company: "PT RSUP (Industry)",          fullName: "PT. Riau Sakti United Plantations (Industry)" },
  { code: "RSUP PKB", unitId: "PKB",  company: "PT RSUP (Perkebunan)",        fullName: "PT. Riau Sakti United Plantations (Perkebunan)" },
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

export const SAMBU_GROUP_COMPANIES = [
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
] as const;

export function getGroupNameForUnit(company: string): "RSUP Group" | "Sambu Group" {
  const c = (company ?? "").trim().toLowerCase();
  if (
    (SAMBU_GROUP_COMPANIES as readonly string[]).some((u) => u.toLowerCase() === c) ||
    c.includes("pulau sambu")
  ) {
    return "Sambu Group";
  }
  return "RSUP Group";
}

export function getRoleAllowedCompanyUnits(role?: string): string[] {
  if (!role) return [];
  const meta = getRoleMetadata(role);
  return Array.isArray(meta.allowedCompanyUnits)
    ? meta.allowedCompanyUnits.filter(Boolean)
    : [];
}

export function getGroupCompaniesForUnit(company: string, extraUnits?: string[]): string[] {
  const activeUser = getActiveUser();
  const roleUnits =
    activeUser && activeUser.company === company
      ? getRoleAllowedCompanyUnits(activeUser.role)
      : [];
  if (roleUnits.length > 0) {
    return Array.from(new Set([...roleUnits, ...(extraUnits ?? [])].filter(Boolean)));
  }
  const groupName = getGroupNameForUnit(company);
  const base =
    groupName === "Sambu Group"
      ? [...SAMBU_GROUP_COMPANIES]
      : [...RSUP_GROUP_COMPANIES];
  return Array.from(new Set([...base, ...(extraUnits ?? [])].filter(Boolean)));
}

export function isDirectorRoleOrGrouping(user?: { role?: string; groupings?: string; position?: string } | null): boolean {
  if (!user) return false;
  if (user.role === "Director") return true;
  const g = (user.groupings ?? "").trim().toLowerCase();
  if (g === "direktur / director" || g === "director" || g === "direktur") return true;
  if (g) {
    const tier = getGroupAuthorityLevel(user.groupings ?? "");
    if (tier === "director_group") return true;
  }
  return false;
}

export function isExcludedFromAppraisalCalibration(user?: { role?: string; groupings?: string; position?: string; company?: string } | null): boolean {
  if (!user) return false;
  if (user.role && getRoleMetadata(user.role).excludeFromCalibrationHC) return true;
  if (user.role === "Director" || user.role === "BOD") return true;
  if (isDirectorRoleOrGrouping(user)) return true;
  // Jika Groupings karyawan di-setup tidak memiliki modul appraisal sama sekali (uncheck semua modul),
  // maka tidak masuk dalam penilaian kinerja, monitoring, summary, maupun kalibrasi.
  if (user.groupings || user.company || user.position) {
    const allowed = resolveUserAllowedModules({
      id: "",
      name: "",
      employeeId: "",
      position: user.position ?? "",
      company: user.company ?? "",
      division: "",
      department: "",
      grade: "",
      role: user.role ?? "",
      groupings: user.groupings ?? "",
      status: "Active",
      lastLogin: "",
      email: "",
    });
    if (allowed.length === 0) return true;
  }
  return false;
}

export function isExcludedFromVerification(user?: { role?: string; groupings?: string; position?: string; company?: string } | null): boolean {
  if (!user) return false;
  if (user.role && getRoleMetadata(user.role).excludeFromVerification) return true;
  return isExcludedFromAppraisalCalibration(user);
}

export const DEFAULT_MANAGED_USERS: ManagedUser[] = [
  { id: "1", no: "1", regNo: "REG-001", name: "Administrator PA", employeeId: "ADMIN", position: "System Administrator", company: "PT RSUP (Industry)", division: "Staff Management", department: "Sumber Daya Manusia", bagian: "Pengembangan SDM", joinDate: "2020-01-01", telegramNo: "", grade: "Grade 6", role: "Administrator", groupings: "Ka./Wa.Ka.Bagian", status: "Active", lastLogin: "", email: "admin@sambugroup.com", regNoAp1: "", regNoAp2: "", isHrIcfValidator: true },
];

export function inferGroupingFromPosition(position: string): UserGrouping {
  const p = position.toLowerCase();
  if (/direktur|director/i.test(p)) {
    return "Direktur / Director";
  }
  if (/bod|gm|general manager|koordinator|divisi/i.test(p)) {
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
  if (user.role) {
    const perms = getRolePermissions(user.role);
    if (perms.approvals?.approve || perms.approvals?.view) {
      return true;
    }
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

export type HierarchyAuthorityLevel =
  | "admin"
  | "bod"
  | "director_group"
  | "gm_unit"
  | "hr_unit"
  | "division"
  | "department"
  | "bagian"
  | "seksi"
  | "operational";

const HIERARCHY_RANK: Record<HierarchyAuthorityLevel, number> = {
  admin: 100,
  bod: 95,
  director_group: 90,
  gm_unit: 80,
  hr_unit: 75,
  division: 70,
  department: 60,
  bagian: 50,
  seksi: 40,
  operational: 10,
};

export function resolveGroupingForCompanyAndPosition(
  company: string,
  position: string,
  explicitGrouping?: string,
): UserGrouping {
  const normalizeToUserGrouping = (val: string): UserGrouping | null => {
    const v = val.trim().toLowerCase();
    if (!v) return null;
    if (v === "direktur / director" || v === "direktur" || v === "director") {
      return "Direktur / Director";
    }
    const configuredGroups = loadAccessGroups();
    const exactGroup = configuredGroups.find((g) => g.toLowerCase() === v);
    if (exactGroup) return exactGroup;
    if (val.trim() === "Ka./Wa.Ka.Div ke atas" || /div|gm|bod/i.test(v)) return "Ka./Wa.Ka.Div ke atas";
    if (val.trim() === "Ka./Wa.Ka.Dept" || /dept|departemen/i.test(v)) return "Ka./Wa.Ka.Dept";
    if (val.trim() === "Ka./Wa.Ka.Bagian" || /bagian/i.test(v)) return "Ka./Wa.Ka.Bagian";
    if (val.trim() === "Ka./Wa.Ka.Seksi" || /seksi|shift/i.test(v)) return "Ka./Wa.Ka.Seksi";
    if (val.trim() === "Operasional" || /operasional|operational/i.test(v)) return "Operasional";
    return null;
  };

  // 1. Cek terlebih dahulu di tabel User Groupings milik Company Unit tersebut (pa_group_rules_by_unit_v1)
  try {
    const raw = localStorage.getItem(GROUP_RULES_BY_UNIT_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, ManagedGroupRule[]>;
      const unitRules = map[company];
      if (Array.isArray(unitRules)) {
        const matchedRule = unitRules.find(
          (r) => r.position.trim().toLowerCase() === position.trim().toLowerCase(),
        );
        if (matchedRule) {
          const fromRule = normalizeToUserGrouping(matchedRule.group);
          if (fromRule) return fromRule;
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Gunakan nilai eksplisit dari kolom Groupings (Excel / User Management) jika tersedia
  if (explicitGrouping) {
    const fromExplicit = normalizeToUserGrouping(explicitGrouping);
    if (fromExplicit) return fromExplicit;
  }

  return inferGroupingFromPosition(position);
}

export function resolveEffectiveUserGrouping(user: ManagedUser): UserGrouping {
  if (user.role === "Director" && (!user.groupings || user.groupings === "Ka./Wa.Ka.Div ke atas")) {
    return "Direktur / Director";
  }
  return resolveGroupingForCompanyAndPosition(user.company, user.position, user.groupings);
}

export function resolveUserAuthorityLevel(user: ManagedUser): HierarchyAuthorityLevel {
  if (isAdminOrHrIcfRole(user.role)) return "admin";
  if (user.role === "BOD") return "bod";
  if (user.role === "Director") return "director_group";
  if (user.role === "GM") return "gm_unit";
  if (user.role === "HR Unit") return "hr_unit";

  // Penentuan level kewenangan berjenjang murni dari Effective Grouping (bebas dari perbedaan nama posisi seperti 'Mandor' vs 'Kepala Bagian')
  const effectiveGrouping = resolveEffectiveUserGrouping(user);
  const configuredTier = getGroupAuthorityLevel(effectiveGrouping);
  if (configuredTier === "director_group" || effectiveGrouping === "Direktur / Director") {
    return "director_group";
  }
  if (configuredTier === "division" || configuredTier === "department" || configuredTier === "bagian" || configuredTier === "seksi" || configuredTier === "operational") {
    return configuredTier;
  }
  if (effectiveGrouping === "Ka./Wa.Ka.Div ke atas") return "division";
  if (effectiveGrouping === "Ka./Wa.Ka.Dept") return "department";
  if (effectiveGrouping === "Ka./Wa.Ka.Bagian") return "bagian";
  if (effectiveGrouping === "Ka./Wa.Ka.Seksi") return "seksi";
  return "operational";
}

function normOrgName(val?: string): string {
  return (val ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Kewenangan Akses Data Berjenjang (Bagian I Poin 4):
 * Menggabungkan:
 * 1. Rantai Approval (Reg No AP1 / Reg No AP2, langsung maupun transitif/bertingkat), DAN
 * 2. Hirarki Jabatan Struktural:
 *    - Direktur pada Group (mis. RSUP Group: PT RSUP (Industry), PT RSUP (Perkebunan), PT RSTM, PT GHS, ASD)
 *    - GM pada Unit Usahanya
 *    - Level Divisi pada seluruh posisi, bagian, dan departemen dalam Divisinya
 *    - Level Departemen pada seluruh posisi dan bagian dalam Departemennya
 *    - Level Bagian pada seluruh posisi dalam Bagiannya
 */
export function getAuthorizedSubordinates(user: ManagedUser, allUsers = loadManagedUsers()): ManagedUser[] {
  const level = resolveUserAuthorityLevel(user);
  if (level === "admin" || level === "bod") {
    return allUsers;
  }

  const myRank = HIERARCHY_RANK[level];
  const roleAllowedUnits = getRoleAllowedCompanyUnits(user.role);
  const directorGroupUnits = new Set(
    (roleAllowedUnits.length > 0
      ? [...roleAllowedUnits, ...(user.managedUnits ?? [])]
      : getGroupCompaniesForUnit(user.company, user.managedUnits)
    ).map(normOrgName),
  );

  // 1. Collect transitive AP1 / AP2 subordinate chain
  const transitiveSubIds = new Set<string>();
  const queue: ManagedUser[] = [user];
  const visited = new Set<string>([user.employeeId.toLowerCase()]);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const reg = (curr.regNo ?? "").trim().toLowerCase();
    const emp = curr.employeeId.trim().toLowerCase();
    const nm = curr.name.trim().toLowerCase();
    for (const cand of allUsers) {
      const candKey = cand.employeeId.toLowerCase();
      if (visited.has(candKey)) continue;
      const ap1 = (cand.regNoAp1 ?? "").trim().toLowerCase();
      const ap2 = (cand.regNoAp2 ?? "").trim().toLowerCase();
      const matched =
        (reg && (ap1 === reg || ap2 === reg)) ||
        (emp && (ap1 === emp || ap2 === emp)) ||
        (nm && (ap1 === nm || ap2 === nm));
      if (matched) {
        visited.add(candKey);
        transitiveSubIds.add(candKey);
        queue.push(cand);
      }
    }
  }

  // 2. Collect structural hierarchy scope
  const calInvolvedUnits =
    user.calibrationRoleByUnit && typeof user.calibrationRoleByUnit === "object"
      ? Object.entries(user.calibrationRoleByUnit)
          .filter(([, v]) => v === "approver" || v === "mengetahui")
          .map(([k]) => k)
      : [];
  const allowedUnits = new Set<string>(
    [user.company, ...roleAllowedUnits, ...calInvolvedUnits, ...(user.managedUnits ?? [])].map(normOrgName).filter(Boolean),
  );
  const allowedDivisions = new Set<string>(
    [user.division, ...(user.managedDivisions ?? [])].map(normOrgName).filter(Boolean),
  );
  const allowedDepartments = new Set<string>(
    [user.department, ...(user.managedDepartments ?? [])].map(normOrgName).filter(Boolean),
  );
  const allowedBagians = new Set<string>(
    [user.bagian ?? "", ...(user.managedBagians ?? [])].map(normOrgName).filter(Boolean),
  );

  return allUsers.filter((target) => {
    if (target.employeeId.toLowerCase() === user.employeeId.toLowerCase()) return true;
    if (transitiveSubIds.has(target.employeeId.toLowerCase())) return true;
    // Jika Role memiliki cakupan Unit Usaha yang diceklis di Access Management (mis. jabatan ganda Director + GM lintas group),
    // maka seluruh karyawan pada unit usaha yang diceklis tersebut dapat diakses
    if (roleAllowedUnits.length > 0 && roleAllowedUnits.some((u) => normOrgName(u) === normOrgName(target.company))) {
      return true;
    }

    const targetLevel = resolveUserAuthorityLevel(target);
    const targetRank = HIERARCHY_RANK[targetLevel];

    // 1. Level Direktur pada Group: melihat semua unit dalam Group-nya (RSUP Group atau Sambu Group), GM, Divisi, Departemen, Bagian, All Posisi
    if (level === "director_group") {
      return directorGroupUnits.has(normOrgName(target.company)) && targetRank <= myRank;
    }

    // 2. Level GM & HR Unit: melihat semua karyawan pada Unit Usahanya
    if (level === "gm_unit" || level === "hr_unit") {
      return allowedUnits.has(normOrgName(target.company)) && targetRank <= myRank;
    }

    // Pastikan dalam Company Unit yang sama untuk level Divisi ke bawah
    if (!allowedUnits.has(normOrgName(target.company))) return false;
    if (targetRank > myRank) return false;

    // 3. Level Divisi: melihat semua posisi, bagian, departemen dalam Divisinya
    if (level === "division") {
      return allowedDivisions.has(normOrgName(target.division));
    }

    // 4. Level Departemen: melihat semua posisi dan bagian dalam Departemennya
    if (level === "department") {
      const sameDiv = !user.division || allowedDivisions.has(normOrgName(target.division));
      return sameDiv && allowedDepartments.has(normOrgName(target.department));
    }

    // 5. Level Bagian / Seksi: melihat semua posisi dalam Bagiannya
    if (level === "bagian" || level === "seksi") {
      const sameDiv = !user.division || allowedDivisions.has(normOrgName(target.division));
      const sameDept = !user.department || allowedDepartments.has(normOrgName(target.department));
      if (allowedBagians.size > 0 && target.bagian) {
        return sameDiv && sameDept && allowedBagians.has(normOrgName(target.bagian));
      }
      return sameDiv && sameDept;
    }

    return false;
  });
}

/**
 * Mengembalikan daftar bawahan yang berada di dalam kewenangan approval (Reg No AP1 / Reg No AP2)
 * dari pengguna yang sedang login (tidak termasuk dirinya sendiri).
 */
export function getStrictSubordinateUsers(user = getActiveUser(), allUsers = loadManagedUsers()): ManagedUser[] {
  return getAuthorizedSubordinates(user, allUsers).filter(
    (u) => u.employeeId.toLowerCase() !== user.employeeId.toLowerCase(),
  );
}

export type DirectApprovalRelation = "ap1" | "ap2" | "checker" | "validator" | "view_only";

/**
 * Membedakan apakah pengguna yang login adalah Approver Langsung (Reg No AP1 / Reg No AP2 / Checker / Validator)
 * atau hanya memiliki Hak Lihat Berjenjang (View Scope berdasarkan hirarki Direktur/GM/Divisi/Departemen/Bagian).
 */
export function getDirectApprovalRoleForTarget(
  viewer: ManagedUser,
  targetEmployeeIdOrName: string,
  allUsers = loadManagedUsers(),
): DirectApprovalRelation {
  if (isAdminOrHrIcfRole(viewer.role) || viewer.isHrIcfValidator) {
    return "validator";
  }
  const q = targetEmployeeIdOrName.trim().toLowerCase().replace(/^emp-?0*/i, "");
  const target = allUsers.find((u) => {
    const uNum = u.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
    return (
      u.employeeId.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      u.name.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      (q && uNum === q)
    );
  });
  if (!target) return "ap1";

  const reg = (viewer.regNo ?? "").trim().toLowerCase();
  const emp = viewer.employeeId.trim().toLowerCase();
  const nm = viewer.name.trim().toLowerCase();
  const ap1 = (target.regNoAp1 ?? "").trim().toLowerCase();
  const ap2 = (target.regNoAp2 ?? "").trim().toLowerCase();

  if ((reg && ap1 === reg) || (emp && ap1 === emp) || (nm && ap1 === nm)) {
    return "ap1";
  }
  if ((reg && ap2 === reg) || (emp && ap2 === emp) || (nm && ap2 === nm)) {
    return "ap2";
  }
  if ((viewer.role === "HR Unit" || viewer.isHrUnitChecker) && viewer.company === target.company) {
    return "checker";
  }
  return "view_only";
}

export interface ScopedHierarchyFilterOptions {
  authorityLevel: HierarchyAuthorityLevel;
  authorityLabel: string;
  units: string[];
  divisions: string[];
  departments: string[];
  bagians: string[];
  positions: string[];
}

/**
 * Menghasilkan opsi filter bertingkat (Unit -> Divisi -> Departemen -> Bagian -> Posisi)
 * yang otomatis terkunci/terbatas sesuai kewenangan berjenjang pengguna yang sedang login.
 */
export function getScopedFilterOptionsForUser(
  user = getActiveUser(),
  allUsers = loadManagedUsers(),
): ScopedHierarchyFilterOptions {
  const level = resolveUserAuthorityLevel(user);
  const subs = getStrictSubordinateUsers(user, allUsers);
  const pool = subs.length > 0 ? subs : [user];

  const uniq = (arr: (string | undefined)[]) =>
    Array.from(new Set(arr.map((v) => (v ?? "").trim()).filter(Boolean))).sort();

  const groupName = getGroupNameForUnit(user.company);
  const groupUnitsCount = getGroupCompaniesForUnit(user.company, user.managedUnits).length;
  const LABEL_BY_LEVEL: Record<HierarchyAuthorityLevel, string> = {
    admin: "Administrator / HR ICF (Semua Unit Usaha)",
    bod: "Board of Directors (Semua Unit Group)",
    director_group: `Level Direktur Group (${groupName} — ${groupUnitsCount} Unit Usaha, GM, Divisi, Dept, Bagian & All Posisi)`,
    gm_unit: `Level GM Unit Usaha (${user.company})`,
    hr_unit: `HR Unit Usaha (${user.company})`,
    division: `Level Divisi (${user.division} — ${user.company})`,
    department: `Level Departemen (${user.department} · ${user.division})`,
    bagian: `Level Bagian (${user.bagian || user.department} · ${user.department})`,
    seksi: `Level Seksi (${user.bagian || user.department})`,
    operational: `Level Individu (${user.name})`,
  };

  return {
    authorityLevel: level,
    authorityLabel: LABEL_BY_LEVEL[level],
    units: uniq(pool.map((u) => u.company)),
    divisions: uniq(pool.map((u) => u.division)),
    departments: uniq(pool.map((u) => u.department)),
    bagians: uniq(pool.map((u) => u.bagian)),
    positions: uniq(pool.map((u) => u.position)),
  };
}
export function canUserAccessEmployeeData(
  viewer: ManagedUser,
  targetEmployeeIdOrName: string,
  allUsers = loadManagedUsers(),
): boolean {
  if (isAdminOrHrIcfRole(viewer.role) || viewer.role === "BOD") {
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
  const configuredGroups = loadAccessGroups();
  if (
    configuredGroups.some((g) => g.toLowerCase() === normalized.toLowerCase()) ||
    /^(direktur|director)$/i.test(normalized)
  ) {
    return getGroupAllowedModules(normalized);
  }
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

export function resolvePortalPathForRole(role: AppUserRole, _position = "", grouping = ""): "/hr" | "/bod" | "/supervisor" | "/employee" {
  if (role === "Administrator" || role === "HR Admin" || role === "HR ICF") {
    return "/hr";
  }
  if (role === "BOD" || role === "Director") {
    return "/bod";
  }
  if (
    role === "Supervisor" ||
    role === "GM" ||
    role === "HR Unit" ||
    (grouping && grouping !== "Operasional")
  ) {
    return "/supervisor";
  }
  if (role && role !== "Employee") {
    const perms = getRolePermissions(role);
    if (perms.setting?.view || perms.evidence?.view || perms.analytics?.view) {
      return "/hr";
    }
    if (perms.approvals_calibration?.view || perms.mgmt_interview_assessment?.view) {
      return "/bod";
    }
    if (perms.approvals?.view || perms.pa_monitoring?.view || perms.pa_summary?.view) {
      return "/supervisor";
    }
  }
  return "/employee";
}

export function resolveUserAllowedModules(user: ManagedUser): AppraisalModuleName[] {
  const effectiveGrouping = resolveEffectiveUserGrouping(user);
  const configuredGroups = loadAccessGroups();
  const isConfiguredInAccessMgmt = configuredGroups.some(
    (g) => g.toLowerCase() === effectiveGrouping.toLowerCase(),
  );
  try {
    const raw = localStorage.getItem(GROUP_RULES_BY_UNIT_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, ManagedGroupRule[]>;
      const unitRules = map[user.company];
      if (unitRules) {
        const matched = unitRules.find(
          (r) =>
            r.position.toLowerCase() === user.position.toLowerCase() ||
            r.group.toLowerCase() === effectiveGrouping.toLowerCase(),
        );
        if (matched && Array.isArray(matched.allowedModules)) {
          return matched.allowedModules;
        }
      }
    }
  } catch {
    // fallback to grouping defaults
  }
  if (isConfiguredInAccessMgmt) {
    return getGroupAllowedModules(effectiveGrouping);
  }
  if (user.role === "HR Unit") {
    return defaultAllowedModulesForGrouping(effectiveGrouping);
  }
  return defaultAllowedModulesForGrouping(effectiveGrouping);
}

export function getAllowedApprovalTypesForUser(
  user: ManagedUser,
  mode: "setting" | "checkin",
): string[] {
  const allCheckin = [
    "KPI",
    "SMART Goals",
    "Appraisal Form",
    "Managerial Skill",
    "Project",
    "RCA",
    "Inter-Department Feedback",
  ];
  const allSetting = [
    "KPI",
    "SMART Goals",
    "RCA",
  ];
  const baseList = mode === "setting" ? allSetting : allCheckin;

  // Administrator, HR ICF, dan BOD melihat seluruh modul approval
  if (isAdminOrHrIcfRole(user.role) || user.role === "BOD" || isDirectorRoleOrGrouping(user)) {
    return baseList;
  }

  // Jika sebuah Role disetup tidak memiliki akses ke PA Setting & PA Measurement sama sekali
  // namun diberi akses Approvals, jangan batasi tab Approvals dari PA Setting/Measurement pribadinya
  const rolePerms = getRolePermissions(user.role || "Employee");
  if (!rolePerms.pa_setting?.view && !rolePerms.pa_measurement?.view) {
    return baseList;
  }

  const effectiveGrouping = resolveEffectiveUserGrouping(user);
  if (user.role === "HR Unit") {
    if (effectiveGrouping === "Operasional") {
      return ["KPI", "SMART Goals", "RCA"];
    }
    const allowed = resolveUserAllowedModules(user);
    return baseList.filter((type) => {
      if (type === "KPI" || type === "SMART Goals" || type === "RCA") return true;
      if (type === "Appraisal Form") return allowed.includes("Appraisals Form");
      if (type === "Managerial Skill") return allowed.includes("Managerial Skill");
      if (type === "Project") return allowed.includes("Project Outside Job Scope");
      if (type === "Inter-Department Feedback") return allowed.includes("Inter-Departement Feedback");
      return false;
    });
  }

  // Untuk setiap Approver (Supervisor, GM, Director, dll.), sesuaikan modul yang muncul dengan setup Groupings masing-masing approver
  const allowed = resolveUserAllowedModules(user);
  return baseList.filter((type) => {
    if (type === "KPI" || type === "RCA") return allowed.includes("KPI (Setting/Measurement)");
    if (type === "SMART Goals") return allowed.includes("SMART Goals (Setting/Measurement)");
    if (type === "Appraisal Form") return allowed.includes("Appraisals Form");
    if (type === "Managerial Skill") return allowed.includes("Managerial Skill");
    if (type === "Project") return allowed.includes("Project Outside Job Scope");
    if (type === "Inter-Department Feedback") return allowed.includes("Inter-Departement Feedback");
    return false;
  });
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

  const redirectPath = resolvePortalPathForRole(updatedUser.role, updatedUser.position, resolveEffectiveUserGrouping(updatedUser));
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
    window.addEventListener(ACCESS_UPDATED_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("pa-auth-updated", onUpdate);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const activeUser = getActiveUser();
  const allUsers = loadManagedUsers();
  const allowedModules = resolveUserAllowedModules(activeUser);
  const isHrUnitLocked = activeUser.role === "HR Unit";
  const roleAllowedUnits = getRoleAllowedCompanyUnits(activeUser.role);
  const lockedUnits = isHrUnitLocked
    ? Array.from(new Set([activeUser.company, ...roleAllowedUnits, ...(activeUser.managedUnits ?? [])].filter(Boolean)))
    : roleAllowedUnits.length > 0
    ? Array.from(new Set([...roleAllowedUnits, ...(activeUser.managedUnits ?? [])].filter(Boolean)))
    : undefined;

  return {
    activeUser,
    allUsers,
    allowedModules,
    isHrUnitLocked,
    lockedUnits,
    portalPath: resolvePortalPathForRole(activeUser.role, activeUser.position, resolveEffectiveUserGrouping(activeUser)),
  };
}
export function getCalibrationRoleForUnit(
  user: ManagedUser | null | undefined,
  unitName: string,
): "approver" | "mengetahui" | "" {
  if (!user) return "";
  if (user.calibrationRoleByUnit && typeof user.calibrationRoleByUnit === "object") {
    const hasAnyKey = Object.keys(user.calibrationRoleByUnit).length > 0;
    if (hasAnyKey) {
      return user.calibrationRoleByUnit[unitName] ?? "";
    }
  }
  if (user.directorCalibrationRole === "") return "";
  if (user.role === "BOD" || isAdminOrHrIcfRole(user.role)) {
    return user.directorCalibrationRole || "approver";
  }
  if (isDirectorRoleOrGrouping(user)) {
    const groupUnits = getGroupCompaniesForUnit(user.company, user.managedUnits);
    if (groupUnits.includes(unitName)) {
      return user.directorCalibrationRole || "approver";
    }
    return "";
  }
  return user.directorCalibrationRole || "";
}

export function getCalibrationInvolvedUnits(
  user: ManagedUser | null | undefined,
  allUnitNames: string[],
): string[] {
  if (!user) return [];
  if (user.calibrationRoleByUnit && typeof user.calibrationRoleByUnit === "object") {
    const keys = Object.keys(user.calibrationRoleByUnit);
    if (keys.length > 0) {
      return allUnitNames.filter((u) => {
        const r = user.calibrationRoleByUnit?.[u];
        return r === "approver" || r === "mengetahui";
      });
    }
  }
  if (user.directorCalibrationRole === "") return [];
  const roleUnits = getRoleAllowedCompanyUnits(user.role);
  if (roleUnits.length > 0) {
    return Array.from(new Set([...roleUnits, ...(user.managedUnits ?? [])].filter(Boolean)));
  }
  if (isDirectorRoleOrGrouping(user)) {
    return getGroupCompaniesForUnit(user.company, user.managedUnits);
  }
  return allUnitNames;
}
