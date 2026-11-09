import React from "react";

type CheckInStatus = "not_started" | "on_track" | "at_risk" | "completed" | "cancelled";

interface ProjectItem {
  name: string;
  category: string;
  scope: string;
  bobot: number;
  role: string;
  checkInStatus: CheckInStatus;
  progress: number;
}

interface ProjRecord {
  employeeId: string;
  projects: ProjectItem[];
  submissionStatus: "Submitted" | "Draft" | "Belum Mulai";
  lastUpdated: string;
}

interface Employee {
  id: string;
  name: string;
  unit: string;
  division: string;
  department: string;
  position: string;
}

interface Props {
  projData: ProjRecord[];
  employees: Employee[];
  participationData?: { unit: string; rate: number; submitted: number; total: number }[];
}

// ── Palette ───────────────────────────────────────────────────────────────────
const PALETTE = {
  indigo:  "#6366f1",
  violet:  "#8b5cf6",
  sky:     "#0ea5e9",
  teal:    "#14b8a6",
  emerald: "#10b981",
  amber:   "#f59e0b",
  rose:    "#f43f5e",
  orange:  "#f97316",
  navy:    "#1A284F",
};

const DONUT_COLORS = [PALETTE.indigo, PALETTE.teal, PALETTE.amber, PALETTE.rose, PALETTE.violet];

const SCOPE_GROUPS: Record<string, "SS" | "QCC" | "QCP" | "Lainnya"> = {
  'SS - "Small Idea Kaizen"':          "SS",
  "SS":                                "SS",
  'QCC - "Small Group Activity"':      "QCC",
  "QCC":                               "QCC",
  'QCP - "Cross Functional Kaizen Team"': "QCP",
  "QCP":                               "QCP",
};

function scopeGroup(scope: string): "SS" | "QCC" | "QCP" | "Lainnya" {
  return SCOPE_GROUPS[scope] ?? "Lainnya";
}

// ── Pure-SVG donut chart (no recharts) ───────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutSlicePath(cx: number, cy: number, r: number, ir: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const is = polarToCartesian(cx, cy, ir, end);
  const ie = polarToCartesian(cx, cy, ir, start);
  const large = end - start > 180 ? 1 : 0;
  return [
    `M ${s.x} ${s.y}`,
    `A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`,
    `L ${is.x} ${is.y}`,
    `A ${ir} ${ir} 0 ${large} 0 ${ie.x} ${ie.y}`,
    "Z",
  ].join(" ");
}

function DonutChart({ data, colors, total }: { data: { name: string; value: number }[]; colors: string[]; total: number }) {
  const CX = 80, CY = 80, R = 72, IR = 50;
  let angle = -90;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * 354; // leave 6° gap total
    const gap = 3 / (total > 0 ? total : 1);
    const start = angle + gap;
    const end = angle + sweep - gap;
    angle += sweep;
    if (sweep <= 0) return null;
    return (
      <path
        key={`slice-${d.name}`}
        d={donutSlicePath(CX, CY, R, IR, start, end)}
        fill={colors[i % colors.length]}
      />
    );
  });
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={22} />
      {slices}
    </svg>
  );
}

