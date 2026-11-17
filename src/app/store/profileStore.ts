import { getActiveUser } from "./authStore";
import {
  loadPersistedState,
  mergeKvMapRecord,
  savePersistedState,
  uploadEvidenceFileToSupabase,
} from "../services/supabaseClient";

export const PROFILE_PHOTO_KEY = "pa_user_profile_photos_v1";
export const PROFILE_PHOTO_EVENT = "pa-profile-photo-updated";

export interface UserProfile {
  name: string;
  initials: string;
  employeeId: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  location: string;
  email: string;
  phone: string;
  joinDate: string;
  avatarUrl?: string;
}

function normPhotoKey(employeeId: string): string {
  return String(employeeId ?? "").trim().toUpperCase();
}

export function getUserProfilePhoto(employeeId?: string): string | undefined {
  const target = normPhotoKey(employeeId ?? getActiveUser().employeeId);
  if (!target) return undefined;
  const map = loadPersistedState<Record<string, string>>(PROFILE_PHOTO_KEY, {});
  if (map[target]) return map[target];
  const ci = Object.entries(map).find(([k, v]) => k.trim().toUpperCase() === target && Boolean(v));
  return ci?.[1] || undefined;
}

function resizeImageToCompactDataUrl(file: File, maxDim = 220): Promise<string> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const rawUrl = typeof reader.result === "string" ? reader.result : "";
        if (!rawUrl || typeof document === "undefined") {
          resolve(rawUrl);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(rawUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.84));
        };
        img.onerror = () => resolve(rawUrl);
        img.src = rawUrl;
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    } catch {
      resolve("");
    }
  });
}

export async function uploadAndSaveUserProfilePhoto(
  file: File,
  user?: {
    employeeId: string;
    name: string;
    company?: string;
    division?: string;
    department?: string;
    position?: string;
  },
): Promise<string> {
  const active = user ?? getActiveUser();
  const key = normPhotoKey(active.employeeId);
  let photoUrl = "";
  try {
    const up = await uploadEvidenceFileToSupabase(file, {
      employeeId: active.employeeId,
      employeeName: active.name,
      companyUnit: active.company,
      division: active.division,
      department: active.department,
      position: active.position,
      moduleType: "Profile Photo",
      period: "2026",
    });
    if (up?.url && (up.url.startsWith("https://") || up.url.startsWith("http://"))) {
      photoUrl = up.url;
    }
  } catch {
    photoUrl = "";
  }
  if (!photoUrl) {
    photoUrl = await resizeImageToCompactDataUrl(file);
  }
  if (photoUrl && key) {
    const map = { ...loadPersistedState<Record<string, string>>(PROFILE_PHOTO_KEY, {}), [key]: photoUrl };
    savePersistedState(PROFILE_PHOTO_KEY, map);
    void mergeKvMapRecord(PROFILE_PHOTO_KEY, key, photoUrl);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(PROFILE_PHOTO_EVENT));
    }
  }
  return photoUrl;
}

export function removeUserProfilePhoto(employeeId?: string): void {
  const key = normPhotoKey(employeeId ?? getActiveUser().employeeId);
  if (!key) return;
  const map = { ...loadPersistedState<Record<string, string>>(PROFILE_PHOTO_KEY, {}) };
  delete map[key];
  savePersistedState(PROFILE_PHOTO_KEY, map);
  void mergeKvMapRecord(PROFILE_PHOTO_KEY, key, "");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_PHOTO_EVENT));
  }
}

export function getDynamicUserProfile(): UserProfile {
  const u = getActiveUser();
  const initials = u.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "PA";
  return {
    name: u.name,
    initials,
    employeeId: u.employeeId,
    position: u.position,
    department: u.department,
    division: u.division,
    companyUnit: u.company,
    location: u.bagian ? `${u.division} · ${u.bagian}` : u.division || u.company,
    email: u.email,
    phone: u.telegramNo || "—",
    joinDate: u.joinDate || "—",
    avatarUrl: getUserProfilePhoto(u.employeeId),
  };
}

export const STAFF_PROFILE: UserProfile = new Proxy({} as UserProfile, {
  get(_target, prop: keyof UserProfile) {
    return getDynamicUserProfile()[prop];
  },
});

export const SUPERVISOR_PROFILE: UserProfile = new Proxy({} as UserProfile, {
  get(_target, prop: keyof UserProfile) {
    return getDynamicUserProfile()[prop];
  },
});
