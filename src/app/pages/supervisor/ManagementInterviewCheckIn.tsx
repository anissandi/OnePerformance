import React, { useState, useEffect, useRef } from "react";
import { DatePickerID } from "../../components/DatePickerID";
import {
  MessageSquare, Calendar, Clock, Save, X, Plus, Edit2,
  ChevronDown, Eye, Ban, Info, Check, Building2, User, Users,
  Paperclip, FileText, Image as ImageIcon, File,
} from "lucide-react";
import {
  getEntries, addEntry, updateEntry, cancelEntry, subscribe,
  type ScheduleEntry,
} from "./interviewScheduleStore";
import { uploadEvidenceFileToSupabase } from "../../services/supabaseClient";
import { isAdminOrHrIcfRole, loadManagedUsers, useAuthStore } from "../../store/authStore";
import { pushEmployeeNotification } from "../../store/notificationStore";
import { toast } from "sonner";
import { Download, Search, Send } from "lucide-react";

// ── Master data ───────────────────────────────────────────────────────────────

const COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "PT RSUP ASD",
];

interface PersonOption { value: string; position: string; }

function getMergedPersonOptions(base: PersonOption[] = [], filterFn?: (u: ReturnType<typeof loadManagedUsers>[number]) => boolean): PersonOption[] {
  const users = loadManagedUsers().filter((u) => u.status === "Active" && (!filterFn || filterFn(u)));
  const seen = new Set<string>();
  const result: PersonOption[] = [];
  for (const u of users) {
    const key = u.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ value: u.name, position: `${u.position} (${u.employeeId} · ${u.role || "Employee"})` });
  }
  for (const b of base) {
    const key = b.value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(b);
  }
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToDMY(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

const ACCEPT_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png"].includes(ext)) return <ImageIcon className="w-3.5 h-3.5" />;
  if (["pdf"].includes(ext)) return <FileText className="w-3.5 h-3.5" />;
  return <File className="w-3.5 h-3.5" />;
}

// ── Multi-select dropdown (name + position) ───────────────────────────────────

