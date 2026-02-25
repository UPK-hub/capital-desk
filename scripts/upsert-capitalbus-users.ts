import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const CAPABILITIES = {
  STS_READ: "STS_READ",
  TM_READ: "TM_READ",
  BACKOFFICE_RESTRICTED: "BACKOFFICE_RESTRICTED",
  VIDEOS_ONLY: "VIDEOS_ONLY",
  OWN_CASES_ONLY: "OWN_CASES_ONLY",
} as const;

type ModuleScope = "TODOS" | "VIDEOS";

type UserSeed = {
  name: string;
  email: string;
  roleLabel: string;
  modules: ModuleScope;
};

const USERS: UserSeed[] = [
  { name: "Juanita Espejo", email: "juanita.espejo@capitalbus.co", roleLabel: "Director Operaciones", modules: "TODOS" },
  { name: "Fabian Molina", email: "fabian.llanos@capitalbus.co", roleLabel: "Profesional seguridad operacional", modules: "VIDEOS" },
  { name: "Sonia Rincon", email: "sonia.rincon@capitalbus.co", roleLabel: "Jefe operaciones", modules: "VIDEOS" },
  { name: "Lina Portela", email: "lina.portela@capitalbus.co", roleLabel: "Profesional Operaciones", modules: "VIDEOS" },
  { name: "Diana Gonzalez", email: "asistente.sts@capitalbus.com.co", roleLabel: "Supervisor de patio-Asistente STS", modules: "TODOS" },
  { name: "Laura Rodriguez", email: "laura.rodriguez@capitalbus.co", roleLabel: "Profesional STS", modules: "TODOS" },
  { name: "Leonel Martinez", email: "leonel.martinez@capitalbus.co", roleLabel: "Profesional Análisis de datos", modules: "VIDEOS" },
  { name: "Karen Villamil", email: "karen.villamil@capitalbus.co", roleLabel: "Analista Seguridad operacional", modules: "VIDEOS" },
  { name: "Ronal Viuche", email: "ronal.viuche@capitalbus.co", roleLabel: "Supervisor SEGOPE", modules: "VIDEOS" },
  { name: "Jhon Galindo", email: "jhon.galindo@capitalbus.co", roleLabel: "Supervisor SEGOPE", modules: "VIDEOS" },
  { name: "Catherine Paez", email: "catherine.paez@capitalbus.co", roleLabel: "Supervisor SEGOPE", modules: "VIDEOS" },
  { name: "Luisa Laverde", email: "luisa.laverde@capitalbus.co", roleLabel: "Supervisor SEGOPE", modules: "VIDEOS" },
  { name: "Eliana Hernandez", email: "eliana.hernandez@capitalbus.co", roleLabel: "Supervisor SEGOPE", modules: "VIDEOS" },
];

function getArg(name: string) {
  const exact = process.argv.find((v) => v.startsWith(`${name}=`));
  return exact ? exact.split("=").slice(1).join("=") : undefined;
}

function capabilitiesFor(scope: ModuleScope): string[] {
  const base = [
    CAPABILITIES.BACKOFFICE_RESTRICTED,
    CAPABILITIES.OWN_CASES_ONLY,
  ];
  if (scope === "TODOS") {
    return [...base, CAPABILITIES.STS_READ, CAPABILITIES.TM_READ];
  }
  return [...base, CAPABILITIES.VIDEOS_ONLY];
}

async function main() {
  const tenantCode = String(getArg("--tenant") ?? "CAPITALBUS").trim().toUpperCase();
  const passwordArg = getArg("--password");
  const apply = process.argv.includes("--apply");

  const tenant = await prisma.tenant.findFirst({
    where: { code: { equals: tenantCode, mode: "insensitive" } },
    select: { id: true, code: true },
  });
  if (!tenant) {
    throw new Error(`Tenant no encontrado para code=${tenantCode}`);
  }

  const passwordHash =
    passwordArg && passwordArg.trim().length >= 8
      ? await bcrypt.hash(passwordArg.trim(), 10)
      : null;

  let created = 0;
  let updated = 0;
  let skippedTenantMismatch = 0;

  for (const row of USERS) {
    const email = row.email.trim().toLowerCase();
    const caps = capabilitiesFor(row.modules);
    const name = row.name.trim();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true, passwordHash: true, capabilities: true },
    });

    if (!apply) {
      const action = existing ? "UPDATE" : "CREATE";
      console.log(`[DRY] ${action} ${email} -> ${row.modules} caps=${caps.join(",")}`);
      continue;
    }

    if (existing && existing.tenantId !== tenant.id) {
      skippedTenantMismatch += 1;
      console.log(`[SKIP] ${email} pertenece a otro tenant (${existing.tenantId})`);
      continue;
    }

    if (existing) {
      const data: any = {
        name,
        role: Role.BACKOFFICE,
        active: true,
        capabilities: caps,
      };
      if (!existing.passwordHash && passwordHash) {
        data.passwordHash = passwordHash;
      }
      await prisma.user.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
      console.log(`[OK] actualizado ${email}`);
    } else {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          name,
          email,
          role: Role.BACKOFFICE,
          active: true,
          capabilities: caps,
          passwordHash,
        },
      });
      created += 1;
      console.log(`[OK] creado ${email}`);
    }
  }

  console.log("=== Resultado ===");
  console.log(`Tenant: ${tenant.code}`);
  console.log(`Modo apply: ${apply ? "SI" : "NO (dry-run)"}`);
  console.log(`Creados: ${created}`);
  console.log(`Actualizados: ${updated}`);
  console.log(`Saltados por tenant distinto: ${skippedTenantMismatch}`);
}

main()
  .catch((error) => {
    console.error("Error al cargar usuarios CapitalBus:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
