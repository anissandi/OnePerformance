import {
  simulationActors,
  simulationEmployees,
  simulationPeriod,
} from "../../src/app/data/paSimulation2026.ts";

const identities = [
  ...simulationEmployees.map((employee) => ({
    identityId: employee.id,
    name: employee.name,
    email: employee.email,
    unitId: employee.unitId,
    actorLevel: employee.id.includes("-HR-UNIT") ? "hr-unit" : employee.level,
    participant: true,
    organization: {
      companyUnit: employee.companyUnit,
      division: employee.division,
      departmentId: employee.departmentId,
      department: employee.department,
      position: employee.position,
    },
  })),
  ...simulationActors.filter((actor) => !simulationEmployees.some((employee) => employee.id === actor.id)).map((actor) => ({
    identityId: actor.id,
    name: actor.name,
    email: actor.email,
    unitId: actor.unitId,
    actorLevel: actor.level,
    participant: false,
    organization: {},
  })),
];

if (
  simulationEmployees.length !== 42 ||
  simulationActors.length !== 56 ||
  identities.length !== 91 ||
  new Set(identities.map((identity) => identity.identityId)).size !== 91 ||
  new Set(identities.map((identity) => identity.email)).size !== 91 ||
  identities.some((identity) => !identity.email.endsWith("@pa-simulasi.example.invalid"))
) {
  throw new Error("Dataset PA-Simulasi tidak memenuhi acuan 35 peserta dan 56 aktor unik.");
}

const quoteSql = (value: string | null) =>
  value === null ? "null" : `'${value.replaceAll("'", "''")}'`;

const rows = identities.map((identity) =>
  `(${[
    quoteSql(identity.identityId),
    quoteSql(identity.name),
    quoteSql(identity.email),
    quoteSql(identity.unitId),
    quoteSql(identity.actorLevel),
    identity.participant ? "true" : "false",
    quoteSql(simulationPeriod),
    `${quoteSql(JSON.stringify(identity.organization))}::jsonb`,
  ].join(", ")})`,
);

console.log([
  "begin;",
  "insert into public.pa_sim_identities",
  "(identity_id, name, email, unit_id, actor_level, appraisal_participant, dataset_period, organization)",
  "values",
  rows.join(",\n"),
  "on conflict (identity_id) do nothing;",
  "commit;",
].join("\n"));
