const encoder = new TextEncoder();

/**
 * Lowercase hex HMAC-SHA256 of the trimmed, lowercased email: the same value as `hashEmail` in
 * scripts/legacy/hash.ts, written with Web Crypto because the Convex runtime has no node:crypto.
 */
export async function hashEmail(email: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
