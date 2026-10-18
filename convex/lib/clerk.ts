type ClerkUser = {
  email_addresses: {
    email_address: string;
    verification: { status: string; strategy: string } | null;
  }[];
};

// The app signs in only by email code or link; an address an OAuth or SAML provider asserted isn't proof
// of ownership here. `admin` is an address the instance owner created as verified. Enabling another sign-in
// method means revisiting this (SECURITY.md).
const OWNERSHIP_STRATEGIES = new Set(["email_code", "email_link", "admin"]);

/**
 * The email addresses a Clerk user proved they own by email code or link, or an admin verified, read from Clerk's Backend API because the
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
    .filter(
      ({ verification }) =>
        verification?.status === "verified" && OWNERSHIP_STRATEGIES.has(verification.strategy),
    )
    .map((address) => address.email_address);
}
