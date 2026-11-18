import React, { useCallback, useEffect, useRef, useState } from "react";

interface DualScrollTableContainerProps {
  children: React.ReactNode;
  className?: string;
}

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

  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateMetrics = useCallback(() => {
    const el = bottomScrollRef.current;
    if (!el) return;
    const sw = el.scrollWidth;
    const cw = el.clientWidth;
    const sl = el.scrollLeft;
    setScrollWidth(sw);
    const overflow = sw > cw + 2;
    setHasOverflow(overflow);
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

  return (
    <div className={`flex flex-col overflow-hidden ${className}`}>
      {hasOverflow && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto overflow-y-hidden w-full border-b border-gray-200 bg-slate-50/70"
          aria-label="Horizontal table scroll atas"
        >
          <div style={{ width: `${scrollWidth}px`, height: 1 }} />
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
