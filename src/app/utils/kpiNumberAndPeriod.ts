// Shared KPI Number Operator (. / ,) & Periode Tracking rules across KPI Setting, Approval, KPI Tracking, and RCA.

export const STANDARD_TRACKING_PERIODS = [
  "Bulan",
  "Triwulan",
  "Semester",
  "Quarter",
  "Tahun",
] as const;

export type StandardTrackingPeriod = (typeof STANDARD_TRACKING_PERIODS)[number];

const MONTH_SHORT_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_SHORT_ID = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];

/** Normalisasi nama Periode Tracking ke bentuk kanonik ("Bulan" | "Triwulan" | "Semester" | "Quarter" | "Tahun"). */
export function normalizeTrackingPeriod(raw?: string | null, fallbackSatuan?: string | null): string {
  const clean = String(raw ?? "").trim();
  if (clean) {
    if (/^bulan(an)?$/i.test(clean)) return "Bulan";
    if (/^triwulan(an)?$/i.test(clean)) return "Triwulan";
    if (/^semester(an)?$/i.test(clean)) return "Semester";
    if (/^quarter(ly)?$/i.test(clean)) return "Quarter";
    if (/^tahun(an)?$/i.test(clean)) return "Tahun";
    if (/^caturwulan$/i.test(clean)) return "Caturwulan";
    return clean;
  }
  const s = String(fallbackSatuan ?? "").trim();
  const slashIdx = s.indexOf("/");
  if (slashIdx >= 0) {
    const afterSlash = s.slice(slashIdx + 1).trim();
    if (afterSlash) {
      if (/^bulan(an)?$/i.test(afterSlash)) return "Bulan";
      if (/^triwulan(an)?$/i.test(afterSlash)) return "Triwulan";
      if (/^semester(an)?$/i.test(afterSlash)) return "Semester";
      if (/^quarter(ly)?$/i.test(afterSlash)) return "Quarter";
      if (/^tahun(an)?$/i.test(afterSlash)) return "Tahun";
    }
  }
  return "Bulan";
}

/** Apakah tipe Periode Tracking merupakan periode selain "Bulan" (Triwulan, Semester, Quarter, Tahun, dsb.)? */
export function isPeriodicTrackingType(period?: string | null): boolean {
  const norm = normalizeTrackingPeriod(period);
  return Boolean(norm && norm.toLowerCase() !== "bulan" && norm.toLowerCase() !== "bulanan");
}

/** Indeks bulan aktif (0 = Jan .. 11 = Dec) ketika fitur "Tracking per {{tipe}}" diaktifkan. */
export function getActiveMonthIndicesForPeriod(period?: string | null): number[] {
  const norm = normalizeTrackingPeriod(period);
  if (norm === "Triwulan" || norm === "Quarter") {
    // Triwulan / Quarter 1..4 -> Mar, Jun, Sep, Dec
    return [2, 5, 8, 11];
  }
  if (norm === "Semester") {
    // Semester 1..2 -> Jun, Dec
    return [5, 11];
  }
  if (norm === "Tahun") {
    // Tahunan -> Dec
    return [11];
  }
  if (norm === "Caturwulan") {
    // Caturwulan 1..3 -> Apr, Aug, Dec
    return [3, 7, 11];
  }
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
}

/** Konversi label bulan ("Jan-26", "Mar", "Mei-26", "Des", dsb.) menjadi indeks 0..11 (-1 bila tidak dikenali). */
export function getMonthIndexFromLabel(monthLabel?: string | null): number {
  const s = String(monthLabel ?? "").trim().toLowerCase();
  if (!s) return -1;
  const prefix = s.split(/[-\s/]/)[0]?.slice(0, 3) ?? "";
  const enIdx = MONTH_SHORT_EN.indexOf(prefix);
  if (enIdx >= 0) return enIdx;
  const idIdx = MONTH_SHORT_ID.indexOf(prefix);
  return idIdx;
}

