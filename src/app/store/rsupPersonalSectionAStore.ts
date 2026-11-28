import {
  getActiveUser,
  getGroupNameForUnit,
  isSameCompanyUnit,
  loadManagedUsers,
  RSUP_GROUP_COMPANIES,
  type ManagedUser,
} from "./authStore";
import { getReceivedWorkspaceDelegations } from "./delegationStore";
import { loadMasterKpiFormats } from "../pages/hr/settings/masterKpiStore";
import {
  buildEmployeeIdMatchSet,
  fetchEmployeeKpiSettingsLive,
  fetchEmployeeKpiTrackingLive,
  fetchEmployeeWorkflowRecordsLive,
  readEmployeeKpiSettingSlice,
  safeGetLocalRaw,
} from "../services/supabaseClient";
import { getKpiMonthStatuses, normalizeEmployeeId } from "../pages/shared/appraisalWorkflowStore";

export interface SectionAKpiLike {
  id?: string;
  no: string;
  section?: string;
  sectionAlphabet?: string;
  sectionLabel?: string;
  sectionBobot?: string;
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  bobot: string;
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: "Maximize" | "Minimize" | "Stabilize" | string;
  detailFormula: string;
  keterangan?: string;
  monthlyTargets?: Record<string, string>;
  colorIndicator?: boolean;
  indicatorMode?: "numeric" | "color" | "ratio";
  ratioType?: "default" | "custom";
  ratioPositiveLabel?: string;
  ratioNegativeLabel?: string;
  trackingPeriod?: string;
  periodicTargetBlock?: boolean;
  blockedMonths?: number[];
}

const DEFAULT_RSUP_SECTION_A_ITEMS: SectionAKpiLike[] = [
  {
    id: "rsup-sec-a-1",
    no: "1",
    section: "A",
    sectionAlphabet: "A.",
    sectionLabel: "Objective KPI",
    sectionBobot: "20%",
    perspektif: "Finansial",
    kpi: "Net Profit (dalam miliar)",
    satuan: "Rp Miliar /bulan",
    formula: "Jumlah",
    bobot: "10%",
    definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Industry",
    baseline2025: "687",
    target2026: "750",
    polaritas: "Maximize",
    detailFormula: "Jumlah laba bersih perusahaan\n\n*Pencapaian = Realisasi / Target",
    keterangan: "",
    monthlyTargets: {
      "Jan-26": "62.5",
      "Feb-26": "62.5",
      "Mar-26": "62.5",
      "Apr-26": "62.5",
      "May-26": "62.5",
      "Jun-26": "62.5",
      "Jul-26": "62.5",
      "Aug-26": "62.5",
      "Sep-26": "62.5",
      "Oct-26": "62.5",
      "Nov-26": "62.5",
      "Dec-26": "62.5",
    },
    indicatorMode: "numeric",
    trackingPeriod: "Bulan",
  },
  {
    id: "rsup-sec-a-2",
    no: "2",
    section: "A",
    sectionAlphabet: "A.",
    sectionLabel: "Objective KPI",
    sectionBobot: "20%",
    perspektif: "Proses",
    kpi: "Fatality Accident",
    satuan: "Kasus /bulan",
    formula: "Jumlah",
    bobot: "10%",
    definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja",
    source: "Laporan Komite K3",
    baseline2025: "1",
    target2026: "0",
    polaritas: "Minimize",
    detailFormula: "= Jumlah kasus Kecelakaan kerja yang menyebabkan kematian (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
    monthlyTargets: {
      "Jan-26": "0",
      "Feb-26": "0",
      "Mar-26": "0",
      "Apr-26": "0",
      "May-26": "0",
      "Jun-26": "0",
      "Jul-26": "0",
      "Aug-26": "0",
      "Sep-26": "0",
      "Oct-26": "0",
      "Nov-26": "0",
      "Dec-26": "0",
    },
    indicatorMode: "numeric",
    trackingPeriod: "Bulan",
  },
];

