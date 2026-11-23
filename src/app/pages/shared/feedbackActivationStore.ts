import {
  refreshKvKeysFromBackend,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  SUPABASE_ANON_KEY,
  SUPABASE_REST_BASE,
} from "../../services/supabaseClient";

export interface FeedbackActivation {
  active: boolean;
  startDate: string;
  endDate: string;
}
const KEY = "feedback_activation_v1";
export const FEEDBACK_ACTIVATION_EVENT = "feedback-activation-changed";

export function loadFeedbackActivation(year: string): FeedbackActivation | null {
  try {
    const raw = safeGetLocalRaw(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, FeedbackActivation> | null;
      const byYear = parsed?.[year];
      if (byYear && typeof byYear === "object") {
        return {
          active: Boolean(byYear.active),
          startDate: String(byYear.startDate ?? ""),
          endDate: String(byYear.endDate ?? ""),
        };
      }
    }
  } catch {
    // ignore and check module activation store fallback below
  }
  try {
    const modRaw = safeGetLocalRaw(`pa_module_activation_${year}`);
    if (modRaw) {
      const modMap = JSON.parse(modRaw) as Record<string, Partial<FeedbackActivation>> | null;
      const idf = modMap?.["inter-department-feedback"];
      if (idf && typeof idf === "object" && (idf.startDate || idf.endDate || typeof idf.active === "boolean")) {
        return {
          active: Boolean(idf.active),
          startDate: String(idf.startDate ?? ""),
          endDate: String(idf.endDate ?? ""),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function refreshFeedbackActivationFromBackend(year = "2026"): Promise<FeedbackActivation | null> {
  try {
    await refreshKvKeysFromBackend([KEY, `pa_module_activation_${year}`]);
    let current = loadFeedbackActivation(year);
    if (!current) {
      const res = await fetch(
        `${SUPABASE_REST_BASE}/pa_module_windows?select=*&module_id=eq.inter-department-feedback&period=eq.${encodeURIComponent(year)}&limit=1`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        const r = rows?.[0];
        if (r) {
          const fromDb: FeedbackActivation = {
            active: Boolean(r.active),
            startDate: String(r.start_date ?? ""),
            endDate: String(r.end_date ?? ""),
          };
          let existing: Record<string, FeedbackActivation> = {};
          try {
            existing = JSON.parse(safeGetLocalRaw(KEY) ?? "{}") ?? {};
          } catch {
            existing = {};
          }
          safeSetLocalJson(KEY, { ...existing, [year]: fromDb });
          current = fromDb;
        }
      }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(FEEDBACK_ACTIVATION_EVENT));
    }
    return current;
  } catch {
    return loadFeedbackActivation(year);
  }
}

export function saveFeedbackActivation(year: string, value: FeedbackActivation) {
  let records: Record<string, FeedbackActivation> = {};
  try { records = JSON.parse(safeGetLocalRaw(KEY) ?? "{}") ?? {}; } catch {}
  savePersistedState(KEY, { ...records, [year]: value }, {
    kind: "module-window",
    window: {
      unitId: "ALL",
      moduleId: "inter-department-feedback",
      period: year,
      active: value.active,
      startDate: value.startDate,
      endDate: value.endDate,
    },
  });
  window.dispatchEvent(new Event(FEEDBACK_ACTIVATION_EVENT));
}
export function feedbackActivationError(value: FeedbackActivation | null) {
  if (!value?.active) return "";
  if (!value.startDate || !value.endDate) return "Lengkapi Mulai Nominasi & Feedback serta Akhir Summary & Approval.";
  if (value.startDate > value.endDate) return "Akhir Summary & Approval harus pada atau setelah Mulai Nominasi & Feedback.";
  return "";
}
export function feedbackWindow(value: FeedbackActivation | null, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const valid = !!value?.active && !feedbackActivationError(value);
  const open = valid && today >= value!.startDate && today <= value!.endDate;
  return {
    receiving: open,
    approval: open,
  };
}
