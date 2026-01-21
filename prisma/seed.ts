// prisma/seed.ts
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const EQUIPMENT_TYPES = [
  "BO",
  "BFE",
  "BV1_1",
  "BV1_2",
  "BV1_3",
  "BV1_4",
  "BV2_1",
  "BV2_2",
  "BV3_1",
  "BV3_2",
  "BV3_3",
  "BV3_4",
  "BTE",
  "NVR",
  "Modulo 4G/5G",
  "Discos Duros",
] as const;

const BUSES_RAW = `
K1401
K1402
K1403
K1404
K1405
K1406
K1407
K1408
K1409
k1410
K1411
K1412
K1413
K1414
K1415
K1416
k1417
K1418
K1419
K1420
K1421
K1422
K1423
K1424
K1425
K1426
K1427
K1428
K1429
K1430
K1431
K1432
K1433
K1434
K1435
K1436
K1437
K1438
K1439
K1440
K1441
K1442
K1443
K1444
K1445
K1446
K1447
K1448
K1449
K1450
K1451
K1452
K1453
K1454
K1455
K1456
K1457
K1458
K1459
K1460
K1461
K1462
K1463
K1464
K1465
K1466
K1467
K1468
K1469
K1470
K1471
K1472
K1473
K1474
K1475
K1476
K1477
K1478
K1479
K1480
K1481
K1482
K1483
K1484
K1485
K1486
K1487
K1488
K1489
K1490
K1491
K1492
K1493
K1494
K1495
K1496
K1497
K1498
K1499
K1500
K1501
K1502
K1503
K1504
K1505
K1506
K1507
K1508
K1509
K1510
K1511
K1512
K1513
K1514
K1515
K1516
K1517
K1518
K1519
K1520
K1521
K1522
k1523
K1524
K1525
K1526
K1527
K1528
K1529
K1530
K1531
K1532
K1533
K1534
K1535
K1536
K1537
K1538
K1539
K1540
K1541
K1542
K1543
K1544
K1545
K1546
K1547
K1548
K1549
K1550
K1551
K1552
K1553
K1554
K1556
K1557
K1558
K1559
K1560
K1561
K1562
K1563
K1564
K1565
K1566
K1567
K1568
K1569
K1570
K1571
K1572
K1573
K1574
K1575
K1576
K1577
K1578
K1579
K1580
K1581
K1582
K1583
K1584
K1585
K1586
K1587
K1588
K1589
K1590
K1591
K1592
K1593
K1594
K1595
K1596
K1597
K1598
K1599
K1600
K1601
K1602
K1603
K1604
K1605
K1606
K1607
K1608
K1609
K1610
K1611
K1612
K1613
K1614
K1615
K1616
K1617
K1618
K1619
K1620
K1621
K1622
K1623
K1624
K1625
K1626
K1627
K1628
K1629
K1630
K1631
K1632
K1633
K1634
K1635
K1636
K1637
K1638
K1639
K1640
K1641
K1642
K1643
K1644
K1645
K1646
K1647
K1648
K1649
K1650
K1651
K1652
K1653
K1654
K1655
K1656
K1657
K1658
K1659
k1660
K1661
`;

function normalizeCode(s: string) {
  return s.trim().toUpperCase();
}

function parseBusesRaw(raw: string): string[] {
  const arr = raw
    .split(/\r?\n/)
    .map((s) => normalizeCode(s))
    .filter(Boolean);

  return Array.from(new Set(arr));
}

// CSV opcional: Placas.csv con columnas: code, plate (o BUS, PLACA)
function parsePlacasCsvIfExists(): Array<{ code: string; plate?: string | null }> | null {
  const candidates = ["Placas.csv", "placas.csv", "data/Placas.csv"];
  const file = candidates.map((p) => path.resolve(process.cwd(), p)).find((p) => fs.existsSync(p));
  if (!file) return null;

  const content = fs.readFileSync(file, "utf8");
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return null;

  // soporta separador , o ;
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  const codeIdx = header.findIndex((h) => ["code", "bus", "buscode", "biarticulado", "vehiculo"].includes(h));
  const plateIdx = header.findIndex((h) => ["plate", "placa"].includes(h));
  if (codeIdx === -1) return null;

  const out: Array<{ code: string; plate?: string | null }> = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(sep).map((c) => c.trim());
    const code = normalizeCode(cols[codeIdx] ?? "");
    if (!code) continue;
    const plate = plateIdx >= 0 ? (cols[plateIdx] ? cols[plateIdx] : null) : null;
    out.push({ code, plate });
  }

  const map = new Map<string, { code: string; plate?: string | null }>();
  for (const r of out) map.set(r.code, r); // ultima gana
  return Array.from(map.values());
}

