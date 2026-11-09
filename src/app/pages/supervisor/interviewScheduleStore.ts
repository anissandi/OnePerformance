import { syncToSupabase } from "../../services/supabaseClient";

export interface ScheduleEntry {
  id: string;
  companyUnit: string;
  addedUsers: string[];
  interviewers: string[];
  otherUsers: string[];
  scheduledDate: string;
  scheduledTime: string;
  location: string;
  textNotifikasi: string;
  textLampiran: string;
  status: "Scheduled" | "Cancelled" | "Done";
  createdAt: string;
}

// Legacy single-schedule shape (kept for backward compat with supervisor check-in consumer)
export interface AttachedFile {
  name: string; size: number; type: string; dataUrl: string;
}
export interface InterviewSchedule {
  interviewerName: string; scheduledDate: string; scheduledTime: string;
  location: string; notes: string; attachments: AttachedFile[];
}

let _entries: ScheduleEntry[] = [
  {
    id: "sch-seed-001",
    companyUnit: "PT. RSUP (Industri)",
    addedUsers: ["Siti Rahayu", "Kartini Dewi", "Rini Susanti", "Dian Permana"],
    interviewers: ["Direktur Operasional", "Direktur Keuangan", "Direktur Produksi", "Direktur Pemasaran"],
    otherUsers: [],
    scheduledDate: "2026-10-15",
    scheduledTime: "09:00",
    location: "Ruang Rapat A, Gedung HQ Lt. 3",
    textNotifikasi: "Harap hadir tepat waktu. Interview berdurasi ±60 menit.",
    textLampiran: "Lampirkan dokumen KPI terakhir sebelum sesi dimulai.",
    status: "Scheduled",
    createdAt: "2026-09-20T08:00:00.000Z",
  },
];
const _listeners: (() => void)[] = [];

export function getEntries(): ScheduleEntry[] { return [..._entries]; }

export function addEntry(e: Omit<ScheduleEntry, "id" | "createdAt" | "status">): ScheduleEntry {
  const entry: ScheduleEntry = {
    ...e,
    id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: "Scheduled",
    createdAt: new Date().toISOString(),
  };
  _entries = [entry, ..._entries];
  _listeners.forEach(fn => fn());
  void syncToSupabase({
    kind: "interview-schedule",
    schedule: entry,
    audit: {
      action: "Schedule",
      module: "Management Interview",
      subModule: "Schedule",
      description: `Scheduled Management Interview for ${entry.companyUnit} (${entry.addedUsers.join(", ")}) on ${entry.scheduledDate} ${entry.scheduledTime}`,
    },
  });
  return entry;
}

export function updateEntry(id: string, patch: Partial<ScheduleEntry>): void {
  _entries = _entries.map(e => e.id === id ? { ...e, ...patch } : e);
  _listeners.forEach(fn => fn());
  const updated = _entries.find(e => e.id === id);
  if (updated) {
    void syncToSupabase({
      kind: "interview-schedule",
      schedule: updated,
    });
  }
}

export function cancelEntry(id: string): void {
  updateEntry(id, { status: "Cancelled" });
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

// Legacy API — keep so old imports still compile
export function getSchedule(): InterviewSchedule | null { return null; }
export function saveSchedule(_s: InterviewSchedule): void {}
export function clearSchedule(): void {}
