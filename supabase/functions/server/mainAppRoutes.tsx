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
    ] = await Promise.all([
      client.from("pa_users").select("*").order("employee_id"),
      client.from("pa_group_rules").select("*"),
      client.from("pa_role_permissions").select("*"),
      client.from("pa_menu_configs").select("*").eq("id", "default").maybeSingle(),
      client.from("pa_module_windows").select("*"),
      client.from("pa_workflow_documents").select("*"),
      client.from("pa_open_lock_requests").select("*").order("submitted_at", { ascending: false }),
      client.from("pa_interview_schedules").select("*").order("created_at", { ascending: false }),
      client.from("pa_audit_trail").select("*").order("id", { ascending: false }).limit(100),
      client.from("pa_app_notifications").select("*").order("id", { ascending: false }).limit(100),
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
