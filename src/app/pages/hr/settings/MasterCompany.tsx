import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Edit2,
  Layers,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "../../../store/authStore";
import { hasRolePermission } from "./AccessManagement";
import {
  MASTER_COMPANY_UPDATED_EVENT,
  loadMasterCompanyCatalog,
  makeGroupSlug,
  refreshMasterCompanyCatalogFromBackend,
  saveMasterCompanyCatalog,
  type MasterCompanyCatalog,
  type MasterCompanyUnitRow,
} from "./masterCompanyStore";

interface CompanyRowForm {
  uid?: string;
  groupUid: string;
  companyGroup: string;
  idGroup: string;
  abbGroup: string;
  companyUnit: string;
  idUnit: string;
  abbUnit: string;
}

const EMPTY_FORM: CompanyRowForm = {
  groupUid: "",
  companyGroup: "",
  idGroup: "",
  abbGroup: "",
  companyUnit: "",
  idUnit: "",
  abbUnit: "",
};

const GROUP_BADGE_PALETTE = [
  "bg-[#EBF2FA] text-[#2F5597] border-[#C9DCF0]",
  "bg-[#E6F3F1] text-[#1D6863] border-[#B8DDD8]",
  "bg-[#FDF3E7] text-[#9A5B13] border-[#F3CFA4]",
  "bg-emerald-50 text-emerald-800 border-emerald-200",
  "bg-slate-100 text-slate-700 border-slate-200",
];

