import { DELEGATION_EVENT, getDelegatedModuleFlagsForUser, resolveApproverIdentities } from "./delegationStore";
import { useEffect, useState } from "react";
import { notifyLoginToSupabase, safeGetLocalRaw, safeSetLocalJson, savePersistedState, syncToSupabase } from "../services/supabaseClient";
import {
  getMasterCompanyLocations,
  getMasterUnitsByGroupUidOrName,
  resolveMasterCompanyUnitName,
  resolveMasterGroupNameForUnit,
} from "../pages/hr/settings/masterCompanyStore";
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
  | "Departement"
  | "Division"
  | "vGM"
  | "Coordinator"
  | "GM"
  | "HR Unit"
  | "HR ICF"
  | "Director"
  | "DirectorNonOpr"
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
  | "GM / vGM"
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

export type CalibrationUnitRole = "approver" | "mengetahui" | "readonly" | "";

export const CALIBRATION_APPROVAL_ALLOWED_ROLES = [
  "Director",
  "DirectorNonOpr",
  "BOD",
  "Administrator",
  "HR ICF",
] as const;

/** Hanya role Director, DirectorNonOpr, BOD, Administrator, dan HR ICF yang memiliki akses halaman /approvals/calibration/* */
export function canRoleAccessCalibrationApproval(role?: string | null): boolean {
  const r = String(role ?? "").trim();
  if (r === "HR Admin") return true;
  return (CALIBRATION_APPROVAL_ALLOWED_ROLES as readonly string[]).includes(r);
}

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
  /** Daftar Company Unit yang diizinkan untuk fungsi Checker HR Unit (Lintas Unit Usaha) */
  checkerUnits?: string[];
  /** Setup oleh Administrator: menunjuk user khusus sebagai Checker KPI Business (KPI Group & KPI Unit) sebelum masuk ke Approver */
  isKpiBusinessChecker?: boolean;
  /** Cakupan yang di-allow untuk diperiksa oleh Checker Khusus KPI Business ("KPI Group" dan/atau nama Company Unit) */
  kpiBusinessCheckerUnits?: string[];
  /** Peran khusus pada Calibration Approval: "approver" | "mengetahui" | "readonly" | "" */
  directorCalibrationRole?: CalibrationUnitRole;
  /** Mapping Peran Approval Calibration (EOY) per Company Unit ("approver" | "mengetahui" | "readonly" | "") */
  calibrationRoleByUnit?: Record<string, CalibrationUnitRole>;
  /** Mapping Peran Approval Setting (SOY) per Company Unit ("approver" | "mengetahui" | "readonly" | "") */
  soyCalibrationRoleByUnit?: Record<string, CalibrationUnitRole>;
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

function makeDynamicArrayProxy<T>(getter: () => T[]): readonly T[] {
  return new Proxy([] as T[], {
    get(_target, prop) {
      const cur = getter();
      if (prop === Symbol.iterator) return cur[Symbol.iterator].bind(cur);
      if (prop === "length") return cur.length;
      const val = Reflect.get(cur, prop);
      return typeof val === "function" ? val.bind(cur) : val;
    },
    ownKeys() {
      return Reflect.ownKeys(getter());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(getter(), prop);
    },
  });
}

export const COMPANY_UNIT_LOCATIONS: ReadonlyArray<{
  code: string;
  unitId: string;
  company: string;
  fullName: string;
  companyGroup?: string;
  idGroup?: string;
  abbGroup?: string;
}> = makeDynamicArrayProxy(() => getMasterCompanyLocations());

export const RSUP_GROUP_COMPANIES: readonly string[] = makeDynamicArrayProxy(() => {
  const dynamic = getMasterUnitsByGroupUidOrName("group-rsup");
  return dynamic.length > 0
    ? dynamic
    : ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT RSTM", "PT GHS", "PT RSUP ASD"];
});

/** Normalisasi nama Unit Usaha secara dinamis mengacu pada Master Company (/settings/master/company). */
export function canonicalizeCompanyUnitName(raw?: string | null): string {
  return resolveMasterCompanyUnitName(raw);
}

/**
 * Aturan Approver 1 & Approver 2 per karyawan (berlaku pada Upload Excel maupun Add/Edit User):
 * - Jika salah satu dari Reg No AP1 atau Reg No AP2 kosong, maka field yang memiliki Reg No
 *   otomatis menjadi Approver 1 sekaligus Approver 2.
 * - Jika keduanya kosong, berarti karyawan belum memiliki approver (`hasApprover: false`).
 */
export function normalizeApproverPair(
  rawAp1?: string | null,
  rawAp2?: string | null,
): { regNoAp1: string; regNoAp2: string; hasApprover: boolean } {
  const clean = (val?: string | null): string => {
    const s = String(val ?? "").trim();
    if (!s) return "";
    const u = s.toUpperCase();
    if (u === "-" || u === "—" || u === "N/A" || u === "NA" || u === "NULL" || u === "UNDEFINED") {
      return "";
    }
    return s;
  };
  const a1 = clean(rawAp1);
  const a2 = clean(rawAp2);
  if (a1 && !a2) return { regNoAp1: a1, regNoAp2: a1, hasApprover: true };
  if (!a1 && a2) return { regNoAp1: a2, regNoAp2: a2, hasApprover: true };
  if (a1 && a2) return { regNoAp1: a1, regNoAp2: a2, hasApprover: true };
  return { regNoAp1: "", regNoAp2: "", hasApprover: false };
}

function normalizeManagedUserUnits(user: ManagedUser): ManagedUser {
  const company = canonicalizeCompanyUnitName(user.company);
  const { regNoAp1, regNoAp2 } = normalizeApproverPair(user.regNoAp1, user.regNoAp2);
  const managedUnits = Array.isArray(user.managedUnits)
    ? Array.from(new Set(user.managedUnits.map((x) => canonicalizeCompanyUnitName(x)).filter(Boolean)))
    : user.managedUnits;
  const checkerUnits = Array.isArray(user.checkerUnits)
    ? Array.from(new Set(user.checkerUnits.map((x) => canonicalizeCompanyUnitName(x)).filter(Boolean)))
    : user.checkerUnits;
  const kpiBusinessCheckerUnits = Array.isArray(user.kpiBusinessCheckerUnits)
    ? Array.from(
        new Set(
          user.kpiBusinessCheckerUnits
            .map((x) => (String(x ?? "").trim() === "KPI Group" ? "KPI Group" : canonicalizeCompanyUnitName(x)))
            .filter(Boolean),
        ),
      )
    : user.kpiBusinessCheckerUnits;
  let calibrationRoleByUnit = user.calibrationRoleByUnit;
  if (calibrationRoleByUnit && typeof calibrationRoleByUnit === "object") {
    const nextCal: Record<string, CalibrationUnitRole> = {};
    for (const [k, v] of Object.entries(calibrationRoleByUnit)) {
      if (v === "approver" || v === "mengetahui" || v === "readonly" || v === "") {
        nextCal[canonicalizeCompanyUnitName(k)] = v;
      }
    }
    calibrationRoleByUnit = nextCal;
  }
  let soyCalibrationRoleByUnit = user.soyCalibrationRoleByUnit;
  if (soyCalibrationRoleByUnit && typeof soyCalibrationRoleByUnit === "object") {
    const nextSoyCal: Record<string, CalibrationUnitRole> = {};
    for (const [k, v] of Object.entries(soyCalibrationRoleByUnit)) {
      if (v === "approver" || v === "mengetahui" || v === "readonly" || v === "") {
        nextSoyCal[canonicalizeCompanyUnitName(k)] = v;
      }
    }
    soyCalibrationRoleByUnit = nextSoyCal;
  }
  return {
    ...user,
    company,
    regNoAp1,
    regNoAp2,
    managedUnits,
    checkerUnits,
    kpiBusinessCheckerUnits,
    calibrationRoleByUnit,
    soyCalibrationRoleByUnit,
  };
}

export const KPI_BUSINESS_GROUP_SCOPE_TOKEN = "KPI Group";

/** Mengecek apakah user di-setup sebagai Checker Khusus KPI Business (KPI Group & KPI Unit). */
export function canUserAccessKpiBusinessChecker(user?: ManagedUser | null): boolean {
  return Boolean(user && user.isKpiBusinessChecker);
}

/** Mengecek apakah Checker Khusus KPI Business berwenang memeriksa `KPI Group` atau `KPI Unit` tertentu. */
export function canKpiBusinessCheckerHandleScope(
  viewer?: ManagedUser | null,
  scopeType: "group" | "unit" = "group",
  companyUnit?: string,
): boolean {
  if (!viewer || !viewer.isKpiBusinessChecker) return false;
  const scopes = (viewer.kpiBusinessCheckerUnits ?? []).filter(Boolean);
  // Jika daftar cakupan kosong, default di-allow untuk seluruh KPI Group & KPI Unit
  if (scopes.length === 0) return true;
  if (scopeType === "group") {
    return scopes.includes(KPI_BUSINESS_GROUP_SCOPE_TOKEN);
  }
  if (!companyUnit) {
    return scopes.some((s) => s !== KPI_BUSINESS_GROUP_SCOPE_TOKEN);
  }
  return scopes.some((s) => s !== KPI_BUSINESS_GROUP_SCOPE_TOKEN && isSameCompanyUnit(s, companyUnit));
}

/** Mengumpulkan seluruh user aktif yang ditunjuk sebagai Checker Khusus KPI Business untuk scope tsb. */
export function findAllKpiBusinessCheckerUsers(
  scopeType: "group" | "unit",
  companyUnit?: string,
  allUsers = loadManagedUsers(),
): ManagedUser[] {
  return allUsers.filter(
    (u) => u.status === "Active" && canKpiBusinessCheckerHandleScope(u, scopeType, companyUnit),
  );
}

/**
 * Mengembalikan seluruh Company Unit yang diizinkan untuk fungsi HR Checker (`HR Unit` / `isHrUnitChecker`),
 * mendukung operasional Lintas Unit Usaha sesuai konfigurasi di User Management & Access Management.
 */
export function getEffectiveCheckerUnits(user: ManagedUser): string[] {
  if (!(user.role === "HR Unit" || Boolean(user.isHrUnitChecker))) return [];
  const explicitChecker = (user.checkerUnits ?? [])
    .map((u) => canonicalizeCompanyUnitName(u))
    .filter(Boolean);
  const extraManaged = (user.managedUnits ?? [])
    .map((u) => canonicalizeCompanyUnitName(u))
    .filter(Boolean);
  const roleUnits = getRoleAllowedCompanyUnits(user.role)
    .map((u) => canonicalizeCompanyUnitName(u))
    .filter(Boolean);
  if (explicitChecker.length > 0) {
    return Array.from(new Set([...explicitChecker, ...extraManaged, ...roleUnits]));
  }
  const own = canonicalizeCompanyUnitName(user.company);
  return Array.from(new Set([own, ...extraManaged, ...roleUnits].filter(Boolean)));
}

/** Mengecek apakah `viewer` berwenang sebagai HR Checker untuk `targetCompany` (termasuk Lintas Unit Usaha). */
export function canCheckerHandleCompanyUnit(viewer: ManagedUser, targetCompany: string): boolean {
  if (!(viewer.role === "HR Unit" || Boolean(viewer.isHrUnitChecker))) return false;
  const allowed = getEffectiveCheckerUnits(viewer);
  return allowed.some((u) => isSameCompanyUnit(targetCompany, u));
}

export const SAMBU_GROUP_COMPANIES: readonly string[] = makeDynamicArrayProxy(() => {
  const dynamic = getMasterUnitsByGroupUidOrName("group-sambu");
  return dynamic.length > 0
    ? dynamic
    : ["PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)"];
});

export function getGroupNameForUnit(company: string): string {
  return resolveMasterGroupNameForUnit(company);
}

