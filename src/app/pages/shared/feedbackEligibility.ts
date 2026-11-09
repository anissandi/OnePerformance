export interface FeedbackOrganization {
  id: string;
  companyUnit: string;
  division: string;
  department: string;
  departmentId?: string;
  section?: string;
  sectionId?: string;
}

const normalize = (value: string | undefined) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

/** Compare actual organization membership, not names shared by different units. */
export function feedbackEligibilityError(recipient: FeedbackOrganization, giver: FeedbackOrganization): string {
  if (recipient.id === giver.id) return "Karyawan tidak dapat memilih dirinya sendiri.";
  if (![recipient.companyUnit, giver.companyUnit, recipient.department, giver.department].every((value) => normalize(value))) {
    return "Data unit usaha dan departemen harus lengkap sebelum memilih pemberi feedback.";
  }
  if (normalize(recipient.companyUnit) !== normalize(giver.companyUnit)) return "";
  const sameDepartment = recipient.departmentId && giver.departmentId
    ? normalize(recipient.departmentId) === normalize(giver.departmentId)
    : normalize(recipient.division) === normalize(giver.division) && normalize(recipient.department) === normalize(giver.department);
  const sameSection = recipient.sectionId && giver.sectionId
    ? normalize(recipient.sectionId) === normalize(giver.sectionId)
    : sameDepartment && !!normalize(recipient.section) && normalize(recipient.section) === normalize(giver.section);
  if (sameDepartment) return "Pemberi feedback harus berasal dari departemen yang berbeda dari penerima, meskipun bagiannya berbeda.";
  if (sameSection) return "Pemberi feedback tidak boleh berasal dari bagian yang sama dengan penerima.";
  return "";
}
