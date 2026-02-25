"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!res?.ok) {
      setError("Credenciales inválidas.");
      return;
    }

    try {
      const profileRes = await fetch("/api/profile", { cache: "no-store" });
      const profileData = await profileRes.json().catch(() => ({}));
      const forcePasswordChange = Boolean(
        (profileData?.user?.capabilities ?? []).includes("FORCE_PASSWORD_CHANGE")
      );
      if (forcePasswordChange) {
        router.push("/profile?forcePasswordChange=1");
        router.refresh();
        return;
      }
    } catch {
      // fallback al flujo normal
    }

    // Redirige al hub.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm p-6 space-y-4">
      <div className="sts-card p-6 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Capital Desk</p>
          <h1 className="text-2xl font-semibold">Ingreso</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button className="w-full sts-btn-primary text-sm">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
