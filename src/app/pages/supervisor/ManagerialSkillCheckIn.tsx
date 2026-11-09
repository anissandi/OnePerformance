import { useState } from "react";
import { X, CheckCircle2, FileCheck } from "lucide-react";
import { saveMSSelfRatings, loadMSSelfRatings } from "../shared/msStore";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Indicator {
  score: 1 | 2 | 3 | 4 | 5;
  label: string;
  text: string;
}

export interface MSItem {
  no: number;
  label: string;
  description: string;
  indicators: Indicator[];
}

export const MS_ITEMS: MSItem[] = [
  {
    no: 1,
    label: "Kepemimpinan:",
    description: "Mampu mengukur efektivitas hasil kerja bawahan; menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif, serta mengukur efektivitas kinerja secara efektif, serta mempromosikan inovasi dan kerja tim.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif." },
      { score: 2, label: "Nilai 2", text: "Mampu menciptakan tujuan yang menantang." },
      { score: 3, label: "Nilai 3", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif. Namun membutuhkan waktu yang lebih lama untuk dapat mengukur efektivitas kinerja seluruh bawahannya." },
      { score: 4, label: "Nilai 4", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif dan mampu mengukur efektivitas kinerja seluruh bawahannya." },
      { score: 5, label: "Nilai 5", text: "Mampu menciptakan tujuan yang menantang, berkoordinasi dan mendelegasikan pekerjaan kepada tim secara efektif serta mampu dengan berbagai metode-metode yang tepat serta mampu mengukur efektivitas kinerja seluruh bawahannya." },
    ],
  },
  {
    no: 2,
    label: "Keselarasan Organisasi:",
    description: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif." },
      { score: 2, label: "Nilai 2", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi serta memberikan perintah pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi." },
      { score: 4, label: "Nilai 4", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman mengenai keputusan organisasi dan bagaimana tujuan tersebut dapat dibuat pada bawahan dengan jelas dan efektif untuk mencapai tujuan-tujuan organisasi." },
      { score: 5, label: "Nilai 5", text: "Mampu menginformasikan dengan tepat, menyebarluaskan dan memberikan pemahaman yang mendalam dan detail mengenai keputusan organisasi dan bagaimana tujuan tersebut dapat dibuat untuk bawahannya yang efektif untuk mencapai tujuan-tujuan organisasi." },
    ],
  },
  {
    no: 3,
    label: "Perencanaan Penerus:",
    description: "Mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 2, label: "Nilai 2", text: "Mampu mempersiapkan penerus yang secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan namun membutuhkan waktu yang lebih lama dari yang seharusnya." },
      { score: 3, label: "Nilai 3", text: "Mampu mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat perencanaan yang baik dan merestruktur untuk mempersiapkan penerus yang sesuai dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat perencanaan yang baik dan merestruktur untuk mempersiapkan penerus yang sesuai dengan kondisi perusahaan dan tepat waktu secara bertanggung jawab untuk memenuhi tujuan departemen/perusahaan." },
    ],
  },
  {
    no: 4,
    label: "Resolusi Konflik Internal:",
    description: "Dapat membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 2, label: "Nilai 2", text: "Mampu membuat keputusan yang logis, namun tidak tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya secara efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah tanggung jawab manajerialnya." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik antar rekan kerja, dalam cakupan wilayah manajerialnya tanggung jawab yang berkepanjangan yang dapat mempengaruhi kinerja." },
    ],
  },
  {
    no: 5,
    label: "Resolusi Konflik Eksternal:",
    description: "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya.",
    indicators: [
      { score: 1, label: "Nilai 1", text: "Tidak mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 2, label: "Nilai 2", text: "Mampu membuat keputusan yang logis namun tidak tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya secara efektif." },
      { score: 3, label: "Nilai 3", text: "Mampu membuat keputusan yang logis dan tepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 4, label: "Nilai 4", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya." },
      { score: 5, label: "Nilai 5", text: "Mampu membuat keputusan yang logis, tepat dan cepat untuk mengatasi konflik yang melibatkan pihak-pihak di luar cakupan wilayah tanggung jawab manajerialnya serta mampu dalam membuat kesepakatan yang menguntungkan semua pihak." },
    ],
  },
];

