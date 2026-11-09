export const simulationPeriod = "2026";

export const simulationUnits = [
  { id: "IND", name: "PT RSUP (Industry)", group: "RSUP" },
  { id: "PKB", name: "PT RSUP (Perkebunan)", group: "RSUP" },
  { id: "RSTM", name: "PT RSTM", group: "RSUP" },
  { id: "GHS", name: "PT GHS", group: "RSUP" },
  { id: "ASD", name: "ASD", group: "RSUP" },
  { id: "GTG", name: "PT Pulau Sambu (Guntung)", group: "SAMBU" },
  { id: "KEN", name: "PT Pulau Sambu (Kuala Enok)", group: "SAMBU" },
] as const;

export const simulationLevels = ["operasional", "seksi", "bagian", "departemen", "divisi"] as const;
type Level = typeof simulationLevels[number];
type ActorLevel = Exclude<Level, "operasional"> | "gm" | "direktur" | "hr-unit" | "hr-strategic" | "bod";
type Module = "kpi" | "smart-goals" | "appraisal-form" | "project" | "rca" | "inter-department-feedback" | "manager-skill" | "management-interview";
type Stage = "checker" | "approver-1" | "approver-2" | "validator";

const employeeNames = [
  ["Ardi Pranata", "Bela Kusuma", "Candra Mahendra", "Dian Larasati", "Eko Wicaksana"],
  ["Farah Anggraini", "Gilang Saputra", "Hana Pertiwi", "Indra Kurniawan", "Jihan Maharani"],
  ["Kevin Aditya", "Laila Ramadhani", "Miko Santoso", "Nadia Permata", "Oka Wijaya"],
  ["Putri Safitri", "Qori Hidayat", "Raka Firmansyah", "Sinta Anjani", "Tegar Prasetyo"],
  ["Umar Hakim", "Vina Aprilia", "Wahyu Nugroho", "Xenia Kartika", "Yudha Maulana"],
  ["Zahra Amalia", "Aldo Baskara", "Bunga Melati", "Damar Setiawan", "Elisa Wulandari"],
  ["Fajar Ramadhan", "Gita Paramita", "Hendra Gunawan", "Intan Puspita", "Joko Darmawan"],
];
const departments = ["Produksi", "Finance & Accounting", "Human Resources", "Engineering", "Supply Chain"];
const positions = ["Staff", "Kepala Seksi", "Kepala Bagian", "Kepala Departemen", "Kepala Divisi"];
const actorLevels: ActorLevel[] = ["hr-unit", "seksi", "bagian", "departemen", "divisi", "gm", "direktur"];
const actorFirstNames = ["Ananta", "Baskara", "Citra", "Danis", "Elang", "Fania", "Galih"];
const actorLastNames = ["Nirmala", "Pradipta", "Wiratama", "Kencana", "Asmara", "Purnama", "Sanjaya"];
const actorId = (unitId: string, level: ActorLevel) => `SIM-ACTOR-${unitId}-${level.toUpperCase()}`;
const modules: Module[] = ["kpi", "smart-goals", "appraisal-form", "project", "rca", "inter-department-feedback", "manager-skill"];

export function allowedModulesForLevel(level: Level): Module[] {
  if (["operasional", "seksi"].includes(level)) {
    return ["kpi", "smart-goals", "appraisal-form", "project", "rca"];
  }
  if (level === "divisi") {
    return [...modules, "management-interview"];
  }
  return [...modules];
}

export const simulationEmployees = [
  ...simulationUnits.flatMap((unit, unitIndex) =>
    simulationLevels.map((level, levelIndex) => ({
      id: `SIM-EMP-${String(unitIndex * 5 + levelIndex + 1).padStart(3, "0")}`,
      name: employeeNames[unitIndex][levelIndex],
      email: `employee.${unit.id.toLowerCase()}.${level}@pa-simulasi.example.invalid`,
      unitId: unit.id,
      companyUnit: unit.name,
      division: levelIndex < 2 ? "Operasi" : "Corporate Services",
      departmentId: `SIM-DEPT-${unit.id}-${levelIndex + 1}`,
      department: departments[levelIndex],
      position: positions[levelIndex],
      level,
      allowedModules: allowedModulesForLevel(level),
      period: simulationPeriod,
    })),
  ),
  ...simulationUnits.map((unit, unitIndex) => ({
    id: actorId(unit.id, "hr-unit"),
    name: `${actorFirstNames[0]} ${actorLastNames[unitIndex]}`,
    email: `hr-unit.${unit.id.toLowerCase()}@pa-simulasi.example.invalid`,
    unitId: unit.id,
    companyUnit: unit.name,
    division: "Corporate Services",
    departmentId: `SIM-DEPT-${unit.id}-3`,
    department: "Human Resources",
    position: "Supervisor HR Unit",
    level: "bagian" as Level,
    allowedModules: allowedModulesForLevel("bagian"),
    period: simulationPeriod,
  })),
];

