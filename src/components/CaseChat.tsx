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

export default function CaseChat({
  caseId,
  currentUserId,
  currentUserName,
  showHeader = true,
}: {
  caseId: string;
  currentUserId?: string;
  currentUserName?: string;
  showHeader?: boolean;
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
        const res = await fetch(`/api/cases/${caseId}/chat`);
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
  }, [caseId]);

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
    const es = new EventSource(`/api/cases/${caseId}/chat/stream${since}`);

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
  }, [caseId]);

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
    const es = new EventSource(`/api/cases/${caseId}/chat/typing`);

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
  }, [caseId]);

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
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error("No se pudo enviar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    }
  }

  async function notifyTyping() {
    try {
      await fetch(`/api/cases/${caseId}/chat/typing`, {
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
        const res = await fetch(`/api/cases/${caseId}/chat/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) throw new Error("No se pudo subir el archivo");
      const data = await res.json();
      if (data?.item) {
        setMessages((prev) => [...prev, data.item]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al adjuntar");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="sts-card p-0 overflow-hidden">
      {showHeader ? (
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}
            >
              {messages.length ? messages[messages.length - 1]?.sender?.name?.charAt(0) ?? "C" : "C"}
            </div>
            <div>
              <h2 className="text-base font-semibold">Chat</h2>
              <p className="text-xs text-muted-foreground">Backoffice · Técnico</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })}
              >
                {unreadCount} nuevo(s)
              </button>
            ) : null}
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              En línea
            </span>
          </div>
        </div>
      ) : null}

      <div className="flex h-[460px] flex-col">
        <div
          ref={listRef}
          className={`flex-1 space-y-3 overflow-auto px-4 ${showHeader ? "py-4" : "py-3"}`}
        >
          {loading ? <p className="text-xs text-muted-foreground">Cargando chat…</p> : null}
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {!loading && messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin mensajes todavía.</p>
          ) : null}
          {messages.map((m) => {
            const isMe = currentUserId && m.sender.id === currentUserId;
            const time = new Intl.DateTimeFormat("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(m.createdAt));
            return (
              <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%] space-y-1">
                  {!isMe ? (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-medium">{m.sender.name}</span>
                      <span>·</span>
                      <span>{time}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
                      <span>{time}</span>
                      <span>·</span>
                      <span className="font-medium">Tú</span>
                    </div>
                  )}
                  <div
                    className="rounded-2xl px-3 py-2 text-sm shadow-sm"
                    style={
                      isMe
                        ? { background: "hsl(var(--sts-accent))", color: "white" }
                        : { background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }
                    }
                  >
                    {m.meta?.kind === "image" && m.meta.filePath ? (
                      <img
                        src={`/api/uploads/${m.meta.filePath}`}
                        alt={m.meta.filename ?? "imagen"}
                        className="mt-2 w-full rounded-xl border object-cover"
                      />
                    ) : null}
                    {m.meta?.kind === "file" && m.meta.filePath ? (
                      <a
                        href={`/api/uploads/${m.meta.filePath}`}
                        className="text-xs underline"
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

        <div className="border-t px-4 py-3">
          {typingUsers.length ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {typingUsers.map((u) => u.name).join(", ")} escribiendo…
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border"
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
              className="h-10 flex-1 rounded-full border px-4 text-sm"
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
