// @refresh reset
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Clock,
  Trash2,
  CheckCheck,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  AlertCircle,
  X,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_META,
  resolveNotificationRouteForUser,
  useNotificationStore,
  type NotificationCategory,
} from "../store/notificationStore";

const PAGE_SIZE = 10;

function formatFullDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DashboardNotificationSection() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeUser } = useAuthStore();
  const {
    userNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearOne,
    clearAllRead,
  } = useNotificationStore(activeUser);

  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | NotificationCategory>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: "info" | "error";
    message: string;
  } | null>(null);

  // Auto-scroll when navigated via "See all Notification"
  useEffect(() => {
    if (
      location.hash === "#notification-section" ||
      location.search.includes("section=notifications")
    ) {
      setIsSectionCollapsed(false);
      setTimeout(() => {
        const el = document.getElementById("notification-section");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [location.hash, location.search]);

  const filteredList =
    selectedCategory === "ALL"
      ? userNotifications
      : userNotifications.filter((n) => n.category === selectedCategory);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filteredList.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const readCount = userNotifications.filter((n) => n.isRead).length;

  const handleToggleItem = (id: string, isRead: boolean) => {
    const isCurrentlyOpen = expandedIds.includes(id);
    if (!isCurrentlyOpen && !isRead) {
      markAsRead(id);
    }
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleClearSingle = (id: string) => {
    const res = clearOne(id);
    if (!res.ok) {
      setFeedbackBanner({
        type: "error",
        message:
          res.error ||
          "Notifikasi yang belum dibaca tidak dapat di-clear sebelum 30 hari.",
      });
    } else {
      setFeedbackBanner({
        type: "info",
        message: "Notifikasi berhasil dihapus (di-clear).",
      });
    }
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleConfirmClearAll = () => {
    const res = clearAllRead();
    setConfirmClearAllOpen(false);
    if (res.clearedCount === 0 && res.skippedUnreadCount > 0) {
      setFeedbackBanner({
        type: "error",
        message: `Tidak ada notifikasi terbaca yang dapat dihapus. ${res.skippedUnreadCount} notifikasi belum dibaca tidak dapat di-clear (otomatis ter-clear setelah 30 hari).`,
      });
    } else {
      setFeedbackBanner({
        type: "info",
        message: `${res.clearedCount} notifikasi yang sudah dibaca berhasil di-clear.${
          res.skippedUnreadCount > 0
            ? ` (${res.skippedUnreadCount} notifikasi belum dibaca tetap disimpan hingga dibaca atau berusia 30 hari).`
            : ""
        }`,
      });
    }
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  return (
    <div
      id="notification-section"
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-6"
    >
      {/* Header (Clean white, single row with small action buttons) */}
      <div
        className={`px-6 py-4 flex items-center justify-between gap-3 bg-white ${
          isSectionCollapsed ? "" : "border-b border-gray-100"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold text-base text-gray-900">Notification</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-[10px] font-semibold">
              {unreadCount} Belum Dibaca
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[11px] font-medium transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Tandai Semua Dibaca
            </button>
          )}
          <button
            type="button"
            disabled={userNotifications.length === 0}
            onClick={() => setConfirmClearAllOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 disabled:opacity-40 text-gray-600 text-[11px] font-medium transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Clear All ({readCount})
          </button>
          <button
            type="button"
            onClick={() => setIsSectionCollapsed((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 text-[11px] font-medium transition-colors"
            title={isSectionCollapsed ? "Expand Notification" : "Collapse Notification"}
          >
            {isSectionCollapsed ? (
              <>
                <span>Expand</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {!isSectionCollapsed && (
        <>
      {/* Category Filter Pills */}
      <div className="px-6 py-2.5 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("ALL");
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              selectedCategory === "ALL"
                ? "bg-[#1A284F] text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            Semua ({userNotifications.length})
          </button>
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const count = userNotifications.filter((n) => n.category === cat).length;
            if (count === 0 && selectedCategory !== cat) return null;
            const meta = NOTIFICATION_CATEGORY_META[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  selectedCategory === cat
                    ? "bg-[#1A284F] text-white border-[#1A284F]"
                    : `${meta.badgeBg} ${meta.badgeText} ${meta.border}`
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>

        <span className="text-[11px] text-gray-400">
          Halaman {safePage} dari {totalPages} · Maks. {PAGE_SIZE} notifikasi/halaman
        </span>
      </div>

      {/* Banner feedback clear / info */}
      {feedbackBanner && (
        <div
          className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
            feedbackBanner.type === "error"
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button onClick={() => setFeedbackBanner(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Notification List (10 per page) */}
      <div className="divide-y divide-gray-100">
        {pageItems.length === 0 ? (
          <div className="py-14 text-center text-gray-400 space-y-2">
            <Bell className="w-9 h-9 mx-auto opacity-30" />
            <p className="text-sm font-medium">Tidak ada notifikasi pada kategori ini</p>
            <p className="text-xs text-gray-400">
              Seluruh notifikasi baru untuk akun Anda akan tampil di sini secara otomatis.
            </p>
          </div>
        ) : (
          pageItems.map((item) => {
            const isExpanded = expandedIds.includes(item.id);
            const catMeta =
              NOTIFICATION_CATEGORY_META[item.category] ??
              NOTIFICATION_CATEGORY_META.Info;
            const resolvedRoute = resolveNotificationRouteForUser(
              item.ctaRoute,
              activeUser,
            );

            return (
              <div
                key={item.id}
                className="bg-white hover:bg-gray-50/60 transition-colors"
              >
                {/* Compact Row Header (Title only) — Click to open/close detail */}
                <div
                  onClick={() => handleToggleItem(item.id, item.isRead)}
                  className="px-6 py-2 cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`block w-1.5 h-1.5 rounded-full shrink-0 ${
                        item.isRead
                          ? "bg-gray-200"
                          : "bg-rose-400 ring-2 ring-rose-100"
                      }`}
                      title={item.isRead ? "Sudah dibaca" : "Belum dibaca"}
                    />
                    <h4
                      className={`text-xs truncate ${
                        item.isRead
                          ? "font-normal text-gray-600"
                          : "font-medium text-gray-800"
                      }`}
                    >
                      {item.title}
                    </h4>
                  </div>

                  {/* Right Action Icons (Clear & Expand/Collapse) */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleClearSingle(item.id)}
                      disabled={!item.isRead}
                      title={
                        item.isRead
                          ? "Clear notifikasi ini"
                          : "Notifikasi yang belum dibaca tidak bisa di-clear (baca terlebih dahulu atau otomatis ter-clear setelah 30 hari)"
                      }
                      className={`p-1 rounded-lg border text-xs transition-colors ${
                        item.isRead
                          ? "border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                          : "border-gray-200/60 text-gray-300 opacity-45 cursor-not-allowed"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item.id, item.isRead)}
                      className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                      title={isExpanded ? "Tutup detail" : "Buka detail"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-1 pl-12 space-y-3 border-t border-gray-100/80 bg-gray-50/40">
                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catMeta.badgeBg} ${catMeta.badgeText} ${catMeta.border}`}
                      >
                        {catMeta.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatFullDateTime(item.createdAt)}
                      </span>
                      {item.senderName && (
                        <span className="text-[11px] text-gray-400">
                          · Oleh <strong className="text-gray-600">{item.senderName}</strong>
                        </span>
                      )}
                    </div>
                    {item.bodyHtml ? (
                      <div
                        className="text-xs text-gray-700 leading-relaxed pt-2 space-y-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-xs [&_h3]:font-bold [&_a]:text-indigo-600 [&_a]:underline [&_img]:rounded-xl [&_img]:max-h-60 [&_img]:my-2"
                        dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                      />
                    ) : (
                      <div className="space-y-2 text-xs text-gray-700 leading-relaxed pt-2">
                        {item.body.map((paragraph, pIdx) => (
                          <p key={pIdx}>{paragraph}</p>
                        ))}
                      </div>
                    )}

                    {/* Embedded images in notification body */}
                    {item.embeddedImages && item.embeddedImages.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {item.embeddedImages.map((imgUrl, idx) => (
                          <img
                            key={idx}
                            src={imgUrl}
                            alt={`Lampiran visual ${idx + 1}`}
                            className="rounded-xl border border-gray-200 max-h-60 object-contain bg-white p-1"
                          />
                        ))}
                      </div>
                    )}

                    {/* Attachments */}
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5" /> Lampiran Dokumen ({item.attachments.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {item.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={att.dataUrl || "#"}
                              download={att.name}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs text-[#1A284F] font-medium hover:bg-blue-50"
                            >
                              <Paperclip className="w-3 h-3 text-gray-400" />
                              <span>{att.name}</span>
                              <span className="text-[10px] text-gray-400">({att.sizeLabel})</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.channels && item.channels.length > 0 && (
                          <span className="text-[10px] text-gray-400">
                            Channel: {item.channels.join(", ")}
                          </span>
                        )}
                      </div>

                      {resolvedRoute && (
                        <button
                          type="button"
                          onClick={() => navigate(resolvedRoute)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold transition-colors"
                        >
                          <span>{item.ctaLabel || "Buka Halaman Terkait"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer (10 per page + Next Page button) */}
      <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          Menampilkan{" "}
          <span className="font-semibold text-gray-800">
            {filteredList.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredList.length)}
          </span>{" "}
          dari <span className="font-semibold text-gray-800">{filteredList.length}</span> notifikasi
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev Page
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pg) => (
              <button
                key={pg}
                type="button"
                onClick={() => setCurrentPage(pg)}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition-colors ${
                  pg === safePage
                    ? "bg-[#1A284F] text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {pg}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#1A284F] hover:bg-[#131d3b] text-white text-xs font-semibold disabled:opacity-40 transition-colors"
          >
            Next Page
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
        </>
      )}

      {/* Popup Konfirmasi Clear All Notifikasi */}
      {confirmClearAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[#1A284F] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <h4 className="text-sm font-bold">Konfirmasi Clear All Notifikasi</h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmClearAllOpen(false)}
                className="text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-600 leading-relaxed">
              <p className="text-sm text-gray-800 font-semibold">
                Apakah Anda yakin ingin menghapus (Clear All) seluruh notifikasi yang sudah dibaca?
              </p>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-amber-800 space-y-1">
                <div>
                  • Notifikasi yang sudah dibaca ({readCount} item) akan langsung dibersihkan dari daftar Anda.
                </div>
                <div>
                  • Notifikasi yang <strong>belum dibaca ({unreadCount} item) tidak bisa di-clear</strong> dan hanya akan otomatis ter-clear apabila tidak dibaca selama 30 hari.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAllOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAll}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                >
                  Ya, Clear Notifikasi Terbaca
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
