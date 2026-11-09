import { randomBytes } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { simulationActors, simulationEmployees } from "../../src/app/data/paSimulation2026.ts";

type IdentityRow = { identity_id: string; email: string; auth_user_id: string | null };
type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: { environment?: string; simulation_identity_id?: string };
};

const expectedProject = "ekzrnltjbcauihoftkiy";
const identities = [
  ...simulationEmployees,
  ...simulationActors.filter((actor) => !simulationEmployees.some((employee) => employee.id === actor.id)),
];
const applyChanges = process.argv.includes("--apply");
const checkOnly = process.argv.includes("--check-dataset");
const credentialsArgument = process.argv.find((argument) => argument.startsWith("--credentials="));

async function main() {
  if (
    simulationEmployees.length !== 42 || simulationActors.length !== 56 ||
    new Set(identities.map((identity) => identity.id)).size !== 91 ||
    new Set(identities.map((identity) => identity.email)).size !== 91 ||
    identities.some((identity) => !identity.email.endsWith("@pa-simulasi.example.invalid"))
  ) {
    throw new Error("Dataset harus memuat 35 peserta dan 56 aktor unik.");
  }
  if (checkOnly) {
    if (applyChanges) throw new Error("Pemeriksaan dataset tidak boleh memakai --apply.");
    console.log("Dataset valid: 91 identitas; tidak ada akses jaringan atau pembuatan akun.");
    return;
  }

  const serviceKey = process.env.PA_SIM_SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.PA_SIM_PROJECT_REF !== expectedProject || !serviceKey) {
    throw new Error("Tetapkan PA_SIM_PROJECT_REF proyek simulasi dan PA_SIM_SUPABASE_SERVICE_ROLE_KEY melalui penyimpanan rahasia. Jangan masukkan key dalam source code.");
  }

  const baseUrl = `https://${expectedProject}.supabase.co`;
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`Operasi ${method} ${path.split("?")[0]} gagal (HTTP ${response.status}). Periksa migrasi dan akses admin; respons rahasia tidak dicetak.`);
    }
    return response.json();
  }

  const rows: IdentityRow[] = await request("/rest/v1/pa_sim_identities?select=identity_id,email,auth_user_id");
  if (rows.length !== 91 || identities.some((identity) =>
    !rows.some((row) => row.identity_id === identity.id && row.email === identity.email)
  )) {
    throw new Error("Migrasi dan seed 91 identitas harus tersedia serta cocok dengan dataset sebelum provisioning.");
  }

  const users: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const result = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    if (!Array.isArray(result.users)) throw new Error("Respons daftar akun tidak valid.");
    users.push(...result.users);
    if (result.users.length < 100) break;
  }
  for (const user of users) {
    const identity = identities.find((candidate) => candidate.email === user.email);
    if (!identity || user.app_metadata?.environment !== "pa-simulation" ||
      user.app_metadata?.simulation_identity_id !== identity.id) {
      throw new Error("Proyek memiliki akun di luar provisioning PA-Simulasi ini. Hentikan untuk menjaga isolasi; jangan mengadopsi atau mengubah akun tersebut.");
    }
  }
  for (const row of rows) {
    const user = users.find((candidate) => candidate.email === row.email);
    if (row.auth_user_id && row.auth_user_id !== user?.id) {
      throw new Error("Pemetaan identitas ke akun tidak sesuai. Hentikan tanpa menimpa pemetaan.");
    }
  }

  const missingCount = identities.filter((identity) => !users.some((user) => user.email === identity.email)).length;
  console.log(`Pemeriksaan admin berhasil: ${users.length} akun tersedia; ${missingCount} akun belum dibuat.`);
  if (!applyChanges) {
    console.log("Mode pemeriksaan: tidak membuat akun. Gunakan --apply dan --credentials=/lokasi/rahasia/akun.jsonl untuk menerapkan.");
    return;
  }

  const credentialsPath = credentialsArgument?.slice("--credentials=".length);
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  const relativePath = credentialsPath ? relative(repositoryRoot, resolve(credentialsPath)) : "";
  if (!credentialsPath || !isAbsolute(credentialsPath) ||
    (!relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))) {
    throw new Error("Lokasi kredensial wajib absolut dan berada di luar repository.");
  }

  const realRepository = await realpath(repositoryRoot);
  const realCredentialsDirectory = await realpath(dirname(credentialsPath));
  const realRelativeDirectory = relative(realRepository, realCredentialsDirectory);
  if (!realRelativeDirectory.startsWith(`..${sep}`) && !isAbsolute(realRelativeDirectory)) {
    throw new Error("Direktori kredensial tidak boleh mengarah ke repository melalui symlink.");
  }

  const credentialFile = await open(credentialsPath, "wx", 0o600);
  try {
    for (const identity of identities) {
      let user = users.find((candidate) => candidate.email === identity.email);
      if (!user) {
        const password = randomBytes(32).toString("base64url");
        await credentialFile.writeFile(JSON.stringify({
          identityId: identity.id, email: identity.email, password, status: "prepared",
        }) + "\n");
        await credentialFile.sync();
        const result = await request("/auth/v1/admin/users", "POST", {
          email: identity.email,
          password,
          email_confirm: true,
          app_metadata: { environment: "pa-simulation", simulation_identity_id: identity.id },
        });
        user = result.user ?? result;
        if (!user?.id || user.email !== identity.email) throw new Error("Respons pembuatan akun tidak valid; periksa riwayat admin sebelum mencoba ulang.");
        users.push(user);
        await credentialFile.writeFile(JSON.stringify({
          identityId: identity.id, authUserId: user.id, status: "created",
        }) + "\n");
        await credentialFile.sync();
      }
      const row = rows.find((candidate) => candidate.identity_id === identity.id)!;
      if (!row.auth_user_id) {
        const mapped: IdentityRow[] = await request(
          `/rest/v1/pa_sim_identities?identity_id=eq.${encodeURIComponent(identity.id)}&auth_user_id=is.null`,
          "PATCH", { auth_user_id: user.id },
        );
        if (mapped.length !== 1 || mapped[0].auth_user_id !== user.id) {
          throw new Error("Pemetaan akun tidak berhasil; proses dihentikan tanpa menimpa mapping lain.");
        }
      }
      console.log(`Siap: ${identity.id}`);
    }
    console.log("Provisioning selesai. Kredensial baru tersimpan hanya di lokasi rahasia; password akun lama tidak direset.");
  } finally {
    await credentialFile.close();
  }
}

main().catch(() => {
  console.error("Provisioning dihentikan. Periksa konfigurasi, migrasi/seed, dan isolasi akun. Operasi sebelumnya dapat sudah tersimpan; jangan hapus akun atau kredensial untuk mengulang proses.");
  process.exitCode = 1;
});
