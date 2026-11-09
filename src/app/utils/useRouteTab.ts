import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

/** URL-safe slug for a tab/sub-module label, e.g. "Project Outside Job Scope" -> "project-outside-job-scope". */
export function tabSlug(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Keeps a page's active sub-module in the last URL segment (`/:tab`), so every
 * sub-module has its own address. The page's base route must also be registered
 * as `base/:tab` in routes.tsx. Unknown slugs fall back to `fallback`.
 */
export function useRouteTab<T extends string>(
  values: readonly T[],
  fallback: T,
  options: { param?: string; base?: string } = {},
): [T, (value: T) => void] {
  const param = options.param ?? "tab";
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const slug = params[param];
  const active = useMemo(() => values.find((value) => tabSlug(value) === slug) ?? fallback, [values, slug, fallback]);
  const base = options.base ?? routeBase(location.pathname, slug);
  const setActive = useCallback((value: T) => {
    navigate(`${base}/${tabSlug(value)}${location.search}`);
  }, [base, location.search, navigate]);
  return [active, setActive];
}

/** Pathname without the trailing `/:slug` segment (or the pathname itself when no slug). */
export function routeBase(pathname: string, slug?: string) {
  return slug !== undefined && pathname.endsWith(`/${slug}`)
    ? pathname.slice(0, -(slug.length + 1))
    : pathname.replace(/\/+$/, "");
}