export const simulationActors = [
  ...simulationUnits.flatMap((unit, unitIndex) => actorLevels
    .filter((level) => level !== "direktur" || unit.group === "RSUP")
    .map((level, actorIndex) => ({
      id: actorId(unit.id, level),
      name: `${actorFirstNames[actorIndex]} ${actorLastNames[unitIndex]}`,
      email: `${level}.${unit.id.toLowerCase()}@pa-simulasi.example.invalid`,
      level,
      unitId: unit.id as string | null,
    }))),
  { id: "SIM-ACTOR-HR-STRATEGIC", name: "Ratna Candrawati", email: "hr.strategic@pa-simulasi.example.invalid", level: "hr-strategic" as ActorLevel, unitId: null },
  ...["Surya Abimanyu", "Maya Dewantara", "Bima Wardhana", "Lestari Adinata"].map((name, index) => ({
    id: `SIM-ACTOR-BOD-${index + 1}`,
    name,
    email: `bod.${index + 1}@pa-simulasi.example.invalid`,
    level: "bod" as ActorLevel,
    unitId: null,
  })),
  ...["Nara Pramudya", "Sekar Wening", "Reno Aryatama", "Tania Maheswari"].map((name, index) => ({
    id: `SIM-ACTOR-DIRECTOR-${index + 1}`,
    name,
    email: `director.${index + 1}@pa-simulasi.example.invalid`,
    level: "direktur" as ActorLevel,
    unitId: null,
  })),
];

const superiorPairs: Record<Level, [ActorLevel, ActorLevel]> = {
  operasional: ["seksi", "bagian"],
  seksi: ["bagian", "departemen"],
  bagian: ["departemen", "divisi"],
  departemen: ["divisi", "gm"],
  divisi: ["gm", "gm"],
};
const resolveActor = (unitId: string, level: ActorLevel) => simulationActors.find((actor) => actor.id === actorId(unitId, level))?.id ?? null;

export const simulationAssignments = simulationEmployees.flatMap((employee) => modules.flatMap((module) => {
  if (!employee.allowedModules.includes(module)) return [];
  const phases = module === "kpi" || module === "smart-goals" ? ["setting", "measurement"] : ["measurement"];
  const pair = superiorPairs[employee.level];
  const mirrorSecondSlot = employee.level === "divisi";
  const stages: { stage: Stage; actorId: string | null; requiredLevel: ActorLevel }[] = [];
  const checkerActorId = resolveActor(employee.unitId, "hr-unit");
  if (["kpi", "smart-goals", "rca"].includes(module) && checkerActorId !== employee.id) {
    stages.push({ stage: "checker", actorId: checkerActorId, requiredLevel: "hr-unit" });
  }
  stages.push({ stage: "approver-1", actorId: resolveActor(employee.unitId, pair[0]), requiredLevel: pair[0] });
  if (!mirrorSecondSlot) {
    stages.push({ stage: "approver-2", actorId: resolveActor(employee.unitId, pair[1]), requiredLevel: pair[1] });
  }
  if (["kpi", "smart-goals", "rca"].includes(module)) {
    stages.push({ stage: "validator", actorId: "SIM-ACTOR-HR-STRATEGIC", requiredLevel: "hr-strategic" });
  }
  return phases.map((phase) => ({
    employeeId: employee.id,
    unitId: employee.unitId,
    period: simulationPeriod,
    module,
    phase,
    stages,
    complete: stages.every((stage) => stage.actorId !== null),
    executionRuleConfirmed: true,
    action: module === "inter-department-feedback" ? "submit-follow-up" : "approval",
    mirrorSecondSlot,
    mirroredSecondSlotActorId: mirrorSecondSlot ? resolveActor(employee.unitId, "gm") : null,
    mirroredSecondSlotNote: mirrorSecondSlot ? "sesuai catatan approver 1" : null,
  }));
}));

export const simulationInterviewAssignments = simulationEmployees.filter((employee) => employee.level === "divisi").map((employee) => ({
  employeeId: employee.id,
  unitId: employee.unitId,
  period: simulationPeriod,
  reviewerIds: simulationUnits.find((unit) => unit.id === employee.unitId)?.group === "RSUP"
    ? [1, 2, 3, 4].map((index) => `SIM-ACTOR-DIRECTOR-${index}`)
    : [actorId(employee.unitId, "gm")],
}));

export const simulationCalibrationAssignments = simulationUnits.map((unit) => ({
  unitId: unit.id,
  period: simulationPeriod,
  ratifierId: unit.group === "RSUP" ? "SIM-ACTOR-BOD-1" : actorId(unit.id, "gm"),
}));

export const simulationDatasetStatus = {
  identities: "fictional-draft",
  accountsCreated: false,
  databaseConnected: false,
  assignmentsManagedBy: "SIM-ACTOR-HR-STRATEGIC",
  e2eValidated: false,
} as const;
