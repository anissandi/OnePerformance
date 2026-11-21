// Vercel Serverless Function — jembatan langsung ke Supabase memakai SUPABASE_SERVICE_ROLE_KEY
// yang otomatis disuntikkan saat klik "Connect project" di integrasi Supabase <-> Vercel.

function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).trim().replace(/\/+$/, "");

  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  return { url, key, isServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) };
}

function mergePasswordMaps(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const ra = a && a[k];
    const rb = b && b[k];
    if (ra && !rb) { out[k] = ra; continue; }
    if (rb && !ra) { out[k] = rb; continue; }
    if (!ra || !rb) continue;
    const aHas = Boolean(ra.passwordDigest);
    const bHas = Boolean(rb.passwordDigest);
    const aReset = String(ra.passwordResetAt || "");
    const bReset = String(rb.passwordResetAt || "");
    const aTs = String(ra.updatedAt || "");
    const bTs = String(rb.updatedAt || "");
    if (aHas && !bHas) out[k] = bReset && bReset > aTs ? rb : ra;
    else if (bHas && !aHas) out[k] = aReset && aReset > bTs ? ra : rb;
    else out[k] = bTs >= aTs ? rb : ra;
  }
  return out;
}

async function pgRest(cfg, pathAndQuery, init = {}) {
  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  return fetch(`${cfg.url}/rest/v1/${pathAndQuery}`, { ...init, headers });
}

function canonicalizeUnitName(raw) {
  const s = String(raw ?? "").trim();
  const u = s.toUpperCase().replace(/\s+/g, " ");
  if (u === "ASD" || u === "RSUP ASD" || u === "PT. RSUP ASD" || u === "PT RSUP (ASD)" || u === "PT RSUP ASD") {
    return "PT RSUP ASD";
  }
  return s;
}

function cleanApproverRef(val) {
  const s = String(val ?? "").trim();
  if (!s) return "";
  const u = s.toUpperCase();
  if (u === "-" || u === "—" || u === "N/A" || u === "NA" || u === "NULL" || u === "UNDEFINED") return "";
  return s;
}

function normalizeApproverPairServer(rawAp1, rawAp2) {
  const a1 = cleanApproverRef(rawAp1);
  const a2 = cleanApproverRef(rawAp2);
  if (a1 && !a2) return { regNoAp1: a1, regNoAp2: a1 };
  if (!a1 && a2) return { regNoAp1: a2, regNoAp2: a2 };
  return { regNoAp1: a1, regNoAp2: a2 };
}

