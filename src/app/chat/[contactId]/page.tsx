import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DirectChat from "@/components/DirectChat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DirectContactChatPage({
  params,
}: {
  params: { contactId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No autenticado.</p>
          <Link className="underline" href="/login">
            Ir a login
          </Link>
        </div>
      </div>
    );
  }

  const tenantId = (session.user as any).tenantId as string;
  const currentUserId = (session.user as any).id as string;
  const contactId = String(params.contactId ?? "").trim();

  if (!contactId || contactId === currentUserId) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <div className="sts-card p-6">
          <p className="text-sm">Contacto inválido.</p>
          <Link className="mt-3 inline-flex text-sm underline" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const contact = await prisma.user.findFirst({
    where: {
      id: contactId,
      tenantId,
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!contact) {
    return (
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <div className="sts-card p-6">
          <p className="text-sm">No se encontró el contacto seleccionado.</p>
          <Link className="mt-3 inline-flex text-sm underline" href="/">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const existingThread = await prisma.directChatThread.findFirst({
    where: {
      tenantId,
      participants: { some: { userId: currentUserId } },
      AND: [{ participants: { some: { userId: contact.id } } }],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const threadId =
    existingThread?.id ??
    (
      await prisma.directChatThread.create({
        data: {
          tenantId,
          createdById: currentUserId,
          participants: {
            create: [{ userId: currentUserId }, { userId: contact.id }],
          },
        },
        select: { id: true },
      })
    ).id;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-2 py-3 sm:px-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">Mensajería directa</h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            Conversación con {contact.name}
          </p>
        </div>
        <Link className="sts-btn-ghost h-9 px-3 text-xs sm:text-sm" href="/">
          Volver
        </Link>
      </div>

      <DirectChat
        threadId={threadId}
        currentUserId={currentUserId}
        currentUserName={session.user?.name ?? "Usuario"}
        title={contact.name}
        subtitle={contact.email ?? contact.role}
      />
    </div>
  );
}

