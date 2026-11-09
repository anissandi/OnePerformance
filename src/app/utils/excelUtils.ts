import * as XLSX from "xlsx";

export function exportXLSX(filename: string, headers: string[], rows: (string | number)[][]): void {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename.replace(/\.csv$/, ".xlsx"));
}

export function parseXLSX(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (aoa.length === 0) { resolve({ headers: [], rows: [] }); return; }
        const [headers, ...rows] = aoa.map((r) => r.map((c) => String(c ?? "")));
        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
