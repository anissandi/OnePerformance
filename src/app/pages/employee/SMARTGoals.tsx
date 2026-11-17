// @refresh reset
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Eye, CheckCircle2, FileText, Edit3, Send, ChevronRight, Info, AlertTriangle, Clock, RotateCcw, Lock } from "lucide-react";
import { loadSubmittedGoals, saveSubmittedGoals } from "../shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../shared/appraisalWorkflowStore";
import { getActiveUser, loadManagedUsers, useAuthStore, usesDemoSampleData, type ManagedUser } from "../../store/authStore";
import { DELEGATION_EVENT, getReceivedWorkspaceDelegations, type DelegationAccess } from "../../store/delegationStore";
import { DelegatedWorkspaceBanner } from "../../components/approval/DelegatedWorkspaceBanner";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import { ApproverNotesHistory } from "../../components/ApproverNotesHistory";
import ExportImportButton from "../../components/ExportImportButton";
import { EXCEL_THEME, exportStyledXLSX, parseXLSXMatrix, type StyledExcelCell, type StyledExcelMerge } from "../../utils/excelUtils";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionPlanStatus = "Belum dilaksanakan" | "Sedang dilaksanakan" | "Selesai";

export interface ActionPlan {
  id: number;
  description: string;
}

export interface SmartGoal {
  id: number;
  label: string;
  specific: string;
  measurable: string;
  attainable: string;
  relevant: string;
  timely: string;
  bukti: string;
  target: string;
  actionPlans: ActionPlan[];
}

type View = "input" | "preview" | "results";

// ─── Row definitions ──────────────────────────────────────────────────────────

export type RowKey = keyof Omit<SmartGoal, "id" | "label" | "actionPlans">;

export interface RowDef {
  key: RowKey;
  title: string;
  desc: string;
}

export const ROWS: RowDef[] = [
  {
    key: "specific",
    title: "Specific/Spesifik",
    desc: "Apa hasil yang diinginkan? Tuliskan secara spesifik perubahan yang diharapkan.",
  },
  {
    key: "measurable",
    title: "Measurable/Dapat Diukur",
    desc: "Bagaimana caranya untuk mengukur guna mengetahui pengembangan/peningkatan target?",
  },
  {
    key: "attainable",
    title: "Attainable/Dapat Dicapai",
    desc: "Apa yang harus dilakukan untuk mencapai target? Sumber daya apa yang diperlukan? Bagaimana lingkungan memengaruhi pencapaian tujuan?",
  },
  {
    key: "relevant",
    title: "Relevant/Relevan",
    desc: "Apa tujuan yang ingin dicapai? Apakah tujuan tersebut selaras dengan tujuan organisasi?",
  },
  {
    key: "timely",
    title: "Timely/Tepat Waktu",
    desc: "Kapan batasan waktunya? Apakah batasan waktu yang ditetapkan realistis?",
  },
  {
    key: "bukti",
    title: "Bukti",
    desc: "Apa saja bukti yang dapat menyatakan bahwa smart goal tersebut tercapai/tidak tercapai berdasarkan hasil yang dituliskan?",
  },
  {
    key: "target",
    title: "Target",
    desc: "Apa target kuantitatif/kualitatif yang ingin dicapai? Tuliskan secara spesifik nilai atau kondisi yang menjadi ukuran keberhasilan.",
  },
];

// ─── Sample data ──────────────────────────────────────────────────────────────

let _id = 1;
let _apId = 1;
const makeGoal = (label: string, data: Omit<SmartGoal, "id" | "label">): SmartGoal => ({
  id: _id++,
  label,
  ...data,
});

