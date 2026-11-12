import { useEffect, useMemo, useRef, useState } from "react";
import { useRouteTab } from "../../../utils/useRouteTab";
import { DEFAULT_SCORE_WEIGHTS, loadUnitScoreWeights, SCORE_WEIGHT_EVENT } from "../../shared/scoringWeightStore";
import { Eye, Edit2, RefreshCw, ChevronDown, Search, X, Save, Plus, Trash2, Users, Layers, Building2, ChevronRight, Check } from "lucide-react";
import {
  defaultAllowedModulesForGrouping,
  loadManagedUsers,
  loadUnitGroupRules,
  saveManagedUsers,
  saveUnitGroupRules,
  type ManagedUser,
} from "../../../store/authStore";
import { HIERARCHICAL_COMPANY_GROUPS, useAccessManagement } from "./AccessManagement";
import { loadCalibrationOrgOptions } from "../CalibrationSetting";

type Role = "Employee" | "Supervisor" | "GM" | "HR Unit" | "HR ICF" | "Director" | "BOD" | "Administrator" | "HR Admin" | "" | string;
type Status = "Active" | "Inactive";

type User = ManagedUser;

const COMPANIES = [
  "PT RSUP (Industry)", "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM", "PT GHS", "ASD",
];
const GROUPINGS_SCORES = ["Operasional", "Ka./Wa.Ka.Seksi", "Ka./Wa.Ka.Bagian", "Ka./Wa.Ka.Dept", "Ka./Wa.Ka.Div ke atas", "Direktur / Director"];

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  "bg-yellow-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-600", "bg-sky-600",
];

function avatarColor(id: string) {
  return AVATAR_COLORS[parseInt(id) % AVATAR_COLORS.length];
}

const ROLE_BADGE: Record<string, string> = {
  "Employee":      "bg-emerald-50 text-emerald-700",
  "Supervisor":    "bg-blue-50 text-blue-700",
  "GM":            "bg-indigo-50 text-indigo-700",
  "HR Unit":       "bg-purple-50 text-purple-700",
  "HR ICF":        "bg-amber-50 text-amber-700",
  "Director":      "bg-rose-50 text-rose-700",
  "BOD":           "bg-red-50 text-red-700",
  "Administrator": "bg-slate-100 text-slate-700",
};

