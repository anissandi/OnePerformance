import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, ChevronDown, Eye, Filter, Pencil, PlayCircle, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  canUserAccessEmployeeData,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  isUserEligibleForDelegation,
  loadManagedUsers,
  saveManagedUsers,
  useAuthStore,
  type ManagedUser,
} from "../../store/authStore";
import {
  DELEGATION_EVENT,
  blankDelegation,
  loadDelegations,
  saveDelegation,
  type DelegationAccess,
  type DelegationRecord,
} from "../../store/delegationStore";
import { pushEmployeeNotification } from "../../store/notificationStore";

const lc = (v?: string) => String(v ?? "").trim().toLowerCase();
const findByRef = (users: ManagedUser[], ref?: string) =>
  ref ? users.find((u) => lc(u.regNo) === lc(ref) || lc(u.employeeId) === lc(ref)) : undefined;

function useLiveData() {
  const { activeUser, allUsers } = useAuthStore();
  const [delegations, setDelegations] = useState(() => loadDelegations());
  useEffect(() => {
    const r = () => setDelegations(loadDelegations());
    window.addEventListener(DELEGATION_EVENT, r);
    window.addEventListener("pa-db-hydrated", r);
    return () => {
      window.removeEventListener(DELEGATION_EVENT, r);
      window.removeEventListener("pa-db-hydrated", r);
    };
  }, []);
  return { activeUser, allUsers: allUsers.filter((u) => u.status === "Active"), delegations };
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
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  unitOptions: string[];
  divisionOptions: string[];
  departmentOptions: string[];
  sectionOptions: string[];
  positionOptions: string[];
  unitFilter: string;
  onUnitChange: (v: string) => void;
  divisionFilter: string;
  onDivisionChange: (v: string) => void;
  departmentFilter: string;
  onDepartmentChange: (v: string) => void;
  sectionFilter: string;
  onSectionChange: (v: string) => void;
  positionFilter: string;
  onPositionChange: (v: string) => void;
  onReset: () => void;
}) {
  const hasFilter = Boolean(
    search || unitFilter || divisionFilter || departmentFilter || sectionFilter || positionFilter,
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
      <select value={sectionFilter} onChange={(e) => onSectionChange(e.target.value)} className={selectCls} aria-label="Filter Bagian">
        <option value="">Semua Bagian</option>
        {sectionOptions.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
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
  lookupPool,
  disabled,
  onChange,
}: {
  value: string;
  options: ManagedUser[];
  lookupPool?: ManagedUser[];
  disabled?: boolean;
  onChange: (employeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 288 });

  const pool = lookupPool ?? options;
  const selected =
    options.find((u) => lc(u.employeeId) === lc(value) || (u.regNo && lc(u.regNo) === lc(value))) ??
    pool.find((u) => lc(u.employeeId) === lc(value) || (u.regNo && lc(u.regNo) === lc(value)));
  const list = options
    .filter((u) => !q || [u.name, u.employeeId, u.regNo, u.position].some((v) => lc(v).includes(lc(q))))
    .slice(0, 40);

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
          {selected ? selected.name : value ? value : "Pilih karyawan…"}
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

/**
 * Tabel Delegation (dipakai di Settings → Approval Management dan Approvals → Delegation).
 * Hanya karyawan ber-grouping Ka./Wa.Ka.Bagian ke atas yang boleh memberi & menerima delegasi.
 * Kandidat penerima delegasi hanya dari Unit Usaha pemberi delegasi dan bukan ber-role Employee.
 */
export function DelegationTable({ mode = "settings" }: { mode?: "settings" | "approvals" } = {}) {
  const { activeUser, allUsers, delegations } = useLiveData();
  const isAdmin = isAdminOrHrIcfRole(activeUser.role);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  const scoped = (u: ManagedUser) => {
    if (!isUserEligibleForDelegation(u)) return false;
    if (isAdmin || mode === "settings") return true;
    return canUserAccessEmployeeData(activeUser, u.employeeId, allUsers);
  };

  const basePool = useMemo(() => allUsers.filter((u) => scoped(u)), [allUsers, activeUser, isAdmin, mode]);
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
  const sectionOptions = useMemo(
    () =>
      uniqSorted(
        basePool
          .filter(
            (u) =>
              (!unitFilter || u.company === unitFilter) &&
              (!divisionFilter || u.division === divisionFilter) &&
              (!departmentFilter || u.department === departmentFilter),
          )
          .map((u) => u.bagian),
      ),
    [basePool, unitFilter, divisionFilter, departmentFilter],
  );
  const positionOptions = useMemo(
    () =>
      uniqSorted(
        basePool
          .filter(
            (u) =>
              (!unitFilter || u.company === unitFilter) &&
              (!divisionFilter || u.division === divisionFilter) &&
              (!departmentFilter || u.department === departmentFilter) &&
              (!sectionFilter || (u.bagian || "") === sectionFilter),
          )
          .map((u) => u.position),
      ),
    [basePool, unitFilter, divisionFilter, departmentFilter, sectionFilter],
  );

  const rows = basePool
    .filter((u) => !unitFilter || u.company === unitFilter)
    .filter((u) => !divisionFilter || u.division === divisionFilter)
    .filter((u) => !departmentFilter || u.department === departmentFilter)
    .filter((u) => !sectionFilter || (u.bagian || "") === sectionFilter)
    .filter((u) => !positionFilter || u.position === positionFilter)
    .filter(
      (u) =>
        !search ||
        [u.name, u.employeeId, u.regNo, u.company, u.division, u.department, u.bagian, u.position].some((v) =>
          lc(v).includes(lc(search)),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Kandidat penerima delegasi: wajib Ka./Wa.Ka.Bagian ke atas, bukan role Employee, dan dalam Unit Usaha yang sama dengan pemberi delegasi
  const eligibleDelegatesPool = useMemo(
    () => allUsers.filter((c) => c.role !== "Employee" && isUserEligibleForDelegation(c)),
    [allUsers],
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
      const mods = [saved.kpiSetting && "KPI Setting", saved.kpiTracking && "KPI Tracking", saved.smartGoalsSetting && "SMART Goals Setting"].filter(Boolean).join(", ");
      const perms = ACCESS_KEYS.filter(([k]) => saved.access?.[k]).map(([, lbl]) => lbl).join(", ");
      const targetRoute = saved.kpiSetting ? "/setting/kpi" : saved.kpiTracking ? "/measurement/kpi-tracking" : saved.smartGoalsSetting ? "/setting/smart-goals" : "/approvals";
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
      const prevMods = [base.kpiSetting && "KPI Setting", base.kpiTracking && "KPI Tracking", base.smartGoalsSetting && "SMART Goals Setting"]
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

  return (
    <div className="space-y-4">
      <OrgFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama, ID Karyawan, divisi, jabatan…"
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
                "Delegasi Kepada",
                "KPI Setting",
                "KPI Tracking",
                "SMART Goals Setting",
                "Hak Akses",
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const d = delegations[u.employeeId.toUpperCase()] ?? blankDelegation(u.employeeId);
              const canStart = Boolean(d.delegateEmployeeId) && (d.kpiSetting || d.kpiTracking || d.smartGoalsSetting);
              const rowOptions = eligibleDelegatesPool.filter(
                (c) => lc(c.employeeId) !== lc(u.employeeId) && isSameCompanyUnit(c.company, u.company),
              );
              return (
                <tr key={u.employeeId} className={`border-t border-gray-100 ${d.active ? "bg-emerald-50/40" : ""}`}>
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!d.active && !canStart}
                      title={d.active ? "Hentikan delegasi (Stop)" : canStart ? "Mulai delegasi (Start)" : "Pilih Delegasi Kepada & minimal 1 modul"}
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
                  <td className="px-3 py-2">{u.bagian || "-"}</td>
                  <td className="px-3 py-2">{u.position || "-"}</td>
                  <td className="px-3 py-2">
                    <EmployeePicker
                      value={d.delegateEmployeeId}
                      options={rowOptions}
                      lookupPool={allUsers}
                      onChange={(id) => update(u, { delegateEmployeeId: id, active: id ? d.active : false }, "Set Delegation To")}
                    />
                  </td>
                  {(["kpiSetting", "kpiTracking", "smartGoalsSetting"] as const).map((k) => (
                    <td key={k} className="px-3 py-2 text-center">
                      <input type="checkbox" checked={d[k]} onChange={() => update(u, { [k]: !d[k] }, `Toggle ${k}`)} className="h-4 w-4 accent-[#1A284F]" />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {ACCESS_KEYS.map(([k, label]) => (
                        <label key={k} className="inline-flex items-center gap-1 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={Boolean(d.access?.[k])}
                            onChange={() => update(u, { access: { ...d.access, [k]: !d.access?.[k] } }, `Toggle access ${k}`)}
                            className="h-3.5 w-3.5 accent-[#1A284F]"
                          />
                          {label}
                        </label>
                      ))}
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
      <p className="text-[11px] text-gray-500">
        Delegasi aktif membuat karyawan yang ditunjuk menerima notifikasi & task approval sesuai modul yang dicentang (akses Approve wajib),
        dan nama approver tercatat sebagai <strong>"Nama Delegasi | atas nama Nama Pemberi Delegasi"</strong>.
      </p>
    </div>
  );
}

/** Tab Approver Monitoring: AP1 & AP2 seluruh karyawan, dengan View & Edit. */
export function ApproverMonitoringTable() {
  const { allUsers } = useLiveData();
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

  const rows = allUsers
    .filter((u) => !unitFilter || u.company === unitFilter)
    .filter((u) => !divisionFilter || u.division === divisionFilter)
    .filter((u) => !departmentFilter || u.department === departmentFilter)
    .filter((u) => !sectionFilter || (u.bagian || "") === sectionFilter)
    .filter((u) => !positionFilter || u.position === positionFilter)
    .filter(
      (u) =>
        !search ||
        [u.name, u.employeeId, u.regNo, u.company, u.division, u.department, u.bagian, u.position, u.role].some((v) =>
          lc(v).includes(lc(search)),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (ref?: string) => {
    const u = findByRef(allUsers, ref);
    return u ? u.name : ref || "-";
  };
  function saveEdit() {
    if (!edit) return;
    const a1 = allUsers.find((u) => u.employeeId === ap1);
    const a2 = allUsers.find((u) => u.employeeId === ap2);
    const changed: ManagedUser = { ...edit, regNoAp1: a1 ? a1.regNo || a1.employeeId : "", regNoAp2: a2 ? a2.regNo || a2.employeeId : "" };
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
            {rows.map((u, i) => (
              <tr key={u.employeeId} className="border-t border-gray-100">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" title="Lihat Detail" onClick={() => setView(u)} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50"><Eye className="h-4 w-4" /></button>
                    <button
                      type="button"
                      title="Edit Approver"
                      onClick={() => {
                        setEdit(u);
                        setAp1(findByRef(allUsers, u.regNoAp1)?.employeeId ?? "");
                        setAp2(findByRef(allUsers, u.regNoAp2)?.employeeId ?? "");
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
                  <div className="mt-1"><EmployeePicker value={ap1} options={allUsers.filter((u) => u.employeeId !== edit.employeeId)} lookupPool={allUsers} onChange={setAp1} /></div>
                </label>
                <label className="block text-xs font-bold text-gray-500">Approver 2
                  <div className="mt-1"><EmployeePicker value={ap2} options={allUsers.filter((u) => u.employeeId !== edit.employeeId)} lookupPool={allUsers} onChange={setAp2} /></div>
                </label>
                {ap1 && ap1 === ap2 && <p className="text-xs text-amber-700">Approver 1 & 2 sama — approval cukup dilakukan 1 kali.</p>}
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
