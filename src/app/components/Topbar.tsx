// @refresh reset
import { Bell, User, LogOut, ChevronDown, Clock, ArrowRight, X, CheckCheck, Search, LayoutDashboard, BarChart2, CalendarCheck, Settings, FileText, ShieldCheck, Database, PanelLeftClose, PanelLeftOpen, KeyRound, Eye, EyeOff, CheckCircle2, ShieldAlert } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { STAFF_PROFILE, SUPERVISOR_PROFILE } from "../store/profileStore";
import { resolvePortalPathForRole, switchActiveUserByEmployeeId, useAuthStore } from "../store/authStore";
import {
  NOTIFICATION_CATEGORY_META,
  resolveNotificationRouteForUser,
  useNotificationStore,
} from "../store/notificationStore";
import {
  updateEmployeeNewPassword,
  validateNewPasswordPolicy,
} from "../store/loginManagementStore";

// ─── Search data ──────────────────────────────────────────────────────────────

interface SearchItem {
  label: string;
  path: string;
  category: string;
}

const SUPERVISOR_ITEMS: SearchItem[] = [
  { label: "Dashboard", path: "/supervisor", category: "Main" },
  { label: "Appraisals", path: "/supervisor/appraisals", category: "Main" },
  { label: "Appraisal Summary", path: "/supervisor/summary", category: "Main" },
  { label: "My Performance Appraisal", path: "/supervisor/appraisal", category: "Main" },
  { label: "Documents", path: "/supervisor/documents", category: "Main" },
  { label: "Profile", path: "/supervisor/profile", category: "Main" },
  { label: "KPI Monitoring", path: "/supervisor/monitoring/kpi", category: "Monitoring" },
  { label: "SMART Goals Monitoring", path: "/supervisor/monitoring/smart-goals", category: "Monitoring" },
  { label: "Appraisal Form Monitoring", path: "/supervisor/monitoring/appraisal-form", category: "Monitoring" },
  { label: "Project Monitoring", path: "/supervisor/monitoring/project", category: "Monitoring" },
  { label: "Managerial Skill Monitoring", path: "/supervisor/monitoring/managerial-skill", category: "Monitoring" },
  { label: "Management Interview Monitoring", path: "/supervisor/monitoring/management-interview", category: "Monitoring" },
  { label: "KPI Tracking", path: "/supervisor/measurement/kpi-tracking", category: "Measurement" },
  { label: "SMART Goals (Measurement)", path: "/supervisor/measurement/smart-goals", category: "Measurement" },
  { label: "SMART Goals (Setting)", path: "/supervisor/setting/smart-goals", category: "Setting" },
  { label: "Appraisal Form", path: "/supervisor/measurement/appraisal-form", category: "Measurement" },
  { label: "Root Cause Analysis (RCA)", path: "/supervisor/measurement/rca", category: "Measurement" },
  { label: "Project Outside Job Scope", path: "/supervisor/measurement/project-outside", category: "Measurement" },
  { label: "Managerial Skill", path: "/supervisor/measurement/managerial-skill", category: "Measurement" },
  { label: "Management Interview", path: "/supervisor/calibration/management-interview", category: "Calibration" },
  { label: "Inter-Department Feedback", path: "/supervisor/measurement/inter-department-feedback", category: "Measurement" },
  { label: "Team Performance Calibration", path: "/supervisor/calibration/team-performance", category: "Calibration" },
  { label: "PA Cycle History", path: "/supervisor/history", category: "Main" },
  { label: "KPI Setting", path: "/supervisor/setting/kpi", category: "Settings" },
  { label: "Project Setting", path: "/supervisor/setting/project", category: "Settings" },
  { label: "Management Interview Setting", path: "/supervisor/setting/management-interview", category: "Settings" },
];

