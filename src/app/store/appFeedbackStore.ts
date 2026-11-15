import { savePersistedState } from "../services/supabaseClient";
import { getActiveUser } from "./authStore";

export const APP_FEEDBACK_KEY = "pa_app_feedback_v1";
export const APP_FEEDBACK_EVENT = "pa-app-feedback-updated";

export const FEEDBACK_CATEGORIES = ["Bugs/Error Aplikasi", "Modul Penilaian", "Lainnya"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
export type FeedbackStatus = "Open" | "Closed" | "Cancel";
export type FollowUpDecision = "Done" | "Pending" | "Cancel";
export type FollowUpStatus = "Done" | "On Progress" | "Pending" | "Cancel";

export interface FeedbackAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface AppFeedback {
  id: string;
  createdAt: string; // ISO
  employeeId: string;
  employeeName: string;
  regNo?: string;
  company: string;
  division: string;
  department: string;
  bagian?: string;
  position: string;
  category: FeedbackCategory;
  content: string;
  attachments: FeedbackAttachment[];
  /** Dibatalkan oleh pembuat feedback sendiri. */
  cancelledByOwner?: boolean;
  followUp?: {
    decision: FollowUpDecision;
    note: string;
    attachments: FeedbackAttachment[];
    date: string; // ISO
    by: string;
  };
}

export function loadAppFeedback(): AppFeedback[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_FEEDBACK_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: AppFeedback[]) {
  savePersistedState(APP_FEEDBACK_KEY, list);
  window.dispatchEvent(new Event(APP_FEEDBACK_EVENT));
}

/** Status Feedback: Done → Closed, Cancel → Cancel, selain itu (Pending / belum ditindaklanjuti) → Open. */
export function feedbackStatusOf(f: AppFeedback): FeedbackStatus {
  if (f.cancelledByOwner) return "Cancel";
  if (f.followUp?.decision === "Done") return "Closed";
  if (f.followUp?.decision === "Cancel") return "Cancel";
  return "Open";
}

/** Status Follow-Up: belum ada tindakan → On Progress. */
export function followUpStatusOf(f: AppFeedback): FollowUpStatus {
  if (f.cancelledByOwner) return "Cancel";
  if (!f.followUp) return "On Progress";
  return f.followUp.decision;
}

export function createAppFeedback(input: { category: FeedbackCategory; content: string; attachments: FeedbackAttachment[] }): AppFeedback {
  const u = getActiveUser();
  const record: AppFeedback = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    employeeId: u.employeeId,
    employeeName: u.name,
    regNo: u.regNo,
    company: u.company,
    division: u.division,
    department: u.department,
    bagian: u.bagian,
    position: u.position,
    category: input.category,
    content: input.content.trim(),
    attachments: input.attachments,
  };
  save([record, ...loadAppFeedback()]);
  return record;
}

export function cancelOwnFeedback(id: string): void {
  save(loadAppFeedback().map((f) => (f.id === id ? { ...f, cancelledByOwner: true } : f)));
}

export function followUpFeedback(id: string, input: { decision: FollowUpDecision; note: string; attachments: FeedbackAttachment[] }): void {
  const u = getActiveUser();
  save(
    loadAppFeedback().map((f) =>
      f.id === id
        ? {
            ...f,
            followUp: {
              decision: input.decision,
              note: input.note.trim(),
              attachments: input.attachments,
              date: new Date().toISOString(),
              by: u.name ? `${u.name}${u.role ? ` (${u.role})` : ""}` : "—",
            },
          }
        : f,
    ),
  );
}

export function readFeedbackAttachment(file: File): Promise<FeedbackAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: typeof reader.result === "string" ? reader.result : "",
      });
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
