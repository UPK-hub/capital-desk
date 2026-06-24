"use client";

import * as React from "react";
import {
  Plus,
  X,
  Trash2,
  Folder,
  Video,
  Wrench,
  Activity,
  Users,
  ShieldCheck,
  AtSign,
  Link2,
  Pencil,
  Check,
  KeyRound,
} from "lucide-react";

type Team = {
  id: string;
  name: string;
  domains: string[];
  adminUserIds: string[];
  viewCases: boolean;
  viewVideoRequests: boolean;
  viewWorkOrders: boolean;
  viewTelemetry: boolean;
  manageUsers: boolean;
};

type UserRow = { id: string; name: string; email: string; role: string; active: boolean };

type PermKey = "viewCases" | "viewVideoRequests" | "viewWorkOrders" | "viewTelemetry" | "manageUsers";

const PERMS: { key: PermKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "viewCases", label: "Casos del equipo", icon: Folder },
  { key: "viewVideoRequests", label: "Solicitudes de video", icon: Video },
  { key: "viewWorkOrders", label: "Órdenes de trabajo / reportes", icon: Wrench },
  { key: "viewTelemetry", label: "Telemetría del equipo", icon: Activity },
  { key: "manageUsers", label: "Gestionar usuarios del equipo", icon: Users },
];

function domainOf(email: string) {
  return String(email).split("@")[1]?.toLowerCase() ?? "";
}

function initials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "··";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    ADMIN: "Administrador",
    BACKOFFICE: "Backoffice",
    TECHNICIAN: "Técnico",
    PLANNER: "Planner",
    SUPERVISOR: "Supervisor",
    HELPDESK: "Helpdesk",
    AUDITOR: "Auditor",
  };
  return map[role] ?? role;
}

