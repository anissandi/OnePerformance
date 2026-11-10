import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const mainAppRoutes = new Hono();

function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Konfigurasi SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum tersedia.");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

mainAppRoutes.get("/bootstrap", async (c) => {
  try {
    const client = getServiceClient();
    const [
      usersRes,
      rulesRes,
      permsRes,
      menusRes,
      windowsRes,
      docsRes,
      locksRes,
      schedulesRes,
      auditRes,
      notifRes,
      kvRes,
      evidenceRes,
      catalogsRes,
      calSettingsRes,
      calAdjustRes,
      yearEndRes,
    ] = await Promise.all([
      client.from("pa_users").select("*").order("employee_id"),
      client.from("pa_group_rules").select("*"),
      client.from("pa_role_permissions").select("*"),
      client.from("pa_menu_configs").select("*").eq("id", "default").maybeSingle(),
      client.from("pa_module_windows").select("*"),
      client.from("pa_workflow_documents").select("*"),
      client.from("pa_open_lock_requests").select("*").order("submitted_at", { ascending: false }),
      client.from("pa_interview_schedules").select("*").order("created_at", { ascending: false }),
      client.from("pa_audit_trail").select("*").order("id", { ascending: false }).limit(150),
      client.from("pa_app_notifications").select("*").order("id", { ascending: false }).limit(100),
      client.from("pa_kv_state").select("*"),
      client.from("pa_evidence_files").select("*").order("created_at", { ascending: false }),
      client.from("pa_master_catalogs").select("*"),
      client.from("pa_calibration_settings").select("*"),
      client.from("pa_calibration_adjustments").select("*"),
      client.from("pa_year_end_verifications").select("*").eq("period", "2026").maybeSingle(),
    ]);
    return c.json({
      ok: true,
      users: usersRes.data ?? [],
      groupRules: rulesRes.data ?? [],
      rolePermissions: permsRes.data ?? [],
      menuConfig: menusRes.data?.menus ?? null,
      moduleWindows: windowsRes.data ?? [],
      documents: docsRes.data ?? [],
      openLocks: locksRes.data ?? [],
      interviewSchedules: schedulesRes.data ?? [],
      auditTrail: auditRes.data ?? [],
      notifications: notifRes.data ?? [],
      kvStates: kvRes.data ?? [],
      evidenceFiles: evidenceRes.data ?? [],
      masterCatalogs: catalogsRes.data ?? [],
      calibrationSettings: calSettingsRes.data ?? [],
      calibrationAdjustments: calAdjustRes.data ?? [],
      yearEndVerification: yearEndRes.data?.state ?? null,
      serverNow: new Date().toISOString(),
    });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Bootstrap gagal" }, 503);
  }
});

mainAppRoutes.post("/login", async (c) => {
  try {
    const client = getServiceClient();
    const body = await c.req.json();
    const employeeId = String(body.employeeId ?? "").trim();
    if (!employeeId) {
      return c.json({ error: "Employee ID wajib diisi." }, 400);
    }
    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    await client
      .from("pa_users")
      .update({ last_login: nowStr, updated_at: new Date().toISOString() })
      .ilike("employee_id", employeeId);

    await client.from("pa_audit_trail").insert({
      timestamp: `${nowStr}:00`,
      user_id: employeeId.toUpperCase(),
      user_name: String(body.name ?? employeeId),
      role: String(body.role ?? "Employee"),
      action: "Login",
      module: "Authentication",
      sub_module: "Login Page",
      description: `User logged in via Company Unit ${body.company ?? "-"}`,
      status: "Success",
    });
    return c.json({ ok: true, lastLogin: nowStr });
  } catch {
    return c.json({ ok: false }, 200);
  }
});

