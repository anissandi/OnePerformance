// @refresh reset
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Eye, CheckCircle2, FileText, Edit3, Send, ChevronRight, Info, AlertTriangle, Clock, RotateCcw, Lock, MessageSquare } from "lucide-react";
import { loadSubmittedGoals, saveSubmittedGoals } from "../shared/smartGoalsStore";
import { loadWorkflowRecords, normalizeEmployeeId, type WorkflowRecord } from "../shared/appraisalWorkflowStore";
import { getActiveUser } from "../../store/authStore";
import { ModuleApprovalStatusBar } from "../../components/ModuleApprovalStatusBar";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../utils/excelUtils";

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
  onUpdate,
  onAdd,
  onRemove,
}: {
  goals: SmartGoal[];
  editable: boolean;
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
                {editable ? (
                  <div className="flex items-center justify-center gap-2">
                    <input
                      value={g.label}
                      onChange={(e) => onUpdate?.(g.id, "label" as RowKey, e.target.value)}
                      className="bg-transparent text-white font-bold text-center border-b border-white/40 outline-none w-24 placeholder-white/50"
                    />
                    <button
                      onClick={() => onRemove?.(g.id)}
                      className="text-white/50 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  g.label
                )}
              </th>
            ))}
            {editable && (
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
                  {editable ? (
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

              {editable && <td className={`border-2 border-black ${row.key === "target" ? "bg-blue-50/60" : "bg-white"}`} />}
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
  onUpdatePlan,
  onAddPlan,
  onRemovePlan,
}: {
  goals: SmartGoal[];
  editable: boolean;
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
                  {editable ? (
                    <>
                      <input
                        value={ap.description}
                        onChange={(e) => onUpdatePlan?.(goal.id, ap.id, e.target.value)}
                        placeholder="Tuliskan rencana tindakan..."
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1A284F] bg-white text-gray-800"
                      />
                      <button
                        onClick={() => onRemovePlan?.(goal.id, ap.id)}
                        className="mt-1 text-gray-300 hover:text-red-400 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <p className="flex-1 text-xs text-gray-700 leading-relaxed py-1">{ap.description || "—"}</p>
                  )}
                </div>
              ))}
              {editable && (
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
}: {
  goals: SmartGoal[];
  setGoals: React.Dispatch<React.SetStateAction<SmartGoal[]>>;
  onPreview: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
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
        <ExportImportButton onExport={onExport} onImport={onImport} size="sm" />
      </div>

      <SmartTable
        goals={goals}
        editable={true}
        onUpdate={update}
        onAdd={add}
        onRemove={remove}
      />

      {/* Action Plans */}
      <ActionPlansSection
        goals={goals}
        editable={true}
        onAddPlan={addPlan}
        onUpdatePlan={updatePlan}
        onRemovePlan={removePlan}
      />

      <div className="flex justify-end gap-3 pt-2">
        <button
          onClick={onPreview}
          disabled={!allFilled}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Eye className="w-4 h-4" />
          Preview
          <ChevronRight className="w-4 h-4" />
        </button>
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
  const revisionList = wfRecord?.revisionHistory ?? [];
  const latestNote =
    wfRecord?.decisions.approver2?.note ||
    wfRecord?.decisions.approver1?.note ||
    wfRecord?.decisions.checker?.note ||
    revisionList[revisionList.length - 1]?.note ||
    "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1A284F]">SMART Goals — 2026 Performance Appraisal</h3>
      </div>

      <SmartTable goals={goals} editable={false} />
      <ActionPlansSection goals={goals} editable={false} />

      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-3">
        <h4 className="text-sm font-bold text-[#1A284F] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#1A284F]" />
          Feedback &amp; Riwayat Revisi dari Approver
        </h4>
        {revisionList.length > 0 ? (
          <div className="space-y-2.5">
            {revisionList.map((rev, idx) => (
              <div key={idx} className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-orange-800">
                  <span>{rev.role} — {rev.approverName}</span>
                  <span className="text-[11px] font-normal text-orange-600">{rev.date}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{rev.note}</p>
              </div>
            ))}
          </div>
        ) : latestNote ? (
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-gray-700">
            {latestNote}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-400 italic">
            Belum ada catatan/revisi dari Approver.
          </div>
        )}
      </div>
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

export function SMARTGoalsPage() {
  const readUserGoalsState = () => {
    const user = getActiveUser();
    const normId = normalizeEmployeeId(user.employeeId);
    const saved = loadSubmittedGoals(user.employeeId);
    const wfRec = loadWorkflowRecords().find(
      (r) =>
        r.year === "2026" &&
        r.module === "SMART Goals" &&
        r.phase === "setting" &&
        (r.employeeId === normId || r.employeeId.toLowerCase() === user.employeeId.toLowerCase()),
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

    const initialGoals = saved && saved.length > 0 ? saved : SAMPLE_GOALS;
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
  const [view, setView] = useState<View>(() => (init.lockedSubmitted ? "results" : "input"));
  const [goals, setGoals] = useState<SmartGoal[]>(() => init.initialGoals);
  const [resultGoals, setResultGoals] = useState<SmartGoal[]>(() => init.initialGoals);
  const [submitted, setSubmitted] = useState<boolean>(() => init.lockedSubmitted);
  const [statusLabel, setStatusLabel] = useState<string>(() => init.statusLabel);
  const [statusTone, setStatusTone] = useState<"validated" | "in_progress" | "revision" | "submitted">(() => init.statusTone);
  const [wfRecState, setWfRecState] = useState<WorkflowRecord | undefined>(() => init.wfRec);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readUserGoalsState();
      setGoals(next.initialGoals);
      setResultGoals(next.initialGoals);
      setSubmitted(next.lockedSubmitted);
      setStatusLabel(next.statusLabel);
      setStatusTone(next.statusTone);
      setWfRecState(next.wfRec);
      if (next.lockedSubmitted) {
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
  }, []);

  const handleExport = () => {
    const headers = ["No","Goals","Specific","Measurable","Attainable","Relevant","Timely","Bukti","Target","Action Plans"];
    const rows = goals.map((g, i) => [
      String(i + 1), g.label, g.specific, g.measurable, g.attainable, g.relevant, g.timely, g.bukti, g.target,
      g.actionPlans.map((ap, j) => `${j+1}. ${ap.description}`).join("; "),
    ]);
    exportXLSX("SMART_Goals_2026.xlsx", headers, rows);
  };

  const handleImport = async (file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      const goalsIdx = headers.findIndex((h) => /goals/i.test(h.trim()));
      const specificIdx = headers.findIndex((h) => /specific/i.test(h.trim()));
      const measurableIdx = headers.findIndex((h) => /measurable/i.test(h.trim()));
      const attainableIdx = headers.findIndex((h) => /attainable/i.test(h.trim()));
      const relevantIdx = headers.findIndex((h) => /relevant/i.test(h.trim()));
      const timelyIdx = headers.findIndex((h) => /timely/i.test(h.trim()));
      const buktiIdx = headers.findIndex((h) => /bukti/i.test(h.trim()));
      const targetIdx = headers.findIndex((h) => /target/i.test(h.trim()));
      const imported: SmartGoal[] = rows.filter((r) => r.some((c) => c.trim())).map((r, i) => ({
        id: Date.now() + i,
        label: goalsIdx >= 0 ? r[goalsIdx] ?? "" : `Goal ${i + 1}`,
        specific: specificIdx >= 0 ? r[specificIdx] ?? "" : "",
        measurable: measurableIdx >= 0 ? r[measurableIdx] ?? "" : "",
        attainable: attainableIdx >= 0 ? r[attainableIdx] ?? "" : "",
        relevant: relevantIdx >= 0 ? r[relevantIdx] ?? "" : "",
        timely: timelyIdx >= 0 ? r[timelyIdx] ?? "" : "",
        bukti: buktiIdx >= 0 ? r[buktiIdx] ?? "" : "",
        target: targetIdx >= 0 ? r[targetIdx] ?? "" : "",
        actionPlans: [],
      }));
      if (imported.length > 0) setGoals(imported);
    } catch { /* ignore parse errors */ }
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setResultGoals(goals);
    saveSubmittedGoals(goals, { submitWorkflow: true });
    const next = readUserGoalsState();
    setStatusLabel(next.statusLabel);
    setStatusTone(next.statusTone);
    setWfRecState(next.wfRec);
    setView("results");
  };

  // After submission: hide Input Form tab; before submission: Results tab inactive
  const visibleTabs = submitted ? ALL_TABS.filter((t) => t.id !== "input") : ALL_TABS;

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">SMART Goals</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal</p>
        </div>
      </div>

      <ModuleApprovalStatusBar
        module="SMART Goals"
        phase="setting"
        submittedOverride={submitted}
      />

      {!submitted && view === "input" && (
        <InputView goals={goals} setGoals={setGoals} onPreview={() => setView("preview")} onExport={handleExport} onImport={handleImport} />
      )}
      {!submitted && view === "preview" && (
        <PreviewView goals={goals} onBack={() => setView("input")} onSubmit={() => setShowConfirm(true)} />
      )}
      {submitted && (
        <ResultsView
          goals={resultGoals}
          statusLabel={statusLabel}
          statusTone={statusTone}
          wfRecord={wfRecState}
        />
      )}

      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}