function Switch({ on, onClick, disabled }: { on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={on}
      disabled={disabled}
      className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition ${on ? "bg-blue-600" : "bg-slate-300"} ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${
          on ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

const emptyForm = {
  name: "",
  domainInput: "",
  domains: [] as string[],
  adminIds: [] as string[],
  perms: {
    viewCases: true,
    viewVideoRequests: true,
    viewWorkOrders: true,
    viewTelemetry: false,
    manageUsers: true,
  } as Record<PermKey, boolean>,
};

type EditForm = { name: string; domainInput: string; domains: string[]; adminIds: string[] };
type ResetState = { status: "idle" | "sending" | "sent" | "error"; msg?: string };

export default function TeamsClient({
  initialTeams,
  users,
  viewerIsAdmin,
  resettableUserIds,
}: {
  initialTeams: Team[];
  users: UserRow[];
  viewerIsAdmin: boolean;
  resettableUserIds: string[];
}) {
  const [teams, setTeams] = React.useState<Team[]>(initialTeams);
  const [form, setForm] = React.useState(emptyForm);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState<EditForm>({ name: "", domainInput: "", domains: [], adminIds: [] });
  const [reset, setReset] = React.useState<Record<string, ResetState>>({});

  const usersById = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const resettable = React.useMemo(() => new Set(resettableUserIds), [resettableUserIds]);

  function membersOfDomains(domains: string[]) {
    return users.filter((u) => domains.includes(domainOf(u.email)));
  }
  function teamOf(email: string) {
    const d = domainOf(email);
    return teams.find((t) => t.domains.includes(d)) ?? null;
  }

  const adminCount = new Set(teams.flatMap((t) => t.adminUserIds)).size;
  const withoutTeam = users.filter((u) => !teamOf(u.email)).length;

  // ---------- crear ----------
  function addDomain() {
    const d = form.domainInput.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (form.domains.includes(d)) {
      setForm((f) => ({ ...f, domainInput: "" }));
      return;
    }
    setForm((f) => ({ ...f, domains: [...f.domains, d], domainInput: "" }));
  }
  const eligibleCreate = users.filter((u) => form.domains.includes(domainOf(u.email)));

  async function createTeam() {
    const name = form.name.trim();
    if (!name) return setError("Ponle un nombre al equipo.");
    if (form.domains.length === 0) return setError("Agrega al menos un dominio.");
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domains: form.domains, adminUserIds: form.adminIds, ...form.perms }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo crear el equipo");
      setTeams((p) => [...p, data.team as Team].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(emptyForm);
      setMsg("Equipo creado.");
    } catch (e: any) {
      setError(e?.message ?? "No se pudo crear el equipo");
    } finally {
      setBusy(false);
    }
  }

  // ---------- editar / permisos / eliminar ----------
  async function patchTeam(id: string, patch: Partial<Team>) {
    setTeams((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await fetch(`/api/admin/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  function startEdit(t: Team) {
    setEditingId(t.id);
    setEditForm({ name: t.name, domainInput: "", domains: [...t.domains], adminIds: [...t.adminUserIds] });
  }
  function addEditDomain() {
    const d = editForm.domainInput.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (editForm.domains.includes(d)) return setEditForm((f) => ({ ...f, domainInput: "" }));
    setEditForm((f) => ({ ...f, domains: [...f.domains, d], domainInput: "" }));
  }
  async function saveEdit(id: string) {
    const name = editForm.name.trim();
    if (!name) return;
    const patch = { name, domains: editForm.domains, adminUserIds: editForm.adminIds };
    setTeams((p) =>
      p.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
    await fetch(`/api/admin/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }

  async function deleteTeam(id: string) {
    if (!window.confirm("¿Eliminar este equipo? Los usuarios no se borran, solo dejan de estar agrupados.")) return;
    setTeams((p) => p.filter((t) => t.id !== id));
    await fetch(`/api/admin/teams/${id}`, { method: "DELETE" }).catch(() => {});
  }

  // ---------- reset de contraseña ----------
  async function resetPassword(u: UserRow) {
    if (!window.confirm(`Enviar un correo de restablecimiento de contraseña a ${u.name || u.email}?`)) return;
    setReset((r) => ({ ...r, [u.id]: { status: "sending" } }));
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo enviar");
      setReset((r) => ({ ...r, [u.id]: { status: "sent", msg: "Correo enviado" } }));
    } catch (e: any) {
      setReset((r) => ({ ...r, [u.id]: { status: "error", msg: e?.message ?? "Error" } }));
    }
  }

  const editEligible = membersOfDomains(editForm.domains);

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Usuarios", value: users.length },
          { label: "Equipos", value: teams.length },
          { label: "Administradores", value: adminCount },
          { label: "Sin equipo", value: withoutTeam, warn: true },
        ].map((s) => (
          <div key={s.label} className="sts-card p-3.5">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.warn && s.value > 0 ? "text-amber-600" : ""}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div
        className={`grid items-start gap-5 ${
          viewerIsAdmin ? "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" : "grid-cols-1"
        }`}
      >
        {/* Columna principal */}
        <div className="min-w-0 space-y-5">
          {/* Equipos */}
          <div>
            <p className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <Users className="h-4 w-4 text-blue-600" /> {viewerIsAdmin ? "Equipos por dominio" : "Tu equipo"}
            </p>

            {teams.length === 0 ? (
              <div className="sts-card p-5 text-sm text-muted-foreground">
                {viewerIsAdmin ? "Aún no hay equipos. Crea el primero en el panel de la derecha." : "No administras ningún equipo."}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {teams.map((t) => {
                  const members = membersOfDomains(t.domains);
                  const admins = t.adminUserIds.map((id) => usersById.get(id)).filter(Boolean) as UserRow[];
                  const isEditing = editingId === t.id;

                  if (isEditing && viewerIsAdmin) {
                    return (
                      <div key={t.id} className="sts-card p-4">
                        <input
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          className="app-field-control mb-2 h-9 w-full rounded-lg px-3 text-sm"
                          placeholder="Nombre del equipo"
                        />
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {editForm.domains.map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-700"
                            >
                              {d}
                              <button
                                type="button"
                                onClick={() =>
                                  setEditForm((f) => ({ ...f, domains: f.domains.filter((x) => x !== d) }))
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="mb-2 flex gap-2">
                          <input
                            value={editForm.domainInput}
                            onChange={(e) => setEditForm((f) => ({ ...f, domainInput: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addEditDomain();
                              }
                            }}
                            placeholder="agregar dominio…"
                            className="app-field-control h-8 w-full rounded-lg px-2.5 text-[12px]"
                          />
                          <button type="button" onClick={addEditDomain} className="sts-btn-ghost h-8 shrink-0 px-2.5">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Administradores
                        </p>
                        <div className="mb-3 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                          {editEligible.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Agrega dominios para ver usuarios.</p>
                          ) : (
                            editEligible.map((u) => {
                              const checked = editForm.adminIds.includes(u.id);
                              return (
                                <label key={u.id} className="flex cursor-pointer items-center gap-2 text-[12px]">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setEditForm((f) => ({
                                        ...f,
                                        adminIds: checked
                                          ? f.adminIds.filter((x) => x !== u.id)
                                          : [...f.adminIds, u.id],
                                      }))
                                    }
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="truncate text-slate-700">{u.name}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => saveEdit(t.id)} className="sts-btn-primary h-8 flex-1 text-[12px]">
                            <Check className="mr-1 inline h-3.5 w-3.5" /> Guardar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="sts-btn-ghost h-8 px-3 text-[12px]">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={t.id} className="sts-card p-4">
                      <div className="mb-2.5 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-800">{t.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {members.length} usuarios · {admins.length} admin{admins.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        {viewerIsAdmin ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEdit(t)}
                              className="text-slate-300 transition hover:text-blue-600"
                              title="Editar equipo"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTeam(t.id)}
                              className="text-slate-300 transition hover:text-red-600"
                              title="Eliminar equipo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {t.domains.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                          >
                            <AtSign className="h-2.5 w-2.5" />
                            {d}
                          </span>
                        ))}
                        {t.domains.length > 1 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <Link2 className="h-2.5 w-2.5" /> {t.domains.length} dominios
                          </span>
                        ) : null}
                      </div>

                      <div className="border-t border-border/50 pt-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          El admin puede ver
                        </p>
                        <div className="flex flex-col gap-2">
                          {PERMS.map((p) => (
                            <div key={p.key} className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
                              <span className="inline-flex items-center gap-1.5">
                                <p.icon className="h-3.5 w-3.5 text-slate-400" /> {p.label}
                              </span>
                              <Switch
                                on={t[p.key]}
                                disabled={!viewerIsAdmin}
                                onClick={() => patchTeam(t.id, { [p.key]: !t[p.key] } as Partial<Team>)}
                              />
                            </div>
                          ))}
                        </div>
                        {admins.length > 0 ? (
                          <div className="mt-3 flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Admins:</span>
                            {admins.slice(0, 4).map((a) => (
                              <span
                                key={a.id}
                                title={a.name}
                                className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/10 text-[8px] font-semibold text-blue-700"
                              >
                                {initials(a.name)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Usuarios */}
          <div className="sts-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3">
              <span className="text-[13px] font-semibold text-slate-700">Usuarios</span>
              <span className="text-[11px] text-muted-foreground">{users.length} en total</span>
            </div>
            <div className="divide-y divide-border/40">
              {users.map((u) => {
                const team = teamOf(u.email);
                const isAdmin = team?.adminUserIds.includes(u.id);
                const canReset = resettable.has(u.id);
                const rs = reset[u.id];
                return (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                      {initials(u.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-slate-800">
                        {u.name || "—"}
                        {isAdmin ? (
                          <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50 px-1.5 py-0.5 align-middle text-[9px] font-medium text-blue-700">
                            <ShieldCheck className="h-2.5 w-2.5" /> admin equipo
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[10.5px] text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="hidden w-32 shrink-0 md:block">
                      {team ? (
                        <span className="truncate text-[11px] text-slate-600">{team.name}</span>
                      ) : (
                        <span className="text-[11px] text-amber-600">Sin equipo</span>
                      )}
                    </div>
                    <span className="hidden w-20 shrink-0 text-[11px] text-slate-500 sm:block">{roleLabel(u.role)}</span>
                    <div className="w-[150px] shrink-0 text-right">
                      {rs?.status === "sent" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                          <Check className="h-3 w-3" /> Correo enviado
                        </span>
                      ) : rs?.status === "error" ? (
                        <span className="text-[11px] text-red-600">{rs.msg}</span>
                      ) : canReset ? (
                        <button
                          type="button"
                          onClick={() => resetPassword(u)}
                          disabled={rs?.status === "sending"}
                          className="inline-flex items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                          title="Enviar correo de restablecimiento de contraseña"
                        >
                          <KeyRound className="h-3 w-3" />
                          {rs?.status === "sending" ? "Enviando…" : "Resetear clave"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel crear equipo — solo ADMIN global */}
        {viewerIsAdmin ? (
          <div className="sts-card p-4 lg:p-5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <Users className="h-4 w-4 text-blue-600" /> Crear equipo por dominio
            </p>
            <p className="mb-3 mt-1 text-[11px] text-muted-foreground">
              Los usuarios se agrupan automáticamente según el dominio de su correo. Un equipo puede tener varios dominios.
            </p>

            <label className="text-[11px] font-semibold text-slate-600">Nombre del equipo</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: UpKeep Services · UPK"
              className="app-field-control mb-3 mt-1.5 h-9 w-full rounded-lg px-3 text-sm"
            />

            <label className="text-[11px] font-semibold text-slate-600">Dominios del equipo</label>
            <div className="mb-1.5 mt-1.5 flex flex-wrap gap-1.5">
              {form.domains.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[10.5px] font-medium text-blue-700"
                >
                  {d}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, domains: f.domains.filter((x) => x !== d) }))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={form.domainInput}
                onChange={(e) => setForm((f) => ({ ...f, domainInput: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="agregar dominio…"
                className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
              />
              <button type="button" onClick={addDomain} className="sts-btn-ghost h-9 shrink-0 px-3 text-sm">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.domains.length > 1 ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-emerald-600">
                <Link2 className="h-3 w-3" /> Los {form.domains.length} dominios comparten este equipo.
              </p>
            ) : null}

            <label className="mt-4 block text-[11px] font-semibold text-slate-600">Administradores del equipo</label>
            {eligibleCreate.length === 0 ? (
              <p className="mt-1.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
                Agrega dominios para ver los usuarios elegibles.
              </p>
            ) : (
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                {eligibleCreate.map((u) => {
                  const checked = form.adminIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            adminIds: checked ? f.adminIds.filter((x) => x !== u.id) : [...f.adminIds, u.id],
                          }))
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate text-slate-700">{u.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{roleLabel(u.role)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <label className="mt-4 block text-[11px] font-semibold text-slate-600">Permisos de visualización del admin</label>
            <div className="mt-2 flex flex-col gap-2.5 rounded-lg border border-border/50 bg-muted/20 p-3">
              {PERMS.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-2 text-[11.5px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <p.icon className="h-3.5 w-3.5 text-slate-400" /> {p.label}
                  </span>
                  <Switch
                    on={form.perms[p.key]}
                    onClick={() => setForm((f) => ({ ...f, perms: { ...f.perms, [p.key]: !f.perms[p.key] } }))}
                  />
                </div>
              ))}
            </div>

            {error ? <p className="mt-3 text-[11px] text-red-600">{error}</p> : null}
            {msg ? <p className="mt-3 text-[11px] text-emerald-600">{msg}</p> : null}

            <button type="button" onClick={createTeam} disabled={busy} className="sts-btn-primary mt-3 w-full text-sm disabled:opacity-60">
              {busy ? "Creando…" : "Crear equipo"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
