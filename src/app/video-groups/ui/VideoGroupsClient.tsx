"use client";

import * as React from "react";
import { Select } from "@/components/Field";

type Group = { id: string; name: string; memberCount: number };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  videoGroup: string | null;
};

function roleLabel(role: string) {
  if (role === "ADMIN") return "Administrador";
  if (role === "BACKOFFICE") return "Backoffice";
  if (role === "TECHNICIAN") return "Técnico";
  return role;
}

function GroupRow({
  group,
  busy,
  onRename,
  onDelete,
}: {
  group: Group;
  busy: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
}) {
  const [name, setName] = React.useState(group.name);
  React.useEffect(() => setName(group.name), [group.name]);
  const dirty = name.trim() !== group.name && name.trim().length >= 2;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
      <input
        className="app-field-control h-9 min-w-[180px] flex-1 rounded-xl border px-3 text-sm"
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
      />
      <span className="sts-chip shrink-0">{group.memberCount} usuario(s)</span>
      <button
        className="sts-btn-soft h-9 px-3 text-sm disabled:opacity-50"
        disabled={busy || !dirty}
        onClick={() => onRename(group.id, name.trim())}
      >
        Guardar
      </button>
      <button
        className="sts-btn-ghost h-9 px-3 text-sm text-red-600 disabled:opacity-50"
        disabled={busy}
        onClick={() => onDelete(group.id, group.name)}
      >
        Eliminar
      </button>
    </div>
  );
}

export default function VideoGroupsClient() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [newName, setNewName] = React.useState("");

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/video-groups", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar");
      return;
    }
    setGroups((data?.groups ?? []) as Group[]);
    setUsers((data?.users ?? []) as UserRow[]);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function call(method: string, url: string, body?: any) {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo completar la acción");
      return false;
    }
    return true;
  }

  async function createGroup() {
    const name = newName.trim();
    if (name.length < 2) {
      setError("El nombre del grupo debe tener al menos 2 caracteres.");
      return;
    }
    if (await call("POST", "/api/video-groups", { name })) {
      setNewName("");
      setMsg("Grupo creado.");
      await load();
    }
  }

  async function renameGroup(id: string, name: string) {
    if (await call("PATCH", `/api/video-groups/${id}`, { name })) {
      setMsg("Grupo actualizado.");
      await load();
    }
  }

  async function deleteGroup(id: string, name: string) {
    if (!window.confirm(`¿Eliminar el grupo "${name}"? Los usuarios de ese grupo quedarán sin grupo.`)) return;
    if (await call("DELETE", `/api/video-groups/${id}`)) {
      setMsg("Grupo eliminado.");
      await load();
    }
  }

  async function assignUser(userId: string, group: string) {
    if (await call("PATCH", "/api/video-groups/assign", { userId, group: group || null })) {
      setMsg("Asignación actualizada.");
      await load();
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="sts-card p-3 text-sm text-red-700">{error}</div> : null}
      {msg ? <div className="sts-card p-3 text-sm text-green-700">{msg}</div> : null}

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Grupos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="app-field-control h-9 min-w-[220px] flex-1 rounded-xl border px-3 text-sm"
            placeholder="Nombre del nuevo grupo"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createGroup();
            }}
          />
          <button className="sts-btn-primary h-9 px-4 text-sm disabled:opacity-50" disabled={busy} onClick={createGroup}>
            Crear grupo
          </button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay grupos. Crea el primero arriba.</p>
          ) : (
            groups.map((g) => (
              <GroupRow key={g.id} group={g} busy={busy} onRename={renameGroup} onDelete={deleteGroup} />
            ))
          )}
        </div>
      </section>

      <section className="sts-card p-5 space-y-4">
        <h2 className="text-base font-semibold">Asignar usuarios a grupos</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3 py-2"
              >
                <div className="min-w-[180px]">
                  <p className="text-sm font-medium leading-5">
                    {u.name} {u.active ? "" : <span className="text-xs text-muted-foreground">(inactivo)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    {u.email} · {roleLabel(u.role)}
                  </p>
                </div>
                <Select
                  className="app-field-control h-9 w-56 rounded-xl border px-2 text-sm"
                  value={u.videoGroup ?? ""}
                  disabled={busy}
                  onChange={(e) => assignUser(u.id, e.target.value)}
                >
                  <option value="">Sin grupo (solo lo suyo)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
