import TechnicianSchedulesClient from "./ui/TechnicianSchedulesClient";

export default function TechnicianSchedulesPage() {
  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Horarios de tecnicos</h1>
      <TechnicianSchedulesClient />
    </div>
  );
}
