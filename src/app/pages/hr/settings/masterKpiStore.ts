// Shared localStorage store for Master KPI data — read by supervisor/setting/kpi

const KEY = "master_kpi_data";

export interface MasterKpiStore {
  scope:         string[];
  section:       string[];
  perspektif:    string[];
  satuan:        string[];
  period:        string[];
  trackingPeriod: string[];
  cascading:     { value: string; description: string }[];
}

const DEFAULTS: MasterKpiStore = {
  scope: [
    "RMD", "MPD", "WCC",
    "PT RSUP (Industry)", "PT RSUP (Perkebunan)",
    "PT RSTM", "PT GHS", "ASD",
    "PT Pulau Sambu (Jakarta)", "PT Pulau Sambu (Guntung)", "PT Pulau Sambu (Kuala Enok)",
  ],
  section: [
    "Kinerja K3L Terintegrasi (SMK3/HSE)", "Finansial", "Produksi",
    "Be Employer of Choices", "Be Partner of Choices", "Regulatory Compliance",
  ],
  perspektif:    ["Proses", "Finansial", "Learning & Growth", "Customer"],
  satuan:        ["%", "Temuan", "Hari", "Kasus", "Rp Juta", "Rp Miliar", "Jumlah"],
  period:        ["Hari", "Bulan", "Semester", "Triwulan", "Quarter", "Tahun"],
  trackingPeriod: ["Bulanan", "Semester", "Triwulan", "Quarter", "Tahunan"],
  cascading: [
    { value: "COO",           description: "COO"           },
    { value: "GM Industry",   description: "GM Industry"   },
    { value: "VGM Industry",  description: "VGM Industry"  },
    { value: "GM Perkebunan", description: "GM Perkebunan" },
    { value: "VGM Perkebunan",description: "VGM Perkebunan"},
    { value: "GM ASD",        description: "GM ASD"        },
    { value: "GM RSTM",       description: "GM RSTM"       },
    { value: "GM GHS",        description: "GM GHS"        },
    { value: "GM PSG",        description: "GM PSG"        },
    { value: "GM PSKE",       description: "GM PSKE"       },
    { value: "VGM PSG",       description: "VGM PSG"       },
    { value: "VGM PSKE",      description: "VGM PSKE"      },
  ],
};

export function loadMasterKpi(): MasterKpiStore {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULTS;
}

export function saveMasterKpi(data: MasterKpiStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export { DEFAULTS as MASTER_KPI_DEFAULTS };
