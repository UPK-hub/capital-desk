"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, CheckCircle2, Clock3, FileText, X } from "lucide-react";
import { eases, listItem, scaleIn, staggerContainer } from "@/lib/animations";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  meta: unknown;
  readAt: string | null;
  createdAt: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstString(meta: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function inferHref(n: NotificationItem): string | null {
  const meta = asRecord(n.meta);
  const href = firstString(meta, ["href"]);
  if (typeof href === "string" && href.startsWith("/")) return href;

  const workOrderId = firstString(meta, ["workOrderId", "generatedWorkOrderId"]);
  if (workOrderId) return `/work-orders/${workOrderId}`;

  const caseId = firstString(meta, ["caseId", "correctiveCaseId", "noveltyCaseId", "sourceCaseId"]);
  if (caseId) return `/cases/${caseId}`;

  const videoRequestId = firstString(meta, ["requestId", "videoRequestId"]);
  if (videoRequestId) return `/video-requests/${videoRequestId}`;

  const stsTicketId = firstString(meta, ["stsTicketId", "ticketId"]);
  if (stsTicketId) return `/sts/tickets/${stsTicketId}`;

  const busId = firstString(meta, ["busId"]);
  if (busId) return `/buses/${busId}`;

  if (firstString(meta, ["batchRef"])) return "/novedades";

  const type = String(n.type ?? "").toUpperCase();
  if (type.startsWith("VIDEO_REQUEST")) return "/video-requests";
  if (type.startsWith("WO_")) return "/work-orders";
  if (type.startsWith("CASE_")) return "/cases";
  return null;
}

function iconForNotification(item: NotificationItem) {
  const probe = `${item.type ?? ""} ${item.title ?? ""}`.toLowerCase();

  if (probe.includes("finaliz")) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-600">
        <CheckCircle2 className="h-5 w-5" />
      </span>
    );
  }
  if (probe.includes("inici")) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
        <Clock3 className="h-5 w-5" />
      </span>
    );
  }
  if (probe.includes("novedad")) {
    return (
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
        <Bell className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
      <FileText className="h-5 w-5" />
    </span>
  );
}

export function NotificationsPanel({
  onClose,
  onUnreadChange,
}: {
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingIds, setMarkingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const updateUnread = (nextItems: NotificationItem[]) => {
    onUnreadChange?.(nextItems.filter((item) => !item.readAt).length);
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?take=25", { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json().catch(() => ({}));
      const list = Array.isArray(payload?.items) ? payload.items : [];
      setItems(list);
      onUnreadChange?.(Number(payload?.unreadCount ?? list.filter((item: any) => !item.readAt).length));
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string, opts?: { skipRefresh?: boolean }) {
    const current = items.find((item) => item.id === id);
    if (!current || current.readAt) return;
    if (markingIds.includes(id)) return;

    const nowIso = new Date().toISOString();
    const optimistic = items.map((item) => (item.id === id ? { ...item, readAt: nowIso } : item));
    setItems(optimistic);
    updateUnread(optimistic);
    setMarkingIds((prev) => [...prev, id]);

    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      if (!res.ok) throw new Error("NO_READ");
      if (!opts?.skipRefresh) router.refresh();
    } catch {
      await load();
    } finally {
      setMarkingIds((prev) => prev.filter((value) => value !== id));
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    const unreadIds = items.filter((item) => !item.readAt).map((item) => item.id);
    if (!unreadIds.length) return;

    setMarkingAll(true);
    const nowIso = new Date().toISOString();
    const optimistic = items.map((item) => ({ ...item, readAt: item.readAt ?? nowIso }));
    setItems(optimistic);
    updateUnread(optimistic);

    try {
      await Promise.all(
        unreadIds.map(async (id) => {
          await fetch(`/api/notifications/${id}/read`, { method: "POST" });
        })
      );
      router.refresh();
    } catch {
      await load();
    } finally {
      setMarkingAll(false);
    }
  }

  async function openNotification(item: NotificationItem) {
    if (!item.readAt) {
      await markRead(item.id, { skipRefresh: true });
    }
    const href = inferHref(item);
    onClose();
    if (href) {
      router.push(href);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 20000);

    return () => window.clearInterval(timer);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  return (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-[24rem] sm:max-w-[24rem]"
    >
      <motion.div
        className="border-b border-slate-200 p-3 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: eases.standard }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">Notificaciones</h3>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              {loading ? "Cargando..." : `${unreadCount} sin leer`}
            </p>
          </div>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            onClick={onClose}
            aria-label="Cerrar notificaciones"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {unreadCount > 0 ? (
          <button
            type="button"
            className="sts-btn-ghost mt-3 h-8 w-full justify-center px-3 text-xs"
            onClick={() => void markAllRead()}
            disabled={markingAll}
          >
            {markingAll ? "Marcando..." : "Marcar todas como leídas"}
          </button>
        ) : null}
      </motion.div>

      <motion.div
        className="max-h-[50vh] overflow-y-auto sm:max-h-[500px]"
        variants={staggerContainer(0.05, 0.03)}
        initial="initial"
        animate="animate"
      >
        {items.length === 0 ? (
          <div className="p-3 text-xs text-slate-500 sm:p-4 sm:text-sm">No hay notificaciones.</div>
        ) : (
          items.map((item) => {
            const href = inferHref(item);
            const unread = !item.readAt;
            const marking = markingIds.includes(item.id);
            return (
              <motion.div
                key={item.id}
                variants={listItem}
                layout
                className={`border-b border-slate-100 p-3 transition-colors hover:bg-slate-50 sm:p-4 ${
                  unread ? "bg-blue-50/30" : ""
                }`}
                whileHover={{ backgroundColor: "rgba(248, 250, 252, 0.9)" }}
              >
                <div className="flex gap-2 sm:gap-3">
                  <div className="flex-shrink-0 scale-90 sm:scale-100">{iconForNotification(item)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <p className="break-words text-xs font-semibold leading-tight text-slate-900 sm:text-sm">
                        {item.title}
                      </p>
                      {unread ? <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" /> : null}
                    </div>

                    {item.body ? (
                      <p
                        className="mb-1 break-words text-xs leading-snug text-slate-600 sm:text-sm"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.body}
                      </p>
                    ) : null}
                    <p className="truncate text-xs text-slate-500">{fmtDate(item.createdAt)}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {unread ? (
                        <button
                          type="button"
                          className="sts-btn-ghost h-8 px-2.5 text-xs sm:px-3"
                          onClick={() => void markRead(item.id)}
                          disabled={marking}
                        >
                          {marking ? "..." : "Marcar leída"}
                        </button>
                      ) : null}

                      {href ? (
                        <button
                          type="button"
                          className="sts-btn-primary h-8 px-3 text-xs"
                          onClick={() => void openNotification(item)}
                          disabled={marking}
                        >
                          Abrir
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="sts-btn-ghost h-8 px-3 text-xs"
                          onClick={() => void openNotification(item)}
                          disabled
                          title="Sin destino de navegación"
                        >
                          Sin destino
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </motion.div>

      <motion.div
        className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: eases.standard, delay: 0.03 }}
      >
        <button
          type="button"
          className="sts-btn-ghost h-9 w-full justify-center text-xs font-semibold text-primary sm:text-sm"
          onClick={() => void load()}
        >
          Actualizar notificaciones
        </button>
      </motion.div>
    </motion.div>
  );
}