const HR_ITEMS: SearchItem[] = [
  { label: "Dashboard", path: "/hr", category: "Main" },
  { label: "Approvals", path: "/hr/approvals", category: "Main" },
  { label: "Module Activation", path: "/hr/modules", category: "Main" },
  { label: "Management Override", path: "/hr/override", category: "Main" },
  { label: "Appraisal Summary", path: "/hr/summary", category: "Main" },
  { label: "Documents", path: "/hr/documents", category: "Main" },
  { label: "Profile", path: "/hr/profile", category: "Main" },
  { label: "KPI Monitoring", path: "/hr/monitoring/kpi", category: "Monitoring" },
  { label: "SMART Goals Monitoring", path: "/hr/monitoring/smart-goals", category: "Monitoring" },
  { label: "Appraisal Form Monitoring", path: "/hr/monitoring/appraisal-form", category: "Monitoring" },
  { label: "Project Monitoring", path: "/hr/monitoring/project", category: "Monitoring" },
  { label: "Managerial Skill Monitoring", path: "/hr/monitoring/managerial-skill", category: "Monitoring" },
  { label: "Management Interview Monitoring", path: "/hr/monitoring/management-interview", category: "Monitoring" },
  { label: "KPI Tracking Evidence", path: "/hr/evidence/kpi-tracking", category: "Evidence" },
  { label: "RCA Evidence", path: "/hr/evidence/rca", category: "Evidence" },
  { label: "SMART Goals Evidence", path: "/hr/evidence/smart-goals", category: "Evidence" },
  { label: "Management Interview Evidence", path: "/hr/evidence/management-interview", category: "Evidence" },
  { label: "KPI Setting", path: "/hr/settings/kpi", category: "Settings" },
  { label: "Open Lock", path: "/hr/settings/open-lock", category: "Settings" },
  { label: "Approval Management", path: "/hr/settings/approval-management", category: "Settings" },
  { label: "User Management", path: "/hr/settings/user-management", category: "Settings" },
  { label: "Access Management", path: "/hr/settings/access-management", category: "Settings" },
  { label: "Menu Management", path: "/hr/settings/menu-management", category: "Settings" },
  { label: "Notification Management", path: "/hr/settings/notification-management", category: "Settings" },
  { label: "Audit Trail", path: "/hr/settings/audit-trail", category: "Settings" },
  { label: "Data Sync", path: "/hr/settings/data-sync", category: "Settings" },
  { label: "Scores Calibration", path: "/hr/settings/scores-calibration", category: "Calibration" },
  { label: "Calibration Setting", path: "/hr/calibration/setting", category: "Calibration" },
  { label: "Verification", path: "/hr/calibration/verification", category: "Calibration" },
  { label: "Calibration Adjustment", path: "/hr/calibration/adjustment", category: "Calibration" },
  { label: "Management Interview Calibration", path: "/hr/calibration/management-interview", category: "Calibration" },
  { label: "Master Appraisal Form", path: "/hr/settings/master/appraisal-form", category: "Master Data" },
  { label: "Master Managerial Skill", path: "/hr/settings/master/managerial-skill", category: "Master Data" },
  { label: "Master KPI", path: "/hr/settings/master/kpi", category: "Master Data" },
  { label: "Cycle Management", path: "/hr/settings/cycle", category: "Settings" },
  { label: "PA Cycle History", path: "/hr/history", category: "Main" },
];

const EMPLOYEE_ITEMS: SearchItem[] = [
  { label: "Dashboard",                 path: "/employee",              category: "Main"        },
  { label: "My Profile",               path: "/employee/profile",      category: "Main"        },
  { label: "My Performance Appraisal", path: "/employee/appraisal",    category: "Main"        },
  { label: "Documents",                path: "/employee/documents",     category: "Main"        },
  { label: "KPI Setting",              path: "/employee/setting/kpi",                  category: "PA Setting"  },
  { label: "SMART Goals Setting",      path: "/employee/setting/smart-goals",          category: "PA Setting"  },
  { label: "KPI Tracking",             path: "/employee/measurement/kpi-tracking",     category: "Measurement" },
  { label: "SMART Goals",              path: "/employee/measurement/smart-goals",      category: "Measurement" },
  { label: "Appraisal Form",           path: "/employee/measurement/appraisal-form",   category: "Measurement" },
  { label: "Root Cause Analysis (RCA)",path: "/employee/measurement/rca",              category: "Measurement" },
  { label: "Project Outside Job Scope",path: "/employee/measurement/project-outside",  category: "Measurement" },
];

