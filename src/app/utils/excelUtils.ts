import * as XLSX from "xlsx";

export interface ExcelCellStyle {
  /** Warna background 6-digit hex tanpa '#', mis. "1A284F" atau "#1A284F" */
  bg?: string;
  /** Warna teks 6-digit hex, mis. "FFFFFF" */
  fg?: string;
  bold?: boolean;
  italic?: boolean;
  fontSize?: number;
  align?: "left" | "center" | "right";
  vAlign?: "top" | "center" | "bottom";
  wrap?: boolean;
  borderColor?: string;
}

export interface StyledExcelCell {
  value: string | number | null | undefined;
  style?: ExcelCellStyle;
}

export interface StyledExcelMerge {
  /** 0-indexed row & col */
  sRow: number;
  sCol: number;
  eRow: number;
  eCol: number;
}

export interface StyledExcelSpec {
  sheetName?: string;
  colWidths?: number[];
  rowHeights?: Record<number, number>;
  rows: Array<Array<StyledExcelCell | string | number>>;
  merges?: StyledExcelMerge[];
}

// Palet warna sistem OnePerformance (selaras 100% dengan UI tabel)
export const EXCEL_THEME = {
  headerNavyBg: "1A284F",
  headerSubNavyBg: "243860",
  headerTotalBg: "0F3460",
  headerAchBg: "0A2A4A",
  white: "FFFFFF",
  zebraEven: "FFFFFF",
  zebraOdd: "F8FAFC",
  borderLight: "CBD5E1",
  textDark: "1E293B",
  textMuted: "475569",
  sectionPalette: ["1565C0", "1976D2", "2E7D32", "6A1B9A", "EF6C00", "00838F", "AD1457", "4E342E"],
  perspektif: {
    Finansial: { bg: "EFF6FF", fg: "1D4ED8" },
    Proses: { bg: "F0FDF4", fg: "15803D" },
    Customer: { bg: "FFF7ED", fg: "C2410C" },
    "Learning & Growth": { bg: "FAF5FF", fg: "7E22CE" },
    "Environment, Health & Safety": { bg: "ECFDF5", fg: "047857" },
  } as Record<string, { bg: string; fg: string }>,
  polaritas: {
    Maximize: { bg: "EFF6FF", fg: "1D4ED8" },
    Minimize: { bg: "FFF7ED", fg: "C2410C" },
    Stabilize: { bg: "F0FDFA", fg: "0F766E" },
  } as Record<string, { bg: string; fg: string }>,
  cascading: {
    FC: { bg: "E0E7FF", fg: "312E81" },
    PC: { bg: "FEF3C7", fg: "78350F" },
    CC: { bg: "CCFBF1", fg: "134E4A" },
  } as Record<string, { bg: string; fg: string }>,
};

