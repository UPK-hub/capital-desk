"use client";

import * as React from "react";

type ThemeMode = "light" | "dark" | "system";

type ThemePalette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  muted: string;
  mutedForeground: string;
  stsBg: string;
  stsAccent: string;
  stsAccent2: string;
};

type ThemeState = ThemePalette & {
  mode: ThemeMode;
  radius: string;
  fontSans: string;
  fontDisplay: string;
  backgroundDark: string;
  foregroundDark: string;
  cardDark: string;
  cardForegroundDark: string;
  primaryDark: string;
  primaryForegroundDark: string;
  borderDark: string;
  mutedDark: string;
  mutedForegroundDark: string;
  stsBgDark: string;
  stsAccentDark: string;
  stsAccent2Dark: string;
};

const defaults: ThemeState = {
  mode: "light",
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  card: "0 0% 100%",
  cardForeground: "222.2 84% 4.9%",
  primary: "222.2 47.4% 11.2%",
  primaryForeground: "210 40% 98%",
  border: "214.3 31.8% 91.4%",
  muted: "210 40% 96.1%",
  mutedForeground: "215.4 16.3% 46.9%",
  radius: "0.75rem",
  stsBg: "210 30% 97%",
  stsAccent: "171 66% 36%",
  stsAccent2: "207 73% 45%",
  backgroundDark: "222.2 84% 4.9%",
  foregroundDark: "210 40% 98%",
  cardDark: "222.2 84% 4.9%",
  cardForegroundDark: "210 40% 98%",
  primaryDark: "210 40% 98%",
  primaryForegroundDark: "222.2 47.4% 11.2%",
  borderDark: "217.2 32.6% 17.5%",
  mutedDark: "217.2 32.6% 17.5%",
  mutedForegroundDark: "215 20.2% 65.1%",
  stsBgDark: "222 40% 12%",
  stsAccentDark: "171 66% 36%",
  stsAccent2Dark: "207 73% 45%",
  fontSans: "var(--font-sans)",
  fontDisplay: "var(--font-display)",
};

const presets: Array<{ id: string; name: string; light: ThemePalette; dark: ThemePalette }> = [
  {
    id: "teal-sky",
    name: "Azul Pacifico",
    light: {
      background: "0 0% 100%",
      foreground: "222.2 84% 4.9%",
      card: "0 0% 100%",
      cardForeground: "222.2 84% 4.9%",
      primary: "218 64% 36%",
      primaryForeground: "210 40% 98%",
      border: "214 28% 88%",
      muted: "210 40% 96.1%",
      mutedForeground: "215.4 16.3% 46.9%",
      stsBg: "210 30% 97%",
      stsAccent: "214 68% 42%",
      stsAccent2: "199 88% 48%",
    },
    dark: {
      background: "222 47% 9%",
      foreground: "210 40% 98%",
      card: "222 47% 9%",
      cardForeground: "210 40% 98%",
      primary: "214 68% 42%",
      primaryForeground: "210 40% 98%",
      border: "217 26% 20%",
      muted: "217 26% 18%",
      mutedForeground: "215 20% 65%",
      stsBg: "222 47% 11%",
      stsAccent: "199 88% 48%",
      stsAccent2: "214 68% 42%",
    },
  },
  {
    id: "graphite-lime",
    name: "Grafito + Lima",
    light: {
      background: "0 0% 100%",
      foreground: "222.2 84% 4.9%",
      card: "0 0% 100%",
      cardForeground: "222.2 84% 4.9%",
      primary: "141 56% 32%",
      primaryForeground: "210 40% 98%",
      border: "214 28% 88%",
      muted: "210 40% 96.1%",
      mutedForeground: "215.4 16.3% 46.9%",
      stsBg: "210 30% 97%",
      stsAccent: "141 56% 32%",
      stsAccent2: "192 78% 40%",
    },
    dark: {
      background: "222 47% 8%",
      foreground: "210 40% 98%",
      card: "222 47% 8%",
      cardForeground: "210 40% 98%",
      primary: "141 56% 32%",
      primaryForeground: "210 40% 98%",
      border: "217 26% 20%",
      muted: "217 26% 18%",
      mutedForeground: "215 20% 65%",
      stsBg: "222 47% 10%",
      stsAccent: "141 56% 32%",
      stsAccent2: "192 78% 40%",
    },
  },
  {
    id: "blue-black",
    name: "Azul + Negro",
    light: {
      background: "0 0% 100%",
      foreground: "222.2 84% 4.9%",
      card: "0 0% 100%",
      cardForeground: "222.2 84% 4.9%",
      primary: "217 91% 60%",
      primaryForeground: "210 40% 98%",
      border: "214 28% 88%",
      muted: "210 40% 96.1%",
      mutedForeground: "215.4 16.3% 46.9%",
      stsBg: "210 30% 97%",
      stsAccent: "217 91% 60%",
      stsAccent2: "199 88% 48%",
    },
    dark: {
      background: "222 47% 6%",
      foreground: "210 40% 98%",
      card: "222 47% 8%",
      cardForeground: "210 40% 98%",
      primary: "217 91% 60%",
      primaryForeground: "210 40% 98%",
      border: "217 26% 18%",
      muted: "217 26% 14%",
      mutedForeground: "215 20% 70%",
      stsBg: "222 47% 9%",
      stsAccent: "217 91% 60%",
      stsAccent2: "199 88% 48%",
    },
  },
  {
    id: "amber-graphite",
    name: "Grafito + Ambar",
    light: {
      background: "0 0% 100%",
      foreground: "222.2 84% 4.9%",
      card: "0 0% 100%",
      cardForeground: "222.2 84% 4.9%",
      primary: "38 92% 50%",
      primaryForeground: "210 40% 98%",
      border: "214 28% 88%",
      muted: "210 40% 96.1%",
      mutedForeground: "215.4 16.3% 46.9%",
      stsBg: "210 30% 97%",
      stsAccent: "38 92% 50%",
      stsAccent2: "200 98% 39%",
    },
    dark: {
      background: "222 47% 8%",
      foreground: "210 40% 98%",
      card: "222 47% 10%",
      cardForeground: "210 40% 98%",
      primary: "38 92% 50%",
      primaryForeground: "210 40% 98%",
      border: "217 26% 20%",
      muted: "217 26% 16%",
      mutedForeground: "215 20% 65%",
      stsBg: "222 47% 12%",
      stsAccent: "38 92% 50%",
      stsAccent2: "200 98% 39%",
    },
  },
];

