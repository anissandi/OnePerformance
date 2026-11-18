import { loadPersistedState, safeGetLocalRaw, safeSetLocalJson, savePersistedState } from "../../services/supabaseClient";

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
  /** Lampiran tersimpan (URL storage backend) — dapat dilihat & di-download */
  attachments?: Array<{ name: string; url: string; mimeType: string; size: number }>;
  /** Employee ID peserta (untuk notifikasi & filter akses) */
  addedUserIds?: string[];
  createdBy?: string;
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
const MI_CLEARED_FLAG_KEY = "pa_mi_cleared_2026_v1";

const SEED_ENTRIES: ScheduleEntry[] = [];

function ensureMiInitialCleanState(): ScheduleEntry[] {
  try {
    if (!safeGetLocalRaw(MI_CLEARED_FLAG_KEY)) {
      safeSetLocalJson(MI_CLEARED_FLAG_KEY, true);
      safeSetLocalJson(SCHEDULES_STORAGE_KEY, []);
      safeSetLocalJson("pa_mi_supervisor_assessments_v1", {});
      safeSetLocalJson("pa_mi_penilai1_scores_v1", {});
      safeSetLocalJson("pa_mi_results_by_emp_v1", {});
      return [];
    }
  } catch {
    // ignore
  }
  const loaded = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, SEED_ENTRIES);
  return Array.isArray(loaded) ? loaded : [];
}

let _entries: ScheduleEntry[] = ensureMiInitialCleanState();
const _listeners: (() => void)[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("pa-db-hydrated", () => {
    if (!safeGetLocalRaw(MI_CLEARED_FLAG_KEY)) {
      _entries = ensureMiInitialCleanState();
      _listeners.forEach((fn) => fn());
      return;
    }
    const hydrated = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, _entries);
    if (Array.isArray(hydrated)) {
      _entries = hydrated;
      _listeners.forEach((fn) => fn());
    }
  });
}

export function getEntries(): ScheduleEntry[] {
  if (!safeGetLocalRaw(MI_CLEARED_FLAG_KEY)) {
    _entries = ensureMiInitialCleanState();
    return [];
  }
  const persisted = loadPersistedState<ScheduleEntry[]>(SCHEDULES_STORAGE_KEY, _entries);
  if (Array.isArray(persisted)) {
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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("appraisal-updated"));
  }
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
      audit: {
        action: patch.status === "Cancelled" ? "Reject" : "Update",
        module: "Management Interview",
        subModule: "Schedule",
        description:
          patch.status === "Cancelled"
            ? `Cancelled Management Interview schedule for ${updated.companyUnit} (${updated.scheduledDate} ${updated.scheduledTime})`
            : `Updated Management Interview schedule for ${updated.companyUnit}`,
      },
    });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("appraisal-updated"));
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
