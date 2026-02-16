"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  meta: any;
  readAt: string | null;
  createdAt: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function inferHref(n: NotificationItem): string | null {
  // Preferimos meta.href (si existe)
  const href = n.meta?.href;
  if (typeof href === "string" && href.startsWith("/")) return href;

  // Fallback: si viene caseId/workOrderId
  if (n.meta?.workOrderId) return `/work-orders/${n.meta.workOrderId}`;
  if (n.meta?.caseId) return `/cases/${n.meta.caseId}`;

  return null;
}

export default function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const unreadRef = useRef(0);
  const firstLoadRef = useRef(true);
  const canPlaySoundRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollRef = useRef<number | null>(null);

  function playNotificationSound() {
    if (typeof window === "undefined" || !canPlaySoundRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!audioContextRef.current) audioContextRef.current = new Ctx();
      const ctx = audioContextRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => null);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // no-op
    }
  }

  async function load(opts?: { silent?: boolean }) {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?take=25", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      const nextUnread = Number(data.unreadCount ?? 0);
      const prevUnread = unreadRef.current;
      setUnreadCount(nextUnread);
      unreadRef.current = nextUnread;

      if (!opts?.silent && !firstLoadRef.current && nextUnread > prevUnread) {
        playNotificationSound();
      }
      if (firstLoadRef.current) firstLoadRef.current = false;
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => null);
    // refrescamos el badge/lista
    await load();
    // refresca server components si aplica
    router.refresh();
  }

  // Cargar al montar y cuando cambie ruta (para mantener badge actualizado)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function unlockAudio() {
      canPlaySoundRef.current = true;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => null);
      }
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    }

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    async function tick() {
      await load({ silent: false });
    }

    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(tick, 15000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasItems = items.length > 0;

  const badge = useMemo(() => {
    if (unreadCount <= 0) return null;
    return (
      <span className="notifications__badge">
        <span className="sr-only">{unreadCount} notificaciones sin leer</span>
      </span>
    );
  }, [unreadCount]);

  return (
    <div className="notifications">
      <motion.button
        type="button"
        onClick={async () => {
          canPlaySoundRef.current = true;
          const next = !open;
          setOpen(next);
          if (next) await load();
        }}
        className="app-pill notifications__trigger"
        aria-label="Notificaciones"
        title="Notificaciones"
        whileHover={{ y: -1, scale: 1.02 }}
        whileTap={{ y: 0, scale: 0.98 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-foreground/90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 17H5l1.4-1.4A2 2 0 0 0 7 14.2V11a5 5 0 1 1 10 0v3.2a2 2 0 0 0 .6 1.4L19 17h-4" />
          <path d="M10 17a2 2 0 0 0 4 0" />
        </svg>
        {badge}
      </motion.button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="notifications__panel"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="notifications__header">
              <div>
                <p className="text-sm font-semibold">Notificaciones</p>
                <p className="text-xs text-muted-foreground">
                  {loading ? "Cargando…" : `${unreadCount} sin leer`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="sts-btn-ghost text-xs"
              >
                Cerrar
              </button>
            </div>

            <div className="notifications__list">
              {!hasItems ? (
                <div className="notifications__empty">No hay notificaciones.</div>
              ) : (
                <AnimatePresence initial={false}>
                  {items.map((n) => {
                    const href = inferHref(n);
                    const isUnread = !n.readAt;

                    return (
                      <motion.div
                        key={n.id}
                        className="notifications__item"
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <div className={`notifications__item-content ${isUnread ? "notifications__item-content--unread" : ""}`}>
                          <div className="notifications__item-meta">
                              <p className={`notifications__item-title ${isUnread ? "font-semibold" : "font-medium"}`}>
                                {n.title}
                              </p>
                              {n.body ? (
                                <p className="notifications__item-body">
                                  {n.body}
                                </p>
                              ) : null}
                              <p className="notifications__item-date">{fmtDate(n.createdAt)}</p>
                            </div>

                            <div className="notifications__item-actions">
                              {isUnread ? (
                                <button
                                  type="button"
                                  onClick={() => markRead(n.id)}
                                  className="sts-btn-ghost text-xs"
                                >
                                  Marcar leída
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Leída</span>
                              )}

                              {href ? (
                                <Link
                                  href={href}
                                  onClick={() => setOpen(false)}
                                  className="notifications__item-link"
                                >
                                  Abrir
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>

            <div className="notifications__footer">
              <button
                type="button"
                className="sts-btn-primary text-sm"
                onClick={async () => {
                  await load();
                  router.refresh();
                }}
              >
                Actualizar
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
