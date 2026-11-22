import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TablePaginationBar({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemLabel = "karyawan",
}: {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}) {
  if (totalItems <= pageSizeOptions[0]) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-600">
      <div className="flex items-center gap-3">
        <span>
          Menampilkan <strong className="text-gray-800 tabular-nums">{startIdx}–{endIdx}</strong> dari{" "}
          <strong className="text-gray-800 tabular-nums">{totalItems}</strong> {itemLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">·</span>
          <span className="text-gray-500">Per halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="border border-gray-200 bg-white rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span className="px-2.5 py-1 font-semibold text-gray-700 tabular-nums">
          Hal. {safePage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
