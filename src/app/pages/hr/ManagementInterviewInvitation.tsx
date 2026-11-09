import React, { useState } from "react";
import { Search, Eye, Calendar, X, Users, CheckCircle2, Clock, AlertCircle, Send } from "lucide-react";

interface Candidate {
  id: number;
  name: string;
  position: string;
  division: string;
  companyUnit: string;
  interviewer: string;
  schedule: string;
  status: "Completed" | "Scheduled" | "Pending";
}

const CANDIDATES: Candidate[] = [
  { id: 1, name: "Drs. Hendra Wijaya",    position: "Ka. Divisi Operasional",   division: "Operasional",  companyUnit: "PT RSUP (Industry)",    interviewer: "Ir. Bambang Sutrisno (Direktur Operasional)", schedule: "15 Jan 2027, 09:00", status: "Completed" },
  { id: 2, name: "Ir. Susi Marlina",      position: "Ka. Divisi Keuangan",      division: "Keuangan",     companyUnit: "PT RSUP (Industry)",    interviewer: "Ir. Bambang Sutrisno (Direktur Operasional)", schedule: "15 Jan 2027, 11:00", status: "Completed" },
  { id: 3, name: "Dra. Mega Rahayu",      position: "Wa. Ka. Divisi SDM",       division: "SDM",          companyUnit: "PT RSUP (Industry)",    interviewer: "Hj. Aminah Sari (Direktur SDM)",              schedule: "16 Jan 2027, 09:00", status: "Scheduled" },
  { id: 4, name: "Ir. Tono Sugiarto",     position: "Ka. Divisi Teknik",        division: "Teknik",       companyUnit: "PT RSUP (Industry)",    interviewer: "Ir. Bambang Sutrisno (Direktur Operasional)", schedule: "16 Jan 2027, 13:00", status: "Scheduled" },
  { id: 5, name: "Dr. Rina Kusumawati",   position: "Ka. Divisi Quality",       division: "Quality",      companyUnit: "PT RSUP (Perkebunan)",  interviewer: "Ir. Agus Salim (Direktur Perkebunan)",        schedule: "17 Jan 2027, 09:00", status: "Scheduled" },
  { id: 6, name: "Ir. Dedi Setiawan",     position: "Wa. Ka. Divisi Produksi",  division: "Produksi",     companyUnit: "PT RSUP (Perkebunan)",  interviewer: "Ir. Agus Salim (Direktur Perkebunan)",        schedule: "17 Jan 2027, 14:00", status: "Scheduled" },
  { id: 7, name: "Dra. Lestari Putri",    position: "Ka. Divisi Pemasaran",     division: "Pemasaran",    companyUnit: "PT GHS",                interviewer: "Ir. Budi Purnomo (Direktur GHS)",             schedule: "20 Jan 2027, 10:00", status: "Scheduled" },
  { id: 8, name: "Ir. Wahyu Utomo",       position: "Wa. Ka. Divisi Logistik",  division: "Logistik",     companyUnit: "PT GHS",                interviewer: "—",                                           schedule: "—",                  status: "Pending" },
];

const DIRECTORS = [
  "Ir. Bambang Sutrisno (Direktur Operasional)",
  "Hj. Aminah Sari (Direktur SDM)",
  "Ir. Agus Salim (Direktur Perkebunan)",
  "Ir. Budi Purnomo (Direktur GHS)",
];

const COMPANY_UNITS = ["PT RSUP (Industry)", "PT RSUP (Perkebunan)", "PT GHS"];
const STATUS_OPTIONS = ["All", "Completed", "Scheduled", "Pending"];

interface FormState {
  candidate: string;
  interviewer: string;
  date: string;
  time: string;
  location: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  candidate: "",
  interviewer: "",
  date: "",
  time: "",
  location: "",
  notes: "",
};

