import { KPISettingTable } from "../../components/KPISettingTable";
import type { KPISetting } from "../../components/KPISettingTable";
import { useState } from "react";
import { Eye, Send, CheckCircle2, Edit3, Plus, Trash2, X } from "lucide-react";
import ExportImportButton from "../../components/ExportImportButton";
import { exportXLSX, parseXLSX } from "../../utils/excelUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Polaritas = "Maximize" | "Minimize";
type PageView = "input" | "preview";



// ─── Initial Data (from image) ────────────────────────────────────────────────

const INITIAL_KPI_SETTINGS: KPISetting[] = [
  {
    id: "1",
    no: "1",
    section: "A",
    perspektif: "Finansial",
    kpi: "Net Profit (dalam miliar)",
    satuan: "Rp Miliar /bulan",
    formula: "Jumlah",
    bobot: "10%",
    definisi: "Laba Bersih Perusahaan setelah dikurangi pengeluaraan biaya, bunga dan pajak RSUP Group",
    source: "Laporan Keuangan RSUP Industry",
    baseline2025: "687",
    target2026: "750",
    polaritas: "Maximize",
    detailFormula: "Jumlah laba bersih perusahaan\n\n*Pencapaian = Realisasi / Target",
    keterangan: "",
  },
  {
    id: "2",
    no: "2",
    section: "A",
    perspektif: "Proses",
    kpi: "Fatality Accident",
    satuan: "Kasus /bulan",
    formula: "Jumlah",
    bobot: "10%",
    definisi: "Jumlah kecelakaan kerja yang mengakibatkan kematian pekerja",
    source: "Laporan Komite K3",
    baseline2025: "1",
    target2026: "0",
    polaritas: "Minimize",
    detailFormula: "= Jumlah kasus Kecelakaan kerja yang menyebabkan kematian (RSUP IND + RSUP PKB + ASD + RSTM + GHS)",
    keterangan: "",
  },
  {
    id: "3",
    no: "3",
    section: "B",
    perspektif: "Finansial",
    kpi: "HPP Produksi Energy:\na. Listrik (target: 1.920 Rp/kwh)\nb. Steam (target: 294 Rp/kg)",
    satuan: "% /bulan",
    formula: "Rata-Rata",
    bobot: "20%",
    definisi: "Upaya sistematis untuk menekan biaya bahan baku, tenaga kerja, overhead, dan distribusi agar harga pokok produksi tetap rendah, margin keuntungan terjaga, dan daya saing produk meningkat",
    source: "Laporan Keuangan RSUP Industry",
    baseline2025: "100%",
    target2026: "100%",
    polaritas: "Minimize",
    detailFormula: "= (Realisasi pencapaian listrik + Realisasi pencapaian steam) / 2",
    keterangan: "Baseline:\nListrik: 1,799.77\nSteam: 273.99",
  },
  {
    id: "4a",
    no: "4a",
    section: "B",
    perspektif: "Proses",
    kpi: "Efisiensi pemakaian energi dan material:\na. Bahan Bakar - Produksi Steam (Target: 3,22 kg steam/kg bb)\nb. Bahan Bakar - Produksi Listrik (Target: 0,64 kwh/kg bb)\nc. Konsumsi HCL - Proses Demineralisasi (Target: 0,23 Kg/M3)\nd. Konsumsi NaOH - Proses Demineralisasi (Target: 0,11 Kg/M3)",
    satuan: "% /bulan",
    formula: "Rata-Rata",
    bobot: "20%",
    definisi: "Meningkatkan rata-rata efisiensi dalam pemakaian energi dan material berlebih",
    source: "Laporan PWP",
    baseline2025: "97%",
    target2026: "100%",
    polaritas: "Maximize",
    detailFormula: "= (Eff BB Steam + Eff BB Listrik + Penggunaan HCL + Penggunaan NaOH) / 4\n\n*Pemakaian BB (steam) = kg steam/kg bahan bakar (batubara+tempurung)\n**Pemakaian BB (listrik) = kWh/kg bahan bakar\n***Penggunaan HCL = Total HCL (kg) / Volume air (m3)\n****Penggunaan NaOH = Total NaOH (kg)/Volume air (m3)",
    keterangan: "Baseline:\nSteam: —\nListrik: —\nHCL: —\nNaOH: —",
  },
  {
    id: "4b",
    no: "4b",
    section: "B",
    perspektif: "Proses",
    kpi: "Pencapaian Index Produktivitas Karyawan:\na. Karyawan Power Plant (PWP) - Steam (Target: 22,43 ton steam/orang)\nb. Karyawan Power Plant (PWP) - Listrik (Target: 2.999 kwh/orang)",
    satuan: "% /bulan",
    formula: "Rata-Rata",
    bobot: "15%",
    definisi: "Meningkatkan produktivitas dengan menggunakan kapasitas maksimum sumberdaya dan output bulanan",
    source: "Laporan PWP",
    baseline2025: "198%",
    target2026: "100%",
    polaritas: "Maximize",
    detailFormula: "= (Index produktivitas karyawan PWP - Steam + Index produktivitas karyawan PWP - Listrik) / 2\n\n*Indeks Produktivitas = Total output pekerjaan / Jumlah manday",
    keterangan: "Baseline:\nSteam: 22.3\nListrik: 2,830",
  },
  {
    id: "5a",
    no: "5a",
    section: "B",
    perspektif: "Environment, Health & Safety",
    kpi: "Pencapaian Kinerja Terintegrasi: LTI",
    satuan: "hari/tahun",
    formula: "Nilai Akhir",
    bobot: "5%",
    definisi: "Rata-rata nilai parameter keselamatan, kesehatan kerja, keamanan pangan, mutu dan lingkungan",
    source: "Laporan Komite K3",
    baseline2025: "17",
    target2026: "17",
    polaritas: "Maximize",
    detailFormula: "Nilai poin LTI",
    keterangan: "",
  },
  {
    id: "5b",
    no: "5b",
    section: "B",
    perspektif: "Environment, Health & Safety",
    kpi: "Regulatory Compliance - Audit Eksternal",
    satuan: "temuan/tahun",
    formula: "Nilai Akhir",
    bobot: "5%",
    definisi: "Memenuhi kepatuhan organisasi terhadap regulasi, perizinan, dan persyaratan hukum yang berlaku",
    source: "Laporan QA",
    baseline2025: "0",
    target2026: "0",
    polaritas: "Maximize",
    detailFormula: "Jumlah temuan yang terdapat pada audit eksternal dept PWP (NC)",
    keterangan: "",
  },
  {
    id: "6",
    no: "6",
    section: "B",
    perspektif: "Customer",
    kpi: "Meminimalisasi Risiko Proses\nJumlah Kasus Turbin Trip",
    satuan: "kasus/bulan",
    formula: "Jumlah",
    bobot: "10%",
    definisi: "Meminimalisir tingkat risiko untuk seluruh proses yang berada pada scope pekerjaan Dept PWP dan memiliki dampak yang cukup signifikan terhadap relasi",
    source: "Laporan PWP",
    baseline2025: "2",
    target2026: "2",
    polaritas: "Minimize",
    detailFormula: "Total kejadian turbin trip per tahun",
    keterangan: "",
  },
  {
    id: "7",
    no: "7",
    section: "B",
    perspektif: "Learning & Growth",
    kpi: "Hard & Softskill Training",
    satuan: "Jumlah",
    formula: "Nilai Akhir",
    bobot: "5%",
    definisi: "Mengukur sejauh mana organisasi menjadi tempat kerja yang diminati, dengan menciptakan lingkungan kerja yang mendukung keterlibatan karyawan, pengembangan kompetensi, dan daya tarik bagi talenta industri.",
    source: "Laporan HRD",
    baseline2025: "25",
    target2026: "25",
    polaritas: "Maximize",
    detailFormula: "Jumlah pelaksanaan Hard & Softskill Training di dept BLR",
    keterangan: "",
  },
];

