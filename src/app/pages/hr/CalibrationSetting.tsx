import { useState, useEffect } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { Save, Edit2, Building2, ChevronRight, ArrowLeft, Eye, Send, CheckCircle2, Clock, X, RefreshCw, Users } from "lucide-react";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";
import { isExcludedFromAppraisalCalibration, loadManagedUsers } from "../../store/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type CalibrationGrade = { id: string; grade: string; proporsi: string; };
type DivisionProportion = { id: string; divisi: string; hc: number; };
type DepartemenenProportion = { id: string; divisiId: string; departemen: string; hc: number; };
type BagianProportion = { id: string; departemenenId: string; bagian: string; hc: number; };

type CompanyUnit = {
  id: string; name: string; code: string; industry: string;
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  beginningHC?: Record<string, number>;
  beginningGrades?: CalibrationGrade[];
  yearEndUpdatedAt?: string;
  yearEndStatus?: PageMode;
};

type PageMode = "edit" | "preview" | "submitted";

// ─── Default data ─────────────────────────────────────────────────────────────

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%"  },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%"  },
];

const DIV_DEFS = [
  { id: "div1", divisi: "Staff Management" },
  { id: "div2", divisi: "Generals" },
  { id: "div3", divisi: "Finance & Accounting" },
  { id: "div4", divisi: "Logistic / Materials" },
  { id: "div5", divisi: "Quality Management" },
  { id: "div6", divisi: "Coconut Production" },
  { id: "div7", divisi: "Pineapple Production" },
  { id: "div8", divisi: "Utility & Supports" },
];

const DEPT_DEFS: [string, string, string][] = [
  ["dep1","div1","Sumber Daya Manusia"],["dep2","div1","Umum & Administrasi"],
  ["dep3","div2","Legal & Compliance"],["dep4","div2","Teknologi Informasi"],
  ["dep5","div3","Keuangan"],["dep6","div3","Akuntansi"],["dep7","div3","Pajak & Audit"],
  ["dep8","div4","Warehouse & Inventory"],["dep9","div4","Purchasing"],
  ["dep10","div5","Quality Control"],["dep11","div5","Quality Assurance"],
  ["dep12","div6","Produksi Kelapa A"],["dep13","div6","Produksi Kelapa B"],
  ["dep14","div7","Produksi Nanas"],["dep15","div8","Maintenance"],["dep16","div8","Utilitas & Energi"],
];

const BAGIAN_DEFS: [string, string, string][] = [
  ["bag1","dep1","Rekrutmen & Seleksi"],["bag2","dep1","Pengembangan SDM"],
  ["bag3","dep2","Administrasi Umum"],["bag4","dep2","Kearsipan"],
  ["bag5","dep3","Legal"],["bag6","dep3","Kepatuhan"],
  ["bag7","dep4","Infrastruktur IT"],["bag8","dep4","Pengembangan Sistem"],
  ["bag9","dep5","Treasury"],["bag10","dep5","Anggaran"],
  ["bag11","dep6","Akuntansi Biaya"],["bag12","dep6","Akuntansi Umum"],
  ["bag13","dep7","Pajak"],["bag14","dep7","Internal Audit"],
  ["bag15","dep8","Warehouse"],["bag16","dep8","Inventory Control"],
  ["bag17","dep9","Pengadaan Lokal"],["bag18","dep9","Pengadaan Import"],
  ["bag19","dep10","Inspeksi QC"],["bag20","dep10","Laboratorium"],
  ["bag21","dep11","Sistem Manajemen Mutu"],["bag22","dep11","Dokumentasi QA"],
  ["bag23","dep12","Proses Kelapa A"],["bag24","dep12","Packing Kelapa A"],
  ["bag25","dep13","Proses Kelapa B"],["bag26","dep13","Packing Kelapa B"],
  ["bag27","dep14","Proses Nanas"],["bag28","dep14","Packing Nanas"],
  ["bag29","dep15","Mechanical"],["bag30","dep15","Electrical"],
  ["bag31","dep16","Utilitas"],["bag32","dep16","Energi & Environment"],
];

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => ({
  id, name, code, industry,
  calibrationGrades: makeDefaultCalibrationGrades(),
  divisionProportions: [],
  departemenenProportions: [],
  bagianProportions: [],
});

