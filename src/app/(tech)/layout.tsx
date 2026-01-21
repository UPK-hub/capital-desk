import Link from "next/link";
import NotificationsBell from "@/components/NotificationsBell";

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-semibold">
            Capital Desk
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link className="underline" href="/work-orders">Órdenes</Link>
            <NotificationsBell />
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