export const SAMPLE_GOALS: SmartGoal[] = [
  makeGoal("Goals 1", {
    specific:
      "Meningkatkan keandalan sistem produksi hingga mencapai uptime 99,9% di seluruh server produksi sepanjang tahun 2026.",
    measurable:
      "Uptime dipantau melalui dashboard cloud setiap minggu; laporan bulanan dibandingkan dengan SLA yang disepakati.",
    attainable:
      "Mengimplementasikan mekanisme redundansi dan auto-failover; melibatkan tim DevOps dan vendor infrastruktur cloud.",
    relevant:
      "Keandalan sistem berdampak langsung pada pengalaman pelanggan, reputasi perusahaan, dan kepatuhan terhadap SLA.",
    timely:
      "Target dicapai sebelum akhir Q4 2026 dengan milestone review setiap kuartal.",
    bukti:
      "Laporan uptime bulanan dari dashboard cloud; tidak ada insiden P1 yang melebihi 4 jam downtime selama tahun 2026.",
    target: "Uptime 99,9% di semua server produksi sepanjang 2026",
    actionPlans: [
      { id: _apId++, description: "Implementasi mekanisme auto-failover pada 3 server produksi utama" },
      { id: _apId++, description: "Audit konfigurasi load balancer setiap bulan" },
      { id: _apId++, description: "Pelatihan tim DevOps terkait prosedur disaster recovery" },
    ],
  }),
  makeGoal("Goals 2", {
    specific:
      "Meningkatkan skor Net Promoter Score (NPS) pelanggan hingga mencapai angka 80 atau lebih tinggi.",
    measurable:
      "Survei NPS dilakukan setiap kuartal; hasil dianalisis oleh tim Customer Experience.",
    attainable:
      "Meningkatkan waktu respons dukungan, melatih tim CS, dan memperbaiki kualitas produk berdasarkan feedback pelanggan.",
    relevant:
      "NPS yang tinggi berkorelasi langsung dengan retensi pelanggan, pertumbuhan bisnis, dan rekomendasi organik.",
    timely:
      "Target NPS ≥ 80 dicapai pada Q4 2026; review progres setiap kuartal.",
    bukti:
      "Hasil survei NPS kuartalan; peningkatan skor dari baseline Q1 2026 hingga Q4 2026.",
    target: "NPS ≥ 80 pada akhir Q4 2026 (baseline Q1: 65)",
    actionPlans: [
      { id: _apId++, description: "Perbaikan SLA waktu respons CS dari 24 jam menjadi 4 jam" },
      { id: _apId++, description: "Pelatihan empati dan komunikasi untuk seluruh tim CS (Q1-Q2)" },
    ],
  }),
  makeGoal("Goals 3", {
    specific:
      "Meluncurkan 3 fitur produk utama yang telah direncanakan dalam roadmap produk tahun 2026.",
    measurable:
      "Milestone pengiriman fitur dilacak di Jira; definisi 'selesai' mencakup QA dan deployment ke production.",
    attainable:
      "Kapasitas sprint dialokasikan khusus; tim QA dedicated; koordinasi mingguan antara Product, Engineering, dan Design.",
    relevant:
      "Peluncuran fitur mendorong keunggulan kompetitif, meningkatkan keterlibatan pengguna, dan mendukung target pertumbuhan ARR.",
    timely:
      "Fitur 1 dan 2 diluncurkan Q2 2026; Fitur 3 diluncurkan Q3 2026.",
    bukti:
      "Tiket Jira dengan status 'Done'; release notes yang telah dipublikasikan; feedback awal pengguna pasca-launch.",
    target: "3 fitur utama diluncurkan sesuai roadmap (Fitur 1-2: Q2, Fitur 3: Q3 2026)",
    actionPlans: [
      { id: _apId++, description: "Sprint planning dan alokasi kapasitas untuk Fitur 1 (Jan-Mar)" },
      { id: _apId++, description: "QA testing dan UAT Fitur 1 & 2 sebelum deployment Q2" },
      { id: _apId++, description: "Koordinasi lintas tim untuk pengembangan Fitur 3 (Q2-Q3)" },
    ],
  }),
];

const newGoal = (idx: number): SmartGoal => ({
  id: _id++,
  label: `Goals ${idx}`,
  specific: "",
  measurable: "",
  attainable: "",
  relevant: "",
  timely: "",
  bukti: "",
  target: "",
  actionPlans: [],
});

// ─── Shared Table ─────────────────────────────────────────────────────────────

