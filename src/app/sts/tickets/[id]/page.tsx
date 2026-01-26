import TicketDetailClient from "./ui/TicketDetailClient";

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Detalle ticket</h1>
      <TicketDetailClient ticketId={params.id} />
    </div>
  );
}