function RoleBadge({ role }: { role: Role }) {
  if (!role) return <span className="text-gray-300">—</span>;
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600"}`}>{role}</span>;
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
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shrink-0 ${avatarColor(user.id)}`}>
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
            { label: "Joindate", value: user.joinDate || "—" },
            { label: "Company", value: user.company },
            { label: "Division", value: user.division },
            { label: "Department", value: user.department },
            { label: "Bagian", value: user.bagian || "—" },
            { label: "Reg No AP1 (Approval 1)", value: user.regNoAp1 || "—" },
            { label: "Reg No AP2 (Approval 2)", value: user.regNoAp2 || "—" },
            { label: "Multi-Divisi (Tambahan)", value: user.managedDivisions?.length ? user.managedDivisions.join(", ") : "—" },
            { label: "Multi-Departemen (Tambahan)", value: user.managedDepartments?.length ? user.managedDepartments.join(", ") : "—" },
            { label: "Multi-Bagian (Tambahan)", value: user.managedBagians?.length ? user.managedBagians.join(", ") : "—" },
            { label: "Role", value: <RoleBadge role={user.role} /> },
            { label: "Groupings", value: user.groupings },
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
function EditModal({ user, availableRoles, availableGroups, onClose, onSave }: { user: User | null; availableRoles: Role[]; availableGroups: string[]; onClose: () => void; onSave: (u: User) => void }) {
  const isNew = !user || !user.name;
  const [form, setForm] = useState<User>(user ?? {
    id: String(Date.now()), regNo: "", name: "", employeeId: "", position: "", company: COMPANIES[0],
    division: "", department: "", bagian: "", joinDate: "", telegramNo: "", grade: "Grade 5", role: "Employee",
    groupings: availableGroups[0] ?? GROUPINGS_SCORES[0], status: "Active", lastLogin: "", email: "", regNoAp1: "", regNoAp2: "",
    isHrUnitChecker: false, isHrIcfValidator: false,
  });

  function f(key: keyof User, val: string) { setForm(p => ({ ...p, [key]: val })); }

  const calibrationOrgOpts = useMemo(
    () => loadCalibrationOrgOptions([form.company, ...(form.managedUnits ?? [])].filter(Boolean)),
    [form.company, form.managedUnits],
  );

  const calRoleMap: Record<string, "approver" | "mengetahui" | ""> = form.calibrationRoleByUnit ?? {};

  const setUnitCalRole = (unitName: string, val: "approver" | "mengetahui" | "") => {
    setForm((p) => {
      const nextMap: Record<string, "approver" | "mengetahui" | ""> = {
        ...(p.calibrationRoleByUnit ?? {}),
        [unitName]: val,
      };
      const firstNonEmpty = Object.values(nextMap).find((v) => v === "approver" || v === "mengetahui") ?? "";
      return {
        ...p,
        calibrationRoleByUnit: nextMap,
        directorCalibrationRole: firstNonEmpty,
      };
    });
  };

  const setGroupCalRole = (units: readonly string[], val: "approver" | "mengetahui" | "") => {
    setForm((p) => {
      const nextMap: Record<string, "approver" | "mengetahui" | ""> = {
        ...(p.calibrationRoleByUnit ?? {}),
      };
      for (const u of units) {
        nextMap[u] = val;
      }
      const firstNonEmpty = Object.values(nextMap).find((v) => v === "approver" || v === "mengetahui") ?? "";
      return {
        ...p,
        calibrationRoleByUnit: nextMap,
        directorCalibrationRole: firstNonEmpty,
      };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-lg">{isNew ? "Add New User" : "Edit User"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-6 grid grid-cols-2 gap-4">
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
              <input type={type} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={(form[key] as string) ?? ""} onChange={e => f(key, e.target.value)} />
            </div>
          ))}

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
                    ...(key === "role" && v === "HR Unit" ? { isHrUnitChecker: true } : {}),
                    ...(key === "role" && (v === "HR ICF" || v === "Administrator") ? { isHrIcfValidator: true } : {}),
                  }));
                }}>
                {options.map(o => <option key={o} value={o}>{(labels as Record<string,string>)[o] ?? o}</option>)}
              </select>
            </div>
          ))}

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
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <span>
                  <strong>Approval Check HR Unit Usaha</strong> (Checker KPI & SMART Goals unit usaha; bypass otomatis untuk pengajuan milik sendiri)
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
            </div>
            <div className="pt-2.5 border-t border-gray-200 space-y-2.5">
              <div>
                <p className="text-xs font-semibold text-[#1A284F]">Peran Approval Calibration</p>
                <p className="text-[11px] text-gray-500">
                  Atur peran pada halaman Calibration Approval (/approvals/calibration) per Group &amp; Unit Usaha. Memilih pada baris Group akan otomatis mengisi seluruh Unit Usaha di dalamnya (pilih kosong jika tidak terlibat).
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {HIERARCHICAL_COMPANY_GROUPS.map((grp, gIdx) => {
                  const unitVals = grp.units.map((u) => calRoleMap[u] ?? "");
                  const allSame = unitVals.every((v) => v === unitVals[0]);
                  const groupDropdownVal = allSame ? unitVals[0] : "";
                  return (
                    <div key={grp.groupName} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                      {/* Group header row with inline dropdown */}
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
                        <span className="text-xs font-bold text-[#1A284F]">
                          {gIdx + 1}. {grp.groupName}:
                        </span>
                        <select
                          value={groupDropdownVal}
                          onChange={(e) =>
                            setGroupCalRole(grp.units, e.target.value as "approver" | "mengetahui" | "")
                          }
                          className="border border-indigo-200 rounded-lg px-2 py-1 text-[11px] font-semibold bg-indigo-50/50 text-[#1A284F] focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— Tidak Terlibat (Kosong) —</option>
                          <option value="approver">Approver</option>
                          <option value="mengetahui">Mengetahui</option>
                        </select>
                      </div>
                      {/* Unit rows with inline dropdown */}
                      <div className="space-y-1.5 pl-2">
                        {grp.units.map((unit) => {
                          const unitVal = calRoleMap[unit] ?? "";
                          return (
                            <div key={unit} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-gray-700 truncate">
                                - {unit}
                              </span>
                              <select
                                value={unitVal}
                                onChange={(e) =>
                                  setUnitCalRole(unit, e.target.value as "approver" | "mengetahui" | "")
                                }
                                className={`border rounded-lg px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0 ${
                                  unitVal === "approver"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold"
                                    : unitVal === "mengetahui"
                                    ? "border-sky-200 bg-sky-50 text-sky-800 font-semibold"
                                    : "border-gray-200 bg-white text-gray-400"
                                }`}
                              >
                                <option value="">— Kosong —</option>
                                <option value="approver">Approver</option>
                                <option value="mengetahui">Mengetahui</option>
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

          <div className="col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-[#1A284F]">
                Cakupan Wewenang Berjenjang Tambahan (Multi-Scope: Unit / Divisi / Departemen / Bagian)
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Opsional: Pilih lebih dari 1 menggunakan dropdown checkbox di bawah apabila pejabat ini membawahi beberapa Unit Usaha, Divisi, Departemen, atau Bagian (data bersumber dari sistem &amp; tabel Proportion /calibration/setting).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MultiCheckboxDropdown
                label="Unit Usaha Tambahan"
                options={COMPANIES}
                selected={form.managedUnits ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedUnits: next }))}
                placeholder="— Pilih Unit Usaha Tambahan —"
              />
              <MultiCheckboxDropdown
                label="Divisi Tambahan (dari Proportion /calibration/setting)"
                options={calibrationOrgOpts.divisions}
                selected={form.managedDivisions ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedDivisions: next }))}
                placeholder="— Pilih Divisi Tambahan —"
              />
              <MultiCheckboxDropdown
                label="Departemen Tambahan (dari Proportion /calibration/setting)"
                options={calibrationOrgOpts.departments}
                selected={form.managedDepartments ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedDepartments: next }))}
                placeholder="— Pilih Departemen Tambahan —"
              />
              <MultiCheckboxDropdown
                label="Bagian Tambahan (dari Proportion /calibration/setting)"
                options={calibrationOrgOpts.bagians}
                selected={form.managedBagians ?? []}
                onChange={(next) => setForm((p) => ({ ...p, managedBagians: next }))}
                placeholder="— Pilih Bagian Tambahan —"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => { onSave(form); onClose(); }}
            className="px-4 py-2 text-sm bg-[#1A284F] text-white rounded-lg hover:bg-[#2a3d6e] flex items-center gap-1.5">
            <Save size={14} /> {isNew ? "Add User" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ user, onClose, onConfirm }: { user: User; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Delete User</h2>
            <p className="text-sm text-gray-500">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">Are you sure you want to remove <strong>{user.name}</strong> (ID: {user.employeeId}) from the system?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
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
function moduleWeight(module: AppraisalModule, group: string, weights = DEFAULT_SCORE_WEIGHTS) {
  return module === "Inter-Departement Feedback" ? "Tidak berbobot" : weights[SCORE_INDICATOR_BY_MODULE[module]]?.[GROUP_WEIGHT_COLUMNS[group] ?? "operasional"] ?? "-";
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
                  <span className={`text-xs font-semibold ${moduleWeight(module, form.group, weights) === "-" ? "text-gray-400" : "text-[#1A284F]"}`}>{moduleWeight(module, form.group, weights)}</span>
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
  const [rulesByCompany, setRulesByCompany] = useState<Record<string, GroupRule[]>>(() =>
    Object.fromEntries(COMPANIES.map(company => [company, loadUnitGroupRules(company, structuredClone(INITIAL_GROUP_RULES))])),
  );
  const [editRule, setEditRule] = useState<GroupRule | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteRule, setDeleteRule] = useState<GroupRule | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("All Groups");
  const [weights, setWeights] = useState(() => loadUnitScoreWeights(companyName));
  useEffect(() => {
    const refresh = () => setWeights(loadUnitScoreWeights(companyName));
    refresh();
    window.addEventListener(SCORE_WEIGHT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(SCORE_WEIGHT_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, [companyName]);
  const rules = rulesByCompany[companyName] ?? INITIAL_GROUP_RULES;

  const filtered = rules.filter(r => {
    if (groupFilter !== "All Groups" && r.group !== groupFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.position.toLowerCase().includes(q) && !r.group.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilters = groupFilter !== "All Groups";

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
    const unitUsers = loadManagedUsers().filter(u => u.company === companyName && u.position.trim());
    const current = rulesByCompany[companyName] ?? [];
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

    if (addedRules.length > 0) {
      const nextList = [...current, ...addedRules];
      saveUnitGroupRules(companyName, nextList);
      setRulesByCompany(prev => ({ ...prev, [companyName]: nextList }));
    }
  }

  // Summary: count per group
  const groupCounts = accessGroups.map(g => ({ group: g, count: rules.filter(r => r.group === g).length }));

  return (
    <div className="space-y-4">
      {/* Group summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {groupCounts.map(({ group, count }) => {
          const c = GROUP_COLORS[group] ?? { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-300" };
          return (
            <div key={group} className={`rounded-xl px-4 py-3.5 border border-gray-100 shadow-sm ${c.bg}`}>
              <p className={`text-xl font-black ${c.text}`}>{count}</p>
              <p className="text-xs font-semibold text-gray-600 mt-0.5 leading-tight">{group}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{count === 1 ? "position" : "positions"} mapped</p>
            </div>
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
            <button onClick={() => setGroupFilter("All Groups")} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
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

function CompanyUnitPicker({ users, onSelect }: { users: User[]; onSelect: (company: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = COMPANIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 w-full space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select a Company Unit to manage its users</p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span><span>Setting</span><span className="mx-1">›</span>
          <span className="font-medium text-gray-700">User Management</span>
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

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((company, idx) => {
            const userCount = users.filter(u => u.company === company).length;
            const activeCount = users.filter(u => u.company === company && u.status === "Active").length;
            const gradient = COMPANY_COLORS[idx % COMPANY_COLORS.length];
            return (
              <button
                key={company}
                onClick={() => onSelect(company)}
                className="group text-left rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
              >
                <div className={`bg-gradient-to-br ${gradient} px-5 py-4`}>
                  <Building2 size={22} className="text-white/80 mb-2" />
                  <p className="text-white font-semibold text-sm leading-tight">{company}</p>
                </div>
                <div className="bg-white px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-800">{userCount}</p>
                    <p className="text-[11px] text-gray-400">{activeCount} active</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function UserManagementPage() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useRouteTab<"users" | "grouping">(["users", "grouping"], "users");
  const [users, setUsers] = useState<User[]>(() => loadManagedUsers());
  const { roles: accessRoles, groups: accessGroups } = useAccessManagement();
  const [pageSize, setPageSize] = useState(10);
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [search, setSearch] = useState("");
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
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

  if (!selectedCompany) {
    return <CompanyUnitPicker users={users} onSelect={setSelectedCompany} />;
  }

  const companyUsers = users.filter(u => u.company === selectedCompany);

  const allFiltered = companyUsers.filter(u => {
    if (roleFilter !== "All Roles" && u.role !== roleFilter) return false;
    if (statusFilter !== "All Status" && u.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.employeeId.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(allFiltered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginated = allFiltered.slice((page - 1) * pageSize, page * pageSize);

  function reset() {
    setSearch(""); setRoleFilter("All Roles"); setStatusFilter("All Status"); setCurrentPage(1);
  }

  function handleSave(updated: User) {
    setUsers(prev => {
      const next = prev.some(u => u.id === updated.id)
        ? prev.map(u => u.id === updated.id ? updated : u)
        : [...prev, updated];
      saveManagedUsers(next, updated);
      return next;
    });
  }

  function handleDelete(id: string) {
    setUsers(prev => {
      const deleted = prev.find(u => u.id === id);
      const next = prev.filter(u => u.id !== id);
      saveManagedUsers(next, undefined, deleted?.employeeId);
      return next;
    });
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
      {/* Stats */}
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "Total Users",    value: companyUsers.length, color: "bg-[#1A284F] text-white" },
          { label: "Employee",       value: employeeCount,       color: "bg-emerald-600 text-white" },
          { label: "Supervisor",     value: supervisorCount,     color: "bg-blue-600 text-white" },
          { label: "GM",             value: gmCount,             color: "bg-indigo-600 text-white" },
          { label: "HR Unit",        value: hrUnitCount,         color: "bg-purple-600 text-white" },
          { label: "HR ICF",         value: hrIcfCount,          color: "bg-amber-500 text-white" },
          { label: "Director",       value: directorCount,       color: "bg-rose-600 text-white" },
          { label: "Administrator",  value: adminCount,          color: "bg-slate-600 text-white" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-5 py-4 ${s.color} shadow-sm`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs opacity-80 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
          {/* Show entries */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Show</span>
            <div className="relative">
              <select className="appearance-none border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
                {[10, 25, 50].map(n => <option key={n}>{n}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <span>entries</span>
          </div>

          {[
            { val: roleFilter, set: (v: string) => { setRoleFilter(v); setCurrentPage(1); }, opts: ["All Roles", ...accessRoles] },
            { val: statusFilter, set: (v: string) => { setStatusFilter(v); setCurrentPage(1); }, opts: ["All Status", "Active", "Inactive"] },
          ].map(({ val, set, opts }, i) => (
            <div key={i} className="relative">
              <select className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={val} onChange={e => set(e.target.value)}>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          ))}

          <div className="flex-1" />
          <button onClick={reset} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50" title="Reset filters"><RefreshCw size={14} /></button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
              placeholder="Search name, ID, email..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
          </div>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A284F] text-white text-sm rounded-lg hover:bg-[#2a3d6e]">
            <Plus size={14} /> Add User
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reg No & AP1/AP2</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company / Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Division</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dept</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Groupings Scores</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-gray-400 py-14">No users match the current filter.</td></tr>
              ) : paginated.map((user, idx) => (
                <tr key={user.id} className={`border-b border-gray-50 hover:bg-blue-50/20 transition-colors ${idx % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View"><Eye size={14} /></button>
                      <button onClick={() => setEditUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteUser(user)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 ${avatarColor(user.id)}`}>
                        {initials(user.name)}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 leading-tight">{user.name}</p>
                        <p className="text-xs text-gray-400">{user.employeeId} · {user.position}{user.bagian ? ` (${user.bagian})` : ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-mono font-semibold text-[#1A284F]">{user.regNo || "—"}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      AP1: <span className="text-gray-600 font-medium">{user.regNoAp1 || "—"}</span> · AP2:{" "}
                      <span className="text-gray-600 font-medium">{user.regNoAp2 || "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px]">
                    <span className="block truncate" title={user.company}>{user.company}</span>
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
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-medium">
                          Checker HR Unit
                        </span>
                      )}
                      {(user.role === "HR ICF" || user.isHrIcfValidator) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-medium">
                          Validate HR ICF (= Admin)
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
                  <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{user.lastLogin || "—"}</td>
                </tr>
              ))}
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
          user={addOpen ? { id: String(Date.now()), name: "", employeeId: "", position: "", company: selectedCompany, division: "", department: "", grade: "", role: "Employee", groupings: accessGroups[0] ?? GROUPINGS_SCORES[0], status: "Active", lastLogin: "", email: "" } : editUser}
          availableRoles={accessRoles}
          availableGroups={accessGroups}
          onClose={() => { setEditUser(null); setAddOpen(false); }}
          onSave={handleSave}
        />
      )}
      {deleteUser && <DeleteModal user={deleteUser} onClose={() => setDeleteUser(null)} onConfirm={() => handleDelete(deleteUser.id)} />}
      </>}
    </div>
  );
}
