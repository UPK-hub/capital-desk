"use client";

import { useState } from "react";

function todayInputDate() {
  const d = new Date();
  const bog = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return bog; // YYYY-MM-DD
}

export default function GenerarHoyButton({ hasToday }: { hasToday: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = todayInputDate();

  const go = () => {
    window.location.href = `/rvr/${today}`;
  };

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/rvr/daily/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "No se pudo generar la revisión de hoy.");
      go();
    } catch (e: any) {
      setErr(e?.message ?? "Error generando la revisión.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {hasToday ? (
        <button
          type="button"
          onClick={go}
          className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-95"
        >
          Abrir la de hoy
        </button>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
        >
          {busy ? "Generando..." : "Generar la de hoy"}
        </button>
      )}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