/** Mengecek apakah suatu Unit Usaha tergabung di dalam RSUP Group. */
export function isRsupGroupCompanyUnit(companyUnit?: string | null): boolean {
  const comp = String(companyUnit ?? "").trim();
  if (!comp) return false;
  const grp = getGroupNameForUnit(comp);
  if (grp.trim().toLowerCase().includes("rsup")) return true;
  return RSUP_GROUP_COMPANIES.some((u) => isSameCompanyUnit(u, comp));
}

/** Mengecek apakah baris KPI merupakan baris Net Profit (dalam miliar) pada Section A Objective KPI. */
export function isSectionANetProfitRow(item?: { section?: string; no?: string; kpi?: string } | null): boolean {
  if (!item) return false;
  const sec = String(item.section || "A").trim().toUpperCase();
  if (sec !== "A") return false;
  const kpiLower = String(item.kpi ?? "").trim().toLowerCase();
  if (kpiLower.includes("net profit")) return true;
  return String(item.no ?? "").trim() === "1" && !kpiLower.includes("fatality");
}

/** Mengecek apakah baris KPI merupakan baris Fatality Accident pada Section A Objective KPI. */
export function isSectionAFatalityRow(item?: { section?: string; no?: string; kpi?: string } | null): boolean {
  if (!item) return false;
  const sec = String(item.section || "A").trim().toUpperCase();
  if (sec !== "A") return false;
  const kpiLower = String(item.kpi ?? "").trim().toLowerCase();
  if (kpiLower.includes("fatality")) return true;
  return String(item.no ?? "").trim() === "2";
}

/**
 * Mencari akun Direktur Operasional RSUP Group (`role === "Director"` pada unit RSUP Group,
 * mengutamakan `PT RSUP (Industry)` sesuai aturan sistem PA).
 */
export function findRsupOperationalDirector(allUsers = loadManagedUsers()): ManagedUser | undefined {
  const candidates = allUsers.filter(
    (u) => u.status === "Active" && u.role === "Director" && isRsupGroupCompanyUnit(u.company),
  );
  if (candidates.length === 0) return undefined;
  return (
    candidates.find((u) => isSameCompanyUnit(u.company, "PT RSUP (Industry)")) ??
    candidates[0]
  );
}

/** Mengecek apakah `user` adalah Direktur Operasional RSUP Group (`role === "Director"` di RSUP Group). */
export function isRsupOperationalDirectorUser(user?: Pick<ManagedUser, "role" | "company"> | null): boolean {
  if (!user) return false;
  return user.role === "Director" && isRsupGroupCompanyUnit(user.company);
}

/**
 * Mengecek apakah `viewer` menerima delegasi aktif dari Direktur (`role === "Director"`) di RSUP Group
 * untuk KPI Setting atau KPI Tracking.
 */
export function hasActiveRsupDirectorKpiDelegation(
  viewer?: ManagedUser | null,
  phase?: "setting" | "measurement",
): boolean {
  const targetViewer = viewer ?? getActiveUser();
  if (!targetViewer?.employeeId) return false;
  const allUsers = loadManagedUsers();
  const phases: Array<"setting" | "measurement"> = phase ? [phase] : ["setting", "measurement"];
  for (const ph of phases) {
    const modKey = ph === "setting" ? "kpiSetting" : "kpiTracking";
    const received = getReceivedWorkspaceDelegations(targetViewer.employeeId, modKey, allUsers);
    if (received.some((d) => isRsupOperationalDirectorUser(d.delegator))) {
      return true;
    }
  }
  return false;
}

/**
 * Menentukan apakah `viewer` berhak melihat angka Baseline, Target, dan nilai bulanan
 * pada baris `Net Profit (dalam miliar)` (tidak disembunyikan dengan tag "confidential"):
 * - Level Direktur / BOD (`Director`, `DirectorNonOpr`, `BOD`) -> BOLEH melihat.
 * - Level GM ke bawah (`GM`, `VGM`, `Division`, `Departement`, `HR Unit`, `Supervisor`, `Employee`, dll.)
 *   -> DI-HIDE ("confidential"), KECUALI menerima delegasi aktif dari Direktur RSUP Group.
 */
