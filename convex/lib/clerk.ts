type ClerkUser = {
  email_addresses: { email_address: string; verification: { status: string } | null }[];
};

/**
 * The verified email addresses of a Clerk user, read from Clerk's Backend API because the
 * session token Convex receives carries no email (DECISIONS 059). Throws on a non-2xx response.
 */
export async function verifiedEmails(clerkUserId: string, secretKey: string): Promise<string[]> {
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  if (!response.ok) throw new Error(`Clerk user lookup failed with status ${response.status}`);
  const user = (await response.json()) as ClerkUser;
  return user.email_addresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.email_address);
}
