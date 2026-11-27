import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Ban, CheckSquare, Eye, MessageSquarePlus, MessageSquare, Paperclip, Plus, Search, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  APP_FEEDBACK_EVENT,
  FEEDBACK_CATEGORIES,
  cancelOwnFeedback,
  createAppFeedback,
  feedbackStatusOf,
  followUpFeedback,
  followUpStatusOf,
  loadAppFeedback,
  readFeedbackAttachment,
  type AppFeedback,
  type FeedbackAttachment,
  type FeedbackCategory,
  type FollowUpDecision,
} from "../../store/appFeedbackStore";
import { useAuthStore } from "../../store/authStore";
import { normalizeEmployeeId } from "./appraisalWorkflowStore";
import { hasRolePermission } from "../hr/settings/AccessManagement";
import { EvidenceViewerModal } from "../../components/EvidenceViewerModal";
import { normalizeDateDDMMYYYY } from "../../utils/dateFormat";

const MAX_FILE = 3 * 1024 * 1024;

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? normalizeDateDDMMYYYY(iso)
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const FEEDBACK_STATUS_TONE: Record<string, string> = {
  Open: "bg-amber-50 text-amber-700 border-amber-200",
  Closed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancel: "bg-gray-100 text-gray-500 border-gray-200",
};
const FOLLOWUP_STATUS_TONE: Record<string, string> = {
  Done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "On Progress": "bg-sky-50 text-sky-700 border-sky-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Cancel: "bg-gray-100 text-gray-500 border-gray-200",
};

function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>;
}

function AttachmentList({ files, onView }: { files: FeedbackAttachment[]; onView: (f: FeedbackAttachment) => void }) {
  if (!files.length) return <span className="text-gray-300">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {files.map((f, i) => (
        <button
          key={`${f.name}-${i}`}
          type="button"
          onClick={() => onView(f)}
          className="inline-flex max-w-[180px] items-center gap-1 text-left text-[11px] font-medium text-indigo-700 hover:underline"
          title={f.name}
        >
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{f.name}</span>
        </button>
      ))}
    </div>
  );
}

