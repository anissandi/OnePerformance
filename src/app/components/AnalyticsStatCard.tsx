import React from "react";

export type AnalyticsCardTone =
  | "navy"
  | "emerald"
  | "terracotta"
  | "slate"
  | "plum"
  | "teal"
  | "rose";

export interface AnalyticsToneSpec {
  gradient: string;
  border: string;
  accentHex: string;
}

export const ANALYTICS_CARD_TONES: Record<AnalyticsCardTone, AnalyticsToneSpec> = {
  navy: {
    gradient: "from-[#EAEFF9] via-[#F6F8FD] to-white",
    border: "border-[#DCE3F2]",
    accentHex: "#1E3A6E",
  },
  emerald: {
    gradient: "from-[#E6F4EE] via-[#F4FAF7] to-white",
    border: "border-[#D3EBE1]",
    accentHex: "#2D6A5B",
  },
  terracotta: {
    gradient: "from-[#FBECE5] via-[#FDF7F4] to-white",
    border: "border-[#F2DCD2]",
    accentHex: "#A85D43",
  },
  slate: {
    gradient: "from-[#ECEFF8] via-[#F7F8FC] to-white",
    border: "border-[#DDE2F0]",
    accentHex: "#142546",
  },
  plum: {
    gradient: "from-[#F2ECF9] via-[#F9F6FD] to-white",
    border: "border-[#E4D8F3]",
    accentHex: "#5B3E86",
  },
  teal: {
    gradient: "from-[#E4F4F6] via-[#F3FAFB] to-white",
    border: "border-[#CDE6EA]",
    accentHex: "#1B6B7A",
  },
  rose: {
    gradient: "from-[#FCECEF] via-[#FDF5F7] to-white",
    border: "border-[#F3D5DC]",
    accentHex: "#9E3B52",
  },
};

const SPARKLINE_PATHS = [
  "M2 20L16 14L26 17L40 9L50 12L62 5",
  "M2 18L14 15L28 11L39 14L52 7L62 4",
  "M2 19L15 12L27 15L41 8L51 10L62 5",
  "M2 17L16 16L29 10L42 12L53 6L62 4",
];

export function AnalyticsStatCard({
  title,
  value,
  subtitle,
  icon,
  tone = "navy",
  index = 0,
  compact = false,
  className = "",
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  tone?: AnalyticsCardTone;
  index?: number;
  compact?: boolean;
  className?: string;
}) {
  const spec = ANALYTICS_CARD_TONES[tone];
  const sparkPath = SPARKLINE_PATHS[index % SPARKLINE_PATHS.length];

  return (
    <div
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
      className={`group relative overflow-hidden bg-gradient-to-br ${spec.gradient} border ${spec.border} rounded-2xl ${
        compact ? "p-3.5 min-h-[116px]" : "p-4 min-h-[126px]"
      } flex flex-col justify-between shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg pa-card-motion ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-5 -bottom-6 w-24 h-24 rounded-full transition-transform duration-500 ease-out group-hover:scale-125"
        style={{ backgroundColor: `${spec.accentHex}0D` }}
      />
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="min-w-0 flex-1">
          <p className={`${compact ? "text-[11px] leading-snug line-clamp-2" : "text-xs truncate"} font-medium text-gray-500`} title={title}>
            {title}
          </p>
          <p className={`${compact ? "text-xl" : "text-2xl"} font-extrabold text-[#111827] leading-tight mt-0.5 tabular-nums`}>
            {value}
          </p>
        </div>
        <div
          className={`${
            compact ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl"
          } text-white flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-3`}
          style={{ backgroundColor: spec.accentHex }}
        >
          {icon}
        </div>
      </div>
      <div className={`flex items-end justify-between gap-2 ${compact ? "mt-2.5" : "mt-4"} relative z-10`}>
        <p className={`${compact ? "text-[10px]" : "text-[11px]"} text-gray-500 font-medium truncate`}>
          {subtitle}
        </p>
        <svg
          className={`${compact ? "w-11 h-4" : "w-14 h-5"} shrink-0 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5`}
          viewBox="0 0 64 24"
          fill="none"
        >
          <path
            d={sparkPath}
            stroke={spec.accentHex}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
