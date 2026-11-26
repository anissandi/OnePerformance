// @refresh reset
import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  Send,
  KeyRound,
  LogIn,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  ShieldAlert,
  HelpCircle,
  Clock,
} from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSG from "@/imports/Logo_Sambu_Group_transparent.png";
import worldMap from "@/imports/image-3.png";
import {
  COMPANY_UNIT_LOCATIONS,
  SESSION_EXPIRED_NOTICE_KEY,
  evaluateAndSyncSession,
  isSameCompanyUnit,
  loadManagedUsers,
  loginWithCompanyAndEmployeeId,
  validateLoginCompanyUnit,
} from "../store/authStore";
import {
  refreshLoginCriticalStateFromBackend,
  syncToSupabase,
} from "../services/supabaseClient";
import {
  requestOtpFromBackend,
  saveUserSecurityRecordAsync,
  updateEmployeeNewPasswordAsync,
  useLoginManagement,
  validateNewPasswordPolicy,
  verifyEmployeePasswordLogin,
  type LoginMethodOption,
} from "../store/loginManagementStore";
import {
  MASTER_COMPANY_UPDATED_EVENT,
  getDefaultMasterUnitLogo,
  getMasterCompanyLocations,
  refreshMasterCompanyCatalogFromBackend,
} from "./hr/settings/masterCompanyStore";

function buildLoginLocations(): Array<{ code: string; company: string; name: string; logo: string }> {
  const list = getMasterCompanyLocations();
  return (list.length > 0 ? list : [...COMPANY_UNIT_LOCATIONS]).map((loc) => ({
    code: loc.code,
    company: loc.company,
    name: loc.fullName,
    logo: "logoCleared" in loc && Boolean((loc as { logoCleared?: boolean }).logoCleared)
      ? ""
      : ("logoUrl" in loc && typeof (loc as { logoUrl?: unknown }).logoUrl === "string" && (loc as { logoUrl?: string }).logoUrl)
      ? String((loc as { logoUrl?: string }).logoUrl)
      : getDefaultMasterUnitLogo(loc.code, loc.company),
  }));
}

