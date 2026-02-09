import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type TempUser = {
  name: string;
  email: string;
};

const TEMP_PASSWORD = "Ada1234**";

const TECHS: TempUser[] = [
  { name: "Jose Caicedo", email: "jose.caicedo@upk.local" },
  { name: "Francisco Taborda", email: "francisco.taborda@upk.local" },
  { name: "Felipe Moreno", email: "felipe.moreno@upk.local" },
  { name: "José Domingo Pabon", email: "jose.domingo.pabon@upk.local" },
  { name: "Diego Hernández", email: "diego.hernandez@upk.local" },
  { name: "Anderson Rueda", email: "anderson.rueda@upk.local" },
  { name: "Jose Daniel Pulido", email: "jose.daniel.pulido@upk.local" },
];

async function resolveTenantId() {
  const fromEnv = process.env.TENANT_ID?.trim();
  if (fromEnv) return fromEnv;

  const tenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!tenant) {
    throw new Error("No tenant found. Set TENANT_ID in your environment.");
  }

  return tenant.id;
}

async function main() {
  const tenantId = await resolveTenantId();
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, 10);

  const results = [];
  for (const tech of TECHS) {
    const user = await prisma.user.upsert({
      where: { email: tech.email.toLowerCase() },
      update: {
        name: tech.name,
        role: Role.TECHNICIAN,
        active: true,
        passwordHash,
        tenantId,
      },
      create: {
        tenantId,
        name: tech.name,
        email: tech.email.toLowerCase(),
        role: Role.TECHNICIAN,
        active: true,
        passwordHash,
      },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    results.push(user);
  }

  console.log("Temporary technicians ready:");
  for (const user of results) {
    console.log(`- ${user.name} (${user.email}) [${user.role}]`);
  }
  console.log(`Password set to: ${TEMP_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to create temporary technicians:", error);
    process.exit(1);
  });
