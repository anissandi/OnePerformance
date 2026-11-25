// Dynamic Master Company Group & Company Unit store (/settings/master/company)
// Persisted end-to-end to Supabase (`public.pa_master_catalogs` & `public.pa_kv_state`)
// and propagates Group / Unit renames across users, calibration, scores, groupings, and workflows.

import {
  refreshKvKeysFromBackend,
  safeGetLocalRaw,
  safeSetLocalJson,
  savePersistedState,
  selectRowsFromSupabase,
  syncToSupabase,
} from "../../../services/supabaseClient";

export const MASTER_COMPANY_CATALOG_KEY = "master_company_units_v1";
export const MASTER_COMPANY_UPDATED_EVENT = "pa-master-company-updated";

export interface MasterCompanyUnitRow {
  /** Kunci internal permanen baris unit usaha agar perubahan nama tetap terlacak */
  uid: string;
  /** Kunci internal permanen group (mis. "group-sambu", "group-rsup", atau "group-<id>") */
  groupUid: string;
  companyGroup: string;
  idGroup: string;
  abbGroup: string;
  companyUnit: string;
  idUnit: string;
  abbUnit: string;
  fullName?: string;
  /** Urutan tampilan Card Login di halaman `/login` (1 = paling kiri atas, dst.) */
  loginOrder?: number;
  /** Riwayat nama lama unit usaha agar referensi historis otomatis dipetakan ke nama terbaru */
  aliases?: string[];
  /** Riwayat nama lama group */
  groupAliases?: string[];
}

export interface MasterCompanyCatalog {
  rows: MasterCompanyUnitRow[];
  updatedAt?: string;
}

export interface DynamicCompanyLocation {
  uid: string;
  groupUid: string;
  companyGroup: string;
  idGroup: string;
  abbGroup: string;
  code: string;
  unitId: string;
  company: string;
  fullName: string;
  loginOrder: number;
}

export interface DynamicCompanyGroup {
  id: string;
  slug: string;
  name: string;
  idGroup: string;
  abbGroup: string;
  code: string;
  industry: string;
  unitNames: string[];
  units: MasterCompanyUnitRow[];
}

