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

/** Apakah tipe Periode Tracking merupakan periode berkala non-bulanan yang memiliki tag "Tracking per {{tipe}}"? */
export function isPeriodicTrackingType(period?: string | null): boolean {
  const norm = normalizeTrackingPeriod(period);
  return (
    norm === "Triwulan" ||
    norm === "Quarter" ||
    norm === "Semester" ||
    norm === "Tahun" ||
    norm === "Caturwulan"
  );
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

/**
 * Mengecek apakah suatu bulan pada KPI diblok (tidak aktif) berdasarkan Periode Tracking & toggle "Tracking per {{tipe}}".
 * - Jika `periodicTargetBlock === true`: hanya bulan akhir periode (mis. Mar, Jun, Sep, Dec untuk Triwulan) yang aktif.
 * - Jika `periodicTargetBlock === false`: seluruh bulan tetap aktif.
 * - Jika `periodicTargetBlock === undefined` (data lama): dianggap diblok bila Periode Tracking berkala DAN
 *   `monthlyTargets` hanya terisi pada bulan akhir periode (bulan non-akhir kosong semua).
 */
export function isMonthBlockedForKpi(
  kpi: {
    trackingPeriod?: string;
    satuan?: string;
    periodicTargetBlock?: boolean;
    monthlyTargets?: Record<string, string>;
  },
  monthLabelOrIdx: string | number,
): boolean {
  const normPeriod = normalizeTrackingPeriod(kpi.trackingPeriod, kpi.satuan);
  if (!isPeriodicTrackingType(normPeriod)) return false;
  const mIdx = typeof monthLabelOrIdx === "number" ? monthLabelOrIdx : getMonthIndexFromLabel(monthLabelOrIdx);
  if (mIdx < 0 || mIdx > 11) return false;
  const activeSet = new Set(getActiveMonthIndicesForPeriod(normPeriod));

  if (kpi.periodicTargetBlock === true) {
    return !activeSet.has(mIdx);
  }
  if (kpi.periodicTargetBlock === false) {
    return false;
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
      return !activeSet.has(mIdx);
    }
  }
  return false;
}

/** Sanitasi input teks angka KPI agar mendukung angka, titik (.), koma (,), tanda minus (-), spasi, dan %. */
export function sanitizeKpiNumericInput(raw: string, allowRangeDash = true): string {
  if (allowRangeDash) {
    return raw.replace(/[^0-9.,\-%–\s]/g, "");
  }
  return raw.replace(/[^0-9.,\-%]/g, "");
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
export function formatComputedKpiNumber(value: number, sampleInputs: string[] = []): string {
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
  return appendPercent ? `${signed}%` : signed;
}
