import TicketsClient from "./ui/TicketsClient";

export default function StsTicketsPage() {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">Tickets STS</h1>
        <p className="text-sm text-muted-foreground">Gestión de incidentes con SLA y trazabilidad.</p>
      </div>
      <TicketsClient />
    </div>
  );
}
