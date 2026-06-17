import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { RBAC } from "@/lib/rbac";
import { CAPABILITIES } from "@/lib/capabilities";

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token?.role as string | undefined) ?? "BACKOFFICE";
    const capabilities = (req.nextauth.token as any)?.capabilities as string[] | undefined;
    const forcePasswordChange = Boolean((req.nextauth.token as any)?.forcePasswordChange);
    const path = req.nextUrl.pathname;

    const deny = () => NextResponse.redirect(new URL("/", req.url));
    const isBackoffice = role === "BACKOFFICE";
    const isRestrictedBackoffice =
      isBackoffice && capabilities?.includes(CAPABILITIES.BACKOFFICE_RESTRICTED);
    const isVideosOnly =
      isBackoffice && capabilities?.includes(CAPABILITIES.VIDEOS_ONLY);

    if (
      forcePasswordChange &&
      !path.startsWith("/profile") &&
      !path.startsWith("/login") &&
      !path.startsWith("/reset-password")
    ) {
      const url = new URL("/profile", req.url);
      url.searchParams.set("forcePasswordChange", "1");
      return NextResponse.redirect(url);
    }

    if (path.startsWith("/cases")) {
      // ITEM 5: los técnicos pueden ENTRAR solo al formulario de crear caso
      // (/cases/new), no al resto del módulo de casos (backoffice).
      const isTechnician = role === "TECHNICIAN";
      if (isTechnician) {
        if (path !== "/cases/new") return deny();
      } else {
        if (!RBAC.backofficeRoutes.includes(role as any)) return deny();
        // Videos-only can create/request video cases, but cannot browse full case module.
        if (isVideosOnly && path !== "/cases/new") return deny();
      }
    }
    if (path.startsWith("/novedades")) {
      if (!RBAC.backofficeRoutes.includes(role as any)) return deny();
      if (isVideosOnly) return deny();
    }
    if (path.startsWith("/video-requests")) {
      const canVideo = role === "ADMIN" || role === "BACKOFFICE" || role === "TECHNICIAN";
      if (!canVideo) return deny();
    }
    if (path.startsWith("/work-orders") && !RBAC.techRoutes.includes(role as any)) return deny();
    if (path.startsWith("/buses") && !RBAC.busesRoutes.includes(role as any)) return deny();
    if (path.startsWith("/technicians/shifts")) {
      if (!RBAC.shiftRoutes.includes(role as any)) return deny();
      if (isRestrictedBackoffice) return deny();
    }
    if (path.startsWith("/planner")) {
      const ok = RBAC.plannerRoutes.includes(role as any) || capabilities?.includes("PLANNER");
      if (!ok) return deny();
      if (isRestrictedBackoffice) return deny();
    }
    if (path.startsWith("/sts")) {
      const ok =
        RBAC.stsRoutes.includes(role as any) ||
        capabilities?.includes("STS_READ") ||
        capabilities?.includes("STS_WRITE") ||
        capabilities?.includes("STS_ADMIN");
      if (!ok) return deny();
    }
    if (path.startsWith("/tm")) {
      const ok =
        role === "ADMIN" ||
        (role === "BACKOFFICE" && capabilities?.includes(CAPABILITIES.TM_READ));
      if (!ok) return deny();
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        const isPublic =
          path === "/" ||
          path.startsWith("/login") ||
          path.startsWith("/reset-password") ||
          path.startsWith("/api/auth");
        if (isPublic) return true;
        return !!token && !(token as any).revoked;
      },
    },
  }
);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