export function getRoleAllowedCompanyUnits(role?: string): string[] {
  if (!role) return [];
  const meta = getRoleMetadata(role);
  return Array.isArray(meta.allowedCompanyUnits)
    ? Array.from(new Set(meta.allowedCompanyUnits.map((u) => canonicalizeCompanyUnitName(u)).filter(Boolean)))
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
  const dynamicUnits = getMasterUnitsByGroupUidOrName(groupName);
  const base =
    dynamicUnits.length > 0
      ? dynamicUnits
      : groupName.toLowerCase().includes("sambu")
      ? [...SAMBU_GROUP_COMPANIES]
      : [...RSUP_GROUP_COMPANIES];
  return Array.from(new Set([...base, ...(extraUnits ?? [])].filter(Boolean)));
}

/** Format tanggal waktu login ke format standar DD/MM/YYYY HH:MM. */
export function formatLastLoginDDMMYYYY(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "-" || s === "—") return "—";
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(s)) return s;
  const isoCandidate = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s) ? s.replace(" ", "T") : s;
  const d = new Date(isoCandidate);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }
  return s;
}

function normGroupKey(val?: string | null): string {
  return String(val ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

export function isDirectorRoleOrGrouping(user?: { role?: string; groupings?: string; position?: string } | null): boolean {
  if (!user) return false;
  const g = normGroupKey(user.groupings);
  if (g) {
    const tier = getGroupAuthorityLevel(user.groupings ?? "");
    if (tier === "director_group") return true;
    if (g === "gm/vgm" || g === "level gm/vgm") return false;
  }
  if (g === "direktur/director" || g === "director" || g === "direktur") return true;
  if (user.role === "Director" || user.role === "DirectorNonOpr") return true;
  return false;
}

let _authComputedEpoch = 1;
let _cachedGroupRulesRaw: string | null | undefined = undefined;
let _cachedGroupRulesMap: Record<string, ManagedGroupRule[]> = {};
let _cachedManagedUsersRaw: string | null | undefined = undefined;
let _cachedManagedUsersActiveRaw: string | null | undefined = undefined;
let _cachedManagedUsersList: ManagedUser[] | null = null;
let _cachedUsersByEmpUpper = new Map<string, ManagedUser>();
let _cachedActiveUserSig: string | undefined = undefined;
let _cachedActiveUserObj: ManagedUser | null = null;

let _groupingMemoEpoch = 0;
let _groupingMemoByUser = new WeakMap<ManagedUser, UserGrouping>();
let _authorityMemoEpoch = 0;
let _authorityMemoByUser = new WeakMap<ManagedUser, HierarchyAuthorityLevel>();
let _allowedModsMemoEpoch = 0;
let _allowedModsMemoByUser = new WeakMap<ManagedUser, AppraisalModuleName[]>();
let _excludedCalMemoEpoch = 0;
let _excludedCalMemoByKey = new Map<string, boolean>();
let _authorizedSubsMemoEpoch = 0;
let _authorizedSubsMemo = new WeakMap<ManagedUser[], Map<string, ManagedUser[]>>();

interface ApproverAdjacencyIndex {
  byReg: Map<string, ManagedUser[]>;
  byEmp: Map<string, ManagedUser[]>;
  byName: Map<string, ManagedUser[]>;
  byEmpNum: Map<string, ManagedUser[]>;
}
const _approverAdjByUsersRef = new WeakMap<ManagedUser[], ApproverAdjacencyIndex>();

function bumpAuthComputedEpoch(): void {
  _authComputedEpoch++;
  _cachedActiveUserSig = undefined;
}

if (typeof window !== "undefined") {
  window.addEventListener("pa-auth-updated", bumpAuthComputedEpoch);
  window.addEventListener(ACCESS_UPDATED_EVENT, bumpAuthComputedEpoch);
  window.addEventListener(DELEGATION_EVENT, bumpAuthComputedEpoch);
  window.addEventListener("pa-db-hydrated", bumpAuthComputedEpoch);
  window.addEventListener("pa-employees-imported", bumpAuthComputedEpoch);
  window.addEventListener("storage", bumpAuthComputedEpoch);
}

function getCachedGroupRulesMap(): Record<string, ManagedGroupRule[]> {
  const raw = safeGetLocalRaw(GROUP_RULES_BY_UNIT_KEY);
  if (_cachedGroupRulesRaw === raw) {
    return _cachedGroupRulesMap;
  }
  let parsed: Record<string, ManagedGroupRule[]> = {};
  if (raw) {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === "object" && !Array.isArray(p)) {
        parsed = p as Record<string, ManagedGroupRule[]>;
      }
    } catch {
      parsed = {};
    }
  }
  _cachedGroupRulesRaw = raw;
  _cachedGroupRulesMap = parsed;
  _authComputedEpoch++;
  return parsed;
}

function getApproverAdjacencyForUsers(allUsers: ManagedUser[]): ApproverAdjacencyIndex {
  const cached = _approverAdjByUsersRef.get(allUsers);
  if (cached) return cached;
  const byReg = new Map<string, ManagedUser[]>();
  const byEmp = new Map<string, ManagedUser[]>();
  const byName = new Map<string, ManagedUser[]>();
  const byEmpNum = new Map<string, ManagedUser[]>();
  const pushIdx = (map: Map<string, ManagedUser[]>, key: string, u: ManagedUser) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(u);
    else map.set(key, [u]);
  };
  for (const cand of allUsers) {
    const ap1 = (cand.regNoAp1 ?? "").trim().toLowerCase();
    const ap2 = (cand.regNoAp2 ?? "").trim().toLowerCase();
    for (const ap of [ap1, ap2]) {
      if (!ap) continue;
      pushIdx(byReg, ap, cand);
      pushIdx(byEmp, ap, cand);
      pushIdx(byName, ap, cand);
      if (/^(?:emp-?|e)\d+$/i.test(ap)) {
        pushIdx(byEmpNum, normEmpNum(ap), cand);
      }
    }
  }
  const built: ApproverAdjacencyIndex = { byReg, byEmp, byName, byEmpNum };
  _approverAdjByUsersRef.set(allUsers, built);
  return built;
}

