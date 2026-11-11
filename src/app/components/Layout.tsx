import { Outlet, useLocation } from "react-router";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LangProvider } from "../context/LangContext";
import { AppFrame } from "./AppFrame";
import { useAuthStore } from "../store/authStore";

export function AppLayout() {
  const location = useLocation();
  const { portalPath } = useAuthStore();
  // Portal Sidebar mengikuti user yang login (bukan URL), agar menu tidak berubah posisi
  // saat membuka halaman lintas portal (mis. /supervisor/... dari login Administrator/HR Unit).
  const urlPortal = location.pathname.split("/")[1] || "hr";
  const role = portalPath ? portalPath.replace(/^\//, "") : urlPortal;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <LangProvider>
      <AppFrame sidebar={<Sidebar role={role} collapsed={sidebarCollapsed} />} topbar={<Topbar
              role={role}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            />}>
        <Outlet />
      </AppFrame>
    </LangProvider>
  );
}
