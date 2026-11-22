import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChartSpline, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const BELL_GRADE_COLORS: Record<string, string> = {
  "A+": "#7C3AED",
  A: "#2563EB",
  B: "#059669",
  C: "#D97706",
  D: "#EA580C",
  E: "#DC2626",
};

export interface BellCurveRow {
  grade: string;
  color?: string;
  /** Proporsi Setting (SOY) (%) */
  target?: number;
  targetCount?: number;
  /** Proporsi Setting (EOY) dari tab HC Akhir Tahun (EOY) (%) */
  targetEoy?: number;
  targetEoyCount?: number;
  /** Proporsi aktual hasil PA (%) */
  actual?: number;
  actualCount?: number;
  /** Proporsi setelah kalibrasi (%) */
  calibration?: number;
  calibrationCount?: number;
}

/** Tag/ikon kecil pemicu modal Grade Distribution (Bell Curve). */
export function BellCurveTagButton({ onClick, label = "Bell Curve" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Lihat Grade Distribution (Bell Curve)"
      className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
    >
      <ChartSpline className="h-3 w-3" />
      {label}
    </button>
  );
}

export function GradeBellCurveModal({
  title,
  subtitle,
  rows,
  mode,
  calibrationStatusBadge,
  onClose,
}: {
  title: string;
  subtitle?: string;
  rows: BellCurveRow[];
  mode: "single" | "compare";
  /** Status kurva Calibration ("Current" kuning lembut jika belum Approved, "Final" hijau lembut jika sudah Approved). */
  calibrationStatusBadge?: { label: "Current" | "Final"; tone: "current" | "final" };
  onClose: () => void;
}) {
  const data = rows.map((r) => ({
    ...r,
    color: r.color ?? BELL_GRADE_COLORS[r.grade] ?? "#1A284F",
    target: Number((r.target ?? 0).toFixed(1)),
    targetCount: r.targetCount ?? 0,
    targetEoy: Number((r.targetEoy ?? 0).toFixed(1)),
    targetEoyCount: r.targetEoyCount ?? 0,
    actual: Number((r.actual ?? 0).toFixed(1)),
    actualCount: r.actualCount ?? 0,
    calibration: Number((r.calibration ?? 0).toFixed(1)),
    calibrationCount: r.calibrationCount ?? 0,
  }));
  const hasSoy = data.some((d) => d.target > 0 || d.targetCount > 0);
  const hasEoy = data.some((d) => d.targetEoy > 0 || d.targetEoyCount > 0);
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    setChartReady(false);
    const t = window.setTimeout(() => setChartReady(true), 120);
    return () => window.clearTimeout(t);
  }, [title, mode]);
  const animatedData = chartReady
    ? data
    : data.map((d) => ({
        ...d,
        target: 0,
        targetEoy: 0,
        actual: 0,
        calibration: 0,
      }));
  const fmtPct = (v: unknown) => `${v}%`;
  const renderBellTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload?: (typeof data)[number] }> }) => {
    if (!active || !payload?.length || !payload[0]?.payload) return null;
    const d = payload[0].payload;
    return (
      <div className="min-w-[225px] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-lg">
        <div className="mb-1.5 flex items-center gap-2 border-b border-slate-100 pb-1.5">
          <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
          <span className="font-bold text-slate-900">Grade {d.grade}</span>
        </div>
        {mode === "single" ? (
          <div className="flex items-center justify-between gap-4 text-slate-600">
            <span>Setting (SOY):</span>
            <span className="font-bold text-[#1A284F] tabular-nums">
              {d.target}% ({d.targetCount} HC)
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {(d.target > 0 || d.targetCount > 0) && (
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-cyan-700">
                  <span className="h-2 w-2 rounded-full bg-[#06B6D4]" />
                  Setting (SOY)
                </span>
                <span className="font-semibold text-cyan-800 tabular-nums">
                  {d.target}% ({d.targetCount} HC)
                </span>
              </div>
            )}
            {(d.targetEoy > 0 || d.targetEoyCount > 0) && (
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                  Setting (EOY)
                </span>
                <span className="font-semibold text-amber-800 tabular-nums">
                  {d.targetEoy}% ({d.targetEoyCount} HC)
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-teal-700">
                <span className="h-2 w-2 rounded-full bg-[#0D9488]" />
                Aktual (EOY)
              </span>
              <span className="font-bold text-teal-700 tabular-nums">
                {d.actual}% ({d.actualCount} HC)
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-indigo-700">
                <span className="h-2 w-2 rounded-full bg-indigo-600" />
                Calibration (Proposed)
              </span>
              <span className="font-bold text-indigo-700 tabular-nums">
                {d.calibration}% ({d.calibrationCount} HC)
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/70 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <ChartSpline className="h-4 w-4 text-indigo-600" />
              <h3 className="text-base font-bold text-[#1A284F]">{title}</h3>
            </div>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {mode === "compare" ? "Kurva Aktual vs Calibration" : "Grade Distribution (Bell Curve)"}
              </p>
              {mode === "compare" && calibrationStatusBadge && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                    calibrationStatusBadge.tone === "final"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      calibrationStatusBadge.tone === "final" ? "bg-emerald-500" : "bg-amber-400"
                    }`}
                  />
                  Calibration: {calibrationStatusBadge.label}
                </span>
              )}
            </div>
            <div className="h-[280px] w-full rounded-xl border border-gray-100 bg-white p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={animatedData}
                  margin={{ top: 12, right: 18, left: -10, bottom: 0 }}
                  barSize={mode === "compare" ? 16 : 30}
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={fmtPct} />
                  <Tooltip content={renderBellTooltip as never} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {mode === "single" ? (
                    <>
                      <Bar dataKey="target" name="Proporsi (%)" fill="#6366F1" fillOpacity={0.18} radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={760} animationEasing="ease-out" />
                      <Line type="monotone" dataKey="target" name="Kurva Distribusi" stroke="#1A284F" strokeWidth={2.5} dot={{ r: 4.5, fill: "#1A284F", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={true} animationDuration={920} animationEasing="ease-out" />
                    </>
                  ) : (
                    <>
                      {hasSoy && (
                        <Bar dataKey="target" name="Setting (SOY)" fill="#06B6D4" fillOpacity={0.24} radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={700} animationEasing="ease-out" legendType="none" />
                      )}
                      {hasEoy && (
                        <Bar dataKey="targetEoy" name="Setting (EOY)" fill="#F59E0B" fillOpacity={0.25} radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={760} animationEasing="ease-out" legendType="none" />
                      )}
                      <Bar dataKey="actual" name="Aktual (%)" fill="#0D9488" fillOpacity={0.24} radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={820} animationEasing="ease-out" legendType="none" />
                      <Bar dataKey="calibration" name="Calibration (%)" fill="#4F46E5" fillOpacity={0.26} radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={880} animationEasing="ease-out" legendType="none" />
                      {hasSoy && (
                        <Line type="monotone" dataKey="target" name="Setting (SOY)" stroke="#06B6D4" strokeDasharray="5 4" strokeWidth={2.2} dot={{ r: 3.5, fill: "#06B6D4", stroke: "#fff", strokeWidth: 1.5 }} isAnimationActive={true} animationDuration={760} animationEasing="ease-out" />
                      )}
                      {hasEoy && (
                        <Line type="monotone" dataKey="targetEoy" name="Setting (EOY)" stroke="#F59E0B" strokeDasharray="5 4" strokeWidth={2.3} dot={{ r: 3.5, fill: "#F59E0B", stroke: "#fff", strokeWidth: 1.5 }} isAnimationActive={true} animationDuration={820} animationEasing="ease-out" />
                      )}
                      <Line type="monotone" dataKey="actual" name="Aktual (%)" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 4, fill: "#0D9488", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={true} animationDuration={900} animationEasing="ease-out" />
                      <Line type="monotone" dataKey="calibration" name="Calibration (%)" stroke="#4F46E5" strokeWidth={2.8} dot={{ r: 4.5, fill: "#4F46E5", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={true} animationDuration={980} animationEasing="ease-out" />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {mode === "compare" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.44, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Setting vs Actual vs Calibration Proportion (%)</p>
              <div className="h-[240px] w-full rounded-xl border border-gray-100 bg-white p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={animatedData} margin={{ top: 12, right: 18, left: -10, bottom: 0 }} barSize={16} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={fmtPct} />
                    <Tooltip content={renderBellTooltip as never} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {hasSoy && (
                      <Bar dataKey="target" name="Setting (SOY)" fill="#06B6D4" fillOpacity={0.8} radius={[5, 5, 0, 0]} isAnimationActive={true} animationDuration={720} animationEasing="ease-out" />
                    )}
                    {hasEoy && (
                      <Bar dataKey="targetEoy" name="Setting (EOY)" fill="#F59E0B" fillOpacity={0.85} radius={[5, 5, 0, 0]} isAnimationActive={true} animationDuration={780} animationEasing="ease-out" />
                    )}
                    <Bar dataKey="actual" name="Actual (%)" fill="#0D9488" fillOpacity={0.85} radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={840} animationEasing="ease-out" />
                    <Bar dataKey="calibration" name="Calibration (%)" fill="#6366F1" radius={[6, 6, 0, 0]} isAnimationActive={true} animationDuration={940} animationEasing="ease-out" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {data.map((d, i) => (
              <motion.div
                key={d.grade}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.38, delay: 0.16 + i * 0.055, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-xl border border-gray-100 bg-gray-50/70 px-2.5 py-2 text-center transition-shadow hover:shadow-sm"
              >
                <span className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: d.color }}>
                  {d.grade}
                </span>
                {mode === "single" ? (
                  <>
                    <p className="mt-1 text-sm font-bold text-gray-900">{d.targetCount} HC</p>
                    <p className="text-[10px] text-gray-500">{d.target}%</p>
                  </>
                ) : (
                  <div className="mt-1 space-y-0.5 text-[10px]">
                    {(d.target > 0 || d.targetCount > 0) && (
                      <p className="text-cyan-700">
                        SOY: <strong>{d.targetCount}</strong> ({d.target}%)
                      </p>
                    )}
                    {(d.targetEoy > 0 || d.targetEoyCount > 0) && (
                      <p className="text-amber-700">
                        EOY: <strong>{d.targetEoyCount}</strong> ({d.targetEoy}%)
                      </p>
                    )}
                    <p className="text-teal-700">
                      Aktual: <strong>{d.actualCount}</strong> ({d.actual}%)
                    </p>
                    <p className="text-indigo-700">
                      Proposed: <strong>{d.calibrationCount}</strong> ({d.calibration}%)
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
