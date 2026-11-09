import * as Dialog from "@radix-ui/react-dialog";
import { AppFrame } from "../../components/AppFrame";
import { Sidebar } from "../../components/Sidebar";
import { KPISettingTable } from "../../components/KPISettingTable";
import { SimulationKpiTracking } from "./SimulationKpiTracking";
import { SimulationRca } from "./SimulationRca";
import { SimulationSmartGoals } from "./SimulationSmartGoals";
import type { SmartGoalsView } from "./SimulationSmartGoals";
import { SimulationAppraisalForm } from "./SimulationAppraisalForm";
import type { AppraisalFormView } from "./SimulationAppraisalForm";
import { SimulationManagerialSkill } from "./SimulationManagerialSkill";
import type { ManagerialSkillView } from "./SimulationManagerialSkill";
import { SimulationInterDepartmentFeedback } from "./SimulationInterDepartmentFeedback";
import type { IdfView } from "./SimulationInterDepartmentFeedback";
import { SimulationProject } from "./SimulationProject";
import type { ProjectSimulationView } from "./SimulationProject";
import { SimulationManagementInterview } from "./SimulationManagementInterview";
import type { ManagementInterviewView } from "./SimulationManagementInterview";
import { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, RefreshCw, ShieldCheck, PanelLeftClose, PanelLeftOpen, Bell, Plus, Eye, Send, X } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { simulationAssignments, simulationEmployees, simulationInterviewAssignments, simulationUnits } from "../../data/paSimulation2026";
import { aggregateTarget } from "../../domain/kpiSettingWorkflow";
import type { KpiAction, KpiDocument, KpiItem } from "../../domain/kpiSettingWorkflow";
import { actOnSimulationKpi, loadSimulationKpi, loginSimulation, logoutSimulation, saveSimulationWindow } from "../../services/paSimulationApi";
import type { SimulationIdentity, SimulationOverview } from "../../services/paSimulationApi";

const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F] disabled:bg-slate-50 disabled:text-slate-600";
const buttonClass = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#1A284F]";
const blankItem = (): KpiItem => ({ id: crypto.randomUUID(), subject: "", unit: "", definition: "", source: "", weight: 0,
  polarity: "maximize", formula: "sum", presentation: { section: "B", perspective: "", baseline: "", formulaDetail: "", notes: "" }, months: months.map(() => ({ target: null, notApplicableReason: "" })) });
const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";

