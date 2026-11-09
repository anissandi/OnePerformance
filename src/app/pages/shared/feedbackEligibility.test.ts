import assert from "node:assert/strict";
import test from "node:test";
import { feedbackEligibilityError } from "./feedbackEligibility.ts";
import { nominateFeedbackGivers } from "./interDepartmentFeedbackStore.ts";
import type { FeedbackPerson } from "./interDepartmentFeedbackStore.ts";

const recipient: FeedbackPerson = {
  id: "recipient", name: "Penerima", initials: "P", position: "Staff",
  companyUnit: "Unit A", division: "Divisi A", department: "SDM", departmentId: "dept-1",
  section: "Rekrutmen", sectionId: "bag-1",
};
const giver = (patch: Partial<FeedbackPerson> = {}): FeedbackPerson => ({
  ...recipient, id: "giver", name: "Pemberi", department: "Umum", departmentId: "dept-2",
  section: "Administrasi", sectionId: "bag-2", ...patch,
});

test("rejects self and the same department, even when sections differ", () => {
  assert.notEqual(feedbackEligibilityError(recipient, recipient), "");
  assert.notEqual(feedbackEligibilityError(recipient, giver({ departmentId: "dept-1", department: "SDM" })), "");
});
test("rejects a shared section ID even with inconsistent department data", () => {
  assert.notEqual(feedbackEligibilityError(recipient, giver({ sectionId: "bag-1" })), "");
});
test("allows another department/section in the same division and business unit", () => {
  assert.equal(feedbackEligibilityError(recipient, giver()), "");
});
test("allows another division in the same unit and cross-unit candidates", () => {
  assert.equal(feedbackEligibilityError(recipient, giver({ division: "Divisi B" })), "");
  assert.equal(feedbackEligibilityError(recipient, giver({ companyUnit: "Unit B", department: recipient.department, departmentId: recipient.departmentId, section: recipient.section, sectionId: recipient.sectionId })), "");
});
test("legacy name comparisons normalize case and spacing; incomplete departments fail closed", () => {
  const legacy = { ...recipient, departmentId: undefined, sectionId: undefined };
  assert.notEqual(feedbackEligibilityError(legacy, giver({ departmentId: undefined, department: "  sdm  ", division: "DIVISI   A", sectionId: undefined })), "");
  assert.notEqual(feedbackEligibilityError(legacy, giver({ department: "" })), "");
});
test("nomination store rejects a prohibited giver even when called outside the UI", () => {
  assert.throws(() => nominateFeedbackGivers(recipient, [
    giver({ id: "one" }), giver({ id: "two", departmentId: recipient.departmentId }),
    giver({ id: "three" }),
  ]), /departemen/);
  assert.throws(() => nominateFeedbackGivers(recipient, [giver(), giver()]), /tepat tiga/);
});
test("nomination allows all three givers from one other department and preserves organization metadata", () => {
  const records = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });
  const submission = nominateFeedbackGivers(recipient, ["one", "two", "three"].map((id) => giver({ id })));
  assert.equal(submission.nominations?.length, 3);
  assert.equal(submission.nominations?.[0].giver.sectionId, "bag-2");
  assert.equal(submission.row.employeeId, recipient.id);
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "window");
});
