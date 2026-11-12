import { projectId as fallbackProjectId, publicAnonKey as fallbackAnonKey } from "../../../utils/supabase/info";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_PROJECT_ID =
  env.VITE_SUPABASE_PROJECT_ID?.trim() || fallbackProjectId;

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL?.trim() || `https://${SUPABASE_PROJECT_ID}.supabase.co`;

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY?.trim() || fallbackAnonKey;

export const PA_APP_API_BASE = `${SUPABASE_URL}/functions/v1/make-server-74dadec6/pa-app`;
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
    const fullRow = {
      employee_id: String(u.employeeId ?? ""),
      no: String(u.no ?? ""),
      reg_no: String(u.regNo ?? ""),
      name: String(u.name ?? ""),
      email: String(u.email ?? ""),
      position: String(u.position ?? ""),
      company: String(u.company ?? ""),
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
      reg_no_ap1: String(u.regNoAp1 ?? ""),
      reg_no_ap2: String(u.regNoAp2 ?? ""),
      is_hr_unit_checker: Boolean(u.isHrUnitChecker ?? u.role === "HR Unit"),
      is_hr_icf_validator: Boolean(u.isHrIcfValidator ?? (u.role === "HR ICF" || u.role === "Administrator")),
      updated_at: now,
    };
    ok = await restUpsert("pa_users", fullRow, "employee_id");
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
    ok = await restUpsert(
      "pa_rca_submissions",
      {
        doc_key: String(sub.key ?? sub.id),
        employee_id: String(sub.employeeId ?? "E002"),
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
    // Primary path: direct PostgREST write (works immediately once SQL migrations are applied, even without Edge Function CLI deploy)
    const directOk = await syncDirectToPostgrest(payload);
    if (directOk) return;

    // Secondary path: Edge Function
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
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePersistedState<T>(
  key: string,
  value: T,
  normalizedPayload?: Record<string, unknown>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // Ditunda agar listener (mis. Sidebar) tidak melakukan setState saat komponen lain sedang render
    queueMicrotask(() => window.dispatchEvent(new Event("pa-db-hydrated")));
    void syncToSupabase({
      kind: "kv-state",
      stateKey: key,
      stateValue: value,
    });
    if (normalizedPayload) {
      void syncToSupabase(normalizedPayload);
    }
  } catch {
    // ignore storage errors
  }
}

export function loadUploadedEvidenceList(): UploadedEvidenceRecord[] {
  return loadPersistedState<UploadedEvidenceRecord[]>(EVIDENCE_LIST_KEY, []);
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
  const fallbackRecord: UploadedEvidenceRecord = {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    employeeId: meta.employeeId ?? "E002",
    fullName: meta.employeeName ?? "Siti Rahayu",
    companyUnit: meta.companyUnit ?? "PT RSUP (Industry)",
    division: meta.division ?? "Divisi Sumber Daya Manusia",
    department: meta.department ?? "SDM",
    position: meta.position ?? "Staff Pengembangan SDM",
    moduleType: meta.moduleType,
    period: meta.period ?? "2026",
    month: meta.month ?? "June",
    kpi: meta.kpiName ?? "",
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    url: URL.createObjectURL(file),
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
      const saved = [directRecord, ...loadUploadedEvidenceList()];
      localStorage.setItem(EVIDENCE_LIST_KEY, JSON.stringify(saved));
      window.dispatchEvent(new Event("pa-evidence-updated"));
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
        const saved = [data.evidence as UploadedEvidenceRecord, ...loadUploadedEvidenceList()];
        localStorage.setItem(EVIDENCE_LIST_KEY, JSON.stringify(saved));
        window.dispatchEvent(new Event("pa-evidence-updated"));
        return data.evidence as UploadedEvidenceRecord;
      }
    }
  } catch {
    // Fall through to local persistence
  }

  const saved = [fallbackRecord, ...loadUploadedEvidenceList()];
  localStorage.setItem(EVIDENCE_LIST_KEY, JSON.stringify(saved));
  window.dispatchEvent(new Event("pa-evidence-updated"));
  return fallbackRecord;
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

export function loadLocalAuditLogs(): StoredAuditLogEntry[] {
  return loadPersistedState<StoredAuditLogEntry[]>(AUDIT_LIST_KEY, []);
}

