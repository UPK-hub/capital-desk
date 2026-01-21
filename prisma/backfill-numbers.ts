import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, code: true } });

  for (const t of tenants) {
    // asegura sequence
    await prisma.tenantSequence.upsert({
      where: { tenantId: t.id },
      create: { tenantId: t.id, nextCaseNo: 1, nextWorkOrderNo: 1 },
      update: {},
    });

    // CASES: asigna caseNo por createdAt asc
    const cases = await prisma.case.findMany({
      where: { tenantId: t.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    let c = 1;
    for (const row of cases) {
      await prisma.case.update({ where: { id: row.id }, data: { caseNo: c++ } });
    }

    // WORK ORDERS: asigna workOrderNo por createdAt asc
    const wos = await prisma.workOrder.findMany({
      where: { tenantId: t.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    let w = 1;
    for (const row of wos) {
      await prisma.workOrder.update({ where: { id: row.id }, data: { workOrderNo: w++ } });
    }

    // actualiza next*
    await prisma.tenantSequence.update({
      where: { tenantId: t.id },
      data: { nextCaseNo: c, nextWorkOrderNo: w },
    });

    console.log(`OK tenant ${t.code}: cases=${c - 1}, wos=${w - 1}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
