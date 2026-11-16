import { UserCheck } from "lucide-react";
import type { ManagedUser } from "../../store/authStore";
import type { DelegationAccess } from "../../store/delegationStore";

const ACCESS_ITEMS: Array<[keyof DelegationAccess, string]> = [
  ["view", "View"],
  ["create", "Create"],
  ["edit", "Edit"],
  ["delete", "Delete"],
  ["approve", "Approve"],
];

export function DelegatedWorkspaceBanner({
  delegator,
  actorName,
  access,
  moduleLabel,
}: {
  delegator: ManagedUser;
  actorName: string;
  access: DelegationAccess;
  moduleLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 via-white to-sky-50/80 px-4 py-3 text-xs">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1A284F] text-white">
          <UserCheck className="h-4 w-4" />
        </span>
        <div>
          <p className="font-bold text-[#1A284F]">
            Mode Delegasi {moduleLabel} · Atas Nama: {delegator.name} ({delegator.employeeId})
          </p>
          <p className="text-[11px] text-gray-500">
            {delegator.position} · {delegator.division} · {delegator.company} — Dikerjakan oleh{" "}
            <strong className="text-gray-700">{actorName}</strong> (tersimpan langsung di akun pemberi delegasi pada database)
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Hak Akses:</span>
        {ACCESS_ITEMS.map(([k, label]) => {
          const on = Boolean(access[k]);
          return (
            <span
              key={k}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                on
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-400 line-through"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