async function upsertUser(args: { tenantId: string; name: string; email: string; role: Role; password: string }) {
  const email = args.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  const passwordHash = existing?.passwordHash ?? (await bcrypt.hash(args.password, 10));

  await prisma.user.upsert({
    where: { email },
    create: {
      tenantId: args.tenantId,
      name: args.name,
      email,
      role: args.role,
      passwordHash,
      active: true,
    },
    update: {
      tenantId: args.tenantId,
      name: args.name,
      role: args.role,
      active: true,
      // NO tocamos passwordHash para no resetear contraseñas en seed idempotente
    },
  });
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { code: "CAPITALBUS" },
    update: { name: "CAPITAL BUS" },
    create: { code: "CAPITALBUS", name: "CAPITAL BUS" },
  });

  // Secuencias por tenant (para CASE/OT visibles tipo 000123)
  await prisma.tenantSequence.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, nextCaseNo: 1, nextWorkOrderNo: 1 },
    update: {},
  });

  // Usuarios base
  await upsertUser({
    tenantId: tenant.id,
    name: "Admin",
    email: "admin@capitalbus.local",
    role: Role.ADMIN,
    password: "Admin1234*",
  });
  await upsertUser({
    tenantId: tenant.id,
    name: "Backoffice",
    email: "backoffice@capitalbus.local",
    role: Role.BACKOFFICE,
    password: "Backoffice1234*",
  });
  await upsertUser({
    tenantId: tenant.id,
    name: "Tecnico 1",
    email: "tecnico1@capitalbus.local",
    role: Role.TECHNICIAN,
    password: "Tecnico1234*",
  });

  // Equipment types
  for (const name of EQUIPMENT_TYPES) {
    await prisma.equipmentType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const types = await prisma.equipmentType.findMany({ where: { name: { in: [...EQUIPMENT_TYPES] } } });
  if (types.length !== EQUIPMENT_TYPES.length) {
    throw new Error(`EquipmentType incompleto. Esperados=${EQUIPMENT_TYPES.length}, encontrados=${types.length}`);
  }

  // Buses: preferir CSV si existe; si no, raw.
  const fromCsv = parsePlacasCsvIfExists();
  const buses = fromCsv ? fromCsv : parseBusesRaw(BUSES_RAW).map((code) => ({ code, plate: null }));

  // Upsert buses
  for (const b of buses) {
    await prisma.bus.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: b.code } },
      update: {
        active: true,
        ...(b.plate !== undefined ? { plate: b.plate } : {}),
      },
      create: {
        tenantId: tenant.id,
        code: b.code,
        plate: b.plate ?? null,
        active: true,
      },
    });
  }

  // Ensure baseline equipments per bus (crear faltantes sin duplicar)
  const allBuses = await prisma.bus.findMany({ where: { tenantId: tenant.id }, select: { id: true } });

  let createdEquipments = 0;
  for (const bus of allBuses) {
    const existing = await prisma.busEquipment.findMany({
      where: { busId: bus.id },
      select: { equipmentTypeId: true },
    });
    const existingSet = new Set(existing.map((e) => e.equipmentTypeId));

    for (const t of types) {
      if (existingSet.has(t.id)) continue;
      await prisma.busEquipment.create({
        data: { busId: bus.id, equipmentTypeId: t.id, active: true },
      });
      createdEquipments++;
    }
  }

  console.log("SEED OK", {
    tenant: tenant.code,
    busesUpserted: buses.length,
    totalBusesInDb: allBuses.length,
    equipmentTypes: types.length,
    createdEquipments,
    usingCsv: !!fromCsv,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
