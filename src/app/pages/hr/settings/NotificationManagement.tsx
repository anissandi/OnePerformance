// @refresh reset
import React, { useMemo, useRef, useState } from "react";
import {
  Bell,
  Send,
  Sparkles,
  Clock,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  Building2,
  Layers,
  Users,
  Check,
  X,
  Play,
  Settings,
  Mail,
  MessageSquare,
  Smartphone,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Heading2,
  Eraser,
  Eye,
  ArrowRight,
} from "lucide-react";
import { useRouteTab } from "../../../utils/useRouteTab";
import {
  COMPANY_UNIT_LOCATIONS,
  loadManagedUsers,
  useAuthStore,
} from "../../../store/authStore";
import { loadCalibrationOrgOptions } from "../CalibrationSetting";
import {
  APPROVAL_TRANSACTION_MODULE_OPTIONS,
  getEligibleUsersForScheduledModule,
  interpolateNotificationTemplate,
  MASTER_APPROVAL_TRIGGER_OPTIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_DELIVERY_CHANNELS,
  resolveCanonicalModuleName,
  SCHEDULED_MODULE_OPTIONS,
  SYSTEM_NOTIFICATION_VARIABLES,
  useNotificationStore,
  type AutoNotificationTemplate,
  type AutoNotificationTriggerType,
  type MasterApprovalTriggerStatus,
  type NotificationAttachment,
  type NotificationCategory,
  type NotificationDeliveryChannel,
} from "../../../store/notificationStore";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function MultiSelectChips({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ElementType;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const normalizedOptions = options
    .map((o) => (typeof o === "string" ? o : String((o as { company?: string })?.company ?? o ?? "")))
    .filter(Boolean);
  const filtered = normalizedOptions.filter((o) =>
    o.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
          <Icon className="w-3.5 h-3.5 text-[#1A284F]" />
          {label}
          {selected.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#1A284F] text-white text-[10px]">
              {selected.length} dipilih
            </span>
          )}
        </label>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => onChange([...normalizedOptions])}
            className="text-indigo-600 hover:underline font-medium"
          >
            Pilih Semua
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-rose-500 hover:underline font-medium"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-[#1A284F]"
      />

      <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1.5 pt-0.5">
        {filtered.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? "bg-[#1A284F] text-white border-[#1A284F]"
                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
            >
              {active && <Check className="w-3 h-3" />}
              <span>{opt}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <span className="text-[11px] text-gray-400 py-2">
            Tidak ada opsi yang cocok.
          </span>
        )}
      </div>
    </div>
  );
}

function normalizeTriggerType(raw?: string, category?: NotificationCategory): AutoNotificationTriggerType {
  // Kategori selain Approval tidak bisa memilih Transaction (selalu Scheduled), dan kategori Approval selalu Transaction
  if (category === "Approval") return "Transaction";
  return "Scheduled";
}

