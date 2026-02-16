import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { RBAC } from "@/lib/rbac";

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token?.role as string | undefined) ?? "BACKOFFICE";
    const capabilities = (req.nextauth.token as any)?.capabilities as string[] | undefined;
    const path = req.nextUrl.pathname;

    const deny = () => NextResponse.redirect(new URL("/", req.url));

    if (path.startsWith("/cases") && !RBAC.backofficeRoutes.includes(role as any)) return deny();
    if (path.startsWith("/work-orders") && !RBAC.techRoutes.includes(role as any)) return deny();
    if (path.startsWith("/buses") && !RBAC.busesRoutes.includes(role as any)) return deny();
    if (path.startsWith("/planner")) {
      const ok = RBAC.plannerRoutes.includes(role as any) || capabilities?.includes("PLANNER");
      if (!ok) return deny();
    }
    if (path.startsWith("/sts")) {
      const ok =
        RBAC.stsRoutes.includes(role as any) ||
        capabilities?.includes("STS_READ") ||
        capabilities?.includes("STS_WRITE") ||
        capabilities?.includes("STS_ADMIN");
      if (!ok) return deny();
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/api/auth");
        if (isPublic) return true;
        return !!token && !(token as any).revoked;
      },
    },
  }
);

export const config = {
  matcher: ["/cases/:path*", "/work-orders/:path*", "/buses/:path*", "/planner/:path*", "/sts/:path*"],
};
