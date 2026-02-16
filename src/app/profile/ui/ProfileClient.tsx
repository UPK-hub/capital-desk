"use client";

import * as React from "react";

type Props = {
  user: { name: string; email: string; role: string };
};

export default function ProfileClient({ user }: Props) {
  const [section, setSection] = React.useState<"profile" | "appearance" | "security">("profile");
  const [email, setEmail] = React.useState(user.email);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim() ? email.trim() : undefined,
        currentPassword: currentPassword.trim() ? currentPassword : undefined,
        newPassword: newPassword.trim() ? newPassword : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo actualizar");
      return;
    }
    setMsg("Perfil actualizado.");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="sts-card p-5 space-y-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Configuración</p>
          <h2 className="text-lg font-semibold">Mi cuenta</h2>
        </div>
        <button
          className={`sts-btn-ghost text-sm w-full justify-start ${section === "profile" ? "border-zinc-400" : ""}`}
          onClick={() => setSection("profile")}
          type="button"
        >
          Mi perfil
        </button>
        <button
          className={`sts-btn-ghost text-sm w-full justify-start ${section === "appearance" ? "border-zinc-400" : ""}`}
          onClick={() => setSection("appearance")}
          type="button"
        >
          Apariencia
        </button>
        <button
          className={`sts-btn-ghost text-sm w-full justify-start ${section === "security" ? "border-zinc-400" : ""}`}
          onClick={() => setSection("security")}
          type="button"
        >
          Seguridad
        </button>
      </aside>

      <section className="space-y-4">
        <div className="sts-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-600">
              {user.name?.[0] ?? "U"}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Perfil</p>
              <h1 className="text-2xl font-semibold">{user.name}</h1>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
          </div>
        </div>

        {section === "profile" ? (
          <div className="sts-card p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Datos de cuenta</h3>
              <p className="text-xs text-muted-foreground">Actualiza tu correo y contraseña.</p>
            </div>

            {error ? <div className="sts-card p-3 text-sm text-red-600">{error}</div> : null}
            {msg ? <div className="sts-card p-3 text-sm">{msg}</div> : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Correo</label>
                <input
                  className="h-10 w-full rounded-xl border border-zinc-200/70 bg-white/90 px-3 text-sm focus-visible:outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Clave actual</label>
                <input
                  type="password"
                  className="h-10 w-full rounded-xl border border-zinc-200/70 bg-white/90 px-3 text-sm focus-visible:outline-none"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs text-muted-foreground">Nueva clave</label>
                <input
                  type="password"
                  className="h-10 w-full rounded-xl border border-zinc-200/70 bg-white/90 px-3 text-sm focus-visible:outline-none"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>

            <button className="sts-btn-primary text-sm" onClick={save} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        ) : null}

        {section === "appearance" ? (
          <div className="sts-card p-6 space-y-3">
            <h3 className="text-base font-semibold">Apariencia</h3>
            <p className="text-sm text-muted-foreground">
              La personalización visual se gestiona desde el panel de tema.
            </p>
            <a className="sts-btn-ghost text-sm w-fit" href="/admin/theme">
              Abrir panel de tema
            </a>
          </div>
        ) : null}

        {section === "security" ? (
          <div className="sts-card p-6 space-y-3">
            <h3 className="text-base font-semibold">Seguridad</h3>
            <p className="text-sm text-muted-foreground">
              Cambia tu contraseña desde la sección de perfil.
            </p>
            <button className="sts-btn-ghost text-sm w-fit" onClick={() => setSection("profile")} type="button">
              Ir a cambiar contraseña
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