function toPaUserRow(u, now, mode = "full") {
  const apPair = normalizeApproverPairServer(u.regNoAp1 ?? u.reg_no_ap1, u.regNoAp2 ?? u.reg_no_ap2);
  const base = {
    employee_id: String(u.employeeId ?? u.employee_id ?? "").trim(),
    name: String(u.name || "-"),
    email: String(u.email || ""),
    position: String(u.position || "-"),
    company: canonicalizeUnitName(u.company || "PT RSUP (Industry)"),
    unit_id: String(u.unitId || u.unit_id || "IND"),
    division: String(u.division || "-"),
    department: String(u.department || "-"),
    grade: String(u.grade || "Grade 5"),
    role: String(u.role || "Employee"),
    groupings: String(u.groupings || "Operasional"),
    status: u.status === "Inactive" ? "Inactive" : "Active",
    last_login: String(u.lastLogin ?? u.last_login ?? ""),
    updated_at: now,
  };
  if (mode === "minimal" || mode === true) return base;
  const extended = {
    ...base,
    no: String(u.no ?? ""),
    reg_no: String(u.regNo ?? u.reg_no ?? ""),
    bagian: String(u.bagian ?? ""),
    join_date: String(u.joinDate ?? u.join_date ?? ""),
    telegram_no: String(u.telegramNo ?? u.telegram_no ?? ""),
    reg_no_ap1: apPair.regNoAp1,
    reg_no_ap2: apPair.regNoAp2,
    is_hr_unit_checker: Boolean(u.isHrUnitChecker ?? u.is_hr_unit_checker ?? base.role === "HR Unit"),
    is_hr_icf_validator: Boolean(
      u.isHrIcfValidator ?? u.is_hr_icf_validator ?? (base.role === "HR ICF" || base.role === "Administrator"),
    ),
  };
  if (mode === "legacy") return extended;
  const rawCheckerUnits = Array.isArray(u.checkerUnits)
    ? u.checkerUnits
    : Array.isArray(u.checker_units)
      ? u.checker_units
      : [];
  const rawManagedUnits = Array.isArray(u.managedUnits)
    ? u.managedUnits
    : Array.isArray(u.managed_units)
      ? u.managed_units
      : [];
  return {
    ...extended,
    checker_units: Array.from(new Set(rawCheckerUnits.map((x) => canonicalizeUnitName(x)).filter(Boolean))),
    managed_units: Array.from(new Set(rawManagedUnits.map((x) => canonicalizeUnitName(x)).filter(Boolean))),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.key) {
    return res.status(200).json({ ok: false, reason: "ENV_NOT_CONFIGURED" });
  }

  try {
    if (req.method === "GET") {
      const keysParam = String((req.query && req.query.keys) || "").trim();
      const kvQuery = keysParam
        ? `pa_kv_state?select=state_key,state_value&state_key=in.(${keysParam
            .split(",")
            .map((k) => encodeURIComponent(k.trim()))
            .filter(Boolean)
            .join(",")})`
        : "pa_kv_state?select=state_key,state_value";

      const [kvRes, usersRes] = await Promise.all([
        pgRest(cfg, kvQuery),
        pgRest(cfg, "pa_users?select=*&order=employee_id.asc"),
      ]);

      const kvRows = kvRes.ok ? await kvRes.json() : [];
      const users = usersRes.ok ? await usersRes.json() : [];
      // Auto-migrate baris pa_users di database yang masih bernama "ASD" / "RSUP ASD" -> "PT RSUP ASD"
      if (Array.isArray(users) && users.some((u) => u && (u.company === "ASD" || u.company === "RSUP ASD"))) {
        const nowIso = new Date().toISOString();
        await pgRest(cfg, "pa_users?company=in.(ASD,RSUP%20ASD)", {
          method: "PATCH",
          body: JSON.stringify({ company: "PT RSUP ASD", updated_at: nowIso }),
        });
        for (const u of users) {
          if (u && u.company) u.company = canonicalizeUnitName(u.company);
        }
      }
      // Auto-normalize pasangan reg_no_ap1 & reg_no_ap2 di pa_users jika salah satu kosong
      if (Array.isArray(users)) {
        const nowIso = new Date().toISOString();
        for (const u of users) {
          if (!u) continue;
          const norm = normalizeApproverPairServer(u.reg_no_ap1, u.reg_no_ap2);
          if (norm.regNoAp1 !== String(u.reg_no_ap1 ?? "") || norm.regNoAp2 !== String(u.reg_no_ap2 ?? "")) {
            u.reg_no_ap1 = norm.regNoAp1;
            u.reg_no_ap2 = norm.regNoAp2;
            if (u.employee_id) {
              await pgRest(cfg, `pa_users?employee_id=eq.${encodeURIComponent(String(u.employee_id))}`, {
                method: "PATCH",
                body: JSON.stringify({ reg_no_ap1: norm.regNoAp1, reg_no_ap2: norm.regNoAp2, updated_at: nowIso }),
              });
            }
          }
        }
      }
      const kvMap = {};
      if (Array.isArray(kvRows)) {
        for (const r of kvRows) {
          if (r && r.state_key) kvMap[r.state_key] = r.state_value;
        }
      }
      return res.status(200).json({
        ok: kvRes.ok || usersRes.ok,
        isServiceRole: cfg.isServiceRole,
        supabaseHost: cfg.url.replace(/^https?:\/\//, ""),
        kvStatus: kvRes.status,
        usersStatus: usersRes.status,
        kvStates: Array.isArray(kvRows) ? kvRows : [],
        kvMap,
        users: Array.isArray(users) ? users : [],
      });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const kind = String(body.kind || "");
      const now = new Date().toISOString();

      if (kind === "kv-state" && body.stateKey) {
        const stateKey = String(body.stateKey);
        let valueToWrite = body.stateValue ?? {};
        if (stateKey === "pa_user_password_security_v1" && valueToWrite && typeof valueToWrite === "object") {
          const prevRes = await pgRest(cfg, `pa_kv_state?select=state_value&state_key=eq.${encodeURIComponent(stateKey)}&limit=1`);
          const prevRows = prevRes.ok ? await prevRes.json() : [];
          const prevVal = prevRows && prevRows[0] ? prevRows[0].state_value : {};
          valueToWrite = mergePasswordMaps(prevVal, valueToWrite);
        }
        const up = await pgRest(cfg, "pa_kv_state?on_conflict=state_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ state_key: stateKey, state_value: valueToWrite, updated_at: now }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status });
      }

      if (kind === "kv-map-merge" && body.stateKey && body.recordKey) {
        const stateKey = String(body.stateKey);
        const recordKey = String(body.recordKey);
        const prevRes = await pgRest(cfg, `pa_kv_state?select=state_value&state_key=eq.${encodeURIComponent(stateKey)}&limit=1`);
        const prevRows = prevRes.ok ? await prevRes.json() : [];
        const prevObj = prevRows && prevRows[0] && typeof prevRows[0].state_value === "object" && !Array.isArray(prevRows[0].state_value)
          ? prevRows[0].state_value
          : {};
        const nextObj = { ...prevObj, [recordKey]: body.record };
        const up = await pgRest(cfg, "pa_kv_state?on_conflict=state_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ state_key: stateKey, state_value: nextObj, updated_at: now }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status, stateValue: nextObj });
      }

      if ((kind === "users-batch" || kind === "users-replace") && Array.isArray(body.users)) {
        if (kind === "users-replace") {
          await pgRest(cfg, "pa_users?employee_id=neq.__NONE__", { method: "DELETE" });
          if (Array.isArray(body.resetKeys) && body.resetKeys.length > 0) {
            const cleanReset = body.resetKeys
              .map((k) => encodeURIComponent(String(k).trim()))
              .filter(Boolean)
              .join(",");
            if (cleanReset) {
              await pgRest(cfg, `pa_kv_state?state_key=in.(${cleanReset})`, { method: "DELETE" });
            }
          }
        }
        const validUsers = body.users.filter((u) => u && String(u.employeeId ?? u.employee_id ?? "").trim());
        if (validUsers.length > 0) {
          const fullRows = validUsers.map((u) => toPaUserRow(u, now, "full"));
          let up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(fullRows),
          });
          if (!up.ok) {
            const legacyRows = validUsers.map((u) => toPaUserRow(u, now, "legacy"));
            up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
              body: JSON.stringify(legacyRows),
            });
          }
          if (!up.ok) {
            const minRows = validUsers.map((u) => toPaUserRow(u, now, "minimal"));
            up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
              body: JSON.stringify(minRows),
            });
          }
        }
        const kvUp = await pgRest(cfg, "pa_kv_state?on_conflict=state_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ state_key: "pa_managed_users_v1", state_value: body.users, updated_at: now }),
        });
        return res.status(200).json({ ok: kvUp.ok, status: kvUp.status });
      }

      if (kind === "user-upsert" && body.user) {
        const fullRow = toPaUserRow(body.user, now, "full");
        let up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(fullRow),
        });
        if (!up.ok) {
          const legacyRow = toPaUserRow(body.user, now, "legacy");
          up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(legacyRow),
          });
        }
        if (!up.ok) {
          const minRow = toPaUserRow(body.user, now, "minimal");
          up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(minRow),
          });
        }
        return res.status(200).json({ ok: up.ok, status: up.status });
      }

      if (kind === "user-delete" && body.employeeId) {
        const del = await pgRest(
          cfg,
          `pa_users?employee_id=eq.${encodeURIComponent(String(body.employeeId).trim())}`,
          { method: "DELETE" },
        );
        return res.status(200).json({ ok: del.ok, status: del.status });
      }

      if (kind === "interview-schedule" && body.schedule) {
        const s = body.schedule;
        const up = await pgRest(cfg, "pa_interview_schedules?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            id: String(s.id ?? ""),
            company_unit: canonicalizeUnitName(s.companyUnit || "PT RSUP (Industry)"),
            added_users: Array.isArray(s.addedUsers) ? s.addedUsers : [],
            interviewers: Array.isArray(s.interviewers) ? s.interviewers : [],
            other_users: Array.isArray(s.otherUsers) ? s.otherUsers : [],
            scheduled_date: String(s.scheduledDate ?? ""),
            scheduled_time: String(s.scheduledTime ?? ""),
            location: String(s.location ?? ""),
            text_notifikasi: String(s.textNotifikasi ?? ""),
            text_lampiran: String(s.textLampiran ?? ""),
            status: String(s.status ?? "Scheduled"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status });
      }

      if (kind === "mi-clear-all") {
        await pgRest(cfg, "pa_interview_schedules?id=neq.__NONE__", { method: "DELETE" });
        await pgRest(cfg, "pa_interview_assessments?employee_id=neq.__NONE__", { method: "DELETE" });
        await pgRest(
          cfg,
          "pa_kv_state?state_key=in.(pa_interview_schedules_v1,pa_mi_supervisor_assessments_v1,pa_mi_penilai1_scores_v1,pa_mi_results_by_emp_v1)",
          { method: "DELETE" },
        );
        await pgRest(cfg, "pa_kv_state?on_conflict=state_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ state_key: "pa_mi_cleared_2026_v1", state_value: true, updated_at: now }),
        });
        return res.status(200).json({ ok: true });
      }

      if (kind === "evidence-upsert" && body.evidence) {
        const ev = body.evidence;
        let finalUrl = String(ev.url ?? ev.public_url ?? "");
        const rawDataUrl = String(ev.dataUrl ?? "");
        const storagePath = String(
          ev.storagePath ??
            `${ev.period || "2026"}/${String(ev.moduleType || "Evidence").replace(/\s+/g, "_")}/${ev.employeeId || "EMP"}/${ev.id}_${String(ev.fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        );
        if (rawDataUrl.startsWith("data:") && (!finalUrl || finalUrl.startsWith("data:"))) {
          try {
            const match = rawDataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1] || ev.mimeType || "application/octet-stream";
              const buf = Buffer.from(match[2], "base64");
              const uploadUrl = `${cfg.url}/storage/v1/object/pa-evidence/${storagePath}`;
              let stRes = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                  apikey: cfg.key,
                  Authorization: `Bearer ${cfg.key}`,
                  "Content-Type": mime,
                  "x-upsert": "true",
                },
                body: buf,
              });
              if (!stRes.ok) {
                // Auto-create public bucket `pa-evidence` if missing, then retry once
                await fetch(`${cfg.url}/storage/v1/bucket`, {
                  method: "POST",
                  headers: {
                    apikey: cfg.key,
                    Authorization: `Bearer ${cfg.key}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ id: "pa-evidence", name: "pa-evidence", public: true }),
                });
                stRes = await fetch(uploadUrl, {
                  method: "POST",
                  headers: {
                    apikey: cfg.key,
                    Authorization: `Bearer ${cfg.key}`,
                    "Content-Type": mime,
                    "x-upsert": "true",
                  },
                  body: buf,
                });
              }
              if (stRes.ok) {
                finalUrl = `${cfg.url}/storage/v1/object/public/pa-evidence/${storagePath}`;
              } else if (!finalUrl) {
                finalUrl = rawDataUrl;
              }
            }
          } catch {
            if (!finalUrl && rawDataUrl) finalUrl = rawDataUrl;
          }
        }
        const up = await pgRest(cfg, "pa_evidence_files?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            id: String(ev.id),
            employee_id: String(ev.employeeId ?? ""),
            employee_name: String(ev.fullName ?? ev.employeeName ?? ""),
            company_unit: canonicalizeUnitName(ev.companyUnit || "PT RSUP (Industry)"),
            division: String(ev.division || "-"),
            department: String(ev.department || "-"),
            position: String(ev.position || "-"),
            module_type: String(ev.moduleType || "Evidence"),
            period: String(ev.period || "2026"),
            month: String(ev.month || "All"),
            kpi_name: String(ev.kpi ?? ev.kpiName ?? ""),
            file_name: String(ev.fileName || "attachment"),
            file_size: Number(ev.fileSize || 0),
            mime_type: String(ev.mimeType || "application/octet-stream"),
            storage_path: storagePath,
            public_url: finalUrl,
            approval_status: String(ev.approvalStatus || "Pending"),
            submitted_date: String(ev.submittedDate || now.slice(0, 10)),
          }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status, url: finalUrl, id: String(ev.id) });
      }

      if (kind === "app-notification" && body.notification) {
        const n = body.notification;
        const targets = Array.isArray(n.employeeIds) ? n.employeeIds : [n.recipientId || n.employeeId].filter(Boolean);
        if (targets.length > 0) {
          const rows = targets.map((empId) => ({
            recipient_id: String(empId),
            employee_id: String(empId),
            module: String(n.module || "PA"),
            status: String(n.status || "Info"),
            message: String(n.message || ""),
            link: String(n.link || "/"),
            is_read: false,
          }));
          const ins = await pgRest(cfg, "pa_app_notifications", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(rows),
          });
          return res.status(200).json({ ok: ins.ok, status: ins.status });
        }
        return res.status(200).json({ ok: true });
      }

      if (kind === "evidence-delete" && body.evidenceId) {
        const del = await pgRest(
          cfg,
          `pa_evidence_files?id=eq.${encodeURIComponent(String(body.evidenceId).trim())}`,
          { method: "DELETE" },
        );
        return res.status(200).json({ ok: del.ok, status: del.status });
      }

      if (kind === "score-weights" && body.companyUnit) {
        const up = await pgRest(cfg, "pa_score_weights?on_conflict=company_unit", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            company_unit: String(body.companyUnit),
            weights: body.weights ?? {},
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status });
      }

      if (kind === "workflow-document" && body.doc) {
        const d = body.doc;
        const up = await pgRest(cfg, "pa_workflow_documents?on_conflict=doc_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            doc_key: String(d.key ?? ""),
            employee_id: String(d.employeeId ?? ""),
            unit_id: String(d.unitId ?? "IND"),
            module: String(d.module ?? ""),
            phase: String(d.phase ?? "measurement"),
            period: String(d.year ?? "2026"),
            status: String(d.status ?? "Pending"),
            version: Number(d.version ?? 1),
            payload: d.payload ?? d,
            updated_by: d.actorId ?? null,
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: up.ok, status: up.status });
      }

      if (kind === "workflow-delete" && Array.isArray(body.docKeys) && body.docKeys.length > 0) {
        const encodedKeys = body.docKeys
          .map((k) => encodeURIComponent(String(k).trim()))
          .filter(Boolean)
          .join(",");
        let delOk = true;
        if (encodedKeys) {
          const del = await pgRest(cfg, `pa_workflow_documents?doc_key=in.(${encodedKeys})`, {
            method: "DELETE",
          });
          delOk = del.ok;
        }
        // Reset status tabel modul terkait menjadi Draft / Unsubmitted menggunakan service_role
        if (Array.isArray(body.records)) {
          for (const rec of body.records) {
            if (!rec || !rec.employeeId) continue;
            const empEnc = encodeURIComponent(String(rec.employeeId).trim());
            const mod = String(rec.module || "");
            const phase = String(rec.phase || "measurement");
            if (mod === "KPI" && phase === "setting") {
              await pgRest(cfg, `pa_kpi_settings?employee_id=eq.${empEnc}&period=eq.2026`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Draft", updated_at: now }),
              });
            } else if (mod === "SMART Goals") {
              await pgRest(cfg, `pa_smart_goals?employee_id=eq.${empEnc}&period=eq.2026`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: phase === "setting" ? "Draft-Setting" : "Draft-Measurement",
                  approval_decisions: [],
                  updated_at: now,
                }),
              });
            } else if (mod === "Appraisal Form") {
              await pgRest(cfg, `pa_appraisal_forms?employee_id=eq.${empEnc}&period=eq.2026`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Draft", approver_ratings: [], updated_at: now }),
              });
            } else if (mod === "Managerial Skill") {
              await pgRest(cfg, `pa_managerial_skills?employee_id=eq.${empEnc}&period=eq.2026`, {
                method: "PATCH",
                body: JSON.stringify({ status: "Draft", approver_ratings: [], updated_at: now }),
              });
            } else if (mod === "Project") {
              await pgRest(cfg, `pa_project_records?employee_id=eq.${empEnc}&period=eq.2026`, {
                method: "PATCH",
                body: JSON.stringify({ submitted: false, updated_at: now }),
              });
            }
          }
        }
        return res.status(200).json({ ok: delOk });
      }

      if (kind === "kpi-setting" && body.docKey) {
        const r = await pgRest(cfg, "pa_kpi_settings?on_conflict=doc_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            doc_key: String(body.docKey),
            employee_id: String(body.employeeId ?? "E002"),
            company_unit: String(body.companyUnit ?? "PT RSUP (Industry)"),
            tab: String(body.tab ?? "personal"),
            period: String(body.period ?? "2026"),
            items: body.items ?? [],
            status: String(body.status ?? "Submitted"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "kpi-tracking" && body.docKey) {
        const r = await pgRest(cfg, "pa_kpi_trackings?on_conflict=doc_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            doc_key: String(body.docKey),
            employee_id: String(body.employeeId ?? "E002"),
            period: String(body.period ?? "2026"),
            months: body.months ?? [],
            cells_map: body.cellsMap ?? {},
            monthly_notes: body.monthlyNotes ?? {},
            comments: body.comments ?? {},
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "kpi-business" && Array.isArray(body.items)) {
        const r = await pgRest(cfg, "pa_kpi_business?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            id: String(body.id ?? "corporate-2026"),
            period: String(body.period ?? "2026"),
            items: body.items ?? [],
            status: String(body.status ?? "Submitted"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "smart-goals") {
        const r = await pgRest(cfg, "pa_smart_goals?on_conflict=employee_id,period", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            employee_id: String(body.employeeId ?? "E002"),
            period: String(body.period ?? "2026"),
            goals: body.goals ?? [],
            checkin_entries: body.checkinEntries ?? [],
            approval_decisions: body.approvalDecisions ?? [],
            status: String(body.status ?? "Submitted"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "appraisal-form") {
        const r = await pgRest(cfg, "pa_appraisal_forms?on_conflict=employee_id,period", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            employee_id: String(body.employeeId ?? "E002"),
            period: String(body.period ?? "2026"),
            self_ratings: body.selfRatings ?? null,
            approver_ratings: body.approverRatings ?? [],
            status: String(body.status ?? "Submitted"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "managerial-skill") {
        const r = await pgRest(cfg, "pa_managerial_skills?on_conflict=employee_id,period", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            employee_id: String(body.employeeId ?? "E002"),
            period: String(body.period ?? "2026"),
            self_ratings: body.selfRatings ?? null,
            approver_ratings: body.approverRatings ?? [],
            status: String(body.status ?? "Submitted"),
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "project-records" && body.employeeId) {
        const r = await pgRest(cfg, "pa_project_records?on_conflict=employee_id,period", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            employee_id: String(body.employeeId),
            period: String(body.period ?? "2026"),
            file_name: String(body.fileName ?? "Project_ICF_2026.xlsx"),
            submitted: Boolean(body.submitted ?? true),
            submitted_date: String(body.submittedDate ?? now.slice(0, 10)),
            rows: body.rows ?? [],
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "rca-submission" && body.submission) {
        const sub = body.submission;
        const empKey = String(sub.employeeId ?? "E002").trim();
        const rawDocKey = String(sub.key ?? sub.id ?? "");
        const scopedDocKey =
          empKey && rawDocKey && !rawDocKey.startsWith(`${empKey}::`)
            ? `${empKey}::${rawDocKey}`
            : rawDocKey;
        const r = await pgRest(cfg, "pa_rca_submissions?on_conflict=doc_key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            doc_key: scopedDocKey,
            employee_id: empKey || "E002",
            period: String(sub.year ?? "2026"),
            kpi_indicator: String(sub.kpiIndicator ?? ""),
            periode: String(sub.periode ?? ""),
            submission: sub,
            approval_decisions: body.approvalDecisions ?? [],
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      if (kind === "open-lock" && body.request) {
        const reqObj = body.request;
        const r = await pgRest(cfg, "pa_open_lock_requests?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            id: String(reqObj.id),
            employee_id: String(reqObj.employeeId ?? "E002"),
            employee_name: String(reqObj.employeeName ?? ""),
            company_unit: String(reqObj.companyUnit ?? "PT RSUP (Industry)"),
            divisi: String(reqObj.divisi ?? ""),
            departemen: String(reqObj.departemen ?? ""),
            bagian: String(reqObj.bagian ?? ""),
            posisi: String(reqObj.posisi ?? ""),
            module: String(reqObj.module ?? "KPI Tracking"),
            period: String(reqObj.period ?? "2026"),
            original_deadline: String(reqObj.originalDeadline ?? "2026-06-30"),
            submitted_at: String(reqObj.submittedAt ?? now.slice(0, 10)),
            reason: String(reqObj.reason ?? ""),
            status: String(reqObj.status ?? "pending"),
            approved_until: reqObj.approvedUntil ?? null,
            approved_at: reqObj.approvedAt ?? null,
            approval_note: reqObj.approvalNote ?? null,
            rejected_at: reqObj.rejectedAt ?? null,
            decided_by: reqObj.decidedBy ?? null,
            updated_at: now,
          }),
        });
        return res.status(200).json({ ok: r.ok });
      }

      return res.status(200).json({ ok: false, reason: "UNHANDLED_KIND" });
    }

    return res.status(405).json({ ok: false });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
