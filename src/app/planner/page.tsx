import PlannerCalendarClient from "./ui/PlannerCalendarClient";

export default function PlannerPage() {
  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Planner semanal</h1>
      <PlannerCalendarClient />
    </div>
  );
}
