import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="mx-auto max-w-xl p-8 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">Debes iniciar sesion.</p>
        <Link className="underline" href="/login">Ir a login</Link>
      </div>
    );
  }

  const role = session.user.role;

  const canBackoffice = role === "ADMIN" || role === "BACKOFFICE";
  const canTech = role === "ADMIN" || role === "TECHNICIAN";
  const canVideo = role === "ADMIN" || role === "BACKOFFICE";
  const caps = (session.user as any).capabilities as string[] | undefined;
  const canPlanner = role === "ADMIN" || (role === "BACKOFFICE" && caps?.includes("PLANNER"));
  const canSts =
    role === "ADMIN" ||
    (role === "BACKOFFICE" &&
      (caps?.includes("STS_READ") || caps?.includes("STS_WRITE") || caps?.includes("STS_ADMIN")));
  const canTm = role === "ADMIN" || (role === "BACKOFFICE" && caps?.includes("TM_READ"));
  const isAdmin = role === "ADMIN";

  const modules = [
    {
      key: "backoffice",
      title: "Backoffice",
      description: "Gestion de casos, asignacion de tecnicos, trazabilidad.",
      href: "/cases",
      can: canBackoffice,
      action: "Entrar a Backoffice",
    },
    {
      key: "tecnico",
      title: "Tecnico",
      description: "Ordenes de trabajo asignadas, evidencia, formularios y cierre.",
      href: "/work-orders",
      can: canTech,
      action: "Entrar a Tecnico",
    },
    {
      key: "videos",
      title: "Videos",
      description: "Gestion de solicitudes de videos, estados y adjuntos.",
      href: "/video-requests",
      can: canVideo,
      action: "Ver solicitudes",
    },
    {
      key: "planner",
      title: "Planner",
      description: "Calendario semanal y disponibilidad de tecnicos.",
      href: "/planner",
      can: canPlanner,
      action: "Abrir planner",
    },
    {
      key: "sts",
      title: "STS",
      description: "Tickets, SLA y KPIs del sistema STS.",
      href: "/sts",
      can: canSts,
      action: "Abrir STS",
    },
    {
      key: "tm",
      title: "TM",
      description: "Reporte Transmilenio: SLA, KPIs y entregables.",
      href: "/tm",
      can: canTm,
      action: "Abrir TM",
    },
    {
      key: "admin",
      title: "Administracion",
      description: "Usuarios, roles y configuracion.",
      href: "/admin",
      can: isAdmin,
      action: "Ir a administracion",
    },
  ].filter((item) => item.can);

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Capital Desk</h1>
        <p className="text-sm text-muted-foreground">Selecciona tu area de trabajo.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((item) => (
          <div key={item.key} className="sts-card p-5 space-y-2 fade-up">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="text-sm text-muted-foreground">{item.description}</p>
            <Link className="sts-btn-soft" href={item.href}>{item.action}</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