export function canViewerSeeConfidentialNetProfit(
  viewer?: ManagedUser | null,
  phase?: "setting" | "measurement",
): boolean {
  const v = viewer ?? getActiveUser();
  if (!v) return false;
  if (v.role === "Director" || v.role === "DirectorNonOpr" || v.role === "BOD") {
    return true;
  }
  if (hasActiveRsupDirectorKpiDelegation(v, phase)) {
    return true;
  }
  return false;
}

/**
 * Menentukan apakah konteks sedang mengedit/tracking KPI Personal milik Direktur Operasional RSUP Group
 * (baik oleh Direktur Operasional sendiri maupun oleh penerima delegasi yang memiliki akses edit/create).
 */
export function canEditOrTrackRsupSectionA(
  ownerUser?: ManagedUser | null,
  actorUser?: ManagedUser | null,
  phase: "setting" | "measurement" = "setting",
): boolean {
  if (!ownerUser || !isRsupOperationalDirectorUser(ownerUser)) return false;
  const actor = actorUser ?? getActiveUser();
  if (!actor) return false;
  if (
    actor.id === ownerUser.id ||
    (isSameCompanyUnit(actor.company, ownerUser.company) &&
      actor.employeeId.trim().toLowerCase() === ownerUser.employeeId.trim().toLowerCase())
  ) {
    return true;
  }
  const received = getReceivedWorkspaceDelegations(
    actor.employeeId,
    phase === "setting" ? "kpiSetting" : "kpiTracking",
    loadManagedUsers(),
  );
  return received.some(
    (d) =>
      isRsupOperationalDirectorUser(d.delegator) &&
      d.delegator.employeeId.trim().toLowerCase() === ownerUser.employeeId.trim().toLowerCase() &&
      Boolean(d.access.edit || d.access.create),
  );
}

