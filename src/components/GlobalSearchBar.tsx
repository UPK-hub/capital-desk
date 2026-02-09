"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchItem = {
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export default function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setItems([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search/global?term=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("No se pudo buscar");
        const data = await res.json();
        setItems(data?.items ?? []);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const hasResults = items.length > 0;
  const showPanel = open && (hasResults || loading || error);

  const placeholder = useMemo(() => "Buscar casos, buses, OTs, STS, usuarios…", []);

  function handleSelect(item: SearchItem) {
    setOpen(false);
    setQuery("");
    setItems([]);
    router.push(item.href);
  }

  return (
    <div ref={wrapperRef} className="global-search">
      <div className="global-search__input">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
        />
      </div>

      {showPanel ? (
        <div className="global-search__panel">
          {loading ? <p className="global-search__hint">Buscando…</p> : null}
          {error ? <p className="global-search__hint text-red-500">{error}</p> : null}
          {!loading && !error && !hasResults ? (
            <p className="global-search__hint">Sin resultados.</p>
          ) : null}
          {hasResults ? (
            <div className="global-search__list">
              {items.map((item, idx) => (
                <button
                  key={`${item.href}-${idx}`}
                  type="button"
                  className="global-search__item"
                  onClick={() => handleSelect(item)}
                >
                  <div className="global-search__tag">{item.type}</div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">{item.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