/** Normalisasi daftar bulan yang diblok (0 = Jan .. 11 = Dec, mendukung angka indeks maupun label bulan). */
export function normalizeBlockedMonths(raw?: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const item of raw) {
    if (typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 11) {
      out.add(item);
    } else if (typeof item === "string") {
      const trimmed = item.trim();
      if (/^\d+$/.test(trimmed)) {
        const n = Number(trimmed);
        if (n >= 0 && n <= 11) out.add(n);
      } else {
        const idx = getMonthIndexFromLabel(trimmed);
        if (idx >= 0 && idx <= 11) out.add(idx);
      }
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

export interface KpiPeriodBlockSpec {
  trackingPeriod?: string;
  satuan?: string;
  periodicTargetBlock?: boolean;
  blockedMonths?: number[];
  monthlyTargets?: Record<string, string>;
}

/**
 * Menghasilkan himpunan indeks bulan (0..11) yang diblok ("Inactive") untuk suatu indikator KPI.
 * - Jika Periode Tracking = "Bulan": tidak ada bulan yang diblok (Set kosong).
 * - Jika `blockedMonths` didefinisikan sebagai array: gunakan daftar bulan diblok pilihan owner KPI tersebut.
 * - Jika `blockedMonths` belum ada (kompatibilitas mundur): gunakan `periodicTargetBlock` / deteksi data lama.
 */
export function resolveEffectiveBlockedMonthSet(kpi: KpiPeriodBlockSpec): Set<number> {
  if (Array.isArray(kpi.blockedMonths)) {
    return new Set<number>(normalizeBlockedMonths(kpi.blockedMonths));
  }

  const normPeriod = normalizeTrackingPeriod(kpi.trackingPeriod, kpi.satuan);
  if (!isPeriodicTrackingType(normPeriod)) return new Set<number>();

  const activeSet = new Set(getActiveMonthIndicesForPeriod(normPeriod));
  if (kpi.periodicTargetBlock === true) {
    return new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((i) => !activeSet.has(i)));
  }
  if (kpi.periodicTargetBlock === false) {
    return new Set<number>();
  }

  const mt = kpi.monthlyTargets;
  if (mt && typeof mt === "object") {
    let hasActiveVal = false;
    let hasNonActiveVal = false;
    for (const [k, v] of Object.entries(mt)) {
      if (!String(v ?? "").trim()) continue;
      const idx = getMonthIndexFromLabel(k);
      if (idx < 0) continue;
      if (activeSet.has(idx)) hasActiveVal = true;
      else hasNonActiveVal = true;
    }
    if (hasActiveVal && !hasNonActiveVal) {
      return new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((i) => !activeSet.has(i)));
    }
  }
  return new Set<number>();
}

/** Daftar indeks bulan aktif (0..11) yang tidak diblok pada indikator KPI. */
export function getActiveMonthIndicesForKpi(kpi: KpiPeriodBlockSpec): number[] {
  const blocked = resolveEffectiveBlockedMonthSet(kpi);
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((i) => !blocked.has(i));
}

/** Ringkasan pendek label bulan Inactive (mis. "Inactive: Jan, Feb, Apr") untuk tampilan tabel Setting / Approval. */
export function formatBlockedMonthsBadgeText(kpi: KpiPeriodBlockSpec): string | null {
  const blocked = Array.from(resolveEffectiveBlockedMonthSet(kpi)).sort((a, b) => a - b);
  if (blocked.length === 0) return null;
  const labels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `Inactive: ${blocked.map((i) => labels[i] ?? "").filter(Boolean).join(", ")}`;
}

/**
 * Mengecek apakah suatu bulan pada KPI diblok (tag "Inactive" aktif / tidak perlu diinput saat tracking & RCA nonaktif).
 */
export function isMonthBlockedForKpi(
  kpi: KpiPeriodBlockSpec,
  monthLabelOrIdx: string | number,
): boolean {
  const mIdx = typeof monthLabelOrIdx === "number" ? monthLabelOrIdx : getMonthIndexFromLabel(monthLabelOrIdx);
  if (mIdx < 0 || mIdx > 11) return false;
  return resolveEffectiveBlockedMonthSet(kpi).has(mIdx);
}

