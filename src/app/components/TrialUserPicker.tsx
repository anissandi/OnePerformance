import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { ManagedUser } from "../store/authStore";

// 3 warna lembut berulang sebagai pembeda antar baris user
const SOFT_USER_PALETTES = [
  {
    card: "bg-sky-50/85 hover:bg-sky-100/80 border-sky-200/80",
    badge: "bg-sky-100 text-sky-800",
  },
  {
    card: "bg-emerald-50/85 hover:bg-emerald-100/80 border-emerald-200/80",
    badge: "bg-emerald-100 text-emerald-800",
  },
  {
    card: "bg-amber-50/85 hover:bg-amber-100/80 border-amber-200/80",
    badge: "bg-amber-100 text-amber-800",
  },
] as const;

interface TrialUserPickerProps {
  users: ManagedUser[];
  selectedEmployeeId?: string;
  onSelect: (user: ManagedUser) => void;
  showCompany?: boolean;
  placeholder?: string;
  maxHeightClass?: string;
  autoFocusSearch?: boolean;
}

export function TrialUserPicker({
  users,
  selectedEmployeeId,
  onSelect,
  showCompany = false,
  placeholder = "Cari ID, nama, jabatan...",
  maxHeightClass = "max-h-56",
  autoFocusSearch = false,
}: TrialUserPickerProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.employeeId, u.regNo, u.name, u.position, u.department, u.division, u.company]
        .some((v) => String(v ?? "").toLowerCase().includes(q)),
    );
  }, [users, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          autoFocus={autoFocusSearch}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-7 py-1.5 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#1A284F]"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Bersihkan pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className={`${maxHeightClass} overflow-y-auto space-y-1.5 pr-0.5`}>
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-gray-400">
            User tidak ditemukan.
          </p>
        ) : (
          filtered.map((u, idx) => {
            const palette = SOFT_USER_PALETTES[idx % SOFT_USER_PALETTES.length];
            const isSelected =
              Boolean(selectedEmployeeId) &&
              u.employeeId.toLowerCase() === selectedEmployeeId!.toLowerCase();
            const positionLabel = u.position?.trim() || "—";
            const subMeta = showCompany
              ? `${positionLabel}${u.company ? ` · ${u.company}` : ""}`
              : `${positionLabel}${u.department ? ` · ${u.department}` : ""}`;

            return (
              <button
                key={u.employeeId}
                type="button"
                onClick={() => onSelect(u)}
                className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors flex items-start justify-between gap-2 ${palette.card} ${
                  isSelected ? "ring-1 ring-[#1A284F]" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${palette.badge}`}>
                      {u.employeeId}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 truncate">
                      {u.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 truncate mt-0.5" title={subMeta}>
                    {subMeta}
                  </p>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-[#1A284F] shrink-0 mt-0.5" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
