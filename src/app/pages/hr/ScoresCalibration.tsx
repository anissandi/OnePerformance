import { useState } from "react";
import { Save, Plus, Trash2, Edit2, Building2, ChevronRight, ArrowLeft } from "lucide-react";
import { saveUnitScoreWeights } from "../shared/scoringWeightStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScoreRange = {
  id: string; min: number; max: number; grade: string; label: string; color: string;
};

type KPIWeight = {
  id: string; indikator: string; operasional: string;
  kaWaKaSeksi: string; pengawasKepalaBagian: string; kepalaDepartement: string; kepalaDivisi: string;
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
  { id: "1", indikator: "KPI",                       operasional: "50%", kaWaKaSeksi: "50%", pengawasKepalaBagian: "40%", kepalaDepartement: "40%", kepalaDivisi: "40%" },
  { id: "2", indikator: "SMART Goals",               operasional: "20%", kaWaKaSeksi: "20%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "3", indikator: "Appraisal Form",            operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "15%", kepalaDivisi: "10%" },
  { id: "4", indikator: "Project Outside Job Scope", operasional: "15%", kaWaKaSeksi: "15%", pengawasKepalaBagian: "15%", kepalaDepartement: "10%", kepalaDivisi: "10%" },
  { id: "5", indikator: "Managerial Skill",          operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "15%", kepalaDepartement: "20%", kepalaDivisi: "20%" },
  { id: "6", indikator: "Inter-Departement Feedback",operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "-",   kepalaDepartement: "-",   kepalaDivisi: "-" },
  { id: "7", indikator: "Management Interview",      operasional: "-",   kaWaKaSeksi: "-",   pengawasKepalaBagian: "-",   kepalaDepartement: "-",   kepalaDivisi: "10%" },
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


// ─── Score sub-panel ──────────────────────────────────────────────────────────

function ScorePanel({
  scores, kpiWeights, editMode,
  onUpdateScore, onAddScore, onDeleteScore, onUpdateKPIWeight,
}: {
  scores: ScoreRange[];
  kpiWeights: KPIWeight[];
  editMode: boolean;
  onUpdateScore: (id: string, field: keyof ScoreRange, value: any) => void;
  onAddScore: () => void;
  onDeleteScore: (id: string) => void;
  onUpdateKPIWeight: (id: string, field: keyof KPIWeight, value: string) => void;
}) {
  return (
    <>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Bobot Penilaian KPI</h3>
          <p className="text-sm text-gray-500 mt-1">KPI assessment weights by position level</p>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">No</th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Indikator</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Operasional</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Ka. / Wa. Ka. Seksi</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Ka. / Wa. Ka. Bagian</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Ka. / Wa. Ka. Dept</th>
                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Ka. / Wa. Ka. Div ke atas</th>
              </tr>
            </thead>
            <tbody>
              {kpiWeights.map((w, idx) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3 text-center font-medium text-gray-900">{idx + 1}</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-900">{w.indikator}</td>
                  {(["operasional", "kaWaKaSeksi", "pengawasKepalaBagian", "kepalaDepartement", "kepalaDivisi"] as const).map(f => (
                    <td key={f} className="border border-gray-300 px-4 py-3 text-center">
                      {editMode
                        ? <input type="text" value={w[f] ?? "-"} onChange={e => onUpdateKPIWeight(w.id, f, e.target.value)}
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 text-center" />
                        : <span className="text-gray-900">{w[f] ?? "-"}</span>}
                    </td>
                  ))}
                </tr>
              ))}
              {(() => {
                const fields = ["operasional", "kaWaKaSeksi", "pengawasKepalaBagian", "kepalaDepartement", "kepalaDivisi"] as const;
                const totals = fields.map(f =>
                  kpiWeights.reduce((sum, w) => {
                    const val = w[f] ?? "-";
                    const num = parseFloat(val.replace("%", "").trim());
                    return sum + (isNaN(num) ? 0 : num);
                  }, 0)
                );
                return (
                  <tr className="bg-[#1A284F] text-white font-semibold">
                    <td colSpan={2} className="border border-gray-300 px-4 py-3 text-center">Total</td>
                    {totals.map((t, i) => (
                      <td key={i} className="border border-gray-300 px-4 py-3 text-center">
                        {t > 0 ? `${t}%` : "0%"}
                      </td>
                    ))}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-gray-900">Scoring / Grading</h3>
            <p className="text-sm text-gray-500 mt-1">Define score ranges for performance ratings</p>
          </div>
          {editMode && (
            <button onClick={onAddScore}
              className="flex items-center gap-2 text-sm font-medium text-[#1A284F] hover:text-[#131d3b] transition-colors">
              <Plus className="w-4 h-4" />Add Range
            </button>
          )}
        </div>
        <div className="p-6 space-y-3">
          {[...scores].sort((a, b) => b.min - a.min).map(score => (
            <div key={score.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: score.color }}>{score.grade}</div>
              {editMode ? (
                <>
                  <div className="flex-1 grid grid-cols-5 gap-3">
                    {([["Min Score","min","number"],["Max Score","max","number"],["Grading","grade","text"],["Scoring Criteria","label","text"]] as [string, keyof ScoreRange, string][]).map(([lbl,field,type]) => (
                      <div key={field} className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500">{lbl}</label>
                        <input type={type} value={score[field] as any}
                          onChange={e => onUpdateScore(score.id, field, type === "number" ? Number(e.target.value) : e.target.value)}
                          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20" />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-gray-500">Color</label>
                      <input type="color" value={score.color}
                        onChange={e => onUpdateScore(score.id, "color", e.target.value)}
                        className="h-[38px] w-full border border-gray-200 rounded-lg cursor-pointer" />
                    </div>
                  </div>
                  <button onClick={() => onDeleteScore(score.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="flex-1 flex items-center gap-8">
                  <div><p className="text-xs text-gray-500 mb-1">Achievement Score (%)</p>
                    <p className="font-semibold text-gray-900">{score.min === 0 && score.max < 50 ? `<50%` : `${score.min}–${score.max}%`}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Grading</p><p className="font-semibold text-gray-900">{score.grade}</p></div>
                  <div><p className="text-xs text-gray-500 mb-1">Scoring Criteria</p><p className="font-semibold text-gray-900">{score.label}</p></div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Calibration sub-panel ────────────────────────────────────────────────────


// ─── Reusable proportion table ────────────────────────────────────────────────

type PropRow = {
  id: string;
  label: string;
  parentLabel?: string;
  hc: number;
  shareKuota: string;
  calcs: number[];
};


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

      <ScorePanel
        scores={unit.scores}
        kpiWeights={unit.kpiWeights}
        editMode={editMode}
        onUpdateScore={(id, field, value) => upd({ scores: unit.scores.map(s => s.id === id ? { ...s, [field]: value } : s) })}
        onAddScore={() => upd({ scores: [...unit.scores, { id: Date.now().toString(), min: 0, max: 0, grade: "", label: "", color: "#6B7280" }] })}
        onDeleteScore={(id) => upd({ scores: unit.scores.filter(s => s.id !== id) })}
        onUpdateKPIWeight={(id, field, value) => upd({ kpiWeights: unit.kpiWeights.map(w => w.id === id ? { ...w, [field]: value } : w) })}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ScoresCalibration() {
  const [companyUnits, setCompanyUnits] = useState<CompanyUnit[]>(defaultCompanyUnits);
  const [selectedUnit, setSelectedUnit] = useState<CompanyUnit | null>(null);

  const updateUnit = (updated: CompanyUnit) => {
    setCompanyUnits(prev => prev.map(u => u.id === updated.id ? updated : u));
    saveUnitScoreWeights(updated.name, updated.kpiWeights);
  };

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
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Scores & Calibration</h2>
          <p className="text-sm text-gray-500">Configure performance score ranges and calibration settings</p>
        </div>
        <TabBar onTabClick={() => setSelectedUnit(null)} />
        <UnitDetail unit={liveUnit} onBack={() => setSelectedUnit(null)} onUpdate={updateUnit} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Scores & Calibration</h2>
        <p className="text-sm text-gray-500">Configure performance score ranges and calibration settings</p>
      </div>
      <TabBar />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">Select a company unit to configure its Score and Calibration settings independently.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {companyUnits.map((unit, idx) => {
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
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