function StatusBadge({ status }: { status: Candidate["status"] }) {
  if (status === "Completed") {
    return (
      <span className="bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-0.5 text-xs font-semibold">
        Completed
      </span>
    );
  }
  if (status === "Scheduled") {
    return (
      <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-semibold">
        Scheduled
      </span>
    );
  }
  return (
    <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-3 py-0.5 text-xs font-semibold">
      Pending
    </span>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-[#1A284F]">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export function ManagementInterviewInvitation() {
  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const filtered = CANDIDATES.filter((c) => {
    const matchSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.position.toLowerCase().includes(search.toLowerCase());
    const matchUnit = unitFilter === "All" || c.companyUnit === unitFilter;
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchUnit && matchStatus;
  });

  const total = CANDIDATES.length;
  const scheduled = CANDIDATES.filter((c) => c.status === "Scheduled").length;
  const completed = CANDIDATES.filter((c) => c.status === "Completed").length;
  const pending = CANDIDATES.filter((c) => c.status === "Pending").length;

  const setField = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSendInvitation = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A284F]">Management Interview — Invitations</h1>
          <p className="text-gray-500 mt-1 text-sm">Performance Year 2026 · Scheduled: January 2027</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
        >
          <Calendar className="w-4 h-4" /> Create Invitation
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Candidates"
          value={total}
          icon={<Users className="w-5 h-5 text-[#1A284F]" />}
          color="bg-[#1A284F]/10"
        />
        <StatCard
          label="Scheduled"
          value={scheduled}
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          color="bg-blue-50"
        />
        <StatCard
          label="Completed"
          value={completed}
          icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
          color="bg-green-50"
        />
        <StatCard
          label="Pending"
          value={pending}
          icon={<AlertCircle className="w-5 h-5 text-yellow-600" />}
          color="bg-yellow-50"
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by candidate name or position..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
            />
          </div>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] bg-white"
          >
            <option value="All">All Company Units</option>
            {COMPANY_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] bg-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "All" ? "All Statuses" : s}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-4 px-4">Candidate</th>
                <th className="py-4 px-4">Position &amp; Division</th>
                <th className="py-4 px-4">Company Unit</th>
                <th className="py-4 px-4">Interviewer (Director)</th>
                <th className="py-4 px-4">Schedule</th>
                <th className="py-4 px-4">Status</th>
                <th className="py-4 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400 text-sm">
                    No candidates found.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-700">{c.position}</p>
                      <p className="text-xs text-gray-400">{c.division}</p>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-600">{c.companyUnit}</td>
                    <td className="py-4 px-4 text-sm text-gray-600 max-w-[200px]">{c.interviewer}</td>
                    <td className="py-4 px-4 text-sm text-gray-600">{c.schedule}</td>
                    <td className="py-4 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          className="p-1.5 text-gray-500 hover:text-[#1A284F] hover:bg-gray-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {c.status === "Pending" && (
                          <button
                            onClick={() => setModalOpen(true)}
                            className="bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-xs flex items-center gap-1.5"
                          >
                            <Calendar className="w-3.5 h-3.5" /> Schedule
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#1A284F]" />
                <h2 className="text-lg font-bold text-gray-900">Create Management Interview Invitation</h2>
              </div>
              <button
                onClick={() => { setModalOpen(false); setForm(EMPTY_FORM); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Candidate</label>
                <input
                  type="text"
                  value={form.candidate}
                  onChange={(e) => setField("candidate", e.target.value)}
                  placeholder="Search candidate..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Interviewer / Director</label>
                <select
                  value={form.interviewer}
                  onChange={(e) => setField("interviewer", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F] bg-white"
                >
                  <option value="">Select director...</option>
                  {DIRECTORS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Interview Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setField("date", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Interview Time</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setField("time", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  placeholder="e.g. Ruang Direksi Lt. 3"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes for Candidate</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Additional instructions or notes for the candidate..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#1A284F]/20 focus:border-[#1A284F]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => { setModalOpen(false); setForm(EMPTY_FORM); }}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-gray-700 hover:bg-gray-100 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvitation}
                className="flex-1 bg-[#1A284F] hover:bg-[#243869] text-white font-semibold rounded-xl px-4 py-2.5 text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" /> Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
