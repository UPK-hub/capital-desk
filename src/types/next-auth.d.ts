import NextAuth from "next-auth";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      role: "ADMIN" | "BACKOFFICE" | "TECHNICIAN";
      tenantId: string;
      capabilities: string[];
      sessionVersion: number;
      forcePasswordChange: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "ADMIN" | "BACKOFFICE" | "TECHNICIAN";
    tenantId: string;
    capabilities?: string[];
    sessionVersion?: number;
    forcePasswordChange?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "BACKOFFICE" | "TECHNICIAN";
    tenantId?: string;
    capabilities?: string[];
    sessionVersion?: number;
    forcePasswordChange?: boolean;
    revoked?: boolean;
  }
}