function readRawStoredPersonalKpiRows(employeeId: string): SectionAKpiLike[] | null {
  if (!employeeId) return null;
  try {
    const candidates = buildEmployeeIdMatchSet(employeeId);
    candidates.add(normalizeEmployeeId(employeeId));
    const raw = safeGetLocalRaw("pa_kpi_setting_by_emp_v2");
    const map = raw ? (JSON.parse(raw) as Record<string, SectionAKpiLike[]>) : {};
    for (const k of candidates) {
      if (k && Array.isArray(map[k]) && map[k].length > 0) return map[k];
    }
    const lowerSet = new Set(Array.from(candidates).map((c) => c.toLowerCase()));
    for (const [k, v] of Object.entries(map)) {
      if (lowerSet.has(k.toLowerCase()) && Array.isArray(v) && v.length > 0) return v;
    }
    const slice = readEmployeeKpiSettingSlice<SectionAKpiLike>(employeeId);
    if (slice && Array.isArray(slice.items) && slice.items.length > 0) {
      return slice.items;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Mengambil 2 baris template kanonik Section A Objective KPI (`No. 1 Net Profit (dalam miliar)` & `No. 2 Fatality Accident`)
 * dari `/kpi/kpi-format/kpi-personal` (`master_kpi_formats_v1`), serta meng-overlay perubahan Baseline / Target / Monthly Target
 * apabila Direktur Operasional RSUP Group telah memperbarui target Section A pada KPI Setting miliknya.
 */
export function getCanonicalRsupSectionAItems<T extends SectionAKpiLike = SectionAKpiLike>(
  fallbackPersonalFormat?: T[],
  skipDirectorOverlay = false,
): T[] {
  const fmt = loadMasterKpiFormats<SectionAKpiLike>({
    group: [],
    unit: [],
    personal: (fallbackPersonalFormat as SectionAKpiLike[] | undefined) ?? DEFAULT_RSUP_SECTION_A_ITEMS,
  });
  const masterSecA = (fmt.personal ?? []).filter((r) => (r.section || "A").toUpperCase() === "A");
  const masterRow1 =
    masterSecA.find((r) => isSectionANetProfitRow(r)) ??
    masterSecA[0] ??
    DEFAULT_RSUP_SECTION_A_ITEMS[0];
  const masterRow2 =
    masterSecA.find((r) => isSectionAFatalityRow(r)) ??
    masterSecA[1] ??
    DEFAULT_RSUP_SECTION_A_ITEMS[1];

  const buildCleanRow = (src: SectionAKpiLike, def: SectionAKpiLike, noStr: "1" | "2"): SectionAKpiLike => {
    const mt =
      src.monthlyTargets && Object.keys(src.monthlyTargets).length > 0
        ? { ...src.monthlyTargets }
        : def.monthlyTargets
        ? { ...def.monthlyTargets }
        : {};
    return {
      ...def,
      ...src,
      id: src.id || def.id || `rsup-sec-a-${noStr}`,
      no: noStr,
      section: "A",
      sectionAlphabet: "A.",
      sectionLabel: "Objective KPI",
      sectionBobot: "20%",
      bobot: src.bobot || def.bobot || "10%",
      baseline2025: String(src.baseline2025 ?? def.baseline2025 ?? ""),
      target2026: String(src.target2026 ?? def.target2026 ?? ""),
      monthlyTargets: mt,
      trackingPeriod: src.trackingPeriod || def.trackingPeriod || "Bulan",
    };
  };

  let row1 = buildCleanRow(masterRow1, DEFAULT_RSUP_SECTION_A_ITEMS[0], "1");
  let row2 = buildCleanRow(masterRow2, DEFAULT_RSUP_SECTION_A_ITEMS[1], "2");

  if (!skipDirectorOverlay) {
    const opDir = findRsupOperationalDirector();
    if (opDir?.employeeId) {
      const dirStored = readRawStoredPersonalKpiRows(opDir.employeeId);
      if (Array.isArray(dirStored) && dirStored.length > 0) {
        const dirSecA = dirStored.filter((r) => (r.section || "A").toUpperCase() === "A");
        const dirR1 = dirSecA.find((r) => isSectionANetProfitRow(r));
        const dirR2 = dirSecA.find((r) => isSectionAFatalityRow(r));
        if (dirR1) {
          row1 = {
            ...row1,
            baseline2025: String(dirR1.baseline2025 ?? row1.baseline2025),
            target2026: String(dirR1.target2026 ?? row1.target2026),
            monthlyTargets:
              dirR1.monthlyTargets && Object.keys(dirR1.monthlyTargets).length > 0
                ? { ...dirR1.monthlyTargets }
                : row1.monthlyTargets,
            periodicTargetBlock: dirR1.periodicTargetBlock,
            blockedMonths: dirR1.blockedMonths ? [...dirR1.blockedMonths] : undefined,
          };
        }
        if (dirR2) {
          row2 = {
            ...row2,
            baseline2025: String(dirR2.baseline2025 ?? row2.baseline2025),
            target2026: String(dirR2.target2026 ?? row2.target2026),
            monthlyTargets:
              dirR2.monthlyTargets && Object.keys(dirR2.monthlyTargets).length > 0
                ? { ...dirR2.monthlyTargets }
                : row2.monthlyTargets,
            periodicTargetBlock: dirR2.periodicTargetBlock,
            blockedMonths: dirR2.blockedMonths ? [...dirR2.blockedMonths] : undefined,
          };
        }
      }
    }
  }

  return [row1 as T, row2 as T];
}

/**
 * Menerapkan aturan wajib Section A Objective KPI (20%) untuk seluruh KPI Setting Personal pada unit RSUP Group:
 * - Mengganti (replace) baris Section A lama bila sudah ada dengan format & isi standar terbaru (No. 1 Net Profit & No. 2 Fatality Accident).
 * - Khusus Direktur Operasional RSUP Group, mempertahankan penyesuaian Baseline/Target/Monthly Target pada No. 1 & No. 2 miliknya.
 * - Mempertahankan 100% seluruh baris Section B+ milik user, serta menyesuaikan penomoran `no` Section B+ bila bentrok dengan `"1"` atau `"2"`.
 */
export function enforceRsupPersonalSectionA<T extends SectionAKpiLike>(
  rawItems: T[] | null | undefined,
  ownerUser?: Pick<ManagedUser, "employeeId" | "role" | "company"> | null,
  fallbackPersonalFormat?: T[],
): T[] {
  const list = Array.isArray(rawItems) ? rawItems : [];
  if (!ownerUser || !isRsupGroupCompanyUnit(ownerUser.company)) {
    return list;
  }
  const isOpDirector = isRsupOperationalDirectorUser(ownerUser);
  const canonicalSecA = getCanonicalRsupSectionAItems<T>(fallbackPersonalFormat, isOpDirector);

  let finalSecA: T[] = canonicalSecA.map((item) => ({ ...item }));
  if (isOpDirector && list.length > 0) {
    const existingSecA = list.filter((i) => (i.section || "A").toUpperCase() === "A");
    const ex1 = existingSecA.find((r) => isSectionANetProfitRow(r));
    const ex2 = existingSecA.find((r) => isSectionAFatalityRow(r));
    if (ex1) {
      finalSecA[0] = {
        ...finalSecA[0],
        id: ex1.id || finalSecA[0].id,
        baseline2025: String(ex1.baseline2025 ?? finalSecA[0].baseline2025),
        target2026: String(ex1.target2026 ?? finalSecA[0].target2026),
        monthlyTargets:
          ex1.monthlyTargets && Object.keys(ex1.monthlyTargets).length > 0
            ? { ...ex1.monthlyTargets }
            : finalSecA[0].monthlyTargets,
        periodicTargetBlock: ex1.periodicTargetBlock,
        blockedMonths: ex1.blockedMonths,
      };
    }
    if (ex2) {
      finalSecA[1] = {
        ...finalSecA[1],
        id: ex2.id || finalSecA[1].id,
        baseline2025: String(ex2.baseline2025 ?? finalSecA[1].baseline2025),
        target2026: String(ex2.target2026 ?? finalSecA[1].target2026),
        monthlyTargets:
          ex2.monthlyTargets && Object.keys(ex2.monthlyTargets).length > 0
            ? { ...ex2.monthlyTargets }
            : finalSecA[1].monthlyTargets,
        periodicTargetBlock: ex2.periodicTargetBlock,
        blockedMonths: ex2.blockedMonths,
      };
    }
  }

  const otherSectionItems = list
    .filter((i) => (i.section || "A").toUpperCase() !== "A")
    .map((item) => {
      const sec = (item.section || "B").toUpperCase();
      if (sec === "B" && (!item.sectionBobot || item.sectionBobot === "100%")) {
        return {
          ...item,
          section: "B",
          sectionAlphabet: "B.",
          sectionLabel: item.sectionLabel || "Functional KPI",
          sectionBobot: "80%",
        };
      }
      return item;
    });

  // Hindari bentrok nomor "1" atau "2" pada Section B+ apabila sebelumnya user memberi nomor mulai dari 1
  const hasNoConflict = otherSectionItems.some((i) => {
    const n = String(i.no ?? "").trim();
    return n === "1" || n === "2" || /^1[a-z]$/i.test(n) || /^2[a-z]$/i.test(n);
  });
  let adjustedOthers = otherSectionItems;
  if (hasNoConflict) {
    const usedNos = new Set<string>(["1", "2"]);
    let nextNumeric = 3;
    adjustedOthers = otherSectionItems.map((item) => {
      const rawNo = String(item.no ?? "").trim();
      if (rawNo && !usedNos.has(rawNo.toLowerCase()) && !/^[12][a-z]?$/i.test(rawNo)) {
        usedNos.add(rawNo.toLowerCase());
        const parsedInt = parseInt(rawNo, 10);
        if (Number.isFinite(parsedInt) && parsedInt >= nextNumeric) {
          nextNumeric = parsedInt + 1;
        }
        return item;
      }
      while (usedNos.has(String(nextNumeric))) nextNumeric++;
      const assigned = String(nextNumeric++);
      usedNos.add(assigned);
      return { ...item, no: assigned };
    });
  }

  return [...finalSecA, ...adjustedOthers];
}

export interface DirectorValidatedSectionATracking {
  director?: ManagedUser;
  /** Daftar bulan (id = label kanonik seperti "Jan-26") pada KPI Tracking Personal Direktur yang sudah berstatus Validated */
  validatedMonths: Array<{ id: string; label: string }>;
  /** Peta sel Section A (`1__0`, `1__1`, `2__0`, `2__1`, dst.) per label bulan Validated (mis. key `"Jan-26"`) */
  validatedCellsByMonthLabel: Record<string, Record<string, string>>;
}

/**
 * Membaca snapshot bulan & nilai sel Section A yang SUDAH VALIDATED dari KPI Tracking Personal
 * Direktur Operasional RSUP Group (`/bod/measurement/kpi-tracking`).
 */
export function getRsupDirectorValidatedSectionATracking(): DirectorValidatedSectionATracking {
  const opDir = findRsupOperationalDirector();
  if (!opDir?.employeeId) {
    return { validatedMonths: [], validatedCellsByMonthLabel: {} };
  }
  const statuses = getKpiMonthStatuses(opDir.employeeId);
  const validatedLabels = new Set(
    statuses.filter((m) => m.state === "validated").map((m) => m.label),
  );
  if (validatedLabels.size === 0) {
    return { director: opDir, validatedMonths: [], validatedCellsByMonthLabel: {} };
  }

  const normId = normalizeEmployeeId(opDir.employeeId);
  const candidates = [normId, ...Array.from(buildEmployeeIdMatchSet(opDir.employeeId))];
  let snap: { months?: Array<{ id: string; label: string; cells?: Record<string, string> }>; cellsMap?: Record<string, Record<string, string>> } | null = null;
  for (const cand of candidates) {
    if (!cand) continue;
    const raw = safeGetLocalRaw(`kpi_tracking_v1_${cand}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.months)) {
          snap = parsed;
          break;
        }
      } catch {
        // ignore
      }
    }
  }
  if (!snap || !Array.isArray(snap.months)) {
    return { director: opDir, validatedMonths: [], validatedCellsByMonthLabel: {} };
  }

  const validatedMonths: Array<{ id: string; label: string }> = [];
  const validatedCellsByMonthLabel: Record<string, Record<string, string>> = {};
  for (const m of snap.months) {
    if (!validatedLabels.has(m.label)) continue;
    const srcCells = { ...(m.cells ?? {}), ...(snap.cellsMap?.[m.id] ?? {}) };
    const secACells: Record<string, string> = {};
    for (const [k, v] of Object.entries(srcCells)) {
      if (k.startsWith("1__") || k.startsWith("2__")) {
        secACells[k] = String(v ?? "");
      }
    }
    validatedMonths.push({ id: m.label, label: m.label });
    validatedCellsByMonthLabel[m.label] = secACells;
  }

  return {
    director: opDir,
    validatedMonths,
    validatedCellsByMonthLabel,
  };
}

/**
 * Menarik data terbaru KPI Setting, KPI Tracking, dan Workflow Direktur Operasional RSUP Group dari Supabase
 * di latar belakang agar seluruh karyawan RSUP Group menerima pembaruan Section A secara lintas perangkat.
 */
export async function syncRsupDirectorSectionAFromBackend(): Promise<void> {
  const opDir = findRsupOperationalDirector();
  if (!opDir?.employeeId) return;
  await Promise.all([
    fetchEmployeeWorkflowRecordsLive(opDir.employeeId),
    fetchEmployeeKpiSettingsLive(opDir.employeeId),
    fetchEmployeeKpiTrackingLive(opDir.employeeId),
  ]);
}
