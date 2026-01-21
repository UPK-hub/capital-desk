"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";

  const [pwd, setPwd] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setSaving(true);
    setMsg(null);

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: pwd }),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) return setMsg(data?.error ?? "No se pudo restablecer");
    setMsg("Contraseña actualizada. Ya puedes iniciar sesión.");
    setTimeout(() => router.push("/login"), 800);
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <h1 className="text-xl font-semibold">Restablecer contraseña</h1>

        {!token ? <p className="text-sm text-red-600">Token inválido.</p> : null}

        <label className="text-xs text-muted-foreground">Nueva contraseña</label>
        <input
          className="h-10 w-full rounded-md border px-3 text-sm"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="mínimo 8 caracteres"
          type="password"
        />

        {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

        <button
          disabled={!token || pwd.length < 8 || saving}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          onClick={submit}
        >
          {saving ? "Guardando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
