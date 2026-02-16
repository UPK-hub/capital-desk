"use client";

import * as React from "react";
import { Role } from "@prisma/client";
import { Select } from "@/components/Field";
import { StatusPill } from "@/components/ui/status-pill";
import { MIN_PASSWORD_LENGTH } from "@/lib/security/constants";

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
  return "app-field-control h-10 w-full rounded-xl border px-3 text-sm focus-visible:outline-none";
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

    const trimmedPassword = password.trim();
    if (trimmedPassword && trimmedPassword.length < MIN_PASSWORD_LENGTH) {
      setBusy(false);
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        role,
        password: trimmedPassword ? trimmedPassword : null,
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

    if (data?.warning) {
      setMsg(String(data.warning));
    } else if (data?.resetEmailSent) {
      setMsg("Usuario creado. Se envio correo para configurar contraseña.");
    } else {
      setMsg("Usuario creado.");
    }
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

    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo enviar correo de restablecimiento");
      return;
    }

    setMsg(`Correo de restablecimiento enviado. Expira ${new Date(data.expiresAt).toLocaleString()}.`);
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
              placeholder={`Si vacio: envio por correo (min ${MIN_PASSWORD_LENGTH})`}
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
    <article className="sts-card sts-card--interactive p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold leading-5">{u.name}</p>
          <p className="text-xs text-muted-foreground break-all">{u.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="sts-chip">{roleLabel(u.role)}</span>
          {u.active ? (
            <StatusPill status="activo" label="Activo" />
          ) : (
            <StatusPill status="cancelado" label="Inactivo" />
          )}
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
          <label className="inline-flex h-9 w-full items-center gap-2 rounded-xl border border-border/60 bg-card px-3 text-sm shadow-[var(--shadow-xs)]">
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
            <label
              key={cap}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-2.5 shadow-[var(--shadow-xs)]"
            >
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
          placeholder={`Nueva clave (min ${MIN_PASSWORD_LENGTH})`}
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
        />
        <button
          className="sts-btn-ghost text-sm h-9 px-3"
          disabled={disabled || newPass.trim().length < MIN_PASSWORD_LENGTH}
          onClick={async () => {
            await onPatch(u.id, { newPassword: newPass.trim() });
            setNewPass("");
          }}
        >
          Cambiar clave
        </button>

        <button className="sts-btn-ghost text-sm h-9 px-3" disabled={disabled} onClick={() => onReset(u.id)}>
          Enviar reset por correo
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
