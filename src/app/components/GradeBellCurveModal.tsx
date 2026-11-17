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
  /** Proporsi target / setting (%) */
  target?: number;
  targetCount?: number;
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
    actual: Number((r.actual ?? 0).toFixed(1)),
    calibration: Number((r.calibration ?? 0).toFixed(1)),
  }));
  const fmtPct = (v: unknown) => `${v}%`;

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
          <div>
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
                <ComposedChart data={data} margin={{ top: 12, right: 18, left: -10, bottom: 0 }} barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={fmtPct} />
                  <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {mode === "single" ? (
                    <>
                      <Bar dataKey="target" name="Proporsi (%)" fill="#6366F1" fillOpacity={0.18} radius={[6, 6, 0, 0]} animationDuration={700} />
                      <Line type="monotone" dataKey="target" name="Kurva Distribusi" stroke="#1A284F" strokeWidth={2.5} dot={{ r: 4.5, fill: "#1A284F", stroke: "#fff", strokeWidth: 2 }} animationDuration={900} />
                    </>
                  ) : (
                    <>
                      {data.some((d) => d.target > 0) && (
                        <Line type="monotone" dataKey="target" name="Setting Target (%)" stroke="#94A3B8" strokeDasharray="5 4" strokeWidth={1.8} dot={false} animationDuration={700} />
                      )}
                      <Line type="monotone" dataKey="actual" name="Aktual (%)" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4, fill: "#F59E0B", stroke: "#fff", strokeWidth: 2 }} animationDuration={850} />
                      <Line type="monotone" dataKey="calibration" name="Calibration (%)" stroke="#4F46E5" strokeWidth={2.8} dot={{ r: 4.5, fill: "#4F46E5", stroke: "#fff", strokeWidth: 2 }} animationDuration={1000} />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {mode === "compare" && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Actual vs Calibration Proportion (%)</p>
              <div className="h-[240px] w-full rounded-xl border border-gray-100 bg-white p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 12, right: 18, left: -10, bottom: 0 }} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#334155", fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} tickFormatter={fmtPct} />
                    <Tooltip formatter={(v: number, name: string) => [`${v}%`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="actual" name="Actual (%)" fill="#FBBF24" radius={[6, 6, 0, 0]} animationDuration={750} />
                    <Bar dataKey="calibration" name="Calibration (%)" fill="#6366F1" radius={[6, 6, 0, 0]} animationDuration={950} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {data.map((d, i) => (
              <motion.div
                key={d.grade}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.05 }}
                className="rounded-xl border border-gray-100 bg-gray-50/70 px-2.5 py-2 text-center"
              >
                <span className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: d.color }}>
                  {d.grade}
                </span>
                {mode === "single" ? (
                  <>
                    <p className="mt-1 text-sm font-bold text-gray-900">{d.targetCount ?? 0}</p>
                    <p className="text-[10px] text-gray-500">{d.target}%</p>
                  </>
                ) : (
                  <div className="mt-1 space-y-0.5 text-[10px]">
                    <p className="text-amber-700">
                      Aktual: <strong>{d.actualCount ?? 0}</strong> ({d.actual}%)
                    </p>
                    <p className="text-indigo-700">
                      Calib: <strong>{d.calibrationCount ?? 0}</strong> ({d.calibration}%)
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
