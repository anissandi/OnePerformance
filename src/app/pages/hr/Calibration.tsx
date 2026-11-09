import { useState } from "react";
import { Save, Edit2, Building2, ChevronRight, ArrowLeft } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScoreRange = {
  id: string; min: number; max: number; grade: string; label: string; color: string;
};

type KPIWeight = {
  id: string; indikator: string; operasional: string;
  pengawasKepalaBagian: string; kepalaDepartement: string; kepalaDivisi: string;
};

type CalibrationGrade = { id: string; grade: string; proporsi: string; };

type DivisionProportion  = { id: string; divisi: string;     hc: number; };
type DepartemenenProportion = { id: string; divisiId: string; departemen: string; hc: number; };
type BagianProportion    = { id: string; departemenenId: string; bagian: string; hc: number; };

type CompanyUnit = {
  id: string; name: string; code: string; industry: string;
  scores: ScoreRange[];
  kpiWeights: KPIWeight[];
  calibrationGrades: CalibrationGrade[];
  divisionProportions: DivisionProportion[];
  departemenenProportions: DepartemenenProportion[];
  bagianProportions: BagianProportion[];
};

// ─── Default data factories ───────────────────────────────────────────────────

const makeDefaultScores = (): ScoreRange[] => [
  { id: "1", min: 90, max: 100, grade: "A+", label: "Outstanding",    color: "#10B981" },
  { id: "2", min: 80, max: 89,  grade: "A",  label: "Good",           color: "#3B82F6" },
  { id: "3", min: 70, max: 79,  grade: "B",  label: "Average",        color: "#F59E0B" },
  { id: "4", min: 60, max: 69,  grade: "C",  label: "Below Average",  color: "#EF4444" },
  { id: "5", min: 50, max: 59,  grade: "D",  label: "Unsatisfactory", color: "#DC2626" },
  { id: "6", min: 0,  max: 49,  grade: "E",  label: "Fail",           color: "#991B1B" },
];