export const DEFAULT_MASTER_COMPANY_ROWS: MasterCompanyUnitRow[] = [
  {
    uid: "unit-psj",
    groupUid: "group-sambu",
    companyGroup: "Sambu Group",
    idGroup: "1",
    abbGroup: "SG",
    companyUnit: "PT Pulau Sambu (Jakarta)",
    idUnit: "11",
    abbUnit: "PSJ",
    fullName: "PT. Pulau Sambu (Jakarta)",
    loginOrder: 1,
    aliases: ["PT. Pulau Sambu (Jakarta)"],
  },
  {
    uid: "unit-psg",
    groupUid: "group-sambu",
    companyGroup: "Sambu Group",
    idGroup: "1",
    abbGroup: "SG",
    companyUnit: "PT Pulau Sambu (Guntung)",
    idUnit: "12",
    abbUnit: "PSG",
    fullName: "PT. Pulau Sambu (Guntung)",
    loginOrder: 2,
    aliases: ["PT. Pulau Sambu (Guntung)"],
  },
  {
    uid: "unit-pske",
    groupUid: "group-sambu",
    companyGroup: "Sambu Group",
    idGroup: "1",
    abbGroup: "SG",
    companyUnit: "PT Pulau Sambu (Kuala Enok)",
    idUnit: "13",
    abbUnit: "PSKE",
    fullName: "PT. Pulau Sambu (Kuala Enok)",
    loginOrder: 3,
    aliases: ["PT. Pulau Sambu (Kuala Enok)"],
  },
  {
    uid: "unit-rsup-ind",
    groupUid: "group-rsup",
    companyGroup: "RSUP Group",
    idGroup: "2",
    abbGroup: "RG",
    companyUnit: "PT RSUP (Industry)",
    idUnit: "21",
    abbUnit: "RSUP IND",
    fullName: "PT. Riau Sakti United Plantations (Industry)",
    loginOrder: 4,
    aliases: ["PT. Riau Sakti United Plantations (Industry)", "RSUP-IND"],
  },
  {
    uid: "unit-rsup-pkb",
    groupUid: "group-rsup",
    companyGroup: "RSUP Group",
    idGroup: "2",
    abbGroup: "RG",
    companyUnit: "PT RSUP (Perkebunan)",
    idUnit: "22",
    abbUnit: "RSUP PKB",
    fullName: "PT. Riau Sakti United Plantations (Perkebunan)",
    loginOrder: 5,
    aliases: ["PT. Riau Sakti United Plantations (Perkebunan)", "RSUP-PKB"],
  },
  {
    uid: "unit-rstm",
    groupUid: "group-rsup",
    companyGroup: "RSUP Group",
    idGroup: "2",
    abbGroup: "RG",
    companyUnit: "PT RSTM",
    idUnit: "23",
    abbUnit: "RSTM",
    fullName: "PT. Riau Sakti Transmandiri",
    loginOrder: 6,
    aliases: ["PT. Riau Sakti Transmandiri"],
  },
  {
    uid: "unit-ghs",
    groupUid: "group-rsup",
    companyGroup: "RSUP Group",
    idGroup: "2",
    abbGroup: "RG",
    companyUnit: "PT GHS",
    idUnit: "24",
    abbUnit: "GHS",
    fullName: "PT. Guntung Hasratmakmur",
    loginOrder: 7,
    aliases: ["PT. Guntung Hasratmakmur"],
  },
  {
    uid: "unit-rsup-asd",
    groupUid: "group-rsup",
    companyGroup: "RSUP Group",
    idGroup: "2",
    abbGroup: "RG",
    companyUnit: "PT RSUP ASD",
    idUnit: "25",
    abbUnit: "RSUP ASD",
    fullName: "Agronomi Service Division",
    loginOrder: 8,
    aliases: ["ASD", "RSUP ASD", "PT. RSUP ASD", "PT RSUP (ASD)", "RSUP-ASD"],
  },
];

function normToken(val?: string | null): string {
  return String(val ?? "")
    .trim()
    .toUpperCase()
    .replace(/^PT\.?\s+/i, "PT ")
    .replace(/\s+/g, " ");
}

export function makeGroupSlug(name: string): string {
  return (
    String(name ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "group"
  );
}

let _cachedRaw: string | null | undefined = undefined;
let _cachedCatalog: MasterCompanyCatalog | null = null;
let _seededBackendOnce = false;

export function loadMasterCompanyCatalog(): MasterCompanyCatalog {
  const raw = safeGetLocalRaw(MASTER_COMPANY_CATALOG_KEY);
  if (_cachedCatalog && _cachedRaw === raw) {
    return _cachedCatalog;
  }
  _cachedRaw = raw;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<MasterCompanyCatalog>;
      if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
        _cachedCatalog = {
          rows: parsed.rows.map((r, idx) => ({
            uid: r.uid || `unit-${idx + 1}`,
            groupUid: r.groupUid || `group-${makeGroupSlug(r.companyGroup || "group")}`,
            companyGroup: String(r.companyGroup ?? "").trim(),
            idGroup: String(r.idGroup ?? "").trim(),
            abbGroup: String(r.abbGroup ?? "").trim(),
            companyUnit: String(r.companyUnit ?? "").trim(),
            idUnit: String(r.idUnit ?? "").trim(),
            abbUnit: String(r.abbUnit ?? "").trim(),
            fullName: r.fullName ? String(r.fullName).trim() : String(r.companyUnit ?? "").trim(),
            loginOrder: typeof r.loginOrder === "number" && Number.isFinite(r.loginOrder) ? r.loginOrder : idx + 1,
            aliases: Array.isArray(r.aliases) ? r.aliases : [],
            groupAliases: Array.isArray(r.groupAliases) ? r.groupAliases : [],
          })),
          updatedAt: parsed.updatedAt,
        };
        return _cachedCatalog;
      }
    } catch {
      // fallback to default
    }
  }
  _cachedCatalog = {
    rows: JSON.parse(JSON.stringify(DEFAULT_MASTER_COMPANY_ROWS)),
  };
  return _cachedCatalog;
}

