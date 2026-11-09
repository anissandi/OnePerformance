import React, { useState, useRef } from "react";
import {
  FolderKanban, TrendingUp, CheckCircle2, AlertTriangle, Clock,
  XCircle, Edit3, X, Save, AlertCircle, ChevronRight, Paperclip, UploadCloud, Trash2, FileText,
} from "lucide-react";
import {
  projectStore,
  useProjectStore,
  CATEGORY_META,
  SCOPE_BOBOT,
  type ProjectEntry,
  type CheckInStatus,
} from "../../store/projectStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScopeBobot(scope: ProjectEntry["scope"]): number {
  return SCOPE_BOBOT[scope] ?? 0;
}

const CHECK_IN_STATUS_META: Record<CheckInStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  not_started: { label: "Not Started",  color: "text-gray-500",   bg: "bg-gray-100",   border: "border-gray-200",   icon: <Clock className="w-3.5 h-3.5" /> },
  on_track:    { label: "On Track",     color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200",  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  at_risk:     { label: "At Risk",      color: "text-orange-600", bg: "bg-orange-50",  border: "border-orange-200", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  completed:   { label: "Completed",    color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",   icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelled:   { label: "Cancelled",    color: "text-red-600",    bg: "bg-red-50",     border: "border-red-200",    icon: <XCircle className="w-3.5 h-3.5" /> },
};

