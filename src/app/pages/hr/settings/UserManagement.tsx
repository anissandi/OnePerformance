// @refresh reset
import { useEffect, useMemo, useRef, useState } from "react";
import { archiveUsers } from "../../../store/archiveStore";
import { useRouteTab } from "../../../utils/useRouteTab";
import { DEFAULT_SCORE_WEIGHTS, loadUnitScoreWeights, SCORE_WEIGHT_EVENT, weightColumnFromGrouping } from "../../shared/scoringWeightStore";
import { loadLocalAuditLogs, syncToSupabase } from "../../../services/supabaseClient";
import { Eye, Edit2, RefreshCw, ChevronDown, Search, X, Save, Plus, Trash2, Users, Layers, Building2, ChevronRight, Check, KeyRound, Lock, ShieldAlert, CheckCircle2, RotateCcw, AlertTriangle, UserCheck, Shield, Award, Briefcase } from "lucide-react";
import {
  COMPANY_UNIT_LOCATIONS,
  KPI_BUSINESS_GROUP_SCOPE_TOKEN,
  canonicalizeCompanyUnitName,
  defaultAllowedModulesForGrouping,
  formatLastLoginDDMMYYYY,
  getActiveUser,
  getEffectiveCheckerUnits,
  isSameCompanyUnit,
  loadManagedUsers,
  loadUnitGroupRules,
  normalizeApproverPair,
  saveManagedUsers,
  saveUnitGroupRules,
  type ManagedUser,
} from "../../../store/authStore";
import { DatePickerID } from "../../../components/DatePickerID";
import { normalizeDateDDMMYYYY } from "../../../utils/dateFormat";
import { HIERARCHICAL_COMPANY_GROUPS, useAccessManagement } from "./AccessManagement";
import { loadCalibrationOrgOptions } from "../CalibrationSetting";
import {
  useLoginManagement,
  type LoginMethodOption,
} from "../../../store/loginManagementStore";
import { ANALYTICS_CARD_TONES, AnalyticsStatCard, type AnalyticsCardTone } from "../../../components/AnalyticsStatCard";

type Role = "Employee" | "Supervisor" | "GM" | "HR Unit" | "HR ICF" | "Director" | "BOD" | "Administrator" | "HR Admin" | "" | string;
type Status = "Active" | "Inactive";

type User = ManagedUser;

const COMPANIES: string[] = new Proxy([] as string[], {
  get(_target, prop) {
    const cur = COMPANY_UNIT_LOCATIONS.map((l) => l.company);
    if (prop === Symbol.iterator) return cur[Symbol.iterator].bind(cur);
    if (prop === "length") return cur.length;
    const val = Reflect.get(cur, prop);
    return typeof val === "function" ? val.bind(cur) : val;
  },
  ownKeys() {
    return Reflect.ownKeys(COMPANY_UNIT_LOCATIONS.map((l) => l.company));
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(COMPANY_UNIT_LOCATIONS.map((l) => l.company), prop);
  },
});
const GROUPINGS_SCORES = ["Operasional", "Ka./Wa.Ka.Seksi", "Ka./Wa.Ka.Bagian", "Ka./Wa.Ka.Dept", "Ka./Wa.Ka.Div ke atas", "Direktur / Director"];

const EMPLOYEE_STATUS_OPTIONS = ["Karyawan Baru", "Mutasi", "Promosi"] as const;

function initials(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return parts.slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase() || "U";
}

const AVATAR_COLORS = [
  "bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  "bg-yellow-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-600", "bg-sky-600",
];

function avatarColor(seed: string, fallbackName = ""): string {
  const str = String(seed || fallbackName || "user").trim();
  if (/^\d+$/.test(str)) {
    return AVATAR_COLORS[Math.abs(parseInt(str, 10)) % AVATAR_COLORS.length] || "bg-indigo-500";
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] || "bg-indigo-500";
}

const ROLE_BADGE: Record<string, string> = {
  "Employee":       "bg-emerald-50 text-emerald-700",
  "Supervisor":     "bg-blue-50 text-blue-700",
  "Departement":    "bg-cyan-50 text-cyan-800",
  "Division":       "bg-sky-50 text-sky-700",
  "VGM":            "bg-teal-50 text-teal-800",
  "vGM":            "bg-teal-50 text-teal-800",
  "Coordinator":    "bg-teal-50 text-teal-800",
  "GM":             "bg-indigo-50 text-indigo-700",
  "HR Unit":        "bg-purple-50 text-purple-700",
  "HR ICF":         "bg-amber-50 text-amber-700",
  "Director":       "bg-rose-50 text-rose-700",
  "DirectorNonOpr": "bg-pink-50 text-pink-800",
  "BOD":            "bg-red-50 text-red-700",
  "Administrator":  "bg-slate-100 text-slate-700",
};

function RoleBadge({ role }: { role: Role }) {
  if (!role) return <span className="text-gray-300">—</span>;
  const displayRole = role.trim().toLowerCase() === "vgm" ? "VGM" : role;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[displayRole] ?? "bg-gray-100 text-gray-600"}`}>{displayRole}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "Active" ? "bg-emerald-500" : "bg-red-400"}`} />
      {status}
    </span>
  );
}

