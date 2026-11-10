import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2, RotateCcw, ChevronDown, ChevronUp, X, Info,
  Building2, Search,
} from "lucide-react";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";

// ─── Seeded helpers ────────────────────────────────────────────────────────────

function h16(s: string): number {
  return s.split("").reduce((a, c) => ((a * 31) + c.charCodeAt(0)) & 0xffff, 0);
}
function seededInt(seed: number, lo: number, hi: number): number {
  return lo + (Math.abs(seed) % (hi - lo + 1));
}
function gradeFromScore(n: number): { grade: string; color: string } {
  if (n >= 90) return { grade: "A+", color: "#10B981" };
  if (n >= 80) return { grade: "A",  color: "#3B82F6" };
  if (n >= 70) return { grade: "B",  color: "#F59E0B" };
  if (n >= 60) return { grade: "C",  color: "#F97316" };
  if (n >= 50) return { grade: "D",  color: "#EF4444" };
  return             { grade: "E",  color: "#991B1B" };
}

// ─── Company units (mirrors CalibrationAdjustment) ────────────────────────────

type CompanyUnit = {
  id: string;
  name: string;
  code: string;
  totalHC: number;
  submittedBy: string;
  submittedAt: string;
};

const COMPANY_UNITS: CompanyUnit[] = [
  { id: "1", name: "PT RSUP (Industry)",          code: "RSUP-IND", totalHC: 220, submittedBy: "Anisa Rahmawati (HR Manager)", submittedAt: "15 January 2027, 09:42 WIB" },
  { id: "2", name: "PT RSUP (Perkebunan)",         code: "RSUP-PKB", totalHC: 185, submittedBy: "Budi Santoso (HR Manager)",    submittedAt: "15 January 2027, 10:15 WIB" },
  { id: "3", name: "PT RSTM",                      code: "RSTM",     totalHC: 142, submittedBy: "Citra Dewi (HR Manager)",     submittedAt: "16 January 2027, 08:30 WIB" },
  { id: "4", name: "PT GHS",                       code: "GHS",      totalHC: 98,  submittedBy: "Dian Pratama (HR Manager)",   submittedAt: "16 January 2027, 11:00 WIB" },
  { id: "5", name: "ASD",                          code: "ASD",      totalHC: 67,  submittedBy: "Eko Wahyudi (HR Manager)",    submittedAt: "17 January 2027, 09:00 WIB" },
];

// ─── Seeded grade distribution per unit ──────────────────────────────────────

const GRADE_KEYS = ["A+","A","B","C","D","E"];
const GRADE_COLORS: Record<string, string> = {
  "A+": "#10B981", A: "#3B82F6", B: "#F59E0B", C: "#F97316", D: "#EF4444", E: "#991B1B",
};

function getGradeDist(unitId: string, totalHC: number) {
  const seed = h16(unitId);
  const props = [
    seededInt(seed ^ 0x1, 4, 7),   // A+ ~5%
    seededInt(seed ^ 0x2, 13, 18), // A  ~15%
    seededInt(seed ^ 0x3, 38, 45), // B  ~40%
    seededInt(seed ^ 0x4, 23, 28), // C  ~25%
    seededInt(seed ^ 0x5, 8, 12),  // D  ~10%
    seededInt(seed ^ 0x6, 3, 6),   // E  ~5%
  ];
  const total = props.reduce((s, p) => s + p, 0);
  return GRADE_KEYS.map((grade, i) => {
    const pct = props[i] / total;
    const aktual   = Math.round(totalHC * pct);
    const setting  = Math.round(aktual + seededInt(h16(unitId + grade + "s"), -3, 3));
    const proposed = aktual + seededInt(h16(unitId + grade + "p"), -2, 4);
    return { grade, color: GRADE_COLORS[grade], setting: Math.max(0, setting), aktual, proposed: Math.max(0, proposed) };
  });
}

// ─── Division defs for each unit (seeded from unit id) ───────────────────────

