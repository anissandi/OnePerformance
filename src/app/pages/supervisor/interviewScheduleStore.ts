import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";

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

const SCHEDULES_STORAGE_KEY = "pa_interview_schedules_v1";

const SEED_ENTRIES: ScheduleEntry[] = [];
let _entries: ScheduleEntry[] = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, SEED_ENTRIES);
const _listeners: (() => void)[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("pa-db-hydrated", () => {
    const hydrated = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, _entries);
    if (Array.isArray(hydrated) && hydrated.length > 0) {
      _entries = hydrated;
      _listeners.forEach((fn) => fn());
    }
  });
}

export function getEntries(): ScheduleEntry[] {
  const persisted = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, _entries);
  if (Array.isArray(persisted) && persisted.length > 0) {
    _entries = persisted;
  }
  return [..._entries];
}

export function addEntry(e: Omit<ScheduleEntry, "id" | "createdAt" | "status">): ScheduleEntry {
  const entry: ScheduleEntry = {
    ...e,
    id: `sch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: "Scheduled",
    createdAt: new Date().toISOString(),
  };
  _entries = [entry, ...getEntries().filter((x) => x.id !== entry.id)];
  _listeners.forEach(fn => fn());
  savePersistedState(SCHEDULES_STORAGE_KEY, _entries, {
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
  _entries = getEntries().map(e => e.id === id ? { ...e, ...patch } : e);
  _listeners.forEach(fn => fn());
  const updated = _entries.find(e => e.id === id);
  if (updated) {
    savePersistedState(SCHEDULES_STORAGE_KEY, _entries, {
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
