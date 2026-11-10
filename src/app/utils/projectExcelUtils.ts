import { exportXLSX, parseXLSX } from "./excelUtils";

export const PROJECT_EXCEL_HEADERS = [
  "No",
  "Project Scope",
  "Role Project",
  "Project Title",
  "Project Detail",
  "Start Date",
  "Finish Date",
  "Progress Status",
  "Final Score",
] as const;

export const PROJECT_EXTERNAL_UPLOAD_HEADERS = [
  "No",
  "Emp. ID",
  "Employee",
  "Company Unit",
  "Department",
  "Position",
  "Project Scope",
  "Role Project",
  "Project Title",
  "Project Detail",
  "Start Date",
  "Finish Date",
  "Progress Status",
  "Final Score",
] as const;

export type ProjectExcelRow = {
  no: number;
  projectScope: string;
  roleProject: string;
  projectTitle: string;
  projectDetail: string;
  startDate: string;
  finishDate: string;
  progressStatus: string;
  finalScore: number;
};

export type ParsedExternalProjectRow = ProjectExcelRow & {
  employeeId?: string;
  employeeName?: string;
  companyUnit?: string;
  department?: string;
  position?: string;
};

export function mapParsedProjectExcelRows(headers: string[], rawRows: string[][]): ParsedExternalProjectRow[] {
  const norm = (val: string) => val.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const findCol = (patterns: RegExp[]) => headers.findIndex((h) => patterns.some((p) => p.test(norm(h))));

  const empIdIdx = findCol([/^emp id$/, /employee id/, /id karyawan/, /^nik$/]);
  const empNameIdx = findCol([/^employee$/, /employee name/, /nama karyawan/, /^nama$/]);
  const unitIdx = findCol([/company unit/, /unit usaha/, /^unit$/]);
  const deptIdx = findCol([/^department$/, /^departemen$/, /^division$/, /^divisi$/]);
  const posIdx = findCol([/^position$/, /^jabatan$/]);
  const scopeIdx = findCol([/project scope/, /\bscope\b/]);
  const roleIdx = findCol([/role project/, /roe project/, /\brole\b/, /\broe\b/]);
  const titleIdx = findCol([/project title/, /\btitle\b/, /project name/]);
  const detailIdx = findCol([/project detail/, /\bdetail\b/, /description/]);
  const startIdx = findCol([/start date/, /\bstart\b/]);
  const finishIdx = findCol([/finish date/, /end date/, /\bfinish\b/]);
  const statusIdx = findCol([/progress status/, /\bprogress\b/, /^status$/]);
  const scoreIdx = findCol([/final score/, /\bscore\b/]);

  const getCell = (row: string[], idx: number, fallbackIdx: number) =>
    (idx >= 0 ? row[idx] : fallbackIdx >= 0 ? row[fallbackIdx] : "")?.trim() ?? "";

  const nonEmptyRows = rawRows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) {
    throw new Error("File Excel kosong. Isi minimal 1 baris proyek pada template.");
  }

  const hasEmpColumns = empIdIdx >= 0;
  return nonEmptyRows.map((row, idx) => {
    const rawScore = getCell(row, scoreIdx, hasEmpColumns ? 13 : 8).replace("%", "").replace(",", ".").trim();
    const parsedScore = Number(rawScore);
    if (!rawScore || !Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      throw new Error(`Nilai Final Score pada baris ke-${idx + 1} ("${rawScore}") harus berupa angka 0–100.`);
    }
    const employeeId = empIdIdx >= 0 ? getCell(row, empIdIdx, -1) : undefined;
    return {
      no: idx + 1,
      ...(employeeId ? { employeeId } : {}),
      ...(empNameIdx >= 0 ? { employeeName: getCell(row, empNameIdx, -1) } : {}),
      ...(unitIdx >= 0 ? { companyUnit: getCell(row, unitIdx, -1) } : {}),
      ...(deptIdx >= 0 ? { department: getCell(row, deptIdx, -1) } : {}),
      ...(posIdx >= 0 ? { position: getCell(row, posIdx, -1) } : {}),
      projectScope: getCell(row, scopeIdx, hasEmpColumns ? 6 : 1),
      roleProject: getCell(row, roleIdx, hasEmpColumns ? 7 : 2),
      projectTitle: getCell(row, titleIdx, hasEmpColumns ? 8 : 3),
      projectDetail: getCell(row, detailIdx, hasEmpColumns ? 9 : 4),
      startDate: getCell(row, startIdx, hasEmpColumns ? 10 : 5),
      finishDate: getCell(row, finishIdx, hasEmpColumns ? 11 : 6),
      progressStatus: getCell(row, statusIdx, hasEmpColumns ? 12 : 7),
      finalScore: Number(parsedScore.toFixed(2)),
    };
  });
}

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
