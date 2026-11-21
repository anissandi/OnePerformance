import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, ChevronDown, Eye, Filter, Pencil, PlayCircle, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  canUserAccessEmployeeData,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  isUserEligibleForDelegation,
  loadManagedUsers,
  normalizeApproverPair,
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
export function DelegationTable({ mode = "settings" }: { mode?: "settings" | "approvals" } = {}) {
  const { activeUser, allUsers, delegations } = useLiveData();
  const isAdmin = isAdminOrHrIcfRole(activeUser.role);
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");

  const isSelf = (u: ManagedUser) => lc(u.employeeId) === lc(activeUser.employeeId);
  // - Approvals → Delegation: hanya baris milik user yang login (memilih sendiri penerima delegasinya)
  // - Settings → Approval Management → Delegation: Administrator/HR ICF melihat seluruh karyawan eligible;
  //   user lain yang di-allow submenu ini melihat karyawan sesuai cakupan wewenangnya (Role + Groupings + AP1/AP2)
  const scoped = (u: ManagedUser) => {
    if (mode === "approvals") return isSelf(u);
    if (!isUserEligibleForDelegation(u)) return false;
    if (isAdmin) return true;
    return isSelf(u) || canUserAccessEmployeeData(activeUser, u.employeeId, allUsers);
  };

  const basePool = useMemo(() => {
    const pool = allUsers.filter((u) => scoped(u));
    if (mode === "approvals" && pool.length === 0 && activeUser.employeeId) return [activeUser];
    return pool;
  }, [allUsers, activeUser, isAdmin, mode]);
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

  const rows = basePool
    .filter((u) => !unitFilter || u.company === unitFilter)
    .filter((u) => !divisionFilter || u.division === divisionFilter)
    .filter((u) => !departmentFilter || u.department === departmentFilter)
    .filter((u) => !positionFilter || u.position === positionFilter)
    .filter(
      (u) =>
        !search ||
        [u.name, u.employeeId, u.regNo, u.company, u.division, u.department, u.position].some((v) =>
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

  return (
    <div className="space-y-4">
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
            {rows.map((u, i) => {
              const d = delegations[u.employeeId.toUpperCase()] ?? blankDelegation(u.employeeId);
              const canStart =
                Boolean(d.delegateEmployeeId) &&
                (d.kpiSetting || d.kpiTracking || d.smartGoalsSetting || d.smartGoalsMeasurement);
              const rowOptions = eligibleDelegatesPool.filter(
                (c) => lc(c.employeeId) !== lc(u.employeeId) && isSameCompanyUnit(c.company, u.company),
              );
              return (
                <tr key={u.employeeId} className={`border-t border-gray-100 transition-colors ${d.active ? "bg-emerald-50/40" : "hover:bg-slate-50/60"}`}>
                  <td className="px-3 py-2">{i + 1}</td>
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
                      lookupPool={allUsers}
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
      <p className="text-[11px] text-gray-500">
        Klik tag modul (<strong>KPI Setting</strong>, <strong>KPI Tracking</strong>, <strong>SMART Goals Setting</strong>,{" "}
        <strong>SMART Goals Measurement</strong>) serta tag <strong>Hak Akses</strong> untuk memilih atau menonaktifkan pilihan.
        Delegasi aktif membuat karyawan yang ditunjuk menerima akses modul, notifikasi, serta task approval sesuai tag modul yang aktif (tag <strong>Approve</strong> wajib aktif untuk persetujuan),
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
    if (!ref || !ref.trim()) return "Belum ada approver";
    const u = findByRef(allUsers, ref);
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