export function resolveMasterCompanyUnitName(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const target = normToken(s);
  if (target === "ASD" || target === "RSUP ASD" || target === "PT RSUP (ASD)" || target === "PT RSUP ASD") {
    const asdRow = loadMasterCompanyCatalog().rows.find((r) => r.uid === "unit-rsup-asd");
    if (asdRow) return asdRow.companyUnit;
    return "PT RSUP ASD";
  }
  const rows = loadMasterCompanyCatalog().rows;
  for (const r of rows) {
    if (normToken(r.companyUnit) === target) return r.companyUnit;
  }
  for (const r of rows) {
    if ((r.aliases ?? []).some((al) => normToken(al) === target)) {
      return r.companyUnit;
    }
  }
  return s;
}

export function resolveMasterGroupNameForUnit(companyOrGroup?: string | null): string {
  const s = String(companyOrGroup ?? "").trim();
  if (!s) {
    const groups = getMasterCompanyGroups();
    return groups[0]?.name ?? "RSUP Group";
  }
  const target = normToken(s);
  const rows = loadMasterCompanyCatalog().rows;
  // Cek apakah input memang nama Group / alias Group
  const byGroup = rows.find(
    (r) =>
      normToken(r.companyGroup) === target ||
      r.groupUid.toUpperCase() === target ||
      (r.groupAliases ?? []).some((ga) => normToken(ga) === target),
  );
  if (byGroup) return byGroup.companyGroup;
  // Cek berdasarkan Company Unit atau alias Unit
  const byUnit = rows.find(
    (r) =>
      normToken(r.companyUnit) === target ||
      normToken(r.abbUnit) === target ||
      (r.aliases ?? []).some((al) => normToken(al) === target),
  );
  if (byUnit) return byUnit.companyGroup;
  if (target.includes("SAMBU") || target.includes("GUNTUNG") || target.includes("KUALA ENOK")) {
    const sambu = rows.find((r) => r.groupUid === "group-sambu");
    return sambu?.companyGroup ?? "Sambu Group";
  }
  const rsup = rows.find((r) => r.groupUid === "group-rsup");
  return rsup?.companyGroup ?? rows[0]?.companyGroup ?? "RSUP Group";
}

export function getMasterCompanyLocations(): DynamicCompanyLocation[] {
  return [...loadMasterCompanyCatalog().rows]
    .map((r, idx) => ({ row: r, order: typeof r.loginOrder === "number" && Number.isFinite(r.loginOrder) ? r.loginOrder : idx + 1 }))
    .sort((a, b) => a.order - b.order)
    .map(({ row: r }, sortedIdx) => ({
      uid: r.uid,
      groupUid: r.groupUid,
      companyGroup: r.companyGroup,
      idGroup: r.idGroup,
      abbGroup: r.abbGroup,
      code: r.abbUnit || r.idUnit || r.companyUnit,
      unitId: r.idUnit || r.abbUnit,
      company: r.companyUnit,
      fullName: r.fullName || r.companyUnit,
      loginOrder: sortedIdx + 1,
    }));
}

