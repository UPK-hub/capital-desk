"use client";

import * as React from "react";
import { Role } from "@prisma/client";
import { Select } from "@/components/Field";

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
  return "app-field-control h-10 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-black/10";
}

function roleLabel(role: Role) {
  if (role === Role.ADMIN) return "Administrador";
  if (role === Role.BACKOFFICE) return "Backoffice";
  return "Técnico";
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

  async function deleteUser(id: string) {
    setBusy(true);
    setError(null);
    setMsg(null);

    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo eliminar usuario");
      return;
    }

    setMsg("Usuario eliminado.");
    await load();
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Crear */}
      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Crear usuario</h2>

        {error ? <div className="rounded-xl border p-3 text-sm">{error}</div> : null}
        {msg ? <div className="rounded-xl border p-3 text-sm">{msg}</div> : null}

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
            <Select className={clsInput()} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value={Role.ADMIN}>Administrador</option>
              <option value={Role.BACKOFFICE}>Backoffice</option>
              <option value={Role.TECHNICIAN}>Técnico</option>
            </Select>
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
          className="sts-btn-primary text-sm disabled:opacity-50"
        >
          {busy ? "Procesando..." : "Crear"}
        </button>
      </section>

      {/* Listado */}
      <section className="sts-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Usuarios</h2>
          <button className="sts-btn-ghost text-sm" disabled={loading} onClick={load}>
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="mt-4 max-w-full">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay usuarios en este tenant.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {users.map((u) => (
                <UserCardItem
                  key={u.id}
                  u={u}
                  disabled={busy}
                  onPatch={patchUser}
                  onReset={createResetToken}
                  onDelete={deleteUser}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function UserCardItem({
  u,
  disabled,
  onPatch,
  onReset,
  onDelete,
}: {
  u: UserRow;
  disabled: boolean;
  onPatch: (id: string, patch: any) => Promise<void>;
  onReset: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [newPass, setNewPass] = React.useState("");
  const caps = new Set(u.capabilities ?? []);

  return (
    <article className="sts-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold leading-5">{u.name}</p>
          <p className="text-xs text-muted-foreground break-all">{u.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="sts-chip">{roleLabel(u.role)}</span>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs ${
              u.active
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-zinc-300 bg-zinc-50 text-zinc-600"
            }`}
          >
            {u.active ? "Activo" : "Inactivo"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs text-muted-foreground">Rol</label>
          <Select
            className="app-field-control h-9 w-full rounded-xl border px-2 text-sm"
            value={u.role}
            disabled={disabled}
            onChange={(e) => onPatch(u.id, { role: e.target.value })}
          >
            <option value={Role.ADMIN}>Administrador</option>
            <option value={Role.BACKOFFICE}>Backoffice</option>
            <option value={Role.TECHNICIAN}>Técnico</option>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Estado password</label>
          <div className="app-field-control h-9 rounded-xl border px-3 text-sm flex items-center">
            {u.hasPassword ? "Configurada" : "Pendiente"}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Habilitado</label>
          <label className="app-field-control h-9 rounded-xl border px-3 text-sm inline-flex items-center gap-2 w-full">
            <input
              type="checkbox"
              checked={u.active}
              disabled={disabled}
              onChange={(e) => onPatch(u.id, { active: e.target.checked })}
            />
            <span>{u.active ? "Sí" : "No"}</span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Acciones habilitadas</p>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {[
            { cap: "PLANNER", label: "Planner" },
            { cap: "STS_ADMIN", label: "Supervisor STS" },
            { cap: "STS_WRITE", label: "Helpdesk STS" },
            { cap: "STS_READ", label: "Auditor STS" },
            { cap: "TM_READ", label: "TM Reportes" },
            { cap: "CASE_ASSIGN", label: "Asignar casos" },
          ].map(({ cap, label }) => (
            <label key={cap} className="app-field-control flex items-center gap-2 rounded-xl border px-2.5 py-2.5">
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
              <span className="block font-medium">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="app-field-control h-9 w-52 rounded-xl border px-2 text-sm"
          placeholder="Nueva clave"
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
        />
        <button
          className="sts-btn-ghost text-sm h-9 px-3"
          disabled={disabled || newPass.trim().length < 6}
          onClick={async () => {
            await onPatch(u.id, { newPassword: newPass.trim() });
            setNewPass("");
          }}
        >
          Cambiar clave
        </button>

        <button className="sts-btn-ghost text-sm h-9 px-3" disabled={disabled} onClick={() => onReset(u.id)}>
          Generar reset token
        </button>
        <button
          className="sts-btn-ghost text-sm h-9 px-3 text-red-600"
          disabled={disabled}
          onClick={() => {
            if (confirm(`¿Eliminar usuario ${u.email}?`)) onDelete(u.id);
          }}
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}
