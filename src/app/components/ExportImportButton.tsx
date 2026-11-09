import React, { useRef, useState, useEffect } from "react";
import { Download, Upload, ChevronDown } from "lucide-react";

interface Props {
  onExport: () => void;
  onImport: (file: File) => void;
  label?: string;
  size?: "sm" | "md";
}

export default function ExportImportButton({ onExport, onImport, label = "Export / Import", size = "md" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { onImport(file); setOpen(false); }
    e.target.value = "";
  };

  const isSm = size === "sm";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 transition-all shadow-sm rounded-lg ${
          isSm ? "px-3.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"
        }`}
      >
        <Download className={isSm ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {label}
        <ChevronDown className={`${isSm ? "w-3 h-3" : "w-3.5 h-3.5"} transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <button
            onClick={() => { onExport(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" />
            Export (.xlsx)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0" />
            Import (.xlsx)
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
