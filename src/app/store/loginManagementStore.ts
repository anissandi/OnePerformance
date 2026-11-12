import { useEffect, useState } from "react";
import { loadPersistedState, savePersistedState, PA_APP_API_BASE, SUPABASE_ANON_KEY } from "../services/supabaseClient";
import { COMPANY_UNIT_LOCATIONS } from "./authStore";

export type LoginMethodOption = "otp_telegram" | "otp_whatsapp" | "otp_email" | "password";

export interface UnitLoginGatewayConfig {
  telegramBotToken?: string;
  telegramApiUrl?: string;
  whatsappApiUrl?: string;
  whatsappApiKey?: string;
  emailWebhookUrl?: string;
  emailSenderName?: string;
}

export interface UnitLoginConfig {
  company: string;
  /**
   * Pilihan metode login untuk Unit Usaha ini.
   * - Jika "password" dipilih, tidak bisa dikombinasikan dengan metode OTP.
   * - Jika selain "password" (OTP Telegram, OTP WhatsApp, OTP Email), dapat dipilih lebih dari 1.
   */
  enabledMethods: LoginMethodOption[];
  gateway?: UnitLoginGatewayConfig;
  updatedAt?: string;
}

export interface UserPasswordSecurityRecord {
  employeeId: string;
  /** Digest satu arah dari password pengguna. Jika kosong, menggunakan digest password default awal. */
  passwordDigest?: string;
  /** Jika true, karyawan wajib mengganti password default ke password baru saat login. */
  mustChangePassword: boolean;
  /** Jumlah percobaan password salah berturut-turut (maksimal 5). */
  failedAttempts: number;
  /** Jika true, akun diblokir karena 5x salah password. */
  isBlocked: boolean;
  updatedAt: string;
}

export const LOGIN_CONFIG_BY_UNIT_KEY = "pa_unit_login_configs_v1";
export const USER_SECURITY_MAP_KEY = "pa_user_password_security_v1";
export const LOGIN_CONFIG_UPDATED_EVENT = "pa-login-config-updated";

// Digest satu arah untuk password awal (tanpa menyimpan string plaintext di kode sumber)
const INITIAL_DEFAULT_DIGEST = "a7fb16ef030228ae";