/** Sanitasi input teks angka KPI agar mendukung angka, titik (.), koma (,), tanda minus (-), spasi, dan %. */
export function sanitizeKpiNumericInput(raw: string, allowRangeDash = true): string {
  if (allowRangeDash) {
    return raw.replace(/[^0-9.,\-%–\s]/g, "");
  }
  return raw.replace(/[^0-9.,\-%]/g, "");
}

/** Mengecek apakah bagian unit pada field Satuan dipilih "%" (mis. "%", "%/Bulan", "% /Tahun"). */
export function isPercentSatuan(satuan?: string | null): boolean {
  const s = String(satuan ?? "").trim();
  if (!s) return false;
  const unitPart = (s.indexOf("/") >= 0 ? s.slice(0, s.indexOf("/")) : s).trim();
  return unitPart === "%";
}

/**
 * Menambahkan simbol "%" secara otomatis setelah input angka apabila Satuan = "%"
 * (mendukung angka tunggal "50%" maupun rentang Stabilize bawah-atas seperti "1.5%-2.5%" atau "15%-25%").
 */
export function applyAutoPercentInput(nextRaw: string, prevRaw = ""): string {
  const cleaned = sanitizeKpiNumericInput(nextRaw);
  if (!cleaned.trim()) return "";

  // Dukung pengetikan rentang bawah-atas (contoh: "1.5%-2.5%" atau "15-25") saat Satuan = "%"
  const rangeDashMatch = cleaned.match(/^\s*([+-]?\d[\d.,%\s]*?)\s*([-–])\s*([\d.,%\s+-]*)$/);
  if (rangeDashMatch) {
    const leftDigits = rangeDashMatch[1].replace(/%/g, "").trim();
    const rightDigits = rangeDashMatch[3].replace(/%/g, "").trim();
    if (leftDigits && /\d/.test(leftDigits)) {
      if (!rightDigits || !/\d/.test(rightDigits)) {
        // User baru mengetik tanda pemisah rentang "-" (mis. dari "1.5%" mengetik "-" menjadi "1.5-%" atau "1.5%-")
        if (prevRaw.endsWith("-") && !cleaned.includes("-")) {
          return `${leftDigits}%`;
        }
        return `${leftDigits}%-`;
      }
      // Jika user menekan Backspace tepat pada "%" di ujung kanan rentang "1.5%-2.5%"
      if (prevRaw.endsWith("%") && cleaned === prevRaw.slice(0, -1)) {
        const trimmedRight = rightDigits.slice(0, -1).trim();
        if (!trimmedRight || !/\d/.test(trimmedRight)) {
          return `${leftDigits}%-`;
        }
        return `${leftDigits}%-${trimmedRight}%`;
      }
      return `${leftDigits}%-${rightDigits}%`;
    }
  }

  // Jika user menekan Backspace tepat saat kursor berada setelah simbol "%" di akhir nilai sebelumnya
  if (prevRaw.endsWith("%") && cleaned === prevRaw.slice(0, -1)) {
    const coreAfterBackspace = cleaned.slice(0, -1).trim();
    if (!coreAfterBackspace || !/\d/.test(coreAfterBackspace)) return "";
    return `${coreAfterBackspace}%`;
  }

  // Hilangkan seluruh "%" di tengah/akhir, lalu tempelkan kembali "%" di paling akhir bila bernilai angka
  const withoutPct = cleaned.replace(/%/g, "").trim();
  if (!withoutPct) return "";
  if (/\d/.test(withoutPct)) {
    return `${withoutPct}%`;
  }
  return withoutPct;
}

