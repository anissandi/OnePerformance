import { NavLink } from "react-router";
import { tabSlug } from "../utils/useRouteTab";

const TAG_THEME_BY_KEY: Record<string, { active: string; inactive: string }> = {
  all: {
    active: "border-[#1A284F] bg-[#1A284F] text-white shadow-sm",
    inactive: "border-slate-300 bg-slate-100/90 text-slate-700 hover:border-slate-400 hover:bg-slate-200/70",
  },
  kpi: {
    active: "border-blue-700 bg-blue-700 text-white shadow-sm",
    inactive: "border-blue-200 bg-blue-50/90 text-blue-700 hover:border-blue-300 hover:bg-blue-100/80",
  },
  "smart-goals": {
    active: "border-emerald-700 bg-emerald-700 text-white shadow-sm",
    inactive: "border-emerald-200 bg-emerald-50/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/80",
  },
  "appraisal-form": {
    active: "border-indigo-700 bg-indigo-700 text-white shadow-sm",
    inactive: "border-indigo-200 bg-indigo-50/90 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100/80",
  },
  "managerial-skill": {
    active: "border-teal-700 bg-teal-700 text-white shadow-sm",
    inactive: "border-teal-200 bg-teal-50/90 text-teal-700 hover:border-teal-300 hover:bg-teal-100/80",
  },
  project: {
    active: "border-amber-600 bg-amber-600 text-white shadow-sm",
    inactive: "border-amber-200 bg-amber-50/90 text-amber-800 hover:border-amber-300 hover:bg-amber-100/80",
  },
  "project-outside-job-scope": {
    active: "border-amber-600 bg-amber-600 text-white shadow-sm",
    inactive: "border-amber-200 bg-amber-50/90 text-amber-800 hover:border-amber-300 hover:bg-amber-100/80",
  },
  "inter-department-feedback": {
    active: "border-cyan-700 bg-cyan-700 text-white shadow-sm",
    inactive: "border-cyan-200 bg-cyan-50/90 text-cyan-800 hover:border-cyan-300 hover:bg-cyan-100/80",
  },
  rca: {
    active: "border-rose-700 bg-rose-700 text-white shadow-sm",
    inactive: "border-rose-200 bg-rose-50/90 text-rose-700 hover:border-rose-300 hover:bg-rose-100/80",
  },
};

const FALLBACK_TAG_THEMES = [
  {
    active: "border-violet-700 bg-violet-700 text-white shadow-sm",
    inactive: "border-violet-200 bg-violet-50/90 text-violet-700 hover:border-violet-300 hover:bg-violet-100/80",
  },
  {
    active: "border-sky-700 bg-sky-700 text-white shadow-sm",
    inactive: "border-sky-200 bg-sky-50/90 text-sky-700 hover:border-sky-300 hover:bg-sky-100/80",
  },
];

/** Link bar where each sub-module is its own URL (`base` = all modules, `base/<slug>` = one module). */
export function ModuleRouteNav({ base, modules, allLabel = "Semua Modul", label = "Sub-modul" }: {
  base: string; modules: readonly string[]; allLabel?: string; label?: string;
}) {
  const items = [
    { label: allLabel, to: base, slug: "all" },
    ...modules.map((module) => ({ label: module, to: `${base}/${tabSlug(module)}`, slug: tabSlug(module) })),
  ];
  return (
    <nav aria-label={label} className="mb-5 flex flex-wrap gap-2">
      {items.map((item, idx) => {
        const theme = TAG_THEME_BY_KEY[item.slug] ?? FALLBACK_TAG_THEMES[idx % FALLBACK_TAG_THEMES.length];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${
                isActive ? theme.active : theme.inactive
              }`
            }
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
