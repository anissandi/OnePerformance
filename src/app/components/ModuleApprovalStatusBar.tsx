import React, { useEffect, useState } from "react";
import {
  findHrIcfValidatorUser,
  findHrUnitCheckerUserForCompany,
  getActiveUser,
  loadManagedUsers,
  shouldBypassCheckerForSubmission,
  type ManagedUser,
} from "../store/authStore";
import {
  loadWorkflowRecords,
  normalizeEmployeeId,
} from "../pages/shared/appraisalWorkflowStore";
import { normalizeDateDDMMYYYY } from "../utils/dateFormat";

export type StatusBarModule =
  | "KPI"
  | "SMART Goals"
  | "Appraisal Form"
  | "Managerial Skill"
  | "Project"
  | "RCA"
  | "Inter-Department Feedback";

interface ModuleApprovalStatusBarProps {
  module: StatusBarModule;
  phase: "setting" | "measurement";
  submittedOverride?: boolean;
  submittedDateOverride?: string;
}

function resolveUserByRef(allUsers: ManagedUser[], refValue?: string): ManagedUser | undefined {
  const ref = (refValue ?? "").trim().toLowerCase();
  if (!ref) return undefined;
  const refNum = ref.replace(/^(?:emp-?|e)0*/i, "");
  return allUsers.find(
    (u) =>
      (u.regNo ?? "").trim().toLowerCase() === ref ||
      u.employeeId.trim().toLowerCase() === ref ||
      u.name.trim().toLowerCase() === ref ||
      Boolean(refNum && u.employeeId.trim().toLowerCase().replace(/^(?:emp-?|e)0*/i, "") === refNum),
  );
}