const CATEGORY_META: Record<string, { color: string; icon: React.ReactNode }> = {
  "Main":        { color: "bg-[#1A284F]/10 text-[#1A284F]",    icon: <LayoutDashboard className="w-3 h-3" /> },
  "Monitoring":  { color: "bg-blue-100 text-blue-700",          icon: <BarChart2 className="w-3 h-3" /> },
  "Mid-Year":    { color: "bg-amber-100 text-amber-700",        icon: <CalendarCheck className="w-3 h-3" /> },
  "Appraisals":  { color: "bg-purple-100 text-purple-700",      icon: <CalendarCheck className="w-3 h-3" /> },
  "Evidence":    { color: "bg-teal-100 text-teal-700",          icon: <FileText className="w-3 h-3" /> },
  "Calibration": { color: "bg-rose-100 text-rose-700",          icon: <ShieldCheck className="w-3 h-3" /> },
  "Settings":    { color: "bg-gray-100 text-gray-600",          icon: <Settings className="w-3 h-3" /> },
  "Master Data": { color: "bg-green-100 text-green-700",        icon: <Database className="w-3 h-3" /> },
  "PA Setting":  { color: "bg-indigo-100 text-indigo-700",      icon: <Settings className="w-3 h-3" /> },
  "Measurement":           { color: "bg-amber-100 text-amber-700",     icon: <CalendarCheck className="w-3 h-3" /> },
  "Management Interview":  { color: "bg-purple-100 text-purple-700",   icon: <CalendarCheck className="w-3 h-3" /> },
  "Setting":               { color: "bg-indigo-100 text-indigo-700",   icon: <Settings className="w-3 h-3" /> },
};

