import { createBrowserRouter } from "react-router"
import { LoginPage } from "./pages/LoginPage"
import { AppLayout } from "./components/Layout"
import { AnalyticsDashboard } from "./pages/hr/AnalyticsDashboard"
import { HRApprovals } from "./pages/hr/Approvals"
import { HRModuleActivation } from "./pages/hr/ModuleActivation"
import { HRManagementOverride } from "./pages/hr/ManagementOverride"
import { AppraisalForm } from "./pages/employee/AppraisalForm"
import { SMARTGoalsPage } from "./pages/employee/SMARTGoals"
import { KPIPage } from "./pages/employee/KPIPage"
import { RCAPage } from "./pages/employee/RCAPage"
import { SupervisorDashboard } from "./pages/supervisor/Dashboard"
import { ProjectOutsidePage } from "./pages/employee/ProjectOutsidePage"
import { ProjectOutsideCombinedPage } from "./pages/shared/ProjectOutsideCombinedPage"
import { DocumentsPage } from "./pages/shared/DocumentsPage"
import { ViewProfile } from "./pages/shared/ViewProfile"
import { HRApprovalManagement } from "./pages/hr/ApprovalManagement"
import { HRSettingKPIPage } from "./pages/hr/setting/KPISetting"
import { OpenLockPage } from "./pages/hr/setting/OpenLock"
import { ScoresCalibration } from "./pages/hr/ScoresCalibration"
import { CalibrationSetting } from "./pages/hr/CalibrationSetting"
import { CalibrationAdjustment } from "./pages/hr/CalibrationAdjustment"
import { HRMonitoringKPI } from "./pages/hr/monitoring/KPIMonitoring"
import { HRMonitoringSmartGoals } from "./pages/hr/monitoring/SmartGoalsMonitoring"
import { HRMonitoringAppraisalForm } from "./pages/hr/monitoring/AppraisalFormMonitoring"
import { HRMonitoringProject } from "./pages/hr/monitoring/ProjectMonitoring"
import { HRMonitoringManagerialSkill } from "./pages/hr/monitoring/ManagerialSkillMonitoring"
import { HRMonitoringManagementInterview } from "./pages/hr/monitoring/ManagementInterviewMonitoring"
import { SupervisorManagerialSkillCheckIn } from "./pages/supervisor/ManagerialSkillCheckIn"
import { SupervisorManagementInterviewCheckIn } from "./pages/supervisor/ManagementInterviewCheckIn"
import { SupervisorMonitoringKPI } from "./pages/supervisor/monitoring/KPIMonitoring"
import { SupervisorMonitoringSmartGoals } from "./pages/supervisor/monitoring/SmartGoalsMonitoring"
import { SupervisorMonitoringAppraisalForm } from "./pages/supervisor/monitoring/AppraisalFormMonitoring"
import { SupervisorMonitoringProject } from "./pages/supervisor/monitoring/ProjectMonitoring"
import { SupervisorMonitoringManagerialSkill } from "./pages/supervisor/monitoring/ManagerialSkillMonitoring"
import { SupervisorMonitoringManagementInterview } from "./pages/supervisor/monitoring/ManagementInterviewMonitoring"
import { SupervisorMonitoringInterDeptFeedback } from "./pages/supervisor/monitoring/InterDepartmentFeedbackMonitoring"
import { SupervisorSettingManagementInterview } from "./pages/supervisor/setting/ManagementInterviewSetting"
import { UserManagementPage } from "./pages/hr/settings/UserManagement"
import { AccessManagementPage } from "./pages/hr/settings/AccessManagement"
import { MenuManagementPage } from "./pages/hr/settings/MenuManagement"
import { AuditTrailPage } from "./pages/hr/settings/AuditTrail"
import { DataSyncPage } from "./pages/hr/settings/DataSync"
import { MasterAppraisalForm } from "./pages/hr/settings/MasterAppraisalForm"
import { MasterManagerialSkill } from "./pages/hr/settings/MasterManagerialSkill"
import { MasterKPIPage } from "./pages/hr/settings/MasterKPI"
import { SupervisorSettingKPIPage } from "./pages/supervisor/setting/KPISetting"
import { SmartGoalsCheckInPage } from "./pages/supervisor/SmartGoalsCheckIn"
import { SmartGoalsApproverReview } from "./pages/supervisor/SmartGoalsApproverReview"
import { SupervisorApprovals } from "./pages/supervisor/Approvals"
import { SupervisorMyPerformanceAppraisal } from "./pages/supervisor/MyPerformanceAppraisal"
import { PerformanceAppraisalSummary } from "./pages/shared/PerformanceAppraisalSummary"
import { StaffDashboard } from "./pages/staff/StaffDashboard"
import { StaffMyPA } from "./pages/staff/StaffMyPA"
import { StaffSettingPage } from "./pages/staff/StaffSettingPage"
import { StaffMeasurementPage } from "./pages/staff/StaffMeasurementPage"
import { StaffViewProfile } from "./pages/staff/StaffViewProfile"
import { EmployeeSettingKPIPage } from "./pages/staff/EmployeeSettingKPIPage"
import { InterDepartmentFeedback } from "./pages/supervisor/InterDepartmentFeedback"
import { FeedbackApprovalsPage } from "./pages/shared/FeedbackApprovalsPage"
import { ManagementInterviewInvitation } from "./pages/hr/ManagementInterviewInvitation"
import { ManagementInterviewAssessment } from "./pages/bod/ManagementInterviewAssessment"
import { BODCalibrationApproval } from "./pages/bod/CalibrationApproval"
import { SupervisorCalibration } from "./pages/supervisor/Calibration"
import { YearEndVerification } from "./pages/hr/YearEndVerification"
import { CycleManagement } from "./pages/hr/CycleManagement"
import {
  HRCycleHistory,
  SupervisorCycleHistory,
} from "./pages/shared/CycleHistory"

