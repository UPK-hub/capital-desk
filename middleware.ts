import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { RBAC } from "@/lib/rbac";

export default withAuth(
  function middleware(req) {
    const role = (req.nextauth.token?.role as string | undefined) ?? "BACKOFFICE";
    const path = req.nextUrl.pathname;

    const deny = () => NextResponse.redirect(new URL("/", req.url));

    if (path.startsWith("/cases") && !RBAC.backofficeRoutes.includes(role as any)) return deny();
    if (path.startsWith("/work-orders") && !RBAC.techRoutes.includes(role as any)) return deny();
    if (path.startsWith("/buses") && !RBAC.busesRoutes.includes(role as any)) return deny();

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        const isPublic = path === "/" || path.startsWith("/login") || path.startsWith("/api/auth");
        if (isPublic) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/cases/:path*", "/work-orders/:path*", "/buses/:path*"],
};
