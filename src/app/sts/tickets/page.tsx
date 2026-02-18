import TicketsClient from "./ui/TicketsClient";

export default function StsTicketsPage() {
  return (
    <div className="mobile-page-shell">
      <header className="mobile-page-header">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 lg:px-6 lg:py-0">
          <div className="fade-up">
            <h1 className="text-lg font-semibold tracking-tight lg:text-3xl">Tickets STS</h1>
            <p className="text-sm text-muted-foreground">Gestión de incidentes con SLA y trazabilidad.</p>
          </div>
        </div>
      </header>

      <div className="mobile-page-content max-w-6xl lg:px-6">
        <TicketsClient />
      </div>
    </div>
  );
}
