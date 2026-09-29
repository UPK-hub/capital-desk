"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ReintentarBoton({
  attachmentId,
  todos = false,
  etiqueta,
}: {
  attachmentId?: string;
  todos?: boolean;
  etiqueta: string;
}) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [, startTransition] = useTransition();

  async function reintentar() {
    setCargando(true);
    try {
      const res = await fetch("/api/onedrive/reintentar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(todos ? { todos: true } : { attachmentId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error ?? "No se pudo reintentar");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setCargando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={reintentar}
      disabled={cargando}
      className="sts-btn-ghost text-xs disabled:opacity-50"
    >
      {cargando ? "Reintentando..." : etiqueta}
    </button>
  );
}