const defaultCompanyUnits: CompanyUnit[] = [
  makeUnit("1", "PT RSUP (Industry)",          "RSUP-IND", "Industry"),
  makeUnit("2", "PT RSUP (Perkebunan)",        "RSUP-PKB", "Perkebunan"),
  makeUnit("3", "PT Pulau Sambu (Jakarta)",    "PS-JKT",   "Jakarta"),
  makeUnit("4", "PT Pulau Sambu (Guntung)",    "PS-GTG",   "Guntung"),
  makeUnit("5", "PT Pulau Sambu (Kuala Enok)", "PS-KE",    "Kuala Enok"),
  makeUnit("6", "PT RSTM",                     "RSTM",     ""),
  makeUnit("7", "PT GHS",                      "GHS",      ""),
  makeUnit("8", "ASD",                      "ASD",      ""),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeCalcs(hc: number, grades: CalibrationGrade[]) {
  return grades.map(g => hc > 0 ? Math.round(hc * (parseFloat(g.proporsi) || 0) / 100) : 0);
}

export function orgSlug(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "general";
}

/**
 * Mengambil daftar Divisi, Departemen, dan Bagian dari tabel Proportion di /calibration/setting
 * (menggabungkan data yang sudah disimpan di Calibration Setting, hasil distribusi karyawan, dan definisi standar).
 */
export function loadCalibrationOrgOptions(companyNames?: string[]): {
  divisions: string[];
  departments: string[];
  bagians: string[];
} {
  const divSet = new Set<string>(DIV_DEFS.map((d) => d.divisi));
  const deptSet = new Set<string>(DEPT_DEFS.map(([, , name]) => name));
  const bagSet = new Set<string>(BAGIAN_DEFS.map(([, , name]) => name));

  try {
    const raw =
      localStorage.getItem("calibration_submitted_units") ??
      localStorage.getItem("calibration_hc_settings_2026");
    const savedUnits: CompanyUnit[] = raw ? JSON.parse(raw) : [];
    const baseUnits = defaultCompanyUnits.map((def) => {
      const synced = applyImportedEmployeesDistribution(def);
      const saved = savedUnits.find((s) => s.id === def.id || s.name === def.name);
      return {
        ...synced,
        divisionProportions: [
          ...(saved?.divisionProportions ?? []),
          ...synced.divisionProportions,
        ],
        departemenenProportions: [
          ...(saved?.departemenenProportions ?? []),
          ...synced.departemenenProportions,
        ],
        bagianProportions: [
          ...(saved?.bagianProportions ?? []),
          ...synced.bagianProportions,
        ],
      };
    });

    const filteredUnits =
      companyNames && companyNames.length > 0
        ? baseUnits.filter((u) => companyNames.includes(u.name))
        : baseUnits;

    for (const u of filteredUnits) {
      for (const d of u.divisionProportions) {
        if (d.divisi?.trim()) divSet.add(d.divisi.trim());
      }
      for (const dep of u.departemenenProportions) {
        if (dep.departemen?.trim()) deptSet.add(dep.departemen.trim());
      }
      for (const bag of u.bagianProportions) {
        if (bag.bagian?.trim()) bagSet.add(bag.bagian.trim());
      }
    }
  } catch {
    // ignore and use defaults
  }

  return {
    divisions: Array.from(divSet).sort(),
    departments: Array.from(deptSet).sort(),
    bagians: Array.from(bagSet).sort(),
  };
}
/**
 * Bagian III Poin 3:
 * Membangun daftar Divisi, Departemen, dan Bagian beserta jumlah HC secara dinamis
 * langsung dari data karyawan hasil Import Excel pada unit usaha terkait.
 */
export function applyImportedEmployeesDistribution(unit: CompanyUnit): CompanyUnit {
  const unitUsers = loadManagedUsers().filter(
    (u) => u.company === unit.name && u.status === "Active" && !isExcludedFromAppraisalCalibration(u),
  );
  if (unitUsers.length === 0) {
    return {
      ...unit,
      divisionProportions: [],
      departemenenProportions: [],
      bagianProportions: [],
    };
  }

  const divMap = new Map<string, { id: string; divisi: string; hc: number }>();
  const deptMap = new Map<string, { id: string; divisiId: string; departemen: string; hc: number }>();
  const bagianMap = new Map<string, { id: string; departemenenId: string; bagian: string; hc: number }>();

  for (const u of unitUsers) {
    const divName = (u.division || "Umum").trim();
    const deptName = (u.department || divName).trim();
    const bagName = (u.bagian || deptName).trim();

    const divId = `div_${orgSlug(divName)}`;
    const deptId = `dep_${orgSlug(divName)}__${orgSlug(deptName)}`;
    const bagId = `bag_${orgSlug(divName)}__${orgSlug(deptName)}__${orgSlug(bagName)}`;

    const curDiv = divMap.get(divId) ?? { id: divId, divisi: divName, hc: 0 };
    curDiv.hc += 1;
    divMap.set(divId, curDiv);

    const curDept = deptMap.get(deptId) ?? { id: deptId, divisiId: divId, departemen: deptName, hc: 0 };
    curDept.hc += 1;
    deptMap.set(deptId, curDept);

    const curBag = bagianMap.get(bagId) ?? { id: bagId, departemenenId: deptId, bagian: bagName, hc: 0 };
    curBag.hc += 1;
    bagianMap.set(bagId, curBag);
  }

  return {
    ...unit,
    divisionProportions: Array.from(divMap.values()),
    departemenenProportions: Array.from(deptMap.values()),
    bagianProportions: Array.from(bagianMap.values()),
  };
}
// ─── Calibration Panel ────────────────────────────────────────────────────────

function CalibrationPanel({
  calibrationGrades, divisionProportions, departemenenProportions, bagianProportions,
  editMode,
  onUpdateCalibrationGrade, onUpdateDivisionProportion,
  onUpdateDepartemenenProportion, onUpdateBagianProportion,
}: {
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
  editMode: boolean;
  onUpdateCalibrationGrade: (id: string, field: keyof CalibrationGrade, value: string) => void;
  onUpdateDivisionProportion: (id: string, field: keyof DivisionProportion, value: string | number) => void;
  onUpdateDepartemenenProportion: (id: string, field: keyof DepartemenenProportion, value: string | number) => void;
  onUpdateBagianProportion: (id: string, field: keyof BagianProportion, value: string | number) => void;
}) {
  const safeDivisions = divisionProportions ?? [];
  const safeDepts = departemenenProportions ?? [];
  const safeBagian = bagianProportions ?? [];

  const totalDivHC = safeDivisions.reduce((s, d) => s + d.hc, 0);
  const divShareMap: Record<string, number> = {};
  safeDivisions.forEach(d => { divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0; });

  const deptShareMap: Record<string, number> = {};
  safeDepts.forEach(dept => {
    const siblingHC = safeDepts.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    deptShareMap[dept.id] = siblingHC > 0 ? (dept.hc / siblingHC) * (divShareMap[dept.divisiId] ?? 0) : 0;
  });

  const bagianShareMap: Record<string, number> = {};
  safeBagian.forEach(b => {
    const siblingHC = safeBagian.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    bagianShareMap[b.id] = siblingHC > 0 ? (b.hc / siblingHC) * (deptShareMap[b.departemenenId] ?? 0) : 0;
  });

  const fmtShare = (v: number) => v > 0 ? `${v.toFixed(1)}%` : "";
  const gradeHeaders = calibrationGrades.map(g => g.grade);

  return (
    <>
      {/* Grade Distribution */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Grade Distribution & Calibration</h3>
          <p className="text-sm text-gray-500 mt-1">Define target proportions for each grade level</p>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">GRADE</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">PROPORSI</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">KARYAWAN</th>
              </tr>
            </thead>
            <tbody>
              {calibrationGrades.map((grade, idx) => {
                const karyawan = safeDivisions.reduce((s, d) =>
                  s + (d.hc > 0 ? Math.round(d.hc * (parseFloat(calibrationGrades[idx]?.proporsi) || 0) / 100) : 0), 0);
                return (
                  <tr key={grade.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-3 text-center font-medium text-gray-900">{grade.grade}</td>
                    <td className="border border-gray-300 px-4 py-3 text-center">
                      {editMode
                        ? <input type="text" value={grade.proporsi}
                            onChange={e => onUpdateCalibrationGrade(grade.id, "proporsi", e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center" />
                        : <span className="text-gray-900">{grade.proporsi}</span>}
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center bg-gray-50">
                      <span className="text-gray-900">{karyawan.toLocaleString()}</span>
                    </td>
                  </tr>
                );
              })}
              {(() => {
                const totalProporsi = calibrationGrades.reduce((s, g) => {
                  const n = parseFloat(g.proporsi.replace("%", "").trim());
                  return s + (isNaN(n) ? 0 : n);
                }, 0);
                const totalKaryawan = calibrationGrades.reduce((s, _, idx) =>
                  s + safeDivisions.reduce((ss, d) =>
                    ss + (d.hc > 0 ? Math.round(d.hc * (parseFloat(calibrationGrades[idx]?.proporsi) || 0) / 100) : 0), 0), 0);
                return (
                  <tr className="bg-[#1A284F] text-white font-semibold">
                    <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
                    <td className={`border border-gray-300 px-4 py-3 text-center ${totalProporsi !== 100 && totalProporsi > 0 ? "text-red-300" : ""}`}>
                      {totalProporsi}%
                    </td>
                    <td className="border border-gray-300 px-4 py-3 text-center">{totalKaryawan.toLocaleString()}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <ProportionTable
        title="Proportion per Division"
        subtitle="Grade distribution targets per division"
        rows={safeDivisions.map(d => ({ id: d.id, label: d.divisi, hc: d.hc, shareKuota: fmtShare(divShareMap[d.id] ?? 0), calcs: gradeCalcs(d.hc, calibrationGrades) }))}
        totalHC={totalDivHC}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateDivisionProportion(id, "hc", val)}
      />

      <ProportionTable
        title="Proportion per Departemen"
        subtitle="Share Kuota derived from Proportion per Division"
        rows={safeDepts.map(dept => {
          const parentDiv = safeDivisions.find(d => d.id === dept.divisiId);
          return { id: dept.id, label: dept.departemen, parentLabel: parentDiv?.divisi, hc: dept.hc, shareKuota: fmtShare(deptShareMap[dept.id] ?? 0), calcs: gradeCalcs(dept.hc, calibrationGrades) };
        })}
        totalHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateDepartemenenProportion(id, "hc", val)}
        showParent parentHeader="DIVISI"
      />

      <ProportionTable
        title="Proportion per Bagian"
        subtitle="Share Kuota derived from Proportion per Departemen"
        rows={safeBagian.map(b => {
          const parentDept = safeDepts.find(d => d.id === b.departemenenId);
          return { id: b.id, label: b.bagian, parentLabel: parentDept?.departemen, hc: b.hc, shareKuota: fmtShare(bagianShareMap[b.id] ?? 0), calcs: gradeCalcs(b.hc, calibrationGrades) };
        })}
        totalHC={safeBagian.reduce((s, b) => s + b.hc, 0)}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateBagianProportion(id, "hc", val)}
        showParent parentHeader="DEPARTEMEN"
      />
    </>
  );
}

// ─── Proportion Table ─────────────────────────────────────────────────────────

type PropRow = { id: string; label: string; parentLabel?: string; hc: number; shareKuota: string; calcs: number[]; };

function ProportionTable({ title, subtitle, rows, totalHC, calibrationGrades, gradeHeaders, editMode, onUpdateHC, showParent, parentHeader }: {
  title: string; subtitle: string; rows: PropRow[]; totalHC: number;
  calibrationGrades: CalibrationGrade[]; gradeHeaders: string[];
  editMode: boolean; onUpdateHC: (id: string, val: number) => void;
  showParent?: boolean; parentHeader?: string;
}) {
  const gradeTotals = gradeHeaders.map((_, i) => rows.reduce((s, r) => s + (r.calcs[i] ?? 0), 0));
  const grandTotal = rows.reduce((s, r) => s + r.calcs.reduce((a, v) => a + v, 0), 0);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
      <div className="px-6 py-5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>
      <div className="p-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#1A284F] text-white">
              {showParent && <th className="border border-gray-300 px-3 py-3 text-center font-semibold whitespace-nowrap">{parentHeader}</th>}
              <th className="border border-gray-300 px-3 py-3 text-left font-semibold">{title.replace("Proportion per ", "").toUpperCase()}</th>
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold">HC</th>
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold whitespace-nowrap">Share Kuota</th>
              {gradeHeaders.map(g => <th key={g} className="border border-gray-300 px-3 py-3 text-center font-semibold">{g}</th>)}
              <th className="border border-gray-300 px-3 py-3 text-center font-semibold">JUMLAH</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rowTotal = row.calcs.reduce((s, v) => s + v, 0);
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  {showParent && <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">{row.parentLabel ?? "—"}</td>}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900">{row.label}</td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center">
                    {editMode
                      ? <input type="number" value={row.hc || ""} onChange={e => onUpdateHC(row.id, Number(e.target.value) || 0)} placeholder="0"
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center" />
                      : <span className="text-gray-900">{row.hc > 0 ? row.hc.toLocaleString() : ""}</span>}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center bg-gray-50">
                    <span className="text-gray-700 font-medium">{row.shareKuota}</span>
                  </td>
                  {row.calcs.map((v, i) => (
                    <td key={i} className="border border-gray-300 px-3 py-2.5 text-center bg-gray-50">
                      <span className="text-gray-900">{v > 0 ? v : 0}</span>
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2.5 text-center font-medium text-gray-900">
                    {rowTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[#1A284F] text-white font-semibold">
              {showParent && <td className="border border-gray-300 px-3 py-3 text-center">—</td>}
              <td className="border border-gray-300 px-3 py-3 text-center">JUMLAH</td>
              <td className="border border-gray-300 px-3 py-3 text-center">{totalHC.toLocaleString()}</td>
              <td className="border border-gray-300 px-3 py-3 text-center">100%</td>
              {gradeTotals.map((t, i) => <td key={i} className="border border-gray-300 px-3 py-3 text-center">{t.toLocaleString()}</td>)}
              <td className="border border-gray-300 px-3 py-3 text-center">{grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Unit Detail ──────────────────────────────────────────────────────────────

function headcountPercentageChange(beginning: number, ending: number): string {
  if (beginning === 0) return ending === 0 ? "0.0%" : "N/A (HC awal 0)";
  const percentage = (ending - beginning) / beginning * 100;
  return `${percentage > 0 ? "+" : ""}${percentage.toFixed(1)}%`;
}

function CalibrationSummaryComparison({ unit }: { unit: CompanyUnit }) {
  const [level, setLevel] = useState("division");
  const baseline = unit.beginningHC;
  if (!baseline) return null;
  const initialGrades = unit.beginningGrades ?? unit.calibrationGrades;
  const initialHC = (id: string) => baseline[id] ?? 0;
  function shares(initial: boolean) {
    const getHC = (item: { id: string; hc: number }) => initial ? initialHC(item.id) : item.hc;
    const total = unit.divisionProportions.reduce((sum, item) => sum + getHC(item), 0);
    const result: Record<string, number> = {};
    unit.divisionProportions.forEach((item) => { result[item.id] = total ? getHC(item) / total * 100 : 0; });
    unit.departemenenProportions.forEach((item) => {
      const siblings = unit.departemenenProportions.filter((entry) => entry.divisiId === item.divisiId).reduce((sum, entry) => sum + getHC(entry), 0);
      result[item.id] = siblings ? getHC(item) / siblings * (result[item.divisiId] ?? 0) : 0;
    });
    unit.bagianProportions.forEach((item) => {
      const siblings = unit.bagianProportions.filter((entry) => entry.departemenenId === item.departemenenId).reduce((sum, entry) => sum + getHC(entry), 0);
      result[item.id] = siblings ? getHC(item) / siblings * (result[item.departemenenId] ?? 0) : 0;
    });
    return result;
  }
  const beforeShares = shares(true);
  const afterShares = shares(false);
  const rows = level === "division" ? unit.divisionProportions.map((item) => ({ ...item, label: item.divisi })) : level === "department" ? unit.departemenenProportions.map((item) => ({ ...item, label: item.departemen })) : unit.bagianProportions.map((item) => ({ ...item, label: item.bagian }));
  const deltaColor = (value: number) => value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-500";
  const signed = (value: number, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  const gradeRows = Array.from(new Set([...initialGrades, ...unit.calibrationGrades].map((item) => item.id))).map((id) => {
    const before = initialGrades.find((item) => item.id === id);
    const after = unit.calibrationGrades.find((item) => item.id === id);
    const beforePercent = parseFloat(before?.proporsi ?? "0") || 0;
    const afterPercent = parseFloat(after?.proporsi ?? "0") || 0;
    return { id, label: after?.grade ?? before?.grade, beforePercent, afterPercent,
      beforeCount: unit.divisionProportions.reduce((sum, item) => sum + Math.round(initialHC(item.id) * beforePercent / 100), 0),
      afterCount: unit.divisionProportions.reduce((sum, item) => sum + Math.round(item.hc * afterPercent / 100), 0) };
  });
  const gradeTotals = gradeRows.reduce((total, item) => ({ proportion: total.proportion + item.beforePercent, before: total.before + item.beforeCount, after: total.after + item.afterCount }), { proportion: 0, before: 0, after: 0 });
  const quotaTotals = rows.reduce((total, item) => ({ before: total.before + initialHC(item.id), after: total.after + item.hc, beforeShare: total.beforeShare + beforeShares[item.id], afterShare: total.afterShare + afterShares[item.id] }), { before: 0, after: 0, beforeShare: 0, afterShare: 0 });
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-xl border border-gray-200"><div className="border-b bg-gray-50 p-4"><h4 className="font-semibold">Perbandingan Grade Distribution</h4><p className="mt-1 text-xs text-gray-500">Proporsi dan kuota karyawan awal vs akhir tahun; pembulatan kuota mengikuti tabel setting per Division.</p>{!unit.beginningGrades && <p className="mt-2 text-xs text-amber-800">Data lama belum memiliki snapshot proporsi awal. Perbandingan sementara menggunakan proporsi yang tersimpan saat ini.</p>}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[#1A284F] text-white"><tr>{["Grade", "Proporsi", "Kuota Awal", "Kuota Akhir", "Selisih Karyawan"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{gradeRows.map((item) => <tr key={item.id} className="border-t"><td className="p-4 font-semibold">{item.label}</td><td className="p-4">{item.beforePercent}%</td><td className="p-4">{item.beforeCount}</td><td className="p-4">{item.afterCount}</td><td className={`p-4 font-semibold ${deltaColor(item.afterCount - item.beforeCount)}`}>{signed(item.afterCount - item.beforeCount)}</td></tr>)}</tbody><tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]"><tr><th scope="row" className="p-4 text-left">Total</th><td className="p-4">{gradeTotals.proportion.toFixed(1)}%</td><td className="p-4">{gradeTotals.before}</td><td className="p-4">{gradeTotals.after}</td><td className={`p-4 ${deltaColor(gradeTotals.after - gradeTotals.before)}`}>{signed(gradeTotals.after - gradeTotals.before)}</td></tr></tfoot></table></div></section>
    <section className="overflow-hidden rounded-xl border border-gray-200"><div className="space-y-4 border-b bg-gray-50 p-4"><div><h4 className="font-semibold">Perbandingan Share Quota</h4><p className="mt-1 text-xs text-gray-500">Share quota mengikuti perhitungan hierarki setting. Selisih share adalah share akhir dikurangi share awal, ditampilkan dengan tanda %.</p></div><div className="flex flex-wrap gap-3">
      <label className="text-xs text-gray-600">Level<select value={level} onChange={(event) => setLevel(event.target.value)} className="mt-1 block rounded-lg border bg-white px-3 py-2 text-sm"><option value="division">Division</option><option value="department">Departemen</option><option value="bagian">Bagian</option></select></label>
    </div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[#1A284F] text-white"><tr>{["Organisasi", "HC Awal", "HC Akhir", "Selisih HC", "Perubahan (%)", "Share Quota Awal", "Share Quota Akhir", "Selisih Share (%)"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 text-left">{label}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.id} className="border-t"><td className="p-4 font-medium">{item.label}</td><td className="p-4">{initialHC(item.id)}</td><td className="p-4">{item.hc}</td><td className={`p-4 font-semibold ${deltaColor(item.hc - initialHC(item.id))}`}>{signed(item.hc - initialHC(item.id))}</td><td className={`p-4 font-semibold ${deltaColor(item.hc - initialHC(item.id))}`}>{headcountPercentageChange(initialHC(item.id), item.hc)}</td><td className="p-4">{beforeShares[item.id].toFixed(1)}%</td><td className="p-4">{afterShares[item.id].toFixed(1)}%</td><td className={`p-4 font-semibold ${deltaColor(afterShares[item.id] - beforeShares[item.id])}`}>{signed(afterShares[item.id] - beforeShares[item.id], 1)}%</td></tr>)}{!rows.length && <tr><td colSpan={8} className="p-6 text-center text-gray-500">Tidak ada organisasi sesuai filter.</td></tr>}</tbody><tfoot className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-[#1A284F]"><tr><th scope="row" className="p-4 text-left">Total</th><td className="p-4">{quotaTotals.before}</td><td className="p-4">{quotaTotals.after}</td><td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>{signed(quotaTotals.after - quotaTotals.before)}</td><td className={`p-4 ${deltaColor(quotaTotals.after - quotaTotals.before)}`}>{headcountPercentageChange(quotaTotals.before, quotaTotals.after)}</td><td className="p-4">{quotaTotals.beforeShare.toFixed(1)}%</td><td className="p-4">{quotaTotals.afterShare.toFixed(1)}%</td><td className={`p-4 ${deltaColor(quotaTotals.afterShare - quotaTotals.beforeShare)}`}>{signed(quotaTotals.afterShare - quotaTotals.beforeShare, 1)}%</td></tr></tfoot></table></div></section>
  </div>;
}

function HeadcountSummary({ unit }: { unit: CompanyUnit }) {
  const baseline = unit.beginningHC;
  const initialTotal = unit.divisionProportions.reduce((total, item) => total + (baseline?.[item.id] ?? item.hc), 0);
  const finalTotal = unit.divisionProportions.reduce((total, item) => total + item.hc, 0);
  const difference = finalTotal - initialTotal;
  const differenceColor = difference > 0 ? "text-green-700" : difference < 0 ? "text-red-700" : "text-gray-500";
  const cards = [
    { label: "HC Awal Tahun", value: initialTotal },
    { label: "HC Akhir Tahun", value: baseline ? finalTotal : "Belum di-setting" },
    { label: "Selisih HC", value: baseline ? (difference > 0 ? "+" : "") + difference : "—", color: baseline ? differenceColor : undefined },
    { label: "% Perubahan", value: baseline ? headcountPercentageChange(initialTotal, finalTotal) : "—", color: baseline ? differenceColor : undefined },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className={"mt-2 text-xl font-bold " + (card.color ?? "text-[#1A284F]")}>{card.value}</p>
            </div>
          ))}
        </div>
        <CalibrationSummaryComparison unit={unit} />
        {!baseline && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">HC akhir tahun belum di-setting. Perbandingan akan tersedia setelah HC akhir tahun disimpan.</p>}
      </div>
    </section>
  );
}

function YearEndCalibrationSettings({ unit, onUpdate }: { unit: CompanyUnit; onUpdate: (unit: CompanyUnit) => void }) {
  const makeDraft = () => ({ ...unit, beginningHC: undefined });
  const [draft, setDraft] = useState<CompanyUnit>(makeDraft);
  const [mode, setMode] = useState<PageMode>(unit.yearEndStatus ?? "edit");
  const [confirm, setConfirm] = useState(false);
  const [savedDraft, setSavedDraft] = useState<CompanyUnit>(makeDraft);
  const baselineTotal = unit.divisionProportions.reduce((total, item) => total + (unit.beginningHC?.[item.id] ?? item.hc), 0);
  function persist(status: PageMode) {
    const entries = [...draft.divisionProportions, ...draft.departemenenProportions, ...draft.bagianProportions];
    if (entries.some((item) => !Number.isSafeInteger(item.hc) || item.hc < 0)) {
      toast.error("HC wajib berupa bilangan bulat minimal 0.");
      return false;
    }
    onUpdate({ ...draft, beginningGrades: unit.beginningGrades ?? (unit.beginningHC ? undefined : unit.calibrationGrades.map((grade) => ({ ...grade }))), beginningHC: unit.beginningHC ?? Object.fromEntries([...unit.divisionProportions, ...unit.departemenenProportions, ...unit.bagianProportions].map((item) => [item.id, item.hc])), yearEndUpdatedAt: new Date().toISOString(), yearEndStatus: status });
    setSavedDraft(draft);
    toast.success(status === "submitted" ? "HC akhir tahun disubmit untuk Approval Management." : "HC akhir tahun tersimpan; HC awal tetap dipertahankan.");
    return true;
  }
  if (!unit.beginningHC && baselineTotal === 0) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Lengkapi dan simpan HC Awal Tahun terlebih dahulu sebelum mengatur HC Akhir Tahun.</p>;
  return <>
    <p className="text-sm font-medium text-gray-500">HC Akhir Tahun · 2026 — format tabel dan alur sama dengan HC Awal Tahun. Baseline awal tidak berubah.</p>
    <UnitDetail unit={draft} onBack={() => {}} onUpdate={setDraft} pageMode={mode} setPageMode={setMode} onShowConfirm={() => setConfirm(true)} embedded onSave={() => persist("edit")} onCancelEdit={() => setDraft(savedDraft)} />
    {confirm && <SubmitConfirmModal onCancel={() => setConfirm(false)} onConfirm={() => { if (persist("submitted")) { setConfirm(false); setMode("submitted"); } }} />}
  </>;
}

function UnitDetail({ unit, onBack, onUpdate, pageMode, setPageMode, onShowConfirm, embedded = false, onSave, onCancelEdit }: {
  unit: CompanyUnit; onBack: () => void; onUpdate: (u: CompanyUnit) => void;
  pageMode: PageMode; setPageMode: (m: PageMode) => void; onShowConfirm: () => void;
  embedded?: boolean; onSave?: () => boolean; onCancelEdit?: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [hcTab, setHcTab] = useState("start");
  const [isSaved, setIsSaved] = useState(false);
  const isEditable = pageMode === "edit" && editMode && !unit.beginningHC;
  const canSubmit = isSaved || pageMode === "preview";
  const upd = (patch: Partial<CompanyUnit>) => onUpdate({ ...unit, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        {!embedded && <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>}
        <div className="flex items-center gap-2">
          {hcTab === "start" && !unit.beginningHC && pageMode === "edit" && (
            <>
              <button
                type="button"
                onClick={() => {
                  const synced = applyImportedEmployeesDistribution(unit);
                  onUpdate(synced);
                  toast.success(`Data karyawan terimpor pada ${unit.name} berhasil didistribusikan ke Divisi, Departement, dan Bagian.`);
                }}
                className="flex items-center gap-2 px-3.5 py-2.5 border border-blue-200 bg-blue-50 text-[#1A284F] rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
                title="Hitung otomatis HC & distribusi kuota Grade per Divisi, Departement, dan Bagian dari data karyawan yang diimpor"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Sync dari Data Karyawan
              </button>
              {editMode && (
                <button onClick={() => { onCancelEdit?.(); setEditMode(false); }}
                  className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  if (editMode) { if (onSave && !onSave()) return; setEditMode(false); setIsSaved(true); }
                  else { setIsSaved(false); setEditMode(true); }
                }}
                className="flex items-center gap-2 bg-[#1A284F] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm">
                {editMode ? <><Save className="w-4 h-4" />Save Changes</> : <><Edit2 className="w-4 h-4" />Edit Settings</>}
              </button>
              <button onClick={() => setPageMode("preview")}
                className="flex items-center gap-2 px-4 py-2.5 border border-[#1A284F] text-[#1A284F] rounded-xl text-sm font-medium hover:bg-[#1A284F]/5 transition-colors">
                <Eye className="w-4 h-4" />Preview
              </button>
              <button
                disabled={!canSubmit}
                onClick={canSubmit ? onShowConfirm : undefined}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm ${
                  canSubmit ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}>
                <Send className="w-4 h-4" />Submit
              </button>
            </>
          )}
          {hcTab === "start" && !unit.beginningHC && pageMode === "preview" && (
            <>
              <button onClick={() => setPageMode("edit")}
                className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                <Edit2 className="w-4 h-4" />Back to Edit
              </button>
              <button onClick={onShowConfirm}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                <Send className="w-4 h-4" />Submit
              </button>
            </>
          )}
        </div>
      </div>

      {!embedded && <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-[#1A284F]/10 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-[#1A284F]" />
        </div>
        <div>
          <p className="font-bold text-gray-900">{unit.name}</p>
          <p className="text-sm text-gray-500">
            {unit.industry}{unit.industry ? " · " : ""}
            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{unit.code}</span>
          </p>
        </div>
      </div>}

      {pageMode === "submitted" && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Calibration setting has been submitted and is <strong>Pending Approval Management</strong>. Editing is disabled until the approval is completed.
          </p>
        </div>
      )}

      <Tabs.Root value={hcTab} onValueChange={setHcTab} className="space-y-6">
        {!embedded && <Tabs.List aria-label="Pengaturan Headcount" className="flex flex-wrap gap-1 border-b border-gray-200">
          {[["start", "HC Awal Tahun"], ["end", "HC Akhir Tahun"], ["summary", "Summary HC"]].map(([value, label]) => <Tabs.Trigger key={value} value={value} className="border-b-2 border-transparent px-5 py-3 text-sm font-medium text-gray-500 transition-colors hover:text-[#1A284F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 data-[state=active]:border-[#1A284F] data-[state=active]:text-[#1A284F]">{label}</Tabs.Trigger>)}
        </Tabs.List>}
        <Tabs.Content value="start" className="space-y-6">
      {!embedded && <p className="text-sm font-medium text-gray-500">{unit.beginningHC ? "HC Awal Tahun — baseline tersimpan dan read-only; perubahan HC akhir tidak menimpa data ini." : "Setting HC Awal Tahun — klik Edit Settings untuk mengisi HC baseline."}</p>}
      <CalibrationPanel
        calibrationGrades={unit.beginningHC ? unit.beginningGrades ?? unit.calibrationGrades : unit.calibrationGrades}
        divisionProportions={unit.divisionProportions.map((item) => ({ ...item, hc: unit.beginningHC?.[item.id] ?? item.hc }))}
        departemenenProportions={unit.departemenenProportions.map((item) => ({ ...item, hc: unit.beginningHC?.[item.id] ?? item.hc }))}
        bagianProportions={unit.bagianProportions.map((item) => ({ ...item, hc: unit.beginningHC?.[item.id] ?? item.hc }))}
        editMode={isEditable}
        onUpdateCalibrationGrade={(id, field, value) => upd({ calibrationGrades: unit.calibrationGrades.map(g => g.id === id ? { ...g, [field]: value } : g) })}
        onUpdateDivisionProportion={(divId, _field, value) => {
          const newHC = Number(value);
          const updDivisions = unit.divisionProportions.map(d => d.id === divId ? { ...d, hc: newHC } : d);
          // Equal-distribute to departments in this division
          const deptsInDiv = unit.departemenenProportions.filter(d => d.divisiId === divId);
          const eachDeptHC = deptsInDiv.length > 0 ? Math.floor(newHC / deptsInDiv.length) : 0;
          const updDepts = unit.departemenenProportions.map(d =>
            d.divisiId === divId ? { ...d, hc: eachDeptHC } : d
          );
          // Equal-distribute to bagian within each affected department
          const updBagian = unit.bagianProportions.map(b => {
            const dept = updDepts.find(d => d.id === b.departemenenId);
            if (!dept || dept.divisiId !== divId) return b;
            const bagiansInDept = unit.bagianProportions.filter(x => x.departemenenId === dept.id);
            const eachBagianHC = bagiansInDept.length > 0 ? Math.floor(eachDeptHC / bagiansInDept.length) : 0;
            return { ...b, hc: eachBagianHC };
          });
          upd({ divisionProportions: updDivisions, departemenenProportions: updDepts, bagianProportions: updBagian });
        }}
        onUpdateDepartemenenProportion={(deptId, _field, value) => {
          const dept = unit.departemenenProportions.find(d => d.id === deptId)!;
          const parentDiv = unit.divisionProportions.find(d => d.id === dept?.divisiId);
          const maxHC = parentDiv?.hc ?? Infinity;
          const newHC = Math.min(Number(value), maxHC);
          const updDepts = unit.departemenenProportions.map(d => d.id === deptId ? { ...d, hc: newHC } : d);
          // Equal-distribute to bagian in this department
          const bagiansInDept = unit.bagianProportions.filter(b => b.departemenenId === deptId);
          const eachBagianHC = bagiansInDept.length > 0 ? Math.floor(newHC / bagiansInDept.length) : 0;
          const updBagian = unit.bagianProportions.map(b =>
            b.departemenenId === deptId ? { ...b, hc: eachBagianHC } : b
          );
          upd({ departemenenProportions: updDepts, bagianProportions: updBagian });
        }}
        onUpdateBagianProportion={(bagianId, _field, value) => {
          const bagian = unit.bagianProportions.find(b => b.id === bagianId)!;
          const parentDept = unit.departemenenProportions.find(d => d.id === bagian?.departemenenId);
          const maxHC = parentDept?.hc ?? Infinity;
          const newHC = Math.min(Number(value), maxHC);
          upd({ bagianProportions: unit.bagianProportions.map(b => b.id === bagianId ? { ...b, hc: newHC } : b) });
        }}
      />
        </Tabs.Content>
        {!embedded && <Tabs.Content value="end"><YearEndCalibrationSettings unit={unit} onUpdate={onUpdate} /></Tabs.Content>}
        {!embedded && <Tabs.Content value="summary"><HeadcountSummary unit={unit} /></Tabs.Content>}
      </Tabs.Root>
    </div>
  );
}

// ─── Submit Confirmation Modal ────────────────────────────────────────────────

function SubmitConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Submit Calibration Setting</h3>
              <p className="text-xs text-gray-500 mt-0.5">This will send for Approval Management review</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          Once submitted, you will not be able to edit the calibration settings until the approval is completed.
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <CheckCircle2 className="w-4 h-4" />Confirm Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CalibrationSetting() {
  const { lockedUnits: authLockedUnits } = useAuthStore();
  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(() => {
    try {
      const saved = localStorage.getItem("calibration_hc_settings_2026") ?? localStorage.getItem("calibration_submitted_units");
      const base: CompanyUnit[] = saved ? JSON.parse(saved) : defaultCompanyUnits;
      return base.map((u) => applyImportedEmployeesDistribution(u));
    } catch {
      return defaultCompanyUnits.map((u) => applyImportedEmployeesDistribution(u));
    }
  });
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);
  const [pageMode, setPageMode] = useState<PageMode>("edit");
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const onHydrated = () => {
      const saved = loadPersistedState<CompanyUnit[] | null>("calibration_hc_settings_2026", null)
        ?? loadPersistedState<CompanyUnit[] | null>("calibration_submitted_units", null);
      if (Array.isArray(saved) && saved.length > 0) {
        setCompanyUnits(saved.map((u) => applyImportedEmployeesDistribution(u)));
      }
    };
    const onEmployeesImported = () => {
      setCompanyUnits((prev) => {
        const next = prev.map((u) => applyImportedEmployeesDistribution(u));
        savePersistedState("calibration_hc_settings_2026", next);
        return next;
      });
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    window.addEventListener("pa-employees-imported", onEmployeesImported);
    window.addEventListener("pa-auth-updated", onEmployeesImported);
    return () => {
      window.removeEventListener("pa-db-hydrated", onHydrated);
      window.removeEventListener("pa-employees-imported", onEmployeesImported);
      window.removeEventListener("pa-auth-updated", onEmployeesImported);
    };
  }, []);

  const updateUnit = (updated: CompanyUnit) => {
    const next = companyUnits.map((unit) => unit.id === updated.id ? updated : unit);
    try {
      savePersistedState("calibration_hc_settings_2026", next, {
        kind: "calibration-setting",
        unitId: updated.id,
        unitName: updated.name,
        data: updated,
        audit: {
          action: "Update",
          module: "Performance Appraisal",
          subModule: "Calibration Setting",
          description: `Updated Calibration HC & Grade setting for ${updated.name}`,
        },
      });
      if (localStorage.getItem("calibration_submitted_units")) {
        savePersistedState("calibration_submitted_units", next);
      }
      setCompanyUnits(next);
    } catch { toast.error("Pengaturan HC gagal disimpan. Periksa penyimpanan browser."); }
  };

  const handleSubmitConfirm = () => {
    setShowConfirm(false);
    setPageMode("submitted");
    setSelectedUnit(null);
    try {
      const submittedAt = new Date().toISOString();
      savePersistedState("calibration_submitted_units", companyUnits, {
        kind: "calibration-setting",
        unitId: selectedUnit?.id ?? "all",
        unitName: selectedUnit?.name ?? "All Units",
        data: { submittedAt, units: companyUnits },
        audit: {
          action: "Create",
          module: "Performance Appraisal",
          subModule: "Calibration Setting",
          description: `Submitted Calibration Setting (${selectedUnit?.name ?? "All Units"}) for Approval Management`,
        },
      });
      savePersistedState("calibration_submitted_at", submittedAt);
    } catch {}
  };

  if (selectedUnit) {
    const liveUnit = companyUnits.find(u => u.id === selectedUnit.id) ?? selectedUnit;
    return (
      <>
        {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
        <div className="w-full flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
            <p className="text-sm text-gray-500">Configure performance calibration settings by company unit</p>
          </div>
          <div className="border-b border-gray-200">
            <div className="flex gap-1">
              <button onClick={() => setSelectedUnit(null)}
                className="px-6 py-3 text-sm font-medium border-b-2 border-[#1A284F] text-[#1A284F]">
                Company Units
              </button>
            </div>
          </div>
          <UnitDetail
            unit={liveUnit}
            onBack={() => setSelectedUnit(null)}
            onUpdate={updateUnit}
            pageMode={pageMode}
            setPageMode={setPageMode}
            onShowConfirm={() => setShowConfirm(true)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showConfirm && <SubmitConfirmModal onConfirm={handleSubmitConfirm} onCancel={() => setShowConfirm(false)} />}
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration — Setting</h2>
          <p className="text-sm text-gray-500">Configure performance calibration settings by company unit</p>
        </div>

        <div className="border-b border-gray-200">
          <div className="flex gap-1">
            <button className="px-6 py-3 text-sm font-medium border-b-2 border-[#1A284F] text-[#1A284F]">
              Company Units
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            {pageMode === "edit"
              ? "Select a company unit to configure its Calibration settings."
              : "Select a company unit to review its Calibration settings."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {(authLockedUnits && authLockedUnits.length > 0
              ? companyUnits.filter((u) => authLockedUnits.includes(u.name))
              : companyUnits
            ).map((unit, idx) => {
              const gradients = ["from-blue-600 to-blue-800","from-emerald-600 to-emerald-800","from-violet-600 to-violet-800","from-amber-500 to-orange-700","from-sky-500 to-cyan-700","from-rose-500 to-red-700","from-teal-500 to-teal-700","from-indigo-500 to-indigo-700"];
              const gradient = gradients[idx % gradients.length];
              return (
                <button key={unit.id} onClick={() => setSelectedUnit(unit)}
                  className="group text-left rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                  <div className={`bg-gradient-to-br ${gradient} px-5 py-4`}>
                    <Building2 className="w-5 h-5 text-white/80 mb-2" />
                    <p className="text-white font-semibold text-sm leading-tight">{unit.name}</p>
                  </div>
                  <div className="bg-white px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{unit.industry}</p>
                      <span className="inline-block mt-0.5 font-mono text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{unit.code}</span>
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        <Users className="w-2.5 h-2.5" />
                        HC: {unit.divisionProportions.reduce((s, d) => s + d.hc, 0)}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
import { useAuthStore } from "../../store/authStore";
