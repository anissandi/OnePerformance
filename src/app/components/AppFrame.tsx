import type { ReactNode } from "react";

export function AppFrame({ sidebar, topbar, children }: { sidebar: ReactNode; topbar: ReactNode; children: ReactNode }) {
  return <div className="flex h-screen h-dvh overflow-hidden bg-white font-sans text-gray-800">
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-white">
      {sidebar}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {topbar}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <main className="min-w-0 flex-1 bg-white p-4 md:p-8">{children}</main>
            <footer className="shrink-0 border-t border-gray-100 py-3 text-center text-xs text-gray-400">Copyright ©2026 Sambu Group</footer>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
