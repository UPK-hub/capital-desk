"use client";

import * as React from "react";
import { Field, Input } from "@/components/Field";

type Signatures = {
  coordinadorName: string;
  coordinadorRole: string;
  liderName: string;
  liderRole: string;
};

type UserOption = { id: string; name: string | null; jobTitle: string | null };

const EMPTY: Signatures = { coordinadorName: "", coordinadorRole: "", liderName: "", liderRole: "" };

export default function FirmasClient() {
  const [form, setForm] = React.useState<Signatures>(EMPTY);
  const [users, setUsers] = React.useState<UserOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/document-signatures", { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) {
          setMsg({ kind: "err", text: j?.error ?? "No se pudo cargar la configuración." });
        } else {
          setForm(j.signatures as Signatures);
          setUsers((j.users ?? []) as UserOption[]);
        }
      } catch {
        if (alive) setMsg({ kind: "err", text: "No se pudo cargar la configuración." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const set = (k: keyof Signatures) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setMsg(null);
  };

  const pickUser = (nameKey: keyof Signatures, roleKey: keyof Signatures) => (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const u = users.find((x) => x.id === e.target.value);
    if (!u) return;
    setForm((f) => ({
      ...f,
      [nameKey]: u.name ?? f[nameKey],
      [roleKey]: (u.jobTitle && u.jobTitle.trim()) || f[roleKey],
    }));
    setMsg(null);
    e.target.value = "";
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/document-signatures", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg({ kind: "err", text: j?.error ?? "No se pudo guardar." });
      } else {
        setForm(j.signatures as Signatures);
        setMsg({ kind: "ok", text: "Firmas actualizadas. Los documentos nuevos ya salen con estos nombres." });
      }
    } catch {
      setMsg({ kind: "err", text: "No se pudo guardar." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="sts-card p-6 text-sm text-muted-foreground">Cargando…</section>;
  }

  const bloque = (
    titulo: string,
    ayuda: string,
    nameKey: keyof Signatures,
    roleKey: keyof Signatures
  ) => (
    <section className="sts-card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold leading-tight">{titulo}</h2>
        <p className="text-sm text-muted-foreground">{ayuda}</p>
      </div>

      {users.length > 0 ? (
        <Field label="Elegir un usuario de Capital Desk" hint="opcional, llena el nombre">
          <select className="sts-select h-10 w-full rounded-md border border-border bg-card px-3 text-sm" defaultValue="" onChange={pickUser(nameKey, roleKey)}>
            <option value="">Escribir el nombre a mano…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? "(sin nombre)"}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre que aparece en la firma">
          <Input value={form[nameKey]} onChange={set(nameKey)} placeholder="Nombre y apellido" />
        </Field>
        <Field label="Cargo">
          <Input value={form[roleKey]} onChange={set(roleKey)} placeholder="Cargo" />
        </Field>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {bloque(
        "Segunda firma",
        "Normalmente el coordinador. En el certificado de preventivo esta firma la reemplaza el técnico que cerró el caso desde el bot, si lo hubo.",
        "coordinadorName",
        "coordinadorRole"
      )}
      {bloque("Tercera firma", "Normalmente el líder técnico.", "liderName", "liderRole")}

      {msg ? (
        <p className={"text-sm " + (msg.kind === "ok" ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="button" className="sts-btn-primary text-sm disabled:opacity-50" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar firmas"}
        </button>
        <span className="text-xs text-muted-foreground">
          Aplica a los documentos que se generen de ahora en adelante; los PDFs ya creados no cambian.
        </span>
      </div>
    </div>
  );
}