export function ModuleApprovalStatusBar({
  module,
  phase,
  submittedOverride,
  submittedDateOverride,
}: ModuleApprovalStatusBarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onSync = () => setTick((t) => t + 1);
    window.addEventListener("pa-auth-updated", onSync);
    window.addEventListener("appraisal-updated", onSync);
    window.addEventListener("pa-db-hydrated", onSync);
    window.addEventListener("feedback-updated", onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener("pa-auth-updated", onSync);
      window.removeEventListener("appraisal-updated", onSync);
      window.removeEventListener("pa-db-hydrated", onSync);
      window.removeEventListener("feedback-updated", onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const activeUser = getActiveUser();
  const allUsers = loadManagedUsers();
  const normId = normalizeEmployeeId(activeUser.employeeId);
  const wfRec = loadWorkflowRecords().find(
    (r) =>
      r.year === "2026" &&
      r.module === module &&
      r.phase === phase &&
      (r.employeeId === normId || r.employeeId.toLowerCase() === activeUser.employeeId.toLowerCase()),
  );

  const isFourStep = module === "KPI" || module === "SMART Goals" || module === "RCA";
  const bypassCheck = isFourStep && shouldBypassCheckerForSubmission(activeUser.employeeId);

  const chkDec = wfRec?.decisions.checker;
  const a1Dec = wfRec?.decisions.approver1;
  const a2Dec = wfRec?.decisions.approver2;
  const valDec = wfRec?.decisions.validator;

  const isRev = Boolean(
    chkDec?.status === "Revision" ||
      a1Dec?.status === "Revision" ||
      a2Dec?.status === "Revision" ||
      valDec?.status === "Revision",
  );

  const isA1Done = Boolean(
    a1Dec &&
      (a1Dec.status === "Approved" ||
        a1Dec.status.startsWith("Assessed") ||
        a1Dec.status === "Validated"),
  );
  const isA2Done = Boolean(
    a2Dec &&
      (a2Dec.status === "Approved" ||
        a2Dec.status.startsWith("Assessed") ||
        a2Dec.status === "Validated" ||
        a2Dec.status === "Closed"),
  );
  const isValDone = isFourStep
    ? Boolean(valDec?.status === "Validated" || a2Dec?.status === "Validated")
    : isA2Done;
  const isChkDone = isFourStep
    ? Boolean(
        bypassCheck ||
          isA1Done ||
          isA2Done ||
          isValDone ||
          (chkDec && chkDec.status !== "Revision"),
      )
    : true;

  const isSubmitted = Boolean((wfRec || submittedOverride) && !isRev);
  const isFullApproved = isFourStep ? isValDone : isA2Done;

  const ap1User = resolveUserByRef(allUsers, activeUser.regNoAp1);
  const ap2User = resolveUserByRef(allUsers, activeUser.regNoAp2);
  const hrUnitUser = findHrUnitCheckerUserForCompany(activeUser.company, activeUser.employeeId, allUsers);
  const hrIcfUser = findHrIcfValidatorUser(allUsers);

  const resolveCheckerDisplayName = () => {
    if (chkDec?.status === "Bypassed") {
      return hrUnitUser?.name || `HR Unit (${activeUser.company})`;
    }
    if (chkDec?.approverName) {
      const decUser = resolveUserByRef(allUsers, chkDec.approverName);
      if (
        decUser &&
        decUser.role === "HR Unit" &&
        decUser.company.trim().toLowerCase() === activeUser.company.trim().toLowerCase()
      ) {
        return decUser.name;
      }
      if (!hrUnitUser) return chkDec.approverName;
    }
    return hrUnitUser?.name || `HR Unit (${activeUser.company})`;
  };

  const resolveValidatorDisplayName = () => {
    if (valDec?.approverName) {
      const decUser = resolveUserByRef(allUsers, valDec.approverName);
      if (decUser && decUser.role === "HR ICF") {
        return decUser.name;
      }
      if (!hrIcfUser) return valDec.approverName;
    }
    return hrIcfUser?.name || "HR ICF";
  };

  const subDate = normalizeDateDDMMYYYY(wfRec?.submittedDate || submittedDateOverride);
  const isProjectTwoStep = module === "Project";

  const steps = isFourStep
    ? [
        {
          title: "1. Submitted",
          actor: activeUser.name || "—",
          badge: isSubmitted || isRev ? "Submitted" : "Unsubmitted",
          date: isSubmitted || isRev ? subDate : "—",
          stepDone: isSubmitted,
          stepRevision: false,
        },
        {
          title: "2. HR Unit Check",
          actor: resolveCheckerDisplayName(),
          badge:
            chkDec?.status === "Revision"
              ? "Revision"
              : isChkDone
              ? chkDec?.status === "Bypassed"
                ? "Bypassed"
                : "Checked"
              : isSubmitted
              ? "Pending"
              : "Waiting",
          date: isChkDone ? normalizeDateDDMMYYYY(chkDec?.date || subDate) : "—",
          stepDone: isChkDone,
          stepRevision: chkDec?.status === "Revision",
        },
        {
          title: "3. Approver 1",
          actor: a1Dec?.approverName || ap1User?.name || activeUser.regNoAp1 || "Approver 1",
          badge:
            a1Dec?.status === "Revision"
              ? "Revision"
              : isA1Done
              ? "Approved"
              : isChkDone && isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA1Done ? normalizeDateDDMMYYYY(a1Dec?.date) : "—",
          stepDone: isA1Done,
          stepRevision: a1Dec?.status === "Revision",
        },
        {
          title: "4. Approver 2",
          actor: a2Dec?.approverName || ap2User?.name || activeUser.regNoAp2 || "Approver 2",
          badge:
            a2Dec?.status === "Revision"
              ? "Revision"
              : isA2Done
              ? "Approved"
              : isA1Done && isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA2Done ? normalizeDateDDMMYYYY(a2Dec?.date) : "—",
          stepDone: isA2Done,
          stepRevision: a2Dec?.status === "Revision",
        },
        {
          title: "5. HR ICF Validate",
          actor: resolveValidatorDisplayName(),
          badge:
            valDec?.status === "Revision"
              ? "Revision"
              : isValDone
              ? "Validated"
              : isA2Done && isSubmitted
              ? "Pending"
              : "Waiting",
          date: isValDone ? normalizeDateDDMMYYYY(valDec?.date || a2Dec?.date) : "—",
          stepDone: isValDone,
          stepRevision: valDec?.status === "Revision",
        },
      ]
    : isProjectTwoStep
    ? [
        {
          title: "1. Approver 1",
          actor: a1Dec?.approverName || ap1User?.name || activeUser.regNoAp1 || "Approver 1",
          badge:
            a1Dec?.status === "Revision"
              ? "Revision"
              : isA1Done
              ? "Approved"
              : isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA1Done ? normalizeDateDDMMYYYY(a1Dec?.date) : "—",
          stepDone: isA1Done,
          stepRevision: a1Dec?.status === "Revision",
        },
        {
          title: "2. Approver 2",
          actor: a2Dec?.approverName || ap2User?.name || activeUser.regNoAp2 || "Approver 2",
          badge:
            a2Dec?.status === "Revision"
              ? "Revision"
              : isA2Done
              ? "Approved"
              : isA1Done && isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA2Done ? normalizeDateDDMMYYYY(a2Dec?.date) : "—",
          stepDone: isA2Done,
          stepRevision: a2Dec?.status === "Revision",
        },
      ]
    : [
        {
          title: "1. Submitted",
          actor: activeUser.name || "—",
          badge: isSubmitted || isRev ? "Submitted" : "Unsubmitted",
          date: isSubmitted || isRev ? subDate : "—",
          stepDone: isSubmitted,
          stepRevision: false,
        },
        {
          title: "2. Approver 1",
          actor: a1Dec?.approverName || ap1User?.name || activeUser.regNoAp1 || "Approver 1",
          badge:
            a1Dec?.status === "Revision"
              ? "Revision"
              : isA1Done
              ? "Approved"
              : isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA1Done ? normalizeDateDDMMYYYY(a1Dec?.date) : "—",
          stepDone: isA1Done,
          stepRevision: a1Dec?.status === "Revision",
        },
        {
          title: "3. Approver 2",
          actor: a2Dec?.approverName || ap2User?.name || activeUser.regNoAp2 || "Approver 2",
          badge:
            a2Dec?.status === "Revision"
              ? "Revision"
              : isA2Done
              ? "Approved"
              : isA1Done && isSubmitted
              ? "Pending"
              : "Waiting",
          date: isA2Done ? normalizeDateDDMMYYYY(a2Dec?.date) : "—",
          stepDone: isA2Done,
          stepRevision: a2Dec?.status === "Revision",
        },
      ];

  // Warna kartu:
  // - Abu-abu soft jika belum disubmit
  // - Kuning soft jika pending approval (sudah disubmit tapi belum full approved)
  // - Hijau soft jika full approved / validated
  const cardToneClass = isFullApproved
    ? "border-emerald-200 bg-emerald-50/40"
    : isRev
    ? "border-orange-200 bg-orange-50/50"
    : isSubmitted
    ? "border-amber-200 bg-amber-50/50"
    : "border-gray-200 bg-gray-50/80";

  const getBadgeClass = (stepDone: boolean, stepRevision: boolean) => {
    if (stepRevision) return "bg-orange-100 text-orange-800";
    if (isFullApproved) return "bg-emerald-100 text-emerald-800";
    if (!isSubmitted && !isRev) return "bg-gray-200/80 text-gray-600";
    if (stepDone) return "bg-amber-100 text-amber-800";
    return "bg-amber-100/70 text-amber-700";
  };

  const revHistory = wfRec?.revisionHistory ?? [];

  return (
    <div className="space-y-2">
      <div
        className={`grid gap-2 ${
          isFourStep
            ? "grid-cols-1 sm:grid-cols-5"
            : isProjectTwoStep
            ? "grid-cols-1 sm:grid-cols-2"
            : "grid-cols-1 sm:grid-cols-3"
        }`}
      >
        {steps.map((st) => (
          <div
            key={st.title}
            className={`rounded-lg border px-3 py-1.5 flex flex-col justify-between gap-1 ${cardToneClass}`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[11px] font-bold text-[#1A284F] leading-tight">
                {st.title}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold leading-none shrink-0 ${getBadgeClass(
                  st.stepDone,
                  st.stepRevision,
                )}`}
              >
                {st.badge}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 leading-tight">
              <span className="truncate font-medium uppercase" title={st.actor}>
                {st.actor}
              </span>
              <span className="shrink-0">{st.date}</span>
            </div>
          </div>
        ))}
      </div>

      {revHistory.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50/70 px-3 py-2 space-y-1">
          <p className="text-[11px] font-bold text-orange-800">
            Catatan / Riwayat Revisi Approver ({revHistory.length}):
          </p>
          {revHistory.map((rev, idx) => (
            <div
              key={idx}
              className="bg-white border border-orange-100 rounded px-2.5 py-1 text-[11px] flex items-start justify-between gap-2"
            >
              <div>
                <span className="font-semibold text-gray-800">
                  {rev.role} ({rev.approverName}):{" "}
                </span>
                <span className="text-gray-700">{rev.note}</span>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">{normalizeDateDDMMYYYY(rev.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
