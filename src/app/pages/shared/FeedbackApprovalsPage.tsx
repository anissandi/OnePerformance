import { useState } from "react"
import { useLocation } from "react-router"
import { CheckCircle2, Eye, FileCheck, ListTodo } from "lucide-react"
import { FeedbackApprovalDrawer } from "../../components/FeedbackApprovalDrawer"
import { ModuleRouteNav } from "../../components/ModuleRouteNav"
import type { ApprovalRow } from "../../components/ReviewDrawer"
import { getAllowedApprovalTypesForUser, useAuthStore } from "../../store/authStore"
import { normalizeDateDDMMYYYY } from "../../utils/dateFormat"
import { resolveDynamicApprovalRowsForUser } from "./approvalsStore"
import {
  feedbackApprovalRows,
  feedbackRowStatusFor,
  loadFeedbackSubmissions,
} from "./interDepartmentFeedbackStore"
import { useAppraisalRevision } from "./useAppraisalRevision"

export function FeedbackApprovalsPage({
  lockedUnits,
}: {
  lockedUnits?: string[]
}) {
  useAppraisalRevision()
  const location = useLocation()
  const { activeUser } = useAuthStore()
  const role = location.pathname.startsWith("/supervisor/") || location.pathname.startsWith("/employee/")
    ? "approver1"
    : "approver2"
  const moduleBase = location.pathname.replace(/\/inter-department-feedback\/?$/, "")
  const moduleTypes = getAllowedApprovalTypesForUser(activeUser, "checkin")
  const [activeTab, setActiveTab] = useState<"Pending Task" | "Approval History">("Pending Task")
  const [selected, setSelected] = useState<(ApprovalRow & { needsAction?: boolean }) | null>(null)
  const [version, setVersion] = useState(0)
  const submissions = loadFeedbackSubmissions()
  const rows = resolveDynamicApprovalRowsForUser(
    feedbackApprovalRows(role),
    activeUser,
    "measurement",
    new Set(["Inter-Department Feedback"]),
    lockedUnits,
  ).map((row) => {
    // Status & aksi dihitung per baris sesuai peran reviewer (AP1/AP2) user login terhadap karyawan tsb.
    const sub = submissions.find((s) => s.row.no === row.no)
    if (!sub) return { ...row, needsAction: false }
    const st = feedbackRowStatusFor(sub, row.reviewerRoleForRow ?? role)
    return { ...row, status: st.status, needsAction: st.needsAction }
  })
  const pendingRows = rows.filter((r) => Boolean(r.needsAction))
  const historyRows = rows.filter((r) => !r.needsAction)
  const visibleRows = activeTab === "Pending Task" ? pendingRows : historyRows
  const isHistory = activeTab === "Approval History"

  return (
    <div className="w-full" data-version={version}>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#1A284F]">
          Performance Appraisal Measurement
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Tindak Lanjut Inter-Department Feedback · {role === "approver1" ? "Approver 1" : "Approver 2"}
        </p>
      </div>
      <ModuleRouteNav
        base={moduleBase}
        modules={moduleTypes}
        label="Modul approval"
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <div className="inline-flex flex-wrap items-center gap-2.5 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 mb-7">
          <button
            type="button"
            onClick={() => setActiveTab("Pending Task")}
            className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "Pending Task"
                ? "bg-gradient-to-r from-[#1A284F] to-[#28407A] text-white shadow-md ring-1 ring-[#1A284F]/20"
                : "bg-white/80 text-slate-600 hover:bg-white hover:text-[#1A284F] border border-slate-200/80"
            }`}
          >
            <ListTodo className="w-4 h-4 shrink-0" />
            <span>Pending Task</span>
            <span
              className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${
                activeTab === "Pending Task"
                  ? pendingRows.length > 0
                    ? "bg-amber-400 text-[#1A284F]"
                    : "bg-white/20 text-white"
                  : pendingRows.length > 0
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {pendingRows.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("Approval History")}
            className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isHistory
                ? "bg-gradient-to-r from-teal-700 to-emerald-700 text-white shadow-md ring-1 ring-emerald-800/20"
                : "bg-white/80 text-slate-600 hover:bg-teal-50/70 hover:text-teal-800 border border-slate-200/80"
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Approval History</span>
            <span
              className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${
                isHistory ? "bg-white/20 text-white" : "bg-teal-50 text-teal-700 border border-teal-200"
              }`}
            >
              {historyRows.length}
            </span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1A284F] text-white text-xs font-semibold uppercase tracking-wider">
                {[
                  "Action",
                  "No",
                  "ID Karyawan",
                  "Nama",
                  "Divisi",
                  "Departemen",
                  "Bagian",
                  "Tipe Modul",
                  "Tgl Pengajuan",
                  "Tgl Persetujuan",
                ].map((label) => (
                  <th key={label} className={`py-4 px-4 whitespace-nowrap ${label === "No" ? "w-14 text-center" : ""}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => (
                <tr key={row.no} className={`border-b border-gray-100 transition-colors hover:bg-sky-100/40 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                  <td className="py-4 px-4">
                    {row.needsAction ? (
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1A284F] hover:bg-[#25386e] border border-[#1A284F] rounded-xl shadow-sm hover:shadow transition-all whitespace-nowrap"
                      >
                        <FileCheck className="w-4 h-4 shrink-0" />
                        <span>Review</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {row.status}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 text-center text-gray-500 text-sm font-medium">{idx + 1}</td>
                  <td className="py-4 px-4 text-sm font-mono font-semibold text-[#1A284F] whitespace-nowrap">{row.employeeId}</td>
                  <td className="py-4 px-4 text-sm font-medium text-gray-900 whitespace-nowrap">{row.name}</td>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.division || "—"}</td>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.department || "—"}</td>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{row.bagian || "—"}</td>
                  <td className="py-4 px-4 text-sm whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border bg-cyan-50 text-cyan-800 border-cyan-200">
                      {row.type}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{normalizeDateDDMMYYYY(row.submittedDate)}</td>
                  <td className="py-4 px-4 text-sm text-gray-600 whitespace-nowrap">{isHistory ? normalizeDateDDMMYYYY(row.approvalDate) : "—"}</td>
                </tr>
              ))}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-gray-400 text-sm">
                    Tidak ada data pengajuan pada tab ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && (
        <FeedbackApprovalDrawer
          key={selected.no}
          row={selected}
          reviewerRole={selected.reviewerRoleForRow ?? role}
          onClose={() => setSelected(null)}
          onAssessed={() => setVersion((previous) => previous + 1)}
          readOnly={!(selected as { needsAction?: boolean }).needsAction}
        />
      )}
    </div>
  )
}
