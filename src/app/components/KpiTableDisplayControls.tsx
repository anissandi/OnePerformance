import { Maximize2, Minimize2, ALargeSmall } from "lucide-react";

export type KpiTableScale = "sm" | "md" | "lg";

export function dispatchTableFullscreen(fullscreen: boolean) {
  window.dispatchEvent(
    new CustomEvent("pa-table-fullscreen-change", { detail: { fullscreen } }),
  );
}

export function getKpiTableScaleClasses(scale: KpiTableScale): string {
  if (scale === "sm") {
    return "[&_table]:text-[10px] [&_th]:text-[10px] [&_th]:py-1.5 [&_th]:px-1.5 [&_td]:text-[10px] [&_td]:py-1.5 [&_td]:px-1.5 [&_p]:text-[10px] [&_span]:text-[10px]";
  }
  if (scale === "lg") {
    return "[&_table]:text-sm [&_th]:text-xs [&_th]:py-3.5 [&_th]:px-3 [&_td]:text-xs [&_td]:py-3.5 [&_td]:px-3 [&_p]:text-xs [&_span]:text-xs";
  }
  return "";
}

export function KpiTableDisplayControls({
  isFullscreen,
  onToggleFullscreen,
  tableScale,
  onCycleScale,
}: {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  tableScale: KpiTableScale;
  onCycleScale: () => void;
}) {
  const scaleLabel = tableScale === "sm" ? "Kecil" : tableScale === "lg" ? "Besar" : "Normal";

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit Full Screen" : "Full Screen"}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
          isFullscreen
            ? "bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200/70"
            : "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100"
        }`}
      >
        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        <span>{isFullscreen ? "Exit Full Screen" : "Full Screen"}</span>
      </button>

      <button
        type="button"
        onClick={onCycleScale}
        title="Ubah ukuran tabel & isi (Kecil / Normal / Besar)"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 transition-colors"
      >
        <ALargeSmall className="w-3.5 h-3.5" />
        <span>Ukuran: {scaleLabel}</span>
      </button>
    </div>
  );
}