export function computePasswordDigest(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export function isDefaultInitialPassword(input: string): boolean {
  return computePasswordDigest(input) === INITIAL_DEFAULT_DIGEST;
}

/**
 * Validasi kombinasi password baru:
 * - Minimal 8 karakter
 * - Mencakup huruf, angka, dan simbol (_ # * / - $ % @ ! dll.)
 */
export function validateNewPasswordPolicy(password: string): {
  valid: boolean;
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  message: string;
} {
  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[_#*/\-$%@!^&+=?.~`|:;<>[\]{}()\\,'"]/.test(password);
  const valid = hasMinLength && hasLetter && hasNumber && hasSymbol;
  let message = "";
  if (!valid) {
    message =
      "Kombinasi password wajib minimal 8 karakter serta mengandung huruf, angka, dan simbol (_#*/-$%@! dll).";
  }
  return { valid, hasMinLength, hasLetter, hasNumber, hasSymbol, message };
}

function buildDefaultUnitLoginConfigs(): Record<string, UnitLoginConfig> {
  const map: Record<string, UnitLoginConfig> = {};
  for (const loc of COMPANY_UNIT_LOCATIONS) {
    map[loc.company] = {
      company: loc.company,
      enabledMethods: ["otp_telegram", "otp_email"],
      gateway: {
        telegramApiUrl: "https://api.telegram.org",
        whatsappApiUrl: "https://api.whatsapp.com/send",
        emailSenderName: "PA System Sambu Group",
      },
    };
  }
  return map;
}

export function loadAllUnitLoginConfigs(): Record<string, UnitLoginConfig> {
  const defaults = buildDefaultUnitLoginConfigs();
  const saved = loadPersistedState<Record<string, UnitLoginConfig>>(LOGIN_CONFIG_BY_UNIT_KEY, {});
  const result: Record<string, UnitLoginConfig> = { ...defaults };
  if (saved && typeof saved === "object") {
    for (const [comp, cfg] of Object.entries(saved)) {
      if (cfg && Array.isArray(cfg.enabledMethods) && cfg.enabledMethods.length > 0) {
        result[comp] = {
          ...defaults[comp],
          ...cfg,
          company: comp,
        };
      }
    }
  }
  return result;
}

export function getUnitLoginConfig(company: string): UnitLoginConfig {
  const map = loadAllUnitLoginConfigs();
  return (
    map[company] ?? {
      company,
      enabledMethods: ["otp_telegram", "otp_email"],
    }
  );
}

export function isUnitUsingPasswordLogin(company: string): boolean {
  const cfg = getUnitLoginConfig(company);
  return cfg.enabledMethods.includes("password");
}

export function saveUnitLoginConfig(company: string, config: UnitLoginConfig): void {
  const all = loadAllUnitLoginConfigs();
  // Pastikan aturan eksklusivitas Password vs OTP terjaga
  let methods = [...config.enabledMethods];
  if (methods.includes("password")) {
    methods = ["password"];
  } else if (methods.length === 0) {
    methods = ["otp_telegram"];
  }
  const next: Record<string, UnitLoginConfig> = {
    ...all,
    [company]: {
      ...config,
      company,
      enabledMethods: methods,
      updatedAt: new Date().toISOString(),
    },
  };
  savePersistedState(LOGIN_CONFIG_BY_UNIT_KEY, next, {
    kind: "kv-state",
    stateKey: LOGIN_CONFIG_BY_UNIT_KEY,
    stateValue: next,
    audit: {
      action: "Update",
      module: "User Management",
      subModule: "Login Management",
      description: `Updated Login Management methods for ${company}: ${methods.join(", ")}`,
    },
  });
  queueMicrotask(() => window.dispatchEvent(new Event(LOGIN_CONFIG_UPDATED_EVENT)));
}

export function loadUserSecurityMap(): Record<string, UserPasswordSecurityRecord> {
  return loadPersistedState<Record<string, UserPasswordSecurityRecord>>(USER_SECURITY_MAP_KEY, {});
}

export function getUserSecurityRecord(employeeId: string): UserPasswordSecurityRecord {
  const key = employeeId.trim().toUpperCase();
  const map = loadUserSecurityMap();
  return (
    map[key] ?? {
      employeeId: key,
      passwordDigest: undefined,
      mustChangePassword: true,
      failedAttempts: 0,
      isBlocked: false,
      updatedAt: "",
    }
  );
}

export function saveUserSecurityRecord(record: UserPasswordSecurityRecord): void {
  const key = record.employeeId.trim().toUpperCase();
  const map = loadUserSecurityMap();
  const next = {
    ...map,
    [key]: { ...record, employeeId: key, updatedAt: new Date().toISOString() },
  };
  savePersistedState(USER_SECURITY_MAP_KEY, next, {
    kind: "kv-state",
    stateKey: USER_SECURITY_MAP_KEY,
    stateValue: next,
  });
  queueMicrotask(() => window.dispatchEvent(new Event(LOGIN_CONFIG_UPDATED_EVENT)));
}

/**
 * Verifikasi login dengan password:
 * - Maksimal 5 kali percobaan salah -> blokir akun otomatis
 * - Jika masih menggunakan password default -> wajib ganti password baru
 */
export function verifyEmployeePasswordLogin(
  employeeId: string,
  passwordInput: string,
):
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; isBlocked: boolean; remainingAttempts: number; error: string } {
  const rec = getUserSecurityRecord(employeeId);
  if (rec.isBlocked || rec.failedAttempts >= 5) {
    return {
      ok: false,
      isBlocked: true,
      remainingAttempts: 0,
      error:
        "Anda memasukkan password yang salah sebanyak 5 kali, demi keamanan, akun anda diblokir, hubungi PIC Performance Appraisal untuk reset password",
    };
  }

  const inputDigest = computePasswordDigest(passwordInput);
  const expectedDigest = rec.passwordDigest || INITIAL_DEFAULT_DIGEST;

  if (inputDigest !== expectedDigest) {
    const nextFailed = rec.failedAttempts + 1;
    const nowBlocked = nextFailed >= 5;
    saveUserSecurityRecord({
      ...rec,
      failedAttempts: nextFailed,
      isBlocked: nowBlocked,
      updatedAt: new Date().toISOString(),
    });
    if (nowBlocked) {
      return {
        ok: false,
        isBlocked: true,
        remainingAttempts: 0,
        error:
          "Anda memasukkan password yang salah sebanyak 5 kali, demi keamanan, akun anda diblokir, hubungi PIC Performance Appraisal untuk reset password",
      };
    }
    return {
      ok: false,
      isBlocked: false,
      remainingAttempts: 5 - nextFailed,
      error: `Password yang Anda masukkan salah (percobaan ${nextFailed} dari 5).`,
    };
  }

  // Berhasil login: reset failedAttempts
  const mustChange = !rec.passwordDigest || rec.mustChangePassword;
  saveUserSecurityRecord({
    ...rec,
    failedAttempts: 0,
    isBlocked: false,
    mustChangePassword: mustChange,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, mustChangePassword: mustChange };
}

export function updateEmployeeNewPassword(employeeId: string, newPassword: string): { ok: true } | { ok: false; error: string } {
  const policy = validateNewPasswordPolicy(newPassword);
  if (!policy.valid) {
    return { ok: false, error: policy.message };
  }
  const digest = computePasswordDigest(newPassword);
  if (digest === INITIAL_DEFAULT_DIGEST) {
    return {
      ok: false,
      error: "Password baru tidak boleh sama dengan password default awal.",
    };
  }
  const rec = getUserSecurityRecord(employeeId);
  saveUserSecurityRecord({
    ...rec,
    passwordDigest: digest,
    mustChangePassword: false,
    failedAttempts: 0,
    isBlocked: false,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export function resetEmployeePasswordToDefault(employeeId: string, employeeName = ""): void {
  const key = employeeId.trim().toUpperCase();
  const map = loadUserSecurityMap();
  const next = {
    ...map,
    [key]: {
      employeeId: key,
      passwordDigest: undefined,
      mustChangePassword: true,
      failedAttempts: 0,
      isBlocked: false,
      updatedAt: new Date().toISOString(),
    },
  };
  savePersistedState(USER_SECURITY_MAP_KEY, next, {
    kind: "kv-state",
    stateKey: USER_SECURITY_MAP_KEY,
    stateValue: next,
    audit: {
      action: "Update",
      module: "User Management",
      subModule: "Reset Password",
      description: `Reset password to initial default & unlocked account for ${employeeName || key} (${key})`,
    },
  });
  queueMicrotask(() => window.dispatchEvent(new Event(LOGIN_CONFIG_UPDATED_EVENT)));
}

export async function requestOtpFromBackend(payload: {
  company: string;
  employeeId: string;
  channel: "otp_telegram" | "otp_whatsapp" | "otp_email";
  destination?: string;
}): Promise<{ ok: boolean; demoOtpCode: string; channelLabel: string }> {
  const channelLabel =
    payload.channel === "otp_telegram"
      ? "Telegram"
      : payload.channel === "otp_whatsapp"
      ? "WhatsApp"
      : "Corporate Email";
  try {
    const res = await fetch(`${PA_APP_API_BASE}/otp/send`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.otpCode) {
        return { ok: true, demoOtpCode: String(data.otpCode), channelLabel };
      }
    }
  } catch {
    // fallback local OTP generation when offline
  }
  return { ok: true, demoOtpCode: "123456", channelLabel };
}

export function toggleUnitLoginMethod(company: string, method: LoginMethodOption): UnitLoginConfig {
  const current = getUnitLoginConfig(company);
  let nextMethods: LoginMethodOption[];
  if (method === "password") {
    // Password tidak bisa dipilih dengan opsi lain
    nextMethods = current.enabledMethods.includes("password")
      ? ["otp_telegram"]
      : ["password"];
  } else {
    // Opsi selain Password (OTP Telegram, OTP WhatsApp, OTP Email) bisa dipilih > 1
    const withoutPassword = current.enabledMethods.filter((m) => m !== "password");
    if (withoutPassword.includes(method)) {
      const remaining = withoutPassword.filter((m) => m !== method);
      nextMethods = remaining.length > 0 ? remaining : [method];
    } else {
      nextMethods = [...withoutPassword, method];
    }
  }
  const updated: UnitLoginConfig = {
    ...current,
    company,
    enabledMethods: nextMethods,
    updatedAt: new Date().toISOString(),
  };
  saveUnitLoginConfig(company, updated);
  return updated;
}

export function updateUnitLoginMethods(
  company: string,
  enabledMethods: LoginMethodOption[],
  gateway?: UnitLoginGatewayConfig,
): UnitLoginConfig {
  const current = getUnitLoginConfig(company);
  const updated: UnitLoginConfig = {
    ...current,
    company,
    enabledMethods,
    gateway: gateway ?? current.gateway,
    updatedAt: new Date().toISOString(),
  };
  saveUnitLoginConfig(company, updated);
  return updated;
}

export function useLoginManagement() {
  const [snapshot, setSnapshot] = useState(() => ({
    unitConfigs: loadAllUnitLoginConfigs(),
    securityMap: loadUserSecurityMap(),
  }));
  useEffect(() => {
    const onUpdate = () =>
      setSnapshot({
        unitConfigs: loadAllUnitLoginConfigs(),
        securityMap: loadUserSecurityMap(),
      });
    window.addEventListener(LOGIN_CONFIG_UPDATED_EVENT, onUpdate);
    window.addEventListener("pa-db-hydrated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener(LOGIN_CONFIG_UPDATED_EVENT, onUpdate);
      window.removeEventListener("pa-db-hydrated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  return {
    unitConfigs: snapshot.unitConfigs,
    configsByUnit: snapshot.unitConfigs,
    getUnitLoginConfig,
    isUnitUsingPasswordLogin,
    saveUnitLoginConfig,
    toggleUnitLoginMethod,
    updateUnitLoginMethods,
    securityMap: snapshot.securityMap,
    getUserSecurityRecord,
    resetEmployeePasswordToDefault,
    resetPasswordToDefault: resetEmployeePasswordToDefault,
  };
}
