import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DualScrollTableContainerProps {
  children: React.ReactNode;
  className?: string;
  scrollStep?: number;
}

/**
 * Pembungkus tabel lebar (KPI Setting, KPI Tracking, dsb.) yang menyediakan:
 * 1. Scrollbar horizontal di bagian ATAS dan BAWAH yang tersinkronisasi dua arah.
 * 2. Tombol geser Kiri / Kanan (beserta lompat ke awal / akhir) ketika tabel melebihi lebar layar.
 * Catatan: `overflow-x-auto` tetap berada langsung pada wrapper langsung `<table>` agar `position: sticky`
 * pada kolom freeze (No, Perspektif, KPI) dan Nama Section berfungsi optimal.
 */
export function DualScrollTableContainer({
  children,
  className = "rounded-xl border border-gray-200 shadow-sm bg-white",
  scrollStep = 420,
}: DualScrollTableContainerProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const syncingFromRef = useRef<"top" | "bottom" | null>(null);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateMetrics = useCallback(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const sw = el.scrollWidth;
    const cw = el.clientWidth;
    const sl = el.scrollLeft;
    setScrollWidth(sw);
    const overflow = sw > cw + 2;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && sl > 2);
    setCanScrollRight(overflow && sl + cw < sw - 2);
    if (topScrollRef.current && Math.abs(topScrollRef.current.scrollLeft - sl) > 1) {
      topScrollRef.current.scrollLeft = sl;
    }
  }, []);

  useEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    updateMetrics();

    const ro = new ResizeObserver(() => {
      updateMetrics();
    });
    ro.observe(el);
    const tableEl = el.querySelector("table");
    if (tableEl) ro.observe(tableEl);

    const mo = new MutationObserver(() => {
      updateMetrics();
    });
    mo.observe(el, { childList: true, subtree: true, attributes: false });

    window.addEventListener("resize", updateMetrics);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics]);

  const handleTopScroll = () => {
    if (syncingFromRef.current === "bottom") return;
    const topEl = topScrollRef.current;
    const botEl = bottomScrollRef.current;
    if (!topEl || !botEl) return;
    syncingFromRef.current = "top";
    botEl.scrollLeft = topEl.scrollLeft;
    updateMetrics();
    requestAnimationFrame(() => {
      syncingFromRef.current = null;
    });
  };

  const handleBottomScroll = () => {
    if (syncingFromRef.current === "top") return;
    const topEl = topScrollRef.current;
    const botEl = bottomScrollRef.current;
    if (!botEl) return;
    syncingFromRef.current = "bottom";
    if (topEl) topEl.scrollLeft = botEl.scrollLeft;
    updateMetrics();
    requestAnimationFrame(() => {
      syncingFromRef.current = null;
    });
  };

  const scrollByOffset = (delta: number) => {
    const botEl = bottomScrollRef.current;
    if (!botEl) return;
    botEl.scrollBy({ left: delta, behavior: "smooth" });
  };

  const scrollToEdge = (edge: "start" | "end") => {
    const botEl = bottomScrollRef.current;
    if (!botEl) return;
    botEl.scrollTo({
      left: edge === "start" ? 0 : botEl.scrollWidth,
      behavior: "smooth",
    });
  };

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      {hasOverflow && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/90 border-b border-gray-200 select-none">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => scrollToEdge("start")}
              disabled={!canScrollLeft}
              title="Geser ke paling kiri"
              className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 hover:text-[#1A284F] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scrollByOffset(-scrollStep)}
              disabled={!canScrollLeft}
              title="Geser ke kiri"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 hover:text-[#1A284F] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Geser Kiri</span>
            </button>
          </div>

          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden h-3.5 rounded bg-gray-200/60"
            aria-label="Horizontal table scroll atas"
          >
            <div style={{ width: `${scrollWidth}px`, height: 1 }} />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => scrollByOffset(scrollStep)}
              disabled={!canScrollRight}
              title="Geser ke kanan"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-100 hover:text-[#1A284F] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <span>Geser Kanan</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToEdge("end")}
              disabled={!canScrollRight}
              title="Geser ke paling kanan"
              className="p-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 hover:text-[#1A284F] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto w-full"
      >
        {children}
      </div>
    </div>
  );
}
