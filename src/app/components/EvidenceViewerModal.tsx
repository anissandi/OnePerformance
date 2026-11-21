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

export async function triggerReliableFileDownload(url: string, fileName: string) {
  if (!url) return;
  try {
    if (url.startsWith("data:")) {
      const obj = dataUrlToObjectUrl(url);
      if (obj) {
        const a = document.createElement("a");
        a.href = obj;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(obj), 5000);
        return;
      }
    } else if (/^https?:\/\//i.test(url)) {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.blob();
        const obj = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = obj;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(obj), 5000);
        return;
      }
    }
  } catch {
    // fallback below
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function EmbeddedPdfPreview({
  url,
  name,
  height = 480,
  onClose,
  onExpandModal,
}: {
  url: string;
  name: string;
  height?: number;
  onClose?: () => void;
  onExpandModal?: () => void;
}) {
  const [embedSrc, setEmbedSrc] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let cancelled = false;
    let createdObjUrl: string | null = null;
    setLoading(true);

    const prepare = async () => {
      if (!url) {
        if (!cancelled) {
          setEmbedSrc("");
          setLoading(false);
        }
        return;
      }
      if (url.startsWith("data:")) {
        const [head, body] = url.split(",", 2);
        try {
          const isBase64 = /;base64/i.test(head);
          const raw = isBase64 ? atob(body) : decodeURIComponent(body);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          createdObjUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          if (!cancelled) {
            setEmbedSrc(createdObjUrl);
            setLoading(false);
          }
          return;
        } catch {
          // fallback below
        }
      } else if (/^https?:\/\//i.test(url)) {
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            createdObjUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
            if (!cancelled) {
              setEmbedSrc(createdObjUrl);
              setLoading(false);
            }
            return;
          }
        } catch {
          // fallback to direct URL
        }
      }
      if (!cancelled) {
        setEmbedSrc(url);
        setLoading(false);
      }
    };

    void prepare();
    return () => {
      cancelled = true;
      if (createdObjUrl) URL.revokeObjectURL(createdObjUrl);
    };
  }, [url]);

  return (
    <div className="rounded-xl border border-sky-200 bg-white overflow-hidden shadow-xs">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-slate-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span className="text-xs font-semibold text-[#1A284F] truncate">{name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onExpandModal && (
            <button
              type="button"
              onClick={onExpandModal}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-gray-50"
            >
              <ExternalLink className="w-3 h-3" /> Layar Penuh
            </button>
          )}
          <button
            type="button"
            onClick={() => { void triggerReliableFileDownload(url, name); }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-gray-50"
          >
            <Download className="w-3 h-3" /> Download
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              title="Tutup pratinjau PDF"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="bg-slate-100 p-2">
        {loading ? (
          <div className="flex items-center justify-center text-xs text-gray-500" style={{ height }}>
            Memuat dokumen PDF...
          </div>
        ) : embedSrc ? (
          <iframe
            src={embedSrc}
            title={name}
            className="w-full rounded-lg border border-gray-200 bg-white"
            style={{ height }}
          />
        ) : (
          <div className="flex items-center justify-center text-xs text-gray-400" style={{ height: 160 }}>
            Dokumen PDF tidak dapat dimuat.
          </div>
        )}
      </div>
    </div>
  );
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
    let cancelled = false;
    let createdObjUrl: string | null = null;
    const isPdfDoc = mimeType === "application/pdf" || /\.pdf$/i.test(name);
    // Browser memblokir data: PDF di iframe/tab baru → konversi ke object URL sementara.
    if (source.startsWith("data:")) {
      const obj = dataUrlToObjectUrl(source);
      if (obj) {
        setViewUrl(obj);
        return () => URL.revokeObjectURL(obj);
      }
    } else if (isPdfDoc && /^https?:\/\//i.test(source)) {
      void fetch(source)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("fetch failed"))))
        .then((buf) => {
          if (cancelled) return;
          createdObjUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
          setViewUrl(createdObjUrl);
        })
        .catch(() => {
          if (!cancelled) setViewUrl(source);
        });
      return () => {
        cancelled = true;
        if (createdObjUrl) URL.revokeObjectURL(createdObjUrl);
      };
    }
    setViewUrl(source);
    return undefined;
  }, [source, mimeType, name]);

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
              <button
                type="button"
                onClick={() => { void triggerReliableFileDownload(source || viewUrl, name); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0"
              >
                <Download className="w-3 h-3" /> Download
              </button>
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