function SmartTable({
  goals,
  editable,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  onUpdate,
  onAdd,
  onRemove,
}: {
  goals: SmartGoal[];
  editable: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdate?: (id: number, key: RowKey, val: string) => void;
  onAdd?: () => void;
  onRemove?: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-none">
      <table
        className="border-collapse w-full text-sm"
        style={{ minWidth: `${Math.max(700, 260 + goals.length * 240)}px` }}
      >
        {/* Header */}
        <thead>
          <tr>
            <th
              className="border-2 border-[#1A284F] bg-[#1A284F] text-white text-center py-3 px-4 font-bold"
              style={{ width: "260px" }}
            >
              SMART Goals
            </th>
            {goals.map((g) => (
              <th
                key={g.id}
                className="border-2 border-[#1A284F] bg-[#1A284F] text-white text-center py-3 px-4 font-bold"
              >
                {editable && (canEdit || canDelete) ? (
                  <div className="flex items-center justify-center gap-2">
                    {canEdit ? (
                      <input
                        value={g.label}
                        onChange={(e) => onUpdate?.(g.id, "label" as RowKey, e.target.value)}
                        className="bg-transparent text-white font-bold text-center border-b border-white/40 outline-none w-24 placeholder-white/50"
                      />
                    ) : (
                      <span>{g.label}</span>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onRemove?.(g.id)}
                        className="text-white/50 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  g.label
                )}
              </th>
            ))}
            {editable && canCreate && (
              <th className="border-2 border-[#1A284F] bg-[#1A284F] py-3 px-3 w-12">
                <button
                  onClick={onAdd}
                  title="Add column"
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              </th>
            )}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className={row.key === "target" ? "bg-blue-50/40" : ""}>
              {/* Criteria label cell */}
              <td className={`border-2 border-black align-top px-4 py-4 ${row.key === "target" ? "bg-blue-50" : "bg-white"}`} style={{ width: "260px" }}>
                <p className="font-bold underline text-gray-900 mb-1">{row.title}</p>
                <p className="underline text-gray-700 text-xs leading-relaxed">{row.desc}</p>
              </td>

              {/* Goal input cells */}
              {goals.map((g) => (
                <td key={g.id} className={`border-2 border-black align-top px-3 py-3 ${row.key === "target" ? "bg-blue-50/60" : "bg-white"}`}>
                  {editable && canEdit ? (
                    <textarea
                      value={g[row.key] as string}
                      onChange={(e) => onUpdate?.(g.id, row.key, e.target.value)}
                      placeholder=""
                      rows={row.key === "target" ? 2 : 4}
                      className={`w-full h-full text-xs text-gray-800 bg-transparent outline-none resize-none placeholder-gray-300 ${row.key === "target" ? "min-h-[56px]" : "min-h-[96px]"}`}
                    />
                  ) : (
                    <p className={`text-xs text-gray-800 leading-relaxed whitespace-pre-wrap ${row.key === "target" ? "min-h-[56px]" : "min-h-[96px]"}`}>
                      {(g[row.key] as string) || ""}
                    </p>
                  )}
                </td>
              ))}

              {editable && canCreate && <td className={`border-2 border-black ${row.key === "target" ? "bg-blue-50/60" : "bg-white"}`} />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Action Plans Section ─────────────────────────────────────────────────────

function ActionPlansSection({
  goals,
  editable,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  onUpdatePlan,
  onAddPlan,
  onRemovePlan,
}: {
  goals: SmartGoal[];
  editable: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onUpdatePlan?: (goalId: number, planId: number, val: string) => void;
  onAddPlan?: (goalId: number) => void;
  onRemovePlan?: (goalId: number, planId: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-[#1A284F] rounded-full" />
        <h3 className="text-sm font-bold text-[#1A284F] uppercase tracking-wide">Action Plans</h3>
        <span className="text-xs text-gray-400 font-normal normal-case tracking-normal">— Rencana tindakan pendukung setiap SMART Goal sebagai bahan evaluasi atasan</span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${goals.length}, 1fr)` }}>
        {goals.map((goal) => (
          <div key={goal.id} className="border-2 border-[#1A284F] rounded-xl overflow-hidden">
            <div className="bg-[#1A284F] text-white text-sm font-bold px-4 py-2.5">{goal.label}</div>
            <div className="p-4 bg-white flex flex-col gap-2">
              {editable && (
                <p className="text-xs text-blue-600 italic mb-1">
                  Tuliskan rencana konkret Anda untuk mencapai {goal.label}
                </p>
              )}
              {goal.actionPlans.length === 0 && !editable && (
                <p className="text-xs text-gray-400 italic py-2">Belum ada action plan.</p>
              )}
              {goal.actionPlans.map((ap, idx) => (
                <div key={ap.id} className="flex items-start gap-2">
                  <span className="mt-1 shrink-0 w-5 h-5 rounded-full bg-[#1A284F]/10 text-[#1A284F] text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  {editable && (canEdit || canDelete) ? (
                    <>
                      {canEdit ? (
                        <input
                          value={ap.description}
                          onChange={(e) => onUpdatePlan?.(goal.id, ap.id, e.target.value)}
                          placeholder="Tuliskan rencana tindakan..."
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1A284F] bg-white text-gray-800"
                        />
                      ) : (
                        <p className="flex-1 text-xs text-gray-700 leading-relaxed py-1">{ap.description || "—"}</p>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => onRemovePlan?.(goal.id, ap.id)}
                          className="mt-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="flex-1 text-xs text-gray-700 leading-relaxed py-1">{ap.description || "—"}</p>
                  )}
                </div>
              ))}
              {editable && canCreate && (
                <button
                  onClick={() => onAddPlan?.(goal.id)}
                  className="flex items-center gap-1.5 text-xs text-[#1A284F] hover:text-[#131d3b] font-semibold mt-1 self-start transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Action Plan
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Input View ───────────────────────────────────────────────────────────────

function InputView({
  goals,
  setGoals,
  onPreview,
  onExport,
  onImport,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}: {
  goals: SmartGoal[];
  setGoals: (updater: SmartGoal[] | ((prev: SmartGoal[]) => SmartGoal[])) => void;
  onPreview: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const [showMinModal, setShowMinModal] = useState(false);

  const update = (id: number, key: RowKey, val: string) =>
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, [key]: val } : g)));

  const add = () =>
    setGoals((prev) => [...prev, newGoal(prev.length + 1)]);

  const remove = (id: number) => {
    if (goals.length <= 3) {
      setShowMinModal(true);
      return;
    }
    setGoals((prev) => {
      const filtered = prev.filter((g) => g.id !== id);
      return filtered.map((g, i) => ({ ...g, label: `Goals ${i + 1}` }));
    });
  };

  const addPlan = (goalId: number) =>
    setGoals((prev) => prev.map((g) =>
      g.id === goalId
        ? { ...g, actionPlans: [...g.actionPlans, { id: _apId++, description: "" }] }
        : g
    ));

  const updatePlan = (goalId: number, planId: number, val: string) =>
    setGoals((prev) => prev.map((g) =>
      g.id === goalId
        ? { ...g, actionPlans: g.actionPlans.map((ap) => ap.id === planId ? { ...ap, description: val } : ap) }
        : g
    ));

  const removePlan = (goalId: number, planId: number) =>
    setGoals((prev) => prev.map((g) =>
      g.id === goalId
        ? { ...g, actionPlans: g.actionPlans.filter((ap) => ap.id !== planId) }
        : g
    ));

  const allFilled =
    goals.length >= 3 &&
    goals.every(
      (g) =>
        g.specific &&
        g.measurable &&
        g.attainable &&
        g.relevant &&
        g.timely &&
        g.target &&
        g.actionPlans.length >= 1 &&
        g.actionPlans.every((ap) => ap.description.trim() !== ""),
  );

  // Alasan tombol Preview belum aktif (ditampilkan via tooltip saat hover / klik)
  const previewMissing: string[] = (() => {
    const out: string[] = [];
    if (goals.length < 3) out.push(`Minimal 3 SMART Goals (saat ini ${goals.length}).`);
    const FIELD_LABELS: Array<[keyof SmartGoal, string]> = [
      ["specific", "Specific"],
      ["measurable", "Measurable"],
      ["attainable", "Attainable"],
      ["relevant", "Relevant"],
      ["timely", "Time-bound"],
      ["target", "Target"],
    ];
    goals.forEach((g, gi) => {
      const name = g.label || `Goals ${gi + 1}`;
      const empty = FIELD_LABELS.filter(([k]) => !String(g[k] ?? "").trim()).map(([, l]) => l);
      if (empty.length > 0) out.push(`${name}: ${empty.join(", ")} belum diisi`);
      if (g.actionPlans.length < 1) out.push(`${name}: minimal 1 Action Plan`);
      else if (g.actionPlans.some((ap) => ap.description.trim() === "")) out.push(`${name}: deskripsi Action Plan belum diisi`);
    });
    return out;
  })();
  const [previewTipOpen, setPreviewTipOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Minimum goals info tag */}
      <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
        <Info className="w-4 h-4 shrink-0 text-blue-500" />
        <p className="text-sm text-blue-700">
          Minimal SMART Goals tahun{" "}
          <strong>{new Date().getFullYear()}</strong> adalah{" "}
          <strong>tiga (3)</strong>
        </p>
      </div>

      <div className="flex justify-end">
        <ExportImportButton onExport={onExport} onImport={canCreate || canEdit ? onImport : undefined} size="sm" />
      </div>

      <SmartTable
        goals={goals}
        editable={true}
        canCreate={canCreate}
        canEdit={canEdit || canCreate}
        canDelete={canDelete}
        onUpdate={update}
        onAdd={add}
        onRemove={remove}
      />

      {/* Action Plans */}
      <ActionPlansSection
        goals={goals}
        editable={true}
        canCreate={canCreate}
        canEdit={canEdit || canCreate}
        canDelete={canDelete}
        onAddPlan={addPlan}
        onUpdatePlan={updatePlan}
        onRemovePlan={removePlan}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Tooltip open={!allFilled && previewTipOpen} onOpenChange={setPreviewTipOpen}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="inline-flex"
              onClick={() => { if (!allFilled) setPreviewTipOpen(true); }}
            >
              <button
                onClick={onPreview}
                disabled={!allFilled}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
                <ChevronRight className="w-4 h-4" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-sm bg-[#1A284F] text-white p-3 rounded-xl shadow-lg">
            <p className="font-bold text-xs mb-1">Preview belum aktif — lengkapi data berikut ({previewMissing.length}):</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-white/90 max-h-48 overflow-y-auto">
              {previewMissing.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}
              {previewMissing.length > 8 && <li>...dan {previewMissing.length - 8} lainnya.</li>}
            </ul>
          </TooltipContent>
        </Tooltip>
      </div>

      {showMinModal && <MinGoalsModal onClose={() => setShowMinModal(false)} />}
    </div>
  );
}

// ─── Preview View ─────────────────────────────────────────────────────────────

function PreviewView({
  goals,
  onBack,
  onSubmit,
}: {
  goals: SmartGoal[];
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 font-medium flex items-center gap-2">
        <Eye className="w-4 h-4 shrink-0" />
        Preview — please review all data carefully before submitting.
      </div>
      <SmartTable goals={goals} editable={false} />
      <ActionPlansSection goals={goals} editable={false} />
      <div className="flex justify-between gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <Edit3 className="w-4 h-4" />
          Back to Edit
        </button>
        <button
          onClick={onSubmit}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
        >
          <Send className="w-4 h-4" />
          Submit for Approval
        </button>
      </div>
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────

function ResultsView({
  goals,
  statusLabel,
  statusTone,
  wfRecord,
}: {
  goals: SmartGoal[];
  statusLabel: string;
  statusTone: "validated" | "in_progress" | "revision" | "submitted";
  wfRecord?: WorkflowRecord;
}) {
  void wfRecord;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1A284F]">SMART Goals — 2026 Performance Appraisal</h3>
      </div>

      <SmartTable goals={goals} editable={false} />
      <ActionPlansSection goals={goals} editable={false} />

    </div>
  );
}

// ─── Min Goals Modal ──────────────────────────────────────────────────────────

function MinGoalsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Tidak Dapat Dihapus</h3>
        <p className="text-gray-500 text-sm mb-6">
          Minimal SMART Goals adalah{" "}
          <strong className="text-[#1A284F]">3 (tiga)</strong>.
          <br />Anda tidak dapat menghapus goals ini.
        </p>
        <button
          onClick={onClose}
          className="px-8 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors"
        >
          Mengerti
        </button>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">Are you sure you want to submit your SMART Goals for approval?</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Success Modal ────────────────────────────────────────────────────────────

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">Your SMART Goals have been successfully submitted for approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabDef = { id: View; label: string; icon: React.ElementType };

const ALL_TABS: TabDef[] = [
  { id: "input", label: "Input Form", icon: Edit3 },
  { id: "results", label: "Results", icon: FileText },
];

function SMARTGoalsWorkspace({
  ownerUser,
  delegationAccess,
  actorName,
}: {
  ownerUser: ManagedUser;
  delegationAccess?: DelegationAccess;
  actorName: string;
}) {
  const canCreate = !delegationAccess || Boolean(delegationAccess.create);
  const canEdit = !delegationAccess || Boolean(delegationAccess.edit);
  const canDelete = !delegationAccess || Boolean(delegationAccess.delete);
  const isViewOnly = Boolean(delegationAccess && !canCreate && !canEdit && !canDelete);

  const readUserGoalsState = () => {
    const normId = normalizeEmployeeId(ownerUser.employeeId);
    const saved = loadSubmittedGoals(ownerUser.employeeId);
    const wfRec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "SMART Goals" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === ownerUser.employeeId.toLowerCase()),
    );
    const a1 = wfRec?.decisions.approver1?.status ?? "";
    const a2 = wfRec?.decisions.approver2?.status ?? "";
    const chk = wfRec?.decisions.checker?.status ?? "";
    const val = wfRec?.decisions.validator?.status ?? "";
    const isRev = a1 === "Revision" || a2 === "Revision" || chk === "Revision" || val === "Revision";
    const isVal = val === "Validated" || a2 === "Validated";
    const isA2Done = a2 === "Approved" || a2.startsWith("Assessed") || a2 === "Validated";
    const isA1Done = a1 === "Approved" || a1.startsWith("Assessed") || a1 === "Validated";
    const isChkDone = Boolean(chk && chk !== "Revision");

    let statusLabel = "Draft";
    let statusTone: "validated" | "in_progress" | "revision" | "submitted" = "submitted";
    if (isRev) {
      statusLabel = "Revision";
      statusTone = "revision";
    } else if (isVal) {
      statusLabel = "Validated";
      statusTone = "validated";
    } else if (isA2Done) {
      statusLabel = "Pending-Validate (HR ICF)";
      statusTone = "in_progress";
    } else if (isA1Done) {
      statusLabel = "Pending-Approver 2";
      statusTone = "in_progress";
    } else if (isChkDone) {
      statusLabel = "Pending-Approver 1";
      statusTone = "in_progress";
    } else if (wfRec) {
      statusLabel = "Submitted · Pending Check HR Unit";
      statusTone = "submitted";
    }

    // DEMO: Selain Administrator, karyawan yang belum bertransaksi melihat format tabel kosong
    const initialGoals = saved && saved.length > 0 ? saved : usesDemoSampleData(ownerUser) ? SAMPLE_GOALS : [];
    const lockedSubmitted = Boolean(wfRec && !isRev);
    return {
      initialGoals,
      lockedSubmitted,
      isRev,
      statusLabel,
      statusTone,
      wfRec,
    };
  };

  const init = readUserGoalsState();
  const [view, setView] = useState<View>(() => (init.lockedSubmitted || isViewOnly ? "results" : "input"));
  const [goals, setGoalsState] = useState<SmartGoal[]>(() => init.initialGoals);
  const [resultGoals, setResultGoals] = useState<SmartGoal[]>(() => init.initialGoals);
  const [submitted, setSubmitted] = useState<boolean>(() => init.lockedSubmitted);
  const [statusLabel, setStatusLabel] = useState<string>(() => init.statusLabel);
  const [statusTone, setStatusTone] = useState<"validated" | "in_progress" | "revision" | "submitted">(() => init.statusTone);
  const [wfRecState, setWfRecState] = useState<WorkflowRecord | undefined>(() => init.wfRec);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Setiap Create / Edit / Delete langsung disimpan ke database Supabase (pa_smart_goals + pa_kv_state)
  const updateGoalsAndPersist = (updater: SmartGoal[] | ((prev: SmartGoal[]) => SmartGoal[])) => {
    setGoalsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setResultGoals(next);
      saveSubmittedGoals(next, {
        submitWorkflow: false,
        employeeId: ownerUser.employeeId,
        ownerName: ownerUser.name,
      });
      return next;
    });
  };

  useEffect(() => {
    const sync = () => {
      const next = readUserGoalsState();
      setGoalsState(next.initialGoals);
      setResultGoals(next.initialGoals);
      setSubmitted(next.lockedSubmitted);
      setStatusLabel(next.statusLabel);
      setStatusTone(next.statusTone);
      setWfRecState(next.wfRec);
      if (next.lockedSubmitted || isViewOnly) {
        setView("results");
      }
    };
    window.addEventListener("pa-auth-updated", sync);
    window.addEventListener("appraisal-updated", sync);
    window.addEventListener("pa-db-hydrated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("pa-auth-updated", sync);
      window.removeEventListener("appraisal-updated", sync);
      window.removeEventListener("pa-db-hydrated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [ownerUser.employeeId, isViewOnly]);

  const handleExport = () => {
    const exportGoals: SmartGoal[] =
      goals.length > 0
        ? goals
        : [1, 2, 3].map((n) => ({
            id: n,
            label: `Goals ${n}`,
            specific: "",
            measurable: "",
            attainable: "",
            relevant: "",
            timely: "",
            bukti: "",
            target: "",
            actionPlans: [{ id: n * 100 + 1, description: "" }],
          }));

    const colCount = 1 + exportGoals.length;
    const colWidths = [30, ...exportGoals.map(() => 36)];
    const rowsOut: StyledExcelCell[][] = [];
    const merges: StyledExcelMerge[] = [];
    const rowHeights: Record<number, number> = { 0: 28 };

    // Header utama persis tabel SMART Goals di layar: SMART Goals | Goals 1 | Goals 2 | ...
    rowsOut.push([
      { value: "SMART Goals", style: { bg: EXCEL_THEME.headerNavyBg, fg: EXCEL_THEME.white, bold: true, align: "left", borderColor: "334155" } },
      ...exportGoals.map((g, gi): StyledExcelCell => ({
        value: g.label || `Goals ${gi + 1}`,
        style: { bg: EXCEL_THEME.headerNavyBg, fg: EXCEL_THEME.white, bold: true, align: "center", borderColor: "334155" },
      })),
    ]);

    // Baris kriteria S, M, A, R, T, Target (persis ROWS di layar)
    ROWS.forEach((rowDef, ri) => {
      const zebra = ri % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
      const rIdx = rowsOut.length;
      rowsOut.push([
        {
          value: `${rowDef.title}\n(${rowDef.desc})`,
          style: { bg: "EEF2FF", fg: EXCEL_THEME.headerNavyBg, bold: true, align: "left", vAlign: "top" },
        },
        ...exportGoals.map((g): StyledExcelCell => ({
          value: String(g[rowDef.key] ?? ""),
          style: { bg: zebra, fg: EXCEL_THEME.textDark, align: "left", vAlign: "top" },
        })),
      ]);
      rowHeights[rIdx] = 44;
    });

    // Baris pemisah kosong
    rowsOut.push(Array.from({ length: colCount }, () => ({ value: "" })));

    // Section Banner ACTION PLANS berwarna biru persis UI
    const apBannerIdx = rowsOut.length;
    rowsOut.push(
      Array.from({ length: colCount }, (_, ci) => ({
        value: ci === 0 ? "ACTION PLANS" : "",
        style: { bg: "1565C0", fg: EXCEL_THEME.white, bold: true, align: "left", borderColor: "1565C0" },
      })),
    );
    rowHeights[apBannerIdx] = 24;
    merges.push({ sRow: apBannerIdx, sCol: 0, eRow: apBannerIdx, eCol: colCount - 1 });

    const maxApCount = Math.max(1, ...exportGoals.map((g) => g.actionPlans.length));
    for (let ai = 0; ai < maxApCount; ai++) {
      const zebra = ai % 2 === 0 ? EXCEL_THEME.zebraEven : EXCEL_THEME.zebraOdd;
      const rIdx = rowsOut.length;
      rowsOut.push([
        {
          value: `Action Plan ${ai + 1}`,
          style: { bg: "F1F5F9", fg: EXCEL_THEME.headerNavyBg, bold: true, align: "left" },
        },
        ...exportGoals.map((g): StyledExcelCell => ({
          value: g.actionPlans[ai]?.description ?? "",
          style: { bg: zebra, fg: EXCEL_THEME.textDark, align: "left" },
        })),
      ]);
      rowHeights[rIdx] = 26;
    }

    exportStyledXLSX(`SMART_Goals_2026_${ownerUser.employeeId}.xlsx`, {
      sheetName: "SMART Goals",
      colWidths,
      rowHeights,
      rows: rowsOut,
      merges,
    });
  };

  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const matrix = parseXLSXMatrix(buf);
      if (matrix.length === 0) return;

      // Mode 1: Format Matriks (kolom 0 = "SMART Goals", kolom 1..N = "Goals 1", "Goals 2", dst.)
      const matrixHdrIdx = matrix.findIndex((r) => /^smart\s*goals$/i.test(String(r[0] ?? "").trim()));
      if (matrixHdrIdx >= 0) {
        const hdr = matrix[matrixHdrIdx];
        const goalLabels = hdr.slice(1).map((c, idx) => String(c ?? "").trim() || `Goals ${idx + 1}`);
        if (goalLabels.length === 0) return;

        const imported: SmartGoal[] = goalLabels.map((lbl, idx) => ({
          id: Date.now() + idx,
          label: lbl,
          specific: "",
          measurable: "",
          attainable: "",
          relevant: "",
          timely: "",
          bukti: "",
          target: "",
          actionPlans: [],
        }));

        let inActionPlans = false;
        for (let ri = matrixHdrIdx + 1; ri < matrix.length; ri++) {
          const r = matrix[ri];
          const col0 = String(r[0] ?? "").trim();
          if (!col0 && r.slice(1).every((c) => !String(c ?? "").trim())) continue;
          if (/^action\s*plans?$/i.test(col0)) {
            inActionPlans = true;
            continue;
          }
          if (!inActionPlans) {
            const keyLower = col0.split("\n")[0].toLowerCase();
            let fieldKey: keyof SmartGoal | null = null;
            if (keyLower.includes("specific")) fieldKey = "specific";
            else if (keyLower.includes("measurable")) fieldKey = "measurable";
            else if (keyLower.includes("attainable")) fieldKey = "attainable";
            else if (keyLower.includes("relevant")) fieldKey = "relevant";
            else if (keyLower.includes("time-bound") || keyLower.includes("timely")) fieldKey = "timely";
            else if (keyLower.includes("target")) fieldKey = "target";
            else if (keyLower.includes("bukti")) fieldKey = "bukti";

            if (fieldKey) {
              imported.forEach((gObj, gi) => {
                (gObj[fieldKey!] as unknown as string) = String(r[gi + 1] ?? "").trim();
              });
            }
          } else if (/^action\s*plan/i.test(col0) || col0) {
            imported.forEach((gObj, gi) => {
              const desc = String(r[gi + 1] ?? "").trim();
              if (desc) {
                gObj.actionPlans.push({
                  id: Date.now() + gi * 100 + gObj.actionPlans.length + 1,
                  description: desc,
                });
              }
            });
          }
        }

        // Pastikan setiap goal minimal memiliki 1 slot action plan agar form rapi
        imported.forEach((gObj, gi) => {
          if (gObj.actionPlans.length === 0) {
            gObj.actionPlans.push({ id: Date.now() + gi * 100 + 99, description: "" });
          }
        });

        const nonEmptyGoals = imported.filter(
          (g) => g.specific || g.measurable || g.attainable || g.relevant || g.timely || g.target || g.actionPlans.some((ap) => ap.description),
        );
        if (nonEmptyGoals.length > 0) {
          updateGoalsAndPersist(nonEmptyGoals.map((g, idx) => ({ ...g, label: `Goals ${idx + 1}` })));
          toast.success(`${nonEmptyGoals.length} SMART Goals beserta Action Plan berhasil di-import.`);
        } else {
          toast.error("File Excel belum berisi data SMART Goals.");
        }
        return;
      }

      // Mode 2: Fallback format baris-per-goal
      const hdrIdx = matrix.findIndex((r) => r.some((c) => /specific/i.test(c)));
      if (hdrIdx < 0) {
        toast.error("Format file Excel SMART Goals tidak dikenali.");
        return;
      }
      const headers = matrix[hdrIdx];
      const rows = matrix.slice(hdrIdx + 1);
      const findC = (pat: RegExp) => headers.findIndex((h) => pat.test(h.trim()));
      const goalsIdx = findC(/goals/i);
      const specificIdx = findC(/specific/i);
      const measurableIdx = findC(/measurable/i);
      const attainableIdx = findC(/attainable/i);
      const relevantIdx = findC(/relevant/i);
      const timelyIdx = findC(/time/i);
      const buktiIdx = findC(/bukti/i);
      const targetIdx = findC(/target/i);
      const apIdx = findC(/action/i);

      const imported: SmartGoal[] = rows
        .filter((r) => r.some((c) => c.trim()))
        .map((r, idx) => {
          const rawAps = apIdx >= 0 ? String(r[apIdx] ?? "") : "";
          const parsedAps = rawAps
            .split(/[;\n]+/)
            .map((s) => s.replace(/^\d+\.\s*/, "").trim())
            .filter(Boolean)
            .map((description, j) => ({ id: Date.now() + idx * 100 + j, description }));
          return {
            id: Date.now() + idx,
            label: (goalsIdx >= 0 && r[goalsIdx]?.trim()) || `Goals ${idx + 1}`,
            specific: specificIdx >= 0 ? r[specificIdx] ?? "" : "",
            measurable: measurableIdx >= 0 ? r[measurableIdx] ?? "" : "",
            attainable: attainableIdx >= 0 ? r[attainableIdx] ?? "" : "",
            relevant: relevantIdx >= 0 ? r[relevantIdx] ?? "" : "",
            timely: timelyIdx >= 0 ? r[timelyIdx] ?? "" : "",
            bukti: buktiIdx >= 0 ? r[buktiIdx] ?? "" : "",
            target: targetIdx >= 0 ? r[targetIdx] ?? "" : "",
            actionPlans: parsedAps.length > 0 ? parsedAps : [{ id: Date.now() + idx * 100 + 1, description: "" }],
          };
        });
      if (imported.length > 0) {
        updateGoalsAndPersist(imported);
        toast.success(`${imported.length} SMART Goals berhasil di-import.`);
      }
    } catch {
      toast.error("Gagal membaca file Excel SMART Goals.");
    }
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setResultGoals(goals);
    saveSubmittedGoals(goals, {
      submitWorkflow: true,
      employeeId: ownerUser.employeeId,
      ownerName: ownerUser.name,
    });
    const next = readUserGoalsState();
    setStatusLabel(next.statusLabel);
    setStatusTone(next.statusTone);
    setWfRecState(next.wfRec);
    setView("results");
  };

  void ALL_TABS;

  return (
    <div className="flex flex-col gap-6">
      {delegationAccess && (
        <DelegatedWorkspaceBanner
          delegator={ownerUser}
          actorName={actorName}
          access={delegationAccess}
          moduleLabel="SMART Goals Setting"
        />
      )}

      <ModuleApprovalStatusBar
        module="SMART Goals"
        phase="setting"
        submittedOverride={submitted}
        employeeId={ownerUser.employeeId}
      />

      {!submitted && !isViewOnly && view === "input" && (
        <InputView
          goals={goals}
          setGoals={updateGoalsAndPersist}
          onPreview={() => setView("preview")}
          onExport={handleExport}
          onImport={handleImport}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
      {!submitted && !isViewOnly && view === "preview" && (
        <PreviewView
          goals={goals}
          onBack={() => setView("input")}
          onSubmit={() => {
            if (canCreate || canEdit) setShowConfirm(true);
          }}
        />
      )}
      {(submitted || isViewOnly) && (
        <ResultsView
          goals={resultGoals}
          statusLabel={statusLabel}
          statusTone={statusTone}
          wfRecord={wfRecState}
        />
      )}

      <ApproverNotesHistory
        employeeId={ownerUser.employeeId}
        module="SMART Goals"
        phase="setting"
        title="Catatan dari Approver"
      />

      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}

export function SMARTGoalsPage() {
  const { activeUser, allUsers } = useAuthStore();
  const [, setDelegTick] = useState(0);
  useEffect(() => {
    const r = () => setDelegTick((t) => t + 1);
    window.addEventListener(DELEGATION_EVENT, r);
    window.addEventListener("pa-db-hydrated", r);
    return () => {
      window.removeEventListener(DELEGATION_EVENT, r);
      window.removeEventListener("pa-db-hydrated", r);
    };
  }, []);

  const usersPool = allUsers.length > 0 ? allUsers : loadManagedUsers();
  const receivedDelegations = getReceivedWorkspaceDelegations(activeUser.employeeId, "smartGoalsSetting", usersPool);
  const workspaces: Array<{ id: string; label: string; owner: ManagedUser; access?: DelegationAccess }> = [
    ...receivedDelegations.map((d) => ({
      id: `deleg-${d.delegator.employeeId}`,
      label: `SMART Goals Setting · Delegasi: ${d.delegator.name}`,
      owner: d.delegator,
      access: d.access,
    })),
    {
      id: `self-${activeUser.employeeId}`,
      label: receivedDelegations.length > 0 ? `SMART Goals Setting Saya (${activeUser.name})` : "SMART Goals",
      owner: activeUser,
    },
  ];

  const [selectedWsId, setSelectedWsId] = useState<string>(() => workspaces[workspaces.length - 1]?.id ?? `self-${activeUser.employeeId}`);
  const activeWs = workspaces.find((w) => w.id === selectedWsId) ?? workspaces[workspaces.length - 1];

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">SMART Goals</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal</p>
        </div>
      </div>

      {workspaces.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200 flex-wrap">
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWs.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => setSelectedWsId(ws.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  isActive
                    ? "border-[#1A284F] text-[#1A284F] bg-[#1A284F]/5 rounded-t-lg"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-t-lg"
                }`}
              >
                <span>{ws.label}</span>
                {ws.access && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    Delegasi
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <SMARTGoalsWorkspace
        key={activeWs.id}
        ownerUser={activeWs.owner}
        delegationAccess={activeWs.access}
        actorName={activeUser.name}
      />
    </div>
  );
}