const PERCENTAGE = 20;

// ─── Indicator Modal ──────────────────────────────────────────────────────────

function IndicatorModal({ item, onClose }: { item: MSItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Indikator Penilaian</p>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0">
              <tr>
                <th className="bg-[#1A284F] text-white text-left py-3 px-4 font-semibold w-56 border-r border-white/20">Indikator Penilaian</th>
                {[1,2,3,4,5].map((n) => (
                  <th key={n} className="bg-[#1A284F] text-white text-center py-3 px-4 font-semibold border-r border-white/20 last:border-r-0">{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-4 px-4 align-top border-r border-gray-200 bg-gray-50">
                  <p className="font-semibold text-gray-800 mb-1">{item.label}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.description}</p>
                </td>
                {item.indicators.map((ind) => (
                  <td key={ind.score} className="py-4 px-4 align-top text-gray-700 leading-relaxed border-r border-gray-100 last:border-r-0 text-xs">
                    {ind.text}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 bg-[#1A284F] text-white rounded text-sm font-medium hover:bg-[#131d3b] transition-colors">Tutup</button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm / Success Modals ─────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={onCancel} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <h3 className="text-base font-bold text-gray-900 mb-5">Action Confirmation</h3>
        <p className="text-sm text-gray-700 mb-6">Are you sure you want to submit this Managerial Skill form?</p>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <h3 className="text-base font-bold text-gray-900 mb-8">Action Confirmation</h3>
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative">
            <FileCheck className="w-14 h-14 text-[#C69A45]" />
            <CheckCircle2 className="w-5 h-5 text-[#C69A45] absolute -bottom-1 -right-1 bg-white rounded-full" />
          </div>
          <p className="text-sm text-gray-700 text-center">Managerial Skill form successfully submitted for approval</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Ratings = Record<number, number | null>;

export function SupervisorManagerialSkillCheckIn() {
  const [ratings, setRatings] = useState<Ratings>(() => {
    const stored = loadMSSelfRatings();
    return stored ? stored.ratings as Ratings : {};
  });
  const [saved, setSaved] = useState(false);
  const [modalItem, setModalItem] = useState<MSItem | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const totalScore = MS_ITEMS.reduce((sum, item) => sum + (ratings[item.no] ?? 0), 0);
  const rated = MS_ITEMS.filter((item) => ratings[item.no] != null).length;
  const allRated = rated === MS_ITEMS.length;

  const setRating = (no: number, val: number) => {
    setSaved(false);
    setRatings((prev) => ({ ...prev, [no]: val }));
  };

  const saveForm = () => setSaved(true);

  const resetForm = () => {
    setRatings({});
    setSaved(false);
  };

  const handleConfirmSubmit = () => {
    setShowConfirm(false);
    setShowSuccess(true);
    saveMSSelfRatings({
      ratings: ratings as Record<number, number>,
      totalScore,
      submittedAt: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }),
    });
  };

  return (
    <div className="w-full flex flex-col h-full pb-20 relative">
      {/* Form header */}
      <div className="bg-white border border-gray-100 rounded-xl py-5 text-center shadow-sm mb-4 shrink-0">
        <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase mb-1">Performance Appraisal</p>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Managerial Skills</h2>
        <p className="text-sm text-[#1A284F]">Indikator penilaian Kepemimpinan dan Keterampilan Manajerial</p>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between bg-[#1A284F] text-white px-5 py-3 rounded-lg mb-4 shrink-0">
        <span className="text-sm font-bold tracking-wide">KEPEMIMPINAN DAN KETERAMPILAN MANAJERIAL (MANAGERIAL SKILLS)</span>
        <span className="text-xs font-semibold bg-[#C69A45] text-white px-3 py-1 rounded whitespace-nowrap">
          ({PERCENTAGE}%) Nilai Total
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200 w-12">No</th>
                <th className="py-3 px-4 text-left font-semibold text-gray-700 border-r border-gray-200">
                  Kepemimpinan dan Keterampilan Manajerial (Managerial Skills)
                </th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 border-r border-gray-200 w-44">Indikator Penilaian</th>
                <th className="py-3 px-4 text-center font-semibold text-gray-700 w-56">
                  <div>Evaluasi Pribadi Karyawan</div>
                  <div className="flex justify-around mt-1 text-gray-400 font-normal">
                    {[1,2,3,4,5].map((n) => <span key={n} className="w-8 text-center">{n}</span>)}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MS_ITEMS.map((item) => {
                const selected = ratings[item.no] ?? null;
                return (
                  <tr key={item.no} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4 text-gray-500 align-top border-r border-gray-100">{item.no}</td>
                    <td className="py-4 px-4 align-top border-r border-gray-100 leading-relaxed text-gray-800">
                      <span className="font-bold italic">{item.label} </span>
                      {item.description}
                    </td>
                    <td className="py-4 px-4 align-middle border-r border-gray-100 text-center">
                      <button
                        onClick={() => setModalItem(item)}
                        className="text-xs font-medium px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 hover:border-[#1A284F] hover:text-[#1A284F] transition-colors text-gray-700 whitespace-nowrap"
                      >
                        Lihat Indikator Penilaian
                      </button>
                    </td>
                    <td className="py-4 px-4 align-middle">
                      <div className="flex items-center justify-around">
                        {[1,2,3,4,5].map((n) => (
                          <button
                            key={n}
                            onClick={() => setRating(item.no, n)}
                            className={`w-8 h-8 rounded border text-xs font-semibold transition-colors ${
                              selected === n
                                ? "bg-[#1A284F] text-white border-[#1A284F]"
                                : "border-gray-300 text-gray-600 hover:border-[#1A284F] hover:text-[#1A284F]"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={3} className="py-3 px-4 text-sm font-bold text-gray-800 border-r border-gray-200 text-right">
                  ({PERCENTAGE}%) Nilai Total
                </td>
                <td className="py-3 px-4 text-center font-bold text-[#1A284F]">
                  {totalScore}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between z-10 gap-4">
        {saved ? (
          <>
            <div className="flex-1 flex items-center gap-2 bg-green-50 border border-green-200 rounded px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-800">
                Form berhasil disimpan. Total Nilai: <span className="font-bold">{totalScore}</span>
              </p>
            </div>
            <button onClick={resetForm} className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shrink-0">Reset</button>
            <button
              onClick={() => setShowConfirm(true)}
              className="px-6 py-2 bg-[#C69A45] text-white rounded text-sm font-semibold hover:bg-[#b38a3a] transition-colors shrink-0"
            >
              Submit Form
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{rated}</span> dari{" "}
              <span className="font-semibold text-gray-800">{MS_ITEMS.length}</span> kompetensi telah dinilai
            </p>
            <div className="flex items-center gap-3">
              <button onClick={resetForm} className="px-5 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Reset</button>
              <button
                onClick={saveForm}
                disabled={!allRated}
                className="px-5 py-2 bg-[#1A284F] text-white rounded text-sm font-medium hover:bg-[#131d3b] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
              <button
                disabled
                className="px-6 py-2 bg-[#C69A45] text-white rounded text-sm font-semibold opacity-40 cursor-not-allowed shrink-0"
              >
                Submit Form
              </button>
            </div>
          </>
        )}
      </div>

      {modalItem && <IndicatorModal item={modalItem} onClose={() => setModalItem(null)} />}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirmSubmit} />}
      {showSuccess && <SuccessModal onClose={() => setShowSuccess(false)} />}
    </div>
  );
}