export function isExcludedFromAppraisalCalibration(user?: { role?: string; groupings?: string; position?: string; company?: string } | null): boolean {
  if (!user) return false;
  getCachedGroupRulesMap();
  if (_excludedCalMemoEpoch !== _authComputedEpoch) {
    _excludedCalMemoEpoch = _authComputedEpoch;
    _excludedCalMemoByKey = new Map();
  }
  const cacheKey = `${user.role ?? ""}|${user.groupings ?? ""}|${user.company ?? ""}|${user.position ?? ""}`;
  const hit = _excludedCalMemoByKey.get(cacheKey);
  if (hit !== undefined) return hit;

  let result = false;
  if (user.role && getRoleMetadata(user.role).excludeFromCalibrationHC) result = true;
  else if (user.role === "Director" || user.role === "DirectorNonOpr" || user.role === "BOD") result = true;
  else if (isDirectorRoleOrGrouping(user)) result = true;
  else if (user.groupings || user.company || user.position) {
    // Jika Groupings karyawan di-setup tidak memiliki modul appraisal sama sekali (uncheck semua modul),
    // maka tidak masuk dalam penilaian kinerja, monitoring, summary, maupun kalibrasi.
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
    if (allowed.length === 0) result = true;
  }
  _excludedCalMemoByKey.set(cacheKey, result);
  return result;
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
  if (/\bv?gm\b|general manager/i.test(p)) {
    return "GM / vGM";
  }
  if (/bod|koordinator|divisi/i.test(p)) {
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

/**
 * DEMO: Data contoh (sample) KPI & SMART Goals hanya ditampilkan untuk Role Administrator.
 * Karyawan dengan role lain yang belum pernah bertransaksi melihat format tabel dengan data kosong.
 */
export function usesDemoSampleData(user?: { role?: AppUserRole } | null): boolean {
  return String(user?.role ?? "") === "Administrator";
}

export function isAdminOrHrIcfRole(role: AppUserRole): boolean {
  return role === "Administrator" || role === "HR ICF" || role === "HR Admin";
}

export function isUserApprover(user: ManagedUser, allUsers = loadManagedUsers()): boolean {
  if (user.isKpiBusinessChecker) return true;
  if (
    isAdminOrHrIcfRole(user.role) ||
    user.role === "BOD" ||
    user.role === "Director" ||
    user.role === "DirectorNonOpr" ||
    user.role === "GM" ||
    user.role === "vGM" ||
    user.role === "Coordinator" ||
    user.role === "Division" ||
    user.role === "Departement" ||
    user.role === "HR Unit" ||
    user.role === "Supervisor"
  ) {
    return true;
  }
  if (user.role) {
    const perms = getRolePermissions(user.role);
    if (perms.approvals?.approve || perms.approvals?.view) {
      return true;
    }
  }
  const grpTier = getGroupAuthorityLevel(resolveEffectiveUserGrouping(user));
  if (grpTier === "director_group" || grpTier === "gm_unit" || grpTier === "division" || grpTier === "department" || grpTier === "bagian") {
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

export type HierarchyAuthorityLevel =
  | "admin"
  | "bod"
  | "director_group"
  | "gm_unit"
  | "vgm_unit"
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
  vgm_unit: 78,
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
    const v = normGroupKey(val);
    if (!v) return null;
    if (v === "direktur/director" || v === "direktur" || v === "director") {
      return "Direktur / Director";
    }
    if (v === "gm/vgm" || v === "level gm/vgm") {
      const configuredGroups = loadAccessGroups();
      return configuredGroups.find((g) => normGroupKey(g) === "gm/vgm") ?? "GM / vGM";
    }
    const configuredGroups = loadAccessGroups();
    const exactGroup = configuredGroups.find((g) => normGroupKey(g) === v);
    if (exactGroup) return exactGroup;
    if (val.trim() === "Ka./Wa.Ka.Div ke atas" || /div|bod/i.test(v)) return "Ka./Wa.Ka.Div ke atas";
    if (val.trim() === "Ka./Wa.Ka.Dept" || /dept|departemen/i.test(v)) return "Ka./Wa.Ka.Dept";
    if (val.trim() === "Ka./Wa.Ka.Bagian" || /bagian/i.test(v)) return "Ka./Wa.Ka.Bagian";
    if (val.trim() === "Ka./Wa.Ka.Seksi" || /seksi|shift/i.test(v)) return "Ka./Wa.Ka.Seksi";
    if (val.trim() === "Operasional" || /operasional|operational/i.test(v)) return "Operasional";
    return null;
  };

  // 1. Jika user memiliki Groupings eksplisit yang di-setup (mis. "GM / vGM" atau custom group di Access Management),
  //    utamakan Groupings eksplisit tersebut agar tidak tertimpa aturan posisi umum.
  if (explicitGrouping && explicitGrouping.trim() !== "") {
    const fromExplicit = normalizeToUserGrouping(explicitGrouping);
    if (fromExplicit && normGroupKey(fromExplicit) !== "operasional") {
      return fromExplicit;
    }
  }

  // 1. Cek terlebih dahulu di tabel User Groupings milik Company Unit tersebut (pa_group_rules_by_unit_v1)
  try {
    const map = getCachedGroupRulesMap();
    const unitRules = map[company];
    if (Array.isArray(unitRules)) {
      const posLower = position.trim().toLowerCase();
      const matchedRule = unitRules.find(
        (r) => r.position.trim().toLowerCase() === posLower,
      );
      if (matchedRule) {
        const fromRule = normalizeToUserGrouping(matchedRule.group);
        if (fromRule) return fromRule;
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
  getCachedGroupRulesMap();
  if (_groupingMemoEpoch !== _authComputedEpoch) {
    _groupingMemoEpoch = _authComputedEpoch;
    _groupingMemoByUser = new WeakMap();
  }
  const cached = _groupingMemoByUser.get(user);
  if (cached !== undefined) return cached;

  let resolved: UserGrouping;
  if (user.role === "Director" && (!user.groupings || user.groupings === "Ka./Wa.Ka.Div ke atas")) {
    resolved = "Direktur / Director";
  } else {
    resolved = resolveGroupingForCompanyAndPosition(user.company, user.position, user.groupings);
  }
  _groupingMemoByUser.set(user, resolved);
  return resolved;
}

export function resolveUserAuthorityLevel(user: ManagedUser): HierarchyAuthorityLevel {
  if (isAdminOrHrIcfRole(user.role)) return "admin";
  getCachedGroupRulesMap();
  if (_authorityMemoEpoch !== _authComputedEpoch) {
    _authorityMemoEpoch = _authComputedEpoch;
    _authorityMemoByUser = new WeakMap();
  }
  const cached = _authorityMemoByUser.get(user);
  if (cached !== undefined) return cached;

  // Penentuan level kewenangan berjenjang murni dari Effective Grouping (bebas dari perbedaan nama posisi seperti 'Mandor' vs 'Kepala Bagian')
  const effectiveGrouping = resolveEffectiveUserGrouping(user);
  const configuredTier = getGroupAuthorityLevel(effectiveGrouping);
  const effGroupNorm = normGroupKey(effectiveGrouping);
  const hasExplicitGrouping = Boolean((user.groupings ?? "").trim());

  // Bila karyawan secara eksplisit diberi Groupings "GM / vGM" (atau custom grouping di /settings/access-management),
  // ikuti 100% Level Kewenangan Berjenjang (Data Visibility Scope) yang di-setup pada Group tersebut.
  const isLegacyBuiltinGrouping =
    effGroupNorm === "operasional" ||
    effGroupNorm === "ka./wa.ka.seksi" ||
    effGroupNorm === "ka./wa.ka.bagian" ||
    effGroupNorm === "ka./wa.ka.dept" ||
    effGroupNorm === "ka./wa.ka.div ke atas";

  if (hasExplicitGrouping && !isLegacyBuiltinGrouping) {
    if (configuredTier === "director_group") {
      _authorityMemoByUser.set(user, "director_group");
      return "director_group";
    }
    if (configuredTier === "gm_unit") {
      const lv = user.role === "vGM" || user.role === "Coordinator" ? "vgm_unit" : "gm_unit";
      _authorityMemoByUser.set(user, lv);
      return lv;
    }
    if (
      configuredTier === "division" ||
      configuredTier === "department" ||
      configuredTier === "bagian" ||
      configuredTier === "seksi" ||
      configuredTier === "operational"
    ) {
      _authorityMemoByUser.set(user, configuredTier);
      return configuredTier;
    }
  }

  if (user.role === "BOD") {
    _authorityMemoByUser.set(user, "bod");
    return "bod";
  }

  let roleLevel: HierarchyAuthorityLevel = "operational";
  if (user.role === "Director" || user.role === "DirectorNonOpr") roleLevel = "director_group";
  else if (user.role === "GM") roleLevel = "gm_unit";
  else if (user.role === "vGM" || user.role === "Coordinator") roleLevel = "vgm_unit";
  else if (user.role === "HR Unit") roleLevel = "hr_unit";
  else if (user.role === "Division") roleLevel = "division";
  else if (user.role === "Departement") roleLevel = "department";

  let groupLevel: HierarchyAuthorityLevel = "operational";
  if (configuredTier === "director_group" || effectiveGrouping === "Direktur / Director") {
    groupLevel = "director_group";
  } else if (configuredTier === "gm_unit") {
    groupLevel = user.role === "vGM" || user.role === "Coordinator" ? "vgm_unit" : "gm_unit";
  } else if (
    configuredTier === "division" ||
    configuredTier === "department" ||
    configuredTier === "bagian" ||
    configuredTier === "seksi" ||
    configuredTier === "operational"
  ) {
    groupLevel = configuredTier;
  } else if (effectiveGrouping === "Ka./Wa.Ka.Div ke atas") {
    groupLevel = "division";
  } else if (effectiveGrouping === "Ka./Wa.Ka.Dept") {
    groupLevel = "department";
  } else if (effectiveGrouping === "Ka./Wa.Ka.Bagian") {
    groupLevel = "bagian";
  } else if (effectiveGrouping === "Ka./Wa.Ka.Seksi") {
    groupLevel = "seksi";
  }

  const finalLevel = HIERARCHY_RANK[groupLevel] > HIERARCHY_RANK[roleLevel] ? groupLevel : roleLevel;
  _authorityMemoByUser.set(user, finalLevel);
  return finalLevel;
}

/**
 * Hanya karyawan dengan grouping Ka./Wa.Ka.Bagian ke atas yang boleh memberi maupun menerima delegasi
 * (groupings Operasional & Ka./Wa.Ka.Seksi dikecualikan).
 */
export function isUserEligibleForDelegation(user: ManagedUser): boolean {
  if (
    isAdminOrHrIcfRole(user.role) ||
    user.role === "BOD" ||
    user.role === "Director" ||
    user.role === "DirectorNonOpr" ||
    user.role === "GM" ||
    user.role === "vGM" ||
    user.role === "Coordinator"
  ) {
    return true;
  }
  const grp = String(resolveEffectiveUserGrouping(user) ?? "").trim();
  if (!grp || grp === "Operasional" || grp === "Ka./Wa.Ka.Seksi") {
    return false;
  }
  const level = resolveUserAuthorityLevel(user);
  return level !== "operational" && level !== "seksi";
}

/**
 * Secara default hanya groupings Ka./Wa.Ka.Div ke atas yang diizinkan mengakses /approvals/delegation,
 * kecuali role Administrator & HR ICF atau role lain yang secara eksplisit diberi akses di Access Management.
 */
export function canUserAccessApprovalsDelegation(
  user: ManagedUser,
  hasExplicitRoleMenuView?: boolean,
): boolean {
  if (isAdminOrHrIcfRole(user.role)) return true;
  if (hasExplicitRoleMenuView) return true;
  const grp = String(resolveEffectiveUserGrouping(user) ?? "").trim();
  if (grp === "Ka./Wa.Ka.Div ke atas" || grp === "Direktur / Director") {
    return true;
  }
  const level = resolveUserAuthorityLevel(user);
  return level === "division" || level === "vgm_unit" || level === "gm_unit" || level === "director_group" || level === "bod";
}

function normOrgName(val?: string): string {
  return (val ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normEmpNum(val?: string): string {
  const s = (val ?? "").trim().toLowerCase();
  if (!s) return "";
  return s.replace(/^(?:emp-?|e)0*/i, "");
}

/**
 * Mengumpulkan seluruh ID karyawan (lowercase) yang berada dalam rantai Approver 1 / Approver 2
 * (baik langsung maupun bertingkat/transitif, termasuk delegasi approval aktif) dari user yang login,
 * tanpa dibatasi Unit Usaha, Divisi, Departemen, Bagian, atau Jabatan.
 */
export function getTransitiveApproverSubordinateIds(
  user: ManagedUser,
  allUsers = loadManagedUsers(),
): Set<string> {
  const transitiveSubIds = new Set<string>();
  const kpiIdentities = resolveApproverIdentities(user, "KPI", undefined, allUsers);
  const sgIdentities = resolveApproverIdentities(user, "SMART Goals", undefined, allUsers);
  const seenSeed = new Set<string>();
  const seedIdentities = [...kpiIdentities, ...sgIdentities].filter((u) => {
    const k = u.employeeId.toLowerCase();
    if (seenSeed.has(k)) return false;
    seenSeed.add(k);
    return true;
  });
  const queue: ManagedUser[] = seedIdentities.length > 0 ? [...seedIdentities] : [user];
  const visited = new Set<string>(queue.map((u) => u.employeeId.toLowerCase()));
  const adj = getApproverAdjacencyForUsers(allUsers);
  let head = 0;

  while (head < queue.length) {
    const curr = queue[head++]!;
    const reg = (curr.regNo ?? "").trim().toLowerCase();
    const emp = curr.employeeId.trim().toLowerCase();
    const empNum = normEmpNum(curr.employeeId);
    const nm = curr.name.trim().toLowerCase();
    const bucketList = [
      reg ? adj.byReg.get(reg) : undefined,
      emp ? adj.byEmp.get(emp) : undefined,
      nm ? adj.byName.get(nm) : undefined,
      empNum ? adj.byEmpNum.get(empNum) : undefined,
    ];
    for (const bucket of bucketList) {
      if (!bucket) continue;
      for (const cand of bucket) {
        const candKey = cand.employeeId.toLowerCase();
        if (visited.has(candKey)) continue;
        visited.add(candKey);
        transitiveSubIds.add(candKey);
        queue.push(cand);
      }
    }
  }
  transitiveSubIds.delete(user.employeeId.toLowerCase());
  return transitiveSubIds;
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
  if (_authorizedSubsMemoEpoch !== _authComputedEpoch) {
    _authorizedSubsMemoEpoch = _authComputedEpoch;
    _authorizedSubsMemo = new WeakMap();
  }
  let perUsersMap = _authorizedSubsMemo.get(allUsers);
  if (!perUsersMap) {
    perUsersMap = new Map();
    _authorizedSubsMemo.set(allUsers, perUsersMap);
  }
  const userMemoKey = `${user.employeeId.toLowerCase()}|${user.role}|${user.groupings ?? ""}|${user.company}|${user.division}|${user.department}|${user.bagian ?? ""}|${(user.managedUnits ?? []).join(",")}|${(user.checkerUnits ?? []).join(",")}`;
  const cachedSubs = perUsersMap.get(userMemoKey);
  if (cachedSubs) return cachedSubs;

  const myRank = HIERARCHY_RANK[level];
  const roleAllowedUnits = getRoleAllowedCompanyUnits(user.role);
  const directorGroupUnits = new Set(
    (roleAllowedUnits.length > 0
      ? [...roleAllowedUnits, ...(user.managedUnits ?? [])]
      : getGroupCompaniesForUnit(user.company, user.managedUnits)
    ).map(normOrgName),
  );

  // 1. Collect transitive AP1 / AP2 subordinate chain
  const transitiveSubIds = getTransitiveApproverSubordinateIds(user, allUsers);

  // 2. Collect structural hierarchy scope
  const calInvolvedUnits =
    isDirectorRoleOrGrouping(user) &&
    user.calibrationRoleByUnit &&
    typeof user.calibrationRoleByUnit === "object"
      ? Object.entries(user.calibrationRoleByUnit)
          .filter(([, v]) => v === "approver" || v === "mengetahui" || v === "readonly")
          .map(([k]) => k)
      : [];
  const checkedUnits = (user.managedUnits ?? []).map(normOrgName).filter(Boolean);
  const checkedDivs = (user.managedDivisions ?? []).map(normOrgName).filter(Boolean);
  const checkedDepts = (user.managedDepartments ?? []).map(normOrgName).filter(Boolean);
  const checkedBagians = (user.managedBagians ?? []).map(normOrgName).filter(Boolean);
  const hasMultiScope =
    checkedUnits.length > 0 ||
    checkedDivs.length > 0 ||
    checkedDepts.length > 0 ||
    checkedBagians.length > 0;
  const checkedUnitSet = new Set<string>(checkedUnits);
  const checkedDivSet = new Set<string>(checkedDivs);
  const checkedDeptSet = new Set<string>(checkedDepts);
  const checkedBagianSet = new Set<string>(checkedBagians);

  const isGroupOrGlobalTier = level === "director_group";
  const allowedUnits = new Set<string>(
    [
      user.company,
      ...(isGroupOrGlobalTier ? roleAllowedUnits : []),
      ...(isGroupOrGlobalTier ? calInvolvedUnits : []),
      ...(user.managedUnits ?? []),
      ...getEffectiveCheckerUnits(user),
    ]
      .map(normOrgName)
      .filter(Boolean),
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

  // 0. Semua role kecuali Administrator & HR ICF tidak boleh melihat data/history/summary approver-nya (AP1 & AP2)
  const myAp1 = (user.regNoAp1 ?? "").trim().toLowerCase();
  const myAp2 = (user.regNoAp2 ?? "").trim().toLowerCase();
  const isMyApprover = (target: ManagedUser): boolean => {
    if (target.employeeId.toLowerCase() === user.employeeId.toLowerCase()) return false;
    const tReg = (target.regNo ?? "").trim().toLowerCase();
    const tEmp = target.employeeId.trim().toLowerCase();
    const tName = target.name.trim().toLowerCase();
    const matchesAp = (ap: string) =>
      Boolean(ap && ((tReg && tReg === ap) || (tEmp && tEmp === ap) || (tName && tName === ap)));
    return matchesAp(myAp1) || matchesAp(myAp2);
  };

  const filteredSubs = allUsers.filter((target) => {
    if (target.employeeId.toLowerCase() === user.employeeId.toLowerCase()) return true;
    if (isMyApprover(target)) return false;
    // 1. Jika user adalah Approver (AP1 / AP2) dari karyawan tsb:
    //    untuk level berbatas Unit Usaha (seperti GM / vGM, Divisi, Dept, Bagian, dst.), tetap kunci visibilitas data
    //    hanya di dalam Unit Usaha yang diizinkan (user.company + managedUnits + checkerUnits) agar tidak bocor lintas unit.
    if (transitiveSubIds.has(target.employeeId.toLowerCase())) {
      if (isGroupOrGlobalTier) return true;
      return allowedUnits.has(normOrgName(target.company));
    }

    const targetLevel = resolveUserAuthorityLevel(target);
    const targetRank = HIERARCHY_RANK[targetLevel];
    if (target.role === user.role && targetRank >= myRank) return false;
    if ((level === "gm_unit" || level === "vgm_unit") && targetRank >= myRank && (targetLevel === "gm_unit" || targetLevel === "vgm_unit")) {
      // Peer pada level GM/vGM yang sama tidak saling menjadi bawahan (kecuali rantai AP1/AP2 di atas)
      if (targetRank === myRank) return false;
    }
    if (targetRank > myRank) return false;

    // 2. Jika Cakupan Wewenang Berjenjang Tambahan (Multi-Scope: Unit / Divisi / Departemen / Bagian) di-setup di /settings/user-management:
    // - Ceklist Unit Usaha saja -> semua karyawan di Unit Usaha yang diceklis terlihat
    // - Ditambah ceklist Divisi -> otomatis hanya melihat sesuai Divisi di Unit Usaha tersebut
    // - Ditambah ceklist Departemen -> otomatis hanya melihat sesuai Departemen dari Divisi dan Unit Usaha tersebut
    // - Ditambah ceklist Bagian -> otomatis hanya melihat sesuai Bagian dari Departemen, Divisi, dan Unit Usaha tersebut
    if (hasMultiScope) {
      const targetUnit = normOrgName(target.company);
      const unitMatched =
        checkedUnitSet.size > 0
          ? checkedUnitSet.has(targetUnit) || (isGroupOrGlobalTier && roleAllowedUnits.some((u) => normOrgName(u) === targetUnit))
          : level === "director_group"
            ? directorGroupUnits.has(targetUnit)
            : allowedUnits.has(targetUnit);
      if (!unitMatched) return false;
      if (checkedDivSet.size > 0 && !checkedDivSet.has(normOrgName(target.division))) return false;
      if (checkedDeptSet.size > 0 && !checkedDeptSet.has(normOrgName(target.department))) return false;
      if (checkedBagianSet.size > 0 && !checkedBagianSet.has(normOrgName(target.bagian))) return false;
      return true;
    }

    // Cakupan Unit Usaha berbasis Role hanya berlaku pada tier Direktur Group ke atas,
    // sehingga Groupings seperti GM / vGM tidak pernah bocor keluar dari Unit Usahanya sendiri.
    if (
      isGroupOrGlobalTier &&
      roleAllowedUnits.length > 0 &&
      roleAllowedUnits.some((u) => normOrgName(u) === normOrgName(target.company))
    ) {
      return true;
    }

    // 1. Level Direktur pada Group: melihat semua unit dalam Group-nya (RSUP Group atau Sambu Group), GM, Divisi, Departemen, Bagian, All Posisi
    if (level === "director_group") {
      return directorGroupUnits.has(normOrgName(target.company));
    }

    // 2. Level GM, vGM & HR Unit: melihat karyawan pada Unit Usahanya sesuai batas hirarki role
    if (level === "gm_unit" || level === "vgm_unit" || level === "hr_unit") {
      return allowedUnits.has(normOrgName(target.company));
    }

    // Pastikan dalam Company Unit yang sama untuk level Divisi ke bawah
    if (!allowedUnits.has(normOrgName(target.company))) return false;

    // 3. Level Divisi: melihat semua posisi, bagian, departemen dalam Divisinya
    if (level === "division") {
      return allowedDivisions.has(normOrgName(target.division));
    }

    // 4. Level Departemen: melihat semua posisi dan bagian dalam Departemennya
    if (level === "department") {
      const sameDiv = !user.division || allowedDivisions.has(normOrgName(target.division));
      return sameDiv && allowedDepartments.has(normOrgName(target.department));
    }

    // 5. Level Bagian: melihat semua posisi dalam Bagiannya (wajib cocok Bagian, tidak bocor ke satu Departemen)
    if (level === "bagian") {
      const sameDiv = !user.division || allowedDivisions.has(normOrgName(target.division));
      const sameDept = !user.department || allowedDepartments.has(normOrgName(target.department));
      if (allowedBagians.size > 0 && target.bagian) {
        return sameDiv && sameDept && allowedBagians.has(normOrgName(target.bagian));
      }
      return false;
    }

    // Level di bawah Bagian (seksi seperti KASHIFT / operational):
    // Hanya melihat dirinya sendiri dan karyawan yang berada di dalam rantai Reg No AP1 / Reg No AP2-nya (transitiveSubIds di atas).
    return false;
  });
  perUsersMap.set(userMemoKey, filteredSubs);
  return filteredSubs;
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
export type WorkflowStageRole = "checker" | "approver1" | "approver2" | "validator";

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
  if (canCheckerHandleCompanyUnit(viewer, target.company)) {
    return "checker";
  }
  return "view_only";
}

/**
 * Menentukan tahapan spesifik ("checker" | "approver1" | "approver2" | "validator" | null)
 * dari user yang sedang login terhadap suatu pengajuan karyawan:
 * - KPI & SMART Goals: Submit -> HR Unit Check ("checker") -> Approver 1 ("approver1") -> Approver 2 ("approver2") -> HR ICF Validate ("validator")
 * - Modul lainnya: Approver 1 ("approver1") -> Approver 2 ("approver2")
 */
export function resolveWorkflowStageForTarget(
  viewer: ManagedUser,
  targetEmployeeIdOrName: string,
  moduleType = "",
  workflowStepState?: {
    checkerDone?: boolean;
    a1Done?: boolean;
    a2Done?: boolean;
    validatorDone?: boolean;
  },
  allUsers = loadManagedUsers(),
  phase?: "setting" | "measurement",
): WorkflowStageRole | null {
  const q = targetEmployeeIdOrName.trim().toLowerCase().replace(/^emp-?0*/i, "");
  const viewerClean = viewer.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
  const isSelf =
    viewer.employeeId.trim().toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
    viewer.name.trim().toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
    Boolean(q && viewerClean === q);

  const target = allUsers.find((u) => {
    const uNum = u.employeeId.trim().toLowerCase().replace(/^e0*/i, "");
    return (
      u.employeeId.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      u.name.toLowerCase() === targetEmployeeIdOrName.trim().toLowerCase() ||
      (q && uNum === q)
    );
  });

  const isFourStepModule = moduleType === "KPI" || moduleType === "SMART Goals" || moduleType === "RCA";
  const checkerDone = Boolean(workflowStepState?.checkerDone);
  const a1Done = Boolean(workflowStepState?.a1Done);
  const a2Done = Boolean(workflowStepState?.a2Done);

  const ap1 = (target?.regNoAp1 ?? "").trim().toLowerCase();
  const ap2 = (target?.regNoAp2 ?? "").trim().toLowerCase();
  // Identitas approver: diri sendiri + pemberi delegasi aktif untuk modul ini (Approvals → Delegation).
  // Siapa pun yang ditunjuk sebagai AP1/AP2 dapat melakukan approval tanpa dibatasi role/grouping/unit.
  const identities = moduleType && !isSelf ? resolveApproverIdentities(viewer, moduleType, phase, allUsers) : [viewer];
  const matchesRef = (u: ManagedUser, ref: string) => {
    const reg = (u.regNo ?? "").trim().toLowerCase();
    const emp = u.employeeId.trim().toLowerCase();
    const nm = u.name.trim().toLowerCase();
    return Boolean(ref) && ((reg !== "" && ref === reg) || (emp !== "" && ref === emp) || (nm !== "" && ref === nm));
  };
  const isAp1 = Boolean(target && identities.some((u) => matchesRef(u, ap1)));
  const isAp2 = Boolean(target && identities.some((u) => matchesRef(u, ap2)));
  const isHrUnitChecker = Boolean(
    !isSelf &&
      isFourStepModule &&
      target &&
      canCheckerHandleCompanyUnit(viewer, target.company),
  );
  const isHrIcfValidator = Boolean(
    viewer.role === "HR ICF" ||
      viewer.isHrIcfValidator ||
      viewer.role === "Administrator" ||
      viewer.role === "HR Admin",
  );

  if (isFourStepModule) {
    if (isHrUnitChecker && !checkerDone) {
      return "checker";
    }
    if (isAp1 && (!isAp2 || !a1Done)) {
      return "approver1";
    }
    if (isAp2 && (!a2Done || viewer.role !== "HR ICF")) {
      return "approver2";
    }
    if (isHrIcfValidator) {
      return "validator";
    }
    if (isHrUnitChecker) {
      return "checker";
    }
    if (isAp1) return "approver1";
    if (isAp2) return "approver2";
    return null;
  }

  if (isAp1 && isAp2) {
    return a1Done ? "approver2" : "approver1";
  }
  if (isAp1) return "approver1";
  if (isAp2) return "approver2";
  // Hanya izinkan override bila karyawan memang sudah memiliki approver terdaftar
  if (isHrIcfValidator && (ap1 || ap2)) {
    return a1Done ? "approver2" : "approver1";
  }
  return null;
}

/**
 * Menentukan peran reviewer ("approver1" | "approver2" | null) dari user yang sedang login
 * terhadap suatu transaksi pengajuan karyawan berdasarkan alur modul:
 * - KPI & SMART Goals: Check (HR Unit) -> Approval 1 (AP1) -> Approval 2 (AP2) -> Validate (HR ICF / Admin)
 * - Modul lainnya: Approval 1 (AP1) -> Approval 2 (AP2)
 */
export function resolveReviewerRoleForTarget(
  viewer: ManagedUser,
  targetEmployeeIdOrName: string,
  isStep1Completed = false,
  moduleType = "",
  allUsers = loadManagedUsers(),
  workflowStepState?: {
    checkerDone?: boolean;
    a1Done?: boolean;
    a2Done?: boolean;
    validatorDone?: boolean;
  },
): "approver1" | "approver2" | null {
  const stage = resolveWorkflowStageForTarget(
    viewer,
    targetEmployeeIdOrName,
    moduleType,
    {
      checkerDone: workflowStepState?.checkerDone,
      a1Done: workflowStepState?.a1Done ?? isStep1Completed,
      a2Done: workflowStepState?.a2Done,
      validatorDone: workflowStepState?.validatorDone,
    },
    allUsers,
  );
  if (!stage) return null;
  return stage === "approver2" || stage === "validator" ? "approver2" : "approver1";
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
  const checkerUnits = getEffectiveCheckerUnits(user);
  const checkerPool =
    checkerUnits.length > 0
      ? allUsers.filter(
          (u) =>
            u.status === "Active" &&
            u.employeeId.toLowerCase() !== user.employeeId.toLowerCase() &&
            checkerUnits.some((cu) => isSameCompanyUnit(u.company, cu)),
        )
      : [];
  const mergedMap = new Map<string, ManagedUser>();
  for (const u of [...subs, ...checkerPool]) {
    mergedMap.set(u.employeeId.toLowerCase(), u);
  }
  const mergedSubs = Array.from(mergedMap.values());
  const pool =
    level === "gm_unit" || level === "vgm_unit" || level === "director_group"
      ? [user, ...mergedSubs]
      : mergedSubs.length > 0
      ? mergedSubs
      : [user];

  const uniq = (arr: (string | undefined)[]) =>
    Array.from(new Set(arr.map((v) => (v ?? "").trim()).filter(Boolean))).sort();

  const groupName = getGroupNameForUnit(user.company);
  const groupUnitsCount = getGroupCompaniesForUnit(user.company, user.managedUnits).length;
  const checkerLabel =
    checkerUnits.length > 1
      ? `HR Checker Lintas Unit (${checkerUnits.length} Unit Usaha)`
      : `HR Unit Usaha (${checkerUnits[0] ?? user.company})`;
  const LABEL_BY_LEVEL: Record<HierarchyAuthorityLevel, string> = {
    admin: "Administrator / HR ICF (Semua Unit Usaha)",
    bod: "Board of Directors (Semua Unit Group)",
    director_group: `Level Direktur Group (${groupName} — ${groupUnitsCount} Unit Usaha, GM, Divisi, Dept, Bagian & All Posisi)`,
    gm_unit: `Level GM/vGM (${user.company} — Unit Usaha, Divisi, Dept, Bagian & All Posisi)`,
    vgm_unit: `Level ${user.role === "Coordinator" ? "Coordinator" : "GM/vGM"} (${user.company} — Unit Usaha, Divisi, Dept, Bagian & All Posisi)`,
    hr_unit: checkerLabel,
    division: `Level Divisi (${user.division} — ${user.company})`,
    department: `Level Departemen (${user.department} · ${user.division})`,
    bagian: `Level Bagian (${user.bagian || user.department} · ${user.department})`,
    seksi: `Level Seksi (${user.bagian || user.department})`,
    operational: checkerUnits.length > 0 ? checkerLabel : `Level Individu (${user.name})`,
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
/** Key legacy yang tidak lagi dipakai (dibersihkan agar tidak pernah bocor lintas sesi/perangkat). */
const LEGACY_LOGIN_ORIGIN_KEY = "pa_login_origin_user_v1";
/** Akun asli Administrator / HR ICF pada tab browser ini saat menggunakan Pindah Akun (sessionStorage saja). */
const SWITCH_ORIGIN_SESSION_KEY = "pa_switch_origin_session_v2";
const GROUP_RULES_BY_UNIT_KEY = "pa_group_rules_by_unit_v1";
export const AUTH_SESSION_KEY = "pa_auth_session_v1";
export const SESSION_EXPIRED_NOTICE_KEY = "pa_session_expired_notice_v1";
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 menit di luar halaman Sistem PA

export interface AuthSessionState {
  isAuthenticated: boolean;
  employeeId: string;
  loginAt: number;
  /**
   * null selama user berada & aktif melihat halaman Sistem PA (timer tidak menghitung).
   * Berisi timestamp (ms) saat user keluar/tidak berada di halaman Sistem PA, sehingga
   * hitungan mundur 30 menit berjalan; di-reset kembali ke null bila user kembali sebelum 30 menit.
   */
  awayStartedAt: number | null;
  /** Heartbeat terakhir saat halaman Sistem PA terbuka & terlihat. */
  lastActiveAt: number;
}

function readAuthSessionRaw(): AuthSessionState | null {
  try {
    const raw = safeGetLocalRaw(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function startOrRefreshAuthSession(employeeId: string): AuthSessionState {
  const now = Date.now();
  const next: AuthSessionState = {
    isAuthenticated: true,
    employeeId,
    loginAt: now,
    awayStartedAt: null,
    lastActiveAt: now,
  };
  safeSetLocalJson(AUTH_SESSION_KEY, next);
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    sessionStorage.removeItem("pa_manual_logout_v1");
  } catch {
    // ignore storage errors
  }
  return next;
}

export function logoutCurrentUser(reason: "manual" | "expired" = "manual"): void {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(ACTIVE_USER_KEY);
    localStorage.removeItem(LEGACY_LOGIN_ORIGIN_KEY);
    sessionStorage.removeItem(SWITCH_ORIGIN_SESSION_KEY);
    if (reason === "expired") {
      sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, "1");
    } else {
      sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
      sessionStorage.setItem("pa_manual_logout_v1", "1");
    }
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new Event("pa-auth-updated"));
}

/** Pengecekan murni tanpa side-effect (aman dipanggil saat render komponen guard). */
export function peekSessionValidity(now = Date.now()): { valid: boolean; expired: boolean } {
  const session = readAuthSessionRaw();
  if (!session || !session.isAuthenticated || !session.employeeId) {
    return { valid: false, expired: false };
  }
  let hasActiveUser = false;
  try {
    hasActiveUser = Boolean(safeGetLocalRaw(ACTIVE_USER_KEY));
  } catch {
    hasActiveUser = false;
  }
  if (!hasActiveUser) {
    return { valid: false, expired: false };
  }
  try {
    const sessId = String(session.employeeId ?? "").trim().toLowerCase();
    if (sessId) {
      const archived = JSON.parse(safeGetLocalRaw("pa_archived_users_v1") ?? "[]") as Array<{ user?: ManagedUser }>;
      if (
        Array.isArray(archived) &&
        archived.some((a) => a?.user?.employeeId && a.user.employeeId.trim().toLowerCase() === sessId)
      ) {
        return { valid: false, expired: true };
      }
      const matchedInUsers = loadManagedUsers().find((u) => u.employeeId.trim().toLowerCase() === sessId);
      if (matchedInUsers && matchedInUsers.status !== "Active") {
        return { valid: false, expired: true };
      }
    }
  } catch {
    // ignore
  }
  if (session.awayStartedAt !== null) {
    if (now - session.awayStartedAt >= SESSION_TIMEOUT_MS) {
      return { valid: false, expired: true };
    }
    return { valid: true, expired: false };
  }
  // Cadangan bila browser ditutup paksa/crash tanpa sempat menembakkan event pagehide/visibilitychange
  const lastBeat = session.lastActiveAt || session.loginAt || now;
  if (now - lastBeat >= SESSION_TIMEOUT_MS) {
    return { valid: false, expired: true };
  }
  return { valid: true, expired: false };
}

/**
 * Evaluasi & sinkronisasi status sesi 30 menit:
 * - Saat `onPaPageVisible === true` dan sesi masih valid: `awayStartedAt` di-reset ke `null`
 *   (hitungan 30 menit tidak berjalan selama di halaman PA, dan reset penuh bila baru kembali).
 * - Saat `onPaPageVisible === false`: `awayStartedAt` mulai mencatat waktu keluar halaman PA.
 * - Bila waktu di luar halaman PA mencapai >= 30 menit: otomatis logout (`expired`).
 */
export function evaluateAndSyncSession(
  onPaPageVisible: boolean,
  now = Date.now(),
): { authenticated: boolean; expiredNow: boolean } {
  const check = peekSessionValidity(now);
  if (!check.valid) {
    if (check.expired) {
      logoutCurrentUser("expired");
    }
    return { authenticated: false, expiredNow: check.expired };
  }
  const session = readAuthSessionRaw()!;
  try {
    if (onPaPageVisible) {
      if (session.awayStartedAt !== null || now - (session.lastActiveAt || 0) >= 10_000) {
        const updated: AuthSessionState = {
          ...session,
          awayStartedAt: null,
          lastActiveAt: now,
        };
        safeSetLocalJson(AUTH_SESSION_KEY, updated);
      }
    } else if (session.awayStartedAt === null) {
      const updated: AuthSessionState = {
        ...session,
        awayStartedAt: now,
      };
      safeSetLocalJson(AUTH_SESSION_KEY, updated);
    }
  } catch {
    // ignore storage errors
  }
  return { authenticated: true, expiredNow: false };
}

/** Tandai user baru saja keluar dari halaman Sistem PA agar hitungan 30 menit dimulai. */
export function markSessionAwayFromPaPage(now = Date.now()): void {
  const session = readAuthSessionRaw();
  if (!session || !session.isAuthenticated) return;
  if (session.awayStartedAt !== null) return;
  safeSetLocalJson(AUTH_SESSION_KEY, { ...session, awayStartedAt: now });
}

const _cleanedRegNoDupSignatures = new Set<string>();

/**
 * Memastikan tidak ada user dengan Reg No yang duplikat dalam 1 Unit Usaha yang sama.
 * Jika ditemukan duplikat Reg No pada Unit Usaha yang sama, salah satu dihapus otomatis
 * (mempertahankan akun yang sedang aktif / paling lengkap).
 */
export function deduplicateUsersByUnitAndRegNo(
  users: ManagedUser[],
  preferredKeepId?: string,
): { unique: ManagedUser[]; removedDuplicates: ManagedUser[] } {
  let activeEmpLower = "";
  try {
    const rawActive = safeGetLocalRaw(ACTIVE_USER_KEY);
    if (rawActive) {
      activeEmpLower = String((JSON.parse(rawActive) as { employeeId?: string })?.employeeId ?? "")
        .trim()
        .toLowerCase();
    }
  } catch {
    activeEmpLower = "";
  }
  const scoreUser = (u: ManagedUser): number => {
    let s = 0;
    if (preferredKeepId && u.id === preferredKeepId) s += 1000;
    if (activeEmpLower && u.employeeId.trim().toLowerCase() === activeEmpLower) s += 500;
    if (u.status === "Active") s += 100;
    if (u.lastLogin) s += 20;
    if (u.role) s += 10;
    if (u.email) s += 5;
    if (u.position && u.position !== "-") s += 5;
    return s;
  };

  const byUnitReg = new Map<string, number>();
  const unique: ManagedUser[] = [];
  const removedDuplicates: ManagedUser[] = [];

  for (const rawUser of users) {
    const u = normalizeManagedUserUnits(rawUser);
    const regClean = String(u.regNo ?? "").trim().toLowerCase();
    const unitClean = canonicalizeCompanyUnitName(u.company).trim().toLowerCase();
    if (!regClean || !unitClean) {
      unique.push(u);
      continue;
    }
    const key = `${unitClean}::${regClean}`;
    const existingIdx = byUnitReg.get(key);
    if (existingIdx === undefined) {
      byUnitReg.set(key, unique.length);
      unique.push(u);
    } else {
      const existing = unique[existingIdx];
      if (scoreUser(u) > scoreUser(existing)) {
        removedDuplicates.push(existing);
        unique[existingIdx] = u;
      } else {
        removedDuplicates.push(u);
      }
    }
  }

  // Pastikan setiap user memiliki id unik non-kosong agar operasi Edit User di tabel tidak pernah menabrak id lain
  const usedIds = new Set<string>();
  if (preferredKeepId) {
    const prefIdx = unique.findIndex((u) => u.id === preferredKeepId);
    if (prefIdx >= 0) usedIds.add(preferredKeepId);
  }
  for (let i = 0; i < unique.length; i++) {
    const item = unique[i];
    const rawId = String(item.id ?? "").trim();
    if (
      rawId &&
      (!usedIds.has(rawId) ||
        (preferredKeepId && rawId === preferredKeepId && unique.findIndex((u) => u.id === preferredKeepId) === i))
    ) {
      usedIds.add(rawId);
      continue;
    }
    const unitSlug = canonicalizeCompanyUnitName(item.company).replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || "unit";
    const refSlug = String(item.regNo || item.employeeId || i + 1).replace(/[^a-zA-Z0-9_-]+/g, "");
    let candidate = `usr-${unitSlug}-${refSlug}`;
    let suffix = 1;
    while (usedIds.has(candidate)) {
      suffix++;
      candidate = `usr-${unitSlug}-${refSlug}-${suffix}`;
    }
    usedIds.add(candidate);
    unique[i] = { ...item, id: candidate };
  }

  return { unique, removedDuplicates };
}

export function loadManagedUsers(): ManagedUser[] {
  try {
    const raw = safeGetLocalRaw(USERS_KEY);
    if (!raw) {
      _cachedManagedUsersRaw = raw;
      _cachedManagedUsersList = DEFAULT_MANAGED_USERS;
      _cachedUsersByEmpUpper = new Map(DEFAULT_MANAGED_USERS.map((u) => [u.employeeId.toUpperCase(), u]));
      return DEFAULT_MANAGED_USERS;
    }
    const activeRaw = safeGetLocalRaw(ACTIVE_USER_KEY);
    if (_cachedManagedUsersList && _cachedManagedUsersRaw === raw && _cachedManagedUsersActiveRaw === activeRaw) {
      return _cachedManagedUsersList;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MANAGED_USERS;
    const { unique, removedDuplicates } = deduplicateUsersByUnitAndRegNo(parsed as ManagedUser[]);
    if (removedDuplicates.length > 0) {
      const sig = removedDuplicates.map((d) => `${d.company}:${d.regNo}:${d.employeeId}`).join("|");
      safeSetLocalJson(USERS_KEY, unique);
      if (!_cleanedRegNoDupSignatures.has(sig)) {
        _cleanedRegNoDupSignatures.add(sig);
        savePersistedState(USERS_KEY, unique);
        const keptEmpIds = new Set(unique.map((u) => u.employeeId.trim().toLowerCase()));
        for (const dup of removedDuplicates) {
          if (dup.employeeId && !keptEmpIds.has(dup.employeeId.trim().toLowerCase())) {
            void syncToSupabase({ kind: "user-delete", employeeId: dup.employeeId });
          }
        }
        void syncToSupabase({ kind: "users-batch", users: unique });
      }
    }
    const finalRaw = safeGetLocalRaw(USERS_KEY);
    _cachedManagedUsersRaw = finalRaw;
    _cachedManagedUsersActiveRaw = activeRaw;
    _cachedManagedUsersList = unique;
    const upperMap = new Map<string, ManagedUser>();
    for (const u of unique) {
      upperMap.set(u.employeeId.toUpperCase(), u);
    }
    _cachedUsersByEmpUpper = upperMap;
    _authComputedEpoch++;
    return unique;
  } catch {
    return DEFAULT_MANAGED_USERS;
  }
}

export function saveManagedUsers(
  users: ManagedUser[],
  changedUser?: ManagedUser,
  deletedId?: string,
  previousUser?: Pick<ManagedUser, "id" | "employeeId" | "regNo" | "company">,
): void {
  try {
    const normalizedChanged = changedUser ? normalizeManagedUserUnits(changedUser) : undefined;
    const prevUnitCanon = previousUser ? canonicalizeCompanyUnitName(previousUser.company).trim().toLowerCase() : "";
    const prevRegLower = previousUser ? String(previousUser.regNo ?? "").trim().toLowerCase() : "";
    const prevEmpTrimmed = previousUser ? String(previousUser.employeeId ?? "").trim() : "";
    const prevEmpLower = prevEmpTrimmed.toLowerCase();

    // Jika ini adalah operasi Edit User (previousUser tersedia), pastikan entri lama dari user yang sama tidak tertinggal ganda
    if (normalizedChanged && previousUser) {
      users = users.filter((u) => {
        if (u.id === normalizedChanged.id) return true;
        const uUnit = canonicalizeCompanyUnitName(u.company).trim().toLowerCase();
        if (uUnit !== prevUnitCanon) return true;
        const uReg = String(u.regNo ?? "").trim().toLowerCase();
        const uEmp = String(u.employeeId ?? "").trim().toLowerCase();
        if (prevRegLower && uReg === prevRegLower) return false;
        if (!prevRegLower && prevEmpLower && uEmp === prevEmpLower) return false;
        return true;
      });
    }

    const { unique, removedDuplicates } = deduplicateUsersByUnitAndRegNo(users, normalizedChanged?.id);
    users = unique;
    changedUser = normalizedChanged;
    savePersistedState(USERS_KEY, users);

    let staleOldEmployeeIdToDelete: string | undefined;
    if (changedUser && previousUser && prevEmpTrimmed && prevEmpTrimmed !== changedUser.employeeId.trim()) {
      const stillUsedByAnotherUser = users.some(
        (u) => u.id !== changedUser!.id && u.employeeId.trim() === prevEmpTrimmed,
      );
      if (!stillUsedByAnotherUser) {
        staleOldEmployeeIdToDelete = prevEmpTrimmed;
      }
      // Migrasikan catatan password security apabila Employee ID berubah dan tidak dipakai rekan lintas unit lain
      const oldUpper = prevEmpTrimmed.toUpperCase();
      const newUpper = changedUser.employeeId.trim().toUpperCase();
      const stillUsedUpper = users.some(
        (u) => u.id !== changedUser!.id && u.employeeId.trim().toUpperCase() === oldUpper,
      );
      if (oldUpper && newUpper && oldUpper !== newUpper && !stillUsedUpper) {
        try {
          const rawSec = safeGetLocalRaw("pa_user_password_security_v1");
          if (rawSec) {
            const secMap = JSON.parse(rawSec) as Record<string, Record<string, unknown>>;
            if (secMap && typeof secMap === "object" && secMap[oldUpper] && !secMap[newUpper]) {
              secMap[newUpper] = { ...secMap[oldUpper], employeeId: changedUser.employeeId.trim() };
              delete secMap[oldUpper];
              savePersistedState("pa_user_password_security_v1", secMap);
            }
          }
        } catch {
          // ignore password map migration failure
        }
      }
    }

    // Sinkronkan juga activeUser & auth session jika user yang diedit adalah user yang sedang login
    if (changedUser) {
      try {
        const rawActive = safeGetLocalRaw(ACTIVE_USER_KEY);
        if (rawActive) {
          const parsedActive = JSON.parse(rawActive) as ManagedUser;
          const activeUnit = canonicalizeCompanyUnitName(parsedActive.company).trim().toLowerCase();
          const activeReg = String(parsedActive.regNo ?? "").trim().toLowerCase();
          const activeEmp = String(parsedActive.employeeId ?? "").trim().toLowerCase();
          const changedUnit = canonicalizeCompanyUnitName(changedUser.company).trim().toLowerCase();
          const isEditedActiveUser =
            (parsedActive.id && parsedActive.id === changedUser.id) ||
            (previousUser &&
              activeUnit === prevUnitCanon &&
              ((prevRegLower && activeReg === prevRegLower) || (prevEmpLower && activeEmp === prevEmpLower))) ||
            (activeUnit === changedUnit &&
              ((changedUser.regNo && activeReg === changedUser.regNo.trim().toLowerCase()) ||
                activeEmp === changedUser.employeeId.trim().toLowerCase()));
          if (isEditedActiveUser) {
            safeSetLocalJson(ACTIVE_USER_KEY, changedUser);
            const rawSess = safeGetLocalRaw(AUTH_SESSION_KEY);
            if (rawSess) {
              const sess = JSON.parse(rawSess) as AuthSessionState;
              if (sess && sess.isAuthenticated && sess.employeeId !== changedUser.employeeId) {
                safeSetLocalJson(AUTH_SESSION_KEY, { ...sess, employeeId: changedUser.employeeId });
              }
            }
          }
        }
      } catch {
        // ignore active user sync failure
      }
    }

    if (removedDuplicates.length > 0) {
      const keptEmpIds = new Set(users.map((u) => u.employeeId.trim().toLowerCase()));
      for (const dup of removedDuplicates) {
        if (dup.employeeId && !keptEmpIds.has(dup.employeeId.trim().toLowerCase())) {
          void syncToSupabase({ kind: "user-delete", employeeId: dup.employeeId });
        }
      }
    }
    window.dispatchEvent(new Event("pa-auth-updated"));
    if (changedUser) {
      void syncToSupabase({
        kind: "user-upsert",
        user: changedUser,
        previousEmployeeId: staleOldEmployeeIdToDelete,
        previousRegNo: previousUser?.regNo ? String(previousUser.regNo).trim() : undefined,
        previousCompany: previousUser?.company ? canonicalizeCompanyUnitName(previousUser.company) : undefined,
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
    } else if (users.length > 0) {
      // Operasi massal (Import Excel mode Gabung / sinkronisasi grouping): pastikan tabel pa_users juga langsung ter-upsert secara batch
      void syncToSupabase({
        kind: "users-batch",
        users,
      });
    }
  } catch {
    // ignore storage errors
  }
}

export function loadUnitGroupRules(company: string, fallback: ManagedGroupRule[]): ManagedGroupRule[] {
  try {
    const map = getCachedGroupRulesMap();
    if (Object.keys(map).length === 0) return fallback;
    const canon = canonicalizeCompanyUnitName(company);
    return map[canon] ?? (canon === "PT RSUP ASD" ? map["ASD"] : undefined) ?? map[company] ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveUnitGroupRules(company: string, rules: ManagedGroupRule[]): void {
  try {
    const raw = safeGetLocalRaw(GROUP_RULES_BY_UNIT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, ManagedGroupRule[]>) : {};
    const canon = canonicalizeCompanyUnitName(company);
    if (canon === "PT RSUP ASD") delete map["ASD"];
    map[canon] = rules;
    window.dispatchEvent(new Event("pa-auth-updated"));
    savePersistedState(GROUP_RULES_BY_UNIT_KEY, map, {
      kind: "group-rules",
      company: canon,
      rules,
    });
  } catch {
    // ignore
  }
}

export function getActiveUser(): ManagedUser {
  const users = loadManagedUsers();
  try {
    const raw = safeGetLocalRaw(ACTIVE_USER_KEY);
    const sig = `${_cachedManagedUsersRaw ?? ""}::${raw ?? ""}`;
    if (_cachedActiveUserObj && _cachedActiveUserSig === sig) {
      return _cachedActiveUserObj;
    }
    if (raw) {
      const parsed = JSON.parse(raw) as ManagedUser;
      const parsedUnit = canonicalizeCompanyUnitName(parsed.company ?? "").trim().toLowerCase();
      const parsedReg = String(parsed.regNo ?? "").trim().toLowerCase();
      const latestByExactIdentity =
        (parsed.id
          ? users.find(
              (u) =>
                u.id === parsed.id &&
                (!parsedUnit || canonicalizeCompanyUnitName(u.company).trim().toLowerCase() === parsedUnit),
            )
          : undefined) ??
        (parsedUnit && parsedReg
          ? users.find(
              (u) =>
                canonicalizeCompanyUnitName(u.company).trim().toLowerCase() === parsedUnit &&
                String(u.regNo ?? "").trim().toLowerCase() === parsedReg,
            )
          : undefined) ??
        (parsedUnit && parsed.employeeId
          ? users.find(
              (u) =>
                canonicalizeCompanyUnitName(u.company).trim().toLowerCase() === parsedUnit &&
                u.employeeId.toUpperCase() === String(parsed.employeeId ?? "").toUpperCase(),
            )
          : undefined);
      const latest =
        latestByExactIdentity ??
        _cachedUsersByEmpUpper.get(String(parsed.employeeId ?? "").toUpperCase()) ??
        users.find((u) => u.employeeId.toUpperCase() === String(parsed.employeeId ?? "").toUpperCase());
      const resolved = latest ?? normalizeManagedUserUnits(parsed);
      _cachedActiveUserSig = sig;
      _cachedActiveUserObj = resolved;
      return resolved;
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
  if (role === "BOD" || role === "Director" || role === "DirectorNonOpr") {
    return "/bod";
  }
  if (
    role === "Supervisor" ||
    role === "GM" ||
    role === "vGM" ||
    role === "Coordinator" ||
    role === "Division" ||
    role === "Departement" ||
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

function withDelegatedAllowedModules(user: ManagedUser, base: AppraisalModuleName[]): AppraisalModuleName[] {
  const flags = getDelegatedModuleFlagsForUser(user.employeeId);
  const next = [...base];
  if ((flags.kpiSetting || flags.kpiTracking) && !next.includes("KPI (Setting/Measurement)")) {
    next.push("KPI (Setting/Measurement)");
  }
  if ((flags.smartGoalsSetting || flags.smartGoalsMeasurement) && !next.includes("SMART Goals (Setting/Measurement)")) {
    next.push("SMART Goals (Setting/Measurement)");
  }
  return next;
}

export function resolveUserAllowedModules(user: ManagedUser): AppraisalModuleName[] {
  getCachedGroupRulesMap();
  if (_allowedModsMemoEpoch !== _authComputedEpoch) {
    _allowedModsMemoEpoch = _authComputedEpoch;
    _allowedModsMemoByUser = new WeakMap();
  }
  if (user.employeeId) {
    const cached = _allowedModsMemoByUser.get(user);
    if (cached) return cached;
  }
  const effectiveGrouping = resolveEffectiveUserGrouping(user);
  const configuredGroups = loadAccessGroups();
  const isConfiguredInAccessMgmt = configuredGroups.some(
    (g) => normGroupKey(g) === normGroupKey(effectiveGrouping),
  );
  let result: AppraisalModuleName[] | null = null;
  try {
    const map = getCachedGroupRulesMap();
    const unitRules = map[user.company];
    if (unitRules) {
      const posLower = user.position.toLowerCase();
      const effNorm = normGroupKey(effectiveGrouping);
      const matched = unitRules.find(
        (r) =>
          r.position.toLowerCase() === posLower ||
          normGroupKey(r.group) === effNorm,
      );
      if (matched && Array.isArray(matched.allowedModules)) {
        result = withDelegatedAllowedModules(user, matched.allowedModules);
      }
    }
  } catch {
    // fallback to grouping defaults
  }
  if (!result) {
    if (isConfiguredInAccessMgmt) {
      result = withDelegatedAllowedModules(user, getGroupAllowedModules(effectiveGrouping));
    } else {
      result = withDelegatedAllowedModules(user, defaultAllowedModulesForGrouping(effectiveGrouping));
    }
  }
  if (user.employeeId) {
    _allowedModsMemoByUser.set(user, result);
  }
  return result;
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
    "Inter-Department Feedback",
  ];
  const allSetting = [
    "KPI",
    "SMART Goals",
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

  // Untuk role yang di-allow sebagai HR Unit Checker:
  // - Jika TIDAK memiliki bawahan langsung/hirarkis, hanya munculkan filter KPI & SMART Goals.
  // - Jika memiliki bawahan yang memiliki akses modul lain selain KPI & SMART Goals, munculkan filter yang sesuai.
  const isCheckerUser =
    user.role === "HR Unit" ||
    Boolean(user.isHrUnitChecker) ||
    getEffectiveCheckerUnits(user).length > 0;
  if (isCheckerUser) {
    if (mode === "setting") {
      return ["KPI", "SMART Goals"];
    }
    const allUsers = loadManagedUsers();
    const subs = getStrictSubordinateUsers(user, allUsers).filter(
      (s) => s.status === "Active" && s.employeeId.trim().toLowerCase() !== user.employeeId.trim().toLowerCase(),
    );
    if (subs.length === 0) {
      return ["KPI", "SMART Goals"];
    }
    const subMods = new Set<AppraisalModuleName>();
    for (const sub of subs) {
      for (const m of resolveUserAllowedModules(sub)) {
        subMods.add(m);
      }
    }
    const allowedForChecker: string[] = ["KPI", "SMART Goals"];
    if (subMods.has("Appraisals Form")) allowedForChecker.push("Appraisal Form");
    if (subMods.has("Managerial Skill")) allowedForChecker.push("Managerial Skill");
    if (subMods.has("Project Outside Job Scope")) allowedForChecker.push("Project");
    if (subMods.has("Inter-Departement Feedback")) allowedForChecker.push("Inter-Department Feedback");
    return allowedForChecker;
  }

  // Setiap Approver (Supervisor, GM, Director, dll.) dapat memiliki bawahan lintas grouping
  // (termasuk pengajuan Inter-Department Feedback, Project, RCA, Appraisal Form, dll.);
  // filter kewenangan per karyawan sudah dijaga ketat di resolveDynamicApprovalRowsForUser.
  return baseList;
}

/**
 * Validator resmi adalah user dengan role "HR ICF" (tidak ada filter unit usaha).
 */
export function findHrIcfValidatorUser(allUsers = loadManagedUsers()): ManagedUser | undefined {
  return (
    allUsers.find((u) => u.status === "Active" && u.role === "HR ICF") ??
    allUsers.find(
      (u) => u.status === "Active" && Boolean(u.isHrIcfValidator) && u.role !== "Administrator",
    ) ??
    allUsers.find((u) => u.status === "Active" && Boolean(u.isHrIcfValidator))
  );
}

/**
 * Mengembalikan seluruh Checker resmi (sama unit maupun lintas unit usaha) yang berwenang memeriksa `companyName`.
 */
export function findAllHrUnitCheckerUsersForCompany(
  companyName: string,
  excludeEmployeeId?: string,
  allUsers = loadManagedUsers(),
): ManagedUser[] {
  const exNorm = (excludeEmployeeId ?? "").trim().toLowerCase();
  const eligible = allUsers.filter(
    (u) =>
      u.status === "Active" &&
      (!exNorm || u.employeeId.trim().toLowerCase() !== exNorm) &&
      canCheckerHandleCompanyUnit(u, companyName),
  );
  // Urutkan agar HR Unit pada unit asal didahulukan bila dibutuhkan tampilan nama tunggal, namun semua tetap diikutkan untuk notifikasi
  return eligible.sort((a, b) => {
    const aSame = isSameCompanyUnit(a.company, companyName) ? 0 : 1;
    const bSame = isSameCompanyUnit(b.company, companyName) ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    const aRole = a.role === "HR Unit" ? 0 : 1;
    const bRole = b.role === "HR Unit" ? 0 : 1;
    return aRole - bRole;
  });
}

/**
 * Checker resmi utama untuk tampilan informasi alur approval `companyName` (mendukung Checker lintas unit).
 */
export function findHrUnitCheckerUserForCompany(
  companyName: string,
  excludeEmployeeId?: string,
  allUsers = loadManagedUsers(),
): ManagedUser | undefined {
  return findAllHrUnitCheckerUsersForCompany(companyName, excludeEmployeeId, allUsers)[0];
}

/**
 * Menentukan filter Unit Usaha yang mengikat user aktif:
 * - Administrator, HR ICF, BOD: undefined (semua unit usaha), kecuali dibatasi di Access Management
 * - Director: seluruh unit dalam Group-nya (RSUP Group / Sambu Group) + akses khusus Access Management
 * - GM & HR Unit: terkunci ke Unit Usaha tempatnya berada, KECUALI diberi akses khusus melalui Access Management / managedUnits
 */
export function getEffectiveLockedUnitsForUser(user: ManagedUser, allUsers = loadManagedUsers()): string[] | undefined {
  const roleAllowedUnits = getRoleAllowedCompanyUnits(user.role);
  const extraManaged = (user.managedUnits ?? []).filter(Boolean);
  const checkerUnits = getEffectiveCheckerUnits(user);
  const level = resolveUserAuthorityLevel(user);

  if (level === "admin" || level === "bod") {
    if (roleAllowedUnits.length > 0) {
      return Array.from(new Set([...roleAllowedUnits, ...extraManaged]));
    }
    return undefined;
  }

  const authorizedUnits = getAuthorizedSubordinates(user, allUsers)
    .map((u) => u.company)
    .filter(Boolean);

  if (level === "director_group") {
    if (roleAllowedUnits.length > 0) {
      return Array.from(new Set([...roleAllowedUnits, ...extraManaged, ...checkerUnits, ...authorizedUnits]));
    }
    return Array.from(new Set([...getGroupCompaniesForUnit(user.company, extraManaged), ...checkerUnits, ...authorizedUnits]));
  }

  // Untuk Level GM/vGM, Divisi, Departemen, Bagian, Seksi, dan Operasional:
  // terkunci ketat pada Unit Usaha sendiri (+ managedUnits / checkerUnits eksplisit user tersebut).
  const strictOwnUnits = Array.from(
    new Set([user.company, ...extraManaged, ...checkerUnits].map((u) => canonicalizeCompanyUnitName(u)).filter(Boolean)),
  );
  if (strictOwnUnits.length > 0) {
    return strictOwnUnits;
  }

  if (authorizedUnits.length > 0 || checkerUnits.length > 0) {
    return Array.from(new Set([...authorizedUnits, ...checkerUnits]));
  }

  return Array.from(new Set([user.company, ...extraManaged].filter(Boolean)));
}

function normalizeCompanyKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/industri\b/g, "industry")
    .replace(/\bpt\.?\s*/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Bandingkan Company Unit karyawan dengan Company Unit terpilih di halaman login (toleran variasi penulisan). */
export function isSameCompanyUnit(userCompany: string, selectedCompany: string): boolean {
  const canonUser = canonicalizeCompanyUnitName(userCompany);
  const canonSelected = canonicalizeCompanyUnitName(selectedCompany);
  if (canonUser && canonSelected && canonUser === canonSelected) return true;
  const a = normalizeCompanyKey(canonUser);
  const b = normalizeCompanyKey(canonSelected);
  if (!a || !b) return false;
  if (a === b) return true;
  const loc = COMPANY_UNIT_LOCATIONS.find((l) => normalizeCompanyKey(l.company) === b || l.company === canonSelected);
  if (!loc) return false;
  return [loc.company, loc.fullName, loc.code, loc.unitId].some((v) => normalizeCompanyKey(v) === a);
}

/**
 * Validasi Company Unit sebelum verifikasi password (agar salah pilih unit tidak dihitung sebagai percobaan password).
 */
export function validateLoginCompanyUnit(
  companyName: string,
  employeeIdInput: string,
): { ok: true; user: ManagedUser } | { ok: false; error: string } {
  const q = employeeIdInput.trim().toLowerCase();
  if (!q) return { ok: false, error: "Masukkan Employee ID terlebih dahulu." };
  const candidates = loadManagedUsers().filter(
    (u) =>
      u.employeeId.toLowerCase() === q ||
      (u.regNo ?? "").toLowerCase() === q ||
      (u.email ?? "").toLowerCase() === q,
  );
  if (candidates.length === 0) {
    return { ok: false, error: `Employee ID "${employeeIdInput}" tidak ditemukan pada User Management.` };
  }
  const inUnit = candidates.find((u) => isSameCompanyUnit(u.company, companyName));
  if (!inUnit) {
    return {
      ok: false,
      error: `Company Unit tidak sesuai. Akun ${candidates[0].employeeId} tidak terdaftar pada ${companyName}. Silakan pilih Company Unit yang sesuai dengan akun Anda.`,
    };
  }
  return { ok: true, user: inUnit };
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

  // Cari karyawan berdasarkan Employee ID / Reg No / email / nama
  const matchesQuery = (u: ManagedUser) =>
    u.employeeId.toLowerCase() === q ||
    Boolean(u.regNo && u.regNo.trim().toLowerCase() === q) ||
    Boolean(u.email && u.email.trim().toLowerCase() === q) ||
    Boolean(u.name && u.name.trim().toLowerCase() === q);
  const candidates = users.filter(matchesQuery);
  const matched = candidates.find((u) => isSameCompanyUnit(u.company, companyName));

  // Validasi Unit Usaha: login wajib sesuai Company Unit karyawan walaupun Employee ID & password benar
  if (!matched && candidates.length > 0) {
    return {
      ok: false,
      error: `Company Unit tidak sesuai. Akun ${candidates[0].employeeId} tidak terdaftar pada ${companyName}. Silakan pilih Company Unit yang sesuai dengan akun Anda.`,
    };
  }

  if (!matched) {
    // Karyawan yang diarsipkan (dihapus di User Management / Eliminasi HC EOY) tidak dapat login sampai di-restore
    try {
      const archived = JSON.parse(safeGetLocalRaw("pa_archived_users_v1") ?? "[]") as Array<{ user?: ManagedUser }>;
      if (
        Array.isArray(archived) &&
        archived.some(
          (a) =>
            a.user &&
            (a.user.employeeId.toLowerCase() === q ||
              Boolean(a.user.email && a.user.email.trim().toLowerCase() === q) ||
              Boolean(a.user.name && a.user.name.trim().toLowerCase() === q)),
        )
      ) {
        return { ok: false, error: "Karyawan tidak ditemukan." };
      }
    } catch {
      // ignore
    }
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

  const nowD = new Date();
  const nowStr = `${String(nowD.getDate()).padStart(2, "0")}/${String(nowD.getMonth() + 1).padStart(2, "0")}/${nowD.getFullYear()} ${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`;
  const updatedUser: ManagedUser = { ...matched, lastLogin: nowStr };
  const updatedList = users.map((u) => (u.id === matched.id ? updatedUser : u));
  savePersistedState(USERS_KEY, updatedList);
  safeSetLocalJson(ACTIVE_USER_KEY, updatedUser);
  void syncToSupabase({ kind: "user-upsert", user: updatedUser });
  try {
    localStorage.removeItem(LEGACY_LOGIN_ORIGIN_KEY);
    sessionStorage.removeItem(SWITCH_ORIGIN_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
  const newSess = startOrRefreshAuthSession(updatedUser.employeeId);
  if (isAdminOrHrIcfRole(updatedUser.role)) {
    try {
      sessionStorage.setItem(
        SWITCH_ORIGIN_SESSION_KEY,
        JSON.stringify({
          employeeId: updatedUser.employeeId,
          role: updatedUser.role,
          loginAt: newSess.loginAt,
        }),
      );
    } catch {
      // ignore
    }
  }
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
  if (!canSwitchAccount()) return null;
  const users = loadManagedUsers();
  const found = users.find((u) => u.employeeId.toUpperCase() === employeeId.toUpperCase());
  if (!found) return null;
  const origin = getLoginOriginUser();
  if (!isAdminOrHrIcfRole(origin.role)) return null;
  const newSess = startOrRefreshAuthSession(found.employeeId);
  try {
    localStorage.removeItem(LEGACY_LOGIN_ORIGIN_KEY);
    sessionStorage.setItem(
      SWITCH_ORIGIN_SESSION_KEY,
      JSON.stringify({
        employeeId: origin.employeeId,
        role: origin.role,
        loginAt: newSess.loginAt,
      }),
    );
  } catch {
    // ignore
  }
  safeSetLocalJson(ACTIVE_USER_KEY, found);
  window.dispatchEvent(new Event("pa-auth-updated"));
  return found;
}

/** Akun asli yang login pada sesi ini (bukan akun hasil Pindah Akun). */
export function getLoginOriginUser(): ManagedUser {
  const active = getActiveUser();
  try {
    localStorage.removeItem(LEGACY_LOGIN_ORIGIN_KEY);
    const sess = readAuthSessionRaw();
    const raw = sessionStorage.getItem(SWITCH_ORIGIN_SESSION_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { employeeId?: string; role?: string; loginAt?: number })
      : null;
    if (
      parsed?.employeeId &&
      sess?.isAuthenticated &&
      typeof parsed.loginAt === "number" &&
      parsed.loginAt === sess.loginAt
    ) {
      const found = loadManagedUsers().find(
        (u) => u.employeeId.toUpperCase() === String(parsed.employeeId).toUpperCase(),
      );
      if (found && isAdminOrHrIcfRole(found.role)) return found;
    }
  } catch {
    // ignore
  }
  return active;
}

/** Pindah Akun (User Management) hanya untuk Role Administrator & HR ICF (berdasarkan akun asli yang login). */
export function canSwitchAccount(): boolean {
  const origin = getLoginOriginUser();
  return isAdminOrHrIcfRole(origin.role);
}

/** Cancel Transaction hanya untuk Role Administrator & HR ICF (berdasarkan akun asli yang login). */
export function canCancelTransaction(): boolean {
  const origin = getLoginOriginUser();
  return isAdminOrHrIcfRole(origin.role);
}

export function useAuthStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onUpdate = () => setTick((t) => t + 1);
    window.addEventListener("pa-auth-updated", onUpdate);
    window.addEventListener(ACCESS_UPDATED_EVENT, onUpdate);
    window.addEventListener(DELEGATION_EVENT, onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("pa-auth-updated", onUpdate);
      window.removeEventListener(ACCESS_UPDATED_EVENT, onUpdate);
      window.removeEventListener(DELEGATION_EVENT, onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const activeUser = getActiveUser();
  const allUsers = loadManagedUsers();
  const allowedModules = resolveUserAllowedModules(activeUser);
  const isHrUnitLocked =
    activeUser.role === "HR Unit" ||
    activeUser.role === "GM" ||
    activeUser.role === "vGM" ||
    activeUser.role === "Coordinator";
  const lockedUnits = getEffectiveLockedUnitsForUser(activeUser, allUsers);

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
): CalibrationUnitRole {
  if (!user) return "";
  const canonUnit = canonicalizeCompanyUnitName(unitName);
  if (user.calibrationRoleByUnit && typeof user.calibrationRoleByUnit === "object") {
    const values = Object.values(user.calibrationRoleByUnit);
    const hasConfiguredRole = values.some((v) => v === "approver" || v === "mengetahui" || v === "readonly");
    if (hasConfiguredRole) {
      return user.calibrationRoleByUnit[canonUnit] ?? user.calibrationRoleByUnit[unitName] ?? "";
    }
    if (Object.keys(user.calibrationRoleByUnit).length > 0 && !isAdminOrHrIcfRole(user.role)) {
      return "";
    }
  }
  if (user.directorCalibrationRole === "") return "";
  if (isAdminOrHrIcfRole(user.role)) {
    return user.directorCalibrationRole || "readonly";
  }
  if (user.role === "BOD") {
    return user.directorCalibrationRole || "approver";
  }
  if (isDirectorRoleOrGrouping(user)) {
    const groupUnits = getGroupCompaniesForUnit(user.company, user.managedUnits);
    if (groupUnits.includes(canonUnit) || groupUnits.includes(unitName)) {
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
    const hasConfiguredRole = Object.values(user.calibrationRoleByUnit).some(
      (v) => v === "approver" || v === "mengetahui" || v === "readonly",
    );
    if (hasConfiguredRole) {
      return allUnitNames.filter((u) => {
        const canon = canonicalizeCompanyUnitName(u);
        const r = user.calibrationRoleByUnit?.[canon] ?? user.calibrationRoleByUnit?.[u];
        return r === "approver" || r === "mengetahui" || r === "readonly";
      });
    }
    if (keys.length > 0 && !isAdminOrHrIcfRole(user.role)) {
      return [];
    }
  }
  if (user.directorCalibrationRole === "") return [];
  if (isAdminOrHrIcfRole(user.role)) return allUnitNames;
  const roleUnits = getRoleAllowedCompanyUnits(user.role);
  if (roleUnits.length > 0) {
    return Array.from(new Set([...roleUnits, ...(user.managedUnits ?? [])].filter(Boolean)));
  }
  if (isDirectorRoleOrGrouping(user)) {
    return getGroupCompaniesForUnit(user.company, user.managedUnits);
  }
  if (user.role === "BOD") return allUnitNames;
  return [];
}

/** Mengecek apakah user diberi akses eksplisit pada Peran Approval Setting (SOY) untuk minimal 1 Unit Usaha. */
export function hasExplicitSoyCalibrationRole(user: ManagedUser | null | undefined): boolean {
  if (!user || !user.soyCalibrationRoleByUnit || typeof user.soyCalibrationRoleByUnit !== "object") {
    return false;
  }
  return Object.values(user.soyCalibrationRoleByUnit).some(
    (v) => v === "approver" || v === "mengetahui" || v === "readonly",
  );
}

/** User dapat mengakses halaman /approvals/calibration/setting jika di-allow di Peran Approval Setting (SOY) atau memiliki role standar Approval Calibration. */
export function canUserAccessCalibrationSoyApproval(user: ManagedUser | null | undefined): boolean {
  if (!user) return false;
  if (hasExplicitSoyCalibrationRole(user)) return true;
  if (
    user.calibrationRoleByUnit &&
    typeof user.calibrationRoleByUnit === "object" &&
    Object.values(user.calibrationRoleByUnit).some((v) => v === "approver" || v === "mengetahui" || v === "readonly")
  ) {
    return true;
  }
  if (isDirectorRoleOrGrouping(user)) return true;
  return canRoleAccessCalibrationApproval(user.role);
}

/** Menentukan peran ("approver" | "mengetahui" | "readonly" | "") user pada suatu Unit Usaha di /approvals/calibration/setting. */
export function getSoyCalibrationRoleForUnit(
  user: ManagedUser | null | undefined,
  unitName: string,
): CalibrationUnitRole {
  if (!user) return "";
  const canonUnit = canonicalizeCompanyUnitName(unitName);
  if (user.soyCalibrationRoleByUnit && typeof user.soyCalibrationRoleByUnit === "object") {
    const values = Object.values(user.soyCalibrationRoleByUnit);
    const hasConfigured = values.some((v) => v === "approver" || v === "mengetahui" || v === "readonly");
    if (hasConfigured) {
      return user.soyCalibrationRoleByUnit[canonUnit] ?? user.soyCalibrationRoleByUnit[unitName] ?? "";
    }
    if (Object.keys(user.soyCalibrationRoleByUnit).length > 0 && !isAdminOrHrIcfRole(user.role)) {
      return "";
    }
  }
  if (!canRoleAccessCalibrationApproval(user.role)) return "";
  return getCalibrationRoleForUnit(user, canonUnit);
}

/** Mengembalikan daftar Unit Usaha yang dapat dilihat/ditindak pada /approvals/calibration/setting oleh user tsb. */
export function getSoyCalibrationInvolvedUnits(
  user: ManagedUser | null | undefined,
  allUnitNames: string[],
): string[] {
  if (!user) return [];
  if (user.soyCalibrationRoleByUnit && typeof user.soyCalibrationRoleByUnit === "object") {
    const keys = Object.keys(user.soyCalibrationRoleByUnit);
    const hasConfigured = Object.values(user.soyCalibrationRoleByUnit).some(
      (v) => v === "approver" || v === "mengetahui" || v === "readonly",
    );
    if (hasConfigured) {
      return allUnitNames.filter((u) => {
        const canon = canonicalizeCompanyUnitName(u);
        const r = user.soyCalibrationRoleByUnit?.[canon] ?? user.soyCalibrationRoleByUnit?.[u];
        return r === "approver" || r === "mengetahui" || r === "readonly";
      });
    }
    if (keys.length > 0 && !isAdminOrHrIcfRole(user.role)) {
      return [];
    }
  }
  if (!canRoleAccessCalibrationApproval(user.role)) return [];
  return getCalibrationInvolvedUnits(user, allUnitNames);
}
