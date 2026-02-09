"use client";

import { useEffect, useMemo, useState } from "react";
import DirectChat from "@/components/DirectChat";

type Contact = { id: string; name: string; email?: string; role: string };
type ThreadSummary = {
  id: string;
  participants: Array<{ id: string; name: string; role: string }>;
  lastMessage: null | { id: string; message: string; createdAt: string; sender: { id: string; name: string } };
  unreadCount: number;
  updatedAt: string;
};

export default function FloatingMessenger({
  currentUserId,
  currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadThreads() {
    try {
      const res = await fetch("/api/chat/threads");
      if (!res.ok) throw new Error("No se pudieron cargar los chats");
      const data = await res.json();
      setThreads(data?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function loadContacts() {
    try {
      const res = await fetch("/api/chat/contacts");
      if (!res.ok) throw new Error("No se pudieron cargar los técnicos");
      const data = await res.json();
      setContacts(data?.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    Promise.all([loadThreads(), loadContacts()]).finally(() => setLoading(false));
  }, [open]);

  const totalUnread = useMemo(
    () => threads.reduce((acc, t) => acc + (t.unreadCount ?? 0), 0),
    [threads],
  );

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const activePeer = useMemo(() => {
    if (!activeThread) return null;
    return activeThread.participants.find((p) => p.id !== currentUserId) ?? null;
  }, [activeThread, currentUserId]);

  async function startChat(targetId: string) {
    try {
      setError(null);
      const res = await fetch("/api/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetId }),
      });
      if (!res.ok) throw new Error("No se pudo abrir el chat");
      const data = await res.json();
      const threadId = data?.item?.id as string | undefined;
      if (!threadId) throw new Error("Chat inválido");
      await loadThreads();
      setActiveThreadId(threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  function openThread(threadId: string) {
    setActiveThreadId(threadId);
  }

  function closeThread() {
    setActiveThreadId(null);
  }

  return (
    <div className="floating-chat">
      <button
        className="floating-chat__button"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Chat"
      >
        <span>Chat</span>
        {totalUnread > 0 ? <span className="floating-chat__badge">{totalUnread}</span> : null}
      </button>

      {open ? (
        <div className="floating-chat__panel sts-card">
          <div className="floating-chat__header">
            <div>
              <p className="text-sm font-semibold">Mensajería</p>
              <p className="text-xs text-muted-foreground">Selecciona un técnico y conversa.</p>
            </div>
            <button className="sts-btn-ghost text-xs" type="button" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>

          {error ? <p className="px-4 text-xs text-red-500">{error}</p> : null}
          {loading ? <p className="px-4 text-xs text-muted-foreground">Cargando…</p> : null}

          {activeThreadId ? (
            <div className="floating-chat__content">
              <div className="floating-chat__toolbar">
                <button className="sts-btn-ghost text-xs" type="button" onClick={closeThread}>
                  ← Volver
                </button>
                <div className="text-right">
                  <p className="text-xs font-semibold">{activePeer?.name ?? "Chat"}</p>
                  <p className="text-[11px] text-muted-foreground">{activePeer?.role ?? "Técnico"}</p>
                </div>
              </div>
              <DirectChat
                threadId={activeThreadId}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                title={activePeer?.name ?? "Chat"}
                subtitle="Directo"
                showHeader={false}
                onNewMessage={loadThreads}
              />
            </div>
          ) : (
            <div className="floating-chat__content">
              <div className="floating-chat__section">
                <div className="floating-chat__search">
                  <input
                    type="text"
                    placeholder="Buscar técnico..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="floating-chat__list">
                  {filteredContacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No hay técnicos disponibles.</p>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        className="floating-chat__item"
                        type="button"
                        onClick={() => startChat(c.id)}
                      >
                        <div className="floating-chat__avatar">{c.name.charAt(0)}</div>
                        <div className="text-left">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.email ?? c.role}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="floating-chat__section">
                <p className="text-xs font-semibold">Conversaciones recientes</p>
                <div className="floating-chat__list">
                  {threads.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin conversaciones aún.</p>
                  ) : (
                    threads.map((thread) => {
                      const other = thread.participants.find((p) => p.id !== currentUserId);
                      return (
                        <button
                          key={thread.id}
                          className="floating-chat__item"
                          type="button"
                          onClick={() => openThread(thread.id)}
                        >
                          <div className="floating-chat__avatar">{other?.name?.charAt(0) ?? "?"}</div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium">{other?.name ?? "Chat"}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              {thread.lastMessage?.message ?? "Sin mensajes"}
                            </p>
                          </div>
                          {thread.unreadCount > 0 ? (
                            <span className="floating-chat__badge small">{thread.unreadCount}</span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
