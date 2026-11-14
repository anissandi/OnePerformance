import { ProjectOutsideTab } from "../staff/StaffMyPA";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import { useProjectStore } from "../../store/projectStore";

export function ProjectOutsideCombinedPage() {
  const { excelSubmitted, submitted, excelSubmittedDate } = useProjectStore();
  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Project Outside Job Scope</h1>
        <p className="text-gray-500 text-sm">Review project progress, approval status, and appraisal scores.</p>
      </div>
      <ModuleApprovalStatusBar
        module="Project"
        phase="measurement"
        submittedOverride={Boolean(excelSubmitted || submitted)}
        submittedDateOverride={excelSubmittedDate || undefined}
      />
      <ProjectOutsideTab />
    </div>
  );
}