function cleanHex(hex?: string, fallback = "000000"): string {
  if (!hex) return `FF${fallback}`;
  const h = hex.replace(/^#/, "").trim().toUpperCase();
  if (h.length === 6) return `FF${h}`;
  if (h.length === 8) return h;
  return `FF${fallback}`;
}

function xmlEsc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function colLetter(colIdx0: number): string {
  let n = colIdx0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(row0: number, col0: number): string {
  return `${colLetter(col0)}${row0 + 1}`;
}

/** Membangun bytes file `.xlsx` OpenXML lengkap dengan `xl/styles.xml` (warna sel, font, border, merge, colWidths). */
export function buildStyledXlsxBytes(spec: StyledExcelSpec): Uint8Array {
  const enc = new TextEncoder();
  const sheetTitle = (spec.sheetName || "Data").replace(/[\\/*?:\[\]]/g, "_").slice(0, 31) || "Data";

  // Kumpulan unik font, fill, border, dan xf (cellXfs)
  const fonts: string[] = [
    `<font><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>`,
  ];
  const fontIndexMap = new Map<string, number>([["10|FF1E293B|0|0", 0]]);
  const getFontId = (st?: ExcelCellStyle): number => {
    const sz = st?.fontSize ?? 10;
    const fg = cleanHex(st?.fg, "1E293B");
    const b = st?.bold ? 1 : 0;
    const it = st?.italic ? 1 : 0;
    const key = `${sz}|${fg}|${b}|${it}`;
    const existing = fontIndexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = fonts.length;
    fonts.push(
      `<font>${b ? "<b/>" : ""}${it ? "<i/>" : ""}<sz val="${sz}"/><color rgb="${fg}"/><name val="Calibri"/></font>`,
    );
    fontIndexMap.set(key, idx);
    return idx;
  };

  // Excel mewajibkan 2 fill pertama: none & gray125
  const fills: string[] = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
  ];
  const fillIndexMap = new Map<string, number>([["NONE", 0]]);
  const getFillId = (bg?: string): number => {
    if (!bg) return 0;
    const rgb = cleanHex(bg, "FFFFFF");
    const existing = fillIndexMap.get(rgb);
    if (existing !== undefined) return existing;
    const idx = fills.length;
    fills.push(
      `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`,
    );
    fillIndexMap.set(rgb, idx);
    return idx;
  };

  const borders: string[] = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
  ];
  const borderIndexMap = new Map<string, number>([["NONE", 0]]);
  const getBorderId = (borderColor?: string): number => {
    const bc = cleanHex(borderColor ?? "CBD5E1", "CBD5E1");
    const existing = borderIndexMap.get(bc);
    if (existing !== undefined) return existing;
    const idx = borders.length;
    borders.push(
      `<border>` +
        `<left style="thin"><color rgb="${bc}"/></left>` +
        `<right style="thin"><color rgb="${bc}"/></right>` +
        `<top style="thin"><color rgb="${bc}"/></top>` +
        `<bottom style="thin"><color rgb="${bc}"/></bottom>` +
        `<diagonal/>` +
      `</border>`,
    );
    borderIndexMap.set(bc, idx);
    return idx;
  };

  const xfs: string[] = [`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`];
  const xfMap = new Map<string, number>();
  const getXfId = (st?: ExcelCellStyle): number => {
    if (!st) return 0;
    const fId = getFontId(st);
    const flId = getFillId(st.bg);
    const bdId = getBorderId(st.borderColor ?? "CBD5E1");
    const hAlign = st.align ?? "left";
    const vAlign = st.vAlign ?? "center";
    const wrap = st.wrap !== false ? 1 : 0;
    const key = `${fId}|${flId}|${bdId}|${hAlign}|${vAlign}|${wrap}`;
    const existing = xfMap.get(key);
    if (existing !== undefined) return existing;
    const idx = xfs.length;
    xfs.push(
      `<xf numFmtId="0" fontId="${fId}" fillId="${flId}" borderId="${bdId}" xfId="0" applyFont="1" applyFill="${flId > 0 ? 1 : 0}" applyBorder="1" applyAlignment="1">` +
        `<alignment horizontal="${hAlign}" vertical="${vAlign}" wrapText="${wrap}"/>` +
      `</xf>`,
    );
    xfMap.set(key, idx);
    return idx;
  };

  // Bangun sheetData & estimasi lebar kolom otomatis bila colWidths tidak diberikan
  let maxCols = 0;
  for (const r of spec.rows) if (r.length > maxCols) maxCols = r.length;
  const autoWidths = new Array<number>(maxCols).fill(12);

  const rowXmlList: string[] = [];
  spec.rows.forEach((row, rIdx) => {
    const customH = spec.rowHeights?.[rIdx];
    const hAttr = customH ? ` ht="${customH}" customHeight="1"` : "";
    const cellsXml: string[] = [];
    row.forEach((rawCell, cIdx) => {
      const cellObj: StyledExcelCell =
        rawCell !== null && typeof rawCell === "object" && "value" in rawCell
          ? (rawCell as StyledExcelCell)
          : { value: rawCell as string | number };
      const sIdx = getXfId(cellObj.style);
      const ref = cellRef(rIdx, cIdx);
      const val = cellObj.value;
      if (val === null || val === undefined || val === "") {
        cellsXml.push(`<c r="${ref}" s="${sIdx}"/>`);
        return;
      }
      const strVal = String(val);
      const firstLineLen = strVal.split("\n")[0]?.length ?? 0;
      if (firstLineLen + 4 > (autoWidths[cIdx] ?? 12)) {
        autoWidths[cIdx] = Math.min(46, firstLineLen + 4);
      }
      if (typeof val === "number" && Number.isFinite(val)) {
        cellsXml.push(`<c r="${ref}" s="${sIdx}"><v>${val}</v></c>`);
      } else {
        const preserve = /^\s|\s$|\n/.test(strVal) ? ` xml:space="preserve"` : "";
        cellsXml.push(`<c r="${ref}" s="${sIdx}" t="inlineStr"><is><t${preserve}>${xmlEsc(strVal)}</t></is></c>`);
      }
    });
    rowXmlList.push(`<row r="${rIdx + 1}"${hAttr}>${cellsXml.join("")}</row>`);
  });

  const widths = spec.colWidths && spec.colWidths.length > 0 ? spec.colWidths : autoWidths;
  const colsXml =
    widths.length > 0
      ? `<cols>${widths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(6, w)}" customWidth="1"/>`)
          .join("")}</cols>`
      : "";

  const merges = (spec.merges ?? []).filter(
    (m) => m.eRow >= m.sRow && m.eCol >= m.sCol && (m.eRow > m.sRow || m.eCol > m.sCol),
  );
  const mergesXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map((m) => `<mergeCell ref="${cellRef(m.sRow, m.sCol)}:${cellRef(m.eRow, m.eCol)}"/>`)
          .join("")}</mergeCells>`
      : "";

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `</styleSheet>`;

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    colsXml +
    `<sheetData>${rowXmlList.join("")}</sheetData>` +
    mergesXml +
    `</worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xmlEsc(sheetTitle)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const wbRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  return buildZipBytesSync([
    { path: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { path: "_rels/.rels", data: enc.encode(rootRelsXml) },
    { path: "xl/workbook.xml", data: enc.encode(workbookXml) },
    { path: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRelsXml) },
    { path: "xl/styles.xml", data: enc.encode(stylesXml) },
    { path: "xl/worksheets/sheet1.xml", data: enc.encode(sheetXml) },
  ]);
}

// Helper sinkron pembentuk Uint8Array ZIP (agar bisa diuji langsung di Node maupun diunduh instan di browser)
const CRC_TBL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Sync(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TBL[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBytesSync(entries: Array<{ path: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.path);
    const crc = crc32Sync(e.data);
    const sz = e.data.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, sz, true);
    loc.setUint32(22, sz, true);
    loc.setUint16(26, name.length, true);
    parts.push(new Uint8Array(loc.buffer), name, e.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, sz, true);
    cd.setUint32(24, sz, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + sz;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const total = all.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of all) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

export function exportStyledXLSX(filename: string, spec: StyledExcelSpec): void {
  const bytes = buildStyledXlsxBytes(spec);
  const base = filename.replace(/\.(csv|xlsx)$/i, "");
  const cleanName = `${base}.xlsx`;
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = cleanName.endsWith(".xlsx") ? cleanName : `${cleanName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Auto-style sel berdasarkan nama header kolom & nilai agar semirip mungkin dengan warna UI sistem. */
export function inferSystemCellStyle(headerLabel: string, rawVal: string | number, rowIndex: number): ExcelCellStyle {
  const h = headerLabel.trim().toLowerCase();
  const v = String(rawVal ?? "").trim();
  const baseBg = rowIndex % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;

  if (h === "no") {
    return { bg: baseBg, fg: EXCEL_THEME.headerNavyBg, bold: true, align: "center" };
  }
  if (h === "perspektif" && EXCEL_THEME.perspektif[v]) {
    const p = EXCEL_THEME.perspektif[v];
    return { bg: p.bg, fg: p.fg, bold: true, align: "left" };
  }
  if (h === "bobot" || h === "bobot section") {
    return { bg: "EEF2FF", fg: EXCEL_THEME.headerNavyBg, bold: true, align: "center" };
  }
  if (h.startsWith("target") || h === "baseline 2025" || h === "baseline") {
    return { bg: baseBg, fg: EXCEL_THEME.headerNavyBg, bold: h.startsWith("target"), align: "center" };
  }
  if (h === "polaritas" && EXCEL_THEME.polaritas[v]) {
    const pol = EXCEL_THEME.polaritas[v];
    return { bg: pol.bg, fg: pol.fg, bold: true, align: "center" };
  }
  if (h === "fc" || (v === "FC" && h.includes("cascad")) || v === "FC") {
    if (v && v !== "—") return { bg: EXCEL_THEME.cascading.FC.bg, fg: EXCEL_THEME.cascading.FC.fg, bold: true, align: "center" };
  }
  if (h === "pc" || v === "PC") {
    if (v && v !== "—") return { bg: EXCEL_THEME.cascading.PC.bg, fg: EXCEL_THEME.cascading.PC.fg, bold: true, align: "center" };
  }
  if (h === "cc" || v === "CC") {
    if (v && v !== "—") return { bg: EXCEL_THEME.cascading.CC.bg, fg: EXCEL_THEME.cascading.CC.fg, bold: true, align: "center" };
  }
  if (h === "periode tracking" || h === "formula setahun" || h === "formula") {
    return { bg: baseBg, fg: EXCEL_THEME.textMuted, align: "center" };
  }
  if (h === "achievement" || (v.endsWith("%") && (h.includes("26") || h === "total"))) {
    const num = parseFloat(v.replace("%", ""));
    if (Number.isFinite(num)) {
      if (num >= 100) return { bg: "DCFCE7", fg: "15803D", bold: true, align: "center" };
      if (num >= 80) return { bg: "FEF9C3", fg: "A16207", bold: true, align: "center" };
      return { bg: "FEE2E2", fg: "B91C1C", bold: true, align: "center" };
    }
  }
  return { bg: baseBg, fg: EXCEL_THEME.textDark, align: "left" };
}

export function exportXLSX(filename: string, headers: string[], rows: (string | number)[][], sheetName = "Data"): void {
  const headerCells: StyledExcelCell[] = headers.map((h) => ({
    value: h,
    style: {
      bg: EXCEL_THEME.headerNavyBg,
      fg: EXCEL_THEME.white,
      bold: true,
      align: "center",
      vAlign: "center",
      borderColor: "334155",
    },
  }));
  const styledRows: StyledExcelCell[][] = rows.map((r, rIdx) =>
    headers.map((h, cIdx) => {
      const val = r[cIdx] ?? "";
      return {
        value: val,
        style: inferSystemCellStyle(h, val, rIdx),
      };
    }),
  );
  exportStyledXLSX(filename, {
    sheetName,
    rowHeights: { 0: 28 },
    rows: [headerCells, ...styledRows],
  });
}

/**
 * Membaca matriks penuh seluruh baris dari sheet data `.xlsx`:
 * - Mengabaikan sheet referensi bernama "Master" / "Referensi" / "Reference".
 * - Mengonversi sel tanggal Excel (serial date) langsung menjadi format standar DD/MM/YYYY tanpa distorsi M/D/YY.
 * - Tetap mempertahankan format persen (%) pada sel numerik berformat persentase.
 */
export function parseXLSXMatrix(dataOrFile: ArrayBuffer | Uint8Array): string[][] {
  const bytes = dataOrFile instanceof Uint8Array ? dataOrFile : new Uint8Array(dataOrFile);
  const wb = XLSX.read(bytes, { type: "array", cellNF: true });
  const targetSheetName =
    wb.SheetNames.find((n) => !/^(master|referensi|reference)$/i.test(String(n ?? "").trim())) ??
    wb.SheetNames[0];
  const ws = targetSheetName ? wb.Sheets[targetSheetName] : undefined;
  if (!ws) return [];
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const matrix: string[][] = [];
  for (let R = range.s.r; R <= range.e.r; R++) {
    const row: string[] = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) {
        row.push("");
        continue;
      }
      if (cell.t === "n" && typeof cell.v === "number") {
        const fmt = String(cell.z ?? "");
        const formattedText = String(cell.w ?? "");
        const isPct = fmt.includes("%") || formattedText.includes("%");
        const isDateFmt =
          !isPct &&
          cell.v > 10000 &&
          cell.v < 90000 &&
          ((fmt && /[dmy]/i.test(fmt.replace(/\[[^\]]*\]/g, ""))) ||
            /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(formattedText.trim()));
        if (isDateFmt && XLSX.SSF && typeof XLSX.SSF.parse_date_code === "function") {
          const parsed = XLSX.SSF.parse_date_code(cell.v);
          if (parsed && parsed.y && parsed.m && parsed.d) {
            row.push(
              `${String(parsed.d).padStart(2, "0")}/${String(parsed.m).padStart(2, "0")}/${String(parsed.y).padStart(4, "0")}`,
            );
            continue;
          }
        }
        row.push((cell.w !== undefined ? String(cell.w) : String(cell.v)).trim());
        continue;
      }
      if (cell.t === "d" && cell.v instanceof Date && !Number.isNaN(cell.v.getTime())) {
        row.push(
          `${String(cell.v.getDate()).padStart(2, "0")}/${String(cell.v.getMonth() + 1).padStart(2, "0")}/${cell.v.getFullYear()}`,
        );
        continue;
      }
      row.push((cell.w !== undefined ? String(cell.w) : String(cell.v)).trim());
    }
    matrix.push(row);
  }
  return matrix;
}

export function parseXLSX(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const matrix = parseXLSXMatrix(e.target!.result as ArrayBuffer);
        if (matrix.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }
        // Temukan baris header utama (baris pertama yang tidak kosong; melewati baris judul dekoratif bila ada)
        let headerIdx = matrix.findIndex((r) => r.filter((c) => c.trim() !== "").length >= 2);
        if (headerIdx < 0) headerIdx = 0;
        const headers = matrix[headerIdx];
        const rows = matrix.slice(headerIdx + 1);
        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