export function getMasterCompanyGroups(): DynamicCompanyGroup[] {
  const rows = loadMasterCompanyCatalog().rows;
  const map = new Map<string, DynamicCompanyGroup>();
  for (const r of rows) {
    const key = r.groupUid || `group-${makeGroupSlug(r.companyGroup)}`;
    let g = map.get(key);
    if (!g) {
      g = {
        id: key,
        slug: makeGroupSlug(r.companyGroup),
        name: r.companyGroup,
        idGroup: r.idGroup,
        abbGroup: r.abbGroup,
        code: r.abbGroup ? `${r.abbGroup}-GRP` : `GRP-${r.idGroup || map.size + 1}`,
        industry: "0 Company Units",
        unitNames: [],
        units: [],
      };
      map.set(key, g);
    }
    g.unitNames.push(r.companyUnit);
    g.units.push(r);
    g.industry = `${g.units.length} Company Units`;
  }
  // Urutkan berdasarkan ID Group numerik/alfabetis, namun utamakan RSUP Group & Sambu Group sesuai urutan tampil
  return Array.from(map.values()).sort((a, b) => {
    const na = Number(a.idGroup);
    const nb = Number(b.idGroup);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.name.localeCompare(b.name);
  });
}

export function getMasterUnitsByGroupUidOrName(groupKey: string): string[] {
  const low = String(groupKey ?? "").trim().toLowerCase();
  const groups = getMasterCompanyGroups();
  const found = groups.find(
    (g) =>
      g.id.toLowerCase() === low ||
      g.slug === low ||
      g.name.toLowerCase() === low ||
      g.abbGroup.toLowerCase() === low,
  );
  return found ? [...found.unitNames] : [];
}

/**
 * Propagasi otomatis perubahan nama Company Unit atau Company Group ke seluruh state persisten & Supabase
 * sehingga data karyawan, kalibrasi, bobot skor, grouping jabatan, dan workflow langsung menyesuaikan.
 */
