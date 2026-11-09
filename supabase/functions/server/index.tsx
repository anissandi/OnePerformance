import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { kpiSettingRoutes } from "./kpiSettingRoutes.tsx";
import { kpiTrackingRoutes } from "./kpiTrackingRoutes.tsx";
import { rcaRoutes } from "./rcaRoutes.tsx";
import { smartGoalsRoutes } from "./smartGoalsRoutes.tsx";
import { appraisalFormRoutes } from "./appraisalFormRoutes.tsx";
import { managerialSkillRoutes } from "./managerialSkillRoutes.tsx";
import { interDepartmentFeedbackRoutes } from "./interDepartmentFeedbackRoutes.tsx";
import { projectRoutes } from "./projectRoutes.tsx";
import { managementInterviewRoutes } from "./managementInterviewRoutes.tsx";
import { mainAppRoutes } from "./mainAppRoutes.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-74dadec6/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/make-server-74dadec6/pa-simulation/session", async (c) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return c.json({ error: "Login PA-Simulasi diperlukan." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return c.json({ error: "Konfigurasi autentikasi belum tersedia." }, 503);
  }

  try {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(
      authorization.slice("Bearer ".length),
    );
    if (authError || !authData.user) {
      return c.json({ error: "Sesi tidak valid atau sudah berakhir." }, 401);
    }

    const { data: identity, error: identityError } = await client
      .from("pa_sim_identities")
      .select("identity_id, name, unit_id, actor_level, appraisal_participant, dataset_period")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (identityError) {
      return c.json({ error: "Identitas simulasi belum dapat diperiksa." }, 503);
    }
    if (!identity) {
      return c.json({ error: "Akun tidak terdaftar sebagai identitas PA-Simulasi." }, 403);
    }

    return c.json({
      environment: "pa-simulation",
      identity: { ...identity, appraisal_participant: Boolean(identity.appraisal_participant || identity.actor_level === "hr-unit") },
    });
  } catch {
    return c.json({ error: "Layanan sesi simulasi belum tersedia." }, 503);
  }
});

app.route("/make-server-74dadec6/pa-simulation/kpi-setting", kpiSettingRoutes);
app.route("/make-server-74dadec6/pa-simulation/kpi-tracking", kpiTrackingRoutes);
app.route("/make-server-74dadec6/pa-simulation/rca", rcaRoutes);
app.route("/make-server-74dadec6/pa-simulation/smart-goals", smartGoalsRoutes);
app.route("/make-server-74dadec6/pa-simulation/appraisal-form", appraisalFormRoutes);
app.route("/make-server-74dadec6/pa-simulation/managerial-skill", managerialSkillRoutes);
app.route("/make-server-74dadec6/pa-simulation/inter-department-feedback", interDepartmentFeedbackRoutes);
app.route("/make-server-74dadec6/pa-simulation/project", projectRoutes);
app.route("/make-server-74dadec6/pa-simulation/management-interview", managementInterviewRoutes);
app.route("/make-server-74dadec6/pa-app", mainAppRoutes);

Deno.serve(app.fetch);
