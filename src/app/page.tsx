import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ModuleCard } from "@/components/ui/module-card";
import { redirect } from "next/navigation";
import {
  BriefcaseBusiness,
  ClipboardList,
  Film,
  LayoutGrid,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
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
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      featured: true,
    },
    {
      key: "tecnico",
      title: "Tecnico",
      description: "Ordenes de trabajo asignadas, evidencia, formularios y cierre.",
      href: "/work-orders",
      can: canTech,
      action: "Entrar a Tecnico",
      icon: <Wrench className="h-5 w-5" />,
    },
    {
      key: "videos",
      title: "Videos",
      description: "Gestion de solicitudes de videos, estados y adjuntos.",
      href: "/video-requests",
      can: canVideo,
      action: "Ver solicitudes",
      icon: <Film className="h-5 w-5" />,
    },
    {
      key: "planner",
      title: "Planner",
      description: "Calendario semanal y disponibilidad de tecnicos.",
      href: "/planner",
      can: canPlanner,
      action: "Abrir planner",
      icon: <LayoutGrid className="h-5 w-5" />,
    },
    {
      key: "sts",
      title: "STS",
      description: "Tickets, SLA y KPIs del sistema STS.",
      href: "/sts",
      can: canSts,
      action: "Abrir STS",
      icon: <ClipboardList className="h-5 w-5" />,
    },
    {
      key: "tm",
      title: "TM",
      description: "Reporte Transmilenio: SLA, KPIs y entregables.",
      href: "/tm",
      can: canTm,
      action: "Abrir TM",
      icon: <Truck className="h-5 w-5" />,
    },
    {
      key: "admin",
      title: "Administracion",
      description: "Usuarios, roles y configuracion.",
      href: "/admin",
      can: isAdmin,
      action: "Ir a administracion",
      icon: <ShieldCheck className="h-5 w-5" />,
    },
  ].filter((item) => item.can);

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8 space-y-7">
      <div className="space-y-1">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Capital Desk</h1>
        <p className="text-sm md:text-base text-muted-foreground">Selecciona tu area de trabajo.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((item) => (
          <ModuleCard
            key={item.key}
            title={item.title}
            description={item.description}
            icon={item.icon}
            action={{ label: item.action, href: item.href }}
            variant={item.featured ? "featured" : "default"}
          />
        ))}
      </div>
    </div>
  );
}
