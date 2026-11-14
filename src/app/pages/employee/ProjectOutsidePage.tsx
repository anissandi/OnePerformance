import React, { useState } from "react";
import { DatePickerID } from "../../components/DatePickerID";
import {
  Eye, Send, CheckCircle2, Edit3, Plus, Trash2, X, FolderKanban,
  Users, Lightbulb, Award, ClipboardList,
} from "lucide-react";
import {
  projectStore,
  useProjectStore,
  CATEGORY_META,
  SCOPE_BY_CATEGORY,
  ROLE_OPTIONS,
  SCOPE_BOBOT,
  type ProjectEntry,
  type ProjectCategory,
  type ProjectScope,
  type ProjectStatus,
} from "../../store/projectStore";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import { submitWorkflowModule } from "../shared/appraisalWorkflowStore";

type PageView = "input" | "preview";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScopeBobot(scope: ProjectScope): number {
  return SCOPE_BOBOT[scope] ?? 0;
}

function statusBadge(status: ProjectStatus) {
  const map: Record<ProjectStatus, { label: string; cls: string }> = {
    draft:     { label: "Draft",            cls: "bg-gray-100 text-gray-600" },
    submitted: { label: "Pending Approval", cls: "bg-amber-100 text-amber-700" },
    approved:  { label: "Approved",         cls: "bg-green-100 text-green-700" },
    rejected:  { label: "Rejected",         cls: "bg-red-100 text-red-700" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>
  );
}

// ─── Confirm / Success Modals ─────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">
          Are you sure you want to submit the Project Outside Job Scope for approval?
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">Your projects have been submitted for approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Project Form Modal ───────────────────────────────────────────────────────

interface ProjectFormProps {
  initial?: ProjectEntry;
  nextNo: number;
  onSave: (p: ProjectEntry) => void;
  onClose: () => void;
}

function ProjectFormModal({ initial, nextNo, onSave, onClose }: ProjectFormProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState<Omit<ProjectEntry, "id" | "status" | "checkInStatus" | "progressPercent" | "progressNotes" | "actualOutput" | "lastUpdated">>(() => ({
    no: initial?.no ?? nextNo,
    category: initial?.category ?? "Improvement Project",
    scope: initial?.scope ?? 'SS - "Small Idea Kaizen"',
    projectName: initial?.projectName ?? "",
    description: initial?.description ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    role: initial?.role ?? "Member / Anggota",
    expectedOutput: initial?.expectedOutput ?? "",
  }));

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleCategoryChange = (cat: ProjectCategory) => {
    const firstScope = SCOPE_BY_CATEGORY[cat][0].scope;
    setForm((prev) => ({ ...prev, category: cat, scope: firstScope }));
  };

  const scopeOptions = SCOPE_BY_CATEGORY[form.category];
  const bobot = getScopeBobot(form.scope);
  const canSave = form.projectName.trim() && form.description.trim() && form.startDate && form.endDate;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: initial?.id ?? `proj-${Date.now()}`,
      status: initial?.status ?? "draft",
      checkInStatus: initial?.checkInStatus ?? "not_started",
      progressPercent: initial?.progressPercent ?? 0,
      progressNotes: initial?.progressNotes ?? "",
      actualOutput: initial?.actualOutput ?? "",
      lastUpdated: initial?.lastUpdated ?? "",
      ...form,
    });
    onClose();
  };

  const CATEGORY_ICONS: Record<ProjectCategory, React.ReactNode> = {
    "Improvement Project": <Lightbulb className="w-4 h-4" />,
    "Corporate Event":     <Award className="w-4 h-4" />,
    "Komite/Task Force":   <Users className="w-4 h-4" />,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-[#1A284F] text-lg">{isEdit ? "Edit Project" : "Add New Project"}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 max-h-[72vh] overflow-y-auto">
          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Project Category <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_META) as ProjectCategory[]).map((cat) => {
                const { color, bg } = CATEGORY_META[cat];
                const active = form.category === cat;
                return (
                  <button key={cat} type="button" onClick={() => handleCategoryChange(cat)}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                      active ? `border-[#1A284F] ${bg} ${color}` : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                    }`}>
                    {CATEGORY_ICONS[cat]}
                    <span className="text-center leading-tight">{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scope */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Project Scope / Type <span className="text-red-400">*</span>
            </label>
            <select value={form.scope} onChange={(e) => set("scope", e.target.value as ProjectScope)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] bg-white">
              {scopeOptions.map(({ scope, bobot: b }) => (
                <option key={scope} value={scope}>{scope} — Bobot {b}%</option>
              ))}
            </select>
            {bobot > 0 && (
              <p className="text-xs text-[#1A284F] font-semibold">
                Weight contribution: <span className="bg-[#1A284F] text-white px-2 py-0.5 rounded-full text-[10px]">{bobot}%</span>
              </p>
            )}
          </div>

          {/* Project Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input value={form.projectName} onChange={(e) => set("projectName", e.target.value)}
              placeholder="Enter the project name"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F]" />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Project Description <span className="text-red-400">*</span>
            </label>
            <textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the background, objectives, and scope of this project…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Start Date <span className="text-red-400">*</span></label>
              <DatePickerID value={form.startDate} onChange={(iso) => set("startDate", iso)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">End Date <span className="text-red-400">*</span></label>
              <DatePickerID value={form.endDate} onChange={(iso) => set("endDate", iso)} />
            </div>
          </div>

          {/* Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Your Role <span className="text-red-400">*</span></label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] bg-white">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Expected Output */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Expected Output / Target Result</label>
            <textarea rows={3} value={form.expectedOutput} onChange={(e) => set("expectedOutput", e.target.value)}
              placeholder="Describe the measurable output or target result of this project…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Plus className="w-4 h-4" />
            {isEdit ? "Save Changes" : "Add Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, editable, onEdit, onDelete }: {
  project: ProjectEntry;
  editable: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { color, bg } = CATEGORY_META[project.category];
  const bobot = getScopeBobot(project.scope);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className={`flex items-center justify-between px-5 py-3 ${bg}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${color}`}>{project.category}</span>
          <span className="text-gray-400 text-xs">•</span>
          <span className="text-xs text-gray-600 font-medium">{project.scope}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-[#1A284F] text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold">Bobot {bobot}%</span>
          {statusBadge(project.status)}
          {editable && (
            <div className="flex items-center gap-1 ml-1">
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-white/60 transition-colors text-[#1A284F]" title="Edit">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-400 hover:text-red-600" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Project Name</p>
          <p className="text-sm font-semibold text-[#1A284F]">{project.projectName}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Description</p>
          <p className="text-sm text-gray-600 leading-relaxed">{project.description}</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Start Date</p>
            <p className="text-sm text-gray-700">{project.startDate || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">End Date</p>
            <p className="text-sm text-gray-700">{project.endDate || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Your Role</p>
            <p className="text-sm text-gray-700">{project.role}</p>
          </div>
        </div>
        {project.expectedOutput && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Expected Output</p>
            <p className="text-sm text-gray-600 leading-relaxed">{project.expectedOutput}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Category Reference Table ─────────────────────────────────────────────────

function CategoryReferenceTable() {
  const rows = [
    { no: 1,  category: "Improvement Project", scope: 'Suggestion System (SS) - "Small Idea Kaizen"', bobot: "15%" },
    { no: "",  category: "", scope: 'Quality Control Circle (QCC) - "Small Group Activity"', bobot: "25%" },
    { no: "",  category: "", scope: 'Quality Control Project (QCP) - "Cross Functional Kaizen Team"', bobot: "40%" },
    { no: 2,  category: "Corporate Event", scope: "Corporate Activity (Event, Engagement, Culture)", bobot: "10%" },
    { no: 3,  category: "Komite/Task Force", scope: "Komite P2K3, Komite Food Safety, Komite Lean/CI, Komite lainnya, Tim Gugus Tugas", bobot: "10%" },
  ];
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="py-3 px-4 text-center font-semibold border border-[#1A284F]/30 w-12">No</th>
            <th className="py-3 px-4 text-left font-semibold border border-[#1A284F]/30 w-44">Project</th>
            <th className="py-3 px-4 text-center font-semibold border border-[#1A284F]/30">Scope</th>
            <th className="py-3 px-4 text-center font-semibold border border-[#1A284F]/30 w-20">Bobot</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
              <td className="py-2.5 px-4 text-center border border-gray-200 font-semibold text-gray-600">{row.no}</td>
              <td className="py-2.5 px-4 border border-gray-200 font-medium text-gray-700">{row.category}</td>
              <td className="py-2.5 px-4 text-center border border-gray-200 text-gray-600">{row.scope}</td>
              <td className="py-2.5 px-4 text-center border border-gray-200">
                {row.bobot && <span className="bg-[#1A284F] text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold">{row.bobot}</span>}
              </td>
            </tr>
          ))}
          <tr className="bg-[#1A284F] text-white">
            <td colSpan={3} className="py-2.5 px-4 text-center font-bold border border-[#1A284F]/30">Total</td>
            <td className="py-2.5 px-4 text-center font-bold border border-[#1A284F]/30">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProjectOutsidePage() {
  const { projects, submitted } = useProjectStore();
  const [view, setView] = useState<PageView>("input");
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectEntry | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showReference, setShowReference] = useState(false);

  const handleAdd = (p: ProjectEntry) => projectStore.addProject(p);
  const handleEdit = (p: ProjectEntry) => projectStore.updateProject(p);
  const handleDelete = (id: string) => projectStore.deleteProject(id);

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    projectStore.submitAll();
    submitWorkflowModule("Project", "measurement");
    setView("preview");
  };

  const totalBobot = projects.reduce((sum, p) => sum + getScopeBobot(p.scope), 0);
  const requirementMet = projects.length >= 1;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Project Outside Job Scope</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — Each employee must register and run at least 1 project per year</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setShowReference((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <ClipboardList className="w-4 h-4" />
            {showReference ? "Hide" : "View"} Category Reference
          </button>
          {view === "input" && !submitted && (
            <>
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors">
                <Plus className="w-4 h-4" /> Add Project
              </button>
              <button onClick={() => setView("preview")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button onClick={() => setShowConfirm(true)} disabled={!requirementMet}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={!requirementMet ? "At least 1 project is required" : ""}>
                <Send className="w-4 h-4" /> Submit Project
              </button>
            </>
          )}
          {view === "preview" && !submitted && (
            <>
              <button onClick={() => setView("input")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                <Edit3 className="w-4 h-4" /> Back to Edit
              </button>
              <button onClick={() => setShowConfirm(true)} disabled={!requirementMet}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Send className="w-4 h-4" /> Submit Project
              </button>
            </>
          )}
        </div>
      </div>

      <ModuleApprovalStatusBar
        module="Project"
        phase="measurement"
        submittedOverride={submitted}
      />

      {showReference && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Project Category & Scope Reference</p>
          <CategoryReferenceTable />
        </div>
      )}

      {view === "preview" && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
          submitted ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          {submitted ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
          {submitted ? "Projects have been submitted and are pending approval." : "Preview mode — review all projects carefully before submitting."}
        </div>
      )}

      {/* Summary Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1A284F]/5 rounded-xl">
          <FolderKanban className="w-4 h-4 text-[#1A284F]" />
          <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Total Projects</span>
          <span className="text-lg font-bold text-[#1A284F]">{projects.length}</span>
        </div>
        {(Object.keys(CATEGORY_META) as ProjectCategory[]).map((cat) => {
          const count = projects.filter((p) => p.category === cat).length;
          if (count === 0) return null;
          const { color, bg } = CATEGORY_META[cat];
          return (
            <div key={cat} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${bg}`}>
              <span className={`text-xs font-bold uppercase tracking-wide ${color}`}>{cat}</span>
              <span className={`text-lg font-bold ${color}`}>{count}</span>
            </div>
          );
        })}
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${projects.length >= 1 ? "bg-green-50" : "bg-orange-50"}`}>
          <span className={`text-xs font-bold uppercase tracking-wide ${projects.length >= 1 ? "text-green-700" : "text-orange-700"}`}>Min. Requirement</span>
          {projects.length >= 1
            ? <CheckCircle2 className="w-4 h-4 text-green-600" />
            : <span className="text-xs text-orange-600 font-medium">At least 1 project needed</span>}
        </div>
        {totalBobot > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 rounded-xl">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Total Bobot</span>
            <span className="text-lg font-bold text-blue-700">{totalBobot}%</span>
          </div>
        )}
      </div>

      {/* Project Cards */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <FolderKanban className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-400 mb-1">No projects added yet</p>
          <p className="text-xs text-gray-400 mb-4">At least 1 project is required for appraisal</p>
          {view === "input" && !submitted && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
              <Plus className="w-4 h-4" /> Add First Project
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p}
              editable={view === "input" && !submitted}
              onEdit={() => setEditingProject(p)}
              onDelete={() => handleDelete(p.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <ProjectFormModal nextNo={projects.length + 1} onSave={handleAdd} onClose={() => setShowForm(false)} />
      )}
      {editingProject && (
        <ProjectFormModal initial={editingProject} nextNo={projects.length + 1} onSave={handleEdit} onClose={() => setEditingProject(null)} />
      )}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}
