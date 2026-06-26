export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, Role } from "@prisma/client";
import { buildCaseAccessWhere } from "@/lib/access-control";
import { propagateCommentToGroup } from "@/lib/novedades/duplicates-server";

const ALLOWED = new Set<Role>([
  Role.ADMIN,
  Role.BACKOFFICE,
  Role.PLANNER,
  Role.SUPERVISOR,
  Role.TECHNICIAN,
]);

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED.has(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseId = String(ctx.params.id ?? "");

  const body = await req.json().catch(() => null);
  const comment = String(body?.comment ?? "").trim();
  if (comment.length < 2) {
    return NextResponse.json({ error: "Comentario requerido." }, { status: 400 });
  }

  const found = await prisma.case.findFirst({
    where: await buildCaseAccessWhere({ caseId, tenantId, role, capabilities, userId }),
    select: { id: true },
  });
  if (!found) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });

  const event = await prisma.caseEvent.create({
    data: {
      caseId: found.id,
      type: CaseEventType.COMMENT,
      message: comment,
      meta: { userId, manualComment: true },
    },
    select: { id: true, message: true, createdAt: true, meta: true },
  });

  // Si la novedad es parte de un grupo "mismo caso", la respuesta se carga
  // también a los demás miembros (principal y dependientes). No rompe el flujo.
  let propagated = 0;
  try {
    propagated = await propagateCommentToGroup(prisma, {
      tenantId,
      fromCaseId: found.id,
      message: comment,
      byUserId: userId,
      sourceEventId: event.id,
    });
  } catch (e) {
    console.error("COMMENT_PROPAGATE_FAILED", e);
  }

  return NextResponse.json({ ok: true, comment: event, propagated });
}