function MultiSelect({
  label, options, selected, onChange, placeholder, required,
}: {
  label: React.ReactNode;
  options: PersonOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const shown = options.filter(
    (o) => !query.trim() || `${o.value} ${o.position}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);

  const selectedOpts = options.filter(o => selected.includes(o.value));

  const buttonLabel = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? `${selected[0]} — ${options.find(o => o.value === selected[0])?.position ?? ""}`
      : `${selected.length} dipilih`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-left focus:outline-none focus:border-indigo-400 hover:border-gray-300 transition-colors"
        >
          <span className={selected.length ? "text-gray-800 truncate pr-2" : "text-gray-400"}>
            {buttonLabel}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
            <div className="sticky top-0 bg-white p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari nama / Employee ID / jabatan…"
                  className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            {shown.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">Tidak ada hasil</p>}
            {shown.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/60 transition-colors text-left"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 font-medium leading-tight">{opt.value}</p>
                    <p className="text-[11px] text-gray-400 leading-tight">{opt.position}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedOpts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {selectedOpts.map(o => (
            <span key={o.value} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-xs text-indigo-700 font-medium">
              <span>{o.value}</span>
              <span className="text-indigo-400 font-normal">· {o.position}</span>
              <button type="button" onClick={() => toggle(o.value)} className="ml-0.5 hover:text-indigo-900 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── File upload field ─────────────────────────────────────────────────────────

function FileUpload({
  files, onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    onChange([...files, ...arr]);
  };

  const remove = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-5 px-4 cursor-pointer transition-colors ${
          drag ? "border-indigo-400 bg-indigo-50" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50/50"
        }`}
      >
        <Paperclip className="w-5 h-5 text-gray-400" />
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          Klik atau seret file ke sini<br />
          <span className="text-gray-400">PDF, JPG, PNG, Word, Excel</span>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_TYPES}
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-700">
              <span className="text-indigo-500 shrink-0">{fileIcon(f.name)}</span>
              <span className="flex-1 truncate font-medium">{f.name}</span>
              <span className="text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Empty form ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  companyUnit: "",
  addedUsers: [] as string[],   // employees
  interviewers: [] as string[],
  otherUsers: [] as string[],
  scheduledDate: "",
  scheduledTime: "",
  location: "",
  textNotifikasi: "",
  textLampiran: "",             // stored as comma-joined filenames
};
type FormState = typeof EMPTY_FORM;

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ScheduleEntry["status"] }) {
  const map = {
    Scheduled: "bg-blue-100 text-blue-700",
    Cancelled: "bg-red-100 text-red-600",
    Done:      "bg-green-100 text-green-700",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${map[status]}`}>
      {status}
    </span>
  );
}

function AttachmentLinks({ entry }: { entry: ScheduleEntry }) {
  const list = entry.attachments ?? [];
  if (list.length === 0) {
    return entry.textLampiran ? <span className="text-xs text-gray-500">{entry.textLampiran}</span> : <span className="text-gray-300">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {list.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-xs">
          <a href={a.url} target="_blank" rel="noreferrer" className="max-w-[160px] truncate text-indigo-700 hover:underline" title="Lihat">{a.name}</a>
          <a href={a.url} download={a.name} className="text-gray-400 hover:text-[#1A284F]" title="Download"><Download className="w-3 h-3" /></a>
        </span>
      ))}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────

function DetailModal({ entry, onClose }: { entry: ScheduleEntry; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Company Unit",      entry.companyUnit],
    ["Tanggal",           isoToDMY(entry.scheduledDate)],
    ["Waktu",             entry.scheduledTime],
    ["Lokasi / Platform", entry.location || "—"],
    ["Interviewer",       entry.interviewers.join(", ") || "—"],
    ["Employee",          entry.addedUsers.join(", ") || "—"],
    ["Other User",        entry.otherUsers.join(", ") || "—"],
    ["Text Notifikasi",   entry.textNotifikasi || "—"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#1A284F] rounded-t-2xl">
          <div>
            <h3 className="font-bold text-white">Detail Jadwal Interview</h3>
            <p className="text-xs text-blue-200 mt-0.5">{entry.companyUnit} · {isoToDMY(entry.scheduledDate)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-end">
            <StatusBadge status={entry.status} />
          </div>
          {rows.map(([label, val]) => (
            <div key={label} className="grid grid-cols-[140px_1fr] gap-2 text-sm">
              <span className="text-gray-400 font-medium">{label}</span>
              <span className="text-gray-800 font-semibold">{val}</span>
            </div>
          ))}
          <div className="grid grid-cols-[140px_1fr] gap-2 text-sm">
            <span className="text-gray-400 font-medium">Lampiran</span>
            <AttachmentLinks entry={entry} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SupervisorManagementInterviewCheckIn() {
  const { activeUser } = useAuthStore();
  const [entries, setEntries]     = useState<ScheduleEntry[]>(getEntries);
  // Data karyawan aktual (tanpa data dummy)
  const employeeOptions = React.useMemo(() => getMergedPersonOptions(), [entries]);
  const interviewerOptions = employeeOptions;
  const otherUserOptions = employeeOptions;
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [lampiranFiles, setLampiranFiles] = useState<File[]>([]);
  const [viewEntry, setViewEntry] = useState<ScheduleEntry | null>(null);
  const [savedToast, setSavedToast]   = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);

  useEffect(() => subscribe(() => setEntries(getEntries())), []);

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  const valid = !!(form.companyUnit && form.interviewers.length && form.scheduledDate && form.scheduledTime);

  const handleOpenCreate = () => {
    setForm(EMPTY_FORM);
    setLampiranFiles([]);
    setEditId(null);
    setShowForm(true);
  };

  const handleOpenEdit = (e: ScheduleEntry) => {
    setForm({
      companyUnit: e.companyUnit, addedUsers: e.addedUsers,
      interviewers: e.interviewers, otherUsers: e.otherUsers,
      scheduledDate: e.scheduledDate, scheduledTime: e.scheduledTime,
      location: e.location, textNotifikasi: e.textNotifikasi,
      textLampiran: e.textLampiran,
    });
    setLampiranFiles([]);
    setEditId(e.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!valid || sending) return;
    setSending(true);
    // Upload lampiran ke storage backend agar bisa dilihat & di-download oleh peserta
    const uploaded: NonNullable<ScheduleEntry["attachments"]> = [];
    for (const f of lampiranFiles) {
      const rec = await uploadEvidenceFileToSupabase(f, { moduleType: "Management Interview", period: "2026", kpiName: "Lampiran Jadwal" });
      if (rec.url) uploaded.push({ name: f.name, url: rec.url, mimeType: f.type, size: f.size });
    }
    const existing = editId ? entries.find((e) => e.id === editId)?.attachments ?? [] : [];
    const attachments = [...existing, ...uploaded];
    const users = loadManagedUsers();
    const idOf = (name: string) => users.find((u) => u.name.trim().toLowerCase() === name.trim().toLowerCase());
    const payload = {
      ...form,
      textLampiran: attachments.map((a) => a.name).join(", "),
      attachments,
      addedUserIds: form.addedUsers.map((n) => idOf(n)?.employeeId ?? "").filter(Boolean),
      createdBy: activeUser.employeeId,
    };
    if (editId) {
      updateEntry(editId, payload);
    } else {
      addEntry(payload);
    }
    // Notifikasi sistem personal ke setiap karyawan dalam jadwal
    const people = Array.from(new Set([...form.addedUsers, ...form.interviewers, ...form.otherUsers]));
    for (const name of people) {
      const u = idOf(name);
      if (!u) continue;
      const msg = `Yth. Bapak/Ibu ${u.name}, ${form.textNotifikasi.trim() || `Anda dijadwalkan mengikuti Management Interview pada ${isoToDMY(form.scheduledDate)} pukul ${form.scheduledTime}${form.location ? ` di ${form.location}` : ""}.`}`;
      pushEmployeeNotification({
        employeeIds: [u.employeeId],
        title: editId ? "Perubahan Jadwal Management Interview" : "Jadwal Management Interview",
        summary: msg,
        body: [msg, `Tanggal: ${isoToDMY(form.scheduledDate)} · Waktu: ${form.scheduledTime} · Lokasi: ${form.location || "-"}`],
        category: "Reminder",
        moduleName: "Management Interview",
        ctaLabel: "Lihat Jadwal",
        ctaRoute: "/calibration/management-interview",
        senderName: activeUser.name,
        attachments: attachments.map((a, i) => ({ id: `att-${i}`, name: a.name, mimeType: a.mimeType, dataUrl: a.url, size: a.size, isImage: a.mimeType.startsWith("image/") })),
      });
    }
    setSending(false);
    setConfirmSend(false);
    toast.success(`Jadwal terkirim & notifikasi dikirim ke ${people.length} peserta`);
    setShowForm(false);
    setEditId(null);
    setLampiranFiles([]);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const handleCancel = (id: string) => {
    cancelEntry(id);
    setCancelConfirm(null);
  };

  // Hanya karyawan yang diundang (Employee / Interviewer / Other User) yang dapat melihat jadwal;
  // Administrator & HR ICF (penyusun jadwal) tetap dapat mengelola seluruh jadwal.
  const me = activeUser.name.trim().toLowerCase();
  const canManageAll = isAdminOrHrIcfRole(activeUser.role);
  const visibleEntries = entries.filter(
    (e) =>
      canManageAll ||
      e.createdBy === activeUser.employeeId ||
      [...e.addedUsers, ...e.interviewers, ...e.otherUsers].some((n) => n.trim().toLowerCase() === me) ||
      (e.addedUserIds ?? []).includes(activeUser.employeeId),
  );
  const activeEntries = visibleEntries.filter(e => e.status !== "Cancelled");

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Management Interview</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
        </div>
        <p className="text-gray-500 text-sm">Calibration · Penjadwalan Management Interview</p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
        <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
        <p className="text-sm text-indigo-700 leading-relaxed">
          Buat jadwal Management Interview sesuai dengan jadwal yang sudah disepakati Management. Jadwal yang sudah dibuat otomatis akan dikirimkan melalui notifikasi aplikasi, email corporate, telegram/wa (jika ada) ke semua user yang terlibat.
        </p>
      </div>

      {/* ── Buat Jadwal Interview section ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <p className="font-bold text-[#1A284F] text-sm">Buat Jadwal Interview</p>
          {!showForm && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-[#1A284F] text-white text-xs font-semibold rounded-xl hover:bg-[#131d3b] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />Tambah Jadwal
            </button>
          )}
          {showForm && (
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {showForm && (
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Company Unit */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />Company Unit <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={form.companyUnit}
                  onChange={e => setF("companyUnit", e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400 appearance-none pr-8"
                >
                  <option value="">— Pilih Company Unit —</option>
                  {COMPANY_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* Employee (was Add User) */}
            <MultiSelect
              label={<span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" />Employee</span>}
              options={employeeOptions}
              selected={form.addedUsers}
              onChange={v => setF("addedUsers", v)}
              placeholder="— Pilih Employee —"
            />

            {/* Interviewer */}
            <MultiSelect
              label={<span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />Interviewer</span>}
              options={interviewerOptions}
              selected={form.interviewers}
              onChange={v => setF("interviewers", v)}
              placeholder="— Pilih Interviewer —"
              required
            />

            {/* Other User */}
            <MultiSelect
              label={<span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" />Other User</span>}
              options={otherUserOptions}
              selected={form.otherUsers}
              onChange={v => setF("otherUsers", v)}
              placeholder="— Pilih Other User —"
            />

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />Tanggal Interview <span className="text-red-500">*</span>
                </label>
                <DatePickerID value={form.scheduledDate} onChange={iso => setF("scheduledDate", iso)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />Waktu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                  <input type="time" value={form.scheduledTime} onChange={e => setF("scheduledTime", e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 focus:border-indigo-400 focus:outline-none text-gray-700 bg-white [color-scheme:light]" />
                </div>
              </div>
            </div>

            {/* Lokasi */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600">Lokasi / Platform</label>
              <input type="text" value={form.location} onChange={e => setF("location", e.target.value)}
                placeholder="cth. Ruang Rapat A, Google Meet, Zoom"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-400" />
            </div>

            {/* Text Notifikasi */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600">Text Notifikasi</label>
              <textarea value={form.textNotifikasi} onChange={e => setF("textNotifikasi", e.target.value)}
                placeholder="Teks notifikasi yang akan dikirimkan kepada semua user yang terlibat..."
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-400 resize-none" />
            </div>

            {/* Lampiran (jika ada) — file upload */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-gray-400" />Lampiran (jika ada)
              </label>
              {/* Show previously saved filenames when editing */}
              {editId && form.textLampiran && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {form.textLampiran.split(", ").filter(Boolean).map((fname, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                      {fileIcon(fname)}{fname}
                    </span>
                  ))}
                </div>
              )}
              <FileUpload files={lampiranFiles} onChange={setLampiranFiles} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setShowForm(false); setEditId(null); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Batal
              </button>
              <button disabled={!valid} onClick={() => setConfirmSend(true)}
                className={`flex items-center gap-1.5 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  valid ? "bg-[#1A284F] text-white hover:bg-[#131d3b]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}>
                <Send className="w-3.5 h-3.5" />{editId ? "Kirim Update Jadwal" : "Kirim Jadwal"}
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <div className="px-6 py-4 text-sm text-gray-400 text-center">
            Klik <span className="font-semibold text-[#1A284F]">Tambah Jadwal</span> untuk membuat jadwal interview baru
          </div>
        )}
      </div>

      {/* ── Schedule table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-[#1A284F] text-sm">Daftar Jadwal Interview</p>
            <p className="text-xs text-gray-400 mt-0.5">{activeEntries.length} jadwal aktif</p>
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Belum ada jadwal interview untuk Anda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#1A284F] text-white text-xs">
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Action</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Company Unit</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Tanggal</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Waktu</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Interviewer</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Other User</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Lampiran</th>
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Lokasi</th>
                  <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry, i) => (
                  <tr key={entry.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setViewEntry(entry)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="View Detail">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {entry.status !== "Cancelled" && (
                          <button onClick={() => handleOpenEdit(entry)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-[#1A284F] hover:bg-blue-50 transition-colors" title="Edit">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {entry.status === "Scheduled" && (
                          <button onClick={() => setCancelConfirm(entry.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium whitespace-nowrap">{entry.companyUnit}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{isoToDMY(entry.scheduledDate)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{entry.scheduledTime}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex flex-wrap gap-1">
                        {entry.interviewers.slice(0, 2).map(iv => {
                          const pos = interviewerOptions.find(o => o.value === iv)?.position;
                          return (
                            <span key={iv} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-medium whitespace-nowrap" title={pos}>{iv}</span>
                          );
                        })}
                        {entry.interviewers.length > 2 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">+{entry.interviewers.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {entry.addedUsers.length > 0
                        ? <span className="text-xs text-gray-500">{entry.addedUsers.length} employee</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {entry.otherUsers.length > 0
                        ? <span className="text-xs text-gray-500">{entry.otherUsers.length} user</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3"><AttachmentLinks entry={entry} /></td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{entry.location || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !sending && setConfirmSend(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-[#1A284F]">Konfirmasi Kirim Jadwal</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Jadwal Management Interview {form.companyUnit} pada <strong>{isoToDMY(form.scheduledDate)} {form.scheduledTime}</strong> akan dikirim
              beserta notifikasi sistem ke {new Set([...form.addedUsers, ...form.interviewers, ...form.otherUsers]).size} peserta
              (diawali "Yth. Bapak/Ibu &#123;Nama Karyawan&#125;"). Lanjutkan?
            </p>
            <div className="flex justify-end gap-2">
              <button disabled={sending} onClick={() => setConfirmSend(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm">Batal</button>
              <button disabled={sending} onClick={() => void handleSave()} className="px-4 py-2 bg-[#1A284F] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {sending ? "Mengirim…" : "Ya, Kirim Jadwal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {viewEntry && <DetailModal entry={viewEntry} onClose={() => setViewEntry(null)} />}

      {/* Cancel confirm */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Cancel Jadwal?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Jadwal ini akan ditandai sebagai Cancelled</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCancelConfirm(null)}
                className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Tidak
              </button>
              <button onClick={() => handleCancel(cancelConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
                Ya, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg z-50">
          <Check className="w-4 h-4" />
          Jadwal berhasil disimpan
        </div>
      )}
    </div>
  );
}
