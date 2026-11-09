import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { simulationActors, simulationEmployees } from "../../src/app/data/paSimulation2026.ts";

class VerificationError extends Error {}

type Credential = { identityId: string; email: string; password: string; status: string };
const selectedIds = ["SIM-EMP-001", "SIM-ACTOR-IND-GM", "SIM-ACTOR-HR-STRATEGIC"];
const identities = [...simulationEmployees, ...simulationActors];

async function main() {
  const config = await readFile(new URL("../../utils/supabase/info.tsx", import.meta.url), "utf8");
  const projectId = config.match(/projectId\s*=\s*"([^"]+)"/)?.[1];
  const publicKey = config.match(/publicAnonKey\s*=\s*"([^"]+)"/)?.[1];
  if (projectId !== "ekzrnltjbcauihoftkiy" || !publicKey) {
    throw new VerificationError("Konfigurasi proyek simulasi tidak sesuai.");
  }
  for (const identityId of selectedIds) {
    if (!identities.some((identity) => identity.id === identityId)) {
      throw new VerificationError("Identitas uji tidak tersedia pada dataset.");
    }
  }
  if (process.argv.includes("--check-config")) {
    console.log("Konfigurasi valid: proyek simulasi dan tiga identitas uji tersedia. Tidak ada login atau akses jaringan.");
    return;
  }

  const argument = process.argv.find((value) => value.startsWith("--credentials="));
  const credentialsPath = argument?.slice("--credentials=".length);
  if (!credentialsPath || !isAbsolute(credentialsPath)) {
    throw new VerificationError("Gunakan --credentials dengan lokasi absolut file rahasia di luar repository.");
  }
  const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
  const credentialLocation = await realpath(credentialsPath);
  const relativeLocation = relative(root, credentialLocation);
  if (!relativeLocation.startsWith(`..${sep}`) && !isAbsolute(relativeLocation)) {
    throw new VerificationError("File kredensial tidak boleh berada di dalam repository.");
  }
  const credentials: Credential[] = (await readFile(credentialLocation, "utf8"))
    .split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
  const selectedCredentials = selectedIds.map((identityId) => {
    const matches = credentials.filter((record) => record.identityId === identityId &&
      record.status === "prepared" && typeof record.password === "string" && record.password.length > 0);
    const identity = identities.find((record) => record.id === identityId)!;
    if (matches.length !== 1 || matches[0].email !== identity.email ||
      !credentials.some((record) => record.identityId === identityId && record.status === "created")) {
      throw new VerificationError(`Kredensial akun ${identityId} tidak lengkap atau tidak sesuai. Jangan kirim isi file ke chat.`);
    }
    return matches[0];
  });

  const base = `https://${projectId}.supabase.co`;
  const server = "/functions/v1/make-server-74dadec6";
  const health = await fetch(base + server + "/health", { signal: AbortSignal.timeout(20000) });
  if (health.status !== 200 || (await health.json()).status !== "ok") {
    throw new VerificationError("Health check publik belum berhasil.");
  }
  const anonymousSession = await fetch(base + server + "/pa-simulation/session", {
    signal: AbortSignal.timeout(20000),
  });
  if (anonymousSession.status !== 401 || (await anonymousSession.json()).error !== "Login PA-Simulasi diperlukan.") {
    throw new VerificationError("Endpoint sesi belum menolak akses tanpa login sesuai acuan.");
  }
  console.log("PASS: health publik dan penolakan sesi tanpa login.");

  for (const credential of selectedCredentials) {
    let accessToken: string | undefined;
    try {
      const login = await fetch(base + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: publicKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: credential.email, password: credential.password }),
        signal: AbortSignal.timeout(20000),
      });
      if (!login.ok) throw new VerificationError(`Login ${credential.identityId} gagal (HTTP ${login.status}).`);
      const session = await login.json();
      accessToken = session.access_token;
      if (!accessToken || !session.user?.id) throw new VerificationError("Respons autentikasi tidak lengkap.");
      const headers = { apikey: publicKey, Authorization: `Bearer ${accessToken}` };
      const endpoint = await fetch(base + server + "/pa-simulation/session", {
        headers, signal: AbortSignal.timeout(20000),
      });
      if (!endpoint.ok) throw new VerificationError(`Endpoint sesi ${credential.identityId} gagal (HTTP ${endpoint.status}).`);
      const result = await endpoint.json();
      if (result.environment !== "pa-simulation" || result.identity?.identity_id !== credential.identityId) {
        throw new VerificationError("Endpoint mengembalikan identitas akun yang tidak sesuai.");
      }
      const ownRows = await fetch(base + "/rest/v1/pa_sim_identities?select=identity_id,auth_user_id", {
        headers, signal: AbortSignal.timeout(20000),
      });
      if (!ownRows.ok) throw new VerificationError(`Pemeriksaan RLS gagal (HTTP ${ownRows.status}).`);
      const rows = await ownRows.json();
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0].identity_id !== credential.identityId ||
        rows[0].auth_user_id !== session.user.id) {
        throw new VerificationError("RLS tidak membatasi pembacaan pada identitas akun sendiri.");
      }
      const otherId = selectedIds.find((identityId) => identityId !== credential.identityId)!;
      const otherRows = await fetch(base + `/rest/v1/pa_sim_identities?select=identity_id&identity_id=eq.${otherId}`, {
        headers, signal: AbortSignal.timeout(20000),
      });
      if (!otherRows.ok) throw new VerificationError("Pemeriksaan akses lintas identitas gagal.");
      const deniedRows = await otherRows.json();
      if (!Array.isArray(deniedRows) || deniedRows.length !== 0) {
        throw new VerificationError("Identitas akun lain dapat diakses secara langsung.");
      }
      console.log(`PASS: ${credential.identityId} — login, endpoint sesi, RLS identitas sendiri, dan blokir identitas lain.`);
    } finally {
      if (accessToken) {
        const logout = await fetch(base + "/auth/v1/logout?scope=local", {
          method: "POST",
          headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(20000),
        });
        if (!logout.ok) throw new VerificationError("Logout sesi uji gagal; hentikan sebelum mengulang pengujian.");
      }
    }
  }
  console.log("Uji akses dasar tiga akun berhasil. Workflow, seluruh 91 login, akses bukti, dan E2E hasil akhir belum diuji.");
}

main().catch((error) => {
  console.error(error instanceof VerificationError ? error.message : "Pemeriksaan dihentikan: file atau layanan tidak tersedia. Jangan kirim kredensial/token ke chat.");
  process.exitCode = 1;
});