export function NotificationManagementPage() {
  const { activeUser } = useAuthStore();
  const {
    allNotifications,
    autoTemplates,
    updateAutoTemplates,
    broadcastNotification,
  } = useNotificationStore(activeUser);

  const [activeTab, setActiveTab] = useRouteTab<"broadcast" | "auto">(
    ["broadcast", "auto"],
    "broadcast",
  );
  const [toastMessage, setToastMessage] = useState("");

  // Organization options from CalibrationSetting & ManagedUsers
  const orgOptions = useMemo(() => {
    const calOrg = loadCalibrationOrgOptions();
    const users = loadManagedUsers();
    const units = Array.from(
      new Set([
        ...COMPANY_UNIT_LOCATIONS.map((loc) => loc.company),
        ...users.map((u) => u.company).filter(Boolean),
      ]),
    );
    const divisions = Array.from(
      new Set([
        ...(calOrg.divisions ?? []),
        ...users.map((u) => u.division).filter(Boolean),
      ]),
    );
    const departments = Array.from(
      new Set([
        ...(calOrg.departments ?? []),
        ...users.map((u) => u.department).filter(Boolean),
      ]),
    );
    return { units, divisions, departments, users };
  }, []);

  // ── Auto Notification Modal State ───────────────────────────────────────────
  const [autoCategoryFilter, setAutoCategoryFilter] = useState<"ALL" | NotificationCategory>("ALL");
  const [editingTemplate, setEditingTemplate] =
    useState<AutoNotificationTemplate | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [calYearMonth, setCalYearMonth] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const bodyTemplateRef = useRef<HTMLTextAreaElement>(null);

  // ── Notification Broadcast Form State ───────────────────────────────────────
  const [bcCategory, setBcCategory] = useState<NotificationCategory>("Info");
  const [bcTitle, setBcTitle] = useState("");
  const [bcBodyText, setBcBodyText] = useState("");
  const [bcBodyHtml, setBcBodyHtml] = useState("");
  const [bcCtaLabel, setBcCtaLabel] = useState("");
  const [bcCtaRoute, setBcCtaRoute] = useState("");
  const [bcTargetAll, setBcTargetAll] = useState(true);
  const [bcUnits, setBcUnits] = useState<string[]>([]);
  const [bcChannels, setBcChannels] = useState<NotificationDeliveryChannel[]>([
    "Notifikasi Sistem",
  ]);
  const [bcAttachments, setBcAttachments] = useState<NotificationAttachment[]>(
    [],
  );
  const [bcEmbeddedImages, setBcEmbeddedImages] = useState<string[]>([]);
  const [previewBroadcastOpen, setPreviewBroadcastOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const richEditorRef = useRef<HTMLDivElement>(null);

  const supportsRichMedia =
    bcChannels.includes("Notifikasi Sistem") || bcChannels.includes("Email");

  // Calculate matched employees for preview
  const matchedTargetEmployees = useMemo(() => {
    const activeUsers = orgOptions.users.filter((u) => u.status === "Active");
    if (bcTargetAll) return activeUsers;
    if (bcUnits.length === 0) return [];
    return activeUsers.filter((u) => {
      const okUnit =
        bcUnits.length === 0 ||
        bcUnits.some(
          (unit) => unit.toLowerCase() === (u.company ?? "").toLowerCase(),
        );
      return okUnit;
    });
  }, [bcTargetAll, bcUnits, orgOptions.users]);

  const syncRichEditorState = () => {
    if (!richEditorRef.current) return;
    const html = richEditorRef.current.innerHTML;
    const text = richEditorRef.current.innerText || "";
    setBcBodyHtml(html);
    setBcBodyText(text);
  };

  const execRichCommand = (command: string, value?: string) => {
    if (!richEditorRef.current) return;
    richEditorRef.current.focus();
    document.execCommand(command, false, value);
    syncRichEditorState();
  };

  const filteredAutoTemplates = useMemo(() => {
    if (autoCategoryFilter === "ALL") return autoTemplates;
    return autoTemplates.filter((t) => t.category === autoCategoryFilter);
  }, [autoTemplates, autoCategoryFilter]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3800);
  };

  const handleToggleAutoActive = (id: string) => {
    const next = autoTemplates.map((t) =>
      t.id === id ? { ...t, active: !t.active } : t,
    );
    updateAutoTemplates(next);
    showToast("Status Auto Notification berhasil diperbarui.");
  };

  const handleTriggerAutoNow = (tpl: AutoNotificationTemplate) => {
    const nowStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    const normTrigger = normalizeTriggerType(tpl.triggerType, tpl.category);
    const selectedUnits =
      tpl.scheduledCompanyUnits && tpl.scheduledCompanyUnits.length > 0
        ? tpl.scheduledCompanyUnits
        : tpl.scheduledCompanyUnit && tpl.scheduledCompanyUnit !== "All Units"
        ? [tpl.scheduledCompanyUnit]
        : orgOptions.units;
    const eligibleScheduledUsers =
      normTrigger === "Scheduled"
        ? getEligibleUsersForScheduledModule(selectedUnits, tpl.scheduledModule)
        : [];
    const modLabel = resolveCanonicalModuleName(
      normTrigger === "Transaction"
        ? tpl.approvalModule || tpl.scheduledModule
        : tpl.scheduledModule || tpl.approvalModule,
    );
    const baseCtx = {
      moduleName: modLabel,
      approvalStatus: tpl.approvalTriggerStatus || "Validated",
      approverName: activeUser.name || "System",
      year: "2026",
    };
    const interpolatedSubject = interpolateNotificationTemplate(tpl.subjectTemplate || tpl.name, baseCtx);
    const interpolatedBody = (tpl.bodyTemplate || tpl.subjectTemplate || tpl.name)
      .split("\n")
      .map((line) => interpolateNotificationTemplate(line, baseCtx))
      .filter(Boolean);

    broadcastNotification({
      title: interpolatedSubject,
      summary: interpolatedBody[0] || interpolatedSubject,
      body: interpolatedBody,
      category: tpl.category,
      senderName: `Auto Notification (${tpl.name})`,
      senderRole: activeUser.role || "System",
      moduleName: modLabel,
      approvalStatus: baseCtx.approvalStatus,
      approverName: baseCtx.approverName,
      targetAll: normTrigger !== "Scheduled" || eligibleScheduledUsers.length === 0,
      targetEmployeeIds:
        normTrigger === "Scheduled" && eligibleScheduledUsers.length > 0
          ? eligibleScheduledUsers.map((u) => u.employeeId)
          : undefined,
      channels: tpl.channels?.length ? tpl.channels : ["Notifikasi Sistem"],
    });
    updateAutoTemplates(
      autoTemplates.map((t) =>
        t.id === tpl.id ? { ...t, lastTriggeredAt: nowStr } : t,
      ),
    );
    showToast(
      normTrigger === "Scheduled" && tpl.scheduledModule
        ? `Auto Notification "${tpl.name}" berhasil dijalankan ke ${eligibleScheduledUsers.length} karyawan yang memiliki modul ${modLabel} (sesuai Groupings).`
        : `Auto Notification "${tpl.name}" berhasil dijalankan dan dikirim ke ${(tpl.channels?.length ? tpl.channels : ["Notifikasi Sistem"]).join(", ")}.`,
    );
  };

  const handleSaveTemplateModal = (saved: AutoNotificationTemplate) => {
    const exists = autoTemplates.some((t) => t.id === saved.id);
    const next = exists
      ? autoTemplates.map((t) => (t.id === saved.id ? saved : t))
      : [saved, ...autoTemplates];
    updateAutoTemplates(next);
    setEditingTemplate(null);
    setIsAddingTemplate(false);
    showToast(`Template Auto Notification "${saved.name}" berhasil disimpan.`);
  };

  const handleDeleteTemplate = (id: string) => {
    updateAutoTemplates(autoTemplates.filter((t) => t.id !== id));
    showToast("Template Auto Notification berhasil dihapus.");
  };

  const handleToggleBroadcastChannel = (ch: NotificationDeliveryChannel) => {
    setBcChannels((prev) => {
      if (prev.includes(ch)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== ch);
      }
      return [...prev, ch];
    });
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        setBcAttachments((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            sizeLabel: formatBytes(f.size),
            mimeType: f.type || "application/octet-stream",
            dataUrl: typeof reader.result === "string" ? reader.result : undefined,
          },
        ]);
      };
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const handleEmbeddedImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setBcEmbeddedImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bcTitle.trim()) {
      showToast("Judul notifikasi wajib diisi.");
      return;
    }
    const plainText = (richEditorRef.current?.innerText ?? bcBodyText).trim();
    const richHtml = (richEditorRef.current?.innerHTML ?? bcBodyHtml).trim();
    if (!plainText && bcEmbeddedImages.length === 0) {
      showToast("Isi pesan notifikasi wajib diisi.");
      return;
    }
    if (!bcTargetAll && bcUnits.length === 0) {
      showToast(
        "Pilih minimal satu Company Unit, atau aktifkan target All.",
      );
      return;
    }

    const paragraphs = plainText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    broadcastNotification({
      title: bcTitle.trim(),
      summary: paragraphs[0] || bcTitle.trim(),
      body: paragraphs.length > 0 ? paragraphs : [bcTitle.trim()],
      bodyHtml: richHtml || undefined,
      category: bcCategory,
      senderName: activeUser.name,
      senderRole: activeUser.role,
      ctaLabel: bcCtaLabel.trim() || undefined,
      ctaRoute: bcCtaRoute.trim() || undefined,
      targetAll: bcTargetAll,
      targetUnits: bcTargetAll ? undefined : bcUnits,
      channels: bcChannels,
      attachments: supportsRichMedia ? bcAttachments : undefined,
      embeddedImages: supportsRichMedia ? bcEmbeddedImages : undefined,
    });

    setBcTitle("");
    setBcBodyText("");
    setBcBodyHtml("");
    if (richEditorRef.current) {
      richEditorRef.current.innerHTML = "";
    }
    setBcCtaLabel("");
    setBcCtaRoute("");
    setBcAttachments([]);
    setBcEmbeddedImages([]);
    showToast(
      `Notification Broadcast berhasil dikirim ke ${matchedTargetEmployees.length} karyawan melalui ${bcChannels.join(", ")}.`,
    );
  };

  return (
    <div className="p-6 w-full space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1A284F] text-white flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-[#1A284F] text-xl">
              Notification Management
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Kelola <strong>Auto Notification</strong> berdasarkan jadwal/aksi sistem dan <strong>Notification Broadcast</strong> lintas Unit, Divisi, &amp; Departemen
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-400 flex items-center gap-1">
          <span>&#8962;</span>
          <span>Home</span>
          <span className="mx-1">›</span>
          <span>Settings</span>
          <span className="mx-1">›</span>
          <span className="font-medium text-gray-700">Notification Management</span>
        </div>
      </div>

      {toastMessage && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage("")}>
            <X className="w-4 h-4 text-emerald-700" />
          </button>
        </div>
      )}

      {/* Tabs: Notification Broadcast (Left) & Auto Notification (Right) */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("broadcast")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "broadcast"
              ? "border-[#1A284F] text-[#1A284F]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Send className="w-4 h-4" />
          Notification Broadcast
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("auto")}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "auto"
              ? "border-[#1A284F] text-[#1A284F]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Auto Notification
        </button>
      </div>

      {/* ── TAB: AUTO NOTIFICATION ──────────────────────────────────────────── */}
      {activeTab === "auto" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-800">
                  Daftar Rule &amp; Jadwal Auto Notification
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Notifikasi yang secara otomatis dikirim oleh sistem dari setiap aksi atau jadwal yang ditentukan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTemplate({
                    id: `auto-tpl-${Date.now()}`,
                    code: `AUTO_CUSTOM_${autoTemplates.length + 1}`,
                    name: "",
                    triggerType: "Scheduled",
                    scheduledCompanyUnit: "",
                    scheduledCompanyUnits: [],
                    scheduledModule: undefined,
                    scheduledDates: [],
                    recurringMonthly: true,
                    scheduledTime: "08:00",
                    approvalModule: "",
                    approvalTriggerStatus: "All Approval Status",
                    category: "Reminder",
                    subjectTemplate: "",
                    bodyTemplate: "",
                    channels: ["Notifikasi Sistem"],
                    active: true,
                  });
                  setIsAddingTemplate(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Tambah Auto Notification
              </button>
            </div>

            {/* Filter Kategori Auto Notification */}
            <div className="px-6 py-2.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAutoCategoryFilter("ALL")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    autoCategoryFilter === "ALL"
                      ? "bg-[#1A284F] text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Semua ({autoTemplates.length})
                </button>
                {NOTIFICATION_CATEGORIES.map((cat) => {
                  const count = autoTemplates.filter((t) => t.category === cat).length;
                  const meta = NOTIFICATION_CATEGORY_META[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAutoCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        autoCategoryFilter === cat
                          ? "bg-[#1A284F] text-white border-[#1A284F]"
                          : `${meta.badgeBg} ${meta.badgeText} ${meta.border} hover:opacity-85`
                      }`}
                    >
                      {meta.label} ({count})
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-gray-400">
                Menampilkan {filteredAutoTemplates.length} dari {autoTemplates.length} rule
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {filteredAutoTemplates.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-1.5">
                  <Sparkles className="w-7 h-7 mx-auto opacity-30" />
                  <p className="text-xs font-medium">Tidak ada rule Auto Notification pada kategori ini</p>
                </div>
              ) : (
                filteredAutoTemplates.map((tpl) => {
                const catMeta =
                  NOTIFICATION_CATEGORY_META[tpl.category] ??
                  NOTIFICATION_CATEGORY_META.Info;
                return (
                  <div
                    key={tpl.id}
                    className="px-6 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          tpl.active ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      />
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.border}`}
                      >
                        {catMeta.label}
                      </span>
                      <h3 className="text-xs font-medium text-gray-800 truncate">
                        {tpl.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const initialUnits =
                            tpl.scheduledCompanyUnits && tpl.scheduledCompanyUnits.length > 0
                              ? tpl.scheduledCompanyUnits
                              : tpl.scheduledCompanyUnit === "All Units"
                              ? [...orgOptions.units]
                              : tpl.scheduledCompanyUnit
                              ? [tpl.scheduledCompanyUnit]
                              : [];
                          setEditingTemplate({
                            ...tpl,
                            triggerType: normalizeTriggerType(tpl.triggerType, tpl.category),
                            scheduledCompanyUnit: tpl.scheduledCompanyUnit ?? "",
                            scheduledCompanyUnits: initialUnits,
                            scheduledModule: tpl.scheduledModule
                              ? resolveCanonicalModuleName(tpl.scheduledModule)
                              : undefined,
                            scheduledDates: tpl.scheduledDates ?? [],
                            recurringMonthly: tpl.recurringMonthly ?? true,
                            scheduledTime: tpl.scheduledTime ?? "08:00",
                            approvalModule: tpl.approvalModule
                              ? resolveCanonicalModuleName(tpl.approvalModule)
                              : "",
                            approvalTriggerStatus: tpl.approvalTriggerStatus ?? "All Approval Status",
                            channels: tpl.channels?.length ? tpl.channels : ["Notifikasi Sistem"],
                          });
                          setIsAddingTemplate(false);
                        }}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        title="Edit Rule"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Hapus Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAutoActive(tpl.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          tpl.active
                            ? "bg-emerald-600 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {tpl.active ? "Active" : "Non-Aktif"}
                      </button>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: NOTIFICATION BROADCAST ─────────────────────────────────────── */}
      {activeTab === "broadcast" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Broadcast Composer */}
          <form
            onSubmit={handleSendBroadcast}
            className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5"
          >
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1A284F]">
                  Buat Notification Broadcast Baru
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Kirim pengumuman, pengingat, atau instruksi kalibrasi ke seluruh karyawan atau spesifik Company Unit.
                </p>
              </div>
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Target: {matchedTargetEmployees.length} Karyawan
              </span>
            </div>

            {/* 1. Kategori Notifikasi */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                1. Pilih Kategori Notifikasi
              </label>
              <div className="flex flex-wrap gap-2">
                {NOTIFICATION_CATEGORIES.map((cat) => {
                  const meta = NOTIFICATION_CATEGORY_META[cat];
                  const active = bcCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBcCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        active
                          ? "bg-[#1A284F] text-white border-[#1A284F] shadow-sm"
                          : `${meta.badgeBg} ${meta.badgeText} ${meta.border} hover:opacity-85`
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target Penerima: All atau Spesifik Multi-Select Unit / Divisi / Departemen */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                2. Target Penerima Notifikasi
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setBcTargetAll(true)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    bcTargetAll
                      ? "border-[#1A284F] bg-indigo-50/50 ring-2 ring-[#1A284F]/15"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-[#1A284F]" />
                      All (Seluruh Karyawan)
                    </span>
                    {bcTargetAll && (
                      <CheckCircle2 className="w-4 h-4 text-[#1A284F]" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Kirim broadcast ke seluruh karyawan aktif di semua Unit Usaha.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setBcTargetAll(false)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    !bcTargetAll
                      ? "border-[#1A284F] bg-indigo-50/50 ring-2 ring-[#1A284F]/15"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-[#1A284F]" />
                      Spesifik Company Unit (Multi-Select)
                    </span>
                    {!bcTargetAll && (
                      <CheckCircle2 className="w-4 h-4 text-[#1A284F]" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Pilih satu atau lebih Unit Usaha (Company Unit).
                  </p>
                </button>
              </div>

              {!bcTargetAll && (
                <div className="space-y-3 pt-1">
                  <MultiSelectChips
                    label="Filter Unit Usaha (Company Unit)"
                    icon={Building2}
                    options={orgOptions.units}
                    selected={bcUnits}
                    onChange={setBcUnits}
                    placeholder="Cari Company Unit..."
                  />
                </div>
              )}
            </div>

            {/* 3. Channel Pengiriman */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                3. Pilih Channel
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {NOTIFICATION_DELIVERY_CHANNELS.map((ch) => {
                  const active = bcChannels.includes(ch);
                  const ChIcon =
                    ch === "Notifikasi Sistem"
                      ? Bell
                      : ch === "Email"
                      ? Mail
                      : ch === "Telegram"
                      ? Send
                      : Smartphone;
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => handleToggleBroadcastChannel(ch)}
                      className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                        active
                          ? "border-[#1A284F] bg-[#1A284F] text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <ChIcon className="w-3.5 h-3.5 shrink-0" />
                        {ch}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Konten Notifikasi */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                4. Isi Pesan Notifikasi
              </label>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Judul Notifikasi *
                </label>
                <input
                  type="text"
                  value={bcTitle}
                  onChange={(e) => setBcTitle(e.target.value)}
                  placeholder="Contoh: Pengingat Finalisasi KPI & SMART Goals Semester I 2026"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1A284F]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Isi Detail Notifikasi * (Rich Text Editor)
                </label>
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:border-[#1A284F]">
                  {/* Rich Text Toolbar */}
                  <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => execRichCommand("bold")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Bold"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("italic")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Italic"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("underline")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Underline"
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => execRichCommand("formatBlock", "H3")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Heading"
                    >
                      <Heading2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("insertUnorderedList")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Bullet List"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("insertOrderedList")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Numbered List"
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => execRichCommand("justifyLeft")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Align Left"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("justifyCenter")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Align Center"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => execRichCommand("justifyRight")}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Align Right"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-4 bg-gray-200 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => {
                        const url = window.prompt("Masukkan URL tautan (contoh: https://...):", "https://");
                        if (url && url !== "https://") {
                          execRichCommand("createLink", url);
                        }
                      }}
                      className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-200/70 hover:text-gray-900"
                      title="Sisipkan Link"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    {supportsRichMedia && (
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                        title="Sisipkan Gambar (Bisa lebih dari 1)"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => execRichCommand("removeFormat")}
                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200/70 hover:text-rose-600 ml-auto"
                      title="Bersihkan Format"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* ContentEditable Rich Text Surface */}
                  <div className="relative">
                    {!bcBodyText.trim() && (
                      <div className="pointer-events-none absolute top-3 left-3.5 text-xs text-gray-400">
                        Tulis isi lengkap pengumuman atau instruksi di sini (mendukung format tebal, miring, daftar poin, heading, tautan, dll.)...
                      </div>
                    )}
                    <div
                      ref={richEditorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={syncRichEditorState}
                      onBlur={syncRichEditorState}
                      className="min-h-[160px] max-h-[340px] overflow-y-auto px-3.5 py-3 text-xs text-gray-800 leading-relaxed focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h3]:text-sm [&_h3]:font-bold [&_a]:text-indigo-600 [&_a]:underline"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Label Tombol Aksi / CTA (Opsional)
                  </label>
                  <input
                    type="text"
                    value={bcCtaLabel}
                    onChange={(e) => setBcCtaLabel(e.target.value)}
                    placeholder="Contoh: Buka KPI Tracking"
                    className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Tujuan Route CTA (Opsional)
                  </label>
                  <input
                    type="text"
                    value={bcCtaRoute}
                    onChange={(e) => setBcCtaRoute(e.target.value)}
                    placeholder="Contoh: /measurement/kpi-tracking"
                    className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700"
                  />
                </div>
              </div>
            </div>

            {/* 5. Lampiran File & Gambar pada Badan Notifikasi */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-bold text-gray-800">
                    5. Lampiran Dokumen &amp; Gambar pada Badan Notifikasi (Bisa lebih dari 1)
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Anda dapat menambahkan lebih dari 1 dokumen dan lebih dari 1 gambar sekaligus maupun bertahap.
                  </p>
                </div>
                {supportsRichMedia && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleAttachmentUpload}
                      className="hidden"
                    />
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleEmbeddedImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-[#1A284F]" />
                      Tambah Lampiran File ({bcAttachments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                      Sisipkan Gambar ({bcEmbeddedImages.length})
                    </button>
                  </div>
                )}
              </div>

              {!supportsRichMedia && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Aktifkan channel <strong>Notifikasi Sistem</strong> atau <strong>Email</strong> untuk menyertakan lampiran file dan sisipan gambar pada badan notifikasi.
                </div>
              )}

              {supportsRichMedia && bcAttachments.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-gray-600">
                    Lampiran File ({bcAttachments.length}):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bcAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white border border-gray-200 text-xs text-gray-700"
                      >
                        <Paperclip className="w-3 h-3 text-gray-400" />
                        <span>{att.name}</span>
                        <span className="text-[10px] text-gray-400">
                          ({att.sizeLabel})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setBcAttachments((prev) =>
                              prev.filter((a) => a.id !== att.id),
                            )
                          }
                          className="text-rose-500 hover:text-rose-700"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {supportsRichMedia && bcEmbeddedImages.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-gray-600">
                    Gambar pada Badan Notifikasi ({bcEmbeddedImages.length}):
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {bcEmbeddedImages.map((img, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={img}
                          alt={`Embedded ${i + 1}`}
                          className="h-20 w-28 object-cover rounded-lg border border-gray-200 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setBcEmbeddedImages((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  syncRichEditorState();
                  setPreviewBroadcastOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors"
              >
                <Eye className="w-4 h-4 text-[#1A284F]" />
                Preview
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-bold transition-colors"
              >
                <Send className="w-4 h-4" />
                Kirim Broadcast Sekarang
              </button>
            </div>
          </form>

          {/* Right Column: Recent Broadcasts History */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-800">
                Riwayat Notifikasi Terkirim ({allNotifications.length})
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Daftar notifikasi terbaru yang aktif di sistem (otomatis ter-clear setelah 30 hari).
              </p>
            </div>

            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
              {allNotifications.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Bell className="w-8 h-8 mx-auto opacity-30" />
                  <p className="text-xs font-medium">Belum ada riwayat notifikasi terkirim</p>
                </div>
              ) : (
                allNotifications.slice(0, 12).map((n) => {
                const catMeta =
                  NOTIFICATION_CATEGORY_META[n.category] ??
                  NOTIFICATION_CATEGORY_META.Info;
                return (
                  <div
                    key={n.id}
                    className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/50 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.border}`}
                      >
                        {catMeta.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(n.createdAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="font-bold text-gray-800">{n.title}</div>
                    <p className="text-[11px] text-gray-500 line-clamp-2">
                      {n.summary || n.body[0]}
                    </p>
                    <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
                      <span className="px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 font-medium">
                        Target:{" "}
                        {n.targetAll
                          ? "All Employees"
                          : [
                              ...(n.targetUnits ?? []),
                              ...(n.targetDivisions ?? []),
                              ...(n.targetDepartments ?? []),
                            ].join(", ")}
                      </span>
                      {n.channels?.map((ch) => (
                        <span
                          key={ch}
                          className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Add / Edit Auto Notification Template */}
      {editingTemplate && (() => {
        const effectiveTrigger = normalizeTriggerType(editingTemplate.triggerType, editingTemplate.category);
        const isScheduled = effectiveTrigger === "Scheduled";
        const isApprovalCategory = editingTemplate.category === "Approval";
        const selectedCompanyUnits =
          editingTemplate.scheduledCompanyUnits ??
          (editingTemplate.scheduledCompanyUnit === "All Units"
            ? [...orgOptions.units]
            : editingTemplate.scheduledCompanyUnit
            ? [editingTemplate.scheduledCompanyUnit]
            : []);
        const selectedDates = editingTemplate.scheduledDates ?? [];
        const isRecurring = editingTemplate.recurringMonthly ?? true;
        const eligibleUsersForSchedule =
          isScheduled && selectedCompanyUnits.length > 0 && editingTemplate.scheduledModule
            ? getEligibleUsersForScheduledModule(
                selectedCompanyUnits,
                editingTemplate.scheduledModule,
              )
            : [];

        const daysInCurrentMonth = new Date(
          calYearMonth.year,
          calYearMonth.month + 1,
          0,
        ).getDate();
        const firstDayWeekday = new Date(
          calYearMonth.year,
          calYearMonth.month,
          1,
        ).getDay();
        const monthNameLabel = new Date(
          calYearMonth.year,
          calYearMonth.month,
          1,
        ).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

        const toggleCalendarDay = (dayNum: number) => {
          const key = isRecurring
            ? String(dayNum)
            : `${calYearMonth.year}-${String(calYearMonth.month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const nextDates = selectedDates.includes(key)
            ? selectedDates.filter((d) => d !== key)
            : [...selectedDates, key];
          setEditingTemplate({
            ...editingTemplate,
            scheduledDates: nextDates,
          });
        };

        const handleInsertVariable = (token: string) => {
          const textarea = bodyTemplateRef.current;
          const currentText = editingTemplate.bodyTemplate ?? "";
          if (!textarea) {
            setEditingTemplate({
              ...editingTemplate,
              bodyTemplate: `${currentText}${currentText && !currentText.endsWith(" ") ? " " : ""}${token}`,
            });
            return;
          }
          const start = textarea.selectionStart ?? currentText.length;
          const end = textarea.selectionEnd ?? currentText.length;
          const nextText =
            currentText.slice(0, start) + token + currentText.slice(end);
          setEditingTemplate({
            ...editingTemplate,
            bodyTemplate: nextText,
          });
          requestAnimationFrame(() => {
            textarea.focus();
            const cursorPos = start + token.length;
            textarea.setSelectionRange(cursorPos, cursorPos);
          });
        };

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {isAddingTemplate
                  ? "Tambah Rule Auto Notification"
                  : "Edit Rule Auto Notification"}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Nama Rule Auto Notification *
                </label>
                <input
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      name: e.target.value,
                    })
                  }
                  placeholder="Contoh: Pengingat Pengisian KPI Bulanan"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={editingTemplate.category}
                    onChange={(e) => {
                      const nextCat = e.target.value as NotificationCategory;
                      setEditingTemplate({
                        ...editingTemplate,
                        category: nextCat,
                        triggerType:
                          nextCat === "Approval"
                            ? "Transaction"
                            : "Scheduled",
                        approvalModule:
                          editingTemplate.approvalModule || "KPI Setting",
                        approvalTriggerStatus:
                          editingTemplate.approvalTriggerStatus ?? "All Approval Status",
                      });
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800 bg-white"
                  >
                    {NOTIFICATION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Trigger
                  </label>
                  <select
                    value={effectiveTrigger}
                    disabled={isApprovalCategory}
                    onChange={(e) =>
                      setEditingTemplate({
                        ...editingTemplate,
                        triggerType:
                          editingTemplate.category === "Approval"
                            ? "Transaction"
                            : (e.target.value as AutoNotificationTriggerType),
                      })
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="Scheduled" disabled={isApprovalCategory}>
                      Scheduled
                    </option>
                    <option value="Transaction" disabled={!isApprovalCategory}>
                      Transaction
                    </option>
                  </select>
                </div>
              </div>

              {/* Konfigurasi Trigger = Transaction (khususnya Kategori Approval) */}
              {(isApprovalCategory || effectiveTrigger === "Transaction") && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        1. Pilih Modul *
                      </label>
                      <select
                        value={editingTemplate.approvalModule ?? ""}
                        onChange={(e) =>
                          setEditingTemplate({
                            ...editingTemplate,
                            approvalModule: e.target.value,
                          })
                        }
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800 bg-white"
                      >
                        <option value="">-- Pilih Modul --</option>
                        {APPROVAL_TRANSACTION_MODULE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {Boolean(editingTemplate.approvalModule) && (
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          2. Master Approval Trigger *
                        </label>
                        <select
                          value={editingTemplate.approvalTriggerStatus ?? "All Approval Status"}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              approvalTriggerStatus: e.target.value as MasterApprovalTriggerStatus,
                            })
                          }
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800 bg-white"
                        >
                          {MASTER_APPROVAL_TRIGGER_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-indigo-800 bg-white/80 border border-indigo-100 rounded-xl px-3 py-2">
                    Sistem otomatis mengeksekusi notifikasi ini setiap terjadi transaksi approval{" "}
                    <strong>{editingTemplate.approvalTriggerStatus ?? "All Approval Status"}</strong>{" "}
                    pada modul <strong>{editingTemplate.approvalModule || "(Pilih Modul)"}</strong>{" "}
                    (otomatis terhubung ke variable <code className="font-mono font-bold">{"{{nama_modul}}"}</code>) dan menampilkannya ke notifikasi karyawan terkait.
                  </div>
                </div>
              )}

              {/* Konfigurasi Trigger = Scheduled (Company Unit -> Modul -> Kalender Multi-Tanggal, Berulang, Jam) */}
              {isScheduled && (
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-4">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                          <Building2 className="w-3.5 h-3.5 text-[#1A284F]" />
                          <span>1. Pilih Company Unit *</span>
                          {selectedCompanyUnits.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#1A284F] text-white text-[10px]">
                              {selectedCompanyUnits.length} dipilih
                            </span>
                          )}
                        </label>
                        <div className="flex items-center gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTemplate({
                                ...editingTemplate,
                                scheduledCompanyUnits: [...orgOptions.units],
                                scheduledCompanyUnit: "All Units",
                              })
                            }
                            className="text-indigo-600 hover:underline font-medium"
                          >
                            Pilih Semua Unit
                          </button>
                          {selectedCompanyUnits.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingTemplate({
                                  ...editingTemplate,
                                  scheduledCompanyUnits: [],
                                  scheduledCompanyUnit: "",
                                })
                              }
                              className="text-rose-500 hover:underline font-medium"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {orgOptions.units.map((unit) => {
                          const active = selectedCompanyUnits.includes(unit);
                          return (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => {
                                const nextUnits = active
                                  ? selectedCompanyUnits.filter((u) => u !== unit)
                                  : [...selectedCompanyUnits, unit];
                                setEditingTemplate({
                                  ...editingTemplate,
                                  scheduledCompanyUnits: nextUnits,
                                  scheduledCompanyUnit:
                                    nextUnits.length === orgOptions.units.length
                                      ? "All Units"
                                      : nextUnits[0] ?? "",
                                });
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                active
                                  ? "bg-[#1A284F] text-white border-[#1A284F]"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              {active && <Check className="w-3 h-3" />}
                              <span>{unit}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedCompanyUnits.length > 0 && (
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">
                          2. Pilih Modul *
                        </label>
                        <select
                          value={editingTemplate.scheduledModule ?? ""}
                          onChange={(e) =>
                            setEditingTemplate({
                              ...editingTemplate,
                              scheduledModule: e.target.value || undefined,
                            })
                          }
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800 bg-white"
                        >
                          <option value="">-- Pilih Modul --</option>
                          {SCHEDULED_MODULE_OPTIONS.map((modName) => (
                            <option key={modName} value={modName}>
                              {modName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {Boolean(selectedCompanyUnits.length > 0 && editingTemplate.scheduledModule) && (
                    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div>
                          <div className="font-bold text-gray-800 flex items-center gap-1.5">
                            <CalendarIcon className="w-4 h-4 text-[#1A284F]" />
                            <span>3. Pilih Tanggal (Multi-Tanggal) &amp; Jam Pengiriman</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            Target penerima otomatis: <strong>{eligibleUsersForSchedule.length} karyawan</strong> pada{" "}
                            <strong>{selectedCompanyUnits.length} Company Unit</strong> yang memiliki modul{" "}
                            <strong>{editingTemplate.scheduledModule}</strong> sesuai <strong>Groupings</strong>.
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold text-gray-700">
                            <input
                              type="checkbox"
                              checked={isRecurring}
                              onChange={(e) => {
                                const nextRec = e.target.checked;
                                setEditingTemplate({
                                  ...editingTemplate,
                                  recurringMonthly: nextRec,
                                  scheduledDates: [],
                                });
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-[#1A284F] focus:ring-[#1A284F]"
                            />
                            <span>Berulang (Setiap Bulan)</span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            <span className="font-semibold text-gray-700">Jam:</span>
                            <input
                              type="time"
                              value={editingTemplate.scheduledTime ?? "08:00"}
                              onChange={(e) =>
                                setEditingTemplate({
                                  ...editingTemplate,
                                  scheduledTime: e.target.value,
                                })
                              }
                              className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-800"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Kalender Pilih Tanggal */}
                      {!isRecurring && (
                        <div className="flex items-center justify-between px-1">
                          <button
                            type="button"
                            onClick={() =>
                              setCalYearMonth((prev) =>
                                prev.month === 0
                                  ? { year: prev.year - 1, month: 11 }
                                  : { year: prev.year, month: prev.month - 1 },
                              )
                            }
                            className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="font-bold text-gray-800 capitalize">
                            {monthNameLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCalYearMonth((prev) =>
                                prev.month === 11
                                  ? { year: prev.year + 1, month: 0 }
                                  : { year: prev.year, month: prev.month + 1 },
                              )
                            }
                            className="p-1 rounded-lg border border-gray-200 hover:bg-gray-50"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {isRecurring ? (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">
                            Klik satu atau beberapa tanggal di bawah (akan diulang setiap bulan pada pukul{" "}
                            <strong>{editingTemplate.scheduledTime || "08:00"}</strong>):
                          </p>
                          <div className="grid grid-cols-7 gap-1.5">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                              const key = String(dayNum);
                              const active = selectedDates.includes(key);
                              return (
                                <button
                                  key={dayNum}
                                  type="button"
                                  onClick={() => toggleCalendarDay(dayNum)}
                                  className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                    active
                                      ? "bg-[#1A284F] text-white border-[#1A284F] shadow-sm"
                                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                  }`}
                                >
                                  Tgl {dayNum}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 mb-1">
                            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
                              <div key={d}>{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1.5">
                            {Array.from({ length: firstDayWeekday }).map((_, idx) => (
                              <div key={`empty-${idx}`} />
                            ))}
                            {Array.from({ length: daysInCurrentMonth }, (_, i) => i + 1).map(
                              (dayNum) => {
                                const isoKey = `${calYearMonth.year}-${String(
                                  calYearMonth.month + 1,
                                ).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                                const active = selectedDates.includes(isoKey);
                                return (
                                  <button
                                    key={isoKey}
                                    type="button"
                                    onClick={() => toggleCalendarDay(dayNum)}
                                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                      active
                                        ? "bg-[#1A284F] text-white border-[#1A284F] shadow-sm"
                                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                    }`}
                                  >
                                    {dayNum}
                                  </button>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}

                      {selectedDates.length > 0 && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px]">
                          <div className="text-gray-600">
                            Tanggal terpilih ({selectedDates.length}):{" "}
                            <strong className="text-[#1A284F]">
                              {isRecurring
                                ? selectedDates
                                    .slice()
                                    .sort((a, b) => Number(a) - Number(b))
                                    .map((d) => `Tgl ${d}`)
                                    .join(", ") + " (Berulang tiap bulan)"
                                : selectedDates.slice().sort().join(", ") + " (Sekali jalan)"}
                            </strong>{" "}
                            pukul <strong>{editingTemplate.scheduledTime || "08:00"}</strong>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTemplate({
                                ...editingTemplate,
                                scheduledDates: [],
                              })
                            }
                            className="text-rose-500 hover:underline font-medium"
                          >
                            Reset Tanggal
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Template Judul / Subjek Notifikasi *
                </label>
                <input
                  type="text"
                  value={editingTemplate.subjectTemplate}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      subjectTemplate: e.target.value,
                    })
                  }
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Template Isi Pesan *
                </label>
                <textarea
                  ref={bodyTemplateRef}
                  rows={6}
                  value={editingTemplate.bodyTemplate}
                  onChange={(e) =>
                    setEditingTemplate({
                      ...editingTemplate,
                      bodyTemplate: e.target.value,
                    })
                  }
                  placeholder="Tulis isi pesan notifikasi... Klik variable di bawah untuk menyisipkan data dinamis."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-gray-800 min-h-[150px] leading-relaxed"
                />

                {/* Variable Picker di bawah Template Isi Pesan */}
                <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-600">
                      Variable Sistem (Klik untuk memasukkan ke Template Isi Pesan):
                    </span>
                    <span className="text-[10px] text-gray-400">
                      Otomatis diganti saat pesan dieksekusi
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SYSTEM_NOTIFICATION_VARIABLES.map((v) => (
                      <button
                        key={v.token}
                        type="button"
                        onClick={() => handleInsertVariable(v.token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:border-[#1A284F] hover:bg-indigo-50/40 text-[11px] font-mono text-[#1A284F] transition-colors"
                        title={`Sisipkan ${v.label} (${v.token})`}
                      >
                        <span>{v.token}</span>
                        <span className="font-sans text-[10px] text-gray-400">
                          ({v.label})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">
                  Channel Pengiriman
                </label>
                <div className="flex flex-wrap gap-2">
                  {NOTIFICATION_DELIVERY_CHANNELS.map((ch) => {
                    const checked = editingTemplate.channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => {
                          const has = editingTemplate.channels.includes(ch);
                          const nextCh = has
                            ? editingTemplate.channels.length > 1
                              ? editingTemplate.channels.filter((c) => c !== ch)
                              : editingTemplate.channels
                            : [...editingTemplate.channels, ch];
                          setEditingTemplate({
                            ...editingTemplate,
                            channels: nextCh,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-lg border font-semibold ${
                          checked
                            ? "bg-[#1A284F] text-white border-[#1A284F]"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-semibold text-gray-600"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !editingTemplate.name.trim() ||
                      !editingTemplate.subjectTemplate.trim()
                    )
                      return;
                    handleSaveTemplateModal({
                      ...editingTemplate,
                      triggerType: effectiveTrigger,
                      channels: editingTemplate.channels?.length
                        ? editingTemplate.channels
                        : ["Notifikasi Sistem"],
                    });
                  }}
                  className="px-4 py-2 rounded-xl bg-[#1A284F] text-white font-semibold"
                >
                  Simpan Rule
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal Preview Notification Broadcast */}
      {previewBroadcastOpen && (() => {
        const catMeta =
          NOTIFICATION_CATEGORY_META[bcCategory] ??
          NOTIFICATION_CATEGORY_META.Info;
        const previewHtml = (richEditorRef.current?.innerHTML ?? bcBodyHtml).trim();
        const previewText = (richEditorRef.current?.innerText ?? bcBodyText).trim();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  <h3 className="text-sm font-bold">Preview Notification Broadcast</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewBroadcastOpen(false)}
                  className="text-white/70 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-500">Target:</span>
                    <strong className="text-gray-800">
                      {bcTargetAll
                        ? `All (${matchedTargetEmployees.length} Karyawan)`
                        : `${bcUnits.join(", ") || "Belum dipilih"} (${matchedTargetEmployees.length} Karyawan)`}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Channel:</span>
                    <strong className="text-[#1A284F]">{bcChannels.join(", ")}</strong>
                  </div>
                </div>

                {/* Simulasi Card Notifikasi di Dashboard */}
                <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 ring-2 ring-rose-100 shrink-0" />
                    <span className="text-xs font-medium text-gray-800 truncate">
                      {bcTitle.trim() || "(Judul Notifikasi Belum Diisi)"}
                    </span>
                  </div>

                  <div className="px-6 py-4 bg-gray-50/40 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.border}`}
                      >
                        {catMeta.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        Baru saja
                      </span>
                      <span className="text-[11px] text-gray-400">
                        · Oleh <strong className="text-gray-600">{activeUser.name}</strong>
                      </span>
                    </div>

                    {previewHtml ? (
                      <div
                        className="text-xs text-gray-700 leading-relaxed space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-xs [&_h3]:font-bold [&_a]:text-indigo-600 [&_a]:underline [&_img]:rounded-xl [&_img]:max-h-60 [&_img]:my-2"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    ) : previewText ? (
                      <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                        {previewText}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        (Isi detail notifikasi belum ditulis)
                      </p>
                    )}

                    {supportsRichMedia && bcEmbeddedImages.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {bcEmbeddedImages.map((imgUrl, idx) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt={`Preview gambar ${idx + 1}`}
                            className="rounded-xl border border-gray-200 max-h-60 object-contain bg-white p-1"
                          />
                        ))}
                      </div>
                    )}

                    {supportsRichMedia && bcAttachments.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5" /> Lampiran Dokumen ({bcAttachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {bcAttachments.map((att) => (
                            <div
                              key={att.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-[#1A284F] font-medium"
                            >
                              <Paperclip className="w-3 h-3 text-gray-400" />
                              <span>{att.name}</span>
                              <span className="text-[10px] text-gray-400">({att.sizeLabel})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {bcCtaRoute.trim() && (
                      <div className="pt-2 flex justify-end">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1A284F] text-white text-xs font-semibold">
                          <span>{bcCtaLabel.trim() || "Buka Halaman Terkait"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setPreviewBroadcastOpen(false)}
                    className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Tutup Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
