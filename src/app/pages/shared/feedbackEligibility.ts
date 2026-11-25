import { getGroupNameForUnit } from "../../store/authStore";

export interface FeedbackOrganization {
  id: string;
  companyUnit: string;
  division: string;
  department: string;
  departmentId?: string;
  section?: string;
  sectionId?: string;
  role?: string;
  groupings?: string;
}

const normalize = (value: string | undefined) => value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

/**
 * Validasi kelayakan pemberi feedback berdasarkan Role penerima:
 * - Director / DirectorNonOpr: tidak boleh satu Group
 * - GM / vGM: tidak boleh satu Unit Usaha
 * - Division: tidak boleh satu Divisi (pada Unit Usaha yang sama)
 * - Coordinator, HR Unit, Supervisor, Employee (dan lainnya): tidak boleh satu Departemen
 */
export function feedbackEligibilityError(recipient: FeedbackOrganization, giver: FeedbackOrganization): string {
  if (normalize(recipient.id) === normalize(giver.id)) return "Karyawan tidak dapat memilih dirinya sendiri.";
  if (![recipient.companyUnit, giver.companyUnit].every((value) => normalize(value))) {
    return "Data unit usaha dan departemen harus lengkap sebelum memilih pemberi feedback.";
  }

  const rRole = normalize(recipient.role);
  const rGroup = normalize(recipient.groupings);

  // 1) Role Director -> tidak boleh satu Group
  if (rRole === "director" || rRole === "directornonopr" || rGroup.includes("direktur") || rGroup.includes("director")) {
    const recGroup = normalize(getGroupNameForUnit(recipient.companyUnit));
    const givGroup = normalize(getGroupNameForUnit(giver.companyUnit));
    if (recGroup && recGroup === givGroup) {
      return "Untuk role Director, pemberi feedback tidak boleh berasal dari Group yang sama.";
    }
    return "";
  }

  // 2) Role GM / vGM -> tidak boleh satu Unit Usaha
  if (rRole === "gm" || rRole === "vgm" || rGroup === "gm / vgm") {
    if (normalize(recipient.companyUnit) === normalize(giver.companyUnit)) {
      return "Untuk role GM / vGM, pemberi feedback tidak boleh berasal dari Unit Usaha yang sama.";
    }
    return "";
  }

  if (normalize(recipient.companyUnit) !== normalize(giver.companyUnit)) return "";

  // 3) Role Division -> tidak boleh satu Divisi
  if (rRole === "division" || rGroup.includes("ka./wa.ka.div")) {
    if (normalize(recipient.division) && normalize(recipient.division) === normalize(giver.division)) {
      return "Untuk role Division, pemberi feedback tidak boleh berasal dari Divisi yang sama.";
    }
    return "";
  }

  // 4) Coordinator, HR Unit, Supervisor, Employee, Departement -> tidak boleh satu Departemen
  if (!normalize(recipient.department) || !normalize(giver.department)) {
    return "Data departemen harus lengkap sebelum memilih pemberi feedback.";
  }
  const sameDepartment = recipient.departmentId && giver.departmentId
    ? normalize(recipient.departmentId) === normalize(giver.departmentId)
    : normalize(recipient.division) === normalize(giver.division) && normalize(recipient.department) === normalize(giver.department);
  if (sameDepartment) return "Pemberi feedback harus berasal dari departemen yang berbeda dari penerima, meskipun bagiannya berbeda.";
  return "";
}