export function MasterCompanyPage() {
  const { activeUser } = useAuthStore();
  const canEdit = useMemo(() => {
    const r = activeUser?.role || "Employee";
    return (
      r === "Administrator" ||
      r === "HR ICF" ||
      r === "HR Admin" ||
      hasRolePermission(r, "setting_master_company", "edit") ||
      hasRolePermission(r, "setting_master_kpi", "edit")
    );
  }, [activeUser?.role]);

  const [catalog, setCatalog] = useState<MasterCompanyCatalog>(() => loadMasterCompanyCatalog());
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [form, setForm] = useState<CompanyRowForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<MasterCompanyUnitRow | null>(null);

  useEffect(() => {
    void refreshMasterCompanyCatalogFromBackend().then(setCatalog);
    const onSync = () => setCatalog(loadMasterCompanyCatalog());
    window.addEventListener(MASTER_COMPANY_UPDATED_EVENT, onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    return () => {
      window.removeEventListener(MASTER_COMPANY_UPDATED_EVENT, onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
    };
  }, []);

  const distinctGroups = useMemo(() => {
    const map = new Map<string, { groupUid: string; name: string; idGroup: string; abbGroup: string; count: number }>();
    for (const r of catalog.rows) {
      const cur = map.get(r.groupUid);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(r.groupUid, {
          groupUid: r.groupUid,
          name: r.companyGroup,
          idGroup: r.idGroup,
          abbGroup: r.abbGroup,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => Number(a.idGroup || 99) - Number(b.idGroup || 99));
  }, [catalog.rows]);

  const groupPaletteByUid = useMemo(() => {
    const out: Record<string, string> = {};
    distinctGroups.forEach((g, idx) => {
      out[g.groupUid] = GROUP_BADGE_PALETTE[idx % GROUP_BADGE_PALETTE.length];
    });
    return out;
  }, [distinctGroups]);

  const sortedFilteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...catalog.rows]
      .sort((a, b) => {
        const ga = Number(a.idGroup);
        const gb = Number(b.idGroup);
        if (Number.isFinite(ga) && Number.isFinite(gb) && ga !== gb) return ga - gb;
        const ua = Number(a.idUnit);
        const ub = Number(b.idUnit);
        if (Number.isFinite(ua) && Number.isFinite(ub) && ua !== ub) return ua - ub;
        return a.companyUnit.localeCompare(b.companyUnit);
      })
      .filter((r) => {
        if (groupFilter !== "ALL" && r.groupUid !== groupFilter) return false;
        if (!q) return true;
        return (
          r.companyGroup.toLowerCase().includes(q) ||
          r.idGroup.toLowerCase().includes(q) ||
          r.abbGroup.toLowerCase().includes(q) ||
          r.companyUnit.toLowerCase().includes(q) ||
          r.idUnit.toLowerCase().includes(q) ||
          r.abbUnit.toLowerCase().includes(q)
        );
      });
  }, [catalog.rows, search, groupFilter]);

  const openAddNew = (prefillRow?: MasterCompanyUnitRow) => {
    if (prefillRow) {
      const unitsInGroup = catalog.rows.filter((r) => r.groupUid === prefillRow.groupUid);
      const maxUnitId = unitsInGroup.reduce((mx, r) => Math.max(mx, Number(r.idUnit) || 0), 0);
      setForm({
        groupUid: prefillRow.groupUid,
        companyGroup: prefillRow.companyGroup,
        idGroup: prefillRow.idGroup,
        abbGroup: prefillRow.abbGroup,
        companyUnit: "",
        idUnit: maxUnitId > 0 ? String(maxUnitId + 1) : `${prefillRow.idGroup}1`,
        abbUnit: "",
      });
    } else {
      const maxGroupId = distinctGroups.reduce((mx, g) => Math.max(mx, Number(g.idGroup) || 0), 0);
      const nextGId = String(maxGroupId + 1);
      setForm({
        groupUid: "",
        companyGroup: "",
        idGroup: nextGId,
        abbGroup: "",
        companyUnit: "",
        idUnit: `${nextGId}1`,
        abbUnit: "",
      });
    }
    setModalMode("add");
  };

  const openEditRow = (row: MasterCompanyUnitRow) => {
    setForm({
      uid: row.uid,
      groupUid: row.groupUid,
      companyGroup: row.companyGroup,
      idGroup: row.idGroup,
      abbGroup: row.abbGroup,
      companyUnit: row.companyUnit,
      idUnit: row.idUnit,
      abbUnit: row.abbUnit,
    });
    setModalMode("edit");
  };

  const handleSubmitForm = () => {
    const companyGroup = form.companyGroup.trim();
    const idGroup = form.idGroup.trim();
    const abbGroup = form.abbGroup.trim();
    const companyUnit = form.companyUnit.trim();
    const idUnit = form.idUnit.trim();
    const abbUnit = form.abbUnit.trim();

    if (!companyGroup || !idGroup || !abbGroup || !companyUnit || !idUnit || !abbUnit) {
      toast.error("Seluruh kolom (Company Group, ID Group, Abb.Group, Company Unit, ID Unit, Abb.Unit) wajib diisi.");
      return;
    }

    const dupUnit = catalog.rows.find(
      (r) =>
        r.uid !== form.uid &&
        (r.companyUnit.toLowerCase() === companyUnit.toLowerCase() || r.idUnit.toLowerCase() === idUnit.toLowerCase()),
    );
    if (dupUnit) {
      toast.error(`Nama Unit Usaha atau ID Unit sudah terdaftar pada "${dupUnit.companyUnit}" (ID: ${dupUnit.idUnit}).`);
      return;
    }

    // Cari apakah Group tersebut sudah ada berdasarkan groupUid, nama Group, atau ID Group
    const matchedExistingGroup = catalog.rows.find(
      (r) =>
        (form.groupUid && r.groupUid === form.groupUid) ||
        r.companyGroup.toLowerCase() === companyGroup.toLowerCase() ||
        r.idGroup === idGroup,
    );
    const resolvedGroupUid =
      form.groupUid || matchedExistingGroup?.groupUid || `group-${makeGroupSlug(companyGroup)}-${Date.now().toString(36)}`;

    let nextRows: MasterCompanyUnitRow[];
    if (modalMode === "edit" && form.uid) {
      // Jika user mengubah Company Group / ID Group / Abb.Group pada 1 baris, seragamkan seluruh baris yang ber-groupUid sama!
      nextRows = catalog.rows.map((r) => {
        if (r.uid === form.uid) {
          return {
            ...r,
            groupUid: resolvedGroupUid,
            companyGroup,
            idGroup,
            abbGroup,
            companyUnit,
            idUnit,
            abbUnit,
            fullName: companyUnit,
          };
        }
        if (r.groupUid === resolvedGroupUid) {
          return {
            ...r,
            companyGroup,
            idGroup,
            abbGroup,
          };
        }
        return r;
      });
    } else {
      const newRow: MasterCompanyUnitRow = {
        uid: `unit-${makeGroupSlug(abbUnit || companyUnit)}-${Date.now().toString(36)}`,
        groupUid: resolvedGroupUid,
        companyGroup,
        idGroup,
        abbGroup,
        companyUnit,
        idUnit,
        abbUnit,
        fullName: companyUnit,
        aliases: [],
        groupAliases: [],
      };
      nextRows = catalog.rows.map((r) =>
        r.groupUid === resolvedGroupUid ? { ...r, companyGroup, idGroup, abbGroup } : r,
      );
      nextRows.push(newRow);
    }

    const saved = saveMasterCompanyCatalog(
      nextRows,
      modalMode === "edit"
        ? `Updated Master Company Unit: ${companyGroup} / ${companyUnit}`
        : `Added Master Company Unit: ${companyGroup} / ${companyUnit}`,
    );
    setCatalog(saved);
    setModalMode(null);
    toast.success(
      modalMode === "edit"
        ? `Data "${companyUnit}" (${companyGroup}) berhasil diperbarui & disinkronkan ke seluruh modul.`
        : `Unit Usaha "${companyUnit}" (${companyGroup}) berhasil ditambahkan.`,
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (catalog.rows.length <= 1) {
      toast.warning("Minimal 1 Unit Usaha harus terdaftar di dalam sistem.");
      setDeleteTarget(null);
      return;
    }
    const nextRows = catalog.rows.filter((r) => r.uid !== deleteTarget.uid);
    const saved = saveMasterCompanyCatalog(
      nextRows,
      `Deleted Master Company Unit: ${deleteTarget.companyGroup} / ${deleteTarget.companyUnit}`,
    );
    setCatalog(saved);
    setDeleteTarget(null);
    toast.success(`Unit Usaha "${deleteTarget.companyUnit}" telah dihapus dari Master Company.`);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-4 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#1A284F]/10 text-[#1A284F] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900">Master Company &amp; Unit Usaha</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                Sumber Dinamis Seluruh Modul
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pengelolaan terpusat seluruh Company Group dan Company Unit. Setiap penambahan atau perubahan nama di halaman ini otomatis menyesuaikan filter, alur kerja, kalibrasi, dan data terkait di seluruh sistem.
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => openAddNew()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A284F] text-white text-xs font-semibold hover:bg-[#131d3b] transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Company / Unit
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setGroupFilter("ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                groupFilter === "ALL"
                  ? "bg-[#1A284F] text-white border-[#1A284F]"
                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70"
              }`}
            >
              Semua Group ({catalog.rows.length})
            </button>
            {distinctGroups.map((g, idx) => {
              const active = groupFilter === g.groupUid;
              const idleCls = GROUP_BADGE_PALETTE[idx % GROUP_BADGE_PALETTE.length];
              return (
                <button
                  key={g.groupUid}
                  type="button"
                  onClick={() => setGroupFilter(active ? "ALL" : g.groupUid)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                    active ? "bg-[#2F5597] text-white border-[#2F5597]" : idleCls
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  {g.name} ({g.abbGroup}) · {g.count} Unit
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari Group, ID, Abb, atau Unit Usaha..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#1A284F]"
            />
          </div>
        </div>

        {/* Master Company Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[#1A284F] text-white">
              <tr>
                <th className="py-3 px-3 text-center font-semibold w-14 border-r border-white/10">No.</th>
                <th className="py-3 px-3.5 text-center font-semibold w-32 border-r border-white/10">Action</th>
                <th className="py-3 px-4 text-left font-semibold whitespace-nowrap border-r border-white/10">Company Group</th>
                <th className="py-3 px-3 text-center font-semibold whitespace-nowrap border-r border-white/10">ID Group</th>
                <th className="py-3 px-3 text-center font-semibold whitespace-nowrap border-r border-white/10">Abb.Group</th>
                <th className="py-3 px-4 text-left font-semibold whitespace-nowrap border-r border-white/10">Company Unit</th>
                <th className="py-3 px-3 text-center font-semibold whitespace-nowrap border-r border-white/10">ID Unit</th>
                <th className="py-3 px-3 text-center font-semibold whitespace-nowrap">Abb.Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedFilteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Tidak ada data Company Group / Company Unit yang sesuai pencarian.
                  </td>
                </tr>
              ) : (
                sortedFilteredRows.map((row, idx) => (
                  <tr
                    key={row.uid}
                    className={`transition-colors hover:bg-blue-50/40 ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3.5 text-center">
                      {canEdit ? (
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openAddNew(row)}
                            title={`Tambah Unit Usaha baru di bawah ${row.companyGroup}`}
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditRow(row)}
                            title="Edit Group / Unit Usaha"
                            className="p-1.5 rounded-lg bg-blue-50 text-[#2F5597] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            title="Delete Unit Usaha"
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          groupPaletteByUid[row.groupUid] ?? GROUP_BADGE_PALETTE[0]
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        {row.companyGroup}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 tabular-nums">
                      {row.idGroup}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono font-bold text-slate-700">
                        {row.abbGroup}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-[#1A284F]/70 shrink-0" />
                        {row.companyUnit}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 tabular-nums">
                      {row.idUnit}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#1A284F]/8 text-[#1A284F] font-mono font-bold">
                        {row.abbUnit}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setModalMode(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] text-white">
              <div>
                <h3 className="text-sm font-bold">
                  {modalMode === "edit" ? "Edit Company Group / Company Unit" : "Tambah Company Group / Company Unit"}
                </h3>
                <p className="text-[11px] text-white/75 mt-0.5">
                  Perubahan nama Group atau Unit Usaha otomatis disinkronkan ke seluruh data terkait di sistem
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1 rounded-lg text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Quick Select Existing Group when Adding */}
              {modalMode === "add" && distinctGroups.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Pilih Cepat Group Terdaftar (atau ketik Group baru di bawah)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {distinctGroups.map((g) => {
                      const isSel = form.groupUid === g.groupUid;
                      return (
                        <button
                          key={g.groupUid}
                          type="button"
                          onClick={() => {
                            const unitsInG = catalog.rows.filter((r) => r.groupUid === g.groupUid);
                            const maxUId = unitsInG.reduce((mx, r) => Math.max(mx, Number(r.idUnit) || 0), 0);
                            setForm((p) => ({
                              ...p,
                              groupUid: g.groupUid,
                              companyGroup: g.name,
                              idGroup: g.idGroup,
                              abbGroup: g.abbGroup,
                              idUnit: maxUId > 0 ? String(maxUId + 1) : `${g.idGroup}1`,
                            }));
                          }}
                          className={`px-3 py-1 rounded-full font-semibold border transition-colors cursor-pointer ${
                            isSel
                              ? "bg-[#1A284F] text-white border-[#1A284F]"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {g.name} (ID: {g.idGroup} · {g.abbGroup})
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const maxG = distinctGroups.reduce((mx, g) => Math.max(mx, Number(g.idGroup) || 0), 0);
                        const nextG = String(maxG + 1);
                        setForm((p) => ({
                          ...p,
                          groupUid: "",
                          companyGroup: "",
                          idGroup: nextG,
                          abbGroup: "",
                          idUnit: `${nextG}1`,
                        }));
                      }}
                      className="px-3 py-1 rounded-full font-semibold border border-dashed border-blue-300 text-blue-700 bg-blue-50/50 hover:bg-blue-50 cursor-pointer"
                    >
                      + Buat Group Baru
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Data Company Group</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Company Group *</label>
                    <input
                      type="text"
                      value={form.companyGroup}
                      onChange={(e) => setForm((p) => ({ ...p, companyGroup: e.target.value }))}
                      placeholder="Contoh: Sambu Group"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ID Group *</label>
                    <input
                      type="text"
                      value={form.idGroup}
                      onChange={(e) => setForm((p) => ({ ...p, idGroup: e.target.value }))}
                      placeholder="Contoh: 1"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[#1A284F]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Abb.Group *</label>
                    <input
                      type="text"
                      value={form.abbGroup}
                      onChange={(e) => setForm((p) => ({ ...p, abbGroup: e.target.value.toUpperCase() }))}
                      placeholder="Contoh: SG"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[#1A284F]"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Data Company Unit</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Company Unit *</label>
                    <input
                      type="text"
                      value={form.companyUnit}
                      onChange={(e) => setForm((p) => ({ ...p, companyUnit: e.target.value }))}
                      placeholder="Contoh: PT Pulau Sambu (Jakarta)"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs outline-none focus:border-[#1A284F]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">ID Unit *</label>
                    <input
                      type="text"
                      value={form.idUnit}
                      onChange={(e) => setForm((p) => ({ ...p, idUnit: e.target.value }))}
                      placeholder="Contoh: 11"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[#1A284F]"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Abb.Unit *</label>
                    <input
                      type="text"
                      value={form.abbUnit}
                      onChange={(e) => setForm((p) => ({ ...p, abbUnit: e.target.value.toUpperCase() }))}
                      placeholder="Contoh: PSJ"
                      className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-[#1A284F]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-3.5 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitForm}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] cursor-pointer"
              >
                {modalMode === "edit" ? "Simpan Perubahan" : "Tambahkan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#1A284F]">Hapus Company Unit?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Anda yakin ingin menghapus <strong>{deleteTarget.companyUnit}</strong> ({deleteTarget.companyGroup} · ID Unit {deleteTarget.idUnit}) dari Master Company?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MasterCompanyPage;
