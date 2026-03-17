"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export default function DeleteCaseButton({
  caseId,
  caseTitle,
}: {
  caseId: string;
  caseTitle: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `¿Eliminar el caso "${caseTitle}"?\n\nEsta acción eliminará el caso, su OT y todos los datos asociados. No se puede deshacer.`
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/cases/${caseId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo eliminar el caso");
      return;
    }

    router.push("/cases");
  }

  return (
    <div>
      {error ? (
        <p className="mb-2 text-xs text-red-600">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex w-full items-center justify-center rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        {deleting ? "Eliminando..." : "Eliminar caso"}
      </button>
    </div>
  );
}
