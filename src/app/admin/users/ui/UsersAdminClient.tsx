"use client";

import * as React from "react";
import { Role } from "@prisma/client";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  hasPassword: boolean;
  capabilities?: string[];
};

function clsInput() {
  return "h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

export default function UsersAdminClient() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [users, setUsers] = React.useState<UserRow[]>([]);

  // form crear
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>(Role.TECHNICIAN);
  const [password, setPassword] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/admin/users", { method: "GET", cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setError(data?.error ?? "No se pudo cargar usuarios");
      return;
    }

    setUsers((data?.users ?? []) as UserRow[]);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function createUser() {
    setBusy(true);
    setError(null);
    setMsg(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        role,
        password: password.trim() ? password.trim() : null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear usuario");
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    setMsg("Usuario creado.");
    await load();
  }

  async function patchUser(id: string, patch: any) {
    setBusy(true);
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo actualizar usuario");
      return;
    }

    setMsg("Usuario actualizado.");
    await load();
  }

  async function createResetToken(id: string) {
    setBusy(true);
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/admin/users/${id}/reset-token`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo generar token");
      return;
    }

    // por ahora lo mostramos para pruebas; luego se envía por correo.
    setMsg(`Reset token generado (prueba): ${data.rawToken} (expira ${new Date(data.expiresAt).toLocaleString()})`);
  }

  return (
    <div className="space-y-6">
      {/* Crear */}
      <section className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold">Crear usuario</h2>

        {error ? <div className="rounded-md border p-3 text-sm">{error}</div> : null}
        {msg ? <div className="rounded-md border p-3 text-sm">{msg}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Nombre</label>
            <input className={clsInput()} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input className={clsInput()} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Rol</label>
            <select className={clsInput()} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value={Role.ADMIN}>ADMIN</option>
              <option value={Role.BACKOFFICE}>BACKOFFICE</option>
              <option value={Role.TECHNICIAN}>TECHNICIAN</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Contraseña (opcional)</label>
            <input
              className={clsInput()}
              placeholder="Si vacío: sin contraseña, usar reset"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={createUser}
          disabled={busy || loading}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Procesando..." : "Crear"}
        </button>
      </section>

      {/* Listado */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Usuarios</h2>
          <button className="rounded-md border px-3 py-1.5 text-sm" disabled={loading} onClick={load}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios en este tenant.</p>
          ) : (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left p-2">Nombre</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Rol</th>
                    <th className="text-left p-2">Activo</th>
                    <th className="text-left p-2">Password</th>
                    <th className="text-left p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRowItem
                      key={u.id}
                      u={u}
                      disabled={busy}
                      onPatch={patchUser}
                      onReset={createResetToken}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

  function UserRowItem({
  u,
  disabled,
  onPatch,
  onReset,
}: {
  u: UserRow;
  disabled: boolean;
  onPatch: (id: string, patch: any) => Promise<void>;
  onReset: (id: string) => Promise<void>;
}) {
  const [newPass, setNewPass] = React.useState("");
  const caps = new Set(u.capabilities ?? []);

  return (
    <tr className="border-t align-top">
      <td className="p-2">{u.name}</td>
      <td className="p-2">{u.email}</td>

      <td className="p-2">
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={u.role}
          disabled={disabled}
          onChange={(e) => onPatch(u.id, { role: e.target.value })}
        >
          <option value={Role.ADMIN}>ADMIN</option>
          <option value={Role.BACKOFFICE}>BACKOFFICE</option>
          <option value={Role.TECHNICIAN}>TECHNICIAN</option>
        </select>
      </td>

      <td className="p-2">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={u.active}
            disabled={disabled}
            onChange={(e) => onPatch(u.id, { active: e.target.checked })}
          />
          <span>{u.active ? "Sí" : "No"}</span>
        </label>
      </td>

      <td className="p-2">{u.hasPassword ? "Configurada" : "Pendiente"}</td>

      <td className="p-2 space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {["STS_READ", "STS_WRITE", "STS_ADMIN", "PLANNER", "CASE_ASSIGN"].map((cap) => (
            <label key={cap} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={caps.has(cap)}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(caps);
                  if (e.target.checked) next.add(cap);
                  else next.delete(cap);
                  onPatch(u.id, { capabilities: Array.from(next) });
                }}
              />
              <span>{cap}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className="h-9 w-44 rounded-md border px-2 text-sm"
            placeholder="Nueva clave"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <button
            className="rounded-md border px-2 py-1 text-sm"
            disabled={disabled || newPass.trim().length < 6}
            onClick={async () => {
              await onPatch(u.id, { newPassword: newPass.trim() });
              setNewPass("");
            }}
          >
            Cambiar
          </button>
        </div>

        <button className="rounded-md border px-2 py-1 text-sm" disabled={disabled} onClick={() => onReset(u.id)}>
          Generar reset token
        </button>
      </td>
    </tr>
  );
}
