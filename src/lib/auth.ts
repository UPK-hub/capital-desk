import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type AuthToken = {
  id?: string;
  role?: string;
  tenantId?: string;
  capabilities?: string[];
  sessionVersion?: number;
  revoked?: boolean;
};

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tenantId: true,
            capabilities: true,
            active: true,
            passwordHash: true,
            sessionVersion: true,
          },
        });

        if (!user || !user.active) return null;

        // ✅ Si no tiene passwordHash aún, no puede loguear
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          capabilities: user.capabilities ?? [],
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      const authToken = token as typeof token & AuthToken;

      if (user) {
        authToken.id = (user as any).id;
        authToken.role = (user as any).role;
        authToken.tenantId = (user as any).tenantId;
        authToken.capabilities = (user as any).capabilities ?? [];
        authToken.sessionVersion = Number((user as any).sessionVersion ?? 0);
        authToken.revoked = false;
      }

      if (!authToken.id) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: authToken.id },
        select: {
          id: true,
          role: true,
          tenantId: true,
          capabilities: true,
          active: true,
          sessionVersion: true,
        },
      });

      if (!dbUser || !dbUser.active) {
        authToken.revoked = true;
        return token;
      }

      const tokenVersion =
        typeof authToken.sessionVersion === "number"
          ? authToken.sessionVersion
          : dbUser.sessionVersion;

      if (tokenVersion !== dbUser.sessionVersion) {
        authToken.revoked = true;
        return token;
      }

      authToken.revoked = false;
      authToken.role = dbUser.role;
      authToken.tenantId = dbUser.tenantId;
      authToken.capabilities = dbUser.capabilities ?? [];
      authToken.sessionVersion = dbUser.sessionVersion;

      return token;
    },

    async session({ session, token }) {
      const authToken = token as typeof token & AuthToken;

      if (!session.user || authToken.revoked || !authToken.id) {
        return { ...session, user: undefined as any };
      }

      (session.user as any).id = authToken.id;
      (session.user as any).role = authToken.role as string;
      (session.user as any).tenantId = authToken.tenantId as string;
      (session.user as any).capabilities = authToken.capabilities ?? [];
      (session.user as any).sessionVersion = authToken.sessionVersion ?? 0;

      return session;
    },
  },

  pages: { signIn: "/login" },
};
