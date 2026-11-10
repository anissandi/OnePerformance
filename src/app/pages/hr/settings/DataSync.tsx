import { useState, useEffect, useRef } from "react";
import {
  RefreshCw, CheckSquare, Square, Database, CheckCircle2,
  AlertCircle, Clock, Upload, Download, FileSpreadsheet, Users, ShieldCheck, Building2, Search,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  loadPersistedState,
  replaceAllBackendUsersAndResetForTrial,
  savePersistedState,
  syncToSupabase,
} from "../../../services/supabaseClient";
import {
  COMPANY_UNIT_LOCATIONS,
  inferGroupingFromPosition,
  loadManagedUsers,
  saveManagedUsers,
  type ManagedUser,
  type AppUserRole,
} from "../../../store/authStore";

export const EMPLOYEE_IMPORT_HEADERS = [
  "No",
  "Reg No",
  "ID Karyawan",
  "Nama",
  "Divisi",
  "Departement",
  "Bagian",
  "Jabatan",
  "Joindate",
  "No Telegram",
  "Corporate Email",
  "Reg No AP1",
  "Reg No AP2",
  "Role",
  "Groupings",
] as const;

type SyncItem = {
  id: string;
  label: string;
  description: string;
  lastSync: string | null;
  status: "idle" | "syncing" | "success" | "error";
};

const initialItems: SyncItem[] = [
  {
    id: "all",
    label: "All Data",
    description: "Sync semua data sekaligus (Absensi, Jumlah Karyawan, Pelanggaran, Kecelakaan Kerja)",
    lastSync: null,
    status: "idle",
  },
  {
    id: "absensi",
    label: "Data Summary Absensi",
    description: "Rekap data kehadiran dan ketidakhadiran karyawan",
    lastSync: null,
    status: "idle",
  },
  {
    id: "karyawan",
    label: "Data Jumlah Karyawan",
    description: "Total headcount dan distribusi karyawan per unit/divisi",
    lastSync: null,
    status: "idle",
  },
  {
    id: "pelanggaran",
    label: "Data Pelanggaran",
    description: "Catatan pelanggaran dan sanksi disiplin karyawan",
    lastSync: null,
    status: "idle",
  },
  {
    id: "kecelakaan-kerja",
    label: "Data Kecelakaan Kerja",
    description: "Catatan kejadian kecelakaan kerja karyawan",
    lastSync: null,
    status: "idle",
  },
];

function StatusBadge({ status }: { status: SyncItem["status"] }) {
  if (status === "idle")    return <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Clock className="w-3.5 h-3.5" />Not synced</span>;
  if (status === "syncing") return <span className="inline-flex items-center gap-1 text-xs text-blue-600 animate-pulse"><RefreshCw className="w-3.5 h-3.5 animate-spin" />Menyinkron...</span>;
  if (status === "success") return <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" />Berhasil</span>;
  return                           <span className="inline-flex items-center gap-1 text-xs text-red-500"><AlertCircle className="w-3.5 h-3.5" />Gagal</span>;
}

