import ThemeAdminClient from "./ui/ThemeAdminClient";

export default function ThemeAdminPage() {
  return (
    <div className="mx-auto max-w-5xl p-8 space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Tema visual</h1>
      <ThemeAdminClient />
    </div>
  );
}