function HRAppraisalSummary() {
  return <PerformanceAppraisalSummary role="hr" />
}
const BOD_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT RSTM",
  "PT GHS",
  "ASD",
]
function BODAppraisalSummary() {
  return <PerformanceAppraisalSummary role="hr" lockedUnits={BOD_UNITS} />
}
function BODAnalyticsDashboard() {
  return <AnalyticsDashboard lockedUnits={BOD_UNITS} />
}
function BODHRApprovals() {
  return <HRApprovals lockedUnits={BOD_UNITS} />
}
function BODMonitoringKPI() {
  return <HRMonitoringKPI lockedUnits={BOD_UNITS} />
}
function BODMonitoringSmartGoals() {
  return <HRMonitoringSmartGoals lockedUnits={BOD_UNITS} />
}
function BODMonitoringAppraisalForm() {
  return <HRMonitoringAppraisalForm lockedUnits={BOD_UNITS} />
}
function BODMonitoringProject() {
  return <HRMonitoringProject lockedUnits={BOD_UNITS} />
}
function BODMonitoringManagerialSkill() {
  return <HRMonitoringManagerialSkill lockedUnits={BOD_UNITS} />
}
function BODMonitoringManagementInterview() {
  return <HRMonitoringManagementInterview lockedUnits={BOD_UNITS} />
}
function BODCalibrationAdjustment() {
  return <CalibrationAdjustment lockedUnits={BOD_UNITS} />
}
function SupervisorAppraisalSummary() {
  return <PerformanceAppraisalSummary role="supervisor" />
}
function SupervisorMonitoringManagementInterviewNoAssess() {
  return <SupervisorMonitoringManagementInterview hideAssess={true} />
}
import { Placeholder } from "./components/Placeholder"
import { EvidencePage } from "./pages/hr/evidence/EvidencePage"

