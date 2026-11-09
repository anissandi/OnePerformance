import { Outlet, useLocation } from "react-router";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LangProvider } from "../context/LangContext";
import { AppFrame } from "./AppFrame";

export function AppLayout() {
  const location = useLocation();
  const role = location.pathname.split("/")[1] || "hr";
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