const DIV_NAMES = ["Staff Management","Generals","Finance & Accounting","Logistic / Materials","Quality Management","Production","Utility & Supports"];
const DEPT_BY_DIV: Record<string, string[]> = {
  "Staff Management":     ["Sumber Daya Manusia","Umum & Administrasi"],
  "Generals":             ["Legal & Compliance","Teknologi Informasi"],
  "Finance & Accounting": ["Keuangan","Akuntansi","Pajak & Audit"],
  "Logistic / Materials": ["Warehouse & Inventory","Purchasing"],
  "Quality Management":   ["Quality Control","Quality Assurance"],
  "Production":           ["Produksi A","Produksi B"],
  "Utility & Supports":   ["Maintenance","Utilitas & Energi"],
};
const POSITIONS = ["Kepala Divisi","Kepala Departemen","Kepala Bagian","Pengawas","Operasional"];
const FIRST_NAMES = ["Budi","Siti","Ahmad","Dewi","Eko","Fitri","Gunawan","Heni","Irfan","Joko","Kartika","Lukman","Maya","Nugroho","Purnomo","Rudi","Sri","Teguh","Wahyu","Yanto","Arif","Bagas","Cahya","Dian","Endra","Fajar","Gita","Hadi","Indra","Jeni","Kiki","Lina"];
const LAST_NAMES  = ["Santoso","Rahayu","Fauzi","Lestari","Prasetyo","Handayani","Wibowo","Kurniawati","Hidayat","Susilo","Hakim","Sari","Wicaksono","Hermawan","Wahyuni","Wijaya","Rahman","Nugroho","Kusuma","Pertiwi"];

const GRADE_BAND_PROPS = [
  { lo: 91, hi: 98, pct: 0.05 },
  { lo: 80, hi: 90, pct: 0.15 },
  { lo: 70, hi: 79, pct: 0.40 },
  { lo: 60, hi: 69, pct: 0.25 },
  { lo: 50, hi: 59, pct: 0.10 },
  { lo: 35, hi: 49, pct: 0.05 },
];
const GRADE_ORDER = ["E", "D", "C", "B", "A", "A+"];

type EmpRow = {
  id: string; name: string; division: string; department: string; position: string;
  currentScore: number; currentGrade: string; currentColor: string;
  proposedScore: number; proposedGrade: string; proposedColor: string;
  status: "No Change" | "Upgraded" | "Downgraded";
  justification: string;
};

function generateEmployees(unitId: string, totalHC: number): EmpRow[] {
  const rows: EmpRow[] = [];
  const divs = DIV_NAMES;

  for (let i = 0; i < Math.min(totalHC, 60); i++) {
    const s    = h16(unitId + String(i));
    const div  = divs[s % divs.length];
    const depts = DEPT_BY_DIV[div] ?? ["General"];
    const dept = depts[(s ^ 0x3) % depts.length];
    const pos  = POSITIONS[Math.min(Math.floor(i / 10), POSITIONS.length - 1)];
    const band = GRADE_BAND_PROPS[seededInt(s ^ 0x5, 0, GRADE_BAND_PROPS.length - 1)];
    const score = seededInt(s ^ 0x6, band.lo, band.hi);
    const { grade: cg, color: cc } = gradeFromScore(score);

    const shift = seededInt(s ^ 0x7, 0, 9);
    let pScore = score;
    if (shift === 0) pScore = Math.min(score + seededInt(s ^ 0x8, 3, 8), 99);
    if (shift === 9) pScore = Math.max(score - seededInt(s ^ 0x9, 3, 6), 30);
    const { grade: pg, color: pc } = gradeFromScore(pScore);

    const statusVal: EmpRow["status"] =
      GRADE_ORDER.indexOf(pg) > GRADE_ORDER.indexOf(cg) ? "Upgraded" :
      GRADE_ORDER.indexOf(pg) < GRADE_ORDER.indexOf(cg) ? "Downgraded" : "No Change";

    const fn = FIRST_NAMES[(s + i * 3) % FIRST_NAMES.length];
    const ln = LAST_NAMES[(s + i * 7) % LAST_NAMES.length];
    const empNo = String(parseInt(unitId) * 100 + i + 1).padStart(3, "0");

    rows.push({
      id: `E${empNo}`,
      name: `${fn} ${ln}`,
      division: div,
      department: dept,
      position: pos,
      currentScore: score,
      currentGrade: cg,
      currentColor: cc,
      proposedScore: pScore,
      proposedGrade: pg,
      proposedColor: pc,
      status: statusVal,
      justification: statusVal === "Upgraded"
        ? "Consistent performance improvement across all PA modules"
        : statusVal === "Downgraded"
        ? "Below target KPI, open RCA items in H2 2026"
        : "",
    });
  }
  return rows;
}