function HREvidenceKPI() {
  return <EvidencePage type="KPI Tracking" />
}
function HREvidenceRCA() {
  return <EvidencePage type="RCA" />
}
function HREvidenceSmart() {
  return <EvidencePage type="SMART Goals" />
}
function HREvidenceInterview() {
  return <EvidencePage type="Management Interview" />
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: LoginPage,
  },
  {
    path: "/hr",
    Component: AppLayout,
    children: [
      { index: true, Component: AnalyticsDashboard },
      { path: "approvals", Component: HRApprovals },
      { path: "approvals/measurement", Component: HRApprovals },
      { path: "approvals/measurement/:tab", Component: HRApprovals },
      {
        path: "approvals/measurement/inter-department-feedback",
        Component: FeedbackApprovalsPage,
      },
      { path: "approvals/setting", Component: HRApprovals },
      { path: "approvals/setting/:tab", Component: HRApprovals },
      {
        path: "approvals/management-interview",
        Component: SupervisorMonitoringManagementInterview,
      },
      { path: "modules", Component: HRModuleActivation },
      { path: "override", Component: HRManagementOverride },
      { path: "override/:tab", Component: HRManagementOverride },
      { path: "monitoring/kpi", Component: HRMonitoringKPI },
      { path: "monitoring/smart-goals", Component: HRMonitoringSmartGoals },
      {
        path: "monitoring/appraisal-form",
        Component: HRMonitoringAppraisalForm,
      },
      { path: "monitoring/project", Component: HRMonitoringProject },
      {
        path: "monitoring/managerial-skill",
        Component: HRMonitoringManagerialSkill,
      },
      {
        path: "monitoring/management-interview",
        Component: HRMonitoringManagementInterview,
      },
      { path: "summary", Component: HRAppraisalSummary },
      { path: "documents", Component: DocumentsPage },
      { path: "documents/:tab", Component: DocumentsPage },
      { path: "profile", Component: ViewProfile },
      { path: "profile/:tab", Component: ViewProfile },
      { path: "evidence/kpi-tracking", Component: HREvidenceKPI },
      { path: "evidence/rca", Component: HREvidenceRCA },
      { path: "evidence/smart-goals", Component: HREvidenceSmart },
      { path: "evidence/management-interview", Component: HREvidenceInterview },
      { path: "settings/kpi", Component: HRSettingKPIPage },
      { path: "settings/kpi/:tab", Component: HRSettingKPIPage },
      { path: "settings/open-lock", Component: OpenLockPage },
      { path: "settings/open-lock/:tab", Component: OpenLockPage },
      { path: "settings/scores-calibration", Component: ScoresCalibration },
      { path: "calibration/setting", Component: CalibrationSetting },
      { path: "calibration/adjustment", Component: CalibrationAdjustment },
      { path: "calibration/adjustment/:tab", Component: CalibrationAdjustment },
      {
        path: "calibration/management-interview",
        Component: SupervisorManagementInterviewCheckIn,
      },
      {
        path: "management-interview/invitation",
        Component: ManagementInterviewInvitation,
      },
      { path: "calibration/verification", Component: YearEndVerification },
      { path: "settings/cycle", Component: CycleManagement },
      { path: "history", Component: HRCycleHistory },
      { path: "settings/approval-management", Component: HRApprovalManagement },
      { path: "settings/approval-management/:tab", Component: HRApprovalManagement },
      { path: "settings/user-management", Component: UserManagementPage },
      { path: "settings/user-management/:tab", Component: UserManagementPage },
      { path: "settings/access-management", Component: AccessManagementPage },
      { path: "settings/menu-management", Component: MenuManagementPage },
      { path: "settings/audit-trail", Component: AuditTrailPage },
      { path: "settings/data-sync", Component: DataSyncPage },
      {
        path: "settings/master/appraisal-form",
        Component: MasterAppraisalForm,
      },
      {
        path: "settings/master/managerial-skill",
        Component: MasterManagerialSkill,
      },
      { path: "settings/master/kpi", Component: MasterKPIPage },
      { path: "*", Component: Placeholder },
    ],
  },
  {
    path: "/supervisor",
    Component: AppLayout,
    children: [
      { index: true, Component: SupervisorDashboard },
      { path: "dashboard/:tab", Component: SupervisorDashboard },
      { path: "monitoring/kpi", Component: SupervisorMonitoringKPI },
      {
        path: "monitoring/smart-goals",
        Component: SupervisorMonitoringSmartGoals,
      },
      {
        path: "monitoring/appraisal-form",
        Component: SupervisorMonitoringAppraisalForm,
      },
      { path: "monitoring/project", Component: SupervisorMonitoringProject },
      {
        path: "monitoring/managerial-skill",
        Component: SupervisorMonitoringManagerialSkill,
      },
      {
        path: "monitoring/management-interview",
        Component: SupervisorMonitoringManagementInterviewNoAssess,
      },
      {
        path: "monitoring/inter-department-feedback",
        Component: SupervisorMonitoringInterDeptFeedback,
      },
      { path: "measurement/kpi-tracking", Component: KPIPage },
      { path: "measurement/smart-goals", Component: SmartGoalsCheckInPage },
      {
        path: "measurement/smart-goals-review",
        Component: SmartGoalsApproverReview,
      },
      { path: "measurement/appraisal-form", Component: AppraisalForm },
      { path: "measurement/rca", Component: RCAPage },
      {
        path: "measurement/project-outside",
        Component: ProjectOutsideCombinedPage,
      },
      {
        path: "measurement/managerial-skill",
        Component: SupervisorManagerialSkillCheckIn,
      },
      {
        path: "calibration/management-interview",
        Component: SupervisorMonitoringManagementInterviewNoAssess,
      },
      {
        path: "measurement/inter-department-feedback",
        Component: InterDepartmentFeedback,
      },
      { path: "measurement/inter-department-feedback/:tab", Component: InterDepartmentFeedback },
      {
        path: "calibration/team-performance",
        Component: SupervisorCalibration,
      },
      { path: "history", Component: SupervisorCycleHistory },
      { path: "setting/kpi", Component: SupervisorSettingKPIPage },
      { path: "setting/kpi/:tab", Component: SupervisorSettingKPIPage },
      { path: "setting/smart-goals", Component: SMARTGoalsPage },
      { path: "setting/project", Component: ProjectOutsidePage },
      {
        path: "setting/management-interview",
        Component: SupervisorSettingManagementInterview,
      },
      { path: "appraisals", Component: SupervisorApprovals },
      { path: "approvals/measurement", Component: SupervisorApprovals },
      { path: "approvals/measurement/:tab", Component: SupervisorApprovals },
      {
        path: "approvals/measurement/inter-department-feedback",
        Component: FeedbackApprovalsPage,
      },
      { path: "appraisals/setting", Component: SupervisorApprovals },
      { path: "appraisals/setting/:tab", Component: SupervisorApprovals },
      {
        path: "appraisals/management-interview",
        Component: SupervisorMonitoringManagementInterview,
      },
      { path: "summary", Component: SupervisorAppraisalSummary },
      { path: "appraisal", Component: SupervisorMyPerformanceAppraisal },
      { path: "appraisal/:tab", Component: SupervisorMyPerformanceAppraisal },
      { path: "documents", Component: DocumentsPage },
      { path: "documents/:tab", Component: DocumentsPage },
      { path: "profile", Component: ViewProfile },
      { path: "profile/:tab", Component: ViewProfile },
      { path: "*", Component: Placeholder },
    ],
  },
  {
    path: "/employee",
    Component: AppLayout,
    children: [
      { index: true, Component: StaffDashboard },
      { path: "profile", Component: StaffViewProfile },
      { path: "profile/:tab", Component: StaffViewProfile },
      { path: "appraisal", Component: StaffMyPA },
      { path: "appraisal/:tab", Component: StaffMyPA },
      { path: "setting", Component: StaffSettingPage },
      { path: "setting/kpi", Component: EmployeeSettingKPIPage },
      { path: "setting/smart-goals", Component: SMARTGoalsPage },
      { path: "measurement", Component: StaffMeasurementPage },
      { path: "measurement/kpi-tracking", Component: KPIPage },
      { path: "measurement/rca", Component: RCAPage },
      { path: "measurement/smart-goals", Component: SmartGoalsCheckInPage },
      { path: "measurement/appraisal-form", Component: AppraisalForm },
      {
        path: "measurement/project-outside",
        Component: ProjectOutsideCombinedPage,
      },
      {
        path: "measurement/inter-department-feedback",
        Component: InterDepartmentFeedback,
      },
      { path: "measurement/inter-department-feedback/:tab", Component: InterDepartmentFeedback },
      { path: "documents", Component: DocumentsPage },
      { path: "documents/:tab", Component: DocumentsPage },
      { path: "*", Component: Placeholder },
    ],
  },
  {
    path: "/bod",
    Component: AppLayout,
    children: [
      { index: true, Component: BODAnalyticsDashboard },
      { path: "approvals", Component: BODHRApprovals },
      { path: "approvals/measurement", Component: BODHRApprovals },
      { path: "approvals/measurement/:tab", Component: BODHRApprovals },
      {
        path: "approvals/measurement/inter-department-feedback",
        Component: () => <FeedbackApprovalsPage lockedUnits={BOD_UNITS} />,
      },
      { path: "approvals/setting", Component: BODHRApprovals },
      { path: "approvals/setting/:tab", Component: BODHRApprovals },
      {
        path: "approvals/management-interview",
        Component: SupervisorMonitoringManagementInterview,
      },
      { path: "approvals/calibration", Component: BODCalibrationApproval },
      { path: "monitoring/kpi", Component: BODMonitoringKPI },
      { path: "monitoring/smart-goals", Component: BODMonitoringSmartGoals },
      {
        path: "monitoring/appraisal-form",
        Component: BODMonitoringAppraisalForm,
      },
      { path: "monitoring/project", Component: BODMonitoringProject },
      {
        path: "monitoring/managerial-skill",
        Component: BODMonitoringManagerialSkill,
      },
      {
        path: "monitoring/management-interview",
        Component: BODMonitoringManagementInterview,
      },
      { path: "summary", Component: BODAppraisalSummary },
      { path: "calibration/adjustment", Component: BODCalibrationAdjustment },
      { path: "calibration/adjustment/:tab", Component: BODCalibrationAdjustment },
      {
        path: "calibration/management-interview",
        Component: SupervisorManagementInterviewCheckIn,
      },
      {
        path: "management-interview/assessment",
        Component: ManagementInterviewAssessment,
      },
      { path: "documents", Component: DocumentsPage },
      { path: "documents/:tab", Component: DocumentsPage },
      { path: "profile", Component: ViewProfile },
      { path: "profile/:tab", Component: ViewProfile },
      { path: "history", Component: HRCycleHistory },
      { path: "*", Component: Placeholder },
    ],
  },
  {
    path: "*",
    Component: LoginPage,
  },
])