function highlightMatch(text: string, query: string) {
  if (!query) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 text-amber-900 rounded-[2px] font-bold not-italic">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

function GlobalSearch({ role }: { role: string }) {
  const [query, setQuery]           = useState("");
  const [open, setOpen]             = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const containerRef                = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);
  const listRef                     = useRef<HTMLUListElement>(null);
  const navigate                    = useNavigate();

  const BOD_EXTRA: SearchItem[] = [
    { label: "Calibration Approval", path: "/bod/approvals/calibration", category: "Approvals" },
  ];
  const allItems = role === "hr" ? HR_ITEMS : role === "employee" ? EMPLOYEE_ITEMS : role === "bod" ? [...SUPERVISOR_ITEMS, ...BOD_EXTRA] : SUPERVISOR_ITEMS;

  const results = query.trim().length === 0
    ? []
    : allItems
        .filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase()) ||
          item.path.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) => {
          // Exact label starts-with first, then alphabetical
          const aq = a.label.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
          const bq = b.label.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
          if (aq !== bq) return aq - bq;
          return a.label.localeCompare(b.label);
        })
        .slice(0, 8);

  const go = useCallback((path: string) => {
    navigate(path);
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
  }, [navigate]);

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const el = listRef.current.children[activeIdx] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIdx >= 0 ? results[activeIdx] : results[0];
      if (target) go(target.path);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative w-72">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search menu or feature…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#1A284F] focus:bg-white transition-colors placeholder:text-gray-400"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setOpen(false); setActiveIdx(-1); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && query.trim().length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-[380px] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
              <Search className="w-7 h-7 opacity-30" />
              <p className="text-xs font-medium">No results for "{query}"</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {results.length} results found
                </span>
                <span className="text-[10px] text-gray-300">↑↓ navigate · ↵ open</span>
              </div>
              <ul ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
                {results.map((item, i) => {
                  const meta = CATEGORY_META[item.category] ?? CATEGORY_META["Pengaturan"];
                  const isActive = i === activeIdx;
                  return (
                    <li key={item.path}>
                      <button
                        onMouseEnter={() => setActiveIdx(i)}
                        onMouseLeave={() => setActiveIdx(-1)}
                        onClick={() => go(item.path)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-[#1A284F]/5" : "hover:bg-gray-50"}`}
                      >
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${meta.color}`}>
                          {meta.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">
                            {highlightMatch(item.label, query)}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{item.path}</p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                          {item.category}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-2 border-t border-gray-50 bg-gray-50/50">
                <p className="text-[10px] text-gray-400">
                  Press <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono">Esc</kbd> to close
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatNotifTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar({
  role,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  role: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const { activeUser, allUsers } = useAuthStore();
  const {
    userNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearOne,
  } = useNotificationStore(activeUser);
  const [lang, setLang] = useState<"EN" | "ID">("EN");
  const [dropOpen, setDropOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifToast, setNotifToast] = useState("");

  // Change Password modal state (from top-right profile menu)
  const [changePwdModalOpen, setChangePwdModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccessPopupOpen, setPwdSuccessPopupOpen] = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleSeeAllNotifications = () => {
    setBellOpen(false);
    const validPortal = ["hr", "supervisor", "employee", "bod"].includes(role)
      ? role
      : "supervisor";
    const targetPath = `/${validPortal}/dashboard/my?section=notifications#notification-section`;
    navigate(targetPath);
    setTimeout(() => {
      const el = document.getElementById("notification-section");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  const handleSaveProfilePassword = () => {
    setPwdError("");
    const check = validateNewPasswordPolicy(newPassword);
    if (!check.valid) {
      setPwdError(check.message);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwdError("Konfirmasi password baru tidak cocok.");
      return;
    }
    const res = updateEmployeeNewPassword(activeUser.employeeId, newPassword);
    if (!res.ok) {
      setPwdError(res.error);
      return;
    }
    setChangePwdModalOpen(false);
    setNewPassword("");
    setConfirmNewPassword("");
    setPwdSuccessPopupOpen(true);
  };

  const pwdPolicy = validateNewPasswordPolicy(newPassword);

  const titles = {
    hr: { title: "Performance Appraisal Hub", subtitle: "Administrator" },
    employee: { title: "Performance Appraisal Hub", subtitle: "Employee Portal" },
    supervisor: { title: "Performance Appraisal Hub", subtitle: "Approver Portal" },
    bod: { title: "Performance Appraisal Hub", subtitle: "Board of Directors" },
  };

  const { title, subtitle } = titles[role as keyof typeof titles] || titles.hr;
  const displayUserName = activeUser?.name || (role === "employee" ? STAFF_PROFILE.name : SUPERVISOR_PROFILE.name);
  const displayInitials = displayUserName
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "PA";

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const showSearch = role === "supervisor" || role === "hr" || role === "employee";

  return (
    <div className="h-[88px] border-b border-gray-100 flex items-center justify-between px-8 gap-6 shrink-0">
      {/* Sidebar toggle + left content */}
      <div className="flex items-center gap-3 shrink-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5" />
            ) : (
              <PanelLeftClose className="w-5 h-5" />
            )}
          </button>
        )}
        {showSearch ? (
          <GlobalSearch role={role} />
        ) : (
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">

        {/* Bell + notification panel */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen((o) => !o)}
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-500" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full border-2 border-white px-0.5">
                {unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#1A284F]" />
                  <span className="text-sm font-bold text-gray-800">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{unreadCount}</span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="flex items-center gap-1 text-[11px] text-[#1A284F] font-semibold hover:underline">
                    <CheckCheck className="w-3 h-3" />
                    Mark all as read
                  </button>
                )}
              </div>

              {notifToast && (
                <div className="px-4 py-2 bg-rose-50 border-b border-rose-100 text-[11px] text-rose-700 font-medium">
                  {notifToast}
                </div>
              )}

              <div className="max-h-[380px] overflow-y-auto">
                {userNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                    <Bell className="w-8 h-8 opacity-30" />
                    <p className="text-xs font-medium">No notifications</p>
                  </div>
                ) : (
                  userNotifications.slice(0, 6).map((n) => {
                    const catMeta = NOTIFICATION_CATEGORY_META[n.category] ?? NOTIFICATION_CATEGORY_META.Info;
                    const resolvedRoute = resolveNotificationRouteForUser(n.ctaRoute, activeUser);
                    return (
                      <div
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`relative flex flex-col gap-1.5 px-4 py-3.5 border-b border-gray-100 cursor-pointer transition-colors ${
                          n.isRead ? "bg-white hover:bg-gray-50/70" : "bg-amber-50/75 hover:bg-amber-100/60"
                        }`}
                      >
                        {!n.isRead && (
                          <span className="absolute top-4 left-1.5 w-1.5 h-1.5 rounded-full bg-amber-300 ring-2 ring-amber-200" />
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const res = clearOne(n.id);
                            if (!res.ok && res.error) {
                              setNotifToast(res.error);
                              setTimeout(() => setNotifToast(""), 3200);
                            }
                          }}
                          title={n.isRead ? "Clear notification" : "Baca terlebih dahulu sebelum clear"}
                          className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 pl-1 pr-5">
                          <span className={`px-1.5 py-0.5 rounded font-semibold ${catMeta.badgeBg} ${catMeta.badgeText}`}>
                            {catMeta.label}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatNotifTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-gray-800 pl-1 pr-4">{n.title}</p>
                        <p className="text-xs text-gray-600 leading-relaxed pl-1 line-clamp-2">
                          {n.summary || n.body[0]}
                        </p>
                        {resolvedRoute && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(n.id);
                              setBellOpen(false);
                              navigate(resolvedRoute);
                            }}
                            className="self-start flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg bg-[#1A284F] text-white text-[10px] font-bold hover:bg-[#131d3b] transition-colors"
                          >
                            {n.ctaLabel || "Buka"}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* See all Notification button */}
              <div className="p-2.5 bg-gray-50/80 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSeeAllNotifications}
                  className="w-full py-2 px-3 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  See all Notification
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-8 bg-gray-200" />

        {/* Profile + dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropOpen((o) => !o)}
            className="flex items-center gap-3 hover:bg-gray-50 rounded-xl px-2 py-1 transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-800 leading-tight">{displayUserName}</p>
              <p className="text-[11px] text-gray-400 leading-tight">
                {activeUser.employeeId} · {activeUser.role} · {activeUser.company}
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#1A284F] flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white tracking-wide">
                {displayInitials}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropOpen ? "rotate-180" : ""}`} />
          </button>

          {dropOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-50">
              <div className="px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
                <p className="text-xs font-bold text-[#1A284F] truncate">{activeUser.name}</p>
                <p className="text-[11px] text-gray-500 truncate">{activeUser.position}</p>
                <p className="text-[10px] text-gray-400 truncate">{activeUser.company} · {activeUser.groupings}</p>
              </div>
              <button
                onClick={() => { setDropOpen(false); navigate(`/${role}/profile`); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4 text-gray-400" />
                View Profile
              </button>
              <button
                onClick={() => {
                  setDropOpen(false);
                  setNewPassword("");
                  setConfirmNewPassword("");
                  setPwdError("");
                  setChangePwdModalOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50"
              >
                <KeyRound className="w-4 h-4 text-indigo-500" />
                Ganti Password
              </button>
              <div className="px-4 py-2 border-t border-gray-100">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Pindah Akun (User Management)
                </label>
                <select
                  value={activeUser.employeeId}
                  onChange={(e) => {
                    const switched = switchActiveUserByEmployeeId(e.target.value);
                    setDropOpen(false);
                    if (switched) {
                      navigate(resolvePortalPathForRole(switched.role, switched.position));
                    }
                  }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-[#1A284F]"
                >
                  {allUsers
                    .filter((u) => u.status === "Active" && u.role)
                    .map((u) => (
                      <option key={u.employeeId} value={u.employeeId}>
                        {u.employeeId} · {u.name} ({u.role} - {u.company})
                      </option>
                    ))}
                </select>
              </div>
              <div className="h-px bg-gray-100" />
              <button
                onClick={() => { setDropOpen(false); navigate("/login"); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Language toggle */}
        <button
          onClick={() => setLang((l) => (l === "EN" ? "ID" : "EN"))}
          className="flex items-center gap-1.5 bg-[#1A284F] text-white text-xs font-semibold px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
        >
          {lang}
          <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-[#1A284F] rounded-full" />
          </div>
        </button>
      </div>

      {/* Modal Ganti Password dari Menu Profil Kanan Atas */}
      {changePwdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-[#1A284F] text-white">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4" />
                <div>
                  <h3 className="text-sm font-bold">Ganti Password Akun</h3>
                  <p className="text-[11px] text-white/75">
                    {activeUser.name} ({activeUser.employeeId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChangePwdModalOpen(false)}
                className="text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {pwdError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{pwdError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPwdError(""); }}
                    placeholder="Minimal 8 karakter (huruf, angka, simbol)"
                    className="w-full border border-gray-300 rounded-xl pl-3.5 pr-10 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1A284F]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Konfirmasi Password Baru
                </label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => { setConfirmNewPassword(e.target.value); setPwdError(""); }}
                  placeholder="Ketik ulang password baru"
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1A284F]"
                />
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1 text-[11px]">
                <p className="font-semibold text-gray-700 mb-1">Syarat Kombinasi Password:</p>
                <div className={pwdPolicy.hasMinLength ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Minimal 8 karakter
                </div>
                <div className={pwdPolicy.hasLetter ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung huruf (a–z / A–Z)
                </div>
                <div className={pwdPolicy.hasNumber ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung angka (0–9)
                </div>
                <div className={pwdPolicy.hasSymbol ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung simbol (_#*/-$%@! dll)
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChangePwdModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfilePassword}
                  className="px-4 py-2 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold"
                >
                  Simpan Password Baru
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup Konfirmasi Password Berhasil Diperbaharui */}
      {pwdSuccessPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Password Diperbaharui</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Selamat, password Anda sudah diperbaharui, pastikan anda selalu mengingat password Anda, jangan memberi tahu password anda ke siapapun
            </p>
            <button
              type="button"
              onClick={() => setPwdSuccessPopupOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold"
            >
              Baik, Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
