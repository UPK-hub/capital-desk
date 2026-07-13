export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CaseEventType, Role } from "@prisma/client";
import { buildCaseAccessWhere } from "@/lib/access-control";
import { propagateCommentToGroup } from "@/lib/novedades/duplicates-server";
import { saveUpload } from "@/lib/uploads";

const ALLOWED = new Set<Role>([
  Role.ADMIN,
  Role.BACKOFFICE,
  Role.PLANNER,
  Role.SUPERVISOR,
  Role.TECHNICIAN,
]);

type Attachment = { filePath: string; fileName: string; mimeType: string; size: number };
const MAX_FILES = 20;
// Sin límite de tamaño: se permite cargar archivos de cualquier peso.

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const role = (session.user as any).role as Role;
  if (!ALLOWED.has(role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const tenantId = (session.user as any).tenantId as string;
  const capabilities = (session.user as any).capabilities as string[] | undefined;
  const userId = String((session.user as any).id ?? "");
  const caseId = String(ctx.params.id ?? "");

  // Acepta JSON (solo texto) o multipart/form-data (texto + fotos/archivos).
  let comment = "";
  const files: File[] = [];
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (form) {
      comment = String(form.get("comment") ?? "").trim();
      for (const f of form.getAll("files")) {
        if (f instanceof File && f.size > 0) files.push(f);
      }
    }
  } else {
    const body = await req.json().catch(() => null);
    comment = String(body?.comment ?? "").trim();
  }

  if (comment.length < 2 && files.length === 0) {
    return NextResponse.json({ error: "Escribe un comentario o adjunta una imagen." }, { status: 400 });
  }

  const found = await prisma.case.findFirst({
    where: await buildCaseAccessWhere({ caseId, tenantId, role, capabilities, userId }),
    select: { id: true },
  });
  if (!found) return NextResponse.json({ error: "Caso no encontrado." }, { status: 404 });

  // Guardar adjuntos (imágenes / PDF). No bloquea si una falla.
  const attachments: Attachment[] = [];
  const skipped: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    try {
      const filePath = await saveUpload(file, `comentarios/${found.id}`, { fileNamePrefix: "cmt" });
      attachments.push({
        filePath,
        fileName: file.name || "archivo",
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      });
    } catch (e) {
      console.error("COMMENT_UPLOAD_FAILED", e);
      skipped.push(file.name || "archivo");
    }
  }

  if (comment.length < 2 && attachments.length === 0) {
    return NextResponse.json(
      { error: "No se pudo subir el archivo. Inténtalo de nuevo." },
      { status: 400 }
    );
  }

  const message = comment || "📎 Evidencia adjunta";

  const event = await prisma.caseEvent.create({
    data: {
      caseId: found.id,
      type: CaseEventType.COMMENT,
      message,
      meta: { userId, manualComment: true, ...(attachments.length ? { attachments } : {}) },
    },
    select: { id: true, message: true, createdAt: true, meta: true },
  });

  // Si la novedad es parte de un grupo "mismo caso", la respuesta (texto + adjuntos)
  // se carga también a los demás miembros. No rompe el flujo.
  let propagated = 0;
  try {
    propagated = await propagateCommentToGroup(prisma, {
      tenantId,
      fromCaseId: found.id,
      message,
      byUserId: userId,
      sourceEventId: event.id,
      attachments,
    });
  } catch (e) {
    console.error("COMMENT_PROPAGATE_FAILED", e);
  }

  return NextResponse.json({ ok: true, comment: event, attachments, skipped, propagated });
}
