/**
 * Mengembalikan tanggal hari ini sesuai waktu sebenarnya dalam format DD/MM/YYYY (2 digit hari & bulan).
 */
export function formatTodayDDMMYYYY(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Menstandarkan string tanggal (ISO YYYY-MM-DD, timestamp ISO, D/M/YYYY, DD/MM/YYYY) menjadi DD/MM/YYYY.
 */
export function normalizeDateDDMMYYYY(raw?: string | null): string {
  if (!raw) return "—";
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return "—";

  // Tangani ISO timestamp atau YYYY-MM-DD
  const isoPart = trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed;
  const isoMatch = isoPart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
  }

  // Tangani D/M/YYYY atau DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
  }

  return trimmed;
}

/**
 * Mengubah string tanggal DD/MM/YYYY atau YYYY-MM-DD menjadi YYYY-MM-DD untuk pengurutan kronologis yang akurat.
 */
export function dateToSortableKey(raw?: string | null): string {
  const norm = normalizeDateDDMMYYYY(raw);
  if (norm === "—") return "";
  const m = norm.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return norm;
}
