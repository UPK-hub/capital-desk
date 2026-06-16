import type { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Role, StsTicketStatus, VideoCaseStatus } from "@prisma/client";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Eye,
  Film,
  Satellite,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { ScrollReveal } from "@/components/animations/ScrollReveal";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import { CAPABILITIES } from "@/lib/capabilities";
import { isVideosOnlyBackoffice } from "@/lib/access-control";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administración",
  BACKOFFICE: "Backoffice",
  TECHNICIAN: "Técnico",
  PLANNER: "Planeación",
  SUPERVISOR: "Supervisión",
  HELPDESK: "Mesa de ayuda",
  AUDITOR: "Auditoría",
};

const TONES: Record<string, { bg: string; fg: string; border: string; button: string }> = {
  backoffice: { bg: "bg-red-100", fg: "text-red-600", border: "hover:border-red-200", button: "from-[#2f5bc9] to-[#2fa4f4]" },
  tecnico: { bg: "bg-indigo-100", fg: "text-indigo-600", border: "hover:border-indigo-200", button: "from-[#5963d5] to-[#6f7cf6]" },
  videos: { bg: "bg-violet-100", fg: "text-violet-600", border: "hover:border-violet-200", button: "from-[#5963d5] to-[#6f7cf6]" },
  rvr: { bg: "bg-cyan-100", fg: "text-cyan-600", border: "hover:border-cyan-200", button: "from-[#1da4c8] to-[#33c5da]" },
  planner: { bg: "bg-cyan-100", fg: "text-cyan-600", border: "hover:border-cyan-200", button: "from-[#1da4c8] to-[#33c5da]" },
  sts: { bg: "bg-orange-100", fg: "text-orange-600", border: "hover:border-orange-200", button: "from-[#f18b5d] to-[#f3a15d]" },
  tm: { bg: "bg-blue-100", fg: "text-blue-600", border: "hover:border-blue-200", button: "from-[#2f5bc9] to-[#2f8ce8]" },
  admin: { bg: "bg-indigo-100", fg: "text-indigo-600", border: "hover:border-indigo-200", button: "from-[#5963d5] to-[#6f7cf6]" },
};

function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

type ModuleItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  can: boolean;
  icon: ReactNode;
  tone: keyof typeof TONES;
  count?: number;
};

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = (session.user as any).role as Role;
  const tenantId = (session.user as any).tenantId as string;
  const caps = (session.user as any).capabilities as string[] | undefined;
  const name = (session.user as any).name as string | undefined;
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

  const [openCases, pendingVideos, availableTechs, openStsTickets, tenant] = await Promise.all([
    prisma.case.count({ where: { tenantId, status: { in: ["NUEVO", "OT_ASIGNADA", "EN_EJECUCION"] } } }),
    prisma.videoDownloadRequest.count({
      where: { case: { tenantId }, status: { in: [VideoCaseStatus.EN_ESPERA, VideoCaseStatus.EN_CURSO] } },
    }),
    prisma.user.count({ where: { tenantId, role: Role.TECHNICIAN, active: true } }),
    prisma.stsTicket.count({ where: { tenantId, status: { in: [StsTicketStatus.OPEN, StsTicketStatus.IN_PROGRESS] } } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const firstName = String(name ?? "").trim().split(/\s+/)[0] || "";
  const roleLabel = ROLE_LABELS[role] ?? String(role);
  const tenantName = tenant?.name ?? "CapitalBus";

  const kpis = [
    { label: "Casos abiertos", value: openCases, can: canBackoffice, icon: <BriefcaseBusiness className="h-5 w-5" />, bg: "bg-red-100", fg: "text-red-600" },
    { label: "Videos pendientes", value: pendingVideos, can: canVideo, icon: <Film className="h-5 w-5" />, bg: "bg-violet-100", fg: "text-violet-600" },
    { label: "Tickets STS abiertos", value: openStsTickets, can: canSts, icon: <ClipboardList className="h-5 w-5" />, bg: "bg-orange-100", fg: "text-orange-600" },
    { label: "Técnicos hoy", value: availableTechs, can: canPlanner || isAdmin, icon: <Users className="h-5 w-5" />, bg: "bg-cyan-100", fg: "text-cyan-600" },
  ].filter((k) => k.can);

  const operationModules: ModuleItem[] = [
    { key: "backoffice", title: "Backoffice", description: "Gestión de casos y trazabilidad.", href: "/cases", can: canBackoffice, icon: <BriefcaseBusiness className="h-5 w-5" />, tone: "backoffice", count: openCases },
    { key: "tecnico", title: "Técnico", description: "Órdenes de trabajo asignadas.", href: "/work-orders", can: canTech, icon: <Wrench className="h-5 w-5" />, tone: "tecnico" },
    { key: "videos", title: "Videos", description: "Solicitudes de descarga de video.", href: "/video-requests", can: canVideo, icon: <Film className="h-5 w-5" />, tone: "videos", count: pendingVideos },
    { key: "rvr", title: "RVR", description: "Revisión visual remota diaria.", href: "/rvr", can: canRvr, icon: <Eye className="h-5 w-5" />, tone: "rvr" },
    { key: "planner", title: "Planner", description: "Planeación semanal de técnicos.", href: "/planner", can: canPlanner, icon: <CalendarDays className="h-5 w-5" />, tone: "planner", count: availableTechs },
    { key: "sts", title: "STS", description: "Soporte técnico, SLA y KPIs.", href: "/sts", can: canSts, icon: <ClipboardList className="h-5 w-5" />, tone: "sts", count: openStsTickets },
    { key: "tm", title: "TM", description: "Reporte de SLA y KPIs operativos.", href: "/tm", can: canTm, icon: <Truck className="h-5 w-5" />, tone: "tm" },
  ].filter((m) => m.can);

  const adminModules: ModuleItem[] = [
    { key: "admin", title: "Administración", description: "Usuarios, roles y configuración.", href: "/admin", can: isAdmin, icon: <ShieldCheck className="h-5 w-5" />, tone: "admin" },
    { key: "telemetry", title: "Telemetría", description: "Mapa satelital y tramas por bus.", href: "/telemetry", can: isAdmin, icon: <Satellite className="h-5 w-5" />, tone: "tm" },
    { key: "tm-admin", title: "TM", description: "Reporte de SLA y KPIs operativos.", href: "/tm", can: canTm, icon: <Truck className="h-5 w-5" />, tone: "tm" },
  ].filter((m) => m.can);

  const renderCard = (item: ModuleItem) => {
    const t = TONES[item.tone] ?? TONES.admin;
    return (
      <Link
        href={item.href}
        className={`group flex h-full flex-col gap-2.5 rounded-2xl border border-border/60 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${t.border}`}
      >
        <div className="flex items-center justify-between">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.bg} ${t.fg}`}>{item.icon}</span>
          {typeof item.count === "number" ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">{item.count}</span>
          ) : null}
        </div>
        <div className="text-base font-semibold text-slate-900">{item.title}</div>
        <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
        <span className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r ${t.button} px-4 py-2.5 text-sm font-medium text-white shadow-sm transition group-hover:brightness-110`}>
          Abrir <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <ScrollReveal>
        <section className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-400 text-base font-semibold text-white">
              {initials(name)}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Hola{firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="text-sm text-muted-foreground">
                {roleLabel} · {tenantName}
              </p>
            </div>
          </div>
          <div className="w-full md:max-w-sm">
            <GlobalSearchBar />
          </div>
        </section>
      </ScrollReveal>

      {kpis.length > 0 ? (
        <ScrollReveal>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${k.bg} ${k.fg}`}>{k.icon}</span>
                <div className="min-w-0">
                  <div className="text-2xl font-semibold tabular-nums text-slate-900">{k.value}</div>
                  <div className="truncate text-xs text-muted-foreground">{k.label}</div>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      ) : null}

      <section className="space-y-3">
        <ScrollReveal>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Operación</h2>
        </ScrollReveal>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {operationModules.map((item, index) => (
            <ScrollReveal key={item.key} delay={index * 0.04}>
              {renderCard(item)}
            </ScrollReveal>
          ))}
        </div>
      </section>

      {adminModules.length > 0 ? (
        <section className="space-y-3">
          <ScrollReveal>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Administración &amp; Reportes</h2>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {adminModules.map((item, index) => (
              <ScrollReveal key={item.key} delay={index * 0.04}>
                {renderCard(item)}
              </ScrollReveal>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
