"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { eases, listItem, scaleIn, staggerContainer } from "@/lib/animations";

type Contact = {
  id: string;
  name: string;
  email?: string;
  role: string;
};

type ThreadItem = {
  id: string;
  participants: Array<{ id: string; name: string; role: string }>;
  peer?: { id: string; name: string; role: string } | null;
  lastMessage: null | { id: string; message: string; createdAt: string; sender: { id: string; name: string } };
  unreadCount: number;
};

function openThreadInFloatingChat(threadId?: string) {
  window.dispatchEvent(
    new CustomEvent("capitaldesk:open-chat", {
      detail: threadId ? { threadId } : {},
    })
  );
}

export function MessagesPanel({
  onClose,
  onUnreadChange,
}: {
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [contactsRes, threadsRes] = await Promise.all([
        fetch("/api/chat/contacts", { cache: "no-store" }),
        fetch("/api/chat/threads", { cache: "no-store" }),
      ]);

      if (!contactsRes.ok) throw new Error("No se pudieron cargar los técnicos.");
      if (!threadsRes.ok) throw new Error("No se pudieron cargar las conversaciones.");

      const contactsPayload = await contactsRes.json().catch(() => ({}));
      const threadsPayload = await threadsRes.json().catch(() => ({}));

      const nextContacts = Array.isArray(contactsPayload?.items) ? contactsPayload.items : [];
      const nextThreads = Array.isArray(threadsPayload?.items) ? threadsPayload.items : [];
      const unread = nextThreads.reduce((acc: number, item: any) => acc + Number(item?.unreadCount ?? 0), 0);

      setContacts(nextContacts);
      setThreads(nextThreads);
      onUnreadChange?.(unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando mensajería.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const filteredContacts = useMemo(() => {
    const normalized = normalize(query.trim());
    if (!normalized) return contacts;
    return contacts.filter(
      (contact) =>
        normalize(contact.name).includes(normalized) ||
        normalize(contact.email ?? "").includes(normalized)
    );
  }, [contacts, query]);

  function openContactChat(contactId: string) {
    if (!contactId) return;
    onClose();
    router.push(`/chat/${contactId}`);
  }

  return (
    <motion.div
      variants={scaleIn}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:w-[24rem] sm:max-w-[24rem]"
    >
      <motion.div
        className="flex items-center justify-between gap-2 border-b border-slate-200 p-3 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2, ease: eases.standard }}
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">Mensajería</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">Selecciona un técnico y conversa.</p>
        </div>

        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          onClick={onClose}
          aria-label="Cerrar mensajería"
        >
            <X className="h-4 w-4" />
          </button>
      </motion.div>

      <div className="border-b border-slate-200 p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar técnico..."
            className="app-field-control h-9 w-full rounded-xl pl-9 pr-3 text-sm sm:h-10 sm:pl-10"
          />
        </div>
      </div>

      <motion.div
        className="max-h-[40vh] overflow-y-auto sm:max-h-[420px]"
        variants={staggerContainer(0.045, 0.02)}
        initial="initial"
        animate="animate"
      >
        {error ? <p className="p-3 text-xs text-red-600 sm:p-4 sm:text-sm">{error}</p> : null}
        {loading ? <p className="p-3 text-xs text-slate-500 sm:p-4 sm:text-sm">Cargando…</p> : null}

        {!loading ? (
          <>
            {filteredContacts.map((contact) => (
              <motion.button
                key={contact.id}
                variants={listItem}
                type="button"
                className="flex w-full items-center gap-2 border-b border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 sm:gap-3 sm:p-4"
                onClick={() => openContactChat(contact.id)}
                whileHover={{ backgroundColor: "rgba(248, 250, 252, 0.9)" }}
              >
                <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 sm:h-10 sm:w-10 sm:text-sm">
                  {contact.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900 sm:text-sm">{contact.name}</span>
                  <span className="block truncate text-xs text-slate-500">{contact.email ?? contact.role}</span>
                </span>
              </motion.button>
            ))}

            <div className="border-y border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Conversaciones recientes</p>
            </div>

            {threads.length === 0 ? (
              <p className="p-3 text-xs text-slate-500 sm:p-4 sm:text-sm">Sin conversaciones.</p>
            ) : (
              threads.map((thread) => {
                const peer = thread.peer ?? thread.participants[0] ?? null;
                return (
                  <motion.button
                    key={thread.id}
                    variants={listItem}
                    type="button"
                    className="flex w-full items-center gap-2 border-b border-slate-100 p-3 text-left transition-colors hover:bg-slate-50 sm:gap-3 sm:p-4"
                    onClick={() => {
                      if (peer?.id) {
                        openContactChat(peer.id);
                        return;
                      }
                      openThreadInFloatingChat(thread.id);
                      onClose();
                    }}
                    whileHover={{ backgroundColor: "rgba(248, 250, 252, 0.9)" }}
                  >
                    <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700 sm:h-10 sm:w-10 sm:text-sm">
                      {peer?.name?.charAt(0).toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900 sm:text-sm">{peer?.name ?? "Chat"}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {thread.lastMessage?.message ?? "Sin mensajes"}
                      </span>
                    </span>
                    {thread.unreadCount > 0 ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                        {thread.unreadCount}
                      </span>
                    ) : null}
                  </motion.button>
                );
              })
            )}
          </>
        ) : null}
      </motion.div>

      <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
        <button
          type="button"
          className="sts-btn-primary h-9 w-full justify-center text-sm sm:h-10"
          onClick={() => {
            if (filteredContacts[0]?.id) {
              openContactChat(filteredContacts[0].id);
              return;
            }
            openThreadInFloatingChat();
            onClose();
          }}
        >
          Abrir chat
        </button>
      </div>
    </motion.div>
  );
}