function getDivisionSummary(emps: EmpRow[]) {
  const map = new Map<string, { hc: number; upgraded: number; noChange: number; downgraded: number; grades: string[] }>();
  for (const e of emps) {
    if (!map.has(e.division)) map.set(e.division, { hc: 0, upgraded: 0, noChange: 0, downgraded: 0, grades: [] });
    const d = map.get(e.division)!;
    d.hc++;
    d.grades.push(e.proposedGrade);
    if (e.status === "Upgraded")   d.upgraded++;
    else if (e.status === "Downgraded") d.downgraded++;
    else d.noChange++;
  }
  return Array.from(map.entries()).map(([division, d]) => {
    const gradeCounts = GRADE_KEYS.map(g => ({ grade: g, count: d.grades.filter(x => x === g).length }));
    const top = gradeCounts.sort((a, b) => b.count - a.count)[0]?.grade ?? "B";
    return { division, ...d, gradeTop: top };
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "#1A284F" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-black tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true }: {
  title: string; subtitle?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-5 border-b border-gray-100 hover:bg-gray-50/50 transition-colors text-left"
      >
        <div>
          <p className="font-semibold text-gray-900 text-sm">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

const APPROVAL_STATEMENTS = [
  "I have reviewed the grade distribution and confirm it aligns with company targets.",
  "I have reviewed all individual grade changes and their supporting justifications.",
  "I confirm that the calibration results are fair, objective, and based on performance data.",
  "I acknowledge that approving this will finalize all grades and notify all parties.",
];

function ApproveModal({ unitName, onConfirm, onCancel }: {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(APPROVAL_STATEMENTS.map(() => false));
  const allChecked = checked.every(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Approve Calibration</h3>
              <p className="text-xs text-gray-400 mt-0.5">{unitName} · Performance Year 2026</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800 flex gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
          As the authorized Director, please confirm each statement below before approving.
        </div>

        <div className="flex flex-col gap-3">
          {APPROVAL_STATEMENTS.map((stmt, i) => (
            <label key={i} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked[i] ? "border-emerald-300 bg-emerald-50/60" : "border-gray-200 hover:bg-gray-50"}`}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))}
                className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0"
              />
              <span className={`text-sm leading-relaxed ${checked[i] ? "text-emerald-800 font-medium" : "text-gray-700"}`}>{stmt}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            disabled={!allChecked}
            onClick={onConfirm}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve Calibration
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Revision Modal ───────────────────────────────────────────────────────────

function RevisionModal({ unitName, onConfirm, onCancel }: {
  unitName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Return for Revision</h3>
              <p className="text-xs text-gray-400 mt-0.5">{unitName} · Performance Year 2026</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          HR will be notified to review and resubmit the calibration results for this company unit.
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <RotateCcw className="w-4 h-4" /> Confirm Revision
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = "pending" | "approved" | "revision";

export function BODCalibrationApproval() {
  const [selectedUnitId, setSelectedUnitId] = useState(COMPANY_UNITS[0].id);
  const [modal, setModal]   = useState<"approve" | "revision" | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, ApprovalStatus>>(() =>
    loadPersistedState("pa_bod_cal_status_map_v1", {})
  );
  const [approvedAtMap, setApprovedAtMap] = useState<Record<string, string>>(() =>
    loadPersistedState("pa_bod_cal_approved_at_v1", {})
  );
  const [empSearch, setEmpSearch] = useState("");

  useEffect(() => {
    const onHydrated = () => {
      setStatusMap(loadPersistedState("pa_bod_cal_status_map_v1", {}));
      setApprovedAtMap(loadPersistedState("pa_bod_cal_approved_at_v1", {}));
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);

  const unit   = COMPANY_UNITS.find(u => u.id === selectedUnitId)!;
  const status = statusMap[selectedUnitId] ?? "pending";

  const gradeDist  = useMemo(() => getGradeDist(selectedUnitId, unit.totalHC), [selectedUnitId]);
  const employees  = useMemo(() => generateEmployees(selectedUnitId, unit.totalHC), [selectedUnitId]);
  const divSummary = useMemo(() => getDivisionSummary(employees), [employees]);

  const gradeChanges = useMemo(() => employees.filter(e => e.status !== "No Change"), [employees]);
  const totalHC      = unit.totalHC;
  const totalChanged = gradeChanges.length;
  const totalUpgraded   = gradeChanges.filter(e => e.status === "Upgraded").length;
  const totalDowngraded = gradeChanges.filter(e => e.status === "Downgraded").length;

  const filteredEmps = useMemo(() => {
    const q = empSearch.toLowerCase();
    if (!q) return employees;
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.division.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  }, [employees, empSearch]);

  const totalProposed = gradeDist.reduce((s, g) => s + g.proposed, 0);

  const handleApprove = () => {
    const now = new Date().toLocaleString("id-ID", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " WIB";
    const nextStatus = { ...statusMap, [selectedUnitId]: "approved" as ApprovalStatus };
    const nextApprovedAt = { ...approvedAtMap, [selectedUnitId]: now };
    setStatusMap(nextStatus);
    setApprovedAtMap(nextApprovedAt);
    savePersistedState("pa_bod_cal_status_map_v1", nextStatus, {
      kind: "calibration-adjustment",
      adjustmentKey: `bod-approval-${selectedUnitId}-2026`,
      unitName: unit.name,
      employeeId: "ALL",
      period: "2026",
      status: "Approved",
      bodDecision: "Approved",
      bodNote: `Approved by BOD on ${now}`,
      data: { approvedAt: now, unitId: selectedUnitId },
      audit: {
        action: "Approve",
        module: "Performance Appraisal",
        subModule: "Calibration Approval",
        description: `BOD approved Calibration results for ${unit.name} (${now})`,
      },
    });
    savePersistedState("pa_bod_cal_approved_at_v1", nextApprovedAt);
    setModal(null);
  };

  const handleRevision = () => {
    const nextStatus = { ...statusMap, [selectedUnitId]: "revision" as ApprovalStatus };
    setStatusMap(nextStatus);
    savePersistedState("pa_bod_cal_status_map_v1", nextStatus, {
      kind: "calibration-adjustment",
      adjustmentKey: `bod-approval-${selectedUnitId}-2026`,
      unitName: unit.name,
      employeeId: "ALL",
      period: "2026",
      status: "Revision",
      bodDecision: "Revision",
      bodNote: "Returned for HR revision",
      data: { unitId: selectedUnitId },
      audit: {
        action: "Reject",
        module: "Performance Appraisal",
        subModule: "Calibration Approval",
        description: `BOD requested revision on Calibration results for ${unit.name}`,
      },
    });
    setModal(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-[#1A284F]">Calibration Approval</h1>
            <p className="mt-1 text-sm text-gray-500">Performance Year 2026 · Director Review</p>
          </div>
          {status === "approved" && (
            <span className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-4 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" /> Approved on {approvedAtMap[selectedUnitId]}
            </span>
          )}
          {status === "revision" && (
            <span className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-4 py-2 rounded-xl">
              <RotateCcw className="w-4 h-4" /> Revision Requested
            </span>
          )}
        </div>

        {/* ── Company Unit Selector ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Company Unit</p>
          <div className="flex flex-wrap gap-2">
            {COMPANY_UNITS.map(u => {
              const s = statusMap[u.id] ?? "pending";
              return (
                <button
                  key={u.id}
                  onClick={() => { setSelectedUnitId(u.id); setEmpSearch(""); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    selectedUnitId === u.id
                      ? "bg-[#1A284F] text-white border-[#1A284F] shadow-sm"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[#1A284F]/30 hover:bg-[#1A284F]/5"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  {u.name}
                  {s === "approved" && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                  {s === "revision" && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                  {s === "pending"  && <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Unit info */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ["Unit Code", unit.code],
              ["Total HC", String(unit.totalHC) + " employees"],
              ["Submitted by", unit.submittedBy],
              ["Submitted at", unit.submittedAt],
            ].map(([lbl, val]) => (
              <div key={lbl} className="bg-gray-50 rounded-xl px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{lbl}</p>
                <p className="font-semibold text-gray-800">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Employees"  value={totalHC}        sub="in this unit"           color="#1A284F" />
          <StatCard label="Grade Changes"    value={totalChanged}   sub={`${totalUpgraded} ↑ · ${totalDowngraded} ↓`} color="#6366F1" />
          <StatCard label="Upgraded"         value={totalUpgraded}  sub="grade improved"         color="#10B981" />
          <StatCard label="Downgraded"       value={totalDowngraded} sub="grade decreased"       color="#EF4444" />
        </div>

        {/* ── Grade Distribution ── */}
        <Section title="Grade Distribution" subtitle="Setting target vs Aktual PA vs Proposed (after HR calibration)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Grade</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Setting HC</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Setting %</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Aktual HC</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Aktual %</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-[#1A284F]">Proposed HC</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-[#1A284F]">Proposed %</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-6">Bar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {gradeDist.map(row => {
                  const sPct = totalHC > 0 ? ((row.setting  / totalHC) * 100).toFixed(1) : "0.0";
                  const aPct = totalHC > 0 ? ((row.aktual   / totalHC) * 100).toFixed(1) : "0.0";
                  const pPct = totalProposed > 0 ? ((row.proposed / totalProposed) * 100).toFixed(1) : "0.0";
                  const diff = row.proposed - row.aktual;
                  return (
                    <tr key={row.grade} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-6">
                        <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white text-xs font-black" style={{ background: row.color }}>{row.grade}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-gray-600 tabular-nums text-xs">{row.setting}</td>
                      <td className="py-3 px-4 text-center text-gray-400 tabular-nums text-xs">{sPct}%</td>
                      <td className="py-3 px-4 text-center text-gray-700 font-medium tabular-nums text-xs">{row.aktual}</td>
                      <td className="py-3 px-4 text-center text-gray-400 tabular-nums text-xs">{aPct}%</td>
                      <td className="py-3 px-4 text-center font-bold tabular-nums text-xs" style={{ color: row.color }}>{row.proposed}</td>
                      <td className="py-3 px-4 text-center tabular-nums text-xs" style={{ color: row.color }}>{pPct}%</td>
                      <td className="py-3 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(parseFloat(pPct), 100)}%`, background: row.color }} />
                          </div>
                          {diff !== 0 && (
                            <span className={`text-[10px] font-bold ${diff > 0 ? "text-green-600" : "text-red-500"}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="py-3 pr-6 text-xs font-bold text-gray-600 uppercase tracking-wide">Total</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-700">{gradeDist.reduce((s,g)=>s+g.setting,0)}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-500">100%</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-700">{totalHC}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-gray-500">100%</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-[#1A284F]">{totalProposed}</td>
                  <td className="py-3 px-4 text-center text-xs font-bold text-[#1A284F]">100%</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* ── Division Summary ── */}
        <Section title="Calibration Summary by Division" subtitle="Headcount and grade change breakdown per division" defaultOpen={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-6">Division</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">Total HC</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-emerald-600">Upgraded</th>
                  <th className="text-center text-xs text-gray-500 font-medium pb-3 px-4">No Change</th>
                  <th className="text-center text-xs font-medium pb-3 px-4 text-red-500">Downgraded</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-6">Dominant Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {divSummary.map(div => (
                  <tr key={div.division} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-6 font-medium text-gray-900 text-sm">{div.division}</td>
                    <td className="py-3 px-4 text-center text-gray-700 font-semibold tabular-nums text-xs">{div.hc}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {div.upgraded > 0 ? <span className="text-emerald-600 font-bold">+{div.upgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-500 tabular-nums text-xs">{div.noChange}</td>
                    <td className="py-3 px-4 text-center tabular-nums text-xs">
                      {div.downgraded > 0 ? <span className="text-red-500 font-bold">−{div.downgraded}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 pl-6">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: GRADE_COLORS[div.gradeTop] ?? "#6B7280" }}>
                        {div.gradeTop}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Grade Changes ── */}
        <Section title={`Grade Changes — ${totalChanged} Employees`} subtitle="Employees whose calibration grade differs from their PA result" defaultOpen={false}>
          {gradeChanges.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No grade changes for this unit.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-3">ID</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-4">Employee</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Division</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Department</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 px-3">Position</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">Before</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">After</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-3">Dir.</th>
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pl-3">Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gradeChanges.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-3 text-xs font-mono text-gray-400">{row.id}</td>
                      <td className="py-3 pr-4 font-medium text-gray-900 whitespace-nowrap text-sm">{row.name}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.division}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.department}</td>
                      <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">{row.position}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: row.currentColor }}>{row.currentGrade}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs font-black" style={{ background: row.proposedColor }}>{row.proposedGrade}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {row.status === "Upgraded" ? <span className="text-emerald-600 font-black">↑</span> : <span className="text-red-500 font-black">↓</span>}
                      </td>
                      <td className="py-3 pl-3 text-xs text-gray-500 max-w-[220px]">{row.justification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── All Employees in Calibration ── */}
        <Section title={`All Employees in Calibration — ${unit.name}`} subtitle={`${employees.length} employees shown · search by name, ID, or department`} defaultOpen={false}>
          <div className="mb-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="Search employee, ID, division, department..."
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 bg-white"
            />
          </div>
          <div className="overflow-x-auto">
            <div className="max-h-[480px] overflow-y-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">No.</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">ID</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Employee</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Division</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Department</th>
                    <th className="text-left text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Position</th>
                    <th className="text-right text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Current Score</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Current Grade</th>
                    <th className="text-right text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Proposed Score</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Proposed Grade</th>
                    <th className="text-center text-gray-500 font-medium py-3 px-3 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredEmps.length === 0 ? (
                    <tr><td colSpan={11} className="py-10 text-center text-gray-400">No employees match your search.</td></tr>
                  ) : filteredEmps.map((e, idx) => (
                    <tr key={e.id} className="hover:bg-gray-50/60">
                      <td className="py-2.5 px-3 text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono text-gray-400">{e.id}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">{e.name}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.division}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.department}</td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{e.position}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: e.currentColor }}>{e.currentScore.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ color: e.currentColor }}>{e.currentGrade}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold" style={{ color: e.proposedColor }}>{e.proposedScore.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-center font-bold" style={{ color: e.proposedColor }}>{e.proposedGrade}</td>
                      <td className="py-2.5 px-3 text-center">
                        {e.status === "Upgraded"   && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">↑ Upgraded</span>}
                        {e.status === "Downgraded" && <span className="bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">↓ Downgraded</span>}
                        {e.status === "No Change"  && <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ── Approval Action ── */}
        {status === "pending" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#1A284F]">Director Approval — {unit.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review the calibration results above and take action</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-blue-800">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
              Approving will finalize all calibration grades for {unit.name} and notify HR, supervisors, and employees.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setModal("revision")}
                className="flex items-center gap-2 border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors">
                <RotateCcw className="w-4 h-4" /> Revision
              </button>
              <button onClick={() => setModal("approve")}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors shadow-sm">
                <CheckCircle2 className="w-4 h-4" /> Approve Calibration
              </button>
            </div>
          </div>
        )}

        {status === "approved" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-800">Calibration Approved — {unit.name}</p>
              <p className="text-sm text-emerald-700 mt-0.5">Approved on {approvedAtMap[selectedUnitId]}. HR and supervisors have been notified. Grade finalization is now in progress.</p>
            </div>
          </div>
        )}

        {status === "revision" && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
            <RotateCcw className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800">Revision Requested — {unit.name}</p>
              <p className="text-sm text-amber-700 mt-0.5">HR has been notified to review and resubmit the calibration results for this unit.</p>
            </div>
          </div>
        )}

      </div>

      {modal === "approve"   && <ApproveModal  unitName={unit.name} onConfirm={handleApprove}  onCancel={() => setModal(null)} />}
      {modal === "revision"  && <RevisionModal unitName={unit.name} onConfirm={handleRevision} onCancel={() => setModal(null)} />}
    </div>
  );
}