mainAppRoutes.post("/sync", async (c) => {
  try {
    const client = getServiceClient();
    const body = await c.req.json();
    const kind = String(body.kind ?? "");
    const now = new Date().toISOString();

    if (kind === "user-upsert" && body.user) {
      const u = body.user;
      await client.from("pa_users").upsert({
        employee_id: u.employeeId,
        name: u.name,
        email: u.email,
        position: u.position,
        company: u.company,
        unit_id: u.unitId ?? "IND",
        division: u.division,
        department: u.department,
        grade: u.grade ?? "Grade 5",
        role: u.role || "Employee",
        groupings: u.groupings,
        status: u.status ?? "Active",
        last_login: u.lastLogin ?? "",
        updated_at: now,
      });
    } else if (kind === "user-delete" && body.employeeId) {
      await client.from("pa_users").delete().eq("employee_id", body.employeeId);
    } else if (kind === "group-rules" && Array.isArray(body.rules)) {
      const company = String(body.company ?? "DEFAULT");
      for (const r of body.rules) {
        await client.from("pa_group_rules").upsert({
          id: `${company}::${r.id}`,
          company,
          position: r.position,
          group_name: r.group,
          description: r.description ?? "",
          allowed_modules: r.allowedModules ?? [],
          updated_at: now,
        });
      }
    } else if (kind === "role-permissions" && body.role && body.permissions) {
      await client.from("pa_role_permissions").upsert({
        role: body.role,
        permissions: body.permissions,
        updated_at: now,
      });
    } else if (kind === "menu-configs" && Array.isArray(body.menus)) {
      await client.from("pa_menu_configs").upsert({
        id: "default",
        menus: body.menus,
        updated_at: now,
      });
    } else if (kind === "module-window" && body.window) {
      const w = body.window;
      await client.from("pa_module_windows").upsert({
        unit_id: w.unitId ?? "ALL",
        module_id: w.moduleId,
        period: w.period ?? "2026",
        active: Boolean(w.active),
        start_date: w.startDate ?? "",
        end_date: w.endDate ?? "",
        extra: w.extra ?? {},
        updated_by: w.updatedBy ?? null,
        updated_at: now,
      });
    } else if (kind === "workflow-document" && body.doc) {
      const d = body.doc;
      await client.from("pa_workflow_documents").upsert({
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
      });
      await client.from("pa_workflow_events").insert({
        doc_key: d.key,
        employee_id: d.employeeId,
        module: d.module,
        phase: d.phase ?? "measurement",
        period: d.year ?? "2026",
        version: Number(d.version ?? 1),
        action: d.action ?? "submit",
        actor_id: d.actorId ?? d.employeeId,
        stage: d.stage ?? null,
        status: d.status ?? "Pending",
        note: d.note ?? "",
        payload: d.payload ?? d,
      });
    } else if (kind === "open-lock" && body.request) {
      const r = body.request;
      await client.from("pa_open_lock_requests").upsert({
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
      });
    } else if (kind === "interview-schedule" && body.schedule) {
      const s = body.schedule;
      await client.from("pa_interview_schedules").upsert({
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
      });
    } else if (kind === "kv-state" && body.stateKey) {
      await client.from("pa_kv_state").upsert({
        state_key: String(body.stateKey),
        state_value: body.stateValue ?? {},
        updated_at: now,
      });
    } else if (kind === "master-catalog" && body.catalogKey) {
      await client.from("pa_master_catalogs").upsert({
        catalog_key: String(body.catalogKey),
        data: body.data ?? {},
        updated_at: now,
      });
    } else if (kind === "score-weights" && body.companyUnit) {
      await client.from("pa_score_weights").upsert({
        company_unit: String(body.companyUnit),
        weights: body.weights ?? {},
        updated_at: now,
      });
    } else if (kind === "approval-config" && body.configKey) {
      await client.from("pa_approval_configs").upsert({
        config_key: String(body.configKey),
        data: body.data ?? {},
        updated_at: now,
      });
    } else if (kind === "cycle-config") {
      await client.from("pa_cycle_configs").upsert({
        cycle_id: String(body.cycleId ?? "2026"),
        data: body.data ?? {},
        updated_at: now,
      });
    } else if (kind === "data-sync" && Array.isArray(body.items)) {
      for (const item of body.items) {
        await client.from("pa_data_sync_logs").upsert({
          sync_id: String(item.id),
          label: String(item.label ?? item.id),
          last_sync: item.lastSync ?? now,
          status: String(item.status ?? "success"),
          updated_at: now,
        });
      }
    } else if (kind === "kpi-business" && Array.isArray(body.items)) {
      await client.from("pa_kpi_business").upsert({
        id: String(body.id ?? "corporate-2026"),
        period: String(body.period ?? "2026"),
        items: body.items,
        status: String(body.status ?? "Submitted"),
        updated_at: now,
      });
    } else if (kind === "kpi-setting" && body.docKey) {
      await client.from("pa_kpi_settings").upsert({
        doc_key: String(body.docKey),
        employee_id: String(body.employeeId ?? "E002"),
        company_unit: String(body.companyUnit ?? "PT RSUP (Industry)"),
        tab: String(body.tab ?? "personal"),
        period: String(body.period ?? "2026"),
        items: body.items ?? [],
        status: String(body.status ?? "Submitted"),
        updated_at: now,
      });
    } else if (kind === "kpi-tracking" && body.docKey) {
      await client.from("pa_kpi_trackings").upsert({
        doc_key: String(body.docKey),
        employee_id: String(body.employeeId ?? "E002"),
        period: String(body.period ?? "2026"),
        months: body.months ?? [],
        cells_map: body.cellsMap ?? {},
        monthly_notes: body.monthlyNotes ?? {},
        comments: body.comments ?? {},
        updated_at: now,
      });
    } else if (kind === "rca-submission" && body.submission) {
      const sub = body.submission;
      await client.from("pa_rca_submissions").upsert({
        doc_key: String(sub.key ?? sub.id),
        employee_id: String(sub.employeeId ?? "E002"),
        period: String(sub.year ?? "2026"),
        kpi_indicator: String(sub.kpiIndicator ?? ""),
        periode: String(sub.periode ?? ""),
        submission: sub,
        approval_decisions: body.approvalDecisions ?? [],
        updated_at: now,
      });
    } else if (kind === "smart-goals") {
      await client.from("pa_smart_goals").upsert({
        employee_id: String(body.employeeId ?? "E002"),
        period: String(body.period ?? "2026"),
        goals: body.goals ?? [],
        checkin_entries: body.checkinEntries ?? [],
        approval_decisions: body.approvalDecisions ?? [],
        status: String(body.status ?? "Submitted"),
        updated_at: now,
      });
    } else if (kind === "appraisal-form") {
      await client.from("pa_appraisal_forms").upsert({
        employee_id: String(body.employeeId ?? "E002"),
        period: String(body.period ?? "2026"),
        self_ratings: body.selfRatings ?? null,
        approver_ratings: body.approverRatings ?? [],
        status: String(body.status ?? "Submitted"),
        updated_at: now,
      });
    } else if (kind === "managerial-skill") {
      await client.from("pa_managerial_skills").upsert({
        employee_id: String(body.employeeId ?? "E002"),
        period: String(body.period ?? "2026"),
        self_ratings: body.selfRatings ?? null,
        approver_ratings: body.approverRatings ?? [],
        status: String(body.status ?? "Submitted"),
        updated_at: now,
      });
    } else if (kind === "inter-dept-feedback" && body.submission) {
      const sub = body.submission;
      await client.from("pa_inter_dept_feedbacks").upsert({
        submission_id: String(sub.row?.no ?? `IDF-${Date.now()}`),
        employee_id: String(sub.row?.employeeId ?? "E002"),
        period: "2026",
        submission: sub,
        updated_at: now,
      });
    } else if (kind === "project-records" && body.employeeId) {
      await client.from("pa_project_records").upsert({
        employee_id: String(body.employeeId),
        period: String(body.period ?? "2026"),
        file_name: String(body.fileName ?? "Project_ICF_2026.xlsx"),
        submitted: Boolean(body.submitted ?? true),
        submitted_date: String(body.submittedDate ?? now.slice(0, 10)),
        rows: body.rows ?? [],
        updated_at: now,
      });
    } else if (kind === "interview-assessment" && body.employeeId) {
      await client.from("pa_interview_assessments").upsert({
        employee_id: String(body.employeeId),
        period: String(body.period ?? "2026"),
        schedule_period: String(body.schedulePeriod ?? "15–17 January 2027"),
        penilai: body.penilai ?? [],
        penilai1_score: body.penilai1Score ?? null,
        updated_at: now,
      });
    } else if (kind === "calibration-setting" && body.unitId) {
      await client.from("pa_calibration_settings").upsert({
        unit_id: String(body.unitId),
        unit_name: String(body.unitName ?? body.unitId),
        data: body.data ?? {},
        updated_at: now,
      });
    } else if (kind === "year-end-verification" && body.state) {
      await client.from("pa_year_end_verifications").upsert({
        period: String(body.period ?? "2026"),
        state: body.state,
        updated_at: now,
      });
    } else if (kind === "calibration-adjustment" && body.adjustmentKey) {
      await client.from("pa_calibration_adjustments").upsert({
        adjustment_key: String(body.adjustmentKey),
        unit_name: String(body.unitName ?? "PT RSUP (Industry)"),
        employee_id: String(body.employeeId ?? "E002"),
        period: String(body.period ?? "2026"),
        proposed_score: body.proposedScore ?? null,
        proposed_grade: body.proposedGrade ?? null,
        reason: String(body.reason ?? ""),
        status: String(body.status ?? "Submitted"),
        bod_decision: body.bodDecision ?? null,
        bod_note: body.bodNote ?? null,
        data: body.data ?? {},
        updated_at: now,
      });
    } else if (kind === "management-override" && body.overrideId) {
      await client.from("pa_management_overrides").upsert({
        override_id: String(body.overrideId),
        employee_id: String(body.employeeId ?? "E002"),
        module: String(body.module ?? "KPI"),
        data: body.data ?? {},
        updated_at: now,
      });
    }

    if (body.audit) {
      const a = body.audit;
      await client.from("pa_audit_trail").insert({
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

    return c.json({ ok: true, syncedAt: now });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Sync gagal" }, 200);
  }
});

mainAppRoutes.post("/evidence/upload", async (c) => {
  try {
    const client = getServiceClient();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "File wajib dilampirkan." }, 400);
    }
    const employeeId = String(form.get("employeeId") ?? "E002");
    const employeeName = String(form.get("employeeName") ?? "Siti Rahayu");
    const companyUnit = String(form.get("companyUnit") ?? "PT RSUP (Industry)");
    const division = String(form.get("division") ?? "Divisi Sumber Daya Manusia");
    const department = String(form.get("department") ?? "SDM");
    const position = String(form.get("position") ?? "Staff Pengembangan SDM");
    const moduleType = String(form.get("moduleType") ?? "KPI Tracking");
    const period = String(form.get("period") ?? "2026");
    const month = String(form.get("month") ?? "June");
    const kpiName = String(form.get("kpiName") ?? "");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const storagePath = `${period}/${moduleType.replace(/\s+/g, "_")}/${employeeId}/${id}_${safeName}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await client.storage
      .from("pa-evidence")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadErr) {
      return c.json({ ok: false, error: uploadErr.message }, 500);
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pa-evidence/${storagePath}`;
    const submittedDate = new Date().toISOString().slice(0, 10);

    const row = {
      id,
      employee_id: employeeId,
      employee_name: employeeName,
      company_unit: companyUnit,
      division,
      department,
      position,
      module_type: moduleType,
      period,
      month,
      kpi_name: kpiName,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
      public_url: publicUrl,
      approval_status: "Pending",
      submitted_date: submittedDate,
    };
    await client.from("pa_evidence_files").upsert(row);

    await client.from("pa_audit_trail").insert({
      timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
      user_id: employeeId,
      user_name: employeeName,
      role: "Employee",
      action: "Create",
      module: moduleType,
      sub_module: "Evidence",
      description: `Uploaded evidence file "${file.name}" (${moduleType} · ${month} ${period})`,
      status: "Success",
    });

    return c.json({
      ok: true,
      evidence: {
        id,
        employeeId,
        fullName: employeeName,
        companyUnit,
        division,
        department,
        position,
        moduleType,
        period,
        month,
        kpi: kpiName,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        url: publicUrl,
        approvalStatus: "Pending",
        submittedDate,
      },
    });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : "Upload gagal" }, 500);
  }
});