const METHOD_LABELS: Record<LoginMethodOption, string> = {
  otp_telegram: "OTP Telegram",
  otp_whatsapp: "OTP WhatsApp",
  otp_email: "OTP Email",
  password: "Password",
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { getUnitLoginConfig } = useLoginManagement();
  const [step, setStep] = useState<"select-company" | "login">("select-company");
  const [locOpen, setLocOpen] = useState(false);
  const [locations, setLocations] = useState(() => buildLoginLocations());
  const [selectedLoc, setSelectedLoc] = useState(locations[0]);

  useEffect(() => {
    void refreshMasterCompanyCatalogFromBackend().then(() => {
      const next = buildLoginLocations();
      setLocations(next);
      setSelectedLoc((prev) => next.find((l) => l.company === prev?.company) ?? next[0]);
    });
    const onMasterSync = () => {
      const next = buildLoginLocations();
      setLocations(next);
      setSelectedLoc((prev) => next.find((l) => l.company === prev?.company) ?? next[0]);
    };
    window.addEventListener(MASTER_COMPANY_UPDATED_EVENT, onMasterSync);
    window.addEventListener("pa-db-hydrated", onMasterSync);
    return () => {
      window.removeEventListener(MASTER_COMPANY_UPDATED_EVENT, onMasterSync);
      window.removeEventListener("pa-db-hydrated", onMasterSync);
    };
  }, []);
  const [employeeId, setEmployeeId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);
  const [, setUsersTick] = useState(0);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  // Password login & change-default-password states
  const unitLoginCfg = getUnitLoginConfig(selectedLoc.company);
  const isPasswordMode = unitLoginCfg.enabledMethods.includes("password");
  const otpMethods = unitLoginCfg.enabledMethods.filter((m) => m !== "password") as Array<
    "otp_telegram" | "otp_whatsapp" | "otp_email"
  >;
  const [selectedOtpChannel, setSelectedOtpChannel] = useState<"otp_telegram" | "otp_whatsapp" | "otp_email">(
    otpMethods[0] ?? "otp_telegram",
  );
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangeStep, setMustChangeStep] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPasswordUpdatedModal, setShowPasswordUpdatedModal] = useState(false);
  const [forgotTooltipOpen, setForgotTooltipOpen] = useState(false);

  useEffect(() => {
    const firstOtp = unitLoginCfg.enabledMethods.find((m) => m !== "password") as
      | "otp_telegram"
      | "otp_whatsapp"
      | "otp_email"
      | undefined;
    if (firstOtp) setSelectedOtpChannel(firstOtp);
    setOtpSent(false);
    setOtpCode("");
    setPasswordInput("");
    setMustChangeStep(false);
    setError("");
  }, [selectedLoc.company, unitLoginCfg.enabledMethods.join(",")]);

  useEffect(() => {
    // Finalisasi sesi yang kadaluarsa saat diarahkan ke halaman login
    const sessionStatus = evaluateAndSyncSession(false);
    let expired = sessionStatus.expiredNow;
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === "1") {
        expired = true;
        sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
      }
    } catch {
      // ignore
    }
    if (expired) {
      setSessionExpiredNotice(true);
    }

    const onUsersRefresh = () => setUsersTick((t) => t + 1);
    void refreshLoginCriticalStateFromBackend().then(onUsersRefresh);
    window.addEventListener("pa-db-hydrated", onUsersRefresh);
    window.addEventListener("pa-auth-updated", onUsersRefresh);
    return () => {
      window.removeEventListener("pa-db-hydrated", onUsersRefresh);
      window.removeEventListener("pa-auth-updated", onUsersRefresh);
    };
  }, []);

  function resolvePostLoginDestination(defaultPortalPath: string): string {
    const from = (location.state as { from?: string } | null)?.from;
    if (
      typeof from === "string" &&
      (from === defaultPortalPath || from.startsWith(`${defaultPortalPath}/`))
    ) {
      return from;
    }
    return defaultPortalPath;
  }

  const allManaged = loadManagedUsers();
  const qLower = employeeId.trim().toLowerCase();
  const matchedEmployee =
    allManaged.find(
      (u) =>
        isSameCompanyUnit(u.company, selectedLoc.company) &&
        (u.employeeId.toLowerCase() === qLower || (u.regNo ?? "").toLowerCase() === qLower),
    ) ??
    allManaged.find(
      (u) => u.employeeId.toLowerCase() === qLower || (u.regNo ?? "").toLowerCase() === qLower,
    );

  async function handleSendOtp() {
    if (!employeeId.trim()) return;
    setError("");
    setSending(true);
    const resp = await requestOtpFromBackend({
      company: selectedLoc.company,
      employeeId: employeeId.trim(),
      channel: selectedOtpChannel,
    });
    setSending(false);
    setOtpSent(true);
    if (!otpCode) setOtpCode(resp.demoOtpCode || "123456");
    setTimeout(() => otpRef.current?.focus(), 50);
  }

  const [loggingIn, setLoggingIn] = useState(false);

  async function handleLogin() {
    if (loggingIn) return;
    if (!employeeId.trim()) {
      setError("Masukkan Employee ID terlebih dahulu.");
      return;
    }
    if (isPasswordMode && !passwordInput) {
      setError("Masukkan Password terlebih dahulu.");
      return;
    }
    if (!isPasswordMode && !otpCode.trim()) return;
    setError("");
    setLoggingIn(true);
    try {
      // Ambil data akun & keamanan password terbaru langsung dari backend (bukan cache browser),
      // sehingga login berhasil di browser / perangkat / mode incognito mana pun.
      await Promise.race([
        refreshLoginCriticalStateFromBackend(),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);

      // Validasi Company Unit terlebih dahulu (gagal walaupun Employee ID & password benar)
      const unitCheck = validateLoginCompanyUnit(selectedLoc.company, employeeId);
      if (!unitCheck.ok) {
        setError(unitCheck.error);
        return;
      }
      const targetEmpId = unitCheck.user.employeeId;

      if (isPasswordMode) {
        const pwdVerify = verifyEmployeePasswordLogin(targetEmpId, passwordInput, unitCheck.user.regNo);
        if (!pwdVerify.ok) {
          setError(pwdVerify.error);
          return;
        }
        if (pwdVerify.mustChangePassword) {
          setMustChangeStep(true);
          setNewPassword("");
          setConfirmNewPassword("");
          setError("");
          return;
        }
        void saveUserSecurityRecordAsync(pwdVerify.record);
      }

      const res = loginWithCompanyAndEmployeeId(selectedLoc.company, targetEmpId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      navigate(resolvePostLoginDestination(res.redirectPath), { replace: true });
    } finally {
      setLoggingIn(false);
    }
  }

  const [savingNewPwd, setSavingNewPwd] = useState(false);

  async function handleSaveMandatoryNewPassword() {
    if (savingNewPwd) return;
    setError("");
    const targetEmpId = matchedEmployee?.employeeId || employeeId.trim();
    const policy = validateNewPasswordPolicy(newPassword);
    if (!policy.valid) {
      setError(policy.message);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("Konfirmasi password baru tidak sama dengan password baru.");
      return;
    }
    setSavingNewPwd(true);
    try {
      const saved = await Promise.race([
        updateEmployeeNewPasswordAsync(targetEmpId, newPassword),
        new Promise<{ ok: true }>((resolve) => setTimeout(() => resolve({ ok: true }), 6000)),
      ]);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      if (matchedEmployee) {
        void syncToSupabase({ kind: "user-upsert", user: matchedEmployee });
      }
      setShowPasswordUpdatedModal(true);
    } finally {
      setSavingNewPwd(false);
    }
  }

  function handleAcknowledgePasswordUpdated() {
    setShowPasswordUpdatedModal(false);
    setMustChangeStep(false);
    setPasswordInput("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
  }

  const policyCheck = validateNewPasswordPolicy(newPassword);

  return (
    <div className="min-h-screen bg-white relative overflow-hidden flex flex-col">

      {/* ── World-map background image ───────────────────────── */}
      <img
        src={worldMap}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] object-contain opacity-60"
      />

      {/* ── Logo ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-10 pb-2">
        <ImageWithFallback
          src={logoSG}
          alt="Sambu Group"
          className="h-24 object-contain"
        />
        <p className="mt-2 text-xs sm:text-sm font-bold tracking-[0.22em] text-[#1A284F] uppercase text-center">
          ONE PERFORMANCE SYSTEM
        </p>
      </div>

      {/* ── Main Content with Professional Motion Transition ─── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-14">
        <AnimatePresence mode="wait">
          {step === "select-company" && !mustChangeStep ? (
            <motion.div
              key="select-company"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.97 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[980px] flex flex-col items-center"
            >
              <p className="text-sm font-medium text-gray-500 mb-6 text-center">
                Pilih perusahaan untuk melanjutkan
              </p>

              {sessionExpiredNotice && (
                <div className="mb-5 w-full max-w-xl rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-800 flex items-start gap-2 shadow-sm">
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Sesi login Anda telah berakhir karena tidak aktif di halaman One Performance, Silahkan login kembali.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5 w-full">
                {locations.map((loc, idx) => (
                  <motion.button
                    key={loc.code}
                    type="button"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, delay: idx * 0.035, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -4, scale: 1.015 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => {
                      setSelectedLoc(loc);
                      setLocOpen(false);
                      setError("");
                      setStep("login");
                    }}
                    className="group bg-white/75 hover:bg-white/95 backdrop-blur-md rounded-2xl border border-white/90 shadow-md hover:shadow-lg px-5 py-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer"
                  >
                    {loc.logo ? (
                      <div
                        className="w-14 h-14 mb-3 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
                        style={{ clipPath: "polygon(50% 6%, 94% 88%, 6% 88%)" }}
                      >
                        <img
                          src={loc.logo}
                          alt={loc.code}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 mb-3 rounded-2xl bg-[#1A284F]/10 border border-[#1A284F]/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                        <Building2 className="w-6 h-6 text-[#1A284F]" />
                      </div>
                    )}
                    <div className="text-xs font-bold text-[#1A284F] uppercase tracking-wide leading-snug">
                      {loc.name}
                    </div>
                    <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700/80">
                      <Building2 className="w-3 h-3" />
                      <span>{loc.code}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="login-form"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.97 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[420px] bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-white/80 px-8 py-8"
            >
              {!mustChangeStep && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200/70">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("select-company");
                      setError("");
                      setOtpSent(false);
                      setOtpCode("");
                      setPasswordInput("");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1A284F] hover:text-[#131d3b] transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Ganti Perusahaan
                  </button>
                  <div className="flex items-center gap-2">
                    {selectedLoc.logo ? (
                      <div
                        className="w-6 h-6 shrink-0"
                        style={{ clipPath: "polygon(50% 6%, 94% 88%, 6% 88%)" }}
                      >
                        <img src={selectedLoc.logo} alt={selectedLoc.code} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <Building2 className="w-4 h-4 text-[#1A284F] shrink-0" />
                    )}
                    <span className="text-xs font-bold text-[#1A284F]">{selectedLoc.code}</span>
                  </div>
                </div>
              )}

          {mustChangeStep ? (
            /* ── Halaman Wajib Ganti Password Default ke Password Baru ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                <div className="w-10 h-10 rounded-xl bg-[#1A284F] text-white flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1A284F]">Perbaharui Password Anda</h2>
                  <p className="text-xs text-gray-500">
                    {matchedEmployee?.name || employeeId} · {selectedLoc.company}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 leading-relaxed">
                Demi keamanan akun, Anda wajib mengganti password default awal ke <strong>Password Baru</strong> Anda sendiri (tanpa perlu menginput ulang password default).
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                    placeholder="Minimal 8 karakter (huruf, angka, simbol)"
                    className="w-full border border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Konfirmasi Password Baru
                </label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => { setConfirmNewPassword(e.target.value); setError(""); }}
                  placeholder="Ketik ulang password baru"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
                />
              </div>

              {/* Indikator syarat kombinasi password */}
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1 text-[11px]">
                <p className="font-semibold text-gray-700 mb-1">Syarat Kombinasi Password:</p>
                <div className={policyCheck.hasMinLength ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Minimal 8 karakter
                </div>
                <div className={policyCheck.hasLetter ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung huruf (a–z / A–Z)
                </div>
                <div className={policyCheck.hasNumber ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung angka (0–9)
                </div>
                <div className={policyCheck.hasSymbol ? "text-emerald-600 font-medium" : "text-gray-400"}>
                  ✓ Mengandung simbol (_#*/-$%@! dll)
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div
                  className="relative inline-block"
                  onMouseEnter={() => setForgotTooltipOpen(true)}
                  onMouseLeave={() => setForgotTooltipOpen(false)}
                >
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline cursor-help">
                    <HelpCircle className="w-3.5 h-3.5" />
                    Lupa Password
                  </span>
                  {forgotTooltipOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl bg-[#1A284F] text-white text-[11px] px-3 py-2 shadow-xl z-30">
                      hubungi PIC Performance Appraisal untuk reset password
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setMustChangeStep(false); setError(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Kembali ke Login
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveMandatoryNewPassword()}
                className="w-full flex items-center justify-center gap-2 bg-[#1A284F] hover:bg-[#131d3b] text-white font-semibold rounded-xl py-3 text-sm transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {savingNewPwd ? "Menyimpan..." : "Simpan Password Baru"}
              </button>
            </div>
          ) : (
            <>
          {sessionExpiredNotice && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 flex items-start gap-2">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Sesi login Anda telah berakhir karena tidak aktif di halaman One Performance, Silahkan login kembali.
              </span>
            </div>
          )}
          {/* ID Karyawan */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Employee ID
            </label>
            <input
              type="text"
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value); setError(""); }}
              disabled={otpSent}
              placeholder="Enter Employee ID"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 transition-colors disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {isPasswordMode ? (
            /* ── Mode Login dengan Password ── */
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Lock className="w-4 h-4 text-gray-500 shrink-0" />
                    Password
                  </label>
                  <div
                    className="relative inline-block"
                    onMouseEnter={() => setForgotTooltipOpen(true)}
                    onMouseLeave={() => setForgotTooltipOpen(false)}
                  >
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline cursor-help">
                      <HelpCircle className="w-3.5 h-3.5" />
                      Lupa Password
                    </span>
                    {forgotTooltipOpen && (
                      <div className="absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-[#1A284F] text-white text-[11px] px-3 py-2 shadow-xl z-30">
                        hubungi PIC Performance Appraisal untuk reset password
                      </div>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleLogin(); }}
                    placeholder="Masukkan Password Anda"
                    className="w-full border border-gray-300 rounded-xl pl-4 pr-10 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogin()}
                disabled={!employeeId.trim() || !passwordInput || loggingIn}
                className="w-full flex items-center justify-center gap-2.5 bg-[#1A284F] hover:bg-[#131d3b] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
              >
                <LogIn className="w-4 h-4" />
                {loggingIn ? "Memverifikasi..." : "Login"}
              </button>
            </>
          ) : (
            /* ── Mode Login dengan OTP (Telegram / WhatsApp / Email) ── */
            <>
              {otpMethods.length > 1 && !otpSent && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Pilih Metode Pengiriman OTP
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {otpMethods.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedOtpChannel(m)}
                        className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          selectedOtpChannel === m
                            ? "bg-[#1A284F] text-white border-[#1A284F]"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {METHOD_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* OTP Code field — revealed after sending */}
              {otpSent && (
            <div className="mb-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <KeyRound className="w-4 h-4 text-gray-500 shrink-0" />
                OTP Code ({METHOD_LABELS[selectedOtpChannel]})
              </label>
              <input
                ref={otpRef}
                type="text"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value)}
                placeholder="Enter OTP code"
                maxLength={6}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]/40 transition-colors tracking-widest font-mono"
              />
              <p className="text-xs text-gray-500 mt-1.5 whitespace-nowrap truncate">
                OTP dikirim melalui {METHOD_LABELS[selectedOtpChannel]} terdaftar
              </p>
            </div>
          )}

          {matchedEmployee && !otpSent && (
            <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-[11px] text-gray-700 space-y-0.5">
              <div className="font-semibold text-[#1A284F]">
                {matchedEmployee.name} ({matchedEmployee.regNo || matchedEmployee.employeeId})
              </div>
              <div className="text-gray-600">
                No Telegram: <span className="font-mono font-medium">{matchedEmployee.telegramNo || "—"}</span> · Corporate Email:{" "}
                <span className="font-medium">{matchedEmployee.email || "—"}</span>
              </div>
            </div>
          )}

          {/* Button — switches between Send OTP and Login */}
          {!otpSent ? (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sending || !employeeId.trim()}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1A284F] hover:bg-[#131d3b] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? "SENDING..." : `SEND ${METHOD_LABELS[selectedOtpChannel].toUpperCase()}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={!otpCode.trim() || loggingIn}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1A284F] hover:bg-[#131d3b] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Login
            </button>
          )}
            </>
          )}
          </>
          )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Popup Sukses Ganti Password Baru */}
      {showPasswordUpdatedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Password Berhasil Diperbaharui</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Selamat, password Anda sudah diperbaharui, pastikan anda selalu mengingat password Anda, jangan memberi tahu password anda ke siapapun
            </p>
            <button
              type="button"
              onClick={handleAcknowledgePasswordUpdated}
              className="w-full py-2.5 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-sm font-semibold transition-colors"
            >
              Baik, Mengerti
            </button>
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="relative z-10 text-center text-xs text-gray-400 pb-5">
        Copyright © 2026 Sambu Group
      </div>
    </div>
  );
}