function propagateMasterCompanyRenames(
  unitRenameMap: Map<string, string>,
  groupRenameMap: Map<string, string>,
): void {
  if (unitRenameMap.size === 0 && groupRenameMap.size === 0) return;

  const mapUnit = (val?: string | null): string => {
    const s = String(val ?? "").trim();
    if (!s) return s;
    for (const [oldName, newName] of unitRenameMap.entries()) {
      if (normToken(oldName) === normToken(s)) return newName;
    }
    return s;
  };
  const mapGroup = (val?: string | null): string => {
    const s = String(val ?? "").trim();
    if (!s) return s;
    for (const [oldG, newG] of groupRenameMap.entries()) {
      if (normToken(oldG) === normToken(s)) return newG;
    }
    return s;
  };
  const remapRecordKeys = <T>(rec?: Record<string, T> | null): Record<string, T> | undefined => {
    if (!rec || typeof rec !== "object") return rec ?? undefined;
    const out: Record<string, T> = {};
    for (const [k, v] of Object.entries(rec)) {
      out[mapGroup(mapUnit(k))] = v;
    }
    return out;
  };

  // 1) Update pa_managed_users_v1 & sync ke tabel pa_users di Supabase
  try {
    const rawUsers = safeGetLocalRaw("pa_managed_users_v1");
    if (rawUsers) {
      const parsed = JSON.parse(rawUsers) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed)) {
        let changed = false;
        const updatedUsers = parsed.map((u) => {
          const nextComp = mapUnit(String(u.company ?? ""));
          const nextManaged = Array.isArray(u.managedUnits) ? (u.managedUnits as string[]).map(mapUnit) : u.managedUnits;
          const nextChecker = Array.isArray(u.checkerUnits) ? (u.checkerUnits as string[]).map(mapUnit) : u.checkerUnits;
          const nextBizChecker = Array.isArray(u.kpiBusinessCheckerUnits)
            ? (u.kpiBusinessCheckerUnits as string[]).map((x) => (x === "KPI Group" ? x : mapUnit(x)))
            : u.kpiBusinessCheckerUnits;
          const nextCal = remapRecordKeys(u.calibrationRoleByUnit as Record<string, unknown> | undefined);
          const nextSoy = remapRecordKeys(u.soyCalibrationRoleByUnit as Record<string, unknown> | undefined);
          if (nextComp !== u.company || JSON.stringify(nextManaged) !== JSON.stringify(u.managedUnits)) {
            changed = true;
          }
          return {
            ...u,
            company: nextComp,
            managedUnits: nextManaged,
            checkerUnits: nextChecker,
            kpiBusinessCheckerUnits: nextBizChecker,
            calibrationRoleByUnit: nextCal,
            soyCalibrationRoleByUnit: nextSoy,
          };
        });
        if (changed || unitRenameMap.size > 0) {
          savePersistedState("pa_managed_users_v1", updatedUsers);
          void syncToSupabase({ kind: "users-batch", users: updatedUsers });
        }
      }
    }
    const rawActive = safeGetLocalRaw("pa_active_user_v1");
    if (rawActive) {
      const act = JSON.parse(rawActive) as Record<string, unknown>;
      if (act && typeof act === "object") {
        act.company = mapUnit(String(act.company ?? ""));
        if (Array.isArray(act.managedUnits)) act.managedUnits = (act.managedUnits as string[]).map(mapUnit);
        safeSetLocalJson("pa_active_user_v1", act);
      }
    }
  } catch {
    // ignore
  }

  // 2) Update Calibration Settings (Company Units & Groups)
  try {
    const rawCalUnits = safeGetLocalRaw("calibration_hc_settings_2026");
    if (rawCalUnits) {
      const arr = JSON.parse(rawCalUnits) as Array<Record<string, unknown>>;
      if (Array.isArray(arr)) {
        const nextArr = arr.map((item) => ({
          ...item,
          name: mapUnit(String(item.name ?? "")),
        }));
        savePersistedState("calibration_hc_settings_2026", nextArr);
      }
    }
    const rawCalGroups = safeGetLocalRaw("calibration_group_settings_2026");
    if (rawCalGroups) {
      const arr = JSON.parse(rawCalGroups) as Array<Record<string, unknown>>;
      if (Array.isArray(arr)) {
        const nextArr = arr.map((g) => ({
          ...g,
          name: mapGroup(String(g.name ?? "")),
          slug: makeGroupSlug(mapGroup(String(g.name ?? ""))),
          unitNames: Array.isArray(g.unitNames) ? (g.unitNames as string[]).map(mapUnit) : g.unitNames,
        }));
        savePersistedState("calibration_group_settings_2026", nextArr);
      }
    }
  } catch {
    // ignore
  }

  // 3) Update Score Weights & Grouping Rules keys by unit
  for (const mapKey of ["pa_score_weights_by_unit_v1", "pa_group_rules_by_unit_v1"]) {
    try {
      const raw = safeGetLocalRaw(mapKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          savePersistedState(mapKey, remapRecordKeys(parsed) ?? parsed);
        }
      }
    } catch {
      // ignore
    }
  }
}

