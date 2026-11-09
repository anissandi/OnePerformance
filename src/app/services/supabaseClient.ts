import { projectId as fallbackProjectId, publicAnonKey as fallbackAnonKey } from "../../../utils/supabase/info";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_PROJECT_ID =
  env.VITE_SUPABASE_PROJECT_ID?.trim() || fallbackProjectId;

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL?.trim() || `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY?.trim() || fallbackAnonKey;

export const PA_APP_API_BASE = `${SUPABASE_URL}/functions/v1/make-server-74dadec6/pa-app`;

export async function syncToSupabase(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${PA_APP_API_BASE}/sync`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Offline / pre-migration graceful fallback: state is already persisted locally
  }
}

export async function notifyLoginToSupabase(user: {
  employeeId: string;
  name: string;
  role: string;
  company: string;
}): Promise<void> {
  try {
    await fetch(`${PA_APP_API_BASE}/login`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });
  } catch {
    // Ignore network errors before backend deployment
  }
}

export async function fetchBootstrapFromSupabase(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${PA_APP_API_BASE}/bootstrap`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}
