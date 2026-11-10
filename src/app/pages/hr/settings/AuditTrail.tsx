import { useState, useEffect, useMemo } from "react";
import { DatePickerID } from "../../../components/DatePickerID";
import { Search, RefreshCw, ChevronDown, Eye, X, Download, Filter } from "lucide-react";
import { loadLocalAuditLogs, hydrateAllStoresFromSupabase } from "../../../services/supabaseClient";

type ActionType = "Login" | "Logout" | "Create" | "Update" | "Delete" | "Approve" | "Reject" | "Export";

// Module = main menu, subModule = submenu
type MainModule =
  | "KPI"
  | "Performance Appraisal"
  | "SMART Goals"
  | "HR Settings"
  | "System"
  | "Project"
  | "Dashboard";

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: string;
  action: ActionType;
  module: MainModule;
  subModule?: string;
  section?: string;
  description: string;
  ipAddress: string;
  status: "Success" | "Failed";
  before?: string;
  after?: string;
}

const AUDIT_LOGS: AuditLog[] = [
  // ── System ──────────────────────────────────────────────────────────────────
  { id: "A002", timestamp: "2026-06-10 08:55:20", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Login",   module: "System",                description: "User logged into the system",                                                     ipAddress: "192.168.1.10", status: "Success" },
  { id: "A011", timestamp: "2026-06-08 18:05:40", userId: "E001", userName: "Ahmad Fauzi",   role: "Supervisor", action: "Logout",  module: "System",                description: "User logged out of the system",                                                   ipAddress: "192.168.1.21", status: "Success" },
  { id: "A016", timestamp: "2026-06-07 09:05:00", userId: "E004", userName: "Diana Kusuma",  role: "Employee",   action: "Login",   module: "System",                description: "User logged into the system",                                                     ipAddress: "10.0.0.44",    status: "Success" },

  // ── HR Settings → User Management ───────────────────────────────────────────
  { id: "A001", timestamp: "2026-06-10 09:12:34", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Update",  module: "HR Settings", subModule: "User Management",   description: "Updated role of Siti Rahayu (E002) from Employee to Supervisor",                  ipAddress: "192.168.1.10", status: "Success", before: '{"role":"Employee"}',   after: '{"role":"Supervisor"}' },
  { id: "A005", timestamp: "2026-06-09 16:20:45", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Create",  module: "HR Settings", subModule: "User Management",   description: "Created new user account: Anis Sandi (E013)",                                     ipAddress: "192.168.1.10", status: "Success" },
  { id: "A014", timestamp: "2026-06-08 14:45:10", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Delete",  module: "HR Settings", subModule: "User Management",   description: "Removed inactive account: Temp User (T099)",                                      ipAddress: "192.168.1.10", status: "Success" },

  // ── HR Settings → Access Management ─────────────────────────────────────────
  { id: "A007", timestamp: "2026-06-09 14:30:22", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Update",  module: "HR Settings", subModule: "Access Management", description: "Updated permissions for Employee role — enabled KPI Create",                       ipAddress: "192.168.1.10", status: "Success", before: '{"create":false}',      after: '{"create":true}' },
  { id: "A019", timestamp: "2026-06-05 10:30:00", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Update",  module: "HR Settings", subModule: "Access Management", description: "Bulk update: reset Supervisor role permissions to default",                        ipAddress: "192.168.1.10", status: "Success" },

  // ── HR Settings → Menu Management ───────────────────────────────────────────
  { id: "A010", timestamp: "2026-06-09 10:00:00", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Update",  module: "HR Settings", subModule: "Menu Management",   description: "Set 'Audit Trail' menu visibility to Hidden for Employee role",                   ipAddress: "192.168.1.10", status: "Success" },

  // ── Performance Appraisal → Approvals ───────────────────────────────────────
  { id: "A003", timestamp: "2026-06-10 08:30:00", userId: "E001", userName: "Ahmad Fauzi",   role: "Supervisor", action: "Approve", module: "Performance Appraisal", subModule: "Approvals", description: "Approved KPI setting submission for Siti Rahayu (E002)",                          ipAddress: "192.168.1.21", status: "Success" },
  { id: "A006", timestamp: "2026-06-09 15:00:00", userId: "E003", userName: "Budi Santoso",  role: "Supervisor", action: "Reject",  module: "Performance Appraisal", subModule: "Approvals", description: "Requested revision for KPI setting — Kartini Dewi (E011)",                        ipAddress: "192.168.2.14", status: "Success" },
  { id: "A009", timestamp: "2026-06-09 11:55:30", userId: "E012", userName: "Lukman Hakim",  role: "Supervisor", action: "Approve", module: "Performance Appraisal", subModule: "Approvals", description: "Approved Project Outside Job — Lisa Anderson (EMP005)",                           ipAddress: "192.168.1.31", status: "Success" },

  // ── KPI → KPI Setting ────────────────────────────────────────────────────────
  { id: "A004", timestamp: "2026-06-09 17:45:12", userId: "E005", userName: "Eko Prasetyo",  role: "Supervisor", action: "Update",  module: "KPI", subModule: "KPI Setting",  section: "Perspektif Keuangan",   description: "Updated KPI Personal — changed target for Perspektif Keuangan",                  ipAddress: "10.0.0.55",    status: "Success", before: '{"target":"80"}',       after: '{"target":"90"}' },
  { id: "A008", timestamp: "2026-06-09 12:10:05", userId: "E002", userName: "Siti Rahayu",   role: "Employee",   action: "Create",  module: "KPI", subModule: "KPI Setting",                                    description: "Submitted KPI Personal setting for approval",                                     ipAddress: "10.0.0.88",    status: "Success" },
  { id: "A013", timestamp: "2026-06-08 16:00:00", userId: "E008", userName: "Hendra Wijaya", role: "Supervisor", action: "Approve", module: "KPI", subModule: "KPI Setting",                                    description: "Approved KPI Corporate for Divisi Operasional",                                   ipAddress: "192.168.3.5",  status: "Success" },
  { id: "A018", timestamp: "2026-06-06 17:00:00", userId: "E011", userName: "Kartini Dewi",  role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Setting",  section: "Perspektif Pelanggan",  description: "Edited KPI Personal — updated bobot for Perspektif Pelanggan",                    ipAddress: "10.0.0.77",    status: "Success" },

  // ── KPI → KPI Tracking ───────────────────────────────────────────────────────
  { id: "A021", timestamp: "2026-07-10 09:05:00", userId: "E002", userName: "Siti Rahayu",   role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Keuangan",              description: "Updated target for 'Revenue Growth Rate' from 85 to 92",           ipAddress: "10.0.0.88",    status: "Success", before: '{"kpi":"Revenue Growth Rate","target":85}',                after: '{"kpi":"Revenue Growth Rate","target":92}'              },
  { id: "A022", timestamp: "2026-07-10 09:18:42", userId: "E002", userName: "Siti Rahayu",   role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Keuangan",              description: "Updated aktual for 'Revenue Growth Rate' from 0 to 78.5",          ipAddress: "10.0.0.88",    status: "Success", before: '{"kpi":"Revenue Growth Rate","aktual":0}',                 after: '{"kpi":"Revenue Growth Rate","aktual":78.5}'            },
  { id: "A023", timestamp: "2026-07-11 10:30:00", userId: "E004", userName: "Diana Kusuma",  role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Pelanggan",             description: "Updated target for 'Customer Satisfaction Score' from 80 to 85",   ipAddress: "10.0.0.44",    status: "Success", before: '{"kpi":"Customer Satisfaction Score","target":80}',        after: '{"kpi":"Customer Satisfaction Score","target":85}'       },
  { id: "A024", timestamp: "2026-07-11 11:05:17", userId: "E004", userName: "Diana Kusuma",  role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Pelanggan",             description: "Updated aktual for 'Customer Satisfaction Score' from 72 to 81",   ipAddress: "10.0.0.44",    status: "Success", before: '{"kpi":"Customer Satisfaction Score","aktual":72}',        after: '{"kpi":"Customer Satisfaction Score","aktual":81}'       },
  { id: "A025", timestamp: "2026-07-12 14:20:00", userId: "E011", userName: "Kartini Dewi",  role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Proses Bisnis",         description: "Updated target for 'Process Efficiency Index' from 75 to 80",      ipAddress: "10.0.0.77",    status: "Success", before: '{"kpi":"Process Efficiency Index","target":75}',           after: '{"kpi":"Process Efficiency Index","target":80}'          },
  { id: "A026", timestamp: "2026-07-12 14:45:00", userId: "E011", userName: "Kartini Dewi",  role: "Employee",   action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Proses Bisnis",         description: "Updated aktual for 'Process Efficiency Index' — entered 68.3",     ipAddress: "10.0.0.77",    status: "Success", before: '{"kpi":"Process Efficiency Index","aktual":null}',         after: '{"kpi":"Process Efficiency Index","aktual":68.3}'        },
  { id: "A027", timestamp: "2026-07-13 08:55:00", userId: "E008", userName: "Hendra Wijaya", role: "Supervisor", action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Pembelajaran & Pertumbuhan", description: "Updated target for 'Training Hours per Employee' from 20 to 24", ipAddress: "192.168.3.5",  status: "Success", before: '{"kpi":"Training Hours per Employee","target":20}',        after: '{"kpi":"Training Hours per Employee","target":24}'       },
  { id: "A028", timestamp: "2026-07-13 09:10:00", userId: "E008", userName: "Hendra Wijaya", role: "Supervisor", action: "Update",  module: "KPI", subModule: "KPI Tracking", section: "Perspektif Pembelajaran & Pertumbuhan", description: "Updated aktual for 'Training Hours per Employee' from 18 to 22", ipAddress: "192.168.3.5",  status: "Failed",  before: '{"kpi":"Training Hours per Employee","aktual":18}',        after: '{"error":"Validation failed — value exceeds annual cap"}' },

  // ── KPI → Monitoring ─────────────────────────────────────────────────────────
  { id: "A015", timestamp: "2026-06-08 13:20:00", userId: "E013", userName: "Anis Sandi",    role: "HR Admin",   action: "Export",  module: "KPI", subModule: "Monitoring", description: "Exported KPI Monitoring report to Excel (all employees)",                          ipAddress: "192.168.1.10", status: "Success" },

  // ── Project ──────────────────────────────────────────────────────────────────
  { id: "A017", timestamp: "2026-06-07 08:30:00", userId: "E006", userName: "Fajar Hidayat", role: "Supervisor", action: "Create",  module: "Project", subModule: "Project Setting", description: "Added new Project Outside Job — ISO 45001 Task Force",                          ipAddress: "192.168.4.2",  status: "Success" },
  { id: "A020", timestamp: "2026-06-04 15:00:00", userId: "E009", userName: "Indah Lestari", role: "Employee",   action: "Create",  module: "Project", subModule: "Project Setting", description: "Submitted Project Outside Job — Boiler QCC Improvement",                        ipAddress: "10.0.0.99",    status: "Failed",  before: undefined,                                                  after: '{"error":"Duplicate entry"}' },
];

const ACTION_COLORS: Record<ActionType, string> = {
  Login:   "bg-blue-50 text-blue-700",
  Logout:  "bg-gray-100 text-gray-600",
  Create:  "bg-emerald-50 text-emerald-700",
  Update:  "bg-amber-50 text-amber-700",
  Delete:  "bg-red-50 text-red-600",
  Approve: "bg-purple-50 text-purple-700",
  Reject:  "bg-orange-50 text-orange-700",
  Export:  "bg-cyan-50 text-cyan-700",
};

const MAIN_MODULES: MainModule[] = ["KPI", "Performance Appraisal", "SMART Goals", "HR Settings", "Project", "Dashboard", "System"];
const ACTIONS: ActionType[] = ["Login", "Logout", "Create", "Update", "Delete", "Approve", "Reject", "Export"];

// derive sub-module list per main module
const SUB_MODULES: Record<string, string[]> = {
  "KPI":                   ["KPI Setting", "KPI Tracking", "Monitoring"],
  "Performance Appraisal": ["Measurement", "Appraisal Form", "Approvals"],
  "SMART Goals":           ["SMART Goals Setting", "SMART Goals Tracking"],
  "HR Settings":           ["User Management", "Access Management", "Menu Management", "Approval Management", "Audit Trail", "Data Sync", "Open Lock"],
  "Project":               ["Project Setting"],
  "Dashboard":             [],
  "System":                [],
};

function DetailModal({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">Audit Log Detail</h2>
            <p className="text-xs text-gray-400 mt-0.5">ID: {log.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Timestamp",  value: log.timestamp },
              { label: "IP Address", value: log.ipAddress },
              { label: "User",       value: `${log.userName} (${log.userId})` },
              { label: "Role",       value: log.role },
              { label: "Status",     value: log.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-gray-400 mb-1">Module</p>
              <span className="inline-flex px-2 py-0.5 rounded bg-[#1A284F]/10 text-[#1A284F] text-xs font-semibold">{log.module}</span>
            </div>
            {log.subModule && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Sub Module</p>
                <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{log.subModule}</span>
              </div>
            )}
            {log.section && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">Section / Table</p>
                <p className="text-sm font-medium text-gray-800">{log.section}</p>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Action</p>
            <span className={`inline-flex px-2.5 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action]}`}>{log.action}</span>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Description</p>
            <p className="text-sm text-gray-700 leading-relaxed">{log.description}</p>
          </div>
          {(log.before || log.after) && (
            <div className="grid grid-cols-2 gap-3">
              {log.before && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Before</p>
                  <pre className="bg-red-50 text-red-700 text-xs rounded-lg p-3 overflow-auto">{log.before}</pre>
                </div>
              )}
              {log.after && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">After</p>
                  <pre className="bg-emerald-50 text-emerald-700 text-xs rounded-lg p-3 overflow-auto">{log.after}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 text-right">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

export function AuditTrailPage() {
  const [dynamicLogs, setDynamicLogs] = useState(() => loadLocalAuditLogs());
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("All Modules");
  const [subModuleFilter, setSubModuleFilter] = useState("All Sub Modules");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewLog, setViewLog] = useState<AuditLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const refresh = () => setDynamicLogs(loadLocalAuditLogs());
    window.addEventListener("pa-audit-updated", refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener("pa-audit-updated", refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const allLogs = useMemo<AuditLog[]>(() => {
    const mappedDynamic: AuditLog[] = dynamicLogs.map((d) => ({
      id: d.id,
      timestamp: d.timestamp,
      userId: d.userId,
      userName: d.userName,
      role: d.role,
      action: (ACTIONS.includes(d.action as ActionType) ? d.action : "Update") as ActionType,
      module: (MAIN_MODULES.includes(d.module as MainModule) ? d.module : "Performance Appraisal") as MainModule,
      subModule: d.subModule && d.subModule !== "-" ? d.subModule : undefined,
      description: d.description,
      ipAddress: d.ipAddress || "10.0.1.15",
      status: d.status,
    }));
    return mappedDynamic;
  }, [dynamicLogs]);

  // available sub-modules based on selected main module
  const availableSubModules =
    moduleFilter !== "All Modules"
      ? SUB_MODULES[moduleFilter] ?? []
      : Array.from(new Set(allLogs.map(l => l.subModule).filter(Boolean))) as string[];

  function handleModuleChange(v: string) {
    setModuleFilter(v);
    setSubModuleFilter("All Sub Modules");
    setCurrentPage(1);
  }

  const filtered = allLogs.filter(l => {
    if (moduleFilter !== "All Modules" && l.module !== moduleFilter) return false;
    if (subModuleFilter !== "All Sub Modules" && l.subModule !== subModuleFilter) return false;
    if (actionFilter !== "All Actions" && l.action !== actionFilter) return false;
    if (statusFilter !== "All Status" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.userName.toLowerCase().includes(q) && !l.userId.toLowerCase().includes(q) &&
          !l.description.toLowerCase().includes(q) && !l.ipAddress.includes(q)) return false;
    }
    if (dateFrom && l.timestamp < dateFrom) return false;
    if (dateTo && l.timestamp.slice(0, 10) > dateTo) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  function reset() {
    setSearch(""); setModuleFilter("All Modules"); setSubModuleFilter("All Sub Modules");
    setActionFilter("All Actions"); setStatusFilter("All Status");
    setDateFrom(""); setDateTo(""); setCurrentPage(1);
  }

  const hasActiveFilters = moduleFilter !== "All Modules" || subModuleFilter !== "All Sub Modules" || actionFilter !== "All Actions" || statusFilter !== "All Status" || !!dateFrom || !!dateTo;

  const successCount = allLogs.filter(l => l.status === "Success").length;
  const failedCount  = allLogs.filter(l => l.status === "Failed").length;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-[#1A284F] text-xl">Audit Trail</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all system activity and user actions</p>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span><span>Home</span><span className="mx-1">›</span><span>Setting</span><span className="mx-1">›</span>
          <span className="font-medium text-gray-700">Audit Trail</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Logs", value: allLogs.length,     color: "bg-[#1A284F] text-white" },
          { label: "Successful", value: successCount,         color: "bg-emerald-600 text-white" },
          { label: "Failed",     value: failedCount,          color: "bg-red-500 text-white" },
          { label: "Today",      value: allLogs.filter(l => l.timestamp.startsWith(todayStr) || l.timestamp.startsWith("2026-07-15")).length, color: "bg-blue-600 text-white" },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-5 py-4 ${s.color} shadow-sm`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs opacity-80 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100">
          {/* Page size */}
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

          {/* Module (main menu) */}
          <div className="relative min-w-[170px]">
            <select className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={moduleFilter} onChange={e => handleModuleChange(e.target.value)}>
              <option>All Modules</option>
              {MAIN_MODULES.map(m => <option key={m}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Sub Module (submenu) */}
          <div className="relative min-w-[160px]">
            <select
              className="w-full appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40"
              value={subModuleFilter}
              onChange={e => { setSubModuleFilter(e.target.value); setCurrentPage(1); }}
              disabled={availableSubModules.length === 0}
            >
              <option>All Sub Modules</option>
              {availableSubModules.map(s => <option key={s}>{s}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Action */}
          <div className="relative">
            <select className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={actionFilter} onChange={e => { setActionFilter(e.target.value); setCurrentPage(1); }}>
              <option>All Actions</option>
              {ACTIONS.map(a => <option key={a}>{a}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Status */}
          <div className="relative">
            <select className="appearance-none border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
              {["All Status", "Success", "Failed"].map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${showFilters ? "border-blue-500 text-blue-600 bg-blue-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            <Filter size={13} /> Date Range
          </button>

          <div className="flex-1" />
          {hasActiveFilters && (
            <button onClick={reset} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
          )}
          <button onClick={() => { reset(); void hydrateAllStoresFromSupabase(); }} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50" title="Refresh from Supabase"><RefreshCw size={14} /></button>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
              placeholder="Search user, action, IP..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
          </div>
          <button
            onClick={() => {
              const csv = [
                ["ID", "Timestamp", "User ID", "User Name", "Role", "Action", "Module", "Sub Module", "Description", "IP Address", "Status"].join(","),
                ...filtered.map((l) =>
                  [l.id, l.timestamp, l.userId, `"${l.userName}"`, l.role, l.action, l.module, l.subModule ?? "", `"${l.description.replace(/"/g, '""')}"`, l.ipAddress, l.status].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `Audit_Trail_${todayStr}.csv`;
              a.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <Download size={13} /> Export
          </button>
        </div>

        {/* Date range row */}
        {showFilters && (
          <div className="flex items-center gap-3 px-5 py-3 bg-blue-50/50 border-b border-blue-100">
            <span className="text-sm text-gray-600">From</span>
            <DatePickerID value={dateFrom} onChange={(iso) => { setDateFrom(iso); setCurrentPage(1); }} size="sm" />
            <span className="text-sm text-gray-600">To</span>
            <DatePickerID value={dateTo} onChange={(iso) => { setDateTo(iso); setCurrentPage(1); }} size="sm" />
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-blue-600 hover:underline">Clear</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sub Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Section / Table</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">IP Address</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Detail</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-gray-400 py-14">No audit logs match the current filter.</td></tr>
              ) : paginated.map((log, idx) => (
                <tr key={log.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${idx % 2 === 1 ? "bg-gray-50/20" : ""}`}>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-800 text-xs">{log.userName}</p>
                    <p className="text-gray-400 text-xs">{log.userId} · {log.role}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action]}`}>{log.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    <span className="inline-flex px-2 py-0.5 rounded bg-[#1A284F]/10 text-[#1A284F] font-semibold">{log.module}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {log.subModule
                      ? <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap">{log.subModule}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[160px]">
                    {log.section
                      ? <span className="line-clamp-2">{log.section}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[240px]">
                    <span className="line-clamp-2">{log.description}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono whitespace-nowrap">{log.ipAddress}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${log.status === "Success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${log.status === "Success" ? "bg-emerald-500" : "bg-red-400"}`} />
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => setViewLog(log)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="View detail">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {paginated.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + paginated.length} of {filtered.length} logs</span>
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

      {viewLog && <DetailModal log={viewLog} onClose={() => setViewLog(null)} />}
    </div>
  );
}
