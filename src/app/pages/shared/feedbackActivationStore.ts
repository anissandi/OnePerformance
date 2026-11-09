export interface FeedbackActivation {
  active: boolean;
  startDate: string;
  endDate: string;
}
const KEY = "feedback_activation_v1";
export const FEEDBACK_ACTIVATION_EVENT = "feedback-activation-changed";
export function loadFeedbackActivation(year: string): FeedbackActivation | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}")[year] ?? null; }
  catch { return null; }
}
export function saveFeedbackActivation(year: string, value: FeedbackActivation) {
  let records: Record<string, FeedbackActivation> = {};
  try { records = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch {}
  localStorage.setItem(KEY, JSON.stringify({ ...records, [year]: value }));
  window.dispatchEvent(new Event(FEEDBACK_ACTIVATION_EVENT));
}
export function feedbackActivationError(value: FeedbackActivation | null) {
  if (!value?.active) return "";
  if (!value.startDate || !value.endDate) return "Lengkapi Mulai Nominasi & Feedback serta Akhir Summary & Approval.";
  if (value.startDate > value.endDate) return "Akhir Summary & Approval harus pada atau setelah Mulai Nominasi & Feedback.";
  return "";
}
export function feedbackWindow(value: FeedbackActivation | null, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const valid = !!value?.active && !feedbackActivationError(value);
  const open = valid && today >= value!.startDate && today <= value!.endDate;
  return {
    receiving: open,
    approval: open,
  };
}
