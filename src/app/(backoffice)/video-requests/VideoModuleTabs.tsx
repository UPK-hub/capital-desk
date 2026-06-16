import Link from "next/link";

export default function VideoModuleTabs({ active }: { active: "requests" | "received" }) {
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
    </nav>
  );
}
