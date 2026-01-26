import assert from "node:assert/strict";
import { StsTicketStatus } from "@prisma/client";
import { calcResolutionMinutes, calcSlaResult } from "./sla";

const openedAt = new Date("2026-01-10T08:00:00Z");

const events = [
  {
    id: "1",
    ticketId: "t1",
    type: "STATUS_CHANGE",
    status: StsTicketStatus.IN_PROGRESS,
    createdAt: new Date("2026-01-10T09:00:00Z"),
  },
  {
    id: "2",
    ticketId: "t1",
    type: "STATUS_CHANGE",
    status: StsTicketStatus.WAITING_VENDOR,
    createdAt: new Date("2026-01-10T10:00:00Z"),
  },
  {
    id: "3",
    ticketId: "t1",
    type: "STATUS_CHANGE",
    status: StsTicketStatus.IN_PROGRESS,
    createdAt: new Date("2026-01-10T12:00:00Z"),
  },
] as any;

const endAt = new Date("2026-01-10T13:00:00Z");

const resolution = calcResolutionMinutes(openedAt, endAt, events, [StsTicketStatus.WAITING_VENDOR]);
assert.equal(resolution, 4 * 60 - 2 * 60, "Resolution should exclude pause window");

const sla = calcSlaResult({
  openedAt,
  firstResponseAt: new Date("2026-01-10T08:20:00Z"),
  resolvedAt: endAt,
  closedAt: null,
  events,
  policy: {
    id: "p1",
    tenantId: "t",
    componentId: "c",
    severity: "HIGH" as any,
    responseMinutes: 15,
    resolutionMinutes: 120,
    pauseStatuses: [StsTicketStatus.WAITING_VENDOR],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any,
});

assert.equal(sla.breachResponse, true, "Response breach expected");
assert.equal(sla.breachResolution, false, "Resolution should not breach");

console.log("sla.test ok");