// ── Radial progress ring ───────────────────────────────────────────────────────
function ProgressRing({ value, color, size = 48 }: { value: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill={color} fontSize={10} fontWeight={700}>{value}%</text>
    </svg>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────
function ChartCard({ title, gradient, children }: { title: string; gradient: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className={`${gradient} px-4 py-2.5`}>
        <p className="text-xs font-bold text-white tracking-wider uppercase">{title}</p>
      </div>
      <div className="flex-1 px-4 py-4">{children}</div>
    </div>
  );
}

const GRADIENTS = [
  "bg-gradient-to-r from-indigo-600 to-violet-600",
  "bg-gradient-to-r from-sky-500 to-teal-500",
  "bg-gradient-to-r from-amber-500 to-orange-500",
  "bg-gradient-to-r from-emerald-500 to-teal-600",
  "bg-gradient-to-r from-rose-500 to-pink-600",
  "bg-gradient-to-r from-violet-600 to-purple-700",
];

export function ProjectInfographics({ projData, employees, participationData }: Props) {
  const allProjects = projData.flatMap((r) => r.projects);
  const totalActive = allProjects.length;

  // 1. Active Project donut by scope group
  const scopeCounts: Record<string, number> = { SS: 0, QCC: 0, QCP: 0, Lainnya: 0 };
  allProjects.forEach((p) => { const g = scopeGroup(p.scope); scopeCounts[g] = (scopeCounts[g] ?? 0) + 1; });
  const donutData = Object.entries(scopeCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  // 2. (reserved for future use)

  // 4. Project By Department (stacked)
  const UNIT_SHORT: Record<string, string> = {
    "PT RSUP (Industry)":          "RSUP Ind.",
    "PT RSUP (Perkebunan)":        "RSUP Pkbn.",
    "PT Pulau Sambu (Jakarta)":    "PS Jakarta",
    "PT Pulau Sambu (Guntung)":    "PS Guntung",
    "PT Pulau Sambu (Kuala Enok)": "PS K.Enok",
    "PT RSTM":                     "RSTM",
    "PT GHS":                      "GHS",
    "ASD":                         "ASD",
  };
  const unitMap: Record<string, { SS: number; QCC: number; QCP: number }> = {};
  projData.forEach((r) => {
    const emp = employees.find((e) => e.id === r.employeeId);
    const unit = UNIT_SHORT[emp?.unit ?? ""] ?? emp?.unit?.split(" ").slice(-1)[0] ?? "Other";
    if (!unitMap[unit]) unitMap[unit] = { SS: 0, QCC: 0, QCP: 0 };
    r.projects.forEach((p) => {
      const g = scopeGroup(p.scope);
      if (g === "SS" || g === "QCC" || g === "QCP") unitMap[unit][g]++;
    });
  });
  const deptBarData = Object.entries(unitMap).map(([dept, counts]) => ({ dept, ...counts }));
  const maxDept = Math.max(...deptBarData.map((d) => d.QCC + d.QCP + d.SS), 1);

  // 5. Participation Rate
  const computedPart = (() => {
    const unitEmpCount: Record<string, number> = {};
    const unitHasProject: Record<string, number> = {};
    employees.forEach((e) => {
      const unit = e.unit?.split(" ").slice(-1)[0] ?? "Other";
      unitEmpCount[unit] = (unitEmpCount[unit] ?? 0) + 1;
      const rec = projData.find((r) => r.employeeId === e.id);
      if (rec && rec.projects.length > 0) unitHasProject[unit] = (unitHasProject[unit] ?? 0) + 1;
    });
    return Object.entries(unitEmpCount).map(([unit, total]) => ({
      unit, total,
      submitted: unitHasProject[unit] ?? 0,
      rate: Math.round(((unitHasProject[unit] ?? 0) / total) * 100),
    }));
  })();
  const partData = (participationData ?? computedPart).sort((a, b) => b.rate - a.rate);

  // 6. Avg Progress by Unit
  const unitProgress: Record<string, number[]> = {};
  projData.forEach((r) => {
    const emp = employees.find((e) => e.id === r.employeeId);
    const unit = emp?.unit?.split(" ").slice(-1)[0] ?? "Other";
    r.projects.forEach((p) => {
      if (!unitProgress[unit]) unitProgress[unit] = [];
      unitProgress[unit].push(p.progress);
    });
  });
  const progData = Object.entries(unitProgress).map(([unit, vals]) => ({
    unit,
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
  })).sort((a, b) => b.avg - a.avg);

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Active Project — pure-SVG donut */}
        <ChartCard title="Active Project" gradient={GRADIENTS[0]}>
          <div className="flex flex-col items-center gap-3">
            <div className="relative" style={{ width: 160, height: 160 }}>
              {donutData.length > 0 ? (
                <DonutChart data={donutData} colors={DONUT_COLORS} total={totalActive} />
              ) : (
                <svg width={160} height={160} viewBox="0 0 160 160">
                  <circle cx={80} cy={80} r={72} fill="none" stroke="#f1f5f9" strokeWidth={22} />
                </svg>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black text-indigo-700">{totalActive}</span>
                <span className="text-[9px] text-gray-400 font-medium">Projects</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 w-full">
              {donutData.map((d, i) => {
                const pct = Math.round((d.value / totalActive) * 100);
                return (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="text-[11px] text-gray-600 flex-1">{d.name}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    </div>
                    <span className="text-[11px] font-bold text-gray-700 w-4 text-right">{d.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Project By Department — pure-CSS stacked bars */}
        <ChartCard title="Project By Department" gradient={GRADIENTS[3]}>
          <div className="flex gap-4 justify-center mb-3">
            {([
              { key: "QCC", color: PALETTE.indigo },
              { key: "QCP", color: PALETTE.teal },
              { key: "SS",  color: PALETTE.amber },
            ] as const).map(({ key, color }) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-[10px] font-semibold text-gray-600">{key}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {deptBarData.map((d) => {
              const total = d.QCC + d.QCP + d.SS;
              const barW = (total / maxDept) * 100;
              const qccW = total > 0 ? (d.QCC / total) * barW : 0;
              const qcpW = total > 0 ? (d.QCP / total) * barW : 0;
              const ssW  = total > 0 ? (d.SS  / total) * barW : 0;
              return (
                <div key={d.dept}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-gray-600">{d.dept}</span>
                    <span className="text-[10px] font-bold text-gray-700">{total}</span>
                  </div>
                  <div className="h-5 rounded-full bg-gray-100 overflow-hidden flex">
                    {d.QCC > 0 && (
                      <div className="h-full" style={{ width: `${qccW}%`, background: PALETTE.indigo }} />
                    )}
                    {d.QCP > 0 && (
                      <div className="h-full" style={{ width: `${qcpW}%`, background: PALETTE.teal }} />
                    )}
                    {d.SS > 0 && (
                      <div className="h-full rounded-r-full" style={{ width: `${ssW}%`, background: PALETTE.amber }} />
                    )}
                  </div>
                </div>
              );
            })}
            {deptBarData.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No department data</p>
            )}
          </div>
        </ChartCard>

        {/* Participation Rate — soft pastel gradient bars */}
        <ChartCard title="Participation Rate" gradient={GRADIENTS[4]}>
          <div className="flex flex-col gap-3 py-1">
            {partData.map((d, i) => {
              const softPalette = [
                { from: "#c7d2fe", to: "#818cf8", text: "#4f46e5", bg: "#eef2ff" },
                { from: "#bae6fd", to: "#38bdf8", text: "#0284c7", bg: "#f0f9ff" },
                { from: "#bbf7d0", to: "#34d399", text: "#059669", bg: "#ecfdf5" },
                { from: "#fde68a", to: "#fbbf24", text: "#d97706", bg: "#fffbeb" },
                { from: "#fbcfe8", to: "#f472b6", text: "#db2777", bg: "#fdf2f8" },
                { from: "#d8b4fe", to: "#a78bfa", text: "#7c3aed", bg: "#f5f3ff" },
                { from: "#fed7aa", to: "#fb923c", text: "#ea580c", bg: "#fff7ed" },
              ];
              const p = softPalette[i % softPalette.length];
              return (
                <div key={d.unit}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-gray-700">{d.unit}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">{d.submitted ?? Math.round(d.rate / 100 * (d.total ?? 10))}/{d.total ?? 10}</span>
                      <span className="text-[11px] font-black" style={{ color: p.text }}>{d.rate}%</span>
                    </div>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: p.bg }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${d.rate}%`, background: `linear-gradient(90deg, ${p.from}, ${p.to})` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
            <span>% employees with ≥1 project</span>
            <span className="font-semibold text-gray-500">
              Avg: {Math.round(partData.reduce((s, d) => s + d.rate, 0) / (partData.length || 1))}%
            </span>
          </div>
        </ChartCard>

        {/* Avg Progress by Unit — radial rings */}
        <ChartCard title="Avg. Progress by Unit" gradient={GRADIENTS[5]}>
          <div className="flex flex-wrap justify-center gap-4 py-1">
            {progData.map((d, i) => {
              const ringColors = [PALETTE.violet, PALETTE.sky, PALETTE.emerald, PALETTE.amber, PALETTE.rose];
              const c = ringColors[i % ringColors.length];
              return (
                <div key={d.unit} className="flex flex-col items-center gap-1">
                  <ProgressRing value={d.avg} color={c} size={52} />
                  <span className="text-[9px] font-semibold text-gray-500 text-center leading-tight max-w-[48px]">{d.unit}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-100 text-center text-[10px] text-gray-400">
            Average measurement progress across projects
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
