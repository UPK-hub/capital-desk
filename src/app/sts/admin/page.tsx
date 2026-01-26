import StsAdminClient from "./ui/StsAdminClient";

export default function StsAdminPage() {
  return (
    <div className="space-y-6">
      <div className="fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">Configuracion STS</h1>
        <p className="text-sm text-muted-foreground">Componentes, SLA, KPIs y mantenimiento.</p>
      </div>
      <StsAdminClient />
    </div>
  );
}