export function DataSyncPage() {
  const [items, setItems] = useState<SyncItem[]>(() =>
    loadPersistedState<SyncItem[]>("pa_data_sync_items_v1", initialItems)
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>(COMPANY_UNIT_LOCATIONS[0].company);
  const [users, setUsers] = useState<ManagedUser[]>(() => loadManagedUsers());
  const [searchQuery, setSearchQuery] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace_all_trial">("merge");
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(() =>
    loadPersistedState<string | null>("pa_last_employee_excel_import_v1", null),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHydrated = () => {
      setItems(loadPersistedState<SyncItem[]>("pa_data_sync_items_v1", initialItems));
      setUsers(loadManagedUsers());
      setLastImportSummary(loadPersistedState<string | null>("pa_last_employee_excel_import_v1", null));
    };
    const onAuthUpdated = () => setUsers(loadManagedUsers());
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener("pa-auth-updated", onAuthUpdated);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener("pa-auth-updated", onAuthUpdated);
    };
  }, []);

  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        "No": 1,
        "Reg No": "REG-002",
        "ID Karyawan": "E002",
        "Nama": "Siti Rahayu",
        "Divisi": "Staff Management",
        "Departement": "Sumber Daya Manusia",
        "Bagian": "Pengembangan SDM",
        "Jabatan": "Staff Pengembangan SDM",
        "Joindate": "2021-07-01",
        "No Telegram": "+628117001002",
        "Corporate Email": "siti.rahayu@sambugroup.com",
        "Reg No AP1": "REG-014",
        "Reg No AP2": "REG-008",
        "Role": "Employee",
        "Groupings": "Operasional",
      },
      {
        "No": 2,
        "Reg No": "REG-014",
        "ID Karyawan": "E014",
        "Nama": "Ananta Nirmala",
        "Divisi": "Staff Management",
        "Departement": "Sumber Daya Manusia",
        "Bagian": "Rekrutmen & Seleksi",
        "Jabatan": "Supervisor HR Unit",
        "Joindate": "2018-06-11",
        "No Telegram": "+628117001014",
        "Corporate Email": "hr.unit.ind@sambugroup.com",
        "Reg No AP1": "REG-008",
        "Reg No AP2": "REG-016",
        "Role": "HR Unit",
        "Groupings": "Ka./Wa.Ka.Bagian",
      },
      {
        "No": 3,
        "Reg No": "REG-008",
        "ID Karyawan": "E008",
        "Nama": "Hendra Wijaya",
        "Divisi": "Coconut Production",
        "Departement": "Produksi Kelapa A",
        "Bagian": "Proses Kelapa A",
        "Jabatan": "Kepala Divisi Operasional",
        "Joindate": "2014-06-01",
        "No Telegram": "+628117001008",
        "Corporate Email": "hendra.wijaya@sambugroup.com",
        "Reg No AP1": "REG-016",
        "Reg No AP2": "REG-017",
        "Role": "Supervisor",
        "Groupings": "Ka./Wa.Ka.Div ke atas",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows, { header: [...EMPLOYEE_IMPORT_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Data_Karyawan");
    XLSX.writeFile(wb, `Template_Import_Data_Karyawan_PA_2026.xlsx`);
  };

  const handleExportCurrentUsers = () => {
    const unitFiltered = selectedUnit === "ALL" ? users : users.filter((u) => u.company === selectedUnit);
    const rows = unitFiltered.map((u, idx) => ({
      "No": u.no ?? String(idx + 1),
      "Reg No": u.regNo ?? `REG-${String(idx + 1).padStart(3, "0")}`,
      "ID Karyawan": u.employeeId,
      "Nama": u.name,
      "Divisi": u.division,
      "Departement": u.department,
      "Bagian": u.bagian ?? "",
      "Jabatan": u.position,
      "Joindate": u.joinDate ?? "",
      "No Telegram": u.telegramNo ?? "",
      "Corporate Email": u.email,
      "Reg No AP1": u.regNoAp1 ?? "",
      "Reg No AP2": u.regNoAp2 ?? "",
      "Role": u.role || "Employee",
      "Groupings": u.groupings,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...EMPLOYEE_IMPORT_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data_Karyawan");
    XLSX.writeFile(wb, `Data_Karyawan_${selectedUnit.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (rawRows.length === 0) {
          toast.error("File Excel kosong atau tidak memiliki baris data.");
          return;
        }

        const targetCompany = selectedUnit === "ALL" ? COMPANY_UNIT_LOCATIONS[0].company : selectedUnit;
        const existingUsers = importMode === "replace_all_trial" ? [] : [...loadManagedUsers()];

        // Collect all Reg No values referenced as AP1 or AP2 to auto-assign Supervisor role when appropriate
        const referencedApproverRegNos = new Set<string>();
        rawRows.forEach((r) => {
          const ap1 = String(r["Reg No AP1"] ?? r["RegNoAP1"] ?? "").trim().toUpperCase();
          const ap2 = String(r["Reg No AP2"] ?? r["RegNoAP2"] ?? "").trim().toUpperCase();
          if (ap1) referencedApproverRegNos.add(ap1);
          if (ap2) referencedApproverRegNos.add(ap2);
        });
        existingUsers.forEach((u) => {
          if (u.regNoAp1) referencedApproverRegNos.add(u.regNoAp1.trim().toUpperCase());
          if (u.regNoAp2) referencedApproverRegNos.add(u.regNoAp2.trim().toUpperCase());
        });

        let importedCount = 0;
        rawRows.forEach((r, idx) => {
          const empId = String(r["ID Karyawan"] ?? r["Employee ID"] ?? r["NIK"] ?? "").trim();
          const name = String(r["Nama"] ?? r["Name"] ?? "").trim();
          if (!empId || !name) return;

          const no = String(r["No"] ?? idx + 1).trim();
          const regNo = String(r["Reg No"] ?? r["RegNo"] ?? `REG-${empId}`).trim();
          const division = String(r["Divisi"] ?? r["Division"] ?? "Staff Management").trim();
          const department = String(r["Departement"] ?? r["Departemen"] ?? r["Department"] ?? "Sumber Daya Manusia").trim();
          const bagian = String(r["Bagian"] ?? r["Section"] ?? "").trim();
          const position = String(r["Jabatan"] ?? r["Position"] ?? "Staff").trim();
          const joinDate = String(r["Joindate"] ?? r["Join Date"] ?? "").trim();
          const telegramNo = String(r["No Telegram"] ?? r["Telegram"] ?? "").trim();
          const email = String(r["Corporate Email"] ?? r["Email"] ?? "").trim();
          const regNoAp1 = String(r["Reg No AP1"] ?? r["AP1"] ?? "").trim();
          const regNoAp2 = String(r["Reg No AP2"] ?? r["AP2"] ?? "").trim();
          const rawRole = String(r["Role"] ?? r["User Role"] ?? "").trim();
          const rawGrouping = String(r["Groupings"] ?? r["Grouping"] ?? r["User Groupings"] ?? "").trim();

          const normalizeImportedGrouping = (val: string, fallbackPos: string): string => {
            const v = val.trim().toLowerCase();
            if (!v) return inferGroupingFromPosition(fallbackPos);
            if (/div|gm|direktur|bod/i.test(v)) return "Ka./Wa.Ka.Div ke atas";
            if (/dept|departemen/i.test(v)) return "Ka./Wa.Ka.Dept";
            if (/bagian/i.test(v)) return "Ka./Wa.Ka.Bagian";
            if (/seksi|shift/i.test(v)) return "Ka./Wa.Ka.Seksi";
            if (/operasional|operational/i.test(v)) return "Operasional";
            return val.trim();
          };

          const normalizeImportedRole = (val: string): AppUserRole | "" => {
            const v = val.trim().toLowerCase();
            if (!v) return "";
            if (v === "administrator" || v === "admin") return "Administrator";
            if (v === "hr icf" || v === "hricf" || v === "icf") return "HR ICF";
            if (v === "hr unit" || v === "hrunit") return "HR Unit";
            if (v === "bod") return "BOD";
            if (v === "director" || v === "direktur") return "Director";
            if (v === "gm" || v === "general manager") return "GM";
            if (v === "supervisor" || v === "approver") return "Supervisor";
            if (v === "employee" || v === "staff" || v === "karyawan") return "Employee";
            return val.trim() as AppUserRole;
          };

          const grouping = normalizeImportedGrouping(rawGrouping, position);
          const existingIdx = existingUsers.findIndex(
            (u) => u.employeeId.toLowerCase() === empId.toLowerCase() || (u.regNo && u.regNo.toLowerCase() === regNo.toLowerCase()),
          );
          const prev = existingIdx >= 0 ? existingUsers[existingIdx] : undefined;

          const isApproverByChain = referencedApproverRegNos.has(regNo.toUpperCase());
          const explicitRole = normalizeImportedRole(rawRole);
          const inferredRole =
            explicitRole ||
            prev?.role ||
            (/direktur|director/i.test(position)
              ? "Director"
              : /\bgm\b|general manager/i.test(position)
              ? "GM"
              : /bod/i.test(position)
              ? "BOD"
              : isApproverByChain || grouping !== "Operasional"
              ? "Supervisor"
              : "Employee");

          const userRecord: ManagedUser = {
            id: prev?.id ?? String(Date.now() + idx),
            no,
            regNo,
            employeeId: empId,
            name,
            division,
            department,
            bagian,
            position,
            joinDate,
            telegramNo,
            email: email || prev?.email || `${empId.toLowerCase()}@sambugroup.com`,
            regNoAp1,
            regNoAp2,
            company: String(r["Company"] ?? r["Unit"] ?? prev?.company ?? targetCompany).trim(),
            grade: prev?.grade ?? (grouping === "Ka./Wa.Ka.Div ke atas" ? "Grade 9" : grouping === "Ka./Wa.Ka.Dept" ? "Grade 8" : grouping === "Ka./Wa.Ka.Bagian" ? "Grade 7" : grouping === "Ka./Wa.Ka.Seksi" ? "Grade 6" : "Grade 5"),
            role: inferredRole,
            groupings: rawGrouping ? grouping : prev?.groupings || grouping,
            status: prev?.status ?? "Active",
            lastLogin: prev?.lastLogin ?? "",
            isHrUnitChecker: inferredRole === "HR Unit" ? true : prev?.isHrUnitChecker,
            isHrIcfValidator: inferredRole === "HR ICF" || inferredRole === "Administrator" ? true : prev?.isHrIcfValidator,
          };

          if (existingIdx >= 0) {
            existingUsers[existingIdx] = userRecord;
          } else {
            existingUsers.push(userRecord);
          }
          importedCount++;
          void syncToSupabase({ kind: "user-upsert", user: userRecord });
        });

        if (importedCount === 0) {
          toast.error("Tidak ada baris valid. Pastikan kolom 'ID Karyawan' dan 'Nama' terisi.");
          return;
        }

        if (importMode === "replace_all_trial") {
          void replaceAllBackendUsersAndResetForTrial(
            existingUsers as unknown as Array<Record<string, unknown>>,
            true,
          );
        } else {
          saveManagedUsers(existingUsers);
        }
        setUsers(existingUsers);
        const now = new Date().toLocaleString("id-ID");
        const modeLabel =
          importMode === "replace_all_trial"
            ? "Mode Trial End-to-End (Data Dummy Diganti Penuh & Transaksi Direset)"
            : "Mode Gabung / Upsert";
        const summary = `${importedCount} data karyawan berhasil diimpor ke ${targetCompany} (${modeLabel}) pada ${now}`;
        setLastImportSummary(summary);
        savePersistedState("pa_last_employee_excel_import_v1", summary, {
          kind: "kv-state",
          stateKey: "pa_last_employee_excel_import_v1",
          stateValue: summary,
          audit: {
            action: "Import",
            module: "Data Sync",
            subModule: "Employee Excel Import",
            description: summary,
          },
        });
        window.dispatchEvent(new Event("pa-employees-imported"));
        toast.success(`Berhasil mengimpor ${importedCount} data karyawan beserta rantai Approval (Reg No AP1 & AP2).`);
      } catch (err) {
        toast.error(`Gagal membaca file Excel: ${err instanceof Error ? err.message : "Format tidak valid"}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const resolveApproverDisplay = (regNo?: string) => {
    if (!regNo) return "—";
    const found = users.find(
      (u) =>
        (u.regNo && u.regNo.toLowerCase() === regNo.toLowerCase()) ||
        u.employeeId.toLowerCase() === regNo.toLowerCase(),
    );
    return found ? `${regNo} · ${found.name}` : regNo;
  };

  const filteredUsers = users.filter((u) => {
    const unitOk = selectedUnit === "ALL" || u.company === selectedUnit;
    if (!unitOk) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q) ||
      (u.regNo ?? "").toLowerCase().includes(q) ||
      u.division.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q) ||
      (u.bagian ?? "").toLowerCase().includes(q) ||
      u.position.toLowerCase().includes(q)
    );
  });

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (id === "all") {
        // "All Data" toggles everything
        if (next.has("all")) {
          next.clear();
        } else {
          initialItems.forEach(i => next.add(i.id));
        }
      } else {
        if (next.has(id)) {
          next.delete(id);
          next.delete("all"); // uncheck All if a child is unchecked
        } else {
          next.add(id);
          // auto-check "All" if all children are checked
          const children = initialItems.filter(i => i.id !== "all").map(i => i.id);
          if (children.every(c => next.has(c))) next.add("all");
        }
      }
      return next;
    });
  };

  const handleSync = () => {
    if (checked.size === 0 || syncing) return;

    const targetIds = checked.has("all")
      ? initialItems.map(i => i.id)
      : [...checked];

    setSyncing(true);
    setItems(prev => prev.map(item =>
      targetIds.includes(item.id) ? { ...item, status: "syncing" } : item
    ));

    // Simulate staggered sync completion
    targetIds.forEach((id, i) => {
      setTimeout(() => {
        const _n = new Date(); const now = `${String(_n.getDate()).padStart(2,"0")}/${String(_n.getMonth()+1).padStart(2,"0")}/${_n.getFullYear()} ${String(_n.getHours()).padStart(2,"0")}:${String(_n.getMinutes()).padStart(2,"0")}`;
        setItems(prev => {
          const next = prev.map(item =>
            item.id === id ? { ...item, status: "success" as const, lastSync: now } : item
          );
          if (i === targetIds.length - 1) {
            savePersistedState("pa_data_sync_items_v1", next, {
              kind: "data-sync",
              items: next.filter((it) => targetIds.includes(it.id)),
              audit: {
                action: "Update",
                module: "HR Settings",
                subModule: "Data Sync",
                description: `Synchronized HR datasets: ${targetIds.join(", ")}`,
              },
            });
          }
          return next;
        });
        if (i === targetIds.length - 1) {
          setSyncing(false);
          setChecked(new Set());
        }
      }, 1200 * (i + 1));
    });
  };

  const anyChecked = checked.size > 0;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-[#1A284F]" />
            <h1 className="text-[26px] font-bold text-[#1A284F]">Data Sync & Import Data Karyawan</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Import Excel data karyawan & validasi berjenjang (Reg No AP1 & AP2), serta sinkronisasi dataset HR tahun berjalan
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={!anyChecked || syncing}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
            anyChecked && !syncing
              ? "bg-[#1A284F] text-white hover:bg-[#131d3b]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* ── Bagian I: Import Excel Data Karyawan & Validasi Approval Berjenjang ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-[#1A284F]/[0.03] to-transparent">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#1A284F]" />
              <h2 className="text-base font-bold text-[#1A284F]">
                Import Excel Data Karyawan & Mapping Approval Berjenjang (AP1 / AP2)
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Format wajib 15 kolom:{" "}
              <span className="font-mono text-[11px] text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                No; Reg No; ID Karyawan; Nama; Divisi; Departement; Bagian; Jabatan; Joindate; No Telegram; Corporate Email; Reg No AP1; Reg No AP2; Role; Groupings
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "merge" | "replace_all_trial")}
                className="text-xs font-semibold text-[#1A284F] bg-transparent focus:outline-none"
                title="Pilih mode import: Gabungkan dengan data saat ini atau Ganti seluruh data dummy untuk Trial End-to-End"
              >
                <option value="merge">Mode: Update / Gabung Data</option>
                <option value="replace_all_trial">Mode: Ganti Data Dummy (Trial End-to-End)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <Building2 className="w-4 h-4 text-gray-500" />
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="text-xs font-semibold text-gray-700 bg-transparent focus:outline-none"
              >
                <option value="ALL">Semua Unit Usaha ({users.length})</option>
                {COMPANY_UNIT_LOCATIONS.map((loc) => (
                  <option key={loc.code} value={loc.company}>
                    {loc.company}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Template Excel
            </button>

            <button
              type="button"
              onClick={handleExportCurrentUsers}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Excel
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold transition-colors shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Excel Karyawan
            </button>
          </div>
        </div>

        {/* Rule summary strip */}
        <div className="px-6 py-3 bg-slate-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <strong>Approval Umum:</strong> Reg No AP1 (Approval 1) → Reg No AP2 (Approval 2)
            </span>
            <span className="text-gray-300">|</span>
            <span>
              <strong>Alur KPI & SMART Goals:</strong> Submit → Check (HR Unit) → Approval 1 → Approval 2 → Validate (HR ICF)
            </span>
            <span className="text-gray-300">|</span>
            <span>
              <strong>Project Outside Job Scope:</strong> Approval 1 → Approval 2
            </span>
          </div>
          {lastImportSummary && (
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              {lastImportSummary}
            </span>
          )}
        </div>

        {/* Search + Table preview */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Users className="w-4 h-4 text-[#1A284F]" />
              <span>
                Menampilkan <strong>{filteredUsers.length}</strong> karyawan terimpor (otomatis terdistribusi ke User Management & HC Awal Tahun di Calibration Setting)
              </span>
            </div>
            <div className="relative w-72">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Reg No, ID, Nama, Divisi, Bagian..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#1A284F]"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-[340px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10 text-gray-600 border-b border-gray-200">
                <tr>
                  {EMPLOYEE_IMPORT_HEADERS.map((h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((u, idx) => (
                  <tr key={u.id} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2 text-gray-500">{u.no ?? idx + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-[#1A284F]">
                      {u.regNo ?? `REG-${String(idx + 1).padStart(3, "0")}`}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">{u.employeeId}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.division}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.department}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.bagian || "—"}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{u.position}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{u.joinDate || "—"}</td>
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{u.telegramNo || "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.email}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium text-[11px]">
                        {resolveApproverDisplay(u.regNoAp1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium text-[11px]">
                        {resolveApproverDisplay(u.regNoAp2)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                        {u.role || "Employee"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-[11px]">
                        {u.groupings}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const isChecked = checked.has(item.id);
          const isSyncing = item.status === "syncing";
          const isAll = item.id === "all";

          return (
            <button
              key={item.id}
              onClick={() => !syncing && toggle(item.id)}
              disabled={syncing}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 text-left transition-all ${
                isChecked
                  ? "border-[#1A284F] bg-[#1A284F]/5"
                  : "border-gray-200 bg-white hover:border-gray-300"
              } ${syncing ? "cursor-not-allowed opacity-80" : "cursor-pointer"} ${
                isAll ? "shadow-sm" : ""
              }`}
            >
              {/* Checkbox icon */}
              <div className={`shrink-0 w-5 h-5 ${isChecked ? "text-[#1A284F]" : "text-gray-300"}`}>
                {isChecked ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isAll ? "text-[#1A284F]" : "text-gray-800"}`}>
                  {item.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              </div>

              {/* Status + last sync */}
              <div className="shrink-0 text-right flex flex-col items-end gap-1">
                <StatusBadge status={item.status} />
                {item.lastSync && (
                  <p className="text-[10px] text-gray-400">Terakhir: {item.lastSync}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-5 py-4">
        <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-700">
          The sync process will fetch the latest data from the source system. Please ensure your network connection is stable before running a sync.
        </p>
      </div>
    </div>
  );
}