export function appendLocalAuditLog(entry: StoredAuditLogEntry): void {
  try {
    const existing = loadLocalAuditLogs();
    const next = [entry, ...existing].slice(0, 200);
    localStorage.setItem(AUDIT_LIST_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("pa-audit-updated"));
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

export async function fetchBootstrapFromSupabase(): Promise<Record<string, unknown> | null> {
  try {
    // 1. Try direct PostgREST queries first (works immediately without requiring Edge Function deployment)
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
    ]);
    if (
      users.length > 0 ||
      kvStates.length > 0 ||
      masterCatalogs.length > 0 ||
      evidenceFiles.length > 0 ||
      auditTrail.length > 0 ||
      workflowDocs.length > 0 ||
      interviewSchedules.length > 0
    ) {
      return {
        ok: true,
        users,
        kvStates,
        masterCatalogs,
        evidenceFiles,
        auditTrail,
        yearEndVerification: (yearEndRows[0] as { state?: unknown } | undefined)?.state ?? null,
        workflowDocs,
        interviewSchedules,
        groupRules,
        scoreWeights,
        projectRecords,
        rolePermissions,
        menuConfig: (menuConfigs[0] as { menus?: unknown } | undefined)?.menus ?? null,
        openLocks,
      };
    }

    // 2. Fallback to Edge Function /bootstrap
    const response = await fetch(`${PA_APP_API_BASE}/bootstrap`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

export async function hydrateAllStoresFromSupabase(): Promise<void> {
  const data = await fetchBootstrapFromSupabase();
  if (!data) {
    // If backend tables exist but are still empty on first connection, seed current users to backend
    try {
      const probe = await fetch(`${SUPABASE_REST_BASE}/pa_users?select=employee_id&limit=1`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (probe.ok) {
        const existing = await probe.json();
        if (Array.isArray(existing) && existing.length === 0) {
          const localUsersRaw = localStorage.getItem("pa_managed_users_v1");
          const localUsers: Array<Record<string, unknown>> = localUsersRaw ? JSON.parse(localUsersRaw) : [];
          for (const u of localUsers) {
            await syncDirectToPostgrest({ kind: "user-upsert", user: u });
          }
        }
      }
    } catch {
      // ignore probe errors
    }
    return;
  }

  try {
    // 1. Hydrate generic KV states first
    const kvStates = data.kvStates as Array<{ state_key: string; state_value: unknown }> | undefined;
    if (Array.isArray(kvStates)) {
      for (const row of kvStates) {
        if (row.state_key && row.state_value !== undefined) {
          localStorage.setItem(row.state_key, JSON.stringify(row.state_value));
        }
      }
    }

    // 2. Hydrate users if available in DB
    const users = data.users as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(users) && users.length > 0) {
      const mapped = users.map((u, idx) => ({
        id: String(idx + 1),
        no: String(u.no ?? idx + 1),
        regNo: String(u.reg_no ?? `REG-${String(idx + 1).padStart(3, "0")}`),
        name: String(u.name ?? ""),
        employeeId: String(u.employee_id ?? ""),
        position: String(u.position ?? ""),
        company: String(u.company ?? ""),
        division: String(u.division ?? ""),
        department: String(u.department ?? ""),
        bagian: String(u.bagian ?? ""),
        joinDate: String(u.join_date ?? ""),
        telegramNo: String(u.telegram_no ?? ""),
        grade: String(u.grade || "Grade 5"),
        role: String(u.role ?? "Employee"),
        groupings: String(u.groupings ?? "Operasional"),
        status: String(u.status || "Active"),
        lastLogin: String(u.last_login || ""),
        email: String(u.email ?? ""),
        regNoAp1: String(u.reg_no_ap1 ?? ""),
        regNoAp2: String(u.reg_no_ap2 ?? ""),
        isHrUnitChecker: Boolean(u.is_hr_unit_checker ?? u.role === "HR Unit"),
        isHrIcfValidator: Boolean(u.is_hr_icf_validator ?? (u.role === "HR ICF" || u.role === "Administrator")),
      }));
      localStorage.setItem("pa_managed_users_v1", JSON.stringify(mapped));
    }

    // 3. Hydrate master catalogs
    const catalogs = data.masterCatalogs as Array<{ catalog_key: string; data: unknown }> | undefined;
    if (Array.isArray(catalogs)) {
      for (const c of catalogs) {
        if (c.catalog_key && c.data) {
          localStorage.setItem(c.catalog_key, JSON.stringify(c.data));
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
      localStorage.setItem(EVIDENCE_LIST_KEY, JSON.stringify(mappedEv));
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
      localStorage.setItem(AUDIT_LIST_KEY, JSON.stringify(mappedAudit));
    }

    // 6. Hydrate year-end verification state
    if (data.yearEndVerification) {
      localStorage.setItem("year_end_workflow_2026", JSON.stringify(data.yearEndVerification));
    }

    // 7. Hydrate normalized workflow documents if present
    const workflowDocs = data.workflowDocs as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(workflowDocs) && workflowDocs.length > 0) {
      const existingRaw = localStorage.getItem("appraisal_workflow_v1");
      const existingList: Array<Record<string, unknown>> = existingRaw ? JSON.parse(existingRaw) : [];
      const byKey = new Map<string, Record<string, unknown>>();
      for (const item of existingList) {
        if (item && typeof item.key === "string") byKey.set(item.key, item);
      }
      for (const doc of workflowDocs) {
        const payload = doc.payload as Record<string, unknown> | undefined;
        if (payload && typeof payload.key === "string") {
          byKey.set(payload.key, payload);
        }
      }
      if (byKey.size > 0) {
        localStorage.setItem("appraisal_workflow_v1", JSON.stringify(Array.from(byKey.values())));
      }
    }

    // 8. Hydrate normalized interview schedules if present
    const schedules = data.interviewSchedules as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(schedules) && schedules.length > 0) {
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
      localStorage.setItem("pa_interview_schedules_v1", JSON.stringify(mappedSchedules));
    }

    // 9. Hydrate normalized group rules by unit if present
    const groupRules = data.groupRules as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(groupRules) && groupRules.length > 0) {
      const existingRaw = localStorage.getItem("pa_group_rules_by_unit_v1");
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
      localStorage.setItem("pa_group_rules_by_unit_v1", JSON.stringify({ ...map, ...grouped }));
    }

    // 10. Hydrate normalized score weights if present
    const scoreWeights = data.scoreWeights as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(scoreWeights) && scoreWeights.length > 0) {
      const existingRaw = localStorage.getItem("score_calibration_weights_v1");
      const map: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw) : {};
      for (const sw of scoreWeights) {
        if (sw.company_unit && sw.weights) {
          map[String(sw.company_unit)] = sw.weights;
        }
      }
      localStorage.setItem("score_calibration_weights_v1", JSON.stringify(map));
    }

    // 11. Hydrate normalized project records if present
    const projectRecords = data.projectRecords as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(projectRecords) && projectRecords.length > 0) {
      const existingRaw = localStorage.getItem("pa_project_icf_by_emp_v1");
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
      localStorage.setItem("pa_project_icf_by_emp_v1", JSON.stringify(byEmp));
    }

    // 12. Hydrate Access Management role permissions if present
    const rolePermissions = data.rolePermissions as Array<{ role?: string; permissions?: Record<string, unknown> }> | undefined;
    if (Array.isArray(rolePermissions) && rolePermissions.length > 0) {
      const existingRaw = localStorage.getItem("pa_access_permissions_v2");
      const map: Record<string, unknown> = existingRaw ? JSON.parse(existingRaw) : {};
      for (const rp of rolePermissions) {
        // Hanya gunakan data dari tabel pa_role_permissions jika sudah memiliki struktur v2 (ada field dashboard & profile)
        if (rp.role && rp.permissions && typeof rp.permissions === "object" && "dashboard" in rp.permissions && "profile" in rp.permissions) {
          map[String(rp.role)] = rp.permissions;
        }
      }
      if (Object.keys(map).length > 0) {
        localStorage.setItem("pa_access_permissions_v2", JSON.stringify(map));
      }
    }

    // 13. Hydrate Menu Management configuration if present
    if (Array.isArray(data.menuConfig) && data.menuConfig.length > 0) {
      localStorage.setItem("pa_menu_configs_v1", JSON.stringify(data.menuConfig));
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
      localStorage.setItem("pa_open_lock_requests_v1", JSON.stringify(mappedLocks));
    }

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
      localStorage.removeItem(key);
    }
    localStorage.setItem("pa_trial_mode_clean_v1", "true");
    savePersistedState("pa_trial_mode_clean_v1", true);
  }

  // Save new imported users as authoritative state
  savePersistedState("pa_managed_users_v1", importedUsers);

  try {
    // Clear old users in Supabase pa_users table then upsert imported users
    await fetch(`${SUPABASE_REST_BASE}/pa_users?employee_id=neq.__NONE__`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    for (const u of importedUsers) {
      await syncDirectToPostgrest({ kind: "user-upsert", user: u });
    }
    if (resetTransactions) {
      for (const key of TRANSACTIONAL_KEYS) {
        await fetch(`${SUPABASE_REST_BASE}/pa_kv_state?state_key=eq.${encodeURIComponent(key)}`, {
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
