import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DAYS_SHORT = ["SEN", "SEL", "RAB", "KAM", "JUM", "SAB", "MIN"];

function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}-${m}-${y}`;
}

function displayToIso(display: string): string {
  if (!display) return "";
  const parts = display.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return "";
  return `${y}-${m}-${d}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  // 0=Sun, 1=Mon … convert to Mon-based index
  const raw = new Date(year, month, 1).getDay();
  return raw === 0 ? 6 : raw - 1; // Mon=0 … Sun=6
}

interface DatePickerIDProps {
  value: string;           // ISO YYYY-MM-DD, or ""
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function DatePickerID({
  value,
  onChange,
  className = "",
  placeholder = "DD-MM-YYYY",
  size = "md",
  disabled = false,
}: DatePickerIDProps) {
  const today = new Date();
  const initYear  = value ? parseInt(value.slice(0, 4)) : today.getFullYear();
  const initMonth = value ? parseInt(value.slice(5, 7)) - 1 : today.getMonth();

  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const [rawInput, setRawInput]   = useState(isoToDisplay(value));
  const [popupPos, setPopupPos]   = useState({ top: 0, left: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef     = useRef<HTMLDivElement>(null);

  // Sync display when controlled value changes externally
  useEffect(() => {
    setRawInput(isoToDisplay(value));
    if (value) {
      setViewYear(parseInt(value.slice(0, 4)));
      setViewMonth(parseInt(value.slice(5, 7)) - 1);
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on scroll so popup doesn't drift away from input
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  // Clamp popup to viewport edges
  const clampPopup = useCallback((rect: DOMRect) => {
    const POPUP_W = 256; // w-64
    const POPUP_H = 320; // approximate
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top  = rect.bottom + 4;
    let left = rect.left;

    // Flip above if not enough room below
    if (top + POPUP_H > vh - 8) top = rect.top - POPUP_H - 4;
    // Clamp to right edge
    if (left + POPUP_W > vw - 8) left = vw - POPUP_W - 8;
    // Clamp to left edge
    if (left < 8) left = 8;

    setPopupPos({ top, left });
  }, []);

  const openCalendar = () => {
    if (disabled) return;
    if (containerRef.current) {
      clampPopup(containerRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = useCallback((day: number) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(iso);
    setRawInput(isoToDisplay(iso));
    setOpen(false);
  }, [viewYear, viewMonth, onChange]);

  const handleRawChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRawInput(val);
    const iso = displayToIso(val);
    if (iso) {
      onChange(iso);
      setViewYear(parseInt(iso.slice(0, 4)));
      setViewMonth(parseInt(iso.slice(5, 7)) - 1);
    }
  };

  const selectedDay   = value ? parseInt(value.slice(8, 10)) : null;
  const selectedMonth = value ? parseInt(value.slice(5, 7)) - 1 : null;
  const selectedYear  = value ? parseInt(value.slice(0, 4)) : null;

  const totalDays  = daysInMonth(viewYear, viewMonth);
  const startIndex = firstDayOfMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(startIndex).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  const inputCls = size === "sm"
    ? "text-xs px-2.5 py-1.5"
    : "text-xs px-3 py-2";

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Input trigger */}
      <div className="relative">
        <input
          type="text"
          value={rawInput}
          onChange={handleRawChange}
          onFocus={() => {
            if (!disabled && containerRef.current) {
              clampPopup(containerRef.current.getBoundingClientRect());
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          maxLength={10}
          disabled={disabled}
          className={`w-full border border-gray-200 rounded-lg outline-none focus:border-[#1A284F] pr-8 ${inputCls} font-mono ${disabled ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={openCalendar}
          className={`absolute right-2 top-1/2 -translate-y-1/2 ${disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:text-[#1A284F]"}`}
        >
          <Calendar className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Calendar popup — fixed position to escape overflow:hidden ancestors */}
      {open && (
        <div
          ref={popupRef}
          style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-xl border border-gray-100 p-4 w-64 select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[#1A284F]">
              {MONTHS_ID[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-[#1A284F] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-[#1A284F] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} />;
              const isSelected =
                day === selectedDay &&
                viewMonth === selectedMonth &&
                viewYear === selectedYear;
              const isToday =
                day === today.getDate() &&
                viewMonth === today.getMonth() &&
                viewYear === today.getFullYear();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`
                    h-8 w-full flex items-center justify-center rounded-full text-xs font-medium transition-colors
                    ${isSelected
                      ? "bg-[#1A284F] text-white"
                      : isToday
                      ? "text-[#1A284F] font-bold ring-1 ring-[#1A284F]/30"
                      : "text-gray-700 hover:bg-[#1A284F]/10 hover:text-[#1A284F]"
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