const colorFields: Array<{ key: keyof ThemePalette; label: string }> = [
  { key: "background", label: "Fondo" },
  { key: "foreground", label: "Texto principal" },
  { key: "card", label: "Tarjeta" },
  { key: "cardForeground", label: "Texto tarjeta" },
  { key: "primary", label: "Primario" },
  { key: "primaryForeground", label: "Texto primario" },
  { key: "border", label: "Bordes" },
  { key: "muted", label: "Muted" },
  { key: "mutedForeground", label: "Texto muted" },
  { key: "stsBg", label: "Fondo STS" },
  { key: "stsAccent", label: "Acento STS" },
  { key: "stsAccent2", label: "Acento STS 2" },
];

const fontOptions = [
  { label: "Manrope (base)", value: "var(--font-sans)" },
  { label: "Sora (display)", value: "var(--font-display)" },
  { label: "Sistema", value: "ui-sans-serif, system-ui, sans-serif" },
];

function hslStringToHex(hsl: string) {
  const nums = hsl.match(/-?\d+\.?\d*/g);
  if (!nums || nums.length < 3) return "#000000";
  const h = Number(nums[0]);
  const s = Number(nums[1]);
  const l = Number(nums[2]);
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number) {
  const sN = Math.max(0, Math.min(100, s)) / 100;
  const lN = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "0 0% 0%";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hex = hslStringToHex(value);
  return (
    <div className="flex items-center justify-between gap-3 sts-card p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
      </div>
      <input
        type="color"
        className="h-10 w-10 cursor-pointer rounded-md border border-zinc-200 bg-white"
        value={hex}
        onChange={(e) => onChange(hexToHsl(e.target.value))}
      />
    </div>
  );
}

