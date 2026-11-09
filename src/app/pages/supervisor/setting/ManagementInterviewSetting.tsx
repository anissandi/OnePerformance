import { useState, useEffect, useRef } from "react";
import { DatePickerID } from "../../../components/DatePickerID";
import { MessageSquare, Calendar, User, Clock, Plus, CheckCircle2, AlertCircle, Edit2, Save, X, Info, Trash2, Paperclip, FileText, FileImage, File, Upload } from "lucide-react";
import { getSchedule, saveSchedule, clearSchedule, subscribe, InterviewSchedule, AttachedFile } from "../interviewScheduleStore";

const INTERVIEWERS = [
  "Direktur Operasional",
  "Direktur Keuangan",
  "Direktur Produksi",
  "Direktur Pemasaran",
];

const SELF = {
  name: "Ahmad Fauzi",
  position: "Kepala Divisi Sumber Daya Manusia",
  unit: "PT RSUP (Industry)",
  grade: "G5 — Supervisor",
};

const EMPTY_FORM: InterviewSchedule = {
  interviewerName: "",
  scheduledDate: "",
  scheduledTime: "",
  location: "",
  notes: "",
  attachments: [],
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500" />;
  if (type === "application/pdf") return <FileText className="w-4 h-4 text-rose-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

export function SupervisorSettingManagementInterview() {
  const [schedule, setSchedule] = useState<InterviewSchedule | null>(getSchedule);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [form, setForm]             = useState<InterviewSchedule>(EMPTY_FORM);
  const [savedToast, setSavedToast] = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribe(() => setSchedule(getSchedule())), []);

  const set = (k: keyof InterviewSchedule, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.interviewerName && form.scheduledDate && form.scheduledTime;

  const handleOpenCreate = () => { setForm(EMPTY_FORM); setEditing(false); setShowForm(true); };
  const handleOpenEdit   = () => { if (schedule) { setForm(schedule); setEditing(true); setShowForm(true); } };
  const handleDelete     = () => { clearSchedule(); setShowForm(false); };

  const handleSave = () => {
    if (!valid) return;
    saveSchedule(form);
    setShowForm(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  const readFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) return; // 10 MB limit
      const reader = new FileReader();
      reader.onload = (e) => {
        const newFile: AttachedFile = {
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: e.target?.result as string,
        };
        setForm((p) => ({ ...p, attachments: [...p.attachments, newFile] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (idx: number) =>
    setForm((p) => ({ ...p, attachments: p.attachments.filter((_, i) => i !== idx) }));

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <h1 className="text-[26px] font-bold text-[#1A284F]">Management Interview</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-[#1A284F] text-white text-xs font-bold">2026</span>
        </div>
        <p className="text-gray-500 text-sm">Atur jadwal Management Interview Anda untuk periode Mid-Year 2026</p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4">
        <Info className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
        <p className="text-sm text-indigo-700">
          Management Interview adalah sesi evaluasi langsung bersama atasan untuk menilai kompetensi kepemimpinan dan pemahaman strategis Anda. Jadwal yang dibuat akan otomatis tampil di menu <strong>Performance Appraisal Measurement → Management Interview</strong>.
        </p>
      </div>

      {/* My profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Profil Saya</p>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-base font-bold text-gray-800">{SELF.name}</p>
            <p className="text-sm text-gray-500">{SELF.position}</p>
            <p className="text-xs text-gray-400 mt-0.5">{SELF.unit} · {SELF.grade}</p>
          </div>
          {schedule ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
              <Calendar className="w-4 h-4" />Dijadwalkan
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-500">
              <AlertCircle className="w-4 h-4" />Belum Dijadwalkan
            </span>
          )}
        </div>
      </div>

      {/* No schedule yet */}
      {!schedule && !showForm && (
        <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-gray-300 py-14 gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
            <Calendar className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-1">Belum ada jadwal interview</p>
            <p className="text-xs text-gray-400">Buat jadwal interview Anda untuk periode Mid-Year 2026</p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1A284F] text-white text-sm font-semibold rounded-xl hover:bg-[#131d3b] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Schedule
          </button>
        </div>
      )}

      {/* My Interview Schedule card */}
      {schedule && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-bold text-[#1A284F]">My Interview Schedule</p>
            <div className="flex items-center gap-2">
              <button onClick={handleOpenEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                <Edit2 className="w-3.5 h-3.5" />Edit
              </button>
              <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />Hapus
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <Calendar className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400 mb-0.5">Tanggal Interview</p><p className="text-sm font-semibold text-gray-800">{schedule.scheduledDate}</p></div>
            </div>
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <Clock className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400 mb-0.5">Waktu</p><p className="text-sm font-semibold text-gray-800">{schedule.scheduledTime}</p></div>
            </div>
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <User className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400 mb-0.5">Interviewer</p><p className="text-sm font-semibold text-gray-800">{schedule.interviewerName}</p></div>
            </div>
            <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <MessageSquare className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400 mb-0.5">Lokasi / Platform</p><p className="text-sm font-semibold text-gray-800">{schedule.location || "—"}</p></div>
            </div>
            {schedule.notes && (
              <div className="md:col-span-2 bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
                <p className="text-xs text-gray-400 mb-0.5">Catatan</p>
                <p className="text-sm text-gray-700">{schedule.notes}</p>
              </div>
            )}
            {schedule.attachments.length > 0 && (
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />Lampiran ({schedule.attachments.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {schedule.attachments.map((f, i) => (
                    <a
                      key={i}
                      href={f.dataUrl}
                      download={f.name}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                    >
                      <FileIcon type={f.type} />
                      <div>
                        <p className="text-xs font-medium text-gray-700 max-w-[140px] truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(f.size)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-bold text-[#1A284F]">{editing ? "Edit Jadwal Interview" : "Buat Jadwal Interview"}</p>
            <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Interviewer */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Interviewer *</label>
              <select
                value={form.interviewerName}
                onChange={(e) => set("interviewerName", e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 bg-white text-gray-700"
              >
                <option value="">— Pilih Interviewer —</option>
                {INTERVIEWERS.map((iv) => <option key={iv} value={iv}>{iv}</option>)}
              </select>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tanggal Interview *</label>
                <DatePickerID value={form.scheduledDate} onChange={(iso) => set("scheduledDate", iso)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Waktu *</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(e) => set("scheduledTime", e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 focus:border-indigo-400 focus:outline-none text-gray-700 bg-white cursor-pointer [color-scheme:light]"
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Lokasi / Platform</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="cth. Ruang Rapat A, Google Meet, Zoom"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-400"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catatan</label>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Informasi tambahan terkait jadwal interview..."
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 outline-none focus:border-indigo-400 text-gray-700 placeholder-gray-400 resize-none"
              />
            </div>

            {/* File attachment */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />Lampiran Persiapan Interview
              </label>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); readFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl px-4 py-6 cursor-pointer transition-colors ${
                  dragOver ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50"
                }`}
              >
                <Upload className={`w-6 h-6 ${dragOver ? "text-indigo-500" : "text-gray-300"}`} />
                <p className="text-xs text-gray-500 text-center">
                  <span className="font-semibold text-indigo-600">Klik untuk upload</span> atau drag & drop
                </p>
                <p className="text-[11px] text-gray-400">PDF, Word, Excel, Gambar (maks. 10 MB per file)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => readFiles(e.target.files)}
              />

              {/* Attached files list */}
              {form.attachments.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {form.attachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-lg">
                      <FileIcon type={f.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{f.name}</p>
                        <p className="text-[10px] text-gray-400">{formatBytes(f.size)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeAttachment(i); }}
                        className="p-1 hover:bg-rose-50 rounded text-gray-300 hover:text-rose-500 transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button
                disabled={!valid}
                onClick={handleSave}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  valid ? "bg-[#1A284F] text-white hover:bg-[#131d3b]" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {savedToast && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg z-50">
          <CheckCircle2 className="w-4 h-4" />
          Jadwal berhasil disimpan
        </div>
      )}
    </div>
  );
}
