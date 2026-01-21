import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Capital Desk
          </Link>

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {session?.user ? (
              <>
                <span>{session.user.name}</span>
                <span className="rounded-md border px-2 py-1 text-xs">
                  {session.user.role}
                </span>
                <Link className="underline" href="/api/auth/signout">
                  Salir
                </Link>
              </>
            ) : (
              <Link className="underline" href="/login">
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
