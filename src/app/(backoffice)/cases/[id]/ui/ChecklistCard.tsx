"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type Item = { id: string; text: string; done: boolean };

export default function ChecklistCard({ caseId, initial }: { caseId: string; initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  async function add() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/cases/${caseId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.item) {
        setItems((p) => [...p, { id: d.item.id, text: d.item.text, done: d.item.done }]);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  function toggle(it: Item) {
    const nd = !it.done;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, done: nd } : x)));
    fetch(`/api/cases/${caseId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: it.id, done: nd }),
    }).catch(() => {});
  }

  function remove(it: Item) {
    setItems((p) => p.filter((x) => x.id !== it.id));
    fetch(`/api/cases/${caseId}/checklist`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: it.id }),
    }).catch(() => {});
  }

  return (
    <section className="sts-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-3 lg:px-5">
        <h2 className="text-[13px] font-semibold text-slate-700">Checklist de diagnóstico</h2>
        <span className="text-[11px] text-muted-foreground">
          {done}/{items.length}
        </span>
      </div>
      <div className="space-y-3 p-4 lg:p-5">
        {items.length ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        ) : null}

        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="group flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => toggle(it)}
                className="h-4 w-4 shrink-0 rounded"
              />
              <span className={`flex-1 text-sm ${it.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                {it.text}
              </span>
              <button
                type="button"
                onClick={() => remove(it)}
                className="text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                title="Quitar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {items.length === 0 ? <p className="text-sm text-muted-foreground">Sin pasos aún.</p> : null}
        </div>

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Agregar paso…"
            className="app-field-control h-9 w-full rounded-lg px-3 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !text.trim()}
            className="sts-btn-primary h-9 shrink-0 px-3 text-sm disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
