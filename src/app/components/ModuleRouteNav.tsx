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
            isActive ? "border-[#1A284F] bg-[#1A284F] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-[#1A284F]/40 hover:text-[#1A284F]"
          }`}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
