import crypto from "crypto";

export function generateRawToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

export function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