// ─── View Modal ────────────────────────────────────────────────────────────────
function ViewModal({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        {/* Header strip */}
        <div className="bg-gradient-to-r from-[#1A284F] to-[#2a3d6e] rounded-t-2xl px-6 py-5 flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 ${avatarColor(user.id, user.name)}`}>
            {initials(user.name)}
          </div>
          <div className="text-white">
            <p className="font-semibold text-lg leading-tight">{user.name}</p>
            <p className="text-blue-200 text-sm">{user.position}</p>
            <p className="text-blue-300 text-xs mt-0.5">ID: {user.employeeId} · {user.grade}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-blue-200 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-4">
          {[
            { label: "Reg No", value: user.regNo || "—" },
            { label: "Email", value: user.email },
            { label: "No Telegram", value: user.telegramNo || "—" },
            { label: "Joindate", value: user.joinDate ? normalizeDateDDMMYYYY(user.joinDate) : "—" },
            { label: "Company", value: user.company },
            { label: "Division", value: user.division },
            { label: "Department", value: user.department },
            { label: "Bagian", value: user.bagian || "—" },
            { label: "Reg No AP1 (Approval 1)", value: user.regNoAp1 || "Belum ada approver" },
            { label: "Reg No AP2 (Approval 2)", value: user.regNoAp2 || "Belum ada approver" },
            { label: "Multi-Unit (Cakupan)", value: user.managedUnits?.length ? user.managedUnits.join(", ") : "—" },
            { label: "Multi-Divisi (Tambahan)", value: user.managedDivisions?.length ? user.managedDivisions.join(", ") : "—" },
            { label: "Multi-Departemen (Tambahan)", value: user.managedDepartments?.length ? user.managedDepartments.join(", ") : "—" },
            { label: "Multi-Bagian (Tambahan)", value: user.managedBagians?.length ? user.managedBagians.join(", ") : "—" },
            { label: "Role", value: <RoleBadge role={user.role} /> },
            { label: "Groupings", value: user.groupings },
            { label: "Status Karyawan", value: user.employeeStatus || "-" },
            ...(user.employeeStatus
              ? [
                  { label: "Keterangan Status Karyawan", value: user.employeeStatusNote || "-" },
                  { label: "Tgl Efektif", value: user.effectiveDate ? normalizeDateDDMMYYYY(user.effectiveDate) : "-" },
                ]
              : []),
            {
              label: "Checker KPI Business",
              value: user.isKpiBusinessChecker
                ? (user.kpiBusinessCheckerUnits?.length ? user.kpiBusinessCheckerUnits.join(", ") : "KPI Group & Semua Unit")
                : "—",
            },
            { label: "Status", value: <StatusBadge status={user.status} /> },
            { label: "Last Login", value: user.lastLogin || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-400 mb-0.5">{label}</p>
              <div className="text-sm font-medium text-gray-800">{value}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pb-5 text-right">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Multi-Select Checkbox Dropdown ───────────────────────────────────────────
function MultiCheckboxDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const mergedOptions = useMemo(() => {
    const set = new Set([...options, ...selected]);
    return Array.from(set).filter(Boolean);
  }, [options, selected]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mergedOptions;
    return mergedOptions.filter((o) => o.toLowerCase().includes(q));
  }, [mergedOptions, query]);

  const toggleItem = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((x) => x !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-[11px] font-medium text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-gray-300"
      >
        <span className={selected.length > 0 ? "text-gray-800 font-medium truncate pr-2" : "text-gray-400 truncate pr-2"}>
          {selected.length === 0
            ? placeholder
            : selected.length === 1
            ? selected[0]
            : `${selected.length} dipilih (${selected.join(", ")})`}
        </span>
        <ChevronDown size={13} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 flex items-center gap-1.5 bg-gray-50/60">
            <Search size={12} className="text-gray-400 shrink-0 ml-1" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari..."
              className="w-full text-xs bg-transparent outline-none text-gray-700"
            />
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] text-red-500 hover:underline shrink-0 px-1"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400 text-center">Tidak ditemukan</div>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleItem(opt)}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left hover:bg-indigo-50/60 transition-colors"
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        checked ? "bg-[#1A284F] border-[#1A284F]" : "border-gray-300 bg-white"
                      }`}
                    >
                      {checked && <Check size={10} className="text-white" />}
                    </span>
                    <span className={checked ? "font-semibold text-[#1A284F] truncate" : "text-gray-700 truncate"}>
                      {opt}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              <span className="truncate max-w-[140px]">{item}</span>
              <button
                type="button"
                onClick={() => toggleItem(item)}
                className="hover:text-indigo-950"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit / Add Modal ──────────────────────────────────────────────────────────
function EditModal({
  user,
  originalUser,
  mode,
  availableRoles,
  availableGroups,
  onClose,
  onSave,
}: {
  user: User | null;
  originalUser?: User | null;
  mode: "add" | "edit";
  availableRoles: Role[];
  availableGroups: string[];
  onClose: () => void;
  onSave: (u: User, originalUser?: User | null, mode?: "add" | "edit") => void;
}) {
  const isNew = mode === "add";
  const [form, setForm] = useState<User>(user ?? {
    id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, regNo: "", name: "", employeeId: "", position: "", company: COMPANIES[0],
    division: "", department: "", bagian: "", joinDate: "", telegramNo: "", grade: "Grade 5", role: "Employee",
    groupings: availableGroups[0] ?? GROUPINGS_SCORES[0], status: "Active", lastLogin: "", email: "", regNoAp1: "", regNoAp2: "",
    isHrUnitChecker: false, isHrIcfValidator: false,
    employeeStatus: "", employeeStatusNote: "", effectiveDate: "",
  });

  function f(key: keyof User, val: string) { setForm(p => ({ ...p, [key]: val })); }

  const multiScopeOrgOpts = useMemo(() => {
    const targetUnits =
      form.managedUnits && form.managedUnits.length > 0
        ? form.managedUnits
        : [form.company].filter(Boolean);
    const calOpts = loadCalibrationOrgOptions(targetUnits);
    const allUsers = loadManagedUsers().filter((u) => targetUnits.includes(u.company));

    const empDivs = Array.from(new Set(allUsers.map((u) => (u.division || "").trim()).filter(Boolean))).sort();
    const divisions = empDivs.length > 0 ? empDivs : calOpts.divisions;

    const selectedDivSet = new Set((form.managedDivisions ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean));
    const usersInSelectedDivs =
      selectedDivSet.size > 0
        ? allUsers.filter((u) => selectedDivSet.has((u.division || "").trim().toLowerCase()))
        : allUsers;
    const empDepts = Array.from(new Set(usersInSelectedDivs.map((u) => (u.department || "").trim()).filter(Boolean))).sort();
    const departments = empDepts.length > 0 ? empDepts : selectedDivSet.size > 0 ? [] : calOpts.departments;

    const selectedDeptSet = new Set((form.managedDepartments ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean));
    const usersInSelectedDepts =
      selectedDeptSet.size > 0
        ? usersInSelectedDivs.filter((u) => selectedDeptSet.has((u.department || "").trim().toLowerCase()))
        : usersInSelectedDivs;
    const empBags = Array.from(new Set(usersInSelectedDepts.map((u) => (u.bagian || "").trim()).filter(Boolean))).sort();
    const bagians = empBags.length > 0 ? empBags : (selectedDivSet.size > 0 || selectedDeptSet.size > 0) ? [] : calOpts.bagians;

    return { divisions, departments, bagians };
  }, [form.company, form.managedUnits, form.managedDivisions, form.managedDepartments]);

  type CalRoleOption = "approver" | "mengetahui" | "readonly" | "";
  const calRoleMap: Record<string, CalRoleOption> = form.calibrationRoleByUnit ?? {};
  const soyRoleMap: Record<string, CalRoleOption> = form.soyCalibrationRoleByUnit ?? {};
  const [formError, setFormError] = useState("");

  const allExistingUsers = useMemo(() => loadManagedUsers(), []);
  const isTargetOriginalUser = (candidate: User): boolean => {
    if (isNew || !originalUser) return candidate.id === form.id;
    if (candidate.id === originalUser.id && candidate.company === originalUser.company) return true;
    const origReg = String(originalUser.regNo ?? "").trim().toLowerCase();
    if (
      origReg &&
      candidate.company === originalUser.company &&
      String(candidate.regNo ?? "").trim().toLowerCase() === origReg
    ) {
      return true;
    }
    const origEmp = String(originalUser.employeeId ?? "").trim().toLowerCase();
    if (
      origEmp &&
      candidate.company === originalUser.company &&
      String(candidate.employeeId ?? "").trim().toLowerCase() === origEmp &&
      (!origReg || !String(candidate.regNo ?? "").trim())
    ) {
      return true;
    }
    return false;
  };
  const sameUnitDupRegUser = useMemo(() => {
    const effectiveReg = String(form.regNo || form.employeeId || "").trim().toLowerCase();
    if (!effectiveReg) return undefined;
    return allExistingUsers.find(
      (u) =>
        !isTargetOriginalUser(u) &&
        isSameCompanyUnit(u.company, form.company) &&
        String(u.regNo || u.employeeId || "").trim().toLowerCase() === effectiveReg,
    );
  }, [allExistingUsers, form.id, form.company, form.regNo, form.employeeId, isNew, originalUser]);
  const crossUnitDupRegPeers = useMemo(() => {
    const regClean = String(form.regNo || "").trim().toLowerCase();
    if (!regClean) return [];
    return allExistingUsers.filter(
      (u) =>
        !isTargetOriginalUser(u) &&
        !isSameCompanyUnit(u.company, form.company) &&
        String(u.regNo ?? "").trim().toLowerCase() === regClean,
    );
  }, [allExistingUsers, form.id, form.company, form.regNo, isNew, originalUser]);
  const dupEmpIdPeers = useMemo(() => {
    const empClean = String(form.employeeId ?? "").trim().toLowerCase();
    if (!empClean) return [];
    return allExistingUsers.filter(
      (u) => !isTargetOriginalUser(u) && u.employeeId.trim().toLowerCase() === empClean,
    );
  }, [allExistingUsers, form.id, form.employeeId, isNew, originalUser]);

  const setUnitCalRole = (unitName: string, val: CalRoleOption) => {
    setForm((p) => {
      const nextMap: Record<string, CalRoleOption> = {
        ...(p.calibrationRoleByUnit ?? {}),
        [unitName]: val,
      };
      const firstNonEmpty =
        Object.values(nextMap).find((v) => v === "approver" || v === "mengetahui" || v === "readonly") ?? "";
      return {
        ...p,
        calibrationRoleByUnit: nextMap,
        directorCalibrationRole: firstNonEmpty,
      };
    });
  };

  const setGroupCalRole = (units: readonly string[], val: CalRoleOption) => {
    setForm((p) => {
      const nextMap: Record<string, CalRoleOption> = {
        ...(p.calibrationRoleByUnit ?? {}),
      };
      for (const u of units) {
        nextMap[u] = val;
      }
      const firstNonEmpty =
        Object.values(nextMap).find((v) => v === "approver" || v === "mengetahui" || v === "readonly") ?? "";
      return {
        ...p,
        calibrationRoleByUnit: nextMap,
        directorCalibrationRole: firstNonEmpty,
      };
    });
  };

  const setUnitSoyRole = (unitName: string, val: CalRoleOption) => {
    setForm((p) => ({
      ...p,
      soyCalibrationRoleByUnit: {
        ...(p.soyCalibrationRoleByUnit ?? {}),
        [unitName]: val,
      },
    }));
  };

  const setGroupSoyRole = (units: readonly string[], val: CalRoleOption) => {
    setForm((p) => {
      const nextMap: Record<string, CalRoleOption> = {
        ...(p.soyCalibrationRoleByUnit ?? {}),
      };
      for (const u of units) {
        nextMap[u] = val;
      }
      return {
        ...p,
        soyCalibrationRoleByUnit: nextMap,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-lg">{isNew ? "Add New User" : "Edit User"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-6 grid grid-cols-2 gap-4">
          {formError && (
            <div className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {[
            { label: "Full Name", key: "name" as keyof User, type: "text" },
            { label: "Reg No", key: "regNo" as keyof User, type: "text" },
            { label: "Employee ID", key: "employeeId" as keyof User, type: "text" },
            { label: "Corporate Email", key: "email" as keyof User, type: "email" },
            { label: "No Telegram (OTP)", key: "telegramNo" as keyof User, type: "text" },
            { label: "Joindate", key: "joinDate" as keyof User, type: "date" },
            { label: "Position / Jabatan", key: "position" as keyof User, type: "text" },
            { label: "Division", key: "division" as keyof User, type: "text" },
            { label: "Department", key: "department" as keyof User, type: "text" },
            { label: "Bagian", key: "bagian" as keyof User, type: "text" },
            { label: "Reg No AP1 (Approval 1)", key: "regNoAp1" as keyof User, type: "text" },
            { label: "Reg No AP2 (Approval 2)", key: "regNoAp2" as keyof User, type: "text" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              {key === "joinDate" ? (
                <DatePickerID
                  value={form.joinDate ?? ""}
                  onChange={(val) => {
                    setFormError("");
                    f("joinDate", val);
                  }}
                  placeholder="DD/MM/YYYY"
                />
              ) : (
                <input
                  type={type}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                    key === "regNo" && sameUnitDupRegUser
                      ? "border-rose-400 bg-rose-50/40 focus:ring-rose-400"
                      : (key === "regNo" && crossUnitDupRegPeers.length > 0) ||
                        (key === "employeeId" && dupEmpIdPeers.length > 0)
                      ? "border-amber-300 bg-amber-50/30 focus:ring-amber-400"
                      : "border-gray-200 focus:ring-blue-500"
                  }`}
                  value={(form[key] as string) ?? ""}
                  onChange={e => {
                    setFormError("");
                    f(key, e.target.value);
                  }}
                />
              )}
              {key === "regNo" && sameUnitDupRegUser && (
                <p className="mt-1 text-[11px] font-medium text-rose-600">
                  Reg No duplikat di {form.company} dengan {sameUnitDupRegUser.name} ({sameUnitDupRegUser.employeeId}). Tidak diizinkan duplikat Reg No dalam 1 unit usaha.
                </p>
              )}
              {key === "regNo" && !sameUnitDupRegUser && crossUnitDupRegPeers.length > 0 && (
                <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                  <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Info: Reg No sama di unit usaha berbeda ({crossUnitDupRegPeers.map((p) => `${p.name} — ${p.company}`).join("; ")}). Diizinkan karena berbeda unit usaha.
                  </span>
                </div>
              )}
              {key === "employeeId" && dupEmpIdPeers.length > 0 && (
                <div className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                  <AlertTriangle size={12} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Info: ID Karyawan sama dengan {dupEmpIdPeers.map((p) => `${p.name} (Reg No: ${p.regNo || "—"}, ${p.company})`).join("; ")}. Diizinkan selama Reg No pada unit ini unik.
                  </span>
                </div>
              )}
            </div>
          ))}

          {(() => {
            const raw1 = String(form.regNoAp1 ?? "").trim();
            const raw2 = String(form.regNoAp2 ?? "").trim();
            const pair = normalizeApproverPair(raw1, raw2);
            const singleFilled = (Boolean(raw1) && !raw2) || (!raw1 && Boolean(raw2));
            return (
              <div className="col-span-2">
                {!pair.hasApprover ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800">
                    <strong>Belum ada approver:</strong> Reg No AP1 dan Reg No AP2 keduanya kosong.
                  </div>
                ) : singleFilled ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] text-blue-800">
                    Hanya satu Reg No terisi — otomatis ditetapkan sebagai <strong>Approver 1 &amp; Approver 2 ({pair.regNoAp1})</strong> saat disimpan.
                  </div>
                ) : pair.regNoAp1.toLowerCase() === pair.regNoAp2.toLowerCase() ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[11px] text-emerald-800">
                    Approver 1 &amp; Approver 2 menggunakan Reg No yang sama (<strong>{pair.regNoAp1}</strong>).
                  </div>
                ) : null}
              </div>
            );
          })()}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Company / Unit</label>
            <input readOnly value={form.company}
              className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
          </div>

          {[
            { label: "Role (from Access Management)", key: "role" as keyof User, options: ["", ...availableRoles], labels: { "": "— No Role —" } },
            { label: "Groupings Scores (from Access Management)", key: "groupings" as keyof User, options: availableGroups },
            { label: "Status",          key: "status"   as keyof User, options: ["Active", "Inactive"] },
          ].map(({ label, key, options, labels = {} }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form[key] as string} onChange={e => {
                  const v = e.target.value;
                  setForm(p => ({
                    ...p,
                    [key]: v,
                    ...(key === "role" && v === "HR Unit"
                      ? {
                          isHrUnitChecker: true,
                          checkerUnits:
                            p.checkerUnits && p.checkerUnits.length > 0
                              ? p.checkerUnits
                              : Array.from(new Set([p.company, ...(p.managedUnits ?? [])].filter(Boolean))),
                        }
                      : {}),
                    ...(key === "role" && (v === "HR ICF" || v === "Administrator") ? { isHrIcfValidator: true } : {}),
                  }));
                }}>
                {options.map(o => <option key={o} value={o}>{(labels as Record<string,string>)[o] ?? o}</option>)}
              </select>
            </div>
          ))}

          {/* DS-6: Status Karyawan + Kondisional Keterangan Status Karyawan & Tgl Efektif */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status Karyawan</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.employeeStatus ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setForm((p) => ({
                  ...p,
                  employeeStatus: v,
                  ...(v ? {} : { employeeStatusNote: "", effectiveDate: "" }),
                }));
              }}
            >
              <option value="">— Kosong (-) —</option>
              {Array.from(
                new Set([
                  ...EMPLOYEE_STATUS_OPTIONS,
                  ...(form.employeeStatus && !(EMPLOYEE_STATUS_OPTIONS as readonly string[]).includes(form.employeeStatus)
                    ? [form.employeeStatus]
                    : []),
                ]),
              ).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {Boolean(form.employeeStatus && String(form.employeeStatus).trim()) && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tgl Efektif (DD/MM/YYYY)</label>
                <DatePickerID
                  value={form.effectiveDate ?? ""}
                  onChange={(val) => f("effectiveDate", val)}
                  placeholder="DD/MM/YYYY"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Keterangan Status Karyawan</label>
                <input
                  type="text"
                  value={form.employeeStatusNote ?? ""}
                  onChange={(e) => f("employeeStatusNote", e.target.value)}
                  placeholder="Contoh: Promosi jabatan / Mutasi antar bagian / Karyawan baru..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="col-span-2 rounded-xl border border-gray-200 bg-slate-50/70 p-3.5 space-y-2">
            <p className="text-xs font-semibold text-[#1A284F]">Setup Fungsi Approval Khusus & Akses Role</p>
            <div className="flex flex-wrap gap-5 text-xs text-gray-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.isHrUnitChecker || form.role === "HR Unit")}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      isHrUnitChecker: e.target.checked,
                      role: e.target.checked && p.role === "Employee" ? "HR Unit" : p.role,
                      checkerUnits: e.target.checked
                        ? p.checkerUnits && p.checkerUnits.length > 0
                          ? p.checkerUnits
                          : Array.from(new Set([p.company, ...(p.managedUnits ?? [])].filter(Boolean)))
                        : [],
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span>
                  <strong>Approval Check HR Unit Usaha</strong> (Checker KPI & SMART Goals — dapat Lintas Unit Usaha; bypass otomatis untuk pengajuan milik sendiri)
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.isHrIcfValidator || form.role === "HR ICF" || form.role === "Administrator")}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      isHrIcfValidator: e.target.checked,
                      role: e.target.checked && (p.role === "Employee" || !p.role) ? "HR ICF" : p.role,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span>
                  <strong>Approval Validate HR ICF</strong> (Role HR ICF memiliki hak akses setara Administrator)
                </span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(form.isKpiBusinessChecker)}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      isKpiBusinessChecker: e.target.checked,
                      kpiBusinessCheckerUnits: e.target.checked
                        ? p.kpiBusinessCheckerUnits && p.kpiBusinessCheckerUnits.length > 0
                          ? p.kpiBusinessCheckerUnits
                          : [KPI_BUSINESS_GROUP_SCOPE_TOKEN, ...COMPANIES]
                        : [],
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span>
                  <strong>Approval Check KPI Business (KPI Group &amp; KPI Unit)</strong> (Checker khusus sebelum masuk ke Approver — otomatis memunculkan submenu KPI Business di /approvals/settings/kpi)
                </span>
              </label>
            </div>
            {(form.isHrUnitChecker || form.role === "HR Unit") && (
              <div className="pt-2.5 border-t border-gray-200 space-y-1.5">
                <MultiCheckboxDropdown
                  label="Unit Usaha yang Di-Allow untuk HR Checker (Lintas Unit Usaha)"
                  options={COMPANIES}
                  selected={
                    form.checkerUnits && form.checkerUnits.length > 0
                      ? form.checkerUnits
                      : Array.from(new Set([form.company, ...(form.managedUnits ?? [])].filter(Boolean)))
                  }
                  onChange={(next) => setForm((p) => ({ ...p, checkerUnits: next }))}
                  placeholder="— Pilih Unit Usaha Checker —"
                />
                <p className="text-[11px] text-gray-500">
                  Pilih satu atau lebih Company Unit yang dapat diperiksa (Check) dan dipantau di Analytics Dashboard oleh HR Checker ini.
                </p>
              </div>
            )}
            {Boolean(form.isKpiBusinessChecker) && (
              <div className="pt-2.5 border-t border-gray-200 space-y-1.5">
                <MultiCheckboxDropdown
                  label="Cakupan KPI Business yang Di-Allow untuk Checker Khusus"
                  options={[KPI_BUSINESS_GROUP_SCOPE_TOKEN, ...COMPANIES]}
                  selected={
                    form.kpiBusinessCheckerUnits && form.kpiBusinessCheckerUnits.length > 0
                      ? form.kpiBusinessCheckerUnits
                      : [KPI_BUSINESS_GROUP_SCOPE_TOKEN, ...COMPANIES]
                  }
                  onChange={(next) => setForm((p) => ({ ...p, kpiBusinessCheckerUnits: next }))}
                  placeholder="— Pilih KPI Group / Unit Usaha —"
                />
                <p className="text-[11px] text-gray-500">
                  User ini memiliki tombol <strong>Revision</strong> &amp; <strong>Checked</strong> pada menu <strong>/approvals/settings/kpi</strong>. Setelah menekan Checked, pengajuan otomatis diteruskan ke Approver selanjutnya.
                </p>
              </div>
            )}
            <div className="pt-2.5 border-t border-gray-200 space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start">
                {/* Kolom Kiri: Peran Approval Setting (SOY) */}
                <div className="rounded-xl border border-indigo-100 bg-white p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-bold text-[#1A284F]">Peran Approval Setting (SOY)</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Akses &amp; aksi pada <strong>/approvals/calibration/setting</strong> per Group &amp; Unit Usaha. User dari role mana pun yang di-allow di sini dapat mengakses sesuai perannya.
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {HIERARCHICAL_COMPANY_GROUPS.map((grp, gIdx) => {
                      const unitVals = grp.units.map((u) => soyRoleMap[u] ?? "");
                      const allSame = unitVals.every((v) => v === unitVals[0]);
                      const groupDropdownVal = allSame ? unitVals[0] : "";
                      return (
                        <div key={`soy-${grp.groupName}`} className="bg-slate-50/70 rounded-xl border border-gray-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-200/70">
                            <span className="text-xs font-bold text-[#1A284F]">
                              {gIdx + 1}. {grp.groupName}:
                            </span>
                            <select
                              value={groupDropdownVal}
                              onChange={(e) =>
                                setGroupSoyRole(grp.units, e.target.value as CalRoleOption)
                              }
                              className="border border-indigo-200 rounded-lg px-2 py-1 text-[11px] font-semibold bg-indigo-50/70 text-[#1A284F] focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Tidak Terlibat (Kosong) —</option>
                              <option value="approver">Approver</option>
                              <option value="mengetahui">Mengetahui</option>
                              <option value="readonly">Read Only</option>
                            </select>
                          </div>
                          <div className="space-y-1.5 pl-2">
                            {grp.units.map((unit) => {
                              const unitVal = soyRoleMap[unit] ?? "";
                              return (
                                <div key={`soy-u-${unit}`} className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-gray-700 truncate">
                                    - {unit}
                                  </span>
                                  <select
                                    value={unitVal}
                                    onChange={(e) =>
                                      setUnitSoyRole(unit, e.target.value as CalRoleOption)
                                    }
                                    className={`border rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0 ${
                                      unitVal === "approver"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold"
                                        : unitVal === "mengetahui"
                                        ? "border-sky-200 bg-sky-50 text-sky-800 font-semibold"
                                        : unitVal === "readonly"
                                        ? "border-violet-200 bg-violet-50 text-violet-800 font-semibold"
                                        : "border-gray-200 bg-white text-gray-400"
                                    }`}
                                  >
                                    <option value="">— Kosong —</option>
                                    <option value="approver">Approver</option>
                                    <option value="mengetahui">Mengetahui</option>
                                    <option value="readonly">Read Only</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Kolom Kanan: Peran Approval Calibration (EOY) */}
                <div className="rounded-xl border border-indigo-100 bg-white p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-bold text-[#1A284F]">Peran Approval Calibration (EOY)</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Akses &amp; aksi pada <strong>/approvals/calibration/adjustment</strong> per Group &amp; Unit Usaha. Memilih pada baris Group mengisi seluruh unit di dalamnya.
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {HIERARCHICAL_COMPANY_GROUPS.map((grp, gIdx) => {
                      const unitVals = grp.units.map((u) => calRoleMap[u] ?? "");
                      const allSame = unitVals.every((v) => v === unitVals[0]);
                      const groupDropdownVal = allSame ? unitVals[0] : "";
                      return (
                        <div key={`eoy-${grp.groupName}`} className="bg-slate-50/70 rounded-xl border border-gray-200 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-200/70">
                            <span className="text-xs font-bold text-[#1A284F]">
                              {gIdx + 1}. {grp.groupName}:
                            </span>
                            <select
                              value={groupDropdownVal}
                              onChange={(e) =>
                                setGroupCalRole(grp.units, e.target.value as CalRoleOption)
                              }
                              className="border border-indigo-200 rounded-lg px-2 py-1 text-[11px] font-semibold bg-indigo-50/70 text-[#1A284F] focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— Tidak Terlibat (Kosong) —</option>
                              <option value="approver">Approver</option>
                              <option value="mengetahui">Mengetahui</option>
                              <option value="readonly">Read Only</option>
                            </select>
                          </div>
                          <div className="space-y-1.5 pl-2">
                            {grp.units.map((unit) => {
                              const unitVal = calRoleMap[unit] ?? "";
                              return (
                                <div key={`eoy-u-${unit}`} className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-gray-700 truncate">
                                    - {unit}
                                  </span>
                                  <select
                                    value={unitVal}
                                    onChange={(e) =>
                                      setUnitCalRole(unit, e.target.value as CalRoleOption)
                                    }
                                    className={`border rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0 ${
                                      unitVal === "approver"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold"
                                        : unitVal === "mengetahui"
                                        ? "border-sky-200 bg-sky-50 text-sky-800 font-semibold"
                                        : unitVal === "readonly"
                                        ? "border-violet-200 bg-violet-50 text-violet-800 font-semibold"
                                        : "border-gray-200 bg-white text-gray-400"
                                    }`}
                                  >
                                    <option value="">— Kosong —</option>
                                    <option value="approver">Approver</option>
                                    <option value="mengetahui">Mengetahui</option>
                                    <option value="readonly">Read Only</option>
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-[#1A284F]">
                Cakupan Wewenang Berjenjang Tambahan (Multi-Scope: Unit / Divisi / Departemen / Bagian)
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Opsional: Jika ceklist Unit Usaha dipilih maka seluruh karyawan di Unit Usaha tersebut akan terlihat; jika ditambah ceklist Divisi maka otomatis difilter sesuai Divisi di Unit Usaha tersebut; dan jika ditambah Departemen / Bagian maka otomatis difilter sesuai Departemen / Bagian dari Divisi &amp; Unit Usaha tersebut.
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] font-semibold text-gray-500 mr-0.5">Pilih Cepat Group:</span>
                {HIERARCHICAL_COMPANY_GROUPS.map((grp) => {
                  const currentSelected = form.managedUnits ?? [];
                  const allGroupChecked =
                    grp.units.length > 0 &&
                    grp.units.every((gu) => currentSelected.some((su) => isSameCompanyUnit(su, gu)));
                  return (
                    <button
                      key={`ms-grp-${grp.groupName}`}
                      type="button"
                      onClick={() => {
                        setForm((p) => {
                          const prev = p.managedUnits ?? [];
                          const next = allGroupChecked
                            ? prev.filter((su) => !grp.units.some((gu) => isSameCompanyUnit(su, gu)))
                            : Array.from(
                                new Set([
                                  ...prev.map((x) => canonicalizeCompanyUnitName(x)),
                                  ...grp.units.map((x) => canonicalizeCompanyUnitName(x)),
                                ]),
                              ).filter(Boolean);
                          return { ...p, managedUnits: next };
                        });
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        allGroupChecked
                          ? "bg-[#1A284F] text-white border-[#1A284F]"
                          : "bg-white text-[#1A284F] border-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {allGroupChecked ? `✓ ${grp.groupName} (${grp.units.length} Unit)` : `+ ${grp.groupName} (${grp.units.length} Unit)`}
                    </button>
                  );
                })}
                {(form.managedUnits?.length ||
                  form.managedDivisions?.length ||
                  form.managedDepartments?.length ||
                  form.managedBagians?.length) ? (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        managedUnits: [],
                        managedDivisions: [],
                        managedDepartments: [],
                        managedBagians: [],
                      }))
                    }
                    className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 transition-colors"
                  >
                    Reset Cakupan
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MultiCheckboxDropdown
                label="Unit Usaha"
                options={COMPANIES}
                selected={form.managedUnits ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedUnits: next }))}
                placeholder="— Pilih Unit Usaha —"
              />
              <MultiCheckboxDropdown
                label="Divisi"
                options={multiScopeOrgOpts.divisions}
                selected={form.managedDivisions ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedDivisions: next }))}
                placeholder="— Pilih Divisi —"
              />
              <MultiCheckboxDropdown
                label="Departemen"
                options={multiScopeOrgOpts.departments}
                selected={form.managedDepartments ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedDepartments: next }))}
                placeholder="— Pilih Departemen —"
              />
              <MultiCheckboxDropdown
                label="Bagian"
                options={multiScopeOrgOpts.bagians}
                selected={form.managedBagians ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedBagians: next }))}
                placeholder="— Pilih Bagian —"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={Boolean(sameUnitDupRegUser)}
            title={
              sameUnitDupRegUser
                ? `Tidak dapat menyimpan: Reg No duplikat pada unit ${form.company}`
                : undefined
            }
            onClick={() => {
              const trimmedName = String(form.name ?? "").trim();
              const trimmedEmpId = String(form.employeeId ?? "").trim();
              if (!trimmedName) {
                setFormError("Full Name wajib diisi.");
                return;
              }
              if (!trimmedEmpId) {
                setFormError("Employee ID wajib diisi.");
                return;
              }
              const effectiveRegNo = String(form.regNo || trimmedEmpId || "").trim();
              const conflictReg = loadManagedUsers().find(
                (u) =>
                  !isTargetOriginalUser(u) &&
                  isSameCompanyUnit(u.company, form.company) &&
                  String(u.regNo || u.employeeId || "").trim().toLowerCase() === effectiveRegNo.toLowerCase() &&
                  effectiveRegNo !== "",
              );
              if (conflictReg) {
                setFormError(
                  `Reg No "${effectiveRegNo}" sudah terdaftar pada ${conflictReg.name} (${conflictReg.employeeId}) di unit ${form.company}. Reg No tidak boleh sama dalam 1 unit usaha.`,
                );
                return;
              }
              const ap = normalizeApproverPair(form.regNoAp1, form.regNoAp2);
              const cleanEmpStatus = String(form.employeeStatus ?? "").trim();
              onSave({
                ...form,
                name: trimmedName,
                employeeId: trimmedEmpId,
                regNo: effectiveRegNo,
                email: String(form.email ?? "").trim(),
                telegramNo: String(form.telegramNo ?? "").trim(),
                position: String(form.position ?? "").trim(),
                division: String(form.division ?? "").trim(),
                department: String(form.department ?? "").trim(),
                bagian: String(form.bagian ?? "").trim(),
                joinDate: String(form.joinDate ?? "").trim(),
                regNoAp1: ap.regNoAp1,
                regNoAp2: ap.regNoAp2,
                employeeStatus: cleanEmpStatus,
                employeeStatusNote: cleanEmpStatus ? String(form.employeeStatusNote ?? "").trim() : "",
                effectiveDate: cleanEmpStatus ? String(form.effectiveDate ?? "").trim() : "",
              }, originalUser, mode);
              onClose();
            }}
            className="px-4 py-2 text-sm bg-[#1A284F] text-white rounded-lg hover:bg-[#2a3d6e] disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Save size={14} /> {isNew ? "Add User" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ user, users: bulkUsers, onClose, onConfirm }: { user?: User; users?: User[]; onClose: () => void; onConfirm: (reason: string) => void }) {
  const targets = bulkUsers && bulkUsers.length > 0 ? bulkUsers : user ? [user] : [];
  const isBulk = targets.length > 1;
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">{isBulk ? `Delete / Archive ${targets.length} User` : "Delete User"}</h2>
            <p className="text-sm text-gray-500">User akan dipindahkan ke menu Archive dan dapat di-restore.</p>
          </div>
        </div>
        {isBulk ? (
          <div className="mb-3">
            <p className="text-sm text-gray-600 mb-2">Hapus <strong>{targets.length} user</strong> berikut dari User Management? Karyawan tidak dapat login sampai di-restore dari Archive.</p>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
              {targets.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="font-medium text-gray-700 truncate">{t.name}</span>
                  <span className="text-gray-400 shrink-0 ml-2">{t.employeeId}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 mb-3">Hapus <strong>{targets[0]?.name}</strong> (ID: {targets[0]?.employeeId}) dari User Management? Karyawan tidak dapat login sampai di-restore dari Archive.</p>
        )}
        <label className="block text-xs font-semibold text-gray-600 mb-1">Keterangan Delete <span className="text-red-500">*</span></label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Contoh: Resign per 30 Juni 2026"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-300 resize-none mb-5"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!reason.trim()}
            onClick={() => { onConfirm(reason.trim()); onClose(); }}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete &amp; Archive
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User Groupings Scores ─────────────────────────────────────────────────────────────

interface GroupRule {
  id: string;
  position: string;
  group: string;
  description: string;
  allowedModules: AppraisalModule[];
}

const APPRAISAL_MODULES = [
  "KPI (Setting/Measurement)",
  "SMART Goals (Setting/Measurement)",
  "Appraisals Form",
  "Project Outside Job Scope",
  "Managerial Skill",
  "Inter-Departement Feedback",
  "Management Interview",
] as const;
type AppraisalModule = typeof APPRAISAL_MODULES[number];
type GroupWeightColumn = "operasional" | "kaWaKaSeksi" | "pengawasKepalaBagian" | "kepalaDepartement" | "kepalaDivisi";
const GROUP_WEIGHT_COLUMNS: Record<string, GroupWeightColumn> = {
  "Operasional": "operasional", "Ka./Wa.Ka.Seksi": "kaWaKaSeksi",
  "Ka./Wa.Ka.Bagian": "pengawasKepalaBagian", "Ka./Wa.Ka.Dept": "kepalaDepartement",
  "Ka./Wa.Ka.Div ke atas": "kepalaDivisi",
};
const SCORE_INDICATOR_BY_MODULE: Record<Exclude<AppraisalModule, "Inter-Departement Feedback">, string> = {
  "KPI (Setting/Measurement)": "KPI",
  "SMART Goals (Setting/Measurement)": "SMART Goals",
  "Appraisals Form": "Appraisal Form",
  "Project Outside Job Scope": "Project Outside Job Scope",
  "Managerial Skill": "Managerial Skill",
  "Management Interview": "Management Interview",
};
function moduleWeight(module: AppraisalModule, group: string, weights = DEFAULT_SCORE_WEIGHTS, companyName?: string) {
  if (module === "Inter-Departement Feedback") return "Tidak berbobot";
  const col = GROUP_WEIGHT_COLUMNS[group] ?? weightColumnFromGrouping(group, companyName);
  return weights[SCORE_INDICATOR_BY_MODULE[module]]?.[col] ?? "-";
}

function normalizeAllowedModules(value: unknown): AppraisalModule[] {
  return Array.isArray(value) ? value.filter((module): module is AppraisalModule => APPRAISAL_MODULES.includes(module as AppraisalModule)) : [];
}

function normalizeGroupRule(rule: Omit<GroupRule, "allowedModules"> & { allowedModules?: unknown }): GroupRule {
  return { ...rule, allowedModules: normalizeAllowedModules(rule.allowedModules) };
}

const INITIAL_GROUP_RULES: GroupRule[] = [
  { id: "g1",  position: "Operator",              group: "Operasional",           description: "Operator-level staff assigned to operational group", allowedModules: defaultAllowedModulesForGrouping("Operasional") },
  { id: "g2",  position: "Staff",                 group: "Operasional",           description: "Staff-level personnel in operational functions", allowedModules: defaultAllowedModulesForGrouping("Operasional") },
  { id: "g3",  position: "Officer",               group: "Operasional",           description: "Officer-level staff in operational roles", allowedModules: defaultAllowedModulesForGrouping("Operasional") },
  { id: "g4",  position: "Wakil Kepala Seksi",    group: "Ka./Wa.Ka.Seksi",       description: "Deputy section head, reports to Kepala Seksi", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Seksi") },
  { id: "g5",  position: "Kepala Seksi",          group: "Ka./Wa.Ka.Seksi",       description: "Section head managing a specific operational area", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Seksi") },
  { id: "g6",  position: "Wakil Kepala Shift",    group: "Ka./Wa.Ka.Seksi",       description: "Deputy shift head supporting Kepala Shift", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Seksi") },
  { id: "g7",  position: "Kepala Shift",          group: "Ka./Wa.Ka.Seksi",       description: "Shift head responsible for shift operations", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Seksi") },
  { id: "g8",  position: "Pengawas",              group: "Ka./Wa.Ka.Bagian",      description: "Supervisor-level staff overseeing daily operations", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian") },
  { id: "g9",  position: "Wakil Kepala Bagian",   group: "Ka./Wa.Ka.Bagian",      description: "Deputy section head, reports to Kepala Bagian", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian") },
  { id: "g10", position: "Kepala Bagian",         group: "Ka./Wa.Ka.Bagian",      description: "Section head responsible for a specific unit function", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian") },
  { id: "g11", position: "Supervisor",            group: "Ka./Wa.Ka.Bagian",      description: "Supervisory role overseeing team performance", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Bagian") },
  { id: "g12", position: "Wakil Kepala Departemen", group: "Ka./Wa.Ka.Dept",      description: "Deputy department head, acts for Kepala Departemen", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Dept") },
  { id: "g13", position: "Kepala Departemen",     group: "Ka./Wa.Ka.Dept",        description: "Department head managing multiple sections", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Dept") },
  { id: "g14", position: "Wakil Manager Departemen", group: "Ka./Wa.Ka.Dept",     description: "Deputy manager at department level", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Dept") },
  { id: "g15", position: "Manager Departemen",    group: "Ka./Wa.Ka.Dept",        description: "Department manager overseeing departmental functions", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Dept") },
  { id: "g16", position: "Wakil Manager Divisi",  group: "Ka./Wa.Ka.Div ke atas", description: "Deputy division manager, supports Manager Divisi", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Div ke atas") },
  { id: "g17", position: "Manager Divisi",        group: "Ka./Wa.Ka.Div ke atas", description: "Division manager with full divisional authority", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Div ke atas") },
  { id: "g18", position: "General Manager (GM)",  group: "Ka./Wa.Ka.Div ke atas", description: "General Manager overseeing multiple divisions", allowedModules: defaultAllowedModulesForGrouping("Ka./Wa.Ka.Div ke atas") },
  { id: "g19", position: "Direktur",              group: "Direktur / Director",   description: "Director with full Group authority (RSUP Group / Sambu Group)", allowedModules: defaultAllowedModulesForGrouping("Direktur / Director") },
];

const ALL_GROUPS = ["Operasional", "Ka./Wa.Ka.Seksi", "Ka./Wa.Ka.Bagian", "Ka./Wa.Ka.Dept", "Ka./Wa.Ka.Div ke atas", "Direktur / Director"];

const GROUP_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Operasional":           { bg: "bg-sky-50",     text: "text-sky-700",     dot: "bg-sky-400"     },
  "Ka./Wa.Ka.Seksi":       { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-400"  },
  "Ka./Wa.Ka.Bagian":      { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "Ka./Wa.Ka.Dept":        { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-400" },
  "Ka./Wa.Ka.Div ke atas": { bg: "bg-rose-50",    text: "text-rose-700",    dot: "bg-rose-400"    },
  "Direktur / Director":   { bg: "bg-purple-50",  text: "text-purple-700",  dot: "bg-purple-500"  },
};

function GroupBadge({ group }: { group: string }) {
  const c = GROUP_COLORS[group] ?? { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {group}
    </span>
  );
}

interface GroupRuleModalProps {
  rule: GroupRule | null;
  onClose: () => void;
  onSave: (r: GroupRule) => void;
}

function GroupRuleModal({ rule, companyName, availableGroups, weights, onClose, onSave }: GroupRuleModalProps & { companyName: string; availableGroups: string[]; weights: ReturnType<typeof loadUnitScoreWeights> }) {
  const isNew = !rule;
  const defaultGroup = availableGroups[0] ?? ALL_GROUPS[0];
  const [form, setForm] = useState<GroupRule>(() =>
    rule
      ? normalizeGroupRule(rule)
      : {
          id: String(Date.now()),
          position: "",
          group: defaultGroup,
          description: "",
          allowedModules: defaultAllowedModulesForGrouping(defaultGroup),
        },
  );
  function f(k: keyof GroupRule, v: string) { setForm(p => ({ ...p, [k]: v })); }
  function toggleModule(module: AppraisalModule) {
    setForm(previous => {
      const allowedModules = normalizeAllowedModules(previous.allowedModules);
      return { ...previous, allowedModules: allowedModules.includes(module)
        ? allowedModules.filter(entry => entry !== module)
        : [...allowedModules, module] };
    });
  }
  const allowedModules = normalizeAllowedModules(form.allowedModules);
  const valid = form.position.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#1A284F]" />
            <h2 className="font-semibold text-gray-800">{isNew ? "Add Group Rule" : "Edit Group Rule"}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Position / Jabatan <span className="text-red-500">*</span></label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="e.g. Kepala Bagian"
              value={form.position}
              onChange={e => f("position", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Group (from Access Management)</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={form.group}
              onChange={e => {
                const nextGrp = e.target.value;
                setForm(p => ({
                  ...p,
                  group: nextGrp,
                  allowedModules: defaultAllowedModulesForGrouping(nextGrp),
                }));
              }}
            >
              {availableGroups.map(g => <option key={g}>{g}</option>)}
            </select>
            <div className="mt-2">
              <GroupBadge group={form.group} />
            </div>
          </div>
          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="px-1 text-xs font-semibold text-gray-700">Module Access</legend>
            <p className="mb-3 text-xs leading-relaxed text-gray-500">Akses berlaku untuk <strong>{companyName}</strong>. Bobot mengikuti Bobot Penilaian KPI untuk group yang dipilih; checklist tidak otomatis mengubah bobot.</p>
            <div className="space-y-2">
              {APPRAISAL_MODULES.map(module => (
                <label key={module} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={allowedModules.includes(module)} onChange={() => toggleModule(module)}
                    className="h-4 w-4 rounded border-gray-300 accent-[#1A284F]" />
                  <span className="flex-1">{module}</span>
                  <span className={`text-xs font-semibold ${moduleWeight(module, form.group, weights, companyName) === "-" ? "text-gray-400" : "text-[#1A284F]"}`}>{moduleWeight(module, form.group, weights, companyName)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Brief description of this grouping rule..."
              value={form.description}
              onChange={e => f("description", e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => { if (valid) { onSave(form); onClose(); } }}
            className="px-4 py-2 text-sm bg-[#1A284F] text-white rounded-lg hover:bg-[#2a3d6e] flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} /> {isNew ? "Add Rule" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteGroupModal({ rule, onClose, onConfirm }: { rule: GroupRule; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Remove Group Rule</h2>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Remove position <strong>"{rule.position}"</strong> from group <strong>"{rule.group}"</strong>?
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Remove</button>
        </div>
      </div>
    </div>
  );
}

function UserGroupingTab({ companyName }: { companyName: string }) {
  const { groups: accessGroups } = useAccessManagement();
  // Kumpulan jabatan aktual yang benar-benar ada pada Unit Usaha ini
  const [unitUsersSnapshot, setUnitUsersSnapshot] = useState<User[]>(() =>
    loadManagedUsers().filter(
      (u) => canonicalizeCompanyUnitName(u.company) === canonicalizeCompanyUnitName(companyName) && u.position?.trim(),
    ),
  );
  useEffect(() => {
    const syncUsers = () => {
      setUnitUsersSnapshot(
        loadManagedUsers().filter(
          (u) => canonicalizeCompanyUnitName(u.company) === canonicalizeCompanyUnitName(companyName) && u.position?.trim(),
        ),
      );
    };
    syncUsers();
    window.addEventListener("pa-auth-updated", syncUsers);
    window.addEventListener("pa-employees-imported", syncUsers);
    window.addEventListener("pa-db-hydrated", syncUsers);
    return () => {
      window.removeEventListener("pa-auth-updated", syncUsers);
      window.removeEventListener("pa-employees-imported", syncUsers);
      window.removeEventListener("pa-db-hydrated", syncUsers);
    };
  }, [companyName]);

  const validUnitPositionsLower = useMemo(
    () => new Set(unitUsersSnapshot.map((u) => u.position.trim().toLowerCase()).filter(Boolean)),
    [unitUsersSnapshot],
  );

  const [rulesByCompany, setRulesByCompany] = useState<Record<string, GroupRule[]>>(() =>
    Object.fromEntries(COMPANIES.map(company => [company, loadUnitGroupRules(company, structuredClone(INITIAL_GROUP_RULES))])),
  );
  const [editRule, setEditRule] = useState<GroupRule | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteRule, setDeleteRule] = useState<GroupRule | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All Groups");
  const [positionFilter, setPositionFilter] = useState("All Positions");
  const [weights, setWeights] = useState(() => loadUnitScoreWeights(companyName));
  useEffect(() => {
    setPositionFilter("All Positions");
    const refresh = () => setWeights(loadUnitScoreWeights(companyName));
    refresh();
    window.addEventListener(SCORE_WEIGHT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(SCORE_WEIGHT_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [companyName]);
  const rawRules = rulesByCompany[companyName] ?? INITIAL_GROUP_RULES;
  // USER_MGMT.4: Hanya tampilkan Position / Jabatan yang benar-benar ada pada Unit Usaha ini (bila data karyawan unit sudah tersedia)
  const rules = useMemo(
    () =>
      validUnitPositionsLower.size > 0
        ? rawRules.filter((r) => validUnitPositionsLower.has(r.position.trim().toLowerCase()))
        : rawRules,
    [rawRules, validUnitPositionsLower],
  );

  const positionOptions = useMemo(
    () => Array.from(new Set(rules.map((r) => r.position.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "id")),
    [rules],
  );

  const filtered = rules.filter(r => {
    if (groupFilter !== "All Groups" && r.group !== groupFilter) return false;
    if (positionFilter !== "All Positions" && r.position.trim() !== positionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.position.toLowerCase().includes(q) && !r.group.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilters = groupFilter !== "All Groups" || positionFilter !== "All Positions";

  function handleSave(updated: GroupRule) {
    updated = normalizeGroupRule(updated);
    setRulesByCompany(previous => {
      const current = previous[companyName] ?? [];
      const nextList = current.some(rule => rule.id === updated.id)
        ? current.map(rule => rule.id === updated.id ? updated : rule)
        : [...current, updated];
      saveUnitGroupRules(companyName, nextList);
      return { ...previous, [companyName]: nextList };
    });
    // Otomatis sinkronkan properti groupings karyawan pada Company Unit ini yang memiliki Position/Jabatan yang sama
    const allUsers = loadManagedUsers();
    let changed = false;
    const syncedUsers = allUsers.map(u => {
      if (u.company === companyName && u.position.trim().toLowerCase() === updated.position.trim().toLowerCase() && u.groupings !== updated.group) {
        changed = true;
        return { ...u, groupings: updated.group };
      }
      return u;
    });
    if (changed) {
      saveManagedUsers(syncedUsers);
    }
  }

  function handleSyncPositionsFromUsers() {
    const unitUsers = loadManagedUsers().filter(
      u => canonicalizeCompanyUnitName(u.company) === canonicalizeCompanyUnitName(companyName) && u.position.trim(),
    );
    const unitPosSet = new Set(unitUsers.map((u) => u.position.trim().toLowerCase()));
    // Buang jabatan template/asing yang tidak ada pada Unit Usaha ini, pertahankan mapping jabatan yang memang ada di unit ini
    const current = (rulesByCompany[companyName] ?? []).filter((r) =>
      unitPosSet.has(r.position.trim().toLowerCase()),
    );
    const existingPositions = new Set(current.map(r => r.position.trim().toLowerCase()));
    const addedRules: GroupRule[] = [];

    unitUsers.forEach((u, idx) => {
      const posKey = u.position.trim().toLowerCase();
      if (!existingPositions.has(posKey)) {
        existingPositions.add(posKey);
        const group = accessGroups.includes(u.groupings) ? u.groupings : "Operasional";
        addedRules.push({
          id: `sync-${Date.now()}-${idx}`,
          position: u.position.trim(),
          group,
          description: `Auto-synced from imported employee position in ${companyName}`,
          allowedModules: defaultAllowedModulesForGrouping(group),
        });
      }
    });

    const nextList = [...current, ...addedRules].sort((a, b) => a.position.localeCompare(b.position, "id"));
    saveUnitGroupRules(companyName, nextList);
    setRulesByCompany(prev => ({ ...prev, [companyName]: nextList }));
    setUnitUsersSnapshot(unitUsers);
  }

  // Summary: count per group
  const groupCounts = accessGroups.map(g => ({ group: g, count: rules.filter(r => r.group === g).length }));

  return (
    <div className="space-y-4">
      {/* Group summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
        {groupCounts.map(({ group, count }, idx) => {
          const groupToneCycle: AnalyticsCardTone[] = ["navy", "emerald", "teal", "plum", "terracotta", "slate", "rose"];
          const tone = groupToneCycle[idx % groupToneCycle.length];
          return (
            <AnalyticsStatCard
              key={group}
              title={group}
              value={count}
              subtitle={`${count} ${count === 1 ? "position" : "positions"} mapped`}
              icon={<Layers className="w-4 h-4" />}
              tone={tone}
              index={idx}
              compact
            />
          );
        })}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              placeholder="Search position or group..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[230px]"
              value={positionFilter}
              onChange={e => setPositionFilter(e.target.value)}
            >
              <option value="All Positions">All Position / Jabatan</option>
              {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
            >
              <option>All Groups</option>
              {accessGroups.map(g => <option key={g}>{g}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {hasActiveFilters && (
            <button onClick={() => { setGroupFilter("All Groups"); setPositionFilter("All Positions"); }} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
          )}
          <div className="flex-1" />
          <span className="text-xs text-gray-400">{filtered.length} rules</span>
          <button
            type="button"
            onClick={handleSyncPositionsFromUsers}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 bg-blue-50 text-[#1A284F] text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors"
            title="Tambahkan otomatis semua nama Jabatan dari data karyawan unit ini ke tabel User Groupings"
          >
            <RefreshCw size={13} /> Sync Posisi Karyawan
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A284F] text-white text-sm rounded-lg hover:bg-[#2a3d6e]"
          >
            <Plus size={14} /> Add Rule
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Position / Jabatan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Group</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Allowed Modules</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-gray-400 py-12">No group rules found.</td></tr>
              ) : filtered.map((rule, idx) => (
                <tr key={rule.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${idx % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setEditRule(rule)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteRule(rule)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-800">{rule.position}</span>
                  </td>
                  <td className="px-4 py-3">
                    <GroupBadge group={rule.group} />
                  </td>
                  <td className="px-4 py-3">
                    {normalizeAllowedModules(rule.allowedModules).length ? <div className="flex max-w-[330px] flex-wrap gap-1">{normalizeAllowedModules(rule.allowedModules).map(module => <span key={module} className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">{module}</span>)}</div> : <span className="text-xs text-red-500">No module access</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[300px]">{rule.description || <span className="text-gray-300">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
          Setiap unit usaha memiliki rule dan akses modul sendiri. Bobot pada checklist adalah referensi Bobot Penilaian KPI untuk level group; bobot `-` berarti modul tidak berkontribusi pada total penilaian level tersebut.
        </div>
      </div>

      {(addOpen || editRule) && (
        <GroupRuleModal
          rule={addOpen ? null : editRule}
          companyName={companyName}
          availableGroups={accessGroups}
          weights={weights}
          onClose={() => { setAddOpen(false); setEditRule(null); }}
          onSave={handleSave}
        />
      )}
      {deleteRule && (
        <DeleteGroupModal
          rule={deleteRule}
          onClose={() => setDeleteRule(null)}
          onConfirm={() => setRulesByCompany(previous => ({ ...previous, [companyName]: (previous[companyName] ?? []).filter(rule => rule.id !== deleteRule.id) }))}
        />
      )}
    </div>
  );
}

const COMPANY_COLORS = [
  "from-blue-600 to-blue-800",
  "from-emerald-600 to-emerald-800",
  "from-violet-600 to-violet-800",
  "from-amber-500 to-orange-700",
  "from-sky-500 to-cyan-700",
  "from-rose-500 to-red-700",
  "from-teal-500 to-teal-700",
  "from-indigo-500 to-indigo-700",
];

function CompanyUnitPicker({
  users,
  onSelect,
}: {
  users: User[];
  onSelect: (company: string) => void;
}) {
  const [search, setSearch] = useState("");
  const { getUnitLoginConfig } = useLoginManagement();
  const filtered = COMPANIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  const unitTones: AnalyticsCardTone[] = ["navy", "emerald", "plum", "terracotta", "teal", "rose", "slate", "navy"];

  return (
    <div className="p-6 w-full space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select a Company Unit to manage its users</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span>&#8962;</span><span>Home</span><span className="mx-1">›</span><span>Setting</span><span className="mx-1">›</span>
            <span className="font-medium text-gray-700">User Management</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-gray-800 text-base">Select Company Unit</h2>
            <p className="text-xs text-gray-500 mt-0.5">Each Company Unit has independent user settings</p>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              placeholder="Search company..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((company, idx) => {
            const userCount = users.filter(u => u.company === company).length;
            const activeCount = users.filter(u => u.company === company && u.status === "Active").length;
            const loginCfg = getUnitLoginConfig(company);
            const locMeta = COMPANY_UNIT_LOCATIONS.find((l) => l.company === company);
            const spec = ANALYTICS_CARD_TONES[unitTones[idx % unitTones.length]];
            const loginLabel = loginCfg.enabledMethods
              .map((m) => LOGIN_METHOD_DEFS.find((d) => d.id === m)?.label ?? m)
              .join(", ");
            return (
              <button
                key={company}
                onClick={() => onSelect(company)}
                style={{ animationDelay: `${Math.min(idx, 8) * 50}ms` }}
                className={`group relative overflow-hidden text-left bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl p-4 min-h-[132px] flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion cursor-pointer`}
              >
                <div
                  className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
                  style={{ backgroundColor: `${spec.accentHex}0D` }}
                />
                <div className="flex items-start justify-between gap-2 relative z-10">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-500 truncate">
                      {locMeta?.code ?? `UNIT-${idx + 1}`}
                    </p>
                    <p className="text-base font-extrabold text-[#111827] leading-snug mt-1">{company}</p>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3"
                    style={{ backgroundColor: spec.accentHex }}
                  >
                    <Building2 size={20} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-4 relative z-10">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-[11px] font-bold text-[#1A284F] tabular-nums">
                      {userCount} Users ({activeCount} Active)
                    </span>
                    <span className="text-[10px] font-semibold text-indigo-700 bg-white/85 border border-indigo-200 px-2 py-0.5 rounded-full truncate max-w-[150px]" title={`Login: ${loginLabel}`}>
                      {loginLabel}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 group-hover:text-[#1A284F] group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-10 text-gray-400 text-sm">No company units found.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const LOGIN_METHOD_DEFS: Array<{
  id: LoginMethodOption;
  label: string;
  subtitle: string;
  badge: string;
  exclusive?: boolean;
}> = [
  {
    id: "otp_telegram",
    label: "OTP Telegram",
    subtitle: "Kirim kode OTP 6 digit ke No Telegram karyawan terdaftar",
    badge: "Bisa dikombinasikan",
  },
  {
    id: "otp_whatsapp",
    label: "OTP WhatsApp",
    subtitle: "Kirim kode OTP 6 digit ke nomor WhatsApp karyawan terdaftar",
    badge: "Bisa dikombinasikan",
  },
  {
    id: "otp_email",
    label: "OTP Email",
    subtitle: "Kirim kode OTP 6 digit ke Corporate Email karyawan terdaftar",
    badge: "Bisa dikombinasikan",
  },
  {
    id: "password",
    label: "Password",
    subtitle: "Login menggunakan Password (default awal wajib diganti user, blokir otomatis jika 5x salah)",
    badge: "Eksklusif (Tidak bisa digabung OTP)",
    exclusive: true,
  },
];

function LoginManagementTab({
  activeCompany,
  users,
  onSwitchCompany,
}: {
  activeCompany: string;
  users: User[];
  onSwitchCompany: (company: string) => void;
}) {
  const {
    unitConfigs,
    securityMap,
    getUnitLoginConfig,
    toggleUnitLoginMethod,
    updateUnitLoginMethods,
    resetPasswordToDefault,
  } = useLoginManagement();
  const [savedNotice, setSavedNotice] = useState("");
  const currentCfg = getUnitLoginConfig(activeCompany);
  const [gatewayDraft, setGatewayDraft] = useState(() => ({
    telegramApiUrl: currentCfg.gateway?.telegramApiUrl ?? "https://api.telegram.org",
    telegramBotToken: currentCfg.gateway?.telegramBotToken ?? "",
    whatsappApiUrl: currentCfg.gateway?.whatsappApiUrl ?? "https://api.whatsapp.com/send-otp",
    whatsappApiKey: currentCfg.gateway?.whatsappApiKey ?? "",
    emailWebhookUrl: currentCfg.gateway?.emailWebhookUrl ?? "https://api.sambugroup.com/pa/email-otp",
    emailSenderName: currentCfg.gateway?.emailSenderName ?? "PA Sambu Group",
  }));

  useEffect(() => {
    const cfg = getUnitLoginConfig(activeCompany);
    setGatewayDraft({
      telegramApiUrl: cfg.gateway?.telegramApiUrl ?? "https://api.telegram.org",
      telegramBotToken: cfg.gateway?.telegramBotToken ?? "",
      whatsappApiUrl: cfg.gateway?.whatsappApiUrl ?? "https://api.whatsapp.com/send-otp",
      whatsappApiKey: cfg.gateway?.whatsappApiKey ?? "",
      emailWebhookUrl: cfg.gateway?.emailWebhookUrl ?? "https://api.sambugroup.com/pa/email-otp",
      emailSenderName: cfg.gateway?.emailSenderName ?? "PA Sambu Group",
    });
  }, [activeCompany, unitConfigs]);

  const unitUsers = users.filter((u) => u.company === activeCompany && u.status === "Active");
  const isPwdActive = currentCfg.enabledMethods.includes("password");

  const blockedUsersInUnit = unitUsers.filter(
    (u) => securityMap[u.employeeId.trim().toUpperCase()]?.isBlocked,
  );
  const defaultPwdUsersCount = unitUsers.filter((u) => {
    const rec = securityMap[u.employeeId.trim().toUpperCase()];
    return !rec || rec.mustChangePassword;
  }).length;
  const customPwdUsersCount = unitUsers.length - defaultPwdUsersCount;

  // Data log aktual keamanan & aktivitas login khusus untuk unit usaha yang sedang dipilih
  const unitSecurityLogs = useMemo(() => {
    const unitEmpMap = new Map(
      unitUsers.map((u) => [u.employeeId.trim().toUpperCase(), u]),
    );
    const items: Array<{ id: string; time: string; actor: string; detail: string; tone: "ok" | "warn" | "danger" }> = [];

    for (const u of unitUsers) {
      const sec = securityMap[u.employeeId.trim().toUpperCase()];
      if (sec?.updatedAt) {
        items.push({
          id: `sec-${u.employeeId}`,
          time: sec.updatedAt.slice(0, 16).replace("T", " "),
          actor: `${u.name} (${u.employeeId})`,
          detail: sec.isBlocked
            ? "Akun diblokir (5x gagal password)"
            : sec.mustChangePassword
            ? "Password di-reset ke default"
            : "Password berhasil diperbaharui",
          tone: sec.isBlocked ? "danger" : sec.mustChangePassword ? "warn" : "ok",
        });
      }
      if (u.lastLogin) {
        items.push({
          id: `login-${u.employeeId}`,
          time: u.lastLogin,
          actor: `${u.name} (${u.employeeId})`,
          detail: `Login ke ${activeCompany}`,
          tone: "ok",
        });
      }
    }

    for (const log of loadLocalAuditLogs()) {
      const uid = String(log.userId ?? "").trim().toUpperCase();
      const desc = String(log.description ?? "");
      const belongsToUnit =
        unitEmpMap.has(uid) || desc.toLowerCase().includes(activeCompany.toLowerCase());
      if (
        belongsToUnit &&
        (log.action === "Login" ||
          log.subModule === "Login Management" ||
          desc.toLowerCase().includes("password"))
      ) {
        items.push({
          id: `aud-${log.id}`,
          time: log.timestamp,
          actor: `${log.userName} (${log.userId})`,
          detail: desc,
          tone: "ok",
        });
      }
    }

    return items
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 8);
  }, [unitUsers, securityMap, activeCompany]);

  const handleToggleMethod = (company: string, method: LoginMethodOption) => {
    onSwitchCompany(company);
    toggleUnitLoginMethod(company, method);
    setSavedNotice(`Metode login untuk ${company} berhasil diperbarui.`);
    setTimeout(() => setSavedNotice(""), 3000);
  };

  const handleSaveGateway = () => {
    updateUnitLoginMethods(activeCompany, currentCfg.enabledMethods, gatewayDraft);
    setSavedNotice(`Konfigurasi Gateway Login untuk ${activeCompany} berhasil disimpan.`);
    setTimeout(() => setSavedNotice(""), 3000);
  };

  return (
    <div className="space-y-5">
      {savedNotice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Matriks Cepat Pengaturan Metode Login Seluruh Unit Usaha */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#1A284F]">
              Pengaturan Metode Login per Unit Usaha (Seluruh Company Unit)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Opsi <strong>OTP Telegram</strong>, <strong>OTP WhatsApp</strong>, dan <strong>OTP Email</strong> dapat dipilih lebih dari 1. Opsi <strong>Password</strong> bersifat eksklusif dan tidak dapat digabungkan dengan opsi OTP.
            </p>
          </div>
          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
            Unit Aktif: {activeCompany}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Company Unit</th>
                <th className="text-center px-4 py-3">OTP Telegram</th>
                <th className="text-center px-4 py-3">OTP WhatsApp</th>
                <th className="text-center px-4 py-3">OTP Email</th>
                <th className="text-center px-4 py-3">Password (Eksklusif)</th>
                <th className="text-left px-4 py-3">Mode Aktif Saat Ini</th>
              </tr>
            </thead>
            <tbody>
              {COMPANIES.map((comp) => {
                const cfg = getUnitLoginConfig(comp);
                const hasPwd = cfg.enabledMethods.includes("password");
                const isSelected = comp === activeCompany;
                return (
                  <tr
                    key={comp}
                    onClick={() => onSwitchCompany(comp)}
                    className={`border-b border-gray-50 transition-colors cursor-pointer ${
                      isSelected ? "bg-indigo-50/40" : "hover:bg-gray-50/50"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSwitchCompany(comp);
                        }}
                        className="text-left font-semibold text-gray-800 hover:text-[#1A284F] flex items-center gap-2"
                      >
                        <Building2 size={14} className={isSelected ? "text-[#1A284F]" : "text-gray-400"} />
                        <span>{comp}</span>
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A284F] text-white font-semibold">
                            Sedang Dibuka
                          </span>
                        )}
                      </button>
                    </td>
                    {(["otp_telegram", "otp_whatsapp", "otp_email"] as LoginMethodOption[]).map((m) => {
                      const checked = cfg.enabledMethods.includes(m);
                      return (
                        <td key={m} className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleMethod(comp, m);
                            }}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border transition-colors ${
                              checked
                                ? "bg-[#1A284F] border-[#1A284F] text-white"
                                : "bg-white border-gray-300 text-transparent hover:border-gray-400"
                            }`}
                            title={`Toggle ${m} untuk ${comp}`}
                          >
                            <Check size={13} />
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMethod(comp, "password");
                        }}
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border transition-colors ${
                          hasPwd
                            ? "bg-amber-600 border-amber-600 text-white"
                            : "bg-white border-gray-300 text-transparent hover:border-amber-400"
                        }`}
                        title={`Gunakan metode Password (eksklusif) untuk ${comp}`}
                      >
                        <Check size={13} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cfg.enabledMethods.map((m) => (
                          <span
                            key={m}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              m === "password"
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {LOGIN_METHOD_DEFS.find((d) => d.id === m)?.label ?? m}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Pengaturan untuk Unit Usaha yang Sedang Dipilih */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800">
                Detail Metode Login — {activeCompany}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Klik pada kartu metode di bawah untuk mengaktifkan atau menonaktifkan metode login unit ini.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LOGIN_METHOD_DEFS.map((def) => {
              const active = currentCfg.enabledMethods.includes(def.id);
              return (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => handleToggleMethod(activeCompany, def.id)}
                  className={`text-left rounded-xl p-4 border transition-all ${
                    active
                      ? def.exclusive
                        ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20"
                        : "border-[#1A284F] bg-indigo-50/40 ring-2 ring-[#1A284F]/15"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      {def.exclusive ? <Lock size={14} className="text-amber-600" /> : <KeyRound size={14} className="text-[#1A284F]" />}
                      {def.label}
                    </span>
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-white text-xs ${
                        active ? (def.exclusive ? "bg-amber-600" : "bg-[#1A284F]") : "border border-gray-300 bg-white"
                      }`}
                    >
                      {active && <Check size={12} />}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-2">{def.subtitle}</p>
                  <span
                    className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      def.exclusive ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {def.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Konfigurasi Backend / API Gateway Koneksi OTP */}
          <div className="pt-3 border-t border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Koneksi Backend Gateway — {activeCompany}
                </h4>
                <p className="text-[11px] text-gray-400">
                  Endpoint & kredensial integrasi autentikasi untuk unit <strong>{activeCompany}</strong> ({isPwdActive ? "Mode aktif: Password · konfigurasi OTP disiapkan sebagai cadangan" : "Mode aktif: OTP"}).
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveGateway}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A284F] text-white text-xs font-semibold hover:bg-[#131d3b]"
              >
                <Save size={13} /> Simpan Gateway
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Telegram API Base URL</label>
                <input
                  type="text"
                  value={gatewayDraft.telegramApiUrl}
                  onChange={(e) => setGatewayDraft((d) => ({ ...d, telegramApiUrl: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">WhatsApp OTP Gateway URL</label>
                <input
                  type="text"
                  value={gatewayDraft.whatsappApiUrl}
                  onChange={(e) => setGatewayDraft((d) => ({ ...d, whatsappApiUrl: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Corporate Email OTP Webhook URL</label>
                <input
                  type="text"
                  value={gatewayDraft.emailWebhookUrl}
                  onChange={(e) => setGatewayDraft((d) => ({ ...d, emailWebhookUrl: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Email Sender Identity</label>
                <input
                  type="text"
                  value={gatewayDraft.emailSenderName}
                  onChange={(e) => setGatewayDraft((d) => ({ ...d, emailSenderName: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Panel Ringkasan Keamanan Password & Akun Terblokir */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-gray-800">
                Status Keamanan Password Unit — {activeCompany}
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1A284F]/10 text-[#1A284F]">
                {unitUsers.length} User Aktif
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Data aktual unit <strong>{activeCompany}</strong>: wajib ganti password default saat pertama login, minimal 8 karakter (huruf, angka, simbol), dan blokir otomatis setelah 5x salah password.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <div className="text-lg font-bold text-amber-800">{defaultPwdUsersCount}</div>
              <div className="text-[10px] font-semibold text-amber-700">Password Default</div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <div className="text-lg font-bold text-emerald-800">{customPwdUsersCount}</div>
              <div className="text-[10px] font-semibold text-emerald-700">Sudah Diperbaharui</div>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
              <div className="text-lg font-bold text-rose-800">{blockedUsersInUnit.length}</div>
              <div className="text-[10px] font-semibold text-rose-700">Akun Diblokir (5x)</div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 text-xs text-gray-600 space-y-1.5">
            <div className="font-semibold text-gray-800">
              Status Tombol Reset Password di Tabel User ({activeCompany}):
            </div>
            <p>
              {isPwdActive ? (
                <span className="text-emerald-700 font-medium">
                  Aktif — Karena unit {activeCompany} menggunakan metode login Password, ikon Reset Password di kolom Action tabel User Management dapat digunakan.
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  Non-Aktif — Karena unit {activeCompany} saat ini menggunakan metode OTP, ikon Reset Password di kolom Action tabel User Management otomatis dinonaktifkan.
                </span>
              )}
            </p>
          </div>

          <div className="space-y-2 pt-1 border-t border-gray-100">
            <div className="text-xs font-bold text-gray-700">
              Log Aktivitas &amp; Keamanan Aktual — {activeCompany}
            </div>
            {unitSecurityLogs.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic py-2">
                Belum ada aktivitas login atau perubahan password tercatat pada {activeCompany}.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                {unitSecurityLogs.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                      item.tone === "danger"
                        ? "bg-rose-50/70 border-rose-200 text-rose-800"
                        : item.tone === "warn"
                        ? "bg-amber-50/70 border-amber-200 text-amber-800"
                        : "bg-slate-50 border-gray-100 text-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{item.actor}</span>
                      <span className="text-[10px] text-gray-400 shrink-0">{item.time}</span>
                    </div>
                    <p className="text-[10.5px] opacity-90 truncate">{item.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {blockedUsersInUnit.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                <ShieldAlert size={14} /> Daftar Akun Terblokir ({blockedUsersInUnit.length})
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {blockedUsersInUnit.map((u) => (
                  <div
                    key={u.employeeId}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs"
                  >
                    <div>
                      <div className="font-bold text-rose-900">{u.name}</div>
                      <div className="text-[10px] text-rose-700">{u.employeeId} · 5x salah password</div>
                    </div>
                    <button
                      type="button"
                      disabled={!isPwdActive}
                      onClick={() => {
                        resetPasswordToDefault(u.employeeId);
                        setSavedNotice(`Password untuk ${u.name} (${u.employeeId}) berhasil di-reset ke default.`);
                        setTimeout(() => setSavedNotice(""), 3000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-[11px] font-semibold"
                    >
                      Reset Default
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function LoginManagementPage() {
  const [activeCompany, setActiveCompany] = useState<string>(COMPANIES[0]);
  const [users, setUsers] = useState<User[]>(() => loadManagedUsers());

  useEffect(() => {
    const onSync = () => setUsers(loadManagedUsers());
    window.addEventListener("pa-auth-updated", onSync);
    window.addEventListener("pa-employees-imported", onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    return () => {
      window.removeEventListener("pa-auth-updated", onSync);
      window.removeEventListener("pa-employees-imported", onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
    };
  }, []);

  return (
    <div className="p-6 w-full space-y-4">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1A284F]/8 flex items-center justify-center">
            <KeyRound size={18} className="text-[#1A284F]" />
          </div>
          <div>
            <h1 className="font-bold text-[#1A284F] text-xl">Login Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Konfigurasi metode login (OTP Telegram, WhatsApp, Email, atau Password) per Unit Usaha
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span><span>Setting</span><span className="mx-1">›</span>
          <span className="font-medium text-gray-700">Login Management</span>
        </div>
      </div>

      <LoginManagementTab
        activeCompany={activeCompany}
        users={users}
        onSwitchCompany={(comp) => setActiveCompany(comp)}
      />
    </div>
  );
}

export function UserManagementPage() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useRouteTab<"users" | "grouping">(["users", "grouping"], "users");
  const [users, setUsers] = useState<User[]>(() => loadManagedUsers());
  const { roles: accessRoles, groups: accessGroups } = useAccessManagement();
  const {
    getUnitLoginConfig,
    getUserSecurityRecord,
    resetPasswordToDefault,
  } = useLoginManagement();
  const [pageSize, setPageSize] = useState(10);
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [divisiFilter, setDivisiFilter] = useState("All Divisi");
  const [deptFilter, setDeptFilter] = useState("All Departemen");
  const [groupingFilter, setGroupingFilter] = useState("All Groupings");
  const [search, setSearch] = useState("");
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkRoleValue, setBulkRoleValue] = useState("");
  const [bulkGroupingValue, setBulkGroupingValue] = useState("");
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [resetPwdBanner, setResetPwdBanner] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const onSync = () => setUsers(loadManagedUsers());
    window.addEventListener("pa-auth-updated", onSync);
    window.addEventListener("pa-employees-imported", onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    return () => {
      window.removeEventListener("pa-auth-updated", onSync);
      window.removeEventListener("pa-employees-imported", onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
    };
  }, []);

  useEffect(() => {
    setSearch("");
    setRoleFilter("All Roles");
    setDivisiFilter("All Divisi");
    setDeptFilter("All Departemen");
    setGroupingFilter("All Groupings");
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [selectedCompany]);

  const companyUsers = useMemo(
    () => (selectedCompany ? users.filter((u) => u.company === selectedCompany) : []),
    [users, selectedCompany],
  );

  // Peta duplikat ID Karyawan (ketika Reg No berbeda, baik dalam satu unit maupun lintas unit)
  const duplicateEmployeeIdPeersByUserId = useMemo(() => {
    const byEmpId = new Map<string, User[]>();
    for (const u of users) {
      const key = String(u.employeeId ?? "").trim().toLowerCase();
      if (!key) continue;
      const arr = byEmpId.get(key) ?? [];
      arr.push(u);
      byEmpId.set(key, arr);
    }
    const out = new Map<string, User[]>();
    for (const u of companyUsers) {
      const key = String(u.employeeId ?? "").trim().toLowerCase();
      const peers = (byEmpId.get(key) ?? []).filter((o) => o.id !== u.id);
      if (peers.length > 0) out.set(u.id, peers);
    }
    return out;
  }, [users, companyUsers]);

  // Peta Reg No yang sama pada Unit Usaha berbeda (diizinkan — tampilkan tag kuning informasi)
  const crossUnitRegNoPeersByUserId = useMemo(() => {
    const byReg = new Map<string, User[]>();
    for (const u of users) {
      const key = String(u.regNo ?? "").trim().toLowerCase();
      if (!key) continue;
      const arr = byReg.get(key) ?? [];
      arr.push(u);
      byReg.set(key, arr);
    }
    const out = new Map<string, User[]>();
    for (const u of companyUsers) {
      const key = String(u.regNo ?? "").trim().toLowerCase();
      const peers = (byReg.get(key) ?? []).filter(
        (o) => o.id !== u.id && !isSameCompanyUnit(o.company, u.company),
      );
      if (peers.length > 0) out.set(u.id, peers);
    }
    return out;
  }, [users, companyUsers]);

  if (!selectedCompany) {
    return (
      <CompanyUnitPicker
        users={users}
        onSelect={setSelectedCompany}
      />
    );
  }

  const divisiOpts = Array.from(new Set(companyUsers.map(u => (u.division || "").trim()).filter(Boolean))).sort();
  const deptOpts = Array.from(
    new Set(
      companyUsers
        .filter(u => divisiFilter === "All Divisi" || (u.division || "").trim() === divisiFilter)
        .map(u => (u.department || "").trim())
        .filter(Boolean)
    )
  ).sort();

  const groupingOpts = Array.from(
    new Set([...accessGroups, ...companyUsers.map((u) => (u.groupings || "").trim()).filter(Boolean)]),
  );

  const allFiltered = companyUsers.filter(u => {
    if (roleFilter !== "All Roles" && u.role !== roleFilter) return false;
    if (divisiFilter !== "All Divisi" && (u.division || "").trim() !== divisiFilter) return false;
    if (deptFilter !== "All Departemen" && (u.department || "").trim() !== deptFilter) return false;
    if (groupingFilter !== "All Groupings" && (u.groupings || "").trim() !== groupingFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !u.name.toLowerCase().includes(q) &&
        !u.employeeId.toLowerCase().includes(q) &&
        !String(u.regNo ?? "").toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(allFiltered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginated = allFiltered.slice((page - 1) * pageSize, page * pageSize);

  function reset() {
    setSearch("");
    setRoleFilter("All Roles");
    setDivisiFilter("All Divisi");
    setDeptFilter("All Departemen");
    setGroupingFilter("All Groupings");
    setCurrentPage(1);
  }

  function handleSave(updated: User, originalUser?: User | null, mode: "add" | "edit" = "edit") {
    const currentList = loadManagedUsers();
    if (mode === "edit" && originalUser) {
      const origUnit = originalUser.company.trim().toLowerCase();
      const origReg = String(originalUser.regNo ?? "").trim().toLowerCase();
      const origEmp = String(originalUser.employeeId ?? "").trim().toLowerCase();
      const idMatchCount = currentList.filter((u) => u.id === originalUser.id).length;

      // Cari tepat index user yang sedang diedit (prioritaskan id unik + unit, lalu unit + regNo awal, lalu unit + employeeId awal)
      let targetIdx = currentList.findIndex(
        (u) =>
          u.id === originalUser.id &&
          u.company.trim().toLowerCase() === origUnit &&
          (idMatchCount === 1 ||
            (origReg && String(u.regNo ?? "").trim().toLowerCase() === origReg) ||
            (origEmp && String(u.employeeId ?? "").trim().toLowerCase() === origEmp)),
      );
      if (targetIdx < 0 && origReg) {
        targetIdx = currentList.findIndex(
          (u) =>
            u.company.trim().toLowerCase() === origUnit &&
            String(u.regNo ?? "").trim().toLowerCase() === origReg,
        );
      }
      if (targetIdx < 0 && origEmp) {
        targetIdx = currentList.findIndex(
          (u) =>
            u.company.trim().toLowerCase() === origUnit &&
            String(u.employeeId ?? "").trim().toLowerCase() === origEmp,
        );
      }
      if (targetIdx < 0) {
        targetIdx = currentList.findIndex((u) => u.id === originalUser.id);
      }

      const preservedId = targetIdx >= 0 ? currentList[targetIdx].id : originalUser.id || updated.id;
      const finalUpdated: User = {
        ...(targetIdx >= 0 ? currentList[targetIdx] : originalUser),
        ...updated,
        id: preservedId,
      };

      const nextList: User[] =
        targetIdx >= 0
          ? currentList
              .map((u, idx) => (idx === targetIdx ? finalUpdated : u))
              .filter((u, idx) => {
                if (idx === targetIdx) return true;
                // Bersihkan duplikat lama dari user yang sama pada unit yang sama apabila sebelumnya sempat tercatat ganda
                if (u.company.trim().toLowerCase() !== origUnit) return true;
                const uReg = String(u.regNo ?? "").trim().toLowerCase();
                const uEmp = String(u.employeeId ?? "").trim().toLowerCase();
                if (origReg && uReg === origReg) return false;
                if (!origReg && origEmp && uEmp === origEmp) return false;
                return true;
              })
          : [...currentList, finalUpdated];

      saveManagedUsers(nextList, finalUpdated, undefined, originalUser);
      setUsers(loadManagedUsers());
      return;
    }

    const existingIds = new Set(currentList.map((u) => u.id));
    const uniqueNewId =
      updated.id && !existingIds.has(updated.id)
        ? updated.id
        : `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newUser: User = { ...updated, id: uniqueNewId };
    const nextList = [...currentList, newUser];
    saveManagedUsers(nextList, newUser);
    setUsers(loadManagedUsers());
  }

  function handleDelete(id: string, reason: string) {
    const deleted = users.find(u => u.id === id);
    if (!deleted) return;
    // Delete = arsipkan (dapat di-restore dari Setting → Archive)
    archiveUsers([deleted], reason, "manual");
    setUsers(prev => prev.filter(u => u.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  // Multi Delete / Archive (checkbox) — tersinkron ke backend via archiveUsers
  const activeCurrent = getActiveUser();
  const activeEmpId = activeCurrent.employeeId.toUpperCase();
  const isSelectable = (u: User) =>
    !(
      u.id === activeCurrent.id ||
      (isSameCompanyUnit(u.company, activeCurrent.company) &&
        String(u.regNo ?? "").trim().toLowerCase() === String(activeCurrent.regNo ?? "").trim().toLowerCase() &&
        u.employeeId.toUpperCase() === activeEmpId)
    );
  const selectedUsers = companyUsers.filter(u => selectedIds.has(u.id));
  const pageSelectable = paginated.filter(isSelectable);
  const allPageChecked = pageSelectable.length > 0 && pageSelectable.every(u => selectedIds.has(u.id));
  function togglePageAll() {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (allPageChecked) pageSelectable.forEach(u => n.delete(u.id));
      else pageSelectable.forEach(u => n.add(u.id));
      return n;
    });
  }
  function toggleOne(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function handleBulkDelete(reason: string) {
    const targets = selectedUsers.filter(isSelectable);
    if (targets.length === 0) return;
    archiveUsers(targets, reason, "manual");
    const ids = new Set(targets.map(t => t.id));
    setUsers(prev => prev.filter(u => !ids.has(u.id)));
    setSelectedIds(new Set());
    setResetPwdBanner(`${targets.length} user berhasil dihapus & dipindahkan ke Archive.`);
  }

  function handleBulkApplyRole() {
    if (!bulkRoleValue) return;
    const targetIdSet = new Set(selectedUsers.map((u) => u.id));
    if (targetIdSet.size === 0) return;
    const currentList = loadManagedUsers();
    const updatedTargets: User[] = [];
    const nextList = currentList.map((u) => {
      if (!targetIdSet.has(u.id)) return u;
      const upd: User = { ...u, role: bulkRoleValue };
      updatedTargets.push(upd);
      return upd;
    });
    saveManagedUsers(nextList);
    void syncToSupabase({ kind: "users-batch", users: updatedTargets });
    setUsers(loadManagedUsers());
    setResetPwdBanner(`Role pada ${updatedTargets.length} user berhasil diubah menjadi "${bulkRoleValue}".`);
    setBulkRoleValue("");
    setSelectedIds(new Set());
  }

  function handleBulkApplyGrouping() {
    if (!bulkGroupingValue) return;
    const targetIdSet = new Set(selectedUsers.map((u) => u.id));
    if (targetIdSet.size === 0) return;
    const currentList = loadManagedUsers();
    const updatedTargets: User[] = [];
    const nextList = currentList.map((u) => {
      if (!targetIdSet.has(u.id)) return u;
      const upd: User = { ...u, groupings: bulkGroupingValue };
      updatedTargets.push(upd);
      return upd;
    });
    saveManagedUsers(nextList);
    void syncToSupabase({ kind: "users-batch", users: updatedTargets });
    setUsers(loadManagedUsers());
    setResetPwdBanner(`Groupings pada ${updatedTargets.length} user berhasil diubah menjadi "${bulkGroupingValue}".`);
    setBulkGroupingValue("");
    setSelectedIds(new Set());
  }

  const employeeCount = companyUsers.filter(u => u.role === "Employee").length;
  const supervisorCount = companyUsers.filter(u => u.role === "Supervisor").length;
  const gmCount = companyUsers.filter(u => u.role === "GM").length;
  const hrUnitCount = companyUsers.filter(u => u.role === "HR Unit").length;
  const hrIcfCount = companyUsers.filter(u => u.role === "HR ICF").length;
  const directorCount = companyUsers.filter(u => u.role === "Director").length;
  const adminCount = companyUsers.filter(u => u.role === "Administrator").length;

  return (
    <div className="p-6 w-full space-y-4">
      {/* Page header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{selectedCompany}</p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span><span>Setting</span><span className="mx-1">›</span>
          <button onClick={() => setSelectedCompany(null)} className="hover:text-[#1A284F] hover:underline">User Management</button>
          <span className="mx-1">›</span>
          <span className="font-medium text-gray-700 truncate max-w-[180px]">{selectedCompany}</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "users" ? "border-[#1A284F] text-[#1A284F]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users size={15} /> User Management
        </button>
        <button
          onClick={() => setActiveTab("grouping")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "grouping" ? "border-[#1A284F] text-[#1A284F]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Layers size={15} /> User Groupings
        </button>
      </div>

      {/* User Groupings tab */}
      {activeTab === "grouping" && <UserGroupingTab companyName={selectedCompany} />}

      {/* User Management tab content */}
      {activeTab === "users" && <>
      {resetPwdBanner && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>{resetPwdBanner}</span>
          </div>
          <button onClick={() => setResetPwdBanner("")} className="text-emerald-700 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {([
          { label: "Total Users",   value: companyUsers.length, sub: "Seluruh user unit usaha", tone: "navy" as AnalyticsCardTone,       icon: <Users className="w-4 h-4" /> },
          { label: "Employee",      value: employeeCount,       sub: "Role Employee",           tone: "emerald" as AnalyticsCardTone,    icon: <UserCheck className="w-4 h-4" /> },
          { label: "Supervisor",    value: supervisorCount,     sub: "Role Supervisor",         tone: "teal" as AnalyticsCardTone,       icon: <Briefcase className="w-4 h-4" /> },
          { label: "GM",            value: gmCount,             sub: "Role General Manager",    tone: "plum" as AnalyticsCardTone,       icon: <Building2 className="w-4 h-4" /> },
          { label: "HR Unit",       value: hrUnitCount,         sub: "Checker unit usaha",      tone: "terracotta" as AnalyticsCardTone, icon: <Shield className="w-4 h-4" /> },
          { label: "HR ICF",        value: hrIcfCount,          sub: "Validator korporat",      tone: "rose" as AnalyticsCardTone,       icon: <Award className="w-4 h-4" /> },
          { label: "Director",      value: directorCount,       sub: "Role Director / BOD",     tone: "slate" as AnalyticsCardTone,      icon: <Award className="w-4 h-4" /> },
          { label: "Administrator", value: adminCount,          sub: "System Administrator",    tone: "navy" as AnalyticsCardTone,       icon: <KeyRound className="w-4 h-4" /> },
        ]).map((s, idx) => (
          <AnalyticsStatCard
            key={s.label}
            title={s.label}
            value={s.value}
            subtitle={s.sub}
            icon={s.icon}
            tone={s.tone}
            index={idx}
            compact
          />
        ))}
      </div>

      {/* Filters + table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* USER_MGMT.2: Urutan kiri ke kanan: Add User -> Searching -> Role -> Divisi -> Departement -> Groupings -> Show xx Entries */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1A284F] text-white text-sm font-medium rounded-lg hover:bg-[#2a3d6e] shrink-0 cursor-pointer"
          >
            <Plus size={14} /> Add User
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-52"
              placeholder="Search name, ID, Reg No..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {[
            { val: roleFilter, set: (v: string) => { setRoleFilter(v); setCurrentPage(1); }, opts: ["All Roles", ...accessRoles] },
            { val: divisiFilter, set: (v: string) => { setDivisiFilter(v); setDeptFilter("All Departemen"); setCurrentPage(1); }, opts: ["All Divisi", ...divisiOpts] },
            { val: deptFilter, set: (v: string) => { setDeptFilter(v); setCurrentPage(1); }, opts: ["All Departemen", ...deptOpts] },
            { val: groupingFilter, set: (v: string) => { setGroupingFilter(v); setCurrentPage(1); }, opts: ["All Groupings", ...groupingOpts] },
          ].map(({ val, set, opts }, i) => (
            <div key={i} className="relative">
              <select
                className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={val}
                onChange={e => set(e.target.value)}
              >
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ))}

          <button onClick={reset} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 cursor-pointer" title="Reset filters">
            <RefreshCw size={14} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <div className="relative">
              <select
                className="appearance-none border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <span>Entries</span>
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#F6FAFF] border-b border-[#C9DCF0]">
            <span className="text-xs font-semibold text-[#1A284F]">
              {selectedUsers.length} user dipilih
              {allFiltered.length > selectedUsers.length && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(allFiltered.filter(isSelectable).map(u => u.id)))}
                  className="ml-2 font-semibold text-[#2F5597] underline hover:opacity-80 cursor-pointer"
                >
                  Pilih semua {allFiltered.filter(isSelectable).length} hasil filter
                </button>
              )}
            </span>
            {/* USER_MGMT.3: Multi-action Role, Groupings, & Delete / Archive */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <select
                  value={bulkRoleValue}
                  onChange={(e) => setBulkRoleValue(e.target.value)}
                  className="text-xs text-slate-700 outline-none bg-transparent pr-1"
                >
                  <option value="">Ubah Role Multi...</option>
                  {accessRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bulkRoleValue}
                  onClick={handleBulkApplyRole}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#1A284F] text-white hover:bg-[#2a3d6e] disabled:opacity-40 cursor-pointer"
                >
                  Terapkan Role
                </button>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                <select
                  value={bulkGroupingValue}
                  onChange={(e) => setBulkGroupingValue(e.target.value)}
                  className="text-xs text-slate-700 outline-none bg-transparent pr-1"
                >
                  <option value="">Ubah Groupings Multi...</option>
                  {accessGroups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!bulkGroupingValue}
                  onClick={handleBulkApplyGrouping}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#248277] text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  Terapkan Groupings
                </button>
              </div>

              <button type="button" onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs border border-gray-200 bg-white rounded-lg text-gray-600 hover:bg-gray-50 cursor-pointer">
                Batal Pilih
              </button>
              <button type="button" onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer">
                <Trash2 size={13} /> Delete / Archive Terpilih
              </button>
            </div>
          </div>
        )}

        {/* USER_MGMT.1: Urutan kolom: Checklist | No | Action | Reg No | ID Employee | Name | Division | Departement | Role | Groupings | Status | Last Login */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="w-10 pl-5 pr-1 py-3 text-left">
                  <input type="checkbox" checked={allPageChecked} onChange={togglePageAll} className="h-3.5 w-3.5 accent-[#1A284F] cursor-pointer" aria-label="Pilih semua user di halaman ini" />
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">No</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Reg No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">ID Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Division</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Departement</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Groupings</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Status Karyawan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={13} className="text-center text-gray-400 py-14">No users match the current filter.</td></tr>
              ) : paginated.map((user, idx) => {
                const userUnitCfg = getUnitLoginConfig(user.company);
                const isUserUnitPwdMode = userUnitCfg.enabledMethods.includes("password");
                const userSec = getUserSecurityRecord(user.employeeId, user.regNo, user.company);
                const dupPeers = duplicateEmployeeIdPeersByUserId.get(user.id) ?? [];
                const dupTooltipText =
                  dupPeers.length > 0
                    ? `ID Karyawan (${user.employeeId}) juga digunakan pada: ${dupPeers
                        .map((p) => `${p.name} (Reg No: ${p.regNo || "—"}, Unit: ${p.company})`)
                        .join(" • ")}`
                    : "";
                const crossRegPeers = crossUnitRegNoPeersByUserId.get(user.id) ?? [];
                const crossRegTooltipText =
                  crossRegPeers.length > 0
                    ? `Reg No (${user.regNo}) juga terdaftar pada unit usaha lain: ${crossRegPeers
                        .map((p) => `${p.name} (ID: ${p.employeeId}, Unit: ${p.company})`)
                        .join(" • ")}`
                    : "";
                return (
                <tr key={user.id} className={`border-b border-gray-50 hover:bg-blue-50/20 transition-colors ${selectedIds.has(user.id) ? "bg-rose-50/50" : idx % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                  <td className="pl-5 pr-1 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(user.id)}
                      disabled={!isSelectable(user)}
                      onChange={() => toggleOne(user.id)}
                      title={isSelectable(user) ? "Pilih user" : "Akun yang sedang login tidak dapat dihapus"}
                      className="h-3.5 w-3.5 accent-[#1A284F] cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-3 text-center text-xs font-semibold text-gray-500 tabular-nums">
                    {(page - 1) * pageSize + idx + 1}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View"><Eye size={14} /></button>
                      <button onClick={() => setEditUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit"><Edit2 size={14} /></button>
                      <button
                        type="button"
                        disabled={!isUserUnitPwdMode}
                        onClick={() => {
                          if (isUserUnitPwdMode) setResetPwdUser(user);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isUserUnitPwdMode
                            ? "text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                            : "text-gray-300 opacity-40 cursor-not-allowed"
                        }`}
                        title={
                          isUserUnitPwdMode
                            ? "Reset Password menjadi Password Default"
                            : `Non-aktif: Unit ${user.company} tidak menggunakan metode login Password`
                        }
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button onClick={() => setDeleteUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                  {/* Reg No */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {crossRegPeers.length > 0 ? (
                      <div>
                        <span className="group/dupreg relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-mono font-bold text-[11px] cursor-help">
                          <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                          <span>{user.regNo || "—"}</span>
                          <span
                            role="tooltip"
                            className="pointer-events-none invisible opacity-0 group-hover/dupreg:visible group-hover/dupreg:opacity-100 transition-opacity absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-xl bg-[#1A284F] text-white p-2.5 text-[11px] font-sans font-normal shadow-xl leading-relaxed whitespace-normal"
                          >
                            <span className="block font-bold text-amber-300 mb-0.5">Info Reg No Lintas Unit Usaha</span>
                            {crossRegTooltipText}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="font-mono font-semibold text-[#1A284F]">{user.regNo || "—"}</div>
                    )}
                    {!user.regNoAp1 && !user.regNoAp2 ? (
                      <div className="mt-0.5">
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium">
                          Belum ada approver
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        AP1: <span className="text-gray-600 font-medium">{user.regNoAp1}</span> · AP2:{" "}
                        <span className="text-gray-600 font-medium">{user.regNoAp2}</span>
                      </div>
                    )}
                  </td>
                  {/* ID Employee */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {dupPeers.length > 0 ? (
                      <span className="group/dupid relative inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-mono font-bold text-[11px] cursor-help">
                        <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                        <span>{user.employeeId}</span>
                        <span
                          role="tooltip"
                          className="pointer-events-none invisible opacity-0 group-hover/dupid:visible group-hover/dupid:opacity-100 transition-opacity absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-xl bg-[#1A284F] text-white p-2.5 text-[11px] font-sans font-normal shadow-xl leading-relaxed whitespace-normal"
                        >
                          <span className="block font-bold text-amber-300 mb-0.5">Info ID Karyawan Sama</span>
                          {dupTooltipText}
                        </span>
                      </span>
                    ) : (
                      <span className="font-mono font-semibold text-gray-800">{user.employeeId || "—"}</span>
                    )}
                  </td>
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(user.id, user.name)}`}>
                        {initials(user.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 leading-tight">{user.name}</p>
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span>{user.position || "—"}{user.bagian ? ` (${user.bagian})` : ""}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px]">
                    <span className="block truncate" title={user.division}>{user.division}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">{user.department}</span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <RoleBadge role={user.role} />
                      {(user.role === "HR Unit" || user.isHrUnitChecker) && (
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-medium"
                          title={getEffectiveCheckerUnits(user).join(", ")}
                        >
                          {getEffectiveCheckerUnits(user).length > 1
                            ? `Checker HR (${getEffectiveCheckerUnits(user).length} Unit)`
                            : "Checker HR Unit"}
                        </span>
                      )}
                      {(user.role === "HR ICF" || user.isHrIcfValidator) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                          Validate HR ICF (= Admin)
                        </span>
                      )}
                      {Boolean(user.isKpiBusinessChecker) && (
                        <span
                          className="text-[10px] px-1.5 py-0.2 rounded bg-teal-100 text-teal-800 font-medium"
                          title={(user.kpiBusinessCheckerUnits?.length ? user.kpiBusinessCheckerUnits : [KPI_BUSINESS_GROUP_SCOPE_TOKEN, ...COMPANIES]).join(", ")}
                        >
                          Checker KPI Business
                        </span>
                      )}
                      {(user.role === "Director" || user.directorCalibrationRole) && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                          (user.directorCalibrationRole ?? "approver") === "mengetahui"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}>
                          Calibration: {(user.directorCalibrationRole ?? "approver") === "mengetahui" ? "Mengetahui" : "Approver"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-xs font-medium">{user.groupings}</span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {user.employeeStatus ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded font-semibold text-[11px] ${
                            user.employeeStatus === "Promosi"
                              ? "bg-violet-50 text-violet-700 border border-violet-200"
                              : user.employeeStatus === "Mutasi"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-sky-50 text-sky-700 border border-sky-200"
                          }`}
                        >
                          {user.employeeStatus}
                        </span>
                        {(user.effectiveDate || user.employeeStatusNote) && (
                          <span
                            className="text-[10px] text-gray-500 max-w-[160px] truncate"
                            title={`${user.effectiveDate ? `Tgl Efektif: ${normalizeDateDDMMYYYY(user.effectiveDate)}` : ""}${
                              user.effectiveDate && user.employeeStatusNote ? " · " : ""
                            }${user.employeeStatusNote || ""}`}
                          >
                            {user.effectiveDate ? normalizeDateDDMMYYYY(user.effectiveDate) : ""}
                            {user.effectiveDate && user.employeeStatusNote ? " · " : ""}
                            {user.employeeStatusNote || ""}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={user.status} />
                      {isUserUnitPwdMode && userSec?.isBlocked && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                          Diblokir (5x Salah Password)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs whitespace-nowrap tabular-nums">
                    {formatLastLoginDDMMYYYY(user.lastLogin)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {paginated.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + paginated.length} of {allFiltered.length} entries</span>
          <div className="flex items-center gap-1">
            <button disabled={page === 1} onClick={() => setCurrentPage(1)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">«</button>
            <button disabled={page === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setCurrentPage(n)}
                className={`px-3 py-1 rounded border text-xs ${n === page ? "border-[#1A284F] bg-[#1A284F] text-white" : "border-gray-200 hover:bg-gray-50"}`}>{n}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">›</button>
            <button disabled={page === totalPages} onClick={() => setCurrentPage(totalPages)} className="px-2 py-1 rounded border border-gray-200 text-xs disabled:opacity-40 hover:bg-gray-50">»</button>
          </div>
        </div>
      </div>

      {viewUser && <ViewModal user={viewUser} onClose={() => setViewUser(null)} />}
      {(editUser || addOpen) && (
        <EditModal
          mode={addOpen ? "add" : "edit"}
          originalUser={addOpen ? null : editUser}
          user={addOpen ? { id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: "", employeeId: "", position: "", company: selectedCompany, division: "", department: "", grade: "", role: "Employee", groupings: accessGroups[0] ?? GROUPINGS_SCORES[0], status: "Active", lastLogin: "", email: "" } : editUser}
          availableRoles={accessRoles}
          availableGroups={accessGroups}
          onClose={() => { setEditUser(null); setAddOpen(false); }}
          onSave={handleSave}
        />
      )}
      {deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onConfirm={(reason) => handleDelete(deleteUser.id, reason)} />}
      {bulkDeleteOpen && selectedUsers.length > 0 && (
        <DeleteModal users={selectedUsers.filter(isSelectable)} onClose={() => setBulkDeleteOpen(false)} onConfirm={(reason) => handleBulkDelete(reason)} />
      )}
      {resetPwdUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] text-white">
              <div className="flex items-center gap-2">
                <RotateCcw size={16} />
                <h3 className="font-semibold text-sm">Konfirmasi Reset Password Default</h3>
              </div>
              <button onClick={() => setResetPwdUser(null)} className="text-white/70 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-gray-600">
              <p className="leading-relaxed">
                Apakah Anda yakin ingin me-reset password untuk{" "}
                <strong className="text-gray-900">{resetPwdUser.name}</strong> (
                <span className="font-mono text-xs">{resetPwdUser.employeeId}</span> ·{" "}
                {resetPwdUser.company}) kembali menjadi <strong>Password Default</strong>?
              </p>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 space-y-1">
                <div>• Status blokir (jika akun terblokir karena 5x salah password) akan dibuka kembali.</div>
                <div>• Saat karyawan login berikutnya dengan password default, sistem akan mewajibkan karyawan membuat password baru.</div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPwdUser(null)}
                  className="px-4 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetPasswordToDefault(
                      resetPwdUser.employeeId,
                      resetPwdUser.name,
                      resetPwdUser.company,
                      resetPwdUser.regNo,
                    );
                    setResetPwdBanner(
                      `Password untuk ${resetPwdUser.name} (${resetPwdUser.employeeId}) telah di-reset ke password default awal.`,
                    );
                    setResetPwdUser(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold"
                >
                  Ya, Reset Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
