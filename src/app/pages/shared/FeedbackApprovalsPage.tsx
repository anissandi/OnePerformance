import { useState } from "react"
import { useLocation } from "react-router"
import { FeedbackApprovalDrawer } from "../../components/FeedbackApprovalDrawer"
import { ModuleRouteNav } from "../../components/ModuleRouteNav"
import type { ApprovalRow } from "../../components/ReviewDrawer"
import { feedbackApprovalRows } from "./interDepartmentFeedbackStore"
import { useAppraisalRevision } from "./useAppraisalRevision"

export function FeedbackApprovalsPage({
  lockedUnits,
}: {
  lockedUnits?: string[]
}) {
  useAppraisalRevision()
  const location = useLocation()
  const role = location.pathname.startsWith("/supervisor/") || location.pathname.startsWith("/employee/")
    ? "approver1"
    : "approver2"
  const moduleBase = location.pathname.replace(/\/inter-department-feedback\/?$/, "")
  const [selected, setSelected] = useState<ApprovalRow | null>(null)
  const [version, setVersion] = useState(0)
  const rows = feedbackApprovalRows(role).filter(
    (row) =>
      (!lockedUnits || lockedUnits.includes(row.companyUnit)) &&
      (role !== "approver1" ||
        (row.companyUnit === "PT RSUP (Industry)" &&
          row.division === "Divisi Sumber Daya Manusia")),
  )
  return (
    <main
      className="min-h-screen space-y-6 bg-gray-50 p-6"
      data-version={version}
    >
      <ModuleRouteNav
        base={moduleBase}
        modules={["KPI", "SMART Goals", "Appraisal Form", "Managerial Skill", "RCA", "Inter-Department Feedback"]}
        label="Modul approval"
      />
      <div>
        <h1 className="text-2xl font-bold text-[#1A284F]">
          Tindak Lanjut Inter-Department Feedback
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Summary feedback anonim yang telah disubmit karyawan ·{" "}
          {role === "approver1" ? "Approver 1" : "Approver 2"}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Urutan wajib: Approver 1 submit tindak lanjut terlebih dahulu,
          kemudian Approver 2. Tidak ada keputusan approval atau revisi.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {[
                "ID Employee",
                "Employee",
                "Company Unit",
                "Division",
                "Department",
                "Position",
                "Submitted",
                "Status",
                "Action",
              ].map((label) => (
                <th key={label} className="whitespace-nowrap p-4">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.no} className="border-t">
                {[
                  row.employeeId,
                  row.name,
                  row.companyUnit,
                  row.division,
                  row.department,
                  row.position,
                  row.submittedDate,
                  row.status,
                ].map((value, index) => (
                  <td key={index} className="whitespace-nowrap p-4">
                    {value}
                  </td>
                ))}
                <td className="p-4">
                  <button
                    onClick={() => setSelected(row)}
                    className="rounded-lg bg-[#1A284F] px-4 py-2 text-white"
                  >
                    {row.status === "Pending" ? "Review" : "View"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-gray-500">
                  Belum ada Summary Received Feedback yang disubmit karyawan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <FeedbackApprovalDrawer
          key={selected.no}
          row={selected}
          reviewerRole={role}
          onClose={() => setSelected(null)}
          onAssessed={() => setVersion((previous) => previous + 1)}
          readOnly={selected.status !== "Pending"}
        />
      )}
    </main>
  )
}