const PERSPEKTIF_OPTIONS = [
  "Finansial",
  "Proses",
  "Environment, Health & Safety",
  "Customer",
  "Learning & Growth",
];

const FORMULA_OPTIONS = ["Jumlah", "Rata-Rata", "Nilai Akhir"];



// ─── Confirm / Success modals ─────────────────────────────────────────────────

function ConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-[#1A284F]/10 flex items-center justify-center mx-auto mb-4">
          <Send className="w-6 h-6 text-[#1A284F]" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-1">Action Confirmation</h3>
        <p className="text-gray-500 text-sm mb-6">Are you sure you want to submit the KPI Setting for approval?</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel} className="px-6 py-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg mb-2">Submitted Successfully</h3>
        <p className="text-gray-500 text-sm mb-6">KPI Setting has been submitted for approval.</p>
        <button onClick={onClose} className="px-8 py-2 rounded-full bg-[#1A284F] text-white text-sm font-semibold hover:bg-[#131d3b] transition-colors">Done</button>
      </div>
    </div>
  );
}

// ─── Edit Row Modal ───────────────────────────────────────────────────────────

function EditRowModal({
  item,
  onSave,
  onClose,
}: {
  item: KPISetting;
  onSave: (updated: KPISetting) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<KPISetting>({ ...item });

  const set = (key: keyof KPISetting, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-[#1A284F] text-lg">Edit KPI — {form.no}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">No</label>
              <input value={form.no} onChange={(e) => set("no", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Section</label>
              <select value={form.section} onChange={(e) => set("section", e.target.value as "A" | "B")}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                <option value="A">A — Objective KPI</option>
                <option value="B">B — Functional KPI</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Perspektif</label>
            <select value={form.perspektif} onChange={(e) => set("perspektif", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
              {PERSPEKTIF_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">KPI</label>
            <textarea rows={3} value={form.kpi} onChange={(e) => set("kpi", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Satuan</label>
              <input value={form.satuan} onChange={(e) => set("satuan", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Formula Pencapaian</label>
              <select value={form.formula} onChange={(e) => set("formula", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                {FORMULA_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Bobot</label>
              <input value={form.bobot} onChange={(e) => set("bobot", e.target.value)}
                placeholder="e.g. 10%"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Polaritas</label>
              <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                <option value="Maximize">Maximize</option>
                <option value="Minimize">Minimize</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Definisi / Deskripsi</label>
            <textarea rows={3} value={form.definisi} onChange={(e) => set("definisi", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Source</label>
            <input value={form.source} onChange={(e) => set("source", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Baseline 2025</label>
              <input value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target 2026</label>
              <input value={form.target2026} onChange={(e) => set("target2026", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Detail Formula Pencapaian</label>
            <textarea rows={4} value={form.detailFormula} onChange={(e) => set("detailFormula", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Keterangan</label>
            <textarea rows={3} value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={() => { onSave(form); onClose(); }}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Setting Table ────────────────────────────────────────────────────────



// ─── Add KPI Modal ────────────────────────────────────────────────────────────

function AddKPIModal({ onAdd, onClose }: { onAdd: (item: KPISetting) => void; onClose: () => void }) {
  const [form, setForm] = useState<Omit<KPISetting, "id">>({
    no: "",
    section: "B",
    perspektif: "Proses",
    kpi: "",
    satuan: "",
    formula: "Jumlah",
    bobot: "",
    definisi: "",
    source: "",
    baseline2025: "",
    target2026: "",
    polaritas: "Maximize",
    detailFormula: "",
    keterangan: "",
  });

  const set = (key: keyof typeof form, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleAdd = () => {
    if (!form.no || !form.kpi) return;
    onAdd({ ...form, id: `kpi-${Date.now()}` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-[#1A284F] text-lg">Add New KPI</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">No <span className="text-red-400">*</span></label>
              <input value={form.no} onChange={(e) => set("no", e.target.value)} placeholder="e.g. 8"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Section</label>
              <select value={form.section} onChange={(e) => set("section", e.target.value as "A" | "B")}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                <option value="A">A — Objective KPI</option>
                <option value="B">B — Functional KPI</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Perspektif</label>
            <select value={form.perspektif} onChange={(e) => set("perspektif", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
              {PERSPEKTIF_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">KPI <span className="text-red-400">*</span></label>
            <textarea rows={3} value={form.kpi} onChange={(e) => set("kpi", e.target.value)} placeholder="KPI name / description"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Satuan</label>
              <input value={form.satuan} onChange={(e) => set("satuan", e.target.value)} placeholder="e.g. % /bulan"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Formula Pencapaian</label>
              <select value={form.formula} onChange={(e) => set("formula", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                {FORMULA_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Bobot</label>
              <input value={form.bobot} onChange={(e) => set("bobot", e.target.value)} placeholder="e.g. 10%"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Polaritas</label>
              <select value={form.polaritas} onChange={(e) => set("polaritas", e.target.value as Polaritas)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]">
                <option value="Maximize">Maximize</option>
                <option value="Minimize">Minimize</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Definisi / Deskripsi</label>
            <textarea rows={3} value={form.definisi} onChange={(e) => set("definisi", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Source</label>
            <input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. Laporan HRD"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Baseline 2025</label>
              <input value={form.baseline2025} onChange={(e) => set("baseline2025", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Target 2026</label>
              <input value={form.target2026} onChange={(e) => set("target2026", e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F]" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Detail Formula Pencapaian</label>
            <textarea rows={4} value={form.detailFormula} onChange={(e) => set("detailFormula", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Keterangan</label>
            <textarea rows={3} value={form.keterangan} onChange={(e) => set("keterangan", e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1A284F] resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!form.no || !form.kpi}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add KPI
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingKPIPage() {
  const [view, setView] = useState<PageView>("input");
  const [items, setItems] = useState<KPISetting[]>(INITIAL_KPI_SETTINGS);
  const [editingItem, setEditingItem] = useState<KPISetting | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSaveEdit = (updated: KPISetting) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAdd = (item: KPISetting) => {
    setItems((prev) => [...prev, item]);
  };

  const handleConfirm = () => {
    setShowConfirm(false);
    setShowSuccess(true);
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    setSubmitted(true);
    setView("preview");
  };

  const totalBobot = items.reduce((sum, item) => {
    const n = parseFloat(item.bobot.replace("%", "")) || 0;
    return sum + n;
  }, 0);

  const handleExport = () => {
    const headers = ["No","Section","Perspektif","KPI","Satuan","Formula","Bobot","Definisi","Source","Baseline 2025","Target 2026","Polaritas","Detail Formula","Keterangan"];
    const rows = items.map((i) => [i.no, i.section === "A" ? "A - Objective KPI" : "B - Functional KPI", i.perspektif, i.kpi, i.satuan, i.formula, i.bobot, i.definisi, i.source, i.baseline2025, i.target2026, i.polaritas, i.detailFormula, i.keterangan]);
    exportXLSX("KPI_Setting_2026.xlsx", headers, rows);
  };

  const handleImport = async (file: File) => {
    try {
      const { headers, rows } = await parseXLSX(file);
      const col = (pat: RegExp) => headers.findIndex((h) => pat.test(h.trim()));
      const noI = col(/^no$/i), sectionI = col(/section/i), perspektifI = col(/perspektif/i),
        kpiI = col(/^kpi$/i), satuanI = col(/satuan/i), formulaI = col(/^formula$/i),
        bobotI = col(/bobot/i), definisiI = col(/definisi/i), sourceI = col(/source/i),
        baseI = col(/baseline/i), targetI = col(/target/i), polarI = col(/polaritas/i),
        detailI = col(/detail/i), ketI = col(/keterangan/i);
      const g = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
      const imported: KPISetting[] = rows.filter((r) => r.some((c) => c.trim())).map((r, idx) => ({
        id: `imported-${Date.now()}-${idx}`,
        no: g(r, noI) || String(idx + 1),
        section: (g(r, sectionI).toUpperCase().includes("A") ? "A" : "B") as "A" | "B",
        perspektif: g(r, perspektifI),
        kpi: g(r, kpiI),
        satuan: g(r, satuanI),
        formula: g(r, formulaI),
        bobot: g(r, bobotI),
        definisi: g(r, definisiI),
        source: g(r, sourceI),
        baseline2025: g(r, baseI),
        target2026: g(r, targetI),
        polaritas: (g(r, polarI) as Polaritas) || "Maximize",
        detailFormula: g(r, detailI),
        keterangan: g(r, ketI),
      }));
      if (imported.length > 0) setItems(imported);
    } catch { /* ignore parse errors */ }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] font-bold text-[#1A284F] mb-1">KPI Setting</h1>
          <p className="text-gray-500 text-sm">2026 Performance Appraisal — KPI Configuration</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {view === "input" && !submitted && (
            <>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-[#1A284F] text-[#1A284F] hover:bg-[#1A284F]/5 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add KPI
              </button>
              <button
                onClick={() => setView("preview")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
              >
                <Send className="w-4 h-4" />
                Submit KPI
              </button>
            </>
          )}
          {view === "preview" && (
            <>
              {!submitted && (
                <button
                  onClick={() => setView("input")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  Back to Edit
                </button>
              )}
              {!submitted && (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b] transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Submit KPI
                </button>
              )}
            </>
          )}
          <ExportImportButton onExport={handleExport} onImport={handleImport} />
        </div>
      </div>

      {/* Status banner */}
      {view === "preview" && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border ${
          submitted
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          {submitted ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
          {submitted
            ? "KPI Setting has been submitted and is pending approval."
            : "Preview mode — review all KPI definitions carefully before submitting."}
        </div>
      )}

      {/* Summary stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1A284F]/5 rounded-xl">
          <span className="text-xs font-bold text-[#1A284F] uppercase tracking-wide">Total KPI</span>
          <span className="text-lg font-bold text-[#1A284F]">{items.length}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 rounded-xl">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Objective KPI (A)</span>
          <span className="text-lg font-bold text-blue-700">{items.filter((i) => i.section === "A").length}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 rounded-xl">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Functional KPI (B)</span>
          <span className="text-lg font-bold text-indigo-700">{items.filter((i) => i.section === "B").length}</span>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${totalBobot === 100 ? "bg-green-50" : "bg-orange-50"}`}>
          <span className={`text-xs font-bold uppercase tracking-wide ${totalBobot === 100 ? "text-green-700" : "text-orange-700"}`}>Total Bobot</span>
          <span className={`text-lg font-bold ${totalBobot === 100 ? "text-green-700" : "text-orange-700"}`}>{totalBobot}%</span>
          {totalBobot !== 100 && <span className="text-[10px] text-orange-600 font-medium">(should be 100%)</span>}
        </div>
      </div>

      {/* Table */}
      <KPISettingTable
        items={items}
        editable={view === "input" && !submitted}
        onEdit={setEditingItem}
        onDelete={handleDelete}
      />

      {/* Modals */}
      {editingItem && (
        <EditRowModal
          item={editingItem}
          onSave={handleSaveEdit}
          onClose={() => setEditingItem(null)}
        />
      )}
      {showAddModal && (
        <AddKPIModal onAdd={handleAdd} onClose={() => setShowAddModal(false)} />
      )}
      {showConfirm && <ConfirmModal onCancel={() => setShowConfirm(false)} onConfirm={handleConfirm} />}
      {showSuccess && <SuccessModal onClose={handleSuccessClose} />}
    </div>
  );
}
