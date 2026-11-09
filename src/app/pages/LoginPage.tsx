import { useState, useRef } from "react";
import { useNavigate } from "react-router";
import { Building2, ChevronDown, Send, KeyRound, LogIn } from "lucide-react";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import logoSG from "@/imports/Logo_Sambu_Group_transparent.png";
import worldMap from "@/imports/image-3.png";
import {
  COMPANY_UNIT_LOCATIONS,
  loadManagedUsers,
  loginWithCompanyAndEmployeeId,
} from "../store/authStore";

const locations = [
  ...COMPANY_UNIT_LOCATIONS.map((loc) => ({
    code: loc.code,
    company: loc.company,
    name: loc.fullName,
  })),
];

export function LoginPage() {
  const navigate = useNavigate();
  const [locOpen, setLocOpen] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(locations[0]);
  const [employeeId, setEmployeeId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);

  const unitUsers = loadManagedUsers().filter(
    (u) => u.company === selectedLoc.company && u.status === "Active",
  );

  function handleSendOtp() {
    if (!employeeId.trim()) return;
    setError("");
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setOtpSent(true);
      if (!otpCode) setOtpCode("123456");
      setTimeout(() => otpRef.current?.focus(), 50);
    }, 800);
  }

  function handleLogin() {
    if (!otpCode.trim()) return;
    setError("");
    const res = loginWithCompanyAndEmployeeId(selectedLoc.company, employeeId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    navigate(res.redirectPath);
  }

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
      <div className="relative z-10 flex justify-center pt-10 pb-2">
        <ImageWithFallback
          src={logoSG}
          alt="Sambu Group"
          className="h-24 object-contain"
        />
      </div>

      {/* ── Login card ───────────────────────────────────────── */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[420px] bg-white/75 backdrop-blur-md rounded-2xl shadow-xl border border-white/80 px-8 py-9">

          {/* Lokasi Usaha */}
          <div className="mb-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Building2 className="w-4 h-4 text-gray-500" />
              Company Unit
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setLocOpen(o => !o)}
                className="w-full flex items-center justify-between border border-gray-300 rounded-xl px-4 py-2.5 bg-white text-left hover:border-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-800">{selectedLoc.code}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{selectedLoc.name}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${locOpen ? "rotate-180" : ""}`} />
              </button>
              {locOpen && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {locations.map(loc => (
                    <button
                      key={loc.code}
                      type="button"
                      onClick={() => { setSelectedLoc(loc); setLocOpen(false); setError(""); }}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedLoc.code === loc.code ? "bg-[#1A284F]/5 border-l-2 border-[#1A284F]" : ""}`}
                    >
                      <div className="text-sm font-semibold text-gray-800">{loc.code}</div>
                      <div className="text-xs text-gray-500">{loc.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

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
            {unitUsers.length > 0 && !otpSent && (
              <div className="mt-2">
                <select
                  value={unitUsers.some((u) => u.employeeId === employeeId) ? employeeId : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      setEmployeeId(e.target.value);
                      setError("");
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 bg-gray-50/80 focus:outline-none focus:border-[#1A284F]/40"
                >
                  <option value="">— Pilih Akun {selectedLoc.company} (User Management) —</option>
                  {unitUsers.map((u) => (
                    <option key={u.employeeId} value={u.employeeId}>
                      {u.employeeId} · {u.name} ({u.role} — {u.position})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* OTP Code field — revealed after sending */}
          <div
            className={`overflow-hidden transition-all duration-300 ${otpSent ? "max-h-24 mb-6 opacity-100" : "max-h-0 mb-0 opacity-0"}`}
          >
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <KeyRound className="w-4 h-4 text-gray-500" />
              OTP Code
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
            {otpSent && (
              <p className="text-xs text-gray-400 mt-1.5">
                OTP code has been sent to your Telegram / Email.
              </p>
            )}
          </div>

          {/* Button — switches between Send OTP and Login */}
          {!otpSent ? (
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sending || !employeeId.trim()}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1A284F] hover:bg-[#131d3b] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? "SENDING..." : "SEND OTP TELEGRAM / EMAIL"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              disabled={!otpCode.trim()}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1A284F] hover:bg-[#131d3b] disabled:opacity-50 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Login
            </button>
          )}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div className="relative z-10 text-center text-xs text-gray-400 pb-5">
        Copyright © 2026 Sambu Group
      </div>
    </div>
  );
}