function AttachmentPicker({ files, onChange }: { files: FeedbackAttachment[]; onChange: (f: FeedbackAttachment[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const handle = async (list: FileList | null) => {
    if (!list) return;
    const accepted: FeedbackAttachment[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE) {
        toast.error(`${file.name} melebihi 3 MB.`);
        continue;
      }
      const att = await readFeedbackAttachment(file);
      if (att) accepted.push(att);
    }
    onChange([...files, ...accepted]);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="flex flex-col gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
          <span className="flex-1 truncate text-gray-700">{f.name}</span>
          <button type="button" onClick={() => onChange(files.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-xs font-medium text-gray-500 hover:border-[#1A284F]/40 hover:text-[#1A284F]"
      >
        <Upload className="h-3.5 w-3.5" /> Upload lampiran (JPG, PNG, PDF, maks 3 MB)
      </button>
      <input ref={ref} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.xlsx,.docx" className="hidden" onChange={(e) => void handle(e.target.files)} />
    </div>
  );
}

function Drawer({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="font-bold text-[#1A284F]">{title}</h3>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">{children}</div>
        {footer && <div className="border-t border-gray-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

function FeedbackSummary({ f, onView }: { f: AppFeedback; onView: (a: FeedbackAttachment) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/70 p-4 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Pill label={f.category} tone="bg-indigo-50 text-indigo-700 border-indigo-200" />
        <Pill label={feedbackStatusOf(f)} tone={FEEDBACK_STATUS_TONE[feedbackStatusOf(f)]} />
        <span className="ml-auto text-gray-400">{fmtDate(f.createdAt)}</span>
      </div>
      <p className="font-semibold text-gray-800">{f.employeeName} · <span className="font-normal text-gray-500">{f.employeeId}</span></p>
      <p className="text-gray-500">{[f.company, f.division, f.department, f.position].filter(Boolean).join(" · ")}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{f.content}</p>
      <AttachmentList files={f.attachments} onView={onView} />
    </div>
  );
}

type Tab = "form" | "follow-up";

export function FeedbackPage({ tab }: { tab: Tab }) {
  const { activeUser, lockedUnits } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<AppFeedback[]>(() => loadAppFeedback());
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>(FEEDBACK_CATEGORIES[0]);
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<FeedbackAttachment[]>([]);
  const [viewing, setViewing] = useState<AppFeedback | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AppFeedback | null>(null);
  const [followTarget, setFollowTarget] = useState<AppFeedback | null>(null);
  const [decision, setDecision] = useState<FollowUpDecision>("Done");
  const [note, setNote] = useState("");
  const [followFiles, setFollowFiles] = useState<FeedbackAttachment[]>([]);
  const [preview, setPreview] = useState<FeedbackAttachment | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadAppFeedback());
    window.addEventListener(APP_FEEDBACK_EVENT, refresh);
    window.addEventListener("pa-db-hydrated", refresh);
    return () => {
      window.removeEventListener(APP_FEEDBACK_EVENT, refresh);
      window.removeEventListener("pa-db-hydrated", refresh);
    };
  }, []);

  const role = activeUser.role || "Employee";
  const canForm = hasRolePermission(role, "feedback_form");
  const canFollowUp = hasRolePermission(role, "feedback_followup");
  const activeTab: Tab = tab === "follow-up" && !canFollowUp ? "form" : tab;
  const base = useMemo(() => {
    const portalMatch = location.pathname.match(/^\/(hr|bod|supervisor|employee)(?=\/|$)/);
    return portalMatch ? `/${portalMatch[1]}` : "";
  }, [location.pathname]);
  const ownId = normalizeEmployeeId(activeUser.employeeId);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scoped =
      activeTab === "form"
        ? items.filter((f) => normalizeEmployeeId(f.employeeId) === ownId)
        : items.filter((f) => !lockedUnits || lockedUnits.length === 0 || lockedUnits.includes(f.company));
    return scoped.filter(
      (f) => !q || [f.content, f.category, f.employeeId, f.employeeName, f.company, f.division].some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [items, search, activeTab, ownId, lockedUnits]);

  const submitCreate = () => {
    if (!content.trim()) return;
    createAppFeedback({ category, content, attachments });
    toast.success("Feedback berhasil dikirim.");
    setCreateOpen(false);
    setContent("");
    setAttachments([]);
    setCategory(FEEDBACK_CATEGORIES[0]);
  };

  const openFollowUp = (f: AppFeedback) => {
    setFollowTarget(f);
    setDecision(f.followUp?.decision ?? "Done");
    setNote(f.followUp?.note ?? "");
    setFollowFiles(f.followUp?.attachments ?? []);
  };

  const submitFollowUp = () => {
    if (!followTarget || !note.trim()) return;
    followUpFeedback(followTarget.id, { decision, note, attachments: followFiles });
    toast.success(
      decision === "Done" ? "Feedback ditutup (Closed)." : decision === "Cancel" ? "Feedback dibatalkan." : "Follow-up disimpan (Pending).",
    );
    setFollowTarget(null);
  };

  const th = "px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-white whitespace-nowrap";
  const td = "px-3 py-3 text-xs text-gray-700 align-top";

  if (!canForm && !canFollowUp) {
    return <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">Anda tidak memiliki akses ke menu Help & Feedback.</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A284F]/8 text-[#1A284F]">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Help & Feedback</h1>
            <p className="mt-0.5 text-xs text-gray-400">Sampaikan kendala aplikasi, modul penilaian, atau masukan lainnya.</p>
          </div>
        </div>
        {activeTab === "form" && canForm && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1A284F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#131d3b]"
          >
            <Plus className="h-4 w-4" /> Buat Feedback
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
          {canForm && (
            <button
              onClick={() => navigate(`${base}/help-feedback/form`)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${activeTab === "form" ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Form Help & Feedback
            </button>
          )}
          {canFollowUp && (
            <button
              onClick={() => navigate(`${base}/help-feedback/follow-up`)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${activeTab === "follow-up" ? "bg-white text-[#1A284F] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              <CheckSquare className="h-3.5 w-3.5" /> Follow-Up Feedback
            </button>
          )}
        </div>
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari feedback…"
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {activeTab === "form" ? (
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="bg-[#1A284F]">
                  <th className={th}>Aksi</th>
                  <th className={th}>Tanggal</th>
                  <th className={th}>Kategori</th>
                  <th className={th}>Isi Feedback</th>
                  <th className={th}>Lampiran</th>
                  <th className={th}>Status Feedback</th>
                  <th className={th}>Status Follow-Up</th>
                  <th className={th}>Catatan</th>
                  <th className={th}>Lampiran Follow-Up</th>
                  <th className={th}>Tanggal Follow-Up</th>
                  <th className={th}>Follow-Up By</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={11} className="py-16 text-center text-xs text-gray-400">Belum ada feedback. Klik "Buat Feedback" untuk mengirim.</td></tr>
                ) : (
                  rows.map((f) => {
                    const fs = feedbackStatusOf(f);
                    const fus = followUpStatusOf(f);
                    const cancellable = fs === "Open" && fus === "On Progress";
                    return (
                      <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className={td}>
                          <div className="flex items-center gap-1">
                            <button title="Lihat" onClick={() => setViewing(f)} className="rounded-lg p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600"><Eye className="h-4 w-4" /></button>
                            <button
                              title={cancellable ? "Cancel feedback" : "Tidak dapat dibatalkan"}
                              disabled={!cancellable}
                              onClick={() => setCancelTarget(f)}
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>{fmtDate(f.createdAt)}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.category}</td>
                        <td className={`${td} max-w-[260px]`}><p className="line-clamp-3">{f.content}</p></td>
                        <td className={td}><AttachmentList files={f.attachments} onView={setPreview} /></td>
                        <td className={td}><Pill label={fs} tone={FEEDBACK_STATUS_TONE[fs]} /></td>
                        <td className={td}><Pill label={fus} tone={FOLLOWUP_STATUS_TONE[fus]} /></td>
                        <td className={`${td} max-w-[220px]`}><p className="line-clamp-3">{f.followUp?.note || <span className="text-gray-300">—</span>}</p></td>
                        <td className={td}><AttachmentList files={f.followUp?.attachments ?? []} onView={setPreview} /></td>
                        <td className={`${td} whitespace-nowrap`}>{fmtDate(f.followUp?.date)}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.followUp?.by || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr className="bg-[#1A284F]">
                  <th className={th}>Aksi</th>
                  <th className={th}>Tanggal</th>
                  <th className={th}>ID Karyawan</th>
                  <th className={th}>Nama</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Divisi</th>
                  <th className={th}>Departemen</th>
                  <th className={th}>Jabatan</th>
                  <th className={th}>Kategori</th>
                  <th className={th}>Isi Feedback</th>
                  <th className={th}>Lampiran</th>
                  <th className={th}>Status Feedback</th>
                  <th className={th}>Status Follow-Up</th>
                  <th className={th}>Tanggal Follow-Up</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={14} className="py-16 text-center text-xs text-gray-400">Belum ada feedback masuk.</td></tr>
                ) : (
                  rows.map((f) => {
                    const fs = feedbackStatusOf(f);
                    const fus = followUpStatusOf(f);
                    const locked = fs !== "Open";
                    return (
                      <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className={td}>
                          <button
                            onClick={() => (locked ? setViewing(f) : openFollowUp(f))}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                              locked ? "border border-gray-200 text-gray-600 hover:bg-gray-50" : "bg-[#1A284F] text-white hover:bg-[#131d3b]"
                            }`}
                          >
                            {locked ? <><Eye className="h-3.5 w-3.5" /> Lihat</> : <><Send className="h-3.5 w-3.5" /> Follow-Up</>}
                          </button>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>{fmtDate(f.createdAt)}</td>
                        <td className={`${td} font-mono whitespace-nowrap`}>{f.employeeId}</td>
                        <td className={`${td} whitespace-nowrap font-semibold text-gray-800`}>{f.employeeName}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.company || "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.division || "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.department || "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.position || "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>{f.category}</td>
                        <td className={`${td} max-w-[240px]`}><p className="line-clamp-3">{f.content}</p></td>
                        <td className={td}><AttachmentList files={f.attachments} onView={setPreview} /></td>
                        <td className={td}><Pill label={fs} tone={FEEDBACK_STATUS_TONE[fs]} /></td>
                        <td className={td}><Pill label={fus} tone={FOLLOWUP_STATUS_TONE[fus]} /></td>
                        <td className={`${td} whitespace-nowrap`}>{fmtDate(f.followUp?.date)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {createOpen && (
        <Drawer
          title="Buat Feedback"
          subtitle={`${activeUser.name} · ${activeUser.employeeId}`}
          onClose={() => setCreateOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={submitCreate}
                disabled={!content.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1A284F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Kirim Feedback
              </button>
            </div>
          }
        >
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Kategori <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    category === c ? "border-[#1A284F] bg-[#1A284F] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Isi Feedback <span className="text-red-500">*</span></label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Jelaskan kendala atau masukan Anda secara detail…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#1A284F]/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Lampiran</label>
            <AttachmentPicker files={attachments} onChange={setAttachments} />
          </div>
        </Drawer>
      )}

      {followTarget && (
        <Drawer
          title="Follow-Up Feedback"
          subtitle={`${followTarget.employeeName} · ${followTarget.employeeId}`}
          onClose={() => setFollowTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button onClick={() => setFollowTarget(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">Batal</button>
              <button
                onClick={submitFollowUp}
                disabled={!note.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1A284F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#131d3b] disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Simpan Follow-Up
              </button>
            </div>
          }
        >
          <FeedbackSummary f={followTarget} onView={setPreview} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Status Follow-Up <span className="text-red-500">*</span></label>
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as FollowUpDecision)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1A284F]/40"
            >
              <option value="Done">Done — feedback ditutup (Closed)</option>
              <option value="Pending">Pending — feedback tetap Open</option>
              <option value="Cancel">Cancel — feedback dibatalkan</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Catatan <span className="text-red-500">*</span></label>
            <textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tuliskan tindak lanjut yang dilakukan…"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#1A284F]/40"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Lampiran</label>
            <AttachmentPicker files={followFiles} onChange={setFollowFiles} />
          </div>
        </Drawer>
      )}

      {viewing && (
        <Drawer title="Detail Feedback" subtitle={fmtDate(viewing.createdAt)} onClose={() => setViewing(null)}>
          <FeedbackSummary f={viewing} onView={setPreview} />
          <div className="space-y-2 rounded-xl border border-gray-100 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Follow-Up</span>
              <Pill label={followUpStatusOf(viewing)} tone={FOLLOWUP_STATUS_TONE[followUpStatusOf(viewing)]} />
            </div>
            {viewing.followUp ? (
              <>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{viewing.followUp.note}</p>
                <AttachmentList files={viewing.followUp.attachments} onView={setPreview} />
                <p className="text-gray-400">{viewing.followUp.by} · {fmtDate(viewing.followUp.date)}</p>
              </>
            ) : (
              <p className="italic text-gray-400">Belum ada tindak lanjut.</p>
            )}
          </div>
        </Drawer>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setCancelTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50"><Ban className="h-7 w-7 text-red-600" /></div>
            <h3 className="mb-2 text-base font-bold text-gray-900">Batalkan Feedback?</h3>
            <p className="mb-6 text-sm text-gray-600">Feedback ini akan berstatus Cancel dan tidak akan ditindaklanjuti.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Kembali</button>
              <button
                onClick={() => { cancelOwnFeedback(cancelTarget.id); setCancelTarget(null); toast.success("Feedback dibatalkan."); }}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Cancel Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <EvidenceViewerModal name={preview.name} url={preview.dataUrl} mimeType={preview.type} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

export function FeedbackFormPage() {
  return <FeedbackPage tab="form" />;
}

export function FeedbackFollowUpPage() {
  return <FeedbackPage tab="follow-up" />;
}

export default FeedbackPage;
