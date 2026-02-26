import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ModuleCard } from "@/components/ui/module-card";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Role, StsTicketStatus, VideoCaseStatus } from "@prisma/client";
import { BriefcaseBusiness, CalendarDays, ClipboardList, Eye, Film, ShieldCheck, Truck, Wrench } from "lucide-react";
import Image from "next/image";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import { CAPABILITIES } from "@/lib/capabilities";
import { isVideosOnlyBackoffice } from "@/lib/access-control";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const videosOnly = isVideosOnlyBackoffice(role, caps);

  const canBackoffice = role === Role.ADMIN || (role === Role.BACKOFFICE && !videosOnly);
  const canRvr = role === Role.ADMIN || role === Role.SUPERVISOR || (role === Role.BACKOFFICE && !videosOnly);
  const canTech = role === Role.ADMIN || role === Role.TECHNICIAN;
  const canVideo = role === Role.ADMIN || role === Role.BACKOFFICE;
  const canPlanner = role === Role.ADMIN || (role === Role.BACKOFFICE && caps?.includes("PLANNER"));
  const canSts =
    role === Role.ADMIN ||
    (role === Role.BACKOFFICE &&
      (caps?.includes("STS_READ") || caps?.includes("STS_WRITE") || caps?.includes("STS_ADMIN")));
  const canTm = role === Role.ADMIN || (role === Role.BACKOFFICE && caps?.includes(CAPABILITIES.TM_READ));
  const isAdmin = role === Role.ADMIN;

  const [openCases, pendingVideos, availableTechs, openStsTickets] = await Promise.all([
    prisma.case.count({
      where: {
        tenantId,
        status: { in: ["NUEVO", "OT_ASIGNADA", "EN_EJECUCION"] },
      },
    }),
    prisma.videoDownloadRequest.count({
      where: { case: { tenantId }, status: { in: [VideoCaseStatus.EN_ESPERA, VideoCaseStatus.EN_CURSO] } },
    }),
    prisma.user.count({ where: { tenantId, role: Role.TECHNICIAN, active: true } }),
    prisma.stsTicket.count({ where: { tenantId, status: { in: [StsTicketStatus.OPEN, StsTicketStatus.IN_PROGRESS] } } }),
  ]);

  const operationModules = [
    {
      key: "backoffice",
      title: "Backoffice",
      description: "Gestión de casos y trazabilidad.",
      href: "/cases",
      can: canBackoffice,
      action: "Abrir",
      icon: <BriefcaseBusiness className="h-5 w-5" />,
      featured: true,
      tone: "backoffice" as const,
      count: openCases,
    },
    {
      key: "tecnico",
      title: "Técnico",
      description: "Órdenes de trabajo asignadas.",
      href: "/work-orders",
      can: canTech,
      action: "Abrir",
      icon: <Wrench className="h-5 w-5" />,
      tone: "tecnico" as const,
    },
    {
      key: "videos",
      title: "Videos",
      description: "Solicitudes pendientes:",
      subtitle: String(pendingVideos),
      href: "/video-requests",
      can: canVideo,
      action: "Abrir",
      icon: <Film className="h-5 w-5" />,
      tone: "videos" as const,
      count: pendingVideos > 0 ? pendingVideos : undefined,
    },
    {
      key: "rvr",
      title: "RVR",
      description: "Revisión visual remota diaria (hasta 8 buses).",
      href: "/rvr",
      can: canRvr,
      action: "Abrir",
      icon: <Eye className="h-5 w-5" />,
      tone: "planner" as const,
    },
    {
      key: "planner",
      title: "Planner",
      description: "Técnicos disponibles hoy:",
      subtitle: String(availableTechs),
      href: "/planner",
      can: canPlanner,
      action: "Abrir",
      icon: <CalendarDays className="h-5 w-5" />,
      tone: "planner" as const,
    },
    {
      key: "sts",
      title: "STS",
      description: "Tickets abiertos:",
      subtitle: String(openStsTickets),
      href: "/sts",
      can: canSts,
      action: "Abrir",
      icon: <ClipboardList className="h-5 w-5" />,
      tone: "sts" as const,
    },
    {
      key: "tm",
      title: "TM",
      description: "Reporte SLA y KPIs.",
      href: "/tm",
      can: canTm,
      action: "Abrir",
      icon: <Truck className="h-5 w-5" />,
      tone: "tm" as const,
    },
  ].filter((item) => item.can);

  const adminModules = [
    {
      key: "admin",
      title: "Administración",
      description: "Usuarios, roles y configuración.",
      href: "/admin",
      can: isAdmin,
      action: "Abrir",
      icon: <ShieldCheck className="h-5 w-5" />,
      tone: "admin" as const,
    },
    {
      key: "tm-admin",
      title: "TM",
      description: "Reporte SLA y KPIs.",
      href: "/tm",
      can: canTm,
      action: "Abrir",
      icon: <Truck className="h-5 w-5" />,
      tone: "tm" as const,
    },
  ].filter((item) => item.can);

  return (
    <div className="space-y-7">
      <ScrollReveal>
        <section className="space-y-1">
          <h1 className="flex flex-wrap items-center gap-3 text-5xl font-semibold tracking-tight text-slate-900">
            <Image
              src="/resources/UPKCA_Logo.png"
              alt="CapitalBus"
              width={60}
              height={60}
              className="h-12 w-12 rounded-xl object-contain shadow-sm ring-1 ring-slate-200/90 md:h-14 md:w-14"
            />
            <span>CapitalDesk</span>
          </h1>
          <p className="text-xl text-slate-700">Seleccioná tu área de trabajo.</p>
        </section>
      </ScrollReveal>

      <section className="space-y-4">
        <ScrollReveal>
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-semibold text-slate-900">Operación</h2>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        </ScrollReveal>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {operationModules.map((item, index) => (
            <ScrollReveal key={item.key} delay={index * 0.04}>
              <ModuleCard
                title={item.title}
                description={item.description}
                subtitle={item.subtitle}
                icon={item.icon}
                action={{ label: item.action, href: item.href }}
                variant={item.featured ? "featured" : "default"}
                tone={item.tone}
                count={item.count}
              />
            </ScrollReveal>
          ))}
        </div>
      </section>

      {adminModules.length > 0 ? (
        <section className="space-y-4">
          <ScrollReveal>
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-semibold text-slate-900">Administración & Reportes</h2>
              <div className="h-px flex-1 bg-border/60" />
            </div>
          </ScrollReveal>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {adminModules.map((item, index) => (
              <ScrollReveal key={item.key} delay={index * 0.04}>
                <ModuleCard
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                  action={{ label: item.action, href: item.href }}
                  tone={item.tone}
                />
              </ScrollReveal>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
