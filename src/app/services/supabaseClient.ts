import { projectId as fallbackProjectId, publicAnonKey as fallbackAnonKey } from "../../../utils/supabase/info";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const configuredSupabaseUrl =
  env.VITE_SUPABASE_URL?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";

const inferredProjectId =
  configuredSupabaseUrl.match(/^https?:\/\/([^./]+)\.supabase\.co/i)?.[1] || "";

export const SUPABASE_PROJECT_ID =
  env.VITE_SUPABASE_PROJECT_ID?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PROJECT_ID?.trim() ||
  inferredProjectId ||
  fallbackProjectId;

export const SUPABASE_URL =
  configuredSupabaseUrl.replace(/\/+$/, "") || `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim() ||
  fallbackAnonKey;

export const PA_APP_API_BASE = `${SUPABASE_URL}/functions/v1/make-server-74dadec6/pa-app`;
export const VERCEL_SYNC_API = "/api/pa-sync";

async function callVercelSyncApi(init?: RequestInit, query = ""): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`${VERCEL_SYNC_API}${query}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return null;
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
export const SUPABASE_REST_BASE = `${SUPABASE_URL}/rest/v1`;
export const SUPABASE_STORAGE_BASE = `${SUPABASE_URL}/storage/v1`;

async function restUpsert(table: string, rowOrRows: unknown, onConflict?: string): Promise<boolean> {
  try {
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    const res = await fetch(`${SUPABASE_REST_BASE}/${table}${qs}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rowOrRows),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function restInsert(table: string, rowOrRows: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_REST_BASE}/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rowOrRows),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function restSelect<T = Record<string, unknown>>(table: string, query = "select=*"): Promise<T[]> {
  try {
    const res = await fetch(`${SUPABASE_REST_BASE}/${table}?${query}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

/** Query baca langsung ke tabel Supabase (PostgREST). */
export async function selectRowsFromSupabase<T = Record<string, unknown>>(table: string, query = "select=*"): Promise<T[]> {
  return restSelect<T>(table, query);
}

function canonicalizeDbCompanyUnit(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const u = s.toUpperCase().replace(/\s+/g, " ");
  if (u === "ASD" || u === "RSUP ASD" || u === "PT. RSUP ASD" || u === "PT RSUP (ASD)" || u === "PT RSUP ASD") {
    return "PT RSUP ASD";
  }
  return s;
}

function normalizeDbApproverPair(rawAp1: unknown, rawAp2: unknown): { regNoAp1: string; regNoAp2: string } {
  const clean = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const u = s.toUpperCase();
    return u === "-" || u === "—" || u === "N/A" || u === "NA" || u === "NULL" || u === "UNDEFINED" ? "" : s;
  };
  const a1 = clean(rawAp1);
  const a2 = clean(rawAp2);
  if (a1 && !a2) return { regNoAp1: a1, regNoAp2: a1 };
  if (!a1 && a2) return { regNoAp1: a2, regNoAp2: a2 };
  return { regNoAp1: a1, regNoAp2: a2 };
}

let legacyAsdDbMigrationTriggered = false;
async function migrateLegacyAsdInSupabaseTables(): Promise<void> {
  if (legacyAsdDbMigrationTriggered) return;
  legacyAsdDbMigrationTriggered = true;
  const now = new Date().toISOString();
  const patchTable = async (pathAndQuery: string, body: Record<string, unknown>) => {
    try {
      await fetch(`${SUPABASE_REST_BASE}/${pathAndQuery}`, {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      // ignore offline
    }
  };
  await Promise.all([
    patchTable("pa_users?company=in.(ASD,RSUP%20ASD)", { company: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_kpi_settings?company_unit=in.(ASD,RSUP%20ASD)", { company_unit: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_open_lock_requests?company_unit=in.(ASD,RSUP%20ASD)", { company_unit: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_interview_schedules?company_unit=in.(ASD,RSUP%20ASD)", { company_unit: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_calibration_settings?unit_name=in.(ASD,RSUP%20ASD)", { unit_name: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_calibration_adjustments?unit_name=in.(ASD,RSUP%20ASD)", { unit_name: "PT RSUP ASD", updated_at: now }),
    patchTable("pa_evidence_files?company_unit=in.(ASD,RSUP%20ASD)", { company_unit: "PT RSUP ASD" }),
  ]);
}

async function syncDirectToPostgrest(payload: Record<string, unknown>): Promise<boolean> {
  const kind = String(payload.kind ?? "");
  const now = new Date().toISOString();
  let ok = false;

  if (kind === "kv-state" && payload.stateKey) {
    ok = await restUpsert(
      "pa_kv_state",
      { state_key: String(payload.stateKey), state_value: payload.stateValue ?? {}, updated_at: now },
      "state_key",
    );
  } else if (kind === "user-upsert" && payload.user) {
    const u = payload.user as Record<string, unknown>;
    const apPair = normalizeDbApproverPair(u.regNoAp1, u.regNoAp2);
    const fullRow = {
      employee_id: String(u.employeeId ?? ""),
      no: String(u.no ?? ""),
      reg_no: String(u.regNo ?? ""),
      name: String(u.name ?? ""),
      email: String(u.email ?? ""),
      position: String(u.position ?? ""),
      company: canonicalizeDbCompanyUnit(u.company ?? ""),
      unit_id: String(u.unitId ?? "IND"),
      division: String(u.division ?? ""),
      department: String(u.department ?? ""),
      bagian: String(u.bagian ?? ""),
      join_date: String(u.joinDate ?? ""),
      telegram_no: String(u.telegramNo ?? ""),
      grade: String(u.grade ?? "Grade 5"),
      role: String(u.role || "Employee"),
      groupings: String(u.groupings ?? "Operasional"),
      status: String(u.status ?? "Active"),
      last_login: String(u.lastLogin ?? ""),
      reg_no_ap1: apPair.regNoAp1,
      reg_no_ap2: apPair.regNoAp2,
      is_hr_unit_checker: Boolean(u.isHrUnitChecker ?? u.role === "HR Unit"),
      is_hr_icf_validator: Boolean(u.isHrIcfValidator ?? (u.role === "HR ICF" || u.role === "Administrator")),
      checker_units: Array.isArray(u.checkerUnits)
        ? Array.from(new Set((u.checkerUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
        : [],
      managed_units: Array.isArray(u.managedUnits)
        ? Array.from(new Set((u.managedUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
        : [],
      updated_at: now,
    };
    ok = await restUpsert("pa_users", fullRow, "employee_id");
    if (!ok) {
      const { checker_units: _cu, managed_units: _mu, ...legacyRow } = fullRow;
      ok = await restUpsert("pa_users", legacyRow, "employee_id");
    }
    if (!ok) {
      // Fallback if 202611030001 alter table migration has not been run yet
      ok = await restUpsert(
        "pa_users",
        {
          employee_id: fullRow.employee_id,
          name: fullRow.name,
          email: fullRow.email,
          position: fullRow.position,
          company: fullRow.company,
          unit_id: fullRow.unit_id,
          division: fullRow.division,
          department: fullRow.department,
          grade: fullRow.grade,
          role: fullRow.role,
          groupings: fullRow.groupings,
          status: fullRow.status,
          last_login: fullRow.last_login,
          updated_at: now,
        },
        "employee_id",
      );
    }
  } else if (kind === "users-batch" && Array.isArray(payload.users)) {
    const valid = (payload.users as Array<Record<string, unknown>>).filter((u) => Boolean(u && String(u.employeeId ?? "").trim()));
    if (valid.length > 0) {
      const fullRows = valid.map((u) => {
        const apPair = normalizeDbApproverPair(u.regNoAp1, u.regNoAp2);
        return {
        employee_id: String(u.employeeId ?? "").trim(),
        no: String(u.no ?? ""),
        reg_no: String(u.regNo ?? ""),
        name: String(u.name || "-"),
        email: String(u.email ?? ""),
        position: String(u.position || "-"),
        company: canonicalizeDbCompanyUnit(u.company || "PT RSUP (Industry)"),
        unit_id: String(u.unitId ?? "IND"),
        division: String(u.division || "-"),
        department: String(u.department || "-"),
        bagian: String(u.bagian ?? ""),
        join_date: String(u.joinDate ?? ""),
        telegram_no: String(u.telegramNo ?? ""),
        grade: String(u.grade || "Grade 5"),
        role: String(u.role || "Employee"),
        groupings: String(u.groupings || "Operasional"),
        status: u.status === "Inactive" ? "Inactive" : "Active",
        last_login: String(u.lastLogin ?? ""),
        reg_no_ap1: apPair.regNoAp1,
        reg_no_ap2: apPair.regNoAp2,
        is_hr_unit_checker: Boolean(u.isHrUnitChecker ?? u.role === "HR Unit"),
        is_hr_icf_validator: Boolean(u.isHrIcfValidator ?? (u.role === "HR ICF" || u.role === "Administrator")),
        checker_units: Array.isArray(u.checkerUnits)
          ? Array.from(new Set((u.checkerUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
          : [],
        managed_units: Array.isArray(u.managedUnits)
          ? Array.from(new Set((u.managedUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
          : [],
        updated_at: now,
        };
      });
      ok = await restUpsert("pa_users", fullRows, "employee_id");
      if (!ok) {
        const legacyRows = fullRows.map(({ checker_units: _cu, managed_units: _mu, ...rest }) => rest);
        ok = await restUpsert("pa_users", legacyRows, "employee_id");
      }
      if (!ok) {
        const minRows = fullRows.map((r) => ({
          employee_id: r.employee_id,
          name: r.name,
          email: r.email,
          position: r.position,
          company: r.company,
          unit_id: r.unit_id,
          division: r.division,
          department: r.department,
          grade: r.grade,
          role: r.role,
          groupings: r.groupings,
          status: r.status,
          last_login: r.last_login,
          updated_at: now,
        }));
        ok = await restUpsert("pa_users", minRows, "employee_id");
      }
    }
  } else if (kind === "user-delete" && payload.employeeId) {
    try {
      const res = await fetch(
        `${SUPABASE_REST_BASE}/pa_users?employee_id=eq.${encodeURIComponent(String(payload.employeeId))}`,
        {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
  } else if (kind === "group-rules" && Array.isArray(payload.rules)) {
    const company = String(payload.company ?? "DEFAULT");
    const rows = (payload.rules as Array<Record<string, unknown>>).map((r) => ({
      id: `${company}::${r.id}`,
      company,
      position: r.position,
      group_name: r.group,
      description: r.description ?? "",
      allowed_modules: r.allowedModules ?? [],
      updated_at: now,
    }));
    ok = await restUpsert("pa_group_rules", rows, "id");
  } else if (kind === "role-permissions" && payload.role && payload.permissions) {
    ok = await restUpsert(
      "pa_role_permissions",
      { role: payload.role, permissions: payload.permissions, updated_at: now },
      "role",
    );
  } else if (kind === "menu-configs" && Array.isArray(payload.menus)) {
    ok = await restUpsert(
      "pa_menu_configs",
      { id: "default", menus: payload.menus, updated_at: now },
      "id",
    );
  } else if (kind === "module-window" && payload.window) {
    const w = payload.window as Record<string, unknown>;
    ok = await restUpsert(
      "pa_module_windows",
      {
        unit_id: w.unitId ?? "ALL",
        module_id: w.moduleId,
        period: w.period ?? "2026",
        active: Boolean(w.active),
        start_date: w.startDate ?? "",
        end_date: w.endDate ?? "",
        extra: w.extra ?? {},
        updated_by: w.updatedBy ?? null,
        updated_at: now,
      },
      "unit_id,module_id,period",
    );
  } else if (kind === "workflow-document" && payload.doc) {
    const d = payload.doc as Record<string, unknown>;
    ok = await restUpsert(
      "pa_workflow_documents",
      {
        doc_key: d.key,
        employee_id: d.employeeId,
        unit_id: d.unitId ?? "IND",
        module: d.module,
        phase: d.phase ?? "measurement",
        period: d.year ?? "2026",
        status: d.status ?? "Pending",
        version: Number(d.version ?? 1),
        payload: d.payload ?? d,
        updated_by: d.actorId ?? null,
        updated_at: now,
      },
      "doc_key",
    );
  } else if (kind === "workflow-delete" && Array.isArray(payload.docKeys)) {
    const cleanKeys = (payload.docKeys as unknown[])
      .map((k) => encodeURIComponent(String(k ?? "").trim()))
      .filter(Boolean)
      .join(",");
    if (cleanKeys) {
      try {
        const res = await fetch(`${SUPABASE_REST_BASE}/pa_workflow_documents?doc_key=in.(${cleanKeys})`, {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
    }
  } else if (kind === "open-lock" && payload.request) {
    const r = payload.request as Record<string, unknown>;
    ok = await restUpsert(
      "pa_open_lock_requests",
      {
        id: r.id,
        employee_id: r.employeeId,
        employee_name: r.employeeName,
        company_unit: r.companyUnit ?? "PT RSUP (Industry)",
        divisi: r.divisi,
        departemen: r.departemen,
        bagian: r.bagian,
        posisi: r.posisi,
        module: r.module,
        period: r.period,
        original_deadline: r.originalDeadline,
        submitted_at: r.submittedAt,
        reason: r.reason,
        status: r.status,
        approved_until: r.approvedUntil ?? null,
        approved_at: r.approvedAt ?? null,
        approval_note: r.approvalNote ?? null,
        rejected_at: r.rejectedAt ?? null,
        decided_by: r.decidedBy ?? null,
        updated_at: now,
      },
      "id",
    );
  } else if (kind === "app-notification" && payload.notification) {
    const n = payload.notification as {
      employeeIds?: string[];
      module?: string;
      status?: string;
      message?: string;
      link?: string;
    };
    const targets = Array.isArray(n.employeeIds) ? n.employeeIds.filter(Boolean) : [];
    if (targets.length > 0) {
      const results = await Promise.all(
        targets.map((empId) =>
          restInsert("pa_app_notifications", {
            recipient_id: String(empId),
            employee_id: String(empId),
            module: String(n.module || "PA"),
            status: String(n.status || "Info"),
            message: String(n.message || ""),
            link: String(n.link || "/"),
            is_read: false,
          }),
        ),
      );
      ok = results.some(Boolean);
    } else {
      ok = true;
    }
  } else if (kind === "interview-schedule" && payload.schedule) {
    const s = payload.schedule as Record<string, unknown>;
    ok = await restUpsert(
      "pa_interview_schedules",
      {
        id: s.id,
        company_unit: s.companyUnit,
        added_users: s.addedUsers ?? [],
        interviewers: s.interviewers ?? [],
        other_users: s.otherUsers ?? [],
        scheduled_date: s.scheduledDate,
        scheduled_time: s.scheduledTime,
        location: s.location ?? "",
        text_notifikasi: s.textNotifikasi ?? "",
        text_lampiran: s.textLampiran ?? "",
        status: s.status ?? "Scheduled",
        updated_at: now,
      },
      "id",
    );
  } else if (kind === "master-catalog" && payload.catalogKey) {
    ok = await restUpsert(
      "pa_master_catalogs",
      { catalog_key: String(payload.catalogKey), data: payload.data ?? {}, updated_at: now },
      "catalog_key",
    );
  } else if (kind === "score-weights" && payload.companyUnit) {
    ok = await restUpsert(
      "pa_score_weights",
      { company_unit: String(payload.companyUnit), weights: payload.weights ?? {}, updated_at: now },
      "company_unit",
    );
  } else if (kind === "approval-config" && payload.configKey) {
    ok = await restUpsert(
      "pa_approval_configs",
      { config_key: String(payload.configKey), data: payload.data ?? {}, updated_at: now },
      "config_key",
    );
  } else if (kind === "cycle-config") {
    ok = await restUpsert(
      "pa_cycle_configs",
      { cycle_id: String(payload.cycleId ?? "2026"), data: payload.data ?? {}, updated_at: now },
      "cycle_id",
    );
  } else if (kind === "data-sync" && Array.isArray(payload.items)) {
    const rows = (payload.items as Array<Record<string, unknown>>).map((item) => ({
      sync_id: String(item.id),
      label: String(item.label ?? item.id),
      last_sync: item.lastSync ?? now,
      status: String(item.status ?? "success"),
      updated_at: now,
    }));
    ok = await restUpsert("pa_data_sync_logs", rows, "sync_id");
  } else if (kind === "kpi-business" && Array.isArray(payload.items)) {
    ok = await restUpsert(
      "pa_kpi_business",
      {
        id: String(payload.id ?? "corporate-2026"),
        period: String(payload.period ?? "2026"),
        items: payload.items,
        status: String(payload.status ?? "Submitted"),
        updated_at: now,
      },
      "id",
    );
  } else if (kind === "kpi-setting" && payload.docKey) {
    ok = await restUpsert(
      "pa_kpi_settings",
      {
        doc_key: String(payload.docKey),
        employee_id: String(payload.employeeId ?? "E002"),
        company_unit: String(payload.companyUnit ?? "PT RSUP (Industry)"),
        tab: String(payload.tab ?? "personal"),
        period: String(payload.period ?? "2026"),
        items: payload.items ?? [],
        status: String(payload.status ?? "Submitted"),
        updated_at: now,
      },
      "doc_key",
    );
  } else if (kind === "kpi-tracking" && payload.docKey) {
    ok = await restUpsert(
      "pa_kpi_trackings",
      {
        doc_key: String(payload.docKey),
        employee_id: String(payload.employeeId ?? "E002"),
        period: String(payload.period ?? "2026"),
        months: payload.months ?? [],
        cells_map: payload.cellsMap ?? {},
        monthly_notes: payload.monthlyNotes ?? {},
        comments: payload.comments ?? {},
        updated_at: now,
      },
      "doc_key",
    );
  } else if (kind === "rca-submission" && payload.submission) {
    const sub = payload.submission as Record<string, unknown>;
    const empKey = String(sub.employeeId ?? "E002").trim();
    const rawDocKey = String(sub.key ?? sub.id ?? "");
    const scopedDocKey =
      empKey && rawDocKey && !rawDocKey.startsWith(`${empKey}::`)
        ? `${empKey}::${rawDocKey}`
        : rawDocKey;
    ok = await restUpsert(
      "pa_rca_submissions",
      {
        doc_key: scopedDocKey,
        employee_id: empKey || "E002",
        period: String(sub.year ?? "2026"),
        kpi_indicator: String(sub.kpiIndicator ?? ""),
        periode: String(sub.periode ?? ""),
        submission: sub,
        approval_decisions: payload.approvalDecisions ?? [],
        updated_at: now,
      },
      "doc_key",
    );
  } else if (kind === "smart-goals") {
    ok = await restUpsert(
      "pa_smart_goals",
      {
        employee_id: String(payload.employeeId ?? "E002"),
        period: String(payload.period ?? "2026"),
        goals: payload.goals ?? [],
        checkin_entries: payload.checkinEntries ?? [],
        approval_decisions: payload.approvalDecisions ?? [],
        status: String(payload.status ?? "Submitted"),
        updated_at: now,
      },
      "employee_id,period",
    );
  } else if (kind === "appraisal-form") {
    ok = await restUpsert(
      "pa_appraisal_forms",
      {
        employee_id: String(payload.employeeId ?? "E002"),
        period: String(payload.period ?? "2026"),
        self_ratings: payload.selfRatings ?? null,
        approver_ratings: payload.approverRatings ?? [],
        status: String(payload.status ?? "Submitted"),
        updated_at: now,
      },
      "employee_id,period",
    );
  } else if (kind === "managerial-skill") {
    ok = await restUpsert(
      "pa_managerial_skills",
      {
        employee_id: String(payload.employeeId ?? "E002"),
        period: String(payload.period ?? "2026"),
        self_ratings: payload.selfRatings ?? null,
        approver_ratings: payload.approverRatings ?? [],
        status: String(payload.status ?? "Submitted"),
        updated_at: now,
      },
      "employee_id,period",
    );
  } else if (kind === "inter-dept-feedback" && payload.submission) {
    const sub = payload.submission as { row?: { no?: string; employeeId?: string } };
    ok = await restUpsert(
      "pa_inter_dept_feedbacks",
      {
        submission_id: String(sub.row?.no ?? `IDF-${Date.now()}`),
        employee_id: String(sub.row?.employeeId ?? "E002"),
        period: "2026",
        submission: sub,
        updated_at: now,
      },
      "submission_id",
    );
  } else if (kind === "project-records" && payload.employeeId) {
    ok = await restUpsert(
      "pa_project_records",
      {
        employee_id: String(payload.employeeId),
        period: String(payload.period ?? "2026"),
        file_name: String(payload.fileName ?? "Project_ICF_2026.xlsx"),
        submitted: Boolean(payload.submitted ?? true),
        submitted_date: String(payload.submittedDate ?? now.slice(0, 10)),
        rows: payload.rows ?? [],
        updated_at: now,
      },
      "employee_id,period",
    );
  } else if (kind === "interview-assessment" && payload.employeeId) {
    ok = await restUpsert(
      "pa_interview_assessments",
      {
        employee_id: String(payload.employeeId),
        period: String(payload.period ?? "2026"),
        schedule_period: String(payload.schedulePeriod ?? "15–17 January 2027"),
        penilai: payload.penilai ?? [],
        penilai1_score: payload.penilai1Score ?? null,
        updated_at: now,
      },
      "employee_id,period",
    );
  } else if (kind === "calibration-setting" && payload.unitId) {
    ok = await restUpsert(
      "pa_calibration_settings",
      {
        unit_id: String(payload.unitId),
        unit_name: String(payload.unitName ?? payload.unitId),
        data: payload.data ?? {},
        updated_at: now,
      },
      "unit_id",
    );
  } else if (kind === "year-end-verification" && payload.state) {
    ok = await restUpsert(
      "pa_year_end_verifications",
      { period: String(payload.period ?? "2026"), state: payload.state, updated_at: now },
      "period",
    );
  } else if (kind === "calibration-adjustment" && payload.adjustmentKey) {
    ok = await restUpsert(
      "pa_calibration_adjustments",
      {
        adjustment_key: String(payload.adjustmentKey),
        unit_name: String(payload.unitName ?? "PT RSUP (Industry)"),
        employee_id: String(payload.employeeId ?? "E002"),
        period: String(payload.period ?? "2026"),
        proposed_score: payload.proposedScore ?? null,
        proposed_grade: payload.proposedGrade ?? null,
        reason: String(payload.reason ?? ""),
        status: String(payload.status ?? "Submitted"),
        bod_decision: payload.bodDecision ?? null,
        bod_note: payload.bodNote ?? null,
        data: payload.data ?? {},
        updated_at: now,
      },
      "adjustment_key",
    );
  } else if (kind === "management-override" && payload.overrideId) {
    ok = await restUpsert(
      "pa_management_overrides",
      {
        override_id: String(payload.overrideId),
        employee_id: String(payload.employeeId ?? "E002"),
        module: String(payload.module ?? "KPI"),
        data: payload.data ?? {},
        updated_at: now,
      },
      "override_id",
    );
  }

  if (payload.audit && typeof payload.audit === "object") {
    const a = payload.audit as Record<string, string>;
    await restInsert("pa_audit_trail", {
      timestamp: a.timestamp ?? now.slice(0, 19).replace("T", " "),
      user_id: a.userId ?? "SYSTEM",
      user_name: a.userName ?? "System",
      role: a.role ?? "Employee",
      action: a.action ?? "Update",
      module: a.module ?? "Performance Appraisal",
      sub_module: a.subModule ?? "-",
      description: a.description ?? "",
      status: a.status ?? "Success",
    });
  }

  return ok;
}

export interface UploadedEvidenceRecord {
  id: string;
  employeeId: string;
  fullName: string;
  companyUnit: string;
  division: string;
  department: string;
  position: string;
  moduleType: string;
  period: string;
  month: string;
  kpi: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  approvalStatus: "Approved" | "Pending" | "Revision";
  submittedDate: string;
}

const EVIDENCE_LIST_KEY = "pa_uploaded_evidence_v1";
const AUDIT_LIST_KEY = "pa_audit_trail_v1";
const CRITICAL_AUTH_KV_KEYS = new Set([
  "pa_user_password_security_v1",
  "pa_managed_users_v1",
  "pa_unit_login_configs_v1",
  "pa_archived_users_v1",
  "pa_trial_mode_clean_v1",
]);

const EPHEMERAL_OR_LEGACY_LOCAL_KEYS = [
  "appraisal_row_aliases_v1",
  "kpi_evidence_files",
  "sg_submitted_smart_goals",
  "sg_checkin_entries_v1",
  "pa_project_icf_excel_v1",
  "inter_department_feedback_workflows_v1",
];

const ATTACHMENT_HEAVY_LOCAL_KEYS = new Set([
  EVIDENCE_LIST_KEY,
  "kpi_evidence_files_by_emp_v1",
  "sg_checkin_by_emp_v2",
  "pa_interview_schedules_v1",
  "pa_app_feedback_v1",
]);

const MAX_INLINE_DATA_URL_CHARS = 65_536;

/**
 * In-memory fallback store ketika kuota localStorage browser (~5 MB) terlampaui,
 * sehingga sesi aktif tidak pernah crash ataupun kehilangan data sebelum tersinkron ke Supabase.
 */
const memoryKvFallback = new Map<string, string>();

function compactAttachmentValueForLocalStorage(value: unknown, aggressive: boolean, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (aggressive && value.startsWith("data:") && value.length > MAX_INLINE_DATA_URL_CHARS) {
      return "";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => compactAttachmentValueForLocalStorage(item, aggressive, depth + 1));
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const hasHttpUrl =
      typeof rec.url === "string" && (rec.url.startsWith("https://") || rec.url.startsWith("http://"));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "dataUrl" && typeof v === "string" && v.startsWith("data:")) {
        if (hasHttpUrl || (aggressive && v.length > MAX_INLINE_DATA_URL_CHARS)) {
          continue;
        }
      }
      if (k === "url" && aggressive && typeof v === "string" && v.startsWith("data:") && v.length > MAX_INLINE_DATA_URL_CHARS) {
        out[k] = "";
        continue;
      }
      out[k] = compactAttachmentValueForLocalStorage(v, aggressive, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Membebaskan ruang localStorage secara otomatis ketika browser melempar QuotaExceededError:
 * 1) Menghapus key alias ephemeral & legacy duplikat yang tidak dipakai.
 * 2) Memangkas riwayat audit/notifikasi lokal yang terlalu panjang.
 * 3) Memindahkan payload Base64 besar pada key lampiran ke memoryKvFallback sambil mempertahankan metadata di localStorage.
 */
export function reclaimLocalStorageSpace(preserveKey?: string): void {
  if (typeof localStorage === "undefined") return;
  for (const deadKey of EPHEMERAL_OR_LEGACY_LOCAL_KEYS) {
    if (deadKey === preserveKey) continue;
    try {
      localStorage.removeItem(deadKey);
    } catch {
      // ignore
    }
  }

  try {
    const rawAudit = localStorage.getItem(AUDIT_LIST_KEY);
    if (rawAudit && rawAudit.length > 30_000 && preserveKey !== AUDIT_LIST_KEY) {
      const parsed = JSON.parse(rawAudit);
      if (Array.isArray(parsed) && parsed.length > 40) {
        localStorage.setItem(AUDIT_LIST_KEY, JSON.stringify(parsed.slice(0, 40)));
      }
    }
  } catch {
    try { localStorage.removeItem(AUDIT_LIST_KEY); } catch { /* ignore */ }
  }

  for (const heavyKey of ATTACHMENT_HEAVY_LOCAL_KEYS) {
    if (heavyKey === preserveKey) continue;
    try {
      const raw = localStorage.getItem(heavyKey);
      if (!raw || raw.length < 32_768) continue;
      if (!memoryKvFallback.has(heavyKey)) {
        memoryKvFallback.set(heavyKey, raw);
      }
      const parsed = JSON.parse(raw);
      const compacted = compactAttachmentValueForLocalStorage(parsed, true);
      const nextRaw = JSON.stringify(compacted);
      if (nextRaw.length < raw.length) {
        localStorage.setItem(heavyKey, nextRaw);
      }
    } catch {
      // ignore
    }
  }
}

export function safeGetLocalRaw(key: string): string | null {
  if (memoryKvFallback.has(key)) {
    return memoryKvFallback.get(key) ?? null;
  }
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetLocalRaw(key: string, serialized: string): boolean {
  if (typeof localStorage === "undefined") {
    memoryKvFallback.set(key, serialized);
    return false;
  }
  try {
    localStorage.setItem(key, serialized);
    memoryKvFallback.delete(key);
    return true;
  } catch {
    reclaimLocalStorageSpace(key);
    try {
      localStorage.setItem(key, serialized);
      memoryKvFallback.delete(key);
      return true;
    } catch {
      memoryKvFallback.set(key, serialized);
      if (!CRITICAL_AUTH_KV_KEYS.has(key) && key !== "pa_active_user_v1" && key !== "pa_auth_session_v1") {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
      return false;
    }
  }
}

export function safeSetLocalJson(key: string, value: unknown): boolean {
  try {
    const fullSerialized = JSON.stringify(value);
    if (ATTACHMENT_HEAVY_LOCAL_KEYS.has(key)) {
      const cleaned = compactAttachmentValueForLocalStorage(value, false);
      const cleanedSerialized = JSON.stringify(cleaned);
      if (safeSetLocalRaw(key, cleanedSerialized)) {
        return true;
      }
      // Jika masih melebihi kuota karena dataUrl offline besar, simpan versi utuh di memori & versi ringkas di localStorage
      const aggressiveCleaned = JSON.stringify(compactAttachmentValueForLocalStorage(value, true));
      try {
        localStorage.setItem(key, aggressiveCleaned);
      } catch {
        // ignore
      }
      memoryKvFallback.set(key, fullSerialized);
      return false;
    }
    return safeSetLocalJsonRawInternal(key, fullSerialized);
  } catch {
    return false;
  }
}

function safeSetLocalJsonRawInternal(key: string, serialized: string): boolean {
  return safeSetLocalRaw(key, serialized);
}

export function mergePasswordSecurityMapsClient<T extends Record<string, any>>(
  a: Record<string, T> | null | undefined,
  b: Record<string, T> | null | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const ra = a?.[k];
    const rb = b?.[k];
    if (ra && !rb) { out[k] = ra; continue; }
    if (rb && !ra) { out[k] = rb; continue; }
    if (!ra || !rb) continue;
    const aHas = Boolean(ra.passwordDigest);
    const bHas = Boolean(rb.passwordDigest);
    const aReset = String(ra.passwordResetAt ?? "");
    const bReset = String(rb.passwordResetAt ?? "");
    const aTs = String(ra.updatedAt ?? "");
    const bTs = String(rb.updatedAt ?? "");
    if (aHas && !bHas) {
      out[k] = bReset && bReset > aTs ? rb : ra;
    } else if (bHas && !aHas) {
      out[k] = aReset && aReset > bTs ? ra : rb;
    } else {
      out[k] = bTs >= aTs ? rb : ra;
    }
  }
  return out;
}

async function mirrorKvStateToDedicatedTable(stateKey: string, stateValue: unknown): Promise<void> {
  try {
    if (!stateKey || stateValue === undefined || stateValue === null) return;
    if (stateKey === "pa_menu_configs_v1" && Array.isArray(stateValue)) {
      await syncDirectToPostgrest({ kind: "menu-configs", menus: stateValue });
    } else if (stateKey === "pa_cycle_mgmt_v1") {
      await syncDirectToPostgrest({ kind: "cycle-config", cycleId: "2026", data: stateValue });
    } else if (stateKey === "pa_data_sync_items_v1" && Array.isArray(stateValue)) {
      await syncDirectToPostgrest({ kind: "data-sync", items: stateValue });
    } else if (stateKey === "pa_year_end_verifications" || stateKey === "year_end_workflow_2026") {
      await syncDirectToPostgrest({ kind: "year-end-verification", period: "2026", state: stateValue });
    } else if (stateKey === "pa_access_permissions_v3" && typeof stateValue === "object") {
      for (const [role, permissions] of Object.entries(stateValue as Record<string, unknown>)) {
        await syncDirectToPostgrest({ kind: "role-permissions", role, permissions });
      }
    } else if (stateKey === "pa_open_lock_requests_v1" && Array.isArray(stateValue)) {
      for (const req of stateValue.slice(0, 20)) {
        if (req && typeof req === "object" && "id" in req) {
          await syncDirectToPostgrest({ kind: "open-lock", request: req });
        }
      }
    }
  } catch {
    // non-blocking best-effort mirror
  }
}

export async function syncToSupabase(payload: Record<string, unknown>): Promise<void> {
  try {
    if (payload.audit && typeof payload.audit === "object") {
      const a = payload.audit as Record<string, string>;
      appendLocalAuditLog({
        id: `A-${Date.now().toString().slice(-5)}`,
        timestamp: a.timestamp ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        userId: a.userId ?? "E013",
        userName: a.userName ?? "System",
        role: a.role ?? "Employee",
        action: (a.action as "Update") ?? "Update",
        module: a.module ?? "Performance Appraisal",
        subModule: a.subModule ?? "-",
        description: a.description ?? "",
        ipAddress: "10.0.1.15",
        status: "Success",
      });
    }
    const kind = String(payload.kind ?? "");
    if (kind === "kv-state" && payload.stateKey) {
      void mirrorKvStateToDedicatedTable(String(payload.stateKey), payload.stateValue);
    }
    const isCriticalDualWrite =
      kind === "kv-map-merge" ||
      kind === "user-upsert" ||
      kind === "users-batch" ||
      kind === "users-replace" ||
      kind === "user-delete" ||
      kind === "workflow-delete" ||
      kind === "interview-schedule" ||
      kind === "mi-clear-all" ||
      kind === "evidence-delete" ||
      (kind === "kv-state" && CRITICAL_AUTH_KV_KEYS.has(String(payload.stateKey ?? "")));

    // Path 0 (Vercel Serverless API with SUPABASE_SERVICE_ROLE_KEY — bypasses RLS & build-time env issues)
    const vercelResp = await callVercelSyncApi({ method: "POST", body: JSON.stringify(payload) });
    const vercelOk = Boolean(vercelResp?.ok);

    const directOk = kind === "kv-map-merge" || kind === "users-replace"
      ? false
      : await syncDirectToPostgrest(payload);

    if ((vercelOk || directOk) && !isCriticalDualWrite) return;
    if (vercelOk && directOk) return;

    await fetch(`${PA_APP_API_BASE}/sync`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Offline / pre-migration graceful fallback: state is already persisted locally
  }
}

export function loadPersistedState<T>(key: string, fallback: T): T {
  try {
    const raw = safeGetLocalRaw(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

// Serialisasi sinkronisasi KV per key (latest-wins) agar request lama yang tiba belakangan
// tidak menimpa nilai terbaru di backend (mencegah data hilang setelah refresh/hydrate).
const kvInFlight = new Set<string>();
const kvPending = new Map<string, unknown>();
const localWriteTs = new Map<string, number>();
function queueKvSync(key: string, value: unknown): void {
  kvPending.set(key, value);
  if (kvInFlight.has(key)) return;
  const run = async () => {
    while (kvPending.has(key)) {
      const latest = kvPending.get(key);
      kvPending.delete(key);
      kvInFlight.add(key);
      try {
        await syncToSupabase({ kind: "kv-state", stateKey: key, stateValue: latest });
      } catch {
        // ignore
      } finally {
        kvInFlight.delete(key);
      }
    }
  };
  void run();
}

export function savePersistedState<T>(
  key: string,
  value: T,
  normalizedPayload?: Record<string, unknown>,
): void {
  safeSetLocalJson(key, value);
  localWriteTs.set(key, Date.now());
  // Ditunda agar listener (mis. Sidebar) tidak melakukan setState saat komponen lain sedang render
  queueMicrotask(() => window.dispatchEvent(new Event("pa-db-hydrated")));
  try {
    queueKvSync(key, value);
    if (normalizedPayload) {
      void syncToSupabase(normalizedPayload);
    }
  } catch {
    // ignore sync scheduling errors
  }
}

export function loadUploadedEvidenceList(): UploadedEvidenceRecord[] {
  const list = loadPersistedState<UploadedEvidenceRecord[]>(EVIDENCE_LIST_KEY, []);
  if (!Array.isArray(list)) return [];
  // Bersihkan data sample / lampiran tidak valid (blob URL sesi lama yang tidak bisa dibuka lagi,
  // atau record default contoh tanpa pemilik karyawan yang terdaftar)
  let knownIds: Set<string> | null = null;
  try {
    const users = JSON.parse(localStorage.getItem("pa_managed_users_v1") ?? "[]") as Array<{ employeeId?: string }>;
    if (Array.isArray(users) && users.length > 0) {
      knownIds = new Set(users.map((u) => String(u.employeeId ?? "").toLowerCase()));
      // Evidence milik karyawan yang diarsipkan tetap disimpan agar bisa dipulihkan (restore)
      const archived = JSON.parse(localStorage.getItem("pa_archived_users_v1") ?? "[]") as Array<{ user?: { employeeId?: string } }>;
      if (Array.isArray(archived)) {
        archived.forEach((a) => knownIds!.add(String(a.user?.employeeId ?? "").toLowerCase()));
      }
    }
  } catch {
    knownIds = null;
  }
  const cleaned = list.filter((r) => {
    if (!r || !r.url || r.url.startsWith("blob:")) return false;
    if (knownIds && !knownIds.has(String(r.employeeId ?? "").toLowerCase())) return false;
    return true;
  });
  if (cleaned.length !== list.length) {
    safeSetLocalJson(EVIDENCE_LIST_KEY, cleaned);
  }
  return cleaned;
}

export async function deleteUploadedEvidenceById(id: string): Promise<void> {
  const current = loadUploadedEvidenceList();
  const target = current.find((r) => r.id === id);
  const next = current.filter((r) => r.id !== id);
  savePersistedState(EVIDENCE_LIST_KEY, next, {
    kind: "evidence-delete",
    evidenceId: id,
    audit: {
      action: "Delete",
      module: target?.moduleType ?? "Evidence",
      subModule: "Evidence",
      description: `Deleted evidence file "${target?.fileName ?? id}" (${target?.employeeId ?? "-"})`,
    },
  });
  await deleteBackendRecordFromSupabase("pa_evidence_files", "id", id);
  window.dispatchEvent(new Event("pa-evidence-updated"));
}

function readActiveUserSnapshot(): Record<string, string> {
  try {
    const active = JSON.parse(localStorage.getItem("pa_active_user_v1") ?? "{}") as Record<string, string>;
    return active ?? {};
  } catch {
    return {};
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    } catch {
      resolve("");
    }
  });
}

function persistEvidenceRecord(record: UploadedEvidenceRecord): void {
  const current = loadUploadedEvidenceList().filter((r) => r.id !== record.id);
  // Disimpan ke backend (pa_kv_state) agar tersedia lintas sesi/perangkat & terlihat di menu /evidence
  savePersistedState(EVIDENCE_LIST_KEY, [record, ...current]);
  window.dispatchEvent(new Event("pa-evidence-updated"));
}

export async function uploadEvidenceFileToSupabase(
  file: File,
  meta: {
    employeeId?: string;
    employeeName?: string;
    companyUnit?: string;
    division?: string;
    department?: string;
    position?: string;
    moduleType: "KPI Tracking" | "SMART Goals" | "Management Interview" | "RCA" | string;
    period?: string;
    month?: string;
    kpiName?: string;
  },
): Promise<UploadedEvidenceRecord> {
  const active = readActiveUserSnapshot();
  const fallbackRecord: UploadedEvidenceRecord = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeId: meta.employeeId ?? active.employeeId ?? "",
    fullName: meta.employeeName ?? active.name ?? "",
    companyUnit: meta.companyUnit ?? active.company ?? "",
    division: meta.division ?? active.division ?? "",
    department: meta.department ?? active.department ?? "",
    position: meta.position ?? active.position ?? "",
    moduleType: meta.moduleType,
    period: meta.period ?? "2026",
    month: meta.month ?? new Date().toLocaleString("en-US", { month: "long" }),
    kpi: meta.kpiName ?? "",
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    url: "",
    approvalStatus: "Pending",
    submittedDate: new Date().toISOString().slice(0, 10),
  };

  try {
    // 1. Try direct Supabase Storage upload to bucket `pa-evidence` + PostgREST metadata insert
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${fallbackRecord.period}/${fallbackRecord.moduleType.replace(/\s+/g, "_")}/${fallbackRecord.employeeId}/${fallbackRecord.id}_${safeName}`;
    const directStorageRes = await fetch(`${SUPABASE_STORAGE_BASE}/object/pa-evidence/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    });
    if (directStorageRes.ok) {
      const publicUrl = `${SUPABASE_STORAGE_BASE}/object/public/pa-evidence/${storagePath}`;
      const directRecord: UploadedEvidenceRecord = { ...fallbackRecord, url: publicUrl };
      await restUpsert(
        "pa_evidence_files",
        {
          id: directRecord.id,
          employee_id: directRecord.employeeId,
          employee_name: directRecord.fullName,
          company_unit: directRecord.companyUnit,
          division: directRecord.division,
          department: directRecord.department,
          position: directRecord.position,
          module_type: directRecord.moduleType,
          period: directRecord.period,
          month: directRecord.month,
          kpi_name: directRecord.kpi,
          file_name: directRecord.fileName,
          file_size: directRecord.fileSize,
          mime_type: directRecord.mimeType,
          storage_path: storagePath,
          public_url: publicUrl,
          approval_status: directRecord.approvalStatus,
          submitted_date: directRecord.submittedDate,
        },
        "id",
      );
      await restInsert("pa_audit_trail", {
        timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        user_id: directRecord.employeeId,
        user_name: directRecord.fullName,
        role: "Employee",
        action: "Create",
        module: directRecord.moduleType,
        sub_module: "Evidence",
        description: `Uploaded evidence file "${file.name}" (${directRecord.moduleType} · ${directRecord.month} ${directRecord.period})`,
        status: "Success",
      });
      persistEvidenceRecord(directRecord);
      return directRecord;
    }

    // 2. Fallback to Edge Function upload
    const form = new FormData();
    form.append("file", file);
    form.append("employeeId", fallbackRecord.employeeId);
    form.append("employeeName", fallbackRecord.fullName);
    form.append("companyUnit", fallbackRecord.companyUnit);
    form.append("division", fallbackRecord.division);
    form.append("department", fallbackRecord.department);
    form.append("position", fallbackRecord.position);
    form.append("moduleType", fallbackRecord.moduleType);
    form.append("period", fallbackRecord.period);
    form.append("month", fallbackRecord.month);
    form.append("kpiName", fallbackRecord.kpi);

    const response = await fetch(`${PA_APP_API_BASE}/evidence/upload`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: form,
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.ok && data.evidence) {
        const ev = data.evidence as UploadedEvidenceRecord;
        if (ev.url) {
          persistEvidenceRecord(ev);
          return ev;
        }
      }
    }
  } catch {
    // Fall through to local persistence
  }

  // Fallback: simpan konten file (data URL) ke backend KV agar tetap bisa dibuka (bukan blob sementara)
  const dataUrl = await readFileAsDataUrl(file);
  let finalUrl = dataUrl;
  const safeNameFallback = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fallbackStoragePath = `${fallbackRecord.period}/${fallbackRecord.moduleType.replace(/\s+/g, "_")}/${fallbackRecord.employeeId}/${fallbackRecord.id}_${safeNameFallback}`;
  if (dataUrl) {
    try {
      const proxyRes = await fetch("/api/pa-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "evidence-upsert",
          evidence: {
            ...fallbackRecord,
            storagePath: fallbackStoragePath,
            dataUrl,
          },
        }),
      });
      if (proxyRes.ok) {
        const proxyData = (await proxyRes.json().catch(() => null)) as { ok?: boolean; url?: string } | null;
        if (proxyData?.ok && proxyData.url) {
          finalUrl = proxyData.url;
        }
      }
    } catch {
      // ignore proxy error and upsert directly to PostgREST below
    }
    await restUpsert(
      "pa_evidence_files",
      {
        id: fallbackRecord.id,
        employee_id: fallbackRecord.employeeId,
        employee_name: fallbackRecord.fullName,
        company_unit: fallbackRecord.companyUnit,
        division: fallbackRecord.division,
        department: fallbackRecord.department,
        position: fallbackRecord.position,
        module_type: fallbackRecord.moduleType,
        period: fallbackRecord.period,
        month: fallbackRecord.month,
        kpi_name: fallbackRecord.kpi,
        file_name: fallbackRecord.fileName,
        file_size: fallbackRecord.fileSize,
        mime_type: fallbackRecord.mimeType,
        storage_path: fallbackStoragePath,
        public_url: finalUrl,
        approval_status: fallbackRecord.approvalStatus,
        submitted_date: fallbackRecord.submittedDate,
      },
      "id",
    );
  }
  const persisted: UploadedEvidenceRecord = { ...fallbackRecord, url: finalUrl };
  if (dataUrl) persistEvidenceRecord(persisted);
  return persisted;
}

export interface HydratedKpiAttachmentItem {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  url: string;
  uploadedAt: string;
}

export function buildEmployeeIdMatchSet(rawEmployeeId: string): Set<string> {
  const raw = String(rawEmployeeId ?? "").trim();
  const out = new Set<string>();
  if (!raw) return out;
  out.add(raw);
  out.add(raw.toUpperCase());
  out.add(raw.toLowerCase());
  const stripped = raw.replace(/^emp-mi-/i, "");
  const prefMatch = stripped.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
  const pureDigits = /^\d+$/.test(stripped) ? stripped : undefined;
  const digits = prefMatch ?? pureDigits;
  if (digits) {
    const cleanNum = String(Number(digits));
    out.add(digits);
    out.add(cleanNum);
    out.add(`E${digits}`);
    out.add(`E${digits.padStart(3, "0")}`);
    out.add(`EMP-${digits}`);
    out.add(`EMP-${digits.padStart(3, "0")}`);
    out.add(`e${digits}`);
    out.add(`emp-${digits.padStart(3, "0")}`);
  }
  return out;
}

export async function fetchVercelKvBootstrap(
  keys: string[] = [],
): Promise<{ ok: boolean; kvMap: Record<string, unknown> } | null> {
  try {
    const cleanKeys = keys.map((k) => encodeURIComponent(String(k).trim())).filter(Boolean).join(",");
    const url = cleanKeys ? `/api/pa-sync?keys=${cleanKeys}` : "/api/pa-sync";
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
      const json = (await res.json()) as { ok?: boolean; kvMap?: Record<string, unknown> };
      if (json?.kvMap && typeof json.kvMap === "object") {
        return { ok: true, kvMap: json.kvMap };
      }
    }
  } catch {
    // fallback to PostgREST below
  }
  try {
    const query =
      keys.length > 0
        ? `select=state_key,state_value&state_key=in.(${keys.map((k) => encodeURIComponent(k.trim())).join(",")})`
        : "select=state_key,state_value";
    const rows = await restSelect<{ state_key?: string; state_value?: unknown }>("pa_kv_state", query);
    const kvMap: Record<string, unknown> = {};
    for (const r of rows) {
      if (r?.state_key) kvMap[r.state_key] = r.state_value;
    }
    return { ok: true, kvMap };
  } catch {
    return null;
  }
}

/**
 * Mengambil daftar Lampiran KPI Setting milik karyawan secara langsung dari Supabase
 * (`pa_evidence_files` dengan `module_type = "Lampiran KPI Setting"` + `pa_kv_state` `pa_kpi_attachments_v1`)
 * agar Approver (HR Check, AP1, AP2, Validator) lintas browser/perangkat selalu melihat lampiran terbaru.
 */
export async function fetchKpiAttachmentsForEmployee(employeeId: string): Promise<HydratedKpiAttachmentItem[]> {
  try {
  const matchIds = buildEmployeeIdMatchSet(employeeId);
  const lowerIds = new Set(Array.from(matchIds).map((x) => x.toLowerCase()));
  if (lowerIds.size === 0) return [];

  const [evRows, kvBoot] = await Promise.all([
    restSelect<Record<string, unknown>>(
      "pa_evidence_files",
      "select=*&module_type=eq.Lampiran%20KPI%20Setting&order=created_at.asc",
    ),
    fetchVercelKvBootstrap(["pa_kpi_attachments_v1"]),
  ]);

  const kvMap: Record<string, HydratedKpiAttachmentItem[]> =
    kvBoot?.kvMap?.pa_kpi_attachments_v1 && typeof kvBoot.kvMap.pa_kpi_attachments_v1 === "object"
      ? (kvBoot.kvMap.pa_kpi_attachments_v1 as Record<string, HydratedKpiAttachmentItem[]>)
      : {};

  const mergedById = new Map<string, HydratedKpiAttachmentItem>();
  const seenNameSize = new Set<string>();

  // 1. Dari pa_kv_state (pa_kpi_attachments_v1)
  for (const [k, arr] of Object.entries(kvMap)) {
    if (!lowerIds.has(k.trim().toLowerCase()) || !Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || !item.name) continue;
      const id = String(item.id || `${item.name}-${item.size ?? 0}`);
      mergedById.set(id, {
        id,
        name: String(item.name),
        size: Number(item.size ?? 0),
        mimeType: item.mimeType ? String(item.mimeType) : undefined,
        url: String(item.url ?? ""),
        uploadedAt: String(item.uploadedAt ?? ""),
      });
      seenNameSize.add(`${String(item.name).toLowerCase()}::${Number(item.size ?? 0)}`);
    }
  }

  // 2. Dari tabel relasional pa_evidence_files (sumber utama file terunggah di Storage / DB)
  for (const r of evRows) {
    const rEmp = String(r.employee_id ?? "").trim().toLowerCase();
    if (!rEmp || !lowerIds.has(rEmp)) continue;
    const id = String(r.id ?? "");
    const fileName = String(r.file_name ?? "");
    const fileSize = Number(r.file_size ?? 0);
    const publicUrl = String(r.public_url ?? "");
    const mimeType = String(r.mime_type ?? "");
    if (!fileName) continue;
    if (mergedById.has(id)) {
      const existing = mergedById.get(id)!;
      mergedById.set(id, {
        ...existing,
        url: publicUrl || existing.url,
        mimeType: mimeType || existing.mimeType,
        size: fileSize || existing.size,
      });
    } else {
      const sig = `${fileName.toLowerCase()}::${fileSize}`;
      if (seenNameSize.has(sig)) {
        // Perbarui URL kosong bila entri KV sebelumnya tidak memiliki URL
        for (const [mKey, mVal] of mergedById.entries()) {
          if (`${mVal.name.toLowerCase()}::${mVal.size}` === sig && !mVal.url && publicUrl) {
            mergedById.set(mKey, { ...mVal, url: publicUrl, mimeType: mimeType || mVal.mimeType });
          }
        }
      } else {
        mergedById.set(id || sig, {
          id: id || sig,
          name: fileName,
          size: fileSize,
          mimeType: mimeType || undefined,
          url: publicUrl,
          uploadedAt: String(r.submitted_date ?? ""),
        });
        seenNameSize.add(sig);
      }
    }
  }

  const finalList = Array.from(mergedById.values());
  if (finalList.length > 0) {
    try {
      const localRaw = safeGetLocalRaw("pa_kpi_attachments_v1");
      const localMap = localRaw ? (JSON.parse(localRaw) as Record<string, HydratedKpiAttachmentItem[]>) : {};
      const stripped = String(employeeId ?? "").trim().replace(/^emp-mi-/i, "");
      const num = stripped.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
      const canonKey = num ? `EMP-${num.padStart(3, "0")}` : stripped.toUpperCase();
      localMap[canonKey] = finalList;
      safeSetLocalJson("pa_kpi_attachments_v1", localMap);
    } catch {
      // ignore local cache quota
    }
  }
  return finalList;
  } catch {
    return [];
  }
}

/** Mengambil baris KPI Setting milik karyawan langsung dari tabel `pa_kpi_settings` bila cache lokal belum terisi. */
export async function fetchEmployeeKpiSettingsLive<T = Record<string, unknown>>(employeeId: string): Promise<T[]> {
  try {
  const matchIds = buildEmployeeIdMatchSet(employeeId);
  const lowerIds = new Set(Array.from(matchIds).map((x) => x.toLowerCase()));
  if (lowerIds.size === 0) return [];
  const rows = await restSelect<Record<string, unknown>>("pa_kpi_settings", "select=*&tab=eq.personal");
  for (const row of rows) {
    const rEmp = String(row.employee_id ?? "").trim().toLowerCase();
    if (rEmp && lowerIds.has(rEmp) && Array.isArray(row.items) && row.items.length > 0) {
      try {
        const byEmp = JSON.parse(safeGetLocalRaw("pa_kpi_setting_by_emp_v2") ?? "{}") ?? {};
        const stripped = String(employeeId ?? "").trim().replace(/^emp-mi-/i, "");
        const num = stripped.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
        const canonKey = num ? `EMP-${num.padStart(3, "0")}` : stripped.toUpperCase();
        byEmp[canonKey] = row.items;
        safeSetLocalJson("pa_kpi_setting_by_emp_v2", byEmp);
      } catch {
        // ignore
      }
      return row.items as T[];
    }
  }
  return [];
  } catch {
    return [];
  }
}

/** Mengambil data SMART Goals (goals + checkin_entries) milik satu karyawan langsung dari tabel Supabase `pa_smart_goals`. */
export async function fetchEmployeeSmartGoalsLive<TGoal = Record<string, unknown>, TCheckin = Record<string, unknown>>(
  employeeId: string,
): Promise<{ goals: TGoal[]; checkinEntries: TCheckin[]; status: string } | null> {
  try {
  const matchIds = buildEmployeeIdMatchSet(employeeId);
  const lowerIds = new Set(Array.from(matchIds).map((x) => x.toLowerCase()));
  if (lowerIds.size === 0) return null;
  const rows = await restSelect<Record<string, unknown>>("pa_smart_goals", "select=*&order=updated_at.desc");
  for (const row of rows) {
    const rEmp = String(row.employee_id ?? "").trim().toLowerCase();
    if (!rEmp || !lowerIds.has(rEmp)) continue;
    const goals = Array.isArray(row.goals) ? (row.goals as TGoal[]) : [];
    const checkinEntries = Array.isArray(row.checkin_entries) ? (row.checkin_entries as TCheckin[]) : [];
    const status = String(row.status ?? "");
    const stripped = String(employeeId ?? "").trim().replace(/^emp-mi-/i, "");
    const num = stripped.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
    const canonKey = num ? `EMP-${num.padStart(3, "0")}` : stripped.toUpperCase();
    try {
      if (goals.length > 0) {
        const gMap = JSON.parse(safeGetLocalRaw("sg_goals_by_emp_v2") ?? "{}") ?? {};
        gMap[canonKey] = goals;
        safeSetLocalJson("sg_goals_by_emp_v2", gMap);
      }
      const cMap = JSON.parse(safeGetLocalRaw("sg_checkin_by_emp_v2") ?? "{}") ?? {};
      cMap[canonKey] = checkinEntries;
      safeSetLocalJson("sg_checkin_by_emp_v2", cMap);
    } catch {
      // ignore
    }
    return { goals, checkinEntries, status };
  }
  return null;
  } catch {
    return null;
  }
}

export interface StoredAuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  role: string;
  action: string;
  module: string;
  subModule?: string;
  description: string;
  ipAddress: string;
  status: "Success" | "Failed";
}

const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function pruneAuditLogsOlderThan30Days(logs: StoredAuditLogEntry[]): StoredAuditLogEntry[] {
  const cutoff = Date.now() - AUDIT_RETENTION_MS;
  return logs.filter((entry) => {
    const raw = String(entry?.timestamp ?? "").trim();
    if (!raw) return true;
    const ms = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T"));
    if (Number.isNaN(ms)) return true;
    return ms >= cutoff;
  });
}

export function loadLocalAuditLogs(): StoredAuditLogEntry[] {
  const raw = loadPersistedState<StoredAuditLogEntry[]>(AUDIT_LIST_KEY, []);
  const pruned = pruneAuditLogsOlderThan30Days(Array.isArray(raw) ? raw : []);
  if (Array.isArray(raw) && pruned.length !== raw.length) {
    safeSetLocalJson(AUDIT_LIST_KEY, pruned);
  }
  return pruned;
}

export function appendLocalAuditLog(entry: StoredAuditLogEntry): void {
  try {
    const existing = loadLocalAuditLogs();
    const next = pruneAuditLogsOlderThan30Days([entry, ...existing]).slice(0, 200);
    safeSetLocalJson(AUDIT_LIST_KEY, next);
    window.dispatchEvent(new Event("pa-audit-updated"));
  } catch {
    // ignore
  }
}

/**
 * Ambil Audit Trail 30 hari terakhir dari server (tabel pa_audit_trail).
 * Retensi 30 hari dijaga di server (migrasi 202611200001_audit_trail_retention_30d.sql).
 */
export async function fetchServerAuditLogs(days = 30, limit = 5000): Promise<StoredAuditLogEntry[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await restSelect<Record<string, unknown>>(
    "pa_audit_trail",
    `select=*&created_at=gte.${encodeURIComponent(sinceIso)}&order=id.desc&limit=${limit}`,
  );
  return rows.map((r) => ({
    id: `S-${String(r.id ?? "")}`,
    timestamp: String(r.timestamp ?? String(r.created_at ?? "").slice(0, 19).replace("T", " ")),
    userId: String(r.user_id ?? ""),
    userName: String(r.user_name ?? ""),
    role: String(r.role ?? ""),
    action: String(r.action ?? "Update") as StoredAuditLogEntry["action"],
    module: String(r.module ?? ""),
    subModule: String(r.sub_module ?? "-"),
    description: String(r.description ?? ""),
    ipAddress: "",
    status: (String(r.status ?? "Success") === "Failed" ? "Failed" : "Success") as StoredAuditLogEntry["status"],
  }));
}

/** Panggil purge retensi 30 hari di server (opsional; server juga menjalankannya otomatis). */
export async function purgeServerAuditLogs(days = 30): Promise<void> {
  try {
    await fetch(`${SUPABASE_REST_BASE}/rpc/pa_purge_audit_trail`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ retention_days: days }),
    });
  } catch {
    // ignore
  }
}

export async function notifyLoginToSupabase(user: {
  employeeId: string;
  name: string;
  role: string;
  company: string;
}): Promise<void> {
  try {
    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    appendLocalAuditLog({
      id: `A-${Date.now().toString().slice(-5)}`,
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
      userId: user.employeeId,
      userName: user.name,
      role: user.role,
      action: "Login",
      module: "System",
      subModule: "Login Page",
      description: `User logged in via Company Unit ${user.company}`,
      ipAddress: "10.0.1.15",
      status: "Success",
    });
    // Direct PostgREST update for last_login & audit_trail
    await fetch(
      `${SUPABASE_REST_BASE}/pa_users?employee_id=ilike.${encodeURIComponent(user.employeeId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ last_login: nowStr, updated_at: new Date().toISOString() }),
      },
    );
    const insertedAudit = await restInsert("pa_audit_trail", {
      timestamp: `${nowStr}:00`,
      user_id: user.employeeId.toUpperCase(),
      user_name: user.name,
      role: user.role,
      action: "Login",
      module: "Authentication",
      sub_module: "Login Page",
      description: `User logged in via Company Unit ${user.company}`,
      status: "Success",
    });
    if (insertedAudit) return;

    await fetch(`${PA_APP_API_BASE}/login`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });
  } catch {
    // Ignore network errors before backend deployment
  }
}

async function fetchEdgeJsonFast(url: string, init?: RequestInit, timeoutMs = 1500): Promise<Record<string, unknown> | null> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl?.signal,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchBootstrapFromSupabase(): Promise<Record<string, unknown> | null> {
  try {
    // Utamakan jalur cepat langsung ke Supabase PostgREST + Vercel Serverless API (/api/pa-sync).
    // Edge Function /bootstrap hanya dipanggil sebagai fallback apabila kedua jalur cepat kosong/gagal,
    // sehingga startup tidak pernah tertahan cold-start Edge Function.
    const vercelPromise = callVercelSyncApi({ method: "GET" });

    const [
      users,
      kvStates,
      masterCatalogs,
      evidenceFiles,
      auditTrail,
      yearEndRows,
      workflowDocs,
      interviewSchedules,
      groupRules,
      scoreWeights,
      projectRecords,
      rolePermissions,
      menuConfigs,
      openLocks,
      interDeptFeedbacks,
      rcaSubmissions,
      kpiTrackings,
      kpiSettings,
      kpiBusinesses,
      smartGoalRows,
      vercelData,
    ] = await Promise.all([
      restSelect("pa_users", "select=*&order=employee_id.asc"),
      restSelect("pa_kv_state", "select=*"),
      restSelect("pa_master_catalogs", "select=*"),
      restSelect("pa_evidence_files", "select=*&order=created_at.desc"),
      restSelect("pa_audit_trail", "select=*&order=id.desc&limit=150"),
      restSelect("pa_year_end_verifications", "select=*&period=eq.2026&limit=1"),
      restSelect("pa_workflow_documents", "select=*"),
      restSelect("pa_interview_schedules", "select=*&order=updated_at.desc"),
      restSelect("pa_group_rules", "select=*"),
      restSelect("pa_score_weights", "select=*"),
      restSelect("pa_project_records", "select=*"),
      restSelect("pa_role_permissions", "select=*"),
      restSelect("pa_menu_configs", "select=*&id=eq.default&limit=1"),
      restSelect("pa_open_lock_requests", "select=*&order=updated_at.desc"),
      restSelect("pa_inter_dept_feedbacks", "select=*&order=updated_at.desc"),
      restSelect("pa_rca_submissions", "select=*&order=updated_at.desc"),
      restSelect("pa_kpi_trackings", "select=*&order=updated_at.desc"),
      restSelect("pa_kpi_settings", "select=*&order=updated_at.desc"),
      restSelect("pa_kpi_business", "select=*&order=updated_at.desc"),
      restSelect("pa_smart_goals", "select=*&order=updated_at.desc"),
      vercelPromise,
    ]);

    const vercelOk = Boolean(vercelData && typeof vercelData === "object" && vercelData.ok);
    const hasDirectData =
      vercelOk ||
      users.length > 0 ||
      kvStates.length > 0 ||
      workflowDocs.length > 0 ||
      kpiSettings.length > 0 ||
      smartGoalRows.length > 0;
    const edgeData = hasDirectData ? null : await fetchEdgeJsonFast(`${PA_APP_API_BASE}/bootstrap`, undefined, 2000);
    const edgeOk = Boolean(edgeData && typeof edgeData === "object" && edgeData.ok);
    const mergedKvByKey = new Map<string, unknown>();
    for (const row of kvStates as Array<{ state_key?: string; state_value?: unknown }>) {
      if (row?.state_key && row.state_value !== undefined) {
        mergedKvByKey.set(String(row.state_key), row.state_value);
      }
    }
    if (vercelOk && Array.isArray(vercelData?.kvStates)) {
      for (const row of vercelData.kvStates as Array<{ state_key?: string; state_value?: unknown }>) {
        if (!row?.state_key || row.state_value === undefined) continue;
        const k = String(row.state_key);
        if (k === "pa_user_password_security_v1" && mergedKvByKey.has(k)) {
          mergedKvByKey.set(
            k,
            mergePasswordSecurityMapsClient(
              mergedKvByKey.get(k) as Record<string, Record<string, unknown>>,
              row.state_value as Record<string, Record<string, unknown>>,
            ),
          );
        } else {
          mergedKvByKey.set(k, row.state_value);
        }
      }
    }
    if (edgeOk && edgeData && Array.isArray(edgeData.kvStates)) {
      for (const row of edgeData.kvStates as Array<{ state_key?: string; state_value?: unknown }>) {
        if (!row?.state_key || row.state_value === undefined) continue;
        const k = String(row.state_key);
        if (k === "pa_user_password_security_v1" && mergedKvByKey.has(k)) {
          mergedKvByKey.set(
            k,
            mergePasswordSecurityMapsClient(
              mergedKvByKey.get(k) as Record<string, Record<string, unknown>>,
              row.state_value as Record<string, Record<string, unknown>>,
            ),
          );
        } else {
          mergedKvByKey.set(k, row.state_value);
        }
      }
    }
    const mergedKvStates = Array.from(mergedKvByKey.entries()).map(([state_key, state_value]) => ({
      state_key,
      state_value,
    }));

    const vercelUsers = vercelOk && Array.isArray(vercelData?.users) ? (vercelData.users as Array<Record<string, unknown>>) : [];
    const finalUsers = vercelUsers.length >= users.length && vercelUsers.length > 0 ? vercelUsers : users.length > 0 ? users : edgeOk && edgeData && Array.isArray(edgeData.users) ? edgeData.users : [];
    const pick = <T>(a: T[], b: unknown): T[] => (a.length > 0 ? a : Array.isArray(b) ? (b as T[]) : []);

    if (
      finalUsers.length > 0 ||
      mergedKvStates.length > 0 ||
      masterCatalogs.length > 0 ||
      evidenceFiles.length > 0 ||
      auditTrail.length > 0 ||
      workflowDocs.length > 0 ||
      interviewSchedules.length > 0 ||
      interDeptFeedbacks.length > 0 ||
      rcaSubmissions.length > 0 ||
      kpiTrackings.length > 0 ||
      kpiSettings.length > 0 ||
      kpiBusinesses.length > 0 ||
      smartGoalRows.length > 0 ||
      edgeOk ||
      vercelOk
    ) {
      return {
        ok: true,
        users: finalUsers,
        kvStates: mergedKvStates,
        masterCatalogs: pick(masterCatalogs, edgeData?.masterCatalogs),
        evidenceFiles: pick(evidenceFiles, edgeData?.evidenceFiles),
        auditTrail: pick(auditTrail, edgeData?.auditTrail),
        yearEndVerification:
          (yearEndRows[0] as { state?: unknown } | undefined)?.state ??
          edgeData?.yearEndVerification ??
          null,
        workflowDocs: pick(workflowDocs, edgeData?.workflowDocs ?? edgeData?.documents),
        interviewSchedules: pick(interviewSchedules, edgeData?.interviewSchedules),
        groupRules: pick(groupRules, edgeData?.groupRules),
        scoreWeights: pick(scoreWeights, edgeData?.scoreWeights),
        projectRecords: pick(projectRecords, edgeData?.projectRecords),
        rolePermissions: pick(rolePermissions, edgeData?.rolePermissions),
        menuConfig:
          (menuConfigs[0] as { menus?: unknown } | undefined)?.menus ??
          edgeData?.menuConfig ??
          null,
        openLocks: pick(openLocks, edgeData?.openLocks),
        interDeptFeedbacks: pick(interDeptFeedbacks, edgeData?.interDeptFeedbacks),
        rcaSubmissions: pick(rcaSubmissions, edgeData?.rcaSubmissions),
        kpiTrackings: pick(kpiTrackings, edgeData?.kpiTrackings),
        kpiSettings: pick(kpiSettings, edgeData?.kpiSettings),
        kpiBusinesses: pick(kpiBusinesses, edgeData?.kpiBusinesses),
        smartGoalRows: pick(smartGoalRows, edgeData?.smartGoalRows),
      };
    }

    return null;
  } catch {
    return null;
  }
}

let initialHydrationPromise: Promise<void> | null = null;

/** Bernilai true bila browser sudah memiliki cache daftar akun yang valid untuk render instan tanpa layar tunggu. */
export function hasWarmLocalAuthCache(): boolean {
  try {
    const raw = safeGetLocalRaw("pa_managed_users_v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/** Promise hidrasi awal (dipakai gate App & Login agar browser/perangkat baru membaca data backend terlebih dahulu). */
export function waitForInitialHydration(timeoutMs = 12000): Promise<void> {
  if (!initialHydrationPromise) initialHydrationPromise = hydrateAllStoresFromSupabase();
  return Promise.race([
    initialHydrationPromise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Fast-boot untuk App startup:
 * - Selalu menjalankan hidrasi penuh modul-modul di background secara real-time.
 * - Jika cache auth lokal sudah hangat, langsung selesai seketika (0 ms blocking).
 * - Jika browser/device baru kosong (incognito), hanya menunggu state login kritikal (~200-400 ms) agar siap login tanpa layar berat.
 */
export function waitForFastAuthBoot(timeoutMs = 2500): Promise<void> {
  if (!initialHydrationPromise) {
    initialHydrationPromise = hydrateAllStoresFromSupabase();
  }
  if (hasWarmLocalAuthCache()) {
    return Promise.resolve();
  }
  return Promise.race([
    refreshLoginCriticalStateFromBackend().catch(() => undefined),
    initialHydrationPromise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Ambil nilai terbaru beberapa key langsung dari backend (PostgREST pa_kv_state + Edge Function kv_store_74dadec6)
 * dan tulis ke cache lokal tanpa menimpa password digest lokal yang belum sempat tersinkron.
 */
export async function refreshKvKeysFromBackend(keys: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (keys.length === 0) return out;

  // PENTING: koma pemisah PostgREST `in.(k1,k2)` TIDAK BOLEH di-encode menjadi %2C!
  const cleanInList = keys.map((k) => encodeURIComponent(k.trim())).join(",");

  const [pgRows, vercelResp] = await Promise.all([
    restSelect<{ state_key: string; state_value: unknown }>(
      "pa_kv_state",
      `select=state_key,state_value&state_key=in.(${cleanInList})`,
    ),
    callVercelSyncApi({ method: "GET" }, `?keys=${encodeURIComponent(keys.join(","))}`),
  ]);
  const edgeResp =
    pgRows.length > 0 || Boolean(vercelResp?.ok)
      ? null
      : await fetchEdgeJsonFast(`${PA_APP_API_BASE}/kv?keys=${encodeURIComponent(keys.join(","))}`);

  const pgMap: Record<string, unknown> = {};
  for (const row of pgRows) {
    if (row?.state_key && row.state_value !== undefined && row.state_value !== null) {
      pgMap[row.state_key] = row.state_value;
    }
  }
  const vercelMap: Record<string, unknown> =
    vercelResp && vercelResp.ok && vercelResp.kvMap && typeof vercelResp.kvMap === "object"
      ? (vercelResp.kvMap as Record<string, unknown>)
      : {};
  const edgeRawMap: Record<string, unknown> =
    edgeResp && typeof edgeResp === "object" && edgeResp.ok && edgeResp.kvMap && typeof edgeResp.kvMap === "object"
      ? (edgeResp.kvMap as Record<string, unknown>)
      : {};
  const edgeMap: Record<string, unknown> = { ...edgeRawMap, ...vercelMap };

  for (const k of keys) {
    const pv = pgMap[k];
    const ev = edgeMap[k];
    if (pv === undefined && ev === undefined) continue;

    if (k === "pa_user_password_security_v1") {
      const localSec = loadPersistedState<Record<string, Record<string, unknown>>>(k, {});
      const remoteSec = mergePasswordSecurityMapsClient(
        (pv && typeof pv === "object" ? pv : {}) as Record<string, Record<string, unknown>>,
        (ev && typeof ev === "object" ? ev : {}) as Record<string, Record<string, unknown>>,
      );
      const mergedSec = mergePasswordSecurityMapsClient(remoteSec, localSec);
      out[k] = mergedSec;
      safeSetLocalJson(k, mergedSec);
      // Jika browser ini menyimpan password digest yang belum ada di backend, dorong otomatis ke backend!
      const remoteDigestCount = Object.values(remoteSec).filter((r) => Boolean(r?.passwordDigest)).length;
      const mergedDigestCount = Object.values(mergedSec).filter((r) => Boolean(r?.passwordDigest)).length;
      if (mergedDigestCount > remoteDigestCount) {
        void syncToSupabase({ kind: "kv-state", stateKey: k, stateValue: mergedSec });
      }
    } else {
      const chosen = ev !== undefined && ev !== null ? ev : pv;
      if (chosen !== undefined && chosen !== null) {
        out[k] = chosen;
        safeSetLocalJson(k, chosen);
      }
    }
  }

  return out;
}

/**
 * Merge satu record ke dalam objek map pa_kv_state & kv_store_74dadec6 secara aman (server-side atomic merge + PostgREST),
 * sehingga perangkat/browser lain dengan cache lama tidak pernah menimpa record milik pengguna lain.
 */
export async function mergeKvMapRecord(stateKey: string, recordKey: string, record: unknown): Promise<void> {
  // 1. Update local cache immediately
  const localBase = loadPersistedState<Record<string, unknown>>(stateKey, {});
  const optimistic = { ...localBase, [recordKey]: record };
  safeSetLocalJson(stateKey, optimistic);
  localWriteTs.set(stateKey, Date.now());

  // 1b. Atomic server-side merge via Vercel Serverless API (/api/pa-sync with SUPABASE_SERVICE_ROLE_KEY)
  let serverMerged: Record<string, unknown> | null = null;
  const vercelMerged = await callVercelSyncApi({
    method: "POST",
    body: JSON.stringify({ kind: "kv-map-merge", stateKey, recordKey, record }),
  });
  if (vercelMerged?.ok && vercelMerged.stateValue && typeof vercelMerged.stateValue === "object") {
    serverMerged = vercelMerged.stateValue as Record<string, unknown>;
  }

  // 2. Atomic server-side merge on Edge Function (writes to BOTH kv_store_74dadec6 & pa_kv_state via SERVICE_ROLE_KEY)
  try {
    const res = await fetch(`${PA_APP_API_BASE}/sync`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "kv-map-merge", stateKey, recordKey, record }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data.stateValue && typeof data.stateValue === "object") {
        serverMerged = data.stateValue as Record<string, unknown>;
      }
    }
  } catch {
    serverMerged = null;
  }

  // 3. Also read-merge-write direct PostgREST pa_kv_state (for custom Supabase setups without Edge Function)
  let base: Record<string, unknown> = serverMerged ?? optimistic;
  try {
    const rows = await restSelect<{ state_value: unknown }>(
      "pa_kv_state",
      `select=state_value&state_key=eq.${encodeURIComponent(stateKey)}&limit=1`,
    );
    const remote = rows[0]?.state_value;
    if (remote && typeof remote === "object" && !Array.isArray(remote)) {
      base = stateKey === "pa_user_password_security_v1"
        ? mergePasswordSecurityMapsClient(
            remote as Record<string, Record<string, unknown>>,
            base as Record<string, Record<string, unknown>>,
          )
        : { ...(remote as Record<string, unknown>), ...base, [recordKey]: record };
    }
  } catch {
    // ignore
  }
  const finalMap = { ...base, [recordKey]: record };
  safeSetLocalJson(stateKey, finalMap);
  localWriteTs.set(stateKey, Date.now());
  await syncDirectToPostgrest({ kind: "kv-state", stateKey, stateValue: finalMap });
}

/**
 * Simpan daftar (array) ke pa_kv_state secara merge-safe: item backend milik pengguna lain yang belum ada di cache
 * lokal tetap dipertahankan (union berdasarkan id). `mergeItem` menentukan cara menggabungkan item ber-id sama.
 */
export async function mergeKvArrayById<T>(
  stateKey: string,
  localList: T[],
  idOf: (item: T) => string,
  mergeItem: (local: T, remote: T) => T = (local) => local,
): Promise<T[]> {
  let remote: T[] = [];
  try {
    const kvRes = await refreshKvKeysFromBackend([stateKey]);
    if (Array.isArray(kvRes[stateKey])) remote = kvRes[stateKey] as T[];
  } catch {
    remote = [];
  }
  const localIds = new Set(localList.map(idOf));
  const remoteById = new Map(remote.map((r) => [idOf(r), r] as const));
  const merged = [
    ...localList.map((l) => {
      const r = remoteById.get(idOf(l));
      return r ? mergeItem(l, r) : l;
    }),
    ...remote.filter((r) => !localIds.has(idOf(r))),
  ];
  savePersistedState(stateKey, merged);
  return merged;
}

/** Ambil ulang daftar karyawan & keamanan password langsung dari backend untuk validasi login lintas perangkat. */
export interface BackendAuthSyncStatus {
  connected: boolean;
  supabaseHost: string;
  remoteUsersCount: number;
  localUsersCount: number;
}

let _lastBackendStatus: BackendAuthSyncStatus = {
  connected: false,
  supabaseHost: "",
  remoteUsersCount: 0,
  localUsersCount: 0,
};

export function getLastBackendAuthSyncStatus(): BackendAuthSyncStatus {
  return _lastBackendStatus;
}

/** Dorong paksa seluruh akun karyawan & keamanan password dari browser ini ke database Supabase dan verifikasi hasilnya. */
export async function forcePushLocalAuthStateToBackend(): Promise<{
  ok: boolean;
  pushedUsers: number;
  pushedPasswords: number;
  supabaseHost: string;
  errorReason?: string;
}> {
  const localUsers = loadPersistedState<Array<Record<string, unknown>>>("pa_managed_users_v1", []);
  const localSec = loadPersistedState<Record<string, Record<string, unknown>>>("pa_user_password_security_v1", {});
  const localCfg = loadPersistedState<Record<string, unknown>>("pa_unit_login_configs_v1", {});
  const isCleanTrial =
    localStorage.getItem("pa_trial_mode_clean_v1") === "true" ||
    localStorage.getItem("pa_trial_mode_clean_v1") === '"true"';

  let wroteUsersOk = localUsers.length === 0;
  let wroteSecOk = Object.keys(localSec).length === 0;
  let detectedHost = SUPABASE_URL.replace(/^https?:\/\//, "");

  // 1. Coba via Vercel Serverless API (/api/pa-sync dengan SUPABASE_SERVICE_ROLE_KEY)
  const vProbe = await callVercelSyncApi({ method: "GET" }, "?keys=pa_managed_users_v1");
  if (vProbe?.supabaseHost) detectedHost = String(vProbe.supabaseHost);

  if (localUsers.length > 0) {
    const vU = await callVercelSyncApi({
      method: "POST",
      body: JSON.stringify({ kind: "users-batch", users: localUsers }),
    });
    const pgU = await syncDirectToPostgrest({ kind: "users-batch", users: localUsers });
    const pgKvU = await syncDirectToPostgrest({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: localUsers });
    wroteUsersOk = Boolean(vU?.ok || pgU || pgKvU);
    if (!wroteUsersOk) {
      await syncToSupabase({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: localUsers });
    }
  }

  if (Object.keys(localSec).length > 0) {
    const vS = await callVercelSyncApi({
      method: "POST",
      body: JSON.stringify({ kind: "kv-state", stateKey: "pa_user_password_security_v1", stateValue: localSec }),
    });
    const pgS = await syncDirectToPostgrest({
      kind: "kv-state",
      stateKey: "pa_user_password_security_v1",
      stateValue: localSec,
    });
    wroteSecOk = Boolean(vS?.ok || pgS);
    if (!wroteSecOk) {
      await syncToSupabase({ kind: "kv-state", stateKey: "pa_user_password_security_v1", stateValue: localSec });
    }
  }

  if (Object.keys(localCfg).length > 0) {
    await syncToSupabase({ kind: "kv-state", stateKey: "pa_unit_login_configs_v1", stateValue: localCfg });
  }
  if (isCleanTrial) {
    await syncToSupabase({ kind: "kv-state", stateKey: "pa_trial_mode_clean_v1", stateValue: true });
  }

  const ok = wroteUsersOk && wroteSecOk;
  let errorReason: string | undefined;
  if (!ok) {
    if (vProbe?.reason === "ENV_NOT_CONFIGURED" || detectedHost.startsWith("ekzrnltjbcauihoftkiy")) {
      errorReason = "Environment variable Supabase di Vercel belum aktif pada deployment ini. Buka Vercel -> Deployments -> klik Redeploy.";
    } else {
      errorReason = `Penulisan ke ${detectedHost} ditolak (RLS). Pastikan SQL 20261104 sudah di-Run pada project Supabase tersebut.`;
    }
  }

  return {
    ok,
    pushedUsers: localUsers.length,
    pushedPasswords: Object.values(localSec).filter((r) => Boolean(r?.passwordDigest)).length,
    supabaseHost: detectedHost,
    errorReason,
  };
}

export async function refreshLoginCriticalStateFromBackend(): Promise<void> {
  const keys = [
    "pa_user_password_security_v1",
    "pa_unit_login_configs_v1",
    "pa_managed_users_v1",
    "pa_archived_users_v1",
    "pa_trial_mode_clean_v1",
  ];
  const [kvOut, pgUsers, vercelResp] = await Promise.all([
    refreshKvKeysFromBackend(keys),
    restSelect<Record<string, unknown>>("pa_users", "select=*&order=employee_id.asc"),
    callVercelSyncApi({ method: "GET" }, "?keys=pa_managed_users_v1"),
  ]);
  const edgeResp =
    pgUsers.length > 0 || Boolean(vercelResp?.ok) || Array.isArray(kvOut.pa_managed_users_v1)
      ? null
      : await fetchEdgeJsonFast(`${PA_APP_API_BASE}/kv?keys=pa_managed_users_v1`);
  const vercelUsers = vercelResp && Array.isArray(vercelResp.users) ? (vercelResp.users as Array<Record<string, unknown>>) : [];
  const dbUsers =
    vercelUsers.length >= pgUsers.length && vercelUsers.length > 0
      ? vercelUsers
      : pgUsers.length > 0
      ? pgUsers
      : edgeResp && Array.isArray(edgeResp.users)
      ? (edgeResp.users as Array<Record<string, unknown>>)
      : [];
  const synced = applyDbUsersToLocal(dbUsers);
  const kvManagedCount = Array.isArray(kvOut.pa_managed_users_v1) ? kvOut.pa_managed_users_v1.length : 0;
  _lastBackendStatus = {
    connected: Boolean(vercelResp?.ok || pgUsers.length > 0 || kvManagedCount > 0 || edgeResp?.ok),
    supabaseHost: String(vercelResp?.supabaseHost || SUPABASE_URL.replace(/^https?:\/\//, "")),
    remoteUsersCount: Math.max(dbUsers.length, kvManagedCount),
    localUsersCount: synced.length,
  };
  window.dispatchEvent(new Event("pa-auth-updated"));
}

function applyDbUsersToLocal(users: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  let kvUsersList: Array<Record<string, unknown>> = [];
  try {
    const kvParsed = JSON.parse(safeGetLocalRaw("pa_managed_users_v1") ?? "[]");
    if (Array.isArray(kvParsed)) {
      kvUsersList = kvParsed.filter(
        (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
      );
    }
  } catch {
    kvUsersList = [];
  }
  let archivedIds = new Set<string>();
  try {
    const archived = JSON.parse(safeGetLocalRaw("pa_archived_users_v1") ?? "[]") as Array<{ user?: { employeeId?: string } }>;
    archivedIds = new Set(archived.map((a) => String(a.user?.employeeId ?? "").toLowerCase()).filter(Boolean));
  } catch {
    archivedIds = new Set();
  }
  const rawTrialFlag = safeGetLocalRaw("pa_trial_mode_clean_v1");
  const isCleanTrial =
    rawTrialFlag === "true" ||
    rawTrialFlag === '"true"';

  if (!Array.isArray(users) || users.length === 0) {
    const list = kvUsersList.filter((u) => !archivedIds.has(String(u.employeeId ?? "").toLowerCase()));
    if (list.length > 0) safeSetLocalJson("pa_managed_users_v1", list);
    return list;
  }

  // Jika pa_managed_users_v1 tersedia (hasil User Management / Import Excel), nilai field di pa_managed_users_v1
  // (seperti Company Unit, Reg No, Role, Divisi, Status) harus diutamakan agar baris seed lama di pa_users tidak menimpanya!
  const dbByEmp = new Map(users.map((u) => [String(u.employee_id ?? "").toLowerCase(), u]));
  const hadLegacyAsdInDb =
    users.some((u) => u?.company === "ASD" || u?.company === "RSUP ASD") ||
    kvUsersList.some((u) => u?.company === "ASD" || u?.company === "RSUP ASD");
  if (hadLegacyAsdInDb) {
    void migrateLegacyAsdInSupabaseTables();
  }
  if (kvUsersList.length > 0) {
    const mergedFromKv = kvUsersList.map((kvU, idx) => {
      const empKey = String(kvU.employeeId ?? "").toLowerCase();
      const dbU = dbByEmp.get(empKey);
      const apPair = normalizeDbApproverPair(kvU.regNoAp1 ?? dbU?.reg_no_ap1, kvU.regNoAp2 ?? dbU?.reg_no_ap2);
      return {
        ...kvU,
        id: String(kvU.id || idx + 1),
        no: String(kvU.no || dbU?.no || idx + 1),
        regNo: String(kvU.regNo || dbU?.reg_no || `REG-${String(idx + 1).padStart(3, "0")}`),
        name: String(kvU.name || dbU?.name || ""),
        employeeId: String(kvU.employeeId || dbU?.employee_id || ""),
        position: String(kvU.position || dbU?.position || ""),
        company: canonicalizeDbCompanyUnit(kvU.company || dbU?.company || ""),
        division: String(kvU.division || dbU?.division || ""),
        department: String(kvU.department || dbU?.department || ""),
        bagian: String(kvU.bagian ?? dbU?.bagian ?? ""),
        joinDate: String(kvU.joinDate || dbU?.join_date || ""),
        telegramNo: String(kvU.telegramNo || dbU?.telegram_no || ""),
        grade: String(kvU.grade || dbU?.grade || "Grade 5"),
        role: String(kvU.role || dbU?.role || "Employee"),
        groupings: String(kvU.groupings || dbU?.groupings || "Operasional"),
        status: String(kvU.status || dbU?.status || "Active"),
        lastLogin: String(dbU?.last_login || kvU.lastLogin || ""),
        email: String(kvU.email || dbU?.email || ""),
        regNoAp1: apPair.regNoAp1,
        regNoAp2: apPair.regNoAp2,
        checkerUnits: Array.isArray(kvU.checkerUnits)
          ? Array.from(new Set((kvU.checkerUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
          : Array.isArray(dbU?.checker_units)
            ? Array.from(new Set((dbU.checker_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
            : undefined,
        managedUnits: Array.isArray(kvU.managedUnits)
          ? Array.from(new Set((kvU.managedUnits as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
          : Array.isArray(dbU?.managed_units)
            ? Array.from(new Set((dbU.managed_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
            : undefined,
      };
    });
    const seenIds = new Set(mergedFromKv.map((u) => u.employeeId.toLowerCase()));
    const extraDbUsers = isCleanTrial
      ? []
      : users
          .filter((u) => !seenIds.has(String(u.employee_id ?? "").toLowerCase()))
          .map((u, idx) => ({
            ...normalizeDbApproverPair(u.reg_no_ap1, u.reg_no_ap2),
            id: String(mergedFromKv.length + idx + 1),
            no: String(u.no || mergedFromKv.length + idx + 1),
            regNo: String(u.reg_no || `REG-${String(mergedFromKv.length + idx + 1).padStart(3, "0")}`),
            name: String(u.name ?? ""),
            employeeId: String(u.employee_id ?? ""),
            position: String(u.position ?? ""),
            company: canonicalizeDbCompanyUnit(u.company ?? ""),
            division: String(u.division ?? ""),
            department: String(u.department ?? ""),
            bagian: String(u.bagian ?? ""),
            joinDate: String(u.join_date ?? ""),
            telegramNo: String(u.telegram_no ?? ""),
            grade: String(u.grade || "Grade 5"),
            role: String(u.role || "Employee"),
            groupings: String(u.groupings || "Operasional"),
            status: String(u.status || "Active"),
            lastLogin: String(u.last_login || ""),
            email: String(u.email ?? ""),
            isHrUnitChecker: Boolean(u.is_hr_unit_checker ?? u.role === "HR Unit"),
            isHrIcfValidator: Boolean(u.is_hr_icf_validator ?? (u.role === "HR ICF" || u.role === "Administrator")),
            checkerUnits: Array.isArray(u.checker_units)
              ? Array.from(new Set((u.checker_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
              : undefined,
            managedUnits: Array.isArray(u.managed_units)
              ? Array.from(new Set((u.managed_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
              : undefined,
          }));
    const synced = [...mergedFromKv, ...extraDbUsers].filter(
      (u) => !archivedIds.has(String(u.employeeId ?? "").toLowerCase()),
    );
    safeSetLocalJson("pa_managed_users_v1", synced);
    if (hadLegacyAsdInDb) {
      void syncToSupabase({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: synced });
    }
    return synced;
  }

  // Jika pa_managed_users_v1 masih kosong (browser/perangkat baru), bangun dari pa_users
  const mapped = users.map((u, idx) => ({
    ...normalizeDbApproverPair(u.reg_no_ap1, u.reg_no_ap2),
    id: String(idx + 1),
    no: String(u.no || idx + 1),
    regNo: String(u.reg_no || `REG-${String(idx + 1).padStart(3, "0")}`),
    name: String(u.name ?? ""),
    employeeId: String(u.employee_id ?? ""),
    position: String(u.position ?? ""),
    company: canonicalizeDbCompanyUnit(u.company ?? ""),
    division: String(u.division ?? ""),
    department: String(u.department ?? ""),
    bagian: String(u.bagian ?? ""),
    joinDate: String(u.join_date ?? ""),
    telegramNo: String(u.telegram_no ?? ""),
    grade: String(u.grade || "Grade 5"),
    role: String(u.role || "Employee"),
    groupings: String(u.groupings || "Operasional"),
    status: String(u.status || "Active"),
    lastLogin: String(u.last_login || ""),
    email: String(u.email ?? ""),
    isHrUnitChecker: Boolean(u.is_hr_unit_checker ?? u.role === "HR Unit"),
    isHrIcfValidator: Boolean(u.is_hr_icf_validator ?? (u.role === "HR ICF" || u.role === "Administrator")),
    checkerUnits: Array.isArray(u.checker_units)
      ? Array.from(new Set((u.checker_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
      : undefined,
    managedUnits: Array.isArray(u.managed_units)
      ? Array.from(new Set((u.managed_units as unknown[]).map((x) => canonicalizeDbCompanyUnit(x)).filter(Boolean)))
      : undefined,
  })).filter((u) => !archivedIds.has(String(u.employeeId ?? "").toLowerCase()));
  safeSetLocalJson("pa_managed_users_v1", mapped);
  return mapped;
}

export async function hydrateAllStoresFromSupabase(): Promise<void> {
  const hydrateStartedAt = Date.now();
  // Bersihkan key ephemeral alias yang tidak perlu di localStorage sejak awal hidrasi agar kuota lega
  try {
    if (typeof localStorage !== "undefined") {
      for (const deadKey of EPHEMERAL_OR_LEGACY_LOCAL_KEYS) {
        localStorage.removeItem(deadKey);
      }
    }
  } catch {
    // ignore
  }

  // Snapshot state auth lokal sebelum hidrasi agar akun & password yang sudah tersimpan di browser lama
  // tidak pernah hilang dan otomatis ter-backfill ke backend (kv_store_74dadec6 + pa_kv_state + pa_users)!
  const preLocalSec = loadPersistedState<Record<string, Record<string, unknown>>>("pa_user_password_security_v1", {});
  const hasPreLocalUsers = safeGetLocalRaw("pa_managed_users_v1") !== null;
  const preLocalUsers = hasPreLocalUsers
    ? loadPersistedState<Array<Record<string, unknown>>>("pa_managed_users_v1", [])
    : [];
  const hasPreLocalLoginCfg = safeGetLocalRaw("pa_unit_login_configs_v1") !== null;
  const preLocalLoginCfg = hasPreLocalLoginCfg
    ? loadPersistedState<Record<string, unknown>>("pa_unit_login_configs_v1", {})
    : null;

  // Snapshot seluruh state KV aplikasi yang sudah ada di browser lama (untuk auto-backfill sekali jalan setelah RLS dibuka)
  const preLocalAllKv: Array<[string, unknown]> = [];
  try {
    if (typeof localStorage !== "undefined") {
      const skipKeys = new Set([
        "pa_active_user_v1",
        "pa_auth_session_v1",
        "pa_session_expired_notice_v1",
        "pa_login_default_pwd_migrated_v2",
        "pa_user_password_security_v1",
        "pa_managed_users_v1",
        ...EPHEMERAL_OR_LEGACY_LOCAL_KEYS,
      ]);
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || skipKeys.has(k)) continue;
        if (
          k.startsWith("pa_") ||
          k.startsWith("kpi_") ||
          k.startsWith("sg_") ||
          k.startsWith("calibration_") ||
          k.startsWith("score_") ||
          k.startsWith("appraisal_") ||
          k.startsWith("ms_") ||
          k.startsWith("inter_department_") ||
          k.startsWith("year_end_")
        ) {
          const rawVal = localStorage.getItem(k);
          if (rawVal !== null) {
            try { preLocalAllKv.push([k, JSON.parse(rawVal)]); } catch { /* ignore */ }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const data = await fetchBootstrapFromSupabase();
  if (!data) {
    // Jika backend masih kosong saat koneksi pertama dari browser yang sudah punya data lokal, dorong ke backend!
    if (Object.keys(preLocalSec).length > 0) {
      await syncToSupabase({ kind: "kv-state", stateKey: "pa_user_password_security_v1", stateValue: preLocalSec });
    }
    if (preLocalUsers.length > 0) {
      await syncToSupabase({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: preLocalUsers });
      await syncToSupabase({ kind: "users-batch", users: preLocalUsers });
    }
    for (const [k, v] of preLocalAllKv) {
      void syncToSupabase({ kind: "kv-state", stateKey: k, stateValue: v });
    }
    return;
  }

  try {
    // 1. Hydrate CRITICAL AUTH KV states terlebih dahulu sebelum state besar lain agar akun & password
    //    selalu diprioritaskan di localStorage pada perangkat/browser baru maupun incognito!
    const kvStates = data.kvStates as Array<{ state_key: string; state_value: unknown }> | undefined;
    const seenBackendKvKeys = new Set<string>();
    let remoteSec: Record<string, Record<string, unknown>> = {};
    const deferredNonAuthKvRows: Array<{ state_key: string; state_value: unknown }> = [];
    if (Array.isArray(kvStates)) {
      for (const row of kvStates) {
        if (!row.state_key || row.state_value === undefined) continue;
        if (EPHEMERAL_OR_LEGACY_LOCAL_KEYS.includes(row.state_key)) continue;
        seenBackendKvKeys.add(row.state_key);
        if (row.state_key === "pa_user_password_security_v1" && typeof row.state_value === "object") {
          remoteSec = row.state_value as Record<string, Record<string, unknown>>;
          continue;
        }
        if ((localWriteTs.get(row.state_key) ?? 0) >= hydrateStartedAt) continue;
        if (CRITICAL_AUTH_KV_KEYS.has(row.state_key)) {
          safeSetLocalJson(row.state_key, row.state_value);
        } else {
          deferredNonAuthKvRows.push(row);
        }
      }
    }

    // Merge password security map (browser lama -> backend auto-backfill)
    const mergedSec = mergePasswordSecurityMapsClient(remoteSec, preLocalSec);
    if (Object.keys(mergedSec).length > 0) {
      safeSetLocalJson("pa_user_password_security_v1", mergedSec);
      const remoteDigests = Object.values(remoteSec).filter((r) => Boolean(r?.passwordDigest)).length;
      const mergedDigests = Object.values(mergedSec).filter((r) => Boolean(r?.passwordDigest)).length;
      if (mergedDigests > remoteDigests || (!seenBackendKvKeys.has("pa_user_password_security_v1") && Object.keys(preLocalSec).length > 0)) {
        await syncToSupabase({ kind: "kv-state", stateKey: "pa_user_password_security_v1", stateValue: mergedSec });
      }
    }

    // Jika browser lama sudah memiliki user di pa_managed_users_v1 yang belum tersimpan di KV backend, gabungkan & dorong ke backend!
    if (preLocalUsers.length > 0) {
      let currentKvUsers: Array<Record<string, unknown>> = [];
      try {
        const parsed = JSON.parse(safeGetLocalRaw("pa_managed_users_v1") ?? "[]");
        if (Array.isArray(parsed)) currentKvUsers = parsed;
      } catch {
        currentKvUsers = [];
      }
      let archSet = new Set<string>();
      try {
        const arch = JSON.parse(safeGetLocalRaw("pa_archived_users_v1") ?? "[]") as Array<{ user?: { employeeId?: string } }>;
        if (Array.isArray(arch)) {
          archSet = new Set(arch.map((a) => String(a.user?.employeeId ?? "").toLowerCase()).filter(Boolean));
        }
      } catch {
        archSet = new Set();
      }
      if (!seenBackendKvKeys.has("pa_managed_users_v1") || currentKvUsers.length === 0) {
        safeSetLocalJson("pa_managed_users_v1", preLocalUsers);
        await syncToSupabase({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: preLocalUsers });
        await syncToSupabase({ kind: "users-batch", users: preLocalUsers });
      } else {
        const remoteIds = new Set(currentKvUsers.map((u) => String(u.employeeId ?? "").toLowerCase()).filter(Boolean));
        const missingOnRemote = preLocalUsers.filter((u) => {
          const id = String(u.employeeId ?? "").toLowerCase();
          return Boolean(id) && !remoteIds.has(id) && !archSet.has(id);
        });
        if (missingOnRemote.length > 0) {
          const combined = [...currentKvUsers, ...missingOnRemote];
          safeSetLocalJson("pa_managed_users_v1", combined);
          await syncToSupabase({ kind: "kv-state", stateKey: "pa_managed_users_v1", stateValue: combined });
          await syncToSupabase({ kind: "users-batch", users: combined });
        }
      }
    }
    if (!seenBackendKvKeys.has("pa_unit_login_configs_v1") && preLocalLoginCfg && Object.keys(preLocalLoginCfg).length > 0) {
      void syncToSupabase({ kind: "kv-state", stateKey: "pa_unit_login_configs_v1", stateValue: preLocalLoginCfg });
    }
    for (const [k, v] of preLocalAllKv) {
      if (!seenBackendKvKeys.has(k)) {
        void syncToSupabase({ kind: "kv-state", stateKey: k, stateValue: v });
      }
    }

    // 2. Hydrate users if available in DB (sebelum non-auth KV agar pa_managed_users_v1 selalu terjamin tersimpan)
    const users = data.users as Array<Record<string, unknown>> | undefined;
    const syncedActiveUsers: Array<Record<string, unknown>> = applyDbUsersToLocal(Array.isArray(users) ? users : []);

    // 2b. Hydrate sisa non-auth KV states secara aman (tahan QuotaExceededError)
    for (const row of deferredNonAuthKvRows) {
      if ((localWriteTs.get(row.state_key) ?? 0) >= hydrateStartedAt) continue;
      safeSetLocalJson(row.state_key, row.state_value);
    }

    // Khusus lingkungan Figma Make (bukan web produksi Vercel):
    // sinkronkan user aktif preview ke akun Administrator / HR ICF dari database web (Vercel)
    // apabila belum melakukan manual Logout atau user aktif sebelumnya bukan user database.
    if (syncedActiveUsers.length > 0) {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const isFigmaMakeHost =
        host.includes("figma.site") ||
        host.includes("figma.com") ||
        host === "localhost" ||
        host === "127.0.0.1";
      if (isFigmaMakeHost && sessionStorage.getItem("pa_manual_logout_v1") !== "1") {
        const dbAdminOrHrIcf =
          syncedActiveUsers.find((u) => u.status === "Active" && u.role === "Administrator") ??
          syncedActiveUsers.find((u) => u.status === "Active" && u.role === "HR ICF");
        const existingSessionRaw = safeGetLocalRaw("pa_auth_session_v1");
        let currentEmpId = "";
        try {
          currentEmpId = String(
            JSON.parse(safeGetLocalRaw("pa_active_user_v1") ?? "{}")?.employeeId ?? "",
          ).toLowerCase();
        } catch {
          currentEmpId = "";
        }
        const currentExistsInDb = syncedActiveUsers.some(
          (u) => String(u.employeeId ?? "").toLowerCase() === currentEmpId,
        );
        if (dbAdminOrHrIcf && (!existingSessionRaw || !currentExistsInDb)) {
          const nowTs = Date.now();
          safeSetLocalJson("pa_active_user_v1", dbAdminOrHrIcf);
          safeSetLocalJson("pa_auth_session_v1", {
            isAuthenticated: true,
            employeeId: String(dbAdminOrHrIcf.employeeId ?? ""),
            loginAt: nowTs,
            awayStartedAt: null,
            lastActiveAt: nowTs,
          });
        }
      }
    }

    // 3. Hydrate master catalogs
    const catalogs = data.masterCatalogs as Array<{ catalog_key: string; data: unknown }> | undefined;
    if (Array.isArray(catalogs)) {
      for (const c of catalogs) {
        if (c.catalog_key && c.data) {
          safeSetLocalJson(c.catalog_key, c.data);
        }
      }
    }

    // 4. Hydrate evidence files
    const evidenceFiles = data.evidenceFiles as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(evidenceFiles) && evidenceFiles.length > 0) {
      const mappedEv: UploadedEvidenceRecord[] = evidenceFiles.map((e) => ({
        id: String(e.id),
        employeeId: String(e.employee_id ?? "E002"),
        fullName: String(e.employee_name ?? "Siti Rahayu"),
        companyUnit: String(e.company_unit ?? "PT RSUP (Industry)"),
        division: String(e.division ?? "Divisi Sumber Daya Manusia"),
        department: String(e.department ?? "SDM"),
        position: String(e.position ?? "Staff Pengembangan SDM"),
        moduleType: String(e.module_type ?? "KPI Tracking"),
        period: String(e.period ?? "2026"),
        month: String(e.month ?? "June"),
        kpi: String(e.kpi_name ?? ""),
        fileName: String(e.file_name ?? ""),
        fileSize: Number(e.file_size ?? 0),
        mimeType: String(e.mime_type ?? "application/octet-stream"),
        url: String(e.public_url ?? ""),
        approvalStatus: (e.approval_status as "Approved" | "Pending" | "Revision") ?? "Pending",
        submittedDate: String(e.submitted_date ?? "2026-06-10"),
      }));
      let existingEv: UploadedEvidenceRecord[] = [];
      try {
        existingEv = JSON.parse(safeGetLocalRaw(EVIDENCE_LIST_KEY) ?? "[]");
      } catch {
        existingEv = [];
      }
      const backendIds = new Set(mappedEv.map((e) => e.id));
      const mergedEv = [...mappedEv, ...(Array.isArray(existingEv) ? existingEv.filter((e) => !backendIds.has(e.id)) : [])];
      safeSetLocalJson(EVIDENCE_LIST_KEY, mergedEv);
    }

    // 5. Hydrate audit trail
    const auditRows = data.auditTrail as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(auditRows) && auditRows.length > 0) {
      const mappedAudit: StoredAuditLogEntry[] = auditRows.map((a) => ({
        id: `DB-${a.id}`,
        timestamp: String(a.timestamp ?? ""),
        userId: String(a.user_id ?? "E013"),
        userName: String(a.user_name ?? "System"),
        role: String(a.role ?? "Employee"),
        action: String(a.action ?? "Update"),
        module: String(a.module ?? "Performance Appraisal"),
        subModule: String(a.sub_module ?? "-"),
        description: String(a.description ?? ""),
        ipAddress: "10.0.1.15",
        status: (a.status as "Success" | "Failed") ?? "Success",
      }));
      safeSetLocalJson(AUDIT_LIST_KEY, mappedAudit);
    }

    // 6. Hydrate year-end verification state
    if (data.yearEndVerification) {
      safeSetLocalJson("year_end_workflow_2026", data.yearEndVerification);
    }

    // 7. Hydrate normalized workflow documents if present
    const workflowDocs = data.workflowDocs as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(workflowDocs) && workflowDocs.length > 0) {
      const existingRaw = safeGetLocalRaw("appraisal_workflow_v1");
      const existingList: Array<Record<string, unknown>> = existingRaw ? JSON.parse(existingRaw) : [];
      const byKey = new Map<string, Record<string, unknown>>();
      for (const item of existingList) {
        if (item && typeof item.key === "string") byKey.set(item.key, item);
      }
      for (const doc of workflowDocs) {
        const payload = doc.payload as Record<string, unknown> | undefined;
        if (payload && typeof payload.key === "string" && (payload.cancelled === true || doc.status === "Cancelled")) {
          // Dokumen yang dibatalkan Administrator (Cancel Transaction) tidak dimunculkan kembali
          byKey.delete(payload.key);
        } else if (payload && typeof payload.key === "string") {
          byKey.set(payload.key, payload);
        }
      }
      safeSetLocalJson("appraisal_workflow_v1", Array.from(byKey.values()));
    }

    // 8. Hydrate normalized interview schedules if present
    const schedules = data.interviewSchedules as Array<Record<string, unknown>> | undefined;
    const miAlreadyCleared = seenBackendKvKeys.has("pa_mi_cleared_2026_v1");
    if (!miAlreadyCleared) {
      safeSetLocalJson("pa_mi_cleared_2026_v1", true);
      safeSetLocalJson("pa_interview_schedules_v1", []);
      safeSetLocalJson("pa_mi_supervisor_assessments_v1", {});
      safeSetLocalJson("pa_mi_penilai1_scores_v1", {});
      safeSetLocalJson("pa_mi_results_by_emp_v1", {});
      void syncToSupabase({ kind: "mi-clear-all" });
    } else if (Array.isArray(schedules) && schedules.length > 0) {
      const mappedSchedules = schedules.map((s) => ({
        id: String(s.id),
        companyUnit: String(s.company_unit ?? "PT. RSUP (Industri)"),
        addedUsers: Array.isArray(s.added_users) ? s.added_users : [],
        interviewers: Array.isArray(s.interviewers) ? s.interviewers : [],
        otherUsers: Array.isArray(s.other_users) ? s.other_users : [],
        scheduledDate: String(s.scheduled_date ?? "2026-10-15"),
        scheduledTime: String(s.scheduled_time ?? "09:00"),
        location: String(s.location ?? ""),
        textNotifikasi: String(s.text_notifikasi ?? ""),
        textLampiran: String(s.text_lampiran ?? ""),
        status: (s.status as "Scheduled" | "Cancelled" | "Done") ?? "Scheduled",
        createdAt: String(s.updated_at ?? new Date().toISOString()),
      }));
      // Gabungkan dengan data KV (lampiran, ID peserta) yang tidak tersimpan di kolom tabel
      let kvSchedules: Array<Record<string, unknown>> = [];
      try {
        kvSchedules = JSON.parse(safeGetLocalRaw("pa_interview_schedules_v1") ?? "[]");
      } catch {
        kvSchedules = [];
      }
      const kvById = new Map((Array.isArray(kvSchedules) ? kvSchedules : []).map((k) => [String(k.id), k] as const));
      const mergedSchedules = mappedSchedules.map((m) => ({ ...(kvById.get(m.id) ?? {}), ...m }));
      const mergedIds = new Set(mergedSchedules.map((m) => m.id));
      for (const k of kvById.values()) if (!mergedIds.has(String(k.id))) mergedSchedules.push(k as (typeof mergedSchedules)[number]);
      safeSetLocalJson("pa_interview_schedules_v1", mergedSchedules);
    }

    // 9. Hydrate normalized group rules by unit if present
    const groupRules = data.groupRules as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(groupRules) && groupRules.length > 0) {
      const existingRaw = safeGetLocalRaw("pa_group_rules_by_unit_v1");
      const map: Record<string, Array<Record<string, unknown>>> = existingRaw ? JSON.parse(existingRaw) : {};
      const grouped: Record<string, Array<Record<string, unknown>>> = {};
      for (const r of groupRules) {
        const comp = String(r.company ?? "DEFAULT");
        const rawId = String(r.id ?? "").replace(`${comp}::`, "");
        if (!grouped[comp]) grouped[comp] = [];
        grouped[comp].push({
          id: rawId || String(grouped[comp].length + 1),
          position: String(r.position ?? ""),
          group: String(r.group_name ?? ""),
          description: String(r.description ?? ""),
          allowedModules: Array.isArray(r.allowed_modules) ? r.allowed_modules : [],
        });
      }
      safeSetLocalJson("pa_group_rules_by_unit_v1", { ...map, ...grouped });
    }

    // 10. Hydrate normalized score weights if present
    const scoreWeights = data.scoreWeights as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(scoreWeights) && scoreWeights.length > 0) {
      const existingRaw = safeGetLocalRaw("score_calibration_weights_v1");
      const map: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw) : {};
      for (const sw of scoreWeights) {
        if (sw.company_unit && sw.weights) {
          map[String(sw.company_unit)] = sw.weights;
        }
      }
      safeSetLocalJson("score_calibration_weights_v1", map);
    }

    // 11. Hydrate normalized project records if present
    const projectRecords = data.projectRecords as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(projectRecords) && projectRecords.length > 0) {
      const existingRaw = safeGetLocalRaw("pa_project_icf_by_emp_v1");
      const byEmp: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw) : {};
      for (const pr of projectRecords) {
        const empId = String(pr.employee_id ?? "");
        if (!empId) continue;
        byEmp[empId] = {
          rows: Array.isArray(pr.rows) ? pr.rows : [],
          fileName: String(pr.file_name ?? "Project_ICF_2026.xlsx"),
          submitted: Boolean(pr.submitted ?? true),
          submittedDate: String(pr.submitted_date ?? ""),
        };
      }
      safeSetLocalJson("pa_project_icf_by_emp_v1", byEmp);
    }

    // 12. Hydrate Access Management role permissions if present
    const rolePermissions = data.rolePermissions as Array<{ role?: string; permissions?: Record<string, unknown> }> | undefined;
    if (Array.isArray(rolePermissions) && rolePermissions.length > 0) {
      const existingRaw = safeGetLocalRaw("pa_access_permissions_v2");
      const map: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw) : {};
      for (const rp of rolePermissions) {
        // Hanya gunakan data dari tabel pa_role_permissions jika sudah memiliki struktur v2 (ada field dashboard & profile)
        if (rp.role && rp.permissions && typeof rp.permissions === "object" && "dashboard" in rp.permissions && "profile" in rp.permissions) {
          map[String(rp.role)] = rp.permissions;
        }
      }
      if (Object.keys(map).length > 0) {
        safeSetLocalJson("pa_access_permissions_v2", map);
      }
    }

    // 13. Hydrate Menu Management configuration if present
    if (Array.isArray(data.menuConfig) && data.menuConfig.length > 0) {
      safeSetLocalJson("pa_menu_configs_v1", data.menuConfig);
    }

    // 14. Hydrate Open Lock requests if present
    const openLocks = data.openLocks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(openLocks) && openLocks.length > 0) {
      const mappedLocks = openLocks.map((r) => ({
        id: String(r.id ?? ""),
        employeeId: String(r.employee_id ?? ""),
        employeeName: String(r.employee_name ?? ""),
        nip: String(r.employee_id ?? ""),
        divisi: String(r.divisi ?? ""),
        departemen: String(r.departemen ?? ""),
        bagian: String(r.bagian ?? ""),
        posisi: String(r.posisi ?? ""),
        module: String(r.module ?? "KPI Tracking"),
        period: String(r.period ?? "2026"),
        originalDeadline: String(r.original_deadline ?? "2026-06-30"),
        submittedAt: String(r.submitted_at ?? new Date().toISOString()),
        reason: String(r.reason ?? ""),
        status: (r.status as "pending" | "approved" | "rejected") ?? "pending",
        approvedUntil: r.approved_until ? String(r.approved_until) : undefined,
        approvedAt: r.approved_at ? String(r.approved_at) : undefined,
        approvalNote: r.approval_note ? String(r.approval_note) : undefined,
        rejectedAt: r.rejected_at ? String(r.rejected_at) : undefined,
      }));
      safeSetLocalJson("pa_open_lock_requests_v1", mappedLocks);
    }

    // 15. Hydrate Inter-Department Feedback workflows from dedicated backend table pa_inter_dept_feedbacks
    const idfRows = data.interDeptFeedbacks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(idfRows) && idfRows.length > 0) {
      const existingRaw = safeGetLocalRaw("inter_department_feedback_workflows_v2");
      const existingList: Array<{ row?: { no?: string } }> = existingRaw ? JSON.parse(existingRaw) : [];
      const byNo = new Map<string, unknown>();
      for (const item of existingList) {
        if (item?.row?.no) byNo.set(item.row.no, item);
      }
      for (const dbRow of idfRows) {
        const sub = dbRow.submission as { row?: { no?: string } } | undefined;
        const key = String(sub?.row?.no ?? dbRow.submission_id ?? "");
        if (key && sub) {
          byNo.set(key, sub);
        }
      }
      if (byNo.size > 0) {
        safeSetLocalJson("inter_department_feedback_workflows_v2", Array.from(byNo.values()));
      }
    }

    // 16. Hydrate RCA submissions from dedicated backend table pa_rca_submissions
    const rcaRows = data.rcaSubmissions as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(rcaRows) && rcaRows.length > 0) {
      const existingRaw = safeGetLocalRaw("kpi_rca_submissions");
      const existingList: Array<{ employeeId?: string; key?: string; id?: string }> = existingRaw ? JSON.parse(existingRaw) : [];
      const byKey = new Map<string, unknown>();
      for (const item of existingList) {
        const k = item?.key ?? item?.id;
        const emp = String(item?.employeeId ?? "").trim().toUpperCase();
        if (k) byKey.set(`${emp}::${k}`, item);
      }
      for (const dbRow of rcaRows) {
        const sub = dbRow.submission as { employeeId?: string; key?: string; id?: string } | undefined;
        const k = String(sub?.key ?? sub?.id ?? dbRow.doc_key ?? "");
        const emp = String(sub?.employeeId ?? dbRow.employee_id ?? "").trim().toUpperCase();
        if (k && sub) {
          byKey.set(`${emp}::${k}`, sub.employeeId ? sub : { ...sub, employeeId: String(dbRow.employee_id ?? "") });
        }
      }
      if (byKey.size > 0) {
        safeSetLocalJson("kpi_rca_submissions", Array.from(byKey.values()));
      }
    }

    // 17. Hydrate KPI Trackings per employee from dedicated backend table pa_kpi_trackings
    const kpiTrackingRows = data.kpiTrackings as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(kpiTrackingRows) && kpiTrackingRows.length > 0) {
      for (const kt of kpiTrackingRows) {
        const rawEmpId = String(kt.employee_id ?? "").trim();
        if (!rawEmpId) continue;
        const numMatch = rawEmpId.replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
        const normId = numMatch ? `EMP-${numMatch.padStart(3, "0")}` : rawEmpId.toUpperCase();
        const months = Array.isArray(kt.months) ? kt.months : [];
        const cellsMap = kt.cells_map && typeof kt.cells_map === "object" ? kt.cells_map : {};
        safeSetLocalJson(`kpi_tracking_v1_${normId}`, { months, cellsMap });
      }
    }

    // 18. Hydrate KPI Settings per employee from dedicated backend table pa_kpi_settings
    const kpiSettingsRows = data.kpiSettings as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(kpiSettingsRows) && kpiSettingsRows.length > 0) {
      let byEmp: Record<string, unknown> = {};
      try {
        byEmp = JSON.parse(safeGetLocalRaw("pa_kpi_setting_by_emp_v2") ?? "{}") ?? {};
      } catch {
        byEmp = {};
      }
      for (const row of kpiSettingsRows) {
        const rawEmp = String(row.employee_id ?? "").trim();
        const tab = String(row.tab ?? "personal");
        if (!rawEmp || !Array.isArray(row.items) || tab !== "personal") continue;
        const items = row.items;
        const numMatch = rawEmp.replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
        const normId = numMatch ? `EMP-${numMatch.padStart(3, "0")}` : rawEmp.toUpperCase();
        byEmp[normId] = items;
      }
      safeSetLocalJson("pa_kpi_setting_by_emp_v2", byEmp);
    }

    // 19. Hydrate KPI Business (Group / Unit) from dedicated backend table pa_kpi_business
    const kpiBusinessRows = data.kpiBusinesses as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(kpiBusinessRows) && kpiBusinessRows.length > 0) {
      let byScope: Record<string, unknown> = {};
      try {
        byScope = JSON.parse(safeGetLocalRaw("pa_kpi_business_by_scope_v1") ?? "{}") ?? {};
      } catch {
        byScope = {};
      }
      for (const row of kpiBusinessRows) {
        const scopeId = String(row.id ?? "").trim();
        const items = Array.isArray(row.items) ? row.items : [];
        if (!scopeId || items.length === 0) continue;
        byScope[scopeId] = items;
      }
      safeSetLocalJson("pa_kpi_business_by_scope_v1", byScope);
    }

    // 20. Hydrate SMART Goals per employee from dedicated backend table pa_smart_goals
    const smartGoalsDb = data.smartGoalRows as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(smartGoalsDb) && smartGoalsDb.length > 0) {
      let goalsByEmp: Record<string, unknown> = {};
      let checkinByEmp: Record<string, unknown> = {};
      try {
        goalsByEmp = JSON.parse(safeGetLocalRaw("sg_goals_by_emp_v2") ?? "{}") ?? {};
        checkinByEmp = JSON.parse(safeGetLocalRaw("sg_checkin_by_emp_v2") ?? "{}") ?? {};
      } catch {
        goalsByEmp = {};
        checkinByEmp = {};
      }
      for (const row of smartGoalsDb) {
        const rawEmp = String(row.employee_id ?? "").trim();
        if (!rawEmp) continue;
        const numMatch = rawEmp.replace(/^emp-mi-/i, "").match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
        const normId = numMatch ? `EMP-${numMatch.padStart(3, "0")}` : rawEmp.toUpperCase();
        if (Array.isArray(row.goals) && row.goals.length > 0) {
          goalsByEmp[normId] = row.goals;
        }
        if (Array.isArray(row.checkin_entries)) {
          checkinByEmp[normId] = row.checkin_entries;
        }
      }
      safeSetLocalJson("sg_goals_by_emp_v2", goalsByEmp);
      safeSetLocalJson("sg_checkin_by_emp_v2", checkinByEmp);
    }

    // 21. Hydrate Evidence files & Lampiran KPI Setting from dedicated backend table pa_evidence_files
    const evidenceFilesDb = data.evidenceFiles as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(evidenceFilesDb) && evidenceFilesDb.length > 0) {
      const mappedEvidence: UploadedEvidenceRecord[] = evidenceFilesDb
        .filter((r) => Boolean(r && r.file_name && r.public_url))
        .map((r) => ({
          id: String(r.id ?? ""),
          employeeId: String(r.employee_id ?? ""),
          fullName: String(r.employee_name ?? ""),
          companyUnit: canonicalizeDbCompanyUnit(r.company_unit ?? ""),
          division: String(r.division ?? ""),
          department: String(r.department ?? ""),
          position: String(r.position ?? ""),
          moduleType: String(r.module_type ?? ""),
          period: String(r.period ?? "2026"),
          month: String(r.month ?? "All"),
          kpi: String(r.kpi_name ?? ""),
          fileName: String(r.file_name ?? ""),
          fileSize: Number(r.file_size ?? 0),
          mimeType: String(r.mime_type ?? "application/octet-stream"),
          url: String(r.public_url ?? ""),
          approvalStatus: String(r.approval_status ?? "Pending"),
          submittedDate: String(r.submitted_date ?? ""),
        }));
      if (mappedEvidence.length > 0) {
        safeSetLocalJson(EVIDENCE_LIST_KEY, mappedEvidence);
      }
      let attMap: Record<string, HydratedKpiAttachmentItem[]> = {};
      try {
        attMap = JSON.parse(safeGetLocalRaw("pa_kpi_attachments_v1") ?? "{}") ?? {};
      } catch {
        attMap = {};
      }
      for (const ev of mappedEvidence) {
        if (ev.moduleType !== "Lampiran KPI Setting" || !ev.employeeId) continue;
        const stripped = ev.employeeId.trim().replace(/^emp-mi-/i, "");
        const num = stripped.match(/^(?:EMP-?|E)(\d+)$/i)?.[1];
        const canonKey = num ? `EMP-${num.padStart(3, "0")}` : stripped.toUpperCase();
        const existingList = Array.isArray(attMap[canonKey]) ? [...attMap[canonKey]] : [];
        if (!existingList.some((x) => x.id === ev.id || (x.name === ev.fileName && x.size === ev.fileSize))) {
          existingList.push({
            id: ev.id,
            name: ev.fileName,
            size: ev.fileSize,
            mimeType: ev.mimeType,
            url: ev.url,
            uploadedAt: ev.submittedDate,
          });
          attMap[canonKey] = existingList;
        }
      }
      safeSetLocalJson("pa_kpi_attachments_v1", attMap);
    }

    _lastBackendStatus = {
      connected: true,
      supabaseHost: SUPABASE_URL.replace(/^https?:\/\//, ""),
      remoteUsersCount: syncedActiveUsers.length,
      localUsersCount: syncedActiveUsers.length,
    };
    window.dispatchEvent(new Event("pa-db-hydrated"));
    window.dispatchEvent(new Event("pa-auth-updated"));
    window.dispatchEvent(new Event("appraisal-updated"));
    window.dispatchEvent(new Event("feedback-updated"));
    window.dispatchEvent(new Event("year-end-updated"));
    window.dispatchEvent(new Event("pa-evidence-updated"));
    window.dispatchEvent(new Event("pa-audit-updated"));
  } catch {
    // ignore hydration errors
  }
}

export async function deleteBackendRecordFromSupabase(
  table: string,
  column: string,
  value: string,
): Promise<void> {
  try {
    await fetch(`${SUPABASE_REST_BASE}/${table}?${column}=eq.${encodeURIComponent(value)}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
  } catch {
    // ignore network errors
  }
}

/**
 * Mengganti seluruh data karyawan dummy di Backend Supabase & state lokal dengan data hasil Import Excel,
 * serta opsional mereset data transaksi dummy agar siap digunakan untuk Trial End-to-End dari awal.
 */
export async function replaceAllBackendUsersAndResetForTrial(
  importedUsers: Array<Record<string, unknown>>,
  resetTransactions = true,
): Promise<void> {
  const TRANSACTIONAL_KEYS = [
    "appraisal_workflow_v1",
    "appraisal_row_aliases_v1",
    "sg_approvals_overrides",
    "all_assessments_v2",
    "kpi_tracking_v1",
    "kpi_tracking_submit_v1_employee",
    "kpi_tracking_submit_v1_supervisor",
    "kpi_tracking_submit_v1_staff",
    "kpi_approval_comments",
    "kpi_evidence_files",
    "kpi_evidence_files_by_emp_v1",
    "kpi_monthly_notes",
    "kpi_rca_submissions",
    "rca_approval_decisions_v1",
    "smart_goals_v1",
    "smart_goals_checkin_v1",
    "smart_goals_approvals_v1",
    "appraisal_form_self_v1",
    "appraisal_form_approver_v1",
    "ms_self_v1",
    "ms_approver_v1",
    "inter_department_feedback_workflows_v2",
    "pa_project_icf_by_emp_v1",
    "pa_project_icf_excel_v1",
    "pa_interview_schedules_v1",
    "year_end_workflow_2026",
    "pa_open_lock_requests_v1",
    "pa_mgmt_override_rows_v1",
    "pa_mi_supervisor_assessments_v1",
    "pa_mi_penilai1_scores_v1",
    "pa_mi_results_by_emp_v1",
    "pa_calibration_adj_scores_v1",
    "pa_calibration_adj_comments_v1",
    "pa_bod_cal_status_map_v1",
    "pa_bod_cal_approved_at_v1",
  ];

  if (resetTransactions) {
    for (const key of TRANSACTIONAL_KEYS) {
      memoryKvFallback.delete(key);
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    safeSetLocalRaw("pa_trial_mode_clean_v1", "true");
    savePersistedState("pa_trial_mode_clean_v1", true);
  }

  // Save new imported users as authoritative state (both PostgREST & Edge Function kv_store_74dadec6)
  savePersistedState("pa_managed_users_v1", importedUsers);
  await syncToSupabase({
    kind: "users-replace",
    users: importedUsers,
    resetKeys: resetTransactions ? TRANSACTIONAL_KEYS : [],
  });

  try {
    // Clear old users in Supabase pa_users table then upsert imported users
    await fetch(`${SUPABASE_REST_BASE}/pa_users?employee_id=neq.__NONE__`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (importedUsers.length > 0) {
      await syncDirectToPostgrest({ kind: "users-batch", users: importedUsers });
    }
    if (resetTransactions) {
      const cleanResetList = TRANSACTIONAL_KEYS.map((k) => encodeURIComponent(k)).join(",");
      if (cleanResetList) {
        await fetch(`${SUPABASE_REST_BASE}/pa_kv_state?state_key=in.(${cleanResetList})`, {
          method: "DELETE",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });
      }
    }
  } catch {
    // Ignore network errors if offline
  }

  window.dispatchEvent(new Event("pa-auth-updated"));
  window.dispatchEvent(new Event("pa-employees-imported"));
  window.dispatchEvent(new Event("appraisal-updated"));
  window.dispatchEvent(new Event("feedback-updated"));
}
