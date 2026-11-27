import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, BellRing, CheckSquare, Sparkles, Users } from "lucide-react";
import { AUTH_SESSION_KEY, peekSessionValidity, useAuthStore, type AuthSessionState } from "../store/authStore";
import { safeGetLocalRaw } from "../services/supabaseClient";
import { countUniqueSubordinatesWithOutstandingApproval } from "../store/approverReminderStore";

function readCurrentLoginTimestamp(): number {
  try {
    const raw = safeGetLocalRaw(AUTH_SESSION_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as AuthSessionState;
    return typeof parsed?.loginAt === "number" ? parsed.loginAt : 0;
  } catch {
    return 0;
  }
}

function buildAckStorageKey(employeeId: string, loginAt: number): string {
  return `pa_approver_login_rem_ack_v1_${employeeId.trim().toUpperCase()}_${loginAt}`;
}

function isAlreadyAcknowledgedForLogin(employeeId: string, loginAt: number): boolean {
  if (!employeeId || !loginAt) return false;
  const key = buildAckStorageKey(employeeId, loginAt);
  try {
    if (sessionStorage.getItem(key) === "1") return true;
    if (localStorage.getItem(key) === "1") return true;
  } catch {
    // ignore storage errors
  }
  return false;
}

function markAcknowledgedForLogin(employeeId: string, loginAt: number): void {
  if (!employeeId || !loginAt) return;
  const key = buildAckStorageKey(employeeId, loginAt);
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

export function ApproverLoginReminderModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeUser, allUsers, portalPath } = useAuthStore();
  const [tick, setTick] = useState(0);
  const [dismissedSessionKey, setDismissedSessionKey] = useState<string>("");

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("pa-db-hydrated", refresh);
    window.addEventListener("appraisal-updated", refresh);
    window.addEventListener("pa-auth-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pa-db-hydrated", refresh);
      window.removeEventListener("appraisal-updated", refresh);
      window.removeEventListener("pa-auth-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const sessionSnap = peekSessionValidity();
  const loginAt = readCurrentLoginTimestamp();
  const currentSessionKey = `${activeUser.employeeId.trim().toUpperCase()}_${loginAt}`;

  const { uniqueEmployeeCount, tasks } = useMemo(() => {
    void tick;
    if (!sessionSnap.valid || !activeUser.employeeId) {
      return { uniqueEmployeeCount: 0, tasks: [] };
    }
    return countUniqueSubordinatesWithOutstandingApproval(activeUser, allUsers);
  }, [activeUser, allUsers, sessionSnap.valid, tick]);

  const targetApprovalDashboardPath = useMemo(() => {
    const firstSeg = location.pathname.split("/").filter(Boolean)[0];
    const base =
      firstSeg === "hr" || firstSeg === "bod" || firstSeg === "supervisor" || firstSeg === "employee"
        ? `/${firstSeg}`
        : portalPath || "/supervisor";
    return `${base}/dashboard/approval`;
  }, [location.pathname, portalPath]);

  const alreadyAcked =
    dismissedSessionKey === currentSessionKey ||
    isAlreadyAcknowledgedForLogin(activeUser.employeeId, loginAt);

  const shouldShow =
    sessionSnap.valid &&
    Boolean(activeUser.employeeId) &&
    loginAt > 0 &&
    uniqueEmployeeCount > 0 &&
    !alreadyAcked;

  const handleNavigateToApprovalDashboard = () => {
    markAcknowledgedForLogin(activeUser.employeeId, loginAt);
    setDismissedSessionKey(currentSessionKey);
    navigate(targetApprovalDashboardPath);
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key={currentSessionKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0F172A]/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approver-reminder-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-amber-200/80 bg-white shadow-2xl"
          >
            {/* Ambient decorative gradients */}
            <div className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-gradient-to-br from-amber-300/35 via-orange-300/20 to-transparent blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-gradient-to-tr from-blue-400/25 via-indigo-300/15 to-transparent blur-2xl" />

            {/* Top accent bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-[#1A284F]" />

            <div className="relative px-7 pt-7 pb-6 flex flex-col gap-5">
              {/* Header with animated colorful reminder icon (NO close button) */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <motion.div
                    animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.18, 0.45] }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-2xl bg-amber-400"
                  />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg shadow-amber-500/30">
                    <motion.div
                      animate={{ rotate: [0, -10, 10, -6, 6, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                    >
                      <BellRing className="h-7 w-7 text-white" />
                    </motion.div>
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#1A284F] px-1.5 text-[11px] font-extrabold text-amber-300 ring-2 ring-white shadow-sm">
                    {uniqueEmployeeCount}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>Pengingat Persetujuan Tim</span>
                  </div>
                  <h3 id="approver-reminder-title" className="text-lg font-extrabold text-[#1A284F] leading-snug">
                    Notifikasi Pengingat
                  </h3>
                </div>
              </div>

              {/* Message card */}
              <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 via-white to-amber-50/40 p-4 shadow-2xs space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Ada{" "}
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 font-extrabold text-amber-900 border border-amber-300/80">
                    <Users className="h-3.5 w-3.5 text-amber-700" />
                    {uniqueEmployeeCount}
                  </span>{" "}
                  karyawan dari tim Anda yang mengirimkan permintaan persetujuan/penilaian, untuk menindaklanjuti silahkan klik tombol navigasi di bawah ini.
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                    <CheckSquare className="h-3 w-3 text-indigo-600" />
                    {tasks.length} Task Menunggu Tindak Lanjut
                  </span>
                </div>
              </div>

              {/* Single mandatory navigation button (no Close button) */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={handleNavigateToApprovalDashboard}
                className="group w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#1A284F] via-[#22366B] to-[#1D4ED8] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#1A284F]/25 hover:brightness-110 transition-all cursor-pointer"
              >
                <CheckSquare className="h-4 w-4 text-amber-300 shrink-0" />
                <span>Buka Dashboard Approval</span>
                <ArrowRight className="h-4 w-4 text-white/90 transition-transform duration-200 group-hover:translate-x-1 shrink-0" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
