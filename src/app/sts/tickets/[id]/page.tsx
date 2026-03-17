import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TicketDetailClient from "./ui/TicketDetailClient";

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userRole = (session?.user as any)?.role ?? "";

  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">Detalle ticket</h1>
        <p className="text-sm text-muted-foreground">Linea de tiempo, SLA y acciones.</p>
      </div>
      <TicketDetailClient ticketId={params.id} userRole={userRole} />
    </div>
  );
}
