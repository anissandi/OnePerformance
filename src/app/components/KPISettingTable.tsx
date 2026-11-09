import { Edit3, Trash2 } from "lucide-react";

type Polaritas = "Maximize" | "Minimize";
export interface KPISetting {
  id: string;
  no: string;
  section: "A" | "B";
  perspektif: string;
  kpi: string;
  satuan: string;
  formula: string;
  bobot: string;
  definisi: string;
  source: string;
  baseline2025: string;
  target2026: string;
  polaritas: Polaritas;
  detailFormula: string;
  keterangan: string;
}

const PERSP_COLOR: Record<string, string> = {
  Finansial: "text-blue-700",
  Proses: "text-purple-700",
  "Environment, Health & Safety": "text-green-700",
  Customer: "text-orange-700",
  "Learning & Growth": "text-pink-700",
};

const W_NO = 52;
const W_PERSP = 140;
const W_KPI = 270;

export function KPISettingTable({
  items,
  editable,
  onEdit,
  onDelete,
  sectionWeights,
}: {
  items: KPISetting[];
  editable: boolean;
  onEdit?: (item: KPISetting) => void;
  onDelete?: (id: string) => void;
  sectionWeights?: { A: number; B: number };
}) {
  const sectionItems = (sec: "A" | "B") => items.filter((k) => k.section === sec);

  const totalCols = editable ? 15 : 14;

  const renderRows = (sec: "A" | "B") =>
    sectionItems(sec).map((item) => (
      <tr key={item.id} className="border-t border-gray-200 hover:bg-gray-50/50 transition-colors">
        <td className="border border-gray-200 text-center text-xs font-semibold text-gray-600 bg-white py-3 px-2"
          style={{ position: "sticky", left: 0, zIndex: 10, minWidth: W_NO, maxWidth: W_NO }}>
          {item.no}
        </td>
        <td className="border border-gray-200 py-3 px-3 bg-white"
          style={{ position: "sticky", left: W_NO, zIndex: 10, minWidth: W_PERSP, maxWidth: W_PERSP }}>
          <span className={`text-xs font-bold ${PERSP_COLOR[item.perspektif] ?? "text-gray-700"}`}>
            {item.perspektif}
          </span>
        </td>
        <td className="border border-gray-200 py-3 px-3 bg-white"
          style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 10, minWidth: W_KPI, maxWidth: W_KPI }}>
          <p className="text-xs font-medium text-gray-800 whitespace-pre-line leading-relaxed">{item.kpi}</p>
        </td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600" style={{ minWidth: 120 }}>{item.satuan}</td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 text-center" style={{ minWidth: 100 }}>{item.formula}</td>
        <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 72 }}>
          <span className="px-2 py-0.5 bg-[#1A284F] text-white rounded-full text-[10px] font-bold">{item.bobot}</span>
        </td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 leading-relaxed" style={{ minWidth: 240 }}>{item.definisi}</td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600" style={{ minWidth: 160 }}>{item.source}</td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-700 font-medium text-center" style={{ minWidth: 96 }}>{item.baseline2025}</td>
        <td className="border border-gray-200 py-3 px-3 text-xs font-bold text-[#1A284F] text-center" style={{ minWidth: 96 }}>{item.target2026}</td>
        <td className="border border-gray-200 py-3 px-2 text-center" style={{ minWidth: 96 }}>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.polaritas === "Maximize" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
            {item.polaritas}
          </span>
        </td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 260 }}>{item.detailFormula}</td>
        <td className="border border-gray-200 py-3 px-3 text-xs text-gray-600 whitespace-pre-line leading-relaxed" style={{ minWidth: 180 }}>{item.keterangan || "—"}</td>

        {editable && (
          <td className="border border-gray-200 bg-white py-3 px-2 text-center" style={{ minWidth: 80 }}>
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => onEdit?.(item)}
                className="p-1.5 rounded-lg hover:bg-[#1A284F]/10 transition-colors text-[#1A284F]"
                title="Edit"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete?.(item.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-red-400 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        )}
      </tr>
    ));

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="border-collapse text-xs" style={{ minWidth: `${W_NO + W_PERSP + W_KPI + 1430 + (editable ? 80 : 0)}px` }}>
        <thead>
          <tr className="bg-[#1A284F] text-white">
            <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold"
              style={{ position: "sticky", left: 0, zIndex: 20, background: "#1A284F", minWidth: W_NO }}>No</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold"
              style={{ position: "sticky", left: W_NO, zIndex: 20, background: "#1A284F", minWidth: W_PERSP }}>Perspektif</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold"
              style={{ position: "sticky", left: W_NO + W_PERSP, zIndex: 20, background: "#1A284F", minWidth: W_KPI }}>KPI</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 120 }}>Satuan</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 font-semibold" style={{ minWidth: 100 }}>Formula Pencapaian</th>
            <th className="border border-[#1A284F]/30 py-3 px-2 font-semibold text-center" style={{ minWidth: 72 }}>Bobot</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 240 }}>Definisi / Deskripsi</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 160 }}>Source</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Baseline 2025</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Target 2026</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-center font-semibold" style={{ minWidth: 96 }}>Polaritas</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 260 }}>Detail Formula Pencapaian</th>
            <th className="border border-[#1A284F]/30 py-3 px-3 text-left font-semibold" style={{ minWidth: 180 }}>Keterangan</th>
            {editable && (
              <th className="border border-[#1A284F]/30 py-3 px-2 text-center font-semibold" style={{ minWidth: 80 }}>Aksi</th>
            )}
          </tr>
        </thead>

        <tbody>
          <tr>
            <td colSpan={totalCols} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border"
              style={{ background: "#1565C0", borderColor: "#1565C0" }}>
              A. Objective KPI — Bobot {sectionWeights?.A ?? 20}%
            </td>
          </tr>
          {renderRows("A")}

          <tr>
            <td colSpan={totalCols} className="py-2 px-4 text-white text-xs font-bold uppercase tracking-widest border"
              style={{ background: "#1976D2", borderColor: "#1976D2" }}>
              B. Functional KPI — Bobot {sectionWeights?.B ?? 80}%
            </td>
          </tr>
          {renderRows("B")}
        </tbody>
      </table>
    </div>
  );
}
