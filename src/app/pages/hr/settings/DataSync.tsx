import { useState, useEffect, useRef } from "react";
import {
  RefreshCw, CheckSquare, Square, Database, CheckCircle2,
  AlertCircle, AlertTriangle, Clock, Upload, Download, FileSpreadsheet, Users, Building2, Search, Info, X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import {
  clearEmployeeTransactionsForSync,
  loadPersistedState,
  replaceCompanyUnitUsersAndResetTransactions,
  savePersistedState,
} from "../../../services/supabaseClient";
import {
  COMPANY_UNIT_LOCATIONS,
  canonicalizeCompanyUnitName,
  getActiveUser,
  isAdminOrHrIcfRole,
  isSameCompanyUnit,
  loadManagedUsers,
  normalizeApproverPair,
  resolveGroupingForCompanyAndPosition,
  saveManagedUsers,
  type ManagedUser,
  type AppUserRole,
} from "../../../store/authStore";
import { normalizeDateDDMMYYYY } from "../../../utils/dateFormat";
import { loadAccessRoles } from "./AccessManagement";

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
  "Status Karyawan",
  "Keterangan Status Karyawan",
  "Tgl Efektif",
] as const;

const IGNORED_REFERENCE_SHEETS = new Set(["master", "referensi", "reference", "petunjuk", "info"]);

interface FieldDiffItem {
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}

interface MatchedRegNoComparison {
  regNo: string;
  company: string;
  existingUser: ManagedUser;
  incomingUser: ManagedUser;
  diffs: FieldDiffItem[];
}

interface ParsedUploadPlan {
  fileName: string;
  sheetName: string;
  mode: "merge" | "update_clear_tx" | "replace_all_trial";
  targetUnit: string;
  targetUnitLabel: string;
  importedRows: ManagedUser[];
  matchedRegComparisons: MatchedRegNoComparison[];
  regComparisonsWithDiffs: MatchedRegNoComparison[];
}

function parseOptionalExcelDate(rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined || rawVal === "") return "";
  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    const dd = String(rawVal.getDate()).padStart(2, "0");
    const mm = String(rawVal.getMonth() + 1).padStart(2, "0");
    const yyyy = rawVal.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const str = String(rawVal).trim();
  if (!str || str === "-" || str === "—") return "";
  const norm = normalizeDateDDMMYYYY(rawVal as string | number);
  return norm === "—" ? str : norm;
}

