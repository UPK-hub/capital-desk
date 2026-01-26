import { StsSlaPolicy, StsTicketEvent, StsTicketStatus } from "@prisma/client";

export type SlaResult = {
  responseMinutes: number | null;
  resolutionMinutes: number | null;
  breachResponse: boolean;
  breachResolution: boolean;
};

function diffMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildStatusTimeline(openedAt: Date, events: StsTicketEvent[]) {
  const timeline = [{ at: openedAt, status: StsTicketStatus.OPEN }];
  const sorted = [...events]
    .filter((e) => e.type === "STATUS_CHANGE" && e.status)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const ev of sorted) {
    timeline.push({ at: ev.createdAt, status: ev.status as StsTicketStatus });
  }
  return timeline;
}

function overlapMinutes(start: Date, end: Date, windows: { startAt: Date; endAt: Date }[]) {
  let total = 0;
  for (const w of windows) {
    const s = Math.max(start.getTime(), w.startAt.getTime());
    const e = Math.min(end.getTime(), w.endAt.getTime());
    if (e > s) total += Math.round((e - s) / 60000);
  }
  return total;
}

export function calcResolutionMinutes(
  openedAt: Date,
  endAt: Date | null,
  events: StsTicketEvent[],
  pauseStatuses: StsTicketStatus[],
  maintenanceWindows: { startAt: Date; endAt: Date }[] = []
) {
  if (!endAt) return null;
  const timeline = buildStatusTimeline(openedAt, events);
  let total = 0;

  for (let i = 0; i < timeline.length; i += 1) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    const segmentEnd = next ? next.at : endAt;
    if (segmentEnd.getTime() <= curr.at.getTime()) continue;
    if (pauseStatuses.includes(curr.status)) continue;
    const segmentMinutes = diffMinutes(curr.at, segmentEnd);
    const maintenanceMinutes = overlapMinutes(curr.at, segmentEnd, maintenanceWindows);
    total += Math.max(0, segmentMinutes - maintenanceMinutes);
  }

  return total;
}

export function calcSlaResult(params: {
  openedAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  events: StsTicketEvent[];
  policy: StsSlaPolicy | null;
  maintenanceWindows?: { startAt: Date; endAt: Date }[];
}) {
  if (!params.policy) {
    return {
      responseMinutes: null,
      resolutionMinutes: null,
      breachResponse: false,
      breachResolution: false,
    };
  }

  const pauseStatuses = (params.policy.pauseStatuses ?? []) as StsTicketStatus[];
  const responseMinutes = params.firstResponseAt
    ? diffMinutes(params.openedAt, params.firstResponseAt)
    : null;

  const endAt = params.closedAt ?? params.resolvedAt ?? null;
  const resolutionMinutes = calcResolutionMinutes(
    params.openedAt,
    endAt,
    params.events,
    pauseStatuses,
    params.maintenanceWindows ?? []
  );

  const breachResponse =
    responseMinutes !== null && responseMinutes > params.policy.responseMinutes;
  const breachResolution =
    resolutionMinutes !== null && resolutionMinutes > params.policy.resolutionMinutes;

  return {
    responseMinutes,
    resolutionMinutes,
    breachResponse,
    breachResolution,
  };
}

export function slaProgress(now: Date, openedAt: Date, limitMinutes: number) {
  const elapsed = diffMinutes(openedAt, now);
  const ratio = limitMinutes <= 0 ? 1 : elapsed / limitMinutes;
  return Math.min(1, Math.max(0, ratio));
}
