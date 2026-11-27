// @refresh reset
import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LangProvider } from "../context/LangContext";
import { AppFrame } from "./AppFrame";
import { ApproverLoginReminderModal } from "./ApproverLoginReminderModal";
import { evaluateRecurringThreeDayApproverReminders } from "../store/approverReminderStore";
import { syncNotificationsFromBackendRealtime } from "../store/notificationStore";
import { syncRecentWorkflowDocumentsRealtime } from "../services/supabaseClient";
import {
  AUTH_SESSION_KEY,
  SESSION_TIMEOUT_MS,
  evaluateAndSyncSession,
  markSessionAwayFromPaPage,
  peekSessionValidity,
  useAuthStore,
} from "../store/authStore";

const USER_SIDEBAR_HIDDEN_KEY = "pa_user_sidebar_hidden_v1";

let moduleUserSidebarHidden: boolean = (() => {
  try {
    return sessionStorage.getItem(USER_SIDEBAR_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
})();

function writeUserSidebarHidden(next: boolean) {
  moduleUserSidebarHidden = next;
  try {
    if (next) sessionStorage.setItem(USER_SIDEBAR_HIDDEN_KEY, "1");
    else sessionStorage.removeItem(USER_SIDEBAR_HIDDEN_KEY);
  } catch {
    // ignore
  }
}

export function AppLayout() {
  const location = useLocation();
  const { activeUser, portalPath } = useAuthStore();
  const [userSidebarHidden, setUserSidebarHidden] = useState<boolean>(() => moduleUserSidebarHidden);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [, setSessionTick] = useState(0);
  const sidebarCollapsed = userSidebarHidden || tableFullscreen;

  useEffect(() => {
    const onTableFullscreen = (e: Event) => {
      const custom = e as CustomEvent<{ fullscreen?: boolean }>;
      if (typeof custom.detail?.fullscreen === "boolean") {
        setTableFullscreen(custom.detail.fullscreen);
      }
    };
    window.addEventListener("pa-table-fullscreen-change", onTableFullscreen);
    return () => window.removeEventListener("pa-table-fullscreen-change", onTableFullscreen);
  }, []);

  const handleToggleSidebar = () => {
    if (sidebarCollapsed) {
      writeUserSidebarHidden(false);
      setUserSidebarHidden(false);
      setTableFullscreen(false);
    } else {
      writeUserSidebarHidden(true);
      setUserSidebarHidden(true);
    }
  };

  const sessionSnapshot = peekSessionValidity();

  useEffect(() => {
    if (!sessionSnapshot.valid) {
      if (sessionSnapshot.expired) {
        evaluateAndSyncSession(false);
      }
      return;
    }

    let awayTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAwayTimer = () => {
      if (awayTimer !== null) {
        clearTimeout(awayTimer);
        awayTimer = null;
      }
    };

    const syncVisibility = () => {
      const visible = document.visibilityState === "visible";
      const res = evaluateAndSyncSession(visible);
      clearAwayTimer();
      if (!res.authenticated) {
        setSessionTick((t) => t + 1);
        return;
      }
      if (!visible) {
        // Saat tidak berada di halaman PA (tab hidden/pindah tab/minimize), sesi 30 menit menghitung
        awayTimer = setTimeout(() => {
          const check = evaluateAndSyncSession(false);
          if (!check.authenticated) {
            setSessionTick((t) => t + 1);
          }
        }, SESSION_TIMEOUT_MS + 250);
      }
    };

    const handlePageLeave = () => {
      markSessionAwayFromPaPage();
    };

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === AUTH_SESSION_KEY) {
        setSessionTick((t) => t + 1);
      }
    };

    // Saat kembali ke halaman PA dalam kondisi sesi masih aktif, hitungan otomatis di-reset kembali
    syncVisibility();

    // Heartbeat saat aktif di halaman PA (selama tab PA terlihat, sesi tidak menghitung mundur)
    const heartbeat = setInterval(() => {
      const visible = document.visibilityState === "visible";
      const res = evaluateAndSyncSession(visible);
      if (!res.authenticated) {
        setSessionTick((t) => t + 1);
      }
    }, 15_000);

    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("focus", syncVisibility);
    window.addEventListener("pageshow", syncVisibility);
    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("storage", handleStorage);

    return () => {
      clearAwayTimer();
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("focus", syncVisibility);
      window.removeEventListener("pageshow", syncVisibility);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("storage", handleStorage);
      markSessionAwayFromPaPage();
    };
  }, [sessionSnapshot.valid, sessionSnapshot.expired]);

  useEffect(() => {
    if (sessionSnapshot.valid && document.visibilityState === "visible") {
      evaluateAndSyncSession(true);
    }
  }, [location.pathname, sessionSnapshot.valid]);

  // Sinkronisasi realtime notifikasi & antrean task approval + evaluasi reminder berulang 3 hari bagi Approver
  useEffect(() => {
    if (!sessionSnapshot.valid || !activeUser.employeeId) return;
    let cancelled = false;
    const runRealtimeSync = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void Promise.all([
        syncNotificationsFromBackendRealtime(),
        syncRecentWorkflowDocumentsRealtime(60),
      ]).then(() => {
        if (!cancelled) {
          evaluateRecurringThreeDayApproverReminders();
        }
      });
    };
    runRealtimeSync();
    const intervalId = window.setInterval(runRealtimeSync, 8000);
    const onFocusOrVis = () => {
      if (document.visibilityState === "visible") runRealtimeSync();
    };
    const onAppraisalUpdated = () => {
      evaluateRecurringThreeDayApproverReminders();
    };
    window.addEventListener("focus", onFocusOrVis);
    document.addEventListener("visibilitychange", onFocusOrVis);
    window.addEventListener("appraisal-updated", onAppraisalUpdated);
    window.addEventListener("pa-db-hydrated", onAppraisalUpdated);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocusOrVis);
      document.removeEventListener("visibilitychange", onFocusOrVis);
      window.removeEventListener("appraisal-updated", onAppraisalUpdated);
      window.removeEventListener("pa-db-hydrated", onAppraisalUpdated);
    };
  }, [sessionSnapshot.valid, activeUser.employeeId]);

  if (!sessionSnapshot.valid) {
    return (
      <Navigate
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
        replace
      />
    );
  }

  // Portal Sidebar mengikuti user yang login (bukan URL), agar menu tidak berubah posisi
  // saat membuka halaman lintas portal (mis. /supervisor/... dari login Administrator/HR Unit).
  const urlPortal = location.pathname.split("/")[1] || "hr";
  const role = portalPath ? portalPath.replace(/^\//, "") : urlPortal;

  return (
    <LangProvider>
      <AppFrame sidebar={<Sidebar role={role} collapsed={sidebarCollapsed} />} topbar={<Topbar
              role={role}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={handleToggleSidebar}
            />}>
        <div key={activeUser.employeeId} className="contents">
          <Outlet />
        </div>
        <ApproverLoginReminderModal />
      </AppFrame>
    </LangProvider>
  );
}