function computeManagedUserDiffs(existing: ManagedUser, incoming: ManagedUser): FieldDiffItem[] {
  const pairs: Array<{ label: string; oldVal: string; newVal: string }> = [
    { label: "ID Karyawan", oldVal: existing.employeeId || "-", newVal: incoming.employeeId || "-" },
    { label: "Nama", oldVal: existing.name || "-", newVal: incoming.name || "-" },
    { label: "Divisi", oldVal: existing.division || "-", newVal: incoming.division || "-" },
    { label: "Departement", oldVal: existing.department || "-", newVal: incoming.department || "-" },
    { label: "Bagian", oldVal: existing.bagian || "-", newVal: incoming.bagian || "-" },
    { label: "Jabatan", oldVal: existing.position || "-", newVal: incoming.position || "-" },
    {
      label: "Joindate",
      oldVal: existing.joinDate ? normalizeDateDDMMYYYY(existing.joinDate) : "-",
      newVal: incoming.joinDate ? normalizeDateDDMMYYYY(incoming.joinDate) : "-",
    },
    { label: "No Telegram", oldVal: existing.telegramNo || "-", newVal: incoming.telegramNo || "-" },
    { label: "Corporate Email", oldVal: existing.email || "-", newVal: incoming.email || "-" },
    { label: "Reg No AP1", oldVal: existing.regNoAp1 || "-", newVal: incoming.regNoAp1 || "-" },
    { label: "Reg No AP2", oldVal: existing.regNoAp2 || "-", newVal: incoming.regNoAp2 || "-" },
    { label: "Role", oldVal: String(existing.role || "-"), newVal: String(incoming.role || "-") },
    { label: "Groupings", oldVal: existing.groupings || "-", newVal: incoming.groupings || "-" },
    { label: "Status Karyawan", oldVal: existing.employeeStatus || "-", newVal: incoming.employeeStatus || "-" },
    {
      label: "Keterangan Status Karyawan",
      oldVal: existing.employeeStatusNote || "-",
      newVal: incoming.employeeStatusNote || "-",
    },
    {
      label: "Tgl Efektif",
      oldVal: existing.effectiveDate ? normalizeDateDDMMYYYY(existing.effectiveDate) : "-",
      newVal: incoming.effectiveDate ? normalizeDateDDMMYYYY(incoming.effectiveDate) : "-",
    },
  ];
  return pairs
    .filter((p) => p.oldVal.trim() !== p.newVal.trim())
    .map((p) => ({
      fieldLabel: p.label,
      oldValue: p.oldVal,
      newValue: p.newVal,
    }));
}

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
    description: "Sync semua data sekaligus (Absensi, Data Karyawan, Pelanggaran, Kecelakaan Kerja)",
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
    label: "Data Karyawan",
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
  const normalizeSyncItems = (rawItems: SyncItem[]): SyncItem[] =>
    rawItems.map((it) =>
      it.id === "karyawan" || it.label === "Data Jumlah Karyawan"
        ? { ...it, label: "Data Karyawan" }
        : it.id === "all"
        ? { ...it, description: "Sync semua data sekaligus (Absensi, Data Karyawan, Pelanggaran, Kecelakaan Kerja)" }
        : it,
    );

  const [items, setItems] = useState<SyncItem[]>(() =>
    normalizeSyncItems(loadPersistedState<SyncItem[]>("pa_data_sync_items_v1", initialItems))
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>(COMPANY_UNIT_LOCATIONS[0].company);
  const [users, setUsers] = useState<ManagedUser[]>(() => loadManagedUsers());
  const [searchQuery, setSearchQuery] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "update_clear_tx" | "replace_all_trial">("merge");
  const [uploadPlan, setUploadPlan] = useState<ParsedUploadPlan | null>(null);
  const [confirmStep, setConfirmStep] = useState<1 | 2>(1);
  const [confirmPhraseInput, setConfirmPhraseInput] = useState("");
  const [executingUpload, setExecutingUpload] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(() =>
    loadPersistedState<string | null>("pa_last_employee_excel_import_v1", null),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onHydrated = () => {
      setItems(normalizeSyncItems(loadPersistedState<SyncItem[]>("pa_data_sync_items_v1", initialItems)));
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

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch("/templates/Template_Upload_Karyawan.xlsx", { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "Template_Upload_Karyawan.xlsx";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          return;
        }
      }
    } catch {
      // fallback programmatic workbook below
    }
    const sampleRows = [
      {
        "No": 1,
        "Reg No": "REG-001",
        "ID Karyawan": "05001",
        "Nama": "Contoh Nama Karyawan",
        "Divisi": "Staff Management",
        "Departement": "Sumber Daya Manusia",
        "Bagian": "Pengembangan SDM",
        "Jabatan": "Staff Pengembangan SDM",
        "Joindate": "21/02/2011",
        "No Telegram": "+628117001002",
        "Corporate Email": "karyawan@sambugroup.com",
        "Reg No AP1": "REG-014",
        "Reg No AP2": "REG-008",
        "Role": "Employee",
        "Groupings": "Operasional",
        "Status Karyawan": "",
        "Keterangan Status Karyawan": "",
        "Tgl Efektif": "",
      },
    ];
    const masterRefRows = [
      { "Groupings": "Operasional", "Role": "Employee", "Status Karyawan": "Karyawan Baru" },
      { "Groupings": "Ka./Wa.Ka.Seksi", "Role": "Supervisor", "Status Karyawan": "Mutasi" },
      { "Groupings": "Ka./Wa.Ka.Bagian", "Role": "Departement", "Status Karyawan": "Promosi" },
      { "Groupings": "Ka./Wa.Ka.Dept", "Role": "Division", "Status Karyawan": "" },
      { "Groupings": "Ka./Wa.Ka.Div ke atas", "Role": "GM", "Status Karyawan": "" },
      { "Groupings": "GM / VGM", "Role": "VGM", "Status Karyawan": "" },
      { "Groupings": "Direktur / Director", "Role": "HR Unit", "Status Karyawan": "" },
      { "Groupings": "", "Role": "HR ICF", "Status Karyawan": "" },
      { "Groupings": "", "Role": "Director", "Status Karyawan": "" },
      { "Groupings": "", "Role": "BOD", "Status Karyawan": "" },
      { "Groupings": "", "Role": "Administrator", "Status Karyawan": "" },
    ];
    const wsData = XLSX.utils.json_to_sheet(sampleRows, { header: [...EMPLOYEE_IMPORT_HEADERS] });
    const wsMaster = XLSX.utils.json_to_sheet(masterRefRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsData, "Data_Karyawan");
    XLSX.utils.book_append_sheet(wb, wsMaster, "Master");
    XLSX.writeFile(wb, "Template_Upload_Karyawan.xlsx");
  };

  const handleExportCurrentUsers = () => {
    const unitFiltered = selectedUnit === "ALL" ? users : users.filter((u) => u.company === selectedUnit);
    const rows = unitFiltered.map((u, idx) => ({
      "No": u.no ?? String(idx + 1),
      "Reg No": u.regNo || u.employeeId,
      "ID Karyawan": u.employeeId,
      "Nama": u.name,
      "Divisi": u.division,
      "Departement": u.department,
      "Bagian": u.bagian ?? "",
      "Jabatan": u.position,
      "Joindate": u.joinDate ? normalizeDateDDMMYYYY(u.joinDate) : "",
      "No Telegram": u.telegramNo ?? "",
      "Corporate Email": u.email,
      "Reg No AP1": u.regNoAp1 ?? "",
      "Reg No AP2": u.regNoAp2 ?? "",
      "Role": u.role || "Employee",
      "Groupings": u.groupings,
      "Status Karyawan": u.employeeStatus ?? "",
      "Keterangan Status Karyawan": u.employeeStatusNote ?? "",
      "Tgl Efektif": u.effectiveDate ? normalizeDateDDMMYYYY(u.effectiveDate) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...EMPLOYEE_IMPORT_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data_Karyawan");
    XLSX.writeFile(wb, `Data_Karyawan_${selectedUnit.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        // DS-5: Abaikan sheet "Master" (referensi); prioritaskan sheet "Data_Karyawan" atau sheet data pertama non-Master
        const preferredSheetName =
          wb.SheetNames.find((n) => n.trim().toLowerCase() === "data_karyawan") ??
          wb.SheetNames.find((n) => !IGNORED_REFERENCE_SHEETS.has(n.trim().toLowerCase()));
        if (!preferredSheetName) {
          toast.error('Tidak ditemukan sheet data karyawan pada file Excel (sheet "Master" diabaikan).');
          return;
        }
        const sheet = wb.Sheets[preferredSheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
        if (rawRows.length === 0) {
          toast.error("File Excel kosong atau tidak memiliki baris data.");
          return;
        }

        const targetCompany = selectedUnit === "ALL" ? COMPANY_UNIT_LOCATIONS[0].company : selectedUnit;
        const targetUnitLabel = selectedUnit === "ALL" ? "Semua Unit Usaha" : selectedUnit;
        const currentManagedUsers = loadManagedUsers();

        // Collect all Reg No values referenced as AP1 or AP2 to auto-assign Supervisor role when appropriate
        const referencedApproverRegNos = new Set<string>();
        rawRows.forEach((r) => {
          const pair = normalizeApproverPair(
            String(r["Reg No AP1"] ?? r["RegNoAP1"] ?? r["AP1"] ?? ""),
            String(r["Reg No AP2"] ?? r["RegNoAP2"] ?? r["AP2"] ?? ""),
          );
          if (pair.regNoAp1) referencedApproverRegNos.add(pair.regNoAp1.toUpperCase());
          if (pair.regNoAp2) referencedApproverRegNos.add(pair.regNoAp2.toUpperCase());
        });
        if (importMode !== "replace_all_trial") {
          currentManagedUsers.forEach((u) => {
            if (u.regNoAp1) referencedApproverRegNos.add(u.regNoAp1.trim().toUpperCase());
            if (u.regNoAp2) referencedApproverRegNos.add(u.regNoAp2.trim().toUpperCase());
          });
        }

        const normalizeImportedRole = (val: string): AppUserRole | "" => {
          const v = val.trim().toLowerCase();
          if (!v) return "";
          const configuredRoles = loadAccessRoles();
          const exactMatch = configuredRoles.find((cr) => cr.toLowerCase() === v);
          if (exactMatch) return exactMatch;
          if (v === "administrator" || v === "admin") return "Administrator";
          if (v === "hr icf" || v === "hricf" || v === "icf") return "HR ICF";
          if (v === "hr unit" || v === "hrunit") return "HR Unit";
          if (v === "bod") return "BOD";
          if (v === "director" || v === "direktur") return "Director";
          if (v === "gm" || v === "general manager") return "GM";
          if (v === "vgm" || v === "vice general manager" || v === "wakil general manager") return "VGM";
          if (v === "supervisor" || v === "approver") return "Supervisor";
          if (v === "employee" || v === "staff" || v === "karyawan") return "Employee";
          return val.trim() as AppUserRole;
        };

        const importedRows: ManagedUser[] = [];
        const seenUnitRegInFile = new Map<string, string>();
        const duplicateRegErrorsInFile: string[] = [];
        const matchedRegComparisons: MatchedRegNoComparison[] = [];

        for (let idx = 0; idx < rawRows.length; idx++) {
          const r = rawRows[idx];
          const empId = String(r["ID Karyawan"] ?? r["Employee ID"] ?? r["NIK"] ?? "").trim();
          const name = String(r["Nama"] ?? r["Name"] ?? "").trim();
          if (!empId || !name) continue;

          const no = String(r["No"] ?? idx + 1).trim();
          const rawRegNo = String(r["Reg No"] ?? r["RegNo"] ?? "").trim();
          const regNo = rawRegNo || empId;
          const division = String(r["Divisi"] ?? r["Division"] ?? "Staff Management").trim();
          const department = String(r["Departement"] ?? r["Departemen"] ?? r["Department"] ?? "Sumber Daya Manusia").trim();
          const bagian = String(r["Bagian"] ?? r["Section"] ?? "").trim();
          const position = String(r["Jabatan"] ?? r["Position"] ?? "Staff").trim();
          const joinDate = parseOptionalExcelDate(r["Joindate"] ?? r["Join Date"] ?? "");
          const telegramNo = String(r["No Telegram"] ?? r["Telegram"] ?? "").trim();
          const email = String(r["Corporate Email"] ?? r["Email"] ?? "").trim();
          const { regNoAp1, regNoAp2 } = normalizeApproverPair(
            String(r["Reg No AP1"] ?? r["RegNoAP1"] ?? r["AP1"] ?? ""),
            String(r["Reg No AP2"] ?? r["RegNoAP2"] ?? r["AP2"] ?? ""),
          );
          const rawRole = String(r["Role"] ?? r["User Role"] ?? "").trim();
          const rawGrouping = String(r["Groupings"] ?? r["Grouping"] ?? r["User Groupings"] ?? "").trim();
          const rawEmpStatus = String(r["Status Karyawan"] ?? r["Employee Status"] ?? "").trim();
          const cleanEmpStatus = rawEmpStatus === "-" || rawEmpStatus === "—" ? "" : rawEmpStatus;
          const rawEmpStatusNote = String(
            r["Keterangan Status Karyawan"] ?? r["Keterangan Status"] ?? r["Status Note"] ?? "",
          ).trim();
          const cleanEmpStatusNote =
            !cleanEmpStatus || rawEmpStatusNote === "-" || rawEmpStatusNote === "—" ? "" : rawEmpStatusNote;
          const effectiveDate = cleanEmpStatus
            ? parseOptionalExcelDate(r["Tgl Efektif"] ?? r["Tanggal Efektif"] ?? r["Effective Date"] ?? "")
            : "";

          const rowCompany = canonicalizeCompanyUnitName(String(r["Company"] ?? r["Unit"] ?? targetCompany).trim());
          const fileKey = `${rowCompany.toLowerCase()}::${regNo.toLowerCase()}`;
          const prevNameInFile = seenUnitRegInFile.get(fileKey);
          if (prevNameInFile) {
            duplicateRegErrorsInFile.push(
              `Reg No "${regNo}" duplikat pada unit ${rowCompany} (${prevNameInFile} & ${name})`,
            );
            continue;
          }
          seenUnitRegInFile.set(fileKey, name);

          const grouping = resolveGroupingForCompanyAndPosition(rowCompany, position, rawGrouping);

          // UM-2: Cocokkan existing user berdasarkan Reg No dalam Unit Usaha yang sama
          // (ID Karyawan yang sama dengan Reg No berbeda tetap menjadi akun terpisah dan tidak saling menimpa)
          const prev = currentManagedUsers.find((u) => {
            if (!isSameCompanyUnit(u.company, rowCompany)) return false;
            const uReg = String(u.regNo ?? "").trim().toLowerCase();
            if (uReg) return uReg === regNo.toLowerCase();
            return u.employeeId.trim().toLowerCase() === empId.toLowerCase();
          });

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
            id: importMode === "replace_all_trial" ? `usr-${Date.now()}-${idx}` : (prev?.id ?? `usr-${Date.now()}-${idx}`),
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
            email,
            regNoAp1,
            regNoAp2,
            company: rowCompany,
            grade: prev?.grade ?? (grouping === "Ka./Wa.Ka.Div ke atas" ? "Grade 9" : grouping === "Ka./Wa.Ka.Dept" ? "Grade 8" : grouping === "Ka./Wa.Ka.Bagian" ? "Grade 7" : grouping === "Ka./Wa.Ka.Seksi" ? "Grade 6" : "Grade 5"),
            role: inferredRole,
            groupings: rawGrouping ? grouping : prev?.groupings || grouping,
            status: importMode === "replace_all_trial" ? "Active" : (prev?.status ?? "Active"),
            lastLogin: importMode === "replace_all_trial" ? "" : (prev?.lastLogin ?? ""),
            isHrUnitChecker: inferredRole === "HR Unit" ? true : (importMode === "replace_all_trial" ? false : prev?.isHrUnitChecker),
            isHrIcfValidator:
              inferredRole === "HR ICF" || inferredRole === "Administrator"
                ? true
                : (importMode === "replace_all_trial" ? false : prev?.isHrIcfValidator),
            checkerUnits: importMode === "replace_all_trial" ? undefined : prev?.checkerUnits,
            managedUnits: importMode === "replace_all_trial" ? undefined : prev?.managedUnits,
            managedDivisions: importMode === "replace_all_trial" ? undefined : prev?.managedDivisions,
            managedDepartments: importMode === "replace_all_trial" ? undefined : prev?.managedDepartments,
            managedBagians: importMode === "replace_all_trial" ? undefined : prev?.managedBagians,
            calibrationRoleByUnit: importMode === "replace_all_trial" ? undefined : prev?.calibrationRoleByUnit,
            soyCalibrationRoleByUnit: importMode === "replace_all_trial" ? undefined : prev?.soyCalibrationRoleByUnit,
            directorCalibrationRole: importMode === "replace_all_trial" ? undefined : prev?.directorCalibrationRole,
            employeeStatus: cleanEmpStatus,
            employeeStatusNote: cleanEmpStatusNote,
            effectiveDate,
          };

          importedRows.push(userRecord);
          if (prev && importMode !== "replace_all_trial") {
            const diffs = computeManagedUserDiffs(prev, userRecord);
            matchedRegComparisons.push({
              regNo,
              company: rowCompany,
              existingUser: prev,
              incomingUser: userRecord,
              diffs,
            });
          }
        }

        if (duplicateRegErrorsInFile.length > 0) {
          toast.error(
            `File Excel ditolak karena terdapat duplikat Reg No dalam 1 unit usaha: ${duplicateRegErrorsInFile
              .slice(0, 3)
              .join("; ")}`,
          );
          return;
        }

        if (importedRows.length === 0) {
          toast.error("Tidak ada baris valid. Pastikan kolom 'ID Karyawan' dan 'Nama' terisi.");
          return;
        }

        const regComparisonsWithDiffs = matchedRegComparisons.filter((m) => m.diffs.length > 0);
        setConfirmStep(1);
        setConfirmPhraseInput("");
        setUploadPlan({
          fileName: file.name,
          sheetName: preferredSheetName,
          mode: importMode,
          targetUnit: selectedUnit,
          targetUnitLabel,
          importedRows,
          matchedRegComparisons,
          regComparisonsWithDiffs,
        });
      } catch (err) {
        toast.error(`Gagal membaca file Excel: ${err instanceof Error ? err.message : "Format tidak valid"}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const commitUploadPlan = async (plan: ParsedUploadPlan) => {
    if (executingUpload) return;
    setExecutingUpload(true);
    try {
      const nowD = new Date();
      const now = `${String(nowD.getDate()).padStart(2, "0")}/${String(nowD.getMonth() + 1).padStart(2, "0")}/${nowD.getFullYear()} ${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`;

      if (plan.mode === "replace_all_trial") {
        // Jaga akun aktif Administrator / HR ICF agar sesi Admin yang sedang mengeksekusi tidak terputus apabila tidak tercantum di file
        const activeAdmin = getActiveUser();
        let finalUnitRows = [...plan.importedRows];
        if (
          activeAdmin &&
          isAdminOrHrIcfRole(activeAdmin.role) &&
          (plan.targetUnit === "ALL" || isSameCompanyUnit(activeAdmin.company, plan.targetUnit))
        ) {
          const alreadyIncluded = finalUnitRows.some(
            (r) =>
              isSameCompanyUnit(r.company, activeAdmin.company) &&
              String(r.regNo || r.employeeId).trim().toLowerCase() ===
                String(activeAdmin.regNo || activeAdmin.employeeId).trim().toLowerCase(),
          );
          if (!alreadyIncluded) {
            finalUnitRows = [activeAdmin, ...finalUnitRows];
          }
        }
        await replaceCompanyUnitUsersAndResetTransactions(
          plan.targetUnit,
          finalUnitRows as unknown as Array<Record<string, unknown>>,
        );
        setUsers(loadManagedUsers());
      } else {
        const mergedUsers = [...loadManagedUsers()];
        const touchedIdentities = new Set<string>();
        for (const incoming of plan.importedRows) {
          const idx = mergedUsers.findIndex((u) => {
            if (!isSameCompanyUnit(u.company, incoming.company)) return false;
            const uReg = String(u.regNo ?? "").trim().toLowerCase();
            const inReg = String(incoming.regNo ?? "").trim().toLowerCase();
            if (uReg && inReg) return uReg === inReg;
            return u.employeeId.trim().toLowerCase() === incoming.employeeId.trim().toLowerCase();
          });
          if (idx >= 0) {
            mergedUsers[idx] = { ...mergedUsers[idx], ...incoming, id: mergedUsers[idx].id };
            touchedIdentities.add(mergedUsers[idx].id);
          } else {
            mergedUsers.push(incoming);
            touchedIdentities.add(incoming.id);
          }
        }
        saveManagedUsers(mergedUsers);

        if (plan.mode === "update_clear_tx") {
          const affectedEmps = plan.importedRows.map((u) => ({
            employeeId: u.employeeId,
            regNo: u.regNo,
            company: u.company,
          }));
          const survivingProtected = mergedUsers
            .filter((u) => !touchedIdentities.has(u.id))
            .map((u) => ({
              employeeId: u.employeeId,
              regNo: u.regNo,
              company: u.company,
            }));
          await clearEmployeeTransactionsForSync(affectedEmps, survivingProtected);
        }
        setUsers(loadManagedUsers());
      }

      const modeLabel =
        plan.mode === "replace_all_trial"
          ? "Mode: Replace / Ganti Data"
          : plan.mode === "update_clear_tx"
            ? "Mode: Update / Clear Transaksi"
            : "Mode: Update / Gabung Data";
      const summary = `${plan.importedRows.length} data karyawan berhasil di-upload ke ${plan.targetUnitLabel} (${modeLabel}) pada ${now}`;
      setLastImportSummary(summary);
      savePersistedState("pa_last_employee_excel_import_v1", summary, {
        kind: "kv-state",
        stateKey: "pa_last_employee_excel_import_v1",
        stateValue: summary,
        audit: {
          action: "Import",
          module: "Data Sync",
          subModule: "Employee Excel Upload",
          description: summary,
        },
      });
      window.dispatchEvent(new Event("pa-employees-imported"));
      toast.success(`Berhasil meng-upload ${plan.importedRows.length} data karyawan pada ${plan.targetUnitLabel}.`);
      setUploadPlan(null);
      setConfirmStep(1);
      setConfirmPhraseInput("");
    } catch (err) {
      toast.error(`Gagal memproses upload data karyawan: ${err instanceof Error ? err.message : "Terjadi kesalahan"}`);
    } finally {
      setExecutingUpload(false);
    }
  };

  const resolveApproverDisplay = (regNo?: string, ownerCompany?: string) => {
    if (!regNo) return "Belum ada approver";
    const regLow = regNo.trim().toLowerCase();
    const found =
      (ownerCompany
        ? users.find(
            (u) =>
              isSameCompanyUnit(u.company, ownerCompany) &&
              u.regNo &&
              u.regNo.trim().toLowerCase() === regLow,
          )
        : undefined) ??
      users.find((u) => u.regNo && u.regNo.trim().toLowerCase() === regLow) ??
      users.find((u) => u.employeeId.trim().toLowerCase() === regLow);
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
      u.position.toLowerCase().includes(q) ||
      (u.employeeStatus ?? "").toLowerCase().includes(q) ||
      (u.employeeStatusNote ?? "").toLowerCase().includes(q)
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
            <h1 className="text-[26px] font-bold text-[#1A284F]">Data Sync & Upload Data Karyawan</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Update data karyawan dengan metode sync data atau upload
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
                Upload Data Karyawan &amp; Mapping Approval
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "merge" | "update_clear_tx" | "replace_all_trial")}
                className="text-xs font-semibold text-[#1A284F] bg-transparent focus:outline-none"
              >
                <option value="merge">Mode: Update / Gabung Data</option>
                <option value="update_clear_tx">Mode: Update / Clear Transaksi</option>
                <option value="replace_all_trial">Mode: Replace / Ganti Data</option>
              </select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Informasi Mode Upload Data Karyawan"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-slate-500 hover:text-[#1A284F] hover:bg-gray-200/70 transition-colors shrink-0"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="max-w-sm bg-[#1A284F] text-white p-3.5 rounded-xl shadow-xl z-[70] space-y-2 text-[11px] leading-relaxed"
                >
                  <p className="font-bold text-amber-300 text-xs">Penjelasan Mode Upload Data Karyawan:</p>
                  <div className={importMode === "merge" ? "bg-white/10 rounded-lg p-2 border border-white/20" : "opacity-90"}>
                    <p className="font-bold text-white">1. Mode: Update / Gabung Data</p>
                    <p className="text-white/85">Menambahkan karyawan baru dan memperbarui data karyawan yang sudah ada tanpa menghapus riwayat transaksi penilaian kinerja.</p>
                  </div>
                  <div className={importMode === "update_clear_tx" ? "bg-white/10 rounded-lg p-2 border border-white/20" : "opacity-90"}>
                    <p className="font-bold text-white">2. Mode: Update / Clear Transaksi</p>
                    <p className="text-white/85">Menambahkan/memperbarui data karyawan sesuai file Excel sekaligus mengosongkan seluruh riwayat transaksi penilaian kinerja milik karyawan pada file tersebut.</p>
                  </div>
                  <div className={importMode === "replace_all_trial" ? "bg-white/10 rounded-lg p-2 border border-white/20" : "opacity-90"}>
                    <p className="font-bold text-white">3. Mode: Replace / Ganti Data</p>
                    <p className="text-white/85">Mengganti seluruh data karyawan pada Unit Usaha terpilih dengan isi file Excel terbaru serta mengosongkan seluruh riwayat transaksi penilaian kinerja aktif maupun arsip pada Unit Usaha tersebut.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
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
              Download Template
            </button>

            <button
              type="button"
              onClick={handleExportCurrentUsers}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Excel
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
              Upload Excel Karyawan
            </button>
          </div>
        </div>

        {lastImportSummary && (
          <div className="px-6 py-2.5 bg-slate-50 border-b border-gray-100 flex items-center justify-end text-xs">
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              {lastImportSummary}
            </span>
          </div>
        )}

        {/* Search + Table preview */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Users className="w-4 h-4 text-[#1A284F]" />
              <span>
                Menampilkan <strong>{filteredUsers.length}</strong> karyawan terdaftar
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
                      {u.regNo || u.employeeId}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">{u.employeeId}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.division}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.department}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.bagian || "—"}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{u.position}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{u.joinDate ? normalizeDateDDMMYYYY(u.joinDate) : "-"}</td>
                    <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{u.telegramNo || "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{u.email || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium text-[11px] ${u.regNoAp1 ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                        {resolveApproverDisplay(u.regNoAp1, u.company)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium text-[11px] ${u.regNoAp2 ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}>
                        {resolveApproverDisplay(u.regNoAp2, u.company)}
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
                    <td className="px-3 py-2 whitespace-nowrap">
                      {u.employeeStatus ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[11px]">
                          {u.employeeStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {u.employeeStatusNote || "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {u.effectiveDate ? normalizeDateDDMMYYYY(u.effectiveDate) : "-"}
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

      {uploadPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={`bg-white rounded-2xl shadow-2xl w-full ${
              uploadPlan.mode !== "replace_all_trial" && confirmStep === 1 ? "max-w-4xl" : "max-w-lg"
            } max-h-[90vh] flex flex-col overflow-hidden`}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-[#1A284F] to-[#26396c] text-white">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold leading-snug">
                    {uploadPlan.mode === "replace_all_trial"
                      ? "Konfirmasi Mode: Replace / Ganti Data"
                      : uploadPlan.mode === "update_clear_tx"
                        ? "Konfirmasi Mode: Update / Clear Transaksi"
                        : "Konfirmasi Mode: Update / Gabung Data"}
                  </h3>
                  <p className="text-[11px] text-blue-100 mt-0.5">
                    File: <span className="font-semibold text-white">{uploadPlan.fileName}</span> · Sheet:{" "}
                    <span className="font-mono text-amber-200">{uploadPlan.sheetName}</span> ({uploadPlan.importedRows.length} baris)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!executingUpload) {
                    setUploadPlan(null);
                    setConfirmStep(1);
                    setConfirmPhraseInput("");
                  }
                }}
                className="text-white/75 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs text-gray-700">
              {/* DS-1: Mode Update / Gabung Data */}
              {uploadPlan.mode === "merge" && (
                <>
                  {uploadPlan.regComparisonsWithDiffs.length > 0 ? (
                    <>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-950 leading-relaxed">
                        Anda memilih <strong>Mode Update / Gabung Data</strong> di Unit Usaha{" "}
                        <strong>{uploadPlan.targetUnitLabel}</strong>, silahkan cek kembali sebelum gabung data, Ada perbedaan data dari Reg No:{" "}
                        <strong className="font-mono">
                          {uploadPlan.regComparisonsWithDiffs.map((m) => m.regNo).join(", ")}
                        </strong>{" "}
                        yaitu pada tabel perbandingan di bawah ini. Jika anda klik <strong>Continue and Update</strong>, artinya anda setuju untuk update data existing karyawan dengan data terbaru{" "}
                        <strong>(tanpa menghapus riwayat data transaksi penilaian kinerja)</strong>, pilih <strong>Cancel</strong> jika anda mau menyesuaikan kembali file upload anda.
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-[320px]">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-gray-200 text-gray-600">
                            <tr>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Reg No</th>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Nama Karyawan</th>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Unit Usaha</th>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Kolom Berbeda</th>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Data Existing</th>
                              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Data Upload Terbaru</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {uploadPlan.regComparisonsWithDiffs.flatMap((comp) =>
                              comp.diffs.map((d, dIdx) => (
                                <tr key={`${comp.company}-${comp.regNo}-${d.fieldLabel}`} className="hover:bg-slate-50/70">
                                  {dIdx === 0 && (
                                    <>
                                      <td rowSpan={comp.diffs.length} className="px-3 py-2 font-mono font-bold text-[#1A284F] align-top bg-white">
                                        {comp.regNo}
                                      </td>
                                      <td rowSpan={comp.diffs.length} className="px-3 py-2 font-semibold text-gray-800 align-top bg-white whitespace-nowrap">
                                        {comp.incomingUser.name}
                                      </td>
                                      <td rowSpan={comp.diffs.length} className="px-3 py-2 text-gray-600 align-top bg-white whitespace-nowrap">
                                        {comp.company}
                                      </td>
                                    </>
                                  )}
                                  <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{d.fieldLabel}</td>
                                  <td className="px-3 py-2 text-rose-700 bg-rose-50/40 font-medium">{d.oldValue}</td>
                                  <td className="px-3 py-2 text-emerald-700 bg-emerald-50/50 font-semibold">{d.newValue}</td>
                                </tr>
                              )),
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-blue-950 leading-relaxed">
                      Anda memilih <strong>Mode Update / Gabung Data</strong> di Unit Usaha{" "}
                      <strong>{uploadPlan.targetUnitLabel}</strong> ({uploadPlan.importedRows.length} baris karyawan;{" "}
                      {uploadPlan.matchedRegComparisons.length > 0
                        ? `${uploadPlan.matchedRegComparisons.length} Reg No existing memiliki data yang identik`
                        : "seluruh Reg No merupakan data karyawan baru"}
                      ). Jika anda klik <strong>Continue and Update</strong>, data akan digabungkan{" "}
                      <strong>(tanpa menghapus riwayat data transaksi penilaian kinerja)</strong>.
                    </div>
                  )}
                </>
              )}

              {/* DS-2: Mode Update / Clear Transaksi (Step 1: Tabel Perbandingan -> Step 2: Ketik konfirmasi perbaharui data) */}
              {uploadPlan.mode === "update_clear_tx" && confirmStep === 1 && (
                <>
                  <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-rose-950 leading-relaxed">
                    Anda memilih <strong>Mode Update / Clear Transaksi</strong> di Unit Usaha{" "}
                    <strong>{uploadPlan.targetUnitLabel}</strong>, silahkan cek kembali sebelum gabung data
                    {uploadPlan.matchedRegComparisons.length > 0 ? (
                      <>
                        , Ada perbedaan/kecocokan data dari Reg No:{" "}
                        <strong className="font-mono">
                          {(uploadPlan.regComparisonsWithDiffs.length > 0
                            ? uploadPlan.regComparisonsWithDiffs
                            : uploadPlan.matchedRegComparisons
                          )
                            .map((m) => m.regNo)
                            .join(", ")}
                        </strong>{" "}
                        yaitu pada tabel di bawah ini.
                      </>
                    ) : (
                      "."
                    )}{" "}
                    Jika anda klik <strong>Continue and Update</strong>, artinya anda setuju untuk update data existing karyawan dengan data terbaru{" "}
                    <strong className="text-rose-700">(termasuk menghapus riwayat data transaksi penilaian kinerja)</strong>, pilih{" "}
                    <strong>Cancel</strong> jika anda mau menyesuaikan kembali file upload anda.
                  </div>
                  {uploadPlan.matchedRegComparisons.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-x-auto max-h-[320px]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-gray-200 text-gray-600">
                          <tr>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Reg No</th>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Nama Karyawan</th>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Unit Usaha</th>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Kolom / Status</th>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Data Existing</th>
                            <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Data Upload Terbaru</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {uploadPlan.matchedRegComparisons.flatMap((comp) => {
                            const rowsToShow =
                              comp.diffs.length > 0
                                ? comp.diffs
                                : [
                                    {
                                      fieldLabel: "Data Profil",
                                      oldValue: "Sama dengan existing",
                                      newValue: "Transaksi PA akan di-clear",
                                    },
                                  ];
                            return rowsToShow.map((d, dIdx) => (
                              <tr key={`${comp.company}-${comp.regNo}-${d.fieldLabel}`} className="hover:bg-slate-50/70">
                                {dIdx === 0 && (
                                  <>
                                    <td rowSpan={rowsToShow.length} className="px-3 py-2 font-mono font-bold text-[#1A284F] align-top bg-white">
                                      {comp.regNo}
                                    </td>
                                    <td rowSpan={rowsToShow.length} className="px-3 py-2 font-semibold text-gray-800 align-top bg-white whitespace-nowrap">
                                      {comp.incomingUser.name}
                                    </td>
                                    <td rowSpan={rowsToShow.length} className="px-3 py-2 text-gray-600 align-top bg-white whitespace-nowrap">
                                      {comp.company}
                                    </td>
                                  </>
                                )}
                                <td className="px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">{d.fieldLabel}</td>
                                <td className="px-3 py-2 text-rose-700 bg-rose-50/40 font-medium">{d.oldValue}</td>
                                <td className="px-3 py-2 text-emerald-700 bg-emerald-50/50 font-semibold">{d.newValue}</td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {uploadPlan.mode === "update_clear_tx" && confirmStep === 2 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-900 leading-relaxed">
                    Konfirmasi Tahap Akhir (<strong>Mode Update / Clear Transaksi</strong> — Unit Usaha{" "}
                    <strong>{uploadPlan.targetUnitLabel}</strong>): seluruh riwayat transaksi penilaian kinerja milik karyawan pada file upload ini akan dihapus secara permanen.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Ketik <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">konfirmasi perbaharui data</span> untuk melanjutkan:
                    </label>
                    <input
                      type="text"
                      value={confirmPhraseInput}
                      onChange={(e) => setConfirmPhraseInput(e.target.value)}
                      placeholder="konfirmasi perbaharui data"
                      autoFocus
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    />
                  </div>
                </div>
              )}

              {/* DS-3: Mode Replace / Ganti Data (Step 1: Peringatan Unit -> Step 2: Ketik konfirmasi ganti data) */}
              {uploadPlan.mode === "replace_all_trial" && confirmStep === 1 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-950 leading-relaxed text-xs sm:text-[13px]">
                  Anda memilih <strong>Mode: Replace / Ganti Data</strong> artinya semua data yang terkait pada Unit Usaha{" "}
                  <strong>{uploadPlan.targetUnitLabel}</strong> ini akan digantikan dengan data baru (clean data termasuk data riwayat transaksi penilaian kinerja aktif maupun arsip). setelah konfirmasi, data tidak dapat dipulihkan sehingga pastikan kembali Mode yang anda pilih.
                </div>
              )}

              {uploadPlan.mode === "replace_all_trial" && confirmStep === 2 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-900 leading-relaxed">
                    Konfirmasi Tahap Akhir (<strong>Mode: Replace / Ganti Data</strong> — Unit Usaha{" "}
                    <strong>{uploadPlan.targetUnitLabel}</strong>): tindakan ini tidak dapat dipulihkan.
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Ketik <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">konfirmasi ganti data</span> untuk melanjutkan:
                    </label>
                    <input
                      type="text"
                      value={confirmPhraseInput}
                      onChange={(e) => setConfirmPhraseInput(e.target.value)}
                      placeholder="konfirmasi ganti data"
                      autoFocus
                      className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/70 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={executingUpload}
                onClick={() => {
                  setUploadPlan(null);
                  setConfirmStep(1);
                  setConfirmPhraseInput("");
                }}
                className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              {uploadPlan.mode === "merge" && (
                <button
                  type="button"
                  disabled={executingUpload}
                  onClick={() => void commitUploadPlan(uploadPlan)}
                  className="px-4 py-2 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {executingUpload ? "Memproses..." : "Continue and Update"}
                </button>
              )}

              {uploadPlan.mode === "update_clear_tx" && confirmStep === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmPhraseInput("");
                    setConfirmStep(2);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  Continue and Update
                </button>
              )}

              {uploadPlan.mode === "update_clear_tx" && confirmStep === 2 && (
                <button
                  type="button"
                  disabled={
                    executingUpload ||
                    confirmPhraseInput.trim().toLowerCase() !== "konfirmasi perbaharui data"
                  }
                  onClick={() => void commitUploadPlan(uploadPlan)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {executingUpload ? "Memproses..." : "Continue"}
                </button>
              )}

              {uploadPlan.mode === "replace_all_trial" && confirmStep === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmPhraseInput("");
                    setConfirmStep(2);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  Continue &amp; Change Data
                </button>
              )}

              {uploadPlan.mode === "replace_all_trial" && confirmStep === 2 && (
                <button
                  type="button"
                  disabled={
                    executingUpload ||
                    confirmPhraseInput.trim().toLowerCase() !== "konfirmasi ganti data"
                  }
                  onClick={() => void commitUploadPlan(uploadPlan)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {executingUpload ? "Memproses..." : "Continue"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
