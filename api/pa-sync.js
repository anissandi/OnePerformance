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

function toPaUserRow(u, now, minimal = false) {
  const base = {
    employee_id: String(u.employeeId ?? u.employee_id ?? "").trim(),
    name: String(u.name || "-"),
    email: String(u.email || ""),
    position: String(u.position || "-"),
    company: String(u.company || "PT RSUP (Industry)"),
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
  if (minimal) return base;
  return {
    ...base,
    no: String(u.no ?? ""),
    reg_no: String(u.regNo ?? u.reg_no ?? ""),
    bagian: String(u.bagian ?? ""),
    join_date: String(u.joinDate ?? u.join_date ?? ""),
    telegram_no: String(u.telegramNo ?? u.telegram_no ?? ""),
    reg_no_ap1: String(u.regNoAp1 ?? u.reg_no_ap1 ?? ""),
    reg_no_ap2: String(u.regNoAp2 ?? u.reg_no_ap2 ?? ""),
    is_hr_unit_checker: Boolean(u.isHrUnitChecker ?? u.is_hr_unit_checker ?? base.role === "HR Unit"),
    is_hr_icf_validator: Boolean(
      u.isHrIcfValidator ?? u.is_hr_icf_validator ?? (base.role === "HR ICF" || base.role === "Administrator"),
    ),
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
          const fullRows = validUsers.map((u) => toPaUserRow(u, now, false));
          let up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(fullRows),
          });
          if (!up.ok) {
            const minRows = validUsers.map((u) => toPaUserRow(u, now, true));
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
        const fullRow = toPaUserRow(body.user, now, false);
        let up = await pgRest(cfg, "pa_users?on_conflict=employee_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(fullRow),
        });
        if (!up.ok) {
          const minRow = toPaUserRow(body.user, now, true);
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

      return res.status(200).json({ ok: false, reason: "UNHANDLED_KIND" });
    }

    return res.status(405).json({ ok: false });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