function CheckInBadge({ status }: { status: CheckInStatus }) {
  const { label, color, bg, border, icon } = CHECK_IN_STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${bg} ${color} ${border}`}>
      {icon} {label}
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 100 ? "bg-blue-500" : clamped >= 50 ? "bg-green-500" : clamped > 0 ? "bg-amber-400" : "bg-gray-200";
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

// ─── Check-In Update Modal ────────────────────────────────────────────────────

function CheckInModal({ project, onSave, onClose }: {
  project: ProjectEntry;
  onSave: (updated: ProjectEntry) => void;
  onClose: () => void;
}) {
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus>(project.checkInStatus);
  const [progressPercent, setProgressPercent] = useState(project.progressPercent);
  const [progressNotes, setProgressNotes] = useState(project.progressNotes);
  const [actualOutput, setActualOutput] = useState(project.actualOutput);
  const [note, setNote] = useState(project.note);
  const [evidenceFiles, setEvidenceFiles] = useState<Array<{ name: string; size: number; type: string; dataUrl: string }>>(project.evidenceFiles ?? []);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEvidenceFiles((prev) => [
          ...prev,
          { name: file.name, size: file.size, type: file.type, dataUrl: e.target?.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSave = () => {
    onSave({
      ...project,
      checkInStatus,
      progressPercent,
      progressNotes,
      actualOutput,
      note,
      evidenceFiles,
      lastUpdated: new Date().toISOString().slice(0, 10),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-[#1A284F] text-base">Update Check-In</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{project.projectName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          {/* Project info pill */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${CATEGORY_META[project.category].bg}`}>
            <span className={`text-xs font-semibold ${CATEGORY_META[project.category].color}`}>{project.category}</span>
            <ChevronRight className="w-3 h-3 text-gray-400" />
            <span className="text-xs text-gray-600">{project.scope}</span>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Check-In Status</label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(Object.keys(CHECK_IN_STATUS_META) as CheckInStatus[]).map((s) => {
                const { label, color, bg, border, icon } = CHECK_IN_STATUS_META[s];
                const active = checkInStatus === s;
                return (
                  <button key={s} type="button" onClick={() => setCheckInStatus(s)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 text-[10px] font-semibold transition-all ${
                      active ? `border-[#1A284F] ${bg} ${color}` : "border-gray-200 text-gray-400 hover:border-gray-300"
                    }`}>
                    {icon}
                    <span className="text-center leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progress */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Progress <span className="normal-case font-normal text-gray-400 ml-1">{progressPercent}%</span>
            </label>
            <input type="range" min={0} max={100} step={5} value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
              className="w-full accent-[#1A284F]" />
            <ProgressBar percent={progressPercent} />
          </div>

          {/* Progress Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Progress Notes / Update</label>
            <textarea rows={3} value={progressNotes} onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Describe what has been accomplished, current challenges, next steps…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          {/* Actual Output */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Actual Output / Result Achieved</label>
            <textarea rows={2} value={actualOutput} onChange={(e) => setActualOutput(e.target.value)}
              placeholder="Describe the measurable results achieved so far…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Note</label>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Add any additional notes or remarks…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          {/* Upload Evidence */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Upload Evidence</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition-colors ${
                dragging ? "border-[#1A284F] bg-[#1A284F]/5" : "border-gray-200 hover:border-[#1A284F]/50 bg-gray-50"
              }`}>
              <UploadCloud className="w-6 h-6 text-gray-400" />
              <p className="text-xs text-gray-500 text-center">
                Drag & drop files here, or <span className="text-[#1A284F] font-semibold">browse</span>
              </p>
              <p className="text-[10px] text-gray-400">Any file type accepted</p>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />

            {evidenceFiles.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-1">
                {evidenceFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{f.name}</p>
                      <p className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i)); }}
                      className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expected output reference */}
          {project.expectedOutput && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Target / Expected Output (from Setting)</p>
              <p className="text-xs text-gray-600 leading-relaxed">{project.expectedOutput}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
            <Save className="w-4 h-4" /> Save Update
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Check-In Card ────────────────────────────────────────────────────

function ProjectCheckInCard({ project, onUpdate }: {
  project: ProjectEntry;
  onUpdate: () => void;
}) {
  const { color, bg } = CATEGORY_META[project.category];
  const bobot = getScopeBobot(project.scope);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className={`flex items-center justify-between px-5 py-3 ${bg}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${color}`}>{project.category}</span>
          <span className="text-gray-400 text-xs">•</span>
          <span className="text-xs text-gray-600 font-medium">{project.scope}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-[#1A284F] text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold">Bobot {bobot}%</span>
          <CheckInBadge status={project.checkInStatus} />
          {project.status === "submitted" || project.status === "approved" ? (
            <button onClick={onUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors ml-1">
              <Edit3 className="w-3 h-3" /> Update
            </button>
          ) : null}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Project Name</p>
            <p className="text-sm font-semibold text-[#1A284F]">{project.projectName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Role</p>
            <p className="text-xs text-gray-600">{project.role}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Progress</p>
            <span className="text-xs font-bold text-[#1A284F]">{project.progressPercent}%</span>
          </div>
          <ProgressBar percent={project.progressPercent} />
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Start Date</p>
            <p className="text-gray-700">{project.startDate || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">End Date</p>
            <p className="text-gray-700">{project.endDate || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Last Updated</p>
            <p className="text-gray-700">{project.lastUpdated || "—"}</p>
          </div>
        </div>

        {/* Two-column detail */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Expected Output (Target)</p>
            <p className="text-xs text-gray-600 leading-relaxed">{project.expectedOutput || "—"}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Actual Output (So Far)</p>
            <p className="text-xs text-gray-600 leading-relaxed">{project.actualOutput || "—"}</p>
          </div>
        </div>

        {project.progressNotes && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Progress Notes</p>
            <p className="text-xs text-gray-600 leading-relaxed">{project.progressNotes}</p>
          </div>
        )}

        {project.note && (
          <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500 mb-1">Note</p>
            <p className="text-xs text-amber-800 leading-relaxed">{project.note}</p>
          </div>
        )}

        {project.evidenceFiles && project.evidenceFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Evidence Files</p>
            <div className="flex flex-col gap-1">
              {project.evidenceFiles.map((f, i) => (
                <a key={i} href={f.dataUrl} download={f.name}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 hover:border-[#1A284F]/30 transition-colors group">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#1A284F]" />
                  <span className="text-xs text-gray-700 truncate flex-1">{f.name}</span>
                  <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(1)} KB</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Not-submitted notice */}
        {project.status === "draft" && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            This project has not been submitted for approval yet. Go to <strong className="ml-0.5">Performance Appraisal Setting → Project Outside Job Scope</strong> to submit.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats({ projects }: { projects: ProjectEntry[] }) {
  const total = projects.length;
  const statusCounts = projects.reduce((acc, p) => {
    acc[p.checkInStatus] = (acc[p.checkInStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<CheckInStatus, number>);
  const avgProgress = total > 0 ? Math.round(projects.reduce((s, p) => s + p.progressPercent, 0) / total) : 0;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1A284F]/5 rounded-xl">
        <FolderKanban className="w-4 h-4 text-[#1A284F]" />
        <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Total Projects</span>
        <span className="text-lg font-bold text-[#1A284F]">{total}</span>
      </div>
      {(["on_track", "at_risk", "completed", "not_started"] as CheckInStatus[]).map((s) => {
        const count = statusCounts[s] ?? 0;
        if (count === 0) return null;
        const { label, color, bg } = CHECK_IN_STATUS_META[s];
        return (
          <div key={s} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${bg}`}>
            <span className={`text-xs font-bold uppercase tracking-wide ${color}`}>{label}</span>
            <span className={`text-lg font-bold ${color}`}>{count}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 rounded-xl">
        <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Avg. Progress</span>
        <span className="text-lg font-bold text-indigo-700">{avgProgress}%</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProjectCheckInPage() {
  const { projects, submitted } = useProjectStore();
  const [updatingProject, setUpdatingProject] = useState<ProjectEntry | null>(null);

  const handleSaveUpdate = (updated: ProjectEntry) => {
    projectStore.updateProject(updated);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Project Outside Job Scope — Check-In</h1>
          <p className="text-gray-500 text-sm">Track and update the progress of your registered projects</p>
        </div>
      </div>

      {/* No-data notice */}
      {projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <FolderKanban className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-400 mb-1">No projects registered yet</p>
          <p className="text-xs text-gray-400 text-center max-w-xs">
            Go to <strong>Performance Appraisal Setting → Project Outside Job Scope</strong> to add and submit your projects first.
          </p>
        </div>
      )}

      {/* Not submitted banner */}
      {projects.length > 0 && !submitted && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Your projects have not been submitted for approval yet. Submit them in <strong className="ml-0.5">Performance Appraisal Setting → Project Outside Job Scope</strong> to enable check-in updates.
        </div>
      )}

      {projects.length > 0 && (
        <>
          <SummaryStats projects={projects} />
          <div className="flex flex-col gap-4">
            {projects.map((p) => (
              <ProjectCheckInCard key={p.id} project={p} onUpdate={() => setUpdatingProject(p)} />
            ))}
          </div>
        </>
      )}

      {updatingProject && (
        <CheckInModal
          project={updatingProject}
          onSave={handleSaveUpdate}
          onClose={() => setUpdatingProject(null)}
        />
      )}
    </div>
  );
}
