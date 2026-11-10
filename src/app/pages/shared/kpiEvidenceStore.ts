import { savePersistedState } from "../../services/supabaseClient";

const KEY = "kpi_evidence_files";

export interface StoredEvidenceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  month: string;
}

function loadAll(): StoredEvidenceFile[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveEvidenceFiles(files: StoredEvidenceFile[]): void {
  try {
    // Exclude blob URLs (not serializable across sessions) — store metadata only
    const serializable = files.map((f) => ({ ...f, url: f.url.startsWith("blob:") ? "" : f.url }));
    savePersistedState(KEY, serializable);
  } catch {
    // ignore
  }
}

export function loadEvidenceFiles(): StoredEvidenceFile[] {
  return loadAll();
}

export function clearEvidenceFiles(): void {
  try {
    savePersistedState(KEY, []);
  } catch {
    // ignore
  }
}