function PreviewCard({ palette, title }: { palette: ThemePalette; title: string }) {
  return (
    <div
      className="rounded-2xl border border-zinc-200/70 p-4 text-sm shadow-sm"
      style={
        {
          background: `hsl(${palette.background})`,
          color: `hsl(${palette.foreground})`,
          borderColor: `hsl(${palette.border})`,
        } as React.CSSProperties
      }
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div
        className="mt-3 rounded-xl border px-3 py-2"
        style={
          {
            background: `hsl(${palette.card})`,
            borderColor: `hsl(${palette.border})`,
          } as React.CSSProperties
        }
      >
        <p className="text-sm font-semibold">Ticket STS #1845</p>
        <p className="text-xs" style={{ color: `hsl(${palette.mutedForeground})` }}>
          SLA en curso
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              background: `hsl(${palette.stsAccent})`,
              color: `hsl(${palette.primaryForeground})`,
            }}
          >
            Acento
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs"
            style={{
              background: `hsl(${palette.stsAccent2})`,
              color: `hsl(${palette.primaryForeground})`,
            }}
          >
            Secundario
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniDashboardPreview({ palette }: { palette: ThemePalette }) {
  return (
    <div
      className="rounded-2xl border border-zinc-200/70 p-4 text-sm shadow-sm"
      style={
        {
          background: `hsl(${palette.background})`,
          color: `hsl(${palette.foreground})`,
          borderColor: `hsl(${palette.border})`,
        } as React.CSSProperties
      }
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Mini dashboard</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {[["Tickets", "32"], ["SLA OK", "94%"]].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border px-3 py-3"
            style={{ borderColor: `hsl(${palette.border})`, background: `hsl(${palette.card})` }}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div
        className="mt-3 rounded-xl border"
        style={{ borderColor: `hsl(${palette.border})`, background: `hsl(${palette.card})` }}
      >
        <div className="grid grid-cols-3 text-xs uppercase tracking-wide text-muted-foreground">
          <div className="px-3 py-2">Caso</div>
          <div className="px-3 py-2">Estado</div>
          <div className="px-3 py-2">SLA</div>
        </div>
        <div className="grid grid-cols-3 border-t text-xs" style={{ borderColor: `hsl(${palette.border})` }}>
          <div className="px-3 py-2">K1411</div>
          <div className="px-3 py-2">OT</div>
          <div className="px-3 py-2">OK</div>
        </div>
      </div>
    </div>
  );
}

export default function ThemeAdminClient() {
  const [state, setState] = React.useState<ThemeState>(defaults);
  const [activeTab, setActiveTab] = React.useState<ThemeMode>("light");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/theme", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo cargar el tema");
      return;
    }
    if (data?.theme) setState(data.theme as ThemeState);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/admin/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo guardar");
      return;
    }
    setMsg("Tema actualizado.");
    await load();
  }

  function update<K extends keyof ThemeState>(key: K, value: ThemeState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function resetDefaults() {
    setState(defaults);
    setActiveTab("light");
  }

  function applyPreset(preset: (typeof presets)[number]) {
    setState((prev) => ({
      ...prev,
      ...preset.light,
      backgroundDark: preset.dark.background,
      foregroundDark: preset.dark.foreground,
      cardDark: preset.dark.card,
      cardForegroundDark: preset.dark.cardForeground,
      primaryDark: preset.dark.primary,
      primaryForegroundDark: preset.dark.primaryForeground,
      borderDark: preset.dark.border,
      mutedDark: preset.dark.muted,
      mutedForegroundDark: preset.dark.mutedForeground,
      stsBgDark: preset.dark.stsBg,
      stsAccentDark: preset.dark.stsAccent,
      stsAccent2Dark: preset.dark.stsAccent2,
    }));
    setActiveTab("light");
  }

  const lightPalette: ThemePalette = {
    background: state.background,
    foreground: state.foreground,
    card: state.card,
    cardForeground: state.cardForeground,
    primary: state.primary,
    primaryForeground: state.primaryForeground,
    border: state.border,
    muted: state.muted,
    mutedForeground: state.mutedForeground,
    stsBg: state.stsBg,
    stsAccent: state.stsAccent,
    stsAccent2: state.stsAccent2,
  };

  const darkPalette: ThemePalette = {
    background: state.backgroundDark,
    foreground: state.foregroundDark,
    card: state.cardDark,
    cardForeground: state.cardForegroundDark,
    primary: state.primaryDark,
    primaryForeground: state.primaryForegroundDark,
    border: state.borderDark,
    muted: state.mutedDark,
    mutedForeground: state.mutedForegroundDark,
    stsBg: state.stsBgDark,
    stsAccent: state.stsAccentDark,
    stsAccent2: state.stsAccent2Dark,
  };

  const palette = activeTab === "dark" ? darkPalette : lightPalette;

  return (
    <section className="sts-card p-5 space-y-5">
      {error ? <div className="sts-card p-3 text-sm text-red-600">{error}</div> : null}
      {msg ? <div className="sts-card p-3 text-sm">{msg}</div> : null}

      <div className="space-y-3">
        <p className="text-sm font-semibold">Temas precargados</p>
        <div className="grid gap-3 md:grid-cols-2">
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="sts-card p-4 text-left hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{preset.name}</p>
                  <p className="text-xs text-muted-foreground">Incluye light/dark</p>
                </div>
                <div className="flex items-center gap-2">
                  {[preset.light.stsAccent, preset.light.stsAccent2, preset.light.primary].map((c, idx) => (
                    <span
                      key={`${preset.id}-${idx}`}
                      className="h-5 w-5 rounded-full border border-white shadow"
                      style={{ background: `hsl(${c})` }}
                    />
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`sts-btn-ghost text-sm ${activeTab === "light" ? "border-zinc-400 text-zinc-900" : ""}`}
            onClick={() => setActiveTab("light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`sts-btn-ghost text-sm ${activeTab === "dark" ? "border-zinc-400 text-zinc-900" : ""}`}
            onClick={() => setActiveTab("dark")}
          >
            Dark
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Modo aplicado:</span>
          <button
            type="button"
            className={`sts-btn-ghost text-xs ${state.mode === "light" ? "border-zinc-400 text-zinc-900" : ""}`}
            onClick={() => update("mode", "light")}
          >
            Light
          </button>
          <button
            type="button"
            className={`sts-btn-ghost text-xs ${state.mode === "dark" ? "border-zinc-400 text-zinc-900" : ""}`}
            onClick={() => update("mode", "dark")}
          >
            Dark
          </button>
          <button
            type="button"
            className={`sts-btn-ghost text-xs ${state.mode === "system" ? "border-zinc-400 text-zinc-900" : ""}`}
            onClick={() => update("mode", "system")}
          >
            Sistema
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-3 md:grid-cols-2">
          {colorFields.map((field) => {
            const value =
              activeTab === "dark"
                ? (state[`${field.key}Dark` as keyof ThemeState] as string)
                : (state[field.key] as string);
            return (
              <ColorField
                key={`${activeTab}-${field.key}`}
                label={field.label}
                value={value}
                onChange={(next) => {
                  const key = activeTab === "dark" ? (`${field.key}Dark` as keyof ThemeState) : field.key;
                  update(key, next as ThemeState[keyof ThemeState]);
                }}
              />
            );
          })}
        </div>

        <div className="space-y-4">
          <PreviewCard palette={palette} title="Vista previa" />

          <MiniDashboardPreview palette={palette} />

          <div
            className="sts-card p-4 space-y-3"
            style={
              {
                background: `hsl(${palette.card})`,
                color: `hsl(${palette.foreground})`,
                borderColor: `hsl(${palette.border})`,
                fontFamily: state.fontSans,
              } as React.CSSProperties
            }
          >
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tipografia</p>
              <p className="text-lg font-semibold" style={{ fontFamily: state.fontDisplay }}>
                Panel de control
              </p>
              <p className="text-sm text-muted-foreground">Texto secundario y detalles de soporte.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-medium text-white"
                style={{ background: `hsl(${palette.stsAccent})` }}
              >
                Primario
              </button>
              <button
                type="button"
                className="rounded-full border px-4 py-2 text-sm font-medium"
                style={{ borderColor: `hsl(${palette.border})` }}
              >
                Secundario
              </button>
              <span
                className="rounded-full px-3 py-1 text-xs"
                style={{ background: `hsl(${palette.stsAccent2})`, color: `hsl(${palette.primaryForeground})` }}
              >
                Chip
              </span>
            </div>
          </div>

          <div className="sts-card p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Radio de tarjetas</label>
              <input
                type="range"
                min={0.5}
                max={1.25}
                step={0.05}
                value={parseFloat(state.radius)}
                onChange={(e) => update("radius", `${Number(e.target.value).toFixed(2)}rem`)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">{state.radius}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">Fuente base</label>
                <select
                  className="h-9 w-full rounded-md border px-2 text-sm"
                  value={state.fontSans}
                  onChange={(e) => update("fontSans", e.target.value)}
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Fuente display</label>
                <select
                  className="h-9 w-full rounded-md border px-2 text-sm"
                  value={state.fontDisplay}
                  onChange={(e) => update("fontDisplay", e.target.value)}
                >
                  {fontOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="sts-btn-ghost text-sm" type="button" onClick={resetDefaults}>
          Restaurar default
        </button>
        <button className="sts-btn-primary text-sm disabled:opacity-50" onClick={save} disabled={saving || loading}>
          {saving ? "Guardando..." : "Guardar tema"}
        </button>
      </div>
    </section>
  );
}
