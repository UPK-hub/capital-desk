"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CaseOption = {
  id: string;
  caseNo: number | null;
  title: string;
};

function fmtCaseNo(value?: number | null) {
  if (!value) return "CASO--";
  return `CASO-${String(value).padStart(3, "0")}`;
}

export default function BusTimelineCaseFilter({
  cases,
  selectedCaseId,
}: {
  cases: CaseOption[];
  selectedCaseId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextCaseId = event.target.value.trim();
    const params = new URLSearchParams(searchParams.toString());

    if (nextCaseId) {
      params.set("caseId", nextCaseId);
    } else {
      params.delete("caseId");
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
      <select
        value={selectedCaseId ?? ""}
        onChange={handleChange}
        disabled={isPending}
        className="app-field-control h-9 min-w-[15rem] rounded-xl px-3 text-xs sm:text-sm"
      >
        <option value="">Sin seleccionar</option>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            {fmtCaseNo(c.caseNo)} · {c.title}
          </option>
        ))}
      </select>
      {isPending ? <span className="text-xs text-muted-foreground">Actualizando...</span> : null}
    </div>
  );
}