/**
 * Sinkronkan akhiran "%" pada nilai ketika Satuan dipilih "%".
 * Catatan penting: ketika `shouldHavePercent === false`, JANGAN menghapus simbol "%" yang memang sudah
 * diketik eksplisit oleh user agar nilai seperti "100%" pada satuan non-% tetap tersimpan utuh "100%".
 */
export function syncPercentSuffixOnValue(raw: string, shouldHavePercent: boolean): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (!shouldHavePercent) {
    return trimmed;
  }
  const rangeMatch = trimmed.match(/^\s*([+-]?\d[\d.,]*)\s*%?\s*[-–]\s*([+-]?\d[\d.,]*)\s*%?\s*$/);
  if (rangeMatch) {
    return `${rangeMatch[1].trim()}%-${rangeMatch[2].trim()}%`;
  }
  const withoutPct = trimmed.replace(/%/g, "").trim();
  if (!withoutPct) return "";
  if (/\d/.test(withoutPct)) {
    return `${withoutPct}%`;
  }
  return withoutPct;
}

// ─── KPI Color Indicator Bands (Biru > Merah > Hitam) ─────────────────────────

export interface KpiColorBandOption {
  value: "Biru" | "Merah" | "Hitam";
  label: "Biru" | "Merah" | "Hitam";
  rank: 3 | 2 | 1;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

export const KPI_COLOR_BAND_OPTIONS: readonly KpiColorBandOption[] = [
  { value: "Biru",  label: "Biru",  rank: 3, color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6" },
  { value: "Merah", label: "Merah", rank: 2, color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
  { value: "Hitam", label: "Hitam", rank: 1, color: "#111827", bg: "#f3f4f6", border: "#9ca3af", dot: "#1f2937" },
] as const;

/** Normalisasi nilai warna KPI (mendukung data lama Blue/Red/Black atau 100/75/0 ke Biru/Merah/Hitam). */
export function normalizeKpiColorBandValue(raw?: string | null): "Biru" | "Merah" | "Hitam" | "" {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^(biru|blue|100|100%|95%-100%|green|hijau)$/i.test(s)) return "Biru";
  if (/^(merah|red|75|75%|≥80%-<95%|yellow|kuning)$/i.test(s)) return "Merah";
  if (/^(hitam|black|0|0%|<80%)$/i.test(s)) return "Hitam";
  return "";
}

export function resolveKpiColorBandMeta(raw?: string | null): KpiColorBandOption | undefined {
  const norm = normalizeKpiColorBandValue(raw);
  if (!norm) return undefined;
  return KPI_COLOR_BAND_OPTIONS.find((o) => o.value === norm);
}

export function isKnownKpiColorBandValue(raw?: string | null): boolean {
  const s = String(raw ?? "").trim();
  return /^(biru|merah|hitam|blue|red|black|95%-100%|≥80%-<95%|<80%)$/i.test(s);
}

export function kpiColorBandRank(raw?: string | null): number {
  return resolveKpiColorBandMeta(raw)?.rank ?? 0;
}

/**
 * Perhitungan pencapaian KPI mode warna (Biru tertinggi = 3, Merah = 2, Hitam = 1):
 * - Jika Aktual >= Target (contoh: Target Biru & Aktual Biru; atau Target Merah & Aktual Biru/Merah; atau Target Hitam & Aktual apa saja) -> 100% (TIDAK memicu RCA).
 * - Jika Target Biru & Aktual Merah -> 75% (< 100%, MEMICU RCA).
 * - Jika Aktual Hitam sementara Target Biru atau Merah -> 0% (< 100%, MEMICU RCA).
 */
export function computeKpiColorBandAchievementPct(actualBand?: string | null, targetBand?: string | null): number | null {
  const actR = kpiColorBandRank(actualBand);
  if (actR === 0) return null;
  const tgtR = kpiColorBandRank(targetBand) || 3;
  if (actR >= tgtR) return 100;
  if (actR === 2) return 75;
  return 0;
}

/**
 * Parsing fleksibel angka KPI dengan dukungan penuh:
 * - Koma (,) untuk pecahan desimal: "10,5" -> 10.5; "0,31" -> 0.31
 * - Titik (.) untuk pemisah ribuan/angka: "10.000" -> 10000; "1.250.000" -> 1250000
 * - Gabungan titik & koma: "10.000,50" -> 10000.5; "10.00,01" -> 1000.01
 * - Format internasional: "10,000.50" -> 10000.5; "62.5" -> 62.5
 */
export function parseFlexibleKpiNumber(raw?: string | number | null): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const str = String(raw ?? "").trim();
  if (!str || str === "—" || str === "-") return null;

  // Abaikan rentang Stabilize "min - max" agar ditangani khusus oleh parser rentang
  const withoutPct = str.replace(/%/g, "").trim();
  if (/^\s*-?\d[\d.,]*\s*[-–]\s*-?\d[\d.,]*\s*$/.test(withoutPct)) {
    return null;
  }

  const isNeg = withoutPct.startsWith("-");
  const body = withoutPct.replace(/^[+-]/, "").replace(/\s+/g, "");
  if (!body || !/^\d[\d.,]*$/.test(body)) return null;

  const hasDot = body.includes(".");
  const hasComma = body.includes(",");
  let normalized = body;

  if (hasDot && hasComma) {
    // Operator yang muncul paling akhir adalah pemisah pecahan/desimal, operator sebelumnya pemisah angka/ribuan
    if (body.lastIndexOf(",") > body.lastIndexOf(".")) {
      // Contoh: "10.000,01" atau "10.00,01" -> "." pemisah angka, "," pemisah pecahan
      normalized = body.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // Contoh: "10,000.01" -> "," pemisah angka, "." pemisah pecahan
      normalized = body.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = body.split(",");
    if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) {
      // Contoh: "1,250,000" -> ribuan internasional
      normalized = body.replace(/,/g, "");
    } else {
      // Contoh: "10,5", "0,31", "10,01" -> koma sebagai pecahan
      normalized = parts[0] + "." + parts.slice(1).join("");
    }
  } else if (hasDot) {
    const parts = body.split(".");
    if (parts.length > 2) {
      // Contoh: "142.854.218" -> titik sebagai pemisah ribuan
      normalized = body.replace(/\./g, "");
    } else {
      const [intPart, fracPart] = parts;
      // Contoh: "10.000", "1.500", "45.000" -> 3 digit setelah titik & bukan "0.xxx" = pemisah ribuan
      if (intPart !== "0" && intPart.length >= 1 && intPart.length <= 3 && fracPart.length === 3) {
        normalized = intPart + fracPart;
      } else {
        // Contoh: "62.5", "0.31", "0.500" -> desimal titik
        normalized = body;
      }
    }
  }

  const num = parseFloat(normalized);
  if (!Number.isFinite(num)) return null;
  return isNeg ? -num : num;
}

export interface ParsedStabilizeRange {
  lo: number;
  hi: number;
  hasPercent: boolean;
  rawLo: string;
  rawHi: string;
}

/**
 * Mengurai target rentang bawah-atas pada Polaritas Stabilize:
 * mendukung "15-25", "85-90", "1.5%-2.5%", "1,5%-2,5%", "15 - 25", maupun rentang angka bertanda.
 */
export function parseStabilizeRange(raw?: string | null): ParsedStabilizeRange | null {
  const str = String(raw ?? "").trim();
  if (!str || str === "—" || str === "-") return null;
  const m = str.match(/^\s*([+-]?\d[\d.,]*\s*%?)\s*[-–]\s*([+-]?\d[\d.,]*\s*%?)\s*$/);
  if (!m) return null;
  const rawLo = m[1].trim();
  const rawHi = m[2].trim();
  const n1 = parseFlexibleKpiNumber(rawLo);
  const n2 = parseFlexibleKpiNumber(rawHi);
  if (n1 === null || n2 === null) return null;
  const lo = Math.min(n1, n2);
  const hi = Math.max(n1, n2);
  const hasPercent = rawLo.includes("%") || rawHi.includes("%");
  return { lo, hi, hasPercent, rawLo, rawHi };
}
function detectPreferredStyle(samples: string[]): {
  style: "id" | "en" | "plain";
  useThousands: boolean;
  minDecimals: number;
  appendPercent: boolean;
} {
  const nonEmpty = samples.map((s) => String(s ?? "").trim()).filter(Boolean);
  let hasIdIndicator = false;
  let hasEnIndicator = false;
  let useThousands = false;
  let minDecimals = 0;
  const appendPercent = nonEmpty.length > 0 && nonEmpty.every((s) => s.endsWith("%"));

  for (const raw of nonEmpty) {
    const s = raw.replace(/%/g, "").replace(/^[+-]/, "").trim();
    const hasDot = s.includes(".");
    const hasComma = s.includes(",");
    if (hasDot && hasComma) {
      useThousands = true;
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        hasIdIndicator = true;
        const dec = s.split(",").pop() ?? "";
        minDecimals = Math.max(minDecimals, Math.min(dec.length, 4));
      } else {
        hasEnIndicator = true;
        const dec = s.split(".").pop() ?? "";
        minDecimals = Math.max(minDecimals, Math.min(dec.length, 4));
      }
    } else if (hasComma) {
      const parts = s.split(",");
      if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) {
        hasEnIndicator = true;
        useThousands = true;
      } else {
        hasIdIndicator = true;
        const dec = parts[parts.length - 1] ?? "";
        minDecimals = Math.max(minDecimals, Math.min(dec.length, 4));
      }
    } else if (hasDot) {
      const parts = s.split(".");
      if (parts.length > 2 || (parts[0] !== "0" && parts[0].length <= 3 && parts[1]?.length === 3)) {
        hasIdIndicator = true;
        useThousands = true;
      } else {
        hasEnIndicator = true;
        const dec = parts[parts.length - 1] ?? "";
        minDecimals = Math.max(minDecimals, Math.min(dec.length, 4));
      }
    }
  }

  const style: "id" | "en" | "plain" = hasIdIndicator
    ? "id"
    : hasEnIndicator
    ? "en"
    : "plain";
  return { style, useThousands, minDecimals, appendPercent };
}

