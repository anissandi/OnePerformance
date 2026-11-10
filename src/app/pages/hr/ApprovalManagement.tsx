import React, { useState, useEffect } from "react";
import { useRouteTab } from "../../utils/useRouteTab";
import { loadPersistedState, savePersistedState } from "../../services/supabaseClient";
import {
  TrendingUp, CheckCircle2, Save, ArrowDown, Shield,
  LayoutGrid, Building2, Users, ChevronDown, ClipboardList, Pencil,
  UserCheck, Search, CheckSquare, Link2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";

// ─── Reference data ───────────────────────────────────────────────────────────

const COMPANY_UNITS = [
  "PT RSUP (Industry)",
  "PT RSUP (Perkebunan)",
  "PT Pulau Sambu (Jakarta)",
  "PT Pulau Sambu (Guntung)",
  "PT Pulau Sambu (Kuala Enok)",
  "PT RSTM",
  "PT GHS",
  "ASD",
];

const USER_LEVELS = [
  "Operator",
  "Staff",
  "Pengawas",
  "Officer",
  "Wakil Kepala Seksi/Shift",
  "Kepala Seksi/Shift",
  "Wakil Kepala Bagian",
  "Kepala Bagian",
  "Supervisor",
  "Wakil Kepala Departemen",
  "Kepala Departemen",
  "Wakil Manager Departemen",
  "Manager Depatemen",
  "Wakil Manager Divisi",
  "Manager Devisi",
  "Koordinator/GM",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalLevel {
  levelNum: number;
  label: string;
  approver: string;
  toggleable: boolean;
  enabled: boolean;
  fixed: boolean;
}

interface FlowConfig {
  levels: ApprovalLevel[];
}

const ICF_NAMES = [
  "Anis Sandi",
  "Abdul Karim",
  "Mario Sesman",
  "Riko Sianturi",
  "Rury Nasution",
];

// configs keyed by "companyUnit||userLevel"
type KsgConfigMap   = Record<string, FlowConfig>;
type OtherConfigMap = Record<string, FlowConfig>;

// ─── Level defs ───────────────────────────────────────────────────────────────

const KSG_LEVEL_DEFS = [
  { levelNum: 1, label: "Check",      toggleable: false, fixed: true,  fixedApprover: "HR (Unit Usaha)"         },
  { levelNum: 2, label: "Approver 1", toggleable: true,  fixed: false                                           },
  { levelNum: 3, label: "Approver 2", toggleable: true,  fixed: false                                           },
  { levelNum: 4, label: "Validate",   toggleable: false, fixed: true,  fixedApprover: "HR Strategic Specialist" },
] as const;

const OTHER_LEVEL_DEFS = [
  { levelNum: 1, label: "Level 1", toggleable: true, fixed: false },
  { levelNum: 2, label: "Level 2", toggleable: true, fixed: false },
] as const;

interface ApproverPerson { name: string; nik: string; position: string; }
const fmtApprover = (p: ApproverPerson) => `${p.name} · ${p.nik} · ${p.position}`;

const ICF_APPROVER_PEOPLE: ApproverPerson[] = [
  { name: "Soepriono",        nik: "0030001", position: "HR Strategic Specialist"   },
  { name: "Syafrudin",        nik: "0030002", position: "HR Business Partner"        },
  { name: "Satrio",           nik: "0030003", position: "HR Strategic Specialist"   },
  { name: "Leonard Pakpahan", nik: "0030004", position: "Kepala Divisi SDM"          },
  { name: "Amirudin Saud",    nik: "0030005", position: "HR Business Partner"        },
  { name: "Sofian Razak",     nik: "0030006", position: "General Manager"            },
];
const ICF_APPROVER_NAMES = ICF_APPROVER_PEOPLE.map(fmtApprover);

const ICF_PRIMARY_APPROVER_OPTIONS: Record<number, string[]> = {
  2: ICF_APPROVER_NAMES,
  3: ICF_APPROVER_NAMES,
};

const ICF_SECONDARY_APPROVER_OPTIONS: Record<number, string[]> = {
  1: ICF_APPROVER_NAMES,
  2: ICF_APPROVER_NAMES,
};

const ICF_PRIMARY_LEVEL_DEFS = [
  { levelNum: 1, label: "Check",      toggleable: false, fixed: true,  fixedApprover: "HR (Unit Usaha)"         },
  { levelNum: 2, label: "Approver 1", toggleable: true,  fixed: false                                           },
  { levelNum: 3, label: "Approver 2", toggleable: true,  fixed: false                                           },
  { levelNum: 4, label: "Validate",   toggleable: false, fixed: true,  fixedApprover: "HR Strategic Specialist" },
] as const;

const ICF_SECONDARY_LEVEL_DEFS = [
  { levelNum: 1, label: "Level 1", toggleable: true, fixed: false },
  { levelNum: 2, label: "Level 2", toggleable: true, fixed: false },
] as const;

const APPROVER_PEOPLE: ApproverPerson[] = [
  { name: "Bambang Hermawan",   nik: "0040001", position: "Atasan Langsung (Direct Supervisor)"       },
  { name: "Retno Puspitasari",  nik: "0040002", position: "HR Business Partner"                       },
  { name: "Agus Salim",         nik: "0040003", position: "Kepala Departemen Rekrutmen & Seleksi"     },
  { name: "Indah Kurniawati",   nik: "0040004", position: "Kepala Departemen Pengembangan SDM"        },
  { name: "Wahyu Pratama",      nik: "0040005", position: "Kepala Departemen Produksi"                },
  { name: "Dian Rahmawati",     nik: "0040006", position: "Kepala Departemen Keuangan"                },
  { name: "Surya Handoko",      nik: "0040007", position: "Kepala Departemen Akuntansi"               },
  { name: "Laila Fitriani",     nik: "0040008", position: "Kepala Departemen Pemasaran"               },
  { name: "Leonard Pakpahan",   nik: "0030004", position: "Kepala Divisi SDM"                         },
  { name: "Taufik Hidayat",     nik: "0040009", position: "Kepala Divisi Keuangan & Akuntansi"        },
  { name: "Eko Budiyanto",      nik: "0040010", position: "Kepala Divisi Operasional"                 },
  { name: "Nurul Huda",         nik: "0040011", position: "Kepala Divisi Pemasaran & Penjualan"       },
  { name: "Rizky Firmansyah",   nik: "0040012", position: "Kepala Divisi Teknologi Informasi"         },
  { name: "Sofian Razak",       nik: "0030006", position: "General Manager"                           },
  { name: "Irwan Santosa",      nik: "0040013", position: "COO"                                       },
  { name: "Amirudin Saud",      nik: "0030005", position: "Direktur SDM"                              },
  { name: "Herry Wibowo",       nik: "0040014", position: "Direktur Keuangan"                        },
  { name: "Prasetyo Nugroho",   nik: "0040015", position: "Direktur Operasional"                     },
  { name: "Sutanto Wijaya",     nik: "0040016", position: "Direktur Utama"                            },
];
const APPROVER_OPTIONS = APPROVER_PEOPLE.map(fmtApprover);

const LEVEL_STYLES: Record<number, { bg: string; border: string; text: string; dot: string }> = {
  1: { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500"   },
  2: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500" },
  3: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-400"  },
  4: { bg: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-700",   dot: "bg-teal-500"   },
};

const comboKey = (cu: string, ul: string) => `${cu}||${ul}`;

function makeKsgLevels(): ApprovalLevel[] {
  return KSG_LEVEL_DEFS.map((d) => ({
    levelNum: d.levelNum, label: d.label,
    approver: d.fixed ? (d.fixedApprover ?? "") : APPROVER_OPTIONS[0],
    toggleable: d.toggleable, enabled: true, fixed: d.fixed,
  }));
}

function makeOtherLevels(): ApprovalLevel[] {
  return OTHER_LEVEL_DEFS.map((d) => ({
    levelNum: d.levelNum, label: d.label,
    approver: APPROVER_OPTIONS[0],
    toggleable: d.toggleable, enabled: true, fixed: false,
  }));
}

function makeIcfPrimaryLevels(): ApprovalLevel[] {
  return ICF_PRIMARY_LEVEL_DEFS.map((d) => ({
    levelNum: d.levelNum, label: d.label,
    approver: d.fixed ? (d.fixedApprover ?? "") : (ICF_APPROVER_NAMES[0] ?? APPROVER_OPTIONS[0]),
    toggleable: d.toggleable, enabled: true, fixed: d.fixed,
  }));
}

function makeIcfSecondaryLevels(): ApprovalLevel[] {
  return ICF_SECONDARY_LEVEL_DEFS.map((d) => ({
    levelNum: d.levelNum, label: d.label,
    approver: ICF_APPROVER_NAMES[0] ?? APPROVER_OPTIONS[0],
    toggleable: d.toggleable, enabled: true, fixed: false,
  }));
}

// ─── Unit/Level selector ──────────────────────────────────────────────────────

function SelectorDropdown({
  icon: Icon,
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#1A284F] transition-colors pr-9"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function UnitLevelSelector({
  companyUnit, userLevel,
  onCompanyUnitChange, onUserLevelChange,
}: {
  companyUnit: string; userLevel: string;
  onCompanyUnitChange: (v: string) => void;
  onUserLevelChange: (v: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">
        Select Scope — required before configuring approval flow
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectorDropdown
          icon={Building2}
          label="Company Unit"
          value={companyUnit}
          options={COMPANY_UNITS}
          placeholder="— Choose Company Unit —"
          onChange={onCompanyUnitChange}
        />
        <SelectorDropdown
          icon={Users}
          label="User Level"
          value={userLevel}
          options={USER_LEVELS}
          placeholder="— Choose User Level —"
          onChange={(v) => { onUserLevelChange(v); }}
        />
      </div>
      {(!companyUnit || !userLevel) && (
        <p className="mt-3 text-xs text-amber-600 font-medium">
          Please select both Company Unit and User Level to configure the approval flow.
        </p>
      )}
    </div>
  );
}

// ─── ICF Scope Selector (Company Unit + ICF Name) ────────────────────────────

function IcfScopeSelector({
  companyUnit, icfName,
  onCompanyUnitChange, onIcfNameChange,
}: {
  companyUnit: string; icfName: string;
  onCompanyUnitChange: (v: string) => void;
  onIcfNameChange: (v: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">
        Select Scope — required before configuring approval flow
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectorDropdown
          icon={Building2}
          label="Company Unit"
          value={companyUnit}
          options={COMPANY_UNITS}
          placeholder="— Choose Company Unit —"
          onChange={onCompanyUnitChange}
        />
        <SelectorDropdown
          icon={Users}
          label="ICF Name"
          value={icfName}
          options={ICF_NAMES}
          placeholder="— Choose ICF Name —"
          onChange={onIcfNameChange}
        />
      </div>
      {(!companyUnit || !icfName) && (
        <p className="mt-3 text-xs text-amber-600 font-medium">
          Please select both Company Unit and ICF Name to configure the approval flow.
        </p>
      )}
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-1.5 select-none">
      <span className="text-[10px] font-semibold text-gray-500">{on ? "Active" : "Inactive"}</span>
      <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${on ? "bg-[#1A284F]" : "bg-gray-300"}`}>
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
      </div>
    </button>
  );
}

// ─── Approval Flow Panel ──────────────────────────────────────────────────────

// syncedLevels: levelNum → label of the source (e.g. "Approver 1 on KPI & Smart Goals")
function ApprovalFlowPanel({ config, onChange, levelApproverOptions, syncedLevels }: {
  config: FlowConfig;
  onChange: (levels: ApprovalLevel[]) => void;
  levelApproverOptions?: Record<number, string[]>;
  syncedLevels?: Record<number, string>;
}) {
  const updateApprover = (idx: number, approver: string) =>
    onChange(config.levels.map((l, i) => (i === idx ? { ...l, approver } : l)));
  const toggleLevel = (idx: number) =>
    onChange(config.levels.map((l, i) => (i === idx ? { ...l, enabled: !l.enabled } : l)));
  const activeLevels = config.levels.filter((l) => l.enabled);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
        <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">E</span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Initiator</p>
          <p className="text-xs font-semibold text-gray-600">Employee</p>
        </div>
        <span className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
          {activeLevels.length} active
        </span>
      </div>

      {config.levels.map((level, idx) => {
        const style = LEVEL_STYLES[level.levelNum] ?? LEVEL_STYLES[1];
        const isActive = level.enabled;
        const showArrow = isActive && (idx === 0 || config.levels.slice(0, idx).some((l) => l.enabled));
        return (
          <React.Fragment key={level.levelNum}>
            {showArrow && <div className="flex justify-center"><ArrowDown className="w-3.5 h-3.5 text-gray-300" /></div>}
            <div className={`rounded-xl border-2 transition-all ${isActive ? `${style.border} ${style.bg}` : "border-dashed border-gray-200 bg-gray-50 opacity-55"}`}>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/60">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? style.dot : "bg-gray-300"}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wide flex-1 ${isActive ? style.text : "text-gray-400"}`}>
                  Level {level.levelNum} — {level.label}
                </span>
                {level.toggleable && <ToggleSwitch on={isActive} onToggle={() => toggleLevel(idx)} />}
              </div>
              <div className="px-3 py-2.5">
                {!isActive ? (
                  <p className="text-xs text-gray-400 italic">Skipped in approval flow</p>
                ) : level.fixed ? (
                  <div className={`flex items-center gap-2 w-full border ${style.border} rounded-lg px-3 py-1.5 bg-white/60`}>
                    <span className={`text-xs font-semibold flex-1 ${style.text}`}>{level.approver}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 uppercase tracking-wide">Fixed</span>
                  </div>
                ) : syncedLevels?.[level.levelNum] ? (
                  <div className="flex flex-col gap-1.5">
                    <div className={`flex items-center gap-2 w-full border ${style.border} rounded-lg px-3 py-1.5 bg-white/60`}>
                      <span className={`text-xs font-semibold flex-1 ${style.text}`}>{level.approver || "—"}</span>
                      <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap">
                        <Link2 className="w-2.5 h-2.5" /> Auto
                      </span>
                    </div>
                    <p className="text-[10px] text-teal-600 font-medium pl-0.5 flex items-center gap-1">
                      <Link2 className="w-2.5 h-2.5 shrink-0" />
                      Synced from: {syncedLevels[level.levelNum]}
                    </p>
                  </div>
                ) : (
                  <select
                    value={level.approver}
                    onChange={(e) => updateApprover(idx, e.target.value)}
                    className={`w-full text-xs font-semibold border ${style.border} rounded-lg px-3 py-1.5 outline-none focus:border-[#1A284F] bg-white ${style.text}`}
                  >
                    {(levelApproverOptions?.[level.levelNum] ?? APPROVER_OPTIONS).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      <div className="flex justify-center"><ArrowDown className="w-3.5 h-3.5 text-gray-300" /></div>
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-green-600">Final</p>
          <p className="text-xs font-semibold text-green-700">Approved</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1A284F]/4 border border-[#1A284F]/10">
        <span className="text-[9px] font-bold text-[#1A284F] uppercase tracking-wide mr-1">Flow:</span>
        <span className="text-[9px] text-gray-500 font-medium">Employee</span>
        {activeLevels.map((l) => {
          const s = LEVEL_STYLES[l.levelNum] ?? LEVEL_STYLES[1];
          return (
            <React.Fragment key={l.levelNum}>
              <ArrowDown className="w-2.5 h-2.5 text-gray-300 -rotate-90" />
              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text}`}>{l.label}</span>
            </React.Fragment>
          );
        })}
        <ArrowDown className="w-2.5 h-2.5 text-gray-300 -rotate-90" />
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Done</span>
      </div>
    </div>
  );
}

// ─── Flow summary pill row ────────────────────────────────────────────────────

function FlowPills({ levels }: { levels: ApprovalLevel[] }) {
  const active = levels.filter((l) => l.enabled);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[9px] text-gray-400 font-medium">Emp</span>
      {active.map((l) => {
        const s = LEVEL_STYLES[l.levelNum] ?? LEVEL_STYLES[1];
        return (
          <React.Fragment key={l.levelNum}>
            <ArrowDown className="w-2.5 h-2.5 text-gray-300 -rotate-90 shrink-0" />
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${s.bg} ${s.border} ${s.text} whitespace-nowrap`}>
              {l.label}
            </span>
          </React.Fragment>
        );
      })}
      <ArrowDown className="w-2.5 h-2.5 text-gray-300 -rotate-90 shrink-0" />
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Done</span>
    </div>
  );
}

// ─── Combined Summary Table ───────────────────────────────────────────────────

function IcfSummaryTable({
  savedKeys, primaryMap, secondaryMap, onEdit,
}: {
  savedKeys: string[];
  primaryMap: KsgConfigMap;
  secondaryMap: OtherConfigMap;
  onEdit: (companyUnit: string, icfName: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <ClipboardList className="w-4 h-4 text-[#1A284F]" />
        <span className="text-sm font-bold text-[#1A284F]">Saved Configurations</span>
        <span className="ml-auto text-xs text-gray-400">{savedKeys.length} record{savedKeys.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Company Unit</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">ICF Name</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide">KPI &amp; Smart Goals Flow</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide">Other Module Flow</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {savedKeys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400 italic">
                  No configurations saved yet. Configure an approval flow above and click Save.
                </td>
              </tr>
            )}
            {savedKeys.map((k) => {
              const [cu, name] = k.split("||");
              const primary   = primaryMap[k];
              const secondary = secondaryMap[k];
              return (
                <tr key={k} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#1A284F] shrink-0" />{cu}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                      <Users className="w-3 h-3" />{name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {primary ? <FlowPills levels={primary.levels} /> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {secondary ? <FlowPills levels={secondary.levels} /> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEdit(cu, name)}
                      className="p-1.5 rounded-lg hover:bg-[#1A284F]/8 text-[#1A284F] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CombinedSummaryTable({
  savedKeys, primaryMap, secondaryMap, col1Label, col2Label, onEdit,
}: {
  savedKeys: string[];
  primaryMap: KsgConfigMap;
  secondaryMap: OtherConfigMap;
  col1Label: string;
  col2Label: string;
  onEdit: (companyUnit: string, userLevel: string) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        <ClipboardList className="w-4 h-4 text-[#1A284F]" />
        <span className="text-sm font-bold text-[#1A284F]">Saved Configurations</span>
        <span className="ml-auto text-xs text-gray-400">{savedKeys.length} record{savedKeys.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Company Unit</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">User Level</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide">{col1Label}</th>
              <th className="text-left px-4 py-2.5 font-bold text-gray-500 uppercase tracking-wide">{col2Label}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {savedKeys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400 italic">
                  No configurations saved yet. Configure an approval flow above and click Save.
                </td>
              </tr>
            )}
            {savedKeys.map((k) => {
              const [cu, ul] = k.split("||");
              const primary   = primaryMap[k];
              const secondary = secondaryMap[k];
              return (
                <tr key={k} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#1A284F] shrink-0" />{cu}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                      <Users className="w-3 h-3" />{ul}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {primary ? <FlowPills levels={primary.levels} /> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {secondary ? <FlowPills levels={secondary.levels} /> : <span className="text-gray-300 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEdit(cu, ul)}
                      className="p-1.5 rounded-lg hover:bg-[#1A284F]/8 text-[#1A284F] transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Delegation ───────────────────────────────────────────────────────────────

const SAMPLE_USERS = [
  // Supervisors
  { id: "s1", name: "Ahmad Fauzi",       nik: "0020001", dept: "Operasional",  unit: "PT RSUP (Industri)",          level: "Supervisor", role: "supervisor" },
  { id: "s2", name: "Rina Marlina",      nik: "0020002", dept: "Produksi",     unit: "PT RSUP (Industri)",          level: "Supervisor", role: "supervisor" },
  { id: "s3", name: "Budi Santoso",      nik: "0020003", dept: "Operasional",  unit: "PT RSUP (Perkebunan)",        level: "Supervisor", role: "supervisor" },
  { id: "s4", name: "Hendra Gunawan",    nik: "0020004", dept: "Keuangan",     unit: "PT Pulau Sambu (Guntung)",    level: "Supervisor", role: "supervisor" },
  { id: "s5", name: "Yuli Astuti",       nik: "0020005", dept: "SDM",          unit: "PT Pulau Sambu (Kuala Enok)", level: "Supervisor", role: "supervisor" },
  // Other levels
  { id: "u1", name: "Andi Wijaya",       nik: "0010001", dept: "HRD",          unit: "PT RSUP (Industri)",          level: "Kepala Departemen", role: "staff" },
  { id: "u2", name: "Siti Rahayu",       nik: "0010002", dept: "Keuangan",     unit: "PT RSUP (Industri)",          level: "Staff",             role: "staff" },
  { id: "u3", name: "Dewi Lestari",      nik: "0010003", dept: "SDM",          unit: "PT Pulau Sambu (Guntung)",    level: "Kepala Bagian",     role: "staff" },
  { id: "u4", name: "Rudi Hartono",      nik: "0010004", dept: "Produksi",     unit: "PT Pulau Sambu (Kuala Enok)", level: "Wakil Kepala Departemen", role: "staff" },
  { id: "u5", name: "Mega Wulandari",    nik: "0010005", dept: "Teknologi",    unit: "PT GHS",                     level: "Officer",           role: "staff" },
  { id: "u6", name: "Faisal Rahman",     nik: "0010006", dept: "Pemasaran",    unit: "PT RSTM",                    level: "Kepala Seksi/Shift",role: "staff" },
  { id: "u7", name: "Nita Kusuma",       nik: "0010007", dept: "Akuntansi",    unit: "PT Pulau Sambu (Jakarta)",   level: "Wakil Kepala Bagian", role: "staff" },
];

interface DelegationEntry {
  userId: string;
  delegateTo: string;
  delegateApproval: boolean;
  delegateKpiSetting: boolean;
  delegateKpiTracking: boolean;
}

// Pre-populated sample delegations for supervisors
const INITIAL_DELEGATIONS: Record<string, DelegationEntry> = {
  "s1": { userId: "s1", delegateTo: "s2", delegateApproval: true,  delegateKpiSetting: true,  delegateKpiTracking: true  },
  "s3": { userId: "s3", delegateTo: "s4", delegateApproval: true,  delegateKpiSetting: false, delegateKpiTracking: true  },
  "s5": { userId: "s5", delegateTo: "u1", delegateApproval: false, delegateKpiSetting: true,  delegateKpiTracking: false },
};

const DELEGATION_COLS = [
  { key: "delegateApproval"    as const, label: "Approval", color: "text-blue-700",  bg: "bg-blue-50",  border: "border-blue-200"  },
  { key: "delegateKpiSetting"  as const, label: "KPI",                 color: "text-purple-700",bg: "bg-purple-50",border: "border-purple-200"},
  { key: "delegateKpiTracking" as const, label: "SMART Goals",         color: "text-teal-700",  bg: "bg-teal-50",  border: "border-teal-200"  },
];

function WhiteCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
        checked
          ? "bg-[#1A284F] border-[#1A284F]"
          : "bg-white border-gray-300 hover:border-[#1A284F]"
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function DelegationPanel({
  delegations,
  onChange,
}: {
  delegations: Record<string, DelegationEntry>;
  onChange: (d: Record<string, DelegationEntry>) => void;
}) {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("");

  const filtered = SAMPLE_USERS.filter((u) => {
    const q = search.toLowerCase();
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.nik.includes(q) || u.dept.toLowerCase().includes(q);
    const matchU = !unitFilter || u.unit === unitFilter;
    return matchQ && matchU;
  });

  const hasActiveFilters = !!unitFilter;

  const getEntry = (uid: string): DelegationEntry =>
    delegations[uid] ?? { userId: uid, delegateTo: "", delegateApproval: false, delegateKpiSetting: false, delegateKpiTracking: false };

  const toggle = (uid: string, col: keyof Pick<DelegationEntry, "delegateApproval" | "delegateKpiSetting" | "delegateKpiTracking">) => {
    const entry = getEntry(uid);
    onChange({ ...delegations, [uid]: { ...entry, [col]: !entry[col] } });
  };

  const setDelegateTo = (uid: string, toId: string) => {
    const entry = getEntry(uid);
    onChange({ ...delegations, [uid]: { ...entry, delegateTo: toId } });
  };

  const toggleSelectAll = (uid: string) => {
    const entry = getEntry(uid);
    const allOn = DELEGATION_COLS.every((c) => entry[c.key]);
    onChange({ ...delegations, [uid]: { ...entry, delegateApproval: !allOn, delegateKpiSetting: !allOn, delegateKpiTracking: !allOn } });
  };

  const activeCount = Object.values(delegations).filter(
    (d) => d.delegateTo && (d.delegateApproval || d.delegateKpiSetting || d.delegateKpiTracking)
  ).length;

  // users who are receiving delegations
  const receivingIds = new Set(Object.values(delegations).filter((d) => d.delegateTo).map((d) => d.delegateTo));

  return (
    <div className="flex flex-col gap-4">
      {/* Legend pills */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-blue-50 border-blue-200 text-blue-700">
          <CheckSquare className="w-3 h-3" />Approval
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-purple-50 border-purple-200 text-purple-700" title="Recipient can create, edit, delete, update KPI Setting & KPI Tracking">
          <CheckSquare className="w-3 h-3" />KPI <span className="font-normal opacity-70">— create/edit/delete KPI Setting &amp; Tracking</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-teal-50 border-teal-200 text-teal-700" title="Recipient can create, edit, delete, update SMART Goals">
          <CheckSquare className="w-3 h-3" />SMART Goals <span className="font-normal opacity-70">— create/edit/delete SMART Goals</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#1A284F]/8 text-[#1A284F] border border-[#1A284F]/15">
          <UserCheck className="w-3 h-3" />{activeCount} user{activeCount !== 1 ? "s" : ""} delegated
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, NIK, dept…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#1A284F] bg-white"
          />
        </div>
        <div className="relative">
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="appearance-none text-xs border border-gray-200 rounded-lg px-3 py-2 pr-7 outline-none focus:border-[#1A284F] bg-white text-gray-600 font-medium"
          >
            <option value="">All Company Units</option>
            {COMPANY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        {hasActiveFilters && (
          <button onClick={() => setUnitFilter("")} className="text-xs text-red-500 hover:text-red-700 underline">Reset filters</button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#1A284F] text-white">
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Employee</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Company Unit</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Level</th>
                <th className="px-4 py-3 text-left font-semibold whitespace-nowrap min-w-[180px]">Delegation To</th>
                {DELEGATION_COLS.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-center font-semibold whitespace-nowrap min-w-[140px]">{c.label}</th>
                ))}
                <th className="px-4 py-3 text-center font-semibold whitespace-nowrap">All</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">No users match your filter.</td>
                </tr>
              )}
              {filtered.map((u) => {
                const entry = getEntry(u.id);
                const allOn = DELEGATION_COLS.every((c) => entry[c.key]);
                const hasDelegate = Boolean(entry.delegateTo);
                const isReceiving = receivingIds.has(u.id);
                const delegateToUser = SAMPLE_USERS.find((x) => x.id === entry.delegateTo);
                const anyChecked = entry.delegateApproval || entry.delegateKpiSetting || entry.delegateKpiTracking;
                return (
                  <tr key={u.id} className={`transition-colors ${hasDelegate && anyChecked ? "bg-indigo-50/40" : isReceiving ? "bg-amber-50/40" : "hover:bg-gray-50/50"}`}>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-gray-800">{u.name}</span>
                        <span className="text-[10px] text-gray-400">{u.nik} · {u.dept}</span>
                        {isReceiving && (
                          <span className="inline-flex items-center gap-1 mt-0.5 w-fit px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[9px] font-bold">
                            <UserCheck className="w-2.5 h-2.5" />Receiving Delegation
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{u.unit}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold text-[10px] ${
                        u.role === "supervisor"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}>
                        {u.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="relative">
                        <select
                          value={entry.delegateTo}
                          onChange={(e) => setDelegateTo(u.id, e.target.value)}
                          className={`w-full appearance-none text-xs border rounded-lg px-2.5 py-1.5 pr-6 outline-none transition-colors ${
                            entry.delegateTo
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold"
                              : "border-gray-200 bg-white text-gray-500"
                          }`}
                        >
                          <option value="">— Select user —</option>
                          {SAMPLE_USERS.filter((x) => x.id !== u.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name} · {x.nik} · {x.level}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      </div>
                      {delegateToUser && (
                        <p className="text-[9px] text-indigo-500 mt-0.5 pl-0.5 font-medium">{delegateToUser.nik} · {delegateToUser.level} · {delegateToUser.unit}</p>
                      )}
                    </td>
                    {DELEGATION_COLS.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          <WhiteCheckbox checked={entry[c.key]} onChange={() => toggle(u.id, c.key)} />
                        </div>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <WhiteCheckbox checked={allOn} onChange={() => toggleSelectAll(u.id)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Approval Other Tab ───────────────────────────────────────────────────────

const HR_STRATEGIC = "HR Strategic Specialist";

interface OtherSection {
  id: string;
  title: string;
  icon: React.ElementType;
  levels: { label: string; approver: string; fixed: boolean }[];
}

const INITIAL_OTHER_SECTIONS: OtherSection[] = [
  {
    id: "request-edit",
    title: "Request Edit Aktual",
    icon: Pencil,
    levels: [
      { label: "Approver 1", approver: APPROVER_OPTIONS[0],  fixed: false },
      { label: "Approver 2", approver: APPROVER_OPTIONS[1],  fixed: false },
      { label: "Validate",   approver: HR_STRATEGIC,         fixed: true  },
    ],
  },
  {
    id: "request-edit-target-supervisor",
    title: "Request Edit Target (Supervisor +)",
    icon: Pencil,
    levels: [
      { label: "Approver 1", approver: APPROVER_OPTIONS[0],  fixed: false },
      { label: "Approver 2", approver: APPROVER_OPTIONS[1],  fixed: false },
      { label: "Approver 3", approver: APPROVER_OPTIONS[2],  fixed: false },
      { label: "Validate",   approver: HR_STRATEGIC,         fixed: true  },
    ],
  },
  {
    id: "request-edit-target-operator",
    title: "Request Edit Target (Operator/Staff)",
    icon: Pencil,
    levels: [
      { label: "Approver 1", approver: APPROVER_OPTIONS[0],  fixed: false },
      { label: "Approver 2", approver: APPROVER_OPTIONS[1],  fixed: false },
      { label: "Validate",   approver: HR_STRATEGIC,         fixed: true  },
    ],
  },
  {
    id: "open-lock",
    title: "Open Lock",
    icon: CheckSquare,
    levels: [
      { label: "HR Strategic", approver: HR_STRATEGIC, fixed: true },
    ],
  },
  {
    id: "kpi-business-group",
    title: "KPI Business (Group)",
    icon: Building2,
    levels: [
      { label: "Validate", approver: HR_STRATEGIC, fixed: true },
    ],
  },
  {
    id: "kpi-business-unit",
    title: "KPI Business (Unit)",
    icon: LayoutGrid,
    levels: [
      { label: "Approver 1", approver: fmtApprover({ name: "Irwan Santosa", nik: "0040013", position: "COO" }), fixed: false },
      { label: "Validate",   approver: HR_STRATEGIC,  fixed: true  },
    ],
  },
  {
    id: "calibration-setting",
    title: "Calibration Setting",
    icon: TrendingUp,
    levels: [
      { label: "Approver 1", approver: fmtApprover({ name: "Irwan Santosa", nik: "0040013", position: "COO" }), fixed: false },
    ],
  },
];

const OTHER_SECTION_LEVEL_STYLES: Record<number, { bg: string; border: string; text: string; dot: string; ring: string }> = {
  0: { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500",   ring: "ring-blue-200"   },
  1: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-500", ring: "ring-purple-200" },
  2: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "bg-amber-500",  ring: "ring-amber-200"  },
  3: { bg: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-700",   dot: "bg-teal-500",   ring: "ring-teal-200"   },
};

function ApprovalOtherTab() {
  const [sections, setSections] = useState<OtherSection[]>(INITIAL_OTHER_SECTIONS);
  const [saved, setSaved] = useState(false);

  const updateApprover = (sectionId: string, levelIdx: number, value: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId ? s : {
          ...s,
          levels: s.levels.map((l, i) => i === levelIdx ? { ...l, approver: value } : l),
        }
      )
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-xl bg-[#1A284F] flex items-center justify-center text-white shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval Other</p>
                  <p className="text-sm font-bold text-[#1A284F]">{section.title}</p>
                </div>
                <span className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
                  {section.levels.length} Level{section.levels.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Levels */}
              <div className="px-4 py-4 flex flex-col gap-3">
                {section.levels.map((level, idx) => {
                  const style = OTHER_SECTION_LEVEL_STYLES[idx] ?? OTHER_SECTION_LEVEL_STYLES[2];
                  return (
                    <div key={idx} className={`rounded-xl border px-3 py-2.5 ${style.bg} ${style.border}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>{level.label}</span>
                        {level.fixed && (
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-white/70 text-gray-500 font-semibold border border-gray-200">Fixed</span>
                        )}
                      </div>
                      {level.fixed ? (
                        <div className={`w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white/60 border ${style.border} ${style.text}`}>
                          {level.approver}
                        </div>
                      ) : (
                        <div className="relative">
                          <select
                            value={level.approver}
                            onChange={(e) => updateApprover(section.id, idx, e.target.value)}
                            className={`w-full text-xs font-medium px-3 py-2 rounded-lg bg-white border ${style.border} appearance-none pr-7 focus:outline-none focus:ring-2 ${style.ring} cursor-pointer`}
                          >
                            {APPROVER_OPTIONS.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                          <ChevronDown className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${style.text}`} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />Saved successfully
          </span>
        )}
        <button
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Configuration
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function HRApprovalManagement() {
  const [activeTab, setActiveTab]     = useRouteTab<"flow" | "icf" | "other" | "delegation">(["flow", "icf", "other", "delegation"], "flow");
  const [companyUnit, setCompanyUnit] = useState("");
  const [userLevel, setUserLevel]     = useState("");
  const [ksgMap, setKsgMap]           = useState<KsgConfigMap>(() => loadPersistedState("pa_approval_mgmt_ksg_v1", {}));
  const [otherMap, setOtherMap]       = useState<OtherConfigMap>(() => loadPersistedState("pa_approval_mgmt_other_v1", {}));
  const [savedKeys, setSavedKeys]     = useState<string[]>(() => loadPersistedState("pa_approval_mgmt_keys_v1", []));
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedLabel, setSavedLabel]   = useState("");
  const [delegations, setDelegations] = useState<Record<string, DelegationEntry>>(() => loadPersistedState("pa_approval_mgmt_deleg_v1", INITIAL_DELEGATIONS));
  const [delegSaved, setDelegSaved]   = useState(false);

  // ICF tab state
  const [icfCompanyUnit, setIcfCompanyUnit] = useState("");
  const [icfUserLevel, setIcfUserLevel]     = useState("");
  const [icfPrimaryMap, setIcfPrimaryMap]   = useState<KsgConfigMap>(() => loadPersistedState("pa_approval_mgmt_icf_prim_v1", {}));
  const [icfSecondaryMap, setIcfSecondaryMap] = useState<OtherConfigMap>(() => loadPersistedState("pa_approval_mgmt_icf_sec_v1", {}));
  const [icfSavedKeys, setIcfSavedKeys]     = useState<string[]>(() => loadPersistedState("pa_approval_mgmt_icf_keys_v1", []));
  const [icfShowSuccess, setIcfShowSuccess] = useState(false);
  const [icfSavedLabel, setIcfSavedLabel]   = useState("");

  useEffect(() => {
    const onHydrated = () => {
      setKsgMap(loadPersistedState("pa_approval_mgmt_ksg_v1", {}));
      setOtherMap(loadPersistedState("pa_approval_mgmt_other_v1", {}));
      setSavedKeys(loadPersistedState("pa_approval_mgmt_keys_v1", []));
      setDelegations(loadPersistedState("pa_approval_mgmt_deleg_v1", INITIAL_DELEGATIONS));
      setIcfPrimaryMap(loadPersistedState("pa_approval_mgmt_icf_prim_v1", {}));
      setIcfSecondaryMap(loadPersistedState("pa_approval_mgmt_icf_sec_v1", {}));
      setIcfSavedKeys(loadPersistedState("pa_approval_mgmt_icf_keys_v1", []));
    };
    window.addEventListener("pa-db-hydrated", onHydrated);
    return () => window.removeEventListener("pa-db-hydrated", onHydrated);
  }, []);
  const key      = companyUnit && userLevel ? comboKey(companyUnit, userLevel) : "";
  const ready    = Boolean(companyUnit && userLevel);
  const ksgCfg   = key ? (ksgMap[key]   ?? { levels: makeKsgLevels()   }) : { levels: makeKsgLevels()   };
  const otherCfg = key ? (otherMap[key] ?? { levels: makeOtherLevels() }) : { levels: makeOtherLevels() };

  const handleKsgChange = (levels: ApprovalLevel[]) => {
    const k = key || "__draft__";
    setKsgMap((prev) => ({ ...prev, [k]: { levels } }));
    // Auto-sync Other Module: Level 1 ← KPI Approver 1 (levelNum 2), Level 2 ← KPI Approver 2 (levelNum 3)
    const ksgApprover1 = levels.find((l) => l.levelNum === 2)?.approver ?? "";
    const ksgApprover2 = levels.find((l) => l.levelNum === 3)?.approver ?? "";
    setOtherMap((prev) => {
      const existing = prev[k] ?? { levels: makeOtherLevels() };
      const newLevels = existing.levels.map((l) => {
        if (l.levelNum === 1) return { ...l, approver: ksgApprover1 };
        if (l.levelNum === 2) return { ...l, approver: ksgApprover2 };
        return l;
      });
      return { ...prev, [k]: { levels: newLevels } };
    });
  };

  const handleOtherChange = (levels: ApprovalLevel[]) => {
    const k = key || "__draft__";
    setOtherMap((prev) => ({ ...prev, [k]: { levels } }));
  };

  const handleSave = () => {
    if (!key) return;
    // persist draft edits under the real key if they were edited before selecting scope
    const draft = ksgMap["__draft__"];
    const otherDraft = otherMap["__draft__"];
    const nextKsg = { ...ksgMap, [key]: ksgMap[key] ?? draft ?? { levels: makeKsgLevels() } };
    delete nextKsg["__draft__"];
    const nextOther = { ...otherMap, [key]: otherMap[key] ?? otherDraft ?? { levels: makeOtherLevels() } };
    delete nextOther["__draft__"];
    const nextKeys = savedKeys.includes(key) ? savedKeys : [...savedKeys, key];
    setKsgMap(nextKsg);
    setOtherMap(nextOther);
    setSavedKeys(nextKeys);
    savePersistedState("pa_approval_mgmt_ksg_v1", nextKsg, {
      kind: "approval-config",
      configKey: `ksg::${key}`,
      data: { ksg: nextKsg[key], other: nextOther[key] },
      audit: {
        action: "Update",
        module: "HR Settings",
        subModule: "Approval Management",
        description: `Saved Approval Flow for ${companyUnit} — ${userLevel}`,
      },
    });
    savePersistedState("pa_approval_mgmt_other_v1", nextOther);
    savePersistedState("pa_approval_mgmt_keys_v1", nextKeys);
    setSavedLabel(`${companyUnit} — ${userLevel}`);
    setShowSuccess(true);
  };

  const handleEdit = (cu: string, ul: string) => {
    setCompanyUnit(cu);
    setUserLevel(ul);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">Approval Management</h1>
          <p className="text-gray-500 text-sm">
            Configure approval flows and delegate permissions to users.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1A284F]/5 rounded-xl">
          <Shield className="w-4 h-4 text-[#1A284F]" />
          <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Administrator</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {([
          { id: "flow",       label: "Approval Module", icon: TrendingUp    },
          { id: "icf",        label: "Approval ICF",    icon: ClipboardList },
          { id: "other",      label: "Approval Other",  icon: LayoutGrid    },
          { id: "delegation", label: "Delegation",       icon: UserCheck    },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id
                ? "bg-white text-[#1A284F] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "flow" && (
        <>
          {/* Shared selector */}
          <UnitLevelSelector
            companyUnit={companyUnit} userLevel={userLevel}
            onCompanyUnitChange={(v) => { setCompanyUnit(v); setUserLevel(""); }}
            onUserLevelChange={setUserLevel}
          />

          {/* Scope badge */}
          {ready && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1A284F]/8 text-[#1A284F] border border-[#1A284F]/15">
                <Building2 className="w-3.5 h-3.5" />{companyUnit}
              </span>
              <span className="text-gray-300">·</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                <Users className="w-3.5 h-3.5" />{userLevel}
              </span>
            </div>
          )}

          {/* Two config cards side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* KPI & Smart Goals */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-xl bg-[#1A284F] flex items-center justify-center text-white shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval Flow</p>
                  <p className="text-sm font-bold text-[#1A284F]">KPI & Smart Goals</p>
                </div>
                <span className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
                  {ksgCfg.levels.filter((l) => l.enabled).length} Active
                </span>
              </div>
              <div className="px-4 pt-2 pb-0">
                <p className="text-[10px] text-gray-400 italic">Applies to Setting &amp; Measurement</p>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pt-2 pb-1">
                {KSG_LEVEL_DEFS.map((def) => {
                  const style = LEVEL_STYLES[def.levelNum];
                  return (
                    <span key={def.levelNum} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold border ${style.bg} ${style.border} ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      Lvl {def.levelNum}: {def.label}
                      {def.toggleable && <span className="ml-0.5 text-[8px] px-1 rounded bg-white/70 text-gray-500">toggle</span>}
                    </span>
                  );
                })}
              </div>
              <div className="px-4 pb-4 pt-2">
                <ApprovalFlowPanel config={ksgCfg} onChange={handleKsgChange} />
              </div>
            </div>

            {/* Other Module */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                <div className="w-8 h-8 rounded-xl bg-[#1A284F] flex items-center justify-center text-white shrink-0">
                  <LayoutGrid className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval Flow</p>
                  <p className="text-sm font-bold text-[#1A284F]">Other Module</p>
                </div>
                <span className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
                  {otherCfg.levels.filter((l) => l.enabled).length} Active
                </span>
              </div>
              <div className="px-4 pt-2 pb-0">
                <p className="text-[10px] text-gray-400 italic">2 toggleable levels</p>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pt-2 pb-1">
                {OTHER_LEVEL_DEFS.map((def) => {
                  const style = LEVEL_STYLES[def.levelNum];
                  return (
                    <span key={def.levelNum} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-semibold border ${style.bg} ${style.border} ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      Lvl {def.levelNum}: {def.label}
                      <span className="ml-0.5 text-[8px] px-1 rounded bg-white/70 text-gray-500">toggle</span>
                    </span>
                  );
                })}
              </div>
              {/* Auto-sync info banner */}
              <div className="mx-4 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
                <Link2 className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-teal-700">Approver auto-synced dari KPI &amp; Smart Goals</p>
                  <p className="text-[10px] text-teal-600 mt-0.5">
                    Level 1 ← Approver 1 &nbsp;·&nbsp; Level 2 ← Approver 2
                  </p>
                </div>
              </div>
              <div className="px-4 pb-4 pt-2">
                <ApprovalFlowPanel
                  config={otherCfg}
                  onChange={handleOtherChange}
                  syncedLevels={{
                    1: "Approver 1 on KPI & Smart Goals",
                    2: "Approver 2 on KPI & Smart Goals",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex items-center justify-end gap-3">
            {!ready && (
              <p className="text-xs text-amber-600 font-medium">Select Company Unit &amp; User Level to save</p>
            )}
            <button
              onClick={handleSave}
              disabled={!ready}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                ready ? "bg-[#1A284F] text-white hover:bg-[#131d3b]" : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Save className="w-4 h-4" />
              Save Configuration
            </button>
          </div>

          {/* Summary table */}
          <CombinedSummaryTable savedKeys={savedKeys} primaryMap={ksgMap} secondaryMap={otherMap} col1Label="KPI & Smart Goals Flow" col2Label="Other Module Flow" onEdit={handleEdit} />
        </>
      )}

      {activeTab === "icf" && (() => {
        const icfKey      = icfCompanyUnit && icfUserLevel ? comboKey(icfCompanyUnit, icfUserLevel) : "";
        const icfReady    = Boolean(icfCompanyUnit && icfUserLevel);
        const icfPrimCfg  = icfKey ? (icfPrimaryMap[icfKey]   ?? { levels: makeIcfPrimaryLevels()   }) : { levels: makeIcfPrimaryLevels()   };
        const icfSecCfg   = icfKey ? (icfSecondaryMap[icfKey] ?? { levels: makeIcfSecondaryLevels() }) : { levels: makeIcfSecondaryLevels() };

        const handleIcfPrimaryChange = (levels: ApprovalLevel[]) => {
          const k = icfKey || "__icf_draft__";
          setIcfPrimaryMap((prev) => ({ ...prev, [k]: { levels } }));
          // Auto-sync Other Module: Level 1 ← KPI Approver 1 (levelNum 2), Level 2 ← KPI Approver 2 (levelNum 3)
          const ksgApprover1 = levels.find((l) => l.levelNum === 2)?.approver ?? "";
          const ksgApprover2 = levels.find((l) => l.levelNum === 3)?.approver ?? "";
          setIcfSecondaryMap((prev) => {
            const existing = prev[k] ?? { levels: makeIcfSecondaryLevels() };
            const newLevels = existing.levels.map((l) => {
              if (l.levelNum === 1) return { ...l, approver: ksgApprover1 };
              if (l.levelNum === 2) return { ...l, approver: ksgApprover2 };
              return l;
            });
            return { ...prev, [k]: { levels: newLevels } };
          });
        };
        const handleIcfSecondaryChange = (levels: ApprovalLevel[]) => {
          const k = icfKey || "__icf_draft__";
          setIcfSecondaryMap((prev) => ({ ...prev, [k]: { levels } }));
        };
        const handleIcfSave = () => {
          if (!icfKey) return;
          const primDraft = icfPrimaryMap["__icf_draft__"];
          const secDraft  = icfSecondaryMap["__icf_draft__"];
          const nextPrim = { ...icfPrimaryMap, [icfKey]: icfPrimaryMap[icfKey] ?? primDraft ?? { levels: makeIcfPrimaryLevels() } };
          delete nextPrim["__icf_draft__"];
          const nextSec = { ...icfSecondaryMap, [icfKey]: icfSecondaryMap[icfKey] ?? secDraft ?? { levels: makeIcfSecondaryLevels() } };
          delete nextSec["__icf_draft__"];
          const nextIcfKeys = icfSavedKeys.includes(icfKey) ? icfSavedKeys : [...icfSavedKeys, icfKey];
          setIcfPrimaryMap(nextPrim);
          setIcfSecondaryMap(nextSec);
          setIcfSavedKeys(nextIcfKeys);
          savePersistedState("pa_approval_mgmt_icf_prim_v1", nextPrim, {
            kind: "approval-config",
            configKey: `icf::${icfKey}`,
            data: { primary: nextPrim[icfKey], secondary: nextSec[icfKey] },
            audit: {
              action: "Update",
              module: "HR Settings",
              subModule: "Approval Management",
              description: `Saved ICF Approval Flow for ${icfCompanyUnit} — ${icfUserLevel}`,
            },
          });
          savePersistedState("pa_approval_mgmt_icf_sec_v1", nextSec);
          savePersistedState("pa_approval_mgmt_icf_keys_v1", nextIcfKeys);
          setIcfSavedLabel(`${icfCompanyUnit} — ${icfUserLevel}`);
          setIcfShowSuccess(true);
        };
        const handleIcfEdit = (cu: string, ul: string) => {
          setIcfCompanyUnit(cu);
          setIcfUserLevel(ul);
        };

        return (
          <>
            <IcfScopeSelector
              companyUnit={icfCompanyUnit} icfName={icfUserLevel}
              onCompanyUnitChange={(v) => { setIcfCompanyUnit(v); setIcfUserLevel(""); }}
              onIcfNameChange={setIcfUserLevel}
            />

            {icfReady && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1A284F]/8 text-[#1A284F] border border-[#1A284F]/15">
                  <Building2 className="w-3.5 h-3.5" />{icfCompanyUnit}
                </span>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                  <Users className="w-3.5 h-3.5" />{icfUserLevel}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* KPI & Smart Goals */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-xl bg-[#1A284F] flex items-center justify-center text-white shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval Flow</p>
                    <p className="text-sm font-bold text-[#1A284F]">KPI &amp; Smart Goals</p>
                  </div>
                  <span className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
                    {icfPrimCfg.levels.filter((l) => l.enabled).length} Active
                  </span>
                </div>
                <div className="px-4 pt-2 pb-0">
                  <p className="text-[10px] text-gray-400 italic">Applies to ICF Assessment</p>
                </div>
                <div className="px-4 pb-4 pt-2">
                  <ApprovalFlowPanel
                    config={icfPrimCfg}
                    onChange={handleIcfPrimaryChange}
                    levelApproverOptions={ICF_PRIMARY_APPROVER_OPTIONS}
                  />
                </div>
              </div>

              {/* Other Module */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-xl bg-[#1A284F] flex items-center justify-center text-white shrink-0">
                    <LayoutGrid className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Approval Flow</p>
                    <p className="text-sm font-bold text-[#1A284F]">Other Module</p>
                  </div>
                  <span className="ml-auto text-[9px] font-bold px-2 py-1 rounded-full bg-[#1A284F]/8 text-[#1A284F]">
                    {icfSecCfg.levels.filter((l) => l.enabled).length} Active
                  </span>
                </div>
                <div className="px-4 pt-2 pb-0">
                  <p className="text-[10px] text-gray-400 italic">Applies to ICF Validation</p>
                </div>
                {/* Auto-sync info banner */}
                <div className="mx-4 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
                  <Link2 className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-teal-700">Approver auto-synced dari KPI &amp; Smart Goals</p>
                    <p className="text-[10px] text-teal-600 mt-0.5">
                      Level 1 ← Approver 1 &nbsp;·&nbsp; Level 2 ← Approver 2
                    </p>
                  </div>
                </div>
                <div className="px-4 pb-4 pt-2">
                  <ApprovalFlowPanel
                    config={icfSecCfg}
                    onChange={handleIcfSecondaryChange}
                    levelApproverOptions={ICF_SECONDARY_APPROVER_OPTIONS}
                    syncedLevels={{
                      1: "Approver 1 on KPI & Smart Goals",
                      2: "Approver 2 on KPI & Smart Goals",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {!icfReady && (
                <p className="text-xs text-amber-600 font-medium">Select Company Unit &amp; ICF Name to save</p>
              )}
              <button
                onClick={handleIcfSave}
                disabled={!icfReady}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                  icfReady ? "bg-[#1A284F] text-white hover:bg-[#131d3b]" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </button>
            </div>

            <IcfSummaryTable
              savedKeys={icfSavedKeys}
              primaryMap={icfPrimaryMap}
              secondaryMap={icfSecondaryMap}
              onEdit={handleIcfEdit}
            />

            <Dialog open={icfShowSuccess} onOpenChange={setIcfShowSuccess}>
              <DialogContent className="sm:max-w-md border-0 p-0 rounded-2xl overflow-hidden shadow-2xl" aria-describedby={undefined}>
                <DialogTitle className="sr-only">ICF Configuration Saved</DialogTitle>
                <div className="p-12 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-[#FDF9F1] rounded-full flex items-center justify-center mb-5">
                    <CheckCircle2 className="w-8 h-8 text-[#C69A45]" />
                  </div>
                  <h2 className="text-xl font-bold text-[#1A284F] mb-2">ICF Configuration Saved</h2>
                  <p className="text-sm text-gray-500 mb-1">Approval ICF flow for</p>
                  <p className="text-base font-semibold text-[#1A284F] mb-6">{icfSavedLabel}</p>
                  <button
                    onClick={() => setIcfShowSuccess(false)}
                    className="px-8 py-2.5 rounded-xl bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
                  >
                    Done
                  </button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      })()}

      {activeTab === "other" && (
        <ApprovalOtherTab />
      )}

      {activeTab === "delegation" && (
        <>
          <DelegationPanel delegations={delegations} onChange={setDelegations} />

          <div className="flex items-center justify-end gap-3">
            {delegSaved && (
              <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />Delegation saved
              </span>
            )}
            <button
              onClick={() => {
                savePersistedState("pa_approval_mgmt_deleg_v1", delegations, {
                  kind: "approval-config",
                  configKey: "delegations",
                  data: delegations,
                  audit: {
                    action: "Update",
                    module: "HR Settings",
                    subModule: "Approval Management",
                    description: "Saved Approver Delegation settings",
                  },
                });
                setDelegSaved(true);
                setTimeout(() => setDelegSaved(false), 3000);
              }}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Delegation
            </button>
          </div>
        </>
      )}

      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md border-0 p-0 rounded-2xl overflow-hidden shadow-2xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Configuration Saved</DialogTitle>
          <div className="p-12 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#FDF9F1] rounded-full flex items-center justify-center mb-5">
              <CheckCircle2 className="w-8 h-8 text-[#C69A45]" />
            </div>
            <p className="text-[#1A284F] font-bold text-lg mb-1">Configuration Saved</p>
            <p className="text-gray-500 text-sm mb-6">
              Approval flow for <span className="font-semibold text-[#1A284F]">{savedLabel}</span> has been saved successfully.
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
