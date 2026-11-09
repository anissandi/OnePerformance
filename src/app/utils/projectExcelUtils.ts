import { exportXLSX, parseXLSX } from "./excelUtils";
import {
  mapParsedProjectExcelRows,
  PROJECT_EXCEL_HEADERS,
  PROJECT_EXTERNAL_UPLOAD_HEADERS,
} from "../../../supabase/functions/server/shared/projectWorkflow";
import type { ParsedExternalProjectRow } from "../../../supabase/functions/server/shared/projectWorkflow";

export { mapParsedProjectExcelRows, PROJECT_EXTERNAL_UPLOAD_HEADERS };
export type { ParsedExternalProjectRow };

export async function parseProjectExcelFile(file: File): Promise<ParsedExternalProjectRow[]> {
  const { headers, rows } = await parseXLSX(file);
  return mapParsedProjectExcelRows(headers, rows);
}

export function downloadProjectExcelTemplate(
  target?:
    | string
    | Array<{
        id: string;
        name: string;
        unit: string;
        department: string;
        position: string;
      }>,
): void {
  if (Array.isArray(target) && target.length > 0) {
    const sampleRows: (string | number)[][] = target.slice(0, 3).flatMap((emp, index) => [
      [
        index * 2 + 1,
        emp.id,
        emp.name,
        emp.unit,
        emp.department,
        emp.position,
        "QCC",
        "Team Leader",
        "Reduksi Downtime Mesin Boiler",
        "Pengurangan downtime mesin boiler melalui preventive maintenance dan perbaikan SOP operasional.",
        "2026-01-15",
        "2026-06-30",
        "Done",
        88,
      ],
      [
        index * 2 + 2,
        emp.id,
        emp.name,
        emp.unit,
        emp.department,
        emp.position,
        "SS",
        "Ideator",
        "Otomasi Checklist Inspeksi Harian",
        "Digitalisasi form inspeksi harian menggunakan QR code untuk mempercepat pelaporan.",
        "2026-03-01",
        "2026-08-15",
        "Done",
        92,
      ],
    ]);
    exportXLSX(
      "Template_Upload_Project_Outside_Job_Scope_2026.xlsx",
      [...PROJECT_EXTERNAL_UPLOAD_HEADERS],
      sampleRows,
    );
    return;
  }

  const employeeId = typeof target === "string" ? target : "EMP";
  const sampleRows: (string | number)[][] = [
    [
      1,
      'QCC - "Small Group Activity"',
      "Leader / Ketua",
      "Reduksi Downtime Mesin Boiler",
      "Preventive maintenance terjadwal dan kalibrasi sensor tekanan uap",
      "2026-01-15",
      "2026-06-30",
      "Done",
      88,
    ],
    [
      2,
      'SS - "Small Idea Kaizen"',
      "Member / Anggota",
      "Otomasi Checklist Inspeksi Harian",
      "Digitalisasi form inspeksi harian menggunakan QR code",
      "2026-03-01",
      "2026-08-15",
      "Done",
      92,
    ],
  ];
  exportXLSX(`Template_Project_Outside_Job_Scope_${employeeId}_2026.xlsx`, [...PROJECT_EXCEL_HEADERS], sampleRows);
}
