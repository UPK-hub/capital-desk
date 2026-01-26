import TicketDetailClient from "./ui/TicketDetailClient";

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">Detalle ticket</h1>
        <p className="text-sm text-muted-foreground">Linea de tiempo, SLA y acciones.</p>
      </div>
      <TicketDetailClient ticketId={params.id} />
    </div>
  );
}
