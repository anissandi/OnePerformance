import React, { useState, useRef, useEffect, useCallback } from "react";
import { feedbackActivationError, loadFeedbackActivation, saveFeedbackActivation } from "../shared/feedbackActivationStore";
import { DatePickerID } from "../../components/DatePickerID";
import { createPortal } from "react-dom";
import {
  ChevronDown, Calendar, Lock, CheckCircle2, TrendingUp, Lightbulb,
  ClipboardList, Briefcase, FolderKanban, MessageSquare, X, Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const POSITION_OPTIONS = [
  "Top Management",
  "General Manager",
  "Kepala/Wakil Kepala Divisi",
  "Kepala/Wakil Kepala Departemen",
  "Kepala/Wakil Kepala Bagian",
  "Kepala/Wakil Kepala Seksi Operational",
  "Operasional",
  "All",
];

const YEARS = ["2026", "2025", "2024"];

interface Module {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  active: boolean;
  startDate: string;
  endDate: string;
  dateLockPerMonth?: string;
  backlogMonths?: string[];
  backlogEndDate?: string;
  activationFor: string[];
}

const INITIAL_MODULES: Module[] = [
  {
    id: "inter-department-feedback",
    label: "Inter-Department Feedback",
    icon: MessageSquare,
    description: "Nominasi 3 pemberi feedback, feedback anonim, summary, dan tindak lanjut approver",
    active: false,
    startDate: "",
    endDate: "",
    activationFor: ["All"],
  },
  {
    id: "kpi-setting",
    label: "KPI · Setting",
    icon: TrendingUp,
    description: "Jadwal penyusunan dan pengesahan KPI",
    active: true,
    startDate: "2026-01-02",
    endDate: "2026-01-31",
    activationFor: ["All"],
  },
  {
    id: "kpi-measurement",
    label: "KPI · Measurement",
    icon: TrendingUp,
    description: "Jadwal KPI tracking dan pengesahan hasil pengukuran",
    active: false,
    startDate: "",
    endDate: "",
    dateLockPerMonth: "",
    activationFor: ["All"],
  },
  {
    id: "smart-goals-measurement",
    label: "SMART Goals · Measurement",
    icon: Lightbulb,
    description: "Jadwal evaluasi dan pengesahan SMART Goals",
    active: false,
    startDate: "",
    endDate: "",
    activationFor: ["All"],
  },
  {
    id: "smart-goals-setting",
    label: "SMART Goals · Setting",
    icon: Lightbulb,
    description: "Jadwal penyusunan dan pengesahan SMART Goals",
    active: true,
    startDate: "2026-01-02",
    endDate: "2026-01-31",
    activationFor: ["All"],
  },
  {
    id: "appraisal-form",
    label: "Appraisal Form",
    icon: ClipboardList,
    description: "Behavioural competency self-assessment and supervisor evaluation",
    active: false,
    startDate: "2026-02-01",
    endDate: "2026-07-31",
    activationFor: [],
  },
  {
    id: "managerial-skill",
    label: "Managerial Skill",
    icon: Briefcase,
    description: "Managerial competency assessment for supervisor level and above",
    active: false,
    startDate: "2026-02-01",
    endDate: "2026-07-31",
    activationFor: [
      "Top Management",
      "General Manager",
      "Kepala/Wakil Kepala Divisi",
      "Kepala/Wakil Kepala Departemen",
    ],
  },
  {
    id: "project",
    label: "Project",
    icon: FolderKanban,
    description: "Project Outside Job Scope registration and measurement tracking",
    active: false,
    startDate: "2026-01-02",
    endDate: "2026-07-31",
    activationFor: [],
  },
  {
    id: "management-interview",
    label: "Management Interview",
    icon: MessageSquare,
    description: "Final-stage management interview scheduling and scoring",
    active: false,
    startDate: "2026-09-01",
    endDate: "2026-11-30",
    activationFor: [],
  },
];

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiSelectDropdown({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (val: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Position the portal dropdown under the trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(POSITION_OPTIONS.length * 44, 360);
    const showAbove = spaceBelow < dropdownHeight + 8;
    setDropdownStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        (document.getElementById("ms-portal")?.contains(target))
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (option: string) => {
    if (option === "All") {
      onChange(selected.includes("All") ? [] : ["All"]);
      return;
    }
    const without = selected.filter((s) => s !== "All");
    if (without.includes(option)) {
      onChange(without.filter((s) => s !== option));
    } else {
      const next = [...without, option];
      const nonAllOptions = POSITION_OPTIONS.filter((o) => o !== "All");
      onChange(next.length === nonAllOptions.length ? ["All"] : next);
    }
  };

  const displayText =
    selected.length === 0
      ? "Select positions…"
      : selected.includes("All")
      ? "All Positions"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} positions selected`;

  const dropdownList = (
    <div
      id="ms-portal"
      style={{ ...dropdownStyle, maxHeight: 360, overflowY: "auto" }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl"
    >
      {POSITION_OPTIONS.map((opt) => {
        const isChecked = selected.includes(opt) || (opt !== "All" && selected.includes("All"));
        return (
          <button
            key={opt}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggle(opt)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
              isChecked ? "bg-[#1A284F]/5 text-[#1A284F] font-semibold" : "text-gray-700 hover:bg-gray-50"
            } ${opt === "All" ? "border-t border-gray-100" : ""}`}
          >
            <span
              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                isChecked ? "bg-[#1A284F] border-[#1A284F]" : "border-gray-300"
              }`}
            >
              {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
            </span>
            {opt}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { updatePosition(); setOpen((o) => !o); } }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          disabled
            ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
            : open
            ? "bg-white border-[#1A284F] text-gray-700 cursor-pointer"
            : "bg-white border-gray-200 text-gray-700 hover:border-[#1A284F] cursor-pointer"
        }`}
      >
        <span className={selected.length === 0 ? "text-gray-400" : ""}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Selected chips */}
      {selected.length > 0 && !selected.includes("All") && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1A284F]/10 text-[#1A284F]"
            >
              {s}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(s); }}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {open && createPortal(dropdownList, document.body)}
    </div>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────