const makeDefaultKPIWeights = (): KPIWeight[] => [
  { id: "1", indikator: "KPI",                       operasional: "50%", pengawasKepalaBagian: "40%", kepalaDepartement: "40%", kepalaDivisi: "40%" },
  { id: "2", indikator: "SMART Goals",               operasional: "20%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "3", indikator: "Appraisal Form",            operasional: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "4", indikator: "Project Outside Job Scope", operasional: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "10%", kepalaDivisi: "10%" },
  { id: "5", indikator: "Managerial Skill",          operasional: "-",   pengawasKepalaBagian: "15%", kepalaDepartement: "20%", kepalaDivisi: "20%" },
  { id: "6", indikator: "Management Interview",      operasional: "-",   pengawasKepalaBagian: "-",   kepalaDepartement: "-",   kepalaDivisi: "10%" },
];

const makeDefaultCalibrationGrades = (): CalibrationGrade[] => [
  { id: "1", grade: "A+", proporsi: "5%"  },
  { id: "2", grade: "A",  proporsi: "15%" },
  { id: "3", grade: "B",  proporsi: "40%" },
  { id: "4", grade: "C",  proporsi: "25%" },
  { id: "5", grade: "D",  proporsi: "10%" },
  { id: "6", grade: "E",  proporsi: "5%"  },
];

// Division list is shared across all units
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

// Department definitions: [ divisiId, departemen ]
const DEPT_DEFS: [string, string, string][] = [
  ["dep1",  "div1", "Sumber Daya Manusia"],
  ["dep2",  "div1", "Umum & Administrasi"],
  ["dep3",  "div2", "Legal & Compliance"],
  ["dep4",  "div2", "Teknologi Informasi"],
  ["dep5",  "div3", "Keuangan"],
  ["dep6",  "div3", "Akuntansi"],
  ["dep7",  "div3", "Pajak & Audit"],
  ["dep8",  "div4", "Warehouse & Inventory"],
  ["dep9",  "div4", "Purchasing"],
  ["dep10", "div5", "Quality Control"],
  ["dep11", "div5", "Quality Assurance"],
  ["dep12", "div6", "Produksi Kelapa A"],
  ["dep13", "div6", "Produksi Kelapa B"],
  ["dep14", "div7", "Produksi Nanas"],
  ["dep15", "div8", "Maintenance"],
  ["dep16", "div8", "Utilitas & Energi"],
];

// definitions: [ bagianId, departemenenId, bagian ]
const BAGIAN_DEFS: [string, string, string][] = [
  ["bag1",  "dep1",  "Rekrutmen & Seleksi"],
  ["bag2",  "dep1",  "Pengembangan SDM"],
  ["bag3",  "dep2",  "Administrasi Umum"],
  ["bag4",  "dep2",  "Kearsipan"],
  ["bag5",  "dep3",  "Legal"],
  ["bag6",  "dep3",  "Kepatuhan"],
  ["bag7",  "dep4",  "Infrastruktur IT"],
  ["bag8",  "dep4",  "Pengembangan Sistem"],
  ["bag9",  "dep5",  "Treasury"],
  ["bag10", "dep5",  "Anggaran"],
  ["bag11", "dep6",  "Akuntansi Biaya"],
  ["bag12", "dep6",  "Akuntansi Umum"],
  ["bag13", "dep7",  "Pajak"],
  ["bag14", "dep7",  "Internal Audit"],
  ["bag15", "dep8",  "Warehouse"],
  ["bag16", "dep8",  "Inventory Control"],
  ["bag17", "dep9",  "Pengadaan Lokal"],
  ["bag18", "dep9",  "Pengadaan Import"],
  ["bag19", "dep10", "Inspeksi QC"],
  ["bag20", "dep10", "Laboratorium"],
  ["bag21", "dep11", "Sistem Manajemen Mutu"],
  ["bag22", "dep11", "Dokumentasi QA"],
  ["bag23", "dep12", "Proses Kelapa A"],
  ["bag24", "dep12", "Packing Kelapa A"],
  ["bag25", "dep13", "Proses Kelapa B"],
  ["bag26", "dep13", "Packing Kelapa B"],
  ["bag27", "dep14", "Proses Nanas"],
  ["bag28", "dep14", "Packing Nanas"],
  ["bag29", "dep15", "Mechanical"],
  ["bag30", "dep15", "Electrical"],
  ["bag31", "dep16", "Utilitas"],
  ["bag32", "dep16", "Energi & Environment"],
];

const makeDefaultDivisionProportions = (): DivisionProportion[] =>
  DIV_DEFS.map(d => ({ id: d.id, divisi: d.divisi, hc: 0 }));

const makeDefaultDepartemenenProportions = (): DepartemenenProportion[] =>
  DEPT_DEFS.map(([id, divisiId, departemen]) => ({ id, divisiId, departemen, hc: 0 }));

const makeDefaultBagianProportions = (): BagianProportion[] =>
  BAGIAN_DEFS.map(([id, departemenenId, bagian]) => ({ id, departemenenId, bagian, hc: 0 }));

const makeUnit = (id: string, name: string, code: string, industry: string): CompanyUnit => ({
  id, name, code, industry,
  scores: makeDefaultScores(),
  kpiWeights: makeDefaultKPIWeights(),
  calibrationGrades: makeDefaultCalibrationGrades(),
  divisionProportions: makeDefaultDivisionProportions(),
  departemenenProportions: makeDefaultDepartemenenProportions(),
  bagianProportions: makeDefaultBagianProportions(),
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

// ─── Shared helpers ───────────────────────────────────────────────────────────

function gradeCalcs(hc: number, calibrationGrades: CalibrationGrade[]) {
  return calibrationGrades.map(g => hc > 0 ? Math.round(hc * (parseFloat(g.proporsi) || 0) / 100) : 0);
}

// ─── Score sub-panel ──────────────────────────────────────────────────────────


// ─── Calibration sub-panel ────────────────────────────────────────────────────

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
  onUpdateCalibrationGrade: (id: string, field: keyof CalibrationGrade, value: string | number) => void;
  onUpdateDivisionProportion: (id: string, field: keyof DivisionProportion, value: string | number) => void;
  onUpdateDepartemenenProportion: (id: string, field: keyof DepartemenenProportion, value: string | number) => void;
  onUpdateBagianProportion: (id: string, field: keyof BagianProportion, value: string | number) => void;
}) {
  const safeDivisions: DivisionProportion[]       = divisionProportions     ?? [];
  const safeDepts: DepartemenenProportion[]        = departemenenProportions ?? [];
  const safeBagian: BagianProportion[]             = bagianProportions       ?? [];

  const totalDivHC = safeDivisions.reduce((s, d) => s + d.hc, 0);

  // Division share kuota map: divId → shareKuota (0–100)
  const divShareMap: Record<string, number> = {};
  safeDivisions.forEach(d => {
    divShareMap[d.id] = totalDivHC > 0 ? (d.hc / totalDivHC) * 100 : 0;
  });

  // Departemen share kuota: derived from parent division share kuota
  const deptShareMap: Record<string, number> = {};
  safeDepts.forEach(dept => {
    const siblingHC = safeDepts.filter(d => d.divisiId === dept.divisiId).reduce((s, d) => s + d.hc, 0);
    const divShare = divShareMap[dept.divisiId] ?? 0;
    deptShareMap[dept.id] = siblingHC > 0 ? (dept.hc / siblingHC) * divShare : 0;
  });

  // share kuota: derived from parent departemen share kuota
  const bagianShareMap: Record<string, number> = {};
  safeBagian.forEach(b => {
    const siblingHC = safeBagian.filter(x => x.departemenenId === b.departemenenId).reduce((s, x) => s + x.hc, 0);
    const deptShare = deptShareMap[b.departemenenId] ?? 0;
    bagianShareMap[b.id] = siblingHC > 0 ? (b.hc / siblingHC) * deptShare : 0;
  });

  const fmtShare = (v: number) => v > 0 ? `${v.toFixed(1)}%` : "";

  const gradeHeaders = calibrationGrades.map(g => g.grade);

  // ── Grade Distribution table ──────────────────────────────────────────────
  return (
    <>
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
                      <span className="text-gray-900">{karyawan > 0 ? karyawan.toLocaleString() : ""}</span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[#1A284F] text-white font-semibold">
                <td className="border border-gray-300 px-4 py-3 text-center">JUMLAH</td>
                <td className="border border-gray-300 px-4 py-3 text-center">100%</td>
                <td className="border border-gray-300 px-4 py-3 text-center">
                  {(() => {
                    const t = calibrationGrades.reduce((s, _, idx) =>
                      s + safeDivisions.reduce((ss, d) =>
                        ss + (d.hc > 0 ? Math.round(d.hc * (parseFloat(calibrationGrades[idx]?.proporsi) || 0) / 100) : 0), 0), 0);
                    return t > 0 ? t.toLocaleString() : "";
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Proportion per Division ────────────────────────────────────────── */}
      <ProportionTable
        title="Proportion per Division"
        subtitle="Grade distribution targets per division"
        rows={safeDivisions.map(d => ({
          id: d.id,
          label: d.divisi,
          hc: d.hc,
          shareKuota: fmtShare(divShareMap[d.id] ?? 0),
          calcs: gradeCalcs(d.hc, calibrationGrades),
        }))}
        totalHC={totalDivHC}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateDivisionProportion(id, "hc", val)}
      />

      {/* ── Proportion per Departemen ─────────────────────────────────────── */}
      <ProportionTable
        title="Proportion per Departemen"
        subtitle="Share Kuota derived from Proportion per Division"
        rows={safeDepts.map(dept => {
          const parentDiv = safeDivisions.find(d => d.id === dept.divisiId);
          return {
            id: dept.id,
            label: dept.departemen,
            parentLabel: parentDiv?.divisi,
            hc: dept.hc,
            shareKuota: fmtShare(deptShareMap[dept.id] ?? 0),
            calcs: gradeCalcs(dept.hc, calibrationGrades),
          };
        })}
        totalHC={safeDepts.reduce((s, d) => s + d.hc, 0)}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateDepartemenenProportion(id, "hc", val)}
        showParent
        parentHeader="DIVISI"
      />

      {/* ── Proportion per ─────────────────────────────────────────── */}
      <ProportionTable
        title="Proportion per Bagian"
        subtitle="Share Kuota derived from Proportion per Departemen"
        rows={safeBagian.map(b => {
          const parentDept = safeDepts.find(d => d.id === b.departemenenId);
          return {
            id: b.id,
            label: b.bagian,
            parentLabel: parentDept?.departemen,
            hc: b.hc,
            shareKuota: fmtShare(bagianShareMap[b.id] ?? 0),
            calcs: gradeCalcs(b.hc, calibrationGrades),
          };
        })}
        totalHC={safeBagian.reduce((s, b) => s + b.hc, 0)}
        calibrationGrades={calibrationGrades}
        gradeHeaders={gradeHeaders}
        editMode={editMode}
        onUpdateHC={(id, val) => onUpdateBagianProportion(id, "hc", val)}
        showParent
        parentHeader="DEPARTEMEN"
      />
    </>
  );
}

// ─── Reusable proportion table ────────────────────────────────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  hc: number;
  shareKuota: string;
  calcs: number[];
};

function ProportionTable({
  title, subtitle, rows, totalHC, calibrationGrades, gradeHeaders,
  editMode, onUpdateHC, showParent, parentHeader,
}: {
  title: string; subtitle: string;
  rows: PropRow[];
  totalHC: number;
  calibrationGrades: CalibrationGrade[];
  gradeHeaders: string[];
  editMode: boolean;
  onUpdateHC: (id: string, val: number) => void;
  showParent?: boolean;
  parentHeader?: string;
}) {
  // Footer totals per grade column
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
                  {showParent && (
                    <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-500 whitespace-nowrap">{row.parentLabel ?? "—"}</td>
                  )}
                  <td className="border border-gray-300 px-3 py-2.5 text-gray-900">{row.label}</td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center">
                    {editMode
                      ? <input type="number" value={row.hc || ""}
                          onChange={e => onUpdateHC(row.id, Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center" />
                      : <span className="text-gray-900">{row.hc > 0 ? row.hc.toLocaleString() : ""}</span>}
                  </td>
                  <td className="border border-gray-300 px-3 py-2.5 text-center bg-gray-50">
                    <span className="text-gray-700 font-medium">{row.shareKuota}</span>
                  </td>
                  {row.calcs.map((v, i) => (
                    <td key={i} className="border border-gray-300 px-3 py-2.5 text-center bg-gray-50">
                      <span className="text-gray-900">{v > 0 ? v : ""}</span>
                    </td>
                  ))}
                  <td className="border border-gray-300 px-3 py-2.5 text-center font-medium text-gray-900">
                    {rowTotal > 0 ? rowTotal.toLocaleString() : ""}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-[#1A284F] text-white font-semibold">
              {showParent && <td className="border border-gray-300 px-3 py-3 text-center">—</td>}
              <td className="border border-gray-300 px-3 py-3 text-center">JUMLAH</td>
              <td className="border border-gray-300 px-3 py-3 text-center">{totalHC > 0 ? totalHC.toLocaleString() : ""}</td>
              <td className="border border-gray-300 px-3 py-3 text-center">100%</td>
              {gradeTotals.map((t, i) => (
                <td key={i} className="border border-gray-300 px-3 py-3 text-center">{t > 0 ? t.toLocaleString() : ""}</td>
              ))}
              <td className="border border-gray-300 px-3 py-3 text-center">{grandTotal > 0 ? grandTotal.toLocaleString() : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Unit detail view ─────────────────────────────────────────────────────────

function UnitDetail({ unit, onBack, onUpdate }: {
  unit: CompanyUnit; onBack: () => void; onUpdate: (u: CompanyUnit) => void;
}) {
  const [editMode, setEditMode] = useState(false);

  const upd = (patch: Partial<CompanyUnit>) => onUpdate({ ...unit, ...patch });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-[#1A284F] transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Company Units
        </button>
        <div className="flex gap-2">
          {editMode && (
            <button onClick={() => setEditMode(false)}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          )}
          <button onClick={editMode ? () => setEditMode(false) : () => setEditMode(true)}
            className="flex items-center gap-2 bg-[#1A284F] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#131d3b] transition-colors shadow-sm">
            {editMode ? <><Save className="w-4 h-4" />Save Changes</> : <><Edit2 className="w-4 h-4" />Edit Settings</>}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-6 py-4 shadow-sm">
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
      </div>

      <CalibrationPanel
        calibrationGrades={unit.calibrationGrades}
        divisionProportions={unit.divisionProportions}
        departemenenProportions={unit.departemenenProportions}
        bagianProportions={unit.bagianProportions}
        editMode={editMode}
        onUpdateCalibrationGrade={(id, field, value) => upd({ calibrationGrades: unit.calibrationGrades.map(g => g.id === id ? { ...g, [field]: value } : g) })}
        onUpdateDivisionProportion={(id, field, value) => upd({ divisionProportions: unit.divisionProportions.map(d => d.id === id ? { ...d, [field]: value } : d) })}
        onUpdateDepartemenenProportion={(id, field, value) => upd({ departemenenProportions: unit.departemenenProportions.map(d => d.id === id ? { ...d, [field]: value } : d) })}
        onUpdateBagianProportion={(id, field, value) => upd({ bagianProportions: unit.bagianProportions.map(b => b.id === id ? { ...b, [field]: value } : b) })}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CalibrationPage() {
  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(defaultCompanyUnits);
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);

  const updateUnit = (updated: CompanyUnit) =>
    setCompanyUnits(prev => prev.map(u => u.id === updated.id ? updated : u));

  const TabBar = ({ onTabClick }: { onTabClick?: () => void }) => (
    <div className="border-b border-gray-200">
      <div className="flex gap-1">
        <button onClick={onTabClick}
          className="px-6 py-3 text-sm font-medium border-b-2 border-[#1A284F] text-[#1A284F]">
          Company Units
        </button>
      </div>
    </div>
  );

  if (selectedUnit) {
    const liveUnit = companyUnits.find(u => u.id === selectedUnit.id) ?? selectedUnit;
    return (
      <div className="w-full flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration</h2>
          <p className="text-sm text-gray-500">Manage performance calibration settings by company unit</p>
        </div>
        <TabBar onTabClick={() => setSelectedUnit(null)} />
        <UnitDetail unit={liveUnit} onBack={() => setSelectedUnit(null)} onUpdate={updateUnit} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Calibration</h2>
        <p className="text-sm text-gray-500">Manage performance calibration settings by company unit</p>
      </div>
      <TabBar />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">Select a company unit to configure its Score and Calibration settings independently.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companyUnits.map(unit => (
            <button key={unit.id} onClick={() => setSelectedUnit(unit)}
              className="group flex items-center gap-4 bg-white border border-gray-200 hover:border-[#1A284F] rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition-all text-left">
              <div className="w-11 h-11 rounded-xl bg-[#1A284F]/10 group-hover:bg-[#1A284F]/20 flex items-center justify-center shrink-0 transition-colors">
                <Building2 className="w-5 h-5 text-[#1A284F]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{unit.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{unit.industry}</p>
                <span className="inline-block mt-1 font-mono text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{unit.code}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#1A284F] shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