export function saveMasterCompanyCatalog(
  nextRows: MasterCompanyUnitRow[],
  changeDescription = "Updated Master Company & Unit catalog",
): MasterCompanyCatalog {
  const prevRows = loadMasterCompanyCatalog().rows;
  const prevByUid = new Map(prevRows.map((r) => [r.uid, r]));
  const unitRenameMap = new Map<string, string>();
  const groupRenameMap = new Map<string, string>();

  const enrichedRows: MasterCompanyUnitRow[] = nextRows.map((row, idx) => {
    const prev = prevByUid.get(row.uid);
    const aliasesSet = new Set<string>([...(prev?.aliases ?? []), ...(row.aliases ?? [])]);
    const groupAliasesSet = new Set<string>([...(prev?.groupAliases ?? []), ...(row.groupAliases ?? [])]);
    if (prev && prev.companyUnit.trim() && prev.companyUnit.trim() !== row.companyUnit.trim()) {
      aliasesSet.add(prev.companyUnit.trim());
      unitRenameMap.set(prev.companyUnit.trim(), row.companyUnit.trim());
    }
    if (prev && prev.companyGroup.trim() && prev.companyGroup.trim() !== row.companyGroup.trim()) {
      groupAliasesSet.add(prev.companyGroup.trim());
      groupRenameMap.set(prev.companyGroup.trim(), row.companyGroup.trim());
    }
    aliasesSet.delete(row.companyUnit.trim());
    groupAliasesSet.delete(row.companyGroup.trim());
    return {
      ...row,
      companyGroup: row.companyGroup.trim(),
      idGroup: row.idGroup.trim(),
      abbGroup: row.abbGroup.trim(),
      companyUnit: row.companyUnit.trim(),
      idUnit: row.idUnit.trim(),
      abbUnit: row.abbUnit.trim(),
      fullName: (row.fullName || row.companyUnit).trim(),
      loginOrder: typeof row.loginOrder === "number" && Number.isFinite(row.loginOrder) ? row.loginOrder : (prev?.loginOrder ?? idx + 1),
      aliases: Array.from(aliasesSet),
      groupAliases: Array.from(groupAliasesSet),
    };
  });

  const stamped: MasterCompanyCatalog = {
    rows: enrichedRows,
    updatedAt: new Date().toISOString(),
  };
  _cachedCatalog = stamped;
  _cachedRaw = JSON.stringify(stamped);

  savePersistedState(MASTER_COMPANY_CATALOG_KEY, stamped, {
    kind: "master-catalog",
    catalogKey: MASTER_COMPANY_CATALOG_KEY,
    data: stamped,
    audit: {
      action: "Update",
      module: "HR Settings",
      subModule: "Master Company",
      description: changeDescription,
    },
  });

  propagateMasterCompanyRenames(unitRenameMap, groupRenameMap);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MASTER_COMPANY_UPDATED_EVENT));
    window.dispatchEvent(new Event("pa-auth-updated"));
    window.dispatchEvent(new Event("pa-db-hydrated"));
  }
  return stamped;
}

export async function refreshMasterCompanyCatalogFromBackend(): Promise<MasterCompanyCatalog> {
  try {
    const [catRows, kvMap] = await Promise.all([
      selectRowsFromSupabase<{ catalog_key?: string; data?: MasterCompanyCatalog }>(
        "pa_master_catalogs",
        `select=catalog_key,data&catalog_key=eq.${MASTER_COMPANY_CATALOG_KEY}&limit=1`,
      ),
      refreshKvKeysFromBackend([MASTER_COMPANY_CATALOG_KEY]),
    ]);
    const fromCat = catRows?.[0]?.data;
    const fromKv = kvMap?.[MASTER_COMPANY_CATALOG_KEY] as MasterCompanyCatalog | undefined;
    const remote =
      (fromCat && Array.isArray(fromCat.rows) && fromCat.rows.length > 0 ? fromCat : null) ??
      (fromKv && Array.isArray(fromKv.rows) && fromKv.rows.length > 0 ? fromKv : null);
    if (remote) {
      _cachedCatalog = null;
      _cachedRaw = undefined;
      safeSetLocalJson(MASTER_COMPANY_CATALOG_KEY, remote);
      const loaded = loadMasterCompanyCatalog();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(MASTER_COMPANY_UPDATED_EVENT));
      }
      return loaded;
    }
    if (!_seededBackendOnce) {
      _seededBackendOnce = true;
      const initial = loadMasterCompanyCatalog();
      safeSetLocalJson(MASTER_COMPANY_CATALOG_KEY, initial);
      void syncToSupabase({
        kind: "master-catalog",
        catalogKey: MASTER_COMPANY_CATALOG_KEY,
        data: initial,
      });
      return initial;
    }
  } catch {
    // ignore network failure
  }
  return loadMasterCompanyCatalog();
}
