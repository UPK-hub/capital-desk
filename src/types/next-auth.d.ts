import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      role: "ADMIN" | "BACKOFFICE" | "TECHNICIAN";
      tenantId: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "BACKOFFICE" | "TECHNICIAN";
    tenantId: string;
  }
}
