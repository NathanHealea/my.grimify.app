import { createHmac } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashEmail(email: string, key: string): string {
  return createHmac("sha256", key).update(normalizeEmail(email)).digest("hex");
}
