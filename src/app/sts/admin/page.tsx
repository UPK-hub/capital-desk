import StsAdminClient from "./ui/StsAdminClient";

export default function StsAdminPage() {
  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Configuracion STS</h1>
      <StsAdminClient />
    </div>
  );
}
