"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  message: string;
  createdAt: string;
  sender: { id: string; name: string; role: string };
  meta?: {
    filePath?: string;
    filename?: string;
    kind?: "image" | "file";
    mime?: string;
  };
};

export default function DirectChat({
  threadId,
  currentUserId,
  currentUserName,
  title,
  subtitle,
  showHeader = true,
  onNewMessage,
}: {
  threadId: string;
  currentUserId?: string;
  currentUserName?: string;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  onNewMessage?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat/threads/${threadId}/messages`);
        if (!res.ok) throw new Error("No se pudo cargar el chat");
        const data = await res.json();
        if (!mounted) return;
        const items = (data?.items ?? []) as ChatMessage[];
        setMessages(items);
        if (items.length) {
          lastTimestampRef.current = items[items.length - 1].createdAt;
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      mounted = false;
    };
  }, [threadId]);

  function playNotification() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = () => ctx.close();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const since = lastTimestampRef.current ? `?since=${encodeURIComponent(lastTimestampRef.current)}` : "";
    const es = new EventSource(`/api/chat/threads/${threadId}/stream${since}`);

    es.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data) as ChatMessage;
        setMessages((prev) => {
          if (prev.some((m) => m.id === item.id)) return prev;
          const next = [...prev, item];
          lastTimestampRef.current = item.createdAt;
          const isMe = currentUserId && item.sender.id === currentUserId;
          if (!isMe && !isAtBottomRef.current) {
            setUnreadCount((count) => count + 1);
            playNotification();
          } else if (!isMe) {
            playNotification();
          }
          if (onNewMessage) onNewMessage();
          return next;
        });
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // keep silent; browser will retry
    };

    return () => {
      es.close();
    };
  }, [threadId, currentUserId, onNewMessage]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handler = () => {
      const threshold = 40;
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (isAtBottomRef.current) setUnreadCount(0);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/chat/threads/${threadId}/typing`);

    es.onmessage = (event) => {
      try {
        const users = JSON.parse(event.data) as Array<{ userId: string; name: string }>;
        setTypingUsers(users);
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      // ignore
    };

    return () => {
      es.close();
    };
  }, [threadId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
    setUnreadCount(0);
  }, [messages]);

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    try {
      const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error("No se pudo enviar");
      if (onNewMessage) onNewMessage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    }
  }

  async function notifyTyping() {
    try {
      await fetch(`/api/chat/threads/${threadId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: currentUserName ?? "Usuario" }),
      });
    } catch {
      // ignore
    }
  }

  function handleInputChange(value: string) {
    setText(value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      notifyTyping();
    }, 300);
  }

  async function handleAttachment(file?: File | null) {
    if (!file) return;
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError("El archivo supera 10MB");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/chat/threads/${threadId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("No se pudo subir el archivo");
      const data = await res.json();
      if (data?.item) {
        setMessages((prev) => [...prev, data.item]);
        if (onNewMessage) onNewMessage();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al adjuntar");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="chat-panel">
      {showHeader ? (
        <div className="chat-panel__header">
          <div className="chat-panel__identity">
            <div className="chat-panel__avatar">
              {(title ?? "C").charAt(0)}
            </div>
            <div>
              <h2 className="chat-panel__title">{title ?? "Chat"}</h2>
              <p className="chat-panel__subtitle">{subtitle ?? "Directo"}</p>
            </div>
          </div>
          <div className="chat-panel__actions">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="chat-unread-btn"
                onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })}
              >
                {unreadCount} nuevo(s)
              </button>
            ) : null}
            <span className="chat-status">
              <span className="chat-status__dot" />
              En línea
            </span>
          </div>
        </div>
      ) : null}

      <div className="chat-panel__body">
        <div ref={listRef} className="chat-panel__messages">
          {loading ? <p className="chat-panel__loading">Cargando chat…</p> : null}
          {error ? <p className="chat-panel__error">{error}</p> : null}
          {!loading && messages.length === 0 ? (
            <p className="chat-panel__empty">Sin mensajes todavía.</p>
          ) : null}
          {messages.map((m) => {
            const isMe = currentUserId && m.sender.id === currentUserId;
            const time = new Intl.DateTimeFormat("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(m.createdAt));
            return (
              <div key={m.id} className={`chat-row ${isMe ? "chat-row--me" : "chat-row--other"}`}>
                <div className="chat-stack">
                  {!isMe ? (
                    <div className="chat-meta">
                      <span className="font-medium">{m.sender.name}</span>
                      <span>·</span>
                      <span>{time}</span>
                    </div>
                  ) : (
                    <div className="chat-meta chat-meta--me">
                      <span>{time}</span>
                      <span>·</span>
                      <span className="font-medium">Tú</span>
                    </div>
                  )}
                  <div
                    className={`chat-bubble ${isMe ? "chat-bubble--me" : "chat-bubble--other"}`}
                  >
                    {m.meta?.kind === "image" && m.meta.filePath ? (
                      <img
                        src={`/api/uploads/${m.meta.filePath}`}
                        alt={m.meta.filename ?? "imagen"}
                        className="chat-media"
                      />
                    ) : null}
                    {m.meta?.kind === "file" && m.meta.filePath ? (
                      <a
                        href={`/api/uploads/${m.meta.filePath}`}
                        className="chat-file"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {m.meta.filename ?? "Archivo adjunto"}
                      </a>
                    ) : null}
                    {m.meta?.kind ? null : m.message}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="chat-panel__composer">
          {typingUsers.length ? (
            <p className="chat-panel__typing">
              {typingUsers.map((u) => u.name).join(", ")} escribiendo…
            </p>
          ) : null}
          <div className="chat-panel__compose-row">
            <button
              className="chat-attach-btn"
              title="Adjuntar"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => handleAttachment(event.target.files?.[0])}
            />
            <input
              className="chat-input"
              placeholder="Escribe un mensaje…"
              value={text}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
            />
            <button className="sts-btn-primary h-10 px-5 text-sm" onClick={sendMessage}>
              Enviar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
