import { NextRequest } from "next/server";

const IP_HEADERS = [
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "x-client-ip",
];

export function getClientIp(req: NextRequest): string {
  for (const header of IP_HEADERS) {
    const raw = req.headers.get(header);
    if (!raw) continue;

    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