export function SimulationKpiSetting() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view") ?? "setting";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingKpi, setAddingKpi] = useState(false);
  const [preview, setPreview] = useState(false);
  const [identity, setIdentity] = useState<SimulationIdentity | null>(null);
  const isParticipant = !!identity && (identity.appraisal_participant || simulationEmployees.some((emp) => emp.id === identity.identity_id));
  const participantProfile = simulationEmployees.find((emp) => emp.id === identity?.identity_id);
  const hasManagerialSkill = !!participantProfile?.allowedModules.includes("manager-skill");
  const hasManagementInterview = !!participantProfile?.allowedModules.includes("management-interview") || identity?.actor_level === "hr-unit" || identity?.actor_level === "hr-strategic";
  const isApprover = !!identity && (!identity.appraisal_participant || identity.actor_level === "hr-unit" || simulationAssignments.some((assignment) => assignment.stages.some((stage) => stage.actorId === identity.identity_id)) || simulationInterviewAssignments.some((assignment) => assignment.reviewerIds.includes(identity.identity_id)));
  const view = (() => {
    if ((requestedView === "activation" || requestedView === "tracking-activation" || requestedView === "sg-activation" || requestedView === "af-activation" || requestedView === "project-activation" || requestedView === "ms-activation" || requestedView === "idf-activation" || requestedView === "mi-activation") && identity?.actor_level === "hr-strategic") return requestedView;
    if (requestedView === "notifications" || requestedView === "open-lock") return requestedView;
    if (requestedView === "approvals-setting" && isApprover) return "approvals-setting";
    if (requestedView === "approvals-sg-setting" && isApprover) return "approvals-sg-setting";
    if (requestedView === "approvals-measurement" && isApprover) return "approvals-measurement";
    if (requestedView === "approvals-sg-measurement" && isApprover) return "approvals-sg-measurement";
    if (requestedView === "approvals-appraisal-form" && isApprover) return "approvals-appraisal-form";
    if (requestedView === "approvals-project" && isApprover) return "approvals-project";
    if (requestedView === "approvals-managerial-skill" && isApprover) return "approvals-managerial-skill";
    if (requestedView === "approvals-idf" && isApprover) return "approvals-idf";
    if (requestedView === "approvals-management-interview" && isApprover) return "approvals-management-interview";
    if (requestedView === "approvals-rca" && isApprover) return "approvals-rca";
    if (requestedView === "measurement") return isParticipant ? "measurement" : "approvals-measurement";
    if (requestedView === "sg-setting") return isParticipant ? "sg-setting" : "approvals-sg-setting";
    if (requestedView === "sg-measurement") return isParticipant ? "sg-measurement" : "approvals-sg-measurement";
    if (requestedView === "appraisal-form") return isParticipant ? "appraisal-form" : "approvals-appraisal-form";
    if (requestedView === "project") return isParticipant || identity?.actor_level === "hr-strategic" ? "project" : "approvals-project";
    if (requestedView === "managerial-skill") return isParticipant ? "managerial-skill" : "approvals-managerial-skill";
    if (requestedView === "idf") return isParticipant ? "idf" : "approvals-idf";
    if (requestedView === "management-interview") return hasManagementInterview ? "management-interview" : "approvals-management-interview";
    if (requestedView === "rca") return isParticipant ? "rca" : "approvals-rca";
    return isParticipant ? "setting" : "approvals-setting";
  })();
  const [approvalTab, setApprovalTab] = useState("pending");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<SimulationOverview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<KpiItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [unitId, setUnitId] = useState("IND");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirmation, setConfirmation] = useState<KpiAction | null>(null);
  const ownDocument = overview?.documents.find((record) => record.employeeId === identity?.identity_id);
  const approvalDocuments = overview?.documents.filter((record) => record.employeeId !== identity?.identity_id) ?? [];
  const filteredApprovalDocuments = approvalDocuments
    .filter((record) => approvalTab === "all" ? record.status !== "Draft" : approvalTab === "validated" ? record.status === "Validated" : record.status !== "Validated" && record.status !== "Draft")
    .filter((record) => (record.employeeId + " " + (simulationEmployees.find((employee) => employee.id === record.employeeId)?.name ?? "")).toLowerCase().includes(employeeSearch.toLowerCase()));
  const activeApprovalDocument = filteredApprovalDocuments.find((record) => record.employeeId === selected) ?? filteredApprovalDocuments[0];
  const document = view === "setting" ? ownDocument : view === "approvals-setting" ? activeApprovalDocument : overview?.documents.find((record) => record.employeeId === selected);
  const owner = !!document && document.employeeId === identity?.identity_id;
  const editable = view === "setting" && owner && (document.status === "Draft" || document.revisionStage !== null);
  const stage = document?.stages[document.activeStage];
  const actionable = view === "approvals-setting" && !!document && document.revisionStage === null && document.status !== "Validated" && stage?.actorId === identity?.identity_id;

  function selectDocument(record: KpiDocument) {
    setEditingIndex(null); setAddingKpi(false); setPreview(false); setSelected(record.employeeId); setItems(structuredClone(record.items)); setNote(""); setConfirmation(null);
  }
  useEffect(() => {
    if (!overview || !identity) return;
    if (view === "setting" && ownDocument && selected !== ownDocument.employeeId) {
      selectDocument(ownDocument);
    } else if (view === "approvals-setting") {
      if (activeApprovalDocument && selected !== activeApprovalDocument.employeeId) {
        selectDocument(activeApprovalDocument);
      } else if (!activeApprovalDocument && selected !== null) {
        setSelected(null);
        setItems([]);
      }
    }
  }, [view, approvalTab, employeeSearch, overview, identity?.identity_id, activeApprovalDocument?.employeeId]);
  function openAddKpi() {
    if (!editable || preview || busy) return;
    setEditingIndex(items.length);
    setItems((records) => [...records, blankItem()]);
    setAddingKpi(true);
  }
  function closeKpiEditor(cancel = true) {
    if (busy) return;
    if (cancel && addingKpi) setItems((records) => records.filter((_, index) => index !== editingIndex));
    setAddingKpi(false);
    setEditingIndex(null);
  }
  async function refresh(employeeId?: string) {
    const result = await loadSimulationKpi(); setOverview(result);
    const record = result.documents.find((entry) => entry.employeeId === (employeeId ?? selected))
      ?? result.documents.find((entry) => entry.employeeId !== identity?.identity_id)
      ?? result.documents[0];
    if (record) selectDocument(record); else { setSelected(null); setItems([]); }
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await operation(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Operasi gagal."); }
    finally { setBusy(false); }
  }
  function patchItem(index: number, patch: Partial<KpiItem>) {
    setItems((records) => records.map((record, recordIndex) => recordIndex === index ? { ...record, ...patch } : record));
  }
  async function act(action: KpiAction) {
    if (!document) return;
    const employeeId = document.employeeId;
    await run(async () => {
      await actOnSimulationKpi(document, action, owner ? items : undefined, note);
      setConfirmation(null);
      setMessage(action === "save" ? "Draft tersimpan; belum diteruskan untuk pemeriksaan." : "Tindakan tersimpan. Notifikasi dalam aplikasi tersedia; pengiriman email belum tersambung.");
      try { await refresh(employeeId); } catch { setError("Tindakan tersimpan, tetapi pemuatan ulang gagal. Jangan ulangi keputusan; klik Muat ulang."); }
    });
  }

  const role = isParticipant ? "employee" : identity?.actor_level?.startsWith("hr-") ? "hr" : identity?.actor_level === "bod" || identity?.actor_level === "direktur" ? "bod" : "supervisor";
  const displayedItems = view === "setting" ? (selected === ownDocument?.employeeId ? items : (ownDocument?.items ?? [])) : (selected === document?.employeeId ? items : (document?.items ?? []));
  const tableItems = displayedItems.map((item, index) => ({ id: item.id, no: String(index + 1), section: item.presentation?.section ?? "B" as "A" | "B", perspektif: item.presentation?.perspective ?? "—", kpi: item.subject, satuan: item.unit, formula: ({ sum: "Jumlah", average: "Rata-Rata", last: "Nilai Akhir" })[item.formula], bobot: item.weight + "%", definisi: item.definition, source: item.source, baseline2025: item.presentation?.baseline ?? "—", target2026: aggregateTarget(item)?.toLocaleString("id-ID") ?? "Tidak berlaku", polaritas: item.polarity === "maximize" ? "Maximize" as const : "Minimize" as const, detailFormula: item.presentation?.formulaDetail ?? "—", keterangan: item.presentation?.notes ?? "" }));
  return <AppFrame sidebar={<Sidebar role={role} collapsed={sidebarCollapsed} simulation={{ participant: isParticipant, hasManagerialSkill, hasManagementInterview, approver: isApprover, strategic: identity?.actor_level === "hr-strategic", loggedIn: !!identity, activeView: view }} />} topbar={<header className="flex h-[88px] shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 md:px-8">
    <div className="flex items-center gap-3"><button aria-label={sidebarCollapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" onClick={() => setSidebarCollapsed((value) => !value)}>{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</button><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">PA-Simulasi</span><span className="hidden text-sm text-gray-400 md:block">Performance Appraisal · 2026</span></div>
    <div className="flex items-center gap-4">{identity && <Link aria-label="Notifikasi akun simulasi" to="/pa-simulasi?view=notifications" className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Bell size={20} />{!!overview?.notifications.length && <span className="absolute right-0 top-0 rounded-full bg-red-500 px-1 text-[10px] text-white">{overview.notifications.length}</span>}</Link>}<div className="hidden text-right sm:block"><p className="text-sm font-semibold text-[#1A284F]">{identity?.name ?? "Login akun simulasi"}</p><p className="text-xs capitalize text-gray-400">{identity?.actor_level ?? "Akses terautentikasi"}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1A284F] text-xs font-semibold text-white">{identity?.name.split(" ").map((word) => word[0]).slice(0, 2).join("") ?? "PA"}</div></div>
  </header>}>
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Link className="mb-2 inline-flex items-center gap-1 text-xs text-gray-400" to="/"><ArrowLeft size={14} /> Kembali ke mockup utama</Link><h1 className="mb-1 text-[28px] font-bold text-[#1A284F]">{view === "activation" || view === "tracking-activation" || view === "sg-activation" || view === "af-activation" || view === "project-activation" || view === "ms-activation" || view === "idf-activation" || view === "mi-activation" ? "Module Activation" : view === "measurement" ? "KPI Tracking Saya" : view === "approvals-measurement" ? "Approvals · KPI Measurement" : view === "sg-setting" ? "SMART Goals · Setting Saya" : view === "approvals-sg-setting" ? "Approvals · SMART Goals Setting" : view === "sg-measurement" ? "SMART Goals · Measurement Saya" : view === "approvals-sg-measurement" ? "Approvals · SMART Goals Measurement" : view === "appraisal-form" ? "Appraisal Form Saya" : view === "approvals-appraisal-form" ? "Approvals · Appraisal Form" : view === "project" ? "Project Outside Job Scope" : view === "approvals-project" ? "Approvals · Project Outside Job Scope" : view === "managerial-skill" ? "Managerial Skill Saya" : view === "approvals-managerial-skill" ? "Approvals · Managerial Skill" : view === "idf" ? "Inter-Department Feedback Saya" : view === "approvals-idf" ? "Approvals · Inter-Department Feedback" : view === "management-interview" ? "Management Interview Saya" : view === "approvals-management-interview" ? "Approvals · Management Interview" : view === "open-lock" ? "Open Lock KPI" : view === "rca" ? "RCA — Root Cause Analysis Saya" : view === "approvals-rca" ? "Approvals · RCA" : view === "notifications" ? "Notifikasi" : view === "approvals-setting" ? "Approvals · KPI Setting" : "KPI Setting Saya"}</h1><p className="text-sm text-gray-500">{view.startsWith("approvals-") ? "Pemeriksaan & Persetujuan Pengajuan Karyawan · 2026" : "2026 Performance Appraisal — Pengajuan Pribadi Karyawan"}</p></div>{identity && editable && view === "setting" && <div className="flex flex-wrap items-center gap-3"><button disabled={busy || preview} className="flex items-center gap-2 rounded-lg border border-[#1A284F] px-4 py-2.5 text-sm font-semibold text-[#1A284F] hover:bg-[#1A284F]/5 disabled:opacity-40" onClick={() => { if (ownDocument && selected !== ownDocument.employeeId) selectDocument(ownDocument); openAddKpi(); }}><Plus size={16} /> Add KPI</button><button disabled={busy} className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200" onClick={() => setPreview((value) => !value)}><Eye size={16} />{preview ? "Kembali ke input" : "Preview"}</button><button disabled={busy} className={buttonClass + " flex items-center gap-2 py-2.5"} onClick={() => setConfirmation("submit")}><Send size={16} />{document?.revisionStage !== null ? "Submit ulang revisi" : "Submit KPI"}</button></div>}</div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">{message}</div>}
      {!identity ? <section className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <LockKeyhole className="mb-4 text-teal-700" size={28} /><h2 className="text-xl font-semibold">Login akun simulasi</h2>
        <p className="mt-2 text-sm text-slate-500">Gunakan akun yang sudah diprovisioning. Tidak ada pendaftaran publik atau pergantian role tanpa login.</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void run(async () => {
          const account = await loginSimulation(email, password); setPassword(""); setIdentity(account); setApprovalTab("pending");
          const accountIsParticipant = account.appraisal_participant || simulationEmployees.some((emp) => emp.id === account.identity_id);
          setSearchParams({ view: accountIsParticipant ? "setting" : "approvals-setting" });
          await refresh(account.identity_id);
        }); }}>
          <label className="block text-sm font-medium">Email<input className={inputClass + " mt-1"} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="block text-sm font-medium">Password<input className={inputClass + " mt-1"} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className={buttonClass + " w-full"} disabled={busy}>{busy ? "Memeriksa akun…" : "Masuk ke PA-Simulasi"}</button>
        </form>
      </section> : <>
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div><p className="font-semibold">{identity.name}</p><p className="text-xs text-slate-500">{identity.identity_id} · {identity.actor_level} · {identity.unit_id ?? "Lintas unit sesuai penugasan"}</p></div>
          <div className="flex gap-2"><button disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => void run(() => refresh())}><RefreshCw size={15} /> Muat ulang</button>
            <button disabled={busy} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => void run(async () => {
              try { await logoutSimulation(); } finally { setIdentity(null); setOverview(null); setSelected(null); setItems([]); setPassword(""); }
            })}>Keluar / pindah akun</button></div>
        </section>
        {view === "approvals-setting" && <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-[#1A284F]">Halaman <strong>Approvals · Setting</strong> khusus untuk memeriksa atau menyetujui pengajuan KPI karyawan lain sesuai kewenangan Anda. Checker, Approver, dan Validator tidak boleh mengubah isi indikator KPI.{isParticipant ? " Untuk menyusun KPI pribadi Anda sendiri, buka menu KPI Setting pada grup Pengajuan PA Saya di sidebar." : ""}</p>}
        {(view === "setting" || view === "approvals-setting") && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Cakupan tahap ini: KPI Personal peserta simulasi dan approval Setting. Cascading Business/Direktur/GM, Open Lock fase Setting, serta pengiriman email belum tersambung. Jangan menganggap alur appraisal lengkap sudah lolos E2E.</p>}
        {(view === "rca" || view === "approvals-rca") && <SimulationRca key={`${identity.identity_id}-${view}`} identity={identity} mode={view === "approvals-rca" ? "approvals" : "own"} refreshNotifications={() => refresh()} />}
        {(view === "measurement" || view === "approvals-measurement" || view === "tracking-activation" || view === "open-lock") && <SimulationKpiTracking key={`${identity.identity_id}-${view}`} identity={identity} view={view} refreshNotifications={() => refresh()} />}
        {(view === "sg-setting" || view === "approvals-sg-setting" || view === "sg-measurement" || view === "approvals-sg-measurement" || view === "sg-activation") && <SimulationSmartGoals key={`${identity.identity_id}-${view}`} identity={identity} view={view as SmartGoalsView} refreshNotifications={() => refresh()} />}
        {(view === "appraisal-form" || view === "approvals-appraisal-form" || view === "af-activation") && <SimulationAppraisalForm key={`${identity.identity_id}-${view}`} identity={identity} view={view as AppraisalFormView} refreshNotifications={() => refresh()} />}
        {(view === "managerial-skill" || view === "approvals-managerial-skill" || view === "ms-activation") && <SimulationManagerialSkill key={`${identity.identity_id}-${view}`} identity={identity} view={view as ManagerialSkillView} refreshNotifications={() => refresh()} />}
        {(view === "idf" || view === "approvals-idf" || view === "idf-activation") && <SimulationInterDepartmentFeedback key={`${identity.identity_id}-${view}`} identity={identity} view={view as IdfView} refreshNotifications={() => refresh()} />}
        {(view === "project" || view === "approvals-project" || view === "project-activation") && <SimulationProject key={`${identity.identity_id}-${view}`} identity={identity} view={view as ProjectSimulationView} refreshNotifications={() => refresh()} />}
        {(view === "management-interview" || view === "approvals-management-interview" || view === "mi-activation") && <SimulationManagementInterview key={`${identity.identity_id}-${view}`} identity={identity} view={view as ManagementInterviewView} refreshNotifications={() => refresh()} />}
        {view === "activation" && identity.actor_level === "hr-strategic" && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Module Activation · KPI Setting</h2><p className="mt-1 text-xs text-slate-500">Tetapkan jadwal resmi per unit. Tidak ada tanggal default. Start Date 00.00 WIB sampai akhir End Date.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void run(async () => {
            await saveSimulationWindow(unitId, startDate, endDate); await refresh(); setMessage("Jadwal KPI Setting tersimpan.");
          }); }}>
            <label className="text-sm">Unit Usaha<select className={inputClass + " mt-1"} value={unitId} onChange={(event) => setUnitId(event.target.value)}>{simulationUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
            <label className="text-sm">Start Date<input className={inputClass + " mt-1"} type="date" min="2026-01-01" max="2026-12-31" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label>
            <label className="text-sm">End Date<input className={inputClass + " mt-1"} type="date" min={startDate || "2026-01-01"} max="2026-12-31" value={endDate} onChange={(event) => setEndDate(event.target.value)} required /></label>
            <button className={buttonClass + " self-end"} disabled={busy}>Simpan jadwal</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">{overview?.windows.map((window) => <span key={window.unitId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">{window.unitId}: {window.startDate ? `${window.startDate} — ${window.endDate}` : "Belum dibuka"}</span>)}</div>
        </section>}
        <div className="space-y-6">
          <aside className="space-y-4">{view === "approvals-setting" && <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">{[{ id: "pending", label: "Pending" }, { id: "validated", label: "Validated" }, { id: "all", label: "Semua" }].map((tab) => <button key={tab.id} disabled={busy} onClick={() => setApprovalTab(tab.id)} className={"rounded-lg px-4 py-2 text-sm font-semibold transition-colors " + (approvalTab === tab.id ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500")}>{tab.label}</button>)}</div><label className="text-xs text-gray-500">Cari karyawan<input className={inputClass + " mt-1"} placeholder="ID Karyawan atau Nama" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} /></label></div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm"><table className="w-full min-w-[1200px] border-collapse text-xs"><thead className="bg-[#1A284F] text-white"><tr>{["ID Karyawan", "Nama", "Unit Usaha", "Divisi", "Departemen", "Bagian", "Jabatan", "Status", "Aksi"].map((label) => <th key={label} className="border border-[#1A284F]/30 px-3 py-3 text-left font-semibold">{label}</th>)}</tr></thead><tbody>{filteredApprovalDocuments.map((record) => { const employee = simulationEmployees.find((entry) => entry.id === record.employeeId)!; return <tr key={record.employeeId} className={document?.employeeId === record.employeeId ? "bg-blue-50/50" : "hover:bg-gray-50"}>{[employee.id, employee.name, employee.companyUnit, employee.division, employee.department, "—", employee.position].map((value, index) => <td key={index} className="border border-gray-200 px-3 py-3 text-gray-600">{value}</td>)}<td className="border border-gray-200 px-3 py-3"><span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{record.status}</span></td><td className="border border-gray-200 px-3 py-3"><button disabled={busy} className="font-semibold text-[#1A284F] hover:underline disabled:opacity-40" onClick={() => selectDocument(record)}>Lihat detail</button></td></tr>; })}{!filteredApprovalDocuments.length && <tr><td colSpan={9} className="border border-gray-200 px-4 py-8 text-center text-gray-500">{approvalTab === "pending" ? "Tidak ada pengajuan KPI Setting yang berstatus Pending pada saat ini." : approvalTab === "validated" ? "Belum ada pengajuan KPI Setting yang berstatus Validated." : "Tidak ada pengajuan KPI Setting yang cocok dengan filter."}</td></tr>}</tbody></table></div><p className="text-xs text-gray-400">Hanya menampilkan pengajuan karyawan lain sesuai kewenangan pemeriksaan/persetujuan akun ini.</p>
          </section>}
            {view === "notifications" && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-3 text-sm font-semibold">Notifikasi akun ini</h2>
              {!overview?.notifications.length && <p className="text-xs text-slate-500">Belum ada notifikasi.</p>}
              {overview?.notifications.map((notification) => <div key={notification.id} className="border-t border-slate-100 py-3 text-xs"><p className="font-medium">{notification.payload.module} · {notification.payload.employeeId}</p><p>{notification.payload.status}</p><p className="mt-1 text-slate-500">{formatDate(notification.created_at)}</p></div>)}
            </section>}</aside>
          {(view === "setting" || view === "approvals-setting") && document && <section className="min-w-0 space-y-6 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">KPI Setting · 2026</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{document.status} · versi {document.version}</span></div>
            <IdentityFields document={document} />
            <p className="text-xs text-slate-500">Bobot modul KPI snapshot: {document.snapshot.weights.kpi}%. Bobot indikator harus tepat 100%; ini berbeda dari bobot modul.</p>
            <ol className="flex flex-wrap gap-2">{document.stages.map((assigned, index) => <li key={assigned.stage} className={`rounded-lg border px-3 py-2 text-xs ${index === document.activeStage ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}>{assigned.stage} · {assigned.actorId}{assigned.stage === "approver-1" && document.mirrorSecondSlot ? " (A1 + A2)" : ""}</li>)}</ol>
            <p className="text-xs text-slate-500">Jadwal: {overview?.windows.find((window) => window.unitId === document.snapshot.unitId)?.startDate ?? "Belum dibuka HR Strategic"} — {overview?.windows.find((window) => window.unitId === document.snapshot.unitId)?.endDate ?? "—"} WIB</p>
            <KPISettingTable items={tableItems} editable={editable && !preview && !busy} sectionWeights={{ A: displayedItems.filter((item) => item.presentation?.section === "A").reduce((sum, item) => sum + item.weight, 0), B: displayedItems.filter((item) => item.presentation?.section !== "A").reduce((sum, item) => sum + item.weight, 0) }} onEdit={(record) => { if (ownDocument && selected !== ownDocument.employeeId) selectDocument(ownDocument); setEditingIndex(displayedItems.findIndex((item) => item.id === record.id)); }} onDelete={(id) => { if (window.confirm("Hapus indikator KPI ini dari draft?")) setItems((records) => records.filter((item) => item.id !== id)); }} />
            {!!displayedItems.length && <div className="flex flex-wrap items-center gap-3"><label className="text-xs text-gray-500">Detail / target bulanan<select className={inputClass + " ml-2 inline-block w-auto"} value="" onChange={(event) => { if (document && selected !== document.employeeId) selectDocument(document); setEditingIndex(Number(event.target.value)); }}><option value="" disabled>Pilih indikator</option>{displayedItems.map((item, index) => <option key={item.id} value={index}>{index + 1}. {item.subject || "KPI baru"}</option>)}</select></label><span className="text-xs text-gray-400">{preview || !editable ? "Preview · data read-only" : "Target setahun dihitung dari target bulanan."}</span></div>}
            {editingIndex !== null && <Dialog.Root open onOpenChange={(open) => { if (!open) closeKpiEditor(); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-40 flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-100 px-6 py-4"><div><Dialog.Title className="text-lg font-bold text-[#1A284F]">{addingKpi ? "Tambah KPI" : editable && !preview ? "Edit KPI" : "Detail KPI"}</Dialog.Title><Dialog.Description className="text-xs text-gray-500">Target bulanan dan informasi indikator</Dialog.Description></div><button aria-label="Tutup detail KPI" disabled={busy} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" onClick={() => closeKpiEditor()}><X size={20} /></button></div><div className="overflow-y-auto p-6">
            {items.map((item, index) => editingIndex === index && <fieldset key={item.id} disabled={!editable || preview || busy} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between"><legend className="text-sm font-semibold">Indikator {index + 1}</legend></div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs">Subjek KPI<input className={inputClass + " mt-1"} value={item.subject} onChange={(event) => patchItem(index, { subject: event.target.value })} /></label>
                <label className="text-xs">Satuan<input className={inputClass + " mt-1"} value={item.unit} onChange={(event) => patchItem(index, { unit: event.target.value })} /></label>
                <label className="text-xs">Bobot indikator (%)<input className={inputClass + " mt-1"} type="number" min="0" max="100" step="1" value={item.weight} onChange={(event) => patchItem(index, { weight: Number(event.target.value) })} /></label>
                <label className="text-xs">Definisi<textarea className={inputClass + " mt-1"} value={item.definition} onChange={(event) => patchItem(index, { definition: event.target.value })} /></label>
                <label className="text-xs">Sumber data<textarea className={inputClass + " mt-1"} value={item.source} onChange={(event) => patchItem(index, { source: event.target.value })} /></label>
                <div className="space-y-2"><label className="block text-xs">Polaritas<select className={inputClass + " mt-1"} value={item.polarity} onChange={(event) => patchItem(index, { polarity: event.target.value as KpiItem["polarity"] })}><option value="maximize">Maksimalisasi</option><option value="minimize">Minimalisasi</option></select></label>
                  <label className="block text-xs">Formula setahun<select className={inputClass + " mt-1"} value={item.formula} onChange={(event) => patchItem(index, { formula: event.target.value as KpiItem["formula"] })}><option value="sum">Jumlah</option><option value="average">Rata-rata</option><option value="last">Nilai Akhir</option></select></label></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">{(["perspective", "baseline", "formulaDetail", "notes"] as const).map((field) => <label key={field} className="text-xs">{({ perspective: "Perspektif", baseline: "Baseline 2025", formulaDetail: "Detail Formula Pencapaian", notes: "Keterangan" })[field]}<textarea className={inputClass + " mt-1"} value={item.presentation?.[field] ?? ""} onChange={(event) => patchItem(index, { presentation: { section: item.presentation?.section ?? "B", perspective: item.presentation?.perspective ?? "", baseline: item.presentation?.baseline ?? "", formulaDetail: item.presentation?.formulaDetail ?? "", notes: item.presentation?.notes ?? "", [field]: event.target.value } })} /></label>)}<label className="text-xs">Kelompok KPI<select className={inputClass + " mt-1"} value={item.presentation?.section ?? "B"} onChange={(event) => patchItem(index, { presentation: { section: event.target.value as "A" | "B", perspective: item.presentation?.perspective ?? "", baseline: item.presentation?.baseline ?? "", formulaDetail: item.presentation?.formulaDetail ?? "", notes: item.presentation?.notes ?? "" } })}><option value="A">A. Objective KPI</option><option value="B">B. Functional KPI</option></select></label></div>
              <p className="text-xs text-slate-500">Isi target bulanan; jika tidak dijadwalkan, kosongkan target dan isi alasan. Nol aktual tidak digunakan pada Setting.</p>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">{item.months.map((month, monthIndex) => <div key={monthIndex} className="rounded-lg bg-slate-50 p-2"><label className="text-xs font-medium">{months[monthIndex]}<input aria-label={`Target ${months[monthIndex]} indikator ${index + 1}`} className={inputClass + " mt-1"} type="number" min="0" step="any" value={month.target ?? ""} onChange={(event) => patchItem(index, { months: item.months.map((record, recordIndex) => recordIndex === monthIndex ? { target: event.target.value === "" ? null : Number(event.target.value), notApplicableReason: "" } : record) })} /></label>
                {month.target === null && <input aria-label={`Alasan tidak dijadwalkan ${months[monthIndex]} indikator ${index + 1}`} placeholder="Alasan tidak dijadwalkan" className={inputClass + " mt-1"} value={month.notApplicableReason} onChange={(event) => patchItem(index, { months: item.months.map((record, recordIndex) => recordIndex === monthIndex ? { ...record, notApplicableReason: event.target.value } : record) })} />}</div>)}</div>
              <p className="text-sm font-medium">Target setahun: {aggregateTarget(item)?.toLocaleString("id-ID") ?? "Tidak berlaku"}</p>
            </fieldset>)}
</div><div className="flex items-center justify-between border-t border-gray-100 px-6 py-4"><p className="text-xs text-gray-400">Perubahan belum tersimpan di Supabase sampai Simpan draft / Submit KPI.</p><div className="flex gap-2"><button disabled={busy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm" onClick={() => closeKpiEditor()}>Batal</button><button disabled={busy} className={buttonClass} onClick={() => closeKpiEditor(false)}>{addingKpi ? "Tambahkan KPI ke draft" : "Selesai"}</button></div></div></Dialog.Content></Dialog.Portal></Dialog.Root>}
            {!displayedItems.length && <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 py-10 text-center"><p className="font-semibold text-[#1A284F]">Belum ada indikator KPI</p><p className="text-sm text-gray-500">{editable ? "Mulai mengisi KPI melalui modal Tambah KPI." : "Data KPI belum tersedia pada pengajuan ini."}</p>{editable && !preview && <button type="button" disabled={busy} className={buttonClass + " flex items-center gap-2"} onClick={() => { if (ownDocument && selected !== ownDocument.employeeId) selectDocument(ownDocument); openAddKpi(); }}><Plus size={16} /> Tambah KPI pertama</button>}</div>}
            {editable && !preview && <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={busy} className="flex items-center gap-2 rounded-lg border border-[#1A284F] px-4 py-2 text-sm font-semibold text-[#1A284F] disabled:opacity-40" onClick={openAddKpi}><Plus size={16} /> Tambah KPI</button><strong className="text-sm">Total bobot: {items.reduce((total, item) => total + item.weight, 0)}%</strong><button disabled={busy} className={buttonClass} onClick={() => void act("save")}>Simpan draft</button><button disabled={busy} className={buttonClass} onClick={() => setConfirmation("submit")}>{document.revisionStage !== null ? "Submit ulang revisi" : "Submit KPI Setting"}</button></div>}
            {actionable && <div className="space-y-3 border-t border-slate-200 pt-4"><label className="block text-sm">Catatan pemeriksaan / alasan revisi<textarea className={inputClass + " mt-1"} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></label>
              <div className="flex gap-2"><button className={buttonClass} disabled={busy} onClick={() => setConfirmation("advance")}>{stage?.stage === "checker" ? "Checked / Teruskan" : stage?.stage === "validator" ? "Validasi" : document.mirrorSecondSlot && stage?.stage === "approver-1" ? "Setujui sebagai GM (A1 + A2)" : "Setujui / Teruskan"}</button>
                <button className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 disabled:opacity-40" disabled={busy || !note.trim()} onClick={() => setConfirmation("revise")}>Minta revisi</button></div></div>}
            <section className="border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">History approval</h3><div className="mt-3 space-y-2">{document.history.filter((event) => event.action !== "save").map((event, index) => <div key={`${event.version}-${index}`} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-medium">{event.status === "Pending-Checker" ? "Pending-Checking" : event.status} · {event.actorId} · {event.stage ?? "Submission karyawan"}{event.mirrored ? " · slot otomatis" : ""}</p><p className="mt-1 text-slate-500">{formatDate(event.at)} · versi {event.version}</p>{event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}</div>)}</div></section>
          </section>}
        </div>
      </>}
    </div>
    {confirmation && <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl"><Dialog.Title className="text-lg font-bold text-[#1A284F]">Konfirmasi tindakan</Dialog.Title><Dialog.Description className="mt-3 text-sm text-gray-500">{confirmation === "submit" ? "Submit data KPI ini untuk pemeriksaan? Data terkunci setelah submission." : confirmation === "revise" ? "Kembalikan pengajuan kepada karyawan? Submit ulang akan kembali ke tahap Anda." : "Teruskan keputusan tahap aktif? Keputusan dan history akan tersimpan."}</Dialog.Description><div className="mt-6 flex justify-end gap-2"><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={busy} onClick={() => setConfirmation(null)}>Batal</button><button className={buttonClass} disabled={busy} onClick={() => void act(confirmation)}>{busy ? "Menyimpan…" : "Konfirmasi"}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>}
  </AppFrame>;
}

function IdentityFields({ document }: { document: KpiDocument }) {
  const employee = simulationEmployees.find((record) => record.id === document.employeeId)!;
  const moduleLabels: Record<string, string> = {
    kpi: "KPI (Setting/Measurement)",
    "smart-goals": "SMART Goals (Setting/Measurement)",
    "appraisal-form": "Appraisal Form",
    project: "Project Outside Job Scope",
    "manager-skill": "Managerial Skill",
    "inter-department-feedback": "Inter-Department Feedback",
    "management-interview": "Management Interview",
    rca: "RCA",
  };
  const values = [employee.id, employee.name, employee.companyUnit, employee.division, employee.department, "—", employee.position];
  return <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{["ID Karyawan", "Nama", "Unit Usaha", "Divisi", "Departemen", "Bagian", "Jabatan"].map((label, index) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium">{values[index]}</dd></div>)}<div><dt className="text-xs text-slate-500">Group Level</dt><dd className="mt-1 text-sm font-medium capitalize">{employee.level}</dd></div></dl>
    <div className="border-t border-slate-200 pt-3"><p className="text-xs text-slate-500">Modul PA Sesuai Posisi/Jabatan & Rule Akses</p><div className="mt-2 flex flex-wrap gap-1.5">{employee.allowedModules.map((mod) => <span key={mod} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#1A284F] border border-blue-200">{moduleLabels[mod] ?? mod}</span>)}</div></div>
  </div>;
}
