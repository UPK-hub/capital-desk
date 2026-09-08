import Link from "next/link";

type TabKey = "requests" | "received" | "panic";

export default function VideoModuleTabs({
  active,
  showPanic = false,
}: {
  active: TabKey;
  showPanic?: boolean;
}) {
  const base =
    "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition";
  const inactive = "text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  const current = "bg-background text-foreground shadow-sm ring-1 ring-border/60";

  return (
    <nav className="inline-flex w-fit gap-1 rounded-lg border border-border/70 bg-muted/25 p-1">
      <Link
        href="/video-requests"
        className={`${base} ${active === "requests" ? current : inactive}`}
      >
        Solicitudes
      </Link>
      {showPanic ? (
        <Link
          href="/video-requests/panic"
          className={`${base} ${active === "panic" ? current : inactive}`}
        >
          Botón de pánico
        </Link>
      ) : null}
    </nav>
  );
}
