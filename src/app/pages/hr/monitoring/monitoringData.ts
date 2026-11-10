// Shared mock data for all HR Monitoring pages

import { loadManagedUsers } from "../../../store/authStore";

export interface MonitoringEmployee {
  id: string;
  name: string;
  position: string;
  division: string;
  unit: string;
  grade: string;
  isSupervisor: boolean;
}

const FALLBACK_EMPLOYEES: MonitoringEmployee[] = [
  { id: "E001", name: "Ahmad Fauzi",    position: "Manager Divisi Produksi & Operasional", division: "Divisi Produksi & Operasional", unit: "PT Pulau Sambu (Guntung)",    grade: "Grade 8",  isSupervisor: true  },
  { id: "E002", name: "Siti Rahayu",    position: "Manager Divisi Sumber Daya Manusia",    division: "Divisi Sumber Daya Manusia",    unit: "PT RSUP (Industry)",          grade: "Grade 5",  isSupervisor: false },
  { id: "E003", name: "Budi Santoso",   position: "Manager Divisi Keuangan & Akuntansi",   division: "Divisi Keuangan & Akuntansi",   unit: "PT RSTM",                     grade: "Grade 7",  isSupervisor: true  },
  { id: "E004", name: "Diana Kusuma",   position: "Manager Divisi Pemasaran & Penjualan",  division: "Divisi Pemasaran & Penjualan",  unit: "PT GHS",                      grade: "Grade 4",  isSupervisor: false },
  { id: "E005", name: "Eko Prasetyo",   position: "Manager Divisi Teknologi Informasi",    division: "Divisi Teknologi Informasi",    unit: "PT Pulau Sambu (Jakarta)",    grade: "Grade 7",  isSupervisor: true  },
  { id: "E006", name: "Fajar Hidayat",  position: "Manager Divisi Perkebunan",             division: "Divisi Perkebunan",             unit: "PT RSUP (Perkebunan)",        grade: "Grade 6",  isSupervisor: true  },
  { id: "E007", name: "Gita Permata",   position: "Manager Divisi Keuangan & SDM",         division: "Divisi Keuangan & SDM",         unit: "PT Pulau Sambu (Kuala Enok)", grade: "Grade 4",  isSupervisor: false },
  { id: "E008", name: "Hendra Wijaya",  position: "Manager Divisi Operasional",            division: "Divisi Operasional",            unit: "PT RSTM",                     grade: "Grade 9",  isSupervisor: true  },
  { id: "E009", name: "Indah Lestari",  position: "Manager Divisi Perkebunan",             division: "Divisi Perkebunan",             unit: "PT RSUP (Perkebunan)",        grade: "Grade 5",  isSupervisor: false },
  { id: "E010", name: "Joko Susanto",   position: "Manager Divisi Operasional",            division: "Divisi Operasional",            unit: "PT GHS",                      grade: "Grade 7",  isSupervisor: true  },
  { id: "E011", name: "Kartini Dewi",   position: "Manager Divisi Sumber Daya Manusia",    division: "Divisi Sumber Daya Manusia",    unit: "PT RSUP (Industry)",          grade: "Grade 4",  isSupervisor: false },
  { id: "E012", name: "Lukman Hakim",   position: "Manager Divisi Produksi & Operasional", division: "Divisi Produksi & Operasional", unit: "PT Pulau Sambu (Guntung)",    grade: "Grade 7",  isSupervisor: true  },
  { id: "E013", name: "Rini Susanti",   position: "Manager Divisi Sumber Daya Manusia",    division: "Divisi Sumber Daya Manusia",    unit: "PT RSUP (Industry)",          grade: "Grade 6",  isSupervisor: false },
  { id: "E014", name: "Dian Permana",   position: "Manager Divisi Sumber Daya Manusia",    division: "Divisi Sumber Daya Manusia",    unit: "PT RSUP (Industry)",          grade: "Grade 5",  isSupervisor: false },
];

export function getMonitoringEmployees(): MonitoringEmployee[] {
  const users = loadManagedUsers();
  if (users.length > 0) {
    return users.map((u) => ({
      id: u.employeeId,
      name: u.name,
      position: u.position,
      division: u.division,
      unit: u.company,
      grade: u.grade || "Grade 5",
      isSupervisor: u.role === "Supervisor" || u.role === "Director" || u.groupings !== "Operasional",
    }));
  }
  return FALLBACK_EMPLOYEES;
}

export const EMPLOYEES: MonitoringEmployee[] = getMonitoringEmployees();

export const COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];
