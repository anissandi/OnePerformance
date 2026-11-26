import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, Filter, Pencil, PlayCircle, RotateCcw, Search, ShieldCheck, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import {
  canonicalizeCompanyUnitName,
  canUserAccessEmployeeData,
  getGroupNameForUnit,
  isAdminOrHrIcfRole,
  isUserEligibleForDelegation,
  loadManagedUsers,
  normalizeApproverPair,
  resolveEffectiveUserGrouping,
  saveManagedUsers,
  useAuthStore,
  type ManagedUser,
} from "../../store/authStore";
import {
  ALL_TAKE_OVER_MODULE_KEYS,
  DELEGATION_EVENT,
  blankDelegation,
  loadDelegations,
  loadTakeOvers,
  saveDelegation,
  saveTakeOver,
  type DelegationAccess,
  type DelegationRecord,
  type TakeOverModuleKey,
  type TakeOverRecord,
} from "../../store/delegationStore";
import { pushEmployeeNotification } from "../../store/notificationStore";

const lc = (v?: string) => String(v ?? "").trim().toLowerCase();
const findByRef = (users: ManagedUser[], ref?: string) =>
  ref ? users.find((u) => lc(u.regNo) === lc(ref) || lc(u.employeeId) === lc(ref)) : undefined;

function useLiveData() {
  const { activeUser, allUsers } = useAuthStore();
  const [delegations, setDelegations] = useState(() => loadDelegations());
  const [takeOvers, setTakeOvers] = useState(() => loadTakeOvers());
  useEffect(() => {
    const r = () => {
      setDelegations(loadDelegations());
      setTakeOvers(loadTakeOvers());
    };
    window.addEventListener(DELEGATION_EVENT, r);
    window.addEventListener("pa-db-hydrated", r);
    return () => {
      window.removeEventListener(DELEGATION_EVENT, r);
      window.removeEventListener("pa-db-hydrated", r);
    };
  }, []);
  const activeUsers = useMemo(() => allUsers.filter((u) => u.status === "Active"), [allUsers]);
  const userByRefMap = useMemo(() => {
    const m = new Map<string, ManagedUser>();
    for (const u of activeUsers) {
      if (u.employeeId) m.set(lc(u.employeeId), u);
      if (u.regNo) m.set(lc(u.regNo), u);
    }
    return m;
  }, [activeUsers]);
  return { activeUser, allUsers: activeUsers, userByRefMap, delegations, takeOvers };
}

function uniqSorted(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "id"),
  );
}

function OrgFilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  unitOptions,
  divisionOptions,
  departmentOptions,
  sectionOptions,
  positionOptions,
  unitFilter,
  onUnitChange,
  divisionFilter,
  onDivisionChange,
  departmentFilter,
  onDepartmentChange,
  sectionFilter,
  onSectionChange,
  positionFilter,
  onPositionChange,
  onReset,
  hideSectionFilter = false,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  unitOptions: string[];
  divisionOptions: string[];
  departmentOptions: string[];
  sectionOptions?: string[];
  positionOptions: string[];
  unitFilter: string;
  onUnitChange: (v: string) => void;
  divisionFilter: string;
  onDivisionChange: (v: string) => void;
  departmentFilter: string;
  onDepartmentChange: (v: string) => void;
  sectionFilter?: string;
  onSectionChange?: (v: string) => void;
  positionFilter: string;
  onPositionChange: (v: string) => void;
  onReset: () => void;
  hideSectionFilter?: boolean;
}) {
  const hasFilter = Boolean(
    search || unitFilter || divisionFilter || departmentFilter || (!hideSectionFilter && sectionFilter) || positionFilter,
  );
  const selectCls =
    "h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none focus:border-[#1A284F]";
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-xs outline-none focus:border-[#1A284F]"
        />
      </div>
      <div className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500">
        <Filter className="h-3.5 w-3.5 text-gray-400" />
        <span>Filter:</span>
      </div>
      <select value={unitFilter} onChange={(e) => onUnitChange(e.target.value)} className={selectCls} aria-label="Filter Unit Usaha">
        <option value="">Semua Unit Usaha</option>
        {unitOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <select value={divisionFilter} onChange={(e) => onDivisionChange(e.target.value)} className={selectCls} aria-label="Filter Divisi">
        <option value="">Semua Divisi</option>
        {divisionOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <select value={departmentFilter} onChange={(e) => onDepartmentChange(e.target.value)} className={selectCls} aria-label="Filter Departemen">
        <option value="">Semua Departemen</option>
        {departmentOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {!hideSectionFilter && (
        <select value={sectionFilter ?? ""} onChange={(e) => onSectionChange?.(e.target.value)} className={selectCls} aria-label="Filter Bagian">
          <option value="">Semua Bagian</option>
          {(sectionOptions ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      <select value={positionFilter} onChange={(e) => onPositionChange(e.target.value)} className={selectCls} aria-label="Filter Jabatan">
        <option value="">Semua Jabatan</option>
        {positionOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {hasFilter && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}

/** Pencarian karyawan (dropdown Portal bebas terpotong tabel) untuk kolom Delegasi Kepada & Edit Approver. */
function EmployeePicker({
  value,
  options,
  lookupMap,
  disabled,
  placeholder = "Pilih karyawan…",
  onChange,
}: {
  value: string;
  options: ManagedUser[];
  lookupMap?: Map<string, ManagedUser>;
  disabled?: boolean;
  placeholder?: string;
  onChange: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 288 });

  const normVal = lc(value);
  const selected =
    (normVal && lookupMap ? lookupMap.get(normVal) : undefined) ??
    (normVal ? options.find((u) => lc(u.employeeId) === normVal || (u.regNo && lc(u.regNo) === normVal)) : undefined);
  const list = useMemo(() => {
    if (!open) return [];
    const query = lc(q);
    if (!query) return options.slice(0, 50);
    const out: ManagedUser[] = [];
    for (const u of options) {
      if (
        lc(u.name).includes(query) ||
        lc(u.employeeId).includes(query) ||
        lc(u.regNo).includes(query) ||
        lc(u.position).includes(query)
      ) {
        out.push(u);
        if (out.length >= 50) break;
      }
    }
    return out;
  }, [open, options, q]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = Math.max(288, rect.width);
      const estHeight = 290;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < estHeight && rect.top > estHeight
          ? Math.max(8, rect.top - estHeight - 6)
          : rect.bottom + 4;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - panelWidth - 12));
      setCoords({ top, left, width: panelWidth });
    };
    updatePosition();
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative min-w-[210px]">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-xs hover:border-[#1A284F]/40 disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "font-medium text-gray-800" : value ? "text-gray-700" : "text-gray-400"}`}>
          {selected ? selected.name : value ? value : placeholder}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          {(selected || value) && !disabled && (
            <X
              className="h-3.5 w-3.5 text-gray-400 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ top: coords.top, left: coords.left, width: coords.width }}
            className="fixed z-[9999] rounded-xl border border-gray-200 bg-white p-2 shadow-2xl"
          >
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama / ID Karyawan / jabatan…"
                className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-xs outline-none focus:border-[#1A284F]"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {list.map((u) => (
                <button
                  key={u.employeeId}
                  type="button"
                  onClick={() => {
                    onChange(u.employeeId);
                    setOpen(false);
                    setQ("");
                  }}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[#1A284F]/5 ${
                    lc(u.employeeId) === lc(value) ? "bg-blue-50/70" : ""
                  }`}
                >
                  <span className="font-semibold text-gray-800">{u.name}</span>
                  <span className="block text-[10px] text-gray-500">
                    {u.employeeId} · {u.position || "-"} · {u.division || "-"}
                  </span>
                </button>
              ))}
              {list.length === 0 && (
                <p className="py-3 text-center text-xs text-gray-400">Tidak ada karyawan yang memenuhi kriteria</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const ACCESS_KEYS: Array<[keyof DelegationAccess, string]> = [
  ["view", "View"],
  ["create", "Create"],
  ["edit", "Edit"],
  ["delete", "Delete"],
  ["approve", "Approve"],
];

type DelegationModuleField = "kpiSetting" | "kpiTracking" | "smartGoalsSetting" | "smartGoalsMeasurement";

const DELEGATION_MODULE_COLUMNS: Array<{
  key: DelegationModuleField;
  header: string;
  tagLabel: string;
  activeCls: string;
  inactiveCls: string;
}> = [
  {
    key: "kpiSetting",
    header: "KPI Setting",
    tagLabel: "KPI Setting",
    activeCls: "border-blue-300 bg-blue-100/90 text-blue-800 ring-1 ring-blue-200/70 shadow-2xs",
    inactiveCls: "border-blue-200/60 bg-blue-50/40 text-slate-400 hover:border-blue-300 hover:bg-blue-50/90 hover:text-blue-700",
  },
  {
    key: "kpiTracking",
    header: "KPI Tracking",
    tagLabel: "KPI Tracking",
    activeCls: "border-cyan-300 bg-cyan-100/90 text-cyan-800 ring-1 ring-cyan-200/70 shadow-2xs",
    inactiveCls: "border-cyan-200/60 bg-cyan-50/40 text-slate-400 hover:border-cyan-300 hover:bg-cyan-50/90 hover:text-cyan-700",
  },
  {
    key: "smartGoalsSetting",
    header: "SMART Goals Setting",
    tagLabel: "SMART Goals Setting",
    activeCls: "border-emerald-300 bg-emerald-100/90 text-emerald-800 ring-1 ring-emerald-200/70 shadow-2xs",
    inactiveCls: "border-emerald-200/60 bg-emerald-50/40 text-slate-400 hover:border-emerald-300 hover:bg-emerald-50/90 hover:text-emerald-700",
  },
  {
    key: "smartGoalsMeasurement",
    header: "SMART Goals Measurement",
    tagLabel: "SMART Goals Measurement",
    activeCls: "border-amber-300 bg-amber-100/90 text-amber-800 ring-1 ring-amber-200/70 shadow-2xs",
    inactiveCls: "border-amber-200/60 bg-amber-50/40 text-slate-400 hover:border-amber-300 hover:bg-amber-50/90 hover:text-amber-700",
  },
];

const ACCESS_TAG_THEMES: Record<keyof DelegationAccess, { active: string; inactive: string }> = {
  view: {
    active: "border-sky-300 bg-sky-100/90 text-sky-800 ring-1 ring-sky-200/70 shadow-2xs",
    inactive: "border-slate-200 bg-slate-50/80 text-slate-400 hover:border-sky-200 hover:bg-sky-50/70 hover:text-sky-700",
  },
  create: {
    active: "border-emerald-300 bg-emerald-100/90 text-emerald-800 ring-1 ring-emerald-200/70 shadow-2xs",
    inactive: "border-slate-200 bg-slate-50/80 text-slate-400 hover:border-emerald-200 hover:bg-emerald-50/70 hover:text-emerald-700",
  },
  edit: {
    active: "border-amber-300 bg-amber-100/90 text-amber-800 ring-1 ring-amber-200/70 shadow-2xs",
    inactive: "border-slate-200 bg-slate-50/80 text-slate-400 hover:border-amber-200 hover:bg-amber-50/70 hover:text-amber-700",
  },
  delete: {
    active: "border-rose-300 bg-rose-100/90 text-rose-800 ring-1 ring-rose-200/70 shadow-2xs",
    inactive: "border-slate-200 bg-slate-50/80 text-slate-400 hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-700",
  },
  approve: {
    active: "border-teal-300 bg-teal-100/90 text-teal-800 ring-1 ring-teal-200/70 shadow-2xs",
    inactive: "border-slate-200 bg-slate-50/80 text-slate-400 hover:border-teal-200 hover:bg-teal-50/70 hover:text-teal-700",
  },
};

/**
 * Tabel Delegation (dipakai di Settings → Approval Management dan Approvals → Delegation).
 * Hanya karyawan ber-grouping Ka./Wa.Ka.Bagian ke atas yang boleh memberi & menerima delegasi.
 * Kandidat penerima delegasi hanya dari Unit Usaha pemberi delegasi dan bukan ber-role Employee.
 */
function getHierarchyRankForTakeOver(u: ManagedUser): number {
  const r = String(u.role ?? "").trim();
  const g = resolveEffectiveUserGrouping(u).toLowerCase();
  if (r === "BOD") return 7;
  if (r === "Director" || r === "DirectorNonOpr" || g.includes("direktur") || g.includes("director")) return 6;
  if (r === "GM" || r === "VGM" || r === "vGM" || g === "gm / vgm") return 5;
  if (r === "Division" || g.includes("ka./wa.ka.div")) return 4;
  if (r === "Departement" || g.includes("ka./wa.ka.dept")) return 3;
  if (r === "Supervisor" || r === "Coordinator" || r === "HR Unit" || g.includes("ka./wa.ka.bagian") || g.includes("ka./wa.ka.seksi")) return 2;
  return 1; // Employee / Operasional (tidak dapat di-Take Over)
}

function isEligibleSubordinateForTakeOver(sub: ManagedUser): boolean {
  // Minimal level bawahan yang bisa di-take over adalah role Supervisor (bukan Employee / Operasional murni)
  if (sub.role === "Employee" && getHierarchyRankForTakeOver(sub) < 2) return false;
  return getHierarchyRankForTakeOver(sub) >= 2;
}

const TAKE_OVER_MODULE_OPTIONS: Array<{ key: TakeOverModuleKey; label: string }> = [
  { key: "kpiSetting", label: "KPI Setting" },
  { key: "kpiTracking", label: "KPI Tracking" },
  { key: "smartGoalsSetting", label: "SMART Setting" },
  { key: "smartGoalsMeasurement", label: "SMART Meas." },
  { key: "appraisalForm", label: "Appraisal Form" },
  { key: "managerialSkill", label: "Managerial Skill" },
  { key: "project", label: "Project OJS" },
  { key: "feedback", label: "Feedback" },
];

export function DelegationTable({ mode = "settings" }: { mode?: "settings" | "approvals" } = {}) {
  const { activeUser, allUsers, userByRefMap, delegations, takeOvers } = useLiveData();
  const isAdmin = isAdminOrHrIcfRole(activeUser.role);
  const [subMode, setSubMode] = useState<"delegation" | "takeover">("delegation");
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [selectedSelfSubId, setSelectedSelfSubId] = useState<string>("");
  const [selfReasonDraft, setSelfReasonDraft] = useState<string>("");
  const [selfTakeOverModules, setSelfTakeOverModules] = useState<TakeOverModuleKey[]>(() => [...ALL_TAKE_OVER_MODULE_KEYS]);
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    setPage(1);
  }, [subMode, search, unitFilter, divisionFilter, departmentFilter, positionFilter, pageSize]);

  // Precompute O(1) maps once per allUsers change so rendering is instantaneous (< 2ms)
  const precomputed = useMemo(() => {
    const canonCompanyByEmp = new Map<string, string>();
    const rankByEmp = new Map<string, number>();
    const eligibleDelegatorSet = new Set<string>();
    const delegatesByCompany = new Map<string, ManagedUser[]>();
    const superiorsByCompany = new Map<string, ManagedUser[]>();

    for (const u of allUsers) {
      const idKey = lc(u.employeeId);
      const canonComp = canonicalizeCompanyUnitName(u.company);
      canonCompanyByEmp.set(idKey, canonComp);
      const rank = getHierarchyRankForTakeOver(u);
      rankByEmp.set(idKey, rank);
      const isElig = isUserEligibleForDelegation(u);
      if (isElig) {
        eligibleDelegatorSet.add(idKey);
        if (u.role !== "Employee") {
          const arr = delegatesByCompany.get(canonComp) ?? [];
          arr.push(u);
          delegatesByCompany.set(canonComp, arr);
        }
      }
      if (rank >= 3 || isAdminOrHrIcfRole(u.role)) {
        const sArr = superiorsByCompany.get(canonComp) ?? [];
        sArr.push(u);
        superiorsByCompany.set(canonComp, sArr);
      }
    }
    return { canonCompanyByEmp, rankByEmp, eligibleDelegatorSet, delegatesByCompany, superiorsByCompany };
  }, [allUsers]);

  // O(N) single-pass authority scope set for non-admin viewers
  const accessibleEmpIdSet = useMemo(() => {
    if (isAdmin) return null;
    const set = new Set<string>();
    const viewerId = lc(activeUser.employeeId);
    const viewerReg = lc(activeUser.regNo);
    const viewerComp = canonicalizeCompanyUnitName(activeUser.company);
    const viewerGroup = getGroupNameForUnit(viewerComp);
    const viewerRank = precomputed.rankByEmp.get(viewerId) ?? getHierarchyRankForTakeOver(activeUser);
    set.add(viewerId);
    for (const u of allUsers) {
      const uid = lc(u.employeeId);
      if (uid === viewerId) continue;
      const ap1 = lc(u.regNoAp1);
      const ap2 = lc(u.regNoAp2);
      if ((ap1 && (ap1 === viewerId || (viewerReg && ap1 === viewerReg))) || (ap2 && (ap2 === viewerId || (viewerReg && ap2 === viewerReg)))) {
        set.add(uid);
        continue;
      }
      const uComp = precomputed.canonCompanyByEmp.get(uid) ?? canonicalizeCompanyUnitName(u.company);
      if (viewerRank >= 6 && getGroupNameForUnit(uComp) === viewerGroup) {
        set.add(uid);
      } else if (viewerRank === 5 && uComp === viewerComp) {
        set.add(uid);
      } else if (viewerRank === 4 && uComp === viewerComp && lc(u.division) === lc(activeUser.division)) {
        set.add(uid);
      } else if (viewerRank === 3 && uComp === viewerComp && lc(u.department) === lc(activeUser.department)) {
        set.add(uid);
      } else if (viewerRank === 2 && uComp === viewerComp && lc(u.department) === lc(activeUser.department) && lc(u.bagian) === lc(activeUser.bagian)) {
        set.add(uid);
      } else if (canUserAccessEmployeeData(activeUser, u.employeeId, allUsers)) {
        set.add(uid);
      }
    }
    return set;
  }, [activeUser, allUsers, isAdmin, precomputed]);

  const isSelf = (u: ManagedUser) => lc(u.employeeId) === lc(activeUser.employeeId);

  const basePool = useMemo(() => {
    if (mode === "approvals") {
      const own = allUsers.find((u) => isSelf(u));
      return own ? [own] : activeUser.employeeId ? [activeUser] : [];
    }
    return allUsers.filter((u) => {
      const uid = lc(u.employeeId);
      if (!precomputed.eligibleDelegatorSet.has(uid)) return false;
      if (isAdmin) return true;
      return accessibleEmpIdSet ? accessibleEmpIdSet.has(uid) : isSelf(u);
    });
  }, [allUsers, activeUser, isAdmin, mode, precomputed, accessibleEmpIdSet]);
  const unitOptions = useMemo(() => uniqSorted(basePool.map((u) => u.company)), [basePool]);
  const divisionOptions = useMemo(
    () => uniqSorted(basePool.filter((u) => !unitFilter || u.company === unitFilter).map((u) => u.division)),
    [basePool, unitFilter],
  );
  const departmentOptions = useMemo(
    () =>
      uniqSorted(
        basePool
          .filter((u) => (!unitFilter || u.company === unitFilter) && (!divisionFilter || u.division === divisionFilter))
          .map((u) => u.department),
      ),
    [basePool, unitFilter, divisionFilter],
  );
  const positionOptions = useMemo(
    () =>
      uniqSorted(
        basePool
          .filter(
            (u) =>
              (!unitFilter || u.company === unitFilter) &&
              (!divisionFilter || u.division === divisionFilter) &&
              (!departmentFilter || u.department === departmentFilter),
          )
          .map((u) => u.position),
      ),
    [basePool, unitFilter, divisionFilter, departmentFilter],
  );

  const rows = useMemo(() => {
    const q = lc(search);
    return basePool
      .filter((u) => !unitFilter || u.company === unitFilter)
      .filter((u) => !divisionFilter || u.division === divisionFilter)
      .filter((u) => !departmentFilter || u.department === departmentFilter)
      .filter((u) => !positionFilter || u.position === positionFilter)
      .filter(
        (u) =>
          !q ||
          lc(u.name).includes(q) ||
          lc(u.employeeId).includes(q) ||
          lc(u.regNo).includes(q) ||
          lc(u.company).includes(q) ||
          lc(u.division).includes(q) ||
          lc(u.department).includes(q) ||
          lc(u.position).includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [basePool, unitFilter, divisionFilter, departmentFilter, positionFilter, search]);

  const pagedDelegationRows = useMemo(
    () => (mode === "approvals" ? rows : rows.slice((page - 1) * pageSize, page * pageSize)),
    [rows, mode, page, pageSize],
  );

  function update(user: ManagedUser, patch: Partial<DelegationRecord>, action: string) {
    const base = delegations[user.employeeId.toUpperCase()] ?? blankDelegation(user.employeeId);
    const next = { ...base, ...patch };
    if (next.delegateEmployeeId && lc(next.delegateEmployeeId) === lc(user.employeeId)) {
      toast.error("Delegasi tidak boleh kepada diri sendiri.");
      return;
    }
    const saved = saveDelegation(next, activeUser, action);
    const becameActive = saved.active && saved.delegateEmployeeId && (!base.active || base.delegateEmployeeId !== saved.delegateEmployeeId);
    const becameStopped = base.active && !saved.active && Boolean(base.delegateEmployeeId);
    if (becameActive) {
      const mods = [
        saved.kpiSetting && "KPI Setting",
        saved.kpiTracking && "KPI Tracking",
        saved.smartGoalsSetting && "SMART Goals Setting",
        saved.smartGoalsMeasurement && "SMART Goals Measurement",
      ]
        .filter(Boolean)
        .join(", ");
      const perms = ACCESS_KEYS.filter(([k]) => saved.access?.[k]).map(([, lbl]) => lbl).join(", ");
      const targetRoute = saved.kpiSetting
        ? "/setting/kpi"
        : saved.kpiTracking
        ? "/measurement/kpi-tracking"
        : saved.smartGoalsSetting
        ? "/setting/smart-goals"
        : saved.smartGoalsMeasurement
        ? "/measurement/smart-goals"
        : "/approvals";
      pushEmployeeNotification({
        employeeIds: [saved.delegateEmployeeId],
        title: "Anda Ditunjuk sebagai Penerima Delegasi",
        summary: `Anda menerima delegasi atas nama ${user.name} untuk modul: ${mods || "-"} (Akses: ${perms || "-"}).`,
        category: "Approval",
        moduleName: "Delegation",
        ctaLabel: "Buka Modul Delegasi",
        ctaRoute: targetRoute,
        senderName: activeUser.name,
      });
    } else if (becameStopped) {
      const prevMods = [
        base.kpiSetting && "KPI Setting",
        base.kpiTracking && "KPI Tracking",
        base.smartGoalsSetting && "SMART Goals Setting",
        base.smartGoalsMeasurement && "SMART Goals Measurement",
      ]
        .filter(Boolean)
        .join(", ");
      pushEmployeeNotification({
        employeeIds: [base.delegateEmployeeId],
        title: "Penugasan Delegasi Dihentikan",
        summary: `Penugasan delegasi Anda atas nama ${user.name} untuk modul ${prevMods || "Performance Appraisal"} telah dihentikan oleh ${activeUser.name}.`,
        category: "Approval",
        moduleName: "Delegation",
        senderName: activeUser.name,
      });
    }
  }

  // Pool bawahan yang dapat di-Take Over (minimal role Supervisor ke atas & berada di bawah wewenang atasan)
  const takeOverSubordinates = useMemo(() => {
    const viewerId = lc(activeUser.employeeId);
    const viewerRank = precomputed.rankByEmp.get(viewerId) ?? getHierarchyRankForTakeOver(activeUser);
    const q = lc(search);
    return allUsers
      .filter((sub) => {
        const subId = lc(sub.employeeId);
        if (subId === viewerId) return false;
        if (!isEligibleSubordinateForTakeOver(sub)) return false;
        if (mode === "settings" && isAdmin) return true;
        const subRank = precomputed.rankByEmp.get(subId) ?? getHierarchyRankForTakeOver(sub);
        if (viewerRank <= subRank) return false;
        return accessibleEmpIdSet ? accessibleEmpIdSet.has(subId) : false;
      })
      .filter((u) => mode === "approvals" || !unitFilter || u.company === unitFilter)
      .filter((u) => mode === "approvals" || !divisionFilter || u.division === divisionFilter)
      .filter((u) => mode === "approvals" || !departmentFilter || u.department === departmentFilter)
      .filter((u) => mode === "approvals" || !positionFilter || u.position === positionFilter)
      .filter(
        (u) =>
          mode === "approvals" ||
          !q ||
          lc(u.name).includes(q) ||
          lc(u.employeeId).includes(q) ||
          lc(u.regNo).includes(q) ||
          lc(u.company).includes(q) ||
          lc(u.division).includes(q) ||
          lc(u.department).includes(q) ||
          lc(u.position).includes(q) ||
          lc(u.role).includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, activeUser, isAdmin, mode, precomputed, accessibleEmpIdSet, unitFilter, divisionFilter, departmentFilter, positionFilter, search]);

  const pagedTakeOverSubordinates = useMemo(
    () => takeOverSubordinates.slice((page - 1) * pageSize, page * pageSize),
    [takeOverSubordinates, page, pageSize],
  );

  const myActiveTakeOvers = useMemo(() => {
    const myId = lc(activeUser.employeeId);
    return Object.values(takeOvers)
      .filter((t) => t.active && lc(t.takeOverByEmployeeId) === myId)
      .map((rec) => ({
        rec,
        sub: userByRefMap.get(lc(rec.subordinateEmployeeId)),
      }));
  }, [takeOvers, activeUser.employeeId, userByRefMap]);

  const activeTakeOverCountBadge = useMemo(() => {
    if (mode === "approvals") return myActiveTakeOvers.length;
    return Object.values(takeOvers).filter((t) => t.active).length;
  }, [mode, myActiveTakeOvers.length, takeOvers]);

  function handleUpdateTakeOver(
    sub: ManagedUser,
    nextTakeOverByEmpId: string,
    nextActive: boolean,
    reasonText?: string,
    customModules?: TakeOverModuleKey[],
  ) {
    const key = sub.employeeId.toUpperCase();
    const prev = takeOvers[key];
    const resolvedModules =
      customModules ?? (Array.isArray(prev?.modules) && prev.modules.length > 0 ? prev.modules : [...ALL_TAKE_OVER_MODULE_KEYS]);
    if (nextActive && resolvedModules.length === 0) {
      toast.error("Pilih minimal 1 modul approval yang ingin di-Take Over.");
      return;
    }
    if (nextActive && !nextTakeOverByEmpId) {
      toast.error("Pilih Atasan Pengambil Alih (Take Over Oleh) terlebih dahulu.");
      return;
    }
    if (nextTakeOverByEmpId && lc(nextTakeOverByEmpId) === lc(sub.employeeId)) {
      toast.error("Tidak dapat melakukan Take Over ke orang yang sama.");
      return;
    }
    const superiorUser = allUsers.find((u) => lc(u.employeeId) === lc(nextTakeOverByEmpId));
    if (superiorUser && getHierarchyRankForTakeOver(superiorUser) <= getHierarchyRankForTakeOver(sub) && !isAdminOrHrIcfRole(superiorUser.role)) {
      toast.error("Pengambil alih (Take Over) harus memiliki level jabatan/role di atas bawahan terkait.");
      return;
    }
    const rec: TakeOverRecord = {
      id: key,
      subordinateEmployeeId: sub.employeeId,
      takeOverByEmployeeId: nextTakeOverByEmpId,
      reason: reasonText ?? prev?.reason ?? "",
      modules: resolvedModules,
      active: nextActive,
      updatedAt: prev?.updatedAt ?? "",
      updatedBy: prev?.updatedBy ?? "",
      history: prev?.history ?? [],
    };
    const saved = saveTakeOver(rec, activeUser, nextActive ? "Start Take Over" : "Stop Take Over");
    if (nextActive && (!prev?.active || prev.takeOverByEmployeeId !== saved.takeOverByEmployeeId)) {
      pushEmployeeNotification({
        employeeIds: [sub.employeeId, saved.takeOverByEmployeeId],
        title: "Take Over Peran Approval Aktif",
        summary: `${superiorUser?.name || saved.takeOverByEmployeeId} mengambil alih sementara peran Approval & Assessment milik ${sub.name}${saved.reason ? ` (${saved.reason})` : ""}.`,
        category: "Approval",
        moduleName: "Delegation",
        ctaLabel: "Buka Approvals",
        ctaRoute: "/approvals",
        senderName: activeUser.name,
      });
      toast.success(`Take Over peran approval ${sub.name} oleh ${superiorUser?.name || saved.takeOverByEmployeeId} diaktifkan.`);
    } else if (!nextActive && prev?.active) {
      toast.success(`Take Over untuk ${sub.name} dihentikan.`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-Tabs: Delegasi Approval vs Take Over Bawahan */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2.5">
        <button
          type="button"
          onClick={() => setSubMode("delegation")}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            subMode === "delegation"
              ? "bg-[#2F5597] text-white border-[#2F5597] shadow-2xs"
              : "bg-[#EBF2FA]/70 text-[#2F5597] border-[#C9DCF0] hover:bg-[#EBF2FA]"
          }`}
        >
          <UserCog className="h-3.5 w-3.5" />
          Delegasi Approval
        </button>
        <button
          type="button"
          onClick={() => setSubMode("takeover")}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            subMode === "takeover"
              ? "bg-[#248277] text-white border-[#248277] shadow-2xs"
              : "bg-[#E6F3F1]/70 text-[#1D6863] border-[#B8DDD8] hover:bg-[#E6F3F1]"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Take Over Approval
          {activeTakeOverCountBadge > 0 && (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-extrabold text-[#1D6863]">
              {activeTakeOverCountBadge} Aktif
            </span>
          )}
        </button>
      </div>

      {subMode === "takeover" ? (
        mode === "approvals" ? (
          <>
            <div className="flex items-start gap-2 rounded-2xl border border-[#B8DDD8] bg-[#F4FAF9] px-4 py-3 text-xs text-[#1D6863]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Take Over Approval:</strong> Pilih bawahan Anda (minimal level <strong>Supervisor</strong> ke atas) yang peran Approval &amp; Assessment-nya ingin Anda ambil alih sementara, isi alasan, lalu klik <strong>Start</strong>.
              </span>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-[#1A284F] text-white">
                  <tr>
                    {[
                      "No",
                      "Aksi",
                      "Reg No",
                      "ID Karyawan",
                      "Nama Karyawan (Pengambil Alih)",
                      "Unit Usaha",
                      "Divisi / Departemen",
                      "Jabatan",
                      "Pilih Bawahan yang Di-Take Over",
                      "Modul Approval yang Di-Take Over",
                      "Alasan / Keterangan",
                      "Bawahan Sedang Di-Take Over",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100 bg-white">
                    <td className="px-3 py-3">1</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        disabled={!selectedSelfSubId}
                        onClick={() => {
                          const subUser = userByRefMap.get(lc(selectedSelfSubId));
                          if (!subUser) {
                            toast.error("Pilih bawahan yang akan di-Take Over terlebih dahulu.");
                            return;
                          }
                          handleUpdateTakeOver(subUser, activeUser.employeeId, true, selfReasonDraft, selfTakeOverModules);
                          setSelectedSelfSubId("");
                          setSelfReasonDraft("");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#248277] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                        title="Aktifkan Take Over Approval untuk bawahan terpilih"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Start
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{activeUser.regNo || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-[#1A284F]">{activeUser.employeeId}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900">{activeUser.name}</td>
                    <td className="whitespace-nowrap px-3 py-3">{activeUser.company}</td>
                    <td className="px-3 py-3">{activeUser.division || "-"} · {activeUser.department || "-"}</td>
                    <td className="px-3 py-3">{activeUser.position || "-"}</td>
                    <td className="px-3 py-3 min-w-[230px]">
                      <EmployeePicker
                        value={selectedSelfSubId}
                        options={takeOverSubordinates.filter(
                          (s) => !myActiveTakeOvers.some((m) => lc(m.rec.subordinateEmployeeId) === lc(s.employeeId)),
                        )}
                        lookupMap={userByRefMap}
                        placeholder={takeOverSubordinates.length > 0 ? "Pilih bawahan…" : "Tidak ada bawahan eligible"}
                        disabled={takeOverSubordinates.length === 0}
                        onChange={setSelectedSelfSubId}
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[250px]">
                      <div className="flex flex-wrap gap-1">
                        {TAKE_OVER_MODULE_OPTIONS.map((opt) => {
                          const checked = selfTakeOverModules.includes(opt.key);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() =>
                                setSelfTakeOverModules((prev) =>
                                  prev.includes(opt.key) ? prev.filter((k) => k !== opt.key) : [...prev, opt.key],
                                )
                              }
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer ${
                                checked
                                  ? "bg-[#E6F3F1] text-[#1D6863] border-[#8ECEC7]"
                                  : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-[190px]">
                      <input
                        type="text"
                        value={selfReasonDraft}
                        onChange={(e) => setSelfReasonDraft(e.target.value)}
                        placeholder="Mis. Sakit / Cuti mendadak..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#1A284F]"
                      />
                    </td>
                    <td className="px-3 py-3 min-w-[240px]">
                      {myActiveTakeOvers.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Belum ada bawahan yang di-Take Over</span>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {myActiveTakeOvers.map(({ rec, sub }) => (
                            <div
                              key={rec.id}
                              className="inline-flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-1"
                            >
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold text-[#1D6863] truncate">
                                  {sub?.name || rec.subordinateEmployeeId} ({sub?.role || "-"})
                                </p>
                                <p className="text-[10px] text-teal-700/80 truncate">
                                  {(rec.modules?.length ?? 8) >= TAKE_OVER_MODULE_OPTIONS.length
                                    ? "Semua Modul Approval"
                                    : TAKE_OVER_MODULE_OPTIONS.filter((o) => rec.modules?.includes(o.key)).map((o) => o.label).join(", ")}
                                </p>
                                {rec.reason && <p className="text-[10px] text-slate-500 truncate">{rec.reason}</p>}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sub) {
                                    handleUpdateTakeOver(sub, activeUser.employeeId, false, rec.reason);
                                  } else {
                                    saveTakeOver({ ...rec, active: false }, activeUser, "Stop Take Over");
                                    toast.success("Take Over dihentikan.");
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 shrink-0 cursor-pointer"
                              >
                                <Ban className="h-3 w-3" /> Stop
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
        <>
          <div className="flex items-start gap-2 rounded-2xl border border-[#B8DDD8] bg-[#F4FAF9] px-4 py-3 text-xs text-[#1D6863]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Take Over Approval (Pengaturan Admin / Wewenang):</strong> Daftar seluruh karyawan ber-level minimal <strong>Supervisor</strong> ke atas yang dapat diambil alih sementara peran Approval &amp; Assessment-nya oleh atasan sesuai struktur wewenang.
            </span>
          </div>
          <OrgFilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cari nama bawahan (min. Supervisor), ID, divisi, departemen…"
            unitOptions={uniqSorted(allUsers.map((u) => u.company))}
            divisionOptions={uniqSorted(allUsers.map((u) => u.division))}
            departmentOptions={uniqSorted(allUsers.map((u) => u.department))}
            positionOptions={uniqSorted(allUsers.map((u) => u.position))}
            unitFilter={unitFilter}
            onUnitChange={(v) => { setUnitFilter(v); setDivisionFilter(""); setDepartmentFilter(""); setPositionFilter(""); }}
            divisionFilter={divisionFilter}
            onDivisionChange={(v) => { setDivisionFilter(v); setDepartmentFilter(""); setPositionFilter(""); }}
            departmentFilter={departmentFilter}
            onDepartmentChange={(v) => { setDepartmentFilter(v); setPositionFilter(""); }}
            positionFilter={positionFilter}
            onPositionChange={setPositionFilter}
            onReset={() => { setSearch(""); setUnitFilter(""); setDivisionFilter(""); setDepartmentFilter(""); setPositionFilter(""); }}
            hideSectionFilter
          />
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-[#1A284F] text-white">
                <tr>
                  {[
                    "No",
                    "Aksi",
                    "ID Karyawan",
                    "Nama Bawahan",
                    "Role",
                    "Unit Usaha",
                    "Divisi / Departemen",
                    "Jabatan",
                    "Di-Take Over Oleh (Atasan)",
                    "Modul Approval",
                    "Alasan / Keterangan",
                    "Status",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedTakeOverSubordinates.map((sub, idx) => {
                  const rec = takeOvers[sub.employeeId.toUpperCase()];
                  const isAct = Boolean(rec?.active);
                  const effectiveSuperiorId = rec?.takeOverByEmployeeId || "";
                  const subIdKey = lc(sub.employeeId);
                  const subRank = precomputed.rankByEmp.get(subIdKey) ?? getHierarchyRankForTakeOver(sub);
                  const subComp = precomputed.canonCompanyByEmp.get(subIdKey) ?? canonicalizeCompanyUnitName(sub.company);
                  const superiorCandidates = (precomputed.superiorsByCompany.get(subComp) ?? []).filter(
                    (cand) =>
                      lc(cand.employeeId) !== subIdKey &&
                      (precomputed.rankByEmp.get(lc(cand.employeeId)) ?? 0) > subRank,
                  );
                  const reasonVal = reasonDrafts[sub.employeeId] ?? rec?.reason ?? "";
                  return (
                    <tr key={sub.employeeId} className={`border-t border-gray-100 transition-colors ${isAct ? "bg-teal-50/50" : "hover:bg-slate-50/60"}`}>
                      <td className="px-3 py-2.5">{(page - 1) * pageSize + idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateTakeOver(
                              sub,
                              effectiveSuperiorId,
                              !isAct,
                              reasonVal,
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                            isAct
                              ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                              : "bg-[#248277] text-white hover:opacity-90"
                          }`}
                        >
                          {isAct ? <Ban className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                          {isAct ? "Stop" : "Take Over"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-[#1A284F]">{sub.employeeId}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-gray-900">{sub.name}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">{sub.role}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{sub.company}</td>
                      <td className="px-3 py-2.5">{sub.division || "-"} · {sub.department || "-"}</td>
                      <td className="px-3 py-2.5">{sub.position || "-"}</td>
                      <td className="px-3 py-2.5">
                          <EmployeePicker
                            value={effectiveSuperiorId}
                            options={superiorCandidates}
                            lookupMap={userByRefMap}
                            onChange={(empId) => handleUpdateTakeOver(sub, empId, Boolean(empId && isAct), reasonVal)}
                          />
                      </td>
                      <td className="px-3 py-2.5 min-w-[230px]">
                        <div className="flex flex-wrap gap-1">
                          {TAKE_OVER_MODULE_OPTIONS.map((opt) => {
                            const curMods = rec?.modules?.length ? rec.modules : ALL_TAKE_OVER_MODULE_KEYS;
                            const checked = curMods.includes(opt.key);
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => {
                                  const nextMods = checked
                                    ? curMods.filter((k) => k !== opt.key)
                                    : [...curMods, opt.key];
                                  if (nextMods.length === 0) {
                                    toast.warning("Minimal 1 modul harus tetap dipilih.");
                                    return;
                                  }
                                  if (rec || effectiveSuperiorId) {
                                    handleUpdateTakeOver(sub, effectiveSuperiorId, isAct, reasonVal, nextMods);
                                  }
                                }}
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold transition-colors cursor-pointer ${
                                  checked
                                    ? "bg-[#E6F3F1] text-[#1D6863] border-[#8ECEC7]"
                                    : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 min-w-[180px]">
                        <input
                          type="text"
                          value={reasonVal}
                          onChange={(e) => setReasonDrafts((p) => ({ ...p, [sub.employeeId]: e.target.value }))}
                          onBlur={() => {
                            if (rec && reasonVal !== (rec.reason ?? "")) {
                              handleUpdateTakeOver(sub, effectiveSuperiorId, isAct, reasonVal);
                            }
                          }}
                          placeholder="Mis. Sakit / Cuti mendadak..."
                          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#1A284F]"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {isAct ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            Aktif Di-Take Over
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {takeOverSubordinates.length === 0 && (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-gray-400">
                      Tidak ada bawahan ber-level Supervisor ke atas dalam cakupan wewenang Anda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {takeOverSubordinates.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
                >
                  {[15, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>entries · Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, takeOverSubordinates.length)} dari {takeOverSubordinates.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="px-2 font-semibold">Hal. {page} / {Math.max(1, Math.ceil(takeOverSubordinates.length / pageSize))}</span>
                <button
                  type="button"
                  disabled={page >= Math.ceil(takeOverSubordinates.length / pageSize)}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
        )
      ) : (
      <>
      {mode === "approvals" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 text-xs text-sky-900">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Atur delegasi milik Anda sendiri: pilih karyawan penerima delegasi pada kolom <strong>Delegasi Kepada</strong>,
            klik tag modul &amp; tag hak akses untuk memilih atau menonaktifkan, lalu klik <strong>Start</strong>.
          </span>
        </div>
      ) : (
      <OrgFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama, ID Karyawan, divisi, jabatan…"
        unitOptions={unitOptions}
        divisionOptions={divisionOptions}
        departmentOptions={departmentOptions}
        positionOptions={positionOptions}
        unitFilter={unitFilter}
        onUnitChange={(v) => { setUnitFilter(v); setDivisionFilter(""); setDepartmentFilter(""); setPositionFilter(""); }}
        divisionFilter={divisionFilter}
        onDivisionChange={(v) => { setDivisionFilter(v); setDepartmentFilter(""); setPositionFilter(""); }}
        departmentFilter={departmentFilter}
        onDepartmentChange={(v) => { setDepartmentFilter(v); setPositionFilter(""); }}
        positionFilter={positionFilter}
        onPositionChange={setPositionFilter}
        onReset={() => { setSearch(""); setUnitFilter(""); setDivisionFilter(""); setDepartmentFilter(""); setPositionFilter(""); }}
        hideSectionFilter
      />
      )}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#1A284F] text-white">
            <tr>
              {[
                "No",
                "Aksi",
                "Reg No",
                "ID Karyawan",
                "Nama Karyawan",
                "Unit Usaha",
                "Divisi",
                "Departemen",
                "Jabatan",
                "Delegasi Kepada",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{h}</th>
              ))}
              {DELEGATION_MODULE_COLUMNS.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">{col.header}</th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Hak Akses</th>
            </tr>
          </thead>
          <tbody>
            {pagedDelegationRows.map((u, i) => {
              const d = delegations[u.employeeId.toUpperCase()] ?? blankDelegation(u.employeeId);
              const canStart =
                Boolean(d.delegateEmployeeId) &&
                (d.kpiSetting || d.kpiTracking || d.smartGoalsSetting || d.smartGoalsMeasurement);
              const uComp = precomputed.canonCompanyByEmp.get(lc(u.employeeId)) ?? canonicalizeCompanyUnitName(u.company);
              const rowOptions = (precomputed.delegatesByCompany.get(uComp) ?? []).filter(
                (c) => lc(c.employeeId) !== lc(u.employeeId),
              );
              return (
                <tr key={u.employeeId} className={`border-t border-gray-100 transition-colors ${d.active ? "bg-emerald-50/40" : "hover:bg-slate-50/60"}`}>
                  <td className="px-3 py-2">{mode === "approvals" ? i + 1 : (page - 1) * pageSize + i + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!d.active && !canStart}
                      title={d.active ? "Hentikan delegasi (Stop)" : canStart ? "Mulai delegasi (Start)" : "Pilih Delegasi Kepada & aktifkan minimal 1 tag modul"}
                      onClick={() => update(u, { active: !d.active }, d.active ? "Stop delegation" : "Start delegation")}
                      className={`rounded-lg p-1.5 disabled:opacity-30 ${d.active ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                    >
                      {d.active ? <Ban className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{u.regNo || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#1A284F]">{u.employeeId}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">{u.name}</td>
                  <td className="whitespace-nowrap px-3 py-2">{u.company}</td>
                  <td className="px-3 py-2">{u.division || "-"}</td>
                  <td className="px-3 py-2">{u.department || "-"}</td>
                  <td className="px-3 py-2">{u.position || "-"}</td>
                  <td className="px-3 py-2">
                    <EmployeePicker
                      value={d.delegateEmployeeId}
                      options={rowOptions}
                      lookupMap={userByRefMap}
                      onChange={(id) => update(u, { delegateEmployeeId: id, active: id ? d.active : false }, "Set Delegation To")}
                    />
                  </td>
                  {DELEGATION_MODULE_COLUMNS.map((col) => {
                    const active = Boolean(d[col.key]);
                    return (
                      <td key={col.key} className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => update(u, { [col.key]: !active }, `Toggle ${col.key}`)}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                            active ? col.activeCls : col.inactiveCls
                          }`}
                        >
                          {active ? (
                            <Check className="h-3 w-3 shrink-0 stroke-[2.5]" />
                          ) : (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                          )}
                          <span>{col.tagLabel}</span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <div className="flex flex-nowrap items-center gap-1.5">
                      {ACCESS_KEYS.map(([k, label]) => {
                        const active = Boolean(d.access?.[k]);
                        const theme = ACCESS_TAG_THEMES[k];
                        return (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={active}
                            onClick={() => update(u, { access: { ...d.access, [k]: !active } }, `Toggle access ${k}`)}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer select-none ${
                              active ? theme.active : theme.inactive
                            }`}
                          >
                            {active ? (
                              <Check className="h-3 w-3 shrink-0 stroke-[2.5]" />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                            )}
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={15} className="py-10 text-center text-gray-400">Tidak ada karyawan yang sesuai filter dalam cakupan Anda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {mode === "settings" && rows.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
            >
              {[15, 20, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>entries · Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} dari {rows.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 font-semibold">Hal. {page} / {Math.max(1, Math.ceil(rows.length / pageSize))}</span>
            <button
              type="button"
              disabled={page >= Math.ceil(rows.length / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-gray-500">
        Klik tag modul (<strong>KPI Setting</strong>, <strong>KPI Tracking</strong>, <strong>SMART Goals Setting</strong>,{" "}
        <strong>SMART Goals Measurement</strong>) serta tag <strong>Hak Akses</strong> untuk memilih atau menonaktifkan pilihan.
        Delegasi aktif membuat karyawan yang ditunjuk menerima akses modul, notifikasi, serta task approval sesuai tag modul yang aktif (tag <strong>Approve</strong> wajib aktif untuk persetujuan),
        dan nama approver tercatat sebagai <strong>"Nama Delegasi | atas nama Nama Pemberi Delegasi"</strong>.
      </p>
      </>
      )}
    </div>
  );
}

/** Tab Approver Monitoring: AP1 & AP2 seluruh karyawan, dengan View & Edit. */
export function ApproverMonitoringTable() {
  const { allUsers, userByRefMap } = useLiveData();
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [view, setView] = useState<ManagedUser | null>(null);
  const [edit, setEdit] = useState<ManagedUser | null>(null);
  const [ap1, setAp1] = useState("");
  const [ap2, setAp2] = useState("");
  const [monPageSize, setMonPageSize] = useState<number>(25);
  const [monPage, setMonPage] = useState<number>(1);

  useEffect(() => {
    setMonPage(1);
  }, [search, unitFilter, divisionFilter, departmentFilter, sectionFilter, positionFilter, monPageSize]);

  const unitOptions = useMemo(() => uniqSorted(allUsers.map((u) => u.company)), [allUsers]);
  const divisionOptions = useMemo(
    () => uniqSorted(allUsers.filter((u) => !unitFilter || u.company === unitFilter).map((u) => u.division)),
    [allUsers, unitFilter],
  );
  const departmentOptions = useMemo(
    () =>
      uniqSorted(
        allUsers
          .filter((u) => (!unitFilter || u.company === unitFilter) && (!divisionFilter || u.division === divisionFilter))
          .map((u) => u.department),
      ),
    [allUsers, unitFilter, divisionFilter],
  );
  const sectionOptions = useMemo(
    () =>
      uniqSorted(
        allUsers
          .filter(
            (u) =>
              (!unitFilter || u.company === unitFilter) &&
              (!divisionFilter || u.division === divisionFilter) &&
              (!departmentFilter || u.department === departmentFilter),
          )
          .map((u) => u.bagian),
      ),
    [allUsers, unitFilter, divisionFilter, departmentFilter],
  );
  const positionOptions = useMemo(
    () =>
      uniqSorted(
        allUsers
          .filter(
            (u) =>
              (!unitFilter || u.company === unitFilter) &&
              (!divisionFilter || u.division === divisionFilter) &&
              (!departmentFilter || u.department === departmentFilter) &&
              (!sectionFilter || (u.bagian || "") === sectionFilter),
          )
          .map((u) => u.position),
      ),
    [allUsers, unitFilter, divisionFilter, departmentFilter, sectionFilter],
  );

  const rows = useMemo(() => {
    const q = lc(search);
    return allUsers
      .filter((u) => !unitFilter || u.company === unitFilter)
      .filter((u) => !divisionFilter || u.division === divisionFilter)
      .filter((u) => !departmentFilter || u.department === departmentFilter)
      .filter((u) => !sectionFilter || (u.bagian || "") === sectionFilter)
      .filter((u) => !positionFilter || u.position === positionFilter)
      .filter(
        (u) =>
          !q ||
          lc(u.name).includes(q) ||
          lc(u.employeeId).includes(q) ||
          lc(u.regNo).includes(q) ||
          lc(u.company).includes(q) ||
          lc(u.division).includes(q) ||
          lc(u.department).includes(q) ||
          lc(u.bagian).includes(q) ||
          lc(u.position).includes(q) ||
          lc(u.role).includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers, unitFilter, divisionFilter, departmentFilter, sectionFilter, positionFilter, search]);

  const pagedMonRows = useMemo(
    () => rows.slice((monPage - 1) * monPageSize, monPage * monPageSize),
    [rows, monPage, monPageSize],
  );

  const nameOf = (ref?: string) => {
    if (!ref || !ref.trim()) return "Belum ada approver";
    const u = userByRefMap.get(lc(ref));
    return u ? u.name : ref || "-";
  };
  function saveEdit() {
    if (!edit) return;
    const a1 = allUsers.find((u) => u.employeeId === ap1);
    const a2 = allUsers.find((u) => u.employeeId === ap2);
    const pair = normalizeApproverPair(
      a1 ? a1.regNo || a1.employeeId : "",
      a2 ? a2.regNo || a2.employeeId : "",
    );
    const changed: ManagedUser = { ...edit, regNoAp1: pair.regNoAp1, regNoAp2: pair.regNoAp2 };
    saveManagedUsers(loadManagedUsers().map((u) => (u.employeeId === edit.employeeId ? changed : u)), changed);
    toast.success(`Approver ${edit.name} diperbarui`);
    setEdit(null);
  }
  return (
    <div className="space-y-4">
      <OrgFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama, ID Karyawan, unit usaha, divisi, jabatan…"
        unitOptions={unitOptions}
        divisionOptions={divisionOptions}
        departmentOptions={departmentOptions}
        sectionOptions={sectionOptions}
        positionOptions={positionOptions}
        unitFilter={unitFilter}
        onUnitChange={(v) => { setUnitFilter(v); setDivisionFilter(""); setDepartmentFilter(""); setSectionFilter(""); setPositionFilter(""); }}
        divisionFilter={divisionFilter}
        onDivisionChange={(v) => { setDivisionFilter(v); setDepartmentFilter(""); setSectionFilter(""); setPositionFilter(""); }}
        departmentFilter={departmentFilter}
        onDepartmentChange={(v) => { setDepartmentFilter(v); setSectionFilter(""); setPositionFilter(""); }}
        sectionFilter={sectionFilter}
        onSectionChange={(v) => { setSectionFilter(v); setPositionFilter(""); }}
        positionFilter={positionFilter}
        onPositionChange={setPositionFilter}
        onReset={() => { setSearch(""); setUnitFilter(""); setDivisionFilter(""); setDepartmentFilter(""); setSectionFilter(""); setPositionFilter(""); }}
      />
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#1A284F] text-white">
            <tr>
              {[
                "No",
                "Aksi",
                "Reg No",
                "ID Karyawan",
                "Nama Karyawan",
                "Unit Usaha",
                "Divisi",
                "Departemen",
                "Bagian",
                "Jabatan",
                "Role",
                "Approver 1",
                "Approver 2",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedMonRows.map((u, i) => (
              <tr key={u.employeeId} className="border-t border-gray-100">
                <td className="px-3 py-2">{(monPage - 1) * monPageSize + i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" title="Lihat Detail" onClick={() => setView(u)} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50"><Eye className="h-4 w-4" /></button>
                    <button
                      type="button"
                      title="Edit Approver"
                      onClick={() => {
                        setEdit(u);
                        setAp1(u.regNoAp1 ? (userByRefMap.get(lc(u.regNoAp1))?.employeeId ?? "") : "");
                        setAp2(u.regNoAp2 ? (userByRefMap.get(lc(u.regNoAp2))?.employeeId ?? "") : "");
                      }}
                      className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2">{u.regNo || "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#1A284F]">{u.employeeId}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-800">{u.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{u.company}</td>
                <td className="px-3 py-2">{u.division || "-"}</td>
                <td className="px-3 py-2">{u.department || "-"}</td>
                <td className="px-3 py-2">{u.bagian || "-"}</td>
                <td className="px-3 py-2">{u.position || "-"}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{nameOf(u.regNoAp1)}</td>
                <td className="px-3 py-2">{nameOf(u.regNoAp2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="py-10 text-center text-gray-400">
                  Tidak ada data karyawan yang sesuai filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > monPageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={monPageSize}
              onChange={(e) => setMonPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold"
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>entries · Menampilkan {(monPage - 1) * monPageSize + 1}–{Math.min(monPage * monPageSize, rows.length)} dari {rows.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={monPage <= 1}
              onClick={() => setMonPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="px-2 font-semibold">Hal. {monPage} / {Math.max(1, Math.ceil(rows.length / monPageSize))}</span>
            <button
              type="button"
              disabled={monPage >= Math.ceil(rows.length / monPageSize)}
              onClick={() => setMonPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {(view || edit) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setView(null); setEdit(null); }}>
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {view && (
              <>
                <h3 className="text-lg font-bold text-[#1A284F]">{view.name}</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {[["ID Karyawan", view.employeeId], ["Reg No", view.regNo], ["Unit Usaha", view.company], ["Divisi", view.division], ["Departemen", view.department], ["Bagian", view.bagian], ["Jabatan", view.position], ["Role", view.role], ["Approver 1", nameOf(view.regNoAp1)], ["Approver 2", nameOf(view.regNoAp2)]].map(([k, v]) => (
                    <div key={k}><dt className="text-[10px] font-bold uppercase text-gray-400">{k}</dt><dd className="text-gray-800">{v || "-"}</dd></div>
                  ))}
                </dl>
                <div className="flex justify-end"><button onClick={() => setView(null)} className="rounded-xl border px-4 py-2 text-sm">Tutup</button></div>
              </>
            )}
            {edit && (
              <>
                <h3 className="text-lg font-bold text-[#1A284F]">Edit Approver · {edit.name}</h3>
                <label className="block text-xs font-bold text-gray-500">Approver 1
                  <div className="mt-1"><EmployeePicker value={ap1} options={allUsers.filter((u) => u.employeeId !== edit.employeeId)} lookupMap={userByRefMap} onChange={setAp1} /></div>
                </label>
                <label className="block text-xs font-bold text-gray-500">Approver 2
                  <div className="mt-1"><EmployeePicker value={ap2} options={allUsers.filter((u) => u.employeeId !== edit.employeeId)} lookupMap={userByRefMap} onChange={setAp2} /></div>
                </label>
                {ap1 && ap1 === ap2 && <p className="text-xs text-amber-700">Approver 1 & 2 sama — approval cukup dilakukan 1 kali.</p>}
                {((ap1 && !ap2) || (!ap1 && ap2)) && (
                  <p className="text-xs text-blue-700">Hanya satu approver dipilih — otomatis ditetapkan sebagai Approver 1 &amp; Approver 2.</p>
                )}
                {!ap1 && !ap2 && (
                  <p className="text-xs text-amber-700">Kedua approver kosong — karyawan berstatus belum ada approver.</p>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEdit(null)} className="rounded-xl border px-4 py-2 text-sm">Batal</button>
                  <button onClick={saveEdit} className="rounded-xl bg-[#1A284F] px-4 py-2 text-sm font-semibold text-white">Simpan</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
