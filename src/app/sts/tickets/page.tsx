import TicketsClient from "./ui/TicketsClient";

export default function StsTicketsPage() {
  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Tickets STS</h1>
      <TicketsClient />
    </div>
  );
}
