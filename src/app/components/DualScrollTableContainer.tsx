import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface DualScrollTableContainerProps {
  children: React.ReactNode;
  className?: string;
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Pembungkus tabel lebar (KPI Setting, KPI Tracking, dsb.) yang menyediakan:
 * 1. Scrollbar horizontal di bagian ATAS dan BAWAH yang tersinkronisasi dua arah.
 * Catatan: `overflow-x-auto` tetap berada langsung pada wrapper langsung `<table>` agar `position: sticky`
 * pada kolom freeze (No, Perspektif, KPI) dan Nama Section berfungsi optimal.
 */
export function DualScrollTableContainer({
  children,
  className = "rounded-xl border border-gray-200 shadow-sm bg-white",
}: DualScrollTableContainerProps) {
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const syncingFromRef = useRef<"top" | "bottom" | null>(null);
  const lastSwRef = useRef(0);
  const lastOverflowRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateMetrics = useCallback(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const sw = el.scrollWidth;
    const cw = el.clientWidth;
    const sl = el.scrollLeft;
    if (Math.abs(sw - lastSwRef.current) > 1) {
      lastSwRef.current = sw;
      setScrollWidth(sw);
    }
    // Hysteresis mencegah osilasi bolak-balik pada batas lebar ambang batas
    const prevOverflow = lastOverflowRef.current;
    const nextOverflow = prevOverflow ? sw > cw : sw > cw + 4;
    if (nextOverflow !== prevOverflow) {
      lastOverflowRef.current = nextOverflow;
      setHasOverflow(nextOverflow);
    }
    if (topScrollRef.current && Math.abs(topScrollRef.current.scrollLeft - sl) > 1) {
      topScrollRef.current.scrollLeft = sl;
    }
  }, []);

  useIsoLayoutEffect(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    updateMetrics();

    const scheduleUpdate = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        updateMetrics();
      });
    };

    const ro = new ResizeObserver(() => {
      scheduleUpdate();
    });
    ro.observe(el);
    const tableEl = el.querySelector("table");
    if (tableEl) ro.observe(tableEl);

    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      ro.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [updateMetrics, children]);

  const handleTopScroll = () => {
    if (syncingFromRef.current === "bottom") return;
    const topEl = topScrollRef.current;
    const botEl = bottomScrollRef.current;
    if (!topEl || !botEl) return;
    syncingFromRef.current = "top";
    botEl.scrollLeft = topEl.scrollLeft;
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
    requestAnimationFrame(() => {
      syncingFromRef.current = null;
    });
  };

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      {hasOverflow && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          style={{ height: 14, minHeight: 14, maxHeight: 14 }}
          className="pa-dual-scroll-top shrink-0 overflow-x-auto overflow-y-hidden w-full border-b border-gray-200 bg-slate-50/80"
          aria-label="Horizontal table scroll atas"
        >
          <div style={{ width: `${scrollWidth}px`, height: 1 }} />
        </div>
      )}

      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="pa-dual-scroll-bottom overflow-x-auto w-full"
      >
        {children}
      </div>
    </div>
  );
}
