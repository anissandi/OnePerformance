import { NavLink } from "react-router";
import { tabSlug } from "../utils/useRouteTab";

/** Link bar where each sub-module is its own URL (`base` = all modules, `base/<slug>` = one module). */
export function ModuleRouteNav({ base, modules, allLabel = "Semua Modul", label = "Sub-modul" }: {
  base: string; modules: readonly string[]; allLabel?: string; label?: string;
}) {
  const items = [{ label: allLabel, to: base }, ...modules.map((module) => ({ label: module, to: `${base}/${tabSlug(module)}` }))];
  return (
    <nav aria-label={label} className="mb-5 flex flex-wrap gap-2">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end
          className={({ isActive }) => `rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
            isActive
              ? "border-sky-300 bg-sky-100/90 text-[#1A284F] shadow-xs"
              : "border-slate-200/90 bg-slate-50/80 text-slate-600 hover:border-sky-200 hover:bg-sky-50/70 hover:text-sky-800"
          }`}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