/**
 * Format hasil perhitungan Target Tahunan menyesuaikan gaya operator titik (.) dan koma (,)
 * yang digunakan pada input Monthly Target / Baseline (mis. "10.000" -> "120.000", "10,5" -> "126", "10.00,01" -> "12.000,12").
 */
export function formatComputedKpiNumber(
  value: number,
  sampleInputs: string[] = [],
  opts?: { forcePercent?: boolean },
): string {
  if (!Number.isFinite(value)) return "";
  const { style, useThousands, minDecimals, appendPercent } = detectPreferredStyle(sampleInputs);
  const rounded = Math.round(value * 10000) / 10000;
  const isNeg = rounded < 0;
  const abs = Math.abs(rounded);

  // Tentukan jumlah digit desimal efektif
  const rawFixed = abs.toFixed(4).replace(/\.?0+$/, "");
  const naturalDecimals = rawFixed.includes(".") ? rawFixed.split(".")[1].length : 0;
  const effectiveDecimals = Math.max(naturalDecimals, naturalDecimals > 0 ? minDecimals : 0);
  const fixedStr = effectiveDecimals > 0 ? abs.toFixed(effectiveDecimals) : String(Math.round(abs));
  const [intRaw, decRaw = ""] = fixedStr.split(".");

  let formattedInt = intRaw;
  if (style === "id" && (useThousands || abs >= 1000)) {
    formattedInt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } else if (style === "en" && useThousands) {
    formattedInt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  const decSep = style === "id" ? "," : ".";
  const combined = decRaw ? `${formattedInt}${decSep}${decRaw}` : formattedInt;
  const signed = isNeg ? `-${combined}` : combined;
  return opts?.forcePercent || appendPercent ? `${signed}%` : signed;
}
