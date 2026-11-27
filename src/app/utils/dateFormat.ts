const MONTH_NAME_MAP: Record<string, string> = {
  jan: "01", januari: "01", january: "01",
  feb: "02", februari: "02", february: "02",
  mar: "03", maret: "03", march: "03",
  apr: "04", april: "04",
  may: "05", mei: "05",
  jun: "06", juni: "06", june: "06",
  jul: "07", juli: "07", july: "07",
  aug: "08", agu: "08", agt: "08", agustus: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", okt: "10", oktober: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", des: "12", desember: "12", december: "12",
};

function expandTwoDigitYear(yy: string): string {
  if (yy.length === 4) return yy;
  const n = parseInt(yy, 10);
  if (!Number.isFinite(n)) return yy;
  return n <= 55 ? `20${yy.padStart(2, "0")}` : `19${yy.padStart(2, "0")}`;
}

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
 * Menstandarkan nilai tanggal (ISO YYYY-MM-DD, timestamp ISO, DD/MM/YYYY, DD-MM-YYYY, serial Excel, maupun teks bulan)
 * menjadi format standar DD/MM/YYYY tanpa mengubah data non-tanggal.
 */
export function normalizeDateDDMMYYYY(raw?: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 10000 && raw < 90000) {
    const utcMs = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const yyyy = d.getUTCFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
  }
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === "-" || trimmed === "—") return "—";

  // Serial date Excel berbentuk string angka murni (contoh: "40595")
  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed);
    if (serial > 10000 && serial < 90000) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(utcMs);
      if (!Number.isNaN(d.getTime())) {
        const dd = String(d.getUTCDate()).padStart(2, "0");
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const yyyy = d.getUTCFullYear();
        return `${dd}/${mm}/${yyyy}`;
      }
    }
  }

  // Tangani ISO timestamp atau YYYY-MM-DD
  const isoPart = trimmed.includes("T") ? trimmed.slice(0, 10) : trimmed.split(" ")[0];
  const isoMatch = isoPart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
  }

  // Tangani DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, D/M/YY (serta fallback M/D/YY bila bagian ke-2 > 12)
  const dmyMatch = isoPart.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (dmyMatch) {
    const [, p1, p2, rawY] = dmyMatch;
    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);
    const yyyy = expandTwoDigitYear(rawY);
    if (n1 <= 12 && n2 > 12) {
      return `${String(n2).padStart(2, "0")}/${String(n1).padStart(2, "0")}/${yyyy}`;
    }
    return `${String(n1).padStart(2, "0")}/${String(n2).padStart(2, "0")}/${yyyy}`;
  }

  // Tangani teks bulan seperti "17 Apr 2026" atau "17 April 2026"
  const namedMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})/);
  if (namedMatch) {
    const [, dStr, mName, yyyy] = namedMatch;
    const mm = MONTH_NAME_MAP[mName.toLowerCase()];
    if (mm) {
      return `${dStr.padStart(2, "0")}/${mm}/${yyyy}`;
    }
  }

  return trimmed;
}

/**
 * Mengonversi input tanggal fleksibel (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, serial Excel) menjadi string ISO YYYY-MM-DD
 * (atau "" bila kosong/tidak valid) untuk keperluan DatePickerID & perbandingan rentang tanggal.
 */
export function parseDateInputToISO(raw?: string | number | null): string {
  const norm = normalizeDateDDMMYYYY(raw);
  if (norm === "—") return "";
  const m = norm.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return "";
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