function ModuleCard({
  module,
  onChange,
  onActivateClick,
  onDeactivateClick,
}: {
  module: Module;
  onChange: (id: string, patch: Partial<Module>) => void;
  onActivateClick: (id: string) => void;
  onDeactivateClick: (id: string) => void;
}) {
  const Icon = module.icon;
  const feedbackDateError = module.id === "inter-department-feedback"
    ? feedbackActivationError({ active: module.active, startDate: module.startDate, endDate: module.endDate })
    : "";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-100 ${module.active ? "bg-white" : "bg-gray-50/60"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${module.active ? "bg-[#1A284F]" : "bg-gray-200"}`}>
            <Icon className={`w-4.5 h-4.5 ${module.active ? "text-white" : "text-gray-400"}`} style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-[#1A284F] text-base">{module.label}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                module.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              }`}>
                {module.active ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{module.description}</p>
          </div>
        </div>

        {module.active ? (
          <button
            onClick={() => onDeactivateClick(module.id)}
            className="px-4 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
          >
            Deactivate
          </button>
        ) : (
          <button
            onClick={() => onActivateClick(module.id)}
            className="px-4 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors"
          >
            Activate
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="px-6 py-5 flex flex-col gap-4">
        {/* Date row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" /> {module.id === "inter-department-feedback" ? "Mulai Nominasi & Feedback" : "Start Date"}
            </label>
            <DatePickerID value={module.startDate} onChange={(iso) => onChange(module.id, { startDate: iso })} disabled={!module.active} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" /> {module.id === "inter-department-feedback" ? "Akhir Summary & Approval" : "End Date"}
            </label>
            <DatePickerID value={module.endDate} onChange={(iso) => onChange(module.id, { endDate: iso })} disabled={!module.active} />
          </div>
        </div>

        {module.id === "inter-department-feedback" && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs leading-relaxed text-gray-500">
              Periode dari Mulai Nominasi & Feedback sampai Akhir Summary & Approval mencakup seluruh proses: pemilihan tepat 3 pemberi feedback, pengisian feedback anonim, penyusunan summary oleh penerima, serta tindak lanjut Approver 1 dan Approver 2.
            </p>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
              Pilihan tiga pemberi feedback terkunci setelah dikirim. Summary hanya dapat disubmit setelah ketiga feedback anonim diterima.
            </div>
            {!!feedbackDateError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
              Konfigurasi jadwal belum valid: {feedbackDateError} Semua nominasi, feedback, dan summary akan diblokir sampai tanggal diperbaiki.
            </div>}
          </div>
        )}

        {module.id === "kpi-measurement" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="kpi-monthly-lock-day" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Lock className="w-3.5 h-3.5 text-gray-400" /> Date Lock Per Month
            </label>
            <select
              id="kpi-monthly-lock-day"
              value={module.dateLockPerMonth ?? ""}
              onChange={(event) => onChange(module.id, { dateLockPerMonth: event.target.value })}
              disabled={!module.active}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#1A284F] focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">Pilih tanggal</option>
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={String(day)}>{day}</option>
              ))}
            </select>
            <p className="text-xs leading-relaxed text-gray-500">Pilih tanggal 1–28 sebagai batas submit tracking bulan sebelumnya pada bulan berikutnya, sampai akhir tanggal tersebut (WIB). Contoh tanggal 10: tracking September dapat disubmit sepanjang 10 Oktober dan terkunci mulai 11 Oktober pukul 00:00 WIB. Tracking Oktober juga dapat disubmit pada Oktober jika sudah selesai.</p>
          </div>
        )}

        {module.id === "kpi-measurement" && (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <fieldset disabled={!module.active} className="flex flex-col gap-2">
              <legend className="text-xs font-semibold text-gray-700">Bulan Tracking Tertinggal</legend>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {["Januari", "Februari", "Maret", "April"].map((month, index) => {
                  const monthValue = String(index + 1);
                  const selectedMonths = module.backlogMonths ?? [];
                  return (
                    <label key={monthValue} className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={selectedMonths.includes(monthValue)}
                        onChange={(event) => onChange(module.id, { backlogMonths: event.target.checked
                          ? [...selectedMonths, monthValue].sort((first, second) => Number(first) - Number(second))
                          : selectedMonths.filter((value) => value !== monthValue) })}
                        className="h-4 w-4 accent-amber-700 disabled:cursor-not-allowed" />
                      {month}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-700">Batas Submit Bulan Tertinggal</label>
              <DatePickerID value={module.backlogEndDate ?? ""}
                onChange={(iso) => onChange(module.id, { backlogEndDate: iso })}
                disabled={!module.active} />
            </div>
            <p className="text-xs leading-relaxed text-amber-900">Untuk bulan terpilih, pembukaan khusus mencakup submission awal, approval, dan submit ulang revisi sampai akhir tanggal batas (WIB), sesuai cakupan aktivasi. Contoh: Januari–Maret saat input dimulai April. Date Lock Per Month tetap berlaku untuk bulan lainnya; urutan approval dan penguncian hasil final tidak berubah.</p>
            {(module.backlogMonths ?? []).length > 0 && !module.backlogEndDate && (
              <p role="alert" className="text-xs font-semibold text-red-700">Lengkapi batas tanggal sebelum pembukaan bulan tertinggal dapat berlaku.</p>
            )}
          </div>
        )}

        {/* Activation for */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-600">Activation for:</label>
          <MultiSelectDropdown
            selected={module.activationFor}
            onChange={(val) => onChange(module.id, { activationFor: val })}
            disabled={!module.active}
          />
        </div>

        {/* Access window info */}
        {module.active && module.startDate && module.endDate && (
          <div className="flex items-center gap-2 px-4 py-3 bg-[#F8F7F4] rounded-xl text-xs text-[#8C7B5D]">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>
              {module.activationFor.length === 0
                ? "No positions selected — please choose who can access this module."
                : `${module.activationFor.includes("All") ? "All positions" : module.activationFor.join(", ")} can access this module from ${module.startDate} to ${module.endDate}.`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HRModuleActivation() {
  const loadModules = (selectedYear: string) => {
    let saved: Record<string, Partial<Module>> = {};
    try { saved = JSON.parse(localStorage.getItem(`pa_module_activation_${selectedYear}`) ?? "{}"); } catch {}
    return INITIAL_MODULES.map((module) => ({
      ...module,
      ...saved[module.id],
      ...(module.id === "inter-department-feedback" ? loadFeedbackActivation(selectedYear) : {}),
      ...(module.id === "kpi-measurement" ? {
        backlogMonths: Array.isArray(saved[module.id]?.backlogMonths)
          ? saved[module.id]!.backlogMonths!.filter((month) => ["1", "2", "3", "4"].includes(month)) : [],
        dateLockPerMonth: /^(?:[1-9]|1[0-9]|2[0-8])$/.test(saved[module.id]?.dateLockPerMonth ?? "")
          ? saved[module.id]!.dateLockPerMonth : "",
      } : {}),
      id: module.id,
      label: module.label,
      icon: module.icon,
    }));
  };
  const [year, setYear] = useState("2026");
  const [modules, setModules] = useState<Module[]>(() => loadModules("2026"));
  useEffect(() => {
    setModules(loadModules(year));
  }, [year]);

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"activate" | "deactivate">("activate");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const updateModule = (id: string, patch: Partial<Module>) => {
    const updated = { ...modules.find((module) => module.id === id)!, ...patch };
    if (id === "inter-department-feedback") saveFeedbackActivation(year, {
      active: updated.active, startDate: updated.startDate,
      endDate: updated.endDate,
    });
    const settings = Object.fromEntries(modules.map((module) => {
      const value = module.id === id ? updated : module;
      return [value.id, { active: value.active, startDate: value.startDate, endDate: value.endDate,
        activationFor: value.activationFor,
        dateLockPerMonth: value.dateLockPerMonth,
        backlogMonths: value.backlogMonths, backlogEndDate: value.backlogEndDate }];
    }));
    localStorage.setItem(`pa_module_activation_${year}`, JSON.stringify(settings));
    setModules((prev) => prev.map((module) => module.id === id ? updated : module));
  };

  const handleActivateClick = (id: string) => {
    setPendingId(id);
    setPendingAction("activate");
    setShowConfirm(true);
  };

  const handleDeactivateClick = (id: string) => {
    setPendingId(id);
    setPendingAction("deactivate");
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (pendingId) {
      updateModule(pendingId, { active: pendingAction === "activate" });
    }
    setShowConfirm(false);
    setTimeout(() => setShowSuccess(true), 250);
  };

  const activeCount = modules.filter((m) => m.active).length;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Module Activation</h1>
          <p className="text-gray-500 text-sm">Control module access, activation period, and eligible positions</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary pill */}
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1A284F]/5 rounded-xl">
            <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Active</span>
            <span className="text-lg font-bold text-[#1A284F]">{activeCount}</span>
            <span className="text-xs text-gray-400">/ {modules.length}</span>
          </div>
          {/* Year selector */}
          <div className="flex items-center gap-2 bg-[#1A284F] text-white rounded-xl px-4 py-2.5 shadow-sm">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-transparent text-white text-sm font-semibold outline-none cursor-pointer"
            >
              {YEARS.map((y) => <option key={y} value={y} className="text-gray-900">{y}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-white/70" />
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {modules.map((mod) => (
          <ModuleCard
            key={mod.id}
            module={mod}
            onChange={updateModule}
            onActivateClick={handleActivateClick}
            onDeactivateClick={handleDeactivateClick}
          />
        ))}
      </div>

      {/* Confirm dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-md border-0 p-0 rounded-2xl overflow-hidden shadow-2xl" aria-describedby={undefined}>
          <div className="p-8">
            <DialogTitle className="text-xl font-bold text-[#1A284F] mb-2">Action Confirmation</DialogTitle>
            <p className="text-gray-600 text-sm mb-8">
              Are you sure you want to{" "}
              <span className={`font-bold ${pendingAction === "activate" ? "text-green-600" : "text-red-500"}`}>
                {pendingAction}
              </span>{" "}
              the <span className="font-bold text-[#1A284F]">
                {modules.find((m) => m.id === pendingId)?.label}
              </span> module?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-[#1A284F] text-[#1A284F] text-sm font-semibold hover:bg-[#1A284F]/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md border-0 p-0 rounded-2xl overflow-hidden shadow-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Module {pendingAction === "activate" ? "Activated" : "Deactivated"}</DialogTitle>
          <div className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#FDF9F1] rounded-full flex items-center justify-center mb-5">
              <CheckCircle2 className="w-8 h-8 text-[#C69A45]" />
            </div>
            <p className="text-[#1A284F] font-bold text-lg mb-1">
              Module {pendingAction === "activate" ? "Activated" : "Deactivated"}
            </p>
            <p className="text-gray-500 text-sm mb-6">
              The change has been applied successfully.
            </p>
            <button
              onClick={() => setShowSuccess(false)}
              className="px-8 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
