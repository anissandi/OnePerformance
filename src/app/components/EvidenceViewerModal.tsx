import React from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, FileText, Paperclip, X } from "lucide-react";

/** Pilih URL yang masih valid: blob: dari sesi lain tidak bisa dibuka, jadi gunakan dataUrl bila ada. */
export function pickEvidenceUrl(url?: string, dataUrl?: string): string {
  if (url && !url.startsWith("blob:")) return url;
  if (dataUrl) return dataUrl;
  return url ?? "";
}

function dataUrlToObjectUrl(dataUrl: string): string | null {
  try {
    const [head, body] = dataUrl.split(",", 2);
    const mime = head.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
    const isBase64 = /;base64/i.test(head);
    const raw = isBase64 ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch {
    return null;
  }
}

interface Props {
  name: string;
  url: string;
  dataUrl?: string;
  mimeType?: string;
  subtitle?: string;
  onClose: () => void;
}

/** Pratinjau evidence (gambar/PDF) yang mendukung URL Storage, Data URL, maupun dokumen lain. */
export function EvidenceViewerModal({ name, url, dataUrl, mimeType = "", subtitle, onClose }: Props) {
  const source = pickEvidenceUrl(url, dataUrl);
  const [viewUrl, setViewUrl] = React.useState<string>(source);

  React.useEffect(() => {
    // Browser memblokir data: PDF di iframe/tab baru → konversi ke object URL sementara.
    if (source.startsWith("data:")) {
      const obj = dataUrlToObjectUrl(source);
      if (obj) {
        setViewUrl(obj);
        return () => URL.revokeObjectURL(obj);
      }
    }
    setViewUrl(source);
    return undefined;
  }, [source]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const effectiveMime = mimeType || source.match(/^data:([^;]+)/)?.[1] || "";
  const isImg = /^image\//.test(effectiveMime) || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
  const isPdf = effectiveMime === "application/pdf" || /\.pdf$/i.test(name);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0">
          <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1A284F] truncate">{name}</p>
            {subtitle && <p className="text-[11px] text-gray-400 truncate">{subtitle}</p>}
          </div>
          {viewUrl && (
            <>
              <a
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                <ExternalLink className="w-3 h-3" /> Buka
              </a>
              <a
                href={viewUrl}
                download={name}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg shrink-0" aria-label="Tutup">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-6 bg-gray-50 min-h-[360px]">
          {viewUrl && isImg ? (
            <img src={viewUrl} alt={name} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow" />
          ) : viewUrl && isPdf ? (
            <iframe src={viewUrl} title={name} className="w-full rounded-lg border border-gray-200 bg-white" style={{ height: "75vh" }} />
          ) : (
            <div className="flex flex-col items-center gap-3 text-gray-400 text-center">
              <FileText className="w-12 h-12 opacity-30" />
              <p className="text-sm font-semibold text-gray-700">{name}</p>
              <p className="text-xs text-gray-500 max-w-sm">
                {viewUrl
                  ? "Pratinjau langsung tidak tersedia untuk format ini, silakan buka atau unduh dokumen."
                  : "File evidence tidak memiliki lampiran yang tersimpan. Silakan upload ulang evidence."}
              </p>
              {viewUrl && (
                <a
                  href={viewUrl}
                  download={name}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1A284F] text-white hover:bg-[#131d3b]"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default EvidenceViewerModal;
